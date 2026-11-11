# 프론트엔드

비잔틴 도시 시뮬레이션의 실험 설정과 결과 조회 화면을 개발합니다.
React + TypeScript + Vite를 사용합니다. 실험 설정 입력·검증, 실행 요청·상태 조회, 저장된 결과 탐색과 두 실험 비교를 백엔드 API에 연결했습니다.
프론트·백엔드 API·MySQL·God·City를 Docker Compose로 함께 실행할 수 있습니다.
Mock God과 실제 God·City 모드 모두 화면에서 실험 실행·저장된 결과 조회·비교를 확인했습니다.

## 현재 화면

| 화면 | 구성 |
|---|---|
| 실험 설정 (`#/setup`) | 설정 입력·검증·초기화, 실행 요청, 진행 상태·완료 턴·평균 정확도 표시 |
| 결과 탐색 (`#/results`) | 저장된 실험 목록, 턴별 정확도 그래프·슬라이더, 도시 5개의 판단·메시지 조회 |
| 실험 비교 (`#/compare`) | 완료된 두 실험 선택, 설정·평균 정확도·턴별 그래프 비교 |

메뉴 이동, 새로고침 후 화면 유지, 브라우저 뒤로·앞으로 가기를 지원합니다.
설정 입력, 입력값 검사, 기본값 초기화를 지원합니다. 입력값은 메뉴 이동 시 유지되며 새로고침하면 초기화됩니다.
턴 수는 1~20 정수, 비잔틴 도시 수는 0~5 정수, 오류율·누락률·조작률은 0~100%입니다. 이름은 선택 입력이며 최대 50자, seed는 선택 입력이며 0~2,147,483,647 정수입니다.
`입력 확인`은 값의 형식과 범위만 검사하며 서버에 저장하거나 실험을 실행하지 않습니다.
`실험 실행`은 설정을 API에 보내고, 받은 실험 ID로 1초 간격으로 상태를 조회합니다. 실행 중에는 중복 실행을 막고 완료·실패 시 조회를 중단합니다.
상태 조회에 실패하면 `상태 다시 조회`로 같은 실험을 다시 조회합니다. 실행 요청 자체는 자동 재전송하지 않습니다.
메뉴를 이동해도 상태 조회는 유지됩니다. 새로고침하면 화면의 실행 상태는 초기화되지만 서버에서 시작한 실험은 계속 진행됩니다.
결과 탐색에서 저장된 실험을 최신순으로 조회합니다(페이지당 50개). 완료된 실험을 선택하면 턴별 정확도 그래프와 슬라이더, 선택한 턴의 도시별 판단·메시지를 확인할 수 있습니다.
목록은 결과 탐색 메뉴에 들어갈 때 또는 `새로고침`을 누를 때 갱신합니다. 실행 중·실패한 실험은 상태만 안내하며, 로딩·조회 오류·빈 목록을 구분해 표시합니다.
실험 비교에서 완료된 서로 다른 두 실험을 선택하면 설정·전체 턴 평균 정확도·턴별 정확도 그래프를 나란히 표시합니다.
두 그래프는 동일한 축을 사용하며 짧은 실험의 그래프는 해당 실험의 마지막 턴에서 끝납니다. 선택 변경 시 이전 비교 요청을 취소하고 결과를 비웁니다.
비교 선택 목록은 50개씩 조회해 완료된 실험만 표시하며, `이전 실험 더 불러오기`로 오래된 실험도 선택할 수 있습니다. 조회 실패 시 다시 조회할 수 있습니다.

## Docker Compose로 실행

Docker Desktop을 켜고 **저장소 루트**(`docker-compose.yml`이 있는 폴더)의 PowerShell에서 실행합니다.
Node.js와 pnpm은 이미지 안에서 설치하므로 PC에 따로 설치할 필요가 없습니다.

### 실제 God·City 엔진 사용

```powershell
$env:GOD_MODE = 'http'
docker compose up --build -d
docker compose ps
```

프론트·API·MySQL·God·City 5개를 함께 실행합니다. API와 MySQL이 `healthy`이고 나머지 컨테이너가 실행 중인지 확인합니다.
프론트 접속 주소: http://localhost:8080

### Mock God 사용

