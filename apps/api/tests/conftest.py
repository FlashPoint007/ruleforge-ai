"""Shared test fixtures.

The suite must be hermetic: a developer's .env can set LLM_PROVIDER=deepseek and
DEEPSEEK_API_KEY, which would make ordinary tests hit the network. Provider is
pinned to mock here, before any app module reads settings.
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

# Pin before importing app modules that build settings.
os.environ["LLM_PROVIDER"] = "mock"
os.environ.pop("DEEPSEEK_API_KEY", None)

from app.core.config import Settings, get_settings  # noqa: E402
from app.main import create_app  # noqa: E402

# pydantic-settings reads the .env file itself, so clearing environment variables
# is not enough: a developer's .env would still inject a real key and provider.
# Pointing the env_file at a path that does not exist makes the suite hermetic.
Settings.model_config["env_file"] = ".env.does-not-exist"
# get_settings is lru_cached; anything that already built settings during import
# must be dropped so every test sees the hermetic configuration.
get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client