# Discográfica · royalties y editorial

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- LOS ROLES DE AUTORÍA · punto único, el ARREGLISTA y el CHECK de la BD
- EL CÓDIGO IPI de un autor · su «DNI» en las sociedades de gestión
- CAMBIAR LA EDITORIAL DE UN AUTOR SE PREGUNTA. La editorial de un autor puede
- LOS SELECTORES DE EDITORIAL (y de cualquier cosa con logo) SE VEN CON SU LOGO: un
- REPARTO EDITORIAL en la ficha de la canción
- REPARTO EDITORIAL: la parte del autor de Plataforma se reparte con nosotros
- UN LC DE REPARTO EDITORIAL SIN REPARTO LO DICE: si el cálculo falla,
- LC de REPARTO EDITORIAL: el Label Copy que se comparte NUNCA lleva el reparto entre
- Validar la factura de una liquidación · el CUADRE en verde o rojo (ago 2026,
- LOS ENLACES DEL LANZAMIENTO (los que da la DISTRIBUIDORA). Cuando el lanzamiento
- CONTABILIDAD · una LIQUIDACIÓN DE ROYALTIES es una factura como las demás (ago 2026,
- FACTURAS DE ROYALTIES: lo que se perdía por el camino.
- ROYALTIES · pedir la factura y registrarla desde dentro
- EL REPARTO EDITORIAL LO DECIDE LA EDITORIAL DEL REGISTRO, NO LA FICHA DEL AUTOR (bug real
- EL CONCEPTO DE UN COMPROMISO ES TEXTO LIBRE: se compara con TOLERANCIA. En la
- «PLATAFORMA MUSICAL» SE RECONOCE CON TOLERANCIA: el nombre de la editorial lo
- DIAGNÓSTICO del reparto editorial
- Liquidación de royalties · CANDADO de importes bloqueados
- Royalties · la liquidación GENERADA queda congelada
- Royalties · facturación y validación
- Royalties · CONSIGNAR lo ya generado o enviado (_royalty_freeze_backfill, marca
- Royalties · el cálculo «en vivo» venía con el CONGELADO pegado (raíz del fallo, ago 2026).
- Royalties · la pantalla de VALIDAR y el circuito de PAGO
- Royalties «A FAVOR» (lo que nos liquidan las compañías externas): modelo AfavorLiquidation
- ROYALTIES «A FAVOR» · EL PROCESO COMPLETO. Antes era una pantalla de
- Colaboraciones externas en la liquidación del ARTISTA: _build_royalty_beneficiaries ya NO las

---

## LOS ROLES DE AUTORÍA · punto único, el ARREGLISTA y el CHECK de la BD

**`app.SONG_AUTHOR_ROLES` es el PUNTO ÚNICO** (sep 2026): `AUTHOR` (Autor · Letra) · `COMPOSER`
(Compositor · Música) · `AUTHOR_COMPOSER` (Autor y compositor · Letra y música) · **`ARRANGER`
(Arreglista · Arreglos)**, que es el que pidió Dani.

Los eligen **tres** sitios y los leen **tres** más, y **todos salen de ahí**:

| dónde se ELIGE | dónde se LEE |
|---|---|
| la pestaña **Editorial** de la canción (`SONG_AUTHOR_ROLE_LONG_CHOICES`) | el **Label Copy** (enlace, correo y PDF) |
| la **entrega de masters** del enlace público (`SONG_DELIVERY_AUTHOR_ROLES`) | la hoja de **SGAE** y su correo de «obra registrada» |
| las **demos** (`DEMO_AUTHOR_ROLES`) | la ficha de **Syncros** (ES y EN) |

Estaban repetidos a mano en los seis, así que añadir uno exigía acordarse de todos. Hoy
`DEMO_AUTHOR_ROLES` y `SONG_DELIVERY_AUTHOR_ROLES` **son** `SONG_AUTHOR_ROLE_CHOICES`.

⚠️⚠️ **Y LA BD TIENE UN CHECK CON LA LISTA CERRADA** (`chk_ses_role` en `song_editorial_shares`):
un rol que esté en la app y no en la base revienta al guardar con «violates check constraint» y saca
la **pantalla de mantenimiento** — la misma trampa que impidió cancelar una actividad durante
semanas (`CONCERT_STATUS_VALUES`). Por eso:
· **punto ÚNICO `models.SONG_AUTHOR_ROLE_VALUES`**, y el CHECK **se construye con ella**
(`ensure_editorial_schema`, que lo dropea y lo recrea en cada arranque: `_ddl_already_applied` no
salta un `DO $$`), así que un rol nuevo entra solo y no se pueden desparejar;
· **RED DE SEGURIDAD**: al arrancar se comprueba que todo rol de `SONG_AUTHOR_ROLES` esté en esa
lista y, si falta, **se dice en el log con su nombre** — igual para las traducciones de Syncros
(un rol sin texto sale VACÍO en la ficha que ve un supervisor).
⚠️ Comprobado reproduciendo el CHECK viejo: antes **`CheckViolation`** al guardar un arreglista,
después se guarda, y **un rol inventado se sigue rechazando** (el CHECK protege).
⚠️ El rol de un LC que llega de fuera se normaliza con **`_lc_author_role`** (mira «arregl»/«arrang»
**antes** que el resto) y el de un formulario con **`_song_author_role`**.

⚠️⚠️ **Y LA ETIQUETA LA RESUELVE EL SERVIDOR** (`role_label`, `SONG_AUTHOR_ROLE_LONG`). La ficha
pintaba el rol con un `{% if %}/{% elif %}/{% else %}` a mano y **el arreglista se leía como «Autor
y compositor»** (bug visto en pantalla el día que se añadió: se guardaba bien y se leía mal, que es
lo peor). Una plantilla pinta TEXTO; quién decide qué texto es el punto único.

## EL CÓDIGO IPI de un autor · su «DNI» en las sociedades de gestión

**`Promoter.ipi`** (sep 2026, lo pidió Dani). Es el identificador del autor en las sociedades de
gestión —lo que piden SGAE y las editoriales para saber quién es quién— y **es SUYO, no de la obra**:
por eso vive en su **ficha de tercero** y no en cada registro. Se escribe **una vez** y a partir de
ahí sale solo en todas sus obras.

- **Es OPCIONAL**: un autor nuevo puede no tenerlo todavía, y nada lo exige.
- **SE PIDE en los cuatro sitios donde se dan de alta autores**: el pop-up de la pestaña
  **Editorial**, la **entrega de masters** del enlace público, las **demos** y la propia **ficha del
  tercero** (junto al DNI, con su explicación).
- ⚠️⚠️ **SI EL AUTOR YA LO TIENE, SE RELLENA SOLO Y NO SE LE PIDE**: los buscadores de autor
  (`api_get_promoter`, `api_search_authors`, `public_song_delivery_authors`) devuelven ya el `ipi`, y
  al elegirlo el formulario lo pone —en la ficha, además, el texto de debajo cambia a «Ya lo tiene en
  su ficha: no hay que volver a escribirlo»—.
- **Al guardar va a SU ficha** (no al registro), con el **centinela** de siempre: si el formulario no
  lo trae o viene vacío, **no se borra el que tuviera**. En su propia ficha sí se puede vaciar (ahí
  el campo se pregunta, así que dejarlo en blanco ES la orden).
- **DÓNDE SE VE**: la cabecera de su ficha (una chapa «IPI …» al lado del DNI) y, como una columna
  más de la tabla de autores, el **Label Copy** (el normal y el de reparto editorial: enlace, correo
  y PDF), la **hoja de SGAE** y la **ficha de Syncros**.
  ⚠️ **La columna solo se pinta si ALGÚN autor de esa obra lo tiene**: es opcional, y una columna
  vacía en todo el catálogo antiguo solo estorba. En cuanto uno lo rellena, sale.
- **No se valida el formato a propósito** (`_clean_ipi` solo quita espacios y pone mayúsculas):
  circulan DOS formatos —el *IPI Name Number* de 11 dígitos y el *IPI Base Number*, «I-000000229-7»—
  y rechazar el que no encaje en un patrón nuestro dejaría a un autor sin poder guardar el suyo.

⚠️ **DOS RUTAS IGUALES**: `/api/promoters/<id>` está declarada **dos veces** (`api_get_promoter`, que
es la que GANA, y `api_promoter_detail`, que no se alcanza nunca por URL). El `ipi` se añadió a las
dos para que no dependa de cuál responda, pero **la segunda es código muerto** y conviene retirarla.

- ⚠️⚠️ **CAMBIAR LA EDITORIAL DE UN AUTOR SE PREGUNTA** (ago 2026). La editorial de un autor puede
  cambiar **a partir de una fecha o de un tema**, así que al elegir una distinta a la que tiene se
  avisa —«la editorial de X era A y ahora pasa a B»— y se elige el **ALCANCE**:
  · **Solo en esta canción** (`PUBLISHER_SCOPE_ONE`, lo de por defecto): se guarda en el snapshot del
    registro (`SongEditorialShare.publishing_company_id`) y **su ficha no se toca**.
  · **Para todas, de aquí en adelante** (`PUBLISHER_SCOPE_FORWARD`): además se cambia en su ficha
    (`Promoter.publishing_company_id`).
  ⚠️ **En ninguno de los dos casos se tocan las canciones ANTERIORES**: cada registro conserva la
  editorial que quedó congelada el día que se guardó (comprobado: tras cambiar «para todas», la
  canción vieja sigue con la suya).
  · Puntos únicos **`_publisher_change_info`** (¿cambia? y el texto del aviso) y
  **`_publisher_apply_change`** (qué se toca según el alcance), usados por **la ficha**, **la entrega
  de masters** (el enlace público manda el alcance por autor) y las **demos**. Antes, los tres
  cambiaban la ficha del autor **siempre y sin preguntar**.
  · El aviso es el pop-up único `_publisher_scope_modal.html` (`window.pedirAlcanceEditorial`), que
  consulta `api_publisher_change` y **no molesta si no hay cambio**.

- ⚠️ **LOS SELECTORES DE EDITORIAL (y de cualquier cosa con logo) SE VEN CON SU LOGO**: un
  `<datalist>` nativo **no admite imágenes**, así que `initTypeahead` pinta una **lista propia**
  (`.ta-results`) cuando el endpoint devuelve `logo_url`/`photo_url`, y el datalist de siempre cuando
  no. `api_search_publishing_companies` devolvía solo `id` y `label` — por eso las editoriales salían
  peladas en la app mientras que en el enlace público sí tenían logo.

- **REPARTO EDITORIAL en la ficha de la canción** (ago 2026): el autor se ve **como cualquier otro**
  (con su % de la obra) y **DEBAJO dos etiquetas grises claritas** (`.ed-share__tag`) dicen cuánto le
  queda a él (**«Autor X%»**) y cuánto a **«Plataforma Y%»**, con el detalle al pasar el ratón.
  ⚠️ Antes eran dos filas del mismo tamaño dentro de un recuadro y **Plataforma parecía otro autor**,
  que es justo lo que confundía.
  · **TAREA PENDIENTE** para quien es **Registros y Sello a la vez** (`_home_sync_to_send` →
  `HOME_SYNC_TO_SEND`): los temas **One-stop ya publicados** que todavía no se han mandado a
  Supervisors, con su botón de enviar ahí mismo. Salta **al día siguiente** del lanzamiento (el día
  del lanzamiento todavía se está publicando) y **desaparece sola en cuanto se manda, desde donde
  sea** (mira `SyncSubmission`, que es lo que apunta cualquier envío de la app).
  ⚠️ En la previsualización, **«One-Stop» solo se dice si el tema LO ES**: un tema habilitado a mano
  no lo es, y decirlo sería mentir justo en lo que le importa a un supervisor. El **género** va
  siempre al lado.
  · **EL ASUNTO del correo**: «**Nuevo tema para Syncro, \<canción\>, \<artista\> (One-Stop)**»
  (`_sync_subject`), con «(One-Stop)» **solo si lo es**; el nombre de la canción y el del artista no
  se traducen.
  · **EL TEXTO** dice de quién es («…este nuevo single **de \<artista\>**») y, **solo si el tema es
  ONE-STOP**, añade una segunda línea: «Además, este tema es One-Stop, ya que nosotros gestionamos el
  100% de los derechos editoriales, discográficos y de management del artista».
  · **Los dos MÓDULOS miden lo mismo** (el de la canción con `table-layout:fixed`: sin eso se
  ensanchaba con su contenido y no cuadraba con el de contacto), y la letra del de la canción es un
  punto mayor. Los **dos logos** van en una **fila de tabla** con la misma altura: sueltos en un div,
  cada PNG se apoyaba a una altura distinta según su proporción.
  · **El botón de «más repertorio» va al FINAL del módulo de contacto** (a todo el ancho, tras una
  línea): al lado quitaba sitio y el cargo, el correo y el teléfono se partían.
  ⚠️⚠️ **SOLO cuenta como «enviada a Supervisors» lo que va a un SUPERVISOR**: el envío guarda el
  canal (`SUPERVISOR` o `EMAIL`) y `_sync_sent_state` **filtra por `supervisor_id`**. Mandárselo a un
  tercero por correo —o por WhatsApp o SMS, que ni pasan por el servidor— **no** marca la fila ni
  cierra la tarea pendiente, aunque el envío sí queda registrado.
  ⚠️⚠️ **`logo_clean_png` TIENE que estar en las listas de PÚBLICOS**: en una página pública sin
  sesión el `<img>` se comía un 302 al login y el logo salía **roto** (el cuadradito con
  interrogación) — pasó en el móvil, donde se abre el enlace sin sesión. Y si la imagen no es
  nuestra o no se puede limpiar, **redirige al original**: un 404 ahí deja el logo roto, que es peor
  que enseñarlo con su fondo.
  · **MÓVIL del listado**: el título arriba, **debajo sus etiquetas** (One-stop, géneros, novedad) y
  debajo el **artista y la fecha** —en la MISMA línea, sin que salte sola—; los huecos de los iconos
  de la derecha se **reservan siempre** (`.pl-row__dl-plain.is-empty`) para que todas las filas midan
  lo mismo. Al reproducir, la **barra sale DEBAJO** de artista y fecha, a todo el ancho: la fila solo
  crece hacia abajo en vez de descolocarse.
  ⚠️⚠️ **UNA LISTA DE TEMAS NO ES UNA TABLA**, así que la red de seguridad de móvil (que arregla las
  tablas) no la cubría: los botones de la derecha no se encogían, al título le quedaba ancho CERO y
  el nombre salía **en vertical, una letra por línea** (bug real en el repertorio del back office).
  La regla vive ya en esa misma red (`@media (max-width: 767.98px)`): `.pl-row` envuelve, su main
  lleva `min-width:0` y los botones caen a su propia línea.
  · En la **ficha pública en móvil**, los dos logos se quedan **en línea** (el `display:block` del
  apilado los ponía uno sobre otro) y la fila del título usa `table-layout:auto` (con `fixed` el
  título se llevaba todo el ancho y la etiqueta se salía por la derecha).
  · El **título de la landing** cabe en UNA línea en móvil (`clamp` + `nowrap`).
  · **MÓVIL de la ficha del tema**: el título GRANDE con su etiqueta One-stop **a la derecha** (la
  fila no se apila, y el título se queda con el ancho que sobra: con las dos celdas a `auto` la
  etiqueta se salía por la derecha y el `overflow-x:hidden` la recortaba), el rótulo del responsable
  en **una sola línea**, el correo y el teléfono cada uno en la suya y el botón de «más repertorio»
  **abajo del todo**. La tabla de autores **se desliza** en vez de partir palabras.
  · **NOVEDAD** (`SYNC_NEW_DAYS` = 15): en el repertorio abierto, un tema publicado hace menos de 15
  días lleva su etiqueta al lado de la fecha. Se cae sola (se calcula, no se marca).
  ⚠️⚠️ **LOS DESTINATARIOS DEL ENVÍO SE CARGAN AL ABRIR EL POP-UP** (`sync_send_targets` →
  `_sync_send_targets.html`), no dentro del HTML de la pantalla: con cientos de supervisores —cada
  uno con su foto— la ficha de la canción y Syncros pesaban muchísimo, tardaban y se llegaba a ver
  un instante **la página SIN ESTILOS** (bug real, con captura). Medido con 60 supervisores: la
  lista ya no viaja en la página.
  · En la **cabecera de la ficha de la canción**, la etiqueta One-stop va **en la línea del artista**
  (no al lado del título) y **no se pintan las personas vinculadas** al artista: eso es de la ficha
  del artista, no de la canción.
  ⚠️ El icono de descarga de una fila NO usa `.pl-row__dlbtn` (ese es el botón de MENÚ de las demos,
  con su círculo blanco, que aquí no venía a cuento) sino `.pl-row__dl-plain`: solo el icono.
  `pl_row` acepta ya `detail_url` (el título es enlace; `playlist.js` ignora los clics en un `<a>`,
  así que no choca con la reproducción) y `download_mp3_only` (un icono de descarga, sin desplegable).
  · **LOS DATOS VAN CON SU ICONO Y SIN RÓTULO** (el icono ya dice qué es) y el **ARTISTA con su
  foto**. Los botones (escuchar · **MP3** · ver letra) van **DEBAJO de los datos, dentro de la
  tarjeta**, y el **contacto en su propia galleta**. **«Ver letra» solo si la canción tiene letra.**
  · **Los DOS logos salen de la EMPRESA DEL GRUPO** (`_sync_brand_logos`, buscando «PIES» y
  «PLATAFORMA»), que es donde están subidos — **no** de la editorial.
  · **La DESCARGA es en MP3** (`public_sync_song_download`): el máster es un .wav enorme. Convierte
  con el binario de imageio-ffmpeg (ffmpeg no está en el PATH) y, si falla, sirve el original.
  · **EL CONTENIDO ES UNO SOLO**: punto único **`_sync_pitch_html`** (estilos en línea, porque va por
  correo) + **`_sync_song_context`**, y lo pintan **el correo, la página del enlace y la vista
  previa** — no hay tres versiones que se desparejen. Lleva: los **DOS logos** (PIES y Plataforma
  Musical) arriba a la derecha, «**Nuevo tema para Sincronización**» centrado, el texto de
  presentación, y la **portada a la izquierda** con su ficha a la derecha (título con la **etiqueta
  One-Stop** a su derecha, artista, fecha de publicación, géneros en etiquetas, la discográfica con su
  logo y la **tabla de autores** con rol, % y editorial), el **reproductor**, **«Ver letra»** y el
  **contacto de sincronizaciones** (`SYNC_CONTACT_*`: Daniel Martínez · sync@piesrecords.com ·
  +34915001883, con `mailto:` —asunto «Syncro \<canción\>»— y `tel:` clicables en el icono y en el texto).
  ⚠️ **En el ENLACE no va el texto de presentación** (`with_intro=False`), como pidió Dani.
  ⚠️ En un correo **no corre JavaScript**: ahí el play y la letra son ENLACES a la página pública; en
  la página sí suena (mismo motor que las demos, `media_chip.js`) y la letra se abre en un pop-up.
  ⚠️ El audio va por **NUESTRO puente** (`public_sync_song_audio` → `_playlist_audio_response`, con
  `Range`): la dirección de Storage no sale nunca a la página.
  · **Previsualización del enlace**: «**Syncro · \<canción\> (\<artista\>)**» y debajo «**One-Stop ·
  \<géneros\>**» (`_sync_og_title` / `_sync_og_description`), con la **portada** como miniatura
  (cascada portada → foto del artista → logo, vía `_share_og_image_response`).
  · **EL IDIOMA lo decide el supervisor** (`SyncSupervisor.comm_lang`, «Habla inglés» en su ficha y en
  el alta): a un anglo le llega **todo traducido menos el nombre de la canción y del artista**
  (`SYNC_TEXTS`, los dos idiomas en un solo sitio) y su **enlace también** (`?lang=en`). En el listado
  de Supervisors sale con su etiqueta.
  ⚠️ No es lo mismo que `languages` (los idiomas en los que OPERA, donde casi todos tienen los dos):
  esto es en qué idioma se le ESCRIBE.
  · **EL ENVÍO** (`sync_song_send`, pop-up único `_sync_send_modal.html`, que se incluye en el listado
  **y en la ficha de la canción**): vista previa como la de los correos (con selector Español/Inglés,
  `sync_song_preview_html`) y, al lado, a quién se le manda. ⚠️ **Los filtros nacen TODOS ACTIVADOS y
  al desactivar uno se QUITAN del envío** —al revés que en el listado, donde no filtrar es ver
  todo—; debajo, la lista completa para **omitir a alguien concreto**, y se puede **añadir un correo
  a mano** (con su idioma). El cuerpo se compone **una vez por idioma**, no uno por destinatario.
  ⚠️ Quien no tiene correo en su ficha sale **deshabilitado** y se dice cuántos son: no se le puede
  mandar.
  ⚠️ Un tema que **no es one-stop no se envía** aunque se llame al endpoint a mano.
  · **Queda registrado** en `SyncSubmission` (a quién, cuándo, idioma y canal) y de ahí sale la marca
  **«Enviada a Supervisors»** con su icono: en el listado, y en la ficha el botón cambia a «Enviada a
  Supervisors» — al pasar el ratón, **cuándo y a quién** (`_sync_sent_state`, UNA consulta).
  ⚠️⚠️ **`SyncSubmission` NO tiene relación `promoter`** (solo la columna): con un `joinedload` la
  lectura reventaba **dentro de su `try`** y la marca no aparecía NUNCA (bug real que sacó la prueba).
  Los nombres se resuelven con una consulta en bloque.
  · **El FILTRO DE REGIÓN de Supervisors ofrece los PAÍSES, con su BANDERA**: antes había un chip
  «Un país» que no filtraba nada. Ahora son `GLOBAL`, `LATAM` y un chip **por país** presente
  (`country:<nombre>`), pintado con su bandera (el nombre, al pasar el ratón) — `_country_flag` /
  `_country_iso2` + `COUNTRY_ISO2`, que también pinta la bandera en la fila del supervisor.
  ⚠️ El token del enlace es **OPACO** (`Song.sync_share_token`, UNIQUE) y **se crea con COMMIT**: con
  un flush sin commit se perdería y un enlace ya mandado dejaría de valer (bug real de las demos).
  · **LANDING PÚBLICA DEL REPERTORIO** (`public_sync_repertoire`, `/repertorio-sincronizaciones`),
  a la que se llega desde la galleta de contacto de cualquier tema: los dos logos arriba a la
  derecha, «Repertorio para Sincronizaciones» centrado y **galletas por GÉNERO** (con su icono
  sólido —`_sync_genre_icon`— y cuántos temas hay) o **por ARTISTA** (con su foto). Al elegir uno se
  ve su listado con el reproductor de las demos, su letra y su descarga; el **título lleva a la
  página de syncro de ese tema** (la misma que se comparte). Sale también en inglés (`?lang=en`).
  · **Las canciones SIN GÉNERO son una TAREA PENDIENTE de quien es REGISTROS y SELLO a la vez**
  (`_is_registros_sello` + módulo de Inicio `HOME_SONGS_NO_GENRE`), **no** del apartado de Syncros:
  sin género un tema no se puede presentar bien (ni a radio, ni a una playlist, ni a un supervisor).
  Dirección lo ve también, y la tarea **desaparece sola** cuando no queda ninguno.
  ⚠️⚠️ **Los géneros del catálogo ANTIGUO estaban solo en `Song.genre` (texto)** y los listados van
  por `SongGenre`, así que salían «sin género» aunque en su ficha se leyera uno.
  **`_song_genres_backfill_once`** (marca `song_genres_backfill_v1`) los pasa a etiquetas partiendo
  por comas, **solo en las canciones que aún no tienen ninguna**: no pisa nada puesto a mano.
  ⚠️⚠️ **UN ENVÍO A UN CORREO SUELTO reventaba**: `SyncSubmission.supervisor_id` y `promoter_id` eran
  `NOT NULL`. Ahora admiten NULL (la dirección se guarda en `notes`), porque se puede mandar a
  alguien que no está en la lista.
  · En la **ficha de la canción**, el envío a Supervisors vive **DENTRO del menú «Compartir Syncro»**
  (con el resto de formas de compartir), no como botón aparte.
  · Los endpoints públicos (`public_sync_song`, `_audio`, `_download`, `_og_image`,
  `public_sync_repertoire`, `brand_icon_png`) están en las **tres** listas; los de dentro
  (`sync_song_*`) se mapean a la sección `syncros` en los DOS mapeos.

- **REPARTO EDITORIAL: la parte del autor de Plataforma se reparte con nosotros** (ago 2026). La parte
  autoral de un autor NUESTRO (editorial «Plataforma Musical») no es toda suya: se reparte según el
  compromiso **EDITORIAL** de su contrato de artista (`ArtistContractCommitment.concept` = «editorial»;
  **`pct_office` = Plataforma Musical**). Ejemplo real: autor con el 60% de la obra y contrato 50/50 →
  **30% autor y 30% Plataforma sobre el conjunto de la obra**.
  · Motor en `app.py`: `EDITORIAL_CONTRACT_CONCEPTS` · `_publisher_is_platform` · `_artist_editorial_split`
  (reutiliza `_pick_artist_commitment`, que ya sabe de contratos vigentes y `material_scope`) ·
  **`_song_editorial_split_map`** (por id de registro: `pct` de la parte, `pct_author`/`pct_platform` de
  ESA parte y `final_author`/`final_platform` sobre la obra) · `_song_editorial_split_rows` (para PDF y
  páginas públicas) · `_freeze_song_editorial_split`.
  · ⚠️ **EL CONTRATO ES DEL ARTISTA Y SE APLICA A SUS INTEGRANTES** (corregido ago 2026): los autores
  de una obra casi nunca son «el artista», son **personas que forman parte de él** (el cantante, el
  guitarrista), así que buscar el contrato del propio autor no encontraba nada y el reparto no se
  detectaba (bug real). Punto único **`_editorial_split_for_author`**: sube del integrante a su
  artista con **`_promoter_member_artist_ids`** (`ArtistPerson.promoter_id`, cacheado en `g`),
  prefiere el artista **de la canción** si el autor es integrante de él, luego cualquier otro artista
  del que lo sea, y como último recurso el artista principal de la canción (un solista que figura
  como autor de su propia obra). Lo usan el MAPA y el CONGELADO, así que dos integrantes de artistas
  distintos en la misma obra reciben **cada uno el contrato de su artista**. El rótulo «Contrato
  editorial: X% autor · Y% Plataforma» de la ficha enseña el que de verdad se aplica.
  · **Manda lo VIGENTE EL DÍA DEL REGISTRO**: al marcar la obra como registrada en SGAE
  (`_mark_song_sgae_registered`) el reparto se **congela** en el registro de autoría
  (`SongEditorialShare.split_pct_author`/`split_pct_platform`/`split_frozen_at`), así que cambiar el
  contrato mañana no altera lo ya registrado. Solo se congela lo que no lo estaba.
  · **Reparto especial** (`special_split` + `special_pct_author`/`special_pct_platform`): se fija a mano
  y **pisa al contrato**. Los dos porcentajes son el reparto de la parte DEL AUTOR y tienen que sumar
  **exactamente 100** (lo valida el modal y otra vez `discografica_song_editorial_share_split`).
  · Se ve en la pestaña **Editorial** de la canción (`.ed-split*` en `styles.css`): la parte autoral del
  autor en la obra y debajo el reparto, con el porcentaje FINAL sobre la obra de cada uno.
  · ⚠️ Si un contrato antiguo trae porcentajes que no suman 100 se **normalizan** en vez de sacar un
  porcentaje de la obra que no cuadre.
  · **SI EL AUTOR DEJA DE SER DE PLATAFORMA** (le cambian la editorial o se la quitan), de ahí en
  adelante **no se le aplica ningún porcentaje**, pero **lo anterior se mantiene**: lo que quedó
  congelado al registrar la obra se sigue viendo tal cual. Dos puntos únicos:
  **`_share_split_frozen`** (¿ya está fijado: congelado o especial?) y **`_share_split_applies_live`**
  (¿se puede CALCULAR hoy?: el registro tiene que ser de Plataforma **y** el autor seguir siendo
  nuestro). El mapa enseña lo fijado siempre y solo calcula lo demás si `..._applies_live`; el
  congelado al registrar también lo exige, así que a quien ya se fue no se le congela nada nuevo.
  · **Relleno RETROACTIVO, puntual** (`_editorial_split_backfill` + `_editorial_split_backfill_once`,
  marca `editorial_split_backfill_v1`, corre una vez en el arranque): pone al día las obras que YA
  estaban registradas en SGAE antes de que existiera el reparto, congelando en cada una **el contrato
  vigente el día de SU registro** (`SongStatus.sgae_updated_at`; si no quedó apuntado, la fecha de
  publicación — nunca un contrato posterior). ⚠️ **No es la norma**: la norma sigue siendo congelar al
  registrar. Las obras **sin registrar no se tocan** a propósito (su reparto se decide el día del
  registro; hasta entonces la ficha ya lo enseña calculado) y si el relleno se cae a medias **no se
  marca** como hecho, para que el siguiente arranque lo reintente.
- ⚠️ **UN LC DE REPARTO EDITORIAL SIN REPARTO LO DICE**: si el cálculo falla,
  `_label_copy_author_rows` devuelve `split_error` y el documento (PDF, enlace y correo) escribe «No
  se ha podido calcular el reparto editorial de esta obra» — antes salía idéntico al normal y sin
  avisar. Y **mandarlo por correo exige el permiso de la pestaña Editorial**
  (`discografica.editorial`): el `editorial=1` viaja en el formulario, así que esconder el botón no
  basta.
  ⚠️ Si el **PDF adjunto** no se puede generar, el correo sale igual (con el contenido y el enlace)
  pero **se dice**: «enviado, pero sin el PDF adjunto».

- **LC de REPARTO EDITORIAL** (ago 2026): el Label Copy que se comparte **NUNCA** lleva el reparto entre
  el autor y Plataforma; solo lo lleva el que se pide **desde Editorial**. Mismo generador con una
  bandera: `_build_song_label_copy_pdf_bytes(..., editorial=True)`,
  `discografica_song_label_copy_pdf?editorial=1` y token público con `ed` (`_song_label_copy_share_token(
  id, editorial=True)` → `_label_copy_public_url/_pdf_url(..., editorial=True)`), que es lo que pinta el
  bloque en `public_song_label_copy.html`. Botones «Descargar LC con el Reparto Editorial» y
  «Compartir Reparto Editorial» en la pestaña Editorial.
  El **PDF del LC** (canción y álbum) lleva el logo de la empresa arriba a la **derecha** y el título
  «Label Copy» **centrado** (estilo de casa).

- **Validar la factura de una liquidación · el CUADRE en verde o rojo** (ago 2026,
  `_royalty_invoice_checks`): cada importe lleva su marco **verde si cuadra y rojo si no** (con el
  motivo al pasar el ratón) y el marco de fuera resume, para verlo antes de leer los números. Se
  comprueban la **base** (que sea la de la liquidación), el **IVA** (que sea su % de la base), la
  **retención** (que el % cuadre con el importe) y **lo que se paga** (base + IVA − retención).
  ⚠️ **Con retención, lo que se paga es MENOR que lo que se liquida y eso es CORRECTO**: lo que se
  juzga es que el cálculo salga, no que los dos números sean iguales. Un concepto que no se puede
  juzgar (falta el dato) se queda sin marca en vez de darse por bueno o por malo.
  · **Los documentos requeridos se PINCHAN** y se abren en el mismo pop-up que la factura, con
  descargar y **enviar** (correo, WhatsApp, SMS o copiar el enlace): parcial único
  **`templates/_doc_view_modal.html`** (`#payDocModal`) + `static/js/pagos.js`, compartidos con
  «pendiente de pago». Cualquier elemento con `data-pay-doc="<url>"` lo abre.

- **LOS ENLACES DEL LANZAMIENTO (los que da la DISTRIBUIDORA)** (ago 2026). Cuando el lanzamiento
  sale, la distribuidora manda los enlaces de cada plataforma. Modelo **`DiscoReleaseLink`**
  (proyecto + `kind` + nombre + URL) con su catálogo **`DISCO_RELEASE_LINK_KINDS`** y estado en el
  punto único **`_disco_release_links_state`**.
  · **Los PIDE quien lleva el proyecto** (`disco_links_request`) y le llegan como tarea a quien es
  **REGISTROS y SELLO** (aviso + módulo de Inicio **`HOME_RELEASE_LINKS`** ← `_home_release_links`).
  · **Los SUBE esa persona** (`disco_links_save`). ⚠️ En el proyecto la tarea se ve **condicionada**:
  hasta que los sube sale «**Solicitado y pendiente de …**» con su cara.
  · **Y después se le COMPARTEN AL ARTISTA** (`disco_links_share`, por su canal `DISCOGRAFICA`), que
  es la subtarea siguiente — **bloqueada** mientras no haya enlaces.
  · **En el PLAN de lanzamiento hay una sección «Enlaces»** (`DISCO_PLAN_SECTIONS`): cada uno con su
  **icono**, su **nombre**, el **enlace clicable** y el **botón de copiar** al final (el mecanismo
  global de la casa, `copy-link-btn[data-copy-url]`, no uno nuevo).
  ⚠️ Los iconos de PLATAFORMA van en **`fa-brands`** (Spotify, YouTube, Apple…): con la familia
  SOLID salen **vacíos** — la trampa que ya documenta `_disco_creative_icon_class`.
  ⚠️ **`disco_links_save` va en `REQUEST_ANY_ENDPOINTS`**: los sube Registros, que no tiene por qué
  poder editar discográfica (comprueba dentro que es de quien le toca), y su botón en la lista de
  tareas lleva **`open_to_all`**.
  ⚠️ Un enlace se borra **por id**, así que se comprueba que sea **de ESE proyecto** (regla de la
  casa; comprobado en la prueba).
  · **La ESTADO se decide mirando el DATO** (`done` = hay enlaces), no una marca aparte: así no se
  puede desparejar, y el aviso se cierra solo al subirlos (`_notify_resolve`).

- **CONTABILIDAD · una LIQUIDACIÓN DE ROYALTIES es una factura como las demás** (ago 2026,
  corrección). En la subpestaña **Facturas** salían con «—» en **IVA** y en **retención** y **sin
  casilla**, así que no se podían elegir para subirlas a Holded y «seleccionar todas» parecía no hacer
  nada (si todo lo pendiente eran liquidaciones, no había ni una casilla que marcar).
  · Su desglose sale de **SU factura** (punto único **`_royalty_invoice_amounts`**: base, IVA con su %,
  retención con su % y total; lo que no diga la factura se despeja de la propia liquidación, cuya base
  es `total_amount` y cuyo importe a facturar es base + IVA).
  · Lleva su **casilla** (`name="royalty_ids"`), y las acciones en bloque la incluyen:
  `_accounting_royalties_from_request` (con el mismo criterio que los gastos: el ÁMBITO manda sobre lo
  marcado) + `_accounting_upload_many(..., royalties=…)` y `accounting_bulk_status`.
  · **Se sube a Holded** (`_holded_upload_royalty` + `accounting_royalty_upload`): mismo camino que un
  gasto (contacto → documento → comprobar el total → adjuntar la factura), con el **beneficiario** que
  resuelve `_royalty_beneficiary_promoter` y la empresa que decide `_royalty_holded_company` (la de la
  remesa con la que se pagó y, si no, **PIES**). Lo que devuelve Holded se guarda en la liquidación
  (`holded_doc_id`/`_number`/`_error`/`_warning`, columnas nuevas) y se ve en su fila.
  ⚠️ `_royalty_holded_fields` cachea en `g` para no preguntar una vez por fila, **con `try/except`**:
  estas filas se calculan también desde un cron o un hilo en segundo plano, donde leer `g` revienta
  con «Working outside of application context» (bug real encontrado al probarlo).
  · Y en los gastos, **el IVA se despeja de la base y el total** (`_accounting_amounts`): un gasto del
  que solo se guardó base y total salía con «—» en IVA teniéndolo delante.
- **FACTURAS DE ROYALTIES: lo que se perdía por el camino** (ago 2026, tres bugs reales encadenados).
  Había gente que había facturado por el enlace del correo y su factura **no aparecía en «pendiente de
  liquidar»**. Causas y arreglos:
  · ⚠️ **El enlace caducaba al año** (`_parse_public_royalty_liquidation_token`, `max_age` 31536000) y,
  al caducar, `/facturacion?liq=…` **se comportaba como la landing genérica**: el proveedor subía su
  factura, la app le decía que todo bien y la factura se creaba **sin `royalty_liquidation_id`**, así
  que no salía en ninguna bandeja y nadie se enteraba. Ahora el margen es de **10 años** y, si aun así
  hubiera caducado, **el contenido se recupera** (`SignatureExpired` solo se lanza DESPUÉS de validar
  la firma: viejo no es falso). Y si el token viene pero **no se puede resolver la liquidación**, ni la
  landing ni la subida siguen como genéricas: **se avisa y no se acepta la factura** (mejor eso que
  aceptarla y perderla). La comprobación del enlace va **antes que la de los certificados**, para no
  mandar a nadie a buscar papeles que no son el problema.
  · ⚠️ **Al rechazar una factura no se soltaba el vínculo** salvo que la liquidación estuviera en
  `INVOICED`, así que el enlace le seguía diciendo al proveedor «ya hay una factura subida» y no podía
  mandar la corregida. Ahora `supplier_invoice_reject` suelta `invoice_id` **siempre** que apuntara a
  esa factura, vuelve a `SENT` y lo apunta en el historial; y **una factura RECHAZADA nunca bloquea**
  el enlace (`_invoice_existing_block` y los dos ramales de subida), que justamente se le ha pedido
  que la corrija — además se le recuerda **por qué** se le devolvió.
  · **Red de seguridad para lo ya perdido**: bloque **«Facturas subidas SIN VINCULAR»** en
  Administración → Pendiente → De liquidación (`_orphan_supplier_invoices`: PENDIENTE y sin
  liquidación, bolsa, gasto, petición ni persona) con un selector para **vincularla a su liquidación**
  (`administration_invoice_link_royalty`) y que vuelva al proceso. Ahí caen también las subidas por la
  landing genérica sin destinatario, que son igual de invisibles.
  · **Y donde de verdad se busca: BASES DE DATOS → FACTURAS**, con dos pestañas nuevas
  (`INVOICE_KINDS`): **«Sin vincular»** —que **solo existe si hay alguna** (`INVOICE_CONDITIONAL_TABS`,
  con su contador) y desde la que se puede **vincular a una liquidación** o **asignársela a una
  persona** (`supplier_invoice_assign_person`: entra en su «Mis gastos» y arranca su plazo)— y
  **«Pendientes de asignar»** (`_invoices_pending_assign_rows`), que es TODO lo que espera bolsa **sea
  de quien sea** (los `PersonalExpense` en PENDING, con de quién es, su origen y su plazo) **más las
  del limbo**, marcadas «Sin destinatario» porque nadie las ve en su Inicio. El bloque de
  Administración se queda: es donde trabaja administración.
  · ⚠️ **UN RECHAZO YA NO ES INVISIBLE** (`InvoiceUploadAttempt` + `_invoice_attempt_log`,
  `ensure_invoice_attempts_schema`). Cuando el servidor NO acepta una factura (el enlace no vale, le
  faltan datos, el importe no cuadra, ya había una, le falta documentación) el aviso se le enseñaba a
  quien subía **y aquí no quedaba constancia de nada**: un rechazo era indistinguible de no haber
  intentado, así que a «yo sí la subí» no se podía contestar. Ahora cada rechazo se apunta con su
  motivo, y en **Bases de datos → Facturas → Subidas por terceros** salen dos bloques:
  **«Intentos de subida que NO se aceptaron»** (quién, por dónde, nº, importe, motivo y cuándo) y
  **«Liquidaciones enviadas de las que NO ha llegado factura»** (`_royalty_sent_without_invoice`), que
  es el contraste que dice si de verdad está entrando algo o no.
  · **La alerta de datos que faltan se ve en las TRES pantallas** (bandeja de royalties, «Subidas por
  terceros» y las pestañas nuevas): línea roja con qué falta + botón **«Completar a mano»** →
  `supplier_invoice_edit`. Antes en «Subidas por terceros» solo había una lupa para releer el PDF y el
  editar estaba escondido en los tres puntitos: no se encontraba.
  · **El módulo «Mis gastos» de Inicio solo sale si esa persona tiene algo pendiente** de asignar
  (antes salía siempre, con un «sin gastos pendientes» que solo hacía ruido). La sección sigue en el
  menú, así que no se pierde el acceso.

- **ROYALTIES · pedir la factura y registrarla desde dentro** (ago 2026):
  · **Administración → Liquidaciones** tiene subpestañas (`ADMINISTRATION_LIQ_TABS`, `?liq_tab=`):
  **Bolsas** (lo de siempre) y **«Enviadas pendientes de factura»**
  (`_royalty_sent_without_invoice`): liquidaciones enviadas de las que NO ha llegado la factura, con
  el nombre enlazado a su liquidación, su **«i» de trazabilidad** (modal propio y compacto que pinta
  el `timeline` del endpoint `/discografica/royalties/liquidacion/info` — el modal grande de
  Discográfica no existe en esta pantalla), el PDF, y en los tres puntitos **«Volver a solicitar la
  factura»** (reenvía la liquidación, cuyo correo lleva el botón de subirla). Arriba, **«Volver a
  pedir la factura a todas»**, que las recorre una a una y dice cuántas han salido.
  · ⚠️ **El enlace «Subir factura» del PDF iba al formulario GENÉRICO** (`piesrecords.com/facturacion`
  a pelo): quien lo usaba subía su factura **sin vincular a la liquidación** y no llegaba a «pendiente
  de liquidar». Ahora apunta al **mismo sitio que el botón del correo** (el enlace público de ESA
  liquidación); si no se pudiera construir, cae al genérico.
  · **Subir la factura DESDE DENTRO** (`royalty_liquidation_invoice_upload`, en los tres puntitos de
  la liquidación): modal para **arrastrar o elegir** el documento, se leen sus datos con el mismo
  lector que la landing (`public_invoice_detect`) y **solo se piden a mano los que no se han podido
  leer** (salen resaltados).
  · **PANTALLA PARTIDA como en la landing** (mismas clases `.inv-split*`): la factura a la IZQUIERDA
  —pintada del propio archivo con `URL.createObjectURL`, sin subirla— y a la DERECHA los campos ya
  rellenos con lo leído (nº, fecha, base, IVA, retención, total, **artista** y concepto). Arriba se dice
  **a quién se le vincula** (el beneficiario) y la base a facturar.
  · **QUIÉN EMITE la factura** lo resuelve `_royalty_beneficiary_promoter`: si el beneficiario es un
  TERCERO, él mismo; si es un ARTISTA, el tercero que le factura —primero sus **integrantes**
  (`ArtistPerson.promoter_id`: el solista o quien cobra por el grupo) y si no el tercero **vinculado**
  al artista—. Con **más de un candidato NO se elige por su cuenta**: el endpoint responde
  `needs_promoter` con la lista y el modal enseña el selector. Sin ninguno, se dice que hay que
  vincular al artista con su tercero.
  ⚠️ El arrastre lo hace el mecanismo **GLOBAL** (`file_drop.js` + `data-file-drop-for="#royInvoiceFile"`),
  igual que cuando la sube un tercero. Un `drop` PROPIO en la zona **rompe la detección**: al hacer
  `preventDefault` el global se aparta («lo ha gestionado una dropzone propia») y nadie asigna el
  fichero (bug real). Y la lectura se engancha por **delegación** sobre el `change` del input, para que
  dé igual quién lo dispare y cuándo se cree el modal. Al guardar, la liquidación pasa a **FACTURADA** y queda pendiente de
  validar en administración. Si el importe no cuadra se avisa, pero desde dentro **se puede forzar**
  (`force=1`): administración sabe lo que hace. Una factura ya VALIDADA no se pisa.

- ⚠️⚠️ **EL REPARTO EDITORIAL LO DECIDE LA EDITORIAL DEL REGISTRO, NO LA FICHA DEL AUTOR** (bug real
  de dinero, ago 2026). `_share_split_applies_live` exigía **dos** cosas: que el registro fuera de
  Plataforma **y** que la ficha del tercero tuviera HOY editorial de Plataforma. Eso dejó de
  funcionar en cuanto el cambio de editorial pasó a ser **«solo en esta canción»** por defecto: al
  guardar un autor ya no se toca su ficha, así que se queda sin editorial y **el reparto dejaba de
  aplicarse aunque el registro dijera Plataforma** — un integrante con contrato editorial se quedaba
  sin su porcentaje (caso real: Pol Gutiérrez Molina, integrante de DePol).
  ⚠️ El síntoma es engañoso: `_editorial_split_for_author` **sí encuentra el contrato**; lo que
  falla es `_song_editorial_split_map`, que se salta la parte con un `continue` y devuelve el mapa
  **VACÍO**, así que en la ficha no se pinta nada. Al depurar hay que mirar el MAPA, no solo el
  contrato.
  · Ahora manda la editorial **congelada en el registro** (que es la regla de la casa desde que la
  editorial se congela por registro): si el registro trae la suya, eso es lo pactado para esa obra.
  La ficha del tercero solo decide en los registros ANTIGUOS, que no llevan editorial propia.
  · Comprobados los cinco casos: registro=Plataforma con la ficha vacía → **se aplica**; registro con
  OTRA editorial → no; registro vacío con la ficha en Plataforma → sí; registro vacío con la ficha en
  otra → no.

- ⚠️⚠️ **EL CONCEPTO DE UN COMPROMISO ES TEXTO LIBRE: se compara con TOLERANCIA** (ago 2026). En la
  ficha del artista el `concept` de un compromiso se escribe a mano (`<input name="concept">`), así
  que en la base hay «Editorial», «Derechos editoriales», «Edición musical», «Editorial 50/50»… y
  `_pick_artist_commitment_from_rows` lo comparaba por **pertenencia EXACTA** a una lista de cinco
  valores: cualquier variante se quedaba fuera y **el contrato no se detectaba** —un integrante con
  contrato editorial se quedaba sin su reparto, sin ningún aviso—.
  · Ahora casa también si el concepto **CONTIENE** una de las variantes (o al revés). Los catálogos
  son **disjuntos** entre sí (`EDITORIAL_CONTRACT_CONCEPTS` · `RECORD_DEAL_CONCEPTS` · management ·
  booking · distribución…), así que no se pisan: comprobado que «Discográfico» no cuela como
  editorial ni «Editorial» como discográfico.
  · Al añadir un catálogo de conceptos nuevo, comprobar que no comparte palabra con los que ya hay.

- ⚠️ **«PLATAFORMA MUSICAL» SE RECONOCE CON TOLERANCIA** (ago 2026): el nombre de la editorial lo
  escribe una persona al darla de alta, así que en la base está como «Plataforma Musical»,
  «Plataforma Musical S.L.», «PLATAFORMA MUSICAL SL»… `_publisher_is_platform` comparaba por
  igualdad exacta, y con cualquier variante el autor dejaba de ser «nuestro»: sin reparto y **sin
  que se pintara nada** en la ficha (el bloque entero cuelga de `is_platform`). Ahora basta con que
  el nombre CONTENGA «plataforma musical».

- **DIAGNÓSTICO del reparto editorial**: `tools/diag_reparto_editorial.py "Nombre del autor"`
  (opcional `--cancion "Título"`). Recorre la cadena entera y dice **dónde se corta**: las fichas de
  tercero con ese nombre (y si hay duplicados), de qué artistas es integrante, los compromisos de sus
  contratos marcando cuál cuenta como editorial, y por cada parte autoral la editorial del registro
  frente a la de la ficha, si está congelado, si se puede calcular hoy, qué contrato sale y **qué se
  pinta de verdad en la ficha**. Solo lee.
  ⚠️ Lo primero que hay que mirar cuando «no se aplica el contrato» es la **última línea**: si el
  contrato aparece pero lo que se pinta es «NADA», el corte está en `_song_editorial_split_map`
  (editorial que no es Plataforma, o el `continue` de `_share_split_applies_live`), no en el contrato.

- **Liquidación de royalties · CANDADO de importes bloqueados**: en Royalties, delante de la etiqueta
  de estado (`render_actions` de `discografica_royalties.html`, clase `.roy-lock`), cuando la
  liquidación está generada (`b.is_generated` = tiene congelado). El tooltip dice desde cuándo y que
  para cambiarlos hay que generar una nueva.

- **Royalties · la liquidación GENERADA queda congelada**: al generar se guarda en
  `RoyaltyLiquidation.snapshot` el detalle tal cual (+ `snapshot_signature` y `snapshot_pdf_url`), y
  todo lo que se ve/envía/descarga después usa ESO (`_build_royalty_liquidation_pdf_bytes(use_frozen=True)`,
  que es el valor por defecto; solo el botón de generar llama con `use_frozen=False`). Aunque cambien
  los ingresos la liquidación no se altera: `_royalty_needs_regeneration` compara firmas y marca
  «Ingresos actualizados», y al pulsar **Generar de nuevo** sale primero la **comparativa**
  (`royalty_liquidation_compare`) para aceptarla o conservar la anterior. Botonera: sin generar solo
  **Generar liquidación**; generada, **Enviar liquidación** (no se puede enviar sin generar) + descarga
  del PDF generado. **Botonera por estado**: sin generar → «Generar liquidación»; generada y sin
  enviar → «Enviar liquidación» (+ Información + menú de 3 puntos); **generada y enviada → solo
  «Información» y el menú de 3 puntos** (Reenviar liquidación · Generar una nueva · Descargar la
  generada). Con cambios económicos sale un **triángulo amarillo** cuyo tooltip dice desde cuándo y
  **cuánto cambiaría** (`income_diff_label`, calculado en `_apply_royalty_liquidation_meta`); al generar
  la nueva, esos datos sustituyen a los anteriores y el aviso desaparece.
  Toda la vida de la liquidación (generada, enviada, factura, cobro) se apunta en `history`
  (`_royalty_history_add`) y se ve en el botón **i**: el modal es una **secuencia en orden**
  —generación → envío (con destinatarios y descarga de la enviada) → factura (con enlace para verla) →
  pago—, **enseñando solo los bloques y campos que tienen dato**, y debajo el historial completo.
- **Royalties · facturación y validación**: las liquidaciones se facturan **a nombre de PIES**
  (el sello), no de la primera empresa del grupo por orden alfabético — helper `_pies_group_company`
  (del que ya tira `_afavor_pies_company`), usado por `public_royalty_liquidation_view` y por
  `/facturacion?liq=`. El correo/PDF de cada liquidación enlaza a
  `public_royalty_liquidation_view` (`/liquidacion/<token>`, reusa el token firmado de
  `_make_public_royalty_liquidation_token`), que la muestra como el PDF y ofrece **Subir factura**
  → al subirla se vincula (`SupplierInvoice.royalty_liquidation_id`) y la liquidación pasa a
  `INVOICED`. Administración → Pendiente → De liquidación lista las facturas por validar
  (`_royalty_invoice_pending_rows`) y `administration_royalty_invoice_review` muestra
  **liquidación a la izquierda / factura a la derecha**: validar deja pendiente de pago, rechazar
  avisa por correo con el motivo y devuelve la liquidación a `SENT`. ⚠️ Si alguien sube la factura por
  el enlace **sin que la liquidación existiera**, se crea sola (congelando los datos de ese momento) y
  queda como **facturada**: aparece en el listado de royalties y la factura, en la base de facturas. Se contrasta con las **órdenes
  de embargo vigentes** del proveedor y se avisa para no abonarle. Acciones en bloque:
  `royalty_liquidations_download_all` (un PDF continuo con pypdf) y `royalty_liquidations_send_all`.
- **Royalties · CONSIGNAR lo ya generado o enviado** (`_royalty_freeze_backfill`, marca
  `royalty_freeze_backfill_v1`): las liquidaciones anteriores al congelado no guardaban nada y se
  recalculaban al abrirlas. El relleno les fija su detalle una vez: si hay `last_sent_snapshot` se
  consigna **eso** (`consigned_from='SENT'`, es lo que recibió el beneficiario) y si no hay nada, lo de
  ese momento (`consigned_from='LIVE'` + `consigned_at`, y el detalle lo **dice** en pantalla, porque
  los importes originales no se pueden recuperar). ⚠️ El «ya está consignada» se decide mirando
  `rec.snapshot` A SECAS, no `_royalty_frozen_beneficiary` (que cae a lo enviado): si no, justo las que
  solo tienen el congelado del envío se saltarían. Corre en el arranque y hay botón **«Consignar»**
  (solo dirección) en Royalties para las que aparezcan después.
- ⚠️⚠️ **Royalties · el cálculo «en vivo» venía con el CONGELADO pegado** (raíz del fallo, ago 2026).
  `_apply_royalty_liquidation_meta` sobreescribe `total_amount`/`total_income`/`items` del bucket con
  el congelado, y la llaman **los dos constructores** (`_build_royalty_single_beneficiary` y
  `_build_royalty_beneficiaries`) → `_get_royalty_liquidation_beneficiary_data`, que todo el mundo
  trataba como «los datos de ahora», devolvía **los congelados**. Consecuencias reales: **generar una
  liquidación nueva volvía a congelar los importes VIEJOS** (nunca se actualizaba) y la comparativa
  antes/ahora salía idéntica. Ahora los tres aceptan **`apply_frozen`** (por defecto `True`, que es lo
  que quiere cualquier pantalla) y lo llaman con **`apply_frozen=False`** los cuatro sitios que
  necesitan los datos de HOY: generar (`use_frozen=False`), `royalty_liquidation_compare`, el modal de
  Información y el congelado de urgencia al subir una factura sin liquidación generada.
  · **El congelado se busca PRIMERO** (`_build_royalty_liquidation_pdf_bytes` y el enlace público):
  antes se calculaba siempre la liquidación en vivo y solo después se sustituía, así que una
  liquidación ya enviada **no se podía ver** si sus ingresos habían cambiado o desaparecido (saltaba
  «no hay datos»), y cualquier fallo en el reemplazo dejaba a la vista los importes de hoy.
  · **`_royalty_frozen_beneficiary` cae a `last_sent_snapshot`** si no hay `snapshot`: las
  liquidaciones enviadas antes de que se guardara el congelado de la generación solo tienen ese, y aun
  así es LO QUE SE ENVIÓ. Sin esto caían a los datos de hoy.
  · El enlace del beneficiario **dice si está cerrada** (y cuándo se generó); si no lo está, avisa de
  que los importes pueden variar.

- **Royalties · la pantalla de VALIDAR y el circuito de PAGO** (ago 2026):
  · **Izquierda = la liquidación TAL CUAL se envió**: sale del **congelado**
  (`_royalty_frozen_beneficiary`), no de recalcular en vivo, y se pinta con el parcial compartido
  **`templates/_royalty_liquidation_detail.html`** (macro `royalty_detail`), que usan también el enlace
  público y por tanto tiene las MISMAS columnas que el PDF (portada · Repertorio · Código · Fecha ·
  Ingreso · % · A facturar) con los descuentos bajo cada línea. ⚠️ El total del beneficiario es
  **`total_amount`**, no `total`: las dos plantillas leían `total` y el total salía **0,00 €** (bug
  real). ⚠️ El snapshot **no guardaba los descuentos**, así que con `use_frozen=True` desaparecían del
  PDF y de la pantalla: ya se congelan (`amount_before_deductions`/`deduction_total`/`deductions`);
  las congeladas de antes no los traen y no se pueden reconstruir.
  · **Derecha** = resumen (con aviso si la factura **no cuadra** con la liquidación) + documentación
  exigida + **botones de validar/rechazar ENCIMA** + la **factura abierta** en un `iframe` (PDF) o
  `<img>` (foto), sin tener que pinchar.
  · **Validar → pendiente de pago**: antes desaparecía porque «Pendiente de pago» solo listaba
  `BagExpense`. Ahora `_royalty_payment_pending_rows` las mete en `_payment_pending_context` bajo la
  empresa que factura los royalties (PIES), se pueden **arrastrar a la remesa**
  (`PaymentBatchItem.royalty_liquidation_id`, `_payment_batch_add_royalties`, campo `royalty_ids`),
  tienen su **icono** de crear/bajar la remesa eligiendo la cuenta (`royalty_liquidation_batch`) y su
  **estado como etiqueta clicable** (`royalty_liquidation_payment_status`: pendiente de pago ↔ pagada).
  El contador de la subpestaña las suma (si no, no cuadraba con lo que se ve).
  · ⚠️ **Pendiente de pago = la factura está VALIDADA**, no `status='INVOICED'` a secas: ese estado se
  pone al SUBIR la factura, así que filtrando solo por él se colaban liquidaciones sin factura o con la
  factura por validar y salían como **filas vacías** («Beneficiario», sin importe). Se cruza con
  `SupplierInvoice.status='VALIDADA'` (también en el contador). El importe no puede faltar en algo ya
  validado: congelado → factura → recálculo. Y los avisos de datos que faltan van en **español**
  (`REMESA_MISSING_LABELS`): `sepa_check_payment` devuelve las claves en inglés («amount», «iban»…) y
  se estaban pintando tal cual.
  · **La factura se ve en un POP-UP** al pinchar en cualquier pendiente de pago (`data-pay-doc` +
  `#payDocModal` en `pagos.js`): PDF en un marco, foto como imagen, con abrir y descargar. Encima va
  el **RESUMEN del pago** (base, IVA, **retención** si la hay, total a pagar, nº de factura,
  beneficiario y **la cuenta a la que se abona**), que es lo que hace que cuadre lo que se factura con
  lo que se paga; los importes viajan en `data-pay-doc-*` desde la fila (`_payment_expense_row` añade
  `net`/`vat`/`retention`/`invoice_number`).
  ⚠️ **Un PDF con la página pequeña se veía diminuto** en medio del marco: el ancla lleva
  `zoom=page-width` además de `view=FitH` (y hay botón de **pantalla completa**). Lo mismo en la
  pantalla de validar.
  · **Pagada → contabilidad**: `_royalty_mark_paid` (también desde el justificante de la remesa) y
  `_royalty_accounting_pending_rows` → módulo **«Pendiente de contabilizar»** de `/contabilidad`
  (plantilla nueva `contabilidad.html`) con `royalty_liquidation_accounted`.
  · **Avisos antes de abonar**: orden de **embargo** vigente y **adelantos/deudas** con las empresas
  del grupo (`PartyDebt` + `_party_debt_rows`), en la pantalla de validar, en la línea de la
  liquidación y en **cada gasto** de pendiente de pago (`_payment_expense_row`). Se anotan en la
  pestaña **«Adelantos y deudas»** de la ficha del tercero (`promoter_debt_save`/`_delete`); lo
  pendiente es `amount − amount_recovered` y al llegar a cero se cierra sola.
- **Royalties «A FAVOR»** (lo que nos liquidan las compañías externas): modelo `AfavorLiquidation`
  (una fila por **compañía + semestre**, UNIQUE) con el flujo `AFAVOR_STATUS_FLOW`
  PENDING → REQUESTED → PENDING_INVOICE → INVOICED → COLLECTED (etiquetas `.afavor-st--*` en gama
  azul→verde). `_build_afavor_groups` agrupa por **artista** y, dentro, por **compañía** (que es
  quien lleva el estado) e incluye portada/ISRC/fecha/colaboradores; **sin importes** (van en
  Ingresos). Endpoints: `afavor_request_liquidation` (correo con logo PIES a la derecha, cabecera de
  la compañía y listado; `_afavor_request_email_html`), `afavor_request_invoice`,
  `administration_afavor_invoice(_upload/_send)` (Administración → Pendiente → De facturación:
  liquidación izquierda / datos de facturación y subida derecha; la empresa que factura la da
  `_afavor_pies_company`), `afavor_invoice_resend`, `afavor_mark_collected`, `afavor_liquidation_pdf`.
  ⚠️ Sus endpoints NO llevan prefijo `discografica_`: están mapeados a mano en
  `_resolve_request_resource_key`/`_coarse_endpoint_resource` (si no, solo dirección podría usarlos).

- ⚠️⚠️ **ROYALTIES «A FAVOR» · EL PROCESO COMPLETO** (sep 2026, rediseño). Antes era una pantalla de
  consulta con un correo y un estado que se movía a mano; ahora es el ciclo entero, y **un tema no
  entra en la liquidación del artista hasta que lo hemos COBRADO**.
  · **Un A FAVOR puede ser de una CANCIÓN o de un DISCO**: `Album` gana las MISMAS cuatro columnas de
  colaboración externa que `Song` (`is_external_collab` · `external_company_id` · `our_pct` ·
  `our_pct_base`), se eligen en «Propiedad» de la ficha del disco y en su alta, y
  `_album_ownership_label` dice «Colaboración externa».
  · **EL DETALLE por tema**: `AfavorItem` (una fila por liquidación + canción/disco) con SU documento,
  SU importe y su estado PENDING → SUBMITTED → APPROVED / REJECTED. `AfavorLiquidation` gana la
  trazabilidad (`history`, mismo patrón que las liquidaciones normales), quién lo subió, la revisión,
  la factura y `total_amount`. `ensure_afavor_schema()`.
  · **ESTADOS** (`AFAVOR_STATUS_FLOW`): Pendiente → Solicitada → **Recibida** → Pendiente de facturar
  → **Factura emitida** → **Factura enviada** → Cobrado. ⚠️ «Emitida» y «enviada» son DOS cosas: la
  factura puede estar subida y no haber salido (y entonces se marca a mano). El `INVOICED` de antes se
  lee como «Factura enviada» (`AFAVOR_STATUS_ALIASES`).
  ⚠️ **La etiqueta de estado CUENTA la historia al pasar el ratón** (`_afavor_status_tooltip`): cuándo
  se solicitó y a quién, cuándo la subieron, cuándo se pidió la factura y a quién, cuándo se envió y
  cuándo se cobró. Es la información de contabilidad que se pide sin abrir nada.
  · **CUÁNDO SE PIDE**: `_afavor_due_semester()` — **un mes después** de que cierre el semestre (del 1
  de agosto para el S1, del 1 de febrero para el S2). El barrido `_afavor_request_sweep`
  (`/cron/afavor`, colgado también del cron diario de documentos) le crea la tarea a quien es
  **REGISTROS y SELLO a la vez**, **una sola vez por semestre** y con el aviso que se cierra solo
  cuando no queda ninguna compañía por pedir. Módulo de Inicio `HOME_AFAVOR_REQUEST` con el botón
  **«Pedirlas todas»**.
  · **LA SOLICITUD tiene VISTA PREVIA** (`afavor_request_view` + `afavor_request_preview` +
  `afavor_request_liquidation`, plantilla `afavor_request.html`), con el patrón exacto de la casa: los
  destinatarios CONFIGURADOS con su casilla (`_afavor_company_recipients` + `_notify_apply_prefs` +
  `_notify_channel_picker.html`), correos a mano, la NOTA y los ojos por módulo. La previa es **EL
  MISMO HTML** que se manda (`_afavor_request_html`). Vale para UNA compañía o para TODAS (una tarjeta
  por compañía, con su casilla y sus correos, y la previa de la que se esté mirando).
  · **EL ASUNTO** es «**Solicitud liquidación de Royaltys (1º semestre 2026)**»
  (`_afavor_request_subject` + `_afavor_semester_ordinal`).
  · **ENLACE PÚBLICO POR COMPAÑÍA** (`Promoter.afavor_token`, opaco y creado **con commit**):
  `public_afavor_liquidation` (`/liquidaciones-royalties/<token>`). Elige el SEMESTRE (**todos desde
  que se publicó** su primer tema, `_afavor_semesters_since`; por defecto el que toca), ve sus temas
  con la portada, el artista y los intérpretes, el **% a favor** y escribe el importe (con separador
  de miles), con el **«Total Royalty de compañía»** en vivo; sube la liquidación **tema a tema**
  arrastrándola, y **puede mandar unos y no otros**. Lo ya enviado se queda a la vista en gris con su
  etiqueta «Enviado». Y actualiza sus **datos fiscales** desde la propia cabecera.
  ⚠️ **Sin documento no se manda**: no se puede dar por liquidado un tema sin su liquidación.
  ⚠️ Si no escribe el importe se intenta **leer del documento** (`_afavor_detect_amount`): es una
  ayuda, no una barrera — si no se puede, se deja el campo.
  · **LA REVISIÓN** (`afavor_review_view`/`_save`, pantalla partida: el documento a la izquierda y los
  importes a la derecha) la hace **registros+sello**: validar, rechazar con su motivo (y se le dice a
  la compañía con su enlace) o corregir el importe. ⚠️ **Al validar, el importe declarado pasa a ser
  el INGRESO del semestre de ese tema** (`_afavor_apply_income` escribe la fila base de
  `SongRevenueEntry`/`AlbumRevenueEntry`): no hay dos verdades ni se teclea el mismo número dos veces.
  · **LA FACTURA** se le pide a **CONTABILIDAD de la empresa del grupo que corresponda** (PIES) con el
  importe, los datos de facturación y el **concepto** «Royaltys 1º semestre 2026 · Canción (Artistas)»
  (`_afavor_invoice_concept`); les sale en Inicio (`HOME_AFAVOR_INVOICES`) y en Administración →
  Pendiente → De facturación. **Al subirla se le manda sola a la compañía**; si el correo no sale
  queda «Factura emitida» y se avisa al sello para mandarla a mano (`afavor_invoice_mark_sent`).
  · **EL COBRO** lo marca administración (bloque «pendientes de cobro» en esa misma subpestaña, con la
  responsabilidad nueva `COBROS`), y con eso el tema entra ya en la liquidación del artista.
  ⚠️⚠️ **EL GATE**: `_royalty_collab_gate(session_db, sem_start)` (las compañías COBRADAS de ese
  semestre, UNA consulta) + `_royalty_collab_blocked(material, cobradas)`, aplicados en los **OCHO**
  bucles de los dos builders. Un tema excluido no entra en el congelado, así que al cobrarlo la
  liquidación ya generada salta con el aviso de «los ingresos han cambiado» y se regenera.
  · ⚠️⚠️ **Y DE PASO, un bug de dinero**: `_build_royalty_single_beneficiary` —la ruta RÁPIDA, la que
  usan el PDF, el correo y el congelado— **no aplicaba `_royalty_external_collab_income`**: la pantalla
  enseñaba el importe reducido a nuestro % y el PDF repartía el ingreso COMPLETO de la compañía. Ya se
  aplica en los cuatro sitios de ese builder (y en los dos de álbumes del otro).
  · **AGRUPADO por artista o por COMPAÑÍA**: `?group=company` agrupa por la **matriz**
  (`Promoter.parent_promoter_id`, que se elige en la ficha del tercero), así se ve junto todo lo de
  «Sony Music» aunque cada sello sea una ficha distinta. ⚠️ Un tercero no puede ser su propio padre ni
  cerrar un ciclo, el grupo es de **un solo nivel** (si el elegido ya tiene matriz se apunta la de
  arriba) y `_merge_repoint_references` limpia el auto-padre que dejaría una fusión.
  · **SUBIR LIQUIDACIONES EN BLOQUE** (botón arriba a la derecha, `_afavor_upload_modal.html`):
  motor puro **`royalty_statement_read.py`** (`read_statement` → líneas con código, título, artista,
  importe y periodo; reutiliza `pdf_rows` y `read_rows`) con su prueba de regresión
  **`tools/check_royalty_statement_read.py`**. Casa por ISRC / código de producto / título
  (`_afavor_catalog_index` + `_afavor_statement_match`, **sumando** las líneas del mismo tema), enseña
  las coincidencias y **lo que NO casa con su motivo**, y al aceptarlas carga los ingresos y deja los
  temas **pendientes de revisar**. ⚠️ **Lo ya VALIDADO no se pisa** (y se dice).
  ⚠️⚠️ **`csv.Sniffer` SE QUEDA CON LA COMA EN UN CSV ESPAÑOL**, donde la coma es el separador
  DECIMAL: «…;Tema;120;45,10» se partía en «…;Tema;120;45» y «10», así que el importe salía **10** y
  el título arrastraba media fila. Arreglado en el **punto único** (`promoter_import._resplit_csv`,
  llamado desde `_rows_from_csv`): si con el separador elegido quedan celdas que TODAVÍA traen dos o
  más de otro candidato, ese otro es el de verdad y se relee con él (y solo se acepta si de verdad
  parte en MÁS columnas). Como el lector es el mismo, se benefician también las importaciones de
  TERCEROS, de COMPRADORES y de SUPERVISORS.
  ⚠️ Los tres endpoints públicos van en las **tres** listas y los de la revisión
  (`afavor_review_view`/`_save`, `afavor_invoice_mark_sent`) en **`REQUEST_ANY_ENDPOINTS`**: los hace
  registros+sello, que no tiene por qué tener la pestaña de Royalties concedida.
  ⚠️ `_afavor_material_rows` filtra **`release_date <= sem_end`** (un tema no se le puede reclamar por
  un semestre en el que no existía) y suma los ingresos cargados **como SEMESTER y como los 6 MONTH**
  (antes solo miraba SEMESTER: un semestre cargado por meses se veía a cero).
  ⚠️ Una clave de un dict que se lea en Jinja **no puede llamarse `items`** (`blk.items` devolvería el
  método): por eso el bloque de compañía lleva `rows` y el módulo de Inicio `temas`.

- **Colaboraciones externas en la liquidación del ARTISTA**: `_build_royalty_beneficiaries` ya NO las
  excluye. `_royalty_external_collab_income(song, gross, net)` devuelve lo que nos ingresa la
  compañía (ingreso × `Song.our_pct`, sobre bruto o neto según `our_pct_base`) y ese importe es la
  base sobre la que se aplican el % del contrato del artista (por concepto discográfico/catálogo) y
  el de los terceros de `SongRoyaltyBeneficiary`. La etiqueta la pone `_royalty_item_ownership_label`.

