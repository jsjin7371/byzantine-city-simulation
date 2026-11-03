"""God tests use a test-only City, never the unfinished production City."""
import copy
import random
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from god import main
from god.simulation import DECISION_OF, ExperimentConfig, GodService, city_seed, simulate


def mock_vote(inputs):
    """Test-only City voting; tie uses the sensor hint."""
    own = DECISION_OF[inputs["hint"]]
    votes = [own] + [inputs[k] for k in ("from_left", "from_right") if inputs[k] is not None]
    evacuate = votes.count("evacuate")
    decision = own if evacuate * 2 == len(votes) else ("evacuate" if evacuate * 2 > len(votes) else "stay")
    return decision


class MockCity:
    """Stateful test-only City implementing the original engine pseudocode."""
    def __init__(self):
        self.settings, self.rng, self.sent = {}, {}, []

    def init(self, city, settings):
        # Reinitializing must replace all previous experiment state.
        self.settings[city] = copy.deepcopy(settings)
        self.rng[city] = random.Random(settings["seed"])
        return {"ok": True}

    def turn(self, city, inputs):
        settings, rng = self.settings[city], self.rng[city]
        decision = mock_vote(inputs)
        opposite = {"evacuate": "stay", "stay": "evacuate"}
        base = opposite[DECISION_OF[settings["truth"]]] if settings["is_byzantine"] else decision
        reply = {"decision": decision}
        for side in ("left", "right"):
            if rng.random() < settings["drop_rate"]:
                value, status = None, "dropped"
            elif rng.random() < settings["flip_rate"]:
                value, status = opposite[base], "flipped"
            else:
                value, status = base, "normal"
            reply[f"sent_{side}"], reply[f"to_{side}"] = value, status
        self.sent.append((city, copy.deepcopy(reply)))
        return reply


def results(**kwargs):
    mock = MockCity()
    return list(simulate(ExperimentConfig.parse({"experiment_id": 1, "seed": 42, **kwargs}), mock.turn, mock.init))


class Transport:
    def __init__(self):
        self.cities, self.turns = [], []
        self.inits = []
        self.mock = MockCity()
        self.fail_city = None
        self.fail_turn = None

    def __call__(self, method, url, data):
        assert method == "POST"
        if url.startswith("http://city-"):
            city = int(url.split("city-")[1].split(":")[0])
            if url.endswith("/init"):
                self.inits.append((city, copy.deepcopy(data)))
                return self.mock.init(city, data)
            self.cities.append((city, copy.deepcopy(data)))
            if city == self.fail_city:
                raise URLError("City unavailable")
            return self.mock.turn(city, data)
        assert url.startswith("http://api:8000/internal/experiments/")
        experiment_id = int(url.split("/")[-2])
        if data["turn"] == self.fail_turn:
            raise HTTPError(url, 503, "backend unavailable", {}, None)
        self.turns.append(copy.deepcopy(data))
        return {"ok": True, "experiment_id": experiment_id, "turn": data["turn"]}


