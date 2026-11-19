"""마피아 게임 한 판의 진행 (docs/spec.md 7절). 규칙 해석의 기준은 experiments/mafia_pilot.py.

God은 주장 모으기, 공유·모순, 의심도 수집, 고발 투표, 판정만 한다.
시민의 결정과 의심도 갱신은 City가 한다 (7.10 /turn).
"""
import itertools
import math
import random
from dataclasses import asdict, dataclass

from common.http import HttpError
from god.simulation import DECISION_OF, OPPOSITE_TRUTH, neighbors

N, TURNS, THRESHOLD = 5, 15, 60  # 도시 수, 턴 수, 투표가 열리는 의심도
OPPOSITE = {"evacuate": "stay", "stay": "evacuate"}
CHOICES = {"connection": ("all", "ring"), "citizen_type": ("majority", "wary", "ai"),
           "memory": ("turn", "recent", "full"), "share_mode": ("all", "pairs", "none"), "player": ("human", "bot")}


@dataclass(frozen=True)
class GameConfig:
    connection: str = "all"
    citizen_type: str = "wary"
    memory: str = "turn"
    share_mode: str = "pairs"
    share_pairs: int = 1
    mafia_count: int = 1
    player: str = "human"
    sensor_error: float = 0.1
    seed: int | None = None

    @classmethod
    def parse(cls, body):
        """7.8 POST /games 본문 → (game_id, 설정). 빠진 설정은 7.2 기본값."""
        if not isinstance(body, dict):
            raise HttpError(422, "/games body must be a JSON object")
        body = dict(body)
        game_id = body.pop("game_id", None)
        if type(game_id) is not int or game_id < 1:
            raise HttpError(422, "game_id must be an integer >= 1")
        unknown = body.keys() - cls.__dataclass_fields__.keys()
        if unknown:
            raise HttpError(422, f"unknown /games fields: {', '.join(sorted(unknown))}")
        config = cls(**body)
        for name, allowed in CHOICES.items():
            if getattr(config, name) not in allowed:
                raise HttpError(422, f"invalid {name}: expected one of {', '.join(allowed)}")
        for name, low, high in (("share_pairs", 1, None), ("mafia_count", 1, 2), ("seed", 0, 2**31 - 1)):
            value = getattr(config, name)
            if name == "seed" and value is None:
                continue
            if type(value) is not int or value < low or (high is not None and value > high):
                raise HttpError(422, f"invalid {name}: expected integer in {low}..{high}")
        e = config.sensor_error
        if type(e) not in (int, float) or not math.isfinite(e) or not 0 <= e <= 1:
            raise HttpError(422, "invalid sensor_error: expected finite number in 0..1")
        return game_id, config


def mafia_row(city, role):
    return {"city": city, "role": role, "hint": None, "received": None, "decision": None,
            "correct": None, "suspicion": None, "reason": None}


def validate_reply(reply, keys, wary):
    """City 응답 형식만 검사한다. wary(의심도 있는 시민)면 suspicion이 keys와 같은 키의 0~100 정수."""
    if not isinstance(reply, dict):
        raise ValueError("City must return an object")
    if reply.get("decision") not in ("evacuate", "stay"):
        raise ValueError("City must return decision='evacuate' or 'stay'")
    s = reply.get("suspicion")
    if wary:
        if (not isinstance(s, dict) or set(s) != set(keys)
                or any(type(v) is not int or not 0 <= v <= 100 for v in s.values())):
            raise ValueError("City suspicion must map every other city to an integer 0..100")
    elif s is not None:
        raise ValueError("majority City must return suspicion=null")
    if reply.get("reason") is not None and not isinstance(reply["reason"], str):
        raise ValueError("City reason must be a string or null")


