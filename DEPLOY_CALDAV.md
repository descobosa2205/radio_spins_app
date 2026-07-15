# Despliegue del servidor CalDAV (fuera de Cloudflare)

## Por qué

La app CalDAV **ya funciona**, pero en Render **no puede** verificarse desde el iPhone. Motivo: Render
sirve todo detrás de **Cloudflare**, y Cloudflare **bloquea con un `405`** los métodos WebDAV
`PROPFIND` y `REPORT` **antes** de que lleguen a la app. iOS verifica una cuenta CalDAV haciendo justo
un `PROPFIND`, así que la verificación falla siempre. (El enlace de **suscripción** sí funciona porque
es un simple `GET`, que Cloudflare deja pasar.)

**Solución:** desplegar el **mismo código** en un host **sin** Cloudflare (Fly.io) y exponerlo en un
subdominio propio. Ese segundo host arranca con `CALDAV_ONLY=1`, lo que hace que **solo** sirva el
servidor CalDAV; responde `404` a todo lo demás, así el back office **no** queda accesible por ese
subdominio. Render sigue igual (sin `CALDAV_ONLY`).

```
iPhone ──PROPFIND──►  caldav.33producciones.es  (Fly.io, sin Cloudflare)  ─┐
                                                                           ├─► misma BD Supabase
Navegador ──────────►  app.33producciones.es    (Render, como siempre)   ─┘
```

---

## Requisitos previos

1. Cuenta en **Fly.io** (https://fly.io) con método de pago (la máquina más pequeña vale ~2–4 €/mes).
2. **flyctl** instalado en tu Mac:
   ```bash
   brew install flyctl        # o: curl -L https://fly.io/install.sh | sh
   fly auth login
   ```
3. Estar en la carpeta del proyecto (`radio_spins_app`), con los ficheros ya añadidos
   (`Dockerfile.caldav`, `fly.toml`, `.dockerignore`) — ya están en el repo.

---

## Paso 1 · Crear la app en Fly (sin desplegar aún)

```bash
fly launch --no-deploy --copy-config --name radio-spins-caldav --region ams
```

- `--copy-config` usa el `fly.toml` que ya está en el repo.
- Si el nombre `radio-spins-caldav` está cogido, elige otro (apunta cuál: será tu `*.fly.dev`).
- Si te pregunta por base de datos / Redis: **No** a todo (usamos Supabase).

---

## Paso 2 · Secretos (credenciales)

El host CalDAV necesita conectarse a **la misma base de datos** que Render.

```bash
# 1) DATABASE_URL: usa EXACTAMENTE el mismo valor que tienes en Render
#    (Render → tu servicio → Environment → DATABASE_URL → copiar).
fly secrets set DATABASE_URL='postgresql://...(pega aquí el mismo de Render)...'

# 2) FLASK_SECRET_KEY: cualquier cadena larga y aleatoria (CalDAV usa Basic Auth, no sesión,
#    pero conviene fijarla). Puedes generarla así:
fly secrets set FLASK_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
```

> No hace falta `SUPABASE_URL` ni la service-role key: CalDAV no toca el Storage.

---

## Paso 3 · Desplegar

```bash
fly deploy
```

Espera a que termine el build (instala pandas/Pillow/etc., tarda unos minutos la primera vez) y a que
la máquina quede **healthy** (el health check pega a `/caldav/health`).

Comprueba que arrancó:
```bash
fly logs                       # deberías ver el arranque de gunicorn, sin errores de BD
curl -i https://radio-spins-caldav.fly.dev/caldav/health   # -> 200 ok
```

---

## Paso 4 · Probar que PROPFIND pasa (la prueba de fuego)

Con tu **correo y contraseña de la app** (los mismos del back office):

```bash
curl -i -u 'escobosa@33producciones.es:TU_PASSWORD' \
  -X PROPFIND -H 'Depth: 0' \
  https://radio-spins-caldav.fly.dev/caldav/
```

- ✅ **Esperado: `HTTP/2 207`** (Multi-Status) con XML del principal. → ¡Cloudflare ya no estorba!
- ❌ Si sale `401`: revisa usuario/contraseña.
- ❌ Si sale `405`: algo enruta por Cloudflare todavía (no debería en fly.dev). Avísame.

**Prueba en el iPhone** (ya con el dominio `.fly.dev`, sin tocar DNS aún):
`Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir cuenta CalDAV`
- **Servidor:** `radio-spins-caldav.fly.dev`
- **Usuario:** tu correo de la app
- **Contraseña:** tu contraseña de la app

Si verifica y aparecen los calendarios de tus artistas → **funciona**. Ya solo queda ponerle un
dominio bonito (Paso 5). Si prefieres quedarte con el `.fly.dev`, sáltate el Paso 5 y ve al 6.

---

## Paso 5 · Dominio propio `caldav.33producciones.es` (opcional pero recomendado)

1. Averigua la IP de tu app en Fly:
   ```bash
   fly ips list        # anota la IPv4 (v4) y la IPv6 (v6)
   ```
   (Si no hay IPv4 dedicada y quieres una: `fly ips allocate-v4` — puede tener un pequeño coste;
   la compartida suele bastar.)

2. En tu proveedor de DNS de `33producciones.es` (la misma zona donde ya vive `app.33producciones.es`), crea:
   - Registro **A** `caldav` → la IPv4 de Fly.
   - Registro **AAAA** `caldav` → la IPv6 de Fly.
   > ⚠️ Si tu DNS es Cloudflare, pon esos registros en **"DNS only" (nube gris)**, NO "Proxied"
   > (nube naranja) — si no, volverías a meter Cloudflare delante y `PROPFIND` fallaría otra vez.

3. Provisiona el certificado HTTPS en Fly:
   ```bash
   fly certs add caldav.33producciones.es
   fly certs show caldav.33producciones.es   # espera a "Ready" (unos minutos)
   ```

4. Repite la prueba del Paso 4 pero contra `https://caldav.33producciones.es/caldav/`.

---

## Paso 6 · Que la guía de la app muestre el host correcto

La página de guía (`/caldav/guia`) que ven los usuarios en la app la sirve **Render**. Para que
muestre el servidor CalDAV correcto, define en **Render** (no en Fly) la variable:

```
CALDAV_PUBLIC_HOST = caldav.33producciones.es
```
(o `radio-spins-caldav.fly.dev` si te quedas sin dominio propio).

Render → tu servicio → **Environment** → Add → guardar (redeploya solo). A partir de ahí la guía dirá
el host bueno. **Sin** esta variable, la guía seguiría mostrando el dominio de Render, que no sirve CalDAV.

---

## Actualizaciones futuras

Cuando cambie el código y quieras actualizar también el host CalDAV:
```bash
fly deploy
```
No necesita nada más (secretos y config quedan guardados). Render se actualiza por su cuenta con el push.

## Coste

Una `shared-cpu-1x` con 512 MB siempre encendida ≈ **2–4 €/mes**. Es lo mínimo para que iOS no sufra
cold-starts al verificar/sincronizar.

## Si algo falla

- `fly logs` — verás la línea `CALDAV <método> <ruta> ...` de cada petición (logging ya incluido) y
  cualquier error de conexión a BD.
- `fly status` / `fly checks list` — estado de la máquina y del health check.
- `PROPFIND` da `405` en `.fly.dev` → me avisas (no debería pasar sin Cloudflare).
- Verifica en iPhone pero no aparecen calendarios → el usuario no tiene artistas asignados (rol
  distinto de 10 y sin `assigned_artist_ids`). Es lo esperado; asígnale artistas en el back office.
