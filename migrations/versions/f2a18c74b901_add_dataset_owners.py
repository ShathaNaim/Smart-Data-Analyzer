"""add dataset owners

Revision ID: f2a18c74b901
Revises: e7c4a91d2f60
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f2a18c74b901"
down_revision: str | None = "e7c4a91d2f60"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column(
            "owner_id",
            sa.UUID(),
            nullable=True,
        ),
    )

    op.create_index(
        op.f("ix_datasets_owner_id"),
        "datasets",
        ["owner_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_datasets_owner_id"),
        table_name="datasets",
    )

    op.drop_column("datasets", "owner_id")