/* ══════════════════════════════════════════════════════════════════════════════════════════════
   VER UNA NOTA DE PRENSA (la página pública y la vista de dentro).
   · El lienzo está diseñado a 600 de ancho: se ESCALA con `transform` al ancho del contenedor, así
     las proporciones del fondo y el sitio de cada texto son exactamente los del diseño, también en
     el móvil (y el alto del contenedor se ajusta al escalado).
   · Los botones «Escuchar» reproducen EN LÍNEA (un <audio> debajo del módulo) en vez de abrir el
     archivo en otra pestaña; en el correo son enlaces normales.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function escala() {
    document.querySelectorAll('[data-pr-view]').forEach(function (box) {
      var canvas = box.querySelector('[data-pr-canvas]');
      if (!canvas) return;
      var W = parseFloat(canvas.style.width) || 600;
      var H = parseFloat(canvas.style.height) || canvas.offsetHeight;
      var k = Math.min(1, (box.clientWidth || W) / W);
      canvas.style.transform = 'scale(' + k + ')';
      box.style.height = Math.round(H * k) + 'px';
    });
  }
  window.addEventListener('resize', escala);
  document.addEventListener('DOMContentLoaded', escala);
  if (document.readyState !== 'loading') escala();

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     EL VÍDEO DE YOUTUBE · EL POP-UP
     En el CORREO la miniatura es un enlace normal (ahí no se puede hacer otra cosa) y lleva a la
     página del vídeo. Pero cuando la nota se está viendo EN LA APP o en la página pública, el
     vídeo se abre **encima, sin salir de donde estás**: eso es el pop-up.
     ⚠️ El `<iframe>` se crea AL ABRIRLO y se destruye al cerrar: si se dejara puesto, el vídeo
     seguiría sonando por debajo.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  /* ⚠️⚠️ EL POP-UP SE PINTA CON ESTILOS EN LÍNEA, NO CON UNA CLASE DEL CSS DE LA APP: la página
     pública de una nota (y la de una invitación) es una página SUELTA que **no carga
     `styles.css`** —lo comprobé en el navegador: la capa salía sin posicionar, como un trozo suelto
     al final de la página—. Poniéndolos aquí, el pop-up es el mismo en la app, en la página pública
     y en cualquier sitio donde se pinte un módulo de vídeo: un solo sitio que mantener.
     ⚠️ El tamaño se calcula (nada de `aspect-ratio`): lo más grande que cabe manteniendo el 16:9. */
  var capa = null;
  function mideVideo() {
    if (!capa) return;
    var caja = capa.firstChild;
    var w = Math.min(window.innerWidth * 0.96, (window.innerHeight - 96) * 16 / 9);
    caja.style.width = Math.round(w) + 'px';
    caja.style.height = Math.round(w * 9 / 16) + 'px';
  }
  function cierraVideo() {
    if (!capa) return;
    capa.remove(); capa = null;
    document.removeEventListener('keydown', escVideo);
    window.removeEventListener('resize', mideVideo);
  }
  function escVideo(ev) { if (ev.key === 'Escape') cierraVideo(); }
  function abreVideo(vid) {
    cierraVideo();
    capa = document.createElement('div');
    capa.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2000;' +
      'background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;');
    var caja = document.createElement('div');
    caja.setAttribute('style', 'position:relative;max-width:96vw;');
    caja.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="Vídeo" ' +
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ' +
      'referrerpolicy="strict-origin-when-cross-origin" ' +
      'style="width:100%;height:100%;border:0;display:block;background:#000;border-radius:10px;"></iframe>';
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar');
    // ⚠️ La «×» va como TEXTO, no como icono de Font Awesome: la página pública tampoco carga esa
    // fuente y el botón habría salido vacío (la trampa de siempre con los iconos).
    x.textContent = '\u00d7';
    x.setAttribute('style', 'position:absolute;top:-2.6rem;right:0;width:2.2rem;height:2.2rem;border:0;' +
      'border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:1.4rem;line-height:1;' +
      'cursor:pointer;display:flex;align-items:center;justify-content:center;');
    caja.appendChild(x);
    capa.appendChild(caja);
    document.body.appendChild(capa);
    mideVideo();
    window.addEventListener('resize', mideVideo);
    // Se cierra pinchando fuera del vídeo, en la «×» o con Escape.
    capa.addEventListener('click', function (ev) {
      if (ev.target === capa || ev.target === x) cierraVideo();
    });
    document.addEventListener('keydown', escVideo);
  }
  document.addEventListener('click', function (ev) {
    var yt = ev.target.closest('a.pr-yt[data-yt]');
    if (yt && yt.getAttribute('data-yt')) {
      ev.preventDefault();
      abreVideo(yt.getAttribute('data-yt'));
      return;
    }
  });

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('a.pr-listen');
    if (!a || !a.closest('[data-pr-view]')) return;
    ev.preventDefault();
    var host = a.closest('td') || a.parentNode;
    var audio = host.querySelector('audio.pr-audio-inline');
    if (!audio) {
      audio = document.createElement('audio');
      audio.className = 'pr-audio-inline';
      audio.controls = true;
      audio.preload = 'none';
      audio.src = a.getAttribute('href');
      host.appendChild(audio);
    }
    document.querySelectorAll('audio.pr-audio-inline').forEach(function (o) { if (o !== audio) o.pause(); });
    if (audio.paused) audio.play().catch(function () {}); else audio.pause();
  });
})();
