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
    /* LAS REGLAS DE CADA TIPO de punto (qué se pregunta y qué no): las dicta el SERVIDOR
       (`ROADMAP_NO_SING_KINDS` y compañía → `kind_rules`); aquí solo se leen, así no se desparejan.
       Y lo que la ficha ya sabe: cuántas personas hay en el M&G y las personas de contacto que se
       sugieren (las de la actividad, el promotor y el recinto). */
    var RULES = CTX.kind_rules || {};
    function ruleHas(list, kind) { return (RULES[list] || []).indexOf(kind) >= 0; }
    var MG_COUNT = CTX.meet_greet_count || '';
    var CONTACT_SUG = CTX.contact_suggestions || [];
    var COMPANIES = CTX.transport_companies || [];   // las compañías de transporte de la base, con su logo
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
    var TABS = (CTX.tabs && CTX.tabs.length) ? CTX.tabs.slice() : ['agenda', 'logistica'].concat(CTX.show_meals ? ['comidas'] : []).concat(['hoteles', 'personal']);
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
      if (resp && resp.ok) { P = resp.payload || P; P.personnel = P.personnel || []; P.hotels = P.hotels || []; P.agenda = P.agenda || []; P.rooms_pool = P.rooms_pool || []; DAYS = resp.days || DAYS; ensureMealsTab(); render(); return true; }
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
    /* ⚠️ El desplegable tiene FONDO (`.rm-wz-results`: antes era transparente y se leía lo de
       detrás) y, con `minChars: 0`, se abre también AL PINCHAR en el campo con lo que haya (el
       repertorio del artista entero, para elegir sin tener que escribir). Un clic fuera lo cierra
       (un único listener en `document`, debajo). `clearOnPick` vacía el campo al elegir: es para lo
       que se AÑADE a una lista (canciones, personas), donde el texto ya no pinta nada. */
    function attachSearch(input, results, fetcher, onPick, opts) {
      opts = opts || {};
      if (!input || !results) return;
      var minChars = (typeof opts.minChars === 'number') ? opts.minChars : 2;
      results.classList.add('rm-wz-results');
      var run = debounce(function () {
        var q = input.value.trim();
        results.innerHTML = '';
        if (q.length < minChars) { results.classList.add('d-none'); return; }
        fetcher(q).then(function (list) {
          results.innerHTML = '';
          (list || []).slice(0, opts.max || 8).forEach(function (r) {
            var node = el('<div class="rm-result"></div>');
            node.innerHTML = avatar(r.logo_url, r.icon) + '<div class="min-w-0"><div>' + esc(r.label || r.name || '') + '</div>' + (r.sub ? '<div class="rm-sub">' + esc(r.sub) + '</div>' : '') + '</div>';
            node.addEventListener('click', function () { onPick(r); results.classList.add('d-none'); results.innerHTML = ''; if (opts.clearOnPick) input.value = ''; });
            results.appendChild(node);
          });
          if (opts.onCreate && q) {
            var c = el('<div class="rm-result text-primary"><span class="noimg"><i class="fa fa-plus"></i></span><div>Crear «' + esc(q) + '»</div></div>');
            c.addEventListener('click', function () { opts.onCreate(q); results.classList.add('d-none'); results.innerHTML = ''; });
            results.appendChild(c);
          }
          if (!results.children.length) { results.classList.add('d-none'); return; }
          results.classList.remove('d-none');
        });
      }, 240);
      input.addEventListener('input', run);
      if (minChars === 0) input.addEventListener('focus', run);
    }
    document.addEventListener('click', function (e) {
      document.querySelectorAll('.rm-wz-results').forEach(function (r) {
        var wrap = r.parentElement;
        if (wrap && !wrap.contains(e.target)) r.classList.add('d-none');
      });
    });
    /* Los RECINTOS de la base (para «en otro recinto» de un M&G o una sesión de fotos). */
    function searchVenues(q) {
      return getJson('/api/search/venues?q=' + encodeURIComponent(q)).then(function (list) {
        return (list || []).map(function (r) {
          return { id: r.id, label: r.name || r.label || '', logo_url: r.photo_url || '', icon: 'fa-building',
                   sub: [r.municipality, r.province].filter(Boolean).join(', '), address: r.address || '', municipality: r.municipality || '' };
        });
      });
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
      if (it.location) return mapsUrl(it.location);
      // Un punto que es EN EL RECINTO (la prueba de sonido, un M&G en el camerino): al recinto.
      if (ruleHas('at_venue', it.kind) || (it.place && it.place.mode !== 'OTHER' && ruleHas('place', it.kind))) return venueMapsHref(VENUE);
      return '';
    }
    /* DÓNDE se ve en la fila: lo escrito o, en un M&G, una sesión de fotos o una comida, el recinto
       de la actividad con su espacio («Sala Ruta · Camerino 2»). */
    function placeLabel(it) {
      var pl = it && it.place;
      if (pl && ruleHas('place', it.kind)) {
        var base = pl.mode === 'OTHER' ? (it.location || pl.venue_name || '') : ((VENUE && VENUE.name) || '');
        return [base, pl.space].filter(Boolean).join(' · ');
      }
      return (it && it.location) || '';
    }
    /* LAS PERSONAS DE CONTACTO de un punto: la lista (`contacts`) o, en uno de antes, la única. */
    function itemContacts(it) {
      if (!it) return [];
      if ((it.contacts || []).length) return it.contacts;
      return (it.contact && (it.contact.name || it.contact.phone || it.contact.email)) ? [it.contact] : [];
    }
    /* LA RESERVA de una comida, como etiqueta (solo si se sabe si la hay). */
    function mealTag(ml) {
      if (!ml || (ml.reservation !== true && ml.reservation !== false)) return '';
      if (ml.reservation) return '<span class="rm-tag ok"><i class="fa fa-calendar-check"></i> Reserva' + (ml.diners ? ' · ' + esc(ml.diners) + ' pers.' : '') + '</span>';
      return '<span class="rm-tag"><i class="fa fa-calendar-xmark"></i> Sin reserva</span>';
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
      // EL M&G dice cuántas personas y LA COMIDA si hay reserva (y para cuántos).
      if (it.kind === 'MG' && it.mg_count) tags += '<span class="rm-tag"><i class="fa fa-users"></i> ' + esc(it.mg_count) + '</span>';
      if (it.kind === 'COMIDA') tags += mealTag(it.meal) + menuTag(it);
      var lugar = placeLabel(it);
      if (it.access_note || hasPin(it)) tags += '<span class="rm-tag access" title="' + esc(it.access_note || 'Punto exacto de acceso en el mapa') + '"><i class="fa fa-door-open"></i> Acceso</span>';
      var transLine = '';
      if (ki.transport && it.transport) {
        var t = it.transport;
        transLine = transLineHtml(t);
        tags += transStatusTag(t);
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
        + (lugar ? '<div class="rm-sub">' + esc(lugar) + '</div>' : '') + (sub ? '<div class="rm-sub">' + sub + '</div>' : '') + callHtml + transLine
        + (tags ? '<div class="rm-tags">' + tags + '</div>' : '') + audienceHtml(it) + '</div>'
        + '<div class="rm-meta">' + meta + '</div></div>';
    }
    /* Un clic dentro de la fila que NO es abrir el detalle: la etiqueta de «canta» (va al
       Repertorio) y los enlaces al mapa o al teléfono (`data-ext`). */
    function clickAparte(e) {
      if (e.target.closest('[data-goto-rep]')) { e.stopPropagation(); goTab('repertorio'); return true; }
      if (e.target.closest('[data-goto-meals]')) { e.stopPropagation(); goTab('comidas'); return true; }
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
      var d = { id: '', kind: kind, day: day || (DAYS[0] ? DAYS[0].date : ''), start_time: '', end_time: '', tbc: false, confirmed: true, cancelled: false, title: '', location: '', note: '', contact: {}, contacts: [], attachments: [], sheets: { GENERAL: true, TECNICA: true },
                audience: { mode: 'ALL', roles: [], ids: [] }, sings: false, songs: [], access_note: '', access_lat: null, access_lng: null };
      // La ficha ya dice a qué hora abren las puertas: se precumplimenta (se puede cambiar, y se
      // pueden añadir varias aperturas en la misma actividad).
      if (kind === 'APERTURA_PUERTAS' && DOORS) d.start_time = DOORS;
      if (kind === 'ENTREVISTA') d.interview = { type: '', media_id: '', media_name: '', media_logo: '', media_icon: '',
                                                 program: '', modality: '', location_id: '', zoom_url: '', zoom_tbc: false,
                                                 call_to: {}, formation: '', sings: false, live: false, songs: [] };
      // Un M&G, una sesión de fotos o una comida son EN EL RECINTO salvo que se diga otra cosa; el
      // M&G nace con el número de personas que dice la ficha y la comida sin saber si hay reserva.
      if (ruleHas('place', kind)) d.place = { mode: 'VENUE', space: '', venue_id: '', venue_name: '' };
      if (kind === 'MG') d.mg_count = MG_COUNT;
      if (kind === 'COMIDA') d.meal = { reservation: null, diners: '' };
      // Un TRASLADO: todo lo suyo (`newTransport`) y, por defecto, lo ven SUS PASAJEROS.
      if (kindInfo(kind).transport) { d.transport = newTransport(kind); d.audience = { mode: 'PASSENGERS', roles: [], ids: [] }; }
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
      // `imgCls`/`cls`: un LOGO (una compañía de transporte) no va en redondo como una cara.
      var vis = o.img ? '<img src="' + esc(o.img) + '" alt=""' + (o.imgCls ? ' class="' + esc(o.imgCls) + '"' : '') + '>'
                      : '<i class="fa ' + esc(o.icon || 'fa-circle') + '"></i>';
      return '<label class="promo-pick' + (o.cls ? ' ' + esc(o.cls) : '') + '"><input type="' + (o.multi ? 'checkbox' : 'radio') + '" name="' + esc(o.name) + '"'
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

    // ================================================================ TRASLADOS
    /* ⚠️⚠️ CADA TRASLADO PREGUNTA LO SUYO (sep 2026, lo pidió Dani, lote 3). Un solo asistente
       (`openTransportEditor`) con cuatro caminos según el tipo:
         · TRANSFER: dónde se recoge (se sugiere donde esté el artista según la agenda: el destino del
           traslado anterior, el sitio del punto anterior, el hotel del día, el recinto), las
           instrucciones del punto de recogida y el bono · a qué hora · a dónde (con la duración y los km
           calculados por la ruta) · quién lo presta (el promotor, nosotros u otro: su persona de
           contacto o el conductor, su teléfono y la matrícula) · los pasajeros · quién lo ve.
         · VUELO · TREN · BARCO · AUTOBÚS («LINEA»): la compañía de la base, el origen y el destino con
           su buscador (aeropuertos por nombre o código IATA con su TERMINAL; estaciones, puertos y
           estaciones de autobuses por OpenStreetMap), el nº y las horas · el día y el estado · los
           pasajeros en TABLA (localizador —o el mismo para todos—, confirmado, maletas de mano y
           facturadas, la tarjeta de embarque) · quién lo ve.
         · CABIFY / TAXI («RIDE»): la compañía, la recogida sugerida y el punto de encuentro · la hora,
           el estado y el enlace de seguimiento · el destino sugerido · los pasajeros · quién lo ve.
         · FURGONETA («VAN»): con conductor o alquilada (la recogida y la devolución de la reserva, su
           localizador) · el conductor, las plazas, el espacio de carga y la matrícula · cuándo · el
           trayecto con PARADAS (km y duración por la ruta) · los pasajeros (no más que plazas, y en
           qué parada sube cada uno) · quién lo ve.
       Lo que se guarda es UN solo `transport` para todos (ver `_roadmap_clean_transport`); lo que no
       toca a un tipo queda vacío. El ESTADO (confirmado · reservado · provisional) manda sobre
       «confirmado». Y UN TRASLADO LO VEN SUS PASAJEROS siempre (`audience.mode` PASSENGERS), más quien
       se añada. El bono y las tarjetas de embarque de un traslado NUEVO se adjuntan al guardar (el
       servidor devuelve `item_id`). */
    var TR_CFG = {
      VUELO:   { grupo: 'LINEA', place: 'AIRPORT', placeLabel: 'aeropuerto', placePh: 'Busca el aeropuerto por nombre o código (MAD, XRY…)…', num: 'Nº de vuelo', terminal: true, iconOut: 'fa-plane-departure', iconIn: 'fa-plane-arrival', q: '¿Qué vuelo es?' },
      TREN:    { grupo: 'LINEA', place: 'STATION', placeLabel: 'estación', placePh: 'Busca la estación (Atocha, Sants…)…', num: 'Nº de tren', terminal: false, iconOut: 'fa-train', iconIn: 'fa-train', q: '¿Qué tren es?' },
      BARCO:   { grupo: 'LINEA', place: 'PORT', placeLabel: 'puerto', placePh: 'Busca el puerto o la estación marítima…', num: 'Barco / nº', terminal: false, iconOut: 'fa-ship', iconIn: 'fa-anchor', q: '¿Qué barco es?' },
      AUTOBUS: { grupo: 'LINEA', place: 'BUS', placeLabel: 'estación de autobuses', placePh: 'Busca la estación de autobuses…', num: 'Línea / nº', terminal: false, iconOut: 'fa-bus', iconIn: 'fa-bus', q: '¿Qué autobús es?', addr: true },
      TRANSFER: { grupo: 'TRANSFER' }, CABIFY: { grupo: 'RIDE' }, TAXI: { grupo: 'RIDE' }, FURGONETA: { grupo: 'VAN' }
    };
    function trCfg(kind) { return TR_CFG[kind] || { grupo: 'LINEA', place: '', placeLabel: 'sitio', placePh: 'Escribe el sitio…', num: 'Nº', terminal: false, iconOut: 'fa-location-dot', iconIn: 'fa-flag-checkered', q: '¿De dónde a dónde?', addr: true }; }
    function emptyPoint() { return { label: '', code: '', terminal: '', lat: null, lng: null, kind: '', ref_id: '', address: '' }; }
    function newTransport(kind) {
      return { mode: kind, company_id: '', company: '', logo_url: '', number: '', number_arrival: '', status: 'CONFIRMADO', tracking_url: '',
               origin: '', destination: '', origin_place: emptyPoint(), destination_place: emptyPoint(), duration: '', distance_km: null,
               ends_next_day: false, same_locator: false, locator_all: '', passengers: [], stops: [],
               provider: { kind: '', contact: {}, driver_name: '', driver_phone: '', plate: '' },
               van: { rental: false, pickup_place: emptyPoint(), pickup_at: '', return_place: emptyPoint(), return_at: '', locator: '', driver: {}, seats: 0, cargo: null, plate: '' } };
    }
    /* Un traslado de ANTES (compañía y sitios como texto) entra en la forma nueva sin perder nada. */
    function normTransport(t, kind) {
      var n = newTransport(kind);
      t = t || {};
      Object.keys(n).forEach(function (k) { if (t[k] === undefined || t[k] === null) t[k] = n[k]; });
      if (!t.origin_place || !t.origin_place.label) t.origin_place = t.origin ? { label: t.origin, code: '', terminal: '', lat: null, lng: null, kind: 'ADDRESS', ref_id: '', address: '' } : (t.origin_place || emptyPoint());
      if (!t.destination_place || !t.destination_place.label) t.destination_place = t.destination ? { label: t.destination, code: '', terminal: '', lat: null, lng: null, kind: 'ADDRESS', ref_id: '', address: '' } : (t.destination_place || emptyPoint());
      ['origin_place', 'destination_place'].forEach(function (k) { var e = emptyPoint(); Object.keys(e).forEach(function (f) { if (t[k][f] === undefined) t[k][f] = e[f]; }); });
      t.provider = Object.assign(n.provider, t.provider || {});
      t.van = Object.assign(n.van, t.van || {});
      if (!t.van.pickup_place) t.van.pickup_place = emptyPoint();
      if (!t.van.return_place) t.van.return_place = emptyPoint();
      t.passengers = (t.passengers || []).map(function (p) { return Object.assign({ locator: '', ticket_url: '', ticket_name: '', confirmed: false, bags_hand: 0, bags_checked: 0, boarding_stop: '' }, p); });
      t.stops = t.stops || [];
      if (!t.status) t.status = 'CONFIRMADO';
      return t;
    }
    function pointText(p) {
      if (!p) return '';
      var txt = p.label || '';
      if (p.code) txt = txt ? txt + ' (' + p.code + ')' : p.code;
      if (p.terminal) txt = txt ? txt + ' · ' + p.terminal : p.terminal;
      return txt;
    }
    function pointIcon(p) {
      var k = (p && p.kind) || '';
      return { AIRPORT: 'fa-plane', STATION: 'fa-train', PORT: 'fa-ship', BUS: 'fa-bus', HOTEL: 'fa-hotel', VENUE: 'fa-location-dot', ITEM: 'fa-clock' }[k] || 'fa-location-dot';
    }
    function structured(p) { return !!(p && p.label && p.kind && p.kind !== 'ADDRESS'); }
    /* Los SITIOS de un traslado que se buscan: aeropuertos (con su IATA), estaciones, puertos y
       estaciones de autobuses (`/api/lugares-transporte`). */
    function searchPlaces(kind, q) {
      return getJson('/api/lugares-transporte?kind=' + encodeURIComponent(kind || '') + '&q=' + encodeURIComponent(q)).then(function (list) {
        return (list || []).map(function (r) {
          return { id: (r.code || r.label), label: r.label + (r.code ? ' (' + r.code + ')' : ''), name: r.label, code: r.code || '', sub: r.sub || '',
                   kind: r.kind || kind, lat: r.lat, lng: r.lng, icon: pointIcon({ kind: r.kind || kind }) };
        });
      });
    }
    /* DÓNDE ESTÁ EL ARTISTA según la agenda, para sugerir la RECOGIDA (el último sitio antes de la
       hora: el destino del traslado anterior, el sitio del punto anterior, el recinto de la prueba de
       sonido; si no hay nada, el hotel de ese día; si no, el recinto) y el DESTINO (el siguiente sitio
       al que tiene que ir, el recinto, el hotel). */
    function itemPlace(it, when) {
      if (!it || it.cancelled) return null;
      var ki = kindInfo(it.kind);
      if (ki.transport && it.transport) {
        // De un traslado ANTERIOR interesa dónde dejó al artista (su destino); del SIGUIENTE, de dónde
        // sale (su origen: el aeropuerto al que hay que llegar).
        var d = when === 'after' ? it.transport.origin_place : it.transport.destination_place;
        var txt = when === 'after' ? it.transport.origin : it.transport.destination;
        if (d && d.label) return { label: d.label, code: d.code || '', kind: d.kind || 'ADDRESS', lat: d.lat, lng: d.lng, ref_id: it.id, address: d.address || '' };
        if (txt) return { label: txt, kind: 'ADDRESS', ref_id: it.id };
        return null;
      }
      if (ruleHas('at_venue', it.kind) || (it.place && it.place.mode !== 'OTHER' && ruleHas('place', it.kind))) return venuePoint(it.place && it.place.space);
      if (it.location) return { label: it.location, kind: 'ADDRESS', ref_id: it.id, address: it.location };
      return null;
    }
    function venuePoint(space) {
      if (!VENUE || !VENUE.name) return null;
      var pin = hasPin(VENUE);
      return { label: [VENUE.name, space].filter(Boolean).join(' · '), address: VENUE.maps_query || '', lat: pin ? VENUE.access_lat : (VENUE.lat || null), lng: pin ? VENUE.access_lng : (VENUE.lng || null),
               kind: 'VENUE', ref_id: VENUE.id || '', icon: 'fa-location-dot', sub: 'El recinto' + (VENUE.place_label ? ' · ' + VENUE.place_label : '') };
    }
    function hotelPoints(day) {
      return (P.hotels || []).filter(function (h) { return !day || !(h.days || []).length || (h.days || []).indexOf(day) >= 0; })
        .map(function (h) { return { label: h.name || 'Hotel', address: h.address || '', kind: 'HOTEL', ref_id: h.id, icon: 'fa-hotel', sub: h.address || 'El hotel' }; });
    }
    function placeSuggestions(draft, when) {
      var out = [], vistos = {};
      function add(p) { if (!p || !p.label) return; var k = normText(p.label); if (vistos[k]) return; vistos[k] = 1; out.push(p); }
      var day = draft.day, hora = draft.start_time || '';
      var mismos = (P.agenda || []).filter(function (it) { return it.day === day && String(it.id) !== String(draft.id) && !it.cancelled; })
        .sort(function (x, y) { return (x.start_time || '99') < (y.start_time || '99') ? -1 : 1; });
      if (when === 'before') {
        var previos = mismos.filter(function (it) { return !hora || (it.start_time || '') < hora; });
        for (var i = previos.length - 1; i >= 0; i--) {
          var p = itemPlace(previos[i], 'before');
          if (p) { p.icon = p.icon || kindInfo(previos[i].kind).icon; p.sub = p.sub || ('Antes: ' + (previos[i].title || kindInfo(previos[i].kind).label)); add(p); break; }
        }
        hotelPoints(day).forEach(add);
        add(venuePoint());
      } else {
        var siguientes = mismos.filter(function (it) { return !hora || (it.start_time || '') > hora; });
        for (var j = 0; j < siguientes.length; j++) {
          var q = itemPlace(siguientes[j], 'after');
          if (q) { q.icon = q.icon || kindInfo(siguientes[j].kind).icon; q.sub = q.sub || ('Después: ' + (siguientes[j].title || kindInfo(siguientes[j].kind).label)); add(q); break; }
        }
        add(venuePoint());
        hotelPoints(day).forEach(add);
      }
      return out.slice(0, 6);
    }
    /* UN SITIO del traslado: la elección hecha (chip), las SUGERENCIAS como tarjetas, el buscador del
       tipo (aeropuerto, estación…) y/o una dirección escrita, y la terminal. */
    function placeBlock(key, point, o) {
      var s2 = structured(point);
      return '<div class="rm-wz-block mb-3" data-pp="' + esc(key) + '">'
        + '<div class="rm-wz-lbl"><i class="fa ' + esc(o.icon || 'fa-location-dot') + '"></i>' + esc(o.title) + '</div>'
        + '<div class="rm-chip mb-2' + (s2 ? '' : ' d-none') + '" data-pp-chip><i class="fa ' + esc(pointIcon(point)) + ' me-1"></i><span data-pp-text>' + esc(pointText(point)) + '</span><button type="button" class="btn-close btn-sm ms-1" data-pp-clear title="Quitar"></button></div>'
        + '<div class="promo-pick-grid promo-pick-grid--wide mb-2 d-none" data-pp-sug></div>'
        + (o.kind ? wzSearch('pp_' + key, o.ph || 'Busca…', false) : '')
        + (o.addr ? '<div class="' + (o.kind ? 'mt-2 ' : '') + '" data-address-autocomplete><input class="form-control" data-addr="full" data-pp-input placeholder="' + esc(o.addrPh || 'O escribe una dirección…') + '" value="' + esc((!s2 && point && point.label) ? point.label : '') + '"></div>' : '')
        + (o.terminal ? '<div class="mt-2"><label class="form-label small mb-1"><i class="fa fa-door-open me-1 text-muted"></i>Terminal</label><input class="form-control" data-pp-terminal value="' + esc((point && point.terminal) || '') + '" placeholder="T4, T2, Satélite…" style="max-width:14rem"></div>' : '')
        + (o.extra || '')
        + '</div>';
    }
    function wirePlace(m, key, point, o, onChange) {
      var box = m.querySelector('[data-pp="' + key + '"]'); if (!box) return;
      var chip = box.querySelector('[data-pp-chip]'), txt = box.querySelector('[data-pp-text]'), ico = chip.querySelector('i');
      var inp = box.querySelector('[data-pp-input]'), term = box.querySelector('[data-pp-terminal]'), sugBox = box.querySelector('[data-pp-sug]');
      var srch = box.querySelector('[data-search="pp_' + key + '"]');
      function paintChip() {
        var s2 = structured(point);
        chip.classList.toggle('d-none', !s2);
        if (s2) { txt.textContent = pointText(point); ico.className = 'fa ' + pointIcon(point) + ' me-1'; if (inp) inp.value = ''; if (srch) srch.value = ''; }
      }
      function paintSug() {
        if (!sugBox) return;
        var sug = (typeof o.sug === 'function') ? o.sug() : (o.sug || []);
        sugBox.classList.toggle('d-none', !sug.length);
        sugBox.innerHTML = sug.map(function (p, i) {
          return wzPick({ name: 'rmPP_' + key, value: String(i), icon: p.icon || pointIcon(p), label: p.label, hint: p.sub || '',
                          checked: structured(point) && normText(point.label) === normText(p.label), attrs: ' data-pp-opt="' + i + '"' });
        }).join('');
        sugBox.querySelectorAll('[data-pp-opt]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (!r.checked) return;
            var p = sug[parseInt(r.getAttribute('data-pp-opt'), 10)]; if (!p) return;
            set({ label: p.label, code: p.code || '', kind: p.kind || 'ADDRESS', lat: p.lat, lng: p.lng, ref_id: p.ref_id || '', address: p.address || '' });
          });
        });
      }
      function set(p, silencio) {
        point.label = p.label || ''; point.code = p.code || ''; point.kind = p.kind || ''; point.ref_id = p.ref_id || ''; point.address = p.address || '';
        point.lat = (p.lat === undefined || p.lat === '' ) ? null : p.lat; point.lng = (p.lng === undefined || p.lng === '') ? null : p.lng;
        if (!silencio) paintChip();
        if (onChange) onChange();
      }
      box.rmRepaint = paintSug;
      /* Lo escrito en el buscador sin elegir nada VALE como sitio (un aeropuerto que no está en el
         catálogo): se recoge al guardar. */
      box.rmFinalize = function () {
        if (!point.label && srch && srch.value.trim()) set({ label: srch.value.trim(), kind: o.kind || 'ADDRESS' }, true);
        if (!point.label && inp && inp.value.trim()) set({ label: inp.value.trim(), kind: 'ADDRESS', address: inp.value.trim() }, true);
        if (term) point.terminal = term.value.trim();
      };
      box.querySelector('[data-pp-clear]').addEventListener('click', function () { set({}); if (inp) inp.value = ''; });
      if (srch) attachSearch(srch, box.querySelector('[data-results="pp_' + key + '"]'), function (q) { return searchPlaces(o.kind, q); }, function (r) {
        set({ label: r.name || r.label, code: r.code || '', kind: r.kind || o.kind, lat: r.lat, lng: r.lng });
      }, { clearOnPick: true, minChars: 2 });
      if (inp) inp.addEventListener('input', function () {
        var v = inp.value.trim();
        if (!v) { if (!structured(point)) set({}, true); return; }
        set({ label: v, kind: 'ADDRESS', address: v }, true);
        chip.classList.add('d-none');
      });
      if (term) term.addEventListener('input', function () { point.terminal = term.value.trim(); });
      paintSug();
    }
    /* LA RUTA en coche (kilómetros y duración) entre el origen, las paradas y el destino: la calcula
       el servidor con OpenStreetMap. Es una ayuda: si no sale, se dice y se escribe a mano. */
    function scheduleRoute(m, draft) {
      clearTimeout(m.rmRouteTimer);
      m.rmRouteTimer = setTimeout(function () { routeEstimate(m, draft); }, 500);
    }
    function routeEstimate(m, draft) {
      var t = draft.transport;
      var pts = [t.origin_place].concat(t.stops || []).concat([t.destination_place]).filter(function (p) { return p && (p.label || (p.lat && p.lng)); });
      var hint = m.querySelector('[data-route-hint]'), dur = m.querySelector('[data-t="duration"]'), km = m.querySelector('[data-t="distance_km"]');
      if (pts.length < 2 || !t.origin_place.label || !t.destination_place.label) { if (hint) hint.textContent = 'Con el origen y el destino puestos se calcula la ruta en coche.'; return; }
      if (hint) hint.textContent = 'Calculando la ruta…';
      postJson('/api/ruta-estimacion', { points: pts.map(function (p) { return { lat: p.lat, lng: p.lng, address: p.address || p.label, label: p.label }; }) }).then(function (r) {
        if (!(r && r.ok)) { if (hint) hint.textContent = (r && r.error) || 'No se pudo calcular: escribe la duración a mano.'; return; }
        t.distance_km = r.distance_km;
        (r.points || []).forEach(function (c, i) { if (pts[i] && (pts[i].lat === null || pts[i].lat === undefined)) { pts[i].lat = c.lat; pts[i].lng = c.lng; } });
        if (dur && (m.rmDurAuto !== false || !dur.value.trim())) { dur.value = r.duration_label || ''; m.rmDurAuto = true; }
        if (km) km.value = r.distance_km;
        if (hint) hint.textContent = '≈ ' + r.distance_km + ' km · ' + r.duration_label + ' en coche (calculado; se puede cambiar).';
      }).catch(function () { if (hint) hint.textContent = 'No se pudo calcular: escribe la duración a mano.'; });
    }
    // ---- los bloques del asistente
    function daysGrid(draft) {
      return '<div class="promo-pick-grid promo-pick-grid--wide mb-3" data-days>'
        + DAYS.map(function (d) {
            return '<label class="promo-pick"><input type="radio" name="rmDay" value="' + esc(d.date) + '"' + (d.date === draft.day ? ' checked' : '') + ' data-day-opt>'
              + '<span class="promo-pick__box"><span class="rm-cal"><span class="wd">' + esc(d.weekday) + '</span><span class="num">' + esc(d.day) + '</span><span class="mo">' + esc(d.month) + '</span></span>'
              + '<span class="promo-pick__name">' + esc(d.label) + '</span></span></label>';
          }).join('') + '</div>';
    }
    function whenBlock(draft, o) {
      o = o || {};
      var h = daysGrid(draft) + '<div class="row g-2 align-items-end">';
      if (!o.onlyDay) {
        h += '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa fa-clock me-1 text-muted"></i>' + esc(o.startLabel || 'Empieza') + '</label><input type="time" class="form-control" data-f="start_time" value="' + esc(draft.start_time || '') + '"></div>';
        if (o.end !== false) h += '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa fa-flag-checkered me-1 text-muted"></i>' + esc(o.endLabel || 'Termina') + '</label><input type="time" class="form-control" data-f="end_time" value="' + esc(draft.end_time || '') + '"></div>';
      }
      h += '<div class="col-md-6"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-f="tbc"' + (draft.tbc ? ' checked' : '') + '><i class="fa fa-hourglass-half"></i>La hora está por confirmar (TBC)</label></div></div></div>';
      return h;
    }
    function statusBlock(t, o) {
      var st = t.status || 'CONFIRMADO';
      return '<div class="rm-wz-lbl mt-3"><i class="fa fa-circle-check"></i>¿Cómo está?</div>'
        + '<div class="promo-pick-grid promo-pick-grid--wide">'
        + wzPick({ name: 'rmTrStatus', value: 'CONFIRMADO', icon: 'fa-circle-check', label: 'Confirmado', checked: st === 'CONFIRMADO' })
        + wzPick({ name: 'rmTrStatus', value: 'RESERVADO', icon: 'fa-bookmark', label: 'Reservado', checked: st === 'RESERVADO', hint: 'Pedido, sin confirmar' })
        + wzPick({ name: 'rmTrStatus', value: 'PROVISIONAL', icon: 'fa-hourglass-half', label: 'Provisional', checked: st === 'PROVISIONAL', hint: 'Se ve rayado' })
        + '</div>'
        + ((o && o.tracking) ? '<div class="mt-3"><label class="form-label small mb-1"><i class="fa fa-location-crosshairs me-1 text-muted"></i>Enlace de seguimiento (si lo hay)</label><input class="form-control" data-t="tracking_url" value="' + esc(t.tracking_url || '') + '" placeholder="https://…"><div class="filter-hint">Con el enlace puesto, en la hoja de ruta sale el icono para ver el seguimiento.</div></div>' : '');
    }
    function accessBlock(draft, titulo, ph) {
      var on = !!(draft.access_note || hasPin(draft));
      return '<div class="rm-wz-block mb-3"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-f="access_on"' + (on ? ' checked' : '') + '><i class="fa fa-door-open"></i>' + esc(titulo || 'Instrucciones de acceso') + '</label></div>'
        + '<div class="mt-2' + (on ? '' : ' d-none') + '" data-access-wrap>'
        + '<textarea class="form-control" rows="2" data-f="access_note" placeholder="' + esc(ph || 'Por dónde se entra, a quién preguntar, dónde se aparca…') + '">' + esc(draft.access_note || '') + '</textarea>'
        + '<div class="mt-2" data-access-pin></div></div></div>';
    }
    function noteBlock(draft) {
      return '<div class="mt-3"><label class="form-label small mb-1"><i class="fa fa-note-sticky me-1 text-muted"></i>Nota</label>'
        + '<textarea class="form-control" data-f="note" rows="3" placeholder="Cualquier detalle que haya que tener en cuenta">' + esc(draft.note || '') + '</textarea></div>';
    }
    function durationBlock(t, o) {
      return '<div class="row g-2 mt-2 align-items-end">'
        + '<div class="col-md-4"><label class="form-label small mb-1"><i class="fa fa-stopwatch me-1 text-muted"></i>Duración</label><input class="form-control" data-t="duration" value="' + esc(t.duration || '') + '" placeholder="Se calcula sola"></div>'
        + ((o && o.km) ? '<div class="col-md-3"><label class="form-label small mb-1"><i class="fa fa-road me-1 text-muted"></i>Kilómetros</label><input class="form-control" data-t="distance_km" value="' + esc(t.distance_km || '') + '"></div>' : '')
        + '<div class="col"><div class="rm-sub" data-route-hint>' + (t.distance_km ? '≈ ' + esc(t.distance_km) + ' km' : 'Con el origen y el destino puestos se calcula la ruta en coche.') + '</div></div></div>';
    }
    function attachBlock(draft, titulo) {
      return '<div class="rm-wz-block"><div class="rm-wz-lbl"><i class="fa fa-paperclip"></i>' + esc(titulo || 'Adjuntos') + '</div>'
        + '<div data-atts></div><div data-staged class="d-flex flex-wrap gap-1"></div>'
        + '<label class="btn btn-outline-secondary btn-sm mt-1"><i class="fa fa-paperclip"></i> Adjuntar<input type="file" hidden data-attin></label>'
        + (draft.id ? '' : '<span class="rm-sub ms-2">Se adjunta al guardar.</span>') + '</div>';
    }
    /* EL TRAYECTO de un vuelo, un tren, un barco o un autobús: el origen y el destino con su buscador,
       su terminal, su nº y su hora (la llegada puede ser al día siguiente). */
    function legBlock(draft, cfg) {
      var t = draft.transport;
      var salida = '<div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-hashtag me-1 text-muted"></i>' + esc(cfg.num) + '</label><input class="form-control" data-t="number" value="' + esc(t.number || '') + '"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-clock me-1 text-muted"></i>Hora de salida</label><input type="time" class="form-control" data-f="start_time" value="' + esc(draft.start_time || '') + '"></div></div>';
      var llegada = '<div class="row g-2 mt-1"><div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-hashtag me-1 text-muted"></i>' + esc(cfg.num) + ' <span class="text-muted fw-normal">(si cambia: una escala)</span></label><input class="form-control" data-t="number_arrival" value="' + esc(t.number_arrival || '') + '"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-clock me-1 text-muted"></i>Hora de llegada</label><input type="time" class="form-control" data-f="end_time" value="' + esc(draft.end_time || '') + '"></div>'
        + '<div class="col-12"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-t="ends_next_day"' + (t.ends_next_day ? ' checked' : '') + '><i class="fa fa-moon"></i>Llega al día siguiente (+1)</label></div></div></div>';
      return placeBlock('origin', t.origin_place, { title: 'Origen', icon: cfg.iconOut, kind: cfg.place, ph: cfg.placePh, terminal: cfg.terminal, addr: !!cfg.addr, addrPh: 'O escribe una dirección…', extra: salida })
        + placeBlock('destination', t.destination_place, { title: 'Destino', icon: cfg.iconIn, kind: cfg.place, ph: cfg.placePh, terminal: cfg.terminal, addr: !!cfg.addr, addrPh: 'O escribe una dirección…', extra: llegada });
    }
    /* QUIÉN PRESTA un transfer: el promotor, nosotros u otro; su persona de contacto (se busca, y en
       el promotor se sugieren las suyas) o, si no hay ficha, el conductor, su teléfono y la matrícula. */
    function providerBlock(draft) {
      var pv = draft.transport.provider, c = pv.contact || {};
      return '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
        + wzPick({ name: 'rmProv', value: 'PROMOTER', icon: 'fa-handshake', label: 'El promotor', checked: pv.kind === 'PROMOTER', attrs: ' data-prov-opt' })
        + wzPick({ name: 'rmProv', value: 'US', icon: 'fa-building', label: 'Nosotros', checked: pv.kind === 'US', attrs: ' data-prov-opt' })
        + wzPick({ name: 'rmProv', value: 'OTHER', icon: 'fa-van-shuttle', label: 'Otro', hint: 'Una empresa de transfers…', checked: pv.kind === 'OTHER', attrs: ' data-prov-opt' })
        + '</div>'
        + '<div class="rm-wz-block mb-3"><div class="rm-wz-lbl"><i class="fa fa-address-card"></i>Persona de contacto</div>'
        + '<div class="rm-chip mb-2' + (c.name ? '' : ' d-none') + '" data-pc-chip><span data-pc-ava>' + avatar(c.photo || '', 'fa-user') + '</span><span data-pc-name>' + esc(c.name || '') + '</span><span class="rm-sub ms-1" data-pc-phone>' + esc(c.phone || '') + '</span><button type="button" class="btn-close btn-sm ms-1" data-pc-clear title="Quitar"></button></div>'
        + '<div class="promo-pick-grid mb-2 d-none" data-pc-sug></div>'
        + wzSearch('pcontact', 'Busca a la persona (terceros, la oficina, integrantes)…', false)
        + '<div class="row g-2 mt-2">'
        + '<div class="col-md-5"><label class="form-label small mb-1"><i class="fa fa-id-card me-1 text-muted"></i>Conductor</label><input class="form-control" data-pv="driver_name" value="' + esc(pv.driver_name || '') + '" placeholder="Si se sabe"></div>'
        + '<div class="col-md-4"><label class="form-label small mb-1"><i class="fa fa-phone me-1 text-muted"></i>Teléfono</label><input class="form-control" data-pv="driver_phone" value="' + esc(pv.driver_phone || '') + '"></div>'
        + '<div class="col-md-3"><label class="form-label small mb-1"><i class="fa fa-car-side me-1 text-muted"></i>Matrícula</label><input class="form-control" data-pv="plate" value="' + esc(pv.plate || '') + '" placeholder="1234 ABC"></div>'
        + '</div><div class="filter-hint">Todo opcional: lo que se sepa.</div></div>'
        + '<div class="rm-wz-block">' + companyBlock(draft, kindInfo(draft.kind)) + '</div>';
    }
    function wireProvider(m, draft) {
      var pv = draft.transport.provider;
      var chip = m.querySelector('[data-pc-chip]'); if (!chip) return;
      var nm = m.querySelector('[data-pc-name]'), av = m.querySelector('[data-pc-ava]'), ph = m.querySelector('[data-pc-phone]'), sug = m.querySelector('[data-pc-sug]');
      function setContact(c) {
        pv.contact = c || {};
        nm.textContent = pv.contact.name || ''; ph.textContent = pv.contact.phone || '';
        av.innerHTML = avatar(pv.contact.photo || '', 'fa-user');
        chip.classList.toggle('d-none', !pv.contact.name);
      }
      function pintaSug() {
        if (!sug) return;
        // Con el PROMOTOR, sus personas de contacto (las mismas del paso de contactos de los puntos).
        var rows = pv.kind === 'PROMOTER' ? CONTACT_SUG.filter(function (c) { return /^(Promotor|De la actividad|Vinculado)/.test(c.source || ''); }) : [];
        sug.classList.toggle('d-none', !rows.length);
        sug.innerHTML = rows.map(function (c, i) { return wzPick({ name: 'rmPcSug', value: String(i), img: c.photo || AVATAR, icon: 'fa-user', label: c.name, hint: [c.role, c.source].filter(Boolean).join(' · '), checked: !!(pv.contact && pv.contact.name && normText(pv.contact.name) === normText(c.name)), attrs: ' data-pcs-idx="' + i + '"' }); }).join('');
        sug.querySelectorAll('[data-pcs-idx]').forEach(function (r) { r.addEventListener('change', function () { if (!r.checked) return; var c = rows[parseInt(r.getAttribute('data-pcs-idx'), 10)]; if (c) setContact({ name: c.name, phone: c.phone || '', email: c.email || '', photo: c.photo || '', role: c.role || '', promoter_id: c.promoter_id || '' }); }); });
      }
      m.querySelectorAll('[data-prov-opt]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) { pv.kind = r.value; pintaSug(); } }); });
      m.querySelector('[data-pc-clear]').addEventListener('click', function () { setContact({}); if (sug) sug.querySelectorAll('input').forEach(function (i) { i.checked = false; }); });
      attachSearch(m.querySelector('[data-search="pcontact"]'), m.querySelector('[data-results="pcontact"]'), searchRoadmapPeople, function (r) {
        setContact({ name: r.label, phone: r.phone || '', email: r.email || '', photo: r.logo_url || '', promoter_id: (r.kind === 'PROMOTER' || r.kind === 'MEMBER') ? r.id : '' });
      }, { clearOnPick: true });
      pintaSug();
    }
    /* LA FURGONETA: con conductor o ALQUILADA (y entonces dónde y cuándo se recoge y se devuelve la
       reserva, con su localizador); quién conduce, las plazas, si lleva espacio de carga y la matrícula. */
    function vanModeBlock(draft) {
      var v = draft.transport.van;
      return '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
        + wzPick({ name: 'rmVanMode', value: 'DRIVER', icon: 'fa-id-card', label: 'Con conductor', hint: 'La lleva alguien', checked: !v.rental, attrs: ' data-van-mode' })
        + wzPick({ name: 'rmVanMode', value: 'RENTAL', icon: 'fa-key', label: 'Reserva de alquiler', hint: 'Se recoge y se devuelve', checked: !!v.rental, attrs: ' data-van-mode' })
        + '</div>'
        + '<div class="' + (v.rental ? '' : 'd-none') + '" data-van-rental>'
        + placeBlock('van_pickup', v.pickup_place, { title: 'Dónde se recoge la furgoneta', icon: 'fa-key', addr: true, addrPh: 'La oficina de alquiler, su dirección…' })
        + '<div class="row g-2 mb-3"><div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-calendar-day me-1 text-muted"></i>Recogida (fecha y hora)</label><input type="datetime-local" class="form-control" data-van="pickup_at" value="' + esc(v.pickup_at || '') + '"></div>'
        + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-ticket me-1 text-muted"></i>Localizador de la reserva</label><input class="form-control" data-van="locator" value="' + esc(v.locator || '') + '"></div></div>'
        + placeBlock('van_return', v.return_place, { title: 'Dónde se devuelve', icon: 'fa-right-left', addr: true, addrPh: 'Si es otro sitio: su dirección…' })
        + '<div class="row g-2"><div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-calendar-check me-1 text-muted"></i>Devolución (fecha y hora)</label><input type="datetime-local" class="form-control" data-van="return_at" value="' + esc(v.return_at || '') + '"></div></div>'
        + '</div>';
    }
    function vanBlock(draft) {
      var v = draft.transport.van, d = v.driver || {};
      return '<div class="rm-wz-block mb-3"><div class="rm-wz-lbl"><i class="fa fa-id-card"></i>¿Quién conduce?</div>'
        + '<div class="rm-chip mb-2' + (d.name ? '' : ' d-none') + '" data-vd-chip><span data-vd-ava>' + avatar(d.photo_url || '', 'fa-user') + '</span><span data-vd-name>' + esc(d.name || '') + '</span><span class="rm-sub ms-1" data-vd-phone>' + esc(d.phone || '') + '</span><button type="button" class="btn-close btn-sm ms-1" data-vd-clear title="Quitar"></button></div>'
        + wzSearch('vdriver', 'Busca en el personal, la oficina o los terceros…', false)
        + '<div class="row g-2 mt-2"><div class="col-md-7"><input class="form-control form-control-sm" data-vd-manual placeholder="…o escribe el nombre del conductor"></div><div class="col-md-5"><input class="form-control form-control-sm" data-vd-mphone placeholder="Su teléfono"></div></div></div>'
        + '<div class="row g-2 mb-3">'
        + '<div class="col-md-4"><label class="form-label small mb-1"><i class="fa fa-chair me-1 text-muted"></i>Plazas</label><input type="number" min="1" max="60" class="form-control" data-van="seats" value="' + esc(v.seats || '') + '" placeholder="9"></div>'
        + '<div class="col-md-4"><label class="form-label small mb-1"><i class="fa fa-car-side me-1 text-muted"></i>Matrícula</label><input class="form-control" data-van="plate" value="' + esc(v.plate || '') + '" placeholder="1234 ABC"></div>'
        + '</div>'
        + '<div class="rm-wz-lbl"><i class="fa fa-boxes-stacked"></i>¿Lleva espacio de carga?</div>'
        + '<div class="promo-pick-grid promo-pick-grid--wide">'
        + wzPick({ name: 'rmCargo', value: '1', icon: 'fa-boxes-stacked', label: 'Con espacio de carga', hint: 'Backline, maletas…', checked: v.cargo === true })
        + wzPick({ name: 'rmCargo', value: '0', icon: 'fa-people-group', label: 'Solo personas', checked: v.cargo === false })
        + '</div>';
    }
    function wireVan(m, draft) {
      var v = draft.transport.van;
      var rentalBox = m.querySelector('[data-van-rental]');
      m.querySelectorAll('[data-van-mode]').forEach(function (r) { r.addEventListener('change', function () { if (!r.checked) return; v.rental = r.value === 'RENTAL'; if (rentalBox) rentalBox.classList.toggle('d-none', !v.rental); }); });
      wirePlace(m, 'van_pickup', v.pickup_place, { addr: true });
      wirePlace(m, 'van_return', v.return_place, { addr: true });
      var chip = m.querySelector('[data-vd-chip]');
      if (chip) {
        var nm = m.querySelector('[data-vd-name]'), av = m.querySelector('[data-vd-ava]'), ph = m.querySelector('[data-vd-phone]');
        function setDriver(d) { v.driver = d || {}; nm.textContent = v.driver.name || ''; ph.textContent = v.driver.phone || ''; av.innerHTML = avatar(v.driver.photo_url || '', 'fa-user'); chip.classList.toggle('d-none', !v.driver.name); }
        attachSearch(m.querySelector('[data-search="vdriver"]'), m.querySelector('[data-results="vdriver"]'), searchRoadmapPeople, function (r) {
          setDriver({ kind: (r.kind === 'USER' ? 'USER' : (r.kind === 'ARTIST' ? 'ARTIST' : 'PROMOTER')), id: r.id, name: r.label, photo_url: r.logo_url || '', phone: r.phone || '' });
          m.querySelector('[data-vd-manual]').value = '';
        }, { clearOnPick: true });
        m.querySelector('[data-vd-clear]').addEventListener('click', function () { setDriver({}); });
        var manual = m.querySelector('[data-vd-manual]'), mphone = m.querySelector('[data-vd-mphone]');
        function manualDriver() { var n = manual.value.trim(); if (!n) { if (v.driver && v.driver.kind === 'MANUAL') setDriver({}); return; } v.driver = { kind: 'MANUAL', id: '', name: n, photo_url: '', phone: mphone.value.trim() }; chip.classList.add('d-none'); }
        manual.addEventListener('input', manualDriver); mphone.addEventListener('input', manualDriver);
        if (v.driver && v.driver.kind === 'MANUAL') { manual.value = v.driver.name || ''; mphone.value = v.driver.phone || ''; chip.classList.add('d-none'); }
      }
    }
    /* LAS PARADAS INTERMEDIAS de una furgoneta (con su hora), en orden: entran en la ruta que se calcula
       y son donde puede subir cada pasajero. */
    function stopsBlock(t) {
      return '<div class="rm-wz-block mb-3" data-stops><div class="rm-wz-lbl"><i class="fa fa-route"></i>Paradas intermedias</div>'
        + '<div data-stops-list></div>'
        + '<div class="d-flex gap-2 mt-2 align-items-start"><div class="flex-grow-1" data-address-autocomplete><input class="form-control form-control-sm" data-addr="full" data-stop-input placeholder="Dirección de la parada…"></div>'
        + '<input type="time" class="form-control form-control-sm" style="max-width:8rem" data-stop-time title="Hora de paso">'
        + '<button type="button" class="rm-add sm" data-stop-add title="Añadir la parada"><i class="fa fa-plus"></i></button></div></div>';
    }
    function renderStops(m, draft) {
      var list = m.querySelector('[data-stops-list]'); if (!list) return;
      var t = draft.transport;
      list.innerHTML = (t.stops || []).length ? '' : '<div class="rm-sub">Sin paradas: del origen al destino.</div>';
      (t.stops || []).forEach(function (st, i) {
        var row = el('<div class="rm-stop"><span class="rm-stop__n">' + (i + 1) + '</span><div class="flex-grow-1 min-w-0"><div>' + esc(st.label) + '</div>' + (st.time ? '<div class="rm-sub">' + esc(st.time) + '</div>' : '') + '</div><button type="button" class="btn btn-link btn-sm text-danger p-0" data-stop-del>Quitar</button></div>');
        row.querySelector('[data-stop-del]').addEventListener('click', function () { t.stops.splice(i, 1); renderStops(m, draft); renderPassengers(m, draft, { stops: true, max: true }); scheduleRoute(m, draft); });
        list.appendChild(row);
      });
    }
    function wireStops(m, draft) {
      var box = m.querySelector('[data-stops]'); if (!box) return;
      var t = draft.transport;
      renderStops(m, draft);
      box.querySelector('[data-stop-add]').addEventListener('click', function () {
        var inp = box.querySelector('[data-stop-input]'), hora = box.querySelector('[data-stop-time]');
        var v = (inp.value || '').trim(); if (!v) { alert('Escribe la dirección de la parada.'); return; }
        t.stops.push({ id: Math.random().toString(36).slice(2, 10), label: v, address: v, kind: 'ADDRESS', code: '', terminal: '', lat: null, lng: null, ref_id: '', time: hora.value || '' });
        inp.value = ''; hora.value = '';
        renderStops(m, draft); renderPassengers(m, draft, { stops: true, max: true }); scheduleRoute(m, draft);
      });
    }
    /* LOS PASAJEROS: quiénes van y, en un vuelo/tren/barco/autobús, su localizador (o el mismo para
       todos), si está confirmado, sus MALETAS (de mano y facturadas) y su tarjeta de embarque; en una
       furgoneta, en qué parada sube cada uno. */
    function passengersBlock(draft, o) {
      var t = draft.transport;
      o = o || {};
      return '<div class="rm-wz-block"><div class="rm-wz-lbl"><i class="fa fa-user-group"></i>Pasajeros' + (o.max ? ' <span class="rm-sub" data-pass-count></span>' : '') + '</div>'
        + (o.table ? '<div class="filter-chips mb-2"><label class="filter-chip"><input type="checkbox" data-t="same_locator"' + (t.same_locator ? ' checked' : '') + '><i class="fa fa-ticket"></i>Mismo localizador para todos</label></div>'
            + '<input class="form-control form-control-sm mb-2' + (t.same_locator ? '' : ' d-none') + '" data-t="locator_all" value="' + esc(t.locator_all || '') + '" placeholder="Localizador común" style="max-width:16rem">' : '')
        + '<div data-pass></div>'
        + '<button type="button" class="rm-add sm mt-1" data-addpass><i class="fa fa-plus"></i> Añadir pasajeros</button>'
        + (o.table ? '<div class="filter-hint">La tarjeta de embarque se puede arrastrar sobre su botón.</div>' : '') + '</div>';
    }
    function bagCtl(i, field, icon, title, val) {
      return '<span class="rm-bagctl" title="' + esc(title) + '"><button type="button" data-bag="' + field + '" data-i="' + i + '" data-d="-1" aria-label="Menos">−</button><i class="fa ' + icon + (val ? '' : ' is-off') + '"></i><b>' + val + '</b><button type="button" data-bag="' + field + '" data-i="' + i + '" data-d="1" aria-label="Más">+</button></span>';
    }
    function renderPassengers(m, draft, o) {
      var wrap = m.querySelector('[data-pass]'); if (!wrap) return;
      o = o || m.rmPassOpts || {}; m.rmPassOpts = o;
      var t = draft.transport;
      wrap.innerHTML = '';
      if (!t.passengers.length) wrap.innerHTML = '<div class="rm-sub mb-1">Todavía no va nadie.</div>';
      t.passengers.forEach(function (p, i) {
        var per = personById(p.personnel_id);
        var name = per ? per.name : (p.name || '—');
        var row = el('<div class="rm-pass2' + (o.table ? ' rm-pass2--table' : '') + '"></div>');
        var h = '<div class="rm-pass2__who">' + avatar(per ? per.photo_url : '', 'fa-user') + '<div class="min-w-0"><div class="fw-semibold text-truncate">' + esc(name) + '</div>' + (per && per.role ? '<div class="rm-sub">' + esc(per.role) + '</div>' : '') + '</div></div>';
        if (o.table) {
          h += '<div class="rm-pass2__loc"><input class="form-control form-control-sm" data-ploc="' + i + '" value="' + esc(p.locator || '') + '" placeholder="Localizador"' + (t.same_locator ? ' disabled' : '') + '></div>'
            + '<button type="button" class="rm-pconf' + (p.confirmed ? ' is-on' : '') + '" data-pconf="' + i + '" title="' + (p.confirmed ? 'Confirmado' : 'Sin confirmar') + '"><i class="fa fa-circle-check"></i><span>' + (p.confirmed ? 'Confirmado' : 'Confirmar') + '</span></button>'
            + '<div class="rm-pass2__bags">' + bagCtl(i, 'bags_hand', 'fa-suitcase-rolling', 'Maletas de mano', p.bags_hand || 0) + bagCtl(i, 'bags_checked', 'fa-suitcase', 'Maletas facturadas', p.bags_checked || 0) + '</div>'
            + '<div class="rm-pass2__ticket">' + (p.ticket_url ? '<a class="rm-att" href="' + esc(p.ticket_url) + '" target="_blank" rel="noopener"><i class="fa fa-download"></i> ' + esc(p.ticket_name || 'Tarjeta') + '</a>' : '')
            + '<label class="btn btn-outline-secondary btn-sm" title="Tarjeta de embarque (o arrástrala aquí)"><i class="fa fa-ticket"></i> ' + (p.ticket_url ? 'Cambiar' : 'Tarjeta') + '<input type="file" hidden data-pticket="' + i + '"></label><span class="rm-sub" data-pstaged="' + i + '"></span></div>';
        }
        if (o.stops) {
          h += '<div class="rm-pass2__stop"><select class="form-select form-select-sm" data-pstop="' + i + '"><option value=""' + (!p.boarding_stop ? ' selected' : '') + '>Sube en el origen</option>'
            + (t.stops || []).map(function (st, k) { return '<option value="' + esc(st.id) + '"' + (p.boarding_stop === st.id ? ' selected' : '') + '>Sube en la parada ' + (k + 1) + ' · ' + esc(st.label) + '</option>'; }).join('') + '</select></div>';
        }
        h += '<button type="button" class="btn btn-link btn-sm text-danger p-0 rm-pass2__del" data-pdel="' + i + '">Quitar</button>';
        row.innerHTML = h;
        wrap.appendChild(row);
      });
      // Lo pendiente de adjuntar (un traslado nuevo): se ve para saber que va a subir.
      (m.rmStaged || []).forEach(function (st) { if (st.scope === 'passenger') { var z = wrap.querySelector('[data-pstaged="' + st.index + '"]'); if (z) z.textContent = st.file.name + ' (al guardar)'; } });
      var cnt = m.querySelector('[data-pass-count]');
      if (cnt) { var plazas = parseInt((m.querySelector('[data-van="seats"]') || {}).value || t.van.seats || 0, 10) || 0; cnt.textContent = plazas ? (t.passengers.length + ' de ' + plazas + ' plazas') : (t.passengers.length ? t.passengers.length + ' pasajeros' : ''); cnt.classList.toggle('text-danger', !!plazas && t.passengers.length > plazas); }
    }
    function wirePassengers(m, draft, o) {
      var t = draft.transport;
      m.rmPassOpts = o || {};
      renderPassengers(m, draft, o);
      var box = m.querySelector('[data-pass]'); if (!box) return;
      var addBtn = m.querySelector('[data-addpass]');
      if (addBtn) addBtn.addEventListener('click', function () {
        var plazas = (o && o.max) ? (parseInt((m.querySelector('[data-van="seats"]') || {}).value || t.van.seats || 0, 10) || 0) : 0;
        openPassengerPicker(draft, function () { renderPassengers(m, draft, o); }, { max: plazas });
      });
      // Todo por DELEGACIÓN en la caja: las filas se repintan.
      box.addEventListener('input', function (e) {
        var loc = e.target.closest('[data-ploc]'); if (loc) { t.passengers[parseInt(loc.getAttribute('data-ploc'), 10)].locator = loc.value.trim(); return; }
      });
      box.addEventListener('change', function (e) {
        var sel = e.target.closest('[data-pstop]'); if (sel) { t.passengers[parseInt(sel.getAttribute('data-pstop'), 10)].boarding_stop = sel.value; return; }
        var f = e.target.closest('[data-pticket]');
        if (f) {
          var i = parseInt(f.getAttribute('data-pticket'), 10), file = f.files[0]; if (!file) return;
          if (!draft.id) {
            // Un traslado NUEVO: se guarda con el resto al pulsar Añadir (una por pasajero).
            m.rmStaged = (m.rmStaged || []).filter(function (st) { return !(st.scope === 'passenger' && st.index === i); });
            m.rmStaged.push({ scope: 'passenger', index: i, file: file });
            renderPassengers(m, draft, o); return;
          }
          var fd = new FormData(); fd.append('scope', 'passenger'); fd.append('id', draft.id); fd.append('passenger_index', i); fd.append('file', file);
          postForm(ep('/adjunto'), fd).then(function (resp) {
            if (!(resp && resp.ok)) { alert((resp && resp.error) || 'No se pudo adjuntar.'); return; }
            P = resp.payload; DAYS = resp.days || DAYS;
            var it = agendaItem(draft.id); var pg = it && it.transport && it.transport.passengers && it.transport.passengers[i];
            // ⚠️ Solo la tarjeta: lo demás del traslado está a medio editar aquí y no se pisa.
            if (pg) { t.passengers[i].ticket_url = pg.ticket_url || ''; t.passengers[i].ticket_name = pg.ticket_name || ''; }
            renderPassengers(m, draft, o);
          });
        }
      });
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-bag]');
        if (b) { var i2 = parseInt(b.getAttribute('data-i'), 10), f2 = b.getAttribute('data-bag'); t.passengers[i2][f2] = Math.max(0, Math.min(9, (t.passengers[i2][f2] || 0) + parseInt(b.getAttribute('data-d'), 10))); renderPassengers(m, draft, o); return; }
        var c = e.target.closest('[data-pconf]');
        if (c) { var i3 = parseInt(c.getAttribute('data-pconf'), 10); t.passengers[i3].confirmed = !t.passengers[i3].confirmed; renderPassengers(m, draft, o); return; }
        var d = e.target.closest('[data-pdel]');
        if (d) { var i4 = parseInt(d.getAttribute('data-pdel'), 10); t.passengers.splice(i4, 1); m.rmStaged = (m.rmStaged || []).filter(function (st) { return !(st.scope === 'passenger' && st.index === i4); }); renderPassengers(m, draft, o); }
      });
      var same = m.querySelector('[data-t="same_locator"]'), lall = m.querySelector('[data-t="locator_all"]');
      if (same && lall) same.addEventListener('change', function () { t.same_locator = same.checked; lall.classList.toggle('d-none', !same.checked); renderPassengers(m, draft, o); });
      var seats = m.querySelector('[data-van="seats"]');
      if (seats) seats.addEventListener('input', function () { t.van.seats = parseInt(seats.value, 10) || 0; renderPassengers(m, draft, o); });
    }
    /* QUIÉN LO VE en un traslado: sus PASAJEROS siempre; y además todos, unas funciones o unas personas. */
    function audienceBlockTr(draft) {
      var aud = draft.audience || { mode: 'PASSENGERS', roles: [], ids: [] };
      var mode = String(aud.mode || 'PASSENGERS').toUpperCase();
      if (mode === 'ALL') mode = 'PASSENGERS';   // el «a todos» de antes con pasajeros era «solo los pasajeros»
      var audIds = (aud.ids || []).map(String), roles = personnelRoles(), dsh = itemSheets(draft);
      return '<div class="promo-pick-grid promo-pick-grid--wide mb-2">'
        + wzPick({ name: 'rmAudMode', value: 'PASSENGERS', icon: 'fa-user-group', label: 'Solo los pasajeros', checked: mode === 'PASSENGERS', attrs: ' data-aud-mode' })
        + wzPick({ name: 'rmAudMode', value: 'EVERYONE', icon: 'fa-globe', label: 'A todos', checked: mode === 'EVERYONE', attrs: ' data-aud-mode' })
        + wzPick({ name: 'rmAudMode', value: 'ROLES', icon: 'fa-user-tag', label: 'Por función', hint: 'Además de los pasajeros', checked: mode === 'ROLES', attrs: ' data-aud-mode' })
        + wzPick({ name: 'rmAudMode', value: 'PEOPLE', icon: 'fa-user-check', label: 'A quien yo diga', hint: 'Además de los pasajeros', checked: mode === 'PEOPLE', attrs: ' data-aud-mode' })
        + '</div>'
        + '<div class="filter-chips mb-2' + (mode === 'ROLES' ? '' : ' d-none') + '" data-aud-roles>'
        + (roles.length ? roles.map(function (r) { return '<label class="filter-chip"><input type="checkbox" value="' + esc(r) + '"' + ((aud.roles || []).some(function (x) { return normText(x) === normText(r); }) ? ' checked' : '') + ' data-aud-role><i class="fa fa-user-tag"></i>' + esc(r) + '</label>'; }).join('') : '<span class="filter-hint">Añade antes el personal con su función.</span>')
        + '</div>'
        + '<div class="promo-pick-grid mb-2' + (mode === 'PEOPLE' ? '' : ' d-none') + '" data-aud-people>'
        + ARTISTS.map(function (a) { return wzPick({ name: 'rmAudPerson', multi: true, value: 'artist:' + a.id, img: a.photo_url || AVATAR, icon: 'fa-guitar', label: a.name, hint: 'El artista', checked: audIds.indexOf('artist:' + a.id) >= 0, attrs: ' data-aud-person' }); }).join('')
        + (P.personnel || []).map(function (p) { return wzPick({ name: 'rmAudPerson', multi: true, value: String(p.id), img: p.photo_url || AVATAR, icon: 'fa-user', label: p.name, hint: p.role || '', checked: audIds.indexOf(String(p.id)) >= 0, attrs: ' data-aud-person' }); }).join('')
        + '</div>'
        + '<div class="filter-hint mb-3">Quien va en el traslado lo ve siempre, también desde su acceso de externo.</div>'
        + '<div class="rm-wz-lbl"><i class="fa fa-share-nodes"></i>¿En qué hoja de ruta se ve?</div>'
        + '<div class="filter-chips">' + SHEETS.map(function (sN) { return '<label class="filter-chip"><input type="checkbox" data-sheet="' + sN.key + '"' + (dsh[sN.key] ? ' checked' : '') + '><i class="fa ' + sN.icon + '"></i>' + sN.label + '</label>'; }).join('') + '</div>';
    }
    function readAudienceTr(m) {
      var mode = 'PASSENGERS';
      m.querySelectorAll('[data-aud-mode]').forEach(function (r) { if (r.checked) mode = r.value; });
      var roles = [].map.call(m.querySelectorAll('[data-aud-role]:checked'), function (c) { return c.value; });
      var ids = [].map.call(m.querySelectorAll('[data-aud-person]:checked'), function (c) { return c.value; });
      if (mode === 'ROLES' && !roles.length) mode = 'PASSENGERS';
      if (mode === 'PEOPLE' && !ids.length) mode = 'PASSENGERS';
      return { mode: mode, roles: mode === 'ROLES' ? roles : [], ids: mode === 'PEOPLE' ? ids : [] };
    }
    // ---- el asistente
    function openTransportEditor(draft) {
      var ki = kindInfo(draft.kind), cfg = trCfg(draft.kind), editing = !!draft.id;
      draft.transport = normTransport(draft.transport, draft.kind);
      var t = draft.transport;
      draft.contacts = draft.contacts || [];
      var pasos = [];
      if (cfg.grupo === 'TRANSFER') {
        pasos.push({ title: 'Recogida', icon: 'fa-location-dot', q: '¿Dónde se recoge?',
                     hint: 'Se sugiere donde esté el artista según la agenda (el sitio anterior, el hotel, el recinto); si no, escribe la dirección.',
                     html: placeBlock('origin', t.origin_place, { title: 'Punto de recogida', icon: 'fa-location-dot', sug: function () { return placeSuggestions(draft, 'before'); }, addr: true, addrPh: 'O escribe la dirección de recogida…' })
                       + accessBlock(draft, 'Instrucciones del punto de recogida', 'Por dónde se entra, dónde espera el coche, a quién llamar…')
                       + attachBlock(draft, 'Bono del transfer') });
        pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día y a qué hora se recoge?', hint: 'Sin hora se ve «TBC». Lo provisional se ve rayado.',
                     html: whenBlock(draft, { startLabel: 'Hora de recogida', end: false }) + statusBlock(t, {}) });
        pasos.push({ title: 'Destino', icon: 'fa-flag-checkered', q: '¿A dónde va?', hint: 'La duración se calcula sola con la ruta en coche; se puede cambiar a mano.',
                     html: placeBlock('destination', t.destination_place, { title: 'Destino', icon: 'fa-flag-checkered', sug: function () { return placeSuggestions(draft, 'after'); }, addr: true, addrPh: 'O escribe la dirección de destino…' }) + durationBlock(t, { km: true }) });
        pasos.push({ title: 'Quién lo presta', icon: 'fa-handshake', q: '¿Quién presta el transfer?', hint: 'El promotor, nosotros u otro; y con quién se habla (o el conductor, su teléfono y la matrícula).', html: providerBlock(draft) });
        pasos.push({ title: 'Pasajeros', icon: 'fa-user-group', q: '¿Quién va?', hint: 'Del personal de la hoja de ruta; se puede buscar a cualquier tercero, a alguien de la casa o al artista.', html: passengersBlock(draft, {}) + noteBlock(draft) });
      } else if (cfg.grupo === 'LINEA') {
        pasos.push({ title: ki.label, icon: ki.icon, q: cfg.q,
                     hint: 'La compañía sale de la base con su logo; el ' + cfg.placeLabel + ' se busca por nombre' + (cfg.place === 'AIRPORT' ? ' o por código' : '') + '.',
                     html: '<div class="rm-wz-block mb-3">' + companyBlock(draft, ki) + '</div>' + legBlock(draft, cfg) });
        pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día?', hint: 'Las horas van con el trayecto. Lo provisional se ve rayado.', html: whenBlock(draft, { onlyDay: true }) + statusBlock(t, {}) });
        pasos.push({ title: 'Pasajeros', icon: 'fa-user-group', q: '¿Quién va y con qué?', hint: 'El localizador, si está confirmado, sus maletas y su tarjeta de embarque.', html: passengersBlock(draft, { table: true }) + noteBlock(draft) });
      } else if (cfg.grupo === 'RIDE') {
        pasos.push({ title: 'Recogida', icon: ki.icon, q: '¿Con quién y dónde se recoge?', hint: 'La compañía de la base; el sitio se sugiere según la agenda o se escribe.',
                     html: '<div class="rm-wz-block mb-3">' + companyBlock(draft, ki) + '</div>'
                       + placeBlock('origin', t.origin_place, { title: 'Punto de recogida', icon: 'fa-location-dot', sug: function () { return placeSuggestions(draft, 'before'); }, addr: true, addrPh: 'O escribe la dirección de recogida…' })
                       + accessBlock(draft, 'Instrucciones del punto de encuentro', 'Dónde espera el coche, a quién llamar…') });
        pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día y a qué hora se recoge?', hint: 'Sin hora se ve «TBC». Con el enlace de seguimiento sale su icono en la hoja de ruta.',
                     html: whenBlock(draft, { startLabel: 'Hora de recogida', end: false }) + statusBlock(t, { tracking: true }) });
        pasos.push({ title: 'Destino', icon: 'fa-flag-checkered', q: '¿A dónde va?', hint: 'Se sugiere el siguiente sitio de la agenda; la duración se calcula sola.',
                     html: placeBlock('destination', t.destination_place, { title: 'Destino', icon: 'fa-flag-checkered', sug: function () { return placeSuggestions(draft, 'after'); }, addr: true, addrPh: 'O escribe la dirección de destino…' }) + durationBlock(t, {}) });
        pasos.push({ title: 'Pasajeros', icon: 'fa-user-group', q: '¿Quién va?', hint: 'Igual que en un transfer.', html: passengersBlock(draft, {}) + noteBlock(draft) });
      } else {
        pasos.push({ title: 'Furgoneta', icon: 'fa-truck', q: '¿Con conductor o alquilada?', hint: 'Si es una reserva: dónde y cuándo se recoge y se devuelve, y su localizador.', html: vanModeBlock(draft) });
        pasos.push({ title: 'Datos', icon: 'fa-id-card', q: '¿Quién conduce y qué furgoneta es?', hint: 'Las plazas, si lleva espacio de carga y la matrícula.', html: vanBlock(draft) });
        pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día y a qué hora sale?', hint: 'Sin hora se ve «TBC».', html: whenBlock(draft, { startLabel: 'Hora de salida', end: false }) + statusBlock(t, {}) });
        pasos.push({ title: 'Trayecto', icon: 'fa-route', q: '¿De dónde a dónde?', hint: 'Los kilómetros y la duración se calculan solos por la ruta, con las paradas.',
                     html: placeBlock('origin', t.origin_place, { title: 'Origen', icon: 'fa-location-dot', sug: function () { return placeSuggestions(draft, 'before'); }, addr: true, addrPh: 'O escribe la dirección de salida…' })
                       + accessBlock(draft, 'Punto de encuentro', 'Dónde espera la furgoneta, a quién llamar…')
                       + stopsBlock(t)
                       + placeBlock('destination', t.destination_place, { title: 'Destino', icon: 'fa-flag-checkered', sug: function () { return placeSuggestions(draft, 'after'); }, addr: true, addrPh: 'O escribe la dirección de destino…' })
                       + durationBlock(t, { km: true }) });
        pasos.push({ title: 'Pasajeros', icon: 'fa-user-group', q: '¿Quién va y dónde sube?', hint: 'No caben más que las plazas; cada uno sube en el origen o en una parada.', html: passengersBlock(draft, { stops: true, max: true }) + noteBlock(draft) });
      }
      pasos.push({ title: 'Quién lo ve', icon: 'fa-users', q: '¿Quién lo ve?', hint: 'Los pasajeros siempre; y quien se añada.', html: audienceBlockTr(draft) });
      var m = openWizardModal('rmItemModal', (editing ? 'Editar' : 'Añadir') + ' · ' + ki.label, ki.icon, pasos,
                              function (modal) { saveTransport(draft, modal); }, editing ? 'Guardar' : 'Añadir');
      m.rmStaged = [];
      wireTransportWizard(m, draft, cfg);
    }
    function wireTransportWizard(m, draft, cfg) {
      var t = draft.transport;
      // ---- acceso (las instrucciones del punto de recogida, con su chincheta)
      var pinBox = m.querySelector('[data-access-pin]');
      if (pinBox) { m.rmPin = { lat: draft.access_lat, lng: draft.access_lng }; m.rmPinPicker = pinPicker(pinBox, m.rmPin, (VENUE && VENUE.lat && VENUE.lng) ? [VENUE.lat, VENUE.lng] : null); }
      var accOn = m.querySelector('[data-f="access_on"]'), accWrap = m.querySelector('[data-access-wrap]');
      if (accOn && accWrap) accOn.addEventListener('change', function () { accWrap.classList.toggle('d-none', !accOn.checked); if (accOn.checked && m.rmPinPicker) setTimeout(m.rmPinPicker.refresh, 60); });
      ['[data-sw-next]', '[data-sw-prev]', '[data-sw-steps]'].forEach(function (sel) { var n = m.querySelector(sel); if (n) n.addEventListener('click', function () { if (m.rmPinPicker) setTimeout(m.rmPinPicker.refresh, 120); }); });
      // ---- quién lo ve
      var rolesBox = m.querySelector('[data-aud-roles]'), peopleBox = m.querySelector('[data-aud-people]');
      m.querySelectorAll('[data-aud-mode]').forEach(function (r) { r.addEventListener('change', function () { if (rolesBox) rolesBox.classList.toggle('d-none', !(r.checked && r.value === 'ROLES')); if (peopleBox) peopleBox.classList.toggle('d-none', !(r.checked && r.value === 'PEOPLE')); }); });
      // ---- la compañía
      wireCompany(m, draft);
      // ---- los sitios (y la ruta cuando cambian)
      var recalc = function () { scheduleRoute(m, draft); };
      wirePlace(m, 'origin', t.origin_place, { kind: cfg.place || '', addr: cfg.grupo !== 'LINEA' || !!cfg.addr, sug: (cfg.grupo === 'LINEA') ? [] : function () { return placeSuggestions(draft, 'before'); } }, recalc);
      wirePlace(m, 'destination', t.destination_place, { kind: cfg.place || '', addr: cfg.grupo !== 'LINEA' || !!cfg.addr, sug: (cfg.grupo === 'LINEA') ? [] : function () { return placeSuggestions(draft, 'after'); } }, recalc);
      // Las sugerencias dependen del DÍA y de la HORA: al cambiarlos se rehacen.
      var repinta = function () { draft.day = (m.querySelector('input[name="rmDay"]:checked') || {}).value || draft.day; var st = m.querySelector('[data-f="start_time"]'); if (st) draft.start_time = st.value; ['origin', 'destination'].forEach(function (k) { var b = m.querySelector('[data-pp="' + k + '"]'); if (b && b.rmRepaint) b.rmRepaint(); }); };
      m.querySelectorAll('[data-day-opt]').forEach(function (r) { r.addEventListener('change', repinta); });
      var stEl = m.querySelector('[data-f="start_time"]'); if (stEl) stEl.addEventListener('change', repinta);
      var dur = m.querySelector('[data-t="duration"]'); if (dur) { m.rmDurAuto = !dur.value.trim(); dur.addEventListener('input', function () { m.rmDurAuto = !dur.value.trim(); }); }
      var kmEl = m.querySelector('[data-t="distance_km"]'); if (kmEl) kmEl.addEventListener('input', function () { t.distance_km = parseFloat(String(kmEl.value).replace(',', '.')) || null; });
      // ---- quién lo presta · la furgoneta · las paradas · los pasajeros
      wireProvider(m, draft);
      if (cfg.grupo === 'VAN') { wireVan(m, draft); wireStops(m, draft); }
      wirePassengers(m, draft, cfg.grupo === 'LINEA' ? { table: true } : (cfg.grupo === 'VAN' ? { stops: true, max: true } : {}));
      // ---- los adjuntos (el bono): ahora, o al guardar si el traslado es nuevo
      renderItemAtts(m, draft);
      var attin = m.querySelector('[data-attin]');
      if (attin) attin.addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        if (!draft.id) {
          m.rmStaged.push({ scope: 'item', file: f });
          var z = m.querySelector('[data-staged]'); if (z) z.innerHTML = m.rmStaged.filter(function (x) { return x.scope === 'item'; }).map(function (x) { return '<span class="rm-att"><i class="fa fa-paperclip"></i> ' + esc(x.file.name) + ' <span class="rm-sub">(al guardar)</span></span>'; }).join('');
          attin.value = ''; return;
        }
        var fd = new FormData(); fd.append('scope', 'item'); fd.append('id', draft.id); fd.append('file', f);
        postForm(ep('/adjunto'), fd).then(function (resp) {
          if (resp && resp.ok) { var it = null; (resp.payload.agenda || []).forEach(function (x) { if (x.id === draft.id) it = x; }); if (it) { draft.attachments = it.attachments || []; renderItemAtts(m, draft); } P = resp.payload; DAYS = resp.days || DAYS; }
        });
      });
    }
    function saveTransport(draft, m) {
      var t = draft.transport;
      var marcado = function (name) { var n = m.querySelector('input[name="' + name + '"]:checked'); return n ? n.value : ''; };
      var val = function (sel) { var n = m.querySelector(sel); return n ? n.value : null; };
      draft.day = marcado('rmDay') || draft.day;
      draft.start_time = val('[data-f="start_time"]') || '';
      draft.end_time = val('[data-f="end_time"]') || '';
      var tbcEl = m.querySelector('[data-f="tbc"]'); draft.tbc = !!(tbcEl && tbcEl.checked);
      t.status = marcado('rmTrStatus') || t.status || 'CONFIRMADO';
      draft.confirmed = t.status !== 'PROVISIONAL';
      draft.sheets = {}; m.querySelectorAll('[data-sheet]').forEach(function (cb) { draft.sheets[cb.getAttribute('data-sheet')] = cb.checked; });
      draft.note = (val('[data-f="note"]') || '').trim();
      draft.audience = readAudienceTr(m);
      draft.sings = false; draft.songs = [];
      var accOn = m.querySelector('[data-f="access_on"]');
      draft.access_note = (accOn && accOn.checked) ? (val('[data-f="access_note"]') || '').trim() : '';
      var pinOn = !!(accOn && accOn.checked && m.rmPin);
      draft.access_lat = pinOn ? m.rmPin.lat : null; draft.access_lng = pinOn ? m.rmPin.lng : null;
      // Los sitios: lo escrito sin elegir también vale.
      ['origin', 'destination', 'van_pickup', 'van_return'].forEach(function (k) { var b = m.querySelector('[data-pp="' + k + '"]'); if (b && b.rmFinalize) b.rmFinalize(); });
      t.origin = pointText(t.origin_place); t.destination = pointText(t.destination_place);
      ['number', 'number_arrival', 'duration', 'tracking_url', 'locator_all'].forEach(function (f) { var v = val('[data-t="' + f + '"]'); if (v !== null) t[f] = v.trim(); });
      var kmv = val('[data-t="distance_km"]'); if (kmv !== null) t.distance_km = parseFloat(String(kmv).replace(',', '.')) || null;
      var nd = m.querySelector('[data-t="ends_next_day"]'); t.ends_next_day = !!(nd && nd.checked);
      var sl = m.querySelector('[data-t="same_locator"]'); t.same_locator = !!(sl && sl.checked);
      // Quién lo presta
      var pv = t.provider; pv.kind = marcado('rmProv') || pv.kind || '';
      ['driver_name', 'driver_phone', 'plate'].forEach(function (f) { var v = val('[data-pv="' + f + '"]'); if (v !== null) pv[f] = v.trim(); });
      // La furgoneta
      var v2 = t.van; var vm = marcado('rmVanMode'); if (vm) v2.rental = vm === 'RENTAL';
      ['pickup_at', 'return_at', 'locator', 'plate'].forEach(function (f) { var x = val('[data-van="' + f + '"]'); if (x !== null) v2[f] = x.trim(); });
      var seats = val('[data-van="seats"]'); if (seats !== null) v2.seats = parseInt(seats, 10) || 0;
      var cg = marcado('rmCargo'); v2.cargo = cg === '1' ? true : (cg === '0' ? false : v2.cargo);
      if (v2.seats && t.passengers.length > v2.seats) { alert('Van ' + t.passengers.length + ' personas y la furgoneta tiene ' + v2.seats + ' plazas: quita a alguien o cambia las plazas.'); return; }
      // La persona de contacto del que lo presta es la persona de contacto del punto.
      draft.contacts = (pv.contact && pv.contact.name) ? [pv.contact] : [];
      draft.contact = draft.contacts[0] || {};
      var i = bs('rmItemModal'); if (i) i.hide();
      var staged = (m.rmStaged || []).slice();
      postJson(ep('/item'), draft).then(function (resp) {
        if (!(resp && resp.ok)) { alert((resp && resp.error) || 'No se pudo guardar el traslado.'); return; }
        if (!staged.length || !resp.item_id) { apply(resp); return; }
        // Lo adjuntado en un traslado NUEVO sube ahora, con su id, uno tras otro.
        var cadena = Promise.resolve(resp);
        staged.forEach(function (st) {
          cadena = cadena.then(function (prev) {
            var fd = new FormData(); fd.append('scope', st.scope); fd.append('id', resp.item_id); fd.append('file', st.file);
            if (st.scope === 'passenger') fd.append('passenger_index', st.index);
            return postForm(ep('/adjunto'), fd).then(function (r2) { return (r2 && r2.ok) ? r2 : prev; });
          });
        });
        cadena.then(function (last) { apply(last || resp); });
      });
    }
    // ---- cómo se pinta un traslado (fila y detalle)
    function transStatusTag(t) {
      if (t && t.status === 'RESERVADO') return '<span class="rm-tag warn"><i class="fa fa-bookmark"></i> Reservado</span>';
      return '';
    }
    function transLineHtml(t) {
      var route = [t.origin, t.destination].filter(Boolean).map(esc).join(' → ');
      var np = (t.passengers || []).length;
      var h = companyLogo(t) ? '<img src="' + esc(companyLogo(t)) + '" alt="">' : '';
      if (t.company) h += '<span>' + esc(t.company) + '</span>';
      if (t.number) h += '<span>' + esc(t.number) + (t.number_arrival ? ' / ' + esc(t.number_arrival) : '') + '</span>';
      if (route) h += '<span>' + route + '</span>';
      if (t.duration || t.distance_km) h += '<span>· ' + [t.duration, (t.distance_km ? t.distance_km + ' km' : '')].filter(Boolean).map(esc).join(' · ') + '</span>';
      if (np) h += '<span>· <i class="fa fa-user-group"></i> ' + np + '</span>';
      if (t.tracking_url) h += '<a class="rm-maplink" href="' + esc(t.tracking_url) + '" target="_blank" rel="noopener" title="Ver el seguimiento" data-ext><i class="fa fa-location-crosshairs"></i></a>';
      return h ? '<div class="rm-transport-line">' + h + '</div>' : '';
    }
    /* LAS MALETAS de un pasajero: el icono de mano y el de facturada, TACHADOS si no lleva (como la
       taza del desayuno), y doble o triple si lleva más de una. */
    function bagIcons(p) {
      function uno(icon, n, title) {
        if (!n) return '<span class="rm-bag rm-bag--off" title="Sin ' + title + '"><i class="fa ' + icon + '"></i></span>';
        var h = ''; for (var i = 0; i < Math.min(n, 3); i++) h += '<i class="fa ' + icon + '"></i>';
        return '<span class="rm-bag rm-bag--on" title="' + n + ' ' + title + '">' + h + (n > 3 ? '<b>×' + n + '</b>' : '') + '</span>';
      }
      return '<span class="rm-bags">' + uno('fa-suitcase-rolling', p.bags_hand || 0, 'de mano') + uno('fa-suitcase', p.bags_checked || 0, 'facturada' + ((p.bags_checked || 0) === 1 ? '' : 's')) + '</span>';
    }
    function transDetailHtml(it) {
      var t = normTransport(JSON.parse(JSON.stringify(it.transport || {})), it.kind);
      var cfg = trCfg(it.kind);
      var h = transLineHtml(t);
      if (t.status === 'RESERVADO') h += '<div class="mb-1">' + transStatusTag(t) + '</div>';
      if (t.ends_next_day) h += '<div class="rm-sub"><i class="fa fa-moon"></i> Llega al día siguiente</div>';
      var pv = t.provider || {};
      if (pv.kind || (pv.contact && pv.contact.name) || pv.driver_name || pv.plate) {
        var quien = { PROMOTER: 'El promotor', US: 'Nosotros', OTHER: 'Otro' }[pv.kind] || '';
        h += '<div class="mt-2"><div class="rm-sub"><i class="fa fa-handshake"></i> Lo presta' + (quien ? ': ' + quien : '') + '</div>';
        if (pv.contact && pv.contact.name) h += contactRow(pv.contact, pv.contact.role || '');
        var cond = [pv.driver_name ? 'Conductor: ' + esc(pv.driver_name) : '', pv.driver_phone ? '<a href="tel:' + esc(pv.driver_phone) + '" data-ext>' + esc(pv.driver_phone) + '</a>' : '', pv.plate ? 'Matrícula ' + esc(pv.plate) : ''].filter(Boolean).join(' · ');
        if (cond) h += '<div class="rm-sub"><i class="fa fa-id-card"></i> ' + cond + '</div>';
        h += '</div>';
      }
      if (cfg.grupo === 'VAN') {
        var v = t.van || {};
        var partes = [];
        if (v.rental) partes.push('Alquilada' + (v.locator ? ' · loc. ' + esc(v.locator) : ''));
        if (v.driver && v.driver.name) partes.push('Conduce ' + esc(v.driver.name) + (v.driver.phone ? ' (<a href="tel:' + esc(v.driver.phone) + '" data-ext>' + esc(v.driver.phone) + '</a>)' : ''));
        if (v.seats) partes.push(v.seats + ' plazas');
        if (v.cargo === true) partes.push('<i class="fa fa-boxes-stacked"></i> con espacio de carga'); else if (v.cargo === false) partes.push('solo personas');
        if (v.plate) partes.push('Matrícula ' + esc(v.plate));
        if (partes.length) h += '<div class="rm-sub mt-1"><i class="fa fa-truck"></i> ' + partes.join(' · ') + '</div>';
        if (v.rental && (pointText(v.pickup_place) || pointText(v.return_place))) h += '<div class="rm-sub"><i class="fa fa-key"></i> Recogida: ' + esc(pointText(v.pickup_place) || '—') + (v.pickup_at ? ' (' + esc(v.pickup_at.replace('T', ' ')) + ')' : '') + ' · Devolución: ' + esc(pointText(v.return_place) || 'en el mismo sitio') + (v.return_at ? ' (' + esc(v.return_at.replace('T', ' ')) + ')' : '') + '</div>';
        if ((t.stops || []).length) h += '<div class="rm-sub"><i class="fa fa-route"></i> Paradas: ' + t.stops.map(function (st, k) { return (k + 1) + '. ' + esc(st.label) + (st.time ? ' (' + esc(st.time) + ')' : ''); }).join(' · ') + '</div>';
      }
      if ((t.passengers || []).length) {
        h += '<div class="mt-2 rm-sub"><i class="fa fa-user-group"></i> ' + (t.passengers.length === 1 ? 'Pasajero' : 'Pasajeros') + '</div>';
        t.passengers.forEach(function (p) {
          var per = personById(p.personnel_id);
          var loc = t.same_locator ? t.locator_all : p.locator;
          var stop = (cfg.grupo === 'VAN' && p.boarding_stop) ? (t.stops || []).filter(function (st) { return st.id === p.boarding_stop; })[0] : null;
          h += '<div class="rm-pline">' + avatar(per ? per.photo_url : '', 'fa-user') + '<div class="min-w-0 flex-grow-1"><div class="text-truncate">' + esc(per ? per.name : (p.name || '—'))
            + (cfg.grupo === 'LINEA' ? (p.confirmed ? ' <i class="fa fa-circle-check text-success" title="Confirmado"></i>' : ' <i class="fa-regular fa-circle text-muted" title="Sin confirmar"></i>') : '') + '</div>'
            + (loc ? '<div class="rm-sub"><i class="fa fa-ticket"></i> ' + esc(loc) + '</div>' : '')
            + (stop ? '<div class="rm-sub"><i class="fa fa-route"></i> Sube en ' + esc(stop.label) + '</div>' : '') + '</div>'
            + (cfg.grupo === 'LINEA' ? bagIcons(p) : '')
            + (p.ticket_url ? '<a class="rm-att" href="' + esc(p.ticket_url) + '" target="_blank" rel="noopener" data-ext><i class="fa fa-download"></i> ' + esc(p.ticket_name || 'Tarjeta') + '</a>' : '') + '</div>';
        });
      }
      return h;
    }

    // ------------------------------------------------- la compañía de un traslado
    /* LA COMPAÑÍA de un traslado (sep 2026, lo pidió Dani): se elige de Bases de datos → Compañías de
       transporte —solo las de ESE tipo, como tarjetas con su logo—, se busca cualquier otra o se crea
       aquí mismo (nombre y, si se tiene, el logo en PNG sin fondo; queda en la base como compañía de
       ese tipo). Su logo sale en los horarios: `companyLogo` mira la base por `company_id` (un logo
       cambiado se ve al momento) y, si la compañía ya no está, lo que se guardó con el punto. */
    function companyBlock(draft, ki) {
      var t0 = draft.transport;
      var cias = COMPANIES.filter(function (c) { return (c.kinds || []).indexOf(draft.kind) >= 0; });
      return '<div class="rm-wz-lbl"><i class="fa fa-building"></i>La compañía</div>'
        + '<div class="rm-chip mb-2' + ((t0.company_id || t0.company) ? '' : ' d-none') + '" data-company-chip>'
        + '<span data-company-ava>' + avatar(companyLogo(t0), 'fa-building') + '</span><span data-company-name>' + esc(t0.company || '') + '</span>'
        + '<button type="button" class="btn-close btn-sm ms-1" data-company-clear title="Quitar la compañía"></button></div>'
        + '<div class="promo-pick-grid mb-2" data-company-cards>' + companyCards(cias, t0) + '</div>'
        + (cias.length ? '' : '<div class="rm-sub mb-2" data-company-empty>Todavía no hay compañías de «' + esc(ki.label) + '» en la base: busca una o créala aquí.</div>')
        + wzSearch('company', 'Busca otra compañía…', CAN_CREATE)
        + (CAN_CREATE ? '<div class="rm-wz-new d-none" data-new-company>'
            + '<div class="row g-2 align-items-end">'
            + '<div class="col-md-6"><label class="form-label small mb-1">Nombre de la compañía</label><input class="form-control form-control-sm" data-ncp="name" placeholder="Iberia, Renfe, Alsa…"></div>'
            + '<div class="col-md-6"><label class="form-label small mb-1">Logo (PNG sin fondo)</label><input type="file" class="form-control form-control-sm" data-ncp="logo" accept="image/png,image/*"></div>'
            + '<div class="col-12 text-end"><button type="button" class="btn btn-sm btn-danger" data-ncp-save><i class="fa fa-plus me-1"></i>Crearla y usarla</button></div>'
            + '</div><div class="filter-hint">Queda en Bases de datos → Compañías de transporte, como compañía de «' + esc(ki.label) + '».</div></div>' : '')
        + '<div class="filter-hint">Su logo sale en los horarios de la hoja de ruta.</div>';
    }
    function companyCards(cias, t0) {
      return cias.map(function (c) {
        return wzPick({ name: 'rmCompany', value: c.id, img: c.logo_url || '', icon: 'fa-building', label: c.name,
                        checked: String(t0.company_id || '') === String(c.id), attrs: ' data-company-opt',
                        cls: 'promo-pick--logo', imgCls: 'promo-pick__logo' });
      }).join('');
    }
    function companyLogo(t) {
      if (!t) return '';
      var c = t.company_id ? COMPANIES.filter(function (x) { return String(x.id) === String(t.company_id); })[0] : null;
      return (c && c.logo_url) || t.logo_url || '';
    }
    function searchCompanies(q) {
      return getJson('/api/search/transport-companies?q=' + encodeURIComponent(q)).then(function (list) {
        return (list || []).map(function (c) {
          return { id: c.id, label: c.name, logo_url: c.logo_url || '', icon: 'fa-building', kinds: c.kinds || [],
                   sub: (c.kinds || []).map(function (k) { return kindInfo(k).label; }).join(' · ') };
        });
      });
    }
    function wireCompany(m, draft) {
      var t = draft.transport;
      var cChip = m.querySelector('[data-company-chip]'), cName = m.querySelector('[data-company-name]'), cAva = m.querySelector('[data-company-ava]');
      if (!cChip) return;
      function setCompany(c) {
        t.company_id = c ? (c.id || '') : '';
        t.company = c ? (c.label || c.name || '') : '';
        t.logo_url = c ? (c.logo_url || '') : '';
        if (cName) cName.textContent = t.company;
        if (cAva) cAva.innerHTML = avatar(t.logo_url, 'fa-building');
        cChip.classList.toggle('d-none', !(t.company_id || t.company));
        m.querySelectorAll('[data-company-opt]').forEach(function (r) { r.checked = String(r.value) === String(t.company_id || ''); });
      }
      function deLaBase(id) { return COMPANIES.filter(function (x) { return String(x.id) === String(id); })[0]; }
      function wireCards() {
        m.querySelectorAll('[data-company-opt]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (!r.checked) return;
            var c = deLaBase(r.value);
            if (c) setCompany({ id: c.id, label: c.name, logo_url: c.logo_url });
          });
        });
      }
      wireCards();
      var cClear = m.querySelector('[data-company-clear]');
      if (cClear) cClear.addEventListener('click', function () { setCompany(null); });
      var ncp = m.querySelector('[data-new-company]');
      function abreAlta(nombre) {
        if (!ncp) return;
        ncp.classList.remove('d-none');
        var n = ncp.querySelector('[data-ncp="name"]'); if (nombre) n.value = nombre; n.focus();
      }
      attachSearch(m.querySelector('[data-search="company"]'), m.querySelector('[data-results="company"]'), searchCompanies, function (r) {
        // Una compañía que no estaba entre las de este tipo entra en la lista de la pantalla.
        if (!deLaBase(r.id)) COMPANIES.push({ id: r.id, name: r.label, logo_url: r.logo_url, kinds: r.kinds || [] });
        setCompany(r);
      }, CAN_CREATE ? { onCreate: abreAlta, clearOnPick: true } : { clearOnPick: true });
      var ncpBtn = m.querySelector('[data-new="company"]');
      if (ncpBtn) ncpBtn.addEventListener('click', function () {
        if (ncp && !ncp.classList.contains('d-none')) { ncp.classList.add('d-none'); return; }
        abreAlta((m.querySelector('[data-search="company"]').value || '').trim());
      });
      if (ncp) ncp.querySelector('[data-ncp-save]').addEventListener('click', function () {
        var nombre = (ncp.querySelector('[data-ncp="name"]').value || '').trim();
        if (!nombre) { alert('Escribe el nombre de la compañía.'); return; }
        var fd = new FormData(); fd.append('name', nombre); fd.append('kinds', draft.kind);
        var f = ncp.querySelector('[data-ncp="logo"]').files[0]; if (f) fd.append('logo', f);
        postForm('/api/transport-companies/create', fd).then(function (r) {
          if (!(r && r.ok)) { alert((r && r.error) || 'No se pudo crear la compañía.'); return; }
          COMPANIES.push({ id: r.id, name: r.name, logo_url: r.logo_url || '', kinds: r.kinds || [] });
          var cards = m.querySelector('[data-company-cards]');
          if (cards) { cards.innerHTML = companyCards(COMPANIES.filter(function (c) { return (c.kinds || []).indexOf(draft.kind) >= 0; }), t); wireCards(); }
          var vacio = m.querySelector('[data-company-empty]'); if (vacio) vacio.remove();
          setCompany({ id: r.id, label: r.name, logo_url: r.logo_url || '' });
          ncp.classList.add('d-none');
          ncp.querySelector('[data-ncp="name"]').value = ''; ncp.querySelector('[data-ncp="logo"]').value = '';
        });
      });
    }

    // ------------------------------------------------- editor de un punto (el asistente)
    /* ⚠️⚠️ CADA TIPO PREGUNTA SOLO LO SUYO (sep 2026, lo pidió Dani). Las reglas las dicta el servidor
       (`RULES`, ver `_roadmap_kind_rules`): sin «¿se canta?» donde no toca (la actuación ES el
       concierto: su repertorio es el set list de la ficha), sin «dónde» en lo que es en el recinto
       (actuación, prueba de sonido, apertura), el recinto POR DEFECTO con su ESPACIO en un M&G, una
       sesión de fotos o una comida, una citación a UNA hora, y la actuación sin contacto. Y en
       todos: «¿Está confirmado?» y PERSONAS DE CONTACTO (varias, sin escribir teléfonos). */
    function openItemEditor(draft) {
      var ki = kindInfo(draft.kind);
      var editing = !!draft.id;
      var esIv = draft.kind === 'ENTREVISTA';
      var esTr = !!ki.transport;
      // ⚠️ UN TRASLADO tiene su propio asistente (transfer · vuelo/tren/barco/autobús · VTC/taxi · furgoneta).
      if (esTr) { openTransportEditor(draft); return; }
      var esMG = draft.kind === 'MG', esComida = draft.kind === 'COMIDA';
      var noSing = ruleHas('no_sing', draft.kind);
      var atVenue = ruleHas('at_venue', draft.kind);
      var esPlace = ruleHas('place', draft.kind);
      var sinContacto = ruleHas('no_contact', draft.kind);
      var sinFin = ruleHas('no_end', draft.kind);
      if (esIv && !draft.interview) draft.interview = { type: '', media_id: '', media_name: '', sings: false, live: false, songs: [] };
      if (esPlace && !draft.place) draft.place = { mode: 'VENUE', space: '', venue_id: '', venue_name: '' };
      if (esComida && !draft.meal) draft.meal = { reservation: null, diners: '' };
      // Las personas de contacto: la lista y, en un punto de antes (una sola), esa.
      if (!draft.contacts) draft.contacts = (draft.contact && draft.contact.name) ? [draft.contact] : [];
      var iv = draft.interview || {};
      var aud = draft.audience || { mode: 'ALL', roles: [], ids: [] };
      var audIds = (aud.ids || []).map(String);
      var dsh = itemSheets(draft);
      var roles = personnelRoles();
      var venueName = (VENUE && VENUE.name) || '';
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
          // ⚠️ Sin «título del punto»: una entrevista se llama como su medio y su programa.
          + '<div class="mt-3"><label class="form-label small mb-1"><i class="fa fa-microphone me-1 text-muted"></i>Programa (si lo tiene)</label>'
          + '<input class="form-control" data-iv="program" value="' + esc(iv.program || '') + '" placeholder="La Ventana, El Hormiguero…"></div>'
          + '<div class="filter-hint">En los horarios se ve como «Medio · Programa».</div>';
      } else if (esTr) {
        var t0 = draft.transport;
        h1 += companyBlock(draft, ki)
          + '<div class="row g-2 mt-2">'
          + '<div class="col-md-6"><label class="form-label small mb-1"><i class="fa fa-hashtag me-1 text-muted"></i>Nº (vuelo, tren…)</label><input class="form-control" data-t="number" value="' + esc(t0.number) + '"></div>'
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
                              : (esTr ? 'La compañía sale de la base con su logo; la que no esté se crea aquí mismo.' : 'Ponle el título con el que quieres verlo en los horarios.'),
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
        + '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa ' + (sinFin ? 'fa-clock' : 'fa-play') + ' me-1 text-muted"></i>' + (sinFin ? 'A qué hora' : 'Empieza') + '</label><input type="time" class="form-control" data-f="start_time" value="' + esc(draft.start_time) + '"></div>'
        // ⚠️ Una CITACIÓN es a una hora concreta: no tiene fin.
        + (sinFin ? '' : '<div class="col-6 col-md-3"><label class="form-label small mb-1"><i class="fa fa-flag-checkered me-1 text-muted"></i>Termina</label><input type="time" class="form-control" data-f="end_time" value="' + esc(draft.end_time) + '"></div>')
        + '<div class="col-md-6"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-f="tbc"' + (draft.tbc ? ' checked' : '') + '><i class="fa fa-hourglass-half"></i>La hora está por confirmar (TBC)</label></div></div>'
        + '</div>'
        + '<div class="rm-wz-lbl mt-3"><i class="fa fa-circle-check"></i>¿Está confirmado?</div>'
        + '<div class="promo-pick-grid promo-pick-grid--wide">'
        + wzPick({ name: 'rmConf', value: '1', icon: 'fa-circle-check', label: 'Confirmado', checked: !!draft.confirmed })
        + wzPick({ name: 'rmConf', value: '0', icon: 'fa-hourglass-half', label: 'Provisional', checked: !draft.confirmed, hint: 'Se ve rayado' })
        + '</div>';
      pasos.push({ title: 'Cuándo', icon: 'fa-clock', q: '¿Qué día y a qué hora?',
                   hint: (sinFin ? 'Una citación es a una hora concreta. ' : 'Sin hora se ve «TBC». ') + 'Lo provisional se distingue en la hoja de ruta.', html: h2 });

      // ---------- 3 · DÓNDE (no en lo que es en el recinto: actuación, prueba de sonido, apertura) ----------
      if (!atVenue) {
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
        } else if (esPlace) {
          // EN EL RECINTO (lo normal) con su ESPACIO, o en OTRO SITIO: otro recinto de la base o lo
          // que se escriba (en una comida, el restaurante).
          var pl = draft.place;
          var otro = pl.mode === 'OTHER';
          h3 += '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
            + wzPick({ name: 'rmPlace', value: 'VENUE', icon: 'fa-location-dot', label: venueName ? 'En el recinto' : 'Donde la actividad', hint: venueName || 'El sitio de la actividad', checked: !otro, attrs: ' data-place-mode' })
            + wzPick({ name: 'rmPlace', value: 'OTHER', icon: esComida ? 'fa-utensils' : 'fa-building', label: esComida ? 'En un restaurante' : 'En otro sitio', hint: esComida ? 'U otro sitio: se escribe cuál' : 'Otro recinto o una dirección', checked: otro, attrs: ' data-place-mode' })
            + '</div>'
            + '<div class="rm-wz-block mb-3' + (otro ? '' : ' d-none') + '" data-place-other>'
            + (esComida ? '' : '<div class="rm-wz-lbl"><i class="fa fa-building"></i>Otro recinto</div>'
                + '<div class="rm-chip mb-2' + (pl.venue_id ? '' : ' d-none') + '" data-venue-chip>' + avatar('', 'fa-building') + '<span data-venue-name>' + esc(pl.venue_name || '') + '</span><button type="button" class="btn-close btn-sm ms-1" data-venue-clear title="Quitar"></button></div>'
                + wzSearch('venue', 'Busca un recinto de la base…', false))
            + '<div class="' + (esComida ? '' : 'mt-2') + '" data-address-autocomplete><label class="form-label small mb-1"><i class="fa fa-location-dot me-1 text-muted"></i>' + (esComida ? 'Restaurante (nombre y dirección)' : 'O una dirección') + '</label>'
            + '<input class="form-control" data-addr="full" data-f="location" value="' + esc(draft.location) + '" placeholder="' + (esComida ? 'Casa Pepe, Calle Mayor 3…' : 'Escribe la calle, el municipio…') + '"></div>'
            + '</div>'
            + '<div class="mb-3"><label class="form-label small mb-1"><i class="fa fa-door-open me-1 text-muted"></i>' + (esComida ? 'Sala o espacio' : 'Espacio') + ' <span class="text-muted fw-normal">(dónde en concreto)</span></label>'
            + '<input class="form-control" data-f="space" value="' + esc(pl.space || '') + '" placeholder="' + (esMG ? 'Camerino 2, sala VIP, zona de prensa…' : (esComida ? 'Comedor del personal, sala privada…' : 'Backstage, escenario, sala de prensa…')) + '"></div>'
            + accHtml;
        } else {
          h3 += '<div data-address-autocomplete><label class="form-label small mb-1"><i class="fa fa-location-dot me-1 text-muted"></i>Lugar</label>'
            + '<input class="form-control" data-addr="full" data-f="location" value="' + esc(draft.location) + '" placeholder="Escribe la calle, el municipio…"></div>'
            + accHtml;
        }
        pasos.push({ title: esIv ? 'Cómo' : 'Dónde', icon: esIv ? 'fa-video' : 'fa-location-dot',
                     q: esIv ? '¿Cómo se hace?' : (esTr ? '¿De dónde a dónde?' : '¿Dónde es?'),
                     hint: esIv ? 'Presencial, por teléfono o por vídeo: cada una pide lo suyo.'
                                : (esPlace ? 'Por defecto, en el recinto de la actividad: di en qué espacio, o si es en otro sitio.' : 'El sitio y, si hace falta, cómo se entra.'),
                     html: h3 });
      }

      // ---------- 4 · CÓMO VA A SER ----------
      var h4 = '';
      if (esIv) {
        h4 += '<div class="rm-wz-lbl"><i class="fa fa-tower-broadcast"></i>¿Es en directo?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-3">'
          + wzPick({ name: 'rmLive', value: '1', icon: 'fa-tower-broadcast', label: 'En directo', checked: !!iv.live })
          + wzPick({ name: 'rmLive', value: '0', icon: 'fa-clapperboard', label: 'Grabado', checked: !iv.live })
          + '</div>';
      }
      if (esMG) {
        // Cuántas personas: lo que dice la ficha, y se puede poner a mano.
        h4 += '<div class="rm-wz-block mb-3"><div class="rm-wz-lbl"><i class="fa fa-users"></i>¿Cuántas personas?</div>'
          + '<div class="d-flex align-items-center gap-2 flex-wrap"><input type="text" inputmode="numeric" class="form-control" style="max-width:9rem" data-f="mg_count" value="' + esc(draft.mg_count || '') + '" placeholder="10">'
          + '<span class="rm-sub">' + (MG_COUNT ? 'La ficha dice ' + esc(MG_COUNT) + '.' : 'La ficha no lo dice todavía.') + '</span></div></div>';
      }
      if (esComida) {
        var ml = draft.meal;
        h4 += '<div class="rm-wz-lbl"><i class="fa fa-book-open"></i>¿Hay reserva?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-2">'
          + wzPick({ name: 'rmRes', value: '1', icon: 'fa-calendar-check', label: 'Sí, hay reserva', checked: ml.reservation === true, attrs: ' data-res-opt' })
          + wzPick({ name: 'rmRes', value: '0', icon: 'fa-calendar-xmark', label: 'No hay reserva', checked: ml.reservation === false, attrs: ' data-res-opt' })
          + wzPick({ name: 'rmRes', value: '', icon: 'fa-circle-question', label: 'No se sabe', checked: ml.reservation !== true && ml.reservation !== false, attrs: ' data-res-opt' })
          + '</div>'
          + '<div class="mb-3' + (ml.reservation === true ? '' : ' d-none') + '" data-res-diners><label class="form-label small mb-1"><i class="fa fa-user-group me-1 text-muted"></i>¿Para cuántos comensales?</label>'
          + '<input type="number" min="1" class="form-control" style="max-width:9rem" data-f="diners" value="' + esc(ml.diners || '') + '"></div>'
          // EL MENÚ CERRADO (si lo hay): sus secciones y sus platos, aquí mismo (`mountMenuBuilder`).
          + '<div class="rm-wz-block mb-3" data-menu-builder></div>';
      }
      // ⚠️ «¿Se canta?» solo donde toca (`no_sing`): en la actuación es evidente y su repertorio es el
      // set list de la ficha; en una prueba de sonido, una comida o un traslado no viene a cuento.
      if (!noSing) {
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
          + wzSearch('song', 'Pincha o escribe para elegir una canción del repertorio…', false)
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

      // ---------- 5 · PERSONAS DE CONTACTO (no en la actuación: es del propio artista) ----------
      if (!sinContacto) {
        var conPromotor = !!(ACTIVITY && ACTIVITY.promoter && ACTIVITY.promoter.kind === 'PROMOTER');
        var h5 = '<div data-contacts-box>'
          + (esIv ? '<div data-media-contacts class="mb-3"><div class="rm-sub">Elige antes el medio para ver sus personas.</div></div>'
                  : '<div data-contact-sug class="mb-3"></div>')
          + '<div class="rm-wz-lbl"><i class="fa fa-user-check"></i>Elegidas</div>'
          + '<div data-contacts-sel class="mb-3"></div>'
          + '<div class="rm-wz-lbl"><i class="fa fa-magnifying-glass"></i>Otra persona</div>'
          + wzSearch('contact', 'Busca en toda la base (terceros, oficina, integrantes)…', CAN_CREATE)
          + (CAN_CREATE ? '<div class="rm-wz-new d-none" data-new-contact>'
              + '<div class="row g-2 align-items-end">'
              + '<div class="col-md-6"><label class="form-label small mb-1">Nombre y apellidos</label><input class="form-control form-control-sm" data-nct="name"></div>'
              + '<div class="col-md-6"><label class="form-label small mb-1">Cargo o función</label><input class="form-control form-control-sm" data-nct="role" placeholder="' + (esIv ? 'Redactora, productor…' : 'Jefe de producción, regidor, prensa…') + '"></div>'
              + '<div class="col-md-6"><label class="form-label small mb-1">Teléfono</label><input class="form-control form-control-sm" data-nct="phone"></div>'
              + '<div class="col-md-6"><label class="form-label small mb-1">Email</label><input class="form-control form-control-sm" data-nct="email"></div>'
              + '<div class="col-12 text-end"><button type="button" class="btn btn-sm btn-danger" data-nct-save><i class="fa fa-plus me-1"></i>Crearla y añadirla</button></div>'
              + '</div><div class="filter-hint">' + (esIv ? 'Se le crea su ficha de tercero y queda vinculada al medio.'
                                                          : 'Se le crea su ficha de tercero' + (conPromotor ? ' y queda como persona de contacto del promotor: la próxima vez ya sale aquí.' : '.')) + '</div></div>' : '')
          + '</div>';
        pasos.push({ title: 'Contactos', icon: 'fa-address-card', q: 'Personas de contacto',
                     hint: esIv ? 'Las personas del medio salen con su cara: marca las que lleven esto.'
                                : 'Marca a quien lleva esto (las de la actividad, el promotor y el recinto ya vienen puestas); su teléfono y su correo salen de su ficha.',
                     html: h5 });
      }

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

      // ---- DÓNDE: en el recinto (con su espacio) o en otro sitio (M&G, sesión de fotos, comida)
      var otherBox = m.querySelector('[data-place-other]');
      m.querySelectorAll('[data-place-mode]').forEach(function (r) {
        r.addEventListener('change', function () {
          if (!r.checked) return;
          draft.place = draft.place || {};
          draft.place.mode = r.value;
          if (otherBox) otherBox.classList.toggle('d-none', r.value !== 'OTHER');
        });
      });
      var vChip = m.querySelector('[data-venue-chip]'), vName = m.querySelector('[data-venue-name]');
      function setVenue(r) {
        draft.place = draft.place || {};
        draft.place.venue_id = r ? (r.id || '') : '';
        draft.place.venue_name = r ? (r.label || '') : '';
        if (vName) vName.textContent = draft.place.venue_name;
        if (vChip) vChip.classList.toggle('d-none', !draft.place.venue_id);
        var loc = m.querySelector('[data-f="location"]');
        if (loc) loc.value = r ? [r.label, r.address, r.municipality].filter(Boolean).join(', ') : '';
      }
      if (m.querySelector('[data-search="venue"]')) attachSearch(m.querySelector('[data-search="venue"]'), m.querySelector('[data-results="venue"]'), searchVenues, setVenue, { clearOnPick: true });
      var vClear = m.querySelector('[data-venue-clear]');
      if (vClear) vClear.addEventListener('click', function () { setVenue(null); });

      // ---- la comida: ¿hay reserva? → para cuántos
      var dinersBox = m.querySelector('[data-res-diners]');
      m.querySelectorAll('[data-res-opt]').forEach(function (r) {
        r.addEventListener('change', function () { if (r.checked && dinersBox) dinersBox.classList.toggle('d-none', r.value !== '1'); });
      });

      // ---- el menú de una comida (se guarda con el punto)
      var mbBox = m.querySelector('[data-menu-builder]');
      if (mbBox) {
        draft.meal = draft.meal || {};
        m.rmMenuState = { menu: draft.meal.menu ? JSON.parse(JSON.stringify(draft.meal.menu)) : null };
        mountMenuBuilder(mbBox, m.rmMenuState, {});
      }
      // ---- personas de contacto (varias, con su ficha)
      if (m.querySelector('[data-contacts-box]')) wireContacts(m, draft, o);

      // ---- repertorio (se canta) — donde se pregunta
      var singsWrap = m.querySelector('[data-sings-wrap]');
      m.querySelectorAll('input[name="rmSings"]').forEach(function (r) {
        r.addEventListener('change', function () { if (singsWrap) singsWrap.classList.toggle('d-none', !(r.checked && r.value === '1')); });
      });
      renderSongs(m, draft);
      // ⚠️ Donde no se pregunta si se canta no hay buscador: `attachSearch` sobre un campo que no
      // existe reventaría y se llevaría por delante el resto del cableado. Se abre AL PINCHAR con el
      // repertorio entero (`minChars: 0`) y al elegir una canción el campo se vacía.
      var buscaCancion = m.querySelector('[data-search="song"]');
      if (buscaCancion) attachSearch(buscaCancion, m.querySelector('[data-results="song"]'), function (q) {
        var lo = normText(q);
        return Promise.resolve(SONGS.filter(function (s) { return !lo || normText(s.title).indexOf(lo) >= 0; })
          .map(function (s) { return { id: s.id, label: s.title, logo_url: s.cover_url, icon: 'fa-music' }; }));
      }, function (r) {
        var arr = itemSongList(draft);
        if (arr.some(function (s) { return String(s.song_id) === String(r.id); })) return;
        arr.push({ song_id: r.id, title: r.label, cover_url: r.logo_url || '' });
        renderSongs(m, draft);
      }, { minChars: 0, max: 40, clearOnPick: true });

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

    /* PERSONAS DE CONTACTO de un punto (sep 2026: varias, y sin escribir teléfonos). Las SUGERIDAS
       son tarjetas que se marcan y desmarcan —las de la actividad, el promotor y el recinto
       (`CONTACT_SUG`, del servidor); en una entrevista las del medio (`pintaContactosMedio`)—; las
       ELEGIDAS salen con su teléfono y su correo, que son los de su ficha; y cualquier otra se
       busca en toda la base o se CREA como tercero (que, si la actividad tiene promotor, queda como
       persona de contacto suya para salir sugerida la próxima vez). */
    function contactKey(c) { return (c && c.promoter_id) ? ('p:' + c.promoter_id) : ('n:' + normText((c && c.name) || '')); }
    function wireContacts(m, draft, o) {
      draft.contacts = draft.contacts || [];
      var sel = m.querySelector('[data-contacts-sel]');
      var api = {
        rows: [], box: m.querySelector('[data-contact-sug]'), title: 'Sugeridas', empty: '',
        has: function (c) { var k = contactKey(c); return draft.contacts.some(function (x) { return contactKey(x) === k; }); },
        add: function (c) {
          if (!c || !(c.name || '').trim() || api.has(c)) return;
          draft.contacts.push({ name: (c.name || '').trim(), phone: c.phone || '', email: c.email || '', photo: c.photo || c.photo_url || c.logo_url || '',
                                role: c.role || '', promoter_id: c.promoter_id || '', media_id: c.media_id || '' });
          api.paint();
        },
        remove: function (c) { var k = contactKey(c); draft.contacts = draft.contacts.filter(function (x) { return contactKey(x) !== k; }); api.paint(); },
        suggest: function (rows, title, box, empty) { api.rows = rows || []; if (title) api.title = title; if (box) api.box = box; api.empty = empty || ''; api.paint(); },
        paint: function () {
          if (sel) {
            sel.innerHTML = draft.contacts.length ? '' : '<div class="rm-sub">Todavía nadie: marca una tarjeta o busca abajo.</div>';
            draft.contacts.forEach(function (c) {
              var row = el(contactRow(c, c.role || '', '<button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2 flex-shrink-0" data-c-del>Quitar</button>'));
              row.querySelector('[data-c-del]').addEventListener('click', function () { api.remove(c); });
              sel.appendChild(row);
            });
          }
          var box = api.box; if (!box) return;
          if (!api.rows.length) { box.innerHTML = api.empty ? '<div class="rm-sub">' + esc(api.empty) + '</div>' : ''; return; }
          box.innerHTML = '<div class="rm-wz-lbl"><i class="fa fa-address-book"></i>' + esc(api.title) + '</div><div class="promo-pick-grid">'
            + api.rows.map(function (c, i) {
                return wzPick({ name: 'rmCs', multi: true, value: String(i), img: c.photo || AVATAR, icon: 'fa-user', label: c.name,
                                hint: [c.role, c.source].filter(Boolean).join(' · '), checked: api.has(c), attrs: ' data-cs-idx="' + i + '"' });
              }).join('') + '</div>';
          box.querySelectorAll('[data-cs-idx]').forEach(function (cb) {
            cb.addEventListener('change', function () {
              var c = api.rows[parseInt(cb.getAttribute('data-cs-idx'), 10)]; if (!c) return;
              if (cb.checked) api.add(c); else api.remove(c);
            });
          });
        }
      };
      m.rmContacts = api;
      if (o.esIv) api.paint();
      else api.suggest(CONTACT_SUG, 'Sugeridas', null, 'La actividad no tiene todavía promotor ni personas de contacto: búscalas abajo.');

      // Buscar en toda la base; «Crear» abre el alta con el nombre ya puesto.
      var ncBox = m.querySelector('[data-new-contact]');
      function abreAlta(nombre) {
        if (!ncBox) return;
        ncBox.classList.remove('d-none');
        var n = ncBox.querySelector('[data-nct="name"]');
        if (nombre) n.value = nombre;
        n.focus();
      }
      attachSearch(m.querySelector('[data-search="contact"]'), m.querySelector('[data-results="contact"]'), searchRoadmapPeople, function (r) {
        api.add({ name: r.label, phone: r.phone || '', email: r.email || '', photo: r.logo_url || '',
                  promoter_id: (r.kind === 'PROMOTER' || r.kind === 'MEMBER') ? r.id : '' });
      }, CAN_CREATE ? { onCreate: abreAlta, clearOnPick: true } : { clearOnPick: true });
      var ncBtn = m.querySelector('[data-new="contact"]');
      if (ncBtn) ncBtn.addEventListener('click', function () {
        if (ncBox && !ncBox.classList.contains('d-none')) { ncBox.classList.add('d-none'); return; }
        abreAlta((m.querySelector('[data-search="contact"]').value || '').trim());
      });
      if (ncBox) ncBox.querySelector('[data-nct-save]').addEventListener('click', function () {
        var v = function (k) { return (ncBox.querySelector('[data-nct="' + k + '"]').value || '').trim(); };
        var body = { name: v('name'), role: v('role'), phone: v('phone'), email: v('email') };
        if (!body.name) { alert('Escribe su nombre.'); return; }
        // En una entrevista la persona es DEL MEDIO (su endpoint la crea y la vincula al medio); en
        // lo demás, un tercero que queda como persona de contacto del promotor.
        var mid = o.esIv ? ((draft.interview || {}).media_id || '') : '';
        var url = mid ? '/api/media/' + encodeURIComponent(mid) + '/contacts/create' : ep('/contacto/tercero');
        postJson(url, body).then(function (r) {
          if (!(r && r.ok)) { alert((r && r.error) || 'No se pudo crear la persona.'); return; }
          api.add({ name: r.name || body.name, phone: r.phone || body.phone, email: r.email || body.email, photo: r.photo || '',
                    role: r.role || body.role, promoter_id: r.promoter_id || '', media_id: mid });
          ['name', 'role', 'phone', 'email'].forEach(function (k) { ncBox.querySelector('[data-nct="' + k + '"]').value = ''; });
          ncBox.classList.add('d-none');
          // Y ya es una SUGERIDA: la ficha del medio se vuelve a leer; en lo demás entra en la lista.
          if (mid) cargaFichaMedio(m, draft);
          else if (r.contact) { CONTACT_SUG.push(r.contact); api.suggest(CONTACT_SUG, 'Sugeridas'); }
        });
      });
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
    /* LAS PERSONAS DEL MEDIO (sus contactos y los terceros vinculados con él), con su cara: son las
       SUGERIDAS del paso de contactos de una entrevista (`wireContacts`). La que no esté se crea
       desde el alta de ese paso, que en una entrevista va al endpoint del medio. */
    function pintaContactosMedio(m, draft) {
      var box = m.querySelector('[data-media-contacts]'); if (!box || !m.rmContacts) return;
      var iv = draft.interview || {};
      if (!iv.media_id) { m.rmContacts.suggest([], 'Personas del medio', box, 'Elige antes el medio para ver sus personas.'); return; }
      var card = m.rmMediaCard;
      if (!card) { m.rmContacts.suggest([], 'Personas del medio', box, 'Cargando las personas del medio…'); return; }
      var gente = (card.contacts || []).map(function (c) {
        return { name: c.name, phone: c.phone || '', email: c.email || '', photo: c.photo || '', role: c.role || c.program || '',
                 promoter_id: c.promoter_id || '', media_id: iv.media_id, source: '' };
      });
      m.rmContacts.suggest(gente, 'Personas de ' + (card.name || 'este medio'), box, 'Todavía no hay nadie dado de alta en este medio: créala abajo.');
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
    function wireTransport(m, draft) { wireTransportWizard(m, draft, trCfg(draft.kind)); }
    // ⚠️⚠️ En un mismo traslado va casi siempre medio equipo, así que se marcan VARIAS personas y
    // se añaden DE GOLPE (de una en una era un trabajo tonto). Quien ya va sale como «ya va» y no
    // se puede elegir dos veces; un tercero nuevo o alguien a mano se AÑADEN A LA SELECCIÓN sin
    // cerrar el pop-up, para poder juntarlos con los demás en el mismo viaje.
    function openPassengerPicker(draft, done, opts) {
      opts = opts || {};
      var yaVan = {};
      (draft.transport.passengers || []).forEach(function (p) { if (p.personnel_id) yaVan[String(p.personnel_id)] = true; });
      var sel = {};
      // Las PLAZAS de una furgoneta son un tope: no se sube más gente de la que cabe.
      var hueco = (opts.max && opts.max > 0) ? Math.max(0, opts.max - (draft.transport.passengers || []).length) : null;

      var h = '<div class="d-flex align-items-center gap-2 mb-1">'
        + '<div class="text-muted small flex-grow-1">Personal de la hoja de ruta' + (hueco !== null ? ' · ' + (hueco === 1 ? 'queda 1 plaza' : 'quedan ' + hueco + ' plazas') : '') + '</div>'
        + '<div class="filter-chips m-0" data-passbulk></div></div>'
        + '<div data-passlist></div>'
        + '<hr><div class="text-muted small mb-1">Otra persona: busca en toda la base (la oficina, los integrantes, los terceros, el artista)</div>'
        + '<div class="rm-wz-search"><input class="form-control" placeholder="Escribe su nombre…" data-newsearch><div class="list-group position-absolute d-none" data-newresults></div></div>'
        + '<div class="mt-2 d-flex gap-2 flex-wrap"><input class="form-control form-control-sm" style="max-width:14rem" data-mname placeholder="…o un nombre a mano"><input class="form-control form-control-sm" style="max-width:10rem" data-mrole placeholder="Función"><button type="button" class="btn btn-outline-primary btn-sm" data-maddmanual>Añadir</button></div>';

      var bAdd = btn('Añadir', 'btn-primary', function () { addSeleccionados(); });
      var m2 = openModal('rmPassModal', 'modal-md', 'Añadir pasajeros', h, [bAdd], 'fa-user-group');

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
            + avatar(p.photo_url, p.kind === 'ARTIST' ? 'fa-guitar' : 'fa-user')
            + '<div class="flex-grow-1"><div>' + esc(p.name) + '</div>' + (p.role ? '<div class="rm-sub">' + esc(p.role) + '</div>' : (p.kind === 'ARTIST' ? '<div class="rm-sub">El artista</div>' : '')) + '</div>'
            + (ya ? '<span class="rm-sub">ya va</span>' : '') + '</div>');
          if (!ya) row.addEventListener('click', function () {
            if (!sel[id] && hueco !== null && marcados().length >= hueco) { rmToast('No caben más: la furgoneta tiene ' + opts.max + ' plazas.'); return; }
            sel[id] = !sel[id]; pinta();
          });
          wrap.appendChild(row);
        });
        // «Todos» / «Ninguno» solo cuando hacen algo (y no con una sola persona que elegir).
        var bulk = m2.querySelector('[data-passbulk]');
        bulk.innerHTML = '';
        var lib = libres(), n = marcados().length;
        if (lib.length > 1 && (hueco === null || hueco >= lib.length)) {
          if (n < lib.length) bulk.appendChild(chip('Todos', function () { lib.forEach(function (p) { sel[String(p.id)] = true; }); pinta(); }));
          if (n > 0) bulk.appendChild(chip('Ninguno', function () { sel = {}; pinta(); }));
        } else if (lib.length > 1 && n > 0) {
          bulk.appendChild(chip('Ninguno', function () { sel = {}; pinta(); }));
        }
        bAdd.textContent = n ? ('Añadir (' + n + ')') : 'Añadir';
      }

      function addSeleccionados() {
        var elegidos = marcados();
        if (!elegidos.length) { alert('Marca a las personas que van en este traslado.'); return; }
        elegidos.forEach(function (p) { draft.transport.passengers.push({ personnel_id: String(p.id), locator: '', ticket_url: '', ticket_name: '', confirmed: false, bags_hand: 0, bags_checked: 0, boarding_stop: '' }); });
        var i = bs('rmPassModal'); if (i) i.hide();
        done();
      }

      function marcaNueva(pid) {
        if (!pid) return;
        if (yaVan[String(pid)]) { alert('Esa persona ya va en este traslado.'); return; }
        if (hueco !== null && marcados().length >= hueco) { rmToast('No caben más: la furgoneta tiene ' + opts.max + ' plazas.'); return; }
        sel[String(pid)] = true; pinta();
      }
      // Quien no esté en el personal se BUSCA en toda la base (el mismo buscador que el personal) y
      // entra en él; el artista también (`kind` ARTIST).
      attachSearch(m2.querySelector('[data-newsearch]'), m2.querySelector('[data-newresults]'), searchRoadmapPeople, function (r) {
        savePerson({ kind: r.kind || 'PROMOTER', ref_id: r.id, name: r.label, phone: r.phone || '', email: r.email || '', photo_url: r.logo_url || '' }).then(marcaNueva);
      }, CAN_CREATE ? { onCreate: function (q) { createPromoter(q).then(function (r) { if (r && r.id) savePerson({ kind: 'PROMOTER', ref_id: r.id, name: r.label || q }).then(marcaNueva); }); }, clearOnPick: true } : { clearOnPick: true });
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
      // ⚠️ Un campo que ESE tipo no pregunta no existe en el modal: se lee con guarda.
      var val = function (sel) { var n = m.querySelector(sel); return n ? n.value : null; };
      var tEl = m.querySelector('[data-f="title"]');
      draft.title = tEl ? tEl.value.trim() : (draft.title || '');
      draft.day = marcado('rmDay') || draft.day;
      draft.start_time = val('[data-f="start_time"]') || '';
      draft.end_time = ruleHas('no_end', draft.kind) ? '' : (val('[data-f="end_time"]') || '');
      var tbcEl = m.querySelector('[data-f="tbc"]');
      draft.tbc = !!(tbcEl && tbcEl.checked);
      draft.confirmed = marcado('rmConf') !== '0';
      draft.sheets = {};
      m.querySelectorAll('[data-sheet]').forEach(function (cb) { draft.sheets[cb.getAttribute('data-sheet')] = cb.checked; });
      var locEl = m.querySelector('[data-f="location"]');
      draft.location = locEl ? locEl.value.trim() : (draft.location || '');
      // DÓNDE (M&G, fotos, comida): en el recinto —sin dirección— o en otro sitio, con su espacio.
      if (ruleHas('place', draft.kind)) {
        draft.place = draft.place || { mode: 'VENUE', space: '', venue_id: '', venue_name: '' };
        draft.place.mode = marcado('rmPlace') || draft.place.mode || 'VENUE';
        draft.place.space = (val('[data-f="space"]') || '').trim();
        if (draft.place.mode !== 'OTHER') { draft.location = ''; draft.place.venue_id = ''; draft.place.venue_name = ''; }
      }
      if (draft.kind === 'MG') draft.mg_count = (val('[data-f="mg_count"]') || '').trim();
      if (draft.kind === 'COMIDA') {
        var res = marcado('rmRes');
        draft.meal = draft.meal || {};
        draft.meal.reservation = res === '1' ? true : (res === '0' ? false : null);
        draft.meal.diners = draft.meal.reservation === true ? (val('[data-f="diners"]') || '').trim() : '';
        if (m.rmMenuState) draft.meal.menu = m.rmMenuState.menu;
      }
      draft.note = (val('[data-f="note"]') || '').trim();
      draft.audience = readAudience(m);
      draft.sings = ruleHas('no_sing', draft.kind) ? false : (marcado('rmSings') === '1');
      var accOn = m.querySelector('[data-f="access_on"]');
      draft.access_note = (accOn && accOn.checked) ? (val('[data-f="access_note"]') || '').trim() : '';
      var pinOn = !!(accOn && accOn.checked && m.rmPin);
      draft.access_lat = pinOn ? m.rmPin.lat : null;
      draft.access_lng = pinOn ? m.rmPin.lng : null;
      // Las personas de contacto van en `contacts`; la primera se espeja en `contact`.
      draft.contacts = draft.contacts || [];
      draft.contact = draft.contacts.length ? draft.contacts[0] : {};
      if (kindInfo(draft.kind).transport) {
        var t = draft.transport;
        ['company', 'number', 'origin', 'destination', 'duration', 'logo_url', 'locator_all'].forEach(function (f) {
          var n = m.querySelector('[data-t="' + f + '"]'); if (n) t[f] = n.value.trim();
        });
        var nd = m.querySelector('[data-t="ends_next_day"]'); t.ends_next_day = !!(nd && nd.checked);
        var sl = m.querySelector('[data-t="same_locator"]'); t.same_locator = !!(sl && sl.checked);
      }
      var guardarUbicacion = null;
      if (esIv) {
        var iv = draft.interview;
        iv.program = (val('[data-iv="program"]') || '').trim();
        iv.modality = marcado('rmMod');
        iv.live = marcado('rmLive') === '1';
        iv.sings = draft.sings;
        iv.formation = marcado('rmForm');
        iv.zoom_url = (val('[data-iv="zoom_url"]') || '').trim();
        var ztbc = m.querySelector('[data-iv="zoom_tbc"]'); iv.zoom_tbc = !!(ztbc && ztbc.checked);
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
        // ⚠️ Una entrevista se llama como su medio y su programa (ya no se pide título aparte).
        draft.title = [iv.media_name, iv.program].filter(Boolean).join(' · ');
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
      var lugarD = placeLabel(it);
      if (lugarD) h += '<div class="mb-1"><i class="fa fa-location-dot text-muted"></i> ' + esc(lugarD) + mapLink(itemMapsHref(it), hasPin(it) ? 'Ir al punto de acceso exacto' : 'Abrir en Mapas') + '</div>';
      if (it.kind === 'MG' && it.mg_count) h += '<div class="mb-1"><i class="fa fa-users text-muted"></i> ' + esc(it.mg_count) + ' personas</div>';
      if (it.kind === 'COMIDA' && (mealTag(it.meal) || menuTag(it))) h += '<div class="mb-1">' + mealTag(it.meal) + ' ' + menuTag(it) + '</div>';
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
      if (ki.transport && it.transport) h += transDetailHtml(it);
      // LAS PERSONAS DE CONTACTO (pueden ser varias), cada una con su cara, su teléfono y su correo.
      var ccs = itemContacts(it);
      if (ccs.length) {
        h += '<div class="mt-2"><div class="rm-sub mb-1"><i class="fa fa-address-card"></i> ' + (ccs.length === 1 ? 'Persona de contacto' : 'Personas de contacto') + '</div>';
        ccs.forEach(function (cc) { h += contactRow(cc, cc.role || ''); });
        h += '</div>';
      }
      h += accesoHtml(it.access_note, it, 'Acceso · ' + (it.title || ''));
      if (it.note) h += '<div class="alert alert-warning mt-2 mb-0 py-2"><i class="fa fa-note-sticky"></i> ' + esc(it.note) + '</div>';
      if ((it.attachments || []).length) { h += '<div class="mt-2">'; it.attachments.forEach(function (a) { h += '<a class="rm-att" href="' + esc(a.url) + '" target="_blank"><i class="fa fa-download"></i> ' + esc(a.name) + '</a>'; }); h += '</div>'; }

      var foot = RO ? [btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmDetailModal'); if (i) i.hide(); })] : [
        btn('Editar', 'btn-outline-primary', function () { var i = bs('rmDetailModal'); if (i) i.hide(); openItemEditor(JSON.parse(JSON.stringify(it))); }),
        (it.kind === 'COMIDA' && it.meal && it.meal.menu && TABS.indexOf('comidas') >= 0) ? btn('Menú', 'btn-outline-secondary', function () { var i = bs('rmDetailModal'); if (i) i.hide(); goTab('comidas'); }) : null,
        btn(it.confirmed ? 'Marcar provisional' : 'Confirmar', 'btn-outline-secondary', function () { postJson(ep('/item/toggle'), { id: it.id, field: 'confirmed', value: !it.confirmed }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); }),
        btn(it.cancelled ? 'Reactivar' : 'Cancelar', 'btn-outline-warning', function () { postJson(ep('/item/toggle'), { id: it.id, field: 'cancelled', value: !it.cancelled }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); }),
        btn('Eliminar', 'btn-outline-danger', function () { if (!confirm('¿Eliminar esta actividad?')) return; postJson(ep('/item/delete'), { id: it.id }).then(function (r) { apply(r); var i = bs('rmDetailModal'); if (i) i.hide(); }); })
      ];
      openModal('rmDetailModal', 'modal-md', ki.label, h, foot.filter(Boolean));
    }

    // ================================================================ LA COMIDA CON MENÚ
    /* ⚠️⚠️ LA COMIDA CON MENÚ (sep 2026, lo pidió Dani, lote 4). Un menú cerrado tiene SECCIONES (las de
       un menú —entrante, principal, postre, café, bebida—, «bocadillos» u otras) y cada sección es FIJA
       o SE ELIGE (cuántos por persona, se pregunta al marcarla); cada plato lleva foto, título,
       descripción y etiquetas (vegano · vegetariano · sin gluten · sin lactosa), se arrastra para
       ordenarlo y se puede marcar AGOTADO. El constructor (`mountMenuBuilder`) es el MISMO en el
       asistente de la comida y en la pestaña COMIDAS, que aparece sola cuando alguna comida tiene menú
       (`ensureMealsTab`) y enseña quién ha elegido qué, deja elegir por alguien, pedir que respondan
       (SMS · correo, con vista previa, cada uno con su enlace) y sacar el PDF por persona o por platos.
       La elección la hace cada uno por su enlace personal (`/menu/<token>`, la página pública). */
    var MENU_KINDS = CTX.menu_kinds || [{ key: 'MENU', label: 'Menú', icon: 'fa-utensils' }, { key: 'BOCADILLOS', label: 'Bocadillos', icon: 'fa-burger' }, { key: 'OTRO', label: 'Otro', icon: 'fa-bowl-food' }];
    var MENU_DEFAULTS = CTX.menu_default_sections || { MENU: ['Entrante', 'Plato principal', 'Postre', 'Café', 'Bebida'], BOCADILLOS: ['Bocadillos'], OTRO: ['Opciones'] };
    var DISH_TAGS = CTX.dish_tags || [];
    function tagInfo(k) { return DISH_TAGS.filter(function (t) { return t.key === k; })[0] || { key: k, label: k, icon: 'fa-tag' }; }
    function newId() { return Math.random().toString(36).slice(2, 12); }
    function defaultSections(kind) { return (MENU_DEFAULTS[kind] || []).map(function (n) { return { id: newId(), name: n, mode: 'FIXED', choose_n: 1, dishes: [] }; }); }
    function mealWord(it) { var t = (it && it.start_time) || ''; if (!/^\d\d:\d\d$/.test(t)) return 'Comida'; var h = parseInt(t.slice(0, 2), 10) + parseInt(t.slice(3, 5), 10) / 60; return h < 11.5 ? 'Desayuno' : (h < 17.5 ? 'Comida' : 'Cena'); }
    function showMeals() { return (P.agenda || []).some(function (it) { return it.kind === 'COMIDA' && !it.cancelled && it.meal && it.meal.menu; }); }
    function menuChooseSections(menu) { return ((menu && menu.sections) || []).filter(function (sc) { return sc.mode === 'CHOOSE' && (sc.dishes || []).length; }); }
    /* A QUIÉN afecta un punto, como filas del personal (el espejo de `_roadmap_item_people`). */
    function itemPeople(it) {
      var aud = (it && it.audience) || {}, mode = String(aud.mode || 'ALL').toUpperCase();
      var filas = (P.personnel || []).filter(function (p) { return p && p.id; });
      if (mode === 'ROLES' && (aud.roles || []).length) { var claves = (aud.roles || []).map(normText); return filas.filter(function (p) { return claves.indexOf(normText(p.role || '')) >= 0; }); }
      if (mode === 'PEOPLE' && (aud.ids || []).length) {
        var ids = (aud.ids || []).map(String), artistas = ids.filter(function (x) { return x.indexOf('artist:') === 0; }).map(function (x) { return x.slice(7); });
        return filas.filter(function (p) { return ids.indexOf(String(p.id)) >= 0 || (p.kind === 'ARTIST' && artistas.indexOf(String(p.ref_id)) >= 0); });
      }
      return filas;
    }
    function menuStatusLocal(it) {
      var gente = itemPeople(it), resp = (it.meal && it.meal.responses) || {};
      return { total: gente.length, answered: gente.filter(function (p) { var r = resp[String(p.id)]; return r && r.choices && Object.keys(r.choices).length; }).length };
    }
    function menuTag(it) {
      if (!(it && it.kind === 'COMIDA' && it.meal && it.meal.menu)) return '';
      var eligen = menuChooseSections(it.meal.menu).length > 0, st = menuStatusLocal(it);
      return '<span class="rm-tag" data-goto-meals title="Ver el menú"><i class="fa fa-utensils"></i> Menú' + (eligen ? ' · ' + st.answered + '/' + st.total : '') + '</span>';
    }
    /* La pestaña COMIDAS aparece cuando alguna comida tiene menú, y se va cuando ninguna lo tiene. */
    function ensureMealsTab() {
      if (CTX.tabs && CTX.tabs.length) return;
      var on = showMeals(), idx = TABS.indexOf('comidas'), nav = root.querySelector('.rm-nav');
      if (on && idx < 0) {
        var pos = TABS.indexOf('logistica'); TABS.splice(pos >= 0 ? pos + 1 : 1, 0, 'comidas');
        if (nav && !nav.querySelector('[data-rm-tab="comidas"]')) {
          var b = el('<button type="button" data-rm-tab="comidas" title="Comidas"><i class="fa fa-utensils"></i> <span>Comidas</span></button>');
          var ref = nav.querySelector('[data-rm-tab="logistica"]');
          if (ref && ref.nextSibling) nav.insertBefore(b, ref.nextSibling); else nav.appendChild(b);
        }
      } else if (!on && idx >= 0) {
        TABS.splice(idx, 1);
        var bt = nav && nav.querySelector('[data-rm-tab="comidas"]'); if (bt) bt.remove();
        if (tab === 'comidas') { tab = 'agenda'; root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-rm-tab') === 'agenda'); }); }
      }
    }
    // ---- el constructor del menú
    function mountMenuBuilder(box, state, opts) {
      opts = opts || {};
      function changed() { if (opts.onChange) opts.onChange(state.menu); }
      function sectionHtml(sc, i) {
        var choose = sc.mode === 'CHOOSE';
        return '<div class="rm-msec" data-sec="' + i + '">'
          + '<div class="rm-msec__head">'
          + '<input class="form-control form-control-sm rm-msec__name" data-sec-name value="' + esc(sc.name) + '" placeholder="Nombre de la sección">'
          + '<button type="button" class="rm-msec__mode' + (choose ? ' is-on' : '') + '" data-sec-mode title="' + (choose ? 'Se elige: pincha para hacerla fija' : 'Fija para todos: pincha para que se elija') + '"><i class="fa ' + (choose ? 'fa-hand-pointer' : 'fa-lock') + '"></i> ' + (choose ? 'Se elige' + (sc.choose_n > 1 ? ' · ' + sc.choose_n : '') : 'Fijo') + '</button>'
          + '<button type="button" class="btn btn-link btn-sm text-danger p-0 ms-auto" data-sec-del title="Quitar la sección"><i class="fa fa-trash"></i></button>'
          + '</div>'
          + '<div class="rm-mdishes" data-dishes>' + ((sc.dishes || []).length ? (sc.dishes || []).map(dishHtml).join('') : '<div class="rm-sub">Sin platos todavía.</div>') + '</div>'
          + '<button type="button" class="rm-add sm mt-1" data-dish-add><i class="fa fa-plus"></i> Plato</button>'
          + '</div>';
      }
      function dishHtml(d, j) {
        return '<div class="rm-mdish' + (d.sold_out ? ' is-out' : '') + '" draggable="true" data-dish="' + j + '">'
          + '<span class="h" title="Arrastra para ordenar"><i class="fa fa-grip-vertical"></i></span>'
          + (d.photo_url ? '<img src="' + esc(d.photo_url) + '" alt="">' : '<span class="rm-mdish__noimg"><i class="fa fa-utensils"></i></span>')
          + '<div class="min-w-0 flex-grow-1"><div class="fw-semibold text-truncate">' + esc(d.title) + (d.sold_out ? ' <span class="rm-tag">Agotado</span>' : '') + '</div>'
          + (d.desc ? '<div class="rm-sub text-truncate">' + esc(d.desc) + '</div>' : '')
          + ((d.tags || []).length ? '<div class="rm-mdish__tags">' + d.tags.map(function (k) { var t = tagInfo(k); return '<span class="rm-tag"><i class="fa ' + esc(t.icon) + '"></i> ' + esc(t.label) + '</span>'; }).join('') + '</div>' : '') + '</div>'
          + '<div class="rm-mdish__acts">'
          + '<button type="button" class="btn btn-sm ' + (d.sold_out ? 'btn-dark' : 'btn-outline-secondary') + '" data-dish-out title="' + (d.sold_out ? 'Volver a ponerlo disponible' : 'Marcar agotado: no se puede pedir') + '"><i class="fa fa-ban"></i><span class="d-none d-md-inline"> ' + (d.sold_out ? 'Agotado' : 'Agotar') + '</span></button>'
          + '<button type="button" class="btn btn-sm btn-outline-secondary" data-dish-edit title="Editar"><i class="fa fa-pen"></i></button>'
          + '<button type="button" class="btn btn-sm btn-outline-danger" data-dish-del title="Quitar"><i class="fa fa-trash"></i></button></div></div>';
      }
      function paint() {
        var menu = state.menu;
        var h = '<div class="rm-wz-lbl"><i class="fa fa-utensils"></i>¿Hay menú cerrado?</div>'
          + '<div class="promo-pick-grid promo-pick-grid--wide mb-2">'
          + wzPick({ name: 'rmMenuOn', value: '1', icon: 'fa-utensils', label: 'Sí, hay menú', hint: 'Se suben las opciones', checked: !!menu, attrs: ' data-menu-on' })
          + wzPick({ name: 'rmMenuOn', value: '0', icon: 'fa-ban', label: 'No', checked: !menu, attrs: ' data-menu-on' })
          + '</div>';
        if (menu) {
          h += '<div class="promo-pick-grid promo-pick-grid--wide mb-2">' + MENU_KINDS.map(function (k) { return wzPick({ name: 'rmMenuKind', value: k.key, icon: k.icon, label: k.label, checked: menu.kind === k.key, attrs: ' data-menu-kind' }); }).join('') + '</div>'
            + '<div class="mb-3"><label class="form-label small mb-1"><i class="fa fa-tag me-1 text-muted"></i>Nombre del menú <span class="text-muted fw-normal">(opcional)</span></label><input class="form-control" data-menu-title value="' + esc(menu.title || '') + '" placeholder="Menú del catering, bocadillos del bus…"></div>'
            + '<div data-menu-sections>' + (menu.sections || []).map(sectionHtml).join('') + '</div>'
            + '<div class="d-flex gap-2 align-items-center mt-2"><input class="form-control form-control-sm" style="max-width:16rem" data-sec-new placeholder="Nueva sección (Vinos, Picoteo…)"><button type="button" class="rm-add sm" data-sec-add><i class="fa fa-plus"></i> Sección</button></div>'
            + '<div class="filter-hint">Cada sección se elige (y cuántos) o es fija para todos. Los platos se arrastran para ordenarlos; un plato agotado no se puede pedir.</div>';
        }
        box.innerHTML = h;
        wire();
      }
      function wire() {
        box.querySelectorAll('[data-menu-on]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (!r.checked) return;
            if (r.value === '1' && !state.menu) state.menu = { kind: 'MENU', title: '', sections: defaultSections('MENU') };
            if (r.value === '0') { if (state.menu && state.menu.sections.some(function (sc) { return (sc.dishes || []).length; }) && !confirm('¿Quitar el menú con sus platos?')) { paint(); return; } state.menu = null; }
            paint(); changed();
          });
        });
        var menu = state.menu; if (!menu) return;
        box.querySelectorAll('[data-menu-kind]').forEach(function (r) {
          r.addEventListener('change', function () {
            if (!r.checked) return;
            menu.kind = r.value;
            if (!menu.sections.some(function (sc) { return (sc.dishes || []).length; })) menu.sections = defaultSections(menu.kind);
            paint(); changed();
          });
        });
        var tit = box.querySelector('[data-menu-title]'); if (tit) tit.addEventListener('input', function () { menu.title = tit.value.trim(); changed(); });
        var add = box.querySelector('[data-sec-add]');
        if (add) add.addEventListener('click', function () { var inp = box.querySelector('[data-sec-new]'); var n = inp.value.trim(); if (!n) { inp.focus(); return; } menu.sections.push({ id: newId(), name: n, mode: 'CHOOSE', choose_n: 1, dishes: [] }); paint(); changed(); });
        box.querySelectorAll('[data-sec]').forEach(function (secEl) {
          var i = parseInt(secEl.getAttribute('data-sec'), 10), sc = menu.sections[i];
          secEl.querySelector('[data-sec-name]').addEventListener('input', function (e) { sc.name = e.target.value; changed(); });
          secEl.querySelector('[data-sec-del]').addEventListener('click', function () { if ((sc.dishes || []).length && !confirm('¿Quitar la sección «' + sc.name + '» con sus ' + sc.dishes.length + ' platos?')) return; menu.sections.splice(i, 1); paint(); changed(); });
          secEl.querySelector('[data-sec-mode]').addEventListener('click', function () {
            if (sc.mode === 'CHOOSE') { sc.mode = 'FIXED'; paint(); changed(); return; }
            // ⚠️ Al marcar «se elige» se pregunta CUÁNTOS tiene que elegir cada uno (lo pidió Dani).
            askChooseN(sc, function () { sc.mode = 'CHOOSE'; paint(); changed(); });
          });
          secEl.querySelector('[data-dish-add]').addEventListener('click', function () {
            openDishModal({ id: newId(), title: '', desc: '', photo_url: '', tags: [], sold_out: false }, function (d) { sc.dishes.push(d); paint(); changed(); });
          });
          secEl.querySelectorAll('[data-dish]').forEach(function (row) {
            var j = parseInt(row.getAttribute('data-dish'), 10), d = sc.dishes[j];
            row.querySelector('[data-dish-edit]').addEventListener('click', function () { openDishModal(JSON.parse(JSON.stringify(d)), function (nd) { sc.dishes[j] = nd; paint(); changed(); }); });
            row.querySelector('[data-dish-del]').addEventListener('click', function () { sc.dishes.splice(j, 1); paint(); changed(); });
            row.querySelector('[data-dish-out]').addEventListener('click', function () { d.sold_out = !d.sold_out; paint(); changed(); });
            row.addEventListener('dragstart', function (e) { row.classList.add('dragging'); e.dataTransfer.setData('text/plain', String(j)); });
            row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
            row.addEventListener('dragover', function (e) { e.preventDefault(); });
            row.addEventListener('drop', function (e) { e.preventDefault(); var from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (isNaN(from) || from === j) return; var mv = sc.dishes.splice(from, 1)[0]; sc.dishes.splice(j, 0, mv); paint(); changed(); });
          });
        });
      }
      paint();
      return { get: function () { return state.menu; }, repaint: paint };
    }
    function askChooseN(sc, done) {
      var h = '<div class="rm-wz-lbl"><i class="fa fa-hand-pointer"></i>¿Cuántos tiene que elegir cada uno en «' + esc(sc.name) + '»?</div>'
        + '<input type="number" min="1" max="9" class="form-control" style="max-width:8rem" data-choose-n value="' + (sc.choose_n || 1) + '">'
        + '<div class="filter-hint">Lo normal es uno (un entrante, un principal); en un picoteo pueden ser varios.</div>';
      var m = openModal('rmChooseNModal', 'modal-sm', 'Se elige', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmChooseNModal'); if (i) i.hide(); }),
        btn('Vale', 'btn-danger', function () { sc.choose_n = Math.max(1, Math.min(9, parseInt(m.querySelector('[data-choose-n]').value, 10) || 1)); var i = bs('rmChooseNModal'); if (i) i.hide(); done(); })
      ], 'fa-hand-pointer');
      setTimeout(function () { var n = m.querySelector('[data-choose-n]'); if (n) { n.focus(); n.select(); } }, 250);
    }
    function openDishModal(d, onSave) {
      var h = '<div class="row g-2">'
        + '<div class="col-md-8"><label class="form-label small mb-1"><i class="fa fa-tag me-1 text-muted"></i>Título</label><input class="form-control" data-dish-f="title" value="' + esc(d.title || '') + '" placeholder="Ensalada de tomate, solomillo…"></div>'
        + '<div class="col-md-4"><label class="form-label small mb-1"><i class="fa fa-image me-1 text-muted"></i>Foto</label><label class="btn btn-outline-secondary btn-sm d-block"><i class="fa fa-camera"></i> ' + (d.photo_url ? 'Cambiar' : 'Subir') + '<input type="file" hidden accept="image/*" data-dish-photo></label></div>'
        + '<div class="col-12" data-dish-preview>' + (d.photo_url ? '<img src="' + esc(d.photo_url) + '" alt="" class="rm-dish-preview">' : '') + '</div>'
        + '<div class="col-12"><label class="form-label small mb-1"><i class="fa fa-align-left me-1 text-muted"></i>Descripción</label><textarea class="form-control" rows="2" data-dish-f="desc" placeholder="Los ingredientes, cómo va…">' + esc(d.desc || '') + '</textarea></div>'
        + '<div class="col-12"><div class="rm-wz-lbl"><i class="fa fa-leaf"></i>Etiquetas</div><div class="filter-chips">' + DISH_TAGS.map(function (t) { return '<label class="filter-chip"><input type="checkbox" value="' + esc(t.key) + '" data-dish-tag' + ((d.tags || []).indexOf(t.key) >= 0 ? ' checked' : '') + '><i class="fa ' + esc(t.icon) + '"></i>' + esc(t.label) + '</label>'; }).join('') + '</div></div>'
        + '<div class="col-12"><div class="filter-chips"><label class="filter-chip"><input type="checkbox" data-dish-f="sold_out"' + (d.sold_out ? ' checked' : '') + '><i class="fa fa-ban"></i>Agotado (no se puede pedir)</label></div></div>'
        + '</div>';
      var m = openModal('rmDishModal', 'modal-md', d.title ? 'Editar el plato' : 'Nuevo plato', h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmDishModal'); if (i) i.hide(); }),
        btn(d.title ? 'Guardar' : 'Añadir el plato', 'btn-danger', function () {
          var t = m.querySelector('[data-dish-f="title"]').value.trim(); if (!t) { alert('Ponle título al plato.'); return; }
          d.title = t; d.desc = m.querySelector('[data-dish-f="desc"]').value.trim();
          d.tags = [].map.call(m.querySelectorAll('[data-dish-tag]:checked'), function (c) { return c.value; });
          d.sold_out = m.querySelector('[data-dish-f="sold_out"]').checked;
          var i = bs('rmDishModal'); if (i) i.hide(); onSave(d);
        })
      ], 'fa-utensils');
      m.querySelector('[data-dish-photo]').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        var fd = new FormData(); fd.append('file', f);
        var prev = m.querySelector('[data-dish-preview]'); prev.innerHTML = '<span class="rm-sub">Subiendo la foto…</span>';
        postForm(ep('/comida/foto'), fd).then(function (r) {
          if (r && r.ok && r.url) { d.photo_url = r.url; prev.innerHTML = '<img src="' + esc(r.url) + '" alt="" class="rm-dish-preview">'; }
          else prev.innerHTML = '<span class="text-danger small">' + esc((r && r.error) || 'No se pudo subir la foto.') + '</span>';
        });
      });
      setTimeout(function () { var t = m.querySelector('[data-dish-f="title"]'); if (t) t.focus(); }, 250);
    }
    // ---- la pestaña COMIDAS
    function renderComidas() {
      var meals = (P.agenda || []).filter(function (it) { return it.kind === 'COMIDA' && !it.cancelled && it.meal && it.meal.menu; })
        .sort(function (x, y) { if (x.day !== y.day) return x.day < y.day ? -1 : 1; return (x.start_time || '99') < (y.start_time || '99') ? -1 : 1; });
      var html = '<div class="rm-toolbar"><div class="text-muted small">Comidas con menú: quién ha elegido qué</div></div>';
      if (!meals.length) html += '<div class="rm-empty">Ninguna comida tiene menú todavía. Se pone al añadir o editar una comida en los Horarios.</div>';
      meals.forEach(function (it) { html += mealCardHtml(it); });
      view.innerHTML = html;
      meals.forEach(function (it) { wireMealCard(it); if (menuChooseSections(it.meal.menu).length) loadMealStatus(it); });
    }
    function mealCardHtml(it) {
      var menu = it.meal.menu, st = menuStatusLocal(it), eligen = menuChooseSections(menu).length > 0, lugar = placeLabel(it);
      return '<div class="rm-card rm-meal mb-3" data-meal-card="' + esc(it.id) + '">'
        + '<div class="rm-card__head"><i class="fa fa-utensils"></i><span class="text-truncate">' + esc(it.title || mealWord(it)) + (menu.title ? ' · ' + esc(menu.title) : '') + '</span>'
        + '<span class="ms-auto rm-tag ' + (eligen ? (st.total && st.answered >= st.total ? 'ok' : 'warn') : '') + '">' + (eligen ? st.answered + '/' + st.total + ' han elegido' : 'Menú fijo') + '</span></div>'
        + '<div class="rm-card__body">'
        + '<div class="rm-sub mb-2"><i class="fa fa-calendar-day"></i> ' + esc(dayLabel(it.day)) + (it.start_time ? ' · ' + esc(it.start_time) : '') + ' · ' + esc(mealWord(it)) + (lugar ? ' · <i class="fa fa-location-dot"></i> ' + esc(lugar) : '') + '</div>'
        + '<div class="rm-menu-summary">' + (menu.sections || []).map(function (sc) {
            return '<div class="rm-msum"><div class="rm-msum__name"><b>' + esc(sc.name) + '</b> <span class="rm-sub">' + (sc.mode === 'CHOOSE' ? 'se elige' + (sc.choose_n > 1 ? ' ' + sc.choose_n : '') : 'fijo') + '</span></div>'
              + ((sc.dishes || []).length ? '<div class="rm-msum__dishes">' + sc.dishes.map(function (d) {
                  return '<span class="rm-mchip' + (d.sold_out ? ' is-out' : '') + '"' + (RO ? '' : ' data-sold="' + esc(sc.id) + ':' + esc(d.id) + '" title="' + (d.sold_out ? 'Agotado: pincha para volver a ofrecerlo' : 'Pincha para marcarlo agotado') + '"') + '>' + (d.photo_url ? '<img src="' + esc(d.photo_url) + '" alt="">' : '') + esc(d.title) + (d.sold_out ? ' · agotado' : '') + '</span>';
                }).join('') + '</div>' : '<div class="rm-sub">Sin platos.</div>') + '</div>';
          }).join('') + '</div>'
        + (eligen ? '<div class="rm-menu-people mt-2" data-meal-people><div class="rm-sub">Cargando quién ha elegido…</div></div>' : '')
        + (RO ? '' : '<div class="d-flex flex-wrap gap-2 mt-3">'
            + '<button type="button" class="btn btn-sm btn-outline-secondary" data-meal-edit><i class="fa fa-pen me-1"></i>Editar el menú</button>'
            + (eligen ? '<button type="button" class="btn btn-sm btn-danger" data-meal-request><i class="fa fa-paper-plane me-1"></i>Pedir que respondan</button>' : '')
            + '<a class="btn btn-sm btn-outline-secondary" href="' + esc(ep('/comida/' + it.id + '/pdf?por=persona')) + '" target="_blank" rel="noopener"><i class="fa fa-file-pdf me-1"></i>PDF por persona</a>'
            + '<a class="btn btn-sm btn-outline-secondary" href="' + esc(ep('/comida/' + it.id + '/pdf?por=plato')) + '" target="_blank" rel="noopener"><i class="fa fa-file-pdf me-1"></i>PDF por platos</a>'
            + '</div>')
        + '</div></div>';
    }
    function saveMenu(it, menu, notify) {
      return postJson(ep('/comida/' + it.id + '/menu'), { menu: menu, notify: notify !== false }).then(function (r) {
        if (!(r && r.ok)) { alert((r && r.error) || 'No se pudo guardar el menú.'); return false; }
        if (r.notified) rmToast(r.notified === 1 ? 'Avisada 1 persona de la casa para que elija.' : 'Avisadas ' + r.notified + ' personas de la casa para que elijan.');
        apply(r); return true;
      });
    }
    function wireMealCard(it) {
      var card = view.querySelector('[data-meal-card="' + it.id + '"]'); if (!card) return;
      card.querySelectorAll('[data-sold]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var partes = chip.getAttribute('data-sold').split(':'), menu = JSON.parse(JSON.stringify(it.meal.menu));
          (menu.sections || []).forEach(function (sc) { if (sc.id === partes[0]) (sc.dishes || []).forEach(function (d) { if (d.id === partes[1]) d.sold_out = !d.sold_out; }); });
          saveMenu(it, menu, false);
        });
      });
      var ed = card.querySelector('[data-meal-edit]');
      if (ed) ed.addEventListener('click', function () { openMenuEditor(it); });
      var rq = card.querySelector('[data-meal-request]');
      if (rq) rq.addEventListener('click', function () { openMenuRequest(it); });
    }
    function openMenuEditor(it) {
      var state = { menu: JSON.parse(JSON.stringify(it.meal.menu || null)) };
      var m = openModal('rmMenuEditModal', 'modal-lg', 'El menú · ' + (it.title || mealWord(it)), '<div data-menu-builder></div>', [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmMenuEditModal'); if (i) i.hide(); }),
        btn('Guardar el menú', 'btn-danger', function () { saveMenu(it, state.menu, true).then(function (ok) { if (ok) { var i = bs('rmMenuEditModal'); if (i) i.hide(); } }); })
      ], 'fa-utensils');
      mountMenuBuilder(m.querySelector('[data-menu-builder]'), state, {});
    }
    function loadMealStatus(it) {
      var box = view.querySelector('[data-meal-card="' + it.id + '"] [data-meal-people]'); if (!box) return;
      getJson(ep('/comida/' + it.id + '/estado')).then(function (st) {
        if (!(st && st.ok)) { box.innerHTML = '<div class="rm-sub">No se pudo cargar quién ha elegido.</div>'; return; }
        var eligen = menuChooseSections(it.meal.menu);
        var titulos = {}; (it.meal.menu.sections || []).forEach(function (sc) { (sc.dishes || []).forEach(function (d) { titulos[d.id] = d.title; }); });
        if (!(st.people || []).length) { box.innerHTML = '<div class="rm-sub">Esta comida no le afecta a nadie del personal: revisa «a quién le afecta» en el punto.</div>'; return; }
        var h = '<div class="rm-people-head"><span class="fw-semibold">Quién ha elegido</span><span class="rm-sub">' + st.answered + ' de ' + st.total + '</span></div>';
        (st.people || []).forEach(function (p) {
          h += '<div class="rm-pline" data-person="' + esc(p.id) + '">' + avatar(p.photo, 'fa-user') + '<div class="min-w-0 flex-grow-1"><div class="text-truncate">' + esc(p.name) + (p.role ? ' <span class="rm-sub">· ' + esc(p.role) + '</span>' : '') + '</div>';
          if (p.answered) {
            h += '<div class="rm-sub">' + eligen.map(function (sc) { var ids = (p.choices || {})[sc.id] || []; return ids.length ? '<b>' + esc(sc.name) + ':</b> ' + esc(ids.map(function (id) { return titulos[id] || '?'; }).join(', ')) : ''; }).filter(Boolean).join(' · ') + (p.by === 'OFFICE' ? ' <span class="rm-tag">Lo eligió la oficina</span>' : '') + '</div>';
          } else {
            h += '<div class="rm-sub text-warning-emphasis"><i class="fa fa-hourglass-half"></i> Sin responder' + (!p.phone && !p.email ? ' · sin teléfono ni correo' : '') + '</div>';
          }
          h += '</div>' + (RO ? '' : '<button type="button" class="btn btn-sm btn-outline-secondary" data-pick="' + esc(p.id) + '">' + (p.answered ? 'Cambiar' : 'Elegir por él/ella') + '</button>') + '</div>';
        });
        box.innerHTML = h;
        box.querySelectorAll('[data-pick]').forEach(function (b) {
          b.addEventListener('click', function () { var p = (st.people || []).filter(function (x) { return x.id === b.getAttribute('data-pick'); })[0]; if (p) openOfficePick(it, p); });
        });
      });
    }
    /* La OFICINA elige por alguien (o le cambia lo que eligió): las mismas tarjetas que ve la persona. */
    function openOfficePick(it, p) {
      var eligen = menuChooseSections(it.meal.menu);
      var h = '<div class="rm-sub mb-2">Lo que elige <b>' + esc(p.name) + '</b> en esta comida.</div>';
      eligen.forEach(function (sc) {
        var mios = ((p.choices || {})[sc.id]) || [];
        h += '<div class="rm-wz-lbl mt-2"><i class="fa fa-hand-pointer"></i>' + esc(sc.name) + ' <span class="rm-sub">· ' + (sc.choose_n > 1 ? 'elige ' + sc.choose_n : 'elige uno') + '</span></div>'
          + '<div class="promo-pick-grid" data-pick-sec="' + esc(sc.id) + '" data-max="' + sc.choose_n + '">'
          + (sc.dishes || []).map(function (d) { return wzPick({ name: 'rmPick_' + sc.id, multi: sc.choose_n > 1, value: d.id, img: d.photo_url || '', icon: 'fa-utensils', label: d.title + (d.sold_out ? ' (agotado)' : ''), hint: (d.tags || []).map(function (k) { return tagInfo(k).label; }).join(' · '), checked: mios.indexOf(d.id) >= 0, attrs: (d.sold_out ? ' disabled' : ''), cls: 'promo-pick--logo', imgCls: 'promo-pick__logo' }); }).join('')
          + '</div>';
      });
      var m = openModal('rmPickModal', 'modal-lg', 'Elegir por ' + p.name, h, [
        btn('Cancelar', 'btn-outline-secondary', function () { var i = bs('rmPickModal'); if (i) i.hide(); }),
        (p.answered ? btn('Quitar su respuesta', 'btn-outline-danger', function () { postJson(ep('/comida/' + it.id + '/respuesta'), { personnel_id: p.id, choices: {} }).then(function (r) { if (r && r.ok) { var i = bs('rmPickModal'); if (i) i.hide(); apply(r); } else alert((r && r.error) || 'No se pudo.'); }); }) : null),
        btn('Guardar', 'btn-danger', function () {
          var choices = {};
          m.querySelectorAll('[data-pick-sec]').forEach(function (sec) { choices[sec.getAttribute('data-pick-sec')] = [].map.call(sec.querySelectorAll('input:checked'), function (i) { return i.value; }); });
          postJson(ep('/comida/' + it.id + '/respuesta'), { personnel_id: p.id, choices: choices }).then(function (r) { if (r && r.ok) { var i = bs('rmPickModal'); if (i) i.hide(); apply(r); } else alert((r && r.error) || 'No se pudo guardar.'); });
        })
      ].filter(Boolean), 'fa-utensils');
      // Con varios a elegir, no más de los que toca.
      m.querySelectorAll('[data-pick-sec]').forEach(function (sec) {
        var max = parseInt(sec.getAttribute('data-max'), 10) || 1;
        sec.addEventListener('change', function (e) { if (e.target.type === 'checkbox' && e.target.checked && sec.querySelectorAll('input:checked').length > max) { e.target.checked = false; rmToast('Aquí se eligen ' + max + '.'); } });
      });
    }
    /* PEDIR QUE RESPONDAN: por SMS o correo, a quien no ha elegido; con la vista previa del texto y de a
       quién le llega (y a quién no, y por qué). Cada uno recibe SU enlace. */
    function openMenuRequest(it) {
      var canal = 'SMS', datos = null, fuera = {};
      var h = '<div class="d-flex flex-wrap gap-2 align-items-center mb-3" data-mr-channels></div>'
        + '<div class="row g-3"><div class="col-md-5"><div class="rm-wz-lbl"><i class="fa fa-users"></i>A quién <span class="rm-sub" data-mr-count></span></div><div data-mr-people class="rm-mr-people"></div></div>'
        + '<div class="col-md-7"><div class="rm-wz-lbl"><i class="fa fa-eye"></i>Así les llega</div><div data-mr-preview class="rm-mr-preview"><div class="rm-sub">Cargando…</div></div></div></div>';
      var bSend = btn('Pedir', 'btn-danger', function () {
        var ids = (datos.recipients || []).filter(function (r) { return r.ok && !fuera[r.id]; }).map(function (r) { return r.id; });
        if (!ids.length) { alert('No hay a quién pedírselo por este canal.'); return; }
        bSend.disabled = true;
        postJson(ep('/comida/' + it.id + '/pedir'), { channel: canal, ids: ids }).then(function (r) {
          bSend.disabled = false;
          if (!(r && r.ok)) { alert((r && r.error) || 'No salió.'); return; }
          rmToast(r.message || 'Pedido.');
          if (r.failed && r.failed.length) alert('No le llegó a: ' + r.failed.join(', '));
          var i = bs('rmMenuReqModal'); if (i) i.hide();
          if (r.payload) apply({ ok: true, payload: r.payload });
        });
      });
      var m = openModal('rmMenuReqModal', 'modal-lg', 'Pedir que respondan el menú', h, [btn('Cerrar', 'btn-outline-secondary', function () { var i = bs('rmMenuReqModal'); if (i) i.hide(); }), bSend], 'fa-paper-plane');
      function pintaCanales() {
        var z = m.querySelector('[data-mr-channels]');
        z.innerHTML = [['SMS', 'Mensaje (SMS)', 'fa-comment-sms'], ['EMAIL', 'Correo', 'fa-envelope']].map(function (c) {
          return '<button type="button" class="btn btn-sm ' + (c[0] === canal ? 'btn-primary' : 'btn-outline-secondary') + '" data-mr-ch="' + c[0] + '"><i class="fa ' + c[2] + ' me-1"></i>' + c[1] + '</button>';
        }).join(' ') + (datos && canal === 'SMS' && datos.sms_ready === false ? '<span class="rm-sub text-danger">La pasarela de SMS no está configurada: usa el correo.</span>' : '');
        z.querySelectorAll('[data-mr-ch]').forEach(function (b) { b.addEventListener('click', function () { canal = b.getAttribute('data-mr-ch'); carga(); }); });
      }
      function pinta() {
        pintaCanales();
        var pp = m.querySelector('[data-mr-people]'), pv = m.querySelector('[data-mr-preview]');
        var rows = datos.recipients || [];
        if (!rows.length) { pp.innerHTML = '<div class="rm-sub">Ya han respondido todos.</div>'; }
        else pp.innerHTML = rows.map(function (r) {
          return '<label class="rm-result' + (r.ok ? (fuera[r.id] ? '' : ' is-on') : ' is-done') + '">' + (r.ok ? '<input type="checkbox" class="form-check-input me-1" data-mr-id="' + esc(r.id) + '"' + (fuera[r.id] ? '' : ' checked') + '>' : '<span class="rm-check"><i class="fa fa-ban"></i></span>') + avatar(r.photo, 'fa-user') + '<div class="flex-grow-1"><div>' + esc(r.name) + '</div>' + (r.ok ? '' : '<div class="rm-sub">' + esc(r.why) + '</div>') + '</div></label>';
        }).join('');
        pp.querySelectorAll('[data-mr-id]').forEach(function (c) { c.addEventListener('change', function () { fuera[c.getAttribute('data-mr-id')] = !c.checked; cuenta(); }); });
        if (canal === 'SMS') {
          var sm = datos.sms || {};
          pv.innerHTML = '<div class="rm-sms-preview">' + esc(datos.text || '') + '</div><div class="rm-sub mt-1">' + (sm.chars ? sm.chars + ' caracteres · ' : '') + (sm.segments ? sm.segments + (sm.segments === 1 ? ' SMS' : ' SMS por persona') : '') + ' · el enlace de cada uno es el suyo (acortado).</div>';
        } else {
          // ⚠️ El HTML del correo va por la PROPIEDAD `srcdoc` (con `esc()` en el atributo, la primera
          // comilla doble del HTML lo cortaba y el marco salía en blanco).
          pv.innerHTML = '<div class="rm-sub mb-1"><b>Asunto:</b> ' + esc(datos.subject || '') + '</div>';
          var marco = document.createElement('iframe'); marco.className = 'rm-mail-preview'; marco.setAttribute('sandbox', ''); marco.srcdoc = datos.html || '';
          pv.appendChild(marco);
        }
        cuenta();
      }
      function cuenta() {
        var n = (datos.recipients || []).filter(function (r) { return r.ok && !fuera[r.id]; }).length;
        bSend.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Pedir' + (n ? ' a ' + n : '');
        bSend.disabled = !n || (canal === 'SMS' && datos.sms_ready === false);
        var c = m.querySelector('[data-mr-count]'); if (c) c.textContent = datos.pending ? '· ' + datos.pending + ' sin responder' : '';
      }
      function carga() {
        postJson(ep('/comida/' + it.id + '/pedir/vista-previa'), { channel: canal }).then(function (r) {
          if (!(r && r.ok)) { m.querySelector('[data-mr-preview]').innerHTML = '<div class="text-danger small">' + esc((r && r.error) || 'No se pudo cargar.') + '</div>'; return; }
          datos = r; pinta();
        });
      }
      carga();
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
    function render() { if (tab === 'actividad') renderActividad(); else if (tab === 'agenda') renderAgenda(); else if (tab === 'logistica') renderLogistica(); else if (tab === 'comidas') renderComidas(); else if (tab === 'hoteles') renderHoteles(); else if (tab === 'repertorio') renderRepertorio(); else renderPersonal(); }
    // Por DELEGACIÓN: la pestaña Comidas aparece y desaparece sola (`ensureMealsTab`).
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-rm-tab]'); if (!b || !root.contains(b)) return; tab = b.getAttribute('data-rm-tab'); root.querySelectorAll('[data-rm-tab]').forEach(function (x) { x.classList.toggle('active', x === b); }); render(); });
    // FUERA DE LA APP la cabecera de la actividad va ARRIBA DEL TODO (la misma viñeta de «Evento»).
    var headBox = document.getElementById('rmHeader');
    if (headBox && ACTIVITY && HEADER_TOP) headBox.innerHTML = actHeadHtml();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
