# CLAUDE.md — Contexto para asistentes (Radio Spins App)

Back office interno de **33 Producciones** (productora) y **Pies Records** (sello). Gestiona
conciertos/ventas, discográfica, invitaciones, promoción/medios, bolsas y administración, y
usuarios/permisos. Este fichero resume lo esencial para trabajar rápido y sin romper nada.
Detalle ampliado en `README.md`.

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

## Convenciones clave
- **Rutas**: `@app.get/@app.post/@app.route`, casi todas con `@admin_required` (solo exige sesión;
  la autorización real la hace el `before_request`).
- **Sesiones BD**: `s = db()` con `try/except rollback/finally close`, o `with get_db() as s`.
- **Dinero**: usar `Decimal` (`_parse_money_decimal`, `_money_or_zero`), nunca `float`.
- **Permisos**: catálogo `UserAccessResource` (SECTION→TAB→SUBTAB, `economic_capable`) + grants
  `UserAccessGrant` (`can_view_basic`/`can_view_econ`/`can_edit`). **role 10 = dirección** (acceso
  total y único que edita permisos). **Única fuente de verdad = `CURATED_ACCESS_RESOURCES`** (lista en
  `app.py`): cada recurso lleva `description` (función + página/pestaña; se muestra en la pantalla de
  Accesos) y `sort_order`. Los seeds SQL en `models.py` son redundantes (UPSERT) y CURATED manda.
  Enforcement: `_enforce_role_permissions_v2` (usa `include_descendants`); las versiones legacy
  `enforce_role_permissions`/`require_login` quedan **sustituidas** por las `_v2` vía
  `_replace_before_request` (código muerto, no editarlas). `_resolve_request_resource_key` mapea
  endpoint→recurso (respaldo: `_infer_group_key_from_path`); **si da `None` en un POST, solo dirección
  pasa** → al añadir endpoints nuevos hay que mapearlos.
  **Endpoints de APOYO (núcleo del rediseño: «cumplir la función sin errores de permisos»)**:
  herramientas transversales que NO son una sección, declaradas en `SUPPORT_ACTION_ENDPOINTS`
  (alta rápida `/api/*/create`, vinculaciones `/vinculaciones/*`, hoja de ruta `/hoja-ruta/*`),
  `SUPPORT_READ_ENDPOINTS` (búsquedas/lookups para rellenar formularios) y `SUPPORT_ECON_READ_ENDPOINTS`
  (lecturas con importes, exigen `econ` de su sección). El gate lo hace `_support_endpoint_decision`
  (prioridad sobre la resolución por sección): las acciones las puede usar cualquier **actor**
  (`_user_is_actor`: puede editar alguna sección **o** tener acceso a invitaciones), las lecturas
  cualquier sesión, las económicas con permiso económico. Así, p. ej., quien puede *pedir invitaciones*
  crea/busca/vincula un tercero sin bloqueos. **Para una función nueva**: declara su recurso en
  CURATED (con descripción) y mapéala en `_resolve_request_resource_key`; si es una herramienta
  transversal, métela en `SUPPORT_*`. **Auto-descubrimiento sin duplicados**: `_build_access_resources_from_app`
  usa `_coarse_endpoint_resource` para saltar lo ya cubierto (esto eliminó los `auto.*` fantasma) y
  **bucketiza solo las ESCRITURAS sin cubrir** bajo su sección o el cajón **`otros`** («Otras funciones»,
  desactivado) — nada queda solo-dirección en silencio. `_sync_access_resources` **poda** legado y
  `auto.*` huérfanos (grants en cascada); legado retirado en `LEGACY_REMOVED_ACCESS_KEYS`
  (`concerts*`, `quadrantes`, `marketing` — duplicaban `contratacion`/`promocion`; sus rutas siguen vivas
  mapeadas a la sección real). **Garantía a futuro**: `_audit_access_coverage()` corre en el arranque
  (best-effort, avisa en log si una escritura queda sin recurso) y desde `tools/check_access_coverage.py`
  (CI/local, requiere Python 3.10+). **Invitaciones = recursos «de acción»**: su POST exige solo
  **acceso básico** a `invitaciones.pedir`/`invitaciones.gestionar` (tener la pestaña habilitada =
  poder pedir/gestionar; el control fino por artista/concierto lo hace `_ensure_can_manage_invitations`),
  no `can_edit`. Coherencia: `_coherent_grant_values`. Las funcionalidades nuevas se
  autodescubren y entran **desactivadas**. UI en `personnel_detail.html` + `personnel_bulk.html`.
  ⚠️ **QUIÉN GESTIONA LAS INVITACIONES de una actividad** (`_filter_manageable_concerts`, corregido
  ago 2026): si la promueve un **tercero** (ni `group_company_id` ni participación del grupo), las
  gestiona **la persona de PRODUCCIÓN ASIGNADA** (`Concert.production_owner_user_id`) — antes valía
  cualquiera que tuviera ese artista asignado, y el trabajo quedaba repartido a medias. Si la
  actividad **aún no tiene responsable**, se mantiene la regla antigua (artistas asignados) como red
  de seguridad, para que la lista de invitados no se quede sin nadie. Lo que promueve una **empresa
  del grupo** sigue siendo de **Ticketing**, dirección lo gestiona todo y «Gestionar otros» (opt-in)
  sigue valiendo para cualquiera.
  **Artistas por faceta**: `UserProfile.assigned_artist_ids_produccion` / `_sello` (una persona puede
  ser de ambos); `assigned_artist_ids` se mantiene como **unión** (compat) y se recalcula al guardar.
  En el perfil se muestran dos selectores según departamentos (Producción/Sello).
  **Modo «Ver como» (impersonación)**: solo dirección (role 10), desde el perfil de cada persona
  (`impersonate_start`, `POST /personal/<id>/ver-como`). Intercambia `session["user_id"]` por el del
  objetivo y guarda el real en `session["impersonator_id"]`/`["impersonator_role"]`, así TODA la app
  (permisos, menú, economía) refleja al impersonado sin tocar los *choke points*. Salir:
  `impersonate_stop` (`GET /salir-modo-vision`, **exento** del enforcement) — botón rojo en el navbar
  (`layout.html`, globales `IMPERSONATING`/`IMPERSONATOR_NICK`). No anidable, no a uno mismo, no a
  bloqueados/eliminados; `logout` limpia las claves.
- **PERMISOS · repaso del catálogo (ago 2026)**: el catálogo (`CURATED_ACCESS_RESOURCES`, **96
  recursos**) ya tiene TODAS las secciones y pestañas de la app, y **no queda ningún `auto.*` sin
  clasificar**. Lo que se añadió en este repaso:
  · **Discográfica → «Demos»** (`discografica.demos`) y **«Playlists»** (`discografica.playlists`),
  que eran secciones de la pantalla sin recurso propio: ahora se pueden conceder (o quitar) sueltas.
  Sus endpoints se mapean por prefijo (`discografica_demo*` → demos, `playlist_*` → playlists;
  ⚠️ `playlist_` **no** es `playlisting_`, que es otra sección).
  · **Contabilidad por pestañas**: `contabilidad.pendiente` · `contabilidad.contabilizado` ·
  `contabilidad.retenciones` (se puede dar solo «Retenciones» a quien declara). **Todo lo que se HACE**
  (subir a Holded, marcar contabilizado, omitir, corregir importes, `royalty_liquidation_accounted`)
  cuelga de **«Pendiente de contabilizar»**, que es donde se trabaja.
  ⚠️ La resolución por `tab` hay que ponerla **DONDE se resuelve `contabilidad_view`** (dentro del
  bloque grande de `promocion_view`/`administracion_view`/…): una regla más abajo es **código muerto**,
  porque gana el mapeo de la sección (bug real de este repaso).
  ⚠️ El gate de LECTURA usa `include_descendants=True`, así que **tener una pestaña abre la URL de
  cualquier otra de la misma sección**. Por eso `contabilidad_view` (como la ficha de personal) solo
  pinta las pestañas que se pueden ver y **redirige a la primera** si se pide otra.
  · **Sin números repetidos**: los `sort_order` de Discográfica y Contratación colisionaban (dos
  recursos con el mismo número salían en la pantalla de Accesos en orden aleatorio) y ahora siguen el
  orden real de sus pestañas.
  · **`_access_exempt_endpoints()`** es el punto ÚNICO de lo que NO necesita recurso porque lo
  autoriza otra capa: apoyo (`SUPPORT_*`), **datos propios** (`PERSONAL_ENDPOINTS`: mis gastos, mis
  vacaciones, mis avisos, el orden de mi menú), **pedir algo** (`REQUEST_ANY_ENDPOINTS`) y lo que es de
  dirección por naturaleza (modo trabajo, «Ver como»). Lo usan el auto-descubrimiento **y** la
  auditoría: antes esos 14 endpoints salían en Accesos como «Función nueva sin clasificar» (permisos
  que no hacían nada) y, al quitarlos, la auditoría los daba por «sin cobertura» — las dos cosas leen
  ahora la misma lista. `expense_template_create/save/update_items` pasan a `SUPPORT_ACTION_ENDPOINTS`
  con sus hermanas, y `/integraciones` se resuelve también por RUTA.
  ⚠️ La **red de seguridad sigue puesta**: una función de escritura nueva que no se mapee sigue
  entrando en el catálogo **desactivada** bajo «Otras funciones» (comprobado), así que nada queda
  solo-dirección en silencio.
- **FICHA DE PERSONAL · el orden de las pestañas** (ago 2026): **«Datos» es la PRIMERA** (es lo del día
  a día y la pestaña por defecto al abrir la ficha) y **«Accesos» la ÚLTIMA** (los permisos se tocan de
  tarde en tarde). ⚠️ El orden manda en DOS sitios que hay que dejar iguales: el dict `tab_access` de
  `personnel_detail_view` (de ahí sale la pestaña por defecto, `visibles[0]`) y la lista del `{% for %}`
  de `personnel_detail.html`.

- ⚠️ **La ficha y los listados de ACTIVIDAD se abren desde muchas secciones**: producción monta la
  hoja de ruta, administración la bolsa, promoción su marketing… Por eso el acceso de LECTURA a
  `concert_detail_view` / `activities_view` / `concerts_view` no exige la pestaña «Conciertos» de
  Contratación: `_activity_read_resource_key` acepta la primera sección de
  `ACTIVITY_READ_ACCESS_KEYS` que el usuario tenga. **Modificar sigue exigiendo edición en
  contratación** (el helper solo actúa en GET). Sin esto, quien trabaja en Producción se comía un 403
  al pinchar cualquier concierto (bug real). El 403 dice ahora **qué acceso falta**.
- **Giras compradas y PRODUCCIÓN**: en una gira comprada hay fechas que promovemos nosotros y otras
  que se le venden a un promotor de fuera. **De las de fuera no nos ocupamos**: ni salen en
  Producción, ni generan petición, ni se les pide responsable. El criterio es **que promueva una
  empresa del GRUPO** (`_concert_is_group_promoted`: `group_company_id` o participación vía
  `ConcertCompanyShare`), el mismo que usan cartelería e invitaciones.
  ⚠️ Antes `_concert_needs_production` miraba solo «que no haya un tercero como promotor», que NO es
  lo mismo: una fecha a la que nadie le había puesto promotor se colaba en Producción como si fuera
  nuestra y pedía responsable a quien no le tocaba. Ahora `_concert_needs_production(concert,
  session_db=None)` usa el criterio bueno (sin sesión cae a `group_company_id`, resolviéndola con
  `object_session` si puede), y `_concert_needs_production_owner` **empieza preguntándoselo**: lo que
  no va a producción no pide responsable.
  ⚠️ El listado de Producción conserva las que **ya tienen bolsa** aunque ahora no cumplan el
  criterio: la regla vale para el trabajo nuevo, no para esconder el que ya está empezado.
- **Histórico de actividades**: `LEGACY_ACTIVITY_CUTOFF` (28-jul-2026). Las actividades ANTERIORES se
  conservan en el listado y en su ficha, pero **no generan trabajo**: `_concert_needs_production`
  devuelve False (ni aviso de producción, ni módulo de Inicio), no salen en el listado de Producción
  ni para declarar en Registros. Helpers `_concert_is_legacy` / `_is_legacy_activity_date`. Crear una
  bolsa a mano sigue siendo posible (es un clic deliberado); lo que no se genera es lo automático.
- **Solo personal ACTUAL en listas y selectores**: `is_blocked`/`is_deleted` viven en **`UserSecurity`**
  (¡no en `User`! — un `getattr(user, "is_blocked")` es siempre `False` y no filtra nada: bug real).
  Helper único **`_inactive_user_ids(session_db)`** (UUIDs de eliminados o bloqueados) aplicado en el
  destinatario de la factura del enlace público (`_invoice_target_people`), el personal de invitaciones
  (`_invitation_personnel_options`), el buscador de vinculaciones (`api_entity_link_search`, tipo
  `personal`), los correos internos (`_all_user_emails`, dirección del escalado de gastos) y el cruce de
  DNI del ITA (`_prl_ita_link_people`). Las pantallas de **gestión** de personal (`/personal`,
  `/personal/accesos-bloque`) siguen mostrando a los bloqueados a propósito (hay que poder
  desbloquearlos y arreglarles los permisos); los eliminados no salen en ninguna.
- **Menú superior (`_build_nav_menu`)**: el agrupamiento del menú es INDEPENDIENTE del árbol de
  permisos. **Personal** y **Terceros** se muestran dentro del desplegable «Bases de datos» aunque
  sus recursos sigan siendo las SECCIONES `personal` / `third_parties` (no `databases.*`).
  ⚠️ No renombrar esas claves para «colocarlas» en el árbol: `_sync_access_resources` poda los
  huérfanos **en cascada** y se llevaría por delante todos los permisos ya concedidos.
- **Iconos de sección**: dict `SECTION_ICONS` en `app.py`, inyectado al contexto; usado en el menú
  (`layout.html`) y en permisos.
- **RECAUDACIÓN del reporte de ventas = permiso PROPIO** (`SALES_REVENUE_ACCESS_KEY` =
  `ventas.recaudacion`, subpestaña de `ventas.reportes`): nace **apagada para todos**; **dirección**
  la ve siempre y a **Ticketing** se le concede en el arranque (`_sales_revenue_access_seed`, marca
  `sales_revenue_access_seed_v1`). Punto único **`can_view_sales_revenue()`**, que sustituye a
  `can_view_economics()` en el reporte (pantalla, A4, columnas de dinero del Excel), en el **informe
  por concierto** (`sales_event_report_view`/`_pdf`) y en el reparto del **correo**
  (`_sales_report_recipients`, que decide quién recibe la variante con importes).
  ⚠️ Se comprueba el **grant EXACTO** de ese recurso, no con `_state_has_access`: ese acepta los
  ANCESTROS, así que cualquiera con economía en `ventas` seguiría viendo la recaudación (que es justo
  lo que se quería cerrar). Las filas del permiso existen para todo el mundo con los flags a `false`
  (el catálogo las crea así): lo que manda es `can_view_basic`/`can_view_econ`.
- **Inicio · acciones rápidas por departamento**: botones bajo la cabecera del personal
  (`HOME_QUICK_ACTIONS` ← `_build_home_quick_actions`, catálogo `_home_quick_action_defs`, reparto
  `_HOME_QUICK_BY_DEPARTMENT` por `UserProfile.departments`: Contratación/Sello/Registros/
  Administración/**Ticketing** —a este, «Compradores», «Recintos», «Actualizar ventas» y «Gestionar
  invitaciones», sin el de «Petición»—; el resto
  ve `_HOME_QUICK_DEFAULT`, dirección lo ve todo). Cada acción se filtra por su `access` (nunca sale
  un botón que daría 403). Estilos `.dash-quick*` en `styles.css`. Sustituyen al botón «Añadir
  petición» y al módulo «Tus áreas» (eliminados). Las que viven en un modal de OTRA pantalla se
  abren con un parámetro de URL (`?open=sim` simulaciones · `?open=song` discográfica ·
  `?open=request` invitaciones) que dispara **`window.app33AutoOpenModal(id)`** — helper definido
  **inline en `layout.html` ANTES del `{% block content %}`** (los scripts en línea de las
  plantillas se ejecutan antes de Bootstrap y de `scripts.js`; reintenta hasta que existan modal y
  Bootstrap). ⚠️ Al emitir el id desde Jinja hace falta **`|safe`**: sin él escapa las comillas
  (`&#39;`) y la llamada deja de ser JS válido (bug real). «+ Actividad» abre el asistente **in situ**
  en la propia home (`_concert_wizard_modal.html` se incluye siempre que haya `wizard_available`).
- **Select2 con logos**: `initSelect2()` (scripts.js) pinta la imagen de cada opción desde
  `data-photo`/`data-logo`. El `<select>` debe llevar una clase: `select-providers` (terceros),
  `select-venues` (recintos), `select-with-thumbs` (ticketeras/editoriales, miniatura cuadrada),
  `select-artists` (artistas). Campos de logo: promoter/ticketer/publishing → `logo_url`;
  venue/artist → `photo_url`.
- **Foto del artista junto al nombre (global)**: para mostrar la foto del artista **en círculo delante
  del nombre** en cualquier plantilla, usar los helpers globales **`artist_chip(nombre, foto_url)`**
  (cápsula foto+nombre, clase `.artist-chip`) o **`artist_avatar(foto_url, nombre)`** (solo la foto, clase
  `.artist-avatar-inline`). Definidos en `inject_globals` (`app.py`); escapan con `Markup` (seguros XSS) y
  caen al logo por defecto si no hay foto. Muchas pantallas ya la mostraban con su propio markup.
- **Enlazar a la ficha del artista (global)**: para que el nombre/foto de un artista lleve a su ficha,
  marca el elemento con **`data-artist-link="<artist_id>"`** (no envolver en `<a>`, así no cambia el
  aspecto: `static/js/artist_links.js` —global— lo hace clicable, cursor de mano, cmd/ctrl/clic central
  abre en pestaña nueva; CSS `[data-artist-link]{cursor:pointer}`). Los helpers `artist_chip`/`artist_avatar`
  aceptan `artist_id=` y lo emiten solos. **No** marcar elementos que ya enlazan a otra cosa (filtros/toggles
  como los chips de artista del calendario o los `data-*-artist-filter`, filas-enlace a otro destino).
- **Calendario de agenda (Inicio + pestaña «Agenda» del artista)**: componente reutilizable
  `_agenda_build` (`app.py`, reúne conciertos/acciones/medios/lanzamientos en un formato común; conciertos
  en BORRADOR fuera) + `templates/_agenda_calendar.html` + `static/js/agenda_calendar.js` + estilos
  `agenda-*` en `styles.css`. Modo `home` (color por artista, 2 semanas fijas, etiquetas de artista arriba
  + tipos a la izquierda) y modo `artist` (color por tipo, 4 semanas navegables por meses con flechas,
  listado de eventos a la izquierda). En Inicio se inyecta como `HOME_AGENDA` (todos los usuarios; sus
  artistas asignados o todos si no tiene/role 10). La agenda del artista carga ±6 meses y navega también
  al pasado. El calendario muestra el mes junto a cada día. Además del calendario de actividades reales,
  `_agenda_build` añade: **bloqueos** y **notas libres** (modelo `ArtistAgendaItem`, kind BLOCK/NOTE,
  multi-día; los bloqueos marcan los días con rayado) y **cumpleaños** (artista individual →
  `Artist.birth_date`; grupo `Artist.is_group` → cada `ArtistPerson.birth_date`). **Botón +** arriba a la
  derecha (Inicio y ficha) → asistente `templates/_agenda_add_modal.html`: elegir artista (en Inicio,
  vía `AGENDA_ARTIST_OPTIONS`), tipo (Actividad/Bloqueo/Otro) y rango de días. «Actividad» reabre el
  asistente de concierto (`/conciertos?open_wizard=1&wizard_artist=<id>`, auto-apertura en
  `_concert_wizard_modal.html`). Endpoints `agenda_block_create`/`agenda_note_create`/`agenda_item_delete`
  (en `SUPPORT_ACTION_ENDPOINTS`). Al crear artista se pregunta «¿es un grupo?»; la pestaña Datos edita
  `is_group`, fecha del artista y fecha por miembro.
- **AGENDA · un «otro» puede tener HORA** (ago 2026): al añadir una nota (**«Otro»**) se pueden poner
  **hora de inicio y hora de fin, las dos opcionales** (`ArtistAgendaItem.start_time`/`end_time`; sin
  ellas es de todo el día, como antes). Punto único **`_agenda_clean_time`** (valida «HH:MM» y descarta
  lo que no lo sea) + **`_agenda_time_label`** («10:00 – 13:30» · «desde las 10:00» · «hasta las
  13:30»), que va **por delante en el `subtitle`** del ítem: así se ve igual en el tooltip del
  calendario y en el listado lateral, en Inicio y en la ficha del artista. En un solo día, unas horas
  del revés se ordenan solas (igual que las fechas).
  · **Al iPhone también llega la hora**: `_ics_time_lines` es el punto único de DTSTART/DTEND del iCal
  público y del CalDAV. ⚠️ Solo se emite evento **con hora cuando están LAS DOS** (hora local
  flotante, sin TZID, que es lo que entienden bien iPhone y Google sin VTIMEZONE); con **una sola** se
  emite el día completo de siempre y la hora se dice en el texto — mejor eso que inventarse una hora
  de fin que nadie ha puesto.
  · **El día de fin SIGUE al de comienzo** mientras no se toque a mano: lo que se añade es de UN día y
  al mover el «Desde» se mueve el «Hasta» con él; en cuanto alguien escribe el «Hasta», ese manda
  (`dataset.touched` en `_agenda_add_modal.html`) — salvo que quede ANTES del comienzo, que entonces se
  arrastra. Vale para «Otro» y para «Bloqueo».
  ⚠️ **`parse_date("")` REVIENTA** (`ValueError`, no devuelve None): con el «Hasta» vacío, crear una
  nota o un bloqueo fallaba con «No se pudo añadir» (bug real). Las fechas de la agenda se leen con
  **`parse_optional_date`**.

- **AGENDA · un bloqueo o un «otro» se EDITA, se ARRASTRA y el cambio de fecha SE AVISA** (ago 2026):
  · **Doble clic** sobre un bloqueo o una nota del calendario abre su pop-up (`#agendaEditModal`, en
  `_agenda_calendar.html`, así que vale en Inicio, en la ficha del artista y en un proyecto): título,
  fechas, las horas y la nota si es un «otro», con **Eliminar** dentro (es donde se va a buscar).
  · **Arrastrarlo a otro día** le cambia la fecha **conservando la duración** (un bloqueo de tres días
  sigue siendo de tres días): `agenda_item_update` con `mover=1`. Lo demás (conciertos, promociones,
  cumpleaños) **no se arrastra ni se edita ahí**: eso se cambia en su ficha — lo decide
  `esEditable(a)` en `agenda_calendar.js` (`item_id` + kind `otro`/`bloqueo`).
  · **Si la FECHA cambia se pregunta si se avisa** (`#agendaNotifyModal`, «No avisar» / «Avisar del
  cambio»): cambiar una fecha y comunicarlo son dos cosas distintas y la segunda se decide. El aviso
  lo manda `agenda_item_notify` → **`_agenda_item_notify_change`**, que llega a los **IMPLICADOS de la
  casa** (`_agenda_item_involved`: quien lo apuntó y **quien lleva a ese artista**, excluyendo
  inactivos) por la campanita (kind **`AGENDA`**) y al **ARTISTA** por correo, a las cuentas de su
  canal **PRODUCCION** (`_artist_notification_emails`). A uno mismo no se avisa nunca.
  ⚠️ Los ítems del payload llevan las fechas **RECORTADAS a la ventana** que se está mirando: para
  editar hacen falta las de verdad, y por eso van también `item_start`/`item_end` (+ `note`). Usar
  `date`/`end_date` en el pop-up recortaba un bloqueo al mirar el mes por el que pasa.
  ⚠️ `_agenda_change_label` es el punto único del texto del cambio («03/09 → 05/09 pasa a 13/09 →
  15/09»): lo compone el servidor al guardar y la pantalla lo devuelve tal cual al avisar, así que el
  aviso dice exactamente lo que se vio.

- **CALENDARIO GENERAL DE OFICINA** (ago 2026): en el calendario de Inicio sale **como si fuera otro
  artista** («Calendario general», `OFFICE_CALENDAR_ID = "oficina"` — un CENTINELA, no un artista de la
  BD), y lo que lleva son las cosas de la casa: **todas las vacaciones y días libres APROBADOS de todo
  el personal** (una franja por petición, con el nick y el motivo, enlazando a su cuadrante) y las
  **notas** que se le añadan. Motor `_agenda_office_items`, enganchado en `_agenda_build` **solo con
  `include_personal`** (o sea: solo la agenda de dentro; en un calendario público, en el iCal o en
  CalDAV serían datos personales de la oficina).
  ⚠️ Su id NO es un UUID: se excluye de la consulta de artistas y su ficha del mapa se pone a mano
  (nombre, los DOS logos del grupo y su color de paleta como cualquier otro).
  · En el **botón +** es la **PRIMERA** opción, con los logos de Treinta y Tres y de PIES, y al
  elegirla **solo se puede añadir «Otro»** (una nota): ni actividades ni bloqueos, porque no es de
  ningún artista (`soloOtros()` en `_agenda_add_modal.html`; el aviso de solapes también se salta).
  · Sus notas viven en `ArtistAgendaItem` con **`is_office = true` y `artist_id` NULL** (por eso esa
  columna dejó de ser obligatoria). `agenda_block_create` lo rechaza diciendo por qué.
  · **La FOTO de cada franja es la de LA PERSONA que está de vacaciones**, no la del calendario: los
  ítems pueden traer su propia `artist_photo`/`artist_photos` y el finalizador de `_agenda_build` las
  respeta (`it.pop(...) or` lo calculado). Sin eso todas las franjas salían con el logo.
  · **Su imagen** es el **FAVICON de la app** (`static/android-chrome-192x192.png`, el «33» de la
  casa), vía `_office_calendar_image()`; si el fichero no estuviera, se cae a los dos logos del grupo.
  · **CUMPLEAÑOS de todo el personal** de la oficina (`UserProfile.birth_date`), con su tarta y **la
  foto de quien cumple**. Los bloqueados y eliminados no salen.
- **MI CALENDARIO** (ago 2026, `MY_CALENDAR_ID = "mio"`): el calendario de cada uno, también como si
  fuera otro artista y con **su propia foto**. Lleva:
  · las actividades en las que **acompaña** al artista —está en el personal de su HOJA DE RUTA
    (`roadmap_payload['personnel']`, kind USER): se lee de los conciertos que `_agenda_build` YA tiene
    cargados para la ventana, así que no cuesta ninguna consulta más—,
  · las **promociones** en las que es el acompañante (`Promotion.escort_user_id`), con sus entrevistas,
  · y **sus vacaciones y días libres** (una franja por petición), que las trae `_agenda_personal_days`
    ya con este id.
  · **Los CUMPLEAÑOS van en el ROJO DE LA CASA** (ago 2026), el mismo del Calendario general: es su
  color de TIPO (`AGENDA_KIND_META['cumple']`), así que se ven igual en Inicio y en la ficha del
  artista. Y de la paleta de artistas se ha quitado el rojo oscuro que había (`#c1121f`): con el rojo
  reservado, ningún artista puede llevar uno parecido.
  · **COLORES**: el **rojo de la casa** es del Calendario general y el **azul** de Mi calendario
  (`AGENDA_OFFICE_COLOR` / `AGENDA_MINE_COLOR`, fijos y fuera de la paleta que rota). El resto los da
  **`_agenda_color_for(i)`**: la paleta y, cuando se acaba, colores nuevos girando el tono con el
  ÁNGULO DORADO (137,5°) y saltándose las franjas del rojo y el azul — así **no se repite ninguno**
  por muchos calendarios que se creen (antes era `paleta[i % len(paleta)]` y del 13 en adelante se
  repetían). ⚠️ `agenda_calendar.js` tiene el MISMO mecanismo (estabiliza los colores en el cliente):
  si se toca uno, se toca el otro.
  · **ORDEN**: Mi calendario y el Calendario general van los **PRIMEROS** y una **barra vertical**
  (`.agenda-chip-sep`) los separa de los artistas y eventos. El orden se respeta también al cargar más
  ventanas con las flechas (el `sort` del cliente los deja delante).
  ⚠️ Lo personal (mis días, MI CALENDARIO y el de OFICINA) se añade **ANTES del mapa de artistas**: es
  ahí donde estos dos calendarios cogen nombre, foto y color, y el mapa se construye con los ids ya
  vistos.

- **Los TIPOS que se ofrecen son los que HAY a la vista** (ago 2026, `kindsVisibles()` en
  `agenda_calendar.js`): la lista de tipos —el lateral «Tipos» en Inicio y los chips de arriba en la
  ficha del artista— solo enseña los que tienen algo en **la ventana que se está mirando** y en **los
  calendarios encendidos**. ⚠️ Se ignora el propio filtro de tipos (si no, al apagar uno desaparecería
  su botón y no se podría volver a encender) y NO se usa la lista `kinds` a secas: esa **acumula** los
  tipos de todas las ventanas cargadas con las flechas, que era justo lo que sobraba.
- **FESTIVOS en los calendarios de agenda** (ago 2026): en **Inicio** y en la **pestaña Agenda de cada
  artista** el día del festivo se marca **EN ROJO con el nombre de la festividad** dentro de la casilla
  (los **no laborables** de la oficina, en morado), igual que en el calendario de vacaciones. Van en
  `holidays` del payload (`_agenda_holidays`), **no como un chip más** — antes eran un evento de tipo
  «vacaciones» y se perdían entre las actividades.
  ⚠️ Se piden con **`include_holidays=True`**, que solo activan la agenda de Inicio, sus ventanas por
  AJAX y la ficha del artista: en el calendario PÚBLICO, el iCal y CalDAV no van. Y los **EMPRESA**
  (no laborables, que son por persona) solo con `include_personal`.
- **CUMPLEAÑOS · cuántos cumple** (ago 2026): al pasar el ratón por un cumpleaños, el tooltip dice
  **«Cumple N años»** (los que cumple ESE día). Va en el `subtitle` del ítem, así que se ve igual en el
  tooltip y en el listado lateral de la agenda, en Inicio y en la ficha del artista. Punto único
  **`_birthday_age_label(bdate, day)`**, que **no inventa nada** si la fecha no es creíble (edad ≤ 0 o
  > 120: no pone edad).
- **CUMPLEAÑOS de los INTEGRANTES de un artista** (corregido ago 2026): salen SIEMPRE (uno o varios,
  `ArtistPerson.birth_date`) más la fecha del propio artista si la tiene, sin repetir. Antes los
  integrantes solo contaban si el artista estaba marcado como **grupo**, así que en uno sin esa marca
  no aparecía ningún cumpleaños aunque estuvieran puestos.
- **Alta rápida de entidades (modal superpuesto)**: `templates/_quick_create_modals.html` +
  `static/js/quick_create.js`. Junto a un `<select id="X">` añadir
  `<button type="button" data-quick-create="TIPO" data-target="X"><i class="fa fa-plus"></i></button>`
  (TIPO ∈ venue|promoter|ticketer|publishing_company|artist). Crea por `/api/<tipo>/create` (JSON),
  deja la entidad seleccionada sin recargar y gestiona duplicados.
- **Modales apilados** (`static/js/modal_stack.js`): un modal abierto desde dentro de otro se
  superpone **sin cerrar** el de debajo; al cerrarlo se vuelve al mismo punto con la entidad
  seleccionada. Neutraliza el auto-cierre del data-api de Bootstrap (deja `hide` como no-op durante
  el clic), escalona el z-index y restaura el bloqueo de scroll. **Se carga ANTES que Bootstrap en
  `layout.html`** (su listener de captura debe registrarse antes que el del data-api; si no, no
  funciona — no reordenar). Es automático y global (sirve para `data-bs-toggle` y para modales
  abiertos por JS como `quick_create.js`). Cualquier modal de alta nuevo debe crear por **AJAX y
  dejar seleccionado** (no navegar).
- **Vinculaciones entre entidades** (`ThirdPartyLink` + `templates/_entity_links_panel.html` +
  `static/js/entity_links.js`): relacionan un tercero/artista/medio/recinto/ticketera/editorial con
  otra entidad indicando **la relación** (texto, p. ej. "director de la radio", "novia del artista").
  Son **bidireccionales**: aparecen en la ficha de ambas partes. Tipos en `APP33_ENTITY_LINK_TYPES`;
  payload/búsqueda en `_entity_link_payload`/`api_entity_link_search`; el resumen para invitaciones/
  correo lo da `_promoter_link_summary(_text)` (lleva la relación por delante). Para añadir el panel a
  una ficha: pasar `entity_links=_entity_link_rows(s, '<tipo>', id)`, `entity_link_context`,
  `entity_link_types=APP33_ENTITY_LINK_TYPES`, `entity_links_can_edit` e `{% include
  '_entity_links_panel.html' %}`. El modal (elegir tipo → buscar con foto → crear rápido → relación)
  lo maneja `entity_links.js` (genérico para `[data-entity-link-form]`; con `data-link-ajax` guarda
  sin salir, p. ej. en invitaciones).
- **Loader global**: `#globalLoader` en `layout.html`; aparece al navegar, enviar formularios o en
  `fetch` >300 ms. Excluir con clase/atributo `no-loader`/`data-no-loader`.
- **Fichas (concierto/canción/álbum/artista) — estructura común** (en curso): **cabecera visual**
  (`.ficha-hero`) + **pestañas** (`.ficha-tabs`/`.ficha-tabpane`) + contenido **consolidado** (solo
  campos rellenos, sin textos explicativos) con **edición inline por sección** (`.ficha-section`):
  botón *Editar* (`[data-edit-toggle]`) que muestra el formulario (todos los campos, también vacíos) y
  *Cancelar* (`[data-edit-cancel]`); guarda **sin recargar** con `data-inline`/`ajax_inline` contra
  endpoints de **guardado parcial por sección** (`concert_section_update`, que reutiliza los helpers de
  `concert_update` sin reescribir la lógica económica). En **concierto** TODAS las secciones se editan
  inline (datos, colaboradores, comisionistas, cachés, equipamiento, contratos, notas); las filas
  dinámicas viven en **`static/js/concert_form.js`** (toggle por sección + constructores de filas por
  delegación: `[data-add-row]`/`[data-rows]`/`[data-remove-row]`; catálogos vía `window.CONCERT_FORM`;
  filas existentes rehidratadas desde placeholders `<script type="application/json" data-row-type>`).
  Secciones que **reemplazan** al guardar: colaboradores/comisionistas/cachés; que **añaden** (con
  borrado individual inline en la vista): equipamiento/contratos/notas. La página monolítica
  `concert_edit.html` y sus rutas (`concert_edit_view`/`concert_update`) se **retiraron** (concierto 100%
  inline). Clases en `styles.css`. **Las 4 fichas ya comparten el patrón** (concierto/artista/álbum/
  canción): cabecera `ficha-hero` + `ficha-tabs`/`ficha-tabpane` + secciones inline (incluidas las
  pestañas económicas: las de modal/solo-lectura enmarcadas en `.ficha-section`; las de tabla siempre
  editable —p. ej. Contratos del artista— con vista consolidada + Editar). El **toggle inline es
  `static/js/ficha_inline.js`** (GLOBAL en `layout.html`, compartido por las 4 fichas): `[data-edit-toggle]`/
  `[data-edit-cancel]`; `viewFor` resuelve la vista por `data-view` (selector explícito, p. ej. el "Datos"
  del concierto → `[data-datos-view]`), por `.ficha-section`→`[data-section-view]`, o por zona
  `[data-inline-zone]`→`[data-section-view]`; al mostrar emite el evento **`ficha:shown`**. `concert_form.js`
  ya NO duplica el toggle: solo aporta lo específico del concierto (filas dinámicas + init de datos/secciones,
  reaccionando a `ficha:shown`). En canción/álbum, el "Editar" de Información (antes `?edit=1` con recarga) es
  inline. El botón **“Volver”** va FUERA del hero (barra propia encima) en las 4 fichas. Para mostrar algo
  **solo en modo edición** usar **`data-edit-only="#formId"`** (lo togglea `ficha_inline.js` en `show`/`hide`):
  así el botón *Eliminar* de canción/álbum solo aparece al editar Información (vive dentro de la zona inline,
  por lo que también se oculta al guardar).
- **Materiales de canción** (`song_detail.html` pestaña *materiales* + helpers `_song_material_*` /
  `_build_song_material_context` / upload en `app.py`): `SongMaterial.slot_key` — portada `COVER`
  (principal) / `COVER_PROVISIONAL`; master `MASTER_48`/`MASTER_24`/`MASTER_16` + `SUBPRODUCT`;
  instrumental/TV track `DEFAULT` + `SUBPRODUCT`; stems `BUNDLE` (varios archivos por `bundle_key`). La
  portada efectiva (`Song.cover_url`) la resuelve `_resolve_song_cover_url` (principal o, si no,
  provisional). Audio **solo `.wav`**; barra de estado de 5 básicos, verde solo con portada **principal**.
  Reproductor inline `<audio>` + menú de 3 puntos (compartir/descargar/reemplazar/eliminar) vía macros
  locales de la plantilla.
- **MATERIALES DE CANCIÓN · etiqueta de audio y VIDEOCLIP** (ago 2026):
  · **El audio se ve como una ETIQUETA** (`.mat-chip`): icono del tipo + **play** + **duración**, y
  **sin nombre de archivo** —el módulo ya dice qué es («Master 48 bits», «Instrumental»…)—. Al
  pinchar suena, y **solo suena uno a la vez**. Motor `static/js/media_chip.js` (GLOBAL en
  `layout.html`), que engancha cualquier `[data-chip-src]`. La **duración la lee el navegador**
  (`preload="metadata"`: una lectura por rango del principio del archivo), no el servidor: así no
  cuesta una llamada a ffmpeg por archivo en cada carga y vale también para lo ya subido. Si no se
  puede leer, la etiqueta no la enseña. En los **stems** se conserva el nombre (ahí es lo único que
  los distingue).
  · **Maqueta**: Portada · **Videoclip** (mismo hueco que la portada, justo debajo) · Masters ·
  Instrumental · TV Track · **Stems**, que ocupa media columna para caer debajo de Instrumental y al
  lado de TV Track.
  · **VIDEOCLIP** (`SongMaterial.category='VIDEOCLIP'`, slots DEFAULT/SUBPRODUCT): se ve con su
  **miniatura**, y en los tres puntitos se descarga **en MOV o en MP4**
  (`_convert_video_content`: MOV y MP4 son el mismo códec en otro contenedor, así que se **remuxa**
  con `-c copy` —casi instantáneo y sin tocar la calidad— y solo si eso falla se recodifica).
  ⚠️ ffmpeg no está en el PATH del servidor: se usa el binario de imageio-ffmpeg (`_ffmpeg_exe`),
  el mismo del póster de los vídeos.
  · **Miniaturas**: la automática la saca ffmpeg en 2º plano (`_song_video_poster_schedule` →
  `SongMaterial.poster_url`, leyendo por RANGO sin bajarse el vídeo). Además se pueden **subir
  miniaturas a mano** (`category='VIDEO_THUMB'`), que **mandan** sobre la automática y se vinculan
  al vídeo por **`bundle_key` = id del videoclip**.
  ⚠️ `bundle_key` significa DOS cosas: el paquete de STEMS (que se **reemplaza** al subir) y el
  videoclip de una miniatura (que se **añade**). Por eso el reemplazo por `bundle_key` está
  limitado a STEMS: sin ese filtro, subir una miniatura borraba las anteriores.

- **INVITACIONES · CAMBIAR EL RECEPTOR al editar una petición** (ago 2026): el formulario de edición
  solo tenía un desplegable con cuatro opciones y **no había forma de decir A QUIÉN**; elegir «Otro»
  guardaba el modo y dejaba los datos del receptor anterior. Ahora sale el MISMO proceso que al
  crearla: «A alguien de la empresa» → el personal con su foto; «A otro» → barra de búsqueda de
  terceros con foto/logo y **alta al vuelo** (`data-quick-create="promoter"` sobre un `<select>`
  oculto, el sistema global). Si el elegido no tiene ni correo ni teléfono, se piden ahí mismo.
  · Punto ÚNICO **`_invitation_receiver_from_form`** (extraído de `_invitation_parse_guest_receiver`):
  lo usan crear, enviar una selección del plano y **editar**, así que el receptor se guarda igual en
  los tres. ⚠️ En una edición, «A mí» es **quien PIDIÓ** la petición, no quien la está editando.
  ⚠️ El formulario llega por AJAX y **`innerHTML` no ejecuta sus `<script>`**: todo el JS del
  receptor va por DELEGACIÓN en el `full_edit_modal()` de `_my_invitation_menu.html`. El panel que
  no toca se **deshabilita** (oculto no basta: sus campos se envían igual).

- **INVITACIONES · la foto o el logo, delante del nombre** (ago 2026): en las peticiones se enseñaba
  la del invitado pero no la de **quien la recibe** (una persona de la casa o un tercero salían solo
  con su nombre) ni la del **compromiso**. Punto único: `_invitation_request_payload` devuelve
  `receiver_photo` + `receiver_photo_is_person`, resueltos **EN VIVO** (el `receiver_payload` de las
  peticiones antiguas no guardaba la foto) — persona → redonda (`is-photo`), empresa → `is-logo`.
  Aplicado en la gestión del evento, en el panel de la ficha de la actividad, en la cabecera de cada
  compromiso, en la lista de invitados y en el módulo de Inicio.

- **INVITACIONES · una petición de VARIAS categorías se ve en TODAS** (corregido ago 2026).
  `_invitation_grouped` metía cada petición en un único grupo —su categoría «principal», la de más
  entradas—, así que al mirar una categoría faltaban peticiones que sí tenían entradas ahí. Ahora se
  pinta en **cada** categoría con cantidad > 0, con **su** número (`cat_qty`) y diciendo en qué otras
  está (`other_cats`); el contador del grupo cuenta SUS entradas, no el total de la petición.
  ⚠️ En la fila **solo se enseña el número de ESA categoría** (y la etiqueta de ubicación con todas
  desaparece cuando está repartida): ver «4 entradas» en la fila de una categoría que tiene 3 es
  justo lo que confundía. El total de la petición se dice al pasar el ratón.
  ⚠️ La copia de una categoría que NO es la principal va marcada (`is_secondary`): **no lleva el
  `id="req-…"`** (si no, habría ids duplicados en el DOM y `getElementById` cogería cualquiera) y
  **no se arrastra** — recategorizar se hace desde la principal, o el arrastre sería ambiguo.

- **INVITACIONES · las GALLETAS de la cabecera dicen lo que hay** (ago 2026). Eran «Por contrato ·
  Subidas · Solicitadas · Totales», y «Totales» era `subidas − solicitadas`: contaba las
  **bloqueadas** como disponibles y volvía a restar lo ya asignado (se restaba dos veces). Ahora
  (`_invitation_ficha_header_counts`, el mismo en la ficha de la actividad y en la gestión del
  evento): **Por contrato · Subidas · Bloqueadas** (galleta nueva, **solo si hay alguna**) **·
  Solicitadas** (lo pedido que TODAVÍA no tiene entrada asignada, no el total pedido: lo ya asignado
  ha dejado de ser trabajo) **· Disponibles** (subidas − asignadas − bloqueadas, que es
  literalmente `count(status='AVAILABLE')`). Todo sale de **una** consulta agrupada por estado más
  dos de asignadas por petición/compromiso. Se conserva la clave `total` como alias de `available`
  por lo que ya la leía.
  ⚠️ `.invitation-counts` pasa a **flex**: con `grid-template-columns: repeat(4,…)` la quinta
  galleta caía sola a otra fila en cuanto había bloqueadas.

- **INVITACIONES · el símbolo de DESCARGADA es POR CATEGORÍA** (ago 2026). Quien tiene entradas de
  Pista y de Grada y solo se ha bajado las de Pista tiene que verlo **en Pista y no en Grada**, sea
  la descarga parcial o completa. Antes la descarga solo se apuntaba en `downloaded_at` (una fecha
  para toda la petición) y el símbolo salía en TODAS sus categorías.
  · `InvitationRequest.downloaded_categories_json` (lo que ya tenía `InvitationCommitment`), que
  rellena el punto único **`_invitation_mark_downloaded`** (antes `_invitation_commitment_mark_…`),
  llamado ahora desde los **cuatro** caminos de descarga: PDF y ZIP de una petición y de un
  compromiso.
  · **`_invitation_download_cats(session_db, row)`** resuelve el estado por categoría
  (`{cat_id: {label, partial}}`) para peticiones y compromisos: **parcial** cuando en esa categoría
  hay entradas asignadas DESPUÉS de la descarga (ampliación), vía
  **`_invitation_last_added_by_cat`** (una consulta agrupada, cacheada en `g`).
  · `_invitation_grouped` **pisa** en la copia de cada categoría `downloaded_at_label`,
  `downloaded_partial` y `needs_download` (para que el filtro «Sin descargar» diga lo mismo que el
  símbolo); en los compromisos, cada `category_status` lleva ya `downloaded_partial`.
  ⚠️ Las descargas ANTERIORES a esto solo dejaron `downloaded_at`: se respetan como si se hubiera
  descargado todo ese día (si no, se borrarían marcas buenas de golpe).

- ⚠️ **SUBIDA A STORAGE · `cannot access local variable 'response'`** (bug real, ago 2026). Subiendo
  invitaciones, algunas fallaban con ese mensaje y entraban al reintentar a mano. Es un
  **UnboundLocalError DE storage3**: cuando la petición no llega a responder (corte de red, timeout)
  su variable `response` se queda sin asignar y revienta ahí — o sea, un fallo TRANSITORIO de red
  disfrazado de error de programación. Ahora `_storage_upload_retry` (en `supabase_utils.py`)
  reintenta 3 veces con respiro, y si aun así falla el mensaje explica lo que pasa en vez de soltar
  el error de Python. ⚠️ Si un reintento choca con «duplicate», la subida anterior SÍ había entrado:
  se da por buena en vez de reventar. Lo NO transitorio (archivo inválido, tamaño) no se reintenta.

  ⚠️ La misma regla vale para **«Marcar como enviadas» a mano** (que no manda ningún correo): una
  petición o un compromiso **sin invitaciones asignadas ya no se pueden marcar** —ni desde el menú
  (la opción no se ofrece) ni desde el endpoint (lo comprueba también el servidor)—, porque una fila
  que dice «Enviadas» sin tener ni una invitación es justo lo que confundía.
  **Excepción: la LISTA DE INVITADOS** (`uses_guest_list`), que por definición no lleva entradas y se
  entrega en la puerta: esa sí se marca. ⚠️ Para saberlo hay que pasarle las CATEGORÍAS a
  `_invitation_request_kind_flags` (sin ellas el mapa sale vacío y bloquearía justo ese caso).

- ⚠️⚠️ **INVITACIONES · solo se marca ENVIADO lo que se ha enviado de verdad** (bug real y grave,
  ago 2026). «Enviar todas las asignadas» marcaba invitaciones como ENVIADAS **sin haber mandado
  nada y sin haber ninguna asignada**. Dos causas, las dos corregidas:
  ⚠️ **`can_send` no exigía que hubiera entradas asignadas**: era
  `uses_guest_list or (assigned_or_sent and fully_assigned)`, y `fully_assigned` sale **True cuando
  el cupo es 0** (`qty_total <= 0`). Una solicitud en ASIGNADAS sin ninguna entrada pasaba el filtro.
  Ahora se exige además `assigned_total > 0` (un LISTADO sí puede enviarse sin entradas: ahí no hay
  PDF que asignar). Como `can_send` es el punto único, el arreglo vale para TODOS los caminos de
  envío: el individual, el de una categoría y el del evento entero.
  ⚠️ El marcado va ANTES de componer el correo (para que salgan las etiquetas «Nueva»), y se
  confiaba en un `session_db.rollback()` si el envío fallaba. Ahora va en un **SAVEPOINT**
  (`begin_nested`): si el correo no sale, se deshace SOLO eso — un rollback de toda la sesión se
  llevaba por delante lo pendiente de otras filas y podía dejar cosas marcadas a medias.

- **AGEDI · el VIDEOCLIP se registra como subproducto del single** (ago 2026):
  `_song_isrcs_by_kind` (ISRC de AUDIO o de VIDEO por separado) y **`_song_videoclip_registration`**
  (cuáles faltan, si el single ya está). En Registros → Pendientes:
  · si falta todo, la canción sale como **«Canción»** con la etiqueta **«+ videoclip (subproducto)»**;
  · si el single YA está registrado y solo queda el vídeo, sale como **«Videoclip»** y su descarga es
  el pack **`AGEDI_VIDEO`**: el **Label Copy con los datos del vídeo**
  (`_build_song_label_copy_pdf_bytes(..., video=True)`: mismo título e intérpretes del single, pero
  con los ISRC de vídeo, sus fechas y el director) **+ el videoclip en MP4**.
  · Lo que no se pueda incluir NO se calla: `_registros_pack_finish` mete el `LEEME - falta
  material.txt` (mismo criterio que el pack de AGEDI/SGAE del single).
  · En la ficha, los datos del videoclip llevan su etiqueta **«Pendiente de registro»** / «Registrado
  en AGEDI», igual que el módulo de ISRC de Información.

- **AVISOS · un aviso de algo YA resuelto se cierra solo** (`_notify_resolve`, ago 2026): un aviso es
  «esto te está esperando»; cuando deja de estarlo tiene que desaparecer sin que nadie lo pinche.
  Enganchado a las REMESAS (al aprobarlas del todo, al anularlas y al subir el justificante) y, como
  red de seguridad para los que ya quedaron colgados, al abrir la pantalla de una remesa ya aprobada
  o pagada — que es justo cuando uno descubre que ya estaba todo hecho (bug real: «remesa pendiente
  de aprobación» de una remesa aprobada y pagada).

- **VIDEOCLIP · «Sin videoclip» y datos del vídeo** (ago 2026):
  · **`Song.no_videoclip`**: la canción no va a tener vídeo. El módulo entero desaparece de
  Materiales y queda solo la etiqueta «Sin videoclip», que **es un botón**: al pincharla se deshace
  y vuelve a poder subirse (`discografica_song_videoclip_data`, `modo=sin_videoclip`).
  · **Maqueta del módulo**: a la IZQUIERDA el vídeo y sus subproductos (con miniatura), a la
  DERECHA los datos — **fecha de grabación**, **fecha de publicación** (con «la misma que el
  single», que la ata a `Song.release_date`), **director** (un TERCERO, con buscador Select2 con
  foto y `data-quick-create="promoter"` para crearlo al vuelo), los **ISRC de vídeo** y las
  **cesiones de derechos de imagen**.
  · Campos en `Song`: `videoclip_recorded_on` · `videoclip_release_date` · `videoclip_same_release`
  · `videoclip_director_promoter_id`. Las cesiones son materiales
  (`SongMaterial.category='VIDEO_RIGHTS'`), y se **acumulan** (una por persona que sale).
  · **ISRC separados**: `SongISRCCode.kind` ya distinguía AUDIO y VIDEO; ahora la ficha los reparte
  (`isrc_audio`/`isrc_video`) y se ven **por separado** en el módulo de ISRC de Información y
  **también** en el del videoclip — son los mismos datos mirados desde los dos sitios.

- ⚠️⚠️ **UN AVISO SE VE EN UN POP-UP, no navegando a otra pantalla** (ago 2026). Al pinchar un aviso
  —en la **franja**, en la **campana** o en «Mis avisos» de Inicio— se abre **`#notifViewModal`**
  (en `layout.html`, uno para toda la app) con su **cara**, su tipo, su fecha y su texto, y **dos
  botones**: **«Cerrar el aviso»** (lo marca leído, quita su franja y baja el contador) e **«Ir a
  resolverlo»**. Antes te sacaba de la pantalla en la que estabas y no había forma de cerrarlo.
  · Los avisos que **SON una página** (el de vacaciones, `/vacaciones/aviso/…`) se ven **dentro** del
  pop-up en un `<iframe>` y no llevan botón de ir: lo marca `embed` en el payload
  (`_notification_rows` y las franjas de `notifications_list`, que ahora devuelven lo mismo).
  ⚠️ Los avisos de la campana y de Inicio **ya no son `<a>`**: son botones con sus `data-notif-*`,
  porque un enlace navegaría. Si se añade otro sitio donde se listen avisos, se marca igual
  (`[data-notif-item]` + sus `data-`) y `notificaciones.js` lo coge por delegación.

- **AVISOS · franjas bajo el menú y campana al principio** (ago 2026, rediseño): la FRANJA
  (`.notif-strip`, en `#notifBar` justo debajo del menú) **no se va sola**: o se pincha —lleva a su
  gestión y el aviso queda leído— o se cierra con la ✕ (y sigue pendiente en la campana).
  ⚠️ **Y SALE EN TODAS LAS PÁGINAS hasta entonces**, para TODO el mundo (corregido ago 2026): antes
  `/avisos?nuevos=1` devolvía solo lo que no hubiera «saltado» (`shown_at`) y lo marcaba, así que una
  franja salía UNA vez y, si no te daba tiempo a verla, no volvía. Ahora devuelve **lo pendiente que
  no se ha cerrado** (`read_at IS NULL AND strip_dismissed_at IS NULL`), y la ✕ se apunta en el
  servidor (`notifications_dismiss_strip`, columna `AppNotification.strip_dismissed_at`): si no, la
  franja volvería a salir en la página siguiente. `shown_at` se conserva como dato informativo.
  ⚠️ El orden lleva el **`id` como segundo criterio**: varios avisos creados en la misma operación
  comparten `created_at` y las franjas se reordenaban en cada página. La
  **campana** es lo PRIMERO del menú, **solo se ve si hay pendientes** (el JS le quita el `d-none`)
  y al pincharla salen todos en un **pop-up** para resolverlos uno a uno.
  ⚠️ La campana se excluye de `topItems()` en `initUsageOrderedOverflowNav`: si no, el menú de
  desbordamiento la trata como una sección y `clearOverflow` le quitaría el `d-none` con el que se
  esconde. Y **fuera el flash de bienvenida** al entrar (`ROLE_WELCOME`).

- **BARRA DE BOTONES de la ficha de CANCIÓN y de ÁLBUM** (ago 2026): las dos tienen ya la
  **`.ficha-quick`** bajo la cabecera (la misma de la ficha de actividad) y en ellas se llena de
  **DERECHA A IZQUIERDA** (`.ficha-quick--end` = `flex-direction: row-reverse`): el primer botón del
  HTML es el de más a la derecha y los que se añadan salen a su izquierda. En la ficha de ACTIVIDAD
  la barra sigue siendo de izquierda a derecha (sin el modificador).
  · «Entrega de masters» pasó a **«Solicitar Masters»** (el título del modal también) y vive ahí.
  ⚠️ El **modal NO se mueve**: está fuera de las pestañas, así que el botón vale desde cualquiera y el
  auto-open de `?delivery_created=1` sigue funcionando. La página pública sigue llamándose «Entrega de
  masters» a propósito: es lo que entrega el tercero, no lo que pedimos nosotros.
  · **«Compartir LC»** subió también a la barra (antes estaba en la cabecera de la pestaña
  Información), así que se comparte el Label Copy desde cualquier pestaña.
  ⚠️⚠️ Y por eso las funciones de COMPARTIR son **GLOBALES** (`static/js/scripts.js`:
  `shareByMail`/`shareByWhatsapp`/`shareBySms`/`copyShareLink`). Estaban definidas DENTRO de los
  bloques `{% elif tab == ... %}` de canción (materiales, editorial) y álbum (beneficiarios), así que
  en las demás pestañas no existían: el «Compartir LC» de la pestaña Información llamaba a una función
  inexistente y el clic **no hacía nada** (bug real). Las tres copias locales se han retirado: una sola
  implementación. Al añadir un botón de compartir a cualquier pantalla, usar las globales.
  · `initTypeahead` (`static/js/typeahead.js`) **sale si el campo no está en la pantalla**: se llama
  desde scripts que corren en TODAS las pestañas de una ficha y petaba con «Cannot read properties of
  null», llevándose por delante el resto del arranque de esa página.
- ⚠️ **EL DOMINIO DE LOS ENLACES lo decide `CANONICAL_HOST`** (ago 2026). `_public_base_url()` ya no
  antepone `EXTERNAL_BASE_URL`: manda el **host canónico** (`app.33producciones.es`), el mismo al que
  redirige la app, y solo si no lo hubiera se mira esa variable y, en último caso, el host de la
  petición. Una variable olvidada en el servidor con el dominio ANTIGUO hacía salir con él TODOS los
  enlaces compartidos (bug real). La URL vieja de Render (`*.onrender.com`) **nunca** vale para un
  enlace que se comparte. Cambiar de dominio = cambiar UNA variable. Y los logos de los correos ya no
  usan `url_for(..., _external=True)` (que toma el host de la petición): **no queda ninguno**.

- **MÓVIL · lo que no cabe SE DESPLAZA, no se estruja** (ago 2026). El navegador estrechaba las
  columnas hasta partir las palabras letra a letra. Red de seguridad al final de `styles.css`
  (`@media (max-width: 767.98px)`): las **pestañas** (`.nav` que no sea vertical ni la del navbar) se
  deslizan en horizontal con `nowrap` · las **tablas** llevan scroll —las que no traen
  `.table-responsive` de la plantilla las envuelve `scripts.js` en un `[data-table-scroll]`, también
  las que llegan por AJAX (MutationObserver)— con `min-width` de 34rem y celdas de 4,5rem mínimo ·
  las **fichas de material** y las **celdas con foto + nombre** envuelven (`flex-wrap: wrap`) en vez
  de dejar el texto en una columna de 6 px · los **códigos** (ISRC…) no se parten (`.text-nowrap`).
  ⚠️ Comprobado con un detector propio a 375 px sobre ~90 pantallas (listados, fichas, pestañas y
  páginas públicas): **cero casos**. Si se toca el layout, ese detector es la forma de comprobarlo:
  busca elementos de menos de 60 px con 3+ líneas y ≤4 caracteres por línea.

- **DISCOGRÁFICA · PROYECTOS** (ago 2026): donde se PREPARA el material discográfico —álbumes, EPs,
  singles y videoclips—, en su propia pestaña (`/discografica?section=proyectos`). **`DiscoProject`** + **`DiscoProjectTrack`** +
  **`DiscoProjectDateRequest`** (`ensure_disco_projects_schema`). ⚠️ **No existe ningún
  `DiscoProjectMaterial`**: los materiales se suben en la ficha del lanzamiento (`SongMaterial`). ⚠️ Un proyecto NO es el lanzamiento (eso son `Album`/`Song`
  cuando ya existen): es el trabajo previo.
  · **La pantalla**: los ARTISTAS con proyectos activos y su número; al pinchar uno, los suyos
  (`?proj_artist=<id>`, y los archivados con `?proj_archivados=1`).
  · **Cada proyecto tiene CINCO pestañas, en este orden** (`DISCO_PROJECT_TABS`): **Calendario**
  (las FECHAS a la izquierda, el CALENDARIO a la derecha y las TAREAS PENDIENTES debajo) ·
  **Información** · **Materiales** · **Bolsa** · **Hoja de ruta**.
  · ⚠️⚠️ **EL PROYECTO CREA EL LANZAMIENTO EN REPERTORIO, en PROVISIONAL** (ago 2026): al crear el
  proyecto se da de alta lo que corresponda —un `Album` con sus `AlbumTrack` (los temas nuevos crean
  su `Song`; los que venían del repertorio se enganchan tal cual), una `Song` en un single o en un
  videoclip suelto, y nada en un videoclip de algo que ya existe— con **`is_provisional=True`**
  (`_disco_project_create_release`). **Los MATERIALES se suben DONDE SIEMPRE**, en la ficha de la
  canción o del álbum: la pestaña «Materiales» del proyecto solo enseña el estado y lleva allí.
  · **Lo provisional se ve**: fondo rayado suave y etiqueta «Provisional» **en el mismo sitio y con
  el mismo aspecto en los tres**: el repertorio (`tr.is-provisional`), las dos fichas
  (`.ficha-hero.is-provisional`) y el **listado de «Lanzamientos»** (`.launch-row.is-provisional`,
  ago 2026), que comparten la MISMA regla del rayado — una sola declaración, así que no se pueden
  desparejar. En el calendario de esa pantalla, donde solo hay portadas, se dice al pasar el ratón.
  ⚠️ La fila del listado lleva la clase `border` de Bootstrap (con `!important`): el color del marco
  se cambia por su **variable** (`--bs-border-color`), no repitiendo la propiedad.
  · **Mientras es provisional, el lanzamiento SIGUE al proyecto** (`_disco_project_sync_release`:
  nombre, fecha y soportes). En cuanto se cierra, deja de tocarse: manda su ficha.
  · **CERRAR el proyecto** (`disco_project_close`, en la rueda) es lo que le da paso a **distribución
  y registro**: el lanzamiento deja de ser provisional (`_disco_project_set_provisional`, que **solo
  toca lo que creó el proyecto**: un tema que ya estaba publicado no era provisional y no se toca) y
  le llega a **REGISTROS** como tarea —aviso `REGISTROS` + módulo de Inicio `HOME_PROJECT_REGISTROS`
  (`_home_project_registros`)— para **cumplimentar los datos y subir los materiales**, con lo que
  falta dicho (portada, másters). Se cierra con «Datos y materiales completos»
  (`disco_project_registros_done`), y el aviso se cierra solo. Todo es reversible (reabrir / volver a
  pendiente).
  · **Y se cierra SOLA cuando ya está** (ago 2026): si el lanzamiento tiene portada y másters, nadie
  tiene que acordarse de pinchar nada — `_disco_project_registros_autoclose` la marca (queda apuntado
  «automático» en `registros_done_by_nick`) y resuelve el aviso, con `_disco_project_registros_missing`
  como punto único de qué falta. Se comprueba al **mirar la ficha** del proyecto y al **montar el
  módulo de Inicio**, que es la red de seguridad para lo que se subió por otro camino (la misma regla
  que `_notify_resolve`: una tarea es «esto te está esperando» y cuando deja de estarlo desaparece).
  ⚠️ El módulo de Inicio solo **confirma** el cierre si la sesión es SUYA (`propia`): con una sesión
  prestada manda quien la abrió.
  · **El calendario es el componente de la agenda de siempre** (`_agenda_calendar.html`, modo
  «artist»), con un payload propio (`_disco_project_agenda`). ⚠️ **Sin `artist_id`**: así
  `unlimited` sale false en `agenda_calendar.js` y las flechas se mueven dentro de lo cargado sin
  pedirle nada al servidor (el calendario de un proyecto son SUS fechas, no la agenda del artista).
  · **Las TAREAS PENDIENTES** (`_disco_project_tasks`) dicen lo que falta para poder lanzarlo (la
  fecha, los temas, el soporte físico, la portada, el máster, el vídeo, la hoja de ruta, la bolsa) y
  cada una **desaparece sola** en cuanto se hace.
  · **En un SINGLE CON VIDEOCLIP se leen PARTIDAS** (ago 2026): a la izquierda lo del **single**
  (portada, máster) y a la derecha lo del **videoclip**; debajo, **a todo el ancho**, lo del
  **LANZAMIENTO** (la fecha, la hoja de ruta, la bolsa, cerrarlo), que es de los dos y por eso no
  cuelga de ninguna mitad. Cada tarea nace con su `group` (`single` · `video` · `lanzamiento`, en el
  propio `tarea(...)`) y el reparto lo hace **`_disco_project_task_groups`**, que solo parte cuando el
  proyecto ES un single (`DISCO_SINGLE_KINDS`) **y** lleva vídeo — así se parte igual con el tipo
  «Single + Videoclip» y con un single al que le marcaron la casilla, que es la misma situación. En
  cualquier otro proyecto devuelve `split: False` y se ve la lista de siempre.
  ⚠️ `task_groups` hay que añadirlo a las claves que se QUITAN del contexto de la bolsa (`bag_ctx`):
  si no, `render_template` revienta con «got multiple values».
  · **La HOJA DE RUTA es la misma de las actividades**: basta con que «project» esté en
  `ROADMAP_ENTITY_TYPES` y con las ramas del proyecto en `_roadmap_entity` / `_roadmap_base_days`
  (su lanzamiento y los temas con fecha propia) / `_roadmap_artist_ids` / `_roadmap_title`. Lo que se
  ponga ahí sale también en el calendario del proyecto.
  · **La BOLSA** es un `WorkflowBag` con `bag_type='PROYECTO'` y `linked_type='PROJECT'`
  (`_ensure_project_bag`, mismo patrón que una promoción) y se embebe con el MISMO panel que
  `/bolsas/<id>`. ⚠️ Al mezclar su contexto hay que quitar las claves que chocan con las de la ficha
  (`bag`, `tab`, `row`…) o `render_template` revienta con «got multiple values».
  · **Funciona EXACTAMENTE igual que las demás bolsas** (mismo panel, mismos gastos, misma
  liquidación: lo que se mejore en las bolsas vale también para estas), pero sus **CATEGORÍAS son
  otras** (`DISCO_BAG_EXPENSE_CATEGORIES`, ago 2026) — producir un disco no se parece a producir un
  concierto: **Producción audio · Producción vídeo · Producción álbum físico · Logística ·
  Alojamiento · Marketing y promoción · Otros gastos**, y las de un concierto (recinto, rider,
  músicos…) **no se ofrecen**. Las tres de producción salen **solo si tocan**: audio si el proyecto
  lleva audio (cualquiera menos un videoclip suelto), vídeo si lleva videoclip
  (`_disco_project_has_videoclip`) y físico si el lanzamiento sale en soporte.
  · Punto único **`_bag_visible_expense_categories(session_db, bag, expenses)`**, que alimenta el
  contexto del panel: con eso siguen **tanto el listado por categorías como el selector «Módulo»** de
  cada gasto. ⚠️ Conserva además cualquier categoría que YA tenga gastos apuntados (si no, un gasto
  quedaría invisible), y sin proyecto vinculado no descarta nada.
  ⚠️ El **CATÁLOGO** (`BAG_EXPENSE_CATEGORY_LABELS`/`_ICONS`) es la **unión** de las dos listas: de él
  salen el nombre de la categoría de un gasto en el resto de la app (pagos, contabilidad…) y la
  validación al guardarlo. Si una clave nueva no está ahí, `_bag_expense_display_cat` la degrada a
  «Otros» **sin dar ningún error** y el gasto aparece donde no es.
  ⚠️ Y **`PROYECTO` tuvo que entrar en `BAG_TYPES`**: no estaba, así que el selector «Tipo» de la
  bolsa no lo tenía y **guardar la bolsa desde su pantalla lo cambiaba a «General»** (bug real), con
  lo que perdía sus categorías.
  · ⚠️⚠️ **UNA BOLSA DENTRO DE ALGO QUE YA TIENE CABECERA NO REPITE LA SUYA** (regla de la casa, ago
  2026, y vale para TODAS): la cabecera de la bolsa —y sus **datos** (título, tipo, estado, fechas) y
  sus **notas**, que son también su cabecera— se pintan **solo en su propia página**
  (`bag_standalone`, que lo pone `bag_detail.html`). Embebida en un proyecto discográfico, en una
  actividad o en una promoción se entra **directamente por el resumen económico** (y los ingresos, si
  los hay) **y los gastos**; para tocar sus datos está «Abrir la bolsa».
  ⚠️ El **resumen económico** vive FUERA de ese bloque (antes estaba dentro y desaparecía con él); en
  una actividad no se pinta porque su pestaña de Producción ya trae esos totales arriba
  (`bag-embed-head`) y su propio módulo de Ingresos. `bag_hide_hero` se conserva por compatibilidad,
  pero lo que manda es `bag_standalone`.

- **CABECERA DE UNA BOLSA · la misma de una actividad** (ago 2026): donde la bolsa sí lleva cabecera
  (`/bolsas/<id>` y la pestaña Producción de una actividad) es ya un **`ficha-hero`** como el de la
  ficha de una actividad: foto redonda, antetítulo con el tipo de bolsa, título con las etiquetas de
  estado y de liquidación, la línea de datos **con iconos** (artistas, vínculo, fechas, total) y la
  **empresa del grupo arriba a la derecha** (`.hero-company`, con su icono si no tiene logo).
  ⚠️⚠️ **La foto del artista salía OVALADA** (bug real): era un `<img>` con un tamaño fijo suelto
  dentro de un `d-flex`, y **cualquier hijo de un flex se puede encoger** — en cuanto la fila iba
  justa se comprimía a lo ancho manteniendo el alto. Con `.ficha-hero__media` (que es `flex:0 0 auto`)
  no puede pasar; comprobado a 375 px, donde sigue midiendo 96×96.
  · **El ASISTENTE** (`_disco_project_wizard_modal.html`, con `step_wizard.js`): artista (los activos
  primero y el resto tras «Ver más artistas») → tipo → y según el tipo: **álbum/EP** (nombre, nº de
  temas → tabla que se genera sola con nombre, colaboración y «tema ya existente» del repertorio;
  formato DIGITAL / DIGITAL+FÍSICO / SOLO FÍSICO y sus soportes CD/vinilo/casete; y el planteamiento
  de lanzamiento con la fecha y los temas que salgan en otra) · **single** y **single + videoclip**
  (nombre, colaboración y fecha) · **videoclip** (de un tema del repertorio, de otro proyecto o suelto).
  ⚠️ **Un tema YA EXISTENTE no lleva fecha**: sale con la etiqueta «Ya publicado».
  · **«SINGLE + VIDEOCLIP» es un TIPO, no una casilla** (ago 2026): la casilla «Incluye videoclip» del
  paso del single se **retiró** y en su lugar hay un tipo propio (`SINGLE_VIDEOCLIP`, «Single +
  Videoclip»), que hace exactamente lo que hacía la casilla marcada
  (`includes_videoclip = true`). Se prepara **igual que un single** —punto único
  **`DISCO_SINGLE_KINDS`**, hermano de `DISCO_TRACKLIST_KINDS`— así que su paso del asistente es el
  mismo (`data-sw-when="SINGLE,SINGLE_VIDEOCLIP"`; ⚠️ el `data-sw-when` casa por token exacto: hay que
  nombrar los dos) y crea su `Song` provisional en repertorio.
  · **¿Lleva vídeo?** lo dice el punto único **`_disco_project_has_videoclip`** (tipo VIDEOCLIP o
  SINGLE_VIDEOCLIP, o la casilla marcada), y de ahí sale la tarea **«Falta el videoclip»**
  (`_disco_project_missing_videoclip`): se mira en la canción del lanzamiento, que es donde se sube, y
  **no reclama nada** si ya hay un material VIDEOCLIP o si la canción está marcada «Sin videoclip»
  (`Song.no_videoclip`) — eso es una decisión tomada, no algo que falte.
  ⚠️ En un «Single + Videoclip» la ficha **no ofrece la casilla** (no se puede quitar lo que dice el
  tipo) y el guardado la fuerza a `true`; en un single a secas sigue estando, para poder decir más
  adelante que llevará vídeo. Y la etiqueta «Con videoclip» solo se pinta cuando el tipo NO lo dice ya
  (`row["video_badge"]`): al lado de «Single + Videoclip» sería repetirlo.
  · **Un tipo que son DOS cosas se dibuja con SUS DOS ICONOS y un + en medio**: punto único
  **`_disco_kind_icon_html`** (global de plantilla **`disco_kind_icon(kind, cls)`**) +
  `DISCO_PROJECT_ICON_PARTS` (`SINGLE_VIDEOCLIP` → nota + película) y las clases `.kind-icons` de
  `styles.css`. Se usa en la tarjeta del asistente, en la fila del listado, en la cabecera de la
  ficha y en el hito del lanzamiento del calendario (esos dos últimos por `icon_html`, que va en el
  propio diccionario). El **+ es un icono más** (`fa-plus`), así que hereda el color y el estado —el
  rojo de la tarjeta elegida— y solo se le baja el tamaño.
  ⚠️ Los iconos toman el tamaño **del sitio donde van** (`.kind-icons i.fa{font-size:inherit}`) y el
  + es una fracción DE ELLOS: así la proporción se mantiene igual en la tarjeta grande, en el badge
  de 42 px del listado y en una línea de texto, sin ajustarla en cada sitio. Con el `em` colgando del
  contenedor (que es 1 rem) el + salía a 9 px al lado de iconos de 24 y parecía un punto.
  ⚠️ En el **badge de 42 px** del listado los dos iconos entran justos: ahí van algo más pequeños y
  más juntos (medido: 36 px, sin desbordar).
  ⚠️⚠️ **CADA ASISTENTE CARGA SU MOTOR**: el parcial tiene que traer su
  `<script src=".../js/step_wizard.js">` (como los de promoción, giras y ciclos). Sin él el modal se
  abre **EN BLANCO y no avanza** —`.sw-step` está oculto por CSS (`display:none`) y es ese JS quien
  activa el primer paso, pinta el progreso y cablea «Siguiente»— y no salta ningún error: parece que
  el botón «no hace nada» (bug real del asistente de proyectos).
  ⚠️ `step_wizard.js` NO expone `swNext`: el auto-avance se pide con **`data-sw-advance`** en el
  propio control (y los pasos que no tocan se saltan con `data-sw-when`, que además DESHABILITA sus
  campos: si no, el navegador se para a validar un `required` invisible).
  ⚠️ Si NINGÚN artista sale como «activo» (nadie con contrato discográfico) se enseñan **todos** desde
  el principio: la rejilla del primer paso no puede quedarse vacía.
  ⚠️ **`dict()` sobre las tuplas de tres del catálogo revienta en la plantilla**: el mapa
  clave→etiqueta se pasa hecho (`kind_labels`).
  ⚠️ **`DiscoProject.song` necesita `foreign_keys=[song_id]`**: hay DOS caminos a `songs` (el tema del
  videoclip y `release_song_id`, el lanzamiento creado) y SQLAlchemy no arranca sin decírselo.
  ⚠️ La sección nueva hay que añadirla a la **lista blanca de `section`** de `discografica_view`, al
  catálogo de permisos (`discografica.proyectos`) y a los DOS mapeos de endpoints (los suyos se
  llaman `disco_project_*`, fuera del prefijo `discografica_`).

- **PROYECTO DISCOGRÁFICO · LAS TAREAS DE AUDIO VAN POR PASOS** (ago 2026). Cuando el proyecto lleva
  audio (`_disco_project_has_audio`: todos menos un videoclip suelto), las primeras tareas son un
  proceso, no una lista de avisos, y **las hechas se quedan a la vista con el dato que se fijó**
  (`state` = todo · wait · blocked · done; la macro `lista_tareas` de `disco_project_detail.html`
  pinta el estado, el botón de su pop-up y sus tres puntitos).
  · **1 · Confirmar disponibilidad de fecha** → ⚠️ **la fecha del proyecto es una INTENCIÓN; la que
  vale es la que confirma REGISTROS**. Se le pide con `disco_project_date_request` diciendo qué
  queremos (`DISCO_DATE_REQUEST_KINDS`: esta fecha · una franja · lo antes posible · todavía sin
  fecha) y queda en **`DiscoProjectDateRequest`** (una viva por proyecto; pedir otra anula la
  anterior). Mientras esperan, la tarea sale «Esperando» con **Volver a pedirlo** / **Anular**.
  Cambiar una fecha ya confirmada es el MISMO proceso (`is_change`), desde los tres puntitos.
  · **2 · Fecha máxima de entrega** → la fija REGISTROS **al confirmar la fecha, en el mismo
  formulario** (`registros_release_date_confirm`, pantalla `/registros/fechas`): sin plazo no se
  puede avisar a nadie, así que van juntas a propósito. Si confirman otra fecha, se le dice a quien
  lo pidió, se actualiza el proyecto y **el aviso del plazo que se hubiera mandado deja de valer**.
  Después, la tarea es **notificar al productor (o al artista)**: `disco_project_materials_notify`
  manda el correo con el logo de **PIES** arriba a la derecha, «Fecha máxima de entrega de
  materiales» centrado, la cabecera del lanzamiento y el botón **Subir materiales**, que es el
  **enlace de entrega de masters de siempre** (`_disco_project_delivery_links` crea el que falte:
  no se inventa otro sitio para subir materiales).
  ⚠️ La tarea sale **BLOQUEADA** mientras no se sepa quién produce: es a quien se le avisa.
  ⚠️ **Recordatorio automático** a `DISCO_MATERIALS_REMINDER_DAYS` (2) días del plazo si los másters
  no están subidos: `_disco_materials_reminder_sweep`, **una sola vez** (`materials_reminder_at`) —
  uno que insiste todos los días deja de leerse—. Va en su cron (`/cron/materiales-proyecto`) y
  también dentro del cron diario de documentos, para no depender de otra tarea en el servidor.
  · **3 · Producción y sus subtareas**: quién produce (+ fee, «sin fee» o presupuesto, y su % —con
  «no lo sé todavía», que **deja el % como subtarea abierta a propósito**—), quién mezcla, quién
  masteriza (el productor, un tercero, o un tercero que gestiona el productor) y **quién graba las
  voces** (con su coste, fecha, lugar —estudio del productor / casa del artista / otro, con la
  dirección autocompletable— y su **logística**, que al marcarla le sale como tarea a la persona de
  producción elegida). Todo se guarda con `disco_project_production_save` por secciones
  (`section=producer|mix|master|vocals`) en **`DiscoProject.production_payload`** (JSONB); quien
  produce sí es columna (`producer_promoter_id`) porque es a quien se le reclaman los materiales.
  Estado en **`_disco_production_state`**, pop-ups en `templates/_disco_project_steps.html`.
  ⚠️ En esos pop-ups, los paneles que dependen de una elección van con **`data-dp-when`** y los
  ocultos **se deshabilitan** (un campo oculto se envía igual), y el valor de las tarjetas viaja por
  un oculto que lo ESPEJA (`data-dp-mirror`).
  ⚠️ **A quién se avisa en Registros**: `_registros_user_ids` (con `_profile_in_department`, y si
  nadie tiene Registros cae al Sello y luego a dirección). **No** vale `_department_user_ids`: ese lee
  `departments` en crudo y una fila donde quedó guardado como TEXTO no casa con nada, así que esa
  persona no recibiría el aviso sin dar ningún error (por eso `disco_project_close` también lo usa ya).
  ⚠️ `_notify_user` **no avisa a uno mismo**: si quien pide la fecha es la única persona de Registros
  no le llega nada, pero la solicitud **no se pierde** (sigue en `/registros/fechas`).
  ⚠️ El aviso lleva su propio kind **`FECHA_LANZAMIENTO`** (en `NOTIFICATION_KIND_META`, con su
  etiqueta y su icono): un kind que no esté en ese catálogo se guarda igual pero sale en la campanita
  **sin etiqueta ni icono**. Y el canal del artista es **`DISCOGRAFICA`** —una clave exacta y en
  mayúsculas—: `_artist_notification_emails` con un canal mal escrito devuelve **[] en silencio**.
  ⚠️ **Bug de orden arreglado de paso**: la tarea «cierra el proyecto» se decidía ANTES de añadir «la
  hoja de ruta está vacía» y «sin bolsa», así que salía a la vez que ellas. Ahora se decide al final
  y solo si no queda **nada** pendiente.
  ⚠️ Lo nuevo del contexto de la ficha (`date_state`, `production`, `materials_recipients`,
  `promoters`, `production_people`, `has_audio`) hay que quitarlo del contexto de la **bolsa**
  (`bag_ctx`) o `render_template` revienta con «got multiple values».
  · **PENDIENTE (siguientes lotes)**: subir demo vinculada al proyecto · portada (nosotros / artista /
  tercero, con foto, idea, solicitud, PSD+JPG y **aprobación del artista**) · otras creatividades
  (encargo a diseño con formatos y tamaños) · **IDs** de plataformas (subirlos o pedírselos al
  artista) · **plan de lanzamiento** (estrategia, acciones, marketing, promoción, contenidos y
  cronograma, con el OK de dirección y sello y los **recordatorios de publicación**).

- ⚠️⚠️ **EL CORREO DE UN TERCERO ES `contact_email`, NO `email`** (bug real, ago 2026). En
  `Promoter` los campos son **`contact_email`** y **`contact_phone`**: `p.email` y `p.phone` **no
  existen**, así que un `getattr(p, "email", "")` devuelve siempre `""` y el aviso **no le llega a
  nadie sin dar ningún error** (pasó con el plazo de entrega al productor, con la solicitud de portada
  al tercero y con los correos de los integrantes). Punto único **`_promoter_email_phone(promoter)`**
  → `(correo, teléfono)`: usarlo SIEMPRE, nunca leer los campos a mano.

- ⚠️⚠️ **UN CALENDARIO CON `kinds: []` SALE VACÍO** (bug real, ago 2026): `agenda_calendar.js` filtra
  todo lo que pinta con `activeKinds`, que se construye **con la lista `kinds` del payload**. Un
  payload propio (como el CRONOGRAMA del plan) tiene que emitir los tipos que trae, con su etiqueta,
  su icono y su color —y el tipo tiene que estar en **`AGENDA_KIND_META` y en `AGENDA_KIND_ORDER`**
  (por eso existe ahora el tipo **`contenido`**, «Publicaciones»)—.
  ⚠️ Y una página **standalone** que use el parcial `_agenda_calendar.html` tiene que **cargar
  `agenda_calendar.js`** a mano: el parcial solo deja el JSON, quien dibuja es el JS (que en las
  pantallas de dentro viene de `layout.html`).

- **PROYECTO · LOGÍSTICA** (ago 2026): un paso más del proyecto. Se dice **si hace falta o no** y,
  si hace falta, **se le SOLICITA a una persona de producción** — y a partir de ahí **es tarea suya**.
  · **Qué se le pide**: cuatro notas (`DISCO_LOGISTICS_NOTES`) — **qué se pide · transportes ·
  alojamiento · personal** — y a quién (las personas de `_production_people`). Pop-up
  `#dpLogisticsModal`, endpoint `disco_project_logistics_save`, estado en
  **`_disco_logistics_state`** (`production_payload['logistics']`).
  · **Al solicitarla**: le llega el aviso (kind `PRODUCCION`, ref `DISCO_LOGISTICS`), **entra en el
  PERSONAL de la hoja de ruta** del proyecto (`_disco_logistics_roadmap_add`, rol «Producción ·
  logística», sin duplicar) y **se crea la BOLSA** si no existía — son los dos sitios donde trabaja:
  los horarios y los gastos.
  · **Le sale en SU Inicio** (`HOME_DISCO_LOGISTICS` ← `_home_disco_logistics`), con las cuatro notas
  a la vista y tres botones: la bolsa, la hoja de ruta y **«Ya está montada»**
  (`disco_project_logistics_done`), que cierra el aviso solo y deja la tarea en «Montada por X».
  Va en el bloque de **lo SUYO** de Inicio: se le pide por su nombre, así que no depende de ningún
  permiso de sección.
  ⚠️ `disco_project_logistics_done` va en **`REQUEST_ANY_ENDPOINTS`**, no en `SUPPORT_ACTION_ENDPOINTS`:
  ese exige ser «actor» (poder editar alguna sección) y quien lleva la logística puede no tener
  ninguna — se comía un **403 al resolver su propia tarea** (comprobado). El endpoint verifica dentro
  que la logística es SUYA (o que es del sello o de dirección).
  ⚠️ **Es UNA sola logística**: la que había dentro del pop-up de la grabación de voces se retiró y
  lo que estuviera guardado ahí se **lee igual** (compat en `_disco_logistics`), para no perder lo ya
  pedido. Al guardar la nueva se limpia la vieja, para que no haya dos sitios diciendo cosas distintas.
  ⚠️ Cambiar de persona **vuelve a pedirla** (la fecha de solicitud y el «montada» se resetean): es
  otra persona la que tiene que hacerlo.
  ⚠️ `_roadmap_save` hace **commit**: se llama al final, cuando lo demás ya está en la sesión.
  ⚠️ Lo nuevo del contexto (`logistics`, `logistics_notes`) hay que quitarlo del de la **bolsa**
  (`bag_ctx`) o `render_template` revienta con «got multiple values».

- **PROYECTO · EL PLAN: promoción, aprobación y aviso al artista** (ago 2026):
  · **Solicitar el plan de PROMOCIÓN** (`disco_plan_promo_request`): se le pide a promoción con
  **indicaciones y objetivos**; les sale como tarea en su Inicio (el módulo **«Tareas del sello»**,
  que es el de las notas de prensa: mismo público, un solo módulo) y **lo que suben queda dentro de
  este plan** (`disco_plan_promo_upload`, en `REQUEST_ANY_ENDPOINTS` porque lo sube promoción).
  · **El REPASO** (`disco_plan_review`): se le pide a quien es **dirección y sello a la vez** y les
  sale como **tarea pendiente** (el plan **y sus gastos**); pueden **devolverlo con una nota**, que
  quita los dos OK y se lo dice al sello. Con **los dos OK** el plan queda aprobado y al **jefe de
  producto** le llega que lo tiene **liberado**.
  ⚠️ **Un OK borra el rechazo anterior** y la tarea da prioridad a «aprobado» sobre «rechazado»: si no,
  el plan se quedaba marcado como devuelto para siempre aunque lo aprobaran (bug real de la prueba).
  · **Notificar el plan AL ARTISTA** (`disco_plan_notify_artist`): solo **aprobado** y **antes de que
  empiece**. El correo lleva el plan **por secciones** (estrategia, acciones con sus fechas,
  marketing, promoción y publicaciones) y el botón al **cronograma online** de siempre, que se ve
  al día — y también sale por **SMS** con ese enlace. ⚠️ **Sin nada de economía**: ni costes ni
  presupuestos (`_disco_plan_artist_email_body`).
  · **ALERTAS** (`_disco_plan_notice_sweep`, en el cron diario del proyecto): a
  **`DISCO_PLAN_NOTICE_WARN_DAYS`=3** días de que empiece el plan, aviso al **jefe de producto**
  («quedan 3 días … y todavía no se le ha compartido»); a **2 días**, se **escala a dirección+sello**
  por campanita **y por correo**.
  ⚠️ Cada aviso **una sola vez**, y **si ya se escaló no se vuelve a avisar del plazo**: sin eso el
  barrido soltaba el «quedan 3 días» todos los días siguientes (lo sacó la prueba).

- **PROYECTO · LA COLABORACIÓN** (ago 2026, solo si `DiscoProject.is_collab`): tres pasos seguidos.
  · **1 · Condiciones** (`disco_project_collab_conditions`): de quién es el máster y en qué %
  (`DISCO_COLLAB_OWNERS`), quién cubre los gastos y en qué medida (`DISCO_COLLAB_EXPENSES`) y quién
  distribuye — todo con tarjetas de iconos.
  · **2 · Grabación de voces del colaborador** (`disco_project_collab_vocals`): cuándo, dónde y si
  hace falta logística; a quien se elija de producción le llega **el mismo aviso** que la logística de
  casa y se le crea la bolsa. ⚠️ En el pop-up se ven **las DOS logísticas, una a cada lado**: la del
  colaborador (que se edita ahí) y la de **nuestro artista** (en gris, con su botón para gestionarla).
  · **3 · Acuerdo con su discográfica** (`disco_project_collab_deal`): con qué compañía (un tercero,
  con su logo y su alta al vuelo), la propiedad del máster, los gastos, quién distribuye, los
  **royalties de cada compañía** y **cuándo se pagan** (`DISCO_COLLAB_ROYALTY_WHEN`: desde el primer
  ingreso o **cuando se cubra la inversión**, con su tope), y con quién se cierra. **Sale ya
  cumplimentado con las condiciones** (no se escribe dos veces) y al **aprobarlo** se le manda a
  **Registros y Sello**, que preparan y envían el contrato.
  ⚠️ **Si el máster es mayoritariamente NUESTRO, distribuimos nosotros**: sale marcado solo y se puede
  cambiar a mano si el acuerdo dice otra cosa.
  ⚠️ El acuerdo sale **bloqueado** hasta que estén las condiciones: es lo que lo rellena.

- **PROYECTO · LA AUTORÍA: el reparto y el permiso de edición** (ago 2026):
  · **Confirmar el reparto autoral** (`disco_project_authorship_confirm`): los autores y sus % viven
  donde siempre (la pestaña **Editorial** de la canción, `SongEditorialShare`) y aquí **se
  confirman**; con eso **REGISTROS y SELLO** reciben el aviso para preparar el **acuerdo de reparto**.
  ⚠️ **No se confirma un reparto que no suma 100** (lo comprueba el servidor y el botón sale
  desactivado): es el reparto de la obra.
  · **Pedírselo al artista** (`disco_project_authorship_ask`): se le manda el **enlace de ENTREGA de
  siempre** con **solo su sección autoral** — no se inventa otro sitio para subir lo mismo — por su
  canal `EDITORIAL`.
  · **EL PERMISO DE EDICIÓN** (`DISCO_AUTHOR_PERMISSION_PCT` = 50): si un autor **no es de
  Plataforma** (`_publisher_is_platform`) y tiene **más del 50%** de una obra que **no se ha publicado
  nunca**, hace falta su permiso. Se le pide a **Registros y Sello**, que son quienes **mandan y
  gestionan** la «Autorización para la primera divulgación, reproducción y distribución de obra
  musical» (`disco_project_authorship_permission`), y ellos la marcan como gestionada.
  ⚠️ «No publicada» = su fecha de lanzamiento es futura **o** sigue provisional.
  ⚠️ **`_flag_arg`** es el punto único de un interruptor que llega **por el formulario o por la URL**:
  los menús de las tareas solo pueden hacer POST **a una URL** (sin campos), así que un `?undo=1`
  tiene que valer igual que un `<input name="undo">`.

- **PROYECTO · APROBACIÓN DE LOS MATERIALES** (ago 2026): diseño sube las creatividades, las revisa
  el **jefe de producto** y las manda al artista (y al colaborador después, en cadena) —
  `#dpMaterialsApprovalModal` → `disco_project_materials_approval`, aprobación de kind
  **`MATERIALS`** con las piezas en su `payload` (se puede mandar solo una parte marcándolas).
  ⚠️ **Hasta que están aprobadas no se pueden usar ni compartir**: al cerrarse
  (`_disco_materials_approved`) las piezas quedan en `APROBADA` y a **DISEÑO** le llega que ya se
  pueden usar. Un rechazo deja la tarea en rojo con **quién y por qué**, y hay que volver a pedirla.
  · Sin nada entregado la tarea sale **bloqueada** («antes tiene que entregarlos diseño») y el
  endpoint lo vuelve a comprobar.

- **PROYECTO · LA FOTO DE LA PORTADA, cuando hay dudas la elige el ARTISTA** (ago 2026): antes de
  pedirle la portada a diseño hay que tener la foto. Si está clara, el jefe de producto la sube o la
  coge de las guardadas del artista (eso ya existía); si **hay dudas**, se le mandan **varias
  opciones** (`#dpPhotoPickModal` → `disco_project_photo_approval`, aprobación de kind
  **`COVER_PHOTO`** con las opciones en su `payload`).
  ⚠️ **La etapa 1 ELIGE, el colaborador solo APRUEBA la elegida**: en la página de aprobación, quien
  es de nuestro artista ve **todas** las fotos con sus radios y quien va después ve **solo la
  elegida** (`_disco_photo_pick` guarda `payload['picked']`; `_disco_photo_picked_url` la resuelve).
  Así no se le pregunta dos veces lo mismo a nadie.
  · Cuando está aprobada (`_disco_photo_approved`): la foto pasa a la portada
  (`DiscoProjectArtwork.photo_url`) y a **DISEÑO** le llega que ya puede hacerla — le sale en sus
  tareas y el jefe de producto lo ve en el proyecto.

- **PROYECTO · LA PORTADA se aprueba en CADENA y con el visto bueno de la casa** (ago 2026):
  · **Antes de que salga de casa la ve el JEFE DE PRODUCTO** (`disco_project_artwork_pm` +
  `#dpArtworkPmModal`): si le da el visto bueno (`pm_ok_at`/`pm_ok_by`) ya se le puede pedir al
  artista; si la **devuelve a diseño** se le exige la nota, se **borra el JPG y el PSD** (hay que
  volver a subirla), la solicitud vuelve a REQUESTED y a **Diseño** le llega el aviso con lo que hay
  que cambiar. Sin su visto bueno, «Aprobación de portada» sale **bloqueada** y el endpoint la rebota.
  · **La cadena**: `DiscoProjectArtworkApprover.stage` (1 nuestro artista · 2 el colaborador ·
  3 añadidos) y `notified_at` — **al colaborador no se le escribe hasta que los nuestros han dado el
  OK** (`_disco_artwork_notify_stage`, que avisa a la etapa más baja con gente pendiente y se llama
  otra vez cuando esa etapa se cierra). La tarea dice **a quién le toca**.
  · **Al aprobarla todos**: se aplica al lanzamiento, y el aviso va a quien lleva el proyecto **y a
  DISEÑO** (que es quien la hizo), con **quiénes la han aprobado**; la tarea queda «Aprobada por … ·
  fecha».
  ⚠️⚠️ **QUIÉN APRUEBA es el MISMO punto único que el resto** (`_disco_artwork_candidates` ahora
  mapea `_disco_approval_candidates`): antes la portada tenía su propia lista y su bloque de
  colaboradores leía `fila.artist` / `fila.promoter` de un `SongInterpreter`… que **solo tiene el
  NOMBRE**, así que **el colaborador no entraba nunca** (bug real). Con el punto único, la portada gana
  además los aprobadores configurados en el artista y los añadidos en el proyecto.

- **PROYECTO · APROBACIONES EN CADENA** (motor único, ago 2026). Cuatro cosas del sello se aprueban
  igual (la **mezcla final**, los **materiales**, la **foto** y la **portada**), así que el motor es
  UNO: `DiscoApproval` + `DiscoApprovalVoter` (`ensure_disco_approvals_schema`) y
  `_disco_approval_open` · `_disco_approval_state` · `_disco_approval_notify` ·
  `_disco_approval_decide` · `_disco_approval_all_done`.
  · **Un enlace POR PERSONA** (`public_disco_approval`, `/aprobacion/<token>`): se ve lo que hay que
  aprobar —la mezcla **se escucha ahí mismo**—, hay **dos botones (verde aprobar · rojo rechazar,
  que pide el motivo)** y **los demás con su foto y su estado** (✓ verde · **? amarillo a la espera**
  · ✗ rojo).
  · ⚠️⚠️ **VA EN CADENA**: `stage` 1 = **nuestro artista** y sus integrantes · 2 = **el colaborador**
  · 3 = **terceros añadidos** a mano. Al colaborador **no se le escribe hasta que los nuestros han
  dado el OK** (`_disco_approval_decide` avisa a la etapa siguiente solo cuando la suya se cierra).
  · **QUIÉN APRUEBA, EN TRES NIVELES** (`_disco_approval_candidates` + `_disco_approval_pick`, y el
  selector único `templates/_disco_approvers_picker.html`, que se incluye en cada pop-up de
  aprobación):
    · **la casa** — los **integrantes** del artista (`ArtistPerson` → su tercero) y los
      **colaboradores** (los intérpretes de la canción que no son del artista): salen solos;
    · **el ARTISTA** — lo que tenga configurado en **Notificaciones → «Aprobación de mezclas y
      materiales»** (canal `APROBACIONES`): es la **preferencia guardada**, y sale sola en todos sus
      proyectos;
    · **el PROYECTO** — quien se añada **sobre la marcha** queda guardado en
      `production_payload['approvers']`, así que **ya sale en las siguientes aprobaciones de ese
      proyecto** (lo pidió así Dani), y con la casilla **«guardarlos como preferencia del artista»**
      (marcada por defecto) se guarda además en su canal para los proyectos que vengan.
  ⚠️ **En cada paso se puede QUITAR a quien no toque** (las casillas vienen marcadas): eso **no le
  quita de nada más** —sigue guardado en el artista y en el proyecto—, solo no entra en esa
  aprobación. Cada candidato lleva su clave estable (`_disco_approval_candidate_key`: su tercero o su
  nombre normalizado) y su **origen**, que se ve con un icono en el selector.
  ⚠️ Si NO llega ninguna clave marcada (un formulario viejo) entran **todos**: mejor pedir de más que
  dejar a alguien sin aprobar sin querer.
  ⚠️ `SongInterpreter` **solo guarda el NOMBRE** (no tiene `promoter_id`): su ficha se busca **por
  nombre** para sacarle el correo, sin crear nada.
  ⚠️ Un RECHAZO cierra la aprobación (`REJECTED`) con el motivo y avisa a quien lleva el proyecto:
  hay que rehacerlo y volver a pedirla (`_disco_approval_open` borra la anterior — lo que se aprueba
  es siempre la ÚLTIMA versión).
  ⚠️ El estado VACÍO trae las **mismas claves** que el lleno: si no, leer algo que aún no se ha pedido
  revienta con un KeyError (pasó con `ko`).

- **PROYECTO · LA MEZCLA FINAL, antes de masterizar** (ago 2026): **no se masteriza sin que las partes
  hayan aprobado la mezcla**.
  · **1 · Se le pide al PRODUCTOR** (`disco_project_mix_ask`) con su plazo, que sale del **calendario
  de entregas** y tiene que ser **4 semanas antes** del lanzamiento (`DISCO_MIX_MIN_WEEKS`).
  ⚠️ Si el plazo se sale de ahí —o **el paso no hace falta**— es una **EXCEPCIÓN** y la aprueba **quien
  sea DIRECCIÓN Y SELLO a la vez** (`_direccion_sello_user_ids`, punto único; si nadie tiene las dos
  cosas se cae a dirección): se le manda la petición **con el motivo** y, mientras, la tarea se queda
  **esperando** (`disco_project_mix_waiver` la aprueba o la rechaza).
  · **2 · El productor la sube por su enlace** (`public_disco_mix_upload`, `/mezcla-final/<token>`) y
  al **jefe de producto** le llega que ya se puede pedir la aprobación.
  · **3 · Aprobación en cadena** (`disco_project_mix_approval`) con el motor de arriba, y se pueden
  **añadir terceros** que también tengan que aprobar.
  · **4 · Cuando aprueban TODOS**, al productor le llega **solo**: «todas las partes han dado el OK a
  la mezcla final, podemos avanzar con el máster», con la **fecha máxima de entrega** y el **enlace de
  entrega de masters de siempre** (`_disco_project_delivery_links`, que ahora devuelve también
  `required_labels`, lo que ese enlace **exige**). La tarea pasa a **«Pendiente de recibir el máster
  final»** hasta que llega.
  ⚠️ Si el correo no sale, **no se dice que se avisó**: el flash da el enlace para mandarlo a mano.

- **PROYECTO · AVISARLE LA FECHA AL ARTISTA** (ago 2026, `disco_project_date_notify`): cuando
  **Registros la ha confirmado**, se le manda al artista la fecha **y todos los plazos** del calendario
  de entregas (los del **videoclip** también, si el lanzamiento lo lleva, porque el calendario ya los
  trae). Sale como subtarea de la fecha y queda apuntado quién avisó y cuándo.

- ⚠️ **UNA TAREA CON GASTO SE VE EN LA BOLSA** (regla de la casa, ago 2026): lo hacían las **acciones
  del plan** (`_disco_plan_action_sync_bag`) y ahora también el **coste de la PORTADA**
  (`_disco_artwork_sync_bag` + `DiscoProjectArtwork.bag_expense_id`): al ponerle importe se crea su
  gasto en la bolsa del proyecto, al cambiarlo se actualiza y **si deja de tener coste, el gasto se
  retira**. Es el MISMO dinero visto desde dos sitios — nadie lo apunta dos veces. Al añadir una tarea
  con importe, engancharla igual.

- **PROYECTO · EL CALENDARIO DE ENTREGAS** (ago 2026): antes de pedirle nada a nadie se **fijan los
  plazos** —mezcla final, máster, portada, videoclip y creatividades— **arrastrando** cada cosa al día
  que le toca: a la **izquierda** lo que hay que fijar (con su mínimo y su tope) y a la **derecha** el
  calendario, con el día del lanzamiento marcado. Motor `static/js/disco_delivery.js` + `#dpDeliveryModal`
  + estilos `.dc-*`; endpoint `disco_project_delivery_save`; estado `_disco_delivery_state`.
  ⚠️ **Solo se puede soltar donde el plazo es POSIBLE**: los mínimos están en
  `DISCO_DELIVERY_MILESTONES` (la mezcla final **4 semanas** antes —hay que aprobarla y masterizar—,
  el máster y la portada **3** —lo que tarda la distribución— y las creatividades hasta **2 días**,
  el margen que ya usaba el encargo a diseño). Los días a los que no se llega se ven **apagados** y no
  aceptan el soltar, y lo ya puesto se vuelve a arrastrar para moverlo.
  ⚠️ El tope lo comprueba **también el servidor** (`_disco_delivery_apply`, que devuelve lo que no
  cuadraba y guarda el resto): el calendario del navegador es la comodidad, no la barrera.
  ⚠️⚠️ **NO es un dato paralelo**: cada hito **escribe el campo donde ese plazo ya vivía** —el máster
  es `DiscoProject.materials_due_date` (el plazo que fija Registros) y la portada el `due_date` de su
  solicitud—, así que fijarlo aquí se ve en su tarea, en su correo y en su recordatorio. Si se añade un
  hito nuevo, hay que decir a qué campo va (o queda solo en el payload).
  · Tampoco hay dos calendarios: en el de la ficha (el de la agenda) estos plazos ya salían como hitos
  del proyecto.

- ⚠️⚠️ **PROYECTO · EL ORDEN DE LAS TAREAS ES EL DEL PROCESO** (ago 2026), no el de cuándo se
  programó cada cosa, y van agrupadas en **CUATRO FASES** (`DISCO_TASK_PHASES`, cabecerita
  `.dp-phase` en la lista; con 25 tareas en un single, sin agrupar no se ve por dónde va el trabajo):
  · **LA OBRA**: 1 la fecha (la confirma Registros) · 2 el plazo de entrega · 3 la producción ·
    4 la **logística** (sale de la grabación, así que va justo después) · 5 la maqueta.
  · **LA IMAGEN**: 6 la portada (quién, la foto, pedirla, aprobarla) · 7 las creatividades.
  · **EL LANZAMIENTO**: 8 focus single y radio · 9 el **pitch** · 10 la **nota de prensa** (que
    necesita el pitch) · 11 el plan de lanzamiento · 12 los IDs de plataforma.
  · **PARA CERRAR**: lo que le falta al lanzamiento (fecha, temas, soporte, portada, videoclip, hoja
    de ruta, bolsa) y cerrar el proyecto.
  ⚠️ Una tarea NUEVA se mete **en su fase y en su sitio** (la fase la lleva el propio bloque con
  `fase[0] = "…"`): si se pone al final «porque es lo último que se ha programado», la lista deja de
  contar el proceso — que es justo lo que había pasado con la logística, el pitch, el focus y la nota
  de prensa, y por eso se reordenó.
  ⚠️ **LO QUE SE DECIDE EN UN SITIO SE VE EN LOS DEMÁS**: el **focus single** vive en la canción y se
  enseña en su ficha, en el repertorio, en la fila del proyecto y en la cabecera de su ficha; la
  **presentación a radio** se pide en el proyecto y se ve en la pestaña Información de la CANCIÓN
  (verde = entra, amarillo = pendiente, gris = no la cogen) y su acción entra en el **plan de
  lanzamiento**; la **logística** mete a quien la monta en la **hoja de ruta** y le crea la **bolsa**;
  el **pitch** se guarda en la ficha de la canción. Al añadir un paso nuevo hay que preguntarse
  **dónde más se mira eso** y enseñarlo allí.

- **PROYECTO · LA NOTA DE PRENSA** (ago 2026). Todo lanzamiento la lleva, pero **no se puede pedir
  sin tener antes lo que la nota cuenta**: el **pitch** escrito, la **fecha** de lanzamiento y
  **decidido si es focus single**. Hasta entonces la tarea **se ve pero no se puede activar** (sale
  rayada, con lo que falta) — y el **servidor lo vuelve a comprobar**.
  · **La pide el JEFE DE PRODUCTO** (`_disco_plan_product_manager`) con sus **indicaciones**
  (`#dpPressModal` → `disco_project_press_request`), y salen **DOS trabajos a la vez**
  (`DISCO_PRESS_PARTS`): **PROMOCIÓN la redacta** y **DISEÑO la maqueta**. Cada uno finaliza al subir
  lo suyo (`disco_project_press_upload`, `part=text|design`), y cuando **el texto está**, a promoción
  le queda **ENVIARLA**: sigue pendiente hasta que se marca (`disco_project_press_sent`, que se puede
  deshacer).
  ⚠️ **Tiene que estar lista el LUNES PREVIO al lanzamiento** (`_press_due_date`: el lunes
  inmediatamente anterior; un viernes 06/11 → lunes 02/11). Pasado el plazo sin el texto, la tarea y
  el módulo salen **en rojo**.
  · **Módulo de Inicio `HOME_PRESS_TASKS`** (`_home_press_tasks`): a cada uno **lo suyo** —promoción
  redactar y después enviar, diseño el gráfico—, con el plazo y las indicaciones a la vista. Dirección
  lo ve todo; quien no es de ninguno de los dos, nada.
  ⚠️ `disco_project_press_upload` y `_sent` van en **`REQUEST_ANY_ENDPOINTS`**: los usan promoción y
  diseño, que no tienen por qué poder editar discográfica (cada uno comprueba dentro que es de su
  departamento o dirección).
  ⚠️ Estado en `production_payload['press']` y punto único **`_disco_press_state`**: lo usan la tarea
  del proyecto, sus cuatro pop-ups y el módulo de Inicio.

- **PROYECTO · EL PITCH, en dos pasos** (ago 2026). El pitch es el texto con el que se presenta el
  lanzamiento, y hacerlo son **dos cosas**:
  · **1 · Pedirle al ARTISTA un texto o una inspiración** (`disco_project_pitch_ask` +
  `#dpPitchIdeaModal`): le llega **su propio enlace** (`public_disco_pitch_idea`,
  `/pitch-inspiracion/<token>`, plantilla `public_disco_pitch.html`) por su canal `DISCOGRAFICA`, y
  lo que cuenta ahí **no es el pitch**: es la materia prima. Al contestar, aviso a
  `_disco_project_owner_ids`.
  ⚠️ La subtarea se decide por **si ha CONTESTADO**, no por si se le pidió: cuando el artista no
  tiene contactos configurados el flash da el enlace **para mandarlo a mano**, así que `asked_at`
  queda vacío y el texto sí llega — con el orden al revés la tarea se quedaba pendiente para siempre
  (lo sacó la prueba).
  · **2 · Subir el pitch** (`#dpPitchModal` → `disco_project_pitch_save`): titular y texto, con la
  inspiración del artista al lado y el botón **«Ver ejemplos anteriores»** — los pitchs de ESE artista
  y, cambiando de chip, los de otros (`api_pitch_examples` → `_pitch_examples`, que además devuelve
  los artistas que tienen pitchs escritos). Se cargan **al pinchar**, no en cada carga de la ficha
  (JS en `disco_steps.js`, por delegación).
  · Al guardarlo queda **en la ficha de la canción** (`Song.pitch_title`/`pitch_text`), que es de
  donde salen el PDF, el correo y la página pública que ya existían — y el aviso de «falta el pitch»
  se cierra solo.
  ⚠️ **`_disco_project_email_shell`** es ya el punto único del esqueleto de TODOS los correos de un
  proyecto (logo de PIES a la derecha, título centrado, cabecera del lanzamiento, nota, texto y
  botón): lo usan la portada y el pitch. Si se toca el diseño, se tocan todos a la vez.
  ⚠️ `_disco_pitch_url` lleva `url_for` **protegido**: el estado del pitch se lee también desde un
  cron o un hilo, y ahí `url_for` revienta con «Working outside of application context» (el mismo bug
  que ya salió en `_peticion_edit_payload` y en `_royalty_holded_fields`).

- **PROYECTO · FOCUS SINGLE y PRESENTACIÓN A RADIO** (ago 2026). Un lanzamiento puede ser **focus
  single** (el prioritario) y entonces se presenta a las emisoras.
  · **Focus single** es de la **CANCIÓN** (`Song.focus_single` + `_at`/`_by`; **`NULL` = sin decidir**,
  que no es «no»: hay tareas que esperan a que se decida). Se decide en el paso del proyecto
  (`#dpFocusModal` → `disco_project_focus_save`) y se ve con su etiqueta **en la ficha de la canción y
  en el repertorio**. Solo sale en un **single** (`_disco_project_release_song`): en un álbum el focus
  sería uno de sus temas y eso se marca en su ficha.
  · **A qué emisoras** (`SongRadioPitch`, una fila por emisora, `ensure_song_radio_schema`): las
  emisoras son los **medios de tipo Radio** (`_disco_radio_media_options`). Se piden en
  `#dpRadioModal` (`disco_project_radio_request`) y una emisora ya pedida sale marcada y no se
  duplica (índice UNIQUE canción+emisora).
  ⚠️⚠️ **No se puede mandar a radio sin nada que mandar**: hace falta la **fecha de lanzamiento** y
  **el máster o al menos una maqueta** (`_disco_radio_ready`). Hasta entonces la tarea sale
  **BLOQUEADA (rayada)** diciendo qué falta, y el **servidor lo vuelve a comprobar** (esconder el
  botón no basta).
  · **Contesta PROMOCIÓN** —o **dirección que además esté en el Sello** (`_disco_radio_deciders`)—
  desde su módulo de Inicio **`HOME_RADIO_PITCHES`** (`_home_radio_pitches`): una fila por canción y
  **una línea por emisora** con sus dos botones. **«Sí entra»** pide la fecha de entrada en rotación
  y **anota la acción en el PLAN DE LANZAMIENTO** («Presentación a radio · \<emisora\>»,
  `_song_radio_plan_action`, que actualiza la acción en vez de duplicarla). **«No entra»** avisa a
  quien lo pidió de que la emisora la ha rechazado y **no anota nada en el plan**: la subtarea queda
  terminada.
  · En el proyecto hay **una subtarea por emisora** con lo que ha dicho cada una, y el aviso se cierra
  solo cuando **todas** han contestado.
  ⚠️ `song_radio_pitch_decide` va en **`REQUEST_ANY_ENDPOINTS`** (lo contesta promoción, que no tiene
  por qué poder editar discográfica ni ser «actor»); comprueba dentro que es de quien le toca.
  · **Las TAREAS BLOQUEADAS se ven RAYADAS** (`.dp-task.is-blocked`, el **mismo** rayado que un
  lanzamiento provisional: una sola declaración en `styles.css`, así no se pueden desparejar). En
  cuanto se puede empezar se le quita el fondo y, al terminarla, la fila **se queda** con su check
  verde: la lista de tareas del proyecto es un ESTADO, no una lista de avisos que desaparecen.

- **PROYECTO · SUBIR DEMO y la PORTADA, paso a paso** (ago 2026):
  · **Subir demo**: el pop-up es **el mismo formulario** que la sección Demos (`_demo_form_fields.html`
  + `demo_form.js`) con el proyecto ya puesto; la maqueta queda vinculada (**`SongDemo.project_id`**) y
  se ve en la ficha de la canción **mientras no haya másters** (`_song_project_demos` +
  `_disco_project_demo_visible`) — al subirlos desaparece de ahí y se queda en Demos.
  ⚠️ `discografica_demo_create` acepta ya **`next`**: antes redirigía SIEMPRE a la sección Demos y te
  sacaba de la pantalla en la que estabas.
  · **PORTADA** (`DiscoProjectArtwork`, una por proyecto), en cuatro pasos que son subtareas:
  **1 ¿quién la hace?** (nosotros / el artista / un tercero, con su importe o sin coste) ·
  **2 la FOTO y la IDEA** (ya la tiene quien diseña · la subimos · una de las **fotos guardadas del
  artista** · portada de diseño sin foto; con descripción y ejemplos que se acumulan, y el botón para
  **pedirle al artista su idea** con su propio enlace) · **3 SOLICITARLA** con su fecha máxima
  (enlace público `public_disco_artwork_upload`, ⚠️ **obligatorio JPG *y* PSD**; si la hacemos
  nosotros, además le llega a **Diseño** por la campanita) · **4 APROBACIÓN**
  (`DiscoProjectArtworkApprover`, **un enlace POR PERSONA** como la supervisión de fotos: el artista,
  sus integrantes y quien se añada). Cuando **la aprueban todos**, `_disco_artwork_apply_to_release`
  la deja como portada del lanzamiento (`cover_url` + material COVER de la canción); un rechazo se
  avisa y hay que rehacerla.
  ⚠️ Los tres enlaces públicos van en las **tres** listas (`allowed`, `PUBLIC_ENDPOINTS_EXTRA`,
  `_CSRF_EXEMPT_ENDPOINTS`) y sus tokens son **opacos** (`_uuid_token`), no firmados.

- **PROYECTO · OTRAS CREATIVIDADES e IDs de plataforma** (ago 2026):
  · **Creatividades** (`DiscoProjectCreative` + `DiscoProjectDesignRequest`): se marcan las que hacen
  falta del catálogo **`DISCO_CREATIVE_CATALOG`** (cabecera de YouTube, imagen de perfil, canvas, «ya
  disponible», anuncio con fecha, anuncio próximamente), cada una **con su icono y su tamaño**, y las
  que llevan formatos se eligen ahí (`DISCO_CREATIVE_FORMATS`: post, historia, publicación horizontal,
  banner). Las de **«Otra»** se añaden a mano (nombre, tamaño, imagen/vídeo/audio y nota, varias a la
  vez). El encargo va a **Diseño** con su enlace público para subirlas.
  ⚠️ **La fecha máxima NUNCA puede ser posterior a dos días antes del lanzamiento**
  (`DISCO_CREATIVE_DEADLINE_MARGIN_DAYS`): lo comprueba el **servidor**, no solo el `max` del campo.
  ⚠️ Al desmarcar una pieza **solo se borra si estaba PENDIENTE**: lo ya pedido no se tira.
  · **IDs de plataforma** (`SongPlatformId` + `SongPlatformIdRequest`): módulo nuevo en los
  **materiales de la canción**, con el logo de cada plataforma (`SONG_PLATFORM_ID_CATALOG`: Spotify,
  Apple Music, Amazon Music, YouTube y «todas») y el **hueco vertical (9:16) dibujado**, porque son los
  gráficos tipo historia. Se suben, se marcan **«no necesario»** (y se deshace) o se le **piden al
  artista** con su enlace público, que lo explica con el mismo dibujo.
  ⚠️ Los endpoints `song_platform_id*` se mapean a **`discografica.canciones`** (son de la canción).

- **PROYECTO · PLAN DE LANZAMIENTO** (ago 2026): su propia pestaña
  (`?tab=lanzamiento`, ⚠️ añadida a `DISCO_PROJECT_TABS`: una pestaña que no esté ahí cae en
  «calendario» sin dar ningún error), con la **estética de las bolsas** (una sección por bocadillo,
  `.sim-cat-card`): **Estrategia** · **Acciones** · **Marketing** · **Promoción** · **Contenidos** ·
  **Cronograma**. Modelos `DiscoReleasePlan` + `DiscoReleasePlanAction` + `DiscoReleaseContent`;
  estado en **`_disco_plan_state`**.
  · **Acciones**: título, descripción, ¿coste? (importe sin IVA) y fecha, franja o sin fecha. ⚠️ El
  coste **se lleva a la BOLSA** del proyecto y se mantiene al día en los dos sentidos
  (`_disco_plan_action_sync_bag`, `bag_expense_id`): si la acción deja de tener coste, el gasto se
  retira.
  · **Marketing y Promoción** no se duplican: se enseña **lo que ya está vinculado al LANZAMIENTO**
  (su canción o su álbum), que es el mismo dato que se ve en Marketing y en Promoción.
  · **CONTENIDOS · lo subimos o se lo PEDIMOS A DISEÑO** (ago 2026): al añadir un contenido se elige
  entre **subirlo** (arrastrándolo o eligiéndolo, con el `data-file-drop-for` global) o **pedírselo a
  diseño**, diciendo qué se necesita. Un contenido **se programa igual sin tener el archivo**: hasta
  que llega se ve **RAYADO EN AMARILLO** (`.dp-content.is-pending`, el **mismo** rayado que un
  lanzamiento provisional o una tarea bloqueada: una sola declaración en `styles.css`) con la etiqueta
  «En diseño».
  ⚠️ **El enlace de subida de diseño es EL MISMO de las creatividades**
  (`DiscoProjectDesignRequest` → `public_disco_creatives`): no se inventa otro sitio para lo mismo.
  `_disco_plan_design_link` reutiliza el encargo abierto del proyecto (o crea uno) y le pone como
  fecha máxima la publicación más próxima de las pedidas; `_disco_plan_design_contents` es lo que esa
  página lista además de las creatividades (campos `content_<id>`). Columnas nuevas en
  `DiscoReleaseContent`: `design_requested_at` · `design_requested_by_nick` · `design_notes` ·
  `design_done_at`.
  · **SE ARRASTRA DEL LISTADO AL CRONOGRAMA y solo se pregunta la HORA** (`#dpContentTimeModal`): el
  día lo dice el sitio donde se suelta. Para eso el calendario de la casa acepta ya **cargas
  externas**: quien arrastra pone un JSON en `dataTransfer` con el tipo
  **`application/x-agenda-external`** y, al soltarlo, `agenda_calendar.js` lanza el evento
  **`agenda:external-drop`** con el día — el calendario no sabe nada de contenidos, hitos ni gastos,
  solo del día (antes solo se podía arrastrar lo que YA estaba pintado dentro).
  ⚠️ Se guarda en el endpoint de siempre (`disco_plan_content_move`), que ahora acepta `time`:
  arrastrando DENTRO del calendario la hora **no se toca** (mover es cambiar el día) y arrastrando
  desde el listado se manda la que se pregunta.
  ⚠️ El panel condicional del pop-up usa el motor de la casa (`data-dp-when="source=US|DESIGN"`), que
  además **deshabilita** lo que esconde: un campo oculto se envía igual.
  ⚠️ **El encargo se DESHACE**: volver a «lo subimos nosotros» limpia el pedido y **cierra su aviso**
  (si no, el contenido se quedaba «en diseño» para siempre y seguía saliendo en su enlace). Y cuando
  **diseño lo sube**, el aviso se cierra solo — la regla de `_notify_resolve`.
  · **Contenidos**: archivo (de ahí sale la miniatura), día y **hora**, copy, **menciones obligatorias
  (solo el @)**, hashtags y las **redes** con su logo (`DISCO_CONTENT_NETWORKS`: Instagram post /
  historia / post compartido, TikTok, Facebook, X, YouTube y Shorts).
  · **Cronograma**: el calendario de la casa (`_agenda_calendar.html`) con un payload propio
  (`_disco_plan_agenda`) que junta el lanzamiento, las acciones, el marketing, la promoción y cada
  contenido con su hora. **Los contenidos se ARRASTRAN** para cambiarles el día (se mantiene la hora):
  ⚠️⚠️ para eso se generalizó `agenda_calendar.js` — un ítem que traiga **`move_url`** se puede
  arrastrar y **se guarda en SU endpoint** (`disco_plan_content_move`); **NO** se le pone `item_id`,
  que es lo que hace que el lateral pinte una papelera que borraría otra cosa (y el doble clic solo
  abre el pop-up de agenda si el ítem ES de agenda: `esItemAgenda`).
  · **AÑADIR UNA ACCIÓN DE MARKETING desde el plan** (ago 2026): el botón que había era un ENLACE a
  la ficha del lanzamiento y, sin lanzamiento resuelto, un `href="#"` que **no hacía nada**. Ahora se
  añade **desde aquí** con el pop-up **`#dpMarketingModal`**, que postea al MISMO endpoint que la
  sección Marketing (`promotion_create`) con el sujeto ya puesto: **es la misma campaña**, así que lo
  que se toque en un sitio se ve en el otro. El sujeto lo resuelve **`_disco_plan_marketing_subject`**
  (el lanzamiento —canción o álbum— y, mientras no exista, el **ARTISTA**), y viaja en
  `plan['subject']`.
  ⚠️ Los CAMPOS son un solo sitio: **`templates/_marketing_fields.html`** (macros `tipo`,
  `acciones`, `objetivos`, `plazos`), que usan el asistente por pasos de Marketing **y** este
  pop-up; aquí no se pregunta el artista ni qué se promociona porque los sabe el proyecto.
  ⚠️⚠️ **`{% import %}` sin `with context` NO ve los globales**: el catálogo
  `marketing_action_types` llegaba vacío a las macros y salía **una sola casilla**, sin ningún error.
  Se importa con **`with context`**.
  ⚠️ El botón se pinta solo si la persona puede crear campañas (`can_edit_promocion`, que es lo que
  exige el endpoint); si no, se le dice que lo pida en Marketing — nunca un botón que daría 403.
  ⚠️ **`promotion_create` se queda donde estabas con `back=1`**: por defecto aterriza en la ficha de
  la campaña (lo que hace el asistente de Marketing), y creándola desde el plan eso te saca de la
  pantalla. Sus caminos de error usan ya `safe_next_or` (antes redirigían al `next` en crudo).
  ⚠️ **`status_badge` de una campaña es un DICT** ({label, class}, `_promotion_badge`): pintado a pelo
  en un `class=` se imprimía el diccionario entero (un dict no vacío es «verdadero» en Jinja).
  ⚠️⚠️ **LOS POP-UPS DEL PLAN TAMBIÉN VAN EN LA PESTAÑA DE LAS TAREAS**: `_disco_plan_modals.html` se
  incluía solo en la pestaña del plan, pero **seis acciones de la lista de tareas** los abren
  (`#dpPlanReviewModal`, `#dpPlanPromoModal`, `#dpPlanNoticeModal`…) y la lista vive en «calendario»:
  esos botones **no hacían nada**. Se incluye en las dos, y el plan se calcula también ahí. Al añadir
  una acción con `modal=`, comprobar que ese pop-up se pinta en la pestaña donde está el botón.
  · **EL OK DE DIRECCIÓN NO SE PIDE CON EL PLAN A MEDIAS** (ago 2026): punto único
  **`_disco_plan_missing(estado)`** (y `plan['missing']`/`complete`/`missing_label`), que exige lo que
  ES el plan —la **estrategia**, al menos una **acción**, al menos un **contenido** y que todo lleve
  **fecha**— y **no** exige marketing ni promoción (son de otros departamentos y un lanzamiento
  pequeño puede no llevar campaña de pago). Se aplica en los TRES sitios: la pantalla (dice qué falta
  y no ofrece el botón), la **tarea del proyecto** (sale **bloqueada/rayada** con lo que falta) y el
  propio **endpoint** (`disco_plan_review` con `action=ask` lo rebota: esconder el botón no basta).
  ⚠️ En un contenido, `when_label` pone «Sin fecha» cuando no la hay: la comprobación mira el DATO
  (`publish_at`), no el texto. Y la fila de una acción lleva ya `has_date`.
  · **APROBACIÓN**: la tarea no se cierra hasta que **dirección Y el sello** dan el OK
  (`disco_plan_ok`; el de dirección solo lo puede dar dirección).
  · **RECORDATORIOS DE PUBLICACIÓN** (`disco_plan_reminders`): se activan con el plan aprobado.
  Se elige de **qué publicaciones** (todas marcadas por defecto; desmarcar deja el contenido en el
  plan pero sin aviso), **a quién** —el ARTISTA por su canal nuevo **CONTENIDOS**, sus integrantes, los
  **colaboradores**, quien lleve **digital** (departamento «Redes sociales») y correos a mano—, por
  **correo, SMS o los dos**, y con **cuánta antelación** (10 minutos por defecto). Al activarlos sale
  el correo del **Cronograma de publicaciones** (con el nombre y la foto del **jefe de producto** para
  decirle que no quiere recibirlos) y el cron manda el aviso de cada publicación
  (`_disco_plan_reminder_sweep`, `/cron/publicaciones`).
  ⚠️ **Solo se avisa de lo que está SUBIDO y activo**: de lo que no se puede publicar no se avisa. Y
  **una vez** por contenido (`reminder_at`); si se le cambia el día o la hora, ese sello se borra y el
  aviso se vuelve a programar sobre lo de AHORA. Un contenido **eliminado no se notifica**.
  · **El cronograma online** (`public_disco_plan`, `/cronograma/<token>`) es lo que ve quien recibe los
  avisos: a la izquierda las publicaciones con su hora, su copy, sus menciones y sus hashtags —que se
  **copian con un clic**— y a la derecha el calendario; cada contenido se abre a tamaño y se descarga.
  Siempre **al día**: se pinta con lo que hay en ese momento.

- ⚠️⚠️ **PROYECTOS · las siete trampas que sacó la revisión** (ago 2026). Ninguna daba error: todas
  hacían que algo **no llegara** o **no se viera**, que es peor.
  · **`Promoter` NO tiene `.email` ni `.phone`**: son **`contact_email`** y **`contact_phone`**. Con
  los nombres de más («email», «phone») `getattr` devuelve vacío y el correo **no sale y no falla**
  — al productor y al tercero de la portada no les llegaba nada. Punto único
  **`_promoter_email_phone(promoter)`**, que hay que usar SIEMPRE que se saque el contacto de un
  tercero.
  · **`_song_interpreter_rows_map` devuelve OBJETOS del ORM, no diccionarios**: un `.get("...")`
  sobre ellos revienta (y dentro de un `try` se traga la lista entera), así que los **colaboradores**
  no entraban ni en la aprobación de la portada ni en los recordatorios.
  · **Un calendario con `kinds: []` no pinta NADA**: `agenda_calendar.js` filtra por esa lista, así
  que el cronograma salía vacío. Los tipos que se usen van en el payload **y** en
  `AGENDA_KIND_META`/`AGENDA_KIND_ORDER` (de ahí salió el tipo **`contenido`**).
  · **Una página pública standalone tiene que cargar su JS**: sin
  `<script src=".../js/agenda_calendar.js">` el cronograma se queda en «Cargando agenda…» (el parcial
  solo deja el JSON en el HTML).
  · **`move_url` fuera de la app**: en la página pública se quita, o el contenido sale arrastrable y
  el arrastre siempre falla (ahí no hay sesión).
  · **Los avisos van a QUIEN PUEDE ABRIRLOS**: los de las entregas públicas enlazan a la ficha del
  proyecto (`discografica.proyectos`), así que van a **`_disco_project_owner_ids`** (quien lo creó +
  quien del sello lleva a ese artista) y no a Registros a secas, que se comía un 403 en su propio
  aviso. Por lo mismo, `registros_release_dates_view`/`_confirm` aceptan **la primera clave** que
  tenga el usuario.
  · **Los iconos de MARCA no se pintan con `fa`**: `fa-youtube`, `fa-spotify`… viven en `fa-brands` y
  con la familia SOLID salen **vacíos** (punto único `_disco_creative_icon_class`); al revés también
  pasa —`fa-globe` y `fa-link` no son de marca—.
  · Y lo de siempre: una fila que se edita o se borra **por id** tiene que comprobar que es **de ese
  proyecto** (`_disco_plan_row_or_none`), un `%` dentro de un `style=` de un correo compuesto con `%`
  se escribe `%%` **solo si la cadena se formatea**, y desmarcar TODAS las publicaciones tiene que
  poder dejarlas todas apagadas (una lista vacía no es «no me han dicho nada»).

- **INICIO DE DIRECCIÓN · SUS TAREAS y el CUADRO DE MANDO** (ago 2026). Dirección no trabaja dentro
  de una sección: **mira**. Su Inicio es, en este orden: **cabecera · MIS AVISOS (solo cuando hay) ·
  botones rápidos · el CALENDARIO · MIS TAREAS PENDIENTES · el CUADRO DE MANDO ·** y sus cosas
  **BÁSICAS** (mis gastos, mis vacaciones), cada una en su sitio de siempre. **El resto de módulos no
  se le pintan** (ni se calculan): son el trabajo de otros y ya se ven en el cuadro.
  · **MIS TAREAS PENDIENTES** es solo lo de ESA persona: **lo que le afecta a ella y lo que es de
  dirección, en un mismo sitio** (aprobar una remesa, aprobar vacaciones, el OK a un plan de
  lanzamiento, las fases de SUS actividades, activar la producción de lo que ha creado, sus carteles
  rechazados, los rechazos por comunicar, sus invitaciones).
  ⚠️ A dirección, `mine` sale **True en TODAS** las fases de una petición (puede con todo), así que
  `_home_my_tasks` exige además que la fase sea **suya de verdad** (`owner_user_id` vacío o el suyo):
  si no, su módulo personal se llenaba con el trabajo de los demás. Eso está en el cuadro.
  · **El CUADRO DE MANDO es VISUAL**: una tarjeta por área (con su color), su total, y dentro **la
  CARA de cada persona con el número de tareas que lleva** —de un golpe se ve quién va cargado—.
  **Al pinchar una cara** se despliega SU listado con el estado de cada tarea (a dónde lleva y para
  cuándo), en acordeón (`data-bs-parent`: solo una abierta por área). Áreas: **Contratación ·
  Producción · Ticketing · Sello (proyectos) · Registros · Promoción y marketing · Diseño · Digital ·
  Administración**.
  · **Lo que no es de nadie tiene su propia cara**, con las fotos de quien lo puede coger: es la
  regla de la casa (una tarea sin responsable la ve todo el departamento) y así se ve **lo que hay
  que repartir** en vez de esconderlo. ⚠️ Debajo de la cara pone **«Sin asignar»** (`short_nick`): en
  un hueco de 82 px, «Del departamento» se corta y no dice nada — el nombre largo se sigue usando en
  la cabecera del detalle y en el tooltip.
  · Motor **`_direccion_board()`** + `DIRECCION_AREAS` + un constructor por área
  (`_dir_area_*`), `_dir_task` (una cosa pendiente) y **`_dir_days`** (el reloj: «Hoy» · «Mañana» ·
  «En 4 días» · «Hace 9 días», con su color). Pantallas: **`templates/_home_direccion.html`** (sus
  tareas) y **`_home_direccion_board.html`** (el cuadro); estilos `.dboard*` / **`.dbg*`** (la
  rejilla de caras) / `.dbp*` / `.dbt*`.
  ⚠️ En `home.html` hay DOS compuertas, no una: los módulos de departamento cuelgan de
  `{% if HOME_DIRECCION_BOARD is none %}` y el bloque **LO SUYO va FUERA**, así que la misma
  plantilla sirve para todos — a dirección solo le salen ahí los básicos porque las demás claves le
  llegan **vacías** desde `inject_personnel_globals`.
  · **Cada área REUTILIZA el motor que ya decide qué está pendiente** (`_contracting_tasks_data`,
  `_home_ticketing_sales_tasks`, `_admin_pending_counts` + `_admin_responsible_user_ids`,
  `_home_project_registros`…): si mañana cambia lo que es una tarea, el cuadro cambia solo.
  · **De quién es cada cosa**: `_dir_artist_owners` (artista → quien lo lleva **en ese
  departamento**, con la faceta `produccion`/`sello` cuando toca) y, donde hay columna, el
  responsable de verdad (`production_owner_user_id`, `escort_user_id`, las **responsabilidades** de
  administración).
  · **El DESGLOSE de la cabecera** («3 conciertos · 1 actividades» en Producción) sale del campo
  `group` de cada tarea: un área que no lo use no enseña ninguno.
  ⚠️ **Es CARO** (recorre actividades vivas, proyectos, promociones y bolsas): se calcula **solo en
  Inicio y solo para dirección** (`role == 10`), cacheado en `g`. Y por eso los módulos de
  departamento **ni se calculan** para dirección (`_dept` en `inject_personnel_globals`).
  ⚠️ **El cerrojo del `g` es una MARCA aparte** (`_direccion_board_done`), no el propio valor:
  `None` es un resultado válido y con `if cache is not None` se recalcularía en cada `render`.
  ⚠️ **RED DE SEGURIDAD**: si no se puede ni leer el personal, `_direccion_board()` devuelve
  **None** y el Inicio se cae al de SIEMPRE — unos módulos de más son mucho mejor que una pantalla
  en blanco. Por eso el cuadro se monta **antes** del diccionario del contexto y `_dir` se apaga si
  sale None.
  ⚠️ El resumen de los **PROYECTOS** es a propósito **el PASO en el que está** (la fecha, el plazo,
  el productor, el aviso, la bolsa) y no la cuenta exacta de `_disco_project_tasks`: ese hace ~25
  consultas POR PROYECTO y en Inicio serían cientos. La lista entera está en la ficha del proyecto.
  ⚠️ Una actividad de Contratación es **UNA** tarea aunque le falten tres cosas (el contrato, el
  anuncio y mandarla a producción): es el mismo criterio con el que se cuentan sus pestañas, así que
  el número del cuadro y el de Contratación dicen lo mismo.
  · **MIS AVISOS** (`_home_notices`) es el MISMO dato de la campanita (`_notification_rows`, solo lo
  no leído), no otro: un aviso leído deja de estar esperando y el módulo desaparece solo.
  · **MIS TAREAS PENDIENTES** (`_home_my_tasks`) **no calcula nada nuevo**: junta lo que los módulos
  personales ya han resuelto (remesas por aprobar, vacaciones por aprobar, el OK al plan de
  lanzamiento, las fases de sus actividades, activar producción, carteles rechazados, rechazos por
  comunicar) en una sola lista ordenada por urgencia. Los módulos de los que sale **no se pintan**
  para dirección (llegan vacíos), así que nada se dice dos veces.

- **DISCOGRÁFICA · DEMOS** (ago 2026): las maquetas que se están valorando, en su propia sección
  (`/discografica?section=demos`). Modelo **`SongDemo`** (`ensure_song_demos_schema`).
  · Una demo viene **de un artista NUESTRO** (`origin='ARTIST'` + `artist_id`) o **DE FUERA**
  (`origin='EXTERNAL'` + quién la manda, su correo y su teléfono, y el tercero si está en la base);
  el ORIGEN se guarda en la propia demo y el flujo es el MISMO: entra **VALORANDO** y acaba
  **APROBADA** o **DESCARTADA**, con el motivo (`decision_note`), quién decidió y cuándo.
  · **Pasar al repertorio** (`discografica_demo_to_song`): una demo APROBADA de un artista nuestro
  crea la canción con su título y su artista y queda **enlazada** (`song_id`), para no perder de
  dónde salió. ⚠️ `Song.release_date` es NOT NULL: la canción nace con la fecha de hoy y ya se
  corregirá en su ficha. Una demo de fuera no se pasa (no hay artista) y se dice por qué.
  · **El audio se sube DIRECTAMENTE a Storage** (`discografica_demo_sign`, mismo patrón que la
  entrega de masters): una maqueta puede pesar como un master y no puede tumbar la petición. Si la
  subida directa falla, va por el servidor como respaldo.
  · Se escucha con la etiqueta de audio del sistema (`media_chip.js`) y se filtra por estado, origen,
  artista y texto libre. **Acceso: el mismo que el repertorio** (no hay permiso nuevo que conceder;
  los endpoints heredan `discografica` por la ruta y escribir exige `can_edit_discografica()`).
  ⚠️ Una sección nueva hay que añadirla a la **lista blanca de `section`** de `discografica_view`: si
  no, cae en `canciones` y la pestaña sale marcada pero se pinta otra cosa (bug real de esta épica).

- **DEMOS · VALORACIÓN del sello** (ago 2026, rediseño). ⚠️ Una demo **ya NO se aprueba ni se descarta**
  (el endpoint `discografica_demo_status` se retiró y `status` queda como histórico): lo que se hace es
  **mandarla a valorar**. Al repertorio pasa cualquier demo de un artista nuestro, sin exigir estado.
  · **«Enviar a valoración»** (tres puntitos): pop-up con el personal del **SELLO** ya marcado
  (`_demo_sello_people`; si nadie tiene ese departamento se ofrece a todo el personal), se puede quitar
  y añadir otros correos, con **la vista previa del correo al lado**
  (`discografica_demo_rating_preview` → `_demo_rating_email_html`, el MISMO HTML que se manda).
  · **El correo**: logo de **PIES** arriba a la derecha, **«Valoración»** centrado, «X quiere que
  valores este tema», la **cabecera de la maqueta** (con la foto del artista o del tercero) y el botón
  **Valorar** a la derecha.
  · **Cada persona tiene SU enlace** (`SongDemoRating.token`, página pública `public_demo_rating`,
  `/valoracion-demo/<token>`): la fila se crea VACÍA al pedir la valoración, así se sabe **a quién se le
  pidió** y por tanto si falta gente. Volver a pedirla **reutiliza** su fila (no se pierde lo que dijo).
  · **La página** enseña lo mismo que el correo, el **audio** con la etiqueta de siempre
  (`media_chip.js`), la nota de **1 a 10 con barra roja→verde** (`_demo_rating_color`, espejado en el JS
  de la página), **¿la ves para radio?** y **¿la ves como focus single?** (`DEMO_RATING_QUESTIONS`) y un
  comentario opcional. Se puede volver a entrar y cambiarla: vale la última.
  · **El ICONO de la fila**: **verde** cuando han valorado todos, **amarillo** cuando falta gente, con
  `hechas/pedidas` y la media. Al pincharlo,
  `discografica_demo_rating_results` pinta la tabla: foto y nombre de cada uno, su nota con su color, sus
  dos respuestas, la **media** y **qué ha ganado** en cada pregunta (`_demo_rating_summary`, que también
  dice quién falta). El filtro de la pantalla pasa a ser por valoración (`DEMO_RATING_FILTERS`).
  ⚠️ El resumen del listado sale de **UNA** consulta para todas las demos (con 400 filas, una por demo
  sería inaceptable) y `public_demo_rating` está en las **tres** listas de endpoints públicos.

- **DEMOS · cómo se lee una maqueta en el listado** (ago 2026, rediseño): la **PORTADA a la izquierda
  del todo** (`SongDemo.cover_url`; sin portada, la imagen de «sin portada» del repertorio) y a su
  derecha **DOS líneas cuadradas con el alto de la portada** (`.demo-row`, `.demo-row__body` con
  `height` fijo: así todas las filas quedan alineadas): arriba el **título** con el **play a su
  derecha** (la etiqueta de audio de siempre, `media_chip.js`, en su versión sin cápsula
  `.mat-chip--bare`) y debajo, como subtítulo, la **foto y el nombre del artista**. La **nota**, si la
  hay, debajo de todo. **Cuándo se subió y quién NO se enseñan**: van en el tooltip de una **«i»**
  (`.demo-row__info`), junto al origen y los datos de quien la manda.
  · Al subir (o editar) una demo se puede **añadir la portada arrastrándola o eligiéndola**
  (`data-file-drop-for`, el mecanismo global) con vista previa; `cover_remove` la quita. Esa portada
  se usa también en las **playlists** (una demo puesta en una playlist se ve con su portada).
  ⚠️ A las personas se les marca la foto con `data-avatar="1"`: si su foto falla sale el muñequito
  gris en vez de desaparecer el hueco (y las dos líneas siguen cuadradas).

- **DEMOS · se ven y funcionan como las canciones de una PLAYLIST** (ago 2026, rediseño). La fila es
  el **mismo parcial** (`templates/_playlist_row.html`, macro `pl_row`) que usa la playlist: portada,
  título, artista con su foto, **play sobre la portada**, barra de reproducción que se arrastra y paso
  automático al siguiente. Lo propio de la demo (valoración, «En el repertorio», la «i» y los tres
  puntitos) se le pasa a la macro como `badges`/`menu`/`note`.
  ⚠️ El motor es **`playlist.js`**, así que la pantalla de demos TIENE que cargarlo: sin ese `<script>`
  las maquetas se ven bien pero **no suenan** (bug real de esta épica).
  ⚠️ La macro habla de `artist_name`/`artist_photo`/`stream_url`; a la demo se le pasa lo suyo con esos
  nombres (`who`, `who_photo`, `audio_url`) con `dict(row, ...)`.
  · **Primero los ARTISTAS con maquetas** (`_demos_artist_groups`), con **«Sin artista» como PRIMERA
  opción y con ICONO en vez de foto** —y solo si de verdad hay maquetas sin artista—; al entrar en uno
  se ven las suyas (`?demo_artist=<id>` o `none`). Fuera el contador y los filtros de valoración.
  · **AUTORES y LETRA** (opcionales, como todo menos el título): `SongDemoAuthor` (tercero + rol + % +
  editorial) y `SongDemo.lyrics`. En la fila, el icono de **letra** (se abre al pincharlo) y el de
  **autores** con sus nombres; al pasar el ratón, sus **porcentajes y su editorial**
  (`_demo_authors_tooltip`). La editorial escrita a mano se casa con la de la base si coincide.
  · **El FORMULARIO es uno solo** (`templates/_demo_form_fields.html` + `static/js/demo_form.js`),
  compartido con el enlace público, y va por **BOCADILLOS** (`.demo-card`), cada cosa en el suyo: de
  quién es · **el título** · **¿quién la manda?** · el audio · la portada · los autores · la letra ·
  las notas. El audio y la portada se **arrastran o se eligen**.
  · **¿QUIÉN LA MANDA?** (solo cuando la subimos nosotros): **una sola barra** que busca en TODA la
  base —terceros, personal de la casa y artistas— (`api_demo_sender_search`, en
  `SUPPORT_READ_ENDPOINTS`), y si no está se **crea el tercero sobre la marcha** con lo escrito
  (`api_create_promoter`). **No se piden correo ni teléfono**; lo que hubiera guardado no se pierde
  (solo se tocan esos campos si de verdad llegan en el formulario).
  · **EL MISMO AUDIO no se sube dos veces sin avisar**: el navegador calcula la **huella sha256** del
  archivo y pregunta (`discografica_demo_audio_check`); si ese mismo audio ya está, dice **con qué
  nombre** y deja subirlo igualmente o no, y si se sube con el MISMO nombre **pide otro** para
  distinguirlas. ⚠️ Lo comprueba también el SERVIDOR (`_demo_duplicate_check` + el cálculo de la
  huella cuando el archivo pasa por él): saltarse el JS no cuela una repetida.
  · **Descargar el audio** (`discografica_demo_audio_download`) da a elegir **WAV o MP3** y lo
  **descarga** (antes abría la URL de Storage en una pestaña). Punto único `_demo_audio_download`, que
  usa también la descarga de una playlist.

- ⚠️⚠️ **UN CLIC EN UN CONTROL DE LA FILA NO REPRODUCE NI PARA NADA** (bug real, ago 2026). En el
  listado de demos (y en una playlist) cada línea lleva **sus tres puntitos**, sus etiquetas y sus
  formularios DENTRO del `<li data-pl-row>`, y el clic burbujeaba al reproductor: **abrir el menú
  arrancaba el audio** y, si algo estaba sonando, **lo cortaba**. El handler de la fila
  (`playlist.js`) ignora ya cualquier cosa con la que se pueda interactuar (`CONTROLES`: `button`,
  `a`, `input`, `label`, `select`, `textarea`, `form`, `.dropdown`, `[data-bs-toggle]`,
  `[role="button"]`, la barra) — antes solo se saltaba la barra, los enlaces y `.pl-row__dl`.
  · Lo que SÍ suena: **pinchar la línea** o **la portada**. El botón de PAUSA sigue funcionando porque
  tiene su propio handler en fase de **captura** (con `stopPropagation`), así que excluir `button` no
  lo rompe.
  ⚠️ Al añadir un control nuevo a una fila (una casilla de selección, un botón de enviar) **no hay que
  tocar nada**: la regla es por tipo de elemento, no una lista de clases.

- **DEMOS · COMPARTIR UNA MAQUETA igual que una playlist** (ago 2026): en los **tres puntitos** de
  cada demo hay **Compartir** y **Copiar enlace**. El pop-up es el mismo que el de una playlist
  (**WhatsApp · SMS · Copiar enlace · Email**, con nota) y lleva **los mismos interruptores**
  (`DEMO_SHARE_SWITCHES`: descarga · letra · autores · quién la envió · notas), que **nacen apagados**
  y se guardan **al momento** (`demo_share_save`, uno a uno).
  ⚠️ **Se pinta con la MISMA vista que una playlist** (`public_playlist.html` /
  `_playlist_view.html`): `_demo_share_context` fabrica el contexto con la forma que ese parcial
  espera (`pl` + `items` de una sola línea), así que la maqueta se ve y suena igual que un tema de una
  playlist y **no hay una segunda pantalla que mantener**.
  ⚠️ Como en las playlists, **la dirección del archivo en Storage NO sale nunca a la página**: el
  audio va por nuestro puente (`public_demo_share_audio` → `_playlist_audio_response`, con `Range`
  para poder arrastrar la barra) y la descarga solo existe **si el interruptor está encendido**
  (`public_demo_share_download`, que lo vuelve a comprobar).
  ⚠️⚠️ El **token del enlace se crea en `_demos_context` con COMMIT**: creándolo al pintar (con un
  `flush` sin commit) se perdía al cerrar la sesión y en la carga siguiente salía otro — o sea, un
  enlace ya compartido dejaba de valer (bug real, lo sacó la prueba).
  ⚠️ La miniatura (`public_demo_share_og_image`) es la **portada de la maqueta** y, si no tiene o no se
  puede leer, la imagen de **«sin portada»** (no el logo), como en las canciones. Los cuatro endpoints
  públicos están en las **tres** listas.

- **DEMOS · ENLACE PÚBLICO para que nos manden maquetas** (ago 2026): botón **«Link para subir
  demos»** al lado de «Añadir demo» (se comparte por correo, WhatsApp, SMS o copiándolo). El token es
  **uno para toda la casa** (`AppSetting` `demo_upload_link_token`).
  · **`/enviar-demos/<token>`**: primero se **identifica con su DNI o CIF** (`_find_people_by_doc_number`,
  igual que en las facturas: terceros, sus sociedades, documentos escaneados y personal); si no está,
  se le piden nombre y contacto y **se le crea la ficha de tercero**. Después ve la página como una
  playlist —logo de **PIES** arriba a la derecha, **«Envío de Demos»** centrado, su cabecera y el botón
  **+ Añadir demo**— y va añadiendo maquetas con el MISMO formulario, viéndolas y **escuchándolas**
  como las vemos aquí. Al final, **«Enviar demos»**.
  ⚠️ **Mientras no las envía NO existen para nosotros**: quedan con `submitted_at` a NULL y
  `_demos_context` las deja fuera. Al enviarlas se sella `submitted_at` y aparecen con su **«Enviada
  por»** (foto, nombre y fecha, `_demo_submitted_by`).
  ⚠️ De fuera solo se le ofrecen los artistas con **contrato discográfico, de catálogo o de
  distribución** (`_demo_submit_artist_options`): el resto no se le muestran.
  · **Avisos** (`_demo_submission_recipients`): «X ha enviado N demos» con enlace a verlas. Si vienen
  vinculadas a artistas, a quien del **sello** lleva esos artistas (`assigned_artist_ids_sello`), a la
  **dirección** del sello y a quien del sello lleva **Registros**; si no van con artista, a todo el
  sello (si no, no se enteraría nadie).
  · **PREVISUALIZACIÓN del enlace** (`public_demo_submit_og_image`): el **logo de la empresa del grupo
  CENTRADO y entero** sobre **fondo blanco** (1200×630 con `_og_image_jpeg_bytes`, que hace `contain`
  sobre lienzo blanco), para que en WhatsApp y en SMS se vea bien y no se corte.
  ⚠️⚠️ Ahí salió un bug de TODAS las miniaturas: `_og_image_jpeg_bytes` pasaba la imagen a RGB **a
  pelo**, y un logo PNG con fondo TRANSPARENTE se volvía **NEGRO**. Ahora lo transparente se compone
  sobre blanco (`alpha_composite`), lo que arregla también las og: de pitch, materiales y playlists.
  ⚠️ Sus ocho endpoints públicos están en las **tres** listas.

- **PLAYLIST** (ago 2026): listas de temas para **MANDARLAS**, en su pestaña de Discográfica
  (`/discografica?section=playlists`). Modelos **`Playlist`** + **`PlaylistItem`**
  (`ensure_playlists_schema`). Una línea es una **CANCIÓN** del repertorio, una **DEMO**, un **TÍTULO**
  o una **DIVISIÓN** (`kind`, y el orden lo da `position`; mismo patrón que el set list de una
  actividad). Se crean con **«+ Playlist»** (solo el nombre) y se listan una debajo de otra, cada una
  con sus **tres puntitos** (editar · compartir por Email/WhatsApp/SMS · copiar enlace · eliminar);
  dentro, esas mismas opciones son **botonotes** (`.ficha-quick`).
  · **La playlist se ve IGUAL en todos los sitios**: punto único `templates/_playlist_view.html`
  (la pantalla de dentro y el enlace público) — logo de la empresa del grupo arriba a la derecha
  **solo cuando SALE DE CASA** (`is_public`: el enlace público y el correo; dentro no se pinta, que es
  nuestra pantalla y encima estorbaba a los botones) —,
  cabecera con su portada, la **nota solo si existe** y los temas con portada, título en negrita,
  artista con su foto y la duración. Al pasar el ratón la línea se subraya y sale el **play sobre la
  portada**; al pinchar en cualquier sitio suena y aparece a la derecha la **barra** (pausar,
  arrastrar para moverte y el segundo por el que vas). **Al terminar una canción arranca la
  siguiente** y solo suena una a la vez (`static/js/playlist.js`, un único `<audio>`).
  · **LOS BOTONES van en la CABECERA**, a la derecha y a la altura de «Playlist» (parcial único
  `templates/_playlist_actions.html`, que incluyen la vista y la edición; en el enlace público NO se
  pinta porque `playlist_actions` no está puesto): **Editar** · **Compartir** (un solo botón que
  despliega Email · WhatsApp · SMS · Copiar enlace) · **Copiar enlace** también suelto · los
  **INTERRUPTORES** · **Eliminar**.
  · **CINCO INTERRUPTORES** (los `.sw` de los accesos, con el **icono arriba y el interruptor
  debajo**, verde encendido y gris apagado; **todos nacen APAGADOS**): **Descarga** ·
  **Letra** (`show_lyrics`) · **Autores** (`show_authors`) · **Quién la envió** (`show_sender`) ·
  **Notas** (`show_notes`). Cada uno se marca ahí mismo y se guarda al momento; lo que enseñan de cada
  tema lo monta `_playlist_item_extras` **solo si está activado Y el tema lo tiene** (una canción saca
  su letra de `Song.lyrics_text` y sus autores de `SongEditorialShare`; una maqueta, los suyos, su nota
  y quién la mandó — ⚠️ las NOTAS hoy solo las tiene una maqueta: `Song` no tiene ese campo).
  ⚠️ La descarga **ya no es una pestaña**: la ficha no tiene pestañas. Los interruptores **solo
  recargan en la VISTA** (para que aparezca o desaparezca lo que enseñan); **editando NO recargan** —se
  perdería lo que no esté guardado—: ahí las líneas traen TODOS los extras (`_playlist_context(...,
  all_extras=True)`, que también los devuelve `playlist_save`) y se ven u ocultan con las clases
  `is-show-*` del editor, así **al encender un interruptor se ve al momento cómo va a quedar**.
  · **LOS TRES PUNTITOS**: editar (o ver) · **Compartir** (abre su pop-up con WhatsApp, SMS, copiar el
  enlace y el correo) · Copiar enlace y, debajo, **Eliminar**.
  ⚠️⚠️ **Un desplegable DENTRO de un menú ⋯ no se puede usar**: el ayudante global de desplegables
  (`scripts.js`) crea TODOS los dropdowns con `autoClose: true` y les teleporta el menú al `<body>`,
  así que cualquier clic dentro los cierra —y `data-bs-auto-close="outside"` no manda, porque la opción
  de JS pisa al atributo—. Por eso «Compartir» abre un **pop-up** (que además es el patrón del resto de
  la app) en vez de desplegarse en el sitio.
  · **EDICIÓN** (`?edit=1`): las líneas se **arrastran** para ordenarlas, arriba están «Añadir
  canción» (pop-up: **Demos** → artistas con maquetas + «Sin artista» · **Repertorio** → artistas,
  primero los que tienen contrato y el resto tras «ver más» → sus temas con portada), «Añadir un
  título», «Añadir una división» y «Añadir una nota»; el **nombre se pincha** y delante sale el
  **cuadradito de la portada** (se arrastra o se elige). El título y la división **no llevan
  etiqueta** («TÍTULO»/«DIVISIÓN»): se ven por lo que son. Se guarda todo de una (`playlist_save`
  reutiliza las líneas por su id, así un segundo guardado no duplica nada).
  ⚠️⚠️ **EL ARRASTRE MUEVE LA LÍNEA DE VERDAD** mientras se arrastra (en `dragover` se hace
  `insertBefore` según la mitad de la fila por la que se pasa), así se ve dónde va a quedar antes de
  soltarla; y al soltar, el array se reconstruye **leyendo el orden de la lista**. Hacerlo con
  índices (un `splice` para quitar y otro para meter) dejaba la línea **una posición desviada al
  bajarla**, porque al quitarla los índices de abajo ya se habían movido (bug real). Escribir en el
  título de una línea no la arrastra (`mousedown` sobre un input le quita el `draggable`).
  · ⚠️ **LAS CANCIONES NO SE DESCARGAN** salvo que la playlist lo permita: `allow_download` nace en
  **false** y se cambia en la **pestaña «Descargas»** de la playlist (interruptor); en el listado se
  ve con su icono (candado / descarga). El audio se sirve SIEMPRE por un endpoint nuestro que hace de
  **puente** (`_playlist_audio_response`), así la dirección del archivo en Storage **no sale nunca a
  la página** y el reproductor no lleva los controles nativos (que traen su propia descarga).
  ⚠️ Ese puente **pasa el `Range`** que pide el navegador (y devuelve su 206 con `Content-Range`):
  sin eso no se puede arrastrar la barra y Safari directamente no reproduce.
  · **La duración la lee el navegador** (una lectura del principio de cada archivo, de una en una) y
  se **apunta** en `PlaylistItem.duration_seconds` (`playlist_item_duration`) para no volver a
  pedirla en cada carga; aquí no hay ffmpeg.
  · **Compartir**: enlace público `public_playlist_view` (`/playlist/<token>`, token **opaco**) con el
  juego de **og:** completo (`public_playlist_og_image`: la portada de la playlist y, si no tiene, la
  del primer tema).
  ⚠️ **Sin ninguna portada la previsualización es la imagen de «SIN PORTADA»**, la misma que en las
  canciones —no el logo—: en WhatsApp, en SMS y en el enlace se ve lo que se vería en la app. Va con
  **`static/img/cover_placeholder.png`** (un PNG a propósito: la miniatura og: es un JPEG y Pillow no
  lee el SVG `cover_placeholder.svg`). El **correo** (`_playlist_email_html`) es «**Playlist \<nombre\>**» con la
  cabecera de la playlist y el botón **Escuchar**, que lleva a ese enlace.
  ⚠️ Los cuatro endpoints públicos están en las **tres** listas; los de dentro cuelgan de
  `/discografica/playlists/...`, así que heredan el permiso de la sección por la ruta.
  ⚠️ La sección `playlists` hay que tenerla en la **lista blanca de `section`** de `discografica_view`
  (si no, cae en `canciones` y la pestaña sale marcada pero se pinta otra cosa).

- ⚠️⚠️ **ENTREGA DE MASTERS · el 502 al enviar el formulario** (bug real, ago 2026). Los masters son
  archivos GRANDES: si viajan dentro del formulario, la petición se pasa del tiempo (y de la memoria)
  que el servidor le da y **muere con un 502 sin guardar nada** — el mismo caso que ya se resolvió con
  los vídeos. Ahora el navegador los sube **DIRECTAMENTE a Storage** con una URL firmada
  (`public_song_delivery_sign`, exento de CSRF y en las tres listas públicas) y al servidor solo le
  llega su dirección en `uploaded_json` (`{campo: [{key, name}]}`); el formulario enseña una barra con
  el archivo que va subiendo. ⚠️ Si la subida directa falla, se manda **todo** por el servidor como
  antes (respaldo) y se **descarta lo ya subido**, para que ningún archivo entre dos veces.
  ⚠️ Si al registrar un archivo ya subido no se puede resolver su dirección, **se deshace la entrega
  entera y se avisa**: una entrega a medias no se da por buena.

- **ENTREGA DE MASTERS · qué se pide y qué es obligatorio, campo a campo** (ago 2026):
  · Catálogo ÚNICO **`_song_delivery_askable()`** (campos de producción + autoral + letra + cada
  material) y **`_song_delivery_config(link)`**, que dice para ESE enlace si cada cosa se pide y si
  obliga. Se guarda en `SongMasterDeliveryLink.fields_json`; los enlaces ANTIGUOS no lo traen y se
  reconstruye de sus secciones/materiales, así que se comportan igual que siempre.
  · **PORTADA y TEXTO PARA EL PITCH** (ago 2026): se pueden pedir en el enlace y nacen **DESACTIVADOS**
  (`SONG_DELIVERY_OFF_BY_DEFAULT`), o sea que solo se piden si se marcan a mano. La portada es un
  módulo de material más (`mat.cover`) pero **es una IMAGEN**: no entra en
  `SONG_DELIVERY_MATERIAL_SPECS` (la lista de audios), va por el SERVIDOR con `data-no-direct` —la
  firma de subida directa solo admite .wav/.zip— y se guarda como `SongMaterial` COVER/COVER
  pendiente de validar. El pitch es su propia sección (`PITCH`) y al consolidarlo entra en
  `Song.pitch_text`, igual que si se escribiera a mano.
  ⚠️ Los enlaces ANTIGUOS sin `materials_json` se rellenan con **`SONG_DELIVERY_LEGACY_MATERIALS`**
  (los seis de audio), no con el catálogo entero: si no, empezarían a pedir la portada retroactivamente.
  · Al generar el enlace, cada campo lleva un **interruptor de TRES posiciones** con el mismo
  lenguaje que los de permisos (`.sw3` en `styles.css`, leyenda arriba): **apagado** = no se pide ·
  **ámbar en medio** = se pide · **verde a la derecha** = obligatorio. Se **ARRASTRA** el pomo (dedo o
  ratón), se pincha la posición o se usan las flechas, y el valor viaja en un `mode_<clave>` (0/1/2) —
  el servidor sigue aceptando las dos casillas antiguas por si queda una pantalla vieja abierta.
  ⚠️⚠️ **EN EL IPHONE Y EL IPAD NO SE PODÍAN MOVER** (bug real, ago 2026). El motor solo escuchaba
  **`click`** y vivía dentro de `song_detail.html`. Con el dedo, lo natural en algo que parece un
  slider es **arrastrarlo** — y un arrastre **NO genera `click`** (iOS lo toma por un scroll en cuanto
  el dedo se mueve), así que no pasaba absolutamente nada. Y pinchar tampoco valía: el control medía
  **64×23 px, 21 px por posición**. Ahora el motor es **`static/js/sw3.js`** (GLOBAL en `layout.html`,
  no-op sin `[data-sw3]`), con **Pointer Events + `setPointerCapture`** (dedo, ratón y lápiz), y en
  táctil el interruptor se agranda a **108×34 px** con `touch-action:pan-y` (un arrastre horizontal
  mueve el pomo, uno vertical sigue haciendo scroll).
  ⚠️ La zona de toque ampliada (`.sw3::after`) es de **4 px** arriba y abajo a propósito: entre fila y
  fila hay 9 px, y con 10 px las zonas se SOLAPABAN y un toque junto al borde cambiaba el interruptor
  de la fila de al lado (comprobado con `elementFromPoint`).
  ⚠️ La geometría va en variables (`--sw3-w/-h/-knob/-pad`) y el recorrido del pomo se CALCULA: sin
  eso, cambiar el tamaño deja el pomo corto o fuera. De ahí salen también
  `sections_json` y `materials_json`, para que todo cuadre. El formulario público pinta solo lo
  pedido y **valida exactamente eso**.
  · **PREVISUALIZACIÓN del enlace** (`_song_delivery_share_context` + `public_song_delivery_og_image`):
  la **portada**, «Entrega de masters · <canción>» y, debajo, el **artista** con los **intérpretes**
  que haya además de él. La miniatura va a 1200×630 **desde nuestro dominio** (como el resto), con la
  foto del artista y el logo como respaldo.
  · **EL PRODUCTOR es un TERCERO de la base de datos**: buscador con foto (reutiliza
  `public_song_delivery_authors`, que ahora devuelve también el **correo**), alta al vuelo
  (`public_song_delivery_create_author` acepta `email`) y, **solo si su ficha no tiene correo**, se
  pide ahí y **se guarda en su ficha** al enviar la entrega. Queda apuntado en
  `data['production']['producer_promoter_id']`.
  · **RECORDATORIOS**: mandar el enlace por correo activa `reminders_enabled`; el barrido
  `_song_delivery_reminders_sweep` (cron `/cron/entrega-masters`, y también dentro del cron diario de
  documentos para no depender de otra tarea en Render) insiste **una vez al día** hasta que se
  cumplimente o se anule — se para solo. ⚠️ Se llama desde una petición: usa `url_for`.
  · La página pública carga **`styles.css`** (es standalone: sin ella `btn-primary` salía AZUL) y su
  botón es `btn-danger`, como el resto de páginas públicas. El correo de solicitud lleva el título
  **centrado** bajo el logo, y el recordatorio reutiliza el mismo diseño.

- **Entrega de masters (enlace público)**: `SongMasterDeliveryLink` (token, `sections_json`, `status`
  ACTIVE/SUBMITTED/CANCELLED, `data` JSONB). Botón en la ficha (modal: secciones producción/autoral/letra/
  masters) → endpoints `discografica_song_delivery_create`/`_cancel`; formulario público
  `public_song_master_delivery` (`templates/public_song_master_delivery.html`, exento CSRF/login, logo
  PIES). Lo recibido entra **pendiente**: datos en `data`, materiales `SongMaterial` con
  `validation_status='PENDING'` + `delivery_link_id`. **Validación en la ficha**: materiales con
  ✓Validar/✗Rechazar (`…/materials/<id>/validate`; stems `…/stems/<b>/validate`); datos en panel
  *"Entrega recibida"* con Consolidar/Descartar por sección (`…/entrega/<id>/consolidar`, aplica a
  `Song`/`SongEditorialShare`). Barra de estado amarilla mientras haya `PENDING`. **Inicio**: módulo
  *Tareas pendientes · Registros* en `home.html` (`_home_registros_pending` + `inject_personnel_globals`,
  visible con `has_access_key('registros')`) que lista canciones con entregas pendientes y enlaza a la ficha.
  El modal de generar permite elegir **qué materiales** pedir (`materials_json`, módulos desactivables) y
  **enviar el enlace por correo** (`discografica_song_delivery_send_email` + `_send_optional_email`, con
  buscador `/api/search/promoters`). El hueco de portada **provisional** solo se muestra si existe. El
  formulario público autocompleta **autores** (con foto, búsqueda **acento-insensible** vía
  `_sa_contains_text`) y permite crearlos vía endpoints ligados al token (`public_song_delivery_authors` /
  `_publishers` / `_create_author` / `_create_publisher`), con **sugerencia de duplicados** al crear y
  selector de **editorial con logo + crear nueva**. La editorial se **congela por registro** en
  `SongEditorialShare.publishing_company_id` (snapshot; al mostrarla se cae a la del tercero si está vacío,
  helper `_share_publisher`): cambiarla actualiza el tercero **de aquí en adelante** sin tocar registros
  anteriores. El envío del enlace
  por correo busca terceros y carga sus **correos vinculados** (`api_promoter_emails`) para elegir
  destinatarios + nota. **Todos los correos del servidor (`_send_optional_email`) llevan Reply-To al usuario
  que envía** por defecto (`reply_to or _current_user_email()`).
- **ENTREGA DE MASTERS · lo entregado es TAREA de REGISTROS y del SELLO** (ago 2026). Cuando un
  tercero entrega por su enlace, eso es trabajo para dentro: hay que **revisarlo y validarlo**.
  · **AVISO** (kind **`MATERIALES`**): «**Estudio Perico ha subido los masters de «Canción»**», con
  **su foto o su logo** y lo que falta en el cuerpo. Va a **Registros** (`_registros_user_ids`) y al
  **SELLO** —quien lleve a ese artista en su faceta (`assigned_artist_ids_sello`) y, si no lo tiene
  nadie, todo el departamento—: `_song_delivery_review_recipients`.
  · **LA CARA en los avisos**: `AppNotification.actor_photo_url` / `actor_name` (columnas nuevas) para
  cuando quien lo provoca **NO es de la casa**; si es de la casa, la foto se resuelve **en vivo** de su
  perfil en `_notification_rows` (una sola consulta para toda la lista). Se pinta en los TRES sitios
  (la franja, el pop-up de la campanita y el módulo «Mis avisos» de Inicio) con la clase `.notif-ava`,
  en el hueco del icono del tipo — sin foto, el icono de siempre. `_notify_user` acepta
  `actor_name=` / `actor_photo=`.
  · **LA TAREA no se cierra hasta que la entrega está COMPLETA**: punto único
  **`_song_delivery_review_state(session_db, link)`** → `pending` (materiales sin validar) ·
  `sections` (datos sin consolidar) · `rejected` (lo que se rechazó y **sigue faltando**) ·
  `missing_labels` · `done`. Con él van el módulo de Inicio (`_home_registros_pending`, ahora visible
  para **registros Y discográfica**), el aviso de la ficha (pestaña Materiales) y el cuadro de
  dirección (área Registros), así que los tres dicen lo mismo.
  ⚠️⚠️ **RECHAZAR un material es BORRARLO** (el botón ✗ es `discografica_song_material_delete`), así
  que deja de estar «pendiente de validar» **y la tarea desaparecería justo cuando falta algo**. Por
  eso el rechazo se **apunta en la entrega** (`_song_delivery_mark_rejected` →
  `link.data['rejected']`) y se da por resuelto solo cuando ese módulo vuelve a tener un material
  validado (`_song_delivery_field_has_validated`). Se apunta en el enlace, no en la canción, para no
  resucitar trabajo de entregas viejas ya cerradas.
  · El aviso se cierra SOLO al completarse (`_song_delivery_review_close(_for_song)`, la regla de
  `_notify_resolve`), enganchado en los CUATRO caminos que revisan: validar un material, validar los
  stems, consolidar una sección y descartarla.
  ⚠️⚠️ **QUIÉN entregó se apunta AL RECIBIRLA** (`data['submitted_by']`, con nombre y foto): los datos
  de producción **se van al consolidarlos** y con ellos se perdía el nombre del productor, así que el
  aviso y la tarea dejaban de decir quién había subido los masters (bug real que sacó la prueba).
  ⚠️ Un tercero **no tiene `photo_url` ni `name`**: son **`logo_url`** y `nick`/`first_name`+`last_name`
  (`_promoter_display_name`).
  ⚠️ Mirar 50 entregas no puede ser 50 consultas: `_song_delivery_pending_map` cuenta lo pendiente de
  TODAS de una vez (GROUP BY) y `_song_delivery_review_state` lo acepta en `pending_map=`.
  · Probado contra la app real (Postgres de prueba): estado tras la entrega · aviso a registros y
  sello y a nadie más · cierre solo al validar y consolidar · rechazo → vuelve a pendiente diciendo
  «falta Master 48 bits» · reposición → completa · y el reparto del módulo de Inicio (registros sí ·
  sello con ese artista sí · sello con otro artista no · ticketing no · dirección sí).

- **REPARTO EDITORIAL: la parte del autor de Plataforma se reparte con nosotros** (ago 2026). La parte
  autoral de un autor NUESTRO (editorial «Plataforma Musical») no es toda suya: se reparte según el
  compromiso **EDITORIAL** de su contrato de artista (`ArtistContractCommitment.concept` = «editorial»;
  **`pct_office` = Plataforma Musical**). Ejemplo real: autor con el 60% de la obra y contrato 50/50 →
  **30% autor y 30% Plataforma sobre el conjunto de la obra**.
  · Motor en `app.py`: `EDITORIAL_CONTRACT_CONCEPTS` · `_publisher_is_platform` · `_artist_editorial_split`
  (reutiliza `_pick_artist_commitment`, que ya sabe de contratos vigentes y `material_scope`) ·
  **`_song_editorial_split_map`** (por id de registro: `pct` de la parte, `pct_author`/`pct_platform` de
  ESA parte y `final_author`/`final_platform` sobre la obra) · `_song_editorial_split_rows` (para PDF y
  páginas públicas) · `_freeze_song_editorial_split`.
  · ⚠️ **EL CONTRATO ES DEL ARTISTA Y SE APLICA A SUS INTEGRANTES** (corregido ago 2026): los autores
  de una obra casi nunca son «el artista», son **personas que forman parte de él** (el cantante, el
  guitarrista), así que buscar el contrato del propio autor no encontraba nada y el reparto no se
  detectaba (bug real). Punto único **`_editorial_split_for_author`**: sube del integrante a su
  artista con **`_promoter_member_artist_ids`** (`ArtistPerson.promoter_id`, cacheado en `g`),
  prefiere el artista **de la canción** si el autor es integrante de él, luego cualquier otro artista
  del que lo sea, y como último recurso el artista principal de la canción (un solista que figura
  como autor de su propia obra). Lo usan el MAPA y el CONGELADO, así que dos integrantes de artistas
  distintos en la misma obra reciben **cada uno el contrato de su artista**. El rótulo «Contrato
  editorial: X% autor · Y% Plataforma» de la ficha enseña el que de verdad se aplica.
  · **Manda lo VIGENTE EL DÍA DEL REGISTRO**: al marcar la obra como registrada en SGAE
  (`_mark_song_sgae_registered`) el reparto se **congela** en el registro de autoría
  (`SongEditorialShare.split_pct_author`/`split_pct_platform`/`split_frozen_at`), así que cambiar el
  contrato mañana no altera lo ya registrado. Solo se congela lo que no lo estaba.
  · **Reparto especial** (`special_split` + `special_pct_author`/`special_pct_platform`): se fija a mano
  y **pisa al contrato**. Los dos porcentajes son el reparto de la parte DEL AUTOR y tienen que sumar
  **exactamente 100** (lo valida el modal y otra vez `discografica_song_editorial_share_split`).
  · Se ve en la pestaña **Editorial** de la canción (`.ed-split*` en `styles.css`): la parte autoral del
  autor en la obra y debajo el reparto, con el porcentaje FINAL sobre la obra de cada uno.
  · ⚠️ Si un contrato antiguo trae porcentajes que no suman 100 se **normalizan** en vez de sacar un
  porcentaje de la obra que no cuadre.
  · **SI EL AUTOR DEJA DE SER DE PLATAFORMA** (le cambian la editorial o se la quitan), de ahí en
  adelante **no se le aplica ningún porcentaje**, pero **lo anterior se mantiene**: lo que quedó
  congelado al registrar la obra se sigue viendo tal cual. Dos puntos únicos:
  **`_share_split_frozen`** (¿ya está fijado: congelado o especial?) y **`_share_split_applies_live`**
  (¿se puede CALCULAR hoy?: el registro tiene que ser de Plataforma **y** el autor seguir siendo
  nuestro). El mapa enseña lo fijado siempre y solo calcula lo demás si `..._applies_live`; el
  congelado al registrar también lo exige, así que a quien ya se fue no se le congela nada nuevo.
  · **Relleno RETROACTIVO, puntual** (`_editorial_split_backfill` + `_editorial_split_backfill_once`,
  marca `editorial_split_backfill_v1`, corre una vez en el arranque): pone al día las obras que YA
  estaban registradas en SGAE antes de que existiera el reparto, congelando en cada una **el contrato
  vigente el día de SU registro** (`SongStatus.sgae_updated_at`; si no quedó apuntado, la fecha de
  publicación — nunca un contrato posterior). ⚠️ **No es la norma**: la norma sigue siendo congelar al
  registrar. Las obras **sin registrar no se tocan** a propósito (su reparto se decide el día del
  registro; hasta entonces la ficha ya lo enseña calculado) y si el relleno se cae a medias **no se
  marca** como hecho, para que el siguiente arranque lo reintente.
- **LC de REPARTO EDITORIAL** (ago 2026): el Label Copy que se comparte **NUNCA** lleva el reparto entre
  el autor y Plataforma; solo lo lleva el que se pide **desde Editorial**. Mismo generador con una
  bandera: `_build_song_label_copy_pdf_bytes(..., editorial=True)`,
  `discografica_song_label_copy_pdf?editorial=1` y token público con `ed` (`_song_label_copy_share_token(
  id, editorial=True)` → `_label_copy_public_url/_pdf_url(..., editorial=True)`), que es lo que pinta el
  bloque en `public_song_label_copy.html`. Botones «Descargar LC con el Reparto Editorial» y
  «Compartir Reparto Editorial» en la pestaña Editorial.
  El **PDF del LC** (canción y álbum) lleva el logo de la empresa arriba a la **derecha** y el título
  «Label Copy» **centrado** (estilo de casa).

- **PITCH DE LANZAMIENTO** (ago 2026): el texto con el que se presenta un single o un disco.
  · **TITULAR destacado** (`Song.pitch_title` / `Album.pitch_title`): el titular con el que se
  presenta. Se escribe encima del texto en la ficha y sale **en grande y en el rojo de la casa antes
  del texto** en el PDF, en el correo y en la página pública (el texto sigue **justificado**). Es
  opcional: sin él, todo se ve como antes.
  · **Un campo más de la ficha de Información** (`Song.pitch_text`/`Album.pitch_text` +
  `pitch_updated_at`), panel único **`templates/_pitch_panel.html`** (incluido en `song_detail.html`
  y `album_detail.html` con `pitch=_pitch_context(...)`), con sus **tres puntitos**: editar ·
  descargar en PDF · enviar por correo · WhatsApp · SMS · copiar enlace. Sin pitch, botón «Añadir
  pitch» y aviso amarillo «Falta el pitch de este lanzamiento».
  ⚠️ Se guarda por su **propio endpoint** (`discografica_song_pitch_save`/`_album_pitch_save`), NO
  por el formulario de Información: ese anula lo que no se le manda.
  · **El PDF y el correo son IGUALES a propósito** (mismo diseño en dos formatos): logo de PIES
  arriba a la **derecha**, «Pitch» **centrado**, la **viñeta** del lanzamiento (portada, título,
  intérpretes, fecha de publicación y etiqueta Single/Álbum/EP) y el texto **justificado**.
  Motor: `_pitch_context` (lo que necesitan ficha, PDF, correo y página pública) ·
  `_build_pitch_pdf_bytes` · `_pitch_email_html` (con el botón **«Descargar en PDF»**; el PDF va
  además **adjunto**) · `_pitch_paragraphs`. Asunto y mensaje: **`Pitch <artista> <título>`**.
  · **WhatsApp/SMS comparten el ENLACE PÚBLICO** (`public_pitch_view`, `/pitch/<token>`, plantilla
  `public_pitch.html` standalone), que tiene el juego de **og:** completo para que la
  previsualización enseñe la **PORTADA** del lanzamiento y, si todavía no hay, la **foto del
  artista** (`public_pitch_og_image` → `_og_image_jpeg_bytes`, 1200×630 desde nuestro dominio).
  La página lleva su botón «Descargar en PDF» (`public_pitch_pdf`).
  · **Tarea pendiente al crear un lanzamiento**: `_pitch_notify_new_release` avisa (kind `PITCH`) a
  **quien del sello lleva ese artista** (`_pitch_sello_user_ids`: `assigned_artist_ids_sello`; si
  nadie lo tiene asignado, a **todo el departamento Sello** — mejor que lo vean varios que dejarlo
  sin dueño) y el módulo de Inicio **`HOME_PITCH_PENDING`** (`_home_pitch_pending`) lista los
  lanzamientos sin pitch. ⚠️ Solo desde **`PITCH_TASK_FROM`** (01-ago-2026): el catálogo antiguo no
  genera tarea. Dirección lo ve todo; quien está en Sello sin artistas asignados, también.
  ⚠️ Los artistas de la faceta sello se leen de **`state["profile"].assigned_artist_ids_sello`**
  (en la raíz del estado solo está la unión `assigned_artist_ids`).
  · Los endpoints `discografica_*_pitch_*` heredan la sección por la ruta `/discografica`; los tres
  públicos están en `PUBLIC_ENDPOINTS_EXTRA` **y** en las dos listas `allowed`.
- **ISRC · vive en REGISTROS** (movido ago 2026): el repertorio de códigos y su configurador estaban
  en Discográfica y ahora son la pestaña **`/registros?tab=isrc`**, que es donde se trabaja con AGEDI y
  SGAE. Motor `_isrc_panel_context(session_db, isrc_tab=…, artist_id=…, year=…, config_subtab=…)` +
  parcial `templates/_isrc_panel.html`; en `registros.html` la pestaña se pinta con `isrc_only`, que
  deja fuera TODO el resto de la pantalla (su contexto no se calcula en esa pestaña).
  ⚠️ El **PERMISO sigue siendo `discografica.isrc`**: no se renombra a propósito (`_sync_access_resources`
  poda los huérfanos **en cascada** y se llevaría por delante los permisos ya concedidos). El
  enforcement de `registros_view?tab=isrc` acepta **la primera** clave que tenga el usuario
  (`discografica.isrc` o `registros`), así que quien tenía ISRC entra aunque no tenga Registros.
  ⚠️ `/discografica?section=isrc` **redirige** a la pestaña nueva (los enlaces guardados siguen
  valiendo) y los endpoints siguen llamándose `discografica_isrc_*` / `discografica_product_code_*`:
  renombrarlos no aporta nada y heredan su permiso por el prefijo.
  ⚠️ **El filtro por artista y el buscador van DENTRO del parcial** (`#isrcPanel`, por delegación):
  vivían en el bloque de JS de `discografica.html` y al mover la pantalla se quedaron atrás, así que
  **no filtraban nada** (bug real). Al mover un panel, el JS se mueve con él.
  · **El REPERTORIO se lee de arriba abajo por FECHA DE PUBLICACIÓN**: la más próxima primero, tanto
  dentro de cada artista como entre bloques (antes se ordenaba por el código ISRC, que no dice nada al
  mirar el repertorio). Cada tema lleva su **PORTADA** y cada código va **en VERDE si ya está
  registrado en AGEDI y en AMARILLO si sigue pendiente** (macro `isrc_badge`, y lo mismo para los
  subproductos), con su leyenda arriba. Lo registrado sale de `SongStatus.agedi_registered_isrcs`
  —el mismo dato que manda en «Pendientes AGEDI»—, leído de una vez para todas las canciones.
  · **Las COLUMNAS son las MISMAS en todos los artistas** (`.isrc-table` con `table-layout:fixed` +
  `<colgroup>`): cada tabla se ajustaba a su contenido y de un bloque a otro no cuadraban. Se retiró
  la indicación «De la publicación más próxima a la más antigua» (el orden sigue siendo ese).
  · **DESCARGAR LISTADO** (ago 2026): botón con dos opciones, **Excel**
  (`registros_isrc_export_xlsx`) y **PDF** (`registros_isrc_export_pdf`), que exportan **SOLO LO QUE
  SE ESTÁ VIENDO**.
  ⚠️⚠️ Las dos opciones son **ENLACES de verdad** (`<a href>`), no botones que navegan con
  `location.href`: el interceptor global de descargas (`static/js/doc_download.js`) solo reconoce
  enlaces, y con `location.href` el fichero se bajaba **en silencio** —sin la barra de «Generando
  documento…»— así que parecía que el botón **no hacía nada** (bug real). El href lo mantiene al día
  `pintaDescargas()` en cada cambio de filtro; nada de construirlo al pinchar. Los filtros del formulario (artista y año) van en la URL como siempre, y los del
  **navegador** —el chip de artista y el buscador— viajan también (`filtro_artista` y `q`) y se
  vuelven a aplicar en el servidor con el MISMO criterio que el JS del panel (punto único
  `_isrc_export_blocks`; el texto se compara con `_norm_text_key`, hermano de `normalizeSearchText`).
  · **El PDF**: logo de PIES arriba a la **derecha** (en todas las páginas), «**Listado Códigos
  ISRC**» centrado y debajo cada artista con su foto y sus canciones tal como se ven (los códigos, en
  verde o ámbar según estén registrados en AGEDI). **Nada más**. Va en **horizontal** para que no se
  corte nada y las páginas llevan **x/x** abajo a la derecha en pequeño (canvas propio: hay que saber
  el total, así que se pinta en una segunda pasada).
  ⚠️ `RLImage` **NO admite un `ImageReader`**: para una imagen dentro de una tabla hay que darle una
  ruta o un fichero en memoria (`_flowable`); el `ImageReader` es solo para pintar en el lienzo. Si el
  logo de la empresa no se puede leer, se cae al de la casa: es un documento que se manda fuera.
  · **El nombre del archivo** es «Listado Códigos ISRC_\<artista\>» y, con varios, todos los nombres
  que se están viendo separados por comas (`_isrc_export_filename`).
  ⚠️ Los dos endpoints van en los **dos** mapeos de `registros_*` y sus enlaces llevan **`tab=isrc`**,
  para que el permiso se resuelva contra la pestaña en la que se está.

- **REGISTROS · qué conciertos se declaran y cada cuánto** (ago 2026):
  · **Solo de artistas con CONTRATO DISCOGRÁFICO**: `_artist_has_record_deal` (compromiso de
  `ArtistContractCommitment` con concepto discográfico, vía `_pick_artist_commitment`, cacheado en
  `g`); de los demás artistas no declaramos nosotros y no se listan.
  · **Se declara por TRIMESTRES** (antes por semestres): `_quarter_of` / `_quarter_key` /
  `_quarter_label` («T3 2026 (Jul-Sep)»). Cada fila de conciertos y de promociones cantadas trae su
  `quarter_key`/`quarter_label` y la pantalla las agrupa por ahí.
  · El **título** de la tarjeta (canción, álbum, concierto o promoción) lleva a su ficha: ya
  enlazaba, pero no lo parecía — ahora se marca como enlace (`.registros-card__title`).

- **REGISTROS · material para presentar y declaración firmada** (ago 2026):
  · Botón de **icono** en Pendientes AGEDI y en Pendiente SGAE → `registros_song_pack`
  (`/registros/canciones/<id>/material?kind=AGEDI|SGAE`): un ZIP con la carpeta
  **`AGEDI_<Artista>_<Canción>`** / **`SGAE_<Artista>_<Canción>`** dentro. AGEDI: master en **MP3** +
  portada en **JPG** + PDF del **LC**. SGAE: lo mismo pero con el **LC de reparto editorial** y además
  la **letra** en su formato de editorial (sin logo). Lo que no se pueda incluir NO se calla: va un
  **`LEEME - falta material.txt`** diciendo qué falta.
  · La portada se pasa a JPG con `_registros_pack_cover_jpeg` (hasta 2000 px y calidad 85: buena para
  registrar sin que pese de más). ⚠️ **pydub busca `ffmpeg` en el PATH y en el servidor no está**:
  `_convert_audio_content_to_mp3` le apunta al binario estático de **imageio-ffmpeg** (`_ffmpeg_exe`,
  el mismo del póster de los vídeos); sin eso la exportación a MP3 falla en Render.
  · **Declaración de obra FIRMADA**: botón de icono en Pendiente SGAE (`registros_song_declaration_signed`)
  que la sube a la misma «Declaración de obra» de la ficha y marca `Song.work_declaration_signed`. El
  modal admite **arrastrar el PDF o elegirlo** (zona `.decl-drop` + `data-file-drop-for`, que resuelve
  el `file_drop.js` global; al soltarlo se enseña el nombre del archivo).
  **Sin ella no se puede marcar el registro en SGAE de una obra publicada desde
  `SGAE_SIGNED_DECLARATION_FROM` (04-ago-2026) en adelante** (`_song_sgae_declaration_missing`, aplicado
  en los TRES caminos: `discografica_song_sgae_register`, `_notify` y `discografica_song_status_toggle`);
  a las anteriores se les pide igual pero no bloquea, y eso no se anuncia en ninguna pantalla.
  · ⚠️ Los endpoints nuevos hay que añadirlos a los DOS mapeos de `registros_*`
  (`_coarse_endpoint_resource` y `_resolve_request_resource_key`); las URLs de la pestaña SGAE llevan
  `tab=sgae` para que el permiso se resuelva contra la pestaña en la que se está.
- **Aviso al AUTOR de que su obra está registrada en SGAE** (ago 2026): al marcar el registro desde
  `/registros` se hace por **JSON** (`discografica_song_sgae_register`) y sale un **pop-up**
  (`#sgaeNotifyModal`) que ofrece notificar al autor con sus correos ya marcados
  (`_song_sgae_platform_author_delivery`); decir que no **no deshace nada** (la obra se queda
  registrada). El correo (`_build_song_sgae_notification_email` → `discografica_song_sgae_notify`) lleva
  el logo de la editorial arriba a la **derecha**, **«Registro de Obra» centrado**, el aviso de que SGAE
  tarda en reflejarlo, la **viñeta de la canción** (portada, título, intérpretes y fecha de publicación)
  y la tabla del **REPARTO AUTORAL** — solo entre los autores (Autor · Rol · %): el reparto con
  Plataforma Musical **no sale nunca** en este correo.
- **Cambios de estado in-place** (`static/js/ajax_inline.js`): un
  `<form method="post" data-inline data-inline-target="#zonaId">` se envía por fetch (el endpoint NO
  cambia: sigue POST+redirect), se sigue el redirect y se **reemplaza solo la zona** `#zonaId`
  (un elemento con `id` + `data-inline-zone` que contiene el form y el badge que cambia), sin recargar
  ni mover el scroll; si no localiza la zona, hace recarga normal (fallback seguro). NO usarlo en
  borrados ni acciones que navegan a otra página. Ya AJAX nativo aparte: `concert_quick_status`,
  `setRoyaltyLiquidationStatus`.
  ⚠️ Para PREGUNTAR usa **`data-confirm`** (lo soporta el propio motor), **no**
  `onsubmit="return confirm(...)"`: el evento `submit` sigue burbujeando aunque el `onsubmit` lo
  cancele, así que decir «no» enviaba el formulario igual por fetch. El motor ahora también respeta
  `defaultPrevented` (una validación propia que cancele el envío ya no se manda).
  ⚠️ La zona **no puede ser un `tab-pane`**: al reemplazarlo llega una copia del HTML servido, donde
  esa pestaña no es la activa, y el contenido desaparece. La zona va SIEMPRE dentro del pane.
  ⚠️ `showFlashes` borra y reinserta arriba del `<main>` **todos los `.alert` que son hijos directos**
  de `main`: un aviso fijo al final de la página tiene que ir envuelto en otro `div`, o salta al
  principio en cada acción.
- **Simulaciones (Contratación) — rediseño jul 2026**: el sujeto puede ser un **artista o un EVENTO**
  (`AppEvent`, Bases de datos → Eventos, `/eventos`; alta rápida `data-quick-create="event"` y
  buscador `api_search_events`; NO sale en búsquedas de artistas). Motor puro en `sim_calc.py`
  (zona **PALCO** además de PISTA/GRADA —iconos de invitaciones fa-people-group/fa-chair/fa-crown—,
  overrides de ingresos OMIT/NA por línea, IVA incluido/exento por gasto, condición
  `cond_under_tickets` «solo si se venden menos de X entradas», `series_fine` 0–100% para los
  sliders). Gastos agrupados en **9 categorías fijas** `SIM_EXPENSE_CATEGORIES` (app.py, inyectadas
  a plantillas; TRANSPORTE/HOTELES legacy se remapean con `_sim_expense_cat`) en tarjetas
  «bocadillo» con rueda de IVA por gasto y subtotales. **Plantillas de gastos**
  `ExpenseTemplate(+items)` por ARTIST/EVENT/VENUE: se crean al guardar gastos (modal «vincular»),
  se ofrecen al abrir gastos vacíos (recientes primero) y se listan en la pestaña «Plantilla de
  gastos» de las fichas (panel `_expense_templates_panel.html`). El ticketing del recinto ya **NO se
  autocarga**: se ofrece con un aviso al abrir la pestaña Ticketing. **Socios por fecha**:
  `SimulationPartner.activity_id` (NULL = comunes; con id = propios de esa fecha, pestaña «Socios»);
  módulo reutilizable de beneficio/riesgo por socio con **slider 0–100%** (paso 1%, gradiente
  rojo→verde, flecha de empate) en `static/js/sim_partners.js` (`[data-sim-partners]` + JSON de
  `_sim_partner_module_payload`, agrega varias fechas en la vista general). Importes con aclaración
  fiscal al hover (`.sim-amt`, macro `amt()` de `simulacion_detail.html`). En General gira: etiquetas
  por fecha (precio medio · empate · beneficio potencial) y chinchetas del mapa numeradas por orden
  de fecha; el nombre por defecto de cada fecha es el municipio del recinto.
- **Módulo de GASTOS por categorías compartido**: los «bocadillos» (tarjetas por categoría, rueda de
  IVA, cantidad, arrastrar entre categorías, subtotales y total) son **un solo código**:
  `templates/_expenses_categories.html` + `static/js/sim_expenses.js` (`SimExpenses.init({root, rows,
  qtyCats, onChange})` → `collect()` / `recompute()` / `addRow()`). Lo usan la pestaña **Gastos de una
  simulación** (que conserva aparte cachés, comisiones y su autoguardado) y el editor de las
  **plantillas de gastos** (`expense_template_edit`, `/plantillas-gastos/<tid>`), así que se comportan
  igual y una mejora vale para las dos. ⚠️ Los importes se escriben FORMATEADOS («1.200,50»,
  `money_input.js`): hay que leerlos con **`window.numv`** (= `MoneyInput.num`, ahora GLOBAL). Antes cada
  pantalla se definía su `numv` y en la pestaña Gastos NO existía: cualquier lectura de importe
  petaba con ReferenceError y el guardado moría en silencio (bug real).
- **Simulaciones — ajustes ago 2026**: números sueltos con punto de miles (`|k` en plantilla + `toLocaleString('es-ES')` en JS; importes ya con filtro `eur`). Gastos: cabecera de categoría (bocadillo) en **rojo corporativo** sobre franja clara; **arrastrar** un gasto entre categorías (HTML5 DnD, re-renderiza la fila en destino); categorías **ALOJAMIENTO/LOGISTICA/PERSONAL/MUSICOS** (`SIM_EXPENSE_QTY_CATEGORIES`) llevan **cantidad** → total = importe unitario · cantidad (`SimulationProductionItem.quantity`/`ExpenseTemplateItem.quantity`, el motor multiplica); nueva categoría **PERMISOS** «Permisos y licencias». En Gastos, las biñetas de resumen van a la derecha y el total es «Gasto Total:» destacado. Módulo de socios (`sim_partners.js`): tabla con columna **Participación**, nombre completo sin cortar, cabeceras a 2 líneas y filas altas; mismo módulo y **mismo título** («Socios: beneficio y riesgo») en Resumen/Socios/Resultado. Cabecera de fecha: la tarjeta central solo muestra la fecha (sin nombre).
- **Simulaciones — conversión y archivado (jul 2026)**: convertir una simulación **vuelca** los datos,
  no solo crea el contenedor. `simulation_convert` crea el destino (`PurchasedTour`/`CycleFestival`, o
  nada en «concierto») y **una fecha simulada = un `Concert` real en BORRADOR** vía
  `_simulation_dump_activity`: recinto, artista (`_sim_activity_artist_id`), empresa del grupo, aforo y
  `ConcertTicketType` (`_sim_ticket_rows`, nombres únicos porque hay UNIQUE(concert_id,name) y en la
  simulación se repite «General» en Pista/Grada), invitaciones en `ticketing_payload.ticket_types`
  (de ahí las lee `_invitation_category_legacy_rows`), `ConcertCache` (`_sim_cache_rows`: los VARIABLE
  se traducen a la `config.option` de la ficha —PCT_FROM_TICKETS / PCT_FROM_REVENUE /
  FIXED_PER_TICKET_FROM— y los matices fiscales que el concierto no modela se guardan en `config`),
  `ConcertZoneAgent` (`_sim_commission_rows`, un MEDIO se espeja a tercero con
  `_ensure_promoter_for_media`), participaciones sobre **PROFIT** (`_sim_partner_share_rows`) y
  `ConcertBudgetItem` (`_sim_budget_rows`). ⚠️ En `ConcertBudgetItem`, `amount_net`/`amount_gross` son
  el **TOTAL** de la partida (así los suma la ficha); `quantity` es solo informativo — no multiplicar.
  Los gastos del contenedor `is_shared` van a `payload.general.expenses` del grupo. `sale_type`:
  GIRAS_COMPRADAS en gira, si no `_sim_sale_type` (PARTICIPADOS si hay socios de verdad).
  **Archivado**: `Simulation.status='ARCHIVED'` + `settings['converted']` {kind,target_id,target_name,
  concert_ids,at} (`_simulation_mark_converted`). El listado muestra por defecto solo las activas;
  botón **«Ver archivadas»** (`?archivadas=1`) y, en los 3 puntitos, **Archivar/Restaurar**
  (`simulation_archive`, archivar ≠ borrar). `_simulation_converted_info` resuelve el enlace a lo
  creado y avisa si ya no existe. **Si no se pudo crear NINGUNA fecha** (todas por confirmar o sin
  artista) se hace rollback: ni se archiva ni queda un contenedor vacío.
- **ASISTENTE DE PETICIÓN · tarjetas, «¿se sabe dónde?» y editarla** (ago 2026):
  · Las opciones se eligen con **TARJETAS** (`.promo-pick`, las mismas del resto de asistentes) en
  **los tres pasos que preguntan algo**: qué se pide, si se sabe dónde y **qué es quien lo pide**.
  ⚠️ Las de «quién hace la petición» eran **`.quad-chip`**… una clase que **solo existe dentro de un
  `<style>` de `cuadrantes.html`**, así que en este modal no tenía ningún estilo y se veían los radios
  en crudo, pegados unos a otros (bug real). Al reutilizar una clase, comprobar que está en
  `styles.css` y no en el `<style>` de otra pantalla.
  ⚠️ Una tarjeta puede ser `<button>` (las que saltan al asistente de promoción o de marketing): sin
  `button.promo-pick{font:inherit}` el navegador les pone su propia tipografía y se ven distintas en
  la misma fila.
  · **Lo elegido se queda a la vista con su FOTO o su LOGO** (`.pw-picked`): al elegir un recinto o
  quién pide, antes solo quedaba un «✓ seleccionado» y se perdía la imagen.
  · **Lo que se busca se crea con el «+» de al lado de la barra**, como en el resto de la app (antes
  el de «quién pide» era un enlace «No existe: crear nuevo» debajo).
  · **«¿Se sabe dónde?»**: tres tarjetas — **No todavía** · **Conozco el recinto** (buscador con foto
  y «+» para crearlo) · **Conozco la ciudad** (al escribirla salen las opciones y la **provincia se
  rellena sola**). Se guarda en `payload['place_kind']` (NONE|VENUE|CITY) y **lo que no se elige se
  limpia**: una petición no puede quedarse con un recinto de antes y una ciudad nueva.
  · **CÓMO SE ESCRIBE UN LUGAR** (punto único **`_place_label`**): **«Municipio, Provincia»** —con
  una coma, que es como se escribe una dirección, no con «·» ni otro carácter— y el **PAÍS solo si NO
  es España** («Toulouse, Occitanie (France)»): dentro no aporta nada y fuera es justo lo que hace
  falta saber. Un municipio que se llama igual que su provincia (Sevilla, Madrid) no se repite. Con
  un recinto delante queda «Recinto · Municipio, Provincia», que el recinto sí es otra cosa. Se usa
  en la ficha de la petición, en su listado (un solo dato, no dos chips) y en las sugerencias de
  ciudad.
  · **Las ciudades las da `api_city_search`** (`/api/municipios`, en `SUPPORT_READ_ENDPOINTS`): busca
  primero en NUESTROS datos (municipios de recintos y de actividades, que son pares ciudad+provincia
  ya curados y salen al instante) y solo si hay pocos pregunta a `geo_utils`, de donde la provincia
  sale del **código postal**, nunca de la comunidad autónoma que devuelve el proveedor.
  ⚠️ Se pregunta **dos veces**: sesgado a España (el 99% de lo que se pide) y, si eso no ha traído
  nada que case, el término A SECAS — así también salen las ciudades de fuera con su país. Y se
  **descarta lo que no casa con lo escrito**: el buscador de direcciones devuelve lo que tiene cerca
  aunque no se parezca («Toulouse» → Zaragoza), y en un selector de ciudades eso es ruido. Una ciudad
  muy lejana puede no aparecer (el proveedor se consulta con sesgo a España): el campo es libre y se
  escribe a mano.
  · **EDITAR una petición ya creada** con el MISMO asistente: `peticion_wizard_update`
  (`/peticiones/<id>/editar`) + `_peticion_edit_payload` (los datos que el asistente necesita) y
  punto único **`_peticion_apply_form`**, que usan crear y editar — así una petición editada queda
  exactamente como si se hubiera creado así. La edita **quien la hizo** o quien gestiona su bandeja.
  ⚠️ El payload viaja en `data-peticion-payload` con **`|tojson|forceescape`**: sin `forceescape`, la
  comilla doble corta el atributo y el botón deja de hacer nada.
  ⚠️ `_peticion_edit_payload` construye su URL con `url_for` dentro de un `try`: la fila de una
  petición se monta también fuera de una petición HTTP (un cron, un hilo) y ahí `url_for` revienta.
  · **QUIÉN LO PIDE se ve con su FOTO o su LOGO** en la ficha (`_peticion_requester_chip`, punto
  único): el que pide puede ser un tercero, una empresa, una institución, un artista, un medio, un
  recinto o alguien de la oficina, y cada uno tiene su imagen en otro sitio — antes era una línea de
  texto.
  · **El artista ya tiene algo ese día**: al elegir la fecha (y otra vez antes de crearla) se
  pregunta a **`/api/concerts/check-artist-conflict`**, el MISMO endpoint que usa el asistente de
  actividad (mira conciertos, acciones, bloqueos y notas de agenda y otras peticiones), y se dice qué
  tiene. Con las **dos opciones**: «Hacer la petición igualmente» o «No hacerla».
  · **La FICHA se gestiona desde la barra de debajo de la cabecera** (`.ficha-quick`): **Aceptar
  petición** (pop-up con las tarjetas de en qué se convierte → sigue el flujo de siempre) y **Cerrar
  petición** (pop-up que pide el motivo). Los dos módulos que había abajo se retiraron.
  · ⚠️ **CERRAR UNA PETICIÓN NO LA TERMINA**: hay que **decírselo a quien la hizo**. Al cerrarla se le
  manda un aviso (kind TAREA, `ref_type='peticion_rechazo'`) y le queda la tarea **«Notificar el
  rechazo de una petición»** en Inicio (`_home_peticion_rejections`) y en la propia ficha, con quién
  la pidió y su contacto a la vista. Al marcar «Ya se lo he comunicado»
  (`booking_request_rejection_notified` → `BookingRequest.rejection_notified_at`) la petición queda
  terminada y el aviso **se cierra solo** (`_notify_resolve`).
  ⚠️ Si la cierra la MISMA persona que la pidió no se crea aviso (no se avisa a uno mismo), pero la
  tarea y el aviso de la ficha siguen saliendo: lo que hay que hacer es lo mismo.
  · **Módulo de Inicio «Mis peticiones»** (`_home_my_peticiones` → `HOME_MY_PETICIONES`): las que ha
  hecho esa persona, con su estado, para seguirlas sin buscarlas — y con el botón de editarlas. No
  depende de ningún permiso de sección (son suyas); las resueltas hace más de 120 días no se listan.

- **PETICIONES · tres puntitos, con caché y quién cubre los gastos** (ago 2026):
  · **Tres puntitos** (editar con el MISMO asistente con el que se creó · eliminar) en la **ficha** de
  la petición —a la derecha de su barra de botones— y en el módulo **«Mis peticiones»** de Inicio. La
  ficha incluye ya el asistente (`_peticion_wizard_modal.html`), así que se edita sin salir; por eso
  la vista le pasa también `artists`. Borrar es de **quien la hizo**, de quien gestiona su bandeja o
  de dirección (lo comprueba `booking_request_delete`).
  · **«Con caché» / «Sin caché» son TARJETAS con icono** (no un interruptor). Con caché salen el
  importe y, debajo, **«¿Cubren gastos?»**: el MISMO módulo que en el asistente de actividad, ahora en
  un parcial reutilizable **`templates/_promoter_costs_module.html`** (mismos nombres de campo, así
  que lo lee el mismo `_parse_promoter_costs_form`). Se guarda en `payload['promoter_costs']`, se ve
  en la ficha («Cubren gastos: Hoteles (3 dobles) · Viáticos») y se **restaura al editar**.
  ⚠️ El módulo va marcado con **`data-pc-module`** y **sin ids**: su motor (en `scripts.js`) trabaja
  por delegación dentro de su propio módulo, porque en **Inicio conviven** el asistente de actividad
  —que trae su propia copia con ids— y el de peticiones, y con ids se pisarían.
  ⚠️ Sin caché no se pregunta y **se limpia** lo que hubiera: una petición sin caché no puede
  arrastrar unos gastos cubiertos de antes.

- **MIS PETICIONES · el rechazo se comunica EN LA PROPIA FILA** (ago 2026): el módulo de Inicio
  `HOME_MY_PETICIONES` (`_home_my_peticiones`) se lee como el de **Tareas pendientes** (foto del
  artista con `artist_avatar`, `.ctask__head`/`.ctask__facts`/`.ctask__tasks`) y una petición
  **RECHAZADA sale ahí mismo como «pendiente de comunicar»**, con sus dos botones: **Comunicar**
  (`booking_request_rejection_send`, que le escribe a quien la pidió por su canal —correo o SMS—
  con `_peticion_rejection_email_html`, y **solo si el aviso sale** marca la tarea) y **«Ya se lo he
  comunicado»** (`booking_request_rejection_notified`). Al comunicarla **se archiva y desaparece** de
  la lista (`rejection_notified_at`). El módulo aparte de rechazos (`HOME_PETICION_REJECTIONS`) se
  **retiró**: era la misma petición en otro momento de su vida.
  ⚠️ Los dos endpoints van en **`REQUEST_ANY_ENDPOINTS`**: la tarea es de **quien pidió**, que no
  tiene por qué llevar contratación (sin eso se comía un 403 al resolver su propia tarea), y cada uno
  comprueba dentro que la petición es suya. Por lo mismo, el enlace a la bandeja solo se ofrece a
  quien puede entrar en ella.
  ⚠️ Lo que hay que HACER va primero en el módulo: comunicar un rechazo es una tarea, no seguimiento.

- ⚠️⚠️ **APROBAR UNA PETICIÓN NO CREA NADA: la devuelve para CONFIGURARLA, y luego va POR FASES**
  (ago 2026). Cuando contratación aprueba (p. ej. un **evento promocional**), la petición vuelve a
  **QUIEN LA PIDIÓ** y a partir de ahí todo el trabajo es suyo. **`booking_request_approve` YA NO crea
  ningún borrador**: antes creaba un `Concert` con una fecha inventada (`today_local()`) que había que
  arreglar a mano. La actividad **la crea el asistente al terminar de configurarla**.
  Las fases son las de `PETICION_ACCEPT_PHASES` (punto único **`_peticion_accept_tasks`**, que usan el
  módulo de Inicio, la ficha de la actividad y la de la petición, así que los tres dicen lo mismo),
  **en orden y cada una bloqueada hasta que la anterior esté hecha**:
  · **1 · Configurar el evento** — mientras no exista la actividad (`concert_id`). Sale con la
  etiqueta **«Petición aprobada»** y el botón **«Configurar evento»**, que abre **el asistente de
  siempre** (`_concert_wizard_modal.html`, los mismos pasos que al añadir una actividad nueva) **ya
  cumplimentado** con lo de la petición: **`_peticion_wizard_prefill`** → `window.CONCERT_WIZARD_PREFILL`
  (artista, tipo, fecha, recinto o municipio+provincia, quien lo pidió como promotor, ¿tiene caché? y
  su importe si era un número, lo que cubre el promotor y la descripción). Al terminarlo,
  **`_wizard_link_peticion`** ata la actividad a su petición (`concert_id`) y cierra el aviso.
  · **2 · Confirmar con el artista** (la fecha y que lo quiere hacer) — `BookingRequest.artist_agreed_at`,
  endpoint `booking_request_artist_agreed`. Es una **conversación**, no un correo: se marca a mano.
  · **3 · Confirmar al promotor** — `acceptance_notified_at` (`booking_request_acceptance_send`, correo
  o SMS con `_peticion_acceptance_email_html`; solo si el aviso sale marca la fase, o
  `..._notified` para «ya se lo he confirmado»).
  ⚠️⚠️ **BLOQUEADA hasta que el artista haya dicho que sí**: no se compromete una fecha con nadie de
  fuera antes. Lo comprueba también el **SERVIDOR** en los dos endpoints (esconder el botón no basta).
  · **4 · Activar producción + Informar al artista** — LAS DOS A LA VEZ, y bloqueadas hasta la 3. El
  aviso formal al artista va **al final**, cuando ya está todo comprometido. Al activar la producción
  la actividad pasa a las tareas de **PRODUCCIÓN** y **deja de estar** en las de quien la pidió (la
  fase desaparece sola en cuanto hay responsable).
  ⚠️ Cada fase se decide mirando el **estado de verdad**, no una marca aparte, así que desaparece sola
  al hacerse (la regla de `_notify_resolve`), y con la última la fila se va del módulo.
  ⚠️ **Todas las fases son de quien la pidió**: contratación acaba su parte al aprobarla. El mecanismo
  de dueños sigue puesto (`owner`/`owner_nick`/`mine`) y lo que **no es tuyo** se ve en gris con el
  nombre de quien lo tiene. Quién es dirección se lee de `estado["role"]`, **no de `is_master()`**
  (ese saca el rol de la sesión y sin sesión cae a 10: todas las fases saldrían «mías»).
  · **Dónde se ve**: módulo de Inicio **«Actividades por cerrar»** (`HOME_ACTIVITY_PHASES` ←
  `_home_activity_phase_tasks`, en el bloque de «lo suyo»; la fila se monta con la **actividad** y,
  mientras no esté configurada, con los datos de la **petición**) · la **barra de botones de la ficha
  de la actividad** (`_concert_peticion_phases` → «El artista lo confirma» y «Confirmar al promotor»;
  activar producción e informar al artista ya tenían el suyo) · y la **ficha de la petición**, con el
  aviso «Petición aprobada» + «Configurar evento» y, después, por qué fase va.
  ⚠️ Una petición con fases pendientes **no sale en «Mis peticiones»**: está en «Actividades por
  cerrar». Ahí vuelve solo cuando ya no hay nada que hacer, como seguimiento.
  ⚠️ **Corte automático con `BookingRequest.accepted_at`**: lo aprobado ANTES de que esto existiera no
  reclama nada (mismo criterio que `PITCH_TASK_FROM`, pero sin fecha a mano).
  ⚠️ Los tres endpoints van en **`REQUEST_ANY_ENDPOINTS`**: la fase es de quien pidió, que no tiene por
  qué llevar contratación, y cada uno comprueba dentro que la petición es suya.
  ⚠️ El precumplimentado se aplica **después de `shown.bs.modal`**: los Select2 del recinto y del
  promotor se crean ahí y antes no se les puede meter nada. El payload se emite **siempre** (así el
  asistente sale cumplimentado también al pulsar el botón a mano) y `autoopen` —que lo pone
  `?configurar=1`— es lo único que decide si se abre solo al entrar.

- **FICHA DE ACTIVIDAD · pestaña «INICIO» con el proceso paso a paso** (ago 2026): la PRIMERA
  pestaña de la ficha, igual que las tareas pendientes de un proyecto discográfico. Motor
  **`_concert_task_board`** (solo se calcula en su pestaña): las **fases de la petición**
  (`_peticion_accept_tasks`) con su estado —**hecha** (con cuándo y quién), **pendiente** o
  **bloqueada** (con el motivo)— más **lo propio de la actividad** (pendiente de confirmar, sin
  contrato, pendiente de anunciar, sin activar la venta y —si no viene de una petición— activar
  producción e informar al artista), que son «del departamento» y por eso no llevan dueño.
  · **LA CAMPANITA** (`concert_task_nudge`, `POST /conciertos/<cid>/tareas/<key>/reclamar`):
  reclamar una tarea a quien la tiene. Le llega un aviso **«X te reclama una tarea · X te pide que
  por favor termines «\<tarea\>», que está pendiente»** con enlace a esta pestaña. No cambia nada de
  la actividad: solo avisa. Solo sale cuando la tarea **es de otra persona** y no está bloqueada; a
  uno mismo no se le reclama y una tarea sin dueño no se puede reclamar (se dice por qué).
  ⚠️ El endpoint va en **`SUPPORT_ACTION_ENDPOINTS`**: reclamar es transversal (lo hace producción,
  el sello, dirección…), no solo contratación.
  ⚠️ La pestaña nueva hay que añadirla a la **lista blanca de `tab`** de `concert_detail_view`: si no,
  cae en «general» y el panel no se pinta **sin dar ningún error**.

- ⚠️ **LAS PETICIONES QUE YA ESTABAN APROBADAS vuelven al proceso** (`_peticion_stub_backfill_once`,
  marca `peticion_stub_backfill_v1`, ago 2026): el aprobado ANTIGUO creaba un borrador vacío y no
  dejaba constancia de la aprobación, así que esas peticiones **no reclamaban nada** (ni «Petición
  aprobada» ni configurar el evento). El arreglo puntual **borra el borrador vacío**
  (`_concert_is_untouched_stub`: BORRADOR, sin pasar por el asistente y sin bolsa, entradas, cachés,
  contratos, cartelería, presupuesto, pagos, invitaciones ni hoja de ruta) y le sella `accepted_at`,
  con lo que la petición vuelve a «pendiente de configurar».
  ⚠️ Lo que ya está configurado NO se toca: una actividad con trabajo hecho no vuelve atrás.

- **DIRECCIÓN también tiene su módulo de tareas en Inicio** (ago 2026): en
  `_home_activity_phase_tasks`, quien es dirección (`estado["role"] == 10`) ve **todas** las
  actividades con fases pendientes; el resto, las que pidió o las que aprobó.

- **LA FICHA DE UNA PETICIÓN SE LEE COMO LA DE UNA ACTIVIDAD** (ago 2026): `ficha-hero` (foto del
  artista, antetítulo «Petición · \<tipo\> · Con/Sin caché», estado y —si ya se aceptó— «Ya es una
  actividad»; la línea de datos con iconos) + **arriba a la derecha QUIÉN LO PIDE** con su foto o su
  logo (`.hero-company`, que en una actividad es la empresa del grupo) + `.ficha-quick` con los
  botones + **pestañas servidas** (`?tab=`, `ficha-tabs`/`ficha-tabpane`) con secciones
  `.ficha-section` y la tabla compacta `psum-list psum-list--2col`.
  ⚠️ **Solo se pinta lo que corresponde a ese tipo de actividad y a cómo se configuró la petición**:
  las pestañas se construyen en `_booking_request_detail` (`tabs`) y **la que no tiene nada no
  existe** — «Económico» solo si hay importe o gastos cubiertos (una petición sin caché no la tiene) y
  «Actividad» solo cuando ya se aceptó. Un campo sin valor no se pinta (nada de huecos).
  ⚠️ Si se pide una pestaña que no existe, se cae a la primera (mismo patrón que contabilidad o la
  ficha de personal).

- ⚠️ **AL PINCHAR UNA PETICIÓN SE ABRE SU FICHA** (ago 2026): en el listado de Contratación, en las
  bandejas de departamento (Promoción/Diseño) y en «Mis peticiones» de Inicio. Para eso
  `booking_request_detail_view` deja entrar también a **QUIEN LA PIDIÓ** (antes solo a su departamento
  o a dirección, así que al pinchar la suya se comía «esta petición es de otro departamento» y volvía
  a la portada). ⚠️ En la bandeja, el menú de tres puntitos va **por encima** del `stretched-link`
  (`position-relative` + z-index) o no se podría pinchar.

- ⚠️⚠️ **UNA PETICIÓN Y SU ACTIVIDAD SON LO MISMO PARA LOS SOLAPES** (bug real, ago 2026): al editar
  una petición ya aceptada, el aviso de «ese día el artista ya tiene algo» señalaba **el propio evento
  que esa petición había creado**. `exclude_id` excluía solo el id de cada tabla; ahora
  **`_conflict_exclude_ids`** resuelve el **par** por `BookingRequest.concert_id` (en los dos sentidos)
  y `_conflict_exclude` excluye todos esos ids en conciertos, acciones, agenda y peticiones.

- ⚠️ **AL EDITAR, una cosa NO se solapa consigo misma** (bug real, ago 2026): el aviso «ese día el
  artista ya tiene…» del asistente de peticiones saltaba con **la propia petición** que se estaba
  editando. `api_concert_artist_conflicts` aplicaba `exclude_id` **solo a los conciertos**; ahora hay
  punto único **`_conflict_exclude`** y se excluye también en acciones, bloqueos/notas de agenda y
  peticiones. El asistente manda `exclude_id` con el id de `#pwRequestId` (y va en la clave de caché
  de la comprobación, que si no se quedaría la del alta).

- **Asistentes por pasos (UX)**: cuando se pincha una opción de un paso que **no requiere más datos**,
  **auto-avanzar** al siguiente paso sin pulsar "Siguiente" (menos clics). Implementado en el asistente
  de invitaciones (`invitaciones.html`, helpers `goStep`/`getStep`): pasos de artista, evento,
  "¿Para quién son?" y "Entrega". **No** aplicar en pasos **multicampo** (asistente de conciertos
  `_concert_wizard_modal.html`, alta de medios `media_outlets.html`), que conservan "Siguiente".
- ⚠️⚠️ **«Maximum call stack size exceeded» en INICIO** (bug real, ago 2026): `updateSellerCards` del
  asistente de actividad devolvía el vendedor a «Nosotros» cuando la tarjeta marcada estaba oculta,
  pero lo miraba con **`closest('.d-none')`** — y el PASO del asistente está oculto mientras no toca,
  así que SIEMPRE daba «oculta»: marcaba «Nosotros», su `change` volvía a llamar a la función… y el
  navegador petaba, **dejando sin arrancar el resto del JS de la página** (se veía en la consola de
  Inicio, donde el asistente va embebido). Ahora se mira **solo la tarjeta del vendedor**
  (`.wz-seller-card`, que llevan las cuatro) y hay un cerrojo de re-entrada. Al tocar el asistente,
  mirar la consola del navegador: un error así no se nota en la pantalla pero rompe todo lo demás.
- **Asistente «+ Actividad» — rediseño jul 2026** (`_concert_wizard_modal.html`, reescrito): cada paso
  se compone de **viñetas** `.wizard-card` (una tarjeta por bloque de preguntas) con elecciones en
  tarjetas `.activity-choice-card` (selección visual vía `initVisualChoiceCards` de scripts.js); los
  campos condicionados viven en paneles `[data-wz-panel]` y al ENVIAR se deshabilitan los inputs de
  pasos fuera de secuencia y de paneles `.d-none` (no llegan al backend). **Secuencia dinámica**
  (`stepSequence()` en el JS del parcial): **artista (PRIMER paso, data-step 12, común a conciertos y
  actividades)** · 1 tipo+modo · 2 empresa · 3 fecha/recinto (nombre
  manual SOLO con «Conozco el recinto» apagado) · 4 SOLO promocional/TV/marca/otros (descripción,
  «¿canta?» → nº canciones + repertorio vía `api_artist_wizard_meta` (SUPPORT_READ) + formación
  SOLO/PLUS) · 5 economía (viñeta SOLO para concierto: VENDIDO/EMPRESA/PARTICIPADOS, sin GRATUITO;
  en no-concierto la viñeta NO existe y la economía la decide «¿Tiene caché?» del paso 6 vía radios
  ocultos `.wizard-st-promo-radio`: Sí=VENDIDO/Con caché · No=GRATUITO) + promotor
  visual (Select2 AJAX sobre `api_search_commission_entities`: terceros **y medios**; un medio se
  espeja a tercero con `_ensure_promoter_for_media`; hidden `promoter_id`/`promoter_media_id`) +
  sociedades en tarjetas (+ «Nueva sociedad» inline → `new_promoter_company_name`, la crea el wizard) +
  **socios y comisionistas en este mismo paso** (pregunta Sí/No; cada fila con buscador mixto
  terceros+MEDIOS con foto (`wizardInitEntitySearch`) — hidden `wizard_partner_kind[]`/`wizard_zone_kind[]`,
  espejo de medios vía `_resolve_wizard_entity_rows` —; zona `#wizardPartnersZone` oculta en
  no-concierto GRATUITO) · 6 caché (pregunta **«¿Tiene caché?»** Sí/No que despliega cachés+pagos con
  pendiente en vivo y botón «cantidad restante» — por defecto Sí solo en VENDIDO —; «El promotor cubre
  otros gastos»: `PROMOTER_COST_ITEMS`/`_parse_promoter_costs_form` → `promoter_costs_payload`
  `{enabled, items:[{key,label,note,managed_by US|PROMOTER,max_amount}]}`) · 8 entradas
  (`entry_mode` FREE→aforo+«Aforo libre»(no_capacity) / SALE→vendedor `ticketing_payload.sale_seller`
  {kind US|PROMOTER|VENUE|THIRD,...}, tipos `wt_*`→`ConcertTicketType` reales +
  `ticketing_payload.ticket_types` [{name,price,qty_for_sale,invites_total}], invitaciones
  `invitations_mode` BY_TYPE/TOTAL→`invitations_json` (las materializa `_invitation_category_legacy_rows`),
  salida a la venta+TBC) · 9 equipamiento visual (omitido si el artista no canta en promocionales) ·
  10 gira/ciclo + # (chips `initConcertTagManager` name=`concert_tags[]` + sugerencias del artista y
  dedupe acento-insensible contra `all_concert_tags`) · **penúltimo = cartelería** (data-step 7:
  nosotros/promotor y «solicitar ahora» con formatos gráficos `ARTWORK_FORMAT_CHOICES` **+
  personalizados** (`_parse_artwork_formats`: chips `artwork_formats_custom[]` del wizard o texto por
  comas `artwork_formats_custom_text` de la ficha) → `ConcertArtworkRequest.requested_formats`,
  «otros logos» `artwork_logo_others` → `logo_notes`, **fecha máxima de entrega OBLIGATORIA**
  (validada en JS; en la ficha `required` al elegir OURS) + correo a diseño automático, o «no
  solicitar ahora») · último (11) = **estado** visual + anuncio (TBC/fecha/no anunciar + nota →
  `contracting_payload.announcement_note`). ⚠️ `initVisualChoiceCards` (scripts.js) NO togglea
  manualmente checkboxes dentro de `<label>`: el label nativo ya lo hace y el doble toggle los dejaba
  como estaban (bug real de los gastos del promotor). Detalle promocional en `contracting_payload.description`
  y `.performance` {sings, songs_count, songs:[{id,title}], formation_kind, formation_text}.
  **Ficha a juego**: `concert_section_update` acepta además `actividad` y `entradas` (los tipos parten
  de los ConcertTicketType reales vía `_concert_entradas_ticket_rows`; `_replace_concert_ticket_types_manual`
  NUNCA toca los espejados de Enterticket); `caches` guarda los gastos del promotor **solo si** llega
  `promoter_costs_present` y `datos` el anuncio **solo si** llega `announcement_present` (para no pisar
  desde forms antiguos). `_concert_contracting_general_rows` pinta los payloads nuevos con etiquetas
  legibles. Los formatos solicitados se ven en la pestaña Cartelería, en la página pública de diseño
  y en el correo. **Recintos con país**: `Venue.country` (default España) en alta rápida, /recintos
  y ficha.

- **Mapa de butacas del recinto (diseñador, pestaña Ticketing)**: `VenueSeatMap.layout_json`
  paramétrico (secciones grid/arc/box/floor/points) editado por `static/js/venue_map.js`; motor puro
  espejo en `seatmap_calc.py` — ⚠️ paridad OBLIGATORIA `secRows` (JS) ↔ `expand_section` (Python) ↔
  `VenueMapGeom`, y `rowLabelOf` ↔ `seat_lookup`. Etiquetas de fila: `rowStart`/`rowScheme` y
  **`rowDir:'desc'`** (la fila `rowStart` es la de ABAJO del dibujo — para calcar planos donde la F1
  está delante sin espejar la grada; selector «Filas» del panel). **Importar desde Excel**: botón
  «Importar Excel» de la barra → `POST /recintos/<vid>/mapa/importar-excel`
  (`venue_seatmap_import_xlsx`, solo parsea, no almacena) → motor puro **`seatmap_import.py`**:
  celda con número = butaca con ESE número; blanco = hueco (columnas) / pasillo `rowSeps` (filas
  vacías); merges de cabecera → nombre del bloque + «SECTOR N» en `aliases`; `F16…` → etiquetas de
  fila; numeración por fila si el patrón aritmético encaja (`num`/`rowNums`) y si no
  **`numOverrides` exactos — NUNCA interpolar**; merges grandes con texto sin números (PALCO VIP) →
  `floor` cap 0; merges vacíos = decoración (ignorar). El JS (`applyImportedPlan`) convierte los
  bloques en secciones grid conservando la composición de la hoja, los deja seleccionados y cada
  importación AÑADE bloques (varios archivos → un recinto). Verificado 1:1 con un plano real de
  11.968 butacas. **Barra**: la herramienta Seleccionar y los botones Importar Excel/Subir plano
  van en la barra de añadir (`data-vm-addbar`). **Barridos en tiempo real**: todo arrastre que
  hit-testea con `elementFromPoint` (seleccionar/pintar/retocar/numerar/zonas) debe recorrer el
  camino completo del puntero con **`pointerPath(e, drag)`** (eventos coalescidos + interpolación;
  sembrar `lastPt` al crear el drag) — si no, los gestos rápidos se saltan butacas (mismo patrón
  aplicado al seleccionar invitaciones en `invitaciones.html`). **Selección de sectores en grupo**
  (herramienta Seleccionar): pinchar un sector y barrer añade piezas a `dselO` (drag
  `secselpaint`; bgimage/outline excluidos), pinchar una ya seleccionada mueve el conjunto, y con
  ≥2 aparece el tirador `data-rotate="SELO"` que gira todo el grupo alrededor del centro común
  (rama `rotate`/`rmode:'group'`; arcos → `cx/cy`+`dir`). **«Guardar mapa» sale del modo edición**
  (redirige al visor `?tab=ticketing&map=<id>` sin `map_edit`): las herramientas de edición solo
  se ven editando; el visor enseña categorías a la izquierda + navegación.

- **FORMATO del recinto que usa cada ACTIVIDAD** (`Concert.seat_map_id`, ago 2026): un recinto puede
  tener varios formatos («Formato 360», «Escenario central»…) y hasta ahora todo tiraba del principal
  (`_venue_seatmap_default`), así que una fecha con otra disposición casaba las butacas contra el mapa
  equivocado. Punto ÚNICO **`_concert_seatmap(session_db, concert)`** (el elegido si sigue siendo de su
  recinto; si no, el principal), usado por los TRES sitios que casan butacas: el visor de invitaciones
  del evento, el **asignador** sobre el plano completo y el **plano en vivo** de Enterticket. Selector
  en la pestaña Ticketing **solo si el recinto tiene más de un formato** (`concert_seat_map_save`); con
  uno solo no se pregunta nada.
- **Plano en vivo: lo que queda A LA VENTA por categoría**. `_et_venue_map_payload` arranca del reparto
  del propio mapa del recinto y **encima** apila las butacas vendidas/invitadas, así que lo que sigue
  libre se ve **con el color de su categoría** y la leyenda dice cuántas quedan de cada una (`on_sale`).
  ⚠️ El orden de los rangos IMPORTA: dentro de una fila, `venue_map.js` deja ganar al **último**, y por
  eso las sintéticas van al final. ⚠️ La copia del reparto es **profunda** (`json.loads(json.dumps(...))`):
  apilar sobre `assignments_json` del objeto ORM ensuciaría el mapa guardado del recinto en el flush.
  Butaca→categoría lo da **`seatmap_calc.seat_categories`** (espejo del bloque `assign` de
  `venue_map.js`: mantener los dos a la par, como `expand_section` ↔ `secRows`).
  ⚠️ **Los BLOQUEOS de Enterticket no se pueden pintar**: `/bloqueos/:id` los da como contador
  (concepto/nombre/código) **sin sector/fila/asiento** (comprobado contra la API real). Se enseña el
  número con la explicación, no se inventa una butaca.

- **Integración Enterticket (ticketing en tiempo casi real)**: cliente HTTP en `enterticket_utils.py`
  (credenciales `ENTERTICKET_USER/PASSWORD` en `.env`; sin ellas TODO desactivado). ⚠️ La API solo
  admite **UN token activo por cuenta** → se comparte en BD (`EnterticketMeta` id=1) y `_et_call`
  relee BD antes de re-autenticar (varios workers). Espejo local en `models.py`
  (`EnterticketEvent` —catálogo + vínculo a concierto, estados PENDING/LINKED/IGNORED/REQUESTED—,
  `EnterticketTicketType`, `EnterticketSale` —cada entrada con comprador/importe/sector/asiento—,
  `Buyer`/`BuyerEvent` —compradores deduplicados por email—, `ensure_enterticket_schema`).
  Sync incremental (`_et_sync_event`: detalle + ventas nuevas por `desde_id` + cambios por `updated`
  + bloqueos + recomputo de compradores) disparado al abrir la pestaña Ticketing (>10 min), por el
  polling JS (60 s → `concert_et_status?sync=1`), botones «Actualizar» y cron externo
  `/cron/enterticket/refresh?key=ENTERTICKET_CRON_KEY` (acepta la de Chartmetric). **Matching**
  artista+recinto+fecha (`_et_automatch_candidates`; auto-vincula solo con score ≥4 sin empate); al
  vincular se crea/actualiza la ticketera «Enterticket» del concierto (`ConcertTicketer.sale_url`
  nuevo + aforo). Evento ET sin correspondencia → botón en Integraciones crea **petición a
  Contratación** (`_et_create_booking_request`, BookingRequest con payload ET). UI: panel
  `templates/_et_ticketing_panel.html` en la pestaña Ticketing (KPIs, barra por tipo `.et-bar`,
  gráfico de evolución vía `#chartModal`, compradores, plano en tiempo real reutilizando
  `venue_map.js` + `seatmap_calc` con categorías sintéticas Vendida/Invitación), página
  `/compradores` (`databases.buyers`, agrupada por eventos + CSV) y pestaña Enterticket en
  Integraciones (estado/acciones, solo dirección).
  ⚠️ **La lista de Integraciones solo enseña los eventos POR VENIR**: uno ya celebrado no hay que
  vincularlo ni pedirlo. Los que estaban vinculados **siguen vinculados** y sus ventas se ven en la
  pestaña Ticketing de su actividad; abajo se dice cuántos hay ocultos (`et_past_count`). Manda
  `event_end_date` cuando la hay (un festival de varios días sigue vivo hasta el último), y los que
  no tienen fecha se conservan (no se puede dar por pasado lo que no se sabe cuándo es). ⚠️ Los ya
  vinculados se descartan del selector «vincular con otro concierto» mirando **todos** los eventos,
  no solo los futuros: si no, una actividad enlazada a uno pasado se ofrecería otra vez.

- **TELÉFONOS · EL PREFIJO DEL PAÍS SE PONE AL GUARDAR** (ago 2026). Un teléfono escrito
  «600111222» no vale para mandar nada (a una pasarela de SMS —o a WhatsApp— hay que darle el
  número internacional), y uno que llega «34600111222» —así los manda **Enterticket**— tampoco,
  porque le falta el «+». Pedirle a cada pantalla que se acuerde no funciona (hay veinte
  formularios con un campo de teléfono), así que se hace en UN sitio: **al guardar**.
  · **`_phones_before_flush`** (listener `before_flush` de `SessionLocal`) recorre lo que se está
  escribiendo y deja los campos de teléfono en formato internacional con
  **`sms_utils.normalize_phone`**, el punto único de «cómo se escribe un teléfono». Los campos de
  cada modelo están en **`_PHONE_TEXT_FIELDS`** (y `_PHONE_LIST_FIELDS` para los móviles del
  personal, que son una lista JSONB): **un campo de teléfono nuevo hay que añadirlo ahí**.
  ⚠️ **Nunca se pierde lo que escribió una persona**: si el valor no es un teléfono creíble (dos
  números en el mismo campo, una extensión, «pendiente»…) se queda TAL CUAL. Normalizar es para
  poder usarlo, no para borrar información.
  ⚠️ **Los INSERT «a pelo» (Core) NO pasan por el listener**: el único que hay es el alta de
  compradores de Enterticket (`_et_recompute_buyers_for_event`), que normaliza el teléfono él mismo.
  Si se añade otro `insert()` de Core con un teléfono, hay que llamar a `_normalize_phone_value`.
  ⚠️ `normalize_phone` reconoce ahora también los **fijos** (9 dígitos que empiezan por 8 o 9):
  antes un «912345678» salía como «+912345678», un prefijo de otro país. Y quita los decimales que
  deja Excel («638123456.0»).
  · **Relleno puntual** `_phones_normalize_backfill` (marca `phones_e164_backfill_v1`, corre una vez
  en el arranque): pone el prefijo a lo que ya estaba guardado, tabla por tabla y con un CURSOR por
  `id` —no con LIMIT a secas, porque los números que no se pueden normalizar volverían a salir en la
  misma tanda eternamente—.

- **COMPRADORES · listados, categorías, importación a mano y ENVÍOS** (ago 2026). La base de
  compradores tiene ya dos orígenes y los dos se ven y se trabajan igual («listados»):
  · un **evento de Enterticket** (se alimenta solo de sus ventas), y
  · un **listado subido a mano** (`BuyerList`), vinculado a una actividad nuestra.
  Punto único **`_buyer_source`** (resuelve cualquiera de los dos a la misma forma) +
  `_buyer_sources_list` (la rejilla, con el icono que dice de dónde sale cada uno).
  ⚠️⚠️ **Un listado a mano NO se guarda como un evento de Enterticket**, a propósito: ese espejo es
  el que alimenta la pestaña Ticketing y el Resultado de la actividad, y meterle filas que no son de
  ET haría que la app diera por REAL una venta que no existe. Por eso `buyer_events.event_id` pasa a
  ser NULL-able y hay `buyer_events.list_id` (el origen es UNO de los dos).
  · **CATEGORÍAS de entrada** (`BuyerEvent.categories`, JSONB): en ET las calcula
  `_et_recompute_buyers_for_event` con **una** consulta agrupada; en un fichero salen de su columna.
  Con eso se **filtra y se ordena** el listado y se elige a quién va un envío. Solo se ofrecen las
  categorías que de verdad hay (un filtro que no puede devolver nada solo hace ruido, la misma regla
  que los tipos del calendario de agenda) y cada una lleva **su icono** (`_buyer_category_icon`:
  pista, grada, palco, abono, invitación…).
  · **Filtros** (`BUYER_FILTER_DEFS`) y **orden** (`BUYER_ORDER_DEFS`) como chips con icono; el
  filtrado es un punto único, **`_buyers_apply_filters`**, que usan la pantalla, el contador del
  envío y el propio envío: **el número que se ve antes de mandar es exactamente a quién se le
  manda**.
  · En la **rejilla de listados** cada uno enseña sus compradores y **cuántos tienen email y cuántos
  teléfono** (nada de recaudación ni de entradas: lo que hace falta saber ahí es a cuántos se les
  puede mandar algo).
  · **Una sola fila arriba** (`.bl-bar`): a la **izquierda lo que hay** —compradores · entradas ·
  **cuántos tienen email** · **cuántos tienen teléfono**, con el icono en el **AZUL de la marca**
  (`--brand-accent`; ⚠️ el «verde de la casa» **es ese azul**: no hay ningún verde corporativo, y el
  verde de Bootstrap es el de «aprobado»)— y a la **derecha «Ordenar» y los filtros**.
  ⚠️ **Aquí NO se enseña recaudación** (ni el total, ni el importe por comprador, ni el orden por
  importe): esta pantalla es de personas. El dinero se ve en Ventas y en el Resultado.
  · Los números son **de lo que se está viendo** (con los filtros puestos) y los de email/SMS dicen
  **a cuántos se les puede mandar**: mismo criterio (`_buyer_has_email_cond` /
  `_buyer_has_phone_cond`) que el total del envío y que el envío, así que no pueden discrepar.
  · **«Ordenar» es UN control** (`.bl-drop` con las opciones dentro, cada una un enlace).
  · **Las CATEGORÍAS son UN SOLO filtro** (`.bl-drop`, en la fila de filtros): se abre y se
  **desmarca lo que no se quiera ver** (marcada = se ve), no una fila de chips.
  ⚠️ **Tenerlas TODAS marcadas es no filtrar**, y así se normaliza en la vista: si no, un comprador
  **sin ninguna categoría** desaparecería del listado por estar «todas» seleccionadas.
  ⚠️ No es un desplegable de Bootstrap a propósito: el ayudante global de desplegables los crea con
  `autoClose` y les teleporta el menú al `<body>`, así que cualquier clic dentro —y aquí hay
  casillas— lo cerraría (el mismo motivo por el que «Compartir» de una playlist es un pop-up).
  · **Los botones van TODOS en la misma fila que el buscador** (el buscador a la izquierda, ellos a
  la derecha con `flex-row-reverse`, así que el primero del HTML es el de más a la derecha): Envío de
  SMS (`btn-primary`, el rojo de la casa) · Envío de Email (**`btn-accent`**, el azul de la marca,
  clase nueva) · Añadir desde fichero (`btn-success`) · Exportar (`btn-secondary`). **Sin viñeta
  propia**: integrados, para que quede compacto. La **flecha de volver** va en su propia barra arriba
  a la izquierda (`.btn-volver`), como en el resto de la app.
  · **EN NOMBRE DE QUIÉN sale el envío** (`BuyerCampaign.sender_kind` COMPANY|CYCLE + `cycle_id`):
  punto único **`_campaign_brand`**, que decide **a la vez** el logo del correo y el remitente del
  SMS (para que no puedan decir cosas distintas).
  ⚠️ **No se pregunta si no hay nada que elegir**: si la actividad ya tiene su empresa del grupo, sale
  esa y ya. La pregunta aparece **solo cuando la actividad es de un CICLO o FESTIVAL propio**
  (`Concert.cycle_festival_id`, lo resuelve `_buyer_source_cycle`), y entonces son **dos**: el
  **ciclo** (marcada por defecto: es el nombre que la gente reconoce) o la **empresa del grupo que lo
  organiza** (`CycleFestival.managing_company_id`, y si no la tiene, la que promueve la actividad).
  Si la actividad **no tiene empresa puesta** sí se ofrecen todas, que si no no habría con qué firmar.
  El correo lleva el logo de lo que se marque. El nombre abreviado del ciclo es
  **`CycleFestival.sms_sender`** y, si no lo tiene, **se pone desde el propio pop-up**
  (`buyers_campaign_sender_save`, mismo límite de 11 caracteres) y queda guardado en su ficha.
  ⚠️ El ciclo se comprueba **contra el de la actividad del listado**: el formulario no puede firmar
  un envío en nombre de un ciclo que no es el suyo.
  ⚠️⚠️ Quien manda se elige con **TARJETAS con su logo**, no con un `select`: dentro de este pop-up
  el Select2 **no se podía abrir** (en un modal apilado el desplegable se queda detrás), así que se
  veía el logo de la empresa y **no había forma de cambiarla** — bug real. Para elegir algo dentro de
  un modal de esta app, tarjetas. `channel=` añade lo que ese canal necesita (un SMS sin teléfono no se puede mandar) y se
  dice cuántos se quedan fuera por eso.
  · **IMPORTAR UN FICHERO** (`buyer_import.py`, motor puro): el **mismo lector** que la importación
  de terceros (`promoter_import.read_rows` / `parse_columns`, refactorizados para compartirlo), que
  ya sabe de cabeceras desplazadas, rótulos como «N.º de teléfono» y números que Excel escribe con
  decimales. Lo único propio es a qué campos de un comprador se puede volcar una columna. Pasos:
  fichero → columnas (con un EJEMPLO de cada una, las que no se reconocen en ámbar, y «Omitir esta
  columna» para lo que no haga falta) → resumen → importar.
  ⚠️ **NO SE DUPLICAN COMPRADORES**: se identifican por su **email** y, si no lo traen, por su
  **teléfono** (`buyers.email` deja de ser obligatorio y hay índice único parcial por teléfono
  cuando no hay correo). A quien ya está **solo se le COMPLETA lo que tiene vacío**; lo que ya está
  escrito no se pisa nunca.
  ⚠️ Un fichero de ticketera trae **UNA FILA POR ENTRADA**: `_buyer_import_group` agrupa por
  comprador sumando entradas e importe y juntando categorías. Y las entradas de un comprador en un
  listado se **ESCRIBEN**, no se suman a lo que había: **reimportar el mismo fichero deja lo mismo**
  (comprobado) en vez de inflar los números.
  ⚠️ Una fila **sin email y sin teléfono** no se importa (no hay a quién escribirle ni con quién no
  duplicarla) y **se dice cuántas** se han descartado, no desaparecen sin más.
  · **Un listado NUEVO** para una actividad que no sale: artista o evento (con su foto, los activos
  primero y el resto tras «Ver más») → sus actividades (`buyers_subject_activities`) → el fichero.
  Un listado por actividad: si ya lo tiene, se reutiliza.
  · **ENVÍOS (SMS y correo)**: `BuyerCampaign` + `BuyerCampaignRecipient`. El **correo** lo firma la
  empresa del grupo que **promueve** (`_buyer_source_company`: `group_company_id` → la que factura →
  su participación): logo arriba a la **derecha**, el **título** centrado debajo, el **texto**, el
  **botón** (nombre + enlace) justo debajo a la derecha y los **adjuntos** al final. En el **SMS** el
  remitente ES esa empresa (**`GroupCompany.sms_sender`**, «nombre abreviado para SMS», que se pone
  en su ficha con el MISMO límite que el remitente general —11 caracteres, `sms_utils.sender_is_valid`—
  y se puede dejar vacío, porque en España un remitente con letras hay que registrarlo).
  ⚠️ La **previsualización y el contador los compone el SERVIDOR** con el mismo código que el envío
  (`_campaign_email_html` / `_campaign_sms_preview`), así que lo que se ve es lo que sale y **no hay
  una segunda versión en JS** del GSM-7, los acentos y los trozos (eso es de `sms_utils`).
  ⚠️ El **enlace que se escribe** se cuenta **acortado si es nuestro** y con su longitud REAL si es
  de fuera (el acortador solo acorta lo de casa): contar siempre 38 caracteres haría que el contador
  mintiera justo con el enlace de una ticketera. El de los **adjuntos** sí es siempre nuestro, así
  que se cuenta con la longitud exacta de un enlace corto aunque todavía no exista (se crea al
  enviar). Si el mensaje ocupa **más de un SMS** se avisa, se dice cuántos son en total y hay que
  **aceptarlo** para poder mandar (`max_segments=0` en el envío: ahí ya no se recorta).
  ⚠️ En un SMS **no se puede adjuntar nada**: los adjuntos van a una página nuestra
  (`public_campaign_files`, `/envio/<token>`, con sus `og:` para la previsualización del móvil) y su
  enlace se acorta. En el **correo** van como imágenes y enlaces DENTRO del mensaje, no como ficheros
  pegados: mandar el mismo PDF a miles de direcciones es la forma más rápida de acabar en spam.
  ⚠️ **Un envío a miles de personas no cabe en una petición**: se guardan los destinatarios y se
  manda por tandas de ~45 s. La primera va en la petición (para ver al momento los errores de
  verdad) y el resto en un **hilo en segundo plano** (`_campaign_send_bg`), con la pantalla
  preguntando cómo va (`buyers_campaign_status`). Cada destinatario queda marcado en cuanto se le
  manda, así que si el hilo muere (un despliegue) se sigue con «Seguir enviando» y **nadie recibe dos
  veces**.
  ⚠️ El **tope diario de SMS** (Integraciones → SMS) se respeta: al llegar, el envío **se para y lo
  dice** con cuántos quedan, en vez de marcar a nadie como «no le llegó».
  · UI: `compradores.html` + `_buyer_import_modal.html` + `_buyer_campaign_modal.html` +
  `static/js/buyer_import.js` + `static/js/buyer_campaign.js`, estilos `.bl-*` / `.bi-*` / `.bc-*`
  (la zona de arrastrar y la tabla de columnas reutilizan las `.pi-*` de la importación de terceros).
  · **ANTES DE MANDAR SE PRUEBA**: botón «Enviar una prueba» en el pie del pop-up, que abre el suyo
  encima (`buyers_campaign_test`): se ponen uno o varios correos o teléfonos a mano **o se cogen de
  la base** —terceros, personal de la oficina y artistas— con **`buyers_campaign_contacts`**, que
  devuelve con qué se puede contactar a cada uno. Se manda **exactamente lo compuesto** (el mismo
  payload que el envío, con «[PRUEBA]» en el asunto).
  ⚠️ La prueba **no toca la campaña de verdad**: no crea destinatarios ni marca a nadie. Se guarda
  como envío con `status='PRUEBA'` porque hace falta una fila para la página de los adjuntos y porque
  lo que sale de la casa no puede ser invisible.
  ⚠️ Un **artista no tiene correo propio**: se abre en las personas que reciben sus avisos
  (`ArtistNotificationContact`) y en sus integrantes, que es a quien de verdad se le puede mandar.
  ⚠️ De qué listado se abre cada pop-up y con qué canal se decide **EN EL CLIC** (`data-bi-scope`,
  `data-bc-channel`), no en `shown.bs.modal`: con `modal_stack.js` por medio ese evento no siempre
  llega (bug real ya apuntado en esta guía).

- **Contratación · pestañas, tareas y contadores** (rediseño ago 2026): la barra de pestañas es un
  parcial único (`templates/_contracting_tabs.html`) que va **POR ENCIMA del título** de cada
  pantalla, con la estética sobria de Discográfica (`nav-tabs`, subrayado de marca, clase
  `.contract-tabs`) **+ un icono por pestaña**. **Peticiones es la PRIMERA**. Uso:
  `{% set contracting_tab = 'conciertos' %}{% include '_contracting_tabs.html' %}` (con `set`, no
  con `with`: así la clave sigue disponible para el módulo de tareas).
  **El número de cada pestaña son las ACTIVIDADES que tienen algo pendiente** (no las actividades
  totales ni las tareas sueltas: una actividad a la que le faltan el contrato, el anuncio y mandarla
  a producción cuenta UNA). Se recalcula en cada carga y **cuadra con las filas** que se ven en el
  módulo, que es una por actividad. Motor único `_contracting_tasks_data()` (cacheado en `g`, inyecta
  `CONTRACTING_COUNTS` + `CONTRACTING_TASKS`); qué es una tarea, por actividad VIVA: sin confirmar ·
  confirmada sin contrato (`ConcertContract`) · confirmada sin anuncio (ni `announcement_date` ni
  `do_not_announce`) · confirmada sin mandar a producción (sin `WorkflowBag`, y solo si le toca
  `_concert_needs_production`). El **dinero pendiente NO es tarea de la actividad**: por facturar y
  por cobrar son tareas de **Facturación** (ahí sí cuentan las fechas pasadas). Las peticiones
  abiertas son las tareas de **Peticiones**. Se filtra por los **artistas asignados** del usuario
  (sin artistas asignados, o dirección, se ve todo). Una actividad que sale en dos pestañas (p. ej.
  un concierto de un ciclo) genera la tarea en las dos: `_contracting_activity_tabs`.
  **Una fila por ACTIVIDAD, con TODAS sus tareas dentro** (`row["tasks"]`,
  `_contracting_task_badge`). Cada actividad ocupa
  **DOS líneas** y va **enmarcada** (`.ctask`, con fondo alterno) para que al ver varias seguidas se
  distinga dónde acaba una: arriba la IDENTIDAD en este orden —de quién es (artista o EVENTO, con su
  foto) · qué es (con icono de `QUAD_ACTIVITY_ICONS`) · fecha · nombre del festival si lo hay ·
  municipio · provincia · recinto—, y abajo sus tareas como etiquetas. `templates/peticiones.html`
  usa la misma forma. ⚠️ En una actividad de EVENTO manda el **evento** (nombre y logo), no el
  artista espejo; los eventos se cargan de golpe, no uno por fila.
  ⚠️ El CSS del marco lleva `.list-group-flush > .ctask.list-group-item` a propósito: Bootstrap pone
  `border-width: 0` en los items de una lista «flush» y con solo `.ctask` gana Bootstrap — las filas
  se quedaban sin marco, que es justo lo que se quería arreglar.
  **Cada pestaña se abre con el módulo «Tareas pendientes»** (`templates/_contracting_tasks.html`,
  clases `.ctask*`), con la estética que tenía el módulo de peticiones (tarjeta + filas de lista);
  **debajo** va el filtro propio de la pestaña con su número: artistas (Conciertos y Otras
  actividades), giras, festivales/ciclos o eventos. El **módulo de peticiones desapareció de
  Conciertos**: la pestaña Peticiones lo hereda (mismo aspecto, con el menú de acciones por fila).
  ⚠️ La fila es un enlace que ocupa todo (`stretched-link`): dentro no se marca nada con
  `data-artist-link` (quedaría debajo y el clic no llegaría); los botones llevan `.ctask__actions`
  (z-index por encima).
- **El asistente «+ Actividad» admite ARTISTA o EVENTO**: primer paso «¿De quién es la actividad?»
  (`subject_kind` ARTIST|EVENT). Con EVENTO se busca en `api_search_events` o se crea al momento con el
  `+` (`data-quick-create="event"`), y `concert_wizard_create` espeja el evento como artista
  (`_ensure_artist_for_event`) y guarda `Concert.event_id`. Los espejos de evento se filtran de los
  selectores de artista (asistente, /conciertos, Inicio). En los **calendarios** los eventos salen como
  si fueran artistas (el espejo lleva nombre y logo del evento); en el selector del botón + de la
  agenda solo aparecen los que tienen algo activo, y al elegir uno el asistente se abre ya en modo
  EVENTO.
- **Pestaña EVENTOS = actividades agrupadas por evento** (`_render_event_activities` +
  `templates/eventos.html`): funciona como la de Conciertos pero por EVENTO (un evento no tiene
  artista): rejilla de eventos con su nº de actividades → sus actividades, filtro Activas/Todas. Las
  actividades con `Concert.event_id` se excluyen de la pestaña de Conciertos (query y rejilla de
  artistas). Los CONTENEDORES de evento (`CycleFestival` kind EVENTO) siguen en
  `?section=eventos&contenedores=1`.
- **Punto de empate de una actividad** (`_concert_break_even_info`, en la pestaña **Resultado**, que es
  donde se enseña): manda **lo que ponga contratación a mano** (`Concert.break_even_ticket`); si no, los
  **gastos CONSOLIDADOS de la bolsa** (`_concert_bag_expense_totals`, se actualiza solo según se
  consolidan); y si no, el **presupuesto** (`ConcertBudgetItem`). Se calcula con el mismo motor que
  el Resultado (`_concert_build_calc_data` + `sim_calc`, sustituyendo la producción). Bajo el número se
  dice con qué base está calculado. ⚠️ El **aviso amarillo salta SOLO si el de contratación NO cuadra**
  con el calculado (`mismatch`): si coinciden, o si nadie lo ha puesto a mano, no se avisa de nada. Sin
  ticketing ni previsión de ingresos no se muestra nada.
- **PROMOCIÓN · UNA sola pantalla** (ago 2026): la pestaña «Peticiones» desapareció como pestaña y es
  un **módulo arriba** que **solo se ve si hay peticiones pendientes**. Debajo, las promociones
  **activas de la más próxima en adelante** (`_promo_sort_and_subject`: primero lo que viene, y lo
  pasado detrás, de lo más reciente hacia atrás; la fecha sale de sus ENTREVISTAS con
  `_promo_dates_map`, en UNA consulta para todo el listado).
  · Botón de **solo icono** «Ver por artistas» (`?vista=sujetos`): rejilla de artistas, giras,
  eventos y festivales **con promociones activas**, con su foto y su número; al pinchar uno se ven
  solo las suyas (`?sujeto=<id>`). Las de una canción o un disco se agrupan por SU ARTISTA.
  · Las **archivadas** con `?archivadas=1` (el botón conserva la vista y el sujeto en los que estés).
  ⚠️ `promo_view` sigue admitiendo `?tab=activas|archivadas` por los enlaces antiguos.

- **PROMOCIÓN · la ficha se lee como la de una ACTIVIDAD** (ago 2026): misma cabecera
  (`ficha-hero` con foto redonda del artista —clicable con `data-artist-link`—, «eyebrow» de lo que
  es, título + **etiqueta de estado que se pincha** para cambiarlo, `ficha-hero__facts` con iconos y
  la **empresa que factura** arriba a la derecha con su logo) y misma tabla compacta en Información
  (`psum-list psum-list--2col`). Cancelar sigue aparte, dentro del propio desplegable del estado,
  porque avisa a quien la produce.
  · **La FECHA sale de las entrevistas** cuando la promoción no lleva fechas propias
  (`_promo_dates_label`): antes ponía «Sin fechas» teniendo día. Mismo punto único que usa la
  previsualización del enlace.
  · **El MEDIO se enseña solo si es UNO** (`_promo_single_media_label`): con varios ya no identifica
  nada. Lo usan la cabecera y la previsualización.
  · **Previsualización al compartir la hoja de ruta** (`public_roadmap_view`): «**Hoja de ruta
  Promoción · \<artista\>**» y debajo el nombre de la promoción, la fecha y —si es un solo medio— el
  medio. Sin nombre, solo la fecha. ⚠️ `Promotion` **no tiene relación `activities`**: sus
  entrevistas se consultan (`PromotionActivity.promotion_id`).
  · **Si lo que se promociona es EL ARTISTA no se vuelve a preguntar cuál**: ese paso del asistente
  se salta con **`data-sw-skip="1"`** (dimensión nueva de `step_wizard.js`, independiente de
  `data-sw-mode`) y el sujeto se apunta solo con el artista ya elegido.
  · **La empresa del grupo se elige con su LOGO** (`select-with-thumbs` + `data-logo`), en el
  asistente de promoción, en el de marketing y en la ficha.
  ⚠️ **El asistente de promoción se incluye en TODAS las bandejas** (pedir promoción lo puede hacer
  cualquiera): sus datos NO pueden depender de estar en la de Promoción o, al marcar «requiere
  logística», la lista de producción sale VACÍA (bug real). Y si NADIE tiene el departamento
  «Producción», `_production_people` ofrece a todo el personal: mejor eso que un panel sin nadie.

- **MARKETING ≠ PROMOCIÓN** (ago 2026). Eran la misma pantalla y se confundían:
  · **Marketing** = campañas **de pago** (radio, TV, digital, exterior, influencers…). Sección
  `promocion` → `/marketing`, asistente `_promotion_wizard_modal.html` («Nuevo marketing», botón
  **«+ Marketing»**). Su «acción concreta» **materializa la acción** (`_marketing_seed_action`:
  `PromotionActivity` con `activity_kind='MARKETING'`, pendiente de consolidar) — antes creaba el
  contenedor vacío y no había nada que gestionar. El sujeto **GIRA ya se elige** de las
  `PurchasedTour` reales (antes era texto libre con `source_id=None`: la campaña quedaba huérfana y
  no salía en ninguna ficha) y hay sujeto nuevo **CICLO** (`CycleFestival`). Panel
  `_promotion_entity_panel.html` (contexto único **`_promotion_panel_context`**) en artista, canción,
  disco, concierto y, nuevo, en la pestaña **Marketing** de gira y ciclo/festival/evento.
  · **Promoción** = **prensa**: entrevistas, junts de prensa, phoners. Sección `promo` →
  `/promocion-peticiones`, con tres pestañas (Peticiones · Promociones · Archivadas).
- **PROMOCIÓN de prensa** (`Promotion.kind='PROMO'` + `PromotionActivity.activity_kind='PROMOCION'`;
  comparte tablas, bolsa y hoja de ruta con Marketing). Endpoints **`promo_*`** (URLs
  `/promocion-prensa/…`): ⚠️ `promo_` NO es `promotion_`, y por eso heredan solos el permiso de su
  sección en `_resolve_request_resource_key`/`_coarse_endpoint_resource`. Piezas:
  · **Puntual** (`request_kind='ACTION'`, una entrevista) o **plan completo** (`PLAN`, con nombre y
  rango de días; `_promo_plan_days` los pinta «Día 1, Día 2…» como una hoja de ruta y dentro se van
  añadiendo promociones).
  · Cada entrevista lleva **medio + programa + contacto**, **modalidad** (`PROMO_MODALITIES`:
  presencial / phoner / Zoom / preguntas), **ubicación** solo si es presencial (sugerencias de
  **`MediaLocation`**, tabla nueva: un medio tiene VARIAS ubicaciones, y una nueva se puede dejar
  vinculada al medio), **¿canta?** → repertorio (`_promo_song_options` pone **primero la canción que
  se promociona**) + **formación** (`PROMO_FORMATIONS`: full/half playback o **directo con N
  músicos**), **caché** y **gastos cubiertos** (el MISMO módulo que «el promotor cubre otros gastos»
  de Contratación: `_parse_promoter_costs_form`).
  · **Estados** con los MISMOS códigos que un concierto (BORRADOR/HABLADO/RESERVADO/CONFIRMADO,
  etiquetas en femenino) para que valgan el calendario y `_agenda_status_meta`. **`promo_status` no
  es `status`**: `status` sigue siendo ACTIVE/ARCHIVED. Al **confirmar la promoción se confirman sus
  entrevistas**.
  · **Caché → Contratación**: `_promo_booking_request_sync` crea un `BookingRequest` con
  `payload['departments']=['CONTRATACION']` (contrato y factura como en un concierto); si se quita el
  caché, la petición se **descarta**, no se borra.
  · **Producción**: `production_needed` + `production_owner_user_id` → `ProductionRequest`
  (`linked_type='PROMOTION'`, columna nueva **`owner_user_id`**), que sale en Producción → Solicitudes
  y en el módulo de Inicio `_home_produccion_pending` de esa persona.
  · **Acompañante** (`escort_kind` NONE|USER|PROMOTER): lo asigna promoción **al gestionar la ficha**,
  no en el alta.
  · **Hoja de ruta**: cada entrevista se **espeja** como punto de la agenda
  (`_promo_roadmap_sync_item`, kind ENTREVISTA + `promo_meta` con los iconos de tipo de medio,
  modalidad, canta y **en directo**; los pinta `roadmap.js`). La fuente de verdad es la entrevista:
  el punto se mantiene al día al guardar y se borra al eliminarla. El enlace público de la hoja
  funciona igual que en una actividad (`ROADMAP_ENTITY_TYPES` ya incluía `promotion`).
  · **Bolsa de gastos** propia (`_ensure_promo_bag`, `bag_type='PROMOCION'`) y **empresa del grupo que
  factura** (`Promotion.company_id`, que se copia a la bolsa).
  · **Fotos**: `PHOTO_OWNER_TYPES` incluye **PROMOTION** (pestaña Fotos en la ficha).
  · **Calendario**: un PLAN sale como **una franja** de principio a fin; una puntual, cada entrevista
  en su día (kind `promocion` en `AGENDA_KIND_META`).
  · **Registros**: `_build_registros_promos_pending` lista, **agrupadas por semestre**, las
  promociones ya celebradas en las que **se cantó** y no están declaradas
  (`registros_promo_declare`).
  · **Dónde se ve**: `_promo_rows_for_subject` + `_promo_entity_panel.html` en la ficha de
  canción, disco, artista y concierto.
  · **«Nueva petición» ofrece también PROMOCIÓN y MARKETING**: el paso 1 del asistente general
  (`_peticion_wizard_modal.html`) ya no pregunta «qué tipo de actividad»: es **«¿Qué quieres
  pedir?»** con **UNA sola rejilla** donde van igualadas las actividades y lo demás (concierto,
  festival, evento promocional, TV, marca, **promoción**, **marketing**, otros). Las dos últimas no
  se contratan, así que **saltan** a su asistente corto (`data-peticion-handoff`: cierra el general
  y abre el otro cuando Bootstrap ha terminado de ocultarlo, si no se lleva el fondo por delante).
  ⚠️ Esas dos tarjetas son `<button>` y el resto `<label>`: sin `button.invitation-radio-option
  { font:inherit }` el navegador les pone su propia tipografía y se ven distintas en la misma
  rejilla. Marketing usa
  **`_marketing_peticion_modal.html`** → `marketing_peticion_create` (artista · qué se promociona ·
  plan o acción + tipos · objetivos, presupuesto y plazo), que cae en Marketing → Peticiones.
  ⚠️ No es `promotion_request_create`: ese exige poder EDITAR marketing porque sale de la ficha del
  elemento. Los dos endpoints de PEDIR están en **`REQUEST_ANY_ENDPOINTS`** (se mira ANTES que
  `SUPPORT_ACTION_ENDPOINTS`): pedir algo lo puede hacer **cualquier sesión**, sin necesidad de ser
  «actor», porque quien pide no hace nada, se lo pide al departamento que decide.
  · **Peticiones de promoción**: las crea **cualquiera** de la empresa (asistente corto propio
  `_promo_peticion_modal.html`, botón «Pedir promoción» en Contratación → Peticiones y «Nueva
  petición» en la sección Promoción): de quién es (artista o evento) · qué se pide
  (`PROMO_REQUEST_KINDS`) · medio · cuándo y dónde (las dos pueden no saberse) · quién la pide.
  Es un `BookingRequest` con `payload['departments']=['PROMO']`; `promo_peticion_create` está en
  `SUPPORT_ACTION_ENDPOINTS` porque no exige tener la sección. Promoción la gestiona y con **«Crear
  la promoción»** (`promo_from_request`) la vuelca en una promoción de verdad, que nace en BORRADOR.
  · **En BORRADOR no sale en el calendario** (ni las canceladas): una petición o un borrador no
  ocupa el día de nadie hasta que promoción lo confirma.
  · **Quién CIERRA la bolsa** (`_promo_bag_can_close` + `_promo_bag_closer_ids`): si la promoción
  lleva producción, quien la produce; si no, promoción o **la persona que viaja con el artista**.
  Al cerrar, `_bag_liquidation_responsibility` decide a quién de administración le llega: con pagos
  pendientes a **LIQUIDACIONES**; **sin nada que pagar**, a la categoría nueva
  **`LIQUIDACIONES_PROMO`** («Liquidar gastos de promoción sin pagos pendientes»), que se ve en el
  módulo de Inicio y marca las bandejas de liquidación/cierre como suyas.
  · **Cuando administración CIERRA la liquidación** (`liquidation_status='CERRADA'`) el gasto pasa a
  contar: `_promo_spend_rows` lo enseña en la **inversión del artista** (`_artist_investment_rows`)
  y, si la promoción era de un single o un disco, también en la ficha de ese lanzamiento. ⚠️ Es el
  mismo dinero visto desde dos sitios: **cada pantalla lo cuenta una vez y los totales no se suman
  entre sí**.
  · **Tareas** (`_home_promo_tasks`, módulo de Inicio): le salen a promoción y a quien viaja con el
  artista mientras se gestiona; desaparecen al cerrar la bolsa, y si la promoción lleva PRODUCCIÓN
  se les caen **al día siguiente** de la última fecha (a partir de ahí es trabajo de producción).
  La bolsa sigue en «Mis gastos» para poder asignar lo que falte.
  · **Avisos a producción** (`PromotionAlert` + `_promo_alert_add` + módulo de Inicio
  `HOME_PROMO_ALERTS`): si cambia la **fecha, la hora o el sitio** de una promoción, o si se
  **cancela** (`promo_cancel`, estado `CANCELADO`), le salta el aviso a quien la esté produciendo,
  con el antes → después. No se avisa a uno mismo.
  · **Permisos**: la sección es `promo`. `_promo_access_seed` (una vez, marca `promo_access_seed_v1`)
  se lo concede al departamento **Promoción**. **Abrir** la ficha de una promoción lo puede hacer
  también producción/administración (regla de lectura en `_resolve_request_resource_key`, como
  `_activity_read_resource_key` con las actividades); **editar** sigue exigiendo `promo`.
  · UI: asistente `_promo_wizard_modal.html` (pasos condicionales con `data-sw-when="PLAN|ACTION"`),
  campos compartidos con la ficha en **`_promo_activity_fields.html`** (macros: un solo sitio para
  los nombres de campo, que lee `_promo_apply_activity_form`), paneles condicionales y datos del
  medio en **`static/js/promo.js`**, estilos `.promo-*` en `styles.css`. Alta rápida de **medio**
  añadida a `quick_create.js` (`data-quick-create="media"`).

- **ESCÁNER DE DOCUMENTOS (DNI / NIE / pasaporte)** — ago 2026. Motor puro **`mrz_utils.py`**: lee la
  **banda legible por máquina** (MRZ) y **valida sus dígitos de control**, que es lo que hace fiable
  el escaneo (antes no se comprobaba nada y un «8» leído como «B» entraba como dato bueno).
  · **TD1** (DNI/NIE, 3×30) y **TD3** (pasaporte, 2×44). El formato se decide por la FORMA de las
  líneas, no por lo que diga el usuario: un pasaporte subido como «DNI» se lee bien igual.
  · ⚠️ **En el DNI español el número NO está en el hueco del «número de documento» del MRZ**: ahí va
  el **número de soporte** (BAA000589); el DNI/NIE va en los **datos opcionales**. Antes se rascaba
  del texto impreso, que es mucho menos fiable.
  · **NIE** (X/Y/Z + 7 dígitos, mod-23 con X=0/Y=1/Z=2): antes no existía en ningún punto del código.
  · Espejo en el navegador dentro de **`static/js/doc_scan.js`** (`parseMrzText`, `parseTd1`,
  `parseTd3`, `isValidDni`, `isValidNie`, `findSpanishId`, `checkDigit`). ⚠️ **Paridad obligatoria**
  con `mrz_utils.py`: si se toca una, se toca la otra.
  · **Escáner con la CÁMARA** (`static/js/doc_camera.js`, `window.DocCamera.open({onFound,onCreate})`):
  lee en vivo como un lector de QR. Es rápido porque **solo lee la banda de abajo** (un recorte
  pequeño, binarizado), con un **worker de tesseract reutilizado** y **lista blanca** `A-Z0-9<`
  (`DocScan.ocrMrz` / `mrzWarmUp`); cada fotograma se valida con los dígitos de control y, si no
  cuadra, se tira y se prueba con el siguiente: por eso no hace falta acertar con el encuadre y nunca
  da un dato inventado. Salida sin cámara: escribir el número a mano.
  · **A quién corresponde el número**: `_find_people_by_doc_number` mira las CUATRO vías sin cortar
  en la primera (`Promoter.tax_id`, `PromoterCompany.tax_id`, `PersonDocument.doc_number` de tercero
  **o de personal**, y `UserProfile.dni`). ⚠️ Ese bucle estaba copiado cinco veces en `app.py` y
  **ninguna copia miraba al personal**. Endpoint `doc_scan_lookup` (`POST /api/documento/leer`), en
  `SUPPORT_READ_ENDPOINTS` porque es una BÚSQUEDA: la usa cualquiera con sesión.
  · **Dónde está**: botón «Escanear documento» en la barra de búsqueda de **Terceros**; si el número
  ya está, enseña las fichas (tercero o personal) y filtra la lista; si no, abre «Nuevo tercero» con
  el nombre, los apellidos y el DNI ya puestos.

- **TICKETING · volcar la configuración de Enterticket a la actividad** — ago 2026. Botón **«Volcar
  configuración»** en la pestaña Ticketing: `concert_et_config_preview` (GET, JSON) calcula el DIFF y
  el modal enseña **lo que hay ahora tachado y lo que pasaría a haber** antes de aceptar;
  `concert_et_config_apply` (POST) lo aplica. Se escriben `ticketing_payload['ticket_types']`
  (nombre, precio y nº a la venta), `entry_mode='SALE'`, `Concert.capacity` y `Concert.sold_out`.
  · ⚠️ **NO pasa por `_replace_concert_ticket_types_manual`**: ese borra y reinserta los tipos, y el
  borrado en cascada se llevaría por delante el histórico diario de ventas (`TicketSaleDetail`) y los
  precios por ticketera. Los `ConcertTicketType` de ET los mantiene al día `_et_mirror_to_sales`.
  · ⚠️ **Las invitaciones pactadas por categoría se CONSERVAN**: la API de ET solo informa de las ya
  emitidas, no del cupo pactado.
  · **Lo que Enterticket NO puede dar** (y por eso no se volca): la **ZONA** (pista/grada/palco no
  existe en ET; lo más parecido es `entrada_numerada`), el **nº a la venta** como dato (se calcula
  vendidas + disponibles: si en ET recortan el cupo con ventas hechas, el número sale de más), un
  **estado de venta** por categoría (se deduce: «Agotada» si no quedan, y el % vendido) y **qué
  butacas están bloqueadas**: `/bloqueos/:id` es un CONTADOR sin sector/fila/asiento, así que los
  bloqueos no se pueden repartir por categoría ni pintar en el plano.
  · El plan de ingresos **no hace falta invalidarlo**: la pestaña Resultado se recalcula entera en
  cada carga (`_concert_build_calc_data` + `sim_calc`, sin caché ni snapshot). ⚠️ Con el concierto
  vinculado a ET y ventas reales, el adaptador **ignora** tipos/precios/aforo y usa la recaudación
  real como ingreso @100%.

- **REMESAS de pago (fichero para el banco)** — ago 2026. Motor puro **`sepa_utils.py`**: genera
  **SEPA XML `pain.001.001.03`** (el Cuaderno 34.14 de la AEB), que es lo que admiten Santander,
  CaixaBank y Cajamar; `BANK_PROFILES` recoge los matices por banco. Valida IBAN por **mod-97**,
  limpia el texto al juego de caracteres SEPA (sin acentos) y dice qué le falta a cada pago
  (`check_payment`). ⚠️ **Antes de fiarse conviene mandar una remesa pequeña por cada banco**: cada
  entidad valida el fichero a su manera.
  · **Bases de datos → Bancos** (`Bank`, recurso `databases.banks`): nombre, logo y **formato del
  fichero**. **Ficha de la empresa del grupo → Datos → Cuentas bancarias**
  (`GroupCompanyBankAccount`): banco, alias, IBAN (validado), **SWIFT/BIC** (es lo mismo),
  justificante de titularidad y cuál es la de por defecto. Solo dirección las toca.
  · **Administración → Pendiente → Pago** está **agrupado por EMPRESA DEL GRUPO**
  (`_payment_pending_context`), y dentro por **liquidación**: cada bolsa se ve con su total
  pendiente y cuántos gastos incluye, y se despliega para ver el detalle; los gastos sueltos van
  aparte. Cada empresa tiene a la derecha su **caja «Crear remesa»**: se **arrastran** ahí bolsas y
  gastos (`static/js/pagos.js`; también vale pinchar el asa). **Solo acepta lo de su empresa**: si
  sueltas algo de otra, avisa y no lo coge (una remesa se paga desde una sola cuenta). Cada gasto
  lleva sus **tres puntitos**: marcar como pagado (eligiendo el método) o crear una remesa con él.
  · **`PaymentBatch` + `PaymentBatchItem`** (BORRADOR → EXPORTADA → PAGADA). El beneficiario se
  guarda **congelado en el item**: si mañana cambia la cuenta del proveedor, la remesa sigue
  diciendo lo que se mandó. Si a un pago le falta un dato, la ficha de la remesa lo avisa y deja
  completarlo: **lo que se rellene se guarda en el TERCERO** (`Promoter.bank_account` / `bank_bic`)
  para no volver a pedirlo, o se quita el pago de la remesa y no se incluye.
  · **Al subir el justificante** (`payment_batch_receipt`) se dan por pagados todos los gastos de la
  remesa («Remesa REM-aaaa-nnnn» como método) y **las bolsas que se quedan sin nada pendiente se
  cierran y se archivan** (`_bag_close_if_fully_paid`): pasan a contabilidad.
  · **PAGOS PARCIALES** (`administration_expense_mark_paid`): el importe del formulario es **lo que
  se paga AHORA** y se **ACUMULA** sobre lo ya pagado (topando en el bruto) — antes lo sustituía, así
  que pagar la diferencia de un parcial dejaba el gasto peor que antes. Lo pendiente de un gasto es
  siempre `_expense_pending_amount` (bruto − pagado): es lo que se ve en pantalla, lo que se ofrece
  en los formularios (`expense_pending`, global de plantilla) y lo que se manda al banco. ⚠️ **Un
  pago parcial NO cabe en una remesa** (la remesa manda el importe pendiente entero): si el gasto
  está en una remesa sin pagar, el pago parcial se niega y pide **sacarlo de la remesa**, con una
  casilla en el propio modal para hacerlo de un clic. Desde los tres puntitos: «Marcar como pagado»
  y «Pago parcial». Un gasto pagado a medias sale con su pastilla «Pagado en parte · X de Y».
  · Guardar dos veces el **mismo IBAN** en una empresa actualiza esa cuenta en vez de duplicarla.
  · Responsabilidad de administración: `_bag_liquidation_responsibility` manda las bolsas de
  promoción **sin pagos pendientes** a `LIQUIDACIONES_PROMO` y el resto a `LIQUIDACIONES`.

- ⚠️⚠️ **COMPROBAR una factura y PAGARLA no es lo mismo con la retención en medio** (ago 2026):
  · al **COMPROBAR** que la factura cuadra manda la **BASE** (`_invoice_amount_check`): la retención
  no cambia lo que se ha facturado ni lo que cuesta el gasto.
  · al **PAGAR**, el importe es el **TOTAL DE LA FACTURA**, o sea base + IVA **menos la retención**:
  es lo que va a recibir el tercero (lo retenido lo ingresa la casa en Hacienda). Punto único
  **`_expense_retention`** (manda la de la FACTURA; una factura que cubre varios gastos no vale
  porque su retención es del conjunto) + **`_expense_retention_map`** (la de cientos de gastos en una
  tacada, que es lo que lista pendiente de pago) + **`_expense_payable_gross`** (bruto − retención) +
  **`_expense_payment_amount`** (lo que queda por pagarle). Lo usan pendiente de pago, los items de
  la remesa, `administration_expense_mark_paid` (si no, pagar lo que decía la factura dejaba el gasto
  en PARCIAL para siempre) y `payment_batch_receipt`. En royalties,
  `_payment_batch_add_royalties` manda el total de la factura igual que `_royalty_payment_pending_rows`
  (antes mandaba base + IVA y con retención se pagaba de más).

- **REMESAS · fecha de pago por pago, PDF y aprobación de dirección** (ago 2026):
  · **FECHA DE PAGO de cada pago** (`PaymentBatchItem.payment_date`): el día en que el banco lo
  emite. Nace **hoy** (la de la remesa) y se cambia **pinchándola** en la ficha
  (`payment_batch_item_date`, calendario inline en `pagos.js`); la fecha de la remesa es la de POR
  DEFECTO y con la casilla «Ponerla en todos los pagos» se copia a todos.
  ⚠️ **En `pain.001.001.03` la fecha de emisión (`ReqdExctnDt`) vive en el `PmtInf`, no en el
  apunte**: `sepa_utils.build_credit_transfer_xml` agrupa los pagos por fecha y emite **un `PmtInf`
  por día** (con su `NbOfTxs`/`CtrlSum`; el `PmtInfId` lleva el orden detrás porque tiene que ser
  único, y con una sola fecha se queda la referencia a secas, como antes).
  · **PDF de la remesa** (`payment_batch_pdf` → `_build_payment_batch_pdf_bytes`, estilo de casa):
  logo de la empresa arriba a la derecha, «Remesa de pagos» centrado, cabecera con el nombre de la
  remesa y su fecha, el **importe total destacado** y la tabla tercero · concepto · **artista con
  foto** · fecha de pago («Hoy» si es hoy) · importe, con la suma total al final. Se genera **al
  vuelo**: siempre dice lo que la remesa dice hoy.
  · **APROBACIÓN DE DIRECCIÓN** (`PaymentBatch.approved_at` + `PaymentBatchItem.approved_at`): al
  crear una remesa le sale a dirección en Inicio (**`_home_payment_batch_approvals`** →
  `HOME_BATCH_APPROVALS`, «Remesa pendiente de aprobación») y por notificación (`_notify_users`, kind
  `REMESA`). La pantalla **`payment_batch_approve_view`** (`templates/remesa_aprobar.html`, clases
  `.ra-*`) enseña la MISMA cabecera del PDF y debajo las facturas **una a una**: Anterior · **Ok**
  verde · Siguiente, cada OK se guarda al momento (`payment_batch_item_approve`, JSON) y **pasa sola
  a la siguiente**; al terminar todas sale el resumen (el listado del PDF con las etiquetas verdes) y
  la remesa queda **aprobada**. La factura de cada pago se carga **solo al mirarla** (si no, se
  bajarían todas al abrir). Quitar un OK devuelve la remesa a pendiente.
  ⚠️ **Sin aprobar NO se baja el fichero para el banco** (`payment_batch_export` rebota diciéndolo):
  para eso está el repaso. El PDF sí se puede bajar siempre.
  · **Trazabilidad**: el OK se apunta en el propio gasto (`BagPaymentInteraction` kind
  `REMESA_APROBADA`, con quién de dirección y cuándo) y en el historial de la liquidación de
  royalties (`BATCH_APPROVED`).
  · **Lo que ya está en una remesa se ve APAGADO** en pendiente de pago (gris y atenuado:
  `.pay-exp/.pay-royalty/.pay-bag.is-in-batch`), y vuelve a la normalidad al sacarlo. Se apaga
  también **en vivo** al arrastrarlo a la caja (y se enciende al quitar el chip, `dim()` en
  `pagos.js`). Una bolsa se apaga cuando **todos** sus gastos están ya en una remesa.
  ⚠️ `payment_batch_remove_item` suelta también el `payment_batch_id` de la **liquidación de
  royalties**: sin eso se quedaba como «ya está en una remesa» y no se podía meter en ninguna otra.
  · ⚠️ **EL FICHERO PARA EL BANCO SE PUEDE BAJAR ANTES DE LA APROBACIÓN** (ago 2026, corrección): así
  se deja **precargado** en la plataforma del banco mientras dirección repasa, y al dar el visto
  bueno solo hay que confirmarlo allí. `payment_batch_export` avisa de que aún no está aprobada
  («no lo confirmes hasta que dé el visto bueno») pero **no bloquea**.
  · **Cabecera de la remesa**: todos los botones en UNA fila y en orden de uso — Descargar fichero ·
  Descargar PDF · Repasar y aprobar · **Anular remesa (el último)**. «Deshacer remesa»
  (`payment_batch_delete`) se **retiró**: anular ya suelta los pagos y además deja constancia.
  · La **fecha de pago** solo se toca en cada pago de la lista: en «¿Desde qué cuenta se paga?» no se
  repite (era el mismo dato en dos sitios).

- **AVISO AL ARTISTA DE UNA ACTIVIDAD** (ago 2026). Antes de CONFIRMAR una actividad hay que
  habérsela comunicado al artista.
  · **Dos canales nuevos** en la configuración de notificaciones del artista (en cabeza de
  `ARTIST_NOTIFICATION_CHANNELS`): **ACTIVIDADES_CACHE** («Nuevas actividades con caché») y
  **ACTIVIDADES_SIN_CACHE** («Actividades sin caché»). Punto único
  **`_activity_notification_channel`**: si la actividad lleva caché se avisa a los primeros y si no a
  los segundos. **`_concert_has_cache`**: manda lo apuntado (`ConcertCache` con importe o %) y, si no
  hay filas, el apunte del alta (`sale_type == 'VENDIDO'` = «¿Tiene caché?» Sí).
  ⚠️ Decisión de Dani: **NO hay validación del artista**, basta con avisarle.
  · El contacto tiene ahora **teléfono** (`ArtistNotificationContact.phone`, cae al del tercero) para
  WhatsApp y SMS, y **`_artist_notification_recipients`** devuelve nombre + correo + teléfono
  (hermano de `_artist_notification_emails`, que solo da correos).
  · **UN SOLO MOTOR para los tres canales**: `_activity_notice_html(ctx, note, hidden, preview)`
  genera el HTML con **estilos en línea**, y ese mismo HTML es el del correo, el de la **página
  pública** que se manda por WhatsApp/SMS (`public_activity_notice_view`, `/actividad/<token>`) y el
  de la vista previa. Contenido, en orden: logo de la empresa del grupo arriba a la **derecha** (si la
  actividad no tiene, el de la casa), título centrado (`ACTIVITY_NOTICE_KINDS`: «Confirmación nueva
  actividad» · «Cambios en la actividad» · «Actividad cancelada»), la **nota** si la hay, la
  **cabecera de la actividad** (`_contract_sheet_hero_rows`, la misma de la ficha), la **barra de
  botones** (de momento solo «Ver hoja de ruta»; los futuros van a su derecha), **«Descripción:»**
  con lo que tiene que hacer el artista (M&G, ¿canta?, canciones **en orden y con portada**,
  formación, duración, otros compromisos) y **«Condiciones»** por módulos
  (`ACTIVITY_NOTICE_MODULES`): **Caché** (si no hay, dice «Sin Caché»), lo que cubre el promotor,
  formato y equipamiento. ⚠️ En un **concierto** (o sin rellenar) no sale ni la descripción ni su
  título, como se pidió.
  ⚠️ **`'<div>' + escape(x)` ESCAPA el HTML de la izquierda** (Markup en la derecha): el aviso salía
  como texto (bug real). Dentro del motor se escapa con un `esc()` local que devuelve `str`.
  · **Vista previa** (`concert_artist_notice_view`, página propia + `concert_artist_notice.html`):
  canal (correo/WhatsApp/SMS), destinatarios, **nota** que se pinta bajo el primer título, y un
  **OJO por módulo** para dejarlo fuera (`data-notice-eye`; en la previa los ocultos se ven atenuados,
  en el envío no van). Se repinta con `concert_artist_notice_preview` (JSON).
  · **La COMPUERTA está en los CUATRO caminos** que escriben el estado, no solo en la etiqueta:
  `concert_quick_status` (409 con `needs_artist_notice` + `notify_url`; el handler de
  `[data-status-option]` de `scripts.js` **lee el cuerpo** y ofrece avisar), `concert_section_update`
  sección «datos» (guarda el resto y deja el estado como estaba, con el enlace en el aviso),
  `concert_wizard_create` y el alta clásica `POST /conciertos` (nacen **RESERVADAS** en vez de tirar
  el alta). Al avisar con `?confirmar=1` la actividad pasa **sola** a CONFIRMADA.
  · **Un cambio GORDO invalida el aviso**: `_concert_notice_signature` (fecha, hora, recinto, cachés)
  se guarda al avisar; si cambia, la etiqueta vuelve a «Notificar al artista» con «hay cambios» y la
  compuerta salta otra vez. **CANCELAR** (borrar la actividad) también obliga: si el artista estaba
  avisado, `concert_delete_handler` rebota pidiendo comunicar la cancelación.
  ⚠️ **Exenciones**: las actividades de **EVENTO** (`event_id`: su `artist_id` es el espejo, no hay a
  quién avisar) y el **HISTÓRICO** (`_concert_is_legacy`), o no se podrían confirmar nunca.
  · **Queda apuntado**: `Concert.artist_notified_*` (para la etiqueta «Notificado» con **a quién y
  cuándo** al pasar el ratón) y el histórico completo en **`ConcertArtistNotification`**, que
  **congela** en `snapshot` el HTML que se mandó — la página pública enseña eso, no lo de hoy.
  ⚠️ El `public_token` es **opaco** (`_uuid_token`, con su índice UNIQUE), no firmado: un enlace de
  hace dos años sigue valiendo (los firmados a un año ya dieron un bug real).
  · ⚠️ **En ensayos y discográficas se tiraba a la basura** el «¿canta?», las canciones y la
  formación: el asistente las pregunta pero el servidor solo las guardaba en las promocionales. Punto
  único **`_activity_has_performance_detail`** (promocionales + `SIMPLE_ACTIVITY_TYPES`), aplicado en
  los TRES sitios (asistente, `concert_section_update` sección «actividad» y el `is_promo_activity`
  de la ficha).
  · **Etiquetas nuevas en Python**: `CACHE_VARIABLE_OPTION_LABELS` (las 6 condiciones de un caché
  variable, que solo vivían en `concert_form.js` — si se toca una, se toca la otra) y
  `_concert_equipment_label` (la cadena del equipamiento, que estaba copiada a mano en tres sitios).
  · **«EL ARTISTA YA FUE INFORMADO»** (ago 2026): en una actividad **que YA HA PASADO** no tiene
  sentido mandar un aviso de algo que ya ocurrió, así que la compuerta ofrece **dejarlo apuntado y
  seguir con el estado**. `_concert_notice_can_ack` (el último día —`end_date` o `date`— anterior a
  hoy; en una futura NO se ofrece y el servidor lo vuelve a comprobar) alimenta `can_ack`/`ack_url`
  del gate; el endpoint es **`concert_artist_notice_ack`** (`POST
  /conciertos/<cid>/avisar-artista/ya-informado`), que apunta el aviso con canal **MANUAL**, la misma
  FIRMA (así un cambio gordo posterior vuelve a pedirlo) y pasa la actividad a CONFIRMADA. Sale como
  botón en la pantalla del aviso y, al pinchar la etiqueta de estado, en un **pop-up de tres opciones**
  (`pedirDecisionAviso` en `scripts.js`: con un `confirm()` no caben; sin Bootstrap se cae al de
  siempre). Queda marcado en `artist_notified_to = [{"manual": true}]` → `_concert_notice_state`
  devuelve `manual` y la etiqueta dice «Notificado (a mano)».

- **SALIDA A LA VENTA · activar la venta y COMUNICARLA** (ago 2026). Sacar una actividad a la venta
  son **tres pasos con tres dueños**, y **activar la venta NO es activar la producción**: son
  funciones separadas y tareas distintas.
  · **1. CONTRATACIÓN «Activa la venta»** (`concert_sale_activate`, botón en la barra de la ficha y
  tarea **«Sin activar la venta»** en el módulo de Contratación): no toca la fecha, solo dice «hay que
  sacarla ya». Al pulsarlo le llega el **aviso a TICKETING** (kind `VENTA`, `ref_type='CONCERT_SALE'`).
  · **2. TICKETING la saca a la venta o la programa** con la etiqueta **Venta** de la cabecera
  (`concert_onsale_set`), que ahora guarda también la **HORA** (`Concert.sale_start_time`) — es la que
  se dice en el aviso.
  · **3. TICKETING la COMUNICA** (`concert_sale_notice_view` → `_send`): **es obligatorio**; hasta que
  se manda, la actividad sigue en sus tareas. Al mandarlo desaparece de ellas y la actividad pasa a
  estar en **actualización de ventas** (`/ventas`, que lista lo que ya tiene fecha de salida).
  · **Cuándo aplica**: la actividad **vende entradas** (`entry_mode == 'SALE'`), la promueve una
  **empresa del grupo** y la venta la sacamos **nosotros** (`_concert_sale_is_ours`). Si vende el
  recinto, el promotor o un tercero, no es trabajo nuestro. Punto único **`_concert_sale_state`**
  (`applies` · `needs_activation` · `needs_onsale` · `needs_notice` · `notified` · `notice_stale`),
  que usan las tareas, los botones de la ficha y las compuertas.
  · **A QUIÉN se le manda** (`_sale_notice_recipients`, con su papel y su casilla para quitarlo): el
  **ARTISTA** a las cuentas configuradas para **notificaciones de actividades** (el mismo canal que el
  aviso de la actividad, con caché o sin caché), la persona de **PRODUCCIÓN** de esa actividad,
  **CONTRATACIÓN** (el departamento) y **la persona del SELLO que tenga ese artista asignado**
  (`assigned_artist_ids_sello`, **sin caer** en todo el departamento: es un aviso para quien lo lleva).
  Se pueden añadir otros correos a mano.
  · **Asunto**: «**Salida a la venta, \<festival o municipio\>, \<fecha de la actividad\>**».
  **Cuerpo** (`_sale_notice_html`, el MISMO HTML para el correo y la vista previa): logo de la empresa
  del grupo arriba a la **derecha**, «Salida a la venta» centrado, la **galleta** de la actividad (la
  misma cabecera que la ficha, `_contract_sheet_hero_rows`), la frase de **cuándo sale**, la tabla de
  **Canales de venta** (logo + copiar el enlace + ir al enlace) y, **solo si hay carteles aprobados**,
  «Puedes descargar los carteles» con el botón **Descargar Carteles** (lleva a la cartelería de la
  actividad).
  ⚠️ **Si YA está a la venta el texto lo DICE** (`_sale_notice_sentence`): «ya está a la venta desde
  el \<día\>» (o «desde hoy»); si todavía no, «saldrá a la venta el \<día\> a las \<hora\>».
  Decir «saldrá a la venta» de algo que ya se está vendiendo sería mentira.
  ⚠️ En un correo **no corre JavaScript**: el botón «Copiar enlace» es un enlace normal (y debajo va
  la dirección en texto, que es lo que de verdad se copia desde el correo); en la **vista previa** de
  la app sí copia de verdad.
  · **Vista previa** (`concert_sale_notice.html`): destinatarios con casillas, correos extra, nota y un
  **ojo por módulo** (`canales`, `carteles`) para dejarlo fuera, igual que el aviso al artista.
  · **Un cambio invalida el aviso**: `_concert_sale_signature` (día + hora) se guarda al comunicarlo;
  si se reprograma, la etiqueta vuelve con «hay cambios» y hay que comunicarlo otra vez.
  ⚠️ La lista de tareas de Ticketing **NO filtra por `sale_notice_at` en la consulta** (bug real de
  esta épica): una venta reprogramada ya tiene fecha de aviso y ese filtro se la comía, así que la
  tarea no volvía a aparecer. Decide `_concert_sale_state`.
  ⚠️ **Corte `SALE_NOTICE_TASK_FROM` (18-ago-2026)**: lo que YA estaba a la venta antes de que esto
  existiera no reclama aviso (nadie va a comunicar hoy una venta que abrió en junio); lo que se active
  desde la app sí, siempre. Mismo criterio que `PITCH_TASK_FROM`.
  ⚠️ **Permisos**: sacar a la venta es de TICKETING, que no tiene por qué poder editar contratación →
  punto único **`can_set_concert_onsale()`** (contratación · ticketing · ventas · dirección), global de
  plantilla `CAN_SET_ONSALE` (es el que manda en `_concert_onsale_badge.html`, antes
  `CAN_EDIT_CONCERTS`), y los endpoints van en `SUPPORT_ACTION_ENDPOINTS` / `SUPPORT_READ_ENDPOINTS`
  (si no, el gate de la sección los rebotaba con un 403 antes de llegar a su comprobación).
  · Módulo de Inicio **`HOME_TICKETING_SALES`** (`_home_ticketing_sales_tasks`), solo para Ticketing y
  dirección, con las dos tareas y su etiqueta. Va **justo debajo del calendario**, que es con lo que
  trabaja ticketing.
  ⚠️ **TODAS LAS PANTALLAS DE INICIO SE LEEN IGUAL** (ago 2026), dirección aparte: **cabecera** ·
  **avisos** (la franja global) · **botones rápidos** · **calendario** · **sus tareas pendientes** (las
  de su departamento o las que le han asignado) y, al final y **FUERA de cualquier compuerta**, **lo
  SUYO**, que es de la PERSONA y no de una función y **se ve siempre que haya algo pendiente**:
  «Activar la producción» (lo que ha creado y no tiene a nadie) · «Mis gastos» · los carteles que le
  han rechazado · «Mis vacaciones» · «Mis peticiones» · «Mis invitaciones solicitadas».
  Quien tiene dos departamentos ve los módulos de los dos.
  ⚠️ Un módulo NUEVO que sea **de la persona** va en ese bloque final (fuera de la compuerta); si es
  de un departamento, dentro. Lo que quede dentro no lo ve quien es solo de ticketing o de
  contratación.
  ⚠️ **En PRODUCCIÓN son las ASIGNADAS, no las del departamento** (`_home_produccion_pending`,
  corregido): las actividades donde es el **responsable de producción** más las de **sus artistas**.
  Antes, quien no tenía artistas asignados veía **TODAS**, así que el módulo era el trabajo de otros.
  ⚠️ **EL INICIO DE CONTRATACIÓN** (ago 2026) es, en este orden: la **cabecera** · los **avisos**
  (la franja global, que va debajo del menú) · los **botones rápidos** · el **calendario** · las
  **peticiones pendientes** (`HOME_PENDING_PETICIONES`, **solo cuando hay**) · y sus **tareas
  pendientes de contratación** (`HOME_CONTRATACION_TASKS` ← `_home_contracting_tasks`). **Nada más**:
  a quien está en el departamento Contratación **y en ninguno más** (`_home_contratacion_only` →
  `HOME_CONTRATACION_ONLY`, hermano de `_home_ticketing_only`) se le esconden los módulos de los
  demás departamentos.
  · El módulo de tareas son las MISMAS que abren cada pestaña de Contratación
  (`_contracting_tasks_data`, ya filtradas por **sus artistas asignados**), aquí **sin repartir por
  pestañas**: una fila por actividad, lo más urgente primero. Se ve para **cualquiera que tenga la
  función** de contratación (dirección incluida), no solo para los de ese departamento.
  ⚠️ Una actividad sale en VARIAS pestañas (un concierto de un ciclo, en las dos): se quita el
  duplicado; lo de **facturación es por pago**, así que el `extra` entra en la clave del dedupe.
  ⚠️ Las tareas son **CARAS** (recorren las actividades vivas): se calculan **solo en Inicio** y solo
  a quien tenga contratación.
  ⚠️ El módulo de **peticiones subió** a debajo del calendario (antes estaba dentro de la compuerta de
  ticketing, así que contratación lo tenía enterrado entre los módulos de los demás); sigue oculto
  para quien es SOLO de ticketing, **se lee IGUAL que el de tareas** (fila `.ctask`: foto del artista,
  datos con iconos y las etiquetas debajo) y las PETICIONES **no se repiten** en el módulo de tareas
  (su pestaña se salta en `_home_contracting_tasks`).
  · **LA PROVINCIA NO ES UN CAMPO APARTE** en ninguno de los dos: el lugar va de una pieza
  («Municipio, Provincia», punto único `_place_label`) — `_contracting_task_row` devuelve ya
  `place_label` y las plantillas pintan eso, no `municipality` + `province` en dos etiquetas.
  ⚠️ **EL INICIO DE TICKETING ES SOLO EL CALENDARIO Y ESO**: a quien está en el departamento
  Ticketing **y en ninguno más** (`_home_ticketing_only` → `HOME_TICKETING_ONLY`) no se le pintan los
  módulos de los demás departamentos — en `home.html` todo lo que va después cuelga de
  `{% if not HOME_TICKETING_ONLY and not HOME_CONTRATACION_ONLY %}`. Quien además esté en otro departamento, y dirección, los siguen
  viendo todos. Un módulo nuevo que se añada al final queda dentro de esa compuerta: si tiene que
  verlo ticketing, va ARRIBA (con el suyo).

- **ELIMINAR UNA ACTIVIDAD · la RUEDA de la cabecera** (ago 2026). La ficha tiene arriba a la derecha
  un botón de **rueda** (`.ficha-hero__gear`) con lo que se hace de tarde en tarde: asignar/cambiar
  quién lleva la producción, avisar al artista y **Eliminar actividad**.
  · Borrar exige **escribir ELIMINAR** (`CONCERT_DELETE_WORD`, comprobado también en el servidor: un
  POST sin la palabra no borra nada) y se dice que se lleva por delante invitaciones, entradas,
  cachés, contratos, presupuesto, cartelería, hoja de ruta y fotos.
  · **A quién se le había comunicado ya** lo resuelve **`_concert_notified_parties`** —con FOTO y
  nombre— mirando los tres sitios desde los que sale la actividad de casa: los avisos al artista
  (`ConcertArtistNotification`, con la foto resuelta EN VIVO contra los contactos del artista, porque
  el aviso guardado no la lleva), el promotor al que se le pidió la **ficha de contratación** y a
  quien se le pidió la **cartelería**. El pop-up ofrece **notificar la cancelación con una nota**
  (`_activity_cancellation_notify`, el mismo motor de avisos con `kind='CANCELACION'`) y borrar, o
  **eliminar sin notificar**.
  ⚠️ Si el correo de cancelación NO sale, **la actividad NO se borra** (si no, se perdería sin que
  nadie se hubiera enterado). Y si a quien lo sabía no le consta correo, el botón de notificar no se
  ofrece (`notified_can_email`) en vez de dejar un botón que no puede enviar nada.
  ⚠️ En una CANCELACIÓN el aviso **no lleva el botón «Ver hoja de ruta»**: la actividad se cae.
  ⚠️ Las **FOTOS y vídeos** son polimórficos (`owner_type`/`owner_id`, **sin clave ajena**): no
  cascadean, así que el borrado las limpia a mano. El resto de hijos sí tienen ON DELETE CASCADE.
  ⚠️ El borrado del listado antiguo (`concerts.html`) es **código muerto** (esa pantalla solo se usa
  para Facturación); el único camino vivo es el de la ficha.

- **FICHA DE ACTIVIDAD · la cabecera lo dice todo** (rediseño ago 2026, `concert_detail.html`):
  · Arriba a la **derecha**, la **empresa del grupo que factura** (`.hero-company`; si no se ha dicho
  quién factura, la empresa del grupo que promueve).
  · En la línea de datos, el **AFORO** con su icono (`fa-people-group`), junto a fecha y recinto.
  · Al lado del estado, dos etiquetas nuevas y **clicables** (parciales
  `_concert_announcement_badge.html` y `_concert_onsale_badge.html`): **ANUNCIO** (rojo «No anunciar»
  · verde «Anunciado» · amarillo «Anuncio: fecha») y, **solo si la actividad vende entradas**
  (`ticketing_payload.entry_mode == 'SALE'`), **VENTA** (verde «A la venta», con la fecha en que
  salió al pasar el ratón · amarillo «Venta: fecha»). Se cambian en su propio desplegable, con
  endpoints propios **`concert_announcement_set`** y **`concert_onsale_set`**.
  ⚠️ NO pasan por `concert_section_update`: la sección «datos» EXIGE la fecha de salida a la venta
  (revienta si llega vacía) y la sección «entradas» BORRA toda la configuración de venta si no le
  llega `entry_mode`. Escriben solo sus dos columnas.
  ⚠️ El parcial de la venta saca el `entry_mode` del **propio concierto**, no de una variable de
  contexto: así vale en cualquier pantalla (en la ficha, `entry_mode` es un `{% set %}` local de la
  pestaña de ticketing y no se ve desde la cabecera).
  · **Fuera** el botón de «Ficha interna» de la fila de accesos rápidos, el de «Activar producción»
  de la cabecera y **las 12 tarjetas** de resumen que había bajo las pestañas (repetían la cabecera).
  El botón **«Producción» pasa a ser «Activar producción»** (misma estética verde) y **desaparece en
  cuanto la producción está activada**.
  · La **ficha de contratación es COMPACTA**: «Más información» usa el patrón de tabla de la ficha del
  tercero (`psum-list` a dos columnas, `.psum-list--2col`), etiqueta y valor pegados.
  ⚠️ La lista `summary_labels` de lo que NO se repite está DUPLICADA en el PDF
  (`concert_contract_sheet_pdf`): si se toca una, se toca la otra.

- **FICHA DE CONTRATACIÓN · una sola, y lo del promotor aparte** (ago 2026). La pestaña «Ficha
  promotor» se **retiró**: era la misma ficha duplicada (y `?tab=ficha` cae a «general»).
  · ⚠️ **`ConcertContractSheet` es UNA fila por actividad** y antes el promotor escribía en el MISMO
  `data` que la casa, así que **se pisaban**. Ahora lo que manda él va a **`promoter_data`** (+
  `promoter_reviewed_at`), y `data` sigue siendo la ficha de la casa.
  · En la ficha sale un **aviso amarillo** («El promotor ha cumplimentado la ficha del promotor») con
  el botón **«Revisar datos»** mientras haya `promoter_data` sin revisar (`promoter_sheet_pending`).
  · **`concert_contract_sheet_review`** es una **pantalla partida campo a campo**
  (`concert_contract_merge.html`, clases `.cmp-*`): a la izquierda lo nuestro, a la derecha lo suyo, se
  pincha la columna que se queda (por defecto lo suyo donde no teníamos nada, lo nuestro donde ya
  había dato) y al guardar se reemplaza la ficha **y** se aplican al Concert los campos que le tocan.
  · **Un solo catálogo de campos**: `CONTRACT_SHEET_GROUPS` + `CONTRACT_SHEET_CHOICES` (con
  `CONTRACT_SHEET_LABELS`) es la fuente de verdad de qué campos hay, cómo se llaman y en qué módulo
  van; lo usan el formulario, la vista consolidada, el PDF y la comparación. Un campo nuevo se añade
  UNA vez. Helpers: `_contract_sheet_show` (cómo se enseña cada tipo), `_contract_sheet_compare_rows`
  y `_contract_sheet_compare_groups`.
  · ⚠️ Editar la ficha por dentro (`concert_contract_sheet_edit`) **ya no la pone en RECEIVED**: antes
  hacía pasar por «el promotor la ha enviado» y disparaba el aviso.
  · Al recibirla se **avisa** a quien la pidió y a Contratación (`_contract_sheet_notify_received`).

- **El FORMULARIO del promotor, por módulos** (ago 2026, `concert_contract_public.html`, clases
  `.csheet*`): logo de la empresa del grupo arriba a la **derecha**, título centrado «Solicitud ficha
  de contratación», el texto de contratación y **la MISMA cabecera de la actividad** que su ficha
  (`_contract_sheet_hero_rows`, compartida con el correo). Seis módulos con su icono:
  **promotor** (datos que ya tenemos + dirección FISCAL con autocompletado `data-address-autocomplete`
  + «la factura otra empresa promotora» que busca por CIF con **`public_contract_sheet_company`**) ·
  **producción local** (quién la hace, con iconos; si es otra empresa, nombre y CIF; y su responsable)
  · **show** (tipo de concierto con iconos —Concierto/Gratuito/Festival/Ciclo, y el nombre si es
  festival o ciclo—, aire libre o cubierto, formato, duración, comienzo, apertura y observaciones) ·
  **ticketing** (aforo; y si NO es gratuito: salida a la venta, puntos de venta, **ticketeras con su
  logo** + otras a mano + taquilla física, desglose de entradas con filas que se añaden, M&G y su
  cantidad, y responsable) · **promoción** · **anuncio y cartelería**.
  ⚠️ Los paneles que se ocultan **DESHABILITAN sus campos** (un campo oculto se envía igual, y un
  `required` invisible impide enviar el formulario).
  ⚠️ El correo de solicitud (`_contract_sheet_request_email_html`) lleva el logo a la derecha, el
  título centrado, el texto y una **viñeta con la cabecera de la actividad** y el botón
  «Cumplimentar ficha de contratación» dentro.
  ⚠️ `concert_contract_sheet_request` **fusiona** `request_payload` en vez de reemplazarlo (ahí viven
  el artista y los datos de la gala que deja el asistente, y `_contract_sheet_prefill` los usa).

- **Administración · Pendiente: el orden del trabajo** (ago 2026): las subpestañas van
  **Solicitudes · De liquidación · De pago · De facturación · De oficina · De cierre**, con la
  estética del resto de la app (`nav-tabs contract-tabs` + icono + contador `.contract-tabs__n`).
  ⚠️ `ADMINISTRATION_PENDING_TABS` son TRIPLETAS `(clave, etiqueta, icono)`: al añadir el icono hay
  que tocar también el desempaquetado de `administracion_view` y el `{% for %}` de la plantilla.

- **Validar la factura de una liquidación · el CUADRE en verde o rojo** (ago 2026,
  `_royalty_invoice_checks`): cada importe lleva su marco **verde si cuadra y rojo si no** (con el
  motivo al pasar el ratón) y el marco de fuera resume, para verlo antes de leer los números. Se
  comprueban la **base** (que sea la de la liquidación), el **IVA** (que sea su % de la base), la
  **retención** (que el % cuadre con el importe) y **lo que se paga** (base + IVA − retención).
  ⚠️ **Con retención, lo que se paga es MENOR que lo que se liquida y eso es CORRECTO**: lo que se
  juzga es que el cálculo salga, no que los dos números sean iguales. Un concepto que no se puede
  juzgar (falta el dato) se queda sin marca en vez de darse por bueno o por malo.
  · **Los documentos requeridos se PINCHAN** y se abren en el mismo pop-up que la factura, con
  descargar y **enviar** (correo, WhatsApp, SMS o copiar el enlace): parcial único
  **`templates/_doc_view_modal.html`** (`#payDocModal`) + `static/js/pagos.js`, compartidos con
  «pendiente de pago». Cualquier elemento con `data-pay-doc="<url>"` lo abre.

- **AUTORIZACIONES DE ACCESO A MENORES** — ago 2026. Pestaña **«Menores»** de la ficha de la
  actividad, **solo donde promovemos nosotros** (`_concert_is_ours` → `_concert_is_group_promoted`):
  es nuestra política de menores la que se aplica. ⚠️ Al añadir la pestaña hay que meterla en la
  **lista blanca de `tab`** de `concert_detail_view` (si no, cae a `general` y el panel sale vacío
  sin dar ningún error: bug real de esta épica).
  · **Modelos**: `MinorAuthConfig` (una por actividad: corte de edad 18/16/14 en `MINOR_AGE_LIMITS`,
  tres interruptores `require_guardian_dni`/`require_minor_dni`/`require_email_verification` —todos
  activados por defecto—, leyenda `policy_text`, y **DOS tokens**: `public_token` del formulario y
  `validate_token` del control de acceso; son distintos a propósito, quien valida en la puerta no
  debe poder rellenar autorizaciones con su enlace) · `MinorAuthorization` (tutor PADRE/MADRE/TUTOR
  con su foto del DNI, autorizado —`escort_is_guardian` si acompaña el propio tutor—, consentimiento,
  firma, `qr_token` y `declaration_snapshot`: **la autorización se congela tal como se firmó**) ·
  `MinorAuthorizationMinor`. ⚠️ **El DNI del MENOR no se sube**: solo se apunta el número.
  · **La EDAD nunca se teclea**: la calcula `_age_on` a la **fecha del concierto** (en el navegador y
  en el servidor). Un menor que ya pasa del corte se avisa pero **no se bloquea**.
  · **Hoja pública** `public_minor_auth_form` (`/autorizacion-menores/<token>`, plantilla
  `public_minor_auth_form.html` + `static/js/minor_auth.js`): logo de la empresa arriba a la derecha,
  cabecera con foto del artista + festival + fecha/recinto con dirección completa + hora, tutor,
  menores (varios), autorizado, consentimiento → **declaración con los datos rellenos** → **firma a
  mano** en un canvas → gracias. Los DNI se leen con la cámara (`DocCamera` en modo **`onRead`**,
  nuevo: no consulta al servidor, devuelve los campos y el **recorte de la tarjeta**) o subiendo
  foto/PDF (`DocScan.scan`, que recorta y hace el OCR en el navegador; se guarda la cara con la foto).
  · **Tarjeta con el QR** `public_minor_auth_pass` (a donde apunta el propio QR), PNG del QR y
  **tarjeta en PDF** para el móvil. ⚠️ Un pase **real de Apple Wallet (`.pkpass`) hay que firmarlo con
  un certificado de Apple** (Pass Type ID + clave + WWDR) y Google Wallet pide cuenta de servicio:
  mientras no estén, los botones bajan el PDF con el mismo QR (`_minor_auth_pass_pdf_bytes`).
  · **Correo al tutor** (`_minor_auth_email_html`): logo arriba a la derecha, el texto de gracias, el
  recordatorio **resaltado en amarillo** (`#fff3a3`), los botones de Apple/Google Wallet y la
  **autorización entera incrustada con su QR**. ⚠️ `_send_optional_email` devuelve **`(ok, error)`**:
  tratarla como booleano daba la autorización por enviada aunque el SMTP la rechazase (bug real).
  · **Control de acceso** `public_minor_auth_validate` (su propio token): **UN solo botón** de
  escanear, porque a quien está en la puerta le da igual lo que le pongan delante. Lo resuelve el
  modo **`DocCamera.open({qr:true, onRead})`**: en cada fotograma se prueba primero el **QR**
  (`BarcodeDetector` nativo, milisegundos) y después la **banda del documento**, y vale lo que
  aparezca antes (`onRead` recibe `{qr}` o `{data:{number…}}`). Sin `BarcodeDetector` el DNI se lee
  igual y el QR se pega a mano. También hay búsqueda por cualquier dato: si lo escrito trae «/» o
  pasa de 20 caracteres se manda como **código**, no como dato del menor. `public_minor_auth_check`
  compara el DNI normalizado (`mrz_normalize_doc_number`) y los nombres, y responde «Autorización de
  menores OK» con los datos para contrastarlos con el documento.
  · **Enlaces con QR**: en la pestaña, el del formulario trae su QR **descargable, arrastrable al
  escritorio** (truco `DownloadURL`) **y copiable**; `concert_minor_auth_qr` sirve el PNG.
  · Los QR los hace **`segno`** (puro Python, en `requirements.txt`) vía `_qr_png_bytes`/`_qr_data_uri`.
  · Endpoints públicos en las **tres** listas (`allowed`, `PUBLIC_ENDPOINTS_EXTRA`,
  `_CSRF_EXEMPT_ENDPOINTS`); los de la ficha (`concert_minor_auth_*`) heredan
  `contratacion.conciertos` por la ruta `/conciertos`. Estilos `.mn-*` (pestaña), `.ma-*` (hoja
  pública y tarjeta) y `.mv-*` (control de acceso) en `styles.css`.

- **INVITACIONES · qué se refresca en sitio al subir** (corregido ago 2026). `applyDoc` (el refresco
  sin recargar de `invitaciones.html`) cambiaba los planos y el contador de «disponibles», pero NO
  los de **«Subidas»**: la cabecera del evento y la línea `Configuradas · Subidas · Disponibles` de
  cada categoría se quedaban con el número viejo hasta recargar la página. Ahora llevan sus anclas
  (**`data-inv-header-counts`** y **`data-cat-head="<id>"`**) y se reemplazan también.
  ⚠️ Y si la categoría **cambia de estructura** —la PRIMERA subida en una categoría vacía crea el
  grid donde antes ponía «No hay invitaciones subidas»— no vale reemplazar pieza a pieza, porque esas
  piezas todavía no existen en la página: se cambia el **panel entero** (`data-cat-panel`) y esa
  categoría se salta en los reemplazos finos. ⚠️ Los planos de los paneles ya cambiados se excluyen
  de las DOS listas (la del documento nuevo y la del vivo): `replaceWith` MUEVE el nodo, así que
  filtrando solo una los números dejaban de casar y no se refrescaba ninguna otra categoría.
  ⚠️ El botón «Seleccionar varias» vive en esa cabecera, así que su listener pasa a ir por
  **delegación**: pegado al botón se quedaba muerto en cuanto la cabecera se reemplazaba.

- **Cartelería · petición, subida a mano y aprobación de diseño** (aprobar es SOLO de diseño y
  dirección: `_can_validate_artwork` = `is_master() or has_access_key('diseno')`; lo que sube diseño
  entra ya APROBADO y lo que sube cualquier otro queda PENDIENTE —al resto se le enseñan atenuados con
  la etiqueta «Pendiente», sin botones de aprobar): con el evento sin peticiones se
  dice «Sin peticiones» y sale **UNA sola** opción según quién promueve (empresa del grupo →
  *Realizar petición a diseño*; promotor externo → *Solicitar al promotor*, usando
  `_concert_is_group_promoted`), más **Subir carteles**. La subida a mano
  (`concert_artwork_upload_direct`, modal `#artworkUploadModal`) admite **arrastrar carpetas enteras**
  (se recorre el árbol con `webkitGetAsEntry` y se sube cada archivo, no la carpeta) y deja los
  carteles en `validation_status='PENDING'`: se ven pero **no se pueden usar** hasta que diseño les dé
  el OK **uno a uno** (`concert_artwork_asset_review`, igual que las fotos). Al rechazar se pide la
  nota de qué cambiar: el cartel sale en su sección **«Rechazados por diseño»** con el aviso y a quien
  lo subió (`ConcertArtworkAsset.uploaded_by_user_id`) le aparece en **Inicio** el módulo
  `HOME_ARTWORK_REJECTED` (`_home_artwork_rejected`). Compartir: por cartel (correo/WhatsApp/SMS/
  copiar enlace/descargar) y de todos (los mismos + **copiar los enlaces** + **descargar todos** en ZIP,
  `concert_artwork_download_all`). El principal se elige a mano o lo pone el más cuadrado al aprobar.
  **Módulos que solo salen cuando toca**: «Solicitud realizada» (con el detalle de lo pedido DENTRO:
  formatos, vídeo, logos, ticketeras y notas — no hay módulo «Detalle de la solicitud» aparte) aparece
  únicamente si hay una petición de verdad (`requested_at` o estado REQUESTED/PROMOTER/CORRECTIONS);
  «Formatos subidos», solo si hay carteles (aprobados, rechazados o antiguos).

- **CARTELERÍA · ENLACE PÚBLICO para verla y descargarla** (ago 2026): `/carteles/<token>`
  (`public_artwork_view`, plantilla `public_artwork.html` standalone). Estilo de casa: el logo de la
  empresa del grupo arriba a la **derecha**, **«Cartelería»** centrado, la **cabecera de la actividad**
  igual que en la app (`_contract_sheet_hero_rows`), **«Descargar Cartelería»** centrado y debajo los
  formatos: cada uno con su **proporción DIBUJADA**, su tamaño en píxeles, su extensión y la
  miniatura, que se pincha para descargarlo (más «Descargar todos en un ZIP»).
  ⚠️⚠️ Antes se compartía **la pestaña de la app** (y, al «compartir los carteles», la lista de URLs
  de **Storage**): quien lo recibe —el artista, el promotor— **no tiene usuario**, así que el botón
  «Descargar Carteles» del aviso de salida a la venta le llevaba a la pantalla de acceso (bug real).
  Ahora ese botón y el menú «Compartir con el artista / con el promotor» mandan este enlace, y desde
  la pestaña se puede **ver la página que van a recibir**.
  · Puntos únicos: **`_concert_artwork_share_assets`** (los carteles APROBADOS de la actividad y, si
  no tiene, los de TODA su gira o ciclo — lo mismo que enseña el aviso), **`_concert_artwork_share_url`**
  y `_artwork_zip_response` (el ZIP, compartido con la descarga de dentro).
  ⚠️ El token es **OPACO y DISTINTO** del de `ConcertArtworkRequest`: con ese se **suben** carteles y
  con este solo se ven y se descargan (mismo criterio que los dos tokens de las autorizaciones de
  menores). Vive en `Concert.artwork_share_token` y se crea la primera vez que hace falta.
  ⚠️ **La ruta es `/carteles/…`, NO `/carteleria/<token>`**: esa ya la tiene el formulario donde diseño
  o el promotor SUBEN los carteles, y dos reglas iguales se pisan — gana la primera, así que la página
  no se habría podido abrir nunca y **sin dar ningún error**.
  ⚠️ **Nunca sale la dirección de Storage**: la miniatura y la descarga van por
  `public_artwork_file` / `public_artwork_download` (nuestro dominio), y un cartel que no sea de esa
  actividad —o rechazado— da 404. Esos enlaces son **relativos** (son de la propia página); el
  absoluto con host canónico se reserva para lo que se comparte fuera y para la miniatura `og:`.
  ⚠️ El tamaño de cada miniatura se calcula **en píxeles en el servidor** (`frame_w`/`frame_h`, dentro
  de un hueco fijo para que todas las tarjetas midan igual): dejándolo a `aspect-ratio` + `max-width`
  en el CSS, un banner 4:1 se quedaba **casi cuadrado** (el navegador recortaba el ancho pero no
  bajaba el alto).

- **Flecha de VOLVER (toda la app)**: la flecha gris de arriba a la izquierda (`.btn-volver`) y
  cualquier enlace cuyo texto, `title` o `aria-label` empiece por «Volver»/«Atrás» llevan **a la
  página de la que venías**, no a un destino fijo: el bloque «volver inteligente» de `scripts.js`
  hace `history.back()` cuando el `document.referrer` es de la propia app **y distinto de la página
  actual** (tras un POST+redirect el referrer es la propia ficha, y ahí retroceder no serviría).
  Si no hay de dónde volver (enlace directo, pestaña nueva) se sigue el `href`, que es el destino
  «padre» de esa pantalla. Opt-out: `data-no-smart-back`. Cmd/Ctrl/⇧/clic central no lo interceptan.

- **Cartelería de TODA una gira / ciclo / evento**: `ConcertArtworkRequest` admite dueño GRUPO
  (`group_kind` TOUR|CYCLE + `group_id`, con `concert_id` NULL): una sola solicitud para todas sus
  fechas. Panel reutilizable `templates/_artwork_group_panel.html` (contexto `_artwork_group_context`)
  en la pestaña **Cartelería** de la ficha del grupo y, con `gk_readonly`, como **módulo aparte**
  dentro de cada fecha, separado de los carteles de esa fecha. Endpoints `group_artwork_*`
  (subir con carpetas, revisar uno a uno, principal, eliminar, descargar todos). Al haber dos módulos,
  la cabecera de la pestaña de la fecha ofrece **«Compartir todos los carteles»** (los dos lotes) y cada
  módulo mantiene el suyo.
- **Módulo de CACHÉS solo si hay cachés**: un evento puede tener artistas con caché o solo socios, así
  que si la actividad no trae ninguno (ni de la simulación ni del alta) no se pinta el módulo: queda un
  botón discreto **«Añadir caché»** que abre el formulario (mismo `data-edit-toggle`).
- **Responsable de PRODUCCIÓN** (`Concert.production_owner_user_id`): en un EVENTO (que no es de ningún
  artista) o en una fecha de gira comprada que promueve una empresa del grupo no hay artista del que
  colgar el trabajo, así que **al confirmar** se pregunta a quién de producción le toca
  (`_concert_needs_production_owner` + `_production_people`, modal `#prodOwnerModal` que se abre solo si
  está confirmada y sin responsable). Se guarda con `concert_production_owner_save` y se ve en la
  cabecera de la ficha.
  · **ACTIVAR LA PRODUCCIÓN es de quien crea la actividad** (ago 2026): activar = decir QUIÉN de
  producción se encarga. `Concert.created_by_user_id`/`created_by_nick` (los rellenan los tres sitios
  donde se crea un `Concert`) + `production_activated_at`. Mientras no haya responsable, la actividad
  le sale a quien la creó en el módulo de Inicio **«Activar la producción»**
  (`_home_production_activation_pending`: dice «Activar producción», o **«Asignar producción»** si ya
  tiene bolsa —la producción estaba en marcha sin responsable—; dirección ve además las antiguas, que
  no tienen creador apuntado). En la ficha hay botón **«Activar producción»** en la cabecera siempre
  que haga falta (`_concert_production_pending`); el modal se abre SOLO en los casos de antes
  (`ask_production_owner`).
  · ⚠️⚠️ **EN EL SELECTOR SALE TODO EL PERSONAL, con los de PRODUCCIÓN PRIMERO** (ago 2026).
  `_production_people` devolvía **solo** a los del departamento, y el resto era un respaldo que
  entraba **únicamente si NADIE lo tenía**: a quien tuviera el departamento mal escrito (o sin poner)
  **no se le podía elegir**, porque los demás sí lo tenían (bug real: «no me aparece María de
  producción»). Ahora devuelve a **todo el personal actual** con la marca `in_production`, y el
  selector único (`_prod_owner_picker.html`) pinta a los del departamento arriba y el resto detrás de
  **«Ver todo el personal»** — asignar una producción no puede depender de cómo esté escrito un
  departamento. En las rejillas del asistente y de la ficha de promoción, quien no es del
  departamento sale con la etiqueta «· fuera de producción».
  ⚠️ El listado de Producción calcula la lista **siempre** (antes solo si había actividades sin
  asignar, así que al cambiar el responsable de una ya asignada el selector salía vacío).
  · Historia de lo anterior: había casos en los
  que faltaba gente en el selector. Tres causas, las tres arregladas en `_production_people`:
  (a) el departamento se comparaba buscando la cadena exacta «producción» dentro de la lista, y ahora
  se usa **`_profile_in_department`** (normaliza contra `PERSONNEL_DEPARTMENTS`: caja, acentos y
  alias); (b) **`departments` puede estar guardado como TEXTO** en filas antiguas y recorrer un texto
  con un `for` devuelve LETRAS —esa persona no casaba con nada y desaparecía **sin dar ningún error**—,
  así que se lee siempre con **`_departments_iter`**; y (c) el JOIN con el perfil era INTERNO (quien no
  tiene perfil desaparecía incluso de la lista de respaldo) y ahora es **externo**. Además, la ficha de
  la actividad calcula la lista **SIEMPRE** (antes solo cuando faltaba responsable, así que al cambiarlo
  desde la rueda no salía nadie) y el modal `#prodOwnerModal` se pinta con solo poder editar.

- **PRODUCCIÓN EXTERNA · la lleva un TERCERO, con su propio acceso** (ago 2026). El responsable de
  producción de una actividad puede ser alguien **de fuera**. El selector «¿Quién lleva la
  producción?» es ya **uno solo** (`templates/_prod_owner_picker.html`, usado por la ficha de la
  actividad y por el listado de Producción) con dos pestañas: **personal de la oficina** (las
  tarjetas de siempre) y **un tercero** (buscador con su foto o su logo + el «+» del alta rápida).
  · **Cómo funciona por dentro**: al tercero se le crea un **USUARIO ESPEJO**
  (`UserProfile.is_external`, correo sintético `produccion-externa+<id>@…`) y
  `Concert.production_owner_user_id` apunta a él, así que TODO lo que ya existía (tareas, listados de
  producción, avisos, quién cierra la bolsa) funciona **sin casos particulares** — el mismo patrón que
  el modo «Ver como». Lo único propio es la **compuerta** `_external_prod_gate`, lo PRIMERO del
  enforcement, que en una sesión externa deja pasar solo lo de SU actividad
  (`_external_prod_target_ok`: por `cid`, por la bolsa vinculada o por la entidad de la hoja de ruta).
  Sus permisos son solo `produccion` (ver+editar) y `databases.bags` (con económico: la bolsa ES
  dinero). `Concert.production_owner_promoter_id` guarda de quién se trata.
  · **Cómo entra**: enlace propio `/produccion-externa/<token>` → escribe **su correo** (tiene que ser
  el de su ficha; no se dice cuál es el bueno) → le llega un **número de verificación** de 6 cifras
  (20 min, 6 intentos) → entra y se le lleva a la pestaña Producción de su actividad. En el menú sale
  una franja roja con su nombre y el botón **Salir**; el menú de secciones no se le pinta.
  · **Su acceso TERMINA al cerrar la bolsa** y pasar a administración, y **vuelve** si la bolsa se
  reabre (rechazo o algo que modificar). ⚠️ Eso **no se sincroniza**: se MIRA la bolsa
  (`_external_prod_open`), así no puede quedar desparejado — la misma regla que `_notify_resolve`.
  · **Los usuarios espejo no son personal de la casa**: `_inactive_user_ids` los excluye (y con eso
  desaparecen de golpe de todos los selectores y listados que ya usan ese punto único, incluido
  `_production_people`), y **no pueden entrar por el login normal** (se les dice que usen su enlace).
  ⚠️⚠️ **EL LOGIN VIVO es `_admin_login_extended`**, no la función `admin_login`: al final del bloque
  hay `app.view_functions["admin_login"] = _admin_login_extended`, así que la primera es **código
  muerto**. Un cambio en el login que se haga ahí no se ejecuta (bug real de esta épica).
  ⚠️ `Concert.promoter` necesita **`foreign_keys`**: con el tercero de producción hay DOS caminos de
  `concerts` a `promoters` y SQLAlchemy no arranca sin decírselo.
  ⚠️ Los cuatro endpoints van en las **listas de públicos** (`allowed` × 2 y `PUBLIC_ENDPOINTS_EXTRA`)
  y conservan CSRF (el formulario es nuestro).

- ⚠️ **MANDAR A PRODUCCIÓN = decir QUIÉN se encarga** (corregido ago 2026): la tarea de Contratación
  «Sin mandar a producción» miraba solo si había BOLSA, así que las actividades de antes de que
  existiera «activar producción» —que tienen responsable y no tienen bolsa— la arrastraban para
  siempre. Con responsable ya está mandada (y le sale a esa persona como tarea suya).

- **La RUEDA de la ficha de una actividad va en la FILA DE BOTONES**, a la derecha del todo
  (`.ficha-quick__gear`), no en la cabecera. Dentro: quién lleva la producción, reenviar el acceso al
  productor externo (solo si lo produce un tercero), avisar al artista y eliminar la actividad.

- **Producción → ACTIVAS por sujeto** (ago 2026, `_production_active_rows` + `_production_active_context`):
  igual que la sección Actividades — rejilla de **artistas y eventos** con su nº y, al entrar, sus
  actividades con la fila `.oa-row` y el **icono de su tipo**. **Cada persona de producción ve SOLO lo
  que se le ha asignado** (`production_owner_user_id`); dirección y quien no es de producción lo ven
  todo. Lo que **no tiene responsable** no es de nadie: sale en su bloque «Sin responsable» (para que
  no se pierda) y es tarea de quien la creó. **«Nueva actividad»**: se compara `created_at` con
  `UserProfile.production_seen_at`, que se marca al mirar la REJILLA (no al entrar en un artista, para
  que el destacado siga estando donde hay que verlo).
  ⚠️ Dos trampas reales de esto: `production_seen_at` hay que añadirlo a **`_snapshot_user_profile`**
  (lo que no esté ahí es invisible desde `_current_user_state`) y **quién es dirección se decide con
  `estado["role"]`**, no con `is_master()`: ese lee el rol de la SESIÓN y sin él cae a 10, con lo que
  producción vería todo.

- **UN AVISO SE CIERRA SOLO CUANDO LO SUYO YA ESTÁ HECHO** (ago 2026). Un aviso dice «esto te está
  esperando»: si lo que esperaba ya está resuelto tiene que desaparecer sin que nadie lo pinche (pasó
  con «remesa pendiente de aprobación» de una remesa **ya aprobada y pagada**). Punto único
  **`_notify_resolve(session_db, ref_type, ref_id)`**, ya enganchado en: remesa (aprobar/anular/
  justificante), **gasto pagado del todo** (a mano y por remesa), **bolsa cerrada o archivada**,
  **pitch escrito**, **vacaciones decididas** (también para los demás que gestionan) y **actividad
  borrada** (su aviso llevaría a una ficha que ya no existe).
  ⚠️ El `ref_type` se compara **sin distinguir mayúsculas**: los avisos se crean con «CONCERT»,
  «concert» y «payment_batch» según el sitio, así que una resolución con otra caja no cerraba nada
  **y no daba ningún error** — parecía que el aviso «no se iba».

- **AUDITORÍA ago 2026 · lo que se encontró roto y se ha corregido**:
  · **`/canciones` daba un 500** en cuanto el artista tenía una canción: precargaba `s.interpreters`
  y **`Song` no tiene esa relación** (los intérpretes se leen con `_song_interpreter_rows_map`).
  ⚠️ Esa pantalla no la enlaza ningún menú (el repertorio vive en Discográfica) y su bloque
  `{% if active_tab == 'alta' %}` es **inalcanzable** (`concerts_view` reescribe `alta` → `vista`).
  · **La factura de royalties rechazada dejaba el proceso muerto**: `administration_royalty_invoice_validate`
  volvía la liquidación a «enviada» pero **no soltaba `invoice_id`**, así que para el resto de la app
  seguía facturada (el mismo fallo que ya se corrigió en la base de facturas, en el otro camino). Y el
  correo al proveedor era un «vuelve a subirla» **sin decir dónde**: ahora lo compone
  `_supplier_invoice_reject_notify`, el mismo de la base de facturas, que lleva el **enlace** para
  subir la corregida.
  · **Mensajes que mentían**: se decía «aviso enviado al proveedor» sin mirar si el correo había
  salido (`_send_optional_email` devuelve `(ok, error)`). Corregido ahí y en el rechazo de una
  petición de marketing y de una de invitaciones: si no sale, se dice.
  · **Siete `except: pass` que se tragaban un aviso** pasan a `app.logger.exception(...)`: el flujo
  principal sigue igual, pero deja rastro en el log en vez de desaparecer sin más.
  · Comprobado además, sin encontrar nada: todas las llamadas HTTP y a `subprocess` llevan
  **timeout**; ningún `url_for` de las plantillas apunta a un endpoint inexistente; ningún
  `data-inline-target` apunta a una zona que no existe; ninguna función de `onclick` está sin
  definir; **118 pantallas sin parámetros, 53 con id real, 83 pestañas y 112 rutas con un id
  inexistente** responden sin error de servidor.

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

- **CÓMO SE AVISA A CADA UNO · correo o SMS** (ago 2026). Regla: al mandar una **NOTIFICACIÓN** (no
  al «compartir» algo) se pregunta cómo se manda, **pero solo si esa persona tiene MÁS DE UNA
  opción**: con solo correo va por correo y con solo teléfono por SMS, sin preguntar nada. Si en un
  envío hay varias personas, se ve **quién por SMS y quién por correo con iconos** y se cambia una por
  una. **El de por defecto es SIEMPRE el correo**, salvo que la persona haya dicho que prefiere SMS.
  · **La preferencia vive en el TERCERO** (`Promoter.notify_channel`, EMAIL|SMS) y se pregunta en su
  ficha —dentro del bocadillo «Datos de contacto», con los dos iconos— **solo si tiene correo Y
  teléfono**: con una sola cosa no hay nada que elegir, así que el bloque no se pinta (y aparece o
  desaparece en vivo según se rellenen los dos campos). ⚠️ Si se queda con un solo dato, la
  preferencia **se borra** al guardar: `promoter_update` lo fuerza.
  · **Punto único**: `_notify_channel_options(email, phone, preference)` → `{channels, default, ask}`
  (⚠️ el SMS solo cuenta si el teléfono es creíble —`sms_utils.normalize_phone`— **y si la pasarela
  está configurada y encendida**: `_sms_available()`, cacheado en `g`. Ofrecer «SMS» sin poder
  mandarlo sería un botón que no funciona, y la pantalla lo dice: «los avisos por SMS están sin
  configurar, así que todo va por correo»), y
  **`_notify_apply_prefs(session_db, rows)`**, que es lo que llama cada pantalla: rellena la
  preferencia de los que sean terceros (`_promoter_notify_pref_map`, UNA consulta) y calcula el canal
  de cada uno. `_notify_summary` da el «Por correo: … · Por SMS: …» y `_notify_send_row` manda.
  · **La UI es un parcial reutilizable**: `templates/_notify_channel_picker.html` (`np_rows`, y
  `np_checks` para las casillas de a quién) + **`static/js/notify_channel.js`** (global, por
  delegación: estas listas se repintan por AJAX). Quien tiene una sola opción **no ve un botón**: ve
  el dato. Debajo, el resumen en vivo.
  · **Dónde está enganchado**: la pantalla de **comunicar la salida a la venta** (interactiva: los
  iconos por persona) y los **envíos MASIVOS de invitaciones** —el del evento entero y el de una
  categoría—, que **no preguntan nada**: cada uno por su canal (`_invitation_mass_contact` +
  `_invitation_mass_send_one`, el punto único de las tres vueltas: solicitudes, categoría y
  compromisos). ⚠️ Ahí, si toca SMS y el SMS no sale (pasarela sin configurar, sin saldo) **se manda
  el correo**: un envío masivo no se puede perder. Y quien solo tiene teléfono ya no cuenta como «sin
  email»: recibe el SMS con el enlace de descarga.
  ⚠️ Un destinatario marcado que NO está en la lista configurada (una pantalla vieja, un correo
  escrito a mano) se trata como añadido, no se tira.
  · Lo que **falta por enganchar**: la pantalla de **avisar al artista** (tiene su propio selector
  global correo/WhatsApp/SMS, donde WhatsApp abre el móvil: se rediseña aparte) y los correos
  automáticos a terceros (liquidaciones, peticiones de factura…), que siguen saliendo por correo.

- **CORREO · por qué los avisos acababan en SPAM** (ago 2026). Lo que decide que un correo llegue NO
  es el código: son **tres registros DNS** del dominio del remitente (**SPF** — qué servidores pueden
  mandar en su nombre; **DKIM** — la firma; **DMARC** — qué hacer con lo que no cuadre). Un correo que
  dice venir de `@33producciones.es` desde un servidor que ese dominio no autoriza es, para Gmail y
  Outlook, **falsificado**. Eso se arregla en el DNS y con un servicio de correo de verdad (desde una
  IP de Render sin reputación, la mitad va a spam), no aquí.
  · Lo que sí era de la app y ya está hecho, todo en el punto único `_send_optional_email`:
  ⚠️ **UN correo por persona**, no uno con veinte direcciones en el «Para»: eso parecía un envío
  masivo, le enseñaba a cada uno el correo de los demás y una dirección que rebota castigaba a todo
  el envío. Se manda por **UNA sola conexión** SMTP, así que no es más lento.
  ⚠️ **Versión en TEXTO de verdad** (`_html_to_text`, saca el texto y deja los enlaces entre
  paréntesis): antes, sin `text_body`, la parte de texto era «Este mensaje contiene una versión
  HTML…», que es una señal clásica de spam.
  ⚠️ **`Date` y `Message-ID`** en cada mensaje (`smtplib.send_message` NO los añade) y el Message-ID
  **del mismo dominio que el From**, para que DKIM/DMARC cuadren. Más `Auto-Submitted` y
  `X-Auto-Response-Suppress`, que es lo que corresponde a un aviso de una máquina.
  ⚠️ El nombre del remitente por defecto era **«Radio Spins App»**, una marca que el que lo recibe no
  conoce (ayuda a que parezca phishing): ahora «33 Producciones».
  · **Si sale para unos y no para otros, se dice**: `_send_optional_email` devuelve `(True, "No salió
  para: …")` en vez de dar el envío por bueno.
  · **Pestaña «Correo» en Integraciones** (`_smtp_settings`, `smtp_send_test`): enseña con qué se está
  mandando (servidor, puerto, cifrado, remitente — **la contraseña nunca**), avisa si el **dominio del
  remitente NO coincide** con la cuenta con la que se autentica (que es la causa típica), deja mandar
  una prueba y tiene escritos los tres registros DNS y el orden en que hay que atacarlo.

- **ENLACES CORTOS · en los SMS se acortan solos** (ago 2026): una URL nuestra se come 90 de los 160
  caracteres de un SMS, así que `_send_optional_sms` los cambia por
  `https://app.33producciones.es/l/aB3xY9` (38) — punto único **`_shorten_links_in_text`** +
  **`_short_link_for`** (modelo `ShortLink`, `ensure_short_links_schema`).
  · El acortador es **NUESTRO** a propósito: en un SMS un dominio desconocido huele a estafa, no
  depende de nadie y no se le cuenta a un tercero quién abre qué. Un destino tiene SIEMPRE el mismo
  código (índice UNIQUE por URL), así que no se crea uno nuevo en cada envío.
  ⚠️ **Solo acorta enlaces DE CASA** (`_is_own_url`): un acortador que admita cualquier URL es una
  herramienta de phishing con nuestro dominio delante. Lo de fuera (una ticketera, por ejemplo) se
  queda tal cual.
  ⚠️ **El salto es un 301 a la URL de verdad**, no una página intermedia: así el móvil que pinta la
  **PREVISUALIZACIÓN** del SMS sigue la redirección y lee las `og:` del destino. Comprobado de verdad:
  `curl -L` sobre `/l/<code>` devuelve el `og:title`, la `og:description` y la `og:image` de la página
  de destino, y la imagen sale 1200×630 JPEG.
  ⚠️ El acortado va **ANTES de recortar** el texto: si no, el recorte contaría los 90 caracteres de la
  URL larga y se comería el mensaje.
  ⚠️ **La previsualización de un SMS la pinta el MÓVIL que lo recibe** leyendo la página (no se puede
  «adjuntar»): nuestra parte es que la página sea pública, tenga `og:` con imagen **1200×630 y su
  `og:image:type`/`width`/`height`** (sin eso, WhatsApp y los móviles descartan la foto) y que el
  enlace vaya AL FINAL del mensaje.
  · **EL DOMINIO CORTO SE PONE DESDE LA APP** (`SmsAccount.short_domain`, Integraciones → SMS): se
  pega como sea («https://33p.es/», «33p.es/l») y `_short_domain_clean` se queda con el host; funciona
  **en cuanto se guarda**, sin tocar Render, y la pantalla enseña cómo van a salir los enlaces
  (`https://33p.es/l/aB3xY9` → 23 caracteres en vez de 38). `_short_link_base()` va en ese orden: lo
  de la app → la variable `SHORT_LINK_BASE` → el dominio de siempre (cacheado en `g`).
  ⚠️ El dominio hay que **apuntarlo al mismo servidor** (un CNAME al host de la app y añadirlo en
  Render como dominio del servicio): la app responde en él sin más porque `/l/<code>` no depende del
  host, pero si el DNS no apunta, el enlace no abre. La pantalla lo dice.

- **PREVISUALIZACIÓN de un enlace INTERNO · el icono de la casa** (ago 2026): un aviso al personal
  lleva a una pantalla de la app, que pide entrar, así que lo único que se puede enseñar en la tarjeta
  (del SMS o de WhatsApp) es la MARCA. `layout.html` emite unas `og:` **fijas** —«33 Producciones ·
  Back office», «Entra en la app para verlo»— con la imagen de **`og_default_image`**
  (`/og-default.jpg`): el favicon de la casa a **1200×630 sobre blanco** (`_og_image_jpeg_bytes`,
  cacheado en memoria). Como cualquier enlace interno acaba en la pantalla de acceso, y esa se pinta
  con `layout.html`, la tarjeta sale sola.
  ⚠️ El texto es **fijo a propósito**: nada del contenido de la pantalla sale en la previsualización.
  ⚠️ Las páginas PÚBLICAS no usan esto: son standalone y traen su propio `og:` (su portada, su cartel,
  su foto del artista).

- **AVISOS POR SMS** (ago 2026): la campanita y el correo llegan tarde si nadie mira; un SMS entra en
  el móvil. Cliente en **`sms_utils.py`** (módulo aislado, sin BD ni Flask, como `holded_utils.py`),
  con tres pasarelas: **LabsMobile** (España, la recomendada), **Esendex** y **Twilio**. Se configura
  **desde la app** en Integraciones → **SMS** (`SmsAccount`, una sola cuenta para toda la casa: lo que
  identifica quién escribe es el REMITENTE, no la cuenta). **Nada en el `.env`**.
  · Punto único **`_send_optional_sms(session_db, to, text, ...)`** → `(ok, error)`, hermano de
  `_send_optional_email`, así que cablear un aviso nuevo es una línea. Enganchado en **`_notify_user`**:
  al lado de la campanita y del web push.
  · ⚠️ **CADA SMS CUESTA DINERO**, así que **nace TODO apagado**: en la pestaña se elige qué tipos de
  aviso salen también por SMS (`SMS_NOTICE_KINDS`, 12 tipos, guardados en `SmsAccount.notice_kinds`) y
  hay un **tope diario** (`daily_cap`, 200 por defecto) como red de seguridad para que un fallo no se
  lleve el saldo. El SMS de prueba se salta el tope (`force=True`).
  · ⚠️ **LOS ACENTOS PARTEN EL MENSAJE**: 160 caracteres en GSM-7, pero **70** en cuanto aparece una
  á/í/ó/ú (é, ñ y ü sí están), y **cada trozo se cobra**. `sms_utils.segments()` lo cuenta,
  `strip_accents()` lo arregla sin cambiar lo que dice, y por defecto está puesto quitarlos
  (`avoid_accents`). `max_segments` recorta para no gastar de más.
  · **El patrón del texto es «frase corta + enlace»** a la página pública que ya tenemos de cada cosa
  (`_notify_sms` compone título + cuerpo + el enlace del aviso con el host canónico). No hay adjuntos
  ni formato: para eso está el correo.
  · **Todo envío queda registrado** (`SmsMessage`: a quién, qué, trozos, estado y el motivo del error)
  y se ve en la pestaña: un SMS que no sale **no puede ser invisible**. «Hoy: N» cuenta solo los que
  salieron.
  · **Teléfonos**: `sms_utils.normalize_phone` los deja en +34… (un móvil español de 9 dígitos que
  empieza por 6 o 7 se completa solo). El del personal sale de `UserProfile.mobile_phones`
  (`_user_sms_phone`); quien no tenga móvil puesto simplemente no recibe SMS. Esa normalización vale
  igual para WhatsApp el día que se añada.
  ⚠️ **iMessage (los mensajes azules) NO se puede mandar desde un servidor**: Apple no tiene API para
  eso (lo que existe es para que el cliente escriba a la empresa). Todo sale como SMS.
  ⚠️ **LabsMobile contesta los errores con un HTTP 200** y el motivo en el cuerpo
  (`{"code":"401"}`) — el mismo caso que Holded: mirando solo el código HTTP, un SMS que no ha salido
  parecería enviado. Comprobado contra su API real, igual que las rutas y el esquema de auth de las
  tres pasarelas (con credenciales falsas todas contestan 401/403, no 404).
  ⚠️ Un **remitente alfanumérico** («33PROD», hasta 11 caracteres) **no admite respuesta**: es lo
  normal para avisos; si hace falta que contesten, la pasarela tiene que dar un número largo.
  ⚠️⚠️ **EN ESPAÑA EL REMITENTE CON LETRAS HAY QUE REGISTRARLO** y, mientras no lo esté, las
  operadoras **bloquean el mensaje**: llega a la pasarela y sale ahí como error (el registro de la app
  dice «Enviado» porque la pasarela lo aceptó). Por eso el campo **se puede dejar VACÍO** —
  `sms_account_save` lo borra si llega vacío y el cliente entonces no manda `tpoa`, así que sale con
  el número de la pasarela— y es la forma de comprobar si el problema era ese. La pestaña lo explica
  y lleva una lista de qué mirar cuando el registro dice «Enviado» y el SMS no llega: saldo, cuenta
  sin validar, remitente sin registrar y modo de prueba.
  · Configurarla es de **dirección** (los endpoints `sms_*` van a la sección `integraciones` y
  comprueban `is_master()`).

- **AVISOS cuando te asignan algo** (`AppNotification` + `ensure_notifications_schema`, ago 2026):
  campanita en el navbar con lo no leído + **aviso emergente** abajo a la derecha que salta **una
  vez** por aviso (`shown_at`), y —si el servidor tiene claves VAPID— el MISMO aviso sale como
  notificación del **sistema** por Web Push (en el Mac, la del propio Mac: `_send_web_push` ya
  existía). Punto único **`_notify_user` / `_notify_users`** (⚠️ **no se avisa a uno mismo**) +
  `_department_user_ids` para saber a quién. Enganchado a: **producción asignada**
  (`concert_production_owner_save`), **solicitud de diseño** (`_send_artwork_request_email`, a todo
  Diseño), **petición de pago** (`bag_expense_request_payment`) y **bolsa cerrada para liquidar**
  (a los responsables de esa categoría de administración y, si no hay nadie asignado, a todo el
  departamento). Endpoints `notifications_list` (`/avisos`, con `?nuevos=1` para el emergente) y
  `notifications_mark_read`, los dos en `PERSONAL_ENDPOINTS` (cada uno ve solo los suyos).
  UI: `static/js/notificaciones.js` (global, no-op sin sesión) + estilos `.notif-*`.
  ⚠️ **Las notificaciones del sistema necesitan las claves VAPID en Render**
  (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`): sin ellas la campanita y el emergente
  funcionan igual, pero no salta nada fuera del navegador. En iPhone/iPad hace falta además instalar
  la web como PWA.

- **Documentos CADUCADOS: aviso automático y renovación por enlace** (`PersonDocRequest`): un cron
  diario (`/cron/documentos-caducados?key=DOCS_CRON_KEY`, acepta también la de gastos/Chartmetric)
  repasa DNI, carnets y pasaportes con `expiry_date` pasada y le escribe a cada persona
  (`_person_docs_expired_sweep`; no insiste: un correo por documento cada `PERSON_DOC_REMIND_DAYS`
  = 30 días). El correo lleva un botón al enlace público **`/documento/<token>`**
  (`public_document_renew`, standalone, exento de login y CSRF): sube las dos caras (una en el
  pasaporte), `DocScan` recorta y lee **número, nacimiento, caducidad y expedición**, se le enseñan
  para que dé el visto bueno y al enviarlo el documento nuevo **SUSTITUYE al anterior** (se borra) y
  sus datos oficiales pasan a la ficha. El enlace se marca DONE y no se puede reutilizar.
  **El CARNET DE CONDUCIR no se pide nunca solo**: ni en el alta desde documento (que solo ofrece DNI
  y pasaporte) ni en el alta pública de terceros (el bloque va tras `ask_license`); se pide
  expresamente desde la pestaña Documentos de la ficha con **«Solicitar carnet de conducir»**
  (endpoint `person_doc_request_send`, en `SUPPORT_ACTION_ENDPOINTS`; hay también «Solicitar DNI» y
  «Solicitar pasaporte»). Si no hay SMTP o falla el correo, la respuesta trae el enlace para copiarlo.

- **HOLDED · CONTABILIDAD del grupo** (ago 2026). Cliente en `holded_utils.py` (API Key en la
  cabecera `key`; **una cuenta por empresa del grupo** en `HoldedAccount`, se edita en Integraciones
  → Holded con una **subpestaña por empresa**, `ensure_holded_schema`). Nada en el `.env` salvo
  `HOLDED_CRON_KEY`.
  · ⚠️ **Holded manda errores con un HTTP 200**: `{"status": 0, "info": "..."}`. `_check_payload` los
  convierte en `HoldedError`; mirar solo el código HTTP daba por creado un documento que no existía.
  · ⚠️ **Lo que no se puede dar por bueno a ciegas se COMPRUEBA**: después de crear el documento se
  relee (`verify_document_total`) y se compara el total con el nuestro. Si no cuadra se avisa en el
  gasto (`holded_warning`) en vez de callarlo — es la red de seguridad del mapeo de impuestos.
  · **Rutas que se descubren solas** (mismo patrón que la URL base de Cabify): la de **adjuntar** el
  documento y la del catálogo de **formas de pago** se prueban entre varias candidatas y se guarda la
  que responde (`HoldedAccount.endpoints`). El tipo de documento de los **tickets** lo detecta
  «Probar conexión» con un GET (`detect_ticket_doc_type`): facturas → `purchase`, tickets y gastos
  sin ticket → `dailyexpense`.
  · ⚠️⚠️ **LO QUE ES FACTURA SUBE COMO FACTURA Y LO QUE NO, COMO TICKET** (ago 2026). En la **v1** son
  dos documentos distintos de Holded y se respeta (`purchase` / `dailyexpense`). En la **v2** solo
  existe `purchases` (sus recursos de compra son `purchases`, `purchase-orders` y `receipt-notes`: NO
  hay «gasto/ticket»), así que un ticket se sube como compra **marcada**: etiqueta «Ticket», el
  concepto con «Ticket · …», la nota «Gasto sin factura» y **sin número ni fecha de emisión** (un
  ticket no los tiene). La pantalla de Integraciones lo dice cuando la cuenta va por la v2.
  · ⚠️⚠️ **A HOLDED VA EL NOMBRE DE LA FACTURACIÓN, NO NUESTRO NICK** (punto único `_billing_name`):
  la razón social de la sociedad o el **nombre y apellidos** de la persona (los datos oficiales), y
  solo como último recurso el nick. Con el nick, en Holded salía «Perico» en vez de «Pedro Ruiz
  Salas» y el contacto no cuadraba con su factura. Se usa en los gastos y en las liquidaciones.
  · ⚠️ **EL Nº DE FACTURA está en el gasto O EN SU FACTURA**: al subirla por el enlace del proveedor
  queda en la factura, así que mirando solo el gasto se subía **sin número** (y una factura de compra
  sin número no vale). Lo mismo con la fecha de emisión.
  · **La dirección del contacto es la FISCAL** y va en piezas (dirección, CP, municipio, provincia y
  país; en la v2, dentro de `bill_address` con su `country_code`): es lo que Holded necesita para dar
  de alta al proveedor.
  · ⚠️ **EL TAG es el NOMBRE DE LA BOLSA** (`_accounting_bag_tag` → `_accounting_bag_label`, el mismo
  que se ve en la columna «Bolsa»): así la etiqueta de Holded y la app dicen lo mismo. Sin nombre cae
  en lo que la identifica (la actividad y su fecha) y, de último, en el código de antes
  (`_accounting_bag_tag_legacy`). Una **liquidación de royalties** —que no tiene bolsa— se etiqueta
  «Liquidación de royalties» con el artista y su periodo.
  · **Qué se vuelca de cada gasto** (`_holded_upload_expense`): contacto (buscado por CIF/DNI/NIE en
  seco para NO duplicarlo, y creado con la dirección fiscal en piezas si no está) · nº de documento ·
  fecha de emisión · importe · concepto · impuestos (% de IVA y % de retención en la línea) ·
  **etiqueta** `Artista (o evento)_Actividad o municipio_Fecha` (`_accounting_bag_tag`, agrupa en
  Holded todo el gasto de una fecha) · forma de pago (`paymentMethodId` casado por nombre) · **nota
  interna** con cómo se pagó (`_accounting_internal_note`: «Pagado en remesa REM-… · banco · fecha»
  o «Pagado con Pleo · Caco») · y **el documento adjunto**. Un **ticket** no lleva contacto, ni nº, ni
  fecha, ni desglose de IVA: el total es el total.
  · **Si algo falla se DICE**: el motivo se guarda en `holded_error` y se enseña en la fila; los
  avisos de algo que sí ha entrado pero con matices (total que no cuadra, adjunto que no ha subido)
  en `holded_warning`. Un gasto con error NO cambia de estado.
  · El cliente se **reutiliza por petición** (cacheado en `g`) y guarda los contactos ya resueltos:
  subir 50 gastos del mismo proveedor busca el contacto UNA vez.
  · ⚠️⚠️ **HOLDED TIENE DOS APIS Y NO SE AUTENTICAN IGUAL** (ago 2026, la causa del 401 que no había
  forma de entender): la **v2** (`/api/v2/…`: `/v2/contacts`, `/v2/purchases`,
  `/v2/purchases/<id>/attachments`) va con los **TOKENS nuevos** (`pat_…`) y
  `Authorization: Bearer`, y la **v1** (`/api/invoicing/v1/…`) —«obsoleta pero disponible»— va con la
  **API Key clásica** en la cabecera `key`. **Un token nuevo contra la v1 da 401**, y al revés.
  · La versión va con la credencial: `api_version_for` (un `pat_…` es v2), el punto único
  **`HoldedClient._path`** construye la ruta de cada cosa según la versión, y lo que funcione se
  guarda en la cuenta (`endpoints['api_version']`), que la pantalla enseña con su etiqueta.
  · **«Probar conexión» es un DIAGNÓSTICO**: `HoldedClient.diagnose()` prueba las **tres cabeceras ×
  las rutas de las DOS versiones** y devuelve **lo que ha contestado cada intento**, que es lo que se
  pinta en Integraciones. Con eso se distingue de un vistazo: todo 401 = la credencial no vale ·
  alguna 200 y otras 403 = **le faltan PERMISOS al token**.
  ⚠️ Los «permisos que faltan» solo se cuentan **dentro de la versión que ha funcionado**: que la v1
  rechace a un token de la v2 es lo normal, no un permiso que falte.
  · **LOS CAMPOS DE LA v2 (confirmados con su OpenAPI: `api.holded.com/openapi/api2.json`)** son
  OTROS, así que cada versión tiene su builder y el punto único es
  **`contact_payload_for` / `purchase_payload_for`** (app.py no sabe de versiones):
    · **contacto** `POST /v2/contacts`: `name`* · `code` (el NIF/CIF) · `is_person` · `email` ·
      `phone` · `type: supplier` · **`bill_address`** {address, city, postal_code, province, country,
      country_code} — ojo, `snake_case` y `code`, no `vatnumber`.
    · **compra** `POST /v2/purchases`: `contact_id`* · `contact_name` · `date` **ISO** (no timestamp) ·
      `number` (el nº del proveedor) · `notes` · `description` · **`items`*** [{name, type: service,
      units, price, **`taxes: ["p_iva_21"]`**}] · `payment_method_id` · `tags`.
    · **adjuntar** `POST /v2/purchases/{id}/attachments` (multipart, campo `file`) — ruta conocida, no
      hay que buscarla como en la v1.
    · **buscar** `GET /v2/contacts?code=<CIF>` es **exacto**: se acabó recorrer páginas (y por nombre,
      `GET /v2/contacts/search?name=`).
  ⚠️ **El impuesto va como CLAVE por línea**, no como porcentaje: `client.tax_key_for(pct)` lee las
  taxes de la cuenta (`GET /v2/taxes`) y elige la del % pedido **prefiriendo las de COMPRA** (`p_`
  antes que `s_`); sin permiso para leerlas se cae a la convención `s_iva_<pct>` y, si no fuera la
  buena, **el total no cuadrará al releer el documento y se avisa** (nunca se da por bueno a ciegas).
  ⚠️ **La v2 no modela la retención en la línea**: se deja dicha en las notas y lo que se comprueba es
  base + IVA (la retención es una liquidación aparte).
  ⚠️ El **número** del documento se llama `document_number` en la v2 y `invoiceNum`/`docNumber` en la
  v1, y la v2 puede envolver la respuesta en `data`.

  · ⚠️⚠️ **CUANDO DICE «la clave no vale», LO PRIMERO ES SABER DE QUÉ EMPRESA ES LA CUENTA** (ago
  2026). Cada documento se contabiliza en **SU** empresa —una liquidación de royalties en **PIES**
  (`_royalty_holded_company`), un gasto de bolsa en la que promueve—, así que se puede tener una clave
  buena en una empresa y ninguna (o la de otra) en la que toca, y el 401 no decía cuál era. Ahora:
  · **`_holded_account_diagnosis`** le pega al error de quién es la cuenta («Es la cuenta de Holded de
  «Pies Records» (clave de 40 caracteres)»), avisa si la **cabecera está fijada a mano**, si esa
  **MISMA clave está en otra empresa** (una API Key de Holded es de UNA empresa) y si **en otra
  empresa sí hay una clave que funciona** — que es el despiste más habitual: pegarla donde no va.
  · **`_holded_accounts_status`** + el aviso de **Contabilidad**: el estado por empresa (sin clave ·
  desactivada · último error) con el botón para arreglarlo, ANTES de intentar subir nada.
  · El último error se apunta también **en la cuenta** (`_holded_remember_error` → `last_error`), que
  es lo que ya enseña Integraciones → Holded.
  ⚠️ Y **la cabecera fijada a mano ya no bloquea**: si no vale, se prueban igualmente las otras y se
  usa (y se recuerda) la que de verdad entra — fijar mal la cabecera dejaba la integración muerta con
  un «la clave no vale» que no era verdad.
  · ⚠️ **«Invalid key»**: pasó en la primera prueba real. Dos cosas lo provocan y las dos están
  cubiertas: (a) la clave se pega con basura invisible —espacios, saltos de línea, comillas o el
  propio «key:» delante—, así que se limpia al guardarla (`clean_api_key`) y se dice cuántos
  caracteres se han guardado; y (b) la CABECERA: la documentada es `key`, pero si Holded contesta que
  la clave no vale se prueban también `X-API-KEY` y `Authorization: Bearer`, y se **guarda la que
  funcione** (`endpoints['auth_header']`). El aviso de «Probar conexión» dice con cuál ha entrado.
  Si aun así falla, el mensaje repite el motivo exacto de Holded y recuerda que tiene que ser la
  **API Key** de Configuración → Desarrolladores (no el código de integración de una app del
  marketplace ni el secreto de un webhook) y que el plan debe incluir acceso a la API.
  · **La CABECERA se puede fijar a mano** (`HoldedAccount.auth_header`, selector en Integraciones):
  **Automática** (prueba `key`, `X-API-KEY` y `Authorization: Bearer` y se queda con la que va) o la
  que Holded haya indicado al crear la credencial —hay credenciales que Holded entrega diciendo
  literalmente «usa `Authorization: Bearer <tu_clave_secreta>`»—. Fijada, NO se prueban las otras: si
  falla, el problema es la clave.
  · ⚠️ **Y lo primero que hay que mirar cuando «no acepta la clave»: EN QUÉ RECUADRO se ha pegado.**
  Pasó de verdad: la clave de Holded se pegó en el de **Pleo** y el error («Pleo rechazó la
  credencial») venía de Pleo, no de Holded. Las claves de Pleo empiezan por `pls_`, así que al guardar
  una que no lo parece se avisa en el momento y se dice que la de Holded va en su pestaña.
  ⚠️ **Pendiente de la primera prueba real**: no hay cuenta de Holded para probar contra la API de
  verdad. El mapeo sigue su API documentada y está verificado con un Holded simulado (contacto que ya
  existe, ticket sin impuestos, total que no cuadra, adjunto que falla, `status:0`). La **primera
  subida real** es la que confirma los nombres de los campos: si Holded rechaza algo, el mensaje sale
  tal cual en la fila del gasto.

- **CONTABILIDAD · pendiente de contabilizar** (ago 2026, `contabilidad_view` +
  `templates/contabilidad.html` + `static/js/contabilidad.js`). Pestañas SERVIDAS (`?tab=`) con icono
  y contador: **Pendiente de contabilizar** (subpestañas **Facturas · Bolsas · Tickets · Sin
  ticket**) · **Contabilizado** · **Facturas** (el registro de siempre).
  · Lo que entra es lo que **ADMINISTRACIÓN HA VALIDADO**: gastos de bolsa consolidados
  (`BAG_CONSOLIDATED_STATUSES`, que incluye el «sin factura» aceptado) y sin contabilizar. La
  subpestaña se elige por `BagExpense.document_type` (FACTURA / TICKET / SIN_DOCUMENTO).
  · **ESTADO CONTABLE en el propio gasto** (`BagExpense.accounting_status`: PENDIENTE · SUBIDO ·
  CONTABILIZADO · OMITIDO, punto único `_accounting_set_status`), así que la etiqueta
  «Contabilizado» —con **la fecha al pasar el ratón**— se ve también en la **bolsa** (`_bag_panel.html`)
  y en pendiente de pago. **Omitir** = no se contabiliza y ahí acaba su proceso (se puede devolver a
  pendiente). La etiqueta se cambia **pinchándola** (avanza en su ciclo).
  · ⚠️ **En «pendiente», los botones de contabilizar van en AMARILLO** (`btn-outline-warning`, ago
  2026): el **VERDE está reservado a la ETIQUETA de «ya contabilizado»**, y en verde la ACCIÓN se
  confundía con el ESTADO. Vale para los tres: la fila de una liquidación («Contabilizada»), la barra
  de selección («Marcar como contabilizado») y la cabecera de una bolsa («Contabilizar todos»).
  · Arriba, **«Subir todo a Holded»** y «Comprobar en Holded»; **casilla por gasto** con barra de
  acciones en bloque (subir / marcar contabilizado); **filtros por estado** con su icono; tres
  puntitos por fila (subir, descargar, compartir por correo/WhatsApp/SMS, editar, omitir) y el icono
  de la factura, que la abre **en un pop-up**.
  · **Bolsas**: una tarjeta por bolsa con su **cabecera** (foto del artista, tipo de actividad, fecha,
  recinto, municipio, empresa y la etiqueta de Holded) que se despliega con sus gastos —cada uno con
  su pastilla Factura/Ticket/Sin ticket— y botones de subir todos / contabilizar todos. Cuando **todos
  sus gastos están contabilizados u omitidos** la bolsa se cierra para contabilidad
  (`accounting_done_at`), se archiva y desaparece de pendiente (`_accounting_bag_close_if_done`).
  ⚠️ Ese helper hace `session_db.flush()` antes de contar: la sesión es **`autoflush=False`** y sin él
  la consulta no veía los estados recién cambiados, así que marcar la bolsa entera de golpe dejaba
  `accounting_done_at` a null (bug real).
  · **Detección automática**: al abrir la pestaña, si hay documentos SUBIDOS y hace más de 15 min que
  no se pregunta, se consulta a Holded **en segundo plano** (`_holded_autodetect_bg`; en primer plano
  serían decenas de llamadas y la pantalla se quedaría colgada) y hay cron
  `/cron/holded/refresh?key=HOLDED_CRON_KEY`. Lo que Holded no diga **no se toca**: mejor no saberlo
  que inventarlo.
  · ⚠️ **LO CONTABILIZADO SE VE EN «CONTABILIZADO»** (corregido ago 2026): lo que se marcaba
  desaparecía —se iba de pendiente y no salía en ninguna otra pestaña—. Dos causas, las dos
  arregladas: la consulta de esa pestaña exigía además que el gasto siguiera **validado por
  administración** (`consolidation_status`), que es un filtro de lo PENDIENTE y no de lo hecho (con
  `only_done` ya no se aplica: lo que se marcó se ve siempre); y las **liquidaciones de royalties**
  contabilizadas no se listaban en ningún sitio → módulo nuevo `_royalty_accounting_done_rows` en esa
  pestaña, con su botón para devolverlas a pendiente.
  · **Royalties**: ⚠️ ya **no hay módulo aparte** (ago 2026): una liquidación **ES una factura**, así
  que las pendientes se listan **en la subpestaña FACTURAS**, como una fila más de la misma tabla
  (macro `roy_row`, sin casilla —no es un gasto de bolsa— y con su acción «Contabilizada»), y cuentan
  en el número de «Facturas». Todo lo pendiente está en su módulo: una factura suelta en Facturas y
  las bolsas en Bolsas, que se despliegan con su contenido. Las liquidaciones ya contabilizadas
  siguen teniendo su módulo en la pestaña «Contabilizado». `_royalty_accounting_pending_rows`
  **exige que su factura esté VALIDADA** — sin ese cruce se colaban
  las que alguien había marcado pagadas a mano sin factura (las pruebas antiguas, ninguna con número).
  · ⚠️⚠️ **CHOQUE DE CLASES: la tabla se veía APILADA** (bug real, ago 2026). Las filas de la tabla de
  contabilidad llevaban `class="acc-row"`… que YA EXISTÍA para las filas de **PERMISOS**
  (`div.acc-row { display:grid; grid-template-columns:1fr auto }`), así que cada `<tr>` se pintaba
  como una rejilla de DOS columnas y las celdas salían una debajo de otra en las cuatro subpestañas.
  Ahora la de contabilidad es **`acct-row`** y la de permisos está acotada a `div.acc-row`, para que
  no vuelva a pasar. Las cuatro subpestañas usan las MISMAS macros (`acc_head`/`acc_row`), así que se
  ven y se operan igual: 14 columnas (13 dentro de una bolsa, que no repite la columna «Bolsa»).
  · ⚠️ **Todo va en UN SOLO formulario** y las acciones de cada fila usan **`formaction`** en su botón
  (un formulario dentro de otro no es HTML válido). Para que eso funcione con `data-inline`,
  `ajax_inline.js` ahora respeta el **botón que envía**: su `formaction`/`formmethod` y su
  `data-confirm` (antes siempre usaba `form.action`, así que cualquier acción de fila habría ido al
  endpoint del formulario).
  · Los endpoints son `accounting_*` (mapeados a la sección `contabilidad`) y el permiso de edición es
  **`can_edit_accounting()`**.

- **CONTABILIDAD · la tabla se lee, y el % es el TIPO REAL** (ago 2026):
  · **FILTRO POR EMPRESA con su logo** (`_accounting_company_filters` + `.acct-cofilter`), la misma
  idea que la rejilla de artistas de Discográfica: salen todas con su logo y lo que tienen pendiente,
  y al pinchar una **solo se ve lo suyo** (`?empresa=<id>`, se conserva entre pestañas). ⚠️ El
  formulario lleva la empresa pinchada, así que **«Subir todo a Holded» no toca lo de otra empresa**
  (`_accounting_company_scope_from_form`).
  · **CORREGIR LOS DATOS** desde los tres puntitos: **«Corregir los importes»** (el pop-up de
  siempre) y **«Corregir los datos de la factura»**, que abre la pantalla partida de la factura
  (`supplier_invoice_edit`) y **vuelve a contabilidad** al guardar (`?next=`).
  ⚠️⚠️ Corregir los importes toca **el gasto Y SU FACTURA** (`_accounting_expense_invoice`, punto
  único): en esta tabla manda lo que dice la FACTURA (`_accounting_amounts`), así que tocando solo el
  gasto no cambiaba nada de lo que se ve y parecía que no se guardaba. Los **porcentajes se
  recalculan** del importe corregido y se ajustan al tipo real.
  · **CON LOGO NO SE ESCRIBE EL NOMBRE** de la empresa (el logo ya lo dice y la tabla se lee mucho
  mejor); el nombre solo sale cuando no hay logo. En los dos casos, al pasar el ratón.
  · **LAS COLUMNAS SE ENTIENDEN**: la cabecera va en **dos filas** —los bloques (**El documento ·
  Importes · Estado**) y debajo cada columna con su icono—, hay **columna de EMPRESA con su logo**
  (`acc_company`), y el **IVA y la retención llevan el importe arriba y su % debajo** (`acc_tax`).
  ⚠️ El `colspan` de la fila de grupos tiene que cuadrar con las columnas de abajo: se comprueba
  contando `th`/`td` (un descuadre no da error, solo desalinea toda la tabla).
  · **LA BOLSA dice qué es**: su nombre (o lo que la identifica: la actividad y su fecha) y, en una
  **liquidación de royalties** —que no tiene bolsa—, la etiqueta «Liquidación de royalties» con el
  **artista**. El nombre de la empresa ya no se repite ahí: tiene su columna.
  · **LA ALERTA, resumida** (`acc_alert`): un icono con el motivo al pasar el ratón. El texto largo del
  error de Holded empujaba los botones («ver factura» y los tres puntitos) a la derecha y la fila se
  leía fatal.
  ⚠️⚠️ **EL PORCENTAJE ES EL TIPO REAL, NO EL DESPEJADO** (`_tax_pct_snap` + `VAT_RATES` /
  `RETENTION_RATES`, punto único): una factura del **21%** salía como **20,99%** porque el % se
  despeja dividiendo dos importes **ya redondeados a céntimos** (con base 100,05 e IVA 21,00 sale
  20,99). Los tipos son LEGALES, así que si el número está a menos de `TAX_PCT_SNAP` (0,30) de uno de
  ellos, **es ese**. Se aplica al calcularlo, a lo que viene GUARDADO en la factura (arregla las de
  antes) y al guardar lo que se lee del documento.

- **CONTABILIDAD · «EDITAR LOS DATOS DE LA FACTURA», en TODAS las filas** (ago 2026). Antes había
  dos opciones a medias en los tres puntitos: **«Corregir los importes»** (un pop-up que en realidad
  ya editaba concepto, nº, fecha e importes) y **«Corregir los datos de la factura»**, que solo salía
  **si el gasto tenía una `SupplierInvoice` registrada** — así que en la mayoría de las filas no
  había forma de encontrar dónde se editan los datos. Ahora es **UNA sola opción con ese nombre**,
  presente en las cuatro subpestañas, dentro de las bolsas, en «Contabilizado» y también en la fila
  de una **liquidación de royalties** (que antes no tenía nada que editar).
  · **El pop-up es una pantalla partida**: **el documento a la izquierda** —que es lo que se está
  copiando— y sus datos a la derecha (reutiliza las clases `.inv-split*`, así que se ve igual que la
  pantalla de la base de facturas). Sin documento subido lo **dice** y deja corregir los datos
  igualmente. Abajo a la izquierda, **«Abrirla en la base de facturas»** cuando hay factura
  registrada (ahí se reemplaza, se rechaza o se elimina).
  ⚠️ **La URL del formulario la manda la PLANTILLA** (`data-acc-action`), no la construye el JS: por
  eso el MISMO pop-up sirve para un gasto (`accounting_expense_edit`, que escribe **el gasto y su
  factura** porque en esta tabla manda lo que dice la factura) y para la factura de una liquidación
  (**`accounting_royalty_invoice_edit`**, que solo tiene factura).
  · Punto único **`_invoice_apply_manual_data(inv, form)`**: nº, fecha, concepto e importes, con los
  **porcentajes recalculados y ajustados al tipo real** (`_tax_pct_snap`).
  ⚠️ **Solo escribe lo que llega con valor**: un campo vacío NO borra lo que había — al revés que
  `supplier_invoice_data_save`, donde un hueco vacío se guarda como NULL (`_invoice_amount_fields_from_form`
  devuelve None) y **borra** el dato. Aquí se está corrigiendo un dato mal leído, no vaciando la factura.
  ⚠️ **El IVA se llama `amount_tax` en `BagExpense` y `amount_vat` en `SupplierInvoice`**, y el gasto
  **no tiene** `vat_pct`/`retention_pct`: copiar importes de una a otra exige traducir.
  ⚠️ **`data-acc-edit-doc`, no `data-acc-doc`**: el visor de documentos de la pantalla se engancha a
  `[data-acc-doc]` por delegación, así que con ese nombre el mismo clic habría abierto DOS pop-ups.
  ⚠️⚠️ **LO QUE SE EDITA SON LOS IMPORTES GUARDADOS, NO LOS DEDUCIDOS** (bug de dinero, corregido
  en el mismo lote): la tabla ENSEÑA importes calculados (en un ticket, base = total e IVA = 0; en
  una factura sin base, la base despejada), y rellenar el pop-up con eso y darle a **Guardar** los
  escribía como si alguien los hubiera leído del documento — y una **retención «0»** donde no había
  nada **cambia lo que se paga en la remesa** (`_expense_retention` distingue el 0 del NULL) y hace
  aparecer la factura en la pestaña de **Retenciones**, que es un listado fiscal. Punto único
  **`_accounting_stored_amounts`** (+ `_money_edit_text`): **campo a campo**, manda la factura y, si
  ese dato no está guardado ahí, el del gasto — y **un 0 sale VACÍO**, que es la convención de la
  casa en los formularios de importes (`_invoice_amount_fields_from_form` guarda el 0 como NULL:
  «no lo sé» no es «cero»).
  ⚠️ **Vaciar el nº o la fecha los limpia TAMBIÉN en la factura**: la tabla enseña el del gasto **o**
  el de la factura, así que limpiando solo el gasto reaparecía el de la factura y parecía que no se
  había guardado.
  ⚠️ Los importes llevan **`data-money`** y se rellenan «1.234,56» como en el resto de la casa: era
  el único formulario de dinero que iba con el `Decimal` en crudo, y quien escribiera «1.234» a la
  española guardaba 1,23 €.
  ⚠️ **Corregir un dato es EL TRABAJO de contabilidad**: `supplier_invoice_edit` exigía
  `can_edit_invoices()` mientras el menú se pinta con `can_edit_accounting()`, así que quien es de
  contabilidad sin edición en la base de facturas veía la opción y se comía un **403** (bug real).
  Punto único **`can_edit_invoice_data()`** = las dos cosas; eliminar, reemplazar y rechazar siguen
  siendo de la base de facturas.
  ⚠️⚠️ Y el **gate** hay que arreglarlo en `_resolve_request_resource_key` **POR DELANTE** de la regla
  que manda todo `supplier_invoice*` a `databases.invoices`: puesta debajo era **código muerto**
  (la misma trampa que ya documenta la resolución de `contabilidad_view`). Punto único
  **`_first_access_key(claves, default)`** — «la primera de estas claves que el usuario tenga» — con
  `INVOICE_EDIT_ACCESS_KEYS` (base de facturas · contabilidad) y `ACCOUNTING_ACTION_ACCESS_KEYS`
  (pendiente · **contabilizado**, que es HERMANA y no descendiente: sin ella, quien solo tuviera esa
  pestaña se comía un 403 al devolver algo a pendiente).
  · Y en la fila de una liquidación se retiró el «Holded: nº» de texto: eso ya lo dice el **icono**.

- ⚠️⚠️ **SUBIR A HOLDED NO ES CONTABILIZAR** (ago 2026). En la fila hay **un icono de Holded**
  (macro `acc_holded` de `contabilidad.html`, clases `.acct-holded` / `.acct-holded.is-up`) **antes**
  de la etiqueta de estado: **verde** cuando el documento ya está en Holded (con su número y cuándo se
  subió al pasar el ratón) y **gris** cuando todavía no. Y el gasto pasa a **CONTABILIZADO solo cuando
  HOLDED LO TIENE GUARDADO**, no al subirlo: la subida deja `accounting_status='SUBIDO'` y es el
  sondeo (`_holded_refresh_accounted`, cada 15 min al abrir Contabilidad + su cron) el que pregunta y
  lo marca, con `accounting_by_nick='Holded'`.
  · Punto único **`HoldedClient.document_is_accounted`**: relee el documento y lo da por guardado si
  trae `accounting_date` o `approved_at` (`ACCOUNTED_DATE_FIELDS`, más los flags de
  `ACCOUNTED_FLAG_FIELDS`). ⚠️ **Un BORRADOR nunca cuenta** (`draft: true` → False, se comprueba
  ANTES que las fechas): en Holded un borrador puede llevar fecha contable y no está guardado.
  · **Las LIQUIDACIONES de royalties van igual** (`_holded_refresh_accounted_royalties`, llamada al
  final del sondeo): `accounted_at` + `accounted_by_nick='Holded'` cuando Holded las tiene.
  ⚠️ Y **el disparador del sondeo las cuenta** (`_holded_autodetect_due` suma las liquidaciones con
  `holded_doc_id` y sin `accounted_at`): mirando solo los `BagExpense`, una casa con solo
  liquidaciones subidas no habría preguntado nunca y se habrían quedado en «subida» para siempre.

- **CONTABILIDAD · cada persona lleva SUS EMPRESAS del grupo** (ago 2026,
  `UserProfile.accounting_company_ids`): a la gente de **Contabilidad** se le asignan las empresas del
  grupo que le corresponden y **lo PENDIENTE de contabilizar es solo el de sus empresas** —los cuatro
  tipos (Facturas · Bolsas · Tickets · Sin ticket), sus **contadores** y las **liquidaciones de
  royalties**—. En los filtros de la pestaña hay **«Mis empresas» / «Todas las empresas»**
  (`?empresas=todas`), así que puede ver el resto cuando le haga falta; **lo ya CONTABILIZADO y las
  RETENCIONES se ven siempre completos** (son un archivo y hace falta poder buscar).
  · Es un **reparto de TRABAJO, no un permiso** (como `admin_responsibilities`): no crea recurso en el
  catálogo de accesos. **Sin empresas asignadas se ve TODO** y **dirección también**; y lo que **no es
  de ninguna empresa** (una bolsa sin empresa puesta) lo ven todos — si se filtrara, desaparecería de
  la pantalla de todo el mundo.
  · Motor: **`_accounting_company_scope()`** (las empresas de quien mira; vacío = todas) +
  `company_ids=` en `_accounting_base_query` / `_accounting_counts` / `_accounting_bag_groups` /
  `_royalty_accounting_pending`. ⚠️ Las **liquidaciones se filtran en Python**
  (`_royalty_holded_company`: la de la remesa con la que se pagó y, si no, PIES): no es una columna.
  ⚠️ Los **contadores llevan el mismo filtro** que las filas o el número de la pestaña no cuadraría
  con lo que se ve debajo.
  ⚠️ **«Subir todo a Holded» se ciñe a lo que se está viendo**: el formulario lleva el ámbito
  (`empresas`) y `_accounting_company_scope_from_form` lo aplica, así que nadie sube a Holded los
  documentos de una empresa que no lleva.
  · **AVISO** (`_accounting_company_user_ids`): cuando una bolsa se queda sin nada por pagar y pasa a
  ser cosa de contabilidad (`_bag_close_if_fully_paid`) le llega el aviso a **quien lleva esa empresa**
  (kind `CONTABILIDAD`, `ref_type='BAG_ACCOUNTING'`); si **nadie la lleva**, a todo el departamento. Al
  contabilizarla, el aviso **se cierra solo** (`_accounting_bag_close_if_done`).
  · Se asigna en la **ficha de personal → Datos** (selector múltiple de empresas del grupo), **solo
  dirección** y solo si la persona está en el departamento Contabilidad. ⚠️ Con **centinela**
  (`accounting_companies_present`): el formulario de la ficha es monolítico y un POST parcial borraría
  el reparto. Y el panel **deshabilita** sus campos al ocultarse (ocultar no basta: se envían igual).

- **CONTABILIDAD · una LIQUIDACIÓN DE ROYALTIES es una factura como las demás** (ago 2026,
  corrección). En la subpestaña **Facturas** salían con «—» en **IVA** y en **retención** y **sin
  casilla**, así que no se podían elegir para subirlas a Holded y «seleccionar todas» parecía no hacer
  nada (si todo lo pendiente eran liquidaciones, no había ni una casilla que marcar).
  · Su desglose sale de **SU factura** (punto único **`_royalty_invoice_amounts`**: base, IVA con su %,
  retención con su % y total; lo que no diga la factura se despeja de la propia liquidación, cuya base
  es `total_amount` y cuyo importe a facturar es base + IVA).
  · Lleva su **casilla** (`name="royalty_ids"`), y las acciones en bloque la incluyen:
  `_accounting_royalties_from_request` (con el mismo criterio que los gastos: el ÁMBITO manda sobre lo
  marcado) + `_accounting_upload_many(..., royalties=…)` y `accounting_bulk_status`.
  · **Se sube a Holded** (`_holded_upload_royalty` + `accounting_royalty_upload`): mismo camino que un
  gasto (contacto → documento → comprobar el total → adjuntar la factura), con el **beneficiario** que
  resuelve `_royalty_beneficiary_promoter` y la empresa que decide `_royalty_holded_company` (la de la
  remesa con la que se pagó y, si no, **PIES**). Lo que devuelve Holded se guarda en la liquidación
  (`holded_doc_id`/`_number`/`_error`/`_warning`, columnas nuevas) y se ve en su fila.
  ⚠️ `_royalty_holded_fields` cachea en `g` para no preguntar una vez por fila, **con `try/except`**:
  estas filas se calculan también desde un cron o un hilo en segundo plano, donde leer `g` revienta
  con «Working outside of application context» (bug real encontrado al probarlo).
  · Y en los gastos, **el IVA se despeja de la base y el total** (`_accounting_amounts`): un gasto del
  que solo se guardó base y total salía con «—» en IVA teniéndolo delante.
- **CONTABILIDAD · «Contabilizado» se lee IGUAL que «Pendiente»** (ago 2026): las **mismas
  subpestañas** con sus iconos (Facturas · Bolsas · Tickets · Sin ticket) y las mismas columnas, pero
  **SIN contadores** —ni en la subpestaña ni en la pestaña principal—: es un archivo que solo crece y
  un número ahí no dice nada (los números son de lo que está PENDIENTE). Las bolsas ya contabilizadas
  las agrupa `_accounting_bag_groups(..., only_done=True)` (con `only_done` **no** corre el autocurado
  de «cerrada para contabilidad»: esa regla es de lo pendiente) y las liquidaciones contabilizadas van
  en la tabla de **Facturas**, no en un módulo aparte.
  ⚠️ **Fuera la pestaña «Facturas»** (la de después de Retenciones): repetía lo que ya está en Bases de
  datos → Facturas. Un `?tab=facturas` de un enlace antiguo cae en «Pendiente».

- **IMPORTAR TERCEROS DESDE UN FICHERO** (ago 2026). Botón **«Añadir desde fichero»** en
  Bases de datos → Terceros: se arrastra (o se elige) un **Excel (.xlsx) o un CSV** y se dan de alta
  en bloque.
  · **Motor puro `promoter_import.py`** (ni Flask ni BD): lee el fichero y **reconoce sus columnas**
  (`FIELDS` con alias por campo, `guess_field`, `normalize_value`, `apply_mapping`). La cabecera
  **no tiene que estar en la primera fila** (`_header_index`) y solo se lee la **primera hoja**.
  ⚠️ Los rótulos se casan con **puntuación permitida entre las letras** (`_alias_re`): sin eso
  «N.º de C.I.F.» no se reconocía (al normalizar queda «n o de c i f»); y hace falta el límite de
  palabra por la izquierda para que el «nie» de «conveniente» no pase por un NIE.
  ⚠️ Un CSV exportado de Excel trae los números **con decimales**: un teléfono llegaba como
  «638123456.0» y un CP como «41001.0» (los dos bugs salieron en la primera prueba).
  · **Lo que no se reconoce NO se calla**: la columna se devuelve sin campo y la pantalla pregunta a
  qué campo va, deja **guardarla como «dato extra»** con el nombre de la columna, o dejarla fuera.
  · **Cuatro pasos** (`_promoter_import_modal.html` + `static/js/promoter_import.js`, clases `.pi-*`):
  fichero → columnas → **resumen (nuevos / ya existían)** → los que ya existían **uno a uno en
  PANTALLA PARTIDA**, eligiendo en cada campo qué se queda. El fichero se lee UNA vez
  (`promoters_import_analyze`) y el resto va en JSON (`promoters_import_prepare` /
  `promoters_import_create` / `promoters_import_merge`), así no hay que volver a subirlo.
  · **Quién ya está** (`_promoter_import_match`): manda el **DNI/NIF** (también el de sus sociedades,
  `PromoterCompany.tax_id`), luego el nick exacto y por último nombre y apellidos. El nick de alta
  sale del fichero, del nombre completo o del DNI (`_promoter_import_nick` + `_intake_unique_nick`,
  que `Promoter.nick` es UNIQUE). Cada alta va en su **savepoint**: una que falle no tumba las demás.
  · **CONSERVAR LOS DOS** (el caso de Dani: una persona con dos direcciones): modelo nuevo
  **`PromoterAltValue`** (`field`, `label`, `value`) — uno se queda en la ficha y el otro se guarda
  con su **nombre** («casa de Madrid» / «casa de Cádiz»), y se puede nombrar también el de la ficha
  (sale marcado como **principal** en «Otros datos» de la ficha del tercero, `_promoter_alt_value_rows`).
  ⚠️ El que NO se queda en la ficha se guarda **siempre**, con un nombre por defecto si no se le pone
  ninguno: la idea es no perder nada. Los **correos** van a `PromoterEmail` (con `concept` = el
  nombre), que es donde los busca el resto de la app — no se duplica una tabla que ya existía.
  · **LAS COINCIDENCIAS SE REVISAN UNA A UNA** (ago 2026): el resumen dice cuántos terceros trae el
  fichero y cuántas coincidencias hay, y **no se puede «Terminar» dejándolas a medias** (el botón se
  queda en «Faltan N por revisar» y cerrar el modal avisa). Se llevan en `state.reviewed` (por fila);
  cuenta como revisada tanto guardar como **«Dejar lo que tenemos»**, y al crear los nuevos se entra
  directo a la revisión, empezando por la primera SIN resolver.
  · **«ES OTRO DIFERENTE»** (mismo nombre, o un DNI mal escrito): en la pantalla partida hay siempre
  esa salida, que **no fusiona nada** y da de alta un tercero NUEVO con lo que trae el fichero
  (reutiliza `promoters_import_create` con esa única fila); el que ya estaba se queda como está.
- **CÓMO SE ESCRIBE UNA DIRECCIÓN · un solo formato en TODA la app** (ago 2026). Motor puro
  **`address_utils.py`**, que es el ÚNICO sitio que lo sabe:

      Calle y número, CP Municipio, Provincia, País

  · La **coma** separa las piezas (es como se escribe una dirección), el **país solo si NO es
  España** y un municipio que se llama igual que su provincia **no se repite**.
  · **`parse()`** hace el camino de vuelta (de un texto de un tirón a sus piezas) y **`format_parts()`**
  las vuelve a juntar; **`place_label()`** es lo mismo sin la calle («Municipio, Provincia, País»), y
  de ahí tira `_place_label` de las peticiones. Globales de plantilla **`address_text(v)`** (junta) y
  **`address_parts(v)`** (las piezas, para enseñarlas por separado donde toca).
  · **AUTOCOMPLETADO en todos los campos de dirección** (`static/js/address_autocomplete.js`,
  global): al escribir salen coincidencias y, al elegir una, se rellenan el CP, el municipio, la
  provincia y el país. Dos formas, las dos con `[data-address-autocomplete]` en el bloque:
  **`data-addr="full"`** (UN campo: domicilios, recintos, medios, el lugar de una promoción, la
  dirección manual del recinto de una actividad…) y **en piezas** (`data-addr="address|postal_code|
  city|province|country"`, la dirección FISCAL, que Holded exige suelta).
  ⚠️ En el campo único, la dirección que se escribe la compone el **SERVIDOR** (`full` de
  `api_address_search`, hecho con `format_parts`): así el JS no tiene una segunda versión del formato.
  ⚠️ Se guarda normalizada **AL GUARDAR**, como los teléfonos: `_addresses_normalize_instance` en el
  mismo `before_flush`, con los campos de cada modelo en **`_ADDRESS_FIELDS`** (un campo de dirección
  nuevo va ahí). Lo que no se puede repartir **se respeta tal cual**.
  · **Relleno puntual** `_addresses_normalize_backfill` (marca `addresses_format_backfill_v1`): pone
  las ya guardadas en la forma de la casa y **reparte las piezas** de las fiscales que las tuvieran
  vacías. ⚠️ `user_profiles` **no tiene `id`** (su clave es `user_id`): la tabla de tablas del relleno
  lleva la clave primaria de cada una.
  ⚠️ El CP se rellena a 5 dígitos **solo en España** (el 1200 de Lisboa no es el 01200 de nadie) y
  fuera se reconoce su forma (4-5 dígitos, «1200-195»).

- **DIRECCIÓN FISCAL EN PIEZAS** (ago 2026): calle · **código postal** · **municipio** · **provincia**
  · país, en `Promoter` y `PromoterCompany` (`fiscal_postal_code`/`fiscal_city`/`fiscal_province`/
  `fiscal_country`). ⚠️ **Holded exige el CP, el municipio y la provincia separados** para dar de alta
  al proveedor: con la dirección en un solo cuadro de texto el gasto no se puede contabilizar.
  · Un único parcial para TODOS los formularios: **`templates/_fiscal_address_fields.html`**
  (`{{ fiscal.fields(fiscal_parts(obj)) }}`), ya puesto en la ficha del tercero (sus datos y sus
  sociedades), en los **integrantes del artista**, en el **enlace de alta de terceros** y en la
  **landing de facturación** (donde además se piden como obligatorios y se enseñan bloqueados si ya
  los tenemos).
  · **AUTOCOMPLETADO** (`geo_utils.py` + `static/js/address_autocomplete.js` + endpoint
  `api_address_search`, `/api/direcciones`): al escribir la calle salen sugerencias y, al elegir una,
  se rellenan CP, municipio, provincia y país; escribiendo solo el **código postal**, la provincia se
  pone **al instante** (tabla de las 52 provincias por los dos primeros dígitos, en el JS y en
  `geo_utils.PROVINCE_BY_CP` — ⚠️ **espejadas: si se toca una, se toca la otra**).
  ⚠️ **Nominatim NO se puede usar para autocompletar** (su política lo prohíbe: una petición por
  tecla); el `/api/geocode` que ya existía sigue valiendo porque hace UNA consulta por ciudad. El
  proveedor es **Photon** (komoot, sobre OSM, gratis y sin clave), sesgado a España con `bbox`.
  ⚠️ **La provincia NO se coge del geocodificador**: Photon devuelve `state` = comunidad autónoma
  («Andalucía») y `county` a veces la comarca («Sierra de Cádiz»). Sale del CP, que es determinista.
  · Lo buscado se **guarda** en `address_lookups` (`ensure_geo_schema`, 180 días): la segunda vez que
  alguien escriba la misma calle sale al instante y sin salir a Internet. El endpoint es **público**
  (lo usan el enlace de alta y la landing de facturación) con un freno de 40 búsquedas por IP y
  minuto. Es una AYUDA: si el proveedor no responde, no pasa nada y se escribe a mano.
  · Se **muestra junta** con el global **`fiscal_address_text(obj)`**; las piezas para rellenar un
  formulario las da **`fiscal_parts(obj)`** (`_fiscal_parts_for_form`), que **reparte al vuelo** lo que
  estuviera guardado de un tirón (`_split_fiscal_address`: busca el CP de 5 dígitos, lo de antes es la
  calle y lo de después el municipio; la provincia, entre paréntesis o tras la última coma). Ese
  reparto es un apaño de LECTURA: no se inventa un municipio y no se guarda hasta que se envía el
  formulario. Al guardar, punto único **`_apply_fiscal_address`** + `_fiscal_form_values`.

- **FACTURAS DE ROYALTIES: lo que se perdía por el camino** (ago 2026, tres bugs reales encadenados).
  Había gente que había facturado por el enlace del correo y su factura **no aparecía en «pendiente de
  liquidar»**. Causas y arreglos:
  · ⚠️ **El enlace caducaba al año** (`_parse_public_royalty_liquidation_token`, `max_age` 31536000) y,
  al caducar, `/facturacion?liq=…` **se comportaba como la landing genérica**: el proveedor subía su
  factura, la app le decía que todo bien y la factura se creaba **sin `royalty_liquidation_id`**, así
  que no salía en ninguna bandeja y nadie se enteraba. Ahora el margen es de **10 años** y, si aun así
  hubiera caducado, **el contenido se recupera** (`SignatureExpired` solo se lanza DESPUÉS de validar
  la firma: viejo no es falso). Y si el token viene pero **no se puede resolver la liquidación**, ni la
  landing ni la subida siguen como genéricas: **se avisa y no se acepta la factura** (mejor eso que
  aceptarla y perderla). La comprobación del enlace va **antes que la de los certificados**, para no
  mandar a nadie a buscar papeles que no son el problema.
  · ⚠️ **Al rechazar una factura no se soltaba el vínculo** salvo que la liquidación estuviera en
  `INVOICED`, así que el enlace le seguía diciendo al proveedor «ya hay una factura subida» y no podía
  mandar la corregida. Ahora `supplier_invoice_reject` suelta `invoice_id` **siempre** que apuntara a
  esa factura, vuelve a `SENT` y lo apunta en el historial; y **una factura RECHAZADA nunca bloquea**
  el enlace (`_invoice_existing_block` y los dos ramales de subida), que justamente se le ha pedido
  que la corrija — además se le recuerda **por qué** se le devolvió.
  · **Red de seguridad para lo ya perdido**: bloque **«Facturas subidas SIN VINCULAR»** en
  Administración → Pendiente → De liquidación (`_orphan_supplier_invoices`: PENDIENTE y sin
  liquidación, bolsa, gasto, petición ni persona) con un selector para **vincularla a su liquidación**
  (`administration_invoice_link_royalty`) y que vuelva al proceso. Ahí caen también las subidas por la
  landing genérica sin destinatario, que son igual de invisibles.
  · **Y donde de verdad se busca: BASES DE DATOS → FACTURAS**, con dos pestañas nuevas
  (`INVOICE_KINDS`): **«Sin vincular»** —que **solo existe si hay alguna** (`INVOICE_CONDITIONAL_TABS`,
  con su contador) y desde la que se puede **vincular a una liquidación** o **asignársela a una
  persona** (`supplier_invoice_assign_person`: entra en su «Mis gastos» y arranca su plazo)— y
  **«Pendientes de asignar»** (`_invoices_pending_assign_rows`), que es TODO lo que espera bolsa **sea
  de quien sea** (los `PersonalExpense` en PENDING, con de quién es, su origen y su plazo) **más las
  del limbo**, marcadas «Sin destinatario» porque nadie las ve en su Inicio. El bloque de
  Administración se queda: es donde trabaja administración.
  · ⚠️ **UN RECHAZO YA NO ES INVISIBLE** (`InvoiceUploadAttempt` + `_invoice_attempt_log`,
  `ensure_invoice_attempts_schema`). Cuando el servidor NO acepta una factura (el enlace no vale, le
  faltan datos, el importe no cuadra, ya había una, le falta documentación) el aviso se le enseñaba a
  quien subía **y aquí no quedaba constancia de nada**: un rechazo era indistinguible de no haber
  intentado, así que a «yo sí la subí» no se podía contestar. Ahora cada rechazo se apunta con su
  motivo, y en **Bases de datos → Facturas → Subidas por terceros** salen dos bloques:
  **«Intentos de subida que NO se aceptaron»** (quién, por dónde, nº, importe, motivo y cuándo) y
  **«Liquidaciones enviadas de las que NO ha llegado factura»** (`_royalty_sent_without_invoice`), que
  es el contraste que dice si de verdad está entrando algo o no.
  · **La alerta de datos que faltan se ve en las TRES pantallas** (bandeja de royalties, «Subidas por
  terceros» y las pestañas nuevas): línea roja con qué falta + botón **«Completar a mano»** →
  `supplier_invoice_edit`. Antes en «Subidas por terceros» solo había una lupa para releer el PDF y el
  editar estaba escondido en los tres puntitos: no se encontraba.
  · **El módulo «Mis gastos» de Inicio solo sale si esa persona tiene algo pendiente** de asignar
  (antes salía siempre, con un «sin gastos pendientes» que solo hacía ruido). La sección sigue en el
  menú, así que no se pierde el acceso.

- **ROYALTIES · pedir la factura y registrarla desde dentro** (ago 2026):
  · **Administración → Liquidaciones** tiene subpestañas (`ADMINISTRATION_LIQ_TABS`, `?liq_tab=`):
  **Bolsas** (lo de siempre) y **«Enviadas pendientes de factura»**
  (`_royalty_sent_without_invoice`): liquidaciones enviadas de las que NO ha llegado la factura, con
  el nombre enlazado a su liquidación, su **«i» de trazabilidad** (modal propio y compacto que pinta
  el `timeline` del endpoint `/discografica/royalties/liquidacion/info` — el modal grande de
  Discográfica no existe en esta pantalla), el PDF, y en los tres puntitos **«Volver a solicitar la
  factura»** (reenvía la liquidación, cuyo correo lleva el botón de subirla). Arriba, **«Volver a
  pedir la factura a todas»**, que las recorre una a una y dice cuántas han salido.
  · ⚠️ **El enlace «Subir factura» del PDF iba al formulario GENÉRICO** (`piesrecords.com/facturacion`
  a pelo): quien lo usaba subía su factura **sin vincular a la liquidación** y no llegaba a «pendiente
  de liquidar». Ahora apunta al **mismo sitio que el botón del correo** (el enlace público de ESA
  liquidación); si no se pudiera construir, cae al genérico.
  · **Subir la factura DESDE DENTRO** (`royalty_liquidation_invoice_upload`, en los tres puntitos de
  la liquidación): modal para **arrastrar o elegir** el documento, se leen sus datos con el mismo
  lector que la landing (`public_invoice_detect`) y **solo se piden a mano los que no se han podido
  leer** (salen resaltados).
  · **PANTALLA PARTIDA como en la landing** (mismas clases `.inv-split*`): la factura a la IZQUIERDA
  —pintada del propio archivo con `URL.createObjectURL`, sin subirla— y a la DERECHA los campos ya
  rellenos con lo leído (nº, fecha, base, IVA, retención, total, **artista** y concepto). Arriba se dice
  **a quién se le vincula** (el beneficiario) y la base a facturar.
  · **QUIÉN EMITE la factura** lo resuelve `_royalty_beneficiary_promoter`: si el beneficiario es un
  TERCERO, él mismo; si es un ARTISTA, el tercero que le factura —primero sus **integrantes**
  (`ArtistPerson.promoter_id`: el solista o quien cobra por el grupo) y si no el tercero **vinculado**
  al artista—. Con **más de un candidato NO se elige por su cuenta**: el endpoint responde
  `needs_promoter` con la lista y el modal enseña el selector. Sin ninguno, se dice que hay que
  vincular al artista con su tercero.
  ⚠️ El arrastre lo hace el mecanismo **GLOBAL** (`file_drop.js` + `data-file-drop-for="#royInvoiceFile"`),
  igual que cuando la sube un tercero. Un `drop` PROPIO en la zona **rompe la detección**: al hacer
  `preventDefault` el global se aparta («lo ha gestionado una dropzone propia») y nadie asigna el
  fichero (bug real). Y la lectura se engancha por **delegación** sobre el `change` del input, para que
  dé igual quién lo dispare y cuándo se cree el modal. Al guardar, la liquidación pasa a **FACTURADA** y queda pendiente de
  validar en administración. Si el importe no cuadra se avisa, pero desde dentro **se puede forzar**
  (`force=1`): administración sabe lo que hace. Una factura ya VALIDADA no se pisa.

- ⚠️⚠️ **LO QUE TIENE QUE CUADRAR DE UNA FACTURA ES LA BASE, NO EL TOTAL** (ago 2026). La
  **retención** es la que diga la factura: baja el importe a pagar, pero **no cambia lo que se ha
  facturado ni lo que cuesta el gasto** (lo retenido lo ingresa la casa en Hacienda). Antes
  `_invoice_amount_check` comparaba el TOTAL, así que una factura con retención cuya retención no se
  hubiera leído bien se rechazaba con «faltan X €» y el proveedor no podía enviarla (bug real). Ahora
  cuadra si: **la base es la esperada** · base + IVA es el bruto esperado · total + retención es el
  bruto esperado · el total es el bruto esperado · o el total es la base (facturado sin IVA). El aviso
  se da en términos de BASE y dice que la retención no cuenta para esto.
  · **La BASE es un dato OBLIGATORIO** al subir: es el número contra el que se compara.
  `_invoice_required_data_check` (comprobación del SERVIDOR, no solo del navegador) exige número,
  fecha de emisión, **base** e importe total; si algo no se pudo leer, se dice cuál y no se envía.
  · **Si alguna se cuela sin datos**, se avisa y se puede corregir a mano:
  `_supplier_invoice_missing_fields` marca qué falta y la bandeja de royalties (y el bloque de
  facturas sueltas) enseña el aviso con botón **«Completar los datos a mano»** →
  `supplier_invoice_edit` (pantalla partida). Al completarlos la factura sigue su proceso normal.

- **CONTABILIDAD · pestaña RETENCIONES** (`_accounting_retention_rows`): todas las facturas recibidas
  **con retención** y sus importes (proveedor y CIF, nº, emisión, **trimestre**, concepto, de dónde
  viene —liquidación de royalties, bolsa o gasto de una persona—, base, IVA, retención con su %, total
  y estado), con **total retenido**, resumen **por trimestre** (que es como se declara) y filtro por
  año. ⚠️ En la cabecera se dice lo importante: **la retención no se descuenta del gasto**.

- **CONTABILIDAD · RETENCIONES: los TRES estados en su orden** (ago 2026): validada → **pagada** →
  contabilizada. El **pago es un EURO** (`fa-euro-sign`): **verde pagado, amarillo sin pagar**, y al
  pasar el ratón dice **cuándo se pagó y en qué remesa** (o de qué forma: Pleo, transferencia…). Detrás
  va la etiqueta **«Sin contabilizar» en amarillo / «Contabilizado» en verde** (con su fecha en el
  tooltip). Motor **`_retention_status_map`**, que resuelve los dos estados según de qué cuelgue la
  factura —liquidación de royalties (`paid_at`/`payment_batch_id`/`accounted_at`) o gasto de bolsa
  (`payment_status`/`payment_batch_id`/`accounting_status`)— **en consultas en bloque**: son cientos de
  filas y una consulta por factura sería inaceptable.
  ⚠️ Un `BagExpense` **no tiene columna con la fecha de pago**: la buena es la de su REMESA
  (`execution_date`/`paid_at`) y, si se pagó a mano, la última vez que se tocó el gasto.

- **FICHAS DE PERSONA: las TRES se ven igual** (ago 2026). Personal, tercero e integrante de un
  artista comparten **`templates/_person_identity_summary.html`**: a la izquierda los datos, debajo las
  **tarjetas de fidelización y las matrículas**, y a la derecha el **DNI** con las **etiquetas de sus
  documentos** y un **+** para añadir.
  · ⚠️ **El VALOR va pegado a su etiqueta y todos alineados**: `.psum-list` es una rejilla de dos
  columnas (`grid-template-columns: max-content 1fr`). Antes era `space-between`, así que cada valor se
  iba al borde derecho y quedaban desparejados.
  · **El módulo completo de documentos NO se pinta en la vista de datos**: vive en la pestaña
  «Documentos» de la ficha. En la vista solo están las **etiquetas** (`renderTags` en `person_docs.js`)
  y, al pinchar una, el documento se abre **entero en un pop-up**
  (`templates/_person_doc_view_modal.html`, cargado UNA vez desde `layout.html`): imágenes a la
  izquierda, datos mecanografiados a la derecha, con **descargar y compartir** (correo, WhatsApp, SMS).
  · ⚠️⚠️ **CAMPOS CRUZADOS** (`_person_identity_fields`): **ningún campo se queda vacío si ese dato
  está en otra parte de la ficha de esa persona**. Lo escrito en la ficha MANDA (no se pisa nunca) y lo
  que falta se rellena con lo que diga el documento —**DNI primero, luego pasaporte, luego carnet**
  (`_PERSON_DOC_TRUST`)— diciendo **de dónde sale** (`(del DNI)`), que no es lo mismo que estar
  escrito. El nº de un documento solo vale como DNI/NIF si el documento ES un DNI. Cada ficha le pasa
  al helper sus campos con etiqueta y valor; el resto lo hace él.

- **COMPARTIR MATERIALES de una canción o de un álbum · un solo enlace** (ago 2026). Lo que se manda
  por correo/WhatsApp/SMS **NUNCA es el fichero ni la URL de Storage**: es siempre
  `public_material_view` (`/material/<token>`), una página nuestra con el juego de **og:** completo,
  así que la previsualización es **idéntica en los tres canales**: la **PORTADA** de imagen,
  «**<Artista> · <Canción o Álbum>**» de título y «**Descarga · <tipo de material>**» de subtítulo
  («Descarga · Instrumental»). Dentro, el botón de descargar.
  · Motor: `MATERIAL_SHARE_KINDS` (MATERIAL · STEMS_BUNDLE · SONG_COVER · ALBUM_MATERIAL) ·
  **`_material_share_url`** (lo que se pone en cualquier `share_url`) · **`_material_share_context`**
  (lo que necesitan la página, su og:image y el botón) · `_album_material_label` ·
  `_album_material_rows_payload` (los materiales del álbum con su enlace).
  · El **token es el mismo** para la página y para la descarga: `/material/<token>` pinta y
  `public_song_material_download` / `public_song_material_bundle_download` /
  **`public_album_material_download`** (nuevo) sirven el fichero con ESE token.
  · La miniatura la sirve **`public_material_og_image`** (`_og_image_jpeg_bytes`, 1200×630 desde
  nuestro dominio): portada → foto del artista → logo.
  ⚠️ Antes cada sitio compartía una cosa distinta y por eso «no se veía nada»: en **canción**,
  `share_url` apuntaba **al endpoint de descarga** (un fichero: nada que previsualizar) y en **álbum**
  no había compartir siquiera —la pestaña enseñaba el `file_url` crudo de **Supabase**, que además es
  un dominio ajeno—. El dominio sale bien porque todo se construye con `_external_url_for`.
  ⚠️ La portada que solo vive en `Song.cover_url` (sin fila de `SongMaterial`) se comparte con el kind
  **`SONG_COVER`**, que sirve `public_song_material_download` desde nuestro dominio: si no, ese único
  hueco seguiría repartiendo la URL de Storage.

- **VACACIONES Y DÍAS LIBRES** (ago 2026). Modelos `Holiday` · `VacationRequest` · `VacationDay`
  (**una fila por día**, con `user_id` denormalizado para que el calendario de toda la oficina sea una
  consulta) · `UserContract`, y en `UserProfile` los campos `vacation_days_per_year` y
  `vacation_adjustments` (`ensure_vacations_schema`).
  · **23 días HÁBILES por año trabajado** (`VACATION_DAYS_PER_YEAR`, ago 2026; antes decía 30),
  configurables por persona desde el panel de vacaciones. ⚠️ El **mínimo legal** (art. 38 del Estatuto
  de los Trabajadores) son «treinta días **naturales**», que en días de trabajo son unos 22 (30
  naturales ≈ 21,7 laborables): 23 hábiles **mejora** el mínimo, y aquí se cuenta en hábiles, así que
  el número que va en la constante es 23, no 30. Se cuentan **LABORABLES**: sábado, domingo o festivo
  de Madrid **no consumen saldo** (`_vacation_day_counts`). El día se guarda igual con `counts=False`,
  para que el calendario enseñe el tramo entero de principio a fin.
  · **La fecha de comienzo manda**: en el año de alta (o de baja) los días se **PRORRATEAN**
  (`_vacation_entitlement`). Sin contrato **no se pueden pedir vacaciones**, y se dice por qué.
  · **Festivos de Madrid** (`MADRID_HOLIDAY_RULES` + `_madrid_holidays_full` → `_madrid_holidays`):
  9 nacionales fijos + Viernes Santo + 2 de la Comunidad (Jueves Santo y 2 de mayo) + 2 de Madrid
  capital (San Isidro y la Almudena), con Semana Santa calculada (`_easter_sunday`, verificado
  2024-2027).
  ⚠️ **EL FESTIVO QUE CAE EN DOMINGO SE TRASLADA AL LUNES** (art. 37.2 del ET para los nacionales; la
  Comunidad y el Ayuntamiento hacen lo mismo con los suyos): comprobado contra la realidad — 2 de mayo
  de 2021 → lunes 3, 15 de agosto de 2021 → lunes 16, San Isidro de 2022 → lunes 16, 25 de diciembre
  de 2022 → lunes 26, 12 de octubre de 2025 → lunes 13, y 2026 → 2 de noviembre y 7 de diciembre. El
  domingo **se conserva** (ese día ES la festividad y así se ve) y se AÑADE el lunes con el nombre
  diciéndolo («… (trasladado del domingo 1 de noviembre)»); si el traslado cae encima de otro festivo
  se dicen los dos en el mismo día (2 de mayo de 2022) en vez de perder uno. Jueves y Viernes Santo
  nunca caen en domingo.
  ⚠️ **Cada año lo publican el BOE, el BOCM y el Ayuntamiento** y puede haber excepciones (sustituir un
  festivo que cae en sábado, llevarse un local a otro día): para eso está **`MADRID_HOLIDAY_OVERRIDES`**
  (`{año: {"add": [...], "remove": [...]}}`, manda sobre la regla) y la corrección a mano en
  Vacaciones → «Festivos y normas». Se **siembran una vez por año** (marca
  `holidays_seeded_madrid_<año>`) y hay un arreglo puntual para los años ya sembrados que solo añade
  **los traslados que faltaban** (marca `holidays_transfers_madrid_<año>`): así no se resucita nada
  que se hubiera borrado o corregido a mano.
  · **EN EL CALENDARIO SE VE QUÉ FESTIVIDAD ES** (ago 2026): en la vista de MES el nombre va dentro de
  la casilla (`.vac-day__fest`) y en la de AÑO —donde la casilla es un cuadradito— los festivos del mes
  se listan **debajo de cada mes** (`.vac-month__fests` / `holidaysOfMonth`). Antes solo estaba en el
  `title` y no se veía.
  · **DÍA NO LABORABLE · a quién se le aplica** (ago 2026): al marcarlo se pregunta **toda la oficina**
  o **solo algunas personas** (rejilla con sus fotos). Se guarda en **`Holiday.user_ids`** (JSONB;
  **vacío = a todos**, que es como se comportaban todos los anteriores) y **solo les afecta y les sale
  a ellas**: punto único **`_holiday_applies_to`** + el parámetro **`user_id=` de
  `_vacation_holidays`**, que hay que pasar SIEMPRE que se calcule para una persona (saldo, su
  calendario, apuntarle días, conceder un día libre, el aviso y la agenda de Inicio). El aviso va solo
  a quien le afecta. En el calendario de toda la oficina se distingue con rayado (`is-partial`) y en
  «Festivos y normas» se dice «Solo para X».
  · **Punto único de saldo `_vacation_balance`** (le corresponden · aprobados · disfrutados ·
  pendientes de aprobar · le quedan), usado por su pantalla, el panel de gestión, la ficha de personal
  y el control de que una petición no se pase.
  · **Normas** (`_vacation_rules_text`, editable en Vacaciones → Festivos y normas): texto que se ve al
  pedir. Y las que se aplican SOLAS al contar (`_vacation_check_request`): findes y festivos no restan ·
  no se puede pasar del saldo · no se pueden pisar días que ya tienes pedidos o aprobados · y **aviso**
  (no bloqueo) de con quién te solapas (`_vacation_overlaps`, en vivo por `mis_vacaciones_check`).
  · **Pantallas**: **«Mis vacaciones»** (`/mis-vacaciones`, en el menú de la propia persona) con el
  saldo, el calendario del año y el asistente para pedir (marcar **pinchando o arrastrando**, contador
  en vivo); y la sección **«Vacaciones y días libres»** (`/vacaciones`, pestañas Calendario ·
  Peticiones · Festivos y normas) con el calendario mensual de toda la oficina **con las fotos**,
  filtro por persona, flechas de mes, el listado de personal con su resumen y los tres puntitos
  (configurar sus días · apuntarle días · ver su contrato).
  · **Calendario compartido**: `static/js/vacaciones.js` (`VacCalendar.create`, modos `year` y `month`)
  + estilos `.vac-*`. ⚠️ Nada de `toISOString()` para la fecha del día: pasa por UTC y en España se
  lleva el día por delante. ⚠️⚠️ El arrastre marca **los días POR LOS QUE SE PASA,
  uno a uno** — no el bloque entre el primero y el de debajo del puntero (antes se pintaba el rango
  entero, así que al cruzar de fila se marcaban días por los que no habías pasado). Para que un
  barrido rápido no se salte ninguno se recorre el **CAMINO del puntero** (eventos coalescidos +
  interpolación cada ~8 px), el mismo truco del mapa de butacas.
  ⚠️ `getCoalescedEvents()` puede devolver una lista **VACÍA**, y una lista vacía es «verdadera»: con
  un `||` no se caía al propio evento y **no se marcaba nada** (bug real).
  · **EXTRAS de vacaciones** (ago 2026): días ADICIONALES de UNA persona, con su motivo y su número,
  y **cada uno es su propia bolsa** (no salen de sus vacaciones ni las tocan). Se configuran en los
  tres puntitos de la persona → «Configurar sus días»: el preconfigurado es **Luna de miel** (basta
  ponerle el número) y se pueden añadir más. Modelo: `UserProfile.vacation_extras` (lista de
  `{id, label, days, natural}`) + **`VacationRequest.extra_id`** (de qué bolsa salen los días).
  Catálogo `VACATION_EXTRA_PRESETS`; lectura `_vacation_extras` / `_vacation_extra`; formulario
  `_parse_vacation_extras_form`; saldo por bolsa en `_vacation_balance()["extras"]`.
  ⚠️ **`natural=True` = se cuentan días NATURALES**, así que dentro de ese permiso los fines de semana
  y los festivos **TAMBIÉN consumen** (una luna de miel de 15 días naturales son 15 días seguidos, no
  15 laborables). Es lo único que cambia, y lo aplican `_vacation_apply_days(..., natural=True)`
  (pone `counts=True` en todos los días) y `_vacation_check_request(..., extra_id=...)`. En la pantalla
  se avisa con la etiqueta **Importante** al configurarlo y con el texto del contador al pedirlo.
  ⚠️ Los días de un extra **se excluyen del saldo normal** en `_vacation_balance` y de la comprobación
  al APROBAR (`vacation_request_decide`): si no, se contarían dos veces y no se podría aprobar.
  ⚠️ Se pide con su propio botón («Solicitar luna de miel») en «Mis vacaciones» y con el selector
  «¿De dónde salen?» al apuntarle días. `vacation_extras` está en `_snapshot_user_profile` (si no, es
  invisible desde el estado y las plantillas).
  · **CUADRANTE de vacaciones y días libres** (pestaña `?tab=cuadrante`, ago 2026; se llega también
  desde los tres puntitos de cada persona): a la **izquierda** el listado de todo lo que ocupa días
  (`VACATION_LIVE_STATUSES`, vacaciones y días libres, con `?persona=` solo los suyos) y a la
  **derecha** el calendario. En los tres puntitos de cada fila: **editar los días**
  (`vacation_request_days_edit`, que reabre el calendario con sus días ya marcados y los REEMPLAZA;
  las normas se comprueban con `exclude_request_id` para que no choque consigo misma) · **pasarlos a
  día libre no laborable** (`vacation_request_to_nonworking`: crea el `Holiday` EMPRESA **solo para esa
  persona** y BORRA la petición, así que los días le vuelven al saldo) · **eliminar**.
  ⚠️ El calendario del modal se REHACE en cada apertura (cada fila trae sus días) y se monta en el
  CLIC, no en `shown.bs.modal`.
  ⚠️ **`data-confirm` en un formulario NORMAL no preguntaba nada** (bug real): el motor solo lo miraba
  en los `form[data-inline]`, así que un «Eliminar» de una fila borraba al primer clic. `ajax_inline.js`
  tiene ahora un handler propio para los formularios que navegan (y respeta el `data-confirm` del
  BOTÓN que envía).
  · **TODO EL PERSONAL con su foto** arriba del cuadrante (`.vac-quad-people`): se pincha a una persona
  y se ve SU cuadrante; la primera tarjeta es «Toda la oficina». Cada una lleva **su color**, el mismo
  con el que sale en el calendario.
  · **RAYITAS por persona** en el cuadrante general (`stripes: true` de `VacCalendar`): una barra con
  **su color y su foto** por cada cosa de ese día, y al pasar el ratón se dice **qué es, el motivo y de
  quién** (`.vac-day__bars` / `.vac-bar`). Viendo el de UNA persona no se usan: ahí basta el color por
  tipo y estado. Para el tooltip, `_vacation_calendar_payload` manda también el **motivo** (`note`) y
  el `extra_id` de cada día.
  · **UNA PETICIÓN SE VE EN EL CALENDARIO** (pestaña Peticiones, botón «Ver en el calendario»): los días
  que pide salen **marcados** y alrededor **todas las vacaciones y días libres de esa persona**, que es
  el contexto para decidir. El calendario se monta en el clic y se rehace en cada apertura (cada
  petición es de otra persona y de otros días).
  · **AL PASAR EL RATÓN SE DESTACA EL TRAMO ENTERO** (`highlight`/`bindHighlight` en `vacaciones.js`,
  clases `.vac-cal--hl` + `.vac-day.is-hl` + `.vac-bar.is-hl`): sobre cualquier día de unas vacaciones
  o de un día libre se marcan TODOS los días de ESA petición (índice `byRequest`) y se atenúan los
  demás, así se ve de un golpe cuánto dura. Al **pinchar** se queda fijo (otro clic o Escape lo suelta)
  — salvo en los calendarios donde se marcan días, que ahí el clic es para eso. En el cuadrante general
  se destaca la **rayita** de esa persona (cada `.vac-bar` sabe de qué petición es).
  · ⚠️ **NADIE TOCA SUS PROPIOS DÍAS** (ago 2026): en «Mis vacaciones» no se puede editar, borrar ni
  anular nada —solo PEDIR—. Eliminar y editar es de quien GESTIONA las vacaciones y de DIRECCIÓN
  (`_can_manage_vacations`), desde el cuadrante. `mis_vacaciones_cancel` lo comprueba en el SERVIDOR
  (no basta con esconder el botón) y la pantalla lo dice.
  · ⚠️ **AL MARCAR DÍAS SE VEN LOS QUE YA TIENE** (ago 2026): el calendario con el que se pide o se
  apunta enseña los días de ESA persona ya **pedidos (pendientes)** y **aprobados**, de vacaciones y de
  días libres, con su leyenda de colores — antes los dos modales de «apuntar días» (la sección y la
  ficha de personal) se creaban con `days: []` y se apuntaba encima de otros sin verlo. En la sección
  se filtran de `datos.days` (que trae los de toda la oficina) por la persona, y el calendario del
  modal se reutiliza para varias personas, así que hay **`setDays()`** (si no, se quedaban los de la
  anterior).
  · **Quién gestiona**: dirección y quien tenga la responsabilidad **`VACACIONES`** del reparto de
  administración (`_can_manage_vacations`). ⚠️ El permiso de la sección **se concede y se retira solo**
  al asignar esa responsabilidad (`_sync_vacation_access_grant`, enganchado donde se guardan las
  responsabilidades en la ficha de personal): así no hay que acordarse de darlo aparte en Accesos.
  · **Avisos**: al pedir, a dirección y a quien gestione (`_vacation_manager_user_ids`; sin nadie con la
  responsabilidad, a todo Administración); al aprobar o rechazar, a quien lo pidió. Kind `VACACIONES`.
  Módulos de Inicio `HOME_VACATION_PENDING` y `HOME_MY_VACATIONS`.
  ⚠️ Los endpoints `mis_vacaciones_*` van en **`PERSONAL_ENDPOINTS`** (son días propios); los de
  gestión (`vacaciones_view`, `vacation_*`) se mapean a la sección `vacaciones`.
  ⚠️ `vacation_days_per_year`/`vacation_adjustments` hay que añadirlos a **`_snapshot_user_profile`**:
  lo que no esté ahí es invisible desde `_current_user_state()` y desde las plantillas.

- **DÍAS LIBRES y DÍAS NO LABORABLES** (ago 2026, sobre lo de vacaciones):
  · **Día libre** = `VacationRequest.kind` VACACIONES | **DIA_LIBRE** (`VACATION_KINDS`,
  `_vacation_kind`). Comparte tabla, calendario, pantalla y flujo de aprobación con las vacaciones;
  lo único que cambia es que **NO consume el saldo de vacaciones** y lleva su propia cuenta
  (`_vacation_balance` devuelve `free_used`/`free_enjoyed`/`free_pending`). Se pide **con motivo
  obligatorio** y lo aprueba quien aprueba las vacaciones. En «Mis vacaciones» hay dos botones con
  icono (`.vac-actions`): «Solicitar vacaciones» y «Solicitar día libre», y **un solo modal** que
  cambia de tipo. En el calendario se distinguen por color (verde vacaciones, morado día libre).
  · **Día NO LABORABLE de la oficina** (`vacation_nonworking_save`): a efectos de contar es
  exactamente lo mismo que un festivo —no se trabaja y no consume vacaciones—, así que se guarda en
  la MISMA tabla `Holiday` con el ámbito **EMPRESA** y hereda gratis el calendario, el cómputo y
  `_vacation_day_counts`. Se marcan uno o varios sobre el calendario desde Festivos. Si el día ya
  era festivo, no se pisa.
  · **DÍA NO LABORABLE · a quién y CÓMO SE COMUNICA** (ago 2026): al marcarlo se elige **a toda la
  oficina** o **solo a algunas personas** (rejilla con sus fotos y sus nombres).
  ⚠️ Al guardar **ya NO se avisa a nadie**: se ofrece **COMUNICARLO** (`?comunicar=<días>` abre solo el
  pop-up `#nlComunicarModal`), con **los afectados ya marcados** —se puede añadir o quitar a quien
  sea— y el **texto estándar**, que se puede cambiar: si no se toca, va ese
  (`_vacation_nonworking_text`): «Como cortesía, la empresa ha decidido que el próximo **martes 30 de
  junio de 2026**, no se trabaje. Gracias por el buen trabajo y a disfrutar.». Lo manda
  `vacation_nonworking_notify` (correo + campanita).
  · **El CORREO** de un día no laborable es solo eso: logo de la empresa del grupo arriba a la
  **derecha**, el título **«Día no laborable»** y debajo el mensaje. **Sin calendario y sin totales**
  (los otros avisos —vacaciones y días libres— sí los llevan).
  ⚠️ El pop-up se abre con **`window.app33AutoOpenModal`**, no con `new bootstrap.Modal(...)`: el JS
  de la plantilla corre ANTES de que Bootstrap esté cargado.
  · **CONCEDER día libre** (`vacation_grant_free_day`): la empresa se lo regala a **varias personas
  a la vez** (se eligen con casillas) y **sí se les avisa**. ⚠️ No confundir con «apuntar días»
  (`vacation_person_days`), que es meter en el sistema lo YA disfrutado: eso **no** avisa.

- **AVISOS de vacaciones / día libre / día no laborable** (ago 2026). Punto único
  **`_vacation_notice_send`**: manda el aviso por los **DOS canales** —la campanita de la app y el
  **correo**— con el MISMO HTML (`_vacation_notice_html`, estilos en línea), y el enlace del aviso
  abre `vacation_notice_view`, que devuelve **ese mismo HTML**. Si se toca el diseño, se tocan los
  dos a la vez.
  · Contenido: logo de **la empresa del grupo con la que la persona tiene contrato**
  (`UserContract.company_id` → `_vacation_notice_brand`; sin ella, el de la casa) arriba a la
  **derecha**, título centrado (Vacaciones · Día libre · Día no laborable) con las fechas debajo,
  el texto, el **calendario solo de los meses afectados** (`_vacation_notice_calendar_html`, hecho
  con `<table>` y estilos en línea porque va por correo) y las **etiquetas de totales**.
  · **Aprobado** → «¡Enhorabuena!» con iconitos animados (`@keyframes vnPop`; el cliente de correo
  que la tire los enseña quietos). **Rechazado** → sobrio: «Lo sentimos… consulta con
  Administración los motivos», sin iconos ni animación (el `<style>` solo se emite si hay adornos).
  **No laborable** → «La empresa ha decidido que el <fecha completa> no se trabaje»
  (`_vacation_long_date`) y sin totales, que no es el saldo de nadie.
  · **Cuándo se avisa**: al APROBAR o RECHAZAR una petición, al marcar días NO LABORABLES (a toda
  la oficina) y al CONCEDER un día libre. **Apuntar días no avisa**.
  ⚠️ **`vacation_notice_view` va en `PERSONAL_ENDPOINTS`**: el aviso es de la propia persona y, con
  la regla de prefijo `vacation_*` → sección `vacaciones`, se comía un **403 al pinchar su propio
  aviso** (bug real). Dentro se comprueba que los días son suyos (o que quien mira gestiona).

- ⚠️⚠️ **LAS VACACIONES SE PINTAN POR TRAMOS DE DÍAS SEGUIDOS** (bug real y gordo, ago 2026). Una
  petición puede tener días que NO van seguidos (uno el 24 de agosto y el resto en octubre) y se
  pintaba como **UNA franja del primero al último**, así que en el calendario esa persona salía de
  vacaciones **agosto, septiembre y octubre enteros**. Punto único **`_vacation_runs(dias)`**, que
  parte los días en rachas consecutivas, aplicado en **Mi calendario** (`_agenda_personal_days`), en el
  **Calendario general de oficina** (`_agenda_office_items`) y en la etiqueta
  (**`_vacation_range_label`**, que ahora dice **todos** los tramos: «24/08/2026 · 13 – 16/10/2026», y
  no solo el primero con «(y 2 tramos más)»). Cada franja lleva además **cuántos días son**.
  · **En el cuadrante se EDITA con DOBLE CLIC** sobre las vacaciones del calendario (el clic simple
  sigue fijando el destacado del tramo): se abre el MISMO pop-up que los tres puntitos de su fila
  (`abrirEdicion` es el punto único, y `onRequestOpen` la opción del calendario). Si la petición no
  está en el listado de la izquierda (otro filtro), sus días se sacan del propio payload, así que el
  doble clic funciona igual.
  ⚠️ Los `people` del payload van por **`user_id`**, no por `id`.

- **Calendario de INICIO · categoría «Vacaciones y días libres»** (ago 2026): `_agenda_personal_days`
  añade a la agenda los días PROPIOS de quien mira (vacaciones y días libres, aprobados o
  pendientes, más los festivos y los no laborables) como kind **`vacaciones`** de
  `AGENDA_KIND_META`. Van **sin artista** y solo cuando se piden: `_agenda_build(...,
  include_personal=True)` lo activan **únicamente** `_home_agenda` y `home_agenda_data` sin
  `artist_id`. ⚠️ Esa bandera existe a propósito: `_agenda_build` alimenta también los calendarios
  públicos, iCal y CalDAV de los artistas, y ahí no pintan nada —serían datos personales de la
  oficina en un enlace que se comparte fuera.

- ⚠️⚠️ **`shown.bs.modal` NO ES FIABLE en esta app** (ago 2026, bug real): con `modal_stack.js` por
  medio llega `show.bs.modal` pero **nunca `shown`**, así que cualquier cosa que se construya en ese
  evento no se construye. Pasó con los calendarios de los modales de vacaciones: el modal se abría
  **vacío** y «apuntar días» no guardaba nada porque no había día que marcar. **Lo que haya que
  montar al abrir un modal se monta EN EL PROPIO CLIC** (o, como mucho, en `show.bs.modal`).
  ⚠️ En el mismo arreglo: el gesto del calendario resuelve el día con **`ev.target`** al empezar y
  deja `elementFromPoint` de respaldo — dentro de un modal con scroll, una celda fuera del viewport
  hacía que `elementFromPoint` no devolviera nada y el clic se perdía. Al ARRASTRAR es al revés
  (con captura de puntero `ev.target` se queda en la celda de origen).

- **QUIÉN ES DIRECCIÓN se decide en su ficha** (ago 2026). `User.role == 10` = dirección (acceso
  total). Hasta ahora eso solo se podía cambiar en **`users.txt`** y —peor— la siembra del arranque
  **volvía a aplicar el rol del fichero en CADA deploy**, así que había gente saliendo como dirección
  sin serlo (viendo TODO, también lo económico) y no había forma de quitárselo desde la app.
  · La siembra ya **no toca el rol de quien existe** (solo lo pone al CREARLO), y el login de
  respaldo por `users.txt` tampoco lo pisa: manda lo que diga la BD. Es el mismo caso que el nick.
  · Sin rol escrito en el fichero se entra con el acceso **más bajo** (antes: dirección).
  · Interruptor en la ficha → pestaña **Accesos** (`personnel_role_set`, `POST
  /personal/<id>/direccion`, **solo dirección**): «Marcarla como dirección» / «No es de dirección».
  ⚠️ **Nadie se lo cambia a sí mismo** (se quedaría sin poder devolvérselo). ⚠️ Su formulario va
  FUERA del de accesos (un `<form>` dentro de otro no es HTML válido) y lo envía un enlace.
  ⚠️ Al dejar de ser dirección, esa persona ve **solo lo que le concedan sus permisos**: lo normal es
  configurárselos ahí mismo, en la pantalla en la que ya se está.

- ⚠️ **GESTIONAR VACACIONES O CONTRATOS no es lo mismo que tener la ficha de personal** (bug real,
  ago 2026). Al separar la ficha en un permiso por pestaña, el gate empezó a exigir además el grant
  de esa pestaña, y quien lleva las vacaciones (por su **responsabilidad**) o los contratos (por ser
  de **Administración**) se comía un **403** al abrir la pestaña de cualquier persona. Ahora
  `_personnel_responsibility_tab_request()` deja pasar las pestañas **vacaciones** y **contrato**
  (GET y POST) a quien las gestiona —y `personnel_contract_save/_delete` a quien puede ver contratos—;
  el resto de pestañas sigue exigiendo su permiso. La decisión fina la sigue tomando la vista
  (`_can_manage_vacations` / `_can_view_person_contract`), que es quien manda.
  · ⚠️⚠️ **Y el cartel «Usuario de dirección» era SOLO de la pestaña Accesos** (bug real, ago 2026):
  estaba en la cadena de pestañas de `personnel_detail.html` **sin mirar el `tab`**, así que en la
  ficha de cualquiera marcado como dirección se comía TODAS las demás — quien lleva los contratos o
  las vacaciones abría su pestaña y lo único que veía era «No es necesario (ni posible) configurar
  sus accesos». Ahora es `{% elif tab == 'accesos' and target_is_master %}`.
  · ⚠️ **`_can_manage_vacations()` acepta también el departamento ADMINISTRACIÓN** (como
  `_can_view_person_contract`): antes solo valía la responsabilidad «VACACIONES», que es un ajuste
  fino que hay que acordarse de dar (y que solo concedía el permiso de sección al guardarse desde la
  ficha, vía `_sync_vacation_access_grant`), así que administración se comía un **403** al apuntar
  días. Además, `_support_endpoint_decision` deja pasar `vacaciones_view` y `vacation_*` a quien
  gestiona: **la llave es gestionar vacaciones, no un grant que puede no estar sincronizado**.
  La responsabilidad **sigue filtrando** dónde tiene que estar: en el módulo de Inicio
  (`_home_vacation_pending` usa `_admin_task_is_mine`), no en el acceso.
  · En el listado `/personal` se marca con una **pastilla «Dirección» clicable** (lleva a su pestaña
  Accesos) a quien lo sea: así se ve de un vistazo a quién hay que corregir, sin abrir ficha a ficha.

- **PERSONAL · un permiso POR PESTAÑA de la ficha** (ago 2026). Antes **toda** la ficha
  (`personnel_detail_view`) colgaba de `personal.usuarios.accesos`, que es la pestaña de PERMISOS:
  para dejar a alguien ver los Datos o los Documentos de una persona había que darle la de Accesos,
  que es de dirección — por eso «conceder ver y editar el personal» acababa en **error de permisos**
  (bug real). Ahora hay un recurso por pestaña: `personal.usuarios.` **datos · documentos · prl ·
  contrato · vacaciones** (+ la de `accesos` de siempre), y `_personnel_tab_resource_key` resuelve
  el permiso por el `tab` del GET o el `mode` del POST. Sin pestaña concreta se resuelve al padre
  (`personal.usuarios`) y la vista lleva a la primera que esa persona sí puede ver.
  ⚠️ Se comprueba el **grant EXACTO** (`_personnel_tab_grant`), NO `has_access_key`: ese acepta los
  ANCESTROS, así que conceder «Usuarios» daría de golpe todas las pestañas y no se podría dejar a
  alguien solo con Datos, que es justo lo que se pide.
  ⚠️ **Nadie pierde acceso al desplegar**: `_personnel_tabs_access_seed` (marca
  `personnel_tabs_access_seed_v1`) reparte las pestañas nuevas a quien YA podía abrir la ficha.
  ⚠️ El resumen de identidad de la pestaña **Datos** enseña el DNI y las etiquetas de los
  documentos: al separar los permisos, eso pasa a depender de **Documentos** (quien solo tenga
  Datos ve los datos, no las fotos del DNI ni los campos cruzados que salen de ellos).
  · **Guardar los accesos sigue siendo solo de dirección** (`is_master()` dentro del endpoint),
  se conceda lo que se conceda. Y **cada uno ve SIEMPRE su propia pestaña «Vacaciones»** aunque no
  tenga ningún permiso de Personal (`_personnel_own_vacations_request`).
  · El listado de personal de **Vacaciones** se convierte en TARJETAS en móvil (`.vac-people` +
  `data-label` por celda): con 8 columnas, el ancho que le quedaba al nombre lo partía letra a letra.

- **MI CONTRATO · pestaña de la ficha de personal** (ago 2026): `UserContract` (fecha de comienzo,
  fecha de fin, tipo, PDF y notas; se guarda el **histórico** y la antigüedad es la fecha más antigua).
  **Solo lo ven administración y dirección** (`_can_view_person_contract`): ni la pestaña se pinta.
  Al lado del contrato se enseña el resumen de vacaciones que sale de esa fecha, que es para lo que
  sirve. Endpoints `personnel_contract_save` / `_delete` (heredan el permiso de la ficha de personal).

- **EMPRESA DEL GRUPO SIN LOGO → ICONO DE EMPRESA + NOMBRE** (ago 2026). Globales
  **`company_logo(empresa, size=, cls=)`** y **`company_chip(...)`** (en `inject_globals`): pintan el
  logo y, si la empresa todavía no tiene, un **icono de edificio** (`.co-logo--empty`) conservando el
  hueco, con el nombre al lado en el chip.
  ⚠️ Antes se caía al logo de **Treinta y Tres / PIES**, que es PEOR que no enseñar nada: una empresa
  recién creada aparecía con el logo de OTRA del grupo. Aplicado en `/empresas`, la ficha de la
  empresa, administración (a favor y remesas), la vista de conciertos y ventas por empresa; en los
  selectores con miniatura el `data-logo` se queda vacío en vez de apuntar al logo de la casa.
  ⚠️ En las páginas PÚBLICAS (ficha de contratación, cartelería, correos) el respaldo al logo de la
  casa SÍ se mantiene a propósito: ahí hay que enseñar una marca.

- **SIN FOTO NI LOGO → MUÑEQUITO GRIS** (ago 2026, `static/img/avatar_placeholder.png` + `.svg`,
  global **`DEFAULT_AVATAR_URL`**). Se aplica al **personal de la oficina** y a los **terceros**: donde
  antes salía el logo de la casa (o nada) ahora sale el avatar gris, y vale para los que ya estaban
  creados porque el respaldo es **al pintar**, no un dato guardado.
  ⚠️ **NO se puede usar `placeholder_photo`** para esto: hay una política global en `styles.css`
  (`img[src*="/img/placeholder_photo"]{ display:none }`) que dice «sin imagen → el hueco se OMITE», y
  aquí se quiere justo lo contrario. Por eso es un archivo nuevo, que no casa con esa regla; el resto
  (ticketeras, eventos, vinculaciones…) mantiene la política de omitir.
  · El sistema global de respaldo de imágenes (`initImageFallbacks` en `scripts.js`) también lo
  entiende: una imagen marcada con **`data-avatar="1"`** (o `.user-nav-avatar`) que falle cae al
  muñequito en vez de al hueco omitido (`data-default-avatar-url` en el `<body>`).

- ⚠️⚠️ **`form.action` NO ES LA URL si el formulario tiene un campo llamado «action»** (bug real,
  ago 2026). El DOM expone los controles con nombre como propiedades del formulario, así que
  `<input name="action">` o `<button name="action">` **tapan** `form.action` y esa propiedad
  devuelve EL CAMPO. `ajax_inline.js` la usaba para el fetch → salía a `/[object HTMLInputElement]`
  → 404 → no encontraba la zona → **recargaba la página entera**. Efecto visible: *cualquier* acción
  de **Integraciones** (Pleo, Cabify, Holded, Chartmetric, Enterticket — todas usan `name="action"`)
  te devolvía al principio de la página. Arreglado leyendo el **ATRIBUTO**
  (`form.getAttribute('action')`). Al montar un formulario con un campo «action», ojo con esto.
  ⚠️ Y **dos botones con `name="action"` en el MISMO formulario se pisan**: hay que separarlos en
  formularios distintos (probar la clave de Chartmetric acababa guardándola vacía).

- **CHARTMETRIC · la clave se mete desde la app** (ago 2026): el refresh token caduca y se rota, así
  que ya no hace falta entrar en Render. Se guarda en `AppSetting` (`CM_TOKEN_SETTING`) y
  `chartmetric_utils` lo lee por un **proveedor** (`set_token_provider`, lo enchufa `app.py`), con lo
  del entorno como respaldo. Al guardar se **prueba al momento** y se apunta el resultado
  (`_chartmetric_record_status`), que es lo que pinta la **etiqueta de estado**
  (`_chartmetric_status`: Desactivada · Sin comprobar · **Conectada** · **Con error**, con el motivo
  exacto de Chartmetric debajo). `clean_api_key` quita espacios, comillas y el «refreshtoken:»
  delante; al cambiar la clave se tira el access token cacheado (`reset_access_token`) o el proceso
  seguiría usando el viejo y «probar conexión» mentiría.
  ⚠️ **`chartmetric_ping` hace una LLAMADA REAL**, no solo saca el token: una cuenta sin créditos
  saca token y falla en todo lo demás, así que un ping que solo pidiera token diría «correcta».

- **CHARTMETRIC · vinculada pero sin enlaces ni reproducciones** (corregido ago 2026). Había canciones
  con `cm_track` puesto —y por tanto en verde como «Vinculada»— y con **todos los botones vacíos y cero
  reproducciones**. Dos causas independientes:
  ⚠️ **La ruta de las reproducciones nunca se confirmó.** `get_track_stat` pedía
  `/api/track/{id}/{source}/stats` —lo decía su propio comentario, «CONFIRMAR nombres reales al
  integrar»—, la API devolvía 404, `_get` levantaba `RuntimeError` y el `except` se lo tragaba: ni
  datos ni aviso. Ahora hay **`TRACK_STAT_PATHS`** (la de la referencia,
  `/api/track/chartmetric/{id}/stats/{source}`, primero) y se **prueba y se recuerda la que responde**
  (`_TRACK_STAT_PATH_OK`, mismo patrón que la URL base de Cabify y la ruta de adjuntar de Holded). Un
  «sin créditos» o un 429 **cortan** la prueba: son definitivos y no se gastan llamadas de más.
  ⚠️ **Los enlaces dependían del nombre EXACTO del campo.** Se enumeraban a mano
  (`spotify_track_id`/`spotify_id`/`spotify_track_ids`) y bastaba que la respuesta trajera otra forma
  para no sacar ninguno. Ahora **`_cm_scan_id`** recorre las claves y acepta la que contenga todas las
  palabras pedidas (con `exclude` para no confundir el id de álbum con el de track), y
  `_cm_explicit_url` coge la URL si viene hecha. **Apple** se construye desde el id de iTunes
  (`music.apple.com/es/song/<id>`) y **Amazon** desde el suyo: antes se exigía una URL explícita que
  Chartmetric casi nunca manda, así que esos dos botones estaban **siempre** vacíos.
  · **Ya no falla en silencio**: `_cm_refresh_song_streams` devuelve `{points, error}` y
  `cm_song_reresolve` dice cuántos enlaces y cuántos puntos ha traído, o por qué no ha podido. Y
  re-resolver a mano **pisa** los enlaces (`force=True`): es para arreglar lo que está mal.
  ⚠️ **Pendiente de la primera prueba real**: en local no hay `CHARTMETRIC_REFRESH_TOKEN`, así que las
  rutas candidatas no se han podido probar contra la API. Si la buena no fuera ninguna de las tres, el
  aviso de la pantalla lo dirá con el error exacto de Chartmetric.

## Marca / estética
- Colores: **#E33D48** (rojo, `--brand-primary`) y **#007CA2** (azul, `--brand-accent`).
- Logos: `static/img/logo_33_producciones.png` y `static/img/logo.png` (PIES). Co-branding.
- Hay refinamiento global de Bootstrap en `styles.css` (botones, tarjetas, navbar, tablas, pestañas,
  formularios). Landing pública en `landing.html` (standalone).

- **Fotos / vídeos (galería transversal)**: pestaña **Fotos** en ficha de **concierto** y **acción**
  (+ pestaña agregada en **artista**). Modelos en `models.py`: `Photo` (polimórfico `owner_type`
  CONCERT|ACTION + `owner_id`, `artist_id` denormalizado, `photographer_promoter_id`), `PhotoAlbum`/
  `PhotoAlbumItem` (N:M), `PhotoNote` (notas TEAM|APPROVAL), `PhotoApprovalRequest`/`PhotoApprover`/
  `PhotoApproval` (aprobación por foto×aprobador), `PhotoShare` (enlace público de descarga); todo en
  `ensure_fotos_schema()`. UI: partial reutilizable **`templates/_fotos_panel.html`** + **`static/js/fotos.js`**
  (render desde JSON embebido `#fotosData`), estilos `.fotos-*` en `styles.css`. Estado de aprobación
  por foto lo calcula `_photo_approval_map` (REJECTED>APPROVED>PENDING>NONE) → badge + popover; por
  defecto se ven **aprobadas + sin solicitud**. Subida vía `upload_image`/`upload_file` a `photos/`
  (XHR con `X-CSRFToken` manual para la barra de progreso). Endpoints `/fotos/...` registrados como
  **apoyo** (`SUPPORT_READ/ACTION_ENDPOINTS`); páginas públicas `public_photo_approval`
  (`/aprobacion-fotos/<token>`) y `public_photo_share` (`/fotos-compartir/<token>`) exentas (en
  `PUBLIC_ENDPOINTS_EXTRA` + `_CSRF_EXEMPT_ENDPOINTS`). WhatsApp/SMS = enlaces `wa.me`/`sms:` (sin
  pasarela). El fotógrafo es un tercero (`Promoter`) con alta rápida (`quick_create.js` sobre un
  `<select>` oculto) o «Desconocido».

- **FICHA DEL ARTISTA · integrantes y NOTIFICACIONES** (ago 2026):
  · En «Datos» va **primero el módulo INTEGRANTES**: por cada uno, a la izquierda foto + nombre, DNI,
  nacimiento, email y teléfono, y debajo sus **tarjetas de fidelización y matrículas**; a la derecha
  **solo el ANVERSO del DNI** (`.mem-dni`) y bajo él las **etiquetas de sus documentos** con icono
  (`.mem-doc`) y un **+** que abre el panel para subir más. Uno debajo de otro.
  · **Editar integrantes** (botón arriba del módulo): añadir y quitar solo se ven en modo edición
  (`[data-members-only]`, que nacen con `d-none`).
  · Debajo, **NOTIFICACIONES** (`templates/_artist_notifications.html`, antes «Emails adicionales»,
  que se ha retirado): quién recibe cada comunicación. Modelo **`ArtistNotificationContact`**
  (`ensure_artist_notifications_schema`): persona (tercero, se sugieren los INTEGRANTES que faltan) +
  `channels` de `ARTIST_NOTIFICATION_CHANNELS` (LIQUIDACIONES · PRODUCCION · DISCOGRAFICA · EDITORIAL ·
  PROMOCION · INVITACIONES) + `liquidation_concepts` (los conceptos del contrato del artista, que da
  `_artist_liquidation_concepts`). **Un canal lo pueden recibir varias personas.** Endpoints
  `artist_notification_contact_save` / `_delete`.
  · **Punto ÚNICO para mandar: `_artist_notification_emails(session_db, artist_id, channel,
  concept=None)`** — lo que se configure manda de ese momento en adelante. En LIQUIDACIONES, quien no
  haya marcado conceptos recibe todas. ⚠️ Con **nadie** configurado en un canal cae al correo del
  artista y a sus correos adicionales (`fallback=True`): mejor eso que no llegar a nadie. Ya
  enganchado en las **liquidaciones de royalties** (`_beneficiary_email_delivery_data`), las
  **certificaciones de disco** (`_artist_email_delivery_data` → canal DISCOGRAFICA) y el aviso de
  **registro en SGAE** (canal EDITORIAL). Para cablear otro envío basta llamar a ese helper.
  · **Eliminar un artista es SOLO de dirección** y vive en el **lápiz de la cabecera** (la «zona
  peligrosa» de Datos se ha retirado).

- **FICHA DEL TERCERO · el formulario por VIÑETAS y los datos de contacto CRUZADOS** (ago 2026):
  · **Editar la ficha va por bocadillos** (`.demo-card`, los mismos del formulario de una maqueta),
  cada tipo de dato en el suyo: **¿Quién es?** · **Datos de contacto** · **Dirección** ·
  **Sociedades vinculadas** · **Viaje y hoteles** · **Redes sociales**.
  · **Toda PERSONA tiene NOMBRE y APELLIDOS además del NICK** (`first_name`/`last_name`, que antes
  solo se rellenaban al escanear el DNI): el nick es como la llamamos nosotros. En una **empresa** o
  una **institución** esos dos campos no se piden (su nombre es el nick / el nombre social) y el JS
  los **deshabilita** al ocultarlos (ocultar no basta: se enviarían igual).
  · ⚠️⚠️ **EL EMAIL Y EL TELÉFONO DE LA FICHA SON DATOS DE CONTACTO Y ESTÁN CRUZADOS** con su
  pestaña: no puede haber un tercero con correo y la pestaña de contacto vacía. Punto único
  **`_promoter_sync_contact_rows`** (en los DOS sentidos: de la ficha a la pestaña y, si la ficha no
  tiene, el primero de la pestaña sube a principal), llamado al guardar **y al abrir la ficha** —así
  los terceros de antes quedan al día solos, sin migración—.
  · **Varios correos y varios teléfonos, cada uno con su concepto**: `PromoterEmail` y el nuevo
  **`PromoterPhone`** (hermanos). El principal se ve con su etiqueta; al borrarlo, el que queda pasa a
  ser el de la ficha. `_promoter_phone_numbers` es el punto único de «los teléfonos de este tercero»
  (y `_norm_phone_key` compara números, así «+34 600…» y «600…» no se duplican).
  · **«Emails adicionales» YA NO ESTÁ en Información general**: los correos viven en la pestaña de
  datos de contacto, que es su sitio.
  · **PERSONAS DE CONTACTO** (debajo, en esa misma pestaña): a quién se llama para hablar con ese
  tercero. Pueden **SER otro tercero** (`PromoterContact.link_promoter_id`, buscador Select2 con foto):
  entonces su nombre, correo y teléfono se cogen de su ficha y la tarjeta lleva a ella.
  ⚠️ Con esa columna, `PromoterContact` tiene DOS caminos a `promoters`, así que
  `Promoter.contacts` y `PromoterContact.promoter` necesitan **`foreign_keys`** (si no, la app no
  arranca: `AmbiguousForeignKeysError`).
  · **SOCIEDADES VINCULADAS solo si hay**: en la ficha esa función no se pinta cuando el tercero no
  tiene ninguna; se añaden desde el formulario de editar (donde sale siempre, con el modal apilado).

- **PERSONAS DEL ARTISTA = TERCEROS que forman parte de él** (`ArtistPerson.promoter_id`): un miembro
  de un grupo (o el solista) es un **tercero particular** con exactamente los mismos datos (DNI,
  pasaporte, carnet, tarjetas de fidelización, matrículas, necesidades de viaje, cuenta bancaria,
  dirección fiscal…), que se rellenan en la viñeta **«Integrantes:»** de la pestaña «Datos» de la
  ficha del artista sin salir (ago 2026: era la pestaña «Personas»; su contenido vive en
  `templates/_artist_members.html`, incluido desde «Datos», y `?tab=personas` redirige allí).
  No se duplica nada: los datos viven en su `Promoter` + `PersonDocument`, así que el mismo músico
  puede estar en dos grupos y, cuando factura, la búsqueda por DNI/CIF lo encuentra.
  Helpers `_artist_person_full_name` / `_artist_person_promoter` / `_ensure_promoter_for_artist_person`
  (crea el tercero o **vincula** uno existente por `link_promoter_id`, reutilizando el que tenga ese
  nombre exacto — mismo patrón que `_ensure_promoter_for_media`) / `_artist_person_cards`. Endpoints
  `artist_person_data_save` (datos + viaje, crea el tercero si falta), `artist_person_document_save` /
  `_delete` (delegan en `_person_document_save`/`_delete_one` con owner PROMOTER) — mapeados a
  `artists` por prefijo `artist_person` en `_resolve_request_resource_key`/`_coarse_endpoint_resource`,
  y la pestaña `personas` hereda el permiso de `artists.datos` (no hay recurso nuevo que conceder).
  **Añadir persona = BUSCAR EN TERCEROS**: barra de búsqueda arriba de la pestaña con resultados
  **en vivo desde el primer carácter** (`/api/search/promoters`, acento-insensible y por palabras, con
  foto redonda, correo/teléfono y las vinculaciones); quien ya está sale marcado «ya está» y no se
  puede elegir dos veces (el servidor también lo comprueba); si no hay coincidencias, la última fila
  ofrece **crear** la persona con lo escrito (y su ficha de tercero). Al elegir un tercero, el nombre
  lo saca el servidor de su ficha (no hay que teclearlo). Al final de la barra hay **siempre un botón +**
  que da de alta a la persona con lo escrito, aunque la búsqueda esté trayendo resultados (es para cuando
  no es ninguna de las que salen). Estilos `.aps*` en `styles.css`, JS en línea
  en la pestaña. En «Datos» queda solo el listado con el botón *Ver y editar*.
- **Documentos personales (pestaña «Documentos» en ficha de personal, de tercero y de las PERSONAS DE
  UN ARTISTA)**: modelo
  polimórfico `PersonDocument` (`owner_type` USER|PROMOTER, `kind` DNI|LICENSE|PASSPORT|LOYALTY|PLATE,
  `front_url`/`back_url`, `doc_number`, `full_name`, `birth_date`, `expiry_date`, `issue_date`
  (emisión, pasaporte), `company`, `label`, `extra`) + `ensure_person_documents_schema`. Panel
  reutilizable `templates/_person_documents_panel.html` + `static/js/person_docs.js` (GLOBAL en layout,
  no-op sin `[data-person-docs]`) + estilos `.docs-*`. ⚠️ **Puede haber VARIOS paneles en la misma
  página** (una persona del artista por tarjeta): `person_docs.js` inicializa **cada** `[data-person-docs]`
  con su url de guardado y sus documentos, y el **modal es UNO** (`templates/_person_doc_modal.html`,
  que el panel incluye salvo que se le pase `person_docs_modal=False`) atado una sola vez y trabajando
  sobre el panel ACTIVO (el que lo abrió). Antes usaba `querySelector` y solo funcionaba el primero.
  DNI/carnet = tarjeta de **dos caras**;
  **pasaporte = una sola cara** (fa-passport) + fecha de **emisión**.
  **Subida foto O PDF + recorte + OCR, todo en cliente** (el servidor no renderiza PDF): al elegir
  archivo, `processIdFile` renderiza (pdf.js `pdfToCanvases`/imágenes), **auto-recorta el fondo**
  (`trimUniform`, conservador) — *ese recorte es lo que se guarda y se ve* — y si es un DNI/carnet en
  **un solo lado con las dos caras** (o PDF de 2 páginas) las **separa** (`splitTwoFaces` por
  proporción; asigna anverso/reverso según cuál lleva MRZ, `hasMrz`). Los recortes se suben como JPEG
  (via `input.files` **y** `pendingFiles`→`FormData.set`, robusto en iOS). **OCR** con **tesseract.js**
  (CDN bajo demanda): MRZ **TD1** (DNI/carnet, `parseMrz`) o **TD3** (pasaporte, `parseMrzTd3`) → nº
  (DNI validado mod-23 `findDni`; pasaporte del MRZ), nombre, nacimiento, caducidad; la **emisión del
  pasaporte NO está en el MRZ** → best-effort del texto impreso o estimada (`findIssueDate`, ~10 años
  antes de la caducidad).
  **El DOCUMENTO manda en los DATOS OFICIALES de la ficha** (`_person_doc_apply_to_profile`, campos en
  `PERSON_DOC_OFFICIAL_LABELS` → `_person_doc_official_target`: nombre, apellidos, DNI/NIF
  (`UserProfile.dni` / `Promoter.tax_id`), nacimiento (solo personal) y domicilio; el nº solo vale como
  DNI/NIF si el documento es un DNI): lo que está **vacío** se rellena solo; lo que **no coincide** se
  devuelve como `conflicts` y el modal `#personDocConflictModal` pregunta cuál se queda (por defecto el
  del documento) → segunda llamada con `resolve_only=1` + `apply_choices` y recarga de la ficha.
  Comparación tolerante (`_person_doc_same_value`: mayúsculas, acentos y puntos del DNI dan igual, así
  no molesta con avisos falsos). ⚠️ **El NICK nunca se toca**: es como llamamos a la persona (o a la
  empresa), no un dato oficial. Los endpoints `*_document_save` devuelven `{document, applied, conflicts}`.
  A quien YA tenía DNI/pasaporte subido se le volcaron los datos oficiales del documento una sola vez en
  el arranque (`_person_docs_backfill_official_data`, marca `AppSetting` `person_docs_official_backfill_v1`;
  manda el DNI sobre el pasaporte y el más reciente de cada tipo).
  Fidelización = **pastilla** (`.docs-pill`, contenedor `.docs-pills` en fila) de color de marca
  (`PERSON_LOYALTY_BRANDS`, casada por nombre, con `icon` del **tipo**: avión/tren/hotel/gasolina/
  compras — blanco en círculo translúcido) + nombre + nº; **al pinchar copia el número** (funciona
  también en solo lectura). Marca desconocida → color neutro e icono adivinado por palabras clave
  (`_person_loyalty_icon_guess`). **Matrícula = pastilla** (`.docs-plate-pill` en `.docs-pills`, estética
  de placa española) del tamaño de las de fidelización, en fila; al pinchar copia la matrícula.
  **Domicilio**: `UserProfile.address`/`Promoter.address`/`PersonDocument.address`. Al subir un **DNI**
  el OCR lee el domicilio del reverso (`findAddress`, best-effort) y `_person_doc_apply_to_profile` lo
  vuelca al **domicilio** de la ficha si está vacío (editable). Campo «Domicilio» en el modal (solo DNI),
  en las fichas y en las altas.
  **Resumen en la ficha principal**: en la pestaña principal (personal → «Datos»; tercero →
  «Información general») se muestra una **vista compacta** (solo campos rellenos) con los **datos a la
  izquierda y el DNI a la derecha** (+ pastillas/vehículos debajo), reutilizando `person_docs.js` en
  solo lectura (`data-can-edit=""`, subconjunto de `[data-docs-grid]`). Con **`data-docs-compact`** la
  tarjeta de identidad muestra solo la MINIATURA + los datos que NO están ya en la ficha (p. ej. la
  caducidad del DNI), para no duplicar. **Distribución**: a la izquierda datos + fidelización +
  vehículos; a la derecha los documentos con foto (DNI/pasaporte/carnet). **Las caras son `<img>`**:
  pinchar AMPLÍA (lightbox `.docs-lightbox`), arrastrar DESCARGA con nombre «`<TIPO> <persona>`»
  (`data-doc-dl` + truco `DownloadURL`; persona vía `data-owner-name`/`person_docs_owner_name`). El
  **pasaporte se ve COMPLETO** (una cara, `is-full` = `object-fit:contain`, proporción natural) y su
  fecha es la de **expedición**. El nº de las tarjetas de fidelización se muestra **tal cual** (sin
  agrupar). No hay botón «Ver y gestionar documentos» (eso se hace en la pestaña «Documentos»). En «Datos» de personal el
  formulario de edición queda oculto tras un botón *Editar* (toggle `ficha_inline.js`:
  `data-edit-toggle="#personDatosForm"` + `data-view`). Endpoints por ficha para heredar permisos:
  `personnel_document_save`/`_delete` (mapeados a `personal.usuarios.accesos` en
  `_resolve_request_resource_key` **y** `_coarse_endpoint_resource`) y `promoter_document_save`/`_delete`
  (auto → `third_parties` por prefijo `promoter_`); ambos delegan en `_person_document_save`/`_delete_one`.
  Imágenes a Storage `documents/` (HEIC→JPEG). El save devuelve JSON y el JS re-renderiza sin recargar.
  **Motor de escaneo `static/js/doc_scan.js` (GLOBAL, `window.DocScan`)**: todo el pipeline (pdf.js,
  `contentRect`/recorte, `splitFaces`, OCR TD1/TD3, `extractFields`, `scan()`) vive aquí; `person_docs.js`
  delega en él. **Recorte MANUAL**: `DocScan.openCropTool(source, rect, onApply)` (recuadro arrastrable/
  redimensionable, clases `.dscrop-*`) — botón «Ajustar recorte» por cara (`[data-doc-crop]` en el modal,
  `[data-intake-crop]` en el alta) para cuando el auto-recorte no acierta (foto o PDF).
  **Alta desde documento** (`static/js/doc_intake.js` GLOBAL sobre `[data-doc-intake]` + parciales
  `_doc_intake_scan.html`/`_doc_intake_hidden.html`): en «Nuevo tercero» (`promoters.html`) y «Nuevo
  usuario» (`personnel.html`) sale primero un **selector con iconos** (Subir DNI/pasaporte · Introducir
  datos). Subir → `DocScan.scan` rellena los campos oficiales (nombre, DNI→dni/tax_id, nacimiento) y
  guarda los recortes en ocultos **base64** `doc_front_b64`/`doc_back_b64` + `doc_*`. Al enviar, el
  backend crea la entidad y adjunta el `PersonDocument` (`_person_document_create_from_intake` +
  `_store_doc_image_from_dataurl`). El **nick vacío ⇒ nombre oficial** (en `promoters_view`/
  `personnel_view`). Carga en `layout.html`: `doc_scan.js` ANTES de `person_docs.js` y `doc_intake.js`.

- **GASTOS DIRECTOS: de OFICINA o INVERSIÓN de artista** (ago 2026). Son gastos de «Mis gastos» que
  **NO van contra ninguna bolsa**. ⚠️ No confundir con `BagExpense.covered_by='OFICINA'`, que es otra
  cosa: un gasto que SÍ está en una liquidación pero lo paga la oficina.
  · **Cómo se mandan**: en `/mis-gastos/asignar`, la columna de destinos se abre con una tarjeta
  **partida en dos** (`.direct-split`): «Gasto de oficina» e «Inversión de artista». Se arrastra el
  gasto igual que a una bolsa; en inversión se pregunta el artista (modal con los **asignados**
  primero y «ver más» para el resto, buscador incluido).
  · **Requisito**: como no va a ninguna bolsa, hace falta **factura/ticket** o que administración
  haya aceptado que va **sin factura** (`_personal_expense_has_justification`). Si no, se avisa y no
  se manda (lo comprueba el JS **y** el backend). Desde los **tres puntitos** de cada gasto en
  «Mis gastos» se sube la factura/ticket (`my_expense_upload_invoice`) o se pide pasar sin factura
  (`my_expense_no_invoice`). El **icono** del gasto dice en qué estado está
  (`_personal_expense_justification_state`).
  · **Estados** (`PersonalExpense.status`): `VALIDATING` (mandado, sigue viéndose en Mis gastos con
  su etiqueta «a la espera») → `DIRECT` (aceptado) o vuelta a `PENDING` con `validation_status =
  RECHAZADO` y el motivo a la vista («no se aceptó: …»). Al aceptarlo, si no estaba pagado
  (`_personal_expense_is_prepaid`: lo de **Pleo y Cabify ya está pagado** con la tarjeta) queda
  **pendiente de pago**.
  · **Dónde se valida**: Administración → Pendiente → **«De oficina»** (subpestaña nueva, con su
  contador y su responsabilidad `GASTOS_OFICINA`): por validar · piden pasar sin factura · validados
  pendientes de pago. Endpoints `administration_direct_expense_decision` /
  `administration_personal_no_invoice_decision` / `administration_direct_expense_mark_paid`
  (mapeados a mano a `administracion.pendiente`: no llevan prefijo reconocible).
  · **Balance del artista**: `_artist_investment_rows` pinta en la pestaña **Contratos** del artista
  lo que se ha invertido en él (solo se calcula en esa pestaña).
  ⚠️ Los endpoints `my_expense_*` están en **`PERSONAL_ENDPOINTS`** (datos propios: la comprobación
  de propiedad la hace `_my_expense_or_403` dentro).
- **Administración · contadores y REPARTO de tareas** (ago 2026):
  · **Contadores**: `_admin_pending_counts(session_db)` es el motor único de los números de las
  pestañas y subpestañas (solo `func.count`, sin cargar filas), así que van al día se mire desde
  donde se mire. `administracion_view` carga **las listas solo de la pestaña activa** (antes cargaba
  las 8 siempre + un N+1 por bolsa). Las bolsas de «De liquidación» / «De cierre» usan
  `ADMIN_BAG_LIQUIDACION_STATUSES` / `ADMIN_BAG_CIERRE_STATUSES`, compartidas con la plantilla, para
  que el número y las filas no discrepen. Nuevo `counts['altas']` (`_admin_altas_pending_count`:
  empresas con el ITA caducado o sin subir). Las subpestañas de EMBARGOS («Activas»/«Archivadas»)
  **no llevan contador** a propósito (no son pendientes) y `embargo_counts` ya no existe.
  · **Reparto por persona**: `UserProfile.admin_responsibilities` (JSONB) con las claves de
  `ADMIN_RESPONSIBILITIES` (liquidar bolsas · facturas pedidas · pagos · gastos de oficina · gastos
  sin ticket · ITAs · embargos). **Tres reglas**: sin reparto propio se ve TODO; una tarea sin
  responsable la ven TODOS (nada se pierde en silencio); y la responsabilidad **filtra, nunca
  concede** (sin el permiso de la sección sigue habiendo 403). Dirección lo ve todo.
  Helpers `_normalize_admin_responsibilities` · `_admin_responsible_user_ids` (exige seguir en el
  departamento Administración y excluye inactivos) · `_administration_people` ·
  `_admin_task_is_mine`. Se edita en la ficha de personal (**solo dirección**, panel condicionado al
  departamento) con **centinela `responsibilities_present`** —sin él, cualquier POST parcial al
  formulario monolítico borraría el reparto— y el panel **deshabilita** sus inputs al ocultarse
  (ocultar no basta: se enviaban igual; mismo bug que tenían los artistas asignados). Se ve en el
  módulo de Inicio `HOME_ADMIN_PENDING` (`_home_admin_pending`) y con un punto rojo
  (`.admin-mine-dot`) en las pestañas propias de `/administracion`.
  ⚠️ `_snapshot_user_profile` es un `SimpleNamespace`: **lo que no esté ahí es invisible** desde
  `_current_user_state()` y desde las plantillas (por eso se añadió también `admin_responsibilities`
  al estado y al alta de `_ensure_user_profile`, cuyo bucle de kwargs solo corre al ACTUALIZAR).
- **Subida de ÓRDENES DE EMBARGO con arrastre** (`templates/administracion.html`,
  `administration_embargo_upload`): se pueden arrastrar ficheros sueltos o **carpetas enteras**
  (mismo patrón que el modal de carteles: `webkitGetAsEntry` + `readEntries` paginado), se envían en
  **lotes de 8** por XHR para no cargar una carpeta grande en la memoria del worker, y cada PDF va
  en su **savepoint**: uno que falle no se lleva por delante a los demás. El nombre se valida y se
  guarda por su **basename** (de una carpeta llega la ruta completa). Responde **JSON** con el
  desglose (`created`/`pending_review`/`archived`/`errores`) cuando la petición es XHR y mantiene
  `flash`+redirect para el formulario clásico. ⚠️ La zona lleva `data-file-drop="off"` (si no,
  `static/js/file_drop.js` intercepta el drop y descarta las carpetas) y la cabecera CSRF va **a
  mano** (`csrf.js` parchea `fetch`, no `XMLHttpRequest`).
- **EVENTOS: sujeto vs. tipo de actividad** (aclaración ago 2026). La palabra «evento» significaba
  dos cosas y se confundían:
  · **Actividad de tipo evento** a la que va un ARTISTA (unos premios): es
  `Concert.activity_type='EVENTO_PROMOCIONAL'` y vive en **«Otras actividades»**. No cambia nada.
  · **EVENTO como SUJETO** (una sesión DJ, una fiesta, «la ruta del Aguilar»): es un `AppEvent` y
  **funciona como un artista** — puede tener actividades sueltas, una **gira propia**, un ciclo o un
  festival. Sale **solo** en la pestaña «Eventos» de Contratación (`_contracting_activity_tabs`
  devuelve `["eventos"]` para todo lo que tenga `Concert.event_id`: es a propósito).
  **Contenedores de un evento**: `CycleFestival` con `event_id`, `kind` ∈ **GIRA** (nuevo: su gira
  propia, ≠ «gira comprada», que es `PurchasedTour` y se le compra a un promotor) · CICLO ·
  FESTIVAL · EVENTO (el tipo antiguo, se conserva por los ya creados). `CYCLE_FESTIVAL_EVENT_KINDS`
  y el propio `event_id` deciden si un contenedor es «de evento»: `_render_cycle_festivals`
  reparte por ahí, no por el kind. `_apply_cycle_form` guarda `event_id` **para cualquier kind**.
  **Ficha del evento** (`event_detail_view` + `templates/evento_detail.html`): como la del artista
  pero con los datos del EVENTO — pestañas Datos (con `AppEvent.description`) · Actividades y giras
  · Vinculaciones (nuevo tipo `event` en `APP33_ENTITY_LINK_TYPES` + `api_entity_link_search`) ·
  Fotos (`PHOTO_OWNER_TYPES` ya admitía EVENT) · Resultado (agregado de sus fechas con
  `_group_concert_econ`, **solo se calcula en su pestaña** porque el motor es caro) · Simulaciones ·
  Plantillas de gastos. ⚠️ El **artista ESPEJO** (`Artist.event_id`, `_ensure_artist_for_event`)
  existe solo porque `Concert.artist_id` es NOT NULL: es un detalle de implementación y **no debe
  verse nunca** — ni su nombre, ni su foto, ni su ficha.
- ⚠️⚠️ **TIPO DE ACTIVIDAD ≠ TIPO DE VENTA** (depuración ago 2026). El `sale_type` (vendido, a
  empresa, gratuito, participado, gira comprada, Cádiz) describe **CONCIERTOS**. Un **evento
  promocional** —o un programa de TV, o una acción con marca— **no es un concierto de ningún tipo**:
  ahí el `sale_type` es solo el apunte interno de si lleva caché (lo pone el asistente: «¿Tiene
  caché?» Sí=VENDIDO / No=GRATUITO), y enseñarlo como etiqueta hacía que por toda la app un evento
  promocional apareciera como **«Conciertos — Gratuitos»** (bug real). Punto único:
  **`_sale_type_label(sale_type, activity_type)`** (con el tipo de actividad manda ÉL: devuelve
  «Evento promocional», «Programa de TV»…) + **`_activity_cache_label`** («Con caché» / «Sin caché»,
  vacío en conciertos) + `_activity_kind_key` / `_activity_kind_label` (normalizan por
  `QUAD_ACTIVITY_ALIASES`) y el conjunto `CONCERT_LIKE_ACTIVITY_TYPES` = {CONCIERTO, FESTIVAL}.
  Corregidos TODOS los sitios que rotulaban por tipo de venta (`/actividades`, la vista de
  conciertos, las fechas de gira/ciclo con `_group_concert_row`, cuadrantes —la columna «Tipo de
  venta» enseña el caché cuando no es un concierto—, eventos y la ficha, cuya cabecera y campo
  «Tipo» empiezan por lo que ES la actividad). En el **formulario** de la ficha, una actividad que no
  es un concierto ya no ofrece tipos de concierto: pregunta **«¿Tiene caché?»** (mismo campo
  `sale_type`, valores VENDIDO/GRATUITO, que es lo que el resto de la app espera).

- ⚠️⚠️ **UNA ACTUACIÓN EN UN FESTIVAL ES UN CONCIERTO** (bug real, ago 2026). No es lo mismo:
  · `Concert.activity_type = 'FESTIVAL'` = **el concierto de nuestro artista DENTRO del festival de
  otro** → va en el listado de **Conciertos**, con la etiqueta «Festival» al lado del tipo de venta.
  · un **`CycleFestival`** (kind FESTIVAL/CICLO) = **un festival o ciclo que organizamos NOSOTROS**,
  que vive en su pestaña y cuyas fechas se enganchan por **`cycle_festival_id`**.
  Antes el listado de conciertos EXCLUÍA `activity_type='FESTIVAL'` y `_contracting_activity_tabs`
  mandaba esas actividades a «Festivales y ciclos» solo por el tipo, así que **una actuación en un
  festival ajeno no salía en ningún listado de contratación**. Ahora la exclusión del listado (y la
  del recuento de la rejilla de artistas) ya no lleva FESTIVAL, y a «Festivales y ciclos» se va
  **solo con `cycle_festival_id`** (una fecha de un contenedor nuestro sale en las DOS pestañas, que
  es correcto: es una fecha del ciclo y es un concierto).
  ⚠️ La rama de `festivales-ciclos` que filtraba por `activity_type == 'FESTIVAL'` dentro de
  `contracting_view` es **código muerto** (antes de llegar ahí ya hace `return _render_cycle_festivals()`).

- **FACTURAS DE UN PAGO · tres puntitos con editar y eliminar** (ago 2026): las facturas que se suben
  en el plan de facturación/cobro (`Concert.payment_terms_json[i]`: `invoice_url`, `invoice_name`,
  `invoiced_at`) llevan al final un menú **⋯** con **Ver la factura** · **Editar (subir otra)** —
  reutiliza `concert_payment_upload_invoice`, que sobreescribe— y **Eliminar la factura**
  (`concert_payment_delete_invoice`). Está en los DOS sitios donde se ven: la pestaña **Facturación**
  de Contratación (`concerts.html`) y el plan de facturación **dentro de la actividad**
  (`concert_detail.html`); el menú solo se pinta si hay factura (`row.has_invoice`).
  ⚠️ Al eliminarla, un pago que estuviera **marcado como cobrado vuelve a pendiente**: la regla de la
  casa es que no se puede dar por cobrado un pago sin factura, así que dejarlo cobrado y sin factura
  sería dejarlo diciendo algo que no es. El archivo de Storage no se borra: se suelta el vínculo.

- **Otras actividades · filtros por tipo y listado por sujeto** (ago 2026, `contracting_view` +
  `templates/contratacion.html`): arriba, **etiquetas de TIPO con su icono** (`type_chips` sobre
  `OTHER_ACTIVITY_TYPE_KEYS` = evento promocional · TV · marca · otros, con contador y acumulables
  por `?tipo=`); debajo, la rejilla de **SUJETOS** —artistas **y eventos**— con su nº de actividades
  (los de evento se agrupan por el `AppEvent`, nunca por su artista espejo, y llevan la pastilla
  «Evento»); y al entrar, el listado **sin nombre ni foto de artista** (`.oa-row`): icono del tipo ·
  nombre de la actividad (el festival si lo tiene, y si no el tipo) · municipio · provincia, y
  **debajo** la fecha y el recinto, con «Con/Sin caché» y el estado a la derecha.
- ⚠️ **Contenedor de EVENTO que se degradaba a CICLO** (bug real, corregido): el modal de editar de
  `activity_group_detail.html` solo ofrecía FESTIVAL/CICLO y marcaba CICLO por defecto, así que
  guardar un contenedor de evento lo convertía en ciclo y —como `event_id` solo se conserva en la
  rama EVENTO— le borraba el vínculo con el `AppEvent`. Ahora `_apply_cycle_form` **conserva el kind
  actual** si el formulario no lo trae, la plantilla no ofrece el selector cuando `is_event`, y
  `ensure_activities_grouping_schema` **repara** con un UPDATE las filas ya degradadas
  (`event_id IS NOT NULL AND kind <> 'EVENTO'`, que por construcción solo pueden ser eso).
- **PLANTILLAS DE ARTISTA** (`ArtistTemplate`, kind PERSONNEL|ROOMING|ROADMAP): se crean en la ficha
  del artista (pestaña «Plantillas», `_templates_hub.html`) y se cargan en la hoja de ruta de cualquier
  actividad. ⚠️ **El editor de una plantilla ES la hoja de ruta**: la columna se llama
  `roadmap_payload` y `ROADMAP_ENTITY_TYPES` incluye **`template`**, así que TODOS los endpoints
  `/hoja-ruta/template/<id>/...` (personal, hoteles/habitaciones, agenda, adjuntos, días) funcionan sin
  duplicar código y **cualquier función nueva de la hoja de ruta aparece también en las plantillas**.
  `ARTIST_TEMPLATE_KINDS` dice qué pestañas enseña cada tipo (`rm.tabs` → `_roadmap_panel.html`) y qué
  se copia. Los días de una plantilla no tienen fecha: se anclan en `TEMPLATE_DAY_ANCHOR` y se pintan
  «Día 1, Día 2…»; al cargarla, `_template_agenda_for_days` mapea Día N → N-ésimo día de la actividad
  (si sobran días, se quedan en el último). Cargar: botón **Plantillas** en las barras de Agenda,
  Hoteles y Personal (`roadmap.js`, `tplBtn`/`openTemplates`/`loadTemplate`) → `roadmap_template_load`;
  también se puede **guardar lo que hay ahora como plantilla** (`roadmap_template_save_from`).
  Personal: no duplica a nadie (`_artist_template_person_key`). **Rooming**: si la plantilla trae gente
  que no está en el personal de la actividad, el endpoint devuelve `needs_decision` con la lista y el
  modal pregunta (**añadirlas al personal** `mode=add_missing` / **dejarlas fuera** `skip_missing`);
  quien esté en el personal y no en la plantilla se queda **sin habitación**. Las plantillas de
  **gastos** y de **repertorio** se crean/editan desde el mismo hub (`expense_template_create` /
  `_update_items` y el modal de repertorio que ya existía).
- **Hoja de ruta: GENERAL y TÉCNICA** (`ROADMAP_KINDS`, `_roadmap_kinds`/`_set_roadmap_kinds`): cada
  actividad tiene las dos activas por defecto (etiquetas en el alta) y **un enlace público por hoja**
  (`roadmap_public_token` para la general, `roadmap_payload['tech_token']` para la técnica;
  `_ensure_roadmap_token`/`_roadmap_by_token`). **Quién ve cada cosa se decide punto por punto**: cada
  ítem de la agenda lleva `sheets` `{GENERAL,TECNICA}` (`_roadmap_item_sheets`, las DOS por defecto —
  también en los ítems antiguos sin el campo). El enlace de cada hoja solo muestra los ítems con su
  etiqueta: filtra **`_roadmap_payload_for_kind`** en `public_roadmap_view` (⚠️ **en el servidor**: el
  payload entero va al HTML dentro de `#roadmapData`, esconderlo en el navegador no serviría) y los días
  se recalculan con lo que queda. Desmarcar las dos deja el punto **solo para dentro** («No se
  comparte»). UI en `static/js/roadmap.js`: chips `.filter-chip` en el editor del ítem, etiqueta
  `.rm-tag.sheet` en la fila y en el detalle (solo en el back office). La pestaña Logística se nutre de
  los ítems de transporte, así que hereda el filtro; Hoteles y Personal salen en las dos hojas.
  `roadmap_item_save` conserva las etiquetas si el cliente no las manda (JS viejo en caché).
- **Categoría EVENTOS de Contratación** (`CycleFestival.kind='EVENTO'` + `event_id` → `AppEvent`):
  contenedor de un evento propio (gala, feria…) de **una fecha o varias**, que funciona igual que una
  gira comprada (agrupa sus `Concert` por `cycle_festival_id`). Sección `?section=eventos` →
  `_render_cycle_festivals(only_events=True)` (MISMA pantalla que Festivales/Ciclos, filtrada por kind;
  las dos se excluyen entre sí). Recurso de permisos `contratacion.eventos`; la ficha es
  `activity_group_detail.html` con `is_event`. Convertir una simulación de EVENTO: `target='event'`
  (el botón de la simulación lo elige solo cuando el sujeto es un evento).
- **Actividades de un EVENTO** (`AppEvent`): una actividad (`Concert`) exige artista (`artist_id` NOT
  NULL) y un evento no lo es, así que al convertir una simulación de EVENTO se espeja el evento como
  artista con `_ensure_artist_for_event` (`Artist.event_id`, único; hereda nombre y logo) y la
  actividad guarda además `Concert.event_id`. El espejo se excluye del listado `/artistas`. ⚠️ Sigue
  saliendo en OTROS selectores de artista que consultan `query(Artist)` sin filtrar (~60 sitios): es
  cosmético, se va filtrando donde moleste. Mismo patrón que `_ensure_promoter_for_media`.
- **PRL / Altas (riesgos laborales del personal de eventos)**: modelos `PersonComplianceDoc`
  (polimórfico: owner PROMOTER/USER/COMPANY; `doc_type` AUTONOMO_RECIBO/ALTA_SS/ITA/PRL_FORMACION/
  PRL_INFORMACION; `valid_from/valid_until` —NULL = sin caducidad—, status APPROVED/REJECTED,
  `linked_person_ids` para ITA) y `PrlUploadRequest` (token público por persona/evento);
  `Promoter.prl_type` AUTONOMO|PUNTUAL|EMPRESA. Bloque en `app.py` junto a la hoja de ruta
  (~`_prl_*`): **detección de fechas con pypdf** (`_prl_detect`, validado con documentos reales):
  recibo autónomos «PERIODO LIQUIDACION: MM/AAAA» → válido el mes SIGUIENTE; ITA «EN ALTA A FECHA:
  dd mm aaaa» → válido ese mes (+ extracción de trabajadores nombre+IPF y auto-vinculación por DNI
  normalizado `_prl_norm_dni` contra `Promoter.tax_id`/`UserProfile.dni`); alta SS «fecha de
  efectos» → debe coincidir con la fecha del evento (aviso si no). Estado por persona
  `_prl_person_status` (3 semáforos: alta según tipo / información / formación; EMPRESA acepta ITA
  propio o de empresa del grupo vinculado). UI: **subpestaña PRL** del Personal de la hoja de ruta
  (`roadmap.js`: `renderPrl`, iconos verde/rojo clicables —rojo=subir manual, verde=ver+rechazar
  con correo «ha sido rechazado, vuélvelo a subir»—, menú solicitar por correo/WhatsApp, «Solicitar
  a todos», exportar PDF/Excel `prl_export_pdf/xlsx`); **página pública** `/prl/<token>`
  (`public_prl_upload.html`: pregunta el tipo con iconos → huecos de documentos con drag&drop y
  detección; una persona MANUAL se convierte en tercero y se vincula sola); pestañas **«Alta y
  PRL»** en tercero y **«PRL»** en personal propio (partial `_prl_docs_panel.html`);
  **Administración → Altas** (`administracion.html` tab `altas` + `admin_ita_upload`: ITA mensual
  por empresa del grupo con vigencia y trabajadores detectados) y módulo en Inicio
  `HOME_ADMIN_ALTAS_PENDING` (ITA caducado/sin subir). Endpoints en `SUPPORT_ACTION/READ_ENDPOINTS`;
  públicos en las 3 listas (`allowed`, `PUBLIC_ENDPOINTS_EXTRA`, `_CSRF_EXEMPT_ENDPOINTS`).
  Los docs en vigor NO se vuelven a pedir entre eventos («solicitar a todos» solo escribe a quien
  le falte algo, contando también EPIs/renuncia/baja de quien los necesite). `pypdf` en requirements.
  **A quién se le pide cada cosa**: `PRL_EPIS_TYPES` y `PRL_MEDICAL_WAIVER_TYPES` = **por cuenta
  ajena** (alta `PUNTUAL` + `PRL_OWN_STAFF_TYPE` «OFICINA», el personal propio), `PRL_BAJA_TYPES` =
  solo `PUNTUAL`. El **alta puntual exige también la BAJA** (`BAJA_SS`, cierra el periodo; el alta de
  varios días ya cubre cualquier evento dentro del rango). El **personal de la oficina** (persona de
  la hoja de ruta con `kind='USER'`) sí tiene estado PRL: sus documentos cuelgan del usuario
  (`PersonComplianceDoc` owner_type USER) y su alta la cubre el ITA de la empresa del grupo por
  vínculo `USER:<id>` o por DNI. Los semáforos, la página pública y las exportaciones (PDF/Excel)
  solo piden/pintan lo que le toca a cada uno («—» o en gris si no aplica).

- **Bases de datos → Facturas · «Subidas por terceros»** (pestaña por defecto): TODAS las facturas
  que entran por la app (`SupplierInvoice`: enlace general, petición de una bolsa, factura de una
  liquidación de royalties o dirigida a una persona), **agrupadas por el tercero que las emite**
  (`_supplier_invoice_groups`), con su origen, su estado y el motivo del rechazo. Las pestañas
  «Recibidas»/«Emitidas» siguen siendo el registro manual (`InvoiceRecord`), que es otra tabla. El
  buscador casa **por palabras** contra el nombre/nick/CIF del tercero (eso no se puede filtrar en la
  consulta porque no está en la tabla de la factura).

- **Subir factura · paso 3 por TIPO DE ALTA y datos solo si no se detectan** (ago 2026):
  · A un **particular** se le pregunta primero **cómo factura** (`BILLING_WORKER_TYPES`: autónomo /
  alta puntual) y la respuesta se **graba en su ficha** (`Promoter.prl_type`, el mismo campo del PRL),
  así que en la siguiente factura ya no se le pregunta. De ahí salen sus papeles
  (`BILLING_ALTA_DOCS`): autónomo → **último recibo de autónomos**; alta puntual → **alta y baja**.
  · La **vigencia del alta puntual se mide contra la FECHA DE EMISIÓN de la factura** (alta y baja
  **incluidas**): `_billing_alta_doc_ok` reutiliza `_prl_doc_valid_on`, y los documentos se guardan con
  `_prl_store_upload`, que ya lee sus fechas del propio PDF. `_billing_docs_state(…, worker_type,
  issue_date)` y `public_invoice_docs_state` aceptan las dos cosas.
  · **Nº de factura, fecha de emisión, artista y concepto se piden DESPUÉS de subir la factura y solo
  los que no se han podido leer** (`#invMetaBox` nace oculto y cada campo lleva `data-meta-field`).
  `_detect_invoice_meta` saca además el **concepto** (línea tras «concepto/descripción/detalle») y
  `public_invoice_detect` el **artista**, casando el texto contra los nombres de artistas que tenemos
  (lo único fiable; el texto del PDF NO se devuelve al navegador).
  · Los datos que se rellenan al identificarse ya se guardaban en el tercero
  (`public_invoice_register`: nombre, CIF/DNI, dirección fiscal, email, teléfono, cuenta, sociedad y
  contacto); queda verificado con prueba.
  · **IMPORTE, IVA y RETENCIÓN se LEEN de la propia factura** (`_detect_invoice_amounts`, dentro de
  `_detect_invoice_meta`): base imponible, cuota de IVA, retención/IRPF y total, con sus porcentajes
  (`_INV_MONEY_RES`/`_INV_PCT_RES`). Con dos de los tres se **despeja** el que falte y si el desglose
  no cuadra (`base + IVA − retención ≠ total`) se avisa en vez de callar. Se guardan en
  `SupplierInvoice.amount_net/amount_vat/vat_pct/retention_amount/retention_pct` (+ `amount_gross`)
  con **`_invoice_amount_fields_from_form`**, que usan los TRES caminos de subida (liquidación,
  petición de bolsa y enlace general). En el formulario los campos nacen ocultos y solo se piden los
  que no se han leído; el de retención solo sale si la factura la trae. Ese desglose es el que se
  enseña en el resumen del pago y en la pantalla de validar (que lo prefiere al recálculo cuando la
  factura trae total). ⚠️ Un 0 no es «no lo sé»: los campos vacíos se guardan como NULL.

- **SUBIR UNA FACTURA = UN SOLO MÓDULO** (ago 2026). Da igual desde dónde se haga: el enlace del
  proveedor, la petición de un gasto, la liquidación de royalties y la subida **DESDE DENTRO** pasan
  todas por `templates/public_invoice_landing.html` + `public_invoice_detect` +
  **`public_invoice_upload`** (el ÚNICO sitio por el que entra una factura). Así, lo que se mejore ahí
  vale para todos.
  · **Desde dentro** (los tres puntitos de una liquidación en Discográfica → Royalties y en
  Administración → Liquidaciones → «Enviadas pendientes de factura») se abre **la misma pantalla** con
  `interno=1` (`_royalty_internal_invoice_url`): sale un aviso de que la estás subiendo tú, se
  **presta el proveedor** que emite la factura (`_royalty_beneficiary_promoter`, así no hay que
  teclear su DNI) y se puede **forzar** un importe que no cuadre (`_invoice_upload_can_force`: exige
  sesión y `force`; al proveedor se le sigue avisando y NO se le acepta).
  ⚠️ La pantalla interna que había aparte (`royalty_liquidation_invoice_upload` + su modal en
  `discografica_royalties.html`) se **retiró**: eran dos sitios que mantener y se desincronizaban.
  · **Los PASOS** (rediseño ago 2026): 1 haz la factura · 2 ¿para quién es? (solo en la landing
  general) · 3 identifícate · **4 sube la factura** · **5 documentación y enviar**.
  ⚠️ En el paso 4 la factura **NO se envía todavía**: se lee (`public_invoice_detect`), se pinta
  **desde el propio archivo** (`URL.createObjectURL`) y se repasa en **pantalla partida** con los
  **CAMPOS A LA IZQUIERDA** (grandes, en dos columnas) y **LA FACTURA A LA DERECHA** (`.inv-split`);
  los que no se hayan podido leer salen en amarillo y el botón **«Continuar»** no se activa hasta que
  están. En el paso 5 se piden los documentos que le tocan a quien emite (los que ya están **en vigor**
  salen marcados) y el botón **«Enviar factura»** —que solo se activa cuando no falta ninguno— es el
  que manda la factura de verdad; al terminar sale **«Su factura ha sido subida»**.
  · Así la fecha de emisión se conoce ANTES de pedir los papeles, que es contra la que se mide si el
  alta del proveedor estaba en vigor.

- **LEER LOS DATOS DE UNA FACTURA · motor `invoice_read.py`** (ago 2026). Manda él en
  `_detect_invoice_meta`; las expresiones de `app.py` quedan solo como **respaldo de lo que no
  saque** (⚠️ no pisan lo leído: si lo pisaran, la fecha de emisión volvería a ser «la primera fecha
  del documento», que suele ser la de **vencimiento**).
  · ⚠️ **Muchas facturas son TABLAS** y el texto plano saca los rótulos y los valores en bloques
  separados y desordenados (en una real, «Número de factura» aparecía justo antes de la fecha de
  vencimiento y el valor «1003» quince líneas más abajo). Por eso se reconstruyen los **renglones
  visuales** con las coordenadas de cada trozo (`pdf_rows`, matriz de texto × matriz de
  transformación: con `tm` a secas el texto de dentro de un formulario sale donde no es) y se
  empareja **rótulo → valor** por columnas: pegado al rótulo · a su derecha · k rótulos y k valores en
  el mismo renglón · renglón de rótulos y el siguiente de valores.
  · ⚠️ **El bug de los importes de cuatro cifras**: la expresión empezaba por
  `\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?`, así que «1140,97» casaba **«114»**. En `AMOUNT` van primero
  los formatos completos y el entero suelto al final.
  · Los rótulos se buscan **sin acentos, con puntuación por medio y con las letras separadas**
  (`_label_pattern`): así casan «Número de factura», «N.º de factura», «I.V.A» y «TOT AL» sin
  enumerarlos. Y `(?<![A-Za-z])` en vez de `\b`, porque en los PDF los datos vienen PEGADOS
  («Fecha: 28/7/2026N.º de factura: 8») — por lo mismo, las fechas terminan en `(?!\d)`.
  · `NOT_LABELS` descarta lo que se parece pero no es: «número de **cliente**», «**vencimiento**»,
  «número de registro de IVA», «PAGADA». Y en `amount_gross` **«Total a pagar» gana a «Total»** (con
  retención, «Total» es base + IVA y lo que se paga es el otro): los rótulos se prueban EN ORDEN sobre
  todo el documento, no renglón a renglón.
  · Con el TOTAL y el **% de IVA** se despejan la base y el IVA (facturas donde el rótulo de la base
  no hay forma de leerlo).
  · **Prueba de regresión: `python3 tools/check_invoice_read.py`** — tres facturas reales de
  proveedores distintos (tabla · con retención y «total a pagar» · datos pegados y «TOT AL»). Si se
  toca el motor, tiene que seguir en verde.

- **BASE DE FACTURAS · una línea por factura, con su desglose** (ago 2026). La pestaña «Subidas por
  terceros» enseñaba fechas, números e importes en blanco y la misma factura varias veces.
  · **Una fila = una factura FÍSICA** (`_supplier_invoice_same_doc_key`: el mismo archivo —sin el «?»
  ni la firma de la URL— o el mismo número+importe). Las copias no se pintan: la fila lleva `×N` y se
  completa con lo que tenga cada copia.
  · **Facturas FANTASMA** (`_supplier_invoice_is_ghost`): registros sin archivo, sin ningún dato y sin
  colgar de nada. **No se listan**; la pantalla dice cuántos hay y **dirección** puede borrarlos
  (`supplier_invoices_clean`, que vuelve a comprobar que lo son antes de tirarlos).
  · **Importes que faltan**: si la factura no trae el suyo se **reconstruye de donde está imputada**
  (`_supplier_invoice_amount_info`: lo imputado a los gastos de la bolsa → el gasto de «Mis gastos» →
  el congelado de la liquidación + IVA) y se dice **de dónde sale**, que no es lo mismo que leerlo de
  la factura. Se cargan de golpe (nada de una consulta por fila).
  · **Se marca si lleva IVA y si lleva retención** (`vat_state`/`retention_state`: YES / NO / UNKNOWN):
  «Sin IVA» solo cuando base y total coinciden, y «Sin desglosar» cuando no se sabe — no se afirma lo
  que no consta. Columnas Base · IVA · Retención · Total, la fecha de emisión (o «Subida el …» si no
  se leyó) y la etiqueta de estado. **No hay total por tercero**: sumar facturas de terceros no dice
  nada.
  · **«Leer los datos que faltan»** (`supplier_invoices_read_meta`): baja el PDF y le pasa el lector a
  las facturas anteriores al detector, rellenando **solo lo que está vacío**. Hay botón por fila (con
  lo que le falta en el título) y uno para todas. El filtro por **año** acepta también la fecha de
  subida cuando la factura no trae emisión, para que no desaparezca del año que le toca.

- **Liquidación de royalties · CANDADO de importes bloqueados**: en Royalties, delante de la etiqueta
  de estado (`render_actions` de `discografica_royalties.html`, clase `.roy-lock`), cuando la
  liquidación está generada (`b.is_generated` = tiene congelado). El tooltip dice desde cuándo y que
  para cambiarlos hay que generar una nueva.

- **CONTROL DE LO QUE ENTRA: la factura tiene que cuadrar y solo se sube una vez** (ago 2026). Antes
  llegaban facturas con importes que no eran, repetidas y con los datos sin leer.
  · **El importe se comprueba ANTES de dejar enviarla** (`_invoice_amount_check`, en los dos caminos
  de `public_invoice_upload`: liquidación de royalties y petición de un gasto). Cuadra si es lo
  mismo, si lo es **sumándole la retención** o si se facturó **sin IVA** (la base). Si no, se
  responde 400 con lo que falta o sobra. Lo esperado sale del congelado de la liquidación
  (`_royalty_invoice_totals`) o de la suma de los conceptos marcados (`_invoice_request_amounts`).
  · **Repaso en PANTALLA PARTIDA antes de enviar** (`public_invoice_landing.html`, clases
  `.inv-split*`): al elegir el archivo se pinta **la factura a la izquierda** (desde el propio
  fichero, con `URL.createObjectURL`) y **sus datos a la derecha**. Lo leído sale relleno y editable;
  lo que falta, **resaltado en amarillo** (`.inv-need` / `input.is-need`) con el texto «lo sentimos,
  no hemos podido leer los datos automáticamente…». **El botón de enviar está deshabilitado** hasta
  que los obligatorios (número, fecha, concepto, base y total) estén puestos: `invMarkMissing` /
  `invMissingLabels`.
  · **Ya hay factura subida** (`_invoice_existing_block`): el enlace **no deja empezar** (los pasos
  salen bloqueados, `.inv-blocked`) y dice que ya hay una. Si está **pendiente**, botón «¿Quieres
  reemplazar la factura?» que abre el proceso y manda `replace=1` (la anterior queda RECHAZADA con
  «Reemplazada por…», `_supplier_invoice_mark_replaced`, y se le quita la imputación para no contar
  el importe dos veces). Si está **VALIDADA**, no se toca: `INVOICE_ALREADY_VALIDATED_MSG` manda a
  `ADMIN_INVOICE_CONTACT_EMAIL` (administracion@33producciones.es). El servidor lo vuelve a
  comprobar (409): el bloqueo no vive solo en el navegador.
  · **Base de facturas · tres puntitos** (con `can_edit_invoices()` = edición de
  `databases.invoices`): **editar los datos** en pantalla partida (`supplier_invoice_edit` +
  `templates/supplier_invoice_edit.html`: la factura a la izquierda, todos los campos a la derecha,
  los que faltan en amarillo, y lo que se pidió facturar a la vista vía
  `_supplier_invoice_expected`), **corregir importes**, **leer del PDF**, **reemplazar el documento**
  (`supplier_invoice_replace`: vale **aunque esté validada**, relee los datos nuevos del documento y
  la deja PENDIENTE), **modificar el gasto** (`bag_expense_amount_save`: administración cambia a mano
  el importe que se pidió facturar; si la factura deja de cuadrar se avisa y se lleva a su ficha),
  **rechazar** (`supplier_invoice_reject`: avisa por correo a quien la subió con el motivo y **el
  enlace para subirla otra vez**, `_supplier_invoice_reject_notify`) y **eliminar**
  (`supplier_invoice_delete`: suelta la imputación y devuelve la liquidación a «enviada»).

- **Administración · pagos** (ago 2026): **solo «Pendiente» y «Altas» llevan contador** (las demás son
  registros y un número ahí no dice nada). La pestaña **Pagos** es el **archivo de pagos realizados**
  (`_payments_history_rows`: gastos de bolsa pagados + liquidaciones de royalties pagadas + gastos
  directos) con **buscador por cualquier campo** (casa por palabras contra todo lo que se ve, porque
  son tablas distintas). ⚠️ **Un pago no termina hasta que hay JUSTIFICANTE**: los pagados sin él
  siguen contando en «De pago» y salen en su propio bloque «Pagados, falta el justificante»
  (`_paid_without_receipt_expenses`), que solo pide adjuntar el documento
  (`administration_expense_mark_paid` con `only_receipt=1`: no toca importes ni apunta otro pago).

- **RETENCIONES: se detectan y se pueden CORREGIR A MANO** (ago 2026). Cuando lo que hay que pagar no
  cuadra con la factura, casi siempre es una **retención**.
  · **Detección** (`_detect_invoice_amounts`): sinónimos ampliados (retención/retenciones/ret./IRPF/a
    cuenta); si la factura dice solo el **porcentaje**, el importe se calcula sobre la base; y si NO
    la nombra pero al total le falta justo un porcentaje de retención real
    (`_INV_RETENTION_RATES`: 15/7/19/2/1…), se toma como retención y se avisa (`retention_guessed`).
    ⚠️ La retención se busca **en su misma línea** y con `(?![\d.,]*[ \t]*%)`: con la tolerancia de
    los demás conceptos, un «Ret. IRPF 15 %» sin importe al lado se llevaba el número de la línea
    siguiente (el TOTAL), y al acortar la coincidencia, el «1» del propio 15 (bugs reales).
  · **Corrección a mano**: punto único **`supplier_invoice_amounts_save`**
    (`POST /facturas/subidas/<id>/importes`) + modal compartido `templates/_invoice_amounts_modal.html`
    (lo abre cualquier `[data-inv-amounts]` con los valores en `data-inv-*`). Con tres de los cuatro
    números calcula el que falta, el % rellena su importe (y al revés) y, si se le pasa
    `data-inv-expected`, ofrece **«la diferencia es una retención»**. Está en la pantalla de validar
    la factura de una liquidación (también dentro del aviso de descuadre), en el pop-up de la factura
    de **pendiente de pago** y en cada línea de la **base de facturas**.
  · ⚠️ **LO QUE SE PAGA es el total de la FACTURA** (ya lleva la retención descontada): restarla otra
    vez pagaba de menos, y pagar base+IVA cuando la factura trae retención pagaba de más. Si el total
    de la factura no cuadra con lo que se pidió facturar —ni sumándole la retención, ni por facturar
    sin IVA— la línea de pendiente de pago lo dice (`mismatch`) y ofrece corregirlo. Si la factura no
    trae desglose, el que se enseña es el que se pidió facturar (si no, la fila del IVA desaparecía).

- **FUSIÓN de Actividades y Acciones** (ago 2026): una sola sección **Actividades** y **un solo
  botón «+ Actividad»** (el asistente se incluye en `/actividades` y pregunta el tipo). «Acciones»
  sale del menú; su recurso `acciones` se **conserva** («Acciones (histórico)») porque las
  `CompanyAction` que ya existían siguen teniendo su ficha —y quitarlo se llevaría por delante sus
  permisos, que `_sync_access_resources` poda en cascada—.
  · **Tipos nuevos** en `QUAD_ACTIVITY_CHOICES`: **ENSAYO** y las **DISCOGRÁFICAS**
  (`DISCOGRAFICA_ACTIVITY_TYPES`: DISC_PREMIOS · DISC_FIRMA · DISC_AUDIO · DISC_VIDEO · DISC_FOTOS ·
  DISC_COMPOSICION · DISC_REUNION), que en el paso 1 del asistente viven dentro de la tarjeta
  «Discográficas».
  · **Rama corta** (`SIMPLE_ACTIVITY_TYPES` = ensayos + discográficas; en el JS `SIMPLE_TYPES`):
  `stepSequence()` devuelve `[12, 1, 3, 4, 6, 13]` — artista(s) · tipo · días y sitio · qué tiene que
  hacer el artista (y **¿canta?** solo en `SINGING_ACTIVITY_TYPES`: premios y firmas) · caché · y el
  paso **13 de LOGÍSTICA**, que si hace falta activa la producción con la persona elegida (le llega el
  aviso y la actividad le sale en sus Activas). Nada de promotor, entradas, cartelería ni anuncio.
  · **Varios días**: `Concert.end_date` (la actividad es UNA, del primer día al último).
  · ⚠️ El tipo de venta de estas actividades es SOLO el apunte de si llevan caché: el asistente lo
  fuerza a VENDIDO/GRATUITO y `_sale_type_label` ya enseña lo que ES la actividad.
  · ⚠️ En `concert_wizard_create` (y en los otros dos sitios donde se crea un `Concert`) la variable
  `session` es la **sesión de la BD**, no la de Flask: el usuario se lee de `_current_user_state()`
  (usar `session.get("user_id")` ahí revienta con «Session.get() missing 1 required argument»).

- **Sección ACTIVIDADES: filtros por tipo y listado por sujeto** (ago 2026, `activities_view` +
  `templates/actividades.html`). Igual que la pestaña «Otras actividades» de Contratación pero con
  TODO (conciertos, festivales, eventos promocionales, TV, marca, otros y **acciones**):
  · Arriba, **etiquetas de TIPO con su icono** y su contador, acumulables (`?tipo=`, claves en
    `ACTIVITIES_TYPE_KEYS`; `?type=concert|action` sigue funcionando por los enlaces antiguos).
  · Debajo, la rejilla de **SUJETOS** —artistas **y eventos**— con su nº de actividades (una actividad
    de evento se agrupa por el `AppEvent`, nunca por su artista espejo).
  · Al pinchar uno, el listado **sin nombre ni foto de artista** (`.oa-row`): icono del tipo · nombre
    de la actividad (el festival si lo tiene) · municipio · provincia, y **debajo** fecha y recinto.

- **Filtros de tipo: solo los que TIENEN actividades** (ago 2026). En `/actividades`, en Contratación →
  «Otras actividades» y en Producción → «Activas», la etiqueta de un tipo **no se pinta si no hay
  ninguna actividad de ese tipo** (antes salían todas a cero y había que leerlas para descartarlas).
  · Los contadores se calculan sobre **lo que se está viendo** (periodo y, si se ha entrado en un
    artista o evento, solo lo suyo) pero **sin aplicar el propio filtro de tipo**: si no, la etiqueta
    que acabas de pulsar dejaría a las demás a cero y no podrías combinarlas.
  · La etiqueta activa se conserva aunque su contador sea 0 (si no, al filtrar desaparecería el botón
    con el que quitar el filtro).
- **Cabecera del SUJETO al entrar en él** (`/actividades`, «Otras actividades» y Producción → Activas):
  foto + nombre + **su total de actividades** (`drill_subject.count` / `activas.subject.count`, que es
  el del sujeto, no el del filtro de tipo que haya puesto), para no perder de vista de quién es lo que
  se está mirando. En Producción, **debajo de la cabecera** van los filtros por tipo.
- **Producción → Activas · PENDIENTES DE ASIGNAR** (`_production_active_context`): lo que no tiene
  responsable va en su propio listado **DEBAJO de la rejilla de artistas** y **solo ahí** (dentro de un
  artista o evento no viene a cuento: `unassigned` se devuelve vacío cuando hay `subject`). Si no hay
  ninguna pendiente, no se muestra nada. Desde ese listado lo ÚNICO que se hace es **elegir a la
  persona de producción** (modal `#assignProdModal` con `_production_people`, POST a
  `concert_production_owner_save`): no se navega a la ficha.
  ⚠️ Ese endpoint está en **`SUPPORT_ACTION_ENDPOINTS`** y su check interno acepta contratación,
  **producción** o **quien creó la actividad** (`Concert.created_by_user_id`): activar la producción es
  tarea del creador, y con solo `can_edit_concerts()` el botón de su Inicio moría en un 403.

- **Pendiente de facturar (módulo del enlace de subida de facturas)**: se llamaba «Lo que te
  pedimos» y las cantidades salían **0,00 €**. Motor único **`_invoice_request_amounts(net, gross)`**:
  el importe a facturar es SIEMPRE **base + IVA** (`INVOICE_REQUEST_VAT_PCT` = 21), y como unos gastos
  se apuntan solo con el bruto y otros solo con la base, se completa el que falte (con la base se suma
  el IVA, con el bruto se despeja la base). Sin importe se dice «factura el importe que corresponda»
  en vez de pintar un cero. Debajo va el **total de lo marcado** (con IVA), que se recalcula en el
  navegador. ⚠️ En la factura de una liquidación de royalties el importe salía 0 porque se leía
  `beneficiary['total']`, que **no existe**: es `total_amount` (mismo bug que en la pantalla de
  validar), y ahora manda además el **congelado** de la liquidación.

- **Facturación de proveedores** (`/facturacion`, landing pública en 3 pasos): plantilla
  `public_invoice_landing.html` + estilos `.inv-step*`. Un solo componente con dos modos:
  `inv_mode=LANDING` (bañera del back office a la izquierda, todas las empresas del grupo) e
  `inv_mode=REQUEST` (logo de la empresa del grupo a la DERECHA y solo sus datos; **sin casilla de
  confirmación**: los datos están a la vista y basta con «Continuar»). Lo usan `/factura/<token>`
  (petición de bolsa, `BagInvoiceRequest`) y `/facturacion?liq=<token>` (liquidación de royalties;
  la empresa es **PIES**, ver abajo). Backend:
  `_tax_id_kind` (empresa si empieza por letra, particular si acaba en letra), `_billing_profile_payload`
  (datos **enmascarados** con `_mask_value`: quien teclee un DNI ajeno no lee IBAN/email/teléfono),
  `_billing_required_docs`/`_billing_docs_state` (factura + `CERT_AEAT` solo empresas + `CERT_SS`;
  ambos en `INVOICE_MONTHLY_CERTS` → **caducan cada mes**, `_cert_month_range`), endpoints
  `public_invoice_identify`/`_register`/`_docs_state`/`_upload`. **Al identificar a alguien al que le
  faltan datos** solo se le piden los que faltan: los que ya tenemos se muestran en el formulario
  **censurados y bloqueados** (`shown` del payload; el nombre en claro, el resto con `_mask_value`),
  con candado y sin viajar al servidor (`disabled`, para no pisar el dato con «•••»). Pinchando encima
  se pregunta «Vas a actualizar el <campo>. ¿Continuar?» y, al aceptar, queda vacío y editable
  (clase `.inv-locked`). El hueco de **foto/logo solo aparece si esa persona no tiene ninguna**
  (`has_photo`). **La búsqueda por DNI/CIF mira TRES
  sitios** (todas las vías, sin cortar en la primera: si dos fichas comparten el número se ofrecen las
  dos y elige quien factura): `Promoter.tax_id`, `PromoterCompany.tax_id` y el **nº del DNI/pasaporte
  ESCANEADO** (`PersonDocument.doc_number`) — los artistas y sus personas suelen tener el documento
  subido aunque nadie haya rellenado el campo DNI/NIF, y sin esto se les pedía darse de alta otra vez
  y salía un tercero duplicado. Cada coincidencia lleva su **artista** (`_promoter_artist_context`:
  persona del artista vía `ArtistPerson.promoter_id`, o vinculado a él por `ThirdPartyLink`), que se
  muestra como pastilla («De Los X» / «Vinculado a Los X»), sale en el selector cuando hay varias y
  **rellena solo el ARTISTA de la factura**. Los certificados se guardan como
  `PersonComplianceDoc` (mismo sistema que PRL) y las facturas como `SupplierInvoice`
  (PENDIENTE/VALIDADA/RECHAZADA). Los enlaces oficiales de AEAT/Seguridad Social están en
  `INVOICE_CERT_DOCS`.
  ⚠️ **Ningún paso puede ser un callejón sin salida**: el paso «¿para quién es la factura?» PIDE elegir
  destinatario pero **no bloquea** (si no se elige, se avisa en la propia página y se sigue: el
  destinatario es opcional). Antes soltaba un `alert()` y, si no se veía, uno se quedaba atascado con
  el paso del DNI cerrado y «Comprobar» sin hacer nada (bug real). Además, un paso bloqueado ya **no se
  come los clics en silencio**: `.inv-step.is-locked` deja pasar el clic (el `pointer-events:none` es
  solo del `__body`) y al pinchar dentro se lleva al paso pendiente con un destello
  (`.inv-step--flash`).
  ⚠️ **Los números de paso se DEDUCEN del DOM** (`stepNumOf`): en el enlace de una petición no existe
  el paso «¿para quién es la factura?», así que la numeración (1,3,4) NO es la de la landing (1,2,3,4).
  Cuando estaba a mano, el enlace del proveedor desbloqueaba un paso inexistente y el de escribir el
  DNI se quedaba con `pointer-events:none`: al pulsar «Comprobar» no pasaba nada (bug real).
- **Royalties · la liquidación GENERADA queda congelada**: al generar se guarda en
  `RoyaltyLiquidation.snapshot` el detalle tal cual (+ `snapshot_signature` y `snapshot_pdf_url`), y
  todo lo que se ve/envía/descarga después usa ESO (`_build_royalty_liquidation_pdf_bytes(use_frozen=True)`,
  que es el valor por defecto; solo el botón de generar llama con `use_frozen=False`). Aunque cambien
  los ingresos la liquidación no se altera: `_royalty_needs_regeneration` compara firmas y marca
  «Ingresos actualizados», y al pulsar **Generar de nuevo** sale primero la **comparativa**
  (`royalty_liquidation_compare`) para aceptarla o conservar la anterior. Botonera: sin generar solo
  **Generar liquidación**; generada, **Enviar liquidación** (no se puede enviar sin generar) + descarga
  del PDF generado. **Botonera por estado**: sin generar → «Generar liquidación»; generada y sin
  enviar → «Enviar liquidación» (+ Información + menú de 3 puntos); **generada y enviada → solo
  «Información» y el menú de 3 puntos** (Reenviar liquidación · Generar una nueva · Descargar la
  generada). Con cambios económicos sale un **triángulo amarillo** cuyo tooltip dice desde cuándo y
  **cuánto cambiaría** (`income_diff_label`, calculado en `_apply_royalty_liquidation_meta`); al generar
  la nueva, esos datos sustituyen a los anteriores y el aviso desaparece.
  Toda la vida de la liquidación (generada, enviada, factura, cobro) se apunta en `history`
  (`_royalty_history_add`) y se ve en el botón **i**: el modal es una **secuencia en orden**
  —generación → envío (con destinatarios y descarga de la enviada) → factura (con enlace para verla) →
  pago—, **enseñando solo los bloques y campos que tienen dato**, y debajo el historial completo.
- **Royalties · facturación y validación**: las liquidaciones se facturan **a nombre de PIES**
  (el sello), no de la primera empresa del grupo por orden alfabético — helper `_pies_group_company`
  (del que ya tira `_afavor_pies_company`), usado por `public_royalty_liquidation_view` y por
  `/facturacion?liq=`. El correo/PDF de cada liquidación enlaza a
  `public_royalty_liquidation_view` (`/liquidacion/<token>`, reusa el token firmado de
  `_make_public_royalty_liquidation_token`), que la muestra como el PDF y ofrece **Subir factura**
  → al subirla se vincula (`SupplierInvoice.royalty_liquidation_id`) y la liquidación pasa a
  `INVOICED`. Administración → Pendiente → De liquidación lista las facturas por validar
  (`_royalty_invoice_pending_rows`) y `administration_royalty_invoice_review` muestra
  **liquidación a la izquierda / factura a la derecha**: validar deja pendiente de pago, rechazar
  avisa por correo con el motivo y devuelve la liquidación a `SENT`. ⚠️ Si alguien sube la factura por
  el enlace **sin que la liquidación existiera**, se crea sola (congelando los datos de ese momento) y
  queda como **facturada**: aparece en el listado de royalties y la factura, en la base de facturas. Se contrasta con las **órdenes
  de embargo vigentes** del proveedor y se avisa para no abonarle. Acciones en bloque:
  `royalty_liquidations_download_all` (un PDF continuo con pypdf) y `royalty_liquidations_send_all`.
- **Royalties · CONSIGNAR lo ya generado o enviado** (`_royalty_freeze_backfill`, marca
  `royalty_freeze_backfill_v1`): las liquidaciones anteriores al congelado no guardaban nada y se
  recalculaban al abrirlas. El relleno les fija su detalle una vez: si hay `last_sent_snapshot` se
  consigna **eso** (`consigned_from='SENT'`, es lo que recibió el beneficiario) y si no hay nada, lo de
  ese momento (`consigned_from='LIVE'` + `consigned_at`, y el detalle lo **dice** en pantalla, porque
  los importes originales no se pueden recuperar). ⚠️ El «ya está consignada» se decide mirando
  `rec.snapshot` A SECAS, no `_royalty_frozen_beneficiary` (que cae a lo enviado): si no, justo las que
  solo tienen el congelado del envío se saltarían. Corre en el arranque y hay botón **«Consignar»**
  (solo dirección) en Royalties para las que aparezcan después.
- **Remesa · cuenta de cargo, nombre del fichero y concepto** (ago 2026):
  · La **cuenta de cargo se elige PINCHANDO** una tarjeta con el logo del banco y el alias, no en un
  desplegable: parcial compartido `templates/_bank_account_picker.html` (macro `account_picker`,
  estilos `.acc-pick*`), usado por la caja de «Crear remesa» y por la ficha de la remesa. En la fila de
  una liquidación el desplegable desaparece: el icono crea la remesa y la cuenta se elige allí. Si no
  llega ninguna, `payment_batch_create` coge la de **por defecto** (si no, la remesa nacía sin cuenta y
  el fichero rebotaba).
  · **Nombre del fichero** (`_payment_batch_file_name`): de UNA bolsa →
  `Remesa_<Artista>_<Festival o municipio>_<Fecha del evento>`; varios sueltos o de varias bolsas →
  `Remesa_Varios_<fecha de generación>`. Se le añade la referencia (`REM-aaaa-nnnn`) para rastrearla.
  · **Concepto del pago** (`_payment_concept_for_expense`): se intenta que sea el de la **factura** que
  se paga (`SupplierInvoice.concept_text` vía `BagExpenseInvoice`), y si no hay, el del gasto; siempre
  con «Fra. <nº>» detrás. Es lo que el proveedor ve en su extracto.

- **Cuentas bancarias de una empresa del grupo: VARIAS en el mismo banco.** Lo único que no se repite
  es el **IBAN** (mismo IBAN = misma cuenta: se actualiza y se **avisa**, para que no parezca que no
  deja añadirla). En la lista, las cuentas del mismo banco se numeran («cuenta 1 de 2») y el formulario
  lo dice. Un IBAN que no cuadra en el mod-97 se rechaza con su motivo (era lo único que podía parecer
  un tope).

- ⚠️⚠️ **Royalties · el cálculo «en vivo» venía con el CONGELADO pegado** (raíz del fallo, ago 2026).
  `_apply_royalty_liquidation_meta` sobreescribe `total_amount`/`total_income`/`items` del bucket con
  el congelado, y la llaman **los dos constructores** (`_build_royalty_single_beneficiary` y
  `_build_royalty_beneficiaries`) → `_get_royalty_liquidation_beneficiary_data`, que todo el mundo
  trataba como «los datos de ahora», devolvía **los congelados**. Consecuencias reales: **generar una
  liquidación nueva volvía a congelar los importes VIEJOS** (nunca se actualizaba) y la comparativa
  antes/ahora salía idéntica. Ahora los tres aceptan **`apply_frozen`** (por defecto `True`, que es lo
  que quiere cualquier pantalla) y lo llaman con **`apply_frozen=False`** los cuatro sitios que
  necesitan los datos de HOY: generar (`use_frozen=False`), `royalty_liquidation_compare`, el modal de
  Información y el congelado de urgencia al subir una factura sin liquidación generada.
  · **El congelado se busca PRIMERO** (`_build_royalty_liquidation_pdf_bytes` y el enlace público):
  antes se calculaba siempre la liquidación en vivo y solo después se sustituía, así que una
  liquidación ya enviada **no se podía ver** si sus ingresos habían cambiado o desaparecido (saltaba
  «no hay datos»), y cualquier fallo en el reemplazo dejaba a la vista los importes de hoy.
  · **`_royalty_frozen_beneficiary` cae a `last_sent_snapshot`** si no hay `snapshot`: las
  liquidaciones enviadas antes de que se guardara el congelado de la generación solo tienen ese, y aun
  así es LO QUE SE ENVIÓ. Sin esto caían a los datos de hoy.
  · El enlace del beneficiario **dice si está cerrada** (y cuándo se generó); si no lo está, avisa de
  que los importes pueden variar.

- **Royalties · LO GENERADO NO SE ALTERA y los números CUADRAN** (auditoría ago 2026). Punto único
  **`_royalty_effective_beneficiary`** (el congelado si está generada; solo si no, lo de ahora), usado
  por el enlace del beneficiario, la landing de facturación, la pantalla de validar y el pago.
  · ⚠️ **`total` NO existe en un beneficiario: es `total_amount`.** Se leía `total` en la firma de los
  datos, en el historial de la generación, en el aviso de «los ingresos han cambiado» (`live_total`),
  en el modal de Información y en la comparativa → todos daban **0**: el aviso decía «+0,00 €», el
  historial no apuntaba importe y la firma no detectaba cambios. Corregido en todos.
  · ⚠️ **Enviar o descargar NO vuelve a congelar.** `_build_royalty_liquidation_pdf_bytes` con
  `touch_liquidation=True` re-congelaba y movía `generated_at` apuntando un «REGENERATED» falso; ahora
  si ya hay congelado y `use_frozen`, no se toca.
  · ⚠️ **Generar es un GET (`/discografica/royalties/liquidacion/pdf`) y sustituía el congelado sin
  confirmar**: bastaba reabrir la URL para regenerar una liquidación enviada con los ingresos de hoy.
  Ahora exige **`regenerate=1`** (lo manda el modal de comparación al aceptarlo, y la primera
  generación); sin él devuelve el PDF de lo generado. Una liquidación **FACTURADA o PAGADA no se
  regenera** ni autorizándolo: hay una factura y un pago contra ese importe.
  · **EL IMPORTE es uno solo**: el de la liquidación es la **BASE** y lo que se factura es **base +
  IVA** (`_royalty_invoice_totals` → `_invoice_request_amounts`). Ese número es el que sale en el PDF,
  en el correo, en el enlace del beneficiario, en «Pendiente de facturar», en la pantalla de validar,
  en pendiente de pago y **en el fichero SEPA**. El aviso de descuadre solo salta si la factura no
  cuadra **ni con el total con IVA ni con la base** (hay quien factura sin IVA).

- **Royalties · la pantalla de VALIDAR y el circuito de PAGO** (ago 2026):
  · **Izquierda = la liquidación TAL CUAL se envió**: sale del **congelado**
  (`_royalty_frozen_beneficiary`), no de recalcular en vivo, y se pinta con el parcial compartido
  **`templates/_royalty_liquidation_detail.html`** (macro `royalty_detail`), que usan también el enlace
  público y por tanto tiene las MISMAS columnas que el PDF (portada · Repertorio · Código · Fecha ·
  Ingreso · % · A facturar) con los descuentos bajo cada línea. ⚠️ El total del beneficiario es
  **`total_amount`**, no `total`: las dos plantillas leían `total` y el total salía **0,00 €** (bug
  real). ⚠️ El snapshot **no guardaba los descuentos**, así que con `use_frozen=True` desaparecían del
  PDF y de la pantalla: ya se congelan (`amount_before_deductions`/`deduction_total`/`deductions`);
  las congeladas de antes no los traen y no se pueden reconstruir.
  · **Derecha** = resumen (con aviso si la factura **no cuadra** con la liquidación) + documentación
  exigida + **botones de validar/rechazar ENCIMA** + la **factura abierta** en un `iframe` (PDF) o
  `<img>` (foto), sin tener que pinchar.
  · **Validar → pendiente de pago**: antes desaparecía porque «Pendiente de pago» solo listaba
  `BagExpense`. Ahora `_royalty_payment_pending_rows` las mete en `_payment_pending_context` bajo la
  empresa que factura los royalties (PIES), se pueden **arrastrar a la remesa**
  (`PaymentBatchItem.royalty_liquidation_id`, `_payment_batch_add_royalties`, campo `royalty_ids`),
  tienen su **icono** de crear/bajar la remesa eligiendo la cuenta (`royalty_liquidation_batch`) y su
  **estado como etiqueta clicable** (`royalty_liquidation_payment_status`: pendiente de pago ↔ pagada).
  El contador de la subpestaña las suma (si no, no cuadraba con lo que se ve).
  · ⚠️ **Pendiente de pago = la factura está VALIDADA**, no `status='INVOICED'` a secas: ese estado se
  pone al SUBIR la factura, así que filtrando solo por él se colaban liquidaciones sin factura o con la
  factura por validar y salían como **filas vacías** («Beneficiario», sin importe). Se cruza con
  `SupplierInvoice.status='VALIDADA'` (también en el contador). El importe no puede faltar en algo ya
  validado: congelado → factura → recálculo. Y los avisos de datos que faltan van en **español**
  (`REMESA_MISSING_LABELS`): `sepa_check_payment` devuelve las claves en inglés («amount», «iban»…) y
  se estaban pintando tal cual.
  · **La factura se ve en un POP-UP** al pinchar en cualquier pendiente de pago (`data-pay-doc` +
  `#payDocModal` en `pagos.js`): PDF en un marco, foto como imagen, con abrir y descargar. Encima va
  el **RESUMEN del pago** (base, IVA, **retención** si la hay, total a pagar, nº de factura,
  beneficiario y **la cuenta a la que se abona**), que es lo que hace que cuadre lo que se factura con
  lo que se paga; los importes viajan en `data-pay-doc-*` desde la fila (`_payment_expense_row` añade
  `net`/`vat`/`retention`/`invoice_number`).
  ⚠️ **Un PDF con la página pequeña se veía diminuto** en medio del marco: el ancla lleva
  `zoom=page-width` además de `view=FitH` (y hay botón de **pantalla completa**). Lo mismo en la
  pantalla de validar.
  · **Pagada → contabilidad**: `_royalty_mark_paid` (también desde el justificante de la remesa) y
  `_royalty_accounting_pending_rows` → módulo **«Pendiente de contabilizar»** de `/contabilidad`
  (plantilla nueva `contabilidad.html`) con `royalty_liquidation_accounted`.
  · **Avisos antes de abonar**: orden de **embargo** vigente y **adelantos/deudas** con las empresas
  del grupo (`PartyDebt` + `_party_debt_rows`), en la pantalla de validar, en la línea de la
  liquidación y en **cada gasto** de pendiente de pago (`_payment_expense_row`). Se anotan en la
  pestaña **«Adelantos y deudas»** de la ficha del tercero (`promoter_debt_save`/`_delete`); lo
  pendiente es `amount − amount_recovered` y al llegar a cero se cierra sola.
- ⚠️ **Migraciones en local**: `_bootstrap_schema_bg` (a) corre en un hilo DAEMON al importar `app`
  (muere con el proceso → migraciones a medias) y (b) usa un **cerrojo de fichero** en
  `tempfile.gettempdir()/app33_schema_bootstrap.lock` que la hace salir sin hacer nada si ya existe.
  Para aplicar el esquema en el entorno de prueba hay que **borrar el cerrojo y llamarla en primer
  plano** (ver el kit en la sección de verificación). En Render no afecta: cada deploy trae /tmp limpio.

- **Descarga de documentos generados** (`static/js/doc_download.js`, GLOBAL, cargado en `layout.html`
  ANTES del bloque del loader): intercepta los enlaces same-origin de documentos (por extensión o por
  las rutas `/pdf`, `/xlsx`, `/descargar`, `/export`…; excluir con `data-no-doc-loader`). Con
  `target="_blank"` abre la pestaña **de forma síncrona** (si no, el navegador la bloquea) pintando
  una pantalla propia «Generando documento…» con iconos y barra, y al terminar la reemplaza por el
  fichero (blob); sin `_blank` usa `window.appLoader.progress`. Si el `Content-Type` no es de
  documento (p. ej. un error devuelve HTML) NO lo da por bueno y cae al enlace normal.
- ⚠️ **`static/maintenance.html` es HTML PURO** (no pasa por Jinja): un comentario `{# … #}` se
  vería en pantalla — usar `<!-- … -->`. Tiene botón **Volver** (`history.back()` con fallback a `/`)
  junto a «Reintentar ahora», para cuando solo falla una sección.
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

- ⚠️ **Dicts en plantillas**: `d.items`/`d.keys`/`d.values` en Jinja devuelven el **método**, no la
  clave → hay que escribir `d['items']`. Ha causado TRES 500 reales (el set list del concierto,
  «Royalties → A favor» y la ficha de un proyecto, con una clave llamada `values`: el error es
  «'builtin_function_or_method object' has no attribute 'get'»). El checker de esprima NO lo detecta:
  revisar el HTML servido con curl. **La forma de no tropezar es no llamar `items`/`keys`/`values`/
  `get`/`copy`/`update` a una clave** que se vaya a leer en una plantilla (por eso la de la logística
  se llama `note_values`).

- **Royalties «A FAVOR»** (lo que nos liquidan las compañías externas): modelo `AfavorLiquidation`
  (una fila por **compañía + semestre**, UNIQUE) con el flujo `AFAVOR_STATUS_FLOW`
  PENDING → REQUESTED → PENDING_INVOICE → INVOICED → COLLECTED (etiquetas `.afavor-st--*` en gama
  azul→verde). `_build_afavor_groups` agrupa por **artista** y, dentro, por **compañía** (que es
  quien lleva el estado) e incluye portada/ISRC/fecha/colaboradores; **sin importes** (van en
  Ingresos). Endpoints: `afavor_request_liquidation` (correo con logo PIES a la derecha, cabecera de
  la compañía y listado; `_afavor_request_email_html`), `afavor_request_invoice`,
  `administration_afavor_invoice(_upload/_send)` (Administración → Pendiente → De facturación:
  liquidación izquierda / datos de facturación y subida derecha; la empresa que factura la da
  `_afavor_pies_company`), `afavor_invoice_resend`, `afavor_mark_collected`, `afavor_liquidation_pdf`.
  ⚠️ Sus endpoints NO llevan prefijo `discografica_`: están mapeados a mano en
  `_resolve_request_resource_key`/`_coarse_endpoint_resource` (si no, solo dirección podría usarlos).
- **Colaboraciones externas en la liquidación del ARTISTA**: `_build_royalty_beneficiaries` ya NO las
  excluye. `_royalty_external_collab_income(song, gross, net)` devuelve lo que nos ingresa la
  compañía (ingreso × `Song.our_pct`, sobre bruto o neto según `our_pct_base`) y ese importe es la
  base sobre la que se aplican el % del contrato del artista (por concepto discográfico/catálogo) y
  el de los terceros de `SongRoyaltyBeneficiary`. La etiqueta la pone `_royalty_item_ownership_label`.

- **«Mis gastos»** (`PersonalExpense`): facturas dirigidas a una persona por la landing
  (`SupplierInvoice.target_user_id` → `_personal_expense_from_invoice`) y gastos de Pleo, con el
  ciclo PENDING (sin bolsa) → IN_BAG (en la bolsa, sin tipificar) → ASSIGNED (con su `BagExpense`).
  Vistas `my_expenses_view` / `my_expenses_assign` (dos columnas con scroll propio, arrastre a las
  bolsas de `_open_bags_for_user`: no cerradas, agrupadas por artista y ordenadas por proximidad) y
  `my_expense_assign_bag`; dentro de la bolsa, `bag_imported_expense_assign` crea el gasto en la
  categoría donde se suelta (`bag_imported_pending` en `_bag_panel_context` parte la pantalla y
  desaparece al vaciarse). Panel de Inicio `HOME_MY_EXPENSES` con la cuenta atrás
  (`_expense_days_left`, `EXPENSE_ASSIGN_DAYS`=7) y cron `/cron/gastos-sin-asignar` que avisa a la
  persona al vencer y escala a dirección a los `EXPENSE_ESCALATE_DAYS`=15. **A dirección (role 10) no
  se le RECLAMA** (solo el correo; la sección y el módulo los ve todo el mundo). La sección sale en el
  menú de secciones **y** en el menú de la propia persona (`layout.html`), y el módulo de Inicio se
  muestra siempre: sin nada pendiente dice «Sin gastos pendientes de asignar» (`visible` en
  `_home_my_expenses_summary`). ⚠️ Sus endpoints están en **`PERSONAL_ENDPOINTS`**: los deja pasar cualquier
  sesión (son datos propios) y la comprobación de propiedad se hace dentro del endpoint.
  **PARAR EL PLAZO** (solo dirección, `is_master()`): por persona (`UserProfile.expense_deadline_paused`
  + `expense_paused_since` + `expense_pause_log`, botón en la ficha y en el menú de tres puntos del
  listado → `personnel_expense_deadline_toggle`) y para TODO el personal (ajustes globales
  `EXPENSE_PAUSE_ALL_*` vía `_get/_set_app_setting`, botón en la cabecera de `/personal` →
  `personnel_expense_deadline_toggle_all`). Mientras está parado: no corre la cuenta atrás, la pastilla
  dice «Plazo parado» y el cron no reclama ni escala. Los tramos parados se guardan y
  `_expense_paused_days` los **descuenta** del plazo de cada gasto (días completos: parar hoy no regala
  un día), así al reactivar no aparecen todos fuera de plazo de golpe. Punto único de cálculo:
  `_expense_pause_context(session_db, user_id)` → se pasa a `_expense_days_left`/`_personal_expense_row`.
- **Pleo (importación de gastos del personal)**: cliente en `pleo_utils.py` (`PleoClient`, Basic auth con la
  key como usuario y contraseña vacía, paginación por cursor, backoff en 429/5xx). Base `https://external.pleo.io`;
  endpoints reales: `POST /v1/accounting-entries:search` (**`company_id` en la QUERY STRING** y filtros en el
  body, con **`includeDeleted` obligatorio**), `GET /v1/accounting-entries/{id}`, `…/receipts` (URL firmada que
  **caduca en 24 h** → hay que descargar y guardar en Storage `pleo/`), `GET /v2/employees?companyId=`,
  `GET /v1/companies`, `POST /v0/tax-codes:search`, `POST /v0/aggregations/tags` (nombres de las etiquetas;
  los apuntes solo traen IDs). Scopes: `accounting-entries:read`, `users:read` + lectura de companies/tax-codes.
  ⚠️ **UNA cuenta de Pleo por empresa del grupo**: credencial y `company_id` en **`PleoAccount`** (BD, se edita
  en Integraciones → Pleo, **subpestaña por `GroupCompany`**), NO en `.env` (`PLEO_API_KEY` queda solo como
  respaldo). Toda llamada de contabilidad va con su `company_id` aunque la key cubra varias entidades.
  **Persona ← empleado**: `PleoEmployeeLink` (UNIQUE `account_id`+`pleo_employee_id`) resuelto por CORREO
  contra `User.email` y **`UserProfile.integration_emails`** (campo nuevo: otros correos de empresa, solo para
  identificar en integraciones, NO para entrar); lo que no cuadra se vincula a mano y entonces se importan sus
  gastos al momento (`_pleo_import_for_link`). Un gasto sin dueño NO se guarda (cuenta como huérfano).
  **Antiduplicados** (3 capas): índice **UNIQUE en `personal_expenses.pleo_entry_id`**, `pleo_receipt_ids` (no
  se re-descarga un justificante) y la regla de **no-pisado**: si `status='ASSIGNED'` solo se le engancha el
  adjunto que faltaba al `BagExpense` o se anota `sync_warning`. Motor en `app.py` (bloque `_pleo_*`, junto a
  «Mis gastos»): ventana móvil por `performedAt` + **repesca** individual de los incompletos (la API **no**
  permite filtrar por `updatedAt`) + advisory lock `_pleo_pg_lock` + savepoint por gasto. **No hay webhooks de
  gastos** en Pleo (solo `export.job-created`/`vendor.created`) → sondeo por `/cron/pleo/refresh?key=PLEO_CRON_KEY`.
  Familias importadas en `pleo_utils.PERSONAL_FAMILIES` (card purchase, out of pocket, reembolsos, kilometraje,
  dietas); se descartan WALLET/PLEO_INVOICE/BILL_INVOICE*/etc. Importes en **minors** → `money_to_decimal`;
  la base sin IVA sale del `taxCodeId` (`inclusive`/`exclusive`; con `reverse` no se desglosa). **Todo lo de Pleo
  se tipifica PAGADO con método «Pleo»** (+ `BagPaymentInteraction`) en `bag_imported_expense_assign`. Las
  etiquetas y la nota de Pleo **solo se muestran** (no clasifican) junto a un módulo sugerido por MCC
  (`_pleo_suggest_category`) en `my_expenses*.html` y en el panel de importados de la bolsa.
- **Facturación por empresa**: `/facturacion_<empresa>` (`_company_slug`/`_find_group_company_by_slug`)
  muestra solo esa empresa, su logo a la derecha y **oculta el navbar** (`hide_backoffice_nav`, flag
  que respeta `layout.html`). El paso «¿para quién es la factura?» usa `_invoice_target_people`
  (personal con departamento; dirección solo si tiene además otro) y `_detect_invoice_meta` lee el
  nº y la fecha de emisión del PDF para que el proveedor los confirme antes de enviar.

- **ALTA / ACTUALIZACIÓN de un tercero por ENLACE PÚBLICO** (`/alta/<token>`): en Terceros, botón
  **«Link de alta»**; en los 3 puntitos de cada fila y en su ficha, **«Solicitar actualización»**.
  Modelo `ThirdPartyIntakeLink` (token, `promoter_id` NULL = alta nueva, `kind` ALTA|UPDATE, `status`
  ACTIVE|DONE|CANCELLED, quién lo pidió, por dónde se mandó, `data` de lo recibido) +
  `ensure_third_party_intake_schema`. Modal reutilizable `_intake_share_modal.html` (Correo desde el
  servidor con `_intake_email_html` —cabecera `img/Banner.png` + título + «X ha solicitado…» + botón—,
  WhatsApp, SMS y copiar; `promoter_intake_link_create` **reutiliza** el enlace ACTIVO del tercero).
  Sin foto ni logo (un alta nueva no sabe aún quién es) la miniatura es el **símbolo de «sin foto»**
  (`img/placeholder_photo.png`), NO el logo de la casa.
  Página pública `public_third_party_intake.html`: **standalone a propósito** (layout.html no tiene
  `{% block %}` en el `<head>` y hacen falta las `og:` para la miniatura de WhatsApp; la imagen la
  sirve `public_intake_og_image` a 1200×630 desde nuestro dominio con `_og_image_jpeg_bytes`).
  Pasos con `step_wizard.js`, al que se le añadió **`data-sw-when`** (paso condicional) +
  `data-sw-mode` en el contenedor + `root.swRefresh()`: los pasos que no tocan se saltan, no cuentan
  en la barra y **se deshabilitan sus inputs** (si no, el navegador se para a validar un `required`
  oculto). Empresa→CIF / Particular→DNI; el paso 1 comprueba con `public_intake_identify`
  (`_prl_norm_dni` contra `Promoter.tax_id` y `PromoterCompany.tax_id`) y si ya existe ofrece
  actualizar **con los datos ENMASCARADOS** (`_mask_value`) salvo que sea su propio enlace.
  Cada documento se sube en su hueco con `public_intake_upload` (`slot`) y solo viaja la URL; del
  **certificado de titularidad** se lee el IBAN con pypdf + `_detect_iban_in_text` y se valida
  **mod-97** (`_iban_is_valid`) antes de guardarlo en `Promoter.bank_account` (el PDF va a
  `PersonComplianceDoc` `CERT_BANK`). Reutiliza los campos que ya existían de la landing de
  facturación (`fiscal_address`, `bank_account`, `data_consent_at`) y crea `PromoterCompany`,
  `PromoterContact` (función = texto libre), `PersonDocument` DNI/PASSPORT/LICENSE/LOYALTY y los
  `travel_departure_*`. ⚠️ `Promoter.nick` es UNIQUE: `_intake_unique_nick` añade sufijo.
  ⚠️ **Los colores de marca los inyectaba solo `layout.html`**: ahora `styles.css` los declara como
  suelo en `:root` (sin eso, cualquier página pública standalone tenía los botones transparentes).
- **Ficha de la empresa del grupo** (`company_detail`, `/empresas/<cid>`): pestaña **Datos** (datos de
  `GroupCompany` inline + bloque **Logos** —descarga PNG por `company_logo_png`, que baja el original y
  lo convierte con Pillow, + compartir correo/WhatsApp/SMS— + enlace `/facturacion_<slug>` con copiar,
  abrir, **copiar el código de inserción (icono `</>`)** vía `company_embed_code` → `_company_embed_snippet`
  y previsualizar) y pestaña **Documentación**
  (`GroupCompanyDocument`: nombre + `expiry_date`; `_company_doc_row` da la etiqueta
  **VALID/EXPIRED/NONE** → `.co-doc-st--valid/--expired/--none`, caducados primero). Guardado/borrado
  (`company_document_save`/`_delete`) **solo dirección** (`is_master()`), el resto ve/descarga/comparte
  (correo·WhatsApp·SMS); **editar la empresa y eliminarla también son solo dirección**
  (`can_edit_company`, el botón *Eliminar empresa* vive dentro del formulario de edición). Permisos: los
  endpoints `company_*` ya caen en `databases.group_companies` por prefijo en `_coarse_endpoint_resource`,
  no hay que mapearlos a mano. El **listado** `/empresas` es una lista simple sin botones: cada fila
  enlaza a su ficha (`companies.html`, clases `.co-row*`).
- ⚠️ **Todo enlace que se comparte va con `_external_url_for`** (host canónico), NUNCA con
  `url_for(..., _external=True)`: con el host de la petición los enlaces salían con el dominio antiguo
  de Render. Ya corregidos los de bolsa (`public_bag_invoice_upload`) y PRL (`public_prl_upload`).
- **Componente insertable en otra web** (`public_invoice_embed`, `/facturacion_<slug>/embed`): es la
  MISMA `public_invoice_landing.html` con `inv_embed=True` (sin logo de la empresa, título en su propia
  viñeta `.inv-embed-head`) + `embed_mode=True`, flag que **`layout.html`** usa para dejar
  `html/body/main` **transparentes y sin márgenes** (con `hide_backoffice_nav`). El alto lo comunica al
  `<iframe>` por `postMessage({app33:'facturacion-alto'})`. Al ser la landing real, cualquier cambio sale
  en la web de la empresa sin tocarla. ⚠️ No hay `X-Frame-Options`/CSP en la app: si algún día se añaden,
  hay que dejar este endpoint enmarcable.

- **Contratos de actividad: el PDF va por un endpoint con permiso** (`concert_contract_download`,
  `/conciertos/<cid>/contratos/<ctid>/ver`): exige sesión y `can_view_concert_contracts()` y sirve el
  fichero desde el servidor. ⚠️ Los contratos viven en el bucket PÚBLICO de Storage: la ficha ya no
  publica `pdf_url`, pero **las URL directas de los ya subidos siguen funcionando** para quien las
  tenga guardadas (cerrarlo del todo pide bucket privado o URLs firmadas, que afecta a todo el resto).
- **SUPLIDOS de un gasto** (`BagExpense.supplements`, ago 2026): lo que ese MISMO tercero factura
  además de su trabajo (la gasolina de un músico, un taxi). Se añaden desde los **tres puntitos del
  gasto** (`bag_expense_supplements_save`): concepto + importe, y **si no se sabe el importe se deja
  en blanco**. ⚠️ **NO llevan IVA ni retención**: `amount_gross` del gasto los INCLUYE (es lo que hay
  que facturar y pagar) pero `amount_net`/`amount_tax` siguen siendo solo la parte con IVA, así que el
  desglose NO se puede sacar del bruto — punto único **`_expense_invoice_breakdown(expense)`**
  (base+IVA de `amount_gross − suplidos`, más los suplidos aparte), que usan el enlace del proveedor,
  la comprobación del importe al subir y `_supplier_invoice_expected`.
  · **Al subir la factura**, si algún suplido no tiene importe, entre **identificarse y subir** sale el
  paso «Esta factura incluye suplidos a detallar» (`public_invoice_supplements_save`): lo que escriba
  actualiza el gasto (`_expense_apply_supplements`) y el total que se le exige a la factura. Si ya
  tienen importe, ese paso no aparece y los suplidos solo se ven en «Pendiente de facturar».
- **Facturas imputadas a gastos de bolsa** (`BagExpenseInvoice`): relación N:N entre una factura y
  los gastos que cubre, con el **importe imputado** a cada uno. Las filas de la MISMA factura física
  comparten `group_key`. El adjunto del `BagExpense` se sigue rellenando (compatibilidad con
  validación/PDF/avisos). Motor: `_bag_expense_invoice_apply` · `_bag_expense_invoice_rows` ·
  `_personal_expense_allocated`. **Petición al proveedor**: en el enlace público marca con casillas
  qué conceptos cubre la factura (una por concepto o una que englobe varios); el total se reparte a
  prorrata y la petición solo pasa a DONE cuando TODOS tienen factura. **Desde «Mis gastos»**: además
  de soltar en un módulo (crea gasto), se puede soltar **encima de un gasto existente**
  (`bag_imported_expense_link`): si la factura vale más, pregunta `update_amount` (el gasto pasa a
  valer la factura) o `split` (imputa lo que cabe y deja el resto para otro gasto, hasta repartirlo).
  ⚠️ Al soltar en un MÓDULO una factura ya repartida en parte, solo entra **lo que queda**
  (`_personal_expense_allocated`; el neto y el IVA se prorratean) y se anota la imputación: si no, el
  importe se contaba dos veces. El «Solicitar factura» de un gasto manda al proveedor el enlace con
  **todos sus conceptos pendientes** de la bolsa (mismo flujo que el botón agrupado, disponible ya en
  las dos vistas de la bolsa).
  ⚠️ `templates/public_bag_invoice_upload.html` es **código muerto**: `/factura/<token>` renderiza
  `public_invoice_landing.html` con `inv_mode='REQUEST'`.
- ⚠️ **Plantillas que parecen vivas y no lo son**: además de la anterior, `concerts.html` solo se
  usa en la pestaña **Facturación** (la vista de conciertos es `concerts_vista.html`), y su bloque
  `{% if active_tab == 'vista' %}` nunca se cumple. Antes de tocar una plantilla, comprobar con
  `grep -n "<fichero>.html" app.py` que se renderiza y desde dónde.

- **Cabify (gastos de viajes)**: cliente en `cabify_utils.py`. **OAuth2 client_credentials** contra
  `{base}/auth/api/authorization` (`grant_type/client_id/client_secret` → `access_token` Bearer,
  `expires_in` ~30 días, cacheado y renovado solo). API en `{base}/api/v4`. ⚠️ La **URL base de
  producción NO es pública** (la da Cabify al conceder el acceso) → **se detecta sola**:
  «Probar conexión» prueba la configurada y luego `BASE_URL_CANDIDATES` (`find_working_base_url`) y
  GUARDA la que responda; sandbox `https://cabify-sandbox.com`. En el panel de Cabify los dos
  códigos se llaman **UUID** y **Secreto** = `client_id` y `client_secret` (así están etiquetados en
  Integraciones, para que se peguen sin pensar). **UNA cuenta por empresa del grupo** (`CabifyAccount`,
  se edita en Integraciones → Cabify, subpestaña por `GroupCompany`). Personas:
  `GET /api/v4/users?state=&page=&per=` (paginado `{data,page,pages,per,total}`) → `CabifyUserLink`
  emparejado por CORREO reutilizando `_pleo_email_index` (correo de acceso + `integration_emails`);
  sin correo conocido queda para vincular a mano y al hacerlo importa sus gastos al momento.
  Gastos: se usa `GET /api/v4/user/{id}/sales?from&to&currency&page&per` y **no** el global
  `/api/v4/sales`, porque el global NO dice de quién es cada venta. Importes en **CÉNTIMOS** y con
  impuestos (`price_details.total`, base despejada con `tax_rate`). Antiduplicados: índice UNIQUE en
  `personal_expenses.cabify_sale_code` + savepoint por gasto. Sin webhooks → cron
  `/cron/cabify/refresh?key=CABIFY_CRON_KEY` (acepta la de Pleo/Chartmetric).
  ⚠️ Origen y destino salen de `concept.type_object.pickup`/`.dropoff` (campos `addr`/`num`/`city`/
  `name`), **no** de una lista de paradas — `stops` queda solo como respaldo; `tax_rate` puede venir en
  % o en fracción y `parse_sale` lo normaliza. La **etiqueta** del viaje (`charge_code`) se guarda en
  `pleo_tags` para que se pinte igual que las de Pleo.
  ⚠️ **LA APP NO FABRICA NINGÚN JUSTIFICANTE.** La API de Cabify **no expone el PDF del viaje**:
  verificado (ago 2026) contra el esquema publicado de `sales`, `user/{id}/sales` y
  `journey/{id}/sales` —solo `code`, `invoice_date`, `price_details` y el trayecto; el `public_url`
  de `journey/{id}` es el seguimiento en vivo— y contra el **índice completo** de su referencia, que
  no tiene ningún endpoint de documento. En su vocabulario «receipt» ES la venta (los datos); los
  recibos por viaje se bajan del **portal de Cabify Empresas**, no de la API.
  Hubo una versión que generaba un PDF propio y lo colgaba como si fuera el justificante de Cabify:
  **eso se retiró** (`_cabify_purge_fake_receipts` los desengancha y los borra de Storage; corre una
  vez en el arranque con marca `AppSetting` y tiene botón en Integraciones → Cabify). Un gasto de
  Cabify entra **sin factura**, con su semáforo en rojo, y quien lo tenga la sube desde «Mis gastos»
  o pide que se acepte sin ella. `CabifyClient.sale_receipt_url` rebusca el documento **también
  anidado**: el día que Cabify lo sirva se adjunta ESE y no hay nada más que tocar.
  ⚠️ Al borrar solo se tocan los `file_url` que apuntan a la carpeta **`cabify/`** de nuestro bucket
  (los que generaba la app); una factura subida a mano vive en otra carpeta y se respeta.
  ⚠️ **Un VIAJE puede generar VARIAS ventas** (el trayecto y sus SUPLEMENTOS: espera, peaje,
  limpieza). Se agrupan por `journey_id` → **un gasto por viaje** con el total sumado
  (`PersonalExpense.cabify_journey_id` + `cabify_sale_codes`, que evita sumar dos veces el mismo
  suplemento); un suplemento que llegue en un sondeo posterior se suma al viaje, y si el gasto ya
  está asignado se avisa en `sync_warning` en vez de tocarlo. El **concepto** lo construimos siempre
  nosotros: `dd/mm/aaaa · Origen → Destino` (fecha en formato de España). La `description` de Cabify
  **no se usa nunca**: es donde vienen los suplementos y ensucia la información.

- ⚠️⚠️ **CHARTMETRIC · las DOS rutas que estaban mal** (ago 2026, bug real: una canción vinculada por
  el buscador se quedaba **sin enlaces y sin reproducciones**, con «Cannot GET
  /api/track/170983676/spotify/stats»). Las rutas de verdad, confirmadas en su referencia
  (el **sitemap** de `apidocs.chartmetric.com` es público y lista las 149 rutas: la forma más rápida
  de comprobar una):
  · **Las reproducciones llevan un MODO al final**: `GET /api/track/{id}/{plataforma}/stats/{modo}`,
  con `modo` **obligatorio** — `highest-playcounts` (el id que más se ha escuchado, que es el que
  representa a la canción: es el que usamos) o `most-history` (la serie más larga). Sin el modo,
  Chartmetric contesta un **404 de Express** («Cannot GET …»), o sea que **esa ruta no existe**.
  · **Los IDS DE PLATAFORMA NO están en el metadato del track**: `/api/track/{id}` devuelve nombre,
  ISRC, portada, artistas, álbumes y `cm_statistics`, y **ningún** id de Spotify, Apple, Amazon ni
  YouTube. Están en su propio endpoint, **`GET /api/track/{tipo}/{id}/get-ids`** (tipo =
  `chartmetric`), que devuelve `spotify_ids`, `itunes_ids`, `amazon_ids`, `youtube_ids`, `deezer_ids`…
  **cada uno una LISTA (o null)**. Punto único **`cm.get_platform_ids(kind, id)`** (+
  `get_track_platform_ids` / `get_album_platform_ids`) y **`_cm_urls_from_get_ids(payload, kind)`**,
  con las plantillas de enlace en `_CM_URL_TEMPLATES`. El rascado del metadato
  (`_cm_track_platform_urls`) se conserva **como respaldo**.
  ⚠️⚠️ **La serie viene envuelta DOS veces**: `{obj: [{domain, track_domain_id, type, data:[{timestp,
  value}]}]}` — `obj` es una **lista de series** y los puntos están dentro de **`data`**. Devolviendo
  `obj` tal cual, cada «punto» era una serie sin `timestp` y se descartaban todos: **0
  reproducciones, sin ningún error**. Lo resuelve `_cm_extract_series` (prefiere la serie del `type`
  pedido) con `_cm_es_punto`.
  ⚠️ En el refresco de un ARTISTA los ids de plataforma se piden solo para las canciones que se
  quedan **sin ningún enlace** y con **tope** (`CM_GET_IDS_PER_ARTIST` = 25): cada llamada gasta
  créditos. El resto los rellena el «Actualizar» de esa canción.
  ⚠️ Tres matices más de su **OpenAPI** (que es público: `apidocs.chartmetric.com/reference/openapi.json`,
  y con `llms-full.txt` al lado — la forma de comprobar esta API sin adivinar):
  · en **Spotify** el `type` por defecto es **`popularity`**, no `streams`, así que las reproducciones
  hay que pedirlas a mano (`type=streams`); en **YouTube** el spec **no declara valores** de `type`, así
  que no se manda ninguno y se deja su defecto (mandar uno inventado es pedir un 400);
  · el `obj` de **`get-ids` es un ARRAY** (el de stats también, con UN elemento);
  · el **valor de un punto puede llegar como TEXTO** («may arrive as numeric or string for large
  counters»): lo normaliza `_cm_point_value` — guardarlo tal cual metía texto en una columna numérica.
  · **«COMPROBAR RUTAS»** (icono de estetoscopio en Integraciones → Chartmetric → Canciones,
  `cm_song_diagnose` → `cm.diagnose_track`): prueba las rutas de ese track y enseña **qué ha
  contestado cada una** (responde y con qué claves · 404 · sin permisos · sin créditos), el mismo
  patrón que el diagnóstico de Holded. Es la forma de comprobar la API **sin tener el token
  delante**: si Chartmetric vuelve a cambiar una ruta, se ve en pantalla en vez de en el log.

- **CHARTMETRIC · vincular canciones y álbumes** (ago 2026):
  · ⚠️ **El ISRC se busca SIEMPRE EN SECO**: nosotros lo guardamos con guiones (ES-A2A-25-00001)
  porque se lee mejor, pero la API busca por el código seguido y con guiones **no encuentra nada**.
  Punto único **`chartmetric_utils.norm_isrc`** (y **`norm_code`** para el UPC/EAN de un álbum),
  aplicado dentro de `get_track_ids_from_isrc`/`get_album_ids_from_upc`, así que no hay que acordarse
  en cada llamada. `cm_song_reresolve` prueba además **todos** los ISRC de la canción
  (`_current_song_isrcs`), no solo `Song.isrc`, que en muchas está vacío.
  · **Pegar el ENLACE** cuando no lo encuentra solo: botón «Vincular» en Integraciones → Chartmetric
  (Canciones y Álbumes) → modal con la URL de Chartmetric (`cm_link_manual`). `_cm_id_from_url` saca
  el id de `…/track/123`, `…/album/456`, con cola de parámetros o del id a pelo, y
  **`_cm_link_row_manual` lo comprueba contra la API antes de guardar**: un enlace mal pegado no deja
  la ficha apuntando a otra obra. Si el enlace es de un álbum y se está vinculando una canción (o al
  revés), se avisa y no se toca nada.
  · **Buscador**: en el mismo modal se busca por nombre —o pegando un ISRC/UPC— con
  `api_cm_search` (`/api/chartmetric/buscar`, JSON) → `search_tracks`/`search_albums` (`/api/search`,
  extracción tolerante con la forma de la respuesta). Y arriba de cada lista hay un buscador que
  filtra **nuestras** filas (`[data-cm-filter]`, las listas son de 400).
  · **Álbumes**: ya tienen «Re-resolver» propio (`cm_album_reresolve`) por UPC y por los códigos de
  producto de sus formatos, con `get_album`/`get_album_ids_from_upc` y
  `_cm_album_platform_urls` (el deep link de Spotify de un disco es `/album/…`, no `/track/…`).
  ⚠️ Las **REFERENCIAS que genera la casa** (REF00001, `AlbumProductCode.generated_sequence`) NO son
  un código de barras: se descartan y además se exige forma de UPC/EAN (`len(norm_code) >= 8`). Si no,
  se le preguntaba a Chartmetric por «00001» y el disco podía quedar vinculado al de otro.
  · ⚠️ **El casado AUTOMÁTICO también mira los ISRC de la pestaña de códigos**
  (`_cm_resolve_artist_song_links` + `SongISRCCode`, cargados de una vez para todas las canciones del
  artista): mirando solo `Song.isrc` —vacío en la mayoría— no vinculaba nada solo.
  · ⚠️ **Un UPC no es un id de Chartmetric**: `api_cm_search` probaba primero cualquier cosa toda
  dígitos como id, así que un código de barras podía traer otra obra. Con pinta de UPC/EAN
  (≥8 dígitos) se va directo a la búsqueda por UPC.
  · ⚠️ **Sin créditos o con 429 NO se dice «revisa el ISRC»**: `get_track_ids_from_isrc(...,
  raise_on_error=True)` deja subir el motivo real (lo usa `cm_song_reresolve`). Con el `except` a
  secas, un fallo de la API era indistinguible de «ese ISRC no está».
  · **Al VINCULAR se actualizan los botones y los números en ese momento**:
  `_cm_apply_song_links(..., force=True)` en la vinculación A MANO **pisa** los enlaces (corregir un
  vínculo equivocado tiene que cambiarlos; lo bloqueado a mano en `cm_links_locked` no se toca ni con
  force); `_cm_recompute_link_status` da **tres** estados —**Sin vincular** (sin `cm_track`) ·
  **Vinculada** (hay id) · **Completo** (los cinco enlaces)—, porque el antiguo COMPLETE exigía cinco
  plataformas que Chartmetric no da nunca y todo se quedaba en «Pendiente»; y al recibir
  `inline:updated` de la zona de canciones o álbumes se **refresca también `#cmZoneSummary`**
  (los contadores viven en OTRA zona, así que antes los números de arriba no se enteraban). El resumen
  cuenta ahora **canciones y álbumes vinculados**, no solo artistas.
  · Los buscadores de las listas indexan el ISRC y el UPC **también en seco** (`data-cm-search` con
  `|replace('-','')`): pegando el código seguido no encontraba la fila que lo tiene con guiones.
  · Los endpoints `cm_*` y `api_cm_search` se mapean a la sección **`integraciones`** (a mano y por
  prefijo) y exigen además dirección o edición en discográfica.
  · **NADA en Integraciones recarga la página**: todas las acciones de las cuatro pestañas (Pleo,
  Cabify, Chartmetric y Enterticket) son `data-inline` con su zona —`#pleoZone-N`, `#cabifyZone-N`,
  `#cmZoneSummary`/`#cmZoneArtists`/`#cmZoneSongs`/`#cmZoneAlbums`, `#etZone`—, así que se refresca
  solo ese trozo y no se pierden la pestaña, la subpestaña ni el scroll (antes cada acción devolvía a
  la portada de Integraciones). Los modales de vincular (Chartmetric y Enterticket) se cierran al
  recibir `inline:updated` de su zona, y los buscadores y botones de dentro se **vuelven a enganchar**
  ahí mismo (los elementos de la zona son nuevos).
  ⚠️ El modal vive **antes** del `<script>` que lo cablea: en esta plantilla el JS va dentro del
  bloque de contenido y se ejecuta al vuelo, así que si el modal fuera después, al inicializar no
  existiría y no se engancharía nada.

- ⚠️ **Subida de archivos GRANDES (audio, vídeo, PDF) a Storage**: `storage3` solo admite `bytes`,
  `BufferedReader`/`FileIO` o una **ruta**. El stream de una subida de Flask es un
  `SpooledTemporaryFile` (werkzeug pasa a disco a partir de ~500 KB), así que pasarlo tal cual
  reventaba con «expected str, bytes or os.PathLike object, not SpooledTemporaryFile» y **fallaban
  los masters .wav** (los pequeños colaban por el fallback en memoria, los grandes no). `_upload_fileobj`
  vuelca el stream a un fichero temporal EN DISCO por trozos y sube por ruta: sin tope de tamaño y sin
  cargar nada en memoria.

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
