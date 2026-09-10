"""Store versioned AI profiles and suggestions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "8ab21c903def"
down_revision = "6d9344c6a201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dataset_ai_cache",
        sa.Column("dataset_id", sa.UUID(), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("result_type", sa.String(20), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("dataset_id", "fingerprint", "result_type"),
    )


def downgrade() -> None:
    op.drop_table("dataset_ai_cache")
