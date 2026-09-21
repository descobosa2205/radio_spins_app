# One Sheet y Roster

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- QUÉ ES: el porfolio público de un artista (o evento, ciclo/festival propio o gira comprada)
- DÓNDE VIVE cada cosa (motor puro, datos, plantillas, JS, CSS) y el modelo `OneSheet`
- LA REJILLA de 12 columnas, las filas de alto variable y cómo se adapta a cada pantalla
- LO DINÁMICO SE CALCULA AL PINTAR (conciertos, cifras, certificaciones, prensa, países…)
- EL TEMA: el color de fondo manda y las letras y los iconos salen solos (y se cambian por módulo)
- LA DIRECCIÓN PÚBLICA (slug), los enlaces antiguos por token y el ROSTER (/onesheet, con el
  «Volver» de cada perfil)
- LAS PLANTILLAS: viaja el formato, no el contenido
- CHARTMETRIC: más redes (solo las que tiene el artista) y «dónde se escucha»
- EL MÓDULO «DOCUMENTOS»: archivos para descargar (el icono de su tipo y su nombre), subidos desde el
  editor y servidos por NUESTRO dominio (a Storage el `download` no le vale)
- LAS TRAMPAS que ya costaron algo (el bucle del mapeo grueso, la clave `items`, las fotos…)
- LA PRUEBA: `tools/check_onesheet.py`

---

- **QUÉ ES** (sep 2026, rehecho de cero; lo pidió Dani con el ejemplo de onesheet.club). El **One
  Sheet** es la página pública de presentación de un **artista** —y también de un **evento**
  (`AppEvent`), de un **ciclo/festival/evento propio** (`CycleFestival`) o de una **gira comprada**
  (`TourOneSheet`, que sigue siendo el registro de la gira)—: una CABECERA con la foto grande que se
  funde con el color del cuerpo, el nombre y las etiquetas de **lo que llevamos** (Management ·
  Contratación · Discográfica · Editorial), y debajo una REJILLA de MÓDULOS: biografía, cifras de
  Spotify, seguidores en redes, redes y plataformas, próximos conciertos, fotos, certificaciones,
  último lanzamiento, videoclips, países donde más se escucha, premios, notas de prensa, destacados,
  texto libre y contacto. Se comparte por su enlace: **`/onesheet/<slug>`**.
  · Se abre desde la pestaña **«One Sheet»** de la ficha (artista, evento, ciclo, gira →
  `_onesheet_tab.html`, contexto `_onesheet_tab_context`): la tarjeta con la dirección pública,
  las etiquetas, si sale en el Roster, y el botón **«Editar el diseño»**, que va al EDITOR
  (`/onesheet/editor/<id>`, una página propia a todo el ancho, `onesheet_editor.html` +
  `static/js/onesheet_editor.js`).
  · El **Roster** (`/onesheet`, público, `onesheet_roster_public.html`): todos los artistas con su
  foto, su nombre y sus etiquetas, con los logos de 33 Producciones y PIES; cada tarjeta abre su
  one sheet. Se gestiona en `/onesheet/roster/gestion` (quién sale, el orden arrastrando, las
  etiquetas), y hay un botón «Roster» en el listado de Artistas.
  · **De un perfil se vuelve al Roster** (sep 2026, lo pidió Dani): arriba a la izquierda, un botón
  **«← Volver»** (`.os-topbar--left`, el mismo estilo que Compartir y Editar, que van a la derecha).
  Es un **enlace de verdad** al Roster, no `history.back()`, para que también valga a quien abre el
  enlace compartido sin venir de ninguna parte; en el móvil se queda con su rótulo (los de la
  derecha se quedan en icono). El pie sigue llevando su enlace al Roster.

