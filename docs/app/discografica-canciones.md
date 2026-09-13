# Discográfica · canciones, álbumes y materiales

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- La pestaña «Gastos» de una CANCIÓN tiene su propio permiso (discografica.gastos,
- Fichas (concierto/canción/álbum/artista) — estructura común (en curso): cabecera visual
- Materiales de canción (song_detail.html pestaña materiales + helpers _song_material_ /
- BARRA DE BOTONES de la ficha de CANCIÓN y de ÁLBUM: las dos tienen ya la
- LA MISMA CANCIÓN DADA DE ALTA DOS VECES: se avisa y se FUSIONA. Pasa cuando la
- GÉNEROS de una canción · ETIQUETAS: MusicGenre (catálogo, norm_key UNIQUE) +
- ISRC · vive en REGISTROS (movido ago 2026): el repertorio de códigos y su configurador estaban
- COMPARTIR MATERIALES de una canción o de un álbum · un solo enlace
- CHARTMETRIC · la clave se mete desde la app
- CHARTMETRIC · vinculada pero sin enlaces ni reproducciones (corregido ago 2026). Había cancione
- REPERTORIO · ACTUALIZAR LOS DATOS EN BLOQUE desde los LABEL COPY en PDF: botón
- LOS ISRC SE ESCRIBEN EN SECO, SIN GUIONES. _norm_isrc es el punto único y
- GÉNEROS de una canción · elegir uno ya lo añade
- GÉNEROS de una canción · cómo se añaden
- UN GÉNERO SE ELIGE DE LO QUE YA HAY: SOLO SE CREA CUANDO DE VERDAD NO EXISTE (sep 2026,
- CHARTMETRIC · obj puede venir como ARRAY (bug real, ago 2026). Su OpenAPI declara la
- ISRC · el estado se dice AL PASAR EL RATÓN: en el módulo de la ficha se retiró la
- CHARTMETRIC · las cuatro trampas de la vinculación por ISRC (ago 2026, sacadas por una
- EL ISRC SE GUARDA EN SECO, TAMBIÉN AL VOLCAR UN LABEL COPY: en el PDF vienen con
- FICHA DE CANCIÓN Y DE ÁLBUM · FLECHAS de ANTERIOR y SIGUIENTE: en la barra de
- «SUBIR LC» va PEGADO a «+ Añadir canción» (corregido ago 2026): los dos botones colgaban
- CHARTMETRIC · las canciones SE VINCULAN SOLAS por su ISRC (ago 2026,
- CHARTMETRIC · EL 404 DE «COMPROBAR RUTAS» NO ERA UN FALLO. En el diagnóstico
- CHARTMETRIC · las DOS rutas que estaban mal (ago 2026, bug real
- CHARTMETRIC · vincular canciones y álbumes
- LA BOLSA DE GASTOS DE UN ÁLBUM: la pestaña «Gastos» de la ficha del álbum,
- NOTAS DE PRENSA · LAS FOTOS QUE SE OFRECEN: los ÁLBUMES Y LAS FOTOS SIN ÁLBUM (bug real,
- LA FICHA DE UNA CANCIÓN, DE UN DISCO Y DE UN TERCERO SE ABREN DESDE VARIAS SECCIONES
- UN ÁLBUM NO TIENE GÉNERO NI CALIFICACIÓN PROPIOS: SON DE CADA CANCIÓN. El

---

- ⚠️ **La pestaña «Gastos» de una CANCIÓN tiene su propio permiso** (`discografica.gastos`,
  ago 2026): antes exigía `contabilidad`, que no tiene nada que ver, así que **no había forma de
  concedérsela a nadie** desde Accesos. Es económico-capaz (lo que enseña son importes).
  ⚠️ Se hizo **hermano** de `discografica.canciones`, no hijo: convertir a `discografica.canciones`
  en contenedor haría que su grant se derivara de las hijas (`_coherent_grant_values`) y se
  perderían los permisos ya concedidos del repertorio — el bug que ya pasó con `ventas.reportes`.

- **Fichas (concierto/canción/álbum/artista) — estructura común** (en curso): **cabecera visual**
  (`.ficha-hero`) + **pestañas** (`.ficha-tabs`/`.ficha-tabpane`) + contenido **consolidado** (solo
  campos rellenos, sin textos explicativos) con **edición inline por sección** (`.ficha-section`):
  botón *Editar* (`[data-edit-toggle]`) que muestra el formulario (todos los campos, también vacíos) y
  *Cancelar* (`[data-edit-cancel]`); guarda **sin recargar** con `data-inline`/`ajax_inline` contra
  endpoints de **guardado parcial por sección** (`concert_section_update`, que reutiliza los helpers de
  `concert_update` sin reescribir la lógica económica). En **concierto** TODAS las secciones se editan
  inline (datos, colaboradores, comisionistas, cachés, equipamiento, contratos, notas); las filas
  dinámicas viven en **`static/js/concert_form.js`** (toggle por sección + constructores de filas por
  delegación: `[data-add-row]`/`[data-rows]`/`[data-remove-row]`; catálogos vía `window.CONCERT_FORM`;
  filas existentes rehidratadas desde placeholders `<script type="application/json" data-row-type>`).
  Secciones que **reemplazan** al guardar: colaboradores/comisionistas/cachés; que **añaden** (con
  borrado individual inline en la vista): equipamiento/contratos/notas. La página monolítica
  `concert_edit.html` y sus rutas (`concert_edit_view`/`concert_update`) se **retiraron** (concierto 100%
  inline). Clases en `styles.css`. **Las 4 fichas ya comparten el patrón** (concierto/artista/álbum/
  canción): cabecera `ficha-hero` + `ficha-tabs`/`ficha-tabpane` + secciones inline (incluidas las
  pestañas económicas: las de modal/solo-lectura enmarcadas en `.ficha-section`; las de tabla siempre
  editable —p. ej. Contratos del artista— con vista consolidada + Editar). El **toggle inline es
  `static/js/ficha_inline.js`** (GLOBAL en `layout.html`, compartido por las 4 fichas): `[data-edit-toggle]`/
  `[data-edit-cancel]`; `viewFor` resuelve la vista por `data-view` (selector explícito, p. ej. el "Datos"
  del concierto → `[data-datos-view]`), por `.ficha-section`→`[data-section-view]`, o por zona
  `[data-inline-zone]`→`[data-section-view]`; al mostrar emite el evento **`ficha:shown`**. `concert_form.js`
  ya NO duplica el toggle: solo aporta lo específico del concierto (filas dinámicas + init de datos/secciones,
  reaccionando a `ficha:shown`). En canción/álbum, el "Editar" de Información (antes `?edit=1` con recarga) es
  inline. El botón **“Volver”** va FUERA del hero (barra propia encima) en las 4 fichas. Para mostrar algo
  **solo en modo edición** usar **`data-edit-only="#formId"`** (lo togglea `ficha_inline.js` en `show`/`hide`):
  así el botón *Eliminar* de canción/álbum solo aparece al editar Información (vive dentro de la zona inline,
  por lo que también se oculta al guardar).
- **Materiales de canción** (`song_detail.html` pestaña *materiales* + helpers `_song_material_*` /
  `_build_song_material_context` / upload en `app.py`): `SongMaterial.slot_key` — portada `COVER`
  (principal) / `COVER_PROVISIONAL`; master `MASTER_48`/`MASTER_24`/`MASTER_16` + `SUBPRODUCT`;
  instrumental/TV track `DEFAULT` + `SUBPRODUCT`; stems `BUNDLE` (varios archivos por `bundle_key`). La
  portada efectiva (`Song.cover_url`) la resuelve `_resolve_song_cover_url` (principal o, si no,
  provisional). Audio **solo `.wav`**; barra de estado de 5 básicos, verde solo con portada **principal**.
  Reproductor inline `<audio>` + menú de 3 puntos (compartir/descargar/reemplazar/eliminar) vía macros
  locales de la plantilla.
- **BARRA DE BOTONES de la ficha de CANCIÓN y de ÁLBUM** (ago 2026): las dos tienen ya la
  **`.ficha-quick`** bajo la cabecera (la misma de la ficha de actividad) y en ellas se llena de
  **DERECHA A IZQUIERDA** (`.ficha-quick--end` = `flex-direction: row-reverse`): el primer botón del
  HTML es el de más a la derecha y los que se añadan salen a su izquierda. En la ficha de ACTIVIDAD
  la barra sigue siendo de izquierda a derecha (sin el modificador).
  · «Entrega de masters» pasó a **«Solicitar Masters»** (el título del modal también) y vive ahí.
  ⚠️ El **modal NO se mueve**: está fuera de las pestañas, así que el botón vale desde cualquiera y el
  auto-open de `?delivery_created=1` sigue funcionando. La página pública sigue llamándose «Entrega de
  masters» a propósito: es lo que entrega el tercero, no lo que pedimos nosotros.
  · **«Compartir LC»** subió también a la barra (antes estaba en la cabecera de la pestaña
  Información), así que se comparte el Label Copy desde cualquier pestaña.
  ⚠️⚠️ Y por eso las funciones de COMPARTIR son **GLOBALES** (`static/js/scripts.js`:
  `shareByMail`/`shareByWhatsapp`/`shareBySms`/`copyShareLink`). Estaban definidas DENTRO de los
  bloques `{% elif tab == ... %}` de canción (materiales, editorial) y álbum (beneficiarios), así que
  en las demás pestañas no existían: el «Compartir LC» de la pestaña Información llamaba a una función
  inexistente y el clic **no hacía nada** (bug real). Las tres copias locales se han retirado: una sola
  implementación. Al añadir un botón de compartir a cualquier pantalla, usar las globales.
  · `initTypeahead` (`static/js/typeahead.js`) **sale si el campo no está en la pantalla**: se llama
  desde scripts que corren en TODAS las pestañas de una ficha y petaba con «Cannot read properties of
  null», llevándose por delante el resto del arranque de esa página.
- ⚠️⚠️ **LA MISMA CANCIÓN DADA DE ALTA DOS VECES: se avisa y se FUSIONA** (ago 2026). Pasa cuando la
  canción se crea a mano y luego el PROYECTO discográfico crea la suya (o al revés).
  · **Antes de crear se avisa**: punto único **`_song_duplicate_rows(session_db, título,
  artist_ids)`** — canciones con el MISMO título del **MISMO artista** (dos artistas distintos pueden
  tener una canción que se llame igual: eso NO es un duplicado), comparando **sin acentos ni
  mayúsculas** (`_norm_text_key`). Lo sirve **`api_song_duplicates`** (`/api/canciones/duplicadas`,
  en `SUPPORT_READ_ENDPOINTS`) y lo pinta **`static/js/song_duplicates.js`** (GLOBAL, no-op sin
  `[data-song-dup]`): cada coincidencia con su portada, su artista, su fecha y sus etiquetas
  (Provisional · el PROYECTO que la está preparando), y **el formulario no se envía** hasta decidir.
  · **Dónde está**: el alta de una canción (Discográfica → Repertorio) y el asistente de **PROYECTO
  discográfico** (paso del single). En el asistente, además de «crear otra de todas formas», está
  **«Usar esta»**: el proyecto se monta **SOBRE la canción que ya existe**
  (`existing_song_id` → `_disco_project_create_release(..., existing_song=…)`) en vez de crear otra.
  ⚠️ Lo que ya estaba publicado **no se marca provisional**: eso es solo de lo que crea el proyecto.
  ⚠️ Se comprueba **también en el SERVIDOR** (`discografica_song_create` y `disco_project_create`,
  con `duplicate_ok`): esconder el botón no basta. El aviso del servidor
  (`_song_duplicate_flash`) lleva el ENLACE a la que ya existe, para poder trabajar sobre ella.
  ⚠️ `existing_song_id` se valida contra el ARTISTA (`_song_belongs_to_artist`): el id viaja por el
  formulario y no puede colar una canción de otro.
  · **FUSIONAR dos canciones**: en los **tres puntitos** de cada canción del repertorio, con el
  MISMO motor que los terceros (`MERGE_KINDS["song"]`, rutas `/discografica/canciones/fusion*`, que
  heredan el permiso por la ruta). Se ven las dos campo a campo y se elige qué se conserva; todo lo
  que colgaba de la descartada (ISRC, materiales, autoría, royalties) pasa a la que queda.
  ⚠️⚠️ **EL PROYECTO DISCOGRÁFICO SE MANTIENE**: `disco_projects.song_id`/`release_song_id` son FK a
  `songs` (ON DELETE SET NULL) y `_merge_repoint_references` las **re-apunta a la que se conserva**
  antes de borrar, así que el proyecto sigue vivo hasta que se cierre. La comparación lo **dice**
  antes de fusionar: `_merge_notes` (avisos por categoría, que pinta `[data-merge-notes]` del modal)
  + `_song_projects_map` (punto único de «qué proyecto lleva esta canción», en UNA consulta).
  ⚠️ `_merge_fields` acepta ahora `cfg['skip']`: en una canción se dejan fuera los campos técnicos
  (`SONG_MERGE_SKIP_FIELDS`: el token del enlace público, lo de Chartmetric, los sellos de
  cuándo/quién), que solo harían la tabla ilegible.
  ⚠️ Un `<button>` SIN `type` dentro de un `<form>` **es de envío** y `[type="submit"]` NO lo casa
  (no tiene el atributo): para deshabilitarlo hay que mirar la PROPIEDAD `b.type` (bug real: el
  «Guardar» del alta de canción no se bloqueaba).

- **GÉNEROS de una canción · ETIQUETAS** (ago 2026): `MusicGenre` (catálogo, `norm_key` UNIQUE) +
  `SongGenre` (N:M con posición), `ensure_song_genres_schema`. El catálogo se **siembra** con los
  habituales (`SONG_GENRE_SEED`, 44) y es **ABIERTO**: lo que no esté se crea al vuelo desde el
  propio campo (`_song_genre_get_or_create`), y `norm_key` (sin acentos, minúsculas) evita el
  duplicado — «Pop», «pop» y «POP» son el mismo género.
  · Punto único de guardado **`_apply_song_genres(session_db, song, nombres, present=)`**: crea los
  que falten, respeta el orden y **parte por comas** (un campo suelto puede traer «Pop, Rock»).
  ⚠️ **Mantiene `Song.genre` como ESPEJO en texto**: de ahí lo leen el Label Copy y todo lo que ya
  lo enseñaba, así que no hay dos verdades — la lista manda y el texto la sigue.
  ⚠️ **Con CENTINELA** (`song_genres_present`): si el formulario no trae el campo, no se toca nada
  (un guardado parcial no puede borrar los géneros; la misma regla que las responsabilidades de
  administración).
  · Lectura: `_song_genre_names` (una canción) y **`_song_genres_map`** (muchas, en UNA consulta,
  para listados). Catálogo para sugerir: `_song_genre_catalog` (va a un `<datalist>`).
  · **Se editan en la ficha** (pestaña Información) con el MISMO gestor de chips que las etiquetas de
  una actividad: `initConcertTagManager` acepta ya **`fieldName`** y **`prefix`** (por defecto los de
  concierto, así que los conciertos no cambian), y en la vista consolidada salen como etiquetas.
  ⚠️ El JS del editor va en **`DOMContentLoaded`**: los scripts en línea de una plantilla corren
  ANTES de `scripts.js`, así que antes no existiría `initConcertTagManager`.
  · **OBLIGATORIO al crear un PROYECTO DISCOGRÁFICO con AUDIO** (paso 9 del asistente,
  `data-sw-when="ALBUM,EP,SINGLE,SINGLE_VIDEOCLIP"` — todos menos un videoclip suelto, donde el audio
  ya existe con sus géneros). Lo comprueba **también el servidor** (`disco_project_create`: esconder
  el paso no basta) y se aplica a **todas las canciones del lanzamiento** (el género es de la
  canción, así que en un álbum va en cada tema).
  ⚠️ Un género escrito y sin pulsar Enter cuenta igual: al enviar se añade al vuelo.
  · Las canciones que ya existían **se quedan sin género** hasta que se editen: no se puede inventar
  el género de un catálogo entero.

- **ISRC · vive en REGISTROS** (movido ago 2026): el repertorio de códigos y su configurador estaban
  en Discográfica y ahora son la pestaña **`/registros?tab=isrc`**, que es donde se trabaja con AGEDI y
  SGAE. Motor `_isrc_panel_context(session_db, isrc_tab=…, artist_id=…, year=…, config_subtab=…)` +
  parcial `templates/_isrc_panel.html`; en `registros.html` la pestaña se pinta con `isrc_only`, que
  deja fuera TODO el resto de la pantalla (su contexto no se calcula en esa pestaña).
  ⚠️ El **PERMISO sigue siendo `discografica.isrc`**: no se renombra a propósito (`_sync_access_resources`
  poda los huérfanos **en cascada** y se llevaría por delante los permisos ya concedidos). El
  enforcement de `registros_view?tab=isrc` acepta **la primera** clave que tenga el usuario
  (`discografica.isrc` o `registros`), así que quien tenía ISRC entra aunque no tenga Registros.
  ⚠️ `/discografica?section=isrc` **redirige** a la pestaña nueva (los enlaces guardados siguen
  valiendo) y los endpoints siguen llamándose `discografica_isrc_*` / `discografica_product_code_*`:
  renombrarlos no aporta nada y heredan su permiso por el prefijo.
  ⚠️ **El filtro por artista y el buscador van DENTRO del parcial** (`#isrcPanel`, por delegación):
  vivían en el bloque de JS de `discografica.html` y al mover la pantalla se quedaron atrás, así que
  **no filtraban nada** (bug real). Al mover un panel, el JS se mueve con él.
  · **El REPERTORIO se lee de arriba abajo por FECHA DE PUBLICACIÓN**: la más próxima primero, tanto
  dentro de cada artista como entre bloques (antes se ordenaba por el código ISRC, que no dice nada al
  mirar el repertorio). Cada tema lleva su **PORTADA** y cada código va **en VERDE si ya está
  registrado en AGEDI y en AMARILLO si sigue pendiente** (macro `isrc_badge`, y lo mismo para los
  subproductos), con su leyenda arriba. Lo registrado sale de `SongStatus.agedi_registered_isrcs`
  —el mismo dato que manda en «Pendientes AGEDI»—, leído de una vez para todas las canciones.
  · **Las COLUMNAS son las MISMAS en todos los artistas** (`.isrc-table` con `table-layout:fixed` +
  `<colgroup>`): cada tabla se ajustaba a su contenido y de un bloque a otro no cuadraban. Se retiró
  la indicación «De la publicación más próxima a la más antigua» (el orden sigue siendo ese).
  · **DESCARGAR LISTADO** (ago 2026): botón con dos opciones, **Excel**
  (`registros_isrc_export_xlsx`) y **PDF** (`registros_isrc_export_pdf`), que exportan **SOLO LO QUE
  SE ESTÁ VIENDO**.
  ⚠️⚠️ Las dos opciones son **ENLACES de verdad** (`<a href>`), no botones que navegan con
  `location.href`: el interceptor global de descargas (`static/js/doc_download.js`) solo reconoce
  enlaces, y con `location.href` el fichero se bajaba **en silencio** —sin la barra de «Generando
  documento…»— así que parecía que el botón **no hacía nada** (bug real). El href lo mantiene al día
  `pintaDescargas()` en cada cambio de filtro; nada de construirlo al pinchar. Los filtros del formulario (artista y año) van en la URL como siempre, y los del
  **navegador** —el chip de artista y el buscador— viajan también (`filtro_artista` y `q`) y se
  vuelven a aplicar en el servidor con el MISMO criterio que el JS del panel (punto único
  `_isrc_export_blocks`; el texto se compara con `_norm_text_key`, hermano de `normalizeSearchText`).
  · **El PDF**: logo de PIES arriba a la **derecha** (en todas las páginas), «**Listado Códigos
  ISRC**» centrado y debajo cada artista con su foto y sus canciones tal como se ven (los códigos, en
  verde o ámbar según estén registrados en AGEDI). **Nada más**. Va en **horizontal** para que no se
  corte nada y las páginas llevan **x/x** abajo a la derecha en pequeño (canvas propio: hay que saber
  el total, así que se pinta en una segunda pasada).
  ⚠️ `RLImage` **NO admite un `ImageReader`**: para una imagen dentro de una tabla hay que darle una
  ruta o un fichero en memoria (`_flowable`); el `ImageReader` es solo para pintar en el lienzo. Si el
  logo de la empresa no se puede leer, se cae al de la casa: es un documento que se manda fuera.
  · **El nombre del archivo** es «Listado Códigos ISRC_\<artista\>» y, con varios, todos los nombres
  que se están viendo separados por comas (`_isrc_export_filename`).
  ⚠️ Los dos endpoints van en los **dos** mapeos de `registros_*` y sus enlaces llevan **`tab=isrc`**,
  para que el permiso se resuelva contra la pestaña en la que se está.

- **COMPARTIR MATERIALES de una canción o de un álbum · un solo enlace** (ago 2026). Lo que se manda
  por correo/WhatsApp/SMS **NUNCA es el fichero ni la URL de Storage**: es siempre
  `public_material_view` (`/material/<token>`), una página nuestra con el juego de **og:** completo,
  así que la previsualización es **idéntica en los tres canales**: la **PORTADA** de imagen,
  «**<Artista> · <Canción o Álbum>**» de título y «**Descarga · <tipo de material>**» de subtítulo
  («Descarga · Instrumental»). Dentro, el botón de descargar.
  · Motor: `MATERIAL_SHARE_KINDS` (MATERIAL · STEMS_BUNDLE · SONG_COVER · ALBUM_MATERIAL) ·
  **`_material_share_url`** (lo que se pone en cualquier `share_url`) · **`_material_share_context`**
  (lo que necesitan la página, su og:image y el botón) · `_album_material_label` ·
  `_album_material_rows_payload` (los materiales del álbum con su enlace).
  · El **token es el mismo** para la página y para la descarga: `/material/<token>` pinta y
  `public_song_material_download` / `public_song_material_bundle_download` /
  **`public_album_material_download`** (nuevo) sirven el fichero con ESE token.
  · La miniatura la sirve **`public_material_og_image`** (`_og_image_jpeg_bytes`, 1200×630 desde
  nuestro dominio): portada → foto del artista → logo.
  ⚠️ Antes cada sitio compartía una cosa distinta y por eso «no se veía nada»: en **canción**,
  `share_url` apuntaba **al endpoint de descarga** (un fichero: nada que previsualizar) y en **álbum**
  no había compartir siquiera —la pestaña enseñaba el `file_url` crudo de **Supabase**, que además es
  un dominio ajeno—. El dominio sale bien porque todo se construye con `_external_url_for`.
  ⚠️ La portada que solo vive en `Song.cover_url` (sin fila de `SongMaterial`) se comparte con el kind
  **`SONG_COVER`**, que sirve `public_song_material_download` desde nuestro dominio: si no, ese único
  hueco seguiría repartiendo la URL de Storage.

- **CHARTMETRIC · la clave se mete desde la app** (ago 2026): el refresh token caduca y se rota, así
  que ya no hace falta entrar en Render. Se guarda en `AppSetting` (`CM_TOKEN_SETTING`) y
  `chartmetric_utils` lo lee por un **proveedor** (`set_token_provider`, lo enchufa `app.py`), con lo
  del entorno como respaldo. Al guardar se **prueba al momento** y se apunta el resultado
  (`_chartmetric_record_status`), que es lo que pinta la **etiqueta de estado**
  (`_chartmetric_status`: Desactivada · Sin comprobar · **Conectada** · **Con error**, con el motivo
  exacto de Chartmetric debajo). `clean_api_key` quita espacios, comillas y el «refreshtoken:»
  delante; al cambiar la clave se tira el access token cacheado (`reset_access_token`) o el proceso
  seguiría usando el viejo y «probar conexión» mentiría.
  ⚠️ **`chartmetric_ping` hace una LLAMADA REAL**, no solo saca el token: una cuenta sin créditos
  saca token y falla en todo lo demás, así que un ping que solo pidiera token diría «correcta».

- **CHARTMETRIC · vinculada pero sin enlaces ni reproducciones** (corregido ago 2026). Había canciones
  con `cm_track` puesto —y por tanto en verde como «Vinculada»— y con **todos los botones vacíos y cero
  reproducciones**. Dos causas independientes:
  ⚠️ **La ruta de las reproducciones nunca se confirmó.** `get_track_stat` pedía
  `/api/track/{id}/{source}/stats` —lo decía su propio comentario, «CONFIRMAR nombres reales al
  integrar»—, la API devolvía 404, `_get` levantaba `RuntimeError` y el `except` se lo tragaba: ni
  datos ni aviso. Ahora hay **`TRACK_STAT_PATHS`** (la de la referencia,
  `/api/track/chartmetric/{id}/stats/{source}`, primero) y se **prueba y se recuerda la que responde**
  (`_TRACK_STAT_PATH_OK`, mismo patrón que la URL base de Cabify y la ruta de adjuntar de Holded). Un
  «sin créditos» o un 429 **cortan** la prueba: son definitivos y no se gastan llamadas de más.
  ⚠️ **Los enlaces dependían del nombre EXACTO del campo.** Se enumeraban a mano
  (`spotify_track_id`/`spotify_id`/`spotify_track_ids`) y bastaba que la respuesta trajera otra forma
  para no sacar ninguno. Ahora **`_cm_scan_id`** recorre las claves y acepta la que contenga todas las
  palabras pedidas (con `exclude` para no confundir el id de álbum con el de track), y
  `_cm_explicit_url` coge la URL si viene hecha. **Apple** se construye desde el id de iTunes
  (`music.apple.com/es/song/<id>`) y **Amazon** desde el suyo: antes se exigía una URL explícita que
  Chartmetric casi nunca manda, así que esos dos botones estaban **siempre** vacíos.
  · **Ya no falla en silencio**: `_cm_refresh_song_streams` devuelve `{points, error}` y
  `cm_song_reresolve` dice cuántos enlaces y cuántos puntos ha traído, o por qué no ha podido. Y
  re-resolver a mano **pisa** los enlaces (`force=True`): es para arreglar lo que está mal.
  ⚠️ **Pendiente de la primera prueba real**: en local no hay `CHARTMETRIC_REFRESH_TOKEN`, así que las
  rutas candidatas no se han podido probar contra la API. Si la buena no fuera ninguna de las tres, el
  aviso de la pantalla lo dirá con el error exacto de Chartmetric.

- **REPERTORIO · ACTUALIZAR LOS DATOS EN BLOQUE desde los LABEL COPY en PDF** (ago 2026): botón
  **«Actualización de datos en bloque»** a la izquierda de «+ Añadir canción» (Discográfica →
  Repertorio → Canciones). Es la herramienta para volcar el catálogo **ANTIGUO**: se suben **varios
  PDF a la vez**, cada uno puede traer **varias canciones**, y de cada una se decide **campo a
  campo** qué se queda —a la IZQUIERDA lo que dice el LC, a la DERECHA lo que hay ahora—.
  · Motor de lectura: **`labelcopy_read.py`** (puro, ni Flask ni BD), que reutiliza el lector de
  renglones de `invoice_read.pdf_rows` (con el texto plano los rótulos y los valores salen en
  bloques separados y desordenados). Reconoce los campos por su RÓTULO con alias
  (`FIELDS`) y la tabla de **Reparto autoral** (Autor · Rol · Editorial · %).
  ⚠️ **El PDF se parte por el rótulo «Título»**, no por la portada «Label Copy»: los LC de otras
  fuentes no la llevan.
  ⚠️ Los ISRC se cortan **antes de la palabra «vídeo»**: un LC trae los de audio y los de vídeo en
  el mismo renglón y aquí solo valen los de AUDIO.
  · Backend: `LC_FIELDS` (qué campos y de qué tipo) · `_lc_song_card` (con qué canción casa y la
  comparación) · `_lc_match_song` (**por ISRC**, luego por título, y con varias del mismo título
  manda el artista) · `_lc_apply_fields` · endpoints `discografica_lc_bulk_analyze` / `_apply` /
  `_artists`. UI: `_lc_bulk_modal.html` + `static/js/lc_bulk.js` + clases `.lc-*`.
  · ⚠️⚠️ **LO QUE SE VINCULA NO SE GUARDA COMO TEXTO**: los autores, su editorial y los intérpretes
  se buscan en la base y se elige **a quién corresponde** —con su foto— o se crea al vuelo. Un
  nombre escrito en un PDF no puede decidir por su cuenta a qué ficha apunta. En los autores salen
  además los **INTEGRANTES** de artistas que aún no tienen ficha de tercero
  (`_lc_person_options(..., members=True)`), que es de donde salen las condiciones del contrato.
  · **Lo que ya coincide se PLIEGA** (`<details>`): con 18 campos y 3 distintos, lo que hay que
  decidir se perdía entre lo que no hay que tocar.
  · **Las que no están en el sistema se CREAN** una a una, eligiendo el artista (buscador con foto).
  ⚠️ `Song.release_date` es NOT NULL: sin fecha en el LC se pone la de hoy (mismo criterio que al
  pasar una demo al repertorio).
  ⚠️ **Nada se borra**: los ISRC y los intérpretes que ya estaban se conservan (un código no se
  quita por no venir en un LC viejo) y un autor que ya está no se duplica, se completa.
  ⚠️ Prueba de regresión hecha con LC REALES de la propia app (uno y dos temas en un PDF) y con uno
  «de fuera» en formato genérico.

- ⚠️⚠️ **LOS ISRC SE ESCRIBEN EN SECO, SIN GUIONES** (ago 2026). `_norm_isrc` es el punto único y
  **antes AÑADÍA los guiones** (ES-A2A-25-00001) porque se lee mejor; pero es la forma con la que
  **no se encuentra nada fuera**: Chartmetric no devuelve resultados con guiones, y por eso había
  canciones que no se vinculaban solas y que, buscándolas a mano con el código seguido, aparecían a
  la primera. Ahora devuelve el código en seco, así que se muestra y se guarda igual en toda la app
  y lo que se pegue con guiones **se limpia solo** al pasar por ahí. Relleno puntual
  `_isrc_dashes_backfill_once` (marca `isrc_no_dashes_v1`) para lo ya guardado.
  · **Al vincular a mano en Chartmetric, la barra viene con el ISRC** (no con el título) y busca
  sola: por el título salen homónimos de otros artistas.
  · **En la ficha, el ISRC se dice UNA vez**: estaba en unas pastillas con el color del estado
  **y otra vez** en la tabla de abajo. Ahora solo la tabla, con **su estado en el propio código**
  (verde registrado en AGEDI · ámbar pendiente).

- **GÉNEROS de una canción · elegir uno ya lo añade** (ago 2026): al pinchar un resultado de la
  lista la etiqueta se pone sola; el **«+»** queda para dar de alta uno que **todavía no existe**.
  La selección se reconoce por `inputType === 'insertReplacementText'` (Chrome y Safari) y, en los
  que no lo marcan, porque el valor **salta de golpe** y coincide exactamente con una opción del
  catálogo.

- **GÉNEROS de una canción · cómo se añaden** (ago 2026): **pinchar uno de la lista lo añade** y el
  **«+»** es para dar de alta uno que todavía no existe (también con Enter). Motor
  `static/js/song_genres.js`; las etiquetas y sus ocultos los sirve el servidor (ver arriba).

- ⚠️⚠️ **UN GÉNERO SE ELIGE DE LO QUE YA HAY: SOLO SE CREA CUANDO DE VERDAD NO EXISTE** (sep 2026,
  bug real: «al añadir el género de un single no se muestran los ya creados y se duplican»). El
  mismo género escrito de dos formas son **dos géneros**, y con eso el repertorio deja de poder
  filtrarse ni presentarse a radio, a una playlist o a una sincronización por género.
  ⚠️⚠️ **La causa: el asistente de un PROYECTO discográfico —que es DONDE se crea el single— usaba
  un `<datalist>` NATIVO** y su propio gestor de chips, en vez del selector de la casa. Con un
  datalist, **elegir una opción no añade nada** (hay que escribir el género entero y pulsar Enter),
  que es justo lo que hace que cada uno lo escriba a su manera. Ahora los DOS sitios que ponen
  géneros —la ficha de la canción y el asistente— usan el MISMO `data-genre-picker`
  (`static/js/song_genres.js`, global y por delegación), así que una mejora vale para los dos.
  · **La búsqueda tolera la escritura**: `clave()` es el **espejo de `_norm_text_key`** (minúsculas,
  sin acentos y la puntuación como un espacio) **y además compara SIN ESPACIOS**, así «hiphop»,
  «hip-hop» y «HIP HOP» llevan todos a **«Hip Hop»**. Lo que EMPIEZA por lo escrito sale primero.
  ⚠️ Si se toca `clave()`, se toca `_norm_text_key`: es lo que hace que la lista y el servidor
  entiendan lo mismo por «el mismo género».
  · **EL DEL CATÁLOGO MANDA** (`equivalente()`): al añadir algo que equivale a uno que ya existe se
  pone **el del catálogo con su ortografía**, no lo escrito. Por eso «HIP-HOP» + «+» deja «Hip Hop»
  y **no crea otra fila** (comprobado: el catálogo pasa de 44 a 45 al crear uno nuevo de verdad, y
  «Hip Hop» sigue teniendo UNA sola).
  · **Crear se DICE**: cuando lo escrito no existe de ninguna forma, la última fila de la lista es
  **«Crear «X» · No está en la lista: se añade como género nuevo»**. Así se sabe cuándo se está
  duplicando sin querer y cuándo se está creando a propósito.
  ⚠️⚠️ **La lista es UNA SOLA para toda la página y cuelga del `<body>`** (`app33FloatList`): dentro
  del modal del asistente cualquier `overflow` la recortaría, y `.ta-results` es `position:fixed`,
  así que sin colocarla se quedaba QUIETA al mover el modal. Por eso el `<div data-genre-results>`
  se retiró de las tres plantillas: lo crea el motor (si no, `ajax_inline` dejaría una caja
  huérfana en el body por cada repintado — comprobado: sigue habiendo **una**).
  ⚠️ `song_genres.js` se carga **después de `float_list.js`** en `layout.html`.
  ⚠️ La compuerta de «es obligatorio» del asistente lee ahora **`window.app33Genres.puestos(picker)`**
  y marca el campo en **ROJO** con `app33FormCheck.fail` (la regla de la casa), en vez de un texto
  suelto debajo.
  ⚠️ Las **ETIQUETAS DE UN MEDIO** usan el mismo motor, así que heredan todo esto.
  ⚠️ Las etiquetas de una ACTIVIDAD son otra cosa (texto libre sin catálogo) y siguen con
  `initConcertTagManager`.

- ⚠️⚠️ **CHARTMETRIC · `obj` puede venir como ARRAY** (bug real, ago 2026). Su OpenAPI declara la
  respuesta de **`/api/track/{type}/{id}/get-ids`** con `obj` como **lista** (un elemento por ISRC),
  y `get_track_ids_from_isrc` solo aceptaba un dict: devolvía **`{}` SIEMPRE**, así que **«Vincular
  por ISRC» no vinculaba ni una** —mientras que buscando ese mismo ISRC a mano la canción aparecía a
  la primera, porque ese camino acaba cayendo en `/api/search`—. `get_album_ids_from_upc` sí lo
  contemplaba; era una asimetría. Repasadas TODAS las funciones del cliente: ninguna queda sin
  manejar la lista.
  · **RESPALDO**: si `get-ids` no resuelve, la vinculación automática busca el ISRC con
  `search_tracks` (el camino que se sabe que funciona) y **solo acepta el resultado si trae ESE
  ISRC**: por texto salen homónimos de otros artistas y vincular al equivocado es peor que no
  vincular.
  ⚠️ Las canciones que el bug marcó como «ese ISRC no está» (`cm_isrc_checked_at`, que evita
  repreguntar en 7 días) llevaban una marca **falsa**: `_cm_isrc_checked_reset_once` (marca
  `cm_isrc_checked_reset_v1`) las devuelve a la cola una vez.
  · Y el ISRC se enseña **en seco** también en los listados que lo leían crudo de `Song.isrc`
  (Integraciones, royalties, radio): pasan por `_norm_isrc`.

- **ISRC · el estado se dice AL PASAR EL RATÓN** (ago 2026): en el módulo de la ficha se retiró la
  nota explicativa; cada código lleva su color (verde registrado en AGEDI · ámbar pendiente) y en el
  tooltip se dice el estado y, si ya está registrado, **cuándo** (`SongStatus.agedi_updated_at`).

- ⚠️⚠️ **CHARTMETRIC · las cuatro trampas de la vinculación por ISRC** (ago 2026, sacadas por una
  auditoría contra su OpenAPI):
  · **`obj` viene como ARRAY** en `/api/track/{type}/{id}/get-ids` y solo se aceptaba un dict → la
  función devolvía **`{}` siempre** y no se vinculaba NADA (ver arriba).
  · ⚠️ **Un resultado de `/api/search` SIN ISRC se estaba aceptando**: el filtro era
  `if suyo and suyo != code`, y con el campo vacío el `and` cortaba y pasaba. En su spec el `isrc`
  de un resultado es **opcional**, así que se colaba cualquier homónimo. Ahora se exige que el ISRC
  **coincida**: enganchar la canción al track de otro es mucho peor que no vincularla.
  · **Se preguntaba DOS VECES por el mismo código**: el ISRC está en `Song.isrc` **y** en
  `SongISRCCode`, y la lista no se deduplicaba (con el respaldo, cuatro llamadas donde basta una).
  Se arma con `_norm_isrc_list`, que normaliza y quita repetidos. Importa porque **cada llamada
  cuesta créditos**.
  · **La búsqueda MANUAL nunca usaba `get-ids` para una canción**: a `_cm_first` le faltaba
  `chartmetric_ids`, que es la clave que la API devuelve para un TRACK (la de álbum sí estaba, por
  eso los discos sí resolvían por ahí). Caía siempre en `/api/search` — que es, precisamente, por lo
  que a mano «sí encontraba» lo que la automática no.

- ⚠️ **EL ISRC SE GUARDA EN SECO, TAMBIÉN AL VOLCAR UN LABEL COPY** (ago 2026): en el PDF vienen con
  guiones y `_lc_apply_isrcs` los guardaba tal cual, así que **cada volcado volvía a meter el formato
  viejo** y deshacía el arreglo. Ahora pasa por `_norm_isrc` al guardar (el relleno puntual va por
  `isrc_no_dashes_v2`, porque el v1 ya había corrido).
  ⚠️ En el detalle de una **liquidación de royalties** solo se normaliza el código de una CANCIÓN
  (`item_kind == 'SONG'`): en un álbum ese campo es su **Product Code** y `|isrc` lo destrozaría. Es
  el mismo criterio que ya aplicaba el PDF.

- **FICHA DE CANCIÓN Y DE ÁLBUM · FLECHAS de ANTERIOR y SIGUIENTE** (ago 2026): en la barra de
  botones, **a la derecha del todo**, dos flechas para pasar a la ficha de al lado **sin volver al
  listado**, y **conservando la PESTAÑA** (si estás en «Editorial», la siguiente se abre en
  «Editorial»; si esa pestaña no existe en el destino —de una canción a un álbum— se cae a
  «Información»). En la primera solo sale la de siguiente y en la última solo la de anterior.
  · ⚠️⚠️ **«El siguiente» depende de DE DÓNDE SE VIENE**, así que el listado viaja en la URL:
  **`?nav=`** (`repertorio` · `repertorio_albumes` · `lanzamientos` · `syncros`) y sus filtros con
  él (`nav_artista`, `nav_q`, `nav_onestop`). Desde el **repertorio** se recorren las canciones (o
  los álbumes) **de ESE artista**, que es su bloque en la pantalla; desde **Lanzamientos**, la lista
  mezclada de canciones y álbumes tal como se ve; desde el **repertorio de Syncros**, sus temas con
  los filtros que hubiera puestos.
  · Motor: `_ficha_nav_args` · `_ficha_nav_items` · `_ficha_nav_url` · **`_ficha_nav`** (que la
  ficha recibe como `ficha_nav`), y cada listado **reconstruye su orden con el MISMO código que lo
  pinta** —`_disco_launch_items` (extraído de `discografica_view`), `_sync_repertoire_filtered` y
  `_sync_public_repertoire_filtered`—: si no, «el siguiente» no sería el que está debajo.
  ⚠️ Los enlaces de las **PESTAÑAS** arrastran `nav` (`**ficha_nav_args`): sin eso, al cambiar de
  pestaña se perdería el listado y las flechas desaparecerían. Y el botón **«Volver»** lleva al
  listado del que se viene (`back_url`), no siempre al repertorio.
  ⚠️ Si la ficha **ya no está en ese listado** (le han cambiado la fecha, ha salido del filtro) no
  se pintan flechas: mejor eso que llevar a cualquier sitio.
  · **En la ficha PÚBLICA de Syncro** funciona igual (`?nav=rep` + `ver`/`genero`/`artista`, que es
  lo que lleva el enlace de cada fila del **repertorio abierto**): `_sync_public_nav`, con sus
  rótulos en los dos idiomas (`SYNC_TEXTS['prev'|'next']`). Un enlace suelto que llega por correo
  **no** lleva `nav`, así que no enseña flechas: no hay listado que recorrer.
  ⚠️ El JS del botón «Volver» de esa página cambiaba el destino del **primer `<a>`** de su caja: al
  meter ahí las flechas, se lo cambiaba a la de «anterior». Ahora busca `.btn-volver`.

- ⚠️ **«SUBIR LC» va PEGADO a «+ Añadir canción»** (corregido ago 2026): los dos botones colgaban
  sueltos de un `d-flex justify-content-between` de TRES hijos, así que el de «Subir LC» se quedaba
  flotando **en mitad de la barra**. Van juntos en su propia caja.

- **CHARTMETRIC · las canciones SE VINCULAN SOLAS por su ISRC** (ago 2026,
  `_cm_autolink_songs_by_isrc`): al pulsar **«Actualizar todos»** —y en el refresco diario y en el
  cron— las canciones que siguen **sin `cm_track`** se buscan **por su ISRC** en Chartmetric y se
  vinculan, rellenando además sus **enlaces de plataforma** (`…/get-ids`, que es lo que deja los
  botones puestos). Orden de la pasada: **artistas → vincular por ISRC → reproducciones**, así lo
  recién vinculado ya trae sus datos sin pulsar nada más. Botón **«Vincular por ISRC»** en la
  subpestaña de Canciones para forzarlo en el momento (en primer plano, para poder decir cuántas han
  entrado).
  ⚠️⚠️ **Esto es lo que `_cm_resolve_artist_song_links` NO puede hacer**: ese solo casa contra los
  tracks que la API devuelve **para ese artista**, así que una canción que no esté en esa lista **no
  se vinculaba nunca sola** (había que ir a «Actualizar» una a una).
  ⚠️ El ISRC se manda **SIN GUIONES** (`cm.norm_isrc`, el punto único; con ellos Chartmetric no
  encuentra nada) y se prueban **todos** los de la canción: el del campo y los de la pestaña de
  códigos (`SongISRCCode`), que es donde los tiene la mayoría. Los códigos se leen de UNA consulta
  para todas las candidatas.
  ⚠️ **Cuesta créditos**, así que: **tope por pasada** (`CM_AUTOLINK_PER_RUN` = 60, y se dice cuántas
  quedan), una canción **sin ISRC no gasta ninguna llamada**, y lo que **no aparece se apunta** en
  `Song.cm_isrc_checked_at` para no volver a preguntarlo en cada refresco — se reintenta pasados
  `CM_AUTOLINK_RETRY_DAYS` (7) días, porque un lanzamiento reciente entra en su catálogo después.
  ⚠️⚠️ Si la API **FALLA** (sin créditos, 429, red) **se para y NO se marca nada**: «no he podido
  preguntar» no es «no está» (con lo contrario se descartarían canciones buenas durante una semana).
  ⚠️ Los dos botones de esa cabecera van en **formularios SEPARADOS**: dos `name="action"` en el
  mismo formulario se pisan (bug ya conocido de esta pantalla).
  Probado con un Chartmetric simulado: el ISRC de la pestaña guardado con guiones se pregunta en seco,
  la que existe se vincula con sus enlaces, la que no queda apuntada, la segunda pasada no gasta
  ninguna llamada, a los 9 días se reintenta, con la API caída no se marca nada, el tope funciona y el
  refresco general lo llama en su orden.

- ⚠️⚠️ **CHARTMETRIC · EL 404 DE «COMPROBAR RUTAS» NO ERA UN FALLO** (sep 2026). En el diagnóstico
  salía «reproducciones (spotify) → /api/track/…/spotify/stats · 404 Cannot GET», y parecía que la
  app pedía la ruta mal. Era la TERCERA candidata: el **respaldo sin modo**, que se conservaba «por
  si volvía» y que el diagnóstico probaba con **la misma etiqueta** que las dos buenas.
  · Está confirmado en el OpenAPI oficial que `/api/track/{id}/{platform}/stats/{mode}` es la ÚNICA
  ruta de estadísticas de un track, así que ese respaldo **se ha retirado**: solo podía dar 404 y
  cada intento gastaba un crédito.
  · Ahora cada fila del diagnóstico **dice qué modo prueba** (`highest-playcounts` / `most-history`)
  y se comprueban también **YouTube y TikTok**.
  · Y antes de las rutas, el diagnóstico dice **lo que hay guardado**: cuántos puntos hay de cada
  plataforma, hasta qué fecha, cuándo se refrescó por última vez y **cada cuánto le toca**. Sin eso,
  «está vinculada pero no salen las reproducciones» no se distingue de «todavía no le ha tocado».

- ⚠️⚠️ **CHARTMETRIC · las DOS rutas que estaban mal** (ago 2026, bug real: una canción vinculada por
  el buscador se quedaba **sin enlaces y sin reproducciones**, con «Cannot GET
  /api/track/170983676/spotify/stats»). Las rutas de verdad, confirmadas en su referencia
  (el **sitemap** de `apidocs.chartmetric.com` es público y lista las 149 rutas: la forma más rápida
  de comprobar una):
  · **Las reproducciones llevan un MODO al final**: `GET /api/track/{id}/{plataforma}/stats/{modo}`,
  con `modo` **obligatorio** — `highest-playcounts` (el id que más se ha escuchado, que es el que
  representa a la canción: es el que usamos) o `most-history` (la serie más larga). Sin el modo,
  Chartmetric contesta un **404 de Express** («Cannot GET …»), o sea que **esa ruta no existe**.
  · **Los IDS DE PLATAFORMA NO están en el metadato del track**: `/api/track/{id}` devuelve nombre,
  ISRC, portada, artistas, álbumes y `cm_statistics`, y **ningún** id de Spotify, Apple, Amazon ni
  YouTube. Están en su propio endpoint, **`GET /api/track/{tipo}/{id}/get-ids`** (tipo =
  `chartmetric`), que devuelve `spotify_ids`, `itunes_ids`, `amazon_ids`, `youtube_ids`, `deezer_ids`…
  **cada uno una LISTA (o null)**. Punto único **`cm.get_platform_ids(kind, id)`** (+
  `get_track_platform_ids` / `get_album_platform_ids`) y **`_cm_urls_from_get_ids(payload, kind)`**,
  con las plantillas de enlace en `_CM_URL_TEMPLATES`. El rascado del metadato
  (`_cm_track_platform_urls`) se conserva **como respaldo**.
  ⚠️⚠️ **La serie viene envuelta DOS veces**: `{obj: [{domain, track_domain_id, type, data:[{timestp,
  value}]}]}` — `obj` es una **lista de series** y los puntos están dentro de **`data`**. Devolviendo
  `obj` tal cual, cada «punto» era una serie sin `timestp` y se descartaban todos: **0
  reproducciones, sin ningún error**. Lo resuelve `_cm_extract_series` (prefiere la serie del `type`
  pedido) con `_cm_es_punto`.
  ⚠️ En el refresco de un ARTISTA los ids de plataforma se piden solo para las canciones que se
  quedan **sin ningún enlace** y con **tope** (`CM_GET_IDS_PER_ARTIST` = 25): cada llamada gasta
  créditos. El resto los rellena el «Actualizar» de esa canción.
  ⚠️ Tres matices más de su **OpenAPI** (que es público: `apidocs.chartmetric.com/reference/openapi.json`,
  y con `llms-full.txt` al lado — la forma de comprobar esta API sin adivinar):
  · en **Spotify** el `type` por defecto es **`popularity`**, no `streams`, así que las reproducciones
  hay que pedirlas a mano (`type=streams`); en **YouTube** el spec **no declara valores** de `type`, así
  que no se manda ninguno y se deja su defecto (mandar uno inventado es pedir un 400);
  · el `obj` de **`get-ids` es un ARRAY** (el de stats también, con UN elemento);
  · el **valor de un punto puede llegar como TEXTO** («may arrive as numeric or string for large
  counters»): lo normaliza `_cm_point_value` — guardarlo tal cual metía texto en una columna numérica.
  · **«COMPROBAR RUTAS»** (icono de estetoscopio en Integraciones → Chartmetric → Canciones,
  `cm_song_diagnose` → `cm.diagnose_track`): prueba las rutas de ese track y enseña **qué ha
  contestado cada una** (responde y con qué claves · 404 · sin permisos · sin créditos), el mismo
  patrón que el diagnóstico de Holded. Es la forma de comprobar la API **sin tener el token
  delante**: si Chartmetric vuelve a cambiar una ruta, se ve en pantalla en vez de en el log.

- **CHARTMETRIC · vincular canciones y álbumes** (ago 2026):
  · ⚠️ **El ISRC se busca SIEMPRE EN SECO**: nosotros lo guardamos con guiones (ES-A2A-25-00001)
  porque se lee mejor, pero la API busca por el código seguido y con guiones **no encuentra nada**.
  Punto único **`chartmetric_utils.norm_isrc`** (y **`norm_code`** para el UPC/EAN de un álbum),
  aplicado dentro de `get_track_ids_from_isrc`/`get_album_ids_from_upc`, así que no hay que acordarse
  en cada llamada. `cm_song_reresolve` prueba además **todos** los ISRC de la canción
  (`_current_song_isrcs`), no solo `Song.isrc`, que en muchas está vacío.
  · **Pegar el ENLACE** cuando no lo encuentra solo: botón «Vincular» en Integraciones → Chartmetric
  (Canciones y Álbumes) → modal con la URL de Chartmetric (`cm_link_manual`). `_cm_id_from_url` saca
  el id de `…/track/123`, `…/album/456`, con cola de parámetros o del id a pelo, y
  **`_cm_link_row_manual` lo comprueba contra la API antes de guardar**: un enlace mal pegado no deja
  la ficha apuntando a otra obra. Si el enlace es de un álbum y se está vinculando una canción (o al
  revés), se avisa y no se toca nada.
  · **Buscador**: en el mismo modal se busca por nombre —o pegando un ISRC/UPC— con
  `api_cm_search` (`/api/chartmetric/buscar`, JSON) → `search_tracks`/`search_albums` (`/api/search`,
  extracción tolerante con la forma de la respuesta). Y arriba de cada lista hay un buscador que
  filtra **nuestras** filas (`[data-cm-filter]`, las listas son de 400).
  · **Álbumes**: ya tienen «Re-resolver» propio (`cm_album_reresolve`) por UPC y por los códigos de
  producto de sus formatos, con `get_album`/`get_album_ids_from_upc` y
  `_cm_album_platform_urls` (el deep link de Spotify de un disco es `/album/…`, no `/track/…`).
  ⚠️ Las **REFERENCIAS que genera la casa** (REF00001, `AlbumProductCode.generated_sequence`) NO son
  un código de barras: se descartan y además se exige forma de UPC/EAN (`len(norm_code) >= 8`). Si no,
  se le preguntaba a Chartmetric por «00001» y el disco podía quedar vinculado al de otro.
  · ⚠️ **El casado AUTOMÁTICO también mira los ISRC de la pestaña de códigos**
  (`_cm_resolve_artist_song_links` + `SongISRCCode`, cargados de una vez para todas las canciones del
  artista): mirando solo `Song.isrc` —vacío en la mayoría— no vinculaba nada solo.
  · ⚠️ **Un UPC no es un id de Chartmetric**: `api_cm_search` probaba primero cualquier cosa toda
  dígitos como id, así que un código de barras podía traer otra obra. Con pinta de UPC/EAN
  (≥8 dígitos) se va directo a la búsqueda por UPC.
  · ⚠️ **Sin créditos o con 429 NO se dice «revisa el ISRC»**: `get_track_ids_from_isrc(...,
  raise_on_error=True)` deja subir el motivo real (lo usa `cm_song_reresolve`). Con el `except` a
  secas, un fallo de la API era indistinguible de «ese ISRC no está».
  · **Al VINCULAR se actualizan los botones y los números en ese momento**:
  `_cm_apply_song_links(..., force=True)` en la vinculación A MANO **pisa** los enlaces (corregir un
  vínculo equivocado tiene que cambiarlos; lo bloqueado a mano en `cm_links_locked` no se toca ni con
  force); `_cm_recompute_link_status` da **tres** estados —**Sin vincular** (sin `cm_track`) ·
  **Vinculada** (hay id) · **Completo** (los cinco enlaces)—, porque el antiguo COMPLETE exigía cinco
  plataformas que Chartmetric no da nunca y todo se quedaba en «Pendiente»; y al recibir
  `inline:updated` de la zona de canciones o álbumes se **refresca también `#cmZoneSummary`**
  (los contadores viven en OTRA zona, así que antes los números de arriba no se enteraban). El resumen
  cuenta ahora **canciones y álbumes vinculados**, no solo artistas.
  · Los buscadores de las listas indexan el ISRC y el UPC **también en seco** (`data-cm-search` con
  `|replace('-','')`): pegando el código seguido no encontraba la fila que lo tiene con guiones.
  · Los endpoints `cm_*` y `api_cm_search` se mapean a la sección **`integraciones`** (a mano y por
  prefijo) y exigen además dirección o edición en discográfica.
  · **NADA en Integraciones recarga la página**: todas las acciones de las cuatro pestañas (Pleo,
  Cabify, Chartmetric y Enterticket) son `data-inline` con su zona —`#pleoZone-N`, `#cabifyZone-N`,
  `#cmZoneSummary`/`#cmZoneArtists`/`#cmZoneSongs`/`#cmZoneAlbums`, `#etZone`—, así que se refresca
  solo ese trozo y no se pierden la pestaña, la subpestaña ni el scroll (antes cada acción devolvía a
  la portada de Integraciones). Los modales de vincular (Chartmetric y Enterticket) se cierran al
  recibir `inline:updated` de su zona, y los buscadores y botones de dentro se **vuelven a enganchar**
  ahí mismo (los elementos de la zona son nuevos).
  ⚠️ El modal vive **antes** del `<script>` que lo cablea: en esta plantilla el JS va dentro del
  bloque de contenido y se ejecuta al vuelo, así que si el modal fuera después, al inicializar no
  existiría y no se engancharía nada.

- **LA BOLSA DE GASTOS DE UN ÁLBUM** (ago 2026): la pestaña **«Gastos»** de la ficha del álbum,
  hermana de la del single. Puntos únicos **`_album_project`** (qué proyecto lo prepara) ·
  **`_album_bag(session_db, album, create=)`** · `_album_bag_context` · endpoint `album_bag_open`.
  ⚠️ Si el álbum lo prepara un PROYECTO discográfico, la bolsa **es la del proyecto** (como en el
  single): si no, habría dos bolsas para el mismo lanzamiento y el gasto se repartiría entre las dos
  sin que cuadre ninguna. La pestaña lo dice («Bolsa del proyecto · X»).
  ⚠️ Su `bag_type` es **`DISCO`** («Disco / EP»), que es el que ya existe en **`BAG_TYPES`**: un tipo
  que no esté ahí no sale en el selector y **guardar la bolsa desde su pantalla lo cambiaría a
  «General»** (el bug real que ya pasó con PROYECTO), con lo que perdería sus categorías.
  ⚠️ Sus **categorías** son las de un lanzamiento (`DISCO_BAG_EXPENSE_CATEGORIES`), no las de un
  concierto: lo decide `_bag_visible_expense_categories` con `bag_type='DISCO'` + `linked_type='ALBUM'`.
  ⚠️ La pestaña hay que meterla en **`ALBUM_DETAIL_TABS`** (si no, cae en «Información» sin dar
  ningún error) y `album_bag_open` en los DOS mapeos de endpoints.

- ⚠️⚠️ **NOTAS DE PRENSA · LAS FOTOS QUE SE OFRECEN: los ÁLBUMES Y LAS FOTOS SIN ÁLBUM** (bug real,
  sep 2026: «sale la opción pero no salen los contenidos que existen»). Dos causas:
  · **La mayoría de las fotos NO están en un álbum** (se suben a la actividad y se quedan ahí), y el
  selector solo ofrecía `PhotoAlbum`. Ahora `_press_photo_albums` ofrece además **las fotos de la
  actividad, del evento y de cada artista** que no están agrupadas, y cada grupo dice **de dónde es**
  («Álbum · Jerez de la Frontera, Cádiz», «Fotos de la actividad»).
  · ⚠️ **`_fotos_album_from_form` creaba los álbumes SIN `artist_id`** (el otro camino sí lo ponía),
  así que «los álbumes de este artista» no encontraba ninguno. Arreglado al crear + relleno puntual
  `_photo_albums_artist_backfill_once` (marca `photo_albums_artist_v1`). Y la búsqueda mira ya
  `artist_id`, **el dueño** y **las actividades de ese artista**.
  ⚠️⚠️ La referencia de un módulo de fotos es una **CLAVE**: el uuid del álbum **o
  `o-<OWNER_TYPE>-<uuid>`** para las fotos de un dueño, y la resuelve el punto único
  **`_press_photos_source`** — lo usan el módulo del correo, la **galería pública** y el **ZIP**, así
  que las tres formas no se pueden desparejar. `album_id` sigue siendo el nombre del parámetro de la
  URL pública (una clave, no siempre un álbum).

- ⚠️⚠️ **LA FICHA DE UNA CANCIÓN, DE UN DISCO Y DE UN TERCERO SE ABREN DESDE VARIAS SECCIONES**
  (sep 2026), igual que la de una actividad (`_activity_read_resource_key`). En **LECTURA** el gate
  acepta **la primera sección que el usuario tenga** de su lista; **modificar sigue exigiendo la
  sección dueña**, porque el helper solo actúa en GET:
  · **`RELEASE_READ_ACCESS_KEYS`** = `discografica` · `registros` · `syncros` · `radio` · `promocion`
    → **`_release_read_resource_key(default, tab)`**. REGISTROS pincha el título de lo que tiene
    pendiente de AGEDI/SGAE (y necesita su **REPARTO AUTORAL**, que es justo lo que registra),
    SYNCROS abre el tema de su repertorio, RADIO la canción que suena y PROMOCIÓN el lanzamiento.
    ⚠️ Las pestañas **ECONÓMICAS** no se abren por trabajar en otra sección
    (`RELEASE_READ_ECON_TABS`: royalties · ingresos · gastos · beneficiarios): ahí siguen mandando
    sus recursos de Discográfica.
  · **`THIRD_PARTY_READ_ACCESS_KEYS`** = `third_parties` · `databases.invoices` · `administracion` ·
    `contabilidad` → **`_third_party_read_resource_key`**, y solo para **`promoter_detail_view`**:
    la base de facturas agrupa por quien emite y enlaza a su ficha, y es donde se le **pone la
    cuenta** (el trabajo del IBAN). El resto de endpoints `promoter_*` siguen siendo de «Terceros».
  ⚠️ Los dos van **solo en `_resolve_request_resource_key`**, NO en `_coarse_endpoint_resource`: ese
  es el del auto-descubrimiento del catálogo y tiene que seguir diciendo la sección dueña.

- ⚠️⚠️ **UN ÁLBUM NO TIENE GÉNERO NI CALIFICACIÓN PROPIOS: SON DE CADA CANCIÓN** (sep 2026). El
  asistente preguntaba el **género** y el **contenido explícito** también al crear un ÁLBUM o un EP y
  se los aplicaba **a TODAS sus canciones** — y en un disco cada tema puede ser de su padre y muy
  señor mío. Ahora ese paso solo sale en un **SINGLE** (que ES una canción); en un álbum se ponen en
  la ficha de cada tema y **el disco los ASUME**: punto único **`_album_genre_names`** (los de sus
  canciones, en el orden del disco y sin repetir), que se ve en su ficha y **no se puede editar
  ahí** — si se pudiera, habría dos verdades.
  ⚠️ Lo comprueba también el SERVIDOR (`disco_project_create` exige género y explícito solo si
  `kind in DISCO_SINGLE_KINDS`): esconder el paso no basta.
  ⚠️ `AlbumTrack` ordena por **`track_number`**, no por `position` (eso es de `SongGenre` y
  `PlaylistItem`).
  ⚠️⚠️ **EL CASETE NO TENÍA ICONO**: `fa-cassette-tape` **no existe** en esta versión de Font Awesome
  y salía VACÍO (medido: ancho 0 y `content: none`). Ahora es **`fa-tape`**. La comprobación de una
  línea, que conviene pasar al tocar un catálogo de iconos:
  `python3 -c "import re;css=open('static/vendor/fontawesome/css/all.min.css').read();s=open('app.py').read();print([i for i in set(re.findall(r'\"(fa-[a-z0-9-]+)\"',s)) if ('.%s:'%i) not in css])"`
  — hoy sale **vacía** (de paso apareció `fa-circle-euro`, que tampoco existe: era `fa-euro-sign`).

