"""add sales_staff to userrole enum

Revision ID: 912833856261
Revises: 43c6962e9cb1
Create Date: 2026-07-16 16:00:50.012847

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '912833856261'
down_revision: Union[str, None] = '43c6962e9cb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE can't run inside Alembic's normal transaction
    # on Postgres, so it needs an autocommit block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'sales_staff'")


def downgrade() -> None:
    # Postgres has no direct "DROP VALUE" for enums - reverting would mean
    # rebuilding the whole type. Left as a no-op to avoid data loss on any
    # rows that already use 'sales_staff'.
    pass