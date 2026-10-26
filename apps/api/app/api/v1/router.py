"""Versioned API surface: everything lives under /api/v1."""

from fastapi import APIRouter

from app.api.v1 import health, presets, rules

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(presets.router)
api_router.include_router(rules.router)
