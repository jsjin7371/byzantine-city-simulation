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
- 실패: `500` + `{"error": "이유"}` (`common/http.py` 기본 동작). API는 이유를 보고 화면용 한국어 문장을 만들어 실험의 `error`에 저장하고, 원문은 뒤에 `(상세: ...)`로 붙인다 (`backend/app/god/client.py`).
  예: `"도시 3에 연결하지 못해 실험을 시작하지 못했습니다. City 컨테이너가 켜져 있는지 확인해 주세요. (상세: God 500: ...)"`
- 엔진은 모르는 필드가 오면 거부하므로 API는 위 7개 필드만 보낸다.
- 엔진 전용 선택 필드 (API는 보내지 않음): `n_cities` (3~City 컨테이너 수 `N_CITIES`, 기본 5), `connection` (`"ring"` 기본 / `"all"`). `"all"`이면 턴 결과의 도시 줄은 `from_*`·`to_*` 대신 `received`·`to`(이웃 id 문자열 → 값)를 쓰므로 백엔드 저장 형식과 맞지 않는다 (게임 전용).
- God → City `/turn`: 요청 `{"hint", "received": {이웃 id 문자열: 받은 값 | null}}`, 응답 `{"decision", "sent": {이웃 id: 보낸 값 | null}, "to": {이웃 id: 상태}}`. ring의 이웃 순서는 [왼쪽, 오른쪽]이고 God이 이를 `from_left`·`from_right`·`to_left`·`to_right`로 바꿔 보낸다.
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

Compose의 기본값은 실제 God 호출이다 (`GOD_MODE=http`, 11/11 연동 확인).
Mock God은 엔진 슈도코드를 그대로 옮긴 가짜 God으로, pytest와 엔진 없이 개발할 때 쓴다 (`GOD_MODE=mock`, `backend/app/god/mock.py`). 원형 연결, 다수결, 누락·조작, 비잔틴 동작이 같다.
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

## 7. 마피아 게임 (0단계 결정, 11/19)

> 기획서 `AI도시_마피아_기획서.md` 0단계 결정. 의심도 증감 폭, 고발 임계값, 난이도별 값, 공유 쌍 수는 1단계 파일럿이 측정 후 채운다.
> 기존 `/run` 실험 API와 1~6절은 그대로 둔다. 게임은 별도 경로(`/games`)를 쓴다.

### 7.1 용어와 공통 값

| 항목 | 값 |
|---|---|
| 도시 수 | 5 |
| 역할 `role` | `"player"`(플레이어 마피아, 1명) / `"colleague"`(자동 마피아 동료, 항상 정답의 반대) / `"citizen"`(시민) |
| 시민 | `role == "citizen"`인 도시. 마피아가 1명이면 4명, 2명이면 3명 |
| 턴 수 | 15 (고정) |
| 누락·조작 | 게임에서는 `drop_rate = flip_rate = 0` 고정 (조작이 가짜 모순을 만들지 않게) |
| 주장 `claim` | `"evacuate"`(대피, 기획서의 0) / `"stay"`(잔류, 기획서의 1). 기존 `decision`과 같은 값 |
| 의심도 `suspicion` | 다른 도시 id(문자열) → 0~100 정수. 다수결 시민은 `null` |
| 판단 이유 `reason` | 1~2문장 문자열. 규칙 시민은 규칙이 만든 짧은 문장, 없으면 `null` |
| 시민 정확도 `accuracy` | 이번 턴 시민 중 정답 비율 (마피아 제외. 기존 실험의 정확도와 다름) |

### 7.2 설정값

| 필드 | 값 | 기본값 | 설명 |
|---|---|---|---|
| `connection` | `"all"` / `"ring"` | `"all"` | 모두 대화 / 양옆만 |
| `citizen_type` | `"majority"` / `"wary"` / `"ai"` | `"wary"` | 다수결 / 눈치 / AI 시민. 한 판의 시민은 모두 같은 종류 |
| `memory` | `"turn"` / `"recent"` / `"full"` | `"turn"` | 7.3 참고 |
| `share_mode` | `"all"` / `"pairs"` / `"none"` | `"pairs"` | 7.5 참고 |
| `share_pairs` | int ≥ 1 | 1 | `share_mode == "pairs"`일 때 턴마다 고르는 시민 쌍 수 |
| `mafia_count` | 1 / 2 | 1 | 플레이어 포함 마피아 수 (동료 = `mafia_count - 1`) |
| `player` | `"human"` / `"bot"` | `"human"` | `"bot"`이면 플레이어 도시도 항상 반대로 말한다 (실험 모드, 기준 봇 승률 측정) |
| `sensor_error` | 0.0~1.0 | 0.1 | 기존과 같음 |
| `seed` | int \| null | `null` | 기존과 같음. 정답, 마피아 위치, 힌트, 공유 쌍을 모두 이 seed로 뽑는다 |

