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
    // ⚠️ LA ACTIVIDAD va la primera, y solo cuando la hay (una plantilla no es ninguna actividad).
    var ACTIVITY = CTX.activity || null;
    var VENUE = CTX.venue || null;            // el recinto (con su mapa y su nota de acceso)
    var SETLIST = CTX.setlist || null;        // el set list de la ficha, tal como está configurado
    var SHOW_REP = !!CTX.show_repertoire;     // ¿se canta? → pestaña Repertorio
    var SETLIST_PDF = CTX.setlist_pdf_url || '';
    var SETLIST_EDIT = CTX.setlist_edit_url || '';
    var HEADER_TOP = !!CTX.header_on_top;     // fuera de la app: la cabecera arriba del todo
    /* ⚠️ EL EDITOR EXTERNO (`ext_editor`): alguien del personal con la marca «puede actualizarla»
       entrando por el portal. Edita los HORARIOS, la LOGÍSTICA y el REPERTORIO; los hoteles y el
       personal los ve (y baja el rooming y el listado, y manda SMS), y lo de la casa —compartir,
       configurar días, plantillas, la nota de acceso del recinto— no lo toca. */
    var EXT = !!CTX.ext_editor;
    var HRO = RO || EXT;                      // hoteles y rooming: solo lectura para el externo
    var PRO = RO || EXT;                      // personal: solo lectura para el externo
    var CAN_ADMIN = !RO && !EXT;              // lo de la casa
    var CAN_CREATE = !RO && !EXT;             // crear terceros al vuelo (sus endpoints piden sesión)
    var AVATAR = (document.body.getAttribute('data-default-avatar-url') || '/static/img/avatar_placeholder.png');
    /* EL ORDEN: Horarios · Logística · Hoteles · Personal · [Repertorio] · y la ACTIVIDAD la ÚLTIMA
       (lo pidió Dani). Una plantilla trae las suyas (`CTX.tabs`) y no se toca. */
    var TABS = (CTX.tabs && CTX.tabs.length) ? CTX.tabs.slice() : ['agenda', 'logistica', 'hoteles', 'personal'];
    if (!(CTX.tabs && CTX.tabs.length)) {
      if (SHOW_REP) TABS.push('repertorio');
      if (ACTIVITY) TABS.push('actividad');
    }
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
    /* `icon` = la CABECERA ROJA de la casa (`sw-head`, la de todas las altas de la app) con su
       icono delante del título. Sin icono, la cabecera de siempre. */
    function openModal(id, size, title, bodyHtml, footerNodes, icon) {
      var m = ensureModal(id, size);
      var head = m.querySelector('.modal-header');
      head.classList.toggle('sw-head', !!icon);
      var t = m.querySelector('.modal-title');
      if (icon) t.innerHTML = '<i class="fa ' + esc(icon) + ' me-2"></i>' + esc(title || '');
      else t.textContent = title || '';
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
    function createMedia(name, tipo) {
      // ⚠️ CON SU TIPO: de lo que sea el medio (radio, tele, prensa…) sale el tipo de la entrevista
      // y su icono, así que crearlo siempre como «OTRO» dejaba la entrevista sin identificar.
      var fd = new FormData(); fd.append('name', name); fd.append('media_type', (tipo || 'OTRO'));
      return postForm('/api/media/create', fd);
    }

    // ============================================================ PLANTILLAS DEL ARTISTA
    // Cargar una plantilla (personal / rooming / hoja de ruta) en esta actividad, o guardar lo que hay
    // ahora COMO plantilla del artista. En el editor de una plantilla el botón no sale (IS_TPL).
    var IS_TPL = !!CTX.is_template;
    function tplBtn(kind) {
      if (RO || IS_TPL || EXT) return '';
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

    /* ================================================================ LA ACTIVIDAD
       Se llama como lo que es (Concierto · Festival · Evento…) y va la ÚLTIMA. Fuera de la app
       (`HEADER_TOP`) su cabecera —la MISMA viñeta— se pinta arriba del todo (#rmHeader).
       Dentro va por VIÑETAS con la cabecera del color corporativo y su icono: PROMOTOR · RECINTO
       (foto, mapa y la nota de ACCESO solo si existe) · la propia actividad (duración, formación y
       las notas que se apunten) · CONTACTOS agrupados por función, con teléfono, correo y WhatsApp.
       Los datos los compone el SERVIDOR (`_roadmap_activity_card`, `_roadmap_venue_card`). */
    function actHeadHtml() {
      var a = ACTIVITY || {};
      var foto = a.photo
        ? '<img class="rm-act__photo" src="' + esc(a.photo) + '" alt="" data-avatar="1">'
        : '<span class="rm-act__photo rm-act__photo--none"><i class="fa ' + esc(a.icon || 'fa-star') + '"></i></span>';
      // ⚠️ EL RECINTO SE PINCHA (si lo hay): abre su pop-up con la foto, cómo llegar y el acceso.
      var datos = (a.rows || []).map(function (f) {
        var esVenue = (f.key === 'venue') && VENUE;
        return '<' + (esVenue ? 'button type="button" data-venue-pop' : 'div') + ' class="rm-act__fact'
          + (esVenue ? ' is-link" title="Ver el recinto"' : '"') + '>'
          + '<i class="fa ' + esc(f.icon || 'fa-circle-info') + '"></i>'
          + '<span class="rm-act__lab">' + esc(f.label) + '</span>'
          + '<b>' + esc(f.value) + '</b>'
          + (esVenue ? '<i class="fa fa-chevron-right rm-act__go"></i></button>' : '</div>');
      }).join('');
      return '<div class="rm-act">'
        + '<div class="rm-act__head">' + foto + '<div>'
        + '<div class="rm-act__eyebrow">' + esc(a.word || 'Actividad') + '</div>'
        + '<div class="rm-act__title">' + esc(a.title || '') + '</div>'
        + (a.subtitle ? '<div class="rm-sub">' + esc(a.subtitle) + '</div>' : '')
        + '</div></div>'
        + (datos ? '<div class="rm-act__facts">' + datos + '</div>' : '')
        + '</div>';
    }
    /* EL RECINTO EN UN POP-UP: la misma información que su viñeta (foto, dirección, aforo, cómo se
       accede y los contactos) para poder verla desde cualquier pestaña, con cómo llegar. */
    function abreVenuePop() {
      var v = VENUE || {};
      var lineas = [v.address, [v.postal_code, v.municipality].filter(Boolean).join(' '),
                    [v.province, v.country].filter(Boolean).join(', ')].filter(Boolean);
      var h = '';
      if (v.photo_url) h += '<img class="rm-venue__photo mb-2" src="' + esc(v.photo_url) + '" alt="" onerror="this.remove()">';
      if (lineas.length) h += '<div class="rm-sub">' + lineas.map(esc).join('<br>') + '</div>';
      var kv = '';
      if (v.covered === true) kv += '<span class="rm-act__fact"><i class="fa fa-umbrella"></i><b>Cubierto</b></span>';
      else if (v.covered === false) kv += '<span class="rm-act__fact"><i class="fa fa-sun"></i><b>Al aire libre</b></span>';
      if (v.capacity_label) kv += '<span class="rm-act__fact"><i class="fa fa-people-group"></i><span class="rm-act__lab">Aforo</span><b>' + esc(v.capacity_label) + '</b></span>';
      if (kv) h += '<div class="rm-kv mt-2">' + kv + '</div>';
      h += accesoHtml(v.access_notes, v, 'Acceso · ' + (v.name || 'Recinto'));
      (v.contacts || []).forEach(function (c) { h += contactRow(c, c.relation || ''); });
      var hrefV = venueMapsHref(v);
      if (hrefV) h += '<div class="rm-goto mt-3"><a class="btn btn-sm btn-outline-secondary rounded-pill" href="'
        + esc(hrefV) + '" target="_blank" rel="noopener" title="' + (hasPin(v) ? 'Al punto de acceso exacto' : 'A la dirección del recinto') + '"><i class="fa fa-map-location-dot me-1"></i>Cómo llegar</a></div>';
      openModal('rmVenueModal', 'modal-md', v.name || 'Recinto', h,
                [btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmVenueModal'); if (i) i.hide(); })]);
    }
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-venue-pop]');
      if (b && root.contains(b) && VENUE) { ev.preventDefault(); abreVenuePop(); }
    }, true);
    function card(icon, title, body, right, cls) {
      return '<div class="rm-card' + (cls ? ' ' + cls : '') + '">'
        + '<div class="rm-card__head"><i class="fa ' + esc(icon) + '"></i><span>' + esc(title) + '</span>'
        + (right ? '<span class="rm-card__acts">' + right + '</span>' : '') + '</div>'
        + '<div class="rm-card__body">' + body + '</div></div>';
    }
    /* Un teléfono para WhatsApp: solo dígitos y con el prefijo del país (un móvil español de 9
       cifras se completa con el 34). */
    function waLink(phone) {
      var d = String(phone || '').replace(/[^\d+]/g, '');
      if (d.indexOf('+') === 0) d = d.slice(1);
      if (d.indexOf('00') === 0) d = d.slice(2);
      if (d.length === 9 && /^[6789]/.test(d)) d = '34' + d;
      return 'https://wa.me/' + d;
    }
    /* La aplicación de mapas del aparato: en un iPhone, un iPad o un Mac, Apple Maps; en el
       resto, Google Maps. */
    function mapsUrl(q) {
      var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '');
      return apple ? ('https://maps.apple.com/?q=' + encodeURIComponent(q))
                   : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q));
    }
    /* La aplicación de mapas EN UN PUNTO EXACTO (la chincheta del acceso): Apple Maps con `ll`
       (y el nombre como etiqueta), Google con las coordenadas. */
    function mapsUrlAt(lat, lng, label) {
      var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent || '');
      var ll = Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6);
      return apple ? ('https://maps.apple.com/?ll=' + ll + '&q=' + encodeURIComponent(label || 'Punto de acceso'))
                   : ('https://www.google.com/maps/search/?api=1&query=' + ll);
    }
    /* ¿Tiene puesta la chincheta del acceso? (las dos coordenadas, numéricas). */
    function hasPin(o) {
      if (!o) return false;
      var la = o.access_lat, ln = o.access_lng;
      return la !== null && la !== undefined && la !== '' && ln !== null && ln !== undefined && ln !== ''
        && !isNaN(Number(la)) && !isNaN(Number(ln));
    }
    /* EL ICONO DE MAPA, uno solo para toda la hoja de ruta (punto, detalle, hotel), en el azul de la
       casa. `data-ext` para que en la fila de un punto no abra su detalle. */
    function mapLink(href, title) {
      if (!href) return '';
      return '<a class="rm-maplink" href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(title || 'Abrir en Mapas') + '" data-ext><i class="fa fa-map-location-dot"></i></a>';
    }
    /* A dónde lleva el mapa del RECINTO: a la chincheta del acceso si está puesta, si no a su dirección. */
    function venueMapsHref(v) {
      if (!v) return '';
      if (hasPin(v)) return mapsUrlAt(v.access_lat, v.access_lng, 'Acceso · ' + (v.name || 'Recinto'));
      return v.maps_query ? mapsUrl(v.maps_query) : '';
    }
    /* A dónde lleva el mapa de un PUNTO de los horarios: su chincheta si la tiene, si no el sitio escrito. */
    function itemMapsHref(it) {
      if (!it) return '';
      if (hasPin(it)) return mapsUrlAt(it.access_lat, it.access_lng, 'Acceso · ' + (it.title || ''));
      return it.location ? mapsUrl(it.location) : '';
    }
    /* La nota de ACCESO tal como se enseña: el texto y, con la chincheta puesta, el icono que lleva al
       punto exacto (o solo la chincheta, si no hay texto). */
    function accesoHtml(txt, obj, label) {
      var pin = hasPin(obj);
      if (!txt && !pin) return '';
      var link = pin ? ' ' + mapLink(mapsUrlAt(obj.access_lat, obj.access_lng, label || 'Acceso'), 'Ir al punto de acceso exacto') : '';
      return '<div class="rm-acceso mt-2"><b>Acceso:</b> ' + (txt ? esc(txt) : '<span class="rm-sub">Punto exacto en el mapa</span>') + link + '</div>';
    }
    function accessIcon() {
      return L.divIcon({ className: 'rm-pin', html: '<i class="fa fa-door-open"></i>', iconSize: [30, 30], iconAnchor: [15, 30] });
    }
    var OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    /* EL SELECTOR DE LA CHINCHETA (Leaflet): se pincha en el mapa para ponerla en el punto EXACTO de
       acceso, se arrastra para afinarla y se quita con su botón. `state` es {lat, lng} y se escribe
       en sitio; `center` es la referencia (el recinto, en gris) cuando todavía no hay chincheta.
       Devuelve `refresh()`, para llamarla cuando el mapa se enseña después de estar oculto (Leaflet
       mide el hueco al crearse: escondido mide cero). */
    function pinPicker(box, state, center) {
      box.innerHTML = '<div class="rm-pinmap" data-pinmap></div>'
        + '<div class="d-flex align-items-center gap-2 mt-1"><span class="rm-sub flex-grow-1" data-pin-txt></span>'
        + '<button type="button" class="btn btn-sm btn-link p-0 text-danger d-none" data-pin-clear><i class="fa fa-xmark me-1"></i>Quitar la chincheta</button></div>';
      var mapEl = box.querySelector('[data-pinmap]'), txt = box.querySelector('[data-pin-txt]'), clr = box.querySelector('[data-pin-clear]');
      var map = null, marker = null;
      function ok() { return state.lat !== null && state.lat !== undefined && state.lat !== '' && state.lng !== null && state.lng !== undefined && state.lng !== '' && !isNaN(Number(state.lat)) && !isNaN(Number(state.lng)); }
      function paintTxt() {
        if (ok()) { txt.textContent = 'Chincheta puesta: el icono de mapa lleva a este punto exacto (arrástrala para afinar).'; clr.classList.remove('d-none'); }
        else { txt.textContent = 'Pincha en el mapa para poner la chincheta en el punto EXACTO de acceso.'; clr.classList.add('d-none'); }
      }
      paintTxt();
      function refresh() { if (map) { try { map.invalidateSize(); } catch (_) {} } }
      ensureLeaflet(function () {
        if (!document.body.contains(mapEl) || map) return;
        var c = ok() ? [Number(state.lat), Number(state.lng)] : (center || [40.4168, -3.7038]);
        var zoom = (ok() || center) ? 17 : 6;
        try {
          map = L.map(mapEl).setView(c, zoom);
          L.tileLayer(OSM_TILES, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
          if (center) L.marker(center, { opacity: 0.55, interactive: false, title: 'El recinto' }).addTo(map);
          function put(latlng) {
            state.lat = +Number(latlng.lat).toFixed(6); state.lng = +Number(latlng.lng).toFixed(6);
            if (!marker) {
              marker = L.marker(latlng, { draggable: true, icon: accessIcon() }).addTo(map);
              marker.on('dragend', function () { put(marker.getLatLng()); });
            } else marker.setLatLng(latlng);
            paintTxt();
          }
          if (ok()) put(L.latLng(Number(state.lat), Number(state.lng)));
          map.on('click', function (e) { put(e.latlng); });
          clr.addEventListener('click', function () {
            if (marker) { map.removeLayer(marker); marker = null; }
            state.lat = null; state.lng = null; paintTxt();
          });
          [150, 450, 1000].forEach(function (ms) { setTimeout(refresh, ms); });
          var mod = box.closest('.modal');
          if (mod) mod.addEventListener('shown.bs.modal', refresh);
        } catch (_) {}
      });
      return { refresh: refresh };
    }
    function contactActs(phone, email) {
      var h = '';
      if (phone) h += '<a href="tel:' + esc(phone) + '" title="Llamar" data-ext><i class="fa fa-phone"></i></a>'
        + '<a class="wa" href="' + esc(waLink(phone)) + '" target="_blank" rel="noopener" title="WhatsApp" data-ext><i class="fa-brands fa-whatsapp"></i></a>';
      if (email) h += '<a href="mailto:' + esc(email) + '" title="Escribir" data-ext><i class="fa fa-envelope"></i></a>';
      return h ? '<span class="rm-contact__acts">' + h + '</span>' : '';
    }
    /* ⚠️ Sin foto, la imagen de «sin foto» de la casa (el muñequito), no el icono suelto. */
    function contactRow(c, sub, extra) {
      var img = c.photo || c.photo_url || AVATAR;
      return '<div class="rm-contact"><span class="av"><img src="' + esc(img) + '" alt="" data-avatar="1"></span>'
        + '<span class="rm-contact__body"><span class="rm-contact__name">' + esc(c.name || '') + '</span>'
        + (sub ? '<span class="rm-sub">' + esc(sub) + '</span>' : '')
        + (c.phone ? '<span class="rm-sub">' + esc(c.phone) + '</span>' : '')
        + (c.email ? '<span class="rm-sub">' + esc(c.email) + '</span>' : '')
        + '</span>' + contactActs(c.phone, c.email) + (extra || '') + '</div>';
    }
    /* Los contactos AÑADIDOS en la hoja de ruta viven en el payload: tras guardar uno se rehace la
       lista que pinta la viñeta (los de la actividad los trae el servidor y no cambian aquí). */
    function syncRoadmapContacts() {
      if (!ACTIVITY) return;
      var fijos = (ACTIVITY.contacts || []).filter(function (c) { return c.source !== 'roadmap'; });
      var propios = (P.contacts || []).filter(function (c) { return c && (c.name || '').trim(); }).map(function (c) {
        return { id: String(c.id || ''), source: 'roadmap', name: c.name, photo: c.photo_url || '', roles: c.role || '',
                 phone: c.phone || '', email: c.email || '' };
      });
      ACTIVITY.contacts = fijos.concat(propios);
    }
    var LEAFLET_LOADING = null;
    function ensureLeaflet(cb) {
      if (window.L && window.L.map) { cb(); return; }
      if (!LEAFLET_LOADING) {
        LEAFLET_LOADING = new Promise(function (resolve) {
          var css = document.createElement('link'); css.rel = 'stylesheet';
          css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
          var js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          js.onload = resolve; js.onerror = resolve; document.head.appendChild(js);
        });
      }
      LEAFLET_LOADING.then(function () { if (window.L && window.L.map) cb(); });
    }
    function venueHasMap(v) { return !!(v && ((v.lat && v.lng) || hasPin(v))); }
    function drawVenueMap() {
      var box = view.querySelector('[data-rm-map]');
      if (!box || !venueHasMap(VENUE)) return;
      ensureLeaflet(function () {
        if (!document.body.contains(box) || box.dataset.done) return;
        box.dataset.done = '1';
        try {
          var puntos = [];
          var map = L.map(box, { scrollWheelZoom: false });
          L.tileLayer(OSM_TILES, { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
          if (VENUE.lat && VENUE.lng) { puntos.push([VENUE.lat, VENUE.lng]); L.marker([VENUE.lat, VENUE.lng], { title: VENUE.name || 'Recinto' }).addTo(map); }
          // LA CHINCHETA DEL ACCESO: el punto exacto por el que se entra (roja, con su puerta).
          if (hasPin(VENUE)) {
            var pa = [Number(VENUE.access_lat), Number(VENUE.access_lng)];
            puntos.push(pa);
            L.marker(pa, { icon: accessIcon(), title: 'Punto de acceso' }).addTo(map);
          }
          if (puntos.length > 1) map.fitBounds(puntos, { padding: [24, 24], maxZoom: 17 }); else map.setView(puntos[0], 15);
          setTimeout(function () { try { map.invalidateSize(); if (puntos.length > 1) map.fitBounds(puntos, { padding: [24, 24], maxZoom: 17 }); } catch (_) {} }, 250);
        } catch (_) {}
      });
    }
    function renderActividad() {
      var a = ACTIVITY || {};
      syncRoadmapContacts();
      var html = HEADER_TOP ? '' : actHeadHtml();
      var tarjetas = '';
      // ── PROMOTOR
      var pr = a.promoter;
      if (pr && pr.name) {
        var logo = pr.logo ? '<img class="rm-logo" src="' + esc(pr.logo) + '" alt="">' : '<span class="rm-logo rm-logo--none"><i class="fa fa-building"></i></span>';
        // El teléfono y el correo, cada uno en su línea: juntos con un «·» se partían mal en una
        // viñeta estrecha (visto en pantalla).
        tarjetas += card('fa-handshake', 'Promotor',
          '<div class="rm-contact">' + logo + '<span class="rm-contact__body"><span class="rm-contact__name">' + esc(pr.name) + '</span>'
          + (pr.note ? '<span class="rm-sub">' + esc(pr.note) + '</span>' : '')
          + (pr.phone ? '<span class="rm-sub">' + esc(pr.phone) + '</span>' : '')
          + (pr.email ? '<span class="rm-sub">' + esc(pr.email) + '</span>' : '')
          + '</span>' + contactActs(pr.phone, pr.email) + '</div>');
      }
      // ── RECINTO
      if (VENUE) {
        var v = VENUE, b = '';
        if (v.photo_url) b += '<img class="rm-venue__photo" src="' + esc(v.photo_url) + '" alt="" onerror="this.remove()">';
        b += '<div class="fw-bold">' + esc(v.name || 'Recinto') + '</div>';
        var lineas = [v.address, [v.postal_code, v.municipality].filter(Boolean).join(' '), [v.province, v.country].filter(Boolean).join(', ')].filter(Boolean);
        if (lineas.length) b += '<div class="rm-sub">' + lineas.map(esc).join('<br>') + '</div>';
        var kv = '';
        if (v.covered === true) kv += '<span class="rm-act__fact"><i class="fa fa-umbrella"></i><b>Cubierto</b></span>';
        else if (v.covered === false) kv += '<span class="rm-act__fact"><i class="fa fa-sun"></i><b>Al aire libre</b></span>';
        if (v.capacity_label) kv += '<span class="rm-act__fact"><i class="fa fa-people-group"></i><span class="rm-act__lab">Aforo</span><b>' + esc(v.capacity_label) + '</b></span>';
        if (kv) b += '<div class="rm-kv mt-2">' + kv + '</div>';
        var hrefC = venueMapsHref(v);
        if (hrefC) b += '<div class="rm-goto mt-2"><a class="btn btn-sm btn-outline-secondary rounded-pill" href="' + esc(hrefC) + '" target="_blank" rel="noopener" title="' + (hasPin(v) ? 'Al punto de acceso exacto' : 'A la dirección del recinto') + '"><i class="fa fa-map-location-dot me-1"></i>Abrir en Mapas</a></div>';
        if (venueHasMap(v)) b += '<div class="rm-map" data-rm-map></div>';
        b += accesoHtml(v.access_notes, v, 'Acceso · ' + (v.name || 'Recinto'));
        (v.contacts || []).forEach(function (c) { b += contactRow(c, c.relation || ''); });
        var acc = (CAN_ADMIN && v.id) ? '<button type="button" class="btn btn-sm btn-link p-0" data-venue-access title="' + ((v.access_notes || hasPin(v)) ? 'Cambiar cómo se accede' : 'Añadir cómo se accede (la nota y la chincheta)') + '"><i class="fa fa-door-open"></i></button>' : '';
        tarjetas += card('fa-location-dot', 'Recinto', b, acc);
      }
      // ── LA PROPIA ACTIVIDAD (se llama como lo que es)
      var e = '';
      if (a.duration) e += '<span class="rm-act__fact"><i class="fa fa-hourglass-half"></i><span class="rm-act__lab">Duración</span><b>' + esc(a.duration) + '</b></span>';
      if (a.formation) e += '<span class="rm-act__fact"><i class="fa fa-users-line"></i><span class="rm-act__lab">Formación</span><b>' + esc(a.formation) + '</b></span>';
      if (a.sings) e += '<span class="rm-act__fact"><i class="fa fa-music"></i><b>Se canta</b></span>';
      var eb = (e ? '<div class="rm-kv">' + e + '</div>' : '')
        + (a.description ? '<div class="rm-sub mt-2" style="white-space:pre-wrap;">' + esc(a.description) + '</div>' : '')
        + (a.notes ? '<div class="rm-nota mt-2"><i class="fa fa-note-sticky me-1"></i>' + esc(a.notes) + '</div>' : '');
      if (eb || CAN_ADMIN) {
        var edN = CAN_ADMIN ? '<button type="button" class="btn btn-sm btn-link p-0" data-act-notes title="' + (a.notes ? 'Cambiar las notas' : 'Añadir notas sobre la actividad') + '"><i class="fa fa-pen"></i></button>' : '';
        tarjetas += card(a.icon || 'fa-star', a.word || 'Actividad', eb || '<div class="rm-sub">Sin duración, formación ni notas todavía.</div>', edN);
      }
      // ── CONTACTOS, agrupados por función
      var cont = a.contacts || [];
      if (cont.length || CAN_ADMIN) {
        var grupos = {}, orden = [];
        cont.forEach(function (c) {
          var g = (c.roles || '').trim() || 'Sin función';
          if (!grupos[g]) { grupos[g] = []; orden.push(g); }
          grupos[g].push(c);
        });
        var cb = '';
        orden.forEach(function (g) {
          cb += '<div class="rm-group-title">' + esc(g) + '</div>';
          grupos[g].forEach(function (c) {
            var del = (CAN_ADMIN && c.source === 'roadmap' && c.id)
              ? '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-1" data-contact-del="' + esc(c.id) + '" title="Quitar"><i class="fa fa-xmark"></i></button>' : '';
            cb += contactRow(c, '', del);
          });
        });
        if (!cont.length) cb = '<div class="rm-sub">Todavía no hay contactos. Añade a quien haga falta: el promotor, la sala, el técnico de la casa…</div>';
        var addC = CAN_ADMIN ? '<button type="button" class="btn btn-sm btn-link p-0" data-contact-add title="Añadir un contacto"><i class="fa fa-plus"></i></button>' : '';
        tarjetas += card('fa-address-book', 'Contactos', cb, addC, 'rm-card--wide');
      }
      html += tarjetas ? '<div class="rm-cards">' + tarjetas + '</div>' : (HEADER_TOP ? '<div class="rm-empty">Sin más datos de la actividad.</div>' : '');
      view.innerHTML = html;
      drawVenueMap();
      if (!CAN_ADMIN) return;
      var bA = view.querySelector('[data-venue-access]');
      if (bA) bA.addEventListener('click', openVenueAccess);
      var bN = view.querySelector('[data-act-notes]');
      if (bN) bN.addEventListener('click', openActivityNotes);
      var bC = view.querySelector('[data-contact-add]');
      if (bC) bC.addEventListener('click', openContactEditor);
      view.querySelectorAll('[data-contact-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('¿Quitar este contacto de la hoja de ruta?')) return;
          postJson(ep('/contacto/delete'), { id: b.getAttribute('data-contact-del') }).then(function (r) { if (apply(r)) syncRoadmapContacts(); });
        });
      });
    }
    /* La nota de ACCESO es un dato del RECINTO (vale para todas sus actividades). */
    function openVenueAccess() {
      var h = '<label class="form-label">Cómo se accede al recinto</label>'
        + '<textarea class="form-control" rows="3" data-acc placeholder="Por dónde entra el equipo, dónde aparca el camión, a quién preguntar…">' + esc(VENUE.access_notes || '') + '</textarea>'
        + '<label class="form-label mt-3"><i class="fa fa-map-pin me-1 text-danger"></i>El punto exacto de acceso</label>'
        + '<div data-access-pin></div>'
        + '<div class="form-text">Se guarda en la ficha del recinto: vale para todas las actividades que se hagan aquí. Con la chincheta puesta, el icono de mapa de la hoja de ruta lleva a ese punto (la app de mapas del iPhone o la que sea).</div>';
      var pin = { lat: VENUE.access_lat, lng: VENUE.access_lng };
      var m = openModal('rmAccessModal', 'modal-lg', 'Acceso · ' + (VENUE.name || 'Recinto'), h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmAccessModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-danger', function () {
          var txt = m.querySelector('[data-acc]').value.trim();
          postJson(ep('/recinto/acceso'), { access_notes: txt, access_lat: pin.lat, access_lng: pin.lng }).then(function (r) {
            if (!r || !r.ok) { alert((r && r.error) || 'No se pudo guardar.'); return; }
            VENUE.access_notes = r.access_notes || '';
            VENUE.access_lat = (r.access_lat === undefined) ? pin.lat : r.access_lat;
            VENUE.access_lng = (r.access_lng === undefined) ? pin.lng : r.access_lng;
            var i = bs('rmAccessModal'); if (i) i.hide();
            renderActividad();
          });
        }),
      ]);
      pinPicker(m.querySelector('[data-access-pin]'), pin, (VENUE.lat && VENUE.lng) ? [VENUE.lat, VENUE.lng] : null);
    }
    function openActivityNotes() {
      var h = '<label class="form-label">Notas sobre ' + esc((ACTIVITY.word || 'la actividad').toLowerCase()) + '</label>'
        + '<textarea class="form-control" rows="4" data-notes>' + esc(ACTIVITY.notes || '') + '</textarea>'
        + '<div class="form-text">Lo que haga falta saber: se ve aquí y en la hoja de ruta que se comparte.</div>';
      var m = openModal('rmActNotesModal', 'modal-md', 'Notas', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmActNotesModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () {
          var txt = m.querySelector('[data-notes]').value.trim();
          postJson(ep('/notas-actividad'), { notes: txt }).then(function (r) {
            if (!apply(r)) return;
            ACTIVITY.notes = (P.activity_notes || '');
            var i = bs('rmActNotesModal'); if (i) i.hide();
            renderActividad();
          });
        }),
      ]);
    }
    /* Añadir un CONTACTO: cualquier tercero de la base (con su foto) y su función; lo que no esté
       se crea al vuelo. Es la misma forma que una persona del personal. */
    function openContactEditor() {
      var c = { kind: 'MANUAL', ref_id: '', name: '', role: '', phone: '', email: '', photo_url: '' };
      var h = '<div class="mb-2"><label class="form-label">Buscar el contacto</label>'
        + '<div class="rm-psearch"><input class="form-control" placeholder="Escribe un nombre…" data-csearch>'
        + (CAN_CREATE ? '<button type="button" class="btn btn-outline-secondary" data-cnew title="Crear un tercero con lo escrito"><i class="fa fa-plus"></i></button>' : '') + '</div>'
        + '<div class="list-group position-absolute d-none" style="z-index:5" data-cresults></div></div>'
        + '<div class="rm-ppick d-none" data-cpick></div>'
        + '<div class="row g-2">'
        + '<div class="col-md-7"><label class="form-label">Nombre</label><input class="form-control" data-c2="name"></div>'
        + '<div class="col-md-5"><label class="form-label">Función</label><input class="form-control" list="rmRolesList2" data-c2="role" placeholder="Producción local, sala, seguridad…"></div>'
        + '<div class="col-md-6"><label class="form-label">Teléfono</label><input class="form-control" data-c2="phone"></div>'
        + '<div class="col-md-6"><label class="form-label">Email</label><input class="form-control" data-c2="email"></div>'
        + '</div><datalist id="rmRolesList2">' + PERSON_ROLES.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';
      var m = openModal('rmContactModal', 'modal-md', 'Añadir un contacto', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmContactModal'); if (i) i.hide(); }),
        btn('Guardar', 'btn-primary', function () {
          ['name', 'role', 'phone', 'email'].forEach(function (k) { c[k] = m.querySelector('[data-c2="' + k + '"]').value.trim(); });
          if (!c.name) { alert('Falta el nombre.'); return; }
          postJson(ep('/contacto'), c).then(function (r) {
            if (!apply(r)) return;
            var i = bs('rmContactModal'); if (i) i.hide();
            syncRoadmapContacts(); renderActividad();
          });
        }),
      ]);
      var pick = m.querySelector('[data-cpick]');
      function elegido(r) {
        c.kind = 'PROMOTER'; c.ref_id = r.id; c.photo_url = r.logo_url || '';
        m.querySelector('[data-c2="name"]').value = r.label || '';
        if (r.phone) m.querySelector('[data-c2="phone"]').value = r.phone;
        if (r.email) m.querySelector('[data-c2="email"]').value = r.email;
        pick.innerHTML = '<span class="av">' + avatar(r.logo_url) + '</span><div><div class="fw-semibold">' + esc(r.label || '') + '</div>'
          + (r.sub ? '<div class="rm-sub">' + esc(r.sub) + '</div>' : '') + '</div>'
          + '<button type="button" class="btn btn-sm btn-light ms-auto" data-cclear title="Quitar"><i class="fa fa-xmark"></i></button>';
        pick.classList.remove('d-none');
        pick.querySelector('[data-cclear]').addEventListener('click', function () { c.kind = 'MANUAL'; c.ref_id = ''; c.photo_url = ''; pick.classList.add('d-none'); });
      }
      function crear(q) {
        if (!q) { alert('Escribe antes el nombre.'); return; }
        createPromoter(q).then(function (r) {
          if (r && r.id) elegido({ id: r.id, label: r.label || q, logo_url: r.logo_url || '', sub: 'Tercero nuevo' });
          else alert((r && r.error) || 'No se pudo crear el tercero.');
        });
      }
      attachSearch(m.querySelector('[data-csearch]'), m.querySelector('[data-cresults]'), searchPromoters, elegido, CAN_CREATE ? { onCreate: crear } : {});
      var bn = m.querySelector('[data-cnew]');
      if (bn) bn.addEventListener('click', function () { crear((m.querySelector('[data-csearch]').value || '').trim()); });
    }

    /* ================================================================ REPERTORIO
       Cuando SE CANTA. Arriba el set list de la ficha (tal como está configurado, con su PDF) y
       debajo el de cada punto de los horarios en el que se canta: sus canciones en orden (se buscan
       en el repertorio del artista, se arrastran para ordenar) y su PDF. Un punto que canta y no
       tiene canciones es la tarea pendiente de producción «Configurar el repertorio». */
    function itemSings(it) {
      return !!(it && (it.sings || (it.interview && it.interview.sings) || (it.promo_meta && it.promo_meta.sings)));
    }
    function itemSongs(it) {
      if (!it) return [];
      if ((it.songs || []).length) return it.songs;
      if (it.interview && (it.interview.songs || []).length) return it.interview.songs;
      return [];
    }
    function fmtDur(sec) {
      sec = parseInt(sec, 10) || 0;
      if (!sec) return '';
      var m = Math.floor(sec / 60), s2 = sec % 60;
      return m + ':' + (s2 < 10 ? '0' : '') + s2;
    }
    function pdfLink(url, title) {
      if (!url) return '';
      return '<a class="btn btn-sm btn-link p-0" href="' + esc(url) + '" target="_blank" rel="noopener" title="' + esc(title || 'Descargar en PDF') + '" data-ext><i class="fa fa-file-pdf"></i></a>';
    }
    var SETLIST_ICONS = (SETLIST && SETLIST.icons) || {};   // cómo se pinta cada icono (lo da el servidor)
    var SETLIST_KIND_ICON = { NOTE: 'fa-note-sticky', SPEECH: 'fa-comment-dots', THANKS: 'fa-hands-clapping' };
    function songCover(songId) {
      if (!songId) return '';
      for (var i = 0; i < SONGS.length; i++) if (String(SONGS[i].id) === String(songId)) return SONGS[i].cover_url || '';
      return '';
    }
    function setlistRows(items) {
      var n = 0, h = '<ol class="rm-setlist">';
      (items || []).forEach(function (it) {
        var kind = String(it.kind || 'SONG').toUpperCase();
        if (kind === 'BREAK') { h += '<li class="rm-setlist__brk">' + (it.title ? '<span>' + esc(it.title) + '</span>' : '&nbsp;') + '</li>'; return; }
        if (kind !== 'SONG') {   // nota · hablar · agradecimientos: su propia línea, en su color
          h += '<li class="rm-setlist__' + kind.toLowerCase() + '"><span class="k"><i class="fa ' + (SETLIST_KIND_ICON[kind] || 'fa-note-sticky') + '"></i></span><span class="t">' + esc(it.title || '') + '</span></li>';
          return;
        }
        n++;
        var cover = songCover(it.song_id);
        var icons = (it.icons || []).map(function (k) { return SETLIST_ICONS[k] || ''; }).join('');
        h += '<li><span class="n">' + n + '</span>' + (cover ? '<img class="c" src="' + esc(cover) + '" alt="" onerror="this.remove()">' : '')
          + '<span class="t">' + esc(it.title || '') + (it.note ? ' <span class="rm-sub">' + esc(it.note) + '</span>' : '') + '</span>'
          + (icons ? '<span class="ic" title="Iconos de la canción">' + icons + '</span>' : '')
          + (it.duration_seconds ? '<span class="d">' + fmtDur(it.duration_seconds) + '</span>' : '') + '</li>';
      });
      return h + '</ol>';
    }
    function renderRepertorio() {
      var html = '<div class="rm-toolbar"><div class="text-muted small">Lo que se canta</div></div>';
      var tarjetas = '';
      if (SETLIST) {
        var right = (SETLIST.exists ? pdfLink(SETLIST_PDF, 'Descargar el repertorio en PDF') : '')
          + (CAN_ADMIN && SETLIST_EDIT ? '<a class="btn btn-sm btn-link p-0 ms-2" href="' + esc(SETLIST_EDIT) + '" title="Se configura en la pestaña Repertorio de la ficha"><i class="fa fa-pen"></i></a>' : '');
        var body = SETLIST.exists
          ? setlistRows(SETLIST.items) + '<div class="rm-sub mt-1">' + SETLIST.count + ' tema' + (SETLIST.count === 1 ? '' : 's') + (SETLIST.total_label && SETLIST.total_label !== '0:00' ? ' · ' + esc(SETLIST.total_label) : '') + '</div>'
          : '<div class="rm-sub">Todavía no está configurado el repertorio de la actividad.' + (CAN_ADMIN && SETLIST_EDIT ? ' <a href="' + esc(SETLIST_EDIT) + '">Configurarlo en la ficha</a>.' : '') + '</div>';
        tarjetas += card('fa-music', 'Repertorio de ' + ((ACTIVITY && ACTIVITY.word) ? ACTIVITY.word.toLowerCase() : 'la actividad'), body, right, 'rm-card--wide');
      }
      var cantan = (P.agenda || []).filter(function (it) { return itemSings(it) && !it.cancelled; });
      cantan.sort(function (a, b2) { if (a.day !== b2.day) return a.day < b2.day ? -1 : 1; return (a.start_time || '99') < (b2.start_time || '99') ? -1 : 1; });
      cantan.forEach(function (it) {
        var ki = kindInfo(it.kind);
        var songs = itemSongs(it);
        var pdf = (songs.length && SETLIST_PDF) ? pdfLink(SETLIST_PDF + (SETLIST_PDF.indexOf('?') >= 0 ? '&' : '?') + 'item=' + encodeURIComponent(it.id), 'Descargar este repertorio en PDF') : '';
        var titulo = (it.title || ki.label) + ' · ' + dayLabel(it.day) + (it.start_time ? ' ' + it.start_time : '');
        tarjetas += card(ki.icon || 'fa-music', titulo, '<div data-rsongs="' + esc(it.id) + '"></div>', pdf, 'rm-card--wide');
      });
      if (!tarjetas) tarjetas = '<div class="rm-empty">Aquí se verá el repertorio en cuanto en algún punto de los horarios se marque que se canta.</div>';
      else tarjetas = '<div class="rm-cards">' + tarjetas + '</div>';
      view.innerHTML = html + tarjetas;
      cantan.forEach(function (it) { var box = view.querySelector('[data-rsongs="' + it.id + '"]'); if (box) itemSongsEditor(box, it); });
    }
    function itemSongsEditor(box, it) {
      var songs = JSON.parse(JSON.stringify(itemSongs(it)));
      var editable = !RO;
      function guarda() {
        return postJson(ep('/item/repertorio'), { id: it.id, songs: songs }).then(function (resp) {
          if (resp && resp.ok) { P = resp.payload || P; P.agenda = P.agenda || []; DAYS = resp.days || DAYS; var x = agendaItem(it.id); if (x) it = x; }
          else alert((resp && resp.error) || 'No se pudo guardar el repertorio.');
        });
      }
      function pinta() {
        var h = '';
        if (!songs.length) h += '<div class="rm-sub' + (editable ? ' text-warning-emphasis' : '') + '"><i class="fa fa-triangle-exclamation me-1"></i>'
          + (editable ? 'Se canta y todavía no tiene canciones: añádelas aquí (es la tarea pendiente de producción).' : 'Repertorio sin configurar.') + '</div>';
        h += '<div class="d-flex flex-column gap-1 mt-1" data-rlist></div>';
        if (editable) {
          h += '<div class="position-relative mt-2"><input class="form-control form-control-sm" placeholder="Buscar canción del repertorio…" data-rsearch>'
            + '<div class="list-group position-absolute d-none w-100" style="z-index:5" data-rresults></div></div>'
            + (SONGS.length ? '' : '<div class="rm-sub mt-1">El artista no tiene canciones en el repertorio de la app.</div>');
        }
        box.innerHTML = h;
        var list = box.querySelector('[data-rlist]');
        songs.forEach(function (sg, i) {
          var row = el('<div class="rm-song"' + (editable ? ' draggable="true"' : '') + ' data-idx="' + i + '">'
            + (editable ? '<span class="h"><i class="fa fa-grip-vertical"></i></span>' : '<span class="n">' + (i + 1) + '</span>')
            + (sg.cover_url ? '<img src="' + esc(sg.cover_url) + '" alt="">' : '')
            + '<div class="flex-grow-1">' + esc(sg.title) + '</div>'
            + (editable ? '<button type="button" class="btn-close btn-sm"></button>' : '') + '</div>');
          if (editable) {
            row.querySelector('.btn-close').addEventListener('click', function () { songs.splice(i, 1); guarda().then(pinta); });
            row.addEventListener('dragstart', function (e) { row.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} });
            row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
            row.addEventListener('dragover', function (e) { e.preventDefault(); });
            row.addEventListener('drop', function (e) {
              e.preventDefault();
              var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
              if (isNaN(from) || from === i) return;
              var mv = songs.splice(from, 1)[0]; songs.splice(i, 0, mv);
              guarda().then(pinta);
            });
          }
          list.appendChild(row);
        });
        if (editable) {
          attachSearch(box.querySelector('[data-rsearch]'), box.querySelector('[data-rresults]'), function (q) {
            var lo = normText(q);
            return Promise.resolve(SONGS.filter(function (sg) { return normText(sg.title || '').indexOf(lo) >= 0; })
              .map(function (sg) { return { id: sg.id, label: sg.title, logo_url: sg.cover_url }; }));
          }, function (r) {
            if (songs.some(function (sg) { return String(sg.song_id) === String(r.id); })) return;
            songs.push({ song_id: r.id, title: r.label, cover_url: r.logo_url || '' });
            guarda().then(pinta);
          });
        }
      }
      pinta();
    }

    function renderAgenda() {
      var map = agendaByDay();
      var tools = (RO || EXT) ? '' : '<div class="ms-auto d-flex gap-1">' + tplBtn('ROADMAP') + '<button class="btn btn-sm btn-outline-secondary" data-share title="Compartir (solo lectura)"><i class="fa fa-share-nodes"></i></button><button class="btn btn-sm btn-outline-secondary" data-cfg title="Configurar días"><i class="fa fa-gear"></i></button></div>';
      var vistos = diasVisibles();
      var html = '<div class="rm-toolbar"><div class="text-muted small">Horarios de la actividad</div>' + tools + '</div>'
        + dayFilter()
        + '<div class="rm-agenda' + ((DAYS || []).length < 2 ? ' rm-agenda--single' : '') + '">';
      vistos.forEach(function (d) { html += dayBlock(d, map[d.date] || []); });
      html += '</div>';
      view.innerHTML = html;
      if (!RO && !EXT) {
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
    /* A QUIÉN AFECTA un punto, como etiqueta: por FUNCIONES, o los NICKS de las personas concretas
       (con su cara; si son varias se deslizan). Lo que es para TODOS no lleva nada. */
    function audienceHtml(it) {
      var aud = (it && it.audience) || {};
      var mode = String(aud.mode || 'ALL').toUpperCase();
      if (mode === 'ROLES' && (aud.roles || []).length) {
        return '<div class="rm-aud">' + aud.roles.map(function (r) { return '<span class="rm-tag"><i class="fa fa-user-tag"></i> ' + esc(r) + '</span>'; }).join('') + '</div>';
      }
      if (mode === 'PEOPLE' && (aud.ids || []).length) {
        var chips = aud.ids.map(function (id) {
          // ⚠️ EL ARTISTA también puede ser el destinatario de un punto (`artist:<id>`): no está en
          // el personal, así que se busca aparte.
          if (String(id).indexOf('artist:') === 0) {
            var a = ARTISTS.filter(function (x) { return 'artist:' + x.id === String(id); })[0];
            return a ? '<span class="rm-nick" title="' + esc(a.name) + '">' + avatar(a.photo_url || AVATAR) + '<span>' + esc(a.name) + '</span></span>' : '';
          }
          var p = personById(id); if (!p) return '';
          return '<span class="rm-nick" title="' + esc(p.name) + (p.role ? ' · ' + esc(p.role) : '') + '">' + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span></span>';
        }).filter(Boolean).join('');
        return chips ? '<div class="rm-aud">' + chips + '</div>' : '';
      }
      return '';
    }
    /* LO QUE ES UNA ENTREVISTA, venga de donde venga: la creada aquí (`interview`) y la espejada
       desde una PROMOCIÓN de prensa (`promo_meta`) se pintan IGUAL, así que se leen con el mismo
       helper y no hay dos formas de pintar lo mismo. */
    function ivMeta(it) {
      var iv = (it && it.interview) || null, pm = (it && it.promo_meta) || null;
      if (!iv && !pm) return null;
      var mod = iv ? (iv.modality || '') : '';
      var mi = IVMODS.filter(function (o) { return o.key === mod; })[0];
      var fk = (iv && iv.formation) || '';
      var fi = FORMATIONS.filter(function (o) { return o.key === fk; })[0];
      return {
        mediaName: (iv && iv.media_name) || (pm && pm.media_name) || '',
        mediaIcon: (iv && (iv.media_icon || mediaIcon(iv.type))) || (pm && pm.media_icon) || 'fa-bullhorn',
        type: (iv && iv.type) || (pm && pm.media_type) || '',
        program: (iv && iv.program) || '',
        modLabel: mi ? mi.label : ((pm && pm.modality_label) || ''),
        modIcon: mi ? mi.icon : ((pm && pm.modality_icon) || 'fa-microphone-lines'),
        zoom: (iv && iv.zoom_url) || '',
        zoomTbc: !!(iv && iv.zoom_tbc),
        call: (iv && iv.call_to && iv.call_to.name) ? iv.call_to : null,
        live: !!((iv && iv.live) || (pm && pm.is_live)),
        formation: fi ? fi.label : ((pm && pm.formation_label) || '')
      };
    }
    /* EL ZOOM se entra DESDE LA HOJA DE RUTA: el icono abre la videollamada (`data-ext`, así que en
       la fila de un punto no abre su detalle). Sin enlace todavía, se dice que está por confirmar. */
    function zoomLink(md) {
      if (!md) return '';
      if (md.zoom) return '<a class="rm-zoomlink" href="' + esc(md.zoom) + '" target="_blank" rel="noopener" title="Entrar en la videollamada" data-ext><i class="fa fa-video"></i></a>';
      return md.zoomTbc ? '<span class="rm-tag tbc"><i class="fa fa-video"></i> Enlace TBC</span>' : '';
    }
    /* A QUIÉN LLAMAN en un phoner: el icono de llamada, la flecha y su cara con su nombre. */
    function callLine(md) {
      if (!md || !md.call) return '';
      var c = md.call;
      return '<div class="rm-call"><i class="fa fa-phone-volume"></i><i class="fa fa-arrow-right rm-call__arrow"></i>'
        + '<span class="rm-nick">' + avatar(c.photo_url || AVATAR) + '<span>' + esc(c.name) + '</span></span>'
        + (c.phone ? '<a href="tel:' + esc(c.phone) + '" data-ext title="Llamar"><i class="fa fa-phone"></i></a>' : '') + '</div>';
    }
    function singTag(it) {
      if (!itemSings(it)) return '';
      var n = itemSongs(it).length;
      return '<span class="rm-tag sing" data-goto-rep title="Ver el repertorio"><i class="fa fa-music"></i> Canta · '
        + (n ? (n + ' tema' + (n === 1 ? '' : 's')) : (RO ? 'sin repertorio' : 'configurar el repertorio')) + '</span>';
    }
    function itemRow(it) {
      var ki = kindInfo(it.kind);
      var cls = 'rm-item' + (!it.confirmed ? ' provisional' : '') + (it.cancelled ? ' cancelled' : '');
      var tags = '';
      if (it.cancelled) tags += '<span class="rm-tag">Cancelado</span>';
      if (!RO) { var shLbl = sheetsLabel(it); if (shLbl) tags += '<span class="rm-tag sheet"><i class="fa fa-share-nodes"></i> ' + esc(shLbl) + '</span>'; }
      var sub = '';
      // UNA ENTREVISTA se lee de un vistazo: de qué medio es (con el icono de lo que es), cómo se
      // hace, si es en directo y, en un phoner, a quién llaman. Da igual que se haya creado aquí o
      // que venga espejada de una PROMOCIÓN de prensa: lo pinta el mismo helper.
      var md = ivMeta(it), callHtml = '';
      if (md) {
        if (md.type) tags += '<span class="rm-tag"><i class="fa ' + esc(md.mediaIcon) + '"></i> ' + esc(md.type) + '</span>';
        if (md.modLabel) tags += '<span class="rm-tag"><i class="fa ' + esc(md.modIcon) + '"></i> ' + esc(md.modLabel) + '</span>';
        if (md.live) tags += '<span class="rm-tag live"><i class="fa fa-tower-broadcast"></i> Directo</span>';
        else if (md.formation) tags += '<span class="rm-tag">' + esc(md.formation) + '</span>';
        // ⚠️ Sin repetir: el título de una entrevista se pone solo con el medio (y el de una
        // espejada de promoción empieza por él), así que ahí no se dice dos veces.
        var linea = [md.mediaName, md.program].filter(Boolean).join(' · ');
        if (linea && normText(it.title || '').indexOf(normText(md.mediaName)) !== 0) sub = esc(linea);
        callHtml = callLine(md);
      }
      // SE CANTA (con cuántos temas: pinchando se va al Repertorio) y las INSTRUCCIONES DE ACCESO.
      tags += singTag(it);
      if (it.access_note || hasPin(it)) tags += '<span class="rm-tag access" title="' + esc(it.access_note || 'Punto exacto de acceso en el mapa') + '"><i class="fa fa-door-open"></i> Acceso</span>';
      var transLine = '';
      if (ki.transport && it.transport) {
        var t = it.transport;
        var route = [t.origin, t.destination].filter(Boolean).map(esc).join(' → ');
        var np = (t.passengers || []).length;
        transLine = '<div class="rm-transport-line">' + (t.logo_url ? '<img src="' + esc(t.logo_url) + '">' : '') + (t.company ? '<span>' + esc(t.company) + '</span>' : '') + (t.number ? '<span>' + esc(t.number) + '</span>' : '') + (route ? '<span>' + route + '</span>' : '') + (t.duration ? '<span>· ' + esc(t.duration) + '</span>' : '') + (np ? '<span>· <i class="fa fa-user-group"></i> ' + np + '</span>' : '') + '</div>';
        if (t.ends_next_day) tags += '<span class="rm-tag plus1">Fin +1</span>';
      }
      var meta = '';
      // EL MAPA: con un sitio escrito, el icono abre la aplicación de mapas del móvil o del Mac.
      meta += mapLink(itemMapsHref(it), hasPin(it) ? 'Ir al punto de acceso exacto' : 'Abrir en Mapas');
      if (md && md.zoom) meta += zoomLink(md);
      if ((it.attachments || []).length) meta += '<span title="Adjuntos"><i class="fa fa-paperclip"></i> ' + it.attachments.length + '</span>';
      if (it.note) meta += '<span title="Nota"><i class="fa fa-note-sticky"></i></span>';
      return '<div class="' + cls + '"' + (RO ? '' : ' draggable="true"') + ' data-item="' + esc(it.id) + '" style="--rm-line:' + esc(ki.color) + '">'
        + '<div class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></div>'
        + '<div class="min-w-0"><div class="rm-time">' + timeLabel(it) + '</div><div class="rm-title">' + esc(it.title || ki.label) + '</div>'
        + (it.location ? '<div class="rm-sub">' + esc(it.location) + '</div>' : '') + (sub ? '<div class="rm-sub">' + sub + '</div>' : '') + callHtml + transLine
        + (tags ? '<div class="rm-tags">' + tags + '</div>' : '') + audienceHtml(it) + '</div>'
        + '<div class="rm-meta">' + meta + '</div></div>';
    }
    /* Un clic dentro de la fila que NO es abrir el detalle: la etiqueta de «canta» (va al
       Repertorio) y los enlaces al mapa o al teléfono (`data-ext`). */
    function clickAparte(e) {
      if (e.target.closest('[data-goto-rep]')) { e.stopPropagation(); goTab('repertorio'); return true; }
      if (e.target.closest('a[data-ext]')) { e.stopPropagation(); return true; }
      return false;
    }
    function goTab(name) {
      if (TABS.indexOf(name) < 0) return;
      tab = name;
      root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-rm-tab') === name); });
      render();
    }
    function bindAgenda() {
      view.querySelectorAll('[data-item]').forEach(function (node) {
        node.addEventListener('click', function (e) { if (clickAparte(e)) return; if (node.classList.contains('dragging')) return; var it = agendaItem(node.getAttribute('data-item')); if (it) openDetail(it); });
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
      var m = openModal('rmTypeModal', 'modal-md', '¿Qué quieres añadir?', grid, [], 'fa-circle-plus');
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
      var d = { id: '', kind: kind, day: day || (DAYS[0] ? DAYS[0].date : ''), start_time: '', end_time: '', tbc: false, confirmed: true, cancelled: false, title: '', location: '', note: '', contact: {}, attachments: [], sheets: { GENERAL: true, TECNICA: true },
                audience: { mode: 'ALL', roles: [], ids: [] }, sings: false, songs: [], access_note: '', access_lat: null, access_lng: null };
      // La ficha ya dice a qué hora abren las puertas: se precumplimenta (se puede cambiar, y se
      // pueden añadir varias aperturas en la misma actividad).
      if (kind === 'APERTURA_PUERTAS' && DOORS) d.start_time = DOORS;
      if (kind === 'ENTREVISTA') d.interview = { type: '', media_id: '', media_name: '', media_logo: '', media_icon: '',
                                                 program: '', modality: '', location_id: '', zoom_url: '', zoom_tbc: false,
                                                 call_to: {}, formation: '', sings: false, live: false, songs: [] };
      if (kindInfo(kind).transport) d.transport = { mode: kind, company: '', logo_url: '', number: '', origin: '', destination: '', duration: '', ends_next_day: false, same_locator: false, locator_all: '', passengers: [] };
      return d;
    }

    // ============================================================ AÑADIR UN PUNTO A LOS HORARIOS
    /* ⚠️⚠️ TODOS LOS PUNTOS SE AÑADEN IGUAL (sep 2026, lo pidió Dani): el MISMO orden de bloques y
       la MISMA estética que el resto de altas de la app —cabecera roja con un icono por paso,
       pastillas, pregunta grande y pie Atrás · Siguiente · Guardar— con el MOTOR de la casa
       (`step_wizard.js`, arrancado a mano porque este asistente se crea por JavaScript).

         1 · Qué es ......... el MEDIO de una entrevista (de él sale el tipo), la compañía de un
                              traslado o, en lo demás, el título.
         2 · Cuándo ......... día, hora de inicio y de fin, «por confirmar» y si ya está cerrado.
         3 · Dónde .......... cómo se hace la entrevista (presencial · phoner · zoom) y lo que
                              necesita cada forma; en lo demás, el sitio y cómo se entra.
         4 · Cómo va a ser .. en directo, si se canta (con su repertorio y su formato) y la nota.
         5 · Contacto ....... en una entrevista, las personas DEL MEDIO con su cara.
         6 · Quién lo ve .... a quién afecta y en qué hoja de ruta sale.                           */
    var IVMODS = CTX.interview_modalities || [];
    var FORMATIONS = CTX.formations || [];
    var ARTISTS = CTX.artists || [];
    var MEDIA_TYPES = CTX.media_types || [];

    /* Una TARJETA de elegir (las de toda la app: `.promo-pick`). `img` manda sobre el icono. */
    function wzPick(o) {
      var vis = o.img ? '<img src="' + esc(o.img) + '" alt="">'
                      : '<i class="fa ' + esc(o.icon || 'fa-circle') + '"></i>';
      return '<label class="promo-pick"><input type="' + (o.multi ? 'checkbox' : 'radio') + '" name="' + esc(o.name) + '"'
        + ' value="' + esc(o.value) + '"' + (o.checked ? ' checked' : '') + (o.attrs || '') + '>'
        + '<span class="promo-pick__box">' + vis
        + '<span class="promo-pick__name">' + esc(o.label) + '</span>'
        + (o.hint ? '<span class="promo-pick__hint">' + esc(o.hint) + '</span>' : '') + '</span></label>';
    }
    function wzQ(icon, txt, hint) {
      return '<div class="sw-step__q"><i class="fa ' + esc(icon) + ' me-2"></i>' + esc(txt) + '</div>'
        + (hint ? '<div class="sw-step__h">' + hint + '</div>' : '');
    }
    /* Un buscador con su botón «+» al lado (crear la ficha que no existe sin salir del asistente). */
    function wzSearch(key, ph, conMas) {
      return '<div class="rm-wz-search">'
        + '<div class="input-group"><span class="input-group-text"><i class="fa fa-magnifying-glass"></i></span>'
        + '<input class="form-control" placeholder="' + esc(ph) + '" data-search="' + key + '">'
        + (conMas ? '<button type="button" class="btn btn-outline-secondary" data-new="' + key + '" title="Crear una ficha nueva"><i class="fa fa-plus"></i></button>' : '')
        + '</div><div class="list-group position-absolute d-none rm-wz-results" data-results="' + key + '"></div></div>';
    }
    /* El modal del asistente. ⚠️ Se REHACE entero en cada apertura: el motor guarda referencias a
       sus pasos y a sus botones, y reutilizar el nodo dejaría listeners viejos apuntando a
       elementos que ya no existen. */
    function openWizardModal(id, title, icon, pasos, onSave, saveLabel) {
      var viejo = document.getElementById(id);
      if (viejo) {
        try { var vi = window.bootstrap ? bootstrap.Modal.getInstance(viejo) : null; if (vi) vi.dispose(); } catch (_) {}
        viejo.remove();
      }
      var cuerpo = '';
      pasos.forEach(function (p, i) {
        cuerpo += '<section class="sw-step" data-step="' + (i + 1) + '" data-title="' + esc(p.title) + '" data-sw-icon="' + esc(p.icon) + '">'
          + wzQ(p.icon, p.q, p.hint) + p.html + '</section>';
      });
      var m = el('<div class="modal fade" id="' + id + '" tabindex="-1" aria-hidden="true">'
        + '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content" data-step-wizard>'
        + '<div class="modal-header sw-head"><h5 class="modal-title"><i class="fa ' + esc(icon) + ' me-2"></i>' + esc(title) + '</h5>'
        + '<ol class="sw-head__steps" data-sw-steps></ol>'
        + '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>'
        + '<div class="modal-body"><div data-sw-progress></div>' + cuerpo + '</div>'
        + '<div class="modal-footer">'
        + '<button type="button" class="btn btn-link px-0 me-auto" data-sw-prev><i class="fa fa-arrow-left me-1"></i>Atrás</button>'
        + '<button type="button" class="btn btn-outline-secondary" data-sw-next>Siguiente<i class="fa fa-arrow-right ms-1"></i></button>'
        + '<button type="button" class="btn btn-danger" data-sw-submit><i class="fa fa-check me-1"></i>' + esc(saveLabel || 'Guardar') + '</button>'
        + '</div></div></div></div>');
      document.body.appendChild(m);
      var root = m.querySelector('[data-step-wizard]');
      m.querySelector('[data-sw-submit]').addEventListener('click', function () { onSave(m); });
      if (window.app33StepWizard) window.app33StepWizard.init(root);
      var inst = bs(id); if (inst) inst.show();
      return m;
    }

    // ------------------------------------------------- editor de un punto (el asistente)
    function openItemEditor(draft) {
      var ki = kindInfo(draft.kind);
      var editing = !!draft.id;
      var esIv = draft.kind === 'ENTREVISTA';
      var esTr = !!ki.transport;
      if (esIv && !draft.interview) draft.interview = { type: '', media_id: '', media_name: '', sings: false, live: false, songs: [] };
      var iv = draft.interview || {};
      var aud = draft.audience || { mode: 'ALL', roles: [], ids: [] };
      var audIds = (aud.ids || []).map(String);
      var dsh = itemSheets(draft);
      var roles = personnelRoles();
      var pasos = [];

      // ---------- 1 · QUÉ ES ----------
      var h1 = '';
      if (esIv) {
        h1 += '<div class="rm-wz-block"><div class="rm-wz-lbl"><i class="fa fa-bullhorn"></i>El medio</div>'
          + '<div class="rm-chip mb-2' + (iv.media_id ? '' : ' d-none') + '" data-media-chip>'
          + '<span data-media-ava>' + avatar(iv.media_logo, iv.media_icon || 'fa-bullhorn') + '</span>'
          + '<span data-media-name>' + esc(iv.media_name || '') + '</span>'
          + '<span class="rm-tag ms-1' + (iv.type ? '' : ' d-none') + '" data-media-type><i class="fa ' + esc(iv.media_icon || 'fa-bullhorn') + '"></i> <span>' + esc(iv.type || '') + '</span></span>'
          + '<button type="button" class="btn-close btn-sm ms-1" data-media-clear title="Quitar el medio"></button></div>'
          + wzSearch('media', 'Busca la radio, la tele, el periódico…', CAN_CREATE)
          + '<div class="rm-wz-new d-none" data-new-media>'
          + '<div class="row g-2 align-items-end"><div class="col-md-5"><label class="form-label small mb-1">Nombre del medio</label>'
          + '<input class="form-control form-control-sm" data-nm-name placeholder="Cadena SER"></div>'
          + '<div class="col-md-7"><label class="form-label small mb-1">¿Qué es?</label>'
          + '<div class="promo-pick-grid" data-nm-types>'
          + MEDIA_TYPES.map(function (t, i2) { return wzPick({ name: 'rmNewMediaType', value: t, icon: mediaIcon(t), label: t, checked: i2 === 0 }); }).join('')
          + '</div></div>'
          + '<div class="col-12 text-end"><button type="button" class="btn btn-sm btn-danger" data-nm-save><i class="fa fa-plus me-1"></i>Crear el medio</button></div></div></div>'
          + '<div class="filter-hint">De lo que sea el medio sale el TIPO de entrevista (radio, tele, prensa…): no hay que decirlo aparte.</div></div>'
          + '<div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-microphone me-1 text-muted"></i>Programa (si lo tiene)</label>'
          + '<input class="form-control" data-iv="program" value="' + esc(iv.program || '') + '" placeholder="La Ventana, El Hormiguero…"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-tag me-1 text-muted"></i>Título del punto</label>'
          + '<input class="form-control" data-f="title" value="' + esc(draft.title) + '" placeholder="Se pone solo con el medio"></div></div>';
      } else if (esTr) {
        var t0 = draft.transport;
        h1 += '<div class="row g-2">'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-building me-1 text-muted"></i>Compañía</label><input class="form-control" data-t="company" value="' + esc(t0.company) + '" placeholder="Iberia, Renfe…"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-hashtag me-1 text-muted"></i>Nº (vuelo, tren…)</label><input class="form-control" data-t="number" value="' + esc(t0.number) + '"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-image me-1 text-muted"></i>Logo de la compañía (URL)</label><input class="form-control" data-t="logo_url" value="' + esc(t0.logo_url) + '"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-tag me-1 text-muted"></i>Título del punto</label><input class="form-control" data-f="title" value="' + esc(draft.title) + '" placeholder="' + esc(ki.label) + '"></div>'
          + '</div>';
      } else {
        h1 += '<div class="rm-wz-kind"><span class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></span>'
          + '<div><div class="fw-semibold">' + esc(ki.label) + '</div><div class="rm-sub">Así es como se ve en los horarios.</div></div></div>'
          + '<div class="mt-3"><label class="form-label small mb-1"><i class="fa fa-tag me-1 text-muted"></i>Título</label>'
          + '<input class="form-control" data-f="title" value="' + esc(draft.title) + '" placeholder="' + esc(ki.label) + '"></div>'
          + '<div class="filter-hint">Sin título se ve «' + esc(ki.label) + '».</div>';
      }
      pasos.push({ title: esIv ? 'Medio' : (esTr ? 'Compañía' : 'Qué es'), icon: esIv ? 'fa-bullhorn' : ki.icon,
                   q: esIv ? '¿De qué medio es la entrevista?' : (esTr ? '¿Con qué compañía?' : '¿Qué es?'),
                   hint: esIv ? 'Se busca entre los medios que ya tenemos; el que no esté se crea aquí mismo con el «+».'
                              : (esTr ? 'Los datos del billete: compañía y número.' : 'Ponle el título con el que quieres verlo en los horarios.'),
                   html: h1 });

      // ---------- 2 · CUÁNDO ----------
      var h2 = '<div class="promo-pick-grid promo-pick-grid--wide mb-3" data-days>'
        + DAYS.map(function (d) {
            return '<label class="promo-pick"><input type="radio" name="rmDay" value="' + esc(d.date) + '"' + (d.date === draft.day ? ' checked' : '') + '>'
              + '<span class="promo-pick__box"><span class="rm-cal"><span class="wd">' + esc(d.weekday) + '</span><span class="num">' + esc(d.day) + '</span><span class="mo">' + esc(d.month) + '</span></span>'
              + '<span class="promo-pick__name">' + esc(d.label) + '</span></span></label>';
          }).join('')
        + '</div>'
        + '<div class="row g-2 align-items-end">'
        + '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa fa-play me-1 text-muted"></i>Empieza</label><input type="time" class="form-control" data-f="start_time" value="' + esc(draft.start_time) + '"></div>'
        + '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa fa-flag-checkered me-1 text-muted"></i>Termina</label><input type="time" class="form-control" data-f="end_time" value="' + esc(draft.end_time) + '"></div>'
        + '<div class="col-md-6"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-f="tbc"' + (draft.tbc ? ' checked' : '') + '><i class="fa fa-hourglass-half"></i>La hora está por confirmar (TBC)</label></div></div>'
        + '</div>'
        + '<div class="rm-wz-lbl mt-3"><i class="fa fa-circle-check"></i>¿Está cerrado?</div>'
        + '<div class="promo-pick-grid promo-pick-grid--wide">'
        + wzPick({ name: 'rmConf', value: '1', icon: 'fa-circle-check', label: 'Confirmado', checked: !!draft.confirmed })
        + wzPick({ name: 'rmConf', value: '0', icon: 'fa-hourglass-half', label: 'Provisional', checked: !draft.confirmed, hint: 'Se ve rayado' })
        + '</div>';
      pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día y a qué hora?',
                   hint: 'Sin hora se ve «TBC». Lo provisional se distingue en la hoja de ruta.', html: h2 });

      // ---------- 3 · DÓNDE ----------
      var accOn = !!(draft.access_note || hasPin(draft));
      var accHtml = '<div class="rm-wz-block"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-f="access_on"' + (accOn ? ' checked' : '') + '><i class="fa fa-door-open"></i>Instrucciones de acceso</label></div>'
        + '<div class="mt-2' + (accOn ? '' : ' d-none') + '" data-access-wrap>'
        + '<textarea class="form-control" rows="2" data-f="access_note" placeholder="Por dónde se entra, a quién preguntar, dónde se aparca…">' + esc(draft.access_note || '') + '</textarea>'
        + '<div class="mt-2" data-access-pin></div></div></div>';
      var h3 = '';
      if (esIv) {
        h3 += '<div class="promo-pick-grid promo-pick-grid--wide mb-3" data-mods>'
          + IVMODS.map(function (o) { return wzPick({ name: 'rmMod', value: o.key, icon: o.icon, label: o.label, checked: (iv.modality || '') === o.key }); }).join('')
          + '</div>'
          // PRESENCIAL: las direcciones que ya tiene el medio y, si no, una nueva.
          + '<div data-mod-panel="PRESENCIAL" class="d-none">'
          + '<div class="rm-wz-lbl"><i class="fa fa-location-dot"></i>¿Dónde?</div>'
          + '<div data-iv-locs><div class="rm-sub">Elige antes el medio para ver sus direcciones guardadas.</div></div>'
          + '<div class="rm-wz-block mt-2" data-address-autocomplete>'
          + '<label class="form-label small mb-1">Otra dirección</label>'
          + '<input class="form-control" data-addr="full" data-f="location" value="' + esc(draft.location) + '" placeholder="Escribe la calle, el municipio…">'
          + '<input type="hidden" data-addr="postal_code"><input type="hidden" data-addr="city"><input type="hidden" data-addr="province"><input type="hidden" data-addr="country">'
          + '<div class="mt-2 d-none" data-loc-save><div class="rm-wz-lbl"><i class="fa fa-floppy-disk"></i>¿Guardamos esta dirección en el medio?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide">'
          + wzPick({ name: 'rmLocSave', value: '1', icon: 'fa-building-circle-check', label: 'Guardarla en el medio', checked: true, hint: 'La próxima vez ya sale' })
          + wzPick({ name: 'rmLocSave', value: '0', icon: 'fa-calendar-day', label: 'Solo para esta entrevista' })
          + '</div></div></div>'
          + accHtml
          + '</div>'
          // ZOOM: el enlace (que puede no tenerse todavía).
          + '<div data-mod-panel="ZOOM" class="d-none">'
          + '<label class="form-label small mb-1"><i class="fa fa-link me-1 text-muted"></i>Enlace de la videollamada</label>'
          + '<input class="form-control" data-iv="zoom_url" value="' + esc(iv.zoom_url || '') + '" placeholder="https://zoom.us/j/…">'
          + '<div class="filter-chips mt-2"><label class="filter-chip"><input type="checkbox" data-iv="zoom_tbc"' + (iv.zoom_tbc ? ' checked' : '') + '><i class="fa fa-hourglass-half"></i>Todavía no lo tenemos (TBC)</label></div>'
          + '<div class="filter-hint">Con el enlace puesto, en la hoja de ruta sale el botón para entrar directamente.</div></div>'
          // PHONER: a quién llaman.
          + '<div data-mod-panel="PHONER" class="d-none">'
          + '<div class="rm-wz-lbl"><i class="fa fa-phone-volume"></i>¿A quién llaman?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-2" data-call-cards></div>'
          + wzSearch('call', 'Busca a alguien de la casa o un tercero…', CAN_CREATE)
          + '<div class="rm-wz-new d-none" data-new-call>'
          + '<div class="row g-2 align-items-end"><div class="col-md-8"><label class="form-label small mb-1">Nombre</label><input class="form-control form-control-sm" data-nc-name></div>'
          + '<div class="col-md-4"><label class="form-label small mb-1">Teléfono</label><input class="form-control form-control-sm" data-nc-phone></div>'
          + '<div class="col-12 text-end"><button type="button" class="btn btn-sm btn-danger" data-nc-save><i class="fa fa-plus me-1"></i>Crear el tercero</button></div></div></div>'
          + '<div class="filter-hint">En la hoja de ruta se ve con el icono de llamada, la flecha y su nombre.</div></div>';
      } else if (esTr) {
        var t1 = draft.transport;
        h3 += '<div class="row g-2">'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-plane-departure me-1 text-muted"></i>Origen</label><input class="form-control" data-t="origin" value="' + esc(t1.origin) + '"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-plane-arrival me-1 text-muted"></i>Destino</label><input class="form-control" data-t="destination" value="' + esc(t1.destination) + '"></div>'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-stopwatch me-1 text-muted"></i>Duración</label><input class="form-control" data-t="duration" value="' + esc(t1.duration) + '" placeholder="1h 20m"></div>'
          + '<div class="col-md-6 d-flex align-items-end"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-t="ends_next_day"' + (t1.ends_next_day ? ' checked' : '') + '><i class="fa fa-moon"></i>Termina al día siguiente (+1)</label></div></div>'
          + '<div class="col-12"><label class="form-label small mb-1"><i class="fa fa-location-dot me-1 text-muted"></i>Punto de encuentro</label>'
          + '<div data-address-autocomplete><input class="form-control" data-addr="full" data-f="location" value="' + esc(draft.location) + '" placeholder="Dónde se recoge al equipo"></div></div>'
          + '</div>' + accHtml;
      } else {
        h3 += '<div data-address-autocomplete><label class="form-label small mb-1"><i class="fa fa-location-dot me-1 text-muted"></i>Lugar</label>'
          + '<input class="form-control" data-addr="full" data-f="location" value="' + esc(draft.location) + '" placeholder="Escribe la calle, el municipio…"></div>'
          + accHtml;
      }
      pasos.push({ title: esIv ? 'Cómo' : 'Dónde', icon: esIv ? 'fa-video' : 'fa-location-dot',
                   q: esIv ? '¿Cómo se hace?' : (esTr ? '¿De dónde a dónde?' : '¿Dónde es?'),
                   hint: esIv ? 'Presencial, por teléfono o por vídeo: cada una pide lo suyo.' : 'El sitio y, si hace falta, cómo se entra.',
                   html: h3 });

      // ---------- 4 · CÓMO VA A SER ----------
      var h4 = '';
      if (esIv) {
        h4 += '<div class="rm-wz-lbl"><i class="fa fa-tower-broadcast"></i>¿Es en directo?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
          + wzPick({ name: 'rmLive', value: '1', icon: 'fa-tower-broadcast', label: 'En directo', checked: !!iv.live })
          + wzPick({ name: 'rmLive', value: '0', icon: 'fa-clapperboard', label: 'Grabado', checked: !iv.live })
          + '</div>';
      }
      // ⚠️ EN UN TRASLADO no se canta: ni la pregunta ni el repertorio vienen a cuento.
      if (!esTr) {
        h4 += '<div class="rm-wz-lbl"><i class="fa fa-music"></i>¿Se canta?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-2">'
          + wzPick({ name: 'rmSings', value: '1', icon: 'fa-microphone', label: 'Sí, canta', checked: !!itemSings(draft) })
          + wzPick({ name: 'rmSings', value: '0', icon: 'fa-ban', label: 'No canta', checked: !itemSings(draft) })
          + '</div>'
          + '<div data-sings-wrap class="' + (itemSings(draft) ? '' : 'd-none') + '">';
        if (esIv) {
          h4 += '<div class="rm-wz-lbl"><i class="fa fa-sliders"></i>¿Cómo?</div>'
            + '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
            + FORMATIONS.map(function (o) { return wzPick({ name: 'rmForm', value: o.key, icon: o.icon, label: o.label, checked: (iv.formation || '') === o.key }); }).join('')
            + '</div>';
        }
        h4 += '<div class="rm-wz-lbl"><i class="fa fa-list-ol"></i>Repertorio <span class="rm-sub">(arrastra para ordenar)</span></div>'
          + wzSearch('song', 'Busca una canción del repertorio…', false)
          + '<div data-songs class="d-flex flex-column gap-1 mt-2"></div>'
          + (isConcert ? '<div class="filter-hint">El repertorio del show va en el set list de la ficha; esto es lo que se cante en ESTE punto.</div>' : '')
          + '</div>';
      }
      h4 += '<div class="mt-3"><label class="form-label small mb-1"><i class="fa fa-note-sticky me-1 text-muted"></i>Nota</label>'
        + '<textarea class="form-control" data-f="note" rows="3" placeholder="Cualquier detalle que haya que tener en cuenta">' + esc(draft.note) + '</textarea></div>';
      if (esTr) {
        h4 += '<div class="rm-wz-block mt-3"><div class="rm-wz-lbl"><i class="fa fa-user-group"></i>Pasajeros</div>'
          + '<div class="filter-chips mb-2"><label class="filter-chip"><input type="checkbox" data-t="same_locator"' + (draft.transport.same_locator ? ' checked' : '') + '><i class="fa fa-ticket"></i>Mismo localizador para todos</label></div>'
          + '<input class="form-control mb-2' + (draft.transport.same_locator ? '' : ' d-none') + '" data-t="locator_all" value="' + esc(draft.transport.locator_all) + '" placeholder="Localizador común">'
          + '<div data-pass></div><button type="button" class="rm-add sm" data-addpass><i class="fa fa-plus"></i> Añadir pasajeros</button></div>';
      }
      if (editing) {
        h4 += '<div class="rm-wz-block mt-3"><div class="rm-wz-lbl"><i class="fa fa-paperclip"></i>Adjuntos</div>'
          + '<div data-atts></div><label class="btn btn-outline-secondary btn-sm mt-1"><i class="fa fa-paperclip"></i> Adjuntar archivo<input type="file" hidden data-attin></label></div>';
      }
      pasos.push({ title: 'Detalles', icon: 'fa-sliders', q: '¿Cómo va a ser?',
                   hint: 'Lo que hay que saber para prepararlo.', html: h4 });

      // ---------- 5 · CONTACTO ----------
      var c0 = draft.contact || {};
      var h5 = (esIv ? '<div data-media-contacts class="mb-2"><div class="rm-sub">Elige antes el medio para ver sus personas.</div></div>' : '')
        + '<div class="rm-chip mb-2' + (c0.name ? '' : ' d-none') + '" data-contact-chip>'
        + '<span data-contact-ava>' + avatar(c0.photo || '', 'fa-user') + '</span><span data-contact-name>' + esc(c0.name || '') + '</span>'
        + '<button type="button" class="btn-close btn-sm ms-1" data-contact-clear title="Quitar"></button></div>'
        + wzSearch('contact', esIv ? 'Otra persona (busca en toda la base)…' : 'Busca a la persona de contacto…', CAN_CREATE)
        + '<div class="row g-2 mt-1">'
        + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-phone me-1 text-muted"></i>Teléfono</label><input class="form-control" data-c="phone" value="' + esc(c0.phone || '') + '"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-envelope me-1 text-muted"></i>Email</label><input class="form-control" data-c="email" value="' + esc(c0.email || '') + '"></div>'
        + '</div>';
      pasos.push({ title: 'Contacto', icon: 'fa-address-card', q: '¿Con quién se habla?',
                   hint: esIv ? 'Las personas del medio salen con su cara; la que no esté se crea aquí y queda en su ficha.' : 'Quien lleva esto, para poder llamar desde la hoja de ruta.',
                   html: h5 });

      // ---------- 6 · QUIÉN LO VE ----------
      var h6 = '<div class="promo-pick-grid promo-pick-grid--wide mb-2">'
        + wzPick({ name: 'rmAudMode', value: 'ALL', icon: 'fa-globe', label: 'A todos', checked: String(aud.mode || 'ALL') === 'ALL', attrs: ' data-aud-mode' })
        + wzPick({ name: 'rmAudMode', value: 'ROLES', icon: 'fa-user-tag', label: 'Por función', checked: aud.mode === 'ROLES', attrs: ' data-aud-mode' })
        + wzPick({ name: 'rmAudMode', value: 'PEOPLE', icon: 'fa-user-check', label: 'A quien yo diga', checked: aud.mode === 'PEOPLE', attrs: ' data-aud-mode' })
        + '</div>'
        + '<div class="filter-chips mb-2' + (aud.mode === 'ROLES' ? '' : ' d-none') + '" data-aud-roles>'
        + (roles.length ? roles.map(function (r) { return '<label class="filter-chip"><input type="checkbox" value="' + esc(r) + '"' + ((aud.roles || []).some(function (x) { return normText(x) === normText(r); }) ? ' checked' : '') + ' data-aud-role><i class="fa fa-user-tag"></i>' + esc(r) + '</label>'; }).join('')
                        : '<span class="filter-hint">Añade antes el personal con su función.</span>')
        + '</div>'
        + '<div class="promo-pick-grid mb-2' + (aud.mode === 'PEOPLE' ? '' : ' d-none') + '" data-aud-people>'
        + ARTISTS.map(function (a) {
            return wzPick({ name: 'rmAudPerson', multi: true, value: 'artist:' + a.id, img: a.photo_url || AVATAR, icon: 'fa-guitar',
                            label: a.name, hint: 'El artista', checked: audIds.indexOf('artist:' + a.id) >= 0, attrs: ' data-aud-person' });
          }).join('')
        + (P.personnel || []).map(function (p) {
            return wzPick({ name: 'rmAudPerson', multi: true, value: String(p.id), img: p.photo_url || AVATAR, icon: 'fa-user',
                            label: p.name, hint: p.role || '', checked: audIds.indexOf(String(p.id)) >= 0, attrs: ' data-aud-person' });
          }).join('')
        + ((P.personnel || []).length || ARTISTS.length ? '' : '<span class="filter-hint">Añade antes el personal.</span>')
        + '</div>'
        + '<div class="filter-hint mb-3">Quien entra por su acceso de externo ve solo lo que le afecta (lo de todos, siempre).</div>'
        + '<div class="rm-wz-lbl"><i class="fa fa-share-nodes"></i>¿En qué hoja de ruta se ve?</div>'
        + '<div class="filter-chips">'
        + SHEETS.map(function (sN) { return '<label class="filter-chip"><input type="checkbox" data-sheet="' + sN.key + '"' + (dsh[sN.key] ? ' checked' : '') + '><i class="fa ' + sN.icon + '"></i>' + sN.label + '</label>'; }).join('')
        + '</div><div class="filter-hint">Las dos van marcadas. Si quitas una, este punto no sale en el enlace de esa hoja (si quitas las dos, se queda solo aquí dentro).</div>';
      pasos.push({ title: 'Quién lo ve', icon: 'fa-users', q: '¿A quién le afecta?',
                   hint: 'Lo de todos lo ve todo el mundo; lo demás, solo a quien se diga.', html: h6 });

      var m = openWizardModal('rmItemModal', (editing ? 'Editar' : 'Añadir') + ' · ' + ki.label, ki.icon, pasos,
                              function (modal) { saveItem(draft, modal); }, editing ? 'Guardar' : 'Añadir');
      wireItemWizard(m, draft, { esIv: esIv, esTr: esTr, editing: editing });
    }

    /* Las FUNCIONES que hay en el personal de esta hoja de ruta (sin repetir), para el «por función». */
    function personnelRoles() {
      var vistos = {}, out = [];
      (P.personnel || []).forEach(function (p) {
        var r = (p.role || '').trim(); if (!r) return;
        var k = normText(r); if (vistos[k]) return;
        vistos[k] = 1; out.push(r);
      });
      return out;
    }
    function readAudience(m) {
      var mode = 'ALL';
      m.querySelectorAll('[data-aud-mode]').forEach(function (r) { if (r.checked) mode = r.value; });
      var roles = [].map.call(m.querySelectorAll('[data-aud-role]:checked'), function (c) { return c.value; });
      var ids = [].map.call(m.querySelectorAll('[data-aud-person]:checked'), function (c) { return c.value; });
      if (mode === 'ROLES' && !roles.length) mode = 'ALL';
      if (mode === 'PEOPLE' && !ids.length) mode = 'ALL';
      return { mode: mode, roles: mode === 'ROLES' ? roles : [], ids: mode === 'PEOPLE' ? ids : [] };
    }
    /* El icono de un tipo de medio (el mismo criterio que el servidor: `_media_type_icon`). */
    function mediaIcon(tipo) {
      var t = normText(tipo);
      if (t === 'tv') return 'fa-tv';
      if (t === 'radio') return 'fa-radio';
      if (t === 'prensa') return 'fa-newspaper';
      if (t === 'digital') return 'fa-globe';
      if (t === 'agencia') return 'fa-briefcase';
      if (t === 'podcast') return 'fa-podcast';
      return 'fa-bullhorn';
    }

    // ------------------------------------------------- cableado del asistente
    function wireItemWizard(m, draft, o) {
      // ---- acceso (la nota y la CHINCHETA del punto exacto)
      var pinBox = m.querySelector('[data-access-pin]');
      if (pinBox) {
        m.rmPin = { lat: draft.access_lat, lng: draft.access_lng };
        m.rmPinPicker = pinPicker(pinBox, m.rmPin, (VENUE && VENUE.lat && VENUE.lng) ? [VENUE.lat, VENUE.lng] : null);
      }
      var accOn = m.querySelector('[data-f="access_on"]'), accWrap = m.querySelector('[data-access-wrap]');
      if (accOn && accWrap) accOn.addEventListener('change', function () {
        accWrap.classList.toggle('d-none', !accOn.checked);
        // El mapa se creó ESCONDIDO (mide cero): al enseñarlo hay que volver a medirlo.
        if (accOn.checked && m.rmPinPicker) setTimeout(m.rmPinPicker.refresh, 60);
      });
      /* ⚠️ Lo mismo al CAMBIAR DE PASO: el mapa puede haber nacido en un paso que no se veía. */
      ['[data-sw-next]', '[data-sw-prev]', '[data-sw-steps]'].forEach(function (sel) {
        var n = m.querySelector(sel);
        if (n) n.addEventListener('click', function () { if (m.rmPinPicker) setTimeout(m.rmPinPicker.refresh, 120); });
      });

      // ---- a quién afecta
      var rolesBox = m.querySelector('[data-aud-roles]'), peopleBox = m.querySelector('[data-aud-people]');
      m.querySelectorAll('[data-aud-mode]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (rolesBox) rolesBox.classList.toggle('d-none', !(r.checked && r.value === 'ROLES'));
          if (peopleBox) peopleBox.classList.toggle('d-none', !(r.checked && r.value === 'PEOPLE'));
        });
      });

      // ---- contacto
      var cChip = m.querySelector('[data-contact-chip]'), cName = m.querySelector('[data-contact-name]'), cAva = m.querySelector('[data-contact-ava]');
      function setContact(c) {
        draft.contact = c || {};
        cName.textContent = draft.contact.name || '';
        if (cAva) cAva.innerHTML = avatar(draft.contact.photo || '', 'fa-user');
        cChip.classList.toggle('d-none', !draft.contact.name);
        m.querySelector('[data-c="phone"]').value = draft.contact.phone || '';
        m.querySelector('[data-c="email"]').value = draft.contact.email || '';
      }
      m.rmSetContact = setContact;
      attachSearch(m.querySelector('[data-search="contact"]'), m.querySelector('[data-results="contact"]'), searchRoadmapPeople, function (r) {
        setContact({ name: r.label, phone: r.phone || '', email: r.email || '', photo: r.logo_url || '',
                     promoter_id: (r.kind === 'PROMOTER' || r.kind === 'MEMBER') ? r.id : '' });
      }, CAN_CREATE ? { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) setContact({ name: r.label || q, promoter_id: r.id, phone: r.contact_phone || '', email: r.contact_email || '', photo: r.logo_url || '' }); }); } } : {});
      var cNew = m.querySelector('[data-new="contact"]');
      if (cNew) cNew.addEventListener('click', function () {
        var q = (m.querySelector('[data-search="contact"]').value || '').trim();
        if (!q) { alert('Escribe antes su nombre.'); return; }
        createPromoter(q).then(function (r) { if (r && r.id) setContact({ name: r.label || q, promoter_id: r.id, phone: r.contact_phone || '', email: r.contact_email || '', photo: r.logo_url || '' }); });
      });
      m.querySelector('[data-contact-clear]').addEventListener('click', function () { setContact({}); });

      // ---- repertorio (se canta) — vale para CUALQUIER punto, no solo para una entrevista
      var singsWrap = m.querySelector('[data-sings-wrap]');
      m.querySelectorAll('input[name="rmSings"]').forEach(function (r) {
        r.addEventListener('change', function () { if (singsWrap) singsWrap.classList.toggle('d-none', !(r.checked && r.value === '1')); });
      });
      renderSongs(m, draft);
      // ⚠️ En un TRASLADO no hay repertorio (ni el buscador): `attachSearch` sobre un campo que no
      // existe reventaría y se llevaría por delante el resto del cableado.
      var buscaCancion = m.querySelector('[data-search="song"]');
      if (buscaCancion) attachSearch(buscaCancion, m.querySelector('[data-results="song"]'), function (q) {
        var lo = normText(q);
        return Promise.resolve(SONGS.filter(function (s) { return normText(s.title).indexOf(lo) >= 0; })
          .map(function (s) { return { id: s.id, label: s.title, logo_url: s.cover_url }; }));
      }, function (r) {
        var arr = itemSongList(draft);
        if (arr.some(function (s) { return String(s.song_id) === String(r.id); })) return;
        arr.push({ song_id: r.id, title: r.label, cover_url: r.logo_url || '' });
        renderSongs(m, draft);
      });

      if (o.esTr) wireTransport(m, draft);
      if (o.editing) {
        renderItemAtts(m, draft);
        m.querySelector('[data-attin]').addEventListener('change', function (e) {
          var f = e.target.files[0]; if (!f) return;
          var fd = new FormData(); fd.append('scope', 'item'); fd.append('id', draft.id); fd.append('file', f);
          postForm(ep('/adjunto'), fd).then(function (resp) {
            if (resp && resp.ok) {
              var it = null; (resp.payload.agenda || []).forEach(function (x) { if (x.id === draft.id) it = x; });
              if (it) { draft.attachments = it.attachments || []; renderItemAtts(m, draft); }
              P = resp.payload; DAYS = resp.days || DAYS;
            }
          });
        });
      }
      if (o.esIv) wireInterview(m, draft);
    }

    /* Las canciones que se cantan en ESTE punto. ⚠️ En una entrevista viven dentro de `interview`
       (es lo que guarda el servidor desde siempre) y se espejan al punto: se lee la lista buena. */
    function itemSongList(draft) {
      if (draft.kind === 'ENTREVISTA') {
        draft.interview = draft.interview || {};
        draft.interview.songs = draft.interview.songs || [];
        return draft.interview.songs;
      }
      draft.songs = draft.songs || [];
      return draft.songs;
    }

    // ------------------------------------------------- entrevista
    function wireInterview(m, draft) {
      var iv = draft.interview;
      var chip = m.querySelector('[data-media-chip]'), mname = m.querySelector('[data-media-name]'),
          mava = m.querySelector('[data-media-ava]'), mtype = m.querySelector('[data-media-type]');
      function pintaMedio() {
        mname.textContent = iv.media_name || '';
        if (mava) mava.innerHTML = avatar(iv.media_logo || '', iv.media_icon || 'fa-bullhorn');
        if (mtype) {
          mtype.classList.toggle('d-none', !iv.type);
          mtype.innerHTML = '<i class="fa ' + esc(iv.media_icon || 'fa-bullhorn') + '"></i> <span>' + esc(iv.type || '') + '</span>';
        }
        chip.classList.toggle('d-none', !iv.media_id);
      }
      function setMedio(r) {
        iv.media_id = r.id || ''; iv.media_name = r.label || r.name || '';
        iv.media_logo = r.logo_url || ''; iv.type = r.media_type || iv.type || '';
        iv.media_icon = mediaIcon(iv.type);
        pintaMedio();
        cargaFichaMedio(m, draft);
      }
      attachSearch(m.querySelector('[data-search="media"]'), m.querySelector('[data-results="media"]'), searchMedia, setMedio, {});
      // El «+»: el medio que no está se crea aquí, diciendo QUÉ es (de ahí sale el tipo).
      var nuevoBox = m.querySelector('[data-new-media]');
      var nuevoBtn = m.querySelector('[data-new="media"]');
      if (nuevoBtn) nuevoBtn.addEventListener('click', function () {
        nuevoBox.classList.toggle('d-none');
        if (!nuevoBox.classList.contains('d-none')) {
          var q = (m.querySelector('[data-search="media"]').value || '').trim();
          nuevoBox.querySelector('[data-nm-name]').value = q;
          nuevoBox.querySelector('[data-nm-name]').focus();
        }
      });
      nuevoBox.querySelector('[data-nm-save]').addEventListener('click', function () {
        var nombre = (nuevoBox.querySelector('[data-nm-name]').value || '').trim();
        if (!nombre) { alert('Ponle nombre al medio.'); return; }
        var tipo = (nuevoBox.querySelector('input[name="rmNewMediaType"]:checked') || {}).value || 'OTRO';
        createMedia(nombre, tipo).then(function (r) {
          if (r && r.id) { setMedio({ id: r.id, label: r.label || nombre, logo_url: r.logo_url || '', media_type: tipo }); nuevoBox.classList.add('d-none'); }
          else alert((r && r.error) || 'No se pudo crear el medio.');
        });
      });
      m.querySelector('[data-media-clear]').addEventListener('click', function () {
        iv.media_id = ''; iv.media_name = ''; iv.media_logo = ''; iv.type = ''; iv.media_icon = '';
        pintaMedio(); m.rmMediaCard = null; pintaUbicaciones(m, draft); pintaContactosMedio(m, draft);
      });

      // Modalidad: cada forma pide lo suyo.
      function aplicaMod() {
        var v = (m.querySelector('input[name="rmMod"]:checked') || {}).value || '';
        m.querySelectorAll('[data-mod-panel]').forEach(function (p) {
          p.classList.toggle('d-none', p.getAttribute('data-mod-panel') !== v);
        });
        if (v === 'PRESENCIAL' && m.rmPinPicker) setTimeout(m.rmPinPicker.refresh, 120);
      }
      m.querySelectorAll('input[name="rmMod"]').forEach(function (r) { r.addEventListener('change', aplicaMod); });
      aplicaMod();

      // La dirección escrita a mano: al escribirla se pregunta si se guarda en el medio.
      var locInput = m.querySelector('[data-f="location"]'), locSave = m.querySelector('[data-loc-save]');
      if (locInput && locSave) {
        locInput.addEventListener('input', function () {
          locSave.classList.toggle('d-none', !(locInput.value || '').trim() || !iv.media_id);
        });
      }

      // A quién llaman (phoner): el artista de un clic, o quien sea.
      pintaLlamada(m, draft);
      attachSearch(m.querySelector('[data-search="call"]'), m.querySelector('[data-results="call"]'), searchRoadmapPeople, function (r) {
        iv.call_to = { kind: (r.kind === 'USER' ? 'USER' : 'PROMOTER'), id: r.id, name: r.label, photo_url: r.logo_url || '', phone: r.phone || '' };
        pintaLlamada(m, draft);
      }, CAN_CREATE ? { onCreate: function (q) { creaLlamada(m, draft, q, ''); } } : {});
      var nc = m.querySelector('[data-new-call]'), ncBtn = m.querySelector('[data-new="call"]');
      if (ncBtn) ncBtn.addEventListener('click', function () {
        nc.classList.toggle('d-none');
        if (!nc.classList.contains('d-none')) {
          nc.querySelector('[data-nc-name]').value = (m.querySelector('[data-search="call"]').value || '').trim();
          nc.querySelector('[data-nc-name]').focus();
        }
      });
      if (nc) nc.querySelector('[data-nc-save]').addEventListener('click', function () {
        var nombre = (nc.querySelector('[data-nc-name]').value || '').trim();
        if (!nombre) { alert('Escribe su nombre.'); return; }
        creaLlamada(m, draft, nombre, (nc.querySelector('[data-nc-phone]').value || '').trim());
        nc.classList.add('d-none');
      });

      if (iv.media_id) cargaFichaMedio(m, draft);
      else { pintaUbicaciones(m, draft); pintaContactosMedio(m, draft); }
    }
    function creaLlamada(m, draft, nombre, tel) {
      var iv = draft.interview;
      if (!CAN_CREATE) { iv.call_to = { kind: 'MANUAL', name: nombre, phone: tel }; pintaLlamada(m, draft); return; }
      createPromoter(nombre).then(function (r) {
        iv.call_to = (r && r.id)
          ? { kind: 'PROMOTER', id: r.id, name: r.label || nombre, photo_url: r.logo_url || '', phone: tel || r.contact_phone || '' }
          : { kind: 'MANUAL', name: nombre, phone: tel };
        pintaLlamada(m, draft);
      });
    }
    /* Las tarjetas de «¿a quién llaman?»: el ARTISTA (la etiqueta rápida) y, si ya hay alguien
       elegido, su propia tarjeta con su cara. */
    function pintaLlamada(m, draft) {
      var box = m.querySelector('[data-call-cards]'); if (!box) return;
      var call = (draft.interview && draft.interview.call_to) || {};
      var h = ARTISTS.map(function (a) {
        return wzPick({ name: 'rmCall', value: 'artist:' + a.id, img: a.photo_url || AVATAR, icon: 'fa-guitar', label: a.name,
                        hint: 'Al artista', checked: call.kind === 'ARTIST' && String(call.id) === String(a.id), attrs: ' data-call-opt' });
      }).join('');
      if (call.kind && call.kind !== 'ARTIST' && call.name) {
        h += wzPick({ name: 'rmCall', value: 'sel', img: call.photo_url || AVATAR, icon: 'fa-user', label: call.name,
                      hint: call.phone || '', checked: true, attrs: ' data-call-opt' });
      }
      h += wzPick({ name: 'rmCall', value: '', icon: 'fa-circle-question', label: 'Todavía no se sabe', checked: !call.kind, attrs: ' data-call-opt' });
      box.innerHTML = h;
      box.querySelectorAll('[data-call-opt]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (!r.checked) return;
          var v = r.value;
          if (!v) { draft.interview.call_to = {}; return; }
          if (v.indexOf('artist:') === 0) {
            var a = ARTISTS.filter(function (x) { return 'artist:' + x.id === v; })[0];
            if (a) draft.interview.call_to = { kind: 'ARTIST', id: a.id, name: a.name, photo_url: a.photo_url || '', phone: '' };
          }
        });
      });
    }
    /* LA FICHA DEL MEDIO en una sola llamada: qué es (el tipo y su icono), sus direcciones guardadas
       y sus personas con foto. */
    function cargaFichaMedio(m, draft) {
      var iv = draft.interview || {};
      if (!iv.media_id) return;
      getJson('/api/media/' + encodeURIComponent(iv.media_id) + '/ficha').then(function (card) {
        if (!card || !card.id) return;
        m.rmMediaCard = card;
        if (card.media_type) { iv.type = card.media_type; iv.media_icon = card.icon || mediaIcon(card.media_type); }
        if (!iv.media_logo) iv.media_logo = card.logo_url || '';
        var mtype = m.querySelector('[data-media-type]'), mava = m.querySelector('[data-media-ava]');
        if (mtype) { mtype.classList.toggle('d-none', !iv.type); mtype.innerHTML = '<i class="fa ' + esc(iv.media_icon) + '"></i> <span>' + esc(iv.type) + '</span>'; }
        if (mava) mava.innerHTML = avatar(iv.media_logo || '', iv.media_icon);
        pintaUbicaciones(m, draft);
        pintaContactosMedio(m, draft);
      });
    }
    /* Las DIRECCIONES que ya tiene el medio: la sugerencia de una entrevista presencial. */
    function pintaUbicaciones(m, draft) {
      var box = m.querySelector('[data-iv-locs]'); if (!box) return;
      var iv = draft.interview || {};
      var card = m.rmMediaCard;
      if (!card) { box.innerHTML = '<div class="rm-sub">Elige antes el medio para ver sus direcciones guardadas.</div>'; return; }
      var locs = card.locations || [];
      if (!locs.length) { box.innerHTML = '<div class="rm-sub">Este medio todavía no tiene ninguna dirección guardada.</div>'; return; }
      box.innerHTML = '<div class="promo-pick-grid promo-pick-grid--wide">'
        + locs.map(function (l) {
            // Sin repetirse: cuando el nombre ES la dirección, debajo solo va el municipio.
            var titulo = l.name || l.address;
            return wzPick({ name: 'rmLoc', value: l.id, icon: 'fa-building', label: titulo,
                            hint: [(l.address !== titulo ? l.address : ''), l.municipality].filter(Boolean).join(' · '),
                            checked: String(iv.location_id || '') === String(l.id), attrs: ' data-loc-opt' });
          }).join('')
        + '</div>';
      box.querySelectorAll('[data-loc-opt]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (!r.checked) return;
          var l = locs.filter(function (x) { return String(x.id) === r.value; })[0];
          if (!l) return;
          draft.interview.location_id = l.id;
          var inp = m.querySelector('[data-f="location"]');
          if (inp) inp.value = [l.name, l.address, l.municipality].filter(Boolean).join(', ');
          var ls = m.querySelector('[data-loc-save]'); if (ls) ls.classList.add('d-none');
        });
      });
    }
    /* LAS PERSONAS DEL MEDIO (sus contactos y los terceros vinculados con él), con su cara. */
    function pintaContactosMedio(m, draft) {
      var box = m.querySelector('[data-media-contacts]'); if (!box) return;
      var iv = draft.interview || {};
      if (!iv.media_id) { box.innerHTML = '<div class="rm-sub">Elige antes el medio para ver sus personas.</div>'; return; }
      var card = m.rmMediaCard;
      if (!card) { box.innerHTML = '<div class="rm-sub">Cargando las personas del medio…</div>'; return; }
      var gente = card.contacts || [];
      var actual = (draft.contact || {}).name || '';
      var h = '<div class="rm-wz-lbl"><i class="fa fa-address-book"></i>Personas de ' + esc(card.name || 'este medio') + '</div>';
      if (gente.length) {
        h += '<div class="promo-pick-grid promo-pick-grid--wide">'
          + gente.map(function (c, i) {
              return wzPick({ name: 'rmMc', value: String(i), img: c.photo || AVATAR, icon: 'fa-user', label: c.name,
                              hint: c.role || c.program || '', checked: !!actual && normText(actual) === normText(c.name), attrs: ' data-mc-opt' });
            }).join('')
          + '</div>';
      } else {
        h += '<div class="rm-sub">Todavía no hay nadie dado de alta en este medio.</div>';
      }
      h += '<button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-mc-new><i class="fa fa-plus me-1"></i>Nueva persona del medio</button>'
        + '<div class="rm-wz-new d-none mt-2" data-mc-form>'
        + '<div class="row g-2 align-items-end">'
        + '<div class="col-md-6"><label class="form-label small mb-1">Nombre y apellidos</label><input class="form-control form-control-sm" data-nmc="name"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1">Cargo</label><input class="form-control form-control-sm" data-nmc="role" placeholder="Redactora, productor…"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1">Teléfono</label><input class="form-control form-control-sm" data-nmc="phone"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1">Email</label><input class="form-control form-control-sm" data-nmc="email"></div>'
        + '<div class="col-12 text-end"><button type="button" class="btn btn-sm btn-danger" data-nmc-save><i class="fa fa-plus me-1"></i>Añadirla y usarla</button></div>'
        + '</div><div class="filter-hint">Se le crea su ficha de tercero y queda vinculada al medio.</div></div>';
      box.innerHTML = h;
      box.querySelectorAll('[data-mc-opt]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (!r.checked) return;
          var c = gente[parseInt(r.value, 10)];
          if (c && m.rmSetContact) m.rmSetContact({ name: c.name, phone: c.phone || '', email: c.email || '', photo: c.photo || '', role: c.role || '', media_id: iv.media_id, promoter_id: c.promoter_id || '' });
        });
      });
      var form = box.querySelector('[data-mc-form]');
      box.querySelector('[data-mc-new]').addEventListener('click', function () {
        form.classList.toggle('d-none');
        if (!form.classList.contains('d-none')) form.querySelector('[data-nmc="name"]').focus();
      });
      form.querySelector('[data-nmc-save]').addEventListener('click', function () {
        var name = (form.querySelector('[data-nmc="name"]').value || '').trim();
        if (!name) { alert('Escribe su nombre.'); return; }
        postJson('/api/media/' + encodeURIComponent(iv.media_id) + '/contacts/create', {
          name: name, role: (form.querySelector('[data-nmc="role"]').value || '').trim(),
          phone: (form.querySelector('[data-nmc="phone"]').value || '').trim(),
          email: (form.querySelector('[data-nmc="email"]').value || '').trim()
        }).then(function (r) {
          if (r && r.ok) {
            if (m.rmSetContact) m.rmSetContact({ name: r.name, phone: r.phone || '', email: r.email || '', photo: r.photo || '', role: r.role || '', media_id: iv.media_id, promoter_id: r.promoter_id || '' });
            cargaFichaMedio(m, draft);
          } else alert((r && r.error) || 'No se pudo crear la persona.');
        });
      });
    }
    function renderSongs(m, draft) {
      var wrap = m.querySelector('[data-songs]'); if (!wrap) return;
      var arr = itemSongList(draft);
      wrap.innerHTML = '';
      arr.forEach(function (s, i) {
        var row = el('<div class="rm-song" draggable="true" data-idx="' + i + '"><span class="h"><i class="fa fa-grip-vertical"></i></span>' + (s.cover_url ? '<img src="' + esc(s.cover_url) + '">' : '') + '<div class="flex-grow-1">' + esc(s.title) + '</div><button type="button" class="btn-close btn-sm"></button></div>');
        row.querySelector('.btn-close').addEventListener('click', function () { arr.splice(i, 1); renderSongs(m, draft); });
        row.addEventListener('dragstart', function (e) { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', i); });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) { e.preventDefault(); var from = parseInt(e.dataTransfer.getData('text/plain'), 10); var to = i; if (isNaN(from) || from === to) return; var mv = arr.splice(from, 1)[0]; arr.splice(to, 0, mv); renderSongs(m, draft); });
        wrap.appendChild(row);
      });
      if (!arr.length) wrap.innerHTML = '<div class="rm-sub">Todavía no hay canciones.</div>';
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
        + (CAN_CREATE ? '<hr><div class="text-muted small mb-1">Añadir tercero nuevo</div><input class="form-control" placeholder="Buscar tercero…" data-newsearch><div class="list-group position-absolute d-none" style="z-index:5" data-newresults></div>' : '<hr>')
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
      if (CAN_CREATE) attachSearch(m2.querySelector('[data-newsearch]'), m2.querySelector('[data-newresults]'), searchPromoters, function (r) {
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
      var esIv = draft.kind === 'ENTREVISTA';
      var marcado = function (name) { var n = m.querySelector('input[name="' + name + '"]:checked'); return n ? n.value : ''; };
      draft.title = m.querySelector('[data-f="title"]').value.trim();
      draft.day = marcado('rmDay') || draft.day;
      draft.start_time = m.querySelector('[data-f="start_time"]').value;
      draft.end_time = m.querySelector('[data-f="end_time"]').value;
      draft.tbc = m.querySelector('[data-f="tbc"]').checked;
      draft.confirmed = marcado('rmConf') !== '0';
      draft.sheets = {};
      m.querySelectorAll('[data-sheet]').forEach(function (cb) { draft.sheets[cb.getAttribute('data-sheet')] = cb.checked; });
      var locEl = m.querySelector('[data-f="location"]');
      draft.location = locEl ? locEl.value.trim() : (draft.location || '');
      draft.note = m.querySelector('[data-f="note"]').value.trim();
      draft.audience = readAudience(m);
      draft.sings = marcado('rmSings') === '1';
      var accOn = m.querySelector('[data-f="access_on"]');
      draft.access_note = (accOn && accOn.checked) ? (m.querySelector('[data-f="access_note"]').value.trim()) : '';
      var pinOn = !!(accOn && accOn.checked && m.rmPin);
      draft.access_lat = pinOn ? m.rmPin.lat : null;
      draft.access_lng = pinOn ? m.rmPin.lng : null;
      draft.contact = draft.contact || {};
      draft.contact.phone = m.querySelector('[data-c="phone"]').value.trim();
      draft.contact.email = m.querySelector('[data-c="email"]').value.trim();
      if (kindInfo(draft.kind).transport) {
        var t = draft.transport;
        ['company', 'number', 'origin', 'destination', 'duration', 'logo_url', 'locator_all'].forEach(function (f) {
          var n = m.querySelector('[data-t="' + f + '"]'); if (n) t[f] = n.value.trim();
        });
        t.ends_next_day = m.querySelector('[data-t="ends_next_day"]').checked;
        t.same_locator = m.querySelector('[data-t="same_locator"]').checked;
      }
      var guardarUbicacion = null;
      if (esIv) {
        var iv = draft.interview;
        iv.program = (m.querySelector('[data-iv="program"]').value || '').trim();
        iv.modality = marcado('rmMod');
        iv.live = marcado('rmLive') === '1';
        iv.sings = draft.sings;
        iv.formation = marcado('rmForm');
        iv.zoom_url = (m.querySelector('[data-iv="zoom_url"]').value || '').trim();
        iv.zoom_tbc = m.querySelector('[data-iv="zoom_tbc"]').checked;
        // ⚠️ El sitio es de una entrevista PRESENCIAL: en un phoner o un zoom no hay dónde ir, y
        // dejarlo escrito haría que la hoja de ruta enseñara una dirección que no es.
        if (iv.modality !== 'PRESENCIAL') { draft.location = ''; iv.location_id = ''; draft.access_note = ''; draft.access_lat = null; draft.access_lng = null; }
        if (iv.modality !== 'PHONER') iv.call_to = {};
        if (iv.modality !== 'ZOOM') { iv.zoom_url = ''; iv.zoom_tbc = false; }
        // Una dirección NUEVA se puede quedar guardada en el medio (para no reescribirla nunca más).
        if (iv.modality === 'PRESENCIAL' && draft.location && iv.media_id && !iv.location_id
            && marcado('rmLocSave') === '1') {
          guardarUbicacion = { media_id: iv.media_id, address: draft.location };
        }
        // Sin título, el del medio y su programa (es como se reconoce la entrevista).
        if (!draft.title) draft.title = [iv.media_name, iv.program].filter(Boolean).join(' · ');
      }
      var i = bs('rmItemModal'); if (i) i.hide();
      var guardar = function () { postJson(ep('/item'), draft).then(apply); };
      if (guardarUbicacion) {
        postJson('/api/media/' + encodeURIComponent(guardarUbicacion.media_id) + '/ubicaciones',
                 { address: guardarUbicacion.address })
          .then(function (r) { if (r && r.ok && r.id) draft.interview.location_id = r.id; })
          .catch(function () {})
          .then(guardar);
      } else guardar();
    }

    // ------------------------------------------------- detalle de item
    function openDetail(it) {
      var ki = kindInfo(it.kind);
      var h = '<div class="d-flex align-items-center gap-2 mb-2"><span class="rm-ico" style="background:' + esc(ki.color) + '"><i class="fa ' + esc(ki.icon) + '"></i></span><div><div class="fw-bold">' + esc(it.title || ki.label) + '</div><div class="rm-sub">' + esc(dayLabel(it.day)) + ' · ' + timeLabel(it) + '</div></div></div>';
      if (!it.confirmed) h += '<div class="rm-tag tbc mb-2 d-inline-block">Provisional</div> ';
      if (!RO) { var shD = sheetsLabel(it); if (shD) h += '<div class="rm-tag sheet mb-2 d-inline-block"><i class="fa fa-share-nodes"></i> ' + esc(shD) + '</div> '; }
      if (it.cancelled) h += '<div class="rm-tag mb-2 d-inline-block">Cancelada</div>';
      if (it.location) h += '<div class="mb-1"><i class="fa fa-location-dot text-muted"></i> ' + esc(it.location) + mapLink(itemMapsHref(it), hasPin(it) ? 'Ir al punto de acceso exacto' : 'Abrir en Mapas') + '</div>';
      var audH = audienceHtml(it);
      h += '<div class="mb-1 rm-sub"><i class="fa fa-users"></i> ' + (audH ? 'Afecta a:' : 'Afecta a todos') + '</div>' + audH;
      if (itemSings(it) && !(it.kind === 'ENTREVISTA' && it.interview)) {
        var sgs = itemSongs(it);
        h += '<div class="mb-1"><span class="rm-tag sing"><i class="fa fa-music"></i> Canta</span>'
          + (sgs.length ? '<div class="rm-sub">Repertorio: ' + sgs.map(function (s2) { return esc(s2.title); }).join(', ') + '</div>' : '<div class="rm-sub">Sin repertorio todavía (se configura en la pestaña Repertorio).</div>') + '</div>';
      }
      // UNA ENTREVISTA (creada aquí o espejada de una promoción): el MISMO helper que la fila.
      var mdD = ivMeta(it);
      if (mdD) {
        h += '<div class="mb-1">';
        if (mdD.mediaName) h += '<span class="rm-tag"><i class="fa ' + esc(mdD.mediaIcon) + '"></i> ' + esc(mdD.mediaName) + '</span> ';
        if (mdD.program) h += '<span class="rm-tag"><i class="fa fa-microphone"></i> ' + esc(mdD.program) + '</span> ';
        if (mdD.modLabel) h += '<span class="rm-tag"><i class="fa ' + esc(mdD.modIcon) + '"></i> ' + esc(mdD.modLabel) + '</span> ';
        if (mdD.live) h += '<span class="rm-tag live"><i class="fa fa-tower-broadcast"></i> Directo</span> ';
        else if (mdD.formation) h += '<span class="rm-tag">' + esc(mdD.formation) + '</span> ';
        h += '</div>';
        h += callLine(mdD);
        if (mdD.zoom) h += '<div class="mb-2"><a class="btn btn-sm btn-outline-primary" href="' + esc(mdD.zoom) + '" target="_blank" rel="noopener" data-ext><i class="fa fa-video me-1"></i>Entrar en la videollamada</a></div>';
        else if (mdD.zoomTbc) h += '<div class="rm-sub mb-2"><i class="fa fa-video"></i> El enlace de la videollamada está por confirmar.</div>';
        if (it.interview && (it.interview.songs || []).length) h += '<div class="rm-sub">Repertorio: ' + it.interview.songs.map(function (s) { return esc(s.title); }).join(', ') + '</div>';
      }
      if (ki.transport && it.transport) {
        var t = it.transport;
        h += '<div class="rm-transport-line">' + (t.logo_url ? '<img src="' + esc(t.logo_url) + '">' : '') + [t.company, t.number, [t.origin, t.destination].filter(Boolean).join(' → '), t.duration].filter(Boolean).map(esc).join(' · ') + (t.ends_next_day ? ' <span class="rm-tag plus1">+1</span>' : '') + '</div>';
        (t.passengers || []).forEach(function (p) { var per = personById(p.personnel_id); h += '<div class="rm-sub"><i class="fa fa-user"></i> ' + esc(per ? per.name : '—') + (p.locator || t.locator_all ? ' · Loc: ' + esc(t.same_locator ? t.locator_all : p.locator) : '') + (p.ticket_url ? ' · <a href="' + esc(p.ticket_url) + '" target="_blank">Billete</a>' : '') + '</div>'; });
      }
      if (it.contact && (it.contact.name || it.contact.phone || it.contact.email)) {
        var cc = it.contact;
        h += '<div class="mt-2 rm-contact"><span class="rm-nick">' + avatar(cc.photo || AVATAR) + '<span>' + esc(cc.name || 'Contacto') + '</span></span>'
          + (cc.role ? '<span class="rm-sub"> · ' + esc(cc.role) + '</span>' : '')
          + contactActs(cc.phone || '', cc.email || '') + '</div>';
      }
      h += accesoHtml(it.access_note, it, 'Acceso · ' + (it.title || ''));
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
      view.querySelectorAll('.rm-item').forEach(function (node) { node.addEventListener('click', function (e) { if (clickAparte(e)) return; var host = node.closest('[data-item]'); var it = agendaItem(host.getAttribute('data-item')); if (it) openDetail(it); }); });
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
      if (HRO || !pool.length) return '';
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
      if (HRO || !(P.hotels || []).length) return '';
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
      var addBtn = HRO ? '' : '<button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir hotel</button>';
      var html = '<div class="rm-toolbar"><div class="text-muted small">Alojamientos</div><span class="ms-auto d-flex gap-1 align-items-center">' + tplBtn('ROOMING') + addBtn + '</span></div>';
      html += repartoBlock() + pendientesBlock();
      html += '<div class="d-flex flex-column gap-2">';
      if (!P.hotels.length) html += '<div class="rm-empty">Sin hoteles todavía.</div>';
      P.hotels.forEach(function (ho) { html += hotelCard(ho); });
      html += '</div>';
      view.innerHTML = html;
      if (HRO) return;
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
    /* Bajar un documento que el servidor GENERA al vuelo: con la barra de la casa (no bloquea la
       pantalla) y, donde no esté cargada, abriéndolo en otra pestaña. */
    function bajaDoc(url, nombre) {
      if (window.app33Download && window.app33Download.get) window.app33Download.get(url, { name: nombre });
      else window.open(url, '_blank');
    }
    /* ⚠️ LA FOTO DEL DNI SE DECIDE, no se contesta a una pregunta: son dos opciones con el mismo
       peso («Incluir imagen DNI» / «No incluir»), no un Aceptar/Cancelar que nadie sabe qué hace. */
    function pedirDni(ho) {
      var body = '<p class="mb-1">¿Se incluyen las <b>fotos del DNI</b> de cada huésped en la rooming list?</p>'
        + '<p class="rm-sub mb-0">Algunos hoteles las piden para el registro. Si no hacen falta, el documento sale solo con el nombre y el número.</p>';
      function baja(conDni) {
        var i = bs('rmDniModal'); if (i) i.hide();
        bajaDoc(ep('/rooming/' + encodeURIComponent(ho.id) + '/pdf') + (conDni ? '?dni=1' : ''), 'rooming.pdf');
      }
      openModal('rmDniModal', 'modal-md', 'Descargar la rooming list', body, [
        btn('<i class="fa fa-file-pdf me-1"></i>No incluir', 'btn-outline-secondary', function () { baja(false); }),
        btn('<i class="fa fa-id-card me-1"></i>Incluir imagen DNI', 'btn-primary', function () { baja(true); })
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
            pedirDni(ho);
          } else if (mode === 'xlsx') {
            bajaDoc(ep('/rooming/' + encodeURIComponent(ho.id) + '/xlsx'), 'rooming.xlsx');
          } else {
            var text = roomingShareText(ho);
            if (mode === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
            else if (mode === 'sms') window.location.href = 'sms:?&body=' + encodeURIComponent(text);
            else window.location.href = 'mailto:?subject=' + encodeURIComponent('Rooming list · ' + (ho.name || 'Hotel')) + '&body=' + encodeURIComponent(text);
          }
        });
      });
      if (HRO) return;
      /* EL NÚMERO QUE DA EL HOTEL: se escribe en la propia tarjeta y se guarda al salir del campo
         (o con Enter), por su propio endpoint — así no se toca nada más de la rooming list. */
      view.querySelectorAll('[data-room-number]').forEach(function (inp) {
        var previo = inp.value;
        function guarda() {
          if (inp.value === previo) return;
          previo = inp.value;
          inp.parentElement.classList.toggle('is-set', !!inp.value.trim());
          postJson(ep('/habitacion/numero'), { room_id: inp.getAttribute('data-room-number'), room_number: inp.value })
            .then(function (resp) { if (resp && resp.ok) { P = resp.payload; DAYS = resp.days || DAYS; } });
        }
        inp.addEventListener('change', guarda);
        inp.addEventListener('blur', guarda);
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        // Escribir un número no puede arrastrar la habitación ni abrir nada de debajo.
        inp.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
      });
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
    function hotelDir(ho) {
      return [ho.name, ho.address].filter(Boolean).join(', ');
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
    /* El DESAYUNO: la taza ACTIVA cuando lo lleva y TACHADA cuando no (una taza al 25% no dice si
       es que no hay desayuno o que el dato no está). Punto único: lo pintan la tarjeta y el editor. */
    function brkIcon(on) {
      return '<i class="fa fa-mug-saucer rm-brk' + (on ? ' rm-brk--on' : ' rm-brk--off') + '" title="'
        + (on ? 'Con desayuno' : 'Sin desayuno') + '"></i>';
    }
    /* Qué número hace cada habitación DENTRO del hotel (1, 2, 3…). ⚠️ Va por el orden en que están
       guardadas, igual que el PDF y el Excel (`_rooming_rows_for_pdf`): así «la 3» es la misma
       habitación en los tres sitios aunque haya varios rangos de fechas. */
    function roomOrder(ho, r) {
      var rooms = (ho && ho.rooms) || [];
      for (var i = 0; i < rooms.length; i++) if (String(rooms[i].id) === String(r.id)) return i + 1;
      return 0;
    }
    function roomMiniCard(ho, r, ri) {
      var occ = (r.occupant_ids || []).map(function (id) {
        var p = personById(id); if (!p) return '';
        return '<span class="rm-occ" draggable="' + (HRO ? 'false' : 'true') + '" data-occ="' + esc(id) + '" data-occ-hotel="' + esc(ho.id) + '" data-occ-room="' + esc(r.id) + '" title="' + esc(p.name) + '">' + avatar(p.photo_url) + '<span>' + esc(p.name) + '</span></span>';
      }).join('');
      var n = ri || roomOrder(ho, r);
      /* ⚠️ EL NÚMERO QUE DA EL HOTEL (214) es de la CASA: se ve y se escribe dentro de la app, y NO
         se pinta en solo lectura (la hoja de ruta que se comparte y el portal de externos). */
      var numero = HRO
        ? (r.room_number ? '<span class="rm-room__num is-set"><i class="fa fa-door-closed"></i>' + esc(r.room_number) + '</span>' : '')
        : '<label class="rm-room__num' + (r.room_number ? ' is-set' : '') + '" title="Número de habitación del hotel">'
          + '<i class="fa fa-door-closed"></i>'
          + '<input type="text" maxlength="12" value="' + esc(r.room_number || '') + '" placeholder="nº"'
          + ' data-room-number="' + esc(r.id) + '"></label>';
      return '<div class="rm-room" data-room="' + esc(r.id) + '" data-room-hotel="' + esc(ho.id) + '">'
        + '<div class="rm-room__head"><span class="fw-semibold"><i class="fa fa-bed me-1 text-muted"></i>Habitación ' + n + '</span>'
        + '<span class="rm-sub d-inline-flex align-items-center gap-1">' + brkIcon(r.breakfast) + '</span></div>'
        + '<div class="rm-room__meta"><span class="rm-room__type">' + roomTypeLabel((r.occupant_ids || []).length, r.bed) + '</span>' + numero + '</div>'
        // ⚠️ En solo lectura no se arrastra nada: ahí el texto sería un botón que no existe.
        + (occ || '<div class="rm-sub">' + (HRO ? 'Sin ocupantes' : 'Arrastra personas aquí') + '</div>')
        + '</div>';
    }
    function roomingBlock(ho) {
      var rooms = ho.rooms || [];
      // agrupadas por nº de días (rango)
      var groups = {};
      rooms.forEach(function (r) { var k = roomRangeLabel(r, ho) || 'Sin días'; (groups[k] = groups[k] || []).push(r); });
      var html = '<div class="rm-rooming mt-2" data-rooming="' + esc(ho.id) + '">';
      // ⚠️ Compartir y editar el rooming viven ARRIBA DEL TODO, junto a los tres puntos del hotel
      // (`hotelCard` → `roomingActions`): aquí solo queda el rótulo.
      html += '<div class="rm-sub fw-semibold mb-1"><i class="fa fa-bed"></i> Rooming list'
        + (rooms.length ? ' · ' + rooms.length + ' hab.' : '') + '</div>';
      if (!rooms.length) html += '<div class="rm-sub">Sin habitaciones. ' + (HRO ? '' : 'Pulsa «Editar rooming» para configurarlas.') + '</div>';
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
        lines.push('Habitación ' + (i + 1) + (r.room_number ? ' (nº ' + r.room_number + ')' : '')
          + ' · ' + roomTypeLabel((r.occupant_ids || []).length, r.bed)
          + (r.breakfast ? ' · con desayuno' : ' · sin desayuno')
          + ' ' + (roomRangeLabel(r, ho) || '') + ': ' + (names || 'vacía'));
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
            ? '<button type="button" class="btn btn-sm btn-link p-0 rm-sub" data-ebed="' + i + '"'
              + ' title="' + (esDoble ? 'Una sola cama · pulsa para dos camas separadas' : 'Dos camas separadas · pulsa para una sola cama') + '">'
              + '<i class="fa ' + (esDoble ? 'fa-bed' : 'fa-bed-pulse') + '"></i> ' + (esDoble ? 'una cama' : 'dos camas') + '</button>'
            : '';
          left += '<div class="rm-room rm-room--edit" data-eroom="' + i + '">'
            + '<div class="rm-room__head"><span class="fw-semibold"><i class="fa fa-bed me-1"></i>Habitación ' + (i + 1) + '</span>'
            + '<span class="d-inline-flex align-items-center gap-1"><label class="rm-sub" title="Desayuno"><input type="checkbox" data-ebrk="' + i + '"' + (r.breakfast ? ' checked' : '') + '> ' + brkIcon(r.breakfast) + '</label>'
            + '<button type="button" class="btn btn-sm btn-link text-danger p-0" data-edelroom="' + i + '"><i class="fa fa-trash"></i></button></span></div>'
            + '<div class="rm-room__meta"><span class="rm-room__type">' + roomTypeLabel((r.occupant_ids || []).length, r.bed) + '</span>' + camaBtn + '</div>'
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
        + (ho.address ? '<div class="rm-sub"><i class="fa fa-location-dot"></i> ' + esc(ho.address) + mapLink(mapsUrl(hotelDir(ho))) + '</div>' : '')
        + ((ho.phone || ho.email) ? '<div class="rm-sub">' + [ho.phone, ho.email].filter(Boolean).map(esc).join(' · ') + '</div>' : '')
        + (daysTxt ? '<div class="rm-sub"><i class="fa fa-calendar"></i> ' + esc(daysTxt) + '</div>' : '')
        + (function () {   // cuántas habitaciones hay reservadas y cuántas se han puesto
            var cap = hotelCap(ho);
            if (!cap.reserved && !(ho.rooms || []).length) return '';
            if (!cap.reserved) return HRO ? '' : '<div class="rm-sub"><i class="fa fa-bed"></i> '
              + (ho.rooms || []).length + ' hab. · <a href="#" data-room-reserve="' + esc(ho.id) + '">decir cuántas hay reservadas</a></div>';
            var sobran = cap.spare
              ? (cap.spare === 1 ? 'Sobra 1 habitación reservada' : 'Sobran ' + cap.spare + ' habitaciones reservadas')
              : '';
            return '<div class="rm-sub"><i class="fa fa-bed"></i> <span class="rmr-count'
              + (cap.over ? ' is-over' : (cap.full ? ' is-full' : (cap.spare ? ' is-spare' : '')))
              + '"' + (sobran ? ' title="' + esc(sobran + ': o se usan o se cambia la reserva') + '"' : '') + '>'
              + cap.used + '/' + cap.reserved + ' hab. reservadas</span>'
              + (sobran ? ' <span class="rmr-spare">' + esc(sobran) + '</span>' : '')
              + (HRO ? '' : ' <a href="#" data-room-reserve="' + esc(ho.id) + '">cambiar</a>') + '</div>';
          })()
        + '<div class="rm-sub"><i class="fa fa-users"></i> ' + esc(whoNames || '—') + '</div>'
        + (ho.note ? '<div class="rm-sub"><i class="fa fa-note-sticky"></i> ' + esc(ho.note) + '</div>' : '')
        + (atts ? '<div class="mt-1">' + atts + '</div>' : '')
        + roomingBlock(ho)
        + '</div>'
        + roomingActions(ho)
        + '</div>';
    }
    /* Arriba a la derecha de la tarjeta del hotel y en este orden: COMPARTIR · EDITAR (la rooming
       list) · los tres puntos del hotel. En pantalla estrecha se quedan solo los iconos. */
    function roomingActions(ho) {
      var compartir = '<div class="dropdown d-inline-block"><button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown" title="Compartir la rooming list">'
        + '<i class="fa fa-share-nodes"></i> <span class="d-none d-md-inline">Compartir</span></button>'
        + '<ul class="dropdown-menu dropdown-menu-end">'
        + '<li><button class="dropdown-item" data-rshare="pdf" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-file-pdf fa-fw me-1"></i>Descargar PDF</button></li>'
        + '<li><button class="dropdown-item" data-rshare="xlsx" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-file-excel fa-fw me-1"></i>Descargar Excel</button></li>'
        + '<li><hr class="dropdown-divider"></li>'
        + '<li><button class="dropdown-item" data-rshare="email" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-envelope fa-fw me-1"></i>Compartir por email</button></li>'
        + '<li><button class="dropdown-item" data-rshare="wa" data-rhotel="' + esc(ho.id) + '"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
        + '<li><button class="dropdown-item" data-rshare="sms" data-rhotel="' + esc(ho.id) + '"><i class="fa fa-comment-sms fa-fw me-1"></i>Por SMS</button></li>'
        + '</ul></div>';
      if (HRO) return '<div class="rm-menu rm-hotel__acts">' + compartir + '</div>';
      return '<div class="rm-menu rm-hotel__acts">' + compartir
        + '<button class="btn btn-sm btn-outline-primary" data-rooming-edit="' + esc(ho.id) + '" title="Editar la rooming list">'
        + '<i class="fa fa-pen"></i> <span class="d-none d-md-inline">Editar</span></button>'
        + '<div class="dropdown d-inline-block"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown" title="Más"><i class="fa fa-ellipsis-vertical"></i></button>'
        + '<ul class="dropdown-menu dropdown-menu-end">'
        + '<li><button class="dropdown-item" data-hedit="' + esc(ho.id) + '"><i class="fa fa-hotel fa-fw me-1"></i>Editar el hotel</button></li>'
        + '<li><button class="dropdown-item text-danger" data-hdel="' + esc(ho.id) + '"><i class="fa fa-trash fa-fw me-1"></i>Eliminar el hotel</button></li>'
        + '</ul></div></div>';
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
      if (PRO) return '';  // ni el enlace público ni el externo que actualiza enseñan el PRL ni el viaje
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
      var addBtn = PRO ? '' : '<button class="rm-add" data-add><i class="fa fa-plus"></i> Añadir</button>';
      var colsBtn = PRO ? '' : '<button class="btn btn-sm btn-outline-secondary py-0 me-1" data-pcols><i class="fa fa-table-columns me-1"></i>Qué datos se ven</button>';
      var ordenBtn = '<button class="btn btn-sm btn-outline-secondary py-0 me-1" data-porden title="Cambiar el orden">'
        + '<i class="fa ' + (pOrden === 'rol' ? 'fa-user-tag' : 'fa-arrow-down-a-z') + ' me-1"></i>'
        + (pOrden === 'rol' ? 'Por función' : 'Alfabético') + '</button>';
      /* ⚠️ En SOLO LECTURA (el enlace público y el portal de externos) NO se ofrece exportar ni
         compartir: esos endpoints exigen sesión de la casa, así que serían botones muertos —y lo que
         descargan (el listado con DNIs y teléfonos) tampoco es para quien mira desde fuera. */
      var exportBtns = RO ? '' : '<div class="dropdown d-inline-block me-1"><button class="btn btn-sm btn-outline-secondary py-0" data-bs-toggle="dropdown"><i class="fa fa-share-nodes"></i> Exportar / compartir</button>'
        + '<ul class="dropdown-menu"><li><button class="dropdown-item" data-pexp="pdf"><i class="fa fa-file-pdf fa-fw me-1"></i>Descargar PDF</button></li>'
        + '<li><button class="dropdown-item" data-pexp="xlsx"><i class="fa fa-file-excel fa-fw me-1"></i>Descargar Excel</button></li>'
        + '<li><hr class="dropdown-divider"></li>'
        + '<li><button class="dropdown-item" data-pexp="email"><i class="fa fa-envelope fa-fw me-1"></i>Compartir por email</button></li>'
        + '<li><button class="dropdown-item" data-pexp="wa"><i class="fa-brands fa-whatsapp fa-fw me-1"></i>Por WhatsApp</button></li>'
        + '<li><button class="dropdown-item" data-pexp="sms"><i class="fa fa-comment-sms fa-fw me-1"></i>Por SMS</button></li></ul></div>';
      var buscador = '<div class="rm-pbusca"><i class="fa fa-magnifying-glass"></i>'
        + '<input class="form-control form-control-sm" placeholder="Buscar en el personal…" value="' + esc(pBusca) + '" data-pbusca></div>';
      /* MANDARLE UN MENSAJE a los que van (SMS o correo), a todos o por función. El pop-up y su
         motor viven aparte (`roadmap_message.js`), enganchados por delegación. */
      var msgBtn = RO ? '' : '<button class="btn btn-sm btn-outline-primary py-0 me-1" data-rm-msg-open>'
        + '<i class="fa fa-comment-sms me-1"></i>Enviar SMS</button>';
      var html = personalSubtabs()
        + '<div class="rm-toolbar"><div class="text-muted small">Personal de la actividad</div>'
        + '<span>' + ordenBtn + colsBtn + msgBtn + exportBtns + tplBtn('PERSONNEL') + addBtn + '</span></div>'
        + buscador + personRoleChips(personRowsNow());
      if (!(P.personnel || []).length) html += '<div class="rm-empty">Sin personal todavía.</div>';
      else if (!rows.length) html += '<div class="rm-empty">Nadie casa con lo que se está buscando.</div>';

      function fila(r) {
        var menu = PRO ? '' : '<div class="dropdown ms-2"><button class="btn btn-sm btn-light" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button>'
          + '<ul class="dropdown-menu dropdown-menu-end">'
          + '<li><button class="dropdown-item" data-pedit="' + esc(r.id) + '">Editar</button></li>'
          + (r.has_ficha ? '<li><button class="dropdown-item" data-pfill="' + esc(r.id) + '">Completar sus datos</button></li>' : '')
          + (r.ficha_url ? '<li><a class="dropdown-item" href="' + esc(r.ficha_url) + '" target="_blank">Ver su ficha</a></li>' : '')
          + '<li><button class="dropdown-item text-danger" data-pdel="' + esc(r.id) + '">Eliminar</button></li></ul></div>';
        var faltan = personFaltan(r);
        var aviso = (faltan.length && !PRO)
          ? '<div class="rm-pfalta"><i class="fa fa-triangle-exclamation"></i> Falta '
            + faltan.map(personFieldLabel).join(' · ')
            + ' <button type="button" class="btn btn-sm btn-outline-warning py-0 ms-1" data-pfill="' + esc(r.id) + '">Completar</button></div>'
          : '';
        // PUEDE ACTUALIZAR LA HOJA DE RUTA desde su acceso de externo: se ve en su fila.
        var pp = personById(r.id);
        var puede = (pp && pp.can_edit) ? '<span class="rm-tag edit ms-1" title="Puede actualizar la hoja de ruta desde su acceso de externo"><i class="fa fa-pen-to-square"></i> Puede actualizarla</span>' : '';
        return '<div class="rm-person"><span class="av">' + avatar(r.photo_url) + '</span>'
          + '<div class="flex-grow-1"><div class="nm">' + esc(r.name) + puede + '</div>'
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
      if (PRO) return;
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
      var exportBtns = RO ? '' : '<div class="dropdown d-inline-block me-1"><button class="btn btn-sm btn-outline-secondary py-0" data-bs-toggle="dropdown"><i class="fa fa-share-nodes"></i> Exportar / compartir</button>'
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
      /* PUEDE ACTUALIZAR LA HOJA DE RUTA: entrando por su acceso de externo (/externos) podrá mover,
         añadir y borrar horarios, editar el repertorio y la logística, bajar el rooming y el
         personal con DNI y mandar SMS al personal. Solo tiene sentido en un tercero o un
         integrante (los que pueden entrar por el portal). */
      var puedeEd = (p.kind === 'PROMOTER' || p.kind === 'MEMBER');
      h += '<div class="col-12' + (puedeEd ? '' : ' d-none') + '" data-canedit-wrap><div class="form-check form-switch">'
        + '<input class="form-check-input" type="checkbox" data-p="can_edit" id="rmCanEdit"' + (p.can_edit ? ' checked' : '') + '>'
        + '<label class="form-check-label" for="rmCanEdit"><i class="fa fa-pen-to-square me-1"></i>Puede actualizar la hoja de ruta</label></div>'
        + '<div class="form-text">Desde su acceso de externo podrá mover, añadir y borrar horarios, editar el repertorio y la logística, bajar el rooming y el personal con DNI y mandar SMS al personal.</div></div>';
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
        var cw = m.querySelector('[data-canedit-wrap]'); if (cw) cw.classList.toggle('d-none', !(p.kind === 'PROMOTER' || p.kind === 'MEMBER'));
        m.querySelector('[data-p="name"]').value = r.label || '';
        if (r.phone) m.querySelector('[data-p="phone"]').value = r.phone;
        if (r.email) m.querySelector('[data-p="email"]').value = r.email;
        pick.innerHTML = '<span class="av">' + avatar(r.logo_url) + '</span><div><div class="fw-semibold">'
          + esc(r.label || '') + '</div>' + (r.sub ? '<div class="rm-sub">' + esc(r.sub) + '</div>' : '') + '</div>'
          + '<button type="button" class="btn btn-sm btn-light ms-auto" data-pclear title="Quitar"><i class="fa fa-xmark"></i></button>';
        pick.classList.remove('d-none');
        pick.querySelector('[data-pclear]').addEventListener('click', function () {
          p.kind = 'MANUAL'; p.ref_id = ''; p.photo_url = '';
          var cw2 = m.querySelector('[data-canedit-wrap]'); if (cw2) cw2.classList.add('d-none');
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
      var ce = m.querySelector('[data-p="can_edit"]');
      p.can_edit = !!(ce && ce.checked && (p.kind === 'PROMOTER' || p.kind === 'MEMBER'));
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
      var html = '<div class="text-muted small mb-2">Enlace de <strong>solo lectura</strong>: se pueden descargar los adjuntos, sin poder editar nada. Cada hoja de ruta muestra <strong>los puntos de los horarios marcados con su etiqueta</strong> (por defecto, todos).</div>';
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
    function render() { if (tab === 'actividad') renderActividad(); else if (tab === 'agenda') renderAgenda(); else if (tab === 'logistica') renderLogistica(); else if (tab === 'hoteles') renderHoteles(); else if (tab === 'repertorio') renderRepertorio(); else renderPersonal(); }
    root.querySelectorAll('[data-rm-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-rm-tab'); root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); }); });
    // FUERA DE LA APP la cabecera de la actividad va ARRIBA DEL TODO (la misma viñeta de «Evento»).
    var headBox = document.getElementById('rmHeader');
    if (headBox && ACTIVITY && HEADER_TOP) headBox.innerHTML = actHeadHtml();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
