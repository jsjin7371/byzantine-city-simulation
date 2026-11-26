"""이론 실험실 시나리오 4개 7일 재측정 (명세_시나리오준비.md 2단계).
  python experiments/scenario_rates.py --check    시나리오 4개 설정에서 predict == 엔진 의심도 점검 (시드 20개)
  python experiments/scenario_rates.py            seed 0~999 (1000판) 측정 → experiments/scenario_rates.csv
엔진은 고치지 않고 mafia_strategy.py의 predict·smart·bot을 재사용한다."""
import argparse
import csv
import itertools
import os
import random
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mafia_compare import city_turn, wilson  # noqa: E402
import mafia_strategy as ms  # noqa: E402
import god.game as game  # noqa: E402
from god.game import OPPOSITE, Game, GameConfig  # noqa: E402
from god.simulation import DECISION_OF  # noqa: E402

OUT = os.path.dirname(os.path.abspath(__file__))

SCENARIOS = {
    "watchful-eye": dict(share_mode="all", sensor_error=0.45),
    "ring-village": dict(connection="ring", sensor_error=0.45),
    "regain-trust": dict(sensor_error=0.45),
    "stubborn-ally": dict(mafia_count=2, sensor_error=0.48),
}
WASH_THRESHOLDS = (30, 40, 50)


def citizen_rows(history, player_city, truth, city):
    """한 주민의 턴별 (의심도, 보낸 쪽지, 힌트 일치, 거짓 여부, 정답 여부)."""
    me, ans = str(player_city), DECISION_OF[truth]
    rows = []
    for res in history:
        row = next(x for x in res["cities"] if x["city"] == city)
        msg = row["received"].get(me)
        sent = msg["claim"] if msg else None
        rows.append((
            row["suspicion"][me],
            sent,
            sent is not None and row["hint"] is not None and sent == DECISION_OF[row["hint"]],
            sent is not None and sent != ans,
            row["correct"],
        ))
    return rows


def wash_peak(rows, end, threshold):
    """rows[:end]를 역순으로 훑어 연속 힌트 일치 구간 직전의 threshold 이상 최고 의심도 (detectTactics와 동일)."""
    peak = 0
    for p in range(end - 1, -1, -1):
        sus, _, match, _, _ = rows[p]
        if sus >= threshold:
            peak = max(peak, sus)
        elif peak == 0 and match:
            continue
        else:
            break
    return peak


def has_onoff(history, player_city, truth, threshold=40, need_fool=True):
    """결과 화면 detectTactics의 온오프 판정(need_fool=False면 세탁 완료까지만 확인).
    의심도 >= threshold 뒤 힌트와 같은 쪽지(연속 일치 구간 내 쪽지 전환 포함)로 <= 20까지 내린 뒤,
    다시 threshold 이상이 되기 전에 거짓 쪽지로 그 주민을 속이면(correct=False) 달성."""
    if not history:
        return False
    for c in (x["city"] for x in history[0]["cities"] if x["role"] == "citizen"):
        rows = citizen_rows(history, player_city, truth, c)
        for j in range(1, len(rows)):
            sus_j, _, match_j, _, _ = rows[j]
            if not match_j or sus_j > 20:
                continue
            if wash_peak(rows, j, threshold) < threshold:
                continue
            q = j
            while q > 0 and rows[q - 1][2]:
                q -= 1
            if not any(rows[m][1] != rows[m - 1][1] for m in range(max(1, q), j + 1)):
                continue
            if not need_fool:
                return True
            after = rows[j + 1:]
            k = next((i for i, r in enumerate(after) if (r[3] and r[4] is False) or r[0] >= threshold), -1)
            if k >= 0 and after[k][3] and after[k][4] is False:
                return True
    return False


