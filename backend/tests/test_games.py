from app.god.client import GodGameError
from app.models import Experiment, Status


def start(client, **cfg):
    r = client.post("/games", json={"seed": 1, **cfg})
    assert r.status_code == 201, r.text
    return r.json()


def claims_for(state):
    return {str(c): {"claim": "stay"} for c, r in state["roles"].items() if r == "citizen"}


def play(client, state, turn):
    return client.post(f"/games/{state['game_id']}/turns", json={"turn": turn, "claims": claims_for(state)})


def test_full_game_flow(client):
    state = start(client)
    assert state["status"] == "in_progress" and state["turn"] == 0 and state["bot_win_rate"] is None
    for t in range(1, 16):
        r = play(client, state, t)
        assert r.status_code == 200, r.text
        assert r.json()["turn"] == t
    last = r.json()
    assert last["game_over"] and last["end_reason"] == "turns_done" and last["next_hints"] is None
    got = client.get(f"/games/{state['game_id']}").json()
    assert got["status"] == "finished" and got["turn"] == 15 and got["outcome"] == last["outcome"]
    assert client.get(f"/games/{state['game_id']}/turns/3").json()["turn"] == 3
    assert play(client, state, 16).status_code == 409  # 끝난 게임


def test_share_pairs_announced(client):
    """mock God도 next_share_pairs를 내고, 다음 턴은 그 쌍으로 공유한다. 끝나면 null."""
    state = start(client, share_pairs=2)
    pairs = state["next_share_pairs"]
    assert len(pairs) == 2 and all(len(p) == 2 for p in pairs)
    for t in range(1, 16):
        r = play(client, state, t).json()
        assert [s["pair"] for s in r["sharing"]] == pairs
        pairs = r["next_share_pairs"]
        assert client.get(f"/games/{state['game_id']}").json()["next_share_pairs"] == pairs
    assert pairs is None
    assert start(client, share_mode="none")["next_share_pairs"] == []


def test_bot_win_rate(client):
    assert start(client, mafia_count=1, sensor_error=0.48)["bot_win_rate"] == 0.32
    assert start(client, mafia_count=1, sensor_error=0.4, citizen_type="majority")["bot_win_rate"] == 0.748
    assert start(client, mafia_count=1, sensor_error=0.3, citizen_type="ai")["bot_win_rate"] is None
    assert start(client, sensor_error=0.3, share_mode="none")["bot_win_rate"] is None


def test_errors(client):
    state = start(client)
    gid = state["game_id"]
    assert client.get("/games/999").status_code == 404
    assert client.get(f"/games/{gid}/turns/1").status_code == 404
    assert play(client, state, 2).status_code == 409  # 다음 턴이 아님
    assert client.post(f"/games/{gid}/turns", json={"turn": 1, "claims": {}}).status_code == 422  # claims 부족
    assert client.get(f"/games/{gid}").json()["status"] == "in_progress"
    assert client.post("/games", json={"mafia_count": 3}).status_code == 422


def test_new_game_abandons_previous(client):
    first = start(client)
    second = start(client)
    assert client.get(f"/games/{first['game_id']}").json()["status"] == "abandoned"
    assert play(client, first, 1).status_code == 409
    assert client.get(f"/games/{second['game_id']}").json()["status"] == "in_progress"


def test_409_while_experiment_active(client):
    with client.app.state.session_factory() as s:
        s.add(Experiment(status=Status.RUNNING, turns=5, sensor_error=0.1, drop_rate=0, flip_rate=0,
                         byzantine_count=1, n_cities=5))
        s.commit()
    assert client.post("/games", json={}).status_code == 409


def test_god_failure_marks_failed(client):
    state = start(client)

    def boom(game_id, payload):
        raise GodGameError("down")

    client.app.state.game_god.turn = boom
    assert play(client, state, 1).status_code == 502
    assert client.get(f"/games/{state['game_id']}").json()["status"] == "failed"


def test_start_failure_leaves_no_game(client):
    prev = start(client)

    for exc in (GodGameError("down"), ValueError("bad json")):
        def boom(payload, exc=exc):
            raise exc

        client.app.state.game_god.start = boom
        assert client.post("/games", json={}).status_code == 502
        assert client.get(f"/games/{prev['game_id'] + 1}").status_code == 404  # 행이 남지 않음
        assert client.get(f"/games/{prev['game_id']}").json()["status"] == "in_progress"
