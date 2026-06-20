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
  (+ `quick_create.js`, `typeahead.js`, `ajax_inline.js`).
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
  total y único que edita permisos). Enforcement: `_enforce_role_permissions_v2` (usa
  `include_descendants`). Coherencia: `_coherent_grant_values`. Las funcionalidades nuevas se
  autodescubren y entran **desactivadas**. UI en `personnel_detail.html` + `personnel_bulk.html`.
- **Iconos de sección**: dict `SECTION_ICONS` en `app.py`, inyectado al contexto; usado en el menú
  (`layout.html`) y en permisos.
- **Select2 con logos**: `initSelect2()` (scripts.js) pinta la imagen de cada opción desde
  `data-photo`/`data-logo`. El `<select>` debe llevar una clase: `select-providers` (terceros),
  `select-venues` (recintos), `select-with-thumbs` (ticketeras/editoriales, miniatura cuadrada),
  `select-artists` (artistas). Campos de logo: promoter/ticketer/publishing → `logo_url`;
  venue/artist → `photo_url`.
- **Alta rápida de entidades (modal superpuesto)**: `templates/_quick_create_modals.html` +
  `static/js/quick_create.js`. Junto a un `<select id="X">` añadir
  `<button type="button" data-quick-create="TIPO" data-target="X"><i class="fa fa-plus"></i></button>`
  (TIPO ∈ venue|promoter|ticketer|publishing_company|artist). Crea por `/api/<tipo>/create` (JSON),
  deja la entidad seleccionada sin recargar y gestiona duplicados.
- **Loader global**: `#globalLoader` en `layout.html`; aparece al navegar, enviar formularios o en
  `fetch` >300 ms. Excluir con clase/atributo `no-loader`/`data-no-loader`.
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
