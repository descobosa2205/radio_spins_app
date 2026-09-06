/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ENVIAR UNA NOTA DE PRENSA: quién la manda · cuándo · a quién, con la previsualización al lado.
   Al pulsar Enviar/Programar se pregunta si se quiere una PRUEBA antes; la prueba va a quien está
   configurando la nota. Los destinatarios son las casillas marcadas + los añadidos (de la base o a
   mano). El CSRF lo pone `csrf.js`.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('[data-pr-send]');
  if (!root) return;
  var q = function (s) { return root.querySelector(s); };
  var qa = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(v) { return String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }
  var mode = root.getAttribute('data-mode') || 'send';

  /* ---------- 1 · remitente ---------- */
  root.addEventListener('change', function (ev) {
    if (ev.target.name === 'sender_kind') qa('.pr-sender').forEach(function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); });
    if (ev.target.name === 'when') { q('[data-pr-when-schedule]').classList.toggle('d-none', ev.target.value !== 'schedule'); etiqueta(); }
    if (ev.target.matches('[data-pr-recip]') || ev.target.matches('[data-pr-all-active]') || ev.target.matches('[data-pr-prev-toggle]')) {
      if (ev.target.matches('[data-pr-all-active]')) qa('[data-pr-groups] [data-pr-recip]').forEach(function (c) { c.checked = ev.target.checked; });
      if (ev.target.matches('[data-pr-prev-toggle]')) qa('[data-pr-prev-list] [data-pr-recip]').forEach(function (c) { c.checked = ev.target.checked; });
      cuenta();
    }
  });
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pr-group-toggle]');
    if (t) {
      ev.preventDefault();
      var g = t.closest('.pr-recip-group'), cbs = g.querySelectorAll('[data-pr-recip]');
      var alguno = Array.prototype.some.call(cbs, function (c) { return c.checked; });
      cbs.forEach(function (c) { c.checked = !alguno; });
      t.textContent = alguno ? 'marcar todos' : 'quitar todos';
      cuenta();
    }
    var ps = ev.target.closest('[data-pr-prev-show]');
    if (ps) { ev.preventDefault(); q('[data-pr-prev-list]').classList.toggle('d-none'); }
    var quitar = ev.target.closest('[data-pr-remove]');
    if (quitar) { ev.preventDefault(); quitar.closest('.pr-recip-item').remove(); cuenta(); }
  });

  /* ---------- 3 · destinatarios ---------- */
  function filas() {
    var out = [], vistos = {};
    qa('[data-pr-recip]:checked').forEach(function (c) {
      var email = (c.getAttribute('data-email') || '').trim().toLowerCase();
      if (!email || vistos[email]) return;
      vistos[email] = 1;
      out.push({ kind: c.getAttribute('data-kind') || 'MANUAL', ref_id: c.getAttribute('data-ref') || '', email: email,
                 name: c.getAttribute('data-name') || '', media_name: c.getAttribute('data-media') || '' });
    });
    return out;
  }
  function cuenta() {
    var n = filas().length;
    var t = q('[data-pr-total]'); if (t) t.textContent = n + (n === 1 ? ' destinatario' : ' destinatarios');
    var ac = q('[data-pr-active-count]'); if (ac) ac.textContent = qa('[data-pr-groups] [data-pr-recip]:checked').length;
    var go = q('[data-pr-go]'); if (go) go.disabled = !n;
    etiqueta();
  }
  function etiqueta() {
    var prog = (q('input[name="when"]:checked') || {}).value === 'schedule';
    var l = q('[data-pr-go-label]'); if (l) l.textContent = prog ? 'Programar el envío' : (mode === 'share' ? 'Compartir por email' : (mode === 'resend' ? 'Reenviar' : 'Enviar'));
    qa('[data-pr-confirm-verb],[data-pr-confirm-verb2],[data-pr-confirm-verb3]').forEach(function (e) {
      e.textContent = e.hasAttribute('data-pr-confirm-verb') ? (prog ? 'programarla' : 'enviarla') : (prog ? 'programar' : 'enviar');
    });
  }
  var filtro = q('[data-pr-filter]');
  if (filtro) filtro.addEventListener('input', function () {
    var v = norm(filtro.value);
    qa('[data-pr-groups] .pr-recip-group').forEach(function (g) {
      var hay = false;
      g.querySelectorAll('.pr-recip-item').forEach(function (it) { var ok = !v || norm(it.getAttribute('data-search')).indexOf(v) >= 0; it.classList.toggle('d-none', !ok); if (ok) hay = true; });
      g.classList.toggle('d-none', !hay && !!v);
    });
  });

  function añade(fila) {
    var email = (fila.email || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return false;
    var ya = qa('[data-pr-recip]').some(function (c) { return (c.getAttribute('data-email') || '').toLowerCase() === email; });
    if (ya) return true;
    var box = q('[data-pr-added]');
    var lab = document.createElement('label');
    lab.className = 'pr-recip-item';
    lab.innerHTML = '<input type="checkbox" class="form-check-input" checked data-pr-recip data-kind="' + esc(fila.kind || 'MANUAL') + '" data-ref="' + esc(fila.ref_id || '') + '" data-email="' + esc(email) + '" data-name="' + esc(fila.name || '') + '" data-media="' + esc(fila.media_name || '') + '">' +
      (fila.photo ? '<img src="' + esc(fila.photo) + '" alt="" class="pr-recip-item__ava" data-avatar="1">' : '') +
      '<span class="pr-recip-item__t"><b>' + esc(fila.name || email) + '</b><small>' + esc(email) + (fila.sub ? ' · ' + esc(fila.sub) : '') + '</small></span>' +
      '<button type="button" class="btn btn-link btn-sm text-muted p-0 ms-auto" data-pr-remove title="Quitar"><i class="fa fa-xmark"></i></button>';
    box.appendChild(lab);
    cuenta();
    return true;
  }
  var manual = q('[data-pr-manual]');
  function añadeManual() {
    var txt = manual.value || '', malos = [];
    txt.split(/[;,\s]+/).forEach(function (e) { if (e && !añade({ email: e })) malos.push(e); });
    manual.value = malos.join(', ');
    if (malos.length) alert('No parece un correo: ' + malos.join(', '));
  }
  q('[data-pr-manual-add]').addEventListener('click', añadeManual);
  manual.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); añadeManual(); } });

  // Buscar en la base: la lista cuelga del body (app33FloatList), como el resto de buscadores.
  var busc = q('[data-pr-search]'), box = null, tm = null;
  function caja() {
    if (box) return box;
    box = document.createElement('div'); box.className = 'ta-results'; box.style.display = 'none'; document.body.appendChild(box);
    if (window.app33FloatList) window.app33FloatList.attach(box);
    box.addEventListener('mousedown', function (ev) {
      var it = ev.target.closest('[data-pr-pick]'); if (!it) return;
      ev.preventDefault();
      añade(JSON.parse(it.getAttribute('data-pr-pick')));
      busc.value = ''; cierra();
    });
    return box;
  }
  function cierra() { if (box) box.style.display = 'none'; }
  busc.addEventListener('input', function () {
    clearTimeout(tm);
    var v = busc.value.trim();
    if (v.length < 2) { cierra(); return; }
    tm = setTimeout(function () {
      fetch(root.getAttribute('data-search-url') + '?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (js) {
        var rows = (js && js.rows) || [];
        var b = caja();
        if (!rows.length) { cierra(); return; }
        b.innerHTML = rows.map(function (r) {
          return '<button type="button" class="ta-item" data-pr-pick="' + esc(JSON.stringify(r)) + '">' +
            (r.photo ? '<img src="' + esc(r.photo) + '" alt="">' : '<span class="ta-item__noimg"></span>') +
            '<span class="ta-item__t">' + esc(r.name) + '<small class="ta-item__s">' + esc(r.email) + (r.sub ? ' · ' + esc(r.sub) : '') + '</small></span></button>';
        }).join('');
        b.style.display = 'block';
        if (window.app33FloatList) window.app33FloatList.place(busc, b, { abajo: true, max: 300 });
      });
    }, 180);
  });
  busc.addEventListener('blur', function () { setTimeout(cierra, 180); });

  /* ---------- enviar / programar, con la pregunta de la prueba ---------- */
  var modal = document.getElementById('prConfirmModal');
  function pasoConfirm(n) { modal.querySelectorAll('[data-pr-confirm-step]').forEach(function (e) { e.classList.toggle('d-none', e.getAttribute('data-pr-confirm-step') !== n); }); }
  function errorConfirm(msg) { var e = modal.querySelector('[data-pr-confirm-error]'); e.textContent = msg || ''; e.classList.toggle('d-none', !msg); }
  function payload() {
    var prog = (q('input[name="when"]:checked') || {}).value === 'schedule';
    return { sender_kind: (q('input[name="sender_kind"]:checked') || {}).value || root.getAttribute('data-sender'),
             when: prog ? 'schedule' : 'now', scheduled_at: prog ? (q('[data-pr-scheduled]').value || '') : '',
             recipients: filas(), mode: mode };
  }
  q('[data-pr-go]').addEventListener('click', function () {
    var p = payload();
    if (!p.recipients.length) return alert('Elige al menos un destinatario.');
    if (p.when === 'schedule' && !p.scheduled_at) return alert('Di el día y la hora en que se manda.');
    errorConfirm(''); pasoConfirm('ask');
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
  });
  modal.querySelector('[data-pr-test]').addEventListener('click', function () {
    var btn = this; btn.disabled = true; errorConfirm('');
    post(root.getAttribute('data-test-url'), { sender_kind: payload().sender_kind, email: root.getAttribute('data-my-email') }).then(function (js) {
      btn.disabled = false;
      if (!js || !js.ok) { errorConfirm((js && js.error) || 'No se pudo mandar la prueba.'); return; }
      modal.querySelector('[data-pr-test-to]').textContent = js.email || '';
      pasoConfirm('sent');
    });
  });
  modal.querySelectorAll('[data-pr-confirm-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var btns = modal.querySelectorAll('button'); btns.forEach(function (x) { x.disabled = true; });
      errorConfirm('');
      post(root.getAttribute('data-send-url'), payload()).then(function (js) {
        btns.forEach(function (x) { x.disabled = false; });
        if (!js || !js.ok) { errorConfirm((js && js.error) || 'No se pudo enviar.'); return; }
        window.location.href = js.url;
      });
    });
  });
  cuenta();
})();
