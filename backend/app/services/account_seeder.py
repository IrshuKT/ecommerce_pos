from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.accounting import Account, AccountType

ACCOUNTS = [
    ("1000","Current Assets",AccountType.asset,None,True),
    ("1010","Cash in Hand",AccountType.asset,"1000",True),
    ("1020","Bank Accounts",AccountType.asset,"1000",True),
    ("1030","Petty Cash",AccountType.asset,"1000",False),
    ("1100","Inventory / Stock",AccountType.asset,"1000",True),
    ("1110","Glass Stock",AccountType.asset,"1100",True),
    ("1200","Accounts Receivable",AccountType.asset,"1000",True),
    ("1300","Input VAT",AccountType.asset,"1000",True),
    ("1400","Advance to Vendors",AccountType.asset,"1000",False),
    ("1500","Fixed Assets",AccountType.asset,None,True),
    ("1510","Machinery",AccountType.asset,"1500",False),
    ("1520","Furniture & Fixtures",AccountType.asset,"1500",False),
    ("1530","Computer & Equipment",AccountType.asset,"1500",False),
    ("2000","Accounts Payable",AccountType.liability,None,True),
    ("2100","VAT Payable",AccountType.liability,None,True),
    ("2400","TDS Payable",AccountType.liability,None,False),
    ("2500","Advance from Customers",AccountType.liability,None,False),
    ("2600","Loans & Borrowings",AccountType.liability,None,False),
    ("3000","Owner's Capital",AccountType.equity,None,True),
    ("3100","Retained Earnings",AccountType.equity,None,True),
    ("3200","Drawings",AccountType.equity,None,False),
    ("4000","Sales Revenue",AccountType.income,None,True),
    ("4010","Glass Sales",AccountType.income,"4000",True),
    ("4020","Mirror Sales",AccountType.income,"4000",False),
    ("4030","Processed Glass Sales",AccountType.income,"4000",False),
    ("4100","Shipping Income",AccountType.income,None,False),
    ("4200","Other Income",AccountType.income,None,False),
    ("4220","Round Off",AccountType.income,"4200",False),
    ("4210","Discount Received",AccountType.income,"4200",False),
    ("5000","Cost of Goods Sold",AccountType.expense,None,True),
    ("5010","Purchase — Glass",AccountType.expense,"5000",True),
    ("5020","Purchase — Frames & Fittings",AccountType.expense,"5000",False),
    ("5030","Freight Inward",AccountType.expense,"5000",False),
    ("5100","Operating Expenses",AccountType.expense,None,True),
    ("5110","Rent",AccountType.expense,"5100",False),
    ("5120","Electricity",AccountType.expense,"5100",False),
    ("5130","Salaries & Wages",AccountType.expense,"5100",False),
    ("5140","Transport & Delivery",AccountType.expense,"5100",False),
    ("5150","Packing Materials",AccountType.expense,"5100",False),
    ("5200","Selling & Admin Expenses",AccountType.expense,None,False),
    ("5210","Advertisement",AccountType.expense,"5200",False),
    ("5220","Bank Charges",AccountType.expense,"5200",False),
    ("5230","Discount Allowed",AccountType.expense,"5200",False),
    ("5300","Depreciation",AccountType.expense,None,False),
]

async def seed_accounts(db: AsyncSession):
    result = await db.execute(select(Account).limit(1))
    if result.scalar_one_or_none():
        return
    for code, name, atype, parent_code, is_system in ACCOUNTS:
        db.add(Account(code=code, name=name, account_type=atype, is_system=is_system, is_active=True))
    await db.flush()
    for code, name, atype, parent_code, is_system in ACCOUNTS:
        if parent_code:
            r = await db.execute(select(Account).where(Account.code == code))
            acc = r.scalar_one()
            rp = await db.execute(select(Account).where(Account.code == parent_code))
            parent = rp.scalar_one_or_none()
            if parent:
                acc.parent_id = parent.id
    await db.flush()
    print(f"✓ Seeded {len(ACCOUNTS)} accounts")


CASH_CUSTOMER_EMAIL = "walkin@pos.local"


async def seed_cash_customer(db: AsyncSession):
    """Create the single system 'Cash Customer' account used for anonymous
    walk-in / counter sales. All quick cash sales post against this one
    account rather than creating a new user per shopper."""
    from app.models.models import User, UserRole
    from app.core.security import get_password_hash
    import secrets

    result = await db.execute(select(User).where(User.email == CASH_CUSTOMER_EMAIL))
    if result.scalar_one_or_none():
        return

    db.add(User(
        name="Cash Customer",
        email=CASH_CUSTOMER_EMAIL,
        phone="0000000000",
        hashed_password=get_password_hash(secrets.token_urlsafe(32)),  # unguessable, not meant to be logged into
        role=UserRole.customer,
        is_active=True,
        is_verified=True,
    ))
    await db.flush()
    print("✓ Seeded default Cash Customer account")
