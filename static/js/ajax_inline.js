/* Cambios de estado/datos puntuales SIN recargar la página.

   Marca un formulario con `data-inline` y di qué zona refrescar con `data-inline-target="#idZona"`
   (o deja que use el ancestro con `[data-inline-zone]`). La zona debe tener un `id`.

   El form se envía por fetch (el endpoint sigue igual: POST + redirect); se sigue el redirect, se
   coge del HTML resultante la zona con ese mismo id y se reemplaza en el sitio. Así el usuario no
   se mueve de donde está. Si algo falla, recarga normal (fallback seguro).
*/
(function () {
  'use strict';

  function reinit(scope) {
    try { if (window.initSelect2) window.initSelect2(); } catch (e) {}
    try {
      if (window.bootstrap && bootstrap.Tooltip && scope && scope.querySelectorAll) {
        scope.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) { bootstrap.Tooltip.getOrCreateInstance(el); });
      }
    } catch (e) {}
    // Avisar a otros scripts por si necesitan re-enganchar algo dentro de la zona nueva.
    try { document.dispatchEvent(new CustomEvent('inline:updated', { detail: { scope: scope } })); } catch (e) {}
  }

  function showFlashes(doc) {
    var alerts = doc.querySelectorAll('main .alert');
    if (!alerts.length) return;
    var host = document.querySelector('main');
    if (!host) return;
    // Quitar flashes previos y poner los nuevos arriba del main.
    host.querySelectorAll(':scope > .alert').forEach(function (a) { a.remove(); });
    Array.prototype.slice.call(alerts).reverse().forEach(function (a) {
      if (a.parentElement && a.parentElement.tagName === 'MAIN') host.insertBefore(a.cloneNode(true), host.firstChild);
    });
  }

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-inline]');
    if (!form) return;
    e.preventDefault();

    var targetSel = form.getAttribute('data-inline-target');
    var zone = targetSel ? document.querySelector(targetSel) : form.closest('[data-inline-zone]');
    if (!zone || !zone.id) { form.submit(); return; }  // sin zona localizable -> envío normal

    var confirmMsg = form.getAttribute('data-confirm');
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    if (window.appLoader) window.appLoader.show();
    var fd = new FormData(form);
    // Si el submit lo disparó un botón con name/value, incluirlo.
    var sb = form.querySelector('button[type="submit"][name], input[type="submit"][name]');
    if (e.submitter && e.submitter.name) fd.append(e.submitter.name, e.submitter.value || '');

    fetch(form.action || window.location.href, {
      method: (form.getAttribute('method') || 'post').toUpperCase(),
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      redirect: 'follow'
    })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.getElementById(zone.id);
        if (!fresh) { window.location.reload(); return; }
        zone.replaceWith(fresh);
        showFlashes(doc);
        reinit(fresh);
      })
      .catch(function () { window.location.reload(); })
      .finally(function () { if (window.appLoader) window.appLoader.hide(); });
  });
})();
