# Diseño · la bandeja, los permisos y las entregas

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- LA BANDEJA DE DISEÑO · todo lo que le han pedido, por fecha de entrega
- EL POP-UP DE UNA TAREA · lo que se pide, los adjuntos y la zona de subir
- DÓNDE VA LO QUE SUBE (y a quién se avisa)
- DISEÑO TIENE QUE PODER VER Y SUBIR LO QUE LE PIDEN (los 403 que se comía)
- CÓMO SE AÑADE UNA TAREA NUEVA

---

## LA BANDEJA DE DISEÑO · todo lo que le han pedido, por fecha de entrega

⚠️⚠️ **`_design_tasks(session_db)` es el PUNTO ÚNICO** de lo que diseño tiene pendiente. De ahí
salen **los tres sitios** donde se enseña, así que no pueden decir cosas distintas:

- la pantalla **`/diseno`** (`diseno_view` → `templates/diseno_inbox.html`),
- el módulo de Inicio (**`_home_design_tasks`** → `HOME_DESIGN_TASKS`, agrupado por sujeto),
- y, a través de él, «Mis tareas pendientes» (`HOME_TASK_SOURCES`).

**Qué entra** (una tarea por cosa, no por pantalla):

| clave | qué es | de dónde sale | cómo se entrega |
|---|---|---|---|
| `ARTWORK` | la cartelería de una actividad | `ConcertArtworkRequest` OURS en REQUESTED/CORRECTIONS sin carteles | subiendo los carteles |
| `SOLDOUT` | el cartel de Sold Out (se pide solo al 90 %) | `soldout_requested_at` sin entregar | subiendo los carteles |
| `ARTWORK_REVIEW` | los carteles por aprobar (el **primer** visto bueno) | `validation_status='PENDING'` | **no se sube**: lleva a la pestaña Cartelería (se aprueban uno a uno) |
| `DISCO_ARTWORK` | la portada de un lanzamiento | `_disco_artwork_state` who=US, pedida y sin entregar | el JPG **y** el PSD |
| `DISCO_CREATIVE` | cada creatividad (una tarea por pieza) | `DiscoProjectCreative` en SOLICITADA | un archivo por pieza |
| `DISCO_PLAN_CONTENT` | un contenido del plan de lanzamiento | `DiscoReleaseContent.design_requested_at` sin archivo | un archivo |
| `DISCO_VIDEO_THUMB` | la miniatura del videoclip de un proyecto | `production_payload['video']['thumb']` pedida y sin hacer | la imagen |
| `SONG_VIDEO_THUMB` | la miniatura pedida desde una canción suelta | `Song.videoclip_thumb_json.asked_at` sin `SongMaterial` VIDEO_THUMB | la imagen |
| `PRESS_DESIGN` | el gráfico de una nota de prensa | `_disco_press_state` pedida, sin enviar y sin diseño | el gráfico |
| `MARKETING_DESIGN` | los materiales de una campaña | `MarketingDesignRequest` en SOLICITADA | los archivos |
| `PETICION` | una petición del departamento | `BookingRequest` con `DISENO` en su payload | **no se sube**: abre su ficha |

**El orden es la URGENCIA**: `_design_sort_key` pone lo que vence ANTES primero y lo que no tiene
fecha detrás. En la cabecera se dice cuántas están **fuera de plazo** y cuántas vencen **esta semana**.

⚠️ **Cada bloque mira el DATO, no una marca aparte** (hay portada subida = está entregada): por eso
una tarea **desaparece sola** en cuanto se hace, que es la regla de la casa.

⚠️ **Es CARO si no se tiene cuidado**: recorre los lanzamientos ACTIVOS y, por cada uno, varios
estados. Los dos más pesados (`_disco_video_state`, que consulta los logos de marca, y
`_disco_press_state`) se saltan mirando **primero el payload en crudo** (`_disco_video(p)['thumb']`,
`_disco_press(p)`) y solo se llaman cuando de verdad hay algo pedido. Con 61 lanzamientos vivos:
**155 ms**.

## EL POP-UP DE UNA TAREA · lo que se pide, los adjuntos y la zona de subir

Al pinchar una fila se abre `#disenoTaskModal` con **la cabecera roja de la casa** (`sw-head`), el
sujeto, las chapas (fecha de entrega con los días que quedan · quién lo pide · cuándo lo pidió),
**«Lo que se pide»** (las `specs` de esa tarea: formatos, tamaños, logos, la idea…), la nota, **los
archivos adjuntos** (las fotos con su miniatura) y la **zona de arrastrar o elegir**. Abajo,
«Abrir la ficha» lleva a donde vive el encargo.

⚠️⚠️ **Las tareas viajan en un `<script type="application/json">`, NO en atributos**: un `|tojson`
dentro de un atributo con comillas dobles **corta el atributo** y el pop-up saldría vacío (la trampa
que ya documenta `CLAUDE.md`). El JSON se monta en la vista **sin `due_date`** (una fecha no es JSON).
⚠️ Los nombres de archivo se pintan con **`textContent`**, nunca por HTML: un archivo puede llamarse
`<script>`.
⚠️ El clic va **delegado en `document`**: la lista se puede repintar y un listener pegado al nodo
moriría.

## DÓNDE VA LO QUE SUBE (y a quién se avisa)

**`POST /diseno/tarea/<kind>/<tid>/subir`** (`diseno_task_upload`, recurso **`diseno`**, que es
**«de acción»**: tenerlo basta para entregar — ver el último apartado)
→ `_design_task_deliver`, que reparte por tipo. Cada rama hace **lo mismo que ya hacía el sitio de
siempre** (el enlace público o la ficha), así que no hay dos verdades:

