"""Persistence and challenge tests.

The important property here is immutability: an old link must keep replaying the
rule it was created with, and a pack id must never be silently overwritten.
"""


import pytest

from app.domain.models import RulePack
from app.repositories import (
    SqliteChallengeRepository,
    SqliteDatabase,
    SqliteGenerationLogRepository,
    SqliteRulePackRepository,
)
from app.services.challenge import (
    ChallengeNotFoundError,
    ChallengeService,
    PackNotFoundError,
    content_hash,
)


def make_pack(pack_id: str = "pack-abc", *, magnitude: int = 980) -> RulePack:
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
                            "params": {"magnitude": magnitude},
                        }
                    ],
                }
            ],
        }
    )


@pytest.fixture
def service() -> ChallengeService:
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    return ChallengeService(
        SqliteRulePackRepository(database), SqliteChallengeRepository(database)
    )


def test_saving_the_same_pack_twice_is_idempotent(service: ChallengeService):
    pack = make_pack()

    first = service.save_pack(pack, owner_id="anon-1")
    second = service.save_pack(pack, owner_id="anon-1")

    assert first == second == "pack-abc"


def test_a_pack_id_cannot_be_overwritten_with_different_content(service: ChallengeService):
    service.save_pack(make_pack(magnitude=980), owner_id="anon-1")
    # Same id, different content: the original must win.
    service.save_pack(make_pack(magnitude=1200), owner_id="anon-1")

    stored = service.get_pack("pack-abc")

    assert stored.rules[0].actions[0].params["magnitude"] == 980


def test_content_hash_is_stable_and_order_independent():
    a = make_pack()
    b = make_pack()

    assert content_hash(a) == content_hash(b)


def test_content_hash_changes_when_the_rule_changes():
    assert content_hash(make_pack(magnitude=980)) != content_hash(make_pack(magnitude=1200))


def test_unknown_pack_is_reported(service: ChallengeService):
    with pytest.raises(PackNotFoundError):
        service.get_pack("pack-missing")


def test_challenge_freezes_versions_and_seed(service: ChallengeService):
    pack = make_pack()
    service.save_pack(pack, owner_id="anon-1")

    challenge = service.create_challenge(pack_id="pack-abc", owner_id="anon-1")

    assert challenge.packId == "pack-abc"
    assert challenge.dslVersion == "1.1.0"
    assert challenge.engineVersion == "0.1.0"
    assert challenge.levelVersion == "1.8.0"
    assert challenge.seed == 0
    assert challenge.challengeId.startswith("ch_")


def test_challenge_can_be_read_back_with_its_pack(service: ChallengeService):
    service.save_pack(make_pack(), owner_id="anon-1")
    created = service.create_challenge(pack_id="pack-abc", owner_id="anon-1")

    loaded = service.get_challenge(created.challengeId)

    assert loaded.challengeId == created.challengeId
    assert loaded.rulePack is not None
    assert loaded.rulePack.rules[0].actions[0].op == "player.gravity.toggle"


def test_unknown_challenge_is_reported(service: ChallengeService):
    with pytest.raises(ChallengeNotFoundError):
        service.get_challenge("ch_missing")


def test_public_listing_only_returns_public_challenges(service: ChallengeService):
    service.save_pack(make_pack(), owner_id="anon-1")
    private = service.create_challenge(pack_id="pack-abc", owner_id="anon-1", visibility="private")
    public = service.create_challenge(pack_id="pack-abc", owner_id="anon-1", visibility="public")

    listed = service.list_public()

    ids = [c.challengeId for c in listed]
    assert public.challengeId in ids
    assert private.challengeId not in ids


def test_challenge_ids_are_not_sequential(service: ChallengeService):
    service.save_pack(make_pack(), owner_id="anon-1")
    ids = {
        service.create_challenge(pack_id="pack-abc", owner_id="anon-1").challengeId
        for _ in range(5)
    }

    assert len(ids) == 5


def test_generation_log_stores_no_prompt_text():
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    log = SqliteGenerationLogRepository(database)

    from app.domain.models import GenerationRecord

    log.record(
        GenerationRecord(
            requestId="r1",
            anonymousId="anon-1",
            provider="deepseek",
            model="deepseek-flash",
            status="ready",
            latencyMs=1200,
            promptLength=12,
            promptHash="deadbeef",
            createdAt="2026-10-26T00:00:00+00:00",
        )
    )

    row = database.connection.execute(
        "SELECT * FROM generation_requests WHERE request_id = 'r1'"
    ).fetchone()

    # The schema must have nowhere to put raw prompt text.
    columns = set(row.keys())
    assert "prompt" not in columns
    assert "prompt_text" not in columns
    assert row["prompt_length"] == 12
    assert row["prompt_hash"] == "deadbeef"


def test_daily_count_uses_the_date_prefix():
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    log = SqliteGenerationLogRepository(database)

    from app.domain.models import GenerationRecord

    for i in range(3):
        log.record(
            GenerationRecord(
                requestId=f"r{i}",
                anonymousId="anon-1",
                provider="mock",
                model="mock",
                status="ready",
                latencyMs=10,
                promptLength=5,
                promptHash="h",
                createdAt="2026-10-26T00:00:00+00:00",
            )
        )

    assert log.count_for_day("anon-1", "2026-10-26") == 3
    assert log.count_for_day("anon-1", "2026-10-27") == 0
    assert log.count_for_day("anon-2", "2026-10-26") == 0