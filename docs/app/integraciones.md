# Integraciones externas, cron y despliegue

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- artists.name es UNIQUE: un nombre repetido se dice, no se suelta el error de Postgres
- Alta rápida de entidades (modal superpuesto): templates/_quick_create_modals.html +
- Modales apilados (static/js/modal_stack.js): un modal abierto desde dentro de otro se
- SUBIDA A STORAGE · cannot access local variable 'response' (bug real, ago 2026). Subiendo
- LOS ÚLTIMOS ERRORES DEL SERVIDOR SE VEN: un 500 se enseña como «cerrado por
- UN SOLO CRON PARA TODA LA APP. Había DOCE tareas programadas distintas,

---

- ⚠️ **`artists.name` es UNIQUE: un nombre repetido se dice, no se suelta el error de Postgres**
  (ago 2026). Crear un artista que ya existía devolvía en pantalla el `UniqueViolation` en crudo
  («duplicate key value violates unique constraint…»), que no se entiende. Ahora el alta comprueba
  antes con el punto único **`_artist_by_name`** —que compara **sin acentos ni mayúsculas**
  (`_norm_text_key`), porque «India Martinez» e «India Martínez» chocan igual contra el índice— y
  avisa con **el enlace a su ficha**.
  ⚠️ El aviso explica además por qué no se veía en la lista: **`/artistas` solo enseña por defecto
  los que tienen ACTIVIDAD** (`_active_artist_ids`), así que un artista antiguo está pero no sale
  hasta pulsar «Ver todos» — que es justo lo que lleva a intentar crearlo otra vez. El redirect va
  ya con `show_inactive=1`.
  ⚠️ Se conserva un `except IntegrityError` como red de seguridad (dos personas creándolo a la vez),
  y el alta ya no acepta un nombre vacío.

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

- **LOS ÚLTIMOS ERRORES DEL SERVIDOR SE VEN** (ago 2026): un 500 se enseña como «cerrado por
  mantenimiento», así que sin esto la única pista es el log del servidor, al que no siempre se puede
  llegar. `_remember_last_error` guarda los últimos 20 (**en memoria del proceso**: si lo que falla es
  la BD, escribir allí volvería a fallar; cada worker guarda los suyos) con la ruta, el endpoint,
  quién, el tipo de error, el mensaje y la traza, y **dirección** los ve al final de
  **«Configurar notificaciones»**.

- ⚠️⚠️⚠️ **UN SOLO CRON PARA TODA LA APP** (sep 2026). Había **DOCE** tareas programadas distintas,
  con cuatro claves y cada una con su cadencia: una automatización nueva obligaba a dar de alta otro
  cron en el servidor y, si a alguien se le olvidaba, **ese aviso no salía nunca y nadie se
  enteraba**. Ahora el servidor solo le pega **CADA MINUTO** a UNA dirección:

      https://app.33producciones.es/cron?key=<APP_CRON_KEY>

  …y **la app decide** qué le toca a cada cosa. **UNA AUTOMATIZACIÓN NUEVA SE AÑADE A `CRON_TASKS`
  Y EMPIEZA A CORRER SOLA**: no hay que tocar el servidor nunca más.
  · **EL REGISTRO** (`CRON_TASKS`, al final de `app.py`): `key` (clave estable, es con la que se
  apunta cuándo corrió) · `label` · **`every`** (cada cuántos minutos) · **`at_hour`** (si es diaria,
  a partir de qué hora de España, una vez al día) · **`fn`** (el NOMBRE de la función, que se
  resuelve en `globals()` al ejecutar: así el registro vive al final sin importar dónde esté
  definida) o **`run`** (un envoltorio ya hecho: `_cron_session_task` abre y cierra la sesión,
  `_cron_thread_task` lanza en 2º plano lo que tarda, con su `guard` de «está configurada»).
  · **EL LATIDO** (`_cron_tick`): **cerrojo** entre workers (`_pleo_pg_lock`, mejor no hacer nada que
  mandar dos veces el mismo aviso) · **presupuesto de 50 s** (el latido es de un minuto: lo que no
  cabe queda para la siguiente) · y empieza por **lo que más retraso lleva RELATIVO a su cadencia**
  (si no, una de cada minuto no adelantaría nunca a una diaria). Lo que pasa se apunta en
  `AppSetting` (`cron_state_v1`).
  ⚠️ **Si una tarea FALLA se reintenta a los `CRON_RETRY_MINUTES` (15)** aunque sea diaria: un fallo
  a las 8:00 dejaría ese aviso sin salir hasta el día siguiente.
  · **LAS RUTAS VIEJAS SE CONSERVAN** (`/cron/documentos-caducados`, `/cron/pleo/refresh`…): cada una
  fuerza SU tarea **y corre lo que le toque al resto**, así que lo que ya esté configurado en el
  servidor mantiene TODA la app al día mientras se cambia.
  · **SE VE SI LATE**: Integraciones → **Automatizaciones** (`_cron_status_context`): si está
  latiendo, cuándo fue la última vez, la cadencia de cada una, qué hizo, sus errores y un botón para
  ejecutarla ahora (`cron_run_now`, solo dirección). ⚠️ Sin latido **NO sale ningún aviso
  automático** y en la app no se nota hasta que alguien echa de menos uno: por eso lo primero que
  dice la pantalla es si el servidor le está pegando.
  ⚠️ La clave es **`APP_CRON_KEY`**; se aceptan también las de siempre (`DOCS_CRON_KEY`,
  `PLEO_CRON_KEY`…) para no romper lo que ya está puesto. `cron_tick` va en las listas de PÚBLICOS
  (lo autoriza su `?key=`), y `cron_run_now` se mapea a `integraciones`.
  ⚠️ `?tarea=<clave>` corre solo esa y `?forzar=1` se salta la cadencia (para probar una ahora).

