"""실제 God 컨테이너 호출 (POST /run, docs/spec.md 4장)."""
import re

import httpx


class GodError(RuntimeError):
    pass


# 도시·엔진 연결 실패를 나타내는 엔진 오류 문구 (urllib·소켓 예외 이름)
_CONNECTION_HINTS = ("URLError", "ConnectionRefused", "ConnectionError", "timed out", "Errno")


def explain_god_error(reason: str) -> str:
    """엔진의 영어 오류 문구를 화면에 보여 줄 한국어 문장으로 바꾼다.

    엔진(engine/god/simulation.py)이 만드는 오류 형식을 보고 원인을 고른다.
    모르는 형식이면 일반 문장을 돌려준다. 원문은 호출한 쪽에서 (상세: ...)로 덧붙인다.
    """
    saved = re.search(r"acknowledged (\d+)/(\d+) turns", reason)
    progress = f" ({saved.group(1)}/{saved.group(2)}턴까지 저장됨)" if saved else ""
    connection = any(hint in reason for hint in _CONNECTION_HINTS)

    if m := re.search(r"city (\d+) initialization", reason):
        city = m.group(1)
        if connection:
            return f"도시 {city}에 연결하지 못해 실험을 시작하지 못했습니다. City 컨테이너가 켜져 있는지 확인해 주세요."
        return f"도시 {city}의 준비 과정에서 문제가 생겨 실험을 시작하지 못했습니다."
    if m := re.search(r"turn (\d+), city (\d+)", reason):
        turn, city = m.groups()
        if connection:
            return f"{turn}턴에서 도시 {city}와 연결이 끊겨 실험이 중단되었습니다{progress}."
        return f"{turn}턴에서 도시 {city}의 응답이 올바르지 않아 실험이 중단되었습니다{progress}."
    if "http://api" in reason or "backend acknowledgement" in reason:
        return f"엔진이 턴 결과를 API에 저장하지 못해 실험이 중단되었습니다{progress}."
    if "already running" in reason:
        return "엔진이 다른 실험을 실행하고 있어 실험을 시작하지 못했습니다."
    if "already attempted" in reason:
        return "이미 실행을 시도한 실험 번호라서 엔진이 실행을 거부했습니다."
    if "/run" in reason or "invalid " in reason or "experiment_id" in reason:
        return "실험 설정이 엔진 규격과 맞지 않아 엔진이 실행을 거부했습니다."
    return f"엔진에서 오류가 발생해 실험이 중단되었습니다{progress}."


def run_http(base_url: str, payload: dict, timeout: float) -> dict:
    # 오류 문장은 프론트가 그대로 보여 주므로 쉬운 설명을 앞에, 디버깅용 원문을 (상세: ...)로 뒤에 둔다
    try:
        response = httpx.post(f"{base_url}/run", json=payload, timeout=timeout)
    except httpx.TimeoutException as e:
        raise GodError(f"엔진 응답이 {timeout:.0f}초 안에 오지 않아 실험을 중단했습니다.") from e
    except httpx.HTTPError as e:
        raise GodError(
            f"엔진(God)에 연결하지 못했습니다. God 컨테이너가 켜져 있는지 확인해 주세요. (상세: {e})"
        ) from e

    if response.status_code != 200:
        # common/http.py는 실패 시 {"error": "..."}를 돌려준다.
        # 다른 형식(JSON 아님, 리스트, error가 문자열 아님 등)이면 응답 본문을 그대로 원문으로 쓴다.
        try:
            body = response.json()
        except ValueError:
            body = None
        error = body.get("error") if isinstance(body, dict) else None
        reason = error if isinstance(error, str) else response.text
        raise GodError(f"{explain_god_error(reason)} (상세: God {response.status_code}: {reason})")
    return response.json()
