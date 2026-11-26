# AI 시민 실행 가이드

`ai.py`는 기존 게임 입력으로 OpenAI 호환 Chat Completions API를 호출합니다.
LLM은 시민의 대피·잔류 결정, 다른 도시의 의심도, 판단 이유를 반환합니다. 게임 진행·투표·승패는 기존 God 규칙이 담당합니다.
`majority`, `wary`의 판단 코드는 사용자가 선택한 그대로 유지합니다. AI 오류 시에만 기존 wary 규칙으로 대체합니다.

## 프롬프트와 응답

태풍이 다가오는 마을의 주민으로 말하며, 의심 많은 주민은 모순에 민감하고 잘 믿는 주민은 다른 주장을 상대적으로 신뢰합니다.
`system` 메시지에는 주민 역할·성격·판단 지침·JSON 응답 형식을 넣습니다.
`user` 메시지에는 자신의 힌트·받은 주장·공유에서 확인된 모순·직전 의심도만 제공하며 정답과 사기꾼 위치는 전달하지 않습니다.
이유는 주민이 직접 말하는 한국어 한두 문장입니다. 프롬프트가 사실성을 완전히 보장하지는 않으므로 실제 대사의 근거는 별도로 확인해야 합니다.

```json
{"decision":"evacuate","suspicion":{"2":20,"3":0,"4":0,"5":0},"reason":"내 센서는 위험하대. 아직 확실하지 않지만 대피할래."}
```

위 예시는 1번 시민이 자기 외의 네 도시를 평가할 때의 형식입니다. 실제 키는 요청의 `suspicion`을 따릅니다.
필수 키는 `decision`, `suspicion`, `reason`이며 결정은 `evacuate` 또는 `stay`입니다.
기존 명세에 따라 모르는 도시 키는 버리고 누락된 도시는 직전 값을 유지합니다. 유한한 숫자는 반올림하여 0~100으로 제한합니다.
불리언·문자열 의심도는 허용하지 않습니다. `reason`은 문자열 또는 null이고 최대 200자입니다.
majority 시민의 `suspicion=null`은 별도 경로로 처리하며 변경하지 않습니다.

## Groq 연결 설정

