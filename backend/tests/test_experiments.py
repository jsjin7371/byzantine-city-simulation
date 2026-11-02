from app.god.client import GodError
from app.god.mock import run_mock

CONFIG = {"name": "기본", "turns": 5, "sensor_error_rate": 0.1, "drop_rate": 0.1, "tamper_rate": 0.0,
          "byzantine_count": 1, "algorithm": "majority", "seed": 42}


def create(client, **overrides):
    response = client.post("/experiments", json={**CONFIG, **overrides})
    assert response.status_code == 202, response.text
    return response.json()


# ---------- 생성·상태 ----------

def test_create_runs_in_background_and_completes(client):
    created = create(client)
    assert created["status"] == "pending"
    assert created["config"]["seed"] == 42

    # TestClient는 백그라운드 작업을 응답 직후 끝까지 실행한다
    exp = client.get(f"/experiments/{created['id']}").json()
    assert exp["status"] == "completed"
    assert exp["n_cities"] == 5
    assert len(exp["byzantine_ids"]) == 1
    assert 0.0 <= exp["mean_accuracy"] <= 1.0
    assert exp["created_at"].endswith("Z")
    assert exp["finished_at"] is not None


def test_defaults_are_applied(client):
    response = client.post("/experiments", json={})
    assert response.status_code == 202
    assert response.json()["config"] == {"turns": 20, "sensor_error_rate": 0.1, "drop_rate": 0.0,
                                         "tamper_rate": 0.0, "byzantine_count": 1,
                                         "algorithm": "majority", "seed": None}


def test_rejects_out_of_range_values(client):
    for bad in [{"turns": 0}, {"turns": 101}, {"drop_rate": 1.5}, {"sensor_error_rate": -0.1},
                {"byzantine_count": -1}, {"name": "x" * 51}]:
        assert client.post("/experiments", json={**CONFIG, **bad}).status_code == 422, bad


def test_rejects_too_many_byzantine_cities(client):
    # 정상 도시가 하나도 없으면 정확도를 계산할 수 없다
    assert client.post("/experiments", json={**CONFIG, "byzantine_count": 5}).status_code == 422
    assert client.post("/experiments", json={**CONFIG, "byzantine_count": 4}).status_code == 202


def test_list_is_newest_first(client):
    first, second = create(client, name="a"), create(client, name="b")
    ids = [e["id"] for e in client.get("/experiments").json()]
    assert ids == [second["id"], first["id"]]
    assert len(client.get("/experiments", params={"limit": 1}).json()) == 1


def test_unknown_experiment_is_404(client):
    assert client.get("/experiments/999").status_code == 404
    assert client.get("/experiments/999/turns").status_code == 404


# ---------- 결과 조회 ----------

def test_turns_summary(client):
    exp_id = create(client)["id"]
    body = client.get(f"/experiments/{exp_id}/turns").json()
    assert [t["turn"] for t in body["turns"]] == [1, 2, 3, 4, 5]
    assert all(t["truth"] in ("evacuate", "stay") for t in body["turns"])
    mean = client.get(f"/experiments/{exp_id}").json()["mean_accuracy"]
    assert abs(sum(t["accuracy"] for t in body["turns"]) / 5 - mean) < 1e-9


def test_turn_detail_shows_cities_and_received_messages(client):
    exp_id = create(client)["id"]
    body = client.get(f"/experiments/{exp_id}/turns/3").json()
    assert body["turn"] == 3
    assert [c["city_id"] for c in body["cities"]] == [1, 2, 3, 4, 5]
    city = body["cities"][0]
    assert [m["from"] for m in city["received"]] == [2, 3, 4, 5]
    assert set(city["received"][0]) == {"from", "value", "dropped", "tampered"}
    for c in body["cities"]:
        assert c["correct"] == (c["decision"] == body["truth"])
    assert client.get(f"/experiments/{exp_id}/turns/99").status_code == 404


def test_accuracy_counts_only_honest_cities(make_client):
    def god(payload):
        cities = [
            {"city_id": 1, "is_byzantine": False, "sensor": "danger", "decision": "evacuate", "broadcast": "evacuate"},
            {"city_id": 2, "is_byzantine": False, "sensor": "safe", "decision": "stay", "broadcast": "stay"},
            {"city_id": 3, "is_byzantine": True, "sensor": "danger", "decision": "stay", "broadcast": "stay"},
        ]
        return {"n_cities": 3, "byzantine_ids": [3],
                "turns": [{"turn": 1, "truth": "evacuate", "cities": cities, "messages": []}]}

    with make_client(run_god=god) as client:
        exp_id = create(client, turns=1)["id"]
        assert client.get(f"/experiments/{exp_id}/turns").json()["turns"][0]["accuracy"] == 0.5


def test_engine_accuracy_is_used_when_given(make_client):
    def god(payload):
        result = run_mock(payload, 5)
        for t in result["turns"]:
            t["accuracy"] = 0.25
        return result

    with make_client(run_god=god) as client:
        exp_id = create(client)["id"]
        assert client.get(f"/experiments/{exp_id}").json()["mean_accuracy"] == 0.25


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


def test_malformed_god_response_marks_failed(make_client):
    with make_client(run_god=lambda payload: {"turns": "oops"}) as client:
        exp_id = create(client)["id"]
        exp = client.get(f"/experiments/{exp_id}").json()
        assert exp["status"] == "failed"
        assert "형식 오류" in exp["error"]


def test_interrupted_runs_are_marked_failed_on_restart(make_client):
    from app.models import Experiment

    with make_client() as client:
        session_factory = client.app.state.session_factory
        with session_factory() as s:
            s.add(Experiment(turns=5, sensor_error_rate=0, drop_rate=0, tamper_rate=0, byzantine_count=0,
                             algorithm="majority", n_cities=5, status="running"))
            s.commit()
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
    turns = lambda i: client.get(f"/experiments/{i}/turns").json()["turns"]
    assert turns(a) == turns(b)


def test_cors_allows_frontend_dev_server(client):
    response = client.options("/experiments", headers={"Origin": "http://localhost:5173",
                                                       "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