def wash_candidates(history, player_city, truth, threshold=40):
    """현재 threshold 이상을 찍은 뒤 아직 세탁을 마칠 수 있는 주민별 직전 쪽지."""
    out = {}
    if not history:
        return out
    for c in (x["city"] for x in history[0]["cities"] if x["role"] == "citizen"):
        rows = citizen_rows(history, player_city, truth, c)
        if rows and wash_peak(rows, len(rows), threshold) >= threshold:
            out[c] = rows[-1][1]
    return out


def smart_wash(g, history, threshold=40):
    """regain-trust용 변형 전략: 한 주민의 의심도를 threshold 이상으로 올린 뒤, 그 주민 힌트와 같은
    쪽지(직전과 전환)로 20 이하까지 내리고, 세탁 완료 뒤에는 smart로 전환해 재기만과 승리를 노린다."""
    if has_onoff(history, g.player, g.truth, threshold, need_fool=False):
        return ms.smart(g)

    lie, cs = OPPOSITE[DECISION_OF[g.truth]], ms.targets(g)
    me = str(g.player)
    cands = wash_candidates(history, g.player, g.truth, threshold)
    best = None

    for combo in itertools.product((True, False), repeat=len(cs)):
        claim = {str(r): lie if x else OPPOSITE[lie] for r, x in zip(cs, combo)}
        after = ms.predict(g, claim)
        vals = list(after.values())
        lies = sum(combo)

        if cands:
            completes = any(
                after[r] <= 20
                and claim[str(r)] == DECISION_OF[g.hints[str(r)]]
                and claim[str(r)] != prev_sent
                for r, prev_sent in cands.items()
            )
            steps = any(
                after[r] < g.suspicion[r][me]
                and claim[str(r)] == DECISION_OF[g.hints[str(r)]]
                for r in cands
            )
            safe = max(vals) < game.THRESHOLD
            key = (safe, completes, steps, lies if safe else -max(vals), -sum(vals))
        elif threshold <= game.THRESHOLD - 20:
            safe = max(vals) < game.THRESHOLD
            hits = any(v >= threshold for v in vals)
            prog = min(max(vals), threshold)
            key = (safe, hits, prog, lies if safe else -max(vals), -sum(vals))
        else:
            # 문턱 50은 의심도 20단위 규칙상 60 도달(재판 개시)이 필요하므로 1명만 60으로 올리고 나머지를 낮춘다
            at60 = sum(v >= game.THRESHOLD for v in vals)
            hits = any(v >= threshold for v in vals)
            good_spike = hits and at60 == 1
            no_trial = at60 == 0
            other_sum = sum(v for v in vals if v < game.THRESHOLD)
            key = (good_spike, no_trial, min(max(vals), threshold), -other_sum, lies, -sum(vals))

        if best is None or key > best[0]:
            best = (key, claim)
    return best[1]


def goal_met(scenario_id, g, history, res, threshold=40):
    won = res["outcome"] in ("win", "perfect_win")
    if not won:
        return False
    if scenario_id in ("watchful-eye", "ring-village", "stubborn-ally"):
        return True
    if scenario_id == "regain-trust":
        return has_onoff(history, g.player, g.truth, threshold, need_fool=True)
    raise ValueError(f"unknown scenario: {scenario_id}")


def play_scenario(scenario_id, strategy, seed, threshold=40):
    cfg = GameConfig(citizen_type="wary", player="human", seed=seed, **SCENARIOS[scenario_id])
    g = Game(1, cfg)
    history = []
    while not g.game_over:
        if strategy in ("bot", "always_lie"):
            chosen = ms.bot(g)
        elif strategy == "smart":
            chosen = ms.smart(g)
        elif strategy == "smart_wash":
            chosen = smart_wash(g, history, threshold)
        else:
            raise ValueError(f"unknown strategy: {strategy}")
        claims = {r: {"claim": c, "note": ""} for r, c in chosen.items()}
        res = g.play({"turn": g.turn + 1, "claims": claims}, city_turn)
        history.append(res)
    won = res["outcome"] in ("win", "perfect_win")
    caught = res["end_reason"] == "caught"
    goal = goal_met(scenario_id, g, history, res, threshold)
    return goal, won, caught


