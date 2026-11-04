"""City 중단 검사에서 전체 상태 조회 대기나 실험 재시도가 발생하지 않는지 확인한다."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import network_smoke


class NetworkSmokeTests(unittest.TestCase):
    def test_stopped_city_check_skips_god_health_and_sends_run_once(self):
        calls = []

        def request(method, url, data=None, timeout=1):
            calls.append((method, url))
            if url == "http://api:8000/health":
                return {"ok": True}
            if url == "http://god:8000/run":
                raw = json.dumps({"error": "experiment 8 failed; city 3 initialization: unavailable"}).encode()
                raise HTTPError(url, 500, "Internal Server Error", {}, io.BytesIO(raw))
            if url == "http://api:8000/experiments/8/turns":
                return {"turns": []}
            raise AssertionError(f"unexpected request: {method} {url}")

        with patch.object(sys, "argv", ["network_smoke.py", "--expect-city-down", "3"]), \
                patch.object(network_smoke, "request", request), patch("builtins.print"):
            network_smoke.main()
        self.assertEqual(calls, [("GET", "http://api:8000/health"), ("POST", "http://god:8000/run"),
                                 ("GET", "http://api:8000/experiments/8/turns")])

    def test_stopped_city_check_rejects_unexpected_success(self):
        with patch.object(sys, "argv", ["network_smoke.py", "--expect-city-down", "3"]), \
                patch.object(network_smoke, "request", return_value={"ok": True}) as request:
            with self.assertRaisesRegex(RuntimeError, "expected initialization failure"):
                network_smoke.main()
        self.assertEqual(request.call_count, 2)


if __name__ == "__main__":
    unittest.main()
