# Cartelería, fotos y diseño

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- UNA FOTO O UN LOGO SE SUBEN CON upload_image, NUNCA CON «solo PNG».
- Foto del artista junto al nombre (global): para mostrar la foto del artista en círculo delante
- Enlazar a la ficha del artista (global): para que el nombre/foto de un artista lleve a su ficha
- EL MÓDULO DE CONTACTOS POR FUNCIÓN · dos bugs y un solo sitio
- UN COMISIONISTA PUEDE SER LA PRODUCCIÓN LOCAL
- EL ALTA DE UNA ACTIVIDAD NO PREGUNTA POR LA HOJA DE RUTA
- CONTACTOS DE UNA ACTIVIDAD · se ponen SIN TOCAR EL PROMOTOR (sep 2026, rediseño de
- MIS TAREAS PENDIENTES · LO DE UN MISMO TODO ES UNA SOLA TAREA (ago 2026, rediseño de
- Simulaciones (Contratación) — rediseño jul 2026: el sujeto puede ser un artista o un EVENTO
- Asistente «+ Actividad» — rediseño jul 2026 (_concert_wizard_modal.html, reescrito): cada paso
- Contratación · pestañas, tareas y contadores (rediseño ago 2026): la barra de pestañas es un
- FICHA DE ACTIVIDAD · la cabecera lo dice todo (rediseño ago 2026, concert_detail.html)
- CARTELERÍA · ENLACE PÚBLICO para verla y descargarla
- CARTELERÍA GENERAL DE UN EVENTO: un evento (el sujeto, AppEvent) tiene su
- UN CARTEL PUEDE SER UN VÍDEO: los anuncios de redes lo son casi siempre
- LOGOTIPOS de una marca, con TODAS sus versiones
- SIN FOTO NI LOGO → MUÑEQUITO GRIS (ago 2026, static/img/avatar_placeholder.png + .svg,
- NOTAS DE PRENSA · CONTACTOS, CARTELERÍA, LOGOS y ETIQUETAS DE MEDIOS
- FOTOS · CON UNA SOLA SELECCIONADA YA SE PUEDE HACER TODO: la barra de acciones en
- Fotos / vídeos (galería transversal): pestaña Fotos en ficha de concierto y acción
- AVISOS · rediseño
- COMPARTIR CARTELERÍA · LO QUE SE MANDA ES LA PÁGINA, Y SU TÍTULO LO DICE TODO.
- REPRODUCIR UN VÍDEO NO PASA POR EL SERVIDOR (sep 2026, bug real
- LA PROPORCIÓN LA ARREGLA EL NAVEGADOR, QUE YA SABE EL TAMAÑO (sep 2026, bug real
- LA FOTO DE UN EVENTO SE VE POR SU ARTISTA ESPEJO: el espejo SIGUE al evento (bug real,
- CONTACTOS · SE BUSCA EN TODA LA BASE Y SE VE LA FOTO: api_contact_search devuelve
- UNA FOTO DE TAMAÑO FIJO NO SE ENCOGE NUNCA: NI ELLA NI EL ENLACE QUE LA ENVUELVE (bug
- CARTELERÍA · SI EL CARTEL LO HACE EL PROMOTOR, SE LE PIDE A ÉL. Hasta ahora la
- LA FECHA DE ANUNCIO Y LOS CARTELES SE LE PIDEN AL PROMOTOR EN UN SOLO CORREO (sep 2026)
- UN CARTEL PASA POR DOS VISTOS BUENOS: DISEÑO Y DESPUÉS CONTRATACIÓN (sep 2026)
- CON LOS DOS VISTOS BUENOS, LOS CARTELES SE LE MANDAN SOLOS AL ARTISTA (sep 2026)

---

- ⚠️⚠️ **UNA FOTO O UN LOGO SE SUBEN CON `upload_image`, NUNCA CON «solo PNG»** (ago 2026).
  `upload_png` **se ha retirado**: su única gracia era RECHAZAR un JPG, y lo usaban las fotos de
  ARTISTA y los logos de emisoras, ticketeras, empresas del grupo y medios — o sea, justo donde la
  gente sube una foto normal. Todos pasan a **`upload_image`**, que admite **PNG · JPG/JPEG · WEBP ·
  GIF · SVG**.
  · **Y las HEIC del iPhone** (que es lo que sale de la cámara y **ningún navegador pinta**): se
  aceptan y se **convierten a JPEG al subir** (`_heic_to_jpeg` en `supabase_utils.py`, con
  `pillow_heif`, que ya estaba en `requirements.txt`). ⚠️ La conversión va **en el helper**, no en
  cada pantalla: una HEIC subida tal cual se guarda bien y luego no se ve en ningún sitio (ni en la
  app, ni en un correo, ni en la previsualización de un enlace). Si no se puede convertir, **se
  dice** en vez de guardar algo que no se va a ver.
  ⚠️ El **`accept`** del `<input type="file">` y la ETIQUETA del campo tienen que decir lo mismo que
  el servidor: se quedaron 10 campos con `accept="image/png"` y rótulos «Foto (PNG)» / «Logotipo
  PNG» que hacían que el navegador ni dejara elegir el JPG.

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
- ⚠️⚠️ **EL MÓDULO DE CONTACTOS POR FUNCIÓN · dos bugs y un solo sitio** (sep 2026).
  · ⚠️⚠️ **EL BUSCADOR NO ENSEÑABA NADA**: `activity_contacts.js` construía la lista, la llenaba con
  los resultados y la colgaba del `<body>`… pero **`.ta-results` nace con `display:none` en el CSS**
  (la enseña quien la usa) y ahí no se ponía. Traía los resultados y se pintaban en un elemento
  invisible: parecía que «no encuentra a nadie». Una línea: **`lista.style.display = 'block'`**. Lo
  hacen ya `typeahead.js`, `song_genres.js`, `bag_expense_form.js` y `performance_songs.js`: **si se
  copia ese bloque, se copia esa línea**.
  · ⚠️⚠️ **EL «+» NO DEJABA LO CREADO SELECCIONADO (la primera vez)**: `quick_create.js` se carga
  **antes** que `activity_contacts.js`, así que su listener de `click` en `document` corría PRIMERO y
  leía `data-target` cuando este todavía no lo había puesto — la persona se creaba y no se quedaba
  elegida (y a la segunda sí, porque el atributo ya estaba del clic anterior). Se arregla poniendo
  ese listener **EN CAPTURA** (`addEventListener('click', fn, true)`), que corre antes que cualquiera
  de burbuja. ⚠️ Y el id del `<select>` oculto pasa a ser un **contador global**: el bloque se pinta
  hasta dos veces en la misma página (la ficha y el asistente) y el id de antes podía repetirse.
  · **LA FICHA SE VE IGUAL QUE EL ASISTENTE**: `_activity_contacts.html` gana el modo **`ac_readonly`**
  y la ficha lo usa para PINTAR (antes lo hacía por su cuenta: una tira fina al final, sin la ayuda de
  cada función y **escondiendo las que no tenían a nadie**). Ahora las cuatro salen siempre —lo que
  está sin asignar es justo lo que hay que rellenar— y debajo, «Otras personas de contacto».
  ⚠️ Un solo parcial para las tres pantallas: no se pueden desparejar.

- ⚠️⚠️ **UN COMISIONISTA PUEDE SER LA PRODUCCIÓN LOCAL** (sep 2026). Al añadir un comisionista se
  pregunta **«¿Es la producción local de la actividad?»** (en el asistente y en la ficha). Si lo es:
  · se guarda en **`ConcertZoneAgent.is_local_production`**, y
  · se pone como contacto de **Producción local** — y si esa empresa tiene **REPRESENTANTE**, es **SU
  ficha** la que queda de contacto, que es a quien se llama el día de la actividad.
  · Punto único **`_zone_agents_apply_local_production`** (+ `_local_production_contact_for`), que
  corre al guardar el asistente y la sección «Comisiones» de la ficha; el asistente además rellena la
  tarjeta **en vivo** (`/api/terceros/<pid>/produccion-local` + `app33ActivityContacts.set`), así que
  se ve puesto antes de llegar al paso de contactos.
  ⚠️ **No pisa lo que se haya puesto a mano**: solo rellena si esa función está vacía o si la ocupaba
  otro comisionista de la misma actividad. Y solo UNA comisión puede serlo (marcar una desmarca las
  demás).
  ⚠️ El contacto se guarda como **`THIRD` apuntando a la ficha**, así que el correo y el teléfono se
  leen EN VIVO: corregirlos en su ficha vale para todas sus actividades.

- ⚠️ **EL ALTA DE UNA ACTIVIDAD NO PREGUNTA POR LA HOJA DE RUTA** (sep 2026): las etiquetas de hojas
  de ruta salieron del asistente. Eso es trabajo de producción y se decide después, en su pestaña.
  Al no venir el centinela `roadmap_kinds_present`, `_parse_roadmap_kinds_form` deja **las dos
  activas**, que es lo de por defecto de siempre.

- ⚠️⚠️ **CONTACTOS DE UNA ACTIVIDAD · se ponen SIN TOCAR EL PROMOTOR** (sep 2026, rediseño de
  `_concert_contacts_picker.html` + `static/js/concert_contacts.js`). Antes solo se podía elegir UNA
  persona por función de entre las que ya colgaban del promotor, y **sin promotor no se podía poner
  nada** («Elige antes el promotor»).
  · **Al elegir el promotor se cargan SUS personas** para marcar las que van a la actividad
  (`api_concert_contact_options`, que acepta `?promoter_id=` para recalcularlo **sin haber guardado**:
  el selector escucha el `change` del promotor, también el de Select2). Se ofrecen, en este orden:
  las **personas del promotor**, **el PROPIO tercero con los datos de contacto de su ficha**
  (`_promoter_self_contact_option`), los **terceros VINCULADOS con él** (las vinculaciones de la casa:
  el director de la sala, su representante…) y las que **ya están** en la actividad.
  · **Se busca en TODA la base** (`api_contact_search`): un medio, una sala, cualquiera — la persona
  puede estar ya dada de alta colgando de otra ficha y lo que interesa es reutilizarla.
  · **Al crear una persona nueva se PREGUNTA si se vincula al promotor** (`link_to_promoter`, marcado
  por defecto): apuntar a alguien en una actividad no siempre significa que tenga que quedarse en la
  ficha del tercero. Y sigue avisando de las que se le parecen para no duplicarla.
  · ⚠️ **SIN PROMOTOR también se pueden poner contactos**: `PromoterContact.promoter_id` pasa a ser
  **NULL-able** y esas personas quedan colgadas solo de la actividad.
  · ⚠️ **Una persona puede llevar VARIAS funciones y una función puede ser de VARIAS personas**
  (`ConcertContact.roles` ya era una lista). El formulario manda `cc_contact_ids[]` y, por cada una,
  `cc_roles_<id>[]`; `_parse_concert_contacts_form` sigue aceptando el formato antiguo
  (`contact_<rol>_id`) por si queda una pantalla vieja en caché. Una persona **sin función se guarda
  igual**: está en la actividad aunque no se le haya puesto etiqueta.
  · «El propio X» necesita una fila de contacto para poder colgarse: la crea
  `api_promoter_self_contact`, que es un **get-or-create** (si no, cada vez que se eligiera se
  duplicaría la misma persona).
  ⚠️ El selector se recablea con `inline:updated` y `ficha:shown`: la ficha reemplaza zonas por AJAX.

- ⚠️⚠️ **MIS TAREAS PENDIENTES · LO DE UN MISMO TODO ES UNA SOLA TAREA** (ago 2026, rediseño de
  `_home_my_tasks` + `templates/_home_direccion.html`, clases `.mytask*`). Antes era una lista plana
  y una misma actividad aparecía tres veces (confirmar con el artista, confirmar al promotor, activar
  producción): parecían tres trabajos y era uno.
  · **Una FILA por SUJETO** (la misma actividad · el mismo concierto · el mismo proyecto · la misma
  promoción · la misma remesa): **la IMAGEN CUADRADA** (ver abajo), la **ETIQUETA de qué es**
  con su icono en el **azul de la marca** (`MY_TASK_KINDS`: Concierto · Actividad · Proyecto
  discográfico · Promoción · Remesa de pagos · Vacaciones · Cartelería · Petición), el título y, debajo,
  **UNA SUBTAREA POR COSA** con su **estado** (Pendiente · Solicitado · Esperando · Hecho · Rechazado).
  · A la derecha de cada subtarea, el **botón SIN RELLENAR** que lleva a hacerla; **pinchando en
  cualquier otro sitio** de la fila se abre la **ficha** de lo que está pendiente.
  · ⚠️ **LA IMAGEN ES CUADRADA, no un círculo** (el círculo es de las personas):
  **`_my_task_images`** pone la **PORTADA** del lanzamiento en un proyecto —y la imagen de **«sin
  portada»** (`img/cover_placeholder.png`, la misma del repertorio) si todavía no hay— y el **CARTEL**
  en un concierto, festival o ciclo; si no hay ninguna, el **icono del TIPO de actividad**
  (`QUAD_ACTIVITY_ICONS`, con `type_icon`). Va en **DOS consultas** (los proyectos de una vez y las
  actividades de una vez), no una por fila.
  ⚠️ El icono se pinta **SIEMPRE debajo** de la imagen y el `<img>` lleva `onerror="this.remove()"`:
  una portada caída deja el icono, no un cuadro vacío.
  · **EL ARTISTA va SIEMPRE en la SEGUNDA fila**, con su **foto delante** (`artist_chip`) y **antes
  de la fecha**: es de quién es lo que está pendiente.
  ⚠️⚠️ **LA ETIQUETA de una actividad la decide `_my_task_activity_kind`**: un CONCIERTO es
  **«Concierto»** aunque se toque en un festival — **«Festival» y «Ciclo» son solo lo NUESTRO**, lo
  creado desde Festivales o Ciclos (`Concert.cycle_festival_id` → el `kind` de su `CycleFestival`).
  Una actuación en el festival de otro (`activity_type='FESTIVAL'`) es un concierto y así se etiqueta.
  · **EL TÍTULO es su nombre propio** (el del festival o el del ciclo) y, **si no tiene, el LUGAR**:
  «Municipio, Provincia» (`_place_label`, el formato único de la casa), que es como se identifica un
  concierto.
  · **EL ORDEN de la primera línea**: la etiqueta de QUÉ ES · el nombre (o el lugar) · **la BANDERA
  del país si la actividad es FUERA de España** · y al final **«Nueva»**.
  ⚠️ Lo de fuera lo decide **`_is_foreign_country`**, que se apoya en **`address_utils.is_spain`** —
  el mismo criterio que el formato de las direcciones, así que «lo que lleva país» y «lo que lleva
  bandera» no se pueden desparejar. **Sin país no se supone nada raro**: es España (el valor por
  defecto de los formularios).
  ⚠️ Y el país **NO se escribe además** en el lugar (por eso ahí `_place_label` va sin él): la
  bandera ES cómo se dice, y ponerlo dos veces sobra.
  ⚠️ `añade()` cae en la etiqueta de la subtarea cuando no le llega título («Activar la
  producción»), así que se guarda **`title_given`** para saber si venía uno DE VERDAD: sin eso, el
  nombre de la fila acababa siendo el de la tarea (bug real).
  · **Ordenadas de la más próxima a la más lejana** (`_my_task_date`); lo que **no tiene fecha** va al
  final, no se descarta.
  · **«Nueva» hasta que se abre**: se apunta en `UserProfile.tasks_seen` (JSONB) por la clave de la
  fila (`home_task_seen`, `POST /mis-tareas/vista`, en `PERSONAL_ENDPOINTS` — son tareas propias), así
  que vale desde cualquier sesión y no solo en ese navegador.
  ⚠️ **CORTE `MY_TASKS_FROM` (31-ago-2026, LUNES)**: lo anterior a esa fecha **no reclama nada** (antes
  de eso la app no se usaba para todo y el módulo salía con cientos de cosas viejas). Mismo criterio que
  `PITCH_TASK_FROM` / `SALE_NOTICE_TASK_FROM`.
  ⚠️⚠️ **Lo que NO tiene fecha NO caduca con el corte** (registros de AGEDI, SGAE, un pitch sin
  escribir…): se queda pendiente. Filtrar por fecha lo que no la tiene habría borrado justo el trabajo
  que lleva más tiempo esperando.
  ⚠️ Una subtarea **BLOQUEADA no se pinta** (no se puede hacer todavía) y lo que es **de otra persona**
  tampoco: eso está en el CUADRO DE MANDO.

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
- **FICHA DE ACTIVIDAD · la cabecera lo dice todo** (rediseño ago 2026, `concert_detail.html`):
  · Arriba a la **derecha**, la **empresa del grupo que factura** (`.hero-company`; si no se ha dicho
  quién factura, la empresa del grupo que promueve).
  · En la línea de datos, el **AFORO** con su icono (`fa-people-group`), junto a fecha y recinto.
  · Al lado del estado, dos etiquetas nuevas y **clicables** (parciales
  `_concert_announcement_badge.html` y `_concert_onsale_badge.html`): **ANUNCIO** (rojo «No anunciar»
  · verde «Anunciado» · amarillo «Anuncio: fecha») y, **solo si la actividad vende entradas**
  (`ticketing_payload.entry_mode == 'SALE'`), **VENTA** (verde «A la venta», con la fecha en que
  salió al pasar el ratón · amarillo «Venta: fecha»). Se cambian en su propio desplegable, con
  endpoints propios **`concert_announcement_set`** y **`concert_onsale_set`**.
  ⚠️ NO pasan por `concert_section_update`: la sección «datos» EXIGE la fecha de salida a la venta
  (revienta si llega vacía) y la sección «entradas» BORRA toda la configuración de venta si no le
  llega `entry_mode`. Escriben solo sus dos columnas.
  ⚠️ El parcial de la venta saca el `entry_mode` del **propio concierto**, no de una variable de
  contexto: así vale en cualquier pantalla (en la ficha, `entry_mode` es un `{% set %}` local de la
  pestaña de ticketing y no se ve desde la cabecera).
  · **Fuera** el botón de «Ficha interna» de la fila de accesos rápidos, el de «Activar producción»
  de la cabecera y **las 12 tarjetas** de resumen que había bajo las pestañas (repetían la cabecera).
  El botón **«Producción» pasa a ser «Activar producción»** (misma estética verde) y **desaparece en
  cuanto la producción está activada**.
  · La **ficha de contratación es COMPACTA**: «Más información» usa el patrón de tabla de la ficha del
  tercero (`psum-list` a dos columnas, `.psum-list--2col`), etiqueta y valor pegados.
  ⚠️ La lista `summary_labels` de lo que NO se repite está DUPLICADA en el PDF
  (`concert_contract_sheet_pdf`): si se toca una, se toca la otra.

- **CARTELERÍA · ENLACE PÚBLICO para verla y descargarla** (ago 2026): `/carteles/<token>`
  (`public_artwork_view`, plantilla `public_artwork.html` standalone). Estilo de casa: el logo de la
  empresa del grupo arriba a la **derecha**, **«Cartelería»** centrado, la **cabecera de la actividad**
  igual que en la app (`_contract_sheet_hero_rows`), **«Descargar Cartelería»** centrado y debajo los
  formatos: cada uno con su **proporción DIBUJADA**, su tamaño en píxeles, su extensión y la
  miniatura, que se pincha para descargarlo (más «Descargar todos en un ZIP»).
  ⚠️⚠️ Antes se compartía **la pestaña de la app** (y, al «compartir los carteles», la lista de URLs
  de **Storage**): quien lo recibe —el artista, el promotor— **no tiene usuario**, así que el botón
  «Descargar Carteles» del aviso de salida a la venta le llevaba a la pantalla de acceso (bug real).
  Ahora ese botón y el menú «Compartir con el artista / con el promotor» mandan este enlace, y desde
  la pestaña se puede **ver la página que van a recibir**.
  · Puntos únicos: **`_concert_artwork_share_assets`** (los carteles APROBADOS de la actividad y, si
  no tiene, los de TODA su gira o ciclo — lo mismo que enseña el aviso), **`_concert_artwork_share_url`**
  y `_artwork_zip_response` (el ZIP, compartido con la descarga de dentro).
  ⚠️ El token es **OPACO y DISTINTO** del de `ConcertArtworkRequest`: con ese se **suben** carteles y
  con este solo se ven y se descargan (mismo criterio que los dos tokens de las autorizaciones de
  menores). Vive en `Concert.artwork_share_token` y se crea la primera vez que hace falta.
  ⚠️ **La ruta es `/carteles/…`, NO `/carteleria/<token>`**: esa ya la tiene el formulario donde diseño
  o el promotor SUBEN los carteles, y dos reglas iguales se pisan — gana la primera, así que la página
  no se habría podido abrir nunca y **sin dar ningún error**.
  ⚠️ **Nunca sale la dirección de Storage**: la miniatura y la descarga van por
  `public_artwork_file` / `public_artwork_download` (nuestro dominio), y un cartel que no sea de esa
  actividad —o rechazado— da 404. Esos enlaces son **relativos** (son de la propia página); el
  absoluto con host canónico se reserva para lo que se comparte fuera y para la miniatura `og:`.
  ⚠️ El tamaño de cada miniatura se calcula **en píxeles en el servidor** (`frame_w`/`frame_h`, dentro
  de un hueco fijo para que todas las tarjetas midan igual): dejándolo a `aspect-ratio` + `max-width`
  en el CSS, un banner 4:1 se quedaba **casi cuadrado** (el navegador recortaba el ancho pero no
  bajaba el alto).

- **CARTELERÍA GENERAL DE UN EVENTO** (ago 2026): un **evento** (el sujeto, `AppEvent`) tiene su
  propia pestaña **Cartelería** con los carteles **comunes a TODAS sus actividades**, y en cada
  actividad de ese evento se ven **también** —en su propio módulo, junto a los de esa fecha—.
  · Es la MISMA pieza que la de una gira o un ciclo: `ARTWORK_GROUP_KINDS` gana la clave **`EVENT`**
  (con `AppEvent` en `_artwork_group_owner`) y los endpoints `group_artwork_*` la aceptan solos,
  porque validan contra ese catálogo.
  ⚠️ **Una fecha puede tener MÁS DE UNA cartelería general**: la de su evento y la de su gira o
  ciclo. Por eso existe **`_concert_group_refs`** (todas, de la más amplia a la más concreta) y la
  ficha pinta **un módulo por cada una** (`artwork_groups`); `_concert_group_ref` se conserva
  devolviendo la más CONCRETA (ciclo o gira antes que evento) para lo que ya la usaba.
  ⚠️ El **respaldo** de la cartelería que se COMPARTE (`_concert_artwork_share_assets`) recorre esos
  grupos del más CONCRETO al más amplio (`ARTWORK_GROUP_SHARE_ORDER`): antes solo miraba la gira y el
  ciclo, así que la general de un EVENTO no salía en el enlace público ni en el aviso de venta.

- **UN CARTEL PUEDE SER UN VÍDEO** (ago 2026): los anuncios de redes lo son casi siempre. Se sube
  igual que una imagen o un PDF (arrastrando, en la ficha, en la cartelería general y en el enlace de
  diseño/promotor) y se ve con su **miniatura** y una chapa de **play**; al pincharlo se abre en un
  **pop-up con el reproductor** (`#artVideoModal`, uno para toda la app en `layout.html`, por
  delegación sobre `data-art-video`).
  · **De qué es cada cartel: punto único `_artwork_kind_of`** (global de plantilla **`artwork_kind`**)
  → IMAGE | VIDEO | PDF. Manda la columna **`ConcertArtworkAsset.kind`** y, en los carteles
  ANTERIORES a esa columna (todos con el valor por defecto IMAGE), su nombre o su mimetype
  (`_artwork_asset_kind`, que quita la cola «?…» de las URL de Storage).
  · **Cómo se PINTA: `templates/_artwork_media.html`** (macros `art_media` y `art_open_attrs`), usado
  en los TRES sitios donde se enseña un cartel (la pestaña de la actividad, el panel de la general y
  la página pública). Al añadir otro sitio, se usa ese macro.
  ⚠️ La miniatura va como **`poster` del propio `<video class="video-thumb">`**, no como un `<img>`
  aparte: si la miniatura fallara, el sistema global de respaldo de imágenes **oculta** el hueco
  (`img[src*="/img/placeholder_photo"]{display:none}`) y el cartel desaparecía; así se ve el
  fotograma del vídeo y, en el peor caso, el recuadro oscuro con el play.
  · **La MINIATURA la saca ffmpeg en 2º plano** (`_artwork_poster_schedule` →
  `ConcertArtworkAsset.poster_url`, el mismo motor `_video_generate_poster_bytes` que el póster de un
  videoclip o de un vídeo de la galería, que lee por RANGO y no se baja el vídeo entero).
  ⚠️ **El cartel PRINCIPAL es SIEMPRE una IMAGEN** (`_artwork_can_be_primary`): representa la
  actividad en la miniatura del enlace, en el aviso de salida a la venta y en la cabecera de las
  invitaciones. Lo comprueban el automático (`_artwork_pick_primary_by_squareness`) y **los dos
  endpoints de marcarlo a mano** (esconder el botón no basta). `_artwork_image_src` da la URL usable
  COMO IMAGEN (de un vídeo, su miniatura; de un PDF, nada) y con ella se elige la `og:image`;
  `_concert_poster_url` (cabecera de invitaciones) exige IMAGE de verdad, ni siquiera la miniatura.
  · **En la página pública NO se reproduce**: es de descarga, y servir un vídeo por el puente
  (`public_artwork_file`, que lo baja a memoria y no admite `Range`) sería bajárselo entero en cada
  carga. Se ve su miniatura (`?poster=1` en ese mismo puente) con el icono de película y el play, y
  se descarga como los demás. Un vídeo sin medidas se dibuja **16:9**, no cuadrado.
  ⚠️ **Un archivo que no se admite ya NO tumba el lote**: antes el `ValueError` de `upload_image`
  (un `.heic`, un `.txt` que venía en la carpeta) reventaba el bucle, se deshacía TODO y los ya
  subidos se quedaban en Storage sin fila. Ahora se apunta en `skipped` y **el modal lo dice** al
  terminar, en vez de recargar como si todo hubiera entrado.
  ⚠️ Los `<input type="file">` de los tres sitios llevan `accept="image/*,video/*,application/pdf"`
  **y** los dos modales de dentro tenían un filtro en JS que **descartaba en silencio** todo lo que
  no fuera imagen o PDF: un vídeo arrastrado desaparecía de la cola sin decir nada (bug real).

- **LOGOTIPOS de una marca, con TODAS sus versiones** (ago 2026). Un logo no es UN archivo: son
  muchos (principal, horizontal, negativo, isotipo, el vectorial de imprenta, el manual de marca…) y
  **cada versión lleva su NOMBRE**, que es lo que se dice al pedirlos («mándame el negativo en
  vectorial»). De aquí salen los **logos obligatorios** que se le comunican al productor de un
  videoclip, con su enlace de descarga.
  · Modelo **`BrandLogo`** (polimórfico como las fotos: `owner_type` **COMPANY | DISTRIBUTOR |
  ARTIST** + `owner_id`, `name`, `file_url`, `kind`, `sort_order`), catálogo de nombres sugeridos
  `BRAND_LOGO_NAMES` (**libre**: va en un `datalist`, no se impone) y puntos únicos
  `_brand_logo_rows` / `_brand_logo_context` / `_brand_logo_owner(_name)`.
  · Panel único **`templates/_brand_logos_panel.html`** (clases `.blogos*` / `.blogo*`), incluido en
  la **ficha de la empresa del grupo** (Datos → Logos), en la **ficha del artista** (Datos) y en
  **Distribuidoras**. Endpoints `brand_logo_save` / `brand_logo_delete`.
  ⚠️ El vectorial (.ai/.eps) y los paquetes (.zip) **no se pintan**: van por `upload_file`
  (`_upload_brand_logo_file`, hermano de `_upload_artwork_file`), se ven con su icono y se descargan.
  ⚠️ El hueco lleva un **tablero de ajedrez** de fondo: así se ve de un vistazo si el PNG tiene el
  fondo transparente o lo trae horneado en blanco (que es el bug que ya documenta `logo_clean_png`).
  ⚠️ **Subiendo VARIOS archivos a la vez**, cada uno se queda con el nombre de SU archivo: con un
  solo nombre para todos, las versiones no se distinguirían.
  ⚠️ En **Distribuidoras** (que es un listado, no una ficha) el panel se abre con **`?logos=<id>`** y
  se pinta debajo de la rejilla — **no uno por tarjeta**: el panel trae su propio modal con un id
  fijo y con veinte distribuidoras habría veinte ids repetidos en el DOM.

- **SIN FOTO NI LOGO → MUÑEQUITO GRIS** (ago 2026, `static/img/avatar_placeholder.png` + `.svg`,
  global **`DEFAULT_AVATAR_URL`**). Se aplica al **personal de la oficina** y a los **terceros**: donde
  antes salía el logo de la casa (o nada) ahora sale el avatar gris, y vale para los que ya estaban
  creados porque el respaldo es **al pintar**, no un dato guardado.
  ⚠️ **NO se puede usar `placeholder_photo`** para esto: hay una política global en `styles.css`
  (`img[src*="/img/placeholder_photo"]{ display:none }`) que dice «sin imagen → el hueco se OMITE», y
  aquí se quiere justo lo contrario. Por eso es un archivo nuevo, que no casa con esa regla; el resto
  (ticketeras, eventos, vinculaciones…) mantiene la política de omitir.
  · El sistema global de respaldo de imágenes (`initImageFallbacks` en `scripts.js`) también lo
  entiende: una imagen marcada con **`data-avatar="1"`** (o `.user-nav-avatar`) que falle cae al
  muñequito en vez de al hueco omitido (`data-default-avatar-url` en el `<body>`).

- **NOTAS DE PRENSA · CONTACTOS, CARTELERÍA, LOGOS y ETIQUETAS DE MEDIOS** (sep 2026):
  · **El editor ya no enseña «Atajos» ni «Cómo llegará»** (estorbaban): los atajos siguen funcionando
  (Supr · ⌘C/⌘X/⌘V/⌘D · flechas · Escape · ⌘S viven en `press_editor.js`), solo se quitó el texto.
  · **El módulo de CONTACTO es una LISTA** (`data['contacts']`, punto único `_press_contact_rows`):
  **SIEMPRE** el de prensa (Nuria) y **QUIEN CREA la nota** (`PressRelease.created_by_user_id`), y
  debajo los que se añadan del **PERSONAL de la casa** (`ref['user_ids']`, con su foto): cada uno sale
  como **«Contacto de <Departamento>»** (`_press_staff_row`, con `_profile_departments` y el móvil de
  `_user_sms_phone`) y, debajo, igual que la tarjeta de prensa: nombre · correo · teléfono. Pinchar el
  módulo (o «Añadir otro» en su panel) abre `#prContactsModal`: los fijos con «Siempre», los añadidos
  con papelera, y el buscador de personal (`promo_press_staff_search`, `/notas-de-prensa/buscar-personal`).
  ⚠️ El HTML de la lista lo pinta el SERVIDOR (`promo_press_block_html` → `data.contacts`); el pop-up
  solo enseña ese `data`. Los diseños antiguos con un solo contacto en `data` se siguen leyendo.
  · **Módulo nuevo `artwork` (CARTELERÍA)**: los carteles APROBADOS de la actividad
  (`_press_artwork_data`, ref `{"concert_id"}`) y, como módulos aparte, la cartelería **GENERAL** de su
  gira, ciclo o evento (ref `{"group_kind", "group_id"}`, uno por grupo). Enlaza a la **MISMA página
  pública** que se comparte con el artista (`_concert_artwork_share_url` / `_group_artwork_share_url`)
  y al ZIP si se marca la descarga. Sin carteles se ve como hueco en el editor y no se pinta fuera.
  · **LOGOS en la paleta** (`_press_brand_logo_items`, grupo `logos`): el de la empresa del grupo de la
  actividad (la que factura o promueve), su ciclo, su evento, la empresa SUJETO, el remitente de un
  envío a compradores y las versiones de «Logotipos» (`BrandLogo`). Son items **`kind: image` con la
  URL ya puesta**: al arrastrarlos se colocan sin preguntar (180 de ancho) y se mueven y redimensionan
  como todo; `nuevoBloque('image', …, {ref})` respeta la URL preset y `midePreset` mide la imagen.
  · **ETIQUETAS DE MEDIOS** (`MediaTag` + `MediaOutletTag`, `ensure_media_tags_schema`; mismo patrón
  que los géneros de una canción): catálogo ABIERTO con `norm_key` único («Radio Local» = «radio
  local»); helpers `_media_tag_get_or_create` · `_media_tag_names` · `_media_tags_map` (UNA consulta)
  · `_apply_media_tags(…, present=)` (centinela `media_tags_present`) · `_media_tag_catalog`. Se
  editan en el alta y en la ficha del medio con el MISMO gestor que los géneros (`song_genres.js`,
  `data-genre-field="media_tags[]"`), salen como etiqueta (`.media-tag`) junto al tipo en la tarjeta y
  en la cabecera, y **se filtra por ellas** en `/medios?tag=` (⚠️ con una SUBCONSULTA, no JOIN +
  DISTINCT: Postgres no admite ordenar por `lower(name)` con DISTINCT — lo sacó la prueba).
  · **En el ENVÍO de una nota** cada medio lleva `data-media-tags` y hay una fila de **chips de
  etiqueta** (`data-pr-tagchips`, `pintaEtiquetas` en `press_send.js`): se ofrecen las de los medios A
  LA VISTA (los del tipo elegido), una está encendida cuando TODOS sus medios están marcados (a medias,
  `.is-half`), y al pincharla se marcan o se quitan de golpe. Así, tras «todas las radios», se ve qué
  etiquetas van dentro por si se quiere quitar alguna; y al revés, se eligen medios por etiqueta.
  `_press_recipient_groups` devuelve además `media_tags` (medios y contactos por etiqueta).

- ⚠️ **FOTOS · CON UNA SOLA SELECCIONADA YA SE PUEDE HACER TODO** (ago 2026): la barra de acciones en
  bloque (y sus **tres puntitos**: pedir aprobación, marcar el estado, añadir a un álbum, editar en
  bloque, descargar, compartir, eliminar) salía a partir de **DOS** fotos (`n <= 1` en
  `updateBulk`, `fotos.js`), así que seleccionar UNA para pedir su aprobación no ofrecía nada y
  parecía que la aprobación no estaba puesta —pasó en las fotos de un EVENTO, donde el circuito
  funciona igual: `PHOTO_OWNER_TYPES` incluye `EVENT` y `fotos_approval_create` lo acepta—.
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

- **AVISOS · rediseño (ago 2026)**: más simples y más modernos. La FRANJA es ya una tarjeta blanca
  con esquinas redondeadas y sombra suave (fuera el bloque amarillo con la barra roja), con el icono
  en una pastilla del color de marca y el «Ver» como botón redondeado. En la CAMPANITA y en «Mis
  avisos», lo NO LEÍDO se marca con un **punto** de marca a la izquierda, no con fondo amarillo, y
  el cuerpo se recorta a dos líneas para que la lista se lea de un vistazo.

- ⚠️⚠️ **COMPARTIR CARTELERÍA · LO QUE SE MANDA ES LA PÁGINA, Y SU TÍTULO LO DICE TODO** (sep 2026).
  Al compartir **un cartel** se mandaba la **URL cruda de Storage**: en WhatsApp salía un enlace
  pelado (una URL de Storage no tiene `og:` ninguna) y lo que se abría era el archivo suelto — «la
  previsualización y el contenido no cargan bien». Y el «compartir todo» sí mandaba la página, pero
  su título era «Cartelería · \<nombre\>» y su subtítulo «N formato(s) para descargar», que no decían
  ni de qué actividad era ni qué cartel se estaba mandando.
  · **UN SOLO ENLACE PÚBLICO para las dos cosas**: `/carteles/<token>` sirve la cartelería de una
  **ACTIVIDAD** y la de un **GRUPO** (gira, ciclo, festival, evento) — punto único
  **`_artwork_share_target`**, así que la página, sus descargas, su ZIP y su miniatura son los MISMOS
  cuatro endpoints en vez de duplicarlos. El token del grupo vive en
  **`ConcertArtworkRequest.share_token`** (opaco, y **distinto de `public_token`**: con ese se SUBEN
  carteles y con este solo se ven y se descargan).
  · **`?f=<asset_id>`** = el cartel que se ha compartido: sale **el primero y marcado**, la página
  dice «Te han compartido \<nombre\>» y de él salen la miniatura y el subtítulo del enlace.
  · **`?cat=LOGO`** = los **logotipos** de un grupo (que no se mezclan nunca con los carteles).
  · **EL TÍTULO Y EL SUBTÍTULO son un punto único** (`_artwork_share_meta` sobre
  `_artwork_share_subject`), y se usan en el `<title>`, en las `og:` y como asunto de lo que se
  comparte desde la app:
  **«Cartelería, \<tipo de actividad\>, \<artista o evento\>, \<nombre de la actividad o el
  municipio\>»** y debajo **el nombre del cartel** que se manda (su formato, p. ej. «Vídeo
  promocional gira»); compartiendo todo, cuántos formatos hay y cuáles. En un grupo, «Cartelería,
  Gira, \<nombre\>» (y «Logotipos, …» con `cat=LOGO`).
  ⚠️ El TIPO es lo que ES la actividad (`_activity_kind_label`), no su tipo de venta, y el cuarto
  elemento es el **festival y, si no tiene, el municipio** — el mismo criterio que el asunto del
  aviso de salida a la venta.
  · **La MINIATURA** es el cartel compartido → el principal → cualquiera que sea imagen → la foto
  del artista → el logo, y **NUNCA da 404** (en WhatsApp un 404 se ve como un enlace pelado). De un
  cartel en **VÍDEO** se usa su miniatura y un **PDF** no vale (`_artwork_image_src`).
  ⚠️ **El id del cartel viaja en la URL**: `_artwork_public_asset_or_404` lo valida contra lo que ESE
  token puede enseñar (sus carteles y, en un grupo, también sus logos), así que con el token de una
  actividad no se baja un cartel de la gira ni al revés (comprobado).
  ⚠️ Un cartel **ARCHIVADO o RECHAZADO no está en la página pública**, así que ahí no se ofrece
  «copiar el enlace»: se descarga y ya (antes se ofrecía la URL de Storage, que es justo lo que no
  debe salir de casa).
  ⚠️ En el panel del grupo, `gk_share_url` va **sin parámetros** y `gk_brand_share_url` **siempre con
  `?cat=LOGO`**, así que el enlace de una pieza concreta es `…url ~ '?f=' ~ id` y `…url ~ '&f=' ~ id`.
  ⚠️ La imagen de una **GIRA** no es la foto de una persona: en la galleta de la página va cuadrada
  (`.galleta__foto.is-square`), no en círculo.

- ⚠️⚠️ **REPRODUCIR UN VÍDEO NO PASA POR EL SERVIDOR** (sep 2026, bug real: «el vídeo se ve a
  trompicones y se para todo el rato, no se puede ver seguido»). En la cartelería pública el vídeo se
  servía por el puente (`_playlist_audio_response`), y eso lo hace inviable por tres razones que se
  suman: entra por nuestro Render **en trozos de 64 KB** (urlopen → generador de Python → gunicorn),
  **ocupa un hilo** de los 16 que tiene toda la app mientras dura la reproducción, y sobre todo va con
  **`Cache-Control: no-store`**, así que el navegador **no puede guardar nada**: cada rebuffer y cada
  salto de la barra lo vuelven a pedir entero y el reproductor se queda sin colchón.
  · **REPRODUCIR es su propia URL**: `public_artwork_file?play=1` responde un **302** al archivo
  (`play_url` en la fila pública), así que el navegador lo baja de Storage con su CDN, su `Range` y su
  caché. Medido: el buffer llega al final del vídeo en la primera pasada.
  ⚠️ El `no-store` **no es una decisión de la cartelería**: viene de las PLAYLISTS, donde hay un
  interruptor de descarga que lo justifica. En la cartelería todo es descargable a propósito, así que
  ahí no protege nada. Se cambia **en la rama de cartelería**, nunca en el puente: es un punto único
  con seis consumidores (playlists dentro y fuera, demos compartidas, syncros).
  ⚠️ Esto **no rompe** la regla de no enseñar la URL de Storage, que habla de la **miniatura** y de la
  **descarga**: lo que se comparte sigue siendo la página, la descarga sigue yendo por nuestro dominio
  —tiene que ir: el `download` de un `<a>` lo ignoran los navegadores en otro dominio— y la puerta
  sigue siendo `_artwork_public_asset_or_404`. Dos páginas públicas de la casa ya reproducían así (las
  fotos compartidas y el cronograma de un plan) y **dentro de la app el mismo vídeo iba fino justo por
  eso** (`_artwork_media.html` apunta a Storage).
  ⚠️⚠️ **La MINIATURA sigue por el puente A PROPÓSITO** (mismo origen): es lo que permite a
  `video_thumb.js` medir el brillo del fotograma en un `<canvas>` y no dejar uno NEGRO. Con un vídeo
  de otro dominio el lienzo se «mancha» y `getImageData` lanza excepción, así que se aceptaría el
  primer fotograma —el del fundido—. Por eso hay DOS URLs: `view_url` (puente, miniatura) y `play_url`
  (302, reproducir).

- ⚠️⚠️ **LA PROPORCIÓN LA ARREGLA EL NAVEGADOR, QUE YA SABE EL TAMAÑO** (sep 2026, bug real: «los
  vídeos son tamaño historia en vertical y la miniatura y el icono del tamaño son horizontales»).
  El marco de la miniatura y la silueta del formato salen de `ConcertArtworkAsset.width/height` y, sin
  ellas, caen a **16:9**. Las pone el subidor (`media_dims.js`) y, en lo ya subido, el hilo de ffmpeg —
  que puede no llegar (que no lea el archivo, que la caché negativa frene el reintento, que Storage
  falle). Pero **el navegador carga los metadatos del vídeo** para pintar la miniatura, así que el dato
  está delante: `video_thumb.js` avisa con el evento **`videothumb:size`** (el motor no sabe nada de
  esas pantallas: solo avisa, como `agenda:external-drop`) y la página de cartelería corrige **al
  momento** el marco, la silueta y la etiqueta, y lo **GUARDA** (`public_artwork_dims`, POST público
  con el token). Así, quien abre la página lo arregla para todos: la siguiente carga ya viene bien del
  servidor, y con ella el ZIP, la etiqueta del tamaño y la previsualización del enlace.
  · El hueco de la miniatura es un punto único (**`ARTWORK_PUBLIC_FRAME_BOX`** + `_artwork_public_frame`)
  y viaja al contexto de la página (`frame_box_w/h`) para que su JS use los MISMOS números; las
  etiquetas (`ratio_label`, `size_label`) las devuelve el propio endpoint, así que la tabla de
  proporciones no se duplica en JS.
  ⚠️ El endpoint **solo RELLENA lo vacío**: nunca pisa una medida que ya consta (lo que se midió al
  subir es lo bueno), así que dos personas midiendo a la vez no se pelean.
  ⚠️⚠️ **Un caso que sí se AFINA**: las medidas sacadas del póster son proporcionalmente buenas pero
  **más pequeñas**, porque el fotograma se escala por el ANCHO (`VIDEO_POSTER_MAX_SIDE` = 960): un
  1080×1920 quedaba apuntado como **960×1706** y eso es lo que se leía en la tarjeta. Se reconoce por
  el **ancho EXACTO 960** (la huella del póster) y se afina **solo si la proporción es la misma**.
  ⚠️ Con `max(w0,h0) <= 960` no valía: en un vídeo VERTICAL el lado mayor es el ALTO (1706), así que
  justo el caso a corregir se quedaba fuera. Y con la condición floja, cualquiera con el enlace podía
  inflar el tamaño que se enseña; con esta, no (comprobado).

- ⚠️⚠️ **LA FOTO DE UN EVENTO SE VE POR SU ARTISTA ESPEJO: el espejo SIGUE al evento** (bug real,
  sep 2026: «La Ruta del Aguilar se actualizó ayer y sigue saliendo la foto antigua en el reporte de
  ventas y en los filtros»). Un `AppEvent` se espeja como `Artist` porque una actividad exige
  artista, y **media app pinta la foto DEL ESPEJO**. `_ensure_artist_for_event` heredaba el logo
  **solo si el espejo no tenía ninguno**, así que al cambiar la foto del evento se seguía viendo la
  ANTIGUA en todas partes; y además solo se ejecutaba al crear actividades, nunca al guardar el
  evento.
  · Punto único **`_event_sync_mirror(session, event, *, logo_antes="")`**: pone al día el NOMBRE y
  **la FOTO** del espejo, y lo llaman `_ensure_artist_for_event` **y `event_update`**.
  · `logo_antes` arrastra también a los **ciclos/festivales** de ese evento que habían HEREDADO su
  logo y no le han puesto uno propio (a los que sí lo tienen no se les toca).
  · **Relleno puntual** `_event_mirrors_backfill_once` (marca `event_mirror_photo_backfill_v1`):
  arregla los eventos a los que ya se les había cambiado la foto. El espejo no se edita desde
  ninguna pantalla, así que ponerle la del evento no pisa nada escrito a mano.
  ⚠️ **Lo mismo con los MEDIOS**: el TERCERO espejo de un medio (`_ensure_promoter_for_media`)
  también heredaba el logo una sola vez → ahora lo sigue, y al guardar el medio se pone al día con
  **`_sync_media_mirror_logo`**.
  ⚠️ En un ARTISTA de verdad no hay problema de caché: `upload_image` genera la clave con un uuid,
  así que la URL cambia en cada subida. Si un día «no se ve la foto nueva», el sospechoso es un
  ESPEJO, no el navegador.

- **CONTACTOS · SE BUSCA EN TODA LA BASE Y SE VE LA FOTO** (sep 2026): `api_contact_search` devuelve
  ya, además de las personas de contacto, los **TERCEROS por CUALQUIER campo**
  (`_promoter_search_clause`: nick, nombre, correo, teléfono, CIF, sus sociedades y sus
  vinculaciones), que se añaden como «el propio X» —la fila la crea `api_promoter_self_contact`, que
  es un get-or-create—. Y `_promoter_contact_payload` lleva **`photo`** (el logo de SU tercero: una
  persona de contacto no tiene foto propia), que pintan las dos listas y las tarjetas ya elegidas.
  ⚠️⚠️ **VINCULARLA AL PROMOTOR SE PREGUNTA CON LAS DOS OPCIONES**: **«Siempre»** (queda en su ficha
  y saldrá en sus próximas actividades) o **«Solo para esta actividad»** (queda colgada de la
  actividad). Antes era una casilla marcada, que no explicaba la alternativa.

- ⚠️⚠️ **UNA FOTO DE TAMAÑO FIJO NO SE ENCOGE NUNCA: NI ELLA NI EL ENLACE QUE LA ENVUELVE** (bug
  real con captura, sep 2026: «en el reporte de ventas, en móvil, la foto del artista o del evento se
  distorsiona»). Es la trampa de siempre —**cualquier hijo de un flex se comprime a lo ancho
  manteniendo el alto**, así que el círculo sale OVALADO—, pero aquí el que se encogía **no era el
  `<img>`: era el `<a>` que lo envuelve**. Medido a 375 px: las 12 fotos debían medir 42×42 y había
  una en **15×42** (una tira).
  · Regla en `styles.css`: **`.artist-avatar, .artist-mini, .artist-avatar-inline, .station-logo
  { flex: 0 0 auto }`** y **`.avatar-link { flex: 0 0 auto }`** para el enlace (que hay que ponerle
  a mano en la plantilla). Es la misma regla que `.ficha-hero__media`.
  ⚠️ Al envolver un avatar en un `<a>` dentro de un flex, ese `<a>` lleva **`class="avatar-link"`**.
  · **EL LOGO DE UN EVENTO SE VE ENTERO** (`.artist-avatar--logo`: `object-fit:contain` sobre
  blanco): un logo es apaisado y con `cover` dentro de un círculo se le comen los lados. La FOTO de
  una persona sigue con `cover` (con `contain` quedaría diminuta y con franjas). Se distingue con
  **`c.artist.event_id`** — el artista de una actividad de evento es el ESPEJO y su foto es el logo.
  ⚠️ `.sales-card .artist-avatar { object-fit:cover }` tiene la misma especificidad, así que la del
  logo va DESPUÉS y con `.artist-avatar.artist-avatar--logo`.
  Comprobado en nueve pantallas a 375 px: cero avatares deformados y ninguna desborda.

- ⚠️⚠️ **CARTELERÍA · SI EL CARTEL LO HACE EL PROMOTOR, SE LE PIDE A ÉL** (sep 2026). Hasta ahora la
  cartelería solo se le podía pedir a **diseño**, así que en una fecha en la que el cartel lo hace el
  promotor no había nada que hacer desde la app. Ahora la tarjeta **«Sin peticiones de cartelería»**
  ofrece **los DOS caminos** —«Solicitar carteles a diseño» y **«Solicitar carteles al promotor»**—,
  con el de siempre RELLENO según quién promueva (lo decide `_concert_is_group_promoted`: si lo
  promueve un tercero, lo normal es que los haga él) y explicando la regla: *los que hace el promotor
  los aprueba diseño; los nuestros, quien gestiona la actividad*. La solicitud se puede hacer también
  desde la pestaña **Cartelería** de la ficha.
  · **EL CORREO tiene VISTA PREVIA EN VIVO** (`concert_artwork_promoter_preview`, `[data-aw-preview]`
  del modal, que se repinta al escribir): logo de la empresa del grupo arriba a la **derecha**,
  **«Solicitud de carteles»** centrado, el texto, la **cabecera de la actividad** con el botón **Subir
  carteles** DENTRO y abajo a la derecha, y debajo lo que se pida (los logos que tienen que salir, las
  ticketeras, las notas y la **fecha máxima**). Motor único **`_artwork_promoter_email`**, así que la
  previa ES el correo. ⚠️ La previa monta un **`SimpleNamespace`** con lo que hay en el formulario
  (todavía no se ha guardado nada).
  ⚠️⚠️ **AL PROMOTOR NO SE LE DICE «EVENTO PROMOCIONAL»**: eso es como lo llamamos NOSOTROS. Punto
  único **`_artwork_activity_word(concert, articulo=)`** (`ARTWORK_ACTIVITY_WORDS`): «el concierto» ·
  «el festival» · «el ciclo» · **«el evento»** · «el programa» · «la acción» · «el ensayo», usado en
  el texto **y** en el antetítulo de la cabecera (`datos["eyebrow"]`, que hay que pisar a mano).
  ⚠️⚠️ **EL `intro` DE `_notice_email_html` ES TEXTO PLANO** (bug real, visto en la vista previa): el
  motor lo **escapa** y lo mete en su propio `<p>`, así que pasándole HTML las etiquetas salen **A LA
  VISTA** en el correo (`<p>Buenas, …</p>`). El formato de un correo va en sus **`sections`** (que son
  **dicts** con `title`/`meta`/`due`/`icon`, no cadenas). Amarrado en la prueba de la épica.
  · **LA PÁGINA DEL PROMOTOR** (`/carteleria/<token>`) enseña lo mismo que el correo y debajo la zona
  de **arrastrar o elegir**: se puede soltar **una CARPETA entera** (`webkitGetAsEntry` +
  `recogeEntrada`, el mismo patrón que el modal de dentro), cada cartel se sube solo con su barra y el
  **nombre del archivo se usa como formato** (se puede corregir antes de subirlo). Lo subido se ve con
  su **MINIATURA** y el botón **«Enviar carteles»** aparece **en cuanto hay uno** (`refrescaEnviar`).
  ⚠️⚠️ Las miniaturas van por **`concert_artwork_public_file`**, no por `public_artwork_file`: ese es
  el de la cartelería que se COMPARTE (token distinto) y solo sirve lo **aprobado**, y aquí hay que
  enseñarle a quien sube lo que acaba de subir, que está PENDIENTE. La dirección de Storage no sale a
  la página, y el id del cartel se valida contra los de ESA solicitud.
  · **AL RECIBIRLOS se avisa a los DOS a la vez** (`_artwork_notify_received`): a **quien gestiona la
  actividad** (`_announce_alert_owner_ids`: contratación o el sello, según quién la creara) y a
  **DISEÑO**, que es quien tiene que darles el visto bueno — hasta que lo dan, los carteles no se
  pueden usar ni compartir. Kind nuevo **`ARTWORK_RECEIVED`**.
  ⚠️⚠️ **QUIÉN APRUEBA depende de QUIÉN LOS HIZO** (`_can_validate_artwork` + `_artwork_approver_msg`):
  los del **PROMOTOR** los aprueba **diseño**; los **NUESTROS**, **quien gestiona la actividad** (si la
  creó contratación, contratación). Dirección siempre.
  ⚠️⚠️ **EL 403 AL APROBAR**: la ruta `/conciertos/…` resuelve a `contratacion.conciertos` **con
  edición**, que diseño no tiene — así que quien tenía que aprobar se comía un 403. Regla de mapeo
  propia (**`ARTWORK_ACCESS_KEYS`** = diseño · contratación.conciertos · contratación, con
  `_first_access_key`) y **puesta ANTES** de la de `concerts_view`: detrás sería código muerto (gana el
  mapeo de la sección, la trampa que ya documenta contabilidad).
  · ⚠️⚠️ **UN CAMBIO DE FECHA, DE RECINTO, UN APLAZAMIENTO O UNA CANCELACIÓN PIDEN LOS CARTELES
  NUEVOS SOLOS**, a **quien los hizo** y **diciendo QUÉ hay que actualizar**: punto único
  **`_artwork_request_refresh(session_db, concert, motivo=, changes=)`**, que archiva los que había,
  deja la solicitud en REQUESTED y avisa —al **promotor** con el correo **CHANGES** y a **DISEÑO** con
  el suyo—. El detalle lo compone **`_artwork_changes_list`** comparando con el
  **`event_snapshot`** congelado de la solicitud (`ARTWORK_SNAPSHOT_LABELS`: «Fecha: 10/10/2026 →
  17/10/2026», el recinto, el municipio, la hora…). Enganchado en el guardado de la sección «Datos» y
  en **`_cancel_apply`** (CANCELADO → «hace falta el cartel que lo anuncia»; APLAZADO → «se ha
  APLAZADO al dd/mm/aaaa: hay que rehacer los carteles»).
  ⚠️ Es la MISMA idea que el cartel de **SOLD OUT**, que se pide solo al llegar al **90%**
  (`SOLDOUT_TRIGGER_PCT`, no al 80%) y vive en su propia sección.
  ⚠️⚠️ Esto corre desde un **cron o un hilo**, así que va dentro de **`_soldout_app_context()`**: hace
  falta un contexto de **PETICIÓN**, no solo de aplicación — con solo `app_context` el correo sale pero
  **el aviso de la campanita no llega a nadie** y el `except` se lo traga (la trampa que ya costó el
  Sold Out).

- ⚠️⚠️⚠️ **LA FECHA DE ANUNCIO Y LOS CARTELES SE LE PIDEN AL PROMOTOR EN UN SOLO CORREO** (sep
  2026, lo pidió Dani). Una actividad sin anunciar no se vende, y **quién decide cuándo se anuncia
  es casi siempre el promotor** — que además es quien hace el cartel en la mitad de las fechas.
  Hasta ahora eso era una llamada de teléfono.
  · **UN BOTÓN EN LA BARRA DE LA FICHA** que dice EXACTAMENTE lo que se va a pedir:
  **«Solicitar cartelería y fecha de anuncio»** · **«Solicitar cartelería»** (la fecha ya está
  puesta) · **«Solicitar fecha de anuncio»** (los carteles los hacemos nosotros). Cuando no queda
  nada que pedir **no hay botón**, y si el promotor ya contestó, la etiqueta verde **«Fecha de
  anuncio confirmada»**.
  · **Punto ÚNICO `_announce_ask_state(session_db, concert)`**: de ahí salen el botón, su pop-up, el
  correo y las dos páginas, así que no pueden decir cosas distintas. Lo que se pide lo decide el
  SERVIDOR también al enviar (si mientras el pop-up estaba abierto la fecha se puso por otro lado,
  no se pide dos veces).
  ⚠️ **Se le piden los CARTELES solo si los hace él y todavía no los ha mandado**: si están subidos
  esperando el visto bueno, lo que falta no es suyo. Y **sin promotor no sale el botón**: lo nuestro
  lo decidimos nosotros.
  · **EL CORREO** (`_announce_ask_email`, con su **vista previa EN VIVO** en el pop-up, que ES el
  correo): logo de la empresa del grupo arriba a la **derecha**, el título centrado —
  **«Confirmación fecha de anuncio y Cartelería»** · «Solicitud cartelería» · «Confirmación fecha de
  anuncio»—, el texto *«Tenemos pendiente anunciar el concierto de Móstoles, de Los Ñus. Por favor
  confirma la fecha de anuncio y compártenos el diseño de carteles.»*, la **cabecera de la
  actividad** con sus datos e iconos y, dentro y abajo a la derecha, **los DOS botones**: «Subir
  carteles» (rojo) y «Confirmar fecha de anuncio» (azul).
  ⚠️⚠️ **`_notice_email_html` ADMITE VARIOS BOTONES** (`buttons=[{label,url,style}]`): el de siempre
  (`button`) sigue igual. Dos botones rojos seguidos no se leen, así que el segundo va en el AZUL de
  la marca. Es el motor de TODOS los correos: se toca una vez y vale para todos.
  ⚠️ Con NOMBRE PROPIO la frase va pegada («el festival Sonorama») y con MUNICIPIO con «de» («el
  concierto de Móstoles»): al promotor se le escribe como se habla. Y **a una actividad de EVENTO no
  se le repite el artista** (es su espejo: sería «el evento X, de X»).
  · **PEDIR LOS CARTELES ES UN SOLO CORREO**: el modal de siempre de la pestaña Cartelería
  («Solicitar carteles al promotor») manda **ese mismo** y, si además falta la fecha, la pide en él
  (`_artwork_promoter_email` delega en `_announce_ask_email` cuando el motivo es REQUEST). Antes
  había dos textos para lo mismo. Los otros dos motivos —**han cambiado los datos** y **hay que
  corregirlos**— siguen con el suyo, que dicen otra cosa.
  · **LA PÁGINA DE LA FECHA** (`/anuncio/<token>`, `public_announce_confirm`): logo, título
  centrado, la cabecera de la actividad y un **CALENDARIO que va de HOY al día de la actividad**,
  con ese día **marcado** (`_announce_calendar_months`). Se pincha un día, se puede marcar **hora
  concreta** (opcional) y al confirmar **queda puesto en la actividad** (`announcement_date` +
  **`announcement_time`**, el mismo dato que se pone a mano desde la etiqueta de la cabecera). Se
  avisa a quien la gestiona (`ANNOUNCE_CONFIRMED`) y el reclamo de «sigue sin anunciar» **se cierra
  solo**.
  ⚠️ El calendario lo pinta el **SERVIDOR** (los días de fuera del tramo llegan apagados), así que la
  página vale aunque el JS no corra; y el servidor **vuelve a validar** el rango (una fecha pasada o
  posterior a la actividad no entra). La hora se **deshabilita** mientras no se marque: un campo
  oculto se envía igual.
  ⚠️ Es la vía de siempre de la casa: **se abre sin identificarse, lo autoriza su TOKEN y solo se ve
  ESO** (no mete a nadie en el portal de externos). Va en las tres listas de públicos y en
  `_CSRF_EXEMPT_ENDPOINTS` — un POST público sin eximir muere en un 302 a `/home` sin decir nada.
  · **LAS DOS PÁGINAS SE ENLAZAN ENTRE SÍ**: si se le pidieron las dos cosas, la de los carteles
  ofrece confirmar la fecha y la de la fecha ofrece subir los carteles. Se hacen de una sentada.
  · **PRUEBA DE REGRESIÓN: `/tmp/python/bin/python3 tools/check_anuncio_carteleria.py`** (57
  comprobaciones con la app real, de punta a punta).

- ⚠️⚠️⚠️ **UN CARTEL PASA POR DOS VISTOS BUENOS: DISEÑO Y DESPUÉS CONTRATACIÓN** (sep 2026, lo pidió
  Dani para TODOS los carteles, los suba el promotor o los haga diseño). Diseño mira que **esté bien
  hecho** y quien gestiona la actividad, que **los datos sean los buenos** (la fecha, el recinto, los
  logos, la ticketera). Hasta que no tiene los dos, **el cartel no se puede usar, ni compartir, ni
  descargar, ni ser el principal**.

      PENDING  →(diseño)→  DESIGN_OK  →(contratación)→  APPROVED
                                └────(cualquiera de los dos)────→  REJECTED

  · Puntos únicos: **`_artwork_asset_phase`** (en qué fase está), **`_artwork_can_review_phase`**
  (quién puede dar ESE visto bueno) y **`_artwork_apply_review`** (lo aplica; la usan la vuelta de la
  actividad y la de la gira/ciclo/evento). El PRIMERO queda apuntado aparte
  (`design_reviewed_at`/`design_reviewed_by_nick`), así que la ficha puede decir quién dio cada uno.
  · **El botón de aprobar sale SOLO a quien le toca esa fase** (`_artwork_review_rows`): pintárselo a
  quien no puede es un botón que devuelve 403. Los demás ven el cartel y su etiqueta —«Pendiente del
  visto bueno de diseño» / «Diseño le ha dado el OK · falta el de contratación»—.
  ⚠️ **NADIE NACE APROBADO**: lo que sube diseño nace en **`DESIGN_OK`** (sería absurdo pedirle que
  se apruebe lo que acaba de hacer) y lo que sube cualquier otro, en `PENDING`
  (`_artwork_new_asset_status`).
  ⚠️ **«Aprobar todos» da EL VISTO BUENO QUE TE TOCA**, no los dos: si lo pulsa diseño, los carteles
  se quedan esperando a contratación (y lo dice).
  ⚠️⚠️ **«PENDIENTE» ES LE FALTA ALGUNO DE LOS DOS**: todo lo que mira si la solicitud está entregada
  (`row.status`), el panel de la gira, la sección de Sold Out y lo que se enseña como «subido» cuenta
  **PENDING y DESIGN_OK**. Sin eso, un cartel a medio aprobar se enseñaba como bueno —y hasta como
  cartel PRINCIPAL de la actividad— antes de que nadie lo hubiera dado por bueno.
  · Diseño sigue viendo en su bandeja lo que espera **a ella** (`ARTWORK_REVIEW` = `PENDING`), y a
  contratación se le **reclama el segundo** en cuanto diseño ha mirado todos (`ARTWORK_APPROVAL`,
  `_artwork_ask_second_ok`) — no cartel a cartel.

- ⚠️⚠️ **CON LOS DOS VISTOS BUENOS, LOS CARTELES SE LE MANDAN SOLOS AL ARTISTA** (sep 2026, lo pidió
  Dani). Es lo que necesita para poder anunciar, y esperar a que alguien se acuerde de compartirlos
  es justo lo que se pierde. Punto único **`_announce_share_artwork_with_artist`**, que dispara
  **`_artwork_review_after`** en cuanto no queda ningún cartel esperando.
  · Va con el tipo de aviso nuevo **`CARTELERIA` («Ya tienes los carteles»)**, que es el contenido de
  siempre de la actividad **más la cartelería y el anuncio** (los mismos módulos que `ANUNCIO`), y se
  manda por el canal configurado del artista.
  ⚠️⚠️ **NO marca la actividad como ANUNCIADA**: se anuncia el día que toca. El aviso de **ANUNCIO**
  —el que sí la marca— sigue siendo el que se manda a mano desde la ficha.
  ⚠️ **Se hace UNA sola vez**: la marca es `shared_with_artist_at`, la misma que enseña la etiqueta
  «Compartido con el artista» de la pestaña (no hay dos verdades). Y si no hay a quién mandárselo,
  **no se calla**: queda el aviso de que no se ha podido avisar (`SIN_NOTIFICACIONES`).

- ⚠️⚠️ **UN CARTEL EN PDF TAMBIÉN TIENE MINIATURA** (sep 2026). Hasta ahora, de un PDF **no salía
  ninguna imagen** en toda la app (`_artwork_image_src` devolvía vacío para PDF, AUDIO y FILE), y el
  PDF es justo lo que manda la imprenta y lo que sube media gente: por eso «el cartel está subido y
  no se ve». Es la MISMA regla que el vídeo —un PDF no es una imagen, pero **su primera página
  sí**— y se guarda en el **mismo `poster_url`**, así lo aprovecha todo lo que pinta miniaturas.
  · **`_artwork_pdf_preview(session_db, asset)`** la genera la primera vez que hace falta y la
  guarda; **`_artwork_pdf_preview_bytes(url)`** es el que trabaja: **sin binarios nuevos**, `pypdf`
  saca las imágenes **EMBEBIDAS** de la página (la más grande: si hay varias, la pequeña es el logo
  de una esquina) y Pillow la reescala a 1400 px de lado largo. Clave DETERMINISTA
  (`artwork/pdf/<id>.jpg`, con upsert, para que dos workers no dejen un JPEG huérfano) y **caché
  negativa de 6 h** para no reintentar en cada pintada, igual que el póster de un vídeo.
  ⚠️ Un **PDF vectorial puro** no trae ninguna imagen dentro: entonces **no hay miniatura** y quien
  pinte se queda con su respaldo. No se inventa nada.
  ⚠️ `_artwork_can_be_primary` **no cambia**: el cartel PRINCIPAL (el que representa la actividad en
  una cabecera o en la miniatura de un enlace) sigue teniendo que ser una IMAGEN de verdad.
  → Quién lo usa y por qué, en `docs/app/promocion-prensa.md` («Diseño de comunicaciones»).

- ⚠️⚠️⚠️ **EL CARTEL DE REFERENCIA DE UNA ACTIVIDAD ES UNO SOLO, Y LOS DE SOLD OUT NO CUENTAN**
  (sep 2026, lo dijo Dani y era la causa de «el módulo de actividades de las comunicaciones sigue
  sin cargar el cartel»): *«aunque se suban carteles de Sold Out, el cartel principal de una
  actividad sigue siendo el cartel de referencia, excepto que se reemplacen por actualización de
  datos; para entradas y comunicaciones el cartel principal sigue siendo el que se usa, ya que los
  Sold Out son solo para comunicar el sold out»*.
  · **Punto ÚNICO: `_concert_reference_poster(concert, session_db=None)`**. Antes había **dos**
  funciones con criterios distintos —`_concert_poster_url` (la cabecera de las invitaciones, las
  miniaturas de los enlaces, las entradas) y la del módulo de una comunicación—, y por eso **el
  mismo cartel se veía en un sitio y no en otro**. Hoy `_concert_poster_url` es una línea que llama
  al punto único, y las entradas (`_invgen_image_options`) y el módulo también.
  · **La regla**: solo **`category='POSTER'`** (ni SOLD OUT ni logotipos) · nunca un **rechazado** ·
  vale lo **subido aunque le falte un visto bueno** · orden **principal → aprobado → el más
  reciente** · si la actividad no tiene, el de su **ciclo, gira o evento** · un cartel en **PDF**
  cuenta (su primera página) y uno en **VÍDEO no**, ni con su miniatura (es un anuncio para redes,
  no el cartel).
  ⚠️⚠️ **Y EL ARCHIVADO VALE DE ÚLTIMA** — esta era la causa de «al actualizar la hora de una
  actividad se ha dejado de ver el cartel», que Dani avisó **tres veces**. Lo único que reemplaza al
  cartel es una **actualización de datos**: al cambiar la fecha o el sitio,
  `_artwork_request_refresh` → `_archive_current_artwork_assets` los **archiva** y los vuelve a
  pedir (respetando a propósito los de Sold Out). Pero **archivado no es borrado**: hasta que llega
  el cartel nuevo, **el que hay es ese**, y dejarlo fuera era dejar la actividad sin cartel durante
  días. Va el ÚLTIMO, detrás de todo lo vigente —incluido lo del grupo—, así que **en cuanto llega
  el actualizado gana él solo**, sin tener que acordarse de nada.
  ⚠️ Cuando aun así no hay cartel, el editor de comunicaciones **dice por qué** en una línea
  (`_concert_poster_hint`: «solo hay carteles de Sold Out», «el que hay está rechazado», «todavía no
  hay ninguno»). Solo en el editor: en el correo no sale nunca.
  ⚠️ `_concert_poster_url(concert)` no recibe sesión (se llama desde ocho sitios), así que **no
  genera** la miniatura de un PDF que todavía no la tenga: aprovecha la que haya. Quien tenga
  sesión llama al punto único con ella.
  · Cubierto por `tools/check_diseno_comunicaciones.py` (apartados 3 bis y 3 ter).
