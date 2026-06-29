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
- **Iconos de sección**: dict `SECTION_ICONS` en `app.py`, inyectado al contexto; usado en el menú
  (`layout.html`) y en permisos.
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
  artistas asignados o todos si no tiene/role 10).
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
- **Asistentes por pasos (UX)**: cuando se pincha una opción de un paso que **no requiere más datos**,
  **auto-avanzar** al siguiente paso sin pulsar "Siguiente" (menos clics). Implementado en el asistente
  de invitaciones (`invitaciones.html`, helpers `goStep`/`getStep`): pasos de artista, evento,
  "¿Para quién son?" y "Entrega". **No** aplicar en pasos **multicampo** (asistente de conciertos
  `_concert_wizard_modal.html`, alta de medios `media_outlets.html`), que conservan "Siguiente".

## Marca / estética
- Colores: **#E33D48** (rojo, `--brand-primary`) y **#007CA2** (azul, `--brand-accent`).
- Logos: `static/img/logo_33_producciones.png` y `static/img/logo.png` (PIES). Co-branding.
- Hay refinamiento global de Bootstrap en `styles.css` (botones, tarjetas, navbar, tablas, pestañas,
  formularios). Landing pública en `landing.html` (standalone).

## Despliegue
- GitHub `descobosa2205/radio_spins_app` → **Render** (Pro Plus, **Frankfurt**) auto-deploy de
  `main`. **Supabase** Pro (**Estocolmo**). Arranque: `gunicorn -c gunicorn.conf.py app:app`.
- Acelerar (pendiente, lo hace el usuario): `WEB_CONCURRENCY=4` en Render, usar el **pooler** de
  Supabase en `DATABASE_URL`, y a futuro alinear regiones.

## Pendiente importante
- **Fase de seguridad** (sin empezar): rotar credenciales expuestas en git, eliminar contraseñas en
  texto plano (`UserSecurity.password_preview` y `users.txt`), añadir CSRF, tokens de reset de un
  solo uso, y mitigar host-header injection / SSRF. Ver sección 9 del `README.md`.
