# Discográfica · plan de lanzamiento y previsiones

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- PROYECTO · PLAN DE LANZAMIENTO: su propia pestaña
- EL PLAN EN LA FICHA DEL SINGLE Y DEL ÁLBUM · el mismo plan, con los MATERIALES dentro
- CONTENIDO EXPLÍCITO · hay que decirlo en TODAS las canciones
- EL LABEL COPY ES UN SOLO CONTENIDO: PDF, ENLACE Y CORREO DICEN LO MISMO (ago 2026,
- LA CALIFICACIÓN DE CONTENIDO es un campo del LABEL COPY (ago 2026,
- DISCOGRÁFICA · CUADRO DE MANDO DE PREVISIONES (sep 2026, pestaña «Previsiones»,
- PREVISIONES · LA AGENDA SOLO ENSEÑA LO QUE SE PONE, y las emisoras van con SU color
- PREVISIONES · EL DETALLE POR ARTISTA: el cuadro de mando de
- PREVISIONES · EL INFORME: se descarga, se imprime y se comparte, y su enlace está EN VIVO
- PREVISIONES · lo que se ve en el calendario y cómo se crea un proyecto desde él

---

- **PROYECTO · PLAN DE LANZAMIENTO** (ago 2026): su propia pestaña
  (`?tab=lanzamiento`, ⚠️ añadida a `DISCO_PROJECT_TABS`: una pestaña que no esté ahí cae en
  «calendario» sin dar ningún error), con la **estética de las bolsas** (una sección por bocadillo,
  `.sim-cat-card`): **Estrategia** · **Acciones** · **Marketing** · **Promoción** · **Contenidos** ·
  **Cronograma**. Modelos `DiscoReleasePlan` + `DiscoReleasePlanAction` + `DiscoReleaseContent`;
  estado en **`_disco_plan_state`**.
  · **Acciones**: título, descripción, ¿coste? (importe sin IVA) y fecha, franja o sin fecha. ⚠️ El
  coste **se lleva a la BOLSA** del proyecto y se mantiene al día en los dos sentidos
  (`_disco_plan_action_sync_bag`, `bag_expense_id`): si la acción deja de tener coste, el gasto se
  retira.
  · **Marketing y Promoción** no se duplican: se enseña **lo que ya está vinculado al LANZAMIENTO**
  (su canción o su álbum), que es el mismo dato que se ve en Marketing y en Promoción.
  · **CONTENIDOS · lo subimos o se lo PEDIMOS A DISEÑO** (ago 2026): al añadir un contenido se elige
  entre **subirlo** (arrastrándolo o eligiéndolo, con el `data-file-drop-for` global) o **pedírselo a
  diseño**, diciendo qué se necesita. Un contenido **se programa igual sin tener el archivo**: hasta
  que llega se ve **RAYADO EN AMARILLO** (`.dp-content.is-pending`, el **mismo** rayado que un
  lanzamiento provisional o una tarea bloqueada: una sola declaración en `styles.css`) con la etiqueta
  «En diseño».
  ⚠️ **El enlace de subida de diseño es EL MISMO de las creatividades**
  (`DiscoProjectDesignRequest` → `public_disco_creatives`): no se inventa otro sitio para lo mismo.
  `_disco_plan_design_link` reutiliza el encargo abierto del proyecto (o crea uno) y le pone como
  fecha máxima la publicación más próxima de las pedidas; `_disco_plan_design_contents` es lo que esa
  página lista además de las creatividades (campos `content_<id>`). Columnas nuevas en
  `DiscoReleaseContent`: `design_requested_at` · `design_requested_by_nick` · `design_notes` ·
  `design_done_at`.
  · **SE ARRASTRA DEL LISTADO AL CRONOGRAMA y solo se pregunta la HORA** (`#dpContentTimeModal`): el
  día lo dice el sitio donde se suelta. Para eso el calendario de la casa acepta ya **cargas
  externas**: quien arrastra pone un JSON en `dataTransfer` con el tipo
  **`application/x-agenda-external`** y, al soltarlo, `agenda_calendar.js` lanza el evento
  **`agenda:external-drop`** con el día — el calendario no sabe nada de contenidos, hitos ni gastos,
  solo del día (antes solo se podía arrastrar lo que YA estaba pintado dentro).
  ⚠️ Se guarda en el endpoint de siempre (`disco_plan_content_move`), que ahora acepta `time`:
  arrastrando DENTRO del calendario la hora **no se toca** (mover es cambiar el día) y arrastrando
  desde el listado se manda la que se pregunta.
  ⚠️ El panel condicional del pop-up usa el motor de la casa (`data-dp-when="source=US|DESIGN"`), que
  además **deshabilita** lo que esconde: un campo oculto se envía igual.
  ⚠️ **El encargo se DESHACE**: volver a «lo subimos nosotros» limpia el pedido y **cierra su aviso**
  (si no, el contenido se quedaba «en diseño» para siempre y seguía saliendo en su enlace). Y cuando
  **diseño lo sube**, el aviso se cierra solo — la regla de `_notify_resolve`.
  · **Contenidos**: archivo (de ahí sale la miniatura), día y **hora**, copy, **menciones obligatorias
  (solo el @)**, hashtags y las **redes** con su logo (`DISCO_CONTENT_NETWORKS`: Instagram post /
  historia / post compartido, TikTok, Facebook, X, YouTube y Shorts).
  · **Cronograma**: el calendario de la casa (`_agenda_calendar.html`) con un payload propio
  (`_disco_plan_agenda`) que junta el lanzamiento, las acciones, el marketing, la promoción y cada
  contenido con su hora. **Los contenidos se ARRASTRAN** para cambiarles el día (se mantiene la hora):
  ⚠️⚠️ para eso se generalizó `agenda_calendar.js` — un ítem que traiga **`move_url`** se puede
  arrastrar y **se guarda en SU endpoint** (`disco_plan_content_move`); **NO** se le pone `item_id`,
  que es lo que hace que el lateral pinte una papelera que borraría otra cosa (y el doble clic solo
  abre el pop-up de agenda si el ítem ES de agenda: `esItemAgenda`).
  · **AÑADIR UNA ACCIÓN DE MARKETING desde el plan** (ago 2026): el botón que había era un ENLACE a
  la ficha del lanzamiento y, sin lanzamiento resuelto, un `href="#"` que **no hacía nada**. Ahora se
  añade **desde aquí** con el pop-up **`#dpMarketingModal`**, que postea al MISMO endpoint que la
  sección Marketing (`promotion_create`) con el sujeto ya puesto: **es la misma campaña**, así que lo
  que se toque en un sitio se ve en el otro. El sujeto lo resuelve **`_disco_plan_marketing_subject`**
  (el lanzamiento —canción o álbum— y, mientras no exista, el **ARTISTA**), y viaja en
  `plan['subject']`.
  ⚠️ Los CAMPOS son un solo sitio: **`templates/_marketing_fields.html`** (macros `tipo`,
  `acciones`, `objetivos`, `plazos`), que usan el asistente por pasos de Marketing **y** este
  pop-up; aquí no se pregunta el artista ni qué se promociona porque los sabe el proyecto.
  ⚠️⚠️ **`{% import %}` sin `with context` NO ve los globales**: el catálogo
  `marketing_action_types` llegaba vacío a las macros y salía **una sola casilla**, sin ningún error.
  Se importa con **`with context`**.
  ⚠️ El botón se pinta solo si la persona puede crear campañas (`can_edit_promocion`, que es lo que
  exige el endpoint); si no, se le dice que lo pida en Marketing — nunca un botón que daría 403.
  ⚠️ **`promotion_create` se queda donde estabas con `back=1`**: por defecto aterriza en la ficha de
  la campaña (lo que hace el asistente de Marketing), y creándola desde el plan eso te saca de la
  pantalla. Sus caminos de error usan ya `safe_next_or` (antes redirigían al `next` en crudo).
  ⚠️ **`status_badge` de una campaña es un DICT** ({label, class}, `_promotion_badge`): pintado a pelo
  en un `class=` se imprimía el diccionario entero (un dict no vacío es «verdadero» en Jinja).
  ⚠️⚠️ **LOS POP-UPS DEL PLAN TAMBIÉN VAN EN LA PESTAÑA DE LAS TAREAS**: `_disco_plan_modals.html` se
  incluía solo en la pestaña del plan, pero **seis acciones de la lista de tareas** los abren
  (`#dpPlanReviewModal`, `#dpPlanPromoModal`, `#dpPlanNoticeModal`…) y la lista vive en «calendario»:
  esos botones **no hacían nada**. Se incluye en las dos, y el plan se calcula también ahí. Al añadir
  una acción con `modal=`, comprobar que ese pop-up se pinta en la pestaña donde está el botón.
  · **EL OK DE DIRECCIÓN NO SE PIDE CON EL PLAN A MEDIAS** (ago 2026): punto único
  **`_disco_plan_missing(estado)`** (y `plan['missing']`/`complete`/`missing_label`), que exige lo que
  ES el plan —la **estrategia**, al menos una **acción**, al menos un **contenido** y que todo lleve
  **fecha**— y **no** exige marketing ni promoción (son de otros departamentos y un lanzamiento
  pequeño puede no llevar campaña de pago). Se aplica en los TRES sitios: la pantalla (dice qué falta
  y no ofrece el botón), la **tarea del proyecto** (sale **bloqueada/rayada** con lo que falta) y el
  propio **endpoint** (`disco_plan_review` con `action=ask` lo rebota: esconder el botón no basta).
  ⚠️ En un contenido, `when_label` pone «Sin fecha» cuando no la hay: la comprobación mira el DATO
  (`publish_at`), no el texto. Y la fila de una acción lleva ya `has_date`.
  · **APROBACIÓN**: la tarea no se cierra hasta que **dirección Y el sello** dan el OK
  (`disco_plan_ok`; el de dirección solo lo puede dar dirección).
  · **RECORDATORIOS DE PUBLICACIÓN** (`disco_plan_reminders`): se activan con el plan aprobado.
  Se elige de **qué publicaciones** (todas marcadas por defecto; desmarcar deja el contenido en el
  plan pero sin aviso), **a quién** —el ARTISTA por su canal nuevo **CONTENIDOS**, sus integrantes, los
  **colaboradores**, quien lleve **digital** (departamento «Redes sociales») y correos a mano—, por
  **correo, SMS o los dos**, y con **cuánta antelación** (10 minutos por defecto). Al activarlos sale
  el correo del **Cronograma de publicaciones** (con el nombre y la foto del **jefe de producto** para
  decirle que no quiere recibirlos) y el cron manda el aviso de cada publicación
  (`_disco_plan_reminder_sweep`, `/cron/publicaciones`).
  ⚠️ **Solo se avisa de lo que está SUBIDO y activo**: de lo que no se puede publicar no se avisa. Y
  **una vez** por contenido (`reminder_at`); si se le cambia el día o la hora, ese sello se borra y el
  aviso se vuelve a programar sobre lo de AHORA. Un contenido **eliminado no se notifica**.
  · **El cronograma online** (`public_disco_plan`, `/cronograma/<token>`) es lo que ve quien recibe los
  avisos: a la izquierda las publicaciones con su hora, su copy, sus menciones y sus hashtags —que se
  **copian con un clic**— y a la derecha el calendario; cada contenido se abre a tamaño y se descarga.
  Siempre **al día**: se pinta con lo que hay en ese momento.

- ⚠️⚠️ **EL PLAN EN LA FICHA DEL SINGLE Y DEL ÁLBUM · el mismo plan, con los MATERIALES dentro**
  (sep 2026, lo pidió Dani: «que los cambios de un sitio afecten a los otros»). Pestaña **«Plan de
  lanzamiento»** en la canción y en el álbum (`lanzamiento` en `SONG_DETAIL_TABS` y
  `ALBUM_DETAIL_TABS`; se pinta con el recurso `discografica.proyectos`, que es el de los endpoints).
  · ⚠️⚠️ **NO HAY DOS PLANES**: enseña el `DiscoReleasePlan` de **SU PROYECTO**
  (`_release_plan_project`: la canción por `release_song_id`, y si no tiene, el proyecto de un
  ÁLBUM que la incluye —y lo dice—; el álbum por `album_id`; entre varios gana el que no es solo de
  videoclip, luego el activo, luego el más reciente).
  · **UN SOLO PARCIAL**: `_disco_plan_panel.html` lo pintan las TRES fichas; el contexto lo reúne
  **`_disco_plan_view_context`** y la pestaña de la ficha es `_release_plan_tab.html` (lo pasa con un
  `{% with %}`, así no choca con las variables de la ficha). Todo postea a los `disco_plan_*` de
  siempre, que vuelven con `next` — ⚠️ también en los caminos de ERROR, que antes mandaban al proyecto.
  · **MATERIALES DEL LANZAMIENTO** es una sección nueva del plan: en la canción y en el álbum es **el
  MISMO parcial de su pestaña «Materiales»** (`_song_materials_panel.html` /
  `_album_materials_panel.html`, vía `plan_materials_template`); en el proyecto, lo mismo que su
  pestaña «Materiales» (`_disco_release_materials.html`: el estado y el camino a la ficha, que es
  donde se suben). ⚠️ Los endpoints de materiales vuelven a donde se estaba con
  **`_materials_return_tab()`** (mira solo el `tab` del referer; la URL la compone el servidor): sin
  eso, subir desde el plan te sacaba a «Materiales».
  · **SIN PROYECTO**: botón «Empezar su plan de lanzamiento» (`disco_plan_release_start`), que monta
  un proyecto **sobre el lanzamiento que ya existe** (no crea otra canción ni otro disco, ni lo marca
  provisional; en un álbum sus temas entran como `is_existing`). El plan vive en el proyecto (su
  bolsa, sus encargos, su aprobación), por eso no se inventa un plan suelto. Doble clic no duplica.

- **CONTENIDO EXPLÍCITO · hay que decirlo en TODAS las canciones** (ago 2026). `Song.is_explicit`
  pasa a **TRES estados**: True · False · **NULL = sin decidir**, que **no es «no explícita»**.
  ⚠️ El `ensure_*` hace el ALTER una sola vez (quita el NOT NULL y el default) y pone a **NULL** las
  que estaban a `false`: nunca se declararon, así que quedan por decidir; las marcadas explícitas se
  conservan.
  · Puntos únicos: **`_song_is_explicit`** (¿lo es?, para lo que se ENSEÑA) ·
  **`_song_explicit_decided`** (¿ya se ha dicho?) · **`_explicit_from_form`** (lo que llega del
  formulario → True/False/None; lo que no diga nada **no borra** una decisión tomada) ·
  `EXPLICIT_CHOICES` (las dos respuestas) y `EXPLICIT_LABEL` (el texto de la etiqueta).
  · **Es OBLIGATORIO al crear**: el alta de una canción y el asistente de PROYECTO discográfico lo
  piden, y **el servidor lo vuelve a exigir** (esconder el campo no basta). En el proyecto se aplica
  a todas las canciones del lanzamiento (el dato es de la canción). En la **ficha** se marca (o se
  cambia) en Información, con el aviso «Sin decidir» mientras no se diga
  (`discografica_song_explicit_save`).
  · **La ETIQUETA solo se pinta cuando ES explícita**, y es un global: **`explicit_badge()`**
  (`.badge-explicit`), igual en la cabecera de la canción y en el repertorio. En **SYNCROS** va
  **DETRÁS de las etiquetas de género** y de **otro color** (gris oscuro, para que no parezca un
  género más): en la fila (`_sync_song_row.html`) y en el contenido único de la ficha —que es el
  MISMO en la pantalla, el correo y el enlace (`_sync_pitch_html`)—. En el **Label Copy** sale como
  una fila más («Contenido: Explícito»), y solo si lo es.
  ⚠️ En la edición EN BLOQUE se compara con **`is not`**, no con `bool(...)`: `bool(None)` es False,
  así que marcar «No explícita» en bloque no cambiaba nada en las que estaban sin decidir.

- ⚠️⚠️ **EL LABEL COPY ES UN SOLO CONTENIDO: PDF, ENLACE Y CORREO DICEN LO MISMO** (ago 2026,
  rediseño). `_label_copy_context` reúne los datos y **`_label_copy_html`** los pinta con estilos en
  línea; de ahí beben **el enlace público** (`public_song_label_copy_view` → `lc_html`) y el
  **correo**, y el **PDF** (ReportLab) dibuja lo mismo en el mismo orden. Si hay que cambiar algo del
  LC, se cambia en esos dos sitios y sale igual en los tres.
  · **Maqueta**: logo de PIES arriba a la **derecha** · «Label Copy» centrado · la **portada** con el
  título, los intérpretes y los **enlaces de plataforma**, y a la **derecha, a su altura, las
  CERTIFICACIONES** · la tabla de datos · el **reparto autoral**.
  · ⚠️ **CABE SIEMPRE EN UNA SOLA PÁGINA A4**: todo el documento va dentro de un **`KeepInFrame`**
  (`mode='shrink'`) que lo encoge si hace falta —probado con 12 ISRC, 14 músicos y 12 autores—. Sin
  eso se desbordaba a una segunda página que salía **sin logo, sin cabeceras de tabla y sin
  numeración**. Vale igual para el LC del ÁLBUM.
  ⚠️ Al encoger, las tablas se **centran** en el marco y un `Paragraph` suelto se queda a la
  izquierda descolocado: los títulos de sección van en una caja del mismo ancho
  (**`_lc_pdf_text_block`**).
  · **EL REPARTO EDITORIAL va DENTRO de la celda del %** de cada autor nuestro, debajo del número y
  en dos etiquetas pequeñas, **sin cambiarle el tamaño al porcentaje**. Ya no hay tabla aparte.
  Se pide con `editorial=True` (el LC que se comparte normalmente NO lo lleva).
  · **LOS AUTORES SE ORDENAN DEL QUE MÁS % TIENE AL QUE MENOS** y, a igualdad, **alfabéticamente**:
  punto único **`_editorial_shares_sorted`**, aplicado en TODOS los sitios (la pestaña Editorial, el
  LC, el aviso de SGAE, la letra, Syncros y el precumplimentado de la entrega de masters). Se ordena
  en Python porque el nombre lo compone `_promoter_display_name`, no es una columna.
  · **EL CORREO SE VE ANTES DE MANDARLO**: el pop-up es de dos columnas —a quién y la nota a la
  izquierda, la **VISTA PREVIA** a la derecha— como el de la valoración de una demo. La compone el
  servidor (`discografica_song_label_copy_preview` / `..._album_...`) con el MISMO
  `_label_copy_html` que se manda, así que no hay una segunda versión que se pueda desparejar; se
  refresca al escribir la nota y enseña el asunto.
  · **LOS ENLACES DE PLATAFORMA van a la IZQUIERDA**, pegados a la portada y **debajo de los
  intérpretes**, igual en los cinco sitios: la ficha de la CANCIÓN, la ficha del ÁLBUM, el PDF, el
  enlace y el correo. Antes en las dos fichas estaban arriba a la derecha (`ficha-hero__actions`).
  · ⚠️⚠️ **EN EL PDF, `(-1,0)` ES LA ÚLTIMA COLUMNA… Y LA ÚLTIMA CAMBIA** (bug real, sep 2026): la
  cabecera tiene TRES columnas cuando hay certificaciones (portada · datos · certificaciones) y DOS
  cuando no. El `('ALIGN', (-1,0), (-1,0), 'RIGHT')` que alineaba las certificaciones a la derecha
  alineaba, en las canciones SIN certificaciones —o sea, casi todas—, **la columna del título y los
  ENLACES**: los iconos se iban a la mitad derecha de la hoja. Ahora el ALIGN se pone con el índice
  EXPLÍCITO (`(2,0)`) y solo cuando esa columna existe.
  ⚠️ Un `(-1,…)` en una tabla cuyo número de columnas depende de los datos es siempre sospechoso.

  · ⚠️ **EN MÓVIL SE MANTIENE LA COMPOSICIÓN**: la cabecera son DOS bloques dentro de una tabla
  exterior (`.lc-top`) —la ficha (portada + título, intérpretes y plataformas) y las
  certificaciones—, así que en una pantalla estrecha solo se apilan ESOS DOS y la ficha conserva la
  portada a la izquierda con los datos al lado. Apilando las celdas de una sola tabla se centraba
  todo y la portada quedaba suelta encima (bug real).
  ⚠️⚠️ La media query apila **solo las celdas DIRECTAS** (`.lc-top>tbody>tr>td`): con `.lc-top td` a
  secas se apilaban también las de las tablas de dentro —la portada saltaba encima del título y las
  certificaciones caían en columna—.

  · ⚠️⚠️ **UN PDF QUE SE GENERA AL VUELO NO SE CACHEA** (`_pdf_al_vuelo_response`, sep 2026): la URL
  de un LC es SIEMPRE la misma (el mismo id, el mismo token), así que el navegador —o el visor de PDF
  del cliente de correo— devolvía **la copia que se bajó la última vez**, con la maqueta ANTIGUA,
  aunque el servidor ya generara la nueva. Parecía «que algunos botones descargan otra versión».
  Los seis endpoints de PDF que se componen en el momento (los cuatro del LC, la letra y el pitch)
  responden con `Cache-Control: no-store`.
  ⚠️ Comprobado que los cuatro caminos del LC (interno y público, normal y editorial) generan
  EXACTAMENTE el mismo documento: mismo texto y mismos enlaces; lo único que cambia es el reparto.
  (El PDF no se puede comparar byte a byte: ReportLab le mete la fecha de creación.)
  · **El PDF con REPARTO EDITORIAL exige la pestaña Editorial**, igual que el correo: el
  `?editorial=1` viaja en la URL, así que esconder el botón no basta.
  · **La línea del TOTAL del reparto autoral va en el AZUL corporativo clarito** (fondo `#e8f4f9`,
  texto `#07607e`), no en el naranja de los avisos. ⚠️ En el PDF, el color hay que ponerlo en el
  ESTILO del `Paragraph` (`total_style`): un `TEXTCOLOR` en la celda no gana al color del párrafo.
  · **COMPARTIR es un solo menú** (`templates/_label_copy_share.html`, macro `lc_share`), usado en la
  barra de la ficha, en los DOS botones del final de la pestaña Editorial y en la ficha del ÁLBUM:
  Descargar en PDF · WhatsApp · Correo · SMS · Copiar enlace.
  ⚠️ Lo que se comparte es la **PÁGINA pública** (la que se previsualiza), no el PDF: antes WhatsApp
  y SMS mandaban el PDF adjunto, que no enseña nada.
  ⚠️ Los datos van en **`data-*`** y el clic se engancha por delegación: un `onclick` con el título
  dentro de comillas se rompe en cuanto la canción lleva un apóstrofo.
  · **EL CORREO LO COMPONE EL SERVIDOR** (`discografica_song_label_copy_email` /
  `discografica_album_label_copy_email`, modal `#lcEmailModal`): el cuerpo es el mismo contenido que
  el PDF, con el botón **«Descargar en PDF» abajo a la derecha** y el **PDF adjunto**. Antes era un
  `mailto:` del navegador: sin diseño, sin logo, sin adjunto y sin saber si llegaba.
  · **EL ASUNTO** es «**Label Copy · \<canción\>, \<artista o intérpretes\>**» (punto único
  `_label_copy_subject`, en el contexto como `lc_share_subject`): antes estaba escrito a mano en tres
  plantillas y no decía de quién era.
  · **PREVISUALIZACIÓN del enlace** (`public_song_label_copy_og_image` /
  `public_album_label_copy_og_image`, token en la QUERY STRING como el de Syncros): la **portada** y,
  si no hay, la **foto del artista**; en el subtítulo, el artista y los intérpretes separados por
  comas. Antes no había ninguna `og:` y al compartirlo salía un enlace pelado.

- ⚠️ **LA CALIFICACIÓN DE CONTENIDO es un campo del LABEL COPY** (ago 2026,
  `CONTENT_RATING_FIELD_LABEL`): va **debajo de Copyright**, dice las DOS cosas —«Explícito» o «No
  explícito»— y sale también en el PDF y en lo que se comparte. **Fuera del LC y de la ficha la
  etiqueta solo se pinta cuando ES explícita** (cabeceras, listados, Syncros).
  · **LO QUE FALTA POR CUMPLIMENTAR se avisa ARRIBA de la ficha** (`_song_missing_required`), con el
  botón para resolverlo ahí mismo: la calificación de contenido se marca sin salir, el género y el
  pitch llevan a su sitio. Es el patrón que ya tenía «¿contenido explícito?», ahora para todos los
  campos obligatorios — al entrar se ve lo que falta en vez de tener que buscarlo.

- ⚠️⚠️ **DISCOGRÁFICA · CUADRO DE MANDO DE PREVISIONES** (sep 2026, pestaña **«Previsiones»**,
  `?section=previsiones`). **Una sola pantalla para PLANIFICAR**: el calendario de lanzamientos de
  todos los artistas, la raya de lo último que entró en cada emisora, lo que se ponga de su agenda
  y las presentaciones a radio ya programadas.
  ⚠️⚠️ **NO HAY DOS VERDADES**: el focus vive en la CANCIÓN, las tocadas en `Play`, las
  presentaciones en `SongRadioPitch` y las actividades en la agenda de siempre — aquí solo se MIRAN
  juntas y se DECIDE, y cada cosa se guarda donde vive.
  · **QUÉ ES CADA LANZAMIENTO**: **FOCUS SINGLE** (lo que ya existía) o **CONTINUIDAD** —el que
  mantiene la presencia entre focus— (`Song.is_continuity` + `_at`/`_by`, columnas nuevas). Punto
  único **`_song_release_kind(song)`**: el **focus MANDA** y las dos son **`NULL` = sin decidir**,
  que no es «no». Se marca pinchando el hito del calendario (`forecast_song_kind`), y marcar una
  quita la otra: un tema no es las dos cosas.
  · ⚠️⚠️ **EL CALENDARIO VA POR SEMANAS, NO POR DÍAS** (rediseño sep 2026): una fila por ARTISTA
  (con su foto y su color) y **UNA COLUMNA POR SEMANA** (8 · 16 · 26 · 52, con el mes y la semana de
  hoy marcados), y **en la celda de cada semana va LO QUE ESE ARTISTA TIENE ESA SEMANA**: sus
  **lanzamientos** (portada, la marca de focus/continuidad, cuántas emisoras lo llevan y el rayado
  si es provisional) y las **actividades que se hayan PUESTO** (ver más abajo: la agenda de este
  cuadro solo enseña lo que se añade).
  Un **PERIODO DE PROMOCIÓN** es una **barra que ocupa las columnas de las semanas que dura**
  (`grid-column: inicio / span N`), en su **carril** para que dos que se solapan no se pisen.
  ⚠️⚠️ Antes la rejilla era semanal pero el contenido se posicionaba **por día** en una capa
  absoluta (`left:%`): con dos lanzamientos en la misma semana los hitos **se pisaban** y las
  franjas los tapaban. Los DOS puntos únicos de «en qué columna va esto» son **`semanaDe(iso)`** y
  **`tramoSemanas(desde, hasta)`** (que recorta a la ventana), y comparan las fechas **en ISO como
  TEXTO**: así no entra ningún huso horario por medio.
  ⚠️ **Los LANZAMIENTOS no se repiten como referencia de agenda** (`_forecast_agenda` se salta el
  kind `lanzamiento`): ya se pintan como el hito de su semana, y verlos dos veces en la misma celda
  es ruido.
  ⚠️ El **nombre del lanzamiento** solo se pinta cuando la columna da para leerlo (`.is-wide`, con
  **8 semanas o menos**); en las demás vistas lo dice el tooltip.
  ⚠️ **Doble clic en una celda = periodo de promoción ESA SEMANA** (de lunes a domingo), no del día
  por el que se pinchó: este cuadro no va por días.
  ⚠️ **Con 40 artistas no cabe en una pantalla**: se pintan **solo los que tienen algo** en el
  periodo (con un artista elegido se ve siempre, que es donde se planifica) y se dice cuántos se han
  quedado fuera; cada artista se distingue por su **franja alterna**, que abarca sus periodos y sus
  celdas. Cada módulo se **desliza por dentro** (topes de altura), que es lo que hace que un cuadro
  de mando se lea de un vistazo en vez de ser una página infinita.
  ⚠️ Con muchas semanas el calendario **se desliza** en vez de estrujar las columnas
  (`min-width: max(44rem, calc(10rem + var(--n) * 2.1rem))`, con `--n` = cuántas semanas hay); con
  pocas, se estiran para llenar el hueco. Comprobado a 375 px: la PÁGINA no se desliza.
  · **PERIODOS DE PROMOCIÓN** (`DiscoPromoWindow`, tabla nueva; `forecast_window_save` /
  `_delete`): artista · desde/hasta · qué es (`DISCO_PROMO_WINDOW_KINDS`: promoción · gira de radio
  · gira · otro, cada uno con su icono y su color) · y **el lanzamiento al que va atado**, y
  entonces **el nombre se compone solo** («Gira de radio · Focus») y se ve a qué está vinculado.
  **Doble clic en la fila de un artista** = franja desde ese día (el gesto del calendario de la
  casa). Las fechas del revés **se ordenan solas**.
  · **DESCARTAR una canción de radio** (`Song.radio_dropped_at`/`_by`, `forecast_song_radio_drop`):
  se deja de trabajar en radio y **se deshace**. Se hace en el **pop-up del lanzamiento** (antes
  estaba en el módulo «Suena ahora en radio», que se retiró). ⚠️ **No borra ninguna tocada**: lo que
  sonó, sonó.
  · **PRESENTACIONES A RADIO** (el ÚNICO módulo de abajo): `SongRadioPitch` agrupado **por emisora o
  por artista** (el mismo dato mirado desde los dos sitios), con la fecha de entrada en rotación y
  su estado. Y desde el cuadro se puede decir **a qué emisoras va** un tema
  (`forecast_song_radio_plan`): es la MISMA presentación del proyecto, así que sale en su ficha y en
  su plan de lanzamiento.
  ⚠️⚠️ **Solo se puede QUITAR lo que la emisora todavía no ha contestado**: un «sí entra» o un «no»
  es información y no se borra desde un cuadro de mando.
  ⚠️⚠️ **YA NO HAY DOS CONCEPTOS DE EMISORA** (sep 2026): la emisora es **el MEDIO de tipo Radio** y
  de él cuelgan tanto las TOCADAS (`Play.media_id`) como las PRESENTACIONES. Antes eran dos bases
  distintas (`RadioStation` y los `MediaOutlet`) y no se podían cruzar: por eso no se sabía si lo
  presentado había llegado a sonar. Ver `docs/app/promocion-prensa.md`.
  · **TODO SIN RECARGAR**: al cambiar de artista, de semana o de periodo se vuelve a pedir el cuadro
  entero por **`forecast_data`** (`/discografica/previsiones/datos`) y se repinta, así no se pierde
  por dónde se iba. Motor **`_forecast_context`** (una sola pasada) + `static/js/disco_forecast.js`
  + `templates/_disco_forecast.html`, estilos `.fc-*`.
  ⚠️ **Es CARO** (lanzamientos, tocadas, agenda y presentaciones): se calcula **solo en su pestaña**,
  como el cuadro de mando de dirección.
  ⚠️ Recurso propio **`discografica.previsiones`** en CURATED y los endpoints `forecast_*` mapeados
  en los **DOS** mapeos (no llevan ningún prefijo ya cubierto).
  ⚠️ **`_resolve_song_cover_url(session_db, song)` NO devuelve la URL**: RECALCULA `Song.cover_url`.
  Para pintar una portada se lee la columna y se cae a la de «sin portada» (`_forecast_cover`); y
  **`DEFAULT_COVER_URL` es un global de PLANTILLA**, no una variable de módulo.
  ⚠️ **`can_edit_discografica()` no es un global de plantilla**: en la plantilla es
  **`CAN_EDIT_DISCOGRAFICA`** (un `{% if can_edit_discografica() %}` revienta la página).
  Probado con la app real y en el navegador: el calendario con sus 16 semanas y sus hitos, marcar
  focus/continuidad, crear una franja con doble clic, descartar de radio (sin perder las tocadas),
  las presentaciones por emisora y por artista y el filtro por artista; y a 375 px, sin desbordes y
  con el calendario deslizándose por dentro.

- ⚠️⚠️ **PREVISIONES · LA AGENDA SOLO ENSEÑA LO QUE SE PONE, y las emisoras van con SU color**
  (sep 2026, lo pidió Dani). Cuatro cosas:
  · ⚠️⚠️ **LA AGENDA NO SE VUELCA ENTERA**: antes salía TODO lo que el artista tuviera esos días
  «como referencia» y el cuadro se llenaba de ruido. Ahora **solo sale lo que se ha ARRASTRADO Y
  AÑADIDO** desde la paleta «Agenda», y **lo mismo en el detalle de abajo**. Las claves puestas van
  en el ajuste **`forecast_agenda_v1`** (`_forecast_agenda_keys` / `_forecast_agenda_save`), que es
  del CUADRO —como lo quitado—, y el endpoint es **`forecast_agenda_add`**.
  ⚠️ **Quitar una actividad con la ✕ es DESAÑADIRLA**, no ocultarla (`forecast_hide` trata aparte
  las claves `AG:`): si se apuntara como «oculta» saldría en «Quitados» sin estar puesta. Y al
  añadir se limpia esa clave de lo oculto, porque una actividad que se quitó cuando la agenda salía
  entera volvería a esconderse nada más ponerla.
  ⚠️ Sin nada añadido, `_forecast_agenda` **ni llama a `_agenda_build`**. Y en «¿Cuál?» lo que ya
  está puesto sale como **«ya está»** y no se puede añadir dos veces.
  · **UN CONCIERTO Y UN FESTIVAL LLEVAN EL MISMO ICONO: un MICRÓFONO** (`FORECAST_AGENDA_ICONS`,
  `fa-microphone-lines`). Es solo cómo se ven AQUÍ: en la agenda de la casa cada tipo conserva el
  suyo (`AGENDA_KIND_META`).
  · ⚠️⚠️ **EL LOGO DE UNA EMISORA NO SE RECORTA**: un logo es apaisado y metido en un círculo con
  `object-fit:cover` se le comían los lados. Va ENTERO (`contain`) sobre blanco en los tres sitios
  (el filtro, la raya del calendario y la cabecera de las presentaciones).
  · **Y LA RAYA DE CADA EMISORA VA CON EL COLOR DE SU LOGO EN CLARITO** (`--c` +
  `color-mix`), que es lo que la identifica de un vistazo. El color lo saca **`_logo_main_color`**
  (Pillow: descarta el blanco del fondo y se queda con el color con más presencia que de verdad sea
  un color; si el logo es blanco y negro, el negro) y **se guarda en la emisora**
  (`RadioStation.logo_color` + `logo_color_src`, que es la URL con la que se calculó: al cambiar el
  logo se vuelve a sacar).
  ⚠️⚠️ **NO se calcula al pintar el cuadro**: hay que BAJARSE el logo, y diez descargas dejarían la
  pantalla esperando. Lo pide la pantalla **aparte** (`forecast_station_colors`, con **tope de
  tiempo** `FORECAST_COLOR_BUDGET`), se guarda y en las siguientes cargas ya viene en el payload.
  Un logo que no dé color se apunta igual (`logo_color_src`) para no reintentarlo en cada carga.
  ⚠️ Los valores sólidos van DELANTE del `color-mix` en el CSS: un navegador que no lo entienda se
  queda con el azul de siempre.
  · **DE LOS TRES MÓDULOS DE ABAJO QUEDA UNO**: «Presentaciones a radio». «Suena ahora en radio» y
  «La última que entró en cada emisora» se retiraron (lo que suena ya se ve en la RAYA de cada
  emisora del calendario), y con ellos `_forecast_radio_now`, `_forecast_last_entries`,
  `FORECAST_STALE_DAYS` y la navegación por semanas (`week_*`, el parámetro `fw`).
  · ⚠️⚠️ **A QUÉ EMISORAS VA UN TEMA SE CONFIGURA EN SU POP-UP, sin ir a la ficha** (era un enlace
  a su ficha): **doble clic** en el lanzamiento del calendario —lo dice su tooltip— y ahí se marcan
  las emisoras (con su logo), se pone cuándo entra y se guarda. Son las **mismas** presentaciones
  (`SongRadioPitch`), así que salen en su proyecto, en su ficha y en su plan de lanzamiento.
  ⚠️ Lo que la emisora **ya ha contestado** sale FIJO (no se puede quitar desde un cuadro de mando)
  y el servidor lo vuelve a comprobar. Las emisoras son los **`MediaOutlet` de tipo Radio**
  (`radio_media` del contexto), no las `RadioStation` de las tocadas.
  Probado con la app real y en el navegador: la agenda vacía hasta que se añade, el micrófono en
  concierto y festival, quitar y volver a poner, los logos sin recortar (24×20 `contain`), la raya
  con el color de cada emisora guardado en su ficha, marcar y desmarcar emisoras (y que una
  «Entra» no se pueda quitar) y el informe (página y PDF) intactos.

- **PREVISIONES · EL DETALLE POR ARTISTA** (sep 2026, debajo del calendario): el cuadro de mando de
  lo que se está viendo — una **columna por artista** y, dentro, sus hitos agrupados por **MES** y
  por **SEMANA**, cada uno con la **hoja de calendario de las hojas de ruta** (`.rm-cal`: día de la
  semana, día y mes), el **icono y el nombre de QUÉ es** («Single · Focus single», «Gira de radio»,
  «Conciertos») y **debajo el nombre** de lo que sea (o el municipio), enlazado a su ficha.
  ⚠️⚠️ **Lo calcula el SERVIDOR** (`_forecast_detail`) sobre los datos YA cargados (ni una consulta
  más) y **DESPUÉS de quitar lo oculto**: es lo mismo que lleva el informe, así que la pantalla y lo
  que se comparte no pueden desparejarse.
  ⚠️ Punto único **`_forecast_item_name(artista, title, sub)`**: en la fila de un artista **repetir
  su nombre no dice nada**, así que cuando lo único que la agenda sabe de una actividad es eso —ni
  festival ni municipio, que es el último recurso de `_agenda_build`— manda **el sitio**, y si
  tampoco hay se deja vacío y habla la etiqueta de qué es. Lo usan el detalle y el informe.
  ⚠️⚠️ Los hitos **no enlazaban a su ficha**: `_safe_url_for` apuntaba a `song_detail_view` y
  `album_detail_view`, **que no existen** (son **`discografica_song_detail`** con `song_id` y
  **`discografica_album_detail`** con `album_id`), así que devolvía `""` **en silencio**.
  Comprobación de una línea: recorrer los `_safe_url_for("...")` de `app.py` y comprobar que el
  nombre está en `app.url_map` — hoy no queda ninguno roto.

- ⚠️⚠️ **PREVISIONES · EL INFORME: se descarga, se imprime y se comparte, y su enlace está EN VIVO**
  (sep 2026). Botón **«Informe»** en la barra del cuadro → pop-up con **Descargar en PDF ·
  Imprimir · Copiar enlace · WhatsApp · SMS** y, debajo, **el correo con su vista previa**.
  · ⚠️⚠️ **EL CONTENIDO ES UNO SOLO**: **`_forecast_report_html`** (con `<table>` y estilos EN LÍNEA
  porque esto se manda por correo: ahí no hay hojas externas, ni rejillas CSS, ni `position`), y de
  él salen **el correo, la página del enlace y la vista previa**. Orden: **logo de PIES arriba a la
  derecha · «Previsiones» y el periodo centrados · el CRONOGRAMA** de los artistas seleccionados con
  lo que se ve **· el detalle por artista, cada uno en su columna** (de cuatro en cuatro: con siete
  en la misma fila cada columna se queda en 160 px y no se lee).
  · **EL TÍTULO es el periodo**: punto único **`_forecast_period_label`** → «Previsiones **del 24 de
  agosto de 2026 al 13 de diciembre de 2026**», que es también el asunto del correo y el nombre del
  PDF.
  · ⚠️⚠️ **NO ES UNA COPIA CONGELADA**: **`DiscoForecastReport`** guarda **solo la CONFIGURACIÓN**
  (qué artistas, desde cuándo y cuántas semanas) y los datos **se vuelven a calcular en cada
  visita** — el enlace enseña siempre lo que hay ahora (lo pidió así Dani: «una versión en vivo»).
  Compartir dos veces **lo mismo REUTILIZA el enlace** (`signature`, la huella de la configuración).
  ⚠️ El token es **OPACO** y **se crea con COMMIT**: un enlace compartido hace dos años tiene que
  seguir valiendo (un token firmado a un año ya dio un bug real).
  ⚠️⚠️ **La configuración vive en el SERVIDOR, no en la URL**: la página es PÚBLICA, así que con los
  artistas en la query string cualquiera podría cambiarlos y ver los de otro.
  ⚠️ **Lo que se ha QUITADO del calendario tampoco sale en el informe** (lo filtra el servidor antes
  de componerlo, `_forecast_apply_hidden`).
  · **`_forecast_context` gana `only_ids`** (deja solo esos artistas, respetando el ORDEN y el COLOR
  del cuadro) y **`solo_calendario`** (se salta las tocadas, la última entrada y las presentaciones,
  que el informe no lleva: son varias consultas).
  · **IMPRIMIR** abre la página del informe con **`?print=1`** (se imprime sola, y su hoja de estilo
  de impresión quita los botones): imprimir desde la app sacaría el back office entero.
  · **EL PDF** (`_build_forecast_report_pdf_bytes`) va **apaisado**, con el logo de PIES arriba a la
  derecha en todas las páginas, el título centrado con el periodo y las páginas **x/x**, y se sirve
  con **`_pdf_al_vuelo_response`** (`no-store`: se compone en el momento). ⚠️ Ahí el detalle va **un
  artista debajo de otro**: en una hoja, siete columnas de 3,5 cm no se leen — las columnas una al
  lado de otra son de la página y del correo, donde hay ancho de sobra y se puede deslizar.
  ⚠️⚠️ **El `min-width` va en la TABLA del cronograma, no en las celdas**: con `table-layout:fixed`
  el de una celda **no se respeta** (las columnas se reparten el ancho de la tabla) y con 52 semanas
  se quedaban en 12 px.
  ⚠️⚠️ **Una franja de UNA semana es una columna de 40 px**: sin `white-space:nowrap` +
  `overflow:hidden` su texto se parte **letra a letra en vertical** (visto en pantalla).
  ⚠️⚠️ **`min-width:0` en las columnas del pop-up** (`.fc-rep__side`/`.fc-rep__prev`): un hijo de una
  rejilla **no baja de su contenido**, así que el cronograma ensanchaba el pop-up entero en vez de
  deslizarse el papel — la trampa de siempre.
  ⚠️ Dentro de la app la tabla del cronograma la envuelve sola la red de seguridad de móvil
  (`.table-responsive` que pone `scripts.js`); fuera, la landing la desliza con su `overflow-x:auto`
  y un cliente de correo la encoge.
  ⚠️ La **miniatura** del enlace es el **logo de PIES entero sobre blanco** (un informe no tiene
  portada) y los tres endpoints públicos (`public_forecast_report`, `_pdf`, `_og_image`) van en las
  **cuatro** listas (`allowed` ×2, `PUBLIC_ENDPOINTS_EXTRA` y `_CSRF_EXEMPT_ENDPOINTS`).
  ⚠️ Los endpoints de dentro se llaman **`forecast_report_*`**, así que ya caen en
  `discografica.previsiones` por el prefijo `forecast_`.
  Probado con la app real (32 comprobaciones) y en el navegador: el enlace se reutiliza con la misma
  configuración y cambia con otra, la página abre **sin sesión** y enseña lo de AHORA, el PDF (6
  páginas, con su logo) y la miniatura, el correo con su asunto, su nota y su botón, **solo** los
  artistas compartidos, lo quitado fuera, los permisos (403 sin acceso, pero el enlace público
  sigue abriéndose) y, a 375 px, sin desbordes ni texto partido.

- **PREVISIONES · lo que se ve en el calendario y cómo se crea un proyecto desde él** (sep 2026):
  · ⚠️⚠️ **EL DÍA DE CADA COLUMNA ES EL VIERNES** (`FORECAST_RELEASE_WEEKDAY` = 4, punto único): los
  lanzamientos se hacen en viernes, así que es la fecha que se busca al mirar una semana. El MES de
  la columna es también el del viernes (si no, una semana a caballo enseñaría el día de octubre bajo
  el rótulo de septiembre). De esa constante salen **los tres sitios**: la etiqueta de la columna, la
  fecha de un proyecto creado arrastrando y la fecha a la que se mueve un lanzamiento.
  · ⚠️⚠️ **ARRASTRAR UN LANZAMIENTO LO LLEVA AL VIERNES** de la semana de destino (antes conservaba
  su día). Se escribe **en su ficha** —y en el PROYECTO si lo está preparando, que es quien manda
  sobre la fecha—, así que la fecha es UNA sola y no hay nada que cuadrar después. Una PROMOCIÓN o
  un periodo **conservan su día** (pueden empezar cualquier día).
  · **UN PROYECTO NUEVO SE CREA EN EL PROPIO CALENDARIO** (`forecast_project_create`): al arrastrar
  «Proyecto discográfico» y elegir «Crear uno nuevo» se pide **solo el nombre y si es FOCUS o de
  CONTINUIDAD** (el artista ya se sabe: es la fila donde se ha soltado) y nace en el **VIERNES** de
  esa semana. Lo crea `_disco_project_create_release`, el MISMO punto único que el asistente, así que
  su canción provisional entra en el repertorio igual. Es un **SINGLE**: para un álbum o un EP está
  el asistente completo (hay un enlace en el propio paso).
  ⚠️ Lo que se está haciendo ahí es PLANIFICAR: el resto (los temas, el soporte, la colaboración) se
  rellena luego en la ficha del proyecto, que es donde se trabaja.
  · ⚠️ **UNA COLABORACIÓN EXTERNA SE VE COMO TAL**: marco **discontinuo grueso morado** y su icono
  (`DISCO_COLLAB_META`, `fa-handshake`), con su entrada en la leyenda. **No es un planteamiento que
  se elija** (es `is_external_collab`, un dato de la ficha: el máster es de otra compañía), por eso va
  APARTE de `DISCO_RELEASE_KINDS` —que es lo que se marca en el selector— pero se distingue igual de
  bien que un focus, que es lo que se pidió.
  · **UN ÁLBUM SE DISTINGUE DE UN SINGLE**: en el calendario va **redondo** (`is-album`) y, sobre
  todo, **su imagen de «SIN PORTADA» es OTRA** — la FUNDA con el disco asomando
  (`cover_placeholder_album.svg/.png`) frente al disco suelto del single. Punto único
  **`_cover_placeholder(kind, png=)`** + los globales `DEFAULT_ALBUM_COVER_URL` /
  `cover_placeholder('ALBUM')`, ya aplicado en Previsiones, en el listado de **Lanzamientos** (que
  mezcla discos y singles), en el repertorio y en la ficha del álbum.
  ⚠️ Lleva **respaldo a mano** (`"/static/" + nombre`): `url_for` revienta fuera de una petición y
  devolver "" dejaría el hueco vacío justo donde se quiere ver que no hay portada.

