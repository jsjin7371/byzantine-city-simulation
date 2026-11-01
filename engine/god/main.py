import os

from common.http import request, serve

N_CITIES = int(os.environ["N_CITIES"]) # 도시 컨테이너 개수, 도커 컴포즈에서 god에 환경변수로 전달됨.


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
serve({("GET", "/health"): health})
