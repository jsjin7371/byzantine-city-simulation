# Kubernetes 고정 엔진 실행

기존 God 이미지 1개와 City 이미지로 고정 Pod 5개를 실행하고, 클러스터 내부 HTTP 통신을 검사합니다.
게임 시작에 따른 Pod 생성·삭제와 Kubernetes API 접근 코드는 포함하지 않습니다.

## 실행 구성

- namespace: `byzantine-engine-static`
- Deployment: `god`, `city-1`~`city-5`, 각각 replica 1개
- Service: 각 Deployment와 같은 이름의 ClusterIP, 포트 8000
- City 주소: `http://city-{1..5}:8000`
- 이미지: 기존 `engine/Dockerfile.god`, `engine/Dockerfile.city`로 빌드
- 모든 Pod는 Kubernetes API 토큰을 자동 마운트하지 않습니다. 동적 생성 권한은 필요 없습니다.

City의 readiness는 `/health`, God의 readiness는 TCP 8000번을 확인합니다.
God `/health`는 City까지 조회하므로 실제 연결 검사는 아래 스크립트에서 별도로 수행합니다.
Pod 교체는 `Recreate` 방식이며, God 재시작 시 진행 중 게임은 사라집니다.

백엔드·DB·프론트는 배포하지 않습니다. `/games` 게임은 God이 상태를 보관하므로 독립 검사할 수 있습니다.
`/run`은 결과를 보낼 `api:8000`이 필요하므로 이 구성만으로 정상 완료할 수 없습니다.
게임의 마피아도 포함해 City Pod는 5개지만, 판단 요청은 시민인 3~4곳에만 전송됩니다.

## 1. 기존 클러스터 확인

저장소 루트의 PowerShell에서 실행합니다. Docker와 접근 가능한 Kubernetes 클러스터가 필요합니다.
컨텍스트가 없거나 서버 연결이 안 되면 여기서 멈추고 배포 담당자에게 확인합니다.
이 명령은 클러스터를 설치하거나 현재 컨텍스트를 변경하지 않습니다.

```powershell
kubectl config get-contexts
$kubeContext = 'docker-desktop' # 위 목록에서 확인한 기존 컨텍스트로 지정
kubectl --context $kubeContext cluster-info --request-timeout=10s
```

같은 namespace에 다른 작업이 있으면 배포하지 않습니다. 신규 실행 전 아래 결과가 비어 있는지 확인합니다.
자신이 이전에 배포한 검사 환경을 다시 사용하는 경우에는 해당 자원의 소유 여부를 먼저 확인합니다.

```powershell
kubectl --context $kubeContext get namespace byzantine-engine-static --ignore-not-found
```

## 2. 기존 Dockerfile로 이미지 준비

```powershell
docker build -f engine/Dockerfile.god -t byzantine-god:k8s-static engine
docker build -f engine/Dockerfile.city -t byzantine-city:k8s-static engine
```

**클러스터 노드에서도 두 이미지가 보여야 합니다.** PC에서 빌드했다고 모든 클러스터에서 바로 사용할 수 있는 것은 아닙니다.
Docker Desktop은 사용 중인 provisioner의 이미지 공유 방식을 확인합니다.
이미 설치된 kind나 minikube를 사용할 때는 해당 클러스터에 이미지를 로드합니다.
아래 이름은 실제 기존 클러스터·프로필 이름으로 바꿉니다. 새 클러스터를 생성하는 명령은 아닙니다.

```powershell
# kind를 사용하는 경우
$kindCluster = '기존-클러스터명'
kind load docker-image byzantine-god:k8s-static byzantine-city:k8s-static --name $kindCluster

# minikube를 사용하는 경우
$minikubeProfile = '기존-프로필명'
minikube -p $minikubeProfile image load byzantine-god:k8s-static
minikube -p $minikubeProfile image load byzantine-city:k8s-static
```

매니페스트는 `IfNotPresent` 정책을 사용합니다. registry에서 받는 환경은 이미지 이름·태그와 pull 권한을 배포 담당자와 맞춥니다.
같은 태그로 이미지를 다시 빌드하면 노드의 예전 이미지가 남을 수 있으므로 다시 로드하고 검사 Deployment를 재생성합니다.

## 3. 고정 Pod 배포

