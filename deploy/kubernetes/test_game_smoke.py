"""클러스터 검사 스크립트의 성공·실패 판정을 확인하는 기능"""
import contextlib
from contextlib import ExitStack
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

ENGINE = Path(__file__).resolve().parents[2] / "engine"
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))

from city.logic import game_turn
from god.game import TURNS, Game, GameConfig
from game_smoke import run


class Transport:
    """실제 게임 규칙을 사용해 HTTP 응답을 대체하는 기능"""

    def __init__(self, fault=None):
        self.game = None
        self.fault = fault
        self.turns = 0
        self.health_checks = []

    def request(self, method, url, data=None, timeout=1):
        """검사 주소에 맞는 상태 또는 게임 결과를 반환하는 기능"""
        if "city-" in url:
            city = int(url.split("city-")[1].split(":")[0])
            self.health_checks.append(city)
            return {"city": 9 if self.fault == "city" else city, "ok": True}
        if url.endswith("/health"):
            cities = {str(c): True for c in range(1, 6)}
            if self.fault == "god":
                cities["3"] = False
            return {"ok": True, "cities": cities}
        if method == "POST" and url.endswith("/games"):
            self.game = Game(*GameConfig.parse(data))
            return self.game.state()
        if method == "POST":
            def city_turn(city, body):
                """실제 규칙으로 시민의 결정을 계산하는 기능"""
                decision, suspicion, reason = game_turn(body["hint"], body["received"], body["shared"], body["suspicion"])
                return {"decision": decision, "suspicion": suspicion, "reason": reason}

            self.turns += 1
            result = self.game.play(data, city_turn)
            if self.fault == "early":
                result["game_over"] = True
            if self.fault == "missing":
                result["cities"].pop()
            return result
        result = self.game.state()
        if self.fault == "final":
            result["turn"] = TURNS - 1
        return result


class SmokeTests(unittest.TestCase):
    def test_full_game_and_all_health_checks(self):
        transport = Transport()
        with contextlib.redirect_stdout(io.StringIO()):
            run(transport.request)
        self.assertEqual(transport.health_checks, [1, 2, 3, 4, 5])
        self.assertEqual(transport.turns, TURNS)

    def test_wrong_city_and_unhealthy_god_fail_before_game(self):
        for fault in ("city", "god"):
            transport = Transport(fault)
            with self.subTest(fault=fault), self.assertRaisesRegex(RuntimeError, "health mismatch"):
                run(transport.request)
            self.assertEqual(transport.turns, 0)

    def test_early_end_and_missing_city_are_failures(self):
        for fault in ("early", "missing"):
            transport = Transport(fault)
            with self.subTest(fault=fault), self.assertRaises(RuntimeError):
                run(transport.request)
            self.assertEqual(transport.turns, 1)

    def test_final_state_must_match_completed_game(self):
        with self.assertRaisesRegex(RuntimeError, "Final state mismatch"):
            run(Transport("final").request)


class LocalHttpSmokeTests(unittest.TestCase):
    def test_real_game_http_with_five_city_processes(self):
        from common import http
        from god import main as god
        from god.simulation import GodService
        from god_helpers import running_server
        from test_engine_network import real_city

        with ExitStack() as stack:
            hosts = {f"city-{city}": stack.enter_context(real_city(city))[0] for city in range(1, 6)}
            calls = []

            def transport(method, url, data=None, timeout=1):
                """검사 주소를 실제 로컬 서버의 임시 포트로 연결하는 기능"""
                parsed = urlsplit(url)
                calls.append((parsed.hostname, parsed.path))
                return http.request(method, hosts[parsed.hostname] + parsed.path, data, timeout)

            stack.enter_context(patch.object(god, "service", GodService(transport)))
            stack.enter_context(patch.object(god, "request", transport))
            stack.enter_context(patch.object(god, "game", None))
            stack.enter_context(patch.object(http.BaseHTTPRequestHandler, "log_message", lambda *args: None))
            hosts["god"] = stack.enter_context(running_server({("GET", "/health"): god.health, **god.GAME_ROUTES}))
            with contextlib.redirect_stdout(io.StringIO()):
                run(transport)
            city_turns = [host for host, path in calls if host.startswith("city-") and path == "/turn"]
            self.assertEqual(len(city_turns), 4 * TURNS)
            self.assertEqual(len(set(city_turns)), 4)


if __name__ == "__main__":
    unittest.main()
