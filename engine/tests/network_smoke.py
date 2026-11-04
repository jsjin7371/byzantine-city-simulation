"""Compose 내부에서 실제 God·City 5개와 테스트 수신기의 통신을 검사한다."""
import argparse
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError

sys.path.insert(0, str(Path.cwd()))

from common.http import request


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def wait_ready(url):
    """상태 조회만 재시도하며 실험·턴 요청은 재시도하지 않는다."""
    for _ in range(20):
        try:
            if request("GET", url).get("ok") is True:
                return
        except (OSError, ValueError):
            pass
        time.sleep(.25)
    raise RuntimeError(f"server not ready: {url}")


def run(experiment_id, **settings):
    payload = {"experiment_id": experiment_id, "turns": 4, "sensor_error": 0,
               "drop_rate": 0, "flip_rate": 0, "byzantine_count": 0, "seed": 42, **settings}
    check(request("POST", "http://god:8000/run", payload, timeout=120) == {"ok": True}, "run failed")
    turns = request("GET", f"http://api:8000/experiments/{experiment_id}/turns")["turns"]
    check(len(turns) == payload["turns"], "missing turns")
    check(len({turn["truth"] for turn in turns}) == 1, "truth changed")
    opposite = {"evacuate": "stay", "stay": "evacuate"}

    def sent(row, side, truth):
        base = {"danger": "evacuate", "safe": "stay"}[truth]
        base = opposite[base] if row["is_byzantine"] else row["decision"]
        status = row[f"to_{side}"]
        return None if status == "dropped" else opposite[base] if status == "flipped" else base

    for index, turn in enumerate(turns):
        check([c["city"] for c in turn["cities"]] == [1, 2, 3, 4, 5], "invalid city IDs")
        check(sum(c["is_byzantine"] for c in turn["cities"]) == payload["byzantine_count"], "invalid Byzantine count")
        for i, city in enumerate(turn["cities"]):
            if index:
                previous = turns[index - 1]
                expected = (sent(previous["cities"][(i - 1) % 5], "right", previous["truth"]),
                            sent(previous["cities"][(i + 1) % 5], "left", previous["truth"]))
            else:
                expected = (None, None)
            check((city["from_left"], city["from_right"]) == expected, "incorrect ring relay")
    return turns


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expect-city-down", type=int, choices=range(1, 6))
    args = parser.parse_args()
    wait_ready("http://api:8000/health")
    if args.expect_city_down:
        # God의 health도 중단된 City를 조회하므로 장애 검사에서는 바로 실행 실패를 확인한다.
        try:
            request("POST", "http://god:8000/run", {"experiment_id": 8, "turns": 2}, timeout=120)
        except HTTPError as exc:
            error = json.loads(exc.read())["error"]
            check(exc.code == 500 and f"city {args.expect_city_down} initialization" in error, error)
        else:
            raise RuntimeError("expected initialization failure")
        check(request("GET", "http://api:8000/experiments/8/turns")["turns"] == [], "partial turn stored")
        print("City failure check passed")
        return

    wait_ready("http://god:8000/health")
    for city in range(1, 6):
        wait_ready(f"http://city-{city}:8000/health")
    check(all(request("GET", "http://god:8000/health")["cities"].values()), "unhealthy City")
    normal = run(1, turns=20)
    check(all(t["accuracy"] == 1 for t in normal), "normal city accuracy")
    byzantine = run(2, byzantine_count=5)
    check(byzantine[0]["accuracy"] == 1 and byzantine[1]["accuracy"] == 0, "Byzantine behavior")
    dropped = run(3, drop_rate=1, flip_rate=1)
    check(all(c["to_left"] == c["to_right"] == "dropped" for t in dropped for c in t["cities"]), "drop priority")
    flipped = run(4, flip_rate=1)
    check(all(c["to_left"] == c["to_right"] == "flipped" for t in flipped for c in t["cities"]), "flip behavior")
    mixed = {"sensor_error": .3, "drop_rate": .4, "flip_rate": .5, "byzantine_count": 2}
    first = run(5, seed=7, **mixed)
    check(first == run(6, seed=7, **mixed), "seed reproduction failed")
    check(first != run(7, seed=8, **mixed), "different seeds gave identical results")
    print("God-City HTTP smoke checks passed (test receiver; no real backend/DB)")


if __name__ == "__main__":
    main()
