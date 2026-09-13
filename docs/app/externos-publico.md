# Portal de externos y páginas públicas

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- UN POST PÚBLICO DEFINIDO DEBAJO DEL BUCLE DE EXENCIONES NO SE EXIMÍA DEL CSRF (bug
- Todo enlace que se comparte va con _external_url_for (host canónico), NUNCA con
- PORTAL DE EXTERNOS · los artistas y los terceros entran en /externos

---

- ⚠️⚠️⚠️ **UN POST PÚBLICO DEFINIDO DEBAJO DEL BUCLE DE EXENCIONES NO SE EXIMÍA DEL CSRF** (bug
  real, sep 2026). Las exenciones se aplican recorriendo `_CSRF_EXEMPT_ENDPOINTS` y buscando cada
  view function en `app.view_functions`… y ese bucle estaba **a mitad del fichero**, así que un
  endpoint definido MÁS ABAJO no llegaba a eximirse: su POST moría en un **302 a `/home`** con el
  flash de «sesión caducada», **sin ningún error en el log** — el mismo síntoma que ya documenta la
  guía para las pruebas sin `WTF_CSRF_ENABLED=False`.
  · Estaban rotos **la BAJA de publicidad de un comprador** (el «one-click» del cliente de correo,
  que además es lo que Gmail y el iPhone usan para ofrecerla) y el aviso de escucha de Syncro.
  · El bucle va ya **al FINAL de `app.py`**, cuando están registradas todas las rutas, con una **red
  de seguridad** que avisa en el log si un endpoint de la lista no existe.
  ⚠️ Comprobación (con el CSRF **activado**, que es como está en producción):
  `[ep for ep in _CSRF_EXEMPT_ENDPOINTS if "%s.%s" % (vf.__module__, vf.__name__) not in csrf._exempt_views]`
  tiene que salir **vacío** — hoy: 109 en la lista, 0 sin eximir.
  ⚠️ `PUBLIC_ENDPOINTS_EXTRA` y las listas `allowed` **no** tienen este problema: se miran en tiempo
  de ejecución, no al arrancar.

- ⚠️ **Todo enlace que se comparte va con `_external_url_for`** (host canónico), NUNCA con
  `url_for(..., _external=True)`: con el host de la petición los enlaces salían con el dominio antiguo
  de Render. Ya corregidos los de bolsa (`public_bag_invoice_upload`) y PRL (`public_prl_upload`).
- ⚠️⚠️⚠️ **PORTAL DE EXTERNOS · los artistas y los terceros entran en `/externos`** (sep 2026). Un
  artista, un promotor, un autor o un técnico entra en **su propio espacio** del back office: ve lo
  suyo, contesta lo que se le pide y actualiza sus documentos. **No puede editar nada más.**
  ⚠️⚠️⚠️ **HAY DOS VÍAS Y NO SE TOCAN ENTRE SÍ** (lo dejó dicho Dani, sep 2026):
  · **UN ENLACE QUE SE COMPARTE** (una hoja de ruta, unos carteles, una factura, una liquidación)
    **se abre SIN identificarse y solo se ve ESO**. Lo autoriza su TOKEN, no el portal.
  · **EL PORTAL** (`/externos`): entra con su correo o su teléfono y ve **TODO lo suyo**.
  Cerrar un tipo en «Acceso terceros» **cierra SOLO el portal**: los enlaces compartidos siguen
  abriéndose igual. Y abrir un enlace compartido **no mete a nadie en el portal** ni da acceso a la
  ficha de dentro. Amarrado en el apartado **11** de `tools/check_externos.py`.
  ⚠️ Por eso un enlace público NUNCA se mete por debajo del portal (ni se le exige `_ext_required`):
  lo compartido se comparte desde donde vive y se autoriza con su token, como siempre.
  ⚠️ La pantalla **lo DICE arriba del todo** (`.extp-vias` en `acceso_terceros.html`): el interruptor
  se leía como «cerrarle la puerta a los de fuera» y no es eso.
  · **CÓMO ENTRA**: escribe **su correo o su teléfono** —tienen que ser los que ya están en su ficha
  (`_ext_find_identity`, que mira el correo del tercero, sus `PromoterEmail`, su teléfono y sus
  `PromoterPhone`)— y le llega un **número de 6 cifras** que caduca en 10 minutos
  (`EXT_CODE_MINUTES`) con 6 intentos (`EXT_CODE_MAX_TRIES`). La sesión dura **24 horas**
  (`EXT_SESSION_HOURS`, atado a `PERMANENT_SESSION_LIFETIME` + `session.permanent = True`).
  ⚠️⚠️ **EL NÚMERO SE PONE SOLO EN EL MÓVIL**: el campo lleva `autocomplete="one-time-code"`, el SMS
  termina con la línea **`\n@dominio #123456`** (el formato **WebOTP**, que es lo que hace que iOS y
  Android lo ofrezcan) y la página lo pide además con `navigator.credentials.get({otp:…})`. Al
  completar la sexta cifra **se envía solo**: copiar y pegar no hace falta nunca.
  ⚠️ **FRENO por IP** (`EXT_RATE_LIMIT`, 12 por minuto): pedir un número manda un correo o un SMS, y
  eso cuesta dinero.
  ⚠️⚠️ **LA SESIÓN NO LLEVA `user_id`**: el enforcement de permisos (`_enforce_role_permissions_v2`)
  sale pronto si no hay usuario, así que **la ÚNICA puerta es el decorador `_ext_required`** y los
  once endpoints `externos_*` van en **`PUBLIC_ENDPOINTS_EXTRA`**. Nada de lo que se pinte ahí puede
  dar por hecho que hay una sesión de la casa.
  · **QUÉ ES CADA UNO SE CALCULA, no se marca** (`_ext_profiles`): **ARTISTA** (es integrante de un
  artista, `ArtistPerson.promoter_id`) · **PROMOTOR** (promueve alguna actividad) · **AUTOR** (tiene
  parte autoral de alguna obra) · **TERCERO** (está en el personal de alguna hoja de ruta). Quien es
  varias cosas **ve las de todas**. Dirección abre y cierra cada tipo entero desde su pantalla
  (`EXT_ACCESS_TYPES_SETTING`) y puede **bloquear a una persona** (`ExternalAccess.blocked`).
  · **LO QUE VE**: la misma banda de arriba (logo, campanita y su foto), **su calendario** —el
  componente de la agenda de la casa (`_agenda_build` + `_agenda_calendar.html`) filtrado a lo suyo,
  con sus festivos— y debajo **sus actividades**, cada una con su hoja de calendario, el tipo con su
  icono, el **estado**, si **se puede anunciar** y —solo si le toca ver ventas— la barra de
  «340 entradas vendidas de 1.000 · 34%». Al pinchar una se abre su **hoja de ruta** (el mismo
  `_roadmap_panel.html` en SOLO LECTURA) y su cartelería.
  ⚠️⚠️ **UN TERCERO NO VE VENTAS NI ECONOMÍA** (`_ext_sees_sales`: solo el artista de la actividad y
  quien la promueve). Un técnico ve **dónde se le ha incluido** y la hoja de ruta, y nada más.
  ⚠️ **LO QUE SE LE PIDE SE CALCULA, no hay tabla de avisos** (`_ext_tasks`, 10 fuentes: confirmar
  una actividad, actualizar las ventas, la ficha de contratación, la cartelería, su factura, un
  documento caducado, la PRL, una aprobación, la portada, las fotos, una playlist): si ya se ha
  contestado **por otra vía** —el correo, el SMS, una llamada— **desaparece sola**, que es la regla
  de `_notify_resolve` llevada al portal. Y el enlace de cada tarea es **el de siempre** (su aviso,
  su enlace público): no se inventa un segundo sitio para hacer lo mismo.
  · **SU FICHA Y SUS DOCUMENTOS**: el mismo panel que dentro (`_person_documents_panel.html` +
  `person_docs.js`), así que sube el DNI, el carnet o una tarjeta de fidelización con su escáner y
  su recorte. ⚠️ Solo puede tocar **los SUYOS** (se comprueba el dueño en el servidor).
  · **DIRECCIÓN lo ve en «Acceso terceros»** (`/acceso-terceros`, recurso `acceso_terceros`): una
  pestaña por tipo con **quién entra**, qué ve ese tipo, cuándo entró por última vez, el interruptor
  del tipo entero, el bloqueo por persona y **«Ver su portal»** (previsualización).
  ⚠️⚠️ **PREVISUALIZANDO NO SE GUARDA NADA** (`ext_preview` en la sesión): se ve tal cual, con su
  franja roja diciéndolo, y cualquier POST del portal responde **403**.
  ⚠️⚠️ **`Concert.artist_ids` y `Promotion.artist_ids` son JSONB**, no arrays: `&&` revienta con
  «operator does not exist: jsonb && uuid[]» y —lo peor— **deja la transacción ABORTADA**, así que
  se cae la pantalla ENTERA. Se usa `@>` (contención) o **`jsonb_exists_any(col, CAST(:ids AS
  text[]))`**, y TODOS los `except` del bloque hacen `session_db.rollback()`.
  ⚠️ `Promotion` **no tiene `artist_id`** (es `artist_ids`), y el calendario enlaza una promoción de
  PRENSA con `promo_detail_view` y una de MARKETING con `promotion_detail_view`: son dos endpoints.
  ⚠️⚠️ **`to_uuid` REVIENTA con un id que no es un UUID**: en un portal público la URL la escribe
  cualquiera, así que todo el bloque usa **`_safe_uuid`** (404, no 500).
  ⚠️⚠️ **UN `{% import %}` PISA UNA VARIABLE DEL CONTEXTO**: `{% import '_agenda_calendar.html' as
  agenda %}` se llevó por delante la `agenda` del contexto y el calendario salía **VACÍO** con la
  ventana en «1900» (bug real). La del portal se llama **`EXT_AGENDA`**.
  ⚠️ Los botones de **exportar y compartir** de la hoja de ruta se ocultan en solo lectura
  (`var exportBtns = RO ? '' : …`): sus endpoints exigen sesión de la casa y darían un 403.
  ⚠️⚠️ **DOS PERSONAS DISTINTAS CON EL MISMO TELÉFONO NO ENTRAN**: `_ext_same_person` compara nombre
  y DNI y, si no son la misma, **no se deja pasar a ninguna** y queda en el log. Si son varias fichas
  de la MISMA persona (lo normal: su ficha de tercero y la de integrante), se entra con **todas a la
  vez** (`_ext_group_identity`), así que ve lo suyo junto.
  ⚠️ El teléfono se busca con **LIKE en SQL** y se confirma con `_norm_phone_key`: traerse cuatro mil
  fichas a Python para compararlas una a una tardaba segundos en cada intento.
  · **PRUEBA DE REGRESIÓN: `/tmp/python/bin/python3 tools/check_externos.py`** (65 comprobaciones
  con la app real: cómo entra, lo que ve cada tipo, que **no se cuela en el back office**, que solo
  ve lo suyo, que lo que se le pide desaparece al contestarlo por otro lado, sus documentos, la
  sesión de 24 h, la pantalla de dirección y **que las dos vías son independientes**). Es
  **idempotente**. Al tocar el portal, en verde.
  ⚠️ La prueba limpia el freno por IP entre entradas (`A._EXT_RATE.clear()`): trece entradas seguidas
  desde `127.0.0.1` lo disparan, que es justo lo que tiene que hacer — el freno se comprueba aparte.

