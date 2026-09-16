# La CAJA de un artista · ingresos, gastos y balance

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- QUÉ ES LA CAJA y por qué no guarda ni un número
- INGRESOS · lo que FACTURA el artista (no lo que entra en la casa)
- GASTOS · lo que pagan las empresas del grupo, y **la regla del caché**
- BALANCE · los adelantos y lo que le queda a la oficina
- EL PERMISO · un recurso que **no se hereda de la sección**
- LOS APUNTES DE ANTES DE LA APP · el Excel y su validación uno a uno

---

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

## INGRESOS · lo que FACTURA el artista (no lo que entra en la casa)

⚠️⚠️ **Es lo que se lleva ÉL**, no lo que entra en la casa. Lo pidió Dani con esas palabras: «lo
que finalmente factura el artista, la parte del reparto que le corresponde». Lo que se queda la
casa se lee aparte, en el Balance.

| tipo | de dónde sale | lo del artista | lo de la oficina |
|---|---|---|---|
| **Discográfico** | `RoyaltyLiquidation` del artista | `snapshot['total_amount']` (su parte, ya calculada y congelada) | `total_income − total_amount`: **el royalty que queda tras pagar los suyos** |
| **Actividades** | sus `Concert` no cancelados y ya celebrados, con caché | el **% del artista** de su contrato | el **% de la oficina** |
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

- **Factura el artista** — el total de Ingresos.
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

## Dónde está cada cosa

| qué | dónde |
|---|---|
| el motor (punto único) | `app.py` · `_artist_cash_data` y sus `_artist_cash_*` |
| el Excel y la validación | `app.py` · `artist_cash_template` / `_upload` / `_validate` / `_delete` / `_batch_undo` |
| la pantalla | `templates/_artist_cash.html` (incluido desde `artist_detail.html`) |
| los estilos | `static/css/styles.css` · bloque `.ac-*` |
| el modelo de los apuntes | `models.py` · `ArtistLedgerEntry` (+ su DDL en `ensure_payment_batches_schema`) |
| el permiso | `artists.caja` · `EXACT_ACCESS_KEYS` · `_artist_cash_access_seed` |
