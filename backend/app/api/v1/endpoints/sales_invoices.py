import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import date

from app.db.session import get_db
from app.models.accounting import SalesInvoice, SalesInvoiceItem, InvoiceStatus, ReceiptVoucher, Account
from app.models.models import User, OrderItem, ProductVariant, Product
from app.api.v1.endpoints.auth import get_current_user, require_backoffice, require_pos
from app.services.journal_service import (
    post_sales_invoice_journal, inv_number, post_receipt_journal, rcpt_number, _payment_mode_account,
)

from app.services.account_seeder import CASH_CUSTOMER_EMAIL
from app.services.stock_service import record_stock_transaction
from app.core.security import get_password_hash

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# HELPER — create invoice from an order (called by orders.py on confirm)
# ══════════════════════════════════════════════════════════════════════════════

async def create_invoice_from_order(db: AsyncSession, order) -> SalesInvoice:
    items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    order_items = items_result.scalars().all()
    invoice = SalesInvoice(
        invoice_number=await inv_number(db), invoice_date=date.today(),
        order_id=order.id, customer_id=order.user_id,
        billing_name=order.shipping_name, billing_phone=order.shipping_phone,
        billing_line1=order.shipping_line1, billing_line2=order.shipping_line2,
        billing_city=order.shipping_city, billing_emirate=order.shipping_emirate,
        billing_pincode=order.shipping_pincode,
        subtotal=order.subtotal, discount_amount=order.discount_amount,
        taxable_amount=order.subtotal - order.discount_amount,
        vat_amount=order.vat_amount,
        total_tax=order.vat_amount,
        shipping_charge=order.shipping_charge, round_off=Decimal("0.00"),
        grand_total=order.total_amount, balance_due=order.total_amount,
        status=InvoiceStatus.confirmed,
    )
    db.add(invoice)
    await db.flush()
    for oi in order_items:
        vat_rate = Decimal("5.00")
        taxable = oi.line_total / (1 + vat_rate / 100)
        vat = oi.line_total - taxable
        db.add(SalesInvoiceItem(
            invoice_id=invoice.id, variant_id=oi.variant_id, product_name=oi.product_name,
            quantity=Decimal(str(oi.quantity)), unit="Sqft" if oi.area_sqft else "Nos",
            unit_price=oi.unit_price, taxable_amount=taxable.quantize(Decimal("0.01")),
            vat_rate=vat_rate,
            vat_amount=vat.quantize(Decimal("0.01")),
            line_total=oi.line_total,
        ))
    await db.flush()
    journal = await post_sales_invoice_journal(db, invoice, order.user_id)
    invoice.journal_id = journal.id
    return invoice


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS — manual invoice
# ══════════════════════════════════════════════════════════════════════════════

class ManualInvoiceItem(BaseModel):
    variant_id: int
    quantity: Decimal
    unit_price: Optional[Decimal] = None
    discount_pct: Decimal = Decimal("0")
    unit: str = "Nos"


class ManualInvoicePayload(BaseModel):
    customer_id: int
    invoice_date: date
    due_date: Optional[date] = None
    customer_trn: Optional[str] = None
    shipping_charge: Decimal = Decimal("0")
    notes: Optional[str] = None
    items: List[ManualInvoiceItem]