- ⚠️⚠️ **LA PESTAÑA DE LA FICHA SE VEÍA SIN UNA SOLA REGLA DE CSS** (bug real con captura, sep
  2026: «se ve apelotonado, no sigue el estilo de lo que venimos haciendo»). Los estilos `ost-*`
  viven en **`onesheet.css`**, que solo enlazaban la página pública, el editor y la gestión del
  Roster: en la ficha de un artista —o de un evento, una gira o un ciclo— la pestaña salía con los
  checkbox en crudo y todo pegado. **El `<link>` va ahora en el propio `_onesheet_tab.html`**,
  dentro del bloque de contenido (el mismo patrón del Leaflet de los cuadrantes y del Roster), así
  que vale para las cuatro fichas sin tocar ninguna.
  · De paso, la pestaña se lee como el resto de la app: cada cosa en su **bocadillo** (`demo-card`
  con su cabecera e icono) y **«Copiar enlace» con su rótulo**, no un iconito (lo pidió Dani: «tiene
  que haber una opción rápida de copiar el link»). Si el one sheet **no está publicado**, la propia
  dirección lo avisa en rojo: quien abra el enlace no verá nada.

- ⚠️ **EL ICONO DE ONE SHEET EN LA CABECERA DEL ARTISTA** (sep 2026, lo pidió Dani). Junto a las
  redes y las plataformas de audio —y **separado con la misma rayita** con que se separan ellas—,
  un icono que abre el menú de **ver y compartir**: ver el one sheet · enviar por email · WhatsApp ·
  SMS · copiar el enlace.
  · **Punto único `_onesheet_share.html`**: el MISMO parcial lo usan la cabecera y la pestaña, así
  que no puede haber dos formas de compartir lo mismo. Los items que navegan son `<a>` y el de
  copiar es un `<button>` con el mecanismo global de la casa (`.copy-link-btn[data-copy-url]`).
  · **`_onesheet_header_link(session_db, kind, sid, name)`** da el enlace **SIN CREAR NADA**: una
  cabecera se pinta en todas las pestañas y no puede tener efectos. Si el artista todavía no tiene
  one sheet, el enlace es el del **nombre hecho slug**, que `_onesheet_resolve_public` resuelve
  igual (y ahí sí lo crea, al abrirlo). Comprobado: abrir la ficha de un artista sin one sheet no
  deja ninguna fila nueva, y ese enlace abre su página.

- **DÓNDE VIVE CADA COSA**. El diseño es UN JSON en **`OneSheet.design`** (tabla `onesheets`, una
  fila por sujeto: `subject_kind` ARTIST|EVENT|CYCLE|TOUR + `subject_id`, `slug` único,
  `public_token`, `services`, `roster_visible`, `roster_order`, `published`). Las plantillas en
  **`OneSheetTemplate`**. Esquema: `ensure_onesheet_schema()`.
  · **`onesheet_render.py`** (motor PURO, sin Flask ni BD): el catálogo de módulos (`MODULES`: para
  qué sujetos vale cada uno, su ancho por defecto, si es dinámico), las métricas de Chartmetric
  (`METRICS`), las tipografías (`FONTS`, se carga de Google Fonts SOLO la elegida), los iconos de
  premios y destacados, las etiquetas (`SERVICES`), el TEMA y sus colores (`theme_colors`), la
  NORMALIZACIÓN del diseño (`normalize_design`: rangos, solapes, opciones por tipo, HTML saneado
  con el MISMO `press_render.sanitize_html` de las notas de prensa), las plantillas
  (`template_from_design` / `apply_template`) y la importación del one-sheet antiguo
  (`import_legacy`).
  · **`app.py`** (bloque `# ═ ONE SHEET`): los DATOS de cada módulo (`_onesheet_module_data`, con
  `_onesheet_concert_rows`, `_onesheet_metric_rows`, `_onesheet_social_rows`, `_onesheet_photo_pool`,
  `_onesheet_certification_rows`, `_onesheet_release_rows`, `_onesheet_country_rows`,
  `_onesheet_press_rows`…), el pintado (`_onesheet_render_module` → `_onesheet_module.html`, la
  MISMA plantilla en la página pública y en el editor), la página (`_onesheet_page_context` →
  `_onesheet_body.html`), y las rutas `onesheet_*`.
  · **`static/css/onesheet.css`**: el diseño público (`os-*`), el editor (`ose-*`), la pestaña de la
  ficha (`ost-*`), el Roster (`osr-*`) y su gestión (`osrm-*`). **`static/js/onesheet_view.js`**: la
  caja de luz de fotos y vídeos, «Leer más» y compartir en la página pública.

