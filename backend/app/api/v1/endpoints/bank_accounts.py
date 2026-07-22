
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
from app.api.v1.endpoints.auth import get_current_user, require_backoffice, require_admin
from app.services.journal_service import (
    post_purchase_journal, post_purchase_return_journal,
    post_receipt_journal, post_payment_journal,
    purch_number, rcpt_number, pay_number, dn_number, pr_number
)
from app.core.config import settings
from app.models.accounting import AccountType

accounting_router = APIRouter()

account_type=AccountType.asset,

class BankAccountIn(BaseModel):
    label: str
    bank_name: str
    account_number: str
    iban: str
    branch: Optional[str] = None
    swift_code: Optional[str] = None
    currency: Optional[str] = "AED"


def _bank_out(a):
    return {
        "id": a.id, "code": a.code, "label": a.name,
        "bank_name": a.bank_name, "account_number": a.account_number,
        "iban": a.iban, "branch": a.branch, "swift_code": a.swift_code,
        "currency": a.currency, "is_default": a.is_default,
    }


async def _next_bank_code(db: AsyncSession) -> str:
    result = await db.execute(
        select(Account).where(Account.code.like("102%")).order_by(Account.code.desc())
    )
    last = result.scalars().first()
    n = int(last.code) + 1 if last and last.code.isdigit() else 1021
    return str(n)


@accounting_router.get("/bank-accounts")
async def list_bank_accounts(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_backoffice)):
    result = await db.execute(
        select(Account).where(Account.is_bank == True, Account.is_active == True)
        .order_by(Account.is_default.desc(), Account.code)
    )
    return [_bank_out(a) for a in result.scalars().all()]


@accounting_router.post("/bank-accounts")
async def create_bank_account(
    payload: BankAccountIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    parent = (await db.execute(select(Account).where(Account.code == "1020"))).scalar_one_or_none()
    existing = (await db.execute(
        select(Account).where(Account.is_bank == True, Account.is_active == True)
    )).scalars().all()
    is_first = len(existing) == 0

    acc = Account(
        code=await _next_bank_code(db),
        name=payload.label,
        account_type=AccountType.asset,
        parent_id=parent.id if parent else None,
        is_bank=True,
        is_active=True,
        is_default=is_first,
        bank_name=payload.bank_name,
        account_number=payload.account_number,
        iban=payload.iban,
        branch=payload.branch,
        swift_code=payload.swift_code,
        currency=payload.currency,
    )
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return _bank_out(acc)


@accounting_router.patch("/bank-accounts/{account_id}")
async def update_bank_account(
    account_id: int,
    payload: BankAccountIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    acc = (await db.execute(select(Account).where(Account.id == account_id, Account.is_bank == True))).scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Bank account not found")
    acc.name = payload.label
    acc.bank_name = payload.bank_name
    acc.account_number = payload.account_number
    acc.iban = payload.iban
    acc.branch = payload.branch
    acc.swift_code = payload.swift_code
    acc.currency = payload.currency
    await db.commit()
    await db.refresh(acc)
    return _bank_out(acc)


@accounting_router.delete("/bank-accounts/{account_id}")
async def delete_bank_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    acc = (await db.execute(select(Account).where(Account.id == account_id, Account.is_bank == True))).scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Bank account not found")
    acc.is_active = False
    was_default = acc.is_default
    acc.is_default = False
    await db.flush()
    if was_default:
        next_acc = (await db.execute(
            select(Account).where(Account.is_bank == True, Account.is_active == True).order_by(Account.code)
        )).scalars().first()
        if next_acc:
            next_acc.is_default = True
    await db.commit()
    return {"message": "Bank account removed"}


@accounting_router.post("/bank-accounts/{account_id}/set-default")
async def set_default_bank_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from sqlalchemy import update
    acc = (await db.execute(select(Account).where(Account.id == account_id, Account.is_bank == True, Account.is_active == True))).scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Bank account not found")
    await db.execute(update(Account).where(Account.is_bank == True).values(is_default=False))
    acc.is_default = True
    await db.commit()
    return _bank_out(acc)