# La CAJA de un artista · ingresos, gastos y balance

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- ⚠️ SOLO CUENTA LO YA CERRADO, y sobre el BALANCE FINAL (sep 2026)
- ⚠️⚠️ COBRADO POR EL ARTISTA · solo lo EFECTIVAMENTE LIQUIDADO (sep 2026)
- ⚠️ ROYALTIES · el beneficio es lo facturado MENOS todo lo que se paga
- ⚠️ ACTIVIDADES · el contrato reparte el importe FINAL de la liquidación
- LA PESTAÑA «CAJA» DE ADMINISTRACIÓN (la misma pantalla y el mismo motor)
- EL PDF del resumen, y la PLANTILLA con desplegables
- QUÉ ES LA CAJA y por qué no guarda ni un número
- INGRESOS · lo que COBRA el artista (no lo que entra en la casa)
- GASTOS · lo que pagan las empresas del grupo, y **la regla del caché**
- BALANCE · los adelantos y lo que le queda a la oficina
- EL PERMISO · un recurso que **no se hereda de la sección**
- LOS APUNTES DE ANTES DE LA APP · el Excel y su validación uno a uno

---


## ⚠️⚠️ SOLO CUENTA LO YA CERRADO, y sobre el BALANCE FINAL (sep 2026)

Lo pidió Dani: «el planteamiento está bien pero **los datos no son reales ni exactos**». Eran dos
cosas, las dos corregidas:

- **Una bolsa solo entra en la caja cuando está CERRADA** y administración ha dicho que se incluye
  (`_bag_cash_counts`). Antes sumaban **todas**, abiertas incluidas — y eso es lo que se VA a
  gastar, no lo gastado. Las que siguen abiertas se cuentan aparte y **se dicen** («y además hay N
  bolsas todavía abiertas por X €»), porque un total más bajo sin explicación parece un fallo.
- **Lo que cuenta es el BALANCE FINAL, no el gasto realizado** (`_bag_cash_cost`, el punto único):
  lo que **cubre el promotor** (o se le refactura) y lo que **cubre el artista** no es nuestro, y lo
  que asume la bolsa de una actividad **lo paga su caché**. La línea lo dice: «Fuera del balance
  500 € (lo cubre el artista o el promotor)».

**LA DECISIÓN** vive en la bolsa (`WorkflowBag.cash_impact` · `cash_decided_at` ·
`cash_decided_by_nick`) y se toma **al cerrar la liquidación en administración**, que es el único
momento en el que alguien la está revisando **con el coste final delante**. Si la bolsa se cierra
por otro camino (al pagarse lo último), se da por **INCLUIDA** —el caso normal— y queda **dicha y
cambiable** en el panel de la bolsa (`bag_cash_impact_save`, solo administración y dirección):
dejarla sin decidir la haría desaparecer de la caja en silencio.
⚠️ Las bolsas que **ya estaban cerradas** entraron de una vez (`_bag_cash_backfill`, marca en los
ajustes): si no, el balance de todos los artistas habría cambiado de golpe sin que nadie tocara nada.

## ⚠️⚠️ COBRADO POR EL ARTISTA · solo lo EFECTIVAMENTE LIQUIDADO

Se llamaba «**Facturado** por el artista» y contaba cosas que todavía no se le debían. Lo pidió Dani
(sep 2026): «lo facturado por el artista va a llamarse **cobrado por el artista**, y solo se va a
incluir **lo efectivamente liquidado**: lo ya facturado por el artista de royalties y, de las
actividades, **lo que en la liquidación le haya correspondido**, no la factura del caché — hasta que
no finalice la liquidación no aparecen importes».

- **ROYALTIES** — solo suma la liquidación que **él ya ha facturado**:
  `ARTIST_CASH_ROYALTY_BILLED_STATUSES` = **INVOICED · PAID**. Una generada o enviada está
  calculada, pero todavía no se le debe. Lo que falta se cuenta aparte (`artist_pending`) y **se
  dice** en la línea («pendiente de que él facture 3.000 €») y debajo del balance.
  ⚠️ Lo de la OFICINA no cambia: su beneficio por el repertorio (lo ingresado menos TODO lo pagado)
  no depende de que el artista haya emitido su factura.
