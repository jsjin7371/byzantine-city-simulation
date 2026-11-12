# 연동 규격 (v3)

> 엔진팀 슈도코드·턴 JSON 형식 기준. 엔진 ↔ API 부분은 11/3 엔진팀 확인 완료.
> ⚠️ 표시는 아직 확인이 필요한 항목. 변경은 PR로 하고, 바뀐 내용은 디스코드에 공유합니다.

## 0. 전체 흐름

```
프론트 ──▶ API(FastAPI) ──POST /run──▶ God ──▶ City 1..5 (원형 연결)
             ▲    │                      │
             │    └──▶ MySQL             │
             └──── 턴마다 결과 전송 ◀─────┘
```

1. 프론트가 `POST /experiments`로 설정을 보내면 API가 실험을 `pending`으로 저장하고 바로 `202`를 돌려준다.
2. API가 백그라운드에서 God의 `POST /run`을 호출한다 (`experiment_id` + 설정값).
3. God은 매 턴이 끝날 때마다 `POST /internal/experiments/{id}/turns`로 턴 결과를 보낸다. API는 바로 DB에 저장한다.
4. 마지막 턴까지 끝나면 God이 `/run`에 `{"ok": true}`로 응답한다. API는 모든 턴이 왔는지 확인하고 `completed`로 바꾼다. 실패하면 `failed`와 이유를 저장한다.
5. 프론트는 `GET /experiments/{id}`로 상태와 진행률(`completed_turns`)을 1초 간격으로 확인하고, 완료되면 결과를 조회한다.

MVP는 "실행 완료 후 저장된 결과를 턴별로 탐색"하는 방식이다. 턴마다 저장은 되므로 실시간 표시는 나중에 추가할 수 있다.

## 1. 공통 값

| 항목 | 값 |
|---|---|
| 도시 수 | 5 (확정. 늘릴 때는 엔진팀이 먼저 공유) |
| 도시 연결 | 원형. 도시 i의 좌측은 i-1, 우측은 i+1 (도시 1의 좌측은 도시 5) |
| 정답 `truth`, 힌트 `hint` | `"danger"` / `"safe"` |
| 결정 `decision`, 받은 값 `from_left`·`from_right` | `"evacuate"`(대피) / `"stay"`(잔류). 받은 값은 누락이면 `null` |
| 전송 상태 `to_left`·`to_right` | `"normal"` / `"dropped"`(누락) / `"flipped"`(조작) |
| 정답 판정 | `danger` → `evacuate`, `safe` → `stay`가 정답 |
| 정확도 | 전체 도시(비잔틴 포함) 중 정답인 도시 비율, 0.0~1.0 |
| 실험 상태 `status` | `pending` → `running` → `completed` / `failed` |
| 시각 | ISO 8601, UTC (`2026-11-02T06:30:00Z`) |

## 2. 실험 설정 (프론트 → API → God)

필드 이름은 엔진 요청값과 같다.

| 필드 | 타입 | 범위 | 기본값 | 설명 |
|---|---|---|---|---|
| `name` | string \| null | 0~50자 | `null` | 실험 이름 (목록 표시용, 엔진에는 안 보냄) |
| `turns` | int | 1 ~ 20 | 10 | 턴 수 |
| `sensor_error` | float | 0.0 ~ 1.0 | 0.1 | 신이 틀린 힌트를 줄 확률 |
| `drop_rate` | float | 0.0 ~ 1.0 | 0.0 | 메시지 누락 확률 |
| `flip_rate` | float | 0.0 ~ 1.0 | 0.0 | 메시지 조작 확률 |
| `byzantine_count` | int | 0 ~ 5 | 1 | 비잔틴(거짓말) 도시 수 |
| `seed` | int \| null | 0 ~ 2³¹-1 | `null` | 랜덤 시드. 같으면 같은 결과, `null`이면 매번 다른 결과 |

범위를 벗어나면 API가 `422`를 돌려준다.

## 3. API 엔드포인트 (프론트 ↔ API)

