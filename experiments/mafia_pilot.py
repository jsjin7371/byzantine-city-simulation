"""1단계 파일럿: docs/spec.md 7절 규칙을 엔진 밖에서 돌려 자동 마피아 승률을 잰다. 표준 라이브러리만.
값은 정답 기준 bool로 다룬다 (True = 정답 쪽). 정답의 실제 값은 대칭이라 무시한다.
  python experiments/mafia_pilot.py --check   기존 측정값(삼인성호 exp3)과 대조
  python experiments/mafia_pilot.py           전체 비교를 돌려 mafia_pilot.csv 저장"""
import csv, itertools, os, random, sys, zlib
from statistics import fmean
from multiprocessing import Pool

N, TURNS = 5, 15
RUNS = 4000


def play(cfg, rng):
    """한 판. 반환: (승리, 완승, 발각, 마지막 턴 시민 정확도, 오지목 있었음)"""
    citizen, memory, share, k, mafia_n, err, up, down, contra, thr, player = (
        cfg["citizen"], cfg["memory"], cfg["share"], cfg["share_pairs"], cfg["mafia"], cfg["sensor"],
        cfg["up"], cfg["down"], cfg["contra"], cfg["thr"], cfg["player"])
    mafia = rng.sample(range(N), mafia_n)
    pl = mafia[0]
    cits = [c for c in range(N) if c not in mafia]
    combos = list(itertools.combinations(cits, 2))
    wary = citizen == "wary"
    susp = {r: {s: 0 for s in range(N) if s != r} for r in cits}
    hist = {r: [] for r in cits}
    prev = {r: None for r in cits}
    wrong_accuse = False
    for t in range(TURNS):
        for r in cits:
            hist[r].append(rng.random() >= err)
        # 주장 모으기 (7.5-2). 동료와 봇은 항상 정답의 반대.
        rec = {}
        for r in cits:
            rec[r] = {s: prev[s] for s in cits if s != r}
            for s in mafia if t or not cfg["silent_t1"] else ():  # silent_t1: exp3처럼 1턴엔 마피아도 말 안 함
                # tailor: 사람 플레이어 대용. 나를 많이 의심하는 시민에게만 참말을 해 의심을 식힌다.
                rec[r][s] = player == "tailor" and s == pl and susp[r][pl] >= thr / 2
        # 정보 공유 (7.5-3)
        pairs = combos if share == "all" else rng.sample(combos, min(k, len(combos))) if share == "pairs" else []
        caught_by = {r: set() for r in cits}
        for a, b in pairs:
            for s in range(N):
                if s not in (a, b) and rec[a][s] is not None and rec[b][s] is not None and rec[a][s] != rec[b][s]:
                    caught_by[a].add(s)
                    caught_by[b].add(s)
        # 시민 결정 (7.5-4)
        dec = {}
        for r in cits:
            h = hist[r] if memory == "full" else hist[r][-1 - cfg["k_mem"]:] if memory == "recent" else hist[r][-1:]
            own = sum(1 if x else -1 for x in h)
            mine = own > 0 if own else hist[r][-1]
            score = own
            for s, c in rec[r].items():
                if c is None:
                    continue
                w = 1.0
                if wary:
                    v = susp[r][s] + (-down if c == mine else up) + (contra if s in caught_by[r] else 0)
                    susp[r][s] = v = max(0, min(100, v))
                    w = 1 - v / 100  # 의심할수록 덜 믿는다
                score += w if c else -w
            dec[r] = score > 0 if score else hist[r][-1]
        prev = dec
        # 고발 투표 (7.6)
        if wary and any(v >= thr for r in cits for v in susp[r].values()):
            votes = {}
            for r in cits:
                top = max(susp[r].values())
                x = rng.choice([s for s, v in susp[r].items() if v == top])  # 동점이면 무작위
                votes[x] = votes.get(x, 0) + 1
            accused = next((s for s, n in votes.items() if n > len(cits) / 2), None)
            if accused in mafia:
                return False, False, True, sum(dec.values()) / len(cits), wrong_accuse
            wrong_accuse |= accused is not None
    wrong = sum(not d for d in dec.values())
    return wrong > len(cits) / 2, wrong == len(cits), False, 1 - wrong / len(cits), wrong_accuse


