"""6단계 실험 모드: 실제 엔진(god/game.py + city 함수)을 HTTP 없이 함수로 연결해 player=bot 게임을 반복한다.
  python experiments/mafia_compare.py --check      파일럿(mafia_pilot.csv)과 같은 조건의 봇 승률 대조
  python experiments/mafia_compare.py [--runs N]   majority/wary 조건별 N판 → mafia_compare.csv
  python experiments/mafia_compare.py --ai --runs 30   ai 조건도 실행 (LLM_API_KEY 필요, 없으면 건너뜀)"""
import argparse, csv, itertools, math, os, sys, zlib
from multiprocessing import Pool
from statistics import fmean, stdev

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine"))
from city.ai import ai_turn  # noqa: E402
from city.logic import game_turn  # noqa: E402
from god.game import Game, GameConfig  # noqa: E402

DIFFS = {"easy": dict(mafia_count=2, sensor_error=0.4), "normal": dict(mafia_count=1, sensor_error=0.3),
         "hard": dict(mafia_count=1, sensor_error=0.2)}  # spec 7.2 난이도 프리셋
PILOT_WIN = {"easy": 0.5712, "normal": 0.2408, "hard": 0.0209}  # mafia_pilot.csv difficulty 행 (wary, 10000판)
COLS = ["citizen_type", "connection", "difficulty", "runs", "accuracy", "accuracy_ci", "win_rate", "win_ci",
        "suspicion_hit", "suspicion_hit_ci", "caught_rate", "caught_ci", "caught_turn", "caught_turn_ci"]


def city_turn(_, req):
    """엔진 City의 /turn과 같은 분기 (engine/city/main.py)."""
    if "personality" in req:
        d, s, r = ai_turn(req["personality"], req["hint"], req["received"], req["shared"], req["suspicion"])
    else:
        d, s, r = game_turn(req["hint"], req["received"], req["shared"], req["suspicion"], req.get("past_hints", ()))
    return {"decision": d, "suspicion": s, "reason": r}


def play(kind, conn, diff, seed):
    g = Game(1, GameConfig(connection=conn, citizen_type=kind, player="bot", seed=seed, **DIFFS[diff]))
    while not g.game_over:
        res = g.play({"turn": g.turn + 1, "claims": {}}, city_turn)
    hit = None
    if kind != "majority":  # 시민마다 최고 의심 도시들 중 마피아 몫 (동점이면 나눠 센다)
        mafia = {str(c) for c, role in g.roles.items() if role != "citizen"}
        hit = fmean(len(mafia & {s for s, v in g.suspicion[r].items() if v == max(g.suspicion[r].values())})
                    / sum(v == max(g.suspicion[r].values()) for v in g.suspicion[r].values()) for r in g.citizens)
    caught = res["end_reason"] == "caught"
    return res["accuracy"], res["outcome"] in ("win", "perfect_win"), hit, caught, res["turn"] if caught else None


def ci(xs):
    """평균, 95% 신뢰구간 반폭 (정규근사). 값이 없으면 (None, None)."""
    xs = [x for x in xs if x is not None]
    if not xs:
        return None, None
    return fmean(xs), 1.96 * stdev(xs) / math.sqrt(len(xs)) if len(xs) > 1 else None


def run(job):
    kind, conn, diff, runs = job
    base = zlib.crc32(f"{kind}/{conn}/{diff}".encode())  # 조건마다 고정 시드, 판마다 +i
    games = [play(kind, conn, diff, base + i) for i in range(runs)]
    row = dict(citizen_type=kind, connection=conn, difficulty=diff, runs=runs)
    for name, col in zip(("accuracy", "win", "suspicion_hit", "caught"), zip(*games)):
        row[name + ("_rate" if name in ("win", "caught") else "")], row[name + "_ci"] = ci(map(float, col) if None not in col else col)
    row["caught_turn"], row["caught_turn_ci"] = ci([g[4] for g in games])
    return row


def check():
    runs = 2000
    for diff, want in PILOT_WIN.items():
        r = run(("wary", "all", diff, runs))
        tol = 3 * math.sqrt(want * (1 - want) * (1 / runs + 1 / 10000)) + 0.005
        print(f"wary all {diff}: win_rate {r['win_rate']:.4f} (pilot {want}, tol {tol:.4f})")
        assert abs(r["win_rate"] - want) < tol, r
    print("check ok")


def main(runs, ai):
    if ai and not os.environ.get("LLM_API_KEY"):
        print("LLM_API_KEY가 없어 ai는 건너뜀 (가짜 LLM 결과는 의미 없음)")
        ai = False
    jobs = [(k, c, d, runs) for k, c, d in itertools.product(("majority", "wary", "ai"), ("all", "ring"), DIFFS)
            if k != "ai" or ai]
    with Pool() as p:
        rows = {(r["citizen_type"], r["connection"], r["difficulty"]): r for r in p.map(run, [j for j in jobs if j[0] != "ai"])}
    rows.update({(j[0], j[1], j[2]): run(j) for j in jobs if j[0] == "ai"})  # ai는 호출 병렬이 엔진 안에 있어 순차로
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mafia_compare.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, COLS)
        w.writeheader()
        for k, c, d in itertools.product(("majority", "wary", "ai"), ("all", "ring"), DIFFS):
            r = rows.get((k, c, d), dict(citizen_type=k, connection=c, difficulty=d))
            w.writerow({x: round(v, 4) if isinstance(v, float) else v for x, v in r.items()})
            if (k, c, d) in rows:
                print(k, c, d, *(f"{x}={r[x]:.3f}" for x in ("accuracy", "win_rate", "caught_rate") if r[x] is not None))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--ai", action="store_true")
    ap.add_argument("--runs", type=int, default=1000)
    a = ap.parse_args()
    check() if a.check else main(a.runs, a.ai)
