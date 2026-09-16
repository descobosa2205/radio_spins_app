# Instrucciones (los manuales de la app)

## Qué hay aquí

La sección **Instrucciones** (`/instrucciones`, sep 2026, la pidió Dani: «una sección donde vayamos
subiendo manuales de las distintas funcionalidades por si se tienen dudas»): los manuales de cada
área de la web, subidos por dirección, y las guías que genera la propia app. Cómo se sube, quién
puede, cómo se ve y se descarga, y las trampas.

## Cómo está hecho

- **Modelo `AppManual`** (`app_manuals`, `ensure_manuals_schema`): título · descripción · `category`
  (una clave de `MANUAL_CATEGORIES`, las áreas de la app) · `file_url`/`file_name`/`file_kind` (el
  fichero en Storage, carpeta `manuales/`) · `link_url` (un manual puede ser **solo un enlace**: un
  vídeo, un documento compartido) · `sort_order` · quién lo subió.
- **Las guías que GENERA la app no se suben**: `MANUAL_BUILTINS` las lista al vuelo con sus
  endpoints (`pdf` y `html`) —hoy la del **calendario en el móvil** (`public_caldav_guide_pdf` /
  `public_caldav_guide`)—, con la etiqueta «Generada por la app» y sin tres puntitos. Así están
  siempre al día. Una guía nueva que genere la app se añade ahí, no como fichero.
- **Quién ve y quién sube** (⚠️ NO es un recurso de Accesos): leer es AYUDA para **cualquiera con
  sesión**; subir, editar y borrar es de **dirección** (`_manual_can_edit` → `is_master()`). Los seis
  endpoints van en `_access_exempt_endpoints()` como «de dirección por naturaleza» (el gate ya deja
  pasar un GET sin recurso a cualquier sesión y un POST sin recurso solo a dirección; la lista solo
  evita que el catálogo los invente como «Función nueva sin clasificar»). En el menú entra como
  «Mis gastos»: se añade en `_build_nav_menu` para toda sesión (icono `instrucciones` en
  `SECTION_ICONS`) y también en el menú personal de `layout.html`.
- **Pantalla** (`templates/instrucciones.html`): agrupada por área con su icono, una tarjeta por
  manual (icono según el tipo, título, descripción, fichero y fecha) y sus botones: **Ver** (el
  visor de la casa, `media_viewer.js`: `data-viewer-src` · `data-viewer-kind` · `data-viewer-name` ·
  `data-viewer-download` · `data-viewer-set="manuales"`), **Descargar** (`data-dl-bar`) y, en un
  enlace, **Abrir**. Dirección tiene «Subir manual» y los tres puntitos (Editar · Eliminar).
  · Los campos son UNA macro (`campos`) que usan el pop-up de crear y el de editar. **Un pop-up de
  editar por manual**, así que TODOS los ids llevan el sufijo `uid` (el id sin guiones): con ids
  repetidos `getElementById` y los `<label for>` cogerían el primero (regla de la casa).
  · La zona de arrastrar es la global (`data-file-drop-for`, `file_drop.js` dispara `change` al
  soltar) y el nombre del archivo se pinta por delegación en `document`.
  · El formulario de crear lleva `data-autosave="manual_create"`: un rechazo del servidor
  (`_flash_form_error` con `abrir="manualCreateModal"`) reabre el pop-up con lo escrito y los campos
  marcados. El de editar reabre `manualEdit<uid>`.
  · **Eliminar** es un `<form>` dentro del menú con `data-confirm` (lo pregunta el motor de
  `ajax_inline.js` para formularios normales).
- **Ver y descargar van por NUESTRO dominio** (`manual_file` · `manual_download` →
  `_manual_serve`, con `_download_remote_content` y `_safe_download_filename`): un PDF se ve en el
  visor con la misma procedencia y **se descarga con su nombre** (el `download` de un `<a>` se
  ignora en otro dominio). ⚠️ Un **vídeo o una imagen** que solo se quieren VER se redirigen al
  almacenamiento (soporta `Range` y caché; servirlos enteros desde el worker sería lento). Para
  descargarlos sí pasan por aquí.
- **Qué se admite** (`MANUAL_FILE_EXTS`): PDF, Word, PowerPoint, Excel, imágenes, vídeo (mp4/mov/
  m4v), txt/md y zip; `upload_file(..., allowed_extensions=...)` lo vuelve a comprobar. El tipo
  (`file_kind` PDF · VIDEO · IMAGE · FILE · LINK) y el icono salen de la extensión.
- **Al reemplazar o borrar** se quita el fichero anterior de Storage (`delete_object_by_url`,
  best-effort: que no se pueda borrar no impide quitar el manual).
- Probado con la app real (`test_manuales.py`, scratchpad de la sesión): la ven dirección y un
  usuario sin permisos (que no ve subir ni editar y se come 403 al intentarlo), sin archivo ni enlace
  no se guarda y el rechazo reabre el pop-up, el PDF entra con su área y su nombre, un enlace entra
  como LINK con `https`, un `.exe` se rechaza, ver es inline y descargar es `attachment` con su
  nombre, editar sin tocar el archivo lo conserva, y borrar borra.

## Dónde están las guías del calendario

La guía de la oficina del calendario en el móvil (`/caldav/guia`, «Descargar en PDF») y el PDF con
las claves de cada artista (al crearle su cuenta desde su ficha → Agenda) siguen donde estaban; la
primera sale además aquí como guía generada por la app, y la guía enlaza a Instrucciones.
