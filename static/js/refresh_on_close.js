/* UN POP-UP QUE HA CREADO O CAMBIADO ALGO REFRESCA LA PANTALLA DE DETRÁS AL CERRARSE.
 *
 * Varios pop-ups trabajan por AJAX (importar compradores, actualizar Label Copy en bloque, mandar
 * un envío a compradores, importar terceros): al terminar enseñaban su resumen, pero la pantalla
 * de detrás seguía como estaba —el listado nuevo no aparecía, el histórico no cambiaba— hasta
 * que alguien recargaba a mano. Da la sensación de que no se ha creado nada.
 *
 * Uso, desde el JS del pop-up, EN CUANTO el servidor confirma que ha guardado:
 *     window.app33RefreshOnClose(modalEl)          → al cerrarse, recarga la página actual
 *     window.app33RefreshOnClose(modalEl, url)     → al cerrarse, va a esa URL (o recarga si es la actual)
 *
 * ⚠️ Al recargar se QUITAN los parámetros que abren un pop-up al llegar (`open`, `campaign`,
 *    `open_wizard`, `configurar`): si no, la página volvería a abrir el mismo pop-up que se acaba
 *    de cerrar.
 * ⚠️ Se escucha `hidden.bs.modal` en `document` (burbujea) y, como red de seguridad —con
 *    `modal_stack.js` por medio no todos los eventos de Bootstrap llegan—, también el clic en el
 *    botón de cerrar del propio pop-up. Un cerrojo evita refrescar dos veces.
 * ⚠️ Es GLOBAL (layout.html) y por delegación: no depende de que el pop-up exista al cargar.
 */
(function () {
  'use strict';

  var ATTR = 'data-refresh-on-close';
  var AUTO_OPEN_PARAMS = ['open', 'campaign', 'open_wizard', 'configurar'];

  function sinAutoOpen(u) {
    var url;
    try { url = new URL(u || window.location.href, window.location.href); } catch (e) { return u || ''; }
    AUTO_OPEN_PARAMS.forEach(function (p) { url.searchParams.delete(p); });
    return url.pathname + (url.search || '') + (url.hash || '');
  }

  function actual() { return window.location.pathname + window.location.search + window.location.hash; }

  function ve(url) {
    var destino = sinAutoOpen(url);
    if (!destino || destino === actual()) { window.location.reload(); return; }
    window.location.assign(destino);
  }

  function marca(modalEl, url) {
    if (!modalEl) return;
    var m = modalEl.classList && modalEl.classList.contains('modal') ? modalEl : (modalEl.closest ? modalEl.closest('.modal') : null);
    if (!m) return;
    m.setAttribute(ATTR, url || '1');
    delete m.dataset.refreshing;
  }

  function dispara(m) {
    if (!m || !m.hasAttribute || !m.hasAttribute(ATTR) || m.dataset.refreshing === '1') return;
    m.dataset.refreshing = '1';
    var v = m.getAttribute(ATTR);
    ve(v && v !== '1' ? v : '');
  }

  document.addEventListener('hidden.bs.modal', function (e) { dispara(e.target); });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.modal [data-bs-dismiss="modal"]') : null;
    if (!b) return;
    var m = b.closest('.modal');
    if (m && m.hasAttribute(ATTR)) setTimeout(function () { dispara(m); }, 400);
  });

  window.app33RefreshOnClose = marca;
  window.app33RefreshNow = ve;
})();
