# 연동 규격 (초안)

> 11/6 회의에서 확정할 초안입니다. ⚠️ 표시는 팀 확인이 필요한 항목입니다.
> 변경은 PR로 하고, 바뀐 내용은 디스코드에 공유합니다.

## 0. 전체 흐름

```
프론트 ──HTTP──▶ API(FastAPI) ──HTTP──▶ God ──HTTP──▶ City 1..N
                    │
                    └──▶ MySQL (설정·상태·턴별 결과 저장)
```

1. 프론트가 `POST /experiments`로 설정을 보내면 API가 실험을 `pending`으로 저장하고 바로 `202`를 돌려준다.
2. API가 백그라운드에서 God의 `POST /run`을 **한 번** 호출한다. God은 시뮬레이션을 끝까지 돌린 뒤 전체 결과를 한 번에 돌려준다.
3. API가 결과를 저장하고 상태를 `completed`로 바꾼다. 실패하면 `failed`와 에러 메시지를 저장한다.
4. 프론트는 `GET /experiments/{id}`로 상태를 주기적으로 확인하고(polling, 1~2초 간격), 완료되면 결과를 조회한다.

MVP는 "실행 완료 후 저장된 결과를 턴별로 탐색"하는 방식이다. 턴마다 실시간으로 주고받는 구조는 추가 협의 대상.

## 1. 공통 값

| 항목 | 값 |
|---|---|
| 도시 수 | ⚠️ 5 (현재 docker-compose 기준. README는 7) |
| 도시 번호 | 1부터 시작 (`city_id`: 1..N) |
| 센서값 `sensor` | `"danger"` / `"safe"` |
| 결정 `decision`, 방송 `broadcast`, 정답 `truth` | `"evacuate"`(대피) / `"stay"`(잔류) |
| 실험 상태 `status` | `pending` → `running` → `completed` / `failed` |
| 비율 값 | 0.0 ~ 1.0 소수 (프론트에서 % 표시) |
| 시각 | ISO 8601, UTC (`2026-11-02T06:30:00Z`) |

## 2. 실험 설정 (프론트 → API → God)

| 필드 | 타입 | 범위 | 기본값 | 설명 |
|---|---|---|---|---|
| `name` | string | 0~50자 | `null` | 실험 이름 (목록 표시용) |
| `turns` | int | 1 ~ 100 | 20 | 턴 수 |
| `sensor_error_rate` | float | 0.0 ~ 1.0 | 0.1 | 센서가 틀린 값을 읽을 확률 |
| `drop_rate` | float | 0.0 ~ 1.0 | 0.0 | 메시지 누락률 |
| `tamper_rate` | float | 0.0 ~ 1.0 | 0.0 | 메시지 조작률 |
| `byzantine_count` | int | 0 ~ 도시 수 - 1 | 1 | 비잔틴(거짓말하는) 도시 수. 정상 도시가 1곳 이상 있어야 정확도 계산 가능 |
| `algorithm` | string | ⚠️ 엔진팀 확정 | `"majority"` | 합의 알고리즘. 엔진이 알고리즘별 비교를 하므로 필요 |
| `seed` | int \| null | 0 이상 | `null` | 랜덤 시드. 같은 시드면 같은 결과 → 공정한 비교, 시연 재현 |

범위를 벗어나면 API가 `422`를 돌려준다.

## 3. API 엔드포인트 (프론트 ↔ API)

