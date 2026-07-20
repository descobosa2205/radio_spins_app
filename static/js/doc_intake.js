/* Alta de tercero / personal desde DOCUMENTO (DNI o pasaporte) o introduciendo los datos a mano.
   Actúa sobre cada formulario [data-doc-intake] (modales «Nuevo tercero» / «Nuevo usuario»):
     - paso 0: selector con iconos (subir documento | introducir datos),
     - paso «doc»: subir foto/PDF → window.DocScan escanea (recorte auto + manual + OCR) →
       rellena los campos oficiales del formulario y guarda los recortes (base64) en campos ocultos,
     - paso «form»: los campos normales, ya prerrellenados; al enviar, el backend crea la entidad y,
       si hay documento, adjunta el PersonDocument.
   El nick se deja vacío a propósito: el backend usa el nombre oficial si no se escribe uno. */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function titleCase(s) { return String(s || '').toLowerCase().replace(/(^|[\s'-])([a-záéíóúñü])/g, function (m, sep, c) { return sep + c.toUpperCase(); }); }
  // MRZ da "APELLIDOS, NOMBRE" → [nombre, apellidos].
  function splitName(full) {
    var s = String(full || '').replace(/\s+/g, ' ').trim();
    if (!s) return ['', ''];
    if (s.indexOf(',') >= 0) { var p = s.split(','); return [titleCase(p.slice(1).join(',').trim()), titleCase(p[0].trim())]; }
    var parts = s.split(' ');
    if (parts.length >= 3) return [titleCase(parts.slice(0, -2).join(' ')), titleCase(parts.slice(-2).join(' '))];
    if (parts.length === 2) return [titleCase(parts[0]), titleCase(parts[1])];
    return [titleCase(s), ''];
  }

  ready(function () { document.querySelectorAll('[data-doc-intake]').forEach(initIntake); });

  function initIntake(root) {
    var faceSources = {};
    function q(sel) { return root.querySelector(sel); }
    function step(name) { return root.querySelector('[data-intake-step="' + name + '"]'); }
    function fieldByName(name) { return root.querySelector('[name="' + name + '"]'); }
    function hidden(name) { return root.querySelector('[data-intake-hidden="' + name + '"]'); }
    function currentKind() { var r = root.querySelector('[data-intake-kind]:checked'); return r ? r.value : 'DNI'; }
    function show(el, on) { if (el) el.classList.toggle('d-none', !on); }
    var submitBtn = q('[data-intake-submit]');

    function ocrMsg(txt, spin) {
      var box = q('[data-intake-ocr]'), msg = q('[data-intake-ocr-msg]');
      if (!box || !msg) return;
      box.classList.remove('d-none');
      var i = box.querySelector('i'); if (i) i.className = spin ? 'fa fa-spinner fa-spin me-1' : 'fa fa-wand-magic-sparkles me-1';
      msg.textContent = txt;
    }
    function setPreview(which, url) {
      var img = root.querySelector('[data-intake-preview="' + which + '"]');
      var wrap = root.querySelector('[data-intake-drop="' + which + '"]');
      var hint = wrap ? wrap.querySelector('.docs-drop__hint') : null;
      if (!img) return;
      if (url) { img.src = url; img.classList.remove('d-none'); if (hint) hint.classList.add('d-none'); }
      else { img.src = ''; img.classList.add('d-none'); if (hint) hint.classList.remove('d-none'); }
    }
    function showCropBtn(which, on) { var b = root.querySelector('[data-intake-crop="' + which + '"]'); if (b) b.classList.toggle('d-none', !on); }

    function reset() {
      show(step('choose'), true); show(step('doc'), false); show(step('form'), false); show(submitBtn, false);
      faceSources = {};
      ['front', 'back'].forEach(function (w) { setPreview(w, ''); showCropBtn(w, false); var f = root.querySelector('[data-intake-file="' + w + '"]'); if (f) f.value = ''; });
      root.querySelectorAll('[data-intake-hidden]').forEach(function (h) { h.value = ''; });
      var box = q('[data-intake-ocr]'); if (box) box.classList.add('d-none');
      show(q('[data-intake-continue]'), false);
      show(q('[data-intake-back-to-doc]'), false);
    }

    function configureKind() {
      var kind = currentKind();
      show(root.querySelector('[data-intake-face-wrap="back"]'), kind !== 'PASSPORT');
      var fl = q('[data-intake-front-label]');
      if (fl) fl.textContent = kind === 'PASSPORT' ? 'Página del pasaporte (foto o PDF)' : 'Anverso — o el PDF con las dos caras';
    }

    function fillForm(data, kind) {
      var nm = splitName(data.full_name);
      function put(name, val) { var el = fieldByName(name); if (el && val && !el.value) el.value = val; }
      put('first_name', nm[0]); put('last_name', nm[1]); put('birth_date', data.birth);
      if (kind === 'DNI' && data.number) { put('dni', data.number); put('tax_id', data.number); }
      function h(name, val) { var el = hidden(name); if (el) el.value = val || ''; }
      h('doc_kind', kind); h('doc_number', data.number); h('doc_full_name', data.full_name);
      h('doc_birth_date', data.birth); h('doc_expiry_date', data.expiry); h('doc_issue_date', data.issue);
    }

    function applyFace(which, canvas) {
      var url = canvas.toDataURL('image/jpeg', 0.9);
      setPreview(which, url);
      var h = hidden('doc_' + which + '_b64'); if (h) h.value = url;
    }

    function scanFile(file, which) {
      var kind = currentKind();
      if (!window.DocScan) { ocrMsg('No se pudo cargar el lector; introduce los datos a mano.', false); return; }
      window.DocScan.scan(file, kind, which, ocrMsg).then(function (res) {
        res.faces.forEach(function (f) { faceSources[f.which] = { source: f.source, rect: f.rect }; applyFace(f.which, f.canvas); showCropBtn(f.which, true); });
        fillForm(res.data, kind);
        show(q('[data-intake-continue]'), true);
        var bits = [];
        if (res.data.full_name) bits.push(res.data.full_name);
        if (res.data.number) bits.push('nº ' + res.data.number);
        ocrMsg(bits.length ? ('Detectado: ' + bits.join(' · ') + '. Revisa/ajusta y pulsa Continuar.') : 'Documento cargado. Ajusta el recorte si hace falta y pulsa Continuar.', false);
      }).catch(function () { ocrMsg('No se pudo procesar el archivo. Prueba con una foto o introduce los datos a mano.', false); });
    }

    root.querySelectorAll('[data-intake-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-intake-pick') === 'manual') { show(step('choose'), false); show(step('doc'), false); show(step('form'), true); show(submitBtn, true); }
        else { show(step('choose'), false); show(step('doc'), true); configureKind(); }
      });
    });
    root.querySelectorAll('[data-intake-back]').forEach(function (b) { b.addEventListener('click', reset); });
    root.querySelectorAll('[data-intake-kind]').forEach(function (r) { r.addEventListener('change', configureKind); });
    root.querySelectorAll('[data-intake-file]').forEach(function (inp) {
      inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; if (f) scanFile(f, inp.getAttribute('data-intake-file')); });
    });
    var cont = q('[data-intake-continue]');
    if (cont) cont.addEventListener('click', function () { show(step('doc'), false); show(step('form'), true); show(submitBtn, true); show(q('[data-intake-back-to-doc]'), true); });
    root.querySelectorAll('[data-intake-back-to-doc]').forEach(function (b) { b.addEventListener('click', function () { show(step('form'), false); show(submitBtn, false); show(step('doc'), true); }); });
    root.querySelectorAll('[data-intake-crop]').forEach(function (b) {
      b.addEventListener('click', function () {
        var which = b.getAttribute('data-intake-crop'), fs = faceSources[which];
        if (!fs || !window.DocScan) return;
        window.DocScan.openCropTool(fs.source, fs.rect, function (newRect) { fs.rect = newRect; applyFace(which, window.DocScan.cropRect(fs.source, newRect)); });
      });
    });

    var modal = root.closest('.modal');
    if (modal) modal.addEventListener('show.bs.modal', reset);
    reset();
  }
})();
