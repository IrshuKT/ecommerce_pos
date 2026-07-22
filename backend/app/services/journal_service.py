from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import random, string
from app.models.accounting import (Journal, JournalLine, Account, VoucherType, NumberSequence,ReceiptVoucher,PaymentVoucher)


def _current_financial_year(d: date = None) -> str:
    d = d or date.today()
    # UAE financial year: calendar year (Jan 1 – Dec 31)
    return str(d.year)


async def get_next_number(db: AsyncSession, doc_type: str, prefix: str, pad: int = 4) -> str:
    """Atomically returns the next sequential number for a document type,
    scoped to the current calendar year."""
    fy = _current_financial_year()

    result = await db.execute(
        select(NumberSequence)
        .where(NumberSequence.doc_type == doc_type, NumberSequence.financial_year == fy)
        .with_for_update()
    )
    seq = result.scalar_one_or_none()

    if seq is None:
        seq = NumberSequence(doc_type=doc_type, financial_year=fy, last_number=0)
        db.add(seq)
        await db.flush()
        result = await db.execute(
            select(NumberSequence)
            .where(NumberSequence.doc_type == doc_type, NumberSequence.financial_year == fy)
            .with_for_update()
        )
        seq = result.scalar_one()

    seq.last_number += 1
    await db.flush()
    return f"{prefix}/{fy}/{str(seq.last_number).zfill(pad)}"


async def inv_number(db):   return await get_next_number(db, "INV", "INV")
async def ret_number(db):   return await get_next_number(db, "RET", "RET")
async def purch_number(db): return await get_next_number(db, "PUR", "PUR")
async def rcpt_number(db):  return await get_next_number(db, "RCP", "RCP")
async def pay_number(db):   return await get_next_number(db, "PAY", "PAY")
async def jnl_number(db):   return await get_next_number(db, "JNL", "JNL")
async def cn_number(db):    return await get_next_number(db, "CN", "CN")
async def dn_number(db):    return await get_next_number(db, "DN", "DN")
async def pr_number(db):    return await get_next_number(db, "PRR", "PRR")


async def get_account(db: AsyncSession, code: str) -> Account:
    result = await db.execute(select(Account).where(Account.code == code))
    account = result.scalar_one_or_none()
    if not account:
        raise ValueError(f"Account not found: {code}")
    return account


async def post_journal(db, voucher_type, voucher_date, lines, reference=None, narration=None, created_by_id=None):
    total_debit = sum(Decimal(str(l.get("debit", 0))) for l in lines)
    total_credit = sum(Decimal(str(l.get("credit", 0))) for l in lines)
    if abs(total_debit - total_credit) > Decimal("0.01"):
        raise ValueError(f"Journal imbalance: debit={total_debit} credit={total_credit}")
    journal = Journal(voucher_number=await jnl_number(db), voucher_type=voucher_type,
                      voucher_date=voucher_date, reference=reference, narration=narration,
                      is_posted=True, created_by_id=created_by_id)
    db.add(journal)
    await db.flush()
    for line in lines:
        account = await get_account(db, line["account_code"])
        db.add(JournalLine(journal_id=journal.id, 
                           account_id=account.id,
                           debit=Decimal(str(line.get("debit", 0))),
                           credit=Decimal(str(line.get("credit", 0))),
                           narration=line.get("narration"),
                           vendor_id=line.get("vendor_id"),
                           customer_id=line.get("customer_id")))
    return journal


def _payment_mode_account(mode: str) -> str:
    return {"cash": "1010", "cod": "1010", "upi": "1020",
            "bank_transfer": "1020", "razorpay": "1020",
            "cheque": "1020", "neft": "1020", "rtgs": "1020"}.get(mode.lower(), "1020")


