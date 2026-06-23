#!/usr/bin/env python3
"""Chequeo de cobertura de permisos (CI / local).

Garantiza que ningún endpoint de ESCRITURA no público quede sin recurso de permisos (lo que lo
dejaría accesible solo para dirección) ni mapeado a un recurso inexistente. Usa la lógica REAL
de la app (`app._audit_access_coverage`), así que no puede desincronizarse del enforcement.

Uso:
    python tools/check_access_coverage.py
Sale con código 1 si hay endpoints sin cubrir. No toca la base de datos (DATABASE_URL ficticio).
Requiere Python 3.10+ (igual que la app).
"""
import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/db")
os.environ.setdefault("PGCONNECT_TIMEOUT", "2")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "ci")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app  # noqa: E402

# El catálogo se construye en arranque; lo forzamos sin tocar BD real.
app._rebuild_resource_caches(app._build_access_resources_from_app())

report = app._audit_access_coverage()
if report["count"]:
    print(f"FALLO: {report['count']} endpoint(s) de escritura sin cobertura de permisos:")
    for ep, path, why in sorted(report["offenders"], key=lambda x: x[1]):
        print(f"  {ep:42} {path:55} {why}")
    print("\nSolución: mapéalos en _resolve_request_resource_key() a su recurso, o decláralos")
    print("como endpoint de apoyo (SUPPORT_ACTION_ENDPOINTS / SUPPORT_READ_ENDPOINTS).")
    sys.exit(1)

print("OK: cobertura de permisos completa. Ningún endpoint de escritura queda solo para dirección.")