def _calc_line(item: ManualInvoiceItem, variant: ProductVariant):
    unit_price = item.unit_price if item.unit_price is not None else variant.retail_price
    qty        = item.quantity
    disc_pct   = item.discount_pct

    subtotal       = unit_price * qty
    discount_amt   = (subtotal * disc_pct / 100).quantize(Decimal("0.01"))
    taxable_amount = subtotal - discount_amt
    vat_rate       = variant.product.vat_rate

    vat_amount = (taxable_amount * vat_rate / 100).quantize(Decimal("0.01"))
    line_total = taxable_amount + vat_amount

    return {
        "product_name": variant.product.name, "hsn_code": variant.product.hsn_code,
        "quantity": qty, "unit": item.unit, "unit_price": unit_price,
        "discount_pct": disc_pct, "taxable_amount": taxable_amount, "vat_rate": vat_rate,
        "vat_amount": vat_amount,
        "line_total": line_total,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES — STATIC PATHS FIRST (order matters!)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/")
async def list_invoices(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_backoffice),
                         status: Optional[str] = None, from_date: Optional[date] = None,
                         to_date: Optional[date] = None, page: int = Query(1, ge=1), limit: int = Query(20, le=100)):
    query = select(SalesInvoice).order_by(SalesInvoice.invoice_date.desc())
    if status: query = query.where(SalesInvoice.status == status)
    if from_date: query = query.where(SalesInvoice.invoice_date >= from_date)
    if to_date: query = query.where(SalesInvoice.invoice_date <= to_date)
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    return result.scalars().all()


@router.get("/my")
async def my_invoices(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(SalesInvoice).where(SalesInvoice.customer_id == current_user.id).order_by(SalesInvoice.invoice_date.desc()))
    return result.scalars().all()


@router.post("/manual", status_code=201)
async def create_manual_invoice(payload: ManualInvoicePayload, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(require_pos)):
    cust_r = await db.execute(select(User).where(User.id == payload.customer_id))
    customer = cust_r.scalar_one_or_none()
    if not customer:
        raise HTTPException(400, "Customer not found")

    variant_ids = [i.variant_id for i in payload.items]
    var_r = await db.execute(
        select(ProductVariant).options(selectinload(ProductVariant.product)).where(ProductVariant.id.in_(variant_ids))
    )
    variants = {v.id: v for v in var_r.scalars().all()}
    for item in payload.items:
        if item.variant_id not in variants:
            raise HTTPException(400, f"Variant id={item.variant_id} not found")

    computed_lines = []
    subtotal = discount_total = taxable_total = Decimal("0")
    vat_total = Decimal("0")
    for item in payload.items:
        variant = variants[item.variant_id]
        line = _calc_line(item, variant)
        computed_lines.append(line)
        subtotal       += line["unit_price"] * line["quantity"]
        discount_total += (line["unit_price"] * line["quantity"] * line["discount_pct"] / 100).quantize(Decimal("0.01"))
        taxable_total  += line["taxable_amount"]
        vat_total      += line["vat_amount"]

    total_tax   = vat_total
    grand_total = taxable_total + total_tax + payload.shipping_charge
    round_off   = (round(float(grand_total)) - float(grand_total))
    grand_total = grand_total + Decimal(str(round_off)).quantize(Decimal("0.01"))

    invoice = SalesInvoice(
        invoice_number=await inv_number(db), invoice_date=payload.invoice_date, due_date=payload.due_date,
        order_id=None, customer_id=customer.id, billing_name=customer.name, billing_phone=customer.phone,
        billing_line1="—", billing_city="—", billing_emirate="Dubai",
        billing_pincode=None, customer_trn=payload.customer_trn,
        subtotal=subtotal, discount_amount=discount_total, taxable_amount=taxable_total,
        vat_amount=vat_total, total_tax=total_tax,
        shipping_charge=payload.shipping_charge, round_off=Decimal(str(round_off)),
        grand_total=grand_total, balance_due=grand_total,
        status=InvoiceStatus.draft, notes=payload.notes,
    )
    db.add(invoice)
    await db.flush()
    for line in computed_lines:
        db.add(SalesInvoiceItem(invoice_id=invoice.id, **line))
    await db.commit()
    await db.refresh(invoice)
    return {"id": invoice.id, "invoice_number": invoice.invoice_number, "status": invoice.status, "grand_total": float(invoice.grand_total)}


# ══════════════════════════════════════════════════════════════════════════════
# QUICK CASH SALE — walk-in / counter sale, paid in one step
# ══════════════════════════════════════════════════════════════════════════════

