"""bank added is default to account

Revision ID: fbf61ae9f083
Revises: 58a4bfe0bd0b
Create Date: 2026-07-21 20:00:55.271802

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'fbf61ae9f083'
down_revision: Union[str, None] = '58a4bfe0bd0b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('accounts', sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'))
    # optional: partial unique index so DB itself guarantees only one default among active bank accounts
    op.create_index(
        'ix_accounts_single_default_bank',
        'accounts', ['is_default'],
        unique=True,
        postgresql_where=sa.text('is_bank = true AND is_default = true')
    )