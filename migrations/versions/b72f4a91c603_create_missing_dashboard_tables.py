"""create missing dashboard tables

Revision ID: b72f4a91c603
Revises: 46811d3a918f
Create Date: 2026-08-20 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b72f4a91c603"
down_revision: Union[str, Sequence[str], None] = "46811d3a918f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboards",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "dashboard_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dashboard_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("chart_spec", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("color_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("position_x", sa.Integer(), nullable=False),
        sa.Column("position_y", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["dashboard_id"], ["dashboards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_dashboard_items_dashboard_id"),
        "dashboard_items",
        ["dashboard_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dashboard_items_dashboard_id"), table_name="dashboard_items")
    op.drop_table("dashboard_items")
    op.drop_table("dashboards")
