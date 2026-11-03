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


    