기본 주소: `http://localhost:8000` · 전체 명세는 실행 후 `/docs`(Swagger)에서 확인.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/experiments` | 실험 생성 + 실행 시작 (202) |
| GET | `/experiments` | 실험 목록 (최신순) |
| GET | `/experiments/{id}` | 설정 + 상태 (polling용) |
| GET | `/experiments/{id}/turns` | 턴별 정답·정확도 (그래프·슬라이더용, 가벼움) |
| GET | `/experiments/{id}/turns/{turn}` | 해당 턴의 도시별 상세 |
| GET | `/experiments/compare?ids=1&ids=2` | 두 실험의 설정 + 정확도 비교 |
| GET | `/health` | 서버 상태 |

### POST /experiments

요청
```json
{
  "name": "비잔틴 1개, 누락 10%",
  "turns": 20,
  "sensor_error_rate": 0.1,
  "drop_rate": 0.1,
  "tamper_rate": 0.0,
  "byzantine_count": 1,
  "algorithm": "majority",
  "seed": 42
}
```

응답 `202 Accepted` — `GET /experiments/{id}`와 같은 형식
```json
{
  "id": 3,
  "name": "비잔틴 1개, 누락 10%",
  "status": "pending",
  "config": { "turns": 20, "sensor_error_rate": 0.1, "drop_rate": 0.1, "tamper_rate": 0.0,
              "byzantine_count": 1, "algorithm": "majority", "seed": 42 },
  "n_cities": 5,
  "byzantine_ids": [],
  "mean_accuracy": null,
  "error": null,
  "created_at": "2026-11-02T06:30:00Z",
  "started_at": null,
  "finished_at": null
}
```
- `byzantine_ids`, `mean_accuracy`는 `completed`가 되면 채워진다.
- `mean_accuracy`: 전체 턴 정확도 평균 (목록·비교 화면 요약용).

### GET /experiments

쿼리: `limit`(기본 50, 최대 200), `offset`(기본 0). 응답은 위 객체의 배열.

### GET /experiments/{id}/turns

```json
{
  "experiment_id": 3,
  "turns": [
    { "turn": 1, "truth": "evacuate", "accuracy": 1.0 },
    { "turn": 2, "truth": "stay", "accuracy": 0.75 }
  ]
}
```
- 실험이 `completed`가 아니면 `409`.

### GET /experiments/{id}/turns/{turn}

```json
{
  "experiment_id": 3,
  "turn": 2,
  "truth": "stay",
  "accuracy": 0.75,
  "cities": [
    {
      "city_id": 1,
      "is_byzantine": false,
      "sensor": "safe",
      "decision": "stay",
      "broadcast": "stay",
      "correct": true,
      "received": [
        { "from": 2, "value": "evacuate", "dropped": false, "tampered": true },
        { "from": 3, "value": null, "dropped": true, "tampered": false }
      ]
    }
  ]
}
```
- `received`: 이 도시가 받은 메시지. 누락된 메시지는 `value: null`, `dropped: true`.
- `correct`: 결정이 정답과 같은지. 비잔틴 도시도 표시는 하지만 정확도 계산에서는 빠진다.

### GET /experiments/compare?ids=1&ids=2

```json
{
  "experiments": [
    { "id": 1, "name": "...", "config": { }, "mean_accuracy": 0.92,
      "accuracy": [ { "turn": 1, "truth": "evacuate", "accuracy": 1.0 } ] },
    { "id": 2, "name": "...", "config": { }, "mean_accuracy": 0.61,
      "accuracy": [ { "turn": 1, "truth": "evacuate", "accuracy": 0.75 } ] }
  ]
}
```
- `ids`는 2~5개. 완료되지 않은 실험이 섞여 있으면 `409`.

### 에러 형식

FastAPI 기본 형식을 쓴다: `{"detail": "experiment 99 not found"}`

| 코드 | 상황 |
|---|---|
| 404 | 실험 또는 턴이 없음 |
| 409 | 실험이 아직 완료되지 않음 |
| 422 | 입력값 범위 오류 |

## 4. God 규격 (API ↔ God)

God 주소: `http://god:8000` (compose 내부망). API는 God 응답을 최대 120초 기다린다.

### POST /run

요청 (API → God)
```json
{
  "experiment_id": 3,
  "turns": 20,
  "sensor_error_rate": 0.1,
  "drop_rate": 0.1,
  "tamper_rate": 0.0,
  "byzantine_count": 1,
  "algorithm": "majority",
  "seed": 42
}
```

응답 (God → API)
```json
{
  "n_cities": 5,
  "byzantine_ids": [4],
  "turns": [
    {
      "turn": 1,
      "truth": "evacuate",
      "cities": [
        { "city_id": 1, "is_byzantine": false, "sensor": "danger",
          "decision": "evacuate", "broadcast": "evacuate" }
      ],
      "messages": [
        { "from": 1, "to": 2, "sent": "evacuate", "received": "evacuate",
          "dropped": false, "tampered": false }
      ]
    }
  ]
}
```
- `cities`: 모든 도시를 한 번씩. `messages`: 그 턴에 오간 모든 메시지 (누락된 것 포함, `received: null`).
- ⚠️ **정확도는 API가 계산한다**: 정상(비잔틴 아님) 도시 중 `decision == truth`인 비율. 정의를 한 곳에서만 관리하려는 목적. 엔진팀이 다른 정의를 원하면 턴마다 `accuracy`를 넣어 주면 그 값을 우선 사용한다.
- 시뮬레이션이 실패하면 God은 `500`과 `{"error": "이유"}`를 돌려준다 (`common/http.py` 기본 동작). API는 이 메시지를 실험의 `error`에 저장한다.
- 엔진 연동 전까지 API는 같은 형식의 결과를 만드는 **Mock God**을 쓴다 (`GOD_MODE=mock`).

## 5. DB (MySQL 8)

```
experiments 1 ─── N turn_results 1 ─── N city_states
                                  1 ─── N messages
```

| 테이블 | 주요 컬럼 |
|---|---|
| `experiments` | id, name, status, turns, sensor_error_rate, drop_rate, tamper_rate, byzantine_count, algorithm, seed, n_cities, byzantine_ids(JSON), mean_accuracy, error, created_at, started_at, finished_at |
| `turn_results` | id, experiment_id(FK), turn, truth, accuracy · UNIQUE(experiment_id, turn) |
| `city_states` | id, turn_result_id(FK), city_id, is_byzantine, sensor, decision, broadcast · UNIQUE(turn_result_id, city_id) |
| `messages` | id, turn_result_id(FK), from_city, to_city, sent, received, dropped, tampered |

- 실험을 지우면 하위 결과도 같이 지워진다 (ON DELETE CASCADE).
- 스키마 변경은 Alembic 마이그레이션으로만 한다.

## 6. 확정이 필요한 것 (11/6)

- [ ] 도시 수 5개 vs 7개 (엔진·프론트)
- [ ] `algorithm` 값 목록 (엔진)
- [ ] `seed` 필드 추가 동의 (전체)
- [ ] 정확도 정의: 정상 도시 기준 정답 비율 (엔진)
- [ ] God `/run` 응답 형식, 시뮬레이션 최대 소요 시간 (엔진)
- [ ] 상태 polling 간격 (프론트)
