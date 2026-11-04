# God 컨테이너

God은 도시 5개가 위험 상황에서 내린 판단을 모아 시뮬레이션을 진행하는 서버입니다.
센서가 틀리거나 이웃이 거짓 메시지를 보낼 때 도시들의 판단이 얼마나 정확한지 비교하기 위해 사용합니다.
실험 설정을 받아 도시를 초기화하고, 메시지를 중계하며, 매 턴 결과를 백엔드에 보냅니다.

## 시뮬레이션의 기본 개념

실제 상황인 `truth`는 `danger`(위험) 또는 `safe`(안전)입니다.
각 도시는 센서 힌트와 이웃의 메시지를 바탕으로 `evacuate`(대피) 또는 `stay`(잔류)를 결정합니다.
센서 힌트는 틀릴 수 있고, 비잔틴 도시는 이웃에게 실제 상황과 반대되는 메시지를 보냅니다.

| 구분 | 담당 역할 |
|---|---|
| God | 정답·비잔틴 도시 선정, 센서 힌트 생성, 도시 초기화·호출, 메시지 중계, 정확도 계산, 결과 전송 |
| City | 힌트와 수신 메시지로 판단, 좌우 발신값 생성, 메시지 누락·조작 처리 |
| 백엔드 | 실험 실행 요청, 턴 결과 수신·저장 |

God은 City의 판단을 대신하거나 발신값에 누락·조작을 추가로 적용하지 않습니다.

## 도시 연결과 메시지 중계

도시 번호는 1~5이며 양쪽 이웃과 연결됩니다.

```text
1 ↔ 2 ↔ 3 ↔ 4 ↔ 5 ↔ 1
```

도시 1의 왼쪽은 5, 오른쪽은 2입니다. 도시 5의 왼쪽은 4, 오른쪽은 1입니다.
각 도시는 이번 턴에 받은 메시지로 판단하고, 이번 턴에 보낸 메시지는 이웃의 **다음 턴** 입력이 됩니다.

| 도시 i의 다음 턴 입력 | 가져오는 값 |
|---|---|
| `from_left` | 왼쪽 이웃이 오른쪽으로 보낸 `sent_right` |
| `from_right` | 오른쪽 이웃이 왼쪽으로 보낸 `sent_left` |

예를 들어 도시 1은 다음 턴에 도시 5의 `sent_right`와 도시 2의 `sent_left`를 받습니다.
누락된 메시지는 `null`로 전달합니다.
도시를 1~5 순서로 호출하지만 모든 도시의 응답을 모을 때까지 입력을 갱신하지 않아 같은 턴의 메시지가 섞이지 않습니다.

## 알고리즘 동작 순서

실험 초기화:

1. `POST /run`의 설정값을 검사하고 실험용 난수기를 만듭니다.
2. 정답을 한 번 정하고, 5개 도시 중 설정한 수만큼 비잔틴 도시를 선정합니다. 두 값은 실험 내내 유지합니다.
3. 모든 City에 누락·조작 확률, 비잔틴 여부, 도시별 seed를 보냅니다. 정답은 비잔틴 City에만 보냅니다.
4. 5개 City의 초기화 성공을 확인하고, 모든 도시의 좌우 수신값을 `null`로 시작합니다.

매 턴 다음 순서를 반복합니다.

1. 도시마다 센서 오류를 별도로 판정해 힌트를 만듭니다.
2. 힌트와 이전 턴의 좌우 수신값을 City에 보내고, 결정·좌우 발신값·전송 상태를 받습니다.
3. 5개 도시의 결정으로 정확도를 계산합니다.
4. 이번 턴 입력과 City 응답을 턴 JSON으로 묶어 백엔드에 보냅니다.
5. 백엔드의 저장 확인 응답을 받은 후, 좌우 발신값을 이웃의 다음 턴 입력으로 옮깁니다.

지정한 모든 턴의 전송이 확인되면 `/run`에 `{"ok": true}`를 반환합니다.

## 센서 오류와 비잔틴 도시

`sensor_error`는 정답과 반대인 힌트를 줄 확률입니다.
God은 도시별·턴별로 난수를 따로 뽑아 오류를 판정합니다.
예를 들어 정답이 `danger`이면 정상 힌트는 `danger`, 오류 힌트는 `safe`입니다.