class QuickSaleItem(BaseModel):
    variant_id: int
    quantity: Decimal
    unit_price: Optional[Decimal] = None
    discount_pct: Decimal = Decimal("0")
    unit: str = "Nos"


class QuickSalePayload(BaseModel):
    customer_id: Optional[int] = None      # omit for a walk-in — falls back to the Cash Customer account
    walkin_name: Optional[str] = None      # optional name to print on the receipt (e.g. "Ahmed") without creating an account
    payment_mode: str = "cash"             # "cash", "card"/"bank_transfer", etc.
    shipping_charge: Decimal = Decimal("0")
    notes: Optional[str] = None
    items: List[QuickSaleItem]


@router.post("/quick-sale", status_code=201)
async def create_quick_sale(payload: QuickSalePayload, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(require_pos)):
    """Create a counter/POS sale and mark it paid immediately — invoice,
    journal posting, and receipt all happen in one step. Used for walk-in
    customers who don't have (or don't want) an account, as well as
    existing registered/credit customers paying on the spot."""

    if payload.customer_id:
        cust_r = await db.execute(select(User).where(User.id == payload.customer_id))
        customer = cust_r.scalar_one_or_none()
        if not customer:
            raise HTTPException(400, "Customer not found")
    else:
        cust_r = await db.execute(select(User).where(User.email == CASH_CUSTOMER_EMAIL))
        customer = cust_r.scalar_one_or_none()
        if not customer:
            customer = User(
            name="Cash Customer",
            email=CASH_CUSTOMER_EMAIL,
            phone="0000000000",
            hashed_password=get_password_hash(secrets.token_urlsafe(16)),
            role="customer",
            is_active=True,
            is_verified=True,
        )
        db.add(customer)
        await db.flush() 

    variant_ids = [i.variant_id for i in payload.items]
    var_r = await db.execute(
        select(ProductVariant).options(selectinload(ProductVariant.product)).where(ProductVariant.id.in_(variant_ids))
    )
    variants = {v.id: v for v in var_r.scalars().all()}
    for item in payload.items:
        if item.variant_id not in variants:
            raise HTTPException(400, f"Variant id={item.variant_id} not found")
        if item.quantity > variants[item.variant_id].stock_qty:
            raise HTTPException(400, f"Insufficient stock for {variants[item.variant_id].product.name} (available: {variants[item.variant_id].stock_qty})")

    computed_lines = []
    subtotal = discount_total = taxable_total = vat_total = Decimal("0")
    for item in payload.items:
        variant = variants[item.variant_id]
        line = _calc_line(item, variant)
        computed_lines.append(line)
        subtotal       += line["unit_price"] * line["quantity"]
        discount_total += (line["unit_price"] * line["quantity"] * line["discount_pct"] / 100).quantize(Decimal("0.01"))
        taxable_total  += line["taxable_amount"]
        vat_total      += line["vat_amount"]

    total_tax   = vat_total
    grand_total = taxable_total + total_tax + payload.shipping_charge
    round_off   = (round(float(grand_total)) - float(grand_total))
    grand_total = grand_total + Decimal(str(round_off)).quantize(Decimal("0.01"))

    invoice = SalesInvoice(
        invoice_number=await inv_number(db), invoice_date=date.today(), due_date=None,
        order_id=None, customer_id=customer.id,
        billing_name=payload.walkin_name or customer.name, billing_phone=customer.phone,
        billing_line1="—", billing_city="—", billing_emirate="Dubai", billing_pincode=None,
        subtotal=subtotal, discount_amount=discount_total, taxable_amount=taxable_total,
        vat_amount=vat_total, total_tax=total_tax,
        shipping_charge=payload.shipping_charge, round_off=Decimal(str(round_off)),
        grand_total=grand_total, balance_due=grand_total,
        status=InvoiceStatus.confirmed, notes=payload.notes,
    )
    db.add(invoice)
    await db.flush()
    for item, line in zip(payload.items, computed_lines):
        db.add(SalesInvoiceItem(invoice_id=invoice.id, variant_id=item.variant_id, **line))
    await db.flush()

    # deduct stock for each line — this is a physical counter sale, stock leaves immediately
    for item in payload.items:
        await record_stock_transaction(
            db, variant=variants[item.variant_id], txn_type="out",
            qty=int(item.quantity),
            reference_type="sales_invoice", reference_id=invoice.invoice_number,
            note=f"Cash sale {invoice.invoice_number}",
            created_by_id=current_user.id,
        )

    invoice_journal = await post_sales_invoice_journal(db, invoice, customer.id)
    invoice.journal_id = invoice_journal.id

    # pay in full immediately
    mode_code = _payment_mode_account(payload.payment_mode)
    acc_r = await db.execute(select(Account).where(Account.code == mode_code))
    debit_account = acc_r.scalar_one_or_none()
    if not debit_account:
        raise HTTPException(400, f"Account {mode_code} not found. Run alembic upgrade head first.")

    receipt = ReceiptVoucher(
        receipt_number=await rcpt_number(db),
        receipt_date=date.today(),
        customer_id=customer.id,
        invoice_id=invoice.id,
        amount=grand_total,
        payment_mode=payload.payment_mode,
        narration=f"Cash sale {invoice.invoice_number}",
        debit_account_id=debit_account.id,
    )
    db.add(receipt)
    await db.flush()
    receipt_journal = await post_receipt_journal(db, receipt, customer.id)
    receipt.journal_id = receipt_journal.id

    invoice.amount_paid = grand_total
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.paid

    await db.commit()
    await db.refresh(invoice)

    return {
        "invoice_number": invoice.invoice_number,
        "receipt_number": receipt.receipt_number,
        "grand_total": float(invoice.grand_total),
        "status": invoice.status,
    }


