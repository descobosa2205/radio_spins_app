# Personal · vacaciones, documentos y PRL

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- FICHA DE PERSONAL · el orden de las pestañas
- Solo personal ACTUAL en listas y selectores
- Inicio · acciones rápidas por departamento
- AGENDA · un bloqueo o un «otro» se EDITA, se ARRASTRA y el cambio de fecha SE AVISA
- AL EDITAR, una cosa NO se solapa consigo misma (bug real, ago 2026): el aviso «ese día el
- ESCÁNER DE DOCUMENTOS (DNI / NIE / pasaporte) — ago 2026. Motor puro mrz_utils.py
- EL DEPARTAMENTO LO ESCRIBE UNA PERSONA: se compara con TOLERANCIA (bug real, ago 2026).
- PREVISUALIZACIÓN de un enlace INTERNO · el icono de la casa
- AVISOS POR SMS: la campanita y el correo llegan tarde si nadie mira; un SMS entra en
- Documentos CADUCADOS: aviso automático y renovación por enlace (PersonDocRequest): un cron
- FICHAS DE PERSONA: las TRES se ven igual
- VACACIONES Y DÍAS LIBRES. Modelos Holiday · VacationRequest · VacationDay
- DÍAS LIBRES y DÍAS NO LABORABLES
- AVISOS de vacaciones / día libre / día no laborable
- LAS VACACIONES SE PINTAN POR TRAMOS DE DÍAS SEGUIDOS (bug real y gordo, ago 2026). Una
- Calendario de INICIO · categoría «Vacaciones y días libres»: _agenda_personal_days
- GESTIONAR VACACIONES O CONTRATOS no es lo mismo que tener la ficha de personal (bug real,
- PERSONAL · un permiso POR PESTAÑA de la ficha
- MI CONTRATO · pestaña de la ficha de personal
- Documentos personales (pestaña «Documentos» en ficha de personal, de tercero y de las PERSONAS 
- Descarga de documentos generados (static/js/doc_download.js, GLOBAL, cargado en layout.html
- EL LECTOR DE DNI, NIE Y PASAPORTE: LEE LAS DOS CARAS Y NO SE LE PIDE «LA PARTE DE ATRÁS»
- UN BOTÓN DENTRO DE UNA ZONA data-inline-zone NECESITA DELEGACIÓN (bug real repetido,
- PASE DE PERSONAL (sep 2026): la acreditación en el móvil (Apple Wallet · Google Wallet · imagen)
  con un QR que cualquiera de la casa comprueba

---

- **FICHA DE PERSONAL · el orden de las pestañas** (ago 2026): **«Datos» es la PRIMERA** (es lo del día
  a día y la pestaña por defecto al abrir la ficha) y **«Accesos» la ÚLTIMA** (los permisos se tocan de
  tarde en tarde). ⚠️ El orden manda en DOS sitios que hay que dejar iguales: el dict `tab_access` de
  `personnel_detail_view` (de ahí sale la pestaña por defecto, `visibles[0]`) y la lista del `{% for %}`
  de `personnel_detail.html`.

- **Solo personal ACTUAL en listas y selectores**: `is_blocked`/`is_deleted` viven en **`UserSecurity`**
  (¡no en `User`! — un `getattr(user, "is_blocked")` es siempre `False` y no filtra nada: bug real).
  Helper único **`_inactive_user_ids(session_db)`** (UUIDs de eliminados o bloqueados) aplicado en el
  destinatario de la factura del enlace público (`_invoice_target_people`), el personal de invitaciones
  (`_invitation_personnel_options`), el buscador de vinculaciones (`api_entity_link_search`, tipo
  `personal`), los correos internos (`_all_user_emails`, dirección del escalado de gastos) y el cruce de
  DNI del ITA (`_prl_ita_link_people`). Las pantallas de **gestión** de personal (`/personal`,
  `/personal/accesos-bloque`) siguen mostrando a los bloqueados a propósito (hay que poder
  desbloquearlos y arreglarles los permisos); los eliminados no salen en ninguna.
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

- ⚠️ **AL EDITAR, una cosa NO se solapa consigo misma** (bug real, ago 2026): el aviso «ese día el
  artista ya tiene…» del asistente de peticiones saltaba con **la propia petición** que se estaba
  editando. `api_concert_artist_conflicts` aplicaba `exclude_id` **solo a los conciertos**; ahora hay
  punto único **`_conflict_exclude`** y se excluye también en acciones, bloqueos/notas de agenda y
  peticiones. El asistente manda `exclude_id` con el id de `#pwRequestId` (y va en la clave de caché
  de la comprobación, que si no se quedaría la del alta).

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

- ⚠️⚠️ **EL DEPARTAMENTO LO ESCRIBE UNA PERSONA: se compara con TOLERANCIA** (bug real, ago 2026).
  `_normalize_departments` descartaba **en silencio** cualquier valor que no fuera EXACTAMENTE un
  nombre del catálogo o uno de sus alias, así que quien tuviera «Producción musical», «Producción
  ejecutiva» o «Producción y logística» **dejaba de contar como de Producción**: no salía la primera
  en los selectores de producción y logística —se quedaba detrás de «Ver todo el personal»— y parecía
  que la app «no la ofrecía» (el caso de Irene). Y lo mismo con «Diseño gráfico», «Dirección general»…
  · Punto único **`_department_guess(raw, aliases)`**: si el valor no casa exacto, busca el nombre del
  catálogo **como PALABRA** dentro del texto (sin acentos ni mayúsculas, `_norm_text_key`), probando
  primero el más largo para que «redes sociales» gane a cualquier trozo suelto.
  ⚠️ Es por PALABRA, no por subcadena: «**Re**producción de audio» **no** es Producción (comprobado).
  ⚠️ Lo que encuentra pasa por los **MISMOS alias** que la comparación exacta (p. ej. «promoción» va a
  «Marketing»): si no, «Promoción» y «Promoción de artistas» acabarían en departamentos distintos y
  una persona contaría y la otra no.
  ⚠️ Con esto valen ya las tres formas en las que se tuerce un departamento: **mal escrito** (esto),
  guardado como **TEXTO** en vez de lista (`_departments_iter`) y **sin ficha de perfil** (el JOIN
  externo de `_production_people`). Como el arreglo está en el punto único, lo heredan TODOS los sitios
  que preguntan por un departamento (`_profile_in_department`, `_registros_user_ids`,
  `_disco_radio_deciders`, el módulo de tareas de diseño…), no solo producción.
  ⚠️ **`_department_user_ids` ya NO lee `departments` en crudo**: usa `_profile_in_department`, así
  que hereda las tres tolerancias. Antes comparaba la cadena literal y quien lo tuviera escrito de
  otra forma **no recibía el aviso sin dar ningún error** (era el aviso que ya advertía esta guía).

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

- **Descarga de documentos generados** (`static/js/doc_download.js`, GLOBAL, cargado en `layout.html`
  ANTES del bloque del loader): intercepta los enlaces same-origin de documentos (por extensión o por
  las rutas `/pdf`, `/xlsx`, `/descargar`, `/export`…; excluir con `data-no-doc-loader`). Con
  `target="_blank"` abre la pestaña **de forma síncrona** (si no, el navegador la bloquea) pintando
  una pantalla propia «Generando documento…» con iconos y barra, y al terminar la reemplaza por el
  fichero (blob); sin `_blank` usa `window.appLoader.progress`. Si el `Content-Type` no es de
  documento (p. ej. un error devuelve HTML) NO lo da por bueno y cae al enlace normal.
- ⚠️⚠️⚠️ **EL LECTOR DE DNI, NIE Y PASAPORTE: LEE LAS DOS CARAS Y NO SE LE PIDE «LA PARTE DE ATRÁS»**
  (sep 2026, rediseño; bug real: «el lector no funciona, tarda muchísimo, te pide la parte de atrás y
  la gente se equivoca»). En el DNI español el **MRZ está en el REVERSO**, así que un lector que solo
  sepa leer el MRZ obliga a dar la vuelta al documento… y quien pone la cara de la foto —que es «el
  DNI» para cualquiera— **no conseguía nada NUNCA**: se agotaban los 90 intentos y salía el error.
  · **AHORA SE LEEN LAS DOS**: el **REVERSO va primero** (su banda lleva dígitos de control, así que
  se dispara en cuanto un fotograma sale limpio) y, si en dos vueltas no aparece, **se alterna con la
  CARA DELANTERA** (`parse_front` / `parseFrontText`), de la que salen el **número** —comprobado con
  su letra mod-23—, **nombre y apellidos** (por sus rótulos), **fechas**, sexo y nacionalidad.
  ⚠️ Antes del impreso solo se rascaba el número: quien subía la foto de su anverso se quedaba **sin
  nombre, sin apellidos y sin fechas** (`extract_fields` los cogía solo del MRZ).
  · ⚠️⚠️ **LO QUE HACE QUE FUNCIONE ES REPARAR LO QUE EL OCR LEE MAL, POR POSICIÓN.** En el MRZ cada
  posición solo puede ser una cosa (una fecha son seis DÍGITOS, la nacionalidad tres LETRAS), así que
  una «O» donde va un cero **se traduce**, no se descarta. Antes **una sola «O» en la fecha tiraba el
  MRZ ENTERO** —ni el nombre se salvaba— y la cámara se quedaba «pensando»: eso era el «no funciona»
  y el «tarda muchísimo». Comprobado: los cinco fallos típicos (O por 0, I/L por 1, S por 5, la «M»
  del sexo leída como «H», «1D» por «ID») **antes daban NADA y ahora se leen perfectos**.
  · Capas, en este orden: **1)** traducción por posición (`_a_digitos`/`_a_letras`, determinista);
  **2)** los rellenos **«<» leídos como K/L/C** (una racha de 3+ letras idénticas es relleno, y solo
  en las zonas de relleno: un pasaporte «AAA123456» tiene tres letras iguales de verdad);
  **3)** corrección de UN carácter guiada por el dígito de control, **solo si la solución es ÚNICA**
  (`_arregla_por_check`); **4)** la **letra de control leída como un DÍGITO** («…78Z» → «…782»), que
  es el fallo más típico del impreso: se traduce y **se comprueba el mod-23**.
  ⚠️ Las letras que no se parecen a ningún dígito (H, K, M, N, W) **no se traducen**: ahí reparar
  sería inventar. Y **la LETRA del DNI nunca se recalcula**: es la comprobación — recalculándola,
  cualquier tira de ocho dígitos daría un «DNI válido».
  · ⚠️ **La forma de cada línea se comprueba YA REPARADA**, pero exigiendo que **la mayoría de esas
  posiciones sean dígitos de verdad** (11 de 14): traduciendo a ciegas, «IDESPBAA000589…» —que es la
  línea 1— también casaba con «fechas + sexo» y el MRZ se leía del revés (bug de este mismo lote).
  · **Y EL OCR JUNTA LAS COSAS**: las líneas del MRZ vienen **pegadas** (`_desdobla` prueba 3×30 y
  2×44 y devuelve TODAS las particiones: 88 caracteres son un pasaporte pero también entran en 3×30)
  y las fechas del impreso salen sin separadores («0101 1980», «01011980»), que con el patrón de
  siempre (`dd/mm/aaaa`) **no encontraba NINGUNA** — el DNI las imprime con espacios.
  · **QUE NO CUELE UN DATO INVENTADO**: `find_spanish_id` exige límites en los extremos —sin ellos
  «PEDIDO 20260908 REFERENCIA» daba el «DNI» 20260908R, con la letra de la palabra de al lado (bug
  que ya existía)—; la versión tolerante exige **6 de los 8 dígitos de verdad**; el nombre del
  impreso solo se acepta **si hay número o fechas** (si no, la palabra «NOMBRE» de cualquier texto
  colaba como el de una persona); y la letra se repara solo junto a su rótulo o con **dos rótulos de
  documento** presentes (`_RE_ANV_PISTAS`), descartando lo que va tras «Teléfono» o «Móvil».
  Medido sobre 40.000 caracteres de texto real (README, CLAUDE.md, una factura): **cero** números,
  nombres y fechas inventados.
  · **VELOCIDAD** (`doc_camera.js`): **fuera los 220 ms de espera muerta** entre vueltas (el OCR ya
  corre en su worker) → 40 ms · **720p** en vez de 1080p (la banda queda a ~23 px por carácter, de
  sobra, y cuesta la mitad) · la banda se **reduce a 200 px de alto** (≈65 px por línea) · binarizado
  por **Otsu** en vez de «la media × 0,82», que con una sombra o un reflejo se queda corto · **dos
  workers** con el MISMO modelo (uno con la lista de caracteres del MRZ y otro con la del texto: así
  no se descarga nada más) · y el **tope es por TIEMPO** (30 s), no por número de intentos.
  Medido en el navegador: **~7,5 lecturas por segundo alternando las dos caras** (antes ~2), OCR de
  118-164 ms por vuelta y los dos workers listos en 134 ms ya calientes.
  ⚠️ **El modelo se precarga MIENTRAS la persona rellena** la hoja (`minor_auth.js`, con
  `requestIdleCallback`): son varios megas y, descargándolos al abrir la cámara, los primeros
  segundos se iban en eso y parecía que «no lee».
  · ⚠️⚠️ **UNA FOTO DE UNA SOLA CARA YA NO SE PARTE POR LA MITAD** (bug real de la subida por
  fichero): `splitFaces` partía por la PROPORCIÓN del contenido, así que una foto de móvil **en
  vertical** de un DNI (0,75) se cortaba en dos mitades y no se leía nada. Y la proporción no puede
  distinguirlo, porque una foto 3:4 partida da justo dos trozos con forma de tarjeta: lo que lo
  distingue es que **entre dos documentos apilados queda una franja de FONDO**, así que ahora se mira
  la «tinta» por filas (`hayHuecoEnMedio`) y solo se parte si hay un hueco de verdad.
  ⚠️ `scan(file, kind, 'front'|'back')` **no parte la imagen**; pero un **PDF de dos páginas manda**
  (el hueco del anverso admite a propósito el PDF con las dos caras) — poner la rama de `which`
  delante rompía ese caso.
  · **PARIDAD OBLIGATORIA `mrz_utils.py` ↔ `static/js/doc_scan.js`** (el servidor parsea también, en
  `/api/documento/leer`). La prueba de regresión es **`python3 tools/check_mrz.py`** (57
  comprobaciones) y la paridad se comprueba **en el navegador** con una página que pasa los mismos
  casos por el JS y los compara con el resultado de Python (todos cuadrando). Si se toca un motor, se
  toca el otro y se pasan las dos.
  ⚠️ Los casos de la prueba **no son inventados**: son lo que devolvió tesseract leyendo un DNI
  dibujado en un lienzo, con sus tres fallos (fechas pegadas, letra de control como dígito y rellenos
  como K/L). Un OCR que mete un carácter **DE MÁS** desplaza todo y eso no se puede arreglar: lo que
  tiene que pasar —y se comprueba— es que **ese fotograma NO se dé por bueno**.

