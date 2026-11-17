from app.god.mock import DECISION_OF, OPPOSITE_DECISION, run_mock, simulate
from app.schemas import EngineTurn

PAYLOAD = {"turns": 10, "sensor_error": 0.2, "drop_rate": 0.2, "flip_rate": 0.2, "byzantine_count": 1, "seed": 7}


def test_mock_matches_engine_turn_format():
    result = run_mock(PAYLOAD, n_cities=5)
    turns = [EngineTurn.model_validate(t) for t in result["turns"]]
    assert result["ok"] is True
    assert [t.turn for t in turns] == list(range(1, 11))
    assert len({t.truth for t in turns}) == 1  # 정답은 실험 시작 때 한 번 정한다
    for t in turns:
        assert [c.city for c in t.cities] == [1, 2, 3, 4, 5]
        assert sum(c.is_byzantine for c in t.cities) == 1


def test_first_turn_has_no_received_values():
    first = next(simulate(PAYLOAD, 5))
    assert all(c["from_left"] is None and c["from_right"] is None for c in first["cities"])


def _sent(city, side, truth):
    """to_left/to_right 상태로 실제 보낸 값을 복원한다."""
    value = OPPOSITE_DECISION[DECISION_OF[truth]] if city["is_byzantine"] else city["decision"]
    status = city[f"to_{side}"]
    return None if status == "dropped" else (OPPOSITE_DECISION[value] if status == "flipped" else value)


def test_ring_relay_between_turns():
    """다음 턴의 from_left = 왼쪽 도시가 오른쪽으로 보낸 값 (원형: 도시 1의 왼쪽은 도시 5)."""
    turns = list(simulate(PAYLOAD, 5))
    for prev, cur in zip(turns, turns[1:]):
        by_city = {c["city"]: c for c in prev["cities"]}
        for c in cur["cities"]:
            left = by_city[(c["city"] - 2) % 5 + 1]
            right = by_city[c["city"] % 5 + 1]
            assert c["from_left"] == _sent(left, "right", prev["truth"])
            assert c["from_right"] == _sent(right, "left", prev["truth"])


def test_accuracy_counts_all_cities():
    for t in simulate(PAYLOAD, 5):
        answer = DECISION_OF[t["truth"]]
        assert t["accuracy"] == sum(c["decision"] == answer for c in t["cities"]) / 5


def test_same_seed_same_result():
    assert run_mock(PAYLOAD, 5) == run_mock(PAYLOAD, 5)
    assert run_mock(PAYLOAD, 5) != run_mock({**PAYLOAD, "seed": 8}, 5)
