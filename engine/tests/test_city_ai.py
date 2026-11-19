"""AI 시민 (spec 7.10, 7.11): 가짜 LLM, 깨진 응답 대체, 의심도 제한, 프롬프트 성격. 실제 네트워크 호출 없음."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CITY_ID", "1")
from city.ai import PERSONALITY, ai_turn, build_prompt
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
            self.assertIn(text, prompt)
            self.assertIn("safe", prompt)
            self.assertIn("['3']", prompt)  # 모순 도시

    def test_main_routes_personality(self):
        body = {"turn": 1, "hint": "danger", "received": RECV, "shared": SHARED, "suspicion": SUSP,
                "personality": "suspicious"}
        with mock.patch.object(main, "ai_turn", return_value=("stay", SUSP, "x")) as f:
            self.assertEqual(main.turn(body), {"decision": "stay", "suspicion": SUSP, "reason": "x"})
        f.assert_called_once()


if __name__ == "__main__":
    unittest.main()
