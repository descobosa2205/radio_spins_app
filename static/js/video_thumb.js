/* Miniatura de vídeo GLOBAL: los <video class="video-thumb"> muestran un fotograma QUE SE VEA
   (nunca el primero, que casi siempre sale en NEGRO por el fundido de entrada).

   Al cargar los metadatos se salta a ~25% de la duración y, si ese fotograma está oscuro, se PRUEBA
   MÁS ADELANTE (50%, 12%, 70%): el brillo se mide dibujando el fotograma en un lienzo pequeño.
   ⚠️ Un vídeo de OTRO dominio (Storage) «mancha» el lienzo y medirlo lanza excepción: en ese caso se
   acepta el primer fotograma (comportamiento de siempre), que es mejor que no enseñar nada.
   Es el MISMO criterio que usa el servidor al sacar la miniatura con ffmpeg
   (`_video_generate_poster_bytes`): si se cambia uno, se cambia el otro.
   Funciona con contenido dinámico (galerías que se re-renderizan) vía MutationObserver. */
(function () {
  'use strict';

  var MIN_BRILLO = 22;          // por debajo de esto, el fotograma es «negro» y no vale
  var FRACCIONES = [0.25, 0.5, 0.12, 0.7];

  /* Brillo medio (0-255) del fotograma que se está viendo. null si no se puede medir. */
  function brillo(v) {
    try {
      var c = document.createElement('canvas');
      c.width = 24; c.height = 24;
      var ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, 24, 24);
      var d = ctx.getImageData(0, 0, 24, 24).data;   // ⚠️ lanza si el vídeo es de otro dominio
      var suma = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) {
        suma += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        n++;
      }
      return n ? (suma / n) : null;
    } catch (e) {
      return null;                                   // lienzo manchado: no se puede juzgar
    }
  }

  /* El TAMAÑO REAL del vídeo, en cuanto el navegador lo sabe. Quien lo necesite lo escucha:
     la página de cartelería corrige con él el marco de la miniatura, la silueta del formato y la
     etiqueta del tamaño —y lo guarda—, porque sin medidas el marco cae a 16:9 y un vídeo VERTICAL
     salía apaisado. El motor no sabe nada de esas pantallas: solo avisa (el mismo patrón que
     `agenda:external-drop`). */
  function avisaTamano(v) {
    var w = v.videoWidth || 0, h = v.videoHeight || 0;
    if (!w || !h || v.__thumbAvisado) return;
    v.__thumbAvisado = true;
    try {
      v.dispatchEvent(new CustomEvent('videothumb:size', {
        bubbles: true, detail: { width: w, height: h }
      }));
    } catch (e) { /* navegador sin CustomEvent: no pasa nada */ }
  }

  function seekThumb(v) {
    if (v.__thumbSeek) return; v.__thumbSeek = true;
    var intento = 0;
    if (v.readyState >= 1) avisaTamano(v);
    else v.addEventListener('loadedmetadata', function () { avisaTamano(v); }, { once: true });

    function listo() {
      try { v.pause(); } catch (e) {}
      v.classList.add('is-ready');
    }

    function momento() {
      var d = v.duration;
      var f = FRACCIONES[Math.min(intento, FRACCIONES.length - 1)];
      if (isFinite(d) && d > 0) return Math.min(Math.max(d * f, 0.05), Math.max(d - 0.05, 0.05));
      return [1.5, 3, 6, 0.5][Math.min(intento, 3)];
    }

    function saltar() {
      var t = momento();
      if (!isFinite(t) || t <= 0) t = 1.5;
      try { v.currentTime = t; } catch (e) { listo(); }
    }

    // Solo queremos el fotograma: al terminar el seek se mide y, si está oscuro, se prueba otro.
    v.addEventListener('seeked', function () {
      var luz = brillo(v);
      intento += 1;
      if (luz !== null && luz < MIN_BRILLO && intento < FRACCIONES.length) {
        saltar();
        return;
      }
      listo();
    });

    if (v.readyState >= 1 && isFinite(v.duration) && v.duration > 0) saltar();
    else v.addEventListener('loadedmetadata', saltar, { once: true });
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
