"""AI 시민 (spec 7.10, 7.11): 가짜 LLM, 깨진 응답 대체, 의심도 제한, 프롬프트 성격. 실제 네트워크 호출 없음."""
import json
import io
import os
import sys
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CITY_ID", "1")
from city.ai import PERSONALITY, ai_turn, build_prompt, build_system_prompt
from city import ai
from city.logic import game_turn
from city import main

RECV = {"2": {"claim": "evacuate", "note": ""}, "3": {"claim": "stay", "note": ""}, "4": None}
SHARED = [{"pair": [1, 2], "contradictions": [{"city": 3, "told": {}}]}]
SUSP = {"2": 0, "3": 50, "4": 10}


def answer(**kw):
    return lambda _p: json.dumps({"decision": "stay", "suspicion": SUSP, "reason": "ok", **kw})


class AiCitizen(unittest.TestCase):
    def test_fake_llm_matches_wary(self):
        with mock.patch.dict(os.environ, {"LLM_API_KEY": ""}), \
                mock.patch("urllib.request.urlopen", side_effect=AssertionError("네트워크 금지")):
            d, s, r = ai_turn("suspicious", "danger", RECV, SHARED, SUSP)
        wd, ws, wr = game_turn("danger", RECV, SHARED, SUSP)
        self.assertEqual((d, s, r), (wd, ws, wr))

    def test_broken_response_falls_back_to_wary(self):
        wd, ws, _ = game_turn("danger", RECV, SHARED, SUSP)
        for bad in ["말로만 답함", '{"decision": "run"}', '{"decision": "stay", "suspicion": {"2": "high"}}']:
            d, s, r = ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=lambda _p, b=bad: b)
            self.assertEqual((d, s), (wd, ws))
            self.assertIn("눈치 규칙 대체", r)
        d, s, r = ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=mock.Mock(side_effect=OSError))
        self.assertEqual((d, s), (wd, ws))
        self.assertIn("OSError", r)

    def test_wrapped_json_and_clamp(self):
        text = '설명\n```json\n{"decision": "stay", "suspicion": {"2": -5, "3": 140.6, "9": 1}, "reason": "' + "가" * 500 + '"}\n```'
        d, s, r = ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=lambda _p: text)
        self.assertEqual(d, "stay")
        self.assertEqual(s, {"2": 0, "3": 100, "4": 10})  # 범위 제한, 빠진 4번은 직전 값, 모르는 9번은 버림
        self.assertEqual(len(r), 200)

    def test_prompt_has_personality_and_inputs(self):
        for p, text in PERSONALITY.items():
            prompt = build_prompt(p, "safe", RECV, SHARED, SUSP)
            self.assertIn(text, build_system_prompt(p, SUSP))
            self.assertIn("safe", prompt)
            self.assertIn("['3']", prompt)  # 모순 도시

    def test_main_routes_personality(self):
        body = {"turn": 1, "hint": "danger", "received": RECV, "shared": SHARED, "suspicion": SUSP,
                "personality": "suspicious"}
        with mock.patch.object(main, "ai_turn", return_value=("stay", SUSP, "x")) as f:
            self.assertEqual(main.turn(body), {"decision": "stay", "suspicion": SUSP, "reason": "x"})
        f.assert_called_once()


