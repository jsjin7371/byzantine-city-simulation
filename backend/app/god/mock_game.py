"""Mock God 게임 (docs/spec.md 7.5~7.8). 프론트가 엔진 없이 개발·시연하는 용도의 단순 규칙.

시민은 모두 다수결(힌트 1표 + 받은 주장마다 1표, 동점이면 힌트), 의심도·공유·투표는 없다.
게임 상태는 메모리에 한 판만 둔다 (진짜 God과 같은 규칙).
"""
import random

from app.god.client import GodGameError
from app.god.mock import DECISION_OF, OPPOSITE_DECISION, OPPOSITE_TRUTH

N, TURNS = 5, 15


class MockGodGames:
    def __init__(self):
        self.game = None

    def start(self, payload: dict) -> dict:
        cfg = {k: v for k, v in payload.items() if k != "game_id"}
        rng = random.Random(cfg["seed"])
        cities = list(range(1, N + 1))
        mafia = rng.sample(cities, cfg["mafia_count"])
        roles = {c: "citizen" for c in cities}
        roles[mafia[0]] = "player"
        for c in mafia[1:]:
            roles[c] = "colleague"
        self.game = {"id": payload["game_id"], "config": cfg, "rng": rng, "truth": rng.choice(["danger", "safe"]),
                     "roles": roles, "player": mafia[0], "turn": 0, "over": False, "outcome": None,
                     "end_reason": None, "prev": {}}
        self.game["hints"] = self._hints()
        return self._state()

    def turn(self, game_id: int, payload: dict) -> dict:
        g = self.game
        if g is None or g["id"] != game_id:
            raise GodGameError(f"game {game_id} not found", 404)
        if g["over"] or payload["turn"] != g["turn"] + 1:
            raise GodGameError("turn is not the next one or game is over", 409)
        claims = payload["claims"]
        if set(claims) != {str(c) for c in self._receivers()}:
            raise GodGameError("claims must contain exactly the citizens next to the player", 422)

        truth, ring = g["truth"], g["config"]["connection"] == "ring"
        answer = DECISION_OF[truth]
        bad = {"claim": OPPOSITE_DECISION[answer], "note": ""}
        cities, decisions = [], {}
        for c in range(1, N + 1):
            if g["roles"][c] != "citizen":
                cities.append({"city": c, "role": g["roles"][c], "hint": None, "received": None, "decision": None,
                               "correct": None, "suspicion": None, "reason": None})
                continue
            received = {}
            for s in range(1, N + 1):
                near = not ring or (s - c) % N in (1, N - 1)
                if s == c or not near:
                    msg = None
                elif g["roles"][s] == "citizen":
                    msg = {"claim": g["prev"][s], "note": ""} if g["prev"] else None
                elif g["roles"][s] == "player" and g["config"]["player"] == "human":
                    msg = {"claim": claims[str(c)]["claim"], "note": ""}
                else:
                    msg = bad
                received[str(s)] = msg
            votes = [DECISION_OF[g["hints"][c]]] + [m["claim"] for m in received.values() if m]
            evac = votes.count("evacuate")
            decisions[c] = DECISION_OF[g["hints"][c]] if evac * 2 == len(votes) else (
                "evacuate" if evac * 2 > len(votes) else "stay")
            cities.append({"city": c, "role": "citizen", "hint": g["hints"][c], "received": received,
                           "decision": decisions[c], "correct": decisions[c] == answer, "suspicion": None,
                           "reason": "힌트와 받은 주장의 다수결로 정했다."})
        g["prev"] = decisions
        g["turn"] += 1
        wrong = sum(d != answer for d in decisions.values())
        if g["turn"] == TURNS:
            g["over"], g["end_reason"] = True, "turns_done"
            g["outcome"] = ("perfect_win" if wrong == len(decisions) else
                            "win" if wrong * 2 > len(decisions) else "loss")
        g["hints"] = None if g["over"] else self._hints()
        return {"game_id": g["id"], "turn": g["turn"], "truth": truth,
                "accuracy": 1 - wrong / len(decisions), "cities": cities, "sharing": [], "vote": None,
                "game_over": g["over"], "outcome": g["outcome"], "end_reason": g["end_reason"],
                "next_hints": self._hint_json()}

    def _receivers(self) -> list[int]:
        """사람 플레이어가 주장을 보내야 하는 시민들. bot이면 없음."""
        g, p = self.game, self.game["player"]
        if g["config"]["player"] == "bot":
            return []
        ring = g["config"]["connection"] == "ring"
        return [c for c in range(1, N + 1) if g["roles"][c] == "citizen" and (not ring or (p - c) % N in (1, N - 1))]

    def _hints(self) -> dict:
        g = self.game
        return {c: OPPOSITE_TRUTH[g["truth"]] if g["rng"].random() < g["config"]["sensor_error"] else g["truth"]
                for c, r in g["roles"].items() if r == "citizen"}

    def _hint_json(self):
        h = self.game["hints"]
        return None if h is None else {str(c): v for c, v in h.items()}

    def _state(self) -> dict:
        g = self.game
        return {"game_id": g["id"], "config": g["config"], "truth": g["truth"],
                "roles": {str(c): r for c, r in g["roles"].items()}, "player_city": g["player"],
                "turn": g["turn"], "game_over": g["over"], "outcome": g["outcome"],
                "end_reason": g["end_reason"], "next_hints": self._hint_json()}
