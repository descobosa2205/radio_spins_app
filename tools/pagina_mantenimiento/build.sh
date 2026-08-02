#!/usr/bin/env bash
# Publica la MISMA página de mantenimiento de la app como sitio estático independiente.
#
# Para qué: cuando Render está parado (mantenimiento programado, servicio suspendido, un despliegue
# cancelado), la app no puede servir nada — está apagada. Render sirve entonces la URL que le digas
# en Settings → Maintenance Mode, y esa URL NO puede ser del propio servicio. Por eso hace falta un
# sitio aparte.
#
# Cómo se usa (una sola vez, en el panel de Render):
#   1) New → Static Site, apuntando a este mismo repositorio.
#   2) Build Command:      bash tools/pagina_mantenimiento/build.sh
#      Publish Directory:  tools/pagina_mantenimiento/_site
#   3) En el servicio web: Settings → Maintenance Mode → pegar la URL del sitio estático.
#
# Se COPIA el fichero, no se duplica: la página es la misma que ve la gente cuando la app da un
# error, así que no hay dos diseños que mantener.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
destino="$raiz/tools/pagina_mantenimiento/_site"
mkdir -p "$destino"
cp "$raiz/static/maintenance.html" "$destino/index.html"
# Mismo contenido para cualquier ruta que pida el visitante.
cp "$destino/index.html" "$destino/404.html"
echo "Página de mantenimiento publicada en $destino ($(wc -c < "$destino/index.html") bytes)"
