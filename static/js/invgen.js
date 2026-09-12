/* GENERACIÓN DE INVITACIONES · la pantalla de una actividad (templates/invitaciones_generar.html).
   Dos cosas: (1) la VISTA PREVIA de la entrada, que es el PDF de muestra pintado con PDF.js en una
   miniatura; (2) el ASISTENTE de los datos de la entrada (_invgen_config_modal.html): los extras
   (chips del catálogo + extras nuevos con su icono), la imagen (elegir o subir, con vista previa), las
   condiciones (cargar una plantilla, editar cláusulas, reordenar, guardar como plantilla nueva) y la
   pregunta de ALCANCE cuando se cambia una plantilla («¿solo este evento o la plantilla también?»).
   Todo por delegación dentro del formulario; los pasos los mueve step_wizard.js. */
(function () {
  'use strict';

  /* ------------------------------------------------------------ vista previa (PDF.js) */
  function renderPreview() {
    var box = document.querySelector('[data-invgen-preview]');
    if (!box) return;
    var url = box.getAttribute('data-pdf-url');
    var canvasHost = box.querySelector('.invgen-preview__canvas');
    var PDFJS = window.pdfjsLib;
    if (!url || !canvasHost) return;
    if (!PDFJS) {
      canvasHost.innerHTML = '<iframe src="' + url + '#toolbar=0&navpanes=0&view=FitH" title="Vista previa de la entrada" class="invgen-preview__frame"></iframe>';
      return;
    }
    if (PDFJS.GlobalWorkerOptions) {
      PDFJS.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    PDFJS.getDocument({ url: url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now() }).promise
      .then(function (pdf) { return pdf.getPage(1); })
      .then(function (page) {
        var width = Math.max(Math.min(canvasHost.clientWidth || 380, 520), 200);
        var vp1 = page.getViewport({ scale: 1 });
        var scale = width / vp1.width;
        var vp = page.getViewport({ scale: scale });
        var ratio = window.devicePixelRatio || 1;
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * ratio);
        canvas.height = Math.floor(vp.height * ratio);
        canvas.style.width = Math.floor(vp.width) + 'px';
        canvas.style.height = Math.floor(vp.height) + 'px';
        canvasHost.innerHTML = '';
        canvasHost.appendChild(canvas);
        return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp,
                             transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
      })
      .catch(function () {
        canvasHost.innerHTML = '<div class="text-muted small p-3"><i class="fa fa-file-pdf me-1"></i>Abrir el PDF de muestra</div>';
      });
  }

  /* ------------------------------------------------------------ asistente */
  function initWizard() {
    var form = document.querySelector('[data-invgen-form]');
    if (!form) return;

    /* --- la cabecera con un icono por paso sigue al paso activo (step_wizard no avisa: se mira) --- */
    var stepIcons = form.querySelectorAll('[data-invgen-steps] li');
    function syncSteps() {
      var act = form.querySelector('.sw-step.active');
      var n = act ? parseInt(act.getAttribute('data-step'), 10) : 1;
      stepIcons.forEach(function (li) {
        var k = parseInt(li.getAttribute('data-for'), 10);
        li.classList.toggle('is-active', k === n);
        li.classList.toggle('is-done', k < n);
      });
      if (n === 6) { buildSummary(); askScopeIfNeeded(); }
    }
    var mo = new MutationObserver(function () { syncSteps(); });
    form.querySelectorAll('.sw-step').forEach(function (s) { mo.observe(s, { attributes: true, attributeFilter: ['class'] }); });
    syncSteps();

    /* --- EXTRAS --- */
    var extrasBox = form.querySelector('[data-invgen-extras]');
    var extraTpl = form.querySelector('[data-invgen-extra-tpl]');
    var presetsBox = form.querySelector('[data-invgen-presets]');
    var emptyMsg = form.querySelector('[data-invgen-extras-empty]');
    var newBox = form.querySelector('[data-invgen-new]');
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
    function extraRows() { return Array.prototype.slice.call(extrasBox.querySelectorAll('[data-invgen-extra]')); }
    function refreshExtras() {
      var rows = extraRows();
      if (emptyMsg) emptyMsg.classList.toggle('d-none', rows.length > 0);
      var active = {};
      rows.forEach(function (r) {
        var pid = r.querySelector('input[name="extra_preset_id[]"]').value;
        var nm = norm(r.querySelector('input[name="extra_name[]"]').value);
        if (pid) active['p:' + pid] = true;
        active['n:' + nm] = true;
      });
      presetsBox.querySelectorAll('.invgen-preset[data-preset-id]').forEach(function (b) {
        b.classList.toggle('is-on', !!(active['p:' + b.getAttribute('data-preset-id')] || active['n:' + norm(b.getAttribute('data-name'))]));
      });
    }
    function addExtra(opts) {
      if (!extraTpl) return;
      var exists = extraRows().some(function (r) {
        var pid = r.querySelector('input[name="extra_preset_id[]"]').value;
        return (opts.presetId && pid === opts.presetId) || norm(r.querySelector('input[name="extra_name[]"]').value) === norm(opts.name);
      });
      if (exists) return;
      var node = extraTpl.content.firstElementChild.cloneNode(true);
      node.setAttribute('data-preset-id', opts.presetId || '');
      node.setAttribute('data-name', opts.name);
      node.querySelector('input[name="extra_preset_id[]"]').value = opts.presetId || '';
      node.querySelector('input[name="extra_name[]"]').value = opts.name;
      node.querySelector('input[name="extra_icon[]"]').value = opts.icon || 'fa-star';
      node.querySelector('input[name="extra_new_catalog[]"]').value = opts.toCatalog ? '1' : '0';
      var ic = node.querySelector('[data-x-icon]'); if (ic) ic.className = 'fa ' + (opts.icon || 'fa-star');
      var nm = node.querySelector('[data-x-name]'); if (nm) nm.textContent = opts.name;
      extrasBox.appendChild(node);
      refreshExtras();
      var ta = node.querySelector('textarea'); if (ta) ta.focus();
    }
    function removeExtraByPreset(pid, name) {
      extraRows().forEach(function (r) {
        var rp = r.querySelector('input[name="extra_preset_id[]"]').value;
        if ((pid && rp === pid) || norm(r.querySelector('input[name="extra_name[]"]').value) === norm(name)) r.remove();
      });
      refreshExtras();
    }
    form.addEventListener('click', function (ev) {
      var b = ev.target.closest('.invgen-preset[data-preset-id]');
      if (b && form.contains(b)) {
        ev.preventDefault();
        if (b.classList.contains('is-on')) removeExtraByPreset(b.getAttribute('data-preset-id'), b.getAttribute('data-name'));
        else addExtra({ presetId: b.getAttribute('data-preset-id'), name: b.getAttribute('data-name'), icon: b.getAttribute('data-icon') });
        return;
      }
      var t = ev.target.closest('[data-invgen-new-toggle]');
      if (t) { ev.preventDefault(); newBox.classList.toggle('d-none'); if (!newBox.classList.contains('d-none')) { var i = newBox.querySelector('[data-new-name]'); if (i) i.focus(); } return; }
      var ico = ev.target.closest('[data-new-icons] .invgen-icon');
      if (ico) { ev.preventDefault(); newBox.querySelectorAll('.invgen-icon').forEach(function (x) { x.classList.remove('is-on'); }); ico.classList.add('is-on'); return; }
      var add = ev.target.closest('[data-invgen-new-add]');
      if (add) {
        ev.preventDefault();
        var nameEl = newBox.querySelector('[data-new-name]');
        var name = (nameEl.value || '').trim();
        if (!name) { if (window.app33FormCheck) window.app33FormCheck.fail(newBox, nameEl, 'Ponle nombre al extra.'); else nameEl.focus(); return; }
        var on = newBox.querySelector('.invgen-icon.is-on');
        var cat = newBox.querySelector('[data-new-catalog]');
        addExtra({ presetId: '', name: name, icon: on ? on.getAttribute('data-icon') : 'fa-star', toCatalog: !!(cat && cat.checked) });
        nameEl.value = '';
        if (window.app33FormCheck) window.app33FormCheck.ok(nameEl);
        newBox.classList.add('d-none');
        return;
      }
      var rm = ev.target.closest('[data-invgen-extra-remove]');
      if (rm) { ev.preventDefault(); var row = rm.closest('[data-invgen-extra]'); if (row) row.remove(); refreshExtras(); return; }
    });
    var newNameEl = newBox ? newBox.querySelector('[data-new-name]') : null;
    if (newNameEl) newNameEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); var a = newBox.querySelector('[data-invgen-new-add]'); if (a) a.click(); }
    });
    refreshExtras();

    /* --- IMAGEN --- */
    var uploadBox = form.querySelector('[data-invgen-upload]');
    var fileInput = form.querySelector('[data-invgen-file]');
    var uploadPrev = form.querySelector('[data-invgen-upload-preview]');
    function syncImage() {
      var v = form.querySelector('input[name="image_choice"]:checked');
      var up = v && v.value === 'upload';
      if (uploadBox) uploadBox.classList.toggle('d-none', !up);
      if (fileInput) fileInput.disabled = !up;   // un campo oculto se envía igual: se deshabilita
    }
    form.addEventListener('change', function (ev) {
      if (ev.target.name === 'image_choice') syncImage();
      if (ev.target === fileInput && fileInput.files && fileInput.files[0]) {
        var f = fileInput.files[0];
        if (uploadPrev) {
          try { uploadPrev.src = URL.createObjectURL(f); uploadPrev.classList.remove('d-none'); } catch (e) {}
        }
        // Elegir un archivo ES elegir «subir otra imagen».
        var r = form.querySelector('input[name="image_choice"][value="upload"]');
        if (r && !r.checked) { r.checked = true; syncImage(); }
      }
    });
    syncImage();

    /* --- CONDICIONES --- */
    var clausesBox = form.querySelector('[data-invgen-clauses]');
    var clauseTpl = form.querySelector('[data-invgen-clause-tpl]');
    var tplSelect = form.querySelector('[data-invgen-template]');
    var tplDelete = form.querySelector('[data-invgen-template-delete]');
    var condState = form.querySelector('[data-invgen-cond-state]');
    var scopeInput = form.querySelector('[data-invgen-scope]');
    var scopeAsk = form.querySelector('[data-invgen-scope-ask]');
    var saveAsToggle = form.querySelector('[data-invgen-saveas-toggle]');
    var saveAsName = form.querySelector('[data-invgen-saveas-name]');
    var loaded = { id: form.getAttribute('data-template-id') || '', name: form.getAttribute('data-template-name') || '', snapshot: '' };
    var scopePicked = false;

    function clauseRows() { return Array.prototype.slice.call(clausesBox.querySelectorAll('[data-invgen-clause]')); }
    function readClauses() {
      return clauseRows().map(function (r) {
        return { title: (r.querySelector('input[name="cond_title[]"]').value || '').trim(), body: (r.querySelector('textarea[name="cond_body[]"]').value || '').trim() };
      }).filter(function (c) { return c.title || c.body; });
    }
    function renumber() { clauseRows().forEach(function (r, i) { var n = r.querySelector('[data-clause-n]'); if (n) n.textContent = String(i + 1); }); }
    function addClause(c, focus) {
      if (!clauseTpl) return;
      var node = clauseTpl.content.firstElementChild.cloneNode(true);
      node.querySelector('input[name="cond_title[]"]').value = (c && c.title) || '';
      node.querySelector('textarea[name="cond_body[]"]').value = (c && c.body) || '';
      clausesBox.appendChild(node);
      renumber();
      if (focus) { var i = node.querySelector('input'); if (i) i.focus(); }
    }
    function setClauses(list) {
      clauseRows().forEach(function (r) { r.remove(); });
      (list || []).forEach(function (c) { addClause(c, false); });
      renumber();
    }
    function snapshot() { return JSON.stringify(readClauses()); }
    function isDirty() { return !!loaded.id && loaded.snapshot !== '' && snapshot() !== loaded.snapshot; }
    function syncTemplateUI() {
      var opt = tplSelect ? tplSelect.options[tplSelect.selectedIndex] : null;
      var builtin = opt && opt.getAttribute('data-builtin') === '1';
      if (tplDelete) tplDelete.classList.toggle('d-none', !(tplSelect && tplSelect.value && !builtin));
      if (condState) {
        if (!tplSelect || !tplSelect.value) condState.textContent = loaded.id ? 'Las condiciones se guardan solo en este evento (sin plantilla).' : 'Sin plantilla: las condiciones se guardan solo en este evento.';
        else if (tplSelect.value !== loaded.id) condState.textContent = 'Plantilla elegida pero sin cargar: pulsa «Cargar la plantilla» para traer sus cláusulas.';
        else if (isDirty()) condState.textContent = 'Has cambiado las condiciones de la plantilla «' + loaded.name + '»: al guardar se preguntará si el cambio es solo de este evento o de la plantilla también.';
        else condState.textContent = 'Condiciones de la plantilla «' + loaded.name + '», sin cambios.';
      }
    }
    // El snapshot inicial: lo que hay en el editor viene de la configuración guardada (o de la plantilla).
    loaded.snapshot = loaded.id ? snapshot() : '';
    function loadTemplate(id, cb) {
      var url = (form.getAttribute('data-template-url') || '').replace('__ID__', id);
      fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
        if (!data || !data.ok) { alert((data && data.error) || 'No se pudo cargar la plantilla.'); return; }
        setClauses(data.clauses || []);
        loaded = { id: data.id, name: data.name, snapshot: snapshot() };
        form.setAttribute('data-template-id', data.id);
        form.setAttribute('data-template-name', data.name);
        scopePicked = false;
        if (scopeInput) scopeInput.value = 'ONLY';
        syncTemplateUI();
        if (cb) cb();
      }).catch(function () { alert('No se pudo cargar la plantilla.'); });
    }
    form.addEventListener('click', function (ev) {
      var b;
      if ((b = ev.target.closest('[data-invgen-template-load]'))) {
        ev.preventDefault();
        if (!tplSelect || !tplSelect.value) { setClauses([]); loaded = { id: '', name: '', snapshot: '' }; syncTemplateUI(); return; }
        var cur = readClauses();
        if (cur.length && snapshot() !== loaded.snapshot && !confirm('Cargar la plantilla sustituye las cláusulas que hay ahora en el editor. ¿Seguir?')) return;
        loadTemplate(tplSelect.value);
        return;
      }
      if ((b = ev.target.closest('[data-invgen-template-delete]'))) {
        ev.preventDefault();
        if (!tplSelect || !tplSelect.value) return;
        var opt = tplSelect.options[tplSelect.selectedIndex];
        if (!confirm('¿Eliminar la plantilla «' + (opt ? opt.textContent.split(' · ')[0] : '') + '»? Las actividades que la usaban conservan sus condiciones.')) return;
        var url = (form.getAttribute('data-template-delete-url') || '').replace('__ID__', tplSelect.value);
        fetch(url, { method: 'POST', headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (data) {
          if (!data || !data.ok) { alert((data && data.error) || 'No se pudo eliminar.'); return; }
          if (opt) opt.remove();
          tplSelect.value = '';
          if (loaded.id === (data.id || loaded.id)) { loaded = { id: '', name: '', snapshot: '' }; }
          syncTemplateUI();
        }).catch(function () { alert('No se pudo eliminar la plantilla.'); });
        return;
      }
      if ((b = ev.target.closest('[data-invgen-clause-add]'))) { ev.preventDefault(); addClause(null, true); syncTemplateUI(); return; }
      if ((b = ev.target.closest('[data-clause-remove]'))) { ev.preventDefault(); var r = b.closest('[data-invgen-clause]'); if (r) r.remove(); renumber(); syncTemplateUI(); return; }
      if ((b = ev.target.closest('[data-clause-up]'))) { ev.preventDefault(); var r1 = b.closest('[data-invgen-clause]'); if (r1 && r1.previousElementSibling && r1.previousElementSibling.hasAttribute('data-invgen-clause')) r1.parentNode.insertBefore(r1, r1.previousElementSibling); renumber(); syncTemplateUI(); return; }
      if ((b = ev.target.closest('[data-clause-down]'))) { ev.preventDefault(); var r2 = b.closest('[data-invgen-clause]'); var nx = r2 && r2.nextElementSibling; if (nx && nx.hasAttribute('data-invgen-clause')) r2.parentNode.insertBefore(nx, r2); renumber(); syncTemplateUI(); return; }
      if ((b = ev.target.closest('[data-scope-pick]'))) {
        ev.preventDefault();
        if (scopeInput) scopeInput.value = b.getAttribute('data-scope-pick');
        scopePicked = true;
        scopeAsk.querySelectorAll('[data-scope-pick]').forEach(function (x) { x.classList.toggle('active', x === b); });
        var note = scopeAsk.querySelector('[data-scope-note]');
        if (note) note.textContent = b.getAttribute('data-scope-pick') === 'UPDATE' ? 'La plantilla «' + loaded.name + '» quedará con estas condiciones para los próximos eventos.' : 'La plantilla se queda como estaba; el cambio es solo de este evento.';
        if (window.app33FormCheck) window.app33FormCheck.ok(scopeAsk);
        return;
      }
    });
    form.addEventListener('input', function (ev) {
      if (ev.target.closest('[data-invgen-clauses]')) { scopePicked = false; syncTemplateUI(); }
    });
    var tplPrev = tplSelect ? tplSelect.value : '';
    if (tplSelect) tplSelect.addEventListener('change', function () {
      // Elegir una plantilla la CARGA. Si en el editor hay cláusulas propias (distintas de lo cargado)
      // se pregunta antes de sustituirlas; si se dice que no, el selector vuelve a lo que estaba.
      if (!tplSelect.value) { syncTemplateUI(); tplPrev = ''; return; }
      var propias = readClauses().length && snapshot() !== loaded.snapshot;
      if (propias && !confirm('Cargar la plantilla sustituye las cláusulas que hay ahora en el editor. ¿Seguir?')) {
        tplSelect.value = tplPrev; syncTemplateUI(); return;
      }
      tplPrev = tplSelect.value;
      loadTemplate(tplSelect.value);
    });
    if (saveAsToggle) saveAsToggle.addEventListener('change', function () {
      saveAsName.classList.toggle('d-none', !saveAsToggle.checked);
      saveAsName.disabled = !saveAsToggle.checked;
      if (saveAsToggle.checked) saveAsName.focus(); else saveAsName.value = '';
    });
    if (saveAsName) saveAsName.disabled = !(saveAsToggle && saveAsToggle.checked);
    syncTemplateUI();

    /* --- RESUMEN + ALCANCE --- */
    function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function buildSummary() {
      var ul = form.querySelector('[data-invgen-summary]');
      if (!ul) return;
      var doors = (form.querySelector('[data-invgen-doors]') || {}).value || '';
      var show = (form.querySelector('[data-invgen-show]') || {}).value || '';
      var extras = extraRows().map(function (r) { return { name: r.querySelector('input[name="extra_name[]"]').value, icon: r.querySelector('input[name="extra_icon[]"]').value }; });
      var img = form.querySelector('input[name="image_choice"]:checked');
      var imgTxt = 'Se conserva la actual';
      if (img) {
        if (img.value === 'remove') imgTxt = 'Sin imagen';
        else if (img.value === 'upload') imgTxt = (fileInput && fileInput.files && fileInput.files[0]) ? 'Se sube «' + fileInput.files[0].name + '»' : 'Subir otra imagen (no se ha elegido ningún archivo)';
        else if (img.value.indexOf('url:') === 0) { var lab = img.closest('.promo-pick'); var nm = lab ? lab.querySelector('.promo-pick__name') : null; imgTxt = nm ? nm.textContent : 'Imagen de la actividad'; }
      }
      var cls = readClauses();
      var tplTxt = tplSelect && tplSelect.value && tplSelect.value === loaded.id ? ' · plantilla «' + loaded.name + '»' + (isDirty() ? ' (modificada)' : '') : (tplSelect && tplSelect.value ? ' · plantilla elegida sin cargar' : ' · sin plantilla');
      if (saveAsToggle && saveAsToggle.checked && saveAsName.value.trim()) tplTxt = ' · se guardan como la plantilla nueva «' + saveAsName.value.trim() + '»';
      ul.innerHTML =
        '<li><i class="fa fa-door-open"></i><div><small>Apertura de puertas</small><strong>' + esc(doors || 'Por confirmar') + '</strong></div></li>' +
        '<li><i class="fa fa-clock"></i><div><small>Comienzo</small><strong>' + esc(show || 'Por confirmar') + '</strong></div></li>' +
        '<li><i class="fa fa-star"></i><div><small>Extras</small>' + (extras.length ? '<div class="d-flex flex-wrap gap-1 mt-1">' + extras.map(function (x) { return '<span class="invgen-chip"><i class="fa ' + esc(x.icon) + '"></i>' + esc(x.name) + '</span>'; }).join('') + '</div>' : '<strong class="text-muted">Ninguno</strong>') + '</div></li>' +
        '<li><i class="fa fa-image"></i><div><small>Imagen</small><strong>' + esc(imgTxt) + '</strong></div></li>' +
        '<li><i class="fa fa-file-contract"></i><div><small>Condiciones de uso</small><strong>' + cls.length + ' cláusula' + (cls.length === 1 ? '' : 's') + '</strong><span class="text-muted">' + esc(tplTxt) + '</span></div></li>';
    }
    function needsScope() {
      return !!(tplSelect && tplSelect.value && tplSelect.value === loaded.id && isDirty() && !(saveAsToggle && saveAsToggle.checked && saveAsName.value.trim()));
    }
    function askScopeIfNeeded() {
      if (!scopeAsk) return;
      var need = needsScope();
      scopeAsk.classList.toggle('d-none', !need);
      var nm = scopeAsk.querySelector('[data-scope-name]'); if (nm) nm.textContent = loaded.name;
      if (!need && scopeInput) scopeInput.value = 'ONLY';
    }
    // Guardar sin haber decidido el alcance: se para y se dice (esconder el botón no explicaría nada).
    // ⚠️ El LOADER global escucha el `submit` en `document` (en captura) y se registra ANTES que este
    // script, así que cuando aquí se para el envío ya ha sacado su «Cargando…»: hay que apagarlo.
    function paraEnvio(ev) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      setTimeout(function () { if (window.appLoader && window.appLoader.hide) window.appLoader.hide(); }, 0);
    }
    form.addEventListener('submit', function (ev) {
      if (needsScope() && !scopePicked) {
        paraEnvio(ev);
        askScopeIfNeeded();
        if (window.app33FormCheck) window.app33FormCheck.fail(form, scopeAsk, 'Di si el cambio de las condiciones es solo de este evento o también de la plantilla.');
        scopeAsk.scrollIntoView({ block: 'center' });
        return;
      }
      if (!readClauses().length) {
        paraEnvio(ev);
        if (form.swGo) form.swGo(4);
        if (window.app33FormCheck) window.app33FormCheck.fail(form, clausesBox, 'Pon al menos una condición de uso.');
      }
    }, true);
  }

  function boot() { renderPreview(); initWizard(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
