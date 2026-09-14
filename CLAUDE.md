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
| `check_money.py` | los dos parsers de importes y su espejo en JS | al tocar dinero |
| `check_invoice_read.py` | lectura de facturas reales (nº, fecha, base, IVA, retención) | al tocar `invoice_read.py` |
| `check_royalty_statement_read.py` | lectura de liquidaciones de compañías | al tocar `royalty_statement_read.py` |
| `check_mrz.py` | lector de DNI/NIE/pasaporte **y la paridad Python ↔ JS** | al tocar `mrz_utils.py` o `doc_scan.js` |
| `check_ics_import.py` · `check_ics_download.py` | motor de iCal y la **salida a la red** de verdad | al tocar `ics_import.py` |
| `check_audio_tags.py` | metadatos que se escriben en lo que se descarga | al tocar `audio_tags.py` |
| `check_press_render.py` | notas de prensa: el correo sale como se ve en el editor | al tocar `press_render.py` |
| `check_hoja_ruta.py` · `check_externos.py` · `check_invitaciones_generadas.py` | esas épicas de punta a punta con la app real | al tocarlas |
| `check_anuncio_carteleria.py` | pedirle al promotor la fecha de anuncio y los carteles, los dos vistos buenos y el recordatorio del día | al tocar el anuncio o la cartelería |
| `check_gratuito.py` | que en una actividad gratuita no asome la salida a la venta (configuración, ficha, aviso al artista, ficha del promotor) | al tocar la salida a la venta o lo gratuito |
| `diag_reparto_editorial.py` | dónde se corta el reparto editorial de un autor (solo lee) | al depurar royalties |

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
- **JSONB**: leer-copiar-reasignar **no escribe la segunda vez en la misma petición** (el valor sale
  «unchanged» y no da ningún error) → `flag_modified(obj, "campo")`.
- Nombres de campo que se confunden: `Promoter` es **`contact_email`/`contact_phone`** (no
  `email`/`phone`) · `PromoterCompany` es **`legal_name`** (no `name`) · `Song` no tiene `artist_id`
  (va por `SongArtist`) · `UserProfile` tiene el `nick`, `User` el correo. → `docs/app/terceros-medios.md`
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
- Un parcial que se pinta **varias veces** en la misma página no puede llevar `id` fijos (sufijo por
  fila), o `getElementById` y los `<label for>` cogen el primero.
- Bootstrap se carga **después** del contenido: los scripts en línea de una plantilla corren antes
  (reintentar, o `DOMContentLoaded`). Y `style.display='none'` no oculta un `.d-flex` → `d-none`.
- Un hijo de un flex o de un grid **se encoge por debajo de su contenido** (fotos ovaladas, texto
  partido letra a letra) → `flex:0 0 auto` en lo de tamaño fijo, `min-width:0` en lo que debe bajar.
- `stopPropagation` no detiene a otro listener del **mismo** nodo (el loader, el AJAX y el motor
  escuchan `submit` en `document`) → `stopImmediatePropagation`.
- Iconos: comprobar que existen en esta versión de Font Awesome antes de usarlos (salen **vacíos**),
  y los de **marca** van en `fa-brands`, no en la familia sólida. → comando abajo.

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
  ⚠️ Comprobación: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c'
  AND pg_get_constraintdef(oid) LIKE '%= ANY (ARRAY[%'` — hoy **solo hay UNO** en toda la base (este),
  así que no hay más catálogos que se puedan quedar atrás por este camino.
  ⚠️ Probado reproduciendo el CHECK viejo: antes falla con `CheckViolation` y después los SEIS
  estados se guardan, un estado inventado **se sigue rechazando** (el CHECK protege), y el proceso
  entero de cancelar y de aplazar llega hasta el final («La actividad queda CANCELADA. Producción ya
  tiene sus tareas»).

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
- **CalDAV**: en Render **no puede funcionar** — Cloudflare corta `PROPFIND` con un 405 y iOS no
  verifica la cuenta. Hace falta el 2º despliegue con `CALDAV_ONLY=1` en un host sin Cloudflare:
  pasos en **`DEPLOY_CALDAV.md`**. Prueba de fuego: `PROPFIND /caldav/` tiene que dar **207**.
- **Holded**: se implementó **sin poder probar contra la API real** (no había cuenta y sus docs
  están cerradas). La **primera subida real** confirma los nombres de los campos; si algo falla, el
  motivo de Holded sale tal cual en la fila del gasto. → `docs/app/administracion-pagos.md`
- **Apple/Google Wallet** (autorizaciones de menores): un `.pkpass` de verdad necesita certificado de
  Apple (Pass Type ID + clave + WWDR), que no tenemos; mientras tanto los botones bajan el **PDF**
  con el mismo QR. → `docs/app/recintos-mapas.md`
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
- **`invitaciones.md`** — gestión, invitaciones generadas con QR y control de acceso.
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

### Comunicación
- **`avisos-correo-sms.md`** — avisos (campanita, franjas), correo, cuentas de envío y SMS.
  ⚠️ *Por correo solo se avisa cuando algo te ENTRA; lo demás se ve en la app.*
- **`promocion-prensa.md`** — promoción de prensa, marketing, notas de prensa, medios y radio.
- **`externos-publico.md`** — portal de externos y páginas públicas. ⚠️ *Un enlace compartido se abre
  sin identificarse y solo enseña ESO; el portal es otra vía y no se tocan entre sí.*

### Bases de datos y transversales
- **`terceros-medios.md`** — terceros, artistas, medios, fusión de duplicados e importaciones.
- **`personal-vacaciones.md`** — personal, vacaciones y días libres, documentos (DNI/pasaporte), PRL,
  contratos, el escáner de documentos.
- **`agenda-calendarios.md`** — agenda, calendarios (Inicio, artista, oficina), iCal y CalDAV.
- **`permisos.md`** — el catálogo, los grants, el enforcement y cómo no dejar a nadie con un 403.
  ⚠️ *Retirar un recurso se lleva sus grants en cascada: hay que trasladarlos.*
- **`ui-plantillas.md`** — patrones de UI: fichas y edición inline, modales y asistentes, formularios
  (lo tecleado no se pierde, lo que falta en rojo), buscadores, tablas, PDF, móvil, visor e Inicio.
- **`integraciones.md`** — Pleo, Cabify, el cron único, Storage, despliegue y los errores del servidor.
