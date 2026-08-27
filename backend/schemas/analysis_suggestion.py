from __future__ import annotations

from pydantic import Field

from backend.schemas.question import (
    ChartAnalysisPlan,
    KpiAnalysisPlan,
    StrictSchema,
)


class KpiSuggestion(StrictSchema):
    id: str = Field(
        min_length=1,
        max_length=100,
    )

    title: str = Field(
        min_length=1,
        max_length=300,
    )

    reason: str = Field(
        min_length=1,
        max_length=500,
        description=(
            "Why this KPI is useful for the uploaded dataset."
        ),
    )

    confidence: float = Field(
        ge=0,
        le=1,
    )

    plan: KpiAnalysisPlan


class ChartSuggestion(StrictSchema):
    id: str = Field(
        min_length=1,
        max_length=100,
    )

    title: str = Field(
        min_length=1,
        max_length=300,
    )

    reason: str = Field(
        min_length=1,
        max_length=500,
        description=(
            "Why this chart is useful for the uploaded dataset."
        ),
    )

    confidence: float = Field(
        ge=0,
        le=1,
    )

    plan: ChartAnalysisPlan


class AnalysisSuggestions(StrictSchema):
    summary: str = Field(
        min_length=1,
        max_length=1_000,
        description=(
            "Short explanation of the suggested analysis strategy."
        ),
    )

    kpi_suggestions: list[KpiSuggestion] = Field(
        default_factory=list,
        max_length=4,
    )

    chart_suggestions: list[ChartSuggestion] = Field(
        default_factory=list,
        max_length=4,
    )

    warnings: list[str] = Field(
        default_factory=list,
        max_length=10,
    )