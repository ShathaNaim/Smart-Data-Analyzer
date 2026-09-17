"""Add dashboard theme."""

from alembic import op
import sqlalchemy as sa


revision = "f8c2d91a604b"
down_revision = "e30ee757e099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dashboards",
        sa.Column(
            "theme",
            sa.String(length=20),
            nullable=False,
            server_default="orange",
        ),
    )


def downgrade() -> None:
    op.drop_column("dashboards", "theme")