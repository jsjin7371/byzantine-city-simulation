from app.god.mock import run_mock
from app.schemas import GodResult

PAYLOAD = {"turns": 10, "sensor_error_rate": 0.2, "drop_rate": 0.1, "tamper_rate": 0.1,
           "byzantine_count": 1, "algorithm": "majority", "seed": 7}


def test_mock_matches_god_contract():
    result = GodResult.model_validate(run_mock(PAYLOAD, n_cities=5))
    assert result.n_cities == 5
    assert len(result.byzantine_ids) == 1
    assert len(result.turns) == 10
    for t in result.turns:
        assert [c.city_id for c in t.cities] == [1, 2, 3, 4, 5]
        assert len(t.messages) == 5 * 4  # 모든 도시가 나머지 도시에게 보낸다
        for m in t.messages:
            assert (m.received is None) == m.dropped


def test_mock_same_seed_same_result():
    assert run_mock(PAYLOAD, 5) == run_mock(PAYLOAD, 5)
    assert run_mock(PAYLOAD, 5) != run_mock({**PAYLOAD, "seed": 8}, 5)
