"""God 마피아 게임 (docs/spec.md 7.5~7.8). City는 7.10 형식으로 답하는 대역이다."""
from pathlib import Path
import os
import sys
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import http
from common.http import HttpError
from god import main
from god.game import Game, GameConfig
from god.simulation import DECISION_OF, GodService
from god_helpers import running_server
from city.ai import ai_turn


def majority_city(_, req):
    """다수결 시민: 힌트 1표 + 받은 주장마다 1표, 동점이면 힌트."""
    own = DECISION_OF[req["hint"]]
    votes = [own] + [m["claim"] for m in req["received"].values() if m]
    evac = votes.count("evacuate") * 2
    return {"decision": own if evac == len(votes) else "evacuate" if evac > len(votes) else "stay",
            "suspicion": None, "reason": None}


def fixed_city(decision=None, suspicion=None):
    """decision(city, req) / suspicion(city, req)로 답을 정하는 대역. 지정 안 하면 다수결 결정, 의심도 그대로."""
    calls = []

    def city(c, req):
        calls.append((c, req))
        return {"decision": decision(c, req) if decision else majority_city(c, req)["decision"],
                "suspicion": suspicion(c, req) if suspicion else req["suspicion"], "reason": None}
    city.calls = calls
    return city


def new_game(**cfg):
    return Game(*GameConfig.parse({"game_id": 7, "seed": 1, **cfg}))


def claims_for(game, claim="stay"):
    return {k: {"claim": claim, "note": ""} for k in game.receivers()}


def play(game, city, claims=None):
    return game.play({"turn": game.turn + 1, "claims": claims_for(game) if claims is None else claims}, city)


