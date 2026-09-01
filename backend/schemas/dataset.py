from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DatasetSummaryResponse(BaseModel):
    """Dataset metadata displayed in the workspace sidebar."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    extension: str
    file_size: int
    row_count: int
    columns: list[str]
    description: str | None
    created_at: datetime