난이도는 프론트가 위 값의 묶음(프리셋)으로 고른다. 나머지 값은 기본값. `bot_win_rate`는 1단계 파일럿 값 (`experiments/mafia_pilot.csv`, 10000판).

| 난이도 | `mafia_count` | `sensor_error` | `citizen_type` | `bot_win_rate` |
|---|---|---|---|---|
| 쉬움 | 2 | 0.4 | `"wary"` | 0.57 |
| 보통 | 1 | 0.3 | `"wary"` | 0.24 |
| 어려움 | 1 | 0.2 | `"wary"` | 0.02 |

### 7.3 시민의 기억 범위

- 기본값 `"turn"`: 시민은 **이번 턴의 힌트, 이번 턴에 받은 주장, 이번 턴 공유 내용**과 **자기 의심도(직전 턴 값)** 만 본다. 과거 힌트·주장은 보지 않는다. 기억은 의심도에만 누적된다.
- 파일럿 비교 후보
  1. `"turn"` (기본값)
  2. `"recent"`: 최근 k턴의 자기 힌트도 본다 (k = 1. 파일럿에서 k ≥ 2면 마피아 1명 봇 승률이 1% 미만)
  3. `"full"`: 자기 힌트 이력 전체. 게임이 성립하지 않는 것을 확인하는 대조군 (기획서 "제약": 마피아 승률 0% 예상)
- 근거: 정답이 한 판 동안 고정이라 힌트 이력을 보면 대화를 무시해도 맞힌다.

### 7.4 마피아에게 보이는 정보

- 플레이어는 정답, 모든 도시의 역할, **시민별 이번 턴 힌트**를 주장을 고르기 전에 본다.
- 근거: 힌트를 모르면 시민마다 다른 말을 고를 근거가 없어 "항상 반대"가 최선이 된다.
- 턴이 끝나면 의심도, 판단 이유, 공유 내용, 투표 결과도 모두 본다 (숨기는 정보 없음).

### 7.5 한 턴의 진행 순서 (God)

턴 t에서:
1. 시민별 힌트 `hint_t`를 뽑는다. 직전 턴 끝에 미리 뽑아 플레이어에게 보여 준다 (7.7 `next_hints`).
2. 주장 모으기. 받는 도시 r, 보내는 도시 s (`connection`에 따라 s가 r의 이웃일 때만):
   - s가 시민: 직전 턴 결정 `decision_{t-1}`을 모두에게 같게 보낸다. 1턴에는 `null`.
   - s가 동료 또는 `player == "bot"`인 플레이어: 정답의 반대를 모두에게 보낸다. 1턴부터 보낸다.
   - s가 사람 플레이어: 요청의 `claims[r]`. 시민마다 다르게 고를 수 있다.
3. 정보 공유: `share_mode`에 따라 시민 쌍을 고른다 (`all`: 모든 시민 쌍, `pairs`: 무작위 `share_pairs`쌍, `none`: 없음). God이 쌍 (a, b)가 이번 턴에 받은 주장을 비교해, 같은 보낸 도시 s가 a와 b에게 다른 주장을 보냈으면(둘 다 `null`이 아닐 때) s에 대한 **모순**으로 기록한다. 쌍에게 전달되는 것은 모순 목록뿐이다 (받은 주장 전체는 `cities[].received`에 있다). 신이 중계하고 도시끼리 직접 통신하지 않는다.
4. 각 시민 City를 한 번 호출한다 (힌트, 받은 주장, 자기가 속한 쌍의 공유 내용과 모순, 직전 의심도). City는 결정, 의심도, 판단 이유를 돌려준다. 공유를 같은 호출에 넣으므로 시민당 호출은 턴마다 1회다.
5. 고발 투표 (7.6).
6. 종료 판정 (7.6).

