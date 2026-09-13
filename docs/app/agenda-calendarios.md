# Agenda y calendarios

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- DOBLE CLIC EN UN DÍA = AÑADIR ALGO ESE DÍA: en el hueco de cualquier casilla
- AGENDA · un «otro» puede tener HORA: al añadir una nota («Otro») se pueden poner
- CALENDARIO GENERAL DE OFICINA: en el calendario de Inicio sale como si fuera otro
- MI CALENDARIO: el calendario de cada uno, también como si
- CALENDARIO · «Todos» / «Ninguno»: delante de los chips de calendario hay dos
- Los TIPOS que se ofrecen son los que HAY a la vista en
- FESTIVOS en los calendarios de agenda
- CUMPLEAÑOS · cuántos cumple
- EL DOMINIO DE LOS ENLACES lo decide CANONICAL_HOST. _public_base_url() ya no
- UN CALENDARIO CON kinds
- EL CALENDARIO DE INICIO SE RECUERDA, Y SON 4 SEMANAS

---

- ⚠️ **DOBLE CLIC EN UN DÍA = AÑADIR ALGO ESE DÍA** (ago 2026): en el **hueco** de cualquier casilla
  del calendario, el doble clic abre el asistente del «+» **con la fecha ya puesta** (las dos, «desde»
  y «hasta»). Encima de un ítem manda su propio doble clic (editarlo), así que ahí no se hace nada:
  lo decide `ev.target.closest('.agenda-event')`.
  ⚠️ El calendario **no sabe nada del asistente**: lanza el evento **`agenda:day-add`** con el día y
  quien lo escuche decide (el mismo patrón que `agenda:external-drop`). Por eso en un calendario que
  no trae el asistente (un proyecto, el cronograma del plan, el público) el doble clic no hace nada —
  y por eso el hueco solo se marca como «añadible» (`title` de aviso) si existe `#agendaAddModal`.
  ⚠️ El día viaja también al **asistente de actividad** si se elige «Actividad»: `#wizard_date` (tras
  `shown.bs.modal`, como el resto del precumplimentado) y, en el camino que navega,
  **`&wizard_date=`** en la URL de `/conciertos?open_wizard=1`.
- **AGENDA · un «otro» puede tener HORA** (ago 2026): al añadir una nota (**«Otro»**) se pueden poner
  **hora de inicio y hora de fin, las dos opcionales** (`ArtistAgendaItem.start_time`/`end_time`; sin
  ellas es de todo el día, como antes). Punto único **`_agenda_clean_time`** (valida «HH:MM» y descarta
  lo que no lo sea) + **`_agenda_time_label`** («10:00 – 13:30» · «desde las 10:00» · «hasta las
  13:30»), que va **por delante en el `subtitle`** del ítem: así se ve igual en el tooltip del
  calendario y en el listado lateral, en Inicio y en la ficha del artista. En un solo día, unas horas
  del revés se ordenan solas (igual que las fechas).
  · **Al iPhone también llega la hora**: `_ics_time_lines` es el punto único de DTSTART/DTEND del iCal
  público y del CalDAV. ⚠️ Solo se emite evento **con hora cuando están LAS DOS** (hora local
  flotante, sin TZID, que es lo que entienden bien iPhone y Google sin VTIMEZONE); con **una sola** se
  emite el día completo de siempre y la hora se dice en el texto — mejor eso que inventarse una hora
  de fin que nadie ha puesto.
  · **El día de fin SIGUE al de comienzo** mientras no se toque a mano: lo que se añade es de UN día y
  al mover el «Desde» se mueve el «Hasta» con él; en cuanto alguien escribe el «Hasta», ese manda
  (`dataset.touched` en `_agenda_add_modal.html`) — salvo que quede ANTES del comienzo, que entonces se
  arrastra. Vale para «Otro» y para «Bloqueo».
  ⚠️ **`parse_date("")` REVIENTA** (`ValueError`, no devuelve None): con el «Hasta» vacío, crear una
  nota o un bloqueo fallaba con «No se pudo añadir» (bug real). Las fechas de la agenda se leen con
  **`parse_optional_date`**.

