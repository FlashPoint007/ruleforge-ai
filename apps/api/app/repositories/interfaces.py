"""Repository interfaces.

The application layer talks to these protocols only. SQLite is a development
choice, not an architectural one: Firestore later must slot in without touching
services or routes.
"""

from typing import Protocol, runtime_checkable

from app.domain.models import Challenge, GenerationRecord, RulePack


@runtime_checkable
class RulePackRepository(Protocol):
    """Stores compiled packs. Packs are immutable once written."""

    async def save_pack(self, pack: RulePack, *, owner_id: str) -> str:
        """Persists a pack and returns its id. Saving the same content twice is a no-op."""
        ...

    async def get_pack(self, pack_id: str) -> RulePack | None: ...


@runtime_checkable
class ChallengeRepository(Protocol):
    """Stores challenges, which pin a pack plus the versions needed to replay it."""

    async def save_challenge(self, challenge: Challenge) -> str: ...

    async def get_challenge(self, challenge_id: str) -> Challenge | None: ...

    async def list_public(self, *, limit: int = 20) -> list[Challenge]: ...


@runtime_checkable
class GenerationLogRepository(Protocol):
    """Records generation attempts for quota and diagnostics.

    Stores no prompt text and no secrets: only lengths, hashes and error codes.
    """

    async def record(self, entry: GenerationRecord) -> None: ...

    async def count_for_day(self, anonymous_id: str, day: str) -> int: ...