- **LA REJILLA**. 12 columnas; cada bloque lleva `x` (0-11), `w` (1-12), `y` (la FILA) y `h` (filas
  que ocupa). Las filas son de **alto variable** (`grid-auto-rows:auto`): la altura la pone el
  contenido, así que nada se corta ni se deforma, y `y` es solo el orden. El servidor pinta cada
  módulo con `--gc: col / span w` y `--gr: fila / span h` (`_onesheet_block_style`).
  ⚠️ **Se adapta con CONTAINER QUERIES sobre `.os-page`** (no con media queries): así el lienzo del
  editor —que es más estrecho que la ventana— y sus vistas de tableta y móvil (el ancho del marco,
  `.ose__stage--tablet/--mobile`) responden EXACTAMENTE igual que la página real. A menos de 992px se
  suelta la fila explícita y los módulos estrechos pasan a media anchura (`--gc-md`); a menos de 700px
  todo va a una columna **en orden de lectura** — por eso el editor reordena el DOM (`ordenaDom`) y
  el servidor pinta los módulos ordenados por (y, x).
  · Al soltar un módulo, el que pisa a otro lo empuja hacia abajo y luego todo sube lo que puede:
  **`resolver()` en el JS y `resolve_layout()` en Python son espejo** (el guardado normaliza y
  devuelve el diseño, y el editor toma esas posiciones como verdad).

- **LO DINÁMICO SE CALCULA AL PINTAR** (es lo que pidió Dani: «todo lo que se pueda se tiene que
  actualizar solo»). Cifras y seguidores (`chartmetric_metric_point`), los próximos conciertos, las
  certificaciones, el último lanzamiento, los países, las notas de prensa y las redes con enlace no
  guardan datos: se leen de la BD en cada carga. Lo que se guarda es lo ELEGIDO (qué fotos, qué
  vídeos, qué métricas se enseñan, qué certificaciones se ocultan…).
  ⚠️⚠️ **Próximos conciertos: solo lo CONFIRMADO y ya ANUNCIADO** (`_announcement_state(c) ==
  "ANNOUNCED"`, el punto único del anuncio), de hoy en adelante, y solo conciertos, festivales,
  ciclos y eventos promocionales (`ONESHEET_CONCERT_TYPES`). Un Sold Out (`Concert.sold_out`) sale
  con su etiqueta roja. Lo hablado, lo sin anunciar, lo pasado y una TV **no salen nunca**.
  · Las FOTOS: se elige un **álbum entero** (`opts.album_ids`, y entonces se actualiza solo cuando el
  álbum cambia) o **fotos sueltas** (`opts.photo_ids`), mezclando álbumes. Lo que no está en ningún
  álbum se ofrece como un bloque por actividad (`owner:CONCERT:<id>`, `_onesheet_photo_pool`).
  · Un módulo **vacío no se pinta** en la página pública (el hueco de la rejilla se queda; las filas
  vacías miden 0); en el editor se ve como un hueco que dice qué le falta (`.ose-empty`).

