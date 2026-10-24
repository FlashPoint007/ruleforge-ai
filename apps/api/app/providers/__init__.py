"""LLM provider boundary.

The model only ever returns controlled Rule IR. It never returns executable
code, and nothing here may be executed by the server.
"""

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class LLMProvider(Protocol):
    """Minimal contract every provider must satisfy."""

    name: str

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        """Return a candidate Rule IR object for the prompt."""
        ...


class MockLLMProvider:
    """Deterministic offline provider used for development and tests.

    It returns a fixed, clearly labelled stub. It does not compile rules and it
    never touches the network, so the whole stack works without an API key.
    """

    name = "mock"

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        return {
            "provider": self.name,
            "status": "mock",
            "note": "Deterministic stub. Rule IR compilation is not implemented yet.",
            "prompt": prompt,
            "levelId": level_id,
            "locale": locale,
            "rules": [],
        }


class DeepSeekLLMProvider:
    """Placeholder for the real DeepSeek integration (RF-001 scope boundary).

    Implementing this provider belongs to the M3 milestone. It is declared here
    so the factory has an honest, explicit failure instead of a silent fallback.
    """

    name = "deepseek"

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        raise NotImplementedError(
            "DeepSeek provider is not implemented yet (milestone M3). "
            "Use LLM_PROVIDER=mock for now."
        )


def get_provider(name: str) -> LLMProvider:
    normalized = name.strip().lower()
    if normalized == "mock":
        return MockLLMProvider()
    if normalized == "deepseek":
        return DeepSeekLLMProvider()
    raise ValueError(f"Unknown LLM provider: {name!r}. Expected 'mock' or 'deepseek'.")
