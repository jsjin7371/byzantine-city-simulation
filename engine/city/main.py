import os
import random

from common.http import serve
from city.logic import broadcast, decide

CITY_ID = int(os.environ["CITY_ID"])  # 도시 번호, 도커 컴포즈에서 city마다 환경변수로 전달됨.
state = {}  # 도시 상태를 담는 dict. turn()에서 읽고 쓰고, init()에서 초기화

# [데이터 받기] god가 보낸 dict는 함수의 매개변수(body)로 들어온다. 돌려줄 값은 dict로 return.
#   def turn(body):
#       hint = body["hint"]                    # god가 보낸 키 이름과 똑같이
#       return {"decision": "evacuate", ...}   # 키를 늘리면 god가 받는 값도 늘어난다

# 신이 살아있는지 물어보면 자기 번호와 함께 응답.
def health(_):
    return {"city": CITY_ID, "ok": True}

def init(body):
    state["drop_rate"] = body["drop_rate"] # 누락 확률
    state["flip_rate"] = body["flip_rate"] # 조작 확률
    state["is_byzantine"] = body["is_byzantine"] # 비잔틴 도시 여부
    state["truth"] = body.get("truth")  # 비잔틴 도시는 정답을 받음
    state["rng"] = random.Random(body["seed"])  # 시드로 난수 생성기 초기화
    return {"ok": True}  # 성공 여부를 dict로 돌려준다.

def turn(body: dict) -> dict:
    """
    힌트와 이웃 메시지로 이번 턴의 결정과 보낼 메시지를 정한다.
    Args:
        body: {"hint", "from_left", "from_right"}

    Returns:
        {"decision", "sent_left", "to_left", "sent_right", "to_right"}
        - sent_left, sent_right는 보낼 메시지 (evacuate | stay | None)
        - to_left, to_right는 "normal" | "flipped" | "dropped" 중 하나 (상태정보)
    """
    decision = decide(body["hint"], body["from_left"], body["from_right"]) # 다수결로 결정
    sent_left, to_left = broadcast(decision, state) # 왼쪽 도시로 보낼 메시지와 상태(조작 | 누락 | 정상)
    sent_right, to_right = broadcast(decision, state) # 오른쪽 도시로 보낼 메시지와 상태(조작 | 누락 | 정상)

    return {"decision": decision,
            "sent_left": sent_left, "to_left": to_left,
            "sent_right": sent_right, "to_right": to_right}

    

# [기능 추가] 받을 요청을 늘리려면 표에 (메서드, 주소): 함수 를 한 줄 추가한다.
#   예) serve({("GET", "/health"): health, ("POST", "/turn"): turn})
if __name__ == "__main__":
    serve({("GET", "/health"): health, 
           ("POST", "/init"): init,
           ("POST", "/turn"): turn})