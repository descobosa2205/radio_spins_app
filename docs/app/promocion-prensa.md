# Promoción, marketing y notas de prensa

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- MARKETING ≠ PROMOCIÓN. Eran la misma pantalla y se confundían
- PROMOCIÓN de prensa (Promotion.kind='PROMO' + PromotionActivity.activity_kind='PROMOCION';
- COMPROBAR una factura y PAGARLA no es lo mismo con la retención en medio
- TOCADAS · «ACTUALIZAR POSICIONES», todas de una vez
- NOTAS DE PRENSA · EL CÓDIGO DE INSERCIÓN (el módulo para cualquier web) y la MINIATURA
- MARKETING · LAS ACCIONES SON UN MÓDULO DEBAJO DE INFORMACIÓN: la pestaña «Acciones»
- BOLSA · UN GASTO QUE ES UNA ACCIÓN DE MARKETING SE LEE COMO LO QUE ES: en la fila del
- MARKETING · EL LISTADO: dos pestañas, «Acciones» (sin contador) y «Archivadas».
- NOTAS DE PRENSA · LOS CONTACTOS: dos módulos sueltos y NINGUNO FIJO.
- CONTACTOS DE UN MEDIO · la ficha, los programas y las NOTAS DE PRENSA. Los contactos
- SUBIR CONTACTOS DE MEDIOS DESDE UN FICHERO. Icono de subida a la izquierda de
- NOTAS DE PRENSA (Promoción → pestaña «Notas de prensa»). Una nota de prensa es
- NOTAS DE PRENSA · segunda ronda
- NOTAS DE PRENSA · CUENTAGOTAS DE COLOR: al lado del selector de color del texto hay
- EL TAMAÑO DE UN BLOQUE SE AJUSTA POR CUALQUIER LADO (sep 2026, notas de prensa y comunicaciones
- UNA PERSONA DE UN MEDIO ES UN TERCERO. «Añadir contacto» en la ficha de un
- UN MÓDULO SE ARRASTRA VACÍO Y LUEGO SE ELIGE QUÉ LLEVA (sep 2026, notas de prensa y

---

- **MARKETING ≠ PROMOCIÓN** (ago 2026). Eran la misma pantalla y se confundían:
  · **Marketing** = campañas **de pago** (radio, TV, digital, exterior, influencers…). Sección
  `promocion` → `/marketing`, asistente `_promotion_wizard_modal.html` («Nuevo marketing», botón
  **«+ Marketing»**). Su «acción concreta» **materializa la acción** (`_marketing_seed_action`:
  `PromotionActivity` con `activity_kind='MARKETING'`, pendiente de consolidar) — antes creaba el
  contenedor vacío y no había nada que gestionar. El sujeto **GIRA ya se elige** de las
  `PurchasedTour` reales (antes era texto libre con `source_id=None`: la campaña quedaba huérfana y
  no salía en ninguna ficha) y hay sujeto nuevo **CICLO** (`CycleFestival`). Panel
  `_promotion_entity_panel.html` (contexto único **`_promotion_panel_context`**) en artista, canción,
  disco, concierto y, nuevo, en la pestaña **Marketing** de gira y ciclo/festival/evento.
  · **Promoción** = **prensa**: entrevistas, junts de prensa, phoners. Sección `promo` →
  `/promocion-peticiones`, con tres pestañas (Peticiones · Promociones · Archivadas).
- **PROMOCIÓN de prensa** (`Promotion.kind='PROMO'` + `PromotionActivity.activity_kind='PROMOCION'`;
  comparte tablas, bolsa y hoja de ruta con Marketing). Endpoints **`promo_*`** (URLs
  `/promocion-prensa/…`): ⚠️ `promo_` NO es `promotion_`, y por eso heredan solos el permiso de su
  sección en `_resolve_request_resource_key`/`_coarse_endpoint_resource`. Piezas:
  · **Puntual** (`request_kind='ACTION'`, una entrevista) o **plan completo** (`PLAN`, con nombre y
  rango de días; `_promo_plan_days` los pinta «Día 1, Día 2…» como una hoja de ruta y dentro se van
  añadiendo promociones).
  · Cada entrevista lleva **medio + programa + contacto**, **modalidad** (`PROMO_MODALITIES`:
  presencial / phoner / Zoom / preguntas), **ubicación** solo si es presencial (sugerencias de
  **`MediaLocation`**, tabla nueva: un medio tiene VARIAS ubicaciones, y una nueva se puede dejar
  vinculada al medio), **¿canta?** → repertorio (`_promo_song_options` pone **primero la canción que
  se promociona**) + **formación** (`PROMO_FORMATIONS`: full/half playback o **directo con N
  músicos**), **caché** y **gastos cubiertos** (el MISMO módulo que «el promotor cubre otros gastos»
  de Contratación: `_parse_promoter_costs_form`).
  · **Estados** con los MISMOS códigos que un concierto (BORRADOR/HABLADO/RESERVADO/CONFIRMADO,
  etiquetas en femenino) para que valgan el calendario y `_agenda_status_meta`. **`promo_status` no
  es `status`**: `status` sigue siendo ACTIVE/ARCHIVED. Al **confirmar la promoción se confirman sus
  entrevistas**.
  · **Caché → Contratación**: `_promo_booking_request_sync` crea un `BookingRequest` con
  `payload['departments']=['CONTRATACION']` (contrato y factura como en un concierto); si se quita el
  caché, la petición se **descarta**, no se borra.
  · **Producción**: `production_needed` + `production_owner_user_id` → `ProductionRequest`
  (`linked_type='PROMOTION'`, columna nueva **`owner_user_id`**), que sale en Producción → Solicitudes
  y en el módulo de Inicio `_home_produccion_pending` de esa persona.
  · **Acompañante** (`escort_kind` NONE|USER|PROMOTER): lo asigna promoción **al gestionar la ficha**,
  no en el alta.
  · **Hoja de ruta**: cada entrevista se **espeja** como punto de la agenda
  (`_promo_roadmap_sync_item`, kind ENTREVISTA + `promo_meta` con los iconos de tipo de medio,
  modalidad, canta y **en directo**; los pinta `roadmap.js`). La fuente de verdad es la entrevista:
  el punto se mantiene al día al guardar y se borra al eliminarla. El enlace público de la hoja
  funciona igual que en una actividad (`ROADMAP_ENTITY_TYPES` ya incluía `promotion`).
  · **Bolsa de gastos** propia (`_ensure_promo_bag`, `bag_type='PROMOCION'`) y **empresa del grupo que
  factura** (`Promotion.company_id`, que se copia a la bolsa).
  · **Fotos**: `PHOTO_OWNER_TYPES` incluye **PROMOTION** (pestaña Fotos en la ficha).
  · **Calendario**: un PLAN sale como **una franja** de principio a fin; una puntual, cada entrevista
  en su día (kind `promocion` en `AGENDA_KIND_META`).
  · **Registros**: `_build_registros_promos_pending` lista, **agrupadas por semestre**, las
  promociones ya celebradas en las que **se cantó** y no están declaradas
  (`registros_promo_declare`).
  · **Dónde se ve**: `_promo_rows_for_subject` + `_promo_entity_panel.html` en la ficha de
  canción, disco, artista y concierto.
  · **«Nueva petición» ofrece también PROMOCIÓN y MARKETING**: el paso 1 del asistente general
  (`_peticion_wizard_modal.html`) ya no pregunta «qué tipo de actividad»: es **«¿Qué quieres
  pedir?»** con **UNA sola rejilla** donde van igualadas las actividades y lo demás (concierto,
  festival, evento promocional, TV, marca, **promoción**, **marketing**, otros). Las dos últimas no
  se contratan, así que **saltan** a su asistente corto (`data-peticion-handoff`: cierra el general
  y abre el otro cuando Bootstrap ha terminado de ocultarlo, si no se lleva el fondo por delante).
  ⚠️ Esas dos tarjetas son `<button>` y el resto `<label>`: sin `button.invitation-radio-option
  { font:inherit }` el navegador les pone su propia tipografía y se ven distintas en la misma
  rejilla. Marketing usa
  **`_marketing_peticion_modal.html`** → `marketing_peticion_create` (artista · qué se promociona ·
  plan o acción + tipos · objetivos, presupuesto y plazo), que cae en Marketing → Peticiones.
  ⚠️ No es `promotion_request_create`: ese exige poder EDITAR marketing porque sale de la ficha del
  elemento. Los dos endpoints de PEDIR están en **`REQUEST_ANY_ENDPOINTS`** (se mira ANTES que
  `SUPPORT_ACTION_ENDPOINTS`): pedir algo lo puede hacer **cualquier sesión**, sin necesidad de ser
  «actor», porque quien pide no hace nada, se lo pide al departamento que decide.
  · **Peticiones de promoción**: las crea **cualquiera** de la empresa (asistente corto propio
  `_promo_peticion_modal.html`, botón «Pedir promoción» en Contratación → Peticiones y «Nueva
  petición» en la sección Promoción): de quién es (artista o evento) · qué se pide
  (`PROMO_REQUEST_KINDS`) · medio · cuándo y dónde (las dos pueden no saberse) · quién la pide.
  Es un `BookingRequest` con `payload['departments']=['PROMO']`; `promo_peticion_create` está en
  `SUPPORT_ACTION_ENDPOINTS` porque no exige tener la sección. Promoción la gestiona y con **«Crear
  la promoción»** (`promo_from_request`) la vuelca en una promoción de verdad, que nace en BORRADOR.
  · **En BORRADOR no sale en el calendario** (ni las canceladas): una petición o un borrador no
  ocupa el día de nadie hasta que promoción lo confirma.
  · **Quién CIERRA la bolsa** (`_promo_bag_can_close` + `_promo_bag_closer_ids`): si la promoción
  lleva producción, quien la produce; si no, promoción o **la persona que viaja con el artista**.
  Al cerrar, `_bag_liquidation_responsibility` decide a quién de administración le llega: con pagos
  pendientes a **LIQUIDACIONES**; **sin nada que pagar**, a la categoría nueva
  **`LIQUIDACIONES_PROMO`** («Liquidar gastos de promoción sin pagos pendientes»), que se ve en el
  módulo de Inicio y marca las bandejas de liquidación/cierre como suyas.
  · **Cuando administración CIERRA la liquidación** (`liquidation_status='CERRADA'`) el gasto pasa a
  contar: `_promo_spend_rows` lo enseña en la **inversión del artista** (`_artist_investment_rows`)
  y, si la promoción era de un single o un disco, también en la ficha de ese lanzamiento. ⚠️ Es el
  mismo dinero visto desde dos sitios: **cada pantalla lo cuenta una vez y los totales no se suman
  entre sí**.
  · **Tareas** (`_home_promo_tasks`, módulo de Inicio): le salen a promoción y a quien viaja con el
  artista mientras se gestiona; desaparecen al cerrar la bolsa, y si la promoción lleva PRODUCCIÓN
  se les caen **al día siguiente** de la última fecha (a partir de ahí es trabajo de producción).
  La bolsa sigue en «Mis gastos» para poder asignar lo que falte.
  · **Avisos a producción** (`PromotionAlert` + `_promo_alert_add` + módulo de Inicio
  `HOME_PROMO_ALERTS`): si cambia la **fecha, la hora o el sitio** de una promoción, o si se
  **cancela** (`promo_cancel`, estado `CANCELADO`), le salta el aviso a quien la esté produciendo,
  con el antes → después. No se avisa a uno mismo.
  · **Permisos**: la sección es `promo`. `_promo_access_seed` (una vez, marca `promo_access_seed_v1`)
  se lo concede al departamento **Promoción**. **Abrir** la ficha de una promoción lo puede hacer
  también producción/administración (regla de lectura en `_resolve_request_resource_key`, como
  `_activity_read_resource_key` con las actividades); **editar** sigue exigiendo `promo`.
  · UI: asistente `_promo_wizard_modal.html` (pasos condicionales con `data-sw-when="PLAN|ACTION"`),
  campos compartidos con la ficha en **`_promo_activity_fields.html`** (macros: un solo sitio para
  los nombres de campo, que lee `_promo_apply_activity_form`), paneles condicionales y datos del
  medio en **`static/js/promo.js`**, estilos `.promo-*` en `styles.css`. Alta rápida de **medio**
  añadida a `quick_create.js` (`data-quick-create="media"`).

- ⚠️⚠️ **COMPROBAR una factura y PAGARLA no es lo mismo con la retención en medio** (ago 2026):
  · al **COMPROBAR** que la factura cuadra manda la **BASE** (`_invoice_amount_check`): la retención
  no cambia lo que se ha facturado ni lo que cuesta el gasto.
  · al **PAGAR**, el importe es el **TOTAL DE LA FACTURA**, o sea base + IVA **menos la retención**:
  es lo que va a recibir el tercero (lo retenido lo ingresa la casa en Hacienda). Punto único
  **`_expense_retention`** (manda la de la FACTURA; una factura que cubre varios gastos no vale
  porque su retención es del conjunto) + **`_expense_retention_map`** (la de cientos de gastos en una
  tacada, que es lo que lista pendiente de pago) + **`_expense_payable_gross`** (bruto − retención) +
  **`_expense_payment_amount`** (lo que queda por pagarle). Lo usan pendiente de pago, los items de
  la remesa, `administration_expense_mark_paid` (si no, pagar lo que decía la factura dejaba el gasto
  en PARCIAL para siempre) y `payment_batch_receipt`. En royalties,
  `_payment_batch_add_royalties` manda el total de la factura igual que `_royalty_payment_pending_rows`
  (antes mandaba base + IVA y con retención se pagaba de más).

- **TOCADAS · «ACTUALIZAR POSICIONES», todas de una vez** (ago 2026): con las tocadas de la semana
  ya subidas aparece el botón **«Actualizar posiciones»** (`plays_view` lo ofrece solo si
  `week_has_plays`), que lleva a su propia pantalla (`plays_positions_view`,
  `/tocadas/posiciones?week=…`, plantilla `plays_positions.html`): **una tarjeta por emisora —solo
  las que tienen tocadas esa semana— con sus canciones de la que más ha sonado a la que menos** y,
  debajo, la **posición en el ranking nacional** de las canciones que han sonado (también de más a
  menos). Es **UN solo formulario**: se guarda todo a la vez (`plays_positions_save`, que escribe
  `Play.position` y `SongWeekInfo.national_rank`).
  · Botón **«Numerar por tocadas»** por bloque y uno global: como las filas ya vienen ordenadas,
  pone 1, 2, 3… en ese orden. Es una ayuda; cualquiera se corrige a mano.
  ⚠️ Las posiciones por emisora se escriben **sobre las tocadas que YA existen**: no se inventa una
  fila para una canción que esa semana no ha sonado en esa emisora. Los campos van
  `pos_<station_id>_<song_id>` y `nat_<song_id>` (los UUID no llevan guiones bajos, así que el
  `split("_", 2)` es seguro).
  ⚠️ Los endpoints nuevos hay que mapearlos en los **DOS** sitios (`fixed` de
  `_coarse_endpoint_resource` y `_resolve_request_resource_key`) a `radio.actualizar`; la ruta
  `/tocadas` ya los cubriría por prefijo, pero el mapeo explícito es el que manda.

- **NOTAS DE PRENSA · EL CÓDIGO DE INSERCIÓN (el módulo para cualquier web) y la MINIATURA** (sep 2026):
  · En la pestaña de notas, cada galleta (artista, evento, gira, ciclo, empresa) tiene sus **⋯ →
  «Copiar código de inserción»** (`_press_embed_snippet`, pop-up `#prEmbedModal`): un `<div
  data-np33="KIND:ids">` y un `<script src="/np/insercion/<KIND>/<ids>.js" async>` que se pegan en
  cualquier web. **`public_press_embed_js`** devuelve la librería **`static/js/press_embed.js`** más
  `np33Embed.boot(DATA, document.currentScript)` con las notas de ese sujeto (`_press_embed_items`):
  se genera en cada carga (caché de 2 min), así la web de fuera **se pone al día sola**.
  ⚠️⚠️ **Solo las ENVIADAS** (`status == 'SENT'` y `_press_is_press_clause()`): ni borradores ni
  programadas ni los diseños de un envío a compradores; y **un reenvío es la misma nota** (una fila
  de `PressRelease`), así que no se repite — solo salen las nuevas. Las de un ARTISTA se buscan en
  `artist_ids` (una nota de varios artistas sale en el módulo de cada uno).
  · El módulo: **100% del ancho de la PANTALLA** (`.np33--bleed`, `width:100vw` con el margen
  negativo; `data-np33-bleed="0"` lo deja al ancho del hueco), **fondo transparente**, una tarjeta por
  nota (miniatura · fecha · titular · resumen, `press_render.summary_of`) que **se desplaza a
  izquierda y derecha** (scroll-snap + flechas) y **al pinchar abre la nota en un POP-UP dentro de la
  misma web**: un `iframe` a la página pública con **`?embed=1`** (sin barra ni pie). **Detecta si el
  fondo de la web es claro u oscuro** (`esOscuro`: sube por los contenedores hasta el primer color de
  fondo real; si todos son transparentes, `prefers-color-scheme`) y pone la letra acorde
  (`.np33--dark`). No usa nada de la web anfitriona y todo su CSS lleva el prefijo `np33-`.
  · **La MINIATURA se elige al hacer la nota** (botón «Miniatura» en la barra del editor, con el
  MISMO selector que una imagen: fotos, materiales o subir; `imgTarget = '__thumb__'` →
  `promo_press_thumb_save`, `PressRelease.thumb_url`). Es **la tarjeta del enlace** al mandarla por
  WhatsApp, enlace o SMS (`_press_og_image_bytes` la pasa por `_og_image_jpeg_bytes` a 1200×630) y la
  miniatura del módulo; sin ella, la parte de arriba de la nota, como antes.
  ⚠️ Es un endpoint PÚBLICO (en las tres listas) y responde con `Access-Control-Allow-Origin: *`.
  Probado con la app real (`/tmp/mcx/test_lote2.py`): borrador fuera · enviada dentro con su titular,
  resumen, miniatura y enlace embebido · la de otro artista fuera · og 1200×630 desde la miniatura ·
  la página `?embed=1` sin barra ni pie · los ⋯ con el código en la galleta.

- **MARKETING · LAS ACCIONES SON UN MÓDULO DEBAJO DE INFORMACIÓN** (sep 2026): la pestaña «Acciones»
  de la ficha de una campaña desaparece y su contenido (el aviso de cierre, la lista de acciones por
  tipo y el botón de añadir) va en `#acciones`, debajo de la información. `?tab=acciones` (los avisos
  y el volver de crear una acción) **sigue valiendo**: cae en `informacion`. `marketing_close` se
  calcula ahora también en esa pestaña.
  · **ADJUNTOS DE UNA ACCIÓN**: la orden de compra, el contrato u otros documentos. Son filas de
  `MarketingActionFile` con **`kind='ADJUNTO'`** (tercer valor de `MARKETING_FILE_KINDS`; NO tiene
  pestaña: `_marketing_files_context` filtra por kind, así que no se cuelan en Materiales ni
  Testigos), subidas por el MISMO endpoint (`marketing_file_upload` con `kind=ADJUNTO` +
  `activity_id`) desde el pop-up `#attachActionModal<id>` (con «¿qué es?», sugerencias en
  `MARKETING_ATTACHMENT_LABELS`, varios archivos, arrastrar) y borradas con `marketing_file_delete`.
  · **Se ven en la tarjeta de la acción como cápsulas ICONO + NOMBRE** (`.mkt-att`, icono por
  extensión con `_marketing_file_icon`: PDF, Word, Excel, imagen…), junto a la **factura/ticket** de
  la acción —que antes no se veía en ningún sitio—, y al pincharlas se abren en el visor
  (imprimir, descargar). `MARKETING_FILE_EXTS` admite ya los documentos de oficina.
  ⚠️ `action_files.get(...)` devuelve `None` en una acción sin adjuntos: el `for` de la plantilla
  lleva `or []` (500 real de la primera prueba).

- **BOLSA · UN GASTO QUE ES UNA ACCIÓN DE MARKETING SE LEE COMO LO QUE ES** (sep 2026): en la fila del
  gasto (la bolsa y la pestaña Producción de la actividad, que es el mismo `_bag_panel.html`) sale el
  **TIPO de acción con su icono** («Campaña de Radio»), **EN QUÉ MEDIO con su logo** (o la foto del
  proveedor; sin medio, la plataforma, el nombre a mano o la ciudad) y **CUÁNDO** (de sus oleadas o de
  su fecha y su fin), y la fila enlaza a la campaña. Punto único **`_bag_marketing_actions_map`**
  (UNA consulta por bolsa, en `_bag_panel_context` → `expense_marketing`), con
  `_marketing_action_where` / `_marketing_action_image` / `_marketing_action_dates_label`. El
  **concepto** del gasto se compone con lo mismo (`_marketing_expense_concept`: «Campaña de Radio ·
  Cadena Dial · 30/11/2026 – 10/12/2026»), así que en pendiente de pago y en contabilidad también se
  sabe de qué es. Estilos `.exp-mkt*`.

- **MARKETING · EL LISTADO** (sep 2026): dos pestañas, **«Acciones»** (sin contador) y **«Archivadas»**.
  Las **PETICIONES** ya no son una pestaña: son un **módulo encima de las acciones que solo se pinta si
  hay alguna pendiente** (con «Crear campaña» y «Rechazar» como siempre; el calendario de tres meses se
  retiró). Y **las acciones se agrupan POR ARTISTA** con la misma rejilla de galletas que Demos y
  Actividades (foto de 84 px, nombre y cuántas acciones), y al pinchar uno (`?artista=<id>`, o `none`
  para las que no tienen artista) se ven las suyas con su cabecera y el volver. Una campaña de varios
  artistas sale en cada uno. `?tab=requested` (enlaces antiguos) cae en «Acciones».

- **NOTAS DE PRENSA · LOS CONTACTOS: dos módulos sueltos y NINGUNO FIJO** (sep 2026, lo pidió Dani).
  En la paleta hay **«Contacto de promoción»** (nace con Nuria, `PRESS_CONTACT_*`) y **«Otro
  contacto»** (nace con **quien está escribiendo** la nota: el usuario de la sesión en
  `promo_press_assets`, y si no el creador), los dos arrastrables por separado. En cualquiera de los
  dos se **quita** y se **añade** gente (del personal, con su foto; el de promoción se vuelve a añadir
  con su botón): nadie lleva «Siempre». Lo dice `ref`: `preset` (**press** | **custom**), `press`
  (True/False: lleva la tarjeta de promoción) y `user_ids`. Punto único `_press_contact_rows`.
  ⚠️ Un módulo **ANTIGUO** (sin `preset`) se sigue leyendo como antes —promoción + quien creó la nota
  + los añadidos—, y en cuanto se toca en el pop-up el JS lo pasa a la forma nueva con la lista tal
  como se veía (`press_editor.js`), para no perder a quien iba implícito.

- **CONTACTOS DE UN MEDIO · la ficha, los programas y las NOTAS DE PRENSA** (sep 2026). Los contactos
  de un medio se añaden y se editan en un **POP-UP** (`#mediaContactModal`, el MISMO para las dos
  cosas, con los bocadillos de la casa: **¿quién es?** —nick · nombre completo · programa · cargo—,
  **datos de contacto** —teléfono · email— y **notas de prensa**). El formulario de seis huecos
  sueltos que había encima de la lista se retiró.
  · **`MediaContact.nick`** (como le llamamos, lo que se ve primero) y **`press_releases`** (a esta
  persona se le mandan las notas de prensa) son columnas nuevas. El nombre completo se parte con
  `_split_full_name`, el punto único de la casa.
  · **EL PROGRAMA ES TEXTO**: un programa existe porque hay alguien en él. Se escribe y salen los que
  YA tiene el medio (`_media_programs`: los de sus contactos **y** los de su histórico), y lo que no
  esté se crea con lo escrito. ⚠️ Se compara **sin acentos ni mayúsculas** (`_media_program_snap`,
  que conserva la ortografía del que ya estaba): si no, «La Ventana» y «la ventana» serían dos grupos.
  · **EL LISTADO**: primero quien **no es de ningún programa** y después, **agrupado por programa**
  (alfabéticamente) — punto único `_media_contact_groups`. Al lado de cada uno, el **interruptor** de
  notas de prensa (el `.pl-switch` + `.sw dl` de las playlists: verde encendido, gris apagado, y se
  guarda al momento con `media_contact_press_toggle`) y sus **tres puntitos**.
  ⚠️ El pop-up se rellena **EN EL PROPIO CLIC** (con `modal_stack.js` por medio, `shown.bs.modal` no
  siempre llega) y todo el JS (`static/js/media_contacts.js`) va por **delegación en `document`**.
  ⚠️ Los programas del medio viajan al pop-up en un **atributo** (`data-mc-programs` con
  `|tojson|forceescape`; dentro de un `<script>` sería al revés: ahí `forceescape` rompe el JS).

- **SUBIR CONTACTOS DE MEDIOS DESDE UN FICHERO** (sep 2026). Icono de subida **a la izquierda de
  «+ Añadir medio»** en `/medios`: se sube un Excel o un CSV, se dice a qué corresponde cada columna
  y después **se arrastra cada contacto a su medio**.
  · **Motor puro `media_contact_import.py`**, con el MISMO lector que terceros y compradores
  (`promoter_import.read_rows` / `parse_columns`): lo único propio es a qué campos de un contacto va
  cada columna (**Medio · Nick · Nombre completo · Nombre · Apellidos · Programa · Cargo · Teléfono ·
  Email**). Lo que no se reconoce **no se calla**: se pregunta o se omite.
  · **SE GUARDA** (`MediaContactImport` + `MediaContactImportRow`, `ensure_promocion_prensa_schema`)
  porque el reparto se puede dejar a medias: se cierra la ventana y, mientras quede alguno sin
  colocar, **Medios avisa arriba** (`_media_import_pending` + `_media_import_alert.html`, en el
  listado y en la ficha de un medio). ⚠️ Se avisa de la subida **MÁS ANTIGUA** que sigue esperando
  (y se dice si hay más): con la más reciente, lo que alguien dejó a medias quedaría enterrado.
  · **LA PANTALLA DE VINCULACIÓN** (`/medios/importar/<id>`): a la izquierda los contactos y a la
  derecha los medios, con su buscador cada uno. Se **arrastra** (HTML5) o —con el dedo— se **pincha
  el contacto y luego su medio**: siempre hay camino sin arrastrar. Al soltarlo se guarda al momento
  y desaparece de la izquierda. Arriba a la derecha de los medios, el «+» crea uno **sobre la
  marcha** (el alta rápida de la casa, `data-quick-create="media"`, que deja lo creado en un
  `<select>` oculto: de su `change` sale la tarjeta nueva).
  · **Al subir se puede marcar a TODOS para recibir notas de prensa** (se puede quitar después, uno
  a uno).
  ⚠️⚠️ **UN CONTACTO NO SE DUPLICA**: se identifica por su **email** y, si no lo trae, por su
  **nombre** (sin acentos ni mayúsculas); al que ya está solo se le **completa lo que tenga vacío**
  (lo escrito no se pisa nunca) y se dice que ya estaba.
  ⚠️⚠️ **LA SESIÓN ES `autoflush=False`**: `_media_import_close_if_done` hace `flush()` **antes de
  contar**, o la cuenta no ve el contacto que se acaba de colocar y la subida **no se cierra nunca**
  (bug real que sacó la prueba; la misma trampa que `_accounting_bag_close_if_done`).
  ⚠️ La subida **se cierra sola** cuando no queda nada pendiente, y «Terminar» descarta lo que quede
  **diciendo cuánto era**.
  ⚠️ Los endpoints se llaman `media_contacts_import_*` y `media_contact_press_toggle`: empiezan por
  `media_`, así que ya caen en `databases.media` en los DOS mapeos sin tocar nada.

- ⚠️⚠️ **NOTAS DE PRENSA (Promoción → pestaña «Notas de prensa»)** (sep 2026). Una nota de prensa es
  un **DISEÑO** (`PressRelease.design`, JSONB): la imagen de **FONDO** (con la cabecera y los logos) y,
  encima, **BLOQUES** —el titular, los textos y los MÓDULOS: audio (escuchar / descargar), repertorio
  de un disco, videoclip, enlaces de plataformas, fotos y el contacto de prensa (Nuria Chillón ·
  promocion@33producciones.es · +34 915001883, `PRESS_CONTACT_*`)—, cada uno con su sitio y su tamaño
  en un lienzo de **600** de ancho. De ese diseño, y SOLO de él, salen el **correo**, la **página
  pública**, el **PDF** y la **miniatura**: motor puro **`press_render.py`**, con su prueba
  **`tools/check_press_render.py`** (si se toca, en verde).
  · **Se crea con un asistente** (`_press_release_wizard_modal.html`): ¿de quién es? (artistas —pueden
  ser **VARIOS**, `artist_ids`—, eventos, giras compradas y los ciclos/festivales **NUESTROS**,
  `CycleFestival`: un festival de otro al que va un artista es una actividad, no un sujeto) → ¿sobre
  qué va? (una actividad, un single, un disco o sobre el propio sujeto). Nace en **borrador**.
  · **El EDITOR** (`press_release_editor.html` + `static/js/press_editor.js`): se sube el fondo (se
  puede **reemplazar** cuando se quiera sin tocar el contenido, y **guardarlo como PLANTILLA** con su
  nombre, `PressReleaseTemplate`), se arrastran el titular y los textos sobre él (se mueven por su asa
  y se redimensionan desde la esquina; un texto crece solo si no cabe), y los módulos se arrastran
  desde la paleta —o se pinchan, y entonces se colocan **debajo del último**—; todos se mueven y se
  ajustan libremente (pueden ir uno al lado del otro). Texto seleccionado: negrita · cursiva ·
  subrayado · **enlace** (subrayado por defecto; el botón de subrayado lo quita o lo pone) · alineación
  · tipografía · color. El tamaño es del bloque. **Guardar** está siempre arriba.
  ⚠️ **El HTML de los módulos lo pinta el SERVIDOR** (`promo_press_assets` y `promo_press_block_html`
  → `press_render.module_html`, el MISMO que el correo): lo que se ve en el editor es lo que llega.
  ⚠️ **Las tipografías son de sistema** (`press_render.FONTS`): un correo no carga fuentes web.
  ⚠️⚠️ **EN UN CORREO NO HAY `position:absolute`** (Gmail lo quita): el correo se compone en **BANDAS**
  (`press_render.render_email` / `compute_bands`): una fila de tabla por franja del lienzo, con el
  trozo de fondo que le toca (`background-position` negativo sobre la misma imagen) y dentro los
  bloques de esa franja en columnas con su hueco a la izquierda. Así el texto se ve ENCIMA del fondo y
  sigue siendo **texto seleccionable** en Gmail, Apple Mail y Outlook.com. La página pública y la vista
  de dentro sí van en posición absoluta exacta (`render_web`) **escaladas con `transform`** al ancho
  que haya (`press_view.js`): en el móvil se conservan las proporciones del fondo.
  · **El correo**: asunto **«Nota de prensa: \<artista o evento\>, \<tipo\>, \<nombre o municipio,
  provincia\>»** (`_press_email_subject`), **preheader = el titular** (es lo que enseña el resumen del
  correo y el Apple Watch), un enlace «ver en el navegador», el diseño en bandas y el **píxel de
  apertura**. **UN correo por persona** con **SU token** (`PressReleaseRecipient.token`), que va en el
  píxel y en todos los enlaces: se compone UNA vez con el marcador `__PR_TOKEN__` y se sustituye por
  persona (`_send_optional_email(..., personalize=, on_result=)`, dos parámetros nuevos; también
  **`from_name`/`from_email`** y **`auto_submitted=False`**: una nota la escribe una persona y no
  lleva las cabeceras de «esto lo manda una máquina»).
  · **Quién la manda** (`sender_kind`): **Back office** (el remitente de la app) o **«Promoción | 33
  Producciones» \<promocion@33producciones.es\>** (`PRESS_SENDER_PROMO_*`). ⚠️ Para que salga con esa
  dirección el SMTP tiene que admitirla (alias de la misma cuenta o dominio) y lo que decide que no vaya
  a spam siguen siendo **SPF/DKIM/DMARC del dominio**: cada correo sale suelto, con su texto y su
  Message-ID del dominio del From, pero eso no sustituye al DNS.
  · **Cuándo**: ahora o **PROGRAMADA** (`scheduled_at`, `status='SCHEDULED'`). La manda
  **`_press_sweep`** (advisory lock de Postgres para que dos workers no manden la misma), que llaman
  **el reloj de dentro** (`_press_scheduler_loop`, un hilo que mira cada minuto), el cron
  `/cron/notas-de-prensa` y el cron diario de documentos. Cada destinatario queda marcado al salir: si
  el hilo muere nadie recibe dos veces (`_press_send_pending`, presupuesto de 45 s + `_press_send_bg`).
  · **A quién**: los contactos de los medios marcados para **notas de prensa** (`MediaContact.
  press_releases`, agrupados por medio, todos marcados y se desmarca a quien no toque), más quien se
  añada de la base (terceros, personal, contactos de cualquier medio: `promo_press_contact_search`) o a
  mano. Antes de mandar se pregunta si se quiere un **correo de PRUEBA** (a quien está configurando).
  ⚠️⚠️ **LOS DESTINATARIOS SE CUELGAN DE LA RELACIÓN (`pr.recipients.append`) Y SE LEEN CON CONSULTA**:
  la sesión es `autoflush=False` y con `session.add` suelto el envío no encontraba a nadie pendiente y
  daba la nota por ENVIADA sin mandar nada (lo sacó la prueba).
  · **Aperturas**: el píxel (`/np/<token>/a.gif`) y el enlace con token (`/nota-de-prensa/<token>`)
  apuntan cada apertura (`opens`, `open_count`, `opened_at`). **«Posiblemente reenviada»** = aperturas
  desde otro dispositivo Y otra red que la primera (se dice como sospecha, nunca como certeza; el proxy
  de imágenes de Gmail no cuenta). En el listado, «N enviados · N abiertos» se pinchan y salen las
  listas (`promo_press_recipients_json`).
  · **Una nota ENVIADA no se edita** (`_press_can_edit`; el guardado devuelve 409). Se puede
  **reenviar** (otra tanda), **compartir por email** (la misma pantalla de envío, `modo=share`),
  por WhatsApp / SMS / copiar el enlace (la página pública, con `og:` = la parte de arriba de la nota
  a 1200×630, `_press_og_image_bytes`), y **descargar en PDF** (`_press_pdf_bytes`: una sola página a
  lo alto que haga falta, con el fondo, los textos con formato y los módulos como tarjetas).
  · **Dónde se ve**: la pestaña (galletas por sujeto → listado con la miniatura, el titular, la fecha,
  el artista con su foto, qué es, los contadores y sus tres puntitos) y el panel de Promoción de las
  fichas de artista, canción, disco y actividad (global de plantilla **`press_entity_rows(kind, id)`**).
  · **Lo que se DESCARGA solo existe si la nota lo ofrece** (`opts.download` del módulo, comprobado en
  el servidor: `_press_block_allows`); el audio va por **nuestro puente** (`public_press_audio`) y el
  vídeo por un 302 al archivo (un vídeo no se sirve por el puente). Las fotos tienen su galería
  (`public_press_photos`) y su ZIP solo con la descarga permitida.
  ⚠️ Los endpoints se llaman `promo_press_*` (caen en la sección **`promo`** por el prefijo) y los
  públicos `public_press_*` + `cron_press_releases` están en las TRES listas.

- ⚠️⚠️ **NOTAS DE PRENSA · segunda ronda** (sep 2026): lo que se añadió sobre la épica de arriba.
  · **¿DE QUIÉN ES LA NOTA?** El asistente enseña primero **lo ACTIVO** (artistas y eventos con algo
  por venir, giras compradas y **ciclos/festivales NUESTROS con actividades próximas**) y el resto
  tras «Ver más»; y las **EMPRESAS DEL GRUPO** son un sujeto más (`PRESS_SUBJECT_KINDS['COMPANY']`,
  con su **LOGO** en vez de foto: `company_logo`; 33 Producciones y PIES delante,
  `_press_company_is_house`). Puntos únicos `_press_upcoming_ids` · `_press_container_active` ·
  `_press_subject_options`, y el global **`press_subject_chip(s)`** (empresa → chip con logo,
  artista → `artist_chip`).
  · **EL EDITOR**: **guías de alineación** al mover o redimensionar (mismo borde izquierdo/derecho/
  centro y mismo ancho que otro bloque, `.pr-guide`), **Supr** borra el bloque seleccionado, **⌘/Ctrl
  C · V** copian y pegan, y el selector de color de texto y titular ofrece **la PALETA del fondo**
  (`bg.palette`, calculada con Pillow en `_press_bg_palette` —cuantiza a 12 colores y dedupe por
  distancia RGB; ⚠️ el thumbnail va con **`Image.NEAREST`**: el antialias fundía las franjas finas
  y la paleta salía sin el rojo—; se recalcula al cambiar el fondo, `_press_bg_palette_ensure`) más
  los **CORPORATIVOS** (`PRESS_CORPORATE_COLORS`).
  · **AL TERMINAR DE DISEÑAR se pasa A ENVIAR** («Siguiente: enviar», `data-pr-next` → guarda y
  navega a `next_url`); si se sale, queda **guardada como borrador**. **Volver** tras terminar lleva
  al **LISTADO del artista** (`promo_press_view?sujeto=`, con `data-no-smart-back`), no al paso
  anterior.
  · **YA HAY UNA NOTA SIN ENVIAR sobre eso** (`_press_existing_unsent`): al crear otra sobre el mismo
  single/disco/actividad, `promo_press_create` responde **409 con las existentes** (borrador o
  programada; **una ENVIADA no cuenta**: lo que se quiere es mandar otra) y el asistente ofrece
  «Continuar con la que hay» o «Crear otra» (`force`).
  · **CONTADORES EN VIVO** (`promo_press_stats_json`, `GET /notas-de-prensa/estadisticas?ids=`):
  `press_list.js` pregunta cada pocos segundos por las notas `[data-pr-live]` y, si un número cambia,
  hace **«pop»** (`.pr-pop`); también el estado y la lista de la ficha (`[data-pr-recips]`).
  · **JUNTO A CADA DESTINATARIO**: el icono de **ABIERTA** (al pasar el ratón: cuántas veces, la
  primera y la última, `opened_label`) y el de **REENVIADA** (desde cuándo se sospecha,
  `forwarded_at` + `forwarded_label`). Payload único **`_press_recipient_payload`**.
  · **DESDE LA TAREA de «nota de prensa» de un lanzamiento** (`_home_press_tasks` → `press_url`):
  si ya hay nota se abre; si no, `promo_press_view?nueva=SINGLE:<id>` **precarga el asistente**
  (`_press_prefill_from_arg`) y en el editor está **«Ver pitch»** (pop-up con el titular y el texto
  **copiables**, `_press_pitch_for`).
  · **EL FONDO puede ser el DISEÑO que subió DISEÑO** (`_press_design_asset`: el `design_url` de la
  nota del proyecto —`_disco_press`—; si aún no está, se dice **«pendiente de Diseño»**), además de
  subirlo o arrastrarlo; `promo_press_background` acepta `source=design`.
  · **TRES MÓDULOS NUEVOS** (`press_render.MODULE_TYPES`): **IMAGEN integrada** en el cuerpo (se
  mueve, se redimensiona con su proporción y se **enlaza**; se elige de **nuestras fotos**
  —`promo_press_album_photos`—, de los **materiales** del lanzamiento —portadas, miniaturas de
  vídeo, carteles, el diseño— o se sube/arrastra, `promo_press_image_upload`), **ARCHIVOS ADJUNTOS**
  (`PressReleaseFile`: se coloca el módulo y sale «pendiente»; al pincharlo se arrastran archivos o
  **carpetas** —`recogeEntradas`—, con **nombre e icono** de lo que es en color corporativo —o de la
  paleta del fondo—, chips «N fotos · N vídeos · N archivos», y en la nota lleva a la **página pública
  con previsualización** y descarga de cada uno o de **todo en ZIP**: `public_press_files*`,
  `public_press_files.html`) y **PLAYLIST** (se arrastra y se elige la playlist; enlaza a su página
  pública, `_press_playlist_data` crea el token con commit si falta).
  ⚠️ **Un módulo PENDIENTE no sale en el correo, la página ni el PDF** (`press_render.is_pending`).
  ⚠️ Al guardar se **podan** los `PressReleaseFile` de bloques `files` que ya no están.
  ⚠️ Los iconos de los adjuntos van como **PNG** (`_press_icon_png`, el motor de `brand_icon_png`):
  esto va por correo.
  · ⚠️⚠️ **EL REMITENTE «Promoción» QUE EL SMTP NO ADMITE**: si el servidor **rechaza el From**
  (`_smtp_sender_rejected`: 550/553 «sender», «not owned by user», «not allowed to send as»…),
  `_send_optional_email` **reintenta con el remitente de la app** y **Reply-To** a promocion@, y
  devuelve el aviso (texto con «remitente») que la pantalla enseña: el correo SALE y se sabe por qué
  no ha salido como Promoción. Para que salga como promocion@ hay que **autorizar esa dirección en la
  cuenta SMTP** (alias «Enviar como» en Google Workspace / permiso «Send As» en Microsoft 365 / o
  usar el buzón de promocion@ como `SMTP_USERNAME`) y tener SPF/DKIM/DMARC del dominio.
  · **A QUIÉN, POR GRUPOS** (`_press_recipient_groups` → `groups` en la pantalla de envío):
  **MEDIOS** (chips de **TIPO de medio** con su icono —`_media_type_label` da la forma legible:
  «Radio», aunque el alta rápida lo guarde en MAYÚSCULAS— y dentro cada medio con sus contactos de
  prensa; un chip de tipo filtra y marca o quita todos los suyos), **PROMOTORES** (todos los terceros
  que promueven una actividad —`Concert.promoter_id` o `ConcertPromoterShare`— o están marcados a
  mano como promotores; **aquí no hace falta ninguna marca de prensa**) y las **ASOCIACIONES**
  (`PROMOTER_ASSOCIATIONS`: **APM** y **Arte**, con sus miembros).
  ⚠️⚠️ **Nadie recibe la nota dos veces**: la misma dirección por dos criterios entra **UNA** vez
  (`_press_add_recipients` dedupe por correo; la pantalla también).
  ⚠️ Cada casilla lleva **`data-group`** (el tipo de medio · «Promotores» · la asociación) →
  **`PressReleaseRecipient.group_label`**, y con eso la ficha (`recipient_groups`) y el repintado
  en vivo (`pintaRecips`) enseñan el envío **AGRUPADO por esas etiquetas**.
  · **UN TERCERO PUEDE SER MIEMBRO DE APM Y DE ARTE** (`Promoter.assoc_tags`, JSONB) y llevar
  **CATEGORÍAS a mano** (`Promoter.roles_manual`: promotor · autor · beneficiario,
  `PROMOTER_MANUAL_ROLES`) además de las que se deducen de sus actividades. Se marcan en la ficha
  («¿Quién es?» → «Es miembro de…», `.pr-tag-check`) con **centinela `assoc_present`** y se ven
  como etiquetas en la cabecera y en el listado (`promoter_assoc_badges`).
  · **IMPORTAR TERCEROS**: en el resumen se marca **a todos los del fichero** (nuevos **y** los que ya
  estaban) como miembros de APM/Arte y en una categoría (`promoters_import_create` acepta
  `assoc`/`roles`; para los existentes `promoters_import_tag`, que **añade y nunca quita**). Y las
  coincidencias reconocen también **por el CORREO** («por su correo») y **por un NOMBRE PARECIDO**
  («por un nombre parecido», uno contiene al otro, ≥ 6 letras) para decidir si se fusiona, se añade
  como contacto o se crea otro.
  · **IMPORTAR CONTACTOS DE MEDIOS**: un contacto cuyo correo es el de un **tercero que ya tenemos**
  queda **VINCULADO al medio** (`_media_import_link_promoter` → `ThirdPartyLink` con su cargo como
  relación), sin crear otro tercero.
  ⚠️ Probado con la app real (`/tmp/mcx/test_press.py`, 127 comprobaciones): sujetos activos y
  empresas, paleta, duplicado sin enviar, contadores en vivo, iconos, pitch, módulos nuevos y sus
  páginas públicas, remitente rechazado, grupos, APM/Arte, importación y vinculación.

- **NOTAS DE PRENSA · CUENTAGOTAS DE COLOR** (sep 2026): al lado del selector de color del texto hay
  un **cuentagotas** que coge un color de **cualquier parte de la pantalla** (`EyeDropper`, la API
  nativa) y lo **AÑADE a la paleta** del diseño, así queda a un clic para el resto del texto (doble
  clic en una muestra propia la quita). Se guardan en **`design.swatches`** y ⚠️ el guardado los
  **CONSERVA** aunque el cliente no los mande (rehace el diseño desde cero, como con la paleta del
  fondo).
  ⚠️ Si el navegador no tiene `EyeDropper` (Safari) **el botón no se pinta**: un botón que no
  funciona estorba. El color de un módulo (los adjuntos) también alimenta la paleta
  (`window.app33PressAddColor`).

- **EL TAMAÑO DE UN BLOQUE SE AJUSTA POR CUALQUIER LADO** (sep 2026, notas de prensa y comunicaciones
  a compradores): un bloque seleccionado enseña **OCHO asas** —las cuatro esquinas y el medio de cada
  lado (`data-pr-rs="nw|n|ne|e|se|s|sw|w"`)— y se tira del borde que toca, sin tener que apuntar
  siempre a la esquina de abajo a la derecha. El arrastre trabaja con los **BORDES**: cogiendo la
  izquierda o el de arriba, el bloque crece hacia ese lado y **el borde de enfrente se queda donde
  estaba**. Las guías se imantan con el borde que se está moviendo (`alinea(b, modo, dir)`).
  ⚠️ El alto de un **MÓDULO** lo calcula su contenido (`ajustaAltoModulo`), así que ahí las asas de
  arriba y de abajo **no se ofrecen** (`.pr-blk--autoh`): volverían solas a su sitio y parecería que
  no funcionan. En una **imagen** las cuatro esquinas y los cuatro lados valen, y la proporción se
  respeta (tirando de arriba o de abajo manda el ALTO).
  ⚠️ Las asas llevan `touch-action:none` y van por **encima** del asa de mover, que se les solapa en
  la esquina de arriba a la izquierda.

- ⚠️⚠️ **UNA PERSONA DE UN MEDIO ES UN TERCERO** (sep 2026). «Añadir contacto» en la ficha de un
  medio abre el pop-up **en modo BUSCAR**: se busca entre los terceros por cualquier campo
  (`api_search_promoters`) **con su foto**, y al elegir uno se pasa a sus datos **ya puestos** —solo
  se pide lo que falta, y el foco va al primer hueco vacío (el **cargo**, casi siempre)—. Los que
  vienen de su ficha se marcan (`.is-from-promoter`) y se desmarcan al tocarlos.
  · **«No está: crear una persona nueva»** enseña los campos en blanco y, al guardar, **le crea
  también su ficha de TERCERO**. En los dos casos el tercero queda **VINCULADO al medio**
  (`ThirdPartyLink` con su cargo, `_media_contact_link_outlet`).
  · Columna nueva **`MediaContact.promoter_id`** y punto único **`_media_contact_promoter`**.
  ⚠️ Lo que ya está escrito en la ficha del tercero **NO se pisa**: solo se rellena lo que tenga
  vacío (el criterio de la importación de terceros). Y al revés: lo que no se escriba en el pop-up
  se coge de su ficha.
  ⚠️ Un contacto ANTIGUO (sin `promoter_id`) **no crea otra ficha a lo tonto**: primero se busca por
  su CORREO (en `Promoter.contact_email` y en `PromoterEmail`), como hace la importación.
  ⚠️⚠️ La función que pinta a quien se ha elegido se llama **`pintaElegido`, no `pinta`**: en ese
  fichero ya hay una `pinta()` (la de las sugerencias de programa) y en JS la última definición
  PISA a la anterior — la trampa de siempre de los nombres repetidos.

- ⚠️⚠️ **UN MÓDULO SE ARRASTRA VACÍO Y LUEGO SE ELIGE QUÉ LLEVA** (sep 2026, notas de prensa **y
  comunicaciones a compradores**: es el MISMO editor, así que todo lo que se toque aquí vale para
  los dos). El **single**, el **disco**, el **videoclip**, los **enlaces** y la **playlist** tienen
  ya su módulo VACÍO al principio de su grupo en la paleta (`.pr-pal--empty`): se arrastra, se
  elige qué lleva en el pop-up (`#prPickModal`, con su portada y su buscador) y **se pueden poner
  todos los que hagan falta** — cada arrastre es un módulo nuevo. Debajo siguen los concretos, para
  arrastrar directamente el que se quiere.
  · Se cambia después desde su panel («Cambiar», `data-pr-pick-open`) y pinchando un módulo vacío
  del lienzo. El `<select>` que solo tenía la playlist se retiró: ahora es el MISMO selector para
  los cinco.
  ⚠️ Un módulo **sin elegir queda PENDIENTE** (`_press_resolve_blocks` le pone `pending`): en el
  editor se ve como un hueco que invita a completarlo y en el correo, la página y el PDF **no se
  pinta** — así una nota no sale nunca con un módulo vacío.
  ⚠️ `PICK` (en `press_editor.js`) es el punto único de «qué módulos se eligen y de qué grupo de
  `assets` salen»: al añadir otro, va ahí y en `_pending_card` de `press_render.py`.