- **EL TEMA: el color de fondo manda**. `theme.bg` decide si la página es oscura o clara
  (`is_dark`, luminancia WCAG < 0,42) y de ahí salen letras (`text`), títulos, iconos, botones, los
  grises (`muted`, `faint`), las líneas y las «fichas» translúcidas (`chip`, `card`), todo como
  variables CSS en `.os-page` (`_onesheet_theme_vars`, espejo en JS `themeVars` para verlo en vivo).
  Cada uno se puede FIJAR en el tema y, además, **por módulo** (`block.style`: `text`, `title`,
  `icon`, `accent`, `bg`, `scale`, `align`), y la cabecera tiene su color de nombre. Los módulos son
  **transparentes** por defecto (`module_bg: none`); «suave»/«marcado» les pone la ficha translúcida.
  · **La foto de cabecera se funde con el fondo**: `.os-hero__fade` pinta un degradado de transparente
  al color del fondo en el `fade`% inferior de la cabecera (`bg_gradient_css`, con paradas
  cuadráticas para que no se vea la banda) más un oscurecido arriba (`darken`). El foco de la foto
  (`focus`, «50% 30%») y la altura (`height`, en vh) son de la cabecera.
  · La paleta de colores que ofrece el editor sale de la foto de cabecera (`_press_bg_palette`, el
  mismo cuantizador de las notas de prensa) más los corporativos (`PRESS_CORPORATE_COLORS`).
  · Los textos (biografía, texto libre) se escriben **encima**, con la barra de siempre (negrita ·
  cursiva · subrayado · enlace · alineación · color · tamaño del bloque) — misma barra que el editor
  de comunicaciones (`.pr-toolbar`).

- **LA DIRECCIÓN PÚBLICA Y EL ROSTER**. El `slug` nace del nombre (`_slugify_text`: «Luke Combs» →
  `luke-combs`), único en la tabla (`_onesheet_unique_slug`) y se cambia en Ajustes
  (`onesheet_settings_save`, valida `onesheet_render.slug_ok`: letras, números y guiones, y no una
  palabra RESERVADA —`roster`, `plantillas`, `editor`, `nuevo`, `abrir`…— porque son rutas propias).
  · **`_onesheet_resolve_public(key)`** abre `/onesheet/<key>` por slug, por el **token** (el nuevo o
  el de los one-sheets ANTIGUOS de artista y de gira: los enlaces ya mandados siguen valiendo) y, si
  no hay fila todavía, por el **nombre del artista hecho slug** (y entonces la crea). Por eso el
  slug «del nombre» funciona siempre como alias, aunque se haya cambiado la dirección.
  ⚠️ La fila de un artista **se crea la primera vez que hace falta** (al abrir su pestaña, al abrir
  su enlace o al ordenar el Roster) con `_onesheet_get_or_create`: importa el one-sheet antiguo
  (`onesheet_payload`: bio, premios, vídeos, contactos, fondo, portada), pone su foto de cabecera,
  conserva el token y **deduce lo que llevamos** (`_onesheet_infer_services`: contratación si tiene
  actividades, discográfica si tiene canciones o discos, editorial si tiene parte editorial;
  Management se marca a mano).
  · El **Roster** lista TODOS los artistas (sin los espejos de eventos, `Artist.event_id IS NULL`)
  tengan fila o no —el que no la tiene enlaza a su slug del nombre—, más los eventos/ciclos/giras
  marcados para salir (`roster_visible`, que en ellos nace apagado). Orden: `roster_order` (0 = sin
  ordenar → detrás, por nombre). `published=False` cierra el enlace a quien no tiene sesión.
  · `og:image` = la foto de cabecera (`onesheet_public_og_image` redirige a ella).

- **LAS PLANTILLAS: viaja el FORMATO, no el contenido**. «Guardar este diseño como plantilla» guarda
  `template_from_design(design)`: el tema, la cabecera SIN su foto ni su nombre, y los módulos con su
  sitio y sus opciones pero sin lo propio del artista (`_CONTENT_KEYS`: la bio, las fotos, los
  vídeos, los premios, los contactos, las redes elegidas…). Al cargarla en otro (`apply_template`)
  se conserva la foto de cabecera y **lo que ya había escrito en los módulos del mismo tipo**. El
  editor recarga la página tras aplicarla (el servidor ya la ha guardado).

