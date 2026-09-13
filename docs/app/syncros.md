# Syncros · sincronizaciones

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- SYNCROS · la ficha del tema
- ETIQUETA «ONE-STOP» de una canción
- SYNCROS · SUPERVISORS: sección nueva (/syncros, permiso syncros +
- SYNCROS · pestaña REPERTORIO y el envío a SUPERVISORS. Es la PRIMERA sección de
- SYNCROS · lo que el correo no puede hacer, lo hace la PÁGINA: en un correo no corre
- SYNCRO · ¿LO HAN ABIERTO, LO HAN ESCUCHADO Y LO HAN REENVIADO?. Presentar un
- REPERTORIO de Syncros · la línea, en tres filas
- SYNCRO · EL CORREO SE ADAPTA AL ANCHO DE LA PANTALLA. La portada tenía 236 px
- REPERTORIO de Syncros en MÓVIL: se lee como en escritorio —One-stop y Novedad AL
- REPERTORIO DE SYNCROS · arriba el LANZAMIENTO MÁS RECIENTE: el orden se fija en el
- SYNCROS · LOS TEMAS SALEN DESDE EL BUZÓN DE SINCRONIZACIONES, Y CON TODO LO QUE HACE QUE
- EL REPRODUCTOR DE AUDIO ES UNO SOLO: el de la landing de Syncros (sep 2026,

---

- **SYNCROS · la ficha del tema: portada entera y CERTIFICACIONES** (ago 2026):
  ⚠️ La portada se pinta con **`object-fit: contain`** (antes `cover`): el hueco es CUADRADO y una
  portada que no lo fuera **se recortaba**. El tamaño no cambia (220×220) y lo que sobra va en gris.
  · **CERTIFICACIONES**: a la **misma altura que el artista pero a la DERECHA**, solo el **icono** de
  lo que se ha conseguido y su número («×2» si hay más de uno), como en la pestaña Certificaciones.
  Punto único **`_sync_certifications`**, que agrupa con el MISMO motor que esa pestaña
  (`_group_certifications`) y **suma los países**: lo que se enseña es «2 Discos de Oro», no uno por
  país. Va en el contenido único, así que sale igual en la pantalla, en el correo y en el enlace.
  ⚠️ Se maqueta con una **tabla de dos celdas**, no con flex: esto se pinta también en un CORREO.

- **ETIQUETA «ONE-STOP» de una canción** (ago 2026, punto único **`_song_one_stop`**): sale en la
  **cabecera de la ficha de la canción** (junto a PROVISIONAL / EXPLÍCITA / FOCUS SINGLE), en el
  **azul de la marca** y con la **claqueta** (`fa-clapperboard`, el mismo icono de la sección
  Syncros: es para lo que sirve). **Se CALCULA, no se marca a mano**, y hacen falta las TRES cosas:
  · el **máster es 100% nuestro** (`Song.master_ownership_pct`),
  · **no hay más intérpretes que los artistas propios** — ningún `SongInterpreter` que no sea uno de
    sus `SongArtist`, con el MISMO criterio que el «colaborador» que ya se ve en su cabecera
    (`_song_display_parts` → `_song_collaborator_from_names`), y
  · la **autoría es 100% de Plataforma Musical** (`SongEditorialShare` + `_publisher_is_platform`
    sobre `_share_publisher`, que respeta la editorial CONGELADA del registro y cae a la del tercero
    en los antiguos).
  Con eso la obra se puede licenciar para una **sincronización** sin pedirle permiso a nadie.
  ⚠️ **Sin autores registrados NO es one-stop**: que no conste la autoría no significa que sea
  nuestra, y de una sincronización responde quien la licencia. Tampoco lo es si el reparto autoral
  **no suma 100** (aunque todo lo declarado sea de Plataforma): falta obra por declarar.
  ⚠️ Los porcentajes se comparan con **`Decimal`** y un margen de `ONE_STOP_PCT_TOLERANCE` (0,05):
  un reparto 33,33 + 33,33 + 33,34 tiene que contar como 100.
  ⚠️ Una canción **sin ninguna fila de intérpretes** (el caso normal del catálogo) SÍ cuenta: ahí
  `_song_display_parts` cae a los artistas propios, así que no hay colaborador.
  · Devuelve además **`reasons`**, los motivos por los que NO lo es, para poder explicarlo al pasar
  el ratón: una etiqueta que no está tiene que poder justificarse sin abrir tres pestañas.
  · Se calcula **en todas las pestañas** (la cabecera es común) y cuesta los intérpretes que ya
  están cargados más una consulta de los autores. **`_fmt_pct_es`** es el formateador de porcentajes
  de la casa (coma decimal, sin ceros de adorno), que no existía.
  · **En un LISTADO se calcula EN BLOQUE**: **`_song_one_stop_map`** (los intérpretes y los autores
  de todas las canciones de una vez, y lo cuelga en cada fila como `song.one_stop`), ya enganchado
  en Discográfica sobre `display_song_rows`, así que la etiqueta sale también en el **repertorio**.
  Medido: **4 consultas para 40 canciones** (2 si ya vienen con sus artistas cargados), no 80.
  ⚠️ El N+1 escondido está en leer `song.artists` fila a fila: si alguna llega sin esa relación
  cargada, el mapa las **precarga todas** con un `selectinload` (solo cuando hace falta, mirando
  `sa_inspect(sg).unloaded`).
  · **El FILTRO por one-stop no está puesto todavía** (Dani lo quiere en otro sitio): de momento
  solo se ve la etiqueta. El dato ya está calculado y en bloque, así que filtrar es enchufarlo.
  Probado con la app real: one-stop · máster al 50% · con un intérprete de fuera · con una editorial
  ajena · sin autores · sin intérpretes · tercios que suman 99,99 · reparto que suma 90 · editorial
  heredada del tercero, y la etiqueta en las tres pestañas.

- **SYNCROS · SUPERVISORS** (ago 2026): sección nueva (`/syncros`, permiso `syncros` +
  `syncros.supervisors`) para las **sincronizaciones** —música para anuncios, cine y televisión—. Su
  primera sección son los **Supervisors**: los terceros con los que se sincroniza.
  · ⚠️⚠️ **UN SUPERVISOR ES UN TERCERO**: su nombre, su foto, su email, su teléfono y sus documentos
  viven en su `Promoter` de siempre y **aquí NO se duplican**. **`SyncSupervisor`** (uno por tercero,
  `promoter_id` UNIQUE) solo añade la FACETA de syncro: **tipo** (`SYNC_SUPERVISOR_TYPES`: Music
  Supervisor · Agencia de publicidad · Productora de anuncios, que se ve como **etiqueta** y filtra),
  **dónde opera** (`region_kind` GLOBAL | LATAM | **COUNTRY** + `region_country`, en dos campos para
  que el filtro no dependa de cómo se escriba el país) e **idiomas** (`languages`, JSONB; **todos
  nacen con español e inglés** —`SYNC_DEFAULT_LANGUAGES`— y se añaden o se quitan).
  · **SUBIR DESDE FICHERO** (botón arriba a la derecha): motor puro **`sync_import.py`**, que
  **reutiliza el LECTOR de la importación de terceros** (`promoter_import.read_rows`/`parse_columns`,
  que ya sabe de cabeceras desplazadas, «N.º de teléfono» y los decimales que mete Excel); lo único
  propio es a qué campos se vuelca cada columna y cómo se normalizan el tipo, la región y los
  idiomas («Music Supervisors», «Agencia Publicidad», «Latam», «ES/EN/PT», «Spanish and English»…).
  Tres pasos: fichero → columnas (lo que no se reconoce se pregunta) → importar.
  ⚠️ **NO SE DUPLICAN TERCEROS**: se identifican por **email** (el de la ficha y los de su pestaña de
  contacto) y, si no lo traen, por nombre exacto; a quien ya está se le **reutiliza** la ficha y solo
  se le añade la de Syncro, y **reimportar el mismo fichero no crea nada** (comprobado). Lo que ya
  está escrito en su ficha de tercero **no se pisa nunca**: solo se rellena lo que tenga vacío.
  ⚠️ Cada fila va en su **savepoint**: una que falle no tumba las demás, y se dice cuáles.
  · **AÑADIR A MANO, en DOS pantallas** (`_sync_supervisor_modals.html` + `static/js/syncros.js`):
  paso 1 = **buscador de terceros en vivo con su foto** (`api_sync_promoter_search`, que además marca
  quién **ya está en Syncros** para no ofrecerlo dos veces) y, en la última fila, **crear el tercero
  con lo escrito**; paso 2 = los campos de Syncro. El email y el teléfono **solo se piden si su ficha
  no los tiene** (`_sync_apply_contact`, que nunca pisa un dato y los sincroniza con su pestaña de
  contacto por el punto único de siempre).
  · **Pestaña «Syncro» en la ficha del tercero** (`_promoter_syncro_tab.html`): su ficha de syncro
  (editable inline) y **las sincronizaciones que se le han enviado, con su fecha** (`SyncSubmission`,
  con `promoter_id` denormalizado para pintarla sin pasar por el supervisor). ⚠️ La pestaña **solo
  existe si el tercero es supervisor** (`sync_is_supervisor`), y hay que tenerla en la **lista blanca
  de `tab`** de `promoter_detail_view` (si no, cae en «general» sin dar ningún error).
  · **Los filtros solo ofrecen lo que puede devolver algo** (misma regla que los tipos del calendario
  de agenda): un filtro vacío solo hace ruido. El idioma y el texto se filtran en Python (el idioma
  vive en un JSONB y el nombre se compone del tercero, no es una columna de esta tabla).
  ⚠️ Cuántas sincronizaciones se le han enviado a cada uno sale de **UNA** consulta agrupada: con
  cientos de supervisores, una por fila sería inaceptable.
  ⚠️ **Quitar de Syncros NO borra el tercero** (`sync_supervisor_delete`): solo su ficha de syncro.
  ⚠️ Sus endpoints se llaman **`sync_*` / `syncros_*`**, fuera de cualquier prefijo ya cubierto, así
  que hay que mapearlos a mano en los DOS mapeos; el buscador va en `SUPPORT_READ_ENDPOINTS` (es una
  búsqueda). Probado con la app real: pantalla, importación de un .xlsx de verdad, reimportación sin
  duplicados, los cuatro filtros, el alta a mano, la pestaña del tercero y los permisos (sin permiso
  403 · solo ver sin botones y con el POST rebotado · ver+editar).

- **SYNCROS · pestaña REPERTORIO y el envío a SUPERVISORS** (ago 2026). Es la **PRIMERA** sección de
  Syncros: los temas que se pueden presentar para una sincronización **sin pedirle permiso a nadie**
  (el one-stop lo CALCULA `_song_one_stop_map`, así que este listado no puede desparejarse de la
  etiqueta de la ficha ni del repertorio). Cada tema tiene **«Supervisors»** y **compartir** por
  correo · WhatsApp · SMS · copiar enlace.
  ⚠️⚠️ **QUÉ ESTÁ EN EL REPERTORIO** (punto único `_sync_repertoire_songs`): las **habilitadas a
  mano** en su ficha (`Song.sync_enabled`, «Habilitar para Syncro») **y las ONE-STOP**, que entran
  solas por serlo. Así, un tema que no es one-stop se puede presentar igualmente si alguien lo
  decide, y uno que lo es no hay que acordarse de marcarlo. Lo usan la sección y la landing, así que
  dentro y fuera se ve el mismo repertorio; el ENVÍO lo vuelve a comprobar.
  ⚠️ La pestaña se llama **«Repertorio»** (antes «One-stop», que es solo uno de sus filtros) y
  enseña **el LISTADO directamente**: los **artistas son un FILTRO** (chips con su foto), no una
  pantalla previa. **La agrupación por géneros o por artistas es solo del repertorio ABIERTO** que
  consultan los supervisores. Filtro **One-stop** aparte. `?section=onestop` sigue valiendo.
  · **LAS FILAS SON LA MACRO DE LAS DEMOS** (`_playlist_row.html` → `pl_row`, vía
  `_sync_song_row.html`): se escucha exactamente igual en Syncros, en la página del tema y en la
  landing, **con su barra de reproducción al lado de los datos** (parar, ver por dónde va y moverse).
  ⚠️⚠️ Además de cargar `playlist.js`, el `<ul>` tiene que llevar **`data-playlist-player`**: es lo
  que `initPlayer` busca. Sin ese atributo las filas se ven pero **no suenan y no sale la barra**
  (bug real: estaba puesta la clase `.pl-list` pero no el atributo).
  ⚠️⚠️ **En la PÁGINA del tema NO se usa la fila entera**: la portada, el título y el artista ya
  están arriba en la tarjeta y se **duplicaban**. Abajo va `_sync_song_player.html`: el **play con su
  barra de estado al lado** y los iconos de **letra** y **descarga** (solo icono), movido por el
  mismo motor. **Pinchar la PORTADA también reproduce** (`data-sync-cover`).
  ⚠️ **MÓVIL**: el cuerpo es una `<table>` porque el mismo HTML va por correo, así que la página le
  quita la maquetación de tabla por debajo de 576 px (`display:block`): la portada se ve **entera y
  centrada** arriba, los datos debajo y la tabla de autores se lee sin partir palabras.
  ⚠️ **Las dos páginas públicas se ADAPTAN AL ANCHO DE LA VENTANA** (`width:100%`, tope 1400 px):
  antes se quedaban en una columna estrecha en el centro. El `max-width:680px` que lleva el cuerpo
  **en línea** es para el CORREO (ahí sí hace falta) y la página lo anula con un `!important`; el
  correo lo conserva.
  · **El título de una fila** lleva a la **FICHA de la canción** dentro de la app y a **su página de
  syncro** en la landing pública (`to_detail` de la macro).
  · En la página del tema, **botón de VOLVER arriba a la derecha** cuando se llega desde la app (se
  abre en pestaña nueva, así que se usa el `referrer` del mismo dominio, no `history.back()`); en la
  landing, arriba a la izquierda.
  · El **texto de presentación del correo va a la IZQUIERDA**, no centrado.
  · En el listado de Supervisors, el **nombre va en NEGRO** (`text-reset`): es el nombre de una
  persona, no un enlace que haya que destacar.
  · En **todas** las filas (dentro y en el repertorio abierto) van la **letra** y la **descarga**
  como iconos **juntos a la derecha** (`lyrics_right` de `pl_row`): pegado al título, el de la letra
  no se veía. La letra se abre en un **pop-up único** (`_lyrics_modal.html`, `lyrics_modal`), no
  desplegándose en la propia fila.
  ⚠️ Los **BOTONES de una fila van DENTRO de ella** (el parámetro `menu` de `pl_row`): en un `<li>`
  aparte quedaban colgando debajo y descolocados.
  · **Tres puntitos** por fila: abrir la ficha de la canción y **quitar del repertorio** (se vuelve a
  activar desde su ficha). En «Compartir», **«Abrir la ficha que reciben»** es la página PÚBLICA; a
  la ficha de la canción se llega pinchando el **título**.
  · **«Por correo» abre el MISMO pop-up del envío**, con un **buscador de la base** (terceros,
  personal y artistas, vía `buyers_campaign_contacts`) además del campo de correos a mano: mandar un
  tema es lo mismo se llame como se llame.
  ⚠️ **SIN MÁSTER no entra en el repertorio**: a un supervisor se le presenta un tema que se pueda
  escuchar (una consulta para todas, no una por canción).
  · **La etiqueta ONE-STOP es un GLOBAL** (`one_stop_badge()`): estaba escrita a mano en tres
  plantillas y en una llevaba `fa` en vez de `fa-solid`, así que **salía sin icono** (bug real).
  · **«Compartir por correo» NO carga supervisores**: el pop-up tiene DOS modos
  (`data-sync-mode`) — `supervisors` (con sus filtros y su lista) y **`email`**, que solo deja elegir
  terceros/personal/artistas de la base o escribir direcciones. En modo correo no se pide la lista.

- **SYNCROS · lo que el correo no puede hacer, lo hace la PÁGINA** (ago 2026): en un correo no corre
  JavaScript, así que sus botones llevan la orden **en la URL** (`_sync_url_with`) y la ficha pública
  la ejecuta al abrirse: **`?play=1`** reproduce sola · **`?letra=1`** abre el pop-up de la letra ·
  **`?descargar=1`** empieza la descarga.
  ⚠️ **La descarga NO va al archivo**: preparar el MP3 tarda y el enlace directo dejaba al navegador
  **en blanco** todo ese rato. Se baja por `fetch` con la **animación de espera** de la propia página
  (`.sync-wait`, que es standalone y no tiene el loader global) y, si falla, se cae al enlace de
  siempre.
  · **BOTÓN DE VOLVER** en la ficha pública y en el repertorio, arriba a la izquierda
  (`.btn-volver`), **solo con sesión iniciada**: a un supervisor de fuera no se le enseña un botón
  que le llevaría a la pantalla de acceso. Antes dependía solo del `referrer`, que no siempre llega,
  y desde la app se entraba sin forma de salir.
  · **El REPERTORIO externo, en ESCRITORIO, se lee en TRES filas** (`.rep-list`): el título · sus
  etiquetas (One-stop, géneros, novedad) · el artista y la fecha, con la **portada a 84 px** para que
  el bloque de datos siga ocupando su altura. Solo ahí: en las playlists y en las demos la línea
  sigue igual.

- ⚠️⚠️ **SYNCRO · ¿LO HAN ABIERTO, LO HAN ESCUCHADO Y LO HAN REENVIADO?** (sep 2026). Presentar un
  tema a un supervisor sin saber si lo ha llegado a escuchar es trabajar a ciegas: es lo que dice si
  hay que insistir, si el correo no llega o si el tema no engancha.
  ⚠️⚠️ **Para saber QUIÉN hace falta un TOKEN POR ENVÍO** (`SyncSubmission.token`): el de la canción
  (`Song.sync_share_token`) es UNO para todos y no distingue a nadie. El correo se compone **una vez
  por idioma** con el marcador **`SYNC_TOKEN_MARK`** y se sustituye por destinatario (el patrón de
  los destinatarios de una nota de prensa), así cada supervisor recibe SU enlace y SU píxel.
  · **ABIERTO** — el **píxel** del correo (`public_sync_open`, `/syncro/a.gif`) y **abrir la página**
  del tema. Los dos pasan por **`_sync_track_open`**, que apunta cada apertura con su IP y su
  navegador (`opens`, las últimas 100).
  · **ESCUCHADO** — ⚠️⚠️ **con MÁS DE UN MINUTO basta** (`SYNC_LISTEN_SECONDS`, lo pidió Dani: no
  hace falta oírla entera). Son **segundos REPRODUCIDOS, no la posición de la barra**: el medidor de
  `public_sync_song.html` suma los saltos pequeños de `timeupdate` (~0,25 s) y **descarta cualquier
  salto de más de 2 s**, que es justo lo que hace un arrastre. Avisa al cruzar el minuto y luego cada
  30 s (y con `sendBeacon` al cerrar la pestaña) a **`public_sync_listen`** (`/syncro/escucha`), que
  solo SUBE la cifra (`max`): recargar la página no borra ni duplica lo escuchado.
  ⚠️ El `<audio>` lo crea `playlist.js` al darle al play, así que todavía no existe: el `play` se
  coge **EN CAPTURA sobre `document`** (los eventos de media no burbujean, pero sí se capturan).
  · **REENVIADO** — es una **SOSPECHA** y se dice así («posiblemente reenviado»): aperturas desde
  otro dispositivo **y** otra red que la primera. El proxy de imágenes de Gmail no cuenta (si no,
  todo correo abierto en Gmail parecería reenviado).
  · **DÓNDE SE VE**: la **etiqueta del número de envíos** de una fila del repertorio dice ya
  «2 ✉ · 1 🎧 · 1 ↗», al pasar el ratón lo cuenta con palabras y **al PINCHARLA** sale el listado de
  quién lo ha recibido con su foto y sus iconos (`#syncRcpModal` + `static/js/sync_recipients.js`,
  global y por delegación; el listado se pide al abrirlo, no viaja en el HTML de la pantalla). Lo
  mismo desde la ficha de la canción («Ver quién lo ha recibido») y, en la **pestaña Syncro del
  supervisor**, una columna «Qué ha hecho» con los mismos iconos.
  ⚠️ Los iconos son un **punto único**: `templates/_sync_track_icons.html` (macro `sync_icons`) sobre
  **`_sync_submission_state`**, así que los tres sitios no pueden decir cosas distintas. El de la
  escucha va **a medias (ámbar)** cuando le dieron al play sin llegar al minuto: «lo empezó y lo dejó
  a los 12 s» es información, no un «no».
  ⚠️ **El enlace de la CANCIÓN sigue valiendo** y no le apunta nada a nadie (es el que se comparte
  por WhatsApp o se copia): `_sync_song_by_token` acepta los DOS tokens y es el punto único que usan
  la página, el audio, la descarga y la miniatura.
  ⚠️ La fila del envío **se crea ANTES de mandar** (su token tiene que ir dentro del correo) y **se
  retira si el correo no sale**: la marca de «enviada a Supervisors» sigue contando solo lo que se ha
  mandado de verdad.
  ⚠️ El píxel devuelve **siempre** el gif, exista o no el token: un correo con una imagen rota es
  peor que no saber si lo han abierto.
  ⚠️ Los envíos ANTERIORES a esto no tienen token: sus iconos salen apagados, que es la verdad.
  Probado con la app real (44 comprobaciones) y en el navegador: dos supervisores con enlaces
  distintos, la apertura por página y por píxel, 20 s que no cuentan y 75 que sí, un arrastre de 4
  minutos que no suma, la sospecha de reenvío, el pop-up, la ficha del supervisor y que pinchar la
  etiqueta **no arranca el audio** (la regla de los controles de una fila).

- **REPERTORIO de Syncros · la línea, en tres filas** (ago 2026, `.rep-list`): **título** (con
  **One-stop** y **Novedad** a su lado) · **los GÉNEROS** en la segunda · **artista y fecha** en la
  tercera, con la portada a **84 px** y el bloque de datos a esa misma altura. Igual **dentro de la
  app y en el repertorio público**.
  ⚠️ El tamaño va en UNA variable (`--rep-cover`) que toman el hueco **y la imagen**:
  `.pl-row__cover img` lleva su propio `width/height`, así que cambiando solo el contenedor la
  portada se quedaba a 56 px dentro de un hueco de 84 y todo salía descuadrado (bug real).
  ⚠️ Quien salta de línea es el bloque de **géneros** (`.sync-genres`, al 100%), no el título: si el
  título ocupara toda la fila, One-stop y Novedad bajarían con los géneros.

- **SYNCRO · EL CORREO SE ADAPTA AL ANCHO DE LA PANTALLA** (ago 2026). La portada tenía **236 px
  FIJOS** en una tabla con `table-layout:fixed`, así que en un móvil a los datos les quedaban ~110 px:
  el nombre del artista y la fecha se partían en dos líneas y la tabla de autores se salía por la
  derecha (bug real, con captura). Por debajo de **520 px** la portada y los datos se **APILAN**,
  cada uno a todo el ancho, y los dos módulos —la canción y el contacto— miden lo mismo.
  ⚠️ Un correo no admite hojas externas: el `<style>` con la media query va **dentro del propio
  cuerpo** que genera `_sync_pitch_html`. El cliente que no entienda media queries (los hay) sigue
  viendo la maqueta de escritorio, que es la de antes — nunca peor que ahora.
  ⚠️ Con `table-layout:fixed` **la columna sigue mandando aunque la celda sea `display:block`**: las
  celdas se quedaban a 193 px de los 331 disponibles. Hay que pasar la tabla a `auto` **y la FILA
  también a bloque**.
  ⚠️ En la página pública la tabla de autores se forzaba a **420 px con scroll**, así que se
  deslizaba SIEMPRE; ahora que hay sitio ocupa el ancho que hay (`width:100%`, cabeceras que
  envuelven) y el scroll queda solo como red de seguridad.
  · Medido a 375 px en el correo y en la página: nada se sale, nada se parte y los dos bloques miden
  igual; y a 1100 px la maqueta de siempre (portada y datos lado a lado).

- **REPERTORIO de Syncros en MÓVIL** (ago 2026): se lee como en escritorio —**One-stop y Novedad AL
  LADO del título**, los **géneros en la segunda fila** y el artista y la fecha en la tercera—, en el
  back office y en el abierto. Para eso, en `.rep-list` se deshace el `flex:0 0 100%` que la red de
  seguridad de móvil pone al título (quien salta de línea es `.sync-genres`) y se aprieta lo justo el
  espaciado de la fila: la etiqueta va más compacta y los iconos de la derecha ocupan menos.
  ⚠️ Si el título es muy largo la etiqueta envuelve igualmente: es preferible a recortar el nombre
  del tema.

- **REPERTORIO DE SYNCROS · arriba el LANZAMIENTO MÁS RECIENTE** (ago 2026): el orden se fija en el
  punto único **`_sync_repertoire_songs`** (fecha desc y, a igualdad, por título), así que lo
  heredan la sección, sus filtros por artista y por género y la **landing pública** sin que cada
  pantalla tenga que acordarse.

- ⚠️⚠️ **SYNCROS · LOS TEMAS SALEN DESDE EL BUZÓN DE SINCRONIZACIONES, Y CON TODO LO QUE HACE QUE
  LLEGUEN** (sep 2026). Un tema para sincronización se lo manda una casa de discos a un
  **supervisor de fuera**, así que no puede salir con el remitente de la app: para Gmail y Outlook,
  un correo que dice venir de un sello desde otro dominio es indistinguible de uno falsificado (y
  encima queda burdo).
  · **Punto único `_sync_sender()`** (hermano de `_press_sender_for`): **`SYNC_SENDER_EMAIL` =
  `sync@piesrecords.com`** y **`SYNC_SENDER_NAME` = «Syncros PIES Compañía Discográfica»**. Sale
  con las credenciales de ESE buzón (`MailAccount`, Integraciones → Correo), así que va alineado con
  su dominio (SPF/DKIM de piesrecords.com) y no hay que pedirle al servidor de la app «mandar como»
  otra dirección, que es justo lo que rechaza. Lo usan el envío, la vista previa y el pop-up
  (global de plantilla **`sync_sender()`**, una FUNCIÓN para que solo se consulte donde se pinta).
  ⚠️ **Mientras la cuenta no esté dada de alta** se pide igual mandar «como» ella y, si el servidor
  no lo admite, `_send_optional_email` cae al remitente de la app con Reply-To ahí **y lo DICE** (el
  flash sale en pantalla): nunca se cree que sale desde ese buzón sin que sea verdad.
  ⚠️⚠️ **LA DIRECCIÓN ESTÁ ESCRITA EN UN SOLO SITIO**: el catálogo `MAIL_EXPECTED_ACCOUNTS`
  (indexado en `MAIL_EXPECTED_BY_KEY`), de donde se DERIVAN `SYNC_SENDER_EMAIL`/`_NAME`. Y
  **`SYNC_CONTACT_EMAIL` —el contacto que se PINTA dentro del correo— ES `SYNC_SENDER_EMAIL`**: el
  buzón que manda es el que contesta. Una dirección escrita en dos sitios se despareja el día que se
  cambia en uno (pasó: se implementó con `syncro@` y el contacto era `sync@`). Si algún día el
  contacto tuviera que ser otro buzón, se separa AHÍ.
  · **LO QUE HACE QUE NO SEA SPAM** (todo en `sync_song_send`, que es el punto único de envío —lo
  usan los dos modos del pop-up, «Supervisors» y «Por correo»):
    · **un correo por persona** (nunca uno con todos en el «Para»),
    · **`auto_submitted=False`**: lo escribe una persona, no es el aviso de una máquina,
    · **enlace de BAJA** en el pie + **`List-Unsubscribe` y `List-Unsubscribe-Post`**, que es lo que
      el iPhone y Gmail usan para ofrecer «darse de baja» arriba del correo — y lo que más cuenta
      para que un envío así no se marque como spam,
    · **al ritmo de una persona** (`SYNC_SEND_PACE_MS` / `SYNC_SEND_RECONNECT_EVERY`; con cuenta
      propia mandan los suyos) y respetando su **tope por hora** (`MailAccount.hourly_cap`),
    · **presupuesto de tiempo** (`SYNC_SEND_BUDGET_SECONDS`): lo que no cabe en una petición se dice
      y se sigue pulsando otra vez.
  ⚠️⚠️ **LA BAJA SE RESPETA DE VERDAD**: `SyncSupervisor.opted_out_at` (+ `opted_out_note`, y
  `SyncSubmission.opted_out_at` para un correo suelto). Quien está de baja **no se ofrece** en el
  pop-up **y el envío lo descarta aunque llegue en el formulario** (esconderlo en la pantalla no
  basta): mandarle otro tema a quien ha pedido no recibir más es lo que hace que marque «spam», y
  con eso el dominio deja de llegarle a NADIE. Se ve y se deshace en la pestaña **Syncro** de su
  ficha (`sync_supervisor_optout`, que también sirve para darlo de baja a mano).
  ⚠️ **Una baja pedida desde un correo SUELTO protege también a su ficha** de supervisor
  (`_sync_supervisor_by_email`, que indexa por correo UNA vez por petición en `g`: el correo no es
  una columna de esa tabla, lo compone `_promoter_email_phone` del tercero).
  · **La página de baja** es `public_sync_unsubscribe` (`/syncro/baja/<token>`, el token del ENVÍO),
  **bilingüe** (en el idioma con el que se le escribió) y en las TRES listas de públicos + exenta
  de CSRF.
  ⚠️⚠️ **El GET solo PREGUNTA**: un cliente de correo puede PRECARGAR un enlace, y con un GET que
  diera de baja cualquiera quedaría fuera sin haber pulsado nada. La baja la hace el POST — que es
  el mismo que hacen el iPhone y Gmail «en un clic» (y a ese se le responde solo «OK», sin página).
  ⚠️ **AL REANUDAR no se le repite a nadie**: a quien recibió ESE tema hace menos de
  `SYNC_SEND_RESUME_MINUTES` (45) se le salta. Ventana corta a propósito: reenviar el mismo tema
  dentro de unos días sigue siendo posible.
  ⚠️ La **VISTA PREVIA es el correo**, así que lleva el pie de baja — pero **sin enlace**
  (`_sync_unsub_footer(..., preview=True)`): ahí todavía no hay envío y el token es el marcador, así
  que pinchándolo se llegaría a un 404.
  ⚠️ La versión de **TEXTO** del correo (la que leen los filtros) sale del propio HTML y **no empieza
  con el CSS** del `<style>`: comprobado, porque un correo cuya parte de texto es basura puntúa como
  spam.

- ⚠️⚠️ **EL REPRODUCTOR DE AUDIO ES UNO SOLO: el de la landing de Syncros** (sep 2026,
  `templates/_audio_player_row.html`, macro **`audio_player`**): play redondo + **barra que se
  arrastra** + duración, movido por `playlist.js`. Lo usan la **landing de Syncros**
  (`_sync_song_player.html`) y los **MATERIALES de una canción** (masters, instrumental, TV track,
  stems y las demos del proyecto), que antes iban con la etiqueta `.mat-chip` de `media_chip.js`.
  Con `{% call %}` se le añaden iconos a la derecha (la letra, la descarga).
  ⚠️⚠️ **`playlist.js` NO es global**: la pantalla que lo use tiene que cargarlo (la ficha de canción
  lo hace ya en su `{% block scripts %}`). Sin ese `<script>` los audios se ven pero **no suenan**.
  ⚠️ **Solo suena uno a la vez, también entre VARIOS reproductores de la misma pantalla** (Materiales
  tiene uno por módulo): al arrancar, `playlist.js` pausa los demás `<audio>`/`<video>` del documento
  —y `media_chip.js` hace lo mismo—, así que se cortan entre sí venga de donde venga.
  ⚠️ El marco rojo del que suena es `.is-playing:not(.is-paused)`: la fila que se queda pausada
  conserva `is-playing` (es la que está cargada) y con dos marcos no se sabría cuál suena.
  · **La ESTÉTICA de los módulos de Materiales y del videoclip es la de la landing**: tarjeta blanca
  de esquinas redondeadas (14px), borde suave (#e5e7eb), sombra ligera y aire dentro.

