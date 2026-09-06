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

  /* ---------- el CÓDIGO DE INSERCIÓN de un artista o evento ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pr-embed]');
    if (b) {
      ev.preventDefault();
      var m = document.getElementById('prEmbedModal'); if (!m || !window.bootstrap) return;
      var ta = m.querySelector('[data-pr-embed-code]'); if (ta) ta.value = b.getAttribute('data-pr-embed-code') || '';
      var l = m.querySelector('[data-pr-embed-label]'); if (l) l.textContent = b.getAttribute('data-pr-embed-label') || '';
      var c = m.querySelector('[data-pr-embed-copy]'); if (c) c.innerHTML = '<i class="fa fa-copy me-1"></i>Copiar el código';
      bootstrap.Modal.getOrCreateInstance(m).show();
      return;
    }
    var cp = ev.target.closest('[data-pr-embed-copy]');
    if (!cp) return;
    var m2 = cp.closest('.modal'), ta2 = m2 && m2.querySelector('[data-pr-embed-code]');
    if (!ta2) return;
    function hecho() { cp.innerHTML = '<i class="fa fa-check me-1"></i>Copiado'; }
    ta2.select();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta2.value).then(hecho, function () { try { document.execCommand('copy'); } catch (e) {} hecho(); });
    else { try { document.execCommand('copy'); } catch (e) {} hecho(); }
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
        ? esc(r.opened_label || ('Abierta ' + (r.open_count || 1) + (r.open_count === 1 ? ' vez' : ' veces')))
        : (r.error ? ('<span class="text-danger">No salió: ' + esc(r.error) + '</span>') : (r.sent_at ? ('Enviada el ' + r.sent_at + (r.opened ? ' · <span class="text-success">abierta</span>' : '')) : 'Pendiente de salir'));
      return '<div class="pr-recip"><span class="pr-recip__st ' + st + '"><i class="fa ' + ico + '"></i></span>' +
        '<span class="pr-recip__who"><b>' + esc(r.name || r.email) + '</b>' + (r.media_name ? ' <span class="text-muted">· ' + esc(r.media_name) + '</span>' : '') +
        '<br><small class="text-muted">' + esc(r.email) + ' · ' + det + '</small></span>' +
        '<span class="pr-recip__icons">' +
        (r.forwarded ? '<span class="pr-recip__ico is-fwd" title="' + esc(r.forwarded_label || 'Posiblemente reenviada') + '"><i class="fa fa-share"></i></span>' : '') +
        '</span></div>';
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
      if (sk) sk.textContent = st.kind === 'ARTIST' ? (st.ids.length > 1 ? 'Sobre los artistas' : 'Sobre el artista') : ({ EVENT: 'Sobre el evento', TOUR: 'Sobre la gira', COMPANY: 'Sobre la empresa' }[st.kind] || 'Sobre el ciclo o festival');
      ocultaExistente();
    }
    // El aviso de «ya hay una nota sin enviar sobre esto» (lo devuelve el servidor al crear).
    function ocultaExistente() { var e = q('[data-prw-existing]'); if (e) e.classList.add('d-none'); }
    function pintaExistente(lista) {
      var e = q('[data-prw-existing]'), l = q('[data-prw-existing-list]'), go = q('[data-prw-existing-go]');
      if (!e || !l) return;
      l.innerHTML = (lista || []).map(function (r) {
        return '<div class="prw-existing__row"><a href="' + esc(r.edit_url) + '"><b>' + esc(r.title) + '</b></a>' +
          '<span class="badge ' + (r.status === 'SCHEDULED' ? 'text-bg-warning text-dark' : 'text-bg-light border') + '">' + esc(r.status_label) + '</span>' +
          '<span class="text-muted">' + esc(r.date_label) + (r.by ? ' · ' + esc(r.by) : '') + '</span></div>';
      }).join('');
      if (go && lista && lista.length) go.setAttribute('href', lista[0].edit_url);
      e.classList.remove('d-none');
      try { e.scrollIntoView({ block: 'nearest' }); } catch (x) {}
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
      if (ab) { st.about = ab.value; st.aboutId = ''; ocultaExistente(); pintaOpciones(); }
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
      ocultaExistente();
    });
    function cargaPlantillas() {
      var sel = q('[data-prw-template]');
      if (!sel || sel.dataset.loaded) return;
      fetch(root.getAttribute('data-url-templates')).then(function (r) { return r.json(); }).then(function (js) {
        sel.dataset.loaded = '1';
        (js.templates || []).forEach(function (t) { var o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
      }).catch(function () {});
    }
    function crea(force) {
      var btn = q('[data-prw-create]'); btn.disabled = true;
      var sel = q('[data-prw-template]');
      post(root.getAttribute('data-url-create'), {
        subject_kind: st.kind, artist_ids: st.kind === 'ARTIST' ? st.ids : [], subject_id: st.kind === 'ARTIST' ? '' : st.ids[0],
        about_kind: st.about, about_id: st.aboutId, template_id: sel ? sel.value : '', force: !!force
      }).then(function (js) {
        if (js && js.existing && js.existing.length) { btn.disabled = false; pintaExistente(js.existing); return; }
        if (!js || !js.ok) { btn.disabled = false; error((js && js.error) || 'No se pudo crear la nota.'); return; }
        window.location.href = js.url;
      });
    }
    q('[data-prw-create]').addEventListener('click', function () { crea(false); });
    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-prw-existing-new]')) { ocultaExistente(); crea(true); }
    });
    // Se llega desde una TAREA («Crear la nota de prensa» de un lanzamiento): el asistente sale ya con
    // el artista y el single (o el disco) puestos, listo para «Crear la nota y diseñarla».
    var pre = null; try { pre = JSON.parse(root.getAttribute('data-prw-prefill') || 'null'); } catch (e) { pre = null; }
    if (pre && pre.ids && pre.ids.length) {
      root.dataset.prwMore = '1';
      qa('.js-prw-subject').forEach(function (c) { c.classList.remove('d-none'); });
      if (mas) mas.classList.add('d-none');
      pre.ids.forEach(function (id) {
        var card = qa('.js-prw-subject').filter(function (c) { return c.getAttribute('data-kind') === pre.subject_kind && c.getAttribute('data-id') === id; })[0];
        var cb = card && card.querySelector('input');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      if (st.ids.length) {
        q('[data-prw-next]').click();
        var ab = q('input[name="prw_about"][value="' + (pre.about_kind || 'SUBJECT') + '"]');
        if (ab) {
          ab.checked = true; st.about = pre.about_kind || 'SUBJECT'; st.aboutId = pre.about_id || '';
          qa('[data-prw-kinds] .promo-pick').forEach(function (l) { l.classList.toggle('is-picked', l.querySelector('input').checked); });
          pintaOpciones();
        }
      }
    }
  }
  /* ---------- los contadores EN VIVO ----------
     Cada pocos segundos se pregunta por las notas que hay en pantalla (`[data-pr-live]`) y, si un
     número cambia —alguien acaba de abrir el correo—, se actualiza con un «pop». En la ficha se
     refresca también la lista de a quién se ha mandado. Solo mientras la pestaña se ve. */
  var LIVE_MS = 7000;
  var ESTADO_CLS = { SENT: 'badge text-bg-success', SCHEDULED: 'badge text-bg-warning text-dark', DRAFT: 'badge text-bg-light border' };
  function liveIds() {
    var s = {};
    document.querySelectorAll('[data-pr-live]').forEach(function (n) { s[n.getAttribute('data-pr-live')] = 1; });
    return Object.keys(s);
  }
  function pop(el) { el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }
  function ponNumero(box, clave, n) {
    var el = box.querySelector('[data-pr-live-n="' + clave + '"]'); if (!el) return false;
    var actual = parseInt(el.textContent, 10) || 0;
    var stat = el.closest('.prl-stat');
    if (stat && stat.hasAttribute('data-pr-live-hide0')) stat.classList.toggle('d-none', !n);
    if (actual === n) return false;
    el.textContent = n;
    if (stat) pop(stat); else pop(el);
    return true;
  }
  function filaRecip(r) {
    var cls = r.error ? 'is-err' : (r.sent_at ? 'is-sent' : 'is-wait');
    var ico = r.error ? 'fa-triangle-exclamation' : (r.sent_at ? 'fa-check' : 'fa-clock');
    var tit = r.error || (r.sent_at ? ('Enviada el ' + r.sent_at) : 'Pendiente de salir');
    return '<div class="pr-recip"><span class="pr-recip__st ' + cls + '" title="' + esc(tit) + '"><i class="fa ' + ico + '"></i></span>' +
      '<span class="pr-recip__who"><b>' + esc(r.name || r.email) + '</b>' + (r.media_name ? ' <span class="text-muted">· ' + esc(r.media_name) + '</span>' : '') +
      '<br><small class="text-muted">' + esc(r.email) + '</small></span>' +
      '<span class="pr-recip__icons">' +
      (r.opened ? '<span class="pr-recip__ico is-open" title="' + esc(r.opened_label || 'Abierta') + '"><i class="fa fa-envelope-open"></i></span>' : '') +
      (r.forwarded ? '<span class="pr-recip__ico is-fwd" title="' + esc(r.forwarded_label || 'Posiblemente reenviada') + '"><i class="fa fa-share"></i></span>' : '') +
      '</span></div>';
  }
  /* La lista de la ficha: si los destinatarios entraron por GRUPOS (Radio · Promotores · APM…), se
     repintan agrupados por esa etiqueta, igual que los pinta el servidor. */
  function pintaRecips(rows) {
    var box = document.querySelector('[data-pr-recips]'); if (!box) return;
    var conGrupo = rows.some(function (r) { return r.group_label; });
    var html = '';
    if (conGrupo) {
      var orden = [], porGrupo = {};
      rows.forEach(function (r) {
        var g = r.group_label || 'Otros';
        if (!porGrupo[g]) { porGrupo[g] = []; orden.push(g); }
        porGrupo[g].push(r);
      });
      orden.forEach(function (g) {
        var filas = porGrupo[g];
        html += '<div class="pr-recips__group"><i class="fa fa-tag me-1"></i>' + esc(g) + ' <span class="badge text-bg-light border ms-1">' + filas.length + '</span></div>';
        html += filas.slice(0, 60).map(filaRecip).join('');
        if (filas.length > 60) html += '<div class="small text-muted">… y ' + (filas.length - 60) + ' más (pincha en «enviados»).</div>';
      });
    } else {
      html = rows.slice(0, 40).map(filaRecip).join('');
      if (rows.length > 40) html += '<div class="small text-muted mt-1">… y ' + (rows.length - 40) + ' más (pincha en «enviados»).</div>';
    }
    box.innerHTML = html;
  }
  function liveTick() {
    if (document.hidden) return;
    var ids = liveIds(); if (!ids.length) return;
    var base = document.querySelector('[data-pr-stats-url]'); if (!base) return;
    fetch(base.getAttribute('data-pr-stats-url') + '?ids=' + encodeURIComponent(ids.join(',')), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); }).then(function (js) {
        if (!js || !js.ok) return;
        var cambio = false;
        Object.keys(js.stats || {}).forEach(function (id) {
          var st = js.stats[id];
          document.querySelectorAll('[data-pr-live="' + id + '"]').forEach(function (box) {
            ['sent', 'opened', 'pending', 'forwarded'].forEach(function (k) { if (ponNumero(box, k, st[k] || 0)) cambio = true; });
            var badge = box.querySelector('[data-pr-live-status]');
            if (badge && st.status && badge.textContent.trim() !== st.status_label) {
              badge.textContent = st.status_label; badge.className = ESTADO_CLS[st.status] || ESTADO_CLS.DRAFT; pop(badge); cambio = true;
            }
          });
        });
        var recips = document.querySelector('[data-pr-recips]');
        if (cambio && recips) fetch(recips.getAttribute('data-pr-recips')).then(function (r) { return r.json(); }).then(function (j2) { if (j2 && j2.ok) pintaRecips(j2.rows || []); }).catch(function () {});
      }).catch(function () {});
  }
  function initLive() {
    if (!document.querySelector('[data-pr-live]')) return;
    setInterval(liveTick, LIVE_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) liveTick(); });
  }

  function init() { document.querySelectorAll('[data-pr-wizard]').forEach(initWizard); initLive(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
