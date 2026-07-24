/* Miniatura de vídeo GLOBAL: los <video class="video-thumb"> muestran un fotograma INTERMEDIO
   (no el primero, que a menudo sale en negro). Al cargar los metadatos se hace un seek a ~25% de la
   duración (tope 5 s, mínimo ~1,5 s) y se pausa; el elemento pinta ese fotograma como "póster".
   Funciona con contenido dinámico (galería que se re-renderiza) vía MutationObserver. */
(function () {
  'use strict';
  function seekThumb(v) {
    if (v.__thumbSeek) return; v.__thumbSeek = true;
    function doSeek() {
      var d = v.duration, t = 1.5;
      if (isFinite(d) && d > 0) t = Math.min(d * 0.25, 5);
      if (!isFinite(t) || t <= 0) t = 1.5;
      try { v.currentTime = t; } catch (e) {}
    }
    // Solo queremos el fotograma: al terminar el seek, pausar y marcar el vídeo como LISTO (en las
    // portadas el CSS lo revela solo entonces; si el seek nunca ocurre —iOS con preload degradado—
    // se queda oculto y se ve el icono de película de respaldo, no un rectángulo negro).
    v.addEventListener('seeked', function () { try { v.pause(); } catch (e) {} v.classList.add('is-ready'); }, { once: true });
    if (v.readyState >= 1 && isFinite(v.duration) && v.duration > 0) doSeek();
    else v.addEventListener('loadedmetadata', doSeek, { once: true });
  }
  function isThumb(n) { return n.nodeType === 1 && n.tagName === 'VIDEO' && n.classList && n.classList.contains('video-thumb'); }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('video.video-thumb').forEach(seekThumb);
  }
  function start() {
    scan(document);
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes || [], function (n) {
          if (isThumb(n)) seekThumb(n); else scan(n);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();
