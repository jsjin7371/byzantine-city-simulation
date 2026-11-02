"""원본 슈도코드에 따라 도시 5개의 실험을 진행한다.

정답은 실험 시작 시 한 번 정하고, 메시지는 다음 턴에 전달한다.
투표, 비잔틴 발신값 생성, 메시지 누락과 조작은 City가 담당한다.
"""
import hashlib
import logging
import math
import random
from dataclasses import dataclass
from threading import Lock

from common.http import request

N_CITIES = 5
CITY_IDS = tuple(range(1, N_CITIES + 1))
DECISION_OF = {"danger": "evacuate", "safe": "stay"}
OPPOSITE_TRUTH = {"danger": "safe", "safe": "danger"}
DECISIONS = frozenset(DECISION_OF.values())
log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExperimentConfig:
    experiment_id: int
    turns: int = 10
    sensor_error: float = 0.1
    drop_rate: float = 0.0
    flip_rate: float = 0.0
    byzantine_count: int = 1
    seed: int | None = None

    @classmethod
    def parse(cls, body):
        if not isinstance(body, dict):
            raise ValueError("/run body must be a JSON object")
        unknown = body.keys() - cls.__dataclass_fields__.keys()
        if unknown:
            raise ValueError(f"unknown /run fields: {', '.join(sorted(unknown))}")
        if "experiment_id" not in body:
            raise ValueError("experiment_id is required")
        config = cls(**body)
        for name, low, high in (
            ("experiment_id", 1, None), ("turns", 1, 20),
            ("byzantine_count", 0, N_CITIES), ("seed", 0, 2**31 - 1),
        ):
            value = getattr(config, name)
            if name == "seed" and value is None:
                continue
            if type(value) is not int or value < low or (high is not None and value > high):
                raise ValueError(f"invalid {name}: expected integer in {low}..{high}")
        for name in ("sensor_error", "drop_rate", "flip_rate"):
            value = getattr(config, name)
            if type(value) not in (int, float) or not 0 <= value <= 1 or not math.isfinite(value):
                raise ValueError(f"invalid {name}: expected finite number in 0..1")
        return config


