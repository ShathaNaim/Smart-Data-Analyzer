"""add dataset description

Revision ID: e7c4a91d2f60
Revises: d1f6a82b49c0
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e7c4a91d2f60"
down_revision: str | None = "d1f6a82b49c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column("description", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("datasets", "description")