from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from app.db.session import get_db
from app.models.models import User, UserRole
from app.api.v1.endpoints.auth import get_current_user, require_admin, require_backoffice, require_counter_view
from app.core.security import get_password_hash

router = APIRouter()

STAFF_ROLES = {UserRole.admin, UserRole.manager, UserRole.sales_staff}


@router.get("/")
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_counter_view),
    search: Optional[str] = None,
    trade_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
):
    query = select(User).where(User.role == UserRole.customer).order_by(User.created_at.desc())
    if search:
        query = query.where(
            (User.name.ilike(f"%{search}%")) |
            (User.email.ilike(f"%{search}%")) |
            (User.phone.ilike(f"%{search}%"))
        )
    if trade_only:
        query = query.where(User.is_trade_approved == True)
    result = await db.execute(query.offset((page - 1) * limit).limit(limit))
    users = result.scalars().all()
    return [{"id": u.id, "name": u.name, "email": u.email, "phone": u.phone,
             "role": u.role, "is_active": u.is_active,
             "is_trade_approved": u.is_trade_approved,
             "created_at": u.created_at} for u in users]


@router.patch("/{user_id}/trade-approve")
async def approve_trade(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_trade_approved = True
    user.is_verified = True
    await db.commit()
    await db.refresh(user)
    return {"message": f"{user.name} approved as trade customer"}


@router.patch("/{user_id}/trade-revoke")
async def revoke_trade(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_trade_approved = False
    await db.commit()
    return {"message": f"{user.name} trade access revoked"}


@router.patch("/{user_id}/toggle-active")
async def toggle_active(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_backoffice),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"message": f"User {'activated' if user.is_active else 'deactivated'}"}


# ══════════════════════════════════════════════════════════════════════════════
# STAFF — admin/manager/sales_staff, for the Staff Users page
# List is viewable by any staff role (require_counter_view); create/update/delete
# stay admin-only (require_admin).
# ══════════════════════════════════════════════════════════════════════════════

class StaffOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    role: str
    is_active: bool
    class Config:
        from_attributes = True


class CreateStaffIn(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    role: UserRole


class UpdateStaffIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


@router.get("/staff", response_model=List[StaffOut])
async def list_staff(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_counter_view)):
    result = await db.execute(select(User).where(User.role.in_(STAFF_ROLES)).order_by(User.name))
    return result.scalars().all()


@router.post("/staff", response_model=StaffOut, status_code=201)
async def create_staff(payload: CreateStaffIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    if payload.role not in STAFF_ROLES:
        raise HTTPException(400, "Role must be admin, manager, or sales_staff")
    if (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none():
        raise HTTPException(400, "Email already registered")
    if (await db.execute(select(User).where(User.phone == payload.phone))).scalar_one_or_none():
        raise HTTPException(400, "Phone already registered")
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user = User(
        name=payload.name, email=payload.email, phone=payload.phone,
        hashed_password=get_password_hash(payload.password),
        role=payload.role, is_active=True, is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/staff/{user_id}", response_model=StaffOut)
async def update_staff(user_id: int, payload: UpdateStaffIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id, User.role.in_(STAFF_ROLES)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Staff user not found")

    if payload.name is not None: user.name = payload.name
    if payload.phone is not None: user.phone = payload.phone
    if payload.role is not None:
        if payload.role not in STAFF_ROLES:
            raise HTTPException(400, "Invalid role")
        if user.id == current_user.id and payload.role != UserRole.admin:
            raise HTTPException(400, "You cannot demote your own account")
        user.role = payload.role
    if payload.is_active is not None:
        if user.id == current_user.id and not payload.is_active:
            raise HTTPException(400, "You cannot deactivate your own account")
        user.is_active = payload.is_active
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        user.hashed_password = get_password_hash(payload.password)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/staff/{user_id}", status_code=204)
async def delete_staff(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot delete your own account")
    result = await db.execute(select(User).where(User.id == user_id, User.role.in_(STAFF_ROLES)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Staff user not found")
    await db.delete(user)
    await db.commit()
    return None


# ══════════════════════════════════════════════════════════════════════════════
# CURRENT USER — profile, password, "me"
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/me/profile")
async def my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "role": current_user.role,
        "is_trade_approved": current_user.is_trade_approved,
        "is_active": current_user.is_active,
    }


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

@router.patch("/me/profile")
async def update_profile(
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.name: current_user.name = payload.name
    if payload.email: current_user.email = payload.email
    if payload.phone: current_user.phone = payload.phone
    await db.commit()
    return {"message": "Profile updated"}


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.patch("/me/password")
async def change_password(
    payload: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import bcrypt
    if not bcrypt.checkpw(payload.current_password.encode(), current_user.hashed_password.encode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return {"message": "Password changed successfully"}


# ══════════════════════════════════════════════════════════════════════════════
# ADDRESSES
# ══════════════════════════════════════════════════════════════════════════════

from app.models.models import Address

class AddressIn(BaseModel):
    label: str = "Home"
    full_name: str
    phone: str
    line1: str
    line2: Optional[str] = None
    city: str
    emirate: str
    pincode: Optional[str] = None
    is_default: bool = False

@router.get("/addresses")
async def get_addresses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Address).where(Address.user_id == current_user.id).order_by(Address.is_default.desc()))
    return result.scalars().all()

@router.post("/addresses", status_code=201)
async def add_address(payload: AddressIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    addr = Address(user_id=current_user.id, **payload.model_dump())
    db.add(addr)
    await db.commit()
    await db.refresh(addr)
    return {"id": addr.id, "message": "Address saved"}

@router.delete("/addresses/{address_id}", status_code=204)
async def delete_address(address_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Address).where(Address.id == address_id, Address.user_id == current_user.id))
    addr = result.scalar_one_or_none()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    await db.delete(addr)
    await db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# GENERIC — MUST BE LAST (catch-all /{user_id})
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_counter_view)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "role": user.role, "is_active": user.is_active, "is_verified": user.is_verified,
            "is_trade_approved": user.is_trade_approved, "created_at": user.created_at}