- **ACTIVIDADES** — la actividad entra **cuando su liquidación ha terminado**, y la liquidación de
  una actividad es la de **su bolsa**: punto único **`_artist_cash_activity_settled`** — tiene bolsa
  y **todas** sus bolsas están cerradas (`_bag_is_closed`, el mismo con el que entran los GASTOS).
  Mientras quede una abierta el número puede cambiar, así que no se enseña.
  ⚠️ Una actividad **sin bolsa** no está liquidada: tampoco entra.
  ⚠️ El IMPORTE sigue siendo el de `_artist_cash_concert_settled` repartido por el contrato (lo de
  más abajo): lo que cambia es **cuándo** aparece.
  · Las bolsas de las actividades se leen **en bloque** (`_artist_cash_concert_bags`): de una en una
  serían cientos de consultas en una caja con muchas fechas.
- **SE DICE LO QUE NO CUENTA**, como ya se hacía con las bolsas abiertas: «N actividades con la
  liquidación sin terminar (X € para el artista)» y «de royalties hay X liquidados que el artista
  todavía no ha facturado». Van en `balance.pending_activities` / `pending_activity_amount` /
  `pending_royalties` / `pending_royalty_amount`, y salen en la pantalla **y en el PDF**.
  ⚠️ En la pestaña Caja de Administración, un sujeto que **solo** tiene pendientes **sigue saliendo**
  en la lista (con «N sin liquidar»): si desapareciera, se escondería justo lo que hay que trabajar.
- ⚠️ Lo mismo vale para la caja de una **gira o un ciclo** (`_group_cash_data`): si no, la gira diría
  una cosa y la caja del artista otra.
- ⚠️ La clave interna del dato **sigue siendo `balance["artist_billed"]`** (la leen la pantalla, la
  lista de administración, el PDF y la prueba): lo que cambió es **qué** entra y cómo se llama.

## ⚠️⚠️ ROYALTIES · el beneficio es lo facturado MENOS todo lo que se paga

`_artist_cash_royalties`. Lo pidió Dani con estas palabras: «el beneficio de la compañía es el
importe facturado de royalties de ese artista **menos los royalties pagados** por el repertorio del
artista incluido a otros **y los del propio artista**; los royalties pagados **no se consideran
inversión o gasto: solo reducen el ingreso**».

Antes se restaba **solo la parte del artista** (`total_income − total_amount`), así que **lo que
cobran los demás beneficiarios de SUS MISMAS obras** —un autor invitado, un tercero con su
porcentaje— se contaba como beneficio nuestro. Y no lo es: ese dinero sale de la casa.

- El **repertorio** son sus canciones y sus discos (`_artist_cash_repertoire_ids`).
- **Lo que ingresa la compañía** por una obra es el `income` de esa obra en ese semestre, y se cuenta
  **UNA sola vez** aunque la cobren varios: todos los beneficiarios ven la misma base.
- **Lo que se paga** es la suma de los `amount` de **todas** las liquidaciones de ese semestre cuyas
  líneas sean de su repertorio.
- Todo sale del **congelado** (`snapshot`), que es lo que de verdad se liquidó, y va **sin IVA**.
⚠️ Puede salir **negativo** (se liquidó más de lo ingresado ese semestre): se dice tal cual.
⚠️ Y **un royalty pagado NO aparece en «invertido»**: contarlo ahí lo contaría dos veces.

## ⚠️⚠️ ACTIVIDADES · el contrato reparte el importe FINAL de la liquidación

`_artist_cash_concert_settled`. Lo pidió Dani: «que se calculen las liquidaciones de actividades con
caché **acorde a los porcentajes de contratos**, aunque se tenga finalmente en cuenta **el importe
final de la liquidación**, ya que administración puede realizar cambios en el último momento».

O sea: el **REPARTO** lo dice el contrato del artista (como hasta ahora), pero el **IMPORTE** sobre
el que se reparte es el **plan de pagos** (`Concert.payment_terms_json`) —donde administración
factura, marca cobrado y corrige a última hora— y solo si no lo hay manda el **caché pactado**. La
línea dice cuál de los dos se está usando y, si falta por cobrar, cuánto.

## LA PESTAÑA «CAJA» DE ADMINISTRACIÓN

`/administracion?tab=caja`. Lo pidió Dani: «igual que la ficha del artista pero se ve ahí
directamente; **lo que se cambie en las fichas de los artistas o aquí se cambia en ambos lados**».

