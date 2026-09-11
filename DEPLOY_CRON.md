# EL CRON DE LA APP · cómo se configura (una sola vez)

Toda la automatización de la app cuelga de **UNA sola dirección** a la que el servidor le pega
**cada minuto**. La app decide sola qué le toca a cada cosa, así que **esto se configura una vez y
no hay que volver a tocarlo**: una automatización nueva empieza a correr sola.

```
https://app.33producciones.es/cron?key=LA_CLAVE
```

---

## 1 · La clave

En **Render → el servicio de la app → Environment**, añade una variable:

| Clave | Valor |
|---|---|
| `APP_CRON_KEY` | una cadena larga e inventada (por ejemplo `33p-cron-7f2c9a5b1e4d8` ) |

Sirve para que nadie de fuera pueda lanzar las automatizaciones. Cámbiala cuando quieras: solo hay
que cambiarla también en el paso 2.

> Las claves antiguas (`DOCS_CRON_KEY`, `PLEO_CRON_KEY`, `CHARTMETRIC_CRON_KEY`…) **siguen
> valiendo**, así que lo que ya está configurado no se rompe mientras haces el cambio.

---

## 2 · Quién le pega cada minuto

### Opción A — cron-job.org (gratis, es lo que recomiendo)

1. Entra en <https://console.cron-job.org> y crea una cuenta.
2. **Create cronjob**.
3. **Title**: `App 33 · automatizaciones`
4. **URL**: `https://app.33producciones.es/cron?key=LA_CLAVE`
5. **Schedule**: *Every 1 minute* (en el selector: «Every minute»).
6. **Save**.

Listo. En «History» se ve cada latido; todos tienen que salir en **200**.

### Opción B — Render Cron Job

1. Render → **New +** → **Cron Job**.
2. **Name**: `app33-cron`
3. **Schedule**: `* * * * *`
4. **Command**:
   ```bash
   curl -fsS "https://app.33producciones.es/cron?key=LA_CLAVE"
   ```
5. **Create Cron Job**.

> Render cobra por minuto de ejecución del cron job; cron-job.org es gratis y hace lo mismo (una
> llamada HTTP). Cualquiera de las dos vale.

---

## 3 · Comprobar que está funcionando

En la app: **Integraciones → Automatizaciones**.

* Arriba dice **«Latiendo · hace un momento»** en verde. Si dice «Sin latido» o «Nunca ha latido»,
  el paso 2 no está bien: comprueba la URL y la clave.
* Debajo, la lista de todo lo que hace la app sola, cada cuánto le toca, cuándo fue la última vez y
  qué hizo. Si algo falla, sale en rojo con el motivo.
* Cada una tiene un botón ▶ para **lanzarla ahora mismo** (y otro arriba para lanzarlas todas), por
  si quieres ver el resultado sin esperar.

---

## 4 · Los crons antiguos

Se pueden **borrar** en cuanto el nuevo esté latiendo:

```
/cron/documentos-caducados   /cron/actualizar-ventas     /cron/notas-de-prensa
/cron/publicaciones          /cron/entrega-masters       /cron/materiales-proyecto
/cron/afavor                 /cron/pleo/refresh          /cron/cabify/refresh
/cron/holded/refresh         /cron/chartmetric/refresh   /cron/enterticket/refresh
```

Las rutas **siguen existiendo** (si dejas alguna configurada no pasa nada: además de lo suyo,
ejecuta lo que le toque al resto), pero ya no hacen falta.

---

## 5 · Qué hace la app sola, y cada cuánto

| Cada | Qué |
|---|---|
| minuto | Notas de prensa programadas |
| 5 min | Recordatorios de publicación (plan de lanzamiento) |
| 15 min | Enterticket · ventas en vivo |
| hora | **Actividades sin anunciar** (el aviso del mes, el recordatorio y el escalado a dirección) · pedir al promotor que actualice sus ventas · recordárselo a ticketing · Pleo · Holded |
| 2 horas | Cabify |
| día (8:00) | Documentos caducados · entregas de masters · plazos de materiales · avisos del plan · royalties «a favor» · playlists de valoración |
| día (9:00) | Enlaces de venta al promotor |
| día (6:00) | Chartmetric |

**Una automatización nueva se añade en el código (`CRON_TASKS`) y empieza a correr sola: aquí no
hay que tocar nada nunca más.**