- **CHARTMETRIC**. `_chartmetric_refresh_artist` pide ahora las URLs PRIMERO y con ellas decide de
  qué otras plataformas pedir seguidores (`_chartmetric_stat_plan`: YouTube, Facebook, X, Deezer,
  SoundCloud y Bandsintown **solo si el artista tiene esa red**; Spotify, Instagram y TikTok
  siempre) — cada fuente es una llamada al día por artista. Deezer y SoundCloud entran en
  `SOCIAL_PLATFORMS` y en `CHARTMETRIC_URL_DOMAIN_MAP`.
  · **Dónde se escucha**: `cm.get_artist_where_people_listen(cmid)` (endpoint premium, 2 créditos) →
  `ChartmetricArtist.top_countries` / `top_cities` ([{name, code2, listeners}]). ⚠️ **La forma exacta
  de la respuesta NO está confirmada** (la documentación pública no la enseña):
  `_chartmetric_parse_where_people_listen` acepta un dict por nombre con la serie de puntos, un dict
  con el valor directo o una lista de dicts, y se queda con el último valor. Si en la primera
  actualización real el módulo de países sale vacío, mirar `chartmetric_artist.last_error`
  («where:…») y ajustar ese lector.

- **EL MÓDULO «DOCUMENTOS»** (sep 2026, lo pidió Dani: «un módulo de un documento que se vea el icono
  del archivo y el nombre del archivo para poder descargarlo»). Tipo **`documents`** del catálogo:
  una lista de archivos (`opts.items`: `url` · `file_name` · `name` —cómo se llama en la página, vacío
  = el del archivo— · `size` · `ext`), en lista o en tarjetas (`layout`) y con o sin el tamaño
  (`show_size`). Cada fila es **el icono de su tipo + el nombre + la flecha de bajar**, y toda la fila
  descarga.
  · **El icono sale de UN catálogo**, `onesheet_render.DOC_ICONS` (+ `doc_icon`/`doc_ext`): lo usa el
  servidor al pintar y el panel del editor lo recibe en `CAT.doc_icons`, así que no hay dos listas.
  ⚠️ Solo iconos que existen en esta Font Awesome (`fa-file-pdf`, `-word`, `-excel`, `-csv`,
  `-powerpoint`, `-zipper`, `-image`, `-audio`, `-video`, `-lines`, `-code`, `fa-book`,
  `fa-calendar-days`, `fa-address-card`; todos comprobados con `grep -c`). Lo que se admite subir es
  `DOC_EXTS` (PDF, Office, iWork, ZIP, imágenes, audio, vídeo, epub, ics, vcf…); `fmt_size` da el
  tamaño en español («2,5 MB»).
  · **Se sube desde el editor** («Añadir documento» en el panel, varios a la vez) a
  **`onesheet_upload_file`** (`POST /onesheet/editor/<id>/archivo`, carpeta `onesheets/docs`), que
  devuelve la URL, el nombre, el tamaño, la extensión y el icono; el bloque guarda eso en `items`.
  ⚠️⚠️ **La descarga va por NUESTRO dominio**: `onesheet_public_file`
  (`GET /onesheet/<slug>/archivo/<bloque>/<archivo>`, en `PUBLIC_ENDPOINTS_EXTRA`) sirve el archivo en
  TROZOS con `Content-Disposition: attachment` y el nombre original (`_safe_download_filename` +
  `filename*` UTF-8). Un enlace directo a Storage con `download` **lo ignoran los navegadores en otro
  dominio** (y Supabase no manda la disposición), así que un PDF se abría en una pestaña en vez de
  guardarse: la misma trampa que la cartelería de un grupo. ⚠️ Solo se sirve lo que está en nuestro
  Storage (`_is_own_media_url`); una URL de fuera se redirige, que esto no puede ser un proxy abierto.
  `_onesheet_open_remote` es el punto que la prueba simula.
  · Es CONTENIDO del artista (`_CONTENT_KEYS`): una plantilla no se lleva los archivos y, al cargarla,
  los que ya había se conservan. Un item sin URL se descarta al normalizar; la extensión se deduce del
  nombre (o de la URL) y se guarda en minúsculas.
  Probado en `check_onesheet` (apartado 6b): guardar, la página pública (icono, nombre, tamaño y el
  enlace de cada archivo), la redirección de un archivo de fuera, la descarga de uno nuestro con su
  nombre y su tipo, los 404, el módulo en el editor, el rechazo de un `.exe` y la subida de un PDF.

