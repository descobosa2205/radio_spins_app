/* Alta rápida de entidades (recinto, tercero, ticketera, editorial, artista) desde cualquier
   formulario, en un modal superpuesto, dejándola seleccionada sin recargar ni salir del formulario.

   Uso en una plantilla, junto a un <select id="mi_select">:
     <button type="button" class="btn btn-outline-secondary qc-open"
             data-quick-create="promoter" data-target="mi_select"><i class="fa fa-plus"></i></button>
*/
(function () {
  'use strict';
  var currentTargetId = null;

  function feedback(form, html) {
    var f = form.querySelector('.qc-feedback');
    if (f) f.innerHTML = html || '';
  }

  function selectInTarget(targetId, id, label) {
    var sel = document.getElementById(targetId);
    if (!sel || !id) return;
    if (sel.tagName === 'SELECT') {
      var opt = sel.querySelector('option[value="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!opt) {
        opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        sel.appendChild(opt);
      } else {
        opt.textContent = label;
      }
      sel.value = id;
      if (window.jQuery && jQuery.fn.select2 && jQuery(sel).hasClass('select2-hidden-accessible')) {
        jQuery(sel).trigger('change');
      } else {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      // input de texto (+ hidden opcional indicado en data-target-hidden del botón)
      sel.value = label;
    }
  }

  function submitForm(form, force) {
    var modalEl = form.closest('.modal');
    var endpoint = form.getAttribute('data-qc-endpoint');
    var asJson = form.getAttribute('data-qc-json') === '1';
    var btn = form.querySelector('button[type="submit"]');
    var targetId = currentTargetId;
    var opts;
    if (asJson) {
      var payload = {};
      form.querySelectorAll('[name]').forEach(function (i) { payload[i.name] = i.value; });
      if (force) payload.force_new = true;
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    } else {
      var fd = new FormData(form);
      if (force) fd.set('force_new', '1');
      opts = { method: 'POST', body: fd };
    }
    if (btn) btn.disabled = true;
    fetch(endpoint, opts)
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btn) btn.disabled = false;
        var data = res.data || {};
        if (res.status === 409 && data.similar) {
          var html = '<div class="alert alert-warning py-2 mb-2">' + (data.error || 'Parece que ya existe algo similar.') + '</div>';
          data.similar.forEach(function (s) {
            var lbl = (s.label || '').replace(/"/g, '&quot;');
            html += '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1 qc-use" data-id="' + s.id + '" data-label="' + lbl + '">Usar: ' + (s.label || '') + '</button>';
          });
          html += '<button type="button" class="btn btn-sm btn-primary mb-1 qc-force">Crear igualmente</button>';
          feedback(form, html);
          return;
        }
        if (!res.ok) {
          feedback(form, '<div class="alert alert-danger py-2 mb-0">' + (data.error || 'No se pudo crear.') + '</div>');
          return;
        }
        var label = data.label || data.text || data.name || data.nick || '';
        selectInTarget(targetId, data.id, label);
        if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl).hide();
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        feedback(form, '<div class="alert alert-danger py-2 mb-0">Error de red al crear.</div>');
      });
  }

  // Abrir el modal del tipo indicado
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quick-create]');
    if (!btn) return;
    e.preventDefault();
    var type = btn.getAttribute('data-quick-create');
    currentTargetId = btn.getAttribute('data-target');
    var modalEl = document.getElementById('qcModal-' + type);
    if (!modalEl || !window.bootstrap) return;
    var form = modalEl.querySelector('.qc-form');
    if (form) { form.reset(); feedback(form, ''); }
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    var first = modalEl.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 300);
  });

  // Enviar el formulario de creación
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('.qc-form');
    if (!form) return;
    e.preventDefault();
    submitForm(form, false);
  });

  // Acciones del aviso de "ya existe algo similar"
  document.addEventListener('click', function (e) {
    var use = e.target.closest('.qc-use');
    if (use) {
      e.preventDefault();
      selectInTarget(currentTargetId, use.getAttribute('data-id'), use.getAttribute('data-label'));
      var m = use.closest('.modal');
      if (m && window.bootstrap) bootstrap.Modal.getInstance(m).hide();
      return;
    }
    var force = e.target.closest('.qc-force');
    if (force) {
      e.preventDefault();
      var form = force.closest('.qc-form');
      if (form) submitForm(form, true);
    }
  });
})();