마피아 도시(플레이어, 동료)는 결정하지 않는다. `cities[]`에서 마피아 항목은 `city`, `role`만 값이 있고 `hint`, `received`, `decision`, `correct`, `suspicion`, `reason`은 모두 `null`이다.

### 7.6 고발 투표와 판정

- **의심도 증감 (눈치 있는 시민)**: 받은 주장이 자기 힌트와 다르면 +10, 같으면 −20, 공유에서 모순이 나온 도시는 추가로 +20. 0~100으로 자른다. `memory`가 `"recent"`·`"full"`이면 "자기 힌트"는 기억한 힌트의 다수(동점이면 이번 턴 힌트).
- **결정 (눈치 있는 시민)**: 기억한 힌트마다 1표 + 받은 주장마다 `1 − 의심도/100`표(이번 턴 갱신한 의심도). 합이 동점이면 이번 턴 힌트를 따른다. 다수결 시민은 주장마다 1표.
- **투표 열림**: 어떤 시민이든 어떤 도시에 대한 의심도가 임계값 60 이상이면 그 턴 끝에 연다. 다수결 시민은 의심도가 없으므로 투표가 열리지 않는다.
- **투표**: 시민만 투표한다. 각 시민은 자기를 뺀 **모든** 도시(임계값을 넘은 도시로 한정하지 않음) 중 의심도가 가장 높은 도시 하나에 투표한다. 최고값이 동점이면 동점인 도시 중 무작위로 하나에 투표한다 (seed로 뽑음).
- **집계**: 기존 다수결 로직. 한 도시가 시민 수의 과반(시민 4명이면 3표, 3명이면 2표)을 받으면 그 도시가 `accused`. 없으면 `accused = null`.
- **발각**: `accused`가 마피아(플레이어 또는 동료)이면 즉시 종료, 패배 (`end_reason: "caught"`). 동료가 지목돼도 마피아 팀 전체가 진다.
- **오지목**: `accused`가 시민이면 아무 일도 없다 (탈락 없음, 의심도 그대로). 기록만 남기고 게임은 계속된다.
- **15턴 종료 판정**: 15턴의 시민 결정 기준.

| `outcome` | 조건 |
|---|---|
| `"perfect_win"` | 들키지 않고 시민 전부 오답 |
| `"win"` | 들키지 않고 시민 과반이 오답 (4명이면 3명 이상, 3명이면 2명 이상) |
| `"loss"` | 그 외. 시민 4명이 2:2이면 과반 오답이 아니므로 패배 |

### 7.7 턴 결과 JSON

God ↔ 백엔드, 백엔드 ↔ 프론트가 같은 형식을 쓴다. 도시 id는 JSON 키일 때 문자열(`"1"`~`"5"`), 값일 때 정수.

메시지 객체: `{"claim": "evacuate" | "stay", "note": ""}`. `note`(한마디)는 예약 필드로 지금은 항상 `""`이고 엔진은 무시한다 (7단계 대화 모드용). 보내지 않은 칸은 `null`.

```json
{
  "game_id": 7,
  "turn": 3,
  "truth": "danger",
  "accuracy": 0.5,
  "cities": [
    { "city": 1, "role": "citizen", "hint": "danger",
      "received": { "2": {"claim": "evacuate", "note": ""}, "3": {"claim": "stay", "note": ""},
                    "4": {"claim": "stay", "note": ""}, "5": {"claim": "evacuate", "note": ""} },
      "decision": "evacuate", "correct": true,
      "suspicion": { "2": 10, "3": 60, "4": 20, "5": 5 },
      "reason": "3번이 2번에게 한 말과 나에게 한 말이 달랐다." },
    { "city": 3, "role": "player", "hint": null, "received": null,
      "decision": null, "correct": null, "suspicion": null, "reason": null },
    { "city": 5, "role": "colleague", "hint": null, "received": null,
      "decision": null, "correct": null, "suspicion": null, "reason": null }
  ],
  "sharing": [
    { "pair": [1, 2],
      "contradictions": [ { "city": 3, "told": { "1": {"claim": "stay", "note": ""}, "2": {"claim": "evacuate", "note": ""} } } ] }
  ],
  "vote": {
    "ballots": { "1": 3, "2": 3, "4": 1, "5": 3 },
    "accused": 3,
    "caught": true
  },
  "game_over": true,
  "outcome": "loss",
  "end_reason": "caught",
  "next_hints": null
}
```
- `cities`: 모든 도시를 한 번씩. `received`는 이번 턴에 받은 메시지 (보낸 도시 id → 메시지 또는 `null`).
- `sharing`: 이번 턴에 공유한 쌍과 모순만 담는다. `told`는 받은 시민 id → 메시지 객체. 모순이 없으면 `contradictions: []`. `share_mode == "none"`이면 `[]`.
- `vote`: 투표가 열리지 않았으면 `null`. `ballots`는 시민 id → 투표한 도시 id. `accused`는 도시 id 또는 `null`. `caught`는 bool로, `accused`가 마피아(플레이어 또는 동료)일 때만 `true`.
- `end_reason`: `null`(계속) / `"caught"` / `"turns_done"`.
- `outcome`: `game_over == false`이면 `null`.
- `next_hints`: 다음 턴 시민별 힌트 (시민 id → `"danger"`/`"safe"`). 게임이 끝났으면 `null`.

