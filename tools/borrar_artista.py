#!/usr/bin/env python3
"""BORRAR UN ARTISTA (o varios) COMO SI NUNCA HUBIERA EXISTIDO.

⚠️⚠️ HERRAMIENTA DE UN SOLO USO. Se hizo para quitar los tres artistas «Experimental» (sep 2026,
lo pidió Dani) y **se borra del repo en cuanto se use**: no es una función de la app, y una
herramienta que borra en cascada no debe quedarse a mano.

QUÉ HACE
  1. Busca los artistas por nombre (subcadena, sin distinguir mayúsculas ni acentos).
  2. **INVENTARIA** todo lo que cuelga de cada uno: las 34 tablas que apuntan a `artists` y las 14
     columnas JSONB `artist_ids` donde también aparecen.
  3. Lo ENSEÑA y pide confirmación escribiendo una palabra.
  4. Borra: primero lo que la base no borra sola (las FK `RESTRICT`: álbumes, ISRC y actividades) y
     las menciones en los JSONB, y después el artista —de lo demás se encargan las FK `CASCADE`.

CÓMO SE USA
    # 1) EN SECO (no borra nada, solo enseña lo que hay). SIEMPRE primero.
    DATABASE_URL="postgresql://…" python3 tools/borrar_artista.py "Experimental"

    # 2) Borrando de verdad (pide confirmación y hay que escribir BORRAR):
    DATABASE_URL="postgresql://…" python3 tools/borrar_artista.py "Experimental" --borrar

⚠️ El `DATABASE_URL` de producción está en el `.env` del proyecto. Todo va en **UNA transacción**:
si algo falla, no se borra nada.
"""
import os
import sys
import unicodedata

try:
    import psycopg2
    import psycopg2.extras
except ImportError:                                   # pragma: no cover
    sys.exit("Falta psycopg2: python3 -m pip install psycopg2-binary")

# Las FK que NO son CASCADE: la base no las borra sola, así que hay que hacerlo aquí (y en este
# orden, porque unas dependen de otras).
RESTRICT_ORDER = [
    ("song_isrc_codes", "artist_id"),
    ("albums", "artist_id"),
    ("concerts", "artist_id"),
]
# Las columnas JSONB donde el artista aparece como una mención más dentro de una lista.
JSONB_LISTS = [
    "press_releases", "promotion_requests", "company_action_requests", "booking_requests",
    "purchased_tours", "tour_onesheets", "distributor_advance_rules", "simulation_caches",
    "promotions", "concerts", "workflow_bags", "production_requests", "company_actions",
    "simulation_commissions",
]
PALABRA = "BORRAR"


def _sin_acentos(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower())
                   if unicodedata.category(c) != "Mn")


def _url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        # Si no viene por entorno, se lee del .env del proyecto (donde vive el de producción).
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        try:
            with open(os.path.join(raiz, ".env"), encoding="utf-8") as f:
                for linea in f:
                    if linea.strip().startswith("DATABASE_URL="):
                        url = linea.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except FileNotFoundError:
            pass
    if not url:
        sys.exit("No hay DATABASE_URL (ni en el entorno ni en el .env).")
    return url


