# Servidor CalDAV en Fly.io (fuera de Cloudflare)

## Estado (15-sep-2026)

- **Desplegado**: app `radio-spins-caldav` en la cuenta de Fly.io de Dani (org «personal»,
  `d.escobosamartinez@gmail.com`), región **Frankfurt (`fra`)**, una máquina `shared-cpu-1x` con
  **1 GB** (≈ 5,7 $/mes). Hostname provisional: `https://radio-spins-caldav.fly.dev`.
- **Pendiente**: el dominio `caldav.33producciones.es` (paso 5) y la variable `CALDAV_PUBLIC_HOST`
  en Render (paso 6), para que la guía de la app diga el servidor bueno.
- `flyctl` está instalado en el Mac de Dani en `~/.fly/bin` (vía el script de `fly.io/install.sh`,
  no hay Homebrew) y en el PATH de `~/.zshrc`.

## Por qué hace falta un segundo host

El servidor CalDAV vive en `app.py` y **funciona**, pero en Render **no puede** verificarse desde el
iPhone: Render sirve todo detrás de **Cloudflare**, y Cloudflare **bloquea con un `405`** los métodos
WebDAV `PROPFIND` y `REPORT` **antes** de que lleguen a la app (comprobado en jul-2026 y otra vez el
10-sep-2026, también con el dominio propio `app.33producciones.es`). iOS verifica una cuenta CalDAV
haciendo justo un `PROPFIND`, así que la verificación falla siempre. El enlace de **suscripción** `.ics`
sí funciona porque es un simple `GET`.

**Solución**: el **mismo código** en un host **sin** Cloudflare (Fly.io), en un subdominio propio, con
`CALDAV_ONLY=1`: ese host sirve **solo** el servidor CalDAV (+ su guía y el health check) y responde
`404` a todo lo demás, así el back office **no** queda accesible por ahí. Render sigue igual.

```
iPhone ──PROPFIND──►  caldav.33producciones.es  (Fly.io, sin Cloudflare)  ─┐
                                                                           ├─► misma BD Supabase (Frankfurt)
Navegador ──────────►  app.33producciones.es    (Render, como siempre)   ─┘
```

Ficheros del kit (en el repo): `Dockerfile.caldav`, `fly.toml`, `.dockerignore`, y el modo
`CALDAV_ONLY` en `app.py` (gate `_caldav_only_gate`).

---

## Paso 0 · Instalar flyctl (Mac sin Homebrew)

```bash
curl -L https://fly.io/install.sh | sh
```

Añadir a `~/.zshrc` lo que dice el script (ya hecho en el Mac de Dani) y abrir una terminal nueva:

```bash
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
```

## Paso 1 · Cuenta, TARJETA y sesión

⚠️ **La prueba gratuita de Fly no sirve para esto**: da 2 horas de máquina en total y **apaga las
máquinas a los 5 minutos**, justo lo que hace fallar la verificación del iPhone. Hay que poner la
tarjeta desde el principio (Dashboard → Billing → *Add credit card*; al añadirla se acaba la prueba y
se pasa a pago por uso, sin cuota mínima).

```bash
fly auth login          # abre el navegador; después `fly auth whoami` tiene que decir tu correo
```

## Paso 2 · Crear la app (sin desplegar todavía)

Desde la carpeta del proyecto, con el `fly.toml` del repo:

```bash
fly launch --no-deploy --copy-config --name radio-spins-caldav --region fra --yes
```

⚠️ `fly launch` **reescribe `fly.toml`** (le quita los comentarios y reordena): recuperar los
comentarios de git después. Comprobar que siguen `[build] dockerfile`, `[env]`, el check de salud
(`method`/`path`) y `[[vm]]`.

## Paso 3 · Secretos

El host se conecta a **la misma base de datos que Render** (el pooler de Supabase, la `DATABASE_URL`
del `.env`, que es la misma que tiene Render). Esta orden la coge del `.env` sin pegar la contraseña:

```bash
fly secrets set "DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" --app radio-spins-caldav --stage
```

```bash
fly secrets set "FLASK_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n=/+')" --app radio-spins-caldav --stage
```

No hace falta `SUPABASE_URL` ni la service-role key: CalDAV no toca el Storage.

## Paso 4 · Desplegar y comprobar

```bash
fly deploy --app radio-spins-caldav --ha=false --wait-timeout 5m
```

- `--ha=false`: **una** máquina (sin él, el primer despliegue crea dos y se paga el doble).
- La primera vez tarda 5-10 min (construye la imagen en los servidores de Fly; no hace falta Docker).

Comprobaciones, en este orden:

```bash
curl -i https://radio-spins-caldav.fly.dev/caldav/health      # → HTTP/2 200 y «ok»
```

```bash
curl -i -X PROPFIND -H 'Depth: 0' https://radio-spins-caldav.fly.dev/caldav/
```

