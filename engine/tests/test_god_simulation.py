"""God 시뮬레이션 규칙 테스트. 테스트 전용 City(MockCity)를 쓴다."""
import copy
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from god.simulation import DECISION_OF, ExperimentConfig, city_seed, neighbors, simulate
from god_helpers import MockCity, mock_vote, results, stay_reply


class SimulationTests(unittest.TestCase):
    def test_exactly_five_normal_cities(self):
        """비잔틴 0곳·센서 오류 0이면 도시 5곳이 모두 정상이고 정확도는 1이다."""
        for turn in results(byzantine_count=0, sensor_error=0, turns=20):
            self.assertEqual([c["city"] for c in turn["cities"]], [1, 2, 3, 4, 5])
            self.assertFalse(any(c["is_byzantine"] for c in turn["cities"]))
            self.assertEqual(turn["accuracy"], 1)

    def test_byzantine_selection_is_fixed_for_every_count(self):
        """비잔틴 수(0~5)만큼 뽑히고, 뽑힌 도시는 모든 턴에서 같다."""
        for count in range(6):
            turns = results(byzantine_count=count)
            selected = [{c["city"] for c in t["cities"] if c["is_byzantine"]} for t in turns]
            self.assertEqual(len(selected[0]), count)
            self.assertTrue(all(ids == selected[0] for ids in selected))

    def test_truth_is_sampled_once(self):
        """정답은 실험 시작 때 한 번만 정해지고 모든 턴에서 같다."""
        self.assertEqual(len({t["truth"] for t in results(turns=20)}), 1)

    def test_first_turn_has_no_received_messages(self):
        """첫 턴에는 이웃에게 받은 메시지가 없다."""
        self.assertTrue(all(c["from_left"] is None and c["from_right"] is None
                            for c in results()[0]["cities"]))

    def test_sensor_error_extremes(self):
        """센서 오류가 0이면 힌트가 모두 정답, 1이면 모두 오답이다."""
        for error in (0, 1):
            turn = results(sensor_error=error)[0]
            for city in turn["cities"]:
                self.assertEqual(city["hint"] == turn["truth"], error == 0)
            self.assertEqual(turn["accuracy"], 1 - error)

    def test_ring_relay_drop_and_flip(self):
        """메시지가 원형으로 이웃에게 전달되고, 누락·조작 상태가 받은 값에 그대로 반영된다."""
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
        """정확도는 비잔틴 도시를 포함한 5곳 중 정답을 고른 비율이다."""
        for count in (1, 5):
            for turn in results(byzantine_count=count, sensor_error=.5):
                expected = sum(c["decision"] == DECISION_OF[turn["truth"]] for c in turn["cities"]) / 5
                self.assertEqual(turn["accuracy"], expected)

    def test_city_decision_is_recorded_without_god_voting(self):
        """신은 직접 투표하지 않고 도시가 보낸 결정을 그대로 기록한다."""
        turn = next(simulate(ExperimentConfig(1, sensor_error=0), lambda _, inputs: stay_reply(inputs),
                             lambda *_: {"ok": True}))
        self.assertTrue(all(c["decision"] == "stay" for c in turn["cities"]))

    def test_same_seed_repeats_and_different_seeds_vary(self):
        """같은 seed는 같은 결과, 다른 seed는 다른 결과가 나온다."""
        self.assertEqual(results(), results())
        self.assertNotEqual(results(seed=42), results(seed=43))

    def test_null_seed_varies_between_runs(self):
        """seed가 없으면 신이 만드는 정답과 힌트가 실행할 때마다 달라진다."""
        def god_draws():
            return [(t["truth"], [c["hint"] for c in t["cities"]])
                    for t in results(seed=None, turns=20, sensor_error=.3)]
        self.assertNotEqual(god_draws(), god_draws())

    def test_experiment_id_does_not_affect_seed(self):
        """실험 번호가 달라도 seed가 같으면 결과가 같다."""
        mock = MockCity()
        a = list(simulate(ExperimentConfig(1, seed=9), mock.turn, mock.init))
        b = list(simulate(ExperimentConfig(2, seed=9), mock.turn, mock.init))
        self.assertEqual(a, b)

    def test_god_sensors_do_not_depend_on_city_drop_flip_draws(self):
        """도시의 누락·조작 확률이 바뀌어도 신이 만든 정답과 힌트는 그대로다."""
        normal = results(drop_rate=0, flip_rate=0)
        dropped = results(drop_rate=1, flip_rate=1)
        self.assertEqual([(t["truth"], [c["hint"] for c in t["cities"]]) for t in normal],
                         [(t["truth"], [c["hint"] for c in t["cities"]]) for t in dropped])

    def test_all_init_before_turns_and_truth_only_to_byzantine(self):
        """첫 턴 전에 5곳 모두 초기화하고, 정답은 비잔틴 도시에만 알려 준다."""
        mock, events, settings = MockCity(), [], {}
        def init(city, body):
            events.append(("init", city))
            settings[city] = copy.deepcopy(body)
            return mock.init(city, body)
        def turn(city, body):
            events.append(("turn", city))
            self.assertEqual(set(body), {"hint", "received"})
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
        """신은 도시가 보낸 메시지를 고치지 않고 그대로 이웃에게 전달한다."""
        calls = []
        def city_turn(city, inputs):
            calls.append((city, copy.deepcopy(inputs)))
            # Deliberately different from the City decision. God must not derive
            # messages from decision, truth, rates, or a "flipped" status.
            left, right = inputs["received"]
            return {"decision": "stay",
                    "sent": {left: "evacuate" if city % 2 else "stay", right: None if city == 5 else "evacuate"},
                    "to": {left: "normal", right: "dropped" if city == 5 else "flipped"}}
        turns = list(simulate(ExperimentConfig(1, turns=2, drop_rate=1, flip_rate=1, byzantine_count=5),
                              city_turn, lambda *_: {"ok": True}))
        self.assertTrue(all(set(v["received"].values()) == {None} for _, v in calls[:5]))
        for city, inputs in calls[5:]:
            right = city % 5 + 1
            self.assertEqual(list(inputs["received"]), [str((city - 2) % 5 + 1), str(right)])
            from_left, from_right = inputs["received"].values()
            self.assertEqual(from_left, None if city == 1 else "evacuate")
            self.assertEqual(from_right, "evacuate" if right % 2 else "stay")
            row = turns[1]["cities"][city - 1]
            self.assertEqual((row["from_left"], row["from_right"]), (from_left, from_right))
            self.assertEqual((row["to_left"], row["to_right"]),
                             ("normal", "dropped" if city == 5 else "flipped"))

    def test_sensor_random_draw_per_city_per_turn(self):
        """센서 힌트는 턴마다, 도시마다 따로 뽑는다."""
        rng = Mock()
        rng.choice.return_value = "danger"
        rng.sample.return_value = []
        rng.random.side_effect = [.1, .9, .2, .8, .3, .7, .4, .6, .49, .51]
        with patch("god.simulation.random.Random", return_value=rng):
            turns = list(simulate(ExperimentConfig(1, turns=2, sensor_error=.5),
                                  lambda _, inputs: stay_reply(inputs), lambda *_: {"ok": True}))
        self.assertEqual([[c["hint"] for c in t["cities"]] for t in turns],
                         [["safe", "danger", "safe", "danger", "safe"],
                          ["danger", "safe", "danger", "safe", "danger"]])
        self.assertEqual(rng.random.call_count, 10)
        rng.choice.assert_called_once()

    def test_city_seeds_stable_and_independent(self):
        """도시별 seed는 서로 다르고 실험 seed가 같으면 항상 같으며, seed가 없으면 None이다."""
        seeds = [city_seed(42, c) for c in range(1, 6)]
        self.assertEqual(len(set(seeds)), 5)
        self.assertTrue(all(0 <= seed < 2**31 for seed in seeds))
        self.assertEqual(seeds, [city_seed(42, c) for c in range(1, 6)])
        self.assertNotEqual(seeds, [city_seed(43, c) for c in range(1, 6)])
        self.assertIsNone(city_seed(None, 1))

    def test_neighbors_ring_and_all(self):
        """ring은 [왼쪽, 오른쪽] 2곳, all은 자기를 뺀 n-1곳과 주고받는다."""
        self.assertEqual(neighbors(1, 5, "ring"), [5, 2])
        self.assertEqual(neighbors(5, 5, "ring"), [4, 1])
        for n in (3, 5):
            for city in range(1, n + 1):
                self.assertEqual(neighbors(city, n, "all"), [c for c in range(1, n + 1) if c != city])

    def test_all_connection_inputs_and_rows(self):
        """all 연결이면 City는 이웃 n-1곳의 값을 받고, 결과 줄은 received·to로 남는다."""
        calls = []
        mock = MockCity()
        def turn(city, inputs):
            calls.append((city, inputs))
            return mock.turn(city, inputs)
        turns = list(simulate(ExperimentConfig(1, turns=2, seed=3, connection="all", n_cities=4),
                              turn, mock.init))
        self.assertEqual([c for c, _ in calls], [1, 2, 3, 4] * 2)
        for city, inputs in calls:
            self.assertEqual(sorted(inputs["received"]), [str(c) for c in range(1, 5) if c != city])
        for row in turns[0]["cities"]:
            self.assertEqual(set(row), {"city", "is_byzantine", "hint", "received", "decision", "to"})
            self.assertEqual(set(row["received"].values()), {None})
            self.assertEqual(len(row["to"]), 3)
        self.assertEqual(turns[0]["accuracy"] * 4, sum(
            c["decision"] == DECISION_OF[turns[0]["truth"]] for c in turns[0]["cities"]))

    def test_per_recipient_messages_are_relayed(self):
        """도시가 수신자마다 다른 값을 보내면 신은 각 수신자에게 그 값만 전달한다."""
        calls = []
        def city_turn(city, inputs):
            calls.append((city, inputs))
            # 짝수 id 수신자에게는 evacuate, 홀수 id 수신자에게는 stay
            sent = {k: "evacuate" if int(k) % 2 == 0 else "stay" for k in inputs["received"]}
            return {"decision": "stay", "sent": sent, "to": dict.fromkeys(sent, "normal")}
        for connection in ("ring", "all"):
            calls.clear()
            list(simulate(ExperimentConfig(1, turns=2, connection=connection), city_turn, lambda *_: {"ok": True}))
            for city, inputs in calls[5:]:
                expected = "evacuate" if city % 2 == 0 else "stay"
                self.assertEqual(set(inputs["received"].values()), {expected})


