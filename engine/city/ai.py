"""AI 시민 (spec 7.10, 7.11): 프롬프트 → OpenAI 호환 chat completions → JSON 검증. 깨지면 wary 규칙으로 대체."""
import json
import os
import urllib.error
import urllib.request

from city.logic import game_turn

PERSONALITY = {  # 7.10 personality
    "suspicious": "의심이 많다. 내 힌트와 다른 말을 하거나 말을 바꾸는 도시는 쉽게 믿지 않는다.",
    "trusting": "남을 쉽게 믿는다. 이웃들이 하는 말을 대체로 따르고 의심을 천천히 올린다.",
}
TIMEOUT = 30  # 초. 호출 시간 제한은 God 쪽에서도 따로 둔다.


def build_prompt(personality, hint, received, shared, suspicion):
    claims = {s: (m["claim"] if m else None) for s, m in received.items()}
    contra = sorted({str(c["city"]) for p in shared for c in p["contradictions"]})
    return (
        "너는 5개 도시 중 한 도시의 시민이다. 마피아 도시는 정답의 반대를 말하고, 다른 도시에 서로 다른 말을 하기도 한다.\n"
        f"성격: {PERSONALITY[personality]}\n"
        f"이번 턴 내 센서 힌트: {hint} (danger면 evacuate, safe면 stay 쪽. 센서는 가끔 틀린다)\n"
        f"이번 턴 받은 주장 (도시 id → evacuate/stay, null은 말 안 함): {json.dumps(claims)}\n"
        f"공유에서 모순(두 시민에게 다른 말)이 드러난 도시: {contra or '없음'}\n"
        f"직전 내 의심도 (0~100): {json.dumps(suspicion)}\n"
        "대피할지(evacuate) 남을지(stay) 정하고, 각 도시의 의심도를 0~100 정수로 갱신하고, 이유를 한두 문장으로 써라.\n"
        'JSON 하나만 답하라: {"decision": "evacuate"|"stay", "suspicion": {도시 id: 정수}, "reason": "..."}'
    )


def schema(suspicion):
    ids = list(suspicion)
    return {"type": "object", "additionalProperties": False, "required": ["decision", "suspicion", "reason"],
            "properties": {
                "decision": {"type": "string", "enum": ["evacuate", "stay"]},
                "suspicion": {"type": "object", "additionalProperties": False, "required": ids,
                              "properties": {i: {"type": "integer"} for i in ids}},
                "reason": {"type": "string"}}}


def call_llm(prompt, suspicion):
    """실제 호출. 반환: 모델이 쓴 문자열. json_schema를 거절(400)하면 response_format 없이 한 번 더."""
    # ponytail: 429·5xx 재시도 없음 (바로 wary 대체). 실제 키로 빈도 확인 후 필요하면 추가.
    body = {"model": os.environ.get("LLM_MODEL", ""),
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "citizen_turn", "strict": True, "schema": schema(suspicion)}}}
    url = os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["LLM_API_KEY"]}
    for _ in range(2):
        req = urllib.request.Request(url, json.dumps(body).encode(), headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            if e.code != 400 or "response_format" not in body:
                raise
            del body["response_format"]


def fake_llm(hint, received, shared, suspicion):
    """키가 없을 때 쓰는 가짜 LLM: wary 규칙 결과를 JSON 문자열로."""
    d, s, r = game_turn(hint, received, shared, suspicion)
    return json.dumps({"decision": d, "suspicion": s, "reason": r or "가짜 LLM: 눈치 규칙 결과."})


def parse(text, suspicion):
    """모델 문자열 → (결정, 의심도, 이유). 형식이 틀리면 ValueError."""
    try:
        data = json.loads(text)
    except (TypeError, json.JSONDecodeError):  # 코드 블록·설명이 붙은 응답: 첫 { ~ 마지막 }
        data = json.loads(text[text.index("{"):text.rindex("}") + 1])
    if not isinstance(data, dict) or data.get("decision") not in ("evacuate", "stay"):
        raise ValueError("decision이 evacuate/stay가 아님")
    got = data.get("suspicion")
    if not isinstance(got, dict):
        raise ValueError("suspicion이 객체가 아님")
    new = {}
    for k, old in suspicion.items():  # 요청에 있던 도시만, 빠진 도시는 직전 값
        v = got.get(k, old)
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError(f"{k}번 의심도가 숫자가 아님")
        new[k] = max(0, min(100, round(v)))
    reason = data.get("reason")
    reason = str(reason).strip()[:200] if reason else None
    return data["decision"], new, reason or None


def ai_turn(personality, hint, received, shared, suspicion, llm=None):
    """AI 시민 한 턴. 반환: (결정, 의심도, 이유). llm은 테스트용 (prompt → 문자열)."""
    if llm is None:
        if os.environ.get("LLM_API_KEY"):
            llm = lambda p: call_llm(p, suspicion)
        else:
            llm = lambda p: fake_llm(hint, received, shared, suspicion)
    try:
        return parse(llm(build_prompt(personality, hint, received, shared, suspicion)), suspicion)
    except Exception as e:  # 네트워크 오류, 깨진 JSON, 잘못된 값
        d, s, r = game_turn(hint, received, shared, suspicion)
        return d, s, f"[AI 응답 실패({type(e).__name__})로 눈치 규칙 대체] {r or ''}".strip()
