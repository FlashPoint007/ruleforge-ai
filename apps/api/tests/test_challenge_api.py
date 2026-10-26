"""Challenge API tests.

These drive the real routes with an in-memory database, so the wiring between
dependency injection, the service and the repository is covered too.
"""

import pytest
from fastapi.testclient import TestClient

from app.core import deps
from app.domain.models import RulePack
from app.main import create_app
from app.repositories import (
    SqliteChallengeRepository,
    SqliteDatabase,
    SqliteRulePackRepository,
)
from app.services.challenge import ChallengeService


@pytest.fixture
def client() -> TestClient:
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    packs = SqliteRulePackRepository(database)
    challenges = SqliteChallengeRepository(database)

    service = ChallengeService(packs, challenges)

    app = create_app()
    # Both routes must resolve to the same in-memory repositories, or a pack
    # saved by /generate is invisible to /challenges.
    app.dependency_overrides[deps.get_challenge_service] = lambda: service
    app.dependency_overrides[deps.get_pack_repository] = lambda: packs
    app.dependency_overrides[deps.get_challenge_repository] = lambda: challenges

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def sample_pack(pack_id: str = "pack-api") -> RulePack:
    return RulePack.model_validate(
        {
            "dslVersion": "1.1.0",
            "engineVersion": "0.1.0",
            "packId": pack_id,
            "levelId": "lab-01",
            "levelVersion": "1.8.0",
            "seed": 0,
            "rules": [
                {
                    "id": "rule-1",
                    "trigger": {"event": "player.jumpCommitted"},
                    "conditions": [],
                    "actions": [
                        {
                            "op": "player.gravity.toggle",
                            "target": "player",
                            "params": {"magnitude": 980},
                        }
                    ],
                }
            ],
        }
    )


def seed_pack(client: TestClient, pack: RulePack) -> None:
    service: ChallengeService = client.app.dependency_overrides[deps.get_challenge_service]()
    service.save_pack(pack, owner_id="anon-test")


def test_create_challenge_returns_a_url_and_freezes_versions(client: TestClient):
    seed_pack(client, sample_pack())

    response = client.post("/api/v1/challenges", json={"packId": "pack-api"})

    assert response.status_code == 200
    body = response.json()
    assert body["challengeId"].startswith("ch_")
    assert body["url"].startswith("/c/")
    assert body["challenge"]["levelVersion"] == "1.8.0"
    assert body["challenge"]["dslVersion"] == "1.1.0"
    assert body["challenge"]["seed"] == 0


def test_get_challenge_returns_the_embedded_pack(client: TestClient):
    seed_pack(client, sample_pack())
    created = client.post("/api/v1/challenges", json={"packId": "pack-api"}).json()

    response = client.get(f"/api/v1/challenges/{created['challengeId']}")

    assert response.status_code == 200
    body = response.json()
    assert body["rulePack"]["rules"][0]["actions"][0]["op"] == "player.gravity.toggle"


def test_a_generated_pack_can_be_shared_without_extra_steps(client: TestClient):
    """Generation must persist the pack.

    This failed live: /rules/generate returned a ready pack, but the pack was
    never stored, so /challenges answered 404 for a rule the client had just been
    handed. The two endpoints are useless apart.
    """
    generated = client.post(
        "/api/v1/rules/generate",
        json={
            "requestId": "gen-1",
            "prompt": "每跳一次，重力反转",
            "levelId": "lab-01",
            "locale": "zh-CN",
            "existingPackId": None,
            "dslVersion": "1.1.0",
        },
    ).json()

    assert generated["status"] == "ready"
    pack_id = generated["rulePack"]["packId"]

    created = client.post("/api/v1/challenges", json={"packId": pack_id})

    assert created.status_code == 200
    assert created.json()["challenge"]["packId"] == pack_id


def test_unknown_pack_returns_404(client: TestClient):
    response = client.post("/api/v1/challenges", json={"packId": "pack-nope"})

    assert response.status_code == 404


def test_unknown_challenge_returns_404(client: TestClient):
    response = client.get("/api/v1/challenges/ch_missing")

    assert response.status_code == 404


def test_public_listing_hides_private_challenges(client: TestClient):
    seed_pack(client, sample_pack())
    private = client.post(
        "/api/v1/challenges", json={"packId": "pack-api", "visibility": "private"}
    ).json()
    public = client.post(
        "/api/v1/challenges", json={"packId": "pack-api", "visibility": "public"}
    ).json()

    listed = client.get("/api/v1/challenges").json()
    ids = [item["challengeId"] for item in listed]

    assert public["challengeId"] in ids
    assert private["challengeId"] not in ids


def test_anonymous_cookie_is_issued_by_the_server(client: TestClient):
    response = client.get("/api/v1/healthz")

    # The identity must come from the server, never from a client-supplied field.
    assert "rf_anon" in response.cookies or "rf_anon" in client.cookies


def test_challenge_owner_comes_from_the_cookie_not_the_body(client: TestClient):
    seed_pack(client, sample_pack())

    response = client.post(
        "/api/v1/challenges",
        json={"packId": "pack-api", "ownerId": "someone-else"},
    )

    # "ownerId" is not part of the request model, so it cannot be used to
    # impersonate; the schema rejects the extra field outright.
    assert response.status_code == 422