def run(cfg):
    rng = random.Random(cfg["seed"])
    cols = zip(*(play(cfg, rng) for _ in range(cfg["runs"])))
    names = ("bot_win_rate", "perfect_rate", "caught_rate", "accuracy", "wrong_accuse_rate")
    return {**cfg, **{k: fmean(v) for k, v in zip(names, cols)}}


BASE = dict(citizen="wary", memory="turn", k_mem=0, share="pairs", share_pairs=1, mafia=1, sensor=0.1,
            up=20, down=20, contra=20, thr=60, player="bot", runs=RUNS, silent_t1=False)


def cfg(**kw):
    c = {**BASE, **kw}
    key = sorted((k, v) for k, v in c.items() if k != "silent_t1")  # silent_t1은 빼서 기존 시드 유지
    c.setdefault("seed", zlib.crc32(repr(key).encode()))  # 조건마다 고정 시드
    return c


def check():
    # 공유·의심도·고발 없는 다수결 시민 = 기존 exp3 (r=2, 센서 10%, 15턴): 정직 도시 정확도 0.9377 / 0.0105
    for m, want in ((1, 0.9377), (2, 0.0105)):
        r = run(cfg(citizen="majority", share="none", mafia=m, runs=4000, seed=m, silent_t1=True))
        print(f"majority mafia={m}: accuracy {r['accuracy']:.4f} (exp3 {want})")
        assert abs(r["accuracy"] - want) < 0.02, r
    # 기억 full 대조군: 힌트 이력만으로 거의 다 맞힌다 (기획서 "제약")
    r = run(cfg(citizen="majority", share="none", memory="full", mafia=2, runs=2000, seed=3))
    print(f"majority full mafia=2: bot_win_rate {r['bot_win_rate']:.4f}")
    assert r["bot_win_rate"] < 0.05
    print("check ok")


PARAMS = [(10, 10, 50), (10, 20, 60), (10, 20, 80), (10, 30, 60), (5, 10, 60), (15, 30, 70), (20, 20, 80)]  # (up, down, thr)
SENSORS = (0.1, 0.2, 0.3, 0.4)
MEMS = [("turn", 0), ("recent", 1), ("recent", 2), ("recent", 4), ("full", 0)]
SHARES = [("none", 1), ("pairs", 1), ("pairs", 2), ("pairs", 3), ("all", 1)]
DIFFS = {"easy": dict(mafia=2, sensor=0.4), "normal": dict(mafia=1, sensor=0.3), "hard": dict(mafia=1, sensor=0.2)}


def conditions():
    for m, e in itertools.product((1, 2), SENSORS):
        yield "params", cfg(citizen="majority", mafia=m, sensor=e, share="none")
        for u, d, th in PARAMS:
            yield "params", cfg(mafia=m, sensor=e, up=u, down=d, thr=th)
    for c, (mem, k), m, e in itertools.product(("majority", "wary"), MEMS, (1, 2), SENSORS[:3]):
        yield "memory", cfg(citizen=c, memory=mem, k_mem=k, mafia=m, sensor=e)
    for (sh, k), pl, ct, m, e in itertools.product(SHARES, ("bot", "tailor"), (20, 40), (1, 2), SENSORS[:3]):
        yield "share", cfg(share=sh, share_pairs=k, player=pl, contra=ct, mafia=m, sensor=e)
    for name, d in DIFFS.items():
        for c in ("majority", "wary"):
            yield "difficulty:" + name, cfg(citizen=c, runs=10000, **d)


def main():
    seen, conds = set(), []
    for st, c in conditions():  # 앞 단계와 같은 조건(BASE 등)은 다시 돌리지 않는다
        if c["seed"] not in seen:
            seen.add(c["seed"])
            conds.append((st, c))
    stages, cfgs = zip(*conds)
    with Pool() as p:
        rows = p.map(run, cfgs)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mafia_pilot.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["stage"] + list(rows[0]))
        w.writeheader()
        for st, r in zip(stages, rows):
            w.writerow({"stage": st, **{k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()}})
    for st, r in zip(stages, rows):
        if st.startswith("difficulty"):
            print(st, r["citizen"], "win %.3f acc %.3f caught %.3f" % (r["bot_win_rate"], r["accuracy"], r["caught_rate"]))


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()
