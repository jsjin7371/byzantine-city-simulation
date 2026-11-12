"""실제 God 호출 오류를 한국어 문장으로 바꾸는지 검사한다.

오류 원문은 engine/god/simulation.py가 실제로 만드는 형식을 그대로 썼다.
"""
import httpx
import pytest

from app.god.client import GodError, explain_god_error, run_http

PREFIX = "experiment 5 failed; acknowledged {}/{} turns; "


@pytest.mark.parametrize("reason, expected", [
    # 도시 초기화 중 연결 실패 (City 컨테이너가 꺼짐)
    (PREFIX.format(0, 3) + "city 3 initialization: URLError from http://city-3:8000/init: "
                           "<urlopen error [Errno -3] Try again>",
     "도시 3에 연결하지 못해 실험을 시작하지 못했습니다. City 컨테이너가 켜져 있는지 확인해 주세요."),
    # 도시 초기화 응답이 잘못됨
    (PREFIX.format(0, 3) + "city 2 initialization: City /init must acknowledge with ok=true",
     "도시 2의 준비 과정에서 문제가 생겨 실험을 시작하지 못했습니다."),
    # 턴 진행 중 도시 응답 시간 초과
    (PREFIX.format(2, 5) + "turn 3, city 4: TimeoutError from http://city-4:8000/turn: timed out",
     "3턴에서 도시 4와 연결이 끊겨 실험이 중단되었습니다 (2/5턴까지 저장됨)."),
    # 턴 진행 중 도시가 잘못된 값을 보냄
    (PREFIX.format(1, 5) + "turn 2, city 1: invalid City sent_left message",
     "2턴에서 도시 1의 응답이 올바르지 않아 실험이 중단되었습니다 (1/5턴까지 저장됨)."),
    # 턴 결과를 API에 저장하지 못함
    (PREFIX.format(2, 5) + "HTTP 409 from http://api:8000/internal/experiments/5/turns: already saved; "
                           "turn 3 delivery may already be stored; no automatic retry",
     "엔진이 턴 결과를 API에 저장하지 못해 실험이 중단되었습니다 (2/5턴까지 저장됨)."),
    ("God is already running an experiment",
     "엔진이 다른 실험을 실행하고 있어 실험을 시작하지 못했습니다."),
    (PREFIX.format(0, 5) + "experiment 5 already attempted; use a new experiment_id",
     "이미 실행을 시도한 실험 번호라서 엔진이 실행을 거부했습니다."),
    ("invalid turns: expected integer in 1..20",
     "실험 설정이 엔진 규격과 맞지 않아 엔진이 실행을 거부했습니다."),
    ("unknown /run fields: name",
     "실험 설정이 엔진 규격과 맞지 않아 엔진이 실행을 거부했습니다."),
    # 모르는 형식은 일반 문장
    ("something unexpected", "엔진에서 오류가 발생해 실험이 중단되었습니다."),
])
def test_explain_god_error(reason, expected):
    assert explain_god_error(reason) == expected


def fake_post(response=None, error=None):
    def post(*args, **kwargs):
        if error:
            raise error
        return response
    return post


def test_run_http_keeps_original_reason_as_detail(monkeypatch):
    # 쉬운 문장이 앞에 오고, 디버깅용 원문은 (상세: ...)로 남는다
    reason = PREFIX.format(0, 3) + "city 3 initialization: URLError from http://city-3:8000/init: Errno -3"
    monkeypatch.setattr(httpx, "post", fake_post(httpx.Response(500, json={"error": reason})))
    with pytest.raises(GodError) as e:
        run_http("http://god:8000", {}, 120)
    message = str(e.value)
    assert message.startswith("도시 3에 연결하지 못해")
    assert message.endswith(f"(상세: God 500: {reason})")


def test_run_http_connection_and_timeout(monkeypatch):
    monkeypatch.setattr(httpx, "post", fake_post(error=httpx.ConnectError("connection refused")))
    with pytest.raises(GodError, match=r"^엔진\(God\)에 연결하지 못했습니다.*connection refused"):
        run_http("http://god:8000", {}, 120)

    monkeypatch.setattr(httpx, "post", fake_post(error=httpx.ReadTimeout("slow")))
    with pytest.raises(GodError, match="^엔진 응답이 120초 안에 오지 않아"):
        run_http("http://god:8000", {}, 120)


def test_run_http_success(monkeypatch):
    monkeypatch.setattr(httpx, "post", fake_post(httpx.Response(200, json={"ok": True})))
    assert run_http("http://god:8000", {}, 120) == {"ok": True}