async def post_sales_invoice_journal(db, invoice, customer_id):
    lines = [
        {"account_code": "1200", "debit": float(invoice.grand_total), "narration": f"Invoice {invoice.invoice_number}", "customer_id": customer_id},
        {"account_code": "4000", "credit": float(invoice.taxable_amount), "narration": f"Sales {invoice.invoice_number}"},
    ]
    if invoice.vat_amount:
        lines.append({"account_code": "2100", "credit": float(invoice.vat_amount), "narration": "VAT on sales"})
    if invoice.shipping_charge:
        lines.append({"account_code": "4100", "credit": float(invoice.shipping_charge), "narration": "Shipping"})
    if invoice.round_off:
        ro = float(invoice.round_off)
        if ro > 0:
            lines.append({"account_code": "4220", "credit": ro, "narration": "Round off"})
        else:
            lines.append({"account_code": "4220", "debit": abs(ro), "narration": "Round off"})
    return await post_journal(db, VoucherType.sales_invoice, invoice.invoice_date, lines, reference=invoice.invoice_number, narration=f"Sales invoice {invoice.invoice_number}")
   
async def post_receipt_journal(db: AsyncSession, receipt: ReceiptVoucher) -> Journal:
    """
    Debit: Cash/Bank (based on payment_mode) — receipt.debit_account_id's account_code
    Credit: AR control account (1200), tagged with customer_id — if party_type == customer
         or the chosen income account directly — if party_type == income_account
    """
    debit_result = await db.execute(select(Account).where(Account.id == receipt.debit_account_id))
    debit_account = debit_result.scalar_one_or_none()
    if not debit_account:
        raise ValueError(f"Debit account not found for id={receipt.debit_account_id}")

    lines = [
        {
            "account_code": debit_account.code,
            "debit": float(receipt.amount),
            "narration": receipt.narration or f"Receipt {receipt.receipt_number}",
            "customer_id": receipt.customer_id,
        },
    ]

    if receipt.party_type == "customer":
        lines.append({
            "account_code": "1200",  # shared AR control account, same as post_sales_invoice_journal
            "credit": float(receipt.amount),
            "narration": receipt.narration or f"Receipt {receipt.receipt_number}",
            "customer_id": receipt.customer_id,
        })
    else:
        income_result = await db.execute(select(Account).where(Account.id == receipt.income_account_id))
        income_account = income_result.scalar_one_or_none()
        if not income_account:
            raise ValueError(f"Income account not found for id={receipt.income_account_id}")
        lines.append({
            "account_code": income_account.code,
            "credit": float(receipt.amount),
            "narration": receipt.narration or f"Receipt {receipt.receipt_number}",
        })

    return await post_journal(
        db, VoucherType.receipt, receipt.receipt_date, lines,
        reference=receipt.receipt_number,
        narration=f"Receipt {receipt.receipt_number}" + (f" — {receipt.narration}" if receipt.narration else ""),
    )


async def post_purchase_journal(db, purchase, vendor_id):
    lines = [
        {"account_code": "5000", "debit": float(purchase.taxable_amount), "narration": f"Purchase {purchase.purchase_number}", "vendor_id": vendor_id},
        {"account_code": "2000", "credit": float(purchase.grand_total), "narration": f"Payable {purchase.purchase_number}", "vendor_id": vendor_id},
    ]
    if purchase.vat_amount:
        lines.append({"account_code": "1300", "debit": float(purchase.vat_amount), "narration": "VAT ITC"})
    return await post_journal(db, VoucherType.purchase_invoice, purchase.purchase_date, lines, reference=purchase.purchase_number)


