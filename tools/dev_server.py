#!/usr/bin/env python3
"""Arranca la app EN LOCAL contra la BD DE PRUEBA (nunca la real) para verla en el navegador.

Requiere el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329) y
el esquema ya creado con `models.Base.metadata.create_all`.

⚠️ Los CERROJOS del tempdir se ponen ANTES de importar la app: sin ellos, el hilo de bootstrap
ejecuta todos los `ensure_*` uno a uno y tarda más de diez minutos.
"""
import os
import pathlib
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))

tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")

os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "dev-local")
os.environ.setdefault("PGCONNECT_TIMEOUT", "3")

import app  # noqa: E402

app.app.config["WTF_CSRF_ENABLED"] = False      # en local, para poder probar los POST a mano
# ⚠️ Sin esto, Jinja CACHEA las plantillas y hay que reiniciar el servidor tras cada cambio de HTML.
app.app.config["TEMPLATES_AUTO_RELOAD"] = True
app.app.jinja_env.auto_reload = True


# ⚠️ SOLO EN LOCAL: entrar como quien sea sin contraseña, para poder VER las pantallas
# (`/entrar-como/<nick>`). Esto vive en el arrancador de pruebas, no en la app.
@app.app.get("/entrar-como/<nick>")
def dev_entrar(nick):
    from flask import session, redirect, request
    # ⚠️ Solo desde ESTA máquina: este arrancador es de pruebas, pero que no pueda usarse por error
    # si alguna vez se levanta en otro sitio.
    if (request.remote_addr or "") not in ("127.0.0.1", "::1"):
        return "solo en local", 403
    s = app.db()
    try:
        prof = s.query(app.UserProfile).filter(app.UserProfile.nick == nick).first()
        if not prof:
            return "no existe " + nick, 404
        session["user_id"] = str(prof.user_id)
        return redirect("/home")
    finally:
        s.close()


app.app.run(host="127.0.0.1", port=5099, debug=False, use_reloader=False)