비잔틴 도시도 자신의 판단인 `decision`을 반환합니다.
이웃에게 보내는 메시지는 그 판단과 별개로 실제 정답의 반대 결정을 기본값으로 사용합니다.
정답이 `danger`이면 비잔틴 발신 기본값은 `stay`입니다.

발신 기본값 생성과 다음 처리는 City의 역할입니다.

- 정상 도시는 자신의 결정, 비잔틴 도시는 정답의 반대 결정을 발신 기본값으로 사용합니다.
- 좌우 방향별로 누락을 먼저 판정합니다. 누락되면 발신값은 `null`입니다.
- 누락되지 않았을 때 조작을 판정합니다. 조작되면 발신 기본값을 반대로 바꿉니다.

God은 반환된 발신값을 그대로 중계하고 `normal`, `dropped`, `flipped` 상태를 결과에 기록합니다.

## 정확도

정답이 `danger`일 때 `evacuate`, `safe`일 때 `stay`를 선택하면 맞는 판단입니다.

```text
정확도 = 정답에 맞는 결정을 한 도시 수 / 5
```

비잔틴 도시도 계산에 포함합니다. 5개 중 4개가 맞았다면 정확도는 `0.8`입니다.
메시지 내용이 아닌 각 City의 `decision`을 정답과 비교합니다.

## seed와 재현성

God은 `random.Random(seed)`를 사용해 정답, 비잔틴 도시, 센서 힌트를 생성합니다.
각 City에는 seed와 도시 번호로 만든 도시별 seed를 전달합니다.
God의 난수와 City의 난수를 분리하므로 City의 누락·조작 판정 횟수가 God의 센서에 영향을 주지 않습니다.

City는 `/init`에서 전달받은 seed로 난수 상태를 초기화합니다.
동일한 설정과 seed로 실행하면 God과 City의 결과를 재현할 수 있습니다.
도시별 seed는 `experiment_id`와 무관합니다. seed가 `null`이면 재현성을 보장하지 않습니다.
도시별 seed의 계산은 [simulation.py](simulation.py)의 `city_seed()`에서 확인할 수 있습니다.

## 실행 방법

Python 3.12 이상을 사용하며 God 자체에는 추가 패키지가 필요하지 않습니다.
저장소 루트에서 로컬 서버를 시작합니다.

```powershell
Push-Location engine
python -m god.main
Pop-Location
```

서버는 `0.0.0.0:8000`에서 요청을 받습니다. 종료하려면 `Ctrl+C`를 누릅니다.
`N_CITIES`는 생략하거나 `5`로 설정해야 하며, 다른 값이면 시작하지 않습니다.

Docker에서는 저장소 루트에서 실행합니다.

```powershell
docker compose up --build -d god
```

God은 `city-1`~`city-5`와 `api`라는 호스트 이름으로 통신하므로 해당 주소에 접근할 수 있어야 합니다.
Compose 설정은 God과 City 5개를 실행하며, God의 포트를 PC에 공개하지 않습니다.
컨테이너 내부에서 상태를 확인할 수 있습니다.

```powershell
docker compose exec -T god python -c "from common.http import request; print(request('GET', 'http://localhost:8000/health'))"
```

City 서버는 `/health`, `/init`, `/turn`을 제공합니다.
**실험을 끝까지 실행하려면 `api:8000`에 백엔드 결과 수신 API가 있어야 합니다.**
기본 Compose에는 결과 수신기가 없으므로 아래 통신 검사 환경을 사용하거나 실제 백엔드를 함께 연결하세요.
로컬 실행에서도 같은 City·백엔드 주소를 사용할 수 있어야 합니다.

## HTTP API

### GET /health

God의 동작 여부와 각 City의 `/health` 응답을 확인합니다.
도시에 연결할 수 없거나 응답이 잘못되면 해당 도시 값은 `false`입니다.
최상위 `ok`는 God의 응답이며 전체 도시가 정상이라는 뜻은 아닙니다.

응답 예시:

```json
{
  "ok": true,
  "cities": {"1": true, "2": true, "3": false, "4": true, "5": true}
}
```

### POST /run

요청은 JSON 객체이며 `experiment_id`가 필수입니다.