class GameRuleTests(unittest.TestCase):
    def test_setup_roles_hints_and_state(self):
        """역할·힌트·상태가 7.8 형식이고 같은 seed면 같다."""
        g = new_game(mafia_count=2)
        roles = list(g.roles.values())
        self.assertEqual((roles.count("player"), roles.count("colleague"), roles.count("citizen")), (1, 1, 3))
        state = g.state()
        self.assertEqual(state["turn"], 0)
        self.assertEqual(set(state["next_hints"]), {str(c) for c in g.citizens})
        self.assertEqual(state["config"]["citizen_type"], "wary")
        self.assertEqual(new_game(mafia_count=2).state(), state)

    def test_claims_and_contradictions(self):
        """사람 플레이어가 시민마다 다르게 말하면 공유 쌍에 모순으로 잡히고, 시민의 첫 턴 주장은 null이다."""
        g = new_game(share_mode="all", citizen_type="majority")
        city = fixed_city()
        p, cits = g.player, g.citizens
        claims = {str(c): {"claim": "stay" if i % 2 else "evacuate"} for i, c in enumerate(cits)}
        result = play(g, city, claims)
        row = next(r for r in result["cities"] if r["city"] == cits[0])
        self.assertEqual(row["received"][str(p)], {"claim": "evacuate", "note": ""})
        self.assertTrue(all(row["received"][str(c)] is None for c in cits[1:]))
        self.assertEqual(len(result["sharing"]), 6)  # 시민 4명의 모든 쌍
        for share in result["sharing"]:
            a, b = share["pair"]
            differ = (cits.index(a) - cits.index(b)) % 2 == 1
            self.assertEqual(share["contradictions"], [{"city": p, "told": {
                str(a): {"claim": claims[str(a)]["claim"], "note": ""},
                str(b): {"claim": claims[str(b)]["claim"], "note": ""}}}] if differ else [])
        # City는 자기가 속한 쌍만 받는다
        for c, req in city.calls:
            self.assertEqual(req["shared"], [s for s in result["sharing"] if c in s["pair"]])
            self.assertIsNone(req["suspicion"])
            self.assertNotIn("past_hints", req)
        # 2턴: 시민은 직전 결정을 모두에게 같게 보내므로 시민에 대한 모순은 없다
        first = {r["city"]: r["decision"] for r in result["cities"]}
        result = play(g, city, claims_for(g))
        self.assertTrue(all(s["contradictions"] == [] for s in result["sharing"]))
        row = next(r for r in result["cities"] if r["city"] == cits[0])
        self.assertEqual(row["received"][str(cits[1])], {"claim": first[cits[1]], "note": ""})

    def test_share_modes_and_ring(self):
        """pairs는 share_pairs쌍, none은 공유 없음. ring이면 양옆 이웃에게서만 받는다."""
        self.assertEqual(len(play(new_game(share_pairs=2), fixed_city())["sharing"]), 2)
        self.assertEqual(play(new_game(share_mode="none"), fixed_city())["sharing"], [])
        g = new_game(connection="ring")
        self.assertTrue(g.receivers() <= {str((g.player - 2) % 5 + 1), str(g.player % 5 + 1)})
        for row in play(g, fixed_city())["cities"]:
            if row["role"] == "citizen":
                self.assertEqual(len(row["received"]), 2)

    def test_bot_and_colleague_always_lie(self):
        """봇 플레이어와 동료는 1턴부터 정답의 반대를 보낸다. 봇이면 claims는 {}."""
        g = new_game(player="bot", mafia_count=2)
        self.assertEqual(g.receivers(), set())
        lie = "stay" if g.truth == "danger" else "evacuate"
        result = play(g, fixed_city(), {})
        for row in result["cities"]:
            if row["role"] == "citizen":
                for s, m in row["received"].items():
                    self.assertEqual(m, {"claim": lie, "note": ""} if g.roles[int(s)] != "citizen" else None)
            else:
                self.assertEqual(list(row.values())[1:], [row["role"]] + [None] * 6)

    def test_memory_past_hints(self):
        """recent는 최근 1개, full은 지난 힌트 전부, turn은 필드 없음."""
        for memory, lengths in (("recent", [0, 1, 1]), ("full", [0, 1, 2])):
            g, city = new_game(memory=memory), fixed_city()
            hints = []
            for _ in range(3):
                hints.append(dict(g.hints))
                play(g, city)
            c = g.citizens[0]
            got = [req["past_hints"] for cc, req in city.calls if cc == c]
            self.assertEqual([len(h) for h in got], lengths)
            self.assertEqual(got[2][-1], hints[1][str(c)])

    def suspect(self, targets):
        """시민 c가 targets[c]를 100으로 의심하는 대역 (나머지 0)."""
        return fixed_city(suspicion=lambda c, req: {k: 100 if k == str(targets[c]) else 0 for k in req["suspicion"]})

    def test_vote_majority_accuses_citizen_and_game_continues(self):
        """과반이 시민을 지목하면 accused지만 게임은 계속된다."""
        g = new_game()
        a, b, c, d = g.citizens
        result = play(g, self.suspect({a: b, b: a, c: b, d: b}))
        self.assertEqual(result["vote"], {"ballots": {str(a): b, str(b): a, str(c): b, str(d): b},
                                          "accused": b, "caught": False})
        self.assertFalse(result["game_over"])
        self.assertIsNotNone(result["next_hints"])

    def test_vote_two_two_has_no_accused(self):
        g = new_game()
        a, b, c, d = g.citizens
        self.assertIsNone(play(g, self.suspect({a: b, b: a, c: b, d: a}))["vote"]["accused"])

    def test_vote_not_opened_below_threshold(self):
        g = new_game()
        result = play(g, fixed_city(suspicion=lambda c, req: dict.fromkeys(req["suspicion"], 59)))
        self.assertIsNone(result["vote"])

    def test_vote_tie_is_random_among_top(self):
        """최고 의심도가 동점이면 동점 도시 중 무작위로 투표한다 (자기 제외)."""
        seen = set()
        for seed in range(20):
            g = Game(7, GameConfig(seed=seed))
            result = play(g, fixed_city(suspicion=lambda c, req: dict.fromkeys(req["suspicion"], 60)))
            for voter, target in result["vote"]["ballots"].items():
                self.assertNotEqual(int(voter), target)
                seen.add(target)
        self.assertEqual(seen, {1, 2, 3, 4, 5})

    def test_catching_mafia_ends_game_immediately(self):
        """동료가 지목돼도 즉시 패배로 끝나고 다음 턴은 409."""
        g = new_game(mafia_count=2)
        colleague = next(c for c, r in g.roles.items() if r == "colleague")
        result = play(g, self.suspect(dict.fromkeys(g.citizens, colleague)))
        self.assertEqual(result["vote"]["accused"], colleague)
        self.assertTrue(result["vote"]["caught"])
        self.assertEqual((result["game_over"], result["outcome"], result["end_reason"], result["next_hints"]),
                         (True, "loss", "caught", None))
        with self.assertRaises(HttpError) as caught:
            play(g, fixed_city())
        self.assertEqual(caught.exception.status, 409)

    def test_final_outcomes(self):
        """15턴 시민 결정으로 완승/승리/패배. 4명 2:2는 패배."""
        for wrong_count, outcome in ((4, "perfect_win"), (3, "win"), (2, "loss"), (0, "loss")):
            g = new_game(citizen_type="majority")
            wrong = set(g.citizens[:wrong_count])
            answer = DECISION_OF[g.truth]
            city = fixed_city(decision=lambda c, req: {"evacuate": "stay", "stay": "evacuate"}[answer]
                              if c in wrong else answer)
            for t in range(1, 16):
                result = play(g, city)
                self.assertEqual(result["turn"], t)
                self.assertEqual(result["game_over"], t == 15)
            self.assertEqual((result["outcome"], result["end_reason"], result["next_hints"]),
                             (outcome, "turns_done", None))
            self.assertEqual(result["accuracy"], 1 - wrong_count / 4)
            self.assertEqual(g.state()["turn"], 15)
        g = new_game(mafia_count=2, citizen_type="majority")  # 시민 3명이면 2명 오답이 승리
        wrong = set(g.citizens[:2])
        answer = DECISION_OF[g.truth]
        city = fixed_city(decision=lambda c, req: {"evacuate": "stay", "stay": "evacuate"}[answer]
                          if c in wrong else answer)
        for _ in range(15):
            result = play(g, city)
        self.assertEqual(result["outcome"], "win")

    def test_invalid_requests(self):
        """turn이 다음이 아니면 409, claims 키·값이 틀리면 422."""
        g = new_game()
        good = claims_for(g)
        extra = {**good, str(g.player): {"claim": "stay"}}
        missing = dict(list(good.items())[1:])
        bad_value = {k: {"claim": "danger"} for k in good}
        for body, status in (({"turn": 2, "claims": good}, 409), ({"turn": 0, "claims": good}, 409),
                             ({"turn": 1, "claims": extra}, 422), ({"turn": 1, "claims": missing}, 422),
                             ({"turn": 1, "claims": bad_value}, 422), ({"turn": 1}, 422), ({"turn": "1"}, 422),
                             ([], 422), ({"turn": 1, "claims": {k: ["stay"] for k in good}}, 422)):
            with self.subTest(body=body), self.assertRaises(HttpError) as caught:
                g.play(body, fixed_city())
            self.assertEqual(caught.exception.status, status)
        self.assertEqual(g.turn, 0)
        play(g, fixed_city(), {k: {"claim": "stay"} for k in good})  # note 생략 가능

    def test_invalid_config(self):
        for body in ({}, {"game_id": 0}, {"game_id": 1, "mafia_count": 3}, {"game_id": 1, "player": "x"},
                     {"game_id": 1, "share_pairs": 0}, {"game_id": 1, "sensor_error": 2}, {"game_id": 1, "x": 1},
                     {"game_id": 1, "seed": 1.5}, None):
            with self.subTest(body=body), self.assertRaises(HttpError) as caught:
                GameConfig.parse(body)
            self.assertEqual(caught.exception.status, 422)

    def test_invalid_city_reply(self):
        """City 응답 형식이 틀리면 턴 번호와 도시를 담아 실패한다."""
        for reply in ({"decision": "x"}, {"decision": "stay", "suspicion": {}},
                      {"decision": "stay", "suspicion": None}, None):
            with self.subTest(reply=reply), self.assertRaisesRegex(RuntimeError, "turn 1, city"):
                play(new_game(), lambda c, req: reply)
        with self.assertRaisesRegex(RuntimeError, "suspicion=null"):
            play(new_game(citizen_type="majority"), lambda c, req: {"decision": "stay", "suspicion": {}})


