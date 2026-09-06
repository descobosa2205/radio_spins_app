/* ══════════════════════════════════════════════════════════════════════════════════════════════
   NOTAS DE PRENSA · el listado y la ficha: el asistente de CREAR, los pop-ups de envíos y
   aperturas, y compartir por WhatsApp / SMS / copiar el enlace. Todo por delegación.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__pressListReady) return;
  window.__pressListReady = true;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }

  /* ---------- compartir ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pr-share]');
    if (!b) return;
    ev.preventDefault();
    var url = b.getAttribute('data-pr-url') || '', titulo = b.getAttribute('data-pr-title') || 'Nota de prensa';
    var modo = b.getAttribute('data-pr-share');
    if (modo === 'wa' && window.shareByWhatsapp) return window.shareByWhatsapp(titulo, url);
    if (modo === 'sms' && window.shareBySms) return window.shareBySms(titulo, url);
    if (modo === 'wa') return window.open('https://wa.me/?text=' + encodeURIComponent(titulo + ' ' + url), '_blank');
    if (modo === 'sms') return (window.location.href = 'sms:?body=' + encodeURIComponent(titulo + ' ' + url));
    if (window.copyShareLink) return window.copyShareLink(url);
    try { navigator.clipboard.writeText(url); } catch (e) {}
  });

  /* ---------- envíos y aperturas ---------- */
  var statsUrl = '', statsRows = null;
  function pintaStats(kind) {
    var body = document.querySelector('[data-pr-stats-body]');
    var titulo = document.querySelector('[data-pr-stats-title]');
    if (!body) return;
    document.querySelectorAll('[data-pr-stats-tab]').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-pr-stats-tab') === kind); });
    if (titulo) titulo.textContent = kind === 'opened' ? 'Quién la ha abierto' : 'A quién se ha enviado';
    if (!statsRows) { body.innerHTML = '<div class="text-muted small">Cargando…</div>'; return; }
    var filas = statsRows.filter(function (r) { return kind === 'opened' ? r.opened : true; });
    if (!filas.length) { body.innerHTML = '<div class="alert alert-light border mb-0">' + (kind === 'opened' ? 'Todavía nadie la ha abierto.' : 'Todavía no se ha enviado a nadie.') + '</div>'; return; }
    body.innerHTML = '<div class="pr-recips">' + filas.map(function (r) {
      var st = r.opened ? 'is-open' : (r.error ? 'is-err' : (r.sent_at ? 'is-sent' : 'is-wait'));
      var ico = r.opened ? 'fa-envelope-open' : (r.error ? 'fa-triangle-exclamation' : (r.sent_at ? 'fa-check' : 'fa-clock'));
      var det = kind === 'opened'
        ? ('Abierta ' + (r.open_count || 1) + (r.open_count === 1 ? ' vez' : ' veces') + (r.opened_at ? ' · la primera el ' + r.opened_at : '') + (r.forwarded ? ' · <span class="text-warning">posiblemente reenviada</span>' : ''))
        : (r.error ? ('<span class="text-danger">No salió: ' + esc(r.error) + '</span>') : (r.sent_at ? ('Enviada el ' + r.sent_at + (r.opened ? ' · <span class="text-success">abierta</span>' : '')) : 'Pendiente de salir'));
      return '<div class="pr-recip"><span class="pr-recip__st ' + st + '"><i class="fa ' + ico + '"></i></span>' +
        '<span class="pr-recip__who"><b>' + esc(r.name || r.email) + '</b>' + (r.media_name ? ' <span class="text-muted">· ' + esc(r.media_name) + '</span>' : '') +
        '<br><small class="text-muted">' + esc(r.email) + ' · ' + det + '</small></span></div>';
    }).join('') + '</div>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pr-stats]');
    if (b) {
      ev.preventDefault();
      statsUrl = b.getAttribute('data-pr-stats');
      statsRows = null;
      var kind = b.getAttribute('data-pr-stats-kind') || 'sent';
      var m = document.getElementById('pressStatsModal');
      if (!m || !window.bootstrap) return;
      pintaStats(kind);
      bootstrap.Modal.getOrCreateInstance(m).show();
      fetch(statsUrl).then(function (r) { return r.json(); }).then(function (js) {
        statsRows = (js && js.rows) || [];
        pintaStats(kind);
      }).catch(function () { statsRows = []; pintaStats(kind); });
      return;
    }
    var tab = ev.target.closest('[data-pr-stats-tab]');
    if (tab) { ev.preventDefault(); pintaStats(tab.getAttribute('data-pr-stats-tab')); }
  });

  /* ---------- el asistente de crear ---------- */
  function initWizard(root) {
    if (!root || root.dataset.prwReady === '1') return;
    root.dataset.prwReady = '1';
    var q = function (s) { return root.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
    var st = { kind: '', ids: [], labels: [], about: '', aboutId: '', options: null };

    function error(msg) { var e = q('[data-prw-error]'); if (!e) return; e.textContent = msg || ''; e.classList.toggle('d-none', !msg); }
    function paso(n) { qa('[data-prw-step]').forEach(function (el) { el.classList.toggle('d-none', el.getAttribute('data-prw-step') !== n); }); error(''); }

    function refrescaElegidos() {
      var lab = q('[data-prw-picked-label]');
      if (lab) lab.textContent = st.labels.length ? ('Elegido: ' + st.labels.join(' · ')) : 'Nadie elegido todavía';
      var n = q('[data-prw-next]'); if (n) n.disabled = !st.ids.length;
      var sk = q('[data-prw-subject-kind-name]');
      if (sk) sk.textContent = st.kind === 'ARTIST' ? (st.ids.length > 1 ? 'Sobre los artistas' : 'Sobre el artista') : (st.kind === 'EVENT' ? 'Sobre el evento' : (st.kind === 'TOUR' ? 'Sobre la gira' : 'Sobre el ciclo o festival'));
    }
    root.addEventListener('change', function (ev) {
      var cb = ev.target.closest('input[name="prw_subject"]');
      if (cb) {
        var card = cb.closest('.js-prw-subject');
        var kind = card.getAttribute('data-kind'), id = card.getAttribute('data-id'), label = card.getAttribute('data-label');
        if (cb.checked) {
          // Varios ARTISTAS sí; un evento, una gira o un ciclo van SOLOS.
          if (kind !== 'ARTIST' || st.kind !== 'ARTIST') { st.ids = []; st.labels = []; qa('input[name="prw_subject"]').forEach(function (o) { if (o !== cb) o.checked = false; }); }
          st.kind = kind; st.ids.push(id); st.labels.push(label);
        } else {
          var i = st.ids.indexOf(id); if (i >= 0) { st.ids.splice(i, 1); st.labels.splice(i, 1); }
          if (!st.ids.length) st.kind = '';
        }
        qa('.js-prw-subject').forEach(function (c) { c.classList.toggle('is-picked', c.querySelector('input').checked); });
        refrescaElegidos();
        return;
      }
      var ab = ev.target.closest('input[name="prw_about"]');
      if (ab) { st.about = ab.value; st.aboutId = ''; pintaOpciones(); }
    });
    var buscador = q('[data-prw-search]');
    if (buscador) buscador.addEventListener('input', function () {
      var v = norm(buscador.value);
      qa('.js-prw-subject').forEach(function (c) {
        var extra = c.getAttribute('data-prw-extra') === '1' && !root.dataset.prwMore;
        c.classList.toggle('d-none', (!!v && norm(c.getAttribute('data-search')).indexOf(v) < 0) || (!v && extra));
      });
    });
    var mas = q('[data-prw-more]');
    if (mas) mas.addEventListener('click', function () { root.dataset.prwMore = '1'; qa('.js-prw-subject').forEach(function (c) { c.classList.remove('d-none'); }); mas.classList.add('d-none'); });

    q('[data-prw-next]').addEventListener('click', function () {
      if (!st.ids.length) return;
      paso('about');
      var sub = q('[data-prw-sub]'); if (sub) sub.textContent = st.labels.join(' · ') + ' · ¿sobre qué va la nota?';
      st.options = null;
      var url = root.getAttribute('data-url-about') + '?kind=' + encodeURIComponent(st.kind) + '&id=' + encodeURIComponent(st.kind === 'ARTIST' ? '' : st.ids[0]) + '&artists=' + encodeURIComponent(st.kind === 'ARTIST' ? st.ids.join(',') : '');
      fetch(url).then(function (r) { return r.json(); }).then(function (js) { st.options = js || {}; pintaOpciones(); }).catch(function () { st.options = {}; pintaOpciones(); });
      cargaPlantillas();
    });
    q('[data-prw-back]').addEventListener('click', function () { paso('subject'); });

    function pintaOpciones() {
      var wrap = q('[data-prw-options-wrap]'), box = q('[data-prw-options]'), crear = q('[data-prw-create]');
      var tplWrap = q('[data-prw-template-wrap]');
      if (!st.about) { wrap.classList.add('d-none'); crear.disabled = true; return; }
      if (tplWrap) tplWrap.classList.remove('d-none');
      if (st.about === 'SUBJECT') { wrap.classList.add('d-none'); crear.disabled = false; return; }
      wrap.classList.remove('d-none');
      var lista = (st.options || {})[{ ACTIVITY: 'activities', SINGLE: 'singles', ALBUM: 'albums' }[st.about]];
      if (!st.options) { box.innerHTML = '<div class="text-muted small">Cargando…</div>'; return; }
      if (!lista || !lista.length) { box.innerHTML = '<div class="alert alert-light border small mb-0">No hay nada de este tipo para ' + esc(st.labels.join(' · ')) + '.</div>'; crear.disabled = true; return; }
      box.innerHTML = lista.map(function (o) {
        return '<label class="prw-opt' + (o.id === st.aboutId ? ' is-picked' : '') + '"><input type="radio" name="prw_opt" value="' + esc(o.id) + '"' + (o.id === st.aboutId ? ' checked' : '') + '>' +
          (o.cover ? '<img src="' + esc(o.cover) + '" alt="">' : '<span class="prw-opt__ico"><i class="fa ' + esc(o.icon || 'fa-circle') + '"></i></span>') +
          '<span class="prw-opt__t"><b>' + esc(o.label) + '</b><small>' + esc(o.sub || '') + '</small></span></label>';
      }).join('');
      crear.disabled = !st.aboutId;
    }
    root.addEventListener('change', function (ev) {
      var r = ev.target.closest('input[name="prw_opt"]');
      if (!r) return;
      st.aboutId = r.value;
      qa('.prw-opt').forEach(function (o) { o.classList.toggle('is-picked', o.querySelector('input').checked); });
      q('[data-prw-create]').disabled = false;
    });
    function cargaPlantillas() {
      var sel = q('[data-prw-template]');
      if (!sel || sel.dataset.loaded) return;
      fetch(root.getAttribute('data-url-templates')).then(function (r) { return r.json(); }).then(function (js) {
        sel.dataset.loaded = '1';
        (js.templates || []).forEach(function (t) { var o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
      }).catch(function () {});
    }
    q('[data-prw-create]').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      var sel = q('[data-prw-template]');
      post(root.getAttribute('data-url-create'), {
        subject_kind: st.kind, artist_ids: st.kind === 'ARTIST' ? st.ids : [], subject_id: st.kind === 'ARTIST' ? '' : st.ids[0],
        about_kind: st.about, about_id: st.aboutId, template_id: sel ? sel.value : ''
      }).then(function (js) {
        if (!js || !js.ok) { btn.disabled = false; error((js && js.error) || 'No se pudo crear la nota.'); return; }
        window.location.href = js.url;
      });
    });
  }
  function init() { document.querySelectorAll('[data-pr-wizard]').forEach(initWizard); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
