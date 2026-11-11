import threading

from app.god.client import GodError
from app.god.mock import simulate
from app.models import Experiment

CONFIG = {"name": "기본", "turns": 5, "sensor_error": 0.1, "drop_rate": 0.1, "flip_rate": 0.0,
          "byzantine_count": 1, "seed": 42}


def create(client, **overrides):
    response = client.post("/experiments", json={**CONFIG, **overrides})
    assert response.status_code == 202, response.text
    return response.json()


# ---------- 생성·상태 ----------

def test_create_runs_in_background_and_completes(client):
    created = create(client)
    assert created["status"] == "pending"
    assert created["config"]["seed"] == 42
    assert created["completed_turns"] == 0

    # TestClient는 백그라운드 작업을 응답 직후 끝까지 실행한다
    exp = client.get(f"/experiments/{created['id']}").json()
    assert exp["status"] == "completed"
    assert exp["completed_turns"] == 5
    assert exp["n_cities"] == 5
    assert len(exp["byzantine_ids"]) == 1
    assert 0.0 <= exp["mean_accuracy"] <= 1.0
    assert exp["created_at"].endswith("Z")


def test_defaults_are_applied(client):
    response = client.post("/experiments", json={})
    assert response.status_code == 202
    assert response.json()["config"] == {"turns": 10, "sensor_error": 0.1, "drop_rate": 0.0,
                                         "flip_rate": 0.0, "byzantine_count": 1, "seed": None}


def test_rejects_out_of_range_values(client):
    for bad in [{"turns": 0}, {"turns": 21}, {"drop_rate": 1.5}, {"sensor_error": -0.1},
                {"flip_rate": 2}, {"byzantine_count": -1}, {"byzantine_count": 6}, {"name": "x" * 51}]:
        assert client.post("/experiments", json={**CONFIG, **bad}).status_code == 422, bad


def test_all_cities_can_be_byzantine(client):
    # 정확도에 비잔틴 도시도 포함하므로 5곳 모두 비잔틴이어도 계산 가능
    exp_id = create(client, byzantine_count=5)["id"]
    exp = client.get(f"/experiments/{exp_id}").json()
    assert exp["status"] == "completed"
    assert exp["byzantine_ids"] == [1, 2, 3, 4, 5]


def test_list_is_newest_first(client):
    first, second = create(client, name="a"), create(client, name="b")
    body = client.get("/experiments").json()
    assert [e["id"] for e in body] == [second["id"], first["id"]]
    assert body[0]["completed_turns"] == 5
    assert len(client.get("/experiments", params={"limit": 1}).json()) == 1


def test_unknown_experiment_is_404(client):
    assert client.get("/experiments/999").status_code == 404
    assert client.get("/experiments/999/turns").status_code == 404


# ---------- 동시 실행 거절 ----------

def test_rejects_new_experiment_while_one_is_running(client):
    # 실행 중(running)이거나 대기 중(pending)인 실험이 있으면 409, 새 실험은 만들지 않는다
    for state in ("running", "pending"):
        active_id = running_experiment(client, status=state)
        response = client.post("/experiments", json=CONFIG)
        assert response.status_code == 409, state
        assert str(active_id) in response.json()["detail"]
        assert [e["id"] for e in client.get("/experiments").json()] == [active_id]
        with client.app.state.session_factory() as s:
            s.delete(s.get(Experiment, active_id))
            s.commit()


def test_finished_experiments_do_not_block(client):
    # 완료·실패한 실험은 막지 않는다
    create(client)
    assert client.get("/experiments").json()[0]["status"] == "completed"
    with client.app.state.session_factory() as s:
        s.get(Experiment, 1).status = "failed"
        s.commit()
    assert client.post("/experiments", json=CONFIG).status_code == 202


