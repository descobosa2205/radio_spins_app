# Registros · AGEDI y SGAE

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- REGISTROS · qué conciertos se declaran y cada cuánto
- REGISTROS · material para presentar y declaración firmada
- Aviso al AUTOR de que su obra está registrada en SGAE: al marcar el registro desde

---

- **REGISTROS · qué conciertos se declaran y cada cuánto** (ago 2026):
  · **Solo de artistas con CONTRATO DISCOGRÁFICO**: `_artist_has_record_deal` (compromiso de
  `ArtistContractCommitment` con concepto discográfico, vía `_pick_artist_commitment`, cacheado en
  `g`); de los demás artistas no declaramos nosotros y no se listan.
  · **Se declara por TRIMESTRES** (antes por semestres): `_quarter_of` / `_quarter_key` /
  `_quarter_label` («T3 2026 (Jul-Sep)»). Cada fila de conciertos y de promociones cantadas trae su
  `quarter_key`/`quarter_label` y la pantalla las agrupa por ahí.
  · El **título** de la tarjeta (canción, álbum, concierto o promoción) lleva a su ficha: ya
  enlazaba, pero no lo parecía — ahora se marca como enlace (`.registros-card__title`).

- **REGISTROS · material para presentar y declaración firmada** (ago 2026):
  · Botón de **icono** en Pendientes AGEDI y en Pendiente SGAE → `registros_song_pack`
  (`/registros/canciones/<id>/material?kind=AGEDI|SGAE`): un ZIP con la carpeta
  **`AGEDI_<Artista>_<Canción>`** / **`SGAE_<Artista>_<Canción>`** dentro. AGEDI: master en **MP3** +
  portada en **JPG** + PDF del **LC**. SGAE: lo mismo pero con el **LC de reparto editorial** y además
  la **letra** en su formato de editorial (sin logo). Lo que no se pueda incluir NO se calla: va un
  **`LEEME - falta material.txt`** diciendo qué falta.
  · La portada se pasa a JPG con `_registros_pack_cover_jpeg` (hasta 2000 px y calidad 85: buena para
  registrar sin que pese de más). ⚠️ **pydub busca `ffmpeg` en el PATH y en el servidor no está**:
  `_convert_audio_content_to_mp3` le apunta al binario estático de **imageio-ffmpeg** (`_ffmpeg_exe`,
  el mismo del póster de los vídeos); sin eso la exportación a MP3 falla en Render.
  · **Declaración de obra FIRMADA**: botón de icono en Pendiente SGAE (`registros_song_declaration_signed`)
  que la sube a la misma «Declaración de obra» de la ficha y marca `Song.work_declaration_signed`. El
  modal admite **arrastrar el PDF o elegirlo** (zona `.decl-drop` + `data-file-drop-for`, que resuelve
  el `file_drop.js` global; al soltarlo se enseña el nombre del archivo).
  **Sin ella no se puede marcar el registro en SGAE de una obra publicada desde
  `SGAE_SIGNED_DECLARATION_FROM` (04-ago-2026) en adelante** (`_song_sgae_declaration_missing`, aplicado
  en los TRES caminos: `discografica_song_sgae_register`, `_notify` y `discografica_song_status_toggle`);
  a las anteriores se les pide igual pero no bloquea, y eso no se anuncia en ninguna pantalla.
  · ⚠️ Los endpoints nuevos hay que añadirlos a los DOS mapeos de `registros_*`
  (`_coarse_endpoint_resource` y `_resolve_request_resource_key`); las URLs de la pestaña SGAE llevan
  `tab=sgae` para que el permiso se resuelva contra la pestaña en la que se está.
- **Aviso al AUTOR de que su obra está registrada en SGAE** (ago 2026): al marcar el registro desde
  `/registros` se hace por **JSON** (`discografica_song_sgae_register`) y sale un **pop-up**
  (`#sgaeNotifyModal`) que ofrece notificar al autor con sus correos ya marcados
  (`_song_sgae_platform_author_delivery`); decir que no **no deshace nada** (la obra se queda
  registrada). El correo (`_build_song_sgae_notification_email` → `discografica_song_sgae_notify`) lleva
  el logo de la editorial arriba a la **derecha**, **«Registro de Obra» centrado**, el aviso de que SGAE
  tarda en reflejarlo, la **viñeta de la canción** (portada, título, intérpretes y fecha de publicación)
  y la tabla del **REPARTO AUTORAL** — solo entre los autores (Autor · Rol · %): el reparto con
  Plataforma Musical **no sale nunca** en este correo.
