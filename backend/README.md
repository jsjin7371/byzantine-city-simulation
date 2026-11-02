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
│     └─ mock.py          가짜 God, 엔진 슈도코드와 같은 동작 (GOD_MODE=mock, 기본값)
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

엔진 `/run`이 완성되면 루트 `.env`에 `GOD_MODE=http`를 넣고 `docker compose up -d --build`로 전체를 띄웁니다.

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
| `GOD_MODE` | `mock` | `mock`: 가짜 God / `http`: 실제 god 컨테이너 |
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

- [ ] 11/6 규격 확정 후 `docs/spec.md`와 스키마 반영 (도시 수, 턴 전송 방식, seed)
- [ ] 엔진 `/run` 완성되면 `GOD_MODE=http`로 실제 연동 테스트
- [ ] 실험 삭제 API (`DELETE /experiments/{id}`) 필요 여부 프론트와 협의
- [ ] 동시에 여러 실험 실행 시 God이 한 번에 하나만 처리하는지 엔진과 확인
