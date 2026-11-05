# 프론트엔드

비잔틴 도시 시뮬레이션의 실험 설정과 결과 조회 화면을 개발합니다.
현재는 React + TypeScript + Vite 기반의 개발 환경과 기본 화면이 구성되어 있습니다.

## 실행 방법

Node.js 22.12 이상, pnpm 11.25.0이 필요합니다.

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
| `src/App.tsx` | 기본 화면 |
| `src/App.css`, `src/index.css` | 화면 스타일 |
| `vite.config.ts` | 개발 서버 및 API 프록시 설정 |
| `.env.example` | 환경 변수 예시 |
| `pnpm-lock.yaml` | 의존성 버전 고정 |
