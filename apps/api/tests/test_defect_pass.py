"""Regressions for the defect pass after RF-013.

Each case failed in a way that the existing suite could not see: they need a
restart, a long pause, an unreachable game, or a broken file on disk.
"""

import json
import threading

import pytest

from app.repositories import SqliteChallengeRepository, SqliteDatabase, SqliteRulePackRepository
from app.services.levels import LevelLoadError, load_level_capabilities


# --- server: level files must be validated, with a useful error -------------
def test_a_level_missing_required_fields_is_reported_by_name(tmp_path, monkeypatch):
    broken = tmp_path / "levels"
    broken.mkdir()
    (broken / "bad-01.json").write_text(json.dumps({"id": "bad-01"}), encoding="utf-8")

    import app.services.levels as levels_module

    monkeypatch.setattr(levels_module, "_levels_dir", lambda: broken)

    with pytest.raises(LevelLoadError) as error:
        load_level_capabilities()

    # Naming the file and the field is the whole point: a bare KeyError at import
    # left no way to tell which level was broken.
    assert "bad-01.json" in str(error.value)
    assert "version" in str(error.value) or "platforms" in str(error.value)


def test_a_level_with_a_wrong_list_field_is_reported(tmp_path, monkeypatch):
    broken = tmp_path / "levels"
    broken.mkdir()
    (broken / "bad-02.json").write_text(
        json.dumps(
            {
                "id": "bad-02",
                "version": "1.0.0",
                "platforms": [],
                "spawn": {"x": 1, "y": 2},
                "world": {"width": 10, "height": 10},
                "enemies": "not-a-list",
            }
        ),
        encoding="utf-8",
    )

    import app.services.levels as levels_module

    monkeypatch.setattr(levels_module, "_levels_dir", lambda: broken)

    with pytest.raises(LevelLoadError) as error:
        load_level_capabilities()

    assert "enemies" in str(error.value)


def test_invalid_json_names_the_file(tmp_path, monkeypatch):
    broken = tmp_path / "levels"
    broken.mkdir()
    (broken / "bad-03.json").write_text("{not json", encoding="utf-8")

    import app.services.levels as levels_module

    monkeypatch.setattr(levels_module, "_levels_dir", lambda: broken)

    with pytest.raises(LevelLoadError) as error:
        load_level_capabilities()

    assert "bad-03.json" in str(error.value)


def test_the_shipped_levels_still_load():
    levels = load_level_capabilities()
    assert set(levels) == {"lab-01", "lab-02"}


# --- server: concurrent writes -------------------------------------------------
def test_concurrent_pack_writes_do_not_interleave():
    """FastAPI runs sync endpoints in a thread pool over one connection.

    Without a lock, a read-modify-write sequence from two requests can interleave.
    This drives many threads at the same repository to prove the guard holds.
    """
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    packs = SqliteRulePackRepository(database)

    from app.domain.models import RulePack

    def make(index: int) -> RulePack:
        return RulePack.model_validate(
            {
                "dslVersion": "1.1.0",
                "engineVersion": "0.1.0",
                "packId": f"pack-{index}",
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

    errors: list[Exception] = []

    def worker(start: int) -> None:
        try:
            for index in range(start, start + 10):
                packs.save_pack(make(index), owner_id="anon", created_at="2026-10-27T00:00:00Z")
        except Exception as error:  # noqa: BLE001 - the failure is the signal
            errors.append(error)

    threads = [threading.Thread(target=worker, args=(base * 10,)) for base in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    # Every pack must be readable back, which fails if a commit was lost.
    assert packs.get_pack("pack-0") is not None
    assert packs.get_pack("pack-59") is not None


def test_challenge_reads_see_committed_writes():
    database = SqliteDatabase("sqlite+aiosqlite:///:memory:")
    packs = SqliteRulePackRepository(database)
    challenges = SqliteChallengeRepository(database)

    from app.domain.models import Challenge, RulePack

    pack = RulePack.model_validate(
        {
            "dslVersion": "1.1.0",
            "engineVersion": "0.1.0",
            "packId": "pack-x",
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
    packs.save_pack(pack, owner_id="anon", created_at="2026-10-27T00:00:00Z")

    challenges.save_challenge(
        Challenge(
            challengeId="ch_1",
            ownerId="anon",
            packId="pack-x",
            levelId="lab-01",
            levelVersion="1.8.0",
            engineVersion="0.1.0",
            dslVersion="1.1.0",
            seed=0,
            visibility="public",
            createdAt="2026-10-27T00:00:00Z",
        )
    )

    loaded = challenges.get_challenge("ch_1")
    assert loaded is not None
    assert loaded.rulePack is not None
