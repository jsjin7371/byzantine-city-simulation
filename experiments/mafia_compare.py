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

DIFFS = {"easy": dict(mafia_count=1, sensor_error=0.48), "normal": dict(mafia_count=1, sensor_error=0.4),
         "hard": dict(mafia_count=1, sensor_error=0.3)}  # spec 7.2 난이도 프리셋
PILOT_WIN = {"easy": 0.6013, "normal": 0.3464, "hard": 0.095}  # mafia_pilot.csv difficulty 행 (wary, 10000판)
METRICS = ["accuracy", "win_rate", "suspicion_hit", "caught_rate", "caught_turn"]
COLS = ["citizen_type", "connection", "difficulty", "runs"] + [f"{m}{x}" for m in METRICS for x in ("", "_lo", "_hi")]


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
    if kind != "majority":  # 시민마다 최고 의심 도시들 중 마피아 몫. 동점이면 나눠 센다.
        mafia = {str(c) for c, role in g.roles.items() if role != "citizen"}
        hits = []
        for r in g.citizens:
            top = max(g.suspicion[r].values())
            tied = {c for c, v in g.suspicion[r].items() if v == top}
            hits.append(len(tied & mafia) / len(tied))
        hit = fmean(hits)
    caught = res["end_reason"] == "caught"
    # 정확도는 게임 종료 시점 값 (TURNS 또는 발각 턴)
    return dict(accuracy=res["accuracy"], win_rate=res["outcome"] in ("win", "perfect_win"), suspicion_hit=hit,
                caught_rate=caught, caught_turn=res["turn"] if caught else None)


def wilson(xs):
    """0/1 값의 평균과 95% Wilson 구간 (극단값·적은 판 수에서도 0~1 안)."""
    n, p, z = len(xs), fmean(xs), 1.96
    mid = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return p, mid - half, mid + half


def normal(xs):
    """연속값의 평균과 95% 정규근사 구간."""
    m = fmean(xs)
    h = 1.96 * stdev(xs) / math.sqrt(len(xs)) if len(xs) > 1 else 0
    return m, m - h, m + h


def run(job):
    kind, conn, diff, runs = job
    base = zlib.crc32(f"{kind}/{conn}/{diff}".encode())  # 조건마다 고정 시드, 판마다 +i
    games = [play(kind, conn, diff, base + i) for i in range(runs)]
    row = dict(citizen_type=kind, connection=conn, difficulty=diff, runs=runs)
    for m in METRICS:
        xs = [g[m] for g in games if g[m] is not None]  # 의심 적중(majority)·발각 턴(발각 없음)은 값이 없을 수 있다
        stat = wilson if m in ("win_rate", "caught_rate") else normal
        row.update(zip((m, m + "_lo", m + "_hi"), stat([float(x) for x in xs]) if xs else ()))
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
    kinds = ["majority", "wary"] + ["ai"] * ai
    jobs = [(k, c, d, runs) for k, c, d in itertools.product(kinds, ("all", "ring"), DIFFS)]
    with Pool() as p:
        rows = p.map(run, [j for j in jobs if j[0] != "ai"]) + [run(j) for j in jobs if j[0] == "ai"]  # ai는 호출 병렬이 엔진 안에 있어 순차
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mafia_compare.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, COLS)
        w.writeheader()
        for r in rows:
            w.writerow({x: round(v, 4) if isinstance(v, float) else v for x, v in r.items()})
            print(r["citizen_type"], r["connection"], r["difficulty"], *(f"{m}={r[m]:.3f}" for m in METRICS[:2] + METRICS[3:4] if m in r))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--ai", action="store_true")
    ap.add_argument("--runs", type=int, default=1000)
    a = ap.parse_args()
    check() if a.check else main(a.runs, a.ai)
