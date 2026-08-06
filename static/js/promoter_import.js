/* Importar TERCEROS desde un Excel o un CSV (modal de /promotores).
 *
 * Cuatro pasos: fichero → columnas → resumen → fusionar los que ya existían, uno a uno, en
 * pantalla partida. El fichero se lee UNA vez (analizar) y a partir de ahí todo va en JSON: así
 * no hay que volver a subirlo en cada paso.
 *
 * Reglas de la casa que se respetan aquí:
 * - Una columna que no se reconoce NO se pierde: se pregunta a qué campo va y, si no es ninguno,
 *   se puede guardar como «dato extra» con el nombre de la columna.
 * - «Conservar los dos» pide NOMBRE a los dos valores (el ejemplo de Dani: «casa de Madrid» y
 *   «casa de Cádiz») y deja elegir cuál se queda en la ficha.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-promoter-import]');
  if (!root) return;

  var FIELDS = [];
  try { FIELDS = JSON.parse(document.getElementById('promoterImportFields').textContent || '[]'); }
  catch (e) { FIELDS = []; }
  var LABELS = {};
  FIELDS.forEach(function (f) { LABELS[f.key] = f.label; });

  var IGNORE = root.getAttribute('data-target-ignore') || '__ignore__';
  var ALT = root.getAttribute('data-target-alt') || '__alt__';

  var state = { columns: [], rows: [], newRows: [], existing: [], idx: 0 };

  var el = {
    file: document.getElementById('promoterImportFile'),
    filename: root.querySelector('[data-pi-filename]'),
    error: root.querySelector('[data-pi-error]'),
    subtitle: root.querySelector('[data-pi-subtitle]'),
    cols: root.querySelector('[data-pi-cols]'),
    unknown: root.querySelector('[data-pi-unknown]'),
    listNew: root.querySelector('[data-pi-list-new]'),
    listExisting: root.querySelector('[data-pi-list-existing]'),
    countNew: root.querySelector('[data-pi-count-new]'),
    countExisting: root.querySelector('[data-pi-count-existing]'),
    created: root.querySelector('[data-pi-created]'),
    skipped: root.querySelector('[data-pi-skipped]'),
    mergeFields: root.querySelector('[data-pi-merge-fields]'),
    mergeName: root.querySelector('[data-pi-merge-name]'),
    mergeReason: root.querySelector('[data-pi-merge-reason]'),
    mergeLogo: root.querySelector('[data-pi-merge-logo]'),
    mergePos: root.querySelector('[data-pi-merge-pos]'),
    mergeAlt: root.querySelector('[data-pi-merge-alt]')
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function step(name) {
    root.querySelectorAll('[data-pi-step]').forEach(function (s) {
      s.classList.toggle('d-none', s.getAttribute('data-pi-step') !== name);
    });
  }

  function showError(msg) {
    if (!el.error) return;
    el.error.textContent = msg || '';
    el.error.classList.toggle('d-none', !msg);
  }

  function busy(btn, on, texto) {
    if (!btn) return;
    if (on) {
      btn.dataset.piHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' + (texto || 'Un momento…');
    } else {
      btn.disabled = false;
      if (btn.dataset.piHtml) btn.innerHTML = btn.dataset.piHtml;
    }
  }

  function post(url, body, isJson) {
    var opts = { method: 'POST' };
    if (isJson) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    } else {
      opts.body = body;
    }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Respuesta inesperada del servidor.' }; });
    });
  }

  /* ---------------- paso 1: el fichero ---------------- */
  if (el.file) {
    el.file.addEventListener('change', function () {
      var f = el.file.files && el.file.files[0];
      if (el.filename) el.filename.textContent = f ? f.name : '';
      var btn = root.querySelector('[data-pi-analyze]');
      if (btn) btn.disabled = !f;
      showError('');
    });
  }

  root.addEventListener('click', function (ev) {
    var back = ev.target.closest('[data-pi-back]');
    if (back) { step(back.getAttribute('data-pi-back')); showError(''); return; }

    var analyze = ev.target.closest('[data-pi-analyze]');
    if (analyze) {
      var f = el.file && el.file.files && el.file.files[0];
      if (!f) return;
      var fd = new FormData();
      fd.append('file', f);
      busy(analyze, true, 'Leyendo…');
      post(root.getAttribute('data-url-analyze'), fd, false).then(function (res) {
        busy(analyze, false);
        if (!res.ok) return showError(res.error || 'No se pudo leer el fichero.');
        state.columns = res.columns || [];
        state.rows = res.rows || [];
        if (el.subtitle) {
          el.subtitle.textContent = res.filename + ' · ' + res.count + ' fila(s) · ' +
            state.columns.length + ' columna(s)';
        }
        renderColumns(res.unknown || 0);
        step('columns');
      });
      return;
    }

    var prepare = ev.target.closest('[data-pi-prepare]');
    if (prepare) {
      busy(prepare, true, 'Comprobando…');
      post(root.getAttribute('data-url-prepare'), { rows: state.rows, mapping: collectMapping() }, true)
        .then(function (res) {
          busy(prepare, false);
          if (!res.ok) return showError(res.error || 'No se pudo preparar la importación.');
          state.newRows = res.new || [];
          state.existing = res.existing || [];
          state.idx = 0;
          renderSummary(res);
          step('summary');
        });
      return;
    }

    var create = ev.target.closest('[data-pi-create]');
    if (create) {
      if (!state.newRows.length) return;
      busy(create, true, 'Creando…');
      post(root.getAttribute('data-url-create'), { rows: state.newRows }, true).then(function (res) {
        busy(create, false);
        if (!res.ok) return showError(res.error || 'No se pudieron crear los terceros.');
        var n = (res.created || []).length;
        state.newRows = [];
        if (el.created) {
          el.created.innerHTML = '<span class="text-success fw-semibold">' + n + ' tercero(s) creado(s).</span>' +
            ((res.errors || []).length
              ? '<div class="text-danger mt-1">' + (res.errors || []).map(esc).join('<br>') + '</div>' : '');
        }
        if (el.countNew) el.countNew.textContent = '0';
        if (el.listNew) el.listNew.innerHTML = '<div class="text-muted small">Ya están dados de alta.</div>';
        create.classList.add('d-none');
      });
      return;
    }

    var review = ev.target.closest('[data-pi-review]');
    if (review) {
      if (!state.existing.length) return showError('No hay ninguno que ya existiera.');
      state.idx = 0;
      renderMerge();
      step('merge');
      return;
    }

    if (ev.target.closest('[data-pi-finish]')) { location.reload(); return; }

    if (ev.target.closest('[data-pi-merge-prev]')) {
      if (state.idx > 0) { state.idx--; renderMerge(); }
      return;
    }
    if (ev.target.closest('[data-pi-merge-skip]')) { nextMerge(); return; }

    var save = ev.target.closest('[data-pi-merge-save]');
    if (save) {
      var item = state.existing[state.idx];
      if (!item) return;
      var url = (root.getAttribute('data-url-merge') || '').replace('__PID__', item.promoter.id);
      busy(save, true, 'Guardando…');
      post(url, { decisions: collectDecisions(), values: item.values, alt: item.alt || [] }, true)
        .then(function (res) {
          busy(save, false);
          if (!res.ok) return showError(res.error || 'No se pudo actualizar.');
          nextMerge();
        });
      return;
    }
  });

  /* ---------------- paso 2: las columnas ---------------- */
  function fieldSelect(col) {
    var opts = ['<option value="' + IGNORE + '">— No importar —</option>'];
    FIELDS.forEach(function (f) {
      opts.push('<option value="' + esc(f.key) + '"' + (col.field === f.key ? ' selected' : '') + '>' +
        esc(f.label) + '</option>');
    });
    opts.push('<option value="' + ALT + '">Guardar como dato extra («' + esc(col.header) + '»)</option>');
    return '<select class="form-select form-select-sm" data-pi-col="' + col.index + '">' + opts.join('') + '</select>';
  }

  function renderColumns(unknown) {
    if (!el.cols) return;
    el.cols.innerHTML = state.columns.map(function (col) {
      return '<tr' + (col.field ? '' : ' class="pi-row--unknown"') + '>' +
        '<td class="fw-semibold">' + esc(col.header) +
          (col.auto ? ' <span class="badge text-bg-light text-muted ms-1">detectada</span>' : '') + '</td>' +
        '<td class="small text-muted">' + (col.samples || []).map(esc).join('<br>') + '</td>' +
        '<td>' + fieldSelect(col) + '</td>' +
      '</tr>';
    }).join('');
    if (el.unknown) {
      el.unknown.classList.toggle('d-none', !unknown);
      el.unknown.innerHTML = unknown
        ? '<i class="fa fa-triangle-exclamation me-1"></i>Hay <strong>' + unknown + '</strong> columna(s) que no ' +
          'hemos sabido a qué campo van. Dinos a cuál corresponden, guárdalas como dato extra o déjalas fuera.'
        : '';
    }
  }

  function collectMapping() {
    var mapping = {};
    root.querySelectorAll('[data-pi-col]').forEach(function (sel) {
      var idx = sel.getAttribute('data-pi-col');
      var col = state.columns.filter(function (c) { return String(c.index) === String(idx); })[0] || {};
      mapping[idx] = { field: sel.value, label: col.header || '' };
    });
    return mapping;
  }

  /* ---------------- paso 3: el resumen ---------------- */
  function renderSummary(res) {
    if (el.countNew) el.countNew.textContent = (res.counts || {}).new || 0;
    if (el.countExisting) el.countExisting.textContent = (res.counts || {}).existing || 0;
    if (el.created) el.created.innerHTML = '';
    var crear = root.querySelector('[data-pi-create]');
    if (crear) crear.classList.toggle('d-none', !state.newRows.length);
    var revisar = root.querySelector('[data-pi-review]');
    if (revisar) revisar.classList.toggle('d-none', !state.existing.length);

    if (el.listNew) {
      el.listNew.innerHTML = state.newRows.length
        ? state.newRows.slice(0, 40).map(function (r) {
            return '<div class="pi-list__row"><span class="fw-semibold">' + esc(r.nick) + '</span>' +
              (r.values.tax_id ? ' <span class="text-muted small">' + esc(r.values.tax_id) + '</span>' : '') + '</div>';
          }).join('') + (state.newRows.length > 40 ? '<div class="text-muted small">y ' + (state.newRows.length - 40) + ' más…</div>' : '')
        : '<div class="text-muted small">Ninguno: todos los del fichero ya estaban.</div>';
    }
    if (el.listExisting) {
      el.listExisting.innerHTML = state.existing.length
        ? state.existing.slice(0, 40).map(function (r) {
            return '<div class="pi-list__row"><span class="fw-semibold">' + esc(r.promoter.nick) + '</span>' +
              ' <span class="text-muted small">' + esc(r.match_reason) + '</span>' +
              (r.diff ? ' <span class="badge text-bg-warning text-dark">' + r.diff + ' cambio(s)</span>'
                      : ' <span class="badge text-bg-light text-muted">sin cambios</span>') + '</div>';
          }).join('') + (state.existing.length > 40 ? '<div class="text-muted small">y ' + (state.existing.length - 40) + ' más…</div>' : '')
        : '<div class="text-muted small">Ninguno.</div>';
    }
    if (el.skipped) {
      var n = (res.counts || {}).skipped || 0;
      el.skipped.classList.toggle('d-none', !n);
      el.skipped.textContent = n ? n + ' fila(s) sin nombre ni DNI/NIF: no se pueden dar de alta.' : '';
    }
  }

  /* ---------------- paso 4: pantalla partida ---------------- */
  function fieldRow(f) {
    var sugerido = f.key === 'address' || f.key === 'fiscal_address' ? 'p. ej. casa de Madrid' : 'ponle un nombre';
    return '' +
      '<div class="pi-field' + (f.same ? ' pi-field--same' : '') + '" data-pi-field="' + esc(f.key) + '">' +
        '<div class="pi-field__label">' + esc(f.label) +
          (f.same ? ' <span class="badge text-bg-light text-muted">igual</span>' : '') + '</div>' +
        '<div class="pi-field__cols">' +
          '<label class="pi-opt' + (f.same ? ' is-on' : ' is-on') + '">' +
            '<input type="radio" name="pi_' + esc(f.key) + '" value="current" checked>' +
            '<span class="pi-opt__val">' + (f.current ? esc(f.current) : '<em class="text-muted">vacío</em>') + '</span>' +
          '</label>' +
          '<label class="pi-opt">' +
            '<input type="radio" name="pi_' + esc(f.key) + '" value="incoming"' + (f.current ? '' : ' checked') + '>' +
            '<span class="pi-opt__val">' + esc(f.incoming) + '</span>' +
          '</label>' +
        '</div>' +
        (f.same || !f.current ? '' :
          '<label class="pi-both">' +
            '<input type="radio" name="pi_' + esc(f.key) + '" value="both">' +
            '<span>Conservar los dos</span>' +
          '</label>' +
          '<div class="pi-both__names d-none" data-pi-both>' +
            '<div class="row g-2">' +
              '<div class="col-12 col-md-6">' +
                '<input class="form-control form-control-sm" data-pi-label-current placeholder="Nombre del actual (' + esc(sugerido) + ')">' +
              '</div>' +
              '<div class="col-12 col-md-6">' +
                '<input class="form-control form-control-sm" data-pi-label-incoming placeholder="Nombre del nuevo (' + esc(sugerido) + ')">' +
              '</div>' +
              '<div class="col-12 small">' +
                '<label class="me-3"><input type="radio" name="pi_prim_' + esc(f.key) + '" value="current" checked> El que se queda en la ficha es el <strong>actual</strong></label>' +
                '<label><input type="radio" name="pi_prim_' + esc(f.key) + '" value="incoming"> el <strong>nuevo</strong></label>' +
              '</div>' +
            '</div>' +
          '</div>') +
      '</div>';
  }

  function renderMerge() {
    var item = state.existing[state.idx];
    if (!item) return;
    if (el.mergeName) el.mergeName.textContent = item.promoter.nick || item.promoter.name || '';
    if (el.mergeReason) el.mergeReason.textContent = 'Ya estaba ' + (item.match_reason || '');
    if (el.mergeLogo) {
      el.mergeLogo.src = item.promoter.logo_url || '/static/img/placeholder_photo.png';
    }
    if (el.mergePos) el.mergePos.textContent = (state.idx + 1) + ' de ' + state.existing.length;
    if (el.mergeFields) {
      var conCambio = (item.fields || []).filter(function (f) { return !f.same; });
      var iguales = (item.fields || []).filter(function (f) { return f.same; });
      el.mergeFields.innerHTML = conCambio.map(fieldRow).join('') +
        (iguales.length ? '<div class="text-muted small mt-2">' + iguales.length +
          ' campo(s) llegan igual que los que tenemos: no hay nada que decidir.</div>' : '') +
        (conCambio.length ? '' : '<div class="alert alert-light border small m-0">Este tercero no trae ningún cambio.</div>');
    }
    if (el.mergeAlt) {
      var alt = item.alt || [];
      el.mergeAlt.classList.toggle('d-none', !alt.length);
      el.mergeAlt.innerHTML = alt.length
        ? '<i class="fa fa-plus-circle me-1"></i>Se guardarán como datos extra: ' +
          alt.map(function (a) { return '<strong>' + esc(a.label) + '</strong>: ' + esc(a.value); }).join(' · ')
        : '';
    }
    var prev = root.querySelector('[data-pi-merge-prev]');
    if (prev) prev.disabled = state.idx === 0;
  }

  function nextMerge() {
    if (state.idx + 1 < state.existing.length) {
      state.idx++;
      renderMerge();
    } else {
      step('summary');
      if (el.listExisting) {
        el.listExisting.innerHTML = '<div class="text-success small fw-semibold">Revisados los ' +
          state.existing.length + '.</div>';
      }
      var revisar = root.querySelector('[data-pi-review]');
      if (revisar) revisar.classList.add('d-none');
    }
  }

  // «Conservar los dos» despliega los nombres.
  root.addEventListener('change', function (ev) {
    var radio = ev.target.closest('input[type="radio"]');
    if (!radio || !/^pi_/.test(radio.name || '')) return;
    var box = radio.closest('[data-pi-field]');
    if (!box) return;
    var names = box.querySelector('[data-pi-both]');
    if (names) names.classList.toggle('d-none', radio.value !== 'both');
    box.querySelectorAll('.pi-opt').forEach(function (opt) {
      var input = opt.querySelector('input');
      opt.classList.toggle('is-on', !!(input && input.checked));
    });
  });

  function collectDecisions() {
    var out = {};
    root.querySelectorAll('[data-pi-field]').forEach(function (box) {
      var key = box.getAttribute('data-pi-field');
      var sel = box.querySelector('input[type="radio"]:checked');
      if (!sel) return;
      var d = { choice: sel.value };
      if (sel.value === 'both') {
        var prim = box.querySelector('input[name="pi_prim_' + key + '"]:checked');
        d.primary = prim ? prim.value : 'current';
        var lc = box.querySelector('[data-pi-label-current]');
        var li = box.querySelector('[data-pi-label-incoming]');
        d.label_current = lc ? lc.value : '';
        d.label_incoming = li ? li.value : '';
      }
      out[key] = d;
    });
    return out;
  }
})();
