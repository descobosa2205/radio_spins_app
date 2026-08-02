# Página de «estamos trabajando» cuando Render está parado

## El problema
La app ya enseña la página de *modo trabajo* en tres casos, y en los tres **la sirve ella misma**:

- **Modo trabajo a mano** (Dirección → botón): todo el mundo menos dirección la ve.
- **Un error de servidor** (500): el `errorhandler` la devuelve en vez de una pantalla rota.
- **Mientras se aplica una actualización**: desde ago-2026, `/healthz` responde 503 mientras corren
  las migraciones, así que Render **mantiene el tráfico en la instancia vieja** y un despliegue
  normal ni se nota.

Lo que ninguno de esos cubre es que **Render esté parado**: si el servicio está apagado, suspendido
o un despliegue se cancela, la app no puede servir nada. Render enseña entonces su propia página de
error, que parece una avería.

## La solución
Render tiene *Maintenance Mode*: responde 503 con **la página que tú le digas**, y esa URL **no
puede ser del propio servicio** — tiene que estar fuera. Por eso este sitio estático.

## Cómo se monta (una sola vez)
1. En Render: **New → Static Site**, apuntando a este repositorio.
   - **Build Command:** `bash tools/pagina_mantenimiento/build.sh`
   - **Publish Directory:** `tools/pagina_mantenimiento/_site`
2. En el servicio web: **Settings → Maintenance Mode → Custom maintenance page URL**, y se pega la
   URL del sitio estático.

A partir de ahí, al activar el modo mantenimiento en Render (o al parar el servicio) la gente ve la
misma página de siempre en vez de un error.

## Por qué se copia el fichero y no hay dos
El build **copia `static/maintenance.html`**, que es la misma página que ve la gente cuando la app
da un error. Así no hay dos diseños que mantener: se toca uno y cambian los dos.
