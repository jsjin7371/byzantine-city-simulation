import os

from common.http import serve

CITY_ID = int(os.environ["CITY_ID"])  # 도시 번호, 도커 컴포즈에서 city마다 환경변수로 전달됨.


# 신이 살아있는지 물어보면 자기 번호와 함께 응답.
def health(_):
    return {"city": CITY_ID, "ok": True}


serve({("GET", "/health"): health})
