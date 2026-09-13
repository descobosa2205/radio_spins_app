# Invitaciones

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- INVITACIONES · las GALLETAS de la cabecera dicen lo que hay
- INVITACIONES · el símbolo de DESCARGADA es POR CATEGORÍA. Quien tiene entradas de
- INVITACIONES · solo se marca ENVIADO lo que se ha enviado de verdad (bug real y grave,
- INVITACIONES · qué se refresca en sitio al subir (corregido ago 2026). applyDoc (el refresco
- INVITACIONES PENDIENTES DE GESTIONAR · fuera las personas vinculadas
- GENERAR INVITACIONES (entradas con QR que compone la APP) · lote 1: los datos de la entrada
- GENERAR INVITACIONES · lote 2: las CATEGORÍAS y la generación de las entradas.
- GENERAR INVITACIONES · lote 3: el CONTROL DE ACCESO. Solo cuando la actividad
- INVITACIONES · «Por contrato» / «Disponibles» / «?». En el listado de
- INVITACIONES · «DISPONIBLES» ES LO QUE HAY SUBIDO Y LIBRE, NO EL CUPO DEL CONTRATO
- EL DÍA DEL EVENTO · INVITACIONES SIN REPARTIR (sep 2026, _home_invitation_leftovers →

---

- **INVITACIONES · las GALLETAS de la cabecera dicen lo que hay** (ago 2026). Eran «Por contrato ·
  Subidas · Solicitadas · Totales», y «Totales» era `subidas − solicitadas`: contaba las
  **bloqueadas** como disponibles y volvía a restar lo ya asignado (se restaba dos veces). Ahora
  (`_invitation_ficha_header_counts`, el mismo en la ficha de la actividad y en la gestión del
  evento): **Por contrato · Subidas · Bloqueadas** (galleta nueva, **solo si hay alguna**) **·
  Solicitadas** (lo pedido que TODAVÍA no tiene entrada asignada, no el total pedido: lo ya asignado
  ha dejado de ser trabajo) **· Disponibles** (subidas − asignadas − bloqueadas, que es
  literalmente `count(status='AVAILABLE')`). Todo sale de **una** consulta agrupada por estado más
  dos de asignadas por petición/compromiso. Se conserva la clave `total` como alias de `available`
  por lo que ya la leía.
  ⚠️ `.invitation-counts` pasa a **flex**: con `grid-template-columns: repeat(4,…)` la quinta
  galleta caía sola a otra fila en cuanto había bloqueadas.

- **INVITACIONES · el símbolo de DESCARGADA es POR CATEGORÍA** (ago 2026). Quien tiene entradas de
  Pista y de Grada y solo se ha bajado las de Pista tiene que verlo **en Pista y no en Grada**, sea
  la descarga parcial o completa. Antes la descarga solo se apuntaba en `downloaded_at` (una fecha
  para toda la petición) y el símbolo salía en TODAS sus categorías.
  · `InvitationRequest.downloaded_categories_json` (lo que ya tenía `InvitationCommitment`), que
  rellena el punto único **`_invitation_mark_downloaded`** (antes `_invitation_commitment_mark_…`),
  llamado ahora desde los **cuatro** caminos de descarga: PDF y ZIP de una petición y de un
  compromiso.
  · **`_invitation_download_cats(session_db, row)`** resuelve el estado por categoría
  (`{cat_id: {label, partial}}`) para peticiones y compromisos: **parcial** cuando en esa categoría
  hay entradas asignadas DESPUÉS de la descarga (ampliación), vía
  **`_invitation_last_added_by_cat`** (una consulta agrupada, cacheada en `g`).
  · `_invitation_grouped` **pisa** en la copia de cada categoría `downloaded_at_label`,
  `downloaded_partial` y `needs_download` (para que el filtro «Sin descargar» diga lo mismo que el
  símbolo); en los compromisos, cada `category_status` lleva ya `downloaded_partial`.
  ⚠️ Las descargas ANTERIORES a esto solo dejaron `downloaded_at`: se respetan como si se hubiera
  descargado todo ese día (si no, se borrarían marcas buenas de golpe).

- ⚠️⚠️ **INVITACIONES · solo se marca ENVIADO lo que se ha enviado de verdad** (bug real y grave,
  ago 2026). «Enviar todas las asignadas» marcaba invitaciones como ENVIADAS **sin haber mandado
  nada y sin haber ninguna asignada**. Dos causas, las dos corregidas:
  ⚠️ **`can_send` no exigía que hubiera entradas asignadas**: era
  `uses_guest_list or (assigned_or_sent and fully_assigned)`, y `fully_assigned` sale **True cuando
  el cupo es 0** (`qty_total <= 0`). Una solicitud en ASIGNADAS sin ninguna entrada pasaba el filtro.
  Ahora se exige además `assigned_total > 0` (un LISTADO sí puede enviarse sin entradas: ahí no hay
  PDF que asignar). Como `can_send` es el punto único, el arreglo vale para TODOS los caminos de
  envío: el individual, el de una categoría y el del evento entero.
  ⚠️ El marcado va ANTES de componer el correo (para que salgan las etiquetas «Nueva»), y se
  confiaba en un `session_db.rollback()` si el envío fallaba. Ahora va en un **SAVEPOINT**
  (`begin_nested`): si el correo no sale, se deshace SOLO eso — un rollback de toda la sesión se
  llevaba por delante lo pendiente de otras filas y podía dejar cosas marcadas a medias.

- **INVITACIONES · qué se refresca en sitio al subir** (corregido ago 2026). `applyDoc` (el refresco
  sin recargar de `invitaciones.html`) cambiaba los planos y el contador de «disponibles», pero NO
  los de **«Subidas»**: la cabecera del evento y la línea `Configuradas · Subidas · Disponibles` de
  cada categoría se quedaban con el número viejo hasta recargar la página. Ahora llevan sus anclas
  (**`data-inv-header-counts`** y **`data-cat-head="<id>"`**) y se reemplazan también.
  ⚠️ Y si la categoría **cambia de estructura** —la PRIMERA subida en una categoría vacía crea el
  grid donde antes ponía «No hay invitaciones subidas»— no vale reemplazar pieza a pieza, porque esas
  piezas todavía no existen en la página: se cambia el **panel entero** (`data-cat-panel`) y esa
  categoría se salta en los reemplazos finos. ⚠️ Los planos de los paneles ya cambiados se excluyen
  de las DOS listas (la del documento nuevo y la del vivo): `replaceWith` MUEVE el nodo, así que
  filtrando solo una los números dejaban de casar y no se refrescaba ninguna otra categoría.
  ⚠️ El botón «Seleccionar varias» vive en esa cabecera, así que su listener pasa a ir por
  **delegación**: pegado al botón se quedaba muerto en cuanto la cabecera se reemplazaba.

- ⚠️ **INVITACIONES PENDIENTES DE GESTIONAR · fuera las personas vinculadas** (sep 2026): el módulo
  de Inicio pintaba, junto a cada artista, sus personas vinculadas (`linked_mini`). Eso es de la
  **ficha del artista**: aquí es lo que hay que GESTIONAR y solo hacía ruido. Misma regla que la
  cabecera de una actividad y la de una canción.

- ⚠️⚠️ **GENERAR INVITACIONES (entradas con QR que compone la APP) · lote 1: los datos de la entrada**
  (sep 2026). «Gestionar invitaciones» trabaja con PDFs que se SUBEN; aquí se GENERAN. Solo en lo que
  promueve una **empresa del grupo** (`_invgen_can_generate` → `_concert_is_group_promoted`): botón
  **«Generar invitaciones»** delante de «Configurar» en la pestaña Invitaciones del evento
  (`group_promoted`) → pantalla `invitation_gen_view` (`/invitaciones/evento/<id>/generar`,
  `invitaciones_generar.html`): arriba los **DATOS DE LA ENTRADA** con la **vista previa** de la
  entrada como miniatura a la derecha (PDF de muestra pintado con PDF.js, `static/js/invgen.js`), y
  debajo las categorías generadas (lote 2).
  · **Modelos** (`ensure_invitation_gen_schema`): `InvitationGenConfig` (una por actividad: horas,
  imagen, `conditions_json`, `conditions_token` y `access_token`, tokens OPACOS y DISTINTOS) ·
  `InvitationGenExtra` (los extras activos con sus instrucciones) · `InvitationExtraPreset` (el
  **catálogo GLOBAL**: M&G, After Party y Parking de fábrica, y los que se creen quedan para otros
  eventos) · `InvitationConditionsTemplate` (plantillas de condiciones con nombre; la de fábrica
  `is_builtin` se resiembra si falta) · `InvitationGenCategory` / `InvitationGenSector` /
  `InvitationVoidedCode` / `InvitationAccessLog` (lotes 2 y 3). Y en **`InvitationTicket`**:
  `is_generated` · `qr_token` · `gen_category_id` · `gen_sector_id` · `door` · `map_key` ·
  `code_version` · `access_entered_at` · `access_extras_json` (cada columna en su propia sentencia).
  · **El asistente** (`_invgen_config_modal.html`, `step_wizard.js`): cabecera en el color
  corporativo con un icono por paso (`[data-invgen-steps]`, que sincroniza el JS observando la clase
  `.active` de los `.sw-step`: el motor no avisa) → Recinto (se coge de la actividad, con su
  dirección) · Horarios (por defecto los de la actividad) · Extras (chips del catálogo + «Nuevo
  extra» con su icono, e instrucciones por extra) · Imagen (las que ya tenemos, subir otra o sin
  imagen) · Condiciones (plantilla → editor de cláusulas título+texto, reordenar, «guardar como
  plantilla nueva») · Resumen. Endpoint `invitation_gen_config_save`.
  ⚠️⚠️ **CAMBIAR UNA PLANTILLA SE PREGUNTA**: si las cláusulas cargadas de una plantilla se tocan, en
  el resumen sale «¿solo para este evento o para la plantilla también?» (`template_scope` ONLY|UPDATE)
  y **sin decidirlo no se guarda** (el guardián corta el `submit` y, como el LOADER global ya ha
  saltado —escucha `submit` en `document` en captura y se registra antes—, lo apaga con
  `appLoader.hide()`). Las actividades que usaban una plantilla que se borra **conservan sus
  condiciones** (van copiadas en `conditions_json`; solo pierden el vínculo).
  · **EL PDF** (`_invgen_ticket_pdf_bytes`, A4 vertical, punto único para la muestra y para las
  entradas de verdad vía `_invgen_ticket_context`): **«INVITACIÓN» arriba a la IZQUIERDA** (lo pidió
  Dani) y el logo a la derecha (`_invgen_brand_logo_url`: el del ciclo/festival nuestro → el del
  evento → la empresa del grupo) · la imagen a lo ancho con recorte «cover» (`_invgen_image_reader`,
  alfa sobre blanco) · título y subtítulo · los datos con sus iconos (PNG por `_fa_icon_png_path`) ·
  el **QR** (`segno`, contenido = el código de 16 caracteres de `INVGEN_QR_ALPHABET`, sin 0/O/1/I) ·
  la categoría con su butaca y su **puerta** en rojo · los extras con sus instrucciones · y el
  **RESUMEN de las 3 primeras condiciones** con el enlace clicable a las completas. Lo de abajo va en
  un `KeepInFrame` que se encoge: **una sola página siempre**.
  ⚠️ El PDF de una entrada se compone **AL VUELO** (no se sube a Storage): así, al anular un código
  la entrada vieja deja de valer sin tocar ningún fichero. Los PDF al vuelo van con `no-store`.
  · **La landing pública de condiciones** `public_invitation_conditions`
  (`/invitaciones/condiciones/<token>`, standalone con sus `og:`): logo a la derecha, «Condiciones de
  uso» centrado y todas las cláusulas numeradas con el título en negrita y el texto justificado.
  ⚠️ Los endpoints se llaman **`invitation_gen_*`**: caen en `invitaciones.gestionar` por el prefijo
  `invitation_` en los DOS mapeos sin tocar nada; los públicos, en las listas de siempre.
  · **Prueba de regresión: `/tmp/python/bin/python3 tools/check_invitaciones_generadas.py`** (65
  comprobaciones con la app real; idempotente). Para ver el PDF en local, rasterizar con PyMuPDF
  (`PYTHONPATH=/tmp/pf`): el panel del navegador lo descarga en vez de enseñarlo.

- ⚠️⚠️ **GENERAR INVITACIONES · lote 2: las CATEGORÍAS y la generación de las entradas** (sep 2026).
  Una **categoría generada** (`InvitationGenCategory`: nombre + extras) tiene uno o varios
  **SECTORES** (`InvitationGenSector`: una sección del formato del recinto —numerada, con sus
  butacas elegidas en el plano, o de pie, con una cantidad— o un sector **escrito a mano**), cada
  uno con su **puerta**. Al crearla (`invitation_gen_category_create`, JSON) se crea su
  `InvitationCategory` de siempre (`source='GENERADA'`, `qty_contract` = el total, la zona de su
  sección) y **UNA `InvitationTicket` por invitación**, GENERADA: `is_generated`, **`qr_token`** (16
  caracteres de `INVGEN_QR_ALPHABET`, = `ticket_code`), `pdf_url` = **nuestro endpoint público**,
  `map_key`, `door`, `gen_category_id`/`gen_sector_id`. Con eso **entran en la gestión de
  invitaciones —planos, asignar, enviar, descargar— como si se hubieran subido**.
  · ⚠️⚠️ **EL PDF SE COMPONE AL VUELO, no se sube a Storage**: **`_invitation_ticket_pdf_bytes(t)`**
  es el punto único por el que pasan el **PDF unido**, el **ZIP** y el enlace público
  (`public_invitation_ticket_pdf`, `/invitaciones/entrada/<código>.pdf`, en las tres listas de
  públicos): una generada se compone (`_invgen_ticket_context(..., ticket=t)` +
  `_invgen_ticket_pdf_bytes`) y una subida se baja de su `pdf_url` con reintentos. Así, **anular un
  código deja sin valor la entrada vieja sin tocar ningún fichero**: un código ANULADO o una entrada
  DESCARTADA responden **410** («se ha anulado»); uno que no existe, 404. El código se acepta con
  guiones o en minúsculas (`_invgen_norm_code`).
  · **EL CICLO DEL CÓDIGO** (el punto único es **`_invgen_after_release`**, al liberar una entrada):
  enviada y **RECUPERADA** → **renace con OTRO código** (`_invgen_rotate_code`: el viejo a
  `InvitationVoidedCode`, `code_version` +1, `pdf_url` nuevo, sin usos de acceso) — el PDF que tenga
  el invitado deja de valer; enviada y **DESCARTADA** → su código se **anula** (`_invgen_void_code`);
  **no enviada → nada** (nadie lo tenía). Enganchado en el liberar individual
  (`invitation_ticket_release`, que además lo DICE en su mensaje), en el **liberar en bloque**
  (`_invitation_release_apply`), en **eliminar** una entrada (se anula) y en **eliminar la
  categoría** (se anulan todos). `_invgen_mint_token` comprueba que un código nuevo no esté **ni en
  uso ni anulado**.
  ⚠️ **Una generada NO se edita a mano, NO se reemplaza su PDF, NO se mueve a otra categoría** (su
  butaca y su código los pone su categoría generada; `invitation_tickets_bulk` las salta y lo dice)
  y **`invitation_tickets_redetect` no la relee**. Y una categoría generada **solo se elimina sin
  ninguna asignada ni enviada** (una entrada que alguien tiene no se borra por debajo: se recupera
  antes); su `InvitationCategory` se borra si se queda vacía.
  · ⚠️⚠️ **`map_key` = LA BUTACA DEL PLANO YA RESUELTA** («sec|fila|slot»): **`_invgen_valid_map_key`**
  (que comprueba que la sección siga en ESTE mapa) manda **antes** que el casado por texto
  (`seatmap_calc.match_ticket`) en los TRES sitios que ponen invitaciones en el plano: el visor de
  invitaciones del evento (`_invitation_venue_map_payload`), el **asignador**
  (`_invitation_assign_context`) y el **plano en vivo de Enterticket** (`_et_venue_map_payload`). Así
  una generada cae exactamente donde se eligió, y en el plano del ticketing sale **bloqueada como
  invitación**.
  · **QUÉ SE PUEDE ELEGIR** (`invitation_gen_sections` → **`_invgen_sections_payload`**, JSON): las
  secciones del formato del recinto que usa la actividad (`_concert_seatmap`, el punto único de
  siempre) con **sus butacas** —**`seatmap_calc.section_seats`** + `row_label`, sacados de
  `_row_states`/`_row_numbering`, **la MISMA numeración que casa las entradas**—, las **OCUPADAS**
  (`_invgen_taken_keys`: las invitaciones de la actividad salvo las descartadas, lo **vendido en
  Enterticket** y los **bloqueos técnicos** del mapa), cuántas SIN NUMERAR van ya en cada sección de
  pie (`_invgen_unnumbered_used`, para no pasarse del aforo), las **puertas** (los elementos `door`
  del plano + las ya usadas) y el layout **sin la imagen de fondo** para dibujarlo. ⚠️ Lo comprueba
  todo **también el SERVIDOR** (`_invgen_parse_sectors`: butaca que exista en el plano, que no esté
  ocupada ni repetida, cantidad ≤ aforo − ya generadas, nombre repetido de categoría).
  · **EL ASISTENTE** (`_invgen_category_modal.html` + `initCategoryWizard` en `invgen.js`, con
  `step_wizard.js`): Nombre → Extras (los configurados en los datos de la entrada) → **Sector** (un
  **SVG con las secciones, el escenario y las puertas**, dibujado con **`window.VenueMapGeom`** de
  `venue_map.js` —la MISMA geometría del visor, así una butaca está donde está en el mapa; por eso
  la página carga `venue_map.js` aunque no tenga `[data-venue-map]`— o «escribir el sector a mano»)
  → **Butacas** (se pinchan o se **arrastran** con captura de puntero, la **letra de la fila** coge la
  fila entera, y una **franja de ESCENARIO** dice en qué lado está; las grises están ocupadas y las
  rosas ya van en esta categoría) **o Cantidad** (con el aforo que cabe) → **Puerta** (las del plano
  como chips, u otra) → **Resumen** con **«Añadir otro sector»**, que vuelve al paso del sector con lo
  ya puesto en memoria (`staged`) y **manda todo de una vez** al Generar.
  ⚠️ Los pasos de butacas y de cantidad son **condicionales** (`data-sw-when="NUM"` / `"QTY"`): el
  modo lo pone el JS en `data-sw-mode` al elegir el sector (`setMode` + `swRefresh`).
  ⚠️⚠️ **EL DESTINO DEL GENERAR ES LA MISMA PÁGINA CON UN `#`**: asignar `location.href` solo mueve el
  ancla y **NO RECARGA** (la categoría nueva no aparecía y el loader se quedaba puesto). Se hace
  `location.replace(to)` + `location.reload()` (bug real, visto en el navegador).
  · **La pantalla** (`invitaciones_generar.html`, módulo 2): una tarjeta por categoría con sus
  contadores por estado (`_invgen_gen_categories_payload`, UNA consulta agrupada), sus sectores con
  su puerta, «Gestionar» (a la gestión de invitaciones), eliminar (solo si `can_delete`) y
  **«Descargar códigos»** (`invitation_gen_codes_xlsx`: hoja **Códigos** —código, categoría, sector,
  fila, butaca, puerta, extras, estado, invitado— y hoja **Anulados**, para un control de acceso
  externo, que tiene que rechazar esos).
  ⚠️ Los endpoints se llaman `invitation_gen_*` y caen en `invitaciones.gestionar` por el prefijo en
  los DOS mapeos; `public_invitation_ticket_pdf` va en `allowed` ×2 y en `PUBLIC_ENDPOINTS_EXTRA`.
  · La prueba `tools/check_invitaciones_generadas.py` cubre ya el lote 2 (apartados 8-13: **126
  comprobaciones**): secciones, generar (plano + de pie + a mano), rechazos, PDF al vuelo y público,
  las generadas en la gestión (asignador con `map_key`, PDF unido, ZIP, redetectar), recuperar →
  código nuevo, descartar → anulado, eliminar → anulado, el Excel y los permisos.

- ⚠️⚠️ **GENERAR INVITACIONES · lote 3: el CONTROL DE ACCESO** (sep 2026). Solo cuando la actividad
  tiene invitaciones GENERADAS aparece en su gestión de invitaciones la pestaña **«Control de
  accesos»** (`_invgen_access_tab_context` → `access_tab`, `None` si no hay; el parcial es
  `_invgen_access_tab.html` y su JS `static/js/invgen_access.js`): cuántas hay (**válidas** = sin las
  anuladas ni las bloqueadas · han entrado · anuladas), **«Compartir códigos de entradas»** (el Excel
  del lote 2, para un control EXTERNO) y **«Control de acceso propio»**: un ENLACE con el que
  **cualquiera con un móvil** lee los QR en la puerta.
  · **EL ENLACE** es `InvitationGenConfig.access_token` (**OPACO y DISTINTO del de las condiciones**:
  quien está en la puerta no tiene por qué ver ni tocar nada más), se crea al pulsar el botón
  (`invitation_gen_access_link`), pedirlo otra vez **devuelve el mismo** y **«Anular y generar
  otro»** (`renew=1`) deja el anterior sin valor (404). Se comparte por **copiar · WhatsApp · SMS ·
  correo** con la MISMA tarjeta en los tres: **«Control de accesos · \<tipo de actividad\> ·
  \<artista\>»** y debajo **«\<festival o municipio\> · \<fecha\>»** (`_invgen_access_share_meta`,
  que es también el asunto del correo y las `og:` de la página, con la **imagen de la entrada**
  como miniatura → cartel → foto → logo, `public_invitation_access_og_image`). El correo
  (`_invgen_access_email_html`) es el esqueleto de la casa: logo a la derecha, «Control de acceso»
  centrado, la cabecera de la actividad y el botón dentro, abajo a la derecha.
  · **LA PÁGINA PÚBLICA** (`public_invitation_access`, `/control-acceso/<token>`,
  `public_invitation_access.html`, standalone con Bootstrap + FA + `styles.css`): la cabecera del
  evento, **¿QUÉ VAS A CONTROLAR?** (la ENTRADA y **cada EXTRA** de los datos de la entrada, con sus
  números «validadas / emitidas» en vivo), el botón **ESCANEAR** y el código a mano.
  ⚠️⚠️ **EL LECTOR DE LA PUERTA ES `static/js/access_scan.js`, NO `doc_camera.js`**: en una puerta
  se leen cien códigos seguidos, así que es de **lectura CONTINUA** (no cierra al leer), pinta el
  resultado **ENCIMA del vídeo** en VERDE o ROJO con su pitido y su vibración y sigue leyendo; el
  mismo código no se vuelve a mandar en 4 s (un QR delante de la cámara dispara decenas de
  fotogramas y una entrada válida saldría «ya usada» un segundo después). Motor nativo
  `BarcodeDetector` y, donde no lo hay (**Safari en el iPhone**, que es lo que lleva medio equipo),
  **jsQR** desde jsdelivr cargado al vuelo.
  · **CADA LECTURA** (`_invgen_access_scan`, punto único) dice: **OK** · **YA_USADA** («ya entró a
  las…» / «se usó a las…») · **ANULADA** (un código de `InvitationVoidedCode` o una entrada LOST) ·
  **BLOQUEADA** (apartada: no se ha repartido) · **SIN_EXTRA** (la entrada no incluye ese extra) ·
  **DESCONOCIDA** · **OTRA_ACTIVIDAD**, y **todas** dejan su traza en `InvitationAccessLog` (un
  rechazo en la puerta es información). **Solo un OK escribe**: `access_entered_at` o
  `access_extras_json[extra] = hora` (⚠️ con `flag_modified`, el JSONB de siempre). El código llega
  como se lea: los 16 caracteres, con guiones, en minúsculas o la URL del PDF (`_invgen_norm_code`).
  Una entrada **sin asignar a nadie** entra igual pero **se avisa** («no está asignada a nadie»): su
  PDF solo lo tiene quien lo bajó de la app.
  ⚠️ **Recuperar una enviada renace sin usos**: `_invgen_rotate_code` limpia el acceso y los extras, y
  el código viejo dice ANULADA en la puerta.
  · **MENORES: los DOS códigos**. Si la actividad tiene `MinorAuthConfig`, el mismo lector entiende el
  **QR de una autorización** (`MENOR_OK` / `MENOR_KO`, se mira ANTES de normalizar: ese token no es
  un código de entrada) y la página ofrece **«Acceso de menores»**: el escáner de documentos de
  siempre (`DocCamera` con `qr:true`) y el buscador, contra **`public_minor_auth_check`** con el
  `validate_token` de la actividad (el MISMO que su página de validación).
  · **EN TIEMPO REAL**: la pestaña y la página piden cada `INVGEN_ACCESS_POLL_SECONDS` (5) el estado
  a **`_invgen_access_payload`** (el punto único: `controls` con `issued`/`validated`, `totals`,
  `tickets` con lo vivo de cada entrada y `by_source` por petición/compromiso; con `people=1`, quién
  tiene cada una). Dentro, `invitation_gen_access_state`; fuera, `public_invitation_access_state`
  (**solo los números**: ni nombres ni `by_source`).
  · **DÓNDE SE VE QUIÉN HA ENTRADO**: en la pestaña, **una tarjeta por control** que se despliega con
  los invitados con su foto (`_invitation_guest_identity`, resuelto en bloque), **en VERDE** los que ya
  han pasado (o han usado el extra) con su hora, **«Ver también las anuladas y bloqueadas»**, y
  **deshacer** una lectura marcada por error (`invitation_gen_access_undo`, traza `DESHECHO`). Y en
  **«Invitados»**, junto a cada petición y compromiso, la marca **«N/N dentro»** y los extras usados
  (`_invgen_access_badge.html`, que se emite SIEMPRE oculta para que el sondeo la pueda encender).
  ⚠️ `invgen_access.js` se carga **FUERA del `{% if request.args.get('open') %}`** del final de
  `invitaciones.html` (ahí solo se cumple con `?open=`): la primera versión no llegaba al HTML (lo
  sacó la prueba).
  ⚠️ Los endpoints `invitation_gen_access_*` caen en `invitaciones.gestionar` por el prefijo; los
  cuatro públicos (`public_invitation_access`, `_state`, `_scan`, `_og_image`) van en las TRES listas
  y **`public_invitation_access_scan` exento de CSRF** (es un POST público: el token es la credencial).
  · La prueba `tools/check_invitaciones_generadas.py` cubre ya el lote 3 (apartados 14-18: **200
  comprobaciones** en total): la pestaña solo con generadas, el enlace (crear · reutilizar ·
  anular), la página sin sesión con sus `og:`, las siete lecturas, deshacer, el estado y las marcas
  de Invitados, el QR de una autorización de menores, el correo y los permisos.

- ⚠️ **INVITACIONES · «Por contrato» / «Disponibles» / «?»** (sep 2026). En el listado de
  actividades de **Gestionar invitaciones** la galleta decía «Disponibles» y pintaba **lo pactado
  por contrato**. Ahora lo dice el dato (`_invitation_event_counts` devuelve `uploaded`, `contract`
  y `contract_known`): con entradas **SUBIDAS**, lo que hay para repartir son ESAS y se llama
  **«Disponibles»**; sin nada subido, lo único que se sabe es lo **PACTADO POR CONTRATO** y así se
  dice; y si **no consta nada configurado** se pinta **«?»** en vez de un 0, que parecería un dato.
  Un 0 configurado sí es un 0.
  ⚠️⚠️ «No configurado» NO es «configurado a 0», y **tener CATEGORÍAS tampoco es tenerlo
  configurado**: `_invitation_category_legacy_rows` siempre devuelve al menos una fila «General» a 0
  (la de relleno) y `_invitation_get_categories(..., ensure_defaults=True)` la MATERIALIZA en la BD
  con `source='DEFAULT'` en cuanto alguien abre la pantalla de esa actividad — dando eso por
  configurado, el «?» no aparecía NUNCA (bug real que sacó la revisión). `contract_known` solo
  cuenta lo que viene de un sitio de verdad: una categoría con `source != 'DEFAULT'` o con alguna
  cantidad, el contrato de la actividad o los tipos de entrada.
  ⚠️ `configured` y `result` **no se han tocado**: son la puerta de negocio de «cuántas se pueden
  pedir/comprometer» (`_invitation_event_counts(...)['result']`) y cambiarlos movería ese límite.

- ⚠️⚠️ **INVITACIONES · «DISPONIBLES» ES LO QUE HAY SUBIDO Y LIBRE, NO EL CUPO DEL CONTRATO**
  (bug real y grave, sep 2026). Al pedir invitaciones (y al comprometerlas) salía **«Pista ·
  Invitaciones por contrato · Disponibles 20»** de una categoría en la que **no había ni una entrada
  subida** —y en Pista no había ninguna categoría creada—. Lo pactado por contrato es una
  **REFERENCIA** (cuántas nos tienen que mandar): hasta que no se suben, no hay nada que repartir.
  · Punto único **`_invitation_category_payload`**: `available_real` y `available_configured` son
  **subidas − asignadas**, SIEMPRE (antes, sin subidas, devolvían `total_configured`), y se añade
  **`pending_upload`** (lo que falta por recibir) para poder decirlo como lo que es. Igual en
  `_invitation_edit_payload`. En el asistente se lee «Disponibles 0 · Por contrato 20 · faltan por
  subir 20».
  ⚠️ **Y la fila que solo es la referencia del contrato no se ofrece**: `_invitation_get_categories`
  con `ensure_defaults` MATERIALIZA una categoría desde el contrato (o desde los tipos de entrada)
  con `source` CONTRATO/TICKETING/DEFAULT. **`_invitation_reference_only_ids`** las aparta del
  asistente y del pop-up de compromisos (`api_invitation_event_categories`, que alimenta a los dos)
  **cuando el evento ya tiene entradas subidas en sus categorías de verdad**. Mientras no hay nada
  subido en ninguna parte se siguen ofreciendo: se puede pedir antes de que las manden (no hay
  regresión — comprobado con la app real).
  ⚠️ **NO se ha tocado el CUPO** (`_invitation_event_available_by_category`, que es `max(configurado,
  subidas)`): eso es otra cosa —la puerta de «no aceptar peticiones por encima del cupo» y el «solo
  con aforo» del enlace público—, y ceñirla a lo subido bloquearía pedir antes de recibirlas.

- **EL DÍA DEL EVENTO · INVITACIONES SIN REPARTIR** (sep 2026, `_home_invitation_leftovers` →
  `HOME_INVITATION_LEFTOVERS`): a quien **gestiona** esa actividad (`_filter_manageable_concerts`, el
  mismo punto único que la pantalla de invitaciones) le sale en Inicio, **solo el día del evento**,
  lo que se va a quedar sin usar: las **subidas sin asignar** y las **bloqueadas**.
  ⚠️ **Solo se dice LO QUE HAY**: si no hay bloqueadas no se nombran, y si no hay ninguna de las dos
  cosas la actividad no sale (y el módulo entero desaparece).
  ⚠️ Los números salen de `_invitation_ficha_header_counts`, el MISMO que pinta las galletas de la
  cabecera de invitaciones: no pueden decir cosas distintas.

