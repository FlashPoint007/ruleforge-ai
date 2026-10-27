"""Level capabilities, derived from the level files themselves.

Hand-maintaining this list let it drift from game-content: the server would claim
a level had collapsible platforms after the level stopped having them. Reading the
files keeps one source of truth.
"""

import json
from pathlib import Path
from typing import Any

from app.domain.models import LevelCapabilities


def _levels_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "game-content" / "levels"
        if candidate.is_dir():
            return candidate
    raise RuntimeError("game-content/levels not found; cannot build level registry")


def _capabilities(document: dict[str, Any]) -> LevelCapabilities:
    return LevelCapabilities(
        levelId=document["id"],
        levelVersion=document["version"],
        hasEnemies=len(document.get("enemies", [])) > 0,
        hasCoins=len(document.get("coins", [])) > 0,
        collapsiblePlatforms=len(document.get("crumbling", [])),
        hideablePlatforms=[item["id"] for item in document.get("hideablePlatforms", [])],
        checkpoints=[item["id"] for item in document.get("checkpoints", [])],
        enemySpawnPoints=len(document.get("enemySpawnPoints", [])),
        coinSpawnPoints=len(document.get("coinSpawnPoints", [])),
    )


def load_level_capabilities() -> dict[str, LevelCapabilities]:
    """Reads every level file and returns its capabilities, keyed by level id."""
    levels: dict[str, LevelCapabilities] = {}

    for path in sorted(_levels_dir().glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"unreadable level file {path.name}: {error}") from error

        capabilities = _capabilities(document)
        levels[capabilities.levelId] = capabilities

    if not levels:
        raise RuntimeError("no level files found in game-content/levels")

    return levels


SUPPORTED_LEVELS = load_level_capabilities()
