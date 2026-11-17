def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_lists_experiment_routes(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path in ["/health", "/experiments", "/experiments/compare", "/experiments/{experiment_id}",
                 "/experiments/{experiment_id}/turns", "/experiments/{experiment_id}/turns/{turn}",
                 "/internal/experiments/{experiment_id}/turns"]:
        assert path in paths
