/* ============================================================================================
   SYNCRO · QUIÉN HA RECIBIDO UN TEMA (y qué ha hecho con él).
   Se abre al pinchar el número de envíos de una fila (`[data-sync-rcp]`).
   ⚠️ El listado se pide AL ABRIRLO (`sync_song_recipients`), no viaja en el HTML de la pantalla:
   con decenas de supervisores por tema, la página pesaría muchísimo (la misma razón por la que los
   destinatarios del envío se cargan al abrir su pop-up).
   ⚠️ Va por DELEGACIÓN en `document`: estas filas se repintan por AJAX.
   ============================================================================================ */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  function icono(clase, encendido, titulo, extra) {
    var cls = 'fa-solid ' + clase + ' sync-track__i' + (encendido ? (' ' + encendido) : '');
    return '<i class="' + cls + '" title="' + esc(titulo) + '"></i>' + (extra || '');
  }

  function fila(r) {
    var foto = r.photo
      ? '<img class="sync-rcp__img" src="' + esc(r.photo) + '" alt="" data-avatar="1">'
      : '<img class="sync-rcp__img" src="' + esc(document.body.dataset.defaultAvatarUrl || '') + '" alt="">';
    var sub = [];
    if (r.sent_at_label) sub.push('Enviada el ' + esc(r.sent_at_label));
    if (r.language) sub.push(esc(r.language));
    if (r.seconds_label && !r.listened) sub.push('escuchó ' + esc(r.seconds_label));
    var nombre = r.url
      ? '<a class="text-reset text-decoration-none" href="' + esc(r.url) + '">' + esc(r.name) + '</a>'
      : esc(r.name);
    return '<div class="sync-rcp">' + foto +
      '<div class="sync-rcp__main"><div class="sync-rcp__name">' + nombre + '</div>' +
      '<div class="sync-rcp__sub">' + sub.join(' · ') + '</div></div>' +
      '<span class="sync-track">' +
        icono('fa-envelope-open', r.opened ? 'is-on' : '', r.opened_label) +
        icono('fa-headphones', r.listened ? 'is-on' : (r.seconds ? 'is-half' : ''), r.listened_label) +
        (r.forwarded ? icono('fa-share-from-square', 'is-fwd', r.forwarded_label) : '') +
      '</span></div>';
  }

  function galleta(icono, n, texto, clase) {
    return '<span class="badge ' + clase + '"><i class="fa-solid ' + icono + ' me-1"></i>' +
      n + ' ' + esc(texto) + '</span>';
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-sync-rcp]') : null;
    if (!b) return;
    ev.preventDefault();
    var modalEl = document.getElementById('syncRcpModal');
    if (!modalEl || !window.bootstrap) return;      // sin el pop-up, el tooltip ya lo dice
    var tit = modalEl.querySelector('[data-sync-rcp-title]');
    var lista = modalEl.querySelector('[data-sync-rcp-list]');
    var cuentas = modalEl.querySelector('[data-sync-rcp-counts]');
    if (tit) tit.textContent = 'Enviada a — ' + (b.getAttribute('data-sync-rcp-title') || '');
    if (lista) lista.innerHTML = '<div class="text-muted small py-3"><i class="fa fa-spinner fa-spin me-2"></i>Cargando…</div>';
    if (cuentas) cuentas.innerHTML = '';
    bootstrap.Modal.getOrCreateInstance(modalEl).show();

    fetch('/syncros/' + encodeURIComponent(b.getAttribute('data-sync-rcp')) + '/destinatarios',
          { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo cargar.');
        if (cuentas) {
          var c = d.counts || {};
          cuentas.innerHTML =
            galleta('fa-paper-plane', c.total || 0, (c.total === 1 ? 'envío' : 'envíos'), 'text-bg-secondary') +
            galleta('fa-envelope-open', c.opened || 0, 'lo han abierto', 'text-bg-light border') +
            galleta('fa-headphones', c.listened || 0, 'lo han escuchado', 'text-bg-light border') +
            ((c.forwarded || 0) ? galleta('fa-share-from-square', c.forwarded,
                                          'posiblemente reenviado', 'text-bg-light border') : '');
        }
        if (lista) {
          lista.innerHTML = (d.rows || []).length
            ? (d.rows || []).map(fila).join('')
            : '<div class="text-muted small py-3">Todavía no se le ha mandado a nadie.</div>';
        }
      })
      .catch(function (e) {
        if (lista) lista.innerHTML = '<div class="alert alert-warning mb-0">' + esc(e.message || 'No se pudo cargar.') + '</div>';
      });
  });
})();