class SimulationTests(unittest.TestCase):
    def test_exactly_five_normal_cities(self):
        for turn in results(byzantine_count=0, sensor_error=0, turns=20):
            self.assertEqual([c["city"] for c in turn["cities"]], [1, 2, 3, 4, 5])
            self.assertFalse(any(c["is_byzantine"] for c in turn["cities"]))
            self.assertEqual(turn["accuracy"], 1)

    def test_byzantine_selection_is_fixed_for_every_count(self):
        for count in range(6):
            turns = results(byzantine_count=count)
            selected = [{c["city"] for c in t["cities"] if c["is_byzantine"]} for t in turns]
            self.assertEqual(len(selected[0]), count)
            self.assertTrue(all(ids == selected[0] for ids in selected))

    def test_truth_is_sampled_once(self):
        self.assertEqual(len({t["truth"] for t in results(turns=20)}), 1)

    def test_first_turn_has_no_received_messages(self):
        self.assertTrue(all(c["from_left"] is None and c["from_right"] is None
                            for c in results()[0]["cities"]))

    def test_sensor_error_extremes(self):
        for error in (0, 1):
            turn = results(sensor_error=error)[0]
            for city in turn["cities"]:
                self.assertEqual(city["hint"] == turn["truth"], error == 0)
            self.assertEqual(turn["accuracy"], 1 - error)

    def test_ring_relay_drop_and_flip(self):
        opposite = {"evacuate": "stay", "stay": "evacuate"}
        for kwargs in ({"drop_rate": 0, "flip_rate": 0}, {"drop_rate": 1, "flip_rate": 1},
                       {"drop_rate": 0, "flip_rate": 1}, {"drop_rate": .4, "flip_rate": .6}):
            turns = results(turns=20, byzantine_count=2, **kwargs)
            for previous, current in zip(turns, turns[1:]):
                def sent(city, side):
                    status = city[f"to_{side}"]
                    value = opposite[DECISION_OF[previous["truth"]]] if city["is_byzantine"] else city["decision"]
                    return None if status == "dropped" else opposite[value] if status == "flipped" else value
                for i, city in enumerate(current["cities"]):
                    self.assertEqual(city["from_left"], sent(previous["cities"][(i - 1) % 5], "right"))
                    self.assertEqual(city["from_right"], sent(previous["cities"][(i + 1) % 5], "left"))
            if kwargs["drop_rate"] == 1:
                self.assertTrue(all(c["to_left"] == c["to_right"] == "dropped" for t in turns for c in t["cities"]))
            elif kwargs["flip_rate"] == 1:
                self.assertTrue(all(c["to_left"] == c["to_right"] == "flipped" for t in turns for c in t["cities"]))

    def test_accuracy_includes_all_byzantine_cities(self):
        for count in (1, 5):
            for turn in results(byzantine_count=count, sensor_error=.5):
                expected = sum(c["decision"] == DECISION_OF[turn["truth"]] for c in turn["cities"]) / 5
                self.assertEqual(turn["accuracy"], expected)

    def test_city_decision_is_recorded_without_god_voting(self):
        reply = {"decision": "stay", "sent_left": "evacuate", "sent_right": None,
                 "to_left": "normal", "to_right": "dropped"}
        turn = next(simulate(ExperimentConfig(1, sensor_error=0), lambda *_: reply, lambda *_: {"ok": True}))
        self.assertTrue(all(c["decision"] == "stay" for c in turn["cities"]))

    def test_same_seed_repeats_and_different_seeds_vary(self):
        self.assertEqual(results(), results())
        self.assertNotEqual(results(seed=42), results(seed=43))

    def test_experiment_id_does_not_affect_seed(self):
        mock = MockCity()
        a = list(simulate(ExperimentConfig(1, seed=9), mock.turn, mock.init))
        b = list(simulate(ExperimentConfig(2, seed=9), mock.turn, mock.init))
        self.assertEqual(a, b)

    def test_god_sensors_do_not_depend_on_city_drop_flip_draws(self):
        normal = results(drop_rate=0, flip_rate=0)
        dropped = results(drop_rate=1, flip_rate=1)
        self.assertEqual([(t["truth"], [c["hint"] for c in t["cities"]]) for t in normal],
                         [(t["truth"], [c["hint"] for c in t["cities"]]) for t in dropped])

    def test_all_init_before_turns_and_truth_only_to_byzantine(self):
        mock, events, settings = MockCity(), [], {}
        def init(city, body):
            events.append(("init", city))
            settings[city] = copy.deepcopy(body)
            return mock.init(city, body)
        def turn(city, body):
            events.append(("turn", city))
            self.assertEqual(set(body), {"hint", "from_left", "from_right"})
            return mock.turn(city, body)
        config = ExperimentConfig(10, turns=2, seed=7, byzantine_count=2, drop_rate=.3, flip_rate=.4)
        turns = list(simulate(config, turn, init))
        self.assertEqual(events[:5], [("init", c) for c in range(1, 6)])
        self.assertEqual(events[5:], [("turn", c) for c in range(1, 6)] * 2)
        for city, body in settings.items():
            self.assertEqual(body["is_byzantine"], turns[0]["cities"][city - 1]["is_byzantine"])
            self.assertEqual("truth" in body, body["is_byzantine"])
            if body["is_byzantine"]:
                self.assertEqual(body["truth"], turns[0]["truth"])
            self.assertEqual((body["drop_rate"], body["flip_rate"]), (.3, .4))
            self.assertEqual(body["seed"], city_seed(7, city))

    def test_raw_city_messages_are_relayed_without_god_manipulation(self):
        calls = []
        def city_turn(city, inputs):
            calls.append((city, copy.deepcopy(inputs)))
            # Deliberately different from the City decision. God must not derive
            # messages from decision, truth, rates, or a "flipped" status.
            return {"decision": "stay", "sent_left": "evacuate" if city % 2 else "stay",
                    "sent_right": None if city == 5 else "evacuate",
                    "to_left": "normal", "to_right": "dropped" if city == 5 else "flipped"}
        turns = list(simulate(ExperimentConfig(1, turns=2, drop_rate=1, flip_rate=1, byzantine_count=5),
                              city_turn, lambda *_: {"ok": True}))
        self.assertTrue(all(v["from_left"] is None and v["from_right"] is None for _, v in calls[:5]))
        for city, inputs in calls[5:]:
            right = city % 5 + 1
            self.assertEqual(inputs["from_left"], None if city == 1 else "evacuate")
            self.assertEqual(inputs["from_right"], "evacuate" if right % 2 else "stay")
            row = turns[1]["cities"][city - 1]
            self.assertEqual((row["from_left"], row["from_right"]),
                             (inputs["from_left"], inputs["from_right"]))
            self.assertEqual((row["to_left"], row["to_right"]),
                             ("normal", "dropped" if city == 5 else "flipped"))

    def test_sensor_random_draw_per_city_per_turn(self):
        rng = Mock()
        rng.choice.return_value = "danger"
        rng.sample.return_value = []
        rng.random.side_effect = [.1, .9, .2, .8, .3, .7, .4, .6, .49, .51]
        reply = {"decision": "stay", "sent_left": "stay", "sent_right": "stay",
                 "to_left": "normal", "to_right": "normal"}
        with patch("god.simulation.random.Random", return_value=rng):
            turns = list(simulate(ExperimentConfig(1, turns=2, sensor_error=.5),
                                  lambda *_: reply, lambda *_: {"ok": True}))
        self.assertEqual([[c["hint"] for c in t["cities"]] for t in turns],
                         [["safe", "danger", "safe", "danger", "safe"],
                          ["danger", "safe", "danger", "safe", "danger"]])
        self.assertEqual(rng.random.call_count, 10)
        rng.choice.assert_called_once()

    def test_city_seeds_stable_and_independent(self):
        seeds = [city_seed(42, c) for c in range(1, 6)]
        self.assertEqual(len(set(seeds)), 5)
        self.assertTrue(all(0 <= seed < 2**31 for seed in seeds))
        self.assertEqual(seeds, [city_seed(42, c) for c in range(1, 6)])
        self.assertNotEqual(seeds, [city_seed(43, c) for c in range(1, 6)])
        self.assertIsNone(city_seed(None, 1))


