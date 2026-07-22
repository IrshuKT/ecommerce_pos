"""updated receipt and payment accept expencs and income

Revision ID: f58ddc167906
Revises: 569c233f1e73
Create Date: 2026-07-22 07:54:29.497091

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f58ddc167906'
down_revision: Union[str, None] = '569c233f1e73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# alembic migration
def upgrade():
    op.add_column('receipt_vouchers', sa.Column('party_type', sa.String(20), server_default='customer', nullable=False))
    op.add_column('receipt_vouchers', sa.Column('income_account_id', sa.Integer, sa.ForeignKey('accounts.id'), nullable=True))
    op.alter_column('receipt_vouchers', 'customer_id', nullable=True)  # no longer always required

    op.add_column('payment_vouchers', sa.Column('party_type', sa.String(20), server_default='vendor', nullable=False))
    op.add_column('payment_vouchers', sa.Column('expense_account_id', sa.Integer, sa.ForeignKey('accounts.id'), nullable=True))
    op.alter_column('payment_vouchers', 'vendor_id', nullable=True)


def downgrade() -> None:
    pass
