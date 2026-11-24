"""명시적 실행 승인 후 실제 Groq 시민 게임 한 판을 검사하는 기능"""
import argparse
from collections import Counter
import json
import logging
import os
from pathlib import Path
import sys
from threading import Lock
import time
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from city import ai
from god.game import Game, GameConfig


class CallCounts(logging.Handler):
    """원문 없이 LLM 요청·검증 성공·fallback 횟수를 집계하는 기능"""

    def __init__(self):
        super().__init__()
        self.counts = Counter()
        self.causes = Counter()
        self.responses = []

    def emit(self, record):
        if not hasattr(record, "ai_source"):
            return
        if record.ai_source == "api" and record.ai_outcome in ("request", "success"):
            self.counts[record.ai_outcome] += 1
        if record.ai_outcome == "fallback":
            self.counts["fallback"] += 1
            self.causes[record.ai_cause] += 1
        if record.ai_source == "api" and record.ai_outcome == "response":
            self.responses.append({"usage": record.ai_usage, "limits": record.ai_limits})


def run_game(interval=20, token_budget=100000, progress=None):
    """기존 게임 규칙으로 한 판을 진행하고 실제 호출 결과를 집계하는 기능"""
    stats = CallCounts()
    old_level = ai.log.level
    ai.log.setLevel(logging.INFO)
    ai.log.addHandler(stats)
    gate = Lock()
    next_call = 0
    stop_reason = None
    requests = []
    spent = 0
    game = Game(1, GameConfig(seed=42, player="bot", citizen_type="ai"))

    def city(city_id, req):
        """검사에서만 API 요청을 직렬화해 무료 한도의 급격한 소모를 줄이는 기능"""
        nonlocal next_call, stop_reason, spent
        with gate:
            if stats.counts["fallback"] or stop_reason:
                raise RuntimeError("Live check stopped")
            time.sleep(max(0, next_call - time.monotonic()))
            system = ai.build_system_prompt(req["personality"], req["suspicion"])
            prompt = ai.build_prompt(req["personality"], req["hint"], req["received"], req["shared"], req["suspicion"])
            reserve = len((system + prompt).encode("utf-8")) + 1024 + 128
            if len(requests) >= 60:
                stop_reason = "request_budget"
            elif spent + reserve > token_budget:
                stop_reason = "token_budget"
            if stats.responses:
                limits = stats.responses[-1]["limits"]
                for name, minimum in (("x-ratelimit-remaining-requests", 1),
                                      ("x-ratelimit-remaining-tokens", reserve)):
                    if name in limits:
                        try:
                            if int(limits[name]) < minimum:
                                stop_reason = "rate_limit_headroom"
                        except ValueError:
                            stop_reason = "invalid_limit_header"
            if stop_reason:
                raise RuntimeError("Live check budget exhausted")
            before = len(stats.responses)
            successes = stats.counts["success"]
            started = time.monotonic()
            decision, suspicion, reason = ai.ai_turn(req["personality"], req["hint"], req["received"],
                                                   req["shared"], req["suspicion"])
            seconds = round(time.monotonic() - started, 3)
            response = stats.responses[-1] if len(stats.responses) > before else {"usage": {}, "limits": {}}
            usage = response["usage"]
            success = stats.counts["success"] == successes + 1
            if stats.counts["fallback"]:
                stop_reason = "fallback"
            elif "total_tokens" not in usage:
                stop_reason = "missing_usage"
            spent += usage.get("total_tokens", 0)
            row = {"request": len(requests) + 1, "turn": req["turn"], "city": city_id,
                   "personality": req["personality"], "success": success,
                   "seconds": seconds, "usage": usage, "limits": response["limits"],
                   "decision": decision, "suspicion": suspicion, "reason": reason}
            requests.append(row)
            if progress:
                progress(row)
            next_call = time.monotonic() + interval
        return {"decision": decision, "suspicion": suspicion, "reason": reason}

    try:
        while not game.game_over:
            try:
                game.play({"turn": game.turn + 1, "claims": {}}, city)
            except RuntimeError:
                if not stats.counts["fallback"] and not stop_reason:
                    raise
            # 검사에서만 fallback을 발견하면 남은 외부 요청을 중단한다.
            if stats.counts["fallback"] or stop_reason:
                break
    finally:
        ai.log.removeHandler(stats)
        ai.log.setLevel(old_level)
    attempts, successes, fallbacks = (stats.counts[k] for k in ("request", "success", "fallback"))
    return {"real_requests": attempts, "real_success": successes, "fallback": fallbacks,
            "fallback_causes": dict(stats.causes), "turns": game.turn, "game_over": game.game_over,
            "fifteen_turns": game.turn == 15, "end_reason": game.end_reason, "outcome": game.outcome,
            "stop_reason": stop_reason, "total_tokens": spent, "requests": requests,
            "real_failures": attempts - successes,
            "usage_complete": attempts == len(requests) and all("total_tokens" in row["usage"] for row in requests),
            "mean_response_seconds": round(sum(row["seconds"] for row in requests) / len(requests), 3) if requests else None,
            "verification_passed": game.game_over and successes > 0 and successes == attempts and fallbacks == 0
                                   and stop_reason is None}


def main(argv=None):
    """실제 호출을 명시한 경우에만 키·주소 확인 후 게임 검사를 실행하는 기능"""
    parser = argparse.ArgumentParser(description="One Groq AI game; no backend, DB or HTTP City server")
    parser.add_argument("--live", action="store_true", help="allow up to 60 external chat requests")
    args = parser.parse_args(argv)
    print("Plan: at most 60 requests; max_tokens=1024 each; token budget=100000; interval >=20s; no retry.")
    if not args.live:
        print("Plan only: no API calls. Use --live only after checking your account plan and limits.")
        return 0
    if not os.getenv("LLM_API_KEY", "").strip():
        print("Stopped: missing LLM_API_KEY; real_requests=0; real_success=0; fallback=0; verification_passed=false")
        return 2
    endpoint = urlsplit(os.getenv("LLM_BASE_URL", ""))
    if (endpoint.scheme != "https" or endpoint.netloc != "api.groq.com"
            or endpoint.path.rstrip("/") not in ("/openai/v1", "/openai/v1/chat/completions")
            or not os.getenv("LLM_MODEL", "").strip()):
        print("Stopped: configure a Groq HTTPS endpoint and LLM_MODEL; no API calls.")
        return 2
    logging.basicConfig(level=logging.INFO)
    result = run_game(progress=lambda row: print(json.dumps({"request_result": row}, ensure_ascii=True), flush=True))
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result["verification_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
