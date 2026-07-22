"""updated receipt and payment with status 

Revision ID: 569c233f1e73
Revises: fbf61ae9f083
Create Date: 2026-07-22 07:28:51.325860

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '569c233f1e73'
down_revision: Union[str, None] = 'fbf61ae9f083'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('receipt_vouchers', sa.Column('status', sa.String(20), server_default='active', nullable=False))
    op.add_column('payment_vouchers', sa.Column('status', sa.String(20), server_default='active', nullable=False))


def downgrade() -> None:
    pass
