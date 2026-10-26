"""Challenge endpoints.

Saving a pack and minting a challenge are separate steps on purpose: a pack is
content-addressed and reusable, a challenge is the shareable handle.
"""

from fastapi import APIRouter, HTTPException

from app.core.deps import AnonymousId, ChallengeServiceDep
from app.domain.models import (
    Challenge,
    CreateChallengeRequest,
    CreateChallengeResponse,
)
from app.services.challenge import (
    ChallengeNotFoundError,
    ChallengeService,
    PackNotFoundError,
)

router = APIRouter(tags=["challenges"])


@router.post("/challenges", response_model=CreateChallengeResponse)
def create_challenge(
    request: CreateChallengeRequest,
    owner_id: AnonymousId,
    service: ChallengeServiceDep,
) -> CreateChallengeResponse:
    try:
        challenge = service.create_challenge(
            pack_id=request.packId,
            owner_id=owner_id,
            visibility=request.visibility,
        )
    except PackNotFoundError as error:
        # 404, not 400: the pack id is a resource reference.
        raise HTTPException(status_code=404, detail=str(error)) from error

    return CreateChallengeResponse(
        challengeId=challenge.challengeId,
        url=ChallengeService.url_for(challenge.challengeId),
        challenge=challenge,
    )


@router.get("/challenges/{challenge_id}", response_model=Challenge)
def get_challenge(
    challenge_id: str,
    service: ChallengeServiceDep,
) -> Challenge:
    try:
        return service.get_challenge(challenge_id)
    except ChallengeNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/challenges", response_model=list[Challenge])
def list_challenges(
    service: ChallengeServiceDep,
    limit: int = 20,
) -> list[Challenge]:
    return service.list_public(limit=min(max(limit, 1), 100))