```powershell
kubectl --context $kubeContext apply -f deploy/kubernetes/namespace.yaml
kubectl --context $kubeContext apply -f deploy/kubernetes/engine.yaml
kubectl --context $kubeContext -n byzantine-engine-static wait --for=condition=Available deployment --all --timeout=180s
kubectl --context $kubeContext -n byzantine-engine-static get pods,services
```

God 1개와 City 5개가 Ready인지 확인합니다. 호스트 포트, Ingress, DB 볼륨은 만들지 않습니다.

## 4. 상태·게임 통신 검사

스크립트를 God 컨테이너의 Python 표준 입력으로 전달하므로 별도 이미지 수정이나 파일 복사가 필요 없습니다.
God 안에서 City 5개의 `/health`, God `/health`, 게임 생성, 7턴 진행, 최종 상태 조회를 검사합니다.
다수결 시민은 고발 투표가 없어 7턴 통신을 끝까지 검사할 수 있습니다. 기존 게임 규칙은 바꾸지 않습니다.
준비 확인 외에는 실패한 게임·턴을 재전송하지 않으며, 오류는 0이 아닌 종료 코드로 반환됩니다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content -Raw -Encoding UTF8 deploy/kubernetes/game_smoke.py |
  kubectl --context $kubeContext -n byzantine-engine-static exec -i deployment/god -- python -
if ($LASTEXITCODE -ne 0) { throw 'Kubernetes 엔진 통신 검사 실패' }
```

성공 시 `God-City Kubernetes smoke passed: 5 City health checks, 7 game turns; no backend/DB`를 출력합니다.
전용 God에서 게임 ID 1을 사용하며 실행할 때마다 이전 게임을 대체합니다. 사용자 게임이 있는 God에서 실행하지 않습니다.
이 검사는 게임 결과의 MySQL 저장이나 Kubernetes 동적 자원 생명주기를 검증하지 않습니다.

클러스터 없이 검사 스크립트의 판정 로직과 로컬 HTTP 연결도 확인할 수 있습니다.
실패 판정 검사는 응답 대역을 사용하고, 로컬 통합 검사는 기존 테스트 도구로 실제 City 프로세스 5개와 God HTTP 서버를 실행합니다.
로컬 통합 검사는 주소만 임시 포트로 바꾸므로 Kubernetes DNS·Pod·Service 검증과 구분합니다.

```powershell
python -m unittest discover -s deploy/kubernetes -p "test_*.py" -v
python -m unittest discover -s engine/tests -p "test_*.py" -v
```

## 오류 확인

```powershell
kubectl --context $kubeContext -n byzantine-engine-static get pods
kubectl --context $kubeContext -n byzantine-engine-static describe pods
kubectl --context $kubeContext -n byzantine-engine-static logs deployment/god --tail=100
kubectl --context $kubeContext -n byzantine-engine-static logs deployment/city-1 --tail=100
kubectl --context $kubeContext -n byzantine-engine-static get events --sort-by=.metadata.creationTimestamp
```

- `ImagePullBackOff`/`ErrImagePull`: 노드의 이미지 로드 상태와 태그·pull 권한을 확인합니다.
- `Pending`: 노드 상태와 CPU·메모리 여유를 확인합니다.
- City health 불일치: `CITY_ID`, Service selector, 준비 상태를 확인합니다.
- 연결 실패: Service의 EndpointSlice와 namespace DNS, NetworkPolicy를 확인합니다.

## 정리

성공·실패 여부와 관계없이 같은 컨텍스트에서 이 설정으로 만든 자원을 정리합니다.
먼저 Deployment·Service만 삭제합니다. namespace에 다른 자원이 없다면 자신이 만든 namespace도 삭제합니다.

```powershell
kubectl --context $kubeContext delete -f deploy/kubernetes/engine.yaml --ignore-not-found
kubectl --context $kubeContext -n byzantine-engine-static get all,configmap,secret,pvc
# 이 검사를 위해 만든 namespace이며 다른 사용자 자원이 없을 때만 실행
kubectl --context $kubeContext delete -f deploy/kubernetes/namespace.yaml --ignore-not-found
```

다른 namespace, 기존 클러스터, Docker 이미지·컨테이너는 삭제하지 않습니다.
동적 생성·삭제는 다음 단계이며, 현재는 고정 자원을 위 명령으로 직접 정리합니다.
