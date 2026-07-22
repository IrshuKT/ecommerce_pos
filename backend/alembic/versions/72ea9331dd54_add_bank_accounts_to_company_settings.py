"""add bank_accounts to company_settings

Revision ID: 72ea9331dd54
Revises: cb49f7d1bedb
Create Date: 2026-07-21 18:24:46.756533

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '72ea9331dd54'
down_revision: Union[str, None] = 'cb49f7d1bedb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
