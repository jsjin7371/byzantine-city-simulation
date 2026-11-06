# 프론트엔드

비잔틴 도시 시뮬레이션의 실험 설정과 결과 조회 화면을 개발합니다.
React + TypeScript + Vite를 사용합니다. 현재는 실험 설정·결과 탐색·실험 비교 화면의 배치와 메뉴 이동이 구현되어 있습니다.

## 현재 화면

| 화면 | 구성 |
|---|---|
| 실험 설정 (`#/setup`) | 입력 항목, 실행 버튼, 실행 상태 영역 |
| 결과 탐색 (`#/results`) | 실험 목록, 정확도 그래프 영역, 턴 슬라이더, 도시 5개 상태 영역 |
| 실험 비교 (`#/compare`) | 실험 A·B 선택 영역, 그래프와 설정 비교 영역 |

메뉴 이동, 새로고침 후 화면 유지, 브라우저 뒤로·앞으로 가기를 지원합니다.
설정 입력, 입력값 검사, 기본값 초기화를 지원합니다. 입력값은 메뉴 이동 시 유지되며 새로고침하면 초기화됩니다.
턴 수는 1~20 정수, 비잔틴 도시 수는 0~5 정수, 오류율·누락률·조작률은 0~100%입니다. 이름은 선택 입력이며 최대 50자, seed는 선택 입력이며 0~2,147,483,647 정수입니다.
`입력 확인`은 값의 형식과 범위만 검사하며 서버에 저장하거나 실험을 실행하지 않습니다.
실행·턴 이동·비교 선택은 아직 비활성 상태입니다. API 호출은 다음 기능에서 추가합니다.
현재의 빈 화면은 서버에서 조회한 결과가 아닌, 데이터가 없을 때의 화면 구성입니다.

## 실행 방법

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
| `pnpm test` | 입력값 범위·형식 검증 테스트 |
| `pnpm typecheck` | TypeScript 타입 검사 |
| `pnpm build` | 타입 검사 및 배포용 빌드 |
| `pnpm preview` | 빌드 결과 확인 |

## API 연결

개발 서버는 `/api`로 시작하는 요청을 백엔드로 전달합니다.

```text
/api/experiments → http://127.0.0.1:8000/experiments
```

백엔드 주소를 변경하려면 `.env.example`을 `.env.local`로 복사하고 `API_PROXY_TARGET`을 수정한 뒤 개발 서버를 다시 실행합니다.
이 프록시는 개발 서버에서만 동작합니다.

백엔드 실행 방법은 [백엔드 README](../backend/README.md), 요청·응답 형식은 [연동 규격](../docs/spec.md)을 참고합니다.
실제 API 호출 기능은 아직 구현하지 않았습니다.

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/main.tsx` | React 시작점 |
| `src/App.tsx` | 공통 화면 구성과 메뉴 전환 |
| `src/navigation.ts` | 화면 이름과 주소 정의 |
| `src/pages/` | 설정·결과·비교 화면 |
| `src/components/` | 공통 헤더, 패널, 빈 상태, 그래프 자리 표시 |
| `src/App.css`, `src/index.css` | 화면 스타일 |
| `vite.config.ts` | 개발 서버 및 API 프록시 설정 |
| `.env.example` | 환경 변수 예시 |
| `pnpm-lock.yaml` | 의존성 버전 고정 |