⚠️⚠️ Por eso aquí **NO hay un segundo motor ni una segunda pantalla**: la lista sale de
`_cash_overview`, que llama al **mismo `_artist_cash_data`**, y al abrir un sujeto se incluye la
**misma `_artist_cash.html`**. Lo único propio son los enlaces del año y del PDF, que los compone
**`_cash_links`** según desde dónde se mire (meterlos en la plantilla con un `url_for` fijo la
ataría a uno de los dos sitios).
- Arriba, **el total de todos**; debajo, un sujeto por fila con sus cuatro datos y las bolsas
  abiertas que todavía no cuentan. Ordenados por lo que más mueven.
- Un **evento** no es otra tabla: se espeja como artista (`Artist.event_id`), así que su caja es la
  de su espejo — y aquí ese espejo SÍ se ofrece, con su nombre y con la etiqueta «Evento».
- ⚠️ **El permiso es `artists.caja`**, el mismo de la pestaña del artista (exacto, sin heredar):
  darle uno propio de administración sería **una segunda puerta a los mismos importes**. Y la
  pestaña **no se pinta** a quien no lo tiene — lo cazó `tools/check_permisos.py`.
- ⚠️ Las liquidaciones de royalties se leen **UNA vez para todos** (`prefetch`): una consulta de
  miles de filas por artista dejaría la pantalla sin abrir.

**GIRAS COMPRADAS Y CICLOS / FESTIVALES PROPIOS** van en **su propio bloque**, debajo
(`_group_cash_data` + `_cash_group_subjects`). No son artistas: son **agrupaciones de actividades**
(`PurchasedTour` y `CycleFestival` agrupan sus conciertos por FK real), así que su caja son **sus
actividades** (con el importe final repartido por el contrato del artista que la toca; aquí no hay
royalties) y **las bolsas de esas actividades**.
⚠️⚠️ **NO SE SUMAN AL TOTAL DE ARRIBA**, y la pantalla lo dice: ese mismo dinero **ya está contado
en la caja del artista** que toca. Son otra forma de mirar lo mismo, y sumarlas sería contarlo dos
veces.
⚠️ La misma pantalla vale para los dos (`_artist_cash.html`), pero los apuntes de antes de la app
son **de un artista**: con `artist` vacío no se pintan ni la plantilla, ni «Subir apuntes», ni su
pop-up — un `url_for` con `artist.id` ahí dentro habría tumbado la pantalla entera.

## EL PDF del resumen, y la PLANTILLA con desplegables

- **`artist_cash_pdf`** (`/artistas/<id>/caja/resumen.pdf`): el resumen **de lo que hay a la vista**
  (el año elegido, o todo), con la **cabecera de la casa** (el logo del grupo arriba a la derecha y
  la banda en el rojo corporativo), los **cuatro datos** y, debajo, **cada categoría desglosada por
  bolsas** con su nota. Sale del MISMO `_artist_cash_data` que la pantalla: el papel no puede decir
  un número distinto del que se está mirando.
- **LA PLANTILLA** (`artist_cash_template`): los tres importes se llaman ahora como lo que son —
  **«Ingreso artista» · «Ingreso oficina» · «Gasto oficina»**— y **«Ingreso o gasto», «Tipo» y
  «Empresa del grupo» son DESPLEGABLES** (lo pidió Dani, «para que todo cuadre bien»): las listas
  van en una hoja `Listas` **oculta**, porque un desplegable escrito dentro de la validación no
  pasa de 255 caracteres y las empresas no caben.
  ⚠️⚠️ **Y LA SUBIDA CASA LAS COLUMNAS POR SU TÍTULO** (`_artist_cash_sheet_map`), no por su sitio:
  la plantilla vieja traía los importes **en otro orden y con otros nombres**, así que leyéndola por
  posición un **gasto habría entrado como ingreso del artista sin avisar de nada**. Los nombres de
  antes están en `ARTIST_CASH_SHEET_ALIASES`, así que una plantilla vieja se sigue subiendo bien.

## QUÉ ES LA CAJA y por qué no guarda ni un número

La pestaña **«Caja»** de la ficha de un artista (sep 2026; antes se llamaba «Liquidaciones» y
estaba **vacía**: ponía «Próximamente»). Responde a tres preguntas, en este orden:

1. **BALANCE** — ¿este artista deja dinero o todavía se está invirtiendo en él?
2. **INGRESOS** — qué ha facturado él, por tipos.
3. **GASTOS** — qué han pagado las empresas del grupo, por tipos.

⚠️⚠️ **`_artist_cash_data(session_db, artist, year)` es el PUNTO ÚNICO** y **calcula todo al
vuelo** desde las tablas de siempre: las liquidaciones de royalties, los cachés y los contratos,
las bolsas y sus gastos, y los adelantos. **No se guarda ningún total**: si se guardara, se
desparejaría del dato el día que alguien corrigiera una factura o un caché, que es la regla de la
casa («si se calcula, no se guarda también»).
⚠️ Lo ÚNICO que se guarda son los apuntes de **antes de la app** (`ArtistLedgerEntry`), que no
están en ninguna parte y por eso hay que meterlos a mano.
⚠️ **Solo se calcula al abrir su pestaña** (`tab == "caja"`): recorre las actividades, las bolsas
y las liquidaciones del artista, y eso no se le hace pagar a quien entra a ver otra cosa.

El selector de **AÑO** de arriba sale de `_artist_cash_years` (los años en los que ese artista
tiene *algo*), más «Todo».

## INGRESOS · lo que COBRA el artista (no lo que entra en la casa)

⚠️⚠️ **Es lo que se lleva ÉL**, no lo que entra en la casa. Lo pidió Dani con esas palabras: «lo
que finalmente factura el artista, la parte del reparto que le corresponde». Lo que se queda la
casa se lee aparte, en el Balance.

| tipo | de dónde sale | lo del artista | lo de la oficina |
|---|---|---|---|
| **Discográfico** | `RoyaltyLiquidation` del artista **ya facturada** (INVOICED/PAID) | `snapshot['total_amount']` (su parte, ya calculada y congelada) | `total_income − total_amount`: **el royalty que queda tras pagar los suyos** |
| **Actividades** | sus `Concert` no cancelados, ya celebrados y con **su liquidación cerrada** | el **% del artista** de su contrato | el **% de la oficina** |
| **Otros** | los apuntes del Excel de tipo INGRESO | `amount_artist` | `amount_company` |

- **EL CACHÉ ya viene con las comisiones descontadas** (`_artist_cash_concert_cache` suma los
  `ConcertCache`): una comisión que REDUCE el caché se la queda quien la cobra antes de que llegue,
  así que no es un ingreso que se reparta. Mismo criterio que lo que se le comunica al artista.
- ⚠️ **QUÉ CONCEPTO DEL CONTRATO manda lo decide el `sale_type`**, que ya sabe si el concierto se
  le VENDE a un promotor de fuera o lo promueve (o participa) una empresa del grupo: `VENDIDO` →
  «Conciertos vendidos», el resto → «Conciertos propios» (`ARTIST_CASH_CONCEPT_SOLD` /
  `..._OWN`, con variantes: si no hay uno, vale «Conciertos», «Booking» o «Management»). No hizo
  falta inventar ningún campo nuevo.
- ⚠️ **Sin contrato, el caché se le da ENTERO al artista y se DICE** («sin contrato» en la línea):
  inventarse un porcentaje sería peor que reconocer que falta el dato.
- El reparto lo aplica `_artist_cash_commitment_split` sobre `_pick_artist_commitment`, que es el
  punto único que ya elige el compromiso vigente por fecha.

## GASTOS · lo que pagan las empresas del grupo, y la regla del caché

Se recorren **las bolsas del artista** (`WorkflowBag.artist_id` o dentro de `artist_ids`) y se
agrupan por tipo:

| grupo | qué bolsas |
|---|---|
| **Contenidos discográficos** | `PROYECTO` · `SINGLE` · `DISCO` |
| **Promoción** | `PROMOCION` (las que tienen su propia bolsa) |
| **Marketing** | una campaña de marketing **del ARTISTA** (`Promotion.kind=MARKETING` y `subject_type=ARTIST`) |
| **Inversión en giras y actividades** | `CONCIERTO` · `GIRA` · `EVENTO_PROMOCIONAL` |
| **Otros gastos** | lo demás (`GENERAL`, `PRORRATEO`) y los apuntes del Excel |

