"""add anonymous dashboard owners

Revision ID: d1f6a82b49c0
Revises: 72b05cd6c227
Create Date: 2026-08-30 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1f6a82b49c0"
down_revision: Union[str, Sequence[str], None] = "72b05cd6c227"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable intentionally: legacy dashboards remain inaccessible instead of
    # being assigned to whichever anonymous visitor arrives first.
    op.add_column("dashboards", sa.Column("owner_id", sa.UUID(), nullable=True))
    op.create_index(
        op.f("ix_dashboards_owner_id"), "dashboards", ["owner_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dashboards_owner_id"), table_name="dashboards")
    op.drop_column("dashboards", "owner_id")
