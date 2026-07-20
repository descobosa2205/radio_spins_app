/* Documentos personales (DNI, carnet de conducir, tarjetas de fidelización, matrículas) en la
   ficha de personal y de tercero. Renderiza las tarjetas desde el JSON embebido, gestiona el alta
   /edición por modal (subida XHR con progreso y CSRF) y el OCR del DNI/carnet en el navegador
   (tesseract.js cargado bajo demanda: lee el MRZ del reverso y autorrellena nº, nombre, fecha de
   nacimiento y caducidad). No hace nada si la página no incluye el panel [data-person-docs]. */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  var KIND_LABEL = { DNI: 'DNI', LICENSE: 'Carnet de conducir', PASSPORT: 'Pasaporte', LOYALTY: 'Tarjeta de fidelización', PLATE: 'Vehículo' };
  var ID_KINDS = { DNI: 1, LICENSE: 1, PASSPORT: 1 };   // documentos con foto/PDF + OCR
  var TWO_FACE_KINDS = { DNI: 1, LICENSE: 1 };           // dos caras (el pasaporte solo tiene una)
  // El pipeline de escaneo (pdf.js, recorte, OCR, MRZ, recorte manual) vive en window.DocScan
  // (static/js/doc_scan.js, cargado antes que este fichero).

  function csrfToken() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function readJSON(root, sel) { try { return JSON.parse(root.querySelector(sel).textContent || 'null') || []; } catch (e) { return []; } }
  function fmtDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-'); if (p.length !== 3) return iso;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  ready(function () {
    var root = document.querySelector('[data-person-docs]');
    if (!root) return;
    var saveUrl = root.dataset.saveUrl || '';
    var deleteBase = root.dataset.deleteBase || '';
    var canEdit = root.dataset.canEdit === '1';
    var docs = readJSON(root, '[data-person-docs-json]');
    var brands = readJSON(root, '[data-loyalty-brands-json]');
    var brandByKey = {};
    brands.forEach(function (b) { brandByKey[b.key] = b; });

    var modalEl = document.getElementById('personDocModal');
    var bsModal = (modalEl && window.bootstrap) ? new window.bootstrap.Modal(modalEl) : null;

    /* ------------------- Render ------------------- */
    function render() {
      var byKind = { DNI: [], LICENSE: [], PASSPORT: [], LOYALTY: [], PLATE: [] };
      docs.forEach(function (d) { (byKind[d.kind] || (byKind[d.kind] = [])).push(d); });
      var any = false;
      Object.keys(byKind).forEach(function (kind) {
        var section = root.querySelector('[data-docs-section="' + kind + '"]');
        var grid = root.querySelector('[data-docs-grid="' + kind + '"]');
        if (!section || !grid) return;
        var list = byKind[kind] || [];
        section.classList.toggle('d-none', list.length === 0);
        grid.innerHTML = list.map(function (d) { return cardHtml(d); }).join('');
        if (list.length) any = true;
      });
      var empty = root.querySelector('[data-docs-empty]');
      if (empty) empty.classList.toggle('d-none', any);
    }

    function faceHtml(url, cls) {
      if (url) return '<div class="docs-id__face ' + cls + '" style="background-image:url(\'' + esc(url) + '\')"></div>';
      return '<div class="docs-id__face docs-id__face--empty ' + cls + '"><i class="fa fa-image"></i></div>';
    }

    function actionsHtml(d) {
      if (!canEdit) return '';
      return '<div class="docs-actions">' +
        '<button type="button" class="docs-actbtn" data-doc-edit="' + d.id + '" title="Editar"><i class="fa fa-pen"></i></button>' +
        '<button type="button" class="docs-actbtn docs-actbtn--del" data-doc-del="' + d.id + '" title="Eliminar"><i class="fa fa-trash"></i></button>' +
        '</div>';
    }

    function idDataRow(label, val) {
      if (!val) return '';
      return '<div class="docs-id__row"><span class="docs-id__k">' + esc(label) + '</span><span class="docs-id__v">' + esc(val) + '</span></div>';
    }

    function cardHtml(d) {
      if (d.kind === 'LOYALTY') return loyaltyHtml(d);
      if (d.kind === 'PLATE') return plateHtml(d);
      return idHtml(d);   // DNI + LICENSE + PASSPORT
    }

    function idHtml(d) {
      var title = d.kind === 'LICENSE' ? 'Carnet de conducir' : d.kind === 'PASSPORT' ? 'Pasaporte' : 'DNI';
      var icon = d.kind === 'LICENSE' ? 'fa-id-card-clip' : d.kind === 'PASSPORT' ? 'fa-passport' : 'fa-id-card';
      var numLabel = d.kind === 'LICENSE' ? 'Nº carnet' : d.kind === 'PASSPORT' ? 'Nº pasaporte' : 'Nº DNI';
      // El pasaporte tiene UNA sola cara; DNI/carnet, dos.
      var faces = (d.kind === 'PASSPORT')
        ? ('<div class="docs-id__faces docs-id__faces--single">' + faceHtml(d.front_url, 'is-front') + '</div>')
        : ('<div class="docs-id__faces">' + faceHtml(d.front_url, 'is-front') + faceHtml(d.back_url, 'is-back') + '</div>');
      return '<div class="docs-id" data-doc-card="' + d.id + '">' +
        actionsHtml(d) +
        faces +
        '<div class="docs-id__body">' +
          '<div class="docs-id__title"><i class="fa ' + icon + ' me-1"></i>' + esc(title) + '</div>' +
          idDataRow('Nombre', d.full_name) +
          idDataRow(numLabel, d.doc_number) +
          idDataRow('F. nacimiento', fmtDate(d.birth_date)) +
          (d.kind === 'PASSPORT' ? idDataRow('Emisión', fmtDate(d.issue_date)) : '') +
          idDataRow('Caducidad', fmtDate(d.expiry_date)) +
        '</div>' +
      '</div>';
    }

    // Tarjeta de fidelización = PASTILLA de color corporativo de la compañía: icono blanco del tipo
    // (avión/tren/hotel…) + nombre + número. Van en fila (una al lado de otra). Al pinchar se copia
    // el número al portapapeles (también en solo lectura).
    function loyaltyHtml(d) {
      var b = d.brand || {};
      var c1 = b.color || '#334155', c2 = b.color2 || '#64748b', fg = b.fg || '#ffffff';
      var icon = b.icon || 'fa-tag';
      var name = (b.label || d.company || 'Tarjeta');
      var num = (d.doc_number || '');
      var numFmt = num.replace(/(.{4})/g, '$1 ').trim();
      var acts = canEdit ? ('<span class="docs-pill__acts">' +
          '<button type="button" class="docs-pill__act" data-doc-edit="' + d.id + '" title="Editar"><i class="fa fa-pen"></i></button>' +
          '<button type="button" class="docs-pill__act" data-doc-del="' + d.id + '" title="Eliminar"><i class="fa fa-trash"></i></button>' +
        '</span>') : '';
      var style = '--pill-c1:' + c1 + ';--pill-c2:' + c2 + ';--pill-fg:' + fg + ';';
      return '<div class="docs-pill" data-doc-card="' + d.id + '" style="' + style + '"' +
          (num ? ' data-doc-copy="' + esc(num) + '"' : '') +
          ' title="' + (num ? 'Pinchar para copiar el número' : esc(name)) + '">' +
        '<span class="docs-pill__ic"><i class="fa ' + esc(icon) + '"></i></span>' +
        '<span class="docs-pill__body">' +
          '<span class="docs-pill__name">' + esc(name) + '</span>' +
          (numFmt ? '<span class="docs-pill__num">' + esc(numFmt) + '</span>' : '') +
        '</span>' +
        acts +
        '<span class="docs-pill__copied"><i class="fa fa-check me-1"></i>Copiado</span>' +
      '</div>';
    }

    function copyNumber(el) {
      var num = el.getAttribute('data-doc-copy') || '';
      if (!num) return;
      var done = function () { el.classList.add('is-copied'); setTimeout(function () { el.classList.remove('is-copied'); }, 1200); };
      var fallback = function () {
        try {
          var ta = document.createElement('textarea');
          ta.value = num; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.focus(); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        } catch (e) {}
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(done, function () { fallback(); done(); });
      } else { fallback(); done(); }
    }

    function plateHtml(d) {
      var plate = (d.doc_number || '').toUpperCase();
      return '<div class="docs-plate-wrap" data-doc-card="' + d.id + '">' +
        actionsHtml(d) +
        (d.label ? '<div class="docs-plate__name"><i class="fa fa-car me-1"></i>' + esc(d.label) + '</div>' : '') +
        '<div class="docs-plate">' +
          '<div class="docs-plate__eu"><span class="docs-plate__stars">★</span><span class="docs-plate__country">E</span></div>' +
          '<div class="docs-plate__num">' + esc(plate || '— — —') + '</div>' +
        '</div>' +
      '</div>';
    }

    render();

    // Copiar el número de una pastilla al pincharla (activo también en solo lectura).
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-doc-edit],[data-doc-del]')) return;
      var cp = e.target.closest('[data-doc-copy]');
      if (cp) copyNumber(cp);
    });

    if (!canEdit) return;   // sin permisos: solo lectura (pero el copiar de arriba sigue activo)

    /* ------------------- Modal (alta / edición) ------------------- */
    var form = modalEl ? modalEl.querySelector('[data-doc-form]') : null;
    // Recortes ya generados (front/back) para subirlos aunque el navegador no deje fijar input.files
    // (p. ej. iOS): se inyectan en el FormData al enviar. Se vacía al abrir el modal.
    var pendingFiles = {};
    // Fuente + recorte por cara (para reajustar el recorte a mano): {front:{source,rect}, back:{…}}.
    var faceSources = {};
    function fld(name) { return form.querySelector('[data-doc-field="' + name + '"]'); }
    function input(name) { return form.querySelector('[name="' + name + '"]'); }
    function setPreview(which, url) {
      var img = form.querySelector('[data-doc-preview="' + which + '"]');
      var hint = form.querySelector('[data-doc-drop="' + which + '"] .docs-drop__hint');
      if (url) { img.src = url; img.classList.remove('d-none'); if (hint) hint.classList.add('d-none'); }
      else { img.src = ''; img.classList.add('d-none'); if (hint) hint.classList.remove('d-none'); }
    }

    function configureForKind(kind) {
      var isDoc = !!ID_KINDS[kind];               // DNI/carnet/pasaporte (foto o PDF + OCR)
      var twoFaces = !!TWO_FACE_KINDS[kind];       // DNI/carnet (el pasaporte solo tiene una cara)
      form.querySelector('[data-doc-modal-title]').textContent = KIND_LABEL[kind] || 'Documento';
      // Imágenes: DNI/carnet dos caras; pasaporte una; fidelización/matrícula una (opcional)
      form.querySelector('[data-doc-images]').classList.remove('d-none');
      form.querySelector('[data-doc-back-wrap]').classList.toggle('d-none', !twoFaces);
      var frontLabel = form.querySelector('[data-doc-front-label]');
      frontLabel.textContent = twoFaces ? 'Anverso (cara con la foto)'
        : kind === 'PASSPORT' ? 'Página del pasaporte (foto o PDF)'
        : (kind === 'LOYALTY' ? 'Foto de la tarjeta (opcional)' : 'Foto del coche (opcional)');
      // Campos
      show(fld('full_name'), isDoc);
      show(fld('doc_number'), true);
      show(fld('birth_date'), isDoc);
      show(fld('expiry_date'), isDoc);
      show(fld('issue_date'), kind === 'PASSPORT');
      show(fld('company'), kind === 'LOYALTY');
      show(fld('label'), kind === 'PLATE');
      // Etiquetas dinámicas
      form.querySelector('[data-doc-number-label]').textContent =
        kind === 'DNI' ? 'Nº DNI' : kind === 'LICENSE' ? 'Nº de carnet'
        : kind === 'PASSPORT' ? 'Nº de pasaporte'
        : kind === 'LOYALTY' ? 'Nº de tarjeta' : 'Matrícula';
      var labLab = form.querySelector('[data-doc-label-label]');
      if (labLab) labLab.textContent = 'Nombre del vehículo';
      form.querySelector('[data-doc-apply-wrap]').classList.toggle('d-none', !isDoc);
      var pdfHint = form.querySelector('[data-doc-pdf-hint]');
      if (pdfHint) pdfHint.classList.toggle('d-none', !isDoc);
      form.querySelector('[data-doc-ocr]').classList.add('d-none');
    }
    function show(el, on) { if (el) el.classList.toggle('d-none', !on); }

    function openModal(kind, doc) {
      form.reset();
      pendingFiles = {};
      faceSources = {};
      form.querySelectorAll('[data-doc-crop]').forEach(function (b) { b.classList.add('d-none'); });
      input('kind').value = kind;
      input('doc_id').value = doc ? doc.id : '';
      input('front_url_clear').value = '';
      input('back_url_clear').value = '';
      configureForKind(kind);
      // Prefill
      if (doc) {
        if (input('full_name')) input('full_name').value = doc.full_name || '';
        if (input('doc_number')) input('doc_number').value = doc.doc_number || '';
        if (input('birth_date')) input('birth_date').value = doc.birth_date || '';
        if (input('expiry_date')) input('expiry_date').value = doc.expiry_date || '';
        if (input('issue_date')) input('issue_date').value = doc.issue_date || '';
        if (input('company')) input('company').value = doc.company || '';
        if (input('label')) input('label').value = doc.label || '';
        setPreview('front', doc.front_url || '');
        setPreview('back', doc.back_url || '');
      } else {
        setPreview('front', '');
        setPreview('back', '');
      }
      if (bsModal) bsModal.show();
    }

    root.querySelectorAll('[data-doc-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { openModal(btn.getAttribute('data-doc-add'), null); });
    });

    // Editar / eliminar (delegado en el root, se re-renderiza el HTML)
    root.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-doc-edit]');
      if (ed) { var d = docs.find(function (x) { return x.id === ed.getAttribute('data-doc-edit'); }); if (d) openModal(d.kind, d); return; }
      var dl = e.target.closest('[data-doc-del]');
      if (dl) { deleteDoc(dl.getAttribute('data-doc-del')); return; }
    });

    // Previsualización + recorte + OCR al elegir foto o PDF.
    form.querySelectorAll('[data-doc-file]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var which = inp.getAttribute('data-doc-file');
        var f = inp.files && inp.files[0];
        if (!f) { return; }
        var kind = input('kind').value;
        if (ID_KINDS[kind]) {
          processIdFile(f, which);   // recorta (y divide caras) + OCR; sustituye el fichero por el recorte
        } else if (/^image\//i.test(f.type || '')) {
          // Fidelización / matrícula: solo previsualización de imagen (sin PDF ni OCR).
          setPreview(which, URL.createObjectURL(f));
          input(which + '_url_clear').value = '';
        }
      });
    });

    function deleteDoc(id) {
      if (!window.confirm('¿Eliminar este documento? No se puede deshacer.')) return;
      fetch(deleteBase.replace('__ID__', encodeURIComponent(id)), {
        method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': csrfToken() }
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          if (j && j.ok) { docs = docs.filter(function (x) { return x.id !== id; }); render(); }
          else alert((j && j.error) || 'No se pudo eliminar.');
        }).catch(function () { alert('No se pudo eliminar.'); });
    }

    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submit = form.querySelector('[data-doc-submit]');
      var orig = submit.innerHTML;
      submit.disabled = true; submit.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Guardando…';
      var fd = new FormData(form);
      // Inyecta los recortes generados (front/back) por si el navegador no fijó input.files.
      Object.keys(pendingFiles).forEach(function (w) { if (pendingFiles[w]) fd.set(w, pendingFiles[w], w + '.jpg'); });
      var xhr = new XMLHttpRequest();
      xhr.open('POST', saveUrl);
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.setRequestHeader('X-CSRFToken', csrfToken());
      xhr.onload = function () {
        submit.disabled = false; submit.innerHTML = orig;
        var j = {}; try { j = JSON.parse(xhr.responseText || '{}'); } catch (_e) {}
        if (xhr.status >= 200 && xhr.status < 300 && j.ok && j.document) {
          var d = j.document, i = docs.findIndex(function (x) { return x.id === d.id; });
          if (i >= 0) docs[i] = d; else docs.push(d);
          render();
          if (bsModal) bsModal.hide();
        } else {
          alert((j && j.error) || 'No se pudo guardar el documento.');
        }
      };
      xhr.onerror = function () { submit.disabled = false; submit.innerHTML = orig; alert('No se pudo guardar el documento.'); };
      xhr.send(fd);
    });

    /* ------------------- Escaneo (recorte + OCR) vía window.DocScan ------------------- */
    function ocrMsg(txt, spin) {
      var box = form.querySelector('[data-doc-ocr]');
      var msg = form.querySelector('[data-doc-ocr-msg]');
      if (!box || !msg) return;
      box.classList.remove('d-none');
      box.querySelector('i').className = spin ? 'fa fa-spinner fa-spin me-1' : 'fa fa-wand-magic-sparkles me-1';
      msg.textContent = txt;
    }

    function setInputFile(which, file) {
      var inp = form.querySelector('[data-doc-file="' + which + '"]');
      if (!inp || !file) return;
      try { var dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; } catch (e) {}
      input(which + '_url_clear').value = '';
    }
    function applyFace(which, canvas) {
      setPreview(which, canvas.toDataURL('image/jpeg', 0.9));
      return DocScan.canvasToFile(canvas, which + '.jpg').then(function (file) {
        if (file) { pendingFiles[which] = file; setInputFile(which, file); }
      });
    }
    function showCropBtn(which, on) {
      var b = form.querySelector('[data-doc-crop="' + which + '"]');
      if (b) b.classList.toggle('d-none', !on);
    }

    // Rellena los campos VACÍOS del formulario con los datos detectados; devuelve un resumen legible.
    function fillFields(data, kind) {
      var got = [];
      function put(name, val, label) { var el = input(name); if (val && el && !el.value) { el.value = val; got.push(label); } }
      put('doc_number', data.number, 'nº ' + data.number);
      put('full_name', data.full_name, data.full_name);
      put('birth_date', data.birth, 'nac. ' + fmtDate(data.birth));
      put('expiry_date', data.expiry, 'cad. ' + fmtDate(data.expiry));
      if (kind === 'PASSPORT') put('issue_date', data.issue, 'emis. ' + fmtDate(data.issue));
      return got.join(' · ');
    }

    // Procesa una foto o PDF de DNI/carnet/pasaporte: DocScan recorta, divide caras y hace OCR.
    function processIdFile(file, which) {
      var kind = input('kind').value;
      if (!window.DocScan) { ocrMsg('No se pudo cargar el lector; rellena los datos a mano.', false); return; }
      return DocScan.scan(file, kind, which, ocrMsg).then(function (res) {
        var chain = Promise.resolve();
        res.faces.forEach(function (f) {
          faceSources[f.which] = { source: f.source, rect: f.rect };
          showCropBtn(f.which, true);
          chain = chain.then(function () { return applyFace(f.which, f.canvas); });
        });
        return chain.then(function () {
          var summary = fillFields(res.data, kind);
          if (summary) ocrMsg('Detectado: ' + summary + '. Revisa y corrige si hace falta.', false);
          else ocrMsg('No se leyeron datos automáticamente; rellénalos a mano. Puedes ajustar el recorte.', false);
        });
      }).catch(function () {
        ocrMsg('No se pudo procesar el archivo. Sube las caras como imagen o rellena los datos a mano.', false);
      });
    }

    // Reajuste manual del recorte de una cara ya escaneada (botón «Ajustar recorte»).
    function reOcrFace(which, canvas, kind) {
      DocScan.ocrCanvas(canvas).then(function (t) {
        var summary = fillFields(DocScan.extractFields(t, kind), kind);
        if (summary) ocrMsg('Recorte ajustado. Detectado: ' + summary + '.', false);
      }).catch(function () {});
    }
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-doc-crop]');
      if (!b) return;
      var which = b.getAttribute('data-doc-crop'), fs = faceSources[which];
      if (!fs || !window.DocScan) return;
      DocScan.openCropTool(fs.source, fs.rect, function (newRect) {
        fs.rect = newRect;
        var c = DocScan.cropRect(fs.source, newRect);
        applyFace(which, c);
        reOcrFace(which, c, input('kind').value);
      });
    });
  });
})();
