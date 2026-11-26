"""이론 실험실 시나리오 4개 7일 재측정 (명세_시나리오준비.md 2단계).
  python experiments/scenario_rates.py --check    시나리오 4개 설정에서 predict == 엔진 의심도 점검 (시드 20개)
  python experiments/scenario_rates.py            seed 0~999 (1000판) 측정 → experiments/scenario_rates.csv
엔진은 고치지 않고 mafia_strategy.py의 predict·smart·play 방식을 재사용한다."""
import argparse
import csv
import itertools
import os
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mafia_compare import city_turn, wilson  # noqa: E402
import mafia_strategy as ms  # noqa: E402
import god.game as game  # noqa: E402
from god.game import OPPOSITE, TURNS, Game, GameConfig  # noqa: E402
from god.simulation import DECISION_OF  # noqa: E402

OUT = os.path.dirname(os.path.abspath(__file__))

SCENARIOS = [
    ("watchful-eye", dict(share_mode="all", sensor_error=0.45)),
    ("ring-village", dict(connection="ring", sensor_error=0.45)),
    ("regain-trust", dict(sensor_error=0.45)),
    ("stubborn-ally", dict(mafia_count=2, sensor_error=0.48)),
]
SCENARIO_CFG = dict(SCENARIOS)
WASH_THRESHOLDS = (30, 40, 50)


def targets_of(g):
    """사람 플레이어가 쪽지를 보낼 수 있는 시민 목록 (all이면 전원, ring이면 양옆 이웃만)."""
    rec = g.receivers()
    return [c for c in g.citizens if str(c) in rec]


def bot_for(g):
    """mafia_strategy.bot을 ring(receivers 제한)에서도 쓸 수 있게 맞춘 래퍼."""
    if g.config.connection == "all":
        return ms.bot(g)
    lie = OPPOSITE[DECISION_OF[g.truth]]
    return {str(c): lie for c in targets_of(g)}


def smart_for(g):
    """mafia_strategy.smart 재사용. ring은 보낼 수 있는 이웃 시민(receivers) 조합만 탐색한다."""
    if g.config.connection == "all":
        return ms.smart(g)
    lie, cs = OPPOSITE[DECISION_OF[g.truth]], targets_of(g)
    limit = game.THRESHOLD if g.turn + 1 == TURNS else game.THRESHOLD - 20
    best = None
    for combo in itertools.product((True, False), repeat=len(cs)):
        claim = {str(r): lie if x else OPPOSITE[lie] for r, x in zip(cs, combo)}
        after = ms.predict(g, claim).values()
        safe = max(after) < limit
        key = (safe, sum(combo) if safe else -max(after), -sum(after))
        if best is None or key > best[0]:
            best = (key, claim)
    return best[1]


def citizen_rows(history, player_city, city):
    """한 주민의 턴별 (나에 대한 의심도, 내가 보낸 쪽지, 그 주민 힌트 일치 여부)."""
    me = str(player_city)
    rows = []
    for res in history:
        row = next(x for x in res["cities"] if x["city"] == city)
        msg = row["received"].get(me)
        if msg is None:
            continue
        sent = msg["claim"]
        rows.append((row["suspicion"][me], sent, sent == DECISION_OF[row["hint"]]))
    return rows


def washed_citizen(history, player_city, threshold=40):
    """한 주민의 의심도가 threshold 이상이 된 뒤, 그 주민 힌트와 같은 쪽지를 보내(직전과 다른 쪽지 전환 포함)
    의심도를 20 이하로 내린 적이 있는지 판정한다."""
    if not history:
        return False
    citizens = [x["city"] for x in history[0]["cities"] if x["role"] == "citizen"]
    for c in citizens:
        rows = citizen_rows(history, player_city, c)
        for j in range(1, len(rows)):
            sus_j, _, match_j = rows[j]
            if not match_j or sus_j > 20:
                continue
            p = j - 1
            max_sus = rows[p][0]
            while p > 0 and rows[p][0] > 20 and rows[p][2]:
                p -= 1
                max_sus = max(max_sus, rows[p][0])
            if max_sus >= threshold and any(rows[k][1] != rows[k - 1][1] for k in range(p + 1, j + 1)):
                return True
    return False


