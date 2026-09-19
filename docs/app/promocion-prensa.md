# Promoción, marketing y notas de prensa

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- MARKETING ≠ PROMOCIÓN. Eran la misma pantalla y se confundían
- PROMOCIÓN de prensa (Promotion.kind='PROMO' + PromotionActivity.activity_kind='PROMOCION';
- COMPROBAR una factura y PAGARLA no es lo mismo con la retención en medio
- UNA SOLA BASE DE EMISORAS: la emisora es un MEDIO de tipo Radio (las de tocadas desaparecen)
- PRESENTACIÓN A RADIOS: planificar, presentar por correo y lo que dicen las tocadas
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
- EL MÓDULO «DATOS DE LA ACTIVIDAD»: el cartel si está subido, el recinto que abre el mapa y la paleta
- LA FILA DE UN DESTINATARIO, LA MISMA EN LOS TRES ENVÍOS (foto, correo al lado y vinculación debajo)
- EL MÓDULO DE VÍDEO DE YOUTUBE: la miniatura con el play y el pop-up que lo reproduce
- UN MÓDULO SE ARRASTRA VACÍO Y LUEGO SE ELIGE QUÉ LLEVA (sep 2026, notas de prensa y
- «DISEÑO DE COMUNICACIONES»: el cartel en PDF, el single y el logo vacíos, y elegir VARIOS con ⌘

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

- ⚠️⚠️ **UNA SOLA BASE DE EMISORAS: LA EMISORA ES UN MEDIO DE TIPO RADIO** (sep 2026, lo pidió
  Dani). Había **DOS** bases de emisoras y eran la misma cosa: las **`RadioStation`** del reporte de
  radios (las de las tocadas) y los **`MediaOutlet` de tipo Radio** de las presentaciones. Con eso,
  la misma emisora estaba dos veces —dos nombres, dos logos, dos fichas— y **no se podía cruzar «se
  le ha presentado el tema» con «ya suena»**, que es justo lo que hay que saber.
  · **Todo medio marcado como Radio vale para el reporte de radios**: uno nuevo entra solo, sin
  darlo de alta en ningún otro sitio. Punto único **`_radio_media_query`** (lo usan las tocadas, el
  reporte, la importación de Excel y las presentaciones) y **`_radio_media_is_radio`**.
  · **`Play.media_id`** es la emisora de una tocada. ⚠️ `plays.station_id` se conserva **solo como
  rastro** de la emisora de la que vino cada fila: no se lee en ninguna parte y las filas nuevas no
  lo escriben.
  · **EL VOLCADO** (`_radio_media_migrate`, una vez, marca `radio_stations_to_media_v1`): cada
  emisora busca su medio de tipo Radio **por el nombre normalizado** y, si no lo hay, se crea con su
  logo, su país y el color de su logo; las tocadas y los alias aprendidos de los Excel pasan a
  colgar del medio. Es **idempotente** (el puente `radio_stations.media_id` dice lo que ya está).
  ⚠️⚠️ **Los PARECIDOS no se casan solos** («Los 40» y «LOS40» no son la misma clave): fusionar no
  se puede deshacer, así que eso lo **propone** el bloque de fichas repetidas de Medios y lo decide
  una persona.
  ⚠️ Si dos emisoras acaban en el MISMO medio, las tocadas de la misma canción y semana **se
  SUMAN** (antes no podía pasar; ahora sí, y dos filas iguales darían el doble).
  · **La sección «Emisoras» desaparece**: `/emisoras` y sus dos POST **redirigen** a Medios (un
  enlace guardado tiene que seguir llevando a alguna parte) y el recurso **`radio.emisoras`** se
  retira trasladando sus permisos a **`databases.media`** (`LEGACY_REMOVED_ACCESS_KEYS` +
  `MIGRATED_ACCESS_KEYS`: quien podía dar de alta emisoras sigue pudiendo).
  · **FICHAS REPETIDAS en Medios** (`_media_duplicate_pairs`, arriba del listado): de dos en dos,
  diciendo por qué, con **«Fusionarlas»** (el motor de siempre, que re-apunta TODO: **no se pierde
  ni una tocada**) y **«No son el mismo»** (`MediaNotDuplicate`, con su «Deshacer»).
  ⚠️⚠️ **El CORREO NO SIRVE COMO CRITERIO EN UN MEDIO** (al revés que en un tercero): las seis
  emisoras de Prisa comparten `cadenasmusicales@prisaradio.com` y saldrían quince parejas falsas.
  Se miran solo los NOMBRES (igual normalizado, o uno dentro del otro **del mismo tipo**).
  · En la ficha de una emisora se ve **lo que ha sonado en ella** (`_media_radio_summary`) con su
  enlace al reporte: es lo que hace visible que al fusionar **no se pierde el histórico**.
  ⚠️ Probado con la app real (37 comprobaciones): el volcado, que reutiliza el medio que ya estaba,
  que no casa los parecidos, que no se pierde ni una tocada, la suma de duplicados, la
  idempotencia, las seis pantallas, guardar tocadas, la fusión con su histórico y los permisos.

- ⚠️⚠️ **PRESENTACIÓN A RADIOS · planificar, presentar y lo que dicen las tocadas** (sep 2026, lo
  pidió Dani). El mismo módulo en la **ficha de la canción** y en el **proyecto discográfico**
  (`templates/_song_radio_module.html`, contexto único **`_song_radio_module`**): la presentación
  vive en la CANCIÓN y el proyecto solo la enseña.
  ⚠️⚠️ **EN LA CANCIÓN, EL MÓDULO VA EN LA PESTAÑA «RADIO»** —arriba, antes de las tocadas: primero
  lo que hay que hacer y después lo que ya ha pasado— y en **Información** solo queda **el AVISO**
  de que un focus single está sin presentar, como **una nota más** de «Falta por cumplimentar»
  (`_song_missing_required(..., radio=...)`), con su botón a la pestaña. Un single que **no** es
  focus no avisa de nada, y el aviso **desaparece solo** cuando no queda ninguna por presentar.
  ⚠️ **La pestaña «Radio» de la canción la ve también el SELLO** (`discografica.canciones`), no solo
  quien tiene la sección Radio: ahí vive la presentación, que la configura Discográfica. Abrirla ya
  lo permitía el gate (`RELEASE_READ_ACCESS_KEYS`); lo que faltaba era **pintar la pestaña**.
  · **El OBJETIVO**: a qué emisoras se va a presentar (`SongRadioPitch`, una fila por emisora, las
  emisoras son los medios de tipo Radio). Se marcan en su pop-up (`song_radio_plan_save`) y
  ⚠️ **solo se puede quitar lo que todavía no se ha presentado**: lo mandado es historia.
  · **LOS ESTADOS** (`SONG_RADIO_STATUS_LABELS`): **PLANNED** (en el objetivo, sin presentar) ·
  **SENT** (presentada) · **REJECTED** (no la cogen). Los valores viejos se siguen leyendo
  (`_song_radio_status`: PENDING = PLANNED, ACCEPTED = SENT) y una migración de una vez los pone al
  día (`song_radio_status_v2`), que es lo que hace que los filtros de SQL vean lo mismo que la
  pantalla.
  ⚠️⚠️ **«YA SUENA» NO ES UN ESTADO: SE MIRA EL DATO** (`_song_radio_on_air_map`, las tocadas de esa
  canción en esa emisora). En cuanto suena, lo que se enseña es **desde cuándo** y **desaparecen**
  «presentada» y la previsión de entrada; si no llega a sonar, se queda como presentada, que es la
  verdad. Así no hay ninguna marca que mantener al día ni que se pueda desparejar del reporte.
  · **QUIÉN LA PRESENTÓ, con su FOTO y su NICK** (nunca su correo, lo pidió Dani) y cuándo, junto a
  la **fecha prevista de entrada en rotación** —que se conserva porque es la previsión de cuándo va
  a empezar a sonar— (`song_radio_rotation_save`).
  · **LA ALERTA**: si hay emisoras marcadas a las que todavía no se ha presentado, se dice arriba
  del módulo con el botón que lo resuelve. En el proyecto, esa tarea **no se cierra porque una
  emisora conteste, sino cuando se ha mandado a todas**.
  · **EL MÓDULO DE INICIO de promoción** (`_home_radio_pitches`) ya no pregunta «¿la cogen?» al
  pedirla: ahora sale lo **presentado de lo que no se sabe nada** (ni fecha ni tocadas), y **lo que
  ya suena se cae solo**.
  ⚠️ **SIN MÁSTER NO SE PRESENTA** (`_song_radio_send_ready`, comprobado también en el servidor): lo
  que se manda es el tema, y va **el de más bits** (`_song_radio_master` sobre
  **`_SONG_MASTER_SLOT_ORDER`**, el punto único de «cuál es el mejor máster», que estaba escrito a
  mano en tres sitios).

- ⚠️⚠️ **PRESENTACIÓN A RADIOS · EL CORREO** (sep 2026). Lo escribe una persona a otra, así que
  **sale desde SU dirección** y lleva su firma.
  · **A QUIÉN** (`_song_radio_recipients`): los contactos del medio marcados con **«recibe las
  presentaciones a radio»** (`MediaContact.radio_pitch`, un módulo APARTE en los contactos de la
  emisora).
  ⚠️⚠️ **EN ESE MÓDULO —y SOLO en ese— se puede añadir UNA DIRECCIÓN DE CORREO SUELTA**
  (`media_radio_email_add`, lo pidió Dani): muchas veces quien recibe los temas **no es una
  persona** sino el buzón de la cadena (`cadenasmusicales@prisaradio.com`, `musicales@…`), y
  obligar a darle ficha de tercero a un buzón es inventarse a alguien que no existe. En los demás
  contactos del medio sigue valiendo lo de siempre: **una persona de un medio ES un tercero**.
  · El correo se guarda en minúsculas, el **nick sale de la parte de antes de la @** (para que la
  lista se lea) y **no se duplica**: si esa dirección ya es contacto del medio —aunque fuera solo
  de prensa— se le pone la marca y nada más. Un correo mal escrito se rechaza con
  `_flash_form_error` sobre **`radio_email`** ⚠️ (el campo se llama así y no `email` porque los
  campos en rojo se buscan por su `name`, y el pop-up de contacto de esa misma pantalla tiene su
  propio `email`: se marcarían los dos).
  ⚠️⚠️ **UN CORREO POR DIRECCIÓN, UN ENVÍO POR EMISORA**: si el mismo contacto recibe los temas de
  varias emisoras del grupo se manda **UNO SOLO** nombrándolas todas (en **negrita**, haya una o
  varias) y quedan apuntadas **tantas presentaciones como emisoras** (`SongRadioSend` + el `send_id`
  de cada `SongRadioPitch`). Si además una emisora tiene su propio contacto, ese va en **su correo
  aparte**: por eso la vista previa los enseña **uno a uno**.
  ⚠️ Una emisora **sin nadie a quien mandárselo** se dice en la pantalla con el enlace a su ficha:
  si desapareciera en silencio, alguien daría por presentado lo que no ha salido.
  · **EL ASUNTO**: «Presentación nuevo single \<artista\> [y \<otros intérpretes\>], \<single\>,
  \<medio(s)\>» (`_radio_pitch_subject`).
  · **EL CUERPO** (`_radio_pitch_html`, la maqueta de las comunicaciones de la casa): el texto de
  presentación —que **se puede retocar antes de mandarlo**— y debajo la ficha del tema. Respecto al
  de Syncros: **sin one-stop, sin géneros y sin autores**, con la etiqueta **FOCUS SINGLE** cuando
  lo es, el **ISRC** (el principal de audio) y la **fecha de publicación** con su día de la semana.
  **Tres botones y solo tres**: Descargar audio · Descargar instrumental · la nota de prensa si ya
  está subida, justo debajo del bocadillo de la canción.
  ⚠️ **ARRIBA A LA DERECHA VA SOLO EL LOGO DE PIES** (no los dos del grupo como en Syncros, lo
  pidió Dani): a una emisora le presenta el tema **el sello**, y el de la editorial no pinta nada.
  Se busca **por su nombre** entre los logos del grupo, no por su posición en la lista.
  ⚠️ Y **al MISMO TAMAÑO que en las demás comunicaciones de la casa** (`max-height:54px;
  max-width:190px`, la medida que usan los avisos y las liquidaciones; 42 px en móvil): un logo más
  pequeño que el de los otros correos se lee como si fuera otra cosa.
  · Debajo del logo, el **TÍTULO CENTRADO «Presentación nuevo single»** (`RADIO_PITCH_SUBJECT`, el
  mismo texto con el que empieza el asunto) y, debajo, el texto **JUSTIFICADO**: es una carta.
  ⚠️ **SIN galleta de contacto al pie** (también lo pidió Dani): el correo sale desde el buzón de
  quien lo manda y se contesta ahí mismo, así que una tarjeta con sus datos solo es ruido.

- ⚠️⚠️ **PRESENTAR A RADIO · TODOS A LA VEZ, Y EL DE PRISA APARTE** (sep 2026, lo pidió Dani).
  Revisar uno a uno veinte correos que dicen lo mismo es trabajo tonto, así que la pantalla sale
  **AGRUPADA**: un bloque con **todos los correos sin adjunto** (sus destinatarios, una vista previa
  de ejemplo y **«Enviar los N»**, `song_radio_send_all`) y, debajo, **el de Prisa como un segundo
  correo**, porque ese **lleva su DPC adjunto** y conviene mirarlo antes de mandarlo.
  · **«Ver y personalizar uno a uno»** (`?detalle=1`) abre cada correo con su asunto y su texto,
  para retocar el que haga falta. Se vuelve con «Verlos agrupados».
  ⚠️ **Cada correo sigue siendo SUYO**: uno por dirección y con SUS emisoras en el texto —nunca uno
  con todos en el «Para»—, aunque salgan de una tacada.
  ⚠️ El envío es un **punto único** (`_song_radio_send_one`), que usan «Enviar» y «Enviar todos»:
  si estuviera escrito dos veces, el correo de uno y el de todos acabarían siendo distintos.
  ⚠️ «Enviar todos» **recalcula los destinatarios** en el momento (no se fía del formulario: entre
  que se pintó la pantalla y se pulsa puede haberse presentado algo), **se salta lo que ya esté
  presentado** y lleva **tope de tiempo** (`RADIO_SEND_BUDGET_SECONDS`, 45 s) guardando por el
  camino y diciendo **cuántos quedan** — la regla de la casa para las acciones en bloque.
  ⚠️ Lo que NO sale se dice **con nombre y apellidos**: esas emisoras siguen pendientes.

- ⚠️⚠️ **LO QUE HACE QUE UNA PRESENTACIÓN NO CAIGA EN SPAM** (sep 2026, lo pidió Dani). Un correo
  que acaba en la carpeta de spam de la emisora es peor que no mandarlo: nadie se entera.
  · **UN CORREO POR PERSONA**, nunca uno con todos en el «Para» —ni siquiera cuando salen «todos a
  la vez»: eso es un bucle de correos individuales, no un envío colectivo—.
  · **DESDE UN BUZÓN ALINEADO**: sale por la cuenta propia de quien lo manda (SPF/DKIM de SU
  dominio), no «como» otra dirección. ⚠️ Si el usuario con el que se conecta **no es del dominio**
  del remitente, SPF y DKIM no pueden cuadrar: se avisa **en la pantalla de presentar, antes de
  mandar** (`_radio_sender_health` → `aligned`), igual que si la última prueba de conexión falló.
  · **AL RITMO DE UNA PERSONA**: un respiro entre un correo y el siguiente
  (`MailAccount.pause_ms`, y `RADIO_SEND_PACE_MS` = 800 ms si la cuenta no dice otra cosa).
  Veinte correos disparados en dos segundos es lo que hace que el hosting corte y que el filtro lo
  lea como una máquina.
  · **RESPETANDO EL TOPE POR HORA** de la cuenta (`_radio_send_hourly_left`, contando los envíos
  de radio de la última hora desde esa dirección): pasarse es la forma más rápida de que el
  proveedor corte el buzón. Lo que no cabe se dice y sale cuando pasa la hora.
  · **`auto_submitted=False`** (lo escribe una persona) y **la parte de TEXTO bien formada**: sale
  del propio HTML con `_html_to_text`, que **quita el `<style>`** —un correo cuya parte de texto
  empieza con CSS puntúa como spam— y deja los enlaces a la vista.
  ⚠️ **NO lleva `List-Unsubscribe`** a propósito: esto es correspondencia de una persona a otra
  (cinco o diez correos por single), no un boletín, y ofrecer una baja que nadie gestiona sería
  prometer algo que no se cumple. Si algún día se manda a listas grandes, eso cambia —y entonces
  hay que gestionarlas de verdad, como en Syncros (`opted_out_at`)—.
  ⚠️ Las descargas van por **`public_radio_download`** con el token del ENVÍO (al otro lado no hay
  sesión) y sirven el archivo **tal cual**: a una emisora no se le manda un MP3 recomprimido.
  · **DESDE QUÉ CORREO** (`_radio_sender_options`, `MailAccount.user_id`): el buzón de esa persona,
  que se le asigna en **Integraciones → Correo** —o que se reconoce solo porque **la cuenta se
  llama como su correo** (ver `docs/app/avisos-correo-sms.md`)—. Quien no lo tenga **lo sabe en la
  pantalla, antes de mandar**, y se le ofrece salir desde **Promoción**.
  ⚠️⚠️ **NADIE MANDA DESDE EL CORREO DE OTRO** (lo pidió Dani): las únicas dos salidas son **la
  suya** y **Promoción**, que es la genérica de estos envíos. Y no es solo que la pantalla no lo
  ofrezca: `_song_radio_send_pick` **elige entre esas dos** y lo que llegue en el formulario
  pidiendo otra cosa cae en la suya (probado manipulando el POST).
  ⚠️⚠️ **SE RESPONDE A QUIEN LO HA MANDADO** (como en toda la app): si sale por Promoción —o por un
  buzón asignado que no es su dirección—, el correo lleva **`Reply-To` a la persona**; si sale por
  su propio correo no se añade, que el From ya es ella. Sin eso, la respuesta de la emisora se
  perdería en un buzón que nadie mira como propio. Y **presentar lo pueden hacer el sello y
  PROMOCIÓN** (`_can_present_radio`): sus endpoints van en `REQUEST_ANY_ENDPOINTS` y comprueban
  dentro, como `song_radio_pitch_decide`.
  ⚠️ `_send_optional_email` devuelve **(ok, error)**: si el correo no sale, **no se marca nada como
  presentado** y se dice por qué; si sale pero no como se pidió, también se dice.

- ⚠️⚠️ **EL DPC DE PRISA** (sep 2026): el «Documento de Presentación de Canciones» de Prisa Radio va
  **adjunto en PDF y SOLO al buzón `cadenasmusicales@prisaradio.com`** (`RADIO_PRISA_EMAIL`), que es
  la dirección que ellos dan para recibirlo todo — el disparador es **a quién se le manda**, no una
  marca del medio, así que no hace falta ninguna lista de emisoras en el código.
  ⚠️ **UN SOLO documento aunque el correo cubra varias de sus cadenas**: van todas en «CADENA(S) A
  LA(S) QUE SE PRESENTA», como pide el propio documento.
  · `_radio_prisa_dpc_pdf` reproduce **su** documento (su logo y sus campos en su orden), **no el
  estilo de nuestros PDF**: es de ellos. Compañía siempre **PIES Compañía Discográfica**,
  categorización **«Prioridad - Focus Single»** (lo último solo si lo es), el ISRC principal de
  audio, artista + intérpretes, y los enlaces (nota de prensa, Spotify, YouTube) **clicables**.
  ⚠️⚠️ **Solo se rellena lo que tenemos**: lo que no haya se deja **en blanco** (lo pidió Dani) y lo
  cumplimentado va en **negrita**. Las reproducciones salen de Chartmetric (`_cm_song_header`).
  ⚠️ Si el PDF no se puede componer, **no se manda nada** y se dice: mejor eso que un correo a Prisa
  sin su documento.

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
  · ⚠️⚠️ **Y EN EL ALTA DE UN MEDIO, EL MISMO POP-UP** (sep 2026, lo pidió Dani: «tiene que
  funcionar igual que cuando ya está creado, exactamente igual, mismas funcionalidades»). Ahí había
  **seis casillas sueltas** (programa, cargo, nombre, apellidos, teléfono, correo), así que por ese
  camino se escribían personas **a mano** y se creaban repetidas — justo lo que evita el pop-up.
    · El pop-up vive ya en **`templates/_media_contact_modal.html`** y lo incluyen **las dos**
      pantallas; el JS es el mismo (`media_contacts.js`).
    · En el alta, el medio **todavía no existe**, así que el pop-up **no guarda contra el servidor**
      (`data-mc-pending`): deja a cada persona apuntada en el formulario con los **mismos `name`**
      que ya leía el alta (`contact_program` · `contact_role` · …) más `contact_promoter_id`,
      `contact_press` y `contact_radio`, y **se crea todo junto** al guardar el medio.
    · Al crear el medio, cada contacto pasa por el **punto único `_media_contact_promoter`**: se
      engancha su ficha de tercero si ya existe (comprobado: no se duplica) o se le crea.
    ⚠️ El parcial lee `media_programs|default([])`: en el alta no hay programas que sugerir y sin
    eso la pantalla de Medios se caía con un 500.

- ⚠️⚠️ **EL MÓDULO «DATOS DE LA ACTIVIDAD» · EL CARTEL, EL RECINTO Y LA PALETA** (sep 2026, lo pidió
  Dani). Tres cosas del mismo módulo:
  · ⚠️⚠️ **EL CARTEL SE VE SI ESTÁ SUBIDO** («el cartel se tiene que ver si está subido; antes se
  veía y ahora no»). Un cartel pasa por **DOS vistos buenos** (`PENDING` → `DESIGN_OK` →
  `APPROVED`), y el módulo solo miraba los APROBADOS: entre medias se quedaba **vacío aunque el
  cartel estuviera ahí** — que es lo que se vio al tocar una actividad ya montada. Punto único
  **`_concert_module_poster`**: primero el aprobado (`_concert_artwork_share_assets`, el de siempre)
  y, si no hay ninguno, el que esté subido, **con el principal por delante**.
  ⚠️ Un cartel **RECHAZADO no vale nunca** (está mal por definición) ni uno archivado.
  ⚠️ Esto **NO cambia** lo que se le manda al artista o al promotor: ese enlace sigue llevando
  **solo lo aprobado**. Aquí es una viñeta que compone alguien de la casa mirándola.
  · **EL RECINTO SE PINCHA Y ABRE EL MAPA**: arriba **«Recinto · Municipio»** y debajo, más pequeña,
  **la DIRECCIÓN**; **todo el bloque** es el enlace, así que lleva al mapa tanto el nombre como la
  dirección. Lo compone **`_place_map_url`**: con las **coordenadas** del recinto si está
  geocodificado (es exacto) y, si no, con la dirección escrita. ⚠️ **Sin dirección ni municipio no
  se pinta enlace**: uno que no lleva a ningún sitio es peor que no tenerlo. Se usa el enlace de
  búsqueda de Google Maps porque en un iPhone lo abre la aplicación de mapas que tenga la persona.
  · **EN LA PALETA VA SOLO EL MÓDULO VACÍO** («pon solo lo de una actividad; lo arrastras y ahí sí
  seleccionas la actividad»): listar todas las actividades por venir llenaba la barra de entradas
  que hay que leer una a una, cuando el pop-up de elegir ya las trae con su buscador. Los demás
  grupos sí siguen ofreciendo lo concreto (un single o un disco se arrastran directamente).

- ⚠️⚠️ **LA FILA DE UN DESTINATARIO, LA MISMA EN LOS TRES ENVÍOS** (sep 2026, lo pidió Dani): «el
  listado de los seleccionados tiene que salir **con foto o logo**, y **las vinculaciones también
  con foto y logo**; el **email al lado del nombre pero SIN negrita**, y **debajo la vinculación**».
  Se lee: `[foto] Nick correo@dominio.com` y debajo `[logo] Radio Ñ · director`.
  · La pinta **un solo macro** (`templates/_recipient_row.html`, importado **`with context`**) y su
  espejo en el JS (`caraRecip` en `press_list.js` y `cara` en `press_send.js`), así que vale para la
  pantalla de enviar, la ficha de una nota, la de una invitación corporativa y las comunicaciones a
  compradores: si se toca, cambian todas.
  · **La FOTO de un contacto de prensa** sale de **su ficha de tercero** si la tiene (es la persona)
  y, si no, del **logo de su medio**; y su **vinculación** es su medio con el programa o el cargo,
  salvo que su ficha tenga vinculaciones propias — entonces mandan esas
  (**`_recipient_link_of_promoter`**, que envuelve `_promoter_link_summary`).
  ⚠️ Las caras de la ficha de una nota se resuelven **EN BLOQUE** (`_press_recipient_faces`, dos
  consultas): una por fila dejaría sin abrir una nota con cientos de destinatarios.
  ⚠️ Un **comprador** casi nunca tiene ficha, así que su fila va con la foto por defecto y sin
  vinculación — y **no se busca su ficha por el correo**: en una lista de miles sería una consulta
  por fila.

- ⚠️⚠️ **EL MÓDULO DE VÍDEO DE YOUTUBE** (sep 2026, lo pidió Dani). Se arrastra desde la paleta
  (`data-pr-pal="youtube"`, **el primer grupo**, y está SIEMPRE: no sale de los materiales de nadie),
  se pincha para **pegar la URL** (`#prYoutubeModal`) y en el correo se ve **la miniatura del vídeo
  con el botón rojo de reproducir y NADA MÁS** —ni título, ni botón, ni tarjeta alrededor—. Al
  pincharla se abre en un **pop-up** y se reproduce directamente. Vale en **los tres editores**
  (notas de prensa, envíos a compradores e invitaciones): está en el motor.
  · **La URL**: punto único **`youtube_video_id`**, que entiende lo que cualquiera copia y pega
  —`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`, con parámetros detrás— y también el
  código de 11 caracteres a secas. Lo que no sea un YouTube **no entra**, ni por el editor ni por
  las páginas públicas (y por eso esas páginas pueden ser públicas sin riesgo: la única entrada es
  un identificador de YouTube).
  · ⚠️⚠️ **EL PLAY VA QUEMADO EN LA IMAGEN** (`public_youtube_thumb`, `/video/<id>/portada.png`): en
  un correo **no se puede poner nada ENCIMA de una foto** —Outlook no entiende `position:absolute`
  y el fondo de una celda no llega a todas partes—, así que el servidor baja la miniatura de
  YouTube y le compone el rectángulo rojo con el triángulo blanco. El correo solo pinta un `<img>`,
  que es lo único que se ve igual en todos los clientes.
  ⚠️ **Y SIEMPRE 16:9**: `maxresdefault` y `mqdefault` son 16:9, pero `sddefault` y `hqdefault` son
  **4:3 con bandas negras**; se recortan al centro, que es lo que enseña el propio YouTube. Si no,
  el mismo módulo saldría con bandas o sin ellas según el vídeo y el bloque del editor no cuadraría
  con el correo. Si YouTube no contesta, se va a la imagen de «sin portada»: **un correo no puede
  quedarse con un hueco roto**.
  · **EL POP-UP** (`public_youtube_play`, `/video/<id>`, `public_youtube.html`): fondo negro, el
  reproductor centrado y **arranca solo** (`autoplay=1`), sin sugerencias (`rel=0`) y por
  `youtube-nocookie.com` —a quien abre un correo nuestro no se le llevan las cookies de Google—.
  Dentro de la app y en la página pública no se sale de la página: **`press_view.js`** abre el vídeo
  **encima**, y lo destruye al cerrar (si no, seguiría sonando por debajo).
  ⚠️⚠️ **LOS ESTILOS DEL POP-UP VAN EN LÍNEA, EN EL JS, NO EN `styles.css`** (bug real visto en el
  navegador, sep 2026): la página pública de una nota es **standalone y no carga `styles.css`**, así
  que la capa salía **sin posicionar, como un trozo suelto al final de la página**. Por la misma
  razón la «×» de cerrar es **texto**, no un `<i class="fa">`: ahí tampoco carga Font Awesome y
  habría salido vacía.
  ⚠️ **El bloque declara `aspect-ratio:16/9` y fondo negro**: así ocupa su hueco **aunque la
  miniatura tarde o no llegue**, en vez de encogerse a 0 px de alto y desaparecer del editor (pasó
  en local, donde la miniatura apunta al host de producción). En el correo eso se ignora y manda el
  `width` del `<img>`.
  ⚠️ Se mueve y se cambia de tamaño **como cualquier otro módulo**, y se pueden poner **todos los
  que hagan falta**. La proporción fija la lleva **`proporcion(b)`** en `press_editor.js` (antes
  `conMedidas`, que solo sabía de imágenes): ahí es donde se apunta un módulo nuevo que no se deba
  deformar.
  ⚠️ En el **PDF** un vídeo no se reproduce: va la misma miniatura, y pinchándola se abre el vídeo.

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

- ⚠️ **UN MÓDULO NUEVO DEL EDITOR: «DATOS DE LA ACTIVIDAD»** (sep 2026). En la paleta de la derecha,
  arriba del todo: **una sola viñeta** con **el CARTEL a la izquierda** y, a la derecha, los datos
  **uno debajo de otro con su icono** — qué es (Concierto, Festival…), el **artista con su foto**, la
  **fecha con su día de la semana**, el **recinto** y la **hora de comienzo**. Se arrastra vacío (y
  se elige qué actividad, como el single o la playlist) o directamente la que se quiere, y se pueden
  poner **todos los que hagan falta**.
  · Punto único **`_press_activity_data`** (app.py) + el tipo `activity` de `press_render`: **vale
  en los TRES editores** —notas de prensa, comunicaciones a compradores e invitaciones
  corporativas—, porque está en el motor, no en una pantalla.
  · Solo se ofrecen las actividades **por venir** (ni canceladas ni aplazadas) y el cartel es el
  **primero aprobado de categoría POSTER**: un Sold Out o un logo no valen.
  → El detalle de las invitaciones corporativas, en `docs/app/invitaciones.md`.

- ⚠️⚠️ **«DISEÑO DE COMUNICACIONES» · el cartel en PDF, el single y el logo vacíos, y elegir VARIOS
  a la vez** (sep 2026, lo pidió Dani). **Así se llama el editor**: es el MISMO para una **nota de
  prensa**, una **comunicación a compradores** y una **invitación corporativa**, así que lo que se
  toque aquí vale para las tres (es la regla de siempre: un punto único).
  · ⚠️⚠️ **EL CARTEL SEGUÍA SIN VERSE, Y ERAN DOS COSAS MÁS** (Dani lo dijo tres veces). La primera
  ronda ya aceptaba el cartel **subido sin aprobar**, pero faltaban: **un cartel en PDF** —lo que
  manda la imprenta— **no daba imagen NINGUNA** en toda la app, y **el cartel que cuelga de la
  GIRA, el CICLO o el EVENTO** solo valía si estaba aprobado. `_concert_module_poster` recorre
  ahora, de lo más concreto a lo más amplio: lo **aprobado** (de la actividad o de su grupo) → lo
  **subido** de la actividad → lo **subido** de su grupo.
  ⚠️ **NO se cae a `_concert_poster_url`** (el otro punto único del cartel, el de la cabecera de las
  invitaciones): ese **no mira el visto bueno** y colaría un cartel RECHAZADO. Lo de aquí ya cubre
  todo lo que cubre aquel, menos justo eso.
  · **LA MINIATURA DE UN CARTEL EN PDF** (`_artwork_pdf_preview`): se saca la **primera página** y
  se guarda como JPEG en el **mismo `poster_url`** que ya usan los vídeos, así lo aprovecha todo lo
  que pinta miniaturas sin cambiar nada más (`_artwork_image_src` devuelve para un PDF lo mismo que
  para un vídeo: su miniatura si la tiene). **Sin binarios nuevos**: `pypdf` saca las imágenes
  EMBEBIDAS de la página —que es lo que lleva un cartel exportado de Photoshop o de Illustrator— y
  Pillow la reescala. Un **PDF vectorial puro** no trae ninguna: entonces no hay miniatura y se cae
  al respaldo de siempre, que es lo honesto. Clave DETERMINISTA (`artwork/pdf/<id>.jpg`, con
  upsert) y caché negativa de 6 h, como el póster de un vídeo.
  · **EL SINGLE Y EL LOGO, TAMBIÉN SOLO EL MÓDULO VACÍO** (como los datos de la actividad): se
  arrastra y **luego** se elige cuál en el mismo pop-up con buscador. Listar todos los singles y
  todos los logos llenaba la barra de entradas que hay que leer una a una.
  ⚠️ **UN LOGO ES UNA IMAGEN**: el bloque que nace es `image` (se mueve, se redimensiona, se recorta
  y se le pone enlace como a cualquier imagen) y lo que dice que ahí se elige un LOGO es
  **`b.pick`**, no el tipo. Por eso todo el editor pregunta por **`clavePick(b)`** y no por
  `b.type`, y `pick` **se guarda con el diseño** (`promo_press_save` + `blocks_of`, que solo acepta
  las claves de `PICK_KEYS`): sin guardarlo, al reabrir un diseño un logo todavía sin elegir pediría
  una FOTO. El hueco lo dice: «Logo · Pincha para elegir qué logo del grupo».
  · **VARIOS MÓDULOS A LA VEZ con ⌘ (Mac) o Ctrl (Windows)**: `sel` es el último pinchado —el que
  manda en el panel de la derecha y en la barra de formato— y `selExtra` los demás, así todo lo que
  ya funcionaba con uno sigue igual. ⌘+clic **suma** y, si ya estaba, lo **quita**; se **mueven
  juntos** arrastrando cualquiera de ellos o con las **flechas**; **Supr** los borra y **⌘C · ⌘V**
  los copia y pega (quedan seleccionados, para seguir moviéndolos en bloque). El panel de la
  derecha dice cuántos hay: con varios no se enseñan las propiedades de uno (serían las del último
  y se cambiaría lo que no se ve).
  ⚠️ **Pinchar SIN ⌘ uno que YA estaba marcado no deshace la selección**: se arrastra el grupo
  entero (es lo que se espera); si se suelta **sin haberlo movido**, ahí sí se queda solo ese.
  ⚠️ **Al coger un bloque se SUELTA el texto que se estuviera escribiendo, y eso va ANTES de lo de
  ⌘**: con el cursor dentro de un texto, `escribiendo()` deja pasar las teclas al texto y Supr, ⌘C
  y las flechas actuaban sobre una letra en vez de sobre los bloques marcados.
  ⚠️ Moviendo varios **no hay imantado a las guías**: la guía es de UN borde y arrastraría al grupo
  entero a saltos.
  · Prueba de punta a punta: **`tools/check_diseno_comunicaciones.py`** (39 comprobaciones).