⚠️⚠️ **LA REGLA DEL CACHÉ** (la que pidió Dani y la que más se equivoca al contar). Lo que asume la
bolsa de una actividad **se paga con el caché de esa actividad**, así que **no es gasto de la
oficina** mientras el caché llegue:

```
gasto de la casa = max(0, lo que asume la bolsa − el caché)  +  lo marcado «lo cubre la oficina»
```

· una bolsa **sin caché** → todo su gasto es de la casa;
· el caché **no llega** → la diferencia es de la casa (la bolsa queda en negativo y la asume ella);
· lo que cubre el **artista** o el **promotor** (`covered_by`) **nunca** es gasto nuestro.
⚠️ La línea lo **DICE** («Cubierto por el caché (4.000 € de 4.000 €)»), porque un 0 € sin explicar
parece un fallo. Los totales salen de `_bag_totals`, que ya es el punto único de una bolsa.

⚠️⚠️ **UNA CAMPAÑA DE MARKETING SOLO CUENTA COMO MARKETING SI ES DEL ARTISTA**
(`_artist_cash_bag_group`): la que va pegada a una actividad o a un lanzamiento **ya se cuenta en
SU grupo**, y ponerla además en Marketing la contaría dos veces — que es justo lo que pidió Dani
que no pasara. Y como cada gasto pertenece a UNA bolsa, recorrer bolsas no puede duplicar nada.

## BALANCE · los adelantos y lo que le queda a la oficina

Cuatro cifras grandes y, debajo, los adelantos:

- **Cobrado por el artista** — el total de Ingresos (solo lo ya liquidado: ver la sección de arriba).
- **Invertido por la casa** — el total de Gastos.
- **Se lleva la oficina** — la parte de la oficina de esos ingresos (royalties tras pagar los
  suyos + su % de los cachés).
- **Resultado para la casa** = lo que se lleva − lo invertido. **En verde si deja beneficio y en
  rojo si todavía se está invirtiendo**, que es la pregunta con la que se entra aquí.
- **ADELANTOS** (`PartyDebt` del artista): el concepto tal cual lo escribió quien lo apuntó
  («Arranque de gira», «Adelanto discográfico»…), su empresa, una **barra** con lo devuelto y lo
  que queda. Es el MISMO dato que avisa al ir a pagarle, no una copia.

## EL PERMISO · un recurso que no se hereda de la sección

**`artists.caja`**, y **nace apagado para todo el mundo**. De salida solo lo tienen **dirección**
(por su rol) y **Administración** (`_artist_cash_access_seed`, una sola vez, con el interruptor
económico encendido). Es lo que pidió Dani: aquí está lo más delicado de un artista.

⚠️⚠️ **NO SE HEREDA DE «Artistas»** — y esto es lo importante. En esta app, tener una SECCIÓN da
todas sus pestañas (`_state_has_access` mira los ancestros), así que al principio **cualquiera con
«Artistas» abría la Caja**. Para eso está **`EXACT_ACCESS_KEYS`**: las claves que hay ahí se
comprueban **exactas**, sin mirar al padre. Es el mismo problema que ya tuvo la recaudación de
ventas (`can_view_sales_revenue`, que lo resolvía a mano); ahora se resuelve en **un solo sitio**,
así que el gate, la barra de pestañas y la vista no se pueden desparejar.
⚠️ La clave vieja `artists.liquidaciones` está en `LEGACY_REMOVED_ACCESS_KEYS` y **a propósito NO**
en `MIGRATED_ACCESS_KEYS`: quien tuviera aquella pestaña (que estaba vacía) **no hereda** esta.
⚠️ Los endpoints (`artist_cash_*`) se mapean con una **regla de PREFIJO**; en el `mapping` interno
serían código muerto. Y el mapeo de la pestaña acepta todavía `tab=liquidaciones` (los enlaces
viejos): sin eso caería en `artists` y la vería cualquiera.
⚠️ Sin el permiso, `?tab=caja` **no da un 403**: lleva a la ficha, que abre la primera pestaña que
esa persona sí puede ver (la regla de la casa). La plantilla de Excel sí deniega — ahí no hay
«otra pestaña» a la que caer, y `_access_fallback_url` ya no da el salto inútil a sí misma.

## LOS APUNTES DE ANTES DE LA APP · el Excel y su validación uno a uno

De lo anterior a la app no hay ni una fila, así que el cuadro de mando empezaría en blanco.

