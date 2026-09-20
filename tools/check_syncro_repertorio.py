#!/usr/bin/env python3
"""QUITAR DEL REPERTORIO DE SYNCRO QUITA DE VERDAD · prueba de regresión.

El bug (sep 2026, lo vio Dani): en el repertorio de Syncros, «Quitar del repertorio» (los tres
puntitos de cada canción) **decía que la había quitado y la canción seguía ahí**. La causa: el
repertorio enseña las **habilitadas a mano** (`Song.sync_enabled`) **y las ONE-STOP**, que entran
SOLAS por serlo —el one-stop se CALCULA—, y el botón solo apagaba la marca de «habilitada». Como
casi todo el repertorio es one-stop, el botón no quitaba casi nunca.

El arreglo: **`Song.sync_excluded`**, una retirada a mano que manda sobre las DOS vías de entrada, y
un mensaje que se compone con lo que ha quedado de verdad (no con lo que se pedía).

Esto comprueba, contra la app REAL y la BD de PRUEBA:

  1. una canción ONE-STOP está en el repertorio sin haberla marcado (y la pantalla la pinta);
  2. **QUITARLA LA QUITA** — del punto único, de la pantalla de Syncros y del repertorio ABIERTO—,
     y el mensaje que sale es «Tema retirado del repertorio de Syncro»;
  3. la REGRESIÓN exacta: apagar solo `sync_enabled` (lo que hacía antes) NO la sacaba;
  4. retirada, **no se le puede mandar a un supervisor** aunque se llame al endpoint a mano;
  5. su ficha sigue enseñando el menú de Syncro con **«Devolver al repertorio»** (si no, se quitaría
     sin forma de deshacerlo) y no ofrece compartirla;
  6. devolverla la devuelve, y a una one-stop **no la marca a mano** (entra sola: marcarla
     escondería el motivo real por el que está dentro);
  7. lo mismo con una canción que NO es one-stop y está habilitada a mano;
  8. el enlace PÚBLICO que ya se mandó **sigue valiendo** (un supervisor no se queda con un 404);
  9. **lo que TODAVÍA NO HA SALIDO no se presenta**: ni sale en el repertorio (dentro ni abierto) ni
     se puede mandar a un supervisor, aunque sea one-stop o esté habilitada a mano —y su ficha lo
     DICE («entrará el día que se publique») en vez de parecer que no se ha guardado—. El día del
     lanzamiento YA cuenta.

    /tmp/python/bin/python3 tools/check_syncro_repertorio.py

⚠️ Necesita el entorno de /tmp que describe CLAUDE.md (Python 3.12 + Postgres embebido en el 54329).
⚠️ Es IDEMPOTENTE: crea sus propios datos con un sufijo distinto en cada pasada y los borra al
   acabar, así que pasarla dos veces seguidas da lo mismo.
Sale con código 1 si algo falla, para poder usarla en CI.
"""
import datetime
import os
import pathlib
import sys
import tempfile
import uuid
from decimal import Decimal

RAIZ = pathlib.Path(__file__).resolve().parent.parent
os.chdir(RAIZ)
sys.path.insert(0, str(RAIZ))

# ⚠️ Los CERROJOS, ANTES de importar: si no, el hilo del bootstrap ejecuta todos los `ensure_*`.
tmp = pathlib.Path(tempfile.gettempdir())
for nombre in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp / nombre).write_text("x")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("FLASK_SECRET_KEY", "check-syncro-repertorio")
os.environ.setdefault("PGCONNECT_TIMEOUT", "5")

import models                                        # noqa: E402
import app as A                                      # noqa: E402

A.app.config["WTF_CSRF_ENABLED"] = False   # ⚠️ sin esto, todo POST del test_client da un 302

OK, KO = [], []


def comprueba(nombre, cond, extra=""):
    (OK if cond else KO).append(nombre)
    print(("  OK    " if cond else "  FALLA  ") + nombre
          + ((" · " + str(extra)[:250]) if (extra and not cond) else ""))