class MockCityTests(unittest.TestCase):
    def test_vote_ignores_null_and_tie_uses_hint(self):
        self.assertEqual(mock_vote({"hint": "danger", "from_left": None, "from_right": None}), "evacuate")
        self.assertEqual(mock_vote({"hint": "safe", "from_left": "evacuate", "from_right": None}), "stay")
        self.assertEqual(mock_vote({"hint": "danger", "from_left": "stay", "from_right": "stay"}), "stay")

    def test_directional_drop_before_flip(self):
        mock = MockCity()
        mock.init(1, {"seed": 1, "drop_rate": .5, "flip_rate": .5, "is_byzantine": False})
        rng = Mock()
        rng.random.side_effect = [.1, .9, .1]
        mock.rng[1] = rng
        reply = mock.turn(1, {"hint": "safe", "from_left": None, "from_right": None})
        self.assertEqual(reply, {"decision": "stay", "sent_left": None, "to_left": "dropped",
                                 "sent_right": "evacuate", "to_right": "flipped"})
        self.assertEqual(rng.random.call_count, 3)

    def test_byzantine_base_is_opposite_truth_not_decision(self):
        mock = MockCity()
        mock.init(1, {"seed": 1, "drop_rate": 0, "flip_rate": 0, "is_byzantine": True, "truth": "danger"})
        reply = mock.turn(1, {"hint": "safe", "from_left": None, "from_right": None})
        self.assertEqual((reply["decision"], reply["sent_left"], reply["sent_right"]), ("stay", "stay", "stay"))

    def test_reinit_resets_rng_and_removes_previous_truth(self):
        mock = MockCity()
        settings = {"seed": 42, "drop_rate": .3, "flip_rate": .4, "is_byzantine": True, "truth": "safe"}
        inputs = {"hint": "danger", "from_left": None, "from_right": None}
        mock.init(1, settings)
        first = [mock.turn(1, inputs) for _ in range(10)]
        mock.init(1, settings)
        self.assertEqual(first, [mock.turn(1, inputs) for _ in range(10)])
        mock.init(1, {**{k: v for k, v in settings.items() if k != "truth"}, "is_byzantine": False})
        self.assertNotIn("truth", mock.settings[1])


