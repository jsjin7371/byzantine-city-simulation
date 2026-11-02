"""실험 실행: God 호출 → 결과 검증 → 정확도 계산 → DB 저장. 백그라운드 작업으로 돈다."""
import logging

from pydantic import ValidationError
from sqlalchemy.orm import Session, sessionmaker

from app.god import RunGod
from app.god.client import GodError
from app.models import CityState, Experiment, Message, Status, TurnResult, utcnow
from app.schemas import GodResult, GodTurn

log = logging.getLogger(__name__)


def turn_accuracy(turn: GodTurn) -> float:
    """정상(비잔틴 아님) 도시 중 결정이 정답과 같은 비율. 엔진이 값을 주면 그 값을 쓴다."""
    if turn.accuracy is not None:
        return turn.accuracy
    honest = [c for c in turn.cities if not c.is_byzantine]
    if not honest:
        return 0.0
    return sum(c.decision == turn.truth for c in honest) / len(honest)


def god_payload(exp: Experiment) -> dict:
    return {
        "experiment_id": exp.id,
        "turns": exp.turns,
        "sensor_error_rate": exp.sensor_error_rate,
        "drop_rate": exp.drop_rate,
        "tamper_rate": exp.tamper_rate,
        "byzantine_count": exp.byzantine_count,
        "algorithm": exp.algorithm,
        "seed": exp.seed,
    }


def save_result(session: Session, exp: Experiment, result: GodResult) -> None:
    accuracies = []
    for t in sorted(result.turns, key=lambda t: t.turn):
        acc = turn_accuracy(t)
        accuracies.append(acc)
        tr = TurnResult(turn=t.turn, truth=t.truth, accuracy=acc)
        tr.city_states = [
            CityState(city_id=c.city_id, is_byzantine=c.is_byzantine, sensor=c.sensor,
                      decision=c.decision, broadcast=c.broadcast)
            for c in t.cities
        ]
        tr.messages = [
            Message(from_city=m.from_city, to_city=m.to_city, sent=m.sent, received=m.received,
                    dropped=m.dropped, tampered=m.tampered)
            for m in t.messages
        ]
        exp.turn_results.append(tr)

    exp.n_cities = result.n_cities
    exp.byzantine_ids = sorted(result.byzantine_ids)
    exp.mean_accuracy = sum(accuracies) / len(accuracies)


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
        result = GodResult.model_validate(run_god(payload))
    except GodError as e:
        _fail(session_factory, experiment_id, str(e))
        return
    except ValidationError as e:
        _fail(session_factory, experiment_id, f"God 응답 형식 오류: {e.error_count()}건 — {e.errors()[0]['loc']} {e.errors()[0]['msg']}")
        return
    except Exception as e:  # 예상 못 한 오류도 실험을 running에 멈춰두지 않는다
        log.exception("experiment %s crashed", experiment_id)
        _fail(session_factory, experiment_id, f"{type(e).__name__}: {e}")
        return

    try:
        with session_factory() as session:
            exp = session.get(Experiment, experiment_id)
            save_result(session, exp, result)
            exp.status = Status.COMPLETED
            exp.finished_at = utcnow()
            session.commit()
    except Exception as e:
        log.exception("saving experiment %s failed", experiment_id)
        _fail(session_factory, experiment_id, f"결과 저장 실패: {type(e).__name__}: {e}")


def _fail(session_factory: sessionmaker[Session], experiment_id: int, message: str) -> None:
    with session_factory() as session:
        exp = session.get(Experiment, experiment_id)
        if exp is None:
            return
        exp.status = Status.FAILED
        exp.error = message[:2000]
        exp.finished_at = utcnow()
        session.commit()
