# import_users_from_txt.py
"""Importa/actualiza usuarios desde users.txt (email, password, role).

Formato por línea (separado por coma):
    email, contraseña, role

Ejemplos:
    daniel@33producciones.es, MiPassword123, 10
    radio@empresa.com, pass, 2

Si el role no se indica, se asume 10 (master).
"""

import os
import sys
import argparse
import json
from typing import List, Dict, Tuple

from dotenv import load_dotenv, find_dotenv
import requests
from werkzeug.security import generate_password_hash

ALLOWED_ROLES = {1, 2, 3, 4, 5, 6, 10}

def parse_users_file(path: str) -> List[Dict]:
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    rows: List[Dict] = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for ln, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue

            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 2:
                raise ValueError(f"Línea {ln}: formato inválido. Esperado: email, password, role(opcional)")

            email = parts[0].lower()
            password = parts[1]
            role = 10
            if len(parts) >= 3 and parts[2]:
                try:
                    role = int(parts[2])
                except Exception:
                    raise ValueError(f"Línea {ln}: role inválido: {parts[2]!r}")
            if role not in ALLOWED_ROLES:
                raise ValueError(f"Línea {ln}: role no permitido ({role}). Permitidos: {sorted(ALLOWED_ROLES)}")

            rows.append({
                "email": email,
                "password_hash": generate_password_hash(password),
                "role": role,
            })
    return rows

def chunked(items: List[Dict], size: int):
    for i in range(0, len(items), size):
        yield items[i:i+size]

def upsert_rows(supabase_url: str, service_role_key: str, rows: List[Dict], chunk_size: int = 200):
    endpoint = supabase_url.rstrip("/") + "/rest/v1/users?on_conflict=email"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    total = 0
    for chunk in chunked(rows, chunk_size):
        resp = requests.post(endpoint, headers=headers, data=json.dumps(chunk), timeout=60)
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text}")
        total += len(chunk)
        print(f"OK: {total}/{len(rows)}")

def main():
    load_dotenv(find_dotenv(), override=False)

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="users.txt", help="Ruta al fichero users.txt")
    args = ap.parse_args()

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno (.env)")
        sys.exit(1)

    try:
        rows = parse_users_file(args.file)
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    if not rows:
        print("No hay usuarios que importar.")
        return

    try:
        upsert_rows(supabase_url, service_key, rows)
    except Exception as e:
        print(f"[ERROR] Importación fallida: {e}")
        sys.exit(1)

    print(f"Listo. Usuarios insertados/actualizados: {len(rows)}")

if __name__ == "__main__":
    main()
