"""Mock God: 실제 엔진이 붙기 전까지 같은 응답 형식의 가짜 결과를 만든다.

알고리즘은 단순 다수결 흉내일 뿐이고, 목적은 API·DB·프론트를 먼저 끝까지 돌려보는 것.
seed가 같으면 항상 같은 결과가 나온다.
"""
import random

FLIP_DECISION = {"evacuate": "stay", "stay": "evacuate"}
SENSOR_OF = {"evacuate": "danger", "stay": "safe"}
DECISION_OF = {"danger": "evacuate", "safe": "stay"}


def run_mock(payload: dict, n_cities: int) -> dict:
    rng = random.Random(payload.get("seed"))
    cities = list(range(1, n_cities + 1))
    byzantine_ids = sorted(rng.sample(cities, payload["byzantine_count"]))

    turns = []
    for turn in range(1, payload["turns"] + 1):
        truth = rng.choice(["evacuate", "stay"])

        # 1) 센서 읽기: 오류율만큼 틀린 값을 읽는다
        sensor = {}
        for c in cities:
            correct = SENSOR_OF[truth]
            wrong = "safe" if correct == "danger" else "danger"
            sensor[c] = wrong if rng.random() < payload["sensor_error_rate"] else correct

        # 2) 방송: 정상 도시는 자기 판단, 비잔틴 도시는 정답의 반대를 말한다
        own = {c: DECISION_OF[sensor[c]] for c in cities}
        broadcast = {c: FLIP_DECISION[truth] if c in byzantine_ids else own[c] for c in cities}

        # 3) 메시지 전달: 누락·조작
        messages = []
        inbox = {c: [] for c in cities}
        for src in cities:
            for dst in cities:
                if src == dst:
                    continue
                sent = broadcast[src]
                dropped = rng.random() < payload["drop_rate"]
                tampered = not dropped and rng.random() < payload["tamper_rate"]
                received = None if dropped else (FLIP_DECISION[sent] if tampered else sent)
                messages.append(
                    {"from": src, "to": dst, "sent": sent, "received": received,
                     "dropped": dropped, "tampered": tampered}
                )
                if received is not None:
                    inbox[dst].append(received)

        # 4) 결정: 자기 판단 + 받은 메시지 다수결, 동률이면 자기 판단
        city_rows = []
        for c in cities:
            if c in byzantine_ids:
                decision = FLIP_DECISION[truth]
            else:
                votes = inbox[c] + [own[c]]
                evac = votes.count("evacuate")
                stay = len(votes) - evac
                decision = own[c] if evac == stay else ("evacuate" if evac > stay else "stay")
            city_rows.append(
                {"city_id": c, "is_byzantine": c in byzantine_ids, "sensor": sensor[c],
                 "decision": decision, "broadcast": broadcast[c]}
            )

        turns.append({"turn": turn, "truth": truth, "cities": city_rows, "messages": messages})

    return {"n_cities": n_cities, "byzantine_ids": byzantine_ids, "turns": turns}
