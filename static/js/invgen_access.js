/* GENERACIÓN DE INVITACIONES · lote 3 · la pestaña «Control de accesos» de la gestión de invitaciones
   (templates/_invgen_access_tab.html). Tres cosas:
     1) el pop-up del CONTROL DE ACCESO PROPIO: genera (o reutiliza) el enlace, y lo comparte por
        copiar · WhatsApp · SMS · correo (el correo lo compone y lo manda el servidor);
     2) las tarjetas por control (la entrada y cada extra): se despliegan con sus invitados, se pueden
        ver también las anuladas, y una lectura hecha por error se deshace;
     3) el TIEMPO REAL: cada pocos segundos se pide el estado y se repintan los números, las filas
        (verde = ya ha pasado) y las marcas de la pestaña «Invitados».
   Todo por delegación en `document`: la pestaña vive en una página cuyas zonas se repintan por AJAX. */
(function () {
  'use strict';

  var root = document.querySelector('[data-invacc]');
  if (!root) return;

  var STATE_URL = root.getAttribute('data-state-url');
  var LINK_URL = root.getAttribute('data-link-url');
  var SEND_URL = root.getAttribute('data-send-url');
  var UNDO_URL = root.getAttribute('data-undo-url');
  var ENTRY = root.getAttribute('data-entry-key') || 'ENTRADA';
  var POLL = Math.max(3, parseInt(root.getAttribute('data-poll') || '5', 10)) * 1000;
  var CONTROLS = [];
  try { CONTROLS = JSON.parse(root.getAttribute('data-controls') || '[]'); } catch (e) { CONTROLS = []; }
  var CTRL_BY_KEY = {};
  CONTROLS.forEach(function (c) { CTRL_BY_KEY[c.key] = c; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function num(n) { try { return Number(n || 0).toLocaleString('es-ES'); } catch (e) { return String(n || 0); } }
  function q(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ------------------------------------------------------------------ las tarjetas por control */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-invacc-toggle]');
    if (t && root.contains(t)) {
      var key = t.getAttribute('data-invacc-toggle');
      var list = q('[data-invacc-list="' + key + '"]', root);
      if (!list) return;
      var abierto = !list.classList.contains('d-none');
      list.classList.toggle('d-none', abierto);
      t.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      t.closest('.invacc-card').classList.toggle('is-open', !abierto);
      return;
    }
    var off = ev.target.closest('[data-invacc-showoff]');
    if (off && root.contains(off)) {
      var k2 = off.getAttribute('data-invacc-showoff');
      var lst = q('[data-invacc-list="' + k2 + '"]', root);
      var ocultas = lst && lst.querySelector('.invacc-row.is-off.d-none');
      qa('.invacc-row.is-off', lst).forEach(function (r) { r.classList.toggle('d-none', !ocultas); });
      off.innerHTML = ocultas
        ? '<i class="fa fa-eye-slash me-1"></i>Ocultar las anuladas y bloqueadas'
        : '<i class="fa fa-eye me-1"></i>Ver también las anuladas y bloqueadas (' + qa('.invacc-row.is-off', lst).length + ')';
      return;
    }
    var undo = ev.target.closest('[data-invacc-undo]');
    if (undo && root.contains(undo)) {
      ev.preventDefault();
      var fila = undo.closest('.invacc-row');
      var quien = fila ? (fila.querySelector('.invacc-row__name') || {}).textContent : '';
      var ctrl = CTRL_BY_KEY[undo.getAttribute('data-control')] || {};
      if (!window.confirm('¿Deshacer esta lectura' + (quien ? ' de ' + quien.trim() : '') + (ctrl.name ? ' (' + ctrl.name + ')' : '') + '? Volverá a contar como no validada.')) return;
      undo.setAttribute('disabled', 'disabled');
      fetch(UNDO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ ticket_id: undo.getAttribute('data-ticket'), control: undo.getAttribute('data-control') }),
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          undo.removeAttribute('disabled');
          if (!j || !j.ok) { alert((j && j.error) || 'No se pudo deshacer.'); return; }
          if (j.state) aplicar(j.state);
        })
        .catch(function () { undo.removeAttribute('disabled'); alert('Sin conexión.'); });
    }
  });

  /* ------------------------------------------------------------------ el estado en vivo */
  function aplicar(state) {
    if (!state || !state.controls) return;
    (state.controls || []).forEach(function (c) {
      var v = q('[data-invacc-validated="' + c.key + '"]', root); if (v) v.textContent = num(c.validated);
      var i = q('[data-invacc-issued="' + c.key + '"]', root); if (i) i.textContent = num(c.issued);
      var b = q('[data-invacc-bar="' + c.key + '"]', root); if (b) b.style.width = (c.pct || 0) + '%';
    });
    var tot = state.totals || {};
    Object.keys(tot).forEach(function (k) {
      var el = q('[data-invacc-total="' + k + '"]', root); if (el) el.textContent = num(tot[k]);
    });
    var pill = q('[data-invacc-pill]'); if (pill && tot.entered != null) pill.textContent = num(tot.entered);
    // Las filas: verde cuando la entrada ya ha pasado (o ya ha usado ese extra), con su hora.
    var tickets = state.tickets || {};
    qa('.invacc-row', root).forEach(function (row) {
      var st = tickets[row.getAttribute('data-invacc-row')];
      if (!st) return;
      var ctrl = row.getAttribute('data-control');
      var on = (ctrl === ENTRY) ? !!st.entered : !!(st.extras && st.extras[ctrl] !== undefined);
      row.classList.toggle('is-on', on);
      var when = row.querySelector('[data-invacc-when]');
      if (when) when.textContent = on ? ((ctrl === ENTRY) ? (st.entered_label || '') : (st.extras[ctrl] || '')) : '';
      if (st.acc && st.acc !== row.getAttribute('data-acc')) {
        // una entrada que se ha anulado o desbloqueado mientras se miraba
        row.setAttribute('data-acc', st.acc);
        var valida = st.acc === 'VALID';
        row.classList.toggle('is-off', !valida);
        if (valida) row.classList.remove('d-none');
      }
    });
    // Las marcas de la pestaña «Invitados» («2/3 dentro» y los extras usados por petición/compromiso).
    var bySrc = state.by_source || {};
    qa('[data-access-src]').forEach(function (el) {
      var agg = bySrc[el.getAttribute('data-access-src')];
      var hay = !!(agg && (agg.entered || (agg.extras && Object.keys(agg.extras).length)));
      el.classList.toggle('d-none', !hay);
      var ent = el.querySelector('[data-access-entered]');
      if (ent) {
        ent.hidden = !(agg && agg.entered);
        var n1 = ent.querySelector('[data-access-entered-n]'), n2 = ent.querySelector('[data-access-total-n]');
        if (n1) n1.textContent = num(agg ? agg.entered : 0);
        if (n2) n2.textContent = num(agg ? agg.total : 0);
      }
      var ex = el.querySelector('[data-access-extras]');
      if (ex) {
        var html = '';
        if (agg && agg.extras) {
          CONTROLS.forEach(function (c) {
            if (c.is_entry || !agg.extras[c.key]) return;
            html += '<span class="badge text-bg-light border" title="' + esc(c.name) + ': usado"><i class="fa ' + esc(c.icon) + ' me-1"></i>' + num(agg.extras[c.key]) + '</span>';
          });
        }
        ex.innerHTML = html;
      }
    });
    var at = q('[data-invacc-at]', root); if (at && state.at) at.textContent = state.at;
  }

  var pollTimer = null;
  function sondear() {
    if (document.hidden) { programar(); return; }
    fetch(STATE_URL, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.ok) aplicar(j); })
      .catch(function () { /* sin red: se vuelve a intentar */ })
      .then(programar);
  }
  function programar() { clearTimeout(pollTimer); pollTimer = setTimeout(sondear, POLL); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { clearTimeout(pollTimer); sondear(); } });
  programar();

  /* ------------------------------------------------------------------ el pop-up del enlace */
  var modalEl = document.getElementById('invAccessShareModal');
  var actual = null;
  function m(sel) { return modalEl ? modalEl.querySelector('[' + sel + ']') : null; }
  function show(el, on) { if (el) el.classList.toggle('d-none', !on); }

  function pintar(j) {
    actual = j;
    show(m('data-invacc-loading'), false);
    show(m('data-invacc-body'), true);
    m('data-invacc-url').value = j.url || '';
    m('data-invacc-openlink').href = j.url || '#';
    var sh = j.share || {};
    if (sh.title) m('data-invacc-title').textContent = sh.title;
    if (sh.description) m('data-invacc-desc').textContent = sh.description;
    m('data-invacc-wa').href = sh.whatsapp_url || '#';
    m('data-invacc-sms').href = sh.sms_url || '#';
    var info = q('[data-invacc-linkinfo]', root);
    if (info) info.innerHTML = '<i class="fa fa-link me-1"></i>Enlace generado' + (j.at ? ' el ' + esc(j.at) : '') + ' · <a href="' + esc(j.url) + '" target="_blank" rel="noopener">abrirlo</a>';
  }

  function pedirEnlace(renew) {
    show(m('data-invacc-loading'), true);
    show(m('data-invacc-body'), false);
    show(m('data-invacc-error'), false);
    var fd = new FormData();
    if (renew) fd.append('renew', '1');
    return fetch(LINK_URL, { method: 'POST', body: fd, headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo generar el enlace');
        pintar(j);
      })
      .catch(function (e) {
        show(m('data-invacc-loading'), false);
        var err = m('data-invacc-error');
        if (err) { err.textContent = e.message || 'No se pudo generar el enlace'; show(err, true); }
      });
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-invacc-open]');
    if (!btn || !modalEl) return;
    ev.preventDefault();
    if (window.bootstrap && window.bootstrap.Modal) window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
    show(m('data-invacc-mailbox'), false);
    var msg = m('data-invacc-mailmsg'); if (msg) msg.textContent = '';
    pedirEnlace(false);
  });

  if (modalEl) {
    m('data-invacc-copy').addEventListener('click', function () {
      var inp = m('data-invacc-url');
      var done = function () { m('data-invacc-copy').innerHTML = '<i class="fa fa-check"></i>'; setTimeout(function () { m('data-invacc-copy').innerHTML = '<i class="fa fa-copy"></i>'; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); document.execCommand('copy'); done(); });
      else { inp.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
    });
    m('data-invacc-renew').addEventListener('click', function () {
      if (!window.confirm('El enlace anterior dejará de valer (quien lo tenga no podrá seguir controlando accesos con él). ¿Generar otro?')) return;
      pedirEnlace(true);
    });
    m('data-invacc-mail').addEventListener('click', function () {
      var box = m('data-invacc-mailbox');
      show(box, box.classList.contains('d-none'));
      if (!box.classList.contains('d-none')) m('data-invacc-to').focus();
    });
    m('data-invacc-send').addEventListener('click', function () {
      var to = (m('data-invacc-to').value || '').trim();
      var msg = m('data-invacc-mailmsg');
      if (!to) { msg.textContent = 'Pon al menos un correo.'; msg.className = 'small ms-2 text-danger'; return; }
      var b = m('data-invacc-send'); b.setAttribute('disabled', 'disabled');
      msg.textContent = 'Enviando…'; msg.className = 'small ms-2 text-muted';
      fetch(SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ emails: to, note: (m('data-invacc-note').value || '').trim() }),
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          b.removeAttribute('disabled');
          if (!j || !j.ok) { msg.textContent = (j && j.error) || 'No se pudo mandar.'; msg.className = 'small ms-2 text-danger'; return; }
          msg.textContent = 'Enviado a ' + j.sent + (j.sent === 1 ? ' persona' : ' personas') + (j.warning ? ' · ' + j.warning : '') + '.';
          msg.className = 'small ms-2 text-success';
        })
        .catch(function () { b.removeAttribute('disabled'); msg.textContent = 'Sin conexión.'; msg.className = 'small ms-2 text-danger'; });
    });
  }
})();