async def post_payment_journal(db: AsyncSession, payment: PaymentVoucher) -> Journal:
    """
    Credit: Cash/Bank — payment.credit_account_id's account_code
    Debit: AP control account (2000), tagged with vendor_id — if party_type == vendor
        or the chosen expense account directly — if party_type == expense_account
    """
    credit_result = await db.execute(select(Account).where(Account.id == payment.credit_account_id))
    credit_account = credit_result.scalar_one_or_none()
    if not credit_account:
        raise ValueError(f"Credit account not found for id={payment.credit_account_id}")

    lines = []

    if payment.party_type == "vendor":
        lines.append({
            "account_code": "2000",  # shared AP control account, same as post_purchase_journal
            "debit": float(payment.amount),
            "narration": payment.narration or f"Payment {payment.payment_number}",
            "vendor_id": payment.vendor_id,
        })
    else:
        expense_result = await db.execute(select(Account).where(Account.id == payment.expense_account_id))
        expense_account = expense_result.scalar_one_or_none()
        if not expense_account:
            raise ValueError(f"Expense account not found for id={payment.expense_account_id}")
        lines.append({
            "account_code": expense_account.code,
            "debit": float(payment.amount),
            "narration": payment.narration or f"Payment {payment.payment_number}",
        })

    lines.append({
        "account_code": credit_account.code,
        "credit": float(payment.amount),
        "narration": payment.narration or f"Payment {payment.payment_number}",
        "vendor_id": payment.vendor_id if payment.party_type == "vendor" else None,
    })

    return await post_journal(
        db, VoucherType.payment, payment.payment_date, lines,
        reference=payment.payment_number,
        narration=f"Payment {payment.payment_number}" + (f" — {payment.narration}" if payment.narration else ""),
    )


async def post_sales_return_journal(db, sales_return, customer_id):
    lines = [
        {"account_code": "4000", "debit": float(sales_return.subtotal), "narration": f"Sales return {sales_return.return_number}", "customer_id": customer_id},
        {"account_code": "1200", "credit": float(sales_return.total_amount), "narration": f"Credit note {sales_return.credit_note_number}", "customer_id": customer_id},
    ]
    if sales_return.vat_amount:
        lines.append({"account_code": "2100", "debit": float(sales_return.vat_amount), "narration": "VAT reversal"})
    return await post_journal(db, VoucherType.sales_return, sales_return.return_date, lines, reference=sales_return.return_number)


async def post_purchase_return_journal(db, purchase_return, vendor_id):
    lines = [
        {"account_code": "2000", "debit": float(purchase_return.total_amount), "narration": f"Debit note {purchase_return.debit_note_number}", "vendor_id": vendor_id},
        {"account_code": "5000", "credit": float(purchase_return.subtotal), "narration": f"Purchase return {purchase_return.return_number}", "vendor_id": vendor_id},
    ]
    if purchase_return.vat_amount:
        lines.append({"account_code": "1300", "credit": float(purchase_return.vat_amount), "narration": "VAT ITC reversal"})
    return await post_journal(db, VoucherType.purchase_return, purchase_return.return_date, lines, reference=purchase_return.return_number)


async def get_account_balance(db, account_code, as_of_date=None):
    account = await get_account(db, account_code)
    query = (select(func.coalesce(func.sum(JournalLine.debit), 0).label("dr"),
                    func.coalesce(func.sum(JournalLine.credit), 0).label("cr"))
             .join(Journal).where(JournalLine.account_id == account.id, Journal.is_posted == True))
    if as_of_date: query = query.where(Journal.voucher_date <= as_of_date)
    r = await db.execute(query)
    row = r.one()
    dr, cr = Decimal(str(row.dr)), Decimal(str(row.cr))
    balance = (dr - cr) if account.account_type in ("asset", "expense") else (cr - dr)
    return {"account_code": account_code, "account_name": account.name, "account_type": account.account_type, "total_debit": dr, "total_credit": cr, "balance": balance}

async def reverse_journal(db: AsyncSession, original_journal_id: int, narration: str) -> Journal:
    """
    Creates a new Journal that exactly mirrors an existing one but with
    debit/credit swapped on every line — the standard accounting way to
    void an entry without deleting history.
    """
    result = await db.execute(
        select(JournalLine).where(JournalLine.journal_id == original_journal_id)
    )
    original_lines = result.scalars().all()
    if not original_lines:
        raise ValueError(f"No journal lines found for journal_id={original_journal_id}")

    reversal = Journal(
        journal_date=date.today(),
        narration=narration,
        reversal_of_id=original_journal_id,  # add this FK column if not present
    )
    db.add(reversal)
    await db.flush()

    for line in original_lines:
        db.add(JournalLine(
            journal_id=reversal.id,
            account_id=line.account_id,
            debit=line.credit,   # swapped
            credit=line.debit,   # swapped
            description=f"Reversal — {line.description or ''}".strip(),
        ))

    return reversal