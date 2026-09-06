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
