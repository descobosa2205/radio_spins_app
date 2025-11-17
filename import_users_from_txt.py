# import_users_from_txt.py
import os
import sys
import argparse
import json
from typing import List, Tuple

from dotenv import load_dotenv
import requests
from werkzeug.security import generate_password_hash

"""
Lee un fichero de texto con pares email/contraseña y los inserta/actualiza en la tabla 'users'
de Supabase usando el endpoint REST. No necesita psycopg2.

Requisitos (si no ejecutas en tu .venv del proyecto):
    pip install requests python-dotenv werkzeug
Variables de entorno necesarias (.env):
    SUPABASE_URL=https://<project-ref>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
"""

def parse_users_file(path: str) -> List[Tuple[str, str]]:
    users = []
    with open(path, "r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            sep = "," if "," in line else (";" if ";" in line else None)
            if not sep:
                print(f"[avisó] línea {lineno}: no tiene separador ',' ni ';' -> ignorada: {line}")
                continue
            email, pwd = [p.strip() for p in line.split(sep, 1)]
            if not email or not pwd:
                print(f"[avisó] línea {lineno}: email o contraseña vacíos -> ignorada")
                continue
            if "@" not in email:
                print(f"[avisó] línea {lineno}: email parece inválido -> {email!r}")
            users.append((email.lower(), pwd))
    return users

def main():
    parser = argparse.ArgumentParser(description="Importar usuarios desde .txt a Supabase (tabla users)")
    parser.add_argument("file", help="Ruta del fichero .txt (email,contraseña por línea)")
    parser.add_argument("--dry-run", action="store_true", help="No escribe en BD, solo muestra lo que haría")
    args = parser.parse_args()

    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    service_role = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role:
        print("Faltan variables en .env: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)

    users = parse_users_file(args.file)
    if not users:
        print("No hay usuarios válidos que importar.")
        sys.exit(0)

    # Construye payload con password hash compatible con check_password_hash de Werkzeug
    rows = []
    for email, pwd in users:
        rows.append({
            "email": email,
            "password_hash": generate_password_hash(pwd)  # pbkdf2/scrypt según versión de Werkzeug
        })

    if args.dry_run:
        print("[dry-run] Insertaría/actualizaría estos usuarios:")
        for r in rows:
            print(f"  - {r['email']}  (hash={r['password_hash'][:20]}...)")
        sys.exit(0)

    # Llamada a PostgREST de Supabase:
    # upsert por email -> on_conflict=email + Prefer: resolution=merge-duplicates
    endpoint = f"{supabase_url}/rest/v1/users?on_conflict=email"
    headers = {
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
        "Content-Type": "application/json",
        # Queremos upsert y que devuelva las filas para verificar
        "Prefer": "resolution=merge-duplicates, return=representation"
    }

    # Enviar en bloques por si hay muchos
    CHUNK = 100
    total_ok = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i+CHUNK]
        resp = requests.post(endpoint, headers=headers, data=json.dumps(chunk), timeout=30)
        if resp.status_code not in (200, 201):
            print(f"[ERROR] HTTP {resp.status_code} -> {resp.text}")
            sys.exit(1)
        try:
            data = resp.json()
        except Exception:
            data = []
        total_ok += len(data) if isinstance(data, list) else len(chunk)

    print(f"Listo. Usuarios insertados/actualizados: {total_ok}")

if __name__ == "__main__":
    main()