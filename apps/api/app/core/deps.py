"""Dependency wiring.

The repositories are built once per process and cached. Tests override these
providers, which is why construction lives here rather than inside the routes.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request

from app.core.config import get_settings
from app.repositories import (
    SqliteChallengeRepository,
    SqliteDatabase,
    SqliteRulePackRepository,
)
from app.services.challenge import ChallengeService

ANON_COOKIE = "rf_anon"


@lru_cache
def get_database() -> SqliteDatabase:
    return SqliteDatabase(get_settings().database_url)


@lru_cache
def get_pack_repository() -> SqliteRulePackRepository:
    return SqliteRulePackRepository(get_database())


@lru_cache
def get_challenge_repository() -> SqliteChallengeRepository:
    return SqliteChallengeRepository(get_database())


def get_challenge_service() -> ChallengeService:
    return ChallengeService(get_pack_repository(), get_challenge_repository())


def get_anonymous_id(request: Request) -> str:
    """Returns the caller's anonymous identity.

    Spec 6.3 is explicit: a client-supplied user id is not an authorization
    claim. Until real sessions exist, the identity is a server-side random value
    carried in a cookie, so a caller cannot pick someone else's id by editing a
    request body.
    """
    existing = request.cookies.get(ANON_COOKIE)
    if existing and len(existing) >= 16:
        return existing

    import secrets

    # The cookie is set by the middleware in main.py on the way out.
    new_id = "anon_" + secrets.token_urlsafe(16)
    request.state.new_anon_id = new_id
    return new_id


AnonymousId = Annotated[str, Depends(get_anonymous_id)]
PackRepositoryDep = Annotated[SqliteRulePackRepository, Depends(get_pack_repository)]
ChallengeServiceDep = Annotated[ChallengeService, Depends(get_challenge_service)]

__all__ = [
    "AnonymousId",
    "ChallengeServiceDep",
    "get_anonymous_id",
    "get_challenge_repository",
    "get_challenge_service",
    "get_database",
    "PackRepositoryDep",
    "get_pack_repository",
]