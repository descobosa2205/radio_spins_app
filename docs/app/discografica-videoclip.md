# Discográfica · videoclip

> Parte de la guía del proyecto. El índice y las reglas que valen para
> **cualquier** tarea están en `CLAUDE.md`; aquí está el detalle de esta área.
> Búsqueda rápida en todas las áreas: `grep -rn "lo que sea" docs/app/`

## Qué hay aquí

- AGEDI · el VIDEOCLIP se registra como subproducto del single
- VIDEOCLIP · «Sin videoclip» y datos del vídeo

---

- **AGEDI · el VIDEOCLIP se registra como subproducto del single** (ago 2026):
  `_song_isrcs_by_kind` (ISRC de AUDIO o de VIDEO por separado) y **`_song_videoclip_registration`**
  (cuáles faltan, si el single ya está). En Registros → Pendientes:
  · si falta todo, la canción sale como **«Canción»** con la etiqueta **«+ videoclip (subproducto)»**;
  · si el single YA está registrado y solo queda el vídeo, sale como **«Videoclip»** y su descarga es
  el pack **`AGEDI_VIDEO`**: el **Label Copy con los datos del vídeo**
  (`_build_song_label_copy_pdf_bytes(..., video=True)`: mismo título e intérpretes del single, pero
  con los ISRC de vídeo, sus fechas y el director) **+ el videoclip en MP4**.
  · Lo que no se pueda incluir NO se calla: `_registros_pack_finish` mete el `LEEME - falta
  material.txt` (mismo criterio que el pack de AGEDI/SGAE del single).
  · En la ficha, los datos del videoclip llevan su etiqueta **«Pendiente de registro»** / «Registrado
  en AGEDI», igual que el módulo de ISRC de Información.

- **VIDEOCLIP · «Sin videoclip» y datos del vídeo** (ago 2026):
  · **`Song.no_videoclip`**: la canción no va a tener vídeo. El módulo entero desaparece de
  Materiales y queda solo la etiqueta «Sin videoclip», que **es un botón**: al pincharla se deshace
  y vuelve a poder subirse (`discografica_song_videoclip_data`, `modo=sin_videoclip`).
  · **Maqueta del módulo**: a la IZQUIERDA el vídeo y sus subproductos (con miniatura), a la
  DERECHA los datos — **fecha de grabación**, **fecha de publicación** (con «la misma que el
  single», que la ata a `Song.release_date`), **director** (un TERCERO, con buscador Select2 con
  foto y `data-quick-create="promoter"` para crearlo al vuelo), los **ISRC de vídeo** y las
  **cesiones de derechos de imagen**.
  · Campos en `Song`: `videoclip_recorded_on` · `videoclip_release_date` · `videoclip_same_release`
  · `videoclip_director_promoter_id`. Las cesiones son materiales
  (`SongMaterial.category='VIDEO_RIGHTS'`), y se **acumulan** (una por persona que sale).
  · **ISRC separados**: `SongISRCCode.kind` ya distinguía AUDIO y VIDEO; ahora la ficha los reparte
  (`isrc_audio`/`isrc_video`) y se ven **por separado** en el módulo de ISRC de Información y
  **también** en el del videoclip — son los mismos datos mirados desde los dos sitios.