class Game:
    def __init__(self, game_id, config):
        self.game_id, self.config = game_id, config
        self.rng = rng = random.Random(config.seed)  # 정답, 마피아 위치, 힌트, 공유 쌍, 동점 투표를 모두 뽑는다
        self.truth = rng.choice(["danger", "safe"])
        mafia = rng.sample(range(1, N + 1), config.mafia_count)
        self.player = mafia[0]
        self.roles = {c: "citizen" for c in range(1, N + 1)}
        self.roles.update({c: "colleague" for c in mafia[1:]})
        self.roles[self.player] = "player"
        self.citizens = [c for c in range(1, N + 1) if self.roles[c] == "citizen"]
        self.turn, self.game_over, self.outcome, self.end_reason = 0, False, None, None
        self.prev = {}  # 시민 → 직전 턴 결정
        self.past = {c: [] for c in self.citizens}  # 시민 → 지난 힌트 (오래된 것부터)
        self.wary = config.citizen_type != "majority"
        self.suspicion = {c: {str(o): 0 for o in range(1, N + 1) if o != c} for c in self.citizens}
        self.hints = self._draw_hints()

    def _draw_hints(self):
        err, truth = self.config.sensor_error, self.truth
        return {str(c): OPPOSITE_TRUTH[truth] if self.rng.random() < err else truth for c in self.citizens}

    def receivers(self):
        """사람 플레이어가 주장을 보내야 하는 시민 id 문자열. bot이면 없다."""
        if self.config.player == "bot":
            return set()
        return {str(c) for c in neighbors(self.player, N, self.config.connection) if self.roles[c] == "citizen"}

    def state(self):
        return {"game_id": self.game_id, "config": asdict(self.config), "truth": self.truth,
                "roles": {str(c): r for c, r in self.roles.items()}, "player_city": self.player,
                "turn": self.turn, "game_over": self.game_over, "outcome": self.outcome,
                "end_reason": self.end_reason, "next_hints": self.hints}

    def _claims(self, body):
        if not isinstance(body, dict):
            raise HttpError(422, "turn body must be a JSON object")
        if type(body.get("turn")) is not int:
            raise HttpError(422, "turn must be an integer")
        if self.game_over or body["turn"] != self.turn + 1:
            raise HttpError(409, f"expected turn {self.turn + 1}" if not self.game_over else "game is over")
        claims = body.get("claims")
        if not isinstance(claims, dict) or set(claims) != self.receivers():
            want = ", ".join(sorted(self.receivers())) or "none"
            raise HttpError(422, f"claims must have exactly the citizens next to the player: {want}")
        for key, msg in claims.items():
            if (not isinstance(msg, dict) or msg.get("claim") not in ("evacuate", "stay")
                    or not isinstance(msg.get("note", ""), str)):
                raise HttpError(422, f"invalid claim for city {key}: expected {{'claim': 'evacuate'|'stay'}}")
        return {key: msg["claim"] for key, msg in claims.items()}

    def play(self, body, city_turn):
        """한 턴 진행 (7.5). city_turn(city, 요청) → 7.10 응답. 반환은 7.7 턴 결과."""
        claims = self._claims(body)
        cfg, t, rng = self.config, self.turn + 1, self.rng
        answer = DECISION_OF[self.truth]

        # 2. 주장 모으기. 시민은 직전 결정, 동료·봇은 정답의 반대, 사람은 받는 시민별 claims.
        def message(s, r):
            if self.roles[s] == "citizen":
                claim = self.prev.get(s)
            elif s == self.player and cfg.player == "human":
                claim = claims[str(r)]
            else:
                claim = OPPOSITE[answer]
            return None if claim is None else {"claim": claim, "note": ""}
        received = {r: {str(s): message(s, r) for s in neighbors(r, N, cfg.connection)} for r in self.citizens}

        # 3. 정보 공유. 같은 보낸 도시가 쌍의 두 시민에게 다른 주장을 했으면 모순.
        combos = list(itertools.combinations(self.citizens, 2))
        pairs = (combos if cfg.share_mode == "all" else rng.sample(combos, min(cfg.share_pairs, len(combos)))
                 if cfg.share_mode == "pairs" else [])
        sharing = []
        for a, b in pairs:
            ra, rb = received[a], received[b]
            contradictions = [{"city": int(s), "told": {str(a): ra[s], str(b): rb[s]}} for s in ra
                              if ra[s] and rb.get(s) and ra[s]["claim"] != rb[s]["claim"]]
            sharing.append({"pair": [a, b], "contradictions": contradictions})

        # 4. 시민 City 호출 (턴마다 1회)
        replies = {}
        for r in self.citizens:
            request = {"turn": t, "hint": self.hints[str(r)], "received": received[r],
                       "shared": [x for x in sharing if r in x["pair"]],
                       "suspicion": self.suspicion[r] if self.wary else None}
            if cfg.memory != "turn":
                request["past_hints"] = self.past[r][-1:] if cfg.memory == "recent" else list(self.past[r])
            try:
                replies[r] = city_turn(r, request)
                validate_reply(replies[r], self.suspicion[r], self.wary)
            except Exception as exc:
                raise RuntimeError(f"turn {t}, city {r}: {exc}") from exc
        decisions = {r: replies[r]["decision"] for r in self.citizens}
        if self.wary:
            self.suspicion = {r: replies[r]["suspicion"] for r in self.citizens}

        # 5. 고발 투표 (7.6). 시민마다 자기를 뺀 도시 중 의심도 최고에 투표, 동점이면 무작위.
        vote, caught = None, False
        if self.wary and any(v >= THRESHOLD for r in self.citizens for v in self.suspicion[r].values()):
            ballots = {}
            for r in self.citizens:
                top = max(self.suspicion[r].values())
                ballots[str(r)] = int(rng.choice([s for s, v in self.suspicion[r].items() if v == top]))
            counts = list(ballots.values())
            accused = next((c for c in sorted(set(counts)) if counts.count(c) * 2 > len(self.citizens)), None)
            caught = accused is not None and self.roles[accused] != "citizen"
            vote = {"ballots": ballots, "accused": accused, "caught": caught}

        # 6. 종료 판정
        for r in self.citizens:
            self.past[r].append(self.hints[str(r)])
        self.prev, self.turn = decisions, t
        wrong = sum(d != answer for d in decisions.values())
        if caught:
            self.game_over, self.outcome, self.end_reason = True, "loss", "caught"
        elif t == TURNS:
            self.game_over, self.end_reason = True, "turns_done"
            self.outcome = ("perfect_win" if wrong == len(decisions) else
                            "win" if wrong * 2 > len(decisions) else "loss")
        hints = self.hints
        self.hints = None if self.game_over else self._draw_hints()

        cities = [mafia_row(c, self.roles[c]) if self.roles[c] != "citizen" else
                  {"city": c, "role": "citizen", "hint": hints[str(c)], "received": received[c],
                   "decision": decisions[c], "correct": decisions[c] == answer,
                   "suspicion": replies[c]["suspicion"], "reason": replies[c].get("reason")}
                  for c in range(1, N + 1)]
        return {"game_id": self.game_id, "turn": t, "truth": self.truth,
                "accuracy": 1 - wrong / len(decisions), "cities": cities, "sharing": sharing, "vote": vote,
                "game_over": self.game_over, "outcome": self.outcome, "end_reason": self.end_reason,
                "next_hints": self.hints}