기본 주소: `http://localhost:8000` · 실행 후 `/docs`(Swagger)에서 직접 호출해 볼 수 있다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/experiments` | 실험 생성 + 실행 시작 (202) |
| GET | `/experiments` | 실험 목록 (최신순) |
| GET | `/experiments/{id}` | 설정 + 상태 + 진행률 (polling용) |
| GET | `/experiments/{id}/turns` | 턴별 정답·정확도 (그래프·슬라이더용, 가벼움) |
| GET | `/experiments/{id}/turns/{turn}` | 해당 턴의 도시별 상세 |
| GET | `/experiments/compare?ids=1&ids=2` | 실험 2~5개의 설정 + 정확도 비교 |
| GET | `/health` | 서버 상태 |

### POST /experiments

요청
```json
{
  "name": "비잔틴 1개, 누락 10%",
  "turns": 10,
  "sensor_error": 0.1,
  "drop_rate": 0.1,
  "flip_rate": 0.0,
  "byzantine_count": 1,
  "seed": 42
}
```

응답 `202 Accepted` — `GET /experiments/{id}`와 같은 형식
```json
{
  "id": 3,
  "name": "비잔틴 1개, 누락 10%",
  "status": "pending",
  "config": { "turns": 10, "sensor_error": 0.1, "drop_rate": 0.1, "flip_rate": 0.0,
              "byzantine_count": 1, "seed": 42 },
  "n_cities": 5,
  "completed_turns": 0,
  "byzantine_ids": [],
  "mean_accuracy": null,
  "error": null,
  "created_at": "2026-11-02T06:30:00Z",
  "started_at": null,
  "finished_at": null
}
```
- 이미 `pending`·`running`인 실험이 있으면 `409`로 거절하고 실험을 만들지 않는다 (대기열 없음, 11/6 결정). `detail`은 화면에 그대로 보여 줄 수 있는 한국어 문장이다. 예: `"이미 실행 중인 실험(#3)이 있습니다. 끝난 뒤 다시 실행해 주세요."`
- `completed_turns`: 지금까지 저장된 턴 수. 실행 중 진행률 표시에 쓸 수 있다 (예: 7/10).
- `byzantine_ids`, `mean_accuracy`는 `completed`가 되면 채워진다. `mean_accuracy`는 전체 턴 정확도 평균.

### GET /experiments

쿼리: `limit`(기본 50, 최대 200), `offset`(기본 0). 응답은 위 객체의 배열.

### GET /experiments/{id}/turns

```json
{
  "experiment_id": 3,
  "turns": [
    { "turn": 1, "truth": "danger", "accuracy": 0.6 },
    { "turn": 2, "truth": "danger", "accuracy": 0.8 }
  ]
}
```
- 실험이 `completed`가 아니면 `409`.

### GET /experiments/{id}/turns/{turn}

엔진이 보낸 턴 JSON과 같은 형식에 `correct`만 추가된다.

```json
{
  "experiment_id": 3,
  "turn": 2,
  "truth": "danger",
  "accuracy": 0.8,
  "cities": [
    { "city": 1, "is_byzantine": false, "hint": "safe", "from_left": "evacuate", "from_right": "evacuate",
      "decision": "evacuate", "to_left": "normal", "to_right": "normal", "correct": true },
    { "city": 4, "is_byzantine": true, "hint": "danger", "from_left": "stay", "from_right": null,
      "decision": "evacuate", "to_left": "normal", "to_right": "dropped", "correct": true }
  ]
}
```
- `from_left`·`from_right`: 이번 턴에 좌·우 이웃에게서 받은 값. 첫 턴과 누락된 경우 `null`.
- `to_left`·`to_right`: 이번 턴에 좌·우로 보낸 메시지의 상태.
- `correct`: 결정이 정답과 맞는지.

### GET /experiments/compare?ids=1&ids=2

```json
{
  "experiments": [
    { "id": 1, "name": "...", "config": { }, "mean_accuracy": 0.92,
      "accuracy": [ { "turn": 1, "truth": "danger", "accuracy": 1.0 } ] },
    { "id": 2, "name": "...", "config": { }, "mean_accuracy": 0.61,
      "accuracy": [ { "turn": 1, "truth": "safe", "accuracy": 0.6 } ] }
  ]
}
```
- `ids`는 2~5개. 완료되지 않은 실험이 섞여 있으면 `409`.

### 에러 형식

FastAPI 기본 형식: `{"detail": "experiment 99 not found"}`

`422`의 `detail`은 두 가지 형식이다. 프론트는 둘 다 처리해야 한다.
- 입력값 범위·형식 오류: 배열 (`[{"loc": ["body", "turns"], "msg": "..."}]`)
- `byzantine_count`가 도시 수 초과, `/compare`의 `ids` 개수 오류: 문자열 (`"ids must contain 2 to 5 distinct experiments"`)

| 코드 | 상황 |
|---|---|
| 404 | 실험 또는 턴이 없음 |
| 409 | 다른 실험이 실행 중인데 새 실험을 요청함 / 실험이 아직 완료되지 않음 / 같은 턴을 두 번 보냄 |
| 422 | 입력값 범위·형식 오류 |

## 4. God 규격 (API ↔ God)

주소 (compose 내부망): God `http://god:8000`, API `http://api:8000`

### ① API → God: POST /run

```json
{
  "experiment_id": 3,
  "turns": 10,
  "sensor_error": 0.1,
  "drop_rate": 0.1,
  "flip_rate": 0.0,
  "byzantine_count": 1,
  "seed": 42
}
```
- God은 시뮬레이션을 끝까지 돌린 뒤 응답한다. API는 최대 120초 기다린다.
- 성공: `200` + `{"ok": true}`
- 실패: `500` + `{"error": "이유"}` (`common/http.py` 기본 동작). API가 이 이유를 실험의 `error`에 저장한다.
- 엔진은 모르는 필드가 오면 거부하므로 API는 위 7개 필드만 보낸다.
- `seed`: 엔진이 `random.Random(seed)`로 정답·비잔틴 도시·힌트를 만들고, City에는 도시별 seed를 나눠 준다. City는 이 seed로 누락·조작 난수를 초기화하므로, 같은 seed면 누락·조작 결과까지 같다.
- God은 실험을 **한 번에 하나만** 실행한다. 그래서 API가 `POST /experiments` 단계에서 실행 중인 실험이 있으면 `409`로 거절하고, God에는 항상 한 번에 하나의 `/run`만 보낸다.
- 한 번 시도한 `experiment_id`는 다시 실행하지 않는다 (API는 항상 새 id로 요청).

