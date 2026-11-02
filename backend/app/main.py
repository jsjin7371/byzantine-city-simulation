import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError

from app.config import Settings, get_settings
from app.db import make_engine, make_session_factory
from app.god import get_runner
from app.models import Experiment, Status, utcnow
from app.routers import experiments, internal

log = logging.getLogger(__name__)


def mark_interrupted(session_factory) -> None:
    """서버가 꺼질 때 실행 중이던 실험은 다시 이어서 돌릴 수 없으므로 failed로 정리한다."""
    try:
        with session_factory() as session:
            session.execute(
                update(Experiment)
                .where(Experiment.status.in_([Status.PENDING, Status.RUNNING]))
                .values(status=Status.FAILED, error="서버 재시작으로 실행이 중단됨", finished_at=utcnow())
            )
            session.commit()
    except SQLAlchemyError as e:  # 마이그레이션 전이라 테이블이 없을 수도 있다
        log.warning("could not clean up interrupted experiments: %s", e)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        mark_interrupted(app.state.session_factory)
        yield
        app.state.engine.dispose()

    app = FastAPI(
        title="Byzantine City API",
        version="0.1.0",
        description="비잔틴 도시 시뮬레이션 실험 API. 규격: docs/spec.md",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.run_god = get_runner(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(experiments.router)
    app.include_router(internal.router)

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        """API 프로세스 생존 확인."""
        return {"status": "ok"}

    return app


app = create_app()
