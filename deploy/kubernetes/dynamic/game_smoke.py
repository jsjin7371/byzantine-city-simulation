"""이미 생성한 게임의 health·전체 턴·종료 상태를 검사하는 기능"""
from common.http import request
from god.game import TURNS


def run():
    """시민 네 곳의 실제 HTTP 판단으로 모든 턴을 완료하는 기능"""
    url = "http://god:8000"
    initial = request("GET", url + "/games/1", timeout=10)
    if initial["turn"] != 0 or initial["config"]["citizen_type"] != "majority":
        raise RuntimeError("Create a fresh majority game 1 before running this script")
    health = request("GET", url + "/health", timeout=10)
    if health != {"ok": True, "cities": {str(c): True for c in range(1, 6)}}:
        raise RuntimeError(f"City health mismatch: {health}")
    results = []
    for turn in range(1, TURNS + 1):
        result = request("POST", url + "/games/1/turns", {"turn": turn, "claims": {}}, timeout=120)
        if (result["turn"] != turn or result["truth"] != initial["truth"]
                or sorted(c["city"] for c in result["cities"]) != [1, 2, 3, 4, 5]
                or result["game_over"] is not (turn == TURNS)):
            raise RuntimeError(f"Invalid turn {turn}: {result}")
        results.append(result)
    final = request("GET", url + "/games/1", timeout=10)
    if not final["game_over"] or final["turn"] != TURNS or final["outcome"] != results[-1]["outcome"]:
        raise RuntimeError("Final state mismatch")
    # 생성 이름을 제외한 전체 결과를 출력해 재생성 전후의 재현성을 비교한다.
    import hashlib
    import json
    digest = hashlib.sha256(json.dumps(results, sort_keys=True).encode()).hexdigest()
    print(f"Dynamic Kubernetes smoke passed: {TURNS} game turns; result sha256={digest}")


if __name__ == "__main__":
    run()
