"""실제 God 컨테이너 호출 (POST /run, docs/spec.md 4장)."""
import httpx


class GodError(RuntimeError):
    pass


def run_http(base_url: str, payload: dict, timeout: float) -> dict:
    try:
        response = httpx.post(f"{base_url}/run", json=payload, timeout=timeout)
    except httpx.TimeoutException as e:
        raise GodError(f"God 응답 시간 초과 ({timeout:.0f}초)") from e
    except httpx.HTTPError as e:
        raise GodError(f"God 연결 실패: {e}") from e

    if response.status_code != 200:
        # common/http.py는 실패 시 {"error": "..."}를 돌려준다
        try:
            reason = response.json().get("error", response.text)
        except ValueError:
            reason = response.text
        raise GodError(f"God 오류 {response.status_code}: {reason}")
    return response.json()
