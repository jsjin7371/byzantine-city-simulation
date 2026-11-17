"""Docker 통신 검사에서만 쓰는 메모리 결과 수신기다. 실제 백엔드나 DB가 아니다."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re

turns = {}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True})
        match = re.fullmatch(r"/experiments/(\d+)/turns", self.path)
        if match:
            return self.send_json(200, {"turns": turns.get(int(match[1]), [])})
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        match = re.fullmatch(r"/internal/experiments/(\d+)/turns", self.path)
        if not match:
            return self.send_json(404, {"error": "not found"})
        experiment_id = int(match[1])
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            rows = body["cities"]
            if [row["city"] for row in rows] != [1, 2, 3, 4, 5]:
                raise ValueError("expected five cities in order")
            answer = {"danger": "evacuate", "safe": "stay"}[body["truth"]]
            if body["accuracy"] != sum(row["decision"] == answer for row in rows) / 5:
                raise ValueError("incorrect accuracy")
            received = turns.setdefault(experiment_id, [])
            if any(turn["turn"] == body["turn"] for turn in received):
                return self.send_json(409, {"error": "turn already stored"})
            if body["turn"] != len(received) + 1:
                raise ValueError("unexpected turn order")
            received.append(body)
        except (ValueError, KeyError, TypeError) as exc:
            return self.send_json(422, {"error": str(exc)})
        self.send_json(200, {"ok": True, "experiment_id": experiment_id, "turn": body["turn"]})


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
