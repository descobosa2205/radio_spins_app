# CLAUDE.md — Contexto para asistentes (Radio Spins App)

Back office interno de **33 Producciones** (productora) y **Pies Records** (sello). Gestiona
conciertos/ventas, discográfica, invitaciones, promoción/medios, bolsas y administración, y
usuarios/permisos. Detalle ampliado en `README.md`.

## ⚠️⚠️ CÓMO USAR ESTA GUÍA (léelo antes que nada)

La guía está **TROCEADA**. Este fichero es solo lo que vale para **cualquier** tarea; el detalle
de cada área vive en `docs/app/*.md` y **se lee bajo demanda**.

1. **Empieza SIEMPRE por buscar en todas a la vez** — un tema suele tocar más de un área:
   `grep -rn "lo que sea" docs/app/` · `grep -rln "_nombre_de_funcion" docs/app/`
   Te dice en qué ficheros está y evita leer el que no toca (o perderte el que sí).
2. **ANTES de tocar un área, lee su fichero entero.** El índice está al final («Dónde está cada
   cosa») y cada fichero abre con un «Qué hay aquí». Ahí está el porqué de cada decisión y las
   trampas que ya costaron un bug.
3. **Al terminar una épica, la nota va al fichero de SU área**, no aquí. Aquí solo entra lo que
   se aplica a todo (una trampa de Jinja, del ORM, del esquema, del dinero).
4. ⚠️ **Nunca referencies estos ficheros con `@docs/...`**: esa sintaxis los importa y los carga
   enteros en cada sesión, que es justo lo que se quiere evitar. Rutas en texto plano.

> Por qué: esta guía llegó a 1,16 MB (~320.000 tokens) cargados en cada sesión antes de leer una
> línea de código, para usar el 3-5% en una tarea concreta. Troceada, el arranque cuesta ~10k y
> cada área entre 1k y 35k. **No se ha borrado nada**: solo cambió cuándo se lee.

## ⚠️ Reglas de oro

- **NO tocar la base de datos de producción.** El `.env` contiene credenciales **reales** de
  Supabase (Postgres + service-role). Para verificar código, importar con un `DATABASE_URL` ficticio
  (ver abajo); el arranque es *best-effort* y no falla sin BD.
- **No subir `.venv/`** (está en `.gitignore`). `.env` y `users.txt` **sí** están versionados a
  propósito por ahora (decisión del usuario; pendiente de limpiar en la fase de seguridad).
- Trabajar **por lotes y confirmando** con el usuario (Dani, en español). Él hace el `push` o lo pide;
  despliega en vivo en Render.

## Stack y arquitectura

- **Flask 3 + SQLAlchemy 2 + PostgreSQL (Supabase)**, **Bootstrap 5** + Font Awesome + Select2 +
  jQuery + Chart.js. Servidor: **Gunicorn**.
- Monolito: **`app.py`** (~34k líneas, ~344 rutas, TODA la lógica) · **`models.py`** (~93 modelos +
  funciones `ensure_*_schema`) · `config.py` · `supabase_utils.py` (Storage).
- **`templates/`** (Jinja2, 80) · **`static/css/styles.css`** · **`static/js/scripts.js`**
  (+ `quick_create.js`, `typeahead.js`, `ajax_inline.js`, `modal_stack.js`, `csrf.js`, `entity_links.js`,
  `concert_form.js`, `ficha_inline.js`).
- **Sin Alembic**: el esquema se crea/actualiza al arrancar con `init_db()` + `ensure_*_schema()`
  (idempotentes). Para cambios de modelo basta reiniciar; no hay migración manual.

## Verificación local con la APP REAL (entorno completo de prueba)
Esta máquina solo trae Python 3.9 (la app usa sintaxis 3.10+), pero se puede montar TODO en /tmp:
```bash
# 1) Python 3.12 standalone (arm64) + deps:   /tmp/python  (ya montado si existe)
curl -sL -o /tmp/cpython.tar.gz "https://github.com/astral-sh/python-build-standalone/releases/download/20250712/cpython-3.12.11+20250712-aarch64-apple-darwin-install_only.tar.gz" && tar xzf /tmp/cpython.tar.gz -C /tmp
/tmp/python/bin/python3 -m pip install -r requirements.txt
# 2) Postgres embebido (zonky, sin brew): bajar el JAR de embedded-postgres-binaries-darwin-arm64v8
#    (repo1.maven.org), unzip → postgres-darwin-arm_64.txz → tar xf en /tmp/pg16.
#    ⚠️ El paquete SOLO trae initdb/pg_ctl/postgres: NO hay psql ni pg_isready → usar psycopg2.
#    initdb -D /tmp/pgdata -U postgres -A trust ; pg_ctl -D /tmp/pgdata -o "-p 54329" -l /tmp/pg.log start
#    ⚠️ CREAR LA BD EN UTF-8 A MANO: sin LANG utf-8 el clúster sale SQL_ASCII y create_all revienta con
#       UnicodeEncodeError en la primera 'ñ'  →  CREATE DATABASE radiotest ENCODING 'UTF8'
#       LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;  luego CREATE EXTENSION "uuid-ossp";
# 3) Arrancar la app con BD de PRUEBA (¡nunca la real!):
#    DATABASE_URL="postgresql://postgres@127.0.0.1:54329/radiotest?sslmode=disable" (config añade sslmode=require si falta)
#    ⚠️ Para APLICAR el esquema no vale borrar el cerrojo y llamar a _bootstrap_schema_bg(): el hilo
#       demonio que arranca al importar `app` YA tiene el cerrojo y la llamada sale sin hacer nada.
#       Hay que ESPERAR al hilo:  import app; [t.join() for t in threading.enumerate() if t is not main]
#       (tarda >10 min; con ~158 tablas creadas ya se puede trabajar aunque se corte al final).
#    ⚠️⚠️ Y BORRAR EL CERROJO **ANTES** DE IMPORTAR: cualquier `import app` anterior (p. ej. el del
#       recuento de rutas con BD falsa) deja `app33_schema_bootstrap.lock` en el tempdir, y con él
#       puesto el hilo SALE SIN HACER NADA y no se crea ni una tabla — sin dar ningún error, así que
#       parece que "va lento". Borrar también `app33_personnel_bootstrap.lock`.
#    ⚠️ El CATÁLOGO de permisos (CURATED → user_access_resources) NO lo siembra ese hilo: va en
#       `_bootstrap_personnel_bg` (2º plano, tras la primera petición) y un `test_client()` que
#       termina rápido se muere antes. Para tenerlo en la BD de prueba, llamar en primer plano a
#       `_bootstrap_access_and_personnel()` dentro de `app.app_context()`.
# 4) Sembrar usuario role 10 + artista/recinto/concierto vía modelos (User exige password_hash);
#    lo más cómodo es `app.test_client()` + `session_transaction()` en vez de login por curl.
#    Para conceder permisos hace falta sembrar antes UserAccessResource desde CURATED_ACCESS_RESOURCES.
# ⚠️ Los errores 500 muestran la página de MANTENIMIENTO (errorhandler 500 → maintenance.html):
#    si el usuario dice «sale la página de cerrado por mantenimiento», es un 500 → buscar traceback en el log.
```
### ⚡️ EL ESQUEMA DE PRUEBA EN MEDIO SEGUNDO (no hace falta esperar al bootstrap)
Lo que tarda >10 min es `_bootstrap_schema_bg` (ejecuta TODOS los `ensure_*` con sus ALTER uno a uno).
Para probar código **no hace falta**: se deja el CERROJO PUESTO (así el hilo sale sin hacer nada) y se
crea el esquema de golpe con `create_all`, que son **211 tablas en ~0,5 s**:
```python
import tempfile, pathlib
tmp = pathlib.Path(tempfile.gettempdir())
for n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    (tmp/n).write_text("x")          # ⚠️ ANTES de importar app/models
import models; models.Base.metadata.create_all(models.engine)
# y si el cambio añade columnas por ALTER, su ensure_* a mano: models.ensure_song_radio_schema()
```
⚠️ **En las pruebas hay que desactivar el CSRF** (`A.app.config["WTF_CSRF_ENABLED"] = False`): sin eso
todo POST del `test_client` devuelve un **302 a /home con el flash de «sesión caducada»** y parece que
el endpoint no guarda nada.
⚠️ **El rol lo manda la BD, no la sesión**: poner `ses["role"] = 10` no basta (`_current_user_state()`
lo lee del usuario), así que para probar algo de dirección hay que ponerle `role = 10` en la fila.
⚠️ Para probar una subida sin Storage: `A.upload_file = lambda fs, folder, **kw: "https://x/…"`.
⚠️ Y una **prueba de humo que vale mucho**: pedir con el `test_client` **todas las pestañas** de la
ficha que se ha tocado. Así salió el 500 de `lg.values` (ver la regla de los dicts en Jinja).