| 필드 | 범위 | 기본값 |
|---|---|---|
| `experiment_id` | 1 이상의 정수 | 필수 |
| `turns` | 1~20 정수 | `10` |
| `sensor_error` | 0~1 숫자 | `0.1` |
| `drop_rate` | 0~1 숫자 | `0.0` |
| `flip_rate` | 0~1 숫자 | `0.0` |
| `byzantine_count` | 0~5 정수 | `1` |
| `seed` | `null` 또는 0~2147483647 정수 | `null` |

숫자를 문자열이나 불리언으로 보내면 거부합니다. 확률은 유한한 값이어야 하며, 표에 없는 필드도 거부합니다.

요청 예시:

```http
POST /run
Content-Type: application/json
```

```json
{
  "experiment_id": 3,
  "turns": 10,
  "sensor_error": 0.1,
  "drop_rate": 0.0,
  "flip_rate": 0.0,
  "byzantine_count": 1,
  "seed": 42
}
```

모든 턴을 마친 뒤의 응답은 HTTP 200입니다. 실행 중에는 응답을 기다려야 합니다.

```json
{"ok": true}
```

입력 오류나 City·백엔드 호출 실패는 HTTP 500과 `error` 필드로 반환합니다.
예를 들어 `turns`가 21이면 다음과 같이 응답합니다.

```json
{"error": "invalid turns: expected integer in 1..20"}
```

### God이 사용하는 City 호출

God은 `http://city-{1..5}:8000`으로 다음 데이터를 주고받습니다.
아래 입출력은 저장소의 `city/main.py`에 구현된 엔드포인트와 일치합니다.

| 경로 | God이 보내는 값 | God이 받는 값 |
|---|---|---|
| `POST /init` | `experiment_id`, `drop_rate`, `flip_rate`, `is_byzantine`, `seed`; 비잔틴일 때만 `truth` | `{"ok": true}` |
| `POST /turn` | `hint`, `from_left`, `from_right` | `decision`, `sent_left`, `sent_right`, `to_left`, `to_right` |

`sent_left/right`는 `evacuate`, `stay`, `null` 중 하나입니다.
상태가 `dropped`이면 발신값은 `null`, `normal/flipped`이면 `evacuate` 또는 `stay`여야 합니다.

### God → 백엔드: 턴 결과 전송

매 턴 `POST http://api:8000/internal/experiments/{experiment_id}/turns`로 전송합니다.
`cities`에는 도시 1~5가 각각 한 번씩 포함됩니다.
다음은 위 설정에서 City가 각 힌트에 따라 결정한 첫 턴의 결과 예시입니다.

```json
{
  "turn": 1,
  "truth": "danger",
  "accuracy": 1.0,
  "cities": [
    {"city": 1, "is_byzantine": true, "hint": "danger", "from_left": null, "from_right": null,
     "decision": "evacuate", "to_left": "normal", "to_right": "normal"},
    {"city": 2, "is_byzantine": false, "hint": "danger", "from_left": null, "from_right": null,
     "decision": "evacuate", "to_left": "normal", "to_right": "normal"},
    {"city": 3, "is_byzantine": false, "hint": "danger", "from_left": null, "from_right": null,
     "decision": "evacuate", "to_left": "normal", "to_right": "normal"},
    {"city": 4, "is_byzantine": false, "hint": "danger", "from_left": null, "from_right": null,
     "decision": "evacuate", "to_left": "normal", "to_right": "normal"},
    {"city": 5, "is_byzantine": false, "hint": "danger", "from_left": null, "from_right": null,
     "decision": "evacuate", "to_left": "normal", "to_right": "normal"}
  ]
}
```

`from_left/right`는 이번 턴에 City로 보낸 수신값, `to_left/right`는 이번 턴 발신 상태입니다.
실제 발신값인 `sent_left/right`는 다음 턴 중계에 사용하며 백엔드 JSON에는 넣지 않습니다.

God은 백엔드에서 다음 응답을 받아 실험 ID와 턴 번호가 요청과 같은지 확인합니다.

```json
{"ok": true, "experiment_id": 3, "turn": 1}
```

## 오류와 실행 제한

- 초기화에 실패하면 턴을 시작하지 않습니다. 턴 도중 City 호출이 실패하면 미완성 턴을 전송하지 않습니다.
- 백엔드 호출이나 성공 확인에 실패하면 다음 턴으로 넘어가지 않습니다.
- HTTP 오류에는 실패한 주소·상태 코드·서버의 `error` 또는 `detail`을 기록합니다.
  연결·시간 초과와 JSON 해석 실패도 요청 주소와 함께 기록합니다.