class MockCityTests(unittest.TestCase):
    def test_vote_ignores_null_and_tie_uses_hint(self):
        """(테스트용 City) 받지 못한 메시지는 빼고 투표하며, 동점이면 힌트를 따른다."""
        self.assertEqual(mock_vote({"hint": "danger", "received": {"5": None, "2": None}}), "evacuate")
        self.assertEqual(mock_vote({"hint": "safe", "received": {"5": "evacuate", "2": None}}), "stay")
        self.assertEqual(mock_vote({"hint": "danger", "received": {"5": "stay", "2": "stay"}}), "stay")

    def test_directional_drop_before_flip(self):
        """(테스트용 City) 왼쪽·오른쪽을 따로 판정하고, 누락을 조작보다 먼저 검사한다."""
        mock = MockCity()
        mock.init(1, {"seed": 1, "drop_rate": .5, "flip_rate": .5, "is_byzantine": False})
        rng = Mock()
        rng.random.side_effect = [.1, .9, .1]
        mock.rng[1] = rng
        reply = mock.turn(1, {"hint": "safe", "received": {"5": None, "2": None}})
        self.assertEqual(reply, {"decision": "stay", "sent": {"5": None, "2": "evacuate"},
                                 "to": {"5": "dropped", "2": "flipped"}})
        self.assertEqual(rng.random.call_count, 3)

    def test_byzantine_base_is_opposite_truth_not_decision(self):
        """(테스트용 City) 비잔틴은 자기 결정이 아니라 정답의 반대를 보낸다."""
        mock = MockCity()
        mock.init(1, {"seed": 1, "drop_rate": 0, "flip_rate": 0, "is_byzantine": True, "truth": "danger"})
        reply = mock.turn(1, {"hint": "safe", "received": {"5": None, "2": None}})
        self.assertEqual((reply["decision"], reply["sent"]), ("stay", {"5": "stay", "2": "stay"}))

    def test_reinit_resets_rng_and_removes_previous_truth(self):
        """(테스트용 City) 다시 초기화하면 난수가 처음부터 시작되고 이전 정답은 지워진다."""
        mock = MockCity()
        settings = {"seed": 42, "drop_rate": .3, "flip_rate": .4, "is_byzantine": True, "truth": "safe"}
        inputs = {"hint": "danger", "received": {"5": None, "2": None}}
        mock.init(1, settings)
        first = [mock.turn(1, inputs) for _ in range(10)]
        mock.init(1, settings)
        self.assertEqual(first, [mock.turn(1, inputs) for _ in range(10)])
        mock.init(1, {**{k: v for k, v in settings.items() if k != "truth"}, "is_byzantine": False})
        self.assertNotIn("truth", mock.settings[1])


if __name__ == "__main__":
    unittest.main()