## Verificación local (sin BD)
```bash
# Entorno virtual: el wrapper .venv/bin/pip tiene shebang roto -> usar python -m pip
.venv/bin/python -m py_compile app.py models.py            # compila
# Nombres no definidos (NameError en runtime) -> pyflakes aislado:
.venv/bin/python -m pip install --target /tmp/pf pyflakes && PYTHONPATH=/tmp/pf .venv/bin/python -m pyflakes app.py | grep "undefined name"
# Import + rutas sin tocar BD real:
DATABASE_URL="postgresql://u:p@127.0.0.1:1/db" PGCONNECT_TIMEOUT=2 SUPABASE_URL="" SUPABASE_SERVICE_ROLE_KEY="" FLASK_SECRET_KEY="t" \
  .venv/bin/python -c "import app; print(len(list(app.app.url_map.iter_rules())),'rutas')"
# Parse de todas las plantillas Jinja:
.venv/bin/python -c "import glob,jinja2; [jinja2.Environment().parse(open(f,encoding='utf-8').read()) for f in glob.glob('templates/*.html')]; print('OK')"
```

## Comprobaciones de la casa (`tools/`)

Pásalas cuando toques lo que cubren; varias encontraron bugs reales que no daban ningún error.
Necesitan Python 3.10+ → `/tmp/python/bin/python3` (ver «Verificación local»).

| herramienta | qué caza | cuándo |
|---|---|---|
| `check_divs.py` | un `</div>` de más **y** pantallas que dan 500 (814 pantallas con la app real) | al tocar plantillas |
| `check_botones.py` | botones muertos: destino inexistente, handler que muere al repintar, función sin definir | al tocar plantillas o JS |
| `check_permisos.py` | enlaces y formularios pintados que acaban en 403 (usuario por recurso) | al tocar permisos, barras de pestañas o botones |
| `check_access_coverage.py` | escrituras sin recurso en el catálogo de permisos | al añadir endpoints |
| `check_pago_inmediato.py` | el correo a administración cuando se pide un pago inmediato (sus datos, quién lo pide con su foto y el botón de gestionarlo) | al tocar las solicitudes de pago o el motor de correos |
| `check_iban_factura.py` | que ninguna factura llegue a pago sin número de cuenta (se fija al subirla y se exige al guardar el gasto) | al tocar gastos, facturas o pagos |
| `check_gasto_factura_primero.py` | añadir un gasto empezando por la factura: se lee, rellena lo demás, reconoce al proveedor y pide en amarillo lo que le falte a su ficha | al tocar el formulario de un gasto de bolsa |
| `check_money.py` | los dos parsers de importes y su espejo en JS | al tocar dinero |
| `check_plan_pagos.py` | lo que se cobra de una actividad: los equipos que se le facturan al promotor y la parte del caché de cada socio (lo nuestro no se cobra a nadie) | al tocar el plan de pagos, el equipamiento o los socios |
| `check_aviso_cambios.py` | un cambio en una actividad: la etiqueta «Cambio · Antes: …» pegada al dato y que el artista lo acepte (amarillo mientras no conteste) | al tocar el aviso al artista o los cambios de una actividad |
| `check_resultado_cache.py` | el resultado de una actividad que NO es de taquilla nuestra: el reparto del caché entre la oficina y el artista (contrato, gastos y comisionistas) | al tocar el resultado de una actividad, los cachés o las comisiones |
| `check_resultado.py` | la barra de simular el resultado: el 100% es el AFORO, y marca dónde estamos | al tocar el resultado de una actividad o `sim_calc` |
| `check_ofertas.py` | simular sobre una actividad y las ofertas (descuentos y packs) del ticketing | al tocar las simulaciones o `sim_calc` |
| `check_contactos.py` | los contactos de una actividad: los del promotor ya puestos, la «x» y el alta | al tocar contactos |
| `check_direcciones.py` | el autocompletado de direcciones, **también fuera de España**, y su espejo en JS | al tocar `geo_utils.py` o `address_autocomplete.js` |
| `check_duplicados.py` | fichas de tercero repetidas: que se detecten, que no se creen y que se fusionen | al tocar terceros |
| `check_invoice_read.py` | lectura de facturas reales (nº, fecha, base, IVA, retención) | al tocar `invoice_read.py` |
| `check_royalty_statement_read.py` | lectura de liquidaciones de compañías | al tocar `royalty_statement_read.py` |
| `check_mrz.py` | lector de DNI/NIE/pasaporte **y la paridad Python ↔ JS** | al tocar `mrz_utils.py` o `doc_scan.js` |
| `check_ics_import.py` · `check_ics_download.py` | motor de iCal y la **salida a la red** de verdad | al tocar `ics_import.py` |
| `check_audio_tags.py` | metadatos que se escriben en lo que se descarga | al tocar `audio_tags.py` |
| `check_press_render.py` | notas de prensa: el correo sale como se ve en el editor | al tocar `press_render.py` |
| `check_diseno_comunicaciones.py` | el editor que vale para los tres envíos: el cartel de una actividad (también en PDF), los módulos que se arrastran vacíos y elegir varios a la vez | al tocar `press_editor.js`, `press_render.py` o el cartel de una actividad |
| `check_carteleria_modificacion.py` | pedir que cambien un cartel (con sus archivos) y reemplazar los del promotor: se archivan los de antes y queda pendiente compartir los nuevos | al tocar la cartelería de una actividad |
| `check_mapa_fechas.py` | el mapa de la ruta de una gira o un ciclo (listado numerado + chinchetas con el número) y el pop-up para vincular varias fechas a la vez | al tocar la ficha de una gira, un ciclo o un festival |
| `check_plano_recinto.py` | el diseñador del plano: marcar las butacas de un bloque y que un plano nuevo no tape lo que ya hay | al tocar `venue_map.js` |
| `check_hoja_ruta.py` · `check_externos.py` · `check_invitaciones_generadas.py` | esas épicas de punta a punta con la app real | al tocarlas |
| `check_invitaciones_corporativas.py` | la lista de invitados de cada uno y su envío (el módulo de la actividad, el fichero, que sale desde su correo y que nadie ve lo de nadie) | al tocar las invitaciones corporativas o el editor de diseños |
| `check_anuncio_carteleria.py` | pedirle al promotor la fecha de anuncio y los carteles, los dos vistos buenos y el recordatorio del día | al tocar el anuncio o la cartelería |
| `check_promotor.py` | confirmarle la actividad al promotor y la ficha donde rellena lo que falta (y que nada se carga sin revisarlo) | al tocar el aviso al promotor o la ficha de contratación |
| `check_syncro_repertorio.py` | el repertorio de Syncros: quitar una canción la quita de verdad (también si es one-stop, que entra sola), devolverla la devuelve, y lo que todavía no ha salido no se presenta | al tocar el repertorio de Syncros o el one-stop |
| `check_soldout.py` | el Sold Out de punta a punta: a quién se avisa, la tarea de comunicárselo (bloqueada sin cartel), el correo y la tarea de redes | al tocar el Sold Out |
| `check_gratuito.py` | que en una actividad gratuita no asome la salida a la venta (configuración, ficha, aviso al artista, ficha del promotor) | al tocar la salida a la venta o lo gratuito |
| `check_onesheet.py` | el One Sheet de punta a punta: la pestaña crea la fila, la página pública pinta solo lo que toca (fechas confirmadas y anunciadas, Sold Out, certificaciones, países, prensa, fotos), el editor, guardar, plantillas, el Roster y los permisos | al tocar el One Sheet, el Roster o `onesheet_render.py` |
| `check_camerinos.py` | la hoja de ruta en CAMERINOS (la pantalla de los Echo Show, `/camerinos`): elegir cuál y qué hoja se ve (solo una en toda la casa), que enseña solo los horarios de esa hoja sin filtrar teléfonos, notas ni habitaciones, la versión del sondeo, los permisos y el botón del panel; y los AVISOS a las pantallas (mandar, los rápidos, visto en x de y, retirar, caducar) | al tocar `/camerinos`, el botón «Camerinos» del panel de la hoja de ruta, `_camerinos_item` o los avisos |
| `diag_reparto_editorial.py` | dónde se corta el reparto editorial de un autor (solo lee) | al depurar royalties |

