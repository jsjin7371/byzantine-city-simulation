"""Mock God: 엔진팀 슈도코드를 그대로 옮긴 가짜 시뮬레이션.

실제 엔진이 붙기 전까지 같은 형식의 턴 결과를 만들어 API·DB·프론트를 먼저 돌려보는 용도.
- 도시는 원형으로 연결되어 좌우 이웃과만 주고받는다 (도시 1의 좌측은 마지막 도시).
- 정답과 비잔틴 도시는 실험 시작 때 한 번 정한다.
- seed가 같으면 항상 같은 결과가 나온다.
"""
import random

OPPOSITE_TRUTH = {"danger": "safe", "safe": "danger"}
OPPOSITE_DECISION = {"evacuate": "stay", "stay": "evacuate"}
DECISION_OF = {"danger": "evacuate", "safe": "stay"}


def _city_turn(hint, from_left, from_right, is_byzantine, truth, drop_rate, flip_rate, rng):
    """도시 컨테이너 한 턴: 다수결로 결정하고 좌·우로 보낼 값을 정한다."""
    votes = [DECISION_OF[hint]] + [v for v in (from_left, from_right) if v is not None]
    evac = votes.count("evacuate")
    stay = len(votes) - evac
    decision = DECISION_OF[hint] if evac == stay else ("evacuate" if evac > stay else "stay")

    sent, status = {}, {}
    for side in ("left", "right"):  # 좌·우 따로 판정
        value = OPPOSITE_DECISION[DECISION_OF[truth]] if is_byzantine else decision
        if rng.random() < drop_rate:
            sent[side], status[side] = None, "dropped"
        elif rng.random() < flip_rate:
            sent[side], status[side] = OPPOSITE_DECISION[value], "flipped"
        else:
            sent[side], status[side] = value, "normal"
    return decision, sent, status


def simulate(payload: dict, n_cities: int):
    """턴 결과 JSON을 하나씩 만들어 낸다 (엔진이 턴마다 API로 보내는 것과 같은 형식)."""
    rng = random.Random(payload.get("seed"))
    cities = list(range(1, n_cities + 1))
    truth = rng.choice(["danger", "safe"])
    byzantine = set(rng.sample(cities, payload["byzantine_count"]))
    received = {c: {"left": None, "right": None} for c in cities}  # 첫 턴엔 받은 값 없음

    for turn in range(1, payload["turns"] + 1):
        rows, sent_by = [], {}
        for c in cities:
            hint = OPPOSITE_TRUTH[truth] if rng.random() < payload["sensor_error"] else truth
            decision, sent, status = _city_turn(
                hint, received[c]["left"], received[c]["right"], c in byzantine, truth,
                payload["drop_rate"], payload["flip_rate"], rng,
            )
            sent_by[c] = sent
            rows.append({
                "city": c, "is_byzantine": c in byzantine, "hint": hint,
                "from_left": received[c]["left"], "from_right": received[c]["right"],
                "decision": decision, "to_left": status["left"], "to_right": status["right"],
            })

        correct = sum(r["decision"] == DECISION_OF[truth] for r in rows)
        yield {"turn": turn, "truth": truth, "accuracy": correct / n_cities, "cities": rows}

        # 중계: 다음 턴에 줄 받은값 (원형)
        for i, c in enumerate(cities):
            left_neighbor, right_neighbor = cities[i - 1], cities[(i + 1) % n_cities]
            received[c] = {"left": sent_by[left_neighbor]["right"], "right": sent_by[right_neighbor]["left"]}


def run_mock(payload: dict, n_cities: int) -> dict:
    """턴 결과를 모아 /run 응답으로 한 번에 돌려주는 방식과 같은 형식."""
    return {"ok": True, "turns": list(simulate(payload, n_cities))}