### 7.8 백엔드 ↔ God

God이 게임 상태를 메모리에 둔다. 진행 중 게임은 한 번에 하나이고, 새 `POST /games`가 오면 기존 게임은 버린다. God이 재시작되면 게임은 사라지고, 백엔드는 다음 요청이 실패하면 그 게임을 `failed`로 둔다. `/run` 실행 중에는 `/games` 요청을 `500`(`"God is already running an experiment"`)으로 거절한다. 턴 결과는 `/internal/...` 콜백 없이 응답 본문으로 돌려준다.

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/games` | `game_id` + 7.2 설정값 전부 | 게임 상태 (아래) |
| POST | `/games/{game_id}/turns` | `{"turn": 3, "claims": {"1": {"claim": "stay", "note": ""}, ...}}` | 턴 결과 JSON (7.7) |
| GET | `/games/{game_id}` | - | 게임 상태 |

게임 상태:
```json
{
  "game_id": 7,
  "config": { "connection": "all", "citizen_type": "wary", "memory": "turn", "share_mode": "pairs",
              "share_pairs": 1, "mafia_count": 1, "player": "human", "sensor_error": 0.1, "seed": 42 },
  "truth": "danger",
  "roles": { "1": "citizen", "2": "citizen", "3": "player", "4": "citizen", "5": "citizen" },
  "player_city": 3,
  "turn": 2,
  "game_over": false,
  "outcome": null,
  "end_reason": null,
  "next_hints": { "1": "danger", "2": "safe", "4": "danger", "5": "danger" }
}
```
- `turn`: 끝난 턴 수 (시작 직후 0).
- `claims`: 키는 플레이어와 이웃인 시민 전부. 빠지거나 남으면 `422`. 값은 메시지 객체이고 `claim`은 필수, `note`는 생략 가능(기본 `""`, 엔진은 무시하고 `""`로 저장). `player == "bot"`이면 `{}`.
- 요청의 `turn`이 `turn + 1`이 아니거나 게임이 끝났으면 `409`. 모르는 `game_id`는 `404`.
- 오류 본문은 기존과 같이 `{"error": "이유"}`.

### 7.9 프론트 ↔ 백엔드

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/games` | 7.2 설정값으로 게임 시작 (`201`). 백엔드가 `game_id`를 만들어 God에 전달하고 `GET /games/{game_id}`와 같은 형식(`status: "in_progress"` 포함)으로 돌려준다 |
| POST | `/games/{game_id}/turns` | `{"turn", "claims"}`로 한 턴 진행. 턴 결과 JSON(7.7)으로 응답 |
| GET | `/games/{game_id}` | 게임 상태(7.8) + `"status"`: `"in_progress"` / `"finished"` / `"abandoned"` / `"failed"` + `"bot_win_rate"` |
| GET | `/games/{game_id}/turns/{turn}` | 저장된 턴 결과 JSON |

- 요청·응답 형식은 7.7, 7.8과 같다. 백엔드는 턴 결과를 받은 그대로 저장한다 (예: `games`, `game_turns` JSON 컬럼). 테이블 설계는 4단계에서 정한다.
- `bot_win_rate`: 같은 설정에서 `player == "bot"`의 마피아 승률 (0.0~1.0, 결과 화면 비교용). 값은 1단계 파일럿이 채우고 백엔드가 설정별로 들고 있다. 없으면 `null`. God은 이 필드를 모른다.
- 새 게임을 시작하면 이전 `in_progress` 게임은 `abandoned`.
- 실험(`/experiments`)이 `pending`·`running`이면 `POST /games`는 `409`.
- 오류 코드(404/409/422)와 `detail` 형식은 3절과 같다.

