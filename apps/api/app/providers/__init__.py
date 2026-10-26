"""LLM provider boundary.

Providers are constructed through get_provider(); the deepseek implementation
lives in app/providers/deepseek.py.

The model only ever returns controlled Rule IR. It never returns executable
code, and nothing here may be executed by the server.
"""

import json
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from app.core.config import get_settings
from app.providers.deepseek import DeepSeekLLMProvider


@runtime_checkable
class LLMProvider(Protocol):
    """Minimal contract every provider must satisfy."""

    name: str

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        """Return a candidate Rule IR object for the prompt."""
        ...


class MockLLMProvider:
    """Deterministic offline provider used for development and tests.

    It maps a prompt to a fixed Rule IR document from tests/fixtures, so the whole
    pipeline — provider, compiler, validators, API — runs without an API key.

    It never touches the network and never returns executable code.
    """

    name = "mock"

    def __init__(self, fixtures_dir: Path | None = None) -> None:
        self._fixtures_dir = fixtures_dir or _default_fixtures_dir()

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        fixture = self._pick_fixture(prompt)
        if fixture is None:
            return {
                "status": "unsupported",
                "rules": [],
                "explanation": "mock 模式没有匹配到可用的规则样例，无法把这句话变成规则。",
                "warnings": ["mock provider 只认识内置样例；接入真实模型后才能处理任意描述。"],
            }

        document = json.loads(fixture.read_text(encoding="utf-8"))
        # "keywords" is fixture routing metadata, not part of the IR contract.
        document.pop("keywords", None)
        return document

    def _pick_fixture(self, prompt: str) -> Path | None:
        """Chooses a fixture by keyword, falling back to the first one available."""
        if not self._fixtures_dir.is_dir():
            return None

        available = sorted(self._fixtures_dir.glob("*.json"))
        if not available:
            return None

        lowered = prompt.lower()
        for path in available:
            try:
                document = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            keywords = document.get("keywords", [])
            if any(keyword.lower() in lowered for keyword in keywords):
                return path

        return available[0]


def _default_fixtures_dir() -> Path:
    """Finds tests/fixtures relative to the repository, not the process cwd."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "tests" / "fixtures"
        if candidate.is_dir():
            return candidate
    return Path("tests/fixtures")


def get_provider(name: str) -> LLMProvider:
    """Builds the configured provider.

    "deepseek" needs a real key; failing loudly here is better than falling back
    to mock and letting the player believe a model answered them.
    """
    normalized = name.strip().lower()

    if normalized == "mock":
        return MockLLMProvider()

    if normalized == "deepseek":
        settings = get_settings()
        return DeepSeekLLMProvider(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            model=settings.deepseek_model,
            timeout_seconds=float(settings.rule_generation_timeout_seconds),
        )

    raise ValueError(f"Unknown LLM provider: {name!r}. Expected 'mock' or 'deepseek'.")