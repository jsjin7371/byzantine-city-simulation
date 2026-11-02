# God 실행 및 연동 기록

## 담당 범위와 확인한 기준

God은 실험 설정, 정답·센서 생성, 도시 5개의 초기화·메시지 중계, 결과 수집·정확도 계산,
백엔드 전송을 담당한다. 다수결 판단, 비잔틴 발신값 생성, 누락·조작은 모두 City 담당이다.
기존 God에는 도시별 상태를 확인하는 `GET /health`만 있었고, 기존 City에도 `/health`만 있다.
기존 `common/http.py`와 City·백엔드·compose 파일은 수정하지 않았다.

최우선 기준은 2026-11-02 사용자가 디스코드에서 찾아 제공한 **엔진팀 원본 슈도코드**다.
아래 백엔드 코드는 HTTP·JSON 규격의 참고 자료로 사용하며 원본과 충돌하면 원본을 따른다.

- `develop`: `d0a98ab1812cfed2af5c19267103477f795c990d`
- 앞선 분석에서 확인한 [PR #6](https://github.com/jsjin7371/byzantine-city-simulation/pull/6)의
  `feature/backend-setup`: `717681354698adeea1d5ef98db357ce3104c401d`
- 해당 브랜치의 [전체 명세](https://github.com/jsjin7371/byzantine-city-simulation/blob/717681354698adeea1d5ef98db357ce3104c401d/docs/spec.md),
  [Mock God](https://github.com/jsjin7371/byzantine-city-simulation/blob/717681354698adeea1d5ef98db357ce3104c401d/backend/app/god/mock.py),
  `schemas.py`, `runner.py`, 내부 턴 수신 API, God HTTP 클라이언트 및 테스트

현재 작업 기준 develop의 `docs/spec.md`는 빈 파일이다. 원본은 사용자가 이 대화에 제공했다.
기존 구현은 백엔드 Mock을 기준으로 God이 발신·누락·조작을 수행했으나,
원본 확인 후 그 기능을 제거하고 City 응답을 사용하는 구조로 수정했다.
PR #6 전체를 병합하거나 그 파일들을 작업 브랜치로 복사하지 않았다.

## 실행 흐름

1. `POST /run` 설정을 검증하고 실험 전용 `random.Random(seed)`를 만든다.
2. 정답을 한 번 뽑고 비잔틴 도시를 한 번 선정한다. 모든 턴에서 그대로 유지한다.
   5개 City에 `/init`으로 누락·조작 확률, 비잔틴 여부 및 도시별 seed를 전달한다.
   정답은 비잔틴 City의 초기화에만 포함하며 정상 City에는 해당 필드 자체를 보내지 않는다.
   5개 초기화 성공을 모두 확인한 후 첫 턴을 시작한다.
3. 각 턴에서 도시 1~5 순서로 센서 힌트를 생성하고 City 판단을 요청한다.
   첫 턴의 수신 메시지는 양쪽 모두 `null`이다.
4. City로부터 `decision`, `sent_left`, `sent_right`, `to_left`, `to_right`를 받는다.
   God은 응답 형식과 null/상태의 일관성만 검증한다. 투표나 발신값을 다시 계산하지 않는다.
5. City가 반환한 좌우 발신값을 다음 턴 중계용으로 보관하고, 반환한 상태를 JSON에 기록한다.
   비잔틴 발신·누락·조작은 City에서 수행하며 God은 적용하지 않는다.
6. 전체 5개 도시 중 정답인 도시 수를 5로 나눠 정확도를 계산한다. 비잔틴 도시도 포함한다.
7. 완성된 턴을 백엔드에 전송하고 일치하는 성공 확인 응답을 받는다.
8. 모든 발신 값을 동시에 다음 턴의 입력으로 옮긴다.
   도시 i의 `from_left`는 왼쪽 이웃의 `to_right` 방향 발신 값이며,
   `from_right`는 오른쪽 이웃의 `to_left` 방향 발신 값이다. 1과 5도 서로 이웃이다.
9. 지정된 모든 턴의 저장 확인을 받은 뒤에만 `{"ok": true}`를 반환한다.

순차 호출을 사용하지만 5개 City 모두 이전 턴 입력만 받는다.
한 도시를 호출한 직후 다른 도시의 이번 턴 입력을 갱신하지 않는다.

## seed 재현성: City 팀과 합의할 제안

원본에는 seed 분배 방식이 없다. 현재 God용 `random.Random(seed)`와 각 City의 난수를 분리했다.
God 난수는 정답·비잔틴 선정 및 도시별·턴별 센서 오류에만 사용한다.
`city_seed()`는 다음 **제안 v1 규칙**으로 도시별 31비트 seed를 생성한다.

```text
SHA256(ASCII("god-city-v1:{seed}:{city_id}"))의 앞 4바이트를 big-endian 정수로 변환
→ 0x7fffffff와 AND
```

seed가 null이면 City에도 null을 전달하며 이때 재현성을 보장하지 않는다.
도시별 seed는 실험 ID 및 호출 순서와 무관하다. God의 센서는 City의 난수 소비 횟수와 무관하다.
동일 조건의 전체 결과 재현에는 실제 City가 전달받은 seed로 도시별 전용 난수기를 새로 만들고,
매 `/init`에서 이전 실험의 비잔틴 여부·정답·난수 상태를 모두 교체해야 한다.
Mock City로 이 동작을 검증했으며 실제 City에서의 보장은 연동 후 확인해야 한다.
난수를 나눈 만큼 단일 난수기를 쓰는 기존 백엔드 Mock과 동일 seed 결과는 달라질 수 있다.

## 백엔드 연동

요청 예시:

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

`experiment_id`는 필수 양의 정수다. 나머지 기본값은 위 예시와 같지만 `seed`는 `null`이다.
`turns`는 1~20, 확률은 0~1의 유한한 수, `byzantine_count`는 0~5,
`seed`는 `null` 또는 0~2147483647의 정수다.
seed 상한은 명세의 표에는 없지만 실제 백엔드 `ExperimentConfig`에 있어 동일하게 적용했다.
God은 문자열을 숫자로 바꾸거나 bool을 정수로 받지 않으며 알 수 없는 필드도 거부한다.
`name`은 백엔드가 보관하며 God에 보내지 않는다.

각 턴은 기존 `request()`로
`POST http://api:8000/internal/experiments/{experiment_id}/turns`에 전송한다.
본문은 `turn`, `truth`, `accuracy`, `cities`이며 도시 행은 아래 9개 필드를 포함한다.

```json
{
  "city": 1,
  "is_byzantine": false,
  "hint": "safe",
  "from_left": null,
  "from_right": null,
  "decision": "stay",
  "to_left": "normal",
  "to_right": "normal"
}
```

성공 확인 응답은 `{"ok": true, "experiment_id": 3, "turn": 1}` 형식이며
ID와 턴 번호가 실제 전송값과 일치해야 한다.
실패와 잘못된 설정은 예외를 발생시켜 기존 공통 서버가 HTTP 500 + `{"error": "이유"}`로 응답한다.
백엔드 외부 실험 생성 API의 입력 오류 응답은 422지만, God의 500은 명세 4장의 기존 규칙이다.

## City 연동: 원본에 따른 요구사항과 필드 이름 제안

현재 실제 City에는 `POST /init`, `POST /turn`이 없어 실제 컨테이너 실험을 완료할 수 없다.
초기화와 5개 반환값은 원본에 명시된 요구사항이다. 아래 JSON의 구체적인 키 이름,
초기화 성공 응답 및 seed 분배는 **아직 City 팀과 확정하지 않은 제안**이다.
`_city_init()`, `_city_turn()`에서 실제 규격에 맞게 변환할 수 있다. City 구현은 수정하지 않았다.

```text
POST http://city-{1..5}:8000/init
입력: {"experiment_id": 3, "drop_rate": 0.1, "flip_rate": 0.2,
       "is_byzantine": false, "seed": 도시별_정수_또는_null}
비잔틴 도시에만 추가: {"truth": "danger"}
출력: {"ok": true}

POST http://city-{1..5}:8000/turn
입력: {"hint": "danger", "from_left": null, "from_right": "stay"}
출력: {"decision": "evacuate", "sent_left": null, "sent_right": "stay",
       "to_left": "dropped", "to_right": "flipped"}
```

`hint`는 `danger/safe`, 수신 메시지는 `evacuate/stay/null`, 판단은 `evacuate/stay`다.
City가 각 방향별로 비잔틴 여부에 따른 기본값 생성 → 누락 판정 → 누락되지 않으면 조작 판정을 한다.
`sent_left/right`는 실제 전달할 `evacuate/stay/null`, `to_left/right`는 전달 상태다.
`dropped`는 null이어야 하며 `normal/flipped`는 유효한 결정 문자열이어야 한다.
God은 normal/flipped 발신값을 결정이나 정답으로부터 복원하지 않는다.
턴 입력에는 정답·비잔틴 여부·발신 확률을 추가하지 않고 `/init` 상태를 사용한다.
테스트 Mock City만 원본의 다수결·동률 처리, 비잔틴 발신, 누락·조작을 구현한다.
God에는 임시 판단으로 대체하는 기능이 없으므로 City 실패를 정상 실험처럼 저장하지 않는다.

## 오류·중복·시간 제한

- City 초기화 실패나 잘못된 확인 응답이면 턴을 시작하지 않는다.
  이미 일부 City가 초기화됐어도 다음 실험에서 5개 모두 다시 초기화한다. 원격 롤백은 하지 않는다.
- City 턴 호출 실패나 잘못된 판단·발신값·상태는 즉시 중단한다. 미완성 턴은 전송하지 않는다.
- 백엔드 HTTP 실패, 연결·시간 초과, 잘못된 JSON/확인 응답도 즉시 중단한다.
- 로그와 `/run` 오류에 실험 ID, 저장 확인된 턴 수, City 실패 위치를 기록한다.
- 백엔드 요청 후 응답이 유실되면 이미 저장됐을 수 있다. 자동 재시도·롤백·이어하기는 하지 않는다.
  실패 실험은 백엔드에서 확인하고 새 실험 ID로 실행한다.
- 같은 God 프로세스에서는 한 번 시도한 ID를 다시 실행하지 않는다. 잘못된 설정은 ID를 소비하지 않는다.
  ID 집합은 메모리에만 있으며 프로세스가 재시작되면 사라진다. 장기 실행 시 메모리도 늘어난다.
  영구 중복 방지는 백엔드의 실험 상태 및 동일 턴 중복 거부에 의존한다.
- 기존 공통 서버는 요청을 하나씩 처리한다. `/run` 중 `/health`와 다른 `/run`은 대기할 수 있다.
  서비스 자체에도 동시 실행 방지 잠금이 있다. 공통 서버를 임의로 다중 스레드 서버로 바꾸지 않았다.
- 기존 HTTP 호출 제한은 건당 1초다. 초기화 5회 + 최대 20턴의 City 100회 + 백엔드 20회다.
  느린 응답이 반복되면 백엔드의 전체 `/run` 대기 120초와 충돌할 수 있다.
  실제 City 완료 후 성능을 측정하고 전체 실행 시간·취소·대기 정책을 팀과 정해야 한다.

## 로컬 실행 및 테스트

Python 3.12 이상, 추가 패키지는 필요 없다. 저장소 루트에서:

```powershell
python -m unittest discover -s engine/tests -p "test_god*.py" -v
```

God을 직접 실행하려면 (도시·API 컨테이너 이름은 compose 네트워크에서 해석됨):

```powershell
Push-Location engine
python -m god.main
Pop-Location
```

God은 `N_CITIES`가 생략되면 5로 동작하며, 다른 값으로 설정하면 서버 시작을 거부한다.
현재 compose에는 이미 God 1개와 City 5개가 선언돼 있다.
백엔드 PR 통합 및 City 구현 후, 백엔드의 `GOD_MODE=http` 설정으로 실제 연동해야 한다.

2026-11-02 검증 환경: Windows, Python 3.13.3.

- 원본 기준 단위·회귀 36개와 실제 로컬 HTTP 통합 6개, 총 **42개 통과**.
- Python 구문 검사(`compileall`), compose 설정 검사(`docker compose config --quiet`),
  변경 코드의 공백 검사(`git diff --check` 및 신규 파일 검사)도 통과했다.
- 도시 수, 비잔틴 0~5개, 센서 오류, 누락 우선순위, 조작, 원형 연결 및 다음 턴 전달을 검증했다.
- Mock City 응답 사용, 비잔틴 포함 정확도, 동일 seed·다른 seed, 20턴 연속 실행을 검증했다.
- `/init` 선행, 정상 City에 정답 미전달, 초기화 실패 시 턴 미시작,
  City 발신값 그대로 중계, 같은 턴 입력 격리, 도시별 seed·상태 초기화를 검증했다.
- God 센서 난수 소비가 도시당·턴당 한 번이고 City 누락·조작 난수와 독립적인지 검증했다.
- 설정 형식·범위, 도시/백엔드 실패·시간 초과·잘못된 응답, 부분 완료와 중복 차단을 검증했다.
- 임시 로컬 서버에서 기존 `common.http.serve/request`를 사용해 `/health`, `/run`,
  초기화, 턴 전송·응답, City init/turn 404, 백엔드 500, 잘못된 판단/설정의 God 500을 검증했다.
- 기존 31개 검사를 모두 재검토했다. 공통 기능 검사는 유지하고 City mock/호출을 새 규격에 맞췄다.
  백엔드 결과 해시 일치 검사와 `god_reference.json`은 제거했다.
  그 자리는 God 센서와 City 난수 독립 검사로 대체하고 원본 책임 분리를 확인하는 11개 검사를 추가했다.
  31 - 1 + 1 + 11 = 42개이며, 이전 320턴 해시 비교는 현재 구현의 통과 근거로 사용하지 않는다.
- 이전에 확인된 샌드박스 로컬 연결 차단 때문에 HTTP 전체 검사는 권한 허용 후 실행했다.
- 실제 FastAPI·DB 및 Docker 통합은 실행하지 않았다. 현재 작업 브랜치에 백엔드 구현이 없고,
  City `/init`·`/turn`이 없고 앞선 점검에서 Docker Desktop 엔진이 실행 중이지 않았다.
  백엔드 JSON 구조는 유지했고,
  실제 FastAPI 모델 및 DB 저장 통과까지 검증한 것은 아니다.

## 팀 확인 사항

1. City 팀: `/init`, `/turn`의 실제 JSON 키, 초기화 확인 응답 및 도시별 seed 규칙을 합의한다.
   일반 City의 이전 실험 정답 제거와 난수 상태 재설정도 필요하다.
2. 백엔드 팀: 결과 JSON 및 엔드포인트 변경은 없다. `from_left/right`는 이번 턴 입력이며,
   `to_left/right`는 City 응답을 기록한다. 내부용 `sent_left/right`는 백엔드 본문에 추가하지 않는다.
3. 백엔드 팀: 기존 Mock은 같은 난수기를 공유하므로 수정 God+City와 동일 seed 결과가 다를 수 있다.
   수치 동일성을 검사하려면 도시별 난수 분리 규칙을 합의해 Mock에도 적용해야 한다.
4. 정답 고정·비잔틴 발신은 원본으로 확정됐다. 이제 이 두 사항을 미확정 질문으로 취급하지 않는다.
5. 도시 수·seed·턴 전송 방식의 문서 표시는 백엔드 팀에서 갱신해야 한다. 타 팀 파일은 수정하지 않았다.
6. 순차 호출은 사용자 허용 범위에 맞으며 턴 동시성(동일한 이전 상태)은 보장한다.
   물리적 병렬 호출은 구현하지 않았다. 실제 20턴 성능, 전체 120초 제한, `/health` 대기,
   God 재시작·중복·취소 정책은 통합 후 협의한다.

## 원본과의 일치 여부 및 PR 준비 상태

| 검토 항목 | 결과 |
|---|---|
| 누락·조작 담당 | City. God에는 해당 판정 코드 없음 |
| 발신값 중계 | City가 반환한 값을 수정 없이 다음 턴에 전달 |
| City 초기화 | 5개 모두 `/init`, 정상 City에는 truth 필드 미전달 |
| 첫 턴 입력 | 좌우 모두 null |
| 정답 | 실험당 한 번 선정 후 고정 |
| 같은 턴 입력 격리 | 5개 수집 및 백엔드 확인 후에만 다음 턴 입력 갱신 |
| 좌우 방향 | 1의 왼쪽은 5, 왼쪽 이웃의 오른쪽 발신을 수신 |
| 정확도 | 비잔틴 포함 정답 도시 수 / 5 |
| from_left/right | 이번 턴 City에 실제 전달한 입력 기록 |
| 센서 오류 | 도시별·턴별 별도 난수 판정 |

God의 확인된 원본 요구사항은 구현했다. 실제 City 서버가 미구현이라 운영 통합은 미완료이며,
City JSON 키와 seed 확정 전에는 실제 City 호환성이 검증됐다고 주장할 수 없다.
제한 사항을 명시한 develop 대상 리뷰용 PR은 사용자 승인 후 만들 수 있다.

## 변경 파일과 업로드 상태

- `engine/god/main.py`: 기존 health 유지, `/run` 등록, import 시 서버 자동 시작 방지.
- `engine/god/simulation.py`: 이번에 `simulate()` 역할 수정, `city_seed()`,
  `validate_city_reply()`, `GodService._city_init()` 추가, `run()` 초기화 연결.
- `engine/god/README.md`: 실행법, 확인 근거, 검증 결과, 미확정 사항.
- `engine/tests/test_god.py`: 상태를 저장하는 Mock City의 init/turn 및 원본 기준 회귀 검사.
- `engine/tests/test_god_http.py`: 실제 로컬 HTTP fixture에 init 추가, 초기화 실패 검사 추가.
- `engine/tests/god_reference.json`: 앞선 작업에서 만든 백엔드 동일 결과 기준 파일은 이번에 제거.

이번 검토에서 `main.py`는 추가 수정하지 않았다. 최초 작업의 기존 수정분은 그대로 남아 있다.

`feature/engine-god`에서 작업했으며 사용자 승인 전에는 커밋·Push·PR 생성을 진행하지 않는다.
PR 대상은 `develop`이고 자동 병합하지 않는다.