⚠️⚠️ **UNA COLUMNA NUEVA HAY QUE APLICARLA A LAS BASES DE PRUEBA A MANO**: el cerrojo del tempdir
deja el bootstrap sin ejecutar, así que el `ALTER` no corre y el ORM pide una columna que no existe
→ **decenas de pantallas con un 500** (61 de golpe, y ninguna tenía nada que ver con el cambio). Se
arregla llamando a SU `ensure_*` en cada base que se use para probar:
`models.ensure_bag_expense_schema()` sobre `radiotest`, `radiocorp`, `radiocaja`…

⚠️⚠️ **UNA COMPROBACIÓN QUE ESCRIBE EN UN DATO COMPARTIDO FALLA EN LA SEGUNDA PASADA** (sep 2026,
pasó dos veces con `check_invitaciones_generadas`). Un apartado le cambiaba la dirección al recinto
de la semilla «para tener algo que poner debajo», y el apartado 1 de la pasada siguiente —que espera
la dirección sembrada— salía en rojo **sin que hubiera nada roto**; lo mismo con la cartelería de una
GIRA, que no cuelga de la actividad y no se va al borrar los conciertos. **Las comprobaciones son
IDEMPOTENTES**: o no tocan lo compartido, o lo dejan como estaba, o lo borran al empezar. Y la
prueba de que lo son es **pasarlas dos veces seguidas**.

⚠️⚠️ **CON LA BD DE PRUEBA LLENA, LAS COMPROBACIONES SE QUEDAN SIN CONEXIONES Y MIENTEN** (sep
2026). El pool de la app es **6+6**, y una herramienta que recorre cientos de pantallas acaba
pidiendo más: salta un `QueuePool limit … timed out` y esa pantalla **se cuenta como un 500** que no
existe (pasó con `/acceso-terceros` y con `/conciertos?tab=vista`, las dos buenas al pedirlas a
mano). **Antes de dar por bueno un 500 de `check_divs` o `check_permisos`, repetir con el pool
grande** y solo entonces creerlo:
`DB_POOL_SIZE=40 DB_MAX_OVERFLOW=40 /tmp/python/bin/python3 tools/check_divs.py`

**Ver la app en el navegador**: `.claude/launch.json` → `tools/dev_server.py` (Flask contra la BD de
PRUEBA, cerrojos puestos, CSRF desactivado y auto-reload de plantillas). Se abre con `preview_start`.
⚠️ **No recarga `app.py`**: al tocar Python hay que reiniciarlo.

## Convenciones que valen para CUALQUIER tarea

Lo de siempre: **rutas** `@app.get/@app.post` casi todas con `@admin_required` (solo exige sesión;
la autorización la hace el `before_request`) · **sesiones BD** `s = db()` con `try/except rollback/
finally close`, o `with get_db() as s` · **dinero siempre `Decimal`**, nunca `float`.

### Las trampas que ya costaron un bug (una línea cada una)

**Esquema y modelos**
- Una **columna nueva** va en **su propia sentencia** del `ensure_*` (`ALTER TABLE x ADD COLUMN IF
  NOT EXISTS`). Metida en un `DO $$ … IF NOT EXISTS(…) THEN ALTER` que ya existe **puede no
  ejecutarse nunca** y la app revienta al leerla. → detalle abajo.
- Un **estado nuevo** hay que añadirlo también al **CHECK de la BD** (`CONCERT_STATUS_VALUES`), o
  guardar ese estado es un `CheckViolation`. → detalle abajo.
- ⚠️ **Ni un `%` en el DDL de un `ensure_*`**: va por `exec_driver_sql` y psycopg2 lee cualquier `%`
  como un parámetro suyo → la sentencia **entera** falla con «immutabledict is not a sequence», y eso
  es solo un aviso en el log: parece aplicada y no lo está. → detalle abajo.
- **JSONB**: leer-copiar-reasignar **no escribe la segunda vez en la misma petición** (el valor sale
  «unchanged» y no da ningún error) → `flag_modified(obj, "campo")`.
- Nombres de campo que se confunden: `Promoter` es **`contact_email`/`contact_phone`** (no
  `email`/`phone`) · `PromoterCompany` es **`legal_name`** (no `name`) · `PromoterContact` es
  **`first_name`/`last_name`** (no `name`) · `Song` no tiene `artist_id` (va por `SongArtist`) ·
  `UserProfile` tiene el `nick`, `User` el correo, y el departamento es **`departments`, una LISTA**
  (se compara con `_profile_in_department`, nunca en crudo) · el contacto de **TICKETING** vive en
  `ticketing_payload['ticketing_contact']`, **no** en `ticketing_payload['contacts']` como los demás
  roles · y `ticketing_payload['contacts_own']` es la **lista de roles ya decididos**, no un
  booleano. → `docs/app/terceros-medios.md`
- Las **hojas de ruta** ya no son dos fijas: el catálogo vivo es **`_roadmap_sheet_kinds()`**
  (GENERAL y TÉCNICA de serie + las creadas con nombre e icono). Nada nuevo debe iterar
  `ROADMAP_KINDS`/`ROADMAP_SHEET_KEYS` (solo las de serie). → `docs/app/produccion-hoja-ruta.md`
- `parse_date("")` **revienta** → `parse_optional_date`. `to_uuid` con algo que no es UUID
  **revienta** → `_safe_uuid` (en cualquier id que venga de una URL pública).

**Python**
- **Dos funciones con el mismo nombre**: la última pisa a la primera y la primera es código muerto.
  Comprobación: `grep -oE "^def [a-zA-Z_][a-zA-Z0-9_]*" app.py | sort | uniq -d` → **vacío**.
  Pyflakes NO lo detecta. → detalle abajo.
