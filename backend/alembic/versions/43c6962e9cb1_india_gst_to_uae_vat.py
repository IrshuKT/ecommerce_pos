"""migrate India GST schema to UAE VAT schema

Revision ID: 43c6962e9cb1
Revises: ae180acffb4e
Create Date: 2026-07-02 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '43c6962e9cb1'
down_revision: Union[str, None] = 'ae180acffb4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── vendors: gstin/pan/state/state_code -> trn/emirate ──
    op.add_column('vendors', sa.Column('trn', sa.String(length=20), nullable=True))
    op.execute("UPDATE vendors SET trn = gstin")
    op.add_column('vendors', sa.Column('emirate', sa.String(length=100), nullable=False, server_default='Dubai'))
    op.drop_column('vendors', 'gstin')
    op.drop_column('vendors', 'pan')
    op.drop_column('vendors', 'state')
    op.drop_column('vendors', 'state_code')

    # ── sales_invoices: cgst/sgst/igst -> vat_amount; billing_state/state_code -> billing_emirate; customer_gstin -> customer_trn ──
    op.add_column('sales_invoices', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE sales_invoices SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.add_column('sales_invoices', sa.Column('billing_emirate', sa.String(length=100), nullable=False, server_default='Dubai'))
    op.execute("UPDATE sales_invoices SET billing_emirate = billing_state")
    op.add_column('sales_invoices', sa.Column('customer_trn', sa.String(length=20), nullable=True))
    op.execute("UPDATE sales_invoices SET customer_trn = customer_gstin")
    op.alter_column('sales_invoices', 'billing_pincode', nullable=True)
    op.drop_column('sales_invoices', 'cgst_amount')
    op.drop_column('sales_invoices', 'sgst_amount')
    op.drop_column('sales_invoices', 'igst_amount')
    op.drop_column('sales_invoices', 'billing_state')
    op.drop_column('sales_invoices', 'billing_state_code')
    op.drop_column('sales_invoices', 'customer_gstin')
    op.drop_column('sales_invoices', 'is_interstate')

    # ── sales_invoice_items: gst_rate/cgst_rate/sgst_rate/igst_rate -> vat_rate; cgst/sgst/igst amounts -> vat_amount ──
    op.add_column('sales_invoice_items', sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='5'))
    op.execute("UPDATE sales_invoice_items SET vat_rate = gst_rate")
    op.add_column('sales_invoice_items', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE sales_invoice_items SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('sales_invoice_items', 'gst_rate')
    op.drop_column('sales_invoice_items', 'cgst_rate')
    op.drop_column('sales_invoice_items', 'sgst_rate')
    op.drop_column('sales_invoice_items', 'igst_rate')
    op.drop_column('sales_invoice_items', 'cgst_amount')
    op.drop_column('sales_invoice_items', 'sgst_amount')
    op.drop_column('sales_invoice_items', 'igst_amount')

    # ── sales_returns ──
    op.add_column('sales_returns', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE sales_returns SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('sales_returns', 'cgst_amount')
    op.drop_column('sales_returns', 'sgst_amount')
    op.drop_column('sales_returns', 'igst_amount')

    # ── sales_return_items ──
    op.add_column('sales_return_items', sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='5'))
    op.execute("UPDATE sales_return_items SET vat_rate = gst_rate")
    op.add_column('sales_return_items', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE sales_return_items SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('sales_return_items', 'gst_rate')
    op.drop_column('sales_return_items', 'cgst_amount')
    op.drop_column('sales_return_items', 'sgst_amount')
    op.drop_column('sales_return_items', 'igst_amount')

    # ── purchases ──
    op.add_column('purchases', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE purchases SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('purchases', 'cgst_amount')
    op.drop_column('purchases', 'sgst_amount')
    op.drop_column('purchases', 'igst_amount')
    op.drop_column('purchases', 'is_interstate')

    # ── purchase_items ──
    op.add_column('purchase_items', sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='5'))
    op.execute("UPDATE purchase_items SET vat_rate = gst_rate")
    op.add_column('purchase_items', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE purchase_items SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('purchase_items', 'gst_rate')
    op.drop_column('purchase_items', 'cgst_rate')
    op.drop_column('purchase_items', 'sgst_rate')
    op.drop_column('purchase_items', 'igst_rate')
    op.drop_column('purchase_items', 'cgst_amount')
    op.drop_column('purchase_items', 'sgst_amount')
    op.drop_column('purchase_items', 'igst_amount')

    # ── purchase_returns ──
    op.add_column('purchase_returns', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE purchase_returns SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('purchase_returns', 'cgst_amount')
    op.drop_column('purchase_returns', 'sgst_amount')
    op.drop_column('purchase_returns', 'igst_amount')

    # ── purchase_return_items ──
    op.add_column('purchase_return_items', sa.Column('vat_rate', sa.Numeric(5, 2), nullable=False, server_default='5'))
    op.execute("UPDATE purchase_return_items SET vat_rate = gst_rate")
    op.add_column('purchase_return_items', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE purchase_return_items SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.drop_column('purchase_return_items', 'gst_rate')
    op.drop_column('purchase_return_items', 'cgst_amount')
    op.drop_column('purchase_return_items', 'sgst_amount')
    op.drop_column('purchase_return_items', 'igst_amount')

    # ── products: gst_rate -> vat_rate ──
    op.alter_column('products', 'gst_rate', new_column_name='vat_rate', server_default='5.00')

    # ── orders: shipping_state/state_code -> shipping_emirate; cgst/sgst/igst -> vat_amount ──
    op.add_column('orders', sa.Column('shipping_emirate', sa.String(length=100), nullable=False, server_default='Dubai'))
    op.execute("UPDATE orders SET shipping_emirate = shipping_state")
    op.add_column('orders', sa.Column('vat_amount', sa.Numeric(10, 2), nullable=False, server_default='0'))
    op.execute("UPDATE orders SET vat_amount = cgst_amount + sgst_amount + igst_amount")
    op.alter_column('orders', 'shipping_pincode', nullable=True)
    op.drop_column('orders', 'shipping_state')
    op.drop_column('orders', 'shipping_state_code')
    op.drop_column('orders', 'cgst_amount')
    op.drop_column('orders', 'sgst_amount')
    op.drop_column('orders', 'igst_amount')
    op.drop_column('orders', 'is_interstate')

    # ── addresses: state/state_code -> emirate ──
    op.add_column('addresses', sa.Column('emirate', sa.String(length=100), nullable=False, server_default='Dubai'))
    op.execute("UPDATE addresses SET emirate = state")
    op.alter_column('addresses', 'pincode', nullable=True)
    op.drop_column('addresses', 'state')
    op.drop_column('addresses', 'state_code')

    # ── company_settings: state/state_code/gstin/pan/bank_ifsc -> emirate/trn/bank_iban + currency fields ──
    op.add_column('company_settings', sa.Column('emirate', sa.String(length=100), nullable=False, server_default='Dubai'))
    op.execute("UPDATE company_settings SET emirate = state")
    op.add_column('company_settings', sa.Column('trn', sa.String(length=20), nullable=True))
    op.execute("UPDATE company_settings SET trn = gstin")
    op.add_column('company_settings', sa.Column('currency_code', sa.String(length=5), nullable=False, server_default='AED'))
    op.add_column('company_settings', sa.Column('currency_symbol', sa.String(length=5), nullable=False, server_default='AED'))
    op.add_column('company_settings', sa.Column('default_vat_rate', sa.Numeric(5, 2), nullable=False, server_default='5.00'))
    op.add_column('company_settings', sa.Column('bank_iban', sa.String(length=34), nullable=True))
    op.execute("UPDATE company_settings SET country = 'United Arab Emirates'")
    op.drop_column('company_settings', 'state')
    op.drop_column('company_settings', 'state_code')
    op.drop_column('company_settings', 'gstin')
    op.drop_column('company_settings', 'pan')
    op.drop_column('company_settings', 'bank_ifsc')

    # ── gst_returns -> vat_returns ──
    op.rename_table('gst_returns', 'vat_returns')
    op.add_column('vat_returns', sa.Column('total_output_vat', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.execute("UPDATE vat_returns SET total_output_vat = total_cgst + total_sgst + total_igst")
    op.add_column('vat_returns', sa.Column('total_input_vat', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.execute("UPDATE vat_returns SET total_input_vat = itc_cgst + itc_sgst + itc_igst")
    op.add_column('vat_returns', sa.Column('net_vat_payable', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.execute("UPDATE vat_returns SET net_vat_payable = net_tax_payable")
    op.drop_constraint('uq_gst_return_period', 'vat_returns', type_='unique')
    op.create_unique_constraint('uq_vat_return_period', 'vat_returns', ['period_month', 'period_year'])
    op.drop_column('vat_returns', 'return_type')
    op.drop_column('vat_returns', 'total_cgst')
    op.drop_column('vat_returns', 'total_sgst')
    op.drop_column('vat_returns', 'total_igst')
    op.drop_column('vat_returns', 'total_tax')
    op.drop_column('vat_returns', 'itc_cgst')
    op.drop_column('vat_returns', 'itc_sgst')
    op.drop_column('vat_returns', 'itc_igst')
    op.drop_column('vat_returns', 'net_tax_payable')
    op.execute("DROP TYPE IF EXISTS gstreturntype")

    # ── chart of accounts: collapse Input IGST/CGST/SGST -> Input VAT, and CGST/SGST/IGST Payable -> VAT Payable ──
    op.execute("UPDATE accounts SET name = 'Input VAT' WHERE code = '1300'")
    op.execute("DELETE FROM accounts WHERE code IN ('1310', '1320')")
    op.execute("UPDATE accounts SET name = 'VAT Payable' WHERE code = '2100'")
    op.execute("DELETE FROM accounts WHERE code IN ('2200', '2300')")


def downgrade() -> None:
    raise NotImplementedError("This migration represents a one-way business change (India GST -> UAE VAT) and is not reversible.")
