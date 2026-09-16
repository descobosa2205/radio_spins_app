# Permisos y accesos

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- UN RECURSO QUE **NO SE HEREDA DEL PADRE** (`EXACT_ACCESS_KEYS`)

- Sesiones BD: s = db() con try/except rollback/finally close, o with get_db() as s.
- Permisos
- PERMISOS · repaso del catálogo
- RETIRAR UN RECURSO DE PERMISOS SE LLEVA SUS GRANTS: hay que TRASLADARLOS
- INICIO DE DIRECCIÓN · SUS TAREAS y el CUADRO DE MANDO. Dirección no trabaja dentro
- DIRECCIÓN también tiene su módulo de tareas en Inicio
- CÓMO SE ESCRIBE UNA DIRECCIÓN · un solo formato en TODA la app
- DIRECCIÓN FISCAL EN PIEZAS: calle · código postal · municipio · provincia
- QUIÉN ES DIRECCIÓN se decide en su ficha
- UN ENDPOINT PUESTO EN EL mapping DE _resolve_request_resource_key ES CÓDIGO MUERTO
- UNA PESTAÑA CON RECURSO PROPIO HAY QUE MAPEARLA, O SE VE PERO DA 403 (bug real, ago 2026).
- EL CATÁLOGO DE PERMISOS SE PONE AL DÍA AL ABRIR ACCESOS (ago 2026,
- DISEÑO NO PODÍA ABRIR NI ENTREGAR LO QUE LE PEDÍAN
- include_descendants=True SOBRE UNA SECCIÓN ABRE LA PUERTA A MEDIA OFICINA
- NADIE SE COME UN 403 EN UNA FUNCIÓN QUE TIENE ASIGNADA.

---

## UN RECURSO QUE NO SE HEREDA DEL PADRE (`EXACT_ACCESS_KEYS`)

Lo normal en esta app es que **tener una SECCIÓN dé todas sus pestañas**: `_state_has_access`
comprueba la clave **y sus ancestros**, y eso es lo que se espera (quien lleva Contratación entra en
sus pestañas sin que nadie se las conceda una a una).

⚠️⚠️ Pero hay pantallas que **no puede abrir cualquiera que trabaje en esa sección**. La primera es
la **CAJA de un artista** (`artists.caja`, sep 2026): ahí está lo que factura, lo que ha costado y
lo que deja a la casa, y Dani pidió que solo la vieran **dirección y administración**. Tener
«Artistas» **no la da**.

Para eso está **`EXACT_ACCESS_KEYS`**: una clave que esté ahí se comprueba **exacta**, sin mirar a
sus padres. Un solo `if` al principio de `_state_has_access`, así que **el gate, la barra de
pestañas y la vista dicen lo mismo** y no se pueden desparejar.
⚠️ Antes esto se resolvía a mano donde hacía falta (`can_view_sales_revenue` mira el grant exacto de
`ventas.reportes` para que tener «Ventas» no dé la recaudación). Eso sigue ahí y funciona; lo nuevo
es que ahora hay **un sitio** donde declararlo.
⚠️ Al añadir una clave: comprobar que la pantalla **no se pinta** sin ella (la barra de pestañas usa
el mismo `has_access_key`) y que el gate no deja entrar por la URL. Se prueba con dos usuarios, uno
con la clave y otro sin ella; `tools/check_permisos.py` cubre lo demás.


- **Sesiones BD**: `s = db()` con `try/except rollback/finally close`, o `with get_db() as s`.
- **Permisos**: catálogo `UserAccessResource` (SECTION→TAB→SUBTAB, `economic_capable`) + grants
  `UserAccessGrant` (`can_view_basic`/`can_view_econ`/`can_edit`). **role 10 = dirección** (acceso
  total y único que edita permisos). **Única fuente de verdad = `CURATED_ACCESS_RESOURCES`** (lista en
  `app.py`): cada recurso lleva `description` (función + página/pestaña; se muestra en la pantalla de
  Accesos) y `sort_order`. Los seeds SQL en `models.py` son redundantes (UPSERT) y CURATED manda.
  Enforcement: `_enforce_role_permissions_v2` (usa `include_descendants`); las versiones legacy
  `enforce_role_permissions`/`require_login` quedan **sustituidas** por las `_v2` vía
  `_replace_before_request` (código muerto, no editarlas). `_resolve_request_resource_key` mapea
  endpoint→recurso (respaldo: `_infer_group_key_from_path`); **si da `None` en un POST, solo dirección
  pasa** → al añadir endpoints nuevos hay que mapearlos.
  **Endpoints de APOYO (núcleo del rediseño: «cumplir la función sin errores de permisos»)**:
  herramientas transversales que NO son una sección, declaradas en `SUPPORT_ACTION_ENDPOINTS`
  (alta rápida `/api/*/create`, vinculaciones `/vinculaciones/*`, hoja de ruta `/hoja-ruta/*`),
  `SUPPORT_READ_ENDPOINTS` (búsquedas/lookups para rellenar formularios) y `SUPPORT_ECON_READ_ENDPOINTS`
  (lecturas con importes, exigen `econ` de su sección). El gate lo hace `_support_endpoint_decision`
  (prioridad sobre la resolución por sección): las acciones las puede usar cualquier **actor**
  (`_user_is_actor`: puede editar alguna sección **o** tener acceso a invitaciones), las lecturas
  cualquier sesión, las económicas con permiso económico. Así, p. ej., quien puede *pedir invitaciones*
  crea/busca/vincula un tercero sin bloqueos. **Para una función nueva**: declara su recurso en
  CURATED (con descripción) y mapéala en `_resolve_request_resource_key`; si es una herramienta
  transversal, métela en `SUPPORT_*`. **Auto-descubrimiento sin duplicados**: `_build_access_resources_from_app`
  usa `_coarse_endpoint_resource` para saltar lo ya cubierto (esto eliminó los `auto.*` fantasma) y
  **bucketiza solo las ESCRITURAS sin cubrir** bajo su sección o el cajón **`otros`** («Otras funciones»,
  desactivado) — nada queda solo-dirección en silencio. `_sync_access_resources` **poda** legado y
  `auto.*` huérfanos (grants en cascada); legado retirado en `LEGACY_REMOVED_ACCESS_KEYS`
  (`concerts*`, `quadrantes`, `marketing` — duplicaban `contratacion`/`promocion`; sus rutas siguen vivas
  mapeadas a la sección real). **Garantía a futuro**: `_audit_access_coverage()` corre en el arranque
  (best-effort, avisa en log si una escritura queda sin recurso) y desde `tools/check_access_coverage.py`
  (CI/local, requiere Python 3.10+). **Invitaciones = recursos «de acción»**: su POST exige solo
  **acceso básico** a `invitaciones.pedir`/`invitaciones.gestionar` (tener la pestaña habilitada =
  poder pedir/gestionar; el control fino por artista/concierto lo hace `_ensure_can_manage_invitations`),
  no `can_edit`. Coherencia: `_coherent_grant_values`. Las funcionalidades nuevas se
  autodescubren y entran **desactivadas**. UI en `personnel_detail.html` + `personnel_bulk.html`.
  ⚠️ **QUIÉN GESTIONA LAS INVITACIONES de una actividad** (`_filter_manageable_concerts`, corregido
  ago 2026): si la promueve un **tercero** (ni `group_company_id` ni participación del grupo), las
  gestiona **la persona de PRODUCCIÓN ASIGNADA** (`Concert.production_owner_user_id`) — antes valía
  cualquiera que tuviera ese artista asignado, y el trabajo quedaba repartido a medias. Si la
  actividad **aún no tiene responsable**, se mantiene la regla antigua (artistas asignados) como red
  de seguridad, para que la lista de invitados no se quede sin nadie. Lo que promueve una **empresa
  del grupo** sigue siendo de **Ticketing**, dirección lo gestiona todo y «Gestionar otros» (opt-in)
  sigue valiendo para cualquiera.
  **Artistas por faceta**: `UserProfile.assigned_artist_ids_produccion` / `_sello` (una persona puede
  ser de ambos); `assigned_artist_ids` se mantiene como **unión** (compat) y se recalcula al guardar.
  En el perfil se muestran dos selectores según departamentos (Producción/Sello).
  **Modo «Ver como» (impersonación)**: solo dirección (role 10), desde el perfil de cada persona
  (`impersonate_start`, `POST /personal/<id>/ver-como`). Intercambia `session["user_id"]` por el del
  objetivo y guarda el real en `session["impersonator_id"]`/`["impersonator_role"]`, así TODA la app
  (permisos, menú, economía) refleja al impersonado sin tocar los *choke points*. Salir:
  `impersonate_stop` (`GET /salir-modo-vision`, **exento** del enforcement) — botón rojo en el navbar
  (`layout.html`, globales `IMPERSONATING`/`IMPERSONATOR_NICK`). No anidable, no a uno mismo, no a
  bloqueados/eliminados; `logout` limpia las claves.
- **PERMISOS · repaso del catálogo (ago 2026)**: el catálogo (`CURATED_ACCESS_RESOURCES`, **96
  recursos**) ya tiene TODAS las secciones y pestañas de la app, y **no queda ningún `auto.*` sin
  clasificar**. Lo que se añadió en este repaso:
  · **Discográfica → «Demos»** (`discografica.demos`) y **«Playlists»** (`discografica.playlists`),
  que eran secciones de la pantalla sin recurso propio: ahora se pueden conceder (o quitar) sueltas.
  Sus endpoints se mapean por prefijo (`discografica_demo*` → demos, `playlist_*` → playlists;
  ⚠️ `playlist_` **no** es `playlisting_`, que es otra sección).
  · **Contabilidad por pestañas**: `contabilidad.pendiente` · `contabilidad.contabilizado` ·
  `contabilidad.retenciones` (se puede dar solo «Retenciones» a quien declara). **Todo lo que se HACE**
  (subir a Holded, marcar contabilizado, omitir, corregir importes, `royalty_liquidation_accounted`)
  cuelga de **«Pendiente de contabilizar»**, que es donde se trabaja.
  ⚠️ La resolución por `tab` hay que ponerla **DONDE se resuelve `contabilidad_view`** (dentro del
  bloque grande de `promocion_view`/`administracion_view`/…): una regla más abajo es **código muerto**,
  porque gana el mapeo de la sección (bug real de este repaso).
  ⚠️ El gate de LECTURA usa `include_descendants=True`, así que **tener una pestaña abre la URL de
  cualquier otra de la misma sección**. Por eso `contabilidad_view` (como la ficha de personal) solo
  pinta las pestañas que se pueden ver y **redirige a la primera** si se pide otra.
  · **Sin números repetidos**: los `sort_order` de Discográfica y Contratación colisionaban (dos
  recursos con el mismo número salían en la pantalla de Accesos en orden aleatorio) y ahora siguen el
  orden real de sus pestañas.
  · **`_access_exempt_endpoints()`** es el punto ÚNICO de lo que NO necesita recurso porque lo
  autoriza otra capa: apoyo (`SUPPORT_*`), **datos propios** (`PERSONAL_ENDPOINTS`: mis gastos, mis
  vacaciones, mis avisos, el orden de mi menú), **pedir algo** (`REQUEST_ANY_ENDPOINTS`) y lo que es de
  dirección por naturaleza (modo trabajo, «Ver como»). Lo usan el auto-descubrimiento **y** la
  auditoría: antes esos 14 endpoints salían en Accesos como «Función nueva sin clasificar» (permisos
  que no hacían nada) y, al quitarlos, la auditoría los daba por «sin cobertura» — las dos cosas leen
  ahora la misma lista. `expense_template_create/save/update_items` pasan a `SUPPORT_ACTION_ENDPOINTS`
  con sus hermanas, y `/integraciones` se resuelve también por RUTA.
  ⚠️ La **red de seguridad sigue puesta**: una función de escritura nueva que no se mapee sigue
  entrando en el catálogo **desactivada** bajo «Otras funciones» (comprobado), así que nada queda
  solo-dirección en silencio.
- ⚠️⚠️ **RETIRAR UN RECURSO DE PERMISOS SE LLEVA SUS GRANTS: hay que TRASLADARLOS**
  (`MIGRATED_ACCESS_KEYS`, ago 2026). `_sync_access_resources` **poda** lo que esté en
  `LEGACY_REMOVED_ACCESS_KEYS` y los grants caen **en cascada**, así que quien tenía el acceso lo
  perdería sin más. La tabla `MIGRATED_ACCESS_KEYS` (`clave vieja → (clave nueva, econ)`) dice a dónde
  va cada uno y **`_sales_revenue_grants_migrate`** lo traslada **ANTES de la poda**, dentro de la
  propia función de sincronización. Es idempotente y **no necesita marca de «hecho»**: en cuanto la
  clave vieja se poda no queda nada que mover, así que tampoco resucita lo que dirección haya quitado
  a mano después. Al retirar un recurso, añadirlo a las DOS listas.
- **INICIO DE DIRECCIÓN · SUS TAREAS y el CUADRO DE MANDO** (ago 2026). Dirección no trabaja dentro
  de una sección: **mira**. Su Inicio es, en este orden: **cabecera · MIS AVISOS (solo cuando hay) ·
  botones rápidos · el CALENDARIO · MIS TAREAS PENDIENTES · el CUADRO DE MANDO ·** y sus cosas
  **BÁSICAS** (mis gastos, mis vacaciones), cada una en su sitio de siempre. **El resto de módulos no
  se le pintan** (ni se calculan): son el trabajo de otros y ya se ven en el cuadro.
  · **MIS TAREAS PENDIENTES** es solo lo de ESA persona: **lo que le afecta a ella y lo que es de
  dirección, en un mismo sitio** (aprobar una remesa, aprobar vacaciones, el OK a un plan de
  lanzamiento, las fases de SUS actividades, activar la producción de lo que ha creado, sus carteles
  rechazados, los rechazos por comunicar, sus invitaciones).
  ⚠️ A dirección, `mine` sale **True en TODAS** las fases de una petición (puede con todo), así que
  `_home_my_tasks` exige además que la fase sea **suya de verdad** (`owner_user_id` vacío o el suyo):
  si no, su módulo personal se llenaba con el trabajo de los demás. Eso está en el cuadro.
  · **El CUADRO DE MANDO es VISUAL**: una tarjeta por área (con su color), su total, y dentro **la
  CARA de cada persona con el número de tareas que lleva** —de un golpe se ve quién va cargado—.
  **Al pinchar una cara** se despliega SU listado con el estado de cada tarea (a dónde lleva y para
  cuándo), en acordeón (`data-bs-parent`: solo una abierta por área). Áreas: **Contratación ·
  Producción · Ticketing · Sello (proyectos) · Registros · Promoción y marketing · Diseño · Digital ·
  Administración**.
  · **Lo que no es de nadie tiene su propia cara**, con las fotos de quien lo puede coger: es la
  regla de la casa (una tarea sin responsable la ve todo el departamento) y así se ve **lo que hay
  que repartir** en vez de esconderlo. ⚠️ Debajo de la cara pone **«Sin asignar»** (`short_nick`): en
  un hueco de 82 px, «Del departamento» se corta y no dice nada — el nombre largo se sigue usando en
  la cabecera del detalle y en el tooltip.
  · Motor **`_direccion_board()`** + `DIRECCION_AREAS` + un constructor por área
  (`_dir_area_*`), `_dir_task` (una cosa pendiente) y **`_dir_days`** (el reloj: «Hoy» · «Mañana» ·
  «En 4 días» · «Hace 9 días», con su color). Pantallas: **`templates/_home_direccion.html`** (sus
  tareas) y **`_home_direccion_board.html`** (el cuadro); estilos `.dboard*` / **`.dbg*`** (la
  rejilla de caras) / `.dbp*` / `.dbt*`.
  ⚠️ En `home.html` hay DOS compuertas, no una: los módulos de departamento cuelgan de
  `{% if HOME_DIRECCION_BOARD is none %}` y el bloque **LO SUYO va FUERA**, así que la misma
  plantilla sirve para todos — a dirección solo le salen ahí los básicos porque las demás claves le
  llegan **vacías** desde `inject_personnel_globals`.
  · **Cada área REUTILIZA el motor que ya decide qué está pendiente** (`_contracting_tasks_data`,
  `_home_ticketing_sales_tasks`, `_admin_pending_counts` + `_admin_responsible_user_ids`,
  `_home_project_registros`…): si mañana cambia lo que es una tarea, el cuadro cambia solo.
  · **De quién es cada cosa**: `_dir_artist_owners` (artista → quien lo lleva **en ese
  departamento**, con la faceta `produccion`/`sello` cuando toca) y, donde hay columna, el
  responsable de verdad (`production_owner_user_id`, `escort_user_id`, las **responsabilidades** de
  administración).
  · **El DESGLOSE de la cabecera** («3 conciertos · 1 actividades» en Producción) sale del campo
  `group` de cada tarea: un área que no lo use no enseña ninguno.
  ⚠️ **Es CARO** (recorre actividades vivas, proyectos, promociones y bolsas): se calcula **solo en
  Inicio y solo para dirección** (`role == 10`), cacheado en `g`. Y por eso los módulos de
  departamento **ni se calculan** para dirección (`_dept` en `inject_personnel_globals`).
  ⚠️ **El cerrojo del `g` es una MARCA aparte** (`_direccion_board_done`), no el propio valor:
  `None` es un resultado válido y con `if cache is not None` se recalcularía en cada `render`.
  ⚠️ **RED DE SEGURIDAD**: si no se puede ni leer el personal, `_direccion_board()` devuelve
  **None** y el Inicio se cae al de SIEMPRE — unos módulos de más son mucho mejor que una pantalla
  en blanco. Por eso el cuadro se monta **antes** del diccionario del contexto y `_dir` se apaga si
  sale None.
  ⚠️ El resumen de los **PROYECTOS** es a propósito **el PASO en el que está** (la fecha, el plazo,
  el productor, el aviso, la bolsa) y no la cuenta exacta de `_disco_project_tasks`: ese hace ~25
  consultas POR PROYECTO y en Inicio serían cientos. La lista entera está en la ficha del proyecto.
  ⚠️ Una actividad de Contratación es **UNA** tarea aunque le falten tres cosas (el contrato, el
  anuncio y mandarla a producción): es el mismo criterio con el que se cuentan sus pestañas, así que
  el número del cuadro y el de Contratación dicen lo mismo.
  · **MIS AVISOS** (`_home_notices`) es el MISMO dato de la campanita (`_notification_rows`, solo lo
  no leído), no otro: un aviso leído deja de estar esperando y el módulo desaparece solo.
  · **MIS TAREAS PENDIENTES** (`_home_my_tasks`) **no calcula nada nuevo**: junta lo que los módulos
  personales ya han resuelto (remesas por aprobar, vacaciones por aprobar, el OK al plan de
  lanzamiento, las fases de sus actividades, activar producción, carteles rechazados, rechazos por
  comunicar) en una sola lista ordenada por urgencia. Los módulos de los que sale **no se pintan**
  para dirección (llegan vacíos), así que nada se dice dos veces.

- **DIRECCIÓN también tiene su módulo de tareas en Inicio** (ago 2026): en
  `_home_activity_phase_tasks`, quien es dirección (`estado["role"] == 10`) ve **todas** las
  actividades con fases pendientes; el resto, las que pidió o las que aprobó.

- **CÓMO SE ESCRIBE UNA DIRECCIÓN · un solo formato en TODA la app** (ago 2026). Motor puro
  **`address_utils.py`**, que es el ÚNICO sitio que lo sabe:

      Calle y número, CP Municipio, Provincia, País

  · La **coma** separa las piezas (es como se escribe una dirección), el **país solo si NO es
  España** y un municipio que se llama igual que su provincia **no se repite**.
  · **`parse()`** hace el camino de vuelta (de un texto de un tirón a sus piezas) y **`format_parts()`**
  las vuelve a juntar; **`place_label()`** es lo mismo sin la calle («Municipio, Provincia, País»), y
  de ahí tira `_place_label` de las peticiones. Globales de plantilla **`address_text(v)`** (junta) y
  **`address_parts(v)`** (las piezas, para enseñarlas por separado donde toca).
  · **AUTOCOMPLETADO en todos los campos de dirección** (`static/js/address_autocomplete.js`,
  global): al escribir salen coincidencias y, al elegir una, se rellenan el CP, el municipio, la
  provincia y el país. Dos formas, las dos con `[data-address-autocomplete]` en el bloque:
  **`data-addr="full"`** (UN campo: domicilios, recintos, medios, el lugar de una promoción, la
  dirección manual del recinto de una actividad…) y **en piezas** (`data-addr="address|postal_code|
  city|province|country"`, la dirección FISCAL, que Holded exige suelta).
  ⚠️ En el campo único, la dirección que se escribe la compone el **SERVIDOR** (`full` de
  `api_address_search`, hecho con `format_parts`): así el JS no tiene una segunda versión del formato.
  ⚠️ Se guarda normalizada **AL GUARDAR**, como los teléfonos: `_addresses_normalize_instance` en el
  mismo `before_flush`, con los campos de cada modelo en **`_ADDRESS_FIELDS`** (un campo de dirección
  nuevo va ahí). Lo que no se puede repartir **se respeta tal cual**.
  · **Relleno puntual** `_addresses_normalize_backfill` (marca `addresses_format_backfill_v1`): pone
  las ya guardadas en la forma de la casa y **reparte las piezas** de las fiscales que las tuvieran
  vacías. ⚠️ `user_profiles` **no tiene `id`** (su clave es `user_id`): la tabla de tablas del relleno
  lleva la clave primaria de cada una.
  ⚠️ El CP se rellena a 5 dígitos **solo en España** (el 1200 de Lisboa no es el 01200 de nadie) y
  fuera se reconoce su forma (4-5 dígitos, «1200-195»).

- **DIRECCIÓN FISCAL EN PIEZAS** (ago 2026): calle · **código postal** · **municipio** · **provincia**
  · país, en `Promoter` y `PromoterCompany` (`fiscal_postal_code`/`fiscal_city`/`fiscal_province`/
  `fiscal_country`). ⚠️ **Holded exige el CP, el municipio y la provincia separados** para dar de alta
  al proveedor: con la dirección en un solo cuadro de texto el gasto no se puede contabilizar.
  · Un único parcial para TODOS los formularios: **`templates/_fiscal_address_fields.html`**
  (`{{ fiscal.fields(fiscal_parts(obj)) }}`), ya puesto en la ficha del tercero (sus datos y sus
  sociedades), en los **integrantes del artista**, en el **enlace de alta de terceros** y en la
  **landing de facturación** (donde además se piden como obligatorios y se enseñan bloqueados si ya
  los tenemos).
  · **AUTOCOMPLETADO** (`geo_utils.py` + `static/js/address_autocomplete.js` + endpoint
  `api_address_search`, `/api/direcciones`): al escribir la calle salen sugerencias y, al elegir una,
  se rellenan CP, municipio, provincia y país; escribiendo solo el **código postal**, la provincia se
  pone **al instante** (tabla de las 52 provincias por los dos primeros dígitos, en el JS y en
  `geo_utils.PROVINCE_BY_CP` — ⚠️ **espejadas: si se toca una, se toca la otra**).
  ⚠️ **Nominatim NO se puede usar para autocompletar** (su política lo prohíbe: una petición por
  tecla); el `/api/geocode` que ya existía sigue valiendo porque hace UNA consulta por ciudad. El
  proveedor es **Photon** (komoot, sobre OSM, gratis y sin clave), sesgado a España con `bbox`.
  ⚠️ **La provincia NO se coge del geocodificador**: Photon devuelve `state` = comunidad autónoma
  («Andalucía») y `county` a veces la comarca («Sierra de Cádiz»). Sale del CP, que es determinista.
  · Lo buscado se **guarda** en `address_lookups` (`ensure_geo_schema`, 180 días): la segunda vez que
  alguien escriba la misma calle sale al instante y sin salir a Internet. El endpoint es **público**
  (lo usan el enlace de alta y la landing de facturación) con un freno de 40 búsquedas por IP y
  minuto. Es una AYUDA: si el proveedor no responde, no pasa nada y se escribe a mano.
  · Se **muestra junta** con el global **`fiscal_address_text(obj)`**; las piezas para rellenar un
  formulario las da **`fiscal_parts(obj)`** (`_fiscal_parts_for_form`), que **reparte al vuelo** lo que
  estuviera guardado de un tirón (`_split_fiscal_address`: busca el CP de 5 dígitos, lo de antes es la
  calle y lo de después el municipio; la provincia, entre paréntesis o tras la última coma). Ese
  reparto es un apaño de LECTURA: no se inventa un municipio y no se guarda hasta que se envía el
  formulario. Al guardar, punto único **`_apply_fiscal_address`** + `_fiscal_form_values`.

- **QUIÉN ES DIRECCIÓN se decide en su ficha** (ago 2026). `User.role == 10` = dirección (acceso
  total). Hasta ahora eso solo se podía cambiar en **`users.txt`** y —peor— la siembra del arranque
  **volvía a aplicar el rol del fichero en CADA deploy**, así que había gente saliendo como dirección
  sin serlo (viendo TODO, también lo económico) y no había forma de quitárselo desde la app.
  · La siembra ya **no toca el rol de quien existe** (solo lo pone al CREARLO), y el login de
  respaldo por `users.txt` tampoco lo pisa: manda lo que diga la BD. Es el mismo caso que el nick.
  · Sin rol escrito en el fichero se entra con el acceso **más bajo** (antes: dirección).
  · Interruptor en la ficha → pestaña **Accesos** (`personnel_role_set`, `POST
  /personal/<id>/direccion`, **solo dirección**): «Marcarla como dirección» / «No es de dirección».
  ⚠️ **Nadie se lo cambia a sí mismo** (se quedaría sin poder devolvérselo). ⚠️ Su formulario va
  FUERA del de accesos (un `<form>` dentro de otro no es HTML válido) y lo envía un enlace.
  ⚠️ Al dejar de ser dirección, esa persona ve **solo lo que le concedan sus permisos**: lo normal es
  configurárselos ahí mismo, en la pantalla en la que ya se está.

- ⚠️⚠️⚠️ **UN ENDPOINT PUESTO EN EL `mapping` DE `_resolve_request_resource_key` ES CÓDIGO MUERTO**
  (bug real y de PERMISOS, sep 2026). Ese dict vive **dentro de un `if endpoint in {…}`** que solo
  enumera las vistas de sección (`produccion_view`, `contabilidad_view`…), así que a un endpoint que
  no esté en ese conjunto **no se llega nunca**: `_resolve_request_resource_key` devolvía **None** y
  entonces el gate **no comprobaba NADA en un GET** y en un POST solo miraba `is_master()`. Pasó con
  `production_template_create`/`_personnel` (del lote anterior) y con los `rider_*`: comprobado que
  un usuario sin acceso a Producción **entraba** en el editor de un rider (200 en vez de 403).
  **Un endpoint nuevo se mapea con una regla de PREFIJO arriba**, junto a las demás de su sección.
  Es la misma trampa que ya documenta la resolución por pestaña de contabilidad.
  ⚠️ La comprobación es de tres líneas y hay que hacerla al añadir endpoints:
  `with app.test_request_context(ruta, method=…): print(_resolve_request_resource_key())` —
  tiene que devolver su sección, nunca `None`.

- ⚠️⚠️ **UNA PESTAÑA CON RECURSO PROPIO HAY QUE MAPEARLA, O SE VE PERO DA 403** (bug real, ago 2026).
  A la pestaña **«Gastos» de una canción** se le dio su recurso (`discografica.gastos`) pero el mapeo
  de `discografica_song_detail` seguía apuntando a **`contabilidad`**: la pestaña **se pintaba** —el
  menú mira su recurso, que se hereda de la sección— y al abrirla salía un **403 que en la pantalla
  de Accesos no se podía explicar** («no me aparece que no tenga acceso»). Al crear un recurso hay
  que tocar **las TRES cosas**: el catálogo (`CURATED_ACCESS_RESOURCES`), la lista de pestañas de la
  plantilla y **el mapeo por `tab`** de esa ficha (en los dos mapeos, si el endpoint no lleva
  prefijo).

- ⚠️⚠️ **EL CATÁLOGO DE PERMISOS SE PONE AL DÍA AL ABRIR ACCESOS** (ago 2026,
  `_sync_access_resources_for_screen`). Se sembraba **solo** en el hilo de segundo plano
  (`_bootstrap_personnel_bg`), así que una función NUEVA podía no estar todavía en la BD y **su fila
  no salía en Accesos**: no había forma de concederla y el error que daba era de los que no se pueden
  explicar («la pestaña se ve pero da 403»). Ahora se sincroniza también al abrir la **ficha de
  personal** y los **accesos en bloque** —una consulta de ~100 filas, y solo escribe lo que falte—,
  que es justo cuando hace falta. Es *best-effort*: si fallara, la pantalla se pinta igual.

- ⚠️⚠️⚠️ **DISEÑO NO PODÍA ABRIR NI ENTREGAR LO QUE LE PEDÍAN** (sep 2026). El trabajo de diseño vive
  en la ficha de OTRA sección —la cartelería en la actividad (Contratación), la portada, las
  creatividades, la miniatura y los contenidos en el PROYECTO (Discográfica), el gráfico en la NOTA
  DE PRENSA (Promoción) y los materiales en la CAMPAÑA (Marketing)— y diseño no tiene esas secciones:
  **al pinchar su propio aviso se comía un 403**.
  · **LEER**: `diseno` entra en **`ACTIVITY_READ_ACCESS_KEYS`** y en **`RELEASE_READ_ACCESS_KEYS`**, y
  **`_design_read_resource_key(default)`** hace lo mismo con `disco_project_detail`,
  `promo_press_detail` y `promotion_detail_view`. **Solo en GET**: escribir sigue exigiendo la sección.
  · **SUBIR CARTELES**: punto único **`can_upload_artwork()`** (contratación · **diseño** · dirección).
  Los cuatro endpoints de cartelería exigían `can_edit_concerts()`, que diseño no tiene: el botón se
  le pintaba y el POST le devolvía «Sin permiso».
  · **SU SECCIÓN**: el mapeo pasa de `endpoint.startswith("diseno_peticion")` a
  **`endpoint.startswith("diseno_")`** — si no, un endpoint nuevo de Diseño devolvía **None** y el
  gate no comprobaba nada en un GET. (Es la trampa de siempre.)
  · Lo que diseño **HACE** se hace desde su propia bandeja (`POST /diseno/tarea/<kind>/<id>/subir`,
  recurso `diseno` con edición), así que no hace falta darle edición en ninguna otra sección.
  → `docs/app/diseno.md`

- ⚠️⚠️ **`include_descendants=True` SOBRE UNA SECCIÓN ABRE LA PUERTA A MEDIA OFICINA** (sep 2026). Los
  módulos de dinero de Inicio —«Pendiente de cobrar» y «Facturado en \<año\>»— y las **tareas de
  contratación** colgaban de `has_access_key("contratacion", include_descendants=True)`. Como
  «Peticiones» (`contratacion.peticiones`) se le concede a casi todo el mundo para que pueda **pedir**
  una actividad, eso lo cumplían también diseño, producción y promoción: abrían su Inicio y lo
  primero que veían era **la facturación del grupo** y el trabajo de otro departamento.
  · Punto único **`_is_contratacion_person()`**: el **DEPARTAMENTO** «Contratación», o la **sección
  entera** concedida (`has_access_key("contratacion")`, **sin** `include_descendants`), o dirección.
  · Helper nuevo **`_current_user_in_department(*nombres)`** (el hermano de `_profile_in_department`,
  leyendo la sesión) para cuando lo que decide es el departamento y no un permiso.
  ⚠️ Comprobado con cuatro usuarios: diseño y producción **no** ven el dinero; contratación y
  dirección **sí**.

- ⚠️⚠️⚠️ **NADIE SE COME UN 403 EN UNA FUNCIÓN QUE TIENE ASIGNADA** (sep 2026, regla de la casa).
  Era el error más molesto de la app y salía «todo el rato»: **las barras de pestañas se pintaban
  ENTERAS** aunque cada pestaña tenga su propio permiso, así que se veía «Peticiones» en
  Contratación, se pinchaba y te echaba de la pantalla. Medido con la herramienta de abajo:
  **380 enlaces llevaban a un 403**. Hoy: **cero**.
  · **LA REGLA, en dos capas**:
    **1) Lo que no se puede abrir NO SE PINTA** (ni pestaña, ni botón, ni enlace a otra sección).
    **2) Y si aun así se llega (una URL guardada, un enlace de un correo), NO se deniega: se lleva a
    lo que SÍ puede ver de esa sección.** Punto único **`_access_fallback_url`** en el gate: quita
    de la URL el parámetro de pestaña (**`TAB_ARGS`**) y la vista elige la primera visible; solo si
    no tiene NADA de esa sección se deniega. La marca **`_acc=1`** evita el bucle (si tras volver
    tampoco puede, se deniega de verdad).
  ⚠️ El control fino SIGUE: con solo «Datos» de una ficha de personal no se ve «Accesos» (te lleva a
  Datos), y sin nada de la sección el 403 se mantiene. Comprobado.
  · **CONTRATACIÓN**: sus pestañas viven en **`CONTRACTING_TAB_DEFS`** (clave · permiso · icono ·
  rótulo) + `_contracting_tab_url` + `_contracting_visible_tabs` + `_contracting_tabs_ui`, que es lo
  que pinta `_contracting_tabs.html`. **La barra ofrece EXACTAMENTE lo que el gate deja pasar**
  (`has_access_key(res, include_descendants=True)`, el mismo criterio), y `contracting_view` cae en
  la primera visible. Una pestaña nueva se añade SOLO ahí.
  ⚠️⚠️ **UN PERMISO DE PESTAÑA VALE TAMBIÉN DESDE SU PADRE** (`_personnel_tab_grant` usa ya
  `_state_has_access`, o sea la clave **y sus ANCESTROS**): antes se exigía el permiso EXACTO y
  quien tenía **«Personal»** o **«Usuarios»** **no podía abrir NINGUNA ficha** — veía el listado y
  al pinchar una persona, 403. Lo que no vale es una pestaña HERMANA, así que se sigue pudiendo dar
  solo «Datos».
  ⚠️ Si no puede ver **ninguna** pestaña de una ficha **no se le da un 403**: se le dice por qué y
  se le devuelve al listado (el caso típico: solo tiene «Accesos», que es de dirección y por eso su
  descripción en el catálogo lo avisa).
  · **QUIÉN ENTRA EN LO QUE SE ABRE DESDE VARIAS SECCIONES**: `ACTIVITY_READ_ACCESS_KEYS` gana
  **`ventas`**, **`promo`** y **`discografica`** (quien lleva las ventas de una actividad tiene que
  poder abrirla desde su reporte) y **`BAG_ACCESS_KEYS`** gana **`administracion`** y
  **`contabilidad`** (quien liquida y paga entra en la bolsa sin que le concedan además «Bolsas»).
  · **EL ASISTENTE «+ Actividad» solo se ofrece a quien puede GUARDARLO** (el MISMO permiso que pide
  `concert_wizard_create`): desde otra pestaña de Contratación se rellenaba entero para comerse un
  403 al terminarlo.
  ⚠️⚠️ **Y «el mismo» hay que comprobarlo, no escribirlo en un comentario** (bug real, sep 2026):
  `wizard_available` exigía **`contratacion.conciertos`** mientras `concert_wizard_create` exige
  **`can_edit_concerts()`** (edición en CUALQUIER pestaña de Contratación). O sea, quien tenía
  edición en «Otras actividades», «Eventos» o «Festivales» **podía guardar la actividad pero el
  asistente ni se pintaba**: en `/actividades` (donde el botón cuelga de `CAN_EDIT_CONCERTS` y el
  modal de `wizard_available`) salía **un botón que no hacía nada**, y en Giras o Festivales —donde
  el botón va DENTRO de `wizard_available`— **desaparecía**.
  ⚠️⚠️⚠️ **Y AL IGUALARLOS SALTÓ EL DE VERDAD, QUE ESTABA DEBAJO**: `concert_wizard_create` **no
  estaba mapeado**, así que el gate lo resolvía **por su RUTA** (`_infer_group_key_from_path`:
  `/conciertos/…` → `contratacion.conciertos`) y lo rebotaba **ANTES de llegar a la vista** — la
  vista sí les dejaba. Con el asistente ya pintado, `tools/check_permisos.py` cantó **18 enlaces**
  (9 recursos × 2 pantallas), todos al mismo `POST /conciertos/wizard/create`.
  · Punto único **`ACTIVITY_CREATE_ACCESS_KEYS`** + `_first_access_key` (el patrón de
  `BAG_ACCESS_KEYS` / `INVOICE_EDIT_ACCESS_KEYS`): el gate acepta la primera pestaña de Contratación
  que tenga con edición, que es exactamente lo que comprueba la vista. Así **el botón, el gate y el
  guardado miran los tres lo mismo**.
  ⚠️ La lista SALE de `CONTRACTING_TAB_DEFS`, así que una pestaña nueva de Contratación entra sola;
  y va definida **justo después de ese catálogo**, no arriba con las demás listas de accesos
  (el módulo se evalúa de arriba abajo: puesta antes, **NameError al importar**).
  ⚠️ Comprobado con cinco usuarios: el gate y la vista coinciden en los cinco, y `check_permisos`
  vuelve a **cero** (⚠️ con la BD de prueba **recreada**: la que tenía datos sembrados a mano daba
  decenas de 403 de `ventas.reportes` que no eran reales).
  ⚠️⚠️ Pero el CONTEXTO del asistente se monta **siempre** (`_with_concert_wizard`): hay plantillas
  que incluían el modal sin mirar `wizard_available` y se caían con un **500** (`promoters_payload`
  Undefined). Ya lo miran las 14; una pantalla nueva que lo incluya, también.
  · **INVITACIONES**: «Pedir invitaciones» es `invitaciones.pedir` y «Generar enlace» es
  `invitaciones.gestionar` — cada asistente (y su botón) solo a quien puede usarlo.
  · ⚠️⚠️ **LOS 403 DEJAN RASTRO** (`_remember_forbidden` en el punto único `forbid()`): quién,
  dónde, **qué permiso hacía falta** y **qué tiene esa persona de esa sección**. Dirección lo ve en
  **«Configurar notificaciones»**, debajo de los últimos errores. Sin esto, «me da error de
  permisos» no se puede diagnosticar sin ir adivinando (es lo que pasó aquí). Vive en MEMORIA del
  proceso, como los 500.
  · ⚠️⚠️ **LA COMPROBACIÓN: `python3 tools/check_permisos.py`** (con la BD de prueba). Por cada
  recurso del catálogo crea un usuario con SOLO ese recurso, abre sus pantallas y **sigue todos los
  enlaces y todos los formularios** que pintan: si alguno da 403, lo canta. **Tiene que estar en
  cero**; pásala al tocar barras de pestañas, botones o permisos. Los POST se comprueban ejecutando
  **solo el gate** (no la vista), así que no guarda, borra ni manda nada.
  ⚠️ `forbid()` **LANZA** (`abort(403)`), no devuelve: al simular el gate hay que capturar
  `werkzeug.exceptions.Forbidden` o no se detecta ni uno (la herramienta daba 0 falsos).
  · **SEGUNDA PASADA (sep 2026): 42 enlaces más**, de cinco clases, y las cinco son la misma regla
  vista desde los dos lados —o se abre, o no se pinta—:
    · **`/ventas` → el INFORME por concierto**: el botón colgaba de `CAN_VIEW_ECON` (el económico
      general) y el informe exige la **RECAUDACIÓN del reporte** (`ventas.reportes` con su
      económico, grant EXACTO). Global nuevo **`CAN_VIEW_SALES_REVENUE`** (= `can_view_sales_revenue()`),
      que es el que decide el botón: **el mismo punto único que la puerta**.
    · **`/ventas` y `/ventas/reporte` → la FICHA de una actividad SIN CONFIRMAR**: las dos pantallas
      la listaban y Ticketing no puede abrirla. Ahora las dos (y el A4) pasan por
      **`_concert_list_visible`**, el mismo punto único que el calendario y `/actividades`: **lo que
      no está confirmado no se pinta a quien no puede abrirlo**. Contratación y dirección la siguen
      viendo (y quien la creó).
    · **`/registros` y `/syncros` → la ficha de una CANCIÓN o de un DISCO**: ver
      **`_release_read_resource_key`** más abajo.
    · **`/facturas` → la ficha del TERCERO que factura**: ver **`_third_party_read_resource_key`**.
  ⚠️ Y `_concert_list_visible` lee la sesión, así que **fuera de una petición** (un cron, un hilo) va
  protegido: ahí se trata como que no se ve lo que no está confirmado, que es lo prudente.

- **Bases de datos → Compañías de transporte** (sep 2026): recurso `databases.transport_companies`
  (TAB). Endpoints `transport_companies_view` + prefijo `transport_company_` en los DOS resolutores;
  las APIs del asistente de la hoja de ruta (`api_search_transport_companies`,
  `api_create_transport_company`) van en las listas de APOYO. Nace sin concesiones: dirección lo ve
  y a quien lo necesite se le concede en Accesos. Detalle en `produccion-hoja-ruta.md`.
