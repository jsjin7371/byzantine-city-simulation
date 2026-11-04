"""God 컨테이너와의 통신. GOD_MODE=mock이면 가짜 God, http면 실제 컨테이너."""
from collections.abc import Callable

from app.config import Settings
from app.god.client import run_http
from app.god.mock import run_mock

RunGod = Callable[[dict], dict]


def get_runner(settings: Settings) -> RunGod:
    if settings.god_mode == "http":
        return lambda payload: run_http(settings.god_url, payload, settings.god_timeout)
    if settings.god_mode == "mock":
        return lambda payload: run_mock(payload, settings.n_cities)
    raise ValueError(f"GOD_MODE must be 'mock' or 'http', got {settings.god_mode!r}")
