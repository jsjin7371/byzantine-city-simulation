# Alembic 실행 설정. DB 주소는 alembic.ini에 적지 않고 DATABASE_URL 환경 변수(app/config.py)에서 읽는다.
# alembic.ini에는 한글을 쓰지 않는다. Alembic이 그 파일을 OS 기본 인코딩으로 읽어서
# 한국어 Windows(cp949)에서는 한글 한 글자만 있어도 UnicodeDecodeError가 난다.

from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  모델을 불러와야 Base.metadata에 테이블이 등록된다
from app.config import get_settings
from app.db import Base, make_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    # 테스트 등에서 config.set_main_option("sqlalchemy.url", ...)로 넘기면 그 값을 우선 사용
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=get_url(), target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with make_engine(get_url()).connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
