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

- **Documentos personales (pestaña «Documentos» en ficha de personal y de tercero)**: modelo
  polimórfico `PersonDocument` (`owner_type` USER|PROMOTER, `kind` DNI|LICENSE|PASSPORT|LOYALTY|PLATE,
  `front_url`/`back_url`, `doc_number`, `full_name`, `birth_date`, `expiry_date`, `issue_date`
  (emisión, pasaporte), `company`, `label`, `extra`) + `ensure_person_documents_schema`. Panel
  reutilizable `templates/_person_documents_panel.html` + `static/js/person_docs.js` (GLOBAL en layout,
  no-op sin `[data-person-docs]`) + estilos `.docs-*`. DNI/carnet = tarjeta de **dos caras**;
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
  antes de la caducidad). Rellena el documento y los campos VACÍOS de la ficha
  (`_person_doc_apply_to_profile`: `UserProfile.dni`/`birth_date`/nombre o `Promoter.tax_id`/nombre;
  el nº solo va a DNI/NIF cuando el documento es un DNI, no en carnet/pasaporte).
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
  le falte algo). `pypdf` en requirements.

- **Facturación de proveedores** (`/facturacion`, landing pública en 3 pasos): plantilla
  `public_invoice_landing.html` + estilos `.inv-step*`. Un solo componente con dos modos:
  `inv_mode=LANDING` (bañera del back office a la izquierda, todas las empresas del grupo) e
  `inv_mode=REQUEST` (logo de la empresa del grupo a la DERECHA, solo sus datos y **confirmación
  obligatoria** de que la factura está emitida a ellos). Lo usan `/factura/<token>` (petición de
  bolsa, `BagInvoiceRequest`) y `/facturacion?liq=<token>` (liquidación de royalties). Backend:
  `_tax_id_kind` (empresa si empieza por letra, particular si acaba en letra), `_billing_profile_payload`
  (datos **enmascarados** con `_mask_value`: quien teclee un DNI ajeno no lee IBAN/email/teléfono),
  `_billing_required_docs`/`_billing_docs_state` (factura + `CERT_AEAT` solo empresas + `CERT_SS`;
  ambos en `INVOICE_MONTHLY_CERTS` → **caducan cada mes**, `_cert_month_range`), endpoints
  `public_invoice_identify`/`_register`/`_docs_state`/`_upload`. Los certificados se guardan como
  `PersonComplianceDoc` (mismo sistema que PRL) y las facturas como `SupplierInvoice`
  (PENDIENTE/VALIDADA/RECHAZADA). Los enlaces oficiales de AEAT/Seguridad Social están en
  `INVOICE_CERT_DOCS`.
- **Royalties · facturación y validación**: el correo/PDF de cada liquidación enlaza a
  `public_royalty_liquidation_view` (`/liquidacion/<token>`, reusa el token firmado de
  `_make_public_royalty_liquidation_token`), que la muestra como el PDF y ofrece **Subir factura**
  → al subirla se vincula (`SupplierInvoice.royalty_liquidation_id`) y la liquidación pasa a
  `INVOICED`. Administración → Pendiente → De liquidación lista las facturas por validar
  (`_royalty_invoice_pending_rows`) y `administration_royalty_invoice_review` muestra
  **liquidación a la izquierda / factura a la derecha**: validar deja pendiente de pago, rechazar
  avisa por correo con el motivo y devuelve la liquidación a `SENT`. Se contrasta con las **órdenes
  de embargo vigentes** del proveedor y se avisa para no abonarle. Acciones en bloque:
  `royalty_liquidations_download_all` (un PDF continuo con pypdf) y `royalty_liquidations_send_all`.
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

## Despliegue
- GitHub `descobosa2205/radio_spins_app` → **Render** (Pro Plus, **Frankfurt**) auto-deploy de
  `main`. **Supabase** Pro (**Frankfurt**, proyecto `gyezqnqyxpwxxevdjhgf`; migrado desde Estocolmo
  el 11-jul-2026 — regiones ya alineadas, ~1-2 ms por consulta). Arranque:
  `gunicorn -c gunicorn.conf.py app:app`. **Health Check Path = `/healthz`** en Render (instantáneo,
  sin BD): reinicia instancias colgadas y valida deploys.
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