- **LAS TRAMPAS que ya costaron algo**:
  ⚠️⚠️ **LOS LOGOS DEL GRUPO LOS PINTA SOLO EL PIE** (bug real, sep 2026: «aparecen duplicados los
  iconos de la parte de abajo en dos filas»). El pie de `_onesheet_body.html` (`os-foot__logos`)
  lleva SIEMPRE los dos logos; el módulo de **contacto** los pintaba también (opción `show_logos`,
  **encendida por defecto**), así que salían **dos filas iguales, una encima de la otra**, al final
  de la página. Y pasaba en CUALQUIER one sheet, tuviera contactos o no: los logos bastaban para que
  el módulo no contara como vacío (`empty = not rows and not logos`), de modo que un módulo de
  contacto SIN un solo contacto se pintaba igual solo para repetir los logos.
  · Se quitó de raíz: fuera los logos del módulo, fuera la opción `show_logos` (de
  `normalize_design` y del panel del editor) y fuera el `.os-logos` del CSS. **Un dato, un sitio.**
  ⚠️ El Roster **no lleva subtítulo** («N artistas · pincha en uno…» se quitó en sep 2026, lo pidió
  Dani): los logos, «Roster» y la rejilla.
  ⚠️⚠️ **El mapeo GRUESO de permisos (`_coarse_endpoint_resource`) NO puede mirar al usuario**. La
  regla de prefijo `onesheet_` va en los DOS mapeos, pero en el grueso devuelve la clave FIJA
  `artists.onesheet`: puesto ahí `_first_access_key` (que llama a `has_access_key` →
  `_current_user_state` → `_ensure_access_caches` → vuelve a construir el catálogo → vuelve al
  mapeo) la primera petición **se quedaba colgada para siempre** (bucle, sin error). Pasó al
  copiar la regla del enforcement al pie de la letra. En `_resolve_request_resource_key` sí vale
  (`ONESHEET_ACCESS_KEYS`: la pestaña de Artistas o la de giras, la primera que tenga).
  ⚠️ Las listas de datos de un módulo se llaman **`d.rows`**, nunca `items`: en Jinja `d.items` es el
  método del dict (la trampa de siempre). Las OPCIONES sí guardan `opts.items` (premios, destacados,
  vídeos, contactos): en las plantillas se leen por `d.rows`, ya calculadas.
  ⚠️ Dentro del editor los enlaces y botones de los módulos llevan `pointer-events:none` (para que
  un clic seleccione el módulo y no navegue); los textos contenteditable no.
  ⚠️ En el editor los módulos los pinta el SERVIDOR (`onesheet_module_html`, con el diseño entero
  para que el tema sea el de pantalla aunque no esté guardado); los cambios de COLOR no pasan por el
  servidor (variables CSS) y los de texto tampoco (se escriben en el propio bloque).
  ⚠️ `_onesheet_can_edit()` = dirección o edición en `artists.onesheet` / `contratacion.giras.onesheet`
  (con ancestros); el gate ya exige edición en los POST por la regla de prefijo, y la página del
  editor se abre en solo lectura a quien solo puede ver.
  ⚠️ `check_onesheet` mira los ENLACES (`/onesheet/<slug>`) y no los nombres: «Prueba One Sheet»
  está contenido en «Prueba One Sheet Dos» y las dos comprobaciones del Roster salían en rojo sin
  que hubiera nada roto.

- **LA PRUEBA: `/tmp/python/bin/python3 tools/check_onesheet.py`** (102 comprobaciones con la app real:
  la pestaña crea la fila y deduce las etiquetas, la importación del antiguo, la página pública con
  lo que sale y lo que no, el token antiguo, el 404, la og, el Roster, el editor y sus datos,
  guardar/normalizar/sanear, pintar un módulo, los ajustes, las plantillas, la gestión del Roster,
  el evento, los permisos y el lector de «dónde se escucha»). Es **idempotente**: se pasa dos veces
  seguidas. Al tocar el One Sheet, en verde.
