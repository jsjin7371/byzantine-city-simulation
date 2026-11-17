"""God 테스트가 같이 쓰는 도구. 테스트 전용 City(MockCity)와 임시 HTTP 서버."""
from contextlib import contextmanager
import copy
from http.server import HTTPServer
from pathlib import Path
import random
import sys
from threading import Event, Thread
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import http
from god.simulation import DECISION_OF, ExperimentConfig, simulate


def mock_vote(inputs):
    """Test-only City voting; tie uses the sensor hint."""
    own = DECISION_OF[inputs["hint"]]
    votes = [own] + [inputs[k] for k in ("from_left", "from_right") if inputs[k] is not None]
    evacuate = votes.count("evacuate")
    decision = own if evacuate * 2 == len(votes) else ("evacuate" if evacuate * 2 > len(votes) else "stay")
    return decision


class MockCity:
    """Stateful test-only City implementing the original engine pseudocode."""
    def __init__(self):
        self.settings, self.rng, self.sent = {}, {}, []

    def init(self, city, settings):
        # Reinitializing must replace all previous experiment state.
        self.settings[city] = copy.deepcopy(settings)
        self.rng[city] = random.Random(settings["seed"])
        return {"ok": True}

    def turn(self, city, inputs):
        settings, rng = self.settings[city], self.rng[city]
        decision = mock_vote(inputs)
        opposite = {"evacuate": "stay", "stay": "evacuate"}
        base = opposite[DECISION_OF[settings["truth"]]] if settings["is_byzantine"] else decision
        reply = {"decision": decision}
        for side in ("left", "right"):
            if rng.random() < settings["drop_rate"]:
                value, status = None, "dropped"
            elif rng.random() < settings["flip_rate"]:
                value, status = opposite[base], "flipped"
            else:
                value, status = base, "normal"
            reply[f"sent_{side}"], reply[f"to_{side}"] = value, status
        self.sent.append((city, copy.deepcopy(reply)))
        return reply


def results(**kwargs):
    mock = MockCity()
    return list(simulate(ExperimentConfig.parse({"experiment_id": 1, "seed": 42, **kwargs}), mock.turn, mock.init))


class Transport:
    def __init__(self):
        self.cities, self.turns = [], []
        self.inits = []
        self.mock = MockCity()
        self.fail_city = None
        self.fail_turn = None

    def __call__(self, method, url, data):
        assert method == "POST"
        if url.startswith("http://city-"):
            city = int(url.split("city-")[1].split(":")[0])
            if url.endswith("/init"):
                self.inits.append((city, copy.deepcopy(data)))
                return self.mock.init(city, data)
            self.cities.append((city, copy.deepcopy(data)))
            if city == self.fail_city:
                raise URLError("City unavailable")
            return self.mock.turn(city, data)
        assert url.startswith("http://api:8000/internal/experiments/")
        experiment_id = int(url.split("/")[-2])
        if data["turn"] == self.fail_turn:
            raise HTTPError(url, 503, "backend unavailable", {}, None)
        self.turns.append(copy.deepcopy(data))
        return {"ok": True, "experiment_id": experiment_id, "turn": data["turn"]}


@contextmanager
def running_server(routes):
    ready = Event()
    servers = []
    errors = []

    def factory(address, handler):
        server = HTTPServer(("127.0.0.1", 0), handler)
        servers.append(server)
        ready.set()
        return server

    def start():
        try:
            http.serve(routes)
        except Exception as exc:
            errors.append(exc)
            ready.set()

    with patch.object(http, "HTTPServer", factory):
        thread = Thread(target=start, daemon=True)
        thread.start()
        if not ready.wait(5):
            raise RuntimeError("test HTTP server did not start")
    if errors:
        raise errors[0]
    server = servers[0]
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(5)
        server.server_close()
        if thread.is_alive():
            raise RuntimeError("test HTTP server did not stop")