- `_send_optional_email` devuelve **`(ok, error)`**: tratarlo como booleano da por enviado lo que
  rebotó. Si el aviso no sale, **no se marca como avisado**.
- **Fuera de una petición** (un cron, un hilo): `url_for` revienta («Working outside of application
  context») y `session` también → protegerlos o componer la URL a mano. `_notify_user` mira
  `session`, así que necesita contexto de **PETICIÓN**, no solo de aplicación (`_soldout_app_context`).
- Un endpoint nuevo se mapea con una **regla de PREFIJO** en `_resolve_request_resource_key`; puesto
  en su `mapping` interno es **código muerto** y el gate no comprueba nada. → `docs/app/permisos.md`

**Jinja**
- `d.items` / `d.keys` / `d.values` / `d.get` devuelven el **método**, no la clave → `d['items']`;
  y **no llames `items` a una clave** que se vaya a leer en una plantilla.
- `{% import %}` / `{% from %}` **sin `with context`** no ven los globales (salen vacíos, sin error).
- `|tojson` dentro de un atributo con comillas dobles **corta el atributo** → `|tojson|forceescape`;
  dentro de un `<script>`, `|tojson` **a secas** (ahí `forceescape` rompe el JS).
- ⚠️ **`escape()` devuelve un `Markup`, y sus `.replace()` / `+` VUELVEN A ESCAPAR lo que se les
  mete**: el HTML que se inserta sale como texto (`&lt;strong&gt;`). Al componer un cuerpo de correo
  a mano, `str(escape(x))` desde el principio. → detalle en `docs/app/promocion-prensa.md`.
- Un `{% include %}` **fuera del `{% block content %}`** se pinta antes del `<!doctype>` (quirks mode).
- Un `</div>` de más o un `<style>` sin cerrar no dan error: los caza `tools/check_divs.py`.

**Navegador**
- Dentro de una zona `data-inline-zone` (se reemplaza por AJAX al guardar): un `<script>` **no se
  vuelve a ejecutar** y los listeners pegados a nodos **mueren** → **delegación en `document`**,
  siempre. Y el estado lo pinta el **servidor** (ocultos en el HTML), no el JS.
- Un campo **oculto SE ENVÍA igual** → al esconder un panel hay que **deshabilitar** sus campos
  (y un `required` invisible bloquea el envío sin decir por qué).
- `shown.bs.modal` **no siempre llega** (con `modal_stack.js` por medio) → lo que haya que montar al
  abrir un modal se monta **en el propio clic**.
- ⚠️⚠️ **UN `<a>` DENTRO DE OTRO `<a>` PARTE EL HTML**: el navegador saca lo de dentro FUERA del
  enlace, sin dar ningún error. Dentro de una fila que ya es un enlace, los items de un menú van en
  **`<button>`**. → detalle abajo. Lo caza `tools/check_divs.py`.
- Un **atributo `data-*` de ESTADO no puede llamarse como el que selecciona un botón**: el
  `closest('[data-x]')` del handler acaba encontrando el contenedor y se come los clics de dentro.
  → detalle abajo.
- Un parcial que se pinta **varias veces** en la misma página no puede llevar `id` fijos (sufijo por
  fila), o `getElementById` y los `<label for>` cogen el primero.
- Bootstrap se carga **después** del contenido: los scripts en línea de una plantilla corren antes
  (reintentar, o `DOMContentLoaded`). Y `style.display='none'` no oculta un `.d-flex` → `d-none`.
- ⚠️ **`object-fit` sobre un `<div>` NO HACE NADA**: la clase de una foto (`ficha-hero__media`,
  `artist-avatar`…) va **en el propio `<img>`**. Envuelto en un `<div>` con esa clase, la imagen se
  queda a su tamaño natural dentro del marco (bug real con captura: la cabecera de una gira).
- Un hijo de un flex o de un grid **se encoge por debajo de su contenido** (fotos ovaladas, texto
  partido letra a letra) → `flex:0 0 auto` en lo de tamaño fijo, `min-width:0` en lo que debe bajar.
- `stopPropagation` no detiene a otro listener del **mismo** nodo (el loader, el AJAX y el motor
  escuchan `submit` en `document`) → `stopImmediatePropagation`.
- Iconos: comprobar que existen en esta versión de Font Awesome antes de usarlos (salen **vacíos**),
  y los de **marca** van en `fa-brands`, no en la familia sólida. → comando abajo.
- ⚠️ **La FECHA de algo que sale de casa lleva su DÍA DE LA SEMANA**: «Lunes 11 de Abril de 2026»
  (`format_date_long_es`, filtro `|fecha_larga`). Es lo primero que mira quien lo recibe.
  → `docs/app/avisos-correo-sms.md`
- ⚠️⚠️ **EN UN CORREO, EL ICONO VA COMO IMAGEN, NUNCA UN EMOJI NI `<i class="fa">`**: punto único
  **`_brand_icon`** (PNG del sólido de la casa en el color de marca). Y el `<img>` necesita
  `max-width:none`, o el `img{max-width:100%}` de la app lo deja en **0 px** dentro de una celda
  estrecha. → detalle abajo.

**Datos que escribe una persona**
- **Dinero: hay DOS parsers y el formato lo decide el ORIGEN.** `_parse_money_decimal` para lo que
  escribe una persona (un formulario, un PDF, un Excel: «40.000» son cuarenta mil) y `_money_value`
  para lo que ya es un dato (una columna, un JSONB, un cálculo: el punto es decimal). Los
  porcentajes van aparte (`_parse_pct_decimal`). Espejado en `money_input.js`, `invoice_read.py` y
  `buyer_import.py`: **si se toca uno, se tocan los cuatro** (`tools/check_money.py`).
  → `docs/app/administracion-pagos.md`
- **Centinelas**: si el formulario no trae el campo, **no se toca el dato** (`x_present`). Sin eso,
  un guardado parcial de otra pantalla borra lo que no preguntaba.
- Un texto libre (un departamento, el concepto de un contrato, un género) **se compara con
  tolerancia**: sin acentos, sin mayúsculas y por palabra (`_norm_text_key`, `_profile_in_department`).
- Un formulario rechazado se devuelve con **`_flash_form_error`** (mensaje en español + campos a
  marcar + qué modal reabrir), nunca con un flash suelto: hay decenas de flashes ámbar que
  significan ÉXITO. → `docs/app/ui-plantillas.md`

**Reglas de producto que se repiten**
- **Un punto único**: si un dato se enseña en dos sitios, sale de la misma función. Y si se calcula,
  **no se guarda** también (se desparejan).
- **Una tarea desaparece sola** cuando lo que esperaba ya está hecho (`_notify_resolve`): se mira el
  DATO, no una marca aparte.
- **Lo que no se puede abrir no se pinta**, y si aun así se llega, el gate lleva a lo que sí puede
  ver en vez de denegar (`_access_fallback_url`). → `docs/app/permisos.md`
- **Un permiso se hereda del PADRE**: tener una sección da todas sus pestañas. Para lo que no puede
  ver cualquiera que trabaje en esa sección (la **Caja** de un artista) está **`EXACT_ACCESS_KEYS`**:
  esas claves se comprueban exactas. → `docs/app/permisos.md`
- **Nunca se dice que algo se ha enviado si no salió**, y un rechazo **deja rastro** (no puede ser
  invisible).
- Los **errores 500 muestran la página de MANTENIMIENTO**: si Dani dice «sale la página de cerrado
  por mantenimiento», es un 500 → buscar el traceback en el log.