- **CALENDARIO GENERAL DE OFICINA** (ago 2026): en el calendario de Inicio sale **como si fuera otro
  artista** («Calendario general», `OFFICE_CALENDAR_ID = "oficina"` — un CENTINELA, no un artista de la
  BD), y lo que lleva son las cosas de la casa: **todas las vacaciones y días libres APROBADOS de todo
  el personal** (una franja por petición, con el nick y el motivo, enlazando a su cuadrante) y las
  **notas** que se le añadan. Motor `_agenda_office_items`, enganchado en `_agenda_build` **solo con
  `include_personal`** (o sea: solo la agenda de dentro; en un calendario público, en el iCal o en
  CalDAV serían datos personales de la oficina).
  ⚠️ Su id NO es un UUID: se excluye de la consulta de artistas y su ficha del mapa se pone a mano
  (nombre, los DOS logos del grupo y su color de paleta como cualquier otro).
  · En el **botón +** es la **PRIMERA** opción, con los logos de Treinta y Tres y de PIES, y al
  elegirla **solo se puede añadir «Otro»** (una nota): ni actividades ni bloqueos, porque no es de
  ningún artista (`soloOtros()` en `_agenda_add_modal.html`; el aviso de solapes también se salta).
  · Sus notas viven en `ArtistAgendaItem` con **`is_office = true` y `artist_id` NULL** (por eso esa
  columna dejó de ser obligatoria). `agenda_block_create` lo rechaza diciendo por qué.
  · **La FOTO de cada franja es la de LA PERSONA que está de vacaciones**, no la del calendario: los
  ítems pueden traer su propia `artist_photo`/`artist_photos` y el finalizador de `_agenda_build` las
  respeta (`it.pop(...) or` lo calculado). Sin eso todas las franjas salían con el logo.
  · **Su imagen** es el **FAVICON de la app** (`static/android-chrome-192x192.png`, el «33» de la
  casa), vía `_office_calendar_image()`; si el fichero no estuviera, se cae a los dos logos del grupo.
  · **CUMPLEAÑOS de todo el personal** de la oficina (`UserProfile.birth_date`), con su tarta y **la
  foto de quien cumple**. Los bloqueados y eliminados no salen.