def _tablas_que_apuntan(cur) -> list:
    cur.execute("""
        SELECT tc.table_name, kcu.column_name, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'artists'
        ORDER BY tc.table_name
    """)
    return [(t, c, r) for t, c, r in cur.fetchall()]


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    borrar = "--borrar" in sys.argv[1:]
    if not args:
        sys.exit("Dime qué artista: python3 tools/borrar_artista.py \"Experimental\" [--borrar]")

    cx = psycopg2.connect(_url())
    cx.autocommit = False
    cur = cx.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # ── 1) QUIÉNES SON ──────────────────────────────────────────────────────────────────────────
    cur.execute("SELECT id, name FROM artists ORDER BY name")
    todos = cur.fetchall()
    buscados = [_sin_acentos(a) for a in args]
    elegidos = [f for f in todos if any(b in _sin_acentos(f["name"]) for b in buscados)]
    if not elegidos:
        print("No hay ningún artista que case con: %s" % ", ".join(args))
        return 1

    print("\n=== ARTISTAS QUE SE VAN A BORRAR (%d) ===" % len(elegidos))
    for f in elegidos:
        print("   · %s   (%s)" % (f["name"], f["id"]))
    ids = tuple(str(f["id"]) for f in elegidos)

    # ── 2) QUÉ CUELGA DE ELLOS ──────────────────────────────────────────────────────────────────
    print("\n=== LO QUE CUELGA ===")
    total = 0
    for tabla, col, regla in _tablas_que_apuntan(cur):
        try:
            cur.execute("SELECT count(*) FROM %s WHERE %s::text = ANY(%%s)" % (tabla, col), (list(ids),))
            n = cur.fetchone()[0]
        except Exception:
            cx.rollback()
            continue
        if n:
            total += n
            print("   %-38s %5d  (%s)" % (tabla + "." + col, n, regla.lower()))
    for tabla in JSONB_LISTS:
        try:
            cur.execute("SELECT count(*) FROM %s WHERE artist_ids ?| %%s" % tabla, (list(ids),))
            n = cur.fetchone()[0]
        except Exception:
            cx.rollback()
            continue
        if n:
            total += n
            print("   %-38s %5d  (mención en artist_ids)" % (tabla + ".artist_ids", n))
    print("   %-38s %5d" % ("TOTAL de filas afectadas", total))

    if not borrar:
        print("\nEsto ha sido EN SECO: no se ha tocado nada.")
        print("Para borrarlo de verdad, vuelve a lanzarlo con  --borrar")
        return 0

    # ── 3) CONFIRMACIÓN ─────────────────────────────────────────────────────────────────────────
    print("\n⚠️  Esto NO SE PUEDE DESHACER.")
    if (input("Escribe %s para continuar: " % PALABRA).strip() != PALABRA):
        print("Cancelado: no se ha borrado nada.")
        return 1

    # ── 4) BORRAR (todo en UNA transacción) ─────────────────────────────────────────────────────
    try:
        # Las menciones dentro de los JSONB, primero: son referencias sueltas, no filas.
        for tabla in JSONB_LISTS:
            try:
                cur.execute(
                    "UPDATE %s SET artist_ids = COALESCE((SELECT jsonb_agg(x) FROM "
                    "jsonb_array_elements(artist_ids) AS x WHERE NOT (x #>> '{}' = ANY(%%s))), "
                    "'[]'::jsonb) WHERE artist_ids ?| %%s" % tabla, (list(ids), list(ids)))
                if cur.rowcount:
                    print("   · %s: %d menciones quitadas" % (tabla, cur.rowcount))
            except Exception as e:
                print("   · %s: no se pudo limpiar (%s)" % (tabla, e))
                raise
        # Lo que la base no borra sola (FK RESTRICT).
        for tabla, col in RESTRICT_ORDER:
            cur.execute("DELETE FROM %s WHERE %s::text = ANY(%%s)" % (tabla, col), (list(ids),))
            if cur.rowcount:
                print("   · %s: %d filas borradas" % (tabla, cur.rowcount))
        # Y el artista: de lo demás se encargan las FK CASCADE.
        # El ONE SHEET del artista (sep 2026): su sujeto es polimórfico (subject_kind + subject_id), sin FK.
        cur.execute("DELETE FROM onesheets WHERE subject_kind = 'ARTIST' AND subject_id::text = ANY(%s)", (list(ids),))
        cur.execute("DELETE FROM artists WHERE id::text = ANY(%s)", (list(ids),))
        print("   · artists: %d borrados" % cur.rowcount)
        cx.commit()
        print("\n✅ Hecho. Los artistas ya no existen.")
        print("⚠️  Acuérdate de BORRAR ESTA HERRAMIENTA del repo: era de un solo uso.")
        return 0
    except Exception as e:
        cx.rollback()
        print("\n❌ Algo ha fallado: %s" % e)
        print("   NO se ha borrado nada (todo iba en una transacción).")
        return 1
    finally:
        cur.close()
        cx.close()


if __name__ == "__main__":
    raise SystemExit(main())