추천 후보는 `openai/gpt-oss-20b`입니다. [공식 모델 설명](https://console.groq.com/docs/model/openai/gpt-oss-20b)에서 JSON Object·JSON Schema 지원을 확인할 수 있습니다.
[공식 요청 제한](https://console.groq.com/docs/rate-limits) 표에 30 RPM, 1K RPD, 8K TPM, 200K TPD가 기재되어 있으나 플랜·조직별 예외가 있습니다.
사용 전 콘솔의 [플랜](https://console.groq.com/settings/billing/plans)과 [실제 한도](https://console.groq.com/settings/limits)를 확인합니다.
모델을 설정했다고 무료 과금이 강제되지는 않습니다. 계정이 유료 플랜이면 사용량 과금이 발생할 수 있습니다.

[Groq 콘솔](https://console.groq.com/keys)에서 발급한 게임 전용 키를 자신의 PowerShell에서 입력합니다.
아래 입력은 화면·명령 이력에 키 문자열을 남기지 않으며 현재 PowerShell과 그 자식 프로세스에만 적용합니다. 키를 채팅에 보내지 않습니다.

```powershell
$secureKey = Read-Host 'Groq API 키' -AsSecureString
$env:LLM_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password
$secureKey.Dispose()
Remove-Variable secureKey
$env:LLM_BASE_URL = 'https://api.groq.com/openai/v1'
$env:LLM_MODEL = 'openai/gpt-oss-20b'
$env:LLM_JSON_MODE = 'json_object'
$env:LLM_TIMEOUT = '30'
$env:LLM_REASONING_EFFORT = 'low'
```

`LLM_BASE_URL`은 `/v1` 또는 `/v1/` 기본 주소와 기존 전체 `/chat/completions` 주소를 모두 지원합니다.
`LLM_MODEL`은 명시적으로 지정합니다. `LLM_JSON_MODE` 기본값은 `none`이며 JSON 모드 미지원 서버에서는 기본값을 사용합니다.
`LLM_TIMEOUT`은 0 초과 30초 이하입니다. God의 기존 AI 호출 제한 40초는 변경하지 않습니다.
요청당 출력 한도는 `max_tokens=1024`입니다. 추론 모델에서 토큰 부족으로 출력이 중단되면 정상 응답으로 간주하지 않습니다.
Groq GPT-OSS는 기본 추론량이 medium이므로 `LLM_REASONING_EFFORT=low`로 추론 토큰을 줄일 수 있습니다.
이 옵션은 선택 사항이며 기본값은 미전송입니다. 지원하지 않는 서버·모델에서는 비워 둡니다. 지원 값은 low, medium, high입니다.
근거: [Groq API의 reasoning_effort](https://console.groq.com/docs/api-reference). 낮은 추론량도 출력 중단 방지를 보장하지 않습니다.

## 오류 처리와 로그

HTTP 429·401·5xx, timeout, 잘못된 JSON, 필수 필드 누락, 빈 응답·중단된 출력은 재시도 없이 wary 결과로 대체합니다.
fallback의 이유에는 오류 종류만 표시하며 API가 돌려준 오류 원문은 사용하지 않습니다.
City 실행 로그는 다음처럼 요청·성공·대체를 구분하고 키·사용자 정보·프롬프트·응답 원문은 출력하지 않습니다.

```text
ai_turn source=api outcome=request cause=none
ai_turn source=api outcome=success cause=none
ai_turn source=api outcome=fallback cause=http_429
ai_turn source=fake outcome=fallback cause=missing_api_key
ai_turn source=test outcome=success cause=none
```

`source=api`의 `success`는 API 내용이 검증을 통과한 경우입니다. `source=fake`와 주입한 테스트 응답 `source=test`는 실제 LLM 성공에 포함하지 않습니다.
출력 문장이 제공된 정보에 충실한지까지 JSON 검증이 판정하지는 않습니다. 같은 seed여도 실제 AI 응답의 재현성은 보장되지 않습니다.

## 테스트

자동 테스트는 가짜 API 응답만 사용하므로 키가 필요하지 않습니다.

```powershell
python -m unittest discover -s engine/tests -p 'test_city_ai.py' -v
python -m unittest discover -s engine/tests -p 'test_*.py' -v
```

다음 명령은 계획만 출력하고 외부 호출을 하지 않습니다.

```powershell
python engine/tests/llm_game_smoke.py
```

플랜과 잔여 한도를 확인한 뒤, 키를 설정한 같은 PowerShell에서 명시적으로 실행합니다. 실제 API 사용량이 발생합니다.

```powershell
python engine/tests/llm_game_smoke.py --live
```

검사는 기존 Game → City AI → Groq를 실행하며 Backend·DB·City HTTP 서버는 실행하지 않습니다.
seed 42, 봇, AI 시민 4명으로 최대 15턴·60회 요청입니다. 간격은 응답 후 최소 20초이고 재시도는 없습니다.
15턴이면 대기만 약 20분이며 모델 응답 시간이 추가됩니다. 고발로 조기 종료돼도 게임 규칙을 바꾸거나 강제로 15턴을 만들지 않습니다.
첫 fallback 이후에는 나머지 외부 요청을 중단하고 미완료로 보고합니다. 운영 게임의 병렬 City 호출 방식에는 이 검사 간격을 적용하지 않습니다.
검사 자체의 추가 토큰 예산은 100,000이며, UTF-8 입력 길이와 출력 상한에 여유를 더해 다음 요청의 예산을 보수적으로 검사합니다.
요청별 토큰·응답 시간·성격·검증된 대사와 허용된 한도 헤더를 집계합니다. 잔여 요청·분당 토큰이 부족하거나 사용량이 누락되면 추가 호출을 중단합니다.
일일 토큰 잔여량을 확인한 것으로 해석하면 안 됩니다. 조직의 다른 사용량과 별도로 서비스가 반환한 429에도 중단합니다.
결과의 `real_requests`, `real_success`, `fallback`, `fallback_causes`, `total_tokens`, `requests`, `stop_reason`, `turns`, `game_over`, `fifteen_turns`, `verification_passed`를 확인합니다.
모든 호출이 실제 API 검증 성공이고 한 판이 종료된 경우만 `verification_passed=true`입니다. 키가 없으면 요청 없이 종료 코드 2로 중단합니다.

## Docker와 Ollama

기존 Compose는 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`을 City 5개에 전달합니다. 파일을 수정할 필요가 없습니다.
환경변수 변경은 기존 컨테이너에 자동 반영되지 않으므로 게임이 없는 상태에서 City를 재생성합니다.

```powershell
docker compose up -d --build --no-deps --force-recreate city-1 city-2 city-3 city-4 city-5
```

이 명령에서는 Compose에 정의된 세 변수만 전달되며 JSON 모드는 기본 `none`입니다. 선택 옵션까지 전달하는 별도 City 실행 예시는 다음과 같습니다.

```powershell
docker compose run --rm --no-deps -e CITY_ID=1 -e LLM_API_KEY -e LLM_BASE_URL -e LLM_MODEL -e LLM_JSON_MODE -e LLM_TIMEOUT city-1
```

위 별도 실행은 God과 게임 한 판을 검증하는 명령이 아닙니다. 키 값은 명령 인자에 직접 넣지 않습니다.
Ollama의 OpenAI 호환 서버에는 `LLM_BASE_URL=http://localhost:11434/v1`, 설치한 모델명을 지정할 수 있습니다.
컨테이너에서 호스트의 Ollama에 접속할 때는 `http://host.docker.internal:11434/v1`을 사용합니다.
키가 필요 없는 로컬 서버도 현재 키 존재 여부 분기를 위해 `LLM_API_KEY=ollama` 같은 로컬 표시값이 필요합니다. 실제 비밀키가 아닙니다.
Ollama의 실제 모델·JSON 모드 지원과 통신은 별도 검증이 필요합니다.

## Kubernetes 배포 담당자 협의

현재 동적 Pod에는 CITY_ID만 전달됩니다. 실제 배포 변경 전 Secret 이름과 이미지 태그, 한도 정책을 합의해야 합니다.
키는 배포할 namespace의 Secret에 별도로 등록하고, City Pod의 env에 다음 참조를 추가하는 방식을 제안합니다. 아래는 적용되지 않은 예시입니다.

```yaml
- name: LLM_API_KEY
  valueFrom:
    secretKeyRef:
      name: groq-city
      key: LLM_API_KEY
```

LLM_BASE_URL, LLM_MODEL, LLM_JSON_MODE, LLM_TIMEOUT, LLM_REASONING_EFFORT는 일반 환경변수 또는 ConfigMap으로 전달합니다.
God은 실제 키를 읽거나 게임 JSON에 포함하지 않고 Secret 참조만 Pod에 넣습니다. Secret을 저장소 YAML에 평문으로 작성하지 않습니다.
Secret 환경변수 갱신 시 City 재생성, 외부 HTTPS 통신, 최신 City 이미지 적용을 확인해야 합니다.
호출 한도는 City 전체가 공유합니다. 이 검사 도구의 직렬 대기는 실제 God의 병렬 HTTP 호출에 자동 적용되지 않습니다.
Secret·배포 설정과 Kubernetes 전체 LLM 통합 검증은 별도 협의 및 검증 대상입니다.
