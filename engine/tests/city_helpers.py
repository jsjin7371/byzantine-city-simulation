"""City 테스트가 같이 쓰는 도구."""
import random

E, S = "evacuate", "stay"


def make_state(drop=0, flip=0, byzantine=False, truth=None, seed=1):
    """테스트용 도시 상태. 확률을 0이나 1로 주면 결과가 정해진다."""
    return {"drop_rate": drop, "flip_rate": flip, "is_byzantine": byzantine,
            "truth": truth, "rng": random.Random(seed)}