- 백엔드에 저장된 뒤 응답만 유실될 수 있어 자동 재전송·이어하기·롤백을 하지 않습니다.
  오류에는 저장 확인된 턴 수가 포함됩니다. 실패 상태를 확인한 뒤 새 `experiment_id`로 실행하세요.
- 같은 프로세스에서는 한 번 실행을 시도한 실험 ID를 다시 받지 않습니다. 입력 검증에 실패한 ID는 다시 사용할 수 있습니다.
  실행 이력은 메모리에만 있어 프로세스 재시작 후에는 유지되지 않습니다.
- 서버는 요청을 하나씩 처리하므로 `/run` 실행 중 `/health`와 다른 실행 요청이 대기할 수 있습니다.
- City·백엔드 호출 제한은 각각 1초입니다. 최대 설정에서는 초기화 5회와 City 턴 호출 100회, 백엔드 전송 20회가 발생합니다.
  `/run` 호출자는 이 요청들을 마칠 수 있는 전체 대기 시간을 설정해야 합니다.

## 테스트 실행

저장소 루트에서 실행합니다.

```powershell
python -m unittest discover -s engine/tests -p "test_god*.py" -v
```

이 명령은 기존 Mock City 기반 God 검사입니다. 실제 City의 규칙과 HTTP 통신까지 확인하려면 다음 명령을 사용합니다.

```powershell
python -m unittest discover -s engine/tests -p "test_*.py" -v
```

`test_city.py`는 실제 City의 판단·발신 함수를 검사합니다.
`test_engine_network.py`는 실제 City 코드를 도시별 독립 Python 프로세스 5개로 실행하고 God과 HTTP로 연결합니다.
도시별 상태와 난수기는 실제 City가 관리하며, 결과 수신 API만 테스트 서버로 대체합니다.
누락·조작·비잔틴·20턴 실행·seed 재현·원형 중계와 장애 시 중단을 검사합니다.
장애 검사는 응답 오류·잘못된 JSON·필수 필드 누락·시간 초과를 넣는 테스트 서버를 사용합니다.

로컬 검사는 Docker나 실제 백엔드·DB 없이 실행할 수 있으며, 임시 포트의 서버 실행과 접속을 허용해야 합니다.
도시 주소는 테스트에서만 로컬 임시 포트로 연결하고 운영 주소와 알고리즘은 바꾸지 않습니다.

## Docker 통신 검사

Docker Desktop의 Linux 엔진을 실행한 뒤 저장소 루트에서 다음을 실행합니다.
기본 Compose에 테스트용 수신기 `api`를 추가하고, 컨테이너 내부 DNS와 8000번 포트를 사용합니다.

```powershell
$networkComposeArgs = @(
  "-p", "byzantine-network-check",
  "-f", "docker-compose.yml",
  "-f", "engine/tests/docker-compose.network.yml"
)
docker compose @networkComposeArgs up --build -d
docker compose @networkComposeArgs exec -T god python /tests/network_smoke.py
```

이 검사는 실제 God·City 컨테이너를 호출하고 정상 도시, 비잔틴, 누락·조작, 원형 중계와 seed 재현을 확인합니다.
수신기는 결과를 메모리에 보관하고 도시 수·정확도·턴 순서를 검사합니다. 실제 백엔드·DB 통합 검사는 포함하지 않습니다.

검사 환경의 City 3을 멈춰 초기화 실패와 미완성 턴 미전송을 확인할 수 있습니다.

```powershell
docker compose @networkComposeArgs stop city-3
docker compose @networkComposeArgs exec -T god python /tests/network_smoke.py --expect-city-down 3
```

검사가 끝나면 같은 검사 프로젝트만 종료합니다.

```powershell
docker compose @networkComposeArgs down
```

검사 스크립트는 정해진 실험 ID를 사용하므로 다시 검사하려면 `down` 후 `up`으로 검사 환경을 새로 시작하세요.
이 환경은 호스트 포트를 공개하지 않습니다. 실제 백엔드는 자체 수신 API를 같은 네트워크의 `api:8000`에 제공해야 합니다.
