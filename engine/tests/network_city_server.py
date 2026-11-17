"""통합 검사에서 실제 City 서버를 독립 프로세스와 임시 포트로 실행한다."""
import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("city", type=int, choices=range(1, 6))
    args = parser.parse_args()
    os.environ["CITY_ID"] = str(args.city)

    from common import http
    from city import main as city

    original_server = http.HTTPServer

    def local_server(address, handler):
        server = original_server(("127.0.0.1", 0), handler)
        print(server.server_port, flush=True)
        return server

    # 포트와 바인딩 주소만 바꾸며 City의 상태·판단·발신 함수는 그대로 실행한다.
    http.HTTPServer = local_server
    http.BaseHTTPRequestHandler.log_message = lambda *args: None
    http.serve({("GET", "/health"): city.health,
                ("POST", "/init"): city.init, ("POST", "/turn"): city.turn})


if __name__ == "__main__":
    main()
