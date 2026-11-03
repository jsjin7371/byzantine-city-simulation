DECISION_OF = {"danger": "evacuate", "safe": "stay"}  # 힌트·정답 → 결정
OPPOSITE = {"evacuate": "stay", "stay": "evacuate"}   # 결정의 반대


def decide(hint, from_left, from_right):
    """다수결로 결정을 정해 돌려준다 ("evacuate" | "stay").

    표 = 힌트를 결정으로 바꾼 값 + 받은 값 중 None이 아닌 것
    동점이면 힌트를 따른다.
    """
    my_vote = DECISION_OF[hint]  # 힌트를 결정 값으로 변환. 예) "danger" → "evacuate"

    votes = [my_vote]
    for received in (from_left, from_right):
        if received is not None:  # None은 누락된 메시지라 표에 넣지 않는다
            votes.append(received)

    # votes에서 "evacuate"와 "stay"의 개수를 세어 많은 쪽을 return
    evacuate_count = votes.count("evacuate")
    stay_count = votes.count("stay")

    if evacuate_count > stay_count:
        return "evacuate"
    elif stay_count > evacuate_count:
        return "stay"
    else:
        return my_vote # 동점이면 힌트를 따름.

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
    


