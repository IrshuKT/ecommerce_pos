"""
Create an admin user.

Interactive:
    python create_admin.py

Non-interactive (e.g. inside a Docker container / CI):
    python create_admin.py --name "Risma" --email admin@example.com --phone "0501234567" --password "secret123"
"""
import argparse
import asyncio
import getpass

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.models import User, UserRole
from app.core.security import get_password_hash


def parse_args():
    p = argparse.ArgumentParser(description="Create an admin user")
    p.add_argument("--name", help="Full name")
    p.add_argument("--email", help="Email address")
    p.add_argument("--phone", help="Phone number (UAE format, e.g. 050 123 4567)")
    p.add_argument("--password", help="Password (omit to be prompted securely)")
    return p.parse_args()


async def main():
    args = parse_args()

    name = args.name or input("Name: ").strip()
    email = (args.email or input("Email: ").strip()).lower()
    phone = args.phone or input("Phone: ").strip()

    if args.password:
        password = args.password
    else:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match.")
            return

    if not name or not email or not phone or not password:
        print("Name, email, phone, and password are all required.")
        return

    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(User).where((User.email == email) | (User.phone == phone))
        )
        if existing.scalar_one_or_none():
            print("A user with this email or phone already exists.")
            return

        user = User(
            name=name,
            email=email,
            phone=phone,
            hashed_password=get_password_hash(password),
            role=UserRole.admin,
            is_active=True,
            is_verified=True,
        )

        db.add(user)
        await db.commit()

        print(f"Admin user '{name}' <{email}> created successfully.")


if __name__ == "__main__":
    asyncio.run(main())
