"""DB 연결. 엔진과 세션 팩토리는 앱마다 하나씩 만들어 app.state에 둔다."""
from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        # 테스트·빠른 로컬 실행용. 백그라운드 스레드에서도 같은 DB를 쓰도록 허용.
        return create_engine(url, connect_args={"check_same_thread": False})
    # pool_pre_ping: MySQL이 끊은 오래된 연결을 자동으로 다시 연결
    return create_engine(url, pool_pre_ping=True, pool_recycle=3600)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_db(request: Request) -> Iterator[Session]:
    """라우터에서 Depends(get_db)로 받는 요청 단위 세션."""
    with request.app.state.session_factory() as session:
        yield session
