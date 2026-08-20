"""actually create dashboard tables

Revision ID: 46811d3a918f
Revises: 089d9ddc12a0
Create Date: 2026-08-20 12:04:06.685686

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '46811d3a918f'
down_revision: Union[str, Sequence[str], None] = '089d9ddc12a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