- **MI CALENDARIO** (ago 2026, `MY_CALENDAR_ID = "mio"`): el calendario de cada uno, también como si
  fuera otro artista y con **su propia foto**. Lleva:
  · las actividades en las que **acompaña** al artista —está en el personal de su HOJA DE RUTA
    (`roadmap_payload['personnel']`, kind USER): se lee de los conciertos que `_agenda_build` YA tiene
    cargados para la ventana, así que no cuesta ninguna consulta más—,
  · las **promociones** en las que es el acompañante (`Promotion.escort_user_id`), con sus entrevistas,
  · y **sus vacaciones y días libres** (una franja por petición), que las trae `_agenda_personal_days`
    ya con este id.
  · y las **NOTAS que cada uno se apunta** (ago 2026): `ArtistAgendaItem.owner_user_id` (columna
    nueva; ni de un artista ni de la casa), que lee `_agenda_my_items`. **Solo las ve su dueño.**
    Como en el general, ahí solo caben **notas**: ni actividades ni bloqueos (un bloqueo dice que el
    ARTISTA no está disponible), y `agenda_block_create` lo rechaza diciendo por qué.
  ⚠️⚠️ **APUNTARSE ALGO EN SU CALENDARIO LO PUEDE HACER CUALQUIERA**: `agenda_note_create`,
  `agenda_item_update` y `agenda_item_delete` pasaron de `SUPPORT_ACTION_ENDPOINTS` a
  **`REQUEST_ANY_ENDPOINTS`**, porque el primero exige ser «actor» (poder editar alguna sección) y
  quien no edita nada **no podía apuntarse ni una nota en su propio calendario**. La puerta de lo que
  NO es suyo se cierra DENTRO, con el punto único **`_agenda_actor_ok(es_mio)`**: en un ARTISTA o en
  el GENERAL se sigue exigiendo ser actor. Y **`_agenda_item_is_mine_only`** impide que nadie toque la
  nota de otra persona (403).
  ⚠️⚠️ La consulta de bloqueos y notas de `_agenda_build` exige **`artist_id IS NOT NULL`**: sin ese
  filtro, cuando no hay artistas a los que ceñirse (dirección, o quien no tiene ninguno asignado) se
  colaban las que no son de un artista —las de oficina salían DUPLICADAS bajo un calendario fantasma
  **«None»** y las personales las habría visto otra persona—.
  · **Los CUMPLEAÑOS van en el ROJO DE LA CASA** (ago 2026), el mismo del Calendario general: es su
  color de TIPO (`AGENDA_KIND_META['cumple']`), así que se ven igual en Inicio y en la ficha del
  artista. Y de la paleta de artistas se ha quitado el rojo oscuro que había (`#c1121f`): con el rojo
  reservado, ningún artista puede llevar uno parecido.
  · **COLORES**: el **rojo de la casa** es del Calendario general y el **azul** de Mi calendario
  (`AGENDA_OFFICE_COLOR` / `AGENDA_MINE_COLOR`, fijos y fuera de la paleta que rota). El resto los da
  **`_agenda_color_for(i)`**: la paleta y, cuando se acaba, colores nuevos girando el tono con el
  ÁNGULO DORADO (137,5°) y saltándose las franjas del rojo y el azul — así **no se repite ninguno**
  por muchos calendarios que se creen (antes era `paleta[i % len(paleta)]` y del 13 en adelante se
  repetían). ⚠️ `agenda_calendar.js` tiene el MISMO mecanismo (estabiliza los colores en el cliente):
  si se toca uno, se toca el otro.
  · **ORDEN**: Mi calendario y el Calendario general van los **PRIMEROS** y una **barra vertical**
  (`.agenda-chip-sep`) los separa de los artistas y eventos. El orden se respeta también al cargar más
  ventanas con las flechas (el `sort` del cliente los deja delante).
  ⚠️ Lo personal (mis días, MI CALENDARIO y el de OFICINA) se añade **ANTES del mapa de artistas**: es
  ahí donde estos dos calendarios cogen nombre, foto y color, y el mapa se construye con los ids ya
  vistos.
  ⚠️⚠️ **EL CALENDARIO DE INICIO NO PUEDE DESAPARECER** (bug real, ago 2026). `_home_agenda` tenía
  un `except Exception: return None` **mudo** y el módulo cuelga de `{% if HOME_AGENDA is not none %}`:
  cualquier fallo borraba el calendario de la pantalla **sin decir nada en ningún sitio**. La causa
  encontrada: **un id que no es un UUID en `assigned_artist_ids`** (una cadena vacía, un id a medias)
  hacía reventar `to_uuid` y con él la agenda ENTERA de esa persona. Tres capas:
  · **la causa**: `_home_agenda_target_ids` se queda solo con los ids que son UUID de verdad y el
    punto único **`_agenda_uuids`** sustituye a los `to_uuid(x)` sueltos de `_agenda_build`;
  · **cada pieza de lo personal en su propio `try`** (mis días, el calendario de oficina, Mi
    calendario, los festivos con `_agenda_holidays_safe`): si una falla, se pierde esa capa y no el
    calendario;
  · **red de seguridad**: si aun así falla, se reintenta **sin lo personal ni los festivos** y, en el
    peor caso, se pinta el calendario VACÍO (`_agenda_empty`) con Mi calendario. Y todo queda en el
    log (`app.logger.exception`), que era lo que faltaba para poder diagnosticarlo.
  ⚠️⚠️ **MI CALENDARIO SE VE SIEMPRE** (corregido ago 2026): su id se añade a `seen_artist_ids` con
  `include_personal`, **tenga o no algo esa quincena**. Antes solo entraba si traía ítems, así que a
  quien no acompañaba a nadie ni tenía vacaciones le **desaparecía el chip de Inicio** —y sin chip no
  hay forma de volver a encenderlo—. Es el calendario de cada uno: un módulo básico, no una etiqueta
  que aparece y desaparece según lo que haya. (El de OFICINA sigue apareciendo solo si tiene algo.)

- **CALENDARIO · «Todos» / «Ninguno»** (ago 2026): delante de los chips de calendario hay dos
  botoncitos grises (el estilo `.filter-chip` del resto de la app, algo más pequeños) para **encender
  o apagar todos de golpe**. Con muchos artistas, ir uno a uno para ver solo el que interesa es un
  trabajo tonto: se apagan todos y se enciende el que sea.
  ⚠️ **Solo se ofrece el que hace algo**: con todos encendidos no sale «Todos», y con todos apagados
  no sale «Ninguno» — un botón que no cambia nada solo estorba. Y no salen con un único calendario.
  · Vale para los chips de CALENDARIO (Inicio) y para los de TIPO (la ficha del artista): los pinta
  el mismo `renderTop()` de `agenda_calendar.js`.