- ⚠️⚠️⚠️ **UN BOTÓN DENTRO DE UNA ZONA `data-inline-zone` NECESITA DELEGACIÓN** (bug real repetido,
  sep 2026). «Subir factura» del plan de facturación **no hacía nada**: su handler era un
  `document.querySelectorAll('.trigger-invoice-upload').forEach(… addEventListener …)`, que engancha
  los botones **que existen al cargar**. Ese plan vive dentro de `#concert-general-zone`, que se
  **REEMPLAZA por AJAX** al guardar cualquier sección: los botones del HTML nuevo se quedan sin
  listener y el clic no hace nada, **sin ningún error en la consola**. Es la misma trampa que ya
  mató el gestor de géneros de la ficha de canción.
  · **La regla**: dentro de una zona que se repinta, **siempre delegación en `document`**
  (`document.addEventListener('click', ev => ev.target.closest('.x') && …)`), nunca listeners
  pegados a los nodos.
  · **Y HAY UNA COMPROBACIÓN QUE LO BUSCA SOLO: `python3 tools/check_botones.py`**. Encuentra las
  tres formas que hemos tenido de dejar un botón muerto:
    1. **destino muerto** — `data-bs-target` / `data-edit-toggle` / `data-view` /
       `data-inline-target` / `href="#x"` que apuntan a un id que no existe (así salió el botón de
       «configura la forma de pago», que apuntaba a un formulario que en un concierto VENDIDO ni se
       pintaba, y el `href="#pitch"` de la ficha de canción);
    2. **handler que muere al repintar** — un `querySelectorAll(...).addEventListener` que engancha
       algo que está DENTRO de una zona `data-inline-zone` (esto);
    3. **función inexistente** — un `onclick="loQueSea(…)"` que no está definida en ningún `.js` ni
       en la propia plantilla (así estuvo «Compartir LC» sin hacer nada).
  · Distingue **botón muerto** (el id no existe en NINGUNA plantilla: seguro) de **AVISO** (existe en
  otra: puede ser un include condicional), y **solo falla** con los muertos, para que se pueda dejar
  en CI. Los parciales (`_x.html`) no se revisan sueltos: se revisan al pegarlos en su página.
  · **Al tocar plantillas, pasarla**: hoy quedan **0 botones muertos** (los cuatro que encontró
  —copiar en la ficha de empresa, probar Cabify y los dos de Registros— están arreglados).


