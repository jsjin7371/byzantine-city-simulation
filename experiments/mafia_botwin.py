"""화면·API에 표시하는 기본 마피아 봇 승률 계산. 실제 엔진, player=bot, connection=all, 시드 0~9999.
  python experiments/mafia_botwin.py           시민 2종 × 난이도 3종 승률 출력
  python experiments/mafia_botwin.py --check   backend BOT_WIN_RATE와 대조"""
import ast, os, sys
from multiprocessing import Pool
from statistics import fmean

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mafia_compare import DIFFS, play  # noqa: E402

RUNS = 10000
BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "app", "routers", "games.py")


def win_rate(kind, diff):
    return fmean(play(kind, "all", diff, seed)["win_rate"] for seed in range(RUNS))


def backend_table():
    """fastapi 없이 돌도록 소스에서 BOT_WIN_RATE 리터럴만 읽는다."""
    with open(BACKEND, encoding="utf-8") as f:
        tree = ast.parse(f.read())
    return next(ast.literal_eval(n.value) for n in tree.body
                if isinstance(n, ast.Assign) and n.targets[0].id == "BOT_WIN_RATE")


if __name__ == "__main__":
    jobs = [(k, d) for k in ("wary", "majority") for d in DIFFS]
    with Pool() as p:
        rates = p.starmap(win_rate, jobs)
    table = backend_table()
    for (kind, diff), rate in zip(jobs, rates):
        print(f"{kind} {diff}: {rate:.4f}")
        if "--check" in sys.argv:  # 표는 wary 소수 2자리, majority 3자리
            want = table[(kind, DIFFS[diff]["mafia_count"], DIFFS[diff]["sensor_error"])]
            assert round(rate, 2 if kind == "wary" else 3) == want, (kind, diff, rate, want)
    if "--check" in sys.argv:
        print("check ok")
