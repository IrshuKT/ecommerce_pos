"""
Purchase, Purchase Return, Receipt Voucher, Payment Voucher, Vendors endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import date

from app.db.session import get_db
from app.models.accounting import (
    Vendor, Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem,
    ReceiptVoucher, PaymentVoucher, SalesInvoice,Account,Journal,JournalLine,
    PurchaseStatus, ReturnStatus, VendorStatus
)
from app.models.models import User
from app.api.v1.endpoints.auth import get_current_user, require_backoffice
from app.services.journal_service import (
    post_purchase_journal, post_purchase_return_journal,
    post_receipt_journal, post_payment_journal,
    purch_number, rcpt_number, pay_number, dn_number, pr_number
)
from app.core.config import settings
from app.models.accounting import Account, AccountType




# ── Vendors ──────────────────────────────

vendors_router = APIRouter()
accounting_router = APIRouter()

class VendorIn(BaseModel):
    name: str
    code: str
    trn: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    emirate: str = "Dubai"
    pincode: Optional[str] = None
    credit_days: int = 30
    credit_limit: Optional[Decimal] = None
    notes: Optional[str] = None


@vendors_router.get("/")
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
    search: Optional[str] = None,
):
    query = select(Vendor).where(Vendor.status == VendorStatus.active).order_by(Vendor.name)
    if search:
        query = query.where(Vendor.name.ilike(f"%{search}%"))
    result = await db.execute(query)
    return result.scalars().all()


@vendors_router.post("/", status_code=201)
async def create_vendor(
    payload: VendorIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    existing = await db.execute(select(Vendor).where(Vendor.code == payload.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Vendor code already exists")
    vendor = Vendor(**payload.model_dump())
    db.add(vendor)
    await db.flush()
    return {"id": vendor.id, "code": vendor.code, "name": vendor.name}


@vendors_router.get("/{vendor_id}")
async def get_vendor(
    vendor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


@vendors_router.patch("/{vendor_id}")
async def update_vendor(
    vendor_id: int,
    payload: VendorIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(vendor, k, v)
    return {"message": "Vendor updated"}


# ── Purchases ────────────────────────────

purchase_router = APIRouter()


class PurchaseItemIn(BaseModel):
    variant_id: Optional[int] = None
    product_name: str
    hsn_code: Optional[str] = None
    quantity: Decimal
    unit: str = "Nos"
    unit_price: Decimal
    discount_pct: Decimal = Decimal("0")
    vat_rate: Decimal = Decimal("5")


class PurchaseIn(BaseModel):
    vendor_id: int
    purchase_date: date
    vendor_invoice_number: Optional[str] = None
    vendor_invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    items: List[PurchaseItemIn]


def _calc_item(item: PurchaseItemIn):
    gross = (item.unit_price * item.quantity).quantize(Decimal("0.01"))
    discount = (gross * item.discount_pct / 100).quantize(Decimal("0.01"))
    taxable = gross - discount
    vat = (taxable * item.vat_rate / 100).quantize(Decimal("0.01"))
    return gross, taxable, vat, (taxable + vat).quantize(Decimal("0.01"))


@purchase_router.post("/", status_code=201)
async def create_purchase(
    payload: PurchaseIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    vendor_result = await db.execute(select(Vendor).where(Vendor.id == payload.vendor_id))
    vendor = vendor_result.scalar_one_or_none()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    purchase = Purchase(
        purchase_number= await purch_number(db),
        vendor_id=payload.vendor_id,
        purchase_date=payload.purchase_date,
        vendor_invoice_number=payload.vendor_invoice_number,
        vendor_invoice_date=payload.vendor_invoice_date,
        due_date=payload.due_date,
        notes=payload.notes,
        status=PurchaseStatus.draft,
    )
    db.add(purchase)
    await db.flush()

    subtotal = taxable_total = vat_t = grand_total = Decimal("0")

    for item in payload.items:
        gross, taxable, vat, line_total = _calc_item(item)
        db.add(PurchaseItem(
            purchase_id=purchase.id,
            variant_id=item.variant_id,
            product_name=item.product_name,
            hsn_code=item.hsn_code,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            discount_pct=item.discount_pct,
            taxable_amount=taxable,
            vat_rate=item.vat_rate,
            vat_amount=vat,
            line_total=line_total,
        ))
        subtotal += gross
        taxable_total += taxable
        vat_t += vat
        grand_total += line_total

    purchase.subtotal = subtotal
    purchase.taxable_amount = taxable_total
    purchase.vat_amount = vat_t
    purchase.total_tax = vat_t
    purchase.grand_total = grand_total
    purchase.balance_due = grand_total
    purchase.status = PurchaseStatus.ordered

    journal = await post_purchase_journal(db, purchase, payload.vendor_id)
    purchase.journal_id = journal.id

    await db.commit()
    return {"purchase_number": purchase.purchase_number, "grand_total": str(grand_total)}


@purchase_router.get("/")
async def list_purchases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
    vendor_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
):
    query = select(Purchase).order_by(Purchase.purchase_date.desc())
    if vendor_id:
        query = query.where(Purchase.vendor_id == vendor_id)
    if status:
        query = query.where(Purchase.status == status)
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    return result.scalars().all()


@purchase_router.patch("/{purchase_number:path}/receive")
async def mark_received(
    purchase_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.items))
        .where(Purchase.purchase_number == purchase_number)
    )
    purchase = result.scalar_one_or_none()

    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if purchase.status == PurchaseStatus.received:
        raise HTTPException(status_code=400, detail="Purchase already marked as received")

    from app.models.models import ProductVariant
    from app.services.stock_service import record_stock_transaction

    stock_updated = 0

    for item in purchase.items:
        item.received_qty = item.quantity

        if not item.variant_id:
            continue

        v_result = await db.execute(
            select(ProductVariant).where(ProductVariant.id == item.variant_id)
        )
        variant = v_result.scalar_one_or_none()

        if not variant:
            continue

        after = await record_stock_transaction(
            db=db,
            variant=variant,
            txn_type="in",
            qty=int(item.quantity),
            reference_type="purchase",
            reference_id=purchase.purchase_number,
            note=f"Purchase {purchase.purchase_number}",
            created_by_id=current_user.id,
        )

        db.add(variant)
        await db.flush()
        stock_updated += 1

    purchase.status = PurchaseStatus.received
    await db.commit()
    await db.refresh(purchase)

    return {
        "message": f"Purchase received. {stock_updated} variant(s) stock updated.",
        "stock_updated": stock_updated,
    }

@purchase_router.get("/{purchase_number:path}")
async def get_purchase(
    purchase_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(
        select(Purchase).options(selectinload(Purchase.items))
        .where(Purchase.purchase_number == purchase_number)
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase



# ── Purchase Return ───────────────────────

pr_router = APIRouter()


class PRItemIn(BaseModel):
    variant_id: Optional[int] = None
    product_name: str
    hsn_code: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    vat_rate: Decimal


class PurchaseReturnIn(BaseModel):
    purchase_number: Optional[str] = None
    vendor_id: Optional[int] = None  
    reason: Optional[str] = None
    items: List[PRItemIn]



@pr_router.post("/", status_code=201)
async def create_purchase_return(
    payload: PurchaseReturnIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.services.stock_service import record_stock_transaction
    from app.models.models import ProductVariant

    result = await db.execute(
        select(Purchase).where(Purchase.purchase_number == payload.purchase_number)
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    pr = PurchaseReturn(
        return_number= await pr_number(db),
        return_date=date.today(),
        purchase_id=purchase.id,
        vendor_id=purchase.vendor_id,
        reason=payload.reason,
        status=ReturnStatus.approved,
        debit_note_number=await dn_number(db),
    )
    db.add(pr)
    await db.flush()
    subtotal = vat_t = Decimal("0")
    for item in payload.items:
        taxable = (item.unit_price * item.quantity).quantize(Decimal("0.01"))
        vat = (taxable * item.vat_rate / 100).quantize(Decimal("0.01"))
        db.add(PurchaseReturnItem(
            return_id=pr.id, variant_id=item.variant_id,
            product_name=item.product_name,
            hsn_code=item.hsn_code,
            quantity=item.quantity,
            unit_price=item.unit_price,
            vat_rate=item.vat_rate,
            taxable_amount=taxable,
            vat_amount=vat,
            line_total=(taxable + vat).quantize(Decimal("0.01")),
        ))
        subtotal += taxable; vat_t += vat

        # ── stock out (returning to vendor reduces our stock) ──
        if item.variant_id:
            var_result = await db.execute(select(ProductVariant).where(ProductVariant.id == item.variant_id))
            variant = var_result.scalar_one_or_none()
            if variant:
                try:
                    await record_stock_transaction(
                        db=db,
                        variant=variant,
                        txn_type="out",
                        qty=int(item.quantity),
                        reference_type="purchase_return",
                        reference_id=pr.return_number,
                        note=f"Stock out — returned to vendor via {pr.return_number}",
                        created_by_id=current_user.id,
                    )
                except ValueError as e:
                    print(f"⚠ Stock warning for variant {variant.sku}: {e}")

    pr.subtotal = subtotal
    pr.vat_amount = vat_t
    pr.total_amount = subtotal + vat_t
    journal = await post_purchase_return_journal(db, pr, purchase.vendor_id)
    pr.journal_id = journal.id
    await db.commit()
    await db.refresh(pr)
    return {"return_number": pr.return_number, "debit_note_number": pr.debit_note_number}

@pr_router.get("/")
async def list_purchase_returns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
):
    result = await db.execute(
        select(PurchaseReturn).order_by(PurchaseReturn.return_date.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    return result.scalars().all()


# ── Receipt Voucher ───────────────────────

receipt_router = APIRouter()


@accounting_router.get("/expense-accounts")
async def get_expense_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    accounts = (await db.execute(
        select(Account).where(Account.account_type == "expense", Account.is_active == True).order_by(Account.name)
    )).scalars().all()
    return [{"id": a.id, "code": a.code, "name": a.name} for a in accounts]


@accounting_router.get("/income-accounts")
async def get_income_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    accounts = (await db.execute(
        select(Account).where(Account.account_type == "income", Account.is_active == True).order_by(Account.name)
    )).scalars().all()
    return [{"id": a.id, "code": a.code, "name": a.name} for a in accounts]


class ReceiptIn(BaseModel):
    party_type: str = "customer"  # "customer" | "income_account"
    customer_id: Optional[int] = None
    income_account_id: Optional[int] = None
    invoice_number: Optional[str] = None
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str] = None
    bank_account: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    narration: Optional[str] = None
    receipt_date: date

class ReceiptEditIn(BaseModel):
    receipt_date: Optional[date] = None
    reference_number: Optional[str] = None
    narration: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None


@receipt_router.post("/", status_code=201)
async def create_receipt(
    payload: ReceiptIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.services.journal_service import _payment_mode_account
    from app.models.accounting import Account, InvoiceStatus

    if payload.party_type == "customer" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required when party_type is customer")
    if payload.party_type == "income_account" and not payload.income_account_id:
        raise HTTPException(status_code=400, detail="income_account_id is required when party_type is income_account")

    mode_code = _payment_mode_account(payload.payment_mode)
    acc_result = await db.execute(select(Account).where(Account.code == mode_code))
    debit_account = acc_result.scalar_one_or_none()
    if not debit_account:
        raise HTTPException(status_code=400, detail=f"Account {mode_code} not found. Run alembic upgrade head first.")

    invoice_id = None
    if payload.party_type == "customer" and payload.invoice_number:
        inv_result = await db.execute(
            select(SalesInvoice).where(SalesInvoice.invoice_number == payload.invoice_number)
        )
        invoice = inv_result.scalar_one_or_none()
        if invoice:
            invoice_id = invoice.id
            invoice.amount_paid = (invoice.amount_paid or Decimal("0")) + payload.amount
            invoice.balance_due = invoice.grand_total - invoice.amount_paid
            invoice.status = InvoiceStatus.paid if invoice.balance_due <= 0 else InvoiceStatus.partially_paid

    receipt = ReceiptVoucher(
        receipt_number=await rcpt_number(db),
        receipt_date=payload.receipt_date,
        party_type=payload.party_type,
        customer_id=payload.customer_id if payload.party_type == "customer" else None,
        income_account_id=payload.income_account_id if payload.party_type == "income_account" else None,
        invoice_id=invoice_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        reference_number=payload.reference_number,
        bank_account=payload.bank_account,
        cheque_number=payload.cheque_number,
        cheque_date=payload.cheque_date,
        narration=payload.narration,
        debit_account_id=debit_account.id,
    )
    db.add(receipt)
    await db.flush()

    # post_receipt_journal needs to credit either the customer's AR account
    # or the chosen income_account directly — see journal_service update below
    journal = await post_receipt_journal(db, receipt)
    receipt.journal_id = journal.id
    await db.commit()

    return {"receipt_number": receipt.receipt_number}

@receipt_router.patch("/{receipt_number:path}")
async def update_receipt(
    receipt_number: str,
    payload: ReceiptEditIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(ReceiptVoucher).where(ReceiptVoucher.receipt_number == receipt_number))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(receipt, k, v)
    await db.commit()
    return {"message": "Receipt updated"}


@receipt_router.get("/")
async def list_receipts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    include_cancelled: bool = False,
):
    query = select(ReceiptVoucher).order_by(ReceiptVoucher.receipt_date.desc())
    if not include_cancelled:
        query = query.where(ReceiptVoucher.status != "cancelled")
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    return result.scalars().all()

@receipt_router.get("/{receipt_number:path}")
async def get_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(
        select(ReceiptVoucher).where(ReceiptVoucher.receipt_number == receipt_number)
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")

    customer_name = None
    if receipt.customer_id:
        cust_result = await db.execute(select(User).where(User.id == receipt.customer_id))
        customer = cust_result.scalar_one_or_none()
        if customer:
            customer_name = customer.name

    income_account_name = None
    if receipt.income_account_id:
        acc_result = await db.execute(select(Account).where(Account.id == receipt.income_account_id))
        income_account = acc_result.scalar_one_or_none()
        if income_account:
            income_account_name = income_account.name

    invoice_number = None
    if receipt.invoice_id:
        inv_result = await db.execute(select(SalesInvoice).where(SalesInvoice.id == receipt.invoice_id))
        invoice = inv_result.scalar_one_or_none()
        if invoice:
            invoice_number = invoice.invoice_number

    return {
        "id": receipt.id,
        "receipt_number": receipt.receipt_number,
        "receipt_date": receipt.receipt_date,
        "party_type": receipt.party_type,
        "customer_id": receipt.customer_id,
        "customer_name": customer_name,
        "income_account_id": receipt.income_account_id,
        "income_account_name": income_account_name,
        "invoice_id": receipt.invoice_id,
        "invoice_number": invoice_number,
        "amount": receipt.amount,
        "payment_mode": receipt.payment_mode,
        "reference_number": receipt.reference_number,
        "bank_account": receipt.bank_account,
        "cheque_number": receipt.cheque_number,
        "cheque_date": receipt.cheque_date,
        "narration": receipt.narration,
        "status": receipt.status,
        "created_at": receipt.created_at,
    }


@accounting_router.get("/accounts")
async def get_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    accounts = (await db.execute(
        select(Account)
        .where(Account.is_active == True)
        .order_by(Account.code)
    )).scalars().all()
    return {
        "accounts": [
            {
                "id":           a.id,
                "code":         a.code,
                "name":         a.name,
                "account_type": a.account_type.value,
            }
            for a in accounts
        ]
    }
@receipt_router.post("/{receipt_number:path}/cancel")
async def cancel_receipt(
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.models.accounting import InvoiceStatus
    from app.services.journal_service import reverse_journal

    result = await db.execute(select(ReceiptVoucher).where(ReceiptVoucher.receipt_number == receipt_number))
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status == "cancelled":
        raise HTTPException(status_code=400, detail="Receipt already cancelled")

    # Reverse invoice allocation if this receipt was applied to one
    if receipt.invoice_id:
        inv_result = await db.execute(select(SalesInvoice).where(SalesInvoice.id == receipt.invoice_id))
        invoice = inv_result.scalar_one_or_none()
        if invoice:
            invoice.amount_paid = (invoice.amount_paid or Decimal("0")) - receipt.amount
            if invoice.amount_paid < 0:
                invoice.amount_paid = Decimal("0")
            invoice.balance_due = invoice.grand_total - invoice.amount_paid
            invoice.status = (
                InvoiceStatus.paid if invoice.balance_due <= 0
                else InvoiceStatus.partially_paid if invoice.amount_paid > 0
                else InvoiceStatus.unpaid
            )

    if receipt.journal_id:
        reversal = await reverse_journal(
            db, receipt.journal_id,
            narration=f"Reversal of receipt {receipt.receipt_number}"
        )
        receipt.reversal_journal_id = reversal.id  # add this nullable FK column if not present

    receipt.status = "cancelled"
    await db.commit()
    return {"message": f"Receipt {receipt.receipt_number} cancelled", "receipt_number": receipt.receipt_number}


# ── Payment Voucher ───────────────────────

payment_v_router = APIRouter()


class PaymentVIn(BaseModel):
    party_type: str = "vendor"  # "vendor" | "expense_account"
    vendor_id: Optional[int] = None
    expense_account_id: Optional[int] = None
    purchase_number: Optional[str] = None
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str] = None
    bank_account: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    narration: Optional[str] = None
    payment_date: date


class PaymentVEditIn(BaseModel):
    payment_date: Optional[date] = None
    reference_number: Optional[str] = None
    narration: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None


@payment_v_router.post("/", status_code=201)
async def create_payment_voucher(
    payload: PaymentVIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.services.journal_service import _payment_mode_account
    from app.models.accounting import Account

    if payload.party_type == "vendor" and not payload.vendor_id:
        raise HTTPException(status_code=400, detail="vendor_id is required when party_type is vendor")
    if payload.party_type == "expense_account" and not payload.expense_account_id:
        raise HTTPException(status_code=400, detail="expense_account_id is required when party_type is expense_account")

    mode_code = _payment_mode_account(payload.payment_mode)
    acc_result = await db.execute(select(Account).where(Account.code == mode_code))
    credit_account = acc_result.scalar_one_or_none()
    if not credit_account:
        raise HTTPException(status_code=400, detail=f"Account {mode_code} not found. Run alembic upgrade head first.")

    purchase_id = None
    if payload.party_type == "vendor" and payload.purchase_number:
        p_result = await db.execute(select(Purchase).where(Purchase.purchase_number == payload.purchase_number))
        purchase = p_result.scalar_one_or_none()
        if purchase:
            purchase_id = purchase.id
            purchase.amount_paid = (purchase.amount_paid or Decimal("0")) + payload.amount
            purchase.balance_due = purchase.grand_total - purchase.amount_paid

    payment = PaymentVoucher(
        payment_number=await pay_number(db),
        payment_date=payload.payment_date,
        party_type=payload.party_type,
        vendor_id=payload.vendor_id if payload.party_type == "vendor" else None,
        expense_account_id=payload.expense_account_id if payload.party_type == "expense_account" else None,
        purchase_id=purchase_id,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        reference_number=payload.reference_number,
        bank_account=payload.bank_account,
        cheque_number=payload.cheque_number,
        cheque_date=payload.cheque_date,
        narration=payload.narration,
        credit_account_id=credit_account.id,
    )
    db.add(payment)
    await db.flush()

    journal = await post_payment_journal(db, payment)
    payment.journal_id = journal.id
    await db.commit()
    await db.refresh(payment)

    return {"payment_number": payment.payment_number}

@payment_v_router.get("/")
async def list_payment_vouchers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=100),
    include_cancelled: bool = False,
):
    query = select(PaymentVoucher).order_by(PaymentVoucher.payment_date.desc())
    if not include_cancelled:
        query = query.where(PaymentVoucher.status != "cancelled")
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    return result.scalars().all()

@payment_v_router.patch("/{payment_number:path}")
async def update_payment_voucher(
    payment_number: str,
    payload: PaymentVEditIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(PaymentVoucher).where(PaymentVoucher.payment_number == payment_number))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment voucher not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(payment, k, v)
    await db.commit()
    return {"message": "Payment voucher updated"}

@payment_v_router.get("/{payment_number:path}")
async def get_payment_voucher(
    payment_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(
        select(PaymentVoucher).where(PaymentVoucher.payment_number == payment_number)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment voucher not found")

    vendor_name = None
    vendor_result = await db.execute(select(Vendor).where(Vendor.id == payment.vendor_id))
    vendor = vendor_result.scalar_one_or_none()
    if vendor:
        vendor_name = vendor.name

    purchase_number = None
    if payment.purchase_id:
        p_result = await db.execute(select(Purchase).where(Purchase.id == payment.purchase_id))
        purchase = p_result.scalar_one_or_none()
        if purchase:
            purchase_number = purchase.purchase_number

    return {
        "id": payment.id,
        "payment_number": payment.payment_number,
        "payment_date": payment.payment_date,
        "vendor_id": payment.vendor_id,
        "vendor_name": vendor_name,
        "purchase_id": payment.purchase_id,
        "purchase_number": purchase_number,
        "amount": payment.amount,
        "payment_mode": payment.payment_mode,
        "reference_number": payment.reference_number,
        "bank_account": payment.bank_account,
        "narration": payment.narration,
        "cheque_number": payment.cheque_number,
        "cheque_date": payment.cheque_date,
        "created_at": payment.created_at,
    }

@payment_v_router.post("/{payment_number:path}/cancel")
async def cancel_payment_voucher(
    payment_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.services.journal_service import reverse_journal

    result = await db.execute(select(PaymentVoucher).where(PaymentVoucher.payment_number == payment_number))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment voucher not found")
    if payment.status == "cancelled":
        raise HTTPException(status_code=400, detail="Payment voucher already cancelled")

    # Reverse purchase allocation if this payment was applied to one
    if payment.purchase_id:
        p_result = await db.execute(select(Purchase).where(Purchase.id == payment.purchase_id))
        purchase = p_result.scalar_one_or_none()
        if purchase:
            purchase.amount_paid = (purchase.amount_paid or Decimal("0")) - payment.amount
            if purchase.amount_paid < 0:
                purchase.amount_paid = Decimal("0")
            purchase.balance_due = purchase.grand_total - purchase.amount_paid

    if payment.journal_id:
        reversal = await reverse_journal(
            db, payment.journal_id,
            narration=f"Reversal of payment {payment.payment_number}"
        )
        payment.reversal_journal_id = reversal.id  # same as above

    payment.status = "cancelled"
    await db.commit()
    return {"message": f"Payment voucher {payment.payment_number} cancelled", "payment_number": payment.payment_number}