def play_all(scenario_id, seed, fn):
    """fn(g) → 쪽지로 한 판을 끝까지 진행해 (g, 턴 결과 목록)을 돌려준다."""
    g = Game(1, GameConfig(citizen_type="wary", player="human", seed=seed, **SCENARIOS[scenario_id]))
    history = []
    while not g.game_over:
        claims = {r: {"claim": c, "note": ""} for r, c in fn(g).items()}
        history.append(g.play({"turn": g.turn + 1, "claims": claims}, city_turn))
    return g, history


def ring_far_varies(seed, samples=128):
    """고리 마을 고정 시드 조건: 먼 집 판단이 내 수에 따라 갈리는지 확인.
    1) 정직(진짜 날씨)으로 7일 완주 시 먼 두 집 모두 정답,
    2) smart 승리 시 하늘을 바로 본 먼 집이 이웃 쪽지를 따라 틀림,
    3) 무작위 수 표본에서 재판이 발생할 수 있고, 7일 완주 중 승률 ≥ 10%이며 먼 두 집 각각의 오답률이 15%~85% 사이."""
    def run_last(strat):
        fn = (lambda g: {str(r): DECISION_OF[g.truth] for r in ms.targets(g)}) if strat == "honest" else ms.smart
        g, history = play_all("ring-village", seed, fn)
        return g, history[-1]

    g_hon, r_hon = run_last("honest")
    if r_hon["end_reason"] != "turns_done":
        return False
    targets = set(ms.targets(g_hon))
    far = sorted(c for c in g_hon.citizens if c not in targets)
    if not all(c["correct"] for c in r_hon["cities"] if c["city"] in far):
        return False

    g_sm, r_sm = run_last("smart")
    if not any(
        c["city"] in far and c["correct"] is False and c["hint"] == g_sm.truth
        for c in r_sm["cities"]
    ):
        return False

    rng = random.Random(seed)
    ans = DECISION_OF[g_hon.truth]
    opts = (ans, OPPOSITE[ans])
    t_list = sorted(targets)
    done7 = wins = caught = 0
    far_wrong = {c: 0 for c in far}
    for _ in range(samples):
        g = Game(1, GameConfig(citizen_type="wary", player="human", seed=seed, **SCENARIOS["ring-village"]))
        while not g.game_over:
            claims = {str(r): {"claim": rng.choice(opts), "note": ""} for r in t_list}
            res = g.play({"turn": g.turn + 1, "claims": claims}, city_turn)
        if res["end_reason"] != "turns_done":
            caught += 1
            continue
        done7 += 1
        if res["outcome"] in ("win", "perfect_win"):
            wins += 1
        for c in res["cities"]:
            if c["city"] in far_wrong and c["correct"] is False:
                far_wrong[c["city"]] += 1
    if caught == 0 or done7 == 0 or wins / done7 < 0.10:
        return False
    return all(0.15 <= far_wrong[c] / done7 <= 0.85 for c in far)