### El detalle de esas trampas

- **Rutas**: `@app.get/@app.post/@app.route`, casi todas con `@admin_required` (solo exige sesión;
  la autorización real la hace el `before_request`).

- ⚠️⚠️ **UN `{% from %}` SIN `with context` NO VE LOS GLOBALES** (bug real, sep 2026, la misma trampa
  que ya documentaba el pop-up de marketing): `_playlist_row.html` se importaba así en TRES pantallas,
  con lo que `DEFAULT_COVER_URL` y `DEFAULT_AVATAR_URL` llegaban **vacíos** y las maquetas sin
  portada salían con `<img src="">` — solo se salvaban porque el respaldo del navegador les ponía la
  imagen después—. Ahora se importa **`with context`** y la imagen de «sin portada» la pone el
  SERVIDOR, que es lo que hace falta para que también valga en el `data-pl-cover` que ve el coche.

- ⚠️⚠️ **UN `{% include %}` FUERA DEL `{% block content %}` SE PINTA ANTES DEL `<!doctype>`** (bug
  real con captura, ago 2026). El pop-up de envío de Syncros estaba al final de `song_detail.html`,
  **después del `{% endblock %}`**: Jinja lo emitía en la **línea 2 del documento**, antes de la
  cabecera, y el navegador entraba en **quirks mode** pintando ese trozo SIN ESTILOS hasta que
  llegaba el CSS. Por eso pasaba **solo en las fichas one-stop** (las únicas que lo incluían).
  ⚠️ Comprobación: `curl … | grep -n "<!doctype"` tiene que dar **1**, y en el navegador
  `document.compatMode` tiene que ser `CSS1Compat`.

- ⚠️⚠️ **UN `<style>` SIN CERRAR DEJA LA PÁGINA EN BLANCO** (bug real, ago 2026): el navegador se
  traga el resto del documento como CSS y el `<body>` queda **vacío** (el HTML llega entero y con su
  `<title>`, así que parece un problema del servidor y no lo es). Pasó al sustituir un bloque de la
  plantilla que incluía el `</style>`. Comprobación rápida: `grep -c "<style>"` y `grep -c
  "</style>"` sobre el HTML SERVIDO tienen que dar lo mismo.

- ⚠️ **ACCIONES «PARA TODOS» · TOPE DE TIEMPO en vez de quedarse colgadas** (ago 2026). Varias
  acciones en bloque recorren decenas o cientos de elementos haciendo algo LENTO en cada uno (bajar
  un PDF, componer un correo, llamar a una API). El servidor corta la petición por tiempo mucho antes
  de acabar y —lo peor— si el guardado iba al final, **no quedaba nada hecho**: el botón parecía
  colgarse y no había forma de saber qué había pasado. Todas trabajan ahora con un **presupuesto de
  ~45 s**, guardando por el camino, y al acabar dicen **cuántas quedan** para volver a pulsar y
  seguir (la segunda pasada solo coge las que faltan, porque lo hecho ya no está pendiente):
  «Enviar todas las asignadas» de un evento y de una categoría · «Leer los datos que faltan» de las
  facturas (además el tiempo por archivo baja de 25 s a 12 s) · «Subir todo a Holded» · «Enviar todas
  las liquidaciones» de royalties.

- ⚠️⚠️ **`fa-user-music` Y `fa-calendar-star` NO EXISTEN en esta versión de Font Awesome**: salían
  **VACÍOS** en 20 sitios (el sujeto de una plantilla y de una nota de prensa, el asistente de un
  proyecto, la cabecera de una bolsa, el reporte de ventas, Integraciones, el alta de una demo, el
  botón + de la agenda…). Se han cambiado por **`fa-guitar`** (el artista) y **`fa-calendar-day`**
  (el evento). ⚠️ Al usar un icono, comprobarlo antes:
  `grep -c "\.fa-<nombre>:" static/vendor/fontawesome/css/all.min.css`.

- ⚠️ **Funciones DUPLICADAS a nivel de módulo**: en Python la última `def` pisa a la anterior, así que
  la primera es código muerto que no se ejecuta nunca (y engaña al leerlo). Había dos casos reales:
  `_wants_json_response` (una miraba `X-Requested-With`, la otra `Accept`/`is_json` — ganaba la
  segunda, así que quien dependía de la cabecera se llevaba HTML sin enterarse) y `_add_months` (una
  devolvía el día 1 del mes, la otra conserva el día). Resueltos: hoy `_wants_json_response` es «el
  cliente PIDE json» y **`_is_xhr_request()`** es «viene de un fetch/XHR del front». Comprobación:
  `grep -oE "^def [a-zA-Z_][a-zA-Z0-9_]*" app.py | sort | uniq -d` **tiene que salir vacío**.

- ⚠️⚠️ **`|tojson` DENTRO de un atributo con comillas dobles NO funciona** (bug real, ago 2026):
  `onclick="f({{ x|tojson }})"` renderiza `onclick="f("Los Ñus")"` → el atributo se **corta en la
  primera comilla**, el handler queda inválido y **el clic no hace nada** (pasó con «Subir la factura»
  de una liquidación de royalties: no fallaba, simplemente no ocurría nada). `tojson` escapa `<`, `>`,
  `&` y `'`, pero **no** la comilla doble.
  Dos formas correctas: pasar los datos en **`data-*`** y engancharlos con un listener delegado (lo
  preferido: sobrevive a que la fila se repinte), o **`{{ x|tojson|forceescape }}`**, que convierte la
  comilla en `&#34;` y el navegador la devuelve como JS válido. Comprobación:
  `grep -rn 'onclick="[^"]*|tojson }}' templates/*.html` **tiene que salir vacío** (sin `forceescape`).

- ⚠️⚠️⚠️ **DOS FUNCIONES CON EL MISMO NOMBRE: LA ÚLTIMA PISA A LA PRIMERA** (bug real y gordo, ago
  2026 — la causa de «me sale la pantalla de cerrado por mantenimiento al pinchar una actividad»).
  El proceso de cancelación añadió un `_concert_cache_summary(session_db, concert)` cuando ya
  existía `_concert_cache_summary(concert)`, así que la de siempre **dejó de existir** y la ficha de
  contratación la llamaba con un solo argumento → `TypeError` → **500 en la ficha de CUALQUIER
  actividad que tenga ficha de contratación** (por eso no se reproducía con datos de prueba: hacía
  falta un `ConcertContractSheet`). La nueva se llama ahora `_concert_cache_reference`.
  ⚠️ **La comprobación es de una línea y hay que hacerla**:
  `grep -oE "^def [a-zA-Z_][a-zA-Z0-9_]*" app.py | sort | uniq -d` **tiene que salir VACÍO**.
  ⚠️ Pyflakes NO lo detecta y el nombre «existe», así que el error solo aparece en tiempo de
  ejecución y en el camino que use la definición vieja.

