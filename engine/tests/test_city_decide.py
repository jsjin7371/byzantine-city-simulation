"""City 판단 규칙 테스트 (HTTP 없이 city/logic.py만 확인)."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from city.logic import decide
from city_helpers import E, S


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


if __name__ == "__main__":
    unittest.main()
