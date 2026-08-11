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
    media.addEventListener('ended', function () { pinta(chip, false); actual = null; });
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

  function init(root) {
    (root || document).querySelectorAll('[data-chip-src]').forEach(prepara);
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });
  // Zonas que se repintan por AJAX (ajax_inline) o pestañas que se muestran después.
  document.addEventListener('inline:updated', function (ev) { init(ev.target || document); });
  window.initMediaChips = init;
})();
