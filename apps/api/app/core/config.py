"""Application settings loaded from environment variables and .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server-side configuration.

    Every secret stays here, on the server. Nothing in this class may ever be
    exposed through a VITE_* variable, because those are shipped to the browser.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    # Comma separated in the environment; use cors_origin_list in code.
    cors_origins: str = "http://localhost:5173"

    llm_provider: str = "mock"
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    deepseek_api_key: str = ""

    database_url: str = "sqlite+aiosqlite:///./data/ruleforge.db"

    rule_max_per_pack: int = 3
    rule_generations_per_day: int = 10
    rule_generation_timeout_seconds: int = 25

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def is_mock_provider(self) -> bool:
        return self.llm_provider.strip().lower() == "mock"


@lru_cache
def get_settings() -> Settings:
    return Settings()
