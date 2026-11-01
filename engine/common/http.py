"""god와 city가 같이 쓰는 최소 HTTP 도구 (표준 라이브러리만 사용)."""
import json
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen


def serve(routes, port=8000):
    """routes: {("GET", "/health"): handler}. handler(body)가 돌려준 dict를 JSON으로 응답한다."""

    class Handler(BaseHTTPRequestHandler):
        def _handle(self, method):
            handler = routes.get((method, self.path))
            if handler is None: # 없는 주소 요청시 404 반환
                return self._send(404, {"error": f"{method} {self.path} not found"})
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length)) if length else None
                result = handler(body)
            except Exception as e:
                traceback.print_exc()
                return self._send(500, {"error": str(e)})
            self._send(200, result)  # 응답 전송 실패(상대가 끊음)는 핸들러 에러로 취급하지 않음

        def _send(self, status, data):
            raw = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            self._handle("GET")

        def do_POST(self):
            self._handle("POST")

    # 요청을 한 번에 하나씩 처리. god가 city를 동시에 부르게 되면 ThreadingHTTPServer로 교체
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()


def request(method, url, data=None, timeout=1):
    """url로 JSON을 보내고 JSON 응답을 dict로 돌려준다. 연결 실패·시간 초과는 예외(OSError)."""
    body = None if data is None else json.dumps(data).encode()
    req = Request(url, data=body, method=method, headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())
