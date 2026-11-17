"""Real loopback HTTP through common.http; City and API endpoints are fixtures."""
from contextlib import contextmanager
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import http
from god import main
from god.simulation import GodService
from god_helpers import MockCity, running_server


class HttpTests(unittest.TestCase):
    def setUp(self):
        # Suppress expected fixture errors and access logs, not exceptions.
        self.trace = patch.object(http.traceback, "print_exc")
        self.trace.start()
        self.addCleanup(self.trace.stop)
        self.logs = patch.object(http.BaseHTTPRequestHandler, "log_message")
        self.logs.start()
        self.addCleanup(self.logs.stop)

    @contextmanager
    def system(self, *, backend_fail=False, missing_city=False, invalid_city=False, missing_init=False):
        saved, calls = [], []
        mock = MockCity()

        def save(body):
            if backend_fail:
                raise RuntimeError("fixture backend unavailable")
            saved.append(body)
            return {"ok": True, "experiment_id": 81, "turn": body["turn"]}

        def city_turn(city, body):
            calls.append(city)
            return {"decision": "invalid"} if invalid_city else mock.turn(city, body)

        fixtures = {("POST", "/internal/experiments/81/turns"): save}
        for city in range(1, 6):
            if not (missing_init and city == 3):
                fixtures[("POST", f"/city-{city}/init")] = lambda body, c=city: mock.init(c, body)
            if not (missing_city and city == 3):
                fixtures[("POST", f"/city-{city}/turn")] = lambda body, c=city: city_turn(c, body)
            fixtures[("GET", f"/city-{city}/health")] = lambda _, c=city: {"ok": True, "city": c}

        with running_server(fixtures) as fixture_url:
            def transport(method, url, data=None):
                parsed = urlsplit(url)
                prefix = f"/{parsed.hostname}" if parsed.hostname.startswith("city-") else ""
                return http.request(method, f"{fixture_url}{prefix}{parsed.path}", data)

            service = GodService(transport)
            with patch.object(main, "service", service), patch.object(main, "request", transport):
                with running_server({("GET", "/health"): main.health, ("POST", "/run"): main.run}) as god_url:
                    yield god_url, saved, calls

    def assert_http_error(self, url, body, text):
        with self.assertRaises(HTTPError) as caught:
            http.request("POST", url + "/run", body, timeout=5)
        self.assertEqual(caught.exception.code, 500)
        self.assertIn(text, json.loads(caught.exception.read())["error"])

    def test_real_http_health_and_multi_turn_success(self):
        """실제 HTTP로 /health와 3턴 실행이 성공하고, 같은 실험 번호 재실행은 거부된다."""
        with self.system() as (url, saved, calls):
            self.assertEqual(http.request("GET", url + "/health"),
                             {"ok": True, "cities": {str(c): True for c in range(1, 6)}})
            self.assertEqual(http.request("POST", url + "/run", {"experiment_id": 81, "turns": 3, "seed": 42}, timeout=5),
                             {"ok": True})
            self.assertEqual([t["turn"] for t in saved], [1, 2, 3])
            self.assertEqual(calls, [1, 2, 3, 4, 5] * 3)
            self.assert_http_error(url, {"experiment_id": 81}, "already attempted")
            self.assertEqual(len(saved), 3)

    def test_real_http_missing_city_returns_500(self):
        """턴 도중 도시가 응답하지 않으면 500을 돌려준다."""
        with self.system(missing_city=True) as (url, saved, calls):
            self.assert_http_error(url, {"experiment_id": 81}, "turn 1, city 3")
            self.assertEqual(saved, [])
            self.assertEqual(calls, [1, 2])

    def test_real_http_backend_failure_returns_500(self):
        """백엔드 저장이 실패하면 500을 돌려준다."""
        with self.system(backend_fail=True) as (url, saved, calls):
            self.assert_http_error(url, {"experiment_id": 81}, "acknowledged 0/10")
            self.assertEqual(saved, [])
            self.assertEqual(calls, [1, 2, 3, 4, 5])

    def test_real_http_invalid_city_response(self):
        """도시가 잘못된 결정을 보내면 500을 돌려준다."""
        with self.system(invalid_city=True) as (url, saved, calls):
            self.assert_http_error(url, {"experiment_id": 81}, "City must return decision")
            self.assertEqual(saved, [])
            self.assertEqual(calls, [1])

    def test_real_http_invalid_config(self):
        """설정이 잘못되면 도시를 부르지 않고 500을 돌려준다."""
        with self.system() as (url, saved, calls):
            self.assert_http_error(url, {"experiment_id": 81, "turns": 21}, "invalid turns")
            self.assertEqual(saved, [])
            self.assertEqual(calls, [])

    def test_real_http_missing_init_aborts_before_turns(self):
        """도시 초기화가 실패하면 턴 전에 멈추고 500을 돌려준다."""
        with self.system(missing_init=True) as (url, saved, calls):
            self.assert_http_error(url, {"experiment_id": 81}, "city 3 initialization")
            self.assertEqual(saved, [])
            self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