- **Cartelería / Sold Out**: crea los `ConcertArtworkAsset` con **el visto bueno de diseño ya
  puesto** (`DESIGN_OK`) —⚠️ **no aprobados**: desde sep 2026 un cartel pasa por **DOS** vistos
  buenos y el segundo lo da **contratación**, así que la solicitud se queda **en revisión** y se le
  reclama a quien gestiona la actividad (`_artwork_review_after`; el detalle, en
  `docs/app/carteleria.md`)—, sella el Sold Out, elige el principal por lo cuadrado y avisa a **quien
  gestiona la actividad** (`_announce_alert_owner_ids`).
- **Portada**: exige los **dos** archivos (la imagen y el abierto: PSD/PSB/ZIP/RAR), sella
  `delivered_at` y avisa a quien lleva el proyecto.
- **Creatividad**: la pieza a ENTREGADA y, si ya no queda ninguna, el **encargo entero** también.
- **Contenido del plan**: `file_url` (+ `thumb_url` si es imagen) y `design_done_at`.
- **Miniatura**: se guarda como **`SongMaterial` VIDEO_THUMB** de la canción (el mismo dato que mira
  la tarea) y, si viene de un proyecto, se sella `thumb.done_at`.
- **Nota de prensa**: la parte `design` del `production_payload['press']`.
- **Marketing**: `MarketingActionFile` de tipo MATERIAL y el encargo a ENTREGADA.

⚠️⚠️ **AL SUBIR, EL AVISO DESAPARECE SOLO**: cada rama llama a `_notify_resolve` con el `ref_type` con
el que se pidió (`ARTWORK`, `SOLDOUT`, `DISCO_ARTWORK`, `DISCO_CREATIVES`, `DISCO_PLAN_CONTENT`,
`DISCO_VIDEO_THUMB`, `SONG_VIDEO_THUMB`, `DISCO_PRESS_DESIGN`, `MARKETING_DESIGN`). Comprobado: la
campanita se queda en **cero** y la tarea sale de la lista.
⚠️ **El encargo de MARKETING no se cerraba nunca** (no había nada que lo pasara a ENTREGADA): su
aviso se quedaba en la campanita para siempre aunque los materiales estuvieran subidos. Arreglado.
⚠️ Antes de subir se busca la tarea en el **punto único** (`_design_task_find`): si ya no está
pendiente, no se sube encima.

## DISEÑO TIENE QUE PODER VER Y SUBIR LO QUE LE PIDEN

⚠️⚠️⚠️ **EL TRABAJO DE DISEÑO VIVE EN LA FICHA DE OTRA SECCIÓN** (la actividad es de Contratación, el
lanzamiento de Discográfica, la nota de Promoción, la campaña de Marketing) y diseño **no tiene esas
secciones**: al pinchar su propio aviso se comía un **403**, que es el error que en la pantalla de
Accesos no se puede explicar. Lo arreglado (sep 2026):

- **Leer** las fichas donde trabaja: `diseno` entra en **`ACTIVITY_READ_ACCESS_KEYS`** (la actividad,
  por la cartelería y el Sold Out) y en **`RELEASE_READ_ACCESS_KEYS`** (la canción, por la miniatura);
  y **`_design_read_resource_key`** hace lo mismo con el **proyecto discográfico**
  (`disco_project_detail`), la **nota de prensa** (`promo_press_detail`) y la **campaña**
  (`promotion_detail_view`). Solo en **GET**: escribir sigue exigiendo la sección.
- **Subir carteles**: punto único **`can_upload_artwork()`** (= contratación · **diseño** · dirección).
  `concert_artwork_upload_direct`, `group_artwork_upload_direct`, `concert_artwork_asset_primary` y
  `concert_artwork_asset_delete` exigían `can_edit_concerts()`, que diseño no tiene: el botón se le
  pintaba y el POST le devolvía «Sin permiso».
- **Su propia sección**: el mapeo pasa de `endpoint.startswith("diseno_peticion")` a
  **`endpoint.startswith("diseno_")`**, así cualquier endpoint nuevo de Diseño hereda su recurso (si
  no, `_resolve_request_resource_key` devolvía **None** y el gate no comprobaba nada en un GET).

⚠️ `tools/check_permisos.py` en **cero** después de esto (119 pantallas).

## CÓMO SE AÑADE UNA TAREA NUEVA

En **DOS sitios y en ninguno más**:

1. su constructor dentro de **`_design_tasks`** (`_design_task(...)` con sus `specs`, sus `files` y
   su `due_date`), y su entrada en `DESIGN_TASK_META` / `DESIGN_UPLOAD_ACCEPT`;
2. su rama en **`_design_task_deliver`** (dónde va el archivo, a quién se avisa y qué
   `_notify_resolve` cierra).

El resto —la pantalla, el pop-up, el orden, Inicio y el aviso que desaparece— ya lo hace el motor.

## EL RECURSO `diseno` ES «DE ACCIÓN»

⚠️ En su bandeja diseño solo **ENTREGA lo que le han pedido**: eso ES la función, no «editar» los
datos de otra sección. Por eso `diseno` entra en el `action_only` del gate (junto a
`invitaciones.*`): **tener Diseño basta para subir**. Sin esto, un diseñador con «Ver» se comía un
«no tienes permisos de edición» al subir su propio trabajo.
