# Radio Spins App — Gestión de Productora Musical

Aplicación web interna de **33 Producciones** para gestionar el flujo de trabajo completo de una
productora musical: **conciertos y ventas de entradas**, **discográfica** (canciones, álbumes, ISRC,
royalties, editorial, ingresos y liquidaciones), **invitaciones**, **promoción y medios**,
**bolsas de trabajo y administración financiera**, y **gestión de usuarios/permisos**.

> Este README documenta cómo configurar, ejecutar y **desplegar** la aplicación, además de un
> **registro de cambios** con todas las modificaciones que se van aplicando durante el saneamiento
> del código.

---

## 1. Stack tecnológico

| Componente | Tecnología |
|---|---|
| Lenguaje | Python **3.11** |
| Framework web | **Flask 3** (servidor de plantillas Jinja2, sin SPA) |
| ORM | **SQLAlchemy 2** |
| Base de datos | **PostgreSQL** (alojado en **Supabase**) |
| Almacenamiento de ficheros | **Supabase Storage** (bucket `media`) |
| Servidor de producción | **Gunicorn** (workers `gthread`) |
| PDFs | ReportLab + pypdf |
| Imágenes / audio | Pillow / pydub |

La aplicación es un **monolito**: prácticamente toda la lógica vive en `app.py` y los modelos en
`models.py`.

---

## 2. Estructura del proyecto

```
radio_spins_app/
├── app.py                  # TODA la lógica y rutas (~34.000 líneas, 344 rutas)
├── models.py               # Modelos SQLAlchemy (93 tablas) + migraciones ensure_*
├── config.py               # Carga de configuración desde variables de entorno (.env)
├── supabase_utils.py       # Subida de ficheros a Supabase Storage
├── gunicorn.conf.py        # Configuración de Gunicorn para producción
├── manage_users.py         # CLI para crear/listar usuarios en la BD
├── import_users_from_txt.py# Importa usuarios desde users.txt a la BD
├── requirements.txt        # Dependencias de Python
├── .env                    # Secretos y configuración local (NO versionado)
├── .env.example            # Plantilla de variables de entorno (versionada)
├── .gitignore              # Exclusiones de git
├── static/                 # CSS, JS, imágenes, favicons
└── templates/              # 80 plantillas Jinja2 (.html)
```

---

## 3. Configuración local (primera vez)

Requisitos: **Python 3.11** y acceso a la base de datos de Supabase.

```bash
# 1. Crear y activar el entorno virtual
python3.11 -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

# 2. Instalar dependencias
pip install -r requirements.txt

# 3. Crear el fichero .env a partir de la plantilla y rellenar los valores reales
cp .env.example .env
# (edita .env con tus credenciales — ver sección 4)
```

> ⚠️ El entorno virtual `.venv/` **ya no se versiona** (ver registro de cambios). Cada equipo debe
> crear el suyo con los pasos anteriores. Esto es lo estándar y no cambia el despliegue, porque el
> servidor reconstruye las dependencias desde `requirements.txt`.

---

## 4. Variables de entorno

Se cargan desde `.env` en local y desde el **panel del proveedor** en producción.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `FLASK_SECRET_KEY` | **Sí** | Clave para firmar la sesión y los tokens (reset de contraseña, enlaces públicos). Debe ser **larga y aleatoria**. Genera una con: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | **Sí** | Cadena de conexión Postgres de Supabase (con `sslmode=require`). |
| `SUPABASE_URL` | **Sí** | URL del proyecto Supabase (para Storage). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Sí** | Clave *service role* de Supabase (acceso de servidor). |
| `SUPABASE_BUCKET` | No | Bucket de almacenamiento. Por defecto `media`. |
| `BRAND_PRIMARY` / `BRAND_ACCENT` | No | Colores corporativos (hex). |
| `MAX_CONTENT_LENGTH` | No | Tamaño máx. de subida en bytes. Por defecto 1 GiB. |
| `WEB_CONCURRENCY` | No | Nº de workers de Gunicorn. Por defecto 1. |
| `GUNICORN_TIMEOUT` | No | Timeout de Gunicorn (s). Por defecto 300 (subidas de audio grandes). |
| `SESSION_COOKIE_SECURE` | No | Pon `1` en producción (HTTPS): la cookie de sesión solo viaja cifrada. Por defecto off para no romper el desarrollo local en `http`. |
| `EXTERNAL_BASE_URL` | No | Dominio público fijo (p. ej. `https://backoffice.tudominio.com`) para los enlaces que salen por email. Si no se indica, se usa el host de la petición. Recomendada (evita *host-header injection*). |