- ⚠️⚠️⚠️ **UNA COLUMNA NUEVA NO SE METE EN UN BLOQUE `DO $$ … IF NOT EXISTS(…) THEN ALTER …`**
  (bug real y grave, sep 2026: **500 en toda la app al abrir la ficha de una actividad**). En
  `ensure_isrc_and_song_detail_schema` hay un `DO` con una guarda de rendimiento que **solo ejecuta
  su `ALTER TABLE songs` si falta ALGUNA de las columnas que ENUMERA**. Las cuatro columnas del
  lanzamiento en TikTok se añadieron ahí: como en producción ya estaban todas las que enumera, el
  ALTER **no llegó a ejecutarse nunca** y las columnas nuevas no se crearon. El ORM las pedía en cada
  consulta a `songs` → 500 en cualquier pantalla que cargue una canción (Contratación se veía y la
  ficha de la actividad, que carga el repertorio, daba la pantalla de «página caída»).
  · **Una columna nueva va SIEMPRE en su propia sentencia** de la lista `stmts`
  (`"ALTER TABLE x ADD COLUMN IF NOT EXISTS …;"`), que sí pasa por `_ddl_already_applied` —ese es
  preciso: solo salta si TODAS las columnas de ESE alter ya existen—.
  · Comprobación: borrar las columnas nuevas en una base de prueba, llamar a su `ensure_*` y ver que
  aparecen. Con el código roto salían **cero**.

- ⚠️⚠️⚠️ **UN ESTADO NUEVO HAY QUE AÑADIRLO TAMBIÉN AL CHECK DE LA BD** (bug real y grave, sep 2026:
  «al cancelar una actividad, a contratación le da `violates check constraint
  "concerts_status_check"`»). `concerts.status` tiene un **CHECK con la lista cerrada** de estados
  válidos, y cuando se añadieron **CANCELADO** y **APLAZADO** al proceso de cancelación (ago 2026)
  se actualizó `CONCERT_STATUS_META` en `app.py` pero **NO el DDL**: el CHECK se quedó con los
  cuatro de siempre, así que **cancelar o aplazar no se podía** —reventaba al guardar el estado y
  salía la pantalla de mantenimiento— desde que se implementó.
  · **Punto ÚNICO: `models.CONCERT_STATUS_VALUES`**, y el CHECK se CONSTRUYE con ella
  (`ensure_third_party_and_contract_sheet_schema`), así que un estado nuevo entra solo y no se
  pueden desparejar. El bloque `DO $$` dropea el constraint antes de recrearlo, así que se aplica
  en cada arranque (⚠️ `_ddl_already_applied` **no salta un `DO $$`**: solo CREATE TABLE/INDEX y
  ALTER … ADD COLUMN).
  · **RED DE SEGURIDAD**: al arrancar se comprueba que todo estado de `CONCERT_STATUS_META` esté en
  esa lista y, si falta alguno, se avisa en el log **con el nombre** — que es cuando se puede
  arreglar, no cuando alguien intenta cancelar.
  ⚠️ Comprobación: `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE contype='c' AND pg_get_constraintdef(oid) LIKE '%= ANY (ARRAY[%'` — hoy hay **DOS** en toda
  la base y los dos se construyen ya con su lista de Python, así que no se pueden quedar atrás:
  `concerts.concerts_status_check` (con `models.CONCERT_STATUS_VALUES`) y
  **`song_editorial_shares.chk_ses_role`** (con `models.SONG_AUTHOR_ROLE_VALUES`: los roles de
  autoría — ahí se descubrió al añadir el ARREGLISTA, sep 2026).
  ⚠️⚠️ Aquí ponía que **solo había uno**, y no era verdad: el de los roles estaba escrito como
  `role IN (…)` —que Postgres normaliza a `= ANY (ARRAY[…])` igualmente— y se le pasó a esa
  comprobación por mirarla por encima. **Antes de dar por bueno que no hay más, se ejecuta la
  consulta**: es de una línea.
  ⚠️ Probado reproduciendo el CHECK viejo: antes falla con `CheckViolation` y después los SEIS
  estados se guardan, un estado inventado **se sigue rechazando** (el CHECK protege), y el proceso
  entero de cancelar y de aplazar llega hasta el final («La actividad queda CANCELADA. Producción ya
  tiene sus tareas»).

- ⚠️⚠️ **UN `%` EN EL DDL DE UN `ensure_*` TUMBA LA SENTENCIA ENTERA, Y EN SILENCIO** (sep 2026,
  lo cazó la prueba al soltar el UNIQUE del nick de un tercero). `_exec_ddl_statements` ejecuta cada
  sentencia con **`exec_driver_sql`**, así que **psycopg2 interpreta los `%`** como marcadores de
  SUS parámetros: un `format('ALTER TABLE x DROP CONSTRAINT %I', …)` o un `LIKE '%(nick)%'` dentro
  de un `DO $$` hacen que falle con **«immutabledict is not a sequence»**… que se imprime como un
  `[schema:<label>] Aviso en sentencia N` y se sigue arrancando. Es decir: **el cambio de esquema no
  se aplica y nadie se entera** (aquí el UNIQUE se habría quedado puesto y la épica entera no
  funcionaría en producción, aunque en local —con la tabla recién creada— todo pareciera bien).
  · En SQL, `quote_ident(x)` en vez de `format('%I', x)`, y las columnas se miran por el **catálogo**
  (`pg_attribute` + `conkey`/`indkey`) en vez de con un `LIKE` con comodines.
  · Si hiciera falta un `%` de verdad, va **duplicado** (`%%`).
  ⚠️ Comprobación: `grep -n "%" ` sobre el bloque nuevo **y** ejecutar su `ensure_*` contra una base
  de prueba mirando que el cambio esté de verdad (un aviso en el log no es un error visible).

- ⚠️⚠️⚠️ **UN `<a>` DENTRO DE OTRO `<a>`: EL NAVEGADOR PARTE EL ÁRBOL Y LO DE DENTRO SE QUEDA
  FUERA** (bug real, sep 2026: «desde el listado de actividades, al pinchar en cambiar el estado se
  pone a pensar pero no hace nada»). En el listado, **la fila entera es un `<a>`**; el menú de estado
  que va dentro tenía dos items («Aplazar», «Cancelar») como `<a>`, y eso es HTML inválido: el
  parser **cierra el enlace exterior** y saca el `<ul class="dropdown-menu">` fuera —quedaba de
  HERMANO de la fila—, así que Bootstrap no lo encontraba y **el desplegable no se abría**.
  · Dentro de una fila-enlace, los items van en **`<button>`** (navegan con un `data-*` y un
  listener delegado). Así el menú se queda donde tiene que estar.
  · Y el **loader** miraba solo el `<a>` de alrededor: al pinchar cualquier control dentro de una
  fila clicable pintaba «Cargando…» y, como no se navegaba, **se quedaba ahí para siempre**. Ahora
  mira **lo que se ha pinchado** (`data-no-loader` / `.no-loader` / un `dropdown` por el camino).
  · ⚠️ `stopPropagation()` en el contenedor **tampoco** valía: Bootstrap abre el desplegable
  escuchando en `document`, así que cortar la propagación lo dejaba sin abrir.
  ⚠️ Comprobación: `tools/check_divs.py` avisa ya de los `<a>` anidados de cada pantalla (probado
  con un HTML roto y uno bueno).

- ⚠️⚠️ **UN `data-*` DE ESTADO CON EL MISMO NOMBRE QUE EL SELECTOR DE UN BOTÓN SE COME LOS CLICS**
  (bug real, sep 2026: «al crear o editar un tercero, las etiquetas se muestran pero no se pueden
  seleccionar»). `quick_create.js` abría «Rellenar más campos» con
  `closest('[data-qc-more-open]')` + `preventDefault()`… y **marcaba el estado de la caja con ESE
  MISMO atributo** (`caja.dataset.qcMoreOpen`). Desde entonces, **cualquier clic dentro de la caja**
  encontraba el atributo en un ancestro y se llevaba un `preventDefault()`: los checkboxes y los
  radios de las etiquetas **no se marcaban** (y no daba ningún error).
  · La marca de estado se llama ahora `data-qc-more-shown`, y el handler exige `button[...]`.
  · La regla: **una cosa, un nombre**. Es la misma trampa que las funciones duplicadas, en HTML.