def stubborn_ally_shows(seed):
    """고집쟁이 동료 고정 시드 조건: 4개 결과 분기를 수에 따라 보여 줄 수 있는 판인지 확인.
    1) smart 승리 시 동료 의심도가 6일째 이전에 60 이상에 닿고 내 의심도는 60 미만으로 유지
       (섞기의 일반 효과가 아니라 이 조건으로 고른 시드의 모습),
    2) bot(늘 거짓) 패배 시 동료가 재판에서 지목됨 (늘 거짓이면 나와 동료 의심도가 같아 동점 추첨 결과),
    3) 정직(진짜 날씨) 패배 시 내가 재판에서 지목됨,
    4) 안전 정직(의심도 60 미만 유지 + 최대한 정직)으로 7일 버텼지만 과반 미달 패배 도달 가능."""
    def run_fn(fn):
        g, hist = play_all("stubborn-ally", seed, fn)
        return g, next(c for c, r in g.roles.items() if r == "colleague"), hist

    gs, col, hs = run_fn(ms.smart)
    if hs[-1]["outcome"] not in ("win", "perfect_win"):
        return False
    col_peaks = [max(c["suspicion"][str(col)] for c in r["cities"] if c["role"] == "citizen") for r in hs]
    p_peaks = [max(c["suspicion"][str(gs.player)] for c in r["cities"] if c["role"] == "citizen") for r in hs]
    first_col60 = next((i + 1 for i, v in enumerate(col_peaks) if v >= game.THRESHOLD), None)
    if first_col60 is None or first_col60 > 6 or max(p_peaks) >= game.THRESHOLD:
        return False

    _, _, hb = run_fn(ms.bot)
    if hb[-1]["end_reason"] != "caught" or hb[-1]["vote"]["accused"] != col:
        return False

    ans = DECISION_OF[gs.truth]
    lie = OPPOSITE[ans]
    _, _, hhon = run_fn(lambda g: {str(r): ans for r in ms.targets(g)})
    if hhon[-1]["end_reason"] != "caught" or hhon[-1]["vote"]["accused"] != gs.player:
        return False

    def safe_lose(g):
        cs = ms.targets(g)
        best = None
        for combo in itertools.product((True, False), repeat=len(cs)):
            claim = {str(r): ans if x else lie for r, x in zip(cs, combo)}
            after = ms.predict(g, claim)
            vals = list(after.values())
            safe = max(vals) < game.THRESHOLD
            key = (safe, sum(combo) if safe else -max(vals), -sum(vals))
            if best is None or key > best[0]:
                best = (key, claim)
        return best[1]

    _, _, hsl = run_fn(safe_lose)
    return hsl[-1]["end_reason"] == "turns_done" and hsl[-1]["outcome"] == "loss"


def run_job(job):
    scenario_id, strategy, threshold, runs = job
    outcomes = [play_scenario(scenario_id, strategy, seed, threshold) for seed in range(runs)]
    g_stat = wilson([float(x[0]) for x in outcomes])
    w_stat = wilson([float(x[1]) for x in outcomes])
    c_stat = wilson([float(x[2]) for x in outcomes])
    return dict(
        scenario=scenario_id,
        strategy=strategy,
        threshold=threshold if scenario_id == "regain-trust" else "",
        runs=runs,
        goal_rate=g_stat[0],
        goal_lo=g_stat[1],
        goal_hi=g_stat[2],
        win_rate=w_stat[0],
        caught_rate=c_stat[0],
        goals=[x[0] for x in outcomes],
    )


def check():
    """각 시나리오 설정(시드 20개)에서 predict가 실제 엔진 의심도와 매 턴 일치하는지 점검."""
    for scenario_id, extra in SCENARIOS.items():
        for seed in range(20):
            cfg = GameConfig(citizen_type="wary", player="human", seed=seed, **extra)
            g = Game(1, cfg)
            history = []
            while not g.game_over:
                claim = smart_wash(g, history, 40) if scenario_id == "regain-trust" else ms.smart(g)
                want = ms.predict(g, claim)
                res = g.play({"turn": g.turn + 1, "claims": {r: {"claim": c} for r, c in claim.items()}}, city_turn)
                history.append(res)
                got = {r: g.suspicion[r][str(g.player)] for r in g.citizens}
                assert want == got, (scenario_id, seed, g.turn, want, got)
    # 봇은 항상 같은 거짓말만 보내므로 regain-trust 세탁 판정이 절대 통과하면 안 된다
    for seed in range(50):
        goal, _, _ = play_scenario("regain-trust", "bot", seed, 40)
        assert not goal, f"bot unexpectedly satisfied regain-trust on seed {seed}"
    print("check ok")


