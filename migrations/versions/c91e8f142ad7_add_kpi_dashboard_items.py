"""add KPI dashboard items

Revision ID: c91e8f142ad7
Revises: b72f4a91c603
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c91e8f142ad7"
down_revision: Union[str, Sequence[str], None] = "b72f4a91c603"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "dashboard_items",
        sa.Column(
            "item_type",
            sa.String(length=20),
            server_default="chart",
            nullable=False,
        ),
    )
    op.add_column(
        "dashboard_items",
        sa.Column(
            "kpi_spec",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.alter_column(
        "dashboard_items",
        "chart_spec",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
    )
    op.create_check_constraint(
        "ck_dashboard_items_spec_matches_type",
        "dashboard_items",
        "(item_type = 'chart' AND chart_spec IS NOT NULL AND kpi_spec IS NULL) "
        "OR (item_type = 'kpi' AND kpi_spec IS NOT NULL AND chart_spec IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_dashboard_items_spec_matches_type",
        "dashboard_items",
        type_="check",
    )
    op.execute("DELETE FROM dashboard_items WHERE item_type = 'kpi'")
    op.alter_column(
        "dashboard_items",
        "chart_spec",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
    )
    op.drop_column("dashboard_items", "kpi_spec")
    op.drop_column("dashboard_items", "item_type")
