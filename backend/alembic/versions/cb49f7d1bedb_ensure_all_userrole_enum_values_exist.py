"""ensure all userrole enum values exist

Revision ID: cb49f7d1bedb
Revises: 912833856261
Create Date: 2026-07-16 16:03:16.769607

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'cb49f7d1bedb'
down_revision: Union[str, None] = '912833856261'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'customer'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'manager'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'sales_staff'")


def downgrade() -> None:
    # No native "DROP VALUE" for Postgres enums - left as a no-op.
    pass