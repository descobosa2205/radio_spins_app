# Discográfica · proyectos

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- DISCOGRÁFICA · PROYECTOS: donde se PREPARA el material discográfico —álbumes, EPs,
- LA BOLSA DE UN SINGLE QUE NO TIENE PROYECTO: un single preparado con un PROYECTO
- PROYECTO · LA FOTO DE LA PORTADA se aprueba y LUEGO se elige
- PROYECTO · LO DE DISEÑO, agrupado por proyecto
- UN LANZAMIENTO PUEDE TENER VARIOS PRODUCTORES, tanto en el proyecto
- PROYECTO · EL CONTRATO DEL PRODUCTOR: al configurar quién produce se le pide
- PROYECTO · el ORDEN de la fase «Single»: fecha → plazo de entrega → maqueta →
- PROYECTO · los pasos, rematados
- PROYECTO · LOGÍSTICA: un paso más del proyecto
- PROYECTO · EL PLAN: promoción, aprobación y aviso al artista
- PROYECTO · LA COLABORACIÓN: tres pasos seguidos.
- PROYECTO · LA AUTORÍA: el reparto y el permiso de edición
- PROYECTO · APROBACIÓN DE LOS MATERIALES: diseño sube las creatividades, las revisa
- PROYECTO · LA FOTO DE LA PORTADA, cuando hay dudas la elige el ARTISTA: antes de
- PROYECTO · LA PORTADA se aprueba en CADENA y con el visto bueno de la casa
- PROYECTO · APROBACIONES EN CADENA (motor único, ago 2026). Cuatro cosas del sello se aprueban
- PROYECTO · LA MEZCLA FINAL, antes de masterizar
- PROYECTO · AVISARLE LA FECHA AL ARTISTA: cuando
- PROYECTO · EL CALENDARIO DE ENTREGAS: antes de pedirle nada a nadie se fijan los
- PROYECTO · EL ORDEN DE LAS TAREAS ES EL DEL PROCESO, no el de cuándo se
- PROYECTO · LA NOTA DE PRENSA. Todo lanzamiento la lleva, pero no se puede pedir
- PROYECTO · EL PITCH, en dos pasos
- PROYECTO · FOCUS SINGLE y PRESENTACIÓN A RADIO. Un lanzamiento puede ser focus
- PROYECTO · OTRAS CREATIVIDADES e IDs de plataforma
- PROYECTOS · las siete trampas que sacó la revisión
- ORDENAR MI INICIO: cada persona se coloca los módulos de la portada como quiera.
- ENTREGA DE MASTERS · el 502 al enviar el formulario (bug real, ago 2026). Los masters son
- ENTREGA DE MASTERS · EL FORMULARIO SALE YA CUMPLIMENTADO. Lo que ya está en la
- ENTREGA DE MASTERS · qué se pide y qué es obligatorio, campo a campo
- Entrega de masters (enlace público): SongMasterDeliveryLink (token, sections_json, status
- ENTREGA DE MASTERS · lo entregado es TAREA de REGISTROS y del SELLO. Cuando un
- CERTIFICACIONES EN UN DOCUMENTO: a la derecha, a la altura de la portada, con
- PITCH DE LANZAMIENTO: el texto con el que se presenta un single o un disco.
- Simulaciones — ajustes ago 2026: números sueltos con punto de miles (|k en plantilla + toLocale
- REMESAS · fecha de pago por pago, PDF y aprobación de dirección
- PITCH · el TITULAR CENTRADO, los GÉNEROS en la cabecera y el TEXTO CON FORMATO
- UNA PORTADA SE PINCHA Y SE VE EN GRANDE: la portada de la cabecera de la ficha de
- MAQUETAS SUELTAS: al acabar una, sigue la siguiente
- CHARTMETRIC · REPRODUCCIONES de Spotify, YouTube y TikTok, y cada cuánto se actualizan
- SET LIST · tipos de línea, ICONOS, el parón RAYADO, las portadas y la cabecera del PDF
- ENTREGA DE MASTERS · NO SE PIDE LO QUE YA TENEMOS, Y LA DURACIÓN LA DA EL MASTER
- TIKTOK · el minuto de inicio y CUÁNDO se lanza
- EL PITCH SE ESCRIBE JUSTIFICADO: el editor con formato (_rich_text_field.html)
- QUÉ ES UN LANZAMIENTO: focus single o de CONTINUIDAD, y se marca DONDE SE CREA.

---

- **DISCOGRÁFICA · PROYECTOS** (ago 2026): donde se PREPARA el material discográfico —álbumes, EPs,
  singles y videoclips—, en su propia pestaña (`/discografica?section=proyectos`). **`DiscoProject`** + **`DiscoProjectTrack`** +
  **`DiscoProjectDateRequest`** (`ensure_disco_projects_schema`). ⚠️ **No existe ningún
  `DiscoProjectMaterial`**: los materiales se suben en la ficha del lanzamiento (`SongMaterial`). ⚠️ Un proyecto NO es el lanzamiento (eso son `Album`/`Song`
  cuando ya existen): es el trabajo previo.
  · **La pantalla**: los ARTISTAS con proyectos activos y su número; al pinchar uno, los suyos
  (`?proj_artist=<id>`, y los archivados con `?proj_archivados=1`).
  · **Cada proyecto tiene CINCO pestañas, en este orden** (`DISCO_PROJECT_TABS`): **Calendario**
  (las FECHAS a la izquierda, el CALENDARIO a la derecha y las TAREAS PENDIENTES debajo) ·
  **Información** · **Materiales** · **Bolsa** · **Hoja de ruta**.
  · ⚠️⚠️ **EL PROYECTO CREA EL LANZAMIENTO EN REPERTORIO, en PROVISIONAL** (ago 2026): al crear el
  proyecto se da de alta lo que corresponda —un `Album` con sus `AlbumTrack` (los temas nuevos crean
  su `Song`; los que venían del repertorio se enganchan tal cual), una `Song` en un single o en un
  videoclip suelto, y nada en un videoclip de algo que ya existe— con **`is_provisional=True`**
  (`_disco_project_create_release`). **Los MATERIALES se suben DONDE SIEMPRE**, en la ficha de la
  canción o del álbum: la pestaña «Materiales» del proyecto solo enseña el estado y lleva allí.
  · **Lo provisional se ve**: fondo rayado suave y etiqueta «Provisional» **en el mismo sitio y con
  el mismo aspecto en los tres**: el repertorio (`tr.is-provisional`), las dos fichas
  (`.ficha-hero.is-provisional`) y el **listado de «Lanzamientos»** (`.launch-row.is-provisional`,
  ago 2026), que comparten la MISMA regla del rayado — una sola declaración, así que no se pueden
  desparejar. En el calendario de esa pantalla, donde solo hay portadas, se dice al pasar el ratón.
  ⚠️ La fila del listado lleva la clase `border` de Bootstrap (con `!important`): el color del marco
  se cambia por su **variable** (`--bs-border-color`), no repitiendo la propiedad.
  · **Mientras es provisional, el lanzamiento SIGUE al proyecto** (`_disco_project_sync_release`:
  nombre, fecha y soportes). En cuanto se cierra, deja de tocarse: manda su ficha.
  · **CERRAR el proyecto** (`disco_project_close`, en la rueda) es lo que le da paso a **distribución
  y registro**: el lanzamiento deja de ser provisional (`_disco_project_set_provisional`, que **solo
  toca lo que creó el proyecto**: un tema que ya estaba publicado no era provisional y no se toca) y
  le llega a **REGISTROS** como tarea —aviso `REGISTROS` + módulo de Inicio `HOME_PROJECT_REGISTROS`
  (`_home_project_registros`)— para **cumplimentar los datos y subir los materiales**, con lo que
  falta dicho (portada, másters). Se cierra con «Datos y materiales completos»
  (`disco_project_registros_done`), y el aviso se cierra solo. Todo es reversible (reabrir / volver a
  pendiente).
  · **Y se cierra SOLA cuando ya está** (ago 2026): si el lanzamiento tiene portada y másters, nadie
  tiene que acordarse de pinchar nada — `_disco_project_registros_autoclose` la marca (queda apuntado
  «automático» en `registros_done_by_nick`) y resuelve el aviso, con `_disco_project_registros_missing`
  como punto único de qué falta. Se comprueba al **mirar la ficha** del proyecto y al **montar el
  módulo de Inicio**, que es la red de seguridad para lo que se subió por otro camino (la misma regla
  que `_notify_resolve`: una tarea es «esto te está esperando» y cuando deja de estarlo desaparece).
  ⚠️ El módulo de Inicio solo **confirma** el cierre si la sesión es SUYA (`propia`): con una sesión
  prestada manda quien la abrió.
  · **El calendario es el componente de la agenda de siempre** (`_agenda_calendar.html`, modo
  «artist»), con un payload propio (`_disco_project_agenda`). ⚠️ **Sin `artist_id`**: así
  `unlimited` sale false en `agenda_calendar.js` y las flechas se mueven dentro de lo cargado sin
  pedirle nada al servidor (el calendario de un proyecto son SUS fechas, no la agenda del artista).
  · **Las TAREAS PENDIENTES** (`_disco_project_tasks`) dicen lo que falta para poder lanzarlo (la
  fecha, los temas, el soporte físico, la portada, el máster, el vídeo, la hoja de ruta, la bolsa) y
  cada una **desaparece sola** en cuanto se hace.
  · **En un SINGLE CON VIDEOCLIP se leen PARTIDAS** (ago 2026): a la izquierda lo del **single**
  (portada, máster) y a la derecha lo del **videoclip**; debajo, **a todo el ancho**, lo del
  **LANZAMIENTO** (la fecha, la hoja de ruta, la bolsa, cerrarlo), que es de los dos y por eso no
  cuelga de ninguna mitad. Cada tarea nace con su `group` (`single` · `video` · `lanzamiento`, en el
  propio `tarea(...)`) y el reparto lo hace **`_disco_project_task_groups`**, que solo parte cuando el
  proyecto ES un single (`DISCO_SINGLE_KINDS`) **y** lleva vídeo — así se parte igual con el tipo
  «Single + Videoclip» y con un single al que le marcaron la casilla, que es la misma situación. En
  cualquier otro proyecto devuelve `split: False` y se ve la lista de siempre.
  ⚠️ `task_groups` hay que añadirlo a las claves que se QUITAN del contexto de la bolsa (`bag_ctx`):
  si no, `render_template` revienta con «got multiple values».
  · **La HOJA DE RUTA es la misma de las actividades**: basta con que «project» esté en
  `ROADMAP_ENTITY_TYPES` y con las ramas del proyecto en `_roadmap_entity` / `_roadmap_base_days`
  (su lanzamiento y los temas con fecha propia) / `_roadmap_artist_ids` / `_roadmap_title`. Lo que se
  ponga ahí sale también en el calendario del proyecto.
  · **La BOLSA** es un `WorkflowBag` con `bag_type='PROYECTO'` y `linked_type='PROJECT'`
  (`_ensure_project_bag`, mismo patrón que una promoción) y se embebe con el MISMO panel que
  `/bolsas/<id>`. ⚠️ Al mezclar su contexto hay que quitar las claves que chocan con las de la ficha
  (`bag`, `tab`, `row`…) o `render_template` revienta con «got multiple values».
  · **Funciona EXACTAMENTE igual que las demás bolsas** (mismo panel, mismos gastos, misma
  liquidación: lo que se mejore en las bolsas vale también para estas), pero sus **CATEGORÍAS son
  otras** (`DISCO_BAG_EXPENSE_CATEGORIES`, ago 2026) — producir un disco no se parece a producir un
  concierto: **Producción audio · Producción vídeo · Producción álbum físico · Logística ·
  Alojamiento · Marketing y promoción · Otros gastos**, y las de un concierto (recinto, rider,
  músicos…) **no se ofrecen**. Las tres de producción salen **solo si tocan**: audio si el proyecto
  lleva audio (cualquiera menos un videoclip suelto), vídeo si lleva videoclip
  (`_disco_project_has_videoclip`) y físico si el lanzamiento sale en soporte.
  · Punto único **`_bag_visible_expense_categories(session_db, bag, expenses)`**, que alimenta el
  contexto del panel: con eso siguen **tanto el listado por categorías como el selector «Módulo»** de
  cada gasto. ⚠️ Conserva además cualquier categoría que YA tenga gastos apuntados (si no, un gasto
  quedaría invisible), y sin proyecto vinculado no descarta nada.
  ⚠️ El **CATÁLOGO** (`BAG_EXPENSE_CATEGORY_LABELS`/`_ICONS`) es la **unión** de las dos listas: de él
  salen el nombre de la categoría de un gasto en el resto de la app (pagos, contabilidad…) y la
  validación al guardarlo. Si una clave nueva no está ahí, `_bag_expense_display_cat` la degrada a
  «Otros» **sin dar ningún error** y el gasto aparece donde no es.
  ⚠️ Y **`PROYECTO` tuvo que entrar en `BAG_TYPES`**: no estaba, así que el selector «Tipo» de la
  bolsa no lo tenía y **guardar la bolsa desde su pantalla lo cambiaba a «General»** (bug real), con
  lo que perdía sus categorías.
  · ⚠️⚠️ **UNA BOLSA DENTRO DE ALGO QUE YA TIENE CABECERA NO REPITE LA SUYA** (regla de la casa, ago
  2026, y vale para TODAS): la cabecera de la bolsa —y sus **datos** (título, tipo, estado, fechas) y
  sus **notas**, que son también su cabecera— se pintan **solo en su propia página**
  (`bag_standalone`, que lo pone `bag_detail.html`). Embebida en un proyecto discográfico, en una
  actividad o en una promoción se entra **directamente por el resumen económico** (y los ingresos, si
  los hay) **y los gastos**; para tocar sus datos está «Abrir la bolsa».
  ⚠️ El **resumen económico** vive FUERA de ese bloque (antes estaba dentro y desaparecía con él); en
  una actividad no se pinta porque su pestaña de Producción ya trae esos totales arriba
  (`bag-embed-head`) y su propio módulo de Ingresos. `bag_hide_hero` se conserva por compatibilidad,
  pero lo que manda es `bag_standalone`.

- **LA BOLSA DE UN SINGLE QUE NO TIENE PROYECTO** (ago 2026): un single preparado con un PROYECTO
  discográfico ya tiene su bolsa; los que no han pasado por ahí (los de antes, o los que se sacan sin
  montar un proyecto) abren la suya desde la **pestaña «Gastos» de la ficha de la canción** —que era
  el hueco que ponía «Próximamente»— y también desde la barra de botones de la ficha.
  · Punto único **`_song_bag(session_db, song, create=)`**: `bag_type='SINGLE'`, `linked_type='SONG'`,
  `linked_id` = la canción, artista y empresa **PIES**, `bag_scope='AUDIO'`.
  ⚠️⚠️ **Si la canción la prepara un PROYECTO, la bolsa es LA DEL PROYECTO** (`_song_project`, el
  punto único de «qué proyecto lleva esta canción»): si no, habría dos bolsas para el mismo
  lanzamiento y el gasto acabaría repartido entre las dos sin que cuadre ninguna. La pestaña lo dice
  («Bolsa del proyecto · X»).
  · **Se ve EMBEBIDA** con el MISMO panel que `/bolsas/<id>` (como la de un proyecto), sin repetir su
  cabecera (`bag_standalone`). ⚠️ Al mezclar su contexto hay que **quitar las claves que ya pasa la
  ficha** (`song`, `tab`, `row`, `artists`, `companies`…) o `render_template` revienta con «got
  multiple values».
  · **CATEGORÍAS**: las mismas que un proyecto (`DISCO_BAG_EXPENSE_CATEGORIES`), que es lo que hace
  `_bag_visible_expense_categories` con `bag_type='SINGLE'` + `linked_type='SONG'`. De un single
  suelto se descarta **«Producción álbum físico»** (no sale en soporte) y **«Producción vídeo»** solo
  si la canción está marcada «Sin videoclip»: lo que no se sabe se ofrece, que esconder una categoría
  es peor que ofrecerla de más.
  · **Desde /bolsas** también: al crear una bolsa se puede elegir un **single** (`linked_song_id`) y
  entonces nace ya con su vínculo, su tipo y su artista. El selector solo ofrece los singles que
  **todavía no tienen bolsa** (`_bag_song_options`, que mira en BLOQUE las bolsas propias y las de sus
  proyectos), y si aun así se repite, se avisa y se lleva a la que ya había.

- **PROYECTO · LA FOTO DE LA PORTADA se aprueba y LUEGO se elige** (ago 2026). El artista recibe
  varias opciones y va en **DOS PASOS**: primero marca **todas las que le valen** («Me valen estas»)
  y, **de esas**, elige **LA DEFINITIVA** («Esta es la portada») — que es la que se comunica para
  hacer la portada. Lo guardan `_disco_photo_like` (`payload['liked']`) y `_disco_photo_pick`
  (`payload['picked']`), y el paso lo decide el propio endpoint (`step`).
  ⚠️ En el segundo paso **solo se ofrecen las aprobadas**, y el servidor lo vuelve a comprobar: no se
  puede elegir una que no se haya aprobado.
  · Al elegir, **aviso a quien lleva el proyecto** (`_disco_photo_notify_picked`, kind
  `DISCO_PHOTO_PICKED`): «ya ha elegido la foto». En las tareas queda **HECHA** y se puede **pinchar
  para verla** en el visor de fotos de la casa — pop-up global `#artPhotoModal` (`layout.html`), que
  abre cualquier elemento con **`data-art-photo="<url>"`**, con abrir y descargar.
  ⚠️ **«Solicitar la portada» está BLOQUEADA mientras el artista esté eligiendo**: es lo que hay que
  darle a quien la diseña.
  · Las fotos de ese pop-up se pueden **arrastrar** (`data-file-drop-for`), y **añadir a alguien que
  apruebe** se hace **buscándolo** (con su foto), como el productor — su correo y su teléfono viajan
  en ocultos que rellena el buscador. ⚠️ El selector se incluye en VARIOS pop-ups de la misma
  página, así que sus ids llevan el sufijo del suyo (`appr_id`): con ids repetidos
  `getElementById` cogería siempre el primero.

- **PROYECTO · LO DE DISEÑO, agrupado por proyecto** (ago 2026): módulo de Inicio
  **`HOME_DESIGN_TASKS`** (`_home_design_tasks`) para el departamento de Diseño: **una fila por
  lanzamiento** y, dentro, **una subtarea por cosa** (la portada y cada creatividad pedida), cada una
  con **los días que faltan** para entregarla (`_disco_days_left_label`, punto único; en rojo si se
  pasó el plazo). Así todo lo de diseño de un proyecto se ve junto y no repartido.

- ⚠️⚠️ **UN LANZAMIENTO PUEDE TENER VARIOS PRODUCTORES** (sep 2026), tanto en el **proyecto**
  (audio) como en el **videoclip**. Se ponen con **una fila por productor** (el buscador de terceros
  de siempre y su «+»); el pop-up las monta `disco_steps.js` (`[data-dp-producers]`, que sustituye el
  marcador `dpProducerNEW` por un id único y vuelve a enganchar el buscador).
  · **DÓNDE VIVEN**: `production_payload['producer_ids']` (audio) y
  `video['producer']['promoter_ids']` (vídeo). ⚠️ `DiscoProject.producer_promoter_id` sigue guardando
  el **PRIMERO**: es la columna con la que ya trabajaba media app (los materiales, los correos, la
  entrega, el cuadro de dirección), así que nada de eso hubo que tocarlo. Puntos únicos
  `_disco_producer_ids` / `_disco_producers` y `_disco_video_producer_ids` / `_disco_video_producers`.
  · **A TODOS**: el aviso del **plazo de entrega de materiales** (`_disco_materials_recipients`) y el
  **«adelante con el máster»** (`_disco_mix_notify_master`) se mandan a todos los productores, un
  correo por persona.
  ⚠️⚠️ **EL CONTRATO PUEDE SER PARA UNO O PARA VARIOS, Y LA TAREA NO ESTÁ HECHA HASTA QUE TODOS LO
  TIENEN.** Al subirlo, si hay más de un productor **se pregunta a cuáles incluye** (`producer_ids[]`,
  con su foto o su logo y una casilla por cada uno; los que ya lo tienen salen marcados como hechos y
  desmarcados, para no pisar el suyo sin querer). Con **uno solo no se pregunta nada** y, sin marcar
  nada, el contrato va **a los que faltan**.
  · Motor ÚNICO **`_disco_contract_state(productores, contratos, pedido)`** —lo usan el productor del
  proyecto (`_disco_producer_contract_state`) y el del videoclip (`_disco_video_contract_state`), así
  que los dos se comportan igual—: devuelve cada productor con su estado, `pending`/`pending_names`,
  `done_count`/`count` y un **`done` que solo es cierto si no falta ninguno**.
  · Los contratos se guardan en **`production_payload['producer_contracts']`** (y `video['contracts']`),
  una fila por contrato con **`producer_ids`**. ⚠️ El formato **ANTIGUO** (un contrato suelto en
  `producer_contract` / `video['contract']`) se sigue LEYENDO como el contrato del productor de la
  columna: era de cuando solo podía haber uno.
  · **`_disco_producer_contract_ask` se vuelve a pedir** cuando aparece un productor NUEVO al que no
  se le había pedido (`asked_for` guarda a quiénes se pidió). Al **QUITAR** a un productor se tira
  **su** contrato y **los de los demás no se tocan** (antes, cambiar de productor borraba el contrato
  entero, que con varios se llevaría por delante los buenos).
  ⚠️ El **aviso** (`DISCO_PRODUCER_CONTRACT` / `DISCO_VIDEO_CONTRACT`) **solo se cierra cuando no
  falta ninguno**: subir el de uno no termina la tarea. En Inicio, `_home_producer_contracts` enseña
  **las caras de los que faltan** (`.ctask__face`) y quién ya lo tiene.
  ⚠️ Al escribir en el payload **dos veces en la misma petición** hay que `flag_modified`: el patrón
  de leer-copiar-reasignar no escribe la segunda vez (la trampa de siempre del JSONB).
  ⚠️ En un **VIDEOCLIP SUELTO** no se incluye `_disco_project_steps.html` (no hay pasos de audio), que
  es quien carga `disco_steps.js`: `_disco_video_modals.html` lo carga él cuando `has_audio` es falso.

- **PROYECTO · EL CONTRATO DEL PRODUCTOR** (ago 2026): al configurar **quién produce** se le pide
  automáticamente a quien es **REGISTROS y SELLO a la vez** (`_registros_sello_user_ids`; si no hay
  nadie con las dos cosas se cae a Registros) que prepare y mande su contrato
  (`_disco_producer_contract_ask`, aviso kind `REGISTROS` con la foto del artista).
  · A ellos les sale en Inicio (**`HOME_PRODUCER_CONTRACTS`** ← `_home_producer_contracts`) con **los
  datos para redactarlo**: el lanzamiento, el productor y lo pactado (fee/presupuesto y %).
  · Al **SELLO que lleva el proyecto** le sale la misma tarea como **«Solicitado · pendiente de
  \<nick\>»**, con la **cara** de esa persona (`people` de la tarea).
  · Se **sube el contrato** (`disco_project_producer_contract`) y con eso queda **hecha para todos**:
  el aviso se cierra solo y a quien lleva el proyecto le llega que ya está. Es reversible.
  ⚠️ El endpoint va en **`REQUEST_ANY_ENDPOINTS`**: lo hace Registros, que no tiene por qué poder
  editar discográfica ni ser «actor»; comprueba dentro que es de quien le toca.
  ⚠️ **Cambiar de productor deja el contrato otra vez pendiente**: es otro contrato.

- **PROYECTO · el ORDEN de la fase «Single»** (ago 2026): fecha → plazo de entrega → **maqueta** →
  **producción** → **logística** → mezcla final… La producción va **debajo de la demo** (primero se
  sube la maqueta y con ella se cierra quién produce, quién mezcla y quién masteriza), y la logística
  detrás de ella porque **sale de la grabación de voces**. La fase se llama **«Single»**.

- **PROYECTO · los pasos, rematados** (ago 2026):
  · Los botones de las tareas van **SIN RELLENAR** (`btn-outline-danger`), como en el resto de la
  app: con 25 tareas, una columna de botones macizos no deja ver por dónde va el trabajo.
  · **EL BUSCADOR DE TERCEROS no es un desplegable**: se ESCRIBE y salen las coincidencias **con su
  logo o su foto** (macro `tercero` de `_disco_project_steps.html` → `initTypeahead` sobre
  `/api/search/promoters`, que devuelve `logo_url`). El «+» de crear uno nuevo se conserva: va sobre
  un **`<select>` oculto** (`quick_create.js` solo sabe dejar lo creado en un select) y
  `disco_steps.js` lo copia al buscador y al oculto de verdad.
  ⚠️⚠️ **Bug de `typeahead.js` que salió aquí y afecta a TODOS los buscadores con imagen**: al
  elegir de la lista, el `change`/`blur` posterior llamaba a `resolveSelection`, que busca el texto
  en el **datalist** —que con imagen se vacía a propósito— no lo encontraba y **BORRABA el oculto**:
  el nombre quedaba escrito y el id vacío, así que no se guardaba nada. Ahora lo elegido se recuerda
  (`elegido`/`elegidoLabel`) y manda mientras no se toque el texto.
  · **«Incluido en el presupuesto de producción» se RETIRÓ** de mezcla, máster y voces: decía lo
  mismo que «incluido en el fee». Se sigue **leyendo** (`DISCO_COST_LABELS`, que incluye las
  retiradas) para no perder la etiqueta de lo ya guardado, pero no se ofrece.
  · **El MÁSTER lo puede hacer EL MEZCLADOR** (`DISCO_MASTER_WHO_MODES`, que es el de siempre + esa
  opción) y entonces su coste puede ir **«incluido en el fee del mezclador»**
  (`DISCO_MASTER_COST_EXTRA`), tarjeta que **solo se ofrece con esa elección** (`when` de la macro
  `elige` → `data-dp-when`, que además DESHABILITA su radio mientras está oculta). La MEZCLA no
  admite «El mezclador» (no se mezcla a sí misma) y el servidor lo comprueba.
  · ⚠️ **UN BLOQUE DE TAREAS TERMINADO NO DESAPARECE**: se pliegan sus SUBTAREAS y se despliegan
  pinchando el chevron de la principal. Lo decide **`_disco_tasks_fold`** (`block` · `is_head` ·
  `has_subs` · `folded`), que se aplica al final de `_disco_project_tasks`; se pliega solo cuando la
  cabeza **y todas sus subtareas** están hechas. Cada lista pasa su `lista_id` al macro para que dos
  listas (single / videoclip) no compartan el mismo `collapse`.

- **PROYECTO · LOGÍSTICA** (ago 2026): un paso más del proyecto. Se dice **si hace falta o no** y,
  si hace falta, **se le SOLICITA a una persona de producción** — y a partir de ahí **es tarea suya**.
  · **Qué se le pide**: cuatro notas (`DISCO_LOGISTICS_NOTES`) — **qué se pide · transportes ·
  alojamiento · personal** — y a quién (las personas de `_production_people`). Pop-up
  `#dpLogisticsModal`, endpoint `disco_project_logistics_save`, estado en
  **`_disco_logistics_state`** (`production_payload['logistics']`).
  · **Al solicitarla**: le llega el aviso (kind `PRODUCCION`, ref `DISCO_LOGISTICS`), **entra en el
  PERSONAL de la hoja de ruta** del proyecto (`_disco_logistics_roadmap_add`, rol «Producción ·
  logística», sin duplicar) y **se crea la BOLSA** si no existía — son los dos sitios donde trabaja:
  los horarios y los gastos.
  · **Le sale en SU Inicio** (`HOME_DISCO_LOGISTICS` ← `_home_disco_logistics`), con las cuatro notas
  a la vista y tres botones: la bolsa, la hoja de ruta y **«Ya está montada»**
  (`disco_project_logistics_done`), que cierra el aviso solo y deja la tarea en «Montada por X».
  Va en el bloque de **lo SUYO** de Inicio: se le pide por su nombre, así que no depende de ningún
  permiso de sección.
  ⚠️ `disco_project_logistics_done` va en **`REQUEST_ANY_ENDPOINTS`**, no en `SUPPORT_ACTION_ENDPOINTS`:
  ese exige ser «actor» (poder editar alguna sección) y quien lleva la logística puede no tener
  ninguna — se comía un **403 al resolver su propia tarea** (comprobado). El endpoint verifica dentro
  que la logística es SUYA (o que es del sello o de dirección).
  ⚠️ **Es UNA sola logística**, pero se puede PEDIR desde DOS sitios: su propio paso y el pop-up de
  la **grabación de voces** (ago 2026), donde al decir dónde se graba se pregunta si hace falta y, si
  sí, se pone lo que se necesita, la **dirección de la grabación** y a quién de producción se le pide
  («Guardar y pedir logística a producción»). Lo de voces **se vuelca en la logística del proyecto**
  (`_disco_logistics_from_vocals`), así que la tarea, el módulo de Inicio de esa persona, la hoja de
  ruta y la bolsa son los de siempre; el pop-up de voces LEE el estado de esa logística, no una copia.
  · Punto único de la solicitud: **`_disco_logistics_request`** (aviso + hoja de ruta + bolsa), que
  usan los dos caminos. El aviso dice **de qué proyecto y de qué ARTISTA** es, con su foto
  (`actor_name`/`actor_photo`).
  · ⚠️ **La logística se da por MONTADA en cuanto está en la HOJA DE RUTA**
  (`_disco_logistics_roadmap_ready`: un transporte apuntado o un hotel) — nadie tiene que acordarse
  de pinchar «ya está». Lo cierra `_disco_logistics_autoclose`, llamado al mirar la ficha y al montar
  el módulo de Inicio (la misma regla que `_notify_resolve` y que el autocierre de Registros).
  ⚠️ Cambiar de persona **vuelve a pedirla** (la fecha de solicitud y el «montada» se resetean): es
  otra persona la que tiene que hacerlo.
  ⚠️ `_roadmap_save` hace **commit**: se llama al final, cuando lo demás ya está en la sesión.
  ⚠️ Lo nuevo del contexto (`logistics`, `logistics_notes`) hay que quitarlo del de la **bolsa**
  (`bag_ctx`) o `render_template` revienta con «got multiple values».

- **PROYECTO · EL PLAN: promoción, aprobación y aviso al artista** (ago 2026):
  · **Solicitar el plan de PROMOCIÓN** (`disco_plan_promo_request`): se le pide a promoción con
  **indicaciones y objetivos**; les sale como tarea en su Inicio (el módulo **«Tareas del sello»**,
  que es el de las notas de prensa: mismo público, un solo módulo) y **lo que suben queda dentro de
  este plan** (`disco_plan_promo_upload`, en `REQUEST_ANY_ENDPOINTS` porque lo sube promoción).
  · **El REPASO** (`disco_plan_review`): se le pide a quien es **dirección y sello a la vez** y les
  sale como **tarea pendiente** (el plan **y sus gastos**); pueden **devolverlo con una nota**, que
  quita los dos OK y se lo dice al sello. Con **los dos OK** el plan queda aprobado y al **jefe de
  producto** le llega que lo tiene **liberado**.
  ⚠️ **Un OK borra el rechazo anterior** y la tarea da prioridad a «aprobado» sobre «rechazado»: si no,
  el plan se quedaba marcado como devuelto para siempre aunque lo aprobaran (bug real de la prueba).
  · **Notificar el plan AL ARTISTA** (`disco_plan_notify_artist`): solo **aprobado** y **antes de que
  empiece**. El correo lleva el plan **por secciones** (estrategia, acciones con sus fechas,
  marketing, promoción y publicaciones) y el botón al **cronograma online** de siempre, que se ve
  al día — y también sale por **SMS** con ese enlace. ⚠️ **Sin nada de economía**: ni costes ni
  presupuestos (`_disco_plan_artist_email_body`).
  · **ALERTAS** (`_disco_plan_notice_sweep`, en el cron diario del proyecto): a
  **`DISCO_PLAN_NOTICE_WARN_DAYS`=3** días de que empiece el plan, aviso al **jefe de producto**
  («quedan 3 días … y todavía no se le ha compartido»); a **2 días**, se **escala a dirección+sello**
  por campanita **y por correo**.
  ⚠️ Cada aviso **una sola vez**, y **si ya se escaló no se vuelve a avisar del plazo**: sin eso el
  barrido soltaba el «quedan 3 días» todos los días siguientes (lo sacó la prueba).

- **PROYECTO · LA COLABORACIÓN** (ago 2026, solo si `DiscoProject.is_collab`): tres pasos seguidos.
  · **1 · Condiciones** (`disco_project_collab_conditions`): de quién es el máster y en qué %
  (`DISCO_COLLAB_OWNERS`), quién cubre los gastos y en qué medida (`DISCO_COLLAB_EXPENSES`) y quién
  distribuye — todo con tarjetas de iconos.
  · **2 · Grabación de voces del colaborador** (`disco_project_collab_vocals`): cuándo, dónde y si
  hace falta logística; a quien se elija de producción le llega **el mismo aviso** que la logística de
  casa y se le crea la bolsa. ⚠️ En el pop-up se ven **las DOS logísticas, una a cada lado**: la del
  colaborador (que se edita ahí) y la de **nuestro artista** (en gris, con su botón para gestionarla).
  · **3 · Acuerdo con su discográfica** (`disco_project_collab_deal`): con qué compañía (un tercero,
  con su logo y su alta al vuelo), la propiedad del máster, los gastos, quién distribuye, los
  **royalties de cada compañía** y **cuándo se pagan** (`DISCO_COLLAB_ROYALTY_WHEN`: desde el primer
  ingreso o **cuando se cubra la inversión**, con su tope), y con quién se cierra. **Sale ya
  cumplimentado con las condiciones** (no se escribe dos veces) y al **aprobarlo** se le manda a
  **Registros y Sello**, que preparan y envían el contrato.
  ⚠️ **Si el máster es mayoritariamente NUESTRO, distribuimos nosotros**: sale marcado solo y se puede
  cambiar a mano si el acuerdo dice otra cosa.
  ⚠️ El acuerdo sale **bloqueado** hasta que estén las condiciones: es lo que lo rellena.

- **PROYECTO · LA AUTORÍA: el reparto y el permiso de edición** (ago 2026):
  · **Confirmar el reparto autoral** (`disco_project_authorship_confirm`): los autores y sus % viven
  donde siempre (la pestaña **Editorial** de la canción, `SongEditorialShare`) y aquí **se
  confirman**; con eso **REGISTROS y SELLO** reciben el aviso para preparar el **acuerdo de reparto**.
  ⚠️ **No se confirma un reparto que no suma 100** (lo comprueba el servidor y el botón sale
  desactivado): es el reparto de la obra.
  · **Pedírselo al artista** (`disco_project_authorship_ask`): se le manda el **enlace de ENTREGA de
  siempre** con **solo su sección autoral** — no se inventa otro sitio para subir lo mismo — por su
  canal `EDITORIAL`.
  · **EL PERMISO DE EDICIÓN** (`DISCO_AUTHOR_PERMISSION_PCT` = 50): si un autor **no es de
  Plataforma** (`_publisher_is_platform`) y tiene **más del 50%** de una obra que **no se ha publicado
  nunca**, hace falta su permiso. Se le pide a **Registros y Sello**, que son quienes **mandan y
  gestionan** la «Autorización para la primera divulgación, reproducción y distribución de obra
  musical» (`disco_project_authorship_permission`), y ellos la marcan como gestionada.
  ⚠️ «No publicada» = su fecha de lanzamiento es futura **o** sigue provisional.
  ⚠️ **`_flag_arg`** es el punto único de un interruptor que llega **por el formulario o por la URL**:
  los menús de las tareas solo pueden hacer POST **a una URL** (sin campos), así que un `?undo=1`
  tiene que valer igual que un `<input name="undo">`.

- **PROYECTO · APROBACIÓN DE LOS MATERIALES** (ago 2026): diseño sube las creatividades, las revisa
  el **jefe de producto** y las manda al artista (y al colaborador después, en cadena) —
  `#dpMaterialsApprovalModal` → `disco_project_materials_approval`, aprobación de kind
  **`MATERIALS`** con las piezas en su `payload` (se puede mandar solo una parte marcándolas).
  ⚠️ **Hasta que están aprobadas no se pueden usar ni compartir**: al cerrarse
  (`_disco_materials_approved`) las piezas quedan en `APROBADA` y a **DISEÑO** le llega que ya se
  pueden usar. Un rechazo deja la tarea en rojo con **quién y por qué**, y hay que volver a pedirla.
  · Sin nada entregado la tarea sale **bloqueada** («antes tiene que entregarlos diseño») y el
  endpoint lo vuelve a comprobar.

- **PROYECTO · LA FOTO DE LA PORTADA, cuando hay dudas la elige el ARTISTA** (ago 2026): antes de
  pedirle la portada a diseño hay que tener la foto. Si está clara, el jefe de producto la sube o la
  coge de las guardadas del artista (eso ya existía); si **hay dudas**, se le mandan **varias
  opciones** (`#dpPhotoPickModal` → `disco_project_photo_approval`, aprobación de kind
  **`COVER_PHOTO`** con las opciones en su `payload`).
  ⚠️ **La etapa 1 ELIGE, el colaborador solo APRUEBA la elegida**: en la página de aprobación, quien
  es de nuestro artista ve **todas** las fotos con sus radios y quien va después ve **solo la
  elegida** (`_disco_photo_pick` guarda `payload['picked']`; `_disco_photo_picked_url` la resuelve).
  Así no se le pregunta dos veces lo mismo a nadie.
  · Cuando está aprobada (`_disco_photo_approved`): la foto pasa a la portada
  (`DiscoProjectArtwork.photo_url`) y a **DISEÑO** le llega que ya puede hacerla — le sale en sus
  tareas y el jefe de producto lo ve en el proyecto.

- **PROYECTO · LA PORTADA se aprueba en CADENA y con el visto bueno de la casa** (ago 2026):
  · **Antes de que salga de casa la ve el JEFE DE PRODUCTO** (`disco_project_artwork_pm` +
  `#dpArtworkPmModal`): si le da el visto bueno (`pm_ok_at`/`pm_ok_by`) ya se le puede pedir al
  artista; si la **devuelve a diseño** se le exige la nota, se **borra el JPG y el PSD** (hay que
  volver a subirla), la solicitud vuelve a REQUESTED y a **Diseño** le llega el aviso con lo que hay
  que cambiar. Sin su visto bueno, «Aprobación de portada» sale **bloqueada** y el endpoint la rebota.
  · **La cadena**: `DiscoProjectArtworkApprover.stage` (1 nuestro artista · 2 el colaborador ·
  3 añadidos) y `notified_at` — **al colaborador no se le escribe hasta que los nuestros han dado el
  OK** (`_disco_artwork_notify_stage`, que avisa a la etapa más baja con gente pendiente y se llama
  otra vez cuando esa etapa se cierra). La tarea dice **a quién le toca**.
  · **Al aprobarla todos**: se aplica al lanzamiento, y el aviso va a quien lleva el proyecto **y a
  DISEÑO** (que es quien la hizo), con **quiénes la han aprobado**; la tarea queda «Aprobada por … ·
  fecha».
  ⚠️⚠️ **QUIÉN APRUEBA es el MISMO punto único que el resto** (`_disco_artwork_candidates` ahora
  mapea `_disco_approval_candidates`): antes la portada tenía su propia lista y su bloque de
  colaboradores leía `fila.artist` / `fila.promoter` de un `SongInterpreter`… que **solo tiene el
  NOMBRE**, así que **el colaborador no entraba nunca** (bug real). Con el punto único, la portada gana
  además los aprobadores configurados en el artista y los añadidos en el proyecto.

- **PROYECTO · APROBACIONES EN CADENA** (motor único, ago 2026). Cuatro cosas del sello se aprueban
  igual (la **mezcla final**, los **materiales**, la **foto** y la **portada**), así que el motor es
  UNO: `DiscoApproval` + `DiscoApprovalVoter` (`ensure_disco_approvals_schema`) y
  `_disco_approval_open` · `_disco_approval_state` · `_disco_approval_notify` ·
  `_disco_approval_decide` · `_disco_approval_all_done`.
  · **Un enlace POR PERSONA** (`public_disco_approval`, `/aprobacion/<token>`): se ve lo que hay que
  aprobar —la mezcla **se escucha ahí mismo**—, hay **dos botones (verde aprobar · rojo rechazar,
  que pide el motivo)** y **los demás con su foto y su estado** (✓ verde · **? amarillo a la espera**
  · ✗ rojo).
  · ⚠️⚠️ **VA EN CADENA**: `stage` 1 = **nuestro artista** y sus integrantes · 2 = **el colaborador**
  · 3 = **terceros añadidos** a mano. Al colaborador **no se le escribe hasta que los nuestros han
  dado el OK** (`_disco_approval_decide` avisa a la etapa siguiente solo cuando la suya se cierra).
  · **QUIÉN APRUEBA, EN TRES NIVELES** (`_disco_approval_candidates` + `_disco_approval_pick`, y el
  selector único `templates/_disco_approvers_picker.html`, que se incluye en cada pop-up de
  aprobación):
    · **la casa** — los **integrantes** del artista (`ArtistPerson` → su tercero) y los
      **colaboradores** (los intérpretes de la canción que no son del artista): salen solos;
    · **el ARTISTA** — lo que tenga configurado en **Notificaciones → «Aprobación de mezclas y
      materiales»** (canal `APROBACIONES`): es la **preferencia guardada**, y sale sola en todos sus
      proyectos;
    · **el PROYECTO** — quien se añada **sobre la marcha** queda guardado en
      `production_payload['approvers']`, así que **ya sale en las siguientes aprobaciones de ese
      proyecto** (lo pidió así Dani), y con la casilla **«guardarlos como preferencia del artista»**
      (marcada por defecto) se guarda además en su canal para los proyectos que vengan.
  ⚠️ **En cada paso se puede QUITAR a quien no toque** (las casillas vienen marcadas): eso **no le
  quita de nada más** —sigue guardado en el artista y en el proyecto—, solo no entra en esa
  aprobación. Cada candidato lleva su clave estable (`_disco_approval_candidate_key`: su tercero o su
  nombre normalizado) y su **origen**, que se ve con un icono en el selector.
  ⚠️ Si NO llega ninguna clave marcada (un formulario viejo) entran **todos**: mejor pedir de más que
  dejar a alguien sin aprobar sin querer.
  ⚠️ `SongInterpreter` **solo guarda el NOMBRE** (no tiene `promoter_id`): su ficha se busca **por
  nombre** para sacarle el correo, sin crear nada.
  ⚠️ Un RECHAZO cierra la aprobación (`REJECTED`) con el motivo y avisa a quien lleva el proyecto:
  hay que rehacerlo y volver a pedirla (`_disco_approval_open` borra la anterior — lo que se aprueba
  es siempre la ÚLTIMA versión).
  ⚠️ El estado VACÍO trae las **mismas claves** que el lleno: si no, leer algo que aún no se ha pedido
  revienta con un KeyError (pasó con `ko`).

- **PROYECTO · LA MEZCLA FINAL, antes de masterizar** (ago 2026): **no se masteriza sin que las partes
  hayan aprobado la mezcla**.
  · **1 · Se le pide al PRODUCTOR** (`disco_project_mix_ask`) con su plazo, que sale del **calendario
  de entregas** y tiene que ser **4 semanas antes** del lanzamiento (`DISCO_MIX_MIN_WEEKS`).
  ⚠️ Si el plazo se sale de ahí —o **el paso no hace falta**— es una **EXCEPCIÓN** y la aprueba **quien
  sea DIRECCIÓN Y SELLO a la vez** (`_direccion_sello_user_ids`, punto único; si nadie tiene las dos
  cosas se cae a dirección): se le manda la petición **con el motivo** y, mientras, la tarea se queda
  **esperando** (`disco_project_mix_waiver` la aprueba o la rechaza).
  · **2 · El productor la sube por su enlace** (`public_disco_mix_upload`, `/mezcla-final/<token>`) y
  al **jefe de producto** le llega que ya se puede pedir la aprobación.
  · **3 · Aprobación en cadena** (`disco_project_mix_approval`) con el motor de arriba, y se pueden
  **añadir terceros** que también tengan que aprobar.
  · **4 · Cuando aprueban TODOS**, al productor le llega **solo**: «todas las partes han dado el OK a
  la mezcla final, podemos avanzar con el máster», con la **fecha máxima de entrega** y el **enlace de
  entrega de masters de siempre** (`_disco_project_delivery_links`, que ahora devuelve también
  `required_labels`, lo que ese enlace **exige**). La tarea pasa a **«Pendiente de recibir el máster
  final»** hasta que llega.
  ⚠️ Si el correo no sale, **no se dice que se avisó**: el flash da el enlace para mandarlo a mano.

- **PROYECTO · AVISARLE LA FECHA AL ARTISTA** (ago 2026, `disco_project_date_notify`): cuando
  **Registros la ha confirmado**, se le manda al artista la fecha **y todos los plazos** del calendario
  de entregas (los del **videoclip** también, si el lanzamiento lo lleva, porque el calendario ya los
  trae). Sale como subtarea de la fecha y queda apuntado quién avisó y cuándo.

- **PROYECTO · EL CALENDARIO DE ENTREGAS** (ago 2026): antes de pedirle nada a nadie se **fijan los
  plazos** —mezcla final, máster, portada, videoclip y creatividades— **arrastrando** cada cosa al día
  que le toca: a la **izquierda** lo que hay que fijar (con su mínimo y su tope) y a la **derecha** el
  calendario, con el día del lanzamiento marcado. Motor `static/js/disco_delivery.js` + `#dpDeliveryModal`
  + estilos `.dc-*`; endpoint `disco_project_delivery_save`; estado `_disco_delivery_state`.
  ⚠️ **Solo se puede soltar donde el plazo es POSIBLE**: los mínimos están en
  `DISCO_DELIVERY_MILESTONES` (la mezcla final **4 semanas** antes —hay que aprobarla y masterizar—,
  el máster y la portada **3** —lo que tarda la distribución— y las creatividades hasta **2 días**,
  el margen que ya usaba el encargo a diseño). Los días a los que no se llega se ven **apagados** y no
  aceptan el soltar, y lo ya puesto se vuelve a arrastrar para moverlo.
  ⚠️ El tope lo comprueba **también el servidor** (`_disco_delivery_apply`, que devuelve lo que no
  cuadraba y guarda el resto): el calendario del navegador es la comodidad, no la barrera.
  ⚠️⚠️ **NO es un dato paralelo**: cada hito **escribe el campo donde ese plazo ya vivía** —el máster
  es `DiscoProject.materials_due_date` (el plazo que fija Registros) y la portada el `due_date` de su
  solicitud—, así que fijarlo aquí se ve en su tarea, en su correo y en su recordatorio. Si se añade un
  hito nuevo, hay que decir a qué campo va (o queda solo en el payload).
  · Tampoco hay dos calendarios: en el de la ficha (el de la agenda) estos plazos ya salían como hitos
  del proyecto.

- ⚠️⚠️ **PROYECTO · EL ORDEN DE LAS TAREAS ES EL DEL PROCESO** (ago 2026), no el de cuándo se
  programó cada cosa, y van agrupadas en **CUATRO FASES** (`DISCO_TASK_PHASES`, cabecerita
  `.dp-phase` en la lista; con 25 tareas en un single, sin agrupar no se ve por dónde va el trabajo):
  · **LA OBRA**: 1 la fecha (la confirma Registros) · 2 el plazo de entrega · 3 la producción ·
    4 la **logística** (sale de la grabación, así que va justo después) · 5 la maqueta.
  · **LA IMAGEN**: 6 la portada (quién, la foto, pedirla, aprobarla) · 7 las creatividades.
  · **EL LANZAMIENTO**: 8 focus single y radio · 9 el **pitch** · 10 la **nota de prensa** (que
    necesita el pitch) · 11 el plan de lanzamiento · 12 los IDs de plataforma.
  · **PARA CERRAR**: lo que le falta al lanzamiento (fecha, temas, soporte, portada, videoclip, hoja
    de ruta, bolsa) y cerrar el proyecto.
  ⚠️ Una tarea NUEVA se mete **en su fase y en su sitio** (la fase la lleva el propio bloque con
  `fase[0] = "…"`): si se pone al final «porque es lo último que se ha programado», la lista deja de
  contar el proceso — que es justo lo que había pasado con la logística, el pitch, el focus y la nota
  de prensa, y por eso se reordenó.
  ⚠️ **LO QUE SE DECIDE EN UN SITIO SE VE EN LOS DEMÁS**: el **focus single** vive en la canción y se
  enseña en su ficha, en el repertorio, en la fila del proyecto y en la cabecera de su ficha; la
  **presentación a radio** se pide en el proyecto y se ve en la pestaña Información de la CANCIÓN
  (verde = entra, amarillo = pendiente, gris = no la cogen) y su acción entra en el **plan de
  lanzamiento**; la **logística** mete a quien la monta en la **hoja de ruta** y le crea la **bolsa**;
  el **pitch** se guarda en la ficha de la canción. Al añadir un paso nuevo hay que preguntarse
  **dónde más se mira eso** y enseñarlo allí.

- **PROYECTO · LA NOTA DE PRENSA** (ago 2026). Todo lanzamiento la lleva, pero **no se puede pedir
  sin tener antes lo que la nota cuenta**: el **pitch** escrito, la **fecha** de lanzamiento y
  **decidido si es focus single**. Hasta entonces la tarea **se ve pero no se puede activar** (sale
  rayada, con lo que falta) — y el **servidor lo vuelve a comprobar**.
  · **La pide el JEFE DE PRODUCTO** (`_disco_plan_product_manager`) con sus **indicaciones**
  (`#dpPressModal` → `disco_project_press_request`), y salen **DOS trabajos a la vez**
  (`DISCO_PRESS_PARTS`): **PROMOCIÓN la redacta** y **DISEÑO la maqueta**. Cada uno finaliza al subir
  lo suyo (`disco_project_press_upload`, `part=text|design`), y cuando **el texto está**, a promoción
  le queda **ENVIARLA**: sigue pendiente hasta que se marca (`disco_project_press_sent`, que se puede
  deshacer).
  ⚠️ **Tiene que estar lista el LUNES PREVIO al lanzamiento** (`_press_due_date`: el lunes
  inmediatamente anterior; un viernes 06/11 → lunes 02/11). Pasado el plazo sin el texto, la tarea y
  el módulo salen **en rojo**.
  · **Módulo de Inicio `HOME_PRESS_TASKS`** (`_home_press_tasks`): a cada uno **lo suyo** —promoción
  redactar y después enviar, diseño el gráfico—, con el plazo y las indicaciones a la vista. Dirección
  lo ve todo; quien no es de ninguno de los dos, nada.
  ⚠️ `disco_project_press_upload` y `_sent` van en **`REQUEST_ANY_ENDPOINTS`**: los usan promoción y
  diseño, que no tienen por qué poder editar discográfica (cada uno comprueba dentro que es de su
  departamento o dirección).
  ⚠️ Estado en `production_payload['press']` y punto único **`_disco_press_state`**: lo usan la tarea
  del proyecto, sus cuatro pop-ups y el módulo de Inicio.

- **PROYECTO · EL PITCH, en dos pasos** (ago 2026). El pitch es el texto con el que se presenta el
  lanzamiento, y hacerlo son **dos cosas**:
  · **1 · Pedirle al ARTISTA un texto o una inspiración** (`disco_project_pitch_ask` +
  `#dpPitchIdeaModal`): le llega **su propio enlace** (`public_disco_pitch_idea`,
  `/pitch-inspiracion/<token>`, plantilla `public_disco_pitch.html`) por su canal `DISCOGRAFICA`, y
  lo que cuenta ahí **no es el pitch**: es la materia prima. Al contestar, aviso a
  `_disco_project_owner_ids`.
  ⚠️ La subtarea se decide por **si ha CONTESTADO**, no por si se le pidió: cuando el artista no
  tiene contactos configurados el flash da el enlace **para mandarlo a mano**, así que `asked_at`
  queda vacío y el texto sí llega — con el orden al revés la tarea se quedaba pendiente para siempre
  (lo sacó la prueba).
  · **2 · Subir el pitch** (`#dpPitchModal` → `disco_project_pitch_save`): titular y texto, con la
  inspiración del artista al lado y el botón **«Ver ejemplos anteriores»** — los pitchs de ESE artista
  y, cambiando de chip, los de otros (`api_pitch_examples` → `_pitch_examples`, que además devuelve
  los artistas que tienen pitchs escritos). Se cargan **al pinchar**, no en cada carga de la ficha
  (JS en `disco_steps.js`, por delegación).
  · Al guardarlo queda **en la ficha de la canción** (`Song.pitch_title`/`pitch_text`), que es de
  donde salen el PDF, el correo y la página pública que ya existían — y el aviso de «falta el pitch»
  se cierra solo.
  ⚠️ **`_disco_project_email_shell`** es ya el punto único del esqueleto de TODOS los correos de un
  proyecto (logo de PIES a la derecha, título centrado, cabecera del lanzamiento, nota, texto y
  botón): lo usan la portada y el pitch. Si se toca el diseño, se tocan todos a la vez.
  ⚠️ `_disco_pitch_url` lleva `url_for` **protegido**: el estado del pitch se lee también desde un
  cron o un hilo, y ahí `url_for` revienta con «Working outside of application context» (el mismo bug
  que ya salió en `_peticion_edit_payload` y en `_royalty_holded_fields`).

- **PROYECTO · FOCUS SINGLE y PRESENTACIÓN A RADIO** (ago 2026). Un lanzamiento puede ser **focus
  single** (el prioritario) y entonces se presenta a las emisoras.
  · **Focus single** es de la **CANCIÓN** (`Song.focus_single` + `_at`/`_by`; **`NULL` = sin decidir**,
  que no es «no»: hay tareas que esperan a que se decida). Se decide en el paso del proyecto
  (`#dpFocusModal` → `disco_project_focus_save`) y se ve con su etiqueta **en la ficha de la canción y
  en el repertorio**. Solo sale en un **single** (`_disco_project_release_song`): en un álbum el focus
  sería uno de sus temas y eso se marca en su ficha.
  · **A qué emisoras** (`SongRadioPitch`, una fila por emisora, `ensure_song_radio_schema`): las
  emisoras son los **medios de tipo Radio** (`_disco_radio_media_options`). Se piden en
  `#dpRadioModal` (`disco_project_radio_request`) y una emisora ya pedida sale marcada y no se
  duplica (índice UNIQUE canción+emisora).
  ⚠️⚠️ **No se puede mandar a radio sin nada que mandar**: hace falta la **fecha de lanzamiento** y
  **el máster o al menos una maqueta** (`_disco_radio_ready`). Hasta entonces la tarea sale
  **BLOQUEADA (rayada)** diciendo qué falta, y el **servidor lo vuelve a comprobar** (esconder el
  botón no basta).
  · **Contesta PROMOCIÓN** —o **dirección que además esté en el Sello** (`_disco_radio_deciders`)—
  desde su módulo de Inicio **`HOME_RADIO_PITCHES`** (`_home_radio_pitches`): una fila por canción y
  **una línea por emisora** con sus dos botones. **«Sí entra»** pide la fecha de entrada en rotación
  y **anota la acción en el PLAN DE LANZAMIENTO** («Presentación a radio · \<emisora\>»,
  `_song_radio_plan_action`, que actualiza la acción en vez de duplicarla). **«No entra»** avisa a
  quien lo pidió de que la emisora la ha rechazado y **no anota nada en el plan**: la subtarea queda
  terminada.
  · En el proyecto hay **una subtarea por emisora** con lo que ha dicho cada una, y el aviso se cierra
  solo cuando **todas** han contestado.
  ⚠️ `song_radio_pitch_decide` va en **`REQUEST_ANY_ENDPOINTS`** (lo contesta promoción, que no tiene
  por qué poder editar discográfica ni ser «actor»); comprueba dentro que es de quien le toca.
  · **Las TAREAS BLOQUEADAS se ven RAYADAS** (`.dp-task.is-blocked`, el **mismo** rayado que un
  lanzamiento provisional: una sola declaración en `styles.css`, así no se pueden desparejar). En
  cuanto se puede empezar se le quita el fondo y, al terminarla, la fila **se queda** con su check
  verde: la lista de tareas del proyecto es un ESTADO, no una lista de avisos que desaparecen.

- **PROYECTO · OTRAS CREATIVIDADES e IDs de plataforma** (ago 2026):
  · **Creatividades** (`DiscoProjectCreative` + `DiscoProjectDesignRequest`): se marcan las que hacen
  falta del catálogo **`DISCO_CREATIVE_CATALOG`** (cabecera de YouTube, imagen de perfil, canvas, «ya
  disponible», anuncio con fecha, anuncio próximamente), cada una **con su icono y su tamaño**, y las
  que llevan formatos se eligen ahí (`DISCO_CREATIVE_FORMATS`: post, historia, publicación horizontal,
  banner). Las de **«Otra»** se añaden a mano (nombre, tamaño, imagen/vídeo/audio y nota, varias a la
  vez). El encargo va a **Diseño** con su enlace público para subirlas.
  ⚠️ **La fecha máxima NUNCA puede ser posterior a dos días antes del lanzamiento**
  (`DISCO_CREATIVE_DEADLINE_MARGIN_DAYS`): lo comprueba el **servidor**, no solo el `max` del campo.
  ⚠️ Al desmarcar una pieza **solo se borra si estaba PENDIENTE**: lo ya pedido no se tira.
  · **IDs de plataforma** (`SongPlatformId` + `SongPlatformIdRequest`): módulo nuevo en los
  **materiales de la canción**, con el logo de cada plataforma (`SONG_PLATFORM_ID_CATALOG`: Spotify,
  Apple Music, Amazon Music, YouTube y «todas») y el **hueco vertical (9:16) dibujado**, porque son los
  gráficos tipo historia. Se suben, se marcan **«no necesario»** (y se deshace) o se le **piden al
  artista** con su enlace público, que lo explica con el mismo dibujo.
  ⚠️ Los endpoints `song_platform_id*` se mapean a **`discografica.canciones`** (son de la canción).

- ⚠️⚠️ **PROYECTOS · las siete trampas que sacó la revisión** (ago 2026). Ninguna daba error: todas
  hacían que algo **no llegara** o **no se viera**, que es peor.
  · **`Promoter` NO tiene `.email` ni `.phone`**: son **`contact_email`** y **`contact_phone`**. Con
  los nombres de más («email», «phone») `getattr` devuelve vacío y el correo **no sale y no falla**
  — al productor y al tercero de la portada no les llegaba nada. Punto único
  **`_promoter_email_phone(promoter)`**, que hay que usar SIEMPRE que se saque el contacto de un
  tercero.
  · **`_song_interpreter_rows_map` devuelve OBJETOS del ORM, no diccionarios**: un `.get("...")`
  sobre ellos revienta (y dentro de un `try` se traga la lista entera), así que los **colaboradores**
  no entraban ni en la aprobación de la portada ni en los recordatorios.
  · **Un calendario con `kinds: []` no pinta NADA**: `agenda_calendar.js` filtra por esa lista, así
  que el cronograma salía vacío. Los tipos que se usen van en el payload **y** en
  `AGENDA_KIND_META`/`AGENDA_KIND_ORDER` (de ahí salió el tipo **`contenido`**).
  · **Una página pública standalone tiene que cargar su JS**: sin
  `<script src=".../js/agenda_calendar.js">` el cronograma se queda en «Cargando agenda…» (el parcial
  solo deja el JSON en el HTML).
  · **`move_url` fuera de la app**: en la página pública se quita, o el contenido sale arrastrable y
  el arrastre siempre falla (ahí no hay sesión).
  · **Los avisos van a QUIEN PUEDE ABRIRLOS**: los de las entregas públicas enlazan a la ficha del
  proyecto (`discografica.proyectos`), así que van a **`_disco_project_owner_ids`** (quien lo creó +
  quien del sello lleva a ese artista) y no a Registros a secas, que se comía un 403 en su propio
  aviso. Por lo mismo, `registros_release_dates_view`/`_confirm` aceptan **la primera clave** que
  tenga el usuario.
  · **Los iconos de MARCA no se pintan con `fa`**: `fa-youtube`, `fa-spotify`… viven en `fa-brands` y
  con la familia SOLID salen **vacíos** (punto único `_disco_creative_icon_class`); al revés también
  pasa —`fa-globe` y `fa-link` no son de marca—.
  · Y lo de siempre: una fila que se edita o se borra **por id** tiene que comprobar que es **de ese
  proyecto** (`_disco_plan_row_or_none`), un `%` dentro de un `style=` de un correo compuesto con `%`
  se escribe `%%` **solo si la cadena se formatea**, y desmarcar TODAS las publicaciones tiene que
  poder dejarlas todas apagadas (una lista vacía no es «no me han dicho nada»).

- **ORDENAR MI INICIO** (ago 2026): cada persona se coloca los módulos de la portada como quiera.
  Menú personal → **«Ordenar mi inicio»** (`/home?ordenar=1`), que enciende el modo: cada módulo se
  marca con su **asa** (nombre + agarre) y abajo sale la barra con **Guardar · Cancelar · Orden de
  siempre**. Se guarda en **`UserProfile.home_order`** (JSONB, lista de claves) con
  `home_order_save` (`POST /mi-inicio/orden`, en **`PERSONAL_ENDPOINTS`**: es una preferencia de
  cada uno). Motor `static/js/home_order.js` + clases `.home-order-*`.
  · **Es una PREFERENCIA, no un permiso**: solo se ordena lo que esa persona YA ve (los módulos se
  pintan según sus permisos y su departamento), así que la lista puede traer claves de módulos que
  hoy no se pintan y no pasa nada.
  · **Las claves salen del propio módulo** (`data-home-module` o, si no, un slug de su TÍTULO), así
  que un módulo nuevo NO hay que declararlo en ningún sitio: entra solo.
  ⚠️ Lo que **no se mueve** va marcado con **`data-home-fixed`** (la cabecera, la campanita de
  «Mis avisos» y los accesos rápidos): los avisos son lo primero que hay que ver.
  ⚠️ **Los módulos NO son hermanos consecutivos** (entre medias hay `<script>` y modales): `aplica()`
  los coloca TODOS SEGUIDOS en el sitio del primero usando un **marcador**. Insertándolos «antes del
  primero» se desordenaban en cuanto el primero era uno de los que había que mover (bug real: el
  módulo arrastrado acababa el último).
  ⚠️ **Varios hermanos que son UN módulo** (el cuadro de mando: su cabecera y su rejilla) van
  **envueltos** en un `<div data-home-module="…">`, o se moverían por separado.
  ⚠️ Se arrastra **por el asa** y con **eventos de PUNTERO** (no el arrastre nativo de HTML5): dentro
  de un módulo hay botones que tienen que seguir pinchándose, y con el dedo (iPad) el HTML5 no
  funciona. El asa lleva `touch-action:none`.

- ⚠️⚠️ **ENTREGA DE MASTERS · el 502 al enviar el formulario** (bug real, ago 2026). Los masters son
  archivos GRANDES: si viajan dentro del formulario, la petición se pasa del tiempo (y de la memoria)
  que el servidor le da y **muere con un 502 sin guardar nada** — el mismo caso que ya se resolvió con
  los vídeos. Ahora el navegador los sube **DIRECTAMENTE a Storage** con una URL firmada
  (`public_song_delivery_sign`, exento de CSRF y en las tres listas públicas) y al servidor solo le
  llega su dirección en `uploaded_json` (`{campo: [{key, name}]}`); el formulario enseña una barra con
  el archivo que va subiendo. ⚠️ Si la subida directa falla, se manda **todo** por el servidor como
  antes (respaldo) y se **descarta lo ya subido**, para que ningún archivo entre dos veces.
  ⚠️ Si al registrar un archivo ya subido no se puede resolver su dirección, **se deshace la entrega
  entera y se avisa**: una entrega a medias no se da por buena.

- **ENTREGA DE MASTERS · EL FORMULARIO SALE YA CUMPLIMENTADO** (ago 2026). Lo que ya está en la
  ficha (o ya se ha subido) llega **relleno** y se puede corregir si está mal; lo que falta se ve de
  un golpe. Punto único **`_song_delivery_prefill(session_db, song, conf)`** → `(form, hecho)`: los
  valores con los nombres que espera la plantilla y qué está ya cumplimentado.
  · Rellena la **producción** (duración, BPM, fecha, estudio, ingenieros, productor —con su tercero
  ya elegido—, arreglista y músicos), la **letra**, el **pitch** (sin formato: va en un `<textarea>`)
  y los **AUTORES** ya registrados, con su editorial, su rol y su %.
  · Lo ya cumplimentado se marca a la vista: **marco verde + etiqueta «Ya cumplimentado»**
  (`.dl-done` / `.dl-done__tag`).
  ⚠️ **Solo de lo que ESE enlace pide**: lo que no se marcó al crearlo ni se muestra ni se rellena,
  exactamente como antes.
  ⚠️ Un **`<input file>` no se puede rellenar**: de los materiales ya subidos se **dice cuál está**
  (con su nombre de archivo), dejan de ser obligatorios y subir otro los REEMPLAZA.
  ⚠️ Los formateadores de la casa devuelven **«—»** cuando no hay dato (`_seconds_to_timecode(None)`):
  eso no es un valor y no puede acabar en el formulario (lo filtra `pon`).

- **ENTREGA DE MASTERS · qué se pide y qué es obligatorio, campo a campo** (ago 2026):
  · Catálogo ÚNICO **`_song_delivery_askable()`** (campos de producción + autoral + letra + cada
  material) y **`_song_delivery_config(link)`**, que dice para ESE enlace si cada cosa se pide y si
  obliga. Se guarda en `SongMasterDeliveryLink.fields_json`; los enlaces ANTIGUOS no lo traen y se
  reconstruye de sus secciones/materiales, así que se comportan igual que siempre.
  · **PORTADA y TEXTO PARA EL PITCH** (ago 2026): se pueden pedir en el enlace y nacen **DESACTIVADOS**
  (`SONG_DELIVERY_OFF_BY_DEFAULT`), o sea que solo se piden si se marcan a mano. La portada es un
  módulo de material más (`mat.cover`) pero **es una IMAGEN**: no entra en
  `SONG_DELIVERY_MATERIAL_SPECS` (la lista de audios), va por el SERVIDOR con `data-no-direct` —la
  firma de subida directa solo admite .wav/.zip— y se guarda como `SongMaterial` COVER/COVER
  pendiente de validar. El pitch es su propia sección (`PITCH`) y al consolidarlo entra en
  `Song.pitch_text`, igual que si se escribiera a mano.
  ⚠️ Los enlaces ANTIGUOS sin `materials_json` se rellenan con **`SONG_DELIVERY_LEGACY_MATERIALS`**
  (los seis de audio), no con el catálogo entero: si no, empezarían a pedir la portada retroactivamente.
  · Al generar el enlace, cada campo lleva un **interruptor de TRES posiciones** con el mismo
  lenguaje que los de permisos (`.sw3` en `styles.css`, leyenda arriba): **apagado** = no se pide ·
  **ámbar en medio** = se pide · **verde a la derecha** = obligatorio. Se **ARRASTRA** el pomo (dedo o
  ratón), se pincha la posición o se usan las flechas, y el valor viaja en un `mode_<clave>` (0/1/2) —
  el servidor sigue aceptando las dos casillas antiguas por si queda una pantalla vieja abierta.
  ⚠️⚠️ **EN EL IPHONE Y EL IPAD NO SE PODÍAN MOVER** (bug real, ago 2026). El motor solo escuchaba
  **`click`** y vivía dentro de `song_detail.html`. Con el dedo, lo natural en algo que parece un
  slider es **arrastrarlo** — y un arrastre **NO genera `click`** (iOS lo toma por un scroll en cuanto
  el dedo se mueve), así que no pasaba absolutamente nada. Y pinchar tampoco valía: el control medía
  **64×23 px, 21 px por posición**. Ahora el motor es **`static/js/sw3.js`** (GLOBAL en `layout.html`,
  no-op sin `[data-sw3]`), con **Pointer Events + `setPointerCapture`** (dedo, ratón y lápiz), y en
  táctil el interruptor se agranda a **108×34 px** con `touch-action:pan-y` (un arrastre horizontal
  mueve el pomo, uno vertical sigue haciendo scroll).
  ⚠️ La zona de toque ampliada (`.sw3::after`) es de **4 px** arriba y abajo a propósito: entre fila y
  fila hay 9 px, y con 10 px las zonas se SOLAPABAN y un toque junto al borde cambiaba el interruptor
  de la fila de al lado (comprobado con `elementFromPoint`).
  ⚠️ La geometría va en variables (`--sw3-w/-h/-knob/-pad`) y el recorrido del pomo se CALCULA: sin
  eso, cambiar el tamaño deja el pomo corto o fuera. De ahí salen también
  `sections_json` y `materials_json`, para que todo cuadre. El formulario público pinta solo lo
  pedido y **valida exactamente eso**.
  · **PREVISUALIZACIÓN del enlace** (`_song_delivery_share_context` + `public_song_delivery_og_image`):
  la **portada**, «Entrega de masters · <canción>» y, debajo, el **artista** con los **intérpretes**
  que haya además de él. La miniatura va a 1200×630 **desde nuestro dominio** (como el resto), con la
  foto del artista y el logo como respaldo.
  · **EL PRODUCTOR es un TERCERO de la base de datos**: buscador con foto (reutiliza
  `public_song_delivery_authors`, que ahora devuelve también el **correo**), alta al vuelo
  (`public_song_delivery_create_author` acepta `email`) y, **solo si su ficha no tiene correo**, se
  pide ahí y **se guarda en su ficha** al enviar la entrega. Queda apuntado en
  `data['production']['producer_promoter_id']`.
  · **RECORDATORIOS**: mandar el enlace por correo activa `reminders_enabled`; el barrido
  `_song_delivery_reminders_sweep` (cron `/cron/entrega-masters`, y también dentro del cron diario de
  documentos para no depender de otra tarea en Render) insiste **una vez al día** hasta que se
  cumplimente o se anule — se para solo. ⚠️ Se llama desde una petición: usa `url_for`.
  · La página pública carga **`styles.css`** (es standalone: sin ella `btn-primary` salía AZUL) y su
  botón es `btn-danger`, como el resto de páginas públicas. El correo de solicitud lleva el título
  **centrado** bajo el logo, y el recordatorio reutiliza el mismo diseño.

- **Entrega de masters (enlace público)**: `SongMasterDeliveryLink` (token, `sections_json`, `status`
  ACTIVE/SUBMITTED/CANCELLED, `data` JSONB). Botón en la ficha (modal: secciones producción/autoral/letra/
  masters) → endpoints `discografica_song_delivery_create`/`_cancel`; formulario público
  `public_song_master_delivery` (`templates/public_song_master_delivery.html`, exento CSRF/login, logo
  PIES). Lo recibido entra **pendiente**: datos en `data`, materiales `SongMaterial` con
  `validation_status='PENDING'` + `delivery_link_id`. **Validación en la ficha**: materiales con
  ✓Validar/✗Rechazar (`…/materials/<id>/validate`; stems `…/stems/<b>/validate`); datos en panel
  *"Entrega recibida"* con Consolidar/Descartar por sección (`…/entrega/<id>/consolidar`, aplica a
  `Song`/`SongEditorialShare`). Barra de estado amarilla mientras haya `PENDING`. **Inicio**: módulo
  *Tareas pendientes · Registros* en `home.html` (`_home_registros_pending` + `inject_personnel_globals`,
  visible con `has_access_key('registros')`) que lista canciones con entregas pendientes y enlaza a la ficha.
  El modal de generar permite elegir **qué materiales** pedir (`materials_json`, módulos desactivables) y
  **enviar el enlace por correo** (`discografica_song_delivery_send_email` + `_send_optional_email`, con
  buscador `/api/search/promoters`). El hueco de portada **provisional** solo se muestra si existe. El
  formulario público autocompleta **autores** (con foto, búsqueda **acento-insensible** vía
  `_sa_contains_text`) y permite crearlos vía endpoints ligados al token (`public_song_delivery_authors` /
  `_publishers` / `_create_author` / `_create_publisher`), con **sugerencia de duplicados** al crear y
  selector de **editorial con logo + crear nueva**. La editorial se **congela por registro** en
  `SongEditorialShare.publishing_company_id` (snapshot; al mostrarla se cae a la del tercero si está vacío,
  helper `_share_publisher`): cambiarla actualiza el tercero **de aquí en adelante** sin tocar registros
  anteriores. El envío del enlace
  por correo busca terceros y carga sus **correos vinculados** (`api_promoter_emails`) para elegir
  destinatarios + nota. **Todos los correos del servidor (`_send_optional_email`) llevan Reply-To al usuario
  que envía** por defecto (`reply_to or _current_user_email()`).
- **ENTREGA DE MASTERS · lo entregado es TAREA de REGISTROS y del SELLO** (ago 2026). Cuando un
  tercero entrega por su enlace, eso es trabajo para dentro: hay que **revisarlo y validarlo**.
  · **AVISO** (kind **`MATERIALES`**): «**Estudio Perico ha subido los masters de «Canción»**», con
  **su foto o su logo** y lo que falta en el cuerpo. Va a **Registros** (`_registros_user_ids`) y al
  **SELLO** —quien lleve a ese artista en su faceta (`assigned_artist_ids_sello`) y, si no lo tiene
  nadie, todo el departamento—: `_song_delivery_review_recipients`.
  · **LA CARA en los avisos**: `AppNotification.actor_photo_url` / `actor_name` (columnas nuevas) para
  cuando quien lo provoca **NO es de la casa**; si es de la casa, la foto se resuelve **en vivo** de su
  perfil en `_notification_rows` (una sola consulta para toda la lista). Se pinta en los TRES sitios
  (la franja, el pop-up de la campanita y el módulo «Mis avisos» de Inicio) con la clase `.notif-ava`,
  en el hueco del icono del tipo — sin foto, el icono de siempre. `_notify_user` acepta
  `actor_name=` / `actor_photo=`.
  · **LA TAREA no se cierra hasta que la entrega está COMPLETA**: punto único
  **`_song_delivery_review_state(session_db, link)`** → `pending` (materiales sin validar) ·
  `sections` (datos sin consolidar) · `rejected` (lo que se rechazó y **sigue faltando**) ·
  `missing_labels` · `done`. Con él van el módulo de Inicio (`_home_registros_pending`, ahora visible
  para **registros Y discográfica**), el aviso de la ficha (pestaña Materiales) y el cuadro de
  dirección (área Registros), así que los tres dicen lo mismo.
  ⚠️⚠️ **RECHAZAR un material es BORRARLO** (el botón ✗ es `discografica_song_material_delete`), así
  que deja de estar «pendiente de validar» **y la tarea desaparecería justo cuando falta algo**. Por
  eso el rechazo se **apunta en la entrega** (`_song_delivery_mark_rejected` →
  `link.data['rejected']`) y se da por resuelto solo cuando ese módulo vuelve a tener un material
  validado (`_song_delivery_field_has_validated`). Se apunta en el enlace, no en la canción, para no
  resucitar trabajo de entregas viejas ya cerradas.
  · El aviso se cierra SOLO al completarse (`_song_delivery_review_close(_for_song)`, la regla de
  `_notify_resolve`), enganchado en los CUATRO caminos que revisan: validar un material, validar los
  stems, consolidar una sección y descartarla.
  ⚠️⚠️ **QUIÉN entregó se apunta AL RECIBIRLA** (`data['submitted_by']`, con nombre y foto): los datos
  de producción **se van al consolidarlos** y con ellos se perdía el nombre del productor, así que el
  aviso y la tarea dejaban de decir quién había subido los masters (bug real que sacó la prueba).
  ⚠️ Un tercero **no tiene `photo_url` ni `name`**: son **`logo_url`** y `nick`/`first_name`+`last_name`
  (`_promoter_display_name`).
  ⚠️ Mirar 50 entregas no puede ser 50 consultas: `_song_delivery_pending_map` cuenta lo pendiente de
  TODAS de una vez (GROUP BY) y `_song_delivery_review_state` lo acepta en `pending_map=`.
  · Probado contra la app real (Postgres de prueba): estado tras la entrega · aviso a registros y
  sello y a nadie más · cierre solo al validar y consolidar · rechazo → vuelve a pendiente diciendo
  «falta Master 48 bits» · reposición → completa · y el reparto del módulo de Inicio (registros sí ·
  sello con ese artista sí · sello con otro artista no · ticketing no · dirección sí).

- **CERTIFICACIONES EN UN DOCUMENTO** (ago 2026): a la **derecha, a la altura de la portada**, con
  el título **«Certificaciones»** encima, la imagen del disco (**APILADA** cuando son varias, igual
  que en la pestaña Certificaciones), debajo una **etiqueta con el color del disco** («3 x Oro») y,
  centrada bajo ella, la **bandera del país**.
  · Punto único **`_lc_certifications`** (agrupa por **TIPO Y PAÍS**: hay que decir de dónde es cada
  una) + `_lc_cert_imgs_html` (web y correo) y `_lc_pdf_certifications` (PDF). El nombre corto
  («Oro») y el color de cada tipo viven en `_certification_catalog`.
  ⚠️ **La imagen apilada se compone en el SERVIDOR** (`_certification_stack_png`, cacheada; el
  endpoint acepta `?n=`): con CSS haría falta `position:absolute` o un margen negativo, y en un
  correo eso no se puede dar por bueno. Tope `CERT_STACK_MAX` = 6.
  ⚠️ En el **PDF la bandera va como CÓDIGO DEL PAÍS** (ES, PT): las fuentes del PDF no dibujan
  emojis y una bandera saldría como un cuadrado vacío. En la web y en el correo sí es la bandera.
  ⚠️ El **título va en su propia tabla, con el ancho de la columna**: metido en la de los discos, con
  una sola certificación se partía en dos líneas («CERTIFICACIO / NES»).
  · `_certifications_by_type` (agrupar por TIPO sumando países) se conserva para la ficha de Syncro.
  ⚠️ Los PNG de las certificaciones pesan **~290 KB** cada uno: en un correo o en un PDF se sirven
  **reducidos** (`_certification_small_png`, cacheado; endpoint público `certification_icon_png` para
  el correo y `_certification_icon_path` para ReportLab).
  ⚠️⚠️ **`certification_icon_png` TIENE que estar en las TRES listas de públicos** (como
  `brand_icon_png`): su nombre no empieza por `public_`, así que sin eso el `<img>` del correo y el
  del enlace se comen un redirect al login y las certificaciones salen **rotas**.
  ⚠️ El **tamaño se redondea a saltos de 32 px** (el `?s=` lo elige quien llama y es público: si no,
  la caché guardaría una imagen por cada tamaño pedido) y **un fallo no se cachea** (si no, un pico
  de memoria dejaría esa imagen rota para siempre en ese worker).
  ⚠️ **Nunca se salen de su columna**: en el PDF el alto se calcula con las que hay **y** hay tope de
  cuántas caben (`ancho_cm`, que en el LC del ÁLBUM es 3,9 cm y no 4,7); en la web y en el correo, el
  tope es `CERT_HTML_MAX` (8).

- **PITCH DE LANZAMIENTO** (ago 2026): el texto con el que se presenta un single o un disco.
  · **TITULAR destacado** (`Song.pitch_title` / `Album.pitch_title`): el titular con el que se
  presenta. Se escribe encima del texto en la ficha y sale **en grande y en el rojo de la casa antes
  del texto** en el PDF, en el correo y en la página pública (el texto sigue **justificado**). Es
  opcional: sin él, todo se ve como antes.
  · **Un campo más de la ficha de Información** (`Song.pitch_text`/`Album.pitch_text` +
  `pitch_updated_at`), panel único **`templates/_pitch_panel.html`** (incluido en `song_detail.html`
  y `album_detail.html` con `pitch=_pitch_context(...)`), con sus **tres puntitos**: editar ·
  descargar en PDF · enviar por correo · WhatsApp · SMS · copiar enlace. Sin pitch, botón «Añadir
  pitch» y aviso amarillo «Falta el pitch de este lanzamiento».
  ⚠️ Se guarda por su **propio endpoint** (`discografica_song_pitch_save`/`_album_pitch_save`), NO
  por el formulario de Información: ese anula lo que no se le manda.
  · **El PDF y el correo son IGUALES a propósito** (mismo diseño en dos formatos): logo de PIES
  arriba a la **derecha**, «Pitch» **centrado**, la **viñeta** del lanzamiento (portada, título,
  intérpretes, fecha de publicación y etiqueta Single/Álbum/EP) y el texto **justificado**.
  Motor: `_pitch_context` (lo que necesitan ficha, PDF, correo y página pública) ·
  `_build_pitch_pdf_bytes` · `_pitch_email_html` (con el botón **«Descargar en PDF»**; el PDF va
  además **adjunto**) · `_pitch_paragraphs`. Asunto y mensaje: **`Pitch <artista> <título>`**.
  · **WhatsApp/SMS comparten el ENLACE PÚBLICO** (`public_pitch_view`, `/pitch/<token>`, plantilla
  `public_pitch.html` standalone), que tiene el juego de **og:** completo para que la
  previsualización enseñe la **PORTADA** del lanzamiento y, si todavía no hay, la **foto del
  artista** (`public_pitch_og_image` → `_og_image_jpeg_bytes`, 1200×630 desde nuestro dominio).
  La página lleva su botón «Descargar en PDF» (`public_pitch_pdf`).
  · **Tarea pendiente al crear un lanzamiento**: `_pitch_notify_new_release` avisa (kind `PITCH`) a
  **quien del sello lleva ese artista** (`_pitch_sello_user_ids`: `assigned_artist_ids_sello`; si
  nadie lo tiene asignado, a **todo el departamento Sello** — mejor que lo vean varios que dejarlo
  sin dueño) y el módulo de Inicio **`HOME_PITCH_PENDING`** (`_home_pitch_pending`) lista los
  lanzamientos sin pitch. ⚠️ Solo desde **`PITCH_TASK_FROM`** (01-ago-2026): el catálogo antiguo no
  genera tarea. Dirección lo ve todo; quien está en Sello sin artistas asignados, también.
  ⚠️ Los artistas de la faceta sello se leen de **`state["profile"].assigned_artist_ids_sello`**
  (en la raíz del estado solo está la unión `assigned_artist_ids`).
  · Los endpoints `discografica_*_pitch_*` heredan la sección por la ruta `/discografica`; los tres
  públicos están en `PUBLIC_ENDPOINTS_EXTRA` **y** en las dos listas `allowed`.
- **Simulaciones — ajustes ago 2026**: números sueltos con punto de miles (`|k` en plantilla + `toLocaleString('es-ES')` en JS; importes ya con filtro `eur`). Gastos: cabecera de categoría (bocadillo) en **rojo corporativo** sobre franja clara; **arrastrar** un gasto entre categorías (HTML5 DnD, re-renderiza la fila en destino); categorías **ALOJAMIENTO/LOGISTICA/PERSONAL/MUSICOS** (`SIM_EXPENSE_QTY_CATEGORIES`) llevan **cantidad** → total = importe unitario · cantidad (`SimulationProductionItem.quantity`/`ExpenseTemplateItem.quantity`, el motor multiplica); nueva categoría **PERMISOS** «Permisos y licencias». En Gastos, las biñetas de resumen van a la derecha y el total es «Gasto Total:» destacado. Módulo de socios (`sim_partners.js`): tabla con columna **Participación**, nombre completo sin cortar, cabeceras a 2 líneas y filas altas; mismo módulo y **mismo título** («Socios: beneficio y riesgo») en Resumen/Socios/Resultado. Cabecera de fecha: la tarjeta central solo muestra la fecha (sin nombre).
- **REMESAS · fecha de pago por pago, PDF y aprobación de dirección** (ago 2026):
  · **FECHA DE PAGO de cada pago** (`PaymentBatchItem.payment_date`): el día en que el banco lo
  emite. Nace **hoy** (la de la remesa) y se cambia **pinchándola** en la ficha
  (`payment_batch_item_date`, calendario inline en `pagos.js`); la fecha de la remesa es la de POR
  DEFECTO y con la casilla «Ponerla en todos los pagos» se copia a todos.
  ⚠️ **En `pain.001.001.03` la fecha de emisión (`ReqdExctnDt`) vive en el `PmtInf`, no en el
  apunte**: `sepa_utils.build_credit_transfer_xml` agrupa los pagos por fecha y emite **un `PmtInf`
  por día** (con su `NbOfTxs`/`CtrlSum`; el `PmtInfId` lleva el orden detrás porque tiene que ser
  único, y con una sola fecha se queda la referencia a secas, como antes).
  · **PDF de la remesa** (`payment_batch_pdf` → `_build_payment_batch_pdf_bytes`, estilo de casa):
  logo de la empresa arriba a la derecha, «Remesa de pagos» centrado, cabecera con el nombre de la
  remesa y su fecha, el **importe total destacado** y la tabla tercero · concepto · **artista con
  foto** · fecha de pago («Hoy» si es hoy) · importe, con la suma total al final. Se genera **al
  vuelo**: siempre dice lo que la remesa dice hoy.
  · **APROBACIÓN DE DIRECCIÓN** (`PaymentBatch.approved_at` + `PaymentBatchItem.approved_at`): al
  crear una remesa le sale a dirección en Inicio (**`_home_payment_batch_approvals`** →
  `HOME_BATCH_APPROVALS`, «Remesa pendiente de aprobación») y por notificación (`_notify_users`, kind
  `REMESA`). La pantalla **`payment_batch_approve_view`** (`templates/remesa_aprobar.html`, clases
  `.ra-*`) enseña la MISMA cabecera del PDF y debajo las facturas **una a una**: Anterior · **Ok**
  verde · Siguiente, cada OK se guarda al momento (`payment_batch_item_approve`, JSON) y **pasa sola
  a la siguiente**; al terminar todas sale el resumen (el listado del PDF con las etiquetas verdes) y
  la remesa queda **aprobada**. La factura de cada pago se carga **solo al mirarla** (si no, se
  bajarían todas al abrir). Quitar un OK devuelve la remesa a pendiente.
  ⚠️ **Sin aprobar NO se baja el fichero para el banco** (`payment_batch_export` rebota diciéndolo):
  para eso está el repaso. El PDF sí se puede bajar siempre.
  · **Trazabilidad**: el OK se apunta en el propio gasto (`BagPaymentInteraction` kind
  `REMESA_APROBADA`, con quién de dirección y cuándo) y en el historial de la liquidación de
  royalties (`BATCH_APPROVED`).
  · **Lo que ya está en una remesa se ve APAGADO** en pendiente de pago (gris y atenuado:
  `.pay-exp/.pay-royalty/.pay-bag.is-in-batch`), y vuelve a la normalidad al sacarlo. Se apaga
  también **en vivo** al arrastrarlo a la caja (y se enciende al quitar el chip, `dim()` en
  `pagos.js`). Una bolsa se apaga cuando **todos** sus gastos están ya en una remesa.
  ⚠️ `payment_batch_remove_item` suelta también el `payment_batch_id` de la **liquidación de
  royalties**: sin eso se quedaba como «ya está en una remesa» y no se podía meter en ninguna otra.
  · ⚠️ **EL FICHERO PARA EL BANCO SE PUEDE BAJAR ANTES DE LA APROBACIÓN** (ago 2026, corrección): así
  se deja **precargado** en la plataforma del banco mientras dirección repasa, y al dar el visto
  bueno solo hay que confirmarlo allí. `payment_batch_export` avisa de que aún no está aprobada
  («no lo confirmes hasta que dé el visto bueno») pero **no bloquea**.
  · **Cabecera de la remesa**: todos los botones en UNA fila y en orden de uso — Descargar fichero ·
  Descargar PDF · Repasar y aprobar · **Anular remesa (el último)**. «Deshacer remesa»
  (`payment_batch_delete`) se **retiró**: anular ya suelta los pagos y además deja constancia.
  · La **fecha de pago** solo se toca en cada pago de la lista: en «¿Desde qué cuenta se paga?» no se
  repite (era el mismo dato en dos sitios).

- **PITCH · el TITULAR CENTRADO, los GÉNEROS en la cabecera y el TEXTO CON FORMATO** (ago 2026):
  · El **titular** va **centrado** sobre el texto del pitch en los cuatro sitios (la ficha, el PDF,
  el correo y la página pública): es el mismo contenido, así que se ve igual en todos.
  · En la **cabecera del lanzamiento**, debajo de la fecha, salen las **etiquetas de GÉNERO con su
  icono** (`_sync_genre_icon`, el mismo de Syncros: punto único). En un álbum son los géneros de
  sus temas, sin repetir.
  ⚠️ En el **PDF**, la fecha y el tipo («Single») van como **etiquetas** —`<font backColor>`, que
  es lo que ReportLab da para eso— igual que en el correo y en el enlace; el icono del género va
  **FUERA** del `<font backColor>`: dentro, ReportLab deja el hueco y **no dibuja la imagen**
  (comprobado). El PNG del icono se saca con **`_fa_icon_png_path`**, porque un `Paragraph` admite
  `<img src="ruta">` pero no bytes ni un data URI.
  ⚠️ En el **correo** y en la **página pública** (standalone, sin Font Awesome) el icono va como
  PNG por `brand_icon_png`, el punto único de la casa.
  · **EL PITCH ADMITE NEGRITA, CURSIVA Y SUBRAYADO**, también **al PEGARLO** desde un Word o un
  Google Docs. Editor único `templates/_rich_text_field.html` + **`static/js/rich_text.js`**
  (global, no-op sin `[data-rich-editor]`), usado por la ficha del lanzamiento y por el paso del
  proyecto. Lo pegado se limpia en el navegador —un `<span style="font-weight:700">`, que es como
  pega Word, se convierte en `<b>`— y **se vuelve a sanear en el SERVIDOR**
  (**`_pitch_clean_html`**, con `HTMLParser` de la stdlib: aquí no hay `bleach`), que deja **solo**
  `<p> <br> <b> <i> <u>` y escapa todo lo demás.
  ⚠️ Los pitchs ANTIGUOS son texto plano con saltos y **se siguen leyendo igual** (`_pitch_is_html`
  lo decide): no hay nada que migrar.
  ⚠️ Puntos únicos de lectura: **`_pitch_paragraph_htmls`** (los párrafos ya como HTML seguro, que
  usan la ficha, el PDF —con `_pitch_pdf_markup`—, el correo y el enlace), **`_pitch_editor_html`**
  (lo que se le da al editor) y **`_pitch_plain_text`** (sin formato). Lo que NO pinta HTML tiene
  que usar el plano: el resumen del paso del proyecto y el modal de «ejemplos anteriores» (que lo
  escapa), o se verían las etiquetas.
  ⚠️ `.pitch-text` ya no lleva `white-space: pre-line` (ahora son párrafos de verdad); el hueco
  pequeño que enseña el pitch **tal cual lo escribió un tercero** en una entrega de masters
  (`.pitch-text--sm`) sí lo conserva.

- **UNA PORTADA SE PINCHA Y SE VE EN GRANDE** (sep 2026): la portada de la cabecera de la ficha de
  CANCIÓN y de ÁLBUM, las del módulo de portadas de Materiales y el «Ver» de los materiales del álbum
  se abren en el **visor de la casa** (`media_viewer.js`, `data-viewer-*`), con **Descargar** y, nuevo,
  **Imprimir**. Solo si hay portada de verdad: la imagen de «sin portada» no se abre.
  · **`Imprimir`** en el visor (imágenes y PDF): una imagen se abre en una ventana propia y se lanza
  `print()`; un PDF vive en OTRO dominio (Storage) y a un marco ajeno no se le puede pedir `print()`,
  así que se baja como blob (Storage manda CORS) a un marco oculto del mismo origen. Si no se puede,
  se abre en una pestaña.
  · El **videoclip** de la ficha de canción también se ve en el visor (antes abría otra pestaña), por
  su versión web, y su descarga sigue siendo el original en MOV o MP4.

- **MAQUETAS SUELTAS: al acabar una, sigue la siguiente** (sep 2026, `media_chip.js`). Varias
  etiquetas de audio en la misma pantalla (las maquetas del proyecto en la ficha de una canción o de
  un disco) son para quien escucha una LISTA: al terminar una se encadena con la siguiente del mismo
  grupo (`[data-chip-group]` o, si no hay, la `.ficha-section` / `.card` / `.modal` en que están).
  ⚠️ El listado de la sección Demos ya lo hacía (es `playlist.js`, comprobado con la app real: acaba
  la primera y arranca la segunda); lo que no encadenaba eran las etiquetas sueltas.

- **CHARTMETRIC · REPRODUCCIONES de Spotify, YouTube y TikTok, y cada cuánto se actualizan**
  (sep 2026):
  · **De qué plataformas hay dato**: punto único **`CM_TRACK_STREAM_SOURCES`** — **Spotify**
  (`type=streams`; su defecto es `popularity`, que NO son reproducciones), **YouTube** (SIN `type`:
  su OpenAPI no declara valores para esa plataforma y mandar uno inventado es pedir un 400) y
  **TikTok** (`type=views`, las visualizaciones de los vídeos que usan el sonido).
  ⚠️ **De APPLE MUSIC y AMAZON no hay reproducciones**: no están en el enum de plataformas del
  endpoint de estadísticas (sí en `get-ids`, que es lo que da su ENLACE). Antes la cabecera pintaba
  sus dos huecos con un **«—» que no se podía llenar nunca**; ahora esas dos salen solo con su logo.
  · **El número va DEBAJO DEL ICONO** en las tres que sí lo tienen (`_cm_song_header` lleva ya el
  `field` de cada una: `streams` en Spotify, `views` en YouTube y TikTok — antes estaba escrito a
  mano y por eso el dato de YouTube, que YA se guardaba, no se pintaba en ningún sitio).
  · **CADA CUÁNTO SE ACTUALIZA** (`CM_REFRESH_STEPS` + `_cm_refresh_interval_days`, punto único):
  el primer **MES todos los días**, hasta los **3 MESES una vez por semana** y después **una vez al
  mes**. Lo aplica `_cm_songs_due` (tope de 200 canciones por pasada, las más recientes primero) y
  lo dispara `_chartmetric_refresh_all_bg`: la **primera visita a Inicio del día** (reclamo atómico
  en `chartmetric_meta`) y el cron `/cron/chartmetric/refresh`.
  ⚠️ Una canción **sin fecha de lanzamiento** cae en el tramo mensual y va la última.
  · ⚠️ **LOS ENLACES QUE FALTAN se rellenan solos** (`_cm_song_links_missing` +
  `_cm_fill_missing_links`, tope `CM_FILL_LINKS_PER_RUN` = 40 por pasada): antes una canción **ya
  vinculada** a la que le faltaba un enlace no lo recibía nunca —el auto-enlace por ISRC solo mira
  las que NO tienen `cm_track`, y el refresco del artista solo pide `get-ids` para las que no tienen
  NINGUNO—. TikTok no cuenta como «falta»: Chartmetric no da el enlace de TikTok de una canción.
  ⚠️ **Cada llamada cuesta un crédito** y se descuenta aunque no devuelva ninguna fila: una canción
  al día son 3 llamadas (una por plataforma) más, si le faltan enlaces, la de `get-ids`.

- ⚠️⚠️ **SET LIST · tipos de línea, ICONOS, el parón RAYADO, las portadas y la cabecera del PDF**
  (13-sep-2026, lo pidió Dani). Panel `_setlist_panel.html` + `setlist.js`; en la hoja de ruta lo
  pinta `setlistRows` de `roadmap.js` con las MISMAS claves.
  · **TIPOS** (`_SETLIST_ITEM_KINDS` + **`SETLIST_KIND_META`**, el punto único de su etiqueta, icono
  y color en el PDF): SONG · BREAK · NOTE · **SPEECH («Hablar», azul)** · **THANKS
  (agradecimientos, rojo/rosa)**. Nota, hablar y agradecimientos van **cada uno en SU propia línea,
  del tamaño de una canción y sin número**, en su color (`.setlist-row--note/--speech/--thanks`).
  · **EL PARÓN VA RAYADO A TODO LO ANCHO** con lo que se escriba en medio: en pantalla un
  `repeating-linear-gradient` diagonal (`.setlist-row--break`) y en el PDF una banda de rayas con
  el texto centrado en un hueco (`/////// TEXTO ///////`; sin texto, la raya entera).
  · **ICONOS AL LADO DE UNA CANCIÓN** (`RepertoireTemplateItem.icons`, JSON de claves del catálogo
  **`SETLIST_ICONS`**: guitarra · guitarra eléctrica · piano · batería · micrófono · persona · beso ·
  corazón · estrella · fuego · palmas · brindis · público). Se **ARRASTRAN** desde la paleta hasta la
  canción (o, con el dedo, se pincha la canción —queda `is-selected`— y luego el icono) y **salen en
  el PDF** (`drawImage` con `mask='auto'`, blancos sobre el negro).
  ⚠️⚠️ **`fa-piano` y `fa-guitar-electric` NO EXISTEN en esta Font Awesome** (saldrían vacíos): esos
  dos se DIBUJAN con formas simples en un lienzo 24×24 (`_SETLIST_ICON_SHAPES`, glifos de un color
  con huecos «bg») y **la MISMA lista** la pinta el navegador como SVG (`_setlist_icon_svg`, huecos
  en `var(--sl-icon-bg)`) y Pillow como PNG para el PDF (`_setlist_icon_png_path`, supermuestreado
  ×4; ⚠️ `ImageDraw` ESCRIBE el píxel, así que un relleno transparente hace el hueco). El resto van
  por `_fa_icon_png_path`. Los iconos se **limpian** al guardar (`_setlist_icons_from_json`: solo
  claves del catálogo, sin repetir, tope 6, y solo en una canción).
  ⚠️ El arrastre de un icono viaja en `text/plain` como `icon:<clave>` y el de REORDENAR filas con el
  índice en el mismo canal: el `drop` distingue por el prefijo (antes se pisarían).
  · **LAS CANCIONES SE AÑADEN CON SU PORTADA**: el `<select>` nativo se retiró (era lo que «se
  quedaba enganchado») y hay un buscador con la lista de portadas debajo (`.setlist-pick`, de la más
  reciente a la más antigua, las ya puestas en verde); pinchar una la añade **al momento** y la lista
  se queda abierta para seguir añadiendo. Las filas llevan también la portada (`data-setlist-songs`
  → `SONG_BY_ID`).
  · **LA CABECERA DEL PDF** (`_setlist_pdf_header`): **el ARTISTA en grande** y debajo **el nombre de
  la actividad o el festival —si no, el municipio— seguido de la fecha**; el PDF de UN punto de la
  hoja de ruta añade un tercer renglón con ese punto (`header['extra']`,
  `_roadmap_setlist_pdf_source` usa la MISMA cabecera). El rótulo «SET LIST» solo sale si no hay artista.
  ⚠️⚠️ **La respuesta de `setlist_save` decía «sin líneas» tras guardar** (bug real que sacó la
  prueba): la sesión es `expire_on_commit=False` y las líneas se añaden por `template_id`, así que
  `t.items` seguía con la lista vieja. Se hace `s.expire_all()` antes de releer.

- ⚠️⚠️ **ENTREGA DE MASTERS · NO SE PIDE LO QUE YA TENEMOS, Y LA DURACIÓN LA DA EL MASTER**
  (sep 2026). El formulario que le llega a un tercero preguntaba cosas que ya estaban en la app y un
  dato que estaba dentro del archivo que él mismo adjuntaba.
  · **LA DURACIÓN NO SE PREGUNTA**: se lee de la **cabecera del .wav** (punto único
  **`_wav_duration_from_header`** + `_wav_duration_from_stream` / `_wav_duration_from_url` +
  **`_song_apply_master_duration`**), con el master de **16 bits** por delante y los otros como
  respaldo. Se aplica **en los dos caminos**: la entrega pública y la subida de un master **desde la
  ficha**, y solo si la canción todavía no tiene duración. El campo «Duración (Timing)» se retiró de
  `SONG_DELIVERY_PRODUCTION_FIELDS`.
  ⚠️ Se leen **los primeros bytes**, no el archivo: un master pesa 300 MB. Se recorren los TROZOS
  del RIFF (`fmt `/`data`), porque un master real trae `bext`/`iXML` delante del audio; si el `data`
  declara 0 se calcula con el tamaño real. Y **no consume el archivo** (se devuelve el stream a su
  sitio), que después lo sube `upload_file`. Nada de ffmpeg.
  · **LO QUE YA ESTÁ NO SE PIDE**: punto único **`_song_delivery_effective_config`** (= la
  configuración del enlace **menos** lo que ya tenemos, `_song_delivery_already`), que usan **la
  pantalla y la validación del envío**, así que no se puede pedir algo que no se enseña. Si el
  reparto autoral ya está registrado, si la letra ya está subida o si un material ya está entregado,
  ese hueco **desaparece** —aunque el enlace lo pidiera— y arriba se dice qué ya tenemos.
  ⚠️ Cuenta también lo **YA ENTREGADO en otra entrega** aunque no se haya consolidado en la ficha:
  pedirle dos veces la letra a quien ya la mandó es justo lo que se quiere evitar. Y como al
  **rechazar** un material se BORRA y al **descartar** una sección se quita de la entrega, lo que de
  verdad falta se vuelve a pedir solo (la regla de `_notify_resolve`).
  ⚠️ Si no queda NADA por pedir no se enseña un formulario vacío: la página dice **«No hace falta
  nada más»** (`{% elif not sections %}`).
  · **IDs DE PLATAFORMA, igual**: la página pública solo enseña los huecos que faltan y dice de
  cuáles ya tenemos el gráfico; con todos subidos, «No hace falta nada más».
  ⚠️ `_song_delivery_config` se queda **sin filtrar** a propósito: es la que pinta la pantalla de
  CONFIGURACIÓN del enlace, donde se elige qué pedir.
  Probado con la app real: un enlace que lo pide todo sobre una canción con letra, autores y master
  48 ya puestos solo pide el resto; una entrega con un master de 16 bits deja la canción en **3:27**
  sin preguntar nada; y un enlace que solo pide lo que ya está dice que no hace falta nada.

- **TIKTOK · el minuto de inicio y CUÁNDO se lanza** (sep 2026). El lanzamiento en TikTok puede ser
  **ANTES** que el del single, así que tiene su propia fecha (`Song.tiktok_release_date`,
  `tiktok_release_time`, `tiktok_release_done_at`/`_by`).
  · **Por defecto es EL MISMO DÍA** del lanzamiento, con su tarjeta rápida y su icono. ⚠️ Se guarda
  como fecha **VACÍA**, no copiando la del single: así, si el single se mueve, TikTok lo sigue solo.
  Poner a mano la misma fecha del single cuenta también como «el mismo día» (`_song_tiktok_state`).
  · **Con OTRO día** pasan tres cosas: entra en el **PLAN DE LANZAMIENTO** (y por tanto en su
  cronograma) como «Lanzamiento en TikTok» **con el minuto en el que empieza**
  (`_song_tiktok_plan_sync`, que lo RETIRA si se vuelve al mismo día); se avisa a quien es
  **REGISTROS y SELLO a la vez** (`_song_tiktok_notify`, kind `REGISTROS`, con el aviso de que la
  fecha NO es la del single); y sale **en la ficha de la canción** entre lo que falta
  (`_song_missing_required`), con su botón **«Ya está configurado»**.
  ⚠️ Cambiar la fecha **invalida** lo que se hubiera dado por configurado: es otra fecha.
  · **El pop-up es un parcial único** (`_tiktok_modal.html`): lo incluyen la ficha de la CANCIÓN y el
  PROYECTO (ahí solo cuando el lanzamiento es UNA canción; en un álbum el minuto es de cada tema).
  Antes la tarea del proyecto llevaba a la pestaña «Información» de la canción, donde no se ve dónde
  configurarlo: «pinchas y no hace nada».
  ⚠️ `discografica_song_tiktok_save` va en **`REQUEST_ANY_ENDPOINTS`**: lo marca como hecho
  Registros+Sello, que no tiene por qué poder editar discográfica (se comprueba dentro).

- ⚠️ **EL PITCH SE ESCRIBE JUSTIFICADO** (sep 2026): el editor con formato (`_rich_text_field.html`)
  no justificaba, así que se escribía en bandera y se leía justificado en la ficha, el PDF, el correo
  y el enlace. La macro acepta **`area_class`** y el pitch le pasa `rich-editor__area--justify` (lo
  usan la ficha del lanzamiento y el paso del proyecto). El `.pitch-input` del `<textarea>` viejo se
  conserva.

- **QUÉ ES UN LANZAMIENTO: focus single o de CONTINUIDAD, y se marca DONDE SE CREA** (sep 2026).
  El **focus single** solo se podía marcar desde el paso del proyecto discográfico y desde el cuadro
  de Previsiones, y la **continuidad** (`Song.is_continuity`, que nació con Previsiones) no se podía
  marcar en ningún sitio de la ficha. Ahora se elige en los **TRES** sitios donde se trabaja con la
  canción, con el **MISMO selector**:
  · la **ficha de la canción** → editar **Información** (es *donde se actualiza*),
  · el **alta** de una canción (Discográfica → Repertorio → «+ Añadir canción»),
  · y los pasos de **crear la canción**: el **asistente de PROYECTO**, en el paso del single.
  · **Selector único**: `templates/_song_release_kind_picker.html` (macro `release_kind_picker`), con
  las tres respuestas —**Focus single · Continuidad · Sin decidir**— sacadas del catálogo
  `DISCO_RELEASE_KINDS`, así que el color y el icono de cada una son los del calendario de
  Previsiones. `compact=true` es la versión de una línea (el alta y el asistente).
  · **Punto único de ESCRITURA: `_apply_song_release_kind(song, kind, nick)`** (lo usan los cuatro
  caminos, incluido el endpoint `forecast_song_kind` del cuadro, que antes lo hacía a mano). **Un
  tema no es las dos cosas**: marcar una quita la otra.
  ⚠️ **CON CENTINELA** (`release_kind_present`, lo lee `_release_kind_from_form`): sin él, un
  guardado parcial de otra pantalla **borraría el focus** (la regla de siempre).
  ⚠️ **«Sin decidir» deja las dos columnas en `NULL`**, que **no es «no»**: hay tareas que esperan a
  que se decida. Al marcar CONTINUIDAD, `focus_single` se queda en **`False`** (se ha decidido que no
  es focus) y no en NULL.
  ⚠️ **En un ÁLBUM no se aplica a todas sus canciones**: el focus de un disco es UNO de sus temas y
  eso se marca en su ficha (`disco_project_create` solo lo aplica si el proyecto es un SINGLE,
  `DISCO_SINGLE_KINDS`; y el selector solo está en el paso del single, cuyos campos `step_wizard.js`
  DESHABILITA en los demás tipos).
  · **LA ETIQUETA es un global**: **`release_kind_badge(song_o_fila, cls)`** (+ `song_release_kind`),
  que pinta Focus single o Continuidad con su color. Sustituye a los CUATRO sitios que pintaban el
  focus a mano (la cabecera de la canción, su módulo de Radio, el repertorio y la ficha del
  proyecto), así que ya no se pueden desparejar.
  ⚠️ `_song_release_kind` acepta la **canción y también una FILA (dict)** de un listado —que es lo
  que pintan el repertorio y el proyecto—, y una fila puede traer ya `release_kind` calculado.
  ⚠️ La fila de **Lanzamientos** leía `r.focus_single`, que **`_disco_launch_items` no devolvía**:
  esa etiqueta no salía nunca (bug real, arreglado con `release_kind` en la fila).
  ⚠️ Al guardar por AJAX **la CABECERA no se repinta** (`ajax_inline` solo reemplaza su zona), así
  que el planteamiento sale también como una fila de la vista de **Información** —que sí se refresca
  al momento— y en la cabecera al recargar, igual que PROVISIONAL o EXPLÍCITA.