> 🔒 **Seguridad:** `.env` y `users.txt` contienen secretos y **no deben subirse a git** (ya están en
> `.gitignore`). Si alguna vez se subieron, **rota las claves** (ver sección 9).

---

## 5. Ejecutar en local

**Modo desarrollo** (servidor de Flask con recarga automática, en `http://127.0.0.1:5000`):

```bash
source .venv/bin/activate
python app.py
```

**Modo producción local** (igual que en el servidor, con Gunicorn):

```bash
source .venv/bin/activate
gunicorn -c gunicorn.conf.py app:app
```

---

## 6. Despliegue en producción

> El despliegue actual es un **servicio web tipo Render** (PaaS) que ejecuta Gunicorn y se conecta a
> Supabase. Si usas otro proveedor, los conceptos son equivalentes. **Confirma estos valores con tu
> panel actual.**

**Configuración del servicio (una sola vez):**

- **Build command:** `pip install -r requirements.txt`
- **Start command:** `gunicorn -c gunicorn.conf.py app:app`
- **Variables de entorno:** las de la sección 4, configuradas en el panel del proveedor
  (NO en el repositorio).
- **Versión de Python:** 3.11.

**Flujo de despliegue habitual (cada vez que hay cambios):**

```bash
# 1. (Recomendado) Probar en local que arranca
python app.py        # Ctrl+C para parar

# 2. Revisar los cambios
git status
git diff

# 3. Confirmar y subir a GitHub
git add -A           # incluye el dejar-de-versionar de .env/.venv/etc. (ver registro de cambios)
git commit -m "Descripción de los cambios"
git push origin main

# 4. El proveedor (Render) detecta el push y redespliega automáticamente.
#    Si no tienes auto-deploy, lanza el deploy manual desde el panel.
```

> ℹ️ **Importante en el primer commit tras este saneamiento:** el `git add -A` registrará que
> `.env`, `users.txt`, `.venv/`, `__pycache__/` y `.DS_Store` **dejan de versionarse**. Los ficheros
> siguen en tu disco y en producción (vía variables de entorno), pero salen del control de versiones.

### Base de datos y migraciones

No se usa Alembic. El esquema se **autocrea/actualiza al arrancar la aplicación**: en `app.py` se
ejecutan `init_db()` y una serie de funciones `ensure_*_schema()` (idempotentes) que crean tablas y
columnas que falten. Por tanto, **al desplegar una versión con cambios de modelo, basta con
reiniciar el servicio**; no hay un paso de migración manual.

> Estas funciones son "best-effort": si fallan (BD ocupada, permisos), el arranque continúa y se
> registra un aviso en los logs. Conviene revisar los logs tras un despliegue con cambios de esquema.

---

## 7. Gestión de usuarios

Existen dos vías (actualmente coexisten):

1. **Desde la propia app:** sección *Personal* (requiere usuario con permisos).
2. **CLI `manage_users.py`** (crea/actualiza directamente en la BD):

   ```bash
   source .venv/bin/activate
   python manage_users.py create --email persona@33producciones.es --role 5
   #   (pedirá la contraseña por prompt si no se pasa --password)
   python manage_users.py list
   ```

   Roles: `1` lectura · `2` radio+discográfica · `3` ventas · `4` lectura total ·
   `5`/`6` conciertos+catálogos · `10` master.

