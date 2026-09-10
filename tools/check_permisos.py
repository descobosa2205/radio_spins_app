#!/usr/bin/env python3
"""¿Alguna pantalla ENSEÑA un enlace que a quien la está mirando le va a dar un 403?

La regla de la casa: **quien tiene una función asignada tiene que poder ejecutarla**, y lo que no
puede usar NO SE LE PINTA. Un botón o una pestaña que lleva a un 403 es un bug: quien lo pincha no
tiene forma de saber por qué no puede.

Cómo funciona: por cada recurso del catálogo crea un usuario con SOLO ese recurso (ver + editar +
económico), abre las pantallas que le corresponden y sigue **todos los enlaces internos** que esas
pantallas pintan. Si alguno responde 403, lo canta.

    /tmp/python/bin/python3 tools/check_permisos.py          # todo el catálogo
    /tmp/python/bin/python3 tools/check_permisos.py contratacion discografica

⚠️ Solo hace GET (no toca datos) y necesita la BD DE PRUEBA del entorno de /tmp que describe
CLAUDE.md, nunca la real.
"""
import os
import pathlib
import re
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
os.chdir(RAIZ)

tmp = pathlib.Path(tempfile.gettempdir())
for _n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / _n).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "dev-local")

from werkzeug.exceptions import Forbidden   # noqa: E402

import app as A            # noqa: E402
import models as M         # noqa: E402

A.app.config["WTF_CSRF_ENABLED"] = False

# Enlaces que no se siguen: salen del back office o no son una pantalla.
NO_SEGUIR = re.compile(r"^(#|mailto:|tel:|sms:|https?://|javascript:)")
SALTAR = ("/logout", "/salir", "/static/", "/avisos", "/cron/")


def usuario(session_db):
    u = session_db.query(M.User).filter(M.User.email == "permisos@test.es").first()
    if u is None:
        u = M.User(email="permisos@test.es", password_hash="x", role=1)
        session_db.add(u)
        session_db.flush()
    u.role = 1
    p = session_db.get(M.UserProfile, u.id)
    if p is None:
        p = M.UserProfile(user_id=u.id, nick="Prueba")
        session_db.add(p)
    session_db.commit()
    return u


SESION = {"user_id": ""}


def con_permisos(session_db, u, claves):
    session_db.query(M.UserAccessGrant).filter(M.UserAccessGrant.user_id == u.id).delete()
    for k in claves:
        session_db.add(M.UserAccessGrant(user_id=u.id, resource_key=k, can_view_basic=True,
                                         can_view_econ=True, can_edit=True))
    session_db.commit()
    SESION["user_id"] = str(u.id)
    c = A.app.test_client()
    with c.session_transaction() as ses:
        ses["user_id"] = str(u.id)
        ses["role"] = 1
        ses["nick"] = "Prueba"
    return c


def formularios(html):
    """Los formularios que pinta una pantalla (su `action` y el `formaction` de cada botón)."""
    out = []
    for m in re.findall(r'<form[^>]*\saction="([^"]+)"', html or ""):
        if m.startswith("/") and m not in out:
            out.append(m)
    for m in re.findall(r'formaction="([^"]+)"', html or ""):
        if m.startswith("/") and m not in out:
            out.append(m)
    return out


def gate_deniega(url):
    """¿El gate le cerraría la puerta a ese POST? Se ejecuta SOLO el gate (no la vista): así se
    comprueba el permiso sin guardar, borrar ni mandar nada."""
    from flask import request as _rq, session as _ses
    try:
        adaptador = A.app.url_map.bind("localhost")
        ruta = url.split("?")[0]
        endpoint, _args = adaptador.match(ruta, method="POST")
    except Exception:
        return False                      # no es un POST de la app (o no existe): no es cosa nuestra
    with A.app.test_request_context(url, method="POST") as ctx:
        _ses["user_id"] = SESION["user_id"]
        _ses["role"] = 1
        _ses["nick"] = "Prueba"
        try:
            _rq.url_rule = ctx.request.url_rule
            resp = A._enforce_role_permissions_v2()
        except Forbidden:
            return True          # ⚠️ `forbid()` LANZA (abort 403): sin esto no se detecta ninguno
        except Exception:
            return False
        return bool(resp is not None and getattr(resp, "status_code", 0) == 403)


def enlaces(html):
    """Los enlaces internos que pinta una pantalla (sin repetir y sin lo que no es una pantalla)."""
    out = []
    for href in re.findall(r'href="([^"]+)"', html or ""):
        href = href.strip()
        if not href or NO_SEGUIR.match(href) or not href.startswith("/"):
            continue
        if any(href.startswith(x) for x in SALTAR):
            continue
        if href not in out:
            out.append(href)
    return out


def main():
    filtro = [a.strip().lower() for a in sys.argv[1:]]
    s = M.SessionLocal()
    with A.app.app_context():
        A._bootstrap_access_and_personnel()
    u = usuario(s)
    recursos = {r.key: r for r in s.query(M.UserAccessResource).all()}
    if not recursos:
        print("No hay catálogo de permisos en la BD de prueba.")
        return 1

    # Por dónde se entra a cada sección: sus rutas GET sin parámetros (las pantallas de verdad).
    puertas = {}
    for rule in A.app.url_map.iter_rules():
        ep = rule.endpoint or ""
        if "GET" not in (rule.methods or set()) or "<" in rule.rule:
            continue
        if ep.startswith("public_") or ep in ("static", "landing", "admin_login", "admin_logout"):
            continue
        try:
            with A.app.test_request_context(rule.rule):
                from flask import request as _rq
                _rq.url_rule = rule
                k = A._resolve_request_resource_key() or A._infer_group_key_from_path(rule.rule)
        except Exception:
            continue
        if not k or k == "home":
            continue
        puertas.setdefault(k.split(".")[0], set()).add(rule.rule)

    fallos = []
    revisadas = 0
    for clave in sorted(recursos):
        if filtro and not any(clave.startswith(f) for f in filtro):
            continue
        entradas = sorted(puertas.get(clave.split(".")[0], set()))
        if not entradas:
            continue
        c = con_permisos(s, u, [clave])
        for entrada in entradas:
            r = c.get(entrada, follow_redirects=True)
            # Solo pantallas: un PDF o un Excel no pinta enlaces (y no es texto).
            if r.status_code != 200 or "html" not in (r.mimetype or ""):
                continue
            html = r.get_data(as_text=True)
            revisadas += 1
            for href in enlaces(html):
                rr = c.get(href, follow_redirects=False)
                if rr.status_code == 403:
                    fallos.append((clave, entrada, href))
            # Y los BOTONES: un formulario que se pinta y cuyo POST daría 403 es el mismo bug.
            for accion in formularios(html):
                if gate_deniega(accion):
                    fallos.append((clave, entrada, "POST " + accion))
    print("pantallas revisadas: %d" % revisadas)
    if not fallos:
        print("OK · ninguna pantalla enseña un enlace que dé 403 a quien la está mirando")
        return 0
    print("\n⚠️  ENLACES QUE DAN 403 A QUIEN LOS VE: %d" % len(fallos))
    ancho = max(len(x[0]) for x in fallos)
    for clave, entrada, href in fallos:
        print("  con «%s»%s  %s  →  %s" % (clave, " " * (ancho - len(clave)), entrada, href))
    return 1


if __name__ == "__main__":
    sys.exit(main())
