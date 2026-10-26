"""FastAPI application entry point.

Run with: uv run uvicorn app.main:app --reload --port 8000
"""

import secrets

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.deps import ANON_COOKIE


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

    @application.middleware("http")
    async def issue_anonymous_cookie(request: StarletteRequest, call_next):  # type: ignore[no-untyped-def]
        """Hands the caller a server-side anonymous id on first contact.

        The id is generated here, never accepted from the client: spec 6.3 says a
        client-supplied user id must not be treated as an identity claim.
        """
        existing = request.cookies.get(ANON_COOKIE)
        response: StarletteResponse = await call_next(request)

        # Issue the identity on first contact with any endpoint. Routes then read
        # it, so the id is stable for the whole session instead of being minted
        # independently by whichever handler happens to need it first.
        if not existing or len(existing) < 16:
            response.set_cookie(
                ANON_COOKIE,
                "anon_" + secrets.token_urlsafe(16),
                httponly=True,
                samesite="lax",
                max_age=60 * 60 * 24 * 365,
            )
        return response

    return application


app = create_app()