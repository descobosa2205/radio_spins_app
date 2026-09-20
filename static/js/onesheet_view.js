/* ONE SHEET · la página pública: la caja de luz de las fotos y los vídeos (no se sale de la página),
   «Leer más» en la biografía y la caja de compartir. Sin dependencias: la página es standalone.
   ⚠️ Los estilos de la caja de luz viven en onesheet.css (la página sí lo carga). */
(function () {
  'use strict';
  var page = document.querySelector('[data-os-page]');
  if (!page || page.classList.contains('os-page--edit')) return;

  /* ---------- caja de luz ---------- */
  var lb = document.createElement('div');
  lb.className = 'os-lb';
  lb.hidden = true;
  lb.innerHTML = '<button type="button" class="os-lb__x" data-lb-close aria-label="Cerrar">×</button>' +
    '<button type="button" class="os-lb__nav os-lb__nav--prev" data-lb-prev aria-label="Anterior">‹</button>' +
    '<button type="button" class="os-lb__nav os-lb__nav--next" data-lb-next aria-label="Siguiente">›</button>' +
    '<div class="os-lb__body" data-lb-body></div>';
  document.body.appendChild(lb);
  var body = lb.querySelector('[data-lb-body]');
  var galeria = [], idx = 0;

  function fotosDe(mod) {
    return Array.prototype.slice.call(mod.querySelectorAll('[data-os-lightbox]')).map(function (a) {
      return { src: a.getAttribute('href'), cap: a.getAttribute('data-os-title') || '' };
    });
  }
  function pinta() {
    var it = galeria[idx]; if (!it) return;
    body.innerHTML = '<img src="' + it.src.replace(/"/g, '&quot;') + '" alt="">' + (it.cap ? '<div class="os-lb__cap">' + esc(it.cap) + '</div>' : '');
    lb.querySelector('[data-lb-prev]').style.display = galeria.length > 1 ? '' : 'none';
    lb.querySelector('[data-lb-next]').style.display = galeria.length > 1 ? '' : 'none';
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function abre() { lb.hidden = false; document.body.style.overflow = 'hidden'; }
  function cierra() { lb.hidden = true; body.innerHTML = ''; document.body.style.overflow = ''; }
  function video(embed, titulo) {
    galeria = []; idx = 0;
    body.innerHTML = '<iframe src="' + embed.replace(/"/g, '&quot;') + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="' + esc(titulo || 'Vídeo') + '"></iframe>' +
      (titulo ? '<div class="os-lb__cap">' + esc(titulo) + '</div>' : '');
    lb.querySelector('[data-lb-prev]').style.display = 'none';
    lb.querySelector('[data-lb-next]').style.display = 'none';
    abre();
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-os-lightbox]');
    if (a) {
      ev.preventDefault();
      var mod = a.closest('.os-mod') || page;
      galeria = fotosDe(mod);
      idx = Math.max(0, galeria.findIndex(function (x) { return x.src === a.getAttribute('href'); }));
      pinta(); abre();
      return;
    }
    var v = ev.target.closest('[data-os-video]');
    if (v) { ev.preventDefault(); video(v.getAttribute('data-os-video'), v.getAttribute('data-os-title')); return; }
    if (ev.target.closest('[data-lb-close]') || ev.target === lb) { cierra(); return; }
    if (ev.target.closest('[data-lb-prev]')) { idx = (idx - 1 + galeria.length) % galeria.length; pinta(); return; }
    if (ev.target.closest('[data-lb-next]')) { idx = (idx + 1) % galeria.length; pinta(); return; }
    var more = ev.target.closest('[data-os-more]');
    if (more) {
      var rich = more.previousElementSibling;
      var abierto = rich.classList.toggle('is-open');
      more.classList.toggle('is-open', abierto);
      more.querySelector('span').textContent = abierto ? 'Leer menos' : 'Leer más';
      return;
    }
    if (ev.target.closest('[data-os-share]')) { var box = document.querySelector('[data-os-share-box]'); if (box) box.hidden = false; return; }
    if (ev.target.closest('[data-os-share-close]') || ev.target.matches('[data-os-share-box]')) { var box2 = document.querySelector('[data-os-share-box]'); if (box2) box2.hidden = true; return; }
    var cp = ev.target.closest('[data-os-copy]');
    if (cp) {
      var inp = document.querySelector('[data-os-share-url]');
      var texto = inp ? inp.value : location.href;
      var hecho = function () { cp.innerHTML = '<i class="fa-solid fa-check"></i> Copiado'; setTimeout(function () { cp.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(hecho, function () { if (inp) { inp.select(); try { document.execCommand('copy'); } catch (e) {} } hecho(); });
      else { if (inp) { inp.select(); try { document.execCommand('copy'); } catch (e) {} } hecho(); }
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (lb.hidden) return;
    if (ev.key === 'Escape') cierra();
    if (ev.key === 'ArrowLeft' && galeria.length > 1) { idx = (idx - 1 + galeria.length) % galeria.length; pinta(); }
    if (ev.key === 'ArrowRight' && galeria.length > 1) { idx = (idx + 1) % galeria.length; pinta(); }
  });

  /* «Leer más» solo si el texto de verdad se corta: si cabe, el botón no hace falta. */
  document.querySelectorAll('.os-rich--more').forEach(function (rich) {
    var btn = rich.nextElementSibling;
    if (btn && btn.matches('[data-os-more]') && rich.scrollHeight <= rich.clientHeight + 4) { rich.classList.remove('os-rich--more'); btn.remove(); }
  });

  /* Compartir con la hoja nativa del móvil si la hay. */
  var shareBtn = document.querySelector('[data-os-share]');
  if (shareBtn && navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    shareBtn.addEventListener('click', function (ev) {
      ev.stopImmediatePropagation();
      var inp = document.querySelector('[data-os-share-url]');
      navigator.share({ title: document.title, url: inp ? inp.value : location.href }).catch(function () {});
    }, true);
  }
})();
