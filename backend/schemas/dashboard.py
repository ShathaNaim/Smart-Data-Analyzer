from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.question import ChartSpec


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

    chart_spec: ChartSpec

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
    chart_spec: ChartSpec
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