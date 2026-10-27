"""Level registry tests.

The registry is derived from game-content/levels rather than hand-maintained, so
these tests guard the derivation itself: a level that ships must produce coherent
capabilities, and a level the compiler validates against must be one that exists.
"""

import json
from pathlib import Path

from app.services.levels import SUPPORTED_LEVELS, load_level_capabilities

REPO_ROOT = Path(__file__).resolve().parents[3]
LEVELS_DIR = REPO_ROOT / "game-content" / "levels"


def test_both_mvp_levels_are_registered():
    assert set(SUPPORTED_LEVELS) == {"lab-01", "lab-02"}


def test_registry_matches_the_files_on_disk():
    files = {path.stem for path in LEVELS_DIR.glob("*.json")}
    assert set(SUPPORTED_LEVELS) == files


def test_capabilities_are_derived_from_content_not_hardcoded():
    for path in LEVELS_DIR.glob("*.json"):
        document = json.loads(path.read_text(encoding="utf-8"))
        capabilities = SUPPORTED_LEVELS[document["id"]]

        assert capabilities.levelVersion == document["version"]
        assert capabilities.hasEnemies == (len(document.get("enemies", [])) > 0)
        assert capabilities.hasCoins == (len(document.get("coins", [])) > 0)
        assert capabilities.collapsiblePlatforms == len(document.get("crumbling", []))
        assert capabilities.hideablePlatforms == [
            item["id"] for item in document.get("hideablePlatforms", [])
        ]
        assert capabilities.checkpoints == [item["id"] for item in document.get("checkpoints", [])]


def test_lab_02_supports_every_rule_action():
    level = SUPPORTED_LEVELS["lab-02"]

    # A level that cannot support the actions would make half the vocabulary
    # unusable, and the failure would only appear at generation time.
    assert level.hasEnemies
    assert level.hasCoins
    assert level.collapsiblePlatforms > 0
    assert level.hideablePlatforms
    assert level.checkpoints
    assert level.enemySpawnPoints > 0
    assert level.coinSpawnPoints > 0


def test_registry_is_rebuilt_from_files_each_call():
    fresh = load_level_capabilities()
    assert set(fresh) == set(SUPPORTED_LEVELS)


def test_generation_accepts_lab_02():
    from fastapi.testclient import TestClient

    from app.main import create_app

    client = TestClient(create_app())
    response = client.post(
        "/api/v1/rules/generate",
        json={
            "requestId": "lv-2",
            "prompt": "每跳一次，重力反转",
            "levelId": "lab-02",
            "locale": "zh-CN",
            "existingPackId": None,
            "dslVersion": "1.1.0",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["rulePack"]["levelId"] == "lab-02"
    assert body["rulePack"]["levelVersion"] == SUPPORTED_LEVELS["lab-02"].levelVersion


def test_unknown_level_is_still_rejected():
    from fastapi.testclient import TestClient

    from app.main import create_app

    client = TestClient(create_app())
    response = client.post(
        "/api/v1/rules/generate",
        json={
            "requestId": "lv-x",
            "prompt": "每跳一次，重力反转",
            "levelId": "lab-99",
            "locale": "zh-CN",
            "existingPackId": None,
            "dslVersion": "1.1.0",
        },
    )

    assert response.status_code == 400