def test_second_request_during_real_run_is_rejected(make_client):
    # 실제 엔진처럼 /run이 오래 걸리는 동안 두 번째 요청이 오면 거절되고, 끝난 뒤에는 다시 받는다
    started, release = threading.Event(), threading.Event()

    def slow_god(payload):
        started.set()
        assert release.wait(5)
        return {"ok": True, "turns": list(simulate(payload, 5))}

    with make_client(run_god=slow_god) as client:
        first = threading.Thread(target=create, args=(client,))
        first.start()
        assert started.wait(5)
        try:
            assert client.post("/experiments", json=CONFIG).status_code == 409
        finally:
            release.set()
            first.join(5)
        assert client.get("/experiments/1").json()["status"] == "completed"
        assert client.post("/experiments", json=CONFIG).status_code == 202


# ---------- 결과 조회 ----------

def test_turns_summary(client):
    exp_id = create(client)["id"]
    body = client.get(f"/experiments/{exp_id}/turns").json()
    assert [t["turn"] for t in body["turns"]] == [1, 2, 3, 4, 5]
    assert all(t["truth"] in ("danger", "safe") for t in body["turns"])
    mean = client.get(f"/experiments/{exp_id}").json()["mean_accuracy"]
    assert abs(sum(t["accuracy"] for t in body["turns"]) / 5 - mean) < 1e-9


def test_turn_detail_matches_engine_format(client):
    exp_id = create(client)["id"]
    body = client.get(f"/experiments/{exp_id}/turns/3").json()
    assert body["turn"] == 3
    assert [c["city"] for c in body["cities"]] == [1, 2, 3, 4, 5]
    assert set(body["cities"][0]) == {"city", "is_byzantine", "hint", "from_left", "from_right",
                                      "decision", "to_left", "to_right", "correct"}
    answer = {"danger": "evacuate", "safe": "stay"}[body["truth"]]
    for c in body["cities"]:
        assert c["correct"] == (c["decision"] == answer)
    assert client.get(f"/experiments/{exp_id}/turns/99").status_code == 404


def test_api_computes_accuracy_when_engine_omits_it(make_client):
    def god(payload):
        turns = list(simulate(payload, 5))
        for t in turns:
            del t["accuracy"]
        return {"ok": True, "turns": turns}

    with make_client(run_god=god) as client:
        exp_id = create(client)["id"]
        expected = [t["accuracy"] for t in simulate({**CONFIG, "experiment_id": exp_id}, 5)]
        got = [t["accuracy"] for t in client.get(f"/experiments/{exp_id}/turns").json()["turns"]]
        assert got == expected


# ---------- 엔진 → API 턴 전송 ----------

def test_engine_pushes_turns_then_run_returns(make_client):
    """실제 엔진 방식: /run 도중 턴마다 /internal/... 로 보내고, 다 끝나면 /run이 {"ok": true}로 응답."""
    holder = {}

    def god(payload):
        for t in simulate(payload, 5):
            r = holder["client"].post(f"/internal/experiments/{payload['experiment_id']}/turns", json=t)
            assert r.status_code == 200, r.text
        return {"ok": True}

    with make_client(run_god=god) as client:
        holder["client"] = client
        exp_id = create(client)["id"]
        exp = client.get(f"/experiments/{exp_id}").json()
        assert exp["status"] == "completed", exp["error"]
        assert exp["completed_turns"] == 5


def running_experiment(client, turns=3, status="running"):
    with client.app.state.session_factory() as s:
        exp = Experiment(turns=turns, sensor_error=0, drop_rate=0, flip_rate=0, byzantine_count=1,
                         n_cities=5, status=status)
        s.add(exp)
        s.commit()
        return exp.id