class GameAiTests(unittest.TestCase):
    def test_personality_alternates_only_for_ai(self):
        """ai면 요청에 홀수 suspicious·짝수 trusting이 들어가고, 다른 시민 종류엔 없다."""
        city = fixed_city()
        g = new_game(citizen_type="ai", player="bot")
        play(g, city)
        self.assertEqual({c: r["personality"] for c, r in city.calls},
                         {c: "suspicious" if c % 2 else "trusting" for c in g.citizens})
        city = fixed_city()
        play(new_game(player="bot"), city)
        self.assertTrue(all("personality" not in r for _, r in city.calls))

    def test_parallel_matches_sequential_and_fake_llm_game(self):
        """병렬 호출 결과가 순차 계산과 같고, 가짜 LLM(키 없음) AI 시민으로 한 판 끝까지 간다."""
        def ai_city(c, req):
            d, s, r = ai_turn(req["personality"], req["hint"], req["received"], req["shared"], req["suspicion"])
            return {"decision": d, "suspicion": s, "reason": r}

        def run(city, **cfg):
            g, out = new_game(player="bot", **cfg), []
            while not g.game_over:
                out.append(play(g, city))
            return out
        with patch.dict(os.environ, {"LLM_API_KEY": ""}):
            games = run(ai_city, citizen_type="ai")
        self.assertIn(games[-1]["end_reason"], ("turns_done", "caught"))
        # 규칙 시민: 호출이 겹치게 느려도 결과가 같은 seed의 순차 결과(무작위 지연 없는 대역)와 같다
        slow = lambda c, req: (time.sleep(0.01 * (6 - c)), majority_city(c, req))[1]
        self.assertEqual(run(slow, citizen_type="majority"), run(majority_city, citizen_type="majority"))


