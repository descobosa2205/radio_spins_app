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

  /* ------------------------------------------------------------ asistente de CATEGORÍAS */
  /* Una categoría = nombre + extras + uno o varios SECTORES, cada uno con sus butacas (numerado) o su
     cantidad (de pie) y su puerta. El formato del recinto llega en JSON al abrir el pop-up
     (`data-sections-url`) y el plano se dibuja con la geometría del visor (`window.VenueMapGeom`, la
     misma de venue_map.js: así una butaca está donde está en el mapa del recinto). Los sectores se
     montan en memoria (`staged`) y se mandan todos de una vez al «Generar» (`data-create-url`). */
  function initCategoryWizard() {
    var form = document.querySelector('[data-invgen-cat-form]');
    if (!form) return;
    var modalEl = form.closest('.modal');
    var sectionsUrl = form.getAttribute('data-sections-url');
    var createUrl = form.getAttribute('data-create-url');
    var Q = function (sel) { return form.querySelector(sel); };
    function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function num(n) { return Number(n || 0).toLocaleString('es-ES'); }

    var data = null;        // lo que devuelve el servidor: has_map, layout, sections, taken, doors
    var geom = null;        // VenueMapGeom(layout): pos["sec|fila|slot"] = {x,y}, secs, stage, pitch, bbox
    var secByKey = {};
    var draft = null;       // el sector que se está configurando ahora
    var staged = [];        // los sectores ya añadidos a la categoría
    var stagedKeys = {};    // butacas ya cogidas por los sectores añadidos (no se pueden repetir)
    var seq = 0;

    var errBox = Q('[data-cat-error]');
    var loading = Q('[data-cat-loading]'), mapWrap = Q('[data-cat-mapwrap]'), mapHost = Q('[data-cat-map]');
    var secBtns = Q('[data-cat-sections]'), noMap = Q('[data-cat-nomap]');
    var manualBox = Q('[data-cat-manual]'), manualName = Q('[data-manual-name]');
    var chosenBox = Q('[data-cat-chosen]');
    var seatHost = Q('[data-cat-seatpick]'), seatCount = Q('[data-cat-seatcount]');
    var seatWrap = Q('[data-cat-seatpick-wrap]'), manualSeatsWrap = Q('[data-cat-manual-seats-wrap]'), manualSeats = Q('[data-manual-seats]');
    var qtyInput = Q('[data-cat-qty]'), qtyInfo = Q('[data-cat-qty-info]');
    var doorsBox = Q('[data-cat-doors]'), doorInput = Q('[data-cat-door]');
    var stagedList = Q('[data-cat-staged]'), summary = Q('[data-cat-summary]'), totalEl = Q('[data-cat-total]');
    var stagedHint = Q('[data-cat-staged-hint]');
    var manualKind = 'QTY';

    /* --- la cabecera con un icono por paso (un icono puede cubrir DOS pasos: butacas o cantidad) --- */
    var stepIcons = form.querySelectorAll('[data-invgen-steps] li');
    function activeStep() { var a = form.querySelector('.sw-step.active'); return a ? parseInt(a.getAttribute('data-step'), 10) : 1; }
    function syncSteps() {
      var n = activeStep();
      stepIcons.forEach(function (li) {
        var ks = (li.getAttribute('data-for') || '').split(',').map(function (x) { return parseInt(x, 10); });
        li.classList.toggle('is-active', ks.indexOf(n) >= 0);
        li.classList.toggle('is-done', Math.max.apply(null, ks) < n);
      });
      if (n === 7) { commitDraft(); renderSummary(); }
      if (n === 6) renderDoors();
      if (n === 5) renderQty();
      if (n === 4) renderSeatsStep();
    }
    var mo = new MutationObserver(function () { syncSteps(); });
    form.querySelectorAll('.sw-step').forEach(function (s) { mo.observe(s, { attributes: true, attributeFilter: ['class'] }); });

    /* --- abrir: se empieza de cero y se pide el formato del recinto --- */
    function reset() {
      data = null; geom = null; secByKey = {}; draft = null; staged = []; stagedKeys = {}; seq = 0;
      form.reset();
      form.querySelectorAll('[data-cat-extra]').forEach(function (l) { l.classList.remove('is-on'); });
      form.setAttribute('data-sw-mode', '');
      if (form.swRefresh) form.swRefresh();
      if (errBox) { errBox.classList.add('d-none'); errBox.textContent = ''; }
      loading.classList.remove('d-none'); mapWrap.classList.add('d-none'); noMap.classList.add('d-none');
      manualBox.classList.add('d-none'); chosenBox.classList.add('d-none'); stagedHint.classList.add('d-none');
      mapHost.innerHTML = ''; secBtns.innerHTML = ''; seatHost.innerHTML = '';
      renderStagedHint(); updateTotal();
    }
    function load() {
      fetch(sectionsUrl, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo cargar el formato del recinto.');
          data = j; secByKey = {};
          (data.sections || []).forEach(function (s) { secByKey[s.key] = s; });
          loading.classList.add('d-none');
          if (data.has_map && window.VenueMapGeom) {
            try { geom = window.VenueMapGeom(data.layout || {}); } catch (e) { geom = null; }
          }
          if (data.has_map && (data.sections || []).length) {
            mapWrap.classList.remove('d-none');
            renderOverview(); renderSectionButtons();
          } else {
            noMap.classList.remove('d-none');
            manualBox.classList.remove('d-none');
          }
        })
        .catch(function (e) {
          loading.innerHTML = '<i class="fa fa-triangle-exclamation me-1 text-warning"></i>' + esc(e.message || 'No se pudo cargar el formato del recinto.');
          manualBox.classList.remove('d-none');
        });
    }
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-invgen-cat-open]')) { reset(); load(); if (form.swGo) form.swGo(0); }
    });

    /* --- 2 · EXTRAS: la etiqueta se enciende con su casilla --- */
    form.addEventListener('change', function (ev) {
      var cb = ev.target.closest('[data-cat-extra] input[type="checkbox"]');
      if (cb) cb.closest('[data-cat-extra]').classList.toggle('is-on', cb.checked);
    });

    /* --- 3 · SECTOR: el plano de las secciones (con el escenario) y su lista --- */
    function secBox(sec) {
      // El rectángulo que envuelve las butacas de una sección numerada (de la geometría del visor).
      if (sec.kind === 'floor' && sec.floor) {
        var f = sec.floor;
        return { x: (+f.x || 0) - (+f.w || 0) / 2, y: (+f.y || 0) - (+f.h || 0) / 2, w: +f.w || 0, h: +f.h || 0, rot: +f.rot || 0, cx: +f.x || 0, cy: +f.y || 0 };
      }
      if (!geom) return null;
      var xs = [], ys = [], pfx = sec.key + '|';
      Object.keys(geom.pos).forEach(function (k) { if (k.indexOf(pfx) === 0) { xs.push(geom.pos[k].x); ys.push(geom.pos[k].y); } });
      if (!xs.length) return null;
      var pad = (geom.pitch || 26) * .8;
      var x0 = Math.min.apply(null, xs) - pad, y0 = Math.min.apply(null, ys) - pad;
      var x1 = Math.max.apply(null, xs) + pad, y1 = Math.max.apply(null, ys) + pad;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    function renderOverview() {
      var boxes = {}, xs = [], ys = [];
      (data.sections || []).forEach(function (s) {
        var b = secBox(s); if (!b) return; boxes[s.key] = b;
        var r = Math.max(b.w, b.h) / 2;   // margen holgado por si está girada
        xs.push(b.cx - r, b.cx + r); ys.push(b.cy - r, b.cy + r);
      });
      var stage = geom && geom.stage;
      if (stage) { xs.push(stage.x - stage.w / 2, stage.x + stage.w / 2); ys.push(stage.y - stage.h / 2, stage.y + stage.h / 2); }
      var doors = ((data.layout && data.layout.elements) || []).filter(function (e) { return e && e.type === 'door'; });
      doors.forEach(function (d) { xs.push(+d.x - 80, +d.x + 80); ys.push(+d.y - 50, +d.y + 70); });
      if (!xs.length) { mapWrap.classList.add('d-none'); return; }
      var pad = 60, minX = Math.min.apply(null, xs) - pad, minY = Math.min.apply(null, ys) - pad;
      var W = Math.max.apply(null, xs) + pad - minX, H = Math.max.apply(null, ys) + pad - minY;
      var fs = Math.max(22, Math.min(W, H) / 22);
      var h = '<svg viewBox="' + minX + ' ' + minY + ' ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plano de las secciones del recinto">';
      if (stage) {
        h += '<g class="invgen-stage" transform="rotate(' + (stage.rot || 0) + ' ' + stage.x + ' ' + stage.y + ')"><rect x="' + (stage.x - stage.w / 2) + '" y="' + (stage.y - stage.h / 2) + '" width="' + stage.w + '" height="' + stage.h + '" rx="18"/>' +
             '<text x="' + stage.x + '" y="' + stage.y + '" font-size="' + fs + '" dominant-baseline="central">' + esc(stage.label || 'ESCENARIO') + '</text></g>';
      }
      doors.forEach(function (d) {
        h += '<g class="invgen-door"><rect x="' + (+d.x - 50) + '" y="' + (+d.y - 30) + '" width="100" height="60" rx="10"/><text x="' + (+d.x) + '" y="' + (+d.y + 52 + fs * .4) + '" font-size="' + (fs * .7) + '">' + esc(d.label || 'Puerta') + '</text></g>';
      });
      (data.sections || []).forEach(function (s) {
        var b = boxes[s.key]; if (!b) return;
        var sub = s.numbered ? (num(s.free) + ' libre' + (s.free === 1 ? '' : 's') + ' de ' + num(s.count)) : ('de pie' + (s.cap ? ' · aforo ' + num(s.cap) : ''));
        h += '<g class="invgen-sec' + (s.kind === 'floor' ? ' is-floor' : '') + '" data-sec="' + esc(s.key) + '" transform="rotate(' + (b.rot || 0) + ' ' + b.cx + ' ' + b.cy + ')">' +
             '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="22"/>' +
             '<text x="' + b.cx + '" y="' + (b.cy - fs * .25) + '" font-size="' + fs + '">' + esc(s.name) + '</text>' +
             '<text class="sub" x="' + b.cx + '" y="' + (b.cy + fs * .95) + '" font-size="' + (fs * .72) + '">' + esc(sub) + '</text></g>';
      });
      h += '</svg>';
      mapHost.innerHTML = h;
    }
    function renderSectionButtons() {
      secBtns.innerHTML = (data.sections || []).map(function (s) {
        var sub = s.numbered ? (num(s.free) + ' libre' + (s.free === 1 ? '' : 's')) : ('de pie' + (s.cap ? ' · aforo ' + num(s.cap) : ''));
        return '<button type="button" class="invgen-preset invgen-secbtn" data-sec="' + esc(s.key) + '"><i class="fa ' + (s.numbered ? 'fa-chair' : 'fa-people-group') + '"></i><span>' + esc(s.name) + '<small>' + esc(sub) + '</small></span></button>';
      }).join('');
      syncSectionPick();
    }
    function syncSectionPick() {
      var k = draft && !draft.manual ? draft.section_key : '';
      form.querySelectorAll('[data-sec]').forEach(function (el) { el.classList.toggle('is-on', !!k && el.getAttribute('data-sec') === k); });
    }
    function setMode(mode) { form.setAttribute('data-sw-mode', mode); if (form.swRefresh) form.swRefresh(); }
    function chooseSection(key) {
      var s = secByKey[key]; if (!s) return;
      var alreadyQty = staged.some(function (x) { return x.section_key === key && !x.numbered && (!draft || x._id !== draft._id); });
      if (alreadyQty) { fail(Q('[data-cat-sections]'), '«' + s.name + '» ya está en la categoría: para cambiar la cantidad quítalo del resumen.'); return; }
      draft = { _id: (draft && draft._id) || (++seq), manual: false, section_key: key, section_name: s.name, numbered: !!s.numbered,
                seats: [], qty: 0, door: (draft && draft.door) || '' };
      manualBox.classList.add('d-none');
      setMode(s.numbered ? 'NUM' : 'QTY');
      syncSectionPick(); showChosen();
    }
    function showChosen() {
      if (!draft) { chosenBox.classList.add('d-none'); return; }
      chosenBox.classList.remove('d-none');
      Q('[data-chosen-name]').textContent = draft.section_name;
      Q('[data-chosen-sub]').textContent = draft.manual
        ? ('Sector escrito a mano · ' + (draft.numbered ? 'numerado' : 'sin numerar'))
        : (draft.numbered ? 'Sección numerada: en el paso siguiente eliges las butacas' : 'Sección de pie: en el paso siguiente dices cuántas');
    }
    form.addEventListener('click', function (ev) {
      var s = ev.target.closest('[data-sec]');
      if (s && form.contains(s)) { chooseSection(s.getAttribute('data-sec')); return; }
      if (ev.target.closest('[data-cat-manual-toggle]')) { manualBox.classList.toggle('d-none'); if (!manualBox.classList.contains('d-none')) manualName.focus(); return; }
      var mk = ev.target.closest('[data-manual-kind]');
      if (mk) {
        manualKind = mk.getAttribute('data-manual-kind');
        form.querySelectorAll('[data-manual-kind]').forEach(function (b) { b.classList.toggle('active', b === mk); });
        return;
      }
      if (ev.target.closest('[data-cat-manual-use]')) {
        var nm = (manualName.value || '').trim();
        if (!nm) { fail(manualName, 'Ponle nombre al sector.'); return; }
        if (window.app33FormCheck) window.app33FormCheck.ok(manualName);
        draft = { _id: (draft && draft._id) || (++seq), manual: true, section_key: '', section_name: nm, numbered: manualKind === 'NUM',
                  seats: [], qty: 0, door: (draft && draft.door) || '' };
        setMode(draft.numbered ? 'NUM' : 'QTY');
        syncSectionPick(); showChosen();
        return;
      }
      if (ev.target.closest('[data-cat-seats-clear]')) { if (draft) { draft.seats = []; renderSeats(); } return; }
      var chip = ev.target.closest('[data-door]');
      if (chip && form.contains(chip)) {
        if (draft) draft.door = chip.getAttribute('data-door') || '';
        doorInput.value = draft ? draft.door : '';
        syncDoorChips();
        return;
      }
      if (ev.target.closest('[data-cat-add-more]')) {
        commitDraft(); draft = null; showChosen(); syncSectionPick(); setMode('');
        renderStagedHint(); if (form.swGo) form.swGo(2);
        return;
      }
      var rm = ev.target.closest('[data-staged-remove]');
      if (rm) {
        var id = parseInt(rm.getAttribute('data-staged-remove'), 10);
        staged = staged.filter(function (x) { return x._id !== id; });
        if (draft && draft._id === id) { draft = null; setMode(''); showChosen(); }
        rebuildStagedKeys(); renderSummary(); renderStagedHint();
      }
    });

    /* --- 4 · BUTACAS: el plano de la sección, con el escenario donde está --- */
    function seatPositions(sec) {
      // De la geometría del visor; si una sección no la tiene (un formato raro), una rejilla por fila/slot.
      var pos = {}, ok = 0;
      sec.seats.forEach(function (st) {
        var p = geom && geom.pos[st.key];
        if (p) { pos[st.key] = { x: p.x, y: p.y }; ok++; }
      });
      if (ok !== sec.seats.length) {
        var pitch = 26;
        sec.seats.forEach(function (st) { pos[st.key] = { x: st.slot * pitch, y: st.row_idx * pitch }; });
      }
      return pos;
    }
    function renderSeatsStep() {
      if (!draft || !draft.numbered) return;
      if (draft.manual) {
        seatWrap.classList.add('d-none'); manualSeatsWrap.classList.remove('d-none');
        manualSeats.value = draft.seats.map(function (s) { return (s.row_label ? s.row_label + ' ' : '') + s.number; }).join('\n');
        countManualSeats();
        return;
      }
      seatWrap.classList.remove('d-none'); manualSeatsWrap.classList.add('d-none');
      renderSeats();
    }
    var selected = function () { var m = {}; (draft ? draft.seats : []).forEach(function (s) { m[s.key] = true; }); return m; };
    function renderSeats() {
      var sec = draft && secByKey[draft.section_key];
      if (!sec) { seatHost.innerHTML = ''; return; }
      var pos = seatPositions(sec), keys = Object.keys(pos);
      if (!keys.length) { seatHost.innerHTML = '<div class="text-muted small p-3">Esta sección no tiene butacas que elegir.</div>'; return; }
      var xs = keys.map(function (k) { return pos[k].x; }), ys = keys.map(function (k) { return pos[k].y; });
      var pitch = (geom && geom.pitch) || 26, r = pitch * .42;
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
      var padL = pitch * 2.2, pad = pitch * 1.4, band = pitch * 1.6;
      // ¿Dónde está el escenario respecto a la sección? Se dibuja una franja en ese lado.
      var side = null;
      if (geom && geom.stage) {
        var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, dx = geom.stage.x - cx, dy = geom.stage.y - cy;
        side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
      }
      var x0 = minX - padL - (side === 'left' ? band : 0), y0 = minY - pad - (side === 'top' ? band : 0);
      var x1 = maxX + pad + (side === 'right' ? band : 0), y1 = maxY + pad + (side === 'bottom' ? band : 0);
      var sel = selected();
      var h = '<svg viewBox="' + x0 + ' ' + y0 + ' ' + (x1 - x0) + ' ' + (y1 - y0) + '" xmlns="http://www.w3.org/2000/svg" data-seatsvg>';
      if (side) {
        var bw = (side === 'left' || side === 'right') ? band * .6 : (maxX - minX + pad * 2), bh = (side === 'top' || side === 'bottom') ? band * .6 : (maxY - minY + pad * 2);
        var bx = side === 'left' ? x0 + band * .2 : side === 'right' ? x1 - band * .8 : minX - pad;
        var by = side === 'top' ? y0 + band * .2 : side === 'bottom' ? y1 - band * .8 : minY - pad;
        var tx = bx + bw / 2, ty = by + bh / 2, rot = (side === 'left') ? -90 : (side === 'right') ? 90 : 0;
        h += '<g class="invgen-stageband"><rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="8"/>' +
             '<text x="' + tx + '" y="' + ty + '" font-size="' + (pitch * .5) + '" transform="rotate(' + rot + ' ' + tx + ' ' + ty + ')">ESCENARIO</text></g>';
      }
      // Etiquetas de fila (pinchar la letra coge la fila entera).
      var rows = {};
      sec.seats.forEach(function (st) { var p = pos[st.key]; if (!p) return; var rr = rows[st.row_idx] || (rows[st.row_idx] = { label: st.row_label, ys: [], xs: [] }); rr.ys.push(p.y); rr.xs.push(p.x); });
      Object.keys(rows).forEach(function (ri) {
        var rr = rows[ri], ry = rr.ys.reduce(function (a, b) { return a + b; }, 0) / rr.ys.length, rx = Math.min.apply(null, rr.xs) - pitch * 1.1;
        h += '<text class="invgen-rowlbl" data-row="' + esc(ri) + '" x="' + rx + '" y="' + ry + '" font-size="' + (pitch * .55) + '">' + esc(rr.label) + '</text>';
      });
      sec.seats.forEach(function (st) {
        var p = pos[st.key]; if (!p) return;
        var taken = data.taken && data.taken[st.key];
        var cls = 'invgen-seat' + (taken ? ' is-taken' : stagedKeys[st.key] ? ' is-staged' : sel[st.key] ? ' is-on' : '');
        var title = sec.name + ' · fila ' + st.row_label + ' · butaca ' + st.number + (taken ? ' · ocupada: ' + taken : stagedKeys[st.key] ? ' · ya en esta categoría' : '');
        h += '<g class="' + cls + '" data-seat="' + esc(st.key) + '"><title>' + esc(title) + '</title><circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '"/>' +
             '<text x="' + p.x + '" y="' + p.y + '" font-size="' + (r * .9) + '">' + esc(st.number) + '</text></g>';
      });
      h += '</svg>';
      seatHost.innerHTML = h;
      updateSeatCount();
    }
    function updateSeatCount() {
      var n = draft ? draft.seats.length : 0;
      if (seatCount) seatCount.textContent = num(n) + ' butaca' + (n === 1 ? '' : 's');
      updateTotal();
    }
    function seatAt(key, on) {
      var sec = draft && secByKey[draft.section_key]; if (!sec) return;
      if (data.taken && data.taken[key]) return;
      if (stagedKeys[key]) return;
      var st = null; for (var i = 0; i < sec.seats.length; i++) if (sec.seats[i].key === key) { st = sec.seats[i]; break; }
      if (!st) return;
      var idx = -1; for (var j = 0; j < draft.seats.length; j++) if (draft.seats[j].key === key) { idx = j; break; }
      if (on && idx < 0) draft.seats.push({ key: st.key, row_label: st.row_label, number: st.number });
      if (!on && idx >= 0) draft.seats.splice(idx, 1);
      var g = seatHost.querySelector('[data-seat="' + key.replace(/"/g, '\\"') + '"]');
      if (g) g.classList.toggle('is-on', on);
      updateSeatCount();
    }
    var painting = null;
    seatHost.addEventListener('pointerdown', function (ev) {
      var rl = ev.target.closest('.invgen-rowlbl');
      if (rl) {
        // La fila entera: si queda alguna libre sin elegir se eligen todas; si no, se sueltan todas.
        var sec = draft && secByKey[draft.section_key]; if (!sec) return;
        var ri = rl.getAttribute('data-row'), sel = selected(), anyFree = false;
        sec.seats.forEach(function (st) { if (String(st.row_idx) === ri && !(data.taken && data.taken[st.key]) && !stagedKeys[st.key] && !sel[st.key]) anyFree = true; });
        sec.seats.forEach(function (st) { if (String(st.row_idx) === ri) seatAt(st.key, anyFree); });
        return;
      }
      var g = ev.target.closest('[data-seat]');
      if (!g) return;
      ev.preventDefault();
      var on = !g.classList.contains('is-on');
      painting = { on: on, last: g.getAttribute('data-seat') };
      seatAt(painting.last, on);
      try { seatHost.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    seatHost.addEventListener('pointermove', function (ev) {
      if (!painting) return;
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var g = el && el.closest ? el.closest('[data-seat]') : null;
      if (!g || !seatHost.contains(g)) return;
      var k = g.getAttribute('data-seat');
      if (k === painting.last) return;
      painting.last = k;
      seatAt(k, painting.on);
    });
    ['pointerup', 'pointercancel'].forEach(function (evn) { seatHost.addEventListener(evn, function () { painting = null; }); });

    function parseManualSeats() {
      var out = [], seen = {};
      (manualSeats.value || '').split(/\r?\n/).forEach(function (line) {
        var t = line.trim(); if (!t) return;
        var parts = t.split(/[\s,;\-]+/).filter(Boolean);
        var row = parts.length > 1 ? parts[0] : '', numb = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
        var k = (row + '|' + numb).toLowerCase();
        if (seen[k]) return; seen[k] = true;
        out.push({ key: '', row_label: row, number: numb });
      });
      return out;
    }
    function countManualSeats() {
      if (!draft || !draft.manual) return;
      draft.seats = parseManualSeats();
      Q('[data-cat-manual-count]').textContent = num(draft.seats.length);
      updateTotal();
    }
    manualSeats.addEventListener('input', countManualSeats);

    /* --- 5 · CANTIDAD --- */
    function renderQty() {
      if (!draft || draft.numbered) return;
      qtyInput.value = draft.qty || '';
      var sec = draft.manual ? null : secByKey[draft.section_key];
      if (sec && sec.cap) {
        var libre = Math.max(sec.cap - (sec.used_unnumbered || 0), 0);
        qtyInfo.textContent = 'Aforo de «' + sec.name + '»: ' + num(sec.cap) + (sec.used_unnumbered ? ' · ya generadas ' + num(sec.used_unnumbered) : '') + ' · caben ' + num(libre) + ' más.';
        qtyInput.max = String(Math.max(libre, 1));
      } else {
        qtyInfo.textContent = sec ? 'La sección no tiene aforo apuntado: pon la cantidad que haga falta.' : 'Sector escrito a mano: pon la cantidad que haga falta.';
        qtyInput.max = '5000';
      }
    }
    qtyInput.addEventListener('input', function () { if (draft) { draft.qty = parseInt(qtyInput.value, 10) || 0; updateTotal(); } });

    /* --- 6 · PUERTA --- */
    function allDoors() {
      var out = [], seen = {};
      ((data && data.doors) || []).concat(staged.map(function (x) { return x.door; })).forEach(function (d) {
        d = (d || '').trim(); if (!d || seen[d.toLowerCase()]) return; seen[d.toLowerCase()] = true; out.push(d);
      });
      return out;
    }
    function renderDoors() {
      var ds = allDoors();
      doorsBox.innerHTML = '<button type="button" class="invgen-preset" data-door=""><i class="fa fa-ban"></i><span>Sin puerta concreta</span></button>' +
        ds.map(function (d) { return '<button type="button" class="invgen-preset" data-door="' + esc(d) + '"><i class="fa fa-door-open"></i><span>' + esc(d) + '</span></button>'; }).join('');
      doorInput.value = draft ? (draft.door || '') : '';
      syncDoorChips();
    }
    function syncDoorChips() {
      var cur = (draft ? draft.door : '') || '';
      doorsBox.querySelectorAll('[data-door]').forEach(function (b) { b.classList.toggle('is-on', (b.getAttribute('data-door') || '') === cur); });
    }
    doorInput.addEventListener('input', function () { if (draft) draft.door = doorInput.value.trim(); syncDoorChips(); });

    /* --- 7 · RESUMEN: el borrador pasa a la lista de sectores y se dice lo que se va a generar --- */
    function draftCount(d) { return d.numbered ? d.seats.length : (parseInt(d.qty, 10) || 0); }
    function commitDraft() {
      if (!draft) return;
      if (draft.numbered && draft.manual) draft.seats = parseManualSeats();
      if (draftCount(draft) < 1) return;
      var i = -1; for (var k = 0; k < staged.length; k++) if (staged[k]._id === draft._id) { i = k; break; }
      var copy = JSON.parse(JSON.stringify(draft));
      if (i >= 0) staged[i] = copy; else staged.push(copy);
      rebuildStagedKeys();
    }
    function rebuildStagedKeys() {
      stagedKeys = {};
      staged.forEach(function (x) { (x.seats || []).forEach(function (s) { if (s.key) stagedKeys[s.key] = true; }); });
      updateTotal();
    }
    function totalCount() {
      var n = 0; staged.forEach(function (x) { n += draftCount(x); });
      if (draft && !staged.some(function (x) { return x._id === draft._id; })) n += draftCount(draft);
      return n;
    }
    function updateTotal() { if (totalEl) totalEl.textContent = num(totalCount()); }
    function renderStagedHint() {
      if (!stagedHint) return;
      if (!staged.length) { stagedHint.classList.add('d-none'); return; }
      stagedHint.classList.remove('d-none');
      stagedHint.innerHTML = '<i class="fa fa-check text-success me-1"></i>Ya en la categoría: ' + staged.map(function (x) { return esc(x.section_name) + ' (' + num(draftCount(x)) + ')'; }).join(' · ') + '. Elige el sector siguiente.';
    }
    function renderSummary() {
      var name = (Q('[data-cat-name]').value || '').trim();
      var extras = Array.prototype.slice.call(form.querySelectorAll('[data-cat-extra] input:checked')).map(function (cb) { return cb.closest('[data-cat-extra]').querySelector('span').textContent; });
      summary.innerHTML =
        '<li><i class="fa fa-tag"></i><div><small>Categoría</small><strong>' + esc(name || '—') + '</strong></div></li>' +
        '<li><i class="fa fa-star"></i><div><small>Extras incluidos</small><strong>' + (extras.length ? esc(extras.join(' · ')) : '<span class="text-muted">Ninguno</span>') + '</strong></div></li>' +
        '<li><i class="fa fa-qrcode"></i><div><small>Invitaciones</small><strong>' + num(totalCount()) + '</strong> <span class="text-muted">· cada una con su código QR</span></div></li>';
      stagedList.innerHTML = staged.length ? staged.map(function (x) {
        var what = x.numbered ? (num(x.seats.length) + ' butaca' + (x.seats.length === 1 ? '' : 's') + (x.manual ? '' : ' elegidas en el plano')) : (num(x.qty) + ' sin numerar');
        var seatsTxt = x.numbered ? x.seats.slice(0, 18).map(function (s) { return (s.row_label ? s.row_label + '-' : '') + s.number; }).join(', ') + (x.seats.length > 18 ? '…' : '') : '';
        return '<li><i class="fa ' + (x.numbered ? 'fa-chair' : 'fa-people-group') + ' text-danger"></i><div class="flex-grow-1 min-w-0"><strong>' + esc(x.section_name) + '</strong>' + (x.manual ? ' <span class="text-muted small">(a mano)</span>' : '') +
               '<div class="small text-muted">' + esc(what) + (x.door ? ' · <i class="fa fa-door-open"></i> ' + esc(x.door) : ' · sin puerta concreta') + (seatsTxt ? '<br>' + esc(seatsTxt) : '') + '</div></div>' +
               '<button type="button" class="btn btn-sm btn-link text-danger p-0" data-staged-remove="' + x._id + '" title="Quitar este sector"><i class="fa fa-xmark"></i></button></li>';
      }).join('') : '<li class="text-muted small">Todavía no hay ningún sector: vuelve atrás y elige uno.</li>';
      updateTotal();
    }

    /* --- guardias de paso: lo que step_wizard no sabe comprobar (una elección, no un campo) --- */
    function fail(el, msg) {
      if (window.app33FormCheck && el) window.app33FormCheck.fail(form, el, msg);
      else if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
    }
    form.addEventListener('click', function (ev) {
      if (!ev.target.closest('[data-sw-next]')) return;
      var n = activeStep(), stop = false;
      if (n === 3 && !draft) { fail(mapWrap.classList.contains('d-none') ? manualBox : mapWrap, 'Elige un sector del plano o escribe uno a mano.'); stop = true; }
      if (n === 4 && draft) {
        if (draft.manual) draft.seats = parseManualSeats();
        if (!draft.seats.length) { fail(draft.manual ? manualSeats : seatHost, 'Elige al menos una butaca.'); stop = true; }
      }
      if (n === 5 && draft) {
        var q = parseInt(qtyInput.value, 10) || 0, mx = parseInt(qtyInput.max, 10) || 5000;
        if (q < 1) { fail(qtyInput, 'Di cuántas invitaciones se generan.'); stop = true; }
        else if (q > mx) { fail(qtyInput, 'Como mucho ' + num(mx) + ': es lo que cabe en el sector.'); stop = true; }
        else draft.qty = q;
      }
      if (stop) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);

    /* --- GENERAR: todo en un JSON, y a la pantalla con lo creado --- */
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      commitDraft();
      var name = (Q('[data-cat-name]').value || '').trim();
      if (!name) { if (form.swGo) form.swGo(0); fail(Q('[data-cat-name]'), 'Ponle nombre a la categoría.'); return; }
      if (!staged.length) { fail(stagedList, 'Añade al menos un sector con sus butacas o su cantidad.'); return; }
      var body = {
        name: name,
        extra_ids: Array.prototype.slice.call(form.querySelectorAll('[data-cat-extra] input:checked')).map(function (cb) { return cb.value; }),
        sectors: staged.map(function (x) { return { section_key: x.section_key, section_name: x.section_name, numbered: !!x.numbered, door: x.door || '', seats: x.numbered ? x.seats : [], qty: x.numbered ? 0 : (parseInt(x.qty, 10) || 0) }; })
      };
      var btn = form.querySelector('[data-sw-submit]'); if (btn) { btn.disabled = true; }
      if (errBox) errBox.classList.add('d-none');
      fetch(createUrl, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (res) {
          if (res.j && res.j.ok) {
            // ⚠️ El destino es ESTA misma página con un «#»: asignar `href` solo mueve el ancla y NO
            // recarga (la categoría nueva no aparecería y el loader se quedaría puesto).
            var to = res.j.redirect || window.location.href;
            var mismaPagina = to.split('#')[0] === window.location.href.split('#')[0];
            if (mismaPagina) { window.location.replace(to); window.location.reload(); } else { window.location.href = to; }
            return;
          }
          throw new Error((res.j && res.j.error) || 'No se pudo generar la categoría.');
        })
        .catch(function (e) {
          if (btn) btn.disabled = false;
          if (window.appLoader && window.appLoader.hide) setTimeout(function () { window.appLoader.hide(); }, 0);
          if (errBox) { errBox.textContent = e.message || 'No se pudo generar la categoría.'; errBox.classList.remove('d-none'); errBox.scrollIntoView({ block: 'center' }); }
        });
    }, true);

    // Un formulario que se cierra a medias vuelve a empezar de cero la próxima vez.
    if (modalEl) modalEl.addEventListener('hidden.bs.modal', function () { draft = null; staged = []; stagedKeys = {}; });
  }

  function boot() { renderPreview(); initWizard(); initCategoryWizard(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
