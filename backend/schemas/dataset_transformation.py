from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TransformationCreate(BaseModel):
    transformation_type: Literal["calculated_column", "rename_column", "hide_column"]
    column_name: str = Field(min_length=1, max_length=255)
    new_column_name: str | None = Field(default=None, min_length=1, max_length=255)
    expression: str | None = Field(default=None, min_length=1, max_length=1_000)
    operator: Literal["add", "subtract", "multiply", "divide"] | None = None
    right_column: str | None = None
    right_value: float | None = None

    @model_validator(mode="after")
    def validate_configuration(self) -> "TransformationCreate":
        if self.transformation_type == "calculated_column":
            if not self.new_column_name:
                raise ValueError("Calculated columns require a name.")
            if self.expression is None:
                if not self.operator:
                    raise ValueError("Calculated columns require a formula.")
                if (self.right_column is None) == (self.right_value is None):
                    raise ValueError("Choose either a right-hand column or number.")
        elif self.transformation_type == "rename_column":
            if not self.new_column_name:
                raise ValueError("Renaming requires a new column name.")
        return self

    def to_config(self) -> dict:
        return self.model_dump(exclude={"transformation_type"}, exclude_none=True)


class TransformationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transformation_type: str
    config: dict
    created_at: datetime


class DatasetDetailResponse(BaseModel):
    id: uuid.UUID
    original_filename: str
    extension: str
    file_size: int
    row_count: int
    original_columns: list[str]
    columns: list[str]
    description: str | None
    created_at: datetime
    preview: list[dict[str, object | None]]
    page: int
    page_size: int
    total_pages: int
    transformations: list[TransformationResponse]