3. **`users.txt` + `import_users_from_txt.py`** (mecanismo heredado). El login también acepta
   credenciales de `users.txt` como respaldo. ⚠️ Este fichero guarda contraseñas en texto plano y
   está pendiente de retirarse (ver auditoría).

---

## 8. Registro de cambios (CHANGELOG)

### Lote 1 — Bugs que provocaban error 500 + higiene del repositorio

**Bugs de runtime corregidos** (`app.py`):

- **Alta de facturas:** se llamaba a `_safe_decimal(...)`, función inexistente → `NameError`
  (error 500 al guardar cualquier factura). Sustituido por el helper existente
  `_parse_money_decimal(...)`. *(endpoint `invoices_view`, `POST /facturas`)*
- **Filtro de Producción:** se llamaba a `_search_normalize(...)`, función inexistente → `NameError`
  (error 500 al buscar por texto en solicitudes de producción). Se ha **añadido** la función
  `_search_normalize()` (normaliza texto: quita acentos, alfanumérico, minúsculas).
  *(helper de `_production_passes_filters`)*

**Higiene del repositorio:**

- Añadido **`.gitignore`** (excluye `.env`, `users.txt`, `.venv/`, `__pycache__/`, `.DS_Store`, etc.).
- Añadido **`.env.example`** como plantilla de configuración.
- Se dejan de versionar los ficheros sensibles y generados (permanecen en disco):
  `.env`, `users.txt`, todo `.venv/` y los `.DS_Store`.

### Lote 2 — Correcciones de lógica económica

Todas en `app.py`:

- **Cupos de invitaciones (crítico):** antes no se validaba el cupo configurado del evento, de modo
  que se podían "regalar" más invitaciones de las disponibles. Ahora se valida el cupo **global del
  evento** (configurado − comprometido − solicitado − asignado) **antes de guardar** en las tres
  vías: alta interna de solicitudes (`invitation_request_create`), compromisos
  (`invitation_commitment_save`, devolviendo al pool las cantidades previas si se edita) y alta
  pública (`public_invitation_request_submit`, además de los límites propios del enlace). Si no hay
  cupo, se rechaza con un mensaje claro.
  - *Nota:* la validación es a nivel **global del evento** (no por categoría individual), que es lo
    que soporta el modelo de conteo actual.
  - De paso, el alta pública ahora aborta con 404 si el concierto asociado al enlace no existe
    (antes podía dar error 500).
- **Informe de ventas por evento (crítico):** la tabla de detalle por día/ticketera/tipo y el
  "bruto potencial" usaban `ConcertTicketType.price`, un campo **obsoleto que siempre vale 0**
  (el precio real vive en `TicketSaleDetail.unit_price_gross` y por ticketera/tipo). Resultado:
  precios y brutos aparecían a **0,00 €**. Corregido en la **vista HTML y en el PDF**
  (`sales_event_report_view` y `sales_event_report_pdf`): el detalle usa `unit_price_gross` y el
  potencial se calcula por tipo (aforo × precio efectivo derivado de las ventas).
- **Total de ingresos de canción (alto):** la pestaña de ingresos sumaba todas las filas, contando
  **doble** cuando coexistían una fila de semestre y sus meses. Ahora aplica el mismo criterio que
  el motor de royalties/liquidaciones: **si un semestre tiene fila de semestre, prevalece sobre sus
  meses**. Así el total cuadra con las liquidaciones.
- **Badge "Pagos pendientes" en Administración (alto):** la plantilla leía `totals.unpaid`, una clave
  que `_bag_totals()` **nunca calculaba** (siempre mostraba "Sin pagos pendientes"). Ahora
  `_bag_totals()` calcula `unpaid` = suma de (importe − pagado) de los gastos que asume la bolsa y
  no están pagados del todo.

### Lote 3 — Económicos que dependían de una decisión de negocio

