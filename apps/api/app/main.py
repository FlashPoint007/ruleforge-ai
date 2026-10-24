"""FastAPI application entry point.

Run with: uv run uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title="RuleForge AI API",
        version=__version__,
        description=(
            "Controlled Rule IR generation and deterministic DSL compilation. "
            "Milestone M0: scaffolding only, no model calls and no gameplay yet."
        ),
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(api_router)
    return application


app = create_app()
