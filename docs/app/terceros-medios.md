# Terceros, artistas y medios

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- UNA EMISORA DE RADIO ES UN MEDIO (las del reporte de radios se volcaron a Medios)
- LAS ETIQUETAS DE UN TERCERO al crearlo (el clic que no marcaba nada)
- EL NICK SE PUEDE REPETIR, y quien salga dos veces se distingue por su NOMBRE COMPLETO

- Vinculaciones entre entidades (ThirdPartyLink + templates/_entity_links_panel.html +
- AL FUSIONAR, LAS VINCULACIONES DE LOS DOS CHOCAN ENTRE SÍ (el UNIQUE que tumbaba la fusión)
- TELÉFONOS · EL PREFIJO DEL PAÍS SE PONE AL GUARDAR. Un teléfono escrito
- IMPORTAR TERCEROS DESDE UN FICHERO. Botón «Añadir desde fichero» en
- EL BUSCADOR DE TERCEROS BUSCA POR CUALQUIER DATO Y POR PALABRAS. El listado de
- ETIQUETAS «MÚSICOS» y «TÉCNICOS / OPERADORES» en Terceros
- CREAR UN TERCERO · «RELLENAR MÁS CAMPOS», desde cualquier parte de la app
- FICHA DEL TERCERO · el formulario por VIÑETAS y los datos de contacto CRUZADOS
- Migraciones en local
- ALTA / ACTUALIZACIÓN de un tercero por ENLACE PÚBLICO (/alta/<token>): en Terceros, botón
- PromoterCompany NO TIENE COLUMNA name (bug real, sep 2026): su nombre es legal_name
- AL FUSIONAR DOS FICHAS, LOS DOCUMENTOS NO SE PIERDEN (y lo que tienen las dos se pregunta)
- EL CÓDIGO IPI SOLO SE LE PIDE A UN AUTOR (autor, compositor o arreglista)

---

- ⚠️⚠️ **UNA EMISORA DE RADIO ES UN MEDIO** (sep 2026): las emisoras del reporte de radios se
  volcaron a Medios y **todo medio marcado como Radio** entra en las tocadas. En Medios hay ahora
  su bloque de **FICHAS REPETIDAS** con «Fusionarlas» y «No son el mismo» (`MediaNotDuplicate`), y
  la fusión **no pierde el histórico de radio** (el motor re-apunta también las tocadas).
  ⚠️ Ahí el **correo NO vale como criterio** de duplicado: las seis emisoras de Prisa comparten el
  mismo buzón y saldrían quince parejas falsas. Detalle en `docs/app/promocion-prensa.md`.
  · Un medio de tipo Radio tiene además su módulo de **contactos para las presentaciones a radio**
  (`MediaContact.radio_pitch`), aparte del de notas de prensa.

## LAS ETIQUETAS DE UN TERCERO al crearlo (el clic que no marcaba nada)

Al dar de alta un tercero, «**Rellenar más campos**» abre los módulos con todo lo demás
(`templates/_promoter_extra_fields.html`): etiquetas, alta y PRL, banco, viaje… Nacen ocultos **y
deshabilitados** (un campo oculto se envía igual, y sus centinelas guardarían un vacío).

⚠️⚠️ **LAS ETIQUETAS NO SE PODÍAN MARCAR** (bug real, sep 2026, lo vio Dani). `quick_create.js`
abría esa caja con `closest('[data-qc-more-open]')` + `preventDefault()` y **marcaba el estado de la
caja con ESE MISMO atributo**, así que a partir de ahí **cualquier clic dentro** encontraba el
atributo en un ancestro y se llevaba el `preventDefault()`: los checkboxes y los radios no cambiaban
y no había ningún error que mirar. La marca de estado se llama ahora **`data-qc-more-shown`** y el
handler exige `button[data-qc-more-open]`. → el detalle, en `CLAUDE.md`.
⚠️ Comprobado de punta a punta: se marcan y **viajan en el formulario** (`assoc_tags[]`,
`roles_manual[]`, con su centinela `assoc_present`).


## EL NICK SE PUEDE REPETIR, y quien salga dos veces se distingue por su NOMBRE COMPLETO

⚠️⚠️ **DOS PERSONAS PUEDEN LLAMARSE IGUAL** (sep 2026, lo pidió Dani). `Promoter.nick` nació
**UNIQUE**, y eso no es lo que es un nick: es **como llamamos nosotros** a esa persona o empresa, no
un identificador. Con la restricción puesta:
· ponerle a una ficha el nombre que ya tenía otra reventaba al guardar —en la ficha salía un
  **«Error actualizando: duplicate key value violates unique constraint "promoters_nick_key"»**—;
· y las altas automáticas (un fichero, un enlace público, un espejo) tenían que inventarse un
  **«Juan Pérez (2)»** que ensucia el nombre y no aclara nada.

· **Se suelta el UNIQUE** en el modelo y, en la base que ya existe, en
  `ensure_third_party_and_contract_sheet_schema`: un `DO $$` que **busca la restricción por el
  catálogo** (`pg_constraint` / `pg_index` por la COLUMNA, no por el nombre `promoters_nick_key`,
  que es solo el que pone Postgres por defecto) y la suelta. Se ejecuta en cada arranque y no hace
  nada cuando ya no queda ninguna (⚠️ `_ddl_already_applied` no da nunca por hecho un `DO $$`).
  ⚠️⚠️ **NI UN `%` EN ESE SQL** (lo cazó la prueba): las sentencias van por `exec_driver_sql`, así
  que psycopg2 lee cualquier `%` como un parámetro SUYO —un `format('%I', …)` o un `LIKE '%(nick)%'`
  hacen que la sentencia entera falle con «immutabledict is not a sequence»—. Y eso sale como un
  **aviso en el log y a otra cosa**: el UNIQUE se habría quedado puesto sin que nadie se enterara.
  Por eso `quote_ident(...)` y las columnas miradas por catálogo.
· **`_intake_promoter_nick`** (antes `_intake_unique_nick`) deja el nick **tal cual**. Solo numera
  los nicks GENÉRICOS que pone la propia app cuando la ficha entra sin nombre
  (`PROMOTER_PLACEHOLDER_NICKS`: «Tercero sin nombre», «Contacto»…): esos no dicen quién es nadie y
  cinco iguales no se distinguirían ni en su propia ficha.
· **Avisar sigue estando**: el alta rápida no ha dejado de proponer las fichas que ya existen
  (mismo nick, nombre parecido, mismo DNI / correo / teléfono) — lo que cambia es que ahora
  **«Crear igualmente» funciona** en vez de reventar. Y al **editar**, si el nick queda como el de
  otra ficha se dice en un aviso, pero **se guarda**.
  ⚠️ El alta rápida ofrece **TODOS** los que ya se llaman así, no solo el primero: quedarse con uno
  escondía justo la ficha que se estaba buscando.

⚠️⚠️ **Y QUIEN SALGA DOS VECES SE DISTINGUE POR SU NOMBRE COMPLETO**: en una lista para ELEGIR, dos
filas idénticas no se pueden elegir. Punto único **`_promoter_pick_disambiguate(rows)`**: cuenta los
nicks de ESA lista (no de la base entera: si de dos tocayos solo sale uno, no hay nada que aclarar)
y a los repetidos les pone una **segunda fila** (`sub`). Manda **lo que ya se enseña de esa ficha**:
su **vinculación** → su **sociedad** → y, si no tiene ninguna de las dos, su **nombre completo**
(y de ahí a razón social / correo / teléfono / CIF, porque callarse dejaría el problema como estaba).
Lo usan el **buscador de terceros de toda la app** (`api_search_promoters`), el **aviso de «ya existe
algo parecido»** del alta rápida y el **buscador de la fusión** —donde elegir mal no se puede
deshacer—, así que los tres enseñan lo mismo.
· En el navegador, la segunda fila la pinta ya la lista propia de `initTypeahead` (`.ta-item__s`), y
  para los **select2** está el punto único **`window.app33Select2Option(d)`** (en `typeahead.js`).
  ⚠️⚠️ Y el typeahead **usa la lista propia en cuanto alguna fila trae `sub`**, aunque nadie tenga
  foto: un `<datalist>` nativo solo pinta UNA línea por opción, así que ahí los dos «Antonio» salían
  como dos opciones idénticas —exactamente lo que la segunda fila viene a resolver—. Es la misma
  razón por la que la imagen obliga a la lista propia.
· ⚠️ Donde ya se pintaba la vinculación (invitaciones, contactos de medios, integrantes) el `sub`
  **no se repite**: `sub` PUEDE SER esa misma vinculación.

⚠️ Probado con la app real, reproduciendo el UNIQUE viejo: antes, guardar el segundo «Juan» falla
con `UniqueViolation`; después de pasar el `ensure_*`, los dos entran. Y en el navegador: el buscador
pone el nombre completo **solo** en los homónimos, el alta ofrece los tres «Antonio» con su nombre
debajo y «Crear igualmente» funciona, y editar la ficha con un nick ya usado guarda y avisa.

- **Vinculaciones entre entidades** (`ThirdPartyLink` + `templates/_entity_links_panel.html` +
  `static/js/entity_links.js`): relacionan un tercero/artista/medio/recinto/ticketera/editorial con
  otra entidad indicando **la relación** (texto, p. ej. "director de la radio", "novia del artista").
  Son **bidireccionales**: aparecen en la ficha de ambas partes. Tipos en `APP33_ENTITY_LINK_TYPES`;
  payload/búsqueda en `_entity_link_payload`/`api_entity_link_search`; el resumen para invitaciones/
  correo lo da `_promoter_link_summary(_text)` (lleva la relación por delante). Para añadir el panel a
  una ficha: pasar `entity_links=_entity_link_rows(s, '<tipo>', id)`, `entity_link_context`,
  `entity_link_types=APP33_ENTITY_LINK_TYPES`, `entity_links_can_edit` e `{% include
  '_entity_links_panel.html' %}`. El modal (elegir tipo → buscar con foto → crear rápido → relación)
  lo maneja `entity_links.js` (genérico para `[data-entity-link-form]`; con `data-link-ajax` guarda
  sin salir, p. ej. en invitaciones).
- ⚠️ **SE PUEDE VINCULAR AL CREAR EL TERCERO** (sep 2026, lo pidió Dani). El «Rellenar más campos»
  del alta gana el módulo **Vinculaciones**: se elige el tipo (los mismos botones con icono del
  modal «Vincular» de una ficha), se busca (`/api/vinculaciones/search`) y **un clic añade** a la
  lista, donde se le escribe su relación; la X lo quita y el que ya está sale marcado «Añadido» sin
  poder repetirse.
  ⚠️⚠️ **El tercero todavía NO EXISTE**, así que aquí no se puede llamar a `entity_link_create`: lo
  elegido viaja con el formulario en **filas paralelas** (`link_type[]` / `link_id[]` /
  `link_relation[]`, en ese orden porque el DOM manda el orden de envío) y las crea
  `_promoter_apply_extra_form` en cuanto el tercero tiene id.
  · **Punto único `_entity_link_upsert(session_db, …)`**, extraído de `entity_link_create` (que
  ahora lo llama): la orientación canónica y la búsqueda del par en los dos sentidos están en UN
  sitio, así que una vinculación puesta al crear queda igual que si se pusiera después. No hace
  commit (lo hace quien llama).
  ⚠️ Una vinculación que falle (un id que ya no está) **no puede tumbar el alta**: se anota en el
  log y se sigue.
  ⚠️ El buscador y los botones de tipo van **sin `name`** (si no, se enviarían con el alta), y el
  **Intro** del buscador vuelve a buscar en vez de enviar el formulario.
  ⚠️ `entity_link_types` es ahora un **global** (`inject_globals`): el módulo se pinta también en el
  alta rápida, que vive en `layout.html` y por tanto en cualquier pantalla. La vista que lo pasa
  explícitamente (el panel de una ficha) sigue mandando, y es el mismo valor.
  · La lógica está en `static/js/entity_links.js` (`[data-entity-link-picker]`, hermano del modal de
  siempre) y se limpia sola al reabrir el modal (escucha el `reset` del formulario: `form.reset()`
  no borra las filas que se añaden a mano).
  Probado con la app real por los DOS caminos (el alta rápida de cualquier pantalla y el «Nuevo
  tercero» de Terceros): las vinculaciones quedan en la BD con su relación y se ven en la ficha.

- **TELÉFONOS · EL PREFIJO DEL PAÍS SE PONE AL GUARDAR** (ago 2026). Un teléfono escrito
  «600111222» no vale para mandar nada (a una pasarela de SMS —o a WhatsApp— hay que darle el
  número internacional), y uno que llega «34600111222» —así los manda **Enterticket**— tampoco,
  porque le falta el «+». Pedirle a cada pantalla que se acuerde no funciona (hay veinte
  formularios con un campo de teléfono), así que se hace en UN sitio: **al guardar**.
  · **`_phones_before_flush`** (listener `before_flush` de `SessionLocal`) recorre lo que se está
  escribiendo y deja los campos de teléfono en formato internacional con
  **`sms_utils.normalize_phone`**, el punto único de «cómo se escribe un teléfono». Los campos de
  cada modelo están en **`_PHONE_TEXT_FIELDS`** (y `_PHONE_LIST_FIELDS` para los móviles del
  personal, que son una lista JSONB): **un campo de teléfono nuevo hay que añadirlo ahí**.
  ⚠️ **Nunca se pierde lo que escribió una persona**: si el valor no es un teléfono creíble (dos
  números en el mismo campo, una extensión, «pendiente»…) se queda TAL CUAL. Normalizar es para
  poder usarlo, no para borrar información.
  ⚠️ **Los INSERT «a pelo» (Core) NO pasan por el listener**: el único que hay es el alta de
  compradores de Enterticket (`_et_recompute_buyers_for_event`), que normaliza el teléfono él mismo.
  Si se añade otro `insert()` de Core con un teléfono, hay que llamar a `_normalize_phone_value`.
  ⚠️ `normalize_phone` reconoce ahora también los **fijos** (9 dígitos que empiezan por 8 o 9):
  antes un «912345678» salía como «+912345678», un prefijo de otro país. Y quita los decimales que
  deja Excel («638123456.0»).
  · **Relleno puntual** `_phones_normalize_backfill` (marca `phones_e164_backfill_v1`, corre una vez
  en el arranque): pone el prefijo a lo que ya estaba guardado, tabla por tabla y con un CURSOR por
  `id` —no con LIMIT a secas, porque los números que no se pueden normalizar volverían a salir en la
  misma tanda eternamente—.

- **IMPORTAR TERCEROS DESDE UN FICHERO** (ago 2026). Botón **«Añadir desde fichero»** en
  Bases de datos → Terceros: se arrastra (o se elige) un **Excel (.xlsx) o un CSV** y se dan de alta
  en bloque.
  · **Motor puro `promoter_import.py`** (ni Flask ni BD): lee el fichero y **reconoce sus columnas**
  (`FIELDS` con alias por campo, `guess_field`, `normalize_value`, `apply_mapping`). La cabecera
  **no tiene que estar en la primera fila** (`_header_index`) y solo se lee la **primera hoja**.
  ⚠️ Los rótulos se casan con **puntuación permitida entre las letras** (`_alias_re`): sin eso
  «N.º de C.I.F.» no se reconocía (al normalizar queda «n o de c i f»); y hace falta el límite de
  palabra por la izquierda para que el «nie» de «conveniente» no pase por un NIE.
  ⚠️ Un CSV exportado de Excel trae los números **con decimales**: un teléfono llegaba como
  «638123456.0» y un CP como «41001.0» (los dos bugs salieron en la primera prueba).
  · **Lo que no se reconoce NO se calla**: la columna se devuelve sin campo y la pantalla pregunta a
  qué campo va, deja **guardarla como «dato extra»** con el nombre de la columna, o dejarla fuera.
  · ⚠️⚠️⚠️ **UN CORREO Y UN TELÉFONO VAN SIEMPRE A SU CAMPO, LOS DIGA COMO LOS DIGA LA COLUMNA**
  (sep 2026, lo pidió Dani: «algunas importaciones han puesto el domicilio como correo; esto está
  mal, un email y un teléfono lo tiene que detectar siempre y configurarlo en su campo correcto»).
  El **rótulo** se equivoca —«Dirección de correo» se leía como el DOMICILIO— pero **el valor no
  miente**: `place_by_content` (en `promoter_import`, al final de `apply_mapping`) recoloca cada
  dato por lo que ES (`looks_like_email` · `looks_like_phone` · `email_inside`).
    · El valor **entero** es un correo (o un teléfono) → se **MUEVE** a su campo y el de origen se
      vacía; si el destino ya tenía algo distinto, el valor se guarda como **dato extra** (no se
      pisa ni se pierde).
    · El texto **contiene** un correo («Calle Luna 7 · juan@x.com») → el correo se **COPIA** y la
      dirección se queda como está: romper un domicilio sería peor que dejarlo.
    ⚠️ El teléfono se reconoce por **9 a 15 dígitos** (con el `+` del país): así un **código postal**
    (5), un **DNI/CIF** (llevan letra) y un **IBAN** no se confunden con uno.
  · ⚠️⚠️ **Y LO QUE YA ESTABA GUARDADO SE ARREGLA SOLO** («aplícalo a todo lo existente»):
  **`_repair_contact_fields`** corre **una vez por arranque**, en segundo plano (detrás de la siembra
  de accesos) y es **idempotente**. Mueve a su campo los correos y teléfonos que quedaron en el
  domicilio, la dirección fiscal o las notas de viaje/hotel —y en una lista de invitados, el correo
  metido en el teléfono—, **solo cuando el destino está vacío** y el valor es inequívoco. Mientras
  el correo esté en el domicilio, esa persona sale como «sin correo» y no se le puede mandar nada.
  · **Cuatro pasos** (`_promoter_import_modal.html` + `static/js/promoter_import.js`, clases `.pi-*`):
  fichero → columnas → **resumen (nuevos / ya existían)** → los que ya existían **uno a uno en
  PANTALLA PARTIDA**, eligiendo en cada campo qué se queda. El fichero se lee UNA vez
  (`promoters_import_analyze`) y el resto va en JSON (`promoters_import_prepare` /
  `promoters_import_create` / `promoters_import_merge`), así no hay que volver a subirlo.
  · **Quién ya está** (`_promoter_import_match`): manda el **DNI/NIF** (también el de sus sociedades,
  `PromoterCompany.tax_id`), luego el nick exacto y por último nombre y apellidos. El nick de alta
  sale del fichero, del nombre completo o del DNI (`_promoter_import_nick` + `_intake_promoter_nick`;
  el nick **se puede repetir**, ver abajo). Cada alta va en su **savepoint**: una que falle no tumba
  las demás.
  · **CONSERVAR LOS DOS** (el caso de Dani: una persona con dos direcciones): modelo nuevo
  **`PromoterAltValue`** (`field`, `label`, `value`) — uno se queda en la ficha y el otro se guarda
  con su **nombre** («casa de Madrid» / «casa de Cádiz»), y se puede nombrar también el de la ficha
  (sale marcado como **principal** en «Otros datos» de la ficha del tercero, `_promoter_alt_value_rows`).
  ⚠️ El que NO se queda en la ficha se guarda **siempre**, con un nombre por defecto si no se le pone
  ninguno: la idea es no perder nada. Los **correos** van a `PromoterEmail` (con `concept` = el
  nombre), que es donde los busca el resto de la app — no se duplica una tabla que ya existía.
  · **LAS COINCIDENCIAS SE REVISAN UNA A UNA** (ago 2026): el resumen dice cuántos terceros trae el
  fichero y cuántas coincidencias hay, y **no se puede «Terminar» dejándolas a medias** (el botón se
  queda en «Faltan N por revisar» y cerrar el modal avisa). Se llevan en `state.reviewed` (por fila);
  cuenta como revisada tanto guardar como **«Dejar lo que tenemos»**, y al crear los nuevos se entra
  directo a la revisión, empezando por la primera SIN resolver.
  · **«ES OTRO DIFERENTE»** (mismo nombre, o un DNI mal escrito): en la pantalla partida hay siempre
  esa salida, que **no fusiona nada** y da de alta un tercero NUEVO con lo que trae el fichero
  (reutiliza `promoters_import_create` con esa única fila); el que ya estaba se queda como está.
- ⚠️⚠️ **EL BUSCADOR DE TERCEROS BUSCA POR CUALQUIER DATO Y POR PALABRAS** (sep 2026). El listado de
  Terceros filtra **en el navegador** contra `data-promoter-search`, y ahí solo iban el **nick**, el
  correo, el CIF y el teléfono: buscar por **parte del nombre o del apellido** no encontraba nada en
  cuanto el nick era otra cosa (el nombre de la empresa, un apodo).
  · Punto único **`_promoter_search_blobs(session_db, promoters)`**: nombre y apellidos, razón
  social, DNI/CIF (**y sin puntuación**, `12.345.678-A` → `12345678a`, para que valga escrito de las
  dos formas), correo y teléfono, el domicilio y la dirección fiscal, sus **SOCIEDADES**, y los
  **correos y teléfonos de su pestaña de contacto con su concepto**. En BLOQUE (una consulta por
  tabla, no una por tercero) y colgado de cada tercero como `search_blob`, igual que `display_tags`.
  ⚠️ Se emite **YA NORMALIZADO** (`_norm_text_key`, el espejo exacto de `normalizeSearchText`):
  normalizar un texto largo por fila y en cada tecla, con cientos de terceros, es trabajo tonto.
  ⚠️ **Se busca por PALABRAS** (cada palabra tiene que aparecer en algún dato, no hace falta que esté
  completa ni en ese orden), como el buscador del servidor (`_promoter_search_clause`): así «perez
  juan» encuentra a «Juan Pérez Gómez». Antes se exigía que TODO lo escrito apareciera seguido.
  ⚠️ El **IBAN no se pone** a propósito: en un listado no hace falta y no tiene por qué viajar al HTML.

- **ETIQUETAS «MÚSICOS», «TÉCNICOS / OPERADORES» y «PROVEEDORES» en Terceros** (sep 2026): tres
  categorías más de `PROMOTER_MANUAL_ROLES`, que se marcan **a mano** en la ficha (o al crear el
  tercero) y de ahí salen su **etiqueta** en el listado y su **filtro**.
  ⚠️ **Proveedores NO se deduce de los gastos** a propósito: que alguien nos haya facturado una vez
  no lo convierte en proveedor nuestro — eso lo dice una persona.
  ⚠️ Estas dos **no se deducen de nada** (no hay actividad ni obra de la que sacarlas), al contrario
  que Promotores / Autores / Beneficiarios.
  ⚠️ El listado pinta ya **cualquier** categoría marcada a mano con la etiqueta de su catálogo
  (`PROMOTER_ROLE_LABELS`), así que **una nueva sale sola** en las filas y en los filtros sin tocar
  esa pantalla. La ficha y la importación ya iteraban el catálogo.
  ⚠️ Lo que mira una clave CONCRETA se queda como estaba: los destinatarios «Promotores» de una nota
  de prensa siguen exigiendo `"PROMOTER" in manual` (si no, un músico saldría ahí).

- ⚠️⚠️ **CREAR UN TERCERO · «RELLENAR MÁS CAMPOS», desde cualquier parte de la app** (sep 2026). Al
  dar de alta un tercero se pedía lo justo, así que había que **entrar después en su ficha** para
  completarlo. Ahora el alta tiene un botón que abre, **uno debajo de otro y por módulos**, TODO lo
  demás: **Dirección** · **Etiquetas** (asociaciones + categorías, incluidas Músicos y Técnicos /
  Operadores) · **Alta y PRL** · **Cuenta bancaria** · **Sociedad con la que factura** · **Viaje y
  hoteles** · **¿Cómo prefiere que le avisemos?**.
  · **UN SOLO SITIO para las dos altas**: parcial **`templates/_promoter_extra_fields.html`** (con
  `pe_fiscal` / `pe_address` según lo que ya pida el formulario que lo incluye) y punto único
  **`_promoter_apply_extra_form(session_db, p, form)`**, que usan **el alta rápida de cualquier
  pantalla** (`api_create_promoter`, el modal de `layout.html`) **y** el «Nuevo tercero» de Terceros.
  Un tercero creado por un camino o por el otro queda exactamente igual.
  ⚠️⚠️ **NADA ES OBLIGATORIO**: lo que llegue vacío **no se escribe**, así que un alta rápida sigue
  siendo rápida. Los nombres de los campos son **los mismos que en la ficha**, así que los leen los
  helpers de siempre (`_tags_from_form`, `_parse_travel_prefs_form`, `_apply_fiscal_address`) y con
  sus **CENTINELAS** (`assoc_present`, `travel_prefs_present`).
  ⚠️⚠️ Los módulos nacen **ocultos Y DESHABILITADOS** (`mas()` en `quick_create.js`, por selector y
  no al abrir el modal, porque el «Nuevo tercero» de Terceros **no es un `.qc-form`**): un campo
  oculto **se envía igual**, y esos dos centinelas harían que se guardara un vacío como si se hubiera
  dicho. Al abrir el modal se vuelven a plegar.
  ⚠️ Si lo que se escribió y no se envió **se repone** (`form_autosave.js` avisa con un `input` por
  campo), la caja **se abre sola**: si no, esos datos volverían escondidos y deshabilitados y se
  perderían al guardar otra vez.
  ⚠️ **SIN `id=` en ningún campo del parcial**: en Terceros hay **DOS copias en el DOM** (la del
  modal global de alta rápida y la del «Nuevo tercero»), y unos ids repetidos se pisarían.
  ⚠️ El **correo y el teléfono** pasan a un módulo COMÚN del alta rápida: estaban solo en el panel de
  «particular», así que **una EMPRESA se creaba sin poder ponerle ni correo ni teléfono**. No se
  pueden dejar en los dos paneles: los dos viajan en el formulario y el servidor lee el primero.
  ⚠️ El **IBAN** se normaliza (mayúsculas, un espacio) y el **BIC** sin espacios; que el IBAN cuadre
  ya lo comprueba la remesa (`sepa_check_payment`), que es donde importa.
  ⚠️ Los **DOCUMENTOS de PRL** (el recibo de autónomos, el alta, el ITA, la formación) no se suben
  aquí: se le piden con su enlace desde la pestaña «Alta y PRL» de su ficha. Aquí solo se dice **cómo
  va** (`prl_type`).
  ⚠️ Los catálogos que necesitan los módulos (`PRL_WORKER_TYPES`, `NOTIFY_CHANNELS`) se inyectan en
  `inject_globals`: el parcial se pinta en **cualquier** pantalla y son constantes (ninguna consulta).

- ⚠️⚠️ **EL REPRESENTANTE DE LA FICHA DE CONTRATACIÓN CAE EN SU PERSONA DE CONTACTO** (bug real,
  sep 2026: «en el evento de Cadena 100 no aparece el contacto de Ignacio»). La ficha solo reconocía
  como representante a **OTRO TERCERO vinculado** con la relación «Representante»
  (`_promoter_representatives`), y lo normal es dar de alta a esa persona como **PERSONA DE CONTACTO**
  en la ficha del tercero —que es justo lo que ofrece esa pestaña—: así que la ficha de contratación
  salía **vacía de contacto** aunque su persona estuviera puesta.
  · Punto único **`_promoter_contact_representative(session_db, promoter)`**: a falta de tercero
  vinculado, la persona de contacto cuyo **CARGO** lo diga («Representante», «Apoderado»,
  «Dirección», «Gerente») y, si ninguna lo dice, la **primera con la que se pueda contactar** (correo
  o teléfono) — que es a quien se llama cuando se pregunta por esa empresa.
  ⚠️ El cargo lo escribe una persona: se compara con `_norm_text_key` (sin acentos ni mayúsculas),
  como el resto de textos libres de la casa.
  ⚠️ El **DNI** solo lo trae el tercero vinculado: una persona de contacto no lo tiene, y ese hueco
  se queda vacío en vez de inventarlo.

- ⚠️⚠️ **EL REPRESENTANTE LEGAL SE PONE TAMBIÉN AL EDITAR** (sep 2026). Solo se podía poner **al
  crear** el tercero, así que a uno ya creado no había forma de ponérselo (había que crear el otro
  tercero a mano y vincularlo). Ahora:
  · **Editando**, la viñeta «Representante legal» sale **SIEMPRE** (en una empresa o una institución;
  una persona no tiene representante y el JS la oculta **Y deshabilita sus campos** —oculto se envía
  igual—), con sus datos ya puestos si lo tiene.
  · **Viendo la ficha, solo si lo TIENE** (con enlace a SU ficha, su DNI, su correo y su teléfono):
  una función que no aplica no se pinta. Mismo criterio que «Sociedades vinculadas».
  · **Punto único `_promoter_apply_representative(session_db, empresa, form=None)`**, que usan el
  ALTA rápida y la EDICIÓN: si ya tiene representante **se ACTUALIZA el que hay, no se crea otro**
  (si no, cada guardado dejaba un tercero duplicado más). El nick solo se cambia si era el
  automático («Representante de …»).
  ⚠️ **CENTINELA `rep_present`**: sin él, un guardado de otra pantalla borraría el representante.
  ⚠️ De ahí lo lee la **ficha de contratación** (`company_representative*`), que ya lo enseñaba.

- **FICHA DEL TERCERO · el formulario por VIÑETAS y los datos de contacto CRUZADOS** (ago 2026):
  · **Editar la ficha va por bocadillos** (`.demo-card`, los mismos del formulario de una maqueta),
  cada tipo de dato en el suyo: **¿Quién es?** · **Datos de contacto** · **Dirección** ·
  **Sociedades vinculadas** · **Viaje y hoteles** · **Redes sociales**.
  · **Toda PERSONA tiene NOMBRE y APELLIDOS además del NICK** (`first_name`/`last_name`, que antes
  solo se rellenaban al escanear el DNI): el nick es como la llamamos nosotros. En una **empresa** o
  una **institución** esos dos campos no se piden (su nombre es el nick / el nombre social) y el JS
  los **deshabilita** al ocultarlos (ocultar no basta: se enviarían igual).
  · ⚠️⚠️ **EL EMAIL Y EL TELÉFONO DE LA FICHA SON DATOS DE CONTACTO Y ESTÁN CRUZADOS** con su
  pestaña: no puede haber un tercero con correo y la pestaña de contacto vacía. Punto único
  **`_promoter_sync_contact_rows`** (en los DOS sentidos: de la ficha a la pestaña y, si la ficha no
  tiene, el primero de la pestaña sube a principal), llamado al guardar **y al abrir la ficha** —así
  los terceros de antes quedan al día solos, sin migración—.
  · **Varios correos y varios teléfonos, cada uno con su concepto**: `PromoterEmail` y el nuevo
  **`PromoterPhone`** (hermanos). El principal se ve con su etiqueta; al borrarlo, el que queda pasa a
  ser el de la ficha. `_promoter_phone_numbers` es el punto único de «los teléfonos de este tercero»
  (y `_norm_phone_key` compara números, así «+34 600…» y «600…» no se duplican).
  · **«Emails adicionales» YA NO ESTÁ en Información general**: los correos viven en la pestaña de
  datos de contacto, que es su sitio.
  · **PERSONAS DE CONTACTO** (debajo, en esa misma pestaña): a quién se llama para hablar con ese
  tercero. Pueden **SER otro tercero** (`PromoterContact.link_promoter_id`, buscador Select2 con foto):
  entonces su nombre, correo y teléfono se cogen de su ficha y la tarjeta lleva a ella.
  ⚠️ Con esa columna, `PromoterContact` tiene DOS caminos a `promoters`, así que
  `Promoter.contacts` y `PromoterContact.promoter` necesitan **`foreign_keys`** (si no, la app no
  arranca: `AmbiguousForeignKeysError`).
  · **SOCIEDADES VINCULADAS solo si hay**: en la ficha esa función no se pinta cuando el tercero no
  tiene ninguna; se añaden desde el formulario de editar (donde sale siempre, con el modal apilado).

- ⚠️ **Migraciones en local**: `_bootstrap_schema_bg` (a) corre en un hilo DAEMON al importar `app`
  (muere con el proceso → migraciones a medias) y (b) usa un **cerrojo de fichero** en
  `tempfile.gettempdir()/app33_schema_bootstrap.lock` que la hace salir sin hacer nada si ya existe.
  Para aplicar el esquema en el entorno de prueba hay que **borrar el cerrojo y llamarla en primer
  plano** (ver el kit en la sección de verificación). En Render no afecta: cada deploy trae /tmp limpio.

- **ALTA / ACTUALIZACIÓN de un tercero por ENLACE PÚBLICO** (`/alta/<token>`): en Terceros, botón
  **«Link de alta»**; en los 3 puntitos de cada fila y en su ficha, **«Solicitar actualización»**.
  Modelo `ThirdPartyIntakeLink` (token, `promoter_id` NULL = alta nueva, `kind` ALTA|UPDATE, `status`
  ACTIVE|DONE|CANCELLED, quién lo pidió, por dónde se mandó, `data` de lo recibido) +
  `ensure_third_party_intake_schema`. Modal reutilizable `_intake_share_modal.html` (Correo desde el
  servidor con `_intake_email_html` —cabecera `img/Banner.png` + título + «X ha solicitado…» + botón—,
  WhatsApp, SMS y copiar; `promoter_intake_link_create` **reutiliza** el enlace ACTIVO del tercero).
  Sin foto ni logo (un alta nueva no sabe aún quién es) la miniatura es el **símbolo de «sin foto»**
  (`img/placeholder_photo.png`), NO el logo de la casa.
  Página pública `public_third_party_intake.html`: **standalone a propósito** (layout.html no tiene
  `{% block %}` en el `<head>` y hacen falta las `og:` para la miniatura de WhatsApp; la imagen la
  sirve `public_intake_og_image` a 1200×630 desde nuestro dominio con `_og_image_jpeg_bytes`).
  Pasos con `step_wizard.js`, al que se le añadió **`data-sw-when`** (paso condicional) +
  `data-sw-mode` en el contenedor + `root.swRefresh()`: los pasos que no tocan se saltan, no cuentan
  en la barra y **se deshabilitan sus inputs** (si no, el navegador se para a validar un `required`
  oculto). Empresa→CIF / Particular→DNI; el paso 1 comprueba con `public_intake_identify`
  (`_prl_norm_dni` contra `Promoter.tax_id` y `PromoterCompany.tax_id`) y si ya existe ofrece
  actualizar **con los datos ENMASCARADOS** (`_mask_value`) salvo que sea su propio enlace.
  Cada documento se sube en su hueco con `public_intake_upload` (`slot`) y solo viaja la URL; del
  **certificado de titularidad** se lee el IBAN con pypdf + `_detect_iban_in_text` y se valida
  **mod-97** (`_iban_is_valid`) antes de guardarlo en `Promoter.bank_account` (el PDF va a
  `PersonComplianceDoc` `CERT_BANK`). Reutiliza los campos que ya existían de la landing de
  facturación (`fiscal_address`, `bank_account`, `data_consent_at`) y crea `PromoterCompany`,
  `PromoterContact` (función = texto libre), `PersonDocument` DNI/PASSPORT/LICENSE/LOYALTY y los
  `travel_departure_*`. ⚠️ El nick se queda tal cual (`_intake_promoter_nick`): se puede repetir.
  ⚠️ **Los colores de marca los inyectaba solo `layout.html`**: ahora `styles.css` los declara como
  suelo en `:root` (sin eso, cualquier página pública standalone tenía los botones transparentes).
- ⚠️⚠️ **`PromoterCompany` NO TIENE COLUMNA `name`** (bug real, sep 2026): su nombre es **`legal_name`**
  (NOT NULL). Un `order_by(PromoterCompany.name...)` en `promotion_detail_view` reventaba con un
  **AttributeError** → 500 → **página de mantenimiento** justo después de crear una acción de
  marketing: la campaña SÍ se creaba y lo que fallaba era la ficha a la que redirige, así que parecía
  que «no dejaba crearla».


- ⚠️⚠️ **LA BASE DE TERCEROS ES ÚNICA: LAS FUNCIONES SON ETIQUETAS, NO BASES DE DATOS DISTINTAS**
  (sep 2026, lo pidió Dani). Un **medio** que hace de promotor no es otra ficha: es el mismo medio
  haciendo de promotor (para eso está el espejo `_ensure_promoter_for_media`). Lo mismo con un
  **artista**, con una **sala** o con alguien de la **oficina** que va en una hoja de ruta o pide
  entradas. Cuando la misma persona o empresa se da de alta dos veces, su historia se parte: la
  mitad de sus actividades, facturas y documentos cuelgan de una ficha y la otra mitad de la otra
  —y, de propina, un id que se quedó apuntado en una petición **tumbaba el alta de la actividad**
  cuando la ficha desaparecía en una fusión (ver `docs/app/actividades.md`)—.
  · **«FICHAS REPETIDAS», arriba de Terceros** (`_promoter_duplicate_pairs`): **DE DOS EN DOS**,
  diciendo **por qué** lo son, con el botón **«Fusionarlas»**, que abre el modal de fusión de siempre
  **ya en la comparación** (`data-merge-with`, nuevo en `merge_entities.js`) — hacer buscar a mano lo
  que la propia pantalla acaba de decir es trabajo tonto. La fusión es la de siempre: re-apunta TODO
  lo que colgaba del que se descarta.
  ⚠️⚠️ **DE DOS EN DOS, NO EN GRUPOS** (lo pidió Dani): con cinco fichas que comparten un correo, un
  grupo obligaba a fusionarlas todas «cuando a lo mejor solo hay que fusionar dos». Una pareja es
  además lo que compara el modal de fusión. Se enseñan las primeras (lo más concluyente arriba) y se
  DICE cuántas quedan.
  · **El criterio**: mismo **DNI/CIF propio**, mismo **correo** (también los de su pestaña de
  contacto), mismo **teléfono** (normalizado, así «+34 600…» y «600…» son el mismo) o el mismo
  **nombre completo**.
  ⚠️⚠️ **UNA PERSONA NO ES LA EMPRESA A LA QUE ESTÁ VINCULADA** (lo pidió Dani, y era un fallo de la
  primera versión): el **CIF de sus sociedades NO cuenta** —una persona puede facturar por varias— y
  una ficha de **empresa** nunca se empareja con una de **persona**, compartan lo que compartan (el
  correo o el teléfono de una sociedad suele ser el de su dueño). `_promoter_is_company`.
  ⚠️⚠️ **DOS DNI DISTINTOS NUNCA SE EMPAREJAN**, aunque se llamen igual: fusionar a dos personas
  distintas es mucho peor que dejar un duplicado, y no se puede deshacer.
  · **«FICHAS QUE SON ALGUIEN DE LA OFICINA»** (`_promoter_office_duplicates`): terceros que
  coinciden con personal de la casa (por DNI o por nombre), con enlace a las dos fichas y el botón
  **«Es la misma persona»** (`promoters_office_link`).
  ⚠️⚠️ **NO SE FUNDE UNA EN OTRA** (aunque Dani pidiera «la opción de fusionarlas»): un usuario de la
  casa **entra en la app** y un tercero **factura** —de él cuelgan gastos, invitaciones y
  documentos—, así que borrar cualquiera de los dos se llevaría trabajo por delante. Lo que se hace
  es **UNIRLAS**: `Promoter.user_id` dice que son la misma persona, **los huecos de cada ficha se
  rellenan con lo que tenga la otra** (nunca se pisa un dato escrito), dejan de proponerse y se
  pueden **DESHACER** («Fichas unidas a su persona de la oficina»).
  ⚠️ **Con DNI distinto no se unen** y se dice por qué: eso es que no son la misma persona.
  ⚠️ Una persona de la casa solo puede estar unida a UNA ficha de tercero (si ya lo está, se avisa).
  ⚠️ Los usuarios **externos** (`is_external`, el espejo de un tercero que lleva una producción) se
  quedan fuera: ahí las dos fichas son lo normal.
  · **Y NO SE CREAN NUEVOS**: el alta rápida (`api_create_promoter`, el camino por el que se crea un
  tercero desde cualquier pantalla) avisa ahora cuando ese **DNI, correo o teléfono** ya están en la
  base (`_promoter_existing_matches`) y ofrece la ficha que hay. Antes solo miraba **nombres
  parecidos**, que es justo por donde se colaban: «Cadena 100» y «Cadena100 Radio» se creaban las
  dos. Se sigue pudiendo crear si de verdad es otro (`force_new`), como con los nombres parecidos.
  ⚠️ Todo va **en bloque** (una consulta por tabla): con cientos de terceros, una consulta por ficha
  dejaría la pantalla de Terceros inservible.
  ⚠️ Prueba de regresión: **`tools/check_duplicados.py`** (41 comprobaciones con la app real: la
  fusión, sus vinculaciones, el descarte en bloque, la unión con la oficina y sus dos «deshacer»).

- ⚠️⚠️⚠️ **AL FUSIONAR, LAS VINCULACIONES DE LOS DOS CHOCAN ENTRE SÍ** (bug real y gordo, sep 2026,
  lo vio Dani: «**No se pudo fusionar: duplicate key value violates unique constraint
  "uq_third_party_links_direct"**»). `third_party_links` tiene un **UNIQUE por (origen, destino)** y
  dos fichas duplicadas suelen estar vinculadas a **LA MISMA tercera** —por eso son duplicadas—, así
  que el `UPDATE … SET target_id = <el bueno>` en bloque chocaba con la fila que el ganador ya
  tenía: reventaba, y con él **la fusión ENTERA** (no se fusionaba nada, ni lo que no tenía nada que
  ver). Con la fusión automática (`_promoter_merge_into`, el integrante de un artista que ya era
  tercero) era peor: ahí el fallo se **traga en un log** y la ficha se borraba igual, dejando las
  vinculaciones apuntando a una ficha que ya no existe —y una vinculación así **desaparece de las
  dos fichas sin decir nada** (`_entity_link_payload` devuelve `None` y la fila se salta)—.
  · Punto único **`_merge_repoint_entity_links`**: cada vinculación repetida se colapsa en **UNA**
  fila —se queda la que ya era del ganador y se le **completan los huecos** (la relación, la nota)
  con lo que traiga la del perdedor; un dato escrito no se pisa nunca—, y si una de las dos estaba
  activa, la que queda lo está.
  · El par se compara **en los dos sentidos**, que es como lo ve la app (`entity_link_create` da por
  existente el del par al revés): si no, quedaban dos filas espejo diciendo lo mismo.
  ⚠️ **PRIMERO se borran las repetidas y DESPUÉS se mueven las que se quedan**: al revés, el UNIQUE
  salta en el propio `UPDATE` (se comprueba fila a fila, no al cerrar la transacción).
  ⚠️⚠️ **Y LOS TIPOS SON LOS EQUIVALENTES** (`_merge_link_types` → `_entity_link_self_types`):
  tercero, **empresa** e **institución** son la MISMA tabla, así que una vinculación creada como
  «empresa» también es del tercero. Con solo `"promoter"` —lo que decía `MERGE_KINDS`— se quedaba
  apuntando a la ficha borrada y se perdía en silencio.
  ⚠️ Pasa en **todas las categorías** (dos recintos vinculados al mismo tercero reventaban igual), y
  la cuenta del flash («N referencias re-apuntadas») cuenta lo que era del perdedor.
  ⚠️ Probado de punta a punta reproduciendo el fallo: con el código viejo salen los 7 fallos (el
  mismo mensaje que vio Dani) y con el nuevo, las 10 comprobaciones nuevas de
  `tools/check_duplicados.py` en verde.

- ⚠️⚠️ **«NO SON LA MISMA»: LA SALIDA DE UN DUPLICADO QUE NO LO ES** (sep 2026, lo pidió Dani). El
  bloque de fichas repetidas proponía fusionar, y **fusionar no se puede deshacer**: si dos fichas
  se parecían pero eran **dos personas distintas** (el correo de una oficina, el teléfono de una
  casa, dos tocayos), la única salida era comerse el aviso para siempre.
  · Cada pareja lleva ahora **«No son la misma»** (`promoters_duplicate_dismiss`): se apunta en
  **`PromoterNotDuplicate`** y **deja de proponerse**.
  ⚠️⚠️ **Se descarta LA PAREJA, no la ficha**: si mañana aparece una TERCERA que casa con cualquiera
  de las dos, esa pareja nueva **sí** se propone — que es justo lo que pidió Dani.
  · La pareja se guarda **ORDENADA** (`a` < `b`) y es **ÚNICA**, así que (A,B) y (B,A) son la misma
  fila; y si una de las dos fichas se borra o se fusiona, la fila se va con ella (`CASCADE`).
  · **SE PUEDE DESHACER** (`promoters_duplicate_restore`): queda apuntado **quién lo dijo y
  cuándo**, y el endpoint de deshacer sigue ahí.
  ⚠️⚠️ **PERO ESOS DOS ARCHIVOS YA NO SE PINTAN** (sep 2026, lo pidió Dani: «fichas unidas y
  parejas descartadas no se tiene que mostrar, eso ya está hecho y punto»): «Parejas descartadas» y
  «Fichas unidas a su persona de la oficina» eran dos bloques plegados de trabajo **ya resuelto**, y
  esta pantalla es para lo que hay que hacer. Lo decidido sigue valiendo igual (ninguna se vuelve a
  proponer) y tampoco se calculan ya en cada carga. ⚠️ Con ellos se fue **el botón** de deshacer:
  los endpoints siguen vivos, así que reponerlo es pintar el bloque otra vez.
  · ⚠️⚠️ **VARIAS DE UNA VEZ** (sep 2026, lo pidió Dani: «que si no se tarda mucho»): cada pareja
  tiene su **casilla** y se descartan todas las marcadas de golpe («Marcar todas» incluido).
  **Fusionar sigue siendo de una en una** —es irreversible y hay que mirar campo a campo—, pero
  descartar no destruye nada.
  ⚠️ **El bloque entero es UN formulario** (no puede haber `<form>` dentro de otro), así que el botón
  de una sola fila manda **`solo`**: descarta ESA pareja y nada más, aunque haya casillas marcadas —
  pulsar un botón no puede hacer de más.
  ⚠️ Las dos rutas van bajo `/promotores`, así que heredan el permiso de la sección (como la fusión).
  ⚠️ Cubierto por `tools/check_duplicados.py` (41 comprobaciones) y probado en el navegador.


- ⚠️⚠️⚠️ **AL FUSIONAR DOS FICHAS, LOS DOCUMENTOS NO SE PIERDEN** (sep 2026, lo pidió Dani). Lo que
  sube una ficha —su **DNI, carnet, pasaporte, tarjetas de fidelización y matrículas**
  (`PersonDocument`), su **documentación de alta y PRL** (`PersonComplianceDoc`) y lo que se le haya
  **pedido** (`PersonDocRequest`)— **no cuelga de una clave ajena**: es POLIMÓRFICO (`owner_type` +
  `owner_id`). Por eso `_merge_repoint_references` —que recorre las FKs— no lo veía, y al fusionar
  **todo lo que había subido la ficha que desaparecía se quedaba huérfano**: el fichero seguía en
  Storage, pero ya no era de nadie y no había forma de llegar a él. Es exactamente la misma trampa
  que las vinculaciones: sin FK, nadie las movía.
  · Punto único **`_merge_apply_documents`**, que corre **ANTES de borrar la ficha** (después ya no
  hay de dónde moverlos) tanto en la fusión a mano (`_merge_execute_view`) como en la **automática**
  (`_promoter_merge_into`, el integrante de un artista que ya era tercero — ahí no hay a quién
  preguntar, así que se queda el del que sobrevive y **lo demás pasa entero**).
  · ⚠️ **LO QUE TIENEN LOS DOS NO SE DUPLICA: SE PREGUNTA** (`_merge_documents_plan`, que la pantalla
  de fusión enseña antes de fusionar). Qué es «el mismo documento» lo dice **`_merge_doc_key`**: de
  los que **solo se tiene uno** (`PERSON_DOC_SINGLE_KINDS`: DNI, carnet, pasaporte) basta el tipo;
  de los que se pueden tener varios (una tarjeta de fidelización, una matrícula) hace falta además
  **su número** — dos tarjetas de Renfe distintas son dos, la misma es una. Por defecto se queda el
  del que se conserva; cada opción se enseña con su número, su nombre, su caducidad y su imagen,
  para poder reconocerla.
  · Los **papeles de alta/PRL y las peticiones** se mueven **enteros**, sin preguntar: son
  documentos fechados y tener los de dos años es lo normal.
  ⚠️ Si mañana otra categoría de la fusión tuviera documentos de persona, se añade a
  **`MERGE_DOC_OWNERS`** (hoy solo el tercero) y funciona sola.
  ⚠️ Probado con la app real (`tools/check_duplicados.py`): con el código viejo los documentos de la
  ficha borrada se quedan huérfanos; con el nuevo, el pasaporte y el carnet que solo tenía una se
  mantienen, el DNI queda UNO (el elegido), la misma tarjeta no se duplica, la otra sí, y el PRL
  pasa a la que se conserva.

- ⚠️⚠️ **EL CÓDIGO IPI SOLO SE LE PIDE A UN AUTOR** (sep 2026, lo pidió Dani: «solo aparece cuando es
  autor / compositor / arreglista; si no, que no aparezca el campo, para no saturar de campos las
  fichas de terceros de forma innecesaria»). Punto único **`_promoter_is_author(session, p)`**: lo es
  quien está marcado como **«Autores / compositores»** (`roles_manual`), quien **firma alguna obra**
  (`SongEditorialShare` — ahí entra el **arreglista**) o quien **ya tiene un IPI guardado**.
  ⚠️ Esa tercera no es un capricho: **un campo que tiene un dato no se puede esconder**, porque
  entonces ese dato no habría forma de verlo ni de corregirlo.
  ⚠️ Y cuando no se pinta, el input va **`disabled`**: **un campo oculto SE ENVÍA IGUAL**, y el
  centinela de `_promoter_apply_form` (`if "ipi" in request.form`) solo protege si NO llega —
  guardar cualquier otra cosa habría borrado el IPI de quien lo tuviera.
  ⚠️ En la ficha, el campo **aparece en cuanto se marca «Autores / compositores»**, sin guardar y
  volver (el servidor decide si nace visible; el JS solo lo enseña al vuelo).
