"""Challenge service: saving packs and minting immutable share links.

Immutability rules enforced here:
- a pack is addressed by its content hash, so identical rules collapse to one row
- saving is idempotent: the same pack twice returns the same id
- a challenge freezes dsl/engine/level versions and the seed, so an old link
  keeps replaying the rule it was created with
"""

import hashlib
import json
import secrets
from datetime import UTC, datetime

from app.domain.models import Challenge, RulePack
from app.repositories.interfaces import ChallengeRepository, RulePackRepository

CHALLENGE_URL_PREFIX = "/c/"


class PackNotFoundError(Exception):
    def __init__(self, pack_id: str) -> None:
        self.pack_id = pack_id
        super().__init__(f"pack not found: {pack_id}")


class ChallengeNotFoundError(Exception):
    def __init__(self, challenge_id: str) -> None:
        self.challenge_id = challenge_id
        super().__init__(f"challenge not found: {challenge_id}")


def content_hash(pack: RulePack) -> str:
    """SHA-256 over the canonical JSON of the pack.

    Canonical means sorted keys and no whitespace, so the same rule compiled twice
    hashes identically regardless of key order.
    """
    canonical = json.dumps(pack.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class ChallengeService:
    def __init__(
        self,
        packs: RulePackRepository,
        challenges: ChallengeRepository,
        *,
        save_pack_fn=None,
        save_challenge_fn=None,
    ) -> None:
        self._packs = packs
        self._challenges = challenges

    def save_pack(self, pack: RulePack, *, owner_id: str) -> str:
        return self._packs.save_pack(pack, owner_id=owner_id, created_at=_now())  # type: ignore[call-arg]

    def get_pack(self, pack_id: str) -> RulePack:
        pack = self._packs.get_pack(pack_id)
        if pack is None:
            raise PackNotFoundError(pack_id)
        return pack

    def create_challenge(
        self, *, pack_id: str, owner_id: str, visibility: str = "unlisted"
    ) -> Challenge:
        pack = self.get_pack(pack_id)

        challenge = Challenge(
            challengeId=_new_challenge_id(),
            ownerId=owner_id,
            packId=pack.packId,
            levelId=pack.levelId,
            levelVersion=pack.levelVersion,
            engineVersion=pack.engineVersion,
            dslVersion=pack.dslVersion,
            seed=pack.seed,
            visibility=visibility,
            createdAt=_now(),
            rulePack=pack,
        )

        self._challenges.save_challenge(challenge)
        return challenge

    def get_challenge(self, challenge_id: str) -> Challenge:
        challenge = self._challenges.get_challenge(challenge_id)
        if challenge is None:
            raise ChallengeNotFoundError(challenge_id)
        return challenge

    def list_public(self, *, limit: int = 20) -> list[Challenge]:
        return self._challenges.list_public(limit=limit)

    @staticmethod
    def url_for(challenge_id: str) -> str:
        return f"{CHALLENGE_URL_PREFIX}{challenge_id}"


def _new_challenge_id() -> str:
    # URL-safe and unguessable; a challenge id is a share token, not a secret,
    # but it should not be enumerable.
    return "ch_" + secrets.token_urlsafe(12)