class ApiCitizen(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ, {"LLM_API_KEY": "unit-test-placeholder", "LLM_MODEL": "test-model",
                              "LLM_BASE_URL": "https://api.groq.com/openai/v1", "LLM_TIMEOUT": "30",
                              "LLM_JSON_MODE": "none", "LLM_REASONING_EFFORT": ""})
        env.start()
        self.addCleanup(env.stop)

    def envelope(self, content=None, **choice):
        """실제 API 규격을 따르는 가짜 응답 스트림을 만드는 기능"""
        if content is None:
            content = answer()(None)
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": content},
                                                 "finish_reason": "stop", **choice}]}).encode())

    def turn(self):
        return ai_turn("suspicious", "danger", RECV, SHARED, SUSP)

    def test_base_and_full_urls_preserve_compatibility(self):
        for url, expected in (("https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1/chat/completions"),
                              ("https://api.groq.com/openai/v1/", "https://api.groq.com/openai/v1/chat/completions"),
                              ("https://host.invalid/v1/chat/completions", "https://host.invalid/v1/chat/completions"),
                              ("https://host.invalid/gateway/", "https://host.invalid/gateway/"),
                              ("http://localhost:11434/v1", "http://localhost:11434/v1/chat/completions")):
            with self.subTest(url=url), mock.patch.dict(os.environ, {"LLM_BASE_URL": url}), \
                    mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope()) as send:
                self.assertEqual(self.turn(), ("stay", SUSP, "ok"))
                req = send.call_args.args[0]
                self.assertEqual(req.full_url, expected)
                self.assertEqual(json.loads(req.data)["model"], "test-model")
                self.assertEqual(send.call_args.kwargs["timeout"], 30)
                self.assertNotIn("response_format", json.loads(req.data))

    def test_json_mode_and_timeout_are_explicit_options(self):
        with mock.patch.dict(os.environ, {"LLM_JSON_MODE": "json_object", "LLM_TIMEOUT": "5"}), \
                mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope()) as send:
            self.turn()
            self.assertEqual(json.loads(send.call_args.args[0].data)["response_format"], {"type": "json_object"})
            self.assertEqual(json.loads(send.call_args.args[0].data)["max_tokens"], 1024)
            self.assertEqual(send.call_args.kwargs["timeout"], 5)

    def test_reasoning_effort_is_opt_in_and_invalid_value_never_calls_api(self):
        for effort in ("", "low", "medium", "high"):
            with self.subTest(effort=effort), mock.patch.dict(os.environ, {"LLM_REASONING_EFFORT": effort}), \
                    mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope()) as send:
                self.turn()
                body = json.loads(send.call_args.args[0].data)
                self.assertEqual(body.get("reasoning_effort"), effort or None)
        with mock.patch.dict(os.environ, {"LLM_REASONING_EFFORT": "none"}), \
                mock.patch.object(ai.urllib.request, "urlopen") as send:
            self.assertIn("눈치 규칙 대체", self.turn()[2])
            send.assert_not_called()

    def test_usage_and_limit_metadata_exclude_response_content(self):
        response = self.envelope()
        data = json.loads(response.getvalue())
        data["usage"] = {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30,
                         "completion_tokens_details": {"reasoning_tokens": 12}, "private": "not logged"}
        response = io.BytesIO(json.dumps(data).encode())
        response.headers = {"x-ratelimit-remaining-tokens": "7000", "Authorization": "not logged"}
        with mock.patch.object(ai.urllib.request, "urlopen", return_value=response), self.assertLogs(ai.log, "INFO") as logs:
            self.turn()
        report = next(r for r in logs.records if r.ai_outcome == "response")
        self.assertEqual(report.ai_usage, {"prompt_tokens":10, "completion_tokens":20, "total_tokens":30, "reasoning_tokens":12})
        self.assertEqual(report.ai_limits, {"x-ratelimit-remaining-tokens":"7000"})

    def test_bad_configuration_never_sends_request(self):
        for cfg in ({"LLM_MODEL": ""}, {"LLM_BASE_URL": "bad"}, {"LLM_JSON_MODE": "invalid"},
                    *({"LLM_TIMEOUT": value} for value in ("0", "31", "nan", "inf", "bad"))):
            with self.subTest(cfg=cfg), mock.patch.dict(os.environ, cfg), \
                    mock.patch.object(ai.urllib.request, "urlopen") as send, self.assertLogs(ai.log, "INFO") as logs:
                self.assertIn("눈치 규칙 대체", self.turn()[2])
                send.assert_not_called()
                self.assertEqual(logs.records[-1].ai_cause, "configuration")

    def test_timeout_http_errors_and_network_errors_fall_back_without_retry(self):
        for error, cause in ((TimeoutError("private body"), "timeout"),
                             (URLError(TimeoutError()), "timeout"),
                             (URLError("private body"), "network"),
                             (HTTPError("https://private.invalid", 429, "private body", {}, None), "http_429"),
                             (HTTPError("https://private.invalid", 401, "private body", {}, None), "http_401"),
                             (HTTPError("https://private.invalid", 503, "private body", {}, None), "http_503")):
            with self.subTest(cause=cause), mock.patch.object(ai.urllib.request, "urlopen", side_effect=error) as send, \
                    self.assertLogs(ai.log, "INFO") as logs:
                result = self.turn()
                self.assertEqual(result[:2], game_turn("danger", RECV, SHARED, SUSP)[:2])
                self.assertEqual(send.call_count, 1)
                self.assertEqual(logs.records[-1].ai_cause, cause)
                self.assertNotIn("private", " ".join(logs.output) + result[2])

    def test_bad_envelopes_and_incomplete_output_fall_back(self):
        for raw in (b"not json", b"{}", b'{"choices":[]}',
                    b'{"choices":[{"message":{}}]}', b'{"choices":[{"message":{"content":null}}]}',
                    b'{"choices":[{"message":{"content":[]}}]}',
                    b'{"choices":[{"message":{"content":" "}}]}', b"x" * 65537):
            with self.subTest(raw=raw[:30]), mock.patch.object(ai.urllib.request, "urlopen", return_value=io.BytesIO(raw)):
                self.assertIn("눈치 규칙 대체", self.turn()[2])
        with mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope(finish_reason="length")):
            self.assertIn("눈치 규칙 대체", self.turn()[2])
        with mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope(message={"content":"{}", "refusal":"no"})):
            self.assertIn("눈치 규칙 대체", self.turn()[2])

    def test_required_fields_and_invalid_types_fall_back(self):
        base = json.loads(answer()(None))
        bad = [{k: v for k, v in base.items() if k != missing} for missing in base]
        bad += [dict(base, reason=3), dict(base, suspicion=[]), dict(base, decision="danger")]
        bad += [dict(base, suspicion={**SUSP, "2": value}) for value in (True, "0", None, float("nan"), float("inf"))]
        for data in bad:
            with self.subTest(data=data):
                result = ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=lambda p: json.dumps(data))
                self.assertEqual(result[:2], game_turn("danger", RECV, SHARED, SUSP)[:2])
                self.assertIn("눈치 규칙 대체", result[2])

    def test_city_keys_clamping_and_nullable_reason_keep_existing_contract(self):
        result = ai_turn("trusting", "danger", RECV, SHARED, SUSP,
                         llm=answer(suspicion={"2": -10, "3": 1000.6, "99": 80}, reason=None))
        self.assertEqual(result, ("stay", {"2": 0, "3": 100, "4": 10}, None))

    def test_prompt_has_village_role_grounding_and_korean_dialogue(self):
        prompt = build_system_prompt("suspicious", SUSP)
        for text in ("태풍", "사기꾼", "전달받지 않은", "범인을 확정하지", "한국어 한두 문장", "게임의 투표 기준과 승패 규칙은 바꾸지"):
            self.assertIn(text, prompt)
        self.assertNotIn("note", prompt)
        self.assertNotIn("next_hints", prompt)

    def test_system_instructions_and_user_data_are_separate(self):
        with mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope()) as send:
            self.turn()
        messages = json.loads(send.call_args.args[0].data)["messages"]
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        system, user = [m["content"] for m in messages]
        self.assertIn(PERSONALITY["suspicious"], system)
        self.assertIn("태풍", system)
        self.assertIn("decision", system)
        self.assertNotIn("이번 턴 내 센서 힌트:", system)
        self.assertIn("이번 턴 내 센서 힌트: danger", user)
        self.assertIn(json.dumps(SUSP), user)
        self.assertIn("['3']", user)
        self.assertNotIn(PERSONALITY["suspicious"], user)
        self.assertNotIn("태풍", user)
        self.assertNotIn("next_hints", user)

    def test_missing_key_and_injected_model_are_not_real_successes(self):
        with mock.patch.dict(os.environ, {"LLM_API_KEY": ""}), \
                mock.patch.object(ai.urllib.request, "urlopen") as send, self.assertLogs(ai.log, "INFO") as logs:
            self.turn()
            send.assert_not_called()
            self.assertEqual((logs.records[-1].ai_source, logs.records[-1].ai_outcome, logs.records[-1].ai_cause),
                             ("fake", "fallback", "missing_api_key"))
        with self.assertLogs(ai.log, "INFO") as logs:
            ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=answer())
            self.assertEqual(logs.records[-1].ai_source, "test")

    def test_success_logs_never_include_key_prompt_or_reply(self):
        with mock.patch.object(ai.urllib.request, "urlopen", return_value=self.envelope()), self.assertLogs(ai.log, "INFO") as logs:
            self.turn()
        self.assertEqual(logs.records[-1].ai_outcome, "success")
        self.assertEqual(logs.records[-1].ai_source, "api")
        output = " ".join(logs.output)
        for text in ("unit-test-placeholder", "사기꾼", '"decision"', "Authorization", "test-model"):
            self.assertNotIn(text, output)

    def test_one_game_uses_chat_api_for_every_ai_citizen(self):
        from god.game import Game, GameConfig

        game = Game(1, GameConfig(seed=42, player="bot", citizen_type="ai"))

        def provider(req, **kwargs):
            """프롬프트의 허용 도시만 포함한 가짜 API 응답을 반환하는 기능"""
            prompt = json.loads(req.data)["messages"][1]["content"]
            old = json.loads(prompt.split("직전 내 의심도 (0~100): ")[1].split("\n")[0])
            content = json.dumps({"decision":"stay", "suspicion":dict.fromkeys(old, 0), "reason":"아직은 집에 남아 있을래."})
            return self.envelope(content)

        def city(city_id, req):
            d, s, r = ai_turn(req["personality"], req["hint"], req["received"], req["shared"], req["suspicion"])
            return {"decision":d, "suspicion":s, "reason":r}

        with mock.patch.object(ai.urllib.request, "urlopen", side_effect=provider) as send, self.assertLogs(ai.log, "INFO") as logs:
            for turn in range(1, 16):
                result = game.play({"turn":turn, "claims":{}}, city)
        self.assertTrue(result["game_over"])
        self.assertEqual(result["end_reason"], "turns_done")
        self.assertEqual(send.call_count, 60)
        self.assertEqual(sum(r.ai_outcome == "success" for r in logs.records), 60)
        self.assertFalse(any(r.ai_outcome == "fallback" for r in logs.records))