- ⚠️⚠️ **LOS ICONOS DE UNA COMUNICACIÓN SON LOS SÓLIDOS DE LA CASA, NO EMOJIS** (sep 2026, lo pidió
  Dani: «me gustan más los sólidos de color corporativo, no emojis, corrígelo en toda la app y en
  todas las notificaciones»). Un emoji lo pinta cada sistema a su manera y con sus colores: ni es el
  icono de la casa ni se parece a la app. Punto único **`_brand_icon(nombre, email=…)`** (antes
  `_sync_icon`, que solo usaba Syncros): en la web `<i class="fa-solid">` y en un correo el MISMO
  icono como **PNG** (`brand_icon_png`, renderizado de `fa-solid-900.ttf` en el color que se pida),
  porque ahí la fuente de iconos no carga.
  · En las comunicaciones, cada dato lleva **solo su icono, sin el rótulo** —como en la ficha de la
  app—, y **cada módulo** una cabecera con el **fondo azul suave** de la marca y las letras y el
  icono en el **azul corporativo oscuro** (`BRAND_BLUE_DARK` / `BRAND_BLUE_SOFT`).
  ⚠️⚠️ **Y EL `<img>` DEL ICONO NECESITA `max-width:none`**: con el `img{max-width:100%}` de la app,
  dentro de una celda estrecha (`width:1%`) el ancho computado salía **0 px** — el icono no se veía
  y la celda se encogía con él. Es la trampa de siempre: lo de tamaño fijo tiene que decir que no
  se encoge. Comprobación: `getBoundingClientRect().width` del icono **no puede ser 0**.

## Marca / estética

- Colores: **#E33D48** (rojo, `--brand-primary`) y **#007CA2** (azul, `--brand-accent`).
- Logos: `static/img/logo_33_producciones.png` y `static/img/logo.png` (PIES). Co-branding.
- Hay refinamiento global de Bootstrap en `styles.css` (botones, tarjetas, navbar, tablas, pestañas,
  formularios). Landing pública en `landing.html` (standalone).

## Despliegue

- GitHub `descobosa2205/radio_spins_app` → **Render** (Pro Plus, **Frankfurt**) auto-deploy de
  `main`. **Supabase** Pro (**Frankfurt**, proyecto `gyezqnqyxpwxxevdjhgf`; migrado desde Estocolmo
  el 11-jul-2026 — regiones ya alineadas, ~1-2 ms por consulta). Arranque:
  `gunicorn -c gunicorn.conf.py app:app`. **Health Check Path = `/healthz`** en Render: reinicia
  instancias colgadas y valida deploys.
  ⚠️ **`/healthz` responde 503 MIENTRAS SE APLICA EL ESQUEMA** (`_schema_is_ready`, marca en
  `tempfile.gettempdir()/app33_schema_ready.flag`, que la ponen todos los workers a la vez porque
  solo uno coge el cerrojo y migra). Render **espera hasta 15 min** al health check y **mantiene el
  tráfico en la instancia vieja** hasta que pase: así subir algo no se nota. Antes la instancia
  nueva decía «estoy bien» en 2 s y atendía mientras todavía migraba, y la gente se comía pantallas
  a medio migrar o el aviso de mantenimiento. Válvula de seguridad `SCHEMA_READY_MAX_WAIT` (720 s,
  por debajo de los 900 s de Render): pasado ese tope se da por listo igualmente, para que una
  migración colgada no deje la instancia enferma en bucle.
  ⚠️ **Cuando Render está PARADO la app no puede servir nada.** Para eso está el *Maintenance Mode*
  de Render, que sirve **una URL externa al servicio**: `tools/pagina_mantenimiento/` publica la
  MISMA `static/maintenance.html` como sitio estático aparte (build `bash
  tools/pagina_mantenimiento/build.sh`, publish `tools/pagina_mantenimiento/_site`). Instrucciones en
  su `LEEME.md`. La app sigue enseñando esa página por su cuenta en el modo trabajo a mano
  (`direccion_toggle_maintenance`) y en los 500 (`errorhandler`).
- La app se conecta por el **pooler de Supabase (Session mode)**, `aws-0-eu-central-1.pooler...:5432`
  (el acceso directo `db.<ref>...` de los proyectos nuevos es solo IPv6 y Render no llega). El
  «Pool Size» del pooler está a 60; el pool de la app es 6+6 por worker (`DB_POOL_SIZE`/`DB_MAX_OVERFLOW`).
- Migración de región: kit reutilizable en `tools/migracion_frankfurt/` (copiar storage —reanudable—,
  crear esquema con las migraciones de la app, copiar datos con COPY, reescribir URLs, verificar).
  El proyecto viejo de Estocolmo (`gluytnllvcfgrnotchop`) queda como respaldo hasta ~18-jul-2026;
  después, **pausarlo** (Supabase → Settings → General → Pause project).

## Pendiente importante

- **Fase de seguridad** (sin empezar): rotar credenciales expuestas en git, eliminar contraseñas en
  texto plano (`UserSecurity.password_preview` y `users.txt`), añadir CSRF, tokens de reset de un
  solo uso, y mitigar host-header injection / SSRF. Ver sección 9 del `README.md`.


### Flecos por confirmar en producción (están montados, falta verlos funcionar)

- **Web Push**: faltan las claves **VAPID en Render** (`VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` ·
  `VAPID_SUBJECT`); sin ellas el push del sistema está desactivado (la campanita y el emergente van
  igual). Se generan con `vapid --gen` (`py-vapid`). En iPhone hace falta instalar la web como PWA.
- **CalDAV**: en Render **no puede funcionar** (Cloudflare corta `PROPFIND` con un 405 y iOS no
  verifica la cuenta), así que desde el **15-sep-2026** el servidor CalDAV corre en un **2º host en
  Fly.io** con `CALDAV_ONLY=1` (`radio-spins-caldav`, Frankfurt, **1 GB**: con 512 MB el worker
  moría por OOM al importar `app.py`), con el mismo código y la misma BD. Estado, pasos y lo que
  salió mal en **`DEPLOY_CALDAV.md`**. ⚠️ **Cada push que toque `app.py` exige además `fly deploy`**
  (el host de Fly no se actualiza solo). Pendiente: el dominio `calendario.33producciones.es` y la env
  `CALDAV_PUBLIC_HOST` en Render (la guía `/caldav/guia` enseña hasta entonces el host de Render).
  Prueba de fuego: `PROPFIND /caldav/` sin credenciales da **401** (en Render, 405) y con ellas **207**.
- **Holded**: se implementó **sin poder probar contra la API real** (no había cuenta y sus docs
  están cerradas). La **primera subida real** confirma los nombres de los campos; si algo falla, el
  motivo de Holded sale tal cual en la fila del gasto. → `docs/app/administracion-pagos.md`
- **Apple/Google Wallet**: el **pase de personal** (sep 2026) ya genera el `.pkpass` firmado y el
  enlace de Google Wallet, pero se activan con variables de entorno que faltan (certificado del Pass
  Type ID + WWDR de Apple; emisor + cuenta de servicio de Google) — pasos en **`DEPLOY_WALLET.md`**.
  Hasta entonces los botones salen apagados y el pase se guarda como imagen/PDF con el mismo QR.
  Las autorizaciones de menores siguen bajando el **PDF** (→ `docs/app/recintos-mapas.md`).
- **Vídeos**: la copia web la hace ffmpeg con **libx264**; confirmar con el primer vídeo real que el
  binario Linux de Render lo trae. → `docs/app/ui-plantillas.md`
