"""실험 C: 화면에 보이는 정보만 쓰는 전략이 '항상 반대' 봇보다 이기는가.
  python experiments/mafia_strategy.py --check      짧은 자체 점검 (봇 = 엔진 player=bot, smart 예측 = 엔진 의심도)
  python experiments/mafia_strategy.py [--runs N]   wary 시민, 의심도 수치 후보 × 난이도 × 전략(bot, smart) → mafia_strategy.csv
엔진은 고치지 않는다. 수치 후보는 워커 안에서 city.logic / god.game 모듈 상수만 덮어쓴다."""
import argparse, csv, itertools, os, sys, zlib
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mafia_compare import DIFFS, city_turn, wilson  # noqa: E402
import city.logic as logic  # noqa: E402  (mafia_compare가 engine 경로를 넣는다)
import god.game as game  # noqa: E402
from god.game import OPPOSITE, TURNS, Game, GameConfig  # noqa: E402
from god.simulation import DECISION_OF, neighbors  # noqa: E402

BASE = dict(up=20, down=20, contra=20, threshold=60)  # spec 7.6 현재 값
TUNE = [BASE, dict(BASE, up=10), dict(BASE, up=5), dict(BASE, down=10), dict(BASE, down=5),
        dict(BASE, contra=40), dict(BASE, contra=0), dict(BASE, threshold=40), dict(BASE, threshold=80)]
OUT = os.path.dirname(os.path.abspath(__file__))


def targets(g):
    """사람 플레이어가 쪽지를 보낼 수 있는 시민 목록 (all이면 전원, ring이면 양옆 이웃만)."""
    rec = g.receivers()
    return [c for c in g.citizens if str(c) in rec]


def bot(g):
    lie = OPPOSITE[DECISION_OF[g.truth]]
    return {str(c): lie for c in targets(g)}


def predict(g, claim):
    """claim(시민 id 문자열 → 주장)을 보내면 이번 턴 뒤 시민별 나에 대한 의심도. 엔진과 같은 입력을 만들어
    logic.game_turn을 직접 부른다. 입력은 화면 정보뿐: 지난 시민 결정, 동료(항상 반대), next_hints, next_share_pairs."""
    lie, cfg = OPPOSITE[DECISION_OF[g.truth]], g.config
    def msg(s, r):
        c = g.prev.get(s) if g.roles[s] == "citizen" else claim[str(r)] if s == g.player else lie
        return None if c is None else {"claim": c, "note": ""}
    received = {r: {str(s): msg(s, r) for s in neighbors(r, game.N, cfg.connection)} for r in g.citizens}
    sharing = [{"pair": [a, b], "contradictions": [{"city": int(s)} for s in received[a]
                if received[a][s] and received[b].get(s) and received[a][s]["claim"] != received[b][s]["claim"]]}
               for a, b in g.pairs]
    me = str(g.player)
    return {r: logic.game_turn(g.hints[str(r)], received[r], [x for x in sharing if r in x["pair"]],
                               g.suspicion[r])[1][me] for r in g.citizens}


def smart(g):
    """시민별 참/거짓 배정(최대 16가지)을 모두 predict로 보고, 이번 턴 뒤 의심도가 모두 limit(= 임계값 - 20) 미만인
    배정 중 거짓말이 가장 많은 것. 같으면 의심도 합이 낮은 쪽. 안전한 배정이 없으면 최대 의심도가 가장 낮은 배정
    (힌트와 같은 말로 신뢰 회복). 마지막 턴은 limit을 임계값으로 올린다 (이후 대가가 없음). wary 시민 전용."""
    lie, cs = OPPOSITE[DECISION_OF[g.truth]], targets(g)
    limit = game.THRESHOLD if g.turn + 1 == TURNS else game.THRESHOLD - 20
    best = None
    for combo in itertools.product((True, False), repeat=len(cs)):
        claim = {str(r): lie if x else OPPOSITE[lie] for r, x in zip(cs, combo)}
        after = predict(g, claim).values()
        safe = max(after) < limit
        key = (safe, sum(combo) if safe else -max(after), -sum(after))
        if best is None or key > best[0]:
            best = (key, claim)
    return best[1]


STRATS = {"bot": bot, "smart": smart}


def play(strat, diff, seed):
    g = Game(1, GameConfig(connection="all", citizen_type="wary", player="human", seed=seed, **DIFFS[diff]))
    while not g.game_over:
        claims = {r: {"claim": c, "note": ""} for r, c in STRATS[strat](g).items()}
        res = g.play({"turn": g.turn + 1, "claims": claims}, city_turn)
    return res["outcome"] in ("win", "perfect_win"), res["end_reason"] == "caught"


def apply(p):
    logic.SUSPICION_UP, logic.SUSPICION_DOWN, logic.SUSPICION_CONTRA = p["up"], p["down"], p["contra"]
    game.THRESHOLD = p["threshold"]


def run(job):
    strat, diff, runs, p = job
    apply(p)
    base = zlib.crc32(f"wary/all/{diff}".encode())  # 전략·후보끼리 같은 시드 목록 (구간은 독립 표본으로 계산)
    games = [play(strat, diff, base + i) for i in range(runs)]
    w, c = wilson([float(x[0]) for x in games]), wilson([float(x[1]) for x in games])
    return dict(p, strategy=strat, difficulty=diff, runs=runs,
                win_rate=w[0], win_lo=w[1], win_hi=w[2], caught_rate=c[0])


def check():
    for diff in DIFFS:  # player=human + 봇 전략 = 엔진 player=bot (같은 시드, 같은 결과)
        for s in range(1000, 1050):
            g = Game(1, GameConfig(connection="all", player="bot", seed=s, **DIFFS[diff]))
            while not g.game_over:
                res = g.play({"turn": g.turn + 1, "claims": {}}, city_turn)
            assert play("bot", diff, s) == (res["outcome"] in ("win", "perfect_win"), res["end_reason"] == "caught")
    for p in (BASE, TUNE[1], TUNE[5]):  # smart 예측 = 실제 엔진 결과 의심도 (매 턴, 수치 후보 덮어쓰기 포함)
        apply(p)
        for diff in DIFFS:
            for s in range(20):
                g = Game(1, GameConfig(connection="all", player="human", seed=s, **DIFFS[diff]))
                while not g.game_over:
                    claim = smart(g)
                    want = predict(g, claim)
                    g.play({"turn": g.turn + 1, "claims": {r: {"claim": c} for r, c in claim.items()}}, city_turn)
                    assert want == {r: g.suspicion[r][str(g.player)] for r in g.citizens}, (p, diff, s, g.turn)
    apply(BASE)
    g = Game(1, GameConfig(connection="all", player="human", seed=3, **DIFFS["normal"]))
    assert smart(g) == bot(g)  # 1턴: 의심도 0이라 모두에게 거짓말해도 limit 미만
    r = g.citizens[0]
    g.suspicion[r][str(g.player)] = 55  # 의심도가 높은 시민에겐 힌트와 같은 말로 회복
    assert smart(g)[str(r)] == DECISION_OF[g.hints[str(r)]]
    print("check ok")


def main(runs):
    with Pool() as pool:
        rows = pool.map(run, [(s, d, runs, p) for p in TUNE for d in DIFFS for s in STRATS])
    with open(os.path.join(OUT, "mafia_strategy.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()})
            print(*(f"{k}={r[k]:.3f}" if isinstance(r[k], float) else f"{k}={r[k]}" for k in r))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--runs", type=int, default=2000)
    a = ap.parse_args()
    check() if a.check else main(a.runs)
