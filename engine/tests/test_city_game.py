"""City 게임 판단 (spec 7.6, 7.10): 의심도 증감·제한, 모순 가산, wary·majority 결정, memory."""
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CITY_ID", "1")
from city.logic import game_turn
from city import main

E, S = "evacuate", "stay"


def m(c):
    return None if c is None else {"claim": c, "note": ""}


def contra(*cities):
    return [{"pair": [1, 2], "contradictions": [{"city": c, "told": {}} for c in cities]}]


def zero(*ids):
    return {str(i): 0 for i in ids}


class GameTurn(unittest.TestCase):
    def test_suspicion_up_down_and_clamp(self):
        # 힌트 danger(=evacuate): 같은 말 -20(0 아래로 못 감), 다른 말 +20, 100 위로 못 감
        _, s, _ = game_turn("danger", {"2": m(E), "3": m(S)}, [], {"2": 0, "3": 95})
        self.assertEqual(s, {"2": 0, "3": 100})
        _, s, _ = game_turn("danger", {"2": m(E), "3": m(S)}, [], {"2": 50, "3": 50})
        self.assertEqual(s, {"2": 30, "3": 70})

    def test_null_claim_keeps_suspicion(self):
        _, s, _ = game_turn("danger", {"2": None}, [], {"2": 40})
        self.assertEqual(s, {"2": 40})

    def test_contradiction_adds_20(self):
        _, s, r = game_turn("danger", {"2": m(E), "3": m(S)}, contra(3), {"2": 50, "3": 50})
        self.assertEqual(s, {"2": 30, "3": 90})
        self.assertIn("3", r)

    def test_wary_weights(self):
        # 힌트 1표(evacuate) vs 3번 stay (의심 0 → 1표) → 동점 → 힌트
        d, _, _ = game_turn("danger", {"3": m(S)}, [], {"3": 0})
        self.assertEqual(d, E)
        # 3,4,5번 stay: 의심 +20씩 → 0.8*3 = 2.4 > 1 → stay
        d, _, _ = game_turn("danger", {"3": m(S), "4": m(S), "5": m(S)}, [], zero(3, 4, 5))
        self.assertEqual(d, S)
        # 의심 100이 된 도시의 말은 0표: stay 3개가 모두 무시돼 힌트 승
        d, _, _ = game_turn("danger", {"3": m(S), "4": m(S), "5": m(S)}, [], {"3": 90, "4": 90, "5": 90})
        self.assertEqual(d, E)

    def test_wary_tie_exact(self):
        # 힌트 1표 vs 0.7 + 0.3 (stay): 정확히 동점이라 힌트를 따라야 한다 (float이면 5.5e-17 차이로 stay)
        d, s, _ = game_turn("danger", {"3": m(S), "4": m(S)}, [], {"3": 10, "4": 50})
        self.assertEqual(s, {"3": 30, "4": 70})
        self.assertEqual(d, E)

    def test_majority(self):
        d, s, r = game_turn("danger", {"2": m(S), "3": m(S), "4": m(S)}, [], None)
        self.assertEqual((d, s, r), (S, None, None))
        d, _, _ = game_turn("danger", {"2": m(S), "3": None}, [], None)  # 1:1 동점 → 힌트
        self.assertEqual(d, E)

    def test_memory_past_hints(self):
        rec = {"2": m(S)}
        # 힌트 [safe, safe] + 이번 danger: 기억 다수 safe(=stay), 1표 차로 stay
        d, s, _ = game_turn("danger", rec, [], {"2": 0}, ["safe", "safe"])
        self.assertEqual(d, S)
        self.assertEqual(s, {"2": 0})  # stay == 기억 다수라 -20 → 0
        # 같은 입력을 turn 기억으로 보면 stay는 힌트와 달라 +20
        _, s, _ = game_turn("danger", rec, [], {"2": 0})
        self.assertEqual(s, {"2": 20})
        # 기억 동점이면 이번 힌트
        d, _, _ = game_turn("safe", {}, [], {}, ["danger"])
        self.assertEqual(d, S)

    def test_http_handler(self):
        body = {"turn": 1, "hint": "danger", "received": {"2": m(S)}, "shared": [], "suspicion": {"2": 0}}
        self.assertEqual(main.turn(body), {"decision": E, "suspicion": {"2": 20}, "reason": None})
        body["suspicion"] = None
        self.assertEqual(main.turn(body), {"decision": E, "suspicion": None, "reason": None})


if __name__ == "__main__":
    unittest.main()
