# Administración · gastos, bolsas, facturas y pagos

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- Dinero
- UNA TAREA CON GASTO SE VE EN LA BOLSA (regla de la casa, ago 2026): lo hacían las acciones
- Módulo de GASTOS por categorías compartido
- REMESAS de pago (fichero para el banco) — ago 2026. Motor puro sepa_utils.py
- Administración · Pendiente
- Administración → Pendiente → DE FACTURACIÓN está agrupado por la EMPRESA DEL GRUPO QUE EMITE
- DOBLE CIERRE DE UNA BOLSA: la cierran DOS departamentos
- AUDITORÍA ago 2026 · lo que se encontró roto y se ha corregido
- HOLDED · CONTABILIDAD del grupo
- CONTABILIDAD · pendiente de contabilizar (ago 2026, contabilidad_view +
- CONTABILIDAD · la tabla se lee, y el % es el TIPO REAL
- CONTABILIDAD · «EDITAR LOS DATOS DE LA FACTURA», en TODAS las filas
- ANULAR una factura o compensarla con una RECTIFICATIVA. Una factura mal emitida no
- HOLDED · NO SE DUPLICAN CONTACTOS NI DOCUMENTOS
- CONTABILIDAD · el filtro que hace falta es «SIN SUBIR A HOLDED»: el filtro de
- LA RETENCIÓN SOLO SE PIDE SI LA FACTURA LA LLEVA: en el formulario del proveedor
- SUBIR A HOLDED NO ES CONTABILIZAR. En la fila hay un icono de Holded
- CONTABILIDAD · «Contabilizado» se lee IGUAL que «Pendiente»: las mismas
- LO QUE TIENE QUE CUADRAR DE UNA FACTURA ES LA BASE, NO EL TOTAL. La
- CONTABILIDAD · pestaña RETENCIONES (_accounting_retention_rows): todas las facturas recibidas
- CONTABILIDAD · RETENCIONES: los TRES estados en su orden
- UN IMPORTE CON TEXTO DETRÁS SE LEÍA MAL: «1.500 € + IVA» daba 1,5 € (bug real de
- CONTABILIDAD · ahí no se avisa del estado de las INTEGRACIONES: el aviso de
- Administración · contadores y REPARTO de tareas
- Subida de ÓRDENES DE EMBARGO con arrastre (templates/administracion.html,
- FACTURAS DE UN PAGO · tres puntitos con editar y eliminar
- Bases de datos → Facturas · «Subidas por terceros» (pestaña por defecto): TODAS las facturas
- Subir factura · paso 3 por TIPO DE ALTA y datos solo si no se detectan
- SUBIR UNA FACTURA = UN SOLO MÓDULO. Da igual desde dónde se haga
- LEER LOS DATOS DE UNA FACTURA · motor invoice_read.py
- BASE DE FACTURAS · una línea por factura, con su desglose
- CONTROL DE LO QUE ENTRA: la factura tiene que cuadrar y solo se sube una vez
- Administración · pagos
- RETENCIONES: se detectan y se pueden CORREGIR A MANO. Cuando lo que hay que pagar no
- Pendiente de facturar (módulo del enlace de subida de facturas): se llamaba «Lo que te
- Remesa · cuenta de cargo, nombre del fichero y concepto
- Royalties · LO GENERADO NO SE ALTERA y los números CUADRAN (auditoría ago 2026). Punto único
- «Mis gastos» (PersonalExpense): facturas dirigidas a una persona por la landing
- Pleo (importación de gastos del personal): cliente en pleo_utils.py (PleoClient, Basic auth con
- Componente insertable en otra web (public_invoice_embed, /facturacion_<slug>/embed): es la
- SUPLIDOS de un gasto (BagExpense.supplements, ago 2026): lo que ese MISMO tercero factura
- Facturas imputadas a gastos de bolsa (BagExpenseInvoice): relación N:N entre una factura y
- Cabify (gastos de viajes): cliente en cabify_utils.py
- EL PUNTO ES DE MILES, NO DECIMAL: MODELO DE EUROS, NO EL DE ESTADOS UNIDOS (sep 2026,
- AÑADIR UN GASTO A LA BOLSA · el formulario, por MÓDULOS (sep 2026, parcial único
- EDITAR UN GASTO ES EL MISMO FORMULARIO QUE AÑADIRLO. La edición era una rejilla
- DIVIDIR UN GASTO ENTRE VARIAS BOLSAS. Una misma factura puede ser de varias
- DIVIDIR UN GASTO · LAS DOCE TRAMPAS QUE SACÓ LA REVISIÓN. Ninguna daba
- EL DINERO NO SE ALTERA · HAY DOS PARSERS Y EL FORMATO LO DECIDE EL ORIGEN DEL DATO
- UNA BOLSA NO REPITE SUS DATOS: la cabecera ya los dice
- UNA FACTURA DICE DÓNDE HAY QUE PAGARLA: EL IBAN SE RESUELVE AL SUBIRLA (sep 2026, bug
- ADMINISTRACIÓN · DE QUIÉN ES CADA BOLSA, debajo de su nombre

---

- **Dinero**: usar `Decimal` (`_parse_money_decimal`, `_money_or_zero`), nunca `float`.
- ⚠️ **UNA TAREA CON GASTO SE VE EN LA BOLSA** (regla de la casa, ago 2026): lo hacían las **acciones
  del plan** (`_disco_plan_action_sync_bag`) y ahora también el **coste de la PORTADA**
  (`_disco_artwork_sync_bag` + `DiscoProjectArtwork.bag_expense_id`): al ponerle importe se crea su
  gasto en la bolsa del proyecto, al cambiarlo se actualiza y **si deja de tener coste, el gasto se
  retira**. Es el MISMO dinero visto desde dos sitios — nadie lo apunta dos veces. Al añadir una tarea
  con importe, engancharla igual.

- **Módulo de GASTOS por categorías compartido**: los «bocadillos» (tarjetas por categoría, rueda de
  IVA, cantidad, arrastrar entre categorías, subtotales y total) son **un solo código**:
  `templates/_expenses_categories.html` + `static/js/sim_expenses.js` (`SimExpenses.init({root, rows,
  qtyCats, onChange})` → `collect()` / `recompute()` / `addRow()`). Lo usan la pestaña **Gastos de una
  simulación** (que conserva aparte cachés, comisiones y su autoguardado) y el editor de las
  **plantillas de gastos** (`expense_template_edit`, `/plantillas-gastos/<tid>`), así que se comportan
  igual y una mejora vale para las dos. ⚠️ Los importes se escriben FORMATEADOS («1.200,50»,
  `money_input.js`): hay que leerlos con **`window.numv`** (= `MoneyInput.num`, ahora GLOBAL). Antes cada
  pantalla se definía su `numv` y en la pestaña Gastos NO existía: cualquier lectura de importe
  petaba con ReferenceError y el guardado moría en silencio (bug real).
- **REMESAS de pago (fichero para el banco)** — ago 2026. Motor puro **`sepa_utils.py`**: genera
  **SEPA XML `pain.001.001.03`** (el Cuaderno 34.14 de la AEB), que es lo que admiten Santander,
  CaixaBank y Cajamar; `BANK_PROFILES` recoge los matices por banco. Valida IBAN por **mod-97**,
  limpia el texto al juego de caracteres SEPA (sin acentos) y dice qué le falta a cada pago
  (`check_payment`). ⚠️ **Antes de fiarse conviene mandar una remesa pequeña por cada banco**: cada
  entidad valida el fichero a su manera.
  · **Bases de datos → Bancos** (`Bank`, recurso `databases.banks`): nombre, logo y **formato del
  fichero**. **Ficha de la empresa del grupo → Datos → Cuentas bancarias**
  (`GroupCompanyBankAccount`): banco, alias, IBAN (validado), **SWIFT/BIC** (es lo mismo),
  justificante de titularidad y cuál es la de por defecto. Solo dirección las toca.
  · **Administración → Pendiente → Pago** está **agrupado por EMPRESA DEL GRUPO**
  (`_payment_pending_context`), y dentro por **liquidación**: cada bolsa se ve con su total
  pendiente y cuántos gastos incluye, y se despliega para ver el detalle; los gastos sueltos van
  aparte. Cada empresa tiene a la derecha su **caja «Crear remesa»**: se **arrastran** ahí bolsas y
  gastos (`static/js/pagos.js`; también vale pinchar el asa). **Solo acepta lo de su empresa**: si
  sueltas algo de otra, avisa y no lo coge (una remesa se paga desde una sola cuenta). Cada gasto
  lleva sus **tres puntitos**: marcar como pagado (eligiendo el método) o crear una remesa con él.
  · **`PaymentBatch` + `PaymentBatchItem`** (BORRADOR → EXPORTADA → PAGADA). El beneficiario se
  guarda **congelado en el item**: si mañana cambia la cuenta del proveedor, la remesa sigue
  diciendo lo que se mandó. Si a un pago le falta un dato, la ficha de la remesa lo avisa y deja
  completarlo: **lo que se rellene se guarda en el TERCERO** (`Promoter.bank_account` / `bank_bic`)
  para no volver a pedirlo, o se quita el pago de la remesa y no se incluye.
  · **Al subir el justificante** (`payment_batch_receipt`) se dan por pagados todos los gastos de la
  remesa («Remesa REM-aaaa-nnnn» como método) y **las bolsas que se quedan sin nada pendiente se
  cierran y se archivan** (`_bag_close_if_fully_paid`): pasan a contabilidad.
  · **PAGOS PARCIALES** (`administration_expense_mark_paid`): el importe del formulario es **lo que
  se paga AHORA** y se **ACUMULA** sobre lo ya pagado (topando en el bruto) — antes lo sustituía, así
  que pagar la diferencia de un parcial dejaba el gasto peor que antes. Lo pendiente de un gasto es
  siempre `_expense_pending_amount` (bruto − pagado): es lo que se ve en pantalla, lo que se ofrece
  en los formularios (`expense_pending`, global de plantilla) y lo que se manda al banco. ⚠️ **Un
  pago parcial NO cabe en una remesa** (la remesa manda el importe pendiente entero): si el gasto
  está en una remesa sin pagar, el pago parcial se niega y pide **sacarlo de la remesa**, con una
  casilla en el propio modal para hacerlo de un clic. Desde los tres puntitos: «Marcar como pagado»
  y «Pago parcial». Un gasto pagado a medias sale con su pastilla «Pagado en parte · X de Y».
  · Guardar dos veces el **mismo IBAN** en una empresa actualiza esa cuenta en vez de duplicarla.
  · Responsabilidad de administración: `_bag_liquidation_responsibility` manda las bolsas de
  promoción **sin pagos pendientes** a `LIQUIDACIONES_PROMO` y el resto a `LIQUIDACIONES`.

- **Administración · Pendiente: el orden del trabajo** (ago 2026): las subpestañas van
  **Solicitudes · De liquidación · De pago · De facturación · De oficina · De cierre**, con la
  estética del resto de la app (`nav-tabs contract-tabs` + icono + contador `.contract-tabs__n`).
  ⚠️ `ADMINISTRATION_PENDING_TABS` son TRIPLETAS `(clave, etiqueta, icono)`: al añadir el icono hay
  que tocar también el desempaquetado de `administracion_view` y el `{% for %}` de la plantilla.

- **Administración → Pendiente → DE FACTURACIÓN está agrupado por la EMPRESA DEL GRUPO QUE EMITE**
  (sep 2026, lo pidió Dani: «tiene que aparecer por empresas del grupo agrupadas, y cada una con su
  logo, para saber qué empresa emite cada factura»). Igual que «De pago», una tarjeta por empresa
  con **su logo** (`company_logo`, que pone su icono si todavía no tiene y **nunca** el de otra) y
  su total; dentro van las dos cosas que hay que facturar, que son las que cuenta la subpestaña:
  las liquidaciones de royalties **a favor** por emitir y las **facturas emitidas** del registro
  (`InvoiceRecord` ISSUED pendiente). Lo que ya está facturado y solo espera el cobro se queda
  **aparte, al final** —eso no es trabajo de facturación—, pero cada fila dice igualmente con su
  logo qué empresa la emitió.
  · Motor **`_billing_pending_context(session_db, invoices, afavor_rows)`**: solo AGRUPA lo que le
  dan (las filas las carga la vista), así el número de la subpestaña y lo que se ve salen de las
  mismas consultas y no se pueden desparejar. Las empresas van por nombre y lo que no tenga empresa,
  **al final** (que es lo que hay que arreglar).
  · La empresa emisora de una liquidación a favor la resuelve **`_afavor_issuer_map`** (la apuntada
  en `billing_company_id` y, si no hay, **PIES**), y cada fila la lleva en `issuer*`
  (`_afavor_issuer_bits`). ⚠️ Es `_afavor_billing_company` **en bloque** a propósito: esa consulta
  la BD en cada llamada y `_pies_group_company` se lee TODAS las empresas, así que por fila serían
  decenas de consultas en una bandeja con trabajo.
  ⚠️ En una fila de royalties a favor hay **dos logos y no son lo mismo**: el de la cabecera es el
  de NUESTRA empresa (la que emite) y el de dentro, el de la **compañía** a la que se le factura.

- ⚠️⚠️ **DOBLE CIERRE DE UNA BOLSA: la cierran DOS departamentos** (ago 2026). Hay bolsas que trabajan
  dos áreas a la vez y **ninguna la puede dar por terminada por su cuenta**:
  · la de un **PROYECTO DISCOGRÁFICO**: el **SELLO** (quien lo lleva) y, **si se pidió LOGÍSTICA**,
    también **PRODUCCIÓN** (la persona a la que se le pidió);
  · la de una **PROMOCIÓN con producción**: **PROMOCIÓN** (su acompañante y el departamento) y
    **PRODUCCIÓN** (quien la produce).
  **Hasta que cierran las dos, la bolsa NO se manda a administración**: se queda abierta y le sigue
  saliendo como pendiente a quien falte.
  · Motor: **`WorkflowBag.close_parts`** (JSONB: qué parte cerró quién y cuándo) + `BAG_CLOSE_PARTS`
  + **`_bag_close_required_parts`** (qué cierres hacen falta y de quién es cada uno) +
  **`_bag_close_state`** (cómo va: `parts` · `mine` · `override` · `can_sign` · `missing_labels` ·
  `ready`) + `_bag_close_sign` + `_bag_close_notify_missing`.
  ⚠️ **Las partes se CALCULAN, no se guardan**: si a un proyecto se le pide la logística después de
  crear la bolsa, el cierre de producción entra solo (y si se anula, deja de pedirse). Guardarlas
  sería dejar dos verdades que se pueden desparejar — la regla de `_notify_resolve`.
  ⚠️ **«Mi parte» es la ASIGNADA** (llevo el proyecto, me pidieron la logística). Aparte hay una red
  de seguridad (`override`): quien pueda EDITAR esa sección —o dirección— puede firmarla, para que
  una bolsa no se quede bloqueada porque alguien esté de vacaciones; pero solo entra **cuando no
  tiene ninguna asignada**, así el doble cierre sigue significando algo.
  ⚠️⚠️ Dirección se decide con el **ROL DEL ESTADO**, no con `is_master()`: ese lee el rol de la
  SESIÓN y **sin él cae a 10**, así que en las pruebas TODO EL MUNDO podía firmarlo todo (bug real).
  ⚠️⚠️ **`bag_close` / `bag_detail_view` se dejan pasar a quien tiene una parte ASIGNADA**
  (`_bag_close_is_mine_request`, en `_support_endpoint_decision`): a quien lleva el proyecto se le
  reclama por su NOMBRE y puede no tener el permiso de «Bolsas» — se comía un **403 al cerrar su
  propia parte** (comprobado). La puerta se abre solo si la parte es suya; el endpoint vuelve a
  comprobar dentro qué firma.
  · **Dónde se ve**: la barra `.bag-close` del panel de la bolsa (quién ha cerrado y a quién se
  espera; el botón pasa a **«Cerrar mi parte»**), la **última tarea del proyecto**
  (`bolsa_cierre` + una subtarea por parte, en estado `wait` mientras falte alguien — así el
  proyecto **no se puede cerrar**) y el módulo de Inicio **«Bolsas que solo te esperan a ti»**
  (`HOME_BAG_CLOSE` ← `_home_bag_close_pending`), que va en el bloque de **lo SUYO** porque se le
  pide a la persona por su nombre.
  · Con eso, un proyecto discográfico termina cuando: **se le ha notificado la fecha al artista**
  (`fecha_aviso`) **+ el sello ha cerrado la bolsa + producción la ha cerrado si hubo logística**.

- **AUDITORÍA ago 2026 · lo que se encontró roto y se ha corregido**:
  · **`/canciones` daba un 500** en cuanto el artista tenía una canción: precargaba `s.interpreters`
  y **`Song` no tiene esa relación** (los intérpretes se leen con `_song_interpreter_rows_map`).
  ⚠️ Esa pantalla no la enlaza ningún menú (el repertorio vive en Discográfica) y su bloque
  `{% if active_tab == 'alta' %}` es **inalcanzable** (`concerts_view` reescribe `alta` → `vista`).
  · **La factura de royalties rechazada dejaba el proceso muerto**: `administration_royalty_invoice_validate`
  volvía la liquidación a «enviada» pero **no soltaba `invoice_id`**, así que para el resto de la app
  seguía facturada (el mismo fallo que ya se corrigió en la base de facturas, en el otro camino). Y el
  correo al proveedor era un «vuelve a subirla» **sin decir dónde**: ahora lo compone
  `_supplier_invoice_reject_notify`, el mismo de la base de facturas, que lleva el **enlace** para
  subir la corregida.
  · **Mensajes que mentían**: se decía «aviso enviado al proveedor» sin mirar si el correo había
  salido (`_send_optional_email` devuelve `(ok, error)`). Corregido ahí y en el rechazo de una
  petición de marketing y de una de invitaciones: si no sale, se dice.
  · **Siete `except: pass` que se tragaban un aviso** pasan a `app.logger.exception(...)`: el flujo
  principal sigue igual, pero deja rastro en el log en vez de desaparecer sin más.
  · Comprobado además, sin encontrar nada: todas las llamadas HTTP y a `subprocess` llevan
  **timeout**; ningún `url_for` de las plantillas apunta a un endpoint inexistente; ningún
  `data-inline-target` apunta a una zona que no existe; ninguna función de `onclick` está sin
  definir; **118 pantallas sin parámetros, 53 con id real, 83 pestañas y 112 rutas con un id
  inexistente** responden sin error de servidor.

- **HOLDED · CONTABILIDAD del grupo** (ago 2026). Cliente en `holded_utils.py` (API Key en la
  cabecera `key`; **una cuenta por empresa del grupo** en `HoldedAccount`, se edita en Integraciones
  → Holded con una **subpestaña por empresa**, `ensure_holded_schema`). Nada en el `.env` salvo
  `HOLDED_CRON_KEY`.
  · ⚠️ **Holded manda errores con un HTTP 200**: `{"status": 0, "info": "..."}`. `_check_payload` los
  convierte en `HoldedError`; mirar solo el código HTTP daba por creado un documento que no existía.
  · ⚠️ **Lo que no se puede dar por bueno a ciegas se COMPRUEBA**: después de crear el documento se
  relee (`verify_document_total`) y se compara el total con el nuestro. Si no cuadra se avisa en el
  gasto (`holded_warning`) en vez de callarlo — es la red de seguridad del mapeo de impuestos.
  · **Rutas que se descubren solas** (mismo patrón que la URL base de Cabify): la de **adjuntar** el
  documento y la del catálogo de **formas de pago** se prueban entre varias candidatas y se guarda la
  que responde (`HoldedAccount.endpoints`). El tipo de documento de los **tickets** lo detecta
  «Probar conexión» con un GET (`detect_ticket_doc_type`): facturas → `purchase`, tickets y gastos
  sin ticket → `dailyexpense`.
  · ⚠️⚠️ **LO QUE ES FACTURA SUBE COMO FACTURA Y LO QUE NO, COMO TICKET** (ago 2026). En la **v1** son
  dos documentos distintos de Holded y se respeta (`purchase` / `dailyexpense`). En la **v2** solo
  existe `purchases` (sus recursos de compra son `purchases`, `purchase-orders` y `receipt-notes`: NO
  hay «gasto/ticket»), así que un ticket se sube como compra **marcada**: etiqueta «Ticket», el
  concepto con «Ticket · …», la nota «Gasto sin factura» y **sin número ni fecha de emisión** (un
  ticket no los tiene). La pantalla de Integraciones lo dice cuando la cuenta va por la v2.
  · ⚠️⚠️ **A HOLDED VA EL NOMBRE DE LA FACTURACIÓN, NO NUESTRO NICK** (punto único `_billing_name`):
  la razón social de la sociedad o el **nombre y apellidos** de la persona (los datos oficiales), y
  solo como último recurso el nick. Con el nick, en Holded salía «Perico» en vez de «Pedro Ruiz
  Salas» y el contacto no cuadraba con su factura. Se usa en los gastos y en las liquidaciones.
  · ⚠️ **EL Nº DE FACTURA está en el gasto O EN SU FACTURA**: al subirla por el enlace del proveedor
  queda en la factura, así que mirando solo el gasto se subía **sin número** (y una factura de compra
  sin número no vale). Lo mismo con la fecha de emisión.
  · **La dirección del contacto es la FISCAL** y va en piezas (dirección, CP, municipio, provincia y
  país; en la v2, dentro de `bill_address` con su `country_code`): es lo que Holded necesita para dar
  de alta al proveedor.
  · ⚠️ **EL TAG es el NOMBRE DE LA BOLSA** (`_accounting_bag_tag` → `_accounting_bag_label`, el mismo
  que se ve en la columna «Bolsa»): así la etiqueta de Holded y la app dicen lo mismo. Sin nombre cae
  en lo que la identifica (la actividad y su fecha) y, de último, en el código de antes
  (`_accounting_bag_tag_legacy`). Una **liquidación de royalties** —que no tiene bolsa— se etiqueta
  «Liquidación de royalties» con el artista y su periodo.
  · **Qué se vuelca de cada gasto** (`_holded_upload_expense`): contacto (buscado por CIF/DNI/NIE en
  seco para NO duplicarlo, y creado con la dirección fiscal en piezas si no está) · nº de documento ·
  fecha de emisión · importe · concepto · impuestos (% de IVA y % de retención en la línea) ·
  **etiqueta** `Artista (o evento)_Actividad o municipio_Fecha` (`_accounting_bag_tag`, agrupa en
  Holded todo el gasto de una fecha) · forma de pago (`paymentMethodId` casado por nombre) · **nota
  interna** con cómo se pagó (`_accounting_internal_note`: «Pagado en remesa REM-… · banco · fecha»
  o «Pagado con Pleo · Caco») · y **el documento adjunto**. Un **ticket** no lleva contacto, ni nº, ni
  fecha, ni desglose de IVA: el total es el total.
  · **Si algo falla se DICE**: el motivo se guarda en `holded_error` y se enseña en la fila; los
  avisos de algo que sí ha entrado pero con matices (total que no cuadra, adjunto que no ha subido)
  en `holded_warning`. Un gasto con error NO cambia de estado.
  · El cliente se **reutiliza por petición** (cacheado en `g`) y guarda los contactos ya resueltos:
  subir 50 gastos del mismo proveedor busca el contacto UNA vez.
  · ⚠️⚠️ **HOLDED TIENE DOS APIS Y NO SE AUTENTICAN IGUAL** (ago 2026, la causa del 401 que no había
  forma de entender): la **v2** (`/api/v2/…`: `/v2/contacts`, `/v2/purchases`,
  `/v2/purchases/<id>/attachments`) va con los **TOKENS nuevos** (`pat_…`) y
  `Authorization: Bearer`, y la **v1** (`/api/invoicing/v1/…`) —«obsoleta pero disponible»— va con la
  **API Key clásica** en la cabecera `key`. **Un token nuevo contra la v1 da 401**, y al revés.
  · La versión va con la credencial: `api_version_for` (un `pat_…` es v2), el punto único
  **`HoldedClient._path`** construye la ruta de cada cosa según la versión, y lo que funcione se
  guarda en la cuenta (`endpoints['api_version']`), que la pantalla enseña con su etiqueta.
  · **«Probar conexión» es un DIAGNÓSTICO**: `HoldedClient.diagnose()` prueba las **tres cabeceras ×
  las rutas de las DOS versiones** y devuelve **lo que ha contestado cada intento**, que es lo que se
  pinta en Integraciones. Con eso se distingue de un vistazo: todo 401 = la credencial no vale ·
  alguna 200 y otras 403 = **le faltan PERMISOS al token**.
  ⚠️ Los «permisos que faltan» solo se cuentan **dentro de la versión que ha funcionado**: que la v1
  rechace a un token de la v2 es lo normal, no un permiso que falte.
  · **LOS CAMPOS DE LA v2 (confirmados con su OpenAPI: `api.holded.com/openapi/api2.json`)** son
  OTROS, así que cada versión tiene su builder y el punto único es
  **`contact_payload_for` / `purchase_payload_for`** (app.py no sabe de versiones):
    · **contacto** `POST /v2/contacts`: `name`* · `code` (el NIF/CIF) · `is_person` · `email` ·
      `phone` · `type: supplier` · **`bill_address`** {address, city, postal_code, province, country,
      country_code} — ojo, `snake_case` y `code`, no `vatnumber`.
    · **compra** `POST /v2/purchases`: `contact_id`* · `contact_name` · `date` **ISO** (no timestamp) ·
      `number` (el nº del proveedor) · `notes` · `description` · **`items`*** [{name, type: service,
      units, price, **`taxes: ["p_iva_21"]`**}] · `payment_method_id` · `tags`.
    · **adjuntar** `POST /v2/purchases/{id}/attachments` (multipart, campo `file`) — ruta conocida, no
      hay que buscarla como en la v1.
    · **buscar** `GET /v2/contacts?code=<CIF>` es **exacto**: se acabó recorrer páginas (y por nombre,
      `GET /v2/contacts/search?name=`).
  ⚠️ **El impuesto va como CLAVE por línea**, no como porcentaje: `client.tax_key_for(pct)` lee las
  taxes de la cuenta (`GET /v2/taxes`) y elige la del % pedido **prefiriendo las de COMPRA** (`p_`
  antes que `s_`); sin permiso para leerlas se cae a la convención `s_iva_<pct>` y, si no fuera la
  buena, **el total no cuadrará al releer el documento y se avisa** (nunca se da por bueno a ciegas).
  ⚠️ **La v2 no modela la retención en la línea**: se deja dicha en las notas y lo que se comprueba es
  base + IVA (la retención es una liquidación aparte).
  ⚠️ El **número** del documento se llama `document_number` en la v2 y `invoiceNum`/`docNumber` en la
  v1, y la v2 puede envolver la respuesta en `data`.

  · ⚠️⚠️ **CUANDO DICE «la clave no vale», LO PRIMERO ES SABER DE QUÉ EMPRESA ES LA CUENTA** (ago
  2026). Cada documento se contabiliza en **SU** empresa —una liquidación de royalties en **PIES**
  (`_royalty_holded_company`), un gasto de bolsa en la que promueve—, así que se puede tener una clave
  buena en una empresa y ninguna (o la de otra) en la que toca, y el 401 no decía cuál era. Ahora:
  · **`_holded_account_diagnosis`** le pega al error de quién es la cuenta («Es la cuenta de Holded de
  «Pies Records» (clave de 40 caracteres)»), avisa si la **cabecera está fijada a mano**, si esa
  **MISMA clave está en otra empresa** (una API Key de Holded es de UNA empresa) y si **en otra
  empresa sí hay una clave que funciona** — que es el despiste más habitual: pegarla donde no va.
  · **`_holded_accounts_status`** + el aviso de **Contabilidad**: el estado por empresa (sin clave ·
  desactivada · último error) con el botón para arreglarlo, ANTES de intentar subir nada.
  · El último error se apunta también **en la cuenta** (`_holded_remember_error` → `last_error`), que
  es lo que ya enseña Integraciones → Holded.
  ⚠️ Y **la cabecera fijada a mano ya no bloquea**: si no vale, se prueban igualmente las otras y se
  usa (y se recuerda) la que de verdad entra — fijar mal la cabecera dejaba la integración muerta con
  un «la clave no vale» que no era verdad.
  · ⚠️ **«Invalid key»**: pasó en la primera prueba real. Dos cosas lo provocan y las dos están
  cubiertas: (a) la clave se pega con basura invisible —espacios, saltos de línea, comillas o el
  propio «key:» delante—, así que se limpia al guardarla (`clean_api_key`) y se dice cuántos
  caracteres se han guardado; y (b) la CABECERA: la documentada es `key`, pero si Holded contesta que
  la clave no vale se prueban también `X-API-KEY` y `Authorization: Bearer`, y se **guarda la que
  funcione** (`endpoints['auth_header']`). El aviso de «Probar conexión» dice con cuál ha entrado.
  Si aun así falla, el mensaje repite el motivo exacto de Holded y recuerda que tiene que ser la
  **API Key** de Configuración → Desarrolladores (no el código de integración de una app del
  marketplace ni el secreto de un webhook) y que el plan debe incluir acceso a la API.
  · **La CABECERA se puede fijar a mano** (`HoldedAccount.auth_header`, selector en Integraciones):
  **Automática** (prueba `key`, `X-API-KEY` y `Authorization: Bearer` y se queda con la que va) o la
  que Holded haya indicado al crear la credencial —hay credenciales que Holded entrega diciendo
  literalmente «usa `Authorization: Bearer <tu_clave_secreta>`»—. Fijada, NO se prueban las otras: si
  falla, el problema es la clave.
  · ⚠️ **Y lo primero que hay que mirar cuando «no acepta la clave»: EN QUÉ RECUADRO se ha pegado.**
  Pasó de verdad: la clave de Holded se pegó en el de **Pleo** y el error («Pleo rechazó la
  credencial») venía de Pleo, no de Holded. Las claves de Pleo empiezan por `pls_`, así que al guardar
  una que no lo parece se avisa en el momento y se dice que la de Holded va en su pestaña.
  ⚠️ **Pendiente de la primera prueba real**: no hay cuenta de Holded para probar contra la API de
  verdad. El mapeo sigue su API documentada y está verificado con un Holded simulado (contacto que ya
  existe, ticket sin impuestos, total que no cuadra, adjunto que falla, `status:0`). La **primera
  subida real** es la que confirma los nombres de los campos: si Holded rechaza algo, el mensaje sale
  tal cual en la fila del gasto.

- **CONTABILIDAD · pendiente de contabilizar** (ago 2026, `contabilidad_view` +
  `templates/contabilidad.html` + `static/js/contabilidad.js`). Pestañas SERVIDAS (`?tab=`) con icono
  y contador: **Pendiente de contabilizar** (subpestañas **Facturas · Bolsas · Tickets · Sin
  ticket**) · **Contabilizado** · **Facturas** (el registro de siempre).
  · Lo que entra es lo que **ADMINISTRACIÓN HA VALIDADO**: gastos de bolsa consolidados
  (`BAG_CONSOLIDATED_STATUSES`, que incluye el «sin factura» aceptado) y sin contabilizar. La
  subpestaña se elige por `BagExpense.document_type` (FACTURA / TICKET / SIN_DOCUMENTO).
  · **ESTADO CONTABLE en el propio gasto** (`BagExpense.accounting_status`: PENDIENTE · SUBIDO ·
  CONTABILIZADO · OMITIDO, punto único `_accounting_set_status`), así que la etiqueta
  «Contabilizado» —con **la fecha al pasar el ratón**— se ve también en la **bolsa** (`_bag_panel.html`)
  y en pendiente de pago. **Omitir** = no se contabiliza y ahí acaba su proceso (se puede devolver a
  pendiente). La etiqueta se cambia **pinchándola** (avanza en su ciclo).
  · ⚠️ **En «pendiente», los botones de contabilizar van en AMARILLO** (`btn-outline-warning`, ago
  2026): el **VERDE está reservado a la ETIQUETA de «ya contabilizado»**, y en verde la ACCIÓN se
  confundía con el ESTADO. Vale para los tres: la fila de una liquidación («Contabilizada»), la barra
  de selección («Marcar como contabilizado») y la cabecera de una bolsa («Contabilizar todos»).
  · Arriba, **«Subir todo a Holded»** y «Comprobar en Holded»; **casilla por gasto** con barra de
  acciones en bloque (subir / marcar contabilizado); **filtros por estado** con su icono; tres
  puntitos por fila (subir, descargar, compartir por correo/WhatsApp/SMS, editar, omitir) y el icono
  de la factura, que la abre **en un pop-up**.
  · **Bolsas**: una tarjeta por bolsa con su **cabecera** (foto del artista, tipo de actividad, fecha,
  recinto, municipio, empresa y la etiqueta de Holded) que se despliega con sus gastos —cada uno con
  su pastilla Factura/Ticket/Sin ticket— y botones de subir todos / contabilizar todos. Cuando **todos
  sus gastos están contabilizados u omitidos** la bolsa se cierra para contabilidad
  (`accounting_done_at`), se archiva y desaparece de pendiente (`_accounting_bag_close_if_done`).
  ⚠️ Ese helper hace `session_db.flush()` antes de contar: la sesión es **`autoflush=False`** y sin él
  la consulta no veía los estados recién cambiados, así que marcar la bolsa entera de golpe dejaba
  `accounting_done_at` a null (bug real).
  · **Detección automática**: al abrir la pestaña, si hay documentos SUBIDOS y hace más de 15 min que
  no se pregunta, se consulta a Holded **en segundo plano** (`_holded_autodetect_bg`; en primer plano
  serían decenas de llamadas y la pantalla se quedaría colgada) y hay cron
  `/cron/holded/refresh?key=HOLDED_CRON_KEY`. Lo que Holded no diga **no se toca**: mejor no saberlo
  que inventarlo.
  · ⚠️ **LO CONTABILIZADO SE VE EN «CONTABILIZADO»** (corregido ago 2026): lo que se marcaba
  desaparecía —se iba de pendiente y no salía en ninguna otra pestaña—. Dos causas, las dos
  arregladas: la consulta de esa pestaña exigía además que el gasto siguiera **validado por
  administración** (`consolidation_status`), que es un filtro de lo PENDIENTE y no de lo hecho (con
  `only_done` ya no se aplica: lo que se marcó se ve siempre); y las **liquidaciones de royalties**
  contabilizadas no se listaban en ningún sitio → módulo nuevo `_royalty_accounting_done_rows` en esa
  pestaña, con su botón para devolverlas a pendiente.
  · **Royalties**: ⚠️ ya **no hay módulo aparte** (ago 2026): una liquidación **ES una factura**, así
  que las pendientes se listan **en la subpestaña FACTURAS**, como una fila más de la misma tabla
  (macro `roy_row`, sin casilla —no es un gasto de bolsa— y con su acción «Contabilizada»), y cuentan
  en el número de «Facturas». Todo lo pendiente está en su módulo: una factura suelta en Facturas y
  las bolsas en Bolsas, que se despliegan con su contenido. Las liquidaciones ya contabilizadas
  siguen teniendo su módulo en la pestaña «Contabilizado». `_royalty_accounting_pending_rows`
  **exige que su factura esté VALIDADA** — sin ese cruce se colaban
  las que alguien había marcado pagadas a mano sin factura (las pruebas antiguas, ninguna con número).
  · ⚠️⚠️ **CHOQUE DE CLASES: la tabla se veía APILADA** (bug real, ago 2026). Las filas de la tabla de
  contabilidad llevaban `class="acc-row"`… que YA EXISTÍA para las filas de **PERMISOS**
  (`div.acc-row { display:grid; grid-template-columns:1fr auto }`), así que cada `<tr>` se pintaba
  como una rejilla de DOS columnas y las celdas salían una debajo de otra en las cuatro subpestañas.
  Ahora la de contabilidad es **`acct-row`** y la de permisos está acotada a `div.acc-row`, para que
  no vuelva a pasar. Las cuatro subpestañas usan las MISMAS macros (`acc_head`/`acc_row`), así que se
  ven y se operan igual: 14 columnas (13 dentro de una bolsa, que no repite la columna «Bolsa»).
  · ⚠️ **Todo va en UN SOLO formulario** y las acciones de cada fila usan **`formaction`** en su botón
  (un formulario dentro de otro no es HTML válido). Para que eso funcione con `data-inline`,
  `ajax_inline.js` ahora respeta el **botón que envía**: su `formaction`/`formmethod` y su
  `data-confirm` (antes siempre usaba `form.action`, así que cualquier acción de fila habría ido al
  endpoint del formulario).
  · Los endpoints son `accounting_*` (mapeados a la sección `contabilidad`) y el permiso de edición es
  **`can_edit_accounting()`**.

- **CONTABILIDAD · la tabla se lee, y el % es el TIPO REAL** (ago 2026):
  · **FILTRO POR EMPRESA con su logo** (`_accounting_company_filters` + `.acct-cofilter`), la misma
  idea que la rejilla de artistas de Discográfica: salen todas con su logo y lo que tienen pendiente,
  y al pinchar una **solo se ve lo suyo** (`?empresa=<id>`, se conserva entre pestañas). ⚠️ El
  formulario lleva la empresa pinchada, así que **«Subir todo a Holded» no toca lo de otra empresa**
  (`_accounting_company_scope_from_form`).
  · **CORREGIR LOS DATOS** desde los tres puntitos: **«Corregir los importes»** (el pop-up de
  siempre) y **«Corregir los datos de la factura»**, que abre la pantalla partida de la factura
  (`supplier_invoice_edit`) y **vuelve a contabilidad** al guardar (`?next=`).
  ⚠️⚠️ Corregir los importes toca **el gasto Y SU FACTURA** (`_accounting_expense_invoice`, punto
  único): en esta tabla manda lo que dice la FACTURA (`_accounting_amounts`), así que tocando solo el
  gasto no cambiaba nada de lo que se ve y parecía que no se guardaba. Los **porcentajes se
  recalculan** del importe corregido y se ajustan al tipo real.
  · **CON LOGO NO SE ESCRIBE EL NOMBRE** de la empresa (el logo ya lo dice y la tabla se lee mucho
  mejor); el nombre solo sale cuando no hay logo. En los dos casos, al pasar el ratón.
  · **LAS COLUMNAS SE ENTIENDEN**: la cabecera va en **dos filas** —los bloques (**El documento ·
  Importes · Estado**) y debajo cada columna con su icono—, hay **columna de EMPRESA con su logo**
  (`acc_company`), y el **IVA y la retención llevan el importe arriba y su % debajo** (`acc_tax`).
  ⚠️ El `colspan` de la fila de grupos tiene que cuadrar con las columnas de abajo: se comprueba
  contando `th`/`td` (un descuadre no da error, solo desalinea toda la tabla).
  · **LA BOLSA dice qué es**: su nombre (o lo que la identifica: la actividad y su fecha) y, en una
  **liquidación de royalties** —que no tiene bolsa—, la etiqueta «Liquidación de royalties» con el
  **artista**. El nombre de la empresa ya no se repite ahí: tiene su columna.
  · **LA ALERTA, resumida** (`acc_alert`): un icono con el motivo al pasar el ratón. El texto largo del
  error de Holded empujaba los botones («ver factura» y los tres puntitos) a la derecha y la fila se
  leía fatal.
  ⚠️⚠️ **EL PORCENTAJE ES EL TIPO REAL, NO EL DESPEJADO** (`_tax_pct_snap` + `VAT_RATES` /
  `RETENTION_RATES`, punto único): una factura del **21%** salía como **20,99%** porque el % se
  despeja dividiendo dos importes **ya redondeados a céntimos** (con base 100,05 e IVA 21,00 sale
  20,99). Los tipos son LEGALES, así que si el número está a menos de `TAX_PCT_SNAP` (0,30) de uno de
  ellos, **es ese**. Se aplica al calcularlo, a lo que viene GUARDADO en la factura (arregla las de
  antes) y al guardar lo que se lee del documento.

- **CONTABILIDAD · «EDITAR LOS DATOS DE LA FACTURA», en TODAS las filas** (ago 2026). Antes había
  dos opciones a medias en los tres puntitos: **«Corregir los importes»** (un pop-up que en realidad
  ya editaba concepto, nº, fecha e importes) y **«Corregir los datos de la factura»**, que solo salía
  **si el gasto tenía una `SupplierInvoice` registrada** — así que en la mayoría de las filas no
  había forma de encontrar dónde se editan los datos. Ahora es **UNA sola opción con ese nombre**,
  presente en las cuatro subpestañas, dentro de las bolsas, en «Contabilizado» y también en la fila
  de una **liquidación de royalties** (que antes no tenía nada que editar).
  · **El pop-up es una pantalla partida**: **el documento a la izquierda** —que es lo que se está
  copiando— y sus datos a la derecha (reutiliza las clases `.inv-split*`, así que se ve igual que la
  pantalla de la base de facturas). Sin documento subido lo **dice** y deja corregir los datos
  igualmente. Abajo a la izquierda, **«Abrirla en la base de facturas»** cuando hay factura
  registrada (ahí se reemplaza, se rechaza o se elimina).
  ⚠️ **La URL del formulario la manda la PLANTILLA** (`data-acc-action`), no la construye el JS: por
  eso el MISMO pop-up sirve para un gasto (`accounting_expense_edit`, que escribe **el gasto y su
  factura** porque en esta tabla manda lo que dice la factura) y para la factura de una liquidación
  (**`accounting_royalty_invoice_edit`**, que solo tiene factura).
  · Punto único **`_invoice_apply_manual_data(inv, form)`**: nº, fecha, concepto e importes, con los
  **porcentajes recalculados y ajustados al tipo real** (`_tax_pct_snap`).
  ⚠️ **Solo escribe lo que llega con valor**: un campo vacío NO borra lo que había — al revés que
  `supplier_invoice_data_save`, donde un hueco vacío se guarda como NULL (`_invoice_amount_fields_from_form`
  devuelve None) y **borra** el dato. Aquí se está corrigiendo un dato mal leído, no vaciando la factura.
  ⚠️ **El IVA se llama `amount_tax` en `BagExpense` y `amount_vat` en `SupplierInvoice`**, y el gasto
  **no tiene** `vat_pct`/`retention_pct`: copiar importes de una a otra exige traducir.
  ⚠️ **`data-acc-edit-doc`, no `data-acc-doc`**: el visor de documentos de la pantalla se engancha a
  `[data-acc-doc]` por delegación, así que con ese nombre el mismo clic habría abierto DOS pop-ups.
  ⚠️⚠️ **LO QUE SE EDITA SON LOS IMPORTES GUARDADOS, NO LOS DEDUCIDOS** (bug de dinero, corregido
  en el mismo lote): la tabla ENSEÑA importes calculados (en un ticket, base = total e IVA = 0; en
  una factura sin base, la base despejada), y rellenar el pop-up con eso y darle a **Guardar** los
  escribía como si alguien los hubiera leído del documento — y una **retención «0»** donde no había
  nada **cambia lo que se paga en la remesa** (`_expense_retention` distingue el 0 del NULL) y hace
  aparecer la factura en la pestaña de **Retenciones**, que es un listado fiscal. Punto único
  **`_accounting_stored_amounts`** (+ `_money_edit_text`): **campo a campo**, manda la factura y, si
  ese dato no está guardado ahí, el del gasto — y **un 0 sale VACÍO**, que es la convención de la
  casa en los formularios de importes (`_invoice_amount_fields_from_form` guarda el 0 como NULL:
  «no lo sé» no es «cero»).
  ⚠️ **Vaciar el nº o la fecha los limpia TAMBIÉN en la factura**: la tabla enseña el del gasto **o**
  el de la factura, así que limpiando solo el gasto reaparecía el de la factura y parecía que no se
  había guardado.
  ⚠️ Los importes llevan **`data-money`** y se rellenan «1.234,56» como en el resto de la casa: era
  el único formulario de dinero que iba con el `Decimal` en crudo, y quien escribiera «1.234» a la
  española guardaba 1,23 €.
  ⚠️ **Corregir un dato es EL TRABAJO de contabilidad**: `supplier_invoice_edit` exigía
  `can_edit_invoices()` mientras el menú se pinta con `can_edit_accounting()`, así que quien es de
  contabilidad sin edición en la base de facturas veía la opción y se comía un **403** (bug real).
  Punto único **`can_edit_invoice_data()`** = las dos cosas; eliminar, reemplazar y rechazar siguen
  siendo de la base de facturas.
  ⚠️⚠️ Y el **gate** hay que arreglarlo en `_resolve_request_resource_key` **POR DELANTE** de la regla
  que manda todo `supplier_invoice*` a `databases.invoices`: puesta debajo era **código muerto**
  (la misma trampa que ya documenta la resolución de `contabilidad_view`). Punto único
  **`_first_access_key(claves, default)`** — «la primera de estas claves que el usuario tenga» — con
  `INVOICE_EDIT_ACCESS_KEYS` (base de facturas · contabilidad) y `ACCOUNTING_ACTION_ACCESS_KEYS`
  (pendiente · **contabilizado**, que es HERMANA y no descendiente: sin ella, quien solo tuviera esa
  pestaña se comía un 403 al devolver algo a pendiente).
  · Y en la fila de una liquidación se retiró el «Holded: nº» de texto: eso ya lo dice el **icono**.

- **ANULAR una factura o compensarla con una RECTIFICATIVA** (ago 2026). Una factura mal emitida no
  se borra: se **anula** o se **rectifica**, y las dos opciones están en los **tres puntitos** de
  cualquier factura de la base (`invoices.html`, con `can_edit_invoice_data()`).
  · **ANULAR** (`supplier_invoice_void`, estado **`ANULADA`** + `voided_at/by/reason`): **no se
  contabiliza**, se archiva y se cierra. Suelta lo que arrastraba (`_supplier_invoice_release`: su
  imputación a los gastos y, si era la de una liquidación de royalties, la liquidación vuelve a estar
  pendiente de factura) y su gasto pasa a **OMITIDO** en contabilidad. **Se puede deshacer**
  (`undo=1`) mientras no haya rectificativa.
  · **RECTIFICATIVA** (`supplier_invoice_rectify`): se sube el archivo y sus datos, y se crea una
  factura NUEVA **VALIDADA** (la sube administración, que es quien valida) con
  **`rectifies_invoice_id`** = la original; la original pasa a **`RECTIFICADA`** con
  **`rectified_by_invoice_id`**. **Son UNA sola cosa**: las dos quedan imputadas al MISMO gasto y las
  dos llegan a contabilidad.
  ⚠️ El gasto **sale de pendiente de pago** con un estado propio, **`COMPENSADO`** («Compensado con la
  rectificativa»): no se dice que se ha pagado —que no es verdad—, y como la consulta de pendiente de
  pago es una lista de estados INCLUIDOS (`NO_PAGADO`/`PENDIENTE`/`PARCIAL`), sale solo.
  ⚠️ Los importes del pop-up salen de la original (se cambian si la rectificativa dice otra cosa) y en
  la fila de las DOS se dice el vínculo, que es lo que las convierte en una acción única.
  ⚠️ **El par NO se fusiona en la base de facturas**: `_supplier_invoice_same_doc_key` agrupa por
  archivo o por nº+importe, y una rectificativa con el mismo importe (o sin número puesto) se habría
  pintado como una copia de la original. Lo que esté vinculado como original/rectificativa se
  identifica siempre por su id.
  ⚠️ Una factura **ANULADA o RECTIFICADA no sale en la pestaña de Retenciones**: no vale, así que su
  retención no se declara (la de la rectificativa sí, que es la que vale).
  ⚠️ Y de paso: **RECHAZAR una factura ya suelta su imputación** a los gastos. Antes solo actuaba
  sobre la liquidación de royalties, así que un gasto de bolsa se quedaba con una factura RECHAZADA
  detrás contando su importe —y seguía en pendiente de pago y en contabilidad—.

- ⚠️⚠️ **HOLDED · NO SE DUPLICAN CONTACTOS NI DOCUMENTOS** (ago 2026):
  · **El contacto se BUSCA antes de crearlo, y en tres pasos** (punto único
  `_holded_contact_for_promoter`): (1) el que ya se le apuntó a ese tercero **en esa empresa**
  (`Promoter.holded_contact_ids` = `{company_id: contact_id}`, columna nueva: cada empresa del grupo
  es una cuenta de Holded distinta), (2) el que haya en Holded **por NIF/CIF** y, si no aparece,
  **por el NOMBRE DE LA FACTURACIÓN** (`_billing_name`, nunca el nick), y (3) solo entonces se crea.
  ⚠️ Ese segundo intento por NOMBRE es el que evita el duplicado de verdad: en Holded hay contactos
  dados de alta a mano **sin NIF**, y antes `find_contact` se rendía tras la búsqueda exacta por
  `code` y creaba otro. Si se reutiliza uno sin NIF se avisa para añadírselo allí.
  ⚠️ Lo recuerdan **`Promoter` Y `PromoterCompany`**: cuando factura la sociedad es ELLA la que se da
  de alta en Holded, y sin su columna la asignación se perdía en silencio (`getattr` con defecto +
  `try/except`), así que a ese proveedor se le buscaba —o se le creaba— el contacto en cada gasto.
  ⚠️ **«No está» y «no he podido preguntar» no son lo mismo**: `find_contact(..., raise_on_error=True)`
  propaga un 403 (falta permiso) o un 429; devolviendo None se creaba un contacto que ya existía.
  ⚠️ **`create_contact` SIEMBRA el caché del cliente** (por CIF y por nombre): el siguiente gasto del
  mismo proveedor en esa misma petición no vuelve a buscar (se había cacheado el «no está») ni a
  crear — y eso **sobrevive al savepoint** de «Subir todo», que deshace la BD aunque en Holded el
  contacto ya esté creado.
  ⚠️ **Persona o empresa lo dice el CIF** (`_tax_id_kind`): con uno que empieza por letra va como
  EMPRESA aunque en nuestra base esté como tercero particular.
  · **UNA FACTURA NO SE SUBE DOS VECES**: si ya tiene `holded_doc_id`, la subida se **rechaza con un
  error** (no un aviso) en el punto único de la subida —así vale para el botón de la fila, para
  «Subir todo» y para lo que venga—, porque un documento duplicado en la contabilidad no lo arregla
  nadie desde aquí. «Subir todo» dice cuántas se ha saltado por eso.
  · **El emisor de la factura de una LIQUIDACIÓN es el proveedor de SU factura**
  (`_royalty_beneficiary_promoter` lo mira PRIMERO): al subirla por el enlace de esa liquidación,
  quien la sube se identifica y la factura se guarda con su `promoter_id`. Mirando solo el
  beneficiario, una liquidación de un artista sin integrantes salía como «no se sabe quién emite esta
  factura» teniéndola delante (bug real). El beneficiario queda como respaldo para cuando aún no hay
  factura.
- **CONTABILIDAD · el filtro que hace falta es «SIN SUBIR A HOLDED»** (ago 2026): el filtro de
  estado «Pendiente» no decía nada (en esa pestaña TODO está pendiente de contabilizar) y se
  sustituye por **`ACCOUNTING_FILTER_NO_HOLDED`** («Sin subir a Holded», `holded_doc_id` vacío), que
  es el trabajo que queda. Y el **filtro de EMPRESA va por encima de las pestañas**, que es lo
  primero que se elige.
- ⚠️ **LA RETENCIÓN SOLO SE PIDE SI LA FACTURA LA LLEVA** (ago 2026): en el formulario del proveedor
  el campo nace **oculto** y solo sale si el lector la ha detectado (o si se pincha «Esta factura
  lleva retención»). Un hueco de retención vacío invita a rellenarlo, y una retención que la factura
  no tiene **descuadra los importes** y mete la factura en el listado fiscal de **Retenciones**.

- ⚠️⚠️ **SUBIR A HOLDED NO ES CONTABILIZAR** (ago 2026). En la fila hay **un icono de Holded**
  (macro `acc_holded` de `contabilidad.html`, clases `.acct-holded` / `.acct-holded.is-up`) **antes**
  de la etiqueta de estado: **verde** cuando el documento ya está en Holded (con su número y cuándo se
  subió al pasar el ratón) y **gris** cuando todavía no. Y el gasto pasa a **CONTABILIZADO solo cuando
  HOLDED LO TIENE GUARDADO**, no al subirlo: la subida deja `accounting_status='SUBIDO'` y es el
  sondeo (`_holded_refresh_accounted`, cada 15 min al abrir Contabilidad + su cron) el que pregunta y
  lo marca, con `accounting_by_nick='Holded'`.
  · Punto único **`HoldedClient.document_is_accounted`**: relee el documento y lo da por guardado si
  trae `accounting_date` o `approved_at` (`ACCOUNTED_DATE_FIELDS`, más los flags de
  `ACCOUNTED_FLAG_FIELDS`). ⚠️ **Un BORRADOR nunca cuenta** (`draft: true` → False, se comprueba
  ANTES que las fechas): en Holded un borrador puede llevar fecha contable y no está guardado.
  · **Las LIQUIDACIONES de royalties van igual** (`_holded_refresh_accounted_royalties`, llamada al
  final del sondeo): `accounted_at` + `accounted_by_nick='Holded'` cuando Holded las tiene.
  ⚠️ Y **el disparador del sondeo las cuenta** (`_holded_autodetect_due` suma las liquidaciones con
  `holded_doc_id` y sin `accounted_at`): mirando solo los `BagExpense`, una casa con solo
  liquidaciones subidas no habría preguntado nunca y se habrían quedado en «subida» para siempre.

- **CONTABILIDAD · «Contabilizado» se lee IGUAL que «Pendiente»** (ago 2026): las **mismas
  subpestañas** con sus iconos (Facturas · Bolsas · Tickets · Sin ticket) y las mismas columnas, pero
  **SIN contadores** —ni en la subpestaña ni en la pestaña principal—: es un archivo que solo crece y
  un número ahí no dice nada (los números son de lo que está PENDIENTE). Las bolsas ya contabilizadas
  las agrupa `_accounting_bag_groups(..., only_done=True)` (con `only_done` **no** corre el autocurado
  de «cerrada para contabilidad»: esa regla es de lo pendiente) y las liquidaciones contabilizadas van
  en la tabla de **Facturas**, no en un módulo aparte.
  ⚠️ **Fuera la pestaña «Facturas»** (la de después de Retenciones): repetía lo que ya está en Bases de
  datos → Facturas. Un `?tab=facturas` de un enlace antiguo cae en «Pendiente».

- ⚠️⚠️ **LO QUE TIENE QUE CUADRAR DE UNA FACTURA ES LA BASE, NO EL TOTAL** (ago 2026). La
  **retención** es la que diga la factura: baja el importe a pagar, pero **no cambia lo que se ha
  facturado ni lo que cuesta el gasto** (lo retenido lo ingresa la casa en Hacienda). Antes
  `_invoice_amount_check` comparaba el TOTAL, así que una factura con retención cuya retención no se
  hubiera leído bien se rechazaba con «faltan X €» y el proveedor no podía enviarla (bug real). Ahora
  cuadra si: **la base es la esperada** · base + IVA es el bruto esperado · total + retención es el
  bruto esperado · el total es el bruto esperado · o el total es la base (facturado sin IVA). El aviso
  se da en términos de BASE y dice que la retención no cuenta para esto.
  · **La BASE es un dato OBLIGATORIO** al subir: es el número contra el que se compara.
  `_invoice_required_data_check` (comprobación del SERVIDOR, no solo del navegador) exige número,
  fecha de emisión, **base** e importe total; si algo no se pudo leer, se dice cuál y no se envía.
  · **Si alguna se cuela sin datos**, se avisa y se puede corregir a mano:
  `_supplier_invoice_missing_fields` marca qué falta y la bandeja de royalties (y el bloque de
  facturas sueltas) enseña el aviso con botón **«Completar los datos a mano»** →
  `supplier_invoice_edit` (pantalla partida). Al completarlos la factura sigue su proceso normal.

- **CONTABILIDAD · pestaña RETENCIONES** (`_accounting_retention_rows`): todas las facturas recibidas
  **con retención** y sus importes (proveedor y CIF, nº, emisión, **trimestre**, concepto, de dónde
  viene —liquidación de royalties, bolsa o gasto de una persona—, base, IVA, retención con su %, total
  y estado), con **total retenido**, resumen **por trimestre** (que es como se declara) y filtro por
  año. ⚠️ En la cabecera se dice lo importante: **la retención no se descuenta del gasto**.

- **CONTABILIDAD · RETENCIONES: los TRES estados en su orden** (ago 2026): validada → **pagada** →
  contabilizada. El **pago es un EURO** (`fa-euro-sign`): **verde pagado, amarillo sin pagar**, y al
  pasar el ratón dice **cuándo se pagó y en qué remesa** (o de qué forma: Pleo, transferencia…). Detrás
  va la etiqueta **«Sin contabilizar» en amarillo / «Contabilizado» en verde** (con su fecha en el
  tooltip). Motor **`_retention_status_map`**, que resuelve los dos estados según de qué cuelgue la
  factura —liquidación de royalties (`paid_at`/`payment_batch_id`/`accounted_at`) o gasto de bolsa
  (`payment_status`/`payment_batch_id`/`accounting_status`)— **en consultas en bloque**: son cientos de
  filas y una consulta por factura sería inaceptable.
  ⚠️ Un `BagExpense` **no tiene columna con la fecha de pago**: la buena es la de su REMESA
  (`execution_date`/`paid_at`) y, si se pagó a mano, la última vez que se tocó el gasto.

- ⚠️⚠️⚠️ **UN IMPORTE CON TEXTO DETRÁS SE LEÍA MAL: «1.500 € + IVA» daba 1,5 €** (bug real de
  DINERO, sep 2026; lo sacó el importe orientativo de una petición). Un importe casi nunca llega
  solo: viene con su moneda y su nota. Quitar las letras a secas **PEGA las cifras de todo lo que
  haya** —«1.500 € + IVA (21%)» se quedaba en **1,50021**— y, peor, el texto de detrás **rompe la
  regla de los separadores**, así que el respaldo leía el punto como DECIMAL.
  · Punto único **`_money_first_number(texto)`**: recorta **EL PRIMER NÚMERO** (respetando el signo)
  **ANTES** de aplicar la regla de los separadores, y lo usan los DOS parsers
  (`_parse_money_decimal` y `_parse_pct_decimal`, donde un «21% (mínimo 500)» daba **21500%**).
  ⚠️ Espejado en los otros tres motores (regla de la casa): **`toCanonical`** de `money_input.js`
  y **`clean_money`** de `buyer_import.py` (`invoice_read.parse_amount` ya era inmune: extrae la
  coincidencia con su propio regex). **Si se toca uno, se tocan los cuatro.**
  · **`_fee_text_amount`** es el punto único del «importe orientativo» de una petición (texto
  libre): coge el primer número, y **si el texto EMPIEZA por un PORCENTAJE no vuelca nada** («el 20%
  de la taquilla» → en blanco; poner 20 € de caché sería peor). ⚠️ El importe de una petición vive
  en **`BookingRequest.fee_text`**, no en su payload.
  · **PRUEBA DE REGRESIÓN**: `python3 tools/check_money.py` (los casos del texto pegado están en el
  bloque 1). Comprobado además en el navegador: los 12 casos dan lo mismo en `numv` y en el servidor.

- **CONTABILIDAD · ahí no se avisa del estado de las INTEGRACIONES** (ago 2026): el aviso de
  «empresas sin conexión lista» y el botón de configurar Holded se retiraron de esa pantalla —es para
  contabilizar, y las claves se ven y se arreglan en **Integraciones → Holded**—. Lo que queda es lo
  útil en su sitio: el botón de subir de esa fila sale **desactivado** diciendo que su empresa no
  tiene Holded.
- **Administración · contadores y REPARTO de tareas** (ago 2026):
  · **Contadores**: `_admin_pending_counts(session_db)` es el motor único de los números de las
  pestañas y subpestañas (solo `func.count`, sin cargar filas), así que van al día se mire desde
  donde se mire. `administracion_view` carga **las listas solo de la pestaña activa** (antes cargaba
  las 8 siempre + un N+1 por bolsa). Las bolsas de «De liquidación» / «De cierre» usan
  `ADMIN_BAG_LIQUIDACION_STATUSES` / `ADMIN_BAG_CIERRE_STATUSES`, compartidas con la plantilla, para
  que el número y las filas no discrepen. Nuevo `counts['altas']` (`_admin_altas_pending_count`:
  empresas con el ITA caducado o sin subir). Las subpestañas de EMBARGOS («Activas»/«Archivadas»)
  **no llevan contador** a propósito (no son pendientes) y `embargo_counts` ya no existe.
  · **Reparto por persona**: `UserProfile.admin_responsibilities` (JSONB) con las claves de
  `ADMIN_RESPONSIBILITIES` (liquidar bolsas · facturas pedidas · pagos · gastos de oficina · gastos
  sin ticket · ITAs · embargos). **Tres reglas**: sin reparto propio se ve TODO; una tarea sin
  responsable la ven TODOS (nada se pierde en silencio); y la responsabilidad **filtra, nunca
  concede** (sin el permiso de la sección sigue habiendo 403). Dirección lo ve todo.
  Helpers `_normalize_admin_responsibilities` · `_admin_responsible_user_ids` (exige seguir en el
  departamento Administración y excluye inactivos) · `_administration_people` ·
  `_admin_task_is_mine`. Se edita en la ficha de personal (**solo dirección**, panel condicionado al
  departamento) con **centinela `responsibilities_present`** —sin él, cualquier POST parcial al
  formulario monolítico borraría el reparto— y el panel **deshabilita** sus inputs al ocultarse
  (ocultar no basta: se enviaban igual; mismo bug que tenían los artistas asignados). Se ve en el
  módulo de Inicio `HOME_ADMIN_PENDING` (`_home_admin_pending`) y con un punto rojo
  (`.admin-mine-dot`) en las pestañas propias de `/administracion`.
  ⚠️ `_snapshot_user_profile` es un `SimpleNamespace`: **lo que no esté ahí es invisible** desde
  `_current_user_state()` y desde las plantillas (por eso se añadió también `admin_responsibilities`
  al estado y al alta de `_ensure_user_profile`, cuyo bucle de kwargs solo corre al ACTUALIZAR).
- **Subida de ÓRDENES DE EMBARGO con arrastre** (`templates/administracion.html`,
  `administration_embargo_upload`): se pueden arrastrar ficheros sueltos o **carpetas enteras**
  (mismo patrón que el modal de carteles: `webkitGetAsEntry` + `readEntries` paginado), se envían en
  **lotes de 8** por XHR para no cargar una carpeta grande en la memoria del worker, y cada PDF va
  en su **savepoint**: uno que falle no se lleva por delante a los demás. El nombre se valida y se
  guarda por su **basename** (de una carpeta llega la ruta completa). Responde **JSON** con el
  desglose (`created`/`pending_review`/`archived`/`errores`) cuando la petición es XHR y mantiene
  `flash`+redirect para el formulario clásico. ⚠️ La zona lleva `data-file-drop="off"` (si no,
  `static/js/file_drop.js` intercepta el drop y descarta las carpetas) y la cabecera CSRF va **a
  mano** (`csrf.js` parchea `fetch`, no `XMLHttpRequest`).
- **FACTURAS DE UN PAGO · tres puntitos con editar y eliminar** (ago 2026): las facturas que se suben
  en el plan de facturación/cobro (`Concert.payment_terms_json[i]`: `invoice_url`, `invoice_name`,
  `invoiced_at`) llevan al final un menú **⋯** con **Ver la factura** · **Editar (subir otra)** —
  reutiliza `concert_payment_upload_invoice`, que sobreescribe— y **Eliminar la factura**
  (`concert_payment_delete_invoice`). Está en los DOS sitios donde se ven: la pestaña **Facturación**
  de Contratación (`concerts.html`) y el plan de facturación **dentro de la actividad**
  (`concert_detail.html`); el menú solo se pinta si hay factura (`row.has_invoice`).
  ⚠️ Al eliminarla, un pago que estuviera **marcado como cobrado vuelve a pendiente**: la regla de la
  casa es que no se puede dar por cobrado un pago sin factura, así que dejarlo cobrado y sin factura
  sería dejarlo diciendo algo que no es. El archivo de Storage no se borra: se suelta el vínculo.

- **Bases de datos → Facturas · «Subidas por terceros»** (pestaña por defecto): TODAS las facturas
  que entran por la app (`SupplierInvoice`: enlace general, petición de una bolsa, factura de una
  liquidación de royalties o dirigida a una persona), **agrupadas por el tercero que las emite**
  (`_supplier_invoice_groups`), con su origen, su estado y el motivo del rechazo. Las pestañas
  «Recibidas»/«Emitidas» siguen siendo el registro manual (`InvoiceRecord`), que es otra tabla. El
  buscador casa **por palabras** contra el nombre/nick/CIF del tercero (eso no se puede filtrar en la
  consulta porque no está en la tabla de la factura).

- **Subir factura · paso 3 por TIPO DE ALTA y datos solo si no se detectan** (ago 2026):
  · A un **particular** se le pregunta primero **cómo factura** (`BILLING_WORKER_TYPES`: autónomo /
  alta puntual) y la respuesta se **graba en su ficha** (`Promoter.prl_type`, el mismo campo del PRL),
  así que en la siguiente factura ya no se le pregunta. De ahí salen sus papeles
  (`BILLING_ALTA_DOCS`): autónomo → **último recibo de autónomos**; alta puntual → **alta y baja**.
  · La **vigencia del alta puntual se mide contra la FECHA DE EMISIÓN de la factura** (alta y baja
  **incluidas**): `_billing_alta_doc_ok` reutiliza `_prl_doc_valid_on`, y los documentos se guardan con
  `_prl_store_upload`, que ya lee sus fechas del propio PDF. `_billing_docs_state(…, worker_type,
  issue_date)` y `public_invoice_docs_state` aceptan las dos cosas.
  · **Nº de factura, fecha de emisión, artista y concepto se piden DESPUÉS de subir la factura y solo
  los que no se han podido leer** (`#invMetaBox` nace oculto y cada campo lleva `data-meta-field`).
  `_detect_invoice_meta` saca además el **concepto** (línea tras «concepto/descripción/detalle») y
  `public_invoice_detect` el **artista**, casando el texto contra los nombres de artistas que tenemos
  (lo único fiable; el texto del PDF NO se devuelve al navegador).
  · Los datos que se rellenan al identificarse ya se guardaban en el tercero
  (`public_invoice_register`: nombre, CIF/DNI, dirección fiscal, email, teléfono, cuenta, sociedad y
  contacto); queda verificado con prueba.
  · **IMPORTE, IVA y RETENCIÓN se LEEN de la propia factura** (`_detect_invoice_amounts`, dentro de
  `_detect_invoice_meta`): base imponible, cuota de IVA, retención/IRPF y total, con sus porcentajes
  (`_INV_MONEY_RES`/`_INV_PCT_RES`). Con dos de los tres se **despeja** el que falte y si el desglose
  no cuadra (`base + IVA − retención ≠ total`) se avisa en vez de callar. Se guardan en
  `SupplierInvoice.amount_net/amount_vat/vat_pct/retention_amount/retention_pct` (+ `amount_gross`)
  con **`_invoice_amount_fields_from_form`**, que usan los TRES caminos de subida (liquidación,
  petición de bolsa y enlace general). En el formulario los campos nacen ocultos y solo se piden los
  que no se han leído; el de retención solo sale si la factura la trae. Ese desglose es el que se
  enseña en el resumen del pago y en la pantalla de validar (que lo prefiere al recálculo cuando la
  factura trae total). ⚠️ Un 0 no es «no lo sé»: los campos vacíos se guardan como NULL.

- **SUBIR UNA FACTURA = UN SOLO MÓDULO** (ago 2026). Da igual desde dónde se haga: el enlace del
  proveedor, la petición de un gasto, la liquidación de royalties y la subida **DESDE DENTRO** pasan
  todas por `templates/public_invoice_landing.html` + `public_invoice_detect` +
  **`public_invoice_upload`** (el ÚNICO sitio por el que entra una factura). Así, lo que se mejore ahí
  vale para todos.
  · **Desde dentro** (los tres puntitos de una liquidación en Discográfica → Royalties y en
  Administración → Liquidaciones → «Enviadas pendientes de factura») se abre **la misma pantalla** con
  `interno=1` (`_royalty_internal_invoice_url`): sale un aviso de que la estás subiendo tú, se
  **presta el proveedor** que emite la factura (`_royalty_beneficiary_promoter`, así no hay que
  teclear su DNI) y se puede **forzar** un importe que no cuadre (`_invoice_upload_can_force`: exige
  sesión y `force`; al proveedor se le sigue avisando y NO se le acepta).
  ⚠️ La pantalla interna que había aparte (`royalty_liquidation_invoice_upload` + su modal en
  `discografica_royalties.html`) se **retiró**: eran dos sitios que mantener y se desincronizaban.
  · **Los PASOS** (rediseño ago 2026): 1 haz la factura · 2 ¿para quién es? (solo en la landing
  general) · 3 identifícate · **4 sube la factura** · **5 documentación y enviar**.
  ⚠️ En el paso 4 la factura **NO se envía todavía**: se lee (`public_invoice_detect`), se pinta
  **desde el propio archivo** (`URL.createObjectURL`) y se repasa en **pantalla partida** con los
  **CAMPOS A LA IZQUIERDA** (grandes, en dos columnas) y **LA FACTURA A LA DERECHA** (`.inv-split`);
  los que no se hayan podido leer salen en amarillo y el botón **«Continuar»** no se activa hasta que
  están. En el paso 5 se piden los documentos que le tocan a quien emite (los que ya están **en vigor**
  salen marcados) y el botón **«Enviar factura»** —que solo se activa cuando no falta ninguno— es el
  que manda la factura de verdad; al terminar sale **«Su factura ha sido subida»**.
  · Así la fecha de emisión se conoce ANTES de pedir los papeles, que es contra la que se mide si el
  alta del proveedor estaba en vigor.

- **LEER LOS DATOS DE UNA FACTURA · motor `invoice_read.py`** (ago 2026). Manda él en
  `_detect_invoice_meta`; las expresiones de `app.py` quedan solo como **respaldo de lo que no
  saque** (⚠️ no pisan lo leído: si lo pisaran, la fecha de emisión volvería a ser «la primera fecha
  del documento», que suele ser la de **vencimiento**).
  · ⚠️ **Muchas facturas son TABLAS** y el texto plano saca los rótulos y los valores en bloques
  separados y desordenados (en una real, «Número de factura» aparecía justo antes de la fecha de
  vencimiento y el valor «1003» quince líneas más abajo). Por eso se reconstruyen los **renglones
  visuales** con las coordenadas de cada trozo (`pdf_rows`, matriz de texto × matriz de
  transformación: con `tm` a secas el texto de dentro de un formulario sale donde no es) y se
  empareja **rótulo → valor** por columnas: pegado al rótulo · a su derecha · k rótulos y k valores en
  el mismo renglón · renglón de rótulos y el siguiente de valores.
  · ⚠️ **El bug de los importes de cuatro cifras**: la expresión empezaba por
  `\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?`, así que «1140,97» casaba **«114»**. En `AMOUNT` van primero
  los formatos completos y el entero suelto al final.
  · Los rótulos se buscan **sin acentos, con puntuación por medio y con las letras separadas**
  (`_label_pattern`): así casan «Número de factura», «N.º de factura», «I.V.A» y «TOT AL» sin
  enumerarlos. Y `(?<![A-Za-z])` en vez de `\b`, porque en los PDF los datos vienen PEGADOS
  («Fecha: 28/7/2026N.º de factura: 8») — por lo mismo, las fechas terminan en `(?!\d)`.
  · `NOT_LABELS` descarta lo que se parece pero no es: «número de **cliente**», «**vencimiento**»,
  «número de registro de IVA», «PAGADA». Y en `amount_gross` **«Total a pagar» gana a «Total»** (con
  retención, «Total» es base + IVA y lo que se paga es el otro): los rótulos se prueban EN ORDEN sobre
  todo el documento, no renglón a renglón.
  · Con el TOTAL y el **% de IVA** se despejan la base y el IVA (facturas donde el rótulo de la base
  no hay forma de leerlo).
  · **Prueba de regresión: `python3 tools/check_invoice_read.py`** — tres facturas reales de
  proveedores distintos (tabla · con retención y «total a pagar» · datos pegados y «TOT AL»). Si se
  toca el motor, tiene que seguir en verde.

- **BASE DE FACTURAS · una línea por factura, con su desglose** (ago 2026). La pestaña «Subidas por
  terceros» enseñaba fechas, números e importes en blanco y la misma factura varias veces.
  · **Una fila = una factura FÍSICA** (`_supplier_invoice_same_doc_key`: el mismo archivo —sin el «?»
  ni la firma de la URL— o el mismo número+importe). Las copias no se pintan: la fila lleva `×N` y se
  completa con lo que tenga cada copia.
  · **Facturas FANTASMA** (`_supplier_invoice_is_ghost`): registros sin archivo, sin ningún dato y sin
  colgar de nada. **No se listan**; la pantalla dice cuántos hay y **dirección** puede borrarlos
  (`supplier_invoices_clean`, que vuelve a comprobar que lo son antes de tirarlos).
  · **Importes que faltan**: si la factura no trae el suyo se **reconstruye de donde está imputada**
  (`_supplier_invoice_amount_info`: lo imputado a los gastos de la bolsa → el gasto de «Mis gastos» →
  el congelado de la liquidación + IVA) y se dice **de dónde sale**, que no es lo mismo que leerlo de
  la factura. Se cargan de golpe (nada de una consulta por fila).
  · **Se marca si lleva IVA y si lleva retención** (`vat_state`/`retention_state`: YES / NO / UNKNOWN):
  «Sin IVA» solo cuando base y total coinciden, y «Sin desglosar» cuando no se sabe — no se afirma lo
  que no consta. Columnas Base · IVA · Retención · Total, la fecha de emisión (o «Subida el …» si no
  se leyó) y la etiqueta de estado. **No hay total por tercero**: sumar facturas de terceros no dice
  nada.
  · **«Leer los datos que faltan»** (`supplier_invoices_read_meta`): baja el PDF y le pasa el lector a
  las facturas anteriores al detector, rellenando **solo lo que está vacío**. Hay botón por fila (con
  lo que le falta en el título) y uno para todas. El filtro por **año** acepta también la fecha de
  subida cuando la factura no trae emisión, para que no desaparezca del año que le toca.

- **CONTROL DE LO QUE ENTRA: la factura tiene que cuadrar y solo se sube una vez** (ago 2026). Antes
  llegaban facturas con importes que no eran, repetidas y con los datos sin leer.
  · **El importe se comprueba ANTES de dejar enviarla** (`_invoice_amount_check`, en los dos caminos
  de `public_invoice_upload`: liquidación de royalties y petición de un gasto). Cuadra si es lo
  mismo, si lo es **sumándole la retención** o si se facturó **sin IVA** (la base). Si no, se
  responde 400 con lo que falta o sobra. Lo esperado sale del congelado de la liquidación
  (`_royalty_invoice_totals`) o de la suma de los conceptos marcados (`_invoice_request_amounts`).
  · **Repaso en PANTALLA PARTIDA antes de enviar** (`public_invoice_landing.html`, clases
  `.inv-split*`): al elegir el archivo se pinta **la factura a la izquierda** (desde el propio
  fichero, con `URL.createObjectURL`) y **sus datos a la derecha**. Lo leído sale relleno y editable;
  lo que falta, **resaltado en amarillo** (`.inv-need` / `input.is-need`) con el texto «lo sentimos,
  no hemos podido leer los datos automáticamente…». **El botón de enviar está deshabilitado** hasta
  que los obligatorios (número, fecha, concepto, base y total) estén puestos: `invMarkMissing` /
  `invMissingLabels`.
  · **Ya hay factura subida** (`_invoice_existing_block`): el enlace **no deja empezar** (los pasos
  salen bloqueados, `.inv-blocked`) y dice que ya hay una. Si está **pendiente**, botón «¿Quieres
  reemplazar la factura?» que abre el proceso y manda `replace=1` (la anterior queda RECHAZADA con
  «Reemplazada por…», `_supplier_invoice_mark_replaced`, y se le quita la imputación para no contar
  el importe dos veces). Si está **VALIDADA**, no se toca: `INVOICE_ALREADY_VALIDATED_MSG` manda a
  `ADMIN_INVOICE_CONTACT_EMAIL` (administracion@33producciones.es). El servidor lo vuelve a
  comprobar (409): el bloqueo no vive solo en el navegador.
  · **Base de facturas · tres puntitos** (con `can_edit_invoices()` = edición de
  `databases.invoices`): **editar los datos** en pantalla partida (`supplier_invoice_edit` +
  `templates/supplier_invoice_edit.html`: la factura a la izquierda, todos los campos a la derecha,
  los que faltan en amarillo, y lo que se pidió facturar a la vista vía
  `_supplier_invoice_expected`), **corregir importes**, **leer del PDF**, **reemplazar el documento**
  (`supplier_invoice_replace`: vale **aunque esté validada**, relee los datos nuevos del documento y
  la deja PENDIENTE), **modificar el gasto** (`bag_expense_amount_save`: administración cambia a mano
  el importe que se pidió facturar; si la factura deja de cuadrar se avisa y se lleva a su ficha),
  **rechazar** (`supplier_invoice_reject`: avisa por correo a quien la subió con el motivo y **el
  enlace para subirla otra vez**, `_supplier_invoice_reject_notify`) y **eliminar**
  (`supplier_invoice_delete`: suelta la imputación y devuelve la liquidación a «enviada»).

- **Administración · pagos** (ago 2026): **solo «Pendiente» y «Altas» llevan contador** (las demás son
  registros y un número ahí no dice nada). La pestaña **Pagos** es el **archivo de pagos realizados**
  (`_payments_history_rows`: gastos de bolsa pagados + liquidaciones de royalties pagadas + gastos
  directos) con **buscador por cualquier campo** (casa por palabras contra todo lo que se ve, porque
  son tablas distintas). ⚠️ **Un pago no termina hasta que hay JUSTIFICANTE**: los pagados sin él
  siguen contando en «De pago» y salen en su propio bloque «Pagados, falta el justificante»
  (`_paid_without_receipt_expenses`), que solo pide adjuntar el documento
  (`administration_expense_mark_paid` con `only_receipt=1`: no toca importes ni apunta otro pago).

- **RETENCIONES: se detectan y se pueden CORREGIR A MANO** (ago 2026). Cuando lo que hay que pagar no
  cuadra con la factura, casi siempre es una **retención**.
  · **Detección** (`_detect_invoice_amounts`): sinónimos ampliados (retención/retenciones/ret./IRPF/a
    cuenta); si la factura dice solo el **porcentaje**, el importe se calcula sobre la base; y si NO
    la nombra pero al total le falta justo un porcentaje de retención real
    (`_INV_RETENTION_RATES`: 15/7/19/2/1…), se toma como retención y se avisa (`retention_guessed`).
    ⚠️ La retención se busca **en su misma línea** y con `(?![\d.,]*[ \t]*%)`: con la tolerancia de
    los demás conceptos, un «Ret. IRPF 15 %» sin importe al lado se llevaba el número de la línea
    siguiente (el TOTAL), y al acortar la coincidencia, el «1» del propio 15 (bugs reales).
  · **Corrección a mano**: punto único **`supplier_invoice_amounts_save`**
    (`POST /facturas/subidas/<id>/importes`) + modal compartido `templates/_invoice_amounts_modal.html`
    (lo abre cualquier `[data-inv-amounts]` con los valores en `data-inv-*`). Con tres de los cuatro
    números calcula el que falta, el % rellena su importe (y al revés) y, si se le pasa
    `data-inv-expected`, ofrece **«la diferencia es una retención»**. Está en la pantalla de validar
    la factura de una liquidación (también dentro del aviso de descuadre), en el pop-up de la factura
    de **pendiente de pago** y en cada línea de la **base de facturas**.
  · ⚠️ **LO QUE SE PAGA es el total de la FACTURA** (ya lleva la retención descontada): restarla otra
    vez pagaba de menos, y pagar base+IVA cuando la factura trae retención pagaba de más. Si el total
    de la factura no cuadra con lo que se pidió facturar —ni sumándole la retención, ni por facturar
    sin IVA— la línea de pendiente de pago lo dice (`mismatch`) y ofrece corregirlo. Si la factura no
    trae desglose, el que se enseña es el que se pidió facturar (si no, la fila del IVA desaparecía).

- **Pendiente de facturar (módulo del enlace de subida de facturas)**: se llamaba «Lo que te
  pedimos» y las cantidades salían **0,00 €**. Motor único **`_invoice_request_amounts(net, gross)`**:
  el importe a facturar es SIEMPRE **base + IVA** (`INVOICE_REQUEST_VAT_PCT` = 21), y como unos gastos
  se apuntan solo con el bruto y otros solo con la base, se completa el que falte (con la base se suma
  el IVA, con el bruto se despeja la base). Sin importe se dice «factura el importe que corresponda»
  en vez de pintar un cero. Debajo va el **total de lo marcado** (con IVA), que se recalcula en el
  navegador. ⚠️ En la factura de una liquidación de royalties el importe salía 0 porque se leía
  `beneficiary['total']`, que **no existe**: es `total_amount` (mismo bug que en la pantalla de
  validar), y ahora manda además el **congelado** de la liquidación.

- **Remesa · cuenta de cargo, nombre del fichero y concepto** (ago 2026):
  · La **cuenta de cargo se elige PINCHANDO** una tarjeta con el logo del banco y el alias, no en un
  desplegable: parcial compartido `templates/_bank_account_picker.html` (macro `account_picker`,
  estilos `.acc-pick*`), usado por la caja de «Crear remesa» y por la ficha de la remesa. En la fila de
  una liquidación el desplegable desaparece: el icono crea la remesa y la cuenta se elige allí. Si no
  llega ninguna, `payment_batch_create` coge la de **por defecto** (si no, la remesa nacía sin cuenta y
  el fichero rebotaba).
  · **Nombre del fichero** (`_payment_batch_file_name`): de UNA bolsa →
  `Remesa_<Artista>_<Festival o municipio>_<Fecha del evento>`; varios sueltos o de varias bolsas →
  `Remesa_Varios_<fecha de generación>`. Se le añade la referencia (`REM-aaaa-nnnn`) para rastrearla.
  · **Concepto del pago** (`_payment_concept_for_expense`): se intenta que sea el de la **factura** que
  se paga (`SupplierInvoice.concept_text` vía `BagExpenseInvoice`), y si no hay, el del gasto; siempre
  con «Fra. <nº>» detrás. Es lo que el proveedor ve en su extracto.

- **Royalties · LO GENERADO NO SE ALTERA y los números CUADRAN** (auditoría ago 2026). Punto único
  **`_royalty_effective_beneficiary`** (el congelado si está generada; solo si no, lo de ahora), usado
  por el enlace del beneficiario, la landing de facturación, la pantalla de validar y el pago.
  · ⚠️ **`total` NO existe en un beneficiario: es `total_amount`.** Se leía `total` en la firma de los
  datos, en el historial de la generación, en el aviso de «los ingresos han cambiado» (`live_total`),
  en el modal de Información y en la comparativa → todos daban **0**: el aviso decía «+0,00 €», el
  historial no apuntaba importe y la firma no detectaba cambios. Corregido en todos.
  · ⚠️ **Enviar o descargar NO vuelve a congelar.** `_build_royalty_liquidation_pdf_bytes` con
  `touch_liquidation=True` re-congelaba y movía `generated_at` apuntando un «REGENERATED» falso; ahora
  si ya hay congelado y `use_frozen`, no se toca.
  · ⚠️ **Generar es un GET (`/discografica/royalties/liquidacion/pdf`) y sustituía el congelado sin
  confirmar**: bastaba reabrir la URL para regenerar una liquidación enviada con los ingresos de hoy.
  Ahora exige **`regenerate=1`** (lo manda el modal de comparación al aceptarlo, y la primera
  generación); sin él devuelve el PDF de lo generado. Una liquidación **FACTURADA o PAGADA no se
  regenera** ni autorizándolo: hay una factura y un pago contra ese importe.
  · **EL IMPORTE es uno solo**: el de la liquidación es la **BASE** y lo que se factura es **base +
  IVA** (`_royalty_invoice_totals` → `_invoice_request_amounts`). Ese número es el que sale en el PDF,
  en el correo, en el enlace del beneficiario, en «Pendiente de facturar», en la pantalla de validar,
  en pendiente de pago y **en el fichero SEPA**. El aviso de descuadre solo salta si la factura no
  cuadra **ni con el total con IVA ni con la base** (hay quien factura sin IVA).

- **«Mis gastos»** (`PersonalExpense`): facturas dirigidas a una persona por la landing
  (`SupplierInvoice.target_user_id` → `_personal_expense_from_invoice`) y gastos de Pleo, con el
  ciclo PENDING (sin bolsa) → IN_BAG (en la bolsa, sin tipificar) → ASSIGNED (con su `BagExpense`).
  Vistas `my_expenses_view` / `my_expenses_assign` (dos columnas con scroll propio, arrastre a las
  bolsas de `_open_bags_for_user`: no cerradas, agrupadas por artista y ordenadas por proximidad) y
  `my_expense_assign_bag`; dentro de la bolsa, `bag_imported_expense_assign` crea el gasto en la
  categoría donde se suelta (`bag_imported_pending` en `_bag_panel_context` parte la pantalla y
  desaparece al vaciarse). Panel de Inicio `HOME_MY_EXPENSES` con la cuenta atrás
  (`_expense_days_left`, `EXPENSE_ASSIGN_DAYS`=7) y cron `/cron/gastos-sin-asignar` que avisa a la
  persona al vencer y escala a dirección a los `EXPENSE_ESCALATE_DAYS`=15. **A dirección (role 10) no
  se le RECLAMA** (solo el correo; la sección y el módulo los ve todo el mundo). La sección sale en el
  menú de secciones **y** en el menú de la propia persona (`layout.html`), y el módulo de Inicio se
  muestra siempre: sin nada pendiente dice «Sin gastos pendientes de asignar» (`visible` en
  `_home_my_expenses_summary`). ⚠️ Sus endpoints están en **`PERSONAL_ENDPOINTS`**: los deja pasar cualquier
  sesión (son datos propios) y la comprobación de propiedad se hace dentro del endpoint.
  **PARAR EL PLAZO** (solo dirección, `is_master()`): por persona (`UserProfile.expense_deadline_paused`
  + `expense_paused_since` + `expense_pause_log`, botón en la ficha y en el menú de tres puntos del
  listado → `personnel_expense_deadline_toggle`) y para TODO el personal (ajustes globales
  `EXPENSE_PAUSE_ALL_*` vía `_get/_set_app_setting`, botón en la cabecera de `/personal` →
  `personnel_expense_deadline_toggle_all`). Mientras está parado: no corre la cuenta atrás, la pastilla
  dice «Plazo parado» y el cron no reclama ni escala. Los tramos parados se guardan y
  `_expense_paused_days` los **descuenta** del plazo de cada gasto (días completos: parar hoy no regala
  un día), así al reactivar no aparecen todos fuera de plazo de golpe. Punto único de cálculo:
  `_expense_pause_context(session_db, user_id)` → se pasa a `_expense_days_left`/`_personal_expense_row`.
- **Pleo (importación de gastos del personal)**: cliente en `pleo_utils.py` (`PleoClient`, Basic auth con la
  key como usuario y contraseña vacía, paginación por cursor, backoff en 429/5xx). Base `https://external.pleo.io`;
  endpoints reales: `POST /v1/accounting-entries:search` (**`company_id` en la QUERY STRING** y filtros en el
  body, con **`includeDeleted` obligatorio**), `GET /v1/accounting-entries/{id}`, `…/receipts` (URL firmada que
  **caduca en 24 h** → hay que descargar y guardar en Storage `pleo/`), `GET /v2/employees?companyId=`,
  `GET /v1/companies`, `POST /v0/tax-codes:search`, `POST /v0/aggregations/tags` (nombres de las etiquetas;
  los apuntes solo traen IDs). Scopes: `accounting-entries:read`, `users:read` + lectura de companies/tax-codes.
  ⚠️ **UNA cuenta de Pleo por empresa del grupo**: credencial y `company_id` en **`PleoAccount`** (BD, se edita
  en Integraciones → Pleo, **subpestaña por `GroupCompany`**), NO en `.env` (`PLEO_API_KEY` queda solo como
  respaldo). Toda llamada de contabilidad va con su `company_id` aunque la key cubra varias entidades.
  **Persona ← empleado**: `PleoEmployeeLink` (UNIQUE `account_id`+`pleo_employee_id`) resuelto por CORREO
  contra `User.email` y **`UserProfile.integration_emails`** (campo nuevo: otros correos de empresa, solo para
  identificar en integraciones, NO para entrar); lo que no cuadra se vincula a mano y entonces se importan sus
  gastos al momento (`_pleo_import_for_link`). Un gasto sin dueño NO se guarda (cuenta como huérfano).
  **Antiduplicados** (3 capas): índice **UNIQUE en `personal_expenses.pleo_entry_id`**, `pleo_receipt_ids` (no
  se re-descarga un justificante) y la regla de **no-pisado**: si `status='ASSIGNED'` solo se le engancha el
  adjunto que faltaba al `BagExpense` o se anota `sync_warning`. Motor en `app.py` (bloque `_pleo_*`, junto a
  «Mis gastos»): ventana móvil por `performedAt` + **repesca** individual de los incompletos (la API **no**
  permite filtrar por `updatedAt`) + advisory lock `_pleo_pg_lock` + savepoint por gasto. **No hay webhooks de
  gastos** en Pleo (solo `export.job-created`/`vendor.created`) → sondeo por `/cron/pleo/refresh?key=PLEO_CRON_KEY`.
  Familias importadas en `pleo_utils.PERSONAL_FAMILIES` (card purchase, out of pocket, reembolsos, kilometraje,
  dietas); se descartan WALLET/PLEO_INVOICE/BILL_INVOICE*/etc. Importes en **minors** → `money_to_decimal`;
  la base sin IVA sale del `taxCodeId` (`inclusive`/`exclusive`; con `reverse` no se desglosa). **Todo lo de Pleo
  se tipifica PAGADO con método «Pleo»** (+ `BagPaymentInteraction`) en `bag_imported_expense_assign`. Las
  etiquetas y la nota de Pleo **solo se muestran** (no clasifican) junto a un módulo sugerido por MCC
  (`_pleo_suggest_category`) en `my_expenses*.html` y en el panel de importados de la bolsa.
- **Componente insertable en otra web** (`public_invoice_embed`, `/facturacion_<slug>/embed`): es la
  MISMA `public_invoice_landing.html` con `inv_embed=True` (sin logo de la empresa, título en su propia
  viñeta `.inv-embed-head`) + `embed_mode=True`, flag que **`layout.html`** usa para dejar
  `html/body/main` **transparentes y sin márgenes** (con `hide_backoffice_nav`). El alto lo comunica al
  `<iframe>` por `postMessage({app33:'facturacion-alto'})`. Al ser la landing real, cualquier cambio sale
  en la web de la empresa sin tocarla. ⚠️ No hay `X-Frame-Options`/CSP en la app: si algún día se añaden,
  hay que dejar este endpoint enmarcable.

- **SUPLIDOS de un gasto** (`BagExpense.supplements`, ago 2026): lo que ese MISMO tercero factura
  además de su trabajo (la gasolina de un músico, un taxi). Se añaden desde los **tres puntitos del
  gasto** (`bag_expense_supplements_save`): concepto + importe, y **si no se sabe el importe se deja
  en blanco**. ⚠️ **NO llevan IVA ni retención**: `amount_gross` del gasto los INCLUYE (es lo que hay
  que facturar y pagar) pero `amount_net`/`amount_tax` siguen siendo solo la parte con IVA, así que el
  desglose NO se puede sacar del bruto — punto único **`_expense_invoice_breakdown(expense)`**
  (base+IVA de `amount_gross − suplidos`, más los suplidos aparte), que usan el enlace del proveedor,
  la comprobación del importe al subir y `_supplier_invoice_expected`.
  · **Al subir la factura**, si algún suplido no tiene importe, entre **identificarse y subir** sale el
  paso «Esta factura incluye suplidos a detallar» (`public_invoice_supplements_save`): lo que escriba
  actualiza el gasto (`_expense_apply_supplements`) y el total que se le exige a la factura. Si ya
  tienen importe, ese paso no aparece y los suplidos solo se ven en «Pendiente de facturar».
- **Facturas imputadas a gastos de bolsa** (`BagExpenseInvoice`): relación N:N entre una factura y
  los gastos que cubre, con el **importe imputado** a cada uno. Las filas de la MISMA factura física
  comparten `group_key`. El adjunto del `BagExpense` se sigue rellenando (compatibilidad con
  validación/PDF/avisos). Motor: `_bag_expense_invoice_apply` · `_bag_expense_invoice_rows` ·
  `_personal_expense_allocated`. **Petición al proveedor**: en el enlace público marca con casillas
  qué conceptos cubre la factura (una por concepto o una que englobe varios); el total se reparte a
  prorrata y la petición solo pasa a DONE cuando TODOS tienen factura. **Desde «Mis gastos»**: además
  de soltar en un módulo (crea gasto), se puede soltar **encima de un gasto existente**
  (`bag_imported_expense_link`): si la factura vale más, pregunta `update_amount` (el gasto pasa a
  valer la factura) o `split` (imputa lo que cabe y deja el resto para otro gasto, hasta repartirlo).
  ⚠️ Al soltar en un MÓDULO una factura ya repartida en parte, solo entra **lo que queda**
  (`_personal_expense_allocated`; el neto y el IVA se prorratean) y se anota la imputación: si no, el
  importe se contaba dos veces. El «Solicitar factura» de un gasto manda al proveedor el enlace con
  **todos sus conceptos pendientes** de la bolsa (mismo flujo que el botón agrupado, disponible ya en
  las dos vistas de la bolsa).
  ⚠️ `templates/public_bag_invoice_upload.html` es **código muerto**: `/factura/<token>` renderiza
  `public_invoice_landing.html` con `inv_mode='REQUEST'`.
- **Cabify (gastos de viajes)**: cliente en `cabify_utils.py`. **OAuth2 client_credentials** contra
  `{base}/auth/api/authorization` (`grant_type/client_id/client_secret` → `access_token` Bearer,
  `expires_in` ~30 días, cacheado y renovado solo). API en `{base}/api/v4`. ⚠️ La **URL base de
  producción NO es pública** (la da Cabify al conceder el acceso) → **se detecta sola**:
  «Probar conexión» prueba la configurada y luego `BASE_URL_CANDIDATES` (`find_working_base_url`) y
  GUARDA la que responda; sandbox `https://cabify-sandbox.com`. En el panel de Cabify los dos
  códigos se llaman **UUID** y **Secreto** = `client_id` y `client_secret` (así están etiquetados en
  Integraciones, para que se peguen sin pensar). **UNA cuenta por empresa del grupo** (`CabifyAccount`,
  se edita en Integraciones → Cabify, subpestaña por `GroupCompany`). Personas:
  `GET /api/v4/users?state=&page=&per=` (paginado `{data,page,pages,per,total}`) → `CabifyUserLink`
  emparejado por CORREO reutilizando `_pleo_email_index` (correo de acceso + `integration_emails`);
  sin correo conocido queda para vincular a mano y al hacerlo importa sus gastos al momento.
  Gastos: se usa `GET /api/v4/user/{id}/sales?from&to&currency&page&per` y **no** el global
  `/api/v4/sales`, porque el global NO dice de quién es cada venta. Importes en **CÉNTIMOS** y con
  impuestos (`price_details.total`, base despejada con `tax_rate`). Antiduplicados: índice UNIQUE en
  `personal_expenses.cabify_sale_code` + savepoint por gasto. Sin webhooks → cron
  `/cron/cabify/refresh?key=CABIFY_CRON_KEY` (acepta la de Pleo/Chartmetric).
  ⚠️ Origen y destino salen de `concept.type_object.pickup`/`.dropoff` (campos `addr`/`num`/`city`/
  `name`), **no** de una lista de paradas — `stops` queda solo como respaldo; `tax_rate` puede venir en
  % o en fracción y `parse_sale` lo normaliza. La **etiqueta** del viaje (`charge_code`) se guarda en
  `pleo_tags` para que se pinte igual que las de Pleo.
  ⚠️ **LA APP NO FABRICA NINGÚN JUSTIFICANTE.** La API de Cabify **no expone el PDF del viaje**:
  verificado (ago 2026) contra el esquema publicado de `sales`, `user/{id}/sales` y
  `journey/{id}/sales` —solo `code`, `invoice_date`, `price_details` y el trayecto; el `public_url`
  de `journey/{id}` es el seguimiento en vivo— y contra el **índice completo** de su referencia, que
  no tiene ningún endpoint de documento. En su vocabulario «receipt» ES la venta (los datos); los
  recibos por viaje se bajan del **portal de Cabify Empresas**, no de la API.
  Hubo una versión que generaba un PDF propio y lo colgaba como si fuera el justificante de Cabify:
  **eso se retiró** (`_cabify_purge_fake_receipts` los desengancha y los borra de Storage; corre una
  vez en el arranque con marca `AppSetting` y tiene botón en Integraciones → Cabify). Un gasto de
  Cabify entra **sin factura**, con su semáforo en rojo, y quien lo tenga la sube desde «Mis gastos»
  o pide que se acepte sin ella. `CabifyClient.sale_receipt_url` rebusca el documento **también
  anidado**: el día que Cabify lo sirva se adjunta ESE y no hay nada más que tocar.
  ⚠️ Al borrar solo se tocan los `file_url` que apuntan a la carpeta **`cabify/`** de nuestro bucket
  (los que generaba la app); una factura subida a mano vive en otra carpeta y se respeta.
  ⚠️ **Un VIAJE puede generar VARIAS ventas** (el trayecto y sus SUPLEMENTOS: espera, peaje,
  limpieza). Se agrupan por `journey_id` → **un gasto por viaje** con el total sumado
  (`PersonalExpense.cabify_journey_id` + `cabify_sale_codes`, que evita sumar dos veces el mismo
  suplemento); un suplemento que llegue en un sondeo posterior se suma al viaje, y si el gasto ya
  está asignado se avisa en `sync_warning` en vez de tocarlo. El **concepto** lo construimos siempre
  nosotros: `dd/mm/aaaa · Origen → Destino` (fecha en formato de España). La `description` de Cabify
  **no se usa nunca**: es donde vienen los suplementos y ensucia la información.

- ⚠️⚠️⚠️ **EL PUNTO ES DE MILES, NO DECIMAL: MODELO DE EUROS, NO EL DE ESTADOS UNIDOS** (sep 2026,
  bug real de DINERO con captura). Un caché de **40.000 €** se veía como **4,00 €** y un «40.000»
  que llegara al servidor se guardaba como **40 €**. Ahora la regla está escrita UNA vez y es la
  misma en los cuatro sitios que leen un importe:
  · **`_parse_money_decimal`** (app.py) — el punto único por el que pasan `_money_or_zero`,
    `_bag_money`, `_parse_money` y `_inv_money`;
  · **`toCanonical`** de `money_input.js` (de él viven `numv`, `display` y el valor canónico que
    viaja al servidor);
  · **`invoice_read.parse_amount`** (ya la tenía) y **`buyer_import.clean_money`**.
  **La regla**: hay COMA y punto → manda el ÚLTIMO («1.234,56» es de aquí, «1,234.56» de allí) ·
  solo COMA → decimal (varias comas: miles) · solo PUNTO → manda **cuántos dígitos lo siguen**: 1 o
  2 son DECIMALES (así se sigue leyendo lo canónico, «1234.56») y **3 o más —o ninguno— son MILES**
  («40.000», y el «4.0000» que deja un importe a medio escribir).
  ⚠️⚠️ **UN IMPORTE NO SE LEE CON `parseFloat`**: los campos con € se escriben FORMATEADOS, así que
  `parseFloat('40.000')` da 40. El lector de la casa es **`window.numv`**. El asistente de actividad
  leía así los cachés y los pagos (de ahí la captura).
  ⚠️⚠️ **Y EL FORMATEO VA EN FASE DE CAPTURA** (`money_input.js`): escuchando en burbujeo, un
  contenedor más cercano —el paso del caché del asistente— se ejecutaba ANTES y leía el valor **a
  medio escribir**: con «40000» tecleado, el campo tenía «4.0000» y el badge decía 4,00 €. Ahora se
  formatea antes de que lo vea cualquier otro manejador de la app.
  ⚠️⚠️ **LOS PORCENTAJES NO SON IMPORTES**: «33.333» es treinta y tres coma tres, no treinta y tres
  mil, así que se leen con **`_parse_pct_decimal`** (el punto siempre decimal). Se cambiaron las
  cinco lecturas de `*_pct` que venían de un FORMULARIO (`our_pct`, `iva_pct`, `vat_pct`); las que
  leen de la BD reciben ya un `Decimal` y no pasan por ningún parser.
  ⚠️⚠️ **Y LA LIMPIEZA DE DECIMALES DE EXCEL SE COMÍA LOS MILES** (`promoter_import._cell_text`, el
  lector que comparten TODAS las importaciones: terceros, compradores, supervisors, liquidaciones):
  `re.fullmatch(r"-?\d+\.0+")` —puesta para que un teléfono no llegara como «638123456.0»— dejaba
  «40.000» en «40» y «1.000» en «1». Ahora solo quita **uno o dos** decimales (lo que mete Excel);
  tres ceros detrás del punto son un grupo de MILES.
  Probado: 23 casos en el servidor, 13 en el navegador, 10 en la importación y las dos pruebas de
  regresión de la casa en verde; y en la app real, teclear «40000» en el asistente deja
  «Caché fijo: 40.000,00 €» con 40.000 en el campo y manda «40000» al servidor.

- ⚠️⚠️ **AÑADIR UN GASTO A LA BOLSA · el formulario, por MÓDULOS** (sep 2026, parcial único
  `templates/_bag_expense_form.html` + motor GLOBAL `static/js/bag_expense_form.js`). Un solo paso con
  cuatro **bocadillos** (`.sim-cat-card`, la estética de las bolsas) y **el CONCEPTO como único campo
  obligatorio**:
  · **1 · DATOS** — concepto · **importe** con dos botones (**«Lo incluye» / «Sin IVA»**; sin IVA se
    calcula el **21%** y se ve al momento el desglose) · **nota** con la **campanita** que abre el
    aviso (día y hora, con «el día de antes», «una semana antes» y «hoy»).
  · **2 · PROVEEDOR** — una barra que busca en **TODA la base** (terceros, **medios**, **artistas** y
    **personal**) con su foto o su logo (`api_bag_provider_search`) y el «+» de siempre para crear un
    tercero. Debajo, **datos de facturación**: sus sociedades **con logo**, «datos del proveedor» o
    **«factura otra sociedad»** (que se busca igual y queda **VINCULADA** al proveedor para que la
    próxima vez se sugiera).
  · **3 · FACTURA O TICKET** — se arrastra (o se elige) y **se LEE** con el mismo lector que la base
    de facturas (`api_bag_document_detect` → `_detect_invoice_meta`): dice si es **FACTURA** (y
    desglosa el IVA) o **TICKET** (que no lo desglosa, porque su IVA no es deducible) y rellena el
    nº, la fecha y el importe.
  · **4 · ESTADO DEL PAGO** — «sin pagar» / «ya está pagado» → **completo o parcial** (y cuánto) →
    **método con iconos** (`BAG_PAYMENT_METHOD_ICONS`).
  ⚠️ **El DESGLOSE lo hace el SERVIDOR** (`_bag_update_expense_from_form` con `amount_value` +
  `amount_mode` + `vat_pct`), no el navegador: sale igual desde donde se guarde. El % se apunta en
  **`BagExpense.vat_pct`** y se **cambia desde los tres puntitos** del gasto («IVA %»).
  ⚠️ **El ESTADO del pago lo decide el servidor** con `payment_status` + **`paid_kind`** (completo o
  parcial) y el importe: **dos campos con el mismo `name` se pisan** al leerlos, así que no se manda
  un segundo `payment_status` oculto.
  ⚠️ Lo que **no es un tercero** (un medio, un artista, alguien de la casa) se **ESPEJA** a tercero al
  guardar (`_bag_provider_from_form` + `_promoter_mirror_by_name`, el patrón de
  `_ensure_promoter_for_media`): `BagExpense.provider_id` apunta a **promoters**.
  ⚠️ El **aviso de un gasto tiene HORA** (`BagExpenseAlert.alert_time`, con `_agenda_clean_time`): un
  aviso sin hora se ve cuando ya no sirve.
  ⚠️ El motor es **GLOBAL y por delegación**: este formulario se pinta en la pantalla de la bolsa y
  también **embebido** en una ficha (proyecto, actividad, promoción), cuyas zonas se repintan por AJAX.
  ⚠️ **El desplegable del buscador sale SIEMPRE HACIA ABAJO**: `app33FloatList` lo abre por el lado en
  el que quepa entero, y en un modal se iba hacia arriba, que despista. Con **`{abajo: true}`**
  (`place` y `ensureRoom`) sale abajo y, si no hay hueco, el campo se acerca antes.
  ⚠️ Los dos botones del IVA son **pequeños y al lado del rótulo** («Con IVA» / «+ IVA»): grandes y a
  todo el ancho pesaban más que el propio importe.

- ⚠️⚠️ **EDITAR UN GASTO ES EL MISMO FORMULARIO QUE AÑADIRLO** (sep 2026). La edición era una rejilla
  plana de 17 campos escrita a mano en `_bag_panel.html` (con dos `<select>` gigantes por cada gasto)
  y no se parecía en nada al alta. Ahora `templates/_bag_expense_form.html` sirve para los dos modos
  (`be_mode` create|edit) con sus cuatro bocadillos, precargado por **`_bag_expense_form_context`**.
  ⚠️ En edición se pinta **UNO POR GASTO**, así que TODOS los ids llevan el sufijo `uid`: con ids
  repetidos, un `<label for>` marcaría el radio del PRIMER modal, la zona de arrastrar soltaría el
  archivo en el gasto equivocado y el alta rápida rellenaría el selector de otro. ⚠️ El id del
  selector de módulo en modo ALTA tiene que seguir siendo `addExpenseCategory` (lo busca el botón
  «Añadir gasto en X»).
  ⚠️⚠️ **GUARDAR SIN TOCAR NADA NO PUEDE CAMBIAR EL IMPORTE**: `_bag_update_expense_from_form`
  escribía `invoice_number`, `issue_date`, `retention_amount` y `payment_method` **sin guarda**, así
  que un formulario que no los preguntara los borraba — y la retención es dinero (cambia lo que se
  paga en la remesa). Ahora cada uno solo se escribe **si el formulario lo trae**.
  ⚠️ El importe que se precarga es la parte **GRAVABLE** (bruto − suplidos), nunca `amount_gross`:
  los suplidos van dentro del bruto y **no llevan IVA**; al guardar se vuelven a sumar.
  ⚠️ La edición pasa ya por el MISMO camino que el alta (**`_bag_apply_provider_from_form`** +
  `_bag_expense_extras_from_form`): antes, elegir un **medio, un artista o alguien de la casa** como
  proveedor **no guardaba nada** (el espejo a tercero solo lo hacía el alta) y la nota se tiraba.
  ⚠️ `PENDIENTE` y `COMPENSADO` no los pone este formulario (los ponen la aprobación de una remesa y
  la rectificativa): se pintan como una opción MÁS, ya marcada, para no cambiarlos sin querer.
  ⚠️ El tipo de documento pasa de un hidden a **radios**: el JS lo lee con el punto único
  `tipoDoc(root)` y el input de fichero se reconoce por **`[data-be-doc-input]`**, no por un id fijo.

- ⚠️⚠️⚠️ **DIVIDIR UN GASTO ENTRE VARIAS BOLSAS** (sep 2026). Una misma factura puede ser de varias
  bolsas (un vuelo compartido, un alquiler). **LO QUE NO PUEDE PASAR ES PAGARLA NI CONTABILIZARLA DOS
  VECES.**
  · **CÓMO ESTÁ MODELADO**: N filas `BagExpense` hermanas —una por bolsa, para que cada una vea su
  trozo en SUS totales sin tocar ni un lector— unidas por **`split_group_id`**, con **UN ÚNICO
  TITULAR** (`split_role`): es la única fila que sale en **pendiente de pago**, en la **remesa SEPA**
  y en **contabilidad**. Las **PARTES** reciben el estado ESPEJADO (`_split_propagate`: factura,
  validación, contabilidad, estado del pago y lo pagado **prorrateado**) para que su bolsa lo vea.
  Columnas nuevas en `bag_expenses` (`ensure_expense_split_schema`): `split_group_id` · `split_role`
  · `split_mode` · `split_share_pct` · `split_created_at` · `split_created_by_nick`, con un **índice
  ÚNICO parcial del titular**, que es el candado de la BD contra pagar dos veces.
  · **EL POP-UP** (`_bag_expense_split_modal.html` + `static/js/bag_expense_split.js`, GLOBAL y por
  delegación): artista o evento (los **activos primero**, con «Ver más») → **proyecto discográfico /
  single / actividad** → sus bolsas; luego **a partes iguales · importe fijo · porcentaje** (cada
  opción con su icono y enseñando solo sus campos), con el **total con y sin IVA**, lo que **queda
  por repartir** y el botón de **añadir más bolsas**, todas las que hagan falta.
  ⚠️ En «proyecto discográfico» salen TAMBIÉN las bolsas abiertas directamente desde un **SINGLE** o
  desde un **ÁLBUM** aunque no hayan pasado por un proyecto (punto único `_bag_split_kind_match`).
  ⚠️⚠️ **EL REDONDEO VA AL TITULAR** (`_split_distribute`): 100 € entre 3 son 33,33 + 33,33 + 33,34.
  Si las partes no suman EXACTAMENTE el total, la factura deja de cuadrar con lo que se paga.
  ⚠️⚠️ **BUG REAL DE MI PROPIA IMPLEMENTACIÓN**: `_split_apply` calculaba «las filas que sobran»
  filtrando por `split_role`, y la PRIMERA vez que se divide un gasto el titular todavía no tiene
  rol → **el titular entraba en las que sobran y se BORRABA**, con su dinero. Se excluye **por su
  id**, no por su rol.
  · **LO QUE SE PAGA es el TOTAL DEL GRUPO** y lo paga el titular: `_expense_payment_amount` devuelve
  **0** en una parte y, en el titular, `total del grupo − retención − lo pagado por TODAS sus filas`.
  Al marcarlo pagado, lo pagado se **prorratea entre todas** (el redondeo al titular) para que cada
  bolsa enseñe lo SUYO —dejando el total en el titular, su bolsa decía «pagado 1.210 € de 403,34 €»—
  y se cierran **todas** las bolsas del grupo que se queden sin pendiente.
  ⚠️ El reparto **se puede cambiar y deshacer** mientras no esté pagado, en una remesa o
  contabilizado: lo dice `_split_lock_reason` (y se explica, no se calla).
  ⚠️ Las divisiones **ANTIGUAS** (`source_expense_id` + `split_info`) no se migran ni se tocan: hoy
  son gastos independientes y el origen ya tiene el importe reducido, así que no hay dinero
  duplicado; solo se deja de crear más.

- ⚠️⚠️⚠️ **DIVIDIR UN GASTO · LAS DOCE TRAMPAS QUE SACÓ LA REVISIÓN** (sep 2026). Ninguna daba
  error: todas eran dinero mal contado o una bolsa que no se podía cerrar.
  · ⚠️⚠️ **EL ESPEJO NO SE DISPARABA AL LLEGAR LA FACTURA.** `_split_propagate` solo corría al crear
  el reparto y al pagar, pero **lo normal es dividir ANTES de que llegue la factura**: al subirla en
  el titular, la PARTE se quedaba sin `attachment_url` y en `PENDIENTE`, así que su bolsa daba el
  gasto por «sin consolidar» **para siempre** y no se podía cerrar. Ahora el espejo se dispara desde
  el PUNTO ÚNICO de guardado (`_bag_update_expense_from_form`), que es por donde pasa todo.
  · ⚠️⚠️ **EL JUSTIFICANTE DE LA REMESA APUNTABA MENOS DINERO DEL QUE SALIÓ DEL BANCO**: el fichero
  SEPA manda el total del grupo (1.210 €) pero `payment_batch_receipt` topaba lo pagado con el bruto
  **del titular** (726 €). El tope es el del GRUPO, como en el pago a mano.
  · ⚠️⚠️ **AL PROVEEDOR SE LE PEDÍA SOLO EL TROZO DEL TITULAR** y, cuando mandaba su factura de
  verdad, el servidor **se la rechazaba** por no cuadrar. Punto único **`_expense_billable_gross`**
  (el total del grupo si está dividido) + `gross_override` en `_expense_invoice_breakdown`, usados en
  lo que se le pide **y** en lo que se le exige al subirla.
  · **A HOLDED se subía el trozo del titular** con el PDF del total adjunto (y un documento no se
  sube dos veces, así que quedaba desparejado): `_accounting_amounts` usa el total del grupo.
  · **EDITAR una fila del reparto** cambiaba su importe sin rebalancear: el grupo dejaba de sumar la
  factura y la remesa mandaba otra cosa al banco. El importe de una fila dividida es **de solo
  lectura** (se cambia el total en «Dividir gasto») y el endpoint lo ignora aunque llegue.
  ⚠️⚠️ Y de ahí salió otra: **un formulario que NO trae ningún campo de importe ya no pone el gasto
  a 0** (`_trae_importe` en `_bag_update_expense_from_form`). Sin esa guarda, quitar los campos para
  protegerlos **borraba el importe**.
  · ⚠️⚠️ **LA DIVISIÓN ANTIGUA SEGUÍA VIVA** en el mismo menú (dentro de «Gasto lo cubre…»): creaba
  CLONES sin `split_role`, que pasaban los filtros y se pagaban y contabilizaban por su cuenta. Se
  **retiró** de la pantalla y el endpoint la rechaza sobre un gasto ya dividido.
  · **Los CONTADORES de Administración** no excluían las partes (la pestaña decía 2 y se veía 1), y
  el **justificante** no se espejaba, así que una parte contaba para siempre como «pagado sin
  justificante» en un bloque que no la listaba.
  · **El candado del reparto** mira también `holded_doc_id`: cambiar los importes de algo ya subido
  a Holded dejaba la app y la contabilidad desparejadas sin remedio.
  · **No se reparte a una bolsa CERRADA/LIQUIDADA** (la misma guarda que el alta de un gasto): con
  `bag_close` la bolsa queda CERRADA pero `is_archived=False`, así que se ofrecía.
  · **Un PRORRATEO no se divide**: su parte se creaba sin `proration_source_bag_id` y ese dinero
  quedaba libre para volver a prorratearlo en otra bolsa.
  · **Ni partes a 0 € ni negativas**: que la SUMA cuadre no basta; una fila a 0 en otra bolsa no se
  puede pagar ni contabilizar y le impide cerrarse.
  · **Al quitar una bolsa del reparto se recalculan los porcentajes**: si no, la etiqueta seguía
  diciendo «33,33%» cuando esa bolsa ya se llevaba el 66,67%.

- ⚠️⚠️⚠️ **EL DINERO NO SE ALTERA · HAY DOS PARSERS Y EL FORMATO LO DECIDE EL ORIGEN DEL DATO**
  (bug GRAVE con capturas, sep 2026: una liquidación de royalties de **316,66 €** salía como
  **316.663,00 €** y a facturar **383.162,23 €**). En España el **PUNTO** es de miles y de millón y
  la **COMA** es la decimal, pero el **PROGRAMA escribe canónico** (punto decimal), así que un mismo
  texto —«316.663»— significa una cosa u otra según **de dónde venga**, y por su forma NO hay manera
  de acertar. Por eso hay DOS puntos únicos:
  · **`_parse_money_decimal(v)`** ← lo que **ESCRIBE UNA PERSONA** (un formulario, un PDF, un
    Excel): «40.000» son **CUARENTA MIL**. De él viven `_bag_money`, `_parse_money`, `_inv_money`,
    **`_parse_optional_money`** y `_embargo_parse_es_decimal`.
  · **`_money_value(v)`** ← lo que **YA ES UN DATO**: una columna `Numeric`, un JSONB, un snapshot,
    un cálculo. Aquí el punto es **SIEMPRE decimal**. De él viven **`_money_or_zero`** (sus ~260
    usos son datos) y **`_sim_d`**.
  · **`_money_number(v)`** es la primera puerta de los dos: **un número NO se parsea**. Las columnas
    son `Numeric` **sin escala**, así que un importe conserva todos sus decimales y `str(Decimal)`
    daba «316.663» → con la regla de los miles, **x1000**.
  ⚠️⚠️ **Un grupo de MILES tiene EXACTAMENTE 3 dígitos**: «40.000» son miles, pero «1234.56» y
  «12.3456» son DECIMALES. La regla `not in (1, 2)` juntaba los de 4+ decimales y multiplicaba el
  importe. Está espejada en **4 sitios** (`app.py`, `money_input.js`, `invoice_read.py`,
  `buyer_import.py`): si se toca uno, se tocan los cuatro.
  ⚠️⚠️ **En un JSONB un importe va como NÚMERO**: `json.dumps(..., default=str)` lo guardaba como
  TEXTO y al releerlo se interpretaba como miles. Punto único **`_money_json_safe`** (el `default=`
  de los `json.dumps` que GUARDAN; los de firma/hash siguen con `default=str` a propósito: cambiarlos
  invalidaría las firmas guardadas y todas las liquidaciones dirían «los ingresos han cambiado»).
  ⚠️⚠️ **En el NAVEGADOR pasa lo mismo** (`money_input.js`): **`toCanonical`** es lo que teclea una
  persona (punto = miles) y **`fromServer`** el `value` que pinta el servidor (punto = decimal), que
  es lo que usa `upgrade()` al abrir un formulario — sin eso, un `value="316.663333"` se enseñaba
  como «316.663.333» y se enviaba así. Lo que se TECLEA se ve con su punto de miles («40.000») y
  viaja canónico («40000»).
  ⚠️ Los **PORCENTAJES** no son importes: van por **`_parse_pct_decimal`** / **`_parse_optional_pct`**
  (el punto siempre decimal), porque «33.333» son treinta y tres, no treinta y tres mil.
  ⚠️ **`_parse_optional_decimal` se ha RETIRADO** (hacía `replace(",", ".")` a pelo): un caché de
  «40.000» se guardaba como **40 €** y un «1.234,56» se **PERDÍA** (el `Decimal` reventaba con
  «1.234.56» y devolvía None). Sus 26 usos se repartieron entre `_parse_optional_money` (importes) y
  `_parse_optional_pct` (porcentajes) — al añadir un campo nuevo, elegir el que toca.
  ⚠️ En el JS, un DATO se lee con `parseFloat` (punto decimal) y un CAMPO con **`window.numv`**:
  `parseFloat('40.000')` da 40.
  · **PRUEBA DE REGRESIÓN: `python3 tools/check_money.py`** (los dos parsers, los números, el JSONB,
  el caso de la captura, los otros motores y el espejo del JS). Si se toca un parser de importes,
  tiene que seguir en verde. Y `tools/check_invoice_read.py` también.
  · **AUDITORÍA con AST** para encontrar formularios leídos con el parser de datos: recorrer las
  llamadas a `_money_or_zero`/`_money_value` y comprobar si su argumento deriva de `form`/
  `request.form` (hoy quedan 12 y las 12 son falsos positivos verificados: dicts calculados y
  `getattr` del ORM).
  ⚠️⚠️ **VENTANA DEL FALLO: del 2 al 8 de septiembre de 2026** (el commit `c3c22a0` introdujo la
  regla del punto de miles en el punto único). En ese periodo, cualquier importe con **3 o más
  decimales** que pasara por texto (los snapshots de royalties, los payloads) se multiplicó por mil
  **al enseñarlo y al guardarlo si alguien lo confirmó** — hay que revisar lo grabado esos días:
  facturas subidas, gastos corregidos a mano y liquidaciones facturadas.

- ⚠️ **UNA BOLSA NO REPITE SUS DATOS: la cabecera ya los dice** (sep 2026). El módulo «Datos de la
  bolsa» se **retiró**: lo que enseñaba (título, tipo, estado, artistas, vínculo, fechas y empresa)
  está en su `ficha-hero`. Se editan con el **LÁPIZ de la cabecera**, que abre el MISMO formulario
  (`#bagDataForm`, oculto, con **`data-keep-view`** para no esconder nada de lo que ya está a la
  vista). La **descripción** y las **indicaciones económicas** —que la cabecera no dice— se pintan
  debajo **solo si tienen algo**.
  · **LAS NOTAS solo son un módulo SI HAY NOTAS**; si no, queda una **barra fina con el icono de una
  nota** (`.bag-notes-bar__btn`) que abre el formulario. Un módulo vacío que dice «todavía no hay
  notas» solo ocupa sitio. El formulario es una macro (`bag_note_form`), la misma en los dos casos.

- ⚠️⚠️⚠️ **UNA FACTURA DICE DÓNDE HAY QUE PAGARLA: EL IBAN SE RESUELVE AL SUBIRLA** (sep 2026, bug
  real: «llegan facturas a pendiente de pago sin el IBAN del proveedor, y en la factura viene»).
  Eran **tres agujeros distintos**, cada uno por su lado:
  ⚠️⚠️ **1 · EL REGISTRO SOLO EXIGÍA LOS DATOS A QUIEN NO ESTABA DADO DE ALTA.** En
  `public_invoice_register` la comprobación era **`if faltan and promoter is None`**, así que los
  obligatorios (dirección fiscal, correo, teléfono y **la cuenta**) solo se pedían al crear un
  proveedor NUEVO: a uno que ya estaba y no tenía IBAN se le dejaba pasar y su factura llegaba a
  «pendiente de pago» sin cuenta a la que pagarle. Ahora **lo que falta se mide contra lo que
  QUEDARÍA** (lo que llega + lo que ya tiene, vía el `missing` de `_billing_profile_payload`, que es
  el punto único).
  ⚠️ Y **un IBAN que no vale es como no tenerlo** (`_iban_is_valid`, mod-97): se vuelve a pedir, y
  **no se enseña bloqueado** —el formulario bloquea lo que «ya tenemos», así que enseñando uno malo
  no habría forma de corregirlo—.
  ⚠️⚠️ **2 · EL IBAN DE LA FACTURA NO SE LEÍA NUNCA.** `_detect_iban_in_text` existía desde el alta
  de terceros (el certificado de titularidad) pero `_detect_invoice_meta` no lo sacaba. Ahora sí, y
  de ahí sale la cuenta: **`_invoice_iban_candidate`** (válido y **que NO sea una cuenta NUESTRA**:
  muchas facturas llevan también dónde domiciliar el cobro, y darla por buena sería pagarnos a
  nosotros mismos) · **`_iban_fill(session_db, obj, iban)`** (la pone en la ficha de quien factura
  —tercero **o su SOCIEDAD**, que es de donde sale el pago si el gasto factura con ella— **solo si no
  tiene ninguna**: nunca pisa una escrita) · **`_invoice_iban_apply`** · y
  **`_invoice_iban_from_upload`**, que lee el documento **SIN consumir su stream** (después hay que
  subirlo).
  · **`SupplierInvoice.bank_account`** (columna nueva) guarda lo que decía la factura: así se puede
  aplicar más tarde y se arregla lo ya subido con **«Leer los datos que faltan»** de la base de
  facturas, que ahora también completa cuentas y dice cuántas.
  ⚠️⚠️ **3 · LOS OTROS CAMINOS NO COMPROBABAN NADA.** Una factura entra por la landing pública, por
  la petición de una bolsa, por la liquidación de royalties, **desde dentro** (`interno=1`), al
  **reemplazar** el documento y —sobre todo— en el **formulario de un gasto de bolsa**, que es por
  donde entra casi todo lo que se paga. Ahora la cuenta se lee y se completa **en todos**.
  · **SIN CUENTA NO SE ACEPTA LA FACTURA** (`public_invoice_upload`): si no la tiene el proveedor y
  la factura no la dice, se responde **`need_bank`** y la pantalla la pide ahí mismo (campo nuevo en
  el repaso de la factura, con lo leído ya puesto). El rechazo **queda apuntado**
  (`_invoice_attempt_log`, code `BANK`): un rechazo no puede ser invisible.
  · **Y LO QUE YA ESTÁ SE ARREGLA DONDE SE VE**: en «pendiente de pago», la línea que avisa de que
  falta el IBAN lleva **«Poner la cuenta»** → pop-up único (`payment_bank_save`) que la guarda **en la
  ficha de quien cobra** (así la próxima vez ya no falta) o la **LEE de la propia factura**. Vale para
  un gasto de bolsa y para una liquidación de royalties.
  ⚠️ Tampoco ahí se deja poner una cuenta NUESTRA, y el IBAN se valida siempre (mod-97).
  ⚠️ El pop-up es UNO por página y su URL se fija **EN EL CLIC** (con `modal_stack` por medio,
  `shown.bs.modal` no siempre llega), y su JS va por **delegación**: estas listas se repintan.

- **ADMINISTRACIÓN · DE QUIÉN ES CADA BOLSA, debajo de su nombre** (sep 2026): en pendiente de pago,
  en liquidación y en cierre, bajo el título de la bolsa va **el artista con su foto** en pequeño
  (`artist_chip`), que es lo que identifica una liquidación de un vistazo. Punto único
  **`_bag_artist_chips(session_db, bag)`** (reutiliza `_bag_artist_rows` y cae a `bag.artist`),
  **cacheado por bolsa**: estas pantallas la pintan una vez por gasto.


- ⚠️⚠️⚠️ **CADA VEZ QUE SE GUARDABAN LAS COMISIONES, EL GASTO SE DUPLICABA EN LA BOLSA** (bug real y
  de DINERO, sep 2026). `_replace_concert_zone_agents` borraba todas las filas y las recreaba, así
  que perdían su `bag_expense_id`: el `_concert_commissions_sync_bag` de después creaba un gasto
  **nuevo** y el de antes se quedaba **huérfano en la bolsa** —y de ahí, en la liquidación—. Sin
  ningún error: simplemente el importe crecía.
  ⚠️ Probado con la app real: con el código de antes, tres guardados del mismo módulo dejaban
  **500 € → 1.000 € → 1.500 €**; con el arreglo se queda en **500 €** las tres veces.
  · **Arreglo**: antes de borrar se guarda lo que cuelga de cada apunte (su gasto en la bolsa y su
  factura), se repone en el que vuelve a estar (`_zone_agent_key`) y **el gasto del que ya no está
  se borra**.
  ⚠️ **Puede haber gastos duplicados en bolsas de producción** de antes de este arreglo: se ven en la
  bolsa como varias líneas iguales de categoría «Comisiones».

- ⚠️⚠️ **COMISIONES Y «OTROS GASTOS» SE APUNTAN IGUAL PERO NO SON LO MISMO** (sep 2026, lo pidió
  Dani). En el módulo de la actividad se puede apuntar una **comisión** o un **otro gasto**: los dos
  dicen a quién se le paga, cuánto y **si va contra el caché** (gasto sobre el caché o lo reduce), y
  los dos llegan solos a la bolsa y a la liquidación. La diferencia está en dónde caen:
  · una **comisión** entra en la bolsa con la categoría **«Comisiones»**;
  · un **otro gasto** lleva además su **TIPO** (`expense_category`, el catálogo de siempre
    `SIM_EXPENSE_CATEGORIES`) y entra **con esa categoría** — que es lo que Dani pidió con «se separa
    de comisiones» y lo que hace que en la liquidación salga en su sitio.
  · Columnas nuevas en `ConcertZoneAgent`: **`entry_kind`** y **`expense_category`**, **cada una en
    su propia sentencia** del `ensure_*` (la regla de oro de la casa).
  ⚠️ **El dedupe era por PERSONA**, así que a la misma empresa no se le podían apuntar DOS cosas —su
  comisión y, aparte, un gasto— y la segunda se comía a la primera sin decir nada. Ahora la clave es
  `_zone_agent_key` (persona + qué es + tipo + concepto).
  · **Y SE NOTIFICA**: en el aviso al artista, «Comisiones» y «Otros gastos» son **dos módulos
    distintos**, cada uno con su ojo, y el gasto dice de qué es. → `docs/app/actividades.md`