def wash_candidates(history, player_city, threshold=40):
    """현재 threshold 이상을 찍은 뒤 아직 20 이하로 내려가지 않은 주민별 (직전 쪽지, 이미 전환했는지)."""
    out = {}
    if not history:
        return out
    citizens = [x["city"] for x in history[0]["cities"] if x["role"] == "citizen"]
    for c in citizens:
        rows = citizen_rows(history, player_city, c)
        if not rows or rows[-1][0] <= 20:
            continue
        p = len(rows) - 1
        max_sus = rows[p][0]
        while p > 0 and rows[p][0] > 20 and rows[p][2]:
            p -= 1
            max_sus = max(max_sus, rows[p][0])
        if max_sus >= threshold:
            changed = any(rows[k][1] != rows[k - 1][1] for k in range(p + 1, len(rows)))
            out[c] = (rows[-1][1], changed)
    return out


def smart_wash(g, history, threshold=40):
    """regain-trust용 변형 전략: 한 주민의 의심도를 threshold 이상으로 올린 뒤, 그 주민 힌트와 같은
    쪽지(진실/전환)로 20 이하까지 내리고, 세탁 완료 뒤에는 smart로 전환해 승리를 노린다."""
    if washed_citizen(history, g.player, threshold):
        return smart_for(g)

    lie, cs = OPPOSITE[DECISION_OF[g.truth]], targets_of(g)
    me = str(g.player)
    cands = wash_candidates(history, g.player, threshold)
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
                and (changed or claim[str(r)] != prev_sent)
                for r, (prev_sent, changed) in cands.items()
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
    if scenario_id in ("watchful-eye", "ring-village"):
        return True
    if scenario_id == "regain-trust":
        return washed_citizen(history, g.player, threshold)
    if scenario_id == "stubborn-ally":
        colleague = next(c for c, r in g.roles.items() if r == "colleague")
        return not any(t["vote"] and t["vote"]["accused"] == colleague for t in history)
    raise ValueError(f"unknown scenario: {scenario_id}")


def play_scenario(scenario_id, strategy, seed, threshold=40):
    cfg = GameConfig(citizen_type="wary", player="human", seed=seed, **SCENARIO_CFG[scenario_id])
    g = Game(1, cfg)
    history = []
    while not g.game_over:
        if strategy == "bot":
            chosen = bot_for(g)
        elif strategy == "smart":
            chosen = smart_for(g)
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
    for scenario_id, extra in SCENARIOS:
        for seed in range(20):
            cfg = GameConfig(citizen_type="wary", player="human", seed=seed, **extra)
            g = Game(1, cfg)
            history = []
            while not g.game_over:
                claim = smart_wash(g, history, 40) if scenario_id == "regain-trust" else smart_for(g)
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
    for scenario_id, _ in SCENARIOS:
        if scenario_id == "regain-trust":
            for thr in WASH_THRESHOLDS:
                for strat in ("bot", "smart", "smart_wash"):
                    jobs.append((scenario_id, strat, thr, runs))
        else:
            for strat in ("bot", "smart"):
                jobs.append((scenario_id, strat, 40, runs))

    with Pool() as pool:
        results = pool.map(run_job, jobs)

    by_key = {(r["scenario"], r["strategy"], r["threshold"]): r for r in results}
    fixed_seeds = {}
    for scenario_id, _ in SCENARIOS:
        if scenario_id == "regain-trust":
            for thr in WASH_THRESHOLDS:
                bot_g = by_key[(scenario_id, "bot", thr)]["goals"]
                sw_g = by_key[(scenario_id, "smart_wash", thr)]["goals"]
                fixed_seeds[(scenario_id, "smart_wash", thr)] = next(
                    (s for s in range(runs) if sw_g[s] and not bot_g[s]), ""
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
