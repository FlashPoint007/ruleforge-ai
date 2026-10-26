"""End-to-end API tests for POST /rules/generate.

These run the real provider (mock) through the real compiler, so they cover the
whole pipeline rather than mocking the middle out.
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def client() -> TestClient:
    return TestClient(create_app())


def post(client: TestClient, prompt: str, level_id: str = "lab-01"):
    return client.post(
        "/api/v1/rules/generate",
        json={
            "requestId": "req-1",
            "prompt": prompt,
            "levelId": level_id,
            "locale": "zh-CN",
            "existingPackId": None,
            "dslVersion": "1.1.0",
        },
    )


def test_generates_a_ready_pack_from_a_natural_language_prompt():
    response = post(client(), "每跳一次，重力反转")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["requestId"] == "req-1"
    assert body["rulePack"]["dslVersion"] == "1.1.0"
    assert body["rulePack"]["levelId"] == "lab-01"
    assert len(body["rulePack"]["rules"]) == 1
    assert body["rulePack"]["rules"][0]["actions"][0]["op"] == "player.gravity.toggle"
    assert body["validation"]["schemaOk"] is True
    assert body["validation"]["conflictOk"] is True
    assert body["validation"]["levelCompatible"] is True


def test_every_validation_layer_is_reported():
    body = post(client(), "每跳一次，重力反转").json()

    for key in ("schemaOk", "typeOk", "semanticOk", "conflictOk", "levelCompatible"):
        assert body["validation"][key] is True


def test_unregistered_action_returns_validation_failed_not_a_500():
    response = post(client(), "非法 teleport")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "validation_failed"
    assert body["rulePack"] is None
    assert body["validation"]["schemaOk"] is False
    assert any("not registered" in error for error in body["validation"]["errors"])


def test_out_of_bounds_parameter_is_refused():
    body = post(client(), "越界 outofbounds").json()

    assert body["status"] == "validation_failed"
    assert body["validation"]["semanticOk"] is False


def test_conflicting_rules_are_refused():
    body = post(client(), "冲突 conflict").json()

    assert body["status"] == "validation_failed"
    assert body["validation"]["conflictOk"] is False


def test_unsupported_prompt_is_reported_as_unsupported():
    body = post(client(), "跳舞 dance").json()

    assert body["status"] == "unsupported"
    assert body["rulePack"] is None


def test_unknown_level_returns_400():
    response = post(client(), "每跳一次，重力反转", level_id="no-such-level")

    assert response.status_code == 400


def test_empty_prompt_is_rejected_by_request_validation():
    response = post(client(), "")

    assert response.status_code == 422


def test_a_ready_pack_always_contains_at_least_one_rule():
    body = post(client(), "每跳一次，重力反转").json()

    assert body["status"] == "ready"
    assert len(body["rulePack"]["rules"]) >= 1


def test_levels_endpoint_lists_capabilities():
    body = client().get("/api/v1/levels").json()

    assert isinstance(body, list)
    assert body[0]["id"] == "lab-01"
    assert "hideablePlatforms" in body[0]


CONTRACT_DIR = Path(__file__).resolve().parents[3] / "tests" / "golden"


def test_generated_packs_are_written_as_contract_fixtures():
    """Emits the golden files the TypeScript contract test consumes.

    The client runtime is the consumer of these packs; if the server can produce
    something the client cannot execute, that must fail here rather than in the
    browser.
    """
    CONTRACT_DIR.mkdir(parents=True, exist_ok=True)

    cases = {
        "gravity-flip": "每跳一次，重力反转",
        "enemy-slow": "敌人减速 enemy slow",
        "guarded": "条件 之后",
    }

    written = {}
    for name, prompt in cases.items():
        body = post(client(), prompt).json()
        assert body["status"] == "ready", f"{name} did not compile: {body}"
        target = CONTRACT_DIR / f"pack-{name}.json"
        target.write_text(
            json.dumps(body["rulePack"], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        written[name] = target

    assert len(written) == 3
    for path in written.values():
        assert path.is_file()
