import csv
import io

from app.god.client import GodGameError
from app.models import Experiment, Game, Status
from app.schemas import GameConfig


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
    for t in range(1, 8):
        r = play(client, state, t)
        assert r.status_code == 200, r.text
        assert r.json()["turn"] == t
    last = r.json()
    assert last["game_over"] and last["end_reason"] == "turns_done" and last["next_hints"] is None
    got = client.get(f"/games/{state['game_id']}").json()
    assert got["status"] == "finished" and got["turn"] == 7 and got["outcome"] == last["outcome"]
    assert client.get(f"/games/{state['game_id']}/turns/3").json()["turn"] == 3
    assert play(client, state, 8).status_code == 409  # 끝난 게임


def test_share_pairs_announced(client):
    """mock God도 next_share_pairs를 내고, 다음 턴은 그 쌍으로 공유한다. 끝나면 null."""
    state = start(client, share_pairs=2)
    pairs = state["next_share_pairs"]
    assert len(pairs) == 2 and all(len(p) == 2 for p in pairs)
    for t in range(1, 8):
        r = play(client, state, t).json()
        assert [s["pair"] for s in r["sharing"]] == pairs
        pairs = r["next_share_pairs"]
        assert client.get(f"/games/{state['game_id']}").json()["next_share_pairs"] == pairs
    assert pairs is None
    assert start(client, share_mode="none")["next_share_pairs"] == []


def test_bot_win_rate(client):
    assert start(client, mafia_count=1, sensor_error=0.48)["bot_win_rate"] == 0.57
    assert start(client, mafia_count=1, sensor_error=0.4, citizen_type="majority")["bot_win_rate"] == 0.736
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
    def boom(game_id, payload):
        raise GodGameError("down")

    for turn in (boom, lambda game_id, payload: {}):  # 호출 실패, 필드가 빠진 성공 응답
        state = start(client)
        client.app.state.game_god.turn = turn
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


def add_game(client, status="finished", outcome="win", **cfg):
    """집계 테스트용으로 God 없이 끝난 게임 행을 바로 넣는다."""
    config = GameConfig(**{"sensor_error": 0.4, **cfg}).model_dump()
    with client.app.state.session_factory() as s:
        s.add(Game(status=status, config=config, state={"outcome": outcome}))
        s.commit()


def stats_row(client, citizen_type, difficulty):
    items = client.get("/games/stats").json()["items"]
    return next(i for i in items if i["citizen_type"] == citizen_type and i["difficulty"] == difficulty)


def test_stats_empty(client):
    items = client.get("/games/stats").json()["items"]
    assert len(items) == 6  # 시민 종류 2(wary·majority) × 난이도 3, 판이 없어도 0판으로
    normal = stats_row(client, "wary", "normal")
    assert normal == {"citizen_type": "wary", "difficulty": "normal", "label": "보통", "games": 0, "wins": 0,
                      "win_rate": None, "bot_win_rate": 0.31}
    assert all(i["citizen_type"] != "ai" for i in items)


def test_stats_counts_only_human_default_finished(client):
    add_game(client, outcome="win")
    add_game(client, outcome="perfect_win")
    add_game(client, outcome="loss")
    add_game(client, outcome="win", seed=7)  # seed는 규칙을 바꾸지 않으므로 포함
    # 아래는 모두 제외
    add_game(client, player="bot")
    add_game(client, status="in_progress", outcome=None)
    add_game(client, status="abandoned", outcome=None)
    add_game(client, status="failed", outcome=None)
    add_game(client, share_mode="none")
    add_game(client, mafia_count=2)
    add_game(client, sensor_error=0.2)  # 프리셋 밖
    add_game(client, citizen_type="ai")  # 봇 승률이 없어 비교 불가
    add_game(client, outcome="loss", citizen_type="majority", sensor_error=0.3)

    wary = stats_row(client, "wary", "normal")
    assert (wary["games"], wary["wins"], wary["win_rate"]) == (4, 3, 0.75)
    majority = stats_row(client, "majority", "hard")
    assert (majority["games"], majority["wins"], majority["win_rate"], majority["bot_win_rate"]) == (1, 0, 0.0, 0.490)
    assert sum(i["games"] for i in client.get("/games/stats").json()["items"]) == 5


def test_stats_from_real_game(client):
    state = start(client, sensor_error=0.48)
    for t in range(1, 8):
        r = play(client, state, t).json()
        if r["game_over"]:
            break
    row = stats_row(client, "wary", "easy")
    assert row["games"] == 1 and row["wins"] == (r["outcome"] in ("win", "perfect_win"))


def test_stats_csv(client):
    add_game(client, outcome="win")
    r = client.get("/games/stats.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert len(rows) == 6
    normal = next(row for row in rows if row["citizen_type"] == "wary" and row["difficulty"] == "normal")
    assert normal == {"citizen_type": "wary", "difficulty": "normal", "label": "보통", "games": "1", "wins": "1",
                      "win_rate": "1.0", "bot_win_rate": "0.31"}
    assert next(row for row in rows if row["games"] == "0")["win_rate"] == ""  # null은 빈 칸
