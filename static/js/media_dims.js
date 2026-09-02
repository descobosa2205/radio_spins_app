/* =========================================================================
   MEDIR UN ARCHIVO ANTES DE SUBIRLO (ancho × alto), en un solo sitio.

   ⚠️⚠️ Por qué hace falta: de las medidas sale la PROPORCIÓN con la que se
   dibuja la miniatura de un cartel. Sin ellas, un vídeo VERTICAL se pintaba
   APAISADO (el marco cae a 16:9 cuando no se sabe nada) — y el subidor de la
   ficha no las medía, así que a los vídeos subidos desde dentro les pasaba
   siempre. Con esto se mandan en `widths`/`heights`, que el servidor ya lee.

   `window.app33Dims.file(f)`  → Promise {w, h} ('' si no se puede medir)
   `window.app33Dims.all(fs)`  → Promise [{w, h}, …] EN EL MISMO ORDEN

   Vale para imágenes (`<img>`) y para vídeos (`<video>`); de un PDF, un audio
   o un paquete no hay medidas que sacar y se devuelve vacío (no se inventa
   nada). Nunca se queda colgado: si el navegador no responde, se rinde sola.
   ========================================================================= */
(function () {
  'use strict';
  if (window.app33Dims) return;

  var TOPE_MS = 6000;

  function medir(file) {
    return new Promise(function (resolve) {
      var vacio = { w: '', h: '' };
      if (!file) { resolve(vacio); return; }
      var tipo = (file.type || '').toLowerCase();
      var nombre = (file.name || '').toLowerCase();
      var esVideo = /^video\//.test(tipo) || /\.(mp4|mov|webm|m4v|avi|mkv|mpe?g)$/.test(nombre);
      var esImagen = /^image\//.test(tipo) || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/.test(nombre);
      if (!esVideo && !esImagen) { resolve(vacio); return; }

      var url = '', el = null, hecho = false;
      function fin(w, h) {
        if (hecho) return;
        hecho = true;
        try { if (url) URL.revokeObjectURL(url); } catch (e) {}
        try { if (el) { el.removeAttribute('src'); el.load && el.load(); } } catch (e) {}
        resolve({ w: w || '', h: h || '' });
      }
      setTimeout(function () { fin('', ''); }, TOPE_MS);
      try { url = URL.createObjectURL(file); } catch (e) { fin('', ''); return; }

      if (esVideo) {
        el = document.createElement('video');
        el.preload = 'metadata';
        el.muted = true;
        el.onloadedmetadata = function () { fin(el.videoWidth, el.videoHeight); };
        el.onerror = function () { fin('', ''); };
        el.src = url;
        return;
      }
      el = new Image();
      el.onload = function () { fin(el.naturalWidth, el.naturalHeight); };
      el.onerror = function () { fin('', ''); };
      el.src = url;
    });
  }

  function todos(files) {
    var lista = Array.prototype.slice.call(files || []);
    return Promise.all(lista.map(medir));
  }

  window.app33Dims = { file: medir, all: todos };
})();