- **Royalties "sobre beneficio" (PROFIT) — ocultado en la interfaz** (`templates/song_detail.html`,
  `album_detail.html`, `artist_detail.html`). Como esta base hoy calcula **igual que "neto"** (no
  descuenta costes), se retira de los formularios de royalties para no inducir a error. Los registros
  que ya tuvieran esa base **se conservan** (la opción sigue mostrándose, marcada "(en revisión)", si
  el registro ya la tiene) y se siguen calculando como hasta ahora; solo se impide **elegirla en altas
  nuevas**. ⚠️ El PROFIT de **conciertos** (cachés/cánones) **no se toca**: es funcionalidad válida.
- **Rebate fijo de ticketera — usa el IVA del concierto** (`app.py`, 3 puntos de cálculo). El neto del
  rebate fijo se calculaba siempre con IVA 21 % fijo (`/1.21`); ahora usa el **IVA configurado de cada
  concierto** (10 %, IGIC canario, etc.), igual que ya hacía el rebate por porcentaje.
- **División de un gasto entre bolsas (reparto manual) — ya no duplica dinero**
  (`app.py`, `bag_expense_cover`). Antes, en reparto no equitativo, el gasto origen conservaba su
  importe íntegro mientras se creaban los clones, inflando el total. Ahora se **valida que las partes
  asignadas a otras bolsas no superen** el importe del gasto (si lo superan, se rechaza con aviso) y el
  **resto permanece en la bolsa origen**, conservando el total exacto.
- **Pago parcial de gastos — sin cambios (decisión).** Se confirma el comportamiento actual: cada
  registro de pago **sustituye** al anterior (no se acumulan pagos parciales).

> **Verificación de cada lote:** tras los cambios el proyecto **compila** (`py_compile`), **no tiene
> nombres sin definir** (pyflakes) y **arranca** registrando las 344 rutas. Las 80 plantillas Jinja
> compilan sin errores.

### Rediseño de interfaz — Fase 1 (páginas visibles)

