"""Health endpoint. Must stay dependency free: no model, no database, no key."""

from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": "ruleforge-api",
        "version": __version__,
        "env": settings.app_env,
        "provider": settings.llm_provider,
    }
