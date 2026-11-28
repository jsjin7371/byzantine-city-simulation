"""동적 City 자원의 격리·정리와 기존 게임 결과의 호환성을 검사하는 기능"""
import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from city.logic import game_turn
from common.http import HttpError
from god import main
from god.game import Game, GameConfig
from god.kubernetes import CityPool, MANAGED_LABEL, NAMESPACE, OWNER_LABEL, configured_pool
from god.simulation import GodService


class FakeAPI:
    """생성 응답 유실과 삭제 장애를 재현하는 Kubernetes API 대역 기능"""

    def __init__(self):
        self.objects, self.calls = {}, []
        self.creates = 0
        self.fail_create = None
        self.fail_delete = False
        self.ready = True

    def __call__(self, method, kind, name="", body=None):
        self.calls.append((method, kind, name, copy.deepcopy(body)))
        if method == "POST":
            self.creates += 1
            obj = copy.deepcopy(body)
            name = obj["metadata"]["name"]
            obj["metadata"]["uid"] = str(self.creates)
            obj["status"] = {"conditions": [{"type": "Ready", "status": "True" if self.ready else "False"}]}
            self.objects[kind, name] = obj
            if self.creates == self.fail_create:
                raise TimeoutError("creation response lost")
            return copy.deepcopy(obj)
        if method == "GET":
            return copy.deepcopy(self.objects.get((kind, name)))
        if method == "DELETE":
            if self.fail_delete:
                raise RuntimeError("deletion unavailable")
            obj = self.objects[kind, name]
            if body["preconditions"]["uid"] != obj["metadata"]["uid"]:
                raise RuntimeError("UID conflict")
            del self.objects[kind, name]
            return {}
        raise AssertionError(method)


def city_request(method, url, data=None, timeout=1):
    """기존 규칙으로 City health와 판단 응답을 반환하는 기능"""
    if method == "GET":
        return {"city": int(url.split("-city-")[1].split(":")[0]), "ok": True}
    decision, suspicion, reason = game_turn(data["hint"], data["received"], data["shared"],
                                           data["suspicion"], data.get("past_hints", ()))
    return {"decision": decision, "suspicion": suspicion, "reason": reason}


class CityPoolTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeAPI()
        self.pool = CityPool(self.api, "city:test", transport=city_request)

    def test_five_pods_services_selectors_and_cleanup(self):
        self.pool.start(1)
        self.assertEqual(len(self.api.objects), 10)
        self.assertEqual(set(self.pool.urls), set(range(1, 6)))
        for (kind, name), obj in self.api.objects.items():
            self.assertEqual(obj["metadata"]["namespace"], NAMESPACE)
            self.assertEqual(obj["metadata"]["labels"][OWNER_LABEL], self.pool.owner)
            if kind == "pods":
                self.assertFalse(obj["spec"]["automountServiceAccountToken"])
                self.assertEqual(obj["spec"]["terminationGracePeriodSeconds"], 2)
                selector = self.api.objects["services", name]["spec"]["selector"]
                self.assertTrue(selector.items() <= obj["metadata"]["labels"].items())
        self.pool.cleanup()
        self.assertFalse(self.api.objects)
        self.assertFalse(self.pool.resources)
        self.pool.cleanup()

    def test_partial_creation_including_lost_response_is_cleaned(self):
        for count in (1, 4, 10):
            with self.subTest(count=count):
                self.api = FakeAPI()
                self.api.fail_create = count
                pool = CityPool(self.api, "city:test", transport=city_request)
                with self.assertRaisesRegex(RuntimeError, "creation response lost"):
                    pool.start(1)
                self.assertFalse(self.api.objects)
                self.assertFalse(pool.urls)

    def test_readiness_timeout_and_wrong_health_are_cleaned(self):
        self.api.ready = False
        self.pool.timeout = 0
        with self.assertRaisesRegex(RuntimeError, "readiness timed out"):
            self.pool.start(1)
        self.assertFalse(self.api.objects)
        self.api.ready = True
        self.pool.timeout = 0.01
        self.pool.transport = lambda *args, **kwargs: {"ok": True, "city": 9}
        with patch("god.kubernetes.time.sleep"), self.assertRaisesRegex(RuntimeError, "readiness timed out"):
            self.pool.start(1)
        self.assertFalse(self.api.objects)

    def test_foreign_resource_is_never_deleted(self):
        self.pool.start(1)
        key = next(iter(self.api.objects))
        self.api.objects[key]["metadata"]["labels"][OWNER_LABEL] = "other-game"
        with self.assertRaisesRegex(RuntimeError, "Refusing to delete foreign"):
            self.pool.cleanup()
        self.assertEqual(set(self.api.objects), {key})
        self.assertFalse(any(m == "DELETE" and (k, n) == key for m, k, n, _ in self.api.calls))

    def test_cleanup_failure_is_retained_and_blocks_new_creation(self):
        self.pool.start(1)
        self.api.fail_delete = True
        with self.assertRaisesRegex(RuntimeError, "deletion unavailable"):
            self.pool.start(2)
        self.assertEqual(self.api.creates, 10)
        self.assertEqual(len(self.pool.resources), 10)
        self.api.fail_delete = False
        self.pool.start(2)
        self.assertEqual(self.api.creates, 20)
        self.assertEqual(len(self.api.objects), 10)
        self.pool.cleanup()

    def test_repeated_game_id_uses_new_names(self):
        self.pool.start(1)
        first = set(self.api.objects)
        self.pool.start(1)
        self.assertTrue(first.isdisjoint(self.api.objects))
        self.assertEqual(len(self.api.objects), 10)
        self.pool.cleanup()

    def test_default_runtime_preserves_compose_and_rejects_unknown(self):
        with patch.dict("os.environ", {"CITY_RUNTIME": "compose"}):
            self.assertIsNone(configured_pool())
        with patch.dict("os.environ", {"CITY_RUNTIME": "invalid"}):
            with self.assertRaisesRegex(ValueError, "CITY_RUNTIME"):
                configured_pool()


class DynamicGameTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeAPI()
        self.pool = CityPool(self.api, "city:test", transport=city_request)
        for target in (patch.object(main, "city_pool", self.pool), patch.object(main, "game", None),
                       patch.object(main, "service", GodService(city_request))):
            target.start()
            self.addCleanup(target.stop)

    def test_full_results_match_fixed_addresses_for_seeds_and_rules(self):
        for seed in (1, 42, 99):
            for cfg in ({"citizen_type": "majority"},
                        {"citizen_type": "wary", "memory": "recent"},
                        {"citizen_type": "wary", "memory": "full", "connection": "ring", "mafia_count": 2}):
                body = {"game_id": 1, "seed": seed, "player": "bot", **cfg}
                with self.subTest(body=body):
                    reference = Game(*GameConfig.parse(body))
                    self.assertEqual(main.start_game(body), reference.state())
                    while not reference.game_over:
                        payload = {"turn": reference.turn + 1, "claims": {}}
                        expected = reference.play(payload, lambda city, req: city_request("POST", "", req))
                        self.assertEqual(main.play_turn(payload, "1"), expected)
                    self.assertFalse(self.api.objects)
                    self.assertEqual(main.get_game(None, "1"), reference.state())

    def test_invalid_request_keeps_game_but_city_failure_cleans(self):
        main.start_game({"game_id": 1, "player": "bot"})
        with self.assertRaises(HttpError):
            main.play_turn({"turn": 2, "claims": {}}, "1")
        self.assertEqual(len(self.api.objects), 10)
        with patch.object(main.service, "_post", side_effect=RuntimeError("City unavailable")):
            with self.assertRaisesRegex(RuntimeError, "City unavailable"):
                main.play_turn({"turn": 1, "claims": {}}, "1")
        self.assertFalse(self.api.objects)
        self.assertIsNone(main.game)

    def test_invalid_new_config_preserves_active_game(self):
        main.start_game({"game_id": 1})
        first = set(self.api.objects)
        for config in ({"mafia_count": 9}, {"max_turns": 0}, {"max_turns": 21}):
            with self.subTest(config=config), self.assertRaises(HttpError):
                main.start_game({"game_id": 2, **config})
            self.assertEqual(set(self.api.objects), first)
            self.assertEqual(main.game.game_id, 1)
        self.pool.cleanup()

    def test_configured_final_turn_cleans_only_that_game(self):
        """설정한 마지막 턴까지 자원을 유지하고 종료 시 회수하는 기능"""
        for limit in (1, 3, 20):
            with self.subTest(limit=limit):
                main.start_game({"game_id": 1, "player": "bot", "citizen_type": "majority", "max_turns": limit})
                for turn in range(1, limit + 1):
                    self.assertEqual(len(self.api.objects), 10)
                    result = main.play_turn({"turn": turn, "claims": {}}, "1")
                    self.assertEqual(result["game_over"], turn == limit)
                    self.assertEqual(len(self.api.objects), 0 if turn == limit else 10)
                self.assertEqual(main.get_game(None, "1")["config"]["max_turns"], limit)

    def test_early_catching_still_cleans_dynamic_cities(self):
        """최대 턴 이전 마피아 발각 시 동적 자원을 정리하는 기능"""
        main.start_game({"game_id": 1, "player": "bot", "max_turns": 20})
        def caught(_, req, timeout):
            return {"decision": "stay", "suspicion": {k: 100 if int(k) == main.game.player else 0
                                                        for k in req["suspicion"]}, "reason": None}
        with patch.object(main.service, "_post", side_effect=caught):
            result = main.play_turn({"turn": 1, "claims": {}}, "1")
        self.assertEqual(result["end_reason"], "caught")
        self.assertFalse(self.api.objects)

    def test_start_failure_does_not_publish_game(self):
        self.api.fail_create = 3
        with self.assertRaises(RuntimeError):
            main.start_game({"game_id": 1})
        self.assertIsNone(main.game)
        self.assertFalse(self.api.objects)

    def test_new_game_replaces_resources_and_run_is_explicitly_unavailable(self):
        main.start_game({"game_id": 1})
        names = set(self.api.objects)
        main.start_game({"game_id": 2})
        self.assertTrue(names.isdisjoint(self.api.objects))
        with self.assertRaises(HttpError) as error:
            main.get_game(None, "1")
        self.assertEqual(error.exception.status, 404)
        with self.assertRaises(HttpError) as error:
            main.run({"experiment_id": 1})
        self.assertEqual(error.exception.status, 503)
        self.pool.cleanup()


if __name__ == "__main__":
    unittest.main()
