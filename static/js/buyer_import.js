/* Importar COMPRADORES desde un fichero (Excel o CSV).
 *
 * Pasos: [artista/evento → actividad] → fichero → columnas → resumen → importar.
 * El fichero se lee UNA vez en el servidor (`/compradores/importar/analizar`) y sus filas viajan en
 * el JSON de aquí para adelante: así no hay que volver a subirlo en cada paso.
 *
 * ⚠️ Lo que NO se reconoce no se calla: la columna sale marcada en ámbar para decir qué es (o
 *    dejarla en «Omitir esta columna»).
 */
(function () {
  'use strict';

  function init(root) {
    if (!root || root.dataset.biReady === '1') return;
    root.dataset.biReady = '1';

    var urls = {
      analyze: root.dataset.urlAnalyze,
      prepare: root.dataset.urlPrepare,
      create: root.dataset.urlCreate,
      activities: root.dataset.urlActivities
    };
    var st = {
      event: root.dataset.scopeEvent || '',
      lista: root.dataset.scopeList || '',
      concert: '',
      concertLabel: '',
      subject: null,
      columns: [],
      rows: [],
      fields: [],
      ignore: '__ignore__',
      filename: ''
    };

    var q = function (sel) { return root.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
    var errBox = q('[data-bi-error]');

    function error(msg) {
      if (!errBox) return;
      if (!msg) { errBox.classList.add('d-none'); errBox.textContent = ''; return; }
      errBox.textContent = msg;
      errBox.classList.remove('d-none');
    }

    function step(name) {
      qa('[data-bi-step]').forEach(function (el) {
        el.classList.toggle('d-none', el.getAttribute('data-bi-step') !== name);
      });
      error('');
    }

    function post(url, payload) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida del servidor.' }; }); });
    }

    /* ---------- paso A: artista o evento ---------- */
    var buscador = q('[data-bi-subject-search]');
    if (buscador) {
      buscador.addEventListener('input', function () {
        var txt = (buscador.value || '').trim().toLowerCase();
        qa('.js-bi-subject').forEach(function (el) {
          var extra = el.getAttribute('data-bi-extra') === '1';
          var casa = !txt || (el.getAttribute('data-search') || '').indexOf(txt) >= 0;
          el.classList.toggle('d-none', !casa || (extra && !txt && !verMas));
        });
      });
    }
    var verMas = false;
    var btnMas = q('[data-bi-more-subjects]');
    if (btnMas) {
      btnMas.addEventListener('click', function () {
        verMas = true;
        btnMas.classList.add('d-none');
        qa('.js-bi-subject[data-bi-extra="1"]').forEach(function (el) { el.classList.remove('d-none'); });
      });
    }
    root.addEventListener('change', function (ev) {
      var radio = ev.target.closest('input[name="bi_subject"]');
      if (!radio) return;
      st.subject = { id: radio.value, kind: radio.getAttribute('data-kind') || 'ARTIST', name: radio.getAttribute('data-name') || '' };
      cargarActividades();
    });

    function cargarActividades() {
      if (!st.subject) return;
      var zona = q('[data-bi-activities]');
      var deQuien = q('[data-bi-activity-of]');
      if (deQuien) deQuien.textContent = 'De ' + st.subject.name;
      if (zona) zona.innerHTML = '<div class="text-muted small py-3"><i class="fa fa-spinner fa-spin me-1"></i>Buscando sus actividades…</div>';
      step('activity');
      fetch(urls.activities + '?kind=' + encodeURIComponent(st.subject.kind) + '&id=' + encodeURIComponent(st.subject.id))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!zona) return;
          if (!data.ok || !(data.activities || []).length) {
            zona.innerHTML = '<div class="alert alert-warning mb-0">Ese ' +
              (st.subject.kind === 'EVENT' ? 'evento' : 'artista') +
              ' no tiene ninguna actividad dada de alta.</div>';
            return;
          }
          zona.innerHTML = '';
          data.activities.forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'bi-act';
            b.innerHTML = '<i class="fa ' + (a.icon || 'fa-calendar-day') + ' bi-act__ico"></i>' +
              '<span class="bi-act__body"><span class="bi-act__t">' + esc(a.label) + '</span>' +
              '<span class="bi-act__s">' + esc(a.date) + (a.venue ? ' · ' + esc(a.venue) : '') +
              (a.town ? ' (' + esc(a.town) + ')' : '') + '</span></span>' +
              (a.has_list ? '<span class="badge text-bg-light border"><i class="fa fa-file-import me-1"></i>Ya tiene listado</span>' :
                (a.has_et ? '<span class="badge text-bg-light border"><i class="fa fa-plug me-1"></i>Enterticket</span>' : ''));
            b.addEventListener('click', function () {
              st.concert = a.id;
              st.concertLabel = a.label + ' · ' + a.date;
              st.event = '';
              st.lista = '';
              pintaDestino();
              step('file');
            });
            zona.appendChild(b);
          });
        })
        .catch(function () {
          if (zona) zona.innerHTML = '<div class="alert alert-danger mb-0">No se pudieron cargar sus actividades.</div>';
        });
    }

    function esc(t) {
      return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function pintaDestino() {
      var caja = q('[data-bi-target]');
      if (!caja) return;
      var texto = '';
      if (st.event || st.lista) texto = 'Se añaden al listado <strong>' + esc(root.dataset.scopeLabel || '') + '</strong>.';
      else if (st.concert) texto = 'Se creará el listado de <strong>' + esc(st.concertLabel) + '</strong>.';
      caja.innerHTML = texto;
      caja.classList.toggle('d-none', !texto);
      var atras = q('[data-bi-back="activity"]');
      if (atras) atras.classList.toggle('d-none', !st.concert);
    }

    /* ---------- paso 1: el fichero ---------- */
    var input = q('#buyerImportFile');
    var btnLeer = q('[data-bi-analyze]');
    if (input) {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        var nombre = q('[data-bi-filename]');
        if (nombre) nombre.textContent = f ? f.name : '';
        if (btnLeer) btnLeer.disabled = !f;
      });
    }
    if (btnLeer) {
      btnLeer.addEventListener('click', function () {
        var f = input && input.files && input.files[0];
        if (!f) return;
        var fd = new FormData();
        fd.append('file', f);
        btnLeer.disabled = true;
        error('');
        fetch(urls.analyze, { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            btnLeer.disabled = false;
            if (!data.ok) { error(data.error || 'No se pudo leer el fichero.'); return; }
            st.columns = data.columns || [];
            st.rows = data.rows || [];
            st.fields = data.fields || [];
            st.ignore = data.ignore || '__ignore__';
            st.filename = data.filename || '';
            pintaColumnas(data.sheet_rows || st.rows.length);
            step('columns');
          })
          .catch(function () { btnLeer.disabled = false; error('No se pudo leer el fichero.'); });
      });
    }

    /* ---------- paso 2: las columnas ---------- */
    function pintaColumnas(nFilas) {
      var tbody = q('[data-bi-cols]');
      if (!tbody) return;
      tbody.innerHTML = '';
      var sinReconocer = 0;
      st.columns.forEach(function (c) {
        if (!c.field) sinReconocer++;
        var tr = document.createElement('tr');
        if (!c.field) tr.className = 'pi-row--unknown';
        var opciones = ['<option value="' + st.ignore + '">Omitir esta columna</option>'];
        st.fields.forEach(function (f) {
          opciones.push('<option value="' + esc(f.key) + '"' + (f.key === c.field ? ' selected' : '') + '>' + esc(f.label) + '</option>');
        });
        tr.innerHTML =
          '<td class="small fw-semibold">' + esc(c.header) + '</td>' +
          '<td class="small text-muted">' + esc((c.samples || [])[0] || '—') + '</td>' +
          '<td><select class="form-select form-select-sm" data-bi-col="' + c.index + '">' + opciones.join('') + '</select></td>';
        tbody.appendChild(tr);
      });
      var aviso = q('[data-bi-unknown]');
      if (aviso) {
        if (sinReconocer) {
          aviso.innerHTML = '<i class="fa fa-triangle-exclamation me-1"></i>Hay <strong>' + sinReconocer +
            '</strong> columna(s) que no hemos reconocido (en ámbar): di qué son o déjalas en «Omitir esta columna».';
          aviso.classList.remove('d-none');
        } else {
          aviso.classList.add('d-none');
        }
      }
      var sub = q('[data-bi-subtitle]');
      if (sub) sub.textContent = st.filename + ' · ' + nFilas + ' fila(s) con datos';
    }

    function mapeo() {
      var out = {};
      qa('[data-bi-col]').forEach(function (sel) {
        out[sel.getAttribute('data-bi-col')] = { field: sel.value };
      });
      return out;
    }

    function payload(extra) {
      var base = { rows: st.rows, mapping: mapeo(), event: st.event, lista: st.lista, concert_id: st.concert };
      return Object.assign(base, extra || {});
    }

    var btnPrep = q('[data-bi-prepare]');
    if (btnPrep) {
      btnPrep.addEventListener('click', function () {
        btnPrep.disabled = true;
        post(urls.prepare, payload()).then(function (data) {
          btnPrep.disabled = false;
          if (!data.ok) { error(data.error || 'No se pudo preparar la importación.'); return; }
          pintaResumen(data.resumen || {});
          step('summary');
        }).catch(function () { btnPrep.disabled = false; error('No se pudo preparar la importación.'); });
      });
    }

    /* ---------- paso 3: el resumen ---------- */
    function pintaResumen(r) {
      var total = q('[data-bi-total]');
      if (total) {
        total.innerHTML = 'El fichero trae <strong>' + (r.total || 0) + '</strong> comprador(es): <strong>' +
          (r.nuevos || 0) + '</strong> nuevo(s) y <strong>' + (r.existentes || 0) + '</strong> que ya tenemos' +
          (r.completar ? ' (a <strong>' + r.completar + '</strong> se les completa algún dato)' : '') + '.';
      }
      var cn = q('[data-bi-count-new]'); if (cn) cn.textContent = r.nuevos || 0;
      var ce = q('[data-bi-count-existing]'); if (ce) ce.textContent = r.existentes || 0;
      lista(q('[data-bi-list-new]'), r.nuevos_muestra || [], false);
      lista(q('[data-bi-list-existing]'), r.existentes_muestra || [], true);
      var om = q('[data-bi-skipped]');
      if (om) {
        if (r.sin_contacto) {
          om.innerHTML = '<i class="fa fa-circle-info me-1"></i><strong>' + r.sin_contacto +
            '</strong> fila(s) se descartan porque no traen ni email ni teléfono: sin uno de los dos no hay a quién escribirle.';
          om.classList.remove('d-none');
        } else { om.classList.add('d-none'); }
      }
    }

    function lista(zona, filas, conFalta) {
      if (!zona) return;
      if (!filas.length) { zona.innerHTML = '<div class="text-muted small">—</div>'; return; }
      zona.innerHTML = filas.map(function (f) {
        var cats = (f.cats || []).length ? ' <span class="text-muted">· ' + esc((f.cats || []).join(', ')) + '</span>' : '';
        var falta = (conFalta && (f.falta || []).length) ?
          ' <span class="badge text-bg-warning text-dark">se le añade: ' + esc((f.falta || []).join(', ')) + '</span>' : '';
        var nuevo = (conFalta && f.nuevo_en_listado) ? ' <span class="badge text-bg-light border">nuevo en el listado</span>' : '';
        return '<div class="pi-list__row">' + esc(f.name || f.email || f.phone || '—') +
          ' <span class="text-muted small">' + esc(f.email || f.phone || '') + '</span>' +
          cats + falta + nuevo + '</div>';
      }).join('');
    }

    var btnCrear = q('[data-bi-create]');
    if (btnCrear) {
      btnCrear.addEventListener('click', function () {
        btnCrear.disabled = true;
        btnCrear.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Importando…';
        post(urls.create, payload()).then(function (data) {
          btnCrear.disabled = false;
          btnCrear.innerHTML = '<i class="fa fa-cloud-arrow-up me-1"></i>Importar';
          if (!data.ok) { error(data.error || 'No se pudo importar.'); return; }
          var res = data.resultado || {};
          var txt = q('[data-bi-done-text]');
          if (txt) {
            txt.innerHTML = '<strong>' + (res.creados || 0) + '</strong> nuevo(s), <strong>' +
              (res.completados || 0) + '</strong> con datos completados y <strong>' +
              (res.actualizados || 0) + '</strong> ya estaban en el listado.';
          }
          var link = q('[data-bi-done-link]');
          if (link && data.url) link.setAttribute('href', data.url);
          step('done');
        }).catch(function () {
          btnCrear.disabled = false;
          btnCrear.innerHTML = '<i class="fa fa-cloud-arrow-up me-1"></i>Importar';
          error('No se pudo importar.');
        });
      });
    }

    qa('[data-bi-back]').forEach(function (b) {
      b.addEventListener('click', function () { step(b.getAttribute('data-bi-back')); });
    });

    /* ---------- de dónde se abre ---------- */
    // ⚠️ El primer paso se decide EN EL CLIC del botón que abre el modal (`data-bi-scope`), no en
    // `shown.bs.modal`: con modal_stack.js por medio ese evento no siempre llega.
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-bs-target="#buyerImportModal"]');
      if (!t) return;
      var scope = t.getAttribute('data-bi-scope') || '';
      if (scope === 'new' || !scope) {
        st.event = ''; st.lista = ''; st.concert = ''; st.concertLabel = '';
        st.subject = null;
        pintaDestino();
        step('subject');
      } else {
        st.concert = '';
        st.event = scope.indexOf('event:') === 0 ? scope.slice(6) : '';
        st.lista = scope.indexOf('lista:') === 0 ? scope.slice(6) : '';
        pintaDestino();
        step('file');
      }
    }, true);
  }

  function boot() {
    document.querySelectorAll('[data-buyer-import]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
