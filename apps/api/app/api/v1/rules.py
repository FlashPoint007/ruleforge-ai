"""Rule generation endpoint.

Thin by design: request parsing and HTTP status mapping only. All the real work
happens in RuleGenerationService.
"""

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.domain.models import GenerateRuleRequest, GenerateRuleResponse
from app.providers import get_provider
from app.services import RuleGenerationService, UnknownLevelError

router = APIRouter(tags=["rules"])


@router.post("/rules/generate", response_model=GenerateRuleResponse)
async def generate_rule(request: GenerateRuleRequest) -> GenerateRuleResponse:
    settings = get_settings()

    try:
        provider = get_provider(settings.llm_provider)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    service = RuleGenerationService(provider)

    try:
        return await service.generate(
            request_id=request.requestId,
            prompt=request.prompt,
            level_id=request.levelId,
            locale=request.locale,
        )
    except UnknownLevelError as error:
        # 400, not 404: the level is part of the request body, not the path.
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/levels")
def list_levels() -> list[dict[str, object]]:
    """Level metadata the client needs to pick a level before generating."""
    return [
        {
            "id": level.levelId,
            "version": level.levelVersion,
            "hasEnemies": level.hasEnemies,
            "hasCoins": level.hasCoins,
            "collapsiblePlatforms": level.collapsiblePlatforms,
            "hideablePlatforms": list(level.hideablePlatforms),
            "checkpoints": list(level.checkpoints),
        }
        for level in RuleGenerationService(provider=_NullProvider()).levels()
    ]


class _NullProvider:
    """Placeholder so /levels can read the level registry without a provider."""

    name = "none"

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, object]:
        raise RuntimeError("not used")
