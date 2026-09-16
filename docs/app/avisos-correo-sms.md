# Avisos, correo y SMS

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- EL BUZÓN DE UNA PERSONA DE LA CASA: cada uno manda desde su correo (MailAccount.user_id)
- LOS ICONOS DE UNA COMUNICACIÓN: los sólidos de la casa, nunca emojis
- LA FECHA DE UNA COMUNICACIÓN LLEVA SU DÍA DE LA SEMANA

- AVISOS · un aviso de algo YA resuelto se cierra solo (_notify_resolve, ago 2026): un aviso es
- UN AVISO SE VE EN UN POP-UP, no navegando a otra pantalla
- CÓMO SE AVISA DE CADA COSA: app · correo · SMS, y lo configura DIRECCIÓN.
- AVISOS · franjas bajo el menú y campana al principio
- EL CORREO DE UN TERCERO ES contact_email, NO email (bug real, ago 2026). En
- LAS FRANJAS DE AVISO SE PINTAN EN EL HTML, NO LAS METE EL JS (sep 2026, bug real
- UN BOTÓN QUE DECIDE TIENE QUE VERSE QUE SE HA PULSADO (bug real, ago 2026). En el aviso
- ICONOS DE LA CASA EN UN CORREO: NADA DE EMOJIS. En un correo no se puede usar
- UN AVISO SE CIERRA SOLO CUANDO LO SUYO YA ESTÁ HECHO. Un aviso dice «esto te está
- CÓMO SE AVISA A CADA UNO · correo o SMS. Regla
- CORREO · por qué los avisos acababan en SPAM. Lo que decide que un correo llegue NO
- ENLACES CORTOS · en los SMS se acortan solos
- AVISOS cuando te asignan algo (AppNotification + ensure_notifications_schema, ago 2026)
- MIS AVISOS se lee IGUAL que MIS TAREAS PENDIENTES: el módulo de
- CORREO · CUENTAS DE ENVÍO PROPIAS (promocion@ desde SU buzón) y el hueco en blanco de Integraci
- CUENTAS DE ENVÍO · el catálogo de las que la app ESPERA (sep 2026,

---

- ⚠️⚠️ **EL BUZÓN DE UNA PERSONA DE LA CASA** (sep 2026, `MailAccount.user_id`): en Integraciones →
  Correo, una cuenta se puede asignar a **alguien de la oficina**, y lo que se escribe de tú a tú
  —hoy, la **presentación de un tema a una emisora**— sale **desde su dirección**, porque quien lo
  recibe le contesta a esa persona. Punto único **`_user_mail_account`** (activa y **con
  contraseña**: sin credenciales no se puede decir que sale desde su correo) y
  **`_radio_sender_options`**, que ofrece la salida por **Promoción** a quien no tiene la suya —y
  lo avisa en la pantalla, ANTES de mandar—. ⚠️ Una persona, UNA cuenta: al asignarla se le suelta
  la anterior. El envío, en `docs/app/promocion-prensa.md`.

## LA FECHA DE UNA COMUNICACIÓN LLEVA SU DÍA DE LA SEMANA

⚠️⚠️ **«Lunes 11 de Abril de 2026», no «11/04/2026»** (sep 2026, lo pidió Dani: «en la cabecera, en
la fecha, pon el día de la semana que es… en todas las comunicaciones, artistas, terceros y demás
externos, y en el envío de invitaciones en todo»). Quien recibe la comunicación lo primero que mira
es **qué día cae**, y una fecha en números no se lo dice: obliga a ir al calendario.

**Punto único `format_date_long_es(valor)`**, que además es el filtro **`|fecha_larga`** de las
plantillas. Admite `date`, `datetime` y texto ISO, y lo que no sepa leer lo devuelve tal cual (una
fecha rara es mejor que perder el correo por formatear).

Por dónde entra —todo son puntos únicos que ya existían, así que no hay dos formatos sueltos—:

| dónde | qué lo pinta |
|---|---|
| la **cabecera de la actividad**: ficha, aviso al artista, formulario del promotor, hoja de ruta (tarjeta y PDF/Excel) | `_contract_sheet_hero_rows` (Fecha · Hasta · Salida a la venta · Anuncio) |
| los **correos de una actividad** (cartelería, Sold Out, lo que se le manda a un tercero) | `_concert_email_header_html` |
| **las invitaciones, TODAS** (la pantalla, los correos, los PDF, la lista de invitados, las páginas públicas) | `_invitation_display_date` → `_invitation_event_payload` |
| las **páginas públicas que se comparten** por WhatsApp/SMS | `_public_share_card` |
| el aviso de **salida a la venta** | `_sale_notice_context` |
| las **páginas públicas** con cabecera de actividad (subir factura, PRL, canales de venta, cartelería) y la bandeja de **externos** | el filtro `|fecha_larga` |
| los **plazos** que se le dan a alguien de fuera (entrega de cartelería y de creatividades) | el filtro `|fecha_larga` |

⚠️ El **texto del SMS y del «compartir»** (`_activity_notice_share_text`) sale de esa misma cabecera,
así que también lleva el día de la semana: son ~14 caracteres más, y es justo el dato que se mira.
⚠️ **El ASUNTO de un correo NO** (`_concert_title_for_notice`): ahí manda que se lea entero en la
bandeja, y el día de la semana está dentro, en la cabecera.
⚠️ **En minúscula cuando va DENTRO de una frase** («…del lunes 3 de junio de 2026 todavía no se ha
anunciado»): eso es `_long_date_es` / `_vacation_long_date`, que ahora salen de **las mismas listas
de nombres** (`MONTHS_ES` / `WEEKDAYS_ES`). Estaban duplicadas palabra por palabra.

---

## LOS ICONOS DE UNA COMUNICACIÓN: los sólidos de la casa, nunca emojis

⚠️⚠️ **NADA DE EMOJIS** (sep 2026, lo pidió Dani). Durante un tiempo los avisos usaron emojis
porque en un cliente de correo la fuente de iconos no carga y `<i class="fa …">` sale VACÍO. El
problema es que **un emoji lo pinta cada sistema a su manera y con sus colores**: ni es el icono de
la casa ni se parece a lo que se ve en la app.

**Punto único `_brand_icon(nombre, *, email, size, color)`** (antes se llamaba `_sync_icon` y solo
lo usaba Syncros, que ya lo hacía bien):
· en la **web**, `<i class="fa-solid …">` en el color que se pida;
· en un **correo**, el MISMO icono como **PNG** (`brand_icon_png`, que lo renderiza de
`fa-solid-900.ttf` en ese color). Así el icono es idéntico en la app, en el correo y en la página
pública.
⚠️⚠️ El `<img>` lleva **`max-width:none`**: con el `img{max-width:100%}` de la app, dentro de una
celda estrecha el ancho computado salía **0 px** y el icono no se veía (bug real: se arregló
mirando `getBoundingClientRect().width`, que daba 0 con la imagen bien cargada).

**Cómo se lee una comunicación** (`_activity_notice_html`, el motor de los tres canales):
· los datos de la actividad, **solo con su icono y sin el nombre del concepto** —como en la ficha de
la app—; el nombre se conserva en el `title` para quien pase el ratón;
· **cada módulo**, con su cabecera de **fondo azul suave** (`BRAND_BLUE_SOFT`) y las letras y el
icono en el **azul corporativo oscuro** (`BRAND_BLUE_DARK`), para que todos se lean igual.


- **AVISOS · un aviso de algo YA resuelto se cierra solo** (`_notify_resolve`, ago 2026): un aviso es
  «esto te está esperando»; cuando deja de estarlo tiene que desaparecer sin que nadie lo pinche.
  Enganchado a las REMESAS (al aprobarlas del todo, al anularlas y al subir el justificante) y, como
  red de seguridad para los que ya quedaron colgados, al abrir la pantalla de una remesa ya aprobada
  o pagada — que es justo cuando uno descubre que ya estaba todo hecho (bug real: «remesa pendiente
  de aprobación» de una remesa aprobada y pagada).

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

- ⚠️⚠️ **CÓMO SE AVISA DE CADA COSA: app · correo · SMS, y lo configura DIRECCIÓN** (ago 2026).
  Un aviso puede salir por tres sitios y **no todos valen para todo**: la campanita es gratis, el
  correo llega a quien no ha abierto la app y el SMS cuesta dinero.
  · **REGLA DE LA CASA: por CORREO solo se avisa cuando te ASIGNAN algo o te ENTRA por primera
  vez.** Lo que cambie después (que sigue pendiente, que alguien ha contestado) se ve en la app.
  Lo garantiza **`AppNotification.email_sent_at`** (columna nueva) + `_notice_email_already_sent`:
  si ya salió un correo para esa persona y esa REFERENCIA (`ref_type`+`ref_id`), no se manda otro.
  ⚠️ Por eso un aviso que quiera correo tiene que llevar **su `ref_type`/`ref_id`**: sin ellos la
  comparación cae al título y dos trabajos distintos con el mismo título se pisarían.
  · **La configuración es de DIRECCIÓN**, en su menú personal → **«Configurar notificaciones»**
  (`notification_settings_view` / `_save`, `templates/notificaciones_config.html`): **todos** los
  tipos de aviso de la app (`_notice_kind_catalog`, sacado de `NOTIFICATION_KIND_META` + el texto
  de `NOTIFICATION_KIND_HELP`) con sus TRES interruptores. Así lo que hoy está encendido se apaga
  y al revés, sin tocar código. Los dos endpoints van en **`_access_exempt_endpoints`** (son de
  dirección por naturaleza, como el modo trabajo).
  · **De fábrica**: por la app TODO; por correo solo **PRODUCCION · DISENO · VACACIONES ·
  ADMIN_BOLSA** (`NOTICE_EMAIL_DEFAULT_KINDS`, que es la regla de arriba); por SMS nada.
  ⚠️⚠️ **El SMS no tiene dos verdades**: su columna escribe en **`SmsAccount.notice_kinds`**, que
  es lo que ya lee `_sms_notice_enabled` y lo que enseña Integraciones → SMS. La app y el correo
  viven en un `AppSetting` (`notification_channels_v1`). Punto único `_notice_channels_map`
  (cacheado en `g`).
  · **Todo pasa por `_notify_user`**, que gana el parámetro **`email=`**: un diccionario con el
  CONTENIDO del correo, **`None`** para que se componga uno genérico con el título y el enlace del
  propio aviso (así encender un interruptor sirve de algo en cualquier tipo), o **`False`** para
  que ESE aviso no salga por correo aunque el canal esté encendido.
  ⚠️ Si el canal «en la app» está apagado, el aviso **no se ve** (nace con `read_at` y
  `strip_dismissed_at` puestos) pero **la fila se guarda igual**: es donde se apunta si ya salió su
  correo.
  · **EL CORREO ES UNO SOLO**: `_notice_email_html` — logo de la empresa del grupo arriba a la
  **DERECHA**, el título centrado, la **cabecera de lo que sea** (su foto o su portada, qué es, su
  nombre y sus datos con iconos) y, **dentro de la cabecera y abajo a la derecha, el BOTÓN**;
  debajo, las secciones que hagan falta. Constructores por familia:
  **`_notice_email_activity`** (usa `_contract_sheet_hero_rows`, la misma cabecera de la ficha) ·
  **`_notice_email_project`** · **`_notice_email_promotion`** · **`_notice_email_bag`** ·
  **`_notice_email_vacation_request`** · **`_notice_email_design_artwork`** /
  **`_notice_email_design_creatives`**.
  ⚠️ En un correo NO se puede usar la fuente de iconos: van como PNG por `brand_icon_png`
  (`_sync_icon(..., email=True)`), y **`_notice_icon_img` lo protege**: `url_for` revienta fuera de
  una petición (un cron, un hilo) y sin eso se perdería el correo entero por un icono.
  ⚠️ Los iconos de **MARCA** (`fa-youtube`…) no existen en la familia SOLID, que es la que se
  dibuja para el correo: saldrían VACÍOS. `_notice_design_icon` los cambia por el sólido de su tipo.
  · **QUÉ SE AVISA POR CORREO HOY**:
    · **PRODUCCIÓN ASIGNADA** — título **«Encargo de producción»**, asunto **«Nuevo \<tipo\> de
      \<artista\> asignado para producción»** (`_production_notice_subject`, que **concuerda en
      género**) y botón **«Comenzar producción»**. Cableado en la ficha de la actividad
      (`concert_production_owner_save`), el alta con logística del asistente, la **logística de un
      proyecto** discográfico, la del **rodaje del videoclip**, la del **colaborador** y la
      **promoción** (`_promo_production_request_sync`, que además **no avisaba de nada**: ahora
      avisa, y solo cuando CAMBIA de persona).
    · **VACACIONES** — a quien las gestiona. ⚠️ **Un DÍA LIBRE no manda correo** (se ve en la app),
      y el correo va **solo a quien las gestiona** (`_vacation_email_manager_ids`: la
      responsabilidad `VACACIONES` o, si no la tiene nadie, Administración): **dirección lo ve en
      su campanita pero no recibe correo** — por eso el aviso se manda persona a persona con
      `email=False` para los demás.
    · **BOLSAS** — «Bolsa pendiente de liquidar» a quien liquida (responsabilidad `LIQUIDACIONES` /
      `LIQUIDACIONES_PROMO`) y «Falta que cierres la bolsa» en el doble cierre.
    · **DISEÑO** — debajo de la cabecera, **«Contenido solicitado»** centrado y el listado con el
      **icono** de cada pieza, su **tamaño o proporción** y su **fecha máxima**, con el botón
      **«Gestionar entregas»**. En la cartelería de una actividad y en las creatividades de un
      proyecto.
  ⚠️ La responsabilidad de administración **ya se asignaba** en la ficha de personal
  (`ADMIN_RESPONSIBILITIES`, con centinela `responsibilities_present`): esto solo la usa.
  ⚠️ Se manda **un correo por persona** (`_send_optional_email` por destinatario), no uno con todos
  en el «Para». Con un departamento de 3-5 personas es asumible; si un día se avisa a decenas, hay
  que agrupar.

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

- ⚠️⚠️ **EL CORREO DE UN TERCERO ES `contact_email`, NO `email`** (bug real, ago 2026). En
  `Promoter` los campos son **`contact_email`** y **`contact_phone`**: `p.email` y `p.phone` **no
  existen**, así que un `getattr(p, "email", "")` devuelve siempre `""` y el aviso **no le llega a
  nadie sin dar ningún error** (pasó con el plazo de entrega al productor, con la solicitud de portada
  al tercero y con los correos de los integrantes). Punto único **`_promoter_email_phone(promoter)`**
  → `(correo, teléfono)`: usarlo SIEMPRE, nunca leer los campos a mano.

- ⚠️⚠️ **LAS FRANJAS DE AVISO SE PINTAN EN EL HTML, NO LAS METE EL JS** (sep 2026, bug real: «al
  entrar, Inicio carga sin las notificaciones y es como que vuelve a cargar todo con ellas»). El
  contenedor `#notifBar` llegaba VACÍO y `notificaciones.js` pedía `/avisos?nuevos=1` **después de
  cargar la página**: al llegar la respuesta, la franja empujaba todo el contenido hacia abajo y
  parecía que la pantalla se recargaba sola (y la campanita aparecía de golpe un segundo después).
  · Puntos únicos nuevos: **`_notification_strip_rows`** (las franjas de una persona) y
  **`_notification_strip_html`** (el HTML de UNA franja), que usan **`layout.html`** —vía el
  contexto `NOTIF_STRIPS` / `NOTIF_UNREAD` de `inject_notification_bar`— **y** el endpoint
  `/avisos?nuevos=1`, que devuelve ese mismo HTML en `html`. Así no hay dos versiones del markup:
  el JS solo lo inserta.
  · El JS ya **no pide nada al cargar**: se apunta las que ya están pintadas (del
  `<script data-notif-strips>`) para no repetirlas y para poder abrir su pop-up, y deja el repaso de
  cada 60 s. Los clics de una franja van por **DELEGACIÓN** (las que trae la página nunca pasan por
  `franja()`, así que no se les puede pegar un listener al crearlas).
  ⚠️ El contexto es *best-effort* y va cacheado en `g`: si algo falla, la página se pinta igual y el
  JS las trae como siempre. Y se protege de `session` fuera de una petición (un cron, un hilo).
  ⚠️ La franja nace con **`is-in`** (sin la animación de entrada): animar lo que ya está en el HTML
  sería volver a provocar el salto que se quería quitar.

- ⚠️⚠️ **UN BOTÓN QUE DECIDE TIENE QUE VERSE QUE SE HA PULSADO** (bug real, ago 2026). En el aviso
  de canción duplicada, **«Usar esta» no hacía NADA a la vista**: guardaba la elección en su oculto
  y rehabilitaba el envío, pero el botón ya era `btn-primary` y se quedaba `btn-primary`, el
  asistente no avanzaba y no aparecía ninguna confirmación. Para quien lo pulsa, eso es «se ha
  quedado enganchado». Ahora (`static/js/song_duplicates.js`):
  · el botón nace **sin rellenar** (`btn-outline-primary`) y al elegirlo pasa a **verde «Usando
    esta»**, con su fila marcada, y sale la etiqueta **«Se trabajará sobre esta canción · No se
    creará otra»** (o «Se creará una canción nueva» si se marca lo otro);
  · **el asistente AVANZA solo** al elegir —es una decisión que no pide más datos, el mismo criterio
    que `data-sw-advance`—, pulsando su propio botón «Siguiente» (así se valida el paso y se saltan
    los pasos que no tocan; saltar a un índice a mano se salta las dos cosas).
  ⚠️⚠️ Y el botón de enviar **ya NO se deshabilita**: en un asistente por pasos el aviso está en OTRO
  paso, así que un botón muerto no se puede explicar — y, peor, **un botón deshabilitado no dispara
  `submit`**, así que el guardián que lleva al paso del aviso no llegaba a ejecutarse nunca. El freno
  es ese guardián, que además ahora **dice por qué** («Antes decide qué hacer con la canción que ya
  existe») y hace destellar el aviso (`.dup-flash`).
  ⚠️ Quitar el `disabled` no abre ningún agujero: **el freno de verdad está en el SERVIDOR**
  (`disco_project_create` y `discografica_song_create` con `duplicate_ok`/`existing_song_id`).
  Comprobado con la app real: sin decidir no crea nada y avisa · «Usar esta» monta el proyecto sobre
  la canción que ya estaba (0 canciones nuevas) · «crear una nueva» crea la segunda.

- ⚠️⚠️ **ICONOS DE LA CASA EN UN CORREO: NADA DE EMOJIS** (ago 2026). En un correo no se puede usar
  la fuente de iconos (ningún cliente carga Font Awesome), y por eso se habían colado emojis. Punto
  único **`_sync_icon(nombre, email=…)`**: en la WEB emite `<i class="fa-solid …">` de siempre y en
  el CORREO **el MISMO icono como PNG**, renderizado desde `fa-solid-900.ttf` con Pillow y servido
  por **`brand_icon_png`** (`/icono/<nombre>.png?c=007CA2&s=32`, cacheado en memoria y con
  `Cache-Control`). Los codepoints se leen UNA vez del propio `all.min.css` (`_fa_codepoints`).
  ⚠️ Los iconos van en el **AZUL de la marca** (`#007CA2`), que es «el verde corporativo» de la casa
  — no hay ningún verde: el de Bootstrap es el de «aprobado».
  ⚠️ Un icono que no exista en esta versión de FA sale vacío: comprobarlo en `all.min.css` antes
  (`fa-guitar-electric` y `fa-saxophone`, por ejemplo, NO existen).

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

- **MIS AVISOS se lee IGUAL que MIS TAREAS PENDIENTES** (sep 2026, lo pidió Dani): el módulo de
  Inicio usa las MISMAS clases `.mytask*` —la misma tarjeta, la etiqueta de qué es en el azul de la
  marca con su icono, los datos con icono debajo, la pastilla de estado y el botón sin rellenar a la
  derecha—. Un aviso es «esto te está esperando», igual que una tarea, así que se lee igual.
  · La pastilla dice **«Sin leer»** (el amarillo de «pendiente») y el botón, **«Ver el aviso»**.
  ⚠️ **La CARA de quien lo provoca va REDONDA** (`.mytask__art--round`): el cuadrado es de una
  portada o un cartel — la regla de la casa. Sin foto, el icono de su tipo.
  ⚠️ **El TÍTULO de un aviso NO se trunca**: es una frase, no el nombre de una ficha (en una tarea sí
  se recorta con «…»).
  ⚠️ **No navega**: el clic —en cualquier sitio, botón incluido— abre el POP-UP del aviso. Lo hace
  `notificaciones.js` por DELEGACIÓN sobre `[data-notif-item]` **sin excluir botones**, así que el
  `<button>` de dentro vale y se conserva la accesibilidad de teclado.
  ⚠️ La tarjeta perdió el `border-danger`: los dos módulos se ven ya idénticos.

- ⚠️⚠️ **CORREO · CUENTAS DE ENVÍO PROPIAS (promocion@ desde SU buzón) y el hueco en blanco de Integraciones**
  (sep 2026). Dani tiene el correo en un hosting (webmail.es), no en Google ni Microsoft, así que el
  SMTP de la app no puede «mandar como» promocion@: las notas de prensa salían con el remitente de
  la app y Reply-To a promocion@ (el respaldo). Ahora hay **CUENTAS DE ENVÍO** en **Integraciones →
  Correo** (`MailAccount`, tabla `mail_accounts`, `ensure_mail_accounts_schema`): la dirección, el
  servidor de salida, puerto y cifrado (SSL 465 / STARTTLS 587 / sin cifrar), el usuario y la
  **contraseña del propio buzón** (se guarda para conectar y **no se enseña nunca**), a dónde van las
  respuestas, el **ritmo** (respiro entre correos · conexión nueva cada N · **tope por hora**, 0 = sin
  tope) y el selector DKIM para poder comprobarlo. Endpoints `mail_account_save/_delete/_test/_dns`
  (dirección, sección `integraciones`), todo dentro de la zona `#correoZone` (data-inline).
  · **`_send_optional_email` lo resuelve SOLO**: si el `from_email` pedido es el de una cuenta ACTIVA
  (`_mail_account_for_email`), el correo sale POR ELLA con sus credenciales (`_smtp_open`), alineado
  con su dominio, y sin ningún «mandar como» que pueda fallar; también acepta `account=`, `pace_ms=`
  y `reconnect_every=`. Con cuenta propia, sin Reply-To a quien pulsa el botón: las respuestas van al
  buzón (o a lo que diga la cuenta). Los errores de SMTP se traducen para una persona
  (`_smtp_error_text`: usuario/contraseña · servidor que no existe · cifrado equivocado para ese puerto).
  · **«Probar conexión»** entra en el servidor sin mandar nada; **«Enviar prueba desde aquí»** manda un
  correo DESDE la cuenta; **«Comprobar los DNS»** (`_mail_dns_check`, por DNS-sobre-HTTPS con Google
  y Cloudflare —`_dns_txt_records`—, sin dependencias) dice si el SPF nombra al servidor de salida
  (`_spf_authorizes_host`), si hay DMARC y con qué política, y si la clave DKIM del selector está
  publicada. «No se pudo consultar» NO es «no hay». La pestaña trae la **guía paso a paso** para
  dejar promocion@ mandando desde el hosting, y el alta sale **ya rellena** con promocion@ mientras
  no exista.
  · **NOTAS DE PRENSA**: los remitentes salen de `_press_sender_options` (Back office · «Promoción»
  · cada otra cuenta activa como `ACCOUNT:<id>`); «Promoción» sale **por su cuenta** si está dada de
  alta y, si no, con su aviso (saldrá con el remitente de la app). `_press_sender_for` devuelve la
  `account`; `_press_sender_key_norm` normaliza la clave (el uuid en minúsculas, o el tope por hora
  no casaría). `PRESS_SENDER_KINDS` se retiró.
  ⚠️⚠️ **EL ENVÍO GRANDE VA AL RITMO DE UNA PERSONA**: un correo por persona (como siempre), con el
  respiro de la cuenta (o `PRESS_SEND_PACE_MS`, 600 ms, por el SMTP de la app), conexión nueva cada N,
  y **el tope por hora se respeta**: `_press_send_pending` manda lo que cabe, deja el resto pendiente
  (`throttled`) y la nota en SENDING. **El hilo TERMINA** al topar (o si otro proceso la está
  mandando, `busy`): un hilo dormido una hora moriría igual en el primer despliegue. Quien la retoma
  es **`_press_sweep`** (cada minuto), que ahora **reanuda las notas en SENDING con pendientes** que
  llevan más de 3 min paradas y sin hilo en este proceso — es también lo que arregla una nota que
  un despliegue dejó a medias (antes se quedaba en «mandando» para siempre).
  ⚠️⚠️ **CERROJO POR NOTA** (`_pleo_pg_lock("press_release_send:<id>")` dentro de
  `_press_send_pending`): el hilo de la petición, el del barrido y el de otro worker no pueden mandar
  la misma nota a la vez (antes, dos pasadas simultáneas habrían mandado dos veces a los mismos).
  · **EL HUECO EN BLANCO de Integraciones** (bug real): las pestañas SMS y Correo estaban FUERA de
  `.tab-content` (en un div `mt-4` aparte). Bootstrap solo esconde con `display:none` a
  `.tab-content > .tab-pane`; a las de fuera les quedaba `.fade` (opacity 0), así que ocupaban sitio
  invisibles y al abrir Correo salía la pestaña SMS entera en blanco delante. Ya cuelgan de
  `.tab-content`. ⚠️ El contador de `<div` de la casa cuenta también los de los comentarios Jinja: no
  escribir una etiqueta literal en un comentario.
  · **LA FICHA DE UNA NOTA**: «**Editar diseño**» arriba a la derecha (solo sin enviar) y los **⋯** con
  **Editar** (sin enviar) o **Replicar nota** (enviada): `promo_press_duplicate` hace una COPIA en
  borrador con el mismo diseño, sujeto, remitente y **adjuntos** (mismas filas de `PressReleaseFile`,
  mismos ficheros) y abre su editor. En el listado, los ⋯ de una enviada ofrecen Replicar. La ficha
  dice el remitente con su dirección (`sender_label`).
  ⚠️ `is_master()` **NO es un global de plantilla**: un `{% if is_master() %}` revienta la página
  (bug de esta ronda, lo sacó la prueba). Se pasa un valor desde la vista (`mail_settings_url`).
  Probado con la app real (`/tmp/mcx/test_press.py`, 165 comprobaciones): anidado de las pestañas,
  alta/edición sin perder la contraseña, prueba de conexión por el servidor de la cuenta, envío de
  prueba, DNS (con resolvedor simulado), remitentes, envío de una nota por la cuenta (From, sin
  Reply-To ajeno, sin Auto-Submitted, Message-ID del dominio), tope por hora, hilo que termina,
  reanudación por el barrido, cerrojo por nota y replicar con adjuntos.

- **CUENTAS DE ENVÍO · el catálogo de las que la app ESPERA** (sep 2026,
  **`MAIL_EXPECTED_ACCOUNTS`**): promocion@33producciones.es (notas de prensa) y
  sync@piesrecords.com (Syncros), cada una con su nombre, su icono, su **servidor de salida**, para
  qué se usa y por qué. Es el punto único del que salen el **aviso** de «esta todavía no está dada
  de alta», el **alta ya rellena** y el «para qué» de cada fila de Integraciones → Correo.
  **Una cuenta nueva se añade AHÍ y aparece sola en la pantalla.**
  ⚠️ Lo que identifica una cuenta es su **DIRECCIÓN** (`MailAccount.from_email` es única), no su
  clave: la clave solo agrupa.
  · **EL CORREO DE LA CASA ESTÁ EN ARSYS** (`serviciodecorreo.es`, sep 2026):
  **`MAIL_HOSTING_SMTP` = `smtp.serviciodecorreo.es`** (465 · SSL/TLS), que es lo que trae puesto el
  alta —así lo ÚNICO que hay que escribir es **la contraseña del buzón**—. Se puede cambiar en el
  propio formulario: quien manda es el panel del proveedor de ESE buzón.
  · **QUÉ SPF PIDE CADA PROVEEDOR** (`MAIL_SPF_HINTS` + `_mail_spf_hint`): el `include:` concreto que
  hay que publicar, que es el dato que nadie sabe de memoria. Sale en «Comprobar los DNS» y en la
  tabla de la pantalla.
  ⚠️⚠️ **Solo se sugiere si el SPF NO consta como bueno**, y la condición no puede ser `ok is False`:
  **`_spf_authorizes_host` devuelve `None`** cuando no ve el servidor en el SPF (es prudente a
  propósito: los `include:` son recursivos y no se resuelven), así que con `is False` la pista no
  salía justo en el caso más común. Es `ok is not True` **y** que se haya podido consultar el DNS
  (si no se pudo, no se sabe si falta y no se dice nada). La tabla no AFIRMA nada: lo que decide es
  el DNS que lee el botón.
  ⚠️ Estado real de los dominios al implementarlo: **piesrecords.com** y **33producciones.es** ya
  tienen el SPF bueno (`include:_spf.serviciodecorreo.es`; ojo, el de piesrecords va con «V=spf1» en
  mayúscula — es válido, el RFC lo compara sin distinguir caja, y `_mail_dns_check` lo lee bien),
  33producciones.es tiene **DMARC `p=none`** y **piesrecords.com NO tiene DMARC**. El DKIM se activa
  en el panel del hosting y su selector se pone en la cuenta para poder comprobarlo.

- **Aviso «Elige tu menú» (tipo `MENU`, sep 2026)**: a la gente de la casa que va en una comida con
  menú de una hoja de ruta se le avisa al guardar el menú (`_roadmap_menu_notify_people`); el aviso
  lleva a su enlace personal (`/menu/<token>`) y **se resuelve solo al elegir** (`_notify_resolve`
  con `ROADMAP_MENU` y `<item>:<persona>`). No se repite si ya tiene uno sin leer. A los de fuera se
  les pide por SMS o correo desde la pestaña Comidas (`roadmap_meal_request_send`, con vista previa),
  un mensaje por persona con su enlace. Detalle en `produccion-hoja-ruta.md`.

- ⚠️⚠️ **LA CABECERA DE LOS CORREOS DE UNA ACTIVIDAD, CON EL ESTILO DE LA CASA** (sep 2026, lo pidió
  Dani). El logo arriba a la derecha y, debajo, una **banda en el rojo corporativo** (`#E33D48`) con
  el TIPO de actividad encima del título; la galleta con un **filete rojo** a la izquierda y cada
  dato con **su icono**; y el rótulo de cada módulo en el **azul corporativo** (`#007CA2`).
  ⚠️⚠️ **LOS ICONOS DE UN CORREO SON EMOJIS, NO FONT AWESOME**: en un cliente de correo una fuente de
  iconos NO carga y el `<i class="fa …">` sale **vacío**, que es peor que no poner nada. Punto único
  **`_notice_emoji`** (mapa `NOTICE_EMOJI`), que traduce el icono de la casa al emoji — y como la
  vista previa y la página pública usan el MISMO motor, los tres sitios se ven igual.
  ⚠️ Los colores van **en duro** (`BRAND_RED` / `BRAND_BLUE`) y no por `settings.BRAND_PRIMARY`: ése
  se puede cambiar por variable de entorno y trae otro por defecto, y un correo que sale con un color
  que no es el de la marca no se puede recoger.
  ⚠️ Los emojis viajan bien: `EmailMessage` elige utf-8 solo en cuanto el contenido no es ASCII (lo
  mismo que ya pasaba con los acentos).
