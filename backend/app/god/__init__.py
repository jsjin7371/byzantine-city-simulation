"""God 컨테이너와의 통신. GOD_MODE=mock이면 가짜 God, http면 실제 컨테이너."""
from collections.abc import Callable

from app.config import Settings
from types import SimpleNamespace

from app.god.client import game_http, run_http
from app.god.mock import run_mock
from app.god.mock_game import MockGodGames

RunGod = Callable[[dict], dict]


def get_runner(settings: Settings) -> RunGod:
    if settings.god_mode == "http":
        return lambda payload: run_http(settings.god_url, payload, settings.god_timeout)
    if settings.god_mode == "mock":
        return lambda payload: run_mock(payload, settings.n_cities)
    raise ValueError(f"GOD_MODE must be 'mock' or 'http', got {settings.god_mode!r}")


def get_game_god(settings: Settings):
    """게임용 God. start(payload)와 turn(game_id, payload)를 가진다."""
    if settings.god_mode == "http":
        url, t = settings.god_url, settings.god_timeout
        return SimpleNamespace(
            start=lambda payload: game_http("POST", f"{url}/games", payload, t),
            turn=lambda game_id, payload: game_http("POST", f"{url}/games/{game_id}/turns", payload, t),
        )
    return MockGodGames()
