/* ETIQUETA de archivo de audio/vídeo: icono del tipo + play + duración.
 *
 * Sustituye al reproductor <audio controls> de los materiales de canción: ahí el nombre del archivo
 * no aporta nada (el módulo ya dice qué es: «Master 48 bits», «Instrumental»…), así que la etiqueta
 * lleva solo lo que importa — de qué tipo es, un play y cuánto dura.
 *
 * La DURACIÓN la da el propio navegador (`preload="metadata"`: una lectura por rango del principio
 * del archivo, no se descarga entero). Si no se puede leer, la etiqueta simplemente no la enseña:
 * mejor eso que inventarla o que costar una llamada a ffmpeg por archivo en cada carga de página.
 *
 * SOLO SUENA UNO A LA VEZ: al dar al play en otra etiqueta, la que estaba sonando se para.
 *
 * ⚠️ Y AL TERMINAR UNO, SIGUE EL SIGUIENTE (sep 2026): varias maquetas sueltas en la misma pantalla
 * (las del proyecto en la ficha de una canción o de un disco) son, para quien las escucha, una LISTA,
 * aunque cada una sea su propia etiqueta; antes al acabar una se quedaba todo en silencio. Se
 * encadena con la siguiente etiqueta DEL MISMO GRUPO (`[data-chip-group]` o, si no hay, la sección
 * o tarjeta en la que están), igual que hace `playlist.js` con las líneas de una playlist.
 */
(function () {
  'use strict';

  var actual = null;   // el <audio>/<video> que está sonando

  function fmt(seg) {
    if (!isFinite(seg) || seg <= 0) return '';
    var s = Math.round(seg);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
  }

  function pinta(chip, sonando) {
    var i = chip.querySelector('[data-chip-icon]');
    if (i) i.className = 'fa ' + (sonando ? 'fa-pause' : 'fa-play');
    chip.classList.toggle('is-playing', !!sonando);
  }

  function prepara(chip) {
    if (chip.dataset.chipReady === '1') return;
    chip.dataset.chipReady = '1';

    var src = chip.dataset.chipSrc || '';
    var media = document.createElement('audio');
    media.preload = 'metadata';
    media.src = src;
    chip.appendChild(media);

    var dur = chip.querySelector('[data-chip-dur]');
    media.addEventListener('loadedmetadata', function () {
      if (dur) dur.textContent = fmt(media.duration);
    });
    media.addEventListener('ended', function () {
      pinta(chip, false); actual = null;
      // La SIGUIENTE etiqueta del grupo, si la hay: se arranca desde aquí mismo (dentro del
      // evento `ended`, que es lo que el navegador admite sin otro clic).
      var sig = siguiente(chip);
      if (sig) sig.click();
    });
    media.addEventListener('pause', function () { pinta(chip, false); });
    media.addEventListener('play', function () { pinta(chip, true); });

    chip.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (!media.paused) { media.pause(); return; }
      if (actual && actual !== media) { try { actual.pause(); } catch (e) {} }
      actual = media;
      media.play().catch(function () {
        // Sin permiso de reproducción o archivo ilegible: se abre en una pestaña, que siempre vale.
        if (src) window.open(src, '_blank', 'noopener');
        pinta(chip, false);
      });
    });
  }

  /* La etiqueta que va DETRÁS de `chip` en su grupo (en orden de documento), o null. */
  function siguiente(chip) {
    var grupo = chip.closest('[data-chip-group], .ficha-section, .card, .modal, main') || document;
    var todas = Array.prototype.slice.call(grupo.querySelectorAll('[data-chip-src]'))
      .filter(function (c) { return !!(c.dataset.chipSrc || '').trim(); });
    var i = todas.indexOf(chip);
    return (i >= 0 && i + 1 < todas.length) ? todas[i + 1] : null;
  }

  function init(root) {
    (root || document).querySelectorAll('[data-chip-src]').forEach(prepara);
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });
  // Zonas que se repintan por AJAX (ajax_inline) o pestañas que se muestran después.
  document.addEventListener('inline:updated', function (ev) { init(ev.target || document); });
  window.initMediaChips = init;
})();
