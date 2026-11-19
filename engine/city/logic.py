DECISION_OF = {"danger": "evacuate", "safe": "stay"}  # 힌트·정답 → 결정
OPPOSITE = {"evacuate": "stay", "stay": "evacuate"}   # 결정의 반대


def decide(hint, received):
    """다수결로 결정을 정해 돌려준다 ("evacuate" | "stay").

    received: 이웃들에게 받은 값 목록 (evacuate | stay | None)

    표 = 힌트를 결정으로 바꾼 값 + 받은 값 중 None이 아닌 것
    동점이면 힌트를 따른다.
    """
    my_vote = DECISION_OF[hint]  # 힌트를 결정 값으로 변환. 예) "danger" → "evacuate"

    votes = [my_vote]
    for value in received:
        if value is not None:  # None은 누락된 메시지라 표에 넣지 않는다
            votes.append(value)

    # votes에서 "evacuate"와 "stay"의 개수를 세어 많은 쪽을 return
    evacuate_count = votes.count("evacuate")
    stay_count = votes.count("stay")

    if evacuate_count > stay_count:
        return "evacuate"
    elif stay_count > evacuate_count:
        return "stay"
    else:
        return my_vote # 동점이면 힌트를 따름.

SUSPICION_UP, SUSPICION_DOWN, SUSPICION_CONTRA = 20, 20, 20  # 7.6 의심도 증감


def pick(score, hint):
    """부호로 결정을 고른다. 0(동점)이면 힌트를 따른다."""
    if score == 0:
        return DECISION_OF[hint]
    return "evacuate" if score > 0 else "stay"


def game_turn(hint, received, shared, suspicion, past_hints=()):
    """게임용 시민 판단 (spec 7.6, 7.10). 반환: (결정, 새 의심도 | None, 이유 | None)

    received: 보낸 도시 id 문자열 -> 메시지 객체 | None
    shared: 7.7 sharing 항목 배열
    suspicion: 직전 의심도 (다수결 시민이면 None)
    past_hints: 이번 턴을 뺀 기억한 과거 힌트 (오래된 것부터)

    점수는 정수(1표 = 100)로 센다. float 합은 동점이 어긋난다 (1 - 0.7 - 0.3 != 0).
    """
    hints = [*past_hints, hint]
    score = sum(100 if DECISION_OF[h] == "evacuate" else -100 for h in hints)  # 기억한 힌트 표
    mine = pick(score, hint)  # 기억한 힌트의 다수, 동점이면 이번 힌트
    contra = {str(c["city"]) for pair in shared for c in pair["contradictions"]}
    wary = suspicion is not None
    new = dict(suspicion) if wary else None
    for s, msg in received.items():
        if msg is None:  # 안 보낸 칸
            continue
        claim = msg["claim"]
        w = 100
        if wary:
            v = new[s] + (-SUSPICION_DOWN if claim == mine else SUSPICION_UP) + (SUSPICION_CONTRA if s in contra else 0)
            new[s] = v = max(0, min(100, v))
            w = 100 - v  # 의심할수록 덜 믿는다
        score += w if claim == "evacuate" else -w
    reason = None
    if wary and contra:
        reason = ", ".join(sorted(contra)) + "번이 서로 다른 도시에 다른 말을 했다."
    return pick(score, hint), new, reason


def broadcast (decision : str, state : dict) -> tuple[str | None, str]:
    """이웃 한 곳에 보낼 값과 상태를 판정한다.

    Args:
        decision: 이 도시의 결정 ("evacuate" | "stay")
        state: init()에서 저장한 값 (drop_rate, flip_rate, is_byzantine, truth, rng)

    Returns:
        (보낸 값, 상태)
        - 정상: (값, "normal")
        - 조작: (반대 값, "flipped")
        - 누락: (None, "dropped")
    """

    rng = state["rng"]
    drop_rate = state["drop_rate"]
    flip_rate = state["flip_rate"]

    # 비잔틴
    if state["is_byzantine"]:
        truth = state["truth"]
        to_send = OPPOSITE[DECISION_OF[truth]] # 정답의 반대 메시지를 보낸다.
    else:
        to_send = decision

    # 누락
    if rng.random() < drop_rate: 
        return None, "dropped"  # 누락된 메시지는 None으로 표시

    # 조작
    if rng.random() < flip_rate: 
        return OPPOSITE[to_send], "flipped"  # 조작된 메시지는 반대 메시지로 표시

    return to_send, "normal"  # 정상적으로 보낸 메시지는 그대로 표시
    


