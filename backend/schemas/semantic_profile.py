from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from backend.schemas.question import StrictSchema


class SemanticColumnProfile(StrictSchema):
    name: str = Field(
        min_length=1,
        max_length=200,
    )

    semantic_type: Literal[
        "identifier",
        "category",
        "numeric_measure",
        "currency",
        "percentage",
        "count",
        "date",
        "datetime",
        "boolean",
        "status",
        "text",
        "unknown",
    ]

    business_role: str = Field(
        min_length=1,
        max_length=300,
    )

    description: str = Field(
        min_length=1,
        max_length=500,
    )

    confidence: float = Field(
        ge=0,
        le=1,
    )

    usable_as_dimension: bool
    usable_as_measure: bool

    default_aggregation: Literal[
        "sum",
        "mean",
        "median",
        "min",
        "max",
        "count",
        "nunique",
    ] | None = None

    number_format: Literal[
        "number",
        "integer",
        "currency",
        "percent",
    ] | None = None

    currency: str | None = Field(
        default=None,
        min_length=3,
        max_length=3,
    )

    assumptions: list[str] = Field(
        default_factory=list,
        max_length=5,
    )

    @model_validator(mode="after")
    def validate_format(self) -> "SemanticColumnProfile":
        if self.number_format == "currency" and self.currency is None:
            self.assumptions.append(
                "The currency code could not be determined."
            )

        if self.number_format != "currency" and self.currency is not None:
            raise ValueError(
                "Currency can only be included for a currency column."
            )

        return self


class SemanticDatasetProfile(StrictSchema):
    dataset_summary: str = Field(
        min_length=1,
        max_length=1_000,
    )

    likely_domain: str | None = Field(
        default=None,
        max_length=200,
    )

    columns: list[SemanticColumnProfile] = Field(
        min_length=1,
        max_length=200,
    )

    warnings: list[str] = Field(
        default_factory=list,
        max_length=20,
    )