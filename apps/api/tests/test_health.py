def test_healthz_returns_ok(client):
    response = client.get("/api/v1/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ruleforge-api"
    assert body["version"] == "0.1.0"


def test_healthz_works_without_credentials(client):
    """Default configuration is mock mode, so no API key is required."""
    body = client.get("/api/v1/healthz").json()

    assert body["provider"] == "mock"
    assert body["env"] == "development"


def test_healthz_allows_the_dev_origin(client):
    response = client.get("/api/v1/healthz", headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