- **`artist_cash_template`** baja la plantilla: hoja **«Apuntes»** (fecha · ingreso o gasto · tipo ·
  concepto · inversión · beneficio artista · beneficio compañía · empresa del grupo · notas) con una
  fila de ejemplo en gris, y hoja **«Cómo se rellena»** con **las listas que valen** en cada
  columna (los tipos, y las empresas del grupo tal como están dadas de alta). Esa segunda hoja es
  lo que hace que una subida entre a la primera.
- **`artist_cash_upload`** lo lee y crea un `ArtistLedgerEntry` por línea, **todas PENDIENTES**.
  ⚠️ Una línea **sin fecha o sin ningún importe no se sube y se dice en qué fila está** («fila 14:
  no trae ningún importe»): entrar a medias sería peor, porque nadie sabría qué falta.
  ⚠️ Los importes los escribe una PERSONA, así que se leen con **`_parse_money_decimal`** («40.000»
  son cuarenta mil), que es la regla de la casa.
  ⚠️ El tipo se casa **con tolerancia** (`_artist_cash_match_group`): en un Excel nadie escribe la
  etiqueta clavada.
- **VALIDAR UNO A UNO** (`artist_cash_validate`): hasta entonces el apunte **se ve pero NO SUMA** —
  sale con el **fondo rayado** de la casa y la coletilla «Sin validar: no suma», y arriba un aviso
  con cuántos esperan. Es lo que pidió Dani: «que te muestre todo lo subido para ir validando uno a
  uno antes de que aparezca en el balance».
- **`artist_cash_batch_undo`** deshace una subida entera (`batch_token`) si el Excel venía mal.
  ⚠️ Solo se lleva lo que sigue pendiente: **lo ya validado no se toca** — dar algo por bueno y que
  se borre solo sería lo contrario de validarlo.
- ⚠️ **Sin CHECK en la base** para `kind` / `category` / `status`: los controla la app
  (`ARTIST_CASH_*`). Un CHECK con lista cerrada es una trampa conocida (ver `CLAUDE.md`) y aquí no
  aporta nada que no haga ya el formulario.

- ⚠️⚠️ **EN LA BOLSA NO SE DICE NADA DE LA CAJA** (sep 2026, lo pidió Dani: «esa línea no se tiene
  que mostrar en la bolsa, quita directamente ese módulo»). La barra «Caja del artista» del panel de
  la bolsa se **retiró**: mientras la bolsa está abierta solo podía decir «se decide al cerrar la
  liquidación», o sea, que todavía no hay nada que decir. **Se decide donde se decide**: al CERRAR la
  liquidación, en Administración → Pendiente → De cierre, que es el único momento en el que alguien
  la revisa con el coste FINAL delante (`administration_bag_close_liquidation`).
  ⚠️ El motor (`_bag_cash_*`, `WorkflowBag.cash_impact`) y el endpoint `bag_cash_impact_save` siguen
  estando: lo que se ha quitado es el módulo de la pantalla de la bolsa.

## Dónde está cada cosa

| qué | dónde |
|---|---|
| el motor (punto único) | `app.py` · `_artist_cash_data` y sus `_artist_cash_*` |
| ¿esta bolsa va a la caja? | `app.py` · `_bag_cash_*` (+ `WorkflowBag.cash_impact`) |
| la pestaña de Administración | `app.py` · `_cash_overview` / `_cash_links` · `templates/administracion.html` (tab `caja`) |
| el PDF del resumen | `app.py` · `artist_cash_pdf` / `_artist_cash_pdf_bytes` |
| la caja de una gira / ciclo | `app.py` · `_group_cash_data` · `_cash_group_subjects` |
| la prueba de regresión | `tools/check_caja_artista.py` (101 comprobaciones con la app real) |
| el Excel y la validación | `app.py` · `artist_cash_template` / `_upload` / `_validate` / `_delete` / `_batch_undo` |
| la pantalla | `templates/_artist_cash.html` (incluido desde `artist_detail.html`) |
| los estilos | `static/css/styles.css` · bloque `.ac-*` |
| el modelo de los apuntes | `models.py` · `ArtistLedgerEntry` (+ su DDL en `ensure_payment_batches_schema`) |
| el permiso | `artists.caja` · `EXACT_ACCESS_KEYS` · `_artist_cash_access_seed` |
