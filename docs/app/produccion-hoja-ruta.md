# Producción · hoja de ruta, rooming y riders

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- La ficha y los listados de ACTIVIDAD se abren desde muchas secciones
- Responsable de PRODUCCIÓN (Concert.production_owner_user_id): en un EVENTO (que no es de ningún
- PRODUCCIÓN EXTERNA · la lleva un TERCERO, con su propio acceso
- MANDAR A PRODUCCIÓN = decir QUIÉN se encarga (corregido ago 2026): la tarea de Contratación
- Producción → ACTIVAS por sujeto
- LA BOLSA ES TRABAJO DE PRODUCCIÓN: quien tiene la sección entra en ella (sep 2026, bug
- PRODUCCIÓN · RIDERS, POR SECCIONES. El rider es lo que el artista necesita
- UNA HABITACIÓN DE DOS: «TWIN» SON DOS CAMAS Y «DOBLE» ES UNA SOLA. Lo que se
- PRODUCCIÓN · PLANTILLAS Y RIDERS. Producción gana dos pestañas
- PERSONAL DE LA HOJA DE RUTA · QUIÉN VA, CON QUÉ FUNCIÓN Y CON QUÉ DATOS.
- ROOMING · LAS HABITACIONES SE FORMAN ANTES Y LUEGO SE REPARTEN ENTRE LOS HOTELES
- PLANTILLAS DE ARTISTA (ArtistTemplate, kind PERSONNEL|ROOMING|ROADMAP): se crean en la ficha
- HOJA DE RUTA · LA ACTIVIDAD, «HORARIOS» Y LAS HABITACIONES
- HOJA DE RUTA · CÓMO LLEGAR, QUIÉN MIRA Y «LO QUE TENGO HOY»
- Hoja de ruta
- Cabecera del SUJETO al entrar en él (/actividades, «Otras actividades» y Producción → Activas)
- Producción → Activas · PENDIENTES DE ASIGNAR (_production_active_context): lo que no tiene
- Facturación de proveedores (/facturacion, landing pública en 3 pasos): plantilla
- Dicts en plantillas
- Plantillas que parecen vivas y no lo son
- _snapshot_user_profile DESTROZABA LOS DEPARTAMENTOS: list("Producción") SON LETRAS
- NOTAS DE PRENSA · LAS PLANTILLAS. Botón «Plantillas» arriba a la derecha, al
- HOJA DE RUTA · UNA SOLA LÍNEA DE TIEMPO, con filtro por días
- HOJA DE RUTA · APERTURA DE PUERTAS: un concepto más del catálogo
- UN TRASLADO SE LLENA CON VARIAS PERSONAS DE GOLPE: en un transfer va casi
- HOJA DE RUTA · lo que ve cada uno, quién puede actualizarla y el repertorio (sep 2026,
- HOJA DE RUTA · MANDARLE UN MENSAJE AL PERSONAL. «Mañana el bus sale a las 8:30» hay
- HORARIOS · TODOS LOS PUNTOS SE AÑADEN IGUAL: el asistente por pasos (sep 2026, lo pidió
- HORARIOS · CADA TIPO PREGUNTA SOLO LO SUYO, y las PERSONAS DE CONTACTO son varias (sep 2026,

---

- ⚠️ **La ficha y los listados de ACTIVIDAD se abren desde muchas secciones**: producción monta la
  hoja de ruta, administración la bolsa, promoción su marketing… Por eso el acceso de LECTURA a
  `concert_detail_view` / `activities_view` / `concerts_view` no exige la pestaña «Conciertos» de
  Contratación: `_activity_read_resource_key` acepta la primera sección de
  `ACTIVITY_READ_ACCESS_KEYS` que el usuario tenga. **Modificar sigue exigiendo edición en
  contratación** (el helper solo actúa en GET). Sin esto, quien trabaja en Producción se comía un 403
  al pinchar cualquier concierto (bug real). El 403 dice ahora **qué acceso falta**.
- **Responsable de PRODUCCIÓN** (`Concert.production_owner_user_id`): en un EVENTO (que no es de ningún
  artista) o en una fecha de gira comprada que promueve una empresa del grupo no hay artista del que
  colgar el trabajo, así que **al confirmar** se pregunta a quién de producción le toca
  (`_concert_needs_production_owner` + `_production_people`, modal `#prodOwnerModal` que se abre solo si
  está confirmada y sin responsable). Se guarda con `concert_production_owner_save` y se ve en la
  cabecera de la ficha.
  · **ACTIVAR LA PRODUCCIÓN es de quien crea la actividad** (ago 2026): activar = decir QUIÉN de
  producción se encarga. `Concert.created_by_user_id`/`created_by_nick` (los rellenan los tres sitios
  donde se crea un `Concert`) + `production_activated_at`. Mientras no haya responsable, la actividad
  le sale a quien la creó en el módulo de Inicio **«Activar la producción»**
  (`_home_production_activation_pending`: dice «Activar producción», o **«Asignar producción»** si ya
  tiene bolsa —la producción estaba en marcha sin responsable—; dirección ve además las antiguas, que
  no tienen creador apuntado). En la ficha hay botón **«Activar producción»** en la cabecera siempre
  que haga falta (`_concert_production_pending`); el modal se abre SOLO en los casos de antes
  (`ask_production_owner`).
  · ⚠️⚠️ **EN EL SELECTOR SALE TODO EL PERSONAL, con los de PRODUCCIÓN PRIMERO** (ago 2026).
  `_production_people` devolvía **solo** a los del departamento, y el resto era un respaldo que
  entraba **únicamente si NADIE lo tenía**: a quien tuviera el departamento mal escrito (o sin poner)
  **no se le podía elegir**, porque los demás sí lo tenían (bug real: «no me aparece María de
  producción»). Ahora devuelve a **todo el personal actual** con la marca `in_production`, y el
  selector único (`_prod_owner_picker.html`) pinta a los del departamento arriba y el resto detrás de
  **«Ver todo el personal»** — asignar una producción no puede depender de cómo esté escrito un
  departamento. En las rejillas del asistente y de la ficha de promoción, quien no es del
  departamento sale con la etiqueta «· fuera de producción».
  ⚠️ El listado de Producción calcula la lista **siempre** (antes solo si había actividades sin
  asignar, así que al cambiar el responsable de una ya asignada el selector salía vacío).
  · Historia de lo anterior: había casos en los
  que faltaba gente en el selector. Tres causas, las tres arregladas en `_production_people`:
  (a) el departamento se comparaba buscando la cadena exacta «producción» dentro de la lista, y ahora
  se usa **`_profile_in_department`** (normaliza contra `PERSONNEL_DEPARTMENTS`: caja, acentos y
  alias); (b) **`departments` puede estar guardado como TEXTO** en filas antiguas y recorrer un texto
  con un `for` devuelve LETRAS —esa persona no casaba con nada y desaparecía **sin dar ningún error**—,
  así que se lee siempre con **`_departments_iter`**; y (c) el JOIN con el perfil era INTERNO (quien no
  tiene perfil desaparecía incluso de la lista de respaldo) y ahora es **externo**. Además, la ficha de
  la actividad calcula la lista **SIEMPRE** (antes solo cuando faltaba responsable, así que al cambiarlo
  desde la rueda no salía nadie) y el modal `#prodOwnerModal` se pinta con solo poder editar.

- **PRODUCCIÓN EXTERNA · la lleva un TERCERO, con su propio acceso** (ago 2026). El responsable de
  producción de una actividad puede ser alguien **de fuera**. El selector «¿Quién lleva la
  producción?» es ya **uno solo** (`templates/_prod_owner_picker.html`, usado por la ficha de la
  actividad y por el listado de Producción) con dos pestañas: **personal de la oficina** (las
  tarjetas de siempre) y **un tercero** (buscador con su foto o su logo + el «+» del alta rápida).
  · **Cómo funciona por dentro**: al tercero se le crea un **USUARIO ESPEJO**
  (`UserProfile.is_external`, correo sintético `produccion-externa+<id>@…`) y
  `Concert.production_owner_user_id` apunta a él, así que TODO lo que ya existía (tareas, listados de
  producción, avisos, quién cierra la bolsa) funciona **sin casos particulares** — el mismo patrón que
  el modo «Ver como». Lo único propio es la **compuerta** `_external_prod_gate`, lo PRIMERO del
  enforcement, que en una sesión externa deja pasar solo lo de SU actividad
  (`_external_prod_target_ok`: por `cid`, por la bolsa vinculada o por la entidad de la hoja de ruta).
  Sus permisos son solo `produccion` (ver+editar) y `databases.bags` (con económico: la bolsa ES
  dinero). `Concert.production_owner_promoter_id` guarda de quién se trata.
  · **Cómo entra**: enlace propio `/produccion-externa/<token>` → escribe **su correo** (tiene que ser
  el de su ficha; no se dice cuál es el bueno) → le llega un **número de verificación** de 6 cifras
  (20 min, 6 intentos) → entra y se le lleva a la pestaña Producción de su actividad. En el menú sale
  una franja roja con su nombre y el botón **Salir**; el menú de secciones no se le pinta.
  · **Su acceso TERMINA al cerrar la bolsa** y pasar a administración, y **vuelve** si la bolsa se
  reabre (rechazo o algo que modificar). ⚠️ Eso **no se sincroniza**: se MIRA la bolsa
  (`_external_prod_open`), así no puede quedar desparejado — la misma regla que `_notify_resolve`.
  · **Los usuarios espejo no son personal de la casa**: `_inactive_user_ids` los excluye (y con eso
  desaparecen de golpe de todos los selectores y listados que ya usan ese punto único, incluido
  `_production_people`), y **no pueden entrar por el login normal** (se les dice que usen su enlace).
  ⚠️⚠️ **EL LOGIN VIVO es `_admin_login_extended`**, no la función `admin_login`: al final del bloque
  hay `app.view_functions["admin_login"] = _admin_login_extended`, así que la primera es **código
  muerto**. Un cambio en el login que se haga ahí no se ejecuta (bug real de esta épica).
  ⚠️ `Concert.promoter` necesita **`foreign_keys`**: con el tercero de producción hay DOS caminos de
  `concerts` a `promoters` y SQLAlchemy no arranca sin decírselo.
  ⚠️ Los cuatro endpoints van en las **listas de públicos** (`allowed` × 2 y `PUBLIC_ENDPOINTS_EXTRA`)
  y conservan CSRF (el formulario es nuestro).

- ⚠️ **MANDAR A PRODUCCIÓN = decir QUIÉN se encarga** (corregido ago 2026): la tarea de Contratación
  «Sin mandar a producción» miraba solo si había BOLSA, así que las actividades de antes de que
  existiera «activar producción» —que tienen responsable y no tienen bolsa— la arrastraban para
  siempre. Con responsable ya está mandada (y le sale a esa persona como tarea suya).

- **Producción → ACTIVAS por sujeto** (ago 2026, `_production_active_rows` + `_production_active_context`):
  igual que la sección Actividades — rejilla de **artistas y eventos** con su nº y, al entrar, sus
  actividades con la fila `.oa-row` y el **icono de su tipo**. **Cada persona de producción ve SOLO lo
  que se le ha asignado** (`production_owner_user_id`); dirección y quien no es de producción lo ven
  todo. Lo que **no tiene responsable** no es de nadie: sale en su bloque «Sin responsable» (para que
  no se pierda) y es tarea de quien la creó. **«Nueva actividad»**: se compara `created_at` con
  `UserProfile.production_seen_at`, que se marca al mirar la REJILLA (no al entrar en un artista, para
  que el destacado siga estando donde hay que verlo).
  ⚠️ Dos trampas reales de esto: `production_seen_at` hay que añadirlo a **`_snapshot_user_profile`**
  (lo que no esté ahí es invisible desde `_current_user_state`) y **quién es dirección se decide con
  `estado["role"]`**, no con `is_master()`: ese lee el rol de la SESIÓN y sin él cae a 10, con lo que
  producción vería todo.

- ⚠️⚠️ **LA BOLSA ES TRABAJO DE PRODUCCIÓN: quien tiene la sección entra en ella** (sep 2026, bug
  real: «a Irene no le deja abrir la bolsa del concierto y sí tiene permisos»). Dos causas:
  · el gate de `bag_*` exigía **solo** `databases.bags`, y la siembra que se lo daba al departamento
    de Producción (`_access_seed_for_department`) comparaba el departamento con la CADENA EXACTA
    («producción»/«produccion»): a quien lo tiene escrito de otra forma («Producción musical») se lo
    saltó **sin dar ningún error** y, como corre UNA vez, se quedó sin él para siempre.
  · Ahora la siembra usa **`_profile_in_department`** (tolerante) y se vuelve a pasar una vez
    (`produccion_bags_access_seed_v2`); y el mapeo de `bag_*` en `_resolve_request_resource_key` acepta
    **la primera clave que tenga el usuario** de `BAG_ACCESS_KEYS` (`databases.bags` · `produccion`,
    con `edit=` en los POST), así que no depende de que la siembra llegue. `bags_view` (el listado de
    Bases de datos) sigue siendo solo de «Bolsas». Probado: producción sin «Bolsas» abre y escribe en la
    bolsa; sin ninguna de las dos claves, el 403 sigue diciendo que falta «Bolsas».

- ⚠️⚠️ **PRODUCCIÓN · RIDERS, POR SECCIONES** (sep 2026). El rider es lo que el artista necesita
  para actuar y **lo que se le manda al promotor**: el sonido, los monitores, el backline, las
  luces, el escenario, los camerinos, el catering… Va **POR SECCIONES, y cada sección es una
  PESTAÑA** de su editor (`rider_edit`, `templates/rider_edit.html` + `static/js/rider.js`).
  · ⚠️⚠️ **UN RIDER ES UNA PLANTILLA** (`ArtistTemplate` con `kind='RIDER'`), vinculada a un
  **ARTISTA**, un **EVENTO**, una **GIRA comprada** o un **CICLO / FESTIVAL nuestro**, igual que las
  demás. Con eso hereda gratis el sujeto polimórfico, el listado agrupado, duplicar, eliminar y los
  permisos: **ni una tabla nueva**. Su contenido vive en `roadmap_payload['rider']`.
  ⚠️ Su editor **NO es la hoja de ruta** (un rider no tiene días ni horarios): es su propia
  pantalla, y **`artist_template_edit` REDIRIGE** a ella (así un enlace antiguo sigue valiendo).
  Punto único de «a dónde se edita una plantilla»: **`_template_edit_url`**.
  · **Motor**: `RIDER_SECTION_CATALOG` (18 secciones sugeridas con su icono; las habituales vienen
  marcadas al crear) · `RIDER_PROVIDERS` (**quién lo pone**: el promotor · nosotros · por concretar)
  · `_rider_load` / `_rider_save` (con **`flag_modified`**: la trampa de siempre del JSONB) ·
  `_rider_context` · `_rider_summary` · `_build_rider_pdf_bytes` · `_concert_rider_rows`.
  ⚠️⚠️ **La clave de las líneas se llama `lines`, NO `items`**: en Jinja `s.items` devuelve el
  MÉTODO del dict y `s.items|length` revienta con «object of type builtin_function_or_method has no
  len()» (500 real de esta épica). La regla de la casa es **no llamar `items`/`keys`/`values`/`get`
  a una clave que se vaya a leer en una plantilla** — y por eso los contadores también son `lines`.
  ⚠️ **Una línea SIN CONCEPTO no se guarda** («2» de qué): para lo que no es una línea está la nota
  de la sección. Cada fila lleva DENTRO sus campos, así que **el orden del DOM es el que se guarda**.
  · **EL CATÁLOGO ES UNA SUGERENCIA**: se añaden las secciones que hagan falta con su nombre (la
  misma regla que los géneros de una canción), y una del catálogo **no se puede añadir dos veces**
  (partiría el documento en dos sitios).
  ⚠️ **El ORDEN de las secciones es el del DOCUMENTO** (es el orden del PDF y de la página
  pública), así que se mueve con las **flechas** de cada sección y su barra lleva **`data-no-sort`**:
  el gesto de «mantener pulsado para ordenar» de la casa guarda una PREFERENCIA de quien mira.
  · **ADJUNTOS por sección** (el plano de escenario, el input list): se arrastran o se eligen (el
  `data-file-drop-for` global) y **un archivo que no se admite NO se calla** (se dice cuál y los
  demás entran).
  · **EL PDF** (`rider_pdf`): logo de **33 Producciones** arriba a la derecha en todas las páginas
  —un rider es producción—, el título centrado, la cabecera del sujeto y una sección tras otra con
  su tabla (Cant. · Concepto · Quién lo pone · Nota), su nota y sus adjuntos, con las páginas x/x.
  Se sirve con **`_pdf_al_vuelo_response`** (`no-store`: se compone en el momento).
  · **EL ENLACE PÚBLICO** (`public_rider_view`, `/rider/<token>`, `templates/public_rider.html`):
  es lo que se comparte con el promotor (WhatsApp · correo · SMS · copiar), **siempre la PÁGINA,
  nunca el PDF ni el archivo**, con sus `og:` (la foto del sujeto → el logo). El token es **OPACO**
  (`ArtistTemplate.public_token`) y **se crea CON COMMIT**: con un flush sin commit se perdería y un
  enlace ya compartido dejaría de valer (bug real de las demos).
  ⚠️ Los adjuntos se descargan por **nuestro dominio** (`public_rider_file`, que valida el id
  contra lo que ESE token puede enseñar): la dirección de Storage no sale nunca a la página.
  · **DÓNDE SE VE**: la pestaña **Producción → Riders** (donde se trabajan) y **Plantillas →
  Riders**, que son **EL MISMO dato** (`_production_template_groups`, punto único, así que no se
  pueden desparejar); y en la **ficha de la ACTIVIDAD**, dentro de «Equipamiento», los riders de sus
  artistas (o de su evento, gira o ciclo) con su PDF y su enlace para el promotor.
  ⚠️ `_rider_rows_for_owners` va **en BLOQUE** (una consulta) y su `url_for` está **protegido**:
  esto se lee también desde un cron o un hilo («Working outside of application context»).
  ⚠️ Los endpoints se llaman **`rider_*`** y se resuelven a `produccion` **por PREFIJO**
  (ver el aviso de abajo); los cuatro públicos, en las TRES listas. Editar un rider es **editar
  producción** (no hay recurso nuevo que conceder): punto único **`_production_can_edit()`**.

- ⚠️⚠️ **UNA HABITACIÓN DE DOS: «TWIN» SON DOS CAMAS Y «DOBLE» ES UNA SOLA** (sep 2026). Lo que se
  llamaba «Doble» era cualquier habitación de dos personas, y eso es justo lo que se le pide a un
  hotel cuando se quiere UNA cama: se pedía mal. Ahora, con dos ocupantes se dice qué cama es
  —**Twin** (camas separadas) o **Doble** (una para los dos)— y se elige en el editor del rooming
  (`bed`: `TWIN` | `DOBLE`, con **TWIN por defecto**, que es lo que se venía usando).
  · Punto único **`_room_type_label(ocupantes, cama)`** (app.py) y su espejo **`roomTypeLabel(n, bed)`**
  (`roadmap.js`): de ellos salen la tarjeta de la habitación, el editor, el texto que se comparte, el
  **PDF** y el **Excel** del rooming (los dos pasan por `_rooming_rows_for_pdf`). ⚠️ Si se toca uno,
  se toca el otro.
  ⚠️ 1 persona sigue siendo **DUI** y 3 **Triple**: ahí no hay ambigüedad.

- **PRODUCCIÓN · PLANTILLAS Y RIDERS** (sep 2026). Producción gana dos pestañas: **Plantillas** —con
  una subpestaña por tipo, en este orden: **Hoja de ruta · Personal · Rooming · Gastos · Riders**— y
  **Riders**, que es donde se trabajan (por secciones: ver «PRODUCCIÓN · RIDERS» más abajo).
  · Dentro de cada subpestaña, las plantillas van **agrupadas por el SUJETO al que están
  vinculadas**: su foto, su nombre, qué es (artista, evento, gira, ciclo) y **cuándo se actualizó**;
  al pinchar una se abre **su editor de siempre**, que es donde se monta y se actualiza.
  · ⚠️⚠️ **UNA PLANTILLA YA NO ES SOLO DE UN ARTISTA**: se vincula a un **ARTISTA**, un **EVENTO**,
  una **GIRA comprada** o un **CICLO / FESTIVAL nuestro** — `ArtistTemplate.owner_type`/`owner_id`
  (`ensure_artist_templates_schema`). **`artist_id` se conserva y se sigue rellenando cuando el
  sujeto ES un artista**, porque de él tiran su ficha y toda la maquinaria de la hoja de ruta; con
  otro sujeto va NULL (la columna pasa a ser nullable). Puntos únicos `_template_owner_of` ·
  **`_template_rows_of(session_db, owner_type, owner_id, kind)`** (las del mismo sujeto, aceptando
  también las antiguas por `artist_id`) · `_template_subjects_map` (nombre, foto y ficha **en
  bloque**: una consulta por tipo, no una por plantilla).
  · **«+ Plantilla»** (`_production_template_modal.html` → `production_template_create`): el TIPO
  con su icono y a quién se vincula, con **lo ACTIVO delante y el resto tras «Ver más»** y un
  buscador. Al crearla se abre su editor.
  ⚠️ El selector de sujetos es el **MISMO** que el de las notas de prensa (punto único
  **`_subject_options(session_db, con_empresas=)`**): las EMPRESAS DEL GRUPO solo se ofrecen donde
  tienen sentido (una nota puede ser de la empresa, una plantilla de producción no).
  · **Las de GASTOS son un `ExpenseTemplate`** (la misma tabla que usan las simulaciones y las
  bolsas, ya polimórfica ARTIST|EVENT|VENUE), así que lo que se mejore en los gastos vale aquí, y su
  editor es el de siempre (`/plantillas-gastos/<id>`). Las de recinto solo salen ahí.
  · **Los RIDERS tienen su propio editor** (por secciones, `rider_edit`): `_template_edit_url` es
  el punto único de «a dónde se edita una plantilla». `PRODUCTION_TEMPLATE_READY` se conserva para
  poder meter un tipo nuevo desactivado sin que se pueda crear.
  ⚠️ El catálogo de la pantalla es **`PRODUCTION_TEMPLATE_KINDS`** (5 tipos), distinto de
  `ARTIST_TEMPLATE_KINDS` (los 3 que son hoja de ruta y deciden qué pestañas enseña el editor).
  ⚠️⚠️ Los endpoints nuevos (`production_template_*`, `rider_*`) se mapean con una regla de
  **PREFIJO** en `_resolve_request_resource_key`: puestos en su `mapping` son **código muerto** (ver
  el aviso propio más abajo). Editar plantillas es **editar producción** (no hay recurso nuevo que
  conceder): punto único **`_production_can_edit()`**, que decide dirección con el **rol del
  ESTADO** y no con `is_master()` (ese lee el rol de la SESIÓN y sin él cae a 10).
  ⚠️⚠️ **La pestaña ARCHIVADAS colgaba de un `{% else %}`**, así que al añadir pestañas nuevas el
  archivo se pintaba **debajo de ellas** (visto en pantalla). Ahora es `{% elif tab == 'archivadas' %}`:
  una pestaña nueva no puede heredar el contenido de otra.
  · Los **RIDERS** por secciones **ya están hechos**: ver «PRODUCCIÓN · RIDERS, POR SECCIONES».

- ⚠️⚠️ **PERSONAL DE LA HOJA DE RUTA · QUIÉN VA, CON QUÉ FUNCIÓN Y CON QUÉ DATOS** (sep 2026).
  ⚠️⚠️ **Los datos de una persona NO se duplican aquí**: viven en su ficha (un tercero, alguien de
  la oficina o un integrante de un artista) y esto solo dice **quién va** y **con qué función**. Lo
  que falte se rellena desde el propio listado y **se guarda EN SU FICHA**, así que no hay que
  volver a escribirlo en la actividad siguiente.
  · **SE BUSCA EN TODA LA BASE** (`api_roadmap_person_search`, `/api/hoja-ruta/personas`): el
  **personal de la oficina** (kind `USER`), los **integrantes de los artistas** y los **terceros**
  (`PROMOTER`), cada uno con su **foto** y con un subtítulo que dice qué es («Personal de la
  oficina», «Integrante de Los Ñus», «Tercero · su nick · su correo»). Al elegir a alguien se traen
  su teléfono y su email de su ficha, y **lo que no esté se crea al vuelo** con el «+».
  ⚠️ El **subtítulo tiene que servir para DISTINGUIR**: puede haber dos «Luis Gil», así que en un
  tercero lleva su nick (si no es ya el nombre) y su correo o su teléfono.
  ⚠️ Un **integrante que ya tiene ficha de tercero va como `PROMOTER`** (es la misma persona: la
  regla de `_artist_person_unify`); solo si no la tiene va como `MEMBER`.
  ⚠️ Los **bloqueados y eliminados no salen** (`_inactive_user_ids`, el punto único de siempre).
  · **QUÉ DATOS SE VEN** (botón «Qué datos se ven»): función · teléfono · email · DNI · fecha de
  nacimiento · necesidades de viaje · documento (la foto del DNI o el pasaporte). Se guarda **CON LA
  ACTIVIDAD o CON LA PLANTILLA** (`roadmap_payload['personnel_cols']`, `roadmap_personnel_cols`), y
  al **cargar una plantilla de personal se traen sus columnas** si la actividad no las ha tocado (lo
  elegido a mano manda). Catálogo `ROADMAP_PERSON_FIELDS`, punto único `_roadmap_person_cols`.
  ⚠️⚠️ **El PDF y el Excel se llevan LO QUE SE VE**: así el listado y el documento no pueden decir
  cosas distintas — y de paso se retiran los dos `confirm()` («¿incluir teléfono?», «¿incluir el
  DNI?») que preguntaban lo mismo otra vez. `?contact=` y `?dni=` siguen mandando si llegan.
  · **LO QUE FALTA SE DICE Y SE COMPLETA AHÍ MISMO** (`roadmap_person_fill`): la fila avisa en ámbar
  («Falta Teléfono · Email · DNI / NIE») y el pop-up lo guarda **en su ficha**.
  ⚠️⚠️ **Lo que YA está escrito en su ficha NO se pisa**: esto es para COMPLETAR, no para corregir
  (eso se hace en su ficha, que es la fuente de verdad). En la hoja de ruta sí se apunta lo escrito,
  que es lo que sale en el listado y en lo que se comparte.
  ⚠️⚠️ **Lo que se puede completar depende de DÓNDE está su ficha** (`ROADMAP_PERSON_FILLABLE` +
  `_roadmap_person_fillable`): un **TERCERO no tiene columna de fecha de nacimiento** (`Promoter`
  no la tiene: ese dato sale de su DNI escaneado) y a alguien de la **oficina no se le pregunta el
  correo** (es el de acceso, se cambia en su ficha). De una persona escrita **a mano** no se reclama
  nada: no hay dónde guardarlo.
  ⚠️ **Solo se avisa de lo que se está VIENDO** (más el teléfono y el email, que son lo básico): si
  nadie ha pedido ver el DNI, que falte no es una tarea.
  · **FUNCIONES**: el campo sigue siendo LIBRE, con **sugerencias** — las que YA se usan en esa hoja
  de ruta primero y detrás el catálogo `ROADMAP_ROLE_SUGGESTIONS` (`_roadmap_role_options`, que
  compara **sin acentos ni mayúsculas**: si no, «Tour Manager» y «tour manager» serían dos).
  · **FILTROS**: buscador de texto (nombre, función, teléfono, email, DNI), **chips por función** con
  su contador (selección única, «Todas» delante) y el botón de **orden** (por función / alfabético).
  ⚠️ El filtro de función **no se ofrece con un solo grupo** (no haría nada), y el buscador
  **normaliza los DOS lados** (`normText` ↔ `_norm_text_key`): si no, «nus» no encuentra «Ñus».
  · **EN BLOQUE, siempre**: `_roadmap_person_rows(session_db, personnel)` carga los terceros, los
  perfiles, los usuarios y los documentos **de una vez** (30 personas serían 90 consultas una a
  una). Lo usan la pestaña de PERSONAL (`roadmap_personnel_data`), el listado de VIAJE, el PDF y el
  Excel, así que los cuatro dicen lo mismo — `_travel_person_row` (que era una consulta por persona)
  se retiró.
  ⚠️ El teléfono y el email se **caen a la ficha** cuando en la hoja de ruta no se escribieron, y el
  DNI y el nacimiento **al documento** cuando la ficha no los tiene (el mismo criterio que la ficha).
  ⚠️⚠️ **`nick` NO es columna de `User`** (está en `UserProfile`) y **el correo de alguien de la casa
  sí lo es de `User`**: hay que unir las dos tablas. Un `User.nick` es un **AttributeError → 500**.
  ⚠️ Los endpoints van en `SUPPORT_*` (`roadmap_personnel_cols`, `roadmap_person_fill`,
  `roadmap_personnel_data`, `api_roadmap_person_search`), y de paso entraron los del **rooming**
  (`roadmap_hotel_reserved`, `roadmap_room_move`, `roadmap_room_delete`, `roadmap_room_guest`,
  `roadmap_person_no_room`), que se habían quedado fuera: sin eso, quien monta la producción se come
  un **403 al mover una habitación**.
  Probado con la app real (66 comprobaciones) y en el navegador: la búsqueda con los tres tipos, los
  datos que salen de la ficha, el aviso de lo que falta, completarlo sin pisar lo escrito, las
  columnas con su orden, el Excel siguiéndolas, la plantilla y los permisos de producción; y a
  375 px, sin desbordes y sin texto partido.

- ⚠️⚠️ **ROOMING · LAS HABITACIONES SE FORMAN ANTES Y LUEGO SE REPARTEN ENTRE LOS HOTELES**
  (sep 2026). Antes una habitación nacía DENTRO de un hotel, así que una gira con tres hoteles
  obligaba a montar el rooming tres veces. Ahora las habitaciones se forman **sin hotel** y se
  **arrastran** al que les toque: mientras quede alguna por repartir se ve el **bloque de reparto**
  —los hoteles en una FILA y debajo el montón— y, cuando no queda ninguna, ese bloque desaparece y
  se ven los hoteles con su rooming list de siempre.
  · **DÓNDE VIVEN**: `roadmap_payload['rooms_pool']` (punto único **`_rooming_pool`**), hermano de
  `hotels[i]['rooms']`. Una habitación se **BUSCA en los dos sitios** con
  **`_rooming_find_room(payload, room_id)`** → `(hotel_o_None, lista, i)`: cualquier endpoint que
  toque una habitación (mover, eliminar, huésped) pasa por ahí, así que da igual dónde esté.
  · **EL CONTADOR x/x SON LAS RESERVAS** (`hotels[i]['rooms_reserved']`, `_rooming_hotel_capacity` ↔
  `hotelCap` en `roadmap.js`, **espejados**): se ve en la tarjeta del hotel y en su columna del
  reparto, en **verde** cuando está completo, en **rojo** si se pasa y en **ámbar cuando SOBRAN**
  reservas («Sobran 3 habitaciones reservadas»), que es dinero que nadie va a usar. «sin reserva» se
  pincha para decir cuántas hay.
  ⚠️⚠️ **NO SE SUELTA UNA HABITACIÓN EN UN HOTEL QUE NO ESTÁ RESERVADO**: `roadmap_room_move`
  responde **409** con `needs_reserve` y el pop-up ofrece **«Modificar la reserva»** o **«Ampliar a
  N»** (y solo entonces se mueve, con `force`). Prometerle a alguien un hotel que no está reservado
  es peor que pararse a preguntar.
  · **SE ARRASTRAN LAS DOS COSAS**: una **habitación en bloque** (con su gente dentro, del montón a
  un hotel y de un hotel a otro) y un **huésped** suelto a otra habitación
  (`roadmap_room_guest`, que lo saca de donde estuviera). Al mover una habitación a un hotel, sus
  días pasan a ser **los del hotel de destino**.
  · **«NO NECESITA HABITACIÓN»** (`roadmap_person_no_room`): quien duerme en su casa deja de salir en
  «sin habitación» y no se le vuelve a reclamar. Se deshace.
  · **AL CARGAR UNA PLANTILLA DE ROOMING** (`roadmap_template_load`, rama ROOMING) las habitaciones
  entran **ya formadas y sin hotel**, y **se pregunta lo que no se puede decidir solo**: si la
  plantilla trae gente que no está en el personal de la actividad se responde `needs_decision` y el
  pop-up ofrece **añadirla al personal** o **dejarla fuera** (`mode=add_missing` | `skip_missing`);
  quien esté en el personal y no en la plantilla se queda **sin habitación**. Y si al dejar gente
  fuera alguna habitación se queda **VACÍA**, se avisa y se elige **conservarla** (para meter a otra
  persona) o **eliminarla** — nunca se borra sola.
  ⚠️ **Los HOTELES de la plantilla solo se traen si la actividad no tiene ninguno**: si no, cargarla
  dos veces (o cargarla sobre una actividad que ya tiene su hotel) los DUPLICA.
  ⚠️ **`bed` (Twin/Doble) hay que guardarlo también en `roadmap_hotel_rooms_save`**: sin eso, editar
  la rooming list del hotel perdía el tipo de cama que se había elegido.
  ⚠️ En una **PLANTILLA** los días no se tocan al mover (no tiene fechas: sus días son «Día 1, Día
  2…», anclados en `TEMPLATE_DAY_ANCHOR`).
  · Motor: `_rooming_pool` · `_rooming_find_room` · `_rooming_hotel_capacity` ·
  `roadmap_hotel_reserved` · `roadmap_room_move` · `roadmap_room_delete` · `roadmap_room_guest` ·
  `roadmap_person_no_room`; cliente `roomsPool` · `hotelCap` · `roomChip` · `repartoBlock` ·
  `sinHabitacion` · `wireReparto` · `moverHabitacion` · `pedirReserva` · `pedirDecisionPersonas` ·
  `avisarHabitacionesVacias`; estilos `.rmr*`.
  Probado en el navegador con la app real: se arrastra una habitación del montón a un hotel (el
  contador pasa a 2/3), se arrastra un huésped a otra habitación, con las reservas justas sale el
  pop-up y «Ampliar a 3» mueve la habitación y deja el hotel en 3/3, el hotel que se queda sin
  habitaciones avisa en ámbar de las que sobran, y el aviso dice «solo hay 1 habitación reservada y
  ya está puesta» o «2 habitaciones reservadas y ya están puestas» según toque.

- **PLANTILLAS DE ARTISTA** (`ArtistTemplate`, kind PERSONNEL|ROOMING|ROADMAP): se crean en la ficha
  del artista (pestaña «Plantillas», `_templates_hub.html`) y se cargan en la hoja de ruta de cualquier
  actividad. ⚠️ **El editor de una plantilla ES la hoja de ruta**: la columna se llama
  `roadmap_payload` y `ROADMAP_ENTITY_TYPES` incluye **`template`**, así que TODOS los endpoints
  `/hoja-ruta/template/<id>/...` (personal, hoteles/habitaciones, agenda, adjuntos, días) funcionan sin
  duplicar código y **cualquier función nueva de la hoja de ruta aparece también en las plantillas**.
  `ARTIST_TEMPLATE_KINDS` dice qué pestañas enseña cada tipo (`rm.tabs` → `_roadmap_panel.html`) y qué
  se copia. Los días de una plantilla no tienen fecha: se anclan en `TEMPLATE_DAY_ANCHOR` y se pintan
  «Día 1, Día 2…»; al cargarla, `_template_agenda_for_days` mapea Día N → N-ésimo día de la actividad
  (si sobran días, se quedan en el último). Cargar: botón **Plantillas** en las barras de Agenda,
  Hoteles y Personal (`roadmap.js`, `tplBtn`/`openTemplates`/`loadTemplate`) → `roadmap_template_load`;
  también se puede **guardar lo que hay ahora como plantilla** (`roadmap_template_save_from`).
  Personal: no duplica a nadie (`_artist_template_person_key`). **Rooming**: si la plantilla trae gente
  que no está en el personal de la actividad, el endpoint devuelve `needs_decision` con la lista y el
  modal pregunta (**añadirlas al personal** `mode=add_missing` / **dejarlas fuera** `skip_missing`);
  quien esté en el personal y no en la plantilla se queda **sin habitación**. Las plantillas de
  **gastos** y de **repertorio** se crean/editan desde el mismo hub (`expense_template_create` /
  `_update_items` y el modal de repertorio que ya existía).
- ⚠️⚠️ **HOJA DE RUTA · LA ACTIVIDAD, «HORARIOS» Y LAS HABITACIONES** (sep 2026):
  · **LA ACTIVIDAD es la PRIMERA sección** y se llama **como lo que es** —Concierto · Festival ·
  Evento…— con el icono de una **ESTRELLA**. Punto único **`_roadmap_activity_word(row)`**
  (`ROADMAP_ACTIVITY_WORDS`), del que salen el rótulo de la pestaña y el antetítulo de sus PDFs, así
  que no se pueden desparejar. ⚠️ Una fecha de un **CICLO se llama «Concierto»** (lo pidió Dani): lo
  que hay ese día es un concierto y a quien recibe la hoja de ruta la palabra «ciclo» no le dice
  nada. Una **PROMOCIÓN** es «Promoción», una acción «Acción» y un proyecto «Proyecto».
  · Lo que enseña lo compone **`_roadmap_activity_card`** (`rm.activity`): la foto, de quién es,
  **los datos con sus iconos** y los **CONTACTOS de la actividad** con su teléfono y su correo.
  ⚠️ Las filas son las de **`_contract_sheet_hero_rows`** —la MISMA cabecera de la ficha— más la
  apertura de puertas, la dirección y el promotor: aquí no se calcula nada nuevo.
  ⚠️ En una **PLANTILLA** devuelve **None** (no es ninguna actividad) y su pestaña no se pinta.
  · **«Agenda» pasa a llamarse «HORARIOS»** con el icono de un **reloj**. ⚠️ La CLAVE sigue siendo
  `agenda` (está en `ARTIST_TEMPLATE_TABS`, en el payload y en el router del JS): lo que cambia es
  el rótulo y el icono, en `_roadmap_panel.html` **y** en `TABS` de `roadmap.js`.
  · **En MÓVIL se queda solo el ICONO** (el rótulo va en un `<span>` que el CSS esconde por debajo
  de 576 px): así las cinco secciones se ven seguidas en UNA fila. El nombre sigue en el `title`.
  · **LAS HABITACIONES SE NUMERAN** («🛏 Habitación 1») y debajo va el tipo (DUI · Twin · Doble)
  como etiqueta. ⚠️ El número es el de la habitación **DENTRO DEL HOTEL** (`roomOrder` en el JS ·
  `index` en `_rooming_rows_for_pdf`), no el de su grupo de fechas: con dos rangos, numerar por
  grupo daba dos «Habitación 1». **Si se toca uno, se toca el otro.**
  · **EL NÚMERO QUE DA EL HOTEL** (214, «5B»): se escribe en un hueco de la propia tarjeta, con el
  icono de una **PUERTA**, y se guarda al salir del campo por su **endpoint propio**
  (`roadmap_room_number`, en `SUPPORT_ACTION_ENDPOINTS`) — así no se toca nada más de la rooming
  list. Vale esté la habitación en un hotel o sin repartir (`_rooming_find_room`).
  ⚠️⚠️ **`roadmap_hotel_rooms_save` RECONSTRUYE la lista entera**, así que tiene que CONSERVARLO
  (`_rooming_clean_number`): sin esa línea se perdía al tocar cualquier otra cosa del rooming.
  ⚠️⚠️ **NO SALE DE CASA**: es de la oficina y del road manager (saber en qué habitación duerme
  alguien es un dato de seguridad). Lo quita **`_roadmap_payload_for_kind`** —el punto único por el
  que pasa el payload de la hoja de ruta pública y del portal de externos—, **en el SERVIDOR**: esas
  pantallas meten el payload entero en el HTML, así que esconderlo en el navegador no valdría. En el
  **PDF y el Excel sí sale** (los baja quien tiene sesión, y es con lo que se reparten las llaves).
  · **EL DESAYUNO: la taza ACTIVA o TACHADA** (`brkIcon`, `.rm-brk--off` con su barra en CSS). Una
  taza al 25% no dice si es que no hay desayuno o que el dato no está.
  · **Compartir · Editar · ⋮** van juntos **arriba a la derecha** de la tarjeta del hotel
  (`roomingActions`), y en pantalla estrecha se quedan solo los iconos. El bloque del rooming ya no
  lleva botones.
  · **La FOTO DEL DNI se DECIDE**: al descargar el PDF sale un pop-up con **«Incluir imagen DNI»** /
  **«No incluir»** (antes era un `confirm()` de Aceptar/Cancelar, que no dice qué hace cada uno). La
  descarga va con la **barra de la casa** (`app33Download.get`), que no bloquea la pantalla.
  · **EL PDF DE LA ROOMING LIST** lleva la **cabecera de la actividad** (foto, qué es, de quién y sus
  datos con iconos, `_roadmap_pdf_activity_card` ← `_roadmap_export_header`) y cada habitación con su
  **cabecera en el AZUL de la marca** y sus iconos (cama · puerta · taza). ⚠️ En un PDF los iconos
  van como **PNG** (`_roadmap_pdf_icon` → `_fa_icon_png_path`): ReportLab no entiende la fuente de
  iconos, y un `<img>` dentro de un `<font backColor>` **no se dibuja**.

- ⚠️⚠️ **HOJA DE RUTA · CÓMO LLEGAR, QUIÉN MIRA Y «LO QUE TENGO HOY»** (sep 2026):
  · ⚠️ **«PEDIR UN CABIFY» SE RETIRÓ** (13-sep-2026, lo pidió Dani): Cabify no publica ningún enlace
  con destino (su app solo abre por `/payment_methods` y `/loyalty_program`), así que lo único que se
  podía hacer era abrir la app con la dirección copiada, y no compensaba. `cabifyBtn`/`pedirCabify` y
  `.rm-cabify` ya no existen; «Cabify / VTC» sigue como TIPO de transporte (`ROADMAP_TRANSPORT_MODES`).
  · ⚠️⚠️ **EL ICONO DE MAPA ES UNO SOLO Y VA EN EL AZUL DE LA CASA** (`mapLink` en `roadmap.js` →
  `.rm-maplink`): el punto de los horarios, su detalle y el HOTEL. El del hotel heredaba el gris de
  `.rm-sub` y se veía distinto sin motivo (bug real). Va con `data-ext`: en la fila de un punto, un
  clic en el mapa no abre su detalle.
  · ⚠️⚠️ **LA CHINCHETA DEL ACCESO**: en las instrucciones de acceso —las del RECINTO
  (`openVenueAccess`, `Venue.access_lat/access_lng`, endpoint `roadmap_venue_access_save`) y las de
  un PUNTO de los horarios (`item.access_lat/access_lng`, en `_roadmap_item_from_json`)— se pone una
  chincheta en un mapa Leaflet (`pinPicker`: pinchar la pone, arrastrarla la afina, «Quitar la
  chincheta» la quita; el recinto sale en gris como referencia) y **con ella puesta el icono de mapa
  lleva a ESE punto exacto** (`mapsUrlAt`: Apple Maps con `ll=` en iPhone/iPad/Mac, Google con las
  coordenadas en el resto; `venueMapsHref` / `itemMapsHref` deciden). La nota de acceso lleva el
  icono al lado (`accesoHtml`) y el mapa de la tarjeta del recinto pinta las dos marcas (la del
  recinto y la roja del acceso, `accessIcon`).
  ⚠️ Son **las DOS coordenadas o NINGUNA** (`_roadmap_coord_pair`; una sola no sitúa nada), con su
  rango y admitiendo coma decimal (`_roadmap_coord`). Un guardado que **no manda** las coordenadas
  **no las borra** (la regla de los centinelas: `if "access_lat" in data`, y la lista de claves que
  se conservan al editar un punto).
  ⚠️ **Leaflet mide el hueco al crearse**: el mapa del editor de un punto nace dentro de un bloque
  ESCONDIDO (`data-access-wrap`), así que al encender «Instrucciones de acceso» hay que llamar a
  `refresh()` (`invalidateSize`), y en un modal se repite a los 150/450/1000 ms y en `shown.bs.modal`.
  ⚠️ Las columnas nuevas de `venues` van en `ensure_roadmap_extras_schema` (NO en
  `ensure_video_web_schema`, que es donde parece que están por la línea) y `icons` en
  `ensure_simulations_schema`: cada una en su propia sentencia.
  · **EL RECINTO SE PINCHA EN LA CABECERA** y abre su pop-up (`abreVenuePop`): la foto, la
  dirección, el aforo, cómo se accede, sus contactos y el botón de **Cómo llegar** (a la chincheta del
  acceso si está puesta). La fila se reconoce por su **clave** (`key == 'venue'`, que pone
  `_roadmap_activity_card`), no por el TEXTO de la etiqueta, que es lo que se enseña.
  · **QUIÉN ESTÁ MIRANDO**, arriba a la derecha de la hoja compartida (`_roadmap_viewer_badge` →
  `viewer`): **sin sesión**, el muñequito y un pop-up con las DOS puertas (el portal de fuera y la
  app de la casa); **con sesión**, SU FOTO y, al pincharla, sus funciones (su Inicio si es de la
  casa, su portal si es un tercero). Una hoja de ruta se abre por un enlace, así que quien la mira
  puede no haber entrado en ningún sitio.
  ⚠️ `DEFAULT_AVATAR_URL` **solo existe en las PLANTILLAS**: en Python es `_default_avatar_url()`
  (bug real de este lote).
  · **«LO QUE TENGO HOY»** (`_home_roadmap_today` → `HOME_ROADMAP_TODAY`, arriba de los accesos
  rápidos de Inicio): a quien ese día **acompaña al artista** (`escort_user_id`) o va en el
  **personal de la hoja de ruta** (`_roadmap_user_ids`, kind USER) le sale un botón con la foto del
  artista, el tipo de actividad, su nombre y la fecha, que lleva a **VER su hoja de ruta**.
  ⚠️ **Se va DOS HORAS después de LO ÚLTIMO de la hoja de ruta** (`_roadmap_end_moment` +
  `HOME_ROADMAP_AFTER_HOURS`), no al acabar el concierto: lo último suele ser el transporte de
  vuelta. Solo se consultan las actividades de hoy y de ayer (el margen cruza la medianoche).
  · **MI HOJA DE RUTA** (`roadmap_mine`, `/mi-hoja-de-ruta/<tipo>/<id>`): la hoja **como se ve
  cuando se comparte pero DENTRO de la app** —lo que hace falta es MIRARLA, no gestionarla— y el
  **volver lleva al INICIO**, que es de donde se viene.
  ⚠️ Va en modo lectura pero **con el payload COMPLETO**: quien entra es de la casa, así que ve lo
  que no sale fuera (el número de habitación). Por eso **no** pasa por `_roadmap_payload_for_kind`.
  ⚠️ Está en **`SUPPORT_READ_ENDPOINTS`**, no en `SUPPORT_ACTION_ENDPOINTS`: ese exige ser «actor»
  y quien acompaña al artista puede no poder editar ninguna sección. La puerta fina la pone el
  propio endpoint (va en ella, o ya puede abrir la actividad).
  · **El DESAYUNO tachado se ve**: la barra va en un gris MÁS OSCURO que el icono apagado (con el
  mismo gris no se distinguía de una taza «apagada» sin más).

- **Hoja de ruta: GENERAL y TÉCNICA** (`ROADMAP_KINDS`, `_roadmap_kinds`/`_set_roadmap_kinds`): cada
  actividad tiene las dos activas por defecto (etiquetas en el alta) y **un enlace público por hoja**
  (`roadmap_public_token` para la general, `roadmap_payload['tech_token']` para la técnica;
  `_ensure_roadmap_token`/`_roadmap_by_token`). **Quién ve cada cosa se decide punto por punto**: cada
  ítem de la agenda lleva `sheets` `{GENERAL,TECNICA}` (`_roadmap_item_sheets`, las DOS por defecto —
  también en los ítems antiguos sin el campo). El enlace de cada hoja solo muestra los ítems con su
  etiqueta: filtra **`_roadmap_payload_for_kind`** en `public_roadmap_view` (⚠️ **en el servidor**: el
  payload entero va al HTML dentro de `#roadmapData`, esconderlo en el navegador no serviría) y los días
  se recalculan con lo que queda. Desmarcar las dos deja el punto **solo para dentro** («No se
  comparte»). UI en `static/js/roadmap.js`: chips `.filter-chip` en el editor del ítem, etiqueta
  `.rm-tag.sheet` en la fila y en el detalle (solo en el back office). La pestaña Logística se nutre de
  los ítems de transporte, así que hereda el filtro; Hoteles y Personal salen en las dos hojas.
  `roadmap_item_save` conserva las etiquetas si el cliente no las manda (JS viejo en caché).
- **Cabecera del SUJETO al entrar en él** (`/actividades`, «Otras actividades» y Producción → Activas):
  foto + nombre + **su total de actividades** (`drill_subject.count` / `activas.subject.count`, que es
  el del sujeto, no el del filtro de tipo que haya puesto), para no perder de vista de quién es lo que
  se está mirando. En Producción, **debajo de la cabecera** van los filtros por tipo.
- **Producción → Activas · PENDIENTES DE ASIGNAR** (`_production_active_context`): lo que no tiene
  responsable va en su propio listado **DEBAJO de la rejilla de artistas** y **solo ahí** (dentro de un
  artista o evento no viene a cuento: `unassigned` se devuelve vacío cuando hay `subject`). Si no hay
  ninguna pendiente, no se muestra nada. Desde ese listado lo ÚNICO que se hace es **elegir a la
  persona de producción** (modal `#assignProdModal` con `_production_people`, POST a
  `concert_production_owner_save`): no se navega a la ficha.
  ⚠️ Ese endpoint está en **`SUPPORT_ACTION_ENDPOINTS`** y su check interno acepta contratación,
  **producción** o **quien creó la actividad** (`Concert.created_by_user_id`): activar la producción es
  tarea del creador, y con solo `can_edit_concerts()` el botón de su Inicio moría en un 403.

- **Facturación de proveedores** (`/facturacion`, landing pública en 3 pasos): plantilla
  `public_invoice_landing.html` + estilos `.inv-step*`. Un solo componente con dos modos:
  `inv_mode=LANDING` (bañera del back office a la izquierda, todas las empresas del grupo) e
  `inv_mode=REQUEST` (logo de la empresa del grupo a la DERECHA y solo sus datos; **sin casilla de
  confirmación**: los datos están a la vista y basta con «Continuar»). Lo usan `/factura/<token>`
  (petición de bolsa, `BagInvoiceRequest`) y `/facturacion?liq=<token>` (liquidación de royalties;
  la empresa es **PIES**, ver abajo). Backend:
  `_tax_id_kind` (empresa si empieza por letra, particular si acaba en letra), `_billing_profile_payload`
  (datos **enmascarados** con `_mask_value`: quien teclee un DNI ajeno no lee IBAN/email/teléfono),
  `_billing_required_docs`/`_billing_docs_state` (factura + `CERT_AEAT` solo empresas + `CERT_SS`;
  ambos en `INVOICE_MONTHLY_CERTS` → **caducan cada mes**, `_cert_month_range`), endpoints
  `public_invoice_identify`/`_register`/`_docs_state`/`_upload`. **Al identificar a alguien al que le
  faltan datos** solo se le piden los que faltan: los que ya tenemos se muestran en el formulario
  **censurados y bloqueados** (`shown` del payload; el nombre en claro, el resto con `_mask_value`),
  con candado y sin viajar al servidor (`disabled`, para no pisar el dato con «•••»). Pinchando encima
  se pregunta «Vas a actualizar el <campo>. ¿Continuar?» y, al aceptar, queda vacío y editable
  (clase `.inv-locked`). El hueco de **foto/logo solo aparece si esa persona no tiene ninguna**
  (`has_photo`). **La búsqueda por DNI/CIF mira TRES
  sitios** (todas las vías, sin cortar en la primera: si dos fichas comparten el número se ofrecen las
  dos y elige quien factura): `Promoter.tax_id`, `PromoterCompany.tax_id` y el **nº del DNI/pasaporte
  ESCANEADO** (`PersonDocument.doc_number`) — los artistas y sus personas suelen tener el documento
  subido aunque nadie haya rellenado el campo DNI/NIF, y sin esto se les pedía darse de alta otra vez
  y salía un tercero duplicado. Cada coincidencia lleva su **artista** (`_promoter_artist_context`:
  persona del artista vía `ArtistPerson.promoter_id`, o vinculado a él por `ThirdPartyLink`), que se
  muestra como pastilla («De Los X» / «Vinculado a Los X»), sale en el selector cuando hay varias y
  **rellena solo el ARTISTA de la factura**. Los certificados se guardan como
  `PersonComplianceDoc` (mismo sistema que PRL) y las facturas como `SupplierInvoice`
  (PENDIENTE/VALIDADA/RECHAZADA). Los enlaces oficiales de AEAT/Seguridad Social están en
  `INVOICE_CERT_DOCS`.
  ⚠️ **Ningún paso puede ser un callejón sin salida**: el paso «¿para quién es la factura?» PIDE elegir
  destinatario pero **no bloquea** (si no se elige, se avisa en la propia página y se sigue: el
  destinatario es opcional). Antes soltaba un `alert()` y, si no se veía, uno se quedaba atascado con
  el paso del DNI cerrado y «Comprobar» sin hacer nada (bug real). Además, un paso bloqueado ya **no se
  come los clics en silencio**: `.inv-step.is-locked` deja pasar el clic (el `pointer-events:none` es
  solo del `__body`) y al pinchar dentro se lleva al paso pendiente con un destello
  (`.inv-step--flash`).
  ⚠️ **Los números de paso se DEDUCEN del DOM** (`stepNumOf`): en el enlace de una petición no existe
  el paso «¿para quién es la factura?», así que la numeración (1,3,4) NO es la de la landing (1,2,3,4).
  Cuando estaba a mano, el enlace del proveedor desbloqueaba un paso inexistente y el de escribir el
  DNI se quedaba con `pointer-events:none`: al pulsar «Comprobar» no pasaba nada (bug real).
- ⚠️ **Dicts en plantillas**: `d.items`/`d.keys`/`d.values` en Jinja devuelven el **método**, no la
  clave → hay que escribir `d['items']`. Ha causado TRES 500 reales (el set list del concierto,
  «Royalties → A favor» y la ficha de un proyecto, con una clave llamada `values`: el error es
  «'builtin_function_or_method object' has no attribute 'get'»). El checker de esprima NO lo detecta:
  revisar el HTML servido con curl. **La forma de no tropezar es no llamar `items`/`keys`/`values`/
  `get`/`copy`/`update` a una clave** que se vaya a leer en una plantilla (por eso la de la logística
  se llama `note_values`).

- ⚠️ **Plantillas que parecen vivas y no lo son**: además de la anterior, `concerts.html` solo se
  usa en la pestaña **Facturación** (la vista de conciertos es `concerts_vista.html`), y su bloque
  `{% if active_tab == 'vista' %}` nunca se cumple. Antes de tocar una plantilla, comprobar con
  `grep -n "<fichero>.html" app.py` que se renderiza y desde dónde.

- ⚠️⚠️⚠️ **`_snapshot_user_profile` DESTROZABA LOS DEPARTAMENTOS: `list("Producción")` SON LETRAS**
  (bug real y transversal, sep 2026). El snapshot del perfil hacía
  `departments=list(getattr(profile, "departments", None) or [])`, y `UserProfile.departments` es una
  lista en JSONB **pero hay filas donde quedó guardado como TEXTO**: recorrer un texto devuelve
  `['P','r','o','d',…]`. Ese snapshot es lo que ve TODA la app a través de `_current_user_state()`,
  así que esa persona se quedaba **sin ningún departamento** y —sin dar ningún error— en Producción
  veía las actividades de **toda la casa** en vez de las suyas. Ahora se lee con el punto único
  **`_departments_iter`**, así que el dato llega bien a todo lo que pregunta por el departamento
  desde la sesión.
  ⚠️ Y la comparación de `_production_active_context` era la cadena literal
  (`"producción" in deps`): pasa a **`_profile_in_department(profile, "Producción")`**, que además
  tolera «Producción musical» (`_department_guess`). Con las dos cosas, el filtro por asignación
  funciona con el departamento escrito de cualquier forma.
  ⚠️ Quedan lecturas crudas de `departments` sobre el objeto del ORM (la ficha de personal, el
  listado, las dos siembras puntuales ya ejecutadas): al tocar una, usar `_profile_in_department` /
  `_departments_iter`.
  Probado con la app real: con `departments = ["Producción musical"]` y con `"Producción"` guardado
  como TEXTO, cada una ve **solo su actividad** (contador 1) y sin «Pendientes de asignar»;
  dirección y quien no es de producción siguen viéndolo todo.

- **NOTAS DE PRENSA · LAS PLANTILLAS** (sep 2026). Botón **«Plantillas»** arriba a la derecha, **al
  lado del de nota y SIN RELLENAR** (`/notas-de-prensa/plantillas`): la pantalla donde se **añaden,
  se editan y se quitan**.
  ⚠️⚠️ **UNA PLANTILLA NO ES UN FONDO**: puede ser **solo el fondo** o un fondo **CON MÓDULOS**, que
  en la nota que se haga con ella **se precargan EN BLANCO** (con su sitio, su tamaño y su estilo; lo
  que se vacía es el CONTENIDO, que es de cada nota). Antes solo se podía guardar la imagen de fondo
  (`PressReleaseTemplate`).
  · **Una plantilla ES una nota con `purpose='TEMPLATE'`**, así que **se edita con el editor de
  siempre** (no hay un segundo editor que mantener) — el mismo patrón que el correo de un envío a
  compradores (`CAMPAIGN`). Y como `_press_is_press_clause()` solo acepta NULL/PRESS, queda fuera de
  la pestaña, del panel de las fichas, de «ya hay una nota sin enviar», de las estadísticas y del
  barrido de programadas **sin tocar ninguna consulta**.
  · **Sus módulos salen en blanco a propósito**: una plantilla no es de ningún artista ni de ninguna
  actividad, así que lo que depende del sujeto se pinta como pendiente (`press_render.is_pending`).
  El editor lo dice en su cabecera y su botón principal es **«Guardar plantilla»** (no «enviar»).
  · Puntos únicos: **`_press_is_template`** · **`_press_templates`** / `_press_template_rows` ·
  **`_press_template_blank_design`** (el diseño listo para una nota nueva) ·
  `_press_template_source_rows` (las notas de las que se puede sacar una).
  ⚠️ **En una plantilla, `title` es SU NOMBRE**: `promo_press_save` **no lo pisa** con el titular del
  diseño (si no, la plantilla se quedaba sin nombre en cuanto se guardaba).
  · **Se crea de dos formas**: **en blanco** o **copiando una nota** ya montada («guardar esto para
  volver a usarlo»), y también desde el propio editor con «Guardar este diseño como plantilla», que
  **guarda primero** y va por el MISMO endpoint (`promo_press_template_new`): no hay dos formas de
  crear una plantilla.
  · **Se usa** al crear la nota (el selector del asistente, que dice qué lleva cada una) y desde el
  editor (menú «Plantillas» → `promo_press_template_apply`, que **reemplaza el diseño entero**, así
  que el editor pregunta si ya había algo puesto).
  ⚠️ La ruta JSON que lista las plantillas pasa a **`/notas-de-prensa/plantillas/lista`** para dejar
  la ruta bonita a la pantalla (dos reglas iguales se pisan).
  ⚠️ **Eliminar comprueba que es una PLANTILLA** (`_press_is_template`): con el id de una nota, ese
  endpoint borraría la nota.
  · **Los FONDOS que ya estaban guardados** pasan a ser plantillas una vez
  (`_press_templates_migrate_once`, marca `press_templates_migrate_v1`), así que hay **un solo
  concepto de plantilla**; es idempotente (no duplica) y `PressReleaseTemplate` se queda solo como
  la tabla de origen de esa migración.
  Probado con la app real: el botón, la migración sin duplicados, la pantalla, crear en blanco y
  desde una nota, los módulos en blanco conservando estilo y opciones, crear la nota con la
  plantilla, cargarla desde el editor, que no sale en la pestaña, renombrar (y que el nombre
  sobrevive a guardar el diseño) y eliminar.

- **HOJA DE RUTA · UNA SOLA LÍNEA DE TIEMPO, con filtro por días** (sep 2026). Con varios días eran
  tarjetas sueltas, una por día. Ahora es **una línea continua** de arriba abajo (`.rm-agenda::before`)
  y cada día se marca con **su hoja de calendario** sobre ella (`.rm-cal`, con `z-index` y sombra);
  los puntos cuelgan de esa misma línea (`.rm-dayitems` con el hueco a la izquierda). Se lee de un
  tirón, que es lo que pasa de verdad: el día siguiente empieza donde acaba el anterior.
  · **Filtro por días** (`dayFilter()` en `roadmap.js`, los `.filter-chip` de la casa): «Todos los
  días» y un chip por día, y se pueden ver **varios a la vez**. Solo se pinta con **más de un día**
  (con uno no filtra nada), y entonces la agenda va con `rm-agenda--single`: sin línea ni hueco.
  ⚠️ El filtro es del NAVEGADOR (`diasVistos`): no se guarda ni se manda al servidor.

- **HOJA DE RUTA · APERTURA DE PUERTAS** (sep 2026): un concepto más del catálogo
  (`ROADMAP_ACTIVITY_TYPES` → `APERTURA_PUERTAS`, icono **`fa-door-open`** en ámbar), así que sale
  solo en el selector del «+», en la agenda, en el detalle, en la hoja de ruta **pública** y en las
  plantillas: el catálogo es el punto único (`_roadmap_kind_catalog`) y no hay que tocar ninguna
  pantalla.
  ⚠️ **Puede haber VARIAS en la misma actividad** (puertas de pista, de grada, de invitados…): cada
  una es su propio punto de agenda con **su hora**, como cualquier otro — no hay nada que limite un
  ítem por tipo.
  · **La hora sale de la FICHA**: la actividad ya dice a qué hora abren (`Concert.doors_time`), así
  que el punto nace con ESA hora (`"doors_time"` del contexto → `DOORS` en `roadmap.js`, aplicado en
  `newDraft`) y se puede cambiar. No se escribe el mismo dato dos veces.
  ⚠️ Se pasa por **`_roadmap_clean_time`**: ese campo es texto libre y un «una hora antes» no es una
  hora — lo que no sea «HH:MM» no se precumplimenta. Y en una promoción, un proyecto o una plantilla
  (que no tienen ese campo) llega vacío, no revienta.

- ⚠️⚠️ **UN TRASLADO SE LLENA CON VARIAS PERSONAS DE GOLPE** (sep 2026): en un transfer va casi
  siempre medio equipo, así que el pop-up de pasajeros (`openPassengerPicker`) es de **selección
  múltiple** — casillas con la foto y la función, «Todos» / «Ninguno» y el botón dice cuántos
  («Añadir (3)»)—; de una en una era un trabajo tonto.
  ⚠️ **Quien ya va sale como «ya va»** (`.rm-result.is-done`) y **no se puede elegir dos veces**;
  sin marcar a nadie el botón **avisa** en vez de no hacer nada, y el pop-up **no se cierra**.
  ⚠️ «Todos» / «Ninguno» solo se pintan **cuando hacen algo** (y no con una sola persona que
  elegir): la regla de la casa de los filtros del calendario.
  ⚠️ Un **tercero nuevo** (o alguien a mano) se añade **A LA SELECCIÓN sin cerrar** el pop-up, para
  poder juntarlo con los demás del mismo viaje: `savePerson` dedupe por `kind`+`ref_id`
  (`roadmap_personnel_save`), así que un tercero que ya está en el personal devuelve su id.
  ⚠️ El cuadrado SIN marcar va en **`fa-regular fa-square`**: en la familia SOLID `fa-square` es un
  cuadrado MACIZO y parece ya marcado.

- ⚠️⚠️ **HOJA DE RUTA · lo que ve cada uno, quién puede actualizarla y el repertorio** (sep 2026,
  lo pidió Dani). Un solo motor (`roadmap.js` + los endpoints `/hoja-ruta/…`) para dentro, para el
  enlace compartido y para el portal, y lo que cambia es QUIÉN mira:
  · **EL ORDEN DE LAS PESTAÑAS**: **Horarios** la primera · Logística · Hoteles · Personal ·
  **Repertorio** (solo cuando se canta, `rm.show_repertoire`) · y **la actividad la ÚLTIMA**,
  llamada como lo que es (`rm.activity.word`). Vive en DOS sitios que hay que dejar iguales:
  `_roadmap_panel.html` y `TABS` de `roadmap.js`.
  · **FUERA DE LA APP la CABECERA de la actividad va ARRIBA DEL TODO** (`rm.header_on_top` → el
  `#rmHeader` que pinta `actHeadHtml()`), y **fuera los iconos de «hoja de ruta general» y «solo
  lectura»** (quien la recibe no necesita saber cómo se llama por dentro; el `<title>` dice «Hoja
  de ruta · X»). En el portal, la cabecera es el `ficha-hero` que la página ya tiene.
  · **LA ACTIVIDAD, POR VIÑETAS** (`renderActividad`, `.rm-card` con la cabecera en el color
  corporativo —el bocadillo de las bolsas— y su icono): **Promotor** (`_roadmap_promoter_card`, del
  punto único `_concert_promoter_display`) · **Recinto** (`_roadmap_venue_card`: foto, dirección,
  cubierto o no, aforo, el **mapa** —Leaflet cargado al vuelo desde unpkg, con las coordenadas que
  `_venue_coords` guarda en `Venue.lat/lng` geocodificando UNA vez con `geo_utils.geocode_address`—,
  «Abrir en Mapas» —Apple Maps en un iPhone/iPad/Mac, Google en el resto: `mapsUrl()`— y la nota
  **«Acceso:»** solo si existe, `Venue.access_notes`, que es DEL RECINTO y solo la toca la casa) ·
  **la propia actividad** (duración de la ficha de contratación, formación, «se canta» y las notas
  `payload['activity_notes']`) · **Contactos** agrupados por función (los de la actividad + los que
  se AÑADEN aquí, `payload['contacts']`, con teléfono, correo y **WhatsApp** —`waLink()`—; sin
  foto, el muñequito). ⚠️ El teléfono y el correo van **cada uno en su línea**: juntos con «·» se
  partían mal en una viñeta estrecha.
  · **CADA PUNTO DE LOS HORARIOS DICE A QUIÉN AFECTA** (`item['audience']`: `ALL` · `ROLES` · `PEOPLE`,
  punto único `_roadmap_item_audience`): en la fila sale la etiqueta por función o los **nicks con su
  cara** (`.rm-aud`, se deslizan si son varios); lo de TODOS no lleva nada. Y **se canta**
  (`item['sings']` + `item['songs']`: la etiqueta «Canta · N temas» lleva a la pestaña Repertorio) e
  **instrucciones de acceso** (`item['access_note']`). Con un sitio escrito, el **icono de mapa**.
  ⚠️ Una ENTREVISTA guarda «canta» y sus canciones en `interview`: `_roadmap_item_from_json` los
  ESPEJA al punto para que el repertorio lea todos igual (y al revés).
  · **EL REPERTORIO** (`renderRepertorio`): arriba el set list de la ficha (`_roadmap_setlist_context`,
  tal como está configurado, con su PDF —`roadmap_setlist_pdf` / `public_roadmap_setlist_pdf`— y el
  enlace a la ficha para editarlo) y debajo **el de cada punto que canta** (`roadmap_item_songs`:
  buscar en el repertorio del artista, arrastrar para ordenar, su PDF con `?item=`). Un punto que
  canta y no tiene canciones es la tarea **«Configurar el repertorio de la hoja de ruta»** de
  PRODUCCIÓN (`_roadmap_repertoire_pending`, en el tablero de la ficha y en Inicio,
  `_home_roadmap_repertoire_pending`, buscando con el operador `@>` de JSONB).
  ⚠️ El dibujo del PDF del set list está extraído en **`_setlist_pdf_bytes(header, items)`** (puro):
  lo usan el de la ficha, el de la hoja de ruta y el compartido.
  ⚠️⚠️ **«ELIMINAR» DE UN SET LIST NO BORRABA NADA** (bug real, sep 2026). El menú de los tres
  puntitos de cada línea lo **TELEPORTA al `<body>`** el motor de desplegables de la casa
  (`scripts.js`, para que no lo recorte ningún `overflow`), así que al abrirlo **deja de ser hijo de
  su fila**: el listener colgaba de la lista de filas y `closest('[data-idx]')` devolvía `null`, con
  lo que pinchar «Eliminar» **no hacía absolutamente nada**. Ahora cada opción lleva **su índice**
  (`data-row`) y el listener va en **`document`**; antes de repintar se cierra el desplegable (si no,
  su menú se queda huérfano en el `<body>`).
  ⚠️ **Es la regla de la casa vista desde otro lado**: con estos menús no basta con delegar, hay que
  no depender del DOM para saber de qué fila es la opción.
  · **LA BARRA DE AÑADIR CANCIONES VA ARRIBA**, encima de la paleta de iconos: primero se monta el
  repertorio y después se le ponen los iconos (antes había que bajar hasta el final para añadir).
  · **EL SEPARADOR (PARÓN) DEL PDF ES MÁS FINO**: la banda rayada ocupaba más de media línea y se
  comía la página; ahora ~un tercio, con el grosor y la separación de las rayas **calculados con su
  altura** (a una banda fina, unas rayas gordas quedan fatal). Sigue siendo una banda con su título
  en medio, no una raya.
  · ⚠️⚠️ **LOS EXTERNOS VEN SOLO LO QUE LES AFECTA** (el portal, `externos_activity` /
  `externos_promotion`): `_roadmap_ext_person_info` (qué es esa persona en ESA hoja: sus filas del
  personal, sus funciones, su marca) · `_roadmap_payload_shared` (solo lo marcado para alguna hoja)
  · **`_roadmap_payload_for_person`** (sus horarios y traslados —un traslado con pasajeros solo a
  quien va—, sus hoteles y **el número de habitación solo de la suya**). En el SERVIDOR: el payload
  entero va en el HTML. El artista o el promotor (que no están en el personal) ven lo que sale de
  casa.
  · ⚠️⚠️ **«PUEDE ACTUALIZAR LA HOJA DE RUTA»** (`personnel[i]['can_edit']`, el interruptor del
  editor de una persona —solo un tercero o un integrante, que son quienes entran por el portal— y la
  etiqueta verde en su fila): esa persona, logueada en `/externos`, **edita los horarios, la
  logística y el repertorio, baja el rooming y el personal con DNI y manda SMS**; los hoteles y el
  personal los VE, y lo de la casa (compartir, configurar días, plantillas, la nota de acceso) no lo
  toca. En el JS es `EXT` (`ext_editor`), con `HRO`/`PRO` (hoteles y personal en solo lectura) y
  `CAN_ADMIN`/`CAN_CREATE`.
  ⚠️⚠️ **LA PUERTA ES `_ext_roadmap_gate_ok()`**, un solo choke point con la lista blanca
  `EXT_ROADMAP_EDITOR_ENDPOINTS` (+ `EXT_ROADMAP_VIEWER_ENDPOINTS`): comprueba la ruta, el endpoint,
  la sesión externa (no bloqueada), que la actividad sea SUYA y su marca, y no deja pasar la
  previsualización de dirección (`ext_preview`). Se llama desde **DOS sitios y hacen falta los dos**:
  `_require_login_v2` (la compuerta de login corre ANTES que cualquier decorador: sin esto el externo
  se comía un redirect al login) y `admin_required` (el decorador de los endpoints). Un endpoint que
  no esté en la lista sigue pidiendo sesión de la casa.
  ⚠️ `_roadmap_save` apunta en `updated_by` el nick de la casa, el `ext_name` del externo o
  «sistema» fuera de una petición (`session` revienta desde un cron o un hilo).
  · **SMS AL PERSONAL: AHORA O PROGRAMADO** (`RoadmapScheduledMessage`, `roadmap_message_send` con
  `send_at` → PENDIENTE; `roadmap_message_cancel` → ANULADO; los manda **`_roadmap_scheduled_messages_sweep`**,
  tarea `mensajes_personal` del cron único, cada minuto). El envío inmediato y el programado pasan
  por el MISMO **`_roadmap_message_dispatch`** (UN mensaje por persona). Un fallo queda como ERROR y
  **no se reintenta solo**: mandar dos veces el mismo SMS es peor que uno que no sale, y el pop-up
  enseña el motivo para volver a programarlo.
  · **EL «SÍ» DEL ARTISTA ES LA COMUNICACIÓN**: `_concert_notice_mark_from_confirmation` (desde
  `_artist_confirmation_apply` con OK) sella `artist_notified_*` con `kind='CONFIRMACION'` y la
  firma del momento, así la etiqueta pasa a verde y la tarea desaparece; **la etiqueta verde SE
  PINCHA** para volver a notificarle. Arreglo puntual `_artist_confirmed_notified_backfill_once`
  (marca `artist_confirmed_notified_v1`) para lo ya contestado.
  · **UN AVISO PINCHADO SE DESACTIVA** (`notificaciones.js`): «Ir a resolverlo» navega justo después
  de marcarlo leído y el navegador cancelaba la petición: el `fetch` va con **`keepalive: true`**.
  · **QUIÉN VA CON EL ARTISTA**: solo el círculo de la foto (`.escort-av`), sin la viñeta
  `ficha-hero__media` detrás.
  · **Prueba de regresión: `/tmp/python/bin/python3 tools/check_hoja_ruta.py`** (53
  comprobaciones con la app real). Y `tools/dev_server.py` gana `/entrar-externo/<promoter_id>` para
  ver el portal como cualquiera, y arranca en el puerto que le den (`PORT`; `autoPort` en
  `.claude/launch.json`): ⚠️ **lo que se defina DEBAJO de `app.run` no llega a registrarse**.

- **HOJA DE RUTA · MANDARLE UN MENSAJE AL PERSONAL** (sep 2026). «Mañana el bus sale a las 8:30» hay
  que decírselo a los que van, y se hacía por fuera de la app (un grupo de WhatsApp, un correo a
  mano), con el riesgo de dejarse a alguien. Botón **«Mandar un mensaje»** en la barra de la pestaña
  **Personal**: se manda a TODOS o a los que se elijan, y **se eligen POR FUNCIÓN** (solo los
  técnicos, solo los músicos…), que es como se piensa de verdad.
  · **Es el patrón de los envíos a compradores**: a la izquierda a quién (chips de función con su
  contador + la gente con su foto y su contacto) y a la derecha lo que se manda **con su VISTA
  PREVIA**. Dos canales: **SMS** y **CORREO** (asunto, texto, botón y enlace).
  ⚠️ **El contador de caracteres y trozos lo compone el SERVIDOR** (`_campaign_sms_preview`, el
  mismo de compradores): el GSM-7, los acentos y los trozos son suyos, y calcularlo en el navegador
  sería una segunda verdad. Su clave es **`segments`**, no `parts`.
  ⚠️ **EL CORREO lleva la cabecera de LO QUE ES** (`_notice_email_activity` / `_promotion` /
  `_project` + `_notice_email_html`, el esqueleto de la casa): quien lo recibe sabe de qué le hablan
  sin que haya que explicarlo en el texto.
  ⚠️ **UN mensaje por persona**, nunca todos en el «Para». Quien no tiene teléfono (o correo) sale
  **deshabilitado** y se dice cuántos son; si no sale para nadie, se DICE.
  ⚠️ Sin pasarela de SMS configurada el pop-up **arranca en Correo** y lo explica: ofrecer «SMS» sin
  poder mandarlo es un botón que no funciona.
  · Motor `_roadmap_message_*` (del MISMO `_roadmap_person_rows` que la pestaña, así que la lista y
  a quien se le manda no se pueden desparejar), pop-up `_roadmap_message_modal.html` + JS
  `roadmap_message.js` (global y por DELEGACIÓN: el panel de la hoja de ruta se repinta entero).
  ⚠️ Sus tres endpoints van en **`SUPPORT_ACTION_ENDPOINTS`**: lo hace quien monta la producción,
  que no tiene por qué poder editar la sección de la actividad.
  ⚠️ En una **PLANTILLA** no se ofrece (no hay a quién avisar) y el endpoint lo vuelve a comprobar.
  · Y de paso, `_roadmap_person_rows` **resuelve el NOMBRE de la ficha** cuando en la hoja de ruta
  se quedó vacío: esa persona salía como «Sin nombre» en el listado, en el PDF y aquí.

- ⚠️⚠️ **HORARIOS · TODOS LOS PUNTOS SE AÑADEN IGUAL: el asistente por pasos** (sep 2026, lo pidió
  Dani). El editor de un punto de los horarios era un formulario largo de un tirón; ahora es el
  **asistente de la casa** (`step_wizard.js`: cabecera roja con un icono por paso, pastillas,
  pregunta grande y pie Atrás · Siguiente · Guardar) y **el MISMO ORDEN DE BLOQUES para todos los
  tipos** —una entrevista, una prueba de sonido o un vuelo se piden igual—:
  **1 · Qué es** (el MEDIO de una entrevista · la compañía y el nº de un traslado · el título) ·
  **2 · Cuándo** (el día como tarjeta de calendario, las horas, «por confirmar» y si está cerrado) ·
  **3 · Dónde** (cómo se hace la entrevista; en lo demás el sitio y cómo se entra) ·
  **4 · Cómo va a ser** (en directo, si se canta con su formato y su repertorio, la nota, los
  pasajeros de un traslado y los adjuntos) · **5 · Contacto** · **6 · Quién lo ve** (a quién afecta
  y en qué hoja de ruta sale).
  · **UNA ENTREVISTA** (lo que se pidió al detalle): **el TIPO SALE DEL MEDIO** (radio, tele,
  prensa…) y ya no se pregunta aparte — se busca el medio con su logo y el que no esté se crea con
  el **«+»** diciendo qué es. Debajo, el **programa**. Después **CÓMO SE HACE**
  (`ROADMAP_INTERVIEW_MODALITIES`, las mismas claves que `PROMO_MODALITIES`): **Presencial** → las
  **direcciones guardadas del medio** (`MediaLocation`) como tarjetas, o una nueva con la barra de
  direcciones de la casa, y entonces **se pregunta si se guarda en el medio** (así la próxima vez
  ya sale) o es solo para esa entrevista · **Zoom** → el enlace, que puede estar **TBC**, y con él
  puesto **se entra desde la propia hoja de ruta** (el icono `.rm-zoomlink` en la fila y el botón
  «Entrar en la videollamada» en el detalle) · **Phoner** → **a quién llaman** (la etiqueta rápida
  del **ARTISTA**, alguien de la casa o un tercero, con su «+»), que se pinta con el **icono de
  llamada, la flecha y su cara** (`callLine`) y su teléfono clicable.
  · **EL CONTACTO de una entrevista son LAS PERSONAS DEL MEDIO, con su cara**
  (`_media_contact_rows`, punto único): sus contactos **y los terceros VINCULADOS con él**, sin
  repetirse. La que no esté se crea ahí mismo y —⚠️ regla de la casa— **se le crea su ficha de
  TERCERO y queda vinculada al medio** (`_media_contact_promoter`, el mismo punto único que la
  ficha del medio), nunca una persona suelta.
  · **EL ARTISTA puede ser el destinatario de un punto**: en «a quién afecta» sale como una tarjeta
  más y se guarda como **`artist:<id>`** (`_roadmap_artist_audience_key`), que **no es un id del
  personal**. En el portal le afecta a él y a sus integrantes (`_roadmap_ext_person_info` recibe sus
  artistas con `_roadmap_ext_artist_ids`).
  ⚠️⚠️ **EL MOTOR ES EL DE LA CASA, ARRANCADO A MANO**: este asistente se crea por JavaScript, así
  que no pasa por el `initAll` de `step_wizard.js` → **`window.app33StepWizard.init(root)`**. Y el
  `.modal-content` **se REHACE entero en cada apertura**: el motor guarda referencias a sus pasos y
  a sus botones, y reutilizar el nodo dejaría listeners viejos sobre elementos que ya no existen.
  ⚠️ **CADA ASISTENTE CARGA SU MOTOR**: `_roadmap_panel.html` trae ya su `<script>` de
  `step_wizard.js` (el panel se pinta también en páginas standalone —el enlace compartido y el
  portal—, donde no está el layout).
  ⚠️ **Un campo que no existe en ese tipo revienta el cableado**: en un TRASLADO no hay «¿se
  canta?» ni repertorio, así que `attachSearch` sobre ese buscador (que no está) se llevaría por
  delante todo lo demás — va con su `if`.
  ⚠️ **Lo que no es de esa modalidad se LIMPIA al guardar**: el sitio y el acceso solo en
  PRESENCIAL, el enlace solo en ZOOM y a quién llaman solo en PHONER; si no, la hoja de ruta
  enseñaría una dirección que no es.
  ⚠️ **`ivMeta` es el punto único de «qué es esta entrevista»**: lee igual la creada aquí
  (`interview`) y la **espejada de una PROMOCIÓN** (`promo_meta`), así que las dos se pintan con el
  mismo código en la fila y en el detalle.
  ⚠️ **La FICHA DE UN MEDIO se lee en UNA llamada** (`api_media_card`, `/api/media/<id>/ficha`: qué
  es, sus ubicaciones y sus personas con foto) y guardar una dirección es
  `api_media_location_create` (que **no duplica** la misma). Los dos van en las listas de APOYO: lo
  hace quien monta la producción, que no tiene por qué llevar la sección de Medios.
  ⚠️ El selector de «¿Qué quieres añadir?» lleva también la cabecera de la casa: `openModal` acepta
  un icono y entonces pinta `sw-head`.
  · **Prueba de regresión**: `/tmp/python/bin/python3 tools/check_hoja_ruta.py` (apartado 9). Al
  tocar el asistente, en verde.

- ⚠️⚠️ **HORARIOS · CADA TIPO PREGUNTA SOLO LO SUYO, y las PERSONAS DE CONTACTO son varias** (sep 2026,
  lo pidió Dani, lote 1 de la reforma de los formularios). El asistente era el mismo para todos los
  tipos y preguntaba cosas que no venían a cuento (dónde es una prueba de sonido, si se canta en una
  comida). Ahora **las reglas las dicta el SERVIDOR** (`ROADMAP_NO_SING_KINDS` · `ROADMAP_AT_VENUE_KINDS`
  · `ROADMAP_PLACE_KINDS` · `ROADMAP_NO_CONTACT_KINDS` · `ROADMAP_NO_END_KINDS` → `_roadmap_kind_rules()`
  → `CTX.kind_rules` → `RULES`/`ruleHas()` en `roadmap.js`): el asistente **no pregunta** lo que no
  toca y el servidor **no guarda** lo que no toca (`_roadmap_item_from_json`), así que no se pueden
  desparejar y un punto de antes que tuviera «canta» marcado deja de contar (`_roadmap_item_sings`
  también mira el tipo).
  · **«¿Está confirmado?»** (antes «¿Está cerrado?») en todos.
  · **La ACTUACIÓN** no pregunta dónde (es en el recinto), ni si se canta (**su repertorio ES el set
  list de la ficha**, no hace falta otro) ni con quién se habla (es del propio artista): Qué es ·
  Cuándo · Detalles · Quién lo ve. La **prueba de sonido** y la **apertura de puertas** tampoco
  preguntan dónde ni si se canta. Una **ENTREVISTA** ya no pide título: se llama «Medio · Programa»
  (lo compone `saveItem` SIEMPRE, no solo si estaba vacío).
  · **M&G, SESIÓN DE FOTOS y COMIDA llevan `place`** `{mode: VENUE|OTHER, space, venue_id, venue_name}`
  (`_roadmap_clean_place`): **en el recinto de la actividad por defecto** —y entonces `location` se
  vacía: el sitio es el suyo y el icono de mapa lleva al recinto (`itemMapsHref`)— con un **ESPACIO**
  concreto («Camerino 2», «Sala privada»); o en OTRO sitio: otro recinto de la base (buscador
  `/api/search/venues`, `searchVenues`) o lo que se escriba (en una comida, el restaurante). En la
  fila y el detalle lo pinta **`placeLabel(it)`** («Sala Ruta · Camerino 2»).
  · **El M&G nace con el nº de personas que dice la FICHA** (`contracting_payload.meet_greet.quantity`
  → `_roadmap_meet_greet_count` → `CTX.meet_greet_count`), editable (`mg_count`). **La COMIDA**
  pregunta si hay **reserva** (sí · no · no se sabe = `None`) y para cuántos comensales
  (`_roadmap_clean_meal` → `meal`; el menú cerrado llega en el lote 4). **Una CITACIÓN es a UNA
  hora**: sin «Termina», y el servidor vacía `end_time`.
  · ⚠️⚠️ **PERSONAS DE CONTACTO, en plural y SIN escribir teléfonos**: `item['contacts']` (lista,
  `_roadmap_item_contacts`, sin repetir por `promoter_id` o por nombre) y **la primera espejada en
  `contact`** para lo que todavía lo lea en singular (la hoja compartida antigua, el portal). Se
  ofrecen como TARJETAS que se marcan y desmarcan las **SUGERIDAS** —`_roadmap_contact_suggestions`,
  punto único: las personas de la ACTIVIDAD con su función, el PROMOTOR, sus personas de contacto
  (`PromoterContact`) y los terceros VINCULADOS con él, y los del RECINTO; en una entrevista, las del
  MEDIO (`pintaContactosMedio` → `m.rmContacts.suggest`)—; las ELEGIDAS salen con su teléfono y su
  correo, que son los de su ficha; y cualquier otra se busca en toda la base
  (`api_roadmap_person_search`) o **se CREA como TERCERO** (`roadmap_contact_person_create`,
  `/contacto/tercero`, en `SUPPORT_ACTION_ENDPOINTS`) que, si la actividad tiene promotor, **queda
  como persona de contacto suya** (`PromoterContact` con `link_promoter_id`) para salir sugerida la
  próxima vez; antes de crear otra ficha se busca por su correo (la regla de `_media_contact_promoter`).
  ⚠️ Al editar, si el cliente no manda `contacts` ni `contact` (JS viejo en caché) **se conservan**,
  igual que `place`, `mg_count` y `meal`.
  ⚠️⚠️ **Los contactos del RECINTO no salían NUNCA en su viñeta** (bug real): `_roadmap_venue_card`
  leía `l.get("other")` y la clave de `_entity_link_rows` es **`linked`**. Arreglado de paso.
  · **EL BUSCADOR DE CANCIONES (y todos los del asistente) tiene FONDO**: `.rm-wz-results` era
  transparente (los `.rm-result` no tienen fondo propio) y se leía lo de detrás (bug real que vio
  Dani). Y **se abre AL PINCHAR** con el repertorio entero (`attachSearch` con `minChars: 0` escucha
  también `focus`), `clearOnPick` vacía el campo al elegir y **un clic fuera lo cierra** (un único
  listener en `document`). ⚠️ Un campo que YA tiene el foco no vuelve a disparar `focus`: al probarlo
  a mano, pinchar fuera antes.
  · **Prueba de regresión**: `tools/check_hoja_ruta.py`, apartado 10 (las reglas, las sugerencias,
  el M&G con su espacio y dos personas, la comida con reserva, la citación sin fin, la persona nueva
  como tercero del promotor). Probado además en el navegador con la app real (los seis tipos, la hoja
  compartida sin sesión con `CSS1Compat` y un solo `<!doctype>`).
