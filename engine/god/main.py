import os

from common.http import request, serve

N_CITIES = int(os.environ["N_CITIES"]) # 도시 컨테이너 개수, 도커 컴포즈에서 god에 환경변수로 전달됨.


# [데이터 보내기] 값을 보내려면 request의 세 번째 인자로 dict를 넘긴다. 키를 늘리면 값도 늘어난다.
#   reply = request("POST", f"http://city-{i}:8000/turn", {"hint": "danger", "from_left": None})
#   reply["decision"]  ← city 함수가 return한 dict가 그대로 돌아온다.
#   주의: 키 이름은 city와 똑같이 맞출 것. dict의 숫자 키는 문자열로 바뀐다 ({1: ...} → {"1": ...}).

# 각 도시 컨테이너가 살아있는지 확인.
def city_alive(i):
    try:
        return request("GET", f"http://city-{i}:8000/health")["ok"]
    except OSError:  # 컨테이너가 꺼졌거나 응답이 1초 넘게 없음
        return False



# 각 도시 컨테이너가 살아있는지 확인. 
# {"ok": True, "cities": {1: True, 2: False, ...}} 형태로 반환.
def health(_):
    return {"ok": True, "cities": {i: city_alive(i) for i in range(1, N_CITIES + 1)}}



# god 컨테이너의 HTTP 서버를 띄움. 각 도시 컨테이너 살아있는지 확인(health).
# [기능 추가] 받을 요청을 늘리려면 표에 (메서드, 주소): 함수 를 한 줄 추가한다.
#   예) serve({("GET", "/health"): health, ("POST", "/run"): run})
serve({("GET", "/health"): health})
