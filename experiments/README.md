# 실험

## 실행

```
python experiments/mafia_pilot.py --check      # 1단계 파일럿: 기존 측정값 대조
python experiments/mafia_pilot.py              # 파일럿 전체 비교 → mafia_pilot.csv
python experiments/mafia_compare.py --check    # 6단계: 파일럿과 같은 조건(wary, all)의 봇 승률 대조
python experiments/mafia_compare.py            # majority/wary, 연결 2종, 난이도 3종, 조건당 1000판 → mafia_compare.csv
python experiments/mafia_compare.py --ai --runs 30   # ai 포함 (LLM_API_KEY 필요, 없으면 건너뜀)
```

`mafia_compare.py`는 실제 엔진 코드(`god/game.py`, `city/logic.py`, `city/ai.py`)를 HTTP 없이 함수로 연결해 `player=bot` 게임을 돌린다. 조건마다 시드 고정.
ai 행은 키 없이 돌리면 비어 있다.

## 결과 (조건당 1000판, 평균 ± 95% 신뢰구간)

정확도는 마지막 턴 시민 정확도, 승률은 마피아(봇) 승리 이상, 발각 턴은 발각된 판의 평균 턴.

| 시민 | 연결 | 난이도 | 정확도 | 마피아 승률 | 의심 적중률 | 발각률 / 발각 턴 |
|---|---|---|---|---|---|---|
| majority | all | easy | 0.000 ± 0.000 | 1.000 ± 0.000 | - | - |
| majority | all | normal | 0.492 ± 0.031 | 0.508 ± 0.031 | - | - |
| majority | all | hard | 0.773 ± 0.026 | 0.227 ± 0.026 | - | - |
| majority | ring | easy | 0.013 ± 0.005 | 0.992 ± 0.006 | - | - |
| majority | ring | normal | 0.351 ± 0.018 | 0.501 ± 0.031 | - | - |
| majority | ring | hard | 0.671 ± 0.019 | 0.161 ± 0.023 | - | - |
| wary | all | easy | 0.024 ± 0.006 | 0.593 ± 0.031 | 0.539 ± 0.006 | 0.407 ± 0.031 / 10.1 ± 0.3 |
| wary | all | normal | 0.609 ± 0.027 | 0.234 ± 0.026 | 0.624 ± 0.018 | 0.677 ± 0.029 / 8.9 ± 0.2 |
| wary | all | hard | 0.852 ± 0.019 | 0.020 ± 0.009 | 0.843 ± 0.012 | 0.951 ± 0.013 / 7.5 ± 0.2 |
| wary | ring | easy | 0.253 ± 0.017 | 0.577 ± 0.031 | 0.559 ± 0.014 | 0.344 ± 0.030 / 10.0 ± 0.3 |
| wary | ring | normal | 0.582 ± 0.018 | 0.215 ± 0.026 | 0.442 ± 0.010 | 0.342 ± 0.029 / 10.5 ± 0.3 |
| wary | ring | hard | 0.798 ± 0.015 | 0.041 ± 0.012 | 0.555 ± 0.006 | 0.685 ± 0.029 / 9.7 ± 0.2 |
| ai | all/ring | 전부 | 키 필요 | | | |

의심 적중률은 시민마다 최고 의심 도시가 마피아인 비율(동점이면 나눠 센다)의 평균이고, majority는 의심도가 없어 해당 없음. 발각이 없으면 발각 턴은 비운다.

## "알고 싶은 것" 중 지금 답할 수 있는 것

1. AI 시민이 덜 속는가: 못 답함. AI 키 필요 (`--ai`).
2. AI 시민이 마피아를 맞게 의심하는가: 못 답함. AI 키 필요.
3. 사람 마피아가 봇보다 잘 속이는가: 못 답함. 사람 플레이 데이터 필요. 봇 기준값은 위 표.
4. 정보 공유로 거짓말이 얼마나 빨리 들키는가: 답함. 위 표의 wary 발각률·발각 턴 (공유 없는 majority는 발각 0).
