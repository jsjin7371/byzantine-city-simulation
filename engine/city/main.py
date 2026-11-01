import os

from common.http import serve

CITY_ID = int(os.environ["CITY_ID"])  # 도시 번호, 도커 컴포즈에서 city마다 환경변수로 전달됨.


# [데이터 받기] god가 보낸 dict는 함수의 매개변수(body)로 들어온다. 돌려줄 값은 dict로 return.
#   def turn(body):
#       hint = body["hint"]                    # god가 보낸 키 이름과 똑같이
#       return {"decision": "evacuate", ...}   # 키를 늘리면 god가 받는 값도 늘어난다

# 신이 살아있는지 물어보면 자기 번호와 함께 응답.
def health(_):
    return {"city": CITY_ID, "ok": True}


# [기능 추가] 받을 요청을 늘리려면 표에 (메서드, 주소): 함수 를 한 줄 추가한다.
#   예) serve({("GET", "/health"): health, ("POST", "/turn"): turn})
serve({("GET", "/health"): health})
