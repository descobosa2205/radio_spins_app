# Recintos y mapa de butacas

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- Mapa de butacas del recinto (diseñador, pestaña Ticketing): VenueSeatMap.layout_json
- FORMATO del recinto que usa cada ACTIVIDAD (Concert.seat_map_id, ago 2026): un recinto puede
- Plano en vivo
- AUTORIZACIONES DE ACCESO A MENORES — ago 2026. Pestaña «Menores» de la ficha de la
- EL RECINTO: o se elige de la base o SE DICE QUE NO SE CONOCE. En la ficha de la
- CREAR UN RECINTO: SOLO LA BARRA, y los campos salen rellenos
- FICHA DE CONTRATACIÓN · EL RECINTO sustituye a «¿al aire libre o cubierto?»

---

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

- ⚠️⚠️ **EL RECINTO: o se elige de la base o SE DICE QUE NO SE CONOCE** (sep 2026). En la ficha de la
  actividad convivían el selector de recintos y los campos «a mano», así que al elegir un recinto los
  de abajo se quedaban ahí sin sentido y **no había forma de decir «todavía no se sabe»**. Ahora es un
  interruptor —**«Conozco el recinto»** / **«Todavía no se sabe»**— y solo se ve el bloque que toca.
  ⚠️ El bloque que se esconde se **DESHABILITA** (`app33VenueSwitch` en `concert_form.js`): un campo
  oculto se envía igual, y con los dos a la vez el guardado se llevaría por delante lo que no toca.
  ⚠️ Al guardar manda **`venue_known`**: con «no se sabe» vale con el nombre a mano **o** con el
  sitio (puede que solo se sepa el municipio, y eso ya es algo). Y lo manual **solo se toca si llega
  ese interruptor**: un guardado parcial de otra pantalla no puede borrarlo (la regla de los
  centinelas).

- ⚠️⚠️ **CREAR UN RECINTO: SOLO LA BARRA, y los campos salen rellenos** (sep 2026). El alta rápida
  pedía municipio, provincia, país y dirección sueltos. Ahora es el patrón de la casa
  (`data-addr-reveal`): **una sola barra** donde se escribe la dirección, el municipio o la
  provincia, salen las coincidencias y al elegir una **se rellena todo** —dirección, código postal,
  municipio, provincia y país—, que se ve debajo ya cumplimentado. Con cuatro campos a la vista la
  gente escribía el municipio mientras la barra buscaba y el recinto quedaba a medias.
  · `Venue.postal_code` es una columna nueva: el buscador lo trae con el resto y **se guarda**.
  ⚠️ Sigue estando **«Escribirla a mano»** para un sitio que el buscador no conozca.

- ⚠️⚠️ **FICHA DE CONTRATACIÓN · EL RECINTO sustituye a «¿al aire libre o cubierto?»** (sep 2026):
  eso es un dato **DEL RECINTO** y se pregunta solo al darlo de alta. En «Datos del show» sale el
  recinto que tengamos (foto + nombre + «Municipio, Provincia» y el botón «Cambiar»); si no hay, un
  aviso ámbar («hay que especificar el recinto», diciendo el municipio si es lo único que sabemos) y
  una **barra de búsqueda**: se escribe y salen las coincidencias **con su foto**
  (`public_contract_sheet_venues`), y la última fila es siempre **«Crear el recinto «X»»**.
  · El alta pide **solo el nombre, la DIRECCIÓN (la barra que rellena lo demás: el CP, el municipio,
  la provincia y el país van en OCULTOS, no se piden) y si es cubierto o al aire libre**
  (`Venue.covered`), y **al crearlo queda elegido** (`public_contract_sheet_venue_create`).
  ⚠️ **NO se duplican recintos**: si ya tenemos uno con ese nombre en ese municipio se reutiliza y se
  dice (`_norm_text_key`, el mismo criterio que el alta rápida de dentro).
  · Lo elegido viaja en ocultos (`gala_venue_id` + nombre, dirección, CP, municipio, provincia y
  `show_venue_kind` derivado de `covered`) y **al REVISAR la ficha se le pone a la actividad**
  (`venue_id` en `_sheet_merge_candidates`).
  ⚠️⚠️ Ahí había una trampa: `_apply_contract_sheet_merge` limpiaba `concert.venue_id` cuando llegaba
  un recinto **escrito a mano** (la regla de siempre), y como el nombre y la dirección viajan también
  como texto, **borraba el recinto que se acababa de poner**. Ahora, si viene `venue_id`, manda ése.
  ⚠️ La lista de sugerencias se saca al `<body>` (`app33FloatList.attach`) **al ABRIRLA**, no al
  arrancar: los scripts en línea de una plantilla corren ANTES que los globales del layout, así que
  al cargar `app33FloatList` todavía no existe (la lista se quedaba dentro de su bocadillo).

