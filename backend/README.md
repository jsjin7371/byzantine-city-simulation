# 백엔드 (FastAPI + MySQL)

API·God·DB 규격은 [`docs/spec.md`](../docs/spec.md)에 있습니다. 실행 후 http://127.0.0.1:8000/docs 에서 Swagger로 바로 호출해 볼 수 있습니다.

## 구조

```
backend/
├─ app/
│  ├─ main.py             앱 생성, CORS, 서버 재시작 시 중단된 실험 정리
│  ├─ config.py           환경 변수 (DATABASE_URL, GOD_MODE, N_CITIES ...)
│  ├─ db.py               DB 연결
│  ├─ models.py           테이블 4개 (experiments, turn_results, city_states, messages)
│  ├─ schemas.py          요청·응답 형식 + God 응답 검증
│  ├─ runner.py           실험 실행: God 호출 → 턴 저장 → 완료 확인 (백그라운드)
│  ├─ routers/experiments.py   /experiments API (프론트용)
│  ├─ routers/internal.py      /internal/... 턴 결과 수신 (엔진 전용)
│  └─ god/
│     ├─ client.py        실제 God 호출 (GOD_MODE=http)
│     └─ mock.py          가짜 God, 엔진 슈도코드와 같은 동작 (GOD_MODE=mock, 테스트·로컬 실행 기본값)
├─ alembic/               DB 마이그레이션
└─ tests/                 pytest
```

## 1. Docker로 실행 (권장)

저장소 루트에서. Docker Desktop이 켜져 있어야 합니다.

```powershell
docker compose up --build -d mysql api
docker compose logs -f api        # "Running upgrade -> 0001" 후 서버 시작 확인
```

- API: http://127.0.0.1:8000/docs
- MySQL: `127.0.0.1:3307` (계정 `byzantine` / `byzantine`, DB `byzantine`)
- 종료: `docker compose stop api mysql`
- DB까지 초기화: `docker compose down -v`

> 11/2 저녁 엔진 형식으로 테이블이 바뀌었습니다. 그 전에 한 번 띄운 적이 있으면 `docker compose down -v`로 DB를 한 번 초기화한 뒤 다시 실행하세요.

Compose는 기본으로 실제 엔진을 호출합니다 (`GOD_MODE=http`). 실험을 돌리려면 `docker compose up -d --build`로 God·City까지 전체를 띄웁니다.
엔진 없이 백엔드만 확인하려면 Mock 모드로 `mysql api`만 띄웁니다. 엔진이 고장 났거나 빌드가 안 될 때 쓸 수 있습니다.

```powershell
# Windows PowerShell
$env:GOD_MODE = 'mock'; docker compose up --build -d mysql api
```

```bash
# macOS / Linux
GOD_MODE=mock docker compose up --build -d mysql api
```

## 2. 로컬 실행 (코드 수정하며 개발)

Python 3.12 이상. MySQL은 Docker로 띄워 둡니다.

```powershell
docker compose up -d mysql
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

MySQL 없이 빠르게 돌려보려면 SQLite를 써도 됩니다.

```powershell
$env:DATABASE_URL = "sqlite:///./dev.db"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

## 3. 테스트

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

테스트는 임시 SQLite DB와 Mock God으로 돌아서 MySQL·엔진 없이 실행됩니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | `mysql+pymysql://byzantine:byzantine@127.0.0.1:3307/byzantine?charset=utf8mb4` | DB 주소 |
| `GOD_MODE` | Compose: `http` / 로컬 실행: `mock` | `mock`: 가짜 God / `http`: 실제 god 컨테이너 |
| `GOD_URL` | `http://god:8000` | God 주소 |
| `GOD_TIMEOUT` | `120` | God 응답 대기 시간(초) |
| `N_CITIES` | `5` | 도시 수 (god과 맞춰야 함) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | 프론트 개발 서버 주소 |

## DB 스키마를 바꿀 때

1. `app/models.py` 수정
2. `python -m alembic revision --autogenerate -m "무엇을 바꿨는지"`
3. 생성된 `alembic/versions/` 파일을 열어 확인
4. `python -m alembic upgrade head`

## 남은 일

- [x] `GOD_MODE=http`로 실제 엔진 연동 테스트 (11/11: 실험 완료, 같은 seed 재현, City 중단 시 failed 확인)
- [ ] 실험 삭제 API (`DELETE /experiments/{id}`) 필요 여부 프론트와 협의
- [x] 실험 실행 중 새 요청은 대기열 없이 `409`로 거절 (11/6 회의 결정, 11/11 구현)
