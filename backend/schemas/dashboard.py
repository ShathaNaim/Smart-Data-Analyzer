from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.schemas.question import ChartSpec, KpiSpec


class DashboardSchema(BaseModel):
    """Base configuration shared by all dashboard schemas."""

    model_config = ConfigDict(
        extra="forbid",
        from_attributes=True,
    )


class DashboardItemSave(DashboardSchema):
    """
    A chart and its layout information sent by the frontend
    when the user saves a dashboard.
    """

    id: uuid.UUID | None = None

    title: str = Field(
        min_length=1,
        max_length=255,
    )

    item_type: Literal["chart", "kpi"] = "chart"

    chart_spec: ChartSpec | None = None

    kpi_spec: KpiSpec | None = None

    color_config: dict[str, str] = Field(
        default_factory=dict,
    )

    position_x: int = Field(
        default=0,
        ge=0,
    )

    position_y: int = Field(
        default=0,
        ge=0,
    )

    width: int = Field(
        default=6,
        ge=1,
        le=12,
    )

    height: int = Field(
        default=4,
        ge=1,
        le=20,
    )

    @model_validator(mode="after")
    def validate_item_spec(self) -> "DashboardItemSave":
        if self.item_type == "chart":
            if self.chart_spec is None or self.kpi_spec is not None:
                raise ValueError(
                    "A chart item requires chart_spec and cannot include kpi_spec."
                )

            if self.width not in {6, 12}:
                raise ValueError(
                    "A chart item width must be 6 or 12."
                )

        if self.item_type == "kpi":
            if self.kpi_spec is None or self.chart_spec is not None:
                raise ValueError(
                    "A KPI item requires kpi_spec and cannot include chart_spec."
                )

            if self.width not in {3, 6}:
                raise ValueError(
                    "A KPI item width must be 3 or 6."
                )

        return self


class DashboardCreate(DashboardSchema):
    """Request body for creating an empty dashboard."""

    dataset_id: uuid.UUID

    name: str = Field(
        default="Untitled dashboard",
        min_length=1,
        max_length=255,
    )


class DashboardSave(DashboardSchema):
    """Request body for manually saving the complete dashboard."""

    name: str = Field(
        min_length=1,
        max_length=255,
    )

    items: list[DashboardItemSave] = Field(
        default_factory=list,
        max_length=50,
    )


class DashboardItemResponse(DashboardSchema):
    """A saved dashboard item returned by the API."""

    id: uuid.UUID
    title: str
    item_type: Literal["chart", "kpi"]
    chart_spec: ChartSpec | None
    kpi_spec: KpiSpec | None
    color_config: dict[str, str]
    position_x: int
    position_y: int
    width: int
    height: int
    created_at: datetime
    updated_at: datetime


class DashboardResponse(DashboardSchema):
    """Complete dashboard returned by the API."""

    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    items: list[DashboardItemResponse]
    created_at: datetime
    updated_at: datetime
