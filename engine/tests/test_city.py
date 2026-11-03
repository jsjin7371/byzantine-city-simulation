"""City 판단 규칙 테스트 (HTTP 없이 city/logic.py만 확인)."""
from pathlib import Path
import random
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from city.logic import broadcast, decide

E, S = "evacuate", "stay"


def make_state(drop=0, flip=0, byzantine=False, truth=None, seed=1):
    """테스트용 도시 상태. 확률을 0이나 1로 주면 결과가 정해진다."""
    return {"drop_rate": drop, "flip_rate": flip, "is_byzantine": byzantine,
            "truth": truth, "rng": random.Random(seed)}


class DecideTests(unittest.TestCase):
    """다수결로 결정을 정하는 규칙."""

    def test_first_turn_follows_hint(self):
        """이웃 소식이 없는 첫 턴은 힌트대로 결정한다."""
        self.assertEqual(decide("danger", None, None), E)
        self.assertEqual(decide("safe", None, None), S)

    def test_neighbors_overrule_hint(self):
        """이웃 2곳이 힌트와 다르면 2:1로 힌트가 뒤집힌다."""
        self.assertEqual(decide("safe", E, E), E)
        self.assertEqual(decide("danger", S, S), S)

    def test_tie_follows_hint(self):
        """1:1 동점이면 힌트를 따른다. 이웃 1곳이 누락됐을 때만 생긴다."""
        self.assertEqual(decide("safe", E, None), S)
        self.assertEqual(decide("safe", None, E), S)
        self.assertEqual(decide("danger", S, None), E)
        self.assertEqual(decide("danger", None, S), E)

    def test_hint_and_one_neighbor_beat_the_other(self):
        """이웃 의견이 갈리면 힌트와 같은 쪽이 2:1로 이긴다."""
        self.assertEqual(decide("danger", E, S), E)
        self.assertEqual(decide("safe", E, S), S)


class BroadcastTests(unittest.TestCase):
    """이웃 한 곳에 보낼 값과 상태를 정하는 규칙."""

    def test_normal_sends_decision(self):
        """장애가 없으면 자기 결정을 그대로 보낸다."""
        self.assertEqual(broadcast(E, make_state()), (E, "normal"))
        self.assertEqual(broadcast(S, make_state()), (S, "normal"))

    def test_drop_sends_nothing(self):
        """누락되면 값은 None, 상태는 dropped다."""
        self.assertEqual(broadcast(E, make_state(drop=1)), (None, "dropped"))

    def test_flip_sends_opposite(self):
        """조작되면 결정의 반대 값이 가고, 상태는 flipped다."""
        self.assertEqual(broadcast(E, make_state(flip=1)), (S, "flipped"))
        self.assertEqual(broadcast(S, make_state(flip=1)), (E, "flipped"))

    def test_dropped_message_is_not_flipped(self):
        """누락과 조작이 모두 걸리면 누락이 우선이고, 에러가 나지 않는다."""
        self.assertEqual(broadcast(E, make_state(drop=1, flip=1)), (None, "dropped"))

    def test_byzantine_sends_opposite_of_truth_regardless_of_decision(self):
        """비잔틴 도시는 자기 결정과 상관없이 정답의 반대를 보낸다."""
        for decision in (E, S):
            self.assertEqual(broadcast(decision, make_state(byzantine=True, truth="danger")), (S, "normal"))
            self.assertEqual(broadcast(decision, make_state(byzantine=True, truth="safe")), (E, "normal"))

    def test_byzantine_message_can_be_dropped_or_flipped(self):
        """비잔틴 도시의 메시지도 누락·조작된다. 거짓말이 조작되면 정답이 전달된다."""
        self.assertEqual(broadcast(E, make_state(drop=1, byzantine=True, truth="danger")), (None, "dropped"))
        self.assertEqual(broadcast(E, make_state(flip=1, byzantine=True, truth="danger")), (E, "flipped"))

    def test_same_seed_gives_same_results(self):
        """시드가 같으면 판정 결과가 똑같이 나오고, 다르면 달라진다."""
        def results(seed):
            state = make_state(drop=0.3, flip=0.3, seed=seed)
            return [broadcast(E, state) for _ in range(50)]

        self.assertEqual(results(42), results(42))
        self.assertNotEqual(results(42), results(43))


if __name__ == "__main__":
    unittest.main()