- **PASE DE PERSONAL · la acreditación en el móvil** (sep 2026, lo pidió Dani: «cada personal tiene
  una identificación física que se puede perder; quiero un pase para Wallet con nombre, DNI y un QR,
  y que cualquiera con acceso a la web pueda validar si es legítimo»). Punto de entrada:
  **`/personal/<user_id>/pase`** (`staff_pass_view`), con el atajo **«Mi pase de personal»** del menú
  personal (`/mi-pase` → `my_pass_view`) y la tarjeta «Pase de personal» de la pestaña **Datos** de
  la ficha. Bloque «PASE DE PERSONAL» en `app.py` (tras Instrucciones); plantillas `staff_pass.html`
  (la tarjeta y cómo añadirla), `staff_pass_check.html` (la comprobación) y `staff_pass_scan.html`
  (el escáner); estilos `.sp-*`. Cómo activar Wallet: **`DEPLOY_WALLET.md`**.
  · **Modelos** `StaffPass` (`staff_passes`: UN pase vigente por persona, `token` OPACO de 24
  caracteres —`secrets.token_urlsafe(18)`—, `serial`, `status` ACTIVE/REVOKED, la FOTO de los datos
  con los que se emitió `holder_name`/`holder_dni`, quién lo emitió y el contador de comprobaciones) y
  `StaffPassCheck` (`staff_pass_checks`: cada comprobación, con quién y el resultado; también los
  códigos que no son de la casa, con `pass_id` vacío). `ensure_staff_pass_schema`.
  · **El QR lleva la URL de comprobación** `https://app.33producciones.es/pase/<token>`
  (`_staff_pass_url`, dominio canónico): así vale escaneado con la cámara del móvil (pasa por el
  login y vuelve) o desde el escáner de la app (`/pase/validar`, `DocCamera.open({qr:true})`, el
  mismo lector del control de menores; el JS saca el token de la URL o del texto pegado y abre la
  comprobación EN ESTE dominio). La comprobación (`staff_pass_check_view`) la abre **cualquiera con
  sesión** (es el control) y dice: **válido** (con foto, nombre, DNI y departamentos ACTUALES para
  contrastar), **anulado** (se renovó), **no válido** (bloqueado o eliminado en `UserSecurity`: la
  validez se DECIDE al comprobar mirando la ficha, no se guarda) o **no es de la casa**. Si el
  nombre o el DNI cambiaron desde que se emitió (`stale`), sigue siendo válido pero avisa
  (resultado `STALE`) y en la página del pase se sugiere renovar.
  · **Emitir exige nombre y DNI en la ficha** (`_staff_pass_missing`): es lo que se contrasta con el
  documento. **Renovar** (`staff_pass_issue`, móvil perdido o datos cambiados) pone el vigente en
  REVOKED y emite el siguiente serial: el QR viejo pasa a decir «anulado». No se borra nada.
  · **Permisos**: el pase propio lo abre y lo renueva cualquiera; el de OTRA persona, quien pueda
  VER sus Datos (`personal.usuarios.datos`, que es el permiso que ya enseña su DNI) y renovarlo quien
  pueda EDITARLOS. ⚠️ Los endpoints cuelgan de `/personal/…` pero NO tienen recurso propio, y un GET
  sin recurso pasa con cualquier sesión: por eso se deciden **y se deniegan** en
  `_support_endpoint_decision` (`STAFF_PASS_ENDPOINTS` + `_staff_pass_request_allowed`, un 403 con
  motivo), y van en `_access_exempt_endpoints` para que Accesos no los saque como «Función nueva».
  `my_pass_view` está en `PERSONAL_ENDPOINTS`; el escáner y la comprobación, exentos (cualquier sesión).
  · **La tarjeta** es UNA (`_staff_pass_card_png`, Pillow 1080×1620: banda roja con el logo en
  BLANCO —el logo es rojo y sobre rojo desaparece: se pinta su silueta por el canal alfa—, foto en
  círculo o iniciales, nombre, DNI, departamentos, QR a módulo exacto y pie) y es la misma que la de
  la pantalla (`.sp-card`, con `filter:brightness(0) invert(1)` para el logo) y la del PDF (90×135 mm,
  la imagen a sangre). La imagen se abre en otra pestaña (en el iPhone: mantener pulsado → Fotos);
  `?dl=1` la baja como adjunto.
  · **Apple Wallet** (`_staff_pass_pkpass_bytes`): zip con `pass.json` (estilo **`storeCard`**, la
  tarjeta de socio: es el que admite una BANDA de imagen a todo lo ancho), `icon`/`logo` en
  1x/2x/3x, la **banda `strip.png`** (375×144 pt a 1x/2x/3x, `_staff_pass_strip_png`: degradado rojo,
  rótulo «Pase de personal · 33 Producciones · Pies Records», la FOTO en un círculo grande con anillo
  blanco a la derecha —o las iniciales— y el **NOMBRE pintado por nosotros** abajo a la izquierda,
  hasta dos líneas y bajando el cuerpo si no cabe), los campos DNI y DEPARTAMENTO debajo, el número
  de pase en la cabecera, el resto al dorso, `manifest.json` (SHA-1) y la **firma PKCS#7 detached**
  del manifest con el certificado del Pass Type ID + WWDR (`cryptography.pkcs7`, `Binary` +
  `DetachedSignature`; openssl la verifica). Certificado real activo en Render desde el 23-sep-2026.
  ⚠️⚠️ **SIN `primaryFields` y sin `logoText`** (sep 2026, probado en el iPhone de Dani): en una
  tarjeta de socio Wallet pinta el campo principal ARRIBA de la banda, en grande y a todo lo ancho,
  y se montaba sobre el rótulo y la foto; por eso el nombre va DENTRO de la imagen. Y en este estilo
  los campos secundarios y auxiliares comparten UNA fila: con cuatro se apretaban, así que solo DNI y
  departamento (fecha y empresa, al dorso). El primer diseño fue `generic` con miniatura: sobrio de
  más, Dani pidió mejorarlo. La foto se baja UNA vez (288 px) y se reduce para las tres escalas. **Google Wallet** (`_staff_pass_google_save_url`): enlace `pay.google.com/gp/v/save/`
  con un **JWT RS256** firmado a mano (`_jwt_rs256`, sin librería) que lleva la clase y el objeto
  genéricos. Los dos se activan por variables de entorno (`_apple_wallet_config` /
  `_google_wallet_config`); sin ellas los botones salen APAGADOS y explicados, nunca desaparecen.
  ⚠️ `_staff_pass_secret` admite el PEM pegado (con `\n` escapados) o la RUTA de un Secret File; un
  JSON se devuelve TAL CUAL (cambiarle los `\n` rompía la clave de la cuenta de servicio: bug de la
  prueba). Renovar NO actualiza el pase ya guardado en el móvil (no hay `webServiceURL`): queda uno
  de más que al escanearlo dice «anulado».
  · Prueba de punta a punta (emitir, imagen/PDF/QR, comprobar los cuatro resultados, renovar,
  bloqueado, permisos con y sin grant, .pkpass con certificado autofirmado verificado por openssl,
  JWT de Google verificado con PyJWT): `test_pases.py` del kit local (60 comprobaciones).
  · **Estudio de seguridad (sep 2026, lo pidió Dani)**. Lo que protege: el token del QR son 144 bits
  al azar (`token_urlsafe(18)`) —no se adivina ni se enumera—, la comprobación exige SESIÓN de la casa
  (quien escanea sin ella pasa por el login y vuelve; el `next` va por `safe_next_or`), el gate de los
  endpoints del pase DENIEGA con 403 al que no es el dueño ni tiene Datos, renovar es un POST con CSRF,
  cada comprobación deja rastro (y en «Ver como», con el nombre del que estaba detrás), la página del
  pase y la de comprobación salen con `Cache-Control: private, no-store` (llevan el DNI: nada en la
  caché de un móvil que se pasa de mano) y la de comprobación con `Referrer-Policy: no-referrer` (el
  token de la URL no viaja), la foto solo se baja de una URL `https://`, y una copia del QR no sirve a
  un impostor porque la comprobación enseña la FOTO y el DNI actuales para contrastarlos. Lo que se
  asume: el DNI va en claro en el pase porque así se pidió (una tarjeta física también lo lleva); el
  enlace de Google Wallet lleva el nombre y el DNI dentro del JWT (es como funciona «Guardar»; la
  alternativa «skinny JWT» crea el objeto por la API REST y solo manda el id). Hallazgo FUERA de esta
  función: `_require_login_v2` no vuelve a mirar `is_blocked`/`is_deleted` en cada petición, así que a
  quien se bloquea con la sesión abierta le dura hasta que caduque (el login sí lo rechaza). Es de toda
  la app, no del pase, y está apuntado para la fase de seguridad.