- **Portal de externos**: el **autorrelleno del código por SMS** (WebOTP) está según especificación
  pero no se ha visto funcionar en un móvil real — necesita HTTPS y que el `@dominio` de la última
  línea del SMS sea exactamente el del enlace. → `docs/app/externos-publico.md`
- **Enterticket**: `_et_split_seat` (butaca del plano en vivo) se afinó **sin datos de un evento
  numerado real**. → `docs/app/ventas-ticketing.md`
- **Detección de entradas PDF**: los patrones de sector/fila/asiento se afinan con cada ticketera
  nueva; se valida con el PDF real antes de subir. → `docs/app/invitaciones.md`

## Dónde está cada cosa (`docs/app/`)

**Lee el fichero del área ANTES de tocarla.** Para buscar algo concreto en todas:
`grep -rn "lo que sea" docs/app/`

### Contratación y actividades
- **`actividades.md`** — el alta y el asistente, la ficha y sus pestañas, estados, cachés y
  comisiones, el promotor, la ficha de contratación, confirmar · anunciar · cancelar · aplazar, el
  aviso al artista y sus fases. ⚠️ *Tipo de actividad ≠ tipo de venta; «gratuito» es el modo de
  entrada, no un tipo; el asistente monta su contexto en un solo sitio (`_with_concert_wizard`).*
- **`peticiones.md`** — pedir una actividad, el asistente, a quién le sale, aprobar (solo dice con
  qué empresa) y las fases hasta que se configura. ⚠️ *Aprobar NO crea nada.*
- **`giras-ciclos-eventos.md`** — giras compradas, ciclos y festivales propios, y el EVENTO como
  sujeto. ⚠️ *Un evento se espeja como artista (`Artist.event_id`) y ese espejo no debe verse nunca.*
- **`recintos-mapas.md`** — recintos, el mapa de butacas y las autorizaciones de menores.
- **`carteleria.md`** — cartelería (nuestra y del promotor), Sold Out, logos de marca, fotos y vídeos.
  ⚠️ *Lo que sale de casa es la PÁGINA, nunca la URL de Storage.*
- **`diseno.md`** — la bandeja de Diseño: TODO lo que le piden en una lista por fecha de entrega, el
  pop-up con lo que se pide y la zona de subir, y los permisos para ver y entregar.
  ⚠️ *`_design_tasks` es el punto único: la pantalla, Inicio y el cuadro salen de ahí.*

### Ventas, invitaciones y producción
- **`ventas-ticketing.md`** — actualizar ventas, el reporte, salida a la venta, Enterticket, aforo.
  ⚠️ *La recaudación solo es nuestra si la promueve o participa una empresa del grupo.*
- **`invitaciones.md`** — gestión, invitaciones generadas con QR y control de acceso, y las
  **invitaciones corporativas** (la lista de invitados de cada uno y el envío desde SU correo).
  ⚠️ *Son cosas distintas: las de un evento son entradas; una corporativa la manda una persona.*
- **`produccion-hoja-ruta.md`** — hoja de ruta (horarios, logística, hoteles, rooming, personal,
  repertorio), riders y plantillas, mensajes al personal. ⚠️ *Lo que ve cada uno se filtra en el
  SERVIDOR: el payload entero va en el HTML.*

### Discográfica
- **`discografica-proyectos.md`** — proyectos (el trabajo previo al lanzamiento), sus pasos y tareas,
  producción, logística, aprobaciones en cadena, portada, pitch, focus.
- **`discografica-canciones.md`** — canciones y álbumes, materiales, Label Copy, ISRC, géneros,
  contenido explícito, certificaciones, Chartmetric.
- **`discografica-plan-lanzamiento.md`** — plan de lanzamiento, contenidos, cronograma, previsiones.
- **`discografica-videoclip.md`** — el proceso del videoclip.
- **`discografica-demos-playlists.md`** — demos, playlists (incluidas las de valoración) y el
  reproductor de la casa. ⚠️ *Todo reproductor necesita su `<audio>` EN EL DOM.*
- **`discografica-royalties.md`** — royalties, «a favor», liquidaciones, reparto editorial, contratos
  de artista, adelantos. ⚠️ *Lo generado queda congelado; hay dos builders y uno aplica el congelado.*
- **`syncros.md`** — sincronizaciones, supervisors, repertorio one-stop y sus envíos.
- **`registros.md`** — AGEDI y SGAE.

### Administración y dinero
- **`administracion-pagos.md`** — gastos, bolsas, facturas, pagos y remesas, contabilidad y Holded,
  IBAN, retenciones, embargos, **y las reglas del dinero**. ⚠️ *Los dos parsers de importes.*
- **`caja-artista.md`** — la CAJA de un artista: lo que factura, lo que se ha invertido en él, el
  balance, sus adelantos y el Excel de apuntes anteriores. ⚠️ *El gasto de una bolsa cubierto por el
  caché no es gasto de la oficina; y su permiso NO se hereda de la sección Artistas.*

### Comunicación
- **`avisos-correo-sms.md`** — avisos (campanita, franjas), correo, cuentas de envío y SMS.
  ⚠️ *Por correo solo se avisa cuando algo te ENTRA; lo demás se ve en la app.*
- **`promocion-prensa.md`** — promoción de prensa, marketing, notas de prensa, medios, radio y la
  **presentación de un tema a las emisoras** (el correo, el DPC de Prisa). ⚠️ *La emisora es un
  MEDIO de tipo Radio: no hay otra base de emisoras, y «ya suena» sale de las TOCADAS.*
- **`externos-publico.md`** — portal de externos y páginas públicas. ⚠️ *Un enlace compartido se abre
  sin identificarse y solo enseña ESO; el portal es otra vía y no se tocan entre sí.*
- **`onesheet.md`** — el **One Sheet** (el porfolio público de un artista, un evento, un ciclo o una
  gira: `/onesheet/<slug>`), su editor por módulos en rejilla, las plantillas y el **Roster**
  (`/onesheet`). ⚠️ *Lo dinámico (conciertos, cifras, certificaciones, prensa) se calcula al pintar;
  solo se guarda lo elegido. El mapeo grueso de permisos no puede mirar al usuario (bucle).*

### Bases de datos y transversales
- **`terceros-medios.md`** — terceros, artistas, medios, fusión de duplicados e importaciones.
- **`personal-vacaciones.md`** — personal, vacaciones y días libres, documentos (DNI/pasaporte), PRL,
  contratos, el escáner de documentos y el **pase de personal** (Wallet + QR de comprobación).
- **`agenda-calendarios.md`** — agenda, calendarios (Inicio, artista, oficina), iCal y CalDAV.
- **`permisos.md`** — el catálogo, los grants, el enforcement y cómo no dejar a nadie con un 403.
  ⚠️ *Retirar un recurso se lleva sus grants en cascada: hay que trasladarlos.*
- **`instrucciones.md`** — la sección Instrucciones: los manuales de la app (los sube dirección, los ve
  cualquiera con sesión) y las guías que genera la propia app (`MANUAL_BUILTINS`). ⚠️ *Es ayuda: no es
  un recurso de Accesos; sus endpoints van en `_access_exempt_endpoints`.*
- **`ui-plantillas.md`** — patrones de UI: fichas y edición inline, modales y asistentes, formularios
  (lo tecleado no se pierde, lo que falta en rojo), buscadores, tablas, PDF, móvil, visor e Inicio.
- **`integraciones.md`** — Pleo, Cabify, el cron único, Storage, despliegue y los errores del servidor.
