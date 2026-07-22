from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
import uuid

from app.db.session import get_db
from app.models.models import CompanySettings, User
from app.api.v1.endpoints.auth import require_admin, require_backoffice, get_current_user

router = APIRouter()


async def get_or_create_settings(db: AsyncSession) -> CompanySettings:
    result = await db.execute(select(CompanySettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = CompanySettings()
        db.add(settings)
        await db.flush()
    return settings


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    settings = await get_or_create_settings(db)
    return {
        "company_name": settings.company_name,
        "tagline": settings.tagline,
        "logo_url": settings.logo_url,
        "email": settings.email,
        "phone": settings.phone,
        "mobile": settings.mobile,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "emirate": settings.emirate,
        "pincode": settings.pincode,
        "country": settings.country,
        "trn": settings.trn,
        "currency_code": settings.currency_code,
        "currency_symbol": settings.currency_symbol,
        "default_vat_rate": settings.default_vat_rate,
        "website": settings.website,
        "invoice_terms": settings.invoice_terms,
        "invoice_footer": settings.invoice_footer,
    }


@router.patch("/")
async def update_settings(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    settings = await get_or_create_settings(db)
    allowed = {
        "company_name", "tagline", "email", "phone", "mobile",
        "address_line1", "address_line2", "city", "emirate",
        "pincode", "country", "trn", "currency_code", "currency_symbol",
        "default_vat_rate",
        "invoice_prefix", "invoice_terms", "invoice_footer", "website",
    }
    for k, v in payload.items():
        if k in allowed:
            setattr(settings, k, v)
    await db.commit()
    await db.refresh(settings)
    return {"message": "Settings updated"}

@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.core.config import settings as app_settings
    ext = Path(file.filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".svg"}:
        raise HTTPException(400, "Invalid file type")
    contents = await file.read()
    upload_dir = Path(app_settings.UPLOAD_DIR) / "company"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"logo{ext}"
    with open(upload_dir / filename, "wb") as f:
        f.write(contents)
    url = f"/uploads/company/{filename}"
    settings = await get_or_create_settings(db)
    settings.logo_url = url
    await db.commit()          # ← was missing
    return {"logo_url": url}   


@router.get("/accounts")
async def list_accounts(
    is_bank: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    from app.models.accounting import Account
    q = select(Account).where(Account.is_active == True)
    if is_bank is not None:
        q = q.where(Account.is_bank == is_bank)
    result = await db.execute(q.order_by(Account.code))
    return [
        {"id": a.id, "code": a.code, "name": a.name, "account_type": a.account_type,
         "is_bank": a.is_bank, "is_default": a.is_default}
        for a in result.scalars().all()
    ]