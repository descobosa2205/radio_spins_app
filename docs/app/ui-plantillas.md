# UI · plantillas, JS, PDF, móvil y formularios

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- Menú superior (_build_nav_menu): el agrupamiento del menú es INDEPENDIENTE del árbol de
- Iconos de sección
- Select2 con logos
- Loader global
- MÓVIL · lo que no cabe SE DESPLAZA, no se estruja
- MÓVIL · lo que se salía de la pantalla en INICIO (ago 2026, sobre la red de seguridad de
- EL BOTÓN DE VOLVER NUNCA LLEVA A UN FORMULARIO. Al crear algo, la pantalla
- UN </div> DE MÁS CIERRA EL CONTENEDOR ANTES DE TIEMPO (bug real, ago 2026)
- EL LECTOR DE CODEPOINTS TIENE QUE ENTENDER LOS ALIAS AGRUPADOS: Font Awesome escribe
- ⚠️⚠️ LA VERSIÓN DE LOS ESTÁTICOS ES LA FECHA DEL FICHERO, NO LA HORA DE ARRANQUE (bug real
- LAS FLECHAS DE ANTERIOR / SIGUIENTE NO SE PIERDEN AL GUARDAR: al guardar un
- LOS LOGOS DE PLATAFORMA SE PINTAN CON EL ICONO DE MARCA, NO CON LOS PNG SUELTOS (ago
- EL NOMBRE DE UN ARCHIVO QUE SE DESCARGA TRANSLITERA LAS TILDES Y LA Ñ
- Cambios de estado in-place (static/js/ajax_inline.js): un
- «Maximum call stack size exceeded» en INICIO (bug real, ago 2026): updateSellerCards del
- Flecha de VOLVER (toda la app): la flecha gris de arriba a la izquierda (.btn-volver) y
- shown.bs.modal NO ES FIABLE en esta app
- form.action NO ES LA URL si el formulario tiene un campo llamado «action» (bug real,
- |forceescape DENTRO DE UN <script> ROMPE EL JS (bug real, ago 2026). En un <script>
- UN ICONO DENTRO DE UNA ETIQUETA VA EN EL COLOR DE LA ETIQUETA (bug real, ago 2026): la
- EL SUBRAYADO DE UNA FILA VA SOBRE EL TEXTO, NO SOBRE LA LÍNEA (bug real, ago 2026)
- UN <script> DENTRO DE UNA ZONA data-inline-zone NO SE VUELVE A EJECUTAR (bug real y
- UN <datalist> NATIVO NO SIRVE PARA «AL ELEGIR, HACER ALGO»: al pinchar una
- EL BOTÓN «TODOS» DE UN FILTRO TAMBIÉN ALTERNA (refreshGroupButtons, ago 2026): se quedaba
- UN FILTRO DE SELECCIÓN ÚNICA NO PUEDE PERDERSE EN UNA RECARGA: el reporte de
- MENÚ «más secciones» (⋯) · una SECCIÓN CON SUBSECCIONES se abre al pincharla
- UN VÍDEO SUBIDO SE REPRODUCE POR SU VERSIÓN WEB, NO POR EL ORIGINAL (sep 2026, bug real
- AL ENTRAR EN UNA FICHA SE ABRE SU PRIMERA PESTAÑA, y las SUBPESTAÑAS también se ordenan
- UN BOTÓN «COPIAR ENLACE» DENTRO DE UNA ZONA INLINE SE QUEDABA MUERTO
- TODOS LOS ASISTENTES Y LAS ALTAS SE VEN IGUAL: la cabecera de «Datos de la entrada» (sep
- PARA VER LA APP EN EL NAVEGADOR EN LOCAL: .claude/launch.json → tools/dev_server.py,
- static/maintenance.html es HTML PURO (no pasa por Jinja): un comentario {# … #} se
- UNA FOTO O UN LOGO QUE FALTA NO SE RELLENA CON LA MARCA DE LA CASA (sep 2026, barrido
- FILTROS DE APLICACIÓN DIRECTA · fuera el botón «Ver»: un formulario marcado con
- UN CHIP QUE ES <a> SALE SUBRAYADO: a.filter-chip{ text-decoration:none } (un chip no es
- SELECT2 AVISA CON jQuery.trigger('change'), QUE NO DISPARA LOS LISTENERS NATIVOS (bug
- EL BUSCADOR DE UN SELECT2 CON GRUPOS ENTRA EN LOS GRUPOS, y el «+» deja lo creado en el
- UN POP-UP QUE HA CREADO O CAMBIADO ALGO RECARGA LA PANTALLA DE DETRÁS AL CERRARSE
- VOLVER ATRÁS NO DEVUELVE UN FORMULARIO YA ENVIADO (sep 2026, bug real
- TODAS LAS TAREAS DE LA PESTAÑA «INICIO» SE PUEDEN HACER DESDE AHÍ. Las tareas
- LO QUE SE ESCRIBE NO SE PIERDE · guardado en vivo de lo tecleado (sep 2026,
- UNA LISTA DE SUGERENCIAS TIENE QUE SEGUIR A SU CAMPO, Y NO TAPAR MEDIA PANTALLA (sep 2026,
- LA DIRECCIÓN SE RELLENA EN DOS PASOS: primero la BARRA, luego los campos
- LO QUE FALTA SE MARCA EN AMARILLO Y LO QUE ESTÁ MAL EN ROJO, Y NO SE DEJA PASAR (sep 2026,
- UNA PIEZA SE PINCHA Y SE VE, con flechas para pasar a la siguiente
- LA BARRA DE DESCARGA NO BLOQUEA LA PANTALLA (sep 2026, static/js/download_bar.js
- UNA MINIATURA DE VÍDEO NUNCA SALE EN NEGRO, Y UN VÍDEO VERTICAL SE VE VERTICAL.
- UNA SECCIÓN QUE AÑADE NO ESCONDE LO QUE YA HAY (sep 2026, data-keep-view en
- ORDENAR LAS PESTAÑAS. Se mantiene pulsada
- ORDENAR · sin pantallas y con el gesto
- FOTOS Y VÍDEOS · SE SABE A QUÉ ACTIVIDAD SE SUBE, Y LAS FECHAS EN FORMATO DE AQUÍ.
- LA BARRA DE FORMATO NO PUEDE TAPAR EL ASA DE ARRASTRAR (bug real con captura, sep 2026)
- LA FOTO DE UN SELECT2 SE SALÍA DEL RECUADRO (bug real con captura, sep 2026): la caja de
- UN BLOQUE DE DIRECCIÓN CON CAMPOS SUELTOS AL LADO VA SIEMPRE EN PIEZAS (bug real, sep
- UN data-edit-toggle SIN VALOR SOLO ABRE EL FORMULARIO DE SU .ficha-section (bug real,
- INICIO · UN SOLO MÓDULO DE TAREAS. Inicio llegó a tener CUARENTA módulos

---

- **Menú superior (`_build_nav_menu`)**: el agrupamiento del menú es INDEPENDIENTE del árbol de
  permisos. **Personal** y **Terceros** se muestran dentro del desplegable «Bases de datos» aunque
  sus recursos sigan siendo las SECCIONES `personal` / `third_parties` (no `databases.*`).
  ⚠️ No renombrar esas claves para «colocarlas» en el árbol: `_sync_access_resources` poda los
  huérfanos **en cascada** y se llevaría por delante todos los permisos ya concedidos.
- **Iconos de sección**: dict `SECTION_ICONS` en `app.py`, inyectado al contexto; usado en el menú
  (`layout.html`) y en permisos.
- **Select2 con logos**: `initSelect2()` (scripts.js) pinta la imagen de cada opción desde
  `data-photo`/`data-logo`. El `<select>` debe llevar una clase: `select-providers` (terceros),
  `select-venues` (recintos), `select-with-thumbs` (ticketeras/editoriales, miniatura cuadrada),
  `select-artists` (artistas), **`select-people`** (personal de la oficina, foto redonda).
  ⚠️ **UNA PERSONA SE ELIGE POR SU CARA**: donde se elige a alguien, las opciones van con foto —da
  igual que sea de la casa o un tercero—, y **sin foto, el muñequito gris** (`DEFAULT_AVATAR_URL`),
  no el icono suelto de Font Awesome. Aplicado en el selector de **quién va con el artista** (la
  ficha de una actividad y la de una promoción), donde el personal iba sin foto. Campos de logo: promoter/ticketer/publishing → `logo_url`;
  venue/artist → `photo_url`.
- **Loader global**: `#globalLoader` en `layout.html`; aparece al navegar, enviar formularios o en
  `fetch` >300 ms. Excluir con clase/atributo `no-loader`/`data-no-loader`.
- **MÓVIL · lo que no cabe SE DESPLAZA, no se estruja** (ago 2026). El navegador estrechaba las
  columnas hasta partir las palabras letra a letra. Red de seguridad al final de `styles.css`
  (`@media (max-width: 767.98px)`): las **pestañas** (`.nav` que no sea vertical ni la del navbar) se
  deslizan en horizontal con `nowrap` · las **tablas** llevan scroll —las que no traen
  `.table-responsive` de la plantilla las envuelve `scripts.js` en un `[data-table-scroll]`, también
  las que llegan por AJAX (MutationObserver)— con `min-width` de 34rem y celdas de 4,5rem mínimo ·
  las **fichas de material** y las **celdas con foto + nombre** envuelven (`flex-wrap: wrap`) en vez
  de dejar el texto en una columna de 6 px · los **códigos** (ISRC…) no se parten (`.text-nowrap`).
  ⚠️ Comprobado con un detector propio a 375 px sobre ~90 pantallas (listados, fichas, pestañas y
  páginas públicas): **cero casos**. Si se toca el layout, ese detector es la forma de comprobarlo:
  busca elementos de menos de 60 px con 3+ líneas y ≤4 caracteres por línea.

- **MÓVIL · lo que se salía de la pantalla en INICIO** (ago 2026, sobre la red de seguridad de
  arriba). Tres cosas, y las tres tenían la misma raíz: **algo que no puede encogerse**.
  ⚠️⚠️ **UN HIJO DE `d-grid` (o de un flex) NO SE ENCOGE POR DEBAJO DE SU CONTENIDO**: por defecto
  tiene `min-width:auto`, así que una fila con un texto largo (el concepto de un gasto de Cabify)
  **estira la tarjeta y se sale de la pantalla** — y de paso el `text-truncate` de dentro deja de
  recortar, porque necesita que su contenedor pueda encogerse. Regla nueva: `.d-grid > a`,
  `> .list-group-item` y `> .border` con `min-width:0`.
  ⚠️ Se acotó a esos hijos a propósito: puesta a **todos** los hijos de cualquier `d-flex` dentro de
  una tarjeta, los botones de accesos rápidos se estrujaban y partían las palabras
  («Cuadrante/s»). Una regla de encogido de más rompe tanto como una de menos.
  ⚠️ **`.ctask__head` no envolvía**: el `ms-auto` empujaba el botón **ENCIMA del texto** («Cerrar mi
  parte» sobre «Proyecto discográfico»). En móvil envuelve y el botón baja a su línea, a todo el
  ancho (como ya hacía `.mytask__row .btn`). Vale para todos los módulos que usan `.ctask`.
  ⚠️ Los **rótulos de los accesos rápidos** no se parten a la mitad: el `overflow-wrap:anywhere` de
  la red de seguridad sirve para que una URL no desborde, pero en un botón de una palabra es
  ilegible. En móvil, `break-word` y más ancho para el texto (icono y hueco más pequeños).
  ⚠️⚠️ **Con `table-layout: fixed` el `min-width` de una CELDA NO SE RESPETA** (las columnas se
  reparten el ancho de la tabla): en el repertorio el título salía en una columna de **14 px**, una
  letra por línea, pese al `min-width: 4.5rem` de la red de seguridad. En móvil, las tablas que ya
  llevan su scroll pasan a `table-layout: auto`; en escritorio siguen con `fixed`, que es donde sus
  columnas tienen que cuadrar entre bloques.
  · Comprobado a 375 px en diez pantallas: **cero desbordes** (`body.scrollWidth` = 375) y cero
  textos partidos letra a letra; y a 1280 px, que las tablas conservan su `fixed`.

- ⚠️⚠️ **EL BOTÓN DE VOLVER NUNCA LLEVA A UN FORMULARIO** (sep 2026). Al crear algo, la pantalla
  anterior del historial suele ser **el paso de crearlo** (una playlist recién creada deja detrás su
  `?edit=1`), así que la flecha de volver te devolvía a rellenar el nombre y **daba la sensación de
  que no se había creado nada**. El «volver inteligente» de `scripts.js` mira ahora si lo de atrás es
  un formulario (punto único **`esFormulario(url)`**: los parámetros `edit`, `open_wizard`, `open`,
  `configurar`, `ordenar`, `map_edit`, `crear`, `nuevo`, `wizard` **puestos**, o una ruta
  `/nuevo|/crear|/editar|/alta|/wizard`) y, si lo es, **sigue el `href`** — que es la pantalla padre:
  el LISTADO.
  ⚠️ Solo cuenta si el parámetro está PUESTO: un `?edit=0` no es un formulario.
  · Y para que tampoco falle el botón de atrás **DEL NAVEGADOR** (que no controlamos), el enlace que
  SALE de un paso de formulario se marca con **`data-replace-history`** (hoy, «Ver la playlist»):
  usa `location.replace`, así esa entrada no se queda en el historial.
  Probado en el navegador: crear una playlist → «Ver la playlist» → Volver **lleva al listado**.
  · ⚠️⚠️ **Y AL GUARDAR SE PASA A VER LO GUARDADO**: el «Guardar» del editor de una playlist se
  quedaba en la MISMA pantalla de edición (guarda por AJAX y solo cambia el rótulo a «Guardada»), y
  eso hace pensar que la playlist no se ha creado. Ahora, en cuanto el servidor confirma, se navega a
  su vista (`data-view-url` del contenedor `[data-playlist-edit]`) con **`location.replace`** —el
  mismo criterio que `data-replace-history`—, así el paso de edición **no se queda en el historial**.
  ⚠️ Si el guardado FALLA no se navega: se avisa con el motivo y el botón se vuelve a habilitar.

- ⚠️⚠️ **UN `</div>` DE MÁS CIERRA EL CONTENEDOR ANTES DE TIEMPO** (bug real, ago 2026):
  `_concert_wizard_modal.html` tenía **un cierre sobrante** al final del paso de cartelería, así que
  el navegador cerraba ahí el `modal-body` —los pasos 8 a 11 se quedaban **fuera del cuerpo del
  modal** (dentro del `<form>`, así que sí se enviaban, pero sin su maqueta ni su scroll)— y, en
  Inicio, cerraba también el envoltorio de los módulos, con lo que «Ordenar mi inicio» solo veía los
  dos primeros. No da ningún error: el navegador lo «arregla» a su manera.
  ⚠️⚠️ **LA COMPROBACIÓN ES `python3 tools/check_divs.py`** (sep 2026), que en la misma pasada mira
  también que **ninguna pantalla dé un 500** —para quien la abre, eso es la página de «cerrado por
  mantenimiento»—. Así salió que el **PDF del informe de ventas** reventaba en cualquier actividad
  **sin recinto** (`c.venue` es None desde que el recinto dejó de ser obligatorio), y de paso su
  lugar pasa a escribirse con el formato único de la casa (`_place_label`). Pinta las pantallas con la
  app real (como dirección) y mira el **HTML SERVIDO**, que es lo que ve el navegador, diciendo
  **qué `</div>` sobra y en qué línea**. Contar `<div`/`</div>` en la PLANTILLA da falsos positivos
  —es legítimo abrir un div en una rama `{% if %}` y cerrarlo en otra— y por eso se nos escapaban:
  hoy pasa por **362 pantallas** (sigue los enlaces `?tab=`/`?section=` que cada una pinta, que es
  donde estaban los dos últimos) y **tiene que estar en cero**.
  ⚠️ Ignora lo que hay dentro de un `<script>` o un `<style>`: ahí un `html += '</div>'` es TEXTO.
  · Así salieron (sep 2026) dos `</div>` huérfanos en la ficha de una actividad: uno tras el
  formulario de **cachés**, que cerraba **`#concert-general-zone`** antes de tiempo —todo lo que
  viene debajo (entradas, comisionistas, equipamiento, contratos y notas) quedaba FUERA de la zona,
  así que **al guardar una sección por AJAX no se refrescaba**—, y otro al final de la pestaña
  **Producción**, que cerraba su contenedor de pestañas.

- ⚠️ **EL LECTOR DE CODEPOINTS TIENE QUE ENTENDER LOS ALIAS AGRUPADOS**: Font Awesome escribe
  `.fa-bolt:before,.fa-zap:before{content:"\f0e7"}`, y leyendo solo selectores sueltos se perdían
  **592 iconos** (2426 en vez de 1834) — su PNG salía VACÍO en los correos.

- - ⚠️⚠️ **LA VERSIÓN DE LOS ESTÁTICOS ES LA FECHA DEL FICHERO, NO LA HORA DE ARRANQUE** (bug real
  con captura, ago 2026). `ASSET_V` era `int(time.time())` al arrancar, y **cada worker de gunicorn
  arranca en un instante distinto**: la misma página servía `styles.css?v=…` con un número u otro
  según a qué worker cayera, así que el navegador **no podía cachear el CSS y lo bajaba entero en
  cada carga**. De ahí el parpadeo de ver la página **SIN ESTILOS** un segundo (y que todo tardara
  más). Ahora `_asset_version()` es la **fecha del CSS/JS más reciente**: igual en todos los workers
  y solo cambia cuando el fichero cambia de verdad, que es justo lo que rompe la caché al desplegar.

- ⚠️ **LAS FLECHAS DE ANTERIOR / SIGUIENTE NO SE PIERDEN AL GUARDAR** (ago 2026): al guardar un
  dato de la ficha, el endpoint redirige a ella **sin el `?nav=…`**, así que `_ficha_nav_args`
  se quedaba sin listado y las flechas desaparecían. Ahora el listado **se recuerda en la sesión**
  (`session['ficha_nav']`): si la URL no lo trae, se usa el último por el que se entró. No inventa
  nada, porque `_ficha_nav` solo pinta flechas si la ficha está EN ese listado.

- ⚠️⚠️ **LOS LOGOS DE PLATAFORMA SE PINTAN CON EL ICONO DE MARCA, NO CON LOS PNG SUELTOS** (ago
  2026). Punto único **`PLATFORM_META`** (clave · etiqueta · columna del enlace · icono `fa-brands` ·
  color de la plataforma), inyectado también a las plantillas. Cada PNG de
  `static/img/platforms/` traía su propio margen y los cinco se veían de tamaños distintos; con el
  icono miden lo mismo en la ficha, en el PDF, en el enlace y en el correo, y **todos llevan a
  reproducir** (en el PDF con `_LinkedRLImage`).
  ⚠️ **Solo se enseña lo que está configurado**; en la FICHA, los que faltan se siguen viendo en gris
  —solo a quien puede editarlos— porque ese icono es el que abre el modal para añadir el enlace.
  ⚠️⚠️ **`brand_icon_png` dibujaba SIEMPRE con la familia SOLID**, donde un icono de marca no existe:
  salía un PNG **vacío**. Ahora `_fa_icon_png(..., familia='brands')` usa `fa-brands-400.ttf`, el
  endpoint acepta **`?f=brands`** y la caché (memoria y disco) lleva la familia en la clave.
  ⚠️⚠️ **Y el enlace de una imagen en un PDF va con `relative=1`**: `drawOn` recibe la x/y del sitio
  donde se dibuja (dentro de una tabla, de un frame o de un KeepInFrame que encoge), no de la página.
  Con `relative=0` los cinco enlaces se apilaban en la **esquina inferior izquierda** y no se podía
  pinchar ningún icono (bug real, comprobado leyendo las anotaciones del PDF).

- ⚠️ **EL NOMBRE DE UN ARCHIVO QUE SE DESCARGA TRANSLITERA LAS TILDES Y LA Ñ**
  (`_safe_download_filename`): descartaba a secas todo lo que no fuera ASCII, así que «Los Ñus» se
  quedaba en «Los us» — y ese nombre se ve en el adjunto de un correo. Ahora normaliza (Ñ→N, á→a)
  antes de filtrar.

- **Cambios de estado in-place** (`static/js/ajax_inline.js`): un
  `<form method="post" data-inline data-inline-target="#zonaId">` se envía por fetch (el endpoint NO
  cambia: sigue POST+redirect), se sigue el redirect y se **reemplaza solo la zona** `#zonaId`
  (un elemento con `id` + `data-inline-zone` que contiene el form y el badge que cambia), sin recargar
  ni mover el scroll; si no localiza la zona, hace recarga normal (fallback seguro). NO usarlo en
  borrados ni acciones que navegan a otra página. Ya AJAX nativo aparte: `concert_quick_status`,
  `setRoyaltyLiquidationStatus`.
  ⚠️ Para PREGUNTAR usa **`data-confirm`** (lo soporta el propio motor), **no**
  `onsubmit="return confirm(...)"`: el evento `submit` sigue burbujeando aunque el `onsubmit` lo
  cancele, así que decir «no» enviaba el formulario igual por fetch. El motor ahora también respeta
  `defaultPrevented` (una validación propia que cancele el envío ya no se manda).
  ⚠️ La zona **no puede ser un `tab-pane`**: al reemplazarlo llega una copia del HTML servido, donde
  esa pestaña no es la activa, y el contenido desaparece. La zona va SIEMPRE dentro del pane.
  ⚠️ `showFlashes` borra y reinserta arriba del `<main>` **todos los `.alert` que son hijos directos**
  de `main`: un aviso fijo al final de la página tiene que ir envuelto en otro `div`, o salta al
  principio en cada acción.
- ⚠️⚠️ **«Maximum call stack size exceeded» en INICIO** (bug real, ago 2026): `updateSellerCards` del
  asistente de actividad devolvía el vendedor a «Nosotros» cuando la tarjeta marcada estaba oculta,
  pero lo miraba con **`closest('.d-none')`** — y el PASO del asistente está oculto mientras no toca,
  así que SIEMPRE daba «oculta»: marcaba «Nosotros», su `change` volvía a llamar a la función… y el
  navegador petaba, **dejando sin arrancar el resto del JS de la página** (se veía en la consola de
  Inicio, donde el asistente va embebido). Ahora se mira **solo la tarjeta del vendedor**
  (`.wz-seller-card`, que llevan las cuatro) y hay un cerrojo de re-entrada. Al tocar el asistente,
  mirar la consola del navegador: un error así no se nota en la pantalla pero rompe todo lo demás.
- **Flecha de VOLVER (toda la app)**: la flecha gris de arriba a la izquierda (`.btn-volver`) y
  cualquier enlace cuyo texto, `title` o `aria-label` empiece por «Volver»/«Atrás» llevan **a la
  página de la que venías**, no a un destino fijo: el bloque «volver inteligente» de `scripts.js`
  hace `history.back()` cuando el `document.referrer` es de la propia app **y distinto de la página
  actual** (tras un POST+redirect el referrer es la propia ficha, y ahí retroceder no serviría).
  Si no hay de dónde volver (enlace directo, pestaña nueva) se sigue el `href`, que es el destino
  «padre» de esa pantalla. Opt-out: `data-no-smart-back`. Cmd/Ctrl/⇧/clic central no lo interceptan.

- ⚠️⚠️ **`shown.bs.modal` NO ES FIABLE en esta app** (ago 2026, bug real): con `modal_stack.js` por
  medio llega `show.bs.modal` pero **nunca `shown`**, así que cualquier cosa que se construya en ese
  evento no se construye. Pasó con los calendarios de los modales de vacaciones: el modal se abría
  **vacío** y «apuntar días» no guardaba nada porque no había día que marcar. **Lo que haya que
  montar al abrir un modal se monta EN EL PROPIO CLIC** (o, como mucho, en `show.bs.modal`).
  ⚠️ En el mismo arreglo: el gesto del calendario resuelve el día con **`ev.target`** al empezar y
  deja `elementFromPoint` de respaldo — dentro de un modal con scroll, una celda fuera del viewport
  hacía que `elementFromPoint` no devolviera nada y el clic se perdía. Al ARRASTRAR es al revés
  (con captura de puntero `ev.target` se queda en la celda de origen).

- ⚠️⚠️ **`form.action` NO ES LA URL si el formulario tiene un campo llamado «action»** (bug real,
  ago 2026). El DOM expone los controles con nombre como propiedades del formulario, así que
  `<input name="action">` o `<button name="action">` **tapan** `form.action` y esa propiedad
  devuelve EL CAMPO. `ajax_inline.js` la usaba para el fetch → salía a `/[object HTMLInputElement]`
  → 404 → no encontraba la zona → **recargaba la página entera**. Efecto visible: *cualquier* acción
  de **Integraciones** (Pleo, Cabify, Holded, Chartmetric, Enterticket — todas usan `name="action"`)
  te devolvía al principio de la página. Arreglado leyendo el **ATRIBUTO**
  (`form.getAttribute('action')`). Al montar un formulario con un campo «action», ojo con esto.
  ⚠️ Y **dos botones con `name="action"` en el MISMO formulario se pisan**: hay que separarlos en
  formularios distintos (probar la clave de Chartmetric acababa guardándola vacía).

- ⚠️⚠️ **`|forceescape` DENTRO DE UN `<script>` ROMPE EL JS** (bug real, ago 2026). En un `<script>`
  el navegador **NO decodifica las entidades HTML**, así que `{{ x|tojson|forceescape }}` llega
  literalmente como `[&#34;Rock&#34;]`, el bloque entero es **sintaxis inválida y no se ejecuta**.
  Efecto: **los géneros de una canción no se cargaban ni se podían añadir** (ni con Enter ni con el
  «+»), sin ningún error visible. Dentro de un `<script>` va **`|tojson` a secas**; `forceescape` es
  para los ATRIBUTOS (`onclick="…"`, `data-x="…"`), donde la comilla doble sí cortaría el atributo.
  Comprobación: `forceescape` dentro de `<script>` tiene que salir **vacío** (detector en el
  histórico de esta épica; los ~40 usos restantes son todos de atributo, que es lo correcto).

- ⚠️ **UN ICONO DENTRO DE UNA ETIQUETA VA EN EL COLOR DE LA ETIQUETA** (bug real, ago 2026): la
  cabecera de una ficha pinta de azul todos los iconos de su línea de datos (`.ficha-hero__facts i`),
  así que el de **One-Stop salía AZUL SOBRE EL FONDO AZUL** de la propia etiqueta —estaba ahí, con su
  hueco, pero era invisible—. `.badge-onestop i` fuerza `color:inherit` (y anula el ancho y el margen
  que esa regla le pone). Al meter un badge con icono dentro de la cabecera, comprobarlo.

- ⚠️ **EL SUBRAYADO DE UNA FILA VA SOBRE EL TEXTO, NO SOBRE LA LÍNEA** (bug real, ago 2026):
  `.pl-row__title` es el CONTENEDOR del título **y sus etiquetas** (One-Stop, géneros), así que un
  `text-decoration` ahí pintaba una raya que las cruzaba todas —y en la fila que está sonando, en
  **ROJO**—. Se acota a `> a` / `> span:first-child`, y la fila que suena se distingue solo por el
  color.

- ⚠️⚠️ **UN `<script>` DENTRO DE UNA ZONA `data-inline-zone` NO SE VUELVE A EJECUTAR** (bug real y
  de PÉRDIDA DE DATOS, ago 2026). `ajax_inline.js` guarda una sección reemplazando la zona entera
  (`DOMParser` + `zone.replaceWith(fresh)`), y un `<script>` que sale de `DOMParser` nace *already
  started*: **al adoptarlo no se ejecuta**, y los listeners pegados a los nodos viejos mueren con
  ellos. Sin ningún error en la consola.
  · Pasó con los **GÉNEROS de una canción**: el gestor se cableaba en un `<script>` dentro de
  `#song-info-zone`, así que **tras el primer guardado dejaba de funcionar todo** (ni el clic, ni
  Enter, ni el «+»), y —lo grave— como los ocultos los pintaba el JS, `#songGenreHidden` llegaba
  **vacío** al segundo guardado: con el centinela `song_genres_present` puesto, `_apply_song_genres`
  **borraba TODOS los géneros de la canción**. Verificado: cuatro géneros → ninguno.
  · **Las dos reglas que lo evitan**, y que valen para cualquier cosa que se edite inline:
    1. **El ESTADO lo pinta el SERVIDOR**, no el JavaScript: cada etiqueta lleva DENTRO su propio
       `<input type="hidden">`. Si el JS no arranca, se ve y se envía igual — y no se pierde nada.
    2. **El cableado va en un JS GLOBAL y por DELEGACIÓN en `document`** (`static/js/song_genres.js`,
       cargado en `layout.html`): da igual cuántas veces se repinte la zona. Los conciertos ya lo
       hacían así (su init vive fuera y se re-engancha con `ficha:shown`).
  · Detector: buscar `<script>` (que no sea `type="application/json"`) dentro de un elemento con
  `data-inline-zone` que sea destino de un `data-inline-target`. Hoy **no queda ninguno**: el de
  `integraciones.html` es delegación en `document`, que sobrevive al reemplazo.

- ⚠️⚠️ **UN `<datalist>` NATIVO NO SIRVE PARA «AL ELEGIR, HACER ALGO»** (ago 2026): al pinchar una
  de sus opciones cada navegador dispara unos eventos distintos (y a veces ninguno reconocible), así
  que elegir un género **«no hacía nada»**. Donde haga falta reaccionar a la elección se usa la lista
  propia de la casa (`.ta-results`), que es DOM normal y pinchar es un clic de verdad. El datalist
  se queda solo para sugerir texto que el usuario confirma con Enter.

- ⚠️ **EL BOTÓN «TODOS» DE UN FILTRO TAMBIÉN ALTERNA** (`refreshGroupButtons`, ago 2026): se quedaba
  siempre `btn-dark`, así que al elegir un artista quedaban **DOS botones oscuros** y parecía que los
  dos estaban puestos. Ahora solo el elegido va oscuro. Vale para los cuatro filtros del repertorio
  (canciones, álbumes, editorial, colaboraciones) y para el del reporte de ventas.

- ⚠️ **UN FILTRO DE SELECCIÓN ÚNICA NO PUEDE PERDERSE EN UNA RECARGA** (ago 2026): el reporte de
  ventas tiene un vigía que pregunta por las ventas de Enterticket cada 5 s y hace `location.reload()`
  cuando llega un sync. Con el filtro antiguo (todos los artistas activos) la recarga devolvía el
  mismo conjunto y nadie se enteraba; **con selección única te llevaba de vuelta a «Todos» en medio
  del trabajo**. `safeReload()` aplaza ya la recarga si hay un modal abierto, y ahora también si hay
  **artista, tipo, estado o búsqueda** puestos.
  ⚠️ El vigía solo se pinta con eventos de Enterticket vinculados (`{% if et_stamp is defined and
  et_map %}`), así que en una BD sin ellos ese bloque no existe.

- **MENÚ «más secciones» (⋯) · una SECCIÓN CON SUBSECCIONES se abre al pincharla** (ago 2026): lo
  que no cabe en el menú superior se vuelca en el desplegable de las barras, y ahí una sección con
  hijos —Bases de datos, Contratación, Ventas, Radio, Invitaciones— se volcaba **desplegada** (una
  cabecera y todas sus opciones), así que el menú se llenaba de pestañas y no se veían las
  secciones que faltaban. Ahora cada sección es **UNA línea** con su icono y un chevron, y sus
  opciones salen al pincharla (`addCloneForItem` en `initUsageOrderedOverflowNav`, clases
  `.nav-ovf-group` / `.nav-ovf-toggle` / `.nav-ovf-sub`).
  ⚠️ El clic del plegable necesita **`stopPropagation`**: sin él llega al data-api de Bootstrap y
  **cierra el desplegable entero** (todos se crean con `autoClose: true`), así que el submenú no
  llegaría a verse. Va por DELEGACIÓN sobre el propio `menu` (sus líneas se crean y se tiran en
  cada recálculo, y el gestor global lo teleporta al `<body>` al abrirlo).
  ⚠️ Al cerrarse el desplegable se pliega todo, para que la próxima vez se abra limpio.
  ⚠️ De paso: **«Playlisting» salía DOS veces** en el menú (un `<li>` fijo en `layout.html` además
  del que ya trae `NAV_MENU` con su propio permiso). El fijo se retiró.

- ⚠️⚠️ **UN VÍDEO SUBIDO SE REPRODUCE POR SU VERSIÓN WEB, NO POR EL ORIGINAL** (sep 2026, bug real:
  «los vídeos subidos se van viendo a tirones y se cortan»). Dentro de la app el `<video>` ya apuntaba
  directo a Storage (sin puente ni `no-store`), y aun así iba a tirones: el archivo que sube la gente
  es el de la cámara o la productora —4K, 50-100 Mbps, a veces HEVC del iPhone (que medio navegador no
  pinta) y casi siempre con el índice `moov` **al final**, así que el navegador no puede empezar ni
  saltar sin bajarse medio archivo—. Ninguna conexión normal lo aguanta en directo.
  · **La solución es la de cualquier plataforma de vídeo**: una copia PARA VER (H.264 perfil high +
  AAC, ≤1080p conservando la proporción, `-maxrate 6M`, `yuv420p`, `+faststart`) que hace ffmpeg
  **en 2º plano** (`_video_web_build`, el binario de imageio-ffmpeg, que trae libx264) y se sube a
  Storage (`video_web/<uuid>.mp4`, con `upload_local_file` por RUTA: la copia puede pesar cientos de MB
  y a `bytes` iría a la RAM del worker). **El original se conserva** y es lo que se DESCARGA.
  · **Se guarda POR URL DE ORIGEN** en **`VideoWebVersion`** (`video_web_versions`, `ensure_video_web_schema`;
  `status` PENDING · READY · **SKIP** —el original ya era apto y se sirve tal cual— · FAILED con su
  `error` y `attempts`), no como columna de cada modelo: así vale igual para una foto de actividad,
  un cartel, un videoclip, un material de marketing o un adjunto de una nota de prensa.
  · **Puntos únicos**: **`_video_web_url(url)`** (la copia si está lista; si no, el original y se
  ENCARGA), `_video_web_map`/`_video_web_prefetch` (en BLOQUE, con caché en `g`: una galería no puede
  hacer una consulta por vídeo) y el global de plantilla **`video_play_url(url)`**. Enganchado en:
  `_artwork_media.html` (el `<video>` y el `data-viewer-src`), `public_artwork_file?play=1`, el
  videoclip de la ficha de canción, `_photo_payload` (`play_url`, que leen `fotos.js` y las páginas
  públicas de fotos), `_marketing_file_row` (`play_url`), `_press_file_payload` y `public_press_video`.
  · **Se encarga al SUBIR** —desde los cuatro programadores de miniaturas (`_video_poster_schedule`,
  `_artwork_poster_schedule`, `_song_video_poster_schedule`, `_marketing_poster_schedule`), que es por
  donde pasa todo vídeo nuevo— **y al PINTAR** (red de seguridad: lo subido antes de que esto
  existiera se convierte la primera vez que alguien lo mira; mientras, se ve el original).
  ⚠️ **Solo lo NUESTRO** (`_is_own_media_url`): un vídeo de fuera no se toca.
  ⚠️ **Es CARO (CPU)**: UNO a la vez (`_VIDEO_WEB_SEM`), `-preset veryfast`, dos hilos, `nice -n 15`
  y tope de 50 min; un fallo se apunta y no se reintenta hasta pasadas 6 h (máximo 3 veces). Un
  PENDING con más de 50 min (un hilo muerto en un despliegue) se vuelve a coger.
  ⚠️ **Lo que ya es apto NO se recodifica** (`_video_web_needs_encoding`: h264 + aac, ≤1080, ≤6 Mbps,
  `.mp4` y **`moov` delante**, que se comprueba leyendo los primeros 256 KB por rango y recorriendo los
  átomos). Comprobar cuesta una cabecera; recodificar, minutos.
  Probado con la app real: un mp4 de 6,6 Mbps con el `moov` al final → copia h264 de 2,4 Mbps con
  `ftyp · moov · free · mdat`, fila READY y `_video_web_url` devolviendo la copia; un `.jpg` pasa
  tal cual.

- ⚠️⚠️ **AL ENTRAR EN UNA FICHA SE ABRE **SU** PRIMERA PESTAÑA, y las SUBPESTAÑAS también se ordenan**
  (sep 2026). Quien se ha colocado las pestañas (manteniendo pulsada una, `UserProfile.ui_order`)
  espera que al entrar se le abra **la primera de SU orden**, no la de por defecto de la casa.
  · **Lo decide el SERVIDOR**: punto único **`_tab_arg(default, valid=None)`** (+ `_ui_first_tab` /
  `_ui_order_map`), que sustituye a los `request.args.get("tab") or "…"` de las **27** vistas de
  ficha y de sección. Lo que se PIDE en la URL sigue mandando; sin `?tab=` manda su orden y, si no
  tiene, la de siempre.
  ⚠️⚠️ Antes lo intentaba **solo el navegador** (`abreLaSuya` en `sortable_tabs.js`), que tenía que
  **NAVEGAR otra vez** y, con su cerrojo contra bucles (`sessionStorage`), lo hacía **UNA sola vez
  por pantalla y sesión**: a la segunda visita volvía a salir la pestaña de siempre. Eso queda como
  **red de seguridad** para las barras que el servidor no resuelve (las que van con otro parámetro,
  `?subtab=`, `?liq_tab=`…). Comprobado en el navegador: **una sola carga** (`navs: 1`) y la URL
  limpia.
  ⚠️ La clave del grupo la compone el JS (`tabs:<endpoint>:<clase>:<índice>`) y cada pestaña se
  identifica por lo que la distingue en su enlace (`tab=contactos`), así que el servidor solo lee el
  `tab=` de la PRIMERA. **Si esa pestaña ya no existe, manda la de siempre** (y si no se puede
  resolver —una que se abre sin recargar, con `data-bs-target`— no se salta a la siguiente: abriría
  una que no es la suya).
  ⚠️ Donde cada pestaña tiene **su propio permiso** (la ficha de PERSONAL, CONTABILIDAD) se le pasa
  **`valid=visibles`**: su pestaña no puede saltarse un permiso, y si no la puede ver se cae a la
  primera que sí (que es lo que ya hacían esas dos vistas).
  · **Las SUBPESTAÑAS también se ordenan manteniendo pulsado**: `ul.nav-pills` entra en los
  `SELECTORES` de `sortable_tabs.js` (las de un proyecto, las de Administración → Pendiente, las de
  cada empresa en Integraciones…). Opt-out `data-no-sort` (lo lleva el selector de imagen del editor
  de notas de prensa, que es un picker de un pop-up).
  ⚠️ Al añadir una clase de barra hay que añadirla en los DOS sitios: `SELECTORES` **y** la lista de
  `claveDe` (si no, la clave sale como `nav` y el orden se guarda en otro cajón), y en
  **`UI_TAB_GROUPS`** de `app.py`.

- ⚠️⚠️ **UN BOTÓN «COPIAR ENLACE» DENTRO DE UNA ZONA INLINE SE QUEDABA MUERTO** (sep 2026):
  `initCopyLinkButtons` enganchaba con `querySelectorAll` **al cargar la página**, así que un
  `.copy-link-btn` que viviera en una zona `data-inline-zone` (la ficha de una actividad, la de una
  canción…) dejaba de funcionar en cuanto se guardaba una sección y esa zona se reemplazaba por
  AJAX — el clic no hacía nada y sin ningún error. Ahora va por **DELEGACIÓN en `document`** (la
  regla de la casa), así que da igual cuántas veces se repinte. Comprobado en el navegador
  reemplazando `#concert-general-zone` a mano: el botón sigue copiando.

- ⚠️⚠️ **TODOS LOS ASISTENTES Y LAS ALTAS SE VEN IGUAL: la cabecera de «Datos de la entrada»** (sep
  2026, lo pidió Dani). **Cabecera ROJA** (`.modal-header.sw-head`) con el **título y su icono** a la
  izquierda, **un icono por paso** en el centro (`<ol class="sw-head__steps" data-sw-steps>`: pastilla
  blanca la activa, las hechas más encendidas y **se pinchan para volver**), la ✕ blanca a la derecha;
  debajo las **pastillas de progreso** (`.sw-progress`), cada paso con su **pregunta grande**
  (`.sw-step__q`, icono en el rojo de la casa) y su ayuda (`.sw-step__h`); el **pie** es «Atrás»
  (`btn-link px-0 me-auto`) · «Siguiente» (`btn-outline-secondary`) · el botón que guarda (`btn-danger`
  con `fa-check`); y el modal va **`modal-xl modal-dialog-scrollable`**.
  · **LA CABECERA LA PINTA `step_wizard.js`** en los asistentes del motor (`[data-step-wizard]`), a
  partir de los `.sw-step` QUE TOCAN (`data-title` y el icono de su `.sw-step__q`; se fijan con
  `data-sw-head` / `data-sw-icon`): un paso que no aplica (`data-sw-when`) no sale. Un asistente con
  **motor propio** (actividad, petición, invitaciones, medios, simulaciones, canción, prensa, las
  importaciones, el «+» del calendario) la pinta con el **pintor común `window.app33WizHead`**
  (`paint(ol, items, activo, alVolver)` · `pills(caja, total, activo)` · `fromSteps(ol, pasos, activo)`)
  desde su propia función de paso.
  ⚠️⚠️ **`step_wizard.js` se carga en el `<head>` del layout A PROPÓSITO**: esos asistentes pintan
  desde su script EN LÍNEA, que corre al parsear la página, antes que cualquier script del final del
  `<body>` — con el motor al final, la cabecera salía vacía la primera vez (bug real de esta épica). Y
  el asistente de petición pinta también en `show.bs.modal`: se abra como se abra, la cabecera está.
  Cada asistente sigue cargando el motor también (las páginas públicas no pasan por el layout).
  ⚠️ Un icono dentro de la cabecera va SIN `text-danger` (rojo sobre rojo: desaparece); el CSS lo
  fuerza a blanco. Y si el JS cambia el TÍTULO (`textContent`), el texto va en un `<span>` con el id
  o el `data-*-title` y el icono fuera de él, o se borraría al cambiarlo.
  · **Una ventana de alta de UNA pantalla** («Nuevo artista», «Añadir cuenta», «Subir carteles»…)
  lleva solo `sw-head` en su `.modal-header` y su icono: mismo color, sin pasos. **Al crear un
  modal de alta nuevo, esa es la cabecera**; y un asistente nuevo, el patrón entero.
  · **EL ROJO DE LOS BOTONES ES UNO**: `.btn-danger` y `.btn-outline-danger` van ya en el rojo de la
  casa (`--brand-primary`), como `.btn-primary`; antes convivían dos rojos (#dc3545 y #E33D48).
  · Comprobado con la app real en el navegador: la referencia, actividad (13 pasos, secuencia
  dinámica), petición, proyecto, invitaciones (pedir y enlace), gira, simulación, medio, canción,
  compradores, categoría de invitaciones, calendario y las altas sencillas; `check_divs` (814
  pantallas) y `check_botones` en cero.

- ⚠️ **PARA VER LA APP EN EL NAVEGADOR EN LOCAL**: `.claude/launch.json` → **`tools/dev_server.py`**,
  que arranca Flask en el **5099** contra la **BD DE PRUEBA** (nunca la real), pone los CERROJOS del
  tempdir antes de importar (si no, el bootstrap del esquema tarda >10 min), desactiva el CSRF y
  activa el **auto-reload de plantillas** (sin eso, Jinja las cachea y hay que reiniciar en cada
  cambio de HTML). Se abre con `preview_start` por su nombre.

- ⚠️ **`static/maintenance.html` es HTML PURO** (no pasa por Jinja): un comentario `{# … #}` se
  vería en pantalla — usar `<!-- … -->`. Tiene botón **Volver** (`history.back()` con fallback a `/`)
  junto a «Reintentar ahora», para cuando solo falla una sección.
- ⚠️⚠️ **UNA FOTO O UN LOGO QUE FALTA NO SE RELLENA CON LA MARCA DE LA CASA** (sep 2026, barrido
  completo). El respaldo `X or url_for('static', filename='img/logo.png')` estaba en **~120 sitios**:
  un artista, un tercero, un medio, una emisora, un banco, una ticketera o una empresa del grupo sin
  logo salían con el logo de PIES, que es justo lo que confunde (parece que la fila es nuestra).
  · **PERSONA, ARTISTA, TERCERO, MEDIO, EMISORA, BANCO, TICKETERA, EVENTO, RECINTO** →
  **`DEFAULT_AVATAR_URL`** (el muñequito gris: SE VE, así que el hueco no descoloca la fila) con
  `data-avatar="1"` para que el respaldo del JS caiga en lo mismo.
  · **PORTADA** → `DEFAULT_COVER_URL`. · **EMPRESA DEL GRUPO** → el helper `company_logo(...)`.
  · **Los DOS puntos únicos**: `_artist_photo_src` (de él viven `artist_avatar` y `artist_chip`, o sea
  media app) y el `fallback_photo` del PDF/correo de una liquidación de royalties.
  ⚠️ **Lo que SÍ es legítimo y no se toca**: la cabecera de marca de una página pública, de un correo
  o de un PDF, el login, la landing, la guía de CalDAV y el último escalón de una `og:image`. Hoy solo
  quedan esos.
  ⚠️ `data-default-photo="1"` NO arreglaba nada aquí: el respaldo del JS solo actúa en el evento
  `error` de la imagen, y el logo de la casa cargaba perfectamente.
- **FILTROS DE APLICACIÓN DIRECTA · fuera el botón «Ver»** (ago 2026): un formulario marcado con
  **`data-filters-auto`** se envía en cuanto se marca una casilla (handler global en `scripts.js`).
  Los filtros del **pop-up** también se aplican solos y el pop-up **se vuelve a abrir** al recargar
  (`open=filtros` → `app33AutoOpenModal`), para poder seguir marcando sin reabrirlo a mano.

- ⚠️ **UN CHIP QUE ES `<a>` SALE SUBRAYADO**: `a.filter-chip{ text-decoration:none }` (un chip no es
  un enlace de texto).

- ⚠️⚠️ **SELECT2 AVISA CON `jQuery.trigger('change')`, QUE NO DISPARA LOS LISTENERS NATIVOS** (bug
  real con captura, sep 2026). En el asistente «+ Actividad» el selector de **«¿De quién es la
  actividad?»** es un Select2 que ESPEJA lo elegido a los campos que espera el servidor
  (`wizard_artist_id` / `wizard_event_id`, ocultos), y ese espejo colgaba de un
  `sel.addEventListener('change', …)`: al elegir un artista **no se rellenaba nada** y el asistente
  decía **«Debes seleccionar un artista»** teniéndolo elegido y a la vista.
  ⚠️ `jQuery.trigger('change')` ejecuta **solo los manejadores de jQuery** (comprobado en el
  navegador: un `addEventListener` nativo no se entera). Con un Select2, el enganche tiene que ser
  **`jQuery(sel).on('change', …)`**.
  ⚠️⚠️ Y el `<script>` del parcial está **EN LÍNEA**, así que corre **ANTES que jQuery** (los scripts
  de verdad van al final del `<body>`): el `try { if (window.jQuery) … }` se saltaba **en silencio**.
  Se **REINTENTA** hasta que jQuery esté, como ya se hace con Bootstrap y con `initTypeahead`.
  ⚠️ **RED DE SEGURIDAD**: el espejo se refresca además **al validar cada paso**
  (`validateStep` llama a `syncSubjectPick()`), así que lo que se valida y lo que se envía es lo que
  de verdad está elegido aunque un día un evento no llegue.
  ⚠️ Al oculto se le cambia la selección **por código**, y eso **no dispara su `change`**: lo que
  dependía de él (las giras del artista, su repertorio y el aviso de «ese día ya tiene algo») se
  llama desde el propio espejo. El aviso de solape, **solo cuando el selector CAMBIA de verdad**
  (`syncSubjectPick(true)`): al validar un paso sacaría su `confirm` por segunda vez.
  ⚠️ Comprobado que no queda ningún otro sitio así (barrido de los 33 selects con clase de Select2:
  ninguno lleva un `addEventListener('change')` nativo).

- ⚠️⚠️ **EL BUSCADOR DE UN SELECT2 CON GRUPOS ENTRA EN LOS GRUPOS, y el «+» deja lo creado en el
  SELECTOR VISIBLE** (sep 2026, dos bugs reales del asistente «+ Actividad»: «al crear un evento nuevo
  se crea y no se queda seleccionado, y si escribes no busca en eventos»).
  · **El `matcher` de `initSelect2` (scripts.js) es PROPIO y sustituye ENTERO al de serie**, que es
  el que recorre los `children` de un `<optgroup>`. Sin esa recursión, un grupo se aceptaba o se
  tiraba DE GOLPE según casara su RÓTULO («Artistas», «Eventos»): escribir el nombre de un evento no
  lo encontraba y solo salía moviéndose por el desplegable. Ahora entra en los hijos y devuelve el
  grupo con los que casan. Vale para cualquier select con clase de Select2 que lleve grupos.
  · **El «+» y la «★» apuntaban a los `<select>` OCULTOS** que espera el servidor (`wizard_artist_id`
  / `wizard_event_id`), no al selector visible (`wizard_subject_ids`, cuyos valores llevan el prefijo
  `artist:` / `event:`): lo creado entraba en el oculto, no se veía, y al validar el paso
  `syncSubjectPick` —que manda lo VISIBLE— lo borraba. Ahora `quick_create.js` admite
  **`data-target-prefix`** (el prefijo del valor) y **`data-target-group`** (el `<optgroup>` por su
  rótulo), los botones apuntan al visible, y `syncSubjectPick` **completa los ocultos con la opción
  que falte** (si no, `.value = id` se quedaría en vacío y el servidor no recibiría nada). El
  precumplimentado desde una **petición aprobada** tenía el mismo fallo y marca ya el visible.
  ⚠️ Probado en el navegador con la app real: «ruta» encuentra el evento y «ñus» el artista; un
  evento nuevo con la ★ queda seleccionado en su grupo, espejado al oculto con su nombre,
  `subject_kind=EVENT` y el paso avanza; un artista nuevo con el «+» encima de un evento ya elegido
  conserva los dos, y el pop-up de alta se cierra solo.

- ⚠️⚠️ **UN POP-UP QUE HA CREADO O CAMBIADO ALGO RECARGA LA PANTALLA DE DETRÁS AL CERRARSE**
  (sep 2026, `static/js/refresh_on_close.js`, GLOBAL · `window.app33RefreshOnClose(modalEl, url?)`).
  Los pop-ups que trabajan por AJAX —importar compradores (listado nuevo o compradores en uno que
  había), actualizar Label Copy en bloque, mandar un envío a compradores, importar terceros— enseñaban
  su resumen y **la pantalla de detrás seguía como estaba** hasta recargar a mano: «da la sensación de
  que no se ha creado». Se llama **en cuanto el servidor confirma que ha guardado**, y al cerrarse el
  pop-up (`hidden.bs.modal` delegado en `document` + el clic en su `[data-bs-dismiss]` como red de
  seguridad, con cerrojo para no recargar dos veces) recarga la página, o va a `url` si se le pasa.
  ⚠️ Al recargar se QUITAN los parámetros que abren un pop-up al llegar (`open`, `campaign`,
  `open_wizard`, `configurar`): si no, la página volvería a abrir el que se acaba de cerrar
  (comprobado con la app real: `?open=import&foo=1` → `?foo=1`, con el pop-up cerrado).
  ⚠️ Lo que ya recargaba, navegaba o repintaba en sitio (syncros, medios, fotos, vinculaciones,
  contactos de una actividad, los formularios POST normales) no se toca: revisada toda la app, solo
  esos cuatro se quedaban desfasados.
  · Regla para un pop-up de alta por AJAX nuevo: o deja lo creado en sitio (el patrón de
  `quick_create.js`) o llama a `app33RefreshOnClose` al confirmar el guardado — nunca las dos cosas a
  medias.

- ⚠️⚠️ **VOLVER ATRÁS NO DEVUELVE UN FORMULARIO YA ENVIADO** (sep 2026, bug real: «al terminar de
  crear una actividad y darle a crear otra, el asistente se queda en la última página del anterior y
  con Atrás vas retrocediendo paso a paso por lo que ya está creado»). Son DOS mecanismos del
  navegador, y hacía falta cortar los dos:
  · **bfcache**: al volver con «Volver» (`history.back()`) el navegador puede restaurar la página
  anterior TAL CUAL —el asistente abierto en su último paso—. Global **`static/js/back_fresh.js`**:
  en `pageshow` con `persisted`, si en esa página **se envió un formulario** o hay **un pop-up
  abierto**, se **recarga** (y de paso los listados salen con lo recién creado). Una página
  restaurada sin nada de eso (una ficha, el editor de una nota con cambios) se deja como estaba.
  ⚠️ El envío se apunta un tic después mirando `defaultPrevented`: lo que para `form_check.js` o va
  por AJAX no cuenta.
  · **La restauración de formularios del historial**: SIN bfcache, al volver atrás el navegador
  repone por su cuenta lo tecleado en los campos (comprobado en Chromium: con el borrador de
  `form_autosave` ya borrado, el tipo y la fecha volvían a aparecer). Se corta con
  **`autocomplete="off"` en el `<form>`** de cada asistente de alta (el de actividad, proyecto,
  petición, promoción, marketing, playlist de valoración, giras, ciclos, agenda y los de alta rápida):
  es lo que dice la especificación para que no se restaure el estado de un formulario.
  ⚠️ Nuestro guardado en vivo (`form_autosave.js`) es otra cosa y sigue igual: lo NO enviado se
  ofrece con «Seguir con eso»; lo enviado se borra al cargar la página siguiente.
  ⚠️ Un asistente de alta NUEVO tiene que llevar `autocomplete="off"` en su `<form>`.

- ⚠️⚠️ **TODAS LAS TAREAS DE LA PESTAÑA «INICIO» SE PUEDEN HACER DESDE AHÍ** (sep 2026). Las tareas
  del DEPARTAMENTO (confirmar, contrato, anuncio, venta, producción, ticketing) se pintaban **sin
  ningún botón** —su control colgaba de `t.mine` y una tarea del departamento no es de nadie—, así
  que había que buscar dónde se hacía cada cosa, que es justo lo que este tablero viene a evitar.
  Ahora cada tarea lleva cómo se resuelve: `url` (a donde se hace), `modal` (el pop-up que se abre) o
  **`do`** (su control propio):
  · **confirmar** → el MISMO camino que la etiqueta de estado (`[data-status-menu]` +
    `data-status-option="CONFIRMADO"`, handler global), así que pasa por su compuerta y sale el
    pop-up del aviso al artista si hace falta;
  · **anuncio** → la MISMA etiqueta clicable de la cabecera (`_concert_announcement_badge.html`);
  · **venta** → el formulario de `concert_sale_activate`;
  · **contrato** → la ficha de contratación en `#contratos-actividad`;
  · **producción** → `#prodOwnerModal` · **ticketing** → `#ticketingContactModal`.
  ⚠️ Cada tarea dice qué permiso hace falta (**`perm`**: `concerts` u `onsale`): un botón que abre un
  pop-up que no se ha pintado no hace nada.
  ⚠️ Lo que **es de otra persona** (las fases de una petición) sigue siendo suyo: se ve en gris con
  su nombre y su campanita, y solo se añade un **«Ir»** sin relleno para poder entrar a verlo.

- ⚠️⚠️⚠️ **LO QUE SE ESCRIBE NO SE PIERDE · guardado en vivo de lo tecleado** (sep 2026,
  `static/js/form_autosave.js`, GLOBAL). Casi todos los endpoints guardan con **POST → `flash` →
  `redirect`**, así que cuando algo falla el navegador acaba en un GET limpio y **el formulario sale
  VACÍO**: había que teclearlo todo otra vez. En el asistente de actividad era peor, porque el
  redirect va a **OTRA pantalla y con el modal cerrado**.
  · Mientras se escribe, lo tecleado se guarda en `sessionStorage`; al **enviar se BORRA por
  defecto**; y **solo se conserva si el SERVIDOR dice que ha rechazado el envío**, y entonces se
  repone solo, **se reabre el sitio donde se estaba** y se marca en rojo lo que hay que arreglar.
  · Si queda algo sin enviar de antes, **no se pisa nada a la callada**: sale una línea ámbar
  «Tienes lo que escribiste a las 12:40 en \<qué\> sin enviar · **Seguir con eso** / **Empezar de
  cero**». Recuperar es un ACTO, no algo que ya ha pasado cuando llegas.
  ⚠️⚠️ **NO SE MIRA EL COLOR DEL AVISO, MANDA EL SERVIDOR**: en esta app hay decenas de flashes
  ÁMBAR que significan ÉXITO («Usuario creado. No se pudo enviar el correo de bienvenida», «ITA
  subido, pero no se pudo leer la fecha», «Guardado, pero el desglose no cuadra»…). Dándolos por
  rechazados, el formulario volvería relleno **después de haber creado la ficha** y se acabarían
  duplicando terceros y personas — que aquí rompe el cruce por DNI de facturación y el reparto
  editorial. El punto único es **`_flash_form_error(mensaje, campos=[...], abrir='idDelModal')`**
  (app.py): deja en la sesión —de un solo uso, como `session['ficha_nav']`— el mensaje **en español y
  para una persona** (nunca `str(exc)`: eso al log), los **nombres** de los campos que se pintan en
  rojo y **qué modal reabrir**; `layout.html` lo emite en el `<body>` (`data-form-rechazado`) y
  `ajax_inline.js` lo mira en la respuesta para decir en su evento si el guardado ENTRÓ (`ok`).
  ⚠️⚠️ **LISTA BLANCA de formularios**: solo se guarda el que se puede identificar sin ambigüedad —
  un `data-autosave` propio, un `id` ÚNICO en la página, o una acción que lleve el id del registro—.
  De los 373 formularios de la app, **294 están dentro de un `{% for %}`** y 65 comparten acción con
  otro del mismo fichero: que un campo no se recupere es tolerable, que **se recupere en la fila de
  al lado** no lo es (un importe apareciendo escrito en el gasto siguiente se firma sin sospechar).
  Para meter un formulario nuevo: `data-autosave="clave"` + `data-autosave-title="Lo que es"`.
  ⚠️ **NUNCA se fusiona campo a campo en silencio**: si el formulario **venía con datos** (una ficha
  de edición o un alta precumplimentada) no se toca nada y solo se ofrece; si estaba vacío, se repone
  y se dice de cuándo es. Y un radio marcado **por defecto** no cuenta como «venía con datos» (el
  asistente trae una docena: con eso, todo formulario parecía relleno y no se reponía nunca).
  ⚠️ **Un ARCHIVO no se puede reponer**: los `input[type=file]` vuelven marcados en ÁMBAR con «Vuelve
  a adjuntarlo», o el formulario tendría aspecto de completo y se mandaría la factura **sin** la
  factura.
  ⚠️ **NO se guarda**: contraseñas, credenciales de integraciones, el token CSRF, consentimientos y
  firmas, la foto del DNI del escáner (`_b64`), ni ficheros. Y **solo con sesión** (`data-autosave` en
  el `<body>` con `CURRENT_USER`): en las páginas PÚBLICAS —facturación, entrega de masters, PRL,
  autorizaciones de MENORES con su DNI y su firma— no se deja **nada** escrito en el disco de un
  tercero (y esas páginas ya vuelven rellenas del servidor: `render_template(..., form=request.form)`,
  el precedente de la entrega de masters). Caduca a las 6 h y se borra al llegar a la pantalla de
  acceso.
  ⚠️⚠️ **NADA SE OFRECE ANTES DEL PRIMER REPASO** (bug real, con captura): tras el rechazo el redirect
  lleva `open_wizard=1` y el asistente **se abre solo** —su propio script, con reintentos— ANTES del
  `DOMContentLoaded` de este motor, así que el repaso general se adelantaba y sacaba la línea de
  «tienes algo sin enviar» **encima** de lo que un instante después se reponía solo: salían las dos
  cosas a la vez. Hay un cerrojo (`arrancado`) y el `MutationObserver` **se instala al final** del
  primer repaso, no al cargar el fichero.
  ⚠️ El aviso del rechazo va **DENTRO del formulario** (`.modal-body`): el flash de arriba queda
  detrás del modal, y en una ficha larga fuera de pantalla. Y **no puede ser hijo directo de
  `<main>`**, porque `showFlashes` borra y reinserta todos los `.alert` de ahí en cada guardado
  inline.
  ⚠️ **VOCABULARIO**: aquí no se dice «borrador» (en esta app BORRADOR es el ESTADO de una actividad y
  nadie sabría de qué se habla), ni «autoguardado», ni «restaurar»: se dice «lo que escribiste» y
  «seguir con eso».
  · **LO QUE FALTA VA EN ROJO** (`form_check.js`, sep 2026): lo pidió así Dani y sustituye al criterio
  anterior (ámbar = falta) — «los que están incompletos y son obligatorios o los que están mal, con
  fondo rojo hasta que estén cumplimentados o estén bien». **Solo al intentar guardar o pasar de
  paso**, nunca al abrir el formulario. El ámbar se queda para lo que **no bloquea** (`missing()`, el
  archivo que hay que readjuntar).
  · **Enganchado ya**: el **asistente de actividad** (`concert_wizard_create` → mensaje + campos +
  reabrir, con `_wizard_error_fields` casando el texto del `ValueError` con sus campos) y, con clave
  propia, el alta de **terceros**, el alta de **personal**, los **datos de una persona**, el alta de
  un **ciclo/festival** y el de un **adelanto**. Los demás endpoints ganan lo suyo en cuanto se les
  cambie el `flash(...)` por `_flash_form_error(...)`; hasta entonces su formulario ya no pierde lo
  tecleado (sale la línea para recuperarlo).
  Probado con la app real: se teclea en el asistente, el servidor lo rechaza, el redirect va a
  `/conciertos` y el asistente **se reabre solo** con la fecha, el festival y el aforo puestos, el
  aviso rojo dentro y el campo del artista en rojo; un guardado que ENTRA no deja nada; un formulario
  abandonado ofrece «Seguir con eso» sin pisar nada; y en `/facturacion` no se guarda nada.

- ⚠️⚠️ **UNA LISTA DE SUGERENCIAS TIENE QUE SEGUIR A SU CAMPO, Y NO TAPAR MEDIA PANTALLA** (sep 2026,
  bug real con captura en el selector de canciones). La lista de la casa se saca al `<body>` en
  **`position:fixed`** para que no la recorte ningún `overflow`… y por eso **NO se movía con el
  scroll**: al bajar por la página el campo se iba y las opciones se quedaban flotando en medio de
  otra cosa. Tres cosas, todas en el punto único **`static/js/float_list.js`**:
  · **`follow(input, box, opciones, onClose)`** la vuelve a colocar mientras está abierta (`scroll`
    **en CAPTURA** —los eventos de scroll de un elemento no burbujean, pero la fase de captura de
    `window` sí los ve, así que vale también para el cuerpo de un modal— y `resize`) y **la CIERRA**
    cuando el campo se sale de la vista. Devuelve la función para dejar de seguirla, que hay que
    llamar al cerrar (si no, quedan dos seguidores peleándose).
  · **`{max: N}`** en `place`: doce resultados tapaban media pantalla. Con tope, la lista **se
    desliza por dentro** (que es lo que se espera al mover la rueda encima de ella).
  · ⚠️⚠️ **`ensureRoom` acerca el campo con `behavior: 'instant'`**: la app tiene
    `scroll-behavior: smooth`, así que un `scrollIntoView` normal **ANIMA** y quien mide justo
    después (el `place` de la línea siguiente) lee la posición **VIEJA** — la lista salía pegada a
    donde ESTABA el campo y con el alto mínimo (120 px en vez de 320).
  Ya enganchado en el selector de **canciones** (`performance_songs.js`) y en el buscador de
  **proveedor** de un gasto (`bag_expense_form.js`). Medido: 12 resultados, alto 320, pegada a 2 px
  del campo antes y después de moverse, y cerrada al irse el campo.
  · **Y CADA CANCIÓN CON SU PORTADA** (`.wz-song__cover`), en las sugerencias y en las filas ya
  elegidas: el catálogo (`api_artist_wizard_meta` y `_repertoire_songs_for_artists`) devuelve
  `cover_url` y la fila del servidor la pinta igual que el JS.
  ⚠️ Sin portada se cae a la de **«sin portada»** (`DEFAULT_COVER_URL`, que el JS lee de
  `data-default-cover-url` del `<body>`), y si el archivo no se puede leer **el hueco se quita**
  (`onerror="this.remove()"`) en vez de dejar un cuadro roto.

- ⚠️⚠️ **LA DIRECCIÓN SE RELLENA EN DOS PASOS: primero la BARRA, luego los campos** (sep 2026). Sin
  recinto había cuatro campos a la vista (dirección, CP, municipio, provincia) y la barra buscando a
  la vez: la gente escribía el municipio a mano mientras la barra buscaba y la dirección se quedaba a
  medias. Ahora, en un bloque marcado con **`data-addr-reveal`** solo se ve **una barra**
  («Escribe dirección, municipio, provincia…») y al ELEGIR una sugerencia aparecen debajo los campos
  **ya rellenos**: dirección · código postal · municipio · provincia · país (`[data-addr-parts]`).
  · Motor único `static/js/address_autocomplete.js` (rol nuevo `data-addr="search"`); la lista cuelga
  del `<body>` con `app33FloatList`, así que no la recorta el modal.
  · **Si el buscador no conoce el sitio**, el enlace **«Escribirla a mano»** enseña los campos (sin
  eso, un pueblo que el geocodificador no tenga bloquearía el alta). Al revelarlos, esa línea
  desaparece.
  · **Editando** (los campos ya traen datos) se ven desde el principio: lo repasa `repasar()` al
  cargar y con `shown.bs.modal` / `ficha:shown` / `inline:updated`.
  ⚠️⚠️ **Y EL ERROR DE VERDAD ESTABA EN EL BUSCADOR**: un resultado puede ser un **MUNICIPIO** y
  `geo_utils.parse_feature` lo leía como CALLE (`props['name']`), así que al elegir «Chipiona» se
  rellenaba «Dirección: Chipiona» y **municipio y provincia se quedaban VACÍOS** → el asistente decía
  «indica al menos municipio y provincia» justo después de elegir el municipio. Ahora
  **`is_place_feature`** (por el `type` de Photon: `city`/`locality`) lo manda a `city`, y
  **`is_admin_feature`** descarta lo que es una provincia, una comunidad o un país (Photon devuelve
  «Sevilla» dos veces y la segunda solo confunde).
  ⚠️ La **PROVINCIA** sigue saliendo del **código postal**; sin CP (un municipio no lo tiene) se
  acepta la del proveedor **solo si es una de las 52** (`PROVINCE_NAMES`, así una comarca como
  «Sierra de Cádiz» no cuela) y, si aún falta, **con NUESTROS datos**
  (`_address_rows_fill_province`: los pares municipio→provincia de recintos y actividades, que es lo
  que ya usa `api_city_search`).
  · **`Concert.manual_country`** existe ya de verdad: `_concert_country_value` lo leía (y de él sale
  la **bandera** de lo que es de fuera), pero **la columna no estaba**, así que un `getattr` devolvía
  siempre None y una fecha en Francia sin recinto no se distinguía de una de aquí.
  ⚠️ En la ficha, el bloque del recinto a mano tenía la zona `data-address-autocomplete` envolviendo
  **solo la columna de la izquierda**: el CP, el municipio y la provincia estaban FUERA y no se
  rellenaban nunca.

- ⚠️⚠️ **LO QUE FALTA SE MARCA EN AMARILLO Y LO QUE ESTÁ MAL EN ROJO, Y NO SE DEJA PASAR** (sep 2026,
  motor GLOBAL `static/js/form_check.js` · `window.app33FormCheck`). Antes se podía recorrer un
  asistente entero y el fallo aparecía **al final**, en un `alert()` que no decía dónde estaba.
  · **AMARILLO** (`.is-check-missing`) = obligatorio y sin rellenar (no es un error: falta).
    **ROJO** (`.is-check-bad`) = relleno pero mal. Se lleva el foco al primero y arriba de lo que se
    está mirando sale **qué falta**.
  · **Al ENVIAR** cualquier formulario y **al pasar de paso** en un asistente: `step_wizard.js` y el
    asistente de actividad llaman a `app33FormCheck.check(seccion)`; una regla propia de la pantalla
    se dice con `app33FormCheck.fail(ambito, campo, motivo)`.
  ⚠️⚠️ **HAY QUE QUITARLE AL NAVEGADOR SU VALIDACIÓN**: con un campo `required`, el navegador PARA el
  envío **antes** de lanzar el evento `submit` y saca su bocadillo — nuestro aviso no se pintaba nunca
  (comprobado). Por eso el motor le pone **`novalidate`** a cada formulario que gestiona (y a los que
  se pintan después, con un `MutationObserver`). Opt-out: **`[data-no-check]`** (ese conserva la del
  navegador) y el `formnovalidate` del botón que envía.
  ⚠️⚠️ **`stopImmediatePropagation`, no `stopPropagation`**: el LOADER a pantalla completa, el envío
  por AJAX y la subida con progreso escuchan `submit` en `document` **igual que el motor**, y
  `stopPropagation` solo impide que el evento salte a otro nodo — salía el «Cargando…» de un
  formulario que no se estaba enviando.
  ⚠️ Un campo **oculto o deshabilitado no se comprueba** (un paso que no toca, un panel cerrado): no
  puede bloquear un envío. Y un **Select2** se marca en su recuadro visible (`.select2-selection`):
  su `<select>` de verdad está escondido detrás y la marca no se veía.
  ⚠️ El aviso se pinta en el **`.modal-body`** cuando lo hay: puesto «al principio del formulario»
  salía FUERA del modal, flotando sobre la página.

- ⚠️⚠️ **UNA PIEZA SE PINCHA Y SE VE, con flechas para pasar a la siguiente** (sep 2026). Al pinchar
  un cartel —da igual que sea imagen, vídeo, **audio** (una cuña de radio), PDF o un archivo que solo
  se descarga— o el navegador se lo bajaba o abría otra pestaña: **nunca se veía en el sitio**. Motor
  ÚNICO **`static/js/media_viewer.js`** (`window.app33Viewer`), autocontenido (se pinta su propio CSS
  y no depende de Bootstrap, porque lo usa también una página pública standalone).
  · **Cómo se marca lo que se pincha**: `data-viewer-src` (la URL para VERLO) · `data-viewer-kind`
  (IMAGE|VIDEO|AUDIO|PDF|FILE) · `data-viewer-name` · `data-viewer-download` · `data-viewer-poster`.
  Dentro de la app lo emite el macro **`art_open_attrs(asset, set=, dl=)`** de `_artwork_media.html`,
  así que el arreglo entra a la vez en la pestaña Cartelería, en el panel de la cartelería GENERAL y
  en el Sold Out.
  ⚠️ **`data-viewer-set` = el CONJUNTO que recorren las flechas** (los carteles de ESA sección). Sin
  él el ámbito es el `[data-viewer-group]` más cercano y, si no hay ninguno, TODA la pantalla — y
  entonces las flechas mezclan carteles + Sold Out + rechazados + logos, que son categorías que
  `ARTWORK_ASSET_CATEGORIES` mantiene separadas a propósito. Cada sección pasa el suyo (`cart`,
  `cart-rech`, `soldout`, `gk`, `gk-brand`…).
  ⚠️ Un control de dentro de la tarjeta no abre el visor: `data-viewer-ignore` (lo lleva el chip de
  «Descargar»). Y un **PDF también se pincha**: su icono llevaba el visor solo en el `{% else %}`.
  ⚠️ **Un `<a>` DENTRO DE OTRO `<a>` no es HTML válido**: el navegador cierra el de fuera donde
  empieza el de dentro y la tarjeta se parte (la misma trampa que un `</div>` de más). Por eso la
  tarjeta de la página pública es un **`<div role="button" tabindex="0">`** (con Enter y Espacio) y el
  enlace de descargar va dentro.
  ⚠️ **Un vídeo NO se puede servir entero en memoria**: `public_artwork_file` sirve VIDEO y AUDIO por
  el puente de siempre (**`_playlist_audio_response`**, con `Range`, `Accept-Ranges` e `inline`), así
  que se puede reproducir y arrastrar la barra sin bajar el archivo (comprobado: 206 con
  `Content-Range`). Sin eso, cada salto volvía a bajarlo a la RAM del worker.
  ⚠️ Lo que **no se puede previsualizar** (un vectorial de imprenta, un paquete) se dice en el visor
  con su icono y su botón de descarga, en vez de dejar un hueco vacío.

- ⚠️⚠️ **LA BARRA DE DESCARGA NO BLOQUEA LA PANTALLA** (sep 2026, `static/js/download_bar.js` ·
  `window.app33Download.get(url, {name})` · enlaces marcados con **`data-dl-bar`**). Un documento que
  el servidor GENERA al vuelo (el ZIP de la cartelería, un PDF, un Excel) tarda unos segundos, y eso
  se tapaba con el **velo a pantalla completa** (`#globalLoader`, que es `inset:0` con
  `pointer-events:auto`) o con NADA: se pinchaba «Descargar todos», no pasaba nada visible y un rato
  después se abría el diálogo de guardar. Ahora es una **tarjeta abajo a la derecha** con el nombre,
  su barra, el porcentaje y una ✕ que aborta, y **se puede seguir trabajando**.
  · **DOS FASES honestas**: «Preparándolo…» en barrido mientras el servidor genera (ahí no hay
  porcentaje posible: `_artwork_zip_response` baja cada pieza de Storage ANTES de emitir el primer
  byte) y «Descargando… N%» con el tamaño en cuanto llegan bytes (o los KB recibidos si la respuesta
  va por trozos y no trae `Content-Length`).
  ⚠️⚠️ **`stopImmediatePropagation`, no `stopPropagation`**: el layout tiene DOS manejadores de clic
  en captura sobre `document` (la descarga por iframe y el LOADER de navegación) y `stopPropagation`
  **no** detiene a otro listener del MISMO nodo. Por eso el ZIP encendía además el velo —con su
  apagado de seguridad a los 15 s— que es literalmente lo que se veía. Lo usan las DOS capas
  (`download_bar.js` y `doc_download.js`), y `doc_download` se salta los enlaces `data-dl-bar` para
  que no se descarguen dos veces.
  ⚠️ `DOC_PATH_RE` de `doc_download.js` no casaba con **`/descargar-todo`** ni **`/descargar-todos`**
  (llevaba `descargar-todas`, en femenino) ni con `/download`: cuatro rutas de cartelería se quedaban
  fuera. Ahora es `descargar(-[a-z]+)*|download`.
  ⚠️ El **nombre** de la tarjeta lo dice el servidor (`Content-Disposition`) en cuanto se conoce; y si
  el servidor contesta un **motivo** (`{ok:false, error}` con XHR) se enseña ESE — antes esos
  endpoints hacían `flash` + redirect y el motivo se consumía dentro del XHR («No hay carteles
  aprobados que descargar» no se veía nunca).
  ⚠️ Va por **encima del visor** (z-index 2147482800): mirando un cartel a tamaño se tiene que seguir
  viendo cómo va la descarga.

- ⚠️⚠️ **UNA MINIATURA DE VÍDEO NUNCA SALE EN NEGRO, Y UN VÍDEO VERTICAL SE VE VERTICAL** (sep 2026).
  Los anuncios de una gira son verticales y salían en un **rectángulo negro apaisado**. Dos causas
  distintas:
  · **LA PROPORCIÓN**: el marco de la miniatura se calcula con las medidas del archivo y, sin ellas,
  cae a 16:9. **El subidor de la ficha no medía nada** (el del enlace público sí), así que a todo lo
  subido desde dentro le pasaba. Motor único **`static/js/media_dims.js`**
  (`window.app33Dims.file/all`, imágenes con `<img>` y vídeos con `<video>`), usado por los tres
  subidores, que mandan `widths`/`heights` — que el servidor ya leía.
  · **EL FOTOGRAMA**: casi todos los vídeos empiezan con un fundido, así que coger uno fijo (el 25%)
  deja un negro. **`_video_generate_poster_bytes`** prueba VARIOS momentos y mide el brillo de cada
  uno (`_image_brightness`, Pillow): vale el primero que se ve y, si el vídeo es oscuro de principio
  a fin, el menos oscuro. Medido con un vídeo real (3 s en negro + 4 s de color): antes brillo **0,0**,
  ahora **171**. El MISMO criterio está en `static/js/video_thumb.js` para la miniatura que saca el
  navegador mientras no hay póster (con `<canvas>`; ⚠️ un vídeo de otro dominio «mancha» el lienzo y
  medirlo lanza excepción → ahí se acepta el primer fotograma). **Si se cambia uno, se cambia el otro.**
  ⚠️ **Las MEDIDAS se guardan aunque Storage falle**: la proporción es lo que se VE y no depende de
  que la miniatura se pueda subir (subiendo primero y saliendo si falla se perdían las dos).
  ⚠️ **AUTO-RELLENO**: `_artwork_poster_schedule` solo se llamaba AL SUBIR, así que un vídeo de antes
  —o uno cuyo hilo se quedó a medias en un despliegue— no conseguía miniatura NUNCA.
  **`_artwork_posters_backfill`** la programa al pintar la pestaña Cartelería, el panel del grupo y la
  página pública (el mismo patrón que `_video_posters_backfill` de la galería), con el MISMO cerrojo,
  tope de concurrencia y caché negativa que el póster de una foto (claves `art:<id>`): sin deduplicar
  se arrancaría un hilo por render.
  · Y un cartel puede ser **AUDIO** (`ARTWORK_AUDIO_EXTS`): se ve con su icono, se escucha en el visor
  y no puede ser el cartel principal ni la miniatura de un enlace (`_artwork_image_src` devuelve ''
  para PDF, AUDIO y FILE). ⚠️ `_artwork_kind_of` tiene que aceptar `'AUDIO'` en la columna `kind`: sin
  eso se recalculaba por el nombre y una cuña podía salir como IMAGE → `<img src="cuña.mp3">`.

- ⚠️ **UNA SECCIÓN QUE AÑADE NO ESCONDE LO QUE YA HAY** (sep 2026, `data-keep-view` en
  `ficha_inline.js`). Al pulsar el «+» de **Contratos** (o de **Notas**, o el lápiz de
  **Equipamiento**) desaparecía la lista de lo ya subido y daba la sensación de que no se había
  subido nada. Ahora el formulario de una sección ADITIVA se marca con **`data-keep-view`** y su
  vista consolidada se queda a la vista; las que REEMPLAZAN (datos, cachés, colaboradores, entradas)
  siguen ocultándola.
  ⚠️ El atributo va en el **FORM**, no en la sección (`show`/`hide` reciben el form).
  ⚠️ **NO vale quitar el `data-section-view`**: `viewFor` tiene un fallback que busca el PRIMER
  `[data-section-view]` del `[data-inline-zone]` ancestro, y en la ficha de actividad TODO cuelga de
  `#concert-general-zone` — se ocultaría la vista de OTRA sección, en silencio.
  · En **Equipamiento** la vista va **partida en dos**: arriba lo que el formulario reemplaza (la
  etiqueta de la opción, con `data-section-view`) y debajo los ADJUNTOS y las NOTAS, sin marcar, que
  no se ocultan nunca.

- **ORDENAR LAS PESTAÑAS** (sep 2026, `static/js/sortable_tabs.js`, GLOBAL). Se **mantiene pulsada**
  una pestaña, **tiemblan** todas, se **arrastran** y al **pinchar fuera** se guarda. Vale para las
  pestañas de una FICHA (`ul.ficha-tabs`), las SUBPESTAÑAS de una sección (`ul.contract-tabs` y
  `ul.nav-tabs`, que es lo que usan Producción, Registros…) y lo que se marque con `data-sortable`.
  Se guarda en `UserProfile.ui_order` (`ui_order_save`, en `PERSONAL_ENDPOINTS`).
  ⚠️⚠️ **La CLAVE de cada grupo tiene que ser ESTABLE aunque cambien las pestañas**: se compone con
  la PÁGINA (`request.endpoint`, que emite el servidor en `data-ui-page`), la clase del grupo y su
  posición entre los de esa clase. Si dependiera de las pestañas que hay —su huella—, **añadir una
  mañana borraría el orden que puso la persona**, que es justo lo que no se quiere.
  ⚠️ Una pestaña NUEVA se coloca **AL FINAL** y el orden elegido se mantiene: `aplica()` pone
  primero las que están en el orden guardado y detrás las que no estaban, en su orden natural. Una
  que desaparezca simplemente no se pinta.
  ⚠️ Se arrastra con eventos de PUNTERO (no el arrastre nativo de HTML5): dentro de una pestaña hay
  enlaces que tienen que seguir funcionando y, con el dedo, el HTML5 no va.
  ⚠️ Mientras se ordena, el clic de una pestaña NO navega (si no, arrastrar cambiaría de pestaña):
  lo corta el handler en CAPTURA + `.sorting__item .nav-link { pointer-events:none }`.
  ⚠️ **Lo que YA tenía su modo de ordenar no se duplica**: mantener pulsado un MÓDULO de Inicio entra
  en «Ordenar mi inicio» (`window.app33HomeOrderEnter`) y mantener pulsado el MENÚ abre «Ordenar mi
  menú». El motor solo reconoce el gesto y llama al suyo.
  ⚠️ Un movimiento del dedo antes de los 500 ms **cancela**: es un scroll, no un «mantener pulsado».

- **ORDENAR · sin pantallas y con el gesto** (sep 2026):
  ⚠️⚠️ **NO HAY PANTALLA DE GUARDAR**: los módulos de Inicio se guardan **al pinchar fuera** (en
  cualquier sitio de la página) o con Escape. La barra de «Guardar / Cancelar / Orden de siempre» se
  ha retirado: era un paso más que nadie pedía. Igual que las pestañas.
  ⚠️ Mientras se ordena, un clic DENTRO de un módulo (o de una pestaña) **no navega**: si no,
  arrastrar abriría lo que hay debajo.
  ⚠️⚠️ **UN MÓDULO GRANDE SE COMPRIME mientras se ordena** (`.home-ordering .home-order-item >
  *:not(.home-order-grip)`): queda **solo su asa**, así caben todos a la vez y se ve a dónde se está
  moviendo. Con dos módulos que ocupan la pantalla no se puede colocar nada.
  · **FLUIDEZ**: el que se arrastra **sigue al dedo** (`transform` desde el punto de agarre) y los
  demás se apartan con **FLIP** (se apuntan las posiciones, se reordena y cada pieza se anima desde
  donde estaba). Sin eso el reordenado es un salto seco: es lo que se siente «poco fluido». Está en
  los DOS motores (`home_order.js` y `sortable_tabs.js`); si se toca uno, se toca el otro.
  · Del menú personal desaparecen **«Ordenar mi menú»** y **«Ordenar mi inicio»**: se hace
  manteniendo pulsado. El modal del menú se conserva porque es lo que abre ese gesto (y es quien
  guarda `menu_order`, la única verdad del orden del menú).

- **FOTOS Y VÍDEOS · SE SABE A QUÉ ACTIVIDAD SE SUBE, Y LAS FECHAS EN FORMATO DE AQUÍ** (sep 2026).
  El listado para elegir la actividad decía **«Concierto»** a secas —sin nombre no había forma de
  saber a cuál— y la fecha salía en **ISO** («2026-07-18»).
  · Ahora cada actividad se identifica por **su nombre (el del festival) o EL LUGAR**
  («Municipio, Provincia», punto único `_place_label`) y trae aparte el **recinto** y el lugar;
  `api_media_artist_activities` devuelve **`date` en dd/mm/aaaa** y **`date_iso` solo para ORDENAR**
  (⚠️ con «dd/mm/aaaa» el orden alfabético no es el cronológico).
  · El punto único **`_photo_resolve_owner`** ya no cae al nombre del ARTISTA cuando la actividad no
  tiene nombre: cae al LUGAR (en la galería de un artista, todas se llamaban igual).
  · La fila del listado por artista enseña el lugar COMPLETO (`place`, no solo la ciudad) y la
  cabecera del panel dice **de qué es** (tipo · artista · fecha · recinto · lugar,
  `_media_panel_facts`).
  ⚠️ `fa-user-music` **no existe** en esta versión de Font Awesome (saldría vacío): el artista va con
  `fa-guitar`.

- ⚠️⚠️ **LA BARRA DE FORMATO NO PUEDE TAPAR EL ASA DE ARRASTRAR** (bug real con captura, sep 2026):
  el asa (`.pr-blk__grip`) cuelga **18 px** por encima del bloque y `colocaToolbar` dejaba solo 8,
  así que la barra se ponía justo encima y el bloque **no se podía coger para moverlo**. Ahora se
  resta también el alto del asa (`ALTO_ASA`) más un hueco. Debajo del bloque no hay asa, así que
  cuando la barra no cabe arriba se queda como estaba.

- ⚠️⚠️ **LA FOTO DE UN SELECT2 SE SALÍA DEL RECUADRO** (bug real con captura, sep 2026): la caja de
  Select2 en modo simple mide **28 px** y la foto **24**, así que con su hueco de arriba acababa
  1 px POR DEBAJO del borde y se veía pisándolo — y de paso el campo quedaba más bajo que el botón
  «+» de al lado, que es un `.btn`. Ahora la selección tiene la **misma altura que un
  `.form-control`** (`calc(1.5em + .75rem + 2px)`) y centra su contenido: la foto cabe con holgura
  y el campo cuadra con lo que tiene al lado. Vale para TODOS los selectores con foto de la app
  (artistas, terceros, recintos, medios…), que son el mismo componente.

- ⚠️⚠️ **UN BLOQUE DE DIRECCIÓN CON CAMPOS SUELTOS AL LADO VA SIEMPRE EN PIEZAS** (bug real, sep
  2026: «al crear un recinto pones la dirección y no se rellenan solos el municipio, la provincia,
  el país y el código postal, y en el cuadro dirección se queda todo junto»). En la ficha del
  recinto —y en el alta desde el listado— el `data-address-autocomplete` envolvía **solo el campo
  de la dirección**, con `data-addr="full"`, y el municipio, la provincia y el país estaban
  **FUERA** del bloque: al elegir una sugerencia se escribía la dirección ENTERA («Calle Larga,
  11579 Jerez de la Frontera, Cádiz») en ese campo y los demás se quedaban vacíos — que es
  exactamente lo que hace el modo `full` (así se comporta un DOMICILIO, donde ese campo es la
  dirección completa y no hay ningún otro).
  ⚠️ **La regla es del SITIO, no del motor**: si al lado hay campos de municipio/provincia/CP/país,
  el bloque los envuelve a TODOS y el modo es **en piezas**
  (`data-addr="address|postal_code|city|province|country"`); si la dirección va en un solo cuadro,
  `full`. `elegir()` ya rellenaba cada pieza por su cuenta y la **provincia siempre del CP**.
  · **`Venue.postal_code` se guarda** en los tres caminos (`venue_update`, el alta desde el listado
  y el alta al vuelo `api_create_venue`): es lo que trae el buscador con el resto y de él sale la
  provincia. En `venue_update` va con guarda (`if "postal_code" in request.form`), para que un POST
  de otra pantalla no lo borre.
  · **Crear un recinto SOBRE LA MARCHA** ya usa `data-addr-reveal` (solo la barra y, al elegir, los
  campos aparecen rellenos), y `api_create_venue` guarda las cinco piezas.
  Probado con la app real en los TRES caminos: al elegir «Calle Larga» queda `address='Calle Larga'`
  · `postal_code='11579'` · `Jerez de la Frontera` · `Cádiz` · `España`, y así se guarda.

- ⚠️⚠️ **UN `data-edit-toggle` SIN VALOR SOLO ABRE EL FORMULARIO DE SU `.ficha-section`** (bug real,
  sep 2026): el lápiz **«Editar los datos» de la ficha del ARTISTA no hacía nada**. Estaba en la
  CABECERA (`ficha-hero__actions`), fuera de cualquier sección, así que `closest('.ficha-section')`
  daba null y no había formulario que abrir — y, además, ese formulario vive en la pestaña «Datos» y
  desde otra pestaña **ni existe en el DOM**.
  · La solución es el patrón nuevo **`?editar=<id del formulario>`**: el botón de una cabecera es un
  **ENLACE** a su pestaña con ese parámetro y `ficha_inline.js` abre el formulario al cargar. Es
  genérico (sirve para cualquier ficha), como el `?open=` que abre un modal.
  ⚠️ **El detector lo caza**: `tools/check_botones.py` avisa de un `data-edit-toggle` vacío sin
  `[data-section-form]` en su sección (comprobado con el bug original puesto otra vez). Ojo al
  escribir esa regla: «ficha-section» casa también con `ficha-section__head` / `__body` / `__title`,
  así que hay que buscar la CLASE (`ficha-section(?![-_\w])`) o salen falsos positivos en cada
  sección de la ficha de una actividad.
  · Y al cambiar la FOTO se ve **la que hay ahora**: cambiarla a ciegas es lo que hace dudar de si
  se ha cambiado.

- ⚠️⚠️⚠️ **INICIO · UN SOLO MÓDULO DE TAREAS** (sep 2026). Inicio llegó a tener **CUARENTA** módulos
  —uno por cada cosa que puede estar pendiente— y lo de cada uno se perdía entre ellos. Ahora **TODO
  lo que hay que HACER está en «Mis tareas pendientes»**, que lo ve **todo el mundo** (antes era solo
  de dirección): una fila por aquello a lo que pertenece y, dentro, **una subtarea por cosa**.
  · **Lo que NO es una tarea sigue siendo su módulo** (eso se MIRA, no se hace): la cabecera, los
  accesos rápidos, el **calendario**, los **cobros y lo facturado** (contratación y dirección), el
  **CUADRO DE MANDO** (dirección) y el resumen de **mis vacaciones**. Y ya está: de 40 a 4.
  ⚠️ **«Mis avisos» se retiró**: era el MISMO dato que la franja de arriba y la campanita.
  · **CÓMO SE AÑADE UNA FUENTE: una línea en `HOME_TASK_SOURCES`** (`ctx` = la clave del contexto ·
  `kind` · `label` o `label_key` · `action` · `order` · `subtasks` si la fila trae las suyas). Los
  campos habituales (título, enlace, artista, foto, fecha, nota, id) se buscan **por su nombre
  habitual** (`HOME_TASK_FIELDS`), así que una fuente nueva no necesita adaptador propio.
  ⚠️ **NO SE CALCULA NADA NUEVO**: cada `_home_*` ya decide qué le toca a esa persona (lo asignado,
  lo que ha creado, lo que gestiona o lo genérico de su departamento) y esto solo lo junta. Los
  módulos que ya trata `_home_my_tasks` con su lógica propia están en `HOME_TASK_SOURCES_SPECIAL`
  (las fases de una petición miran de quién es cada una) y **no se repiten** en el registro.
  ⚠️ El módulo único se monta **AL FINAL** de `inject_personnel_globals` (con `fuentes=contexto`):
  sus filas salen de los demás módulos, así que no puede calcularse antes que ellos.
  ⚠️ A partir de la fila **20** se esconden tras «Ver las N restantes»: con cincuenta tareas lo de
  arriba —que es lo más urgente, porque van por fecha— dejaba de verse.
  ⚠️ Su plantilla es **`_home_my_tasks.html`** (antes `_home_direccion.html`).
  ⚠️ Los **avisos de una promoción** que se produce (cambio de fecha, de sitio, cancelación) pasan a
  la **campanita** (`_promo_alert_add` crea ya el `AppNotification`): vivían SOLO en su módulo de
  Inicio y al reunir las tareas se habrían perdido —`PromotionAlert` es su propia tabla—.

