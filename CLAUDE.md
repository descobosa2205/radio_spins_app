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
# 4) Sembrar usuario role 10 + artista/recinto/concierto vía modelos (User exige password_hash);
#    lo más cómodo es `app.test_client()` + `session_transaction()` en vez de login por curl.
#    Para conceder permisos hace falta sembrar antes UserAccessResource desde CURATED_ACCESS_RESOURCES.
# ⚠️ Los errores 500 muestran la página de MANTENIMIENTO (errorhandler 500 → maintenance.html):
#    si el usuario dice «sale la página de cerrado por mantenimiento», es un 500 → buscar traceback en el log.
```

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
- **Inicio · acciones rápidas por departamento**: botones bajo la cabecera del personal
  (`HOME_QUICK_ACTIONS` ← `_build_home_quick_actions`, catálogo `_home_quick_action_defs`, reparto
  `_HOME_QUICK_BY_DEPARTMENT` por `UserProfile.departments`: Contratación/Sello/Registros; el resto
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
- **Cambios de estado in-place** (`static/js/ajax_inline.js`): un
  `<form method="post" data-inline data-inline-target="#zonaId">` se envía por fetch (el endpoint NO
  cambia: sigue POST+redirect), se sigue el redirect y se **reemplaza solo la zona** `#zonaId`
  (un elemento con `id` + `data-inline-zone` que contiene el form y el badge que cambia), sin recargar
  ni mover el scroll; si no localiza la zona, hace recarga normal (fallback seguro). NO usarlo en
  borrados ni acciones que navegan a otra página. Ya AJAX nativo aparte: `concert_quick_status`,
  `setRoyaltyLiquidationStatus`.
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
- **Asistentes por pasos (UX)**: cuando se pincha una opción de un paso que **no requiere más datos**,
  **auto-avanzar** al siguiente paso sin pulsar "Siguiente" (menos clics). Implementado en el asistente
  de invitaciones (`invitaciones.html`, helpers `goStep`/`getStep`): pasos de artista, evento,
  "¿Para quién son?" y "Entrega". **No** aplicar en pasos **multicampo** (asistente de conciertos
  `_concert_wizard_modal.html`, alta de medios `media_outlets.html`), que conservan "Siguiente".
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

- **PERSONAS DEL ARTISTA = TERCEROS que forman parte de él** (`ArtistPerson.promoter_id`): un miembro
  de un grupo (o el solista) es un **tercero particular** con exactamente los mismos datos (DNI,
  pasaporte, carnet, tarjetas de fidelización, matrículas, necesidades de viaje, cuenta bancaria,
  dirección fiscal…), que se rellenan en la **pestaña «Personas»** de la ficha del artista sin salir.
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
  `#payDocModal` en `pagos.js`): PDF en un marco, foto como imagen, con abrir y descargar.
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
- ⚠️ **Dicts en plantillas**: `d.items`/`d.keys`/`d.values` en Jinja devuelven el **método**, no la
  clave → hay que escribir `d['items']`. Ha causado dos 500 reales (el set list del concierto y
  «Royalties → A favor»). El checker de esprima NO lo detecta: revisar el HTML servido con curl.

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
