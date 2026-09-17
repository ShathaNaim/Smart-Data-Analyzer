from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

class DatasetFilterCondition(BaseModel):
    column_name: str = Field(min_length=1, max_length=255)

    operator: Literal[
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "contains",
        "in",
        "one_of",
        "none_of",
        "between",
        "is_null",
        "is_not_null",
    ]

    value: str | int | float | bool | list[str | int | float | bool] | None = None
    include_missing: bool = False

    @model_validator(mode="after")
    def validate_filter_value(self) -> "DatasetFilterCondition":
        if self.operator in ("is_null", "is_not_null"):
            if self.value is not None:
                raise ValueError(
                    "Missing-value filters do not accept a value."
                )
            return self

        if self.value is None:
            raise ValueError("This filter requires a value.")

        if self.operator in ("one_of", "none_of"):
            if not isinstance(self.value, list):
                raise ValueError("Value selection requires a list.")
        elif self.operator == "in":
            if not isinstance(self.value, list) or not self.value:
                raise ValueError(
                    "'in' requires a non-empty list of values."
                )

        elif self.operator == "between":
            if not isinstance(self.value, list) or len(self.value) != 2:
                raise ValueError(
                    "'between' requires a start and an end value."
                )

        elif isinstance(self.value, list):
            raise ValueError("This filter requires one value.")

        if self.operator == "contains" and not isinstance(self.value, str):
            raise ValueError("'contains' requires text.")

        return self


class TransformationCreate(BaseModel):
    transformation_type: Literal[
        "calculated_column",
        "rename_column",
        "hide_column",
        "trim_whitespace",
        "remove_duplicates",
        "filter_rows",
    ]
    column_name: str | None = Field(default=None, min_length=1, max_length=255)
    column_names: list[Annotated[str, Field(min_length=1, max_length=255)]] | None = Field(default=None, min_length=1, max_length=200)
    new_column_name: str | None = Field(default=None, min_length=1, max_length=255)
    expression: str | None = Field(default=None, min_length=1, max_length=1_000)
    operator: Literal["add", "subtract", "multiply", "divide"] | None = None
    right_column: str | None = None
    right_value: float | None = None
    expected_revision: str | None = None

    filters: list[DatasetFilterCondition] | None = Field(
        default=None,
        min_length=1,
        max_length=20,
    )

    @model_validator(mode="after")
    def validate_configuration(self) -> "TransformationCreate":
        if self.transformation_type == "hide_column":
            if (self.column_name is None) == (self.column_names is None):
                raise ValueError("Choose either one column or a list of columns.")
            if self.column_names and len(set(self.column_names)) != len(self.column_names):
                raise ValueError("Choose each column only once.")
        elif self.column_names is not None:
            raise ValueError("Multiple columns are supported only for removal.")
        if self.transformation_type not in ("remove_duplicates", "hide_column", "filter_rows") and not self.column_name:
            raise ValueError("Choose a column for this transformation.")
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
        if self.transformation_type == "filter_rows":
            if not self.filters:
                raise ValueError("Add at least one filter condition.")
            if self.column_name is not None:
                raise ValueError("Specify columns inside the filter conditions.")
        elif self.filters is not None:
            raise ValueError("Filter conditions are supported only for filtering rows.")
        return self

    def to_config(self) -> dict:
        return self.model_dump(exclude={"transformation_type", "expected_revision"}, exclude_none=True)


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
