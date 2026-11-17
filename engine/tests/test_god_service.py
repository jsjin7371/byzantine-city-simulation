"""God 실행·장애 처리와 상태 조회 테스트. City와 백엔드는 대역이다."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from god import main
from god.simulation import GodService
from god_helpers import Transport


class ServiceTests(unittest.TestCase):
    def test_init_failures_prevent_turns_and_backend_writes(self):
        """도시 초기화가 실패하면 턴을 시작하지 않고 백엔드에도 보내지 않는다."""
        for failure in (None, {}, {"ok": False}, TimeoutError("init timeout")):
            calls = []
            def transport(method, url, body):
                calls.append(url)
                if url == "http://city-3:8000/init":
                    if isinstance(failure, Exception):
                        raise failure
                    return failure
                return {"ok": True}
            with self.subTest(failure=failure), self.assertRaisesRegex(RuntimeError, "city 3 initialization"):
                GodService(transport).run({"experiment_id": 1})
            self.assertEqual(calls, [f"http://city-{c}:8000/init" for c in (1, 2, 3)])

    def test_city_sent_values_and_status_validation(self):
        """도시 응답의 보낸 값과 상태가 서로 맞지 않거나 빠지면 거부한다."""
        valid = {"decision": "stay", "sent_left": "stay", "sent_right": None,
                 "to_left": "normal", "to_right": "dropped"}
        bad = [dict(valid, sent_left=None), dict(valid, sent_right="stay"),
               dict(valid, sent_left="safe"), dict(valid, sent_left=[]),
               dict(valid, to_left="lost"), dict(valid, to_right=[]),
               dict(valid, to_right="flipped")]
        for key in ("sent_left", "sent_right", "to_left", "to_right"):
            reply = valid.copy()
            del reply[key]
            bad.append(reply)
        for reply in bad:
            with self.subTest(reply=reply), self.assertRaisesRegex(RuntimeError, "turn 1, city 1"):
                GodService(lambda method, url, data: {"ok": True} if url.endswith("/init") else reply).run({"experiment_id": 1})

    def test_run_posts_every_turn_then_returns_ok(self):
        """턴마다 결과를 백엔드에 보내고, 끝나면 ok를 돌려준다."""
        transport = Transport()
        self.assertEqual(GodService(transport).run({"experiment_id": 3, "turns": 3, "seed": 42}), {"ok": True})
        self.assertEqual(len(transport.cities), 15)
        self.assertEqual([t["turn"] for t in transport.turns], [1, 2, 3])
        for turn in transport.turns:
            self.assertEqual(set(turn), {"turn", "truth", "accuracy", "cities"})
            for city in turn["cities"]:
                self.assertEqual(set(city), {"city", "is_byzantine", "hint", "from_left", "from_right",
                                             "decision", "to_left", "to_right"})

    def test_city_failure_aborts_incomplete_turn(self):
        """턴 도중 도시가 실패하면 그 턴은 백엔드에 보내지 않고 멈춘다."""
        transport = Transport()
        transport.fail_city = 3
        with self.assertRaisesRegex(RuntimeError, r"acknowledged 0/10.*turn 1, city 3"):
            GodService(transport).run({"experiment_id": 1})
        self.assertEqual(transport.turns, [])
        self.assertEqual(len(transport.cities), 3)

    def test_backend_failure_stops_without_retry(self):
        """백엔드 전송이 실패하면 재시도하지 않고 멈춘다."""
        for failure in (URLError("connection refused"), TimeoutError("timeout"), ValueError("bad JSON")):
            calls = []
            def transport(method, url, data):
                if "city-" in url:
                    if url.endswith("/init"):
                        return {"ok": True}
                    return {"decision": "stay", "sent_left": "stay", "sent_right": "stay",
                            "to_left": "normal", "to_right": "normal"}
                calls.append(url)
                raise failure
            with self.subTest(failure=failure), self.assertRaisesRegex(RuntimeError, "no automatic retry"):
                GodService(transport).run({"experiment_id": 1})
            self.assertEqual(len(calls), 1)

    def test_partial_completion_and_duplicate_protection(self):
        """중간에 실패한 실험 번호는 다시 실행할 수 없고, 새 실험 번호는 실행된다."""
        transport = Transport()
        transport.fail_turn = 2
        service = GodService(transport)
        with self.assertRaisesRegex(RuntimeError, "acknowledged 1/3"):
            service.run({"experiment_id": 1, "turns": 3})
        self.assertEqual(len(transport.cities), 10)
        with self.assertRaisesRegex(RuntimeError, "already attempted"):
            service.run({"experiment_id": 1})
        transport.fail_turn = None
        self.assertEqual(service.run({"experiment_id": 2, "turns": 1}), {"ok": True})

    def test_successful_duplicate_is_rejected(self):
        """이미 끝난 실험 번호로 다시 실행하면 거부한다."""
        transport = Transport()
        service = GodService(transport)
        service.run({"experiment_id": 1, "turns": 1})
        with self.assertRaisesRegex(RuntimeError, "already attempted"):
            service.run({"experiment_id": 1, "turns": 1})
        self.assertEqual(len(transport.turns), 1)

    def test_bad_acknowledgements(self):
        """백엔드의 수신 확인 응답이 잘못되면 실패로 처리한다."""
        for ack in (None, [], {}, {"ok": False}, {"ok": True, "experiment_id": 1, "turn": 2},
                    {"ok": True, "experiment_id": 2, "turn": 1},
                    {"ok": True, "experiment_id": True, "turn": True}):
            def transport(method, url, data):
                if url.endswith("/init"):
                    return {"ok": True}
                return {"decision": "stay", "sent_left": "stay", "sent_right": "stay",
                        "to_left": "normal", "to_right": "normal"} if "city-" in url else ack
            with self.subTest(ack=ack), self.assertRaisesRegex(RuntimeError, "invalid backend acknowledgement"):
                GodService(transport).run({"experiment_id": 1})

    def test_bad_city_responses(self):
        """도시 응답 형식이나 결정 값이 잘못되면 실패로 처리한다."""
        for reply in (None, [], {}, {"decision": "safe"}, {"decision": []}, {"decision": True}):
            with self.subTest(reply=reply), self.assertRaisesRegex(RuntimeError, "city 1"):
                GodService(lambda method, url, data: {"ok": True} if url.endswith("/init") else reply).run({"experiment_id": 1})

    def test_busy_service_rejects_another_experiment(self):
        """실험이 도는 동안 들어온 다른 실험 요청은 거부한다."""
        service = GodService(Transport())
        service._lock.acquire()
        try:
            with self.assertRaisesRegex(RuntimeError, "already running"):
                service.run({"experiment_id": 1})
        finally:
            service._lock.release()
        self.assertEqual(service.run({"experiment_id": 1, "turns": 1}), {"ok": True})

    def test_invalid_config_does_not_contact_services(self):
        """설정이 잘못되면 도시에 아무 요청도 보내지 않는다."""
        transport = Transport()
        service = GodService(transport)
        with self.assertRaises(ValueError):
            service.run({"experiment_id": 1, "turns": 0})
        self.assertEqual(transport.cities, [])
        self.assertEqual(service.run({"experiment_id": 1, "turns": 1}), {"ok": True})


class HealthTests(unittest.TestCase):
    def test_health_keeps_existing_five_city_format(self):
        """/health는 도시 5곳이 살아 있는지를 정해진 형식으로 돌려준다."""
        def request(method, url):
            self.assertEqual(method, "GET")
            if "city-2:" in url:
                raise URLError("offline")
            if "city-3:" in url:
                return {"ok": False}
            if "city-4:" in url:
                raise ValueError("bad JSON")
            if "city-5:" in url:
                return []
            return {"ok": True}
        with patch.object(main, "request", request):
            self.assertEqual(main.health(None), {"ok": True, "cities": {1: True, 2: False, 3: False, 4: False, 5: False}})

    def test_entrypoint_registers_both_routes(self):
        """서버를 시작하면 /health와 /run 경로가 등록된다."""
        with patch.dict("os.environ", {"N_CITIES": "5"}), patch.object(main, "serve") as serve, patch.object(main.logging, "basicConfig"):
            main.main()
            self.assertEqual(serve.call_args.args[0], {("GET", "/health"): main.health, ("POST", "/run"): main.run})

    def test_entrypoint_rejects_other_city_count(self):
        """도시 수가 5가 아니면 서버를 시작하지 않는다."""
        with patch.dict("os.environ", {"N_CITIES": "7"}), self.assertRaisesRegex(ValueError, "N_CITIES=5"):
            main.main()


if __name__ == "__main__":
    unittest.main()