@router.post("/{invoice_number:path}/confirm")
async def confirm_invoice(invoice_number: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_pos)):
    inv_r = await db.execute(select(SalesInvoice).options(selectinload(SalesInvoice.items)).where(SalesInvoice.invoice_number == invoice_number))
    invoice = inv_r.scalar_one_or_none()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status != InvoiceStatus.draft:
        raise HTTPException(400, f"Invoice is already {invoice.status} — cannot confirm again")
    if invoice.journal_id:
        raise HTTPException(400, "Journal already posted for this invoice")

    journal = await post_sales_invoice_journal(db, invoice, invoice.customer_id)
    invoice.status = InvoiceStatus.confirmed
    invoice.journal_id = journal.id
    await db.commit()
    return {"invoice_number": invoice.invoice_number, "status": invoice.status, "journal_id": journal.id, "voucher_number": journal.voucher_number}


@router.post("/{invoice_number:path}/cancel")
async def cancel_invoice(invoice_number: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_backoffice)):
    inv_r = await db.execute(select(SalesInvoice).where(SalesInvoice.invoice_number == invoice_number))
    invoice = inv_r.scalar_one_or_none()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    if invoice.status in (InvoiceStatus.paid, InvoiceStatus.partially_paid):
        raise HTTPException(400, "Cannot cancel a paid invoice — create a sales return instead")
    if invoice.status == InvoiceStatus.cancelled:
        raise HTTPException(400, "Invoice already cancelled")
    invoice.status = InvoiceStatus.cancelled
    await db.commit()
    return {"invoice_number": invoice.invoice_number, "status": "cancelled"}


# ══════════════════════════════════════════════════════════════════════════════
# GENERIC CATCH-ALL — MUST BE LAST
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{invoice_number:path}")
async def get_invoice(invoice_number: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(SalesInvoice).options(selectinload(SalesInvoice.items)).where(SalesInvoice.invoice_number == invoice_number))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if current_user.role != "admin" and invoice.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return invoice