→ **`401`** con `WWW-Authenticate: Basic`: la petición ha llegado a la app (en Render daba `405` de
Cloudflare). Con tus credenciales de la app tiene que dar **`207`**:

```bash
curl -i -u 'TU_CORREO_DE_LA_APP:TU_CONTRASEÑA' -X PROPFIND -H 'Depth: 0' https://radio-spins-caldav.fly.dev/caldav/
```

- `401` con credenciales → la contraseña no es la de la app (⚠️ es la del **back office**, no la de Fly).
- `405` → algo enruta por Cloudflare todavía (no debería en fly.dev).

**En el iPhone** (iOS 18: Ajustes → Apps → Calendario → Cuentas de Calendario → Añadir cuenta → Otra →
Añadir cuenta CalDAV; en iOS 17: Ajustes → Calendario → Cuentas): servidor
`radio-spins-caldav.fly.dev`, usuario y contraseña **de la app**. Si verifica y aparecen los
calendarios «Calendario · <artista>», funciona.

## Paso 5 · Dominio propio `caldav.33producciones.es`

1. En el DNS de Wix (la misma zona que `app.33producciones.es`), un registro **CNAME**
   `caldav` → `radio-spins-caldav.fly.dev`. (Para un subdominio Fly recomienda CNAME; no hace falta
   IPv4 dedicada.)
2. Certificado:
   ```bash
   fly certs add caldav.33producciones.es --app radio-spins-caldav
   fly certs check caldav.33producciones.es --app radio-spins-caldav   # esperar a «Ready»
   ```
3. Repetir las comprobaciones del paso 4 contra `https://caldav.33producciones.es/caldav/`.

## Paso 6 · Que la guía de la app diga el servidor bueno

La guía (`/caldav/guia`, el botón de la pestaña Agenda del artista) la sirve **Render**. En Render →
Environment añadir:

```
CALDAV_PUBLIC_HOST = caldav.33producciones.es
```

(o `radio-spins-caldav.fly.dev` mientras no haya dominio). Redespliega solo. Sin la variable, la guía
enseña el dominio de Render, que **no** sirve CalDAV.

---

## Lo que salió mal la primera vez (para no repetirlo)

- **512 MB no bastan**: el worker de gunicorn moría por falta de memoria (OOM) **en bucle** al
  importar `app.py` (158k líneas) y el host nunca respondía. Dos arreglos: la máquina pasa a **1 GB**
  (`fly scale memory 1024`, y `memory = '1gb'` en `fly.toml`, que es lo que manda en cada deploy) y
  `Dockerfile.caldav` **precompila el bytecode** al construir la imagen (`python -m compileall`):
  compilar 158k líneas en cada arranque era lo que disparaba el pico (y tardaba ~90 s en una CPU
  compartida). Se quitó `PYTHONDONTWRITEBYTECODE`, que impedía guardar el `.pyc`.
- **El health check redirigía al login**: `caldav_health` no estaba en las listas de páginas
  públicas, `require_login` lo mandaba a `/login` (302) y el login en este host es un 404. Fly daba
  la máquina por enferma y **su proxy no le pasaba tráfico** (el iPhone veía la conexión cortada
  aunque la app estuviera arrancada). Ahora `_caldav_only_gate` responde el health él mismo.
- `fly scale memory` **no admite `--yes`**, y puede terminar con «failed to get VM … unauthorized»
  al esperar los checks: la orden **sí** se aplica (comprobar con `fly machine list`).
- Las pruebas de humo con `curl` a un host caído dan `000` o «HTTP/2 stream … reset»: eso es el proxy
  de Fly sin máquina sana detrás, no un error de la app. Mirar `fly logs` y `fly checks list`.

## Actualizaciones

Cada cambio de código exige **dos** despliegues: Render (solo, con el push) y este host, a mano:

```bash
fly deploy --app radio-spins-caldav --ha=false --wait-timeout 5m
```

Se puede automatizar con una GitHub Action (`superfly/flyctl-actions/setup-flyctl` + `flyctl deploy
--remote-only`, con un token de `fly tokens create deploy` en los secretos del repo); mientras no
esté, acordarse del `fly deploy` después de cada push que toque `app.py`.

## Si algo falla

- `fly logs --app radio-spins-caldav --no-tail` — cada petición CalDAV deja una línea `CALDAV <método>
  <ruta> …`, y los errores de arranque (BD, OOM) salen ahí.
- `fly checks list --app radio-spins-caldav` — si el check está `critical`, el proxy no enruta.
- `fly ssh console --app radio-spins-caldav -C "sh -c 'ps -o pid,rss,args -A; free -m'"` — procesos y
  memoria dentro de la máquina.
- Verifica en el iPhone pero no aparecen calendarios → esa persona no tiene artistas asignados (rol
  distinto de 10 y sin `assigned_artist_ids`). Asígnaselos en el back office.
- Alguien ve los eventos **dos veces** → tiene además la suscripción `.ics` antigua: que la quite.
