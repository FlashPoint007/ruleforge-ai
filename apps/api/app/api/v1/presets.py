"""Local preset rule metadata.

Presets must be playable with zero API credentials, so they are read from the
repository's game-content folder instead of from a model or a database.
"""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter

router = APIRouter(tags=["content"])


def _find_presets_dir() -> Path | None:
    """Walk up from this file until a game-content/presets folder shows up."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "game-content" / "presets"
        if candidate.is_dir():
            return candidate
    return None


def load_presets() -> list[dict[str, Any]]:
    presets_dir = _find_presets_dir()
    if presets_dir is None:
        return []

    presets: list[dict[str, Any]] = []
    for path in sorted(presets_dir.glob("*.json")):
        try:
            presets.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            # A broken preset must never take the whole endpoint down.
            continue
    return presets


@router.get("/presets")
def list_presets() -> list[dict[str, Any]]:
    return load_presets()
