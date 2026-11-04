"""엔진(God) 전용 API (docs/spec.md 4장). 프론트는 쓰지 않는다."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Experiment
from app.runner import TurnRejected, save_turn
from app.schemas import EngineTurn, TurnAck

router = APIRouter(prefix="/internal", tags=["engine"])


@router.post("/experiments/{experiment_id}/turns", response_model=TurnAck,
             summary="[엔진 전용] 턴 결과 전송")
def receive_turn(experiment_id: int, body: EngineTurn, db: Session = Depends(get_db)):
    """God이 매 턴이 끝날 때마다 호출한다. 같은 턴을 두 번 보내면 409."""
    exp = db.get(Experiment, experiment_id)
    if exp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"experiment {experiment_id} not found")
    try:
        save_turn(db, exp, body)
        db.commit()
    except TurnRejected as e:
        db.rollback()
        raise HTTPException(e.code, str(e)) from e
    except IntegrityError as e:  # 같은 턴이 거의 동시에 두 번 들어온 경우
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"turn {body.turn} already saved") from e
    return TurnAck(experiment_id=experiment_id, turn=body.turn)
