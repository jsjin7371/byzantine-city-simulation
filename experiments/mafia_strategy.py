"""실험 C: 화면에 보이는 정보만 쓰는 전략이 '항상 반대' 봇보다 이기는가.
  python experiments/mafia_strategy.py --check        짧은 자체 점검 (봇 전략 = player=bot 재현, 전략 동작)
  python experiments/mafia_strategy.py [--runs N]     난이도 × 시민(wary, majority) × 전략 → mafia_strategy.csv
  python experiments/mafia_strategy.py --tune [--runs N]   의심도 수치 후보별 봇·전략 승률 → mafia_strategy_tune.csv
엔진은 고치지 않는다. 수치 후보는 워커 안에서 city.logic / god.game 모듈 상수만 덮어쓴다."""
import argparse, csv, itertools, os, sys, zlib
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mafia_compare import DIFFS, city_turn, wilson  # noqa: E402
import city.logic as logic  # noqa: E402  (mafia_compare가 engine 경로를 넣는다)
import god.game as game  # noqa: E402
from god.game import OPPOSITE, TURNS, Game, GameConfig  # noqa: E402
from god.simulation import DECISION_OF  # noqa: E402

BASE = dict(up=10, down=20, contra=20, threshold=60)  # spec 7.6 현재 값
TUNE = [dict(BASE), dict(BASE, up=20), dict(BASE, up=5), dict(BASE, down=10), dict(BASE, down=5),
        dict(BASE, contra=40), dict(BASE, contra=0), dict(BASE, threshold=40), dict(BASE, threshold=80),
        dict(BASE, up=20, down=10)]
OUT = os.path.dirname(os.path.abspath(__file__))


def bot(g):
    lie = OPPOSITE[DECISION_OF[g.truth]]
    return {str(c): lie for c in g.citizens}


def smart(g, limit):
    """플레이어 화면 정보만: 정답, next_hints, next_share_pairs, 시민별 나에 대한 의심도 (+ 수치 규칙).
    16가지 이하 배정을 모두 보고, 이번 턴 뒤 의심도가 모두 limit 미만인 배정 중 거짓말을 가장 많이 하는 것.
    거짓말 수가 같으면 의심도 합이 낮은 쪽. 그런 배정이 없으면 최대 의심도가 가장 낮은 배정 (신뢰 회복).
    마지막 턴은 limit을 threshold로 올린다 (이후 대가가 없음)."""
    me, lie = str(g.player), OPPOSITE[DECISION_OF[g.truth]]
    cs = g.citizens
    if not g.wary:
        return bot(g)  # 다수결 시민은 의심도·투표가 없어 항상 반대가 최선
    if g.turn + 1 == TURNS:
        limit = game.THRESHOLD
    best = None
    for combo in itertools.product((True, False), repeat=len(cs)):
        claim = {r: lie if x else OPPOSITE[lie] for r, x in zip(cs, combo)}
        contra = {r for a, b in g.pairs if claim[a] != claim[b] for r in (a, b)}
        after = []
        for r in cs:
            mine = DECISION_OF[g.hints[str(r)]]
            v = g.suspicion[r][me] + (-logic.SUSPICION_DOWN if claim[r] == mine else logic.SUSPICION_UP)
            after.append(max(0, min(100, v + (logic.SUSPICION_CONTRA if r in contra else 0))))
        safe = max(after) < limit
        key = (safe, sum(combo) if safe else -max(after), -sum(after))
        if best is None or key > best[0]:
            best = (key, claim)
    return {str(r): c for r, c in best[1].items()}


STRATS = {"bot": bot, "smart40": lambda g: smart(g, 40), "smart60": lambda g: smart(g, 60)}


def play(strat, kind, diff, seed):
    g = Game(1, GameConfig(connection="all", citizen_type=kind, player="human", seed=seed, **DIFFS[diff]))
    while not g.game_over:
        claims = {r: {"claim": c, "note": ""} for r, c in STRATS[strat](g).items()}
        res = g.play({"turn": g.turn + 1, "claims": claims}, city_turn)
    return res["outcome"] in ("win", "perfect_win"), res["end_reason"] == "caught"


def apply(p):
    logic.SUSPICION_UP, logic.SUSPICION_DOWN, logic.SUSPICION_CONTRA = p["up"], p["down"], p["contra"]
    game.THRESHOLD = p["threshold"]


def run(job):
    strat, kind, diff, runs, p = job
    apply(p)
    base = zlib.crc32(f"{kind}/all/{diff}".encode())  # 전략끼리 같은 판(시드)을 비교
    games = [play(strat, kind, diff, base + i) for i in range(runs)]
    w, c = wilson([float(x[0]) for x in games]), wilson([float(x[1]) for x in games])
    return dict(p, strategy=strat, citizen_type=kind, difficulty=diff, runs=runs,
                win_rate=w[0], win_lo=w[1], win_hi=w[2], caught_rate=c[0])


def write(name, rows):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()})
            print(*(f"{k}={r[k]:.3f}" if isinstance(r[k], float) else f"{k}={r[k]}" for k in r))


def check():
    for diff in DIFFS:  # player=human + 봇 전략 = 엔진 player=bot (같은 시드, 같은 결과)
        for i in range(50):
            s = 1000 + i
            g = Game(1, GameConfig(connection="all", player="bot", seed=s, **DIFFS[diff]))
            while not g.game_over:
                res = g.play({"turn": g.turn + 1, "claims": {}}, city_turn)
            assert play("bot", "wary", diff, s) == (res["outcome"] in ("win", "perfect_win"), res["end_reason"] == "caught")
    g = Game(1, GameConfig(connection="all", player="human", seed=3, **DIFFS["normal"]))
    lie = OPPOSITE[DECISION_OF[g.truth]]
    assert smart(g, 60) == bot(g)  # 1턴: 의심도 0이라 모두에게 거짓말해도 limit 미만
    r = g.citizens[0]
    g.suspicion[r][str(g.player)] = 55  # 높은 의심도 시민은 힌트와 같은 말로 회복
    out = smart(g, 60)
    assert out[str(r)] == DECISION_OF[g.hints[str(r)]] or DECISION_OF[g.hints[str(r)]] == lie, out
    row = run(("smart60", "wary", "normal", 200, BASE))
    assert 0 <= row["win_rate"] <= 1
    print("check ok", row["win_rate"])


def main(runs, tune):
    if tune:
        jobs = [(s, "wary", d, runs, p) for p in TUNE for d in DIFFS for s in STRATS]
    else:
        jobs = [(s, k, d, runs, BASE) for k in ("wary", "majority") for d in DIFFS for s in STRATS]
    with Pool() as pool:
        rows = pool.map(run, jobs)
    write("mafia_strategy_tune.csv" if tune else "mafia_strategy.csv", rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--tune", action="store_true")
    ap.add_argument("--runs", type=int, default=3000)
    a = ap.parse_args()
    check() if a.check else main(a.runs, a.tune)
