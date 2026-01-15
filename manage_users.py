# manage_users.py
"""Utilidad CLI para crear/listar usuarios en la tabla public.users.

Usa DATABASE_URL del .env (Postgres/Supabase).
"""

import argparse
import sys
from getpass import getpass
import os

from dotenv import load_dotenv, find_dotenv
from werkzeug.security import generate_password_hash
from sqlalchemy import create_engine, text

ALLOWED_ROLES = {1, 2, 3, 4, 10}

def get_engine():
    load_dotenv(find_dotenv(), override=False)
    url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    if not url:
        print("Falta DATABASE_URL (o SUPABASE_DB_URL / SUPABASE_POSTGRES_URL) en el .env")
        sys.exit(1)
    # normaliza prefijos (compat)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return create_engine(url, future=True)

def create_user(email: str, password: str, role: int):
    if role not in ALLOWED_ROLES:
        raise ValueError(f"role no permitido ({role}). Permitidos: {sorted(ALLOWED_ROLES)}")

    pwd_hash = generate_password_hash(password)
    eng = get_engine()
    with eng.begin() as conn:
        conn.execute(text("""
            INSERT INTO public.users (email, password_hash, role)
            VALUES (:email, :password_hash, :role)
            ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role
        """), {"email": email.lower(), "password_hash": pwd_hash, "role": role})
    print("OK")

def list_users():
    eng = get_engine()
    with eng.begin() as conn:
        rows = conn.execute(text("SELECT email, role, created_at FROM public.users ORDER BY created_at DESC")).fetchall()
    for r in rows:
        print(f"{r.email}\trole={r.role}\t{r.created_at}")

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")

    c = sub.add_parser("create", help="Crear/actualizar usuario")
    c.add_argument("--email", required=True)
    c.add_argument("--password", required=False, help="Si no se pasa, se pedirá por prompt")
    c.add_argument("--role", required=False, type=int, default=10)

    l = sub.add_parser("list", help="Listar usuarios")

    args = ap.parse_args()
    if args.cmd == "create":
        pwd = args.password or getpass("Contraseña: ")
        create_user(args.email, pwd, args.role)
    elif args.cmd == "list":
        list_users()
    else:
        ap.print_help()

if __name__ == "__main__":
    main()
