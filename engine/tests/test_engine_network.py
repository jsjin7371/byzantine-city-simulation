"""실제 City 프로세스 5개와 God의 HTTP 통신을 검사한다. 결과 수신 API만 대역이다."""
import copy
from contextlib import contextmanager, ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import itertools
import json
import os
from pathlib import Path
from queue import Queue
import subprocess
import sys
import tempfile
from threading import Thread
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import http
from god import main as god
from god.simulation import DECISION_OF, GodService
from test_god_http import running_server


@contextmanager
def real_city(city):
    """City 상태가 서로 섞이지 않도록 도시마다 별도 Python 프로세스를 띄운다."""
    with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as errors:
        process = subprocess.Popen(
            [sys.executable, "-u", str(Path(__file__).with_name("network_city_server.py")), str(city)],
            stdout=subprocess.PIPE, stderr=errors, text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        ready = Queue()
        Thread(target=lambda: ready.put(process.stdout.readline()), daemon=True).start()
        try:
            line = ready.get(timeout=10)
            if not line.strip().isdigit():
                errors.seek(0)
                raise RuntimeError(f"City {city} startup failed: {errors.read()}")
            yield f"http://127.0.0.1:{int(line)}", process
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            process.stdout.close()


@contextmanager
def faulty_city(mode, endpoint):
    """지정한 경로에만 HTTP·JSON·응답 지연 장애를 넣는 테스트 서버다."""
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            status, raw = 200, b'{"ok": true}'
            if self.path == endpoint:
                if mode == "status":
                    status, raw = 503, b'{"error": "maintenance window"}'
                elif mode == "json":
                    raw = b'{invalid JSON'
                elif mode == "timeout":
                    time.sleep(.2)
                else:
                    reply = {"decision": "stay", "sent_left": "stay", "sent_right": "stay",
                             "to_left": "normal", "to_right": "normal"}
                    if mode == "missing":
                        del reply["sent_right"]
                    elif mode == "decision":
                        reply["decision"] = "safe"
                    elif mode == "state":
                        reply["to_right"] = "lost"
                    raw = json.dumps(reply).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            try:
                self.wfile.write(raw)
            except OSError:
                pass

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(5)
        server.server_close()


class EngineNetworkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stack = ExitStack()
        cls.cities = {}
        cls.ids = itertools.count(1000)
        try:
            for city in range(1, 6):
                cls.cities[city] = cls.stack.enter_context(real_city(city))
        except BaseException:
            cls.stack.close()
            raise

    @classmethod
    def tearDownClass(cls):
        cls.stack.close()

    @contextmanager
    def system(self, city_override=None, timeout=1):
        saved, events = [], []

        def receive(body):
            saved.append(copy.deepcopy(body))
            return {"ok": True, "experiment_id": experiment_id, "turn": body["turn"]}

        experiment_id = next(self.ids)
        with running_server({("POST", f"/internal/experiments/{experiment_id}/turns"): receive}) as api:
            def transport(method, url, data=None):
                parsed = urlsplit(url)
                if parsed.hostname == "api":
                    base = api
                else:
                    city = int(parsed.hostname.split("-")[1])
                    base = city_override if city == 3 and city_override else self.cities[city][0]
                event = {"host": parsed.hostname, "path": parsed.path, "body": copy.deepcopy(data)}
                events.append(event)
                event["reply"] = http.request(method, base + parsed.path, data, timeout=timeout)
                return event["reply"]

            service = GodService(transport)
            with patch.object(god, "service", service), patch.object(god, "request", transport), \
                    patch.object(http.BaseHTTPRequestHandler, "log_message"), patch.object(http.traceback, "print_exc"):
                with running_server({("POST", "/run"): god.run, ("GET", "/health"): god.health}) as url:
                    yield url, experiment_id, saved, events

    def run_experiment(self, url, experiment_id, **settings):
        return http.request("POST", url + "/run", {"experiment_id": experiment_id, "turns": 4,
                            "sensor_error": 0, "seed": 42, **settings}, timeout=10)

    def assert_relay(self, turns, events):
        replies = [e["reply"] for e in events if e["path"] == "/turn"]
        for index, turn in enumerate(turns):
            self.assertEqual([c["city"] for c in turn["cities"]], [1, 2, 3, 4, 5])
            self.assertEqual(turn["accuracy"], sum(c["decision"] == DECISION_OF[turn["truth"]]
                                                  for c in turn["cities"]) / 5)
            for i, row in enumerate(turn["cities"]):
                if index == 0:
                    expected = (None, None)
                else:
                    previous = replies[(index - 1) * 5:index * 5]
                    expected = (previous[(i - 1) % 5]["sent_right"], previous[(i + 1) % 5]["sent_left"])
                self.assertEqual((row["from_left"], row["from_right"]), expected)
                reply = replies[index * 5 + i]
                self.assertEqual((row["decision"], row["to_left"], row["to_right"]),
                                 (reply["decision"], reply["to_left"], reply["to_right"]))

    def test_five_real_cities_initialize_and_run_twenty_turns(self):
        with self.system() as (url, experiment_id, saved, events):
            self.assertEqual(http.request("GET", url + "/health")["cities"], {str(i): True for i in range(1, 6)})
            self.assertEqual(self.run_experiment(url, experiment_id, byzantine_count=0, turns=20), {"ok": True})
            self.assertEqual(len(saved), 20)
            self.assertTrue(all(t["accuracy"] == 1 for t in saved))
            inits = [e for e in events if e["path"] == "/init"]
            self.assertEqual(len(inits), 5)
            self.assertTrue(all("truth" not in e["body"] for e in inits))
            self.assert_relay(saved, events)

    def test_real_byzantine_outgoing_values_and_accuracy(self):
        with self.system() as (url, experiment_id, saved, events):
            self.run_experiment(url, experiment_id, byzantine_count=5)
            self.assertEqual(saved[0]["accuracy"], 1)
            self.assertEqual(saved[1]["accuracy"], 0)
            inits = [e for e in events if e["path"] == "/init"]
            self.assertTrue(all(e["body"]["truth"] == saved[0]["truth"] for e in inits))
            self.assert_relay(saved, events)

    def test_real_drop_flip_and_mixed_sensor_errors(self):
        for settings in ({"drop_rate": 1, "flip_rate": 1}, {"drop_rate": 0, "flip_rate": 1},
                         {"drop_rate": .3, "flip_rate": .4, "sensor_error": .5}):
            with self.subTest(settings=settings), self.system() as (url, experiment_id, saved, events):
                self.run_experiment(url, experiment_id, **settings)
                self.assert_relay(saved, events)
                if settings["drop_rate"] == 1:
                    self.assertTrue(all(c["to_left"] == c["to_right"] == "dropped" for t in saved for c in t["cities"]))
                elif settings["flip_rate"] == 1:
                    self.assertTrue(all(c["to_left"] == c["to_right"] == "flipped" for t in saved for c in t["cities"]))

    def test_real_city_seed_reinitialization_and_truth_privacy(self):
        results = []
        for seed in (7, 7, 8):
            with self.system() as (url, experiment_id, saved, events):
                self.run_experiment(url, experiment_id, seed=seed, sensor_error=.3, drop_rate=.4, flip_rate=.5,
                                    byzantine_count=2)
                results.append(saved)
                for event in (e for e in events if e["path"] == "/init"):
                    self.assertEqual("truth" in event["body"], event["body"]["is_byzantine"])
                    self.assertEqual(event["reply"], {"ok": True})
                self.assert_relay(saved, events)
        self.assertEqual(results[0], results[1])
        self.assertNotEqual(results[0], results[2])

    def test_real_city_unavailable_aborts_before_turns(self):
        with real_city(3) as (base, process):
            process.terminate()
            process.wait(timeout=5)
            with self.system(city_override=base) as (url, experiment_id, saved, events):
                with self.assertRaises(HTTPError) as caught:
                    self.run_experiment(url, experiment_id)
                error = json.loads(caught.exception.read())["error"]
                self.assertIn("city 3 initialization", error)
                self.assertIn("http://city-3:8000/init", error)
                self.assertEqual(saved, [])
                self.assertEqual(len([e for e in events if e["path"] == "/init"]), 3)
                self.assertFalse(any(e["path"] == "/turn" for e in events))

    def test_http_faults_stop_without_retry_or_partial_turn(self):
        for endpoint, mode, reason in (("/init", "status", "maintenance window"),
                ("/turn", "status", "maintenance window"), ("/turn", "json", "JSONDecodeError"),
                ("/turn", "missing", "sent_right"), ("/turn", "decision", "decision"),
                ("/turn", "state", "to_right"), ("/turn", "timeout", "timed out")):
            with self.subTest(endpoint=endpoint, mode=mode), faulty_city(mode, endpoint) as base:
                with self.system(city_override=base, timeout=.05 if mode == "timeout" else 1) as (url, experiment_id, saved, events):
                    with self.assertRaises(HTTPError) as caught:
                        self.run_experiment(url, experiment_id)
                    self.assertEqual(caught.exception.code, 500)
                    error = json.loads(caught.exception.read())["error"]
                    self.assertIn(reason, error)
                    self.assertEqual(saved, [])
                    failed = [e for e in events if e["host"] == "city-3" and e["path"] == endpoint]
                    self.assertEqual(len(failed), 1)


if __name__ == "__main__":
    unittest.main()