- **Los TIPOS que se ofrecen son los que HAY a la vista** (ago 2026, `kindsVisibles()` en
  `agenda_calendar.js`): la lista de tipos —el lateral «Tipos» en Inicio y los chips de arriba en la
  ficha del artista— solo enseña los que tienen algo en **la ventana que se está mirando** y en **los
  calendarios encendidos**. ⚠️ Se ignora el propio filtro de tipos (si no, al apagar uno desaparecería
  su botón y no se podría volver a encender) y NO se usa la lista `kinds` a secas: esa **acumula** los
  tipos de todas las ventanas cargadas con las flechas, que era justo lo que sobraba.
- **FESTIVOS en los calendarios de agenda** (ago 2026): en **Inicio** y en la **pestaña Agenda de cada
  artista** el día del festivo se marca **EN ROJO con el nombre de la festividad** dentro de la casilla
  (los **no laborables** de la oficina, en morado), igual que en el calendario de vacaciones. Van en
  `holidays` del payload (`_agenda_holidays`), **no como un chip más** — antes eran un evento de tipo
  «vacaciones» y se perdían entre las actividades.
  ⚠️ Se piden con **`include_holidays=True`**, que solo activan la agenda de Inicio, sus ventanas por
  AJAX y la ficha del artista: en el calendario PÚBLICO, el iCal y CalDAV no van. Y los **EMPRESA**
  (no laborables, que son por persona) solo con `include_personal`.
- **CUMPLEAÑOS · cuántos cumple** (ago 2026): al pasar el ratón por un cumpleaños, el tooltip dice
  **«Cumple N años»** (los que cumple ESE día). Va en el `subtitle` del ítem, así que se ve igual en el
  tooltip y en el listado lateral de la agenda, en Inicio y en la ficha del artista. Punto único
  **`_birthday_age_label(bdate, day)`**, que **no inventa nada** si la fecha no es creíble (edad ≤ 0 o
  > 120: no pone edad).
- ⚠️ **EL DOMINIO DE LOS ENLACES lo decide `CANONICAL_HOST`** (ago 2026). `_public_base_url()` ya no
  antepone `EXTERNAL_BASE_URL`: manda el **host canónico** (`app.33producciones.es`), el mismo al que
  redirige la app, y solo si no lo hubiera se mira esa variable y, en último caso, el host de la
  petición. Una variable olvidada en el servidor con el dominio ANTIGUO hacía salir con él TODOS los
  enlaces compartidos (bug real). La URL vieja de Render (`*.onrender.com`) **nunca** vale para un
  enlace que se comparte. Cambiar de dominio = cambiar UNA variable. Y los logos de los correos ya no
  usan `url_for(..., _external=True)` (que toma el host de la petición): **no queda ninguno**.

- ⚠️⚠️ **UN CALENDARIO CON `kinds: []` SALE VACÍO** (bug real, ago 2026): `agenda_calendar.js` filtra
  todo lo que pinta con `activeKinds`, que se construye **con la lista `kinds` del payload**. Un
  payload propio (como el CRONOGRAMA del plan) tiene que emitir los tipos que trae, con su etiqueta,
  su icono y su color —y el tipo tiene que estar en **`AGENDA_KIND_META` y en `AGENDA_KIND_ORDER`**
  (por eso existe ahora el tipo **`contenido`**, «Publicaciones»)—.
  ⚠️ Y una página **standalone** que use el parcial `_agenda_calendar.html` tiene que **cargar
  `agenda_calendar.js`** a mano: el parcial solo deja el JSON, quien dibuja es el JS (que en las
  pantallas de dentro viene de `layout.html`).

- **EL CALENDARIO DE INICIO SE RECUERDA, Y SON 4 SEMANAS** (sep 2026):
  · **Lo que cada uno deja apagado se guarda** (`UserProfile.agenda_prefs`, endpoint
    `agenda_prefs_save` en `PERSONAL_ENDPOINTS`): al volver, se ve lo que dejó puesto, desde
    cualquier navegador y sesión —igual que `home_order`—.
  ⚠️⚠️ **Se guarda lo APAGADO, no lo encendido**: así un calendario NUEVO (un artista que entra, un
  evento) **se ve solo**, sin tener que acordarse de encenderlo. Guardar lo encendido escondería
  todo lo que apareciera después.
  ⚠️ Se guarda con un respiro de 500 ms (`guardaPrefs`), no en cada clic.
  · La ventana pasa de 3 a **4 semanas**: la actual y las TRES siguientes (`_agenda_window(27)` y
  `HOME_STEP = 28` en `agenda_calendar.js` — **los dos a la vez**, o las flechas saltarían mal).

