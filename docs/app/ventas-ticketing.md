# Ventas y ticketing

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- RECAUDACIÓN del reporte de ventas = el interruptor ECONÓMICO de «Reporte de ventas»
- Integración Enterticket (ticketing en tiempo casi real): cliente HTTP en enterticket_utils.py
- COMPRADORES · listados, categorías, importación a mano y ENVÍOS. La base de
- TICKETING · volcar la configuración de Enterticket a la actividad — ago 2026. Botón «Volcar
- SALIDA A LA VENTA · activar la venta y COMUNICARLA. Sacar una actividad a la venta
- UN BUSCADOR TIENE QUE NORMALIZAR LOS DOS LADOS (bug real, ago 2026): en el reporte de ventas
- EL A4 Y EL CORREO DEL REPORTE DE VENTAS SIGUEN MANDANDO EL DÍA COMPLETO, no lo que se está
- EL PROCESO DEL SOLD OUT · avisar en casa, los carteles y el artista
  (con la TAREA de comunicárselo, el correo «Anuncio de Sold Out» y la tarea de REDES)
- AL 90% DE VENTA SE PIDE SOLO EL CARTEL DE SOLD OUT. Cuando una actividad que
- ENVÍOS A COMPRADORES · el correo SE DISEÑA, por la COMPRA o PUBLICITARIO, a VARIAS bases y
- IMPORTAR TERCEROS, CONTACTOS DE MEDIOS Y COMPRADORES: NINGÚN CAMPO ES OBLIGATORIO.
- EDITOR DE NOTAS DE PRENSA (y del correo a compradores): las OPCIONES DEL BLOQUE van ARRIBA A LA
- TIPO DE ACTIVIDAD ≠ TIPO DE VENTA (depuración ago 2026). El sale_type (vendido, a
- «GRATUITO» NO ES UN TIPO DE VENTA: es que la ENTRADA es gratis
- ACTUALIZACIÓN DE VENTAS · LO QUE SE LE PIDE AL PROMOTOR DE FUERA. Cuando las
- ACTUALIZACIÓN DE VENTAS · LAS TRAMPAS QUE SACÓ LA REVISIÓN. Todas de dinero o
- COMPRADORES · LAS BASES SE AGRUPAN POR DE QUIÉN SON (sep 2026, lo pidió Dani
- EL RESPONSABLE DE TICKETING se pide SIEMPRE que las entradas las venda un TERCERO
- TICKETING · LAS COMUNICACIONES QUE SIGUEN ESPERANDO: en la pestaña Ticketing se ve
- AFORO · en una actividad GRATUITA es «Aforo», no «Aforo a la venta»: punto único
- ACTUALIZACIÓN DE VENTAS · TAMBIÉN LO NUESTRO. Ya existía todo lo que se le
- LA ACTUALIZACIÓN DE VENTAS SE LE PIDE A QUIEN VENDE, NO A QUIEN PROMUEVE. Una
- NOTAS DE PRENSA Y CORREO A COMPRADORES · LO QUE SE VE EN EL EDITOR ES LO QUE SE MANDA
- ACTUALIZAR VENTAS · la foto del artista, y sin los vinculados
- «ACTUALIZAR VENTAS» NO SERVÍA PARA NADA SUELTO (bug real, sep 2026, lo sacó
- LA RECAUDACIÓN SOLO ES NUESTRA SI LA PROMUEVE (o participa) UNA EMPRESA DEL GRUPO
- LO GRATUITO NO TIENE SALIDA A LA VENTA: si no se venden entradas, no hay fecha ni aviso que dar
- ACTUALIZAR VENTAS · EL COLOR DE CADA TARJETA DICE SI HAY TRABAJO Y DE QUÉ TIPO

---

- **RECAUDACIÓN del reporte de ventas = el interruptor ECONÓMICO de «Reporte de ventas»**
  (`SALES_REVENUE_ACCESS_KEY` = **`ventas.reportes`**, ago 2026): con **«Ver»** se ve **cómo van las
  ventas SIN importes** (vendidas hoy, total, aforo, pendientes, %, punto de empate, sold out) y con
  **«Ver datos económicos»** se ve además la **recaudación**. Nace apagada para todos; **dirección**
  la ve siempre y a **Ticketing** se le concede en el arranque (`_sales_revenue_access_seed`, marca
  `sales_revenue_access_seed_v1`). Punto único **`can_view_sales_revenue()`**, que sustituye a
  `can_view_economics()` en el reporte (pantalla, A4, columnas de dinero del Excel), en el **informe
  por concierto** (`sales_event_report_view`/`_pdf`) y en el reparto del **correo**
  (`_sales_report_recipients`, que decide quién recibe la variante con importes).
  ⚠️⚠️ **Antes era una SUBPESTAÑA propia (`ventas.recaudacion`) y el interruptor económico no servía
  para nada** (bug real): al tener una hija, el grant de `ventas.reportes` se guardaba **siempre a
  False** (`_coherent_grant_values` deriva los contenedores de sus hijas) y en la pantalla de Accesos
  ni se pintaba, así que la **ÚNICA** forma de abrir el reporte era conceder la subpestaña… que ya
  daba los importes, porque `can_view_sales_revenue()` aceptaba `can_view_basic OR can_view_econ`.
  Resultado: el perfil «ve cómo van las ventas sin ver la recaudación» **no se podía conceder**.
  ⚠️ Ahora se mira **`can_view_econ`** (o `can_edit`, que por coherencia implica el económico), nunca
  el básico. Y sigue comprobándose el **grant EXACTO**, no con `_state_has_access`: ese acepta los
  ANCESTROS, así que cualquiera con economía en `ventas` seguiría viendo la recaudación. Las filas del
  permiso existen para todo el mundo con los flags a `false` (el catálogo las crea así).
  ⚠️ Quien ACTUALIZA ventas (`ventas.actualizar`) no ve por eso la recaudación del reporte: son
  permisos distintos.

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
  ⚠️ **La lista de Integraciones solo enseña los eventos POR VENIR**: uno ya celebrado no hay que
  vincularlo ni pedirlo. Los que estaban vinculados **siguen vinculados** y sus ventas se ven en la
  pestaña Ticketing de su actividad; abajo se dice cuántos hay ocultos (`et_past_count`). Manda
  `event_end_date` cuando la hay (un festival de varios días sigue vivo hasta el último), y los que
  no tienen fecha se conservan (no se puede dar por pasado lo que no se sabe cuándo es). ⚠️ Los ya
  vinculados se descartan del selector «vincular con otro concierto» mirando **todos** los eventos,
  no solo los futuros: si no, una actividad enlazada a uno pasado se ofrecería otra vez.

- **COMPRADORES · listados, categorías, importación a mano y ENVÍOS** (ago 2026). La base de
  compradores tiene ya dos orígenes y los dos se ven y se trabajan igual («listados»):
  · un **evento de Enterticket** (se alimenta solo de sus ventas), y
  · un **listado subido a mano** (`BuyerList`), vinculado a una actividad nuestra.
  Punto único **`_buyer_source`** (resuelve cualquiera de los dos a la misma forma) +
  `_buyer_sources_list` (la rejilla, con el icono que dice de dónde sale cada uno).
  ⚠️⚠️ **Un listado a mano NO se guarda como un evento de Enterticket**, a propósito: ese espejo es
  el que alimenta la pestaña Ticketing y el Resultado de la actividad, y meterle filas que no son de
  ET haría que la app diera por REAL una venta que no existe. Por eso `buyer_events.event_id` pasa a
  ser NULL-able y hay `buyer_events.list_id` (el origen es UNO de los dos).
  · **CATEGORÍAS de entrada** (`BuyerEvent.categories`, JSONB): en ET las calcula
  `_et_recompute_buyers_for_event` con **una** consulta agrupada; en un fichero salen de su columna.
  Con eso se **filtra y se ordena** el listado y se elige a quién va un envío. Solo se ofrecen las
  categorías que de verdad hay (un filtro que no puede devolver nada solo hace ruido, la misma regla
  que los tipos del calendario de agenda) y cada una lleva **su icono** (`_buyer_category_icon`:
  pista, grada, palco, abono, invitación…).
  · **Filtros** (`BUYER_FILTER_DEFS`) y **orden** (`BUYER_ORDER_DEFS`) como chips con icono; el
  filtrado es un punto único, **`_buyers_apply_filters`**, que usan la pantalla, el contador del
  envío y el propio envío: **el número que se ve antes de mandar es exactamente a quién se le
  manda**.
  · En la **rejilla de listados** cada uno enseña sus compradores y **cuántos tienen email y cuántos
  teléfono** (nada de recaudación ni de entradas: lo que hace falta saber ahí es a cuántos se les
  puede mandar algo).
  · **Una sola fila arriba** (`.bl-bar`): a la **izquierda lo que hay** —compradores · entradas ·
  **cuántos tienen email** · **cuántos tienen teléfono**, con el icono en el **AZUL de la marca**
  (`--brand-accent`; ⚠️ el «verde de la casa» **es ese azul**: no hay ningún verde corporativo, y el
  verde de Bootstrap es el de «aprobado»)— y a la **derecha «Ordenar» y los filtros**.
  ⚠️ **Aquí NO se enseña recaudación** (ni el total, ni el importe por comprador, ni el orden por
  importe): esta pantalla es de personas. El dinero se ve en Ventas y en el Resultado.
  · Los números son **de lo que se está viendo** (con los filtros puestos) y los de email/SMS dicen
  **a cuántos se les puede mandar**: mismo criterio (`_buyer_has_email_cond` /
  `_buyer_has_phone_cond`) que el total del envío y que el envío, así que no pueden discrepar.
  · **«Ordenar» es UN control** (`.bl-drop` con las opciones dentro, cada una un enlace).
  · **Las CATEGORÍAS son UN SOLO filtro** (`.bl-drop`, en la fila de filtros): se abre y se
  **desmarca lo que no se quiera ver** (marcada = se ve), no una fila de chips.
  ⚠️ **Tenerlas TODAS marcadas es no filtrar**, y así se normaliza en la vista: si no, un comprador
  **sin ninguna categoría** desaparecería del listado por estar «todas» seleccionadas.
  ⚠️ No es un desplegable de Bootstrap a propósito: el ayudante global de desplegables los crea con
  `autoClose` y les teleporta el menú al `<body>`, así que cualquier clic dentro —y aquí hay
  casillas— lo cerraría (el mismo motivo por el que «Compartir» de una playlist es un pop-up).
  · **Los botones van TODOS en la misma fila que el buscador** (el buscador a la izquierda, ellos a
  la derecha con `flex-row-reverse`, así que el primero del HTML es el de más a la derecha): Envío de
  SMS (`btn-primary`, el rojo de la casa) · Envío de Email (**`btn-accent`**, el azul de la marca,
  clase nueva) · Añadir desde fichero (`btn-success`) · Exportar (`btn-secondary`). **Sin viñeta
  propia**: integrados, para que quede compacto. La **flecha de volver** va en su propia barra arriba
  a la izquierda (`.btn-volver`), como en el resto de la app.
  · **EN NOMBRE DE QUIÉN sale el envío** (`BuyerCampaign.sender_kind` COMPANY|CYCLE + `cycle_id`):
  punto único **`_campaign_brand`**, que decide **a la vez** el logo del correo y el remitente del
  SMS (para que no puedan decir cosas distintas).
  ⚠️ **No se pregunta si no hay nada que elegir**: si la actividad ya tiene su empresa del grupo, sale
  esa y ya. La pregunta aparece **solo cuando la actividad es de un CICLO o FESTIVAL propio**
  (`Concert.cycle_festival_id`, lo resuelve `_buyer_source_cycle`), y entonces son **dos**: el
  **ciclo** (marcada por defecto: es el nombre que la gente reconoce) o la **empresa del grupo que lo
  organiza** (`CycleFestival.managing_company_id`, y si no la tiene, la que promueve la actividad).
  Si la actividad **no tiene empresa puesta** sí se ofrecen todas, que si no no habría con qué firmar.
  El correo lleva el logo de lo que se marque. El nombre abreviado del ciclo es
  **`CycleFestival.sms_sender`** y, si no lo tiene, **se pone desde el propio pop-up**
  (`buyers_campaign_sender_save`, mismo límite de 11 caracteres) y queda guardado en su ficha.
  ⚠️ El ciclo se comprueba **contra el de la actividad del listado**: el formulario no puede firmar
  un envío en nombre de un ciclo que no es el suyo.
  ⚠️⚠️ Quien manda se elige con **TARJETAS con su logo**, no con un `select`: dentro de este pop-up
  el Select2 **no se podía abrir** (en un modal apilado el desplegable se queda detrás), así que se
  veía el logo de la empresa y **no había forma de cambiarla** — bug real. Para elegir algo dentro de
  un modal de esta app, tarjetas. `channel=` añade lo que ese canal necesita (un SMS sin teléfono no se puede mandar) y se
  dice cuántos se quedan fuera por eso.
  · **IMPORTAR UN FICHERO** (`buyer_import.py`, motor puro): el **mismo lector** que la importación
  de terceros (`promoter_import.read_rows` / `parse_columns`, refactorizados para compartirlo), que
  ya sabe de cabeceras desplazadas, rótulos como «N.º de teléfono» y números que Excel escribe con
  decimales. Lo único propio es a qué campos de un comprador se puede volcar una columna. Pasos:
  fichero → columnas (con un EJEMPLO de cada una, las que no se reconocen en ámbar, y «Omitir esta
  columna» para lo que no haga falta) → resumen → importar.
  ⚠️ **NO SE DUPLICAN COMPRADORES**: se identifican por su **email** y, si no lo traen, por su
  **teléfono** (`buyers.email` deja de ser obligatorio y hay índice único parcial por teléfono
  cuando no hay correo). A quien ya está **solo se le COMPLETA lo que tiene vacío**; lo que ya está
  escrito no se pisa nunca.
  ⚠️ Un fichero de ticketera trae **UNA FILA POR ENTRADA**: `_buyer_import_group` agrupa por
  comprador sumando entradas e importe y juntando categorías. Y las entradas de un comprador en un
  listado se **ESCRIBEN**, no se suman a lo que había: **reimportar el mismo fichero deja lo mismo**
  (comprobado) en vez de inflar los números.
  ⚠️ Una fila **sin email y sin teléfono** no se importa (no hay a quién escribirle ni con quién no
  duplicarla) y **se dice cuántas** se han descartado, no desaparecen sin más.
  · **Un listado NUEVO** para una actividad que no sale: artista o evento (con su foto, los activos
  primero y el resto tras «Ver más») → sus actividades (`buyers_subject_activities`) → el fichero.
  Un listado por actividad: si ya lo tiene, se reutiliza.
  · **ENVÍOS (SMS y correo)**: `BuyerCampaign` + `BuyerCampaignRecipient`. El **correo** lo firma la
  empresa del grupo que **promueve** (`_buyer_source_company`: `group_company_id` → la que factura →
  su participación): logo arriba a la **derecha**, el **título** centrado debajo, el **texto**, el
  **botón** (nombre + enlace) justo debajo a la derecha y los **adjuntos** al final. En el **SMS** el
  remitente ES esa empresa (**`GroupCompany.sms_sender`**, «nombre abreviado para SMS», que se pone
  en su ficha con el MISMO límite que el remitente general —11 caracteres, `sms_utils.sender_is_valid`—
  y se puede dejar vacío, porque en España un remitente con letras hay que registrarlo).
  ⚠️ La **previsualización y el contador los compone el SERVIDOR** con el mismo código que el envío
  (`_campaign_email_html` / `_campaign_sms_preview`), así que lo que se ve es lo que sale y **no hay
  una segunda versión en JS** del GSM-7, los acentos y los trozos (eso es de `sms_utils`).
  ⚠️ El **enlace que se escribe** se cuenta **acortado si es nuestro** y con su longitud REAL si es
  de fuera (el acortador solo acorta lo de casa): contar siempre 38 caracteres haría que el contador
  mintiera justo con el enlace de una ticketera. El de los **adjuntos** sí es siempre nuestro, así
  que se cuenta con la longitud exacta de un enlace corto aunque todavía no exista (se crea al
  enviar). Si el mensaje ocupa **más de un SMS** se avisa, se dice cuántos son en total y hay que
  **aceptarlo** para poder mandar (`max_segments=0` en el envío: ahí ya no se recorta).
  ⚠️ En un SMS **no se puede adjuntar nada**: los adjuntos van a una página nuestra
  (`public_campaign_files`, `/envio/<token>`, con sus `og:` para la previsualización del móvil) y su
  enlace se acorta. En el **correo** van como imágenes y enlaces DENTRO del mensaje, no como ficheros
  pegados: mandar el mismo PDF a miles de direcciones es la forma más rápida de acabar en spam.
  ⚠️ **Un envío a miles de personas no cabe en una petición**: se guardan los destinatarios y se
  manda por tandas de ~45 s. La primera va en la petición (para ver al momento los errores de
  verdad) y el resto en un **hilo en segundo plano** (`_campaign_send_bg`), con la pantalla
  preguntando cómo va (`buyers_campaign_status`). Cada destinatario queda marcado en cuanto se le
  manda, así que si el hilo muere (un despliegue) se sigue con «Seguir enviando» y **nadie recibe dos
  veces**.
  ⚠️ El **tope diario de SMS** (Integraciones → SMS) se respeta: al llegar, el envío **se para y lo
  dice** con cuántos quedan, en vez de marcar a nadie como «no le llegó».
  · UI: `compradores.html` + `_buyer_import_modal.html` + `_buyer_campaign_modal.html` +
  `static/js/buyer_import.js` + `static/js/buyer_campaign.js`, estilos `.bl-*` / `.bi-*` / `.bc-*`
  (la zona de arrastrar y la tabla de columnas reutilizan las `.pi-*` de la importación de terceros).
  · **ANTES DE MANDAR SE PRUEBA**: botón «Enviar una prueba» en el pie del pop-up, que abre el suyo
  encima (`buyers_campaign_test`): se ponen uno o varios correos o teléfonos a mano **o se cogen de
  la base** —terceros, personal de la oficina y artistas— con **`buyers_campaign_contacts`**, que
  devuelve con qué se puede contactar a cada uno. Se manda **exactamente lo compuesto** (el mismo
  payload que el envío, con «[PRUEBA]» en el asunto).
  ⚠️ La prueba **no toca la campaña de verdad**: no crea destinatarios ni marca a nadie. Se guarda
  como envío con `status='PRUEBA'` porque hace falta una fila para la página de los adjuntos y porque
  lo que sale de la casa no puede ser invisible.
  ⚠️ Un **artista no tiene correo propio**: se abre en las personas que reciben sus avisos
  (`ArtistNotificationContact`) y en sus integrantes, que es a quien de verdad se le puede mandar.
  ⚠️ De qué listado se abre cada pop-up y con qué canal se decide **EN EL CLIC** (`data-bi-scope`,
  `data-bc-channel`), no en `shown.bs.modal`: con `modal_stack.js` por medio ese evento no siempre
  llega (bug real ya apuntado en esta guía).

- **TICKETING · volcar la configuración de Enterticket a la actividad** — ago 2026. Botón **«Volcar
  configuración»** en la pestaña Ticketing: `concert_et_config_preview` (GET, JSON) calcula el DIFF y
  el modal enseña **lo que hay ahora tachado y lo que pasaría a haber** antes de aceptar;
  `concert_et_config_apply` (POST) lo aplica. Se escriben `ticketing_payload['ticket_types']`
  (nombre, precio y nº a la venta), `entry_mode='SALE'`, `Concert.capacity` y `Concert.sold_out`.
  · ⚠️ **NO pasa por `_replace_concert_ticket_types_manual`**: ese borra y reinserta los tipos, y el
  borrado en cascada se llevaría por delante el histórico diario de ventas (`TicketSaleDetail`) y los
  precios por ticketera. Los `ConcertTicketType` de ET los mantiene al día `_et_mirror_to_sales`.
  · ⚠️ **Las invitaciones pactadas por categoría se CONSERVAN**: la API de ET solo informa de las ya
  emitidas, no del cupo pactado.
  · **Lo que Enterticket NO puede dar** (y por eso no se volca): la **ZONA** (pista/grada/palco no
  existe en ET; lo más parecido es `entrada_numerada`), el **nº a la venta** como dato (se calcula
  vendidas + disponibles: si en ET recortan el cupo con ventas hechas, el número sale de más), un
  **estado de venta** por categoría (se deduce: «Agotada» si no quedan, y el % vendido) y **qué
  butacas están bloqueadas**: `/bloqueos/:id` es un CONTADOR sin sector/fila/asiento, así que los
  bloqueos no se pueden repartir por categoría ni pintar en el plano.
  · El plan de ingresos **no hace falta invalidarlo**: la pestaña Resultado se recalcula entera en
  cada carga (`_concert_build_calc_data` + `sim_calc`, sin caché ni snapshot). ⚠️ Con el concierto
  vinculado a ET y ventas reales, el adaptador **ignora** tipos/precios/aforo y usa la recaudación
  real como ingreso @100%.

- **SALIDA A LA VENTA · activar la venta y COMUNICARLA** (ago 2026). Sacar una actividad a la venta
  son **tres pasos con tres dueños**, y **activar la venta NO es activar la producción**: son
  funciones separadas y tareas distintas.
  · **1. CONTRATACIÓN «Activa la venta»** (`concert_sale_activate`, botón en la barra de la ficha y
  tarea **«Sin activar la venta»** en el módulo de Contratación): no toca la fecha, solo dice «hay que
  sacarla ya». Al pulsarlo le llega el **aviso a TICKETING** (kind `VENTA`, `ref_type='CONCERT_SALE'`).
  · **2. TICKETING la saca a la venta o la programa** con la etiqueta **Venta** de la cabecera
  (`concert_onsale_set`), que ahora guarda también la **HORA** (`Concert.sale_start_time`) — es la que
  se dice en el aviso.
  · **3. TICKETING la COMUNICA** (`concert_sale_notice_view` → `_send`): **es obligatorio**; hasta que
  se manda, la actividad sigue en sus tareas. Al mandarlo desaparece de ellas y la actividad pasa a
  estar en **actualización de ventas** (`/ventas`, que lista lo que ya tiene fecha de salida).
  · **Cuándo aplica**: la actividad **vende entradas** (`entry_mode == 'SALE'`), la promueve una
  **empresa del grupo** y la venta la sacamos **nosotros** (`_concert_sale_is_ours`). Si vende el
  recinto, el promotor o un tercero, no es trabajo nuestro. Punto único **`_concert_sale_state`**
  (`applies` · `needs_activation` · `needs_onsale` · `needs_notice` · `notified` · `notice_stale`),
  que usan las tareas, los botones de la ficha y las compuertas.
  · **A QUIÉN se le manda** (`_sale_notice_recipients`, con su papel y su casilla para quitarlo): el
  **ARTISTA** a las cuentas configuradas para **notificaciones de actividades** (el mismo canal que el
  aviso de la actividad, con caché o sin caché), la persona de **PRODUCCIÓN** de esa actividad,
  **CONTRATACIÓN** (el departamento), **la persona del SELLO que tenga ese artista asignado**
  (`assigned_artist_ids_sello`, **sin caer** en todo el departamento: es un aviso para quien lo lleva)
  y **DIGITAL** (el departamento «Redes sociales»), que con el mismo correo tiene los canales de venta
  para subir los enlaces — y al mandarlo le entra su tarea (`_digital_task_ask`, sep 2026:
  → `docs/app/actividades.md`). Se pueden añadir otros correos a mano.
  · **Asunto**: «**Salida a la venta, \<festival o municipio\>, \<fecha de la actividad\>**».
  **Cuerpo** (`_sale_notice_html`, el MISMO HTML para el correo y la vista previa): logo de la empresa
  del grupo arriba a la **derecha**, «Salida a la venta» centrado, la **galleta** de la actividad (la
  misma cabecera que la ficha, `_contract_sheet_hero_rows`), la frase de **cuándo sale**, la tabla de
  **Canales de venta** (logo + copiar el enlace + ir al enlace) y, **solo si hay carteles aprobados**,
  «Puedes descargar los carteles» con el botón **Descargar Carteles** (lleva a la cartelería de la
  actividad).
  ⚠️ **Si YA está a la venta el texto lo DICE** (`_sale_notice_sentence`): «ya está a la venta desde
  el \<día\>» (o «desde hoy»); si todavía no, «saldrá a la venta el \<día\> a las \<hora\>».
  Decir «saldrá a la venta» de algo que ya se está vendiendo sería mentira.
  ⚠️ En un correo **no corre JavaScript**: el botón «Copiar enlace» es un enlace normal (y debajo va
  la dirección en texto, que es lo que de verdad se copia desde el correo); en la **vista previa** de
  la app sí copia de verdad.
  · **Vista previa** (`concert_sale_notice.html`): destinatarios con casillas, correos extra, nota y un
  **ojo por módulo** (`canales`, `carteles`) para dejarlo fuera, igual que el aviso al artista.
  · **Un cambio invalida el aviso**: `_concert_sale_signature` (día + hora) se guarda al comunicarlo;
  si se reprograma, la etiqueta vuelve con «hay cambios» y hay que comunicarlo otra vez.
  ⚠️ La lista de tareas de Ticketing **NO filtra por `sale_notice_at` en la consulta** (bug real de
  esta épica): una venta reprogramada ya tiene fecha de aviso y ese filtro se la comía, así que la
  tarea no volvía a aparecer. Decide `_concert_sale_state`.
  ⚠️ **Corte `SALE_NOTICE_TASK_FROM` (18-ago-2026)**: lo que YA estaba a la venta antes de que esto
  existiera no reclama aviso (nadie va a comunicar hoy una venta que abrió en junio); lo que se active
  desde la app sí, siempre. Mismo criterio que `PITCH_TASK_FROM`.
  ⚠️ **Permisos**: sacar a la venta es de TICKETING, que no tiene por qué poder editar contratación →
  punto único **`can_set_concert_onsale()`** (contratación · ticketing · ventas · dirección), global de
  plantilla `CAN_SET_ONSALE` (es el que manda en `_concert_onsale_badge.html`, antes
  `CAN_EDIT_CONCERTS`), y los endpoints van en `SUPPORT_ACTION_ENDPOINTS` / `SUPPORT_READ_ENDPOINTS`
  (si no, el gate de la sección los rebotaba con un 403 antes de llegar a su comprobación).
  · Módulo de Inicio **`HOME_TICKETING_SALES`** (`_home_ticketing_sales_tasks`), solo para Ticketing y
  dirección, con las dos tareas y su etiqueta. Va **justo debajo del calendario**, que es con lo que
  trabaja ticketing.
  ⚠️ **TODAS LAS PANTALLAS DE INICIO SE LEEN IGUAL** (ago 2026), dirección aparte: **cabecera** ·
  **avisos** (la franja global) · **botones rápidos** · **calendario** · **sus tareas pendientes** (las
  de su departamento o las que le han asignado) y, al final y **FUERA de cualquier compuerta**, **lo
  SUYO**, que es de la PERSONA y no de una función y **se ve siempre que haya algo pendiente**:
  «Activar la producción» (lo que ha creado y no tiene a nadie) · «Mis gastos» · los carteles que le
  han rechazado · «Mis vacaciones» · «Mis peticiones» · «Mis invitaciones solicitadas».
  Quien tiene dos departamentos ve los módulos de los dos.
  ⚠️ Un módulo NUEVO que sea **de la persona** va en ese bloque final (fuera de la compuerta); si es
  de un departamento, dentro. Lo que quede dentro no lo ve quien es solo de ticketing o de
  contratación.
  ⚠️ **En PRODUCCIÓN son las ASIGNADAS, no las del departamento** (`_home_produccion_pending`,
  corregido): las actividades donde es el **responsable de producción** más las de **sus artistas**.
  Antes, quien no tenía artistas asignados veía **TODAS**, así que el módulo era el trabajo de otros.
  ⚠️ **EL INICIO DE CONTRATACIÓN** (ago 2026) es, en este orden: la **cabecera** · los **avisos**
  (la franja global, que va debajo del menú) · los **botones rápidos** · el **calendario** · las
  **peticiones pendientes** (`HOME_PENDING_PETICIONES`, **solo cuando hay**) · y sus **tareas
  pendientes de contratación** (`HOME_CONTRATACION_TASKS` ← `_home_contracting_tasks`). **Nada más**:
  a quien está en el departamento Contratación **y en ninguno más** (`_home_contratacion_only` →
  `HOME_CONTRATACION_ONLY`, hermano de `_home_ticketing_only`) se le esconden los módulos de los
  demás departamentos.
  · El módulo de tareas son las MISMAS que abren cada pestaña de Contratación
  (`_contracting_tasks_data`, ya filtradas por **sus artistas asignados**), aquí **sin repartir por
  pestañas**: una fila por actividad, lo más urgente primero. Se ve para **cualquiera que tenga la
  función** de contratación (dirección incluida), no solo para los de ese departamento.
  ⚠️ Una actividad sale en VARIAS pestañas (un concierto de un ciclo, en las dos): se quita el
  duplicado; lo de **facturación es por pago**, así que el `extra` entra en la clave del dedupe.
  ⚠️ Las tareas son **CARAS** (recorren las actividades vivas): se calculan **solo en Inicio** y solo
  a quien tenga contratación.
  ⚠️ El módulo de **peticiones subió** a debajo del calendario (antes estaba dentro de la compuerta de
  ticketing, así que contratación lo tenía enterrado entre los módulos de los demás); sigue oculto
  para quien es SOLO de ticketing, **se lee IGUAL que el de tareas** (fila `.ctask`: foto del artista,
  datos con iconos y las etiquetas debajo) y las PETICIONES **no se repiten** en el módulo de tareas
  (su pestaña se salta en `_home_contracting_tasks`).
  · **LA PROVINCIA NO ES UN CAMPO APARTE** en ninguno de los dos: el lugar va de una pieza
  («Municipio, Provincia», punto único `_place_label`) — `_contracting_task_row` devuelve ya
  `place_label` y las plantillas pintan eso, no `municipality` + `province` en dos etiquetas.
  ⚠️ **EL INICIO DE TICKETING ES SOLO EL CALENDARIO Y ESO**: a quien está en el departamento
  Ticketing **y en ninguno más** (`_home_ticketing_only` → `HOME_TICKETING_ONLY`) no se le pintan los
  módulos de los demás departamentos — en `home.html` todo lo que va después cuelga de
  `{% if not HOME_TICKETING_ONLY and not HOME_CONTRATACION_ONLY %}`. Quien además esté en otro departamento, y dirección, los siguen
  viendo todos. Un módulo nuevo que se añada al final queda dentro de esa compuerta: si tiene que
  verlo ticketing, va ARRIBA (con el suyo).

- ⚠️ **UN BUSCADOR TIENE QUE NORMALIZAR LOS DOS LADOS** (bug real, ago 2026): en el reporte de ventas
  la consulta se limpiaba de acentos (`norm`) pero el pajar no —`data-search` lo pinta Jinja con
  `|lower` a secas—, así que buscar «nus» no encontraba «Ñus» y «muñoz» no encontraba «Muñoz». El
  repertorio no lo tenía porque normaliza los dos. Al añadir un buscador, comparar SIEMPRE
  normalizado a los dos lados.

- ⚠️ **EL A4 Y EL CORREO DEL REPORTE DE VENTAS SIGUEN MANDANDO EL DÍA COMPLETO**, no lo que se está
  viendo (ago 2026). El servidor sí sabe filtrar (`_sales_report_filters_from_request`), pero el A4
  compone su enlace con los filtros de la URL de carga y el JS no lo reescribe, y el formulario del
  correo solo lleva la fecha. Antes no se notaba (todos los artistas activos = todo); **con selección
  única lo normal es tener un artista puesto, así que la diferencia se ve a la primera**. Se ha
  dejado así a propósito: el correo va a la empresa y mandar un reporte parcial sin darse cuenta es
  peor que mandarlo entero.
  ⚠️ Si algún día se conecta, ojo: las claves de los chips **no son todas UUIDs** (`event:<slug>` y
  `otros` para los conciertos sin artista) y el filtro del servidor solo entiende UUIDs —mandarle
  `?artist=event:…` no filtraría nada **en silencio**—, y el chip de ESTADO no tiene equivalente en
  el servidor.
  ⚠️ En esa misma tarjeta, **Tipo y Estado siguen siendo las píldoras rojas** (`.sales-chip`) mientras
  el de artistas es un botón de Bootstrap: se cambió solo el que se pidió. Si se homogeneizan, ahí sí
  se podría retirar `.sales-chip` del CSS (hoy lo necesitan esos dos grupos **y** `wireSingle`, que
  selecciona por esa clase).

## EL PROCESO DEL SOLD OUT · avisar en casa, los carteles y el artista

⚠️⚠️ **DECLARAR EL SOLD OUT NO ES MARCAR UNA CASILLA** (sep 2026, lo pidió Dani): cuando una
actividad se agota, **eso hay que moverlo**. Punto único **`_soldout_declare`**, que se dispara al
marcarla agotada y hace tres cosas:

1. **AVISA EN CASA** a quien tiene que saberlo: **contratación**, el **jefe de producto del sello**
   de ese artista (`_artist_sello_user_ids`, el punto único de «de quién es este artista en el
   sello») y **quien la produce** (y si no hay nadie apuntado, todo Producción).
2. **RECLAMA LOS CARTELES si faltan** (`_soldout_artwork_urgent`): aviso en la app **y correo** a
   diseño, con el plazo adelantado a **un día**. Sin cartel no se publica, así que no se puede
   esperar al plazo normal. Si nunca se pidieron, se piden; si estaban pedidos, se adelanta el
   plazo y se vuelve a avisar diciendo que es urgente.
3. Y queda **pendiente comunicárselo al artista**, que es lo que cierra el proceso.

⚠️ Es **idempotente** (`Concert.soldout_declared_at`): marcar y desmarcar no vuelve a dar la murga
a media oficina. Y es **best-effort**: si un aviso falla, no tumba el marcado del Sold Out.

⚠️⚠️ **Y QUEDA LA TAREA DE COMUNICÁRSELO AL ARTISTA** (sep 2026, lo pidió Dani), en **el proceso de
la actividad** y en **las tareas de Contratación** (kind `SOLDOUT_NOTICE`, la primera de la lista:
un Sold Out se publica cuando pasa, no una semana después). Punto único
**`_soldout_notice_pending`**.
⚠️⚠️ **BLOQUEADA MIENTRAS NO HAYA CARTEL DE SOLD OUT**: sin cartel no hay nada que publicar, así que
mandarle el aviso sería mandarle un correo que no le sirve. En el tablero sale con su candado y su
motivo; a **Contratación no se le reclama** hasta que se puede hacer (en esa lista no hay forma de
decir «bloqueada», y una tarea que no se puede hacer solo hace ruido).
⚠️ **Solo de los Sold Out de ESTA SEMANA en adelante** (`SOLDOUT_TASK_BACKFILL_DAYS` = 7, lo pidió
Dani así: «aplícalo a los Sold Out que hubiera habido esta semana y de ahora en adelante»):
reclamar hoy uno de hace meses no arregla nada. Sin `soldout_declared_at` no se reclama —es de antes
de que esto existiera y no se sabe de cuándo es—.

**EL AVISO AL ARTISTA** es el de siempre (misma pantalla, misma vista previa, mismos canales) con
un tipo nuevo: **`SOLDOUT` · «Anuncio de Sold Out»**.
· **EL TEXTO lo dictó Dani** y sale **ESCRITO Y EDITABLE** en la nota (`_soldout_notice_note`):
  *«Enhorabuena, el concierto de Móstoles está agotado, y ya puedes publicar el Sold Out. Aquí
  tienes los carteles.»* La actividad se nombra con su **nombre propio** si lo tiene (un festival)
  y, si no, con el **municipio**; el tipo sale del punto único `_artwork_activity_word` y el
  **género** de su artículo («la acción» → «está agotada»). El texto va **justificado**.
· **LA ETIQUETA «SOLD OUT»** va dentro de la **cabecera de la actividad, a la derecha** y centrada
  (`ctx["badge"]`), que es lo primero que se mira en ese correo.
· **EL BOTÓN «Descargar carteles de Sold Out»** va **FUERA de la cabecera y a la derecha**
  (`ctx["badge_button"]`), y lleva a la **misma pantalla que cuando se comparten carteles** pero con
  los suyos (`?cat=SOLDOUT`). ⚠️ Ahí **no se repite** el «Descargar la cartelería» de dentro del
  módulo: dos botones al mismo sitio no son dos opciones.
⚠️⚠️ **LA PRIMERA VISTA PREVIA SALE YA CON ESE TEXTO** (bug real, visto en el navegador): antes no
se le pasaba la nota, así que el cuadro de la izquierda decía una cosa y el correo de la derecha
otra hasta que alguien tecleaba algo — y lo que se está mirando ahí es justo si el correo queda
bien. Vale para los tres avisos que salen escritos (Sold Out, cancelación y aplazamiento). Lleva **los carteles de SOLD
OUT** con su botón de descarga — no los normales: `_activity_notice_artwork(..., category="SOLDOUT")`
y `_concert_artwork_share_url(..., category="SOLDOUT")`, que es lo que hace que el enlace público
enseñe los suyos (`?cat=SOLDOUT`, que esa página ya entendía).
⚠️ **Mandarlo es lo que CIERRA el proceso** (`Concert.soldout_notified_at`): hasta entonces la
actividad está agotada pero el artista no lo sabe.
⚠️⚠️ **Y AL MANDARLO, A REDES LE ENTRA SU TAREA**: «Publicar el Sold Out en redes» (`soldout` en
`DIGITAL_TASKS`, el mismo motor del ANUNCIO y de la salida a la venta, que ahora son **tres**
puertas). Se le manda **EL MISMO correo** que acaba de salir —con sus carteles, que es lo que
necesita— y la **marca hecha él** desde su Inicio: ahí se cierra la alerta de redes. ⚠️ La tarea va
con `email=False`: el correo ya ha salido y `_notify_user` mandaría otro distinto.

**EN LA CABECERA de la actividad** se ve el estado de un vistazo: **«Sold Out»** en rojo cuando ya
se le ha comunicado, y **«Sold Out · falta avisar al artista»** en ámbar mientras no —y esa se
**PINCHA** para comunicárselo—. Punto único **`_soldout_state`**.

· **PRUEBA DE REGRESIÓN: `/tmp/python/bin/python3 tools/check_soldout.py`** (39 comprobaciones con
la app real, de punta a punta). Es **idempotente**. Al tocar esto, en verde.

⚠️ Esto **no sustituye** a la petición del 90 % (`_soldout_artwork_check`), que se sigue haciendo
sola y con antelación: aquí se reclama lo que YA debería estar y no está.

⚠️ **EN LA CARTELERÍA DE SOLD OUT NO SALE EL % DE VENTA** (lo pidió Dani): esa sección es de los
CARTELES —se piden, se suben y se descargan— y el porcentaje se mira en Ticketing. Ahí parecía que
el cartel dependía de ese número, cuando lo que decía era cómo iba la venta el día que se pidió.

- ⚠️⚠️ **AL 90% DE VENTA SE PIDE SOLO EL CARTEL DE SOLD OUT** (sep 2026). Cuando una actividad que
  vende entradas llega al **90%** (`SOLDOUT_TRIGGER_PCT`) se le pide **sola** a **DISEÑO** la
  cartelería de Sold Out en **Historia de Instagram (9:16) · publicación de Instagram (1:1) · el
  cartel normal (A3)** (`SOLDOUT_ARTWORK_FORMATS`), con plazo de `SOLDOUT_DEADLINE_DAYS` (2) días.
  Nadie tiene que acordarse de pedirlo, que es justo cuando hay que publicarlo.
  · **NO es la cartelería de siempre: es OTRA petición.** Vive en la MISMA
  `ConcertArtworkRequest` (que es una por actividad) pero con sus **propias columnas**
  (`soldout_requested_at` · `_pct` · `_by_nick` · `soldout_deadline` · `soldout_formats` ·
  `soldout_uploaded_at`), y sus carteles son **`ConcertArtworkAsset.category = 'SOLDOUT'`**, en su
  **propia sección** de la pestaña Cartelería.
  ⚠️⚠️ **NO SE MEZCLAN con los carteles normales**: se sacan de `current_artwork_assets` /
  `archived_artwork_assets`, del ZIP (`concert_artwork_download_all`, que acepta `?cat=`), del
  enlace público que se comparte (`_concert_artwork_share_assets`, que ya filtraba POSTER) y de
  **`_concert_poster_url`** —o un Sold Out podría acabar de cabecera de las invitaciones o de
  miniatura de un enlace—. Y **reenviar la cartelería NO los archiva**
  (`_archive_current_artwork_assets` se los salta): es otra petición.
  ⚠️ El **estado de la solicitud** (`status`) lo marcan solo los carteles normales: subir (o
  rechazar) un Sold Out no la deja «en revisión» ni al revés. Cada petición cierra **su** aviso
  (`_artwork_notify_resolve_if_done`: `ARTWORK` con los carteles, `SOLDOUT` con los suyos).
  · **EL DISPARO** es el punto único **`_soldout_artwork_check(session_db, ids)`**, enganchado en los
  CUATRO caminos por los que cambia una venta —el apunte manual (`sales_save`), la rejilla por
  ticketera (`sales_ticketer_day_save`), el **reporte del promotor** (`public_sales_update_save`) y
  el **espejo de Enterticket** (tras `_et_mirror_to_sales`)— más, como **red de seguridad**, al abrir
  las pestañas **Cartelería y Ticketing** de la ficha. Es **idempotente** (`soldout_requested_at`) y
  **best-effort**: un fallo aquí no puede tumbar el guardado de una venta.
  ⚠️ El **aforo** es el de VENTA (`_concert_capacity_from_ticket_types`), el mismo con el que el
  reporte calcula el % — así el 90% de aquí y el que se ve en Ventas no se pueden desparejar. **Sin
  aforo no hay % que calcular y no se pide nada**, y la ficha lo DICE (`soldout.auto`) en vez de
  prometer un automatismo que no va a saltar. Una actividad marcada **SOLD OUT a mano** sí lo pide
  aunque no haya aforo: declararlo es decir que está agotada.
  ⚠️ No se pide de lo que **no vende entradas** (`_concert_sells_tickets`), lo **cancelado/aplazado**,
  el **histórico** (`_concert_is_legacy`) ni lo **ya celebrado**.
  · **QUIÉN LO VE**: la sección **«Sold Out»** de la pestaña Cartelería (con los formatos dibujados,
  el plazo, los días que quedan, subir, descargar y retirar la petición) y **la bandeja de Diseño**,
  donde es una tarea más (`SOLDOUT` en `_design_tasks`) con su pop-up para subirlo; **desaparece
  sola** en cuanto sube el cartel (mira el DATO, no una marca — la regla de `_notify_resolve`).
  ⚠️ El módulo suelto `HOME_SOLDOUT_ARTWORK` (`_home_soldout_artwork`) **se retiró** (sep 2026): lo
  decía por su cuenta y se habría dicho dos veces. Punto único: `_design_tasks`. → `docs/app/diseno.md`
  · **Se sube por el modal de siempre**, con la categoría fijada **EN EL CLIC**
  (`data-art-open="SOLDOUT|POSTER"`, no en `shown.bs.modal`, que con `modal_stack.js` no siempre
  llega) y mandada en el formulario (`category`). ⚠️ Los botones de subir carteles NORMALES llevan
  `data-art-open="POSTER"`: si no, tras abrir el de Sold Out la categoría se quedaría pegada.
  · A mano se pide (o se retira) con **`concert_soldout_request`**, en `SUPPORT_ACTION_ENDPOINTS`:
  lo hacen contratación, ticketing o el propio diseño, y el permiso fino lo comprueba el endpoint.
  ⚠️⚠️ **ESTO SE EJECUTA FUERA DE UNA PETICIÓN** (el sync de Enterticket va en un HILO y hay cron):
  `url_for` revienta ahí, así que el enlace lo compone **`_soldout_artwork_link`** con su respaldo a
  mano. Y **`_notify_user` mira `session`**, así que hace falta un contexto de **PETICIÓN**, no solo
  de aplicación: lo abre **`_soldout_app_context()`**. Con solo `app_context` el correo salía pero
  **el aviso de la campanita no llegaba a nadie** y el `except` se lo tragaba (bug real, lo sacó la
  prueba). Probado con la app real: al 89% no se pide, al 90% sí (una sola vez), sin aforo no, en
  gratuitas/canceladas/pasadas no, el Sold Out no se cuela en lo que se comparte ni como cartel
  principal, sobrevive a reenviar la cartelería, y el aviso + el correo salen desde un hilo.


- ⚠️⚠️ **ENVÍOS A COMPRADORES · el correo SE DISEÑA, por la COMPRA o PUBLICITARIO, a VARIAS bases y
  desde la cuenta de QUIEN FIRMA** (sep 2026). Vale igual desde `/compradores` que desde la pestaña
  Ticketing de una actividad (que llega aquí con `?open=email`).
  · **LA IMAGEN de un listado es la de SU ACTIVIDAD, en vivo** (`_buyer_source_image`: el logo del
  EVENTO si la actividad es de un evento; si no, la foto del artista; sin actividad, la de ET). Antes
  se enseñaba la que Enterticket tenía guardada y al cambiar la imagen del evento seguía la antigua.
  · **EL CONTENIDO DEL CORREO ES UN DISEÑO**: un `PressRelease` con **`purpose='CAMPAIGN'`**
  (`BuyerCampaign.design_release_id`), hecho con el MISMO editor de las notas de prensa —mismas
  opciones y módulos: logo de quien firma, cartelería de la actividad y la general, audios, fotos…—.
  Los campos de antes del correo (título, texto, botón, adjuntos) **desaparecen** del pop-up; el SMS
  sigue igual. Flujo: ¿a quién? → **¿por la compra o publicitario?** → quién firma (y desde qué cuenta
  sale) → **«Diseñar el contenido»** (`buyers_campaign_design_start` deja el envío en BORRADOR con su
  diseño y abre `promo_press_edit`) → el editor vuelve con `?open=email&campaign=<id>`
  (`_campaign_return_url`, `campaign_draft` → `data-draft`) → asunto (si se deja vacío, el titular) →
  enviar. `_campaign_email_html` compone con el diseño (`_campaign_email_from_design`, bandas del
  motor) y, para los correos antiguos, con el título/texto de siempre.
  ⚠️ **Un diseño CAMPAIGN no es una nota**: `_press_is_press_clause()` lo deja fuera de la pestaña,
  del panel de las fichas, de «ya hay una nota sin enviar» y de la tarea del proyecto; la página
  pública dice «Comunicación». ⚠️ **Su PERMISO es el de COMPRADORES**: `_press_edit_ok(pr)` en los
  endpoints del editor (guardar, fondo, imagen, adjuntos) y, en el gate, `_press_request_is_campaign()`
  resuelve `promo_press_*` a `databases.buyers` para esos diseños (ticketing no tiene Promoción).
  · **¿QUÉ COMUNICACIÓN ES?** (`BuyerCampaign.purpose`, `CAMPAIGN_PURPOSES`, con iconos, SIEMPRE):
  **PURCHASE** va a TODOS y no lleva baja; **MARKETING** lleva abajo del todo el botón **«No recibir
  más comunicaciones publicitarias»** (con el TOKEN del destinatario, `BuyerCampaignRecipient.token`)
  y las cabeceras **`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`**, que son
  lo que el iPhone y Gmail usan para ofrecer la baja en un clic. `public_buyer_unsubscribe`
  (`/baja/<token>`, GET con botón · POST, también el «one-click» del cliente de correo) apunta
  **`Buyer.marketing_opt_out_at`** (y `opted_out_at` en el envío): a partir de ahí **no entra en los
  envíos publicitarios** (`_campaign_build_recipients`) pero **sí en los de la compra**. En las tres
  listas de públicos y exenta de CSRF. Un `personalize` de `_send_optional_email` puede devolver
  `(html, texto, cabeceras)` y hay `extra_headers=`.
  · **VARIAS BASES**: desde la rejilla de `/compradores` hay «Envío de SMS» y «Envío de Email»; en el
  pop-up se marcan las bases (`sources_json`, `data-bc-source`) y **quien está en varias recibe UNO**
  (dedupe por correo/teléfono). El histórico de cada base enseña el envío (`sources_json.contains`) y
  la ficha dice «N bases»; `event_id`/`list_id` guardan la primera.
  · **DESDE QUÉ CORREO SALE** (`_campaign_mail_sender`): la cuenta propia de la **ACTIVIDAD**
  (`Concert.mail_account_id`, se pone en el propio pop-up, `buyers_campaign_mail_account_save`) → la
  del **CICLO** que firma → la de la **EMPRESA** que firma (`MailAccount.company_id` / `cycle_id`,
  «De quién es esta cuenta» en Integraciones → Correo) → el remitente de la app. En TODOS los casos el
  **NOMBRE** es el de quien firma («como si lo enviara lo seleccionado»). El pop-up lo dice («Saldrá
  desde…», `mail_from` de la previsualización).
  · **UN LISTADO DE UNA ACTIVIDAD NO REGISTRADA** (anterior a la app): en «Añadir un listado», tras
  elegir artista/evento, abajo del todo «La actividad no está en el sistema»: nombre, fecha y dónde
  fue (la barra de dirección de la casa, `data-addr-reveal`: con el municipio rellena la provincia).
  **No se da de alta ninguna actividad**: `BuyerList.subject_kind/subject_id` + `legacy_*`
  (`_buyer_list_legacy` pinta fecha, lugar e imagen), y el correo de esa base se diseña como del
  artista o del evento (`_campaign_design_ensure`).
  ⚠️⚠️ **EL POP-UP PASA POR «PREPARAR» ANTES DE «CREAR»** (bug real, sep 2026: «Falta el listado o la
  actividad» al subir el listado de una actividad no registrada). El bloque `legacy` solo lo leía
  `buyers_import_create`; `buyers_import_prepare` —el paso del RESUMEN, que es el que pulsa la
  persona— exigía listado o actividad y rebotaba. La prueba no lo cazó porque llamaba a «crear»
  directamente. Punto único **`_buyer_import_legacy_from_payload`** (valida nombre y fecha y limpia
  los campos), usado por los DOS pasos: así el aviso de «ponle nombre» sale en el resumen y los dos
  aceptan exactamente lo mismo. Regla: un paso NUEVO en un flujo de varios POST se prueba **en el
  orden en que lo pulsa la persona**, no solo su endpoint final.
  Probado con la app real (`/tmp/mcx/test_lote2.py`, 66 comprobaciones): contactos con foto y
  departamento, etiquetas sin duplicar y chips del envío, la imagen del evento en vivo, el diseño del
  correo y su permiso, la paleta con el logo de quien firma, tres bases sin repetir a Bea, el From y
  el host de la cuenta de PIES, la baja (botón y un clic) y que un publicitario ya no la incluye pero
  uno por la compra sí, y el listado de una actividad no registrada.

- **IMPORTAR TERCEROS, CONTACTOS DE MEDIOS Y COMPRADORES: NINGÚN CAMPO ES OBLIGATORIO** (sep 2026).
  Un listado puede venir sin nick, sin nombre o sin correo; lo que no trae no puede impedir la
  importación. **Lo único que se descarta es una fila sin NADA de la persona.**
  · **Terceros**: `_promoter_import_nick` cae en cascada nick → nombre completo → DNI/NIF → correo →
    teléfono → **«Tercero sin nombre»** (numerado por `_intake_promoter_nick`: el nick es NOT NULL y
    los genéricos SÍ se numeran, aunque el nick ya se pueda repetir). Y `_promoter_import_match` reconoce también **por TELÉFONO**
    (`_norm_phone_key`, de la ficha y de `PromoterPhone`): una fila con solo teléfono no se duplica al
    reimportar.
  · **Contactos de medios**: `contact_rows` acepta la fila con solo correo o solo teléfono, y donde se
    enseña el nombre (`_media_contact_name`, `_media_import_row_payload`) se cae al correo y al
    teléfono. `_media_import_same_contact` reconoce también por teléfono (cuando no hay ni correo ni
    nombre).
  · **Compradores**: sin email ni teléfono el comprador **entra igual**, identificado por su NOMBRE
    (clave `n:` en `_buyer_import_group`) y solo dentro del MISMO listado (`_buyer_import_match` con
    `source`): fuera de un listado un nombre no identifica a nadie, y así reimportar no lo duplica.
    `sin_contacto` pasa a significar «entra, pero no se le podrá escribir» (la pantalla lo dice así).

- **EDITOR DE NOTAS DE PRENSA (y del correo a compradores): las OPCIONES DEL BLOQUE van ARRIBA A LA
  DERECHA, y una IMAGEN se RECORTA y se GIRA** (sep 2026).
  · El grupo `[data-pr-props]` es el **PRIMER** grupo de la columna derecha (`data-pr-side`, que se
    lleva a `scrollTop = 0` al seleccionar): debajo de la paleta de módulos quedaba fuera de pantalla.
    El título dice «Opciones del bloque — \<tipo\>».
  · **Recortar o ajustar** (`abreRecorte` en `press_editor.js`, overlay `.prcrop-*` propio, sin
    Bootstrap): un recuadro que se arrastra y se redimensiona (8 tiradores, lo de fuera atenuado con
    el `box-shadow` de 9999px), **proporciones** (libre · original · 1:1 · 4:3 · 3:2 · 16:9 · 9:16),
    **girar** ±90° y «Toda». El recuadro va en **FRACCIONES de la imagen ya girada** y el recorte lo
    hace el **SERVIDOR** (`promo_press_image_crop`, Pillow: `exif_transpose` → `rotate(-giro)` →
    `crop` → tope `PRESS_IMAGE_CROP_MAX_SIDE`; PNG si hay alfa, si no JPEG q90) y sube una imagen
    NUEVA con `_upload_bytes`. Así no depende del CORS de Storage ni de leer el lienzo.
  ⚠️ **La original no se toca**: queda en `ref.orig_url` (el guardado conserva cualquier clave escalar
    del `ref`), se vuelve a recortar siempre desde ella y el botón **«Original»** la devuelve. Solo se
    recortan imágenes NUESTRAS (`_is_own_media_url`).
  · **Esquinas redondeadas** (`opts.radius`, deslizador 0–40): el motor ya lo pintaba
    (`border-radius` en `module_html`) pero no había dónde ponerlo.
  ⚠️ En el editor un CLIC sin mover sobre una imagen abre el selector de imagen: seleccionarla para ver
    sus opciones es pinchar y cerrar (o coger el bloque por su asa). Probado en el navegador con la
    app real: 1:1 + 90° + arrastre → aplicar → la imagen queda recortada, «Original» la devuelve y
    «Guardar» entra.

- ⚠️⚠️ **TIPO DE ACTIVIDAD ≠ TIPO DE VENTA** (depuración ago 2026). El `sale_type` (vendido, a
  empresa, gratuito, participado, gira comprada, Cádiz) describe **CONCIERTOS**. Un **evento
  promocional** —o un programa de TV, o una acción con marca— **no es un concierto de ningún tipo**:
  ahí el `sale_type` es solo el apunte interno de si lleva caché (lo pone el asistente: «¿Tiene
  caché?» Sí=VENDIDO / No=GRATUITO), y enseñarlo como etiqueta hacía que por toda la app un evento
  promocional apareciera como **«Conciertos — Gratuitos»** (bug real). Punto único:
  **`_sale_type_label(sale_type, activity_type)`** (con el tipo de actividad manda ÉL: devuelve
  «Evento promocional», «Programa de TV»…) + **`_activity_cache_label`** («Con caché» / «Sin caché»,
  vacío en conciertos) + `_activity_kind_key` / `_activity_kind_label` (normalizan por
  `QUAD_ACTIVITY_ALIASES`) y el conjunto `CONCERT_LIKE_ACTIVITY_TYPES` = {CONCIERTO, FESTIVAL}.
  Corregidos TODOS los sitios que rotulaban por tipo de venta (`/actividades`, la vista de
  conciertos, las fechas de gira/ciclo con `_group_concert_row`, cuadrantes —la columna «Tipo de
  venta» enseña el caché cuando no es un concierto—, eventos y la ficha, cuya cabecera y campo
  «Tipo» empiezan por lo que ES la actividad). En el **formulario** de la ficha, una actividad que no
  es un concierto ya no ofrece tipos de concierto: pregunta **«¿Tiene caché?»** (mismo campo
  `sale_type`, valores VENDIDO/GRATUITO, que es lo que el resto de la app espera).

- ⚠️⚠️ **«GRATUITO» NO ES UN TIPO DE VENTA: es que la ENTRADA es gratis** (ago 2026). Estaban en el
  mismo campo (`sale_type`), así que un concierto gratuito salía por toda la app como «Conciertos —
  Gratuitos» y no se podía decir además CÓMO se vende. Ahora son dos cosas:
  · **`_concert_is_free`** (punto único) — lo dice el modo de entrada
    (`ticketing_payload.entry_mode == 'FREE'`, que es lo que se elige al montarla) y, en lo de antes,
    el `sale_type` guardado como GRATUITO. De ahí sale la **etiqueta verde «Gratuito»**, que se pinta
    al lado del tipo en la ficha y en los listados (Conciertos, Actividades, Eventos).
  · **`_concert_type_label(concert)`** — el TIPO tal como se enseña, ya sin el «gratuito». ⚠️ De una
    actividad gratuita **no se inventa** un tipo de venta que nadie ha dicho: se deja el tipo de
    ACTIVIDAD («Concierto») y lo de gratis lo dice su etiqueta.
  ⚠️ El selector de TIPO de la ficha **ya no ofrece «Gratuito»** en un concierto (se marca en
  «Entradas», con el acceso gratuito); en las que ya lo tenían guardado la opción se conserva para no
  perder el dato.

- ⚠️⚠️ **ACTUALIZACIÓN DE VENTAS · LO QUE SE LE PIDE AL PROMOTOR DE FUERA** (sep 2026). Cuando las
  entradas las vende un **TERCERO**, la casa NO ve las ventas: hay que pedírselas. Desde el **día
  siguiente a la salida a la venta** se le manda la solicitud **los LUNES y los JUEVES a las
  10:00**, con un enlace en el que escribe el total vendido de cada categoría.
  · **A QUIÉN se le escribe: punto único `_concert_ticketing_contact`**, en cascada — el contacto de
  **LA ACTIVIDAD** (`ticketing_payload['ticketing_contact']`) → el de por defecto **DEL TERCERO**
  (`Promoter.ticketing_contact`) → **el propio tercero** (el correo de su ficha).
  Tres formas (`TICKETING_CONTACT_KINDS`, cada una con su icono y solo sus campos): **PROMOTER** (el
  mismo contacto del promotor) · **THIRD** (una persona de la base, con su buscador con foto y su
  «+» para crearla) · **EMAIL** (solo un correo, sin ficha).
  ⚠️ En PROMOTER y en THIRD el correo **NO se congela**: se lee EN VIVO de la ficha, así que
  corregirlo ahí vale para todas sus actividades. Un contacto configurado **sin correo** no bloquea
  la cascada: lo que manda es que haya alguien a quien de verdad se pueda escribir.
  · **LA TAREA de contratación** (`TICKETING_CONTACT` en `CONTRACTING_TASK_META` + la subtarea
  **«9. Configurar el contacto de ticketing»** de la pestaña «Inicio», con su pop-up
  `_ticketing_contact_modal.html`) sale cuando **no hay a quién escribirle**
  (`_concert_ticketing_contact_missing`).
  ⚠️ **Si el promotor ya tiene correo en su ficha NO se reclama nada**: ese es su contacto por
  defecto y la solicitud ya puede salir (lo pidió así Dani). Se mira **el dato de verdad**, así que
  la tarea **entra sola en todas las actividades que ya existen** y desaparece sola en cuanto haya
  un correo: no hay ningún relleno retroactivo que ejecutar (la regla de `_notify_resolve`).
  ⚠️⚠️ La tarea del tablero de la ficha se declara con `suelta(..., modal="#…")` y su botón va en la
  plantilla **FUERA del `{% if t.mine %}`**: una tarea del DEPARTAMENTO nace con `mine=False` y sin
  eso se pinta «Pendiente» pero **sin ningún botón**.
  · **LA CADENCIA** (`_sales_request_due`): la PRIMERA el día siguiente a la salida a la venta, sea
  el día que sea; las siguientes los **lunes y jueves** y solo si han pasado al menos
  `SALES_REQUEST_MIN_DAYS` (2) días desde la última — si no, **se salta esa comunicación** para no
  ser tan insistentes (lunes→jueves son 3 días y jueves→lunes 4, así que la regla solo actúa justo
  después de la primera).
  ⚠️⚠️ **EL DÍA Y LA HORA LOS DECIDE LA APP**, no el planificador: `today_local().weekday()` y
  `SALES_REQUEST_HOUR` (10:00 de Madrid). El cron de Render va en **UTC**, así que un
  `0 8 * * 1,4` se desplazaría una hora al cambiar la hora. El planificador tiene que pegar a
  **`/cron/actualizar-ventas?key=…` CADA HORA** (o una vez al día pasadas las 10:00 de Madrid);
  `?ahora=1` se salta el suelo horario para poder probarlo. El barrido va colgado también del cron
  diario de documentos, para no depender de otra tarea en el servidor.
  ⚠️ Antes de las 10:00 el barrido **lo DICE** (`antes_de_la_hora: true`): si no, una prueba con 0
  correos parecería que la función no va. Y lleva **tope por pasada**
  (`SALES_REQUEST_MAX_PER_RUN` = 120 correos) diciendo cuántos quedan (`pendientes`): un barrido sin
  límite puede no terminar nunca, y lo que no entra sale en la pasada siguiente.
  · **UN CORREO POR DESTINATARIO** (`_sales_request_sweep`): si un promotor tiene varias actividades
  a la venta le llega **UNO con todas**, de la más próxima a la más lejana, y se apuntan todas con
  la misma fecha (así no se le escribe dos veces la misma semana). Solo se apunta si el correo
  **SALIÓ** (`_send_optional_email` devuelve `(ok, error)`).
  · **EL CORREO** (motor único `_sales_request_html`, el MISMO para el correo y la vista previa):
  logo de la empresa del grupo arriba a la **derecha**, «Actualización de ventas» centrado, el botón
  **SIN RELLENO «Derivar a otro responsable de ticketing» ENCIMA de todas las actividades**, y una
  **galleta por actividad** con su imagen (**el CARTEL** y, si no hay, la foto del artista o el logo
  del evento), su cabecera (`_contract_sheet_hero_rows`) y **el botón «Actualizar ventas» dentro,
  abajo a la derecha**. Asunto: **`Actualización ventas, <tipo de actividad>, <artista o evento>,
  <nombre de la actividad o el municipio>, <fecha>`** (`_sales_request_subject`; el TIPO es
  `_activity_kind_label`, lo que ES la actividad, no su tipo de venta).
  · **EL ENLACE PÚBLICO** `public_sales_update` (`/actualizar-ventas/<token>`, token **OPACO** en
  `Concert.sales_request_token`): cada actividad con su cabecera y su tabla — **el tipo de entrada ·
  lo vendido en el ÚLTIMO REPORTE · el TOTAL vendido hoy (lo que escribe él) · y, calculado, lo
  vendido desde el último reporte**. Cada una se envía **por su cuenta y SIN salir de la página**
  (`public_sales_update_save`, JSON: no se recarga, no se mueve el scroll, solo se guardan los
  datos). `?only=<id>,<id>` restringe qué actividades se ven (lo usa el compartir).
  ⚠️⚠️ **`TicketSaleDetail.qty` es el DELTA DE SU DÍA**: lo que se guarda es
  **«el total de hoy − el acumulado anterior a hoy»**, y **se REEMPLAZA el apunte de hoy** (reportar
  dos veces el mismo día no suma dos veces). Un total MENOR que lo ya vendido **no resta**: se
  guarda 0 y se avisa. Una categoría que no venga en el formulario **no se toca**.
  ⚠️ La ticketera del apunte la decide `_sales_request_ticketer`: la única manual de la actividad y,
  si no hay, la ticketera **«Promotor»** de la casa (ese canal ES el reporte del promotor), a la que
  se le crea su `ConcertTicketer` para poder corregirlo también desde `/ventas`. **La de
  ENTERTICKET se descarta siempre**: su rejilla la recalcula el espejo y un apunte a mano se
  perdería en el siguiente sync.
  ⚠️ Sin tipos de entrada se cae al **modo básico** (un único total en la tabla legacy
  `ticket_sales`), el mismo que usa `/ventas`.
  · **DERIVAR** (`public_sales_derive`, `/actualizar-ventas/<token>/derivar`): se le piden **nombre,
  email y teléfono** y al guardar se crea (o se **reutiliza por correo**, sin duplicar) su ficha de
  tercero **VINCULADA al promotor** (`ThirdPartyLink`, «Responsable de ticketing»), se configura
  como contacto de ticketing y **se le REENVÍA la misma solicitud**. Con dos tarjetas con icono:
  **«Actualizar para todos mis eventos»** (escribe el de por defecto del tercero **y limpia los
  propios** de sus actividades vivas — si no, el contacto viejo de cada una seguiría ganando y
  «todos» no sería todos) o **«Solo para este»** (solo la actividad; la configuración del tercero
  **no se toca**).
  · **COMPARTIR** (pestaña **Ticketing** de la ficha): copiar el enlace · WhatsApp · SMS · **Email
  con vista previa** (la compone el SERVIDOR con el MISMO `_sales_request_html`, así que no hay una
  segunda versión que se desparejen). ⚠️ **Solo cuando el promotor tiene MÁS DE UNA actividad ya a
  la venta** se pregunta cuáles, con la de esa ficha **premarcada**; con una sola, copiar/WhatsApp/
  SMS actúan directamente. La `og:` de la página es **el cartel → la foto del artista → el logo**,
  con «Actualizar ventas, \<tipo\>, \<artista\>» y debajo «\<actividad o municipio\>, \<fecha\>».
  · **A QUÉ ACTIVIDADES aplica**: `_concert_sales_request_applies` (vende entradas, CONFIRMADA, no
  histórica, sin celebrar, con promotor y **que NO la promueva el grupo**).
  ⚠️ Distinto de **`_concert_sales_request_on_sale`**: el CONTACTO se configura antes de que salga a
  la venta (para eso está la tarea), pero **lo que se pide y lo que se comparte es solo de lo que ya
  está a la venta** (bug real: en el enlace salía una fecha que aún no había salido).
  ⚠️⚠️ **`_concerts_group_promoted_map` mira LAS DOS cosas** (`group_company_id` **y**
  `ConcertCompanyShare`) y por eso recibe **las ACTIVIDADES, no sus ids**: mirando solo las
  participaciones, una fecha con empresa del grupo puesta salía como «de un tercero» y se le pedían
  las ventas al promotor (bug real que sacó la prueba). Existe para no hacer una consulta por
  actividad en cada carga de Contratación.
  ⚠️ **El TOKEN se crea dentro de `_sales_request_context`**, no en cada sitio que compone el
  correo: sin él no hay enlace y el botón «Actualizar ventas» desaparecería **sin dar ningún
  error**. Y `_sales_request_link` **compone la ruta a mano si `url_for` no puede** («Working
  outside of application context»: esto se monta también desde un barrido o un hilo).
  ⚠️ Los tres endpoints de dentro (`concert_ticketing_contact_save`, `concert_sales_request_preview`
  y `_send`) van en **`SUPPORT_ACTION_ENDPOINTS`**: esto lo hace **TICKETING**, que no tiene por qué
  poder editar contratación, y el permiso (`can_set_concert_onsale`) se comprueba DENTRO. Los cuatro
  públicos, en sus listas.
  ⚠️ **En el MÓVIL la tabla se lee como TARJETAS**, no se desliza: esta pantalla la rellena el
  promotor **desde el teléfono** y con la tabla a lo ancho el campo del total se queda fuera de la
  pantalla (comprobado a 375 px: sin desbordes y con el campo entero a la vista).
  · **DÓNDE SE CONFIGURA**: junto a **«¿Quién saca las entradas a la venta?»** (la sección «Entradas
  y venta» de la ficha de contratación), en la pestaña **Ticketing** y en la **tarea** de la pestaña
  «Inicio». Los tres abren el MISMO pop-up (`_ticketing_contact_modal.html`) y el mismo endpoint:
  ⚠️ el formulario de «entradas» **no lo guarda**, para no tener dos escritores del mismo dato.
  ⚠️ El pop-up va **FUERA de `#concert-general-zone`**: esa zona se reemplaza por AJAX al guardar
  una sección y se llevaría el modal por delante.

- ⚠️⚠️ **ACTUALIZACIÓN DE VENTAS · LAS TRAMPAS QUE SACÓ LA REVISIÓN** (sep 2026). Todas de dinero o
  de privacidad, y ninguna daba error:
  ⚠️⚠️ **SI LA ACTIVIDAD LLEVA SUS VENTAS EN EL MODO BÁSICO, SE SIGUE EN EL MODO BÁSICO** aunque
  tenga tipos de entrada (`_et_concert_has_legacy_sales` en `_sales_request_ticket_rows`). Una
  actividad de un promotor de fuera casi siempre tiene tipos (los crea el asistente) y **no tiene
  ticketera nuestra**, y en ese caso `/ventas` guarda en la tabla LEGACY (`ticket_sales`). Si el
  reporte escribiera en `TicketSaleDetail`: (a) `sales_maps_unified` **descarta el legacy en cuanto
  hay UNA fila V2**, así que el total del concierto pasaría de 300 a lo que trajera el reporte, y
  (b) la base saldría a 0 y el primer reporte contaría **el histórico entero como «vendidas hoy»**
  (y su recaudación como recaudación del día). Un total global no se puede repartir por tipos sin
  inventárselo. Por lo mismo, **un reporte de ceros NO crea filas V2** (una fila a cero no aporta
  nada y basta una para matar el legacy).
  ⚠️⚠️ **EL DELTA SE CALCULA CONTRA TODO LO QUE CONSTA MENOS EL APUNTE QUE SE PISA**: `base` + lo de
  HOY de las **OTRAS** ticketeras. El acumulado del concierto es la suma de todas
  (`sales_maps_v2`), así que restando solo la base se contaba dos veces lo que administración
  hubiera apuntado hoy en otra ticketera (o lo que hubiera espejado Enterticket): entradas y
  recaudación **duplicadas**. Tras guardar, el acumulado es EXACTAMENTE el total reportado.
  ⚠️⚠️ **UN TOTAL CON PUNTO NO SE MULTIPLICA**: con un `replace('.','')` a secas, «10.5» se guardaba
  como **105**. Punto único **`_sales_request_parse_qty`** (espejado en el `num()` del JS de la
  página): son ENTRADAS, así que **no admite decimales**, el punto solo se quita cuando de verdad
  separa miles (`1.250` → 1250) y hay tope de cordura (`SALES_REQUEST_MAX_QTY`), para que un número
  absurdo se rechace con un aviso en vez de con un error de Postgres.
  ⚠️ **Si no se guarda NADA no se dice «¡Gracias!»**: con `saved == 0` (la pantalla está vieja y sus
  tipos ya no existen) se responde 409 diciéndolo. Y el texto de la excepción **no sale a la cara de
  nadie**: el detalle va al log.
  ⚠️⚠️ **EL FORMULARIO PÚBLICO DE DERIVAR NO ES UN ORÁCULO**: buscar el correo en TODA la base y
  reutilizar lo que se encontrara lo convertía en un «dame un correo → te digo de quién es» (y
  encima le escribía los huecos vacíos de su ficha). Solo se reutiliza una ficha que **ya sea del
  propio promotor o esté YA vinculada con él**; con el correo de un tercero ajeno se crea una ficha
  nueva y a la suya **no se le toca nada**.
  ⚠️⚠️ **EL MENÚ DE COMPARTIR SE DELEGA EN `document`, NO EN LA TARJETA**: el ayudante global de
  desplegables (`scripts.js`) **teletransporta el `<ul class="dropdown-menu">` al `<body>`** al
  abrirlo, así que un listener colgado de la tarjeta no vuelve a ver esos botones y las cuatro
  opciones **no hacían nada** (comprobado en el navegador: el menú abierto ya no está dentro de
  `[data-sales-share]`). Es el mismo patrón que `[data-lc-share]`.
  ⚠️⚠️ **EL «+» DE ALTA RÁPIDA PERDÍA EL ID en TODOS los buscadores de la casa** (no solo aquí):
  `quick_create.js` rellena el texto y el oculto y avisa del cambio, y ese `change` disparaba el
  `resolveSelection` de `typeahead.js`, que busca el texto en el DATALIST —vacío a propósito en los
  buscadores con imagen—, no lo encuentra y **BORRA el oculto**: se creaba el tercero y su id se
  perdía. Arreglado en el punto único: `input.app33TaPick(id, label)` siembra lo elegido y
  `quick_create.js` la llama si está (comprobado en el navegador: sin sembrar, el oculto se queda
  vacío).
  ⚠️ **El enlace lleva el token con el que se ESCRIBEN las ventas**: «Ver la página que reciben» y
  el `data-url-public` van dentro de `{% if CAN_SET_ONSALE %}`, como el resto de los enlaces con
  token.
  ⚠️ **El «Derivar» del ENLACE es de la actividad del enlace**, no de la más próxima (que es la
  principal del contexto): con varias a la venta, «Solo para este» configuraba otra. Y la opción
  **dice cuál** (`this_label`).
  ⚠️ **Un correo que no sale se APUNTA** (`Concert.sales_request_error*`): no se reintenta antes de
  `SALES_REQUEST_RETRY_HOURS` (4) y la pestaña Ticketing lo DICE («el último correo no salió»). Y en
  el envío a mano, los destinatarios que fallaron no se cuentan como enviados.
  ⚠️ **Lo que ya se le pidió HOY no se repite**: si a media mañana entra una actividad nueva de ese
  promotor, le llega un correo con LO QUE FALTA, no otra vez todo.
  ⚠️ **La consulta de candidatas se acota en SQL** (fecha y `LEGACY_ACTIVITY_CUTOFF`): sin eso el
  barrido se traía todo el histórico de actividades vendidas en cada pasada horaria.
  ⚠️ **`ticketing_contact` se pinta legible en «Más información»** («Responsable de ticketing») y
  queda **fuera del volcado genérico** de `_concert_contracting_general_rows`: si no, la ficha
  enseñaba el JSON en crudo con el id dentro (visto en pantalla).
  ⚠️ **`public_sales_update*` y `public_sales_derive` van en `REQUEST_ANY_ENDPOINTS`**: son enlaces
  públicos (los autoriza su token) pero también los abre gente de la casa desde «Ver la página que
  reciben», y ahí el gate de permisos no les resolvía sección y en un POST **solo pasaba dirección**
  (403, y en pantalla un «No se pudo guardar» sin explicación).
  ⚠️ El aviso de la página se pinta con **`textContent`**, no con `innerHTML`: lleva el nombre de un
  tipo de entrada, que lo escribe una persona.

- **COMPRADORES · LAS BASES SE AGRUPAN POR DE QUIÉN SON** (sep 2026, lo pidió Dani: «igual que las
  actividades»). `/compradores` abre con una **rejilla de sujetos** —artistas, eventos, ciclos y
  festivales NUESTROS y giras compradas— con **cuántas bases de datos** tiene cada uno; al pinchar
  uno (`?sujeto=artist:<id>` · `event:<id>` · `cycle:<id>` · `tour:<id>`) se ven SUS listados, y
  «Todas las bases» (`?sujeto=todos`) es la rejilla completa de antes.
  · Punto único **`_buyer_subject_keys(concert, legacy)`**: cada listado lleva `subjects` (lo rellenan
  `_buyer_source` y `_buyer_sources_list`). Una base puede estar bajo **VARIOS** sujetos —la fecha de
  una gira comprada es también del artista, la de un ciclo también— (el mismo criterio que una
  actividad de un ciclo, que sale en Conciertos y en Festivales/Ciclos). Una actividad de **EVENTO**
  va bajo el evento, **nunca bajo su artista espejo**; sin actividad registrada manda lo apuntado en el
  listado (`subject_kind`/`subject_id`), y sin nada, «Sin actividad vinculada» (al final).
  · **`_buyer_subject_groups`** resuelve nombres y fotos **en bloque** (una consulta por tipo). Un
  sujeto borrado no se pinta: sus listados siguen en «Todas las bases».
  ⚠️ Los pop-ups de envío ofrecen **las bases que se están viendo** (`sources` ya filtrado): dentro
  de un artista, las suyas; en «Todas», todas. El «Volver» de un listado vuelve a **su** sujeto.

- ⚠️⚠️ **EL RESPONSABLE DE TICKETING se pide SIEMPRE que las entradas las venda un TERCERO**
  (sep 2026). Antes la tarea solo salía si **no había ningún correo** al que escribir, así que en la
  mayoría de las actividades no se reclamaba nunca (el promotor casi siempre tiene correo en su
  ficha). Punto único **`_concert_ticketing_contact_unset`**: está configurado cuando el contacto
  sale de la ACTIVIDAD o del propio TERCERO (`source` CONCERT / PROMOTER_DEFAULT); **caer en el
  correo de la ficha del promotor es el RESPALDO, no una decisión**.
  · Sale como tarea en la pestaña **«Inicio»** de la actividad y como tarea de **Contratación**
  («Sin responsable de ticketing»).
  ⚠️ **No bloquea nada**: sin configurarlo, las comunicaciones para actualizar la venta se le siguen
  mandando por la cascada de siempre (y la tarea lo DICE: «mientras no esté, las ventas se le piden
  al correo del promotor»).
  · **Se configura desde TRES sitios y es el MISMO pop-up** (`#ticketingContactModal`, endpoint
  `concert_ticketing_contact_save`): la tarea de Inicio, **CONTACTOS de la ficha de contratación** y
  «Entradas y venta». El hueco que se ve es el parcial único **`_concert_ticketing_owner.html`**
  (foto, nombre, correo, la etiqueta «Sin configurar» y el botón), así que no hay dos versiones.

- **TICKETING · LAS COMUNICACIONES QUE SIGUEN ESPERANDO** (sep 2026): en la pestaña Ticketing se ve
  **cuándo** se le ha pedido la actualización de ventas y **a quién**, una línea por envío
  («Pendientes de que actualice»), y **en cuanto el promotor actualiza las ventas, todas las
  anteriores desaparecen** y se dice cuándo lo hizo. Lo que se enseña es el trabajo que está
  esperando, no un archivo (lo pidió así Dani).
  · `Concert.sales_request_log` (JSONB) + `Concert.sales_updated_at`, con
  **`_sales_request_log_add`** (lo llama `_sales_request_send`, así que valen el barrido automático
  y el envío a mano), **`_sales_request_log_clear`** (lo llama `public_sales_update_save` al guardar
  el reporte) y `_sales_request_log_rows`.
  ⚠️ En el envío a mano, al primer destinatario se le apunta con **su ficha** (nombre y foto) si es
  el contacto de ticketing, y **cada correo extra al que SÍ le sale** se apunta también: un envío que
  no salió no puede figurar como pendiente de contestar.

- **AFORO · en una actividad GRATUITA es «Aforo», no «Aforo a la venta»** (sep 2026): punto único
  **`_concert_capacity_label`** (global de plantilla **`capacity_label(concert)`**), aplicado en la
  cabecera de la ficha, en sus dos formularios y en la fila del listado. En el asistente ya estaba
  bien (el panel gratuito dice «Aforo estimado»); lo de la pestaña Ticketing es aforo POR TICKETERA
  y sí es a la venta. De paso, `_concert_is_free_event` pasa a ser un alias de `_concert_is_free`:
  la regla vive en UN sitio.

- ⚠️⚠️ **ACTUALIZACIÓN DE VENTAS · TAMBIÉN LO NUESTRO** (sep 2026). Ya existía todo lo que se le
  pide al **promotor de fuera**; ahora la pestaña **Ticketing** de una actividad tiene DOS módulos,
  y solo se pinta el que toca:
  · **Las vende un TERCERO** (`_concert_sales_request_applies`) → el de siempre, con tres cambios:
    **el botón «Solicitar actualización de ventas»** a la vista (antes solo estaba escondido dentro
    de «Compartir → Email…»), **«Añadir o cambiar a quién le llega»** y, sobre todo, **EL HISTORIAL
    YA NO DESAPARECE**: al actualizar las ventas cada comunicación queda **marcada como RESPONDIDA**
    (`answered_at`) y se ve **en VERDE** con la fecha de la respuesta; lo que sigue esperando, en
    ámbar (`.sales-log.is-ok` / `.is-wait`). `_sales_request_log_clear` pasa a llamarse
    **`_sales_request_log_answered`**: vaciarlo borraba la constancia de a quién se le había pedido.
  · **Las vendemos NOSOTROS** (`_concert_sales_own_applies`, el espejo del anterior: vende entradas,
    lleva reporte —ni gratuita ni festival de un tercero; **los CICLOS sí**—, confirmada, sin
    celebrar y `_concert_sale_is_ours`) → módulo nuevo: **a quién se le avisa** (con su cara),
    **cuándo se actualizaron por última vez**, el botón de **actualizarlas** y el de **solicitar la
    actualización** (`concert_sales_own_request`).
  · **EL AVISO INTERNO** (`_sales_own_notice`): a **quien lleva el TICKETING**
    (`_sales_owner_user_ids`: el departamento Ticketing y, si no lo tiene nadie, dirección) por la
    **campanita Y por correo**, con kind nuevo **`VENTAS_ACTUALIZAR`** («Hay que actualizar las
    ventas»), que nace **encendido por correo** (`NOTICE_EMAIL_DEFAULT_KINDS`).
    ⚠️ **El correo es EL MISMO que el del promotor** (`_sales_request_html`) con
    **`_sales_request_context(..., internal=True)`**: el botón «Actualizar ventas» lleva al **BACK
    OFFICE** (`/ventas?cid=…`) y no se ofrece derivar el ticketing. Un solo motor: si se toca el
    diseño, se tocan los dos a la vez.
  · **AUTOMÁTICO**: `_sales_own_sweep`, colgado del MISMO cron (`/cron/actualizar-ventas`) **y del
    cron DIARIO de documentos** (`/cron/documentos-caducados`, donde ya cuelga `_sales_request_sweep`),
    para no depender de dar de alta otra tarea en el servidor. Avisa de
    lo que lleva más de **`SALES_OWN_STALE_DAYS` (7)** días sin actualizarse, como mucho una vez cada
    `SALES_OWN_MIN_DAYS` (7). ⚠️ Cuándo se actualizó por última vez lo dice **`sales_maps_unified`**
    (el MISMO dato que pinta el «Actualizado hoy» del reporte), así que el aviso y la pantalla no
    pueden decir cosas distintas.
  ⚠️⚠️ **HACE FALTA UN CONTEXTO DE PETICIÓN** (`_soldout_app_context`), no solo de aplicación:
  `_notify_user` mira quién actúa con `_current_user_state()` → `session`, que revienta desde un
  cron — con solo `app_context` el correo sale pero **el aviso de la campanita no llega a nadie** y
  el `except` se lo traga (el mismo bug que ya salió con el Sold Out; lo volvió a sacar la prueba).
  ⚠️⚠️ **UN RECORDATORIO QUE SE REPITE NECESITA `email_repeat=True`**: la regla de la casa es «por
  correo solo la PRIMERA vez» (`_notice_email_already_sent`, por usuario + `ref_type`/`ref_id`), y
  sin esa excepción el recordatorio semanal saldría por correo una sola vez en la vida. Es **opt-in**
  y lo comprueban los DOS (`_notify_user` y `_notify_email`, que repetía la comprobación).
  ⚠️ `_notify_email` acepta ya en `email` la clave **`html`** (y `text`): manda ESE cuerpo tal cual,
  que es lo que permite reutilizar el correo del promotor sin una segunda versión que mantener.
  ⚠️ **El aviso se cierra solo** al actualizar las ventas (`_sales_own_notice_resolve` en los dos
  caminos de guardado del back office): la regla de `_notify_resolve`.
  ⚠️ **`/ventas?cid=<id>`** deja SOLO esa actividad (con su aviso y su «Ver todas las del día»): es
  a donde lleva el botón del correo y de la campanita.

- ⚠️⚠️ **LA ACTUALIZACIÓN DE VENTAS SE LE PIDE A QUIEN VENDE, NO A QUIEN PROMUEVE** (sep 2026). Una
  actividad puede ser **NUESTRA** y tener la venta en manos de **otro** (el promotor, el recinto o un
  tercero): eso se elegía solo en el asistente (`ticketing_payload['sale_seller']`) y esas ventas se
  daban por nuestras, así que **no se le pedían a nadie**.
  · **`_concert_sales_request_applies`** pasa a mirar QUIÉN VENDE: la promueve un tercero (lo de
  siempre) **o** la promovemos nosotros y `sale_seller.kind` ∈ PROMOTER | VENUE | THIRD. Sigue
  siendo el espejo exacto de `_concert_sales_own_applies` (`_concert_sale_is_ours`), así que los dos
  módulos de la pestaña Ticketing son **excluyentes** (comprobado sobre 200 actividades: 0 solapes).
  ⚠️ Con la actividad de un TERCERO se sigue exigiendo `promoter_id` (sin promotor no hay a quién
  pedírselo); con la NUESTRA no, que puede no tenerlo — y por eso **`_sales_request_candidates` ya
  no filtra por `promoter_id` en la SQL**: ese filtro dejaba fuera del barrido justo ese caso.
  · **Se configura desde la pestaña TICKETING** (`concert_sale_seller_save`, en
  `SUPPORT_ACTION_ENDPOINTS`): las MISMAS cuatro tarjetas del asistente y el mismo punto único
  (`_parse_wizard_sale_seller`), así que se guarda igual desde los tres sitios (asistente, sección
  «Entradas y venta» de la ficha y aquí).
  ⚠️ El buscador del tercero **no lleva `select-providers`**: ese Select2 filtra las `<option>` que
  YA están en el DOM y aquí solo habría la vacía → no encontraría nada (el mismo bug que tenía el
  director de videoclip). Va por AJAX contra `api_search_commission_entities`, que devuelve terceros
  **y medios**, igual que el paso del asistente.
  · **A QUIÉN se le escribe**: `_concert_ticketing_contact` gana un escalón,
  **`_concert_ticketing_seller_contact`** (`source: SELLER`), entre el contacto por defecto del
  tercero y el promotor a pelo: si vende un TERCERO (o un MEDIO, por su espejo) o el PROMOTOR, se le
  escribe a él sin configurar nada.
  ⚠️ Con **`VENUE` no hay a quién escribir**: un `Venue` **no tiene correo ni teléfono**, así que
  salta la tarea de configurar el contacto a mano — inventarse un correo del recinto sería peor.
  ⚠️⚠️ La clave del contexto es **`sale_seller_cfg`**, no `sale_seller`: la vista de la ficha YA pasa
  `sale_seller` (lo guardado) y `render_template` revienta con «got multiple values» (lo sacó la
  prueba). Es la trampa de siempre al mezclar contextos.
  Probado con la app real: nuestra vendida por nosotros → módulo interno; se cambia a un tercero
  desde Ticketing → pasa al módulo de solicitud, el contacto se resuelve solo al tercero (`SELLER`)
  y entra en el barrido; nuestra sin promotor vendida por el recinto → se pide, y la tarea de
  configurar el contacto salta con su aviso en la ficha.

- ⚠️⚠️⚠️ **NOTAS DE PRENSA Y CORREO A COMPRADORES · LO QUE SE VE EN EL EDITOR ES LO QUE SE MANDA**
  (sep 2026, bug real: «en el editor las cosas se ven como se han configurado, pero en la vista previa
  te crea huecos o alinea los textos de otra forma»). La vista previa **ES** el correo
  (`promo_press_preview` → `_press_email_html` → `press_render.render_email`), así que todo esto se
  arregla en el motor y vale para la previa, el envío, la página pública y el PDF a la vez. Eran
  CUATRO cosas, y ninguna daba error:
  · ⚠️⚠️ **EL EDITOR INFLABA EL ALTO DE CADA TEXTO 6 px EN CADA REPASO** (la causa de los huecos).
    `crecerTexto` medía `t.scrollHeight`, pero el texto va con `height:100%`, así que su scrollHeight
    **nunca es menor que el bloque**: `necesario = alto + 8` salía siempre mayor y el bloque crecía
    cada vez que se soltaba el ratón o se escribía. Al final pisaba al de abajo y, en el correo —donde
    dos bloques NO se pueden superponer—, los dos salían apilados con un hueco enorme. Ahora se mide
    el CONTENIDO (`height:auto` un instante y se lee el scrollHeight).
  · ⚠️⚠️ **CADA UNO TENÍA SUS VALORES POR DEFECTO**: el editor pintaba un titular a **26 px con
    interlineado 1,25** y el correo lo mandaba a **15 px con 1,4**. Punto único
    **`press_render.TEXT_DEFAULTS`** (+ `text_defaults(kind)`), que **viaja al editor** en
    `data-text-defaults` — así no se pueden desparejar — y que usan también el PDF y la miniatura.
  · ⚠️⚠️ **EL HUECO ENTRE PÁRRAFOS**: en el editor los `<p>` llevaban el margen del navegador (1em
    arriba y abajo) y en el correo `margin:0 0 .35em 0`, así que el texto se veía más abajo y más
    separado. El CSS del editor (`.pr-blk__text p`) usa ya el mismo, y los enlaces también
    (`color:inherit;text-decoration:underline`). ⚠️ Y el marco del bloque va en **`outline`**, no en
    `border`: con un borde de 1 px el contenido medía 2 px menos y el texto empezaba 1 px desplazado.
  · ⚠️⚠️ **UN MÓDULO MEDÍA 18 px MÁS EN EL EDITOR**: heredaba la tipografía de la app (Bootstrap:
    16 px y 1,5 de interlineado) y en el correo la del cliente. La tarjeta declara ya su base
    (**`press_render.MODULE_BASE`**, espejada en `.pr-blk__mod`), así que mide igual en los cuatro
    sitios.
  · **Y EL CORREO SE COMPONE CORTANDO EL LIENZO, NO EN COLUMNAS A PELO** (`press_render._pack`): en un
    correo no hay `position:absolute`, así que el rectángulo se va cortando **en franjas mientras se
    pueda y, si no, en columnas**, hasta que cada bloque se queda solo en su celda con su sitio, su
    **ancho exacto** y su alto. Cualquier maqueta en la que los bloques no se pisen sale EXACTA.
    ⚠️ Antes los bloques de una franja se metían en columnas por su x y **los que compartían columna
    se apilaban con el `padding-top` medido desde el inicio de la banda** (se sumaba al alto del
    anterior: de ahí los huecos), y la celda tenía el ancho del GRUPO, así que un texto centrado se
    centraba respecto a otro ancho.
    ⚠️ **Un solape de menos de `OVERLAP_EPS` (4 px) no cuenta como «se pisan»**: dos textos puestos
    uno al lado del otro que se rozan 2 px acababan apilados y dos puestos uno debajo de otro se
    separaban con un hueco enorme.
    ⚠️ Lo que se pisa DE VERDAD se pone uno detrás de otro sin hueco: en un correo no hay otra.
  · **Las FRANJAS de primer nivel siguen anclando su trozo de fondo** (`compute_bands` + `_bg_css`
    con `background-position` negativo): así un estiramiento no desalinea todo el fondo de golpe.
  · **Prueba de regresión**: `python3 tools/check_press_render.py` (sección 6: los casos que
    fallaban). Comprobado además con la app real, midiendo bloque a bloque el editor y la vista
    previa: **el mismo x, y, ancho y alto en los dos**, con fondo y sin fondo.

- **ACTUALIZAR VENTAS · la foto del artista, y sin los vinculados** (sep 2026): cada actividad de
  `/ventas` sale con la **foto del artista** (o el logo del evento, entero) delante de su nombre, y
  **se retiran las personas vinculadas al artista** que se pintaban debajo (`linked_mini('artist')`):
  eso es de la ficha del artista y en una pantalla de actualizar ventas solo es ruido — la misma
  regla que ya se aplicó en la cabecera de una actividad. Las del RECINTO se conservan.
  ⚠️ El `data-artist-link` (que hace clicable la foto) **no se pone en el espejo de un evento**: su
  ficha de artista no debe verse nunca.

- ⚠️⚠️ **«ACTUALIZAR VENTAS» NO SERVÍA PARA NADA SUELTO** (bug real, sep 2026, lo sacó
  `tools/check_permisos.py`): **todos** los endpoints `sales_*` resolvían a la SECCIÓN `ventas`, y
  `has_access_key` acepta los **ANCESTROS, no los descendientes** — así que a quien se le concedía
  **solo** la pestaña «Actualizar ventas» se le pintaba la pantalla (42 formularios) y **cualquier
  cosa que hiciera ahí daba 403**: guardar la venta del día, los tipos de entrada, las ticketeras,
  el sold out. Ahora se acepta **la PRIMERA clave que tenga** (`SALES_UPDATE_ACCESS_KEYS`: la
  sección entera **o** su pestaña), el mismo patrón que contabilidad y que la base de facturas.
  ⚠️ **No abre nada nuevo**: si no tiene ninguna de las dos, se resuelve a `ventas` como siempre
  (comprobado: sin nada de ventas sigue siendo 403), y el REPORTE sigue siendo `ventas.reportes` con
  su propio interruptor económico (`can_view_sales_revenue`).
  ⚠️ **El checker solo lo destapa si la pantalla tiene FILAS**: con la BD de prueba vacía, /ventas no
  pinta ningún formulario y el fallo no aparece. Si se pasa `check_permisos.py` sin datos, no
  significa que no haya nada.

- ⚠️⚠️ **LA RECAUDACIÓN SOLO ES NUESTRA SI LA PROMUEVE (o participa) UNA EMPRESA DEL GRUPO**
  (sep 2026). En lo que promueve un **TERCERO** la taquilla es **SUYA** —nosotros cobramos un
  caché—, así que en **«Actualizar ventas»** y en el **«Reporte de ventas»** esa actividad **no
  tiene recaudación, ni bruta ni neta**: enseñar un importe que no ingresamos es peor que no
  enseñar nada. Lo que **sí se ve siempre** es cómo va la venta (vendidas, aforo, %, pendientes,
  sold out), que es lo que se sigue.
  · Puntos únicos **`_concert_has_revenue`** / **`_concerts_have_revenue_map`** (el criterio es el
  de siempre, `_concert_is_group_promoted`) + **`_sales_zero_out_revenue`**, que pone el dinero
  **a CERO en el CONTEXTO**: así **ningún total** (los KPIs del reporte, las sumas por sección del
  correo) se lleva por delante una recaudación ajena. Quien PINTA el importe mira además
  `revenue_map` y escribe **«Taquilla del promotor»** (`NO_REVENUE_LABEL`) en vez de un 0,00 € que
  parecería un dato.
  · Aplicado en los CINCO sitios: `/ventas` (las métricas y el pop-up de actualizar) · el
  **reporte** (pantalla, **A4**, **correo** —con su columna «—»—) · el **A4 de /ventas** y el
  **informe por concierto**, que lo dice arriba en un aviso.
  ⚠️ `_concerts_group_promoted_map` se alineó con `_concert_is_group_promoted` (le faltaba «a
  EMPRESA con empresa que factura»): con dos criterios distintos, la misma fecha salía como del
  grupo en un sitio y de un tercero en otro.

- ⚠️⚠️⚠️ **LO GRATUITO NO TIENE SALIDA A LA VENTA** (sep 2026, lo pidió Dani: «en las gratuitas no
  debe aparecer la fecha de anuncio de venta de entradas ni nada relacionado, ni en la
  configuración, ni en los detalles de la ficha, ni en las notificaciones al artista; si es gratuito
  aparece con su etiqueta y ya está»). Si no se venden entradas **no hay fecha de salida a la
  venta**, así que enseñar «Salida a la venta: por confirmar» al lado de la etiqueta «Gratuito» era
  información contradictoria — y un campo que no sirve para nada.
  · **Punto único: `_concert_is_free`**, el MISMO que pinta la etiqueta, así que lo que se enseña y
  lo que se esconde no se pueden desparejar. **No hay una segunda regla**: si sale la etiqueta
  «Gratuito», no sale nada de la venta. Textos en **`CONCERT_FREE_ENTRY_LABEL`** («Gratuita», para
  las cabeceras) y **`CONCERT_FREE_ENTRY_TEXT`** («Gratuita · no se venden entradas», para las
  fichas y los avisos).
  · **DÓNDE deja de aparecer**: el formulario de **«Datos»** de la ficha (donde iba el campo va
  ahora la etiqueta «Gratuito» y una línea que lo explica) · la vista de **«Entradas y venta»** ·
  la **etiqueta de venta de la cabecera** (`_concert_onsale_badge.html`) · la ficha de contratación
  (`_concert_contracting_general_rows`) y **su PDF** (donde iba «A la venta» va «Entrada ·
  Gratuita»; y el aforo de la cabecera usa ya `_concert_capacity_label`, que en una gratuita es
  «Aforo» a secas) · el **aviso al artista** (`_activity_notice_announcement`: en vez de la salida a
  la venta, «Entrada · Gratuita · no se venden entradas», y se sigue diciendo cuándo se anuncia) ·
  el **SMS del día del anuncio** (`_announce_sale_url` no da enlace de venta) · la fila de
  **Conciertos** de `concerts.html` · y el **formulario del promotor**, que no le pregunta nada de
  ticketing más allá del aforo.
  · **LA CABECERA DE LA ACTIVIDAD LO DICE** (`_contract_sheet_hero_rows`, la que comparten la ficha,
  los correos y el formulario del promotor): **«Entrada · Gratuita»** con el icono del regalo. Así lo
  ve también quien recibe el correo, que es donde se pidió.
  ⚠️ **Y no reclama trabajo de venta**: `_concert_sale_state` devuelve vacío en una gratuita, así que
  no salen «Activar la venta», «Sin activar la venta» (tarea de Contratación) ni «Notificar la salida
  a la venta». Antes bastaba con que el modo de entrada dijera SALE; ahora la etiqueta manda, así que
  una actividad **mal apuntada** (modo «venta» + tipo GRATUITO, que es lo de antes) tampoco los pide.
  ⚠️⚠️ **EL BUG DE VERDAD ESTABA EN GUARDAR «DATOS»**: el campo llegaba vacío y el guardado hacía
  `sale_start_tbc = True`, así que **cualquier** actividad gratuita a la que se le tocara un dato
  pasaba a decir «Salida a la venta: por confirmar» en la ficha y en el aviso al artista. Ahora, si es
  gratuita se **limpia** (fecha, TBC y hora) y, si no, se guarda **solo si el formulario trae el
  campo** (centinela: una pantalla vieja no lo pisa). Lo mismo al cambiar el acceso a gratuito en
  «Entradas y venta» — y al volver a «venta de entradas» se puede poner otra vez.
  ⚠️ El panel de venta de «Entradas y venta» sigue en el HTML (es como se cambia el acceso), pero
  nace **oculto y con sus campos DESHABILITADOS** (`entPanel`/`entPanelsInit` en `concert_detail.html`,
  que se rehacen tras el refresco AJAX con `inline:updated`): un campo oculto se envía igual.
  ⚠️ **El servidor lo vuelve a comprobar**: `concert_onsale_set` rechaza ponerle fecha a una gratuita
  (su etiqueta ni se pinta, pero el endpoint existe) y `_prepare_contract_sheet_merge` no le propone
  la fecha aunque la ficha del promotor la traiga guardada de antes.
  · **PRUEBA DE REGRESIÓN: `/tmp/python/bin/python3 tools/check_gratuito.py`** (35 comprobaciones con
  la app real, de punta a punta, incluidas las 12 pestañas de las dos fichas).

- ⚠️⚠️ **ACTUALIZAR VENTAS · EL COLOR DE CADA TARJETA DICE SI HAY TRABAJO Y DE QUÉ TIPO**
  (sep 2026, punto único **`_sales_update_cards`** → `card_map`):
  · **VERDE** — al día: **CONECTADA** (Enterticket la actualiza sola, así que **NUNCA sale como
    pendiente**) o **actualizada hoy** a mano.
  · **AZUL** (`sales-card-setup`, el azul que ya existía como `sales-card-never`) — todavía no está
    en marcha: **sin ningún dato** (nadie ha actualizado nunca) o, si la vende un tercero, **sin
    configurar la solicitud automática**. Es lo que hay que dejar montado, no el olvido de un día.
  · **AMARILLO** — pendiente: hay datos y hoy no se han actualizado.
  · **ROJO** — SOLD OUT (manda sobre el resto, como siempre).
  · **LAS CONECTADAS** llevan la etiqueta **«Conectada · hoy 12:31»** y el botón **«Actualizar
    ahora»** (`concert_et_sync`, que ahora **vuelve a donde se pulsa**: `safe_next_or`).
  · **LAS QUE VENDE UN TERCERO** llevan, además: la etiqueta de **cuándo se le pidió** («Solicitada:
    …» / «Todavía no se le ha pedido») y el botón **«Solicitar actualización»**; y si la solicitud
    automática **no está configurada**, la etiqueta **ROJA «Solicitud automática no configurada»**,
    que lleva a la ficha con **`?tab=ticketing&open=contacto-ticketing`** — el pop-up de siempre se
    abre solo. No se duplica ese pop-up en /ventas: depende de UNA actividad (ids fijos) y se
    configura donde se configura.
  ⚠️⚠️ **PEDIRLA A MANO ES ADICIONAL: NO TOCA EL RELOJ DEL AUTOMÁTICO.**
  `_sales_request_send(..., auto=False)` apunta el envío en el historial y en el contador pero **no
  mueve `sales_request_last_at`**, que es lo que mira `_sales_request_due` para los lunes y los
  jueves. Lo usan el botón nuevo (**`concert_sales_request_now`**) y el envío a mano de la ficha.
  ⚠️ Por eso «la última solicitud» sale del HISTORIAL (**`_sales_request_last_label`**): mirando solo
  la columna, lo que se acaba de mandar no se vería en ninguna parte.
  ⚠️⚠️ **ENTERTICKET ES TRABAJO DE TICKETING** y sus rutas cuelgan de `/conciertos/…`, así que el gate
  las resolvía a `contratacion.conciertos` **con edición**: quien tenía que traer las ventas se comía
  un **403 al pulsar «Actualizar ahora»** (en la ficha y aquí). `concert_et_sync` · `_link` ·
  `_unlink` · `_dismiss` · `_config_apply` van en **`SUPPORT_ACTION_ENDPOINTS`** y sus lecturas
  (`_status`, `_series`, `_config_preview`) en `SUPPORT_READ_ENDPOINTS`, con la puerta fina DENTRO
  (`can_set_concert_onsale()`). ⚠️ **Volcar la configuración** sigue exigiendo `can_edit_concerts()`:
  cambia los tipos de entrada y el aforo, y eso es de contratación.
  ⚠️ Lo lista `/ventas` desde el día que **sale a la venta** hasta el de la actividad, sin lo
  GRATUITO ni el FESTIVAL de un tercero (`_concerts_need_sales_report_map`, el punto único de
  siempre), y **todas** —las venda quien las venda— conservan el pop-up de **actualizar a mano**
  (se escribe el TOTAL y la app calcula la diferencia).

