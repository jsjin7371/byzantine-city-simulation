"""고정 God·City의 상태와 실제 게임 HTTP 통신을 검사하는 기능"""


from god.game import TURNS


def check(condition, message):
    """검사 조건을 만족하지 않으면 실패를 알리는 기능"""
    if not condition:
        raise RuntimeError(message)


def run(request):
    """도시 5개의 연결과 다수결 시민 게임 한 판을 검사하는 기능"""
    for city in range(1, 6):
        reply = request("GET", f"http://city-{city}:8000/health")
        check(reply == {"city": city, "ok": True}, f"City {city} health mismatch: {reply!r}")
    health = request("GET", "http://god:8000/health")
    check(health.get("ok") is True and health.get("cities") == {str(c): True for c in range(1, 6)},
          f"God health mismatch: {health!r}")

    state = request("POST", "http://god:8000/games", {
        "game_id": 1, "player": "bot", "citizen_type": "majority", "seed": 42,
    }, timeout=5)
    check(state.get("game_id") == 1 and state.get("turn") == 0 and state.get("game_over") is False,
          f"Invalid initial game state: {state!r}")
    check(set(state.get("roles", {})) == {str(c) for c in range(1, 6)}, "Expected five game roles")
    citizens = {int(c) for c, role in state["roles"].items() if role == "citizen"}
    check(len(citizens) == 4, "Expected four majority citizens and one mafia")
    truth = state["truth"]

    for turn in range(1, TURNS + 1):
        result = request("POST", "http://god:8000/games/1/turns", {"turn": turn, "claims": {}}, timeout=10)
        check(result.get("game_id") == 1 and result.get("turn") == turn,
              f"Incorrect game or turn: {result!r}")
        check(result.get("truth") == truth, f"Truth changed at turn {turn}")
        rows = result.get("cities", [])
        check(sorted(row["city"] for row in rows) == [1, 2, 3, 4, 5], f"Missing cities at turn {turn}")
        replies = [row for row in rows if row["role"] == "citizen"]
        check({row["city"] for row in replies} == citizens, f"Citizen roles changed at turn {turn}")
        check(all(row["decision"] in ("evacuate", "stay") for row in replies),
              f"Missing City decisions at turn {turn}")
        check(result.get("game_over") is (turn == TURNS), f"Unexpected game completion at turn {turn}")

    check(result.get("end_reason") == "turns_done" and result.get("outcome") in ("win", "perfect_win", "loss"),
          f"Invalid final outcome: {result!r}")
    saved = request("GET", "http://god:8000/games/1")
    check(saved.get("game_id") == 1 and saved.get("turn") == TURNS and saved.get("game_over") is True,
          f"Final state mismatch: {saved!r}")
    check(saved.get("outcome") == result["outcome"], "Final outcome mismatch")
    print(f"God-City Kubernetes smoke passed: 5 City health checks, {TURNS} game turns; no backend/DB")


if __name__ == "__main__":
    from common.http import request

    run(request)
