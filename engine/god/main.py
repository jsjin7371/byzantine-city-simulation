"""God의 HTTP 서버를 시작한다. 도시의 판단은 City 서비스가 담당한다."""
import logging
import os

from common.http import request, serve
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


def main():
    if os.getenv("N_CITIES", str(N_CITIES)) != str(N_CITIES):
        raise ValueError("God requires N_CITIES=5")
    logging.basicConfig(level=logging.INFO)
    serve({("GET", "/health"): health, ("POST", "/run"): run})


if __name__ == "__main__":
    main()