def main(runs):
    jobs = []
    for scenario_id in SCENARIOS:
        if scenario_id == "watchful-eye":
            jobs.extend([(scenario_id, strat, 40, runs) for strat in ("always_lie", "smart")])
        elif scenario_id == "regain-trust":
            jobs.extend([(scenario_id, "bot", 40, runs), (scenario_id, "smart", 40, runs)])
            jobs.extend([(scenario_id, "smart_wash", thr, runs) for thr in WASH_THRESHOLDS])
        else:
            jobs.extend([(scenario_id, strat, 40, runs) for strat in ("bot", "smart")])

    with Pool() as pool:
        results = pool.map(run_job, jobs)

    by_key = {(r["scenario"], r["strategy"], r["threshold"]): r for r in results}
    fixed_seeds = {}
    for scenario_id in SCENARIOS:
        if scenario_id == "watchful-eye":
            al_g = by_key[(scenario_id, "always_lie", "")]["goals"]
            sm_g = by_key[(scenario_id, "smart", "")]["goals"]
            fixed_seeds[(scenario_id, "always_lie", "")] = next(
                (s for s in range(runs) if al_g[s] and not sm_g[s]), ""
            )
        elif scenario_id == "regain-trust":
            bot_g = by_key[(scenario_id, "bot", 40)]["goals"]
            for thr in WASH_THRESHOLDS:
                sw_g = by_key[(scenario_id, "smart_wash", thr)]["goals"]
                fixed_seeds[(scenario_id, "smart_wash", thr)] = next(
                    (s for s in range(runs) if sw_g[s] and not bot_g[s]), ""
                )
        elif scenario_id == "ring-village":
            bot_g = by_key[(scenario_id, "bot", "")]["goals"]
            sm_g = by_key[(scenario_id, "smart", "")]["goals"]
            fixed_seeds[(scenario_id, "smart", "")] = next(
                (s for s in range(runs) if sm_g[s] and not bot_g[s] and ring_far_varies(s)), ""
            )
        elif scenario_id == "stubborn-ally":
            bot_g = by_key[(scenario_id, "bot", "")]["goals"]
            sm_g = by_key[(scenario_id, "smart", "")]["goals"]
            fixed_seeds[(scenario_id, "smart", "")] = next(
                (s for s in range(runs) if sm_g[s] and not bot_g[s] and stubborn_ally_shows(s)), ""
            )
        else:
            bot_g = by_key[(scenario_id, "bot", "")]["goals"]
            sm_g = by_key[(scenario_id, "smart", "")]["goals"]
            fixed_seeds[(scenario_id, "smart", "")] = next(
                (s for s in range(runs) if sm_g[s] and not bot_g[s]), ""
            )

    cols = ["scenario", "strategy", "threshold", "runs", "goal_rate", "goal_lo", "goal_hi",
            "win_rate", "caught_rate", "fixed_seed"]
    out_csv = os.path.join(OUT, "scenario_rates.csv")
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, cols)
        w.writeheader()
        for r in results:
            key = (r["scenario"], r["strategy"], r["threshold"])
            row = {c: r[c] for c in cols[:-1]}
            row["fixed_seed"] = fixed_seeds.get(key, "")
            w.writerow({k: round(v, 4) if isinstance(v, float) else v for k, v in row.items()})
            thr_s = f" thr={row['threshold']}" if row["threshold"] != "" else ""
            seed_s = f" fixed_seed={row['fixed_seed']}" if row["fixed_seed"] != "" else ""
            print(
                f"{row['scenario']:14s} {row['strategy']:10s}{thr_s:7s} "
                f"goal={row['goal_rate']:.4f} ({row['goal_lo']:.4f}~{row['goal_hi']:.4f}) "
                f"win={row['win_rate']:.4f} caught={row['caught_rate']:.4f}{seed_s}"
            )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--runs", type=int, default=1000)
    a = ap.parse_args()
    check() if a.check else main(a.runs)
