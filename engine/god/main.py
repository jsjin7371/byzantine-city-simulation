"""God의 HTTP 서버를 시작한다. 도시의 판단은 City 서비스가 담당한다."""
import logging

from common.http import HttpError, request, serve
from god.game import N, Game, GameConfig
from god.kubernetes import configured_pool
from god.simulation import CITY_IDS, N_CITIES, GodService


def city_alive(i):
    try:
        url = city_pool.urls.get(i) if city_pool is not None else f"http://city-{i}:8000"
        if url is None:
            return False
        reply = request("GET", url + "/health")
        return isinstance(reply, dict) and reply.get("ok") is True
    except (OSError, ValueError):
        return False


def health(_):
    return {"ok": True, "cities": {i: city_alive(i) for i in CITY_IDS}}


service = GodService()


def run(body):
    if city_pool is not None:
        raise HttpError(503, "/run is not supported in Kubernetes game mode")
    return service.run(body)


AI_CITY_TIMEOUT = 40
game = None  # 진행 중 게임은 하나. 새 POST /games가 오면 버린다 (7.8)
city_pool = None  # Compose에서는 고정 주소를 쓰고 Kubernetes 모드에서만 자원을 관리한다.


def current_game(game_id):
    if game is None or str(game.game_id) != game_id:
        raise HttpError(404, f"game {game_id} not found")
    return game


def start_game(body):
    global game
    if N_CITIES != N:  # 게임은 도시 5개 고정 (7.1)
        raise HttpError(503, f"game requires N_CITIES = {N}, got {N_CITIES}")
    next_game = Game(*GameConfig.parse(body))
    if city_pool is not None:
        game = None
        city_pool.start(next_game.game_id)
    game = next_game
    return game.state()


def play_turn(body, game_id):
    global game
    g = current_game(game_id)
    timeout = AI_CITY_TIMEOUT if g.config.citizen_type == "ai" else 1  # AI는 City의 LLM 제한(30초)보다 길게
    def city_turn(city, req):
        """현재 게임의 City 주소로 판단을 요청하는 기능"""
        url = city_pool.urls[city] if city_pool is not None else f"http://city-{city}:8000"
        return service._post(url + "/turn", req, timeout)

    try:
        result = g.play(body, city_turn)
    except HttpError:
        raise
    except Exception:
        if city_pool is not None:
            game = None
            city_pool.cleanup()
        raise
    if g.game_over and city_pool is not None:
        city_pool.cleanup()
    return result


def get_game(_, game_id):
    return current_game(game_id).state()


GAME_ROUTES = {("POST", "/games"): start_game, ("POST", "/games/{}/turns"): play_turn,
               ("GET", "/games/{}"): get_game}


def main():
    global city_pool
    if N_CITIES < 3:  # ring은 왼쪽·오른쪽 이웃이 달라야 한다
        raise ValueError("God requires N_CITIES >= 3")
    logging.basicConfig(level=logging.INFO)
    city_pool = configured_pool()
    serve({("GET", "/health"): health, ("POST", "/run"): run, **GAME_ROUTES})


if __name__ == "__main__":
    main()