class GameHttpTests(unittest.TestCase):
    def setUp(self):
        for target in (patch.object(http.traceback, "print_exc"),
                       patch.object(http.BaseHTTPRequestHandler, "log_message")):
            target.start()
            self.addCleanup(target.stop)
        service = GodService(lambda method, url, body, timeout=1: majority_city(None, body))
        for target in (patch.object(main, "service", service), patch.object(main, "game", None)):
            target.start()
            self.addCleanup(target.stop)
        server = running_server(main.GAME_ROUTES)
        self.url = server.__enter__()
        self.addCleanup(server.__exit__, None, None, None)

    def status(self, method, path, body=None):
        with self.assertRaises(HTTPError) as caught:
            http.request(method, self.url + path, body, timeout=5)
        caught.exception.close()
        return caught.exception.code

    def test_full_game_over_http(self):
        """POST /games → 15턴 → GET 상태. 끝난 게임과 모르는 게임은 409/404."""
        state = http.request("POST", self.url + "/games", {"game_id": 9, "player": "bot",
                                                          "citizen_type": "majority", "seed": 3}, timeout=5)
        self.assertEqual((state["game_id"], state["turn"]), (9, 0))
        for t in range(1, 16):
            result = http.request("POST", self.url + "/games/9/turns", {"turn": t, "claims": {}}, timeout=5)
        self.assertEqual(result["end_reason"], "turns_done")
        self.assertIn(result["outcome"], ("perfect_win", "win", "loss"))
        state = http.request("GET", self.url + "/games/9", timeout=5)
        self.assertEqual((state["turn"], state["game_over"], state["next_hints"]), (15, True, None))
        self.assertEqual(self.status("POST", "/games/9/turns", {"turn": 16, "claims": {}}), 409)
        self.assertEqual(self.status("GET", "/games/8"), 404)
        self.assertEqual(self.status("POST", "/games/x/turns", {"turn": 1, "claims": {}}), 404)
        # 새 게임이 오면 이전 게임은 버린다
        http.request("POST", self.url + "/games", {"game_id": 10}, timeout=5)
        self.assertEqual(self.status("GET", "/games/9"), 404)

    def test_errors_over_http(self):
        self.assertEqual(self.status("POST", "/games", {"game_id": 1, "mafia_count": 5}), 422)
        http.request("POST", self.url + "/games", {"game_id": 1}, timeout=5)
        self.assertEqual(self.status("POST", "/games/1/turns", {"turn": 1, "claims": {}}), 422)


if __name__ == "__main__":
    unittest.main()