def main() -> int:
    models.Base.metadata.create_all(models.engine)
    # ⚠️ Una COLUMNA NUEVA hay que aplicarla a mano a la base de prueba: con el cerrojo puesto el
    # bootstrap no corre, y sin su ALTER el ORM pide una columna que no existe (500 en media app).
    models.ensure_chartmetric_schema()

    s = models.SessionLocal()
    suf = uuid.uuid4().hex[:6]
    hoy = datetime.date.today()

    yo = s.query(models.User).filter(models.User.email == "check_syncro_rep@33.es").first()
    if not yo:
        yo = models.User(email="check_syncro_rep@33.es", password_hash="x", role=10)
        s.add(yo)
        s.flush()
    yo.role = 10                       # ⚠️ el rol lo manda la BD, no la sesión

    art = models.Artist(name="Los Ñus SR %s" % suf)
    # La editorial de la casa: lo que hace one-stop la parte autoral (se compara con tolerancia).
    editorial = (s.query(models.PublishingCompany)
                 .filter(models.PublishingCompany.name == "Plataforma Musical").first())
    if not editorial:
        editorial = models.PublishingCompany(name="Plataforma Musical")
        s.add(editorial)
    autor = models.Promoter(nick="Autor SR %s" % suf, contact_email="autor+sr%s@ejemplo.com" % suf)
    s.add_all([art, autor])
    s.flush()
    autor.publishing_company_id = editorial.id

    def cancion(titulo, *, one_stop: bool, habilitada: bool, sale=None):
        """Una canción del repertorio. `one_stop` decide si entra SOLA; `habilitada`, si va marcada;
        `sale` es su fecha de publicación (por defecto, ya salida)."""
        sg = models.Song(title=titulo, is_provisional=False,
                         release_date=sale or (hoy - datetime.timedelta(days=5)),
                         master_ownership_pct=Decimal("100") if one_stop else Decimal("50"),
                         sync_enabled=habilitada)
        s.add(sg)
        s.flush()
        s.add(models.SongArtist(song_id=sg.id, artist_id=art.id))
        # ⚠️ SIN MÁSTER no entra en el repertorio: se presenta lo que se puede ESCUCHAR.
        s.add(models.SongMaterial(song_id=sg.id, category="MASTER",
                                  file_name="master-%s.mp3" % sg.id,
                                  display_name="Máster",
                                  file_url="https://ejemplo/master-%s.mp3" % sg.id))
        # La autoría, al 100% de un autor de Plataforma: la tercera pata del one-stop.
        s.add(models.SongEditorialShare(song_id=sg.id, promoter_id=autor.id, role="AUTHOR_COMPOSER",
                                        pct=Decimal("100"), publishing_company_id=editorial.id))
        s.flush()
        return sg

    os_song = cancion("One-stop SR %s" % suf, one_stop=True, habilitada=False)
    man_song = cancion("A mano SR %s" % suf, one_stop=False, habilitada=True)
    # ⚠️ TODAVÍA NO HAN SALIDO: una one-stop que sale mañana y una habilitada a mano que sale en un
    # mes. Ninguna de las dos puede asomar por el repertorio ni presentarse a un supervisor.
    fut_os = cancion("Futura one-stop SR %s" % suf, one_stop=True, habilitada=False,
                     sale=hoy + datetime.timedelta(days=1))
    fut_man = cancion("Futura a mano SR %s" % suf, one_stop=False, habilitada=True,
                      sale=hoy + datetime.timedelta(days=30))
    # ⚠️ Y una que sale HOY: el día del lanzamiento YA cuenta (lo decidió Dani).
    hoy_os = cancion("De hoy SR %s" % suf, one_stop=True, habilitada=False, sale=hoy)
    s.commit()
    os_id, man_id = str(os_song.id), str(man_song.id)
    fut_os_id, fut_man_id, hoy_os_id = str(fut_os.id), str(fut_man.id), str(hoy_os.id)

    cli = A.app.test_client()
    with cli.session_transaction() as ses:
        ses["user_id"] = str(yo.id)
        ses["role"] = 10

    def en_repertorio(song_id) -> bool:
        """El PUNTO ÚNICO: lo que de verdad decide si un tema está en el repertorio."""
        ses2 = models.SessionLocal()
        try:
            canciones, _m = A._sync_repertoire_songs(ses2)
            return any(str(c.id) == str(song_id) for c in canciones)
        finally:
            ses2.close()

    def pantalla(qs=""):
        return cli.get("/syncros" + qs).get_data(as_text=True)

    def quitar(song_id):
        return cli.post("/syncros/tema/%s/habilitar" % song_id, data={"undo": "1"},
                        follow_redirects=True).get_data(as_text=True)

    def devolver(song_id):
        return cli.post("/syncros/tema/%s/habilitar" % song_id, data={},
                        follow_redirects=True).get_data(as_text=True)

    # ── 1 · UNA ONE-STOP ENTRA SOLA ────────────────────────────────────────────────────────
    print("\n1 · Una canción ONE-STOP está en el repertorio sin marcarla")
    ses2 = models.SessionLocal()
    os_calc = A._song_one_stop(ses2, ses2.get(models.Song, os_song.id))
    ses2.close()
    comprueba("la semilla es one-stop de verdad", os_calc["ok"], os_calc.get("reasons"))
    comprueba("sin estar habilitada a mano", not bool(os_song.sync_enabled))
    comprueba("está en el repertorio", en_repertorio(os_id))
    html = pantalla()
    comprueba("y la pantalla de Syncros la pinta", os_id in html)

    # ── 2 · QUITARLA LA QUITA ──────────────────────────────────────────────────────────────
    print("\n2 · «Quitar del repertorio» la quita DE VERDAD (era el bug)")
    salida = quitar(os_id)
    comprueba("ya NO está en el repertorio", not en_repertorio(os_id))
    comprueba("y la pantalla de Syncros no la pinta", os_id not in pantalla())
    comprueba("el mensaje dice que se ha retirado", "retirado del repertorio de Syncro" in salida)
    comprueba("y NO dice que no se ha podido", "No se ha podido retirar" not in salida)
    # El repertorio ABIERTO (la landing pública) sale del mismo punto único: no puede desparejarse.
    # ⚠️ Se comprueba el 200 ANTES de mirar el título: una ruta mal escrita da 404 y «no está el
    # título» saldría en verde sin haber mirado nada (me pasó al escribir esto).
    r_ab = cli.get("/repertorio-sincronizaciones")
    comprueba("el repertorio abierto responde", r_ab.status_code == 200, r_ab.status_code)
    comprueba("tampoco sale en el repertorio abierto",
              os_song.title not in r_ab.get_data(as_text=True))
    s.expire_all()
    os_song = s.get(models.Song, os_song.id)
    comprueba("queda marcada como retirada", bool(os_song.sync_excluded))
    comprueba("con su sello de cuándo y quién",
              os_song.sync_excluded_at is not None and os_song.sync_excluded_by_nick is not None)

    # ── 3 · LA REGRESIÓN EXACTA ────────────────────────────────────────────────────────────
    print("\n3 · La regresión: apagar solo «habilitada» NO la sacaba")
    os_song.sync_excluded = False       # deshace solo la retirada
    os_song.sync_enabled = False        # …que es justo lo que hacía el botón antes
    s.commit()
    comprueba("con el comportamiento viejo seguiría dentro (por ser one-stop)", en_repertorio(os_id))
    comprueba("sigue siendo one-stop aunque se retire (se calcula, no se marca)", os_calc["ok"])

    # ── 4 · RETIRADA NO SE PUEDE MANDAR ────────────────────────────────────────────────────
    print("\n4 · Retirada, no se le presenta a ningún supervisor")
    quitar(os_id)
    envio = cli.post("/syncros/tema/%s/enviar" % os_id,
                     data={"extra_emails": "supervisor+sr@ejemplo.com"},
                     follow_redirects=True).get_data(as_text=True)
    comprueba("el envío la rechaza", "no está en el repertorio de Syncro" in envio)

    # ── 5 · SU FICHA DEJA DEVOLVERLA ───────────────────────────────────────────────────────
    print("\n5 · Su ficha sigue enseñando el menú, con «Devolver al repertorio»")
    ficha = cli.get("/discografica/canciones/%s" % os_id).get_data(as_text=True)
    comprueba("la ficha abre", cli.get("/discografica/canciones/%s" % os_id).status_code == 200)
    comprueba("ofrece devolverla", "Devolver al repertorio de Syncro" in ficha)
    comprueba("dice que está fuera", "fuera del repertorio" in ficha)
    comprueba("y no ofrece quitarla otra vez", "Quitar del repertorio de Syncro" not in ficha)
    comprueba("ni mandarla a Supervisors", "Enviar a Supervisors" not in ficha)

    # ── 6 · DEVOLVERLA LA DEVUELVE ─────────────────────────────────────────────────────────
    print("\n6 · Devolverla la devuelve, y a una one-stop no la marca a mano")
    salida = devolver(os_id)
    comprueba("vuelve a estar en el repertorio", en_repertorio(os_id))
    comprueba("el mensaje lo dice", "en el repertorio de Syncro" in salida)
    s.expire_all()
    os_song = s.get(models.Song, os_song.id)
    comprueba("ya no está marcada como retirada", not bool(os_song.sync_excluded))
    comprueba("y NO se la marca a mano: entra sola por ser one-stop",
              not bool(os_song.sync_enabled))
    ficha = cli.get("/discografica/canciones/%s" % os_id).get_data(as_text=True)
    comprueba("su ficha dice por qué está dentro", "Está en el repertorio por ser One-stop" in ficha)
    comprueba("y ofrece quitarla", "Quitar del repertorio de Syncro" in ficha)

    # ── 7 · LA QUE NO ES ONE-STOP ──────────────────────────────────────────────────────────
    print("\n7 · Una que NO es one-stop, habilitada a mano")
    comprueba("está en el repertorio por estar habilitada", en_repertorio(man_id))
    quitar(man_id)
    comprueba("quitarla la quita", not en_repertorio(man_id))
    s.expire_all()
    man_song = s.get(models.Song, man_song.id)
    comprueba("apaga la marca de habilitada", not bool(man_song.sync_enabled))
    comprueba("y la marca como retirada", bool(man_song.sync_excluded))
    devolver(man_id)
    comprueba("devolverla la devuelve", en_repertorio(man_id))
    s.expire_all()
    man_song = s.get(models.Song, man_song.id)
    comprueba("y a esta SÍ la marca a mano (si no, se quedaría fuera)", bool(man_song.sync_enabled))

    # ── 8 · EL ENLACE YA MANDADO SIGUE VALIENDO ────────────────────────────────────────────
    print("\n8 · Un enlace ya mandado a un supervisor no se rompe al retirar el tema")
    ses2 = models.SessionLocal()
    # ⚠️ `url_for` FUERA de una petición revienta («Working outside of application context»): el
    # enlace público se compone dentro de un contexto de petición, como en la app.
    with A.app.test_request_context("/"):
        url = A._sync_song_share_url(ses2, ses2.get(models.Song, os_song.id))
    ses2.commit()
    ses2.close()
    token = url.rsplit("=", 1)[-1] if "=" in url else url.rsplit("/", 1)[-1]
    quitar(os_id)
    r = cli.get("/syncro?token=%s" % token)
    comprueba("la página pública del tema sigue abriendo", r.status_code == 200, r.status_code)

    # ── 9 · LO QUE TODAVÍA NO HA SALIDO NO SE PRESENTA ─────────────────────────────────────
    print("\n9 · Una canción que todavía no ha salido no puede estar en el repertorio")
    comprueba("la one-stop que sale mañana NO está", not en_repertorio(fut_os_id))
    comprueba("la habilitada a mano que sale en un mes tampoco", not en_repertorio(fut_man_id))
    html = pantalla()
    comprueba("la pantalla de Syncros no las pinta",
              fut_os_id not in html and fut_man_id not in html)
    r_ab = cli.get("/repertorio-sincronizaciones")
    comprueba("el repertorio abierto tampoco", r_ab.status_code == 200
              and fut_os.title not in r_ab.get_data(as_text=True)
              and fut_man.title not in r_ab.get_data(as_text=True))
    # ⚠️ El día del lanzamiento YA cuenta: la que sale HOY sí está.
    comprueba("la que sale HOY sí está (el día del lanzamiento ya cuenta)", en_repertorio(hoy_os_id))

    print("\n9.1 · Y no se le puede presentar a un supervisor")
    for cid, quien in ((fut_os_id, "one-stop de mañana"), (fut_man_id, "habilitada de dentro de un mes")):
        envio = cli.post("/syncros/tema/%s/enviar" % cid,
                         data={"extra_emails": "supervisor+sr@ejemplo.com"},
                         follow_redirects=True).get_data(as_text=True)
        comprueba("el envío rechaza la %s" % quien, "todav" in envio and "no se ha publicado" in envio,
                  envio[-300:] if "todav" not in envio else "")
    envio = cli.post("/syncros/tema/%s/enviar" % fut_os_id,
                     data={"extra_emails": "supervisor+sr@ejemplo.com"},
                     follow_redirects=True).get_data(as_text=True)
    comprueba("y dice CUÁNDO sale, no «no está en el repertorio»",
              "no está en el repertorio" not in envio)
    ses2 = models.SessionLocal()
    comprueba("no queda ni un envío apuntado",
              ses2.query(models.SyncSubmission)
              .filter(models.SyncSubmission.song_id == fut_os.id).count() == 0)
    ses2.close()

    print("\n9.2 · Su ficha lo dice, en vez de parecer que no se ha guardado")
    ficha = cli.get("/discografica/canciones/%s" % fut_man_id).get_data(as_text=True)
    comprueba("dice que entrará al publicarse", "Syncro · al publicarse" in ficha)
    comprueba("y con la fecha en la que entrará", "Todav" in ficha and "no se ha publicado" in ficha)
    comprueba("no ofrece mandarla a Supervisors", "Enviar a Supervisors" not in ficha)
    comprueba("pero sí decidir que no entre", "Que no entre al publicarse" in ficha)
    ficha_os = cli.get("/discografica/canciones/%s" % fut_os_id).get_data(as_text=True)
    comprueba("y en la one-stop futura dice que entrará por serlo",
              "Entrará por ser One-stop" in ficha_os)

    print("\n9.3 · Se puede decidir por adelantado que NO entre")
    quitar(fut_os_id)
    s.expire_all()
    comprueba("queda retirada", bool(s.get(models.Song, fut_os.id).sync_excluded))
    ficha_os = cli.get("/discografica/canciones/%s" % fut_os_id).get_data(as_text=True)
    comprueba("y su ficha lo dice", "fuera del repertorio" in ficha_os)
    devolver(fut_os_id)

    print("\n9.4 · Marcarla a mano antes de tiempo lo dice claro")
    salida = devolver(fut_man_id)
    comprueba("el mensaje dice que entrará al publicarse",
              "entrar" in salida and "public" in salida, salida[-300:])
    # ⚠️ El texto EXACTO del caso malo: un «No se ha podido» a secas lo tiene también la pantalla
    # («No se ha podido componer la vista previa»), y la comprobación salía en rojo sin haber nada
    # roto.
    comprueba("y NO dice que no se ha podido meter",
              "No se ha podido meter en el repertorio" not in salida)

    # ── 10 · PRUEBA DE HUMO ────────────────────────────────────────────────────────────────
    print("\n10 · Las pantallas de Syncros y la ficha, enteras")
    malas = [q for q in ("", "?section=onestop", "?section=supervisors", "?solo_os=1")
             if cli.get("/syncros" + q).status_code != 200]
    comprueba("las pantallas de Syncros abren", not malas, malas)
    malas = [t for t in ("informacion", "materiales", "editorial", "registros")
             if cli.get("/discografica/canciones/%s?tab=%s" % (man_id, t)).status_code != 200]
    comprueba("las pestañas de la ficha de la canción abren", not malas, malas)
    comprueba("el repertorio abierto abre",
              cli.get("/repertorio-sincronizaciones").status_code == 200)

    # ── LIMPIEZA: la comprobación es IDEMPOTENTE (pasarla dos veces da lo mismo) ────────────
    for sid in (os_song.id, man_song.id, fut_os.id, fut_man.id, hoy_os.id):
        s.query(models.SongEditorialShare).filter(models.SongEditorialShare.song_id == sid).delete()
        s.query(models.SongMaterial).filter(models.SongMaterial.song_id == sid).delete()
        s.query(models.SongArtist).filter(models.SongArtist.song_id == sid).delete()
        s.query(models.Song).filter(models.Song.id == sid).delete()
    s.query(models.Promoter).filter(models.Promoter.id == autor.id).delete()
    s.query(models.Artist).filter(models.Artist.id == art.id).delete()
    s.commit()
    s.close()

    print("\n%d bien · %d mal" % (len(OK), len(KO)))
    if KO:
        for k in KO:
            print("   ✗ " + k)
        print("FALLA · quitar del repertorio de Syncro no quita")
        return 1
    print("OK · quitar del repertorio de Syncro quita, y devolverlo lo devuelve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
