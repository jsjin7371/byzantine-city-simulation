"""실험 API (docs/spec.md 3장)."""
from threading import Lock

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Experiment, Status, TurnResult
from app.runner import completed_turns, run_experiment
from app.schemas import (
    CORRECT_DECISION,
    CityTurnOut,
    CompareItem,
    CompareOut,
    ExperimentConfig,
    ExperimentCreate,
    ExperimentOut,
    TurnDetailOut,
    TurnListOut,
    TurnSummary,
)

router = APIRouter(prefix="/experiments", tags=["experiments"])

# 실행 중 확인과 실험 생성을 한 번에 하나의 요청만 하도록 막는다.
# 없으면 동시에 들어온 두 요청이 둘 다 "실행 중 없음"을 보고 함께 생성될 수 있다.
# API는 프로세스 하나로 실행하므로 프로세스 안의 잠금으로 충분하다.
_create_lock = Lock()


# ---------- 변환 헬퍼 ----------

def to_out(exp: Experiment, done_turns: int) -> ExperimentOut:
    return ExperimentOut(
        id=exp.id,
        name=exp.name,
        status=exp.status,
        config=ExperimentConfig(
            turns=exp.turns, sensor_error=exp.sensor_error, drop_rate=exp.drop_rate,
            flip_rate=exp.flip_rate, byzantine_count=exp.byzantine_count, seed=exp.seed,
        ),
        n_cities=exp.n_cities,
        completed_turns=done_turns,
        byzantine_ids=exp.byzantine_ids or [],
        mean_accuracy=exp.mean_accuracy,
        error=exp.error,
        created_at=exp.created_at,
        started_at=exp.started_at,
        finished_at=exp.finished_at,
    )


def get_experiment_or_404(db: Session, experiment_id: int) -> Experiment:
    exp = db.get(Experiment, experiment_id)
    if exp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"experiment {experiment_id} not found")
    return exp


def require_completed(exp: Experiment) -> None:
    if exp.status != Status.COMPLETED:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"experiment {exp.id} is {exp.status}, results are not ready"
        )


def turn_summaries(db: Session, experiment_id: int) -> list[TurnSummary]:
    rows = db.execute(
        select(TurnResult.turn, TurnResult.truth, TurnResult.accuracy)
        .where(TurnResult.experiment_id == experiment_id)
        .order_by(TurnResult.turn)
    ).all()
    return [TurnSummary(turn=r.turn, truth=r.truth, accuracy=r.accuracy) for r in rows]


# ---------- 엔드포인트 ----------

@router.post("", response_model=ExperimentOut, status_code=status.HTTP_202_ACCEPTED,
             summary="실험 생성 + 실행 시작")
def create_experiment(
    body: ExperimentCreate,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    settings = request.app.state.settings
    if body.byzantine_count > settings.n_cities:
        raise HTTPException(422, f"byzantine_count must be at most {settings.n_cities} (n_cities={settings.n_cities})")

    with _create_lock:
        # God은 실험을 한 번에 하나만 돌리므로, 실행 중이면 대기열 없이 거절한다 (11/6 회의 결정)
        active = db.scalar(
            select(Experiment.id).where(Experiment.status.in_([Status.PENDING, Status.RUNNING])).limit(1)
        )
        if active is not None:
            raise HTTPException(
                # 프론트가 detail을 그대로 보여 주므로 사용자에게 보일 한국어 문장으로 쓴다
                status.HTTP_409_CONFLICT, f"이미 실행 중인 실험(#{active})이 있습니다. 끝난 뒤 다시 실행해 주세요."
            )

        exp = Experiment(**body.model_dump(), status=Status.PENDING, n_cities=settings.n_cities)
        db.add(exp)
        db.commit()
        db.refresh(exp)

    # 응답을 먼저 보내고 실행은 백그라운드에서. 프론트는 GET /experiments/{id}로 상태 확인.
    background.add_task(run_experiment, exp.id, request.app.state.session_factory, request.app.state.run_god)
    return to_out(exp, 0)


@router.get("", response_model=list[ExperimentOut], summary="실험 목록 (최신순)")
def list_experiments(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(Experiment).order_by(Experiment.created_at.desc(), Experiment.id.desc()).limit(limit).offset(offset)
    ).all()
    counts = dict(db.execute(
        select(TurnResult.experiment_id, func.count())
        .where(TurnResult.experiment_id.in_([e.id for e in rows]))
        .group_by(TurnResult.experiment_id)
    ).all())
    return [to_out(e, counts.get(e.id, 0)) for e in rows]


# /compare는 /{experiment_id}보다 먼저 선언해야 "compare"가 id로 해석되지 않는다.
@router.get("/compare", response_model=CompareOut, summary="실험 비교 (2~5개)")
def compare_experiments(
    ids: list[int] = Query(..., description="비교할 실험 id. 예) ?ids=1&ids=2"),
    db: Session = Depends(get_db),
):
    unique_ids = list(dict.fromkeys(ids))
    if not 2 <= len(unique_ids) <= 5:
        raise HTTPException(422, "ids must contain 2 to 5 distinct experiments")

    items = []
    for experiment_id in unique_ids:
        exp = get_experiment_or_404(db, experiment_id)
        require_completed(exp)
        out = to_out(exp, exp.turns)
        items.append(CompareItem(
            id=exp.id, name=exp.name, config=out.config, mean_accuracy=exp.mean_accuracy,
            accuracy=turn_summaries(db, exp.id),
        ))
    return CompareOut(experiments=items)


@router.get("/{experiment_id}", response_model=ExperimentOut, summary="실험 설정 + 상태")
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    exp = get_experiment_or_404(db, experiment_id)
    return to_out(exp, completed_turns(db, exp.id))


@router.get("/{experiment_id}/turns", response_model=TurnListOut, summary="턴별 정답·정확도")
def list_turns(experiment_id: int, db: Session = Depends(get_db)):
    exp = get_experiment_or_404(db, experiment_id)
    require_completed(exp)
    return TurnListOut(experiment_id=exp.id, turns=turn_summaries(db, exp.id))


@router.get("/{experiment_id}/turns/{turn}", response_model=TurnDetailOut, summary="해당 턴의 도시별 상세")
def get_turn(experiment_id: int, turn: int, db: Session = Depends(get_db)):
    exp = get_experiment_or_404(db, experiment_id)
    require_completed(exp)

    tr = db.scalars(
        select(TurnResult)
        .where(TurnResult.experiment_id == experiment_id, TurnResult.turn == turn)
        .options(selectinload(TurnResult.city_states))
    ).first()
    if tr is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"turn {turn} not found in experiment {experiment_id}")

    answer = CORRECT_DECISION[tr.truth]
    cities = [
        CityTurnOut(
            city=c.city, is_byzantine=c.is_byzantine, hint=c.hint, from_left=c.from_left,
            from_right=c.from_right, decision=c.decision, to_left=c.to_left, to_right=c.to_right,
            correct=c.decision == answer,
        )
        for c in tr.city_states
    ]
    return TurnDetailOut(experiment_id=experiment_id, turn=tr.turn, truth=tr.truth, accuracy=tr.accuracy,
                         cities=cities)
