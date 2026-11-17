"""God 실험 설정 검증 테스트."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from god.simulation import ExperimentConfig, simulate
from god_helpers import MockCity


class ValidationTests(unittest.TestCase):
    def test_defaults_match_backend(self):
        """설정을 비워 보내면 백엔드와 같은 기본값이 들어간다."""
        self.assertEqual(ExperimentConfig.parse({"experiment_id": 1}), ExperimentConfig(1))

    def test_bad_bodies_and_fields(self):
        """요청 형식이 틀리거나 범위·타입이 틀린 값은 거부한다."""
        invalid = [None, [], "request", {}, {"experiment_id": None}, {"experiment_id": True},
                   {"experiment_id": 0}, {"experiment_id": "1"}, {"experiment_id": 1, "n_cities": 7}]
        for field, values in {
            "turns": [0, 21, 1.5, True, "2", None],
            "byzantine_count": [-1, 6, True, 1.1, None],
            "seed": [-1, 2**31, False, "42", 1.2],
            "sensor_error": [-.1, 1.1, float("nan"), float("inf"), True, "0.1", None],
            "drop_rate": [-1, 2, False, []], "flip_rate": [-1, 2, True, {}],
        }.items():
            invalid.extend({"experiment_id": 1, field: value} for value in values)
        for body in invalid:
            with self.subTest(body=body), self.assertRaises(ValueError):
                ExperimentConfig.parse(body)

    def test_boundaries_and_null_seed(self):
        """경계값(턴 20, 비잔틴 0·5, 확률 0·1)과 seed 없음으로도 실행된다."""
        for count in (0, 5):
            config = ExperimentConfig.parse({"experiment_id": 1, "turns": 20, "byzantine_count": count,
                                             "seed": None, "sensor_error": 1, "drop_rate": 0, "flip_rate": 1})
            mock = MockCity()
            self.assertEqual(len(list(simulate(config, mock.turn, mock.init))), 20)


if __name__ == "__main__":
    unittest.main()
