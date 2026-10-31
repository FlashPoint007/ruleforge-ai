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


REQUIRED_LEVEL_FIELDS = ("id", "version", "platforms", "spawn", "world")


class LevelLoadError(RuntimeError):
    """A level file cannot be used.

    Raised with the file name and the offending field: a bare KeyError at import
    time left no way to tell which of several level files was broken.
    """


def _require(document: dict[str, Any], field: str, source: Path) -> Any:
    if field not in document:
        raise LevelLoadError(f"{source.name}: missing required field {field!r}")
    return document[field]


def _capabilities(document: dict[str, Any], source: Path) -> LevelCapabilities:
    for field in REQUIRED_LEVEL_FIELDS:
        _require(document, field, source)

    for list_field in ("enemies", "coins", "crumbling", "hideablePlatforms", "checkpoints"):
        value = document.get(list_field, [])
        if not isinstance(value, list):
            raise LevelLoadError(f"{source.name}: {list_field!r} must be a list")

    return LevelCapabilities(
        levelId=str(document["id"]),
        levelVersion=str(document["version"]),
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
            raise LevelLoadError(f"{path.name}: not valid JSON ({error})") from error

        capabilities = _capabilities(document, path)
        levels[capabilities.levelId] = capabilities

    if not levels:
        raise RuntimeError("no level files found in game-content/levels")

    return levels


SUPPORTED_LEVELS = load_level_capabilities()