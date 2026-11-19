"""God의 HTTP 서버를 시작한다. 도시의 판단은 City 서비스가 담당한다."""
import logging

from common.http import HttpError, request, serve
from god.game import Game, GameConfig
from god.simulation import CITY_IDS, N_CITIES, GodService


def city_alive(i):
    try:
        reply = request("GET", f"http://city-{i}:8000/health")
        return isinstance(reply, dict) and reply.get("ok") is True
    except (OSError, ValueError):
        return False


def health(_):
    return {"ok": True, "cities": {i: city_alive(i) for i in CITY_IDS}}


service = GodService()


def run(body):
    return service.run(body)


game = None  # 진행 중 게임은 하나. 새 POST /games가 오면 버린다 (7.8)


def current_game(game_id):
    if game is None or str(game.game_id) != game_id:
        raise HttpError(404, f"game {game_id} not found")
    return game


def start_game(body):
    global game
    game = Game(*GameConfig.parse(body))
    return game.state()


def play_turn(body, game_id):
    return current_game(game_id).play(body, lambda city, req: service._post(f"http://city-{city}:8000/turn", req))


def get_game(_, game_id):
    return current_game(game_id).state()


GAME_ROUTES = {("POST", "/games"): start_game, ("POST", "/games/{}/turns"): play_turn,
               ("GET", "/games/{}"): get_game}


def main():
    if N_CITIES < 3:  # ring은 왼쪽·오른쪽 이웃이 달라야 한다
        raise ValueError("God requires N_CITIES >= 3")
    logging.basicConfig(level=logging.INFO)
    serve({("GET", "/health"): health, ("POST", "/run"): run, **GAME_ROUTES})


if __name__ == "__main__":
    main()