def city_seed(seed, city):
    """호출 순서와 실험 ID에 영향받지 않는 도시별 seed를 만든다. 분배 규칙은 제안 단계다."""
    if seed is None:
        return None
    digest = hashlib.sha256(f"god-city-v1:{seed}:{city}".encode("ascii")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7fffffff


def validate_city_reply(reply):
    """City의 판단을 다시 계산하지 않고 응답 형식과 발신값·상태의 일관성을 검사한다."""
    if not isinstance(reply, dict):
        raise ValueError("City must return an object")
    decision = reply.get("decision")
    if not isinstance(decision, str) or decision not in DECISIONS:
        raise ValueError("City must return decision='evacuate' or 'stay'")
    for side in ("left", "right"):
        if f"sent_{side}" not in reply:
            raise ValueError(f"City must return sent_{side}")
        value, status = reply[f"sent_{side}"], reply.get(f"to_{side}")
        if not isinstance(status, str) or status not in ("normal", "dropped", "flipped"):
            raise ValueError(f"invalid City to_{side} status")
        if status == "dropped":
            if value is not None:
                raise ValueError(f"City sent_{side} must be null when dropped")
        elif not isinstance(value, str) or value not in DECISIONS:
            raise ValueError(f"invalid City sent_{side} message")


def simulate(config, city_turn, city_init):
    """모든 City를 초기화한 뒤 응답을 모아 백엔드에 보낼 턴 JSON을 하나씩 만든다.

    초기화·턴 호출 함수로 통신을 분리해 제안 중인 /init·/turn 필드명을 조정할 수 있다.
    """
    rng = random.Random(config.seed)
    truth = rng.choice(["danger", "safe"])
    byzantine = set(rng.sample(CITY_IDS, config.byzantine_count))
    received = {c: {"left": None, "right": None} for c in CITY_IDS}

    for city in CITY_IDS:
        settings = {"experiment_id": config.experiment_id, "drop_rate": config.drop_rate,
                    "flip_rate": config.flip_rate, "is_byzantine": city in byzantine,
                    "seed": city_seed(config.seed, city)}
        if city in byzantine:
            settings["truth"] = truth
        try:
            ack = city_init(city, settings)
            if not isinstance(ack, dict) or ack.get("ok") is not True:
                raise ValueError("City /init must acknowledge with ok=true")
        except Exception as exc:
            raise RuntimeError(f"city {city} initialization: {exc}") from exc

    for turn in range(1, config.turns + 1):
        rows, sent_by = [], {}
        for city in CITY_IDS:
            hint = OPPOSITE_TRUTH[truth] if rng.random() < config.sensor_error else truth
            inputs = {"hint": hint, "from_left": received[city]["left"],
                      "from_right": received[city]["right"]}
            try:
                reply = city_turn(city, inputs.copy())
                validate_city_reply(reply)
            except Exception as exc:
                raise RuntimeError(f"turn {turn}, city {city}: {exc}") from exc

            # 상태로 발신값을 추측하지 않고 City가 반환한 값을 그대로 중계한다.
            sent_by[city] = {"left": reply["sent_left"], "right": reply["sent_right"]}
            rows.append({"city": city, "is_byzantine": city in byzantine, **inputs,
                         "decision": reply["decision"], "to_left": reply["to_left"],
                         "to_right": reply["to_right"]})

        correct = sum(row["decision"] == DECISION_OF[truth] for row in rows)
        yield {"turn": turn, "truth": truth, "accuracy": correct / N_CITIES, "cities": rows}

        # 모든 응답을 모은 뒤 갱신해 같은 턴의 발신값이 다른 도시의 입력에 섞이지 않게 한다.
        received = {
            city: {"left": sent_by[CITY_IDS[index - 1]]["right"],
                   "right": sent_by[CITY_IDS[(index + 1) % N_CITIES]]["left"]}
            for index, city in enumerate(CITY_IDS)
        }


class GodService:
    """실험을 하나씩 실행하고 저장 여부가 불확실한 요청은 재전송하지 않는다.

    실행을 시도한 ID는 실패해도 메모리에 보관한다.
    God 재시작 후의 중복 실행 방지는 백엔드가 담당한다.
    """

    def __init__(self, transport=None):
        self.transport = transport or request
        self._lock = Lock()
        self._attempted = set()

    def _city_turn(self, city, inputs):
        return self.transport("POST", f"http://city-{city}:8000/turn", inputs)

    def _city_init(self, city, settings):
        return self.transport("POST", f"http://city-{city}:8000/init", settings)

    def run(self, body):
        config = ExperimentConfig.parse(body)
        if not self._lock.acquire(blocking=False):
            raise RuntimeError("God is already running an experiment")
        completed, current = 0, 0
        try:
            if config.experiment_id in self._attempted:
                raise RuntimeError(f"experiment {config.experiment_id} already attempted; use a new experiment_id")
            self._attempted.add(config.experiment_id)
            log.info("experiment %s started", config.experiment_id)
            for result in simulate(config, self._city_turn, self._city_init):
                current = result["turn"]
                ack = self.transport(
                    "POST", f"http://api:8000/internal/experiments/{config.experiment_id}/turns", result,
                )
                if (not isinstance(ack, dict) or ack.get("ok") is not True
                        or type(ack.get("experiment_id")) is not int
                        or ack["experiment_id"] != config.experiment_id
                        or type(ack.get("turn")) is not int or ack["turn"] != current):
                    raise ValueError(f"invalid backend acknowledgement for turn {current}")
                completed += 1
                log.info("experiment %s turn %s acknowledged", config.experiment_id, current)
            return {"ok": True}
        except Exception as exc:
            message = (f"experiment {config.experiment_id} failed; acknowledged {completed}/{config.turns} turns; "
                       f"{exc}")
            if current > completed:
                message += f"; turn {current} delivery may already be stored; no automatic retry"
            log.error("%s", message)
            raise RuntimeError(message) from exc
        finally:
            self._lock.release()