### 7.10 City (게임용 `/turn`)

시민 City만 호출한다. 기존 `/run`용 `/turn`도 2단계에서 `received`(이웃 id → 값)로 일반화했다 (4절 ①). 게임 입력은 값이 메시지 객체이고 아래 필드가 더 있다.

- 요청 필드
  - `turn`: int
  - `hint`: `"danger"` / `"safe"`
  - `received`: 7.7 `cities[].received`와 같음 (보낸 도시 id 문자열 → 메시지 객체 또는 `null`)
  - `shared`: 이 시민이 속한 쌍의 7.7 `sharing` 항목 배열 (없으면 `[]`)
  - `suspicion`: 직전 턴 자기 의심도. 자기를 뺀 도시 id 문자열 → 0~100 int. 1턴은 모두 `0`. 다수결 시민은 `null`
  - `past_hints`: `memory`가 `"recent"`·`"full"`일 때만. 이번 턴을 뺀 자기 과거 힌트 배열 (`"danger"`/`"safe"`, 오래된 것부터). `"turn"`이면 필드 없음
  - `personality`: `citizen_type == "ai"`일 때만. `"suspicious"`(의심 많음) / `"trusting"`(쉽게 믿음). God이 시민마다 정해 넣는다. 이 필드가 있으면 City는 AI 시민으로 판단한다. `suspicion`은 눈치 있는 시민과 같은 형식(1턴 모두 `0`). AI 시민은 `past_hints`를 쓰지 않는다
- 응답: `{"decision": "evacuate" | "stay", "suspicion": 요청과 같은 형식 | null, "reason": string | null}`.
- 시민은 자기 결정을 다음 턴 주장으로 모두에게 보내므로 응답에 보낼 값은 없다 (God이 다음 턴 `received`에 넣는다).

### 7.11 LLM 호출 위치와 키

- **City가 호출한다.** 근거: 판단 주체가 City라는 구조를 지키고 God에는 규칙(공유·모순·투표)만 남긴다. 11/6 결정대로 God–City는 내부망으로 두고, `citizen_type == "ai"`일 때만 City 컨테이너를 외부 접속용 네트워크에 추가로 붙인다.
- 게임 전용 키를 쓴다 (PR 리뷰 키와 분리). OpenAI 호환 chat completions로 호출하고, 환경변수 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`은 City 컨테이너에만 준다. 키가 없으면 테스트용 가짜 LLM을 쓴다 (5단계).
- 결정, 의심도, 판단 이유는 한 번의 호출로 받는다. 같은 seed 재현은 AI 시민에 보장하지 않는다.
- `LLM_BASE_URL`은 chat completions **전체 주소**다 (예: `https://api.openai.com/v1/chat/completions`, 게이트웨이는 끝 슬래시까지). 비면 OpenAI 기본 주소.
- 프롬프트: 성격, 이번 턴 힌트, 받은 주장, 공유에서 드러난 모순 도시, 직전 의심도. `response_format`은 `json_schema`(strict)로 보내고, 모델이 400으로 거절하면 빼고 한 번 더 보낸다. 응답은 `choices[0].message.content`를 JSON으로 읽고, 실패하면 첫 `{` ~ 마지막 `}`를 읽는다.
- 검증: `decision`은 두 값 중 하나, 의심도는 요청에 있던 도시만 0~100 정수로 자른다(빠진 도시는 직전 값), `reason`은 200자까지. 호출 오류나 형식 오류면 **눈치 있는 시민 규칙 결과**로 대신하고 `reason` 앞에 `[AI 응답 실패(오류 종류)로 눈치 규칙 대체]`를 붙인다.
- 가짜 LLM: `LLM_API_KEY`가 비면 눈치 있는 시민 규칙 결과를 JSON 문자열로 돌려주는 함수가 모델 자리에 들어가 같은 파싱·검증을 탄다. CI·테스트는 이것만 쓴다.
- **비결정성**: 같은 seed라도 AI 시민의 결정·의심도·이유는 판마다 달라질 수 있다 (가짜 LLM일 때만 재현된다).