class LiveCheckGuards(unittest.TestCase):
    def test_token_budget_stops_before_any_call(self):
        from llm_game_smoke import run_game

        with mock.patch.object(ai, "ai_turn") as turn:
            result = run_game(interval=0, token_budget=1)
        turn.assert_not_called()
        self.assertEqual(result["stop_reason"], "token_budget")
        self.assertEqual(result["real_requests"], 0)

    def test_low_limit_header_stops_remaining_requests(self):
        from llm_game_smoke import run_game

        payload = {"choices":[{"message":{"content":answer()(None)}, "finish_reason":"stop"}],
                   "usage":{"prompt_tokens":50,"completion_tokens":50,"total_tokens":100}}
        response = io.BytesIO(json.dumps(payload).encode())
        response.headers = {"x-ratelimit-remaining-requests":"0", "x-ratelimit-remaining-tokens":"0"}
        with mock.patch.dict(os.environ, {"LLM_API_KEY":"unit-test-placeholder", "LLM_MODEL":"test", "LLM_REASONING_EFFORT":""}), \
                mock.patch.object(ai.urllib.request, "urlopen", return_value=response) as send:
            result = run_game(interval=0)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(result["total_tokens"], 100)
        self.assertEqual(result["stop_reason"], "rate_limit_headroom")
        self.assertEqual(result["fallback"], 0)
        self.assertFalse(result["verification_passed"])

    def test_plan_and_missing_key_never_call_api(self):
        import contextlib
        from llm_game_smoke import main as check

        with contextlib.redirect_stdout(io.StringIO()), mock.patch.object(ai.urllib.request, "urlopen") as send:
            self.assertEqual(check([]), 0)
            with mock.patch.dict(os.environ, {"LLM_API_KEY": ""}):
                self.assertEqual(check(["--live"]), 2)
            with mock.patch.dict(os.environ, {"LLM_API_KEY":"unit-test-placeholder",
                                              "LLM_BASE_URL":"https://other.invalid/v1", "LLM_MODEL":"test"}):
                self.assertEqual(check(["--live"]), 2)
            send.assert_not_called()

    def test_fallback_only_game_cannot_pass_live_verification(self):
        from llm_game_smoke import run_game

        with mock.patch.dict(os.environ, {"LLM_API_KEY": ""}), \
                mock.patch.object(ai.urllib.request, "urlopen") as send:
            result = run_game(interval=0)
        send.assert_not_called()
        self.assertEqual((result["real_requests"], result["real_success"], result["fallback"]), (0, 0, 1))
        self.assertFalse(result["verification_passed"])
        self.assertEqual(result["turns"], 0)

    def test_injected_model_success_does_not_count_as_api_success(self):
        from llm_game_smoke import CallCounts

        counts = CallCounts()
        with self.assertLogs(ai.log, "INFO"):
            ai.log.addHandler(counts)
            try:
                ai_turn("trusting", "danger", RECV, SHARED, SUSP, llm=answer())
            finally:
                ai.log.removeHandler(counts)
        self.assertEqual(counts.counts["success"], 0)


if __name__ == "__main__":
    unittest.main()
