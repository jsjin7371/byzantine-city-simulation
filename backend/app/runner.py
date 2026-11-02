"""실험 실행 (백그라운드 작업).

흐름 (docs/spec.md 4장):
1. API → God  POST /run  {experiment_id, 설정값}
2. God → API  POST /internal/experiments/{id}/turns  턴마다 결과 전송 → save_turn()
3. God의 /run 응답이 오면 끝. 200이면 모든 턴이 왔는지 확인 후 완료, 500이면 실패.
   /run 응답에 "turns" 목록이 있으면(턴을 모아서 한 번에 보내는 방식) 그것도 저장한다.
"""
import logging

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.god import RunGod
from app.god.client import GodError
from app.models import CityState, Experiment, Status, TurnResult, utcnow
from app.schemas import CORRECT_DECISION, EngineTurn

log = logging.getLogger(__name__)


class TurnRejected(ValueError):
    """엔진이 보낸 턴을 저장할 수 없을 때. code는 HTTP 상태 코드."""

    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


def turn_accuracy(turn: EngineTurn) -> float:
    """엔진이 계산한 값을 우선 쓰고, 없으면 전체 도시(비잔틴 포함) 중 정답 비율."""
    if turn.accuracy is not None:
        return turn.accuracy
    answer = CORRECT_DECISION[turn.truth]
    return sum(c.decision == answer for c in turn.cities) / len(turn.cities)


def god_payload(exp: Experiment) -> dict:
    return {
        "experiment_id": exp.id,
        "turns": exp.turns,
        "sensor_error": exp.sensor_error,
        "drop_rate": exp.drop_rate,
        "flip_rate": exp.flip_rate,
        "byzantine_count": exp.byzantine_count,
        "seed": exp.seed,
    }


def save_turn(session: Session, exp: Experiment, turn: EngineTurn) -> None:
    """턴 하나 저장. 엔진의 턴 전송 API와 /run 일괄 응답이 같이 쓴다. commit은 호출한 쪽에서."""
    if exp.status != Status.RUNNING:
        raise TurnRejected(409, f"experiment {exp.id} is {exp.status}, not accepting turns")
    if turn.turn > exp.turns:
        raise TurnRejected(422, f"turn {turn.turn} exceeds configured turns ({exp.turns})")
    exists = session.scalar(
        select(TurnResult.id).where(TurnResult.experiment_id == exp.id, TurnResult.turn == turn.turn)
    )
    if exists is not None:
        raise TurnRejected(409, f"turn {turn.turn} of experiment {exp.id} already saved")

    tr = TurnResult(experiment_id=exp.id, turn=turn.turn, truth=turn.truth, accuracy=turn_accuracy(turn))
    tr.city_states = [CityState(**c.model_dump()) for c in turn.cities]
    session.add(tr)
    session.flush()


def completed_turns(session: Session, experiment_id: int) -> int:
    return session.scalar(
        select(func.count()).select_from(TurnResult).where(TurnResult.experiment_id == experiment_id)
    )


def finalize(session: Session, exp: Experiment) -> None:
    """모든 턴이 왔는지 확인하고 요약값을 채운다."""
    turns = session.scalars(
        select(TurnResult).where(TurnResult.experiment_id == exp.id).order_by(TurnResult.turn)
    ).all()
    if len(turns) != exp.turns:
        raise GodError(f"엔진에서 받은 턴 수가 부족합니다 ({len(turns)}/{exp.turns})")

    first = turns[0].city_states
    exp.n_cities = len(first)
    exp.byzantine_ids = sorted(c.city for c in first if c.is_byzantine)
    exp.mean_accuracy = sum(t.accuracy for t in turns) / len(turns)
    exp.status = Status.COMPLETED
    exp.finished_at = utcnow()


def run_experiment(experiment_id: int, session_factory: sessionmaker[Session], run_god: RunGod) -> None:
    with session_factory() as session:
        exp = session.get(Experiment, experiment_id)
        if exp is None:
            log.warning("experiment %s disappeared before running", experiment_id)
            return
        exp.status = Status.RUNNING
        exp.started_at = utcnow()
        session.commit()
        payload = god_payload(exp)

    try:
        # 엔진이 턴마다 보내는 방식이면, 이 호출이 끝날 때까지 턴 결과가 별도 API로 들어온다
        response = run_god(payload) or {}
        with session_factory() as session:
            exp = session.get(Experiment, experiment_id)
            for raw in response.get("turns") or []:  # 모아서 한 번에 보내는 방식
                save_turn(session, exp, EngineTurn.model_validate(raw))
            finalize(session, exp)
            session.commit()
    except GodError as e:
        _fail(session_factory, experiment_id, str(e))
    except ValidationError as e:
        first = e.errors()[0]
        _fail(session_factory, experiment_id, f"엔진 응답 형식 오류 {e.error_count()}건: {first['loc']} {first['msg']}")
    except TurnRejected as e:
        _fail(session_factory, experiment_id, f"턴 저장 실패: {e}")
    except Exception as e:  # 예상 못 한 오류도 실험을 running에 멈춰두지 않는다
        log.exception("experiment %s crashed", experiment_id)
        _fail(session_factory, experiment_id, f"{type(e).__name__}: {e}")


def _fail(session_factory: sessionmaker[Session], experiment_id: int, message: str) -> None:
    with session_factory() as session:
        exp = session.get(Experiment, experiment_id)
        if exp is None:
            return
        exp.status = Status.FAILED
        exp.error = message[:2000]
        exp.finished_at = utcnow()
        session.commit()