class ValidationTests(unittest.TestCase):
    def test_defaults_match_backend(self):
        self.assertEqual(ExperimentConfig.parse({"experiment_id": 1}), ExperimentConfig(1))

    def test_bad_bodies_and_fields(self):
        invalid = [None, [], "request", {}, {"experiment_id": None}, {"experiment_id": True},
                   {"experiment_id": 0}, {"experiment_id": "1"}, {"experiment_id": 1, "n_cities": 7}]
        for field, values in {
            "turns": [0, 21, 1.5, True, "2", None],
            "byzantine_count": [-1, 6, True, 1.1, None],
            "seed": [-1, 2**31, False, "42", 1.2],
            "sensor_error": [-.1, 1.1, float("nan"), float("inf"), True, "0.1", None],
            "drop_rate": [-1, 2, False, []], "flip_rate": [-1, 2, True, {}],
        }.items():
            invalid.extend({"experiment_id": 1, field: value} for value in values)
        for body in invalid:
            with self.subTest(body=body), self.assertRaises(ValueError):
                ExperimentConfig.parse(body)

    def test_boundaries_and_null_seed(self):
        for count in (0, 5):
            config = ExperimentConfig.parse({"experiment_id": 1, "turns": 20, "byzantine_count": count,
                                             "seed": None, "sensor_error": 1, "drop_rate": 0, "flip_rate": 1})
            mock = MockCity()
            self.assertEqual(len(list(simulate(config, mock.turn, mock.init))), 20)


class ServiceTests(unittest.TestCase):
    def test_init_failures_prevent_turns_and_backend_writes(self):
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
        transport = Transport()
        transport.fail_city = 3
        with self.assertRaisesRegex(RuntimeError, r"acknowledged 0/10.*turn 1, city 3"):
            GodService(transport).run({"experiment_id": 1})
        self.assertEqual(transport.turns, [])
        self.assertEqual(len(transport.cities), 3)

    def test_backend_failure_stops_without_retry(self):
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
        transport = Transport()
        service = GodService(transport)
        service.run({"experiment_id": 1, "turns": 1})
        with self.assertRaisesRegex(RuntimeError, "already attempted"):
            service.run({"experiment_id": 1, "turns": 1})
        self.assertEqual(len(transport.turns), 1)

    def test_bad_acknowledgements(self):
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
        for reply in (None, [], {}, {"decision": "safe"}, {"decision": []}, {"decision": True}):
            with self.subTest(reply=reply), self.assertRaisesRegex(RuntimeError, "city 1"):
                GodService(lambda method, url, data: {"ok": True} if url.endswith("/init") else reply).run({"experiment_id": 1})

    def test_busy_service_rejects_another_experiment(self):
        service = GodService(Transport())
        service._lock.acquire()
        try:
            with self.assertRaisesRegex(RuntimeError, "already running"):
                service.run({"experiment_id": 1})
        finally:
            service._lock.release()
        self.assertEqual(service.run({"experiment_id": 1, "turns": 1}), {"ok": True})

    def test_invalid_config_does_not_contact_services(self):
        transport = Transport()
        service = GodService(transport)
        with self.assertRaises(ValueError):
            service.run({"experiment_id": 1, "turns": 0})
        self.assertEqual(transport.cities, [])
        self.assertEqual(service.run({"experiment_id": 1, "turns": 1}), {"ok": True})


class HealthTests(unittest.TestCase):
    def test_health_keeps_existing_five_city_format(self):
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
        with patch.dict("os.environ", {"N_CITIES": "5"}), patch.object(main, "serve") as serve, patch.object(main.logging, "basicConfig"):
            main.main()
            self.assertEqual(serve.call_args.args[0], {("GET", "/health"): main.health, ("POST", "/run"): main.run})

    def test_entrypoint_rejects_other_city_count(self):
        with patch.dict("os.environ", {"N_CITIES": "7"}), self.assertRaisesRegex(ValueError, "N_CITIES=5"):
            main.main()


if __name__ == "__main__":
    unittest.main()