def test_receive_turn_validation(client):
    exp_id = running_experiment(client, turns=3)
    turns = list(simulate({**CONFIG, "turns": 3}, 5))
    url = f"/internal/experiments/{exp_id}/turns"

    assert client.post(url, json=turns[0]).json() == {"ok": True, "experiment_id": exp_id, "turn": 1}
    assert client.post(url, json=turns[0]).status_code == 409                       # 같은 턴 두 번
    assert client.post(url, json={**turns[1], "turn": 4}).status_code == 422        # 설정한 턴 수 초과
    assert client.post(url, json={**turns[1], "truth": "maybe"}).status_code == 422  # 값 형식 오류
    dup = {**turns[1], "cities": turns[1]["cities"] + turns[1]["cities"][:1]}
    assert client.post(url, json=dup).status_code == 422                            # 도시 중복
    assert client.post("/internal/experiments/999/turns", json=turns[1]).status_code == 404
    assert client.get(f"/experiments/{exp_id}").json()["completed_turns"] == 1      # 진행률


def test_receive_turn_rejected_when_not_running(client):
    exp_id = create(client)["id"]  # 이미 completed
    turn = next(simulate({**CONFIG, "turns": 1}, 5))
    assert client.post(f"/internal/experiments/{exp_id}/turns", json=turn).status_code == 409


# ---------- 실패 처리 ----------

def test_god_error_marks_failed(make_client):
    def god(payload):
        raise GodError("God 연결 실패: connection refused")

    with make_client(run_god=god) as client:
        exp_id = create(client)["id"]
        exp = client.get(f"/experiments/{exp_id}").json()
        assert exp["status"] == "failed"
        assert "connection refused" in exp["error"]
        assert client.get(f"/experiments/{exp_id}/turns").status_code == 409


def test_missing_turns_marks_failed(make_client):
    with make_client(run_god=lambda p: {"ok": True, "turns": list(simulate(p, 5))[:3]}) as client:
        exp_id = create(client)["id"]
        exp = client.get(f"/experiments/{exp_id}").json()
        assert exp["status"] == "failed"
        assert "3/5" in exp["error"]


def test_malformed_engine_response_marks_failed(make_client):
    with make_client(run_god=lambda p: {"turns": [{"turn": 1, "truth": "oops"}]}) as client:
        exp_id = create(client)["id"]
        exp = client.get(f"/experiments/{exp_id}").json()
        assert exp["status"] == "failed"
        assert "형식 오류" in exp["error"]


def test_interrupted_runs_are_marked_failed_on_restart(make_client):
    with make_client() as client:
        running_experiment(client)
    with make_client() as client:  # 같은 DB로 서버 재시작
        exp = client.get("/experiments").json()[0]
        assert exp["status"] == "failed"
        assert "재시작" in exp["error"]


# ---------- 비교 ----------

def test_compare_two_experiments(client):
    a, b = create(client, byzantine_count=0)["id"], create(client, byzantine_count=2)["id"]
    body = client.get("/experiments/compare", params={"ids": [a, b]}).json()
    assert [e["id"] for e in body["experiments"]] == [a, b]
    assert body["experiments"][1]["config"]["byzantine_count"] == 2
    assert len(body["experiments"][0]["accuracy"]) == 5


def test_compare_validation(make_client):
    with make_client() as client:
        a = create(client)["id"]
        assert client.get("/experiments/compare", params={"ids": [a]}).status_code == 422
        assert client.get("/experiments/compare", params={"ids": [a, a]}).status_code == 422
        assert client.get("/experiments/compare", params={"ids": [a, 999]}).status_code == 404

    with make_client(run_god=lambda p: (_ for _ in ()).throw(GodError("down"))) as client:
        failed = create(client)["id"]
        assert client.get("/experiments/compare", params={"ids": [a, failed]}).status_code == 409


def test_same_seed_gives_same_results(client):
    a, b = create(client)["id"], create(client)["id"]
    def detail(i):
        return client.get(f"/experiments/{i}/turns/5").json()["cities"]
    assert detail(a) == detail(b)


def test_cors_allows_frontend_dev_server(client):
    response = client.options("/experiments", headers={"Origin": "http://localhost:5173",
                                                       "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
