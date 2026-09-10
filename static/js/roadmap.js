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
    P.rooms_pool = P.rooms_pool || [];   // habitaciones ya formadas que todavía no tienen hotel
    var DAYS = CTX.days || [];
    var KINDS = CTX.kinds || {};
    var ACT = CTX.activity_picker || [];
    var TRANS = CTX.transport_picker || [];
    var IVTYPES = CTX.interview_types || [];
    var SONGS = CTX.artist_songs || [];
    var isConcert = !!CTX.is_concert;
    var RO = (root.getAttribute('data-readonly') === '1');   // modo solo lectura (enlace público)
    var BASE_DAYS = CTX.base_days || [];                      // días del evento (no se pueden quitar)
    var IS_TEMPLATE = !!CTX.is_template;
    var DOORS = CTX.doors_time || '';   // la hora de apertura de puertas que ya dice la ficha
    // PERSONAL: qué datos se pueden ver, los que se ven ahora y las funciones que se sugieren.
    var PERSON_FIELDS = CTX.person_fields || [];
    var PERSON_COLS = CTX.person_cols || ['role', 'phone', 'email'];
    var PERSON_ROLES = CTX.roles || [];
    var view = document.getElementById('rmView');
    // Pestaña de arranque: la primera que exista (una plantilla de personal solo tiene «personal»).
    var TABS = (CTX.tabs && CTX.tabs.length) ? CTX.tabs : ['agenda', 'logistica', 'hoteles', 'personal'];
    var tab = TABS[0];
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
      if (resp && resp.ok) { P = resp.payload || P; P.personnel = P.personnel || []; P.hotels = P.hotels || []; P.agenda = P.agenda || []; P.rooms_pool = P.rooms_pool || []; DAYS = resp.days || DAYS; render(); return true; }
      alert((resp && resp.error) || 'No se pudo guardar.'); return false;
    }
    function agendaItem(id) { for (var i = 0; i < P.agenda.length; i++) if (String(P.agenda[i].id) === String(id)) return P.agenda[i]; return null; }
    function personById(id) { for (var i = 0; i < P.personnel.length; i++) if (String(P.personnel[i].id) === String(id)) return P.personnel[i]; return null; }
    function hotelById(id) { for (var i = 0; i < P.hotels.length; i++) if (String(P.hotels[i].id) === String(id)) return P.hotels[i]; return null; }
    function kindInfo(k) { return KINDS[k] || { label: k, icon: 'fa-circle', color: '#6c757d', transport: false }; }
    function timeLabel(it) { if (it.tbc) return '<span class="tbc">TBC</span>'; var s = it.start_time || '', e = it.end_time || ''; if (!s && !e) return '<span class="tbc">TBC</span>'; return esc(s) + (e ? ('–' + esc(e)) : ''); }
    function dayLabel(date) { for (var i = 0; i < DAYS.length; i++) if (DAYS[i].date === date) return DAYS[i].label; return date; }
    function avatar(url, icon) { return url ? '<img src="' + esc(url) + '" alt="">' : '<span class="noimg"><i class="fa ' + (icon || 'fa-user') + '"></i></span>'; }
    // ⚠️ Para buscar hay que normalizar LOS DOS lados (sin acentos ni mayúsculas): si no, «nus» no
    // encuentra a «Ñus» (el bug que ya salió en el reporte de ventas).
    function normText(s) {
      return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function fechaEs(iso) {
      var p = String(iso || '').slice(0, 10).split('-');
      return (p.length === 3) ? (p[2] + '/' + p[1] + '/' + p[0]) : String(iso || '');
    }

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
    /* Quien puede ir en una hoja de ruta: la oficina (USER), los integrantes de los artistas y los
       terceros (PROMOTER). El `kind` lo decide el SERVIDOR: es el que espera el personal. */
    function searchRoadmapPeople(q) {
      return getJson('/api/hoja-ruta/personas?q=' + encodeURIComponent(q));
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

    // ============================================================ PLANTILLAS DEL ARTISTA
    // Cargar una plantilla (personal / rooming / hoja de ruta) en esta actividad, o guardar lo que hay
    // ahora COMO plantilla del artista. En el editor de una plantilla el botón no sale (IS_TPL).
    var IS_TPL = !!CTX.is_template;
    function tplBtn(kind) {
      if (RO || IS_TPL) return '';
      return '<button class="btn btn-sm btn-outline-secondary" data-tpl-open="' + kind + '" title="Plantillas del artista"><i class="fa fa-clone"></i> Plantillas</button>';
    }
    function rmToast(msg) {
      var box = el('<div class="alert alert-success py-2 px-3 mb-2"><i class="fa fa-circle-check me-1"></i>' + esc(msg) + '</div>');
      view.insertBefore(box, view.firstChild);
      setTimeout(function () { box.remove(); }, 4500);
    }
    function askRoomingDays(tid, cb) {
      // El reparto de la plantilla es de UNA NOCHE: aquí se decide a qué días se aplica.
      var dias = (DAYS || []).map(function (d) {
        return '<label class="filter-chip"><input type="checkbox" value="' + esc(d.date) + '" checked><i class="fa fa-calendar-day"></i>' + esc(d.label) + '</label>';
      }).join('');
      var body = '<p class="mb-2">¿Para qué días es este reparto de habitaciones?</p>'
        + '<div class="filter-chips mb-2" id="rmTplDays">' + (dias || '<span class="text-muted">Esta actividad no tiene días.</span>') + '</div>'
        + '<div class="small text-muted">Por defecto, todos. Desmarca los que no.</div>';
      var m = openModal('rmTplModal', 'modal-md', 'Cargar rooming list', body, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmTplModal'); if (i) i.hide(); }),
        btn('Cargar', 'btn-primary', function () {
          var sel = Array.prototype.slice.call(document.querySelectorAll('#rmTplDays input:checked')).map(function (c) { return c.value; });
          if (!sel.length) { alert('Marca al menos un día.'); return; }
          cb(sel);
        }),
      ]);
      return m;
    }
    function loadTemplate(kind, tid, mode, dias, addKeys) {
      var fd = new FormData();
      if (mode) fd.append('mode', mode);
      (dias || []).forEach(function (d) { fd.append('days', d); });
      (addKeys || []).forEach(function (k) { fd.append('add_keys', k); });
      return postForm(ep('/plantillas/' + tid + '/cargar'), fd).then(function (resp) {
        if (!resp || !resp.ok) { alert((resp && resp.error) || 'No se pudo cargar la plantilla.'); return; }
        if (resp.needs_decision) { pedirDecisionPersonas(kind, tid, dias, resp); return; }
        var inst = bs('rmTplModal'); if (inst) inst.hide();
        if (apply(resp) && resp.message) rmToast(resp.message);
        // ⚠️ Al dejar gente fuera pueden quedarse habitaciones VACÍAS: se pregunta si se conservan
        // o se eliminan. Eso NO toca la plantilla, solo esta actividad.
        if ((resp.empty_rooms || []).length) avisarHabitacionesVacias(resp.empty_rooms);
      });
    }
    /* ⚠️⚠️ LA DECISIÓN ES DE CADA PERSONA: en un equipo de doce, «añadir todas» o «dejarlas todas
       fuera» no sirve. Cada una sale con su foto y su función, marcada por defecto, y se desmarca a
       quien no venga a esta actividad. */
    function pedirDecisionPersonas(kind, tid, dias, resp) {
      var gente = resp.missing || [];
      var filas = gente.map(function (m) {
        return '<label class="rmr-dec">'
          + '<input class="form-check-input" type="checkbox" checked value="' + esc(m.key) + '" data-dec>'
          + avatar(m.photo_url) + '<span class="rmr-dec__txt"><span class="fw-semibold">' + esc(m.name) + '</span>'
          + (m.role ? '<span class="rmr-dec__role">' + esc(m.role) + '</span>' : '') + '</span></label>';
      }).join('');
      var body = '<p class="mb-2">En «' + esc(resp.name) + '» hay <strong>' + gente.length
        + ' persona' + (gente.length === 1 ? '' : 's') + '</strong> que no está'
        + (gente.length === 1 ? '' : 'n') + ' en el personal de esta actividad. '
        + 'Marca quién se añade:</p>'
        + '<div class="rmr-decs mb-2">' + filas + '</div>'
        + '<div class="d-flex gap-2 mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-dec-all>Todas</button>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-dec-none>Ninguna</button></div>'
        + '<p class="mb-0 small text-muted">Quien se quede fuera se cae del reparto (si su habitación queda vacía, '
        + 'se pregunta qué hacer con ella). Quien esté en el personal y no en la plantilla se queda sin habitación.</p>';
      var m = openModal('rmTplModal', 'modal-md', 'Cargar rooming list', body, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmTplModal'); if (i) i.hide(); }),
        btn('Cargar', 'btn-primary', function () {
          var keys = Array.prototype.slice.call(m.querySelectorAll('[data-dec]:checked')).map(function (c) { return c.value; });
          var i = bs('rmTplModal'); if (i) i.hide();
          // Sin nadie marcado se manda el modo «dejarlas fuera» (una lista vacía no es una decisión).
          loadTemplate(kind, tid, keys.length ? '' : 'skip_missing', dias, keys);
        }),
      ]);
      m.querySelector('[data-dec-all]').addEventListener('click', function () {
        m.querySelectorAll('[data-dec]').forEach(function (c) { c.checked = true; });
      });
      m.querySelector('[data-dec-none]').addEventListener('click', function () {
        m.querySelectorAll('[data-dec]').forEach(function (c) { c.checked = false; });
      });
    }
    function avisarHabitacionesVacias(vacias) {
      var body = '<p class="mb-2">' + vacias.length + ' habitaci' + (vacias.length === 1 ? 'ón se ha' : 'ones se han')
        + ' quedado <strong>vacía' + (vacias.length === 1 ? '' : 's') + '</strong> al dejar gente fuera.</p>'
        + '<p class="mb-0 small text-muted">Se pueden conservar (para meter a otra persona) o eliminar. '
        + 'Esto solo afecta a esta actividad: la plantilla no se toca.</p>';
      openModal('rmEmptyRoomsModal', 'modal-md', 'Habitaciones vacías', body, [
        btn('Conservarlas', 'btn-outline-secondary', function () { var i = bs('rmEmptyRoomsModal'); if (i) i.hide(); }),
        btn('Eliminarlas', 'btn-danger', function () {
          var i = bs('rmEmptyRoomsModal'); if (i) i.hide();
          var cadena = Promise.resolve();
          vacias.forEach(function (v) {
            cadena = cadena.then(function () { return postJson(ep('/habitacion/eliminar'), { room_id: v.id }); });
          });
          cadena.then(function (resp) { apply(resp); rmToast(vacias.length === 1 ? 'Habitación eliminada' : (vacias.length + ' habitaciones eliminadas')); });
        }),
      ]);
    }
    function openTemplates(kind) {
      fetch(ep('/plantillas')).then(function (r) { return r.json(); }).then(function (d) {
        var rows = ((d && d.templates) || {})[kind] || [];
        var LABEL = { PERSONNEL: 'personal', ROOMING: 'rooming list', ROADMAP: 'hoja de ruta' }[kind] || '';
        var body = '';
        if (!rows.length) {
          body = '<div class="text-muted mb-3">Este artista todavía no tiene plantillas de ' + LABEL
            + '. Se crean en su ficha, en la pestaña <strong>Plantillas</strong>.</div>';
        } else {
          body = '<div class="list-group mb-3">' + rows.map(function (t) {
            return '<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2" data-tpl-pick="' + esc(t.id) + '">'
              + '<i class="fa ' + esc(t.icon) + ' text-muted"></i><span class="flex-grow-1 text-start"><span class="fw-semibold">' + esc(t.name) + '</span>'
              + '<span class="text-muted small ms-2">' + esc(t.detail) + '</span></span><i class="fa fa-download text-muted"></i></button>';
          }).join('') + '</div>';
        }
        body += '<div class="border-top pt-2"><div class="small text-muted mb-1">O guardar lo que hay ahora como plantilla del artista:</div>'
          + '<div class="input-group input-group-sm"><input class="form-control" id="rmTplNewName" placeholder="Nombre de la plantilla">'
          + '<button class="btn btn-outline-primary" type="button" data-tpl-save="1"><i class="fa fa-floppy-disk me-1"></i>Guardar</button></div></div>';
        var m = openModal('rmTplModal', 'modal-md', 'Plantillas de ' + LABEL, body,
                          [btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmTplModal'); if (i) i.hide(); })]);
        m.querySelectorAll('[data-tpl-pick]').forEach(function (b2) {
          b2.addEventListener('click', function () {
            var tid = b2.getAttribute('data-tpl-pick');
            if (kind === 'ROOMING') { askRoomingDays(tid, function (dias) { loadTemplate(kind, tid, null, dias); }); return; }
            loadTemplate(kind, tid);
          });
        });
        var sv = m.querySelector('[data-tpl-save]');
        if (sv) sv.addEventListener('click', function () {
          var nombre = (m.querySelector('#rmTplNewName') || {}).value || '';
          postJson(ep('/plantillas/guardar'), { kind: kind, name: nombre }).then(function (resp) {
            if (!resp || !resp.ok) { alert((resp && resp.error) || 'No se pudo guardar la plantilla.'); return; }
            var i = bs('rmTplModal'); if (i) i.hide();
            rmToast('Plantilla «' + (resp.name || nombre) + '» guardada en la ficha del artista.');
          });
        });
      });
    }
    view.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tpl-open]');
      if (b) openTemplates(b.getAttribute('data-tpl-open'));
    });

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
    /* ⚠️ QUÉ DÍAS SE VEN. Con varios días la hoja es UNA línea de tiempo continua, y a veces solo
       interesa mirar un día: los chips de arriba lo filtran. Vacío = se ven todos. */
    var diasVistos = null;
    function diasVisibles() {
      if (!diasVistos || !diasVistos.length) return DAYS;
      return DAYS.filter(function (d) { return diasVistos.indexOf(d.date) >= 0; });
    }
    function dayFilter() {
      if ((DAYS || []).length < 2) return '';
      var todos = !diasVistos || !diasVistos.length;
      var chips = '<button type="button" class="filter-chip' + (todos ? ' is-on' : '') + '" data-rmday="">'
        + '<i class="fa fa-layer-group"></i>Todos los días</button>';
      DAYS.forEach(function (d) {
        var on = !todos && diasVistos.indexOf(d.date) >= 0;
        chips += '<button type="button" class="filter-chip' + (on ? ' is-on' : '') + '" data-rmday="' + esc(d.date) + '">'
          + '<i class="fa fa-calendar-day"></i>' + esc(d.label || (d.weekday + ' ' + d.day)) + '</button>';
      });
      return '<div class="rm-dayfilter">' + chips + '</div>';
    }

    function renderAgenda() {
      var map = agendaByDay();
      var tools = RO ? '' : '<div class="ms-auto d-flex gap-1">' + tplBtn('ROADMAP') + '<button class="btn btn-sm btn-outline-secondary" data-share title="Compartir (solo lectura)"><i class="fa fa-share-nodes"></i></button><button class="btn btn-sm btn-outline-secondary" data-cfg title="Configurar días"><i class="fa fa-gear"></i></button></div>';
      var vistos = diasVisibles();
      var html = '<div class="rm-toolbar"><div class="text-muted small">Calendario de la actividad</div>' + tools + '</div>'
        + dayFilter()
        + '<div class="rm-agenda' + ((DAYS || []).length < 2 ? ' rm-agenda--single' : '') + '">';
      vistos.forEach(function (d) { html += dayBlock(d, map[d.date] || []); });
      html += '</div>';
      view.innerHTML = html;
      if (!RO) {
        var shareBtn = view.querySelector('[data-share]'); if (shareBtn) shareBtn.addEventListener('click', openShareModal);
        var cfgBtn = view.querySelector('[data-cfg]'); if (cfgBtn) cfgBtn.addEventListener('click', openDaysConfig);
      }
      view.querySelectorAll('[data-rmday]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = b.getAttribute('data-rmday');
          // «Todos» limpia el filtro; un día se pone o se quita (se pueden ver varios a la vez).
          if (!d) { diasVistos = null; }
          else {
            diasVistos = diasVistos ? diasVistos.slice() : [];
            var i = diasVistos.indexOf(d);
            if (i >= 0) diasVistos.splice(i, 1); else diasVistos.push(d);
            if (!diasVistos.length) diasVistos = null;
          }
          renderAgenda();
        });
      });
      bindAgenda();
    }
    function dayBlock(d, items) {
      var addBtn = RO ? '' : '<button class="rm-add sm ms-auto" data-addday="' + esc(d.date) + '"><i class="fa fa-plus"></i> Actividad</button>';
      var head = '<div class="rm-dayhead"><div class="rm-cal"><span class="wd">' + esc(d.weekday) + '</span><span class="num">' + esc(d.day) + '</span><span class="mo">' + esc(d.month) + '</span></div><div class="lbl">' + esc(d.label) + '</div>' + addBtn + '</div>';
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
      if (!RO) { var shLbl = sheetsLabel(it); if (shLbl) tags += '<span class="rm-tag sheet"><i class="fa fa-share-nodes"></i> ' + esc(shLbl) + '</span>'; }
      var sub = '';
      if (it.kind === 'ENTREVISTA' && it.interview) {
        if (it.interview.type) tags += '<span class="rm-tag">' + esc(it.interview.type) + '</span>';
        if (it.interview.live) tags += '<span class="rm-tag live">Directo</span>';
        if (it.interview.sings) tags += '<span class="rm-tag sing">Canta</span>';
        if (it.interview.media_name) sub = esc(it.interview.media_name);
      }
      // Punto que viene de una PROMOCIÓN de prensa: se pinta con sus iconos (tipo de medio, cómo se
      // hace, si canta y si es en directo) para leer la hoja de un vistazo.
      if (it.promo_meta) {
        var pm = it.promo_meta;
        if (pm.media_type) tags += '<span class="rm-tag"><i class="fa ' + esc(pm.media_icon || 'fa-bullhorn') + '"></i> ' + esc(pm.media_type) + '</span>';
        if (pm.modality_label) tags += '<span class="rm-tag"><i class="fa ' + esc(pm.modality_icon || 'fa-video') + '"></i> ' + esc(pm.modality_label) + '</span>';
        if (pm.sings) tags += '<span class="rm-tag sing"><i class="fa fa-music"></i> Canta</span>';
        if (pm.is_live) tags += '<span class="rm-tag live"><i class="fa fa-guitar"></i> En directo</span>';
        else if (pm.formation_label) tags += '<span class="rm-tag">' + esc(pm.formation_label) + '</span>';
        if (!sub && pm.media_name) sub = esc(pm.media_name);
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
      return '<div class="' + cls + '"' + (RO ? '' : ' draggable="true"') + ' data-item="' + esc(it.id) + '" style="--rm-line:' + esc(ki.color) + '">'
        + '<div class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></div>'
        + '<div><div class="rm-time">' + timeLabel(it) + '</div><div class="rm-title">' + esc(it.title || ki.label) + '</div>'
        + (it.location ? '<div class="rm-sub">' + esc(it.location) + '</div>' : '') + (sub ? '<div class="rm-sub">' + sub + '</div>' : '') + transLine
        + (tags ? '<div class="rm-tags">' + tags + '</div>' : '') + '</div>'
        + '<div class="rm-meta">' + meta + '</div></div>';
    }
    function bindAgenda() {
      view.querySelectorAll('[data-item]').forEach(function (node) {
        node.addEventListener('click', function () { if (node.classList.contains('dragging')) return; var it = agendaItem(node.getAttribute('data-item')); if (it) openDetail(it); });
        if (RO) return;
        node.addEventListener('dragstart', function (e) { dragId = node.getAttribute('data-item'); node.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} });
        node.addEventListener('dragend', function () { node.classList.remove('dragging'); dragId = null; view.querySelectorAll('.rm-dragover').forEach(function (x) { x.classList.remove('rm-dragover'); }); });
      });
      if (RO) return;
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
    // ¿Quién ve cada punto de la agenda? Etiquetas del propio punto, las dos marcadas por defecto.
    var SHEETS = [{ key: 'GENERAL', label: 'General', icon: 'fa-route' },
                  { key: 'TECNICA', label: 'Técnica', icon: 'fa-sliders' }];
    function itemSheets(it) {
      var v = (it && it.sheets) || {};
      var out = {};
      SHEETS.forEach(function (s) { out[s.key] = v[s.key] !== false; });
      return out;
    }
    function sheetsLabel(it) {
      var sh = itemSheets(it);
      var on = SHEETS.filter(function (s) { return sh[s.key]; });
      if (on.length === SHEETS.length) return '';                 // en las dos: no hace falta decirlo
      if (!on.length) return 'No se comparte';
      return 'Solo ' + on[0].label.toLowerCase();
    }
    function newDraft(kind, day) {
      var d = { id: '', kind: kind, day: day || (DAYS[0] ? DAYS[0].date : ''), start_time: '', end_time: '', tbc: false, confirmed: true, cancelled: false, title: '', location: '', note: '', contact: {}, attachments: [], sheets: { GENERAL: true, TECNICA: true } };
      // La ficha ya dice a qué hora abren las puertas: se precumplimenta (se puede cambiar, y se
      // pueden añadir varias aperturas en la misma actividad).
      if (kind === 'APERTURA_PUERTAS' && DOORS) d.start_time = DOORS;
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
      // Quién lo ve: etiquetas de hoja de ruta (las dos activas por defecto).
      var dsh = itemSheets(draft);
      h += '<div class="col-12"><div class="filter-label"><i class="fa fa-share-nodes"></i>¿En qué hoja de ruta se ve?</div><div class="filter-chips">'
        + SHEETS.map(function (sN) { return '<label class="filter-chip"><input type="checkbox" data-sheet="' + sN.key + '"' + (dsh[sN.key] ? ' checked' : '') + '><i class="fa ' + sN.icon + '"></i>' + sN.label + '</label>'; }).join('')
        + '</div><div class="filter-hint">Las dos van marcadas. Si quitas una, este punto no sale en el enlace de esa hoja de ruta (si quitas las dos, se queda solo aquí dentro).</div></div>';
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
        h += '<div class="col-12"><label class="form-label">Pasajeros</label><div data-pass></div><button type="button" class="rm-add sm" data-addpass><i class="fa fa-plus"></i> Añadir pasajeros</button></div>';
        h += '</div>';
      }

      // Contacto
      h += '<hr><div class="fw-semibold mb-2">Contacto</div><div class="row g-2">';
      h += '<div class="col-12" data-media-contacts></div>';
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
      function setContact(c) {
        draft.contact = c || {};
        cName.textContent = draft.contact.name || '';
        cChip.classList.toggle('d-none', !draft.contact.name);
        m.querySelector('[data-c="phone"]').value = draft.contact.phone || '';
        m.querySelector('[data-c="email"]').value = draft.contact.email || '';
      }
      m.rmSetContact = setContact;
      attachSearch(m.querySelector('[data-contact-search]'), m.querySelector('[data-contact-results]'), searchPromoters, function (r) {
        setContact({ name: r.label, phone: r.phone || '', email: r.email || '', promoter_id: r.id });
      }, { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) setContact({ name: r.label || q, promoter_id: r.id, phone: r.contact_phone || '', email: r.contact_email || '' }); }); } });
      m.querySelector('[data-contact-clear]').addEventListener('click', function () { setContact({}); });

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
        draft.interview.media_id = r.id; draft.interview.media_name = r.label; mname.textContent = r.label; chip.classList.remove('d-none'); renderMediaContacts(m, draft);
      }, { onCreate: function (q) { createMedia(q).then(function (r) { if (r && r.id) { draft.interview.media_id = r.id; draft.interview.media_name = r.label || q; mname.textContent = draft.interview.media_name; chip.classList.remove('d-none'); renderMediaContacts(m, draft); } }); } });
      m.querySelector('[data-media-clear]').addEventListener('click', function () { draft.interview.media_id = ''; draft.interview.media_name = ''; chip.classList.add('d-none'); renderMediaContacts(m, draft); });
      renderMediaContacts(m, draft);
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
    function renderMediaContacts(m, draft) {
      var box = m.querySelector('[data-media-contacts]'); if (!box) return;
      var mediaId = draft.interview && draft.interview.media_id;
      if (!mediaId) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="text-muted small">Cargando contactos del medio…</div>';
      getJson('/api/media/' + encodeURIComponent(mediaId) + '/contacts').then(function (list) {
        var h = '<div class="small text-muted mb-1"><i class="fa fa-address-book me-1"></i>Contactos del medio (elige uno o crea):</div>';
        (list || []).forEach(function (c, i) {
          var meta = [c.role, c.phone, c.email].filter(Boolean).join(' · ');
          h += '<div class="rm-result" data-mci="' + i + '">' + avatar(null) + '<div><div>' + esc(c.name) + '</div>' + (meta ? '<div class="rm-sub">' + esc(meta) + '</div>' : '') + '</div></div>';
        });
        h += '<button type="button" class="btn btn-outline-secondary btn-sm mt-1" data-mc-new><i class="fa fa-plus"></i> Nuevo contacto del medio</button><div data-mc-form class="mt-2 d-none"></div>';
        box.innerHTML = h;
        box.querySelectorAll('[data-mci]').forEach(function (n) {
          n.addEventListener('click', function () {
            var c = (list || [])[parseInt(n.getAttribute('data-mci'), 10)];
            if (c && m.rmSetContact) m.rmSetContact({ name: c.name, phone: c.phone || '', email: c.email || '', media_id: mediaId });
          });
        });
        box.querySelector('[data-mc-new]').addEventListener('click', function () {
          var f = box.querySelector('[data-mc-form]');
          f.classList.remove('d-none');
          f.innerHTML = '<div class="row g-1"><div class="col-md-6"><input class="form-control form-control-sm" data-nmc="name" placeholder="Nombre"></div><div class="col-md-6"><input class="form-control form-control-sm" data-nmc="role" placeholder="Cargo"></div><div class="col-md-6"><input class="form-control form-control-sm" data-nmc="phone" placeholder="Teléfono"></div><div class="col-md-6"><input class="form-control form-control-sm" data-nmc="email" placeholder="Email"></div></div><button type="button" class="btn btn-primary btn-sm mt-1" data-nmc-save>Añadir y usar</button>';
          f.querySelector('[data-nmc-save]').addEventListener('click', function () {
            var name = f.querySelector('[data-nmc="name"]').value.trim(); if (!name) return;
            var body = { name: name, role: f.querySelector('[data-nmc="role"]').value.trim(), phone: f.querySelector('[data-nmc="phone"]').value.trim(), email: f.querySelector('[data-nmc="email"]').value.trim() };
            postJson('/api/media/' + encodeURIComponent(mediaId) + '/contacts/create', body).then(function (r) {
              if (r && r.ok) { if (m.rmSetContact) m.rmSetContact({ name: r.name, phone: r.phone || '', email: r.email || '', media_id: mediaId }); renderMediaContacts(m, draft); }
              else alert((r && r.error) || 'No se pudo crear el contacto.');
            });
          });
        });
      });
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
    // ⚠️⚠️ En un mismo traslado va casi siempre medio equipo, así que se marcan VARIAS personas y
    // se añaden DE GOLPE (de una en una era un trabajo tonto). Quien ya va sale como «ya va» y no
    // se puede elegir dos veces; un tercero nuevo o alguien a mano se AÑADEN A LA SELECCIÓN sin
    // cerrar el pop-up, para poder juntarlos con los demás en el mismo viaje.
    function openPassengerPicker(draft, done) {
      var yaVan = {};
      (draft.transport.passengers || []).forEach(function (p) { if (p.personnel_id) yaVan[String(p.personnel_id)] = true; });
      var sel = {};

      var h = '<div class="d-flex align-items-center gap-2 mb-1">'
        + '<div class="text-muted small flex-grow-1">Personal de la hoja de ruta</div>'
        + '<div class="filter-chips m-0" data-passbulk></div></div>'
        + '<div data-passlist></div>'
        + '<hr><div class="text-muted small mb-1">Añadir tercero nuevo</div><input class="form-control" placeholder="Buscar tercero…" data-newsearch><div class="list-group position-absolute d-none" style="z-index:5" data-newresults></div>'
        + '<div class="mt-2"><input class="form-control form-control-sm mb-1" data-mname placeholder="…o nombre manual"><input class="form-control form-control-sm mb-1" data-mrole placeholder="Función"><button type="button" class="btn btn-outline-primary btn-sm" data-maddmanual>Añadir manual</button></div>';

      var bAdd = btn('Añadir', 'btn-primary', function () { addSeleccionados(); });
      var m2 = openModal('rmPassModal', 'modal-md', 'Añadir pasajeros', h, [bAdd]);

      function libres() { return P.personnel.filter(function (p) { return !yaVan[String(p.id)]; }); }
      function marcados() { return libres().filter(function (p) { return sel[String(p.id)]; }); }
      function chip(label, fn) { var b = el('<button type="button" class="filter-chip">' + label + '</button>'); b.addEventListener('click', fn); return b; }

      function pinta() {
        var wrap = m2.querySelector('[data-passlist]');
        wrap.innerHTML = '';
        if (!P.personnel.length) wrap.appendChild(el('<div class="text-muted small">Aún no hay personal en la hoja de ruta.</div>'));
        P.personnel.forEach(function (p) {
          var id = String(p.id), ya = !!yaVan[id], on = !!sel[id];
          var row = el('<div class="rm-result' + (ya ? ' is-done' : (on ? ' is-on' : '')) + '">'
            + '<span class="rm-check">' + (ya ? '<i class="fa fa-circle-check"></i>' : (on ? '<i class="fa fa-square-check"></i>' : '<i class="fa-regular fa-square"></i>')) + '</span>'
            + avatar(p.photo_url)
            + '<div class="flex-grow-1"><div>' + esc(p.name) + '</div>' + (p.role ? '<div class="rm-sub">' + esc(p.role) + '</div>' : '') + '</div>'
            + (ya ? '<span class="rm-sub">ya va</span>' : '') + '</div>');
          if (!ya) row.addEventListener('click', function () { sel[id] = !sel[id]; pinta(); });
          wrap.appendChild(row);
        });
        // «Todos» / «Ninguno» solo cuando hacen algo (y no con una sola persona que elegir).
        var bulk = m2.querySelector('[data-passbulk]');
        bulk.innerHTML = '';
        var lib = libres(), n = marcados().length;
        if (lib.length > 1) {
          if (n < lib.length) bulk.appendChild(chip('Todos', function () { lib.forEach(function (p) { sel[String(p.id)] = true; }); pinta(); }));
          if (n > 0) bulk.appendChild(chip('Ninguno', function () { sel = {}; pinta(); }));
        }
        bAdd.textContent = n ? ('Añadir (' + n + ')') : 'Añadir';
      }

      function addSeleccionados() {
        var elegidos = marcados();
        if (!elegidos.length) { alert('Marca a las personas que van en este traslado.'); return; }
        elegidos.forEach(function (p) { draft.transport.passengers.push({ personnel_id: String(p.id), locator: '', ticket_url: '', ticket_name: '' }); });
        var i = bs('rmPassModal'); if (i) i.hide();
        done();
      }

      function marcaNueva(pid) {
        if (!pid) return;
        if (yaVan[String(pid)]) { alert('Esa persona ya va en este traslado.'); return; }
        sel[String(pid)] = true; pinta();
      }
      attachSearch(m2.querySelector('[data-newsearch]'), m2.querySelector('[data-newresults]'), searchPromoters, function (r) {
        savePerson({ kind: 'PROMOTER', ref_id: r.id, name: r.label, phone: r.phone || '', email: r.email || '', photo_url: r.logo_url || '' }).then(marcaNueva);
      }, { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) savePerson({ kind: 'PROMOTER', ref_id: r.id, name: r.label || q }).then(marcaNueva); }); } });
      m2.querySelector('[data-maddmanual]').addEventListener('click', function () {
        var nm = m2.querySelector('[data-mname]').value.trim(); if (!nm) return;
        savePerson({ kind: 'MANUAL', name: nm, role: m2.querySelector('[data-mrole]').value.trim() }).then(function (pid) {
          m2.querySelector('[data-mname]').value = ''; m2.querySelector('[data-mrole]').value = '';
          marcaNueva(pid);
        });
      });
      pinta();
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
      draft.sheets = {};
      m.querySelectorAll('[data-sheet]').forEach(function (cb) { draft.sheets[cb.getAttribute('data-sheet')] = cb.checked; });
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
      if (!RO) { var shD = sheetsLabel(it); if (shD) h += '<div class="rm-tag sheet mb-2 d-inline-block"><i class="fa fa-share-nodes"></i> ' + esc(shD) + '</div> '; }
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
      // Punto que espeja una PROMOCIÓN de prensa: sus propios iconos.
      if (it.promo_meta) {
        var pmd = it.promo_meta;
        h += '<div class="mb-1">';
        if (pmd.media_name) h += '<span class="rm-tag"><i class="fa ' + esc(pmd.media_icon || 'fa-bullhorn') + '"></i> ' + esc(pmd.media_name) + '</span> ';
        if (pmd.modality_label) h += '<span class="rm-tag"><i class="fa ' + esc(pmd.modality_icon || 'fa-video') + '"></i> ' + esc(pmd.modality_label) + '</span> ';
        if (pmd.sings) h += '<span class="rm-tag sing"><i class="fa fa-music"></i> Canta</span> ';
        if (pmd.is_live) h += '<span class="rm-tag live"><i class="fa fa-guitar"></i> En directo</span> ';
        else if (pmd.formation_label) h += '<span class="rm-tag">' + esc(pmd.formation_label) + '</span> ';
        h += '</div>';
      }
      if (ki.transport && it.transport) {
        var t = it.transport;
        h += '<div class="rm-transport-line">' + (t.logo_url ? '<img src="' + esc(t.logo_url) + '">' : '') + [t.company, t.number, [t.origin, t.destination].filter(Boolean).join(' → '), t.duration].filter(Boolean).map(esc).join(' · ') + (t.ends_next_day ? ' <span class="rm-tag plus1">+1</span>' : '') + '</div>';
        (t.passengers || []).forEach(function (p) { var per = personById(p.personnel_id); h += '<div class="rm-sub"><i class="fa fa-user"></i> ' + esc(per ? per.name : '—') + (p.locator || t.locator_all ? ' · Loc: ' + esc(t.same_locator ? t.locator_all : p.locator) : '') + (p.ticket_url ? ' · <a href="' + esc(p.ticket_url) + '" target="_blank">Billete</a>' : '') + '</div>'; });
      }
      if (it.contact && (it.contact.name || it.contact.phone || it.contact.email)) h += '<div class="mt-2 rm-sub"><i class="fa fa-address-card"></i> ' + [it.contact.name, it.contact.phone, it.contact.email].filter(Boolean).map(esc).join(' · ') + '</div>';
      if (it.note) h += '<div class="alert alert-warning mt-2 mb-0 py-2"><i class="fa fa-note-sticky"></i> ' + esc(it.note) + '</div>';
      if ((it.attachments || []).length) { h += '<div class="mt-2">'; it.attachments.forEach(function (a) { h += '<a class="rm-att" href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a>'; }); h += '</div>'; }

      var foot = RO ? [btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmDetailModal'); if (i) i.hide(); })] : [
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
      if (!RO) html += '<div class="card mb-3"><div class="card-body py-2"><div class="small text-muted mb-1">Añadir traslado</div>' + grid + '</div></div>';
      html += '<div class="d-flex flex-column gap-2">';
      if (!items.length) html += '<div class="rm-empty">Sin traslados todavía.</div>';
      items.forEach(function (it) { html += '<div data-item="' + esc(it.id) + '">' + itemRow(it) + '</div>'; });
      html += '</div>';
      view.innerHTML = html;
      if (!RO) view.querySelectorAll('[data-mode]').forEach(function (c) { c.addEventListener('click', function () { openItemEditor(newDraft(c.getAttribute('data-mode'), DAYS[0] ? DAYS[0].date : '')); }); });
      view.querySelectorAll('.rm-item').forEach(function (node) { node.addEventListener('click', function () { var host = node.closest('[data-item]'); var it = agendaItem(host.getAttribute('data-item')); if (it) openDetail(it); }); });
    }

    // ================================================================ HOTELES
    /* ⚠️⚠️ EL REPARTO. Al cargar una plantilla de rooming las habitaciones llegan «YA FORMADAS»
       (quién va con quién) pero SIN HOTEL: en qué hotel duerme cada una se decide aquí, arrastrando.
       Mientras haya habitaciones sin repartir se ve el bloque de reparto —los hoteles en una FILA y
       debajo las habitaciones—; cuando no queda ninguna, ese bloque desaparece y se ven los hoteles
       con su rooming list de siempre. */
    function roomsPool() { return P.rooms_pool || []; }
    function hotelCap(ho) {
      var reservadas = parseInt(ho.rooms_reserved, 10) || 0, puestas = (ho.rooms || []).length;
      return { reserved: reservadas, used: puestas, over: !!(reservadas && puestas > reservadas),
               full: !!(reservadas && puestas >= reservadas),
               /* ⚠️ Una reserva que nadie usa es DINERO: se ve en ámbar en la tarjeta del hotel. */
               spare: (reservadas && puestas < reservadas) ? (reservadas - puestas) : 0 };
    }
    function roomChip(r, movible) {
      var n = (r.occupant_ids || []).length;
      var quien = (r.occupant_ids || []).map(function (id) { var p = personById(id); return p ? p.name : ''; })
        .filter(Boolean).map(esc).join(', ');
      return '<span class="rmr-room' + (movible ? ' is-move' : '') + '"' + (movible ? ' draggable="true"' : '')
        + ' data-room="' + esc(r.id) + '" title="' + esc(quien || 'vacía') + '">'
        + '<i class="fa fa-bed"></i><b>' + esc(roomTypeLabel(n, r.bed)) + '</b>'
        + '<span class="rmr-room__who">' + (quien || 'vacía') + '</span></span>';
    }
    function repartoBlock() {
      var pool = roomsPool();
      if (RO || !pool.length) return '';
      var cols = (P.hotels || []).map(function (ho) {
        var cap = hotelCap(ho);
        var cont = cap.reserved
          ? '<span class="rmr-count' + (cap.over ? ' is-over' : (cap.full ? ' is-full' : '')) + '">'
            + cap.used + '/' + cap.reserved + ' hab.</span>'
          : '<span class="rmr-count rmr-count--none" data-room-reserve="' + esc(ho.id) + '" title="Decir cuántas hay reservadas">sin reserva</span>';
        return '<div class="rmr-hotel" data-drop-hotel="' + esc(ho.id) + '">'
          + '<div class="rmr-hotel__head"><span class="rmr-hotel__name">' + esc(ho.name || 'Hotel') + '</span>' + cont + '</div>'
          + '<div class="rmr-hotel__rooms">'
          + ((ho.rooms || []).map(function (r) { return roomChip(r, true); }).join('') || '<span class="rmr-empty">Suelta aquí</span>')
          + '</div></div>';
      }).join('');
      return '<div class="rmr">'
        + '<div class="rmr__head"><span class="fw-semibold"><i class="fa fa-shuffle me-1"></i>Reparto de habitaciones</span>'
        + '<span class="rmr__hint">Arrastra cada habitación a su hotel</span></div>'
        + (cols ? '<div class="rmr-hotels">' + cols + '</div>'
                : '<div class="rmr-empty p-2">Añade un hotel para poder repartirlas.</div>')
        + '<div class="rmr__sub">Habitaciones por repartir · ' + pool.length + '</div>'
        + '<div class="rmr-pool" data-drop-pool>' + pool.map(function (r) { return roomChip(r, true); }).join('') + '</div>'
        + '</div>';
    }
    function sinHabitacion() {
      var dentro = {};
      (P.hotels || []).forEach(function (h) { (h.rooms || []).forEach(function (r) { (r.occupant_ids || []).forEach(function (id) { dentro[String(id)] = 1; }); }); });
      roomsPool().forEach(function (r) { (r.occupant_ids || []).forEach(function (id) { dentro[String(id)] = 1; }); });
      return (P.personnel || []).filter(function (p) { return !dentro[String(p.id)] && !p.no_room; });
    }
    function pendientesBlock() {
      if (RO || !(P.hotels || []).length) return '';
      var falta = sinHabitacion();
      var noNecesitan = (P.personnel || []).filter(function (p) { return p.no_room; });
      if (!falta.length && !noNecesitan.length) return '';
      var chips = falta.map(function (p) {
        return '<span class="rmr-person" draggable="true" data-guest="' + esc(p.id) + '">'
          + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span>'
          + '<button type="button" class="rmr-person__no" data-no-room="' + esc(p.id) + '" title="No necesita habitación"><i class="fa fa-ban"></i></button></span>';
      }).join('');
      var otros = noNecesitan.map(function (p) {
        return '<span class="rmr-person is-off" data-guest="' + esc(p.id) + '">' + avatar(p.photo_url)
          + '<span>' + esc(p.name) + '</span>'
          + '<button type="button" class="rmr-person__no" data-need-room="' + esc(p.id) + '" title="Sí necesita habitación"><i class="fa fa-rotate-left"></i></button></span>';
      }).join('');
      return '<div class="rmr rmr--people">'
        + (falta.length
            ? '<div class="rmr__head"><span class="fw-semibold text-danger"><i class="fa fa-user-clock me-1"></i>'
              + falta.length + ' sin habitación</span><span class="rmr__hint">Arrástralos a una habitación o marca que no la necesitan</span></div>'
              + '<div class="rmr-pool" data-drop-people>' + chips + '</div>'
            : '')
        + (otros ? '<div class="rmr__sub">No necesitan habitación</div><div class="rmr-pool">' + otros + '</div>' : '')
        + '</div>';
    }
    function renderHoteles() {
      var addBtn = RO ? '' : '<button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir hotel</button>';
      var html = '<div class="rm-toolbar"><div class="text-muted small">Alojamientos</div><span class="ms-auto d-flex gap-1 align-items-center">' + tplBtn('ROOMING') + addBtn + '</span></div>';
      html += repartoBlock() + pendientesBlock();
      html += '<div class="d-flex flex-column gap-2">';
      if (!P.hotels.length) html += '<div class="rm-empty">Sin hoteles todavía.</div>';
      P.hotels.forEach(function (ho) { html += hotelCard(ho); });
      html += '</div>';
      view.innerHTML = html;
      if (RO) return;
      view.querySelector('[data-add]').addEventListener('click', function () { openHotelEditor(newHotel()); });
      view.querySelectorAll('[data-hedit]').forEach(function (b) { b.addEventListener('click', function () { openHotelEditor(JSON.parse(JSON.stringify(hotelById(b.getAttribute('data-hedit'))))); }); });
      view.querySelectorAll('[data-hdel]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('¿Eliminar este hotel?')) return; postJson(ep('/hotel/delete'), { id: b.getAttribute('data-hdel') }).then(apply); }); });
      wireReparto();
      wireRooming();
    }

    /* Arrastrar: una HABITACIÓN entera (con su gente) entre hoteles y al montón de las que faltan
       por repartir, y un HUÉSPED entre habitaciones o de vuelta al listado de personal. */
    function wireReparto() {
      function drag(sel, tipo) {
        view.querySelectorAll(sel).forEach(function (chip) {
          chip.addEventListener('dragstart', function (e) {
            chip.classList.add('dragging');
            try {
              e.dataTransfer.setData('text/plain', tipo + ':' + chip.getAttribute(tipo === 'room' ? 'data-room' : 'data-guest'));
              e.dataTransfer.effectAllowed = 'move';
            } catch (err) {}
          });
          chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
        });
      }
      drag('[data-room]', 'room');
      drag('[data-guest]', 'guest');

      function zona(sel, alSoltar) {
        view.querySelectorAll(sel).forEach(function (z) {
          z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('drag-over'); });
          z.addEventListener('dragleave', function () { z.classList.remove('drag-over'); });
          z.addEventListener('drop', function (e) {
            e.preventDefault(); e.stopPropagation(); z.classList.remove('drag-over');
            var dato = '';
            try { dato = e.dataTransfer.getData('text/plain') || ''; } catch (err) {}
            var partes = dato.split(':');
            if (partes.length < 2) return;
            alSoltar(z, partes[0], partes.slice(1).join(':'));
          });
        });
      }
      // Un hotel acepta habitaciones enteras.
      zona('[data-drop-hotel]', function (z, tipo, id) {
        if (tipo !== 'room') return;
        moverHabitacion(id, z.getAttribute('data-drop-hotel'), false);
      });
      // El montón de «por repartir» las acepta de vuelta.
      zona('[data-drop-pool]', function (z, tipo, id) {
        if (tipo !== 'room') return;
        moverHabitacion(id, '', false);
      });
      // Una habitación (en el reparto o en la rooming list) acepta un huésped.
      zona('[data-room]', function (z, tipo, id) {
        if (tipo !== 'guest') return;
        postJson(ep('/habitacion/huesped'), { person_id: id, room_id: z.getAttribute('data-room') }).then(apply);
      });
      // El listado de personal: quien se suelta ahí se queda sin habitación.
      zona('[data-drop-people]', function (z, tipo, id) {
        if (tipo !== 'guest') return;
        postJson(ep('/habitacion/huesped'), { person_id: id, room_id: '' }).then(apply);
      });
      view.querySelectorAll('[data-no-room]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          postJson(ep('/personal/sin-habitacion'), { person_id: b.getAttribute('data-no-room') }).then(apply);
        });
      });
      view.querySelectorAll('[data-need-room]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          postJson(ep('/personal/sin-habitacion'), { person_id: b.getAttribute('data-need-room'), undo: 1 }).then(apply);
        });
      });
      view.querySelectorAll('[data-room-reserve]').forEach(function (b) {
        b.addEventListener('click', function () { pedirReserva(hotelById(b.getAttribute('data-room-reserve'))); });
      });
    }

    /* ⚠️ El tope son las habitaciones RESERVADAS: si se pasa, NO se suelta a la callada — se dice y
       se ofrece ampliar la reserva o cambiarla. Prometer un hotel que no está reservado es peor. */
    function moverHabitacion(roomId, hotelId, force) {
      return postJson(ep('/habitacion/mover'), { room_id: roomId, hotel_id: hotelId, force: (force ? 1 : '') })
        .then(function (resp) {
          if (resp && resp.ok) { apply(resp); return; }
          if (resp && resp.needs_reserve) {
            var body = '<p class="mb-2">' + esc(resp.error) + '</p>'
              + '<p class="mb-0 small text-muted">Puedes ampliar la reserva a ' + (resp.used + 1)
              + ' habitaciones o cambiar el número reservado.</p>';
            openModal('rmReserveModal', 'modal-md', 'No hay reservas suficientes', body, [
              btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmReserveModal'); if (i) i.hide(); }),
              btn('Modificar la reserva', 'btn-outline-primary', function () {
                var i = bs('rmReserveModal'); if (i) i.hide();
                pedirReserva(hotelById(resp.hotel_id), function () { moverHabitacion(roomId, hotelId, true); });
              }),
              btn('Ampliar a ' + (resp.used + 1), 'btn-primary', function () {
                var i = bs('rmReserveModal'); if (i) i.hide();
                postJson(ep('/hotel/reserva'), { hotel_id: resp.hotel_id, rooms_reserved: (resp.used + 1) })
                  .then(function () { moverHabitacion(roomId, hotelId, true); });
              }),
            ]);
            return;
          }
          alert((resp && resp.error) || 'No se pudo mover la habitación.');
        });
    }
    function pedirReserva(ho, despues) {
      if (!ho) return;
      var body = '<label class="form-label">Habitaciones reservadas en «' + esc(ho.name || 'Hotel') + '»</label>'
        + '<input class="form-control" type="number" min="0" max="99" value="' + (parseInt(ho.rooms_reserved, 10) || 0) + '" data-rsv>'
        + '<div class="form-text">Es el tope al repartir: sale el contador «x/x» y, si se pasa, se avisa. 0 = sin tope.</div>';
      var m = openModal('rmReserveEditModal', 'modal-sm', 'Reserva del hotel', body, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmReserveEditModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () {
          var v = parseInt((m.querySelector('[data-rsv]') || {}).value, 10) || 0;
          var i = bs('rmReserveEditModal'); if (i) i.hide();
          postJson(ep('/hotel/reserva'), { hotel_id: ho.id, rooms_reserved: v })
            .then(function (resp) { apply(resp); if (despues) despues(); });
        }),
      ]);
    }
    function wireRooming() {
      view.querySelectorAll('[data-rooming-edit]').forEach(function (b) {
        b.addEventListener('click', function () { var ho = hotelById(b.getAttribute('data-rooming-edit')); if (ho) openRoomingEditor(ho); });
      });
      view.querySelectorAll('[data-rshare]').forEach(function (b) {
        b.addEventListener('click', function () {
          var ho = hotelById(b.getAttribute('data-rhotel')); if (!ho) return;
          var mode = b.getAttribute('data-rshare');
          if (mode === 'pdf') {
            var withDni = confirm('¿Incluir la foto del DNI de cada huésped en el documento?\n\nAceptar = con fotos del DNI · Cancelar = sin fotos');
            window.open(ep('/rooming/' + encodeURIComponent(ho.id) + '/pdf') + (withDni ? '?dni=1' : ''), '_blank');
          } else if (mode === 'xlsx') {
            window.open(ep('/rooming/' + encodeURIComponent(ho.id) + '/xlsx'), '_blank');
          } else {
            var text = roomingShareText(ho);
            if (mode === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
            else if (mode === 'sms') window.location.href = 'sms:?&body=' + encodeURIComponent(text);
            else window.location.href = 'mailto:?subject=' + encodeURIComponent('Rooming list · ' + (ho.name || 'Hotel')) + '&body=' + encodeURIComponent(text);
          }
        });
      });
      if (RO) return;
      // Arrastrar personas ENTRE habitaciones (también de un hotel a otro) desde la vista.
      view.querySelectorAll('.rm-occ[data-occ]').forEach(function (chip) {
        chip.addEventListener('dragstart', function (e) {
          chip.classList.add('dragging');
          try { e.dataTransfer.setData('text/plain', JSON.stringify({ pid: chip.getAttribute('data-occ'), hotel: chip.getAttribute('data-occ-hotel'), room: chip.getAttribute('data-occ-room') })); } catch (err) {}
        });
        chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
      });
      view.querySelectorAll('.rm-room[data-room]').forEach(function (zone) {
        zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', function (e) {
          e.preventDefault(); zone.classList.remove('drag-over');
          var data = null; try { data = JSON.parse(e.dataTransfer.getData('text/plain') || 'null'); } catch (err) {}
          if (!data || !data.pid) return;
          var destHotel = hotelById(zone.getAttribute('data-room-hotel'));
          if (!destHotel) return;
          var rooms = JSON.parse(JSON.stringify(destHotel.rooms || []));
          rooms.forEach(function (r) { r.occupant_ids = (r.occupant_ids || []).filter(function (x) { return String(x) !== String(data.pid); }); });
          var dest = null;
          rooms.forEach(function (r) { if (String(r.id) === String(zone.getAttribute('data-room'))) dest = r; });
          if (!dest) return;
          dest.occupant_ids.push(String(data.pid));
          // El servidor quita a la persona del resto de hoteles automáticamente.
          saveRooms(destHotel.id, rooms);
        });
      });
    }
    function newHotel() { return { id: '', name: '', stars: 0, photo_url: '', address: '', phone: '', email: '', days: [], for_all: true, assignee_ids: [], note: '', attachments: [] }; }
    // ---------- ROOMING LIST ----------
    function assignedRoomIds(exceptHotelId) {
      // ids de personal con habitación asignada en CUALQUIER hotel (salvo el indicado).
      var out = {};
      P.hotels.forEach(function (ho) {
        if (exceptHotelId && String(ho.id) === String(exceptHotelId)) return;
        (ho.rooms || []).forEach(function (r) { (r.occupant_ids || []).forEach(function (id) { out[String(id)] = ho.id; }); });
      });
      return out;
    }
    /* ⚠️ CON DOS PERSONAS HAY QUE DECIR QUÉ CAMA ES: **Twin** son dos camas separadas y **Doble**
       una sola cama para los dos. Antes las de dos se llamaban «Doble» a secas, que es justo lo que
       se pide al hotel cuando quieres UNA cama: se pedía mal.
       Por defecto es TWIN (lo que se venía usando), y se cambia en el editor del rooming.
       ⚠️ Paridad con `_room_type_label` de app.py (el PDF y el Excel del rooming). */
    function roomTypeLabel(n, bed) {
      if (n === 1) return 'DUI';
      if (n === 2) return String(bed || '').toUpperCase() === 'DOBLE' ? 'Doble' : 'Twin';
      if (n === 3) return 'Triple';
      return n ? n + ' pers.' : 'Vacía';
    }
    function roomRangeLabel(r, ho) {
      // En una plantilla no hay fechas: es de UNA NOCHE y lo que se guarda es el reparto. Los días
      // se eligen al cargarla en la actividad (todos o los que se marquen).
      if (IS_TPL) return '';
      var from = r.day_from || (ho.days || [])[0] || '';
      var to = r.day_to || (ho.days || [])[(ho.days || []).length - 1] || from;
      if (!from) return '';
      var d1 = new Date(from), d2 = new Date(to || from);
      var nights = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
      function f(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2); }
      return 'del ' + f(d1) + ' al ' + f(d2) + ' (' + nights + ' noche' + (nights !== 1 ? 's' : '') + ')';
    }
    function roomMiniCard(ho, r, ri) {
      var occ = (r.occupant_ids || []).map(function (id) {
        var p = personById(id); if (!p) return '';
        return '<span class="rm-occ" draggable="' + (RO ? 'false' : 'true') + '" data-occ="' + esc(id) + '" data-occ-hotel="' + esc(ho.id) + '" data-occ-room="' + esc(r.id) + '" title="' + esc(p.name) + '">' + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span></span>';
      }).join('');
      return '<div class="rm-room" data-room="' + esc(r.id) + '" data-room-hotel="' + esc(ho.id) + '">'
        + '<div class="rm-room__head"><span class="fw-semibold">' + roomTypeLabel((r.occupant_ids || []).length, r.bed) + '</span>'
        + '<span class="rm-sub">' + (r.breakfast ? '<i class="fa fa-mug-saucer" title="Con desayuno"></i>' : '<i class="fa fa-mug-saucer" style="opacity:.25" title="Sin desayuno"></i>') + '</span></div>'
        + (occ || '<div class="rm-sub">Arrastra personas aquí</div>')
        + '</div>';
    }
    function roomingBlock(ho) {
      var rooms = ho.rooms || [];
      // agrupadas por nº de días (rango)
      var groups = {};
      rooms.forEach(function (r) { var k = roomRangeLabel(r, ho) || 'Sin días'; (groups[k] = groups[k] || []).push(r); });
      var html = '<div class="rm-rooming mt-2" data-rooming="' + esc(ho.id) + '">';
      html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">'
        + '<span class="rm-sub fw-semibold"><i class="fa fa-bed"></i> Rooming list' + (rooms.length ? ' · ' + rooms.length + ' hab.' : '') + '</span>'
        + '<span class="d-flex gap-1">'
        + (RO ? '' : '<button class="btn btn-sm btn-outline-primary py-0" data-rooming-edit="' + esc(ho.id) + '"><i class="fa fa-pen"></i> Editar rooming</button>')
        + '<div class="dropdown d-inline-block"><button class="btn btn-sm btn-outline-secondary py-0" data-bs-toggle="dropdown"><i class="fa fa-share-nodes"></i> Compartir</button>'
        + '<ul class="dropdown-menu dropdown-menu-end">'
        + '<li><button class="dropdown-item" data-rshare="pdf" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-file-pdf fa-fw me-1"></i>Descargar PDF</button></li>'
        + '<li><button class="dropdown-item" data-rshare="xlsx" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-file-excel fa-fw me-1"></i>Descargar Excel</button></li>'
        + '<li><hr class="dropdown-divider"></li>'
        + '<li><button class="dropdown-item" data-rshare="email" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-envelope fa-fw me-1"></i>Compartir por email</button></li>'
        + '<li><button class="dropdown-item" data-rshare="wa" data-rhotel="' + esc(ho.id) + '"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
        + '<li><button class="dropdown-item" data-rshare="sms" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-comment-sms fa-fw me-1"></i>Por SMS</button></li>'
        + '</ul></div></span></div>';
      if (!rooms.length) html += '<div class="rm-sub">Sin habitaciones. ' + (RO ? '' : 'Pulsa «Editar rooming» para configurarlas.') + '</div>';
      Object.keys(groups).forEach(function (k) {
        html += '<div class="rm-sub fw-semibold mt-1">' + esc(k) + '</div><div class="rm-rooms-grid">';
        groups[k].forEach(function (r) { html += roomMiniCard(ho, r, 0); });
        html += '</div>';
      });
      html += '</div>';
      return html;
    }
    function roomingShareText(ho) {
      var lines = ['Rooming list · ' + (ho.name || 'Hotel')];
      (ho.rooms || []).forEach(function (r, i) {
        var names = (r.occupant_ids || []).map(function (id) { var p = personById(id); return p ? p.name : ''; }).filter(Boolean).join(', ');
        lines.push('Hab. ' + (i + 1) + ' (' + roomTypeLabel((r.occupant_ids || []).length, r.bed) + (r.breakfast ? ', con desayuno' : ', sin desayuno') + ') ' + (roomRangeLabel(r, ho) || '') + ': ' + (names || 'vacía'));
      });
      return lines.join('\n');
    }
    function saveRooms(hotelId, rooms) {
      return postJson(ep('/hotel/rooms'), { hotel_id: hotelId, rooms: rooms }).then(apply);
    }
    function openRoomingEditor(ho) {
      var draftRooms = JSON.parse(JSON.stringify(ho.rooms || []));
      var assignedElsewhere = assignedRoomIds(ho.id);
      var hotelDays = ho.days || [];
      function unassigned() {
        var inDraft = {};
        draftRooms.forEach(function (r) { (r.occupant_ids || []).forEach(function (id) { inDraft[String(id)] = 1; }); });
        return P.personnel.filter(function (p) { return !inDraft[String(p.id)] && !assignedElsewhere[String(p.id)]; });
      }
      function newRoomId() { return 'tmp-' + Math.random().toString(36).slice(2, 10); }
      function dayOptions(sel) {
        var days = hotelDays.length ? hotelDays : DAYS.map(function (d) { return d.date; });
        return days.map(function (d) { return '<option value="' + esc(d) + '"' + (d === sel ? ' selected' : '') + '>' + esc(dayLabel(d)) + '</option>'; }).join('');
      }
      function html() {
        var left = '<div class="d-flex justify-content-between align-items-center mb-2"><span class="fw-semibold">Habitaciones</span><button type="button" class="btn btn-sm btn-outline-primary" data-addroom><i class="fa fa-plus"></i> Añadir habitación</button></div><div class="rm-rooms-grid" data-roomsedit>';
        draftRooms.forEach(function (r, i) {
          var occ = (r.occupant_ids || []).map(function (id) {
            var p = personById(id); if (!p) return '';
            return '<span class="rm-occ" draggable="true" data-eocc="' + esc(id) + '">' + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span></span>';
          }).join('');
          // Con DOS personas se elige la cama: Twin (dos camas) o Doble (una sola).
          var esDoble = String(r.bed || '').toUpperCase() === 'DOBLE';
          var camaBtn = ((r.occupant_ids || []).length === 2)
            ? '<button type="button" class="btn btn-sm btn-link p-0 me-2 rm-sub" data-ebed="' + i + '"'
              + ' title="' + (esDoble ? 'Una sola cama · pulsa para dos camas separadas' : 'Dos camas separadas · pulsa para una sola cama') + '">'
              + '<i class="fa ' + (esDoble ? 'fa-bed' : 'fa-bed-pulse') + '"></i> ' + (esDoble ? 'una cama' : 'dos camas') + '</button>'
            : '';
          left += '<div class="rm-room rm-room--edit" data-eroom="' + i + '">'
            + '<div class="rm-room__head"><span class="fw-semibold">' + roomTypeLabel((r.occupant_ids || []).length, r.bed) + '</span>'
            + '<span>' + camaBtn + '<label class="rm-sub me-1" title="Desayuno"><input type="checkbox" data-ebrk="' + i + '"' + (r.breakfast ? ' checked' : '') + '> <i class="fa fa-mug-saucer"></i></label>'
            + '<button type="button" class="btn btn-sm btn-link text-danger p-0" data-edelroom="' + i + '"><i class="fa fa-trash"></i></button></span></div>'
            + (IS_TPL ? '' : '<div class="rm-sub mb-1">De <select class="form-select form-select-sm d-inline-block w-auto" data-efrom="' + i + '">' + dayOptions(r.day_from || hotelDays[0] || '') + '</select> a <select class="form-select form-select-sm d-inline-block w-auto" data-eto="' + i + '">' + dayOptions(r.day_to || hotelDays[hotelDays.length - 1] || '') + '</select></div>')
            + (occ || '<div class="rm-sub">Arrastra personas aquí</div>')
            + '</div>';
        });
        left += '</div>';
        var people = unassigned().map(function (p) {
          return '<span class="rm-occ" draggable="true" data-eocc="' + esc(p.id) + '">' + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span></span>';
        }).join('') || '<div class="rm-sub">Todo el personal disponible ya tiene habitación.</div>';
        var right = '<div class="fw-semibold mb-2">Personal sin habitación</div><div class="rm-room rm-room--pool" data-epool>' + people + '</div><div class="rm-sub mt-2">1 persona = DUI · 2 = <b>Twin</b> (dos camas separadas) o <b>Doble</b> (una sola cama) · 3 = Triple. Las personas alojadas en otro hotel no aparecen.</div>';
        return '<div class="row g-3"><div class="col-md-7">' + left + '</div><div class="col-md-5">' + right + '</div></div>';
      }
      var m = openModal('rmRoomingModal', 'modal-xl', 'Rooming list · ' + (ho.name || 'Hotel'), html(), [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmRoomingModal'); if (i) i.hide(); }),
        btn('Guardar rooming', 'btn-primary', function () { var i = bs('rmRoomingModal'); if (i) i.hide(); saveRooms(ho.id, draftRooms); })
      ]);
      function rerender() { m.querySelector('.modal-body').innerHTML = html(); wire(); }
      function moveOcc(pid, toRoomIdx) {
        draftRooms.forEach(function (r) { r.occupant_ids = (r.occupant_ids || []).filter(function (x) { return String(x) !== String(pid); }); });
        if (toRoomIdx >= 0 && draftRooms[toRoomIdx]) draftRooms[toRoomIdx].occupant_ids.push(String(pid));
        rerender();
      }
      function wire() {
        var body = m.querySelector('.modal-body');
        body.querySelector('[data-addroom]').addEventListener('click', function () {
          draftRooms.push({ id: newRoomId(), bed: 'TWIN', breakfast: false, day_from: hotelDays[0] || '', day_to: hotelDays[hotelDays.length - 1] || '', occupant_ids: [] });
          rerender();
        });
        body.querySelectorAll('[data-edelroom]').forEach(function (b) { b.addEventListener('click', function () { draftRooms.splice(parseInt(b.getAttribute('data-edelroom'), 10), 1); rerender(); }); });
        body.querySelectorAll('[data-ebrk]').forEach(function (c) { c.addEventListener('change', function () { draftRooms[parseInt(c.getAttribute('data-ebrk'), 10)].breakfast = c.checked; }); });
        body.querySelectorAll('[data-ebed]').forEach(function (b) {
          b.addEventListener('click', function () {
            var r = draftRooms[parseInt(b.getAttribute('data-ebed'), 10)];
            r.bed = String(r.bed || '').toUpperCase() === 'DOBLE' ? 'TWIN' : 'DOBLE';
            rerender();
          });
        });
        body.querySelectorAll('[data-efrom]').forEach(function (s) { s.addEventListener('change', function () { draftRooms[parseInt(s.getAttribute('data-efrom'), 10)].day_from = s.value; }); });
        body.querySelectorAll('[data-eto]').forEach(function (s) { s.addEventListener('change', function () { draftRooms[parseInt(s.getAttribute('data-eto'), 10)].day_to = s.value; }); });
        body.querySelectorAll('[data-eocc]').forEach(function (chip) {
          chip.addEventListener('dragstart', function (e) { chip.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', chip.getAttribute('data-eocc')); } catch (err) {} });
          chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
        });
        body.querySelectorAll('[data-eroom], [data-epool]').forEach(function (zone) {
          zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
          zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
          zone.addEventListener('drop', function (e) {
            e.preventDefault(); zone.classList.remove('drag-over');
            var pid = ''; try { pid = e.dataTransfer.getData('text/plain'); } catch (err) {}
            if (!pid) return;
            var idx = zone.hasAttribute('data-eroom') ? parseInt(zone.getAttribute('data-eroom'), 10) : -1;
            moveOcc(pid, idx);
          });
        });
      }
      wire();
    }

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
        + (function () {   // cuántas habitaciones hay reservadas y cuántas se han puesto
            var cap = hotelCap(ho);
            if (!cap.reserved && !(ho.rooms || []).length) return '';
            if (!cap.reserved) return RO ? '' : '<div class="rm-sub"><i class="fa fa-bed"></i> '
              + (ho.rooms || []).length + ' hab. · <a href="#" data-room-reserve="' + esc(ho.id) + '">decir cuántas hay reservadas</a></div>';
            var sobran = cap.spare
              ? (cap.spare === 1 ? 'Sobra 1 habitación reservada' : 'Sobran ' + cap.spare + ' habitaciones reservadas')
              : '';
            return '<div class="rm-sub"><i class="fa fa-bed"></i> <span class="rmr-count'
              + (cap.over ? ' is-over' : (cap.full ? ' is-full' : (cap.spare ? ' is-spare' : '')))
              + '"' + (sobran ? ' title="' + esc(sobran + ': o se usan o se cambia la reserva') + '"' : '') + '>'
              + cap.used + '/' + cap.reserved + ' hab. reservadas</span>'
              + (sobran ? ' <span class="rmr-spare">' + esc(sobran) + '</span>' : '')
              + (RO ? '' : ' <a href="#" data-room-reserve="' + esc(ho.id) + '">cambiar</a>') + '</div>';
          })()
        + '<div class="rm-sub"><i class="fa fa-users"></i> ' + esc(whoNames || '—') + '</div>'
        + (ho.note ? '<div class="rm-sub"><i class="fa fa-note-sticky"></i> ' + esc(ho.note) + '</div>' : '')
        + (atts ? '<div class="mt-1">' + atts + '</div>' : '')
        + roomingBlock(ho)
        + '</div>'
        + (RO ? '' : '<div class="dropdown rm-menu"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-hedit="' + esc(ho.id) + '">Editar</button></li><li><button class="dropdown-item text-danger" data-hdel="' + esc(ho.id) + '">Eliminar</button></li></ul></div>')
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
    var psub = 'list'; // subpestaña del Personal: 'list' | 'prl'
    function personalSubtabs() {
      if (RO) return '';  // el enlace público de la hoja de ruta no enseña el PRL
      return '<ul class="nav nav-pills nav-sm mb-2" data-psub-bar>'
        + '<li class="nav-item"><button type="button" class="nav-link py-1 px-3' + (psub === 'list' ? ' active' : '') + '" data-psub="list"><i class="fa fa-users me-1"></i>Personal</button></li>'
        + '<li class="nav-item"><button type="button" class="nav-link py-1 px-3' + (psub === 'prl' ? ' active' : '') + '" data-psub="prl"><i class="fa fa-helmet-safety me-1"></i>PRL</button></li>'
        + '<li class="nav-item"><button type="button" class="nav-link py-1 px-3' + (psub === 'viaje' ? ' active' : '') + '" data-psub="viaje"><i class="fa fa-plane-departure me-1"></i>Viaje</button></li>'
        + '</ul>';
    }
    function wirePersonalSubtabs() {
      view.querySelectorAll('[data-psub]').forEach(function (b) {
        b.addEventListener('click', function () { psub = b.getAttribute('data-psub'); renderPersonal(); });
      });
    }
    // ---------------------------------------------------------------- VIAJE
    // Mismo estilo que el listado de Personal, pero con las necesidades de viaje de cada
    // pasajero (equipaje, asiento, extras, categoría y puntos de salida) y, opcionalmente,
    // la foto del DNI o el pasaporte para tenerla a mano al sacar los billetes.
    var TRAVEL_SHOW_DOC = false;
    function renderViaje() {
      view.innerHTML = personalSubtabs() + '<div class="rm-empty">Cargando…</div>';
      wirePersonalSubtabs();
      fetch(ep('/viaje'), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var rows = (data && data.rows) || [];
          var html = personalSubtabs()
            + '<div class="rm-toolbar"><div class="text-muted small">Listado de viaje · ' + rows.length + ' pasajero' + (rows.length === 1 ? '' : 's') + '</div>'
            + '<span><label class="btn btn-sm btn-outline-secondary py-0 mb-0"><input type="checkbox" class="me-1" data-travel-doc' + (TRAVEL_SHOW_DOC ? ' checked' : '') + '>Incluir foto del DNI/pasaporte</label></span></div>';
          if (!rows.length) html += '<div class="rm-empty">No hay personal en la actividad todavía.</div>';
          rows.forEach(function (p) {
            var t = p.travel || {};
            var marcas = (t.marks || []).map(function (m) {
              return '<span class="badge text-bg-light border me-1 mb-1"><i class="fa ' + esc(m.icon) + ' me-1"></i>' + esc(m.label) + '</span>';
            }).join('');
            var salidas = '';
            if (t.departure_flight) salidas += '<div class="small text-muted"><i class="fa fa-plane-departure me-1"></i>' + esc(t.departure_flight) + '</div>';
            if (t.departure_train) salidas += '<div class="small text-muted"><i class="fa fa-train me-1"></i>' + esc(t.departure_train) + '</div>';
            var datos = '';
            if (p.dni) datos += '<div class="small text-muted">DNI/NIF: ' + esc(p.dni) + '</div>';
            if (p.birth_date) datos += '<div class="small text-muted">Nacimiento: ' + esc(p.birth_date) + '</div>';
            if (p.phone || p.email) datos += '<div class="small text-muted">' + esc([p.phone, p.email].filter(Boolean).join(' · ')) + '</div>';
            var doc = '';
            if (TRAVEL_SHOW_DOC && (p.doc_front || p.doc_back)) {
              doc = '<div class="d-flex gap-2 mt-2 flex-wrap">'
                + (p.doc_front ? '<img src="' + esc(p.doc_front) + '" alt="" style="height:74px;border-radius:8px;border:1px solid #e5e8ee;object-fit:cover;">' : '')
                + (p.doc_back ? '<img src="' + esc(p.doc_back) + '" alt="" style="height:74px;border-radius:8px;border:1px solid #e5e8ee;object-fit:cover;">' : '')
                + (p.doc_number ? '<div class="small text-muted align-self-center">' + esc(p.doc_kind) + ' ' + esc(p.doc_number) + (p.doc_expiry ? ' · caduca ' + esc(p.doc_expiry) : '') + '</div>' : '')
                + '</div>';
            }
            html += '<div class="rm-person align-items-start"><span class="av">' + avatar(p.photo_url) + '</span>'
              + '<div class="flex-grow-1"><div class="nm">' + esc(p.name) + '</div>'
              + '<div class="rl">' + esc(p.role || '') + '</div>'
              + datos
              + (marcas ? '<div class="mt-1">' + marcas + '</div>' : '')
              + salidas
              + (t.notes ? '<div class="small mt-1" style="white-space:pre-wrap;">' + esc(t.notes) + '</div>' : '')
              + (!t.has_any ? '<div class="small text-muted fst-italic mt-1">Sin necesidades de viaje anotadas en su ficha.</div>' : '')
              + doc
              + '</div></div>';
          });
          view.innerHTML = html;
          wirePersonalSubtabs();
          var chk = view.querySelector('[data-travel-doc]');
          if (chk) chk.addEventListener('change', function () { TRAVEL_SHOW_DOC = chk.checked; renderViaje(); });
        })
        .catch(function () { view.innerHTML = personalSubtabs() + '<div class="rm-empty">No se pudo cargar el listado de viaje.</div>'; wirePersonalSubtabs(); });
    }

    /* ---------------------------------------------------------------- PERSONAL
       Quién va, con qué FUNCIÓN y con los datos que se hayan elegido ver. Los datos de una persona
       NO viven aquí: viven en su ficha (un tercero o alguien de la oficina). Lo que falte se puede
       rellenar desde el propio listado y se guarda EN SU FICHA.
       ⚠️ Las columnas se guardan CON LA ACTIVIDAD (o con la plantilla): `personnel_cols`. */
    var PERS_ROWS = null;      // el personal con los datos de su ficha (se pide una vez)
    var pBusca = '', pRol = '', pOrden = 'rol';

    function personCols() {
      var c = (P.personnel_cols && P.personnel_cols.length !== undefined) ? P.personnel_cols : PERSON_COLS;
      return (c && c.length !== undefined) ? c : ['role', 'phone', 'email'];
    }
    function personColOn(k) { return personCols().indexOf(k) >= 0; }
    function personFieldLabel(k) {
      for (var i = 0; i < PERSON_FIELDS.length; i++) if (PERSON_FIELDS[i].key === k) return PERSON_FIELDS[i].label;
      return k;
    }
    function personRowById(id) {
      var rows = PERS_ROWS || [];
      for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i];
      return null;
    }
    /* Lo que se pinta: si ya se pidieron los datos completos manda ESO (trae el DNI, el viaje y lo
       que le falta a cada uno); si no, lo que ya está en el payload, para no dejar la pestaña en
       blanco mientras llega. */
    function personRowsNow() {
      if (PERS_ROWS) return PERS_ROWS;
      return (P.personnel || []).map(function (p) {
        return { id: p.id, kind: p.kind, ref_id: p.ref_id, name: p.name, role: p.role, phone: p.phone,
                 email: p.email, photo_url: p.photo_url, dni: '', birth_date: '', travel: null,
                 doc_front: '', doc_back: '', missing: null, has_ficha: !!p.ref_id, ficha_url: '' };
      });
    }
    function cargaPersonRows(despues) {
      fetch(ep('/personal/datos'), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          if (resp && resp.ok) {
            PERS_ROWS = resp.rows || [];
            if (resp.cols) PERSON_COLS = resp.cols;
            if (resp.roles) PERSON_ROLES = resp.roles;
          }
          if (despues) despues();
        })
        .catch(function () { if (despues) despues(); });
    }
    function personMatches(r) {
      if (pRol && normText(r.role || 'Sin función') !== normText(pRol)) return false;
      if (!pBusca) return true;
      var heno = normText([r.name, r.role, r.phone, r.email, r.dni].filter(Boolean).join(' '));
      return pBusca.split(/\s+/).every(function (w) { return heno.indexOf(w) >= 0; });
    }
    function personRoleChips(rows) {
      var vistos = {}, orden = [];
      rows.forEach(function (r) {
        var nombre = (r.role || '').trim() || 'Sin función';
        var clave = normText(nombre);
        if (!vistos[clave]) { vistos[clave] = { label: nombre, n: 0 }; orden.push(clave); }
        vistos[clave].n++;
      });
      if (orden.length < 2) return '';                  // un solo grupo: el filtro no hace nada
      var h = '<div class="rm-pfilters">'
        + '<button type="button" class="filter-chip' + (pRol ? '' : ' is-on') + '" data-prol="">Todas</button>';
      orden.forEach(function (k) {
        var g = vistos[k];
        h += '<button type="button" class="filter-chip' + (normText(pRol) === k ? ' is-on' : '')
          + '" data-prol="' + esc(g.label) + '">' + esc(g.label) + ' <span class="n">' + g.n + '</span></button>';
      });
      return h + '</div>';
    }
    function personDatos(r) {
      var out = [];
      if (personColOn('phone') && r.phone) out.push('<span><i class="fa fa-phone"></i> ' + esc(r.phone) + '</span>');
      if (personColOn('email') && r.email) out.push('<span><i class="fa fa-envelope"></i> ' + esc(r.email) + '</span>');
      if (personColOn('dni') && r.dni) out.push('<span><i class="fa fa-id-card"></i> ' + esc(r.dni) + '</span>');
      if (personColOn('birth_date') && r.birth_date) out.push('<span><i class="fa fa-cake-candles"></i> ' + esc(fechaEs(r.birth_date)) + '</span>');
      return out.length ? '<div class="rm-pdatos">' + out.join('') + '</div>' : '';
    }
    function personViaje(r) {
      if (!personColOn('travel') || !r.travel) return '';
      var t = r.travel;
      if (!t.has_any) return '<div class="rm-sub fst-italic">Sin necesidades de viaje anotadas en su ficha.</div>';
      var marcas = (t.marks || []).map(function (m) {
        return '<span class="rm-tag"><i class="fa ' + esc(m.icon) + '"></i> ' + esc(m.label) + '</span>';
      }).join('');
      var salidas = [];
      if (t.departure_flight) salidas.push('<span><i class="fa fa-plane-departure"></i> ' + esc(t.departure_flight) + '</span>');
      if (t.departure_train) salidas.push('<span><i class="fa fa-train"></i> ' + esc(t.departure_train) + '</span>');
      return (marcas ? '<div class="mt-1">' + marcas + '</div>' : '')
        + (salidas.length ? '<div class="rm-pdatos">' + salidas.join('') + '</div>' : '')
        + (t.notes ? '<div class="small mt-1" style="white-space:pre-wrap;">' + esc(t.notes) + '</div>' : '');
    }
    function personDoc(r) {
      if (!personColOn('doc') || !(r.doc_front || r.doc_back)) return '';
      var h = '<div class="rm-pdoc">';
      [r.doc_front, r.doc_back].forEach(function (u) {
        if (u) h += '<img src="' + esc(u) + '" alt="" data-viewer-src="' + esc(u) + '" data-viewer-kind="IMAGE"'
          + ' data-viewer-name="' + esc((r.doc_kind === 'PASSPORT' ? 'Pasaporte ' : 'DNI ') + (r.name || '')) + '">';
      });
      return h + '</div>';
    }
    /* ⚠️ Solo se avisa de lo que se está VIENDO: si nadie ha pedido ver el DNI, que falte no es una
       tarea. Y de una persona escrita a mano (sin ficha) no se reclama nada: no hay dónde guardarlo. */
    function personFaltan(r) {
      if (!r.missing || !r.has_ficha) return [];
      return r.missing.filter(function (k) { return personColOn(k) || k === 'phone' || k === 'email'; });
    }
    function personColLabel(k) { return personFieldLabel(k); }
    function renderPersonal() {
      if (psub === 'prl') { renderPrl(); return; }
      if (psub === 'viaje') { renderViaje(); return; }
      var rows = personRowsNow().filter(personMatches);
      var addBtn = RO ? '' : '<button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir</button>';
      var colsBtn = RO ? '' : '<button class="btn btn-sm btn-outline-secondary py-0 me-1" data-pcols><i class="fa fa-table-columns me-1"></i>Qué datos se ven</button>';
      var ordenBtn = '<button class="btn btn-sm btn-outline-secondary py-0 me-1" data-porden title="Cambiar el orden">'
        + '<i class="fa ' + (pOrden === 'rol' ? 'fa-user-tag' : 'fa-arrow-down-a-z') + ' me-1"></i>'
        + (pOrden === 'rol' ? 'Por función' : 'Alfabético') + '</button>';
      var exportBtns = '<div class="dropdown d-inline-block me-1"><button class="btn btn-sm btn-outline-secondary py-0" data-bs-toggle="dropdown"><i class="fa fa-share-nodes"></i> Exportar / compartir</button>'
        + '<ul class="dropdown-menu"><li><button class="dropdown-item" data-pexp="pdf"><i class="fa fa-file-pdf fa-fw me-1"></i>Descargar PDF</button></li>'
        + '<li><button class="dropdown-item" data-pexp="xlsx"><i class="fa fa-file-excel fa-fw me-1"></i>Descargar Excel</button></li>'
        + '<li><hr class="dropdown-divider"></li>'
        + '<li><button class="dropdown-item" data-pexp="email"><i class="fa fa-envelope fa-fw me-1"></i>Compartir por email</button></li>'
        + '<li><button class="dropdown-item" data-pexp="wa"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
        + '<li><button class="dropdown-item" data-pexp="sms"><i class="fa fa-comment-sms fa-fw me-1"></i>Por SMS</button></li></ul></div>';
      var buscador = '<div class="rm-pbusca"><i class="fa fa-magnifying-glass"></i>'
        + '<input class="form-control form-control-sm" placeholder="Buscar en el personal…" value="' + esc(pBusca) + '" data-pbusca></div>';
      var html = personalSubtabs()
        + '<div class="rm-toolbar"><div class="text-muted small">Personal de la actividad</div>'
        + '<span>' + ordenBtn + colsBtn + exportBtns + tplBtn('PERSONNEL') + addBtn + '</span></div>'
        + buscador + personRoleChips(personRowsNow());
      if (!(P.personnel || []).length) html += '<div class="rm-empty">Sin personal todavía.</div>';
      else if (!rows.length) html += '<div class="rm-empty">Nadie casa con lo que se está buscando.</div>';

      function fila(r) {
        var menu = RO ? '' : '<div class="dropdown ms-2"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button>'
          + '<ul class="dropdown-menu dropdown-menu-end">'
          + '<li><button class="dropdown-item" data-pedit="' + esc(r.id) + '">Editar</button></li>'
          + (r.has_ficha ? '<li><button class="dropdown-item" data-pfill="' + esc(r.id) + '">Completar sus datos</button></li>' : '')
          + (r.ficha_url ? '<li><a class="dropdown-item" href="' + esc(r.ficha_url) + '" target="_blank">Ver su ficha</a></li>' : '')
          + '<li><button class="dropdown-item text-danger" data-pdel="' + esc(r.id) + '">Eliminar</button></li></ul></div>';
        var faltan = personFaltan(r);
        var aviso = (faltan.length && !RO)
          ? '<div class="rm-pfalta"><i class="fa fa-triangle-exclamation"></i> Falta '
            + faltan.map(personFieldLabel).join(' · ')
            + ' <button type="button" class="btn btn-sm btn-outline-warning py-0 ms-1" data-pfill="' + esc(r.id) + '">Completar</button></div>'
          : '';
        return '<div class="rm-person"><span class="av">' + avatar(r.photo_url) + '</span>'
          + '<div class="flex-grow-1"><div class="nm">' + esc(r.name) + '</div>'
          + (personColOn('role') && r.role ? '<div class="rl">' + esc(r.role) + '</div>' : '')
          + personDatos(r) + personViaje(r) + personDoc(r) + aviso
          + '</div>' + menu + '</div>';
      }
      if (pOrden === 'alfa') {
        var orden = rows.slice().sort(function (a, b) { return normText(a.name).localeCompare(normText(b.name)); });
        if (orden.length) html += '<div class="d-flex flex-column gap-2">' + orden.map(fila).join('') + '</div>';
      } else {
        var groups = {};
        rows.forEach(function (r) { var g = (r.role || '').trim() || 'Sin función'; (groups[g] = groups[g] || []).push(r); });
        Object.keys(groups).sort().forEach(function (g) {
          html += '<div class="rm-group-title">' + esc(g) + ' <span class="n">' + groups[g].length + '</span></div>'
            + '<div class="d-flex flex-column gap-2">' + groups[g].map(fila).join('') + '</div>';
        });
      }
      view.innerHTML = html;
      wirePersonalSubtabs();
      if (!PERS_ROWS) cargaPersonRows(function () { if (psub === 'list') renderPersonal(); });
      var bus = view.querySelector('[data-pbusca]');
      if (bus) {
        bus.addEventListener('input', debounce(function () { pBusca = normText(bus.value.trim()); renderPersonal(); }, 200));
        if (pBusca) { bus.focus(); try { bus.setSelectionRange(bus.value.length, bus.value.length); } catch (_) {} }
      }
      view.querySelectorAll('[data-prol]').forEach(function (b) {
        b.addEventListener('click', function () { pRol = b.getAttribute('data-prol') || ''; renderPersonal(); });
      });
      var ob = view.querySelector('[data-porden]');
      if (ob) ob.addEventListener('click', function () { pOrden = (pOrden === 'rol' ? 'alfa' : 'rol'); renderPersonal(); });
      view.querySelectorAll('[data-pexp]').forEach(function (b) {
        b.addEventListener('click', function () { exportarPersonal(b.getAttribute('data-pexp')); });
      });
      if (RO) return;
      var cb = view.querySelector('[data-pcols]');
      if (cb) cb.addEventListener('click', openPersonCols);
      view.querySelector('[data-add]').addEventListener('click', function () { openPersonEditor({ id: '', kind: 'MANUAL', ref_id: '', name: '', role: '', phone: '', email: '', photo_url: '' }); });
      view.querySelectorAll('[data-pedit]').forEach(function (b) { b.addEventListener('click', function () { openPersonEditor(JSON.parse(JSON.stringify(personById(b.getAttribute('data-pedit'))))); }); });
      view.querySelectorAll('[data-pfill]').forEach(function (b) { b.addEventListener('click', function () { openPersonFill(b.getAttribute('data-pfill')); }); });
      view.querySelectorAll('[data-pdel]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('¿Eliminar del personal?')) return;
          postJson(ep('/personal/delete'), { id: b.getAttribute('data-pdel') }).then(function (r) { PERS_ROWS = null; apply(r); });
        });
      });
    }
    /* El PDF y el Excel se llevan LO QUE SE VE (el botón «Qué datos se ven»): no se pregunta dos
       veces lo mismo con un par de `confirm()`, que es lo que había. */
    function exportarPersonal(mode) {
      if (mode === 'pdf' || mode === 'xlsx') { window.open(ep('/personal/' + mode), '_blank'); return; }
      var lines = ['Listado de personal'];
      personRowsNow().filter(personMatches).forEach(function (r) {
        lines.push((r.name || '') + (r.role ? ' · ' + r.role : '') + (r.phone ? ' · ' + r.phone : ''));
      });
      var text = lines.join('\n');
      if (mode === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      else if (mode === 'sms') window.location.href = 'sms:?&body=' + encodeURIComponent(text);
      else window.location.href = 'mailto:?subject=' + encodeURIComponent('Listado de personal') + '&body=' + encodeURIComponent(text);
    }
    function openPersonCols() {
      var actuales = personCols();
      var h = '<div class="text-muted small mb-2">Lo que se marque se ve en el listado y es lo que se lleva el PDF y el Excel. Se guarda en esta '
        + (IS_TEMPLATE ? 'plantilla' : 'actividad') + '.</div>';
      PERSON_FIELDS.forEach(function (f) {
        h += '<label class="rm-pcol"><input type="checkbox" value="' + esc(f.key) + '"'
          + (actuales.indexOf(f.key) >= 0 ? ' checked' : '') + '>'
          + '<span><i class="fa ' + esc(f.icon) + ' fa-fw me-1"></i>' + esc(f.label) + '</span></label>';
      });
      var m = openModal('rmPersonColsModal', 'modal-sm', 'Qué datos se ven', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPersonColsModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () {
          var cols = [].map.call(m.querySelectorAll('input:checked'), function (c) { return c.value; });
          var i = bs('rmPersonColsModal'); if (i) i.hide();
          postJson(ep('/personal/columnas'), { cols: cols }).then(function (resp) {
            if (resp && resp.ok) { PERSON_COLS = resp.cols || cols; P.personnel_cols = PERSON_COLS; renderPersonal(); }
            else alert((resp && resp.error) || 'No se pudo guardar.');
          });
        }),
      ]);
    }
    /* Completar lo que le falta a una persona. ⚠️ Se guarda EN SU FICHA, así que no hay que volver a
       escribirlo en la siguiente actividad; lo que ya está escrito allí no se pisa (eso se corrige
       en su ficha, que es la fuente de verdad). */
    function openPersonFill(pid) {
      var r = personRowById(pid) || personById(pid) || {};
      // Solo lo que ESA ficha puede guardar (lo dice el servidor: un tercero no tiene fecha de
      // nacimiento y a alguien de la oficina no se le pregunta el correo, que es el de acceso).
      var puede = r.fillable || ['phone', 'email', 'dni'];
      var faltan = personFaltan(r).filter(function (k) { return puede.indexOf(k) >= 0; });
      if (!faltan.length) faltan = puede;
      if (!faltan.length) { alert('De esta persona no hay nada que completar aquí: no tiene ficha.'); return; }
      var campos = [
        ['phone', 'Teléfono', 'tel'], ['email', 'Email', 'email'],
        ['dni', 'DNI / NIE', 'text'], ['birth_date', 'Fecha de nacimiento', 'date'],
      ].filter(function (c) { return faltan.indexOf(c[0]) >= 0; });
      var h = '<div class="text-muted small mb-2">Se guarda en la ficha de <strong>' + esc(r.name || '') + '</strong>, así que no habrá que volver a escribirlo.</div><div class="row g-2">';
      campos.forEach(function (c) {
        h += '<div class="col-md-6"><label class="form-label">' + esc(c[1]) + '</label>'
          + '<input class="form-control" type="' + c[2] + '" data-f="' + c[0] + '" value=""></div>';
      });
      h += '</div>';
      if (r.ficha_url) h += '<div class="mt-2"><a href="' + esc(r.ficha_url) + '" target="_blank">Abrir su ficha</a></div>';
      var m = openModal('rmPersonFillModal', 'modal-md', 'Completar sus datos', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPersonFillModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () {
          var d = { person_id: pid };
          m.querySelectorAll('[data-f]').forEach(function (i) { d[i.getAttribute('data-f')] = i.value.trim(); });
          if (!Object.keys(d).some(function (k) { return k !== 'person_id' && d[k]; })) { alert('No has escrito nada.'); return; }
          var i = bs('rmPersonFillModal'); if (i) i.hide();
          postJson(ep('/personal/completar'), d).then(function (resp) {
            if (resp && resp.ok) {
              PERS_ROWS = resp.rows || null;
              if ((resp.ficha || []).length) rmToast('Guardado en su ficha: ' + resp.ficha.join(', '));
              apply(resp);
            } else alert((resp && resp.error) || 'No se pudo guardar.');
          });
        }),
      ]);
    }
    // ---------------------------------------------------------------- PRL (alta y riesgos laborales)
    var PRL_ALTA_BY_TYPE = { AUTONOMO: 'AUTONOMO_RECIBO', PUNTUAL: 'ALTA_SS', EMPRESA: 'ITA' };
    var PRL_CACHE = null;
    function renderPrl() {
      view.innerHTML = personalSubtabs() + '<div class="rm-empty">Cargando estado de PRL…</div>';
      wirePersonalSubtabs();
      fetch(ep('/prl'), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (resp) { PRL_CACHE = resp; drawPrl(resp); })
        .catch(function () { view.innerHTML = personalSubtabs() + '<div class="rm-empty text-danger">No se pudo cargar el PRL.</div>'; wirePersonalSubtabs(); });
    }
    function prlIcon(row, slotKey, label) {
      var slot = row[slotKey] || {};
      var ok = !!slot.ok;
      var cls = ok ? 'text-success' : 'text-danger';
      var icon = ok ? 'fa-circle-check' : 'fa-circle-xmark';
      var title = label + ': ' + (ok ? 'en regla' : 'pendiente');
      if (!ok && slot.doc && slot.doc.status === 'REJECTED') { icon = 'fa-circle-exclamation'; title = label + ': documento rechazado'; }
      return '<button type="button" class="btn btn-link p-0 ' + cls + '" style="font-size:1.35rem;line-height:1;" title="' + esc(title) + '" data-prl-slot="' + slotKey + '" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa ' + icon + '"></i><span class="d-block small text-muted" style="font-size:.62rem;">' + label + '</span></button>';
    }
    function drawPrl(resp) {
      if (!resp || !resp.ok) { view.innerHTML = personalSubtabs() + '<div class="rm-empty text-danger">No se pudo cargar el PRL.</div>'; wirePersonalSubtabs(); return; }
      var rows = resp.rows || [];
      var exportBtns = '<div class="dropdown d-inline-block me-1"><button class="btn btn-sm btn-outline-secondary py-0" data-bs-toggle="dropdown"><i class="fa fa-share-nodes"></i> Exportar / compartir</button>'
        + '<ul class="dropdown-menu"><li><button class="dropdown-item" data-prlexp="pdf"><i class="fa fa-file-pdf fa-fw me-1"></i>Descargar PDF</button></li>'
        + '<li><button class="dropdown-item" data-prlexp="xlsx"><i class="fa fa-file-excel fa-fw me-1"></i>Descargar Excel</button></li>'
        + '<li><hr class="dropdown-divider"></li>'
        + '<li><button class="dropdown-item" data-prlexp="email"><i class="fa fa-envelope fa-fw me-1"></i>Compartir por email</button></li>'
        + '<li><button class="dropdown-item" data-prlexp="wa"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
        + '<li><button class="dropdown-item" data-prlexp="sms"><i class="fa fa-comment-sms fa-fw me-1"></i>Por SMS</button></li></ul></div>';
      var askAll = RO ? '' : '<button class="btn btn-sm btn-danger py-0" data-prl-askall><i class="fa fa-paper-plane me-1"></i>Solicitar documentación a todos</button>';
      var html = personalSubtabs() + '<div class="rm-toolbar"><div class="text-muted small">Alta y prevención de riesgos laborales</div><span>' + exportBtns + askAll + '</span></div>';
      if (!rows.length) html += '<div class="rm-empty">Sin personal todavía: añade personas en la pestaña Personal.</div>';
      html += '<div class="d-flex flex-column gap-2">';
      rows.forEach(function (row) {
        var typeBadge;
        if (row.worker_type) {
          typeBadge = '<span class="badge text-bg-light border">' + esc(row.worker_type_label) + '</span>';
        } else {
          typeBadge = '<span class="badge text-bg-secondary">Sin tipo</span>';
        }
        if (!RO) {
          typeBadge = '<div class="dropdown d-inline-block"><button type="button" class="btn btn-sm p-0 border-0 bg-transparent" data-bs-toggle="dropdown">' + typeBadge + ' <i class="fa fa-caret-down small text-muted"></i></button><ul class="dropdown-menu">'
            + '<li><button class="dropdown-item" data-prl-type="AUTONOMO" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa fa-user-tie fa-fw me-1"></i>Autónomo</button></li>'
            + '<li><button class="dropdown-item" data-prl-type="PUNTUAL" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa fa-user-clock fa-fw me-1"></i>Alta temporal</button></li>'
            + '<li><button class="dropdown-item" data-prl-type="EMPRESA" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa fa-building-user fa-fw me-1"></i>Empleado de empresa</button></li></ul></div>';
        }
        var menu = RO ? '' : '<div class="dropdown ms-1"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button><ul class="dropdown-menu dropdown-menu-end">'
          + '<li><h6 class="dropdown-header">Solicitar documentación</h6></li>'
          + '<li><button class="dropdown-item" data-prl-ask="email" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa fa-envelope fa-fw me-1"></i>Por correo</button></li>'
          + '<li><button class="dropdown-item" data-prl-ask="wa" data-prl-person="' + esc(row.personnel_id) + '"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
          + '<li><hr class="dropdown-divider"></li>'
          + '<li><button class="dropdown-item text-danger" data-pdel="' + esc(row.personnel_id) + '"><i class="fa fa-trash fa-fw me-1"></i>Eliminar del personal</button></li></ul></div>';
        html += '<div class="rm-person align-items-center"><span class="av">' + avatar(row.photo_url) + '</span>'
          + '<div class="flex-grow-1 min-w-0"><div class="nm">' + esc(row.full_name || row.name) + '</div><div class="rl">' + esc(row.role || '') + (row.dni ? ' · ' + esc(row.dni) : '') + '</div><div class="mt-1">' + typeBadge + '</div></div>'
          // Baja, EPIs y renuncia médica: solo se enseñan a quien se le piden (cuenta ajena).
          + '<div class="d-flex align-items-start gap-3 text-center me-1">' + prlIcon(row, 'alta', 'Alta')
          + ((row.baja && row.baja.required) ? prlIcon(row, 'baja', 'Baja') : '')
          + prlIcon(row, 'informacion', 'Información') + prlIcon(row, 'formacion', 'Formación')
          + ((row.epis && row.epis.required) ? prlIcon(row, 'epis', 'EPIs') : '')
          + ((row.renuncia_medico && row.renuncia_medico.required) ? prlIcon(row, 'renuncia_medico', 'Renuncia médico') : '') + '</div>'
          + menu + '</div>';
      });
      html += '</div>';
      view.innerHTML = html;
      wirePersonalSubtabs();
      wirePrl(rows, resp);
    }
    function prlRowById(rows, pid) { for (var i = 0; i < rows.length; i++) { if (rows[i].personnel_id === pid) return rows[i]; } return null; }
    function wirePrl(rows, resp) {
      view.querySelectorAll('[data-prlexp]').forEach(function (b) {
        b.addEventListener('click', function () {
          var mode = b.getAttribute('data-prlexp');
          if (mode === 'pdf' || mode === 'xlsx') { window.open(ep('/prl/' + mode), '_blank'); return; }
          var lines = ['Listado de Alta y PRL'];
          rows.forEach(function (r) {
            lines.push((r.full_name || r.name) + (r.worker_type_label ? ' · ' + r.worker_type_label : '')
              + ' · Alta: ' + (r.alta.ok ? 'OK' : 'PENDIENTE') + ' · Información: ' + (r.informacion.ok ? 'OK' : 'PENDIENTE') + ' · Formación: ' + (r.formacion.ok ? 'OK' : 'PENDIENTE'));
          });
          var text = lines.join('\n');
          if (mode === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
          else if (mode === 'sms') window.location.href = 'sms:?&body=' + encodeURIComponent(text);
          else window.location.href = 'mailto:?subject=' + encodeURIComponent('Listado de Alta y PRL') + '&body=' + encodeURIComponent(text);
        });
      });
      if (RO) return;
      var askAllBtn = view.querySelector('[data-prl-askall]');
      if (askAllBtn) askAllBtn.addEventListener('click', function () {
        if (!confirm('Se enviará un correo con el enlace de subida a todas las personas a las que les falte algún documento. ¿Continuar?')) return;
        var fd = new FormData(); fd.append('personnel_id', ''); fd.append('channel', 'email');
        postForm(ep('/prl/solicitar'), fd).then(function (r) {
          if (r && r.ok) alert('Correos enviados: ' + r.sent + (r.errors && r.errors.length ? '\nIncidencias:\n' + r.errors.join('\n') : ''));
          else alert('No se pudo enviar la solicitud.');
        });
      });
      view.querySelectorAll('[data-prl-ask]').forEach(function (b) {
        b.addEventListener('click', function () {
          var pid = b.getAttribute('data-prl-person');
          var mode = b.getAttribute('data-prl-ask');
          var row = prlRowById(rows, pid) || {};
          var fd = new FormData(); fd.append('personnel_id', pid); fd.append('channel', mode);
          if (mode === 'email') {
            var to = prompt('Correo de destino:', row.email || '');
            if (to === null) return;
            fd.append('to_email', to.trim());
          }
          postForm(ep('/prl/solicitar'), fd).then(function (r) {
            if (!r || !r.ok) { alert('No se pudo generar la solicitud.'); return; }
            if (mode === 'wa') { (r.wa_links || []).forEach(function (l) { window.open(l.url, '_blank'); }); }
            else if (r.sent) alert('Correo enviado.');
            else alert((r.errors && r.errors.join('\n')) || 'No se pudo enviar el correo.');
          });
        });
      });
      view.querySelectorAll('[data-pdel]').forEach(function (b) {
        b.addEventListener('click', function () { if (!confirm('¿Eliminar del personal?')) return; postJson(ep('/personal/delete'), { id: b.getAttribute('data-pdel') }).then(function (r) { apply(r); renderPrl(); }); });
      });
      view.querySelectorAll('[data-prl-type]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = prlRowById(rows, b.getAttribute('data-prl-person'));
          if (!row) return;
          if (!row.promoter_id) { alert('Esta persona no está vinculada a ningún tercero: edítala en la pestaña Personal y búscala como tercero (o solicítale la documentación, el enlace la vincula solo).'); return; }
          var fd = new FormData(); fd.append('promoter_id', row.promoter_id); fd.append('worker_type', b.getAttribute('data-prl-type'));
          postForm('/prl-docs/tipo', fd).then(function (r) { if (r && r.ok) renderPrl(); else alert('No se pudo guardar el tipo.'); });
        });
      });
      view.querySelectorAll('[data-prl-slot]').forEach(function (b) {
        b.addEventListener('click', function () {
          var row = prlRowById(rows, b.getAttribute('data-prl-person'));
          if (!row) return;
          var slotKey = b.getAttribute('data-prl-slot');
          var slot = row[slotKey] || {};
          if (slot.ok && slot.doc) { openPrlDocModal(row, slotKey, slot.doc); return; }
          if (slot.doc && slot.doc.status === 'REJECTED') { openPrlUploadModal(row, slotKey, slot.doc); return; }
          openPrlUploadModal(row, slotKey, slot.doc || null);
        });
      });
    }
    function prlDocTypeFor(row, slotKey) {
      if (slotKey === 'epis') return 'EPIS';
      if (slotKey === 'renuncia_medico') return 'RENUNCIA_MEDICO';
      if (slotKey === 'informacion') return 'PRL_INFORMACION';
      if (slotKey === 'formacion') return 'PRL_FORMACION';
      return PRL_ALTA_BY_TYPE[row.worker_type] || '';
    }
    function openPrlDocModal(row, slotKey, doc) {
      var h = '<div class="d-flex align-items-center gap-2 mb-2">' + avatar(row.photo_url) + '<div><div class="fw-semibold">' + esc(row.full_name || row.name) + '</div><div class="small text-muted">' + esc(doc.label || '') + (doc.valid_until ? ' · válido hasta ' + esc(doc.valid_until.split('-').reverse().join('/')) : ' · sin caducidad') + '</div></div></div>'
        + '<a class="btn btn-outline-primary btn-sm mb-3" href="' + esc(doc.file_url) + '" target="_blank" rel="noopener"><i class="fa fa-eye me-1"></i>Ver documento</a>'
        + '<div class="border-top pt-2"><label class="form-label small">Rechazar con un mensaje (se le enviará por correo para que lo vuelva a subir):</label><textarea class="form-control" rows="2" data-prl-reject-msg placeholder="Motivo del rechazo…"></textarea></div>';
      var m = openModal('rmPrlDocModal', 'modal-md', 'Documento de ' + (slotKey === 'alta' ? 'alta' : slotKey), h, [
        btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmPrlDocModal'); if (i) i.hide(); }),
        btn('Rechazar documento', 'btn-danger', function () {
          var msg = m.querySelector('[data-prl-reject-msg]').value.trim();
          if (!confirm('¿Rechazar este documento? Se avisará a la persona para que lo vuelva a subir.')) return;
          var fd = new FormData(); fd.append('reason', msg);
          postForm('/prl-docs/' + doc.id + '/rechazar', fd).then(function (r) {
            var i = bs('rmPrlDocModal'); if (i) i.hide();
            if (r && r.ok) renderPrl(); else alert('No se pudo rechazar.');
          });
        })
      ]);
    }
    function openPrlUploadModal(row, slotKey, prevDoc) {
      if (!row.promoter_id) { alert('Esta persona no está vinculada a ningún tercero: edítala en la pestaña Personal y búscala como tercero, o solicítale la documentación por correo/WhatsApp (el enlace la vincula solo).'); return; }
      var docType = prlDocTypeFor(row, slotKey);
      if (!docType) { alert('Primero elige el tipo de trabajador (autónomo, alta temporal o empresa) en la etiqueta de la persona.'); return; }
      var labels = (PRL_CACHE && PRL_CACHE.doc_labels) || {};
      var h = '<div class="small text-muted mb-2">' + esc(labels[docType] || docType) + ' de <strong>' + esc(row.full_name || row.name) + '</strong>.'
        + (prevDoc && prevDoc.status === 'REJECTED' && prevDoc.reject_reason ? '<div class="text-danger mt-1">Rechazado: ' + esc(prevDoc.reject_reason) + '</div>' : '') + '</div>'
        + '<input type="file" class="form-control" accept="application/pdf,image/*" data-prl-file>'
        + '<div class="form-text">Se detectará automáticamente la fecha de validez del documento.</div>'
        + '<div class="small mt-2 d-none" data-prl-upmsg></div>';
      var m = openModal('rmPrlUpModal', 'modal-md', 'Subir documento', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPrlUpModal'); if (i) i.hide(); }),
        btn('Subir', 'btn-primary', function () {
          var inp = m.querySelector('[data-prl-file]');
          if (!inp.files.length) { alert('Elige un archivo.'); return; }
          var fd = new FormData();
          fd.append('owner_type', 'PROMOTER');
          fd.append('owner_id', row.promoter_id);
          fd.append('doc_type', docType);
          if (row.worker_type) fd.append('worker_type', row.worker_type);
          var cid = (base.match(/\/hoja-ruta\/[^/]+\/([0-9a-f-]{36})/) || [])[1];
          if (cid) fd.append('concert_id', cid);
          fd.append('file', inp.files[0]);
          var msg = m.querySelector('[data-prl-upmsg]');
          msg.classList.remove('d-none'); msg.className = 'small mt-2 text-muted'; msg.textContent = 'Subiendo…';
          postForm('/prl-docs/subir', fd).then(function (r) {
            if (r && r.ok) {
              var i = bs('rmPrlUpModal'); if (i) i.hide();
              if (r.warning) alert(r.warning);
              renderPrl();
            } else { msg.className = 'small mt-2 text-danger'; msg.textContent = (r && r.error) || 'Error al subir.'; }
          });
        })
      ]);
    }
    /* ⚠️ El personal se busca en TODA la base: la oficina, los integrantes de los artistas y los
       terceros —con su foto y diciendo qué es cada uno—; y lo que no esté se crea al vuelo. Así no
       se teclea a mano a alguien que ya tenemos (y que trae su DNI, su teléfono y su viaje). */
    function openPersonEditor(p) {
      var editing = !!p.id;
      var h = '';
      if (!editing) {
        h += '<div class="mb-2"><label class="form-label">Buscar a quien va</label>'
          + '<div class="rm-psearch"><input class="form-control" placeholder="Escribe un nombre: la oficina, los artistas y los terceros…" data-psearch>'
          + '<button type="button" class="btn btn-outline-secondary" data-pnew title="Crear un tercero con lo escrito"><i class="fa fa-plus"></i></button></div>'
          + '<div class="list-group position-absolute d-none" style="z-index:5" data-presults></div>'
          + '<div class="form-text">Al elegir a alguien se traen su teléfono y su email de su ficha.</div></div>';
      }
      h += '<div class="rm-ppick d-none" data-ppick></div>';
      h += '<div class="row g-2">';
      h += '<div class="col-md-7"><label class="form-label">Nombre</label><input class="form-control" data-p="name" value="' + esc(p.name) + '"></div>';
      h += '<div class="col-md-5"><label class="form-label">Función</label><input class="form-control" list="rmRolesList" data-p="role" value="' + esc(p.role) + '" placeholder="Músico, Tour manager…"></div>';
      h += '<div class="col-md-6"><label class="form-label">Teléfono</label><input class="form-control" data-p="phone" value="' + esc(p.phone) + '"></div>';
      h += '<div class="col-md-6"><label class="form-label">Email</label><input class="form-control" data-p="email" value="' + esc(p.email) + '"></div>';
      h += '</div>';
      h += '<datalist id="rmRolesList">' + PERSON_ROLES.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';
      var m = openModal('rmPersonModal', 'modal-md', (editing ? 'Editar' : 'Nuevo') + ' personal', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPersonModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () { savePersonForm(p, m); }),
      ]);
      if (editing) return;
      var pick = m.querySelector('[data-ppick]');
      function elegido(r) {
        p.kind = r.kind || 'PROMOTER'; p.ref_id = r.id; p.photo_url = r.logo_url || '';
        m.querySelector('[data-p="name"]').value = r.label || '';
        if (r.phone) m.querySelector('[data-p="phone"]').value = r.phone;
        if (r.email) m.querySelector('[data-p="email"]').value = r.email;
        pick.innerHTML = '<span class="av">' + avatar(r.logo_url) + '</span><div><div class="fw-semibold">'
          + esc(r.label || '') + '</div>' + (r.sub ? '<div class="rm-sub">' + esc(r.sub) + '</div>' : '') + '</div>'
          + '<button type="button" class="btn btn-sm btn-light ms-auto" data-pclear title="Quitar"><i class="fa fa-xmark"></i></button>';
        pick.classList.remove('d-none');
        pick.querySelector('[data-pclear]').addEventListener('click', function () {
          p.kind = 'MANUAL'; p.ref_id = ''; p.photo_url = '';
          pick.classList.add('d-none'); pick.innerHTML = '';
        });
      }
      function crear(q) {
        if (!q) { alert('Escribe antes el nombre.'); return; }
        createPromoter(q).then(function (r) {
          if (r && r.id) elegido({ kind: 'PROMOTER', id: r.id, label: r.label || q, logo_url: r.logo_url || '', sub: 'Tercero nuevo' });
          else alert((r && r.error) || 'No se pudo crear el tercero.');
        });
      }
      attachSearch(m.querySelector('[data-psearch]'), m.querySelector('[data-presults]'), searchRoadmapPeople,
        elegido, { onCreate: crear });
      m.querySelector('[data-pnew]').addEventListener('click', function () {
        crear((m.querySelector('[data-psearch]').value || '').trim());
      });
    }
    function savePersonForm(p, m) {
      p.name = m.querySelector('[data-p="name"]').value.trim();
      p.role = m.querySelector('[data-p="role"]').value.trim();
      p.phone = m.querySelector('[data-p="phone"]').value.trim();
      p.email = m.querySelector('[data-p="email"]').value.trim();
      if (!p.name) { alert('Falta el nombre.'); return; }
      var i = bs('rmPersonModal'); if (i) i.hide();
      PERS_ROWS = null;   // sus datos de ficha se vuelven a pedir
      postJson(ep('/personal'), p).then(apply);
    }

    // ================================================================ COMPARTIR
    // Dos hojas de ruta: GENERAL y TÉCNICA, cada una con su enlace independiente. Solo se ofrece
    // la que esté activada en la actividad (etiquetas que se marcan al darla de alta).
    var RM_KINDS = [['GENERAL', 'Hoja de ruta general', 'fa-route'], ['TECNICA', 'Hoja de ruta técnica', 'fa-sliders']];

    function openShareModal() {
      var activos = (P.kinds && typeof P.kinds === 'object') ? P.kinds : { GENERAL: true, TECNICA: true };
      var disponibles = RM_KINDS.filter(function (k) { return activos[k[0]] !== false; });
      if (!disponibles.length) {
        openModal('rmShareModal', 'modal-md', 'Compartir hoja de ruta',
          '<div class="text-muted">Esta actividad no tiene ninguna hoja de ruta activada. Actívala en la ficha para poder compartirla.</div>', []);
        return;
      }
      var html = '<div class="text-muted small mb-2">Enlace de <strong>solo lectura</strong>: se pueden descargar los adjuntos, sin poder editar nada. Cada hoja de ruta muestra <strong>los puntos de la agenda marcados con su etiqueta</strong> (por defecto, todos).</div>';
      disponibles.forEach(function (k) {
        html += '<div class="border rounded p-2 mb-2" data-share-kind="' + k[0] + '">'
          + '<div class="fw-semibold small mb-1"><i class="fa ' + k[2] + ' me-1"></i>' + esc(k[1]) + '</div>'
          + '<div data-share-body class="small">Cargando…</div></div>';
      });
      var m = openModal('rmShareModal', 'modal-md', 'Compartir hoja de ruta', html, []);

      disponibles.forEach(function (k) {
        var box = m.querySelector('[data-share-kind="' + k[0] + '"]');
        var body = box.querySelector('[data-share-body]');
        function render(resp) {
          if (!resp || !resp.ok) { body.innerHTML = '<div class="text-danger">No se pudo generar el enlace.</div>'; return; }
          if (!resp.url) {
            body.innerHTML = '<div class="mb-2 text-muted">No hay ningún enlace activo.</div>';
            body.appendChild(btn('Generar enlace', 'btn-primary btn-sm', function () { act('ensure'); }));
            return;
          }
          body.innerHTML = '<div class="input-group input-group-sm mb-2"><input class="form-control" readonly value="' + esc(resp.url) + '"><button class="btn btn-outline-secondary" type="button" data-copy><i class="fa fa-copy"></i></button></div>'
            + '<div class="d-flex gap-2 flex-wrap"><a class="btn btn-sm btn-outline-primary" href="' + esc(resp.url) + '" target="_blank"><i class="fa fa-arrow-up-right-from-square me-1"></i>Abrir</a>'
            + '<button class="btn btn-sm btn-outline-secondary" type="button" data-regen><i class="fa fa-rotate me-1"></i>Regenerar</button>'
            + '<button class="btn btn-sm btn-outline-danger" type="button" data-revoke><i class="fa fa-ban me-1"></i>Anular</button></div>';
          body.querySelector('[data-copy]').addEventListener('click', function () { var inp = body.querySelector('input'); inp.select(); try { if (navigator.clipboard) navigator.clipboard.writeText(resp.url); else document.execCommand('copy'); } catch (_) {} this.innerHTML = '<i class="fa fa-check"></i>'; });
          body.querySelector('[data-regen]').addEventListener('click', function () { if (!confirm('¿Regenerar el enlace? El anterior dejará de funcionar.')) return; act('regenerate'); });
          body.querySelector('[data-revoke]').addEventListener('click', function () { if (!confirm('¿Anular el enlace? Dejará de funcionar.')) return; act('revoke'); });
        }
        function act(action) { body.innerHTML = '<div class="text-muted small">Un momento…</div>'; postJson(ep('/enlace'), { action: action, kind: k[0] }).then(render); }
        act('ensure');
      });
    }

    // ================================================================ CONFIGURAR DÍAS
    function openDaysConfig() {
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function ymd(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
      function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], (+p[1]) - 1, +p[2]); }
      var base = {}; BASE_DAYS.forEach(function (d) { base[String(d).slice(0, 10)] = 1; });
      var content = {};
      (P.agenda || []).forEach(function (it) { if (it.day) content[String(it.day).slice(0, 10)] = 1; var t = it.transport || {}; if (it.day && t.ends_next_day) { var nd = parseYmd(String(it.day).slice(0, 10)); nd.setDate(nd.getDate() + 1); content[ymd(nd)] = 1; } });
      (P.hotels || []).forEach(function (h) { (h.days || []).forEach(function (d) { if (d) content[String(d).slice(0, 10)] = 1; }); });
      function locked(d) { return !!(base[d] || content[d]); }
      var sel = {}; DAYS.forEach(function (d) { sel[d.date] = 1; });
      var firstDay = DAYS.length ? parseYmd(DAYS[0].date) : new Date();
      var cursor = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
      var MON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      var WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
      var m = openModal('rmDaysModal', 'modal-md', 'Configurar días', '<div data-cal></div><div class="text-muted small mt-2">Marca días para añadirlos. Los días del evento y los que ya tienen actividades u hoteles no se pueden quitar.</div>', [btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmDaysModal'); if (i) i.hide(); }), btn('Guardar', 'btn-primary', save)]);
      var calBox = m.querySelector('[data-cal]');
      function draw() {
        var y = cursor.getFullYear(), mo = cursor.getMonth();
        var startDow = (new Date(y, mo, 1).getDay() + 6) % 7;
        var dim = new Date(y, mo + 1, 0).getDate();
        var h = '<div class="d-flex align-items-center justify-content-between mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-prev><i class="fa fa-chevron-left"></i></button><div class="fw-semibold text-capitalize">' + esc(MON[mo]) + ' ' + y + '</div><button type="button" class="btn btn-sm btn-outline-secondary" data-next><i class="fa fa-chevron-right"></i></button></div>';
        h += '<div class="rm-calgrid">';
        WD.forEach(function (w) { h += '<div class="rm-calwd">' + w + '</div>'; });
        var i;
        for (i = 0; i < startDow; i++) h += '<div></div>';
        for (var dn = 1; dn <= dim; dn++) {
          var key = ymd(new Date(y, mo, dn));
          var on = !!sel[key], lk = locked(key);
          h += '<div class="rm-calcell' + (on ? ' on' : '') + (lk ? ' locked' : '') + '" data-d="' + key + '"' + (lk ? ' title="No se puede quitar"' : '') + '>' + dn + (lk && on ? ' <i class="fa fa-lock"></i>' : '') + '</div>';
        }
        h += '</div>';
        calBox.innerHTML = h;
        calBox.querySelector('[data-prev]').addEventListener('click', function () { cursor = new Date(y, mo - 1, 1); draw(); });
        calBox.querySelector('[data-next]').addEventListener('click', function () { cursor = new Date(y, mo + 1, 1); draw(); });
        calBox.querySelectorAll('[data-d]').forEach(function (c) { c.addEventListener('click', function () { var k = c.getAttribute('data-d'); if (locked(k)) return; if (sel[k]) delete sel[k]; else sel[k] = 1; draw(); }); });
      }
      draw();
      function save() {
        var extra = Object.keys(sel).filter(function (d) { return sel[d] && !base[d]; });
        var i = bs('rmDaysModal'); if (i) i.hide();
        postJson(ep('/dias'), { days: extra }).then(apply);
      }
    }

    // ---------------------------------------------------------------- init
    function render() { if (tab === 'agenda') renderAgenda(); else if (tab === 'logistica') renderLogistica(); else if (tab === 'hoteles') renderHoteles(); else renderPersonal(); }
    root.querySelectorAll('[data-rm-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-rm-tab'); root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); }); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
