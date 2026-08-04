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
    // ⚠️ Si otro handler ya canceló el envío (un `onsubmit="return confirm(...)"` al que se ha dicho
    // que NO, o una validación propia), aquí NO se manda nada: el evento sigue burbujeando aunque
    // esté cancelado, y sin esto se enviaba igual por fetch. Para preguntar, usa `data-confirm`.
    if (e.defaultPrevented) return;
    e.preventDefault();

    var targetSel = form.getAttribute('data-inline-target');
    var zone = targetSel ? document.querySelector(targetSel) : form.closest('[data-inline-zone]');
    if (!zone || !zone.id) { form.submit(); return; }  // sin zona localizable -> envío normal

    // ⚠️ Manda el BOTÓN que ha enviado, si trae lo suyo: su `data-confirm` (para preguntar solo en
    // esa acción) y su `formaction`/`formmethod` (varias acciones en un mismo formulario, que es la
    // única forma de tener botones por fila sin anidar formularios — eso no es HTML válido).
    var submitter = e.submitter || null;
    var confirmMsg = (submitter && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    if (window.appLoader) window.appLoader.show();
    var fd = new FormData(form);
    // Si el submit lo disparó un botón con name/value, incluirlo.
    if (submitter && submitter.name) fd.append(submitter.name, submitter.value || '');

    var action = (submitter && submitter.getAttribute('formaction')) || form.action || window.location.href;
    fetch(action, {
      method: ((submitter && submitter.getAttribute('formmethod')) || form.getAttribute('method') || 'post').toUpperCase(),
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