### ② God → API: POST /internal/experiments/{experiment_id}/turns

매 턴이 끝날 때마다 한 번 보낸다. `experiment_id`는 ①에서 받은 값.

```json
{
  "turn": 2,
  "truth": "danger",
  "accuracy": 0.8,
  "cities": [
    { "city": 1, "is_byzantine": false, "hint": "safe", "from_left": "evacuate", "from_right": "evacuate",
      "decision": "evacuate", "to_left": "normal", "to_right": "normal" }
  ]
}
```
- `cities`: 모든 도시를 한 번씩. `from_left`·`from_right`는 이번 턴에 도시에게 넘겨준 받은값.
- `accuracy`: 엔진이 계산해서 보낸다. 빠지면 API가 같은 기준(전체 도시 중 정답 비율)으로 계산한다.
- 응답: `200` + `{"ok": true, "experiment_id": 3, "turn": 2}`. God은 이 세 값을 확인한 뒤 다음 턴으로 넘어간다.
- 같은 턴을 두 번 보내면 `409`, 형식이 틀리면 `422`(어느 필드가 틀렸는지 `detail`에 나온다).
- God은 실패해도 같은 턴을 다시 보내지 않고 `/run`을 `500`으로 끝낸다. API는 그 실험을 `failed`로 처리한다.
- God의 `request()` 기본 timeout은 1초이므로 API는 턴 저장을 1초 안에 응답해야 한다 (현재 수 ms).
- `common/http.py`의 `request()` 그대로 쓰면 된다:
  ```python
  request("POST", f"http://api:8000/internal/experiments/{experiment_id}/turns", turn_json)
  ```

- `/run`이 `{"ok": true}`로 끝나면 API는 받은 턴 수가 `turns`와 같은지 확인하고 `completed`, 모자라면 `failed`로 처리한다.

### Mock God

엔진 연동 전까지 API는 엔진 슈도코드를 그대로 옮긴 가짜 God을 쓴다 (`GOD_MODE=mock`, `backend/app/god/mock.py`). 원형 연결, 다수결, 누락·조작, 비잔틴 동작이 같다.
Mock은 네트워크 없이 백엔드 안에서 돌기 때문에 턴을 `/run` 응답에 모아서 돌려준다 (`{"ok": true, "turns": [...]}`). 실제 엔진은 이 방식을 쓰지 않는다. 그래서 Mock에서는 `completed_turns`가 0에서 전체 턴 수로 한 번에 바뀌고, 실제 엔진에서는 턴마다 1씩 올라간다.
Mock과 실제 엔진은 난수를 뽑는 순서가 달라서, 같은 seed라도 결과가 다르다. seed 재현은 같은 God 안에서만 보장된다 (턴 JSON 형식은 같음, 엔진팀 11/3 공유).

## 5. DB (MySQL 8)

```
experiments 1 ─── N turn_results 1 ─── N city_states
```

| 테이블 | 주요 컬럼 |
|---|---|
| `experiments` | id, name, status, turns, sensor_error, drop_rate, flip_rate, byzantine_count, seed, n_cities, byzantine_ids(JSON), mean_accuracy, error, created_at, started_at, finished_at |
| `turn_results` | id, experiment_id(FK), turn, truth, accuracy · UNIQUE(experiment_id, turn) |
| `city_states` | id, turn_result_id(FK), city, is_byzantine, hint, from_left, from_right, decision, to_left, to_right · UNIQUE(turn_result_id, city) |

- 엔진 턴 JSON의 `cities[]` 항목이 `city_states` 한 행이 된다.
- 실험을 지우면 하위 결과도 같이 지워진다 (ON DELETE CASCADE).
- 스키마 변경은 Alembic 마이그레이션으로만 한다.

## 6. 확정이 필요한 것 (11/6)

- [x] 도시 수 5개 (엔진, 11/3)
- [x] 턴 결과 전송: 턴마다 ② 호출, 끝나면 `/run`이 `{"ok": true}` (엔진, 11/3)
- [x] `seed` 지원, `null`이면 매번 랜덤. City에도 적용 완료 (엔진, 11/3)
- [x] 빠진 응답 값: 현재안 유지, 회신 없음 (프론트, 11/3)
- [x] seed 입력 칸: 넣는 것으로 진행, 비우면 매번 랜덤 (프론트, 11/3)
- [x] 상태 polling 간격: 1초, `completed`/`failed`가 되면 중단 (백엔드 제안, 변경 시 프론트가 공유)
