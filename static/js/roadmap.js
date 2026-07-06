/* Hoja de ruta v2 — panel de producción (Agenda / Logística / Hoteles / Personal).
   Render desde JSON embebido (#roadmapData) + CRUD por endpoints JSON /hoja-ruta/...
   Se carga al final de _roadmap_panel.html (antes que Bootstrap en el orden del DOM),
   por eso el arranque se difiere a DOMContentLoaded (window.bootstrap ya disponible). */
(function () {
  'use strict';

  function boot() {
    var root = document.getElementById('roadmapPanel');
    if (!root || root.dataset.rmBound === '1') return;
    root.dataset.rmBound = '1';

    var base = (root.getAttribute('data-base') || '').replace(/\/item$/, '');
    var CTX = {};
    try { CTX = JSON.parse(document.getElementById('roadmapData').textContent || '{}'); } catch (e) {}
    var P = CTX.payload || {};
    P.personnel = P.personnel || []; P.hotels = P.hotels || []; P.agenda = P.agenda || [];
    var DAYS = CTX.days || [];
    var KINDS = CTX.kinds || {};
    var ACT = CTX.activity_picker || [];
    var TRANS = CTX.transport_picker || [];
    var IVTYPES = CTX.interview_types || [];
    var SONGS = CTX.artist_songs || [];
    var isConcert = !!CTX.is_concert;
    var view = document.getElementById('rmView');
    var tab = 'agenda';
    var dragId = null;

    // ---------------------------------------------------------------- helpers
    function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
    function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
    function el(html) { var t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
    function ep(p) { return base + p; }
    function bs(id) { var e = document.getElementById(id); return (e && window.bootstrap) ? bootstrap.Modal.getOrCreateInstance(e) : null; }
    function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 220); }; }
    function postJson(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }); }); }
    function getJson(url) { return fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(function (r) { return r.json().catch(function () { return []; }); }); }
    function postForm(url, fd) { return fetch(url, { method: 'POST', headers: { 'X-CSRFToken': csrf() }, body: fd }).then(function (r) { return r.json().catch(function () { return {}; }); }); }
    function apply(resp) {
      if (resp && resp.ok) { P = resp.payload || P; P.personnel = P.personnel || []; P.hotels = P.hotels || []; P.agenda = P.agenda || []; DAYS = resp.days || DAYS; render(); return true; }
      alert((resp && resp.error) || 'No se pudo guardar.'); return false;
    }
    function agendaItem(id) { for (var i = 0; i < P.agenda.length; i++) if (String(P.agenda[i].id) === String(id)) return P.agenda[i]; return null; }
    function personById(id) { for (var i = 0; i < P.personnel.length; i++) if (String(P.personnel[i].id) === String(id)) return P.personnel[i]; return null; }
    function hotelById(id) { for (var i = 0; i < P.hotels.length; i++) if (String(P.hotels[i].id) === String(id)) return P.hotels[i]; return null; }
    function kindInfo(k) { return KINDS[k] || { label: k, icon: 'fa-circle', color: '#6c757d', transport: false }; }
    function timeLabel(it) { if (it.tbc) return '<span class="tbc">TBC</span>'; var s = it.start_time || '', e = it.end_time || ''; if (!s && !e) return '<span class="tbc">TBC</span>'; return esc(s) + (e ? ('–' + esc(e)) : ''); }
    function dayLabel(date) { for (var i = 0; i < DAYS.length; i++) if (DAYS[i].date === date) return DAYS[i].label; return date; }
    function avatar(url, icon) { return url ? '<img src="' + esc(url) + '" alt="">' : '<span class="noimg"><i class="fa ' + (icon || 'fa-user') + '"></i></span>'; }

    // ---------------------------------------------------------------- modales
    function ensureModal(id, size) {
      var m = document.getElementById(id);
      if (!m) {
        m = el('<div class="modal fade" id="' + id + '" tabindex="-1" aria-hidden="true"><div class="modal-dialog ' + (size || '') + ' modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"></div><div class="modal-footer"></div></div></div></div>');
        document.body.appendChild(m);
      }
      return m;
    }
    function openModal(id, size, title, bodyHtml, footerNodes) {
      var m = ensureModal(id, size);
      m.querySelector('.modal-title').textContent = title || '';
      var body = m.querySelector('.modal-body'); body.innerHTML = bodyHtml || '';
      var foot = m.querySelector('.modal-footer'); foot.innerHTML = '';
      (footerNodes || []).forEach(function (n) { foot.appendChild(n); });
      var inst = bs(id); if (inst) inst.show();
      return m;
    }
    function btn(label, cls, onclick) { var b = el('<button type="button" class="btn ' + cls + '">' + label + '</button>'); b.addEventListener('click', onclick); return b; }

    // ---------------------------------------------------------------- buscadores
    function attachSearch(input, results, fetcher, onPick, opts) {
      opts = opts || {};
      var run = debounce(function () {
        var q = input.value.trim();
        results.innerHTML = '';
        if (q.length < 2) { results.classList.add('d-none'); return; }
        fetcher(q).then(function (list) {
          results.innerHTML = '';
          (list || []).slice(0, 8).forEach(function (r) {
            var node = el('<div class="rm-result"></div>');
            node.innerHTML = avatar(r.logo_url, r.icon) + '<div><div>' + esc(r.label || r.name || '') + '</div>' + (r.sub ? '<div class="rm-sub">' + esc(r.sub) + '</div>' : '') + '</div>';
            node.addEventListener('click', function () { onPick(r); results.classList.add('d-none'); results.innerHTML = ''; });
            results.appendChild(node);
          });
          if (opts.onCreate) {
            var c = el('<div class="rm-result text-primary"><span class="noimg"><i class="fa fa-plus"></i></span><div>Crear «' + esc(q) + '»</div></div>');
            c.addEventListener('click', function () { opts.onCreate(q); results.classList.add('d-none'); results.innerHTML = ''; });
            results.appendChild(c);
          }
          results.classList.remove('d-none');
        });
      }, 240);
      input.addEventListener('input', run);
    }
    function searchPromoters(q) {
      return getJson('/api/search/promoters?q=' + encodeURIComponent(q)).then(function (list) {
        return (list || []).map(function (r) { return { id: r.id, label: r.label, logo_url: r.logo_url, sub: r.link_summary_text || '', email: r.contact_email, phone: r.contact_phone }; });
      });
    }
    function searchMedia(q) {
      return getJson('/api/vinculaciones/search?type=media&q=' + encodeURIComponent(q)).then(function (list) {
        return (list || []).map(function (r) { return { id: r.id, label: r.label, logo_url: r.logo_url, sub: r.subtitle || '' }; });
      });
    }
    function createPromoter(nick) {
      var fd = new FormData(); fd.append('nick', nick);
      return postForm('/api/promoters/create', fd);
    }
    function createMedia(name) {
      var fd = new FormData(); fd.append('name', name); fd.append('media_type', 'OTRO');
      return postForm('/api/media/create', fd);
    }

    // ================================================================ AGENDA
    function agendaByDay() {
      var map = {}; DAYS.forEach(function (d) { map[d.date] = []; });
      P.agenda.forEach(function (it) { (map[it.day] = map[it.day] || []).push(it); });
      Object.keys(map).forEach(function (d) {
        map[d].sort(function (a, b) {
          var ta = (a.tbc || !a.start_time) ? '99:99' : a.start_time;
          var tb = (b.tbc || !b.start_time) ? '99:99' : b.start_time;
          if (ta !== tb) return ta < tb ? -1 : 1;
          return (a.order || 0) - (b.order || 0);
        });
      });
      return map;
    }
    function renderAgenda() {
      var map = agendaByDay();
      var html = '<div class="rm-toolbar"><div class="text-muted small">Agenda de la actividad</div><button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir</button></div><div class="rm-agenda">';
      DAYS.forEach(function (d) { html += dayBlock(d, map[d.date] || []); });
      html += '</div>';
      view.innerHTML = html;
      view.querySelector('[data-add]').addEventListener('click', function () { openTypePicker(DAYS[0] ? DAYS[0].date : ''); });
      bindAgenda();
    }
    function dayBlock(d, items) {
      var head = '<div class="rm-dayhead"><div class="rm-cal"><span class="wd">' + esc(d.weekday) + '</span><span class="num">' + esc(d.day) + '</span><span class="mo">' + esc(d.month) + '</span></div><div class="lbl">' + esc(d.label) + '</div><button class="rm-add sm ms-auto" data-addday="' + esc(d.date) + '"><i class="fa fa-plus"></i></button></div>';
      var body = '<div class="rm-dayitems" data-day="' + esc(d.date) + '">';
      if (!items.length) body += '<div class="text-muted small px-2 py-1">Sin actividades</div>';
      items.forEach(function (it) { body += itemRow(it); });
      body += '</div>';
      return '<div class="rm-dayblock">' + head + body + '</div>';
    }
    function itemRow(it) {
      var ki = kindInfo(it.kind);
      var cls = 'rm-item' + (!it.confirmed ? ' provisional' : '') + (it.cancelled ? ' cancelled' : '');
      var tags = '';
      if (it.cancelled) tags += '<span class="rm-tag">Cancelado</span>';
      var sub = '';
      if (it.kind === 'ENTREVISTA' && it.interview) {
        if (it.interview.type) tags += '<span class="rm-tag">' + esc(it.interview.type) + '</span>';
        if (it.interview.live) tags += '<span class="rm-tag live">Directo</span>';
        if (it.interview.sings) tags += '<span class="rm-tag sing">Canta</span>';
        if (it.interview.media_name) sub = esc(it.interview.media_name);
      }
      var transLine = '';
      if (ki.transport && it.transport) {
        var t = it.transport;
        var route = [t.origin, t.destination].filter(Boolean).map(esc).join(' → ');
        var np = (t.passengers || []).length;
        transLine = '<div class="rm-transport-line">' + (t.logo_url ? '<img src="' + esc(t.logo_url) + '">' : '') + (t.company ? '<span>' + esc(t.company) + '</span>' : '') + (t.number ? '<span>' + esc(t.number) + '</span>' : '') + (route ? '<span>' + route + '</span>' : '') + (t.duration ? '<span>· ' + esc(t.duration) + '</span>' : '') + (np ? '<span>· <i class="fa fa-user-group"></i> ' + np + '</span>' : '') + '</div>';
        if (t.ends_next_day) tags += '<span class="rm-tag plus1">Fin +1</span>';
      }
      var meta = '';
      if ((it.attachments || []).length) meta += '<span title="Adjuntos"><i class="fa fa-paperclip"></i> ' + it.attachments.length + '</span>';
      if (it.note) meta += '<span title="Nota"><i class="fa fa-note-sticky"></i></span>';
      return '<div class="' + cls + '" draggable="true" data-item="' + esc(it.id) + '" style="--rm-line:' + esc(ki.color) + '">'
        + '<div class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></div>'
        + '<div><div class="rm-time">' + timeLabel(it) + '</div><div class="rm-title">' + esc(it.title || ki.label) + '</div>'
        + (it.location ? '<div class="rm-sub">' + esc(it.location) + '</div>' : '') + (sub ? '<div class="rm-sub">' + sub + '</div>' : '') + transLine
        + (tags ? '<div class="rm-tags">' + tags + '</div>' : '') + '</div>'
        + '<div class="rm-meta">' + meta + '</div></div>';
    }
    function bindAgenda() {
      view.querySelectorAll('[data-item]').forEach(function (node) {
        node.addEventListener('click', function () { if (node.classList.contains('dragging')) return; var it = agendaItem(node.getAttribute('data-item')); if (it) openDetail(it); });
        node.addEventListener('dragstart', function (e) { dragId = node.getAttribute('data-item'); node.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} });
        node.addEventListener('dragend', function () { node.classList.remove('dragging'); dragId = null; view.querySelectorAll('.rm-dragover').forEach(function (x) { x.classList.remove('rm-dragover'); }); });
      });
      view.querySelectorAll('[data-addday]').forEach(function (b) { b.addEventListener('click', function () { openTypePicker(b.getAttribute('data-addday')); }); });
      view.querySelectorAll('.rm-dayitems').forEach(function (zone) {
        zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.parentElement.classList.add('rm-dragover'); });
        zone.addEventListener('dragleave', function () { zone.parentElement.classList.remove('rm-dragover'); });
        zone.addEventListener('drop', function (e) { e.preventDefault(); zone.parentElement.classList.remove('rm-dragover'); if (dragId) dropItem(dragId, zone.getAttribute('data-day'), e.clientY, zone); });
      });
    }
    function dropItem(id, day, y, zone) {
      var it = agendaItem(id); if (!it) return;
      it.day = day;
      var rows = Array.prototype.slice.call(zone.querySelectorAll('[data-item]')).filter(function (n) { return n.getAttribute('data-item') !== id; });
      var idx = rows.length;
      for (var i = 0; i < rows.length; i++) { var r = rows[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { idx = i; break; } }
      var items = P.agenda.filter(function (x) { return x.day === day && x.id !== id; });
      items.splice(idx, 0, it);
      var moves = items.map(function (x, i) { return { id: x.id, day: day, order: i }; });
      postJson(ep('/item/move'), { moves: moves }).then(apply);
    }

    // ------------------------------------------------- selector de tipo (+)
    function openTypePicker(day) {
      var grid = '<div class="rm-choice-grid">';
      ACT.forEach(function (a) { grid += '<div class="rm-choice" data-kind="' + esc(a.key) + '"><i class="fa ' + esc(a.icon) + '" style="color:' + esc(a.color) + '"></i><span>' + esc(a.label) + '</span></div>'; });
      grid += '<div class="rm-choice" data-transport><i class="fa fa-route" style="color:#007ca2"></i><span>Traslado</span></div>';
      grid += '</div><div data-transgrid class="mt-3 d-none"><div class="text-muted small mb-1">Tipo de traslado</div><div class="rm-choice-grid">';
      TRANS.forEach(function (t) { grid += '<div class="rm-choice" data-kind="' + esc(t.key) + '"><i class="fa ' + esc(t.icon) + '" style="color:#007ca2"></i><span>' + esc(t.label) + '</span></div>'; });
      grid += '</div></div>';
      var m = openModal('rmTypeModal', 'modal-md', '¿Qué quieres añadir?', grid, []);
      m.querySelector('[data-transport]').addEventListener('click', function () { m.querySelector('[data-transgrid]').classList.remove('d-none'); });
      m.querySelectorAll('[data-kind]').forEach(function (c) {
        c.addEventListener('click', function () {
          var inst = bs('rmTypeModal'); if (inst) inst.hide();
          openItemEditor(newDraft(c.getAttribute('data-kind'), day));
        });
      });
    }
    function newDraft(kind, day) {
      var d = { id: '', kind: kind, day: day || (DAYS[0] ? DAYS[0].date : ''), start_time: '', end_time: '', tbc: false, confirmed: true, cancelled: false, title: '', location: '', note: '', contact: {}, attachments: [] };
      if (kind === 'ENTREVISTA') d.interview = { type: '', media_id: '', media_name: '', sings: false, live: false, songs: [] };
      if (kindInfo(kind).transport) d.transport = { mode: kind, company: '', logo_url: '', number: '', origin: '', destination: '', duration: '', ends_next_day: false, same_locator: false, locator_all: '', passengers: [] };
      return d;
    }

    // ------------------------------------------------- editor de item
    function openItemEditor(draft) {
      var ki = kindInfo(draft.kind);
      var editing = !!draft.id;
      var daysOpts = DAYS.map(function (d) { return '<option value="' + esc(d.date) + '"' + (d.date === draft.day ? ' selected' : '') + '>' + esc(d.label) + '</option>'; }).join('');
      var h = '';
      h += '<div class="row g-2">';
      h += '<div class="col-12"><label class="form-label">Título</label><input class="form-control" data-f="title" value="' + esc(draft.title) + '" placeholder="' + esc(ki.label) + '"></div>';
      h += '<div class="col-md-4"><label class="form-label">Día</label><select class="form-select" data-f="day">' + daysOpts + '</select></div>';
      h += '<div class="col-md-3"><label class="form-label">Inicio</label><input type="time" class="form-control" data-f="start_time" value="' + esc(draft.start_time) + '"></div>';
      h += '<div class="col-md-3"><label class="form-label">Fin</label><input type="time" class="form-control" data-f="end_time" value="' + esc(draft.end_time) + '"></div>';
      h += '<div class="col-md-2 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" data-f="tbc" id="rmTbc"' + (draft.tbc ? ' checked' : '') + '><label class="form-check-label" for="rmTbc">TBC</label></div></div>';
      h += '<div class="col-12"><label class="form-label">Lugar</label><input class="form-control" data-f="location" value="' + esc(draft.location) + '"></div>';
      h += '<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-f="confirmed" id="rmConf"' + (draft.confirmed ? ' checked' : '') + '><label class="form-check-label" for="rmConf">Confirmada (si no, se muestra como provisional)</label></div></div>';
      h += '</div>';

      // Entrevista
      if (draft.kind === 'ENTREVISTA') {
        var ivopts = '<option value="">Tipo…</option>' + IVTYPES.map(function (t) { return '<option' + (draft.interview.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
        h += '<hr><div class="fw-semibold mb-2">Entrevista</div><div class="row g-2">';
        h += '<div class="col-md-4"><select class="form-select" data-iv="type">' + ivopts + '</select></div>';
        h += '<div class="col-md-8"><div class="rm-chip mb-1' + (draft.interview.media_id ? '' : ' d-none') + '" data-media-chip>' + avatar(null) + '<span data-media-name>' + esc(draft.interview.media_name) + '</span><button type="button" class="btn-close btn-sm ms-1" data-media-clear></button></div><input class="form-control" placeholder="Buscar medio…" data-media-search><div class="list-group position-absolute d-none" style="z-index:5" data-media-results></div></div>';
        h += '<div class="col-md-6"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-iv="live" id="rmLive"' + (draft.interview.live ? ' checked' : '') + '><label class="form-check-label" for="rmLive">En directo</label></div></div>';
        h += '<div class="col-md-6"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-iv="sings" id="rmSings"' + (draft.interview.sings ? ' checked' : '') + '><label class="form-check-label" for="rmSings">Canta</label></div></div>';
        if (!isConcert) h += '<div class="col-12" data-songs-wrap' + (draft.interview.sings ? '' : ' hidden') + '><label class="form-label">Canciones (arrastra para ordenar)</label><input class="form-control mb-1" placeholder="Buscar canción…" data-song-search><div class="list-group position-absolute d-none" style="z-index:5" data-song-results></div><div data-songs class="d-flex flex-column gap-1"></div></div>';
        else h += '<input type="hidden" data-songs-disabled>';
        h += '</div>';
      }

      // Transporte
      if (ki.transport) {
        var t = draft.transport;
        h += '<hr><div class="fw-semibold mb-2">' + esc(ki.label) + '</div>';
        h += '<div class="alert alert-light border small py-2">Introduce los datos de la compañía a mano. La carga automática desde internet (compañía + nº) se añadirá más adelante.</div>';
        h += '<div class="row g-2">';
        h += '<div class="col-md-6"><label class="form-label">Compañía</label><input class="form-control" data-t="company" value="' + esc(t.company) + '"></div>';
        h += '<div class="col-md-6"><label class="form-label">Nº (vuelo/tren…)</label><input class="form-control" data-t="number" value="' + esc(t.number) + '"></div>';
        h += '<div class="col-md-6"><label class="form-label">Origen</label><input class="form-control" data-t="origin" value="' + esc(t.origin) + '"></div>';
        h += '<div class="col-md-6"><label class="form-label">Destino</label><input class="form-control" data-t="destination" value="' + esc(t.destination) + '"></div>';
        h += '<div class="col-md-6"><label class="form-label">Duración</label><input class="form-control" data-t="duration" value="' + esc(t.duration) + '" placeholder="1h 20m"></div>';
        h += '<div class="col-md-6"><label class="form-label">Logo compañía (URL)</label><input class="form-control" data-t="logo_url" value="' + esc(t.logo_url) + '"></div>';
        h += '<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-t="ends_next_day" id="rmPlus1"' + (t.ends_next_day ? ' checked' : '') + '><label class="form-check-label" for="rmPlus1">Termina al día siguiente (+1)</label></div></div>';
        h += '<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-t="same_locator" id="rmSameLoc"' + (t.same_locator ? ' checked' : '') + '><label class="form-check-label" for="rmSameLoc">Mismo localizador para todos</label></div><input class="form-control mt-1' + (t.same_locator ? '' : ' d-none') + '" data-t="locator_all" value="' + esc(t.locator_all) + '" placeholder="Localizador común"></div>';
        h += '<div class="col-12"><label class="form-label">Pasajeros</label><div data-pass></div><button type="button" class="rm-add sm" data-addpass><i class="fa fa-plus"></i> Añadir pasajero</button></div>';
        h += '</div>';
      }

      // Contacto
      h += '<hr><div class="fw-semibold mb-2">Contacto</div><div class="row g-2">';
      h += '<div class="col-12"><div class="rm-chip mb-1' + (draft.contact && draft.contact.name ? '' : ' d-none') + '" data-contact-chip><span data-contact-name>' + esc(draft.contact ? draft.contact.name : '') + '</span><button type="button" class="btn-close btn-sm ms-1" data-contact-clear></button></div><input class="form-control" placeholder="Buscar tercero…" data-contact-search><div class="list-group position-absolute d-none" style="z-index:5" data-contact-results></div></div>';
      h += '<div class="col-md-6"><input class="form-control form-control-sm" data-c="phone" value="' + esc(draft.contact ? draft.contact.phone || '' : '') + '" placeholder="Teléfono"></div>';
      h += '<div class="col-md-6"><input class="form-control form-control-sm" data-c="email" value="' + esc(draft.contact ? draft.contact.email || '' : '') + '" placeholder="Email"></div>';
      h += '</div>';

      // Nota + adjuntos
      h += '<hr><label class="form-label">Nota</label><textarea class="form-control" data-f="note" rows="2">' + esc(draft.note) + '</textarea>';
      if (editing) {
        h += '<div class="mt-2" data-atts></div><label class="btn btn-outline-secondary btn-sm mt-1"><i class="fa fa-paperclip"></i> Adjuntar archivo<input type="file" hidden data-attin></label>';
      }

      var save = btn('Guardar', 'btn-primary', function () { saveItem(draft, m); });
      var m = openModal('rmItemModal', 'modal-lg', (editing ? 'Editar' : 'Nueva') + ' · ' + ki.label, h, [btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmItemModal'); if (i) i.hide(); }), save]);

      // wire contacto
      var cChip = m.querySelector('[data-contact-chip]'), cName = m.querySelector('[data-contact-name]');
      attachSearch(m.querySelector('[data-contact-search]'), m.querySelector('[data-contact-results]'), searchPromoters, function (r) {
        draft.contact = { name: r.label, phone: r.phone || '', email: r.email || '', promoter_id: r.id };
        cName.textContent = r.label; cChip.classList.remove('d-none');
        m.querySelector('[data-c="phone"]').value = r.phone || ''; m.querySelector('[data-c="email"]').value = r.email || '';
      }, { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) { draft.contact = { name: r.label || q, promoter_id: r.id, phone: r.contact_phone || '', email: r.contact_email || '' }; cName.textContent = draft.contact.name; cChip.classList.remove('d-none'); } }); } });
      m.querySelector('[data-contact-clear]').addEventListener('click', function () { draft.contact = {}; cChip.classList.add('d-none'); });

      // wire entrevista
      if (draft.kind === 'ENTREVISTA') wireInterview(m, draft);
      // wire transporte
      if (ki.transport) wireTransport(m, draft);
      // wire adjuntos
      if (editing) { renderItemAtts(m, draft); m.querySelector('[data-attin]').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var fd = new FormData(); fd.append('scope', 'item'); fd.append('id', draft.id); fd.append('file', f); postForm(ep('/adjunto'), fd).then(function (resp) { if (resp && resp.ok) { var it = null; (resp.payload.agenda || []).forEach(function (x) { if (x.id === draft.id) it = x; }); if (it) { draft.attachments = it.attachments || []; renderItemAtts(m, draft); } P = resp.payload; DAYS = resp.days || DAYS; } }); }); }
    }
    function wireInterview(m, draft) {
      m.querySelector('[data-iv="type"]').addEventListener('change', function (e) { draft.interview.type = e.target.value; });
      m.querySelector('[data-iv="live"]').addEventListener('change', function (e) { draft.interview.live = e.target.checked; });
      var songsWrap = m.querySelector('[data-songs-wrap]');
      m.querySelector('[data-iv="sings"]').addEventListener('change', function (e) { draft.interview.sings = e.target.checked; if (songsWrap) songsWrap.hidden = !e.target.checked; });
      var chip = m.querySelector('[data-media-chip]'), mname = m.querySelector('[data-media-name]');
      attachSearch(m.querySelector('[data-media-search]'), m.querySelector('[data-media-results]'), searchMedia, function (r) {
        draft.interview.media_id = r.id; draft.interview.media_name = r.label; mname.textContent = r.label; chip.classList.remove('d-none');
      }, { onCreate: function (q) { createMedia(q).then(function (r) { if (r && r.id) { draft.interview.media_id = r.id; draft.interview.media_name = r.label || q; mname.textContent = draft.interview.media_name; chip.classList.remove('d-none'); } }); } });
      m.querySelector('[data-media-clear]').addEventListener('click', function () { draft.interview.media_id = ''; draft.interview.media_name = ''; chip.classList.add('d-none'); });
      if (songsWrap) {
        renderSongs(m, draft);
        attachSearch(m.querySelector('[data-song-search]'), m.querySelector('[data-song-results]'), function (q) {
          var lo = q.toLowerCase();
          return Promise.resolve(SONGS.filter(function (s) { return (s.title || '').toLowerCase().indexOf(lo) >= 0; }).map(function (s) { return { id: s.id, label: s.title, logo_url: s.cover_url }; }));
        }, function (r) {
          if (draft.interview.songs.some(function (s) { return s.song_id === r.id; })) return;
          draft.interview.songs.push({ song_id: r.id, title: r.label, cover_url: r.logo_url || '' }); renderSongs(m, draft);
        });
      }
    }
    function renderSongs(m, draft) {
      var wrap = m.querySelector('[data-songs]'); if (!wrap) return;
      wrap.innerHTML = '';
      draft.interview.songs.forEach(function (s, i) {
        var row = el('<div class="rm-song" draggable="true" data-idx="' + i + '"><span class="h"><i class="fa fa-grip-vertical"></i></span>' + (s.cover_url ? '<img src="' + esc(s.cover_url) + '">' : '') + '<div class="flex-grow-1">' + esc(s.title) + '</div><button type="button" class="btn-close btn-sm"></button></div>');
        row.querySelector('.btn-close').addEventListener('click', function () { draft.interview.songs.splice(i, 1); renderSongs(m, draft); });
        row.addEventListener('dragstart', function (e) { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', i); });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) { e.preventDefault(); var from = parseInt(e.dataTransfer.getData('text/plain'), 10); var to = i; if (isNaN(from) || from === to) return; var arr = draft.interview.songs; var mv = arr.splice(from, 1)[0]; arr.splice(to, 0, mv); renderSongs(m, draft); });
        wrap.appendChild(row);
      });
    }
    function wireTransport(m, draft) {
      var same = m.querySelector('[data-t="same_locator"]'); var lall = m.querySelector('[data-t="locator_all"]');
      same.addEventListener('change', function () { lall.classList.toggle('d-none', !same.checked); });
      renderPassengers(m, draft);
      m.querySelector('[data-addpass]').addEventListener('click', function () { openPassengerPicker(draft, function () { renderPassengers(m, draft); }); });
    }
    function renderPassengers(m, draft) {
      var wrap = m.querySelector('[data-pass]'); if (!wrap) return; wrap.innerHTML = '';
      var editing = !!draft.id;
      draft.transport.passengers.forEach(function (p, i) {
        var per = personById(p.personnel_id);
        var name = per ? per.name : (p.name || '—');
        var row = el('<div class="rm-pass"><div><div class="fw-semibold">' + esc(name) + '</div><input class="form-control form-control-sm mt-1" data-loc="' + i + '" value="' + esc(p.locator || '') + '" placeholder="Localizador"></div><div class="text-end"></div></div>');
        var right = row.querySelector('.text-end');
        if (editing) {
          if (p.ticket_url) right.innerHTML = '<a class="rm-att" href="' + esc(p.ticket_url) + '" target="_blank"><i class="fa fa-download"></i> Billete</a>';
          var lbl = el('<label class="btn btn-outline-secondary btn-sm mt-1 d-block"><i class="fa fa-ticket"></i> Billete<input type="file" hidden></label>');
          lbl.querySelector('input').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var fd = new FormData(); fd.append('scope', 'passenger'); fd.append('id', draft.id); fd.append('passenger_index', i); fd.append('file', f); postForm(ep('/adjunto'), fd).then(function (resp) { if (resp && resp.ok) { P = resp.payload; DAYS = resp.days || DAYS; var it = agendaItem(draft.id); if (it) { draft.transport = it.transport; renderPassengers(m, draft); } } }); });
          right.appendChild(lbl);
        }
        row.querySelector('[data-loc]').addEventListener('input', function (e) { draft.transport.passengers[i].locator = e.target.value; });
        var del = el('<button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2">Quitar</button>');
        del.addEventListener('click', function () { draft.transport.passengers.splice(i, 1); renderPassengers(m, draft); });
        right.appendChild(del);
        wrap.appendChild(row);
      });
      if (!draft.id && draft.transport.passengers.length) wrap.appendChild(el('<div class="text-muted small">Guarda el traslado para adjuntar billetes.</div>'));
    }
    function openPassengerPicker(draft, done) {
      var existing = P.personnel.map(function (p) { return '<div class="rm-result" data-pid="' + esc(p.id) + '">' + avatar(p.photo_url) + '<div><div>' + esc(p.name) + '</div>' + (p.role ? '<div class="rm-sub">' + esc(p.role) + '</div>' : '') + '</div></div>'; }).join('') || '<div class="text-muted small">Aún no hay personal.</div>';
      var h = '<div class="text-muted small mb-1">Personal ya en la hoja de ruta</div>' + existing
        + '<hr><div class="text-muted small mb-1">Añadir tercero nuevo</div><input class="form-control" placeholder="Buscar tercero…" data-newsearch><div class="list-group position-absolute d-none" style="z-index:5" data-newresults>'
        + '</div><div class="mt-2"><input class="form-control form-control-sm mb-1" data-mname placeholder="…o nombre manual"><input class="form-control form-control-sm mb-1" data-mrole placeholder="Función"><button type="button" class="btn btn-outline-primary btn-sm" data-maddmanual>Añadir manual</button></div>';
      var m2 = openModal('rmPassModal', 'modal-md', 'Añadir pasajero', h, []);
      function addPassenger(personId) { draft.transport.passengers.push({ personnel_id: personId, locator: '', ticket_url: '', ticket_name: '' }); var i = bs('rmPassModal'); if (i) i.hide(); done(); }
      m2.querySelectorAll('[data-pid]').forEach(function (n) { n.addEventListener('click', function () { addPassenger(n.getAttribute('data-pid')); }); });
      attachSearch(m2.querySelector('[data-newsearch]'), m2.querySelector('[data-newresults]'), searchPromoters, function (r) {
        savePerson({ kind: 'PROMOTER', ref_id: r.id, name: r.label, phone: r.phone || '', email: r.email || '', photo_url: r.logo_url || '' }).then(function (pid) { if (pid) addPassenger(pid); });
      }, { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) savePerson({ kind: 'PROMOTER', ref_id: r.id, name: r.label || q }).then(function (pid) { if (pid) addPassenger(pid); }); }); } });
      m2.querySelector('[data-maddmanual]').addEventListener('click', function () {
        var nm = m2.querySelector('[data-mname]').value.trim(); if (!nm) return;
        savePerson({ kind: 'MANUAL', name: nm, role: m2.querySelector('[data-mrole]').value.trim() }).then(function (pid) { if (pid) addPassenger(pid); });
      });
    }
    // Guarda una persona en el payload y devuelve su id (sin re-render global aquí).
    function savePerson(data) {
      return postJson(ep('/personal'), data).then(function (resp) { if (resp && resp.ok) { P = resp.payload; P.personnel = P.personnel || []; DAYS = resp.days || DAYS; return resp.person_id; } alert((resp && resp.error) || 'No se pudo añadir.'); return null; });
    }
    function renderItemAtts(m, draft) {
      var box = m.querySelector('[data-atts]'); if (!box) return; box.innerHTML = '';
      (draft.attachments || []).forEach(function (a) {
        var chip = el('<span class="rm-att"><a href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a> <button type="button" class="btn-close btn-sm"></button></span>');
        chip.querySelector('.btn-close').addEventListener('click', function () { postJson(ep('/adjunto/delete'), { scope: 'item', id: draft.id, attachment_id: a.id }).then(function (resp) { if (resp && resp.ok) { P = resp.payload; DAYS = resp.days || DAYS; var it = agendaItem(draft.id); if (it) { draft.attachments = it.attachments || []; renderItemAtts(m, draft); } } }); });
        box.appendChild(chip);
      });
    }
    function saveItem(draft, m) {
      draft.title = m.querySelector('[data-f="title"]').value.trim();
      draft.day = m.querySelector('[data-f="day"]').value;
      draft.start_time = m.querySelector('[data-f="start_time"]').value;
      draft.end_time = m.querySelector('[data-f="end_time"]').value;
      draft.tbc = m.querySelector('[data-f="tbc"]').checked;
      draft.confirmed = m.querySelector('[data-f="confirmed"]').checked;
      draft.location = m.querySelector('[data-f="location"]').value.trim();
      draft.note = m.querySelector('[data-f="note"]').value.trim();
      draft.contact = draft.contact || {};
      draft.contact.phone = m.querySelector('[data-c="phone"]').value.trim();
      draft.contact.email = m.querySelector('[data-c="email"]').value.trim();
      if (kindInfo(draft.kind).transport) {
        var t = draft.transport;
        ['company', 'number', 'origin', 'destination', 'duration', 'logo_url', 'locator_all'].forEach(function (f) { t[f] = m.querySelector('[data-t="' + f + '"]').value.trim(); });
        t.ends_next_day = m.querySelector('[data-t="ends_next_day"]').checked;
        t.same_locator = m.querySelector('[data-t="same_locator"]').checked;
      }
      var i = bs('rmItemModal'); if (i) i.hide();
      postJson(ep('/item'), draft).then(apply);
    }

    // ------------------------------------------------- detalle de item
    function openDetail(it) {
      var ki = kindInfo(it.kind);
      var h = '<div class="d-flex align-items-center gap-2 mb-2"><span class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></span><div><div class="fw-bold">' + esc(it.title || ki.label) + '</div><div class="rm-sub">' + esc(dayLabel(it.day)) + ' · ' + timeLabel(it) + '</div></div></div>';
      if (!it.confirmed) h += '<div class="rm-tag tbc mb-2 d-inline-block">Provisional</div> ';
      if (it.cancelled) h += '<div class="rm-tag mb-2 d-inline-block">Cancelada</div>';
      if (it.location) h += '<div class="mb-1"><i class="fa fa-location-dot text-muted"></i> ' + esc(it.location) + '</div>';
      if (it.kind === 'ENTREVISTA' && it.interview) {
        h += '<div class="mb-1">';
        if (it.interview.media_name) h += '<span class="rm-tag">' + esc(it.interview.media_name) + '</span> ';
        if (it.interview.type) h += '<span class="rm-tag">' + esc(it.interview.type) + '</span> ';
        if (it.interview.live) h += '<span class="rm-tag live">Directo</span> ';
        if (it.interview.sings) h += '<span class="rm-tag sing">Canta</span>';
        h += '</div>';
        if ((it.interview.songs || []).length) h += '<div class="rm-sub">Repertorio: ' + it.interview.songs.map(function (s) { return esc(s.title); }).join(', ') + '</div>';
      }
      if (ki.transport && it.transport) {
        var t = it.transport;
        h += '<div class="rm-transport-line">' + (t.logo_url ? '<img src="' + esc(t.logo_url) + '">' : '') + [t.company, t.number, [t.origin, t.destination].filter(Boolean).join(' → '), t.duration].filter(Boolean).map(esc).join(' · ') + (t.ends_next_day ? ' <span class="rm-tag plus1">+1</span>' : '') + '</div>';
        (t.passengers || []).forEach(function (p) { var per = personById(p.personnel_id); h += '<div class="rm-sub"><i class="fa fa-user"></i> ' + esc(per ? per.name : '—') + (p.locator || t.locator_all ? ' · Loc: ' + esc(t.same_locator ? t.locator_all : p.locator) : '') + (p.ticket_url ? ' · <a href="' + esc(p.ticket_url) + '" target="_blank">Billete</a>' : '') + '</div>'; });
      }
      if (it.contact && (it.contact.name || it.contact.phone || it.contact.email)) h += '<div class="mt-2 rm-sub"><i class="fa fa-address-card"></i> ' + [it.contact.name, it.contact.phone, it.contact.email].filter(Boolean).map(esc).join(' · ') + '</div>';
      if (it.note) h += '<div class="alert alert-warning mt-2 mb-0 py-2"><i class="fa fa-note-sticky"></i> ' + esc(it.note) + '</div>';
      if ((it.attachments || []).length) { h += '<div class="mt-2">'; it.attachments.forEach(function (a) { h += '<a class="rm-att" href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a>'; }); h += '</div>'; }

      var foot = [
        btn('Editar', 'btn-outline-primary', function () { var i = bs('rmDetailModal'); if (i) i.hide(); openItemEditor(JSON.parse(JSON.stringify(it))); }),
        btn(it.confirmed ? 'Marcar provisional' : 'Confirmar', 'btn-outline-secondary', function () { postJson(ep('/item/toggle'), { id: it.id, field: 'confirmed', value: !it.confirmed }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); }),
        btn(it.cancelled ? 'Reactivar' : 'Cancelar', 'btn-outline-warning', function () { postJson(ep('/item/toggle'), { id: it.id, field: 'cancelled', value: !it.cancelled }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); }),
        btn('Eliminar', 'btn-outline-danger', function () { if (!confirm('¿Eliminar esta actividad?')) return; postJson(ep('/item/delete'), { id: it.id }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); })
      ];
      openModal('rmDetailModal', 'modal-md', ki.label, h, foot);
    }

    // ================================================================ LOGÍSTICA
    function renderLogistica() {
      var items = P.agenda.filter(function (it) { return kindInfo(it.kind).transport; });
      items.sort(function (a, b) { if (a.day !== b.day) return a.day < b.day ? -1 : 1; return (a.start_time || '99') < (b.start_time || '99') ? -1 : 1; });
      var grid = '<div class="rm-choice-grid mb-2">' + TRANS.map(function (t) { return '<div class="rm-choice" data-mode="' + esc(t.key) + '"><i class="fa ' + esc(t.icon) + '" style="color:#007ca2"></i><span>' + esc(t.label) + '</span></div>'; }).join('') + '</div>';
      var html = '<div class="rm-toolbar"><div class="text-muted small">Traslados</div></div>';
      html += '<div class="card mb-3"><div class="card-body py-2"><div class="small text-muted mb-1">Añadir traslado</div>' + grid + '</div></div>';
      html += '<div class="d-flex flex-column gap-2">';
      if (!items.length) html += '<div class="rm-empty">Sin traslados todavía.</div>';
      items.forEach(function (it) { html += '<div data-item="' + esc(it.id) + '">' + itemRow(it) + '</div>'; });
      html += '</div>';
      view.innerHTML = html;
      view.querySelectorAll('[data-mode]').forEach(function (c) { c.addEventListener('click', function () { openItemEditor(newDraft(c.getAttribute('data-mode'), DAYS[0] ? DAYS[0].date : '')); }); });
      view.querySelectorAll('.rm-item').forEach(function (node) { node.addEventListener('click', function () { var host = node.closest('[data-item]'); var it = agendaItem(host.getAttribute('data-item')); if (it) openDetail(it); }); });
    }

    // ================================================================ HOTELES
    function renderHoteles() {
      var html = '<div class="rm-toolbar"><div class="text-muted small">Alojamientos</div><button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir hotel</button></div>';
      html += '<div class="d-flex flex-column gap-2">';
      if (!P.hotels.length) html += '<div class="rm-empty">Sin hoteles todavía.</div>';
      P.hotels.forEach(function (ho) { html += hotelCard(ho); });
      html += '</div>';
      view.innerHTML = html;
      view.querySelector('[data-add]').addEventListener('click', function () { openHotelEditor(newHotel()); });
      view.querySelectorAll('[data-hedit]').forEach(function (b) { b.addEventListener('click', function () { openHotelEditor(JSON.parse(JSON.stringify(hotelById(b.getAttribute('data-hedit'))))); }); });
      view.querySelectorAll('[data-hdel]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('¿Eliminar este hotel?')) return; postJson(ep('/hotel/delete'), { id: b.getAttribute('data-hdel') }).then(apply); }); });
    }
    function newHotel() { return { id: '', name: '', stars: 0, photo_url: '', address: '', phone: '', email: '', days: [], for_all: true, assignee_ids: [], note: '', attachments: [] }; }
    function hotelCard(ho) {
      var stars = ho.stars ? '<span class="rm-stars">' + Array(ho.stars + 1).join('★') + '</span>' : '';
      var whoNames = ho.for_all ? 'Todo el equipo' : (ho.assignee_ids || []).map(function (id) { var p = personById(id); return p ? p.name : ''; }).filter(Boolean).join(', ');
      var daysTxt = (ho.days || []).map(function (d) { return dayLabel(d); }).join(' · ');
      var atts = (ho.attachments || []).map(function (a) { return '<a class="rm-att" href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a>'; }).join('');
      return '<div class="rm-hotel">'
        + '<img class="ph" src="' + esc(ho.photo_url || '') + '" onerror="this.style.visibility=\'hidden\'">'
        + '<div class="flex-grow-1"><div class="fw-bold">' + esc(ho.name || 'Hotel') + ' ' + stars + '</div>'
        + (ho.address ? '<div class="rm-sub"><i class="fa fa-location-dot"></i> ' + esc(ho.address) + '</div>' : '')
        + ((ho.phone || ho.email) ? '<div class="rm-sub">' + [ho.phone, ho.email].filter(Boolean).map(esc).join(' · ') + '</div>' : '')
        + (daysTxt ? '<div class="rm-sub"><i class="fa fa-calendar"></i> ' + esc(daysTxt) + '</div>' : '')
        + '<div class="rm-sub"><i class="fa fa-users"></i> ' + esc(whoNames || '—') + '</div>'
        + (ho.note ? '<div class="rm-sub"><i class="fa fa-note-sticky"></i> ' + esc(ho.note) + '</div>' : '')
        + (atts ? '<div class="mt-1">' + atts + '</div>' : '')
        + '</div>'
        + '<div class="dropdown rm-menu"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-hedit="' + esc(ho.id) + '">Editar</button></li><li><button class="dropdown-item text-danger" data-hdel="' + esc(ho.id) + '">Eliminar</button></li></ul></div>'
        + '</div>';
    }
    function openHotelEditor(ho) {
      var editing = !!ho.id;
      var starOpts = [0, 1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (ho.stars === n ? ' selected' : '') + '>' + (n ? n + ' ★' : 'Sin categoría') + '</option>'; }).join('');
      var daysChecks = DAYS.map(function (d) { return '<label class="me-2"><input type="checkbox" data-hday value="' + esc(d.date) + '"' + ((ho.days || []).indexOf(d.date) >= 0 ? ' checked' : '') + '> ' + esc(d.label) + '</label>'; }).join('');
      var peopleChecks = P.personnel.map(function (p) { return '<label class="me-2 d-inline-block"><input type="checkbox" data-hwho value="' + esc(p.id) + '"' + ((ho.assignee_ids || []).indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') || '<span class="text-muted small">Sin personal aún.</span>';
      var h = '<div class="alert alert-light border small py-2">Introduce los datos del hotel a mano (nombre, estrellas, foto, dirección, teléfono, email). La búsqueda automática en internet se añadirá más adelante.</div>';
      h += '<div class="row g-2">';
      h += '<div class="col-md-8"><label class="form-label">Nombre</label><input class="form-control" data-h="name" value="' + esc(ho.name) + '"></div>';
      h += '<div class="col-md-4"><label class="form-label">Categoría</label><select class="form-select" data-h="stars">' + starOpts + '</select></div>';
      h += '<div class="col-12"><label class="form-label">Foto (URL)</label><input class="form-control" data-h="photo_url" value="' + esc(ho.photo_url) + '"></div>';
      h += '<div class="col-12"><label class="form-label">Dirección</label><input class="form-control" data-h="address" value="' + esc(ho.address) + '"></div>';
      h += '<div class="col-md-6"><label class="form-label">Teléfono</label><input class="form-control" data-h="phone" value="' + esc(ho.phone) + '"></div>';
      h += '<div class="col-md-6"><label class="form-label">Email</label><input class="form-control" data-h="email" value="' + esc(ho.email) + '"></div>';
      h += '<div class="col-12"><label class="form-label">Días</label><div>' + daysChecks + '</div></div>';
      h += '<div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-h="for_all" id="rmHforall"' + (ho.for_all ? ' checked' : '') + '><label class="form-check-label" for="rmHforall">Para todo el equipo</label></div><div data-whowrap class="' + (ho.for_all ? 'd-none' : '') + '"><label class="form-label">Miembros</label><div>' + peopleChecks + '</div></div></div>';
      h += '<div class="col-12"><label class="form-label">Nota</label><textarea class="form-control" data-h="note" rows="2">' + esc(ho.note) + '</textarea></div>';
      h += '</div>';
      if (editing) h += '<div class="mt-2" data-hatts></div><label class="btn btn-outline-secondary btn-sm mt-1"><i class="fa fa-paperclip"></i> Adjuntar archivo<input type="file" hidden data-hattin></label>';
      var m = openModal('rmHotelModal', 'modal-lg', (editing ? 'Editar' : 'Nuevo') + ' hotel', h, [btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmHotelModal'); if (i) i.hide(); }), btn('Guardar', 'btn-primary', function () { saveHotel(ho, m); })]);
      var forall = m.querySelector('[data-h="for_all"]'); forall.addEventListener('change', function () { m.querySelector('[data-whowrap]').classList.toggle('d-none', forall.checked); });
      if (editing) { renderHotelAtts(m, ho); m.querySelector('[data-hattin]').addEventListener('change', function (e) { var f = e.target.files[0]; if (!f) return; var fd = new FormData(); fd.append('scope', 'hotel'); fd.append('id', ho.id); fd.append('file', f); postForm(ep('/adjunto'), fd).then(function (resp) { if (resp && resp.ok) { P = resp.payload; DAYS = resp.days || DAYS; var hh = hotelById(ho.id); if (hh) { ho.attachments = hh.attachments || []; renderHotelAtts(m, ho); } } }); }); }
    }
    function renderHotelAtts(m, ho) {
      var box = m.querySelector('[data-hatts]'); if (!box) return; box.innerHTML = '';
      (ho.attachments || []).forEach(function (a) {
        var chip = el('<span class="rm-att"><a href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a> <button type="button" class="btn-close btn-sm"></button></span>');
        chip.querySelector('.btn-close').addEventListener('click', function () { postJson(ep('/adjunto/delete'), { scope: 'hotel', id: ho.id, attachment_id: a.id }).then(function (resp) { if (resp && resp.ok) { P = resp.payload; DAYS = resp.days || DAYS; var hh = hotelById(ho.id); if (hh) { ho.attachments = hh.attachments || []; renderHotelAtts(m, ho); } } }); });
        box.appendChild(chip);
      });
    }
    function saveHotel(ho, m) {
      ho.name = m.querySelector('[data-h="name"]').value.trim();
      ho.stars = parseInt(m.querySelector('[data-h="stars"]').value, 10) || 0;
      ho.photo_url = m.querySelector('[data-h="photo_url"]').value.trim();
      ho.address = m.querySelector('[data-h="address"]').value.trim();
      ho.phone = m.querySelector('[data-h="phone"]').value.trim();
      ho.email = m.querySelector('[data-h="email"]').value.trim();
      ho.note = m.querySelector('[data-h="note"]').value.trim();
      ho.for_all = m.querySelector('[data-h="for_all"]').checked;
      ho.days = Array.prototype.slice.call(m.querySelectorAll('[data-hday]:checked')).map(function (c) { return c.value; });
      ho.assignee_ids = ho.for_all ? [] : Array.prototype.slice.call(m.querySelectorAll('[data-hwho]:checked')).map(function (c) { return c.value; });
      if (!ho.name && !ho.address) { alert('Indica al menos el nombre o la dirección.'); return; }
      var i = bs('rmHotelModal'); if (i) i.hide();
      postJson(ep('/hotel'), ho).then(apply);
    }

    // ================================================================ PERSONAL
    function renderPersonal() {
      var groups = {};
      P.personnel.forEach(function (p) { var g = (p.role || 'Sin función').trim() || 'Sin función'; (groups[g] = groups[g] || []).push(p); });
      var html = '<div class="rm-toolbar"><div class="text-muted small">Personal de la actividad</div><button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir</button></div>';
      if (!P.personnel.length) html += '<div class="rm-empty">Sin personal todavía.</div>';
      Object.keys(groups).sort().forEach(function (g) {
        html += '<div class="rm-group-title">' + esc(g) + '</div><div class="d-flex flex-column gap-2">';
        groups[g].forEach(function (p) {
          html += '<div class="rm-person"><span class="av">' + avatar(p.photo_url) + '</span><div class="flex-grow-1"><div class="nm">' + esc(p.name) + '</div><div class="rl">' + esc(p.role || '') + '</div></div><div class="ct text-end">' + (p.phone ? '<div>' + esc(p.phone) + '</div>' : '') + (p.email ? '<div>' + esc(p.email) + '</div>' : '') + '</div><div class="dropdown ms-2"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-pedit="' + esc(p.id) + '">Editar</button></li><li><button class="dropdown-item text-danger" data-pdel="' + esc(p.id) + '">Eliminar</button></li></ul></div></div>';
        });
        html += '</div>';
      });
      view.innerHTML = html;
      view.querySelector('[data-add]').addEventListener('click', function () { openPersonEditor({ id: '', kind: 'MANUAL', ref_id: '', name: '', role: '', phone: '', email: '', photo_url: '' }); });
      view.querySelectorAll('[data-pedit]').forEach(function (b) { b.addEventListener('click', function () { openPersonEditor(JSON.parse(JSON.stringify(personById(b.getAttribute('data-pedit'))))); }); });
      view.querySelectorAll('[data-pdel]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('¿Eliminar del personal?')) return; postJson(ep('/personal/delete'), { id: b.getAttribute('data-pdel') }).then(apply); }); });
    }
    function openPersonEditor(p) {
      var editing = !!p.id;
      var h = '<div class="row g-2">';
      if (!editing) h += '<div class="col-12"><label class="form-label">Buscar tercero (opcional)</label><input class="form-control" placeholder="Buscar tercero…" data-psearch><div class="list-group position-absolute d-none" style="z-index:5" data-presults></div></div>';
      h += '<div class="col-md-8"><label class="form-label">Nombre</label><input class="form-control" data-p="name" value="' + esc(p.name) + '"></div>';
      h += '<div class="col-md-4"><label class="form-label">Función</label><input class="form-control" data-p="role" value="' + esc(p.role) + '" placeholder="Músico, Tour manager…"></div>';
      h += '<div class="col-md-6"><label class="form-label">Teléfono</label><input class="form-control" data-p="phone" value="' + esc(p.phone) + '"></div>';
      h += '<div class="col-md-6"><label class="form-label">Email</label><input class="form-control" data-p="email" value="' + esc(p.email) + '"></div>';
      h += '</div>';
      var m = openModal('rmPersonModal', 'modal-md', (editing ? 'Editar' : 'Nuevo') + ' personal', h, [btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPersonModal'); if (i) i.hide(); }), btn('Guardar', 'btn-primary', function () { savePersonForm(p, m); })]);
      if (!editing) attachSearch(m.querySelector('[data-psearch]'), m.querySelector('[data-presults]'), searchPromoters, function (r) {
        p.kind = 'PROMOTER'; p.ref_id = r.id; p.photo_url = r.logo_url || '';
        m.querySelector('[data-p="name"]').value = r.label; m.querySelector('[data-p="phone"]').value = r.phone || ''; m.querySelector('[data-p="email"]').value = r.email || '';
      }, { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) { p.kind = 'PROMOTER'; p.ref_id = r.id; m.querySelector('[data-p="name"]').value = r.label || q; } }); } });
    }
    function savePersonForm(p, m) {
      p.name = m.querySelector('[data-p="name"]').value.trim();
      p.role = m.querySelector('[data-p="role"]').value.trim();
      p.phone = m.querySelector('[data-p="phone"]').value.trim();
      p.email = m.querySelector('[data-p="email"]').value.trim();
      if (!p.name) { alert('Falta el nombre.'); return; }
      var i = bs('rmPersonModal'); if (i) i.hide();
      postJson(ep('/personal'), p).then(apply);
    }

    // ---------------------------------------------------------------- init
    function render() { if (tab === 'agenda') renderAgenda(); else if (tab === 'logistica') renderLogistica(); else if (tab === 'hoteles') renderHoteles(); else renderPersonal(); }
    root.querySelectorAll('[data-rm-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-rm-tab'); root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); }); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
