"""god와 city가 같이 쓰는 최소 HTTP 도구 (표준 라이브러리만 사용).

serve()   : 요청을 "받는" 서버를 연다.   (전화 받기)  - city, god가 사용
request() : 다른 컨테이너에 요청을 "보낸다". (전화 걸기) - god가 사용
"""
import json
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen


class HttpError(Exception):
    """handler가 500이 아닌 상태 코드로 응답하고 싶을 때 던진다. 예) raise HttpError(404, "game 7 not found")"""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def find_route(routes, method, path):
    """(handler, 경로 인자 목록)을 돌려준다. 주소의 "{}" 칸은 아무 값과 맞고 그 값이 인자가 된다.

    예) ("POST", "/games/{}/turns") 는 /games/7/turns 와 맞고 인자는 ["7"]
    """
    if (method, path) in routes:
        return routes[(method, path)], []
    parts = path.split("/")
    for (m, pattern), handler in routes.items():
        want = pattern.split("/")
        if m == method and len(want) == len(parts) and all(w in ("{}", p) for w, p in zip(want, parts)):
            return handler, [p for w, p in zip(want, parts) if w == "{}"]
    return None, []


# 요청 받을 때
def serve(routes, port=8000):
    """routes: {("GET", "/health"): handler}. handler(body)가 돌려준 dict를 JSON으로 응답한다.

    예) serve({("GET", "/health"): health, ("POST", "/turn"): turn})
        → GET /health 가 오면 health(None), POST /turn 이 오면 turn(받은 JSON) 실행
    주소에 "{}" 칸이 있으면 그 값을 문자열로 더 넘긴다. 예) ("GET", "/games/{}") → handler(None, "7")
    """

    # 요청 하나가 올 때마다 파이썬이 이 클래스로 객체를 만들고 do_GET/do_POST를 호출한다.
    class Handler(BaseHTTPRequestHandler):
        def _handle(self, method):
            # (메서드, 주소)로 routes 표에서 실행할 함수를 찾는다. 예) ("POST", "/turn") → turn
            handler, args = find_route(routes, method, self.path)

            if handler is None:  # 없는 주소 요청시 404 반환
                return self._send(404, {"error": f"{method} {self.path} not found"})
            try:
                # 요청 본문(JSON)을 읽어서 dict로 바꾼다. GET처럼 본문이 없으면 None.
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length)) if length else None
                # 등록한 함수 실행. 돌려준 dict가 응답 내용이 된다.
                result = handler(body, *args)
            except HttpError as e:
                return self._send(e.status, {"error": str(e)})
            except Exception as e:
                traceback.print_exc()
                return self._send(500, {"error": str(e)})
            
            self._send(200, result)

        def _send(self, status, data):
            # dict → JSON 글자 → 바이트로 바꿔서 HTTP 응답으로 보낸다.
            raw = json.dumps(data).encode()
            self.send_response(status)                            # 상태 코드 (200, 404, 409, 422, 500)
            self.send_header("Content-Type", "application/json")  # 본문이 JSON이라고 알림
            self.send_header("Content-Length", str(len(raw)))     # 본문 길이
            self.end_headers()
            self.wfile.write(raw)                                 # 본문 전송

        # 아래 두 함수는 우리가 직접 부르지 않는다.
        # GET/POST 요청이 "도착하면" 파이썬 http.server가 자동으로 호출한다 (콜백).
        def do_GET(self):
            self._handle("GET")

        def do_POST(self):
            self._handle("POST")

    # 0.0.0.0:8000 에서 요청을 기다린다.
    # 이 줄에서 프로그램이 멈춰 계속 실행.
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


# 요청 보낼 떄
def request(method, url, data=None, timeout=1):
    """url로 JSON을 보내고 JSON 응답을 dict로 돌려준다. 연결 실패·시간 초과는 예외(OSError).

    예) request("POST", "http://city-1:8000/turn", {"hint": "danger"})
        → city-1의 do_POST → _handle → turn({"hint": "danger"}) 실행 → 그 결과 dict가 여기로 돌아옴
    """
    body = None if data is None else json.dumps(data).encode()  # 보낼 dict → JSON 바이트
    req = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout) as res:  # 실제 전송, 응답이 올 때까지 기다림 (최대 timeout초)
        return json.loads(res.read())           # 받은 JSON → dict
