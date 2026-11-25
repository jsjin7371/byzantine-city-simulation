"""게임 세션 API (docs/spec.md 7.9). 턴마다 God을 호출해 결과를 받은 그대로 저장·중계한다."""
import csv
import io
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.god.client import GodGameError
from app.models import Experiment, Game, GameTurn, Status
from app.schemas import GameConfig, GameTurnIn

router = APIRouter(prefix="/games", tags=["games"])

_create_lock = Lock()  # 실험 확인과 게임 생성을 한 번에 하나만 (실험 API와 같은 이유)

# 봇 승률 (7.2 난이도 표, 7턴 기준 엔진 시드 0~9999 시뮬레이션). ai는 측정값 없음(null).
# 나머지 설정이 기본값일 때만 적용한다.
BOT_WIN_RATE = {
    ("wary", 1, 0.48): 0.57, ("wary", 1, 0.4): 0.31, ("wary", 1, 0.3): 0.08,
    ("majority", 1, 0.48): 0.864, ("majority", 1, 0.4): 0.736, ("majority", 1, 0.3): 0.490,
}
_DEFAULTS = {"connection": "all", "memory": "turn", "share_mode": "pairs", "share_pairs": 1}


def bot_win_rate(config: dict) -> float | None:
    if any(config.get(k) != v for k, v in _DEFAULTS.items()):
        return None
    return BOT_WIN_RATE.get((config["citizen_type"], config["mafia_count"], config["sensor_error"]))


# 플레이 기록 집계 (7.9). 난이도 프리셋은 7.2 표, 프론트 gameApi.ts의 difficulties와 같은 값이다.
DIFFICULTIES = {"easy": ("쉬움", 0.48), "normal": ("보통", 0.4), "hard": ("어려움", 0.3)}
# ai는 봇 승률이 없어 사람 대 봇 비교가 안 되므로 집계하지 않는다 (bot_win_rate와 같은 기준)
CITIZEN_TYPES = ("wary", "majority")
WIN_OUTCOMES = ("win", "perfect_win")
STATS_COLUMNS = ["citizen_type", "difficulty", "label", "games", "wins", "win_rate", "bot_win_rate"]


def difficulty_of(config: dict) -> str | None:
    """사람이 하고 기본 설정에 난이도 프리셋을 쓴 판이면 난이도 키, 아니면 None (집계에서 뺀다)."""
    if config.get("player") != "human" or config.get("mafia_count") != 1:
        return None
    if any(config.get(k) != v for k, v in _DEFAULTS.items()):
        return None
    return next((key for key, (_, err) in DIFFICULTIES.items() if config.get("sensor_error") == err), None)


def play_stats(db: Session) -> list[dict]:
    """끝난 판을 시민 종류 × 난이도로 묶어 판 수·승리 수를 센다. 판이 없는 조합도 0판으로 돌려준다."""
    counts = {(c, d): [0, 0] for c in CITIZEN_TYPES for d in DIFFICULTIES}
    for config, state in db.execute(select(Game.config, Game.state).where(Game.status == Status.FINISHED)):
        key = (config.get("citizen_type"), difficulty_of(config))
        if key not in counts:
            continue
        counts[key][0] += 1
        counts[key][1] += (state or {}).get("outcome") in WIN_OUTCOMES
    return [
        {
            "citizen_type": c,
            "difficulty": d,
            "label": DIFFICULTIES[d][0],
            "games": games,
            "wins": wins,
            "win_rate": wins / games if games else None,
            "bot_win_rate": BOT_WIN_RATE.get((c, 1, DIFFICULTIES[d][1])),
        }
        for (c, d), (games, wins) in counts.items()
    ]


def get_game_or_404(db: Session, game_id: int) -> Game:
    game = db.get(Game, game_id)
    if game is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"game {game_id} not found")
    return game


def to_out(game: Game) -> dict:
    return {**game.state, "status": game.status, "bot_win_rate": bot_win_rate(game.config)}


