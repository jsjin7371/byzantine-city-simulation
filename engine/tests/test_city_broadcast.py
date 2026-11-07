"""City 메시지 전송 규칙 테스트 (HTTP 없이 city/logic.py만 확인)."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from city.logic import broadcast
from city_helpers import E, S, make_state


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
