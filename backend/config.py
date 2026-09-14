from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    max_upload_size_mb: int = Field(default=25, ge=1, le=500)
    max_dataset_rows: int = Field(default=250_000, ge=1)
    max_dataset_columns: int = Field(default=200, ge=1)

    # JSON array of exact browser origins; never use '*' with credentials.
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    ai_requests_per_minute: int = Field(default=5, ge=1)
    ai_requests_per_day: int = Field(default=30, ge=1)
    ai_concurrent_requests: int = Field(default=1, ge=1)

    @property
    def max_upload_size_bytes(self) -> int:
        """Convert the configured megabyte limit into bytes."""

        return self.max_upload_size_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Create the settings object once and reuse it."""

    return Settings()
