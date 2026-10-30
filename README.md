# 비잔틴 도시 시뮬레이션

도시 7곳(컨테이너 7개)이 각자 "대피/잔류"를 정하고 결론을 이웃과 나눌 때, 틀린 정보와 거짓말이 섞이면 판단이 어떻게 무너지는지 실험하는 시뮬레이터입니다.

> 경기대학교 2026-2 오픈소스 · 5팀 (사공우혁, 장민서, 장성진, 최서연, 우재원)

## 폴더
| 폴더 | 내용 |
|---|---|
| `frontend/` | 화면 (React) |
| `backend/` | api (FastAPI), DB 스키마 |
| `engine/` | 시뮬레이션 (god, city) |
| `docs/` | 명세 |

## 브랜치
```
feature/* → develop → release/* → main
```
| 브랜치 | 용도 |
|---|---|
| `main` | 배포 버전. `release/*`에서만 병합 |
| `release/<버전>` | 배포 전 안정화. 버그 수정만 |
| `develop` | 기능 통합 |
| `feature/<파트>-<기능>` | 기능 개발. `develop`에서 만든다 (예: `feature/engine-vote`) |

- `main`, `develop`에는 직접 push하지 않고 PR로만 병합한다.
- PR은 팀원 1명 이상 승인 후 병합한다.

## 커밋 메시지
`<종류>: <내용>` (예: `feat: city 투표 구현`)

종류: `feat` 기능 · `fix` 버그 · `test` 테스트 · `docs` 문서 · `refactor` 구조 개선 · `chore` 설정·CI
