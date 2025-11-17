# manage_users.py
import argparse
import sys
from getpass import getpass
from werkzeug.security import generate_password_hash
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Falta DATABASE_URL en .env")
    sys.exit(1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

def create_user(email: str, password: str):
    if not email or not password:
        raise ValueError("Email y contraseña son obligatorios")
    pwd_hash = generate_password_hash(password)
    with engine.begin() as conn:
        conn.execute(text("""
            insert into users (email, password_hash)
            values (:email, :password_hash)
        """), {"email": email.strip().lower(), "password_hash": pwd_hash})
    print(f"Usuario creado: {email}")

def list_users():
    with engine.begin() as conn:
        rows = conn.execute(text("select id, email, created_at from users order by created_at desc")).fetchall()
        if not rows:
            print("No hay usuarios")
            return
        for r in rows:
            print(f"{r.id}  {r.email}  {r.created_at}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gestor de usuarios")
    sub = parser.add_subparsers(dest="cmd")

    c = sub.add_parser("create", help="Crear usuario")
    c.add_argument("--email", required=True)
    c.add_argument("--password", help="(opcional) si no se pasa, se pedirá por prompt", required=False)

    l = sub.add_parser("list", help="Listar usuarios")

    args = parser.parse_args()
    if args.cmd == "create":
        pwd = args.password or getpass("Contraseña: ")
        create_user(args.email, pwd)
    elif args.cmd == "list":
        list_users()
    else:
        parser.print_help()