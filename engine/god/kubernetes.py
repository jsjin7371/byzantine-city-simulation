"""전용 namespace에서 게임별 City Pod와 Service를 관리하는 기능"""
import json
import os
from pathlib import Path
import ssl
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from common.http import request

NAMESPACE = "byzantine-engine-dynamic"
OWNER_LABEL = "byzantine-engine/run"
MANAGED_LABEL = "app.kubernetes.io/managed-by"
TOKEN_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")


class KubernetesAPI:
    """마운트된 ServiceAccount로 전용 namespace의 API를 호출하는 기능"""

    def __init__(self):
        self.context = ssl.create_default_context(cafile=str(TOKEN_DIR / "ca.crt"))

    def __call__(self, method, kind, name="", body=None):
        """Pod와 Service에 한정해 JSON 요청을 보내는 기능"""
        if kind not in ("pods", "services"):
            raise ValueError("Unsupported Kubernetes resource")
        path = f"/api/v1/namespaces/{NAMESPACE}/{kind}" + (f"/{name}" if name else "")
        token = (TOKEN_DIR / "token").read_text().strip()
        req = Request("https://kubernetes.default.svc" + path, method=method,
                      data=None if body is None else json.dumps(body).encode(),
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urlopen(req, context=self.context, timeout=5) as response:
                return json.load(response)
        except HTTPError as exc:
            status = exc.code
            exc.close()
            if status == 404 and method == "GET":
                return None
            raise RuntimeError(f"Kubernetes {method} {path}: HTTP {status}") from None


class CityPool:
    """한 게임에 필요한 City 5개의 생성·준비·삭제를 관리하는 기능"""

    def __init__(self, api, image, timeout=90, transport=request):
        self.api, self.image, self.timeout, self.transport = api, image, timeout, transport
        self.resources = []
        self.urls = {}
        self.owner = None

    def start(self, game_id):
        """이전 자원을 정리하고 다섯 City의 준비와 health를 확인하는 기능"""
        self.cleanup()
        self.owner = uuid4().hex
        labels = {MANAGED_LABEL: "god-dynamic", OWNER_LABEL: self.owner}
        try:
            for city in range(1, 6):
                name = f"game-{self.owner[:12]}-city-{city}"
                metadata = {"name": name, "namespace": NAMESPACE, "labels": labels,
                            "annotations": {"byzantine-engine/game-id": str(game_id)}}
                selector = {OWNER_LABEL: self.owner, "byzantine-engine/city": str(city)}
                service = {"apiVersion": "v1", "kind": "Service", "metadata": metadata,
                           "spec": {"selector": selector, "ports": [{"port": 8000, "targetPort": 8000}]}}
                pod = {"apiVersion": "v1", "kind": "Pod",
                       "metadata": {**metadata, "labels": {**labels, **selector}},
                       "spec": {"automountServiceAccountToken": False, "restartPolicy": "Never",
                                "terminationGracePeriodSeconds": 2,
                                "containers": [{"name": "city", "image": self.image,
                                                "imagePullPolicy": "IfNotPresent",
                                                "env": [{"name": "CITY_ID", "value": str(city)}],
                                                "ports": [{"containerPort": 8000}],
                                                "readinessProbe": {"httpGet": {"path": "/health", "port": 8000},
                                                                   "periodSeconds": 2, "timeoutSeconds": 2},
                                                "resources": {"requests": {"cpu": "50m", "memory": "32Mi"},
                                                              "limits": {"cpu": "500m", "memory": "128Mi"}}}]}}
                for kind, body in (("services", service), ("pods", pod)):
                    # 생성 응답이 유실된 자원도 소유 라벨을 확인해 정리한다.
                    self.resources.append((kind, name))
                    self.api("POST", kind, body=body)
                self.urls[city] = f"http://{name}:8000"
            self._wait_ready()
        except Exception as exc:
            try:
                self.cleanup()
            except Exception as cleanup_error:
                raise RuntimeError(f"City creation failed: {exc}; cleanup failed: {cleanup_error}") from exc
            raise RuntimeError(f"City creation failed: {exc}") from exc

    def _wait_ready(self):
        """제한 시간 안에 모든 Pod의 Ready와 City 식별자를 확인하는 기능"""
        deadline = time.monotonic() + self.timeout
        pending = dict(self.urls)
        while pending and time.monotonic() < deadline:
            for city, url in list(pending.items()):
                name = url.removeprefix("http://").split(":")[0]
                pod = self.api("GET", "pods", name)
                if pod is None or pod.get("status", {}).get("phase") in ("Failed", "Succeeded"):
                    raise RuntimeError(f"City {city} Pod unavailable")
                ready = any(c.get("type") == "Ready" and c.get("status") == "True"
                            for c in pod.get("status", {}).get("conditions", []))
                if ready:
                    try:
                        reply = self.transport("GET", url + "/health", timeout=1)
                        if reply == {"city": city, "ok": True}:
                            del pending[city]
                    except (OSError, ValueError):
                        pass
            if pending:
                time.sleep(0.2)
        if pending:
            raise TimeoutError(f"City readiness timed out: {sorted(pending)}")

    def cleanup(self):
        """소유 라벨과 UID를 확인해 해당 게임 자원만 삭제하는 기능"""
        self.urls = {}
        errors = []
        for kind, name in list(reversed(self.resources)):
            try:
                obj = self.api("GET", kind, name)
                if obj is not None:
                    metadata = obj["metadata"]
                    labels = metadata.get("labels", {})
                    if labels.get(OWNER_LABEL) != self.owner or labels.get(MANAGED_LABEL) != "god-dynamic":
                        raise RuntimeError(f"Refusing to delete foreign {kind}/{name}")
                    self.api("DELETE", kind, name, {"apiVersion": "v1", "kind": "DeleteOptions",
                                                   "preconditions": {"uid": metadata["uid"]}})
                    deadline = time.monotonic() + 15
                    while self.api("GET", kind, name) is not None:
                        if time.monotonic() >= deadline:
                            raise TimeoutError(f"Deletion timed out: {kind}/{name}")
                        time.sleep(0.2)
                self.resources.remove((kind, name))
            except Exception as exc:
                errors.append(str(exc))
        if errors:
            raise RuntimeError("; ".join(errors))


def configured_pool():
    """환경 변수로 Kubernetes 실행 모드를 선택하는 기능"""
    mode = os.getenv("CITY_RUNTIME", "compose")
    if mode == "compose":
        return None
    if mode != "kubernetes":
        raise ValueError("CITY_RUNTIME must be compose or kubernetes")
    namespace = (TOKEN_DIR / "namespace").read_text().strip()
    if namespace != NAMESPACE:
        raise ValueError(f"Kubernetes mode requires namespace {NAMESPACE}")
    return CityPool(KubernetesAPI(), os.environ["CITY_IMAGE"])
