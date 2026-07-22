"""bank added to account

Revision ID: 58a4bfe0bd0b
Revises: 72ea9331dd54
Create Date: 2026-07-21 18:52:28.279024

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '58a4bfe0bd0b'
down_revision: Union[str, None] = '72ea9331dd54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("is_bank", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.add_column(
        "accounts",
        sa.Column("bank_name", sa.String(length=150), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("account_number", sa.String(length=100), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("iban", sa.String(length=100), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("branch", sa.String(length=150), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("swift_code", sa.String(length=50), nullable=True),
    )

    op.add_column(
        "accounts",
        sa.Column("currency", sa.String(length=10), nullable=True),
    )

    # Remove the server default after existing rows are initialized
    op.alter_column("accounts", "is_bank", server_default=None)


def downgrade() -> None:
    op.drop_column("accounts", "currency")
    op.drop_column("accounts", "swift_code")
    op.drop_column("accounts", "branch")
    op.drop_column("accounts", "iban")
    op.drop_column("accounts", "account_number")
    op.drop_column("accounts", "bank_name")
    op.drop_column("accounts", "is_bank")