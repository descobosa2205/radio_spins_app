# Contratación · actividades y conciertos

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- EL MENÚ DE ESTADO desde el LISTADO (y por qué sus items son botones)

- Histórico de actividades
- AGENDA DEL ARTISTA · VOLCAR SU CALENDARIO DE iCLOUD. Cada artista tenía su
- LO QUE NO ESTÁ CONFIRMADO ES DE CONTRATACIÓN. Una reserva puede caerse, y
- Calendario de agenda (Inicio + pestaña «Agenda» del artista): componente reutilizable
- CUMPLEAÑOS de los INTEGRANTES de un artista (corregido ago 2026): salen SIEMPRE (uno o varios,
- FICHA DE ACTIVIDAD · EDITAR «DATOS» SALEN TODOS LOS CAMPOS. El formulario
- CABECERA DE UNA BOLSA · la misma de una actividad
- ⚠️⚠️ UN LOGO DE EMPRESA DEL GRUPO NO LLEVA FONDO BLANCO. Muchos se suben en PNG
- Simulaciones — conversión y archivado
- FICHA DE ACTIVIDAD · pestaña «INICIO» con el proceso paso a paso
- Asistentes por pasos (UX): cuando se pincha una opción de un paso que no requiere más datos,
- El asistente «+ Actividad» admite ARTISTA o EVENTO: primer paso «¿De quién es la actividad?»
- Punto de empate de una actividad (_concert_break_even_info, en la pestaña Resultado, que es
- PROMOCIÓN · la ficha se lee como la de una ACTIVIDAD: misma cabecera
- CANCELAR o APLAZAR una actividad es un PROCESO, no cambiar una etiqueta.
- A UN ARTISTA (O A UN EVENTO) SOLO SE LE MANDA LO QUE ESTÉ CONFIGURADO EN SUS
- ANUNCIAR Y SACAR A LA VENTA LE DAN TRABAJO A DIGITAL
- AVISO AL ARTISTA DE UNA ACTIVIDAD. Antes de CONFIRMAR una actividad hay que
- ELIMINAR UNA ACTIVIDAD · la RUEDA de la cabecera
- FICHA DE CONTRATACIÓN · una sola, y lo del promotor aparte
- El FORMULARIO del promotor, por módulos (ago 2026, concert_contract_public.html, clases
- Módulo de CACHÉS solo si hay cachés
- La RUEDA de la ficha de una actividad va en la FILA DE BOTONES, a la derecha del todo
- CONTABILIDAD · cada persona lleva SUS EMPRESAS del grupo (ago 2026,
- EMPRESA DEL GRUPO SIN LOGO → ICONO DE EMPRESA + NOMBRE. Globales
- UN AUTOR QUE ES INTEGRANTE DE UN ARTISTA = UNA SOLA FICHA (bug de dinero, ago 2026).
- FICHA DEL ARTISTA · UN SOLO MÓDULO de datos y documentos por integrante (bug real, ago
- Al renombrar la ficha de un solista con el nombre del artista, el NOMBRE OFICIAL tiene que
- CONTRATACIÓN · CONCIERTOS: el número de cada artista es el de lo que va a VER (corregido
- MARKETING · UNA CAMPAÑA DE UNA ACTIVIDAD VA CON LA ACTIVIDAD: su bolsa y su fecha (sep 2026,
- «A EMPRESA»: EL PROMOTOR ES LA EMPRESA DEL GRUPO QUE FACTURA. En
- EL ASISTENTE DE ACTIVIDAD LEÍA LOS CAMPOS DE OTRO FORMULARIO (bug real y grave, sep
- CALENDARIO POR ARTISTA EN EL IPHONE (CalDAV): SE AÑADE Y SE BORRA, Y SE AVISA.
- CONTABILIDAD · el filtro de empresa
- FICHA DEL ARTISTA · integrantes y NOTIFICACIONES
- PERSONAS DEL ARTISTA = TERCEROS que forman parte de él (ArtistPerson.promoter_id): un miembro
- GASTOS DIRECTOS: de OFICINA o INVERSIÓN de artista
- Otras actividades · filtros por tipo y listado por sujeto (ago 2026, contracting_view +
- Actividades de un EVENTO (AppEvent): una actividad (Concert) exige artista (artist_id NOT
- FUSIÓN de Actividades y Acciones
- Sección ACTIVIDADES: filtros por tipo y listado por sujeto (ago 2026, activities_view +
- Filtros de tipo
- Cuentas bancarias de una empresa del grupo
- Facturación por empresa
- Ficha de la empresa del grupo (company_detail, /empresas/<cid>): pestaña Datos (datos de
- Contratos de actividad
- FILTRO POR AÑO en Conciertos y Actividades
- LA FICHA DE UNA ACTIVIDAD SIN CONFIRMAR solo la abren quienes la ven
- UN TERCERO NUEVO: EMPRESA o PARTICULAR.
- QUIEN CREA UNA ACTIVIDAD LA VE (_concert_visible_unconfirmed): una actividad nace
- UNA ACTIVIDAD YA PASADA SE CREA Y YA ESTÁ: no se va a mandar un aviso de algo que ya
- AL MOSTRAR UN PANEL DEL ASISTENTE HAY QUE VOLVER A HABILITAR SUS CAMPOS: al enviar se
- EL PROMOTOR DEL ASISTENTE ES UNA BARRA DE BÚSQUEDA, no un desplegable
- UNA COMISIÓN SE APLICA DE DOS MANERAS Y NO ES LO MISMO (ago 2026,
- INICIO DE CONTRATACIÓN · el dinero (ago 2026, _home_billing_pending / _home_billing_year +
- LO CREADO ANTES DEL 2-SEP-2026 SE CONFIRMA SIN COMUNICAR. La comunicación al
- EN LA CABECERA DE UNA ACTIVIDAD NO VAN LAS PERSONAS VINCULADAS AL ARTISTA: su
- EL ASISTENTE DE ACTIVIDAD ES UNO, Y SU CONTEXTO SALE DE UN SOLO SITIO. El
- EL REPERTORIO DE UNA ACTIVIDAD: se busca ESCRIBIENDO y se ordena ARRASTRANDO.
- QUIEN CREA UNA ACTIVIDAD LA SIGUE VIENDO HASTA QUE SE CONFIRMA: alguien que no es
- LOS FILTROS Y LA FILA DE UN LISTADO DE ACTIVIDADES SON UN SOLO SITIO. Los
- LA AGRUPACIÓN POR «GRATUITOS» DESAPARECE, Y LA FILA DICE QUÉ ES CADA ACTIVIDAD.
- LA FORMA DE PAGO DEL CACHÉ SE CONFIGURA EN LA FICHA, Y SE AVISA SI FALTA.
- MARKETING · LA EMPRESA LA DICTA LA ACTIVIDAD: en una campaña vinculada a una
- CADA TAREA DE UNA ACTIVIDAD ES DE UN ÁREA, Y SOLO LA VE QUIEN TRABAJA EN ELLA.
- EN UN CONCIERTO «VENDIDO» NO SE VEÍAN LOS CACHÉS (bug real, sep 2026). Los módulos de
- FICHA DE CONTRATACIÓN · RECHAZARLA Y PEDIRLE QUE LA SUBSANE. En la pantalla de
- EL PROMOTOR CUBRE… · SUELDOS MÚSICOS, BACKLINE y OTROS: tres opciones más en
- LA CONFIRMACIÓN DEL ARTISTA SE PIDE, Y ÉL LA DA DESDE EL CORREO O LA LANDING.
- FICHA DE CONTRATACIÓN · LOS DATOS DEL PROMOTOR SON SUYOS, NO LOS DE LA CASA (bug real y
- LA FICHA DE CONTRATACIÓN SE VA GUARDANDO SOLA: según el promotor escribe, lo
- EL CORREO DE LA FICHA DE CONTRATACIÓN · el botón, dentro del bocadillo y abajo a la derecha
- LA FICHA DE CONTRATACIÓN SE GOBIERNA DESDE SU PESTAÑA
- UN PAYLOAD SIN CLASIFICAR SE PINTA COMO JSON EN CRUDO EN LA FICHA
- LA FICHA DE CONTRATACIÓN, EL AVISO AL ARTISTA Y LOS BOTONES DESTACADOS (sep 2026, tres
- QUE NO SE QUEDE NINGUNA ACTIVIDAD SIN ANUNCIAR. A CUATRO SEMANAS
- LA FECHA DE ANUNCIO PUEDE LLEVAR HORA, Y LA CONFIRMA EL PROMOTOR (sep 2026)
- EL DÍA DEL ANUNCIO, AL ARTISTA LE LLEGA UN SMS CON SUS CARTELES (sep 2026)
- EL CUADRANTE · EL CACHÉ FIJO Y EL VARIABLE, EN DOS COLUMNAS (sep 2026)
- EL PROCESO DE UNA ACTIVIDAD · los pasos, en orden, y lo bloqueado RAYADO (sep 2026)
- CONFIRMARLE LA ACTIVIDAD AL PROMOTOR, Y PEDIRLE DE PASO LO QUE FALTA (sep 2026)

---

## EL MENÚ DE ESTADO desde el LISTADO (y por qué sus items son botones)

La etiqueta de estado (`templates/_concert_status_badge.html`) es la MISMA en la ficha y en el
listado: un desplegable con los cuatro estados que se guardan al momento (`concert_quick_status`) y,
abajo, **Aplazar** y **Cancelar**, que llevan a su proceso porque no son un cambio de etiqueta.

⚠️⚠️ **SUS ITEMS SON `<button>`, NO `<a>`, y no se pueden volver a cambiar** (bug real, sep 2026:
«desde el listado de actividades, al pinchar en cambiar el estado se pone a pensar pero no hace
nada»). En el listado **la fila entera es un `<a>`**, y un `<a>` dentro de otro `<a>` es HTML
inválido: el navegador **parte el árbol y saca el menú fuera del desplegable**, así que Bootstrap no
lo encontraba y no se abría. Encima, el loader veía el enlace de la fila y pintaba «Cargando…» que
no se iba nunca. El detalle entero está en `CLAUDE.md` (es una trampa de cualquier pantalla).
⚠️ El contenedor lleva `data-no-loader` y **solo** `preventDefault()`: con `stopPropagation()` el
clic no llegaba a `document` y Bootstrap tampoco abría el menú.


- **Histórico de actividades**: `LEGACY_ACTIVITY_CUTOFF` (28-jul-2026). Las actividades ANTERIORES se
  conservan en el listado y en su ficha, pero **no generan trabajo**: `_concert_needs_production`
  devuelve False (ni aviso de producción, ni módulo de Inicio), no salen en el listado de Producción
  ni para declarar en Registros. Helpers `_concert_is_legacy` / `_is_legacy_activity_date`. Crear una
  bolsa a mano sigue siendo posible (es un clic deliberado); lo que no se genera es lo automático.
- **AGENDA DEL ARTISTA · VOLCAR SU CALENDARIO DE iCLOUD** (ago 2026). Cada artista tenía su
  calendario de iCloud y ahí está su histórico. Desde la pestaña **Agenda** de su ficha (botón de la
  **nube**, `_artist_calendar_import_modal.html`) se pega el enlace del calendario y **se vuelca a la
  app**, que **se lo queda**: lo importado pasa a ser un dato nuestro (`ArtistAgendaItem`, kind
  **NOTE**, así que se ve, se arrastra y se edita como cualquier otra nota, y sale en su iCal y en
  CalDAV), de modo que el día que se borre el calendario de iCloud el histórico sigue aquí.
  ⚠️⚠️ **NO es una sincronización viva: es un VOLCADO.** Se puede repetir cuando se quiera —lo que
  ya entró se reconoce y se ACTUALIZA en vez de duplicarse—, pero la app no le pregunta a iCloud por
  su cuenta.
  · **LA FECHA TOPE es lo que evita duplicar** (`ArtistCalendarImport.until_date`): del calendario
  viejo solo se trae lo ANTERIOR a ella, porque lo de ahora en adelante ya se lleva en la app. Sale
  por defecto en **hoy** (o la del último volcado) y se dice cuántos se han dejado fuera.
  · **«Ver qué trae»** (`artist_calendar_import_preview`, JSON) lo enseña ANTES de volcar: el nombre
  del calendario, cuántos eventos, de cuándo a cuándo, cuántos ya estaban y una muestra.
  · **NO SE DUPLICA NADA**: cada entrada guarda el **UID del evento de origen** en
  `ArtistAgendaItem.caldav_uid` —la MISMA columna con la que ya se casan los eventos que llegan del
  iPhone por CalDAV— y se busca **en bloque** (con cientos de eventos, una consulta por evento sería
  inaceptable). Reimportar el mismo calendario no crea nada nuevo.
  · **Se puede DESHACER** (`artist_calendar_import_undo`): borra solo lo que trajo ESE volcado
  (`ArtistAgendaItem.import_id`), así que **lo que se haya escrito a mano en la agenda no se toca**.
  Y **volcar otra vez el mismo calendario NO crea otra importación**: actualiza la que ya había (si
  no, la lista de «calendarios ya volcados» se llenaría de copias del mismo y deshacer una no sabría
  cuál es la buena).
  · **El motor de lectura es PURO**: **`ics_import.py`** (ni Flask ni BD), con su prueba de
  regresión **`tools/check_ics_import.py`** — si se toca, tiene que seguir en verde.
  ⚠️⚠️ **En iCal, el `DTEND` de un evento de DÍA COMPLETO es EXCLUSIVO**: el último día real es el
  anterior. Es el error clásico al leer un .ics y hace que TODO dure un día de más.
  ⚠️ Las líneas largas vienen **partidas a los 75 caracteres** y continúan con un espacio: sin
  deshacer eso (`unfold`), un título largo llega cortado.
  ⚠️ Dentro de un VEVENT puede haber un **VALARM** con su propia `DESCRIPTION`: si no se salta, la
  del recordatorio se cuela como la del evento.
  ⚠️ La **hora se respeta tal cual**: con `TZID` se deja la hora escrita (que es la que se leía en el
  calendario) y **solo lo que viene en UTC (`Z`) se pasa a la hora de España**. Un histórico se
  importa para volver a verlo igual, no para recalcularlo.
  ⚠️ Los **repetidos (`RRULE`) se expanden** —un calendario de verdad tiene ensayos semanales—, con
  su `EXDATE` y con las ocurrencias **editadas a mano** (`RECURRENCE-ID`), que mandan sobre la serie.
  La expansión está **acotada** (`MAX_OCCURRENCES` y la fecha tope): un «todos los lunes, para
  siempre» no termina nunca, y cuando se corta **se dice**.
  ⚠️ La identidad de una ocurrencia editada es la de **su hueco en la serie** (`RECURRENCE-ID`), no
  el día al que se haya movido: si no, al reimportar se duplicaría. Y **la lista de editadas excluye
  las que pinta la REGLA, nunca al propio evento editado** — con eso se excluía a sí mismo y esa
  fecha se perdía (bug real que sacó la prueba).
  ⚠️ `STATUS:CANCELLED` no se importa.
  ⚠️⚠️ **`requests` NO ES UN NOMBRE GLOBAL EN `app.py`** (bug real, ago 2026): ahí `requests` es una
  VARIABLE LOCAL en media docena de funciones de invitaciones (`requests.append(...)`), y el módulo
  no se importa arriba — lo importan `holded_utils`, `pleo_utils` y `chartmetric_utils`, cada uno el
  suyo. Usarlo en una función de `app.py` sin importarlo DENTRO (`import requests as _rq`, como ya
  hace `holded_utils`) es un **`NameError` en tiempo de ejecución** → 500 → **la pantalla de
  mantenimiento**, y luego un «Method Not Allowed» al pulsar «Reintentar ahora» (recarga con GET una
  URL que solo acepta POST: el 405 es la CONSECUENCIA, no la causa).
  ⚠️ **Pyflakes NO lo detecta** aquí, porque el nombre sí existe en otros ámbitos del fichero.
  ⚠️ Y no se vio en las pruebas porque **sustituían la descarga por un texto**: el único camino sin
  probar era justo el que fallaba. Por eso existe **`tools/check_ics_download.py`**, que baja un
  calendario público DE VERDAD. Regla: si una función sale a la red, hay que probar **la salida a la
  red**, no solo lo que se hace con lo que trae.
  · **Lo descarga el SERVIDOR**, así que la URL se comprueba (`_ical_url_is_safe`): nada de
  `localhost` ni de IP privadas —sin eso sería una forma de que alguien con sesión le hiciera pedir
  cosas a la red interna—, solo http/https, con **timeout** y **tope de tamaño**.
  ⚠️ iCloud da los calendarios publicados como **`webcal://`**, que no se puede descargar: es un
  `https://` disfrazado (`_ical_normalize_url` lo convierte).
  ⚠️ Los endpoints (`artist_calendar_import_*`) se mapean a **`artists.agenda`** en los DOS mapeos, y
  exigen `can_edit_artists_stations()`.

- ⚠️⚠️ **LO QUE NO ESTÁ CONFIRMADO ES DE CONTRATACIÓN** (ago 2026). Una **reserva puede caerse**, y
  el resto de la oficina dando por ocupado un día que todavía se está hablando genera más ruido que
  información. Por eso **RESERVADO entra en `_CONCERT_PRIVATE_STATUSES`** (con BORRADOR y HABLADO):
  · lo ven **CONTRATACIÓN** y **DIRECCIÓN** (`_user_sees_unconfirmed_activities`);
  · y **quien la PRODUCE**, en cuanto se le ha activado la producción, aunque siga sin confirmarse
    (es su trabajo). Eso se decide **por ACTIVIDAD**, no por sección: punto único
    **`_concert_visible_unconfirmed(concert, full_details=, user_id=)`**;
  · **para el resto NO aparece en el calendario**. ⚠️ Antes se pintaba como «Reserva — consultar con
    Contratación», ocupando el día: ahora directamente **no se pinta** (lo pidió así dirección).
  · Quien SÍ la ve, la ve **RAYADA pero CON EL COLOR DE SU ARTISTA** (`tentative` en el ítem →
    `.agenda-event.is-tentative`): las rayas se hacen con blanco translúcido **encima** del color
    (`--c`), así valen para cualquier calendario y no hay que inventar un color aparte. Sigue siendo
    su calendario, solo que la fecha no está cerrada. Al pasar el ratón lo dice.
  ⚠️ El mismo criterio vale en el **listado de Producción** (`_production_concert_row`) y en las
  listas ricas de la ficha del artista: los tres miran la MISMA lista de estados.
  ⚠️ En los calendarios **públicos, iCal y CalDAV** no se pinta nada sin confirmar (van con
  `full_details=False` y sin sesión).
  Probado con la app real: dirección ve las cuatro (tres rayadas) · quien produce una reservada ve
  esa y las confirmadas · promoción solo las confirmadas · el calendario público, solo lo confirmado.

- **Calendario de agenda (Inicio + pestaña «Agenda» del artista)**: componente reutilizable
  `_agenda_build` (`app.py`, reúne conciertos/acciones/medios/lanzamientos en un formato común; conciertos
  en BORRADOR fuera) + `templates/_agenda_calendar.html` + `static/js/agenda_calendar.js` + estilos
  `agenda-*` en `styles.css`. Modo `home` (color por artista, 2 semanas fijas, etiquetas de artista arriba
  + tipos a la izquierda) y modo `artist` (color por tipo, 4 semanas navegables por meses con flechas,
  listado de eventos a la izquierda). En Inicio se inyecta como `HOME_AGENDA` (todos los usuarios; sus
  artistas asignados o todos si no tiene/role 10). La agenda del artista carga ±6 meses y navega también
  al pasado. El calendario muestra el mes junto a cada día. Además del calendario de actividades reales,
  `_agenda_build` añade: **bloqueos** y **notas libres** (modelo `ArtistAgendaItem`, kind BLOCK/NOTE,
  multi-día; los bloqueos marcan los días con rayado) y **cumpleaños** (artista individual →
  `Artist.birth_date`; grupo `Artist.is_group` → cada `ArtistPerson.birth_date`). **Botón +** arriba a la
  derecha (Inicio y ficha) → asistente `templates/_agenda_add_modal.html`: elegir artista (en Inicio,
  vía `AGENDA_ARTIST_OPTIONS`), tipo (Actividad/Bloqueo/Otro) y rango de días. «Actividad» reabre el
  asistente de concierto (`/conciertos?open_wizard=1&wizard_artist=<id>`, auto-apertura en
  `_concert_wizard_modal.html`). Endpoints `agenda_block_create` (en `SUPPORT_ACTION_ENDPOINTS`) y
  `agenda_note_create`/`agenda_item_update`/`agenda_item_delete` (en `REQUEST_ANY_ENDPOINTS`, ver más
  abajo). Al crear artista se pregunta «¿es un grupo?»; la pestaña Datos edita
  `is_group`, fecha del artista y fecha por miembro.
  · **EL ORDEN DEL SELECTOR** (`_agenda_artist_options`, ago 2026): **1º MI CALENDARIO** (con la foto
  de quien mira), **2º el CALENDARIO GENERAL** y detrás los artistas y eventos **activos**; el resto,
  tras «Ver más artistas». Los dos primeros no son artistas, así que solo admiten **notas**: lo marca
  **`data-only-note`** en su tarjeta (`soloOtros()`), no `data-office`, que es solo su estilo.
  ⚠️ El nombre del general en la tarjeta es `OFFICE_CALENDAR_NAME` («Calendario general»), el MISMO
  que el de su chip: «Calendario general de oficina» no cabía y salía cortado.
- **CUMPLEAÑOS de los INTEGRANTES de un artista** (corregido ago 2026): salen SIEMPRE (uno o varios,
  `ArtistPerson.birth_date`) más la fecha del propio artista si la tiene, sin repetir. Antes los
  integrantes solo contaban si el artista estaba marcado como **grupo**, así que en uno sin esa marca
  no aparecía ningún cumpleaños aunque estuvieran puestos.
- ⚠️⚠️ **FICHA DE ACTIVIDAD · EDITAR «DATOS» SALEN TODOS LOS CAMPOS** (sep 2026). El formulario
  inline de «Datos» se quedaba corto y —lo grave— **borraba lo que no preguntaba**:
  ⚠️⚠️ **EL PROMOTOR SE BORRABA AL GUARDAR** en cualquier venta que no fuera VENDIDO, GRATUITO o
  GIRAS_COMPRADAS: el campo se ESCONDÍA (`applySaleType` en `concert_form.js`) y el guardado hacía
  `c.promoter_id = … if sale_type in (…) else None`. O sea: en un concierto «a empresa» o
  «participado» no se podía ni ver quién lo promueve, y al guardar cualquier otra cosa se perdía.
  **Quién promueve es un dato de la ACTIVIDAD, no del tipo de venta**: ahora se ve y se guarda
  siempre (y solo se quita si el campo llega vacío a propósito). Lo mismo con el **punto de empate**,
  que se borraba en los conciertos vendidos y gratuitos.
  · **El formulario va por MÓDULOS** (`.ed-block`, con su rótulo e icono): **qué es y de quién**
  (estado · tipo de actividad · artista · festival · gira comprada · ciclo/festival · #) ·
  **cuándo y dónde** (fecha · **hasta**, para lo que dura varios días · **hora de comienzo** y
  **apertura de puertas**, las dos con su «por confirmar» · recinto · **el recinto A MANO** con su
  dirección, CP, municipio y provincia) · **entradas y venta** (aforo · **aforo libre** · salida a
  la venta con su TBC · **sold out** · tipo o «¿tiene caché?» · punto de empate) · **quién promueve
  y quién factura** (promotor · **con qué sociedad suya factura** · nuestra empresa) · **anuncio**.
  ⚠️ **El RECINTO ya no es obligatorio**: vale con escribirlo a mano (es lo que ya hacía el
  asistente). Lo que no se admite es dejar los dos vacíos.
  ⚠️ **Sin fecha de salida a la venta NO se bloquea el guardado**: se apunta como «por confirmar».
  Antes reventaba con «la fecha de salida a la venta es obligatoria» y **no se guardaba nada del
  resto del formulario**, así que una actividad sin fecha de venta no se podía editar.
  ⚠️⚠️ **Y en una actividad GRATUITA no se pregunta siquiera** (sep 2026): donde iba el campo va su
  etiqueta «Gratuito», y el guardado **limpia** la fecha en vez de dejar un «por confirmar» fantasma
  —que es lo que hacía que la ficha y el aviso al artista hablaran de una venta que no existe—.
  Toda la regla (y dónde más deja de aparecer) está en `docs/app/ventas-ticketing.md`.
  ⚠️ Los campos que se guardan **solo si el formulario los trae** (`if "x" in request.form`) son los
  que también se tocan desde otra pantalla (la gira, el ciclo, el tipo de actividad, el promotor):
  así un guardado parcial de otra sección no los borra.

- **CABECERA DE UNA BOLSA · la misma de una actividad** (ago 2026): donde la bolsa sí lleva cabecera
  (`/bolsas/<id>` y la pestaña Producción de una actividad) es ya un **`ficha-hero`** como el de la
  ficha de una actividad: foto redonda, antetítulo con el tipo de bolsa, título con las etiquetas de
  estado y de liquidación, la línea de datos **con iconos** (artistas, vínculo, fechas, total) y la
  **empresa del grupo arriba a la derecha** (`.hero-company`, con su icono si no tiene logo).
  ⚠️⚠️ **La foto del artista salía OVALADA** (bug real): era un `<img>` con un tamaño fijo suelto
  dentro de un `d-flex`, y **cualquier hijo de un flex se puede encoger** — en cuanto la fila iba
  justa se comprimía a lo ancho manteniendo el alto. Con `.ficha-hero__media` (que es `flex:0 0 auto`)
  no puede pasar; comprobado a 375 px, donde sigue midiendo 96×96.
  · **El ASISTENTE** (`_disco_project_wizard_modal.html`, con `step_wizard.js`): artista (los activos
  primero y el resto tras «Ver más artistas») → tipo → y según el tipo: **álbum/EP** (nombre, nº de
  temas → tabla que se genera sola con nombre, colaboración y «tema ya existente» del repertorio;
  formato DIGITAL / DIGITAL+FÍSICO / SOLO FÍSICO y sus soportes CD/vinilo/casete; y el planteamiento
  de lanzamiento con la fecha y los temas que salgan en otra) · **single** y **single + videoclip**
  (nombre, colaboración y fecha) · **videoclip** (de un tema del repertorio, de otro proyecto o suelto).
  ⚠️ **Un tema YA EXISTENTE no lleva fecha**: sale con la etiqueta «Ya publicado».
  · **«SINGLE + VIDEOCLIP» es un TIPO, no una casilla** (ago 2026): la casilla «Incluye videoclip» del
  paso del single se **retiró** y en su lugar hay un tipo propio (`SINGLE_VIDEOCLIP`, «Single +
  Videoclip»), que hace exactamente lo que hacía la casilla marcada
  (`includes_videoclip = true`). Se prepara **igual que un single** —punto único
  **`DISCO_SINGLE_KINDS`**, hermano de `DISCO_TRACKLIST_KINDS`— así que su paso del asistente es el
  mismo (`data-sw-when="SINGLE,SINGLE_VIDEOCLIP"`; ⚠️ el `data-sw-when` casa por token exacto: hay que
  nombrar los dos) y crea su `Song` provisional en repertorio.
  · **¿Lleva vídeo?** lo dice el punto único **`_disco_project_has_videoclip`** (tipo VIDEOCLIP o
  SINGLE_VIDEOCLIP, o la casilla marcada), y de ahí sale la tarea **«Falta el videoclip»**
  (`_disco_project_missing_videoclip`): se mira en la canción del lanzamiento, que es donde se sube, y
  **no reclama nada** si ya hay un material VIDEOCLIP o si la canción está marcada «Sin videoclip»
  (`Song.no_videoclip`) — eso es una decisión tomada, no algo que falte.
  ⚠️ En un «Single + Videoclip» la ficha **no ofrece la casilla** (no se puede quitar lo que dice el
  tipo) y el guardado la fuerza a `true`; en un single a secas sigue estando, para poder decir más
  adelante que llevará vídeo. Y la etiqueta «Con videoclip» solo se pinta cuando el tipo NO lo dice ya
  (`row["video_badge"]`): al lado de «Single + Videoclip» sería repetirlo.
  · **Un tipo que son DOS cosas se dibuja con SUS DOS ICONOS y un + en medio**: punto único
  **`_disco_kind_icon_html`** (global de plantilla **`disco_kind_icon(kind, cls)`**) +
  `DISCO_PROJECT_ICON_PARTS` (`SINGLE_VIDEOCLIP` → nota + película) y las clases `.kind-icons` de
  `styles.css`. Se usa en la tarjeta del asistente, en la fila del listado, en la cabecera de la
  ficha y en el hito del lanzamiento del calendario (esos dos últimos por `icon_html`, que va en el
  propio diccionario). El **+ es un icono más** (`fa-plus`), así que hereda el color y el estado —el
  rojo de la tarjeta elegida— y solo se le baja el tamaño.
  ⚠️ Los iconos toman el tamaño **del sitio donde van** (`.kind-icons i.fa{font-size:inherit}`) y el
  + es una fracción DE ELLOS: así la proporción se mantiene igual en la tarjeta grande, en el badge
  de 42 px del listado y en una línea de texto, sin ajustarla en cada sitio. Con el `em` colgando del
  contenedor (que es 1 rem) el + salía a 9 px al lado de iconos de 24 y parecía un punto.
  ⚠️ En el **badge de 42 px** del listado los dos iconos entran justos: ahí van algo más pequeños y
  más juntos (medido: 36 px, sin desbordar).
  ⚠️⚠️ **CADA ASISTENTE CARGA SU MOTOR**: el parcial tiene que traer su
  `<script src=".../js/step_wizard.js">` (como los de promoción, giras y ciclos). Sin él el modal se
  abre **EN BLANCO y no avanza** —`.sw-step` está oculto por CSS (`display:none`) y es ese JS quien
  activa el primer paso, pinta el progreso y cablea «Siguiente»— y no salta ningún error: parece que
  el botón «no hace nada» (bug real del asistente de proyectos).
  ⚠️ `step_wizard.js` NO expone `swNext`: el auto-avance se pide con **`data-sw-advance`** en el
  propio control (y los pasos que no tocan se saltan con `data-sw-when`, que además DESHABILITA sus
  campos: si no, el navegador se para a validar un `required` invisible).
  ⚠️ Si NINGÚN artista sale como «activo» (nadie con contrato discográfico) se enseñan **todos** desde
  el principio: la rejilla del primer paso no puede quedarse vacía.
  ⚠️ **`dict()` sobre las tuplas de tres del catálogo revienta en la plantilla**: el mapa
  clave→etiqueta se pasa hecho (`kind_labels`).
  ⚠️ **`DiscoProject.song` necesita `foreign_keys=[song_id]`**: hay DOS caminos a `songs` (el tema del
  videoclip y `release_song_id`, el lanzamiento creado) y SQLAlchemy no arranca sin decírselo.
  ⚠️ La sección nueva hay que añadirla a la **lista blanca de `section`** de `discografica_view`, al
  catálogo de permisos (`discografica.proyectos`) y a los DOS mapeos de endpoints (los suyos se
  llaman `disco_project_*`, fuera del prefijo `discografica_`).

- - ⚠️⚠️ **UN LOGO DE EMPRESA DEL GRUPO NO LLEVA FONDO BLANCO** (ago 2026). Muchos se suben en PNG
  con el blanco horneado y en la app se veían como un **rectángulo blanco** sobre el fondo gris —y
  encima el helper `company_logo()` le ponía `background:#fff`, así que ni un PNG transparente se
  libraba—. Ahora: sin ese `background`, y el logo se sirve por **`logo_clean_png`**
  (`/logo-limpio.png?u=…`), que le quita el fondo en TRANSPARENTE.
  ⚠️ Solo se quita el blanco **CONECTADO A LOS BORDES** (un relleno desde las cuatro esquinas), así
  que lo blanco de DENTRO del logo —una letra, un hueco— no se toca (comprobado).
  ⚠️ Solo admite imágenes **NUESTRAS** (`_is_own_media_url`: nuestro Storage o nuestro dominio): sin
  eso sería un **proxy de imágenes abierto**. Si no se puede limpiar, redirige al original.
  · Punto único **`_logo_clean_url`**, ya en `company_logo()` y en los logos de Syncros (envío,
  vista previa y landing, en absoluto porque también van por correo). Cacheado en memoria.

- **Simulaciones — conversión y archivado (jul 2026)**: convertir una simulación **vuelca** los datos,
  no solo crea el contenedor. `simulation_convert` crea el destino (`PurchasedTour`/`CycleFestival`, o
  nada en «concierto») y **una fecha simulada = un `Concert` real en BORRADOR** vía
  `_simulation_dump_activity`: recinto, artista (`_sim_activity_artist_id`), empresa del grupo, aforo y
  `ConcertTicketType` (`_sim_ticket_rows`, nombres únicos porque hay UNIQUE(concert_id,name) y en la
  simulación se repite «General» en Pista/Grada), invitaciones en `ticketing_payload.ticket_types`
  (de ahí las lee `_invitation_category_legacy_rows`), `ConcertCache` (`_sim_cache_rows`: los VARIABLE
  se traducen a la `config.option` de la ficha —PCT_FROM_TICKETS / PCT_FROM_REVENUE /
  FIXED_PER_TICKET_FROM— y los matices fiscales que el concierto no modela se guardan en `config`),
  `ConcertZoneAgent` (`_sim_commission_rows`, un MEDIO se espeja a tercero con
  `_ensure_promoter_for_media`), participaciones sobre **PROFIT** (`_sim_partner_share_rows`) y
  `ConcertBudgetItem` (`_sim_budget_rows`). ⚠️ En `ConcertBudgetItem`, `amount_net`/`amount_gross` son
  el **TOTAL** de la partida (así los suma la ficha); `quantity` es solo informativo — no multiplicar.
  Los gastos del contenedor `is_shared` van a `payload.general.expenses` del grupo. `sale_type`:
  GIRAS_COMPRADAS en gira, si no `_sim_sale_type` (PARTICIPADOS si hay socios de verdad).
  **Archivado**: `Simulation.status='ARCHIVED'` + `settings['converted']` {kind,target_id,target_name,
  concert_ids,at} (`_simulation_mark_converted`). El listado muestra por defecto solo las activas;
  botón **«Ver archivadas»** (`?archivadas=1`) y, en los 3 puntitos, **Archivar/Restaurar**
  (`simulation_archive`, archivar ≠ borrar). `_simulation_converted_info` resuelve el enlace a lo
  creado y avisa si ya no existe. **Si no se pudo crear NINGUNA fecha** (todas por confirmar o sin
  artista) se hace rollback: ni se archiva ni queda un contenedor vacío.
- **FICHA DE ACTIVIDAD · pestaña «INICIO» con el proceso paso a paso** (ago 2026): la PRIMERA
  pestaña de la ficha, igual que las tareas pendientes de un proyecto discográfico. Motor
  **`_concert_task_board`** (solo se calcula en su pestaña): las **fases de la petición**
  (`_peticion_accept_tasks`) con su estado —**hecha** (con cuándo y quién), **pendiente** o
  **bloqueada** (con el motivo)— más **lo propio de la actividad** (pendiente de confirmar, sin
  contrato, pendiente de anunciar, sin activar la venta y —si no viene de una petición— activar
  producción e informar al artista), que son «del departamento» y por eso no llevan dueño.
  · **LA CAMPANITA** (`concert_task_nudge`, `POST /conciertos/<cid>/tareas/<key>/reclamar`):
  reclamar una tarea a quien la tiene. Le llega un aviso **«X te reclama una tarea · X te pide que
  por favor termines «\<tarea\>», que está pendiente»** con enlace a esta pestaña. No cambia nada de
  la actividad: solo avisa. Solo sale cuando la tarea **es de otra persona** y no está bloqueada; a
  uno mismo no se le reclama y una tarea sin dueño no se puede reclamar (se dice por qué).
  ⚠️ El endpoint va en **`SUPPORT_ACTION_ENDPOINTS`**: reclamar es transversal (lo hace producción,
  el sello, dirección…), no solo contratación.
  ⚠️ La pestaña nueva hay que añadirla a la **lista blanca de `tab`** de `concert_detail_view`: si no,
  cae en «general» y el panel no se pinta **sin dar ningún error**.

- **Asistentes por pasos (UX)**: cuando se pincha una opción de un paso que **no requiere más datos**,
  **auto-avanzar** al siguiente paso sin pulsar "Siguiente" (menos clics). Implementado en el asistente
  de invitaciones (`invitaciones.html`, helpers `goStep`/`getStep`): pasos de artista, evento,
  "¿Para quién son?" y "Entrega". **No** aplicar en pasos **multicampo** (asistente de conciertos
  `_concert_wizard_modal.html`, alta de medios `media_outlets.html`), que conservan "Siguiente".
- **El asistente «+ Actividad» admite ARTISTA o EVENTO**: primer paso «¿De quién es la actividad?»
  (`subject_kind` ARTIST|EVENT). Con EVENTO se busca en `api_search_events` o se crea al momento con el
  `+` (`data-quick-create="event"`), y `concert_wizard_create` espeja el evento como artista
  (`_ensure_artist_for_event`) y guarda `Concert.event_id`. Los espejos de evento se filtran de los
  selectores de artista (asistente, /conciertos, Inicio). En los **calendarios** los eventos salen como
  si fueran artistas (el espejo lleva nombre y logo del evento); en el selector del botón + de la
  agenda solo aparecen los que tienen algo activo, y al elegir uno el asistente se abre ya en modo
  EVENTO.
- **Punto de empate de una actividad** (`_concert_break_even_info`, en la pestaña **Resultado**, que es
  donde se enseña): manda **lo que ponga contratación a mano** (`Concert.break_even_ticket`); si no, los
  **gastos CONSOLIDADOS de la bolsa** (`_concert_bag_expense_totals`, se actualiza solo según se
  consolidan); y si no, el **presupuesto** (`ConcertBudgetItem`). Se calcula con el mismo motor que
  el Resultado (`_concert_build_calc_data` + `sim_calc`, sustituyendo la producción). Bajo el número se
  dice con qué base está calculado. ⚠️ El **aviso amarillo salta SOLO si el de contratación NO cuadra**
  con el calculado (`mismatch`): si coinciden, o si nadie lo ha puesto a mano, no se avisa de nada. Sin
  ticketing ni previsión de ingresos no se muestra nada.
- **PROMOCIÓN · la ficha se lee como la de una ACTIVIDAD** (ago 2026): misma cabecera
  (`ficha-hero` con foto redonda del artista —clicable con `data-artist-link`—, «eyebrow» de lo que
  es, título + **etiqueta de estado que se pincha** para cambiarlo, `ficha-hero__facts` con iconos y
  la **empresa que factura** arriba a la derecha con su logo) y misma tabla compacta en Información
  (`psum-list psum-list--2col`). Cancelar sigue aparte, dentro del propio desplegable del estado,
  porque avisa a quien la produce.
  · **La FECHA sale de las entrevistas** cuando la promoción no lleva fechas propias
  (`_promo_dates_label`): antes ponía «Sin fechas» teniendo día. Mismo punto único que usa la
  previsualización del enlace.
  · **El MEDIO se enseña solo si es UNO** (`_promo_single_media_label`): con varios ya no identifica
  nada. Lo usan la cabecera y la previsualización.
  · **Previsualización al compartir la hoja de ruta** (`public_roadmap_view`): «**Hoja de ruta
  Promoción · \<artista\>**» y debajo el nombre de la promoción, la fecha y —si es un solo medio— el
  medio. Sin nombre, solo la fecha. ⚠️ `Promotion` **no tiene relación `activities`**: sus
  entrevistas se consultan (`PromotionActivity.promotion_id`).
  · **Si lo que se promociona es EL ARTISTA no se vuelve a preguntar cuál**: ese paso del asistente
  se salta con **`data-sw-skip="1"`** (dimensión nueva de `step_wizard.js`, independiente de
  `data-sw-mode`) y el sujeto se apunta solo con el artista ya elegido.
  · **La empresa del grupo se elige con su LOGO** (`select-with-thumbs` + `data-logo`), en el
  asistente de promoción, en el de marketing y en la ficha.
  ⚠️ **El asistente de promoción se incluye en TODAS las bandejas** (pedir promoción lo puede hacer
  cualquiera): sus datos NO pueden depender de estar en la de Promoción o, al marcar «requiere
  logística», la lista de producción sale VACÍA (bug real). Y si NADIE tiene el departamento
  «Producción», `_production_people` ofrece a todo el personal: mejor eso que un panel sin nadie.

- ⚠️⚠️ **CANCELAR o APLAZAR una actividad es un PROCESO, no cambiar una etiqueta** (ago 2026).
  Estados nuevos **CANCELADO** y **APLAZADO** (`CONCERT_PROCESS_STATUSES`), a los que **no se llega
  desde el desplegable de estado**: `concert_quick_status` los rebota con un 409 y el enlace a su
  pantalla (`concert_cancel_view`, `templates/concert_cancel.html`), donde se pregunta:
  · **EL MOTIVO** (obligatorio: es lo que se le cuenta al artista y a producción);
  · si hay **CACHÉ**, **¿se cobra?** — total o parcial, con su importe o su %, **enseñando el que
    está pactado** (`_concert_cache_summary`) para no ir a mirarlo a otra pestaña;
  · **¿el promotor cubre los gastos?** — todos o una parte, diciendo cuál;
  · al APLAZAR, **si se sabe la nueva fecha** o queda TBC.
  ⚠️⚠️ **AVISAR AL ARTISTA ES OBLIGATORIO Y ES LO QUE LO HACE EFECTIVO**: la pantalla NO cambia el
  estado, solo guarda lo decidido y lleva al aviso de siempre (con la nota **ya escrita** con el
  motivo y el resumen, `_cancel_notice_note`). El estado cambia en `_cancel_apply`, al enviarlo.
  · **APLAZADO con fecha nueva**: la actividad **se mueve a ese día y vuelve a ser una RESERVA**
    (hay que confirmarla otra vez por el camino de siempre, y su firma de aviso se invalida). Sin
    fecha se queda en APLAZADO (TBC).
  · **LAS TAREAS DE PRODUCCIÓN** (`CANCEL_TASKS`) son **SUBTAREAS de la tarea de la actividad** en la
    pestaña «Inicio» de su ficha —lo de una cancelación es UN trabajo con varias partes, no cuatro
    tareas sueltas—: avisar a los proveedores · **cancelar las reservas** (solo al aplazar) ·
    informar al personal · **enviar los gastos al promotor** (solo si los cubre) · **cerrar la
    bolsa** (solo al cancelar), con **15 DÍAS de plazo** (`CANCEL_BAG_DAYS`, en rojo si se pasa).
  · **Informar al personal** tiene su pop-up con la opción de avisar a **TODA la oficina**; sin
    marcarla, solo a quien está en la HOJA DE RUTA (a quien de verdad le cambia el día).
    ⚠️ **Al artista no**: a él se le avisa por su canal y no es personal de la casa.
  · A producción le llega su aviso (kind `PRODUCCION`, ref `CONCERT_CANCEL`) **con el listado de lo
    que hay que hacer** y el plazo de la bolsa; se cierra solo cuando no queda nada (`_notify_resolve`).
  ⚠️ **Una actividad CANCELADA deja de reclamar trabajo**: no sale en las tareas de Contratación ni
  pide contrato, anuncio o venta en su ficha. Lo único que queda son las tareas de la cancelación.
  ⚠️ **Se puede DESHACER** (vuelve a RESERVADO) y **no se borra lo que pasó**: queda en `history`
  con quién y cuándo — una actividad que se canceló y se recuperó es información, no un error.
  · Todo vive en **`Concert.cancellation_payload`** (JSONB). ⚠️ Se marca con `flag_modified`: el
  patrón de leer-copiar-reasignar **no escribe la segunda vez en la misma petición** (bug conocido).

- ⚠️⚠️ **A UN ARTISTA (O A UN EVENTO) SOLO SE LE MANDA LO QUE ESTÉ CONFIGURADO EN SUS
  «NOTIFICACIONES»** (sep 2026, lo pidió Dani). Se acabó el respaldo al **correo suelto del
  artista**: `_artist_notification_emails` y `_artist_notification_recipients` nacen con
  **`fallback=False`**, así que quien no esté marcado en un canal **no recibe esa comunicación**.
  Un correo genérico viejo recibiendo una liquidación es peor que no mandarla.
  ⚠️ Sin nadie configurado **no se manda nada, pero NO se calla**: la ficha del artista lo avisa en
  ÁMBAR («no se le manda ninguna comunicación»), la pantalla del aviso lo dice antes de enviar y el
  envío de liquidaciones responde «no hay nadie configurado… añádelo en Notificaciones».
  ⚠️ **En el LOG no se avisa**: ese punto único se llama también al PINTAR (la ficha de una canción,
  la de un álbum), así que un `warning` ahí llena el log de ruido y lo hace inútil. Avisa **quien
  ENVÍA**, no quien lee.
  · **LIQUIDACIONES de royalties y CERTIFICACIONES**: los destinatarios por defecto son **solo** los
  configurados (`only_configured` en `_beneficiary_email_delivery_data`, que respetan también
  «Enviar todas» y el envío individual: ya no caen a `suggested_recipients`). ⚠️ Los correos que
  conocemos del artista **se siguen OFRECIENDO** para marcarlos a mano: una cosa es que no se mande
  solo y otra que no se pueda elegir. ⚠️ Con un **TERCERO** como beneficiario no hay módulo que
  configurar: ahí se sigue como siempre.
  · ⚠️⚠️ **EL INTEGRANTE SE ELIGE Y SE RELLENA ENTERO** (bug real: «pinchas en el miembro y pone el
  nombre pero no el email ni el teléfono, y sí están introducidos»). La tarjeta del integrante solo
  llevaba el id y el nombre. Punto único **`_artist_notification_suggestions`**: devuelve cada
  integrante con **su correo y su teléfono** —los de SU ficha de tercero, con `_promoter_email_phone`
  (en `Promoter` son `contact_email`/`contact_phone`)—, su foto y su nombre, **en BLOQUE** (una
  consulta, no una por integrante). Se ven en la propia tarjeta y al pincharla se vuelcan.
  ⚠️ Los integrantes **SIN ficha de tercero se ofrecen igual** (viajan como `artist_person_id`) y se
  les crea al elegirlos con `_ensure_promoter_for_artist_person`: una persona del artista ES un
  tercero, y no puede quedarse fuera de las comunicaciones por no tener ficha todavía.
  · ⚠️⚠️ **UN EVENTO TAMBIÉN TIENE SUS COMUNICACIONES Y SUS INTEGRANTES**, en la pestaña «Datos» de
  su ficha: son las de su **artista ESPEJO** (es lo que llevan sus actividades en `Concert.artist_id`,
  así que es donde las busca toda la app). El espejo **se sigue sin ver** (hereda el nombre y el logo
  del evento) y se prepara al abrir esa pestaña (`_ensure_artist_for_event`).
  ⚠️ El parcial de integrantes vuelve a donde se pinta (`members_back_url`), no siempre a la ficha
  del artista. Y **`CAN_EDIT_ARTISTS_STATIONS` NO se pisa** con `can_edit_catalogs()`: es el permiso
  que EXIGEN esos endpoints, así que pisarlo enseñaría botones que darían un 403.
  · ⚠️⚠️ **UNA COMUNICACIÓN QUE NO SALE POR ESO SE DICE** (`_artist_notice_missing`, kind
  **`SIN_NOTIFICACIONES`**): si al ir a mandar algo no hay nadie en ese canal, le llega un aviso por
  la campanita a **quien lleva al artista** (`_artist_sello_user_ids`) diciendo **QUÉ no ha salido** y
  con el **enlace a su ficha**. Sin esto, el silencio se descubre semanas después.
  ⚠️ Lo dispara **quien va a ENVIAR**, pasando **`aviso="el plazo de entrega de materiales"`** a
  `_artist_notification_emails` / `_recipients`: **sin ese parámetro no se avisa**, porque esos dos
  puntos únicos se llaman también al PINTAR (la ficha de una canción, la de un álbum) y saldría un
  aviso por cada carga. Al cablear un envío nuevo a un artista, pasarlo.
  ⚠️ **No se repite** mientras el aviso siga sin leer (`ref_type='ARTIST_NOTIF'`,
  `ref_id='<artista>:<canal>'`) y **se cierra solo** al configurar a alguien en ese canal
  (`_notify_resolve` desde el guardado de «Notificaciones»).
  ⚠️⚠️ **HACE FALTA UN CONTEXTO DE PETICIÓN** (`_soldout_app_context`), no solo de aplicación:
  `_notify_user` mira quién actúa con `_current_user_state()` → `session` y revienta desde un CRON o
  un HILO — que es justo donde más falta hace (los recordatorios de publicación, el plazo de
  materiales). Y se le pasa **`actor_user_id=""`**: esto lo dispara un envío, no una persona.
  · **Y se repasan de una vez**: módulo de Inicio **«Artistas sin notificaciones configuradas»**
  (`HOME_ARTISTS_NO_NOTIF` ← `_home_artists_without_notifications`), con los artistas **ACTIVOS**
  (`_active_artist_ids`) que no tienen a NADIE, su foto y el botón a su ficha.
  ⚠️ Va **FUERA de la compuerta de departamento** de `home.html` (con `_home`, no con `_dept`): esto
  lo tiene que ver también **dirección**, que si no se quedaría sin enterarse. Y en **dos consultas**,
  no una por artista.

- **AVISO AL ARTISTA DE UNA ACTIVIDAD** (ago 2026). Antes de CONFIRMAR una actividad hay que
  habérsela comunicado al artista.
  · **Dos canales nuevos** en la configuración de notificaciones del artista (en cabeza de
  `ARTIST_NOTIFICATION_CHANNELS`): **ACTIVIDADES_CACHE** («Nuevas actividades con caché») y
  **ACTIVIDADES_SIN_CACHE** («Actividades sin caché»). Punto único
  **`_activity_notification_channel`**: si la actividad lleva caché se avisa a los primeros y si no a
  los segundos. **`_concert_has_cache`**: manda lo apuntado (`ConcertCache` con importe o %) y, si no
  hay filas, el apunte del alta (`sale_type == 'VENDIDO'` = «¿Tiene caché?» Sí).
  ⚠️ Decisión de Dani: **NO hay validación del artista**, basta con avisarle.
  · El contacto tiene ahora **teléfono** (`ArtistNotificationContact.phone`, cae al del tercero) para
  WhatsApp y SMS, y **`_artist_notification_recipients`** devuelve nombre + correo + teléfono
  (hermano de `_artist_notification_emails`, que solo da correos).
  · **UN SOLO MOTOR para los tres canales**: `_activity_notice_html(ctx, note, hidden, preview)`
  genera el HTML con **estilos en línea**, y ese mismo HTML es el del correo, el de la **página
  pública** que se manda por WhatsApp/SMS (`public_activity_notice_view`, `/actividad/<token>`) y el
  de la vista previa. Contenido, en orden: logo de la empresa del grupo arriba a la **derecha** (si la
  actividad no tiene, el de la casa), título centrado (`ACTIVITY_NOTICE_KINDS`: «Confirmación nueva
  actividad» · «Cambios en la actividad» · «Actividad cancelada»), la **nota** si la hay, la
  **cabecera de la actividad** (`_contract_sheet_hero_rows`, la misma de la ficha), la **barra de
  botones** (de momento solo «Ver hoja de ruta»; los futuros van a su derecha), **«Descripción:»**
  con lo que tiene que hacer el artista (M&G, ¿canta?, canciones **en orden y con portada**,
  formación, duración, otros compromisos) y **«Condiciones»** por módulos
  (`ACTIVITY_NOTICE_MODULES`): **Caché** (si no hay, dice «Sin Caché»), lo que cubre el promotor,
  formato y equipamiento. ⚠️ En un **concierto** (o sin rellenar) no sale ni la descripción ni su
  título, como se pidió.
  ⚠️ **`'<div>' + escape(x)` ESCAPA el HTML de la izquierda** (Markup en la derecha): el aviso salía
  como texto (bug real). Dentro del motor se escapa con un `esc()` local que devuelve `str`.
  · ⚠️⚠️ **EL SMS LO MANDA LA APP** (sep 2026): si la pasarela está configurada (**Integraciones →
  SMS**, la MISMA de los envíos a compradores) el aviso sale del servidor —un SMS por persona, con el
  teléfono normalizado y el enlace acortado— y **no se abre la app de mensajes de nadie**; sin
  pasarela se sigue abriendo, que es lo que se hacía antes de tenerla. Lo decide `_sms_available()`
  y **la pantalla lo DICE** al elegir el canal (`sms_gateway`): elegir SMS tiene que significar lo
  que se ve. **WhatsApp siempre abre la app** (no hay pasarela).
  ⚠️ Si el SMS **no sale para nadie** se retira el aviso y se dice el motivo de la pasarela: decir
  «avisado» sin que le haya llegado a nadie es lo peor que puede pasar aquí. ⚠️ Ahí **NO se hace
  `rollback()`**: `_sms_log` apunta el intento en ESA sesión y un rollback se llevaría por delante el
  motivo del fallo — se borra el aviso (`session_db.delete`) y se hace commit.
  ⚠️ **El TEXTO lo compone el SERVIDOR** (`_activity_notice_sms_text` → `sms_text` en el JSON): antes
  lo montaba el navegador, así que con la pasarela de por medio habría habido dos textos distintos.
  · **Vista previa** (`concert_artist_notice_view`, página propia + `concert_artist_notice.html`):
  canal (correo/WhatsApp/SMS, **con el CORREO marcado por defecto**), destinatarios, **nota** que se
  pinta bajo el primer título, y un **OJO por módulo** para dejarlo fuera (`data-notice-eye`; en la previa los ocultos se ven atenuados,
  en el envío no van). Se repinta con `concert_artist_notice_preview` (JSON).
  · **La COMPUERTA está en los CUATRO caminos** que escriben el estado, no solo en la etiqueta:
  `concert_quick_status` (409 con `needs_artist_notice` + `notify_url`; el handler de
  `[data-status-option]` de `scripts.js` **lee el cuerpo** y ofrece avisar), `concert_section_update`
  sección «datos» (guarda el resto y deja el estado como estaba, con el enlace en el aviso),
  `concert_wizard_create` y el alta clásica `POST /conciertos` (nacen **RESERVADAS** en vez de tirar
  el alta). Al avisar con `?confirmar=1` la actividad pasa **sola** a CONFIRMADA.
  · **Un cambio GORDO invalida el aviso**: `_concert_notice_signature` (fecha, hora, recinto, cachés)
  se guarda al avisar; si cambia, la etiqueta vuelve a «Notificar al artista» con «hay cambios» y la
  compuerta salta otra vez. **CANCELAR** (borrar la actividad) también obliga: si el artista estaba
  avisado, `concert_delete_handler` rebota pidiendo comunicar la cancelación.
  ⚠️ **Exenciones**: las actividades de **EVENTO** (`event_id`: su `artist_id` es el espejo, no hay a
  quién avisar) y el **HISTÓRICO** (`_concert_is_legacy`), o no se podrían confirmar nunca.
  · **Queda apuntado**: `Concert.artist_notified_*` (para la etiqueta «Notificado» con **a quién y
  cuándo** al pasar el ratón) y el histórico completo en **`ConcertArtistNotification`**, que
  **congela** en `snapshot` el HTML que se mandó — la página pública enseña eso, no lo de hoy.
  ⚠️ El `public_token` es **opaco** (`_uuid_token`, con su índice UNIQUE), no firmado: un enlace de
  hace dos años sigue valiendo (los firmados a un año ya dieron un bug real).
  · ⚠️ **En ensayos y discográficas se tiraba a la basura** el «¿canta?», las canciones y la
  formación: el asistente las pregunta pero el servidor solo las guardaba en las promocionales. Punto
  único **`_activity_has_performance_detail`** (promocionales + `SIMPLE_ACTIVITY_TYPES`), aplicado en
  los TRES sitios (asistente, `concert_section_update` sección «actividad» y el `is_promo_activity`
  de la ficha).
  · **Etiquetas nuevas en Python**: `CACHE_VARIABLE_OPTION_LABELS` (las 6 condiciones de un caché
  variable, que solo vivían en `concert_form.js` — si se toca una, se toca la otra) y
  `_concert_equipment_label` (la cadena del equipamiento, que estaba copiada a mano en tres sitios).
  · **«EL ARTISTA YA FUE INFORMADO»** (ago 2026): en una actividad **que YA HA PASADO** no tiene
  sentido mandar un aviso de algo que ya ocurrió, así que la compuerta ofrece **dejarlo apuntado y
  seguir con el estado**. `_concert_notice_can_ack` (el último día —`end_date` o `date`— anterior a
  hoy; en una futura NO se ofrece y el servidor lo vuelve a comprobar) alimenta `can_ack`/`ack_url`
  del gate; el endpoint es **`concert_artist_notice_ack`** (`POST
  /conciertos/<cid>/avisar-artista/ya-informado`), que apunta el aviso con canal **MANUAL**, la misma
  FIRMA (así un cambio gordo posterior vuelve a pedirlo) y pasa la actividad a CONFIRMADA. Sale como
  botón en la pantalla del aviso y, al pinchar la etiqueta de estado, en un **pop-up de tres opciones**
  (`pedirDecisionAviso` en `scripts.js`: con un `confirm()` no caben; sin Bootstrap se cae al de
  siempre). Queda marcado en `artist_notified_to = [{"manual": true}]` → `_concert_notice_state`
  devuelve `manual` y la etiqueta dice «Notificado (a mano)».

- ⚠️⚠️ **ANUNCIAR Y SACAR A LA VENTA LE DAN TRABAJO A DIGITAL, Y NADIE SE LO DECÍA** (sep 2026).
  Las dos comunicaciones que salen de casa son el pistoletazo de dos trabajos suyos:
  · se **ANUNCIA** la actividad → hay que **anunciarla en redes**;
  · **SALE A LA VENTA** → hay que **subir los enlaces de venta**.
  Ahora, en las dos, a digital le llega **EL MISMO CORREO** que a los demás y le entra su **tarea
  pendiente**, que **él mismo marca como hecha** y entonces desaparece.
  · **Punto único `_digital_task_ask` / `_digital_task_done`** (+ el catálogo `DIGITAL_TASKS`), y el
  estado en **`Concert.digital_payload`**: `asked_at` sin `done_at` = sigue pendiente. Se mira el
  DATO, no una marca paralela.
  · **El correo**: en el ANUNCIO se le manda el **mismo HTML** que se acaba de mandar al artista (el
  aviso, con su cabecera y sus carteles); en la SALIDA A LA VENTA no hace falta repetirlo porque
  **digital entra en `_sale_notice_recipients`** con su papel «Digital» (y su casilla, como todos),
  así que ya le llega con la tabla de canales de venta dentro, que es justo lo que necesita.
  ⚠️ La tarea en la app va con **`email=False`**: el correo ya ha salido y `_notify_user` mandaría
  otro distinto.
  · **Dónde lo ve**: «Mis tareas pendientes» de su Inicio (`HOME_DIGITAL_TASKS`) y el **cuadro de
  dirección** (área Digital). El botón **«Hecho»** es genérico del módulo de tareas (`done_url` en la
  subtarea): cuando lo que falta es DECIR QUE YA ESTÁ —se hace fuera de la app—, se marca desde
  Inicio sin entrar en la ficha.
  · **QUIÉN es digital**: el departamento **«Redes sociales»** (`DIGITAL_DEPARTMENT`), que es como se
  llama en la ficha de cada uno. ⚠️ **No se cae en otro departamento** si no hay nadie: se apunta en
  el log y la tarea queda, pero mandársela a quien no lleva las redes solo haría ruido.
  · **Permisos**: marcarla es suyo y su llave es el **DEPARTAMENTO**, no un permiso de sección
  (digital no tiene por qué poder editar Contratación, que es de quien es la ficha): regla propia en
  `_support_endpoint_decision` (`concert_digital_task_done` + `_user_is_digital`), y el endpoint lo
  vuelve a comprobar. Comprobado: contratación intentando marcarla se lleva un **403**.
  ⚠️ Si la actividad se vuelve a anunciar (o se reprograma la venta) **después** de haberla dado por
  hecha, se le vuelve a pedir: es trabajo nuevo. Mientras siga pendiente **no se repite**.

- **ELIMINAR UNA ACTIVIDAD · la RUEDA de la cabecera** (ago 2026). La ficha tiene arriba a la derecha
  un botón de **rueda** (`.ficha-hero__gear`) con lo que se hace de tarde en tarde: asignar/cambiar
  quién lleva la producción, avisar al artista y **Eliminar actividad**.
  · Borrar exige **escribir ELIMINAR** (`CONCERT_DELETE_WORD`, comprobado también en el servidor: un
  POST sin la palabra no borra nada) y se dice que se lleva por delante invitaciones, entradas,
  cachés, contratos, presupuesto, cartelería, hoja de ruta y fotos.
  · **A quién se le había comunicado ya** lo resuelve **`_concert_notified_parties`** —con FOTO y
  nombre— mirando los tres sitios desde los que sale la actividad de casa: los avisos al artista
  (`ConcertArtistNotification`, con la foto resuelta EN VIVO contra los contactos del artista, porque
  el aviso guardado no la lleva), el promotor al que se le pidió la **ficha de contratación** y a
  quien se le pidió la **cartelería**. El pop-up ofrece **notificar la cancelación con una nota**
  (`_activity_cancellation_notify`, el mismo motor de avisos con `kind='CANCELACION'`) y borrar, o
  **eliminar sin notificar**.
  ⚠️ Si el correo de cancelación NO sale, **la actividad NO se borra** (si no, se perdería sin que
  nadie se hubiera enterado). Y si a quien lo sabía no le consta correo, el botón de notificar no se
  ofrece (`notified_can_email`) en vez de dejar un botón que no puede enviar nada.
  ⚠️ En una CANCELACIÓN el aviso **no lleva el botón «Ver hoja de ruta»**: la actividad se cae.
  ⚠️ Las **FOTOS y vídeos** son polimórficos (`owner_type`/`owner_id`, **sin clave ajena**): no
  cascadean, así que el borrado las limpia a mano. El resto de hijos sí tienen ON DELETE CASCADE.
  ⚠️ El borrado del listado antiguo (`concerts.html`) es **código muerto** (esa pantalla solo se usa
  para Facturación); el único camino vivo es el de la ficha.

- **FICHA DE CONTRATACIÓN · una sola, y lo del promotor aparte** (ago 2026). La pestaña «Ficha
  promotor» se **retiró**: era la misma ficha duplicada (y `?tab=ficha` cae a «general»).
  · ⚠️ **`ConcertContractSheet` es UNA fila por actividad** y antes el promotor escribía en el MISMO
  `data` que la casa, así que **se pisaban**. Ahora lo que manda él va a **`promoter_data`** (+
  `promoter_reviewed_at`), y `data` sigue siendo la ficha de la casa.
  · En la ficha sale un **aviso amarillo** («El promotor ha cumplimentado la ficha del promotor») con
  el botón **«Revisar datos»** mientras haya `promoter_data` sin revisar (`promoter_sheet_pending`).
  · **`concert_contract_sheet_review`** es una **pantalla partida campo a campo**
  (`concert_contract_merge.html`, clases `.cmp-*`): a la izquierda lo nuestro, a la derecha lo suyo, se
  pincha la columna que se queda (por defecto lo suyo donde no teníamos nada, lo nuestro donde ya
  había dato) y al guardar se reemplaza la ficha **y** se aplican al Concert los campos que le tocan.
  · **Un solo catálogo de campos**: `CONTRACT_SHEET_GROUPS` + `CONTRACT_SHEET_CHOICES` (con
  `CONTRACT_SHEET_LABELS`) es la fuente de verdad de qué campos hay, cómo se llaman y en qué módulo
  van; lo usan el formulario, la vista consolidada, el PDF y la comparación. Un campo nuevo se añade
  UNA vez. Helpers: `_contract_sheet_show` (cómo se enseña cada tipo), `_contract_sheet_compare_rows`
  y `_contract_sheet_compare_groups`.
  · ⚠️ Editar la ficha por dentro (`concert_contract_sheet_edit`) **ya no la pone en RECEIVED**: antes
  hacía pasar por «el promotor la ha enviado» y disparaba el aviso.
  · Al recibirla se **avisa** a quien la pidió y a Contratación (`_contract_sheet_notify_received`).

- **El FORMULARIO del promotor, por módulos** (ago 2026, `concert_contract_public.html`, clases
  `.csheet*`): logo de la empresa del grupo arriba a la **derecha**, título centrado «Solicitud ficha
  de contratación», el texto de contratación y **la MISMA cabecera de la actividad** que su ficha
  (`_contract_sheet_hero_rows`, compartida con el correo). Seis módulos con su icono:
  **promotor** (datos que ya tenemos + dirección FISCAL con autocompletado `data-address-autocomplete`
  + «la factura otra empresa promotora» que busca por CIF con **`public_contract_sheet_company`**) ·
  **producción local** (quién la hace, con iconos; si es otra empresa, nombre y CIF; y su responsable)
  · **show** (tipo de concierto con iconos —Concierto/Gratuito/Festival/Ciclo, y el nombre si es
  festival o ciclo—, aire libre o cubierto, formato, duración, comienzo, apertura y observaciones) ·
  **ticketing** (aforo; y si NO es gratuito: salida a la venta, puntos de venta, **ticketeras con su
  logo** + otras a mano + taquilla física, desglose de entradas con filas que se añaden, M&G y su
  cantidad, y responsable) · **promoción** · **anuncio y cartelería**.
  ⚠️ Los paneles que se ocultan **DESHABILITAN sus campos** (un campo oculto se envía igual, y un
  `required` invisible impide enviar el formulario).
  ⚠️ El correo de solicitud (`_contract_sheet_request_email_html`) lleva el logo a la derecha, el
  título centrado, el texto y una **viñeta con la cabecera de la actividad** y el botón
  «Cumplimentar ficha de contratación» dentro.
  ⚠️ `concert_contract_sheet_request` **fusiona** `request_payload` en vez de reemplazarlo (ahí viven
  el artista y los datos de la gala que deja el asistente, y `_contract_sheet_prefill` los usa).

- **Módulo de CACHÉS solo si hay cachés**: un evento puede tener artistas con caché o solo socios, así
  que si la actividad no trae ninguno (ni de la simulación ni del alta) no se pinta el módulo: queda un
  botón discreto **«Añadir caché»** que abre el formulario (mismo `data-edit-toggle`).
- **La RUEDA de la ficha de una actividad va en la FILA DE BOTONES**, a la derecha del todo
  (`.ficha-quick__gear`), no en la cabecera. Dentro: quién lleva la producción, reenviar el acceso al
  productor externo (solo si lo produce un tercero), avisar al artista y eliminar la actividad.

- **CONTABILIDAD · cada persona lleva SUS EMPRESAS del grupo** (ago 2026,
  `UserProfile.accounting_company_ids`): a la gente de **Contabilidad** se le asignan las empresas del
  grupo que le corresponden y **lo PENDIENTE de contabilizar es solo el de sus empresas** —los cuatro
  tipos (Facturas · Bolsas · Tickets · Sin ticket), sus **contadores** y las **liquidaciones de
  royalties**—. En los filtros de la pestaña hay **«Mis empresas» / «Todas las empresas»**
  (`?empresas=todas`), así que puede ver el resto cuando le haga falta; **lo ya CONTABILIZADO y las
  RETENCIONES se ven siempre completos** (son un archivo y hace falta poder buscar).
  · Es un **reparto de TRABAJO, no un permiso** (como `admin_responsibilities`): no crea recurso en el
  catálogo de accesos. **Sin empresas asignadas se ve TODO** y **dirección también**; y lo que **no es
  de ninguna empresa** (una bolsa sin empresa puesta) lo ven todos — si se filtrara, desaparecería de
  la pantalla de todo el mundo.
  · Motor: **`_accounting_company_scope()`** (las empresas de quien mira; vacío = todas) +
  `company_ids=` en `_accounting_base_query` / `_accounting_counts` / `_accounting_bag_groups` /
  `_royalty_accounting_pending`. ⚠️ Las **liquidaciones se filtran en Python**
  (`_royalty_holded_company`: la de la remesa con la que se pagó y, si no, PIES): no es una columna.
  ⚠️ Los **contadores llevan el mismo filtro** que las filas o el número de la pestaña no cuadraría
  con lo que se ve debajo.
  ⚠️ **«Subir todo a Holded» se ciñe a lo que se está viendo**: el formulario lleva el ámbito
  (`empresas`) y `_accounting_company_scope_from_form` lo aplica, así que nadie sube a Holded los
  documentos de una empresa que no lleva.
  · **AVISO** (`_accounting_company_user_ids`): cuando una bolsa se queda sin nada por pagar y pasa a
  ser cosa de contabilidad (`_bag_close_if_fully_paid`) le llega el aviso a **quien lleva esa empresa**
  (kind `CONTABILIDAD`, `ref_type='BAG_ACCOUNTING'`); si **nadie la lleva**, a todo el departamento. Al
  contabilizarla, el aviso **se cierra solo** (`_accounting_bag_close_if_done`).
  · Se asigna en la **ficha de personal → Datos** (selector múltiple de empresas del grupo), **solo
  dirección** y solo si la persona está en el departamento Contabilidad. ⚠️ Con **centinela**
  (`accounting_companies_present`): el formulario de la ficha es monolítico y un POST parcial borraría
  el reparto. Y el panel **deshabilita** sus campos al ocultarse (ocultar no basta: se envían igual).

- **EMPRESA DEL GRUPO SIN LOGO → ICONO DE EMPRESA + NOMBRE** (ago 2026). Globales
  **`company_logo(empresa, size=, cls=)`** y **`company_chip(...)`** (en `inject_globals`): pintan el
  logo y, si la empresa todavía no tiene, un **icono de edificio** (`.co-logo--empty`) conservando el
  hueco, con el nombre al lado en el chip.
  ⚠️ Antes se caía al logo de **Treinta y Tres / PIES**, que es PEOR que no enseñar nada: una empresa
  recién creada aparecía con el logo de OTRA del grupo. Aplicado en `/empresas`, la ficha de la
  empresa, administración (a favor y remesas), la vista de conciertos y ventas por empresa; en los
  selectores con miniatura el `data-logo` se queda vacío en vez de apuntar al logo de la casa.
  ⚠️ En las páginas PÚBLICAS (ficha de contratación, cartelería, correos) el respaldo al logo de la
  casa SÍ se mantiene a propósito: ahí hay que enseñar una marca.

- ⚠️⚠️ **UN AUTOR QUE ES INTEGRANTE DE UN ARTISTA = UNA SOLA FICHA** (bug de dinero, ago 2026).
  Los autores de una obra casi nunca son «el artista»: son las PERSONAS que forman parte de él, y el
  contrato (editorial, discográfico) se firma con el ARTISTA y se les aplica a ellas. Si esa persona
  tenía **DOS fichas** —la del integrante y otra suelta creada al darla de alta como autora— el
  autor de la canción apuntaba a la suelta, que no es integrante de nadie, y **no se le detectaban
  las condiciones del contrato**: se quedaba sin su reparto editorial y sin lo que le toca en
  facturación y royalties.
  · Ahora las fichas **se unen solas**: punto único **`_artist_person_unify`** (del integrante a su
  tercero) y **`_promoter_member_unify`** (al revés), que llaman el alta y la edición de un
  integrante, el guardado de un autor, el volcado de LC y el relleno puntual
  **`_artist_members_unify_backfill_once`** (marca `artist_member_unify_v1`).
  · **La fusión re-apunta todo** con el motor que ya existía (`_merge_repoint_references`) y **solo
  COMPLETA los huecos** del que se queda: un dato ya escrito no se pisa nunca.
  · **El NICK pasa a ser el nombre del ARTISTA solo si tiene UN único integrante**
  (`_artist_solo_name`): con varios, el nombre del artista no identifica a ninguno. El nombre, los
  apellidos y el DNI son SIEMPRE los oficiales de la persona (es quien firma y quien factura).
  ⚠️ Si ese nick ya lo tiene otro tercero **no se toca nada**: el nick se puede repetir (ver
  `docs/app/terceros-medios.md`), pero ponerlo a mano es una cosa y que la app renombre una ficha
  sola por detrás para que se llame como otra, otra muy distinta.
  ⚠️ **Solo se une lo que es la MISMA persona sin lugar a dudas** (`_promoter_duplicates_of`): mismo
  DNI, o mismo nombre completo **sin un DNI que lo desmienta**. Dos personas distintas pueden
  llamarse igual, y fundirlas sería mucho peor que dejar el duplicado.
  · **El buscador de autores busca en terceros Y en integrantes** (`api_search_authors`,
  `/api/search/autores`, en `SUPPORT_READ_ENDPOINTS`): los que no tienen ficha viajan como
  `artist_person_id` y se les crea la suya YA VINCULADA al elegirlos. El typeahead admite ahora
  `opciones.extra` (campos del resultado a otros ocultos) y pinta un **subtítulo** («Integrante de
  Los Ñus»).
  ⚠️ **`_promoter_member_artist_ids` usaba `g` sin protección** y reventaba con «Working outside of
  application context» al llamarlo desde el relleno del arranque o desde un hilo (bug real).
  · Probado con la app real: el autor integrante de OTRA banda recibía el contrato de la banda de la
  canción (70/30) y ahora recibe el suyo (40/60); el solista queda con el nick del artista y el
  nombre oficial intacto; y de dos fichas queda una.

- ⚠️ **FICHA DEL ARTISTA · UN SOLO MÓDULO de datos y documentos por integrante** (bug real, ago
  2026): se pintaba el módulo común (`_person_identity_summary.html`, el mismo que en personal y en
  tercero) **y además** un bloque propio con el DNI, el email, el teléfono, las pastillas y las
  etiquetas de documentos, así que **todo salía dos veces**. Queda solo el módulo común; lo que era
  del integrante y él no trae (el aviso de que aún no tiene ficha y sus preferencias de viaje) se
  añade debajo.

- ⚠️ **Al renombrar la ficha de un solista con el nombre del artista, el NOMBRE OFICIAL tiene que
  quedar escrito** (`_artist_member_apply_nick`): el nick pasa a ser «DePol» y, si el nombre y los
  apellidos se quedan vacíos, la ficha pierde su única clave de identidad y **deja de casar con su
  integrante**, así que la unificación no vuelve a funcionar. Antes solo se rellenaban si faltaban
  LOS DOS; ahora, cada uno por su lado.

- ⚠️ **CONTRATACIÓN · CONCIERTOS: el número de cada artista es el de lo que va a VER** (corregido
  ago 2026). La rejilla de artistas contaba **todos** sus conciertos, incluidos los ya celebrados,
  mientras que el listado enseña por defecto **solo los futuros** (`f_when = {"FUTURE"}`): la
  tarjeta decía «12 conciertos» y dentro había tres. Ahora el contador lleva el **mismo filtro de
  fechas** que el listado, así que también sigue al chip «Pasados» / «Futuros».
  ⚠️ Un artista que solo tenga conciertos pasados **no sale** en la rejilla mientras el filtro sea
  «Futuros» (antes salía y al entrar no había nada); con «Pasados» marcado vuelve a aparecer.
  ⚠️ **OTRAS ACTIVIDADES va igual** (ago 2026): su rejilla agrupa por **artista o evento** y
  enseñaba —y contaba— también lo ya celebrado. Ahora, como Conciertos y como la pestaña de
  Eventos, nace en **«Activas»** (solo lo que está por venir, `Concert.date >= hoy` o sin fecha) con
  el botón **«Todas (con las pasadas)»** (`?pasadas=1`); los chips de TIPO y el número de cada
  sujeto se calculan sobre lo que se está viendo, así que no pueden desparejarse. El filtro viaja en
  los enlaces de la rejilla, de los chips y del «Volver».
  ⚠️ **Giras compradas** y **Festivales/Ciclos** no se han tocado: agrupan por gira o por ciclo (no
  por artista) y ahí el listado y el contador ya dicen lo mismo. **Producción → Activas** y la
  sección **Actividades** ya filtraban por su cuenta.
  ⚠️ El número de la BARRA de pestañas es otra cosa: son las TAREAS pendientes, que ya solo miran
  actividades vivas.

- ⚠️⚠️ **MARKETING · UNA CAMPAÑA DE UNA ACTIVIDAD VA CON LA ACTIVIDAD: su bolsa y su fecha** (sep 2026,
  dos bugs reales: «se cambió la fecha del concierto y no se reflejó en la acción de marketing» y «el
  gasto de la acción no aparece en Marketing de la bolsa de la actividad»).
  · **LA BOLSA ES LA DE LA ACTIVIDAD**: antes cada campaña se creaba su propia bolsa («Marketing ·
  \<artista\>») y el gasto se quedaba en el aire, fuera de la liquidación del concierto. Punto único
  **`_promotion_link_concert_bag`** (desde `_ensure_promotion_bag`): la campaña apunta a la bolsa del
  concierto (`_create_bag_for_concert`, get-or-create) y sus gastos van a la categoría **MARKETING** de
  esa bolsa. Es el MISMO dinero visto desde dos sitios (la acción en Marketing, el gasto en la bolsa) y
  **la bolsa no se cierra hasta que la factura de la acción esté subida** —la factura se sube desde
  Marketing (`marketing_action_document_upload`) y consolida el gasto; `bag_close` ya exigía
  `_bag_expense_is_consolidated`—. Una campaña que ya tenía bolsa propia **mueve sus gastos** a la de
  la actividad y la vieja, vacía, se archiva. ⚠️ Una bolsa de actividad ya en liquidación o archivada
  no se toca: la campaña se queda con la suya.
  ⚠️ Efecto colateral asumido: una acción de marketing sobre un concierto SIN bolsa **le crea la
  bolsa**, así que ese concierto aparece en el listado de Producción (que conserva «las que ya tienen
  bolsa»).
  · **LA FECHA SIGUE A LA ACTIVIDAD**: `_marketing_shift_dates` mueve con el mismo desplazamiento la
  fecha objetivo, el plazo de la campaña y **las acciones que todavía no han pasado** (las ya hechas y
  las canceladas se quedan: lo que se hizo, se hizo ese día), con sus oleadas no finalizadas y su
  `details_json.end_date`; `_marketing_sync_concert_date` lo hace **al guardar la fecha** (la sección
  «Datos» de la ficha y el aplazamiento) y **`_promotion_refresh_from_subject`** lo hace **al pintar**
  (la ficha de la campaña, el listado de Marketing y el panel de la ficha del concierto), como red de
  seguridad para cualquier otro camino. Rehace también el `snapshot` (fecha · recinto).
  ⚠️ `_promotion_request_snapshot_from_source` usa **`url_for`**: fuera de una petición revienta, así
  que el resumen se rehace en su propio `try` y el relleno del arranque
  (`_marketing_concert_bags_relink_once`, marca `marketing_concert_bags_v1`) va con
  `app.test_request_context`. El relleno pasa las campañas de actividad YA existentes a la bolsa de su
  actividad y a su fecha.
  Probado con la app real: la acción va a la bolsa del concierto (MARKETING) · +7 días en el concierto
  → la acción, el plazo y la fecha objetivo se mueven +7 · un cambio por otro camino se recoge al abrir
  la campaña · la bolsa no cierra sin la factura y sí la consolida la subida desde Marketing · una
  campaña vieja con bolsa propia queda enlazada y su bolsa archivada.

- ⚠️⚠️ **«A EMPRESA»: EL PROMOTOR ES LA EMPRESA DEL GRUPO QUE FACTURA** (sep 2026, lo pidió Dani). En
  un concierto con `sale_type == 'EMPRESA'` lo organiza la casa, así que **no se puede elegir un promotor
  externo**: en la sección «Datos» de la ficha el promotor y su sociedad se **esconden y se
  DESHABILITAN** (`applySaleType` en `concert_form.js`; un campo oculto se envía igual) y se dice quién
  promueve; el **servidor lo impone** al guardar (`promoter_id`/`promoter_company_id` a None y
  `group_company_id` = la empresa que factura), como ya hacía el asistente. Punto único de **quién
  promueve tal como se enseña**: **`_concert_promoter_display(concert)`** (global de plantilla
  `concert_promoter_display`): a empresa → la empresa del grupo con su logo; si no, el tercero. Lo usan
  la ficha de contratación (`_concert_contracting_general_rows`, «Promotor: X (empresa del grupo)») y la
  fila del promotor de la pestaña General. `_concert_is_group_promoted` da True también con
  EMPRESA + empresa que factura. Relleno puntual `_empresa_promoter_backfill_once` (marca
  `empresa_promoter_v1`): limpia el promotor externo de los conciertos a empresa que ya existían y les
  pone `group_company_id`.

- ⚠️⚠️⚠️ **EL ASISTENTE DE ACTIVIDAD LEÍA LOS CAMPOS DE OTRO FORMULARIO** (bug real y grave, sep
  2026: «al configurar un evento promocional ya aprobado te vuelve a preguntar el artista, el tipo
  de actividad y todo eso»). Su JS buscaba sus campos con **`document.querySelector('[name=…]')`**,
  y `_concert_wizard_modal.html` se incluye en pantallas donde hay **OTRO formulario con los MISMOS
  nombres** —la ficha de una PETICIÓN trae también el asistente de peticiones, con su
  `activity_type`, su `artist_sings`…—: `document.querySelector` coge **el primero del DOCUMENTO**,
  así que el precumplimentado marcaba el tipo en el asistente de **PETICIONES** y el de la actividad
  se quedaba en «Concierto» (y su `stepSequence()` se decidía con el tipo de la otra pantalla).
  · Punto único **`wzQ`/`wzQA`** (expuestos como `window.app33WzQ`/`app33WzQA` para los IIFE de
  abajo): **todo lo del asistente se busca DENTRO de su propio formulario**. Los 24 selectores por
  `name` están acotados; **un selector nuevo va con `wzQ`, nunca con `document.querySelector`**.
  ⚠️⚠️ **Y EL PROMOTOR se elige por la API del asistente** (`app33ConcertWizard.pickPromoter`), no
  disparando el `change` de su barra de búsqueda: ese listener lo cablea `initPromoterSearch`, que
  **REINTENTA hasta que exista `initTypeahead`**, así que si todavía no estaba el promotor se
  quedaba VACÍO —y, peor, el `change` con el oculto limpio llamaba a `clearMainPromoter` y **lo
  BORRABA**—. Además se le **SIEMBRA lo elegido al buscador** con **`app33TaPick`** (el punto único
  de la casa): sin eso, el `resolveSelection` siguiente no encuentra el texto en el datalist —que
  con imagen se vacía a propósito— y **borra el oculto**.
  · Probado en el navegador con la app real, de punta a punta: una petición de EVENTO PROMOCIONAL
  aprobada se abre en el **paso 14 («Contactos de la actividad»)**, que es el primero que la
  petición no puede contestar, con el **artista, el tipo, la fecha, el municipio y la provincia, el
  promotor, «¿tiene caché?» con su importe, los gastos que cubre y la empresa del grupo YA
  PUESTOS**; al terminar, la actividad queda creada **como EVENTO PROMOCIONAL · CON CACHÉ** y ligada
  a su petición. Los pasos anteriores siguen ahí para repasarlos.

- ⚠️⚠️ **CALENDARIO POR ARTISTA EN EL IPHONE (CalDAV): SE AÑADE Y SE BORRA, Y SE AVISA** (sep 2026).
  Cada persona pone en su iPhone, iPad o Mac una **cuenta CalDAV** con su correo y su contraseña de
  la app y le aparece **un calendario por cada artista que lleva** (dirección, todos). Lo que se
  **apunta desde la app de Calendario** entra en la agenda de ese artista y **los demás que lo
  llevan reciben el aviso**.
  · **QUÉ SE PUEDE TOCAR**: las **notas libres** («otros») y los **bloqueos** se crean, se editan y
  **se borran** desde el iPhone (son `ArtistAgendaItem`); lo que **crea la app** —conciertos,
  promociones, lanzamientos, cumpleaños— es **SOLO LECTURA** y su borrado responde **403**. Lo decide
  `_caldav_find_item`, que solo busca en `ArtistAgendaItem`: una actividad no está ahí, así que no
  hay forma de borrarla por error desde el móvil.
  ⚠️⚠️ **SIN `current-user-privilege-set` EL MAC PONE EL CALENDARIO DE SOLO LECTURA** y no ofrece el
  «+» (los clientes de Apple preguntan por los privilegios antes de dejar crear nada). Se anuncian
  en `CALDAV_PRIVILEGE_SET` (`read` · `write` · `write-content` · `write-properties` · `bind` ·
  `unbind`), junto con `<D:owner>`. El control fino lo hace el servidor, no el cliente.
  · **LA HORA**: `_ics_parse_vevent` lee la fecha **y la hora** con **`ics_import.parse_dt`** (el
  punto único: con `TZID` se respeta la hora escrita y **solo lo que viene en UTC (`Z`) se pasa a la
  hora de España**), y el `PUT` la guarda en `start_time`/`end_time`. Antes solo leía la fecha, así
  que un evento creado con hora en el iPhone entraba como de **día completo** y la hora se perdía.
  Se admite también `DURATION` (algunos clientes no mandan `DTEND`).
  ⚠️ En iCal el `DTEND` de un evento de **día completo es EXCLUSIVO**: el último día real es el
  anterior. Comprobado ida y vuelta (1→4 oct entra como 1–3 oct y se devuelve como 1→4).
  · **EL AVISO** (`_caldav_notify`, kind **`AGENDA`**): «Nuevo en la agenda» · «Cambio de fecha en la
  agenda» (con `_agenda_change_label`) · «Quitado de la agenda», con el artista, el título, cuándo y
  «desde la app de Calendario». Va a **los IMPLICADOS** (`_agenda_item_involved`: quien lleva a ese
  artista y quien lo apuntó).
  ⚠️⚠️ **A quien lo hace NO se le avisa, y hay que decirle quién es A MANO** (`actor_user_id=user.id`):
  en CalDAV **no hay sesión de Flask**, así que `_notify_user` no puede saber quién actúa y le
  avisaría también al autor.
  ⚠️⚠️ **EL IPHONE MANDA UN `PUT` TAMBIÉN AL RESINCRONIZAR**: sin comparar el antes con el ahora
  (`_caldav_snapshot`) esto sería una **metralleta de avisos**. Solo se avisa de lo que CAMBIA
  (comprobado: reenviar el mismo evento no genera ninguno).
  ⚠️ Al borrar se avisa **ANTES** (después no se sabría de qué era) y se **resuelve** el aviso
  anterior de esa nota (`_notify_resolve`): un aviso de algo que ya no está no puede quedarse
  esperando. Por correo **no sale de fábrica** (el kind `AGENDA` no está en
  `NOTICE_EMAIL_DEFAULT_KINDS`): dirección lo enciende en «Configurar notificaciones».
  ⚠️ El aviso es *best-effort* y va **después** de responder al `PUT`: si falla, la nota ya está
  guardada y el iPhone no puede quedarse reintentando.
  · **CADA UNO SOLO VE LO SUYO** (`_caldav_user_artists` / `_caldav_can_access`, por
  `assigned_artist_ids`): el calendario de un artista que no llevas da **404**. **Mi calendario** y
  el **Calendario general de oficina** NO salen por CalDAV a propósito (no son artistas, y sus datos
  son personales de la oficina).
  ⚠️⚠️⚠️ **EN RENDER NO SE PUEDE USAR: Cloudflare corta `PROPFIND` con un 405** (verificado otra vez
  en sep 2026) y iOS verifica la cuenta con un `PROPFIND` → «no se puede verificar la cuenta». El
  servidor está bien; es la infraestructura. Por eso **desde el 15-sep-2026 corre en un 2º host en
  Fly.io** (`radio-spins-caldav`, Frankfurt, `CALDAV_ONLY=1`, el MISMO código y la misma BD): estado,
  pasos y lo que salió mal en **`DEPLOY_CALDAV.md`**. ⚠️ **Cada push que toque `app.py` exige además
  `fly deploy`**. **Prueba de fuego**: `PROPFIND /caldav/` **sin credenciales da 401** (la petición
  llega a la app; en Render da 405) y con ellas **207**.
  ⚠️⚠️ **512 MB NO BASTAN**: el worker moría por OOM **en bucle** al importar `app.py` → la máquina
  va con **1 GB** y `Dockerfile.caldav` **precompila el bytecode** (compilar 158k líneas en cada
  arranque era el pico, y tardaba ~90 s en una CPU compartida). Y el **health check redirigía al
  login**: `caldav_health` no estaba en las listas de públicos, `require_login` lo mandaba a `/login`
  (302 → 404 en ese host), Fly daba la máquina por enferma y **su proxy no le pasaba tráfico**. Ahora
  `_caldav_only_gate` responde el health él mismo (el primer before_request corta la cadena).
  · **Lo que se remató al estrenarlo** (sep 2026, probado con 53 comprobaciones contra la app real
  con la biblioteca cliente `caldav`, que se comporta como DAVx5):
  ⚠️⚠️ **Mover un CONCIERTO desde el móvil CREABA una nota duplicada**: `_caldav_find_item` no
  encuentra la actividad, así que el PUT la daba por nueva y la guardaba como nota con su mismo href
  (invisible además para CalDAV, porque ese href ya lo ocupa la actividad). Punto único
  **`_caldav_is_activity`** (href `a-<hash>.ics` **o** UID `act-<hash>@33producciones`, que un
  cliente puede mandar con otro href) → **403** y el iPhone deshace el cambio.
  ⚠️ **Editar un BLOQUEO desde el móvil le pegaba el prefijo**: sale como «Bloqueo · motivo» y al
  volver se guardaba tal cual (→ «Bloqueo · Bloqueo · motivo», creciendo en cada edición). Punto único
  **`_caldav_kind_and_title`**: quita el prefijo, y un título NUEVO que empiece por «Bloqueo» **crea un
  bloqueo** desde el móvil (es la forma de bloquear días sin abrir la app). Lo que ya existe **no
  cambia de tipo** (una nota sigue siendo nota aunque se le escriba «Bloqueo» delante).
  ⚠️ **El lector del PUT solo mira DENTRO del VEVENT y se salta el VALARM**: el recordatorio del
  iPhone lleva su propia `DESCRIPTION` («Recordatorio») y **pisaba la nota** del evento (la trampa
  que ya documenta el volcado de iCloud); y una `DTSTART` de un `VTIMEZONE` (1970) ya no puede pisar
  la fecha. El **LOCATION** se conserva en el texto de la nota («Lugar: …»): la nota no tiene campo.
  ⚠️ **Los REPETIDOS (`RRULE`) se RECHAZAN con 403**: la agenda no tiene series, y guardar solo la
  primera fecha sin decir nada sería peor (nadie se enteraría). El móvil lo dice en el momento.
  ⚠️⚠️ **El ETag cambiaba en CADA petición**: era el hash del .ics entero **con `DTSTAMP` =
  `_ics_now_utc()`**, así que el iPhone daba TODOS los eventos por modificados en cada refresco y el
  ctag nunca coincidía. Ahora el sello es FIJO (`_CALDAV_DTSTAMP`) y el ETag solo cambia si cambia el
  contenido (el PUT devuelve el ETag con el mismo sello, o el cliente lo daría por cambiado otra vez).
  · **CACHÉ de 90 s por artista** (`_caldav_artist_events` → `_caldav_artist_events_build`): un
  refresco del iPhone es una RÁFAGA (PROPFIND del hogar con el ctag de CADA calendario + PROPFIND y
  REPORT de cada uno) y a dirección le salen 45 calendarios: sin caché, 45 `_agenda_build` por
  ráfaga. Lo que se escribe desde el móvil la **invalida** (`_caldav_events_invalidate`); lo que se
  escribe en la WEB lo detecta la **HUELLA de la BD** (`_caldav_items_fingerprint`, una consulta de
  ~1 ms por artista: cuenta y md5 de sus notas y bloqueos) que se compara en cada acierto de caché —
  ver «LO QUE SE BORRA EN LA WEB VOLVÍA», más abajo—; el resto de la agenda (actividades) tarda como
  mucho 90 s. ⚠️ La clave lleva **`full_details`**: contratación y dirección ven también lo SIN
  CONFIRMAR y los demás no, así que son dos listas.

- ⚠️⚠️ **CalDAV · EL TIPO SE ELIGE CON LA PRIMERA PALABRA, Y EL ARTISTA TIENE SU PROPIA CUENTA**
  (sep 2026, lo pidió Dani: «distinguir el tipo de evento que se crea» y «que el propio artista
  pueda apuntar desde su móvil»).
  · **PALABRAS CLAVE** (`_caldav_activity_type_from_summary` + `_caldav_activity_vocab`): la app de
  Calendario no tiene «tipo», así que lo dice **la primera palabra del título seguida de dos puntos**
  (o del punto medio, o un guion): `Concierto: Sevilla` · `Ensayo: Local` · `Reunión: Sello` ·
  `Grabación de audio: Estudio Uno`. El vocabulario es el **catálogo de tipos de actividad**
  (`QUAD_ACTIVITY_CHOICES`, normalizado sin acentos, con singular/plural y unos sinónimos), el MISMO
  con el que el móvil enseña cada actividad —por eso `_agenda_vevent_block` pone ahora delante **el
  tipo REAL** (`_activity_kind_label` del `activity_type`, que `_agenda_build` añade al ítem) y no la
  familia («Conciertos», «Eventos / promo»), que para un ensayo no decía qué era—. La palabra SOLA
  también vale («Ensayo»); **sin separador no** («Reunión con el sello» es una nota).
  · **QUÉ CREA**: una **actividad RESERVADA** (`_caldav_create_activity`): tipo de la palabra, fecha
  (y fin si son varios días), `show_time` si trae hora, el **LUGAR** repartido en recinto a mano,
  municipio y CP (`_caldav_split_location`: «Sala Riviera, Paseo…, 28005 Madrid, España»), el texto
  como «En qué consiste» (`contracting_payload.description`) y `sale_type` VENDIDO en lo que es un
  concierto / GRATUITO + aforo libre en lo demás. Aviso «Nueva reserva en la agenda» a quien lleva al
  artista (`_caldav_notify_activity`). Al resincronizar, el evento del móvil **desaparece y vuelve
  como la actividad** (solo lectura, con «· Reserva» y `STATUS:TENTATIVE`) si quien mira puede ver lo
  sin confirmar; para los demás simplemente desaparece del móvil y está en la app.
  ⚠️ **El UID del móvil se guarda en `contracting_payload.caldav_uid`** y se busca antes de crear
  (`_caldav_find_activity_by_uid`): el iPhone REENVÍA el PUT al resincronizar y sin eso se creaban
  dos reservas. (`_concert_contracting_general_rows` lee claves concretas, así que esa clave no se
  pinta en la ficha.)
  ⚠️ **Solo crea actividades quien puede en la web** (`_caldav_can_create_activities`, la regla de
  `can_edit_concerts`: edición en contratación o roles 5/6/10), y **solo al CREAR**: editar una nota
  que ya existe no la convierte. A los demás la palabra les entra como **nota** tal cual la escriben.
  · **CUENTA DEL ARTISTA** (`ArtistCalendarAccount`, `ensure_artist_calendar_schema`): el artista NO
  es usuario de la app, así que desde su ficha (Agenda → botón del enlace → «Cuenta de calendario
  para el artista») se le crea un **usuario sin «@»** (`_caldav_account_username`, el nombre en seco:
  «losnus») y una contraseña de 12 caracteres que **se enseña UNA vez** (se guarda el hash; se
  regenera con `artist_calendar_account_rotate` y se anula con `_cancel`). `_caldav_auth` la
  reconoce cuando el usuario no es el correo de nadie y devuelve un **`_CaldavPrincipal`** (persona
  o artista): ve SOLO su calendario, sin lo sin confirmar, no crea actividades, y lo que apunta se
  firma con el nombre del artista (`created_by_user_id` NULL) y avisa a quien lo lleva con
  `actor_name` (en CalDAV no hay sesión de la que sacar el actor).
  ⚠️ La contraseña viaja al **PDF de instrucciones** (`artist_calendar_account_pdf`) dentro de un
  **token firmado de 15 min** (`_caldav_account_token`): después el PDF sale sin ella. El PDF de la
  OFICINA es `public_caldav_guide_pdf` (`/caldav/guia.pdf`, botón en la guía); los dos salen del
  punto único **`_caldav_guide_pdf_bytes`** (logos a la derecha, título centrado, pasos por
  dispositivo, la tabla de palabras clave y los avisos), que también recibe el host bueno
  (`_caldav_public_server`: manda `CALDAV_PUBLIC_HOST`).
  ⚠️ Los endpoints `artist_calendar_account*` se mapean a **`artists.agenda`** (los DOS mapeos) y
  exigen `can_edit_artists_stations()`. El esquema NUEVO lo crea **Render** al arrancar
  (`CALDAV_ONLY` no migra): tras un push que toque `models.py`, esperar a Render antes del
  `fly deploy`, o el host de Fly consultaría una tabla que no existe.
  Probado con 31 comprobaciones más contra la app real: la cuenta del artista (entra, ve solo lo
  suyo, apunta con hora, firma con su nombre, no crea actividades, se anula), las palabras clave
  (quién puede, reserva completa con lugar y hora, reenvío sin duplicar, dirección la ve tentativa
  y el artista no, reunión de dos días, palabra sola, sin separador → nota, tipo de varias palabras,
  una nota que ya existe no se convierte) y los dos PDF.

- ⚠️⚠️ **CalDAV · LO QUE SE BORRA EN LA WEB VOLVÍA** (bug real, 15-sep-2026: «lo elimino en la web,
  no se elimina bien y tampoco se va del móvil»). La BD lo contó: la nota borrada en la web fue
  RE-SUBIDA por el iPhone dos veces (dos avisos «Nuevo en la agenda» seguidos, mismo UID). Tres piezas,
  las tres del servidor:
  · **La caché de 90 s no sabe lo que borra la web**: el CalDAV corre en Fly y el back office en
    Render, así que `_caldav_events_invalidate` (que solo llama el propio host al escribir desde el
    móvil) **no se ejecuta nunca** para un borrado de la web. El listado, el ctag y el GET del recurso
    seguían sirviendo la nota borrada hasta 90 s → el móvil «no se enteraba». Ahora la caché se valida
    con la **huella de la BD** (`_caldav_items_fingerprint`: `count` + `md5(string_agg(...))` de las
    notas y bloqueos del artista, ~1 ms) en cada acierto; si cambia, se reconstruye al momento. Lo
    que NO es nota (actividades) sigue con el TTL.
    ⚠️ **`string_agg` lleva DOS argumentos** (expresión Y separador): sin el separador Postgres rechaza
    la consulta, la huella sale vacía y se vuelve al TTL **sin ningún error** (pasó en la primera
    prueba). Por eso el `except` deja rastro en el log.
  · **Borrar en el móvil algo que la web ya borró respondía 403** («actividad o inexistente» iban
    juntos): para iOS un 403 es «prohibido» y **restaura el evento en pantalla**. Ahora **404** si no
    existe (para el móvil es «hecho») y 403 solo si es una ACTIVIDAD (`_caldav_is_activity`).
  · **Reenviar con `If-Match` algo que ya no existe se daba por NUEVO** (201): el iPhone manda
    `If-Match` cuando reenvía lo que ya tenía (una edición, una resincronización), el servidor no
    encontraba la nota, la creaba otra vez y **volvía a avisar a todo el mundo**: la nota
    «resucitaba». Ahora **412** (precondición fallida, lo que espera un cliente CalDAV: vuelve a
    preguntar, ve que no está y la quita). Crear una nota NUEVA a mano (sin `If-Match`) sigue igual.
  ⚠️ Con la caché fresca, un borrado en la web llega al móvil **en su siguiente consulta**: iOS
  pregunta cada X minutos (lo que tenga en «Obtener datos») o al abrir Calendario y **tirar hacia
  abajo** en la lista de calendarios. Eso no lo decide el servidor.
  · **Las líneas `CALDAV …` NUNCA salían en `fly logs`**: `app.logger.info` con el nivel por defecto
    de Flask (WARNING) se descarta, así que el host no dejaba rastro de lo que le pedía el iPhone y
    esto no se pudo ver en directo. En `CALDAV_ONLY` el logger va a INFO y `_caldav_logged` pinta la
    línea **después** de responder: método, ruta, **código**, ms, Depth, `If-Match`/`If-None-Match` y
    el cliente. Para reproducir algo: `fly logs --app radio-spins-caldav` (sin `--no-tail`).
  · **La guía y el PDF no pueden apuntar a un nombre que no existe**: `CALDAV_PUBLIC_HOST` llevaba
    `calendario.33producciones.es` sin su CNAME (ver DEPLOY_CALDAV.md), y la guía en producción lo
    enseñaba. `_caldav_public_server()` comprueba ahora que el nombre resuelva (`_caldav_host_resolves`,
    cacheado 5 min) y si no, enseña `CALDAV_FALLBACK_HOST` (por defecto el host de Fly). Cuando el CNAME
    exista, sale solo.
  · **El borrado en la web era MUDO**: `agenda_calendar.js` borraba con un `fetch` que SEGUÍA el
    redirect del endpoint, así que el flash («Eliminado de la agenda», o «No tienes permiso…») se
    consumía dentro del fetch y la recarga salía sin ningún mensaje. Con **`redirect: 'manual'`** el
    aviso queda en la sesión y se ve al recargar. Regla: un `fetch` a un endpoint que responde
    POST→flash→redirect y luego recarga la página **no debe seguir el redirect**.
  Probado con la app real (`test_caldav3.py`, scratchpad de la sesión): ETag del PUT = ETag del listado
  = ETag del REPORT; borrado en BD → el listado, el ctag y el GET cambian al momento; DELETE de lo
  borrado → 404; PUT con `If-Match` → 412 sin fila nueva ni aviso nuevo; PUT nuevo → 201; editar
  título u hora en la web cambia el ctag y el móvil se baja la versión editada; sin cambios, el ctag no
  cambia; y las dos baterías anteriores (53 + 31) siguen en verde.

- **CONTABILIDAD · el filtro de empresa: SOLO EL LOGO** (ago 2026), y el nombre únicamente en las que
  no lo tienen (la misma regla que la columna «Empresa» de la tabla); en los dos casos, el nombre al
  pasar el ratón.

- **FICHA DEL ARTISTA · integrantes y NOTIFICACIONES** (ago 2026):
  · En «Datos» va **primero el módulo INTEGRANTES**: por cada uno, a la izquierda foto + nombre, DNI,
  nacimiento, email y teléfono, y debajo sus **tarjetas de fidelización y matrículas**; a la derecha
  **solo el ANVERSO del DNI** (`.mem-dni`) y bajo él las **etiquetas de sus documentos** con icono
  (`.mem-doc`) y un **+** que abre el panel para subir más. Uno debajo de otro.
  · **Editar integrantes** (botón arriba del módulo): añadir y quitar solo se ven en modo edición
  (`[data-members-only]`, que nacen con `d-none`).
  · Debajo, **NOTIFICACIONES** (`templates/_artist_notifications.html`, antes «Emails adicionales»,
  que se ha retirado): quién recibe cada comunicación. Modelo **`ArtistNotificationContact`**
  (`ensure_artist_notifications_schema`): persona (tercero, se sugieren los INTEGRANTES que faltan) +
  `channels` de `ARTIST_NOTIFICATION_CHANNELS` (LIQUIDACIONES · PRODUCCION · DISCOGRAFICA · EDITORIAL ·
  PROMOCION · INVITACIONES) + `liquidation_concepts` (los conceptos del contrato del artista, que da
  `_artist_liquidation_concepts`). **Un canal lo pueden recibir varias personas.** Endpoints
  `artist_notification_contact_save` / `_delete`.
  · **Punto ÚNICO para mandar: `_artist_notification_emails(session_db, artist_id, channel,
  concept=None)`** — lo que se configure manda de ese momento en adelante. En LIQUIDACIONES, quien no
  haya marcado conceptos recibe todas. ⚠️ Con **nadie** configurado en un canal cae al correo del
  artista y a sus correos adicionales (`fallback=True`): mejor eso que no llegar a nadie. Ya
  enganchado en las **liquidaciones de royalties** (`_beneficiary_email_delivery_data`), las
  **certificaciones de disco** (`_artist_email_delivery_data` → canal DISCOGRAFICA) y el aviso de
  **registro en SGAE** (canal EDITORIAL). Para cablear otro envío basta llamar a ese helper.
  · **Eliminar un artista es SOLO de dirección** y vive en el **lápiz de la cabecera** (la «zona
  peligrosa» de Datos se ha retirado).

- **PERSONAS DEL ARTISTA = TERCEROS que forman parte de él** (`ArtistPerson.promoter_id`): un miembro
  de un grupo (o el solista) es un **tercero particular** con exactamente los mismos datos (DNI,
  pasaporte, carnet, tarjetas de fidelización, matrículas, necesidades de viaje, cuenta bancaria,
  dirección fiscal…), que se rellenan en la viñeta **«Integrantes:»** de la pestaña «Datos» de la
  ficha del artista sin salir (ago 2026: era la pestaña «Personas»; su contenido vive en
  `templates/_artist_members.html`, incluido desde «Datos», y `?tab=personas` redirige allí).
  No se duplica nada: los datos viven en su `Promoter` + `PersonDocument`, así que el mismo músico
  puede estar en dos grupos y, cuando factura, la búsqueda por DNI/CIF lo encuentra.
  Helpers `_artist_person_full_name` / `_artist_person_promoter` / `_ensure_promoter_for_artist_person`
  (crea el tercero o **vincula** uno existente por `link_promoter_id`, reutilizando el que tenga ese
  nombre exacto — mismo patrón que `_ensure_promoter_for_media`) / `_artist_person_cards`. Endpoints
  `artist_person_data_save` (datos + viaje, crea el tercero si falta), `artist_person_document_save` /
  `_delete` (delegan en `_person_document_save`/`_delete_one` con owner PROMOTER) — mapeados a
  `artists` por prefijo `artist_person` en `_resolve_request_resource_key`/`_coarse_endpoint_resource`,
  y la pestaña `personas` hereda el permiso de `artists.datos` (no hay recurso nuevo que conceder).
  **Añadir persona = BUSCAR EN TERCEROS**: barra de búsqueda arriba de la pestaña con resultados
  **en vivo desde el primer carácter** (`/api/search/promoters`, acento-insensible y por palabras, con
  foto redonda, correo/teléfono y las vinculaciones); quien ya está sale marcado «ya está» y no se
  puede elegir dos veces (el servidor también lo comprueba); si no hay coincidencias, la última fila
  ofrece **crear** la persona con lo escrito (y su ficha de tercero). Al elegir un tercero, el nombre
  lo saca el servidor de su ficha (no hay que teclearlo). Al final de la barra hay **siempre un botón +**
  que da de alta a la persona con lo escrito, aunque la búsqueda esté trayendo resultados (es para cuando
  no es ninguna de las que salen). Estilos `.aps*` en `styles.css`, JS en línea
  en la pestaña. En «Datos» queda solo el listado con el botón *Ver y editar*.
- **GASTOS DIRECTOS: de OFICINA o INVERSIÓN de artista** (ago 2026). Son gastos de «Mis gastos» que
  **NO van contra ninguna bolsa**. ⚠️ No confundir con `BagExpense.covered_by='OFICINA'`, que es otra
  cosa: un gasto que SÍ está en una liquidación pero lo paga la oficina.
  · **Cómo se mandan**: en `/mis-gastos/asignar`, la columna de destinos se abre con una tarjeta
  **partida en dos** (`.direct-split`): «Gasto de oficina» e «Inversión de artista». Se arrastra el
  gasto igual que a una bolsa; en inversión se pregunta el artista (modal con los **asignados**
  primero y «ver más» para el resto, buscador incluido).
  · **Requisito**: como no va a ninguna bolsa, hace falta **factura/ticket** o que administración
  haya aceptado que va **sin factura** (`_personal_expense_has_justification`). Si no, se avisa y no
  se manda (lo comprueba el JS **y** el backend). Desde los **tres puntitos** de cada gasto en
  «Mis gastos» se sube la factura/ticket (`my_expense_upload_invoice`) o se pide pasar sin factura
  (`my_expense_no_invoice`). El **icono** del gasto dice en qué estado está
  (`_personal_expense_justification_state`).
  · **Estados** (`PersonalExpense.status`): `VALIDATING` (mandado, sigue viéndose en Mis gastos con
  su etiqueta «a la espera») → `DIRECT` (aceptado) o vuelta a `PENDING` con `validation_status =
  RECHAZADO` y el motivo a la vista («no se aceptó: …»). Al aceptarlo, si no estaba pagado
  (`_personal_expense_is_prepaid`: lo de **Pleo y Cabify ya está pagado** con la tarjeta) queda
  **pendiente de pago**.
  · **Dónde se valida**: Administración → Pendiente → **«De oficina»** (subpestaña nueva, con su
  contador y su responsabilidad `GASTOS_OFICINA`): por validar · piden pasar sin factura · validados
  pendientes de pago. Endpoints `administration_direct_expense_decision` /
  `administration_personal_no_invoice_decision` / `administration_direct_expense_mark_paid`
  (mapeados a mano a `administracion.pendiente`: no llevan prefijo reconocible).
  · **Balance del artista**: `_artist_investment_rows` pinta en la pestaña **Contratos** del artista
  lo que se ha invertido en él (solo se calcula en esa pestaña).
  ⚠️ Los endpoints `my_expense_*` están en **`PERSONAL_ENDPOINTS`** (datos propios: la comprobación
  de propiedad la hace `_my_expense_or_403` dentro).
- **Otras actividades · filtros por tipo y listado por sujeto** (ago 2026, `contracting_view` +
  `templates/contratacion.html`): arriba, **etiquetas de TIPO con su icono** (`type_chips` sobre
  `OTHER_ACTIVITY_TYPE_KEYS` = evento promocional · TV · marca · otros, con contador y acumulables
  por `?tipo=`); debajo, la rejilla de **SUJETOS** —artistas **y eventos**— con su nº de actividades
  (los de evento se agrupan por el `AppEvent`, nunca por su artista espejo, y llevan la pastilla
  «Evento»); y al entrar, el listado **sin nombre ni foto de artista** (`.oa-row`): icono del tipo ·
  nombre de la actividad (el festival si lo tiene, y si no el tipo) · municipio · provincia, y
  **debajo** la fecha y el recinto, con «Con/Sin caché» y el estado a la derecha.
- **Actividades de un EVENTO** (`AppEvent`): una actividad (`Concert`) exige artista (`artist_id` NOT
  NULL) y un evento no lo es, así que al convertir una simulación de EVENTO se espeja el evento como
  artista con `_ensure_artist_for_event` (`Artist.event_id`, único; hereda nombre y logo) y la
  actividad guarda además `Concert.event_id`. El espejo se excluye del listado `/artistas`. ⚠️ Sigue
  saliendo en OTROS selectores de artista que consultan `query(Artist)` sin filtrar (~60 sitios): es
  cosmético, se va filtrando donde moleste. Mismo patrón que `_ensure_promoter_for_media`.
- **FUSIÓN de Actividades y Acciones** (ago 2026): una sola sección **Actividades** y **un solo
  botón «+ Actividad»** (el asistente se incluye en `/actividades` y pregunta el tipo). «Acciones»
  sale del menú; su recurso `acciones` se **conserva** («Acciones (histórico)») porque las
  `CompanyAction` que ya existían siguen teniendo su ficha —y quitarlo se llevaría por delante sus
  permisos, que `_sync_access_resources` poda en cascada—.
  · **Tipos nuevos** en `QUAD_ACTIVITY_CHOICES`: **ENSAYO** y las **DISCOGRÁFICAS**
  (`DISCOGRAFICA_ACTIVITY_TYPES`: DISC_PREMIOS · DISC_FIRMA · DISC_AUDIO · DISC_VIDEO · DISC_FOTOS ·
  DISC_COMPOSICION · DISC_REUNION), que en el paso 1 del asistente viven dentro de la tarjeta
  «Discográficas».
  · **Rama corta** (`SIMPLE_ACTIVITY_TYPES` = ensayos + discográficas; en el JS `SIMPLE_TYPES`):
  `stepSequence()` devuelve `[12, 1, 3, 4, 6, 13]` — artista(s) · tipo · días y sitio · qué tiene que
  hacer el artista (y **¿canta?** solo en `SINGING_ACTIVITY_TYPES`: premios y firmas) · caché · y el
  paso **13 de LOGÍSTICA**, que si hace falta activa la producción con la persona elegida (le llega el
  aviso y la actividad le sale en sus Activas). Nada de promotor, entradas, cartelería ni anuncio.
  · **Varios días**: `Concert.end_date` (la actividad es UNA, del primer día al último).
  · ⚠️ El tipo de venta de estas actividades es SOLO el apunte de si llevan caché: el asistente lo
  fuerza a VENDIDO/GRATUITO y `_sale_type_label` ya enseña lo que ES la actividad.
  · ⚠️ En `concert_wizard_create` (y en los otros dos sitios donde se crea un `Concert`) la variable
  `session` es la **sesión de la BD**, no la de Flask: el usuario se lee de `_current_user_state()`
  (usar `session.get("user_id")` ahí revienta con «Session.get() missing 1 required argument»).

- **Sección ACTIVIDADES: filtros por tipo y listado por sujeto** (ago 2026, `activities_view` +
  `templates/actividades.html`). Igual que la pestaña «Otras actividades» de Contratación pero con
  TODO (conciertos, festivales, eventos promocionales, TV, marca, otros y **acciones**):
  · Arriba, **etiquetas de TIPO con su icono** y su contador, acumulables (`?tipo=`, claves en
    `ACTIVITIES_TYPE_KEYS`; `?type=concert|action` sigue funcionando por los enlaces antiguos).
  · Debajo, la rejilla de **SUJETOS** —artistas **y eventos**— con su nº de actividades (una actividad
    de evento se agrupa por el `AppEvent`, nunca por su artista espejo).
  · Al pinchar uno, el listado **sin nombre ni foto de artista** (`.oa-row`): icono del tipo · nombre
    de la actividad (el festival si lo tiene) · municipio · provincia, y **debajo** fecha y recinto.

- **Filtros de tipo: solo los que TIENEN actividades** (ago 2026). En `/actividades`, en Contratación →
  «Otras actividades» y en Producción → «Activas», la etiqueta de un tipo **no se pinta si no hay
  ninguna actividad de ese tipo** (antes salían todas a cero y había que leerlas para descartarlas).
  · Los contadores se calculan sobre **lo que se está viendo** (periodo y, si se ha entrado en un
    artista o evento, solo lo suyo) pero **sin aplicar el propio filtro de tipo**: si no, la etiqueta
    que acabas de pulsar dejaría a las demás a cero y no podrías combinarlas.
  · La etiqueta activa se conserva aunque su contador sea 0 (si no, al filtrar desaparecería el botón
    con el que quitar el filtro).
- **Cuentas bancarias de una empresa del grupo: VARIAS en el mismo banco.** Lo único que no se repite
  es el **IBAN** (mismo IBAN = misma cuenta: se actualiza y se **avisa**, para que no parezca que no
  deja añadirla). En la lista, las cuentas del mismo banco se numeran («cuenta 1 de 2») y el formulario
  lo dice. Un IBAN que no cuadra en el mod-97 se rechaza con su motivo (era lo único que podía parecer
  un tope).

- **Facturación por empresa**: `/facturacion_<empresa>` (`_company_slug`/`_find_group_company_by_slug`)
  muestra solo esa empresa, su logo a la derecha y **oculta el navbar** (`hide_backoffice_nav`, flag
  que respeta `layout.html`). El paso «¿para quién es la factura?» usa `_invoice_target_people`
  (personal con departamento; dirección solo si tiene además otro) y `_detect_invoice_meta` lee el
  nº y la fecha de emisión del PDF para que el proveedor los confirme antes de enviar.

- **Ficha de la empresa del grupo** (`company_detail`, `/empresas/<cid>`): pestaña **Datos** (datos de
  `GroupCompany` inline + bloque **Logos** —descarga PNG por `company_logo_png`, que baja el original y
  lo convierte con Pillow, + compartir correo/WhatsApp/SMS— + enlace `/facturacion_<slug>` con copiar,
  abrir, **copiar el código de inserción (icono `</>`)** vía `company_embed_code` → `_company_embed_snippet`
  y previsualizar) y pestaña **Documentación**
  (`GroupCompanyDocument`: nombre + `expiry_date`; `_company_doc_row` da la etiqueta
  **VALID/EXPIRED/NONE** → `.co-doc-st--valid/--expired/--none`, caducados primero). Guardado/borrado
  (`company_document_save`/`_delete`) **solo dirección** (`is_master()`), el resto ve/descarga/comparte
  (correo·WhatsApp·SMS); **editar la empresa y eliminarla también son solo dirección**
  (`can_edit_company`, el botón *Eliminar empresa* vive dentro del formulario de edición). Permisos: los
  endpoints `company_*` ya caen en `databases.group_companies` por prefijo en `_coarse_endpoint_resource`,
  no hay que mapearlos a mano. El **listado** `/empresas` es una lista simple sin botones: cada fila
  enlaza a su ficha (`companies.html`, clases `.co-row*`).
- **Contratos de actividad: el PDF va por un endpoint con permiso** (`concert_contract_download`,
  `/conciertos/<cid>/contratos/<ctid>/ver`): exige sesión y `can_view_concert_contracts()` y sirve el
  fichero desde el servidor. ⚠️ Los contratos viven en el bucket PÚBLICO de Storage: la ficha ya no
  publica `pdf_url`, pero **las URL directas de los ya subidos siguen funcionando** para quien las
  tenga guardadas (cerrarlo del todo pide bucket privado o URLs firmadas, que afecta a todo el resto).
- **FILTRO POR AÑO en Conciertos y Actividades** (ago 2026): al lado de «Cuándo», etiquetas pequeñas
  con el **año anterior, el actual y el siguiente** (`YEAR_FILTER_OFFSETS`), acumulables. Puntos
  únicos `_year_filter_from_request` · **`_year_chips`** · **`_filter_by_year`**.
  ⚠️ **Un año sin nada NO se ofrece** (la misma regla que los tipos del calendario), pero el que
  esté marcado se conserva aunque salga a cero: si no, al filtrar desaparecería el botón con el que
  quitar el filtro.
  ⚠️ Sus contadores se calculan **sin aplicar el propio filtro de año** (si no, al marcar uno los
  demás saldrían a cero y no se podrían combinar) y **el filtro se aplica ANTES de contar nada más**:
  así el número de cada etiqueta de tipo, el de cada tarjeta de artista y el de la cabecera del
  sujeto dicen lo que se va a ver (si no, la tarjeta seguía diciendo «13 actividades» y dentro había
  una — el mismo criterio que el filtro de fechas).

- ⚠️⚠️ **LA FICHA DE UNA ACTIVIDAD SIN CONFIRMAR solo la abren quienes la ven** (ago 2026):
  contratación, dirección y **quien la produce** (con la producción ya activada). Es el MISMO punto
  único que decide si se pinta en el calendario y en el listado de Producción
  (`_concert_visible_unconfirmed`), así que no se pueden desparejar: **lo que se ve, se abre**. Al
  resto se le dice por qué en vez de dejar que llegue a una ficha que no le corresponde.

- **UN TERCERO NUEVO: EMPRESA o PARTICULAR** (ago 2026, alta rápida `data-quick-create="promoter"`).
  Lo primero es **qué es**, porque los datos no son los mismos: **empresa** (nick · nombre de la
  empresa · CIF · dirección fiscal · su **representante**) o **particular** (nick · nombre completo ·
  DNI · dirección fiscal · teléfono · email). Todo opcional menos saber cómo se llama: sin nick se usa
  el nombre de la empresa o el nombre completo.
  · **`Promoter.legal_name`** (columna nueva) = el nombre de la empresa / razón social: el `nick` es
  como la llamamos nosotros y esto es con lo que factura — de ahí lo coge **`_billing_name`**, que es
  lo que se manda a Holded.
  · ⚠️⚠️ **EL REPRESENTANTE ES OTRO TERCERO**: `_quick_create_representative` crea los dos en la
  misma operación y los **vincula** (`ThirdPartyLink`, relación «Representante»), que es
  bidireccional, así que se ven en las dos fichas. `_promoter_representatives` lo lee en las dos
  orientaciones.
  · Todo eso se ve en la **ficha de contratación** de la actividad, bajo el promotor
  (`_promoter_info_rows`: nombre o razón social, CIF/DNI, dirección fiscal, contacto y representante).
  Un campo vacío no se pinta.
  ⚠️ Las dos ramas comparten los nombres de los campos (`nick`, `tax_id`, la dirección fiscal), así
  que el panel que no toca **se DESHABILITA**: esconderlo no basta, un campo oculto se envía igual.

- ⚠️ **QUIEN CREA UNA ACTIVIDAD LA VE** (`_concert_visible_unconfirmed`): una actividad nace
  RESERVADA mientras no se le haya avisado al artista, así que sin esto la persona que acababa de
  darla de alta se comía un **403 al terminar el asistente**, en su propia actividad.

- ⚠️ **UNA ACTIVIDAD YA PASADA SE CREA Y YA ESTÁ**: no se va a mandar un aviso de algo que ya
  ocurrió, así que no se queda en RESERVADA por eso. El aviso se apunta como hecho **a mano**
  (`_concert_notice_mark_manual`, el punto único que usan el botón «El artista ya fue informado» y
  el alta).

- ⚠️⚠️ **AL MOSTRAR UN PANEL DEL ASISTENTE HAY QUE VOLVER A HABILITAR SUS CAMPOS**: al enviar se
  deshabilita todo lo que está oculto (para que no viaje), y si el envío no llega a navegar —una
  validación que lo para, un error— esos campos se quedan **muertos** con el modal todavía abierto:
  no se podía escribir el nº de canciones, ni elegirlas, ni detallar la formación (bug real). Se
  rehabilitan en `showStep` (por donde se pasa siempre) y al mostrar cada panel.

- **EL PROMOTOR DEL ASISTENTE ES UNA BARRA DE BÚSQUEDA, no un desplegable** (ago 2026): se escribe y
  salen las coincidencias con su foto o su logo (`initTypeahead` con la opción nueva
  **`alwaysList`**, que fuerza la lista propia aunque ningún resultado traiga imagen), y el **«+»**
  de crear uno nuevo se queda a la derecha.
  ⚠️ `quick_create.js` sabe ya dejar lo creado en un BUSCADOR (input + su oculto), no solo en un
  `<select>`: se le dice con `data-target-hidden` en el botón «+» o `data-ta-hidden` en el input.
  ⚠️ El JS de una plantilla corre ANTES que el de `layout.html`, así que `initTypeahead` puede no
  existir todavía: `initPromoterSearch` **reintenta** hasta que esté (la misma trampa que con
  Bootstrap y `app33AutoOpenModal`).

- ⚠️⚠️ **UNA COMISIÓN SE APLICA DE DOS MANERAS Y NO ES LO MISMO** (ago 2026,
  `ConcertZoneAgent.apply_mode` + `COMMISSION_APPLY_MODES`):
  · **EXPENSE (gasto sobre el caché)** — entra en la BOLSA como un gasto más, en la categoría nueva
    **«Comisiones»** (`COMMISSION_EXPENSE_CATEGORY`), y se le comunica al artista en su propio
    módulo del aviso (con su ojo, para poder dejarlo fuera del envío).
  · **REDUCE (reduce el caché)** — no es un concepto aparte: el caché que se ve
    (`_concert_cache_summary`) y el que se le comunica ya va con ella **descontada**
    (`_concert_commission_reduction`), y en la liquidación aparece en la parte del CACHÉ.
  ⚠️ El gasto de la bolsa y la comisión son el MISMO dinero visto desde dos sitios
  (`ConcertZoneAgent.bag_expense_id`, el patrón de `_disco_artwork_sync_bag`): si la comisión deja
  de ser un gasto, su gasto **se retira**. Solo se puede apuntar la de importe FIJO; un porcentaje
  sobre la recaudación no se sabe hasta liquidar.
  · **LAS COMISIONES SE VEN SIEMPRE** en la ficha (antes colgaban de `sale_type != 'VENDIDO'`, así
  que en la mayoría no se podían ni añadir), en la ficha de contratación
  (`_concert_commission_rows` → `_concert_contracting_general_rows`) y con dos botones: **subir la
  factura** (`concert_commission_invoice`) o **solicitársela** a quien la cobra
  (`concert_commission_request_invoice`).
  · En el asistente cada comisión es su propia **galleta**: a quién se le paga (barra de búsqueda
  con foto y el «+» al lado), el tipo con iconos, sobre bruto o neto, el concepto y cómo se aplica.

- **INICIO DE CONTRATACIÓN · el dinero** (ago 2026, `_home_billing_pending` / `_home_billing_year` +
  `templates/_home_billing.html`): **«Pendiente de cobrar»** (las facturas del caché, por EMPRESA
  del grupo, con su total y el de arriba siempre el de lo que se está viendo; lo que vence en
  `HOME_COLLECT_DAYS`=14 días y lo ya vencido en rojo, con «Ver más» para verlas todas; el icono
  dice si la factura ya está subida) y **«Facturado en el año»** (por empresa, de la que más a la
  que menos, con su barra y flechas para cambiar de año).
  ⚠️ Van **FUERA de las compuertas de departamento** de `home.html`: los ven contratación **y**
  dirección, y los módulos ya se calculan solo para ellos — dentro de la compuerta
  (`HOME_DIRECCION_BOARD is none`) a dirección no le salían.

- ⚠️⚠️ **LO CREADO ANTES DEL 2-SEP-2026 SE CONFIRMA SIN COMUNICAR** (sep 2026). La comunicación al
  artista desde la app es de septiembre de 2026: lo que se dio de alta ANTES ya se habló en su día
  por teléfono o por correo, así que **mandar ahora un aviso de algo ya hablado solo haría ruido** y
  esas actividades no se podían confirmar sin él. Corte **`ARTIST_NOTICE_LEGACY_CREATED_BEFORE`**
  (2-sep-2026), y es la **FECHA DE CREACIÓN** (`Concert.created_at`), no la de la actividad: una
  fecha de dentro de seis meses apuntada en agosto también entra.
  · Punto único **`_concert_notice_ack_reason(concert)`** → **`PASADA`** (su último día ya pasó, lo
  de siempre) · **`ANTIGUA`** (creada antes del corte) · `""` (hay que avisar de verdad), y
  **`_artist_notice_ack_texts(motivo)`**, que da la NOTA y cómo se llaman los dos botones. Con eso,
  al pinchar CONFIRMADO sale el pop-up **«Confirmar sin comunicar»** con la nota —«esta actividad se
  creó antes del 2 de septiembre de 2026, por lo que la puedes confirmar sin necesidad de
  comunicársela al artista»— y **«Confirmar»** / **«Confirmar y comunicar»**.
  ⚠️ Los TEXTOS los manda el SERVIDOR en el JSON de la compuerta (`ack_reason`/`ack_note`/
  `ack_label`/`notify_label`/`ack_title`): `pedirDecisionAviso` (scripts.js) no repite ninguno, así
  que cambiar la fecha del corte cambia el pop-up, la pantalla del aviso y el flash a la vez.
  ⚠️ La fecha del texto sale del propio corte (`_artist_notice_legacy_date_label`), nunca escrita a
  mano.
  ⚠️ Confirmar así **queda apuntado igual que un envío** (`_concert_notice_mark_manual`:
  `ConcertArtistNotification` con canal MANUAL y la misma FIRMA, y la nota dice por qué), así que un
  cambio gordo posterior (fecha, hora, recinto o caché) vuelve a pedir aviso como en cualquier otra.
  ⚠️ **El servidor lo vuelve a comprobar** (`concert_artist_notice_ack`): una actividad creada
  después del corte y sin celebrar no se puede dar por informada ni llamando al endpoint a mano.
  ⚠️ El ALTA solo se auto-marca con el motivo **PASADA** (`ack_reason == "PASADA"`): una actividad
  que se está creando AHORA no es antigua, y darlo por hecho en silencio sería confirmar sin avisar
  sin que nadie lo haya decidido.

- ⚠️ **EN LA CABECERA DE UNA ACTIVIDAD NO VAN LAS PERSONAS VINCULADAS AL ARTISTA** (sep 2026): su
  hermano, su asistente… eso es de la **ficha del ARTISTA**, no de la actividad, y ahí solo hacía
  ruido (se veía en cualquier concierto: «Jose Luis — Hermano y Road Manager», «Eva — Asistente»).
  Misma regla que la cabecera de una canción. Los contactos de ESA actividad están en su ficha de
  contratación.

- ⚠️⚠️ **EL ASISTENTE DE ACTIVIDAD ES UNO, Y SU CONTEXTO SALE DE UN SOLO SITIO** (sep 2026). El
  parcial ya era único (`_concert_wizard_modal.html`, incluido en 12 pantallas), pero **Contratación,
  la vista de conciertos, la ficha de una gira y la de un ciclo se montaban sus propias listas a
  mano** y se quedaban sin las claves nuevas: el MISMO asistente salía con la tarjeta de
  «Discográficas» VACÍA, sin gente en «¿quién de producción se encarga?» y sin giras ni ciclos según
  desde dónde se abriera (bug real). Ahora:
  · **`_concert_wizard_context`** es el único sitio donde se dice qué necesita el asistente, y
  · **`_with_concert_wizard(session_db, ctx)`** es por donde pasa **toda** pantalla que lo incluya:
    añade lo que falta **sin pisar** lo que la pantalla ya pasa (sus propias listas para sus
    listados y filtros) y pone `wizard_available`.
  Un dato nuevo del asistente se añade en `_concert_wizard_context` y **aparece en todas a la vez**.
  · Enganchado en las 12: Inicio · Actividades · Contratación (otras actividades) · vista de
  conciertos y Facturación · **listado de giras compradas** · **listado de festivales/ciclos** ·
  Eventos · ficha del artista · ficha de una **gira** y de un **ciclo/festival/evento** · ficha de
  una petición aprobada.
  ⚠️ **El botón «+ Actividad» también tiene que estar en todas**: el listado de giras compradas y el
  de festivales/ciclos eran las únicas pestañas de Contratación sin él (solo tenían «Nueva gira» /
  «Nuevo ciclo»), así que desde ahí había que irse a otra pantalla para añadir una fecha.
  ⚠️ En la ficha de una gira/ciclo, «Crear concierto» abre el asistente **en esa misma pantalla**
  (`url_for(request.endpoint, open_wizard=1, wizard_group=…, **request.view_args)`): la auto-apertura
  por parámetros vive en el propio parcial, así que funciona en cualquier página que lo incluya —
  antes te llevaba a `/conciertos` y perdías el contexto de la gira.
  ⚠️ Con `setdefault` la pantalla manda sobre el helper: en `contracting_view` se retiró su `artists`
  a propósito (era **todos** los artistas, con los espejos de EVENTO dentro, que no deben salir en el
  selector; el helper los excluye) y en `concerts_view` se conservan `artists` y `venues`, que son los
  de su rejilla y sus filtros.

- ⚠️⚠️ **EL REPERTORIO DE UNA ACTIVIDAD: se busca ESCRIBIENDO y se ordena ARRASTRANDO** (sep 2026).
  Al marcar «Sí, canta», el nº de canciones se podía poner pero **la barra de búsqueda de canciones
  no funcionaba**: era un `<select multiple>` con **Select2 SIN `dropdownParent`** y dentro del
  asistente (un modal con scroll) su desplegable **se queda detrás y no se abre** — el clásico de
  esta app. Ahora:
  · Parcial ÚNICO **`templates/_performance_songs.html`** + motor **GLOBAL**
    `static/js/performance_songs.js` (`window.app33PerfSongs`), usados por el **asistente** y por la
    sección **«Actividad» de la ficha**: se pone igual en los dos y una mejora vale para los dos.
  · Se escribe y salen las coincidencias del repertorio del artista (sin acentos ni mayúsculas), y lo
    elegido son **filas que se arrastran**: **ese es el orden del repertorio**.
  ⚠️ La lista de sugerencias cuelga del `<body>` con **`app33FloatList`** (la misma de todos los
  buscadores de la casa): dentro del modal, cualquier ancestro con `overflow` la recortaría.
  ⚠️ **El motor es GLOBAL y por DELEGACIÓN** porque la sección «Actividad» vive dentro de una zona
  `data-inline-zone` que se REEMPLAZA al guardar: un `<script>` de dentro no se volvería a ejecutar
  (regla de la casa). Comprobado: tras guardar por AJAX, el buscador sigue funcionando.
  ⚠️ **Cada fila lleva DENTRO su `<input type="hidden" name="performance_song_ids[]">`**, así que el
  orden del DOM **es** el orden que se guarda (`_wizard_performance_payload` respeta el orden de la
  lista): al arrastrar no hay nada que recalcular.
  ⚠️ El **Nº de canciones** sigue a lo elegido **mientras nadie lo escriba a mano** (`dataset.touched`,
  el patrón de la casa). Y **Enter añade la primera coincidencia**, no envía el asistente.
  ⚠️ Al **cambiar de artista** se limpia lo elegido (era de otro repertorio) y se recarga su catálogo
  desde `api_artist_wizard_meta` (`window.app33PerfSongs.setCatalog/clear`). Si el artista no tiene
  canciones **se dice**, en vez de no pasar nada al escribir.
  · **ESAS CANCIONES SON EL REPERTORIO de la actividad**: al crearla se siembran en su set list
  (`_seed_concert_setlist_from_performance` → `RepertoireTemplate` con owner CONCERT, el mismo que
  pinta la pestaña «Repertorio»), **en su orden y con sus duraciones**.
  ⚠️ **Solo SIEMBRA**: si la actividad ya tiene set list (se tocó a mano o se cargó una plantilla) no
  se pisa nada. Es *best-effort*: un fallo ahí no puede tumbar el alta.
  ⚠️ El repertorio que se ofrece es el de **TODOS los artistas** de la actividad
  (`_setlist_concert_artist_ids`), no solo el del primero.
  ⚠️ **De la MÁS RECIENTE a la MÁS ANTIGUA** (`Song.release_date` desc, y a igualdad el título):
  al montar un repertorio se busca lo último que ha salido, no la «A» del abecedario. Va en el punto
  único, así que lo heredan el buscador de la ficha, el del asistente (`api_artist_wizard_meta`) y el
  del set list. Como la lista de sugerencias se corta en 12, ese orden es lo que hace que se ofrezcan
  **los 12 últimos lanzamientos**.

- ⚠️ **QUIEN CREA UNA ACTIVIDAD LA SIGUE VIENDO HASTA QUE SE CONFIRMA** (sep 2026): alguien que no es
  de contratación da de alta una actividad y **la ve en el calendario, en /actividades y en la vista
  de Contratación** aunque esté RESERVADA; **al confirmarse la ve todo el mundo**. Punto único
  **`_concert_list_visible`** (usa el MISMO criterio que `_concert_visible_unconfirmed`, así que «lo
  que se ve en el calendario» y «lo que se ve en los listados» no se pueden desparejar), aplicado en
  las listas ricas de la ficha del artista, en **`/actividades`** —que antes las enseñaba TODAS, así
  que una reserva que se estaba hablando salía para toda la oficina— y en la vista de conciertos, a la
  que llega también quien trabaja en producción.

- ⚠️⚠️ **LOS FILTROS Y LA FILA DE UN LISTADO DE ACTIVIDADES SON UN SOLO SITIO** (sep 2026). Los
  filtros de la pestaña «Conciertos» de la ficha del ARTISTA y los de Contratación → Conciertos eran
  dos formularios escritos a mano y se habían desparejado (la ficha solo tenía «Cuándo» y «Estado»,
  con botón «Filtrar», sin años, sin tipo, sin anuncio y sin etiquetas); y la FILA se pintaba en
  CUATRO maquetas distintas. Ahora hay dos puntos únicos y dos parciales:
  · **FILTROS**: `_concert_filters_from_request` · `_concert_filters_apply_sql` ·
    `_concert_filters_apply_list` · `_concert_filters_context` + **`templates/_concert_filters.html`**.
    Los nombres de los parámetros NO cambian (`when`, `status`, `type`, `announcement`,
    `concert_tag`, `year`, `open`), así que los enlaces guardados siguen valiendo.
  · **FILA**: **`_concert_row`** (y su hermano `_action_row`, con las MISMAS claves) +
    **`templates/_concert_row.html`**, usados por Contratación → Conciertos, la sección Actividades,
    la pestaña Conciertos de la ficha del artista y las actividades de un EVENTO.
  ⚠️⚠️ La macro hay que importarla **`with context`**: `DEFAULT_AVATAR_URL` y `CAN_EDIT_CONCERTS`
  vienen de un context processor, no son globales del entorno de Jinja. Sin eso la fila sale sin foto
  y **sin el desplegable de estado**, y no da ningún error.
  ⚠️ El parcial de filtros trae su propio `<form>`: **no se puede incluir dentro de otro formulario**
  (un form dentro de otro no es HTML válido). Y su `modal_id` es distinto por pantalla.
  ⚠️⚠️ **CADA GRUPO DE ETIQUETAS SE CUENTA SIN SU PROPIO FILTRO** (`_concert_filters_apply_list`):
  los TIPOS con el año puesto y sin el tipo, y los AÑOS con el tipo puesto y sin el año. Antes
  `type_counts` se calculaba sobre lo ya filtrado por tipo, así que al marcar uno los demás se
  quedaban a cero, **desaparecían del pop-up** y no se podían ni combinar ni quitar (bug real). Por
  eso el TIPO DE VENTA se filtra en Python y no en SQL.
  ⚠️ El bloque de conciertos de la ficha del artista va **guardado por `tab`**: hace su consulta y
  lee todas las etiquetas de concierto de la base, y corría en las 14 pestañas.

- ⚠️⚠️ **LA AGRUPACIÓN POR «GRATUITOS» DESAPARECE, Y LA FILA DICE QUÉ ES CADA ACTIVIDAD** (sep 2026).
  Gratuito **no es un tipo de concierto** (es que la entrada es gratis, `_concert_is_free`), así que:
  · la ficha del artista ya **no agrupa por tipo de venta** (era el bloque «Conciertos — Gratuitos»):
    la lista va **plana y por fecha**, como en Contratación;
  · la fila enseña el **TIPO REAL** (a empresa, vendido, participado…) y aparte la **etiqueta verde
    «Gratuito»**;
  · se añade el **TIPO DE ACTIVIDAD con su icono** (`QUAD_ACTIVITY_ICONS`) —el icono siempre, y el
    rótulo solo cuando NO es un concierto, para no repetir lo obvio en un listado de conciertos—;
  · y la etiqueta **«No anunciar»** mientras no se pueda anunciar, que **desaparece sola** en cuanto
    se le pone fecha de anuncio o se anuncia (`_announcement_state(...) == 'NO_ANNOUNCE'`).
  ⚠️ **«GRATUITO» YA NO SE OFRECE COMO TIPO** en ningún filtro ni en ningún selector
  (`CONCERT_TYPE_CHOICES_ORDER`). Se queda en `CONCERT_SALE_TYPES_ALL` a propósito: hay actividades
  ANTIGUAS guardadas así y un enlace con `?type=GRATUITO` tiene que seguir valiendo.
  · El lugar de la fila va en el formato ÚNICO de la casa (`_place_label`: «Recinto · Municipio,
  Provincia», con el país solo si es de fuera).

- ⚠️⚠️ **LA FORMA DE PAGO DEL CACHÉ SE CONFIGURA EN LA FICHA, Y SE AVISA SI FALTA** (sep 2026).
  «Forma de pago del caché» **NO es un campo de `ConcertCache`**: es **`Concert.payment_terms_json`**
  (el plan de pagos: concepto, importe y fecha límite de cada uno), y **solo se podía configurar en
  el asistente** — en la ficha era de solo lectura y, vacío, ni se pintaba.
  · Ahora se edita dentro de la sección **«Cachés»** (filas dinámicas `data-rows="payment"` del
  motor de siempre, `concert_form.js`) y el **plan de facturación se ve aunque esté vacío**, con su
  botón para configurarlo.
  · Si no está configurada, al entrar en la ficha sale el **aviso** («Pendiente de configurar la
  forma de pago del caché», con «Configurarla») y la **tarea** en la pestaña «Inicio». Punto único
  **`_concert_cache_payment_state`**, así que el aviso y la tarea no pueden decir cosas distintas; no
  salta en lo CANCELADO ni en el histórico (`_concert_is_legacy`).
  ⚠️⚠️ **PÉRDIDA DE DATOS EVITADA**: `_parse_payment_terms_rows` crea filas NUEVAS y deja
  `invoice_url`/`invoiced_at`/`collected_at` a None, así que guardar la sección desde la ficha
  BORRARÍA las facturas subidas y las marcas de cobrado. La ficha guarda con
  **`_merge_payment_terms_rows`**: cada fila viaja con su **`payment_idx[]`** y solo se pisan
  concepto, importe, fecha y a qué caché corresponde. Un pago que ya tiene factura o cobro se pinta
  **bloqueado y sin papelera** (⚠️ `readonly` SÍ se envía; con `disabled` el pago desaparecería del
  POST y se perdería).
  ⚠️ Con **CENTINELA** (`payment_terms_present`): sin él, un POST a la sección desde una pantalla
  vieja dejaría el plan de pagos vacío (la misma regla que `promoter_costs_present`).

- **MARKETING · LA EMPRESA LA DICTA LA ACTIVIDAD** (sep 2026): en una campaña vinculada a una
  ACTIVIDAD (o a una gira o un ciclo) la empresa del grupo es **SIEMPRE la que factura esa actividad**
  y **no se pregunta**: el asistente esconde el selector y enseña cuál es, y `promotion_create` hace
  que lo del formulario **no mande** cuando el sujeto la dicta. Punto único
  **`_concert_billing_company_id`** (`billing_company_id` o, si no se ha dicho, `group_company_id` —
  el mismo criterio que la cabecera de la ficha y que la bolsa). Sobre un artista, una canción o un
  disco se sigue preguntando.
  ⚠️ El `<select>` se **DESHABILITA** al esconderlo: un campo oculto se envía igual.

- ⚠️⚠️ **CADA TAREA DE UNA ACTIVIDAD ES DE UN ÁREA, Y SOLO LA VE QUIEN TRABAJA EN ELLA** (sep 2026).
  El tablero de la pestaña «Inicio» y los avisos de la ficha se le pintaban a TODO EL MUNDO: quien
  está en producción se encontraba «Sin contrato», «Pendiente de anunciar» o «Configura el
  responsable de ticketing», que ni es suyo ni puede hacer.
  · Punto único **`_concert_task_area_ok(area)`** (+ `CONCERT_TASK_AREA_*`): **dirección lo ve todo**;
    `contratacion` → quien tenga acceso a Contratación · `ticketing` → `can_set_concert_onsale()`
    (contratación, ticketing, ventas y dirección) · `produccion` → quien tenga Producción ·
    `administracion` → quien tenga Administración.
  · `suelta(...)` (las tareas DEL DEPARTAMENTO) gana `area=` —contratación por defecto— y
    **`ver_siempre=`** para la excepción: **activar la producción es de QUIEN CREÓ la actividad**
    (`created_by_user_id`), así que a esa persona se le enseña aunque no sea de producción.
  ⚠️ **Las FASES DE UNA PETICIÓN no se filtran por área**: son de QUIEN LA PIDIÓ (llevan dueño,
  `mine` y su campanita), y filtrarlas dejaría a esa persona sin ver su propio trabajo.
  · Y en la ficha, junto al aviso de la forma de pago, sale ahora el de **«Pendiente de configurar el
  responsable de ticketing»** (con `CAN_SET_ONSALE`, que es quien puede resolverlo).
  ⚠️ Su pop-up **NO se incluye ahí**: ya está en la pestaña, FUERA de `#concert-general-zone` (esa
  zona se reemplaza por AJAX). Incluirlo otra vez dejaría **dos ids iguales** en el DOM.
  Probado con la app real: dirección ve las cinco · contratación las suyas · producción solo
  «Activar producción» · administración ninguna (y el creador, la suya aunque no sea de producción).

- ⚠️⚠️ **EN UN CONCIERTO «VENDIDO» NO SE VEÍAN LOS CACHÉS** (bug real, sep 2026). Los módulos de
  **Colaboradores, CACHÉS y Entradas y venta** estaban los tres dentro de `{% if concert.sale_type
  != 'VENDIDO' %}`, así que en un concierto VENDIDO —que es justo el que tiene caché— **no se
  pintaban ni el módulo ni su formulario**: el aviso «Pendiente de configurar la forma de pago»
  apuntaba a `#concert-caches-form`, que **no existía en la página**, y por eso «pinchas y no hace
  nada» (lo mismo desde el módulo del plan de facturación).
  · **Cachés y Entradas se ven SIEMPRE**; dentro de ese `if` se queda solo **Colaboradores** (en un
  concierto vendido no hay socios). Es el mismo error que ya se corrigió con el promotor y con las
  comisiones: esconder por tipo de venta cosas que no dependen del tipo de venta.
  · **`data-edit-focus="#id"`** (nuevo, en `ficha_inline.js`): el botón abre el formulario y lleva
  **directamente a esa parte** (aquí, `#forma-pago-cache`), que destella (`.edit-focus-flash`). Un
  formulario largo que se abre por arriba obliga a buscar el bloque.
  · Y el plan de facturación vacío lleva su propio botón **«Configurar la forma de pago»**: un texto
  que dice «pulsa el lápiz» obliga a buscar el lápiz.
  ⚠️⚠️ **EL MÓDULO SE VE AUNQUE LA ACTIVIDAD NO RECLAME NADA**: `_concert_cache_payment_state`
  devolvía el estado VACÍO en lo cancelado y en el HISTÓRICO, así que en lo antiguo no había forma de
  configurar la forma de pago. Ahora son dos cosas distintas: **`applies`** (el módulo se puede usar)
  y **`unset`/`mismatch`** (lo que se AVISA, que se callan con `silent`).
  · **Detector de botones muertos** (vale para cualquier pantalla): pedir el HTML servido y
  comprobar que cada `data-bs-target="#x"`, `data-edit-toggle="#x"`, `data-view`, `data-inline-target`
  y `href="#x"` tiene su `id="x"` en esa misma página. Así salió también un `href="#pitch"` que
  apuntaba a una zona que se llama `#pitch-zone`.

- **FICHA DE CONTRATACIÓN · RECHAZARLA Y PEDIRLE QUE LA SUBSANE** (sep 2026). En la pantalla de
  **revisión** de lo que ha mandado el promotor (`concert_contract_sheet_review`), **arriba a la
  derecha**, botón **«Rechazar ficha»** → pop-up que **exige el motivo** (es lo que él va a leer) →
  se le manda la **subsanación** y **al entrar le sale SU ficha con todo lo que ya había rellenado**:
  no empieza de cero.
  ⚠️⚠️ El endpoint `concert_contract_sheet_reject` **ya existía y no había forma de llegar a él**:
  ninguna plantilla lo enlazaba (un endpoint muerto). Al añadir un endpoint, comprobar que su botón
  está en la pantalla (`tools/check_botones.py` encuentra lo contrario —un botón sin destino— pero no
  un destino sin botón: eso se ve con `grep -rn "<endpoint>" templates/`).
  · **Lo que le deja volver a enviarla es `allow_resubmission`** (lo mira `_contract_sheet_can_submit`:
  con `status='RECEIVED'` no se puede). El rechazo lo pone a True y sella `rejected_at` +
  `rejection_reason`.
  · **El aviso amarillo de «el promotor ha cumplimentado la ficha» se cierra al rechazarla**
  (`promoter_reviewed_at` + `_notify_resolve`): ya se ha revisado, aunque el resultado sea que la
  corrija — si no, se quedaba esperando a alguien para siempre.
  · **El CORREO es el de la casa** (`_contract_sheet_reject_email_html`, el mismo esqueleto que la
  solicitud): logo de la empresa del grupo arriba a la derecha, título centrado, **el motivo
  destacado en ámbar**, la cabecera de la actividad (`_contract_sheet_hero_rows`) con el botón
  **«Subsanar la ficha»** dentro, y la frase de que no empieza de cero. Asunto por el punto único
  **`_contract_sheet_subject`** (que usa también la solicitud): dice el artista y la fecha.
  ⚠️ Si el correo NO sale **no se dice que se ha avisado**: el flash da el enlace para mandarlo a
  mano. Y si la ficha no trae correo se cae al del promotor (**`_promoter_email_phone`**: en
  `Promoter` el campo es `contact_email`, no `email`).
  · **El promotor ve QUÉ corregir**: `concert_contract_public.html` pinta el motivo en un aviso
  arriba cuando el estado es REJECTED. ⚠️ Antes solo se enseñaba en la rama `not can_submit`, o sea
  **justo cuando NO podía arreglarlo**: al pedirle la subsanación sí puede enviar, así que no lo veía.
  · El precumplimentado ya funcionaba (`_contract_sheet_prefill` + lo de `promoter_data` encima).
  Probado con la app real: el botón arriba, sin motivo no se rechaza, el correo con su motivo y su
  enlace, la página con los datos puestos, y al reenviarla vuelve a quedar pendiente de revisar.

- **EL PROMOTOR CUBRE… · SUELDOS MÚSICOS, BACKLINE y OTROS** (sep 2026): tres opciones más en
  `PROMOTER_COST_ITEMS`, así que salen solas en los DOS sitios que usan el módulo
  (`_promoter_costs_module.html`): el asistente de actividad y el de PETICIONES.
  ⚠️ En **«Otros»** lo importante es la NOTA (es donde se describe el gasto), así que su rótulo
  pregunta otra cosa: «¿Qué otros gastos cubre?».

- ⚠️⚠️ **LA CONFIRMACIÓN DEL ARTISTA SE PIDE, Y ÉL LA DA DESDE EL CORREO O LA LANDING** (sep 2026).
  La fase 2 de una petición aprobada («Confirmar con el artista») se marcaba **a mano**. Ahora se le
  pide con el aviso de siempre —vista previa, nota, canal y los ojos por módulo— pero de tipo
  **`CONFIRMAR`** (`ACTIVITY_NOTICE_KINDS`, y `ACTIVITY_NOTICE_ASK_KINDS` es el punto único de «este
  aviso espera respuesta»): el cuerpo lleva **dos botones, Confirmar y Rechazar**, y la landing
  (`public_activity_notice_view`) enseña **el mismo contenido con las mismas opciones**.
  · Lo que conteste se guarda en el propio aviso (`ConcertArtistNotification.response` ·
  `responded_at` · `response_note`), que es **el dato de verdad**: de ahí sale el «confirmada el …»
  (punto único **`_artist_confirmation_state`**) y de ahí se propaga la fase 2 de la petición
  (`artist_agreed_at`, con `artist_agreed_by_nick = "el artista"`).
  · Al contestar se **avisa a quien lo estaba esperando** (quien pidió la actividad y quien mandó el
  aviso), y un **RECHAZO no confirma nada**: la fase 3 sigue bloqueada y la tarea sale en rojo con
  el motivo.
  ⚠️⚠️ **LOS BOTONES DEL CORREO SON ENLACES A LA LANDING, NUNCA LA ACCIÓN**: un cliente de correo
  puede PREFETCHEAR un enlace, y con un GET que confirmara la actividad quedaría confirmada sin que
  nadie la hubiera pulsado. La respuesta va por **POST** desde la landing
  (`public_activity_notice_respond`, en las tres listas de públicos y exento de CSRF), y con `?r=si`
  la landing **destaca** el botón pero **no lo pulsa sola**.
  ⚠️⚠️ **EL CUERPO SE COMPONE DESPUÉS DE CREAR EL AVISO**: los botones llevan SU token, así que en
  `concert_artist_notice_send` hay que crear la fila, hacer flush, asignar `public_token` y ENTONCES
  llamar a `_activity_notice_html` (antes se componía primero). En la vista previa los botones se
  pintan igual pero sin enlace: todavía no hay token.
  ⚠️⚠️ **PEDIR LA CONFIRMACIÓN NO ES EL AVISO FORMAL** de la actividad (la fase 4, «Informar al
  artista»): `CONFIRMAR` **no toca `artist_notified_at`**. Si lo tocara, esa fase desaparecería sola
  sin haberse hecho y la compuerta de CONFIRMADO se daría por satisfecha.
  ⚠️ La landing REHACE el bloque de respuesta sobre el contexto congelado (sin contestar lo quita
  del cuerpo para no pintarlo dos veces; contestada, enseña qué se contestó). Lo ya contestado **no
  se pisa**: si el artista cambia de opinión, se le vuelve a pedir y quedan las dos veces.
  · Marcarlo **a mano** sigue estando (`booking_request_artist_agreed`) como acción secundaria: una
  conversación por teléfono también vale.

- ⚠️⚠️ **FICHA DE CONTRATACIÓN · LOS DATOS DEL PROMOTOR SON SUYOS, NO LOS DE LA CASA** (bug real y
  grave, sep 2026). El primer módulo del formulario que rellena el promotor («Datos del promotor»)
  salía con la **razón social y el CIF de la EMPRESA DEL GRUPO que factura**: la semilla
  (`_concert_contract_sheet_seed`) volcaba `billing_company.name`/`.tax_info` en `company_legal_name`
  /`company_tax_id`. O sea, se le enseñaban NUESTROS datos fiscales y se le pedía «completarlos».
  · Punto único **`_contract_sheet_promoter_seed(concert, session_db=None)`**: manda la **SOCIEDAD
  con la que factura** (`Concert.promoter_company`) y lo que no diga se completa con su ficha de
  tercero (`Concert.promoter`) — nombre o razón social, CIF, dirección fiscal en piezas, correo y
  teléfono (⚠️ con **`_promoter_email_phone`**: en `Promoter` son `contact_email`/`contact_phone`).
  Lo fusiona `_contract_sheet_prefill(..., session_db=)` **solo donde no haya nada escrito**.
  · **EL REPRESENTANTE es una SUBSECCIÓN del promotor** y sale de su ficha: es **otro TERCERO
  vinculado** con la relación «Representante» (`_promoter_representatives`, por eso hace falta la
  sesión). Su rótulo es **«Nombre completo del representante»** y lleva además su DNI, su correo y su
  teléfono (`company_representative_email`/`_phone`, campos nuevos del catálogo).
  · **Lo que YA TENEMOS sale relleno y lo que FALTA va en ÁMBAR** (`.csheet-need` + la pastilla
  «Nos falta», que las pinta el SERVIDOR al cargar): en una página pública `form_check.js` no actúa,
  y lo que hay que señalar es el hueco que le toca rellenar. Todo editable, que es como se actualiza.
  ⚠️ La macro `cfield` del módulo evita repetir el mismo markup diez veces.

- ⚠️⚠️ **LA FICHA DE CONTRATACIÓN SE VA GUARDANDO SOLA** (sep 2026): según el promotor escribe, lo
  que lleva se manda a **NUESTRO servidor** (`ConcertContractSheet.draft` + `draft_at`, endpoint
  **`public_contract_sheet_draft`**) con un respiro de 900 ms y con `sendBeacon` al cerrar la
  pestaña; abajo, la barra **«Se va guardando solo · Guardado a las 12:40»** (`.csheet-save`).
  Al volver a su enlace **sigue donde lo dejó** y **se le DICE de cuándo es** lo que se le repone
  (nunca se mezcla nada a la callada). Al ENVIARLA el borrador se limpia.
  ⚠️⚠️ **NO es un envío**: `draft` no toca `promoter_data`, ni el estado, ni avisa a nadie — para la
  casa la ficha sigue igual hasta que él le da a «Enviar», y la pantalla de revisión solo enseña lo
  ENVIADO. `_contract_sheet_draft` descarta el borrador anterior a lo último que mandó.
  ⚠️ Es la EXCEPCIÓN a «en una página pública no se guarda nada»: esa regla es del guardado LOCAL
  (`form_autosave.js`, que dejaría datos en el disco de un tercero). Aquí se guarda en su propia
  ficha de nuestra BD, así que además le vale desde otro dispositivo. Por eso el `<form>` lleva
  **`data-no-autosave`**: si no, con sesión abierta salían los DOS avisos diciendo lo mismo.
  ⚠️ Solo se repone lo que TIENE valor: un borrador a medias no puede borrar lo que ya sabemos.

- **EL CORREO DE LA FICHA DE CONTRATACIÓN · el botón, dentro del bocadillo y abajo a la derecha**
  (sep 2026): punto único **`_contract_sheet_email_card`** (foto y datos arriba, y el botón **abajo
  a la derecha DENTRO del bocadillo**, la misma maqueta que `_notice_email_html`), usado por la
  SOLICITUD y por la SUBSANACIÓN — así no se pueden desparejar. Las imágenes van con
  `_absolute_media_url` (en un correo una ruta relativa no se ve, y de paso recorta el «?» que
  dejaba storage3).
  · **Y LA PREVISUALIZACIÓN ES EL CORREO**: el pop-up de solicitar la ficha enseña en un `<iframe>`
  el MISMO HTML que se manda (`concert_contract_sheet_preview`, que se refresca al escribir el
  mensaje) con su logo y su bocadillo; antes era un listado de campos. ⚠️ No crea nada: si la ficha
  aún no tiene enlace se pinta uno de muestra (se genera al enviarla).

- ⚠️⚠️ **LA FICHA DE CONTRATACIÓN SE GOBIERNA DESDE SU PESTAÑA** (sep 2026, `_contract_sheet_head.html`).
  «Editar ficha» y el estado de la ficha del promotor estaban en la **barra de botones rápidos** de
  la actividad, que es para lo que vale en TODA ella (el PDF, avisar al artista, las invitaciones):
  esas dos cosas son de la pestaña **«Ficha de contratación»** y ahora viven **arriba a la derecha
  DENTRO de ella**.
  · **UN SOLO CONTROL para el estado**, y siempre se puede pinchar para **volver a mandarla**:
  sin enviar → **«Solicitar ficha al promotor»** · **ENVIADA → amarillo «Ficha enviada»** ·
  **RECIBIDA → verde con el check «Ficha recibida»** · **RECHAZADA o con cambios pedidos → amarillo
  otra vez** («Ficha enviada · pendiente de subsanar»). Antes la etiqueta y el botón de reenviar eran
  dos cosas, y con la ficha recibida no había forma de volver a pedirla sin ir a los tres puntitos.
  ⚠️ **El rechazo MANDA sobre «recibida»**: aunque el promotor ya hubiera mandado algo, si se le han
  pedido cambios eso todavía no vale y no puede salir en verde.
  ⚠️ La cabecera va **FUERA de `#concert-general-zone`**: esa zona se reemplaza por AJAX al guardar
  una sección y se llevaría por delante el botón (y con él, el modo edición).

- ⚠️⚠️ **UN PAYLOAD SIN CLASIFICAR SE PINTA COMO JSON EN CRUDO EN LA FICHA** (bug real, sep 2026).
  «Más información de la actividad» vuelca **todas** las claves de los payloads que no se pintan en
  otro sitio (`shown_keys` en `_concert_contracting_general_rows`). Las TRES funciones de contacto
  que no son ticketing viven en `ticketing_payload['contacts']` y no estaban en esa lista, así que
  salían tal cual: **«Ticketing · Contacts: {"PRODUCCION_LOCAL": {"kind": "THIRD"…}}»**.
  ⚠️ Al guardar algo nuevo en un payload de la actividad hay que **añadir su clave a `shown_keys`**
  si ya se pinta en su propio módulo.

- ⚠️⚠️ **LA FICHA DE CONTRATACIÓN, EL AVISO AL ARTISTA Y LOS BOTONES DESTACADOS** (sep 2026, tres
  cosas que se pidieron juntas porque son el mismo proceso: lo que está pendiente se ve, y lo que ya
  está hecho deja de ocupar sitio en la barra).
  · **EL ESTADO DE LA FICHA ES UN PUNTO ÚNICO**: **`_contract_sheet_state(session_db, concert,
  sheet=None)`** → `exists` · `sent` · `sent_at`/`sent_at_label` · `sent_to`/`sent_to_label` ·
  `pending` · `received` · `reviewed` · `rejected` · `status`. De él viven la barra de botones, la
  rueda y los avisos, así que no pueden decir cosas distintas.
  ⚠️⚠️ **«ENVIADA» ES QUE EL CORREO SALIÓ**: `sent_at` se sella **solo si `ok`**
  (`_send_optional_email` devuelve `(ok, error)`). Antes se marcaba siempre, así que una ficha que
  nadie había recibido figuraba como enviada y se esperaba una respuesta que no podía llegar.
  · **LO QUE SE VE EN LA BARRA**: sin enviar → **«Solicitar ficha al promotor»**; enviada → la
  etiqueta **«Pendiente de recibir ficha»** (con a quién y cuándo al pasar el ratón) y el botón pasa
  a **«Reenviar ficha»**; **recibida** → etiqueta «Ficha recibida» y **el botón SALE de los
  destacados** y se queda en los **tres puntitos** («Volver a enviar la ficha al promotor»), por si
  hay que pedirla otra vez.
  · **IGUAL CON EL AVISO AL ARTISTA**: una vez notificado (o confirmado por él), **«Notificar al
  artista» sale de los destacados en TODAS las actividades** y queda en la rueda («Volver a avisar al
  artista»); en la barra solo se queda la etiqueta. Vuelve a salir **si hay cambios gordos**
  (`_concert_notice_signature`: fecha, hora, recinto o cachés) o si se cancela — que es justo cuando
  hay que volver a decírselo.
  · **EL ALTA CON «SOLICITAR LA FICHA» LA ENVÍA SOLA**: al terminar el asistente en modo
  `request_sheet` se crea la actividad en BORRADOR **y sale el correo** con el mismo contenido que el
  botón de la ficha (`_contract_sheet_subject` + `_contract_sheet_request_email_html`: un solo
  motor).
  ⚠️⚠️ **Y SI NO SE SABE EL CORREO DEL PROMOTOR, TAMPOCO SE PIERDE EL ALTA**: al continuar sin él
  sale un pop-up con las DOS opciones —**«Añadir el correo»** y **«Crearla sin enviar la ficha»**
  (`sheet_skip_email`)—, y con la segunda la actividad se crea con su ficha **preparada y sin
  enviar**, llevando a su ficha con el formulario de envío abierto. Sin decidir nada no se crea.
  ⚠️⚠️ **SI EL CORREO NO SALE, LA ACTIVIDAD NO SE PIERDE**: se crea igual, la ficha **NO** figura
  como enviada y se redirige a **`?tab=general&open=ficha`** con el flash rojo, o sea a su ficha con
  **el formulario de enviarla ABIERTO**, para corregir el correo y mandarla — o dejarla sin enviar.
  Perder el alta entera por un correo que rebota sería lo peor que podría pasar ahí.
  · **CUANDO EL ARTISTA CONFIRMA, ESO YA ES LA COMUNICACIÓN**: `_concert_notice_gate` abre la
  compuerta si `_artist_confirmation_state` dice que contestó que sí, y en la ficha sale
  **«Confirmar la actividad»** (verde, `concert_confirm_after_artist`), que la deja CONFIRMADA de un
  clic y apunta el aviso a mano con la nota «El artista confirmó la actividad desde el aviso que se
  le mandó.». Un **rechazo** se ve como tal y **no abre** la compuerta.
  ⚠️ Ese bloque va **FUERA de `{% if peticion_phases %}`**: metido dentro solo salía en las
  actividades que venían de una petición (bug real de esta épica).
  ⚠️ En `concert_detail_view` la sesión se llama **`session`** y la actividad **`c`**: un
  `session_db`/`concert` copiado de otra función es un **NameError → 500 → pantalla de
  mantenimiento**, y **pyflakes no lo detecta** porque esos nombres existen en otros ámbitos.

- ⚠️⚠️ **QUE NO SE QUEDE NINGUNA ACTIVIDAD SIN ANUNCIAR** (sep 2026). A **CUATRO SEMANAS**
  (`ANNOUNCE_ALERT_DAYS` = 28) de la fecha, una actividad que sigue sin anunciar —o marcada **«No
  anunciar»**, que a un mes vista es una decisión que hay que repasar— ya es un problema: la entrada
  no se vende sola. La app avisa ELLA (`_announce_alert_sweep`, del cron único, cada hora):
  · **a un mes** → aviso (campanita **y correo**) a **quien la GESTIONA**: **quien la creó**
    (`Concert.created_by_user_id`, o sea contratación o sello según de dónde haya salido) y, si no
    consta, el departamento de **Contratación** (y si tampoco hay nadie, dirección);
  · **a los 3 días** (`ANNOUNCE_ALERT_REMIND_DAYS`), si sigue sin anunciarse, **se le insiste**;
  · **a 15 días** (`ANNOUNCE_ALERT_DIRECTION_DAYS`) → se le dice a **DIRECCIÓN**, con el asunto que
    pidió Dani: **«Aviso: \<tipo\>, \<nombre o municipio\>, de \<artista\> del \<día de la semana y
    fecha\>, todavía no se ha anunciado.»** (punto único `_announce_alert_subject`).
  ⚠️ El escalado **nunca el mismo día** que el primer aviso: a quien la gestiona hay que darle margen
  (si no, en una actividad que entra ya dentro de los 15 días saldrían los dos avisos a la vez).
  ⚠️ **`email_repeat=True`**: es un recordatorio que se repite, y la regla de la casa («por correo
  solo la primera vez») lo dejaría sin salir.
  · **QUÉ SE ANUNCIA**: lo que tiene público (`ANNOUNCE_ACTIVITY_TYPES`: conciertos, festivales,
  ciclos, promocionales, TV, marca, premios y firmas). Un ENSAYO, una grabación o una reunión **no**.
  Tampoco un **BORRADOR** (es un apunte a medias), ni lo cancelado, ni el histórico. Una **RESERVA
  sí** —a un mes vista una fecha sin cerrar es justo lo que hay que mirar— y el aviso lo DICE.
  · **ANUNCIAR ES COMUNICARLO**: el aviso lleva a la pantalla de siempre del aviso al artista con el
  tipo nuevo **`ANUNCIO`** («Ya se puede anunciar»), que es el MISMO contenido de la actividad más
  dos módulos: **CARTELERÍA** (las piezas aprobadas y el enlace público para descargarlas —nunca la
  URL de Storage—) y **EL ANUNCIO** (qué día se anuncia y cómo va la venta), con su vista previa, su
  nota, sus ojos y sus destinatarios. **Al enviarlo, la actividad queda ANUNCIADA** con la fecha que
  se elija y el reclamo **se cierra solo** (`_notify_resolve`).
  ⚠️ **SIN CARTELERÍA no se manda de primeras**: se avisa y hay que pulsar «Avisar sin carteles» a
  propósito (hay actividades que se anuncian sin cartel, pero no puede pasar sin darse cuenta).
  ⚠️ **ANUNCIO no marca el aviso formal** de la actividad (`artist_notified_at`), como CONFIRMAR: son
  comunicaciones distintas y la fase «Informar al artista» desaparecería sola sin haberse hecho.
  · **Dónde se ve**: la **tarea** de la pestaña «Inicio» de la actividad, que a partir de las cuatro
  semanas dice **cuántos días faltan** y lleva a «Anunciar y avisar al artista»; y la **etiqueta del
  anuncio** de la cabecera, que gana esa misma opción. Punto único `_announce_alert_state`, así que
  la tarea, la ficha y el aviso automático no pueden decir cosas distintas.
  ⚠️ Columnas nuevas en `Concert` (`announce_alert_at` · `_2_at` · `_dir_at`), **cada una en su
  propia sentencia** del `ensure_*` (la regla de la casa: dentro de un ALTER que ya existe puede no
  ejecutarse nunca y la app revienta al leerla).

- ⚠️⚠️ **LA FECHA DE ANUNCIO PUEDE LLEVAR HORA, Y LA CONFIRMA EL PROMOTOR** (sep 2026). Hay
  actividades que se publican a una hora pactada, así que `Concert` gana **`announcement_time`**
  («HH:MM», opcional, **en su propia sentencia** del `ensure_*`) y se pone en **dos sitios que son el
  mismo dato**: el desplegable de la **etiqueta del anuncio** de la cabecera (que ahora la enseña:
  «Anuncio: 09/10/2026 · 12:00») y el **enlace que se le manda al promotor** para que la confirme él.
  · Todo lo de pedírsela —el botón de la barra, el correo con sus dos botones y la página del
  calendario— está en **`docs/app/carteleria.md`** (es la misma conversación que la de los carteles).
  ⚠️ «No anunciar» y «Anunciado hoy» **limpian la hora**: si no, quedaría una hora de un plan que ya
  no existe.

- ⚠️⚠️ **EL DÍA DEL ANUNCIO, AL ARTISTA LE LLEGA UN SMS CON SUS CARTELES** (sep 2026, lo pidió Dani).
  Los carteles se le mandan en cuanto están aprobados (ver `carteleria.md`), pero el día que toca
  publicar hay que **recordárselo**: **`_announce_reminder_sweep`** (cron único, **cada 5 minutos**,
  para que la hora concreta se respete de verdad) manda
  *«Recuerda que hoy a las 12:30 se publica el concierto de Móstoles. Aquí tienes los carteles: … »*.
  · **CON HORA**, a esa hora; **sin hora**, a partir de las 9:00 (`ANNOUNCE_REMINDER_HOUR`).
  · **EL ENLACE DE VENTA solo si ya se puede comprar**: si la salida a la venta es más tarde (o no
  hay enlace) **no se pone** — mandar un enlace que no vende es peor que no mandar nada
  (`_announce_sale_url`).
  ⚠️ **Si el SMS no puede salir** (sin pasarela, sin teléfono) **va por correo**, y si tampoco hay a
  quién, se le dice a **quien gestiona la actividad** para que avise él: un recordatorio que no sale
  es justo el que hacía falta. Se sella `announce_reminder_at` en cualquier caso, así que no se manda
  dos veces.

- ⚠️⚠️⚠️ **LA FICHA DE CONTRATACIÓN PERDÍA 16 CAMPOS EN CADA GUARDADO** (bug real y gordo, sep 2026:
  «meto datos, le doy a guardar y al rato han desaparecido»). `_parse_contract_sheet_form` devolvía
  un diccionario con **todas** las claves —las que no venían, a `''`— y los tres sitios que lo
  llamaban hacían `sheet.data = _parse_contract_sheet_form(form)`, o sea **reemplazaban la ficha
  entera**. Como el formulario por módulos ya no pinta 16 de esas claves, cada guardado las VACIABA
  sin dar ningún error: `gala_date`, los tres **económicos** (caché, reparto de taquilla,
  observaciones), los cuatro de **producción técnica**, la dirección de la **producción local**, el
  DNI de su responsable, `show_types`, `promotion_mobile` y `promotion_announcement_date`. Pasaba por
  los TRES caminos —editarla por dentro, enviarla el promotor y **consolidarla** (que parte de lo
  nuestro, ya vaciado)—, que es justo lo que contaba Dani.
  · **Arreglo**: `_parse_contract_sheet_form(form, base=...)` parte de lo guardado y **solo pisa lo
  que el formulario TRAE** (la regla de la casa para cualquier guardado parcial). Cada llamada pasa
  su base: el borrador el suyo, el envío del promotor su `promoter_data` y la edición `sheet.data`.
  · ⚠️ Las **casillas y las listas** no viajan cuando están vacías, así que para poder distinguir
  «las ha quitado» de «no venían» el módulo lleva el centinela **`ticketing_present`** (ticketeras,
  taquilla física y tipos de entrada).
  ⚠️ Comprobación (`prueba_ficha.py`, con la app real): con el código de antes se perdían **10 de
  10** campos vigilados; ahora **0**.

- ⚠️⚠️ **EL VALOR IBA EN MEDIO DEL CORREO, NO PEGADO A SU ETIQUETA** (sep 2026). En el aviso al
  artista y en el de salida a la venta las filas son una `<table width="100%">` con DOS celdas sin
  ancho: los clientes de correo la reparten **al 50/50**, así que el importe del caché salía flotando
  en mitad del email. Con **`width="1%"` + `nowrap`** en la etiqueta (y `99%` en el valor) se lee
  «Caché fijo: 12.000,00 €» seguido. Las dos maquetas son la misma y se arreglaron a la vez.

- ⚠️⚠️ **SI UNA COMISIÓN REDUCE EL CACHÉ, ESA COMISIÓN SE ENSEÑA** (sep 2026, lo pidió Dani). Antes se
  restaba en bloque («Menos comisiones: − 1.000 €»): al artista le llegaba un caché más bajo que el
  pactado y un descuento anónimo. Ahora el módulo de Caché saca el caché COMPLETO, debajo **cada
  comisión que lo reduce con su nombre y su concepto**, y al final **«Queda»**. Va dentro del propio
  módulo de caché, así que no se puede dejar fuera por su cuenta.
  · Y si **no hay filas de `ConcertCache` pero la ficha de contratación dice el caché**
  (`economics_cache`), se enseña eso en vez de «Sin Caché»: el dato existe.

- ⚠️ **LO QUE ESTÁ EN LA FICHA TIENE QUE SALIR EN EL AVISO** (sep 2026). `_contract_sheet_hero_rows`
  —la cabecera que comparten la ficha, el correo y el formulario del promotor— se dejaba cuatro
  datos que sí estaban rellenos: **apertura de puertas**, **fecha de fin**, **salida a la venta** (no
  en lo gratuito) y **anuncio** (con su hora). Ahora salen, y las horas «por confirmar» lo dicen.

- ⚠️⚠️ **EL PRECUMPLIMENTADO DEL ASISTENTE NO PUEDE COLGAR SOLO DE `shown.bs.modal`** (bug real, sep
  2026: «al configurar una petición me vuelve a preguntar el promotor, la persona de contacto y de
  quién es la actividad, y eso ya estaba en la petición»). Dos agujeros, y con cualquiera de los dos
  no se volcaba NADA y sin un error por consola: `shown.bs.modal` **no siempre llega** (trampa ya
  conocida de la casa con `modal_stack.js` de por medio) y el listener era **`once`**, así que a la
  segunda apertura ya no volcaba aunque el evento llegase. Ahora se vuelca en el **propio clic** del
  botón (delegado en `document`) y en cada `shown`, con una **bandera por apertura** que se limpia al
  cerrar el modal — la bandera es lo que impide que un modal de encima (el alta rápida de un
  promotor) dispare el volcado al cerrarse y **pise el promotor recién creado**.

- ⚠️⚠️ **LOS CONTACTOS SE GUARDAN AL SELECCIONAR, Y UNA FUNCIÓN ADMITE VARIAS PERSONAS** (sep 2026,
  lo pidió Dani). El módulo de la ficha **ya no tiene botón de editar**: cada función tiene su **«+»**
  —buscar en TODA la base (`api_contact_search`, con foto) o crear el tercero al vuelo con el «+» de
  siempre— y su **«x»**, y **cada acción se guarda en el acto**.
  · **Punto único**: `_activity_contact_list` / `_activity_contact_set_list` / `_add` / `_remove`.
  Con UNA persona se guarda como **dict**, igual que siempre (compatible con todo lo que ya hay
  guardado); solo con varias se guarda una **lista**. `_activity_contact_raw` devuelve el primero,
  así que el formulario de siempre y los avisos siguen valiendo sin tocar nada.
  · **No hay endpoint nuevo**: la acción va por `concert_section_update` con `section=contactos` y
  `cc_action=add|remove`, o sea por el **mismo permiso** de siempre, y repinta
  `#concert-general-zone` con el motor `data-inline`. Así no hay que tocar el catálogo de permisos.
  ⚠️ El JS va **delegado en `document`** (`concert_contacts.js`): la zona se reemplaza por AJAX en
  cada guardado y un listener pegado a un nodo de dentro moriría en el primer repintado.
  ⚠️ El `<form>` con la acción vive en **`concert_detail.html`**, NO en el parcial: apunta a
  `#concert-general-zone`, que solo existe en la ficha, y el parcial se incluye también en el
  ASISTENTE, que se pinta en una docena de pantallas donde esa zona no existe (lo cazó
  `tools/check_botones.py`: 12 avisos nuevos de golpe).

- ⚠️⚠️ **EN UNA ACTIVIDAD GRATUITA NO HAY CONTACTO DE TICKETING** (sep 2026). Si no se venden
  entradas no hay a quién pedirle las ventas: esa función no se pinta, no se pregunta y no se
  guarda. Punto único **`_activity_contact_roles_for(concert)`**, que usan el módulo y el guardado.

- ⚠️⚠️ **CONTRATACIÓN ES, DE SERIE, EL CONTACTO DEL PROMOTOR** (sep 2026). Con quien se cierran el
  contrato y la facturación es él mientras no se diga otra cosa, así que la función sale **propuesta**
  con un botón de un clic («Poner a X · Es el contacto del promotor»). Se PROPONE, no se guarda sola:
  en cuanto se añade a alguien a mano, manda lo añadido.

- ⚠️⚠️ **UNA PERSONA DE UNA FICHA NO ES SU EMPRESA** (bug real de esta épica, sep 2026). Al buscar
  salen las dos cosas: TERCEROS y las PERSONAS de contacto que cuelgan de una ficha
  (`PromoterContact`). Guardar a la persona como `THIRD` con el id de su empresa ponía de contacto a
  la EMPRESA — se elegía «Paco Producción» y quedaba «Promotora Demo». Por eso hay un tipo
  **`CONTACT`** con su `contact_id`, que se resuelve EN VIVO desde su ficha como los demás.
  ⚠️ **Fuera de `TICKETING_CONTACT_KINDS` a propósito**: ese catálogo son los TRES botones del pop-up
  de «a quién se le piden las ventas» y añadir uno cambiaría esa pantalla; la etiqueta va suelta en
  `TICKETING_CONTACT_LABELS`.

- ⚠️ **LO QUE EL PROMOTOR RELLENA EN SU FICHA ES UN CONTACTO DE LA ACTIVIDAD** (sep 2026). Los
  responsables de ticketing, de producción técnica, de producción local y el representante de la
  empresa se quedaban SOLO en la ficha de contratación y había que volver a apuntarlos a mano. Al
  CONSOLIDARLA se ponen de contacto (`_activity_contacts_from_sheet`, mapa
  `CONTRACT_SHEET_CONTACT_FIELDS`) y el flash lo DICE.
  ⚠️ **Solo en las funciones que estén VACÍAS**: lo que alguien haya puesto a mano no se pisa nunca.

- ⚠️⚠️ **EL PROMOTOR ES EL PRIMER MÓDULO DE LA FICHA** (sep 2026, lo pidió Dani). Antes aquí solo
  había una tira con su nombre y sus datos —CIF, dirección fiscal, representante— estaban
  desperdigados en «Más información». Ahora es UN módulo con todo lo suyo: quién es, sus datos, su
  REPRESENTANTE y sus CONTACTOS **en fila, uno al lado del otro** (que es como se miran el día de la
  actividad). Punto único **`_concert_promoter_module`**, el MISMO del PDF.
  ⚠️ En las tarjetas de contacto: `flex:0 0 auto` en la foto y `min-width:0` en el texto — sin eso,
  en un flex la foto se encoge hasta salir ovalada y el nombre se parte letra a letra.

- ⚠️⚠️ **FUERA «MÁS INFORMACIÓN DE LA ACTIVIDAD»** (sep 2026). Era un volcado de TODO lo que no se
  pintaba en la cabecera, así que repetía lo que ya sale en su propio módulo más abajo (el promotor,
  los cachés, el equipamiento, el formato…) y obligaba a leer lo mismo dos veces. Se ha quitado de la
  ficha **y del PDF**, donde ocupaba el mismo sitio. `contracting_general_rows` sigue existiendo: lo
  usan la cabecera y el resto del PDF.

- **EL PDF DE LA FICHA, MÁS SIMPLE Y CON LOS CONTACTOS** (sep 2026): la tira de la cabecera dice
  QUIÉN promueve, y debajo van **«Datos del promotor»** (sociedad, CIF, dirección fiscal, contacto y
  representante — solo si hay algo) y **«Contactos»** por función con su correo y su teléfono, que no
  estaban en el PDF y son lo que hace falta el día de la actividad.
  ⚠️ **Bug real que salía en el PDF: «None% · Neto»** en las comisiones. Se recomponía la etiqueta a
  mano mirando `commission_type` (que no siempre está) en vez de usar el punto único
  `_concert_commission_rows`. Ahora sale el importe bien **y si es un gasto o si reduce el caché**,
  que es lo que cambia la cuenta.

- ⚠️ **LAS NOTAS DE CONTRATACIÓN SE PUEDEN MANDAR EN EL AVISO, PERO NO SALEN SOLAS** (sep 2026, lo
  pidió Dani). Son NUESTRAS y son internas, así que su módulo existe pero sale **apagado de serie**
  (`ACTIVITY_NOTICE_OPT_IN_MODULES`): hay que encenderlo a propósito con su ojo. La primera vista
  previa se pinta ya con ese módulo oculto, y de ahí en adelante el front manda la lista de ocultos
  como siempre. Al revés —que salieran de serie— sería mandarle al artista sin querer lo que se
  apunta en casa.

- ⚠️⚠️ **«OTRAS PERSONAS DE CONTACTO» ES UNA CATEGORÍA DEL MÓDULO, NO UN MÓDULO APARTE** (sep 2026,
  lo pidió Dani). Había **DOS cajas de contactos** en la misma pantalla —las cuatro funciones, y
  aparte «Otras personas» con su propio botón de editar y su propio sistema (`ConcertContact` + el
  `cc-picker`)—, cada una con su forma de añadir gente. Ahora **`OTROS` es la quinta entrada de
  `ACTIVITY_CONTACT_ROLES`**: misma tarjeta, mismo «+», misma «x» y el mismo guardado al seleccionar,
  a ancho completo porque es una lista y no una función de una persona.
  ⚠️ Lo que ya estaba apuntado con el sistema anterior **se sigue viendo ahí dentro**, con la función
  que tenía como etiqueta; su clave lleva el prefijo **`cc:`** para que quitarla borre SU fila
  (`ConcertContact`) y no la busque en el payload, donde no está.

- **EL ORDEN DE LA FICHA** (sep 2026, lo pidió Dani): el **promotor** arriba y, debajo, el dinero en
  el orden en que se piensa — el **caché**, lo que se descuenta de él (**comisiones y otros gastos**)
  y cómo se cobra (**el plan de pago**). Después, el resto.
  ⚠️ Cachés, comisiones y el plan estaban repartidos entre dentro y fuera de `data-datos-view` (la
  zona que se oculta al editar los Datos): los tres van ahora **fuera**, así que editar los datos ya
  no esconde el dinero.

- ⚠️⚠️ **LA FICHA EN PDF: LA CABECERA DE LA CASA Y UNA SOLA CARA DE A4** (sep 2026, lo pidió Dani).
  · **La misma cabecera que el correo y la ficha**: el logo del grupo arriba a la derecha y una
  **banda en el rojo corporativo** con el TIPO de actividad encima del título y, debajo, de quién y
  cuándo es. Antes era un título negro suelto que no se parecía a nada.
  · **El mismo orden que la ficha**: el promotor, el **caché**, lo que se le descuenta (**comisiones
  y otros gastos**) y **el plan de pago**. Estaban caché y comisiones al revés, así que el papel y la
  pantalla se leían distinto.
  · **CABE EN UNA CARA**: lo único que puede crecer sin límite son las notas, así que se pintan las
  **6 últimas** (recortadas a 220 caracteres) y se DICE cuántas quedan — para leerlas todas está la
  ficha. Probado con **23 notas largas: 1 página**.
  ⚠️ **`esc_pdf`**: el texto de un `Paragraph` de ReportLab se lee como mini-HTML, así que un «&» o
  un «<» en el nombre de un artista o de un recinto **rompe el PDF entero** (no se genera).
  ⚠️ Dos cosas que salían en crudo en el plan de pago: el estado (**«PENDING_INVOICE»** en vez de
  «Por facturar») y una fecha guardada como texto (**«2026-10-01»** en vez de «01/10/2026»).

- ⚠️⚠️⚠️ **`(int or "").strip()` → 500 EN LA FICHA DE CUALQUIER ACTIVIDAD CON MEET & GREET** (bug real
  y grave, en producción **desde el 26-jul-2026**). En `_concert_contracting_general_rows`, el número
  de personas del M&G se comprobaba con `(_mg.get("quantity") or "").strip()` — y `quantity` es un
  **número**, así que `AttributeError: 'int' object has no attribute 'strip'` y la ficha entera daba
  la **pantalla de mantenimiento**. Solo se libraban las actividades cuyo M&G no dice de cuántas
  personas es, que es justo lo raro.
  · **Arreglo**: `str(...)` antes del `.strip()`, en `quantity` y en `moment`.
  ⚠️ **Lo cazó `tools/check_divs.py`** en cuanto una actividad de prueba tuvo un M&G con cantidad:
  3 pantallas en 500 (la ficha, su ancla del plan de facturación y la pestaña de producción). Es la
  razón de pasar la comprobación con datos REALISTAS, no con la base a medias.

- ⚠️⚠️⚠️ **UN ID QUE YA NO EXISTE TUMBABA EL ALTA ENTERA** (bug real y grave, sep 2026: «al
  convertir en actividad una petición ya aprobada, termino todos los pasos y me dice *No se ha
  creado la actividad. Repasa los datos marcados*»). El asistente arrastra ids que se eligieron
  ANTES —el promotor y las personas de contacto que trae una PETICIÓN en su payload, la empresa que
  dijo contratación al aprobarla, un recinto, una gira—, y entre medias esa ficha puede haber
  desaparecido: el camino normal es una **FUSIÓN de duplicados** (se queda la buena y la otra se
  borra con sus personas), pero vale cualquier borrado. Postgres rechazaba la clave ajena, reventaba
  el `commit` final y **se perdía todo lo tecleado** con un aviso que no decía qué mirar: ni se podía
  arreglar ni se sabía qué pasaba, porque el motivo solo salía en el log del servidor.
  · **Punto único `_id_vivo(session, Modelo, valor)`**: devuelve el id **solo si la fila sigue
  existiendo**. Lo usan el artista, el promotor (y su sociedad, y el medio), la empresa del grupo, el
  recinto, la gira, el ciclo/festival, quien lleva la producción y **`_replace_concert_contacts`**
  (que además es el punto único de la ficha, así que vale para los dos sitios).
  · **Lo que se cae SE DICE** y no se tira el alta: «La actividad se ha creado, pero esto ya no
  existe en la base de datos y se ha quedado sin poner: el promotor. Ponlo en su ficha.» Tirar cien
  campos rellenos por una ficha borrada sería lo peor que podría pasar.
  · ⚠️ **Si NO queda ningún artista vivo**, sí se para: es el `ValueError` de siempre («Debes
  seleccionar al menos un artista»), que se entiende y se arregla en el sitio.
  · **RED DE SEGURIDAD `_wizard_error_message`**: si aun así se cuela una clave ajena rota por otro
  camino, el aviso **dice cuál es** («el recinto que habías elegido ya no existe…», mapa
  `WIZARD_FK_LABELS`) en vez del mudo «repasa los datos marcados». Lo que no es eso sigue yendo al
  log y no se enseña en crudo.
  ⚠️ Probado con la app real reproduciendo el fallo (el contacto de la petición borrado después de
  aprobarla): antes **no se creaba nada**, ahora se crea y se avisa de lo que faltó.

- ⚠️⚠️ **LOS CONTACTOS DE SIEMPRE DE UN PROMOTOR SALEN YA PUESTOS, Y «OTRAS PERSONAS» DEJA DE SER UNA
  CAJA APARTE EN EL ASISTENTE** (sep 2026, lo pidió Dani). Dos cosas:
  · **El asistente tenía DOS cajas de contactos**: las funciones por un lado y «Otras personas de
  contacto» por otro, con el selector viejo (`ConcertContact` + el `cc-picker`) y su propia forma de
  añadir gente. En la ficha ya se había unificado en agosto; el asistente se quedó a medias. Ahora el
  asistente usa **EL MISMO MÓDULO que la ficha** (`_activity_contacts.html`), con las **cinco**
  funciones —OTROS incluida—, el mismo «+», la misma «x» y la misma barra de búsqueda.
  · **Lo que ya se configuró para ese promotor (o para el MEDIO que hace de promotor) sale YA
  PUESTO**, no propuesto con un botón que había que pulsar función por función: la gente que lleva a
  un promotor es casi siempre la misma, así que lo que hace falta es poder **quitar** a quien no vaya.
  Se dice de dónde sale con la etiqueta **«Los de siempre»**.
  · **Una función admite VARIAS personas también EN EL PROMOTOR**
  (`_promoter_default_contact_list` / `_set_list` / `_add`): con una se guarda como **dict**, igual
  que siempre, y solo con varias como lista — así todo lo guardado se sigue leyendo.
  ⚠️⚠️ **NO SE COPIA NADA AL PINTAR**: lo heredado se lee EN VIVO del promotor y solo se escribe en la
  actividad cuando alguien toca esa función (`_activity_contacts_materialize`). Así corregir un
  correo en la ficha del tercero sigue valiendo para todas sus actividades, y abrir una ficha no
  escribe en la base de datos.
  ⚠️⚠️ **EL CENTINELA `ticketing_payload['contacts_own']`** es lo que hace que la «x» funcione: sin
  él, quitar al último heredado dejaba la lista vacía… y la función volvía a heredar, así que la
  persona reaparecía y el botón parecía roto.
  ⚠️ **«Otras personas de contacto» NO se hereda ni se propaga** (`_activity_contact_role_inherits`):
  es el cajón de ESA actividad (el técnico de ese día, el del ayuntamiento), no una función que el
  promotor tenga siempre cubierta por la misma persona.
  ⚠️ En el alta, lo elegido viaja en ocultos **`ac_pick_<ROL>[]`** (todavía no hay actividad donde
  guardar al vuelo) con su **centinela `ac_picks_present`**, y `_activity_contacts_apply_picks` lo
  escribe y lo deja como lo de por defecto del promotor — el alcance en un alta es siempre «para
  todas», que es lo que hace que la siguiente actividad ya salga con esa gente.
  ⚠️ Los contactos que traía una **PETICIÓN** se vuelcan ya en su función
  (`_peticion_contact_people`, mapa `PETICION_CONTACT_ROLE_MAP`: comunicación → «Otras personas»), y
  **pisan** lo heredado: lo que se pidió para ESA actividad manda sobre «los de siempre».
  ⚠️ `static/js/activity_contacts.js` se ha **retirado**: era el JS del modo formulario viejo y ya no
  lo usaba nadie. Su única API viva (`app33ActivityContacts.set`, que usa el comisionista marcado
  como producción local) es ahora `app33ActivityPicks.add`.
  ⚠️ Prueba de regresión: **`tools/check_contactos.py`** (20 comprobaciones con la app real).

- **EL CUADRANTE · EL CACHÉ FIJO Y EL VARIABLE VAN EN DOS COLUMNAS** (sep 2026, lo pidió Dani).
  Antes había **una sola** columna «Caché» con todo pegado («12.000€ · 70%»): ni se podía leer de un
  vistazo ni sumar, y un **«70 %» suelto no dice nada** —¿de qué?, ¿desde cuándo?—.
  · **Caché** = lo que se cobra SEGURO: la suma de las líneas cerradas (`_cache_fixed_text`). Un
  «Otros» con importe cerrado también entra, porque se cobra igual.
  · **Caché variable** = cada línea que **depende de algo**, con su condición entera
  (`_cache_variable_text`): «70% · Bruto · % de taquilla desde 10.000 € de recaudación», «2,00 € ·
  Importe fijo por entrada vendida (desde la entrada 300)».
  ⚠️ **La condición NO se escribe en el cuadrante**: sale de **`_cache_row_readable`**, el punto
  único del que ya comían la ficha y lo que se le comunica al artista
  (`_concert_cache_readable_rows` → `CACHE_VARIABLE_OPTION_LABELS`, espejadas en
  `static/js/concert_form.js`). Escrita aparte, el cuadrante y la ficha acabarían diciendo cosas
  distintas del mismo caché.
  ⚠️ **Qué es «variable» lo decide `is_variable`**: el tipo VARIABLE **o cualquier línea con
  porcentaje**. No vale mirar solo `kind`, porque un «Otros» con un 15 % tampoco está cerrado.
  ⚠️ El **«Caché total»** de la cabecera del artista sale ahora del MISMO criterio
  (`_cache_amount_total`): antes sumaba también el importe de un caché variable —2 € por entrada
  vendida sumaban 2 € al total— y el total **no cuadraba con su propia columna**.
  ⚠️ **`variable_basis` no lo rellena nadie** (el formulario guarda siempre `None`): lo que describe
  de verdad un caché variable es su **`config`** (`mode` FIXED/PERCENT + `option` + los mínimos).
  · **Cada columna tiene SU interruptor** en los filtros (`show_cache` · `show_cache_var`), que es lo
  que pidió Dani «por si quiere que se muestre o no». Se apagan al instante en el navegador
  (`data-toggle-col` = el nombre del flag sin `show_`) y viajan en la URL para el PDF.
  ⚠️ Es la **única columna de la tabla que envuelve** (el resto va a una línea): lleva
  `white-space:normal` **con `min-width`**, porque sin suelo de ancho la columna se encoge hasta
  quedar en una palabra por línea. En el PDF ese suelo se quita (`@media print`), que ahí manda el
  papel.

- **EL PROCESO DE UNA ACTIVIDAD · LOS PASOS, EN ORDEN, Y LO BLOQUEADO RAYADO** (sep 2026, lo pidió
  Dani). La pestaña **Inicio** (`_concert_task_board`) enseña el proceso ENTERO, no solo lo que
  falta: lo hecho sale tachado con quién y cuándo, lo pendiente con su botón y **lo bloqueado con el
  FONDO RAYADO** de la casa (`.act-step.is-blocked`, la misma señal que un lanzamiento provisional),
  para verlo de un vistazo sin leer el motivo.

  | nº | paso | cuándo sale |
  |---|---|---|
  | 1 | **Conformidad de contratación** | si viene de una petición: **siempre HECHA** — la dio al aprobarla |
  | 2 | Configurar el evento | idem |
  | 3 | **Confirmar con el artista** | **en TODAS**, no solo en las de petición |
  | 4 | Confirmar al promotor | petición · bloqueada hasta que confirme el artista |
  | 5 | Activar producción · Informar al artista | todas |
  | 6 | Pendiente de confirmar | mientras no esté CONFIRMADA |
  | 7 | Sin contrato · forma de pago del caché | confirmadas |
  | 8 | **Confirmar fecha de anuncio y pedir carteles** | `_announce_ask_state` (hay promotor y falta algo) |
  | 9 | **Confirmar fecha de anuncio y compartir carteles al artista** | mientras no esté anunciada |
  | 10 | Activar la venta | |
  | 11 | Quién va con el artista · ticketing · repertorio | según el tipo de actividad |

  ⚠️⚠️ **LA 1 YA VIENE DADA** («la primera tarea es pedir conformidad a contratación, eso se hace
  con la petición, por lo que cuando se configura el evento sería la tarea 2, ya con el ok de
  contratación»): nunca está pendiente —si hay petición aceptada, contratación ya dijo que sí— y
  está para que el proceso se lea desde el principio en vez de arrancar en «Configurar».
  ⚠️⚠️ **EL ANUNCIO SON DOS PASOS**: pedírselo al **promotor** (la fecha y los carteles, **en un solo
  correo** si los hace él: `_announce_ask_state`) y comunicárselo al **ARTISTA** con sus carteles.
  El segundo va **detrás y bloqueado mientras no haya carteles** (`_announce_share_blocker`): se le
  avisa para que lo PUBLIQUE, y sin cartel no hay nada que publicar.
  ⚠️ Ese bloqueo solo salta si los carteles **se esperan de alguien** (los debe el promotor, están
  pedidos, o están subidos sin visto bueno). Si no los debe nadie —una tele, una acción de marca—
  no hay nada que esperar y el paso sale libre: un bloqueo del que no se puede salir es peor que no
  tenerlo.
  ⚠️ **Anunciada = los dos pasos HECHOS solos** («si ya está anunciado ya no haría falta, porque
  automáticamente se marcaría como hecha»). Para poder enseñarlos hechos hizo falta separar
  **`_announce_scope`** («¿le toca anunciarse?») de `_announce_alert_applies` («¿se le reclama?»),
  que antes era lo mismo y por eso el paso no podía salir nunca en verde.
  ⚠️⚠️ **«INFORMAR AL ARTISTA» NO HACE FALTA SI EL ARTISTA HA CONFIRMADO LA ACTIVIDAD**: su «sí» ES
  la comunicación (`_concert_notice_mark_from_confirmation`), así que ese paso desaparece solo. Es
  la regla de la casa: se mira el DATO, no una marca aparte.
  ⚠️ **La clase de la fila es `act-step`, NO `ctask`**: `.ctask` ya era la fila de «Tareas
  pendientes» de Contratación (con su marco, su fondo alterno y su `display:block`), y reutilizar el
  nombre le colaba a estas filas los estilos de aquella — y su `background` en atajo **se comía el
  rayado**. Una cosa, un nombre.

- ⚠️⚠️⚠️ **CONFIRMARLE LA ACTIVIDAD AL PROMOTOR, Y PEDIRLE DE PASO LO QUE FALTA** (sep 2026, lo pidió
  Dani). Cuando el artista ya ha dicho que sí, lo siguiente es **confirmárselo a quien la compra**.
  Hasta ahora eso era una llamada y un botón de «ya se lo he dicho» —que **se mantiene**—; ahora
  además se le puede comunicar **desde la app**, con el MISMO patrón que el aviso al artista (vista
  previa, canal, nota y ojos por módulo) y dos diferencias:
  · **NO le pide respuesta** (no hay botones de confirmar/rechazar: se le comunica y ya está), y
  · **puede llevar una PETICIÓN DE DATOS**: en la vista previa se marca lo que nos falta y el correo
    se lo enseña con su botón **«Cumplimentar»**.
  · **EN TODAS LAS ACTIVIDADES CON PROMOTOR**, no solo en las que vienen de una petición (igual que
    se hizo con la confirmación del artista). Punto único **`_promoter_confirm_state`**, que mira el
    DATO: el aviso mandado (`ConcertPromoterNotification`, con `channel='MANUAL'` cuando se marcó a
    mano) **y** el `acceptance_notified_at` de su petición, que es donde lo apuntaba lo de antes —
    así lo confirmado en su día sigue contando y nadie tiene que volver a marcarlo.
  ⚠️⚠️ **EL BOTÓN DESAPARECE DE LOS DESTACADOS AL CONFIRMARSE** («para que no se queden cosas ahí»):
  queda solo la etiqueta verde «Promotor confirmado». Es la regla que ya siguen el aviso al artista
  y la ficha de contratación. Y en el tablero de la pestaña Inicio el paso 4 lleva **las DOS
  opciones**: «Notificar al promotor» y «Ya se lo he confirmado». ⚠️ **Bloqueado** mientras el
  artista no haya confirmado: no se compromete una fecha con nadie de fuera antes.
  · **EL TEXTO lo dictó Dani** y sale **ESCRITO Y EDITABLE** en el cuadro de la nota, como en todas
    las previsualizaciones de la casa: *«Buenas, este concierto está confirmado, y la fecha
    reservada. Por favor revisa los datos por si hubiera alguna información errónea y si hay datos
    pendientes por favor cumpliméntalos. / Muchas gracias»*.
    ⚠️⚠️ **AL PROMOTOR NO SE LE DICE «EVENTO PROMOCIONAL»**: la palabra sale del punto único
    **`_artwork_activity_word`** (el mismo del correo de los carteles), y el **GÉNERO** se saca de su
    artículo («la acción» → «esta acción está confirmada»): escrito a mano acaba en «esta acción
    está confirmado». Si no se le pide nada, la frase de los datos pendientes **no sale**.
  · **LO NUESTRO NO VIAJA DE SERIE** (`PROMOTER_NOTICE_OPT_IN_MODULES`): el caché, las comisiones,
    los otros gastos y las notas de contratación salen **apagados** y hay que encenderlos con su ojo.
    ⚠️ En la VISTA PREVIA un módulo apagado **se sigue viendo** (atenuado, con `data-notice-hidden`):
    es como se vuelve a encender. Lo que cuenta es que no viaje en el correo.
  · **EL CALENDARIO DE PAGOS DEL CACHÉ** (lo pidió Dani) es un módulo más, y este SÍ va **encendido**:
    es lo que le toca a ÉL, cuándo paga cada plazo. Solo se compone si hay caché de pago y está
    configurado (`_concert_cache_payment_state`), y se puede omitir con su ojo como los demás.
    ⚠️ Se mete **entre las condiciones** (`_promoter_notice_payment_module`, detrás del caché), no
    tocando el motor: así se pinta, se oculta y se cuenta igual que los otros.
  · **QUÉ SE LE PUEDE PEDIR** (`PROMOTER_ASK_SECTIONS`, y **solo sale lo que falta**): el
    **promotor** con su **sociedad** · los **contactos** de las cuatro funciones · el **recinto** ·
    la **fecha de anuncio** · la **cartelería** · la **salida a la venta y su enlace**. Punto único
    `_promoter_ask_state`, del que viven las casillas, el correo y su ficha. ⚠️ **En una actividad
    GRATUITA no hay salida a la venta** ni contacto de ticketing (la regla de siempre).
  ⚠️⚠️ **Y SE AGRUPA EN MÓDULOS, DEBAJO DEL BOTÓN DE LA HOJA DE RUTA, COMO TODOS LOS DEMÁS** (sep
  2026, lo pidió Dani: antes se pintaban ENCIMA de la barra de botones y se leían como si fueran
  otra cosa). `PROMOTER_ASK_MODULES`:
    · **Descripción** → el promotor con su sociedad, sus **contactos**, el recinto y la fecha de
      anuncio; · **Cartelería** → los carteles (y **lo que ya esté subido se ve**, con su estado);
    · **Salida a la venta** → cuándo salen y dónde se compran.
  ⚠️ El **OJO actúa sobre el MÓDULO** (`ask:descripcion`), que es lo que se ve; las casillas de
  «¿qué le pedimos?» siguen siendo por sección, que es lo que se le pide. Apagar un módulo apaga
  todas sus secciones.
  ⚠️⚠️ **AQUÍ «DESCRIPCIÓN» ES OTRA COSA**: es ese módulo de datos, no la del aviso al ARTISTA (lo
  que tiene que hacer sobre el escenario). En el aviso al promotor la del artista **no se compone**
  (`ctx["description"] = None`) y su ojo no se ofrece: dos módulos con el mismo rótulo en la misma
  pantalla es la trampa de siempre —una cosa, un nombre—.
  · ⚠️⚠️ **CADA FUNCIÓN DE CONTACTO CON SU GALLETA**, como se ve en la app (foto redonda, la función
    arriba y el nombre en negrita), y **las que no están cubiertas salen en ÁMBAR como «Pendiente de
    contacto»** con su propio botón: se aprecia de un vistazo lo que falta y se pincha ahí mismo.
    ⚠️ En el correo la foto va con `width` en su celda **y `max-width:none`** en el `<img>`: con el
    `img{max-width:100%}` de la app, dentro de una celda estrecha el ancho computado sale **0 px**.
  · ⚠️⚠️ **LA SOCIEDAD CON LA QUE FACTURA** (lo pidió Dani). Si no consta, se le pide: **elegir entre
    las suyas** (si tiene varias), **buscarla por CIF** (`public_promoter_sheet_company_find`, que
    mira las sociedades de cualquier tercero y también las fichas con ese CIF) o **crearla**
    (`public_promoter_sheet_company_create`). ⚠️⚠️ **LA QUE CREA QUEDA VINCULADA A SU FICHA DE
    TERCERO** (`PromoterCompany.promoter_id`), que es el sentido de pedírsela: **la próxima actividad
    ya la ofrece para elegir** en vez de volver a preguntar lo mismo. No se duplica (mismo CIF o
    misma razón social → se reutiliza la que hay) y **la sociedad de OTRO promotor se rechaza con un
    403**: el token es de esta actividad, no una llave para tocar fichas ajenas.
    ⚠️ Como el recinto, **se crea ANTES de guardar y en serie**: en paralelo el dato se guardaría sin
    su id y la sociedad quedaría creada pero suelta. Su id viaja con la razón social por
    `CONTRACT_SHEET_SATELLITE_FIELDS` y al aceptarlo se pone en `Concert.promoter_company_id`.
  ⚠️ **LA CARTELERÍA VA APARTE DE LA FECHA**: son dos módulos, y en el suyo se ven las miniaturas de
  lo que ya haya subido con su estado (`_promoter_ask_artwork`; pendiente = le falta alguno de los
  DOS vistos buenos). ⚠️ Un cartel puede ser un **VÍDEO**: entonces la miniatura es su `poster_url`,
  no el `file_url` (que es el mp4 y en un correo no se vería nada).
  ⚠️⚠️ **EL ANUNCIO Y LOS CARTELES YA TIENEN SU PROPIO CAMINO** (el botón «Solicitar cartelería y
  fecha de anuncio»): si se le piden desde aquí se sellan `announce_ask_*` y se prepara la solicitud
  de siempre (`ConcertArtworkRequest` con `handled_by='PROMOTER'`), para **no pedirle lo mismo por
  dos correos**. Los carteles los sube en la página de siempre (`/carteleria/<token>`).
  · **SU FICHA** (`/promotor/<token>`, `public_promoter_sheet`): lo mismo que el correo **sin el
    texto del correo**, y **cada cosa en su pop-up**. ⚠️⚠️ **NO HAY BOTÓN DE GUARDAR NI DE ENVIAR**:
    cada pop-up guarda al aceptarlo y puede volver cuando quiera. **El enlace se desactiva a los 15
    días** (`PROMOTER_LINK_DAYS`, sellado en `expires_at` al mandarlo, para que cambiar el plazo no
    desactive enlaces ya mandados). ⚠️ Caducado, la página **se sigue viendo** (lo que se le comunicó
    no desaparece); lo que no se puede es escribir.
  ⚠️ El RECINTO se busca en nuestra base y, si no está, **se da de alta desde ahí** — y el alta va
  **ANTES del guardado y en serie**: en paralelo, el dato se guardaba sin su `venue_id` y el recinto
  nuevo quedaba creado pero suelto.
  · ⚠️⚠️ **NADA SE CARGA SIN MÁS** (lo pidió Dani): todo lo que rellena cae en
    **`ConcertContractSheet.promoter_data`** —el mismo sitio donde cae la ficha de contratación que
    manda él— y queda **pendiente de revisar** (`promoter_reviewed_at = NULL`), así que sale la tarea
    **«Revisar los datos que ha subido el promotor»** (en el tablero de la actividad, en el módulo de
    Contratación con el kind `PROMOTER_DATA`, y como botón en la barra de la ficha) y se aplica desde
    la **pantalla de comparación de siempre**, campo a campo. Cada vez que guarda algo nuevo la marca
    vuelve a NULL, así que la tarea reaparece sola — y desaparece sola al revisarla.
    ⚠️ **A quien la gestiona le llega UN aviso, no uno por campo** (bug real, visto en el navegador:
    dos secciones seguidas dejaban dos franjas diciendo lo mismo): se mira si ya hay uno **sin leer**
    (`ref_type='PROMOTER_DATA'`), como en `_artist_notice_missing`. El trabajo es uno: revisar su
    ficha. Y va a **quien gestiona la actividad** (`_announce_alert_owner_ids`: contratación, o la
    persona del sello si es un evento promocional), no a un departamento fijo.
  ⚠️⚠️ **DOS AGUJEROS DEL CATÁLOGO DE LA FICHA que salieron aquí**: `promotion_announcement_date` y
  `gala_venue_id` se guardaban y se sabían consolidar, pero **no estaban en `CONTRACT_SHEET_GROUPS`**,
  así que la pantalla de revisión **no los pintaba y no se podían aceptar nunca**. La fecha ya está
  en el catálogo (con su hora, nueva); el id del recinto no se le enseña a nadie, así que **viaja CON
  su nombre** por **`CONTRACT_SHEET_SATELLITE_FIELDS`**. ⚠️ Al añadir un campo a la ficha, comprobar
  que está en el catálogo: si no, es un dato que se pide y no se puede usar.
  · Campos nuevos: **`ticketing_sale_links`** (tipo `links`, la ticketera y su enlace) —que al
    consolidar pasan a `ConcertTicketer.sale_url` con `_contract_sheet_apply_sale_links`, **solo los
    que falten**: un enlace que ya tenemos puede ser el de la integración, que es el bueno— y
    **`promotion_announcement_time`**.
  ⚠️⚠️ **EL CORREO ESCUETO DE «Confirmada · tu petición» SE RETIRÓ**: lo sustituye este aviso. Dos
  correos para lo mismo acaban diciendo cosas distintas.
  ⚠️⚠️ **`missing` ERA UNA LISTA Y UN BOOLEANO A LA VEZ** (bug real, lo cazó la prueba: «'bool'
  object is not iterable» → 500 en la vista previa). En `_promoter_ask_state` **todas** las secciones
  llevan un `missing` que es «¿falta algo?»; la lista de funciones sin cubrir se llama ahora
  **`missing_roles`**. Es la regla de siempre —una cosa, un nombre— dentro de un diccionario.
  · **PRUEBA DE REGRESIÓN: `/tmp/python/bin/python3 tools/check_promotor.py`** (112 comprobaciones con
    la app real, de punta a punta). Es **idempotente**. Al tocar esto, en verde.