```powershell
$env:GOD_MODE = 'mock'
docker compose up --build -d frontend
```

프론트가 의존하는 API·MySQL도 함께 실행합니다. 접속 주소는 동일하며, 실제 God·City는 사용하지 않습니다.
`GOD_MODE`를 지정하지 않으면 공용 Compose의 기본값인 `http`(실제 God·City)를 사용합니다.
모드를 바꿀 때는 위 명령을 다시 실행해 API 컨테이너에 설정을 반영합니다.

화면을 수정한 뒤에는 저장소 루트에서 `docker compose up --build -d frontend`로 다시 빌드합니다.
자주 수정하며 개발할 때는 아래 Vite 개발 서버를 사용하면 저장 즉시 반영됩니다.

종료는 `docker compose stop`입니다. 실험 기록은 기존 MySQL 볼륨에 보관됩니다.
연결 오류가 나면 `docker compose ps`와 `docker compose logs --tail=50 frontend api god`로 상태를 확인합니다.

## Vite 개발 서버로 실행

Node.js 22.12 이상, pnpm 11.25.0이 필요합니다.

### 처음 실행할 때

터미널에서 설치 상태를 확인합니다.

```sh
node --version
npm --version
pnpm --version
```

`node` 또는 `npm`을 찾을 수 없다면 [Node.js 공식 사이트](https://nodejs.org/)에서 위 조건을 충족하는 LTS 버전을 설치하고, VS Code와 터미널을 다시 엽니다.

Windows에서 `'pnpm' is not recognized ...` 또는 `pnpm을 찾을 수 없습니다`가 나오면 다음 명령으로 프로젝트에서 사용하는 버전을 설치합니다.

```sh
npm install --global pnpm@11.25.0
pnpm --version
```

PowerShell에서 `npm.ps1` 실행 정책 오류가 나면 VS Code 터미널을 **Command Prompt(CMD)**로 열어 실행합니다.
설치 후에도 `pnpm`을 찾지 못하면 VS Code와 터미널을 다시 열고 확인합니다.
계속 같은 오류가 나면 `npm config get prefix`로 출력되는 폴더가 Windows 사용자 환경 변수 `Path`에 등록되어 있는지 확인합니다.

이미 설치된 실행 파일의 경로를 CMD의 `set "PATH=설치폴더;%PATH%"`로 추가하는 방법은 현재 터미널에서만 유효합니다. 개인 PC의 설치 경로는 팀원마다 다르므로 위 설치 방법을 기본으로 사용합니다.
설치 방법 참고: [pnpm 공식 문서](https://pnpm.io/installation).

### 개발 서버 실행

저장소 루트에서 실행합니다.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

접속 주소: http://localhost:5173

파일을 수정하고 저장하면 화면에 반영됩니다. 서버 종료는 `Ctrl+C`입니다.

## 개발 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 실행 |
| `pnpm lint` | 코드 규칙 검사 |
| `pnpm test` | 입력 검증, 요청값 변환, API 오류·응답 확인, 비교 요청 테스트 |
| `pnpm typecheck` | TypeScript 타입 검사 |
| `pnpm build` | 타입 검사 및 배포용 빌드 |
| `pnpm preview` | 빌드 결과 확인 |

## API 연결

개발 서버는 `/api`로 시작하는 요청을 백엔드로 전달합니다.

```text
/api/experiments → http://127.0.0.1:8000/experiments
```

백엔드 주소를 변경하려면 `.env.example`을 `.env.local`로 복사하고 `API_PROXY_TARGET`을 수정한 뒤 개발 서버를 다시 실행합니다.
`API_PROXY_TARGET`은 Vite 개발 서버에서만 사용합니다.
Docker 실행 시에는 Nginx가 `/api` 접두사를 제거해 Compose 내부의 `http://api:8000`으로 전달합니다.
두 방식 모두 화면의 API 호출 코드는 동일합니다.

백엔드 실행 방법은 [백엔드 README](../backend/README.md), 요청·응답 형식은 [연동 규격](../docs/spec.md)을 참고합니다.
실행에는 `POST /api/experiments`, 상태 확인에는 `GET /api/experiments/{id}`를 호출합니다. 화면의 백분율은 100으로 나눠 전송하고, 빈 이름·seed는 `null`로 전송합니다.
결과 탐색에는 `GET /api/experiments?limit=50&offset=...`, `GET /api/experiments/{id}/turns`, `GET /api/experiments/{id}/turns/{turn}`을 사용합니다.
실험 비교에는 `GET /api/experiments/compare?ids=1&ids=2`처럼 `ids`를 반복해 보냅니다. 백엔드 비교 응답의 ID를 확인해 A/B 선택에 맞춰 표시합니다.

### Mock God으로 연동 확인

Docker Desktop을 켜고 저장소 루트의 PowerShell에서 실행합니다. 공용 Compose 파일을 수정할 필요는 없습니다.

```powershell
$env:GOD_MODE = 'mock'
docker compose up --build -d mysql api
```

다른 터미널에서 프론트를 실행한 뒤 조건을 입력하고 `실험 실행`을 누릅니다. 완료 상태, 저장된 턴 수와 평균 정확도를 확인할 수 있습니다.
Mock God은 백엔드에 구현된 모의 엔진입니다. 실제 API·DB를 사용하며, 테스트 실험도 DB에 저장됩니다. Mock에서는 완료 턴이 0에서 전체 턴 수로 한 번에 바뀔 수 있습니다.

완료 후 `결과 탐색`에서 실험을 선택해 턴별 결과를 확인합니다. 완료된 실험이 두 개 이상이면 `실험 비교`에서 A·B를 선택해 설정과 정확도를 비교합니다.

## 검증 범위와 남은 작업

- `pnpm lint`, `pnpm test`(현재 10개), `pnpm build` 통과
- Mock 모드에서 브라우저 → 백엔드 API → MySQL 저장·조회 및 비교 확인
- 중복 실행·중복 비교 선택 방지, 조회 오류·재조회, 빠른 선택 변경 시 이전 응답 제외 확인
- 모바일부터 데스크톱까지 화면 배치 확인
- Compose 설정 검사, 프론트 이미지 빌드(TypeScript 검사 포함), Nginx 설정 검사 통과
- Docker 프론트(`8080`)에서 화면 및 `/api/health` 정상 응답, Mock 실험 실행·턴 탐색·비교 확인
- `GOD_MODE=http`에서 God·City 5개 상태 확인 후, 화면에서 3턴·5턴 실험 실행·완료 및 저장된 결과 조회·턴 탐색·비교 확인

위 확인은 기본 연동 흐름을 대상으로 합니다. 동시 실행·장애 상황 등 팀 전체 통합 테스트는 예정된 일정에 맞춰 별도로 진행합니다.

`pnpm test`는 자동 테스트이며 브라우저 통합 검사를 실행하는 명령은 아닙니다. 실험 데이터는 로컬 MySQL에 저장되며 Git 커밋·푸시에 포함되지 않습니다.

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.tsx` | React 시작점 |
| `src/App.tsx` | 공통 화면 구성과 메뉴 전환 |
| `src/navigation.ts` | 화면 이름과 주소 정의 |
| `src/experimentForm.ts` | 입력 기본값과 유효성 검사 |
| `src/experimentsApi.ts` | 요청값 변환, API 호출과 오류·응답 확인 |
| `src/useExperiment.ts` | 실행 요청, 상태 조회, 중복 실행 방지·재조회 |
| `src/pages/` | 설정·결과·비교 화면 |
| `src/components/` | 공통 헤더, 패널, 빈 상태, 그래프 자리 표시 |
| `src/App.css`, `src/index.css` | 화면 스타일 |
| `vite.config.ts` | 개발 서버 및 API 프록시 설정 |
| `Dockerfile` | Node에서 빌드하고 Nginx에서 화면 제공 |
| `nginx.conf` | 정적 파일 제공 및 API 프록시 설정 |
| `.dockerignore` | 로컬 의존성·빌드 결과·환경 변수 파일을 이미지 빌드에서 제외 |
| `../docker-compose.yml` | 프론트·API·DB·엔진 컨테이너 실행 |
| `.env.example` | 환경 변수 예시 |
| `pnpm-lock.yaml` | 의존성 버전 고정 |
| `tests/` | 입력 검증과 API 처리 자동 테스트 |
