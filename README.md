# 비잔틴 도시 시뮬레이션

도시 5곳(컨테이너 5개)이 각자 "대피/잔류"를 정하고 결론을 이웃과 나눌 때, 틀린 정보와 거짓말이 섞이면 판단이 어떻게 무너지는지 실험하는 시뮬레이터입니다.

> 경기대학교 2026-2 오픈소스 · 5팀 (사공우혁, 장민서, 장성진, 최서연, 우재원)

## 구조
```text
브라우저
 │
 ▼
frontend (Nginx, :8080)
 │ /api/*
 ▼
api (FastAPI, :8000) ── mysql (MySQL 8.4)
 │        ▲
 │ /run   │ /internal/experiments/{id}/turns (턴마다 결과)
 ▼        │
god ──────┘
 │ /init, /turn
 ▼
city-1 ~ city-5
```

1. 화면에서 실험을 만들면 api가 설정을 DB에 저장하고 God에 `/run`을 보냅니다.
2. God은 정답과 비잔틴 도시를 정하고, 매 턴 City 5개에 힌트와 이웃 메시지를 보냅니다. City끼리는 직접 통신하지 않고 God이 메시지를 중계합니다.
3. God은 턴이 끝날 때마다 결과를 api에 보내고, api가 DB에 저장합니다.
4. 화면은 api를 조회해 실험 상태와 턴별 결과를 보여 주고, 실험끼리 비교합니다.

자세한 규칙은 [engine/god README](engine/god/README.md), 데이터 형식은 [docs/spec.md](docs/spec.md)에 있습니다.

## 기술 스택
| 파트 | 기술 |
|---|---|
| 프론트엔드 | React 19, TypeScript, Vite, pnpm, Nginx |
| 백엔드 | Python 3.12, FastAPI, SQLAlchemy, Alembic, MySQL 8.4 |
| 엔진 | Python 3.12 표준 라이브러리 (HTTP 서버·클라이언트) |
| 실행 환경 | Docker, Docker Compose |
| CI | GitHub Actions (엔진·백엔드 테스트, 코드 스타일, 마이그레이션 검사, Docker 통신 검사, PR 제목 검사, AI 코드 리뷰) |

## 폴더
| 폴더 | 내용 |
|---|---|
| `frontend/` | 화면 |
| `backend/` | api, DB 스키마 |
| `engine/` | 시뮬레이션 (god, city) |
| `docs/` | 명세 |
| `.github/` | CI 워크플로, AI 리뷰, PR 템플릿, 브랜치 규칙 |

## 실행
Docker Desktop을 켜고 저장소 루트에서 실행합니다.

```powershell
docker compose up --build -d
docker compose ps    # api·mysql이 healthy인지 확인
```

- 화면: http://127.0.0.1:8080
- API 문서: http://127.0.0.1:8000/docs
- 종료: `docker compose stop` (실험 기록 유지)
- DB까지 초기화: `docker compose down -v`

`.env` 없이도 기본값으로 실행됩니다. DB 계정이나 `GOD_MODE`를 바꿀 때만 `.env.example`을 `.env`로 복사해 수정합니다.
폴더별 개발 실행 방법은 [frontend](frontend/README.md), [backend](backend/README.md), [engine/god](engine/god/README.md) README에 있습니다.

## 브랜치
```
feature/* → develop → release/* → main
main → hotfix/* → main, develop
```
| 브랜치 | 용도 |
|---|---|
| `main` | 배포 버전. `release/*`와 `hotfix/*`에서만 병합 |
| `release/<버전>` | 배포 전 안정화. `develop`에서 만들고 버그 수정만 한 뒤 `main`과 `develop`에 병합 |
| `develop` | 기능 통합 |
| `feature/<파트>-<기능>` | 기능 개발. `develop`에서 만든다 (예: `feature/engine-vote`) |
| `hotfix/<내용>` | 배포 버전의 긴급 수정. `main`에서 만들고 `main`과 `develop`에 병합. 진행 중인 `release/*`가 있으면 거기에도 병합 (예: `hotfix/api-crash`) |

- `main`, `develop`, `release/*`에는 직접 push하지 않고 PR로만 병합한다.
- `main`으로 가는 PR만 팀원 1명 승인이 필요하다. 나머지는 PR을 만든 사람이 병합한다.

## 커밋 메시지
`<종류>: <내용>` (예: `feat: city 투표 구현`)

종류: `feat` 기능 · `fix` 버그 · `test` 테스트 · `docs` 문서 · `refactor` 구조 개선 · `chore` 설정·CI
