# 게임별 City 동적 실행

God 한 개가 게임 시작 시 City Pod 5개와 Service 5개를 만들고, 모두 Ready 및 health 확인이 끝난 뒤 게임 상태를 반환합니다.
현재 활성 게임은 한 개입니다. 새 게임은 이전 게임의 자원을 먼저 정리하며 게임 종료 또는 City 호출 실패 시에도 정리합니다.
기존 Compose의 고정 City 주소와 게임 판단·난수 순서는 유지합니다. PR 1의 고정 배포와 별도 namespace를 사용합니다.

## 구성과 제한

- 전용 namespace는 `byzantine-engine-dynamic`으로 고정합니다. 다른 namespace에서 실행하면 시작에 실패합니다.
- `CITY_RUNTIME`의 기본값은 `compose`이며 `kubernetes`일 때만 동적 실행을 사용합니다.
- 기존 Dockerfile로 God `byzantine-god:k8s-dynamic`, City `byzantine-city:k8s-dynamic`을 빌드합니다.
- God ServiceAccount에는 이 namespace의 Pod·Service `get/create/delete`만 허용합니다. City는 API 토큰을 마운트하지 않습니다.
- API TLS 인증서와 회전되는 ServiceAccount 토큰을 사용하며, 외부 Python 패키지는 필요하지 않습니다.
- 이름에는 게임 난수와 별개인 UUID를 사용합니다. 게임 ID를 재사용해도 자원 이름이 겹치지 않습니다.
- 준비 대기는 90초이며 API 호출은 최대 5초, health는 최대 1초입니다. 생성·이전 자원 정리 시간이 별도로 추가됩니다.
- City는 게임 상태를 저장하지 않으며 종료 유예 시간은 2초입니다. 삭제 후 실제 자원이 없어질 때까지 확인합니다.
- 삭제 시 게임 소유 라벨과 UID를 확인합니다. 삭제 실패 자원은 재시도할 수 있도록 보관하고 새 게임 생성을 중단합니다.
- 잘못된 게임 설정·턴 요청은 기존 게임을 제거하지 않습니다. City 통신 실패 시 해당 게임은 더 진행할 수 없습니다.
- 종료한 게임의 최종 상태는 God 메모리에서 계속 조회할 수 있습니다.
- 게임이 없거나 정리된 상태에서 `/health`는 God의 `ok: true`와 City별 `false`를 반환합니다. 활성 게임이 있을 때만 City 5개의 연결을 검사합니다.
- 게임별 호출 주소만 바꾸므로 `/init`이 필요 없는 기존 `/games` City 규격을 사용합니다.
- 이 모드에서 `/run`은 HTTP 503입니다. Backend·DB·Frontend 연결과 AI용 비밀키 전달은 이 배포에 포함하지 않습니다.
- God 강제 종료·컨테이너 재시작 시 메모리 게임과 자원 목록은 사라집니다. 남은 City의 자동 복구·회수는 아직 지원하지 않습니다.
  게임을 방치해도 자동 종료하지 않습니다. 검사 후 아래 정리 절차로 전용 자원을 확인합니다.
- 이 Role은 Kubernetes 보안 정책으로 이름 접두사까지 제한하지는 않습니다. 전용 namespace에 다른 프로젝트를 배포하지 않습니다.
- 새 게임 준비 실패 시 이전 게임은 이미 폐기됩니다. Backend는 생성 실패를 롤백하므로, 실제 연결 전 실패 시 이전 게임 상태 처리와 `GOD_TIMEOUT` 설정을 협의해야 합니다.

## 실행

기존 클러스터와 명시적 context를 사용합니다. 아래 namespace가 이미 존재하면 소유 여부를 확인하기 전까지 중단합니다.
기존 고정 엔진, Docker Compose, 다른 namespace 및 볼륨은 정리 대상이 아닙니다.

```powershell
$kubeContext = 'docker-desktop'
kubectl --context $kubeContext get nodes
kubectl --context $kubeContext get namespace byzantine-engine-dynamic --ignore-not-found
docker build -f engine/Dockerfile.god -t byzantine-god:k8s-dynamic engine
docker build -f engine/Dockerfile.city -t byzantine-city:k8s-dynamic engine
# 클러스터 노드에서 두 이미지를 사용할 수 있어야 합니다. 별도 kind는 해당 클러스터에 이미지를 로드합니다.
kubectl --context $kubeContext apply -f deploy/kubernetes/dynamic/engine.yaml
kubectl --context $kubeContext -n byzantine-engine-dynamic wait --for=condition=Available deployment/god --timeout=120s
```

이미지 태그를 재사용하면 노드의 이전 이미지가 남을 수 있습니다. 다시 빌드한 경우 새 태그로 배포하거나 해당 클러스터의 이미지 로드 방법으로 갱신합니다.

처음에는 God Pod와 Service만 존재합니다. 게임 생성 응답은 City 준비를 기다리므로 클라이언트 시간 제한을 충분히 둡니다.

```powershell
kubectl --context $kubeContext -n byzantine-engine-dynamic exec deployment/god -- python -c 'from common.http import request; print(request("POST", "http://god:8000/games", {"game_id":1,"seed":42,"player":"bot","citizen_type":"majority"}, timeout=180))'
kubectl --context $kubeContext -n byzantine-engine-dynamic get pods,services
$OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content -Raw -Encoding UTF8 deploy/kubernetes/dynamic/game_smoke.py |
  kubectl --context $kubeContext -n byzantine-engine-dynamic exec -i deployment/god -- python -
if ($LASTEXITCODE -ne 0) { throw '동적 게임 검사 실패' }
kubectl --context $kubeContext -n byzantine-engine-dynamic get pods,services
```

생성 후 God+City Pod 총 6개, Service 총 6개인지 확인합니다. 7턴 종료 후에는 God만 남아야 합니다.
같은 설정으로 생성과 검사를 반복하면 출력된 결과 SHA256이 같아야 합니다. 다수결 시민 게임은 고발 없이 7턴을 완료합니다.
실패 시 `logs deployment/god`와 `get events --sort-by=.metadata.creationTimestamp`를 같은 namespace에서 확인합니다.

```powershell
python -m unittest discover -s engine/tests -p 'test_*.py' -v
python -m unittest discover -s deploy/kubernetes -p 'test_*.py' -v
```

## 정리

자신이 이 구성으로 만든 namespace인지 확인하고, 게임 요청을 중단한 뒤 God부터 제거합니다.
아래 City 선택자는 전용 namespace에서 이 모드가 생성한 자원에만 적용됩니다.

```powershell
kubectl --context $kubeContext -n byzantine-engine-dynamic delete deployment god
kubectl --context $kubeContext -n byzantine-engine-dynamic delete pods,services -l app.kubernetes.io/managed-by=god-dynamic
kubectl --context $kubeContext -n byzantine-engine-dynamic get all,configmap,secret,pvc
# 다른 사용자 자원이 없고 자신이 만든 검사 namespace일 때만 실행합니다.
kubectl --context $kubeContext delete -f deploy/kubernetes/dynamic/engine.yaml --ignore-not-found
```

클러스터·Docker 볼륨·PR 1의 고정 namespace는 삭제하지 않습니다.
