# Giras, ciclos, festivales y eventos

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- Giras compradas y PRODUCCIÓN: en una gira comprada hay fechas que promovemos nosotros y otras
- Pestaña EVENTOS = los eventos que promovemos NOSOTROS (sus conciertos, en Conciertos)
- LOGOTIPOS E IMAGEN DE MARCA de una gira / ciclo / evento
- Cartelería de TODA una gira / ciclo / evento
- REPORTE DE VENTAS · el filtro de artistas y eventos es el MISMO que el del repertorio (ago
- EVENTOS: sujeto vs
- UNA ACTUACIÓN EN UN FESTIVAL ES UN CONCIERTO (bug real, ago 2026). No es lo mismo
- Contenedor de EVENTO que se degradaba a CICLO (bug real, corregido): el modal de editar de
- Categoría EVENTOS de Contratación (CycleFestival.kind='EVENTO' + event_id → AppEvent)
- PRL / Altas (riesgos laborales del personal de eventos): modelos PersonComplianceDoc
- EL RECORDATORIO POR SMS A 48 h Y A 24 h de lo que falta de alta y PRL
- QUÉ LLEVA REPORTE DE VENTAS, Y EL TIPO «CICLO». Punto único
- UN EVENTO PROMOCIONAL PUEDE SER SIN CACHÉ Y CON GASTOS CUBIERTOS: en el asistente de
- UN EVENTO PROMOCIONAL TIENE NOMBRE, Y SE PIDE EN LOS PRIMEROS PASOS. Sin él la
- QUIÉN VA CON EL ARTISTA · en un EVENTO PROMOCIONAL y en una PROMOCIÓN. Hay

---

- **Giras compradas y PRODUCCIÓN**: en una gira comprada hay fechas que promovemos nosotros y otras
  que se le venden a un promotor de fuera. **De las de fuera no nos ocupamos**: ni salen en
  Producción, ni generan petición, ni se les pide responsable. El criterio es **que promueva una
  empresa del GRUPO** (`_concert_is_group_promoted`: `group_company_id` o participación vía
  `ConcertCompanyShare`), el mismo que usan cartelería e invitaciones.
  ⚠️ Antes `_concert_needs_production` miraba solo «que no haya un tercero como promotor», que NO es
  lo mismo: una fecha a la que nadie le había puesto promotor se colaba en Producción como si fuera
  nuestra y pedía responsable a quien no le tocaba. Ahora `_concert_needs_production(concert,
  session_db=None)` usa el criterio bueno (sin sesión cae a `group_company_id`, resolviéndola con
  `object_session` si puede), y `_concert_needs_production_owner` **empieza preguntándoselo**: lo que
  no va a producción no pide responsable.
  ⚠️ El listado de Producción conserva las que **ya tienen bolsa** aunque ahora no cumplan el
  criterio: la regla vale para el trabajo nuevo, no para esconder el que ya está empezado.
- ⚠️⚠️ **PESTAÑA «EVENTOS» = LOS EVENTOS QUE PROMOVEMOS NOSOTROS; SUS CONCIERTOS, EN CONCIERTOS**
  (sep 2026, lo pidió Dani: «en la pestaña de eventos están los eventos en los que nosotros somos
  promotores, no los conciertos de eventos como artistas»).
  · **La pestaña** enseña los **CONTENEDORES** (`_render_cycle_festivals(only_events=True)`): la
  gira propia de un evento, su ciclo o su festival, con su empresa, sus fechas y su nº de
  actividades. Ya no hay vista de «actividades agrupadas por evento» (`_render_event_activities` y
  `templates/eventos.html` se han retirado, y con ellos el `?contenedores=1`).
  · **Los CONCIERTOS de un evento salen en «Conciertos»**, con el **EVENTO como sujeto** de la
  rejilla —su nombre, su logo y su etiqueta «Evento»—, igual que un artista; se entra en él con
  **`?event=`**, no con `?artist=`, así que desde ahí no se llega nunca al artista espejo.
  ⚠️ Para eso se quitó el filtro `Concert.event_id.is_(None)` de las DOS consultas de esa pantalla
  (el listado y el recuento de la rejilla): si no salían ahí, un concierto de un evento no estaba
  en ninguna parte.
  ⚠️⚠️ **Y HAY QUE PASARLE EL `event_map` A `_concert_row`**: `Concert` **no tiene relación
  `event`**, así que sin el mapa la fila caía en el artista y enseñaba el ESPEJO («Evento X
  (evento)»), que es justo lo que no puede verse. Es una consulta en bloque, no una por fila.
  ⚠️ Sus TAREAS van ahora a la pestaña que les toque por lo que son (`_contracting_activity_tabs`
  ya no devuelve `["eventos"]` para todo lo que tenga `event_id`).
- **LOGOTIPOS E IMAGEN DE MARCA de una gira / ciclo / evento** (ago 2026): es la **PRIMERA sección**
  de la cartelería GENERAL del grupo, donde se suben **los formatos del logo** (principal,
  horizontal, negativo, isotipo, cabecera de redes, manual de marca…) y donde se marca **cuál es
  LA IMAGEN de la gira** — la misma que se ve en su ficha y en los listados, igual que la foto de un
  artista.
  · **No es un modelo nuevo**: son `ConcertArtworkAsset` de la MISMA solicitud del grupo con
  **`category`** (`ARTWORK_ASSET_CATEGORIES`: **POSTER** = cartel · **LOGO** = pieza de marca), así
  que reutilizan la subida (con carpetas), la aprobación de diseño, las miniaturas de vídeo y el
  compartir. Las piezas ANTERIORES a la columna son todas POSTER (`_artwork_asset_category`, global
  de plantilla **`artwork_category`**).
  ⚠️⚠️ **PERO NO SE MEZCLAN**: cada categoría tiene su sección, su subida y su ZIP
  (`group_artwork_download_all?category=LOGO`), y **todo lo que SALE de casa es solo POSTER** — el
  enlace público de cartelería, su descarga y el aviso de salida a la venta
  (`_artwork_group_assets(..., category=…)` y el filtro de `_concert_artwork_share_assets`). Un logo
  no es lo que se le manda al artista ni al promotor.
  ⚠️ Por lo mismo, **`_artwork_pick_primary_by_squareness(row, category)`** trabaja **por categoría**
  y `group_artwork_asset_primary` solo desmarca dentro de la suya: sin eso, la primera pieza de marca
  se quedaba como **cartel** principal de la gira (y marcar un logo desmarcaba el cartel).
  · **La imagen principal se APLICA al grupo**: `_artwork_group_apply_brand_image` escribe
  **`logo_url`** (`ARTWORK_GROUP_IMAGE_FIELD`) de `PurchasedTour` / `CycleFestival` / `AppEvent`, que
  es el campo que YA pinta toda la app — mismo patrón que la portada de un proyecto discográfico: no
  se guarda un dato paralelo. El punto único es **`_artwork_group_sync_brand_image`**, llamado desde
  los CUATRO caminos que la pueden cambiar (subir, aprobar, marcar principal y borrar), así que la
  sección de marca y la imagen de la gira **no se pueden desparejar**.
  ⚠️ Al borrar la principal, la imagen pasa a la siguiente pieza de marca y, si no queda ninguna, el
  grupo **se queda sin imagen** en vez de apuntar a un archivo borrado (`clear_if_empty`).
  ⚠️ Solo una **IMAGEN** puede ser la imagen del grupo (`_artwork_can_be_primary`): un vectorial o un
  paquete no. Y por eso existe el kind **`FILE`** (`ARTWORK_FILE_EXTS`: `.ai`, `.eps`, `.zip`,
  `.psd`, `.indd`) — un logo de imprenta **no se puede pintar**, así que se ve con su icono y se
  descarga; va por `upload_file` (`upload_image` solo admite PNG/JPG/WEBP/GIF/**SVG**).
  · UI: la sección vive en `templates/_artwork_group_panel.html` (y por tanto sale igual en la ficha
  del grupo y, en solo lectura, dentro de cada fecha). **El modal de subida es UNO** para las dos
  categorías y ⚠️ **la categoría se fija EN EL CLIC** (`data-gart-open="LOGO|POSTER"`), no en
  `shown.bs.modal`, que con `modal_stack.js` por medio no siempre llega. En marca, cada archivo lleva
  su **nombre de formato** (con el catálogo `ARTWORK_BRAND_FORMATS` sugerido en un `datalist`); en
  carteles el nombre lo sigue poniendo el archivo.

- **Cartelería de TODA una gira / ciclo / evento**: `ConcertArtworkRequest` admite dueño GRUPO
  (`group_kind` TOUR|CYCLE + `group_id`, con `concert_id` NULL): una sola solicitud para todas sus
  fechas. Panel reutilizable `templates/_artwork_group_panel.html` (contexto `_artwork_group_context`)
  en la pestaña **Cartelería** de la ficha del grupo y, con `gk_readonly`, como **módulo aparte**
  dentro de cada fecha, separado de los carteles de esa fecha. Endpoints `group_artwork_*`
  (subir con carpetas, revisar uno a uno, principal, eliminar, descargar todos). Al haber dos módulos,
  la cabecera de la pestaña de la fecha ofrece **«Compartir todos los carteles»** (los dos lotes) y cada
  módulo mantiene el suyo.
- **REPORTE DE VENTAS · el filtro de artistas y eventos es el MISMO que el del repertorio** (ago
  2026): se pincha uno y se ven **SOLO los suyos** (selección única, con «Todos» delante), con su
  foto pequeña (`.artist-mini`) y el elegido en oscuro.
  ⚠️ Antes eran chips que **nacían TODOS activos y se iban desactivando** (con «Todos»/«Ninguno»
  aparte), que es lo contrario de lo que se espera al pinchar un artista. El motor ya tenía la
  selección única para los chips de tipo y estado; los de artista se han pasado a ese patrón
  (`currentArtistSet` devuelve `null` con la clave vacía = sin filtrar).
  ⚠️ Las claves NO son siempre un UUID de artista: son `str(artist_id)`, **`event:<slug>`** para un
  concierto sin artista con nombre de festival, y **`otros`** para el resto (`filter_entities`). El
  filtro sigue siendo del NAVEGADOR y compara la clave con el `data-artist` de cada tarjeta, así que
  las tres formas valen; el filtro del SERVIDOR solo entiende UUIDs.
  · No hay totales que recalcular: la plantilla no pinta los `kpis` del servidor (esos solo van en el
  correo), y los importes de cada tarjeta son suyos.

- **EVENTOS: sujeto vs. tipo de actividad** (aclaración ago 2026). La palabra «evento» significaba
  dos cosas y se confundían:
  · **Actividad de tipo evento** a la que va un ARTISTA (unos premios): es
  `Concert.activity_type='EVENTO_PROMOCIONAL'` y vive en **«Otras actividades»**. No cambia nada.
  · **EVENTO como SUJETO** (una sesión DJ, una fiesta, «la ruta del Aguilar»): es un `AppEvent` y
  **funciona como un artista** — puede tener actividades sueltas, una **gira propia**, un ciclo o un
  festival. Sus actividades salen en **Conciertos** (con el evento como sujeto de la rejilla) y lo
  que se organiza de él —su gira, su ciclo, su festival— en la pestaña **«Eventos»**.
  **Contenedores de un evento**: `CycleFestival` con `event_id`, `kind` ∈ **GIRA** (nuevo: su gira
  propia, ≠ «gira comprada», que es `PurchasedTour` y se le compra a un promotor) · CICLO ·
  FESTIVAL · EVENTO (el tipo antiguo, se conserva por los ya creados). `CYCLE_FESTIVAL_EVENT_KINDS`
  y el propio `event_id` deciden si un contenedor es «de evento»: `_render_cycle_festivals`
  reparte por ahí, no por el kind. `_apply_cycle_form` guarda `event_id` **para cualquier kind**.
  **Ficha del evento** (`event_detail_view` + `templates/evento_detail.html`): como la del artista
  pero con los datos del EVENTO — pestañas Datos (con `AppEvent.description`) · Actividades y giras
  · Vinculaciones (nuevo tipo `event` en `APP33_ENTITY_LINK_TYPES` + `api_entity_link_search`) ·
  Fotos (`PHOTO_OWNER_TYPES` ya admitía EVENT) · Resultado (agregado de sus fechas con
  `_group_concert_econ`, **solo se calcula en su pestaña** porque el motor es caro) · Simulaciones ·
  Plantillas de gastos. ⚠️ El **artista ESPEJO** (`Artist.event_id`, `_ensure_artist_for_event`)
  existe solo porque `Concert.artist_id` es NOT NULL: es un detalle de implementación y **no debe
  verse nunca** — ni su nombre, ni su foto, ni su ficha.
- ⚠️⚠️ **UNA ACTUACIÓN EN UN FESTIVAL ES UN CONCIERTO** (bug real, ago 2026). No es lo mismo:
  · `Concert.activity_type = 'FESTIVAL'` = **el concierto de nuestro artista DENTRO del festival de
  otro** → va en el listado de **Conciertos**, con la etiqueta «Festival» al lado del tipo de venta.
  · un **`CycleFestival`** (kind FESTIVAL/CICLO) = **un festival o ciclo que organizamos NOSOTROS**,
  que vive en su pestaña y cuyas fechas se enganchan por **`cycle_festival_id`**.
  Antes el listado de conciertos EXCLUÍA `activity_type='FESTIVAL'` y `_contracting_activity_tabs`
  mandaba esas actividades a «Festivales y ciclos» solo por el tipo, así que **una actuación en un
  festival ajeno no salía en ningún listado de contratación**. Ahora la exclusión del listado (y la
  del recuento de la rejilla de artistas) ya no lleva FESTIVAL, y a «Festivales y ciclos» se va
  **solo con `cycle_festival_id`** (una fecha de un contenedor nuestro sale en las DOS pestañas, que
  es correcto: es una fecha del ciclo y es un concierto).
  ⚠️ La rama de `festivales-ciclos` que filtraba por `activity_type == 'FESTIVAL'` dentro de
  `contracting_view` es **código muerto** (antes de llegar ahí ya hace `return _render_cycle_festivals()`).

- ⚠️ **Contenedor de EVENTO que se degradaba a CICLO** (bug real, corregido): el modal de editar de
  `activity_group_detail.html` solo ofrecía FESTIVAL/CICLO y marcaba CICLO por defecto, así que
  guardar un contenedor de evento lo convertía en ciclo y —como `event_id` solo se conserva en la
  rama EVENTO— le borraba el vínculo con el `AppEvent`. Ahora `_apply_cycle_form` **conserva el kind
  actual** si el formulario no lo trae, la plantilla no ofrece el selector cuando `is_event`, y
  `ensure_activities_grouping_schema` **repara** con un UPDATE las filas ya degradadas
  (`event_id IS NOT NULL AND kind <> 'EVENTO'`, que por construcción solo pueden ser eso).
- **Categoría EVENTOS de Contratación** (`CycleFestival.kind='EVENTO'` + `event_id` → `AppEvent`):
  contenedor de un evento propio (gala, feria…) de **una fecha o varias**, que funciona igual que una
  gira comprada (agrupa sus `Concert` por `cycle_festival_id`). Sección `?section=eventos` →
  `_render_cycle_festivals(only_events=True)` (MISMA pantalla que Festivales/Ciclos, filtrada por kind;
  las dos se excluyen entre sí). Recurso de permisos `contratacion.eventos`; la ficha es
  `activity_group_detail.html` con `is_event`. Convertir una simulación de EVENTO: `target='event'`
  (el botón de la simulación lo elige solo cuando el sujeto es un evento).
- **PRL / Altas (riesgos laborales del personal de eventos)**: modelos `PersonComplianceDoc`
  (polimórfico: owner PROMOTER/USER/COMPANY; `doc_type` AUTONOMO_RECIBO/ALTA_SS/ITA/PRL_FORMACION/
  PRL_INFORMACION; `valid_from/valid_until` —NULL = sin caducidad—, status APPROVED/REJECTED,
  `linked_person_ids` para ITA) y `PrlUploadRequest` (token público por persona/evento);
  `Promoter.prl_type` AUTONOMO|PUNTUAL|EMPRESA. Bloque en `app.py` junto a la hoja de ruta
  (~`_prl_*`): **detección de fechas con pypdf** (`_prl_detect`, validado con documentos reales):
  recibo autónomos «PERIODO LIQUIDACION: MM/AAAA» → válido el mes SIGUIENTE; ITA «EN ALTA A FECHA:
  dd mm aaaa» → válido ese mes (+ extracción de trabajadores nombre+IPF y auto-vinculación por DNI
  normalizado `_prl_norm_dni` contra `Promoter.tax_id`/`UserProfile.dni`); alta SS «fecha de
  efectos» → debe coincidir con la fecha del evento (aviso si no). Estado por persona
  `_prl_person_status` (3 semáforos: alta según tipo / información / formación; EMPRESA acepta ITA
  propio o de empresa del grupo vinculado). UI: **subpestaña PRL** del Personal de la hoja de ruta
  (`roadmap.js`: `renderPrl`, iconos verde/rojo clicables —rojo=subir manual, verde=ver+rechazar
  con correo «ha sido rechazado, vuélvelo a subir»—, menú solicitar por correo/WhatsApp, «Solicitar
  a todos», exportar PDF/Excel `prl_export_pdf/xlsx`); **página pública** `/prl/<token>`
  (`public_prl_upload.html`: pregunta el tipo con iconos → huecos de documentos con drag&drop y
  detección; una persona MANUAL se convierte en tercero y se vincula sola); pestañas **«Alta y
  PRL»** en tercero y **«PRL»** en personal propio (partial `_prl_docs_panel.html`);
  **Administración → Altas** (`administracion.html` tab `altas` + `admin_ita_upload`: ITA mensual
  por empresa del grupo con vigencia y trabajadores detectados) y módulo en Inicio
  `HOME_ADMIN_ALTAS_PENDING` (ITA caducado/sin subir). Endpoints en `SUPPORT_ACTION/READ_ENDPOINTS`;
  públicos en las 3 listas (`allowed`, `PUBLIC_ENDPOINTS_EXTRA`, `_CSRF_EXEMPT_ENDPOINTS`).
  Los docs en vigor NO se vuelven a pedir entre eventos («solicitar a todos» solo escribe a quien
  le falte algo, contando también EPIs/renuncia/baja de quien los necesite). `pypdf` en requirements.
  **A quién se le pide cada cosa**: `PRL_EPIS_TYPES` y `PRL_MEDICAL_WAIVER_TYPES` = **por cuenta
  ajena** (alta `PUNTUAL` + `PRL_OWN_STAFF_TYPE` «OFICINA», el personal propio), `PRL_BAJA_TYPES` =
  solo `PUNTUAL`. El **alta puntual exige también la BAJA** (`BAJA_SS`, cierra el periodo; el alta de
  varios días ya cubre cualquier evento dentro del rango). El **personal de la oficina** (persona de
  la hoja de ruta con `kind='USER'`) sí tiene estado PRL: sus documentos cuelgan del usuario
  (`PersonComplianceDoc` owner_type USER) y su alta la cubre el ITA de la empresa del grupo por
  vínculo `USER:<id>` o por DNI. Los semáforos, la página pública y las exportaciones (PDF/Excel)
  solo piden/pintan lo que le toca a cada uno («—» o en gris si no aplica).

  ⚠️⚠️ **EL RECORDATORIO POR SMS A 48 h Y A 24 h** (sep 2026). Pedir la documentación por correo no
  basta: el día antes seguía faltando gente y ya no había tiempo de arreglarlo. Barrido
  **`_prl_reminder_sweep`** (en el cron único, clave `prl_recordatorio`, **cada 15 min**): a **48 h** y
  a **24 h** del comienzo, a quien todavía le falte algo le llega un SMS que dice **cuántas horas
  quedan**, **de qué actividad** se trata —«el concierto», «el evento»… con el punto único
  `_artwork_activity_word`—, **de quién** (el artista) y **dónde** (el nombre de la actividad y, si no
  tiene, el municipio), **QUÉ le falta exactamente** (solo lo suyo, según su tipo de trabajador) y
  **el enlace** de siempre (`/prl/<token>`).
  · **Qué falta lo dice `_prl_person_status`**, el MISMO punto único de los semáforos y de la página
  pública: no hay una segunda idea de qué está pendiente. Si ya no le falta nada, **no se le escribe**.
  · **No se repite**: `PrlUploadRequest.reminder_48_at` / `reminder_24_at`. Entrar directamente en la
  ventana de 24 h (una actividad creada tarde) da por avisada también la de 48.
  · **El reloj** es `_prl_activity_start`: la hora del **show**, si no la de **puertas** y, si no hay
  ninguna, `PRL_REMINDER_DEFAULT_TIME` (20:00) — no se inventa una hora distinta en cada sitio.
  · **El texto lo compone el SERVIDOR** (`_prl_reminder_sms_text`), único sitio donde se escribe: dice
  «antes **del** concierto» (no «de el») y, si falta media docena de documentos, enumera **tres** y
  añade «y N cosas más» —un SMS se cobra por trozos y la página ya los pide uno a uno—.
  ⚠️ **No pasa por los interruptores de `SMS_NOTICE_KINDS`**: esos son para los avisos de la campanita
  del personal de la casa, y esto va a TERCEROS (como los mensajes de la hoja de ruta). El tope diario
  de `_send_optional_sms` sigue protegiendo el gasto.
  ⚠️ Probado con la app real: dos personas y dos actividades → 4 SMS en la primera pasada, **cero** en
  la segunda, y quien sube su documentación deja de recibirlo.

- ⚠️⚠️ **QUÉ LLEVA REPORTE DE VENTAS, Y EL TIPO «CICLO»** (sep 2026). Punto único
  **`_concert_needs_sales_report`** (y su versión EN BLOQUE `_concerts_need_sales_report_map`),
  aplicado en los CUATRO sitios: el **reporte** (`concerts_for_report`, del que cuelgan la pantalla,
  «Anteriores», los reportes por promotor/artista/empresa, el PDF y el correo), el listado
  **/ventas**, su **A4** y la **solicitud al promotor** (`_concert_sales_request_applies`, de la que
  cuelgan el barrido, el enlace público y la tarea «Configurar el responsable de ticketing»).
  · **Fuera**: lo **GRATUITO** (no vende ninguna entrada) y el **FESTIVAL de un TERCERO** (ese día
  tocan varios artistas y la venta no es de nuestra fecha).
  · **Dentro**: el **CICLO**, que es un **tipo de actividad NUEVO** (`QUAD_ACTIVITY_CHOICES`, icono
  `fa-calendar-week`) — aunque sea el ciclo de otro, ese día solo actúa NUESTRO artista, así que sí
  lleva reporte y sí se le pide al promotor. **No confundirlo** con el ciclo que organizamos
  nosotros, que es un `CycleFestival`.
  ⚠️ `QUAD_ACTIVITY_ALIASES` ya no manda `CICLO` a `FESTIVAL` (`CADIZ` sí se queda: es un tipo de
  VENTA). CICLO entra además en `CONCERT_LIKE_ACTIVITY_TYPES`, `CONCERT_SINGING_ACTIVITY_TYPES`,
  `QUAD_CONCERT_CONCEPTS` y `ACTIVITIES_TYPE_KEYS`.
  ⚠️⚠️ El gate es **NEGATIVO** («fuera esto»), nunca «solo lo que vende entradas»: las actividades
  anteriores al asistente no traen `entry_mode` y la condición positiva borraría medio histórico.
  ⚠️ El asistente ya **no tiene su propio diccionario de alias**: normaliza con `_activity_kind_key`
  (el punto único). Con dos catálogos, un tipo nuevo se guardaba como CONCIERTO sin dar ningún error.

- **UN EVENTO PROMOCIONAL PUEDE SER SIN CACHÉ Y CON GASTOS CUBIERTOS** (sep 2026): en el asistente de
  **PETICIONES** el módulo «¿el promotor cubre otros gastos?» estaba DENTRO del bloque del importe
  (`[data-pw-fee]`), así que al marcar «Sin caché» desaparecía y no había forma de configurarlo — y
  `_peticion_apply_form` además lo LIMPIABA. Ahora se pregunta **haya o no caché** (es lo normal en
  lo promocional: sin caché pero con hoteles, viajes o catering cubiertos). En el asistente de
  ACTIVIDAD y en la ficha ya se ofrecía siempre.

- ⚠️⚠️ **UN EVENTO PROMOCIONAL TIENE NOMBRE, Y SE PIDE EN LOS PRIMEROS PASOS** (sep 2026). Sin él la
  actividad no se identifica en ningún listado (sale solo el lugar). El campo es el `festival_name`
  de siempre y se pide en el **paso 3** del asistente de actividad y en el **paso 2** del de
  PETICIONES (junto al artista), con su rótulo «Nombre del evento».
  ⚠️ Es **OBLIGATORIO solo en EVENTO_PROMOCIONAL**; en el resto de tipos con nombre propio sigue
  siendo opcional y en un CONCIERTO no se pregunta. Lo comprueban el navegador
  (`syncFestivalName()` pone el `required`, y el motor de la casa lo marca en rojo) **y el
  SERVIDOR** (`_peticion_apply_form` levanta un `ValueError` que sale por `_flash_form_error`, así
  que se dice el motivo, se marca el campo y no se pierde lo tecleado).

- ⚠️⚠️ **QUIÉN VA CON EL ARTISTA · en un EVENTO PROMOCIONAL y en una PROMOCIÓN** (sep 2026). Hay
  que decir quién acompaña al artista **y decírselo a esa persona**, y **lo asigna LA PERSONA DE
  PRODUCCIÓN** que hace el evento (en una promoción sin producción, promoción misma).
  · **PUNTO ÚNICO para las dos cosas**: `Concert` y `Promotion` tienen los MISMOS campos
  (`escort_kind` NONE|USER|PROMOTER · `escort_user_id` · `escort_promoter_id` · `escort_note` + sus
  sellos), así que **`_escort_state`** · **`_escort_apply_form`** · **`_escort_notify`** ·
  **`_escort_subject`** · **`_escort_can_edit`** funcionan con cualquiera de los dos y el pop-up es
  el MISMO parcial (`_escort_modal.html`). `_promo_escort_label` / `_promo_apply_escort_form` se
  conservan como alias (es lo que lee la ficha de la promoción).
  ⚠️⚠️ **DECIDIR y AVISAR son DOS cosas**: `escort_decided_at` (ya se ha dicho quién va) y
  `escort_notified_at` (ya se le ha dicho A ÉL). **La tarea no está hecha hasta lo segundo** — salvo
  que **no vaya NADIE** (`NONE`), que también es una decisión tomada y no hay a quién avisar. Sin el
  sello de «decidido», «no acompaña nadie» no se distinguiría de «nadie lo ha tocado» y la tarea
  quedaría pendiente para siempre.
  ⚠️ **Si el aviso NO sale, NO se marca**: una tarea que dice «avisado» sin que nadie se haya
  enterado es peor que una pendiente. Un TERCERO **sin correo** en su ficha se dice y se ofrece
  **«Guardar · ya se lo he dicho»** (se ha hablado por teléfono), que es el patrón de la casa.
  ⚠️ **Cambiar de persona invalida el aviso** (`_escort_apply_form` devuelve `changed`): va otra
  persona, así que hay que volver a decírselo.
  · **A QUIÉN se avisa y cómo**: de la casa → la **campanita** y el correo (kind nuevo
  **`ACOMPANANTE`**, «Vas con el artista», que nace ENCENDIDO por correo en
  `NOTICE_EMAIL_DEFAULT_KINDS`); un TERCERO → **solo correo** (no tiene usuario), con el mismo
  esqueleto de la casa (`_notice_email_activity` / `_notice_email_promotion`).
  ⚠️ **`_notify_user` NO avisa a uno mismo**: si quien lo decide ES quien va, la tarea queda hecha
  igual (ya lo sabe); cualquier otro False sí es un fallo. Y el dict de `_notice_email_*` **no trae
  el HTML hecho** (son los datos de la cabecera): lo pinta `_notice_email_html`.
  · **DÓNDE SE VE**: la tarea en la pestaña **«Inicio»** de la actividad (área PRODUCCIÓN, con su
  pop-up) · el **módulo** que dice quién va (se ve siempre, hecha o no) en esa pestaña y en la ficha
  de la promoción · y el módulo de Inicio **`HOME_ESCORT_PENDING`** (`_home_escort_pending`), en el
  bloque de **LO SUYO** (se le pide por su nombre).
  ⚠️⚠️ **SOLO LO ASIGNADO**: en ese módulo, quien es de producción ve LO SUYO y **dirección** lo ve
  todo. Con `has_access_key('produccion')` su Inicio se llenaba del trabajo de los demás (la misma
  regla que `_home_produccion_pending`), y **el rol lo manda la BD**, no la sesión.
  ⚠️ **A QUÉ ACTIVIDADES se pregunta**: `ESCORT_ACTIVITY_TYPES` = las PROMOCIONALES
  (`PROMO_LIKE_ACTIVITY_TYPES`). En un CONCIERTO quien va con el artista es el **personal de la hoja
  de ruta** (varios), así que ahí no se reclama; y nunca en lo cancelado, en el histórico ni en algo
  que ya ha pasado (avisar de que vas a algo que fue no sirve de nada). Si mañana hace falta en los
  ensayos o en las discográficas, se añade AHÍ y sale solo.
  ⚠️ Sale **BLOQUEADA** mientras la actividad no tenga responsable de producción: es esa persona
  quien lo decide (antes está la tarea de «Activar producción»). Para eso `suelta(...)` acepta ya
  `blocked`/`blocked_reason`.
  ⚠️⚠️ **`concert_escort_save` y `promo_escort_save` van en `REQUEST_ANY_ENDPOINTS`**, no en
  `SUPPORT_ACTION_ENDPOINTS`: ese exige ser «actor» (poder editar alguna sección) y a la persona de
  producción se le **comía un 403 en su propia tarea** (comprobado); y la ruta `/conciertos/…`
  resuelve a `contratacion.conciertos` con edición, que producción tampoco tiene. La puerta fina la
  pone **`_escort_can_edit`** DENTRO.
  ⚠️ **`_office_people`** es el punto único del personal de la oficina para elegir acompañante
  (antes se llamaba `_promo_office_people`, que hacía pensar que era solo de promoción).