def fail(db: Session, game: Game, e: GodGameError):
    """턴 진행 중 God 호출이 실패하면 게임을 failed로 두고 502로 알린다."""
    game.status = Status.FAILED
    db.commit()
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"게임 엔진 호출에 실패해 게임이 중단되었습니다. ({e})")


@router.post("", status_code=status.HTTP_201_CREATED, summary="게임 시작")
def create_game(body: GameConfig, request: Request, db: Session = Depends(get_db)):
    with _create_lock:
        active = db.scalar(
            select(Experiment.id).where(Experiment.status.in_([Status.PENDING, Status.RUNNING])).limit(1)
        )
        if active is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"이미 실행 중인 실험(#{active})이 있습니다. 끝난 뒤 다시 시작해 주세요."
            )
        db.execute(update(Game).where(Game.status == Status.IN_PROGRESS).values(status=Status.ABANDONED))
        game = Game(config=body.model_dump(), status=Status.IN_PROGRESS)
        db.add(game)
        db.flush()  # id만 받아 둔다. God 시작이 성공할 때까지 커밋하지 않아 state 없는 게임이 남지 않는다
        try:
            game.state = request.app.state.game_god.start({"game_id": game.id, **game.config})
        except Exception as e:  # GodGameError 외에 응답 형식 오류 등도 포함
            db.rollback()
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"게임 엔진 호출에 실패해 게임을 시작하지 못했습니다. ({e})") from e
        db.commit()
    return to_out(game)


# /stats 경로는 /{game_id}보다 먼저 등록해야 한다 (아니면 "stats"를 game_id로 읽어 422)
@router.get("/stats", summary="플레이 기록 집계")
def get_stats(db: Session = Depends(get_db)):
    return {"items": play_stats(db)}


@router.get("/stats.csv", summary="플레이 기록 집계 CSV", response_class=Response)
def get_stats_csv(db: Session = Depends(get_db)):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=STATS_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(play_stats(db))
    # BOM을 붙여야 엑셀이 UTF-8 한글(label)을 깨뜨리지 않는다
    return Response(
        "﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="play_stats.csv"'},
    )


@router.get("/{game_id}", summary="게임 상태")
def get_game(game_id: int, db: Session = Depends(get_db)):
    return to_out(get_game_or_404(db, game_id))


@router.post("/{game_id}/turns", summary="한 턴 진행")
def play_turn(game_id: int, body: GameTurnIn, request: Request, db: Session = Depends(get_db)):
    game = get_game_or_404(db, game_id)
    if game.status != Status.IN_PROGRESS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"game {game_id} is {game.status}")
    if body.turn != game.state["turn"] + 1:
        raise HTTPException(status.HTTP_409_CONFLICT, f"expected turn {game.state['turn'] + 1}, got {body.turn}")
    try:
        result = request.app.state.game_god.turn(game_id, body.model_dump())
        changes = {k: result[k] for k in ("turn", "game_over", "outcome", "end_reason", "next_hints", "next_share_pairs")}
    except GodGameError as e:
        if e.status in (409, 422):  # 요청 문제는 그대로 돌려주고 게임은 계속
            raise HTTPException(e.status, str(e)) from e
        fail(db, game, e)
    except (KeyError, TypeError) as e:  # 성공 응답인데 7.8 형식이 아님
        fail(db, game, GodGameError(f"엔진(God) 턴 응답 형식이 잘못되었습니다. (상세: {e!r})"))
    db.add(GameTurn(game_id=game_id, turn=changes["turn"], result=result))
    game.state = {**game.state, **changes}
    if changes["game_over"]:
        game.status = Status.FINISHED
    db.commit()
    return result


@router.get("/{game_id}/turns/{turn}", summary="저장된 턴 결과")
def get_turn(game_id: int, turn: int, db: Session = Depends(get_db)):
    get_game_or_404(db, game_id)
    row = db.get(GameTurn, (game_id, turn))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"turn {turn} not found in game {game_id}")
    return row.result
