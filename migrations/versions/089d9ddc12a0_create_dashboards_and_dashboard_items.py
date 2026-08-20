"""create dashboards and dashboard items

Revision ID: 089d9ddc12a0
Revises: a4ed5e37f13a
Create Date: 2026-08-20 10:46:46.135283

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '089d9ddc12a0'
down_revision: Union[str, Sequence[str], None] = 'a4ed5e37f13a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
   pass

def downgrade() -> None:
   pass
