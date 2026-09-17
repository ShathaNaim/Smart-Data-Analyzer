from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from backend.schemas.dashboard import DashboardSchema, DashboardTheme
from backend.schemas.question import ChartSpec, KpiSpec


class DashboardShareCreate(DashboardSchema):
    theme: DashboardTheme = Field(
        default="orange",
    )
    expires_in_days: Literal[7, 30] | None = Field(
        default=None,
        description=(
            "Optional link lifetime. Null means the link does not expire."
        ),
    )


class DashboardShareCreatedResponse(DashboardSchema):
    token: str = Field(
        min_length=32,
        max_length=200,
        description=(
            "Raw share token returned only when the share link is created."
        ),
    )

    expires_at: datetime | None
    created_at: datetime


class DashboardShareRevokedResponse(DashboardSchema):
    status: Literal["revoked"] = "revoked"


class SharedDashboardItemResponse(DashboardSchema):
    title: str

    item_type: Literal[
        "chart",
        "kpi",
    ]

    chart_spec: ChartSpec | None
    kpi_spec: KpiSpec | None

    color_config: dict[str, str]

    position_x: int
    position_y: int
    width: int
    height: int


class SharedDashboardResponse(DashboardSchema):
    """
    Public read-only dashboard representation.

    Internal dashboard, dataset, and item IDs are intentionally excluded.
    """

    name: str
    theme: DashboardTheme

    items: list[SharedDashboardItemResponse] = Field(
        default_factory=list,
        max_length=50,
    )

    updated_at: datetime