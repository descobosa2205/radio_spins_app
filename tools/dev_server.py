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
# ⚠️ Sin esto, el propio atajo se come el redirect al login (`_require_login_v2` solo deja pasar lo
# que está en las listas de públicos), así que nunca llegaba a entrar.
app.PUBLIC_ENDPOINTS_EXTRA.add("dev_entrar")


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


# ⚠️ SOLO EN LOCAL: los correos y los SMS no se mandan, se ESCRIBEN EN EL LOG. Así se puede probar
# el portal de externos (que entra con un número de verificación) sin tener SMTP ni pasarela.
_envio_real = app._send_optional_email


def _dev_email(to, subject, html_body, *a, **k):
    print("\n=== CORREO (local) ===\npara: %s\nasunto: %s\n%s\n=== fin ===\n"
          % (to, subject, html_body), flush=True)
    return True, None


def _dev_sms(session_db, to, text, *a, **k):
    print("\n=== SMS (local) ===\npara: %s\n%s\n=== fin ===\n" % (to, text), flush=True)
    return True, None


app._send_optional_email = _dev_email
app._send_optional_sms = _dev_sms

app.app.run(host="127.0.0.1", port=5099, debug=False, use_reloader=False)
