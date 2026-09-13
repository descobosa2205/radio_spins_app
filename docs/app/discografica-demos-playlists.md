# Discográfica · demos, playlists y reproductor

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- MATERIALES DE CANCIÓN · etiqueta de audio y VIDEOCLIP
- PROYECTO DISCOGRÁFICO · LAS TAREAS DE AUDIO VAN POR PASOS. Cuando el proyecto lleva
- PROYECTO · SUBIR DEMO y la PORTADA, paso a paso
- DISCOGRÁFICA · DEMOS: las maquetas que se están valorando, en su propia sección
- DEMOS · VALORACIÓN del sello
- DEMOS · los artistas, en GALLETAS: la agrupación por artista de la sección Demos
- DEMOS · cómo se lee una maqueta en el listado
- DEMOS · se ven y funcionan como las canciones de una PLAYLIST. La fila es
- PLAYLIST DE SELECCIÓN / VALORACIÓN: una playlist normal se manda para ESCUCHARLA;
- UNA PLAYLIST DE SELECCIÓN SE EDITA DESPUÉS DE MANDARLA, Y LO YA VOTADO SE CONSERVA
- LOS BOTONES DEL DISPOSITIVO: pasar de canción desde el iPhone, CarPlay o los AirPods
- PLAYLIST · LA PLAYLIST A LA IZQUIERDA Y EL BUSCADOR A LA DERECHA. Al elegir temas,
- PLAYLIST DE VALORACIÓN · DOS PESTAÑAS
- VOTAR · «La elijo» / «Descartar» se leen de un vistazo
- EL CORREO DE UNA VALORACIÓN lleva las PORTADAS y el ARTISTA con su foto
- LO QUE SE DESCARGA LLEVA PUESTO DE QUIÉN ES. Una canción o una maqueta que sale
- UN CLIC EN UN CONTROL DE LA FILA NO REPRODUCE NI PARA NADA (bug real, ago 2026). En el
- DEMOS · COMPARTIR UNA MAQUETA igual que una playlist
- DEMOS · ENLACE PÚBLICO para que nos manden maquetas
- LA PREVISUALIZACIÓN DE UNA DEMO NO ES «PLAYLIST» (corregido ago 2026). La página que se
- PLAYLIST: listas de temas para MANDARLAS, en su pestaña de Discográfica
- EL VIDEOCLIP · su propio proceso, en paralelo al del audio
- UN PROYECTO CON VIDEOCLIP LLEVA DOS BOLSAS: audio y vídeo
- EL LISTADO DE PLAYLISTS EN MÓVIL: la portada NO se estruja y las etiquetas BAJAN (sep
- Subida de archivos GRANDES (audio, vídeo, PDF) a Storage
- PLAYLISTING FUERA DEL MENÚ. Se ha quitado su

---

- **MATERIALES DE CANCIÓN · etiqueta de audio y VIDEOCLIP** (ago 2026):
  · **El audio se ve como una ETIQUETA** (`.mat-chip`): icono del tipo + **play** + **duración**, y
  **sin nombre de archivo** —el módulo ya dice qué es («Master 48 bits», «Instrumental»…)—. Al
  pinchar suena, y **solo suena uno a la vez**. Motor `static/js/media_chip.js` (GLOBAL en
  `layout.html`), que engancha cualquier `[data-chip-src]`. La **duración la lee el navegador**
  (`preload="metadata"`: una lectura por rango del principio del archivo), no el servidor: así no
  cuesta una llamada a ffmpeg por archivo en cada carga y vale también para lo ya subido. Si no se
  puede leer, la etiqueta no la enseña. En los **stems** se conserva el nombre (ahí es lo único que
  los distingue).
  · **Maqueta**: Portada · **Videoclip** (mismo hueco que la portada, justo debajo) · Masters ·
  Instrumental · TV Track · **Stems**, que ocupa media columna para caer debajo de Instrumental y al
  lado de TV Track.
  · **VIDEOCLIP** (`SongMaterial.category='VIDEOCLIP'`, slots DEFAULT/SUBPRODUCT): se ve con su
  **miniatura**, y en los tres puntitos se descarga **en MOV o en MP4**
  (`_convert_video_content`: MOV y MP4 son el mismo códec en otro contenedor, así que se **remuxa**
  con `-c copy` —casi instantáneo y sin tocar la calidad— y solo si eso falla se recodifica).
  ⚠️ ffmpeg no está en el PATH del servidor: se usa el binario de imageio-ffmpeg (`_ffmpeg_exe`),
  el mismo del póster de los vídeos.
  · **Miniaturas**: la automática la saca ffmpeg en 2º plano (`_song_video_poster_schedule` →
  `SongMaterial.poster_url`, leyendo por RANGO sin bajarse el vídeo). Además se pueden **subir
  miniaturas a mano** (`category='VIDEO_THUMB'`), que **mandan** sobre la automática y se vinculan
  al vídeo por **`bundle_key` = id del videoclip**.
  ⚠️ `bundle_key` significa DOS cosas: el paquete de STEMS (que se **reemplaza** al subir) y el
  videoclip de una miniatura (que se **añade**). Por eso el reemplazo por `bundle_key` está
  limitado a STEMS: sin ese filtro, subir una miniatura borraba las anteriores.

- **PROYECTO DISCOGRÁFICO · LAS TAREAS DE AUDIO VAN POR PASOS** (ago 2026). Cuando el proyecto lleva
  audio (`_disco_project_has_audio`: todos menos un videoclip suelto), las primeras tareas son un
  proceso, no una lista de avisos, y **las hechas se quedan a la vista con el dato que se fijó**
  (`state` = todo · wait · blocked · done; la macro `lista_tareas` de `disco_project_detail.html`
  pinta el estado, el botón de su pop-up y sus tres puntitos).
  · **1 · Confirmar disponibilidad de fecha** → ⚠️ **la fecha del proyecto es una INTENCIÓN; la que
  vale es la que confirma REGISTROS**. Se le pide con `disco_project_date_request` diciendo qué
  queremos (`DISCO_DATE_REQUEST_KINDS`: esta fecha · una franja · lo antes posible · todavía sin
  fecha) y queda en **`DiscoProjectDateRequest`** (una viva por proyecto; pedir otra anula la
  anterior). Mientras esperan, la tarea sale «Esperando» con **Volver a pedirlo** / **Anular**.
  Cambiar una fecha ya confirmada es el MISMO proceso (`is_change`), desde los tres puntitos.
  · **2 · Fecha máxima de entrega** → la fija REGISTROS **al confirmar la fecha, en el mismo
  formulario** (`registros_release_date_confirm`, pantalla `/registros/fechas`): sin plazo no se
  puede avisar a nadie, así que van juntas a propósito. Si confirman otra fecha, se le dice a quien
  lo pidió, se actualiza el proyecto y **el aviso del plazo que se hubiera mandado deja de valer**.
  Después, la tarea es **notificar al productor (o al artista)**: `disco_project_materials_notify`
  manda el correo con el logo de **PIES** arriba a la derecha, «Fecha máxima de entrega de
  materiales» centrado, la cabecera del lanzamiento y el botón **Subir materiales**, que es el
  **enlace de entrega de masters de siempre** (`_disco_project_delivery_links` crea el que falte:
  no se inventa otro sitio para subir materiales).
  ⚠️ La tarea sale **BLOQUEADA** mientras no se sepa quién produce: es a quien se le avisa.
  ⚠️ **Recordatorio automático** a `DISCO_MATERIALS_REMINDER_DAYS` (2) días del plazo si los másters
  no están subidos: `_disco_materials_reminder_sweep`, **una sola vez** (`materials_reminder_at`) —
  uno que insiste todos los días deja de leerse—. Va en su cron (`/cron/materiales-proyecto`) y
  también dentro del cron diario de documentos, para no depender de otra tarea en el servidor.
  · **3 · Producción y sus subtareas**: quién produce (+ fee, «sin fee» o presupuesto, y su % —con
  «no lo sé todavía», que **deja el % como subtarea abierta a propósito**—), quién mezcla, quién
  masteriza (el productor, un tercero, o un tercero que gestiona el productor) y **quién graba las
  voces** (con su coste, fecha, lugar —estudio del productor / casa del artista / otro, con la
  dirección autocompletable— y su **logística**, que al marcarla le sale como tarea a la persona de
  producción elegida). Todo se guarda con `disco_project_production_save` por secciones
  (`section=producer|mix|master|vocals`) en **`DiscoProject.production_payload`** (JSONB); quien
  produce sí es columna (`producer_promoter_id`) porque es a quien se le reclaman los materiales.
  Estado en **`_disco_production_state`**, pop-ups en `templates/_disco_project_steps.html`.
  ⚠️ En esos pop-ups, los paneles que dependen de una elección van con **`data-dp-when`** y los
  ocultos **se deshabilitan** (un campo oculto se envía igual), y el valor de las tarjetas viaja por
  un oculto que lo ESPEJA (`data-dp-mirror`).
  ⚠️ **A quién se avisa en Registros**: `_registros_user_ids` (con `_profile_in_department`, y si
  nadie tiene Registros cae al Sello y luego a dirección). **No** vale `_department_user_ids`: ese lee
  `departments` en crudo y una fila donde quedó guardado como TEXTO no casa con nada, así que esa
  persona no recibiría el aviso sin dar ningún error (por eso `disco_project_close` también lo usa ya).
  ⚠️ `_notify_user` **no avisa a uno mismo**: si quien pide la fecha es la única persona de Registros
  no le llega nada, pero la solicitud **no se pierde** (sigue en `/registros/fechas`).
  ⚠️ El aviso lleva su propio kind **`FECHA_LANZAMIENTO`** (en `NOTIFICATION_KIND_META`, con su
  etiqueta y su icono): un kind que no esté en ese catálogo se guarda igual pero sale en la campanita
  **sin etiqueta ni icono**. Y el canal del artista es **`DISCOGRAFICA`** —una clave exacta y en
  mayúsculas—: `_artist_notification_emails` con un canal mal escrito devuelve **[] en silencio**.
  ⚠️ **Bug de orden arreglado de paso**: la tarea «cierra el proyecto» se decidía ANTES de añadir «la
  hoja de ruta está vacía» y «sin bolsa», así que salía a la vez que ellas. Ahora se decide al final
  y solo si no queda **nada** pendiente.
  ⚠️ Lo nuevo del contexto de la ficha (`date_state`, `production`, `materials_recipients`,
  `promoters`, `production_people`, `has_audio`) hay que quitarlo del contexto de la **bolsa**
  (`bag_ctx`) o `render_template` revienta con «got multiple values».
  · Los lotes que quedaban de aquí (la demo vinculada al proyecto, la portada con su aprobación, las
  creatividades, los IDs de plataforma y el plan de lanzamiento con sus recordatorios) **ya están
  hechos**: ver sus apartados «PROYECTO · …» más abajo.

- **PROYECTO · SUBIR DEMO y la PORTADA, paso a paso** (ago 2026):
  · **Subir demo**: el pop-up es **el mismo formulario** que la sección Demos (`_demo_form_fields.html`
  + `demo_form.js`) con el proyecto ya puesto; la maqueta queda vinculada (**`SongDemo.project_id`**) y
  se ve en la ficha de la canción **mientras no haya másters** (`_song_project_demos` +
  `_disco_project_demo_visible`) — al subirlos desaparece de ahí y se queda en Demos.
  ⚠️ `discografica_demo_create` acepta ya **`next`**: antes redirigía SIEMPRE a la sección Demos y te
  sacaba de la pantalla en la que estabas.
  · **PORTADA** (`DiscoProjectArtwork`, una por proyecto), en cuatro pasos que son subtareas:
  **1 ¿quién la hace?** (nosotros / el artista / un tercero, con su importe o sin coste) ·
  **2 la FOTO y la IDEA** (ya la tiene quien diseña · la subimos · una de las **fotos guardadas del
  artista** · portada de diseño sin foto; con descripción y ejemplos que se acumulan, y el botón para
  **pedirle al artista su idea** con su propio enlace) · **3 SOLICITARLA** con su fecha máxima
  (enlace público `public_disco_artwork_upload`, ⚠️ **obligatorio JPG *y* PSD**; si la hacemos
  nosotros, además le llega a **Diseño** por la campanita) · **4 APROBACIÓN**
  (`DiscoProjectArtworkApprover`, **un enlace POR PERSONA** como la supervisión de fotos: el artista,
  sus integrantes y quien se añada). Cuando **la aprueban todos**, `_disco_artwork_apply_to_release`
  la deja como portada del lanzamiento (`cover_url` + material COVER de la canción); un rechazo se
  avisa y hay que rehacerla.
  ⚠️ Los tres enlaces públicos van en las **tres** listas (`allowed`, `PUBLIC_ENDPOINTS_EXTRA`,
  `_CSRF_EXEMPT_ENDPOINTS`) y sus tokens son **opacos** (`_uuid_token`), no firmados.

- **DISCOGRÁFICA · DEMOS** (ago 2026): las maquetas que se están valorando, en su propia sección
  (`/discografica?section=demos`). Modelo **`SongDemo`** (`ensure_song_demos_schema`).
  · Una demo viene **de un artista NUESTRO** (`origin='ARTIST'` + `artist_id`) o **DE FUERA**
  (`origin='EXTERNAL'` + quién la manda, su correo y su teléfono, y el tercero si está en la base);
  el ORIGEN se guarda en la propia demo y el flujo es el MISMO: entra **VALORANDO** y acaba
  **APROBADA** o **DESCARTADA**, con el motivo (`decision_note`), quién decidió y cuándo.
  · **Pasar al repertorio** (`discografica_demo_to_song`): una demo APROBADA de un artista nuestro
  crea la canción con su título y su artista y queda **enlazada** (`song_id`), para no perder de
  dónde salió. ⚠️ `Song.release_date` es NOT NULL: la canción nace con la fecha de hoy y ya se
  corregirá en su ficha. Una demo de fuera no se pasa (no hay artista) y se dice por qué.
  · **El audio se sube DIRECTAMENTE a Storage** (`discografica_demo_sign`, mismo patrón que la
  entrega de masters): una maqueta puede pesar como un master y no puede tumbar la petición. Si la
  subida directa falla, va por el servidor como respaldo.
  · Se escucha con la etiqueta de audio del sistema (`media_chip.js`) y se filtra por estado, origen,
  artista y texto libre. **Acceso: el mismo que el repertorio** (no hay permiso nuevo que conceder;
  los endpoints heredan `discografica` por la ruta y escribir exige `can_edit_discografica()`).
  ⚠️ Una sección nueva hay que añadirla a la **lista blanca de `section`** de `discografica_view`: si
  no, cae en `canciones` y la pestaña sale marcada pero se pinta otra cosa (bug real de esta épica).

- **DEMOS · VALORACIÓN del sello** (ago 2026, rediseño). ⚠️ Una demo **ya NO se aprueba ni se descarta**
  (el endpoint `discografica_demo_status` se retiró y `status` queda como histórico): lo que se hace es
  **mandarla a valorar**. Al repertorio pasa cualquier demo de un artista nuestro, sin exigir estado.
  · **«Enviar a valoración»** (tres puntitos): pop-up con el personal del **SELLO** ya marcado
  (`_demo_sello_people`; si nadie tiene ese departamento se ofrece a todo el personal), se puede quitar
  y añadir otros correos, con **la vista previa del correo al lado**
  (`discografica_demo_rating_preview` → `_demo_rating_email_html`, el MISMO HTML que se manda).
  · **El correo**: logo de **PIES** arriba a la derecha, **«Valoración»** centrado, «X quiere que
  valores este tema», la **cabecera de la maqueta** (con la foto del artista o del tercero) y el botón
  **Valorar** a la derecha.
  · **Cada persona tiene SU enlace** (`SongDemoRating.token`, página pública `public_demo_rating`,
  `/valoracion-demo/<token>`): la fila se crea VACÍA al pedir la valoración, así se sabe **a quién se le
  pidió** y por tanto si falta gente. Volver a pedirla **reutiliza** su fila (no se pierde lo que dijo).
  · **La página** enseña lo mismo que el correo, el **audio** con la etiqueta de siempre
  (`media_chip.js`), la nota de **1 a 10 con barra roja→verde** (`_demo_rating_color`, espejado en el JS
  de la página), **¿la ves para radio?** y **¿la ves como focus single?** (`DEMO_RATING_QUESTIONS`) y un
  comentario opcional. Se puede volver a entrar y cambiarla: vale la última.
  · **El ICONO de la fila**: **verde** cuando han valorado todos, **amarillo** cuando falta gente, con
  `hechas/pedidas` y la media. Al pincharlo,
  `discografica_demo_rating_results` pinta la tabla: foto y nombre de cada uno, su nota con su color, sus
  dos respuestas, la **media** y **qué ha ganado** en cada pregunta (`_demo_rating_summary`, que también
  dice quién falta). El filtro de la pantalla pasa a ser por valoración (`DEMO_RATING_FILTERS`).
  ⚠️ El resumen del listado sale de **UNA** consulta para todas las demos (con 400 filas, una por demo
  sería inaceptable) y `public_demo_rating` está en las **tres** listas de endpoints públicos.

- **DEMOS · los artistas, en GALLETAS** (ago 2026): la agrupación por artista de la sección Demos
  usa **la misma rejilla de tarjetas que «Actividades» y «Conciertos»** (foto redonda de 84 px,
  nombre y la etiqueta con cuántas **demos** tiene —así se llaman aquí, no «maquetas»), no la
  lista de una línea que tenía. Así la
  agrupación por artista se lee igual en toda la app.
  ⚠️ **«Sin artista» sigue con su ICONO**, no con una foto ni con el logo de la casa: no es un
  artista. Y solo sale si de verdad hay maquetas sin artista.
  ⚠️ La sección **Proyectos** conserva su lista (`.demo-group`), que es de donde salió este estilo:
  se cambió solo Demos, que es lo que se pidió.

- **DEMOS · cómo se lee una maqueta en el listado** (ago 2026, rediseño): la **PORTADA a la izquierda
  del todo** (`SongDemo.cover_url`; sin portada, la imagen de «sin portada» del repertorio) y a su
  derecha **DOS líneas cuadradas con el alto de la portada** (`.demo-row`, `.demo-row__body` con
  `height` fijo: así todas las filas quedan alineadas): arriba el **título** con el **play a su
  derecha** (la etiqueta de audio de siempre, `media_chip.js`, en su versión sin cápsula
  `.mat-chip--bare`) y debajo, como subtítulo, la **foto y el nombre del artista**. La **nota**, si la
  hay, debajo de todo. **Cuándo se subió y quién NO se enseñan**: van en el tooltip de una **«i»**
  (`.demo-row__info`), junto al origen y los datos de quien la manda.
  · Al subir (o editar) una demo se puede **añadir la portada arrastrándola o eligiéndola**
  (`data-file-drop-for`, el mecanismo global) con vista previa; `cover_remove` la quita. Esa portada
  se usa también en las **playlists** (una demo puesta en una playlist se ve con su portada).
  ⚠️ A las personas se les marca la foto con `data-avatar="1"`: si su foto falla sale el muñequito
  gris en vez de desaparecer el hueco (y las dos líneas siguen cuadradas).

- **DEMOS · se ven y funcionan como las canciones de una PLAYLIST** (ago 2026, rediseño). La fila es
  el **mismo parcial** (`templates/_playlist_row.html`, macro `pl_row`) que usa la playlist: portada,
  título, artista con su foto, **play sobre la portada**, barra de reproducción que se arrastra y paso
  automático al siguiente. Lo propio de la demo (valoración, «En el repertorio», la «i» y los tres
  puntitos) se le pasa a la macro como `badges`/`menu`/`note`.
  ⚠️ El motor es **`playlist.js`**, así que la pantalla de demos TIENE que cargarlo: sin ese `<script>`
  las maquetas se ven bien pero **no suenan** (bug real de esta épica).
  ⚠️ La macro habla de `artist_name`/`artist_photo`/`stream_url`; a la demo se le pasa lo suyo con esos
  nombres (`who`, `who_photo`, `audio_url`) con `dict(row, ...)`.
  · **Primero los ARTISTAS con maquetas** (`_demos_artist_groups`), con **«Sin artista» como PRIMERA
  opción y con ICONO en vez de foto** —y solo si de verdad hay maquetas sin artista—; al entrar en uno
  se ven las suyas (`?demo_artist=<id>` o `none`). Fuera el contador y los filtros de valoración.
  · **AUTORES y LETRA** (opcionales, como todo menos el título): `SongDemoAuthor` (tercero + rol + % +
  editorial) y `SongDemo.lyrics`. En la fila, el icono de **letra** (se abre al pincharlo) y el de
  **autores** con sus nombres; al pasar el ratón, sus **porcentajes y su editorial**
  (`_demo_authors_tooltip`). La editorial escrita a mano se casa con la de la base si coincide.
  · **El FORMULARIO es uno solo** (`templates/_demo_form_fields.html` + `static/js/demo_form.js`),
  compartido con el enlace público, y va por **BOCADILLOS** (`.demo-card`), cada cosa en el suyo: de
  quién es · **el título** · **¿quién la manda?** · el audio · la portada · los autores · la letra ·
  las notas. El audio y la portada se **arrastran o se eligen**.
  · **¿QUIÉN LA MANDA?** (solo cuando la subimos nosotros): **una sola barra** que busca en TODA la
  base —terceros, personal de la casa y artistas— (`api_demo_sender_search`, en
  `SUPPORT_READ_ENDPOINTS`), y si no está se **crea el tercero sobre la marcha** con lo escrito
  (`api_create_promoter`). **No se piden correo ni teléfono**; lo que hubiera guardado no se pierde
  (solo se tocan esos campos si de verdad llegan en el formulario).
  · ⚠️⚠️ **SE PUEDEN SUBIR VARIAS DE UNA VEZ** (sep 2026): al elegir (o arrastrar) varios audios sale
  **UNA FILA POR MAQUETA**, en columna, con el hueco al lado para ponerle el nombre. Lo que se
  escribe se queda en **ESA** maqueta —cada fila lleva DENTRO sus ocultos (`multi_title[]` ·
  `multi_key[]` · `multi_name[]` · `multi_sha[]` · `multi_dup_ok[]`), así que **el orden del DOM es
  el orden con el que se guardan**—. Todo lo demás (el artista, la portada, los autores, el
  productor, la letra y las notas) es **COMÚN al bloque**; después, cada una se retoca yendo a
  editarla.
  · Motor: **`_demo_multi_rows`** (las filas que llegan) + **`_FormOverlay`** (un formulario con el
  título y el audio SUSTITUIDOS, el resto se lee del original) + **`_demo_create_many`**, que usan
  el alta de dentro **y** el enlace público. Así no hay dos versiones de «crear una maqueta»: se
  llama al `_demo_apply_form` de siempre una vez por fila.
  ⚠️ **La PORTADA se sube UNA sola vez** y se le pone a todas (a `_demo_apply_form` se le pasan los
  archivos VACÍOS: el audio llega ya subido con su `key`). Con `files` de verdad, el mismo archivo
  entraría en Storage tantas veces como maquetas.
  ⚠️ **Si a alguna le falta el nombre no se guarda NINGUNA**, y **el mismo archivo dos veces en el
  mismo bloque** se dice y se rebota (el navegador lo avisa y el servidor lo vuelve a comprobar).
  ⚠️ El hueco COMÚN del título solo se ve **cuando no hay filas** y, si las hay, se **DESHABILITA**:
  oculto y obligatorio bloquearía el guardado. **Editando** una maqueta el múltiple se apaga
  (`elAudio.multiple = false`): ahí solo hay una.
  ⚠️ En `demo_form.js`, la función de las filas se llama **`pistas()`**, no `filas()`: la sección de
  AUTORES declara `var filas` en el MISMO ámbito (`var` es de función) y la machacaría — el clásico
  «filas is not a function» sin ningún error a la vista.
  · **EL PRODUCTOR, en su propia sección** (como la de autores): se busca en la base con su foto y,
  si no está, se crea con el **«+»** (`api_create_promoter` **sin `force_new`**: si hay alguien
  parecido, el 409 devuelve la lista y se ofrece elegirlo o crearlo igualmente). ⚠️ **PUEDEN SER
  VARIOS**: modelo **`SongDemoProducer`** (hermano de `SongDemoAuthor`), con centinela
  `producers_present` y punto único `_demo_apply_producers`. En la fila de la maqueta salen con su
  icono (`fa-sliders`) y sus nombres. En el enlace público es un campo de texto (allí no hay sesión
  con la que buscar ni crear terceros).
  · **EL MISMO AUDIO no se sube dos veces sin avisar**: el navegador calcula la **huella sha256** del
  archivo y pregunta (`discografica_demo_audio_check`); si ese mismo audio ya está, dice **con qué
  nombre** y deja subirlo igualmente o no, y si se sube con el MISMO nombre **pide otro** para
  distinguirlas. ⚠️ Lo comprueba también el SERVIDOR (`_demo_duplicate_check` + el cálculo de la
  huella cuando el archivo pasa por él): saltarse el JS no cuela una repetida.
  · **Descargar el audio** (`discografica_demo_audio_download`) da a elegir **WAV o MP3** y lo
  **descarga** (antes abría la URL de Storage en una pestaña). Punto único `_demo_audio_download`, que
  usa también la descarga de una playlist.

- **PLAYLIST DE SELECCIÓN / VALORACIÓN** (sep 2026): una playlist normal se manda para ESCUCHARLA;
  esta se manda para que **decidan**. Botón **«+ Playlist selección»** a la izquierda de
  «+ Playlist», con su asistente de TRES pasos (nombre → temas → dinámica) y, al terminar, la
  pantalla de **a quién se le manda**.
  · **TRES DINÁMICAS** (`PLAYLIST_VOTE_MODES`, cada una con su icono): **RATE** (puntúan) · **PICK**
  (descartan y seleccionan) · **PICK_RATE** (seleccionan y, de lo elegido, puntúan). Vive en
  `Playlist.vote_mode` (**vacío = playlist de siempre**), con `pick_count` (cuántas hay que
  seleccionar), `vote_due_date` (el plazo) y `vote_note`.
  · **UN ENLACE POR PERSONA** (`PlaylistVoter`, token OPACO): es lo que permite saber **quién ha
  votado qué**. Lo que dice cada uno va en `PlaylistVote` (`score` 1-10 · `state` KEEP/DROP ·
  `heard`).
  ⚠️⚠️ **PARA PUNTUAR (O DECIDIR) HAY QUE HABER ESCUCHADO EL TEMA ENTERO.** El reproductor de la
  casa avisa con el evento **`playlist:ended`** —no sabe nada de valoraciones: solo avisa, como
  `agenda:external-drop`— y hasta entonces la fila sale con su candado. **Se comprueba también en el
  SERVIDOR** (`public_playlist_vote_save`): esconder los botones no basta.
  ⚠️⚠️ **SE PUEDE HACER EN VARIAS VECES**: cada cosa se guarda AL MOMENTO, así que se puede dejar a
  medias y **seguir donde se dejó** otro día (el estado de cada tema lo manda el servidor en
  `saved` y la pantalla lo aplica al cargar). El enlace no caduca hasta que se ENVÍA.
  · **La BARRA del 1 al 10** va del **rojo** de la casa (menos) al **azul** (más), que son los dos
  colores de la marca. Al puntuar, **la lista se reordena**: la más votada, arriba.
  ⚠️ Reordenar el DOM rompe el índice del reproductor: por eso `playlist.js` expone
  **`root.plReindex()`**, que vuelve a leer las filas y busca por su id la que está sonando. Sin eso,
  «siguiente» saltaría a otra canción.
  · **EN QUÉ PUNTO ESTÁ CADA UNO** (`PLAYLIST_VOTER_STATES`, punto único `_playlist_voter_state`):
  sin enviar · **pendiente** (no ha abierto el enlace) · lo ha abierto sin escuchar · **escuchando
  (3 de 8)** · **escuchado, pendiente de decidir** · ya ha contestado · anulado. Se ve en la ficha y
  en la pantalla de envío, con lo que lleva hecho («5 de 8 escuchadas · 3 puntuadas»).
  ⚠️ `PlaylistVoter.opened_at` es lo que distingue «no lo ha visto» de «lo está escuchando».
  · **FILTRO «Ver resultados incompletos»**: enseña además **lo que cada uno lleva hecho ahora
  mismo**, marcado como parcial. Por defecto solo cuenta lo ENVIADO: una valoración a medias no
  puede mover el orden de la lista.
  · **DENTRO**: los temas **de más a menos votados**; al pinchar la nota sale el **desglose** de qué
  ha puesto cada uno y al pinchar a una persona **su orden**, los dos **en un POP-UP**, sin salir.
  · **En los TRES PUNTITOS de cada persona**: compartir por Email (se lo reenvía solo a él),
  WhatsApp, SMS, copiar enlace, **resetear** y **anular**.
  ⚠️⚠️ **RESETEAR borra su nota y su selección pero NO lo ESCUCHADO**: no hay por qué hacerle oír
  todo otra vez (lo pidió así Dani). **ANULAR** deja su enlace sin valer, diciéndolo.
  · **EL CORREO** (punto único `_playlist_vote_email_html`, el mismo que se manda y que se
  previsualiza): logo de la empresa arriba a la **derecha** · «Selección y Valoración de temas»
  centrado · el texto de lo que se pide, justificado · el **nombre de la playlist** centrado · el
  **listado de los temas** como se ve en la playlist (cada uno es un enlace a ella) · y el botón
  **Escuchar playlist**. **El RECORDATORIO es ESE MISMO correo** con el aviso del plazo delante
  (`remind_days`), no un segundo diseño.
  · **ASUNTO**: «Valoración y selección de \<playlist\> de \<artista\>» (`_playlist_vote_subject`;
  el artista solo si todos los temas son del mismo).
  · **RECORDATORIO**: `_playlist_vote_reminder_sweep`, colgado del **cron diario de documentos** —el
  día ANTES del plazo y **una sola vez** (`reminded_at`): uno que insiste a diario deja de leerse—.
  · Al terminar, **aviso por la app a quien la mandó** («X ya ha valorado …»).
  ⚠️⚠️ **LA RUTA NO PUEDE SER `/enviar`**: eso ya lo tenía «compartir la playlist por correo»
  (`playlist_send_email`) y dos reglas iguales se pisan —lo cazó `tools/check_botones.py`—. Van bajo
  **`/valoracion/…`**.
  ⚠️ Por lo demás **es una playlist normal**: se ordena, se le añaden o quitan temas, se le pone
  portada y nota, sus interruptores de descarga/letra/autores… y lo que se cambie lo ven todos, que
  la página de cada uno lee los temas EN VIVO.

- ⚠️⚠️ **UNA PLAYLIST DE SELECCIÓN SE EDITA DESPUÉS DE MANDARLA, Y LO YA VOTADO SE CONSERVA**
  (sep 2026). En la cabecera de la lista, **arriba a la derecha, el LÁPIZ** (a la vista, no escondido
  en los ⋯ — es lo que más se busca al abrir una playlist ya creada) despliega las dos cosas que se
  pueden cambiar: **«Editar la lista»** (el editor de temas de siempre) y **«Editar las
  condiciones»** (`#playlistVoteConditionsModal` → `playlist_vote_conditions_save`: la dinámica,
  cuántos temas hay que seleccionar, el plazo y la nota). En una playlist NORMAL el lápiz lleva
  directo a editar (no hay condiciones), y de los ⋯ se retiró «Editar».
  ⚠️⚠️ **LO YA VOTADO NO SE TOCA**: `PlaylistVote` y el `done_at` de cada persona **se conservan**
  (su respuesta sigue contando en los resultados) y lo que se hace es **REABRIRLE el enlace** para
  que valore lo nuevo y repase su selección — columnas nuevas **`PlaylistVoter.reopened_at`** y
  **`reopened_note`** (qué ha cambiado, que es lo que se le enseña al entrar).
  · **QUÉ REABRE** lo decide la HUELLA (`_playlist_vote_signature`): **los temas que suenan**, **la
  dinámica** y **cuántos hay que elegir**. El nombre, la portada, la nota, el plazo, los
  interruptores y un TÍTULO o una DIVISIÓN **no reabren nada**: molestar por eso a quien ya contestó
  es peor que no avisar.
  · Puntos únicos: `_playlist_vote_change_note` (el texto: «Se han añadido 2 temas y se ha quitado
  1», «Ahora hay que seleccionar 3 temas»…) · `_playlist_vote_reopen` (solo a quien **ya había
  contestado**: a quien no, su enlace ya vale y la página lee los temas EN VIVO) ·
  `_playlist_vote_apply_change` (lo llaman el guardado de la lista **y** el de las condiciones) ·
  **`_playlist_voter_needs_review`** (¿se cambió después de que contestara?).
  · **Dónde se ve**: el **flash** al guardar (con los nombres) · el **aviso** de la pantalla de gente
  con el botón **«Avisarles del cambio»** (`playlist_vote_notify_changes`) · el estado nuevo
  **REVIEW** («Pendiente de revisar los cambios», ámbar) en el listado, con «contestó el …» al lado ·
  y en la página de quien vota, el aviso de qué ha cambiado (`.pv-changed`) y la etiqueta **NUEVO**
  (`.pv-new`) en los temas que todavía no había votado.
  ⚠️ **El correo del reaviso es el MISMO** de la solicitud con el aviso del cambio delante
  (`changed=`), como el recordatorio del plazo: no hay un segundo diseño.
  ⚠️ **`done_count` cuenta también a quien está pendiente de revisar**: ya contestó y su valoración
  está en los resultados, así que si no entrara, la pestaña diría «0 de 2» y dentro habría una
  valoración (el contador tiene que decir lo que se va a ver).
  ⚠️ **El RECORDATORIO del plazo también le llega**: su `done_at` está puesto, así que hay que
  nombrarlo aparte (`not done_at or needs_review`) o se quedaría sin aviso.
  ⚠️ Al **ENVIAR** se sella `done_at` y se limpia `reopened_at`: su enlace se cierra otra vez hasta
  el próximo cambio, y a quien la mandó le llega «X ha revisado su respuesta» (que no es lo mismo que
  «ya ha contestado»).
  ⚠️ El **RESET** limpia también la reapertura: empieza de cero, así que no hay nada «pendiente de
  revisar» (si no, se quedaba en ese estado para siempre).
  ⚠️ **Quitar un tema se lleva sus votos** (`PlaylistVote.item_id` es ON DELETE CASCADE) y eso es lo
  correcto: el tema ya no está. Los de los temas que se quedan se conservan porque
  `_playlist_replace_items` **reutiliza las filas por su id**.
  ⚠️ El panel «¿cuántas hay que seleccionar?» es un **punto único** (`initModoForm` sobre
  `[data-pv-mode-form]`, en `playlist_vote.js`): lo usan el asistente de creación y el pop-up de
  condiciones, así que se comportan igual — y su campo se **DESHABILITA** al esconderlo (un
  `required` oculto bloquea el envío).
  ⚠️ **No se pueden pedir más temas de los que hay** (lo comprueba el servidor): nadie podría enviar
  su selección.

- ⚠️⚠️ **LOS BOTONES DEL DISPOSITIVO: pasar de canción desde el iPhone, CarPlay o los AirPods**
  (sep 2026, **Media Session** en `playlist.js`). Escuchando una playlist —compartida o desde
  dentro—, el móvil la trata como lo que es, MÚSICA: la **pantalla de bloqueo**, el **Centro de
  control**, **CarPlay en el coche**, los botones del **volante**, el **reloj** y el **doble toque de
  los AirPods** pueden **pasar de tema, retroceder, parar y seguir**, y enseñan el **título, el
  artista y la portada**.
  · `initPlayer` pone, al empezar cada tema: **`mediaSession.metadata`** (título · artista · «disco»
  · carátula), los **mandos** (`play` · `pause` · `stop` · `nexttrack` · `previoustrack` ·
  `seekbackward` · `seekforward` · `seekto`) y la **posición** (`setPositionState`, que es lo que
  mueve la barra del coche). Al acabar la lista se suelta (`playbackState = 'none'`).
  · **`previoustrack` se comporta como en cualquier reproductor**: si el tema lleva más de 3
  segundos sonando vuelve a su principio, y solo si acaba de empezar salta al anterior.
  ⚠️ Los datos NO se rascan del HTML: la fila los emite en **`data-pl-title` / `data-pl-artist` /
  `data-pl-cover`** (`_playlist_row.html`) y el reproductor el «disco» en **`data-pl-album`**
  (la playlist, «Maquetas», el repertorio de Syncros…). Una pantalla nueva con reproductor tiene que
  emitirlos, o el coche enseñará el tema en blanco.
  ⚠️ La CARÁTULA se declara con **varios tamaños** (256 y 512) apuntando a la misma imagen: sin
  candidatos, algunos sitios (el reloj, el coche) no enseñan ninguna. Y va en **absoluto**.
  ⚠️ Cada mando se registra **en su propio `try`**: uno que el navegador no conozca revienta
  `setActionHandler` y se llevaría por delante a los demás. Donde no haya `mediaSession`, no pasa
  nada.
  Probado en el navegador con audio de verdad: siguiente · anterior · pausa · seguir · el paso
  automático al acabar, y los metadatos siguiendo al tema.
  · ⚠️⚠️⚠️ **Y NO FUNCIONABA EN EL IPHONE, NI EN EL COCHE, NI EN EL MAC** (corregido sep 2026, bug
  real): el reproductor era un **`new Audio()` suelto en memoria**, sin colgar del documento. Eso
  SUENA igual, pero para **Safari (iPhone y Mac)** no es «lo que está sonando en este dispositivo»:
  no entra en el **Now Playing** del sistema, así que ni la pantalla de bloqueo, ni **CarPlay**, ni
  el coche por Bluetooth, ni los AirPods, ni el Centro de control enseñaban el tema ni dejaban pasar
  de canción. **En Chrome funciona de las dos formas**, y por eso probándolo en el navegador «iba».
  Ahora el `<audio>` se crea con `document.createElement` y se **cuelga del `<body>`** (sin
  `controls` no se ve ni ocupa sitio) — es lo que ya hacía `media_chip.js`.
  ⚠️ **REGLA**: cualquier reproductor de la casa tiene que tener su `<audio>` EN EL DOM.
  ⚠️ Los mandos se **vuelven a enganchar en CADA tema** (fuera el cerrojo de «ya está hecho»): los
  mandos del sistema son UNOS SOLOS y los registra el último reproductor que suena, así que en una
  pantalla con dos, al volver al primero los botones del coche seguían mandando sobre el otro.
  ⚠️ La CARÁTULA lleva su **`type` deducido de la extensión** y, si no se sabe, no se pone: un
  `type: ''` hace que algunos sistemas descarten la imagen. Y el placeholder de «sin portada» va en
  **PNG** (`DEFAULT_COVER_PNG_URL`), no en SVG: **el coche no pinta un SVG** y el tema saldría sin
  portada (la fila lo emite en `data-pl-cover`).
  ⚠️ Lo que NO se puede arreglar desde aquí: si el enlace se abre desde **dentro de WhatsApp** (su
  navegador propio), iOS no da Now Playing a esa página. Abriéndolo en Safari, sí.
  · ⚠️⚠️⚠️ **Y AUN ASÍ NO DEJABA PASAR DE CANCIÓN: LOS BOTONES DE ±15 s ECHAN A LOS DE PISTA**
  (corregido sep 2026, bug real: «en CarPlay y en el iPhone se ve bien y deja pausar o adelantar
  dentro de la canción, pero no lo detecta como una lista y no deja pasar a la siguiente ni volver a
  la anterior»). En el **Now Playing** de iOS y de CarPlay solo hay sitio para **UN par de botones** a
  los lados del play, y cuando se registran **`seekbackward`/`seekforward`** el sistema pinta el
  «±15 segundos» **EN LUGAR DE** anterior/siguiente. O sea: el síntoma («deja adelantar dentro del
  tema pero no cambiar de canción») **es** la huella de tener esos dos mandos puestos.
  ⚠️ Ahora, en una LISTA (`filas.length > 1`) mandan `nexttrack`/`previoustrack` y los de saltar se
  **QUITAN A MANO** (`setActionHandler('seekbackward', null)`): registrar y no desregistrar deja el
  botón puesto para siempre, porque los mandos del sistema son unos solos y se heredan del último
  reproductor que ha sonado. Con **UN solo tema** —una maqueta compartida, la ficha de un tema de
  Syncros— no hay a dónde pasar, así que ahí sí se dejan los de ±15 s.
  ⚠️ **`seekto` se deja SIEMPRE**: no ocupa botón (es la barra que se arrastra en el coche).
  ⚠️ Como `enganchaMandos()` se llama en CADA tema y `plReindex()` recalcula `filas`, el reparto se
  decide en cada arranque: una playlist de valoración que se reordena no se queda sin botones.
  Comprobado en el navegador interceptando `setActionHandler`: con 4 temas quedan `nexttrack`/
  `previoustrack` y los seek a `null`; con 1 tema, al revés.

- **PLAYLIST · LA PLAYLIST A LA IZQUIERDA Y EL BUSCADOR A LA DERECHA** (sep 2026). Al elegir temas,
  el buscador de repertorio y maquetas estaba debajo (y en un modal), así que **según crecía la
  playlist se encogía el sitio donde se ven las demos**. Ahora es una rejilla de dos columnas
  (`.plb`): a la izquierda la playlist y a la **derecha, fija**, el buscador — con las **funciones de
  añadir arriba del todo** (un título · una división · una nota), para poder dejarlas puestas antes
  de crear nada.
  · **UN SOLO MOTOR** para las dos pantallas: `static/js/playlist_picker.js`
  (`window.app33PlaylistPicker.init(zona, {tiene, onAdd})`) + el parcial
  `templates/_playlist_picker.html`. Lo usan **el editor de una playlist** y el **paso 2 del
  asistente** de selección/valoración, así que se comportan igual y una mejora vale para los dos.
  · **LO YA AÑADIDO SE MARCA EN VERDE** (`.pl-pick-song.is-added` + el icono a `fa-circle-check`),
  como era antes: lo decide `opts.tiene(kind, id)` y el host refresca con `zona.plPickRefresh()` cada
  vez que la playlist cambia.
  ⚠️ El pop-up de añadir temas (`#playlistPickModal`) se **retiró**: era la segunda implementación
  del mismo buscador.

- **PLAYLIST DE VALORACIÓN · DOS PESTAÑAS** (sep 2026, `PLAYLIST_VOTE_TABS`, servidas con `?tab=`):
  · **«La playlist»** — la playlist tal cual se ve fuera y, debajo, **a quién se le ha mandado, para
    qué** (la dinámica, cuántas hay que elegir, el plazo y la nota) **y en qué punto está cada uno**,
    con su foto, su estado y lo que lleva hecho (`_playlist_vote_people.html`).
  · **«Valoraciones»** — lo votado (`_playlist_vote_results.html`), con **botones de filtro por
    persona con foto y nombre** (los mismos `.artist-mini` que los filtros de artistas del
    repertorio) y **«Todos» por defecto**: con «Todos», los temas **de los más elegidos a los menos**
    con el resultado en **«cuántos de cuántos»** y la nota media; con una persona, **su** valoración
    en su orden. Se llega a una persona directamente desde la otra pestaña (`?quien=<id>`).
  ⚠️ Una `?tab=` que no esté en el catálogo cae en la PRIMERA (la regla de la casa).
  ⚠️ **El orden lo manda lo ELEGIDO, no la nota**, cuando la dinámica incluye seleccionar
  (`_playlist_vote_results`): en una selección lo que se pregunta es cuántos la eligen y la nota solo
  desempata. Donde solo se puntúa, manda la nota. El rótulo lo dice (`wants_pick` en el payload).
  ⚠️ Las acciones sobre una persona (resetear, anular, reenviar) viven en la pestaña de la PLAYLIST,
  así que su handler de `playlist_vote.js` mira las dos zonas (`[data-pvpeople]` y `[data-pvres]`).

- **VOTAR · «La elijo» / «Descartar» se leen de un vistazo** (sep 2026): iconos **sólidos**, **verde
  para elegir y rojo para descartar**, en **clarito** hasta que se marca y **macizos** al marcarlos;
  entonces **solo se ve la opción elegida** (`.pv-pickbtns.is-decided .pv-btn:not(.is-on){display:none}`)
  y **se deselecciona pinchando encima** de la que está puesta.

- **EL CORREO DE UNA VALORACIÓN lleva las PORTADAS y el ARTISTA con su foto** (sep 2026): cada tema
  sale con su portada (48 px) y, si no tiene, con la imagen de **«sin portada»**
  (`cover_placeholder.png`, nunca un SVG: en un correo no se pinta); y debajo del título, el
  **artista con su foto redonda** de 20 px, igual que en la playlist. Todo con `<table>` y URLs
  **absolutas** (`_absolute_media_url`), que es lo único que entiende un cliente de correo.

- ⚠️⚠️ **LO QUE SE DESCARGA LLEVA PUESTO DE QUIÉN ES** (sep 2026). Una canción o una maqueta que sale
  de aquí lleva DENTRO sus metadatos: **título · artista · AUTORES · PRODUCTORES · disco · género ·
  año · comentario · PORTADA**. Sin eso, en el ordenador de quien lo recibe queda un «pista 01» sin
  dueño.
  · Motor **`audio_tags.py`** (PURO: ni Flask ni BD ni ffmpeg) con su prueba de regresión
  **`tools/check_audio_tags.py`**, que además **lee lo escrito con ffmpeg de verdad** — un lector
  escrito por uno mismo puede estar de acuerdo con su propio error.
  ⚠️⚠️ **NO SE RECODIFICA NADA**: en el **MP3** se le quita el ID3v2 que trajera y se le antepone el
  nuestro (**ID3v2.3**, que es el que entienden Windows, iTunes y los coches), y en el **WAV** va un
  `LIST/INFO` de RIFF. Son bytes DELANTE del audio: ni se toca el sonido ni se pierde calidad.
  ⚠️ **La etiqueta anterior se QUITA**: si no, el archivo acaba con dos y cada programa lee una.
  · Los AUTORES van en **TCOM** («compositor»), que es donde los enseñan iTunes y el coche; los
  PRODUCTORES en **TXXX:PRODUCER** y en **IPLS**; y los dos, además, **en el comentario**, para el
  reproductor que no lea los campos finos. En el WAV, `IWRI` (autores) e `IENG` (productores).
  · En app.py: `_audio_tags_for_song` / `_audio_tags_for_demo` (reúnen los datos) + **`_audio_with_tags`**
  (el punto único que las pone). Enganchado en los CUATRO caminos: la descarga de una **maqueta**
  (`_demo_audio_download`, que es también la de una playlist), la de un **material de canción**
  (`_song_material_download_payload`: la ficha, la playlist y el enlace público) y el MP3 que se le
  manda a un **supervisor** (`public_sync_song_download`).
  ⚠️ La **PORTADA solo se mete en el MP3** (un WAV no lleva carátula) y con tope de tamaño
  (`AUDIO_TAG_COVER_MAX`): una imagen enorme convertiría un MP3 de 4 MB en uno de 20.
  ⚠️ Es *best-effort*: si algo falla, **el archivo se descarga igual** sin etiquetas. Nunca se deja a
  nadie sin su descarga por no poder ponerle el nombre.

- ⚠️⚠️ **UN CLIC EN UN CONTROL DE LA FILA NO REPRODUCE NI PARA NADA** (bug real, ago 2026). En el
  listado de demos (y en una playlist) cada línea lleva **sus tres puntitos**, sus etiquetas y sus
  formularios DENTRO del `<li data-pl-row>`, y el clic burbujeaba al reproductor: **abrir el menú
  arrancaba el audio** y, si algo estaba sonando, **lo cortaba**. El handler de la fila
  (`playlist.js`) ignora ya cualquier cosa con la que se pueda interactuar (`CONTROLES`: `button`,
  `a`, `input`, `label`, `select`, `textarea`, `form`, `.dropdown`, `[data-bs-toggle]`,
  `[role="button"]`, la barra) — antes solo se saltaba la barra, los enlaces y `.pl-row__dl`.
  · Lo que SÍ suena: **pinchar la línea** o **la portada**. El botón de PAUSA sigue funcionando porque
  tiene su propio handler en fase de **captura** (con `stopPropagation`), así que excluir `button` no
  lo rompe.
  ⚠️ Al añadir un control nuevo a una fila (una casilla de selección, un botón de enviar) **no hay que
  tocar nada**: la regla es por tipo de elemento, no una lista de clases.

- **DEMOS · COMPARTIR UNA MAQUETA igual que una playlist** (ago 2026): en los **tres puntitos** de
  cada demo hay **Compartir** y **Copiar enlace**. El pop-up es el mismo que el de una playlist
  (**WhatsApp · SMS · Copiar enlace · Email**, con nota) y lleva **los mismos interruptores**
  (`DEMO_SHARE_SWITCHES`: descarga · letra · autores · quién la envió · notas), que **nacen apagados**
  y se guardan **al momento** (`demo_share_save`, uno a uno).
  ⚠️ **Se pinta con la MISMA vista que una playlist** (`public_playlist.html` /
  `_playlist_view.html`): `_demo_share_context` fabrica el contexto con la forma que ese parcial
  espera (`pl` + `items` de una sola línea), así que la maqueta se ve y suena igual que un tema de una
  playlist y **no hay una segunda pantalla que mantener**.
  ⚠️ Como en las playlists, **la dirección del archivo en Storage NO sale nunca a la página**: el
  audio va por nuestro puente (`public_demo_share_audio` → `_playlist_audio_response`, con `Range`
  para poder arrastrar la barra) y la descarga solo existe **si el interruptor está encendido**
  (`public_demo_share_download`, que lo vuelve a comprobar).
  ⚠️⚠️ El **token del enlace se crea en `_demos_context` con COMMIT**: creándolo al pintar (con un
  `flush` sin commit) se perdía al cerrar la sesión y en la carga siguiente salía otro — o sea, un
  enlace ya compartido dejaba de valer (bug real, lo sacó la prueba).
  ⚠️ La miniatura (`public_demo_share_og_image`) es la **portada de la maqueta** y, si no tiene o no se
  puede leer, la imagen de **«sin portada»** (no el logo), como en las canciones. Los cuatro endpoints
  públicos están en las **tres** listas.

- **DEMOS · ENLACE PÚBLICO para que nos manden maquetas** (ago 2026): botón **«Link para subir
  demos»** al lado de «Añadir demo» (se comparte por correo, WhatsApp, SMS o copiándolo). El token es
  **uno para toda la casa** (`AppSetting` `demo_upload_link_token`).
  · **`/enviar-demos/<token>`**: primero se **identifica con su DNI o CIF** (`_find_people_by_doc_number`,
  igual que en las facturas: terceros, sus sociedades, documentos escaneados y personal); si no está,
  se le piden nombre y contacto y **se le crea la ficha de tercero**. Después ve la página como una
  playlist —logo de **PIES** arriba a la derecha, **«Envío de Demos»** centrado, su cabecera y el botón
  **+ Añadir demo**— y va añadiendo maquetas con el MISMO formulario, viéndolas y **escuchándolas**
  como las vemos aquí. Al final, **«Enviar demos»**.
  ⚠️ **Mientras no las envía NO existen para nosotros**: quedan con `submitted_at` a NULL y
  `_demos_context` las deja fuera. Al enviarlas se sella `submitted_at` y aparecen con su **«Enviada
  por»** (foto, nombre y fecha, `_demo_submitted_by`).
  ⚠️ De fuera solo se le ofrecen los artistas con **contrato discográfico, de catálogo o de
  distribución** (`_demo_submit_artist_options`): el resto no se le muestran.
  · **Avisos** (`_demo_submission_recipients`): «X ha enviado N demos» con enlace a verlas. Si vienen
  vinculadas a artistas, a quien del **sello** lleva esos artistas (`assigned_artist_ids_sello`), a la
  **dirección** del sello y a quien del sello lleva **Registros**; si no van con artista, a todo el
  sello (si no, no se enteraría nadie).
  · **PREVISUALIZACIÓN del enlace** (`public_demo_submit_og_image`): el **logo de la empresa del grupo
  CENTRADO y entero** sobre **fondo blanco** (1200×630 con `_og_image_jpeg_bytes`, que hace `contain`
  sobre lienzo blanco), para que en WhatsApp y en SMS se vea bien y no se corte.
  ⚠️⚠️ Ahí salió un bug de TODAS las miniaturas: `_og_image_jpeg_bytes` pasaba la imagen a RGB **a
  pelo**, y un logo PNG con fondo TRANSPARENTE se volvía **NEGRO**. Ahora lo transparente se compone
  sobre blanco (`alpha_composite`), lo que arregla también las og: de pitch, materiales y playlists.
  ⚠️ Sus ocho endpoints públicos están en las **tres** listas.

- ⚠️⚠️ **LA PREVISUALIZACIÓN DE UNA DEMO NO ES «PLAYLIST»** (corregido ago 2026). La página que se
  comparte es **la misma plantilla** para una playlist y para una maqueta (`public_playlist.html`, que
  es lo que hace que se vean y suenen igual), y el título estaba **escrito a mano ahí**: al compartir
  una demo, la tarjeta de WhatsApp y el SMS decían «Playlist». Ahora lo da el servidor, punto único
  **`_share_preview_meta(pl, items, is_demo=…)`**:
  · **demo** → «**Demo · \<nombre\>**» y en la sublínea **el ARTISTA** (si se sabe);
  · **playlist** → «**Playlist · \<nombre\>**» y en la sublínea **cuántos temas** lleva.
  Con eso, la tarjeta, el `twitter:` y el **título de la pestaña** dicen siempre lo mismo.
  · **LA MINIATURA va en cascada: la PORTADA → la FOTO DEL ARTISTA → el LOGO del back office**
  (`_share_og_image_response`, que sirve la primera que se pueda leer y, si ninguna vale, redirige a
  `og_default_image` —el «33» a 1200×630—). ⚠️ Antes el último respaldo era la imagen de «sin
  portada», que en una tarjeta no dice nada; y una portada CAÍDA daba un 404, que en WhatsApp se ve
  como un enlace pelado.
  ⚠️⚠️ **Y la miniatura de una demo NO se pintaba nunca** (bug real): `public_demo_share` pasaba la
  URL como **`og_image`** y la plantilla lee **`og_image_url`**. Al añadir una og:image a una página,
  comprobar el nombre EXACTO de la clave que espera su plantilla.
  ⚠️ En una playlist las fuentes se leen **en BLOQUE** (una consulta para las portadas de sus temas y
  otra para las fotos de sus artistas): con decenas de temas, una consulta por cada uno sería
  inaceptable. Y ⚠️ **`Song` NO tiene `artist_id`**: su artista va por **`SongArtist`** (N:M).
  ⚠️ Se emite también **`og:image:type`**: sin él, WhatsApp y algunos móviles descartan la foto.

- **PLAYLIST** (ago 2026): listas de temas para **MANDARLAS**, en su pestaña de Discográfica
  (`/discografica?section=playlists`). Modelos **`Playlist`** + **`PlaylistItem`**
  (`ensure_playlists_schema`). Una línea es una **CANCIÓN** del repertorio, una **DEMO**, un **TÍTULO**
  o una **DIVISIÓN** (`kind`, y el orden lo da `position`; mismo patrón que el set list de una
  actividad). Se crean con **«+ Playlist»** (solo el nombre) y se listan una debajo de otra, cada una
  con sus **tres puntitos** (editar · compartir por Email/WhatsApp/SMS · copiar enlace · eliminar);
  dentro, esas mismas opciones son **botonotes** (`.ficha-quick`).
  · **La playlist se ve IGUAL en todos los sitios**: punto único `templates/_playlist_view.html`
  (la pantalla de dentro y el enlace público) — logo de la empresa del grupo arriba a la derecha
  **solo cuando SALE DE CASA** (`is_public`: el enlace público y el correo; dentro no se pinta, que es
  nuestra pantalla y encima estorbaba a los botones) —,
  cabecera con su portada, la **nota solo si existe** y los temas con portada, título en negrita,
  artista con su foto y la duración. Al pasar el ratón la línea se subraya y sale el **play sobre la
  portada**; al pinchar en cualquier sitio suena y aparece a la derecha la **barra** (pausar,
  arrastrar para moverte y el segundo por el que vas). **Al terminar una canción arranca la
  siguiente** y solo suena una a la vez (`static/js/playlist.js`, un único `<audio>`).
  · **LOS BOTONES van en la CABECERA**, a la derecha y a la altura de «Playlist» (parcial único
  `templates/_playlist_actions.html`, que incluyen la vista y la edición; en el enlace público NO se
  pinta porque `playlist_actions` no está puesto): **Editar** · **Compartir** (un solo botón que
  despliega Email · WhatsApp · SMS · Copiar enlace) · **Copiar enlace** también suelto · los
  **INTERRUPTORES** · **Eliminar**.
  · **CINCO INTERRUPTORES** (los `.sw` de los accesos, con el **icono arriba y el interruptor
  debajo**, verde encendido y gris apagado; **todos nacen APAGADOS**): **Descarga** ·
  **Letra** (`show_lyrics`) · **Autores** (`show_authors`) · **Quién la envió** (`show_sender`) ·
  **Notas** (`show_notes`). Cada uno se marca ahí mismo y se guarda al momento; lo que enseñan de cada
  tema lo monta `_playlist_item_extras` **solo si está activado Y el tema lo tiene** (una canción saca
  su letra de `Song.lyrics_text` y sus autores de `SongEditorialShare`; una maqueta, los suyos, su nota
  y quién la mandó — ⚠️ las NOTAS hoy solo las tiene una maqueta: `Song` no tiene ese campo).
  ⚠️ La descarga **ya no es una pestaña**: la ficha no tiene pestañas. Los interruptores **solo
  recargan en la VISTA** (para que aparezca o desaparezca lo que enseñan); **editando NO recargan** —se
  perdería lo que no esté guardado—: ahí las líneas traen TODOS los extras (`_playlist_context(...,
  all_extras=True)`, que también los devuelve `playlist_save`) y se ven u ocultan con las clases
  `is-show-*` del editor, así **al encender un interruptor se ve al momento cómo va a quedar**.
  · **LOS TRES PUNTITOS**: editar (o ver) · **Compartir** (abre su pop-up con WhatsApp, SMS, copiar el
  enlace y el correo) · Copiar enlace y, debajo, **Eliminar**.
  ⚠️⚠️ **Un desplegable DENTRO de un menú ⋯ no se puede usar**: el ayudante global de desplegables
  (`scripts.js`) crea TODOS los dropdowns con `autoClose: true` y les teleporta el menú al `<body>`,
  así que cualquier clic dentro los cierra —y `data-bs-auto-close="outside"` no manda, porque la opción
  de JS pisa al atributo—. Por eso «Compartir» abre un **pop-up** (que además es el patrón del resto de
  la app) en vez de desplegarse en el sitio.
  · **EDICIÓN** (`?edit=1`): las líneas se **arrastran** para ordenarlas, arriba están «Añadir
  canción» (pop-up: **Demos** → artistas con maquetas + «Sin artista» · **Repertorio** → artistas,
  primero los que tienen contrato y el resto tras «ver más» → sus temas con portada), «Añadir un
  título», «Añadir una división» y «Añadir una nota»; el **nombre se pincha** y delante sale el
  **cuadradito de la portada** (se arrastra o se elige). El título y la división **no llevan
  etiqueta** («TÍTULO»/«DIVISIÓN»): se ven por lo que son. Se guarda todo de una (`playlist_save`
  reutiliza las líneas por su id, así un segundo guardado no duplica nada).
  ⚠️⚠️ **EL ARRASTRE MUEVE LA LÍNEA DE VERDAD** mientras se arrastra (en `dragover` se hace
  `insertBefore` según la mitad de la fila por la que se pasa), así se ve dónde va a quedar antes de
  soltarla; y al soltar, el array se reconstruye **leyendo el orden de la lista**. Hacerlo con
  índices (un `splice` para quitar y otro para meter) dejaba la línea **una posición desviada al
  bajarla**, porque al quitarla los índices de abajo ya se habían movido (bug real). Escribir en el
  título de una línea no la arrastra (`mousedown` sobre un input le quita el `draggable`).
  · ⚠️ **LAS CANCIONES NO SE DESCARGAN** salvo que la playlist lo permita: `allow_download` nace en
  **false** y se cambia en la **pestaña «Descargas»** de la playlist (interruptor); en el listado se
  ve con su icono (candado / descarga). El audio se sirve SIEMPRE por un endpoint nuestro que hace de
  **puente** (`_playlist_audio_response`), así la dirección del archivo en Storage **no sale nunca a
  la página** y el reproductor no lleva los controles nativos (que traen su propia descarga).
  ⚠️ Ese puente **pasa el `Range`** que pide el navegador (y devuelve su 206 con `Content-Range`):
  sin eso no se puede arrastrar la barra y Safari directamente no reproduce.
  · **La duración la lee el navegador** (una lectura del principio de cada archivo, de una en una) y
  se **apunta** en `PlaylistItem.duration_seconds` (`playlist_item_duration`) para no volver a
  pedirla en cada carga; aquí no hay ffmpeg.
  · **Compartir**: enlace público `public_playlist_view` (`/playlist/<token>`, token **opaco**) con el
  juego de **og:** completo (`public_playlist_og_image`: la portada de la playlist y, si no tiene, la
  del primer tema).
  ⚠️ **Sin ninguna portada la previsualización es la imagen de «SIN PORTADA»**, la misma que en las
  canciones —no el logo—: en WhatsApp, en SMS y en el enlace se ve lo que se vería en la app. Va con
  **`static/img/cover_placeholder.png`** (un PNG a propósito: la miniatura og: es un JPEG y Pillow no
  lee el SVG `cover_placeholder.svg`). El **correo** (`_playlist_email_html`) es «**Playlist \<nombre\>**» con la
  cabecera de la playlist y el botón **Escuchar**, que lleva a ese enlace.
  ⚠️ Los cuatro endpoints públicos están en las **tres** listas; los de dentro cuelgan de
  `/discografica/playlists/...`, así que heredan el permiso de la sección por la ruta.
  ⚠️ La sección `playlists` hay que tenerla en la **lista blanca de `section`** de `discografica_view`
  (si no, cae en `canciones` y la pestaña sale marcada pero se pinta otra cosa).

- **EL VIDEOCLIP · su propio proceso, en paralelo al del audio** (ago 2026). Un proyecto que lleva
  videoclip trae sus tareas en el **grupo «video»** (así en un single con vídeo se leen en su
  columna). Todo vive en `production_payload['video']` y lo lee el punto único
  **`_disco_video_state`**; los pop-ups, en `templates/_disco_video_modals.html`.
  · **1 QUIÉN LO PRODUCE** (`disco_video_producer_save`): un TERCERO (el buscador de siempre, con
  foto y alta al vuelo) y sus condiciones — **`DISCO_VIDEO_FEE_MODES`**: fee, presupuesto o sin
  coste. ⚠️ **NO hay porcentaje**: eso es del máster de audio. Al confirmarlo, a **REGISTROS+SELLO**
  le llega el **CONTRATO DE PRODUCCIÓN AUDIOVISUAL** (`_disco_video_contract_ask` →
  `disco_video_contract` para subirlo), que funciona igual que el del productor de audio.
  ⚠️ Si CAMBIA el productor, el contrato vuelve a estar pendiente: es otro contrato.
  · **2 EL PLAZO DE ENTREGA** (`disco_video_due_save`) y su aviso al productor. ⚠️ Si la fecha
  cambia, el aviso anterior deja de valer y hay que volver a comunicárselo.
  · **3 LOS LOGOS DE LOS CRÉDITOS** (`disco_video_logos_save`): se marcan los de las **empresas del
  grupo**, la **distribuidora** y el **artista**, y se le manda un correo con **cada marca y sus
  versiones**, cada una con su nombre y su enlace de descarga (sale del módulo de `BrandLogo`).
  · **4 LA IDEA** (`disco_video_brief_save`): el briefing, con **ejemplos que pueden ser enlaces de
  YouTube** (uno por línea) o archivos. Se manda, o se marca **«ya se lo he mandado»**.
  · **5 LA MINIATURA** (`disco_video_thumb_save`): se le pide a **DISEÑO** con la idea y el material
  de apoyo (foto o vídeo).
  · **6 EL RODAJE** (`disco_video_shoot_save`): la fecha, el sitio y —si hace falta— la **logística**,
  que se le pide a producción igual que la de las voces (aviso + entra en el PERSONAL de la hoja de
  ruta + se le prepara la **bolsa del VÍDEO**, que es donde van los gastos del rodaje). La marca
  montada quien la lleva (`disco_video_logistics_done`).
  · **7 LA FECHA DE LANZAMIENTO DEL VÍDEO** (`disco_video_release_save`): **día Y HORA** (un estreno
  de YouTube tiene hora). Sin poner ninguna, **las 00:00** del día marcado (`_agenda_clean_time` es
  el punto único de «HH:MM»).
  · **8 SUBIR EL VIDEOCLIP** (`disco_video_upload`): ⚠️ se guarda **también como material de la
  canción** (`SongMaterial` VIDEOCLIP), que es donde se miran los materiales — no se inventa un
  segundo sitio. Y por eso el estado da el vídeo por subido si ya está ahí.
  · **9 LA APROBACIÓN DEL ARTISTA** (`disco_video_approval`, kind **VIDEOCLIP** del motor de
  aprobaciones en cadena). ⚠️ **BLOQUEADA hasta que el vídeo está subido**: no se manda a aprobar lo
  que no existe (lo comprueba también el endpoint).
  · **10 DISTRIBUIRLO**: al aprobarlo todos, `_disco_video_approved` avisa a **REGISTROS+SELLO** —que
  es quien lo sube a las plataformas— y ellos lo marcan (`disco_video_distributed`).
  ⚠️ **`disco_video_contract`, `disco_video_logistics_done` y `disco_video_distributed` van en
  `REQUEST_ANY_ENDPOINTS`**, como sus hermanos de audio: los hacen Registros y producción, que no
  tienen por qué poder editar discográfica; cada uno comprueba dentro que es de quien le toca. Su
  botón en la lista de tareas se pinta con **`open_to_all`** (si no, el `CAN_EDIT` de la ficha lo
  escondería justo a quien tiene que pulsarlo).
  ⚠️⚠️ **GUARDAR DOS VECES EN LA MISMA PETICIÓN: hay que marcar el JSONB a mano** (bug real). El
  patrón de la casa —leer una copia, tocarla y reasignarla— funciona la PRIMERA vez; en la segunda,
  el valor guardado y el nuevo son **iguales** (`==`), porque el primero apunta a los mismos
  diccionarios de dentro que se acaban de tocar, y SQLAlchemy da el atributo por **«unchanged»** y
  **no escribe nada sin dar ningún error**. Pasó con «fijar el plazo Y comunicarlo»: el correo salía
  y el «avisado» se perdía. `_disco_video_set` lo fuerza con **`flag_modified`**.

- ⚠️⚠️ **UN PROYECTO CON VIDEOCLIP LLEVA DOS BOLSAS: audio y vídeo** (ago 2026). Producir el disco y
  rodar el videoclip son dos gastos distintos, así que son **dos bolsas separadas y vinculadas** que
  se gestionan a la vez (en la misma pestaña) pero **se LIQUIDAN por separado**.
  · `DiscoProject.bag_id` = la de **AUDIO**; **`video_bag_id`** = la de **VÍDEO**. Cada una lleva su
  **`WorkflowBag.bag_scope`** (`AUDIO`/`VIDEO`), de donde salen su nombre y sus categorías.
  ⚠️ En un **videoclip SUELTO** no hay audio que producir: su única bolsa es la de vídeo y se sigue
  guardando en **`bag_id`** (con `bag_scope='VIDEO'`), para no partir en dos lo ya creado.
  · Puntos únicos: **`_disco_project_bag_scopes`** (qué bolsas le tocan, CALCULADO del tipo: si a un
  single se le marca después que llevará vídeo, su bolsa entra sola) · **`_ensure_project_bag(...,
  scope)`** · **`_disco_project_bags(session_db, project, create=)`** (las bolsas con su etiqueta,
  su icono, su total y su estado), que es lo que recorren la pestaña y las tareas.
  ⚠️ **Cada bolsa solo ofrece LO SUYO** (`_bag_visible_expense_categories` mira el `bag_scope`): en
  la de audio no se apunta el rodaje y en la de vídeo no se apuntan el máster ni el físico — si no,
  el mismo gasto podría ir a cualquiera de las dos y no cuadraría al liquidar.
  · **Dos tareas de cierre**, una por bolsa (`bolsa_cierre_audio` / `bolsa_cierre_video`, cada una en
  su bloque de la lista partida), así que ninguna se queda sin cerrar por estar la otra hecha.
  · UI: los botones `.dp-bags` de la pestaña Bolsa (con el total de cada una y «Se liquidan por
  separado»); se cambia de bolsa con **`?bolsa=AUDIO|VIDEO`**. Con una sola bolsa no se pinta nada.

- ⚠️⚠️ **EL LISTADO DE PLAYLISTS EN MÓVIL: la portada NO se estruja y las etiquetas BAJAN** (sep
  2026, bug real: «se cortan textos que salen fuera del recuadro y los títulos aparecen una letra
  debajo de otra»). La fila era un flex con la portada, el bloque de texto y las etiquetas
  (valoración, candado) todo en la misma línea, y en 375 px: la **portada salía OVALADA** (15×52) y
  la etiqueta amarilla **se salía por la derecha**, montándose sobre los tres puntitos; medido,
  `body.scrollWidth` 410 sobre 375. Las dos causas son las de siempre:
  · **un hijo de un flex SE ENCOGE** por debajo de su contenido si no lleva `flex:0 0 auto` (la
    portada) — el mismo bug que la foto del artista en la cabecera de una bolsa;
  · **y NO baja de su contenido** si no lleva `min-width:0` (el enlace y el bloque de texto), así que
    la fila se estira y lo que sobra se sale.
  · En móvil el enlace pasa a ser una **rejilla de dos columnas** (`.pl-index__link`): la portada a la
    izquierda ocupando las dos filas (`grid-row:1 / span 2`) y a su derecha el nombre arriba y las
    **etiquetas justo debajo**, alineadas con él. Es el mismo criterio que `.pl-row`: lo que no cabe
    BAJA, nunca se estruja.
  ⚠️ El `<a>` dejó de llevar `d-flex` de Bootstrap (que es `!important` y no deja pasar a `grid`):
  su maqueta vive entera en `.pl-index__link`.
  Medido a 375 px: `scrollWidth` 375, portada 44×44 y nada fuera del recuadro; y a 1280 px, igual que
  antes.

- ⚠️ **Subida de archivos GRANDES (audio, vídeo, PDF) a Storage**: `storage3` solo admite `bytes`,
  `BufferedReader`/`FileIO` o una **ruta**. El stream de una subida de Flask es un
  `SpooledTemporaryFile` (werkzeug pasa a disco a partir de ~500 KB), así que pasarlo tal cual
  reventaba con «expected str, bytes or os.PathLike object, not SpooledTemporaryFile» y **fallaban
  los masters .wav** (los pequeños colaban por el fallback en memoria, los grandes no). `_upload_fileobj`
  vuelca el stream a un fichero temporal EN DISCO por trozos y sube por ruta: sin tope de tamaño y sin
  cargar nada en memoria.

- ⚠️ **PLAYLISTING FUERA DEL MENÚ** (sep 2026, lo pidió Dani: «no tiene sentido»). Se ha quitado su
  entrada de `_build_nav_menu` **y nada más**: la pantalla (`/playlisting`) y su recurso siguen
  ahí a propósito — retirar el recurso del catálogo **PODA en cascada** los permisos concedidos
  (`_sync_access_resources`), y aquí solo se ha quitado el acceso desde el menú.

