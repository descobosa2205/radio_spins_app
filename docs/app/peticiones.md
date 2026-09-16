# Peticiones

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- EL INICIO DE CONTRATACIÓN: tareas, peticiones y facturas por cobrar (sep 2026)
- INVITACIONES · CAMBIAR EL RECEPTOR al editar una petición
- INVITACIONES · la foto o el logo, delante del nombre
- INVITACIONES · una petición de VARIAS categorías se ve en TODAS (corregido ago 2026).
- ASISTENTE DE PETICIÓN · tarjetas, «¿se sabe dónde?» y editarla
- PETICIONES · tres puntitos, con caché y quién cubre los gastos
- MIS PETICIONES · el rechazo se comunica EN LA PROPIA FILA: el módulo de Inicio
- APROBAR UNA PETICIÓN: CONTRATACIÓN SOLO DICE CON QUÉ EMPRESA DEL GRUPO SE HACE.
- APROBAR UNA PETICIÓN NO CREA NADA: la devuelve para CONFIGURARLA, y luego va POR FASES
- LAS PETICIONES QUE YA ESTABAN APROBADAS vuelven al proceso (_peticion_stub_backfill_once,
- LA FICHA DE UNA PETICIÓN SE LEE COMO LA DE UNA ACTIVIDAD: ficha-hero (foto del
- AL PINCHAR UNA PETICIÓN SE ABRE SU FICHA: en el listado de Contratación, en las
- UNA PETICIÓN Y SU ACTIVIDAD SON LO MISMO PARA LOS SOLAPES (bug real, ago 2026): al editar
- PROMOCIÓN · UNA sola pantalla
- Cartelería · petición, subida a mano y aprobación de diseño (aprobar es SOLO de diseño y
- UNA PETICIÓN DE ACTIVIDAD ES PARA CONTRATACIÓN, Y SOLO PARA ELLOS. Es quien la
- PRODUCCIÓN · ACTIVAS ES LA PÁGINA PRINCIPAL y las PETICIONES son un MÓDULO ENCIMA
- PETICIONES · el paso «¿EN QUÉ CONSISTE Y CANTA?»: el asistente de peticiones pasa a
- PETICIONES · LAS PERSONAS DE CONTACTO, con el selector de la actividad
- UNA PETICIÓN NO SE QUEDA EN CONTRATACIÓN: le sale a QUIEN LE AFECTA. Una

---

- **INVITACIONES · CAMBIAR EL RECEPTOR al editar una petición** (ago 2026): el formulario de edición
  solo tenía un desplegable con cuatro opciones y **no había forma de decir A QUIÉN**; elegir «Otro»
  guardaba el modo y dejaba los datos del receptor anterior. Ahora sale el MISMO proceso que al
  crearla: «A alguien de la empresa» → el personal con su foto; «A otro» → barra de búsqueda de
  terceros con foto/logo y **alta al vuelo** (`data-quick-create="promoter"` sobre un `<select>`
  oculto, el sistema global). Si el elegido no tiene ni correo ni teléfono, se piden ahí mismo.
  · Punto ÚNICO **`_invitation_receiver_from_form`** (extraído de `_invitation_parse_guest_receiver`):
  lo usan crear, enviar una selección del plano y **editar**, así que el receptor se guarda igual en
  los tres. ⚠️ En una edición, «A mí» es **quien PIDIÓ** la petición, no quien la está editando.
  ⚠️ El formulario llega por AJAX y **`innerHTML` no ejecuta sus `<script>`**: todo el JS del
  receptor va por DELEGACIÓN en el `full_edit_modal()` de `_my_invitation_menu.html`. El panel que
  no toca se **deshabilita** (oculto no basta: sus campos se envían igual).

- **INVITACIONES · la foto o el logo, delante del nombre** (ago 2026): en las peticiones se enseñaba
  la del invitado pero no la de **quien la recibe** (una persona de la casa o un tercero salían solo
  con su nombre) ni la del **compromiso**. Punto único: `_invitation_request_payload` devuelve
  `receiver_photo` + `receiver_photo_is_person`, resueltos **EN VIVO** (el `receiver_payload` de las
  peticiones antiguas no guardaba la foto) — persona → redonda (`is-photo`), empresa → `is-logo`.
  Aplicado en la gestión del evento, en el panel de la ficha de la actividad, en la cabecera de cada
  compromiso, en la lista de invitados y en el módulo de Inicio.

- **INVITACIONES · una petición de VARIAS categorías se ve en TODAS** (corregido ago 2026).
  `_invitation_grouped` metía cada petición en un único grupo —su categoría «principal», la de más
  entradas—, así que al mirar una categoría faltaban peticiones que sí tenían entradas ahí. Ahora se
  pinta en **cada** categoría con cantidad > 0, con **su** número (`cat_qty`) y diciendo en qué otras
  está (`other_cats`); el contador del grupo cuenta SUS entradas, no el total de la petición.
  ⚠️ En la fila **solo se enseña el número de ESA categoría** (y la etiqueta de ubicación con todas
  desaparece cuando está repartida): ver «4 entradas» en la fila de una categoría que tiene 3 es
  justo lo que confundía. El total de la petición se dice al pasar el ratón.
  ⚠️ La copia de una categoría que NO es la principal va marcada (`is_secondary`): **no lleva el
  `id="req-…"`** (si no, habría ids duplicados en el DOM y `getElementById` cogería cualquiera) y
  **no se arrastra** — recategorizar se hace desde la principal, o el arrastre sería ambiguo.

- **ASISTENTE DE PETICIÓN · tarjetas, «¿se sabe dónde?» y editarla** (ago 2026):
  · Las opciones se eligen con **TARJETAS** (`.promo-pick`, las mismas del resto de asistentes) en
  **los tres pasos que preguntan algo**: qué se pide, si se sabe dónde y **qué es quien lo pide**.
  ⚠️ Las de «quién hace la petición» eran **`.quad-chip`**… una clase que **solo existe dentro de un
  `<style>` de `cuadrantes.html`**, así que en este modal no tenía ningún estilo y se veían los radios
  en crudo, pegados unos a otros (bug real). Al reutilizar una clase, comprobar que está en
  `styles.css` y no en el `<style>` de otra pantalla.
  ⚠️ Una tarjeta puede ser `<button>` (las que saltan al asistente de promoción o de marketing): sin
  `button.promo-pick{font:inherit}` el navegador les pone su propia tipografía y se ven distintas en
  la misma fila.
  · **Lo elegido se queda a la vista con su FOTO o su LOGO** (`.pw-picked`): al elegir un recinto o
  quién pide, antes solo quedaba un «✓ seleccionado» y se perdía la imagen.
  · **Lo que se busca se crea con el «+» de al lado de la barra**, como en el resto de la app (antes
  el de «quién pide» era un enlace «No existe: crear nuevo» debajo).
  · **«¿Se sabe dónde?»**: tres tarjetas — **No todavía** · **Conozco el recinto** (buscador con foto
  y «+» para crearlo) · **Conozco la ciudad** (al escribirla salen las opciones y la **provincia se
  rellena sola**). Se guarda en `payload['place_kind']` (NONE|VENUE|CITY) y **lo que no se elige se
  limpia**: una petición no puede quedarse con un recinto de antes y una ciudad nueva.
  · **CÓMO SE ESCRIBE UN LUGAR** (punto único **`_place_label`**): **«Municipio, Provincia»** —con
  una coma, que es como se escribe una dirección, no con «·» ni otro carácter— y el **PAÍS solo si NO
  es España** («Toulouse, Occitanie (France)»): dentro no aporta nada y fuera es justo lo que hace
  falta saber. Un municipio que se llama igual que su provincia (Sevilla, Madrid) no se repite. Con
  un recinto delante queda «Recinto · Municipio, Provincia», que el recinto sí es otra cosa. Se usa
  en la ficha de la petición, en su listado (un solo dato, no dos chips) y en las sugerencias de
  ciudad.
  · **Las ciudades las da `api_city_search`** (`/api/municipios`, en `SUPPORT_READ_ENDPOINTS`): busca
  primero en NUESTROS datos (municipios de recintos y de actividades, que son pares ciudad+provincia
  ya curados y salen al instante) y solo si hay pocos pregunta a `geo_utils`, de donde la provincia
  sale del **código postal**, nunca de la comunidad autónoma que devuelve el proveedor.
  ⚠️ Se pregunta **dos veces**: sesgado a España (el 99% de lo que se pide) y, si eso no ha traído
  nada que case, el término A SECAS — así también salen las ciudades de fuera con su país. Y se
  **descarta lo que no casa con lo escrito**: el buscador de direcciones devuelve lo que tiene cerca
  aunque no se parezca («Toulouse» → Zaragoza), y en un selector de ciudades eso es ruido. Una ciudad
  muy lejana puede no aparecer (el proveedor se consulta con sesgo a España): el campo es libre y se
  escribe a mano.
  · **EDITAR una petición ya creada** con el MISMO asistente: `peticion_wizard_update`
  (`/peticiones/<id>/editar`) + `_peticion_edit_payload` (los datos que el asistente necesita) y
  punto único **`_peticion_apply_form`**, que usan crear y editar — así una petición editada queda
  exactamente como si se hubiera creado así. La edita **quien la hizo** o quien gestiona su bandeja.
  ⚠️ El payload viaja en `data-peticion-payload` con **`|tojson|forceescape`**: sin `forceescape`, la
  comilla doble corta el atributo y el botón deja de hacer nada.
  ⚠️ `_peticion_edit_payload` construye su URL con `url_for` dentro de un `try`: la fila de una
  petición se monta también fuera de una petición HTTP (un cron, un hilo) y ahí `url_for` revienta.
  · **QUIÉN LO PIDE se ve con su FOTO o su LOGO** en la ficha (`_peticion_requester_chip`, punto
  único): el que pide puede ser un tercero, una empresa, una institución, un artista, un medio, un
  recinto o alguien de la oficina, y cada uno tiene su imagen en otro sitio — antes era una línea de
  texto.
  · **El artista ya tiene algo ese día**: al elegir la fecha (y otra vez antes de crearla) se
  pregunta a **`/api/concerts/check-artist-conflict`**, el MISMO endpoint que usa el asistente de
  actividad (mira conciertos, acciones, bloqueos y notas de agenda y otras peticiones), y se dice qué
  tiene. Con las **dos opciones**: «Hacer la petición igualmente» o «No hacerla».
  · **La FICHA se gestiona desde la barra de debajo de la cabecera** (`.ficha-quick`): **Aceptar
  petición** (pop-up con las tarjetas de en qué se convierte → sigue el flujo de siempre) y **Cerrar
  petición** (pop-up que pide el motivo). Los dos módulos que había abajo se retiraron.
  · ⚠️ **CERRAR UNA PETICIÓN NO LA TERMINA**: hay que **decírselo a quien la hizo**. Al cerrarla se le
  manda un aviso (kind TAREA, `ref_type='peticion_rechazo'`) y le queda la tarea **«Notificar el
  rechazo de una petición»** en Inicio (`_home_peticion_rejections`) y en la propia ficha, con quién
  la pidió y su contacto a la vista. Al marcar «Ya se lo he comunicado»
  (`booking_request_rejection_notified` → `BookingRequest.rejection_notified_at`) la petición queda
  terminada y el aviso **se cierra solo** (`_notify_resolve`).
  ⚠️ Si la cierra la MISMA persona que la pidió no se crea aviso (no se avisa a uno mismo), pero la
  tarea y el aviso de la ficha siguen saliendo: lo que hay que hacer es lo mismo.
  · **Módulo de Inicio «Mis peticiones»** (`_home_my_peticiones` → `HOME_MY_PETICIONES`): las que ha
  hecho esa persona, con su estado, para seguirlas sin buscarlas — y con el botón de editarlas. No
  depende de ningún permiso de sección (son suyas); las resueltas hace más de 120 días no se listan.

- **PETICIONES · tres puntitos, con caché y quién cubre los gastos** (ago 2026):
  · **Tres puntitos** (editar con el MISMO asistente con el que se creó · eliminar) en la **ficha** de
  la petición —a la derecha de su barra de botones— y en el módulo **«Mis peticiones»** de Inicio. La
  ficha incluye ya el asistente (`_peticion_wizard_modal.html`), así que se edita sin salir; por eso
  la vista le pasa también `artists`. Borrar es de **quien la hizo**, de quien gestiona su bandeja o
  de dirección (lo comprueba `booking_request_delete`).
  · **«Con caché» / «Sin caché» son TARJETAS con icono** (no un interruptor). Con caché salen el
  importe y, debajo, **«¿Cubren gastos?»**: el MISMO módulo que en el asistente de actividad, ahora en
  un parcial reutilizable **`templates/_promoter_costs_module.html`** (mismos nombres de campo, así
  que lo lee el mismo `_parse_promoter_costs_form`). Se guarda en `payload['promoter_costs']`, se ve
  en la ficha («Cubren gastos: Hoteles (3 dobles) · Viáticos») y se **restaura al editar**.
  ⚠️ El módulo va marcado con **`data-pc-module`** y **sin ids**: su motor (en `scripts.js`) trabaja
  por delegación dentro de su propio módulo, porque en **Inicio conviven** el asistente de actividad
  —que trae su propia copia con ids— y el de peticiones, y con ids se pisarían.
  ⚠️ Sin caché no se pregunta y **se limpia** lo que hubiera: una petición sin caché no puede
  arrastrar unos gastos cubiertos de antes.

- **MIS PETICIONES · el rechazo se comunica EN LA PROPIA FILA** (ago 2026): el módulo de Inicio
  `HOME_MY_PETICIONES` (`_home_my_peticiones`) se lee como el de **Tareas pendientes** (foto del
  artista con `artist_avatar`, `.ctask__head`/`.ctask__facts`/`.ctask__tasks`) y una petición
  **RECHAZADA sale ahí mismo como «pendiente de comunicar»**, con sus dos botones: **Comunicar**
  (`booking_request_rejection_send`, que le escribe a quien la pidió por su canal —correo o SMS—
  con `_peticion_rejection_email_html`, y **solo si el aviso sale** marca la tarea) y **«Ya se lo he
  comunicado»** (`booking_request_rejection_notified`). Al comunicarla **se archiva y desaparece** de
  la lista (`rejection_notified_at`). El módulo aparte de rechazos (`HOME_PETICION_REJECTIONS`) se
  **retiró**: era la misma petición en otro momento de su vida.
  ⚠️ Los dos endpoints van en **`REQUEST_ANY_ENDPOINTS`**: la tarea es de **quien pidió**, que no
  tiene por qué llevar contratación (sin eso se comía un 403 al resolver su propia tarea), y cada uno
  comprueba dentro que la petición es suya. Por lo mismo, el enlace a la bandeja solo se ofrece a
  quien puede entrar en ella.
  ⚠️ Lo que hay que HACER va primero en el módulo: comunicar un rechazo es una tarea, no seguimiento.

- ⚠️⚠️ **APROBAR UNA PETICIÓN: CONTRATACIÓN SOLO DICE CON QUÉ EMPRESA DEL GRUPO SE HACE** (sep 2026).
  Es el dato que ella tiene y que quien lo pidió no siempre sabe, así que se pregunta **ahí y solo
  eso** (`billing_company_id` → `BookingRequest.payload['group_company_id']`); todo lo demás lo
  termina quien la pidió.
  · **El pop-up de aceptar es UN SOLO formulario**: las tarjetas de «¿en qué se convierte?» espejan
  su valor en un oculto (`data-pa-type`, el patrón `data-dp-mirror` de la casa) y debajo van las
  empresas con su logo. ⚠️ Antes **cada tarjeta era su propio `<form>`**, así que no se podía
  preguntar nada más: unos radios fuera del formulario no viajan.
  · En la **bandeja** (`peticiones.html`) el menú «Aprobar» abre el mismo pop-up
  (`_peticion_approve_modal.html`, **uno por página**: la URL de cada petición se fija EN EL CLIC,
  porque con un pop-up por fila habría ids repetidos).
  ⚠️ **Con una sola empresa del grupo no se pregunta nada** (va en un oculto): la regla de la casa
  es no ofrecer una elección que no elige nada.
  · ⚠️⚠️ **Y AL VOLVER A QUIEN LA PIDIÓ NO SE LE PREGUNTA TODO OTRA VEZ**: el asistente se abre con
  lo de la petición ya puesto (eso ya estaba, `_peticion_wizard_prefill`) **más la empresa**, y
  **entra directamente en el primer paso que falta** en vez de empezar por el principio —
  `_peticion_wizard_missing` dice qué pasos no puede haber contestado la petición y el asistente
  salta ahí (`window.app33ConcertWizard.goStep`, que expone su navegación). Arriba se DICE que viene
  de una petición y que lo que ya se sabe está puesto: si no, uno no sabe si el asistente está
  relleno porque lo ha hecho la app o porque se quedó a medias.
  ⚠️ Los pasos anteriores **siguen ahí**: se puede volver atrás a repasarlos.
  ⚠️ Si no falta nada de lo que la petición sabe, se entra en el primero que ella **nunca** puede
  contestar (las entradas, el estado…): `sabidos` en el payload del precumplimentado.
  Probado con la app real: aprobar guarda la empresa, no crea ninguna actividad, el asistente sale
  con artista, empresa, fecha, municipio, promotor, «¿tiene caché?» con su importe, los gastos que
  cubre el promotor y la descripción, y `faltan` dice [2,3,4,5] en una petición vacía.

- ⚠️⚠️ **APROBAR UNA PETICIÓN NO CREA NADA: la devuelve para CONFIGURARLA, y luego va POR FASES**
  (ago 2026). Cuando contratación aprueba (p. ej. un **evento promocional**), la petición vuelve a
  **QUIEN LA PIDIÓ** y a partir de ahí todo el trabajo es suyo. **`booking_request_approve` YA NO crea
  ningún borrador**: antes creaba un `Concert` con una fecha inventada (`today_local()`) que había que
  arreglar a mano. La actividad **la crea el asistente al terminar de configurarla**.
  Las fases son las de `PETICION_ACCEPT_PHASES` (punto único **`_peticion_accept_tasks`**, que usan el
  módulo de Inicio, la ficha de la actividad y la de la petición, así que los tres dicen lo mismo),
  **en orden y cada una bloqueada hasta que la anterior esté hecha**:
  · **1 · Configurar el evento** — mientras no exista la actividad (`concert_id`). Sale con la
  etiqueta **«Petición aprobada»** y el botón **«Configurar evento»**, que abre **el asistente de
  siempre** (`_concert_wizard_modal.html`, los mismos pasos que al añadir una actividad nueva) **ya
  cumplimentado** con lo de la petición: **`_peticion_wizard_prefill`** → `window.CONCERT_WIZARD_PREFILL`
  (artista, tipo, fecha, recinto o municipio+provincia, quien lo pidió como promotor, ¿tiene caché? y
  su importe si era un número, lo que cubre el promotor y la descripción). Al terminarlo,
  **`_wizard_link_peticion`** ata la actividad a su petición (`concert_id`) y cierra el aviso.
  · **2 · Confirmar con el artista** (la fecha y que lo quiere hacer) — `BookingRequest.artist_agreed_at`,
  endpoint `booking_request_artist_agreed`. Es una **conversación**, no un correo: se marca a mano.
  · **3 · Confirmar al promotor** — `acceptance_notified_at` (`booking_request_acceptance_send`, correo
  o SMS con `_peticion_acceptance_email_html`; solo si el aviso sale marca la fase, o
  `..._notified` para «ya se lo he confirmado»).
  ⚠️⚠️ **BLOQUEADA hasta que el artista haya dicho que sí**: no se compromete una fecha con nadie de
  fuera antes. Lo comprueba también el **SERVIDOR** en los dos endpoints (esconder el botón no basta).
  · **4 · Activar producción + Informar al artista** — LAS DOS A LA VEZ, y bloqueadas hasta la 3. El
  aviso formal al artista va **al final**, cuando ya está todo comprometido. Al activar la producción
  la actividad pasa a las tareas de **PRODUCCIÓN** y **deja de estar** en las de quien la pidió (la
  fase desaparece sola en cuanto hay responsable).
  ⚠️ Cada fase se decide mirando el **estado de verdad**, no una marca aparte, así que desaparece sola
  al hacerse (la regla de `_notify_resolve`), y con la última la fila se va del módulo.
  ⚠️ **Todas las fases son de quien la pidió**: contratación acaba su parte al aprobarla. El mecanismo
  de dueños sigue puesto (`owner`/`owner_nick`/`mine`) y lo que **no es tuyo** se ve en gris con el
  nombre de quien lo tiene. Quién es dirección se lee de `estado["role"]`, **no de `is_master()`**
  (ese saca el rol de la sesión y sin sesión cae a 10: todas las fases saldrían «mías»).
  · **Dónde se ve**: módulo de Inicio **«Actividades por cerrar»** (`HOME_ACTIVITY_PHASES` ←
  `_home_activity_phase_tasks`, en el bloque de «lo suyo»; la fila se monta con la **actividad** y,
  mientras no esté configurada, con los datos de la **petición**) · la **barra de botones de la ficha
  de la actividad** (`_concert_peticion_phases` → «El artista lo confirma» y «Confirmar al promotor»;
  activar producción e informar al artista ya tenían el suyo) · y la **ficha de la petición**, con el
  aviso «Petición aprobada» + «Configurar evento» y, después, por qué fase va.
  ⚠️ Una petición con fases pendientes **no sale en «Mis peticiones»**: está en «Actividades por
  cerrar». Ahí vuelve solo cuando ya no hay nada que hacer, como seguimiento.
  ⚠️ **Corte automático con `BookingRequest.accepted_at`**: lo aprobado ANTES de que esto existiera no
  reclama nada (mismo criterio que `PITCH_TASK_FROM`, pero sin fecha a mano).
  ⚠️ Los tres endpoints van en **`REQUEST_ANY_ENDPOINTS`**: la fase es de quien pidió, que no tiene por
  qué llevar contratación, y cada uno comprueba dentro que la petición es suya.
  ⚠️ El precumplimentado se aplica **después de `shown.bs.modal`**: los Select2 del recinto y del
  promotor se crean ahí y antes no se les puede meter nada. El payload se emite **siempre** (así el
  asistente sale cumplimentado también al pulsar el botón a mano) y `autoopen` —que lo pone
  `?configurar=1`— es lo único que decide si se abre solo al entrar.

- ⚠️ **LAS PETICIONES QUE YA ESTABAN APROBADAS vuelven al proceso** (`_peticion_stub_backfill_once`,
  marca `peticion_stub_backfill_v1`, ago 2026): el aprobado ANTIGUO creaba un borrador vacío y no
  dejaba constancia de la aprobación, así que esas peticiones **no reclamaban nada** (ni «Petición
  aprobada» ni configurar el evento). El arreglo puntual **borra el borrador vacío**
  (`_concert_is_untouched_stub`: BORRADOR, sin pasar por el asistente y sin bolsa, entradas, cachés,
  contratos, cartelería, presupuesto, pagos, invitaciones ni hoja de ruta) y le sella `accepted_at`,
  con lo que la petición vuelve a «pendiente de configurar».
  ⚠️ Lo que ya está configurado NO se toca: una actividad con trabajo hecho no vuelve atrás.

- **LA FICHA DE UNA PETICIÓN SE LEE COMO LA DE UNA ACTIVIDAD** (ago 2026): `ficha-hero` (foto del
  artista, antetítulo «Petición · \<tipo\> · Con/Sin caché», estado y —si ya se aceptó— «Ya es una
  actividad»; la línea de datos con iconos) + **arriba a la derecha QUIÉN LO PIDE** con su foto o su
  logo (`.hero-company`, que en una actividad es la empresa del grupo) + `.ficha-quick` con los
  botones + **pestañas servidas** (`?tab=`, `ficha-tabs`/`ficha-tabpane`) con secciones
  `.ficha-section` y la tabla compacta `psum-list psum-list--2col`.
  ⚠️ **Solo se pinta lo que corresponde a ese tipo de actividad y a cómo se configuró la petición**:
  las pestañas se construyen en `_booking_request_detail` (`tabs`) y **la que no tiene nada no
  existe** — «Económico» solo si hay importe o gastos cubiertos (una petición sin caché no la tiene) y
  «Actividad» solo cuando ya se aceptó. Un campo sin valor no se pinta (nada de huecos).
  ⚠️ Si se pide una pestaña que no existe, se cae a la primera (mismo patrón que contabilidad o la
  ficha de personal).

- ⚠️ **AL PINCHAR UNA PETICIÓN SE ABRE SU FICHA** (ago 2026): en el listado de Contratación, en las
  bandejas de departamento (Promoción/Diseño) y en «Mis peticiones» de Inicio. Para eso
  `booking_request_detail_view` deja entrar también a **QUIEN LA PIDIÓ** (antes solo a su departamento
  o a dirección, así que al pinchar la suya se comía «esta petición es de otro departamento» y volvía
  a la portada). ⚠️ En la bandeja, el menú de tres puntitos va **por encima** del `stretched-link`
  (`position-relative` + z-index) o no se podría pinchar.

- ⚠️⚠️ **UNA PETICIÓN Y SU ACTIVIDAD SON LO MISMO PARA LOS SOLAPES** (bug real, ago 2026): al editar
  una petición ya aceptada, el aviso de «ese día el artista ya tiene algo» señalaba **el propio evento
  que esa petición había creado**. `exclude_id` excluía solo el id de cada tabla; ahora
  **`_conflict_exclude_ids`** resuelve el **par** por `BookingRequest.concert_id` (en los dos sentidos)
  y `_conflict_exclude` excluye todos esos ids en conciertos, acciones, agenda y peticiones.

- **PROMOCIÓN · UNA sola pantalla** (ago 2026): la pestaña «Peticiones» desapareció como pestaña y es
  un **módulo arriba** que **solo se ve si hay peticiones pendientes**. Debajo, las promociones
  **activas de la más próxima en adelante** (`_promo_sort_and_subject`: primero lo que viene, y lo
  pasado detrás, de lo más reciente hacia atrás; la fecha sale de sus ENTREVISTAS con
  `_promo_dates_map`, en UNA consulta para todo el listado).
  · Botón de **solo icono** «Ver por artistas» (`?vista=sujetos`): rejilla de artistas, giras,
  eventos y festivales **con promociones activas**, con su foto y su número; al pinchar uno se ven
  solo las suyas (`?sujeto=<id>`). Las de una canción o un disco se agrupan por SU ARTISTA.
  · Las **archivadas** con `?archivadas=1` (el botón conserva la vista y el sujeto en los que estés).
  ⚠️ `promo_view` sigue admitiendo `?tab=activas|archivadas` por los enlaces antiguos.

- **Cartelería · petición, subida a mano y aprobación de diseño** (aprobar es SOLO de diseño y
  dirección: `_can_validate_artwork` = `is_master() or has_access_key('diseno')`; lo que sube diseño
  entra ya APROBADO y lo que sube cualquier otro queda PENDIENTE —al resto se le enseñan atenuados con
  la etiqueta «Pendiente», sin botones de aprobar): con el evento sin peticiones se
  dice «Sin peticiones» y sale **UNA sola** opción según quién promueve (empresa del grupo →
  *Realizar petición a diseño*; promotor externo → *Solicitar al promotor*, usando
  `_concert_is_group_promoted`), más **Subir carteles**. La subida a mano
  (`concert_artwork_upload_direct`, modal `#artworkUploadModal`) admite **arrastrar carpetas enteras**
  (se recorre el árbol con `webkitGetAsEntry` y se sube cada archivo, no la carpeta) y deja los
  carteles en `validation_status='PENDING'`: se ven pero **no se pueden usar** hasta que diseño les dé
  el OK **uno a uno** (`concert_artwork_asset_review`, igual que las fotos). Al rechazar se pide la
  nota de qué cambiar: el cartel sale en su sección **«Rechazados por diseño»** con el aviso y a quien
  lo subió (`ConcertArtworkAsset.uploaded_by_user_id`) le aparece en **Inicio** el módulo
  `HOME_ARTWORK_REJECTED` (`_home_artwork_rejected`). Compartir: por cartel (correo/WhatsApp/SMS/
  copiar enlace/descargar) y de todos (los mismos + **copiar los enlaces** + **descargar todos** en ZIP,
  `concert_artwork_download_all`). El principal se elige a mano o lo pone el más cuadrado al aprobar.
  **Módulos que solo salen cuando toca**: «Solicitud realizada» (con el detalle de lo pedido DENTRO:
  formatos, vídeo, logos, ticketeras y notas — no hay módulo «Detalle de la solicitud» aparte) aparece
  únicamente si hay una petición de verdad (`requested_at` o estado REQUESTED/PROMOTER/CORRECTIONS);
  «Formatos subidos», solo si hay carteles (aprobados, rechazados o antiguos).

- ⚠️⚠️ **UNA PETICIÓN DE ACTIVIDAD ES PARA CONTRATACIÓN, Y SOLO PARA ELLOS** (sep 2026). Es quien la
  valora, la habla y la cierra. `_peticion_departments` mandaba una actividad **SIN CACHÉ** al
  **SELLO** y una de **TV** además a **PROMOCIÓN**, así que la petición le aparecía en Inicio (y en la
  bandeja) a gente que no tenía nada que hacer con ella. **Al aceptarla ya sigue su curso**: las
  fases son de quien la pidió (`_peticion_accept_tasks`) y la producción se le asigna a la persona
  que corresponda.
  ⚠️ `explicit` sigue mandando (lo usan los asistentes de PROMOCIÓN y de MARKETING, que no son
  actividades y no se contratan; esos, además, ya escriben su `departments` a mano), y
  `activity_type`/`no_cache` se conservan en la firma pero **ya no deciden nada**.

- ⚠️⚠️ **PRODUCCIÓN · ACTIVAS ES LA PÁGINA PRINCIPAL y las PETICIONES son un MÓDULO ENCIMA**
  (sep 2026, el mismo rediseño que Marketing). La pestaña «Solicitudes» **desaparece**: quedan
  **Activas** (con su contador) y **Archivadas** (**sin contador**: es un archivo que solo crece).
  · Las peticiones (`ProductionRequest` en REQUESTED/APPROVED) se pintan en una tarjeta **encima de
  la rejilla**, con sus botones de siempre (Convertir en bolsa · Rechazar), y **solo si hay alguna**.
  ⚠️ Solo en la REJILLA: dentro de un artista lo que interesa son sus actividades (y así el
  `?artist=` del drill-down no filtra el módulo sin que nadie lo haya pedido).
  ⚠️ Un `?tab=solicitudes` de un enlace antiguo **cae en «activas»**, que es donde están ahora
  (`PRODUCTION_TABS` + `_tab_arg("activas", valid=PRODUCTION_TABS)`, así un orden de pestañas
  guardado que apunte a la que ya no existe no decide nada), y los redirects de crear/rechazar/
  convertir van ya ahí.
  ⚠️ El **formulario de filtros** (buscar · artista · tipo) se pinta **solo en Archivadas**, que es
  lo que de verdad filtra (sus tarjetas, en el navegador): en Activas se filtra con la rejilla de
  artistas y los chips de tipo, y encima su `name="artist"` coincide con el `?artist=` del
  drill-down.
  ⚠️ Cada pestaña carga **solo lo suyo**: las archivadas (que son TODAS las bolsas cerradas, sin
  tope) solo en su pestaña — antes se consultaban en las tres para pintar un contador que ya no
  está—. `active_rows` (bolsas + 250 conciertos + 250 acciones) se **retiró**: no lo pintaba
  ninguna plantilla desde el rediseño de agosto y solo servía para un contador que decía otra cosa
  que la pestaña. El contador de Activas es ya SIEMPRE `activas["total"]`, o sea lo que se ve.
  ⚠️ El «visto» de «Nueva actividad» se marca mirando la pestaña **RESUELTA**, no `?tab=`: Activas
  es la página por defecto y con la condición vieja entrar en Producción a secas no marcaba nada
  (el destacado no se habría ido nunca).
  · **La persona de PRODUCCIÓN solo ve las activas que tenga ASIGNADAS** (lo pidió Dani): eso ya
  era la intención, pero **no funcionaba** — ver la trampa de abajo.
  ⚠️⚠️ **UNA PETICIÓN LA VE EL DEPARTAMENTO QUE LA HA PEDIDO, Y DIRECCIÓN SIEMPRE** (que es quien
  la asigna): si la pidió el SELLO la ve el Sello, si CONTRATACIÓN la ve Contratación… y
  **PRODUCCIÓN NO VE EL BUZÓN** — recibe lo que se le asigna, igual que en Activas. Punto único
  **`_production_requests_visible`** (+ `_production_request_dept_map`, que lee los departamentos
  de quien pidió cada una en UNA consulta).
  ⚠️ Quien la pidió la ve SIEMPRE, aunque no tenga departamento puesto; y una petición de la que
  **no se sabe quién la pidió** la ven todos (esconder trabajo que entonces nadie podría ver es
  peor: la misma regla que «Pendientes de asignar»).
  ⚠️ El departamento se compara ya normalizado (`_profile_departments`), así que «Sello» vale
  escrito como sea. En la fila se dice **quién la ha pedido y de qué departamento**, que es lo que
  explica por qué la ves y lo que dirección necesita para asignarla.

- **PETICIONES · el paso «¿EN QUÉ CONSISTE Y CANTA?»** (sep 2026): el asistente de peticiones pasa a
  **6 pasos** y gana el paso 5, que es el MISMO que al crear la actividad — la descripción, **¿el
  artista canta?** y, si canta, el **nº de canciones**, el **repertorio** (el parcial único
  `_performance_songs.html`, con su catálogo cargado de `api_artist_wizard_meta` al elegir artista)
  y la **FORMACIÓN**. En un concierto o un festival se canta siempre, así que ahí solo se pregunta
  la descripción (el bloque de «¿canta?» no se pinta).
  ⚠️ Se guarda con el **MISMO parser** que la actividad (`_wizard_performance_payload` →
  `payload['performance']`), así que al aprobar la petición el asistente sale **ya cumplimentado**
  y no vuelve a preguntar lo que ya se sabe (`_peticion_wizard_prefill` lo lleva, y el paso 4 deja
  de estar en `_peticion_wizard_missing`).
  ⚠️ **La DESCRIPCIÓN se movió** del paso económico al nuevo: no puede haber dos campos con el
  mismo `name` en el formulario (al leerlos se pisan y el servidor se queda con el primero).
  ⚠️ `app33PerfSongs` gana **`setChosen(root, songs)`** para reponer lo ya elegido al EDITAR.

- **PETICIONES · LAS PERSONAS DE CONTACTO, con el selector de la actividad** (sep 2026): el paso 4
  («quién hace la petición») incluye el MISMO `_concert_contacts_picker.html` que la actividad, así
  que al elegir quién lo pide se cargan SUS personas y lo que se ponga se **vuelca a la actividad**
  al configurarla (`payload['contacts']` → el prefill llama a
  `window.app33ConcertContacts.preselect('#wizardContacts', {...})`, API nueva del motor).
  ⚠️ **`#pwReqId` es un HIDDEN que rellena el JS**: cambiarlo con `.value` NO dispara `change`, y el
  selector escucha ese evento para cargar las personas del tercero (se avisa a mano, `avisaPromotor`).
  ⚠️ Con **CENTINELA `cc_present`** (lo emite el parcial): sin él no se distingue «no hay nadie» de
  «este formulario no pregunta por los contactos» y un guardado parcial los borraría.

- ⚠️⚠️ **UNA PETICIÓN NO SE QUEDA EN CONTRATACIÓN: le sale a QUIEN LE AFECTA** (sep 2026). Una
  petición la aprueba **contratación**, pero le importa a más gente. Al crearla —y según van
  entrando— reciben el MISMO aviso (kind **`PETICION`**):
  · **CONTRATACIÓN**, que es quien tiene que dar el ok;
  · el **JEFE DE PRODUCTO**: quien del **SELLO** lleva a ese artista;
  · **quien la PRODUCE**, en cuanto se le asigna la actividad que salió de ella;
  · **quien VIAJA con el artista**, en cuanto producción lo apunta en el **personal de la hoja de
    ruta** (`roadmap_payload['personnel']`, kind USER — el mismo dato que lee MI CALENDARIO).
  · **EL AVISO** lleva la **FOTO DEL ARTISTA** (`actor_photo`, que en `_notification_rows` gana a la
  de quien lo provocó), dice de **qué tipo de actividad** y de **qué artista** es, y en el cuerpo
  **para quién** (el medio o el promotor que la pide), **dónde**, **cuándo** y **en qué punto está**.
  Al pincharlo se abre su ficha. Punto único **`_peticion_notice_parts`**.
  · **EL ESTADO se dice ENTERO** (`_peticion_state_label`, punto único): «Pendiente de aprobación de
  contratación» · «Pendiente de configurar el evento» · «Pendiente de la confirmación del artista» ·
  «Pendiente de confirmar al promotor» · «Pendiente de activar la producción» · «Aprobada» ·
  «Cerrada». Sale del MOTOR DE FASES de siempre (`_peticion_accept_tasks`), así que la campanita y
  la etiqueta de la ficha no pueden contar cosas distintas.
  ⚠️⚠️ **EL AVISO VA A QUIEN PUEDE ABRIRLO**: la ficha solo la abría su departamento, dirección o
  quien la pidió, y `_peticion_departments` manda TODAS las de actividad a Contratación — el sello se
  habría comido un «esta petición es de otro departamento» **al pinchar su propio aviso**. Por eso
  **`_peticion_can_view` es el ESPEJO de `_peticion_watchers`**: a quien se avisa, se le deja entrar.
  ⚠️⚠️ **NO SE LE REPITE EL AVISO A NADIE**: a quién se le ha avisado ya se apunta en
  `payload['notified_user_ids']`, así que a producción y a quien viaja se les avisa **cuando
  entran**, no otra vez en cada guardado (la misma regla que `asked_for` en el contrato del
  productor). El JSONB se marca con **`flag_modified`**: el patrón de leer-copiar-reasignar no
  escribe la segunda vez en la misma petición y el aviso saldría una y otra vez.
  · **Dónde está cableado**: el asistente (`peticion_wizard_create`), el alta clásica
  (`booking_request_create`), **asignar producción** (`concert_production_owner_save` y la logística
  del asistente de alta) y el **personal de la hoja de ruta** (`roadmap_personnel_save`, solo con
  `_kind == "concert"`). Los tres últimos pasan por **`_peticion_notify_for_concert`**, que sin
  petición detrás no hace nada.
  ⚠️ **`_pitch_sello_user_ids` pasa a llamarse `_artist_sello_user_ids`**: es el punto único de «de
  quién es este artista en el sello» (el JEFE DE PRODUCTO) y lo usan el pitch, los proyectos, las
  demos y esto — el nombre viejo hacía pensar que solo valía para el pitch.
  ⚠️ El aviso sale también **por correo** (`NOTICE_EMAIL_DEFAULT_KINDS`): es «te acaba de entrar
  algo», que es la regla de la casa, y `_notice_email_already_sent` impide repetirlo.
  Probado con la app real (28 comprobaciones): contratación y el jefe de producto reciben el aviso
  con la foto, el sello de OTRO artista no recibe nada y no puede abrir la ficha, avisar otra vez no
  duplica, al asignar producción le llega con el estado ya actualizado, quien viaja lo recibe y abre
  su ficha, y el estado va cambiando de fase en fase.


- ⚠️⚠️ **«MIS PETICIONES» SE CALCULABA PERO NO SE PINTABA EN NINGUNA PANTALLA** (sep 2026, lo pidió
  Dani). `_home_my_peticiones` existía y alimentaba las TAREAS de Inicio, pero no había módulo de
  **seguimiento**: no se podía ver cómo iban las tuyas sin buscarlas en la bandeja de Contratación
  —que además no todo el mundo puede abrir—. Ahora hay **`_home_my_peticiones.html`** en Inicio, con
  su número, el estado de cada una y, si hay un rechazo pendiente de comunicar, sus dos botones en la
  propia fila.
  ⚠️⚠️ **Y A DIRECCIÓN SE LE VACIABA**: el contexto ponía `[] if _dir else _mypet` porque a dirección
  se le enseña el cuadro de mando en vez de las tareas de cada uno — pero las peticiones que ha hecho
  ÉL son suyas, así que era justo quien no las veía nunca.

- ⚠️⚠️ **EL BLOQUE «PETICIONES» EN LA PANTALLA DE ACTIVIDADES** (sep 2026, lo pidió Dani): si has
  pedido alguna y **sigue esperando**, sale arriba del listado con **el número** y todas las que
  están pendientes de convertirse en actividad o de que se rechacen. Es donde se miran las
  actividades, así que es donde se echan en falta las que todavía no lo son.
  · Punto único **`_my_open_peticiones`**: la MISMA consulta que «Mis peticiones» de Inicio, filtrada
  por `BOOKING_OPEN_STATUSES` (NUEVA · EN_TRAMITE). Así las dos pantallas no pueden decir cosas
  distintas.

- ⚠️⚠️⚠️ **UNA PETICIÓN APROBADA «DESAPARECÍA»: NI SE BORRA NI SE VE** (bug real, sep 2026 — «tenía
  dos peticiones de Cadena 100 que me acababa de aprobar contratación y me han desaparecido»).
  No se borraba nada: **dejaba de ser reconocible**. La cadena era ésta:
  · al aprobarla pasa a `CONVERTIDA` y **`_home_my_peticiones` la excluye a propósito** (ya no es
    seguimiento, es trabajo: está en «Mis tareas pendientes»);
  · en las tareas salía con el **nombre del ARTISTA** como título, no con el asunto — así que **dos
    peticiones del mismo artista se veían como DOS FILAS IDÉNTICAS** («DePol · Configurar el
    evento»), sin decir cuál era cuál;
  · y se etiquetaba como **«Actividad»** aunque la actividad **todavía no existe** (el `kind`
    `PETICION` estaba en el catálogo pero no se usaba: faltaba `is_request` en la fila);
  · el bloque «Peticiones» de la pantalla de Actividades filtraba solo por estado abierto, así que
    tampoco las cogía.
  Resultado: justo cuando hay algo que hacer con ella, se caía de los tres sitios donde se la busca.
  · **Arreglo**: en la fila sin configurar, el **título es el asunto** (lo único que distingue dos
  peticiones del mismo artista; el artista se sigue viendo con su foto en su sitio) y se marca
  **`is_request: True`**, así que sale como **«Petición»**. Y `_my_open_peticiones` incluye ahora las
  **aprobadas a las que les falta configurarlas** (`concert_id` vacío), que es literalmente
  «pendiente de convertirse en actividad» — con `incluir_por_configurar` en el punto único, para no
  tocar el módulo de Inicio.
  ⚠️ Probado con la app real: antes no salían **ni en Inicio, ni en Actividades, ni en la bandeja**;
  ahora Inicio dice «Petición · \<asunto\> … Configurar el evento» y Actividades las cuenta.

- ⚠️⚠️⚠️ **CUÁNDO UNA PETICIÓN SIGUE SIENDO UNA PETICIÓN: UNA SOLA REGLA, EN UN SOLO SITIO** (sep
  2026, lo pidió Dani: «tiene que aparecer siempre lo mismo»). El módulo de Inicio y el bloque
  «Peticiones» de la pantalla de Actividades tenían **cada uno su filtro**, así que decían cosas
  distintas: una petición **aprobada y sin configurar** salía en uno y no en el otro.
  · Ahora los dos salen de **`_home_my_peticiones`** (`_my_open_peticiones` es literalmente una
  llamada a ella, sin filtro propio), y la regla es una: **una petición sigue en la lista hasta que
  se CONFIGURA la actividad** (`concert_id` → ya es una actividad más y sale) **o hasta que se
  rechaza DEL TODO** (descartada **y** comunicado el rechazo). Que contratación la haya **aprobado
  no la saca**: aprobar no crea nada, y mientras no esté configurada sigue pendiente.
  · **Aprobada pero sin configurar** se DICE («Aprobada · falta configurarla», en ámbar) y la fila
  lleva el botón que lo resuelve — el asistente de siempre, ya cumplimentado. Donde se la busca es
  desde donde se cierra.
  ⚠️ El filtro va en la **CONSULTA**, no en Python después: filtrando sobre las 60 últimas, a quien
  tuviera muchas ya configuradas se le perdían las que sí seguían pendientes.
  ⚠️ Probado con la app real, el ciclo entero: pedida → **sale en los dos** · aprobada → **sale en los
  dos** («falta configurarla») · configurada → **sale de los dos** · rechazada sin comunicar → sale en
  los dos · rechazada del todo → sale de los dos. Y el número de los dos módulos coincide siempre.

- ⚠️⚠️ **EL INICIO DE CONTRATACIÓN: TAREAS, PETICIONES Y FACTURAS POR COBRAR** (sep 2026, lo pidió
  Dani). La pestaña «Peticiones» es ahora el **INICIO** del departamento y enseña, en este orden:
  1. **Tareas pendientes de contratación** — TODAS juntas, no las de una pestaña: el motor de
     siempre (`_contracting_tasks_data`) llena además un cajón **`inicio`** con cada actividad UNA
     vez. Se pinta con el parcial de siempre: `{% with contracting_tab = 'inicio' %}`.
  2. **Peticiones** — lo que ya había en esta pantalla (con sus filtros de estado).
  3. **Facturas pendientes de cobrar** (`templates/_contracting_billing_due.html`) — sale de
     `CONTRACTING_TASKS['facturacion']` quedándose con las de tipo **COLLECT**, así que es
     exactamente lo mismo que dice la pestaña de Facturación (mismo motor, sin otra consulta), y
     cada fila lleva al plan de facturación y cobro de SU actividad.
  ⚠️ **Y se han quitado de Conciertos** (`concerts_vista.html` y `concerts.html`), que es lo que
  pidió Dani. Siguen saliendo en Giras compradas, Festivales / Ciclos, Eventos y Otras actividades:
  ahí son las de ESA pestaña.
  ⚠️ **La CLAVE y el PERMISO de la pestaña no cambian** (`peticiones` / `contratacion.peticiones`):
  solo cambian su rótulo y su icono. Renombrar la clave habría dejado sin pestaña a quien ya la
  tiene concedida, y el número de la pestaña sigue siendo el de las peticiones abiertas.
