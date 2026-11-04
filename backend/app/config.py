"""환경 변수 설정. docker-compose나 PowerShell에서 값을 바꿔 쓴다."""
import os
from dataclasses import dataclass, field

DEFAULT_DATABASE_URL = "mysql+pymysql://byzantine:byzantine@127.0.0.1:3307/byzantine?charset=utf8mb4"


def _list(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    # DB 주소. 로컬은 compose의 MySQL(3307), 컨테이너 안에서는 compose가 덮어쓴다.
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    # mock: 백엔드 안의 가짜 God 사용 / http: 실제 God 컨테이너 호출
    god_mode: str = field(default_factory=lambda: os.getenv("GOD_MODE", "mock"))
    god_url: str = field(default_factory=lambda: os.getenv("GOD_URL", "http://god:8000"))
    god_timeout: float = field(default_factory=lambda: float(os.getenv("GOD_TIMEOUT", "120")))
    n_cities: int = field(default_factory=lambda: int(os.getenv("N_CITIES", "5")))
    # 프론트 개발 서버 주소 (Vite 5173, CRA 3000)
    cors_origins: list[str] = field(
        default_factory=lambda: _list(os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"))
    )


def get_settings() -> Settings:
    return Settings()