Dirección estética acordada: **"moderno con color de marca"**, manteniendo logos y colores
(#E33D48 / #007CA2) y **co-branding 33 Producciones + Pies Records**. Solo plantillas y CSS, sin
cambios de backend.

- **Nueva landing de presentación** (`templates/landing.html`): página independiente (ya no usa el
  layout del back office) con cabecera co-branded, hero con claim y panel visual, 6 áreas de trabajo
  en tarjetas, banda de acceso y pie. Los botones llevan al login. Responsive. Usa
  `BRAND_PRIMARY`/`BRAND_ACCENT` con valores por defecto de respaldo.
- **Login renovado** (`templates/login.html`): tarjeta centrada con co-branding y franja superior de
  marca. **Los campos del formulario (`email`, `password`, `next`) no cambian** → no afecta al login.
- **Refinamiento global** (`static/css/styles.css`, bloque "Refinamiento estético v2"): botones con
  hover y color de marca, tarjetas con bordes/sombras suaves, navbar refinada (ítem activo
  resaltado), dashboard (hero con degradado sutil, tiles e iconos con color de marca, métricas
  destacadas) y foco de formularios en color de marca. Se aplica de forma uniforme a toda la app.

### Rediseño del sistema de accesos del personal

Permisos por **sección → pestaña → funcionalidad**, cada uno con **Ver / Ver datos económicos /
Editar**. **No requiere migración**: usa las tablas existentes `user_access_resources` y
`user_access_grants`.

- **Coherencia garantizada** (`_coherent_grant_values` en `app.py`): editar ⟹ ver; ver económico ⟹
  ver; sin ver ⟹ nada; editar algo económico ⟹ poder verlo; el económico solo donde hay datos
  económicos. Los recursos **contenedor** (secciones/pestañas con hijos) derivan su acceso de sus
  hijos (el enforcement usa `include_descendants`), por lo que activar una sección es un **atajo**
  sobre sus pestañas y **las funcionalidades nuevas entran siempre desactivadas**.
- **Solo dirección (role 10)** ve y edita los accesos; dirección tiene **acceso total automático** y
  sus permisos no se configuran.
- **UI nueva** (`templates/personnel_detail.html`): tarjetas plegables por sección con interruptores
  de color (Ver / € / Editar), interruptor maestro por sección, contador de accesos, buscador,
  acciones rápidas y **coherencia en vivo** (JS).
- **Configuración en bloque** (`/personal/accesos-bloque`, endpoint `personnel_bulk_access`,
  `templates/personnel_bulk.html`): seleccionar varios trabajadores + secciones y aplicar una
  operación (solo ver / ver+editar / ver+económico / completo / quitar). Solo dirección; nunca
  modifica a usuarios de dirección.
- **Auto-actualización**: el sistema descubre las funcionalidades nuevas y las añade desactivadas
  para todos; la pantalla de bloque se excluye del catálogo (no es un permiso configurable).

> Nota: el catálogo arrastra algunas entradas auto-generadas heredadas del sistema previo; si en uso
> resultan redundantes, se pueden depurar en un pulido posterior (no afectan al funcionamiento).

### Rendimiento y experiencia de carga

Optimizaciones de **código** (sin migración):

- **Motor de BD** (`models.py`): pool con `pool_pre_ping`, `pool_recycle=280` y `keepalives` TCP →
  menos reconexiones y errores por conexiones caducadas del pooler/Supabase.
- **Índices automáticos en claves foráneas** (`ensure_performance_indexes`): crea, de forma
  idempotente y **en segundo plano al arrancar**, los índices que faltaban en columnas FK
  (≈60). Es la mejora de mayor impacto en los listados/JOINs (filtros por `concert_id`, `song_id`,
  `bag_id`, etc., que antes recorrían la tabla entera).
- **Registro de actividad en segundo plano** (`track_user_activity`): antes cada página hacía un
  `INSERT + commit` síncrono; ahora va en un hilo aparte y no suma latencia a la respuesta.
- **Indicador de carga global** (`layout.html` + `styles.css`): overlay con spinner de marca que
  aparece al navegar o enviar formularios (retardo de 150 ms para no parpadear en cargas
  instantáneas; se oculta al cargar la página o al volver atrás; excluye descargas y enlaces
  externos). Marca un formulario/enlace con `data-no-loader` / clase `no-loader` para excluirlo.

Configuración de **infraestructura** (a revisar en Render/Supabase):

1. **Supabase – usar el _connection pooler_** (no conexión directa). Project Settings → Database →
   *Connection pooling* → copiar la cadena del **Session pooler** y ponerla como `DATABASE_URL` en
   Render. La app actual conecta directa al puerto 5432; el pooler aguanta mucha más concurrencia.
2. **Misma región** Render ↔ Supabase (p. ej. ambos en Frankfurt/EU). Si están en continentes
   distintos, cada consulta cruza el Atlántico y multiplica el tiempo de carga.
3. **Render sin _spin-down_**: plan Starter/Standard (el Free duerme y la 1ª carga tarda ~30-60 s).
   Con más RAM, subir `WEB_CONCURRENCY` (workers) a 2-4.
4. (Opcional) **Compute add-on** en Supabase si la BD va justa de CPU/RAM.

### Rediseño de interfaz — Fase 2 (toda la web)

- **Estética global por CSS** (`static/css/styles.css`): se estilizan de forma unificada los
  componentes comunes de Bootstrap que usan todas las pantallas — **tablas** (cabeceras sutiles,
  filas con hover, líneas suaves), **pestañas** (`nav-tabs` con subrayado de marca), **listas**,
  **desplegables**, **formularios** (etiquetas y foco) y **badges**. Así toda la web adopta el
  estilo sin reescribir las ~76 plantillas una a una.
- **Limpieza de subtítulos descriptivos**: se eliminan los textos genéricos bajo los títulos de
  sección (p. ej. *"Control de pendientes, liquidaciones, pagos, cobros y embargos."*) que no
  aportan información. Se conservan las ayudas de formulario y los textos con datos.

### Mejoras de UX — alta rápida de entidades y logos en desplegables

- **Alta rápida en modal superpuesto**: junto a un desplegable de recinto/tercero/ticketera/editorial/
  artista, un botón "+" abre un modal superpuesto (`templates/_quick_create_modals.html`), crea la
  entidad vía `/api/<tipo>/create` y la deja **seleccionada sin recargar** ni perder el formulario
  (`static/js/quick_create.js`); gestiona duplicados. Para añadirlo a un select:
  `<button data-quick-create="TIPO" data-target="ID_DEL_SELECT">`.
- **Logos en los desplegables**: las opciones de los selects de entidad muestran el logo/foto junto
  al nombre (`initSelect2` + `data-photo`/`data-logo`). Activar en un select: añadir la clase
  `select-providers` / `select-venues` / `select-with-thumbs` / `select-artists` y
  `data-photo="{{ X.logo_url or X.photo_url }}"` a sus opciones.
- **Cambios de estado in-place (sin recargar)** (`static/js/ajax_inline.js`): un formulario de cambio
  de estado marcado con `data-inline` + `data-inline-target="#zonaId"` se envía por fetch y solo
  refresca esa zona (badge/estado), sin recargar ni mover el scroll. Los endpoints no cambian (siguen
  `POST`+redirect); si la zona no se localiza, recarga normal como red de seguridad.

### Limpieza — plantillas duplicadas eliminadas

- Se eliminan dos plantillas duplicadas heredadas (sufijo " 2" de copia accidental de macOS) que
  **no referenciaba nadie** (ni `render_template`, ni `{% include %}`, ni `{% extends %}`) y que eran
  además **versiones menos completas** que sus originales en uso:
  - `templates/discografica 2.html` (444 líneas) → se conserva `discografica.html` (1361 líneas,
    renderizada en `app.py`).
  - `templates/discografica_ingresos 2.html` (440 líneas) → se conserva `discografica_ingresos.html`
    (753 líneas, incluida desde `discografica.html`).
- Resultado: **80 plantillas** (antes 82). Sin cambios de backend; las 80 plantillas siguen parseando.

### Invitaciones — el selector de artista solo muestra artistas con actividad vigente

- En **Pedir invitaciones**, el paso "1. Selecciona artista" (tanto en el alta interna como en
  *Generar enlace de peticiones*) ya **no lista todos los artistas**: solo los que tienen al menos un
  concierto/festival/evento **vigente** para solicitudes de invitaciones — fecha **de hoy en adelante**
  o **aún sin fecha asignada (TBD)** — aplicando además la regla de las 5 h del módulo. Así no se ofrecen
  artistas cuyas actividades ya pasaron ni los que no tienen ninguna programada.
- Implementación (`app.py`): nuevo helper `_invitation_event_artist_options()`, que usa el **mismo
  criterio de vigencia que el listado de eventos** (`or_(Concert.date == None, Concert.date >= hoy)` +
  `_invitation_event_is_active_for_requests`). Se pasa a la plantilla como `event_artists` desde
  `invitations_view` e `invitation_event_detail`. Consulta solo las columnas necesarias (sin cargar los
  payloads JSONB pesados del concierto).
- El selector de "**invitado que es artista**" (paso "¿Para quién son?") **no** se filtra: ahí el
  artista es el destinatario de la invitación, no el del evento, así que se siguen mostrando todos.

### Seguridad — Lote 1 (endurecimiento base + contraseñas en claro)

Primer bloque de la fase de seguridad. Cambios de bajo riesgo que **no alteran el uso normal** de la
app pero cierran agujeros importantes. Quedan para lotes siguientes: CSRF, tokens de restablecimiento
de un solo uso, validación de subidas/SSRF y la retirada de `.env`/`users.txt` del repo + rotación de
credenciales (esto último lo haces tú al final).

**Endurecimiento base (S1)**

- **Clave de sesión sin valor por defecto inseguro** (`config.py`): se elimina el `"dev-secret"` que
  venía fijo. Si no hay `FLASK_SECRET_KEY`, se genera una aleatoria al arrancar. ⚠️ **En producción
  hay que fijar `FLASK_SECRET_KEY`**; si no, al reiniciar el servidor se invalidan todas las sesiones
  (los usuarios tendrían que volver a iniciar sesión).
- **Cookies de sesión más seguras** (`app.py`): `HttpOnly` + `SameSite=Lax` siempre (mitiga robo de
  cookie por XSS y CSRF cross-site). El flag `Secure` (cookie solo por HTTPS) se activa poniendo
  `SESSION_COOKIE_SECURE=1` — **recomendado en Render**; por defecto off para no romper el desarrollo
  local en `http`.
- **Open redirect en el login** (`app.py`): el parámetro `next` ahora pasa por `safe_next_or`, que
  solo admite rutas internas; un `next` que apunte a otro dominio cae a la home. Aplicado a los dos
  manejadores de login.
- **Host-header injection en enlaces de email** (`app.py`, `_external_url_for`): si se configura
  `EXTERNAL_BASE_URL`, los enlaces que salen por correo (restablecimiento, bienvenida) usan ese
  dominio fijo en vez de fiarse de la cabecera `Host` de la petición (que un atacante puede falsear).
- **Gestión de usuarios solo para dirección** (`app.py`): bloquear, desbloquear, eliminar, enviar
  recuperación y crear nueva contraseña ahora exigen rol **dirección** (role 10), no solo tener sesión.

**Contraseñas en texto plano (S3)**

- **Eliminado "Ver contraseña"**: se retira el botón, su modal/JS y el endpoint que devolvía la
  contraseña en claro por JSON.
- **La app ya no almacena contraseñas en claro** (`password_preview`): ni al crear usuario, ni en el
  login, ni al fijar/regenerar contraseña. La columna queda en el modelo marcada como deprecada y
  siempre vacía.
- **Borrado de las históricas**: al arrancar, un `UPDATE` idempotente pone a `NULL` cualquier
  contraseña en claro que quedara almacenada de antes.
- **"Crear nueva contraseña"** (regenerar) se mantiene, pero ya **no la guarda**: solo la muestra una
  vez en pantalla para comunicarla. La vía recomendada sigue siendo **"Enviar recuperación"** (enlace).

**Variables de entorno nuevas (Render → Environment):**

| Variable | Valor | Importancia |
|---|---|---|
| `FLASK_SECRET_KEY` | cadena larga aleatoria | **Obligatoria** en producción (si falta, las sesiones se pierden en cada reinicio) |
| `SESSION_COOKIE_SECURE` | `1` | Recomendada (sirves por HTTPS) |
| `EXTERNAL_BASE_URL` | `https://tu-dominio` | Recomendada (blinda los enlaces de email) |

### Invitaciones — menos clics en Pedir invitaciones (auto-avance de pasos)

- En el asistente de **Pedir invitaciones**, al pinchar una opción que **no requiere más datos** se
  **pasa automáticamente al siguiente paso** (sin pulsar "Siguiente"), para reducir clics:
  - Paso "**¿Para quién son?**": *Para mí* avanza directo; *Empleado* y *Artista* avanzan al elegir la
    persona/artista en el panel; *Tercero* se queda (hay que elegir el tercero y permite título/relación).
  - Paso "**Entrega**": *Enviar al invitado* / *Dejar en taquilla* / *Enviar a mí* avanzan directo;
    *Enviar a otro* se queda (hay que elegir el tercero receptor).
  - (Ya existía) elegir **artista** y elegir **evento** también auto-avanzan.
- Solo plantilla (`templates/invitaciones.html`, vía `goStep`/`getStep`); sin cambios de backend.
- **Revisados todos los formularios de alta**: el patrón solo encaja en el asistente de invitaciones.
  El **asistente de conciertos** (`_concert_wizard_modal.html`) y el **alta de medios**
  (`media_outlets.html`) tienen pasos **multicampo** (p. ej. tipo de actividad + modo, o tipo de medio +
  nombre/datos obligatorios), por lo que conservan el botón "Siguiente". Las altas rápidas
  (`_quick_create_modals.html`) y las de una sola pantalla no tienen pasos.

### Modales apilados — dar de alta una entidad sin salir del formulario (toda la app)

- **Problema**: al añadir una entidad (p. ej. un tercero) desde un formulario que ya estaba en un
  modal (Pedir invitaciones y otros), el modal de alta se abría pero el de debajo quedaba mal
  tapado y, al cerrarse, parecía que **"se cerraba el formulario en el que estabas"**. Es el problema
  clásico de **modales apilados de Bootstrap 5**: el 2º modal y su backdrop quedan al mismo z-index
  que el de debajo, y al cerrar el de arriba Bootstrap quita el bloqueo de scroll del `<body>`.
- **Solución global** (`static/js/modal_stack.js`, cargado en `layout.html`): cuando un modal se abre
  sobre otro ya abierto, se le sube el z-index (a él y a su backdrop) por encima del de debajo; y al
  cerrarlo, si aún queda algún modal abierto, se restaura el bloqueo de scroll. Afecta a **toda la
  app** sin tocar cada modal; los modales sueltos (el caso normal) no cambian de comportamiento.
- **Resultado**: el alta rápida de entidades (`_quick_create_modals.html` + `quick_create.js`) y el
  "Añadir tercero" de invitaciones —que ya creaban por AJAX y dejaban la entidad seleccionada— ahora
  **se superponen sin sacar al usuario de donde estaba**: al crear, queda seleccionada y se sigue en
  el mismo punto.
- **Revisado en toda la app**: todas las altas de entidad (recinto/tercero/ticketera/editorial/
  artista) crean por **AJAX y seleccionan el resultado**; no hay altas que naveguen y pierdan el
  formulario.

---

## 9. Pendientes y auditoría

Se ha realizado una auditoría completa (46 hallazgos). El detalle priorizado está en el informe de
auditoría adjunto. Resumen de lo que queda:

- **Seguridad (en curso):** ✅ Hecho en el *Lote 1 de seguridad* (ver registro de cambios):
  contraseñas en claro retiradas, cookies endurecidas, open-redirect y host-header cerrados, y gestión
  de usuarios restringida a dirección. ⏳ Pendiente: protección CSRF, tokens de restablecimiento de un
  solo uso, validación de subidas/SSRF, y rotación de credenciales + retirada de `.env`/`users.txt`
  del repositorio (esto último lo haces tú al final).
- **Lógica económica con decisión de negocio pendiente:** royalties "sobre beneficio" (PROFIT),
  acumulación de pagos parciales, IVA del *rebate* fijo, vistas de ventas especializadas.
- **Calidad:** eliminar código duplicado, unificar el sistema de permisos (hay restos de una versión
  antigua), migrar a Alembic. *(Plantillas duplicadas `* 2.html`: ya eliminadas — ver registro de
  cambios.)*

### Rotación de credenciales (recordatorio de seguridad)

El `.gitignore` evita **futuras** subidas, pero los secretos que ya estuvieron versionados
**siguen en el historial de git**. Para cerrarlo del todo:

1. En **Supabase** → rota la *service role key* y cambia la contraseña de la base de datos.
2. Genera una nueva `FLASK_SECRET_KEY` y actualízala en el `.env` local y en el panel de producción.
3. Cambia las contraseñas de los usuarios que estaban en `users.txt`.
4. (Opcional, recomendado) Purga el historial de git o crea un repositorio nuevo.
