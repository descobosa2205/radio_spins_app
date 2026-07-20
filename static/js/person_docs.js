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
  var TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
  var PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

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

    /* ------------------- OCR del DNI / carnet (tesseract.js) ------------------- */
    var tessLoading = null;
    function loadTesseract() {
      if (window.Tesseract) return Promise.resolve(window.Tesseract);
      if (tessLoading) return tessLoading;
      tessLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = TESSERACT_SRC;
        s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(); };
        s.onerror = function () { reject(); };
        document.head.appendChild(s);
      });
      return tessLoading;
    }

    function ocrMsg(txt, spin) {
      var box = form.querySelector('[data-doc-ocr]');
      var msg = form.querySelector('[data-doc-ocr-msg]');
      box.classList.remove('d-none');
      box.querySelector('i').className = spin ? 'fa fa-spinner fa-spin me-1' : 'fa fa-wand-magic-sparkles me-1';
      msg.textContent = txt;
    }

    /* ---- Carga perezosa de pdf.js (para leer PDFs; precedente en invitaciones.html) ---- */
    var pdfjsLoading = null;
    function loadPdfjs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      if (pdfjsLoading) return pdfjsLoading;
      pdfjsLoading = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PDFJS_SRC;
        s.onload = function () {
          if (window.pdfjsLib) {
            try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {}
            resolve(window.pdfjsLib);
          } else reject();
        };
        s.onerror = function () { reject(); };
        document.head.appendChild(s);
      });
      return pdfjsLoading;
    }

    function fileArrayBuffer(file) {
      if (file.arrayBuffer) return file.arrayBuffer();
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); });
    }

    // Devuelve Promise<[canvas,...]>: una página por canvas (una imagen = una "página").
    function fileToPageCanvases(file) {
      var isPdf = /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
      return isPdf ? pdfToCanvases(file) : imageToCanvas(file).then(function (c) { return [c]; });
    }
    function imageToCanvas(file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var maxW = 2200, scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * scale));
          c.height = Math.max(1, Math.round(img.naturalHeight * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url); resolve(c);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(); };
        img.src = url;
      });
    }
    function pdfToCanvases(file) {
      return loadPdfjs().then(function (PDFJS) {
        return fileArrayBuffer(file).then(function (buf) { return PDFJS.getDocument({ data: buf }).promise; });
      }).then(function (pdf) {
        var n = Math.min(pdf.numPages, 4), tasks = [];
        for (var i = 1; i <= n; i++) tasks.push(renderPdfPage(pdf, i));
        return Promise.all(tasks);
      });
    }
    function renderPdfPage(pdf, num) {
      return pdf.getPage(num).then(function (page) {
        var vp1 = page.getViewport({ scale: 1 });
        var scale = Math.min(3, Math.max(1, 1600 / vp1.width));
        var vp = page.getViewport({ scale: scale });
        var c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { return c; });
      });
    }

    // Recorta el borde uniforme (fondo) alrededor del contenido. Es el "recorte que se guarda".
    // Conservador: si no ve un borde claro (foto con fondo complejo) deja el canvas tal cual.
    function trimUniform(canvas) {
      var w = canvas.width, h = canvas.height;
      if (w < 60 || h < 60) return canvas;
      var sw = Math.min(w, 420), sh = Math.max(1, Math.round(h * (sw / w)));
      var tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
      var tctx = tmp.getContext('2d'); tctx.drawImage(canvas, 0, 0, sw, sh);
      var data;
      try { data = tctx.getImageData(0, 0, sw, sh).data; } catch (e) { return canvas; }
      function px(x, y) { var i = (y * sw + x) * 4; return [data[i], data[i + 1], data[i + 2]]; }
      var corners = [px(1, 1), px(sw - 2, 1), px(1, sh - 2), px(sw - 2, sh - 2)], bg = [0, 0, 0];
      for (var k = 0; k < 3; k++) { var vals = corners.map(function (c) { return c[k]; }).sort(function (a, b) { return a - b; }); bg[k] = (vals[1] + vals[2]) / 2; }
      var TH = 46, minX = sw, minY = sh, maxX = -1, maxY = -1;
      for (var y = 0; y < sh; y++) for (var x = 0; x < sw; x++) {
        var p = px(x, y);
        if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > TH) {
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) return canvas;
      var bw = maxX - minX + 1, bh = maxY - minY + 1, frac = (bw * bh) / (sw * sh);
      if (frac > 0.9 || frac < 0.1) return canvas;   // nada que quitar / demasiado pequeño (ruido)
      var scaleX = w / sw, scaleY = h / sh, pad = Math.round(0.012 * w);
      var rx = Math.max(0, Math.round(minX * scaleX) - pad), ry = Math.max(0, Math.round(minY * scaleY) - pad);
      var rw = Math.min(w - rx, Math.round(bw * scaleX) + 2 * pad), rh = Math.min(h - ry, Math.round(bh * scaleY) + 2 * pad);
      return subCanvas(canvas, rx, ry, rw, rh);
    }
    function subCanvas(canvas, sx, sy, sw, sh) {
      var c = document.createElement('canvas'); c.width = Math.max(1, sw); c.height = Math.max(1, sh);
      c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    }
    // Divide una página con las dos caras en un mismo lado: apiladas (corte horizontal) o en fila
    // (corte vertical), según la proporción. Si parece una sola tarjeta, devuelve [canvas].
    function splitTwoFaces(canvas) {
      var w = canvas.width, h = canvas.height, a = w / h;
      if (a < 1.15) return [subCanvas(canvas, 0, 0, w, Math.round(h / 2)), subCanvas(canvas, 0, Math.round(h / 2), w, h - Math.round(h / 2))];
      if (a > 2.4) return [subCanvas(canvas, 0, 0, Math.round(w / 2), h), subCanvas(canvas, Math.round(w / 2), 0, w - Math.round(w / 2), h)];
      return [canvas];
    }

    function canvasToFile(canvas, name) {
      return new Promise(function (resolve) {
        if (!canvas.toBlob) { resolve(null); return; }
        canvas.toBlob(function (blob) { resolve(blob ? new File([blob], name, { type: 'image/jpeg' }) : null); }, 'image/jpeg', 0.9);
      });
    }
    function setInputFile(which, file) {
      var inp = form.querySelector('[data-doc-file="' + which + '"]');
      if (!inp || !file) return;
      try { var dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; } catch (e) {}
      input(which + '_url_clear').value = '';
    }
    function applyFace(which, canvas) {
      setPreview(which, canvas.toDataURL('image/jpeg', 0.9));
      return canvasToFile(canvas, which + '.jpg').then(function (file) {
        if (file) { pendingFiles[which] = file; setInputFile(which, file); }
      });
    }

    // Procesa una foto o PDF de DNI/carnet/pasaporte: renderiza → recorta → (divide caras) → OCR.
    function processIdFile(file, which) {
      var kind = input('kind').value;
      ocrMsg('Procesando el documento… (puede tardar unos segundos)', true);
      return fileToPageCanvases(file).then(function (pages) {
        pages = pages.map(trimUniform);
        var faces;
        if (kind === 'PASSPORT') {
          faces = [{ which: 'front', canvas: pages[0] }];
        } else if (which === 'back') {
          faces = [{ which: 'back', canvas: pages[0] }];   // subido directamente en el reverso
        } else if (pages.length >= 2) {
          faces = [{ which: 'front', canvas: pages[0] }, { which: 'back', canvas: pages[1] }];
        } else {
          var parts = splitTwoFaces(pages[0]).map(trimUniform);
          faces = parts.length === 2
            ? [{ which: 'front', canvas: parts[0] }, { which: 'back', canvas: parts[1] }]
            : [{ which: 'front', canvas: parts[0] }];
        }
        var chain = Promise.resolve();
        faces.forEach(function (f) { chain = chain.then(function () { return applyFace(f.which, f.canvas); }); });
        return chain.then(function () { return runOcrFaces(faces, kind); });
      }).catch(function () {
        ocrMsg('No se pudo procesar el archivo. Sube las caras como imagen o rellena los datos a mano.', false);
      });
    }

    function ocrCanvas(canvas) {
      return loadTesseract().then(function (T) { return T.recognize(canvas, 'spa+eng'); })
        .then(function (res) { return (res && res.data && res.data.text) || ''; });
    }
    // El MRZ tiene muchos rellenos '<'; el anverso casi ninguno → sirve para saber cuál es el reverso.
    function hasMrz(text) { var m = String(text).match(/</g); return !!(m && m.length >= 8); }

    function runOcrFaces(faces, kind) {
      ocrMsg('Leyendo los datos…', true);
      return Promise.all(faces.map(function (f) {
        return ocrCanvas(f.canvas).then(function (t) { return { which: f.which, canvas: f.canvas, text: t }; });
      })).then(function (results) {
        // DNI/carnet con dos caras: si la marcada como anverso lleva MRZ y la otra no, intercámbialas.
        if (TWO_FACE_KINDS[kind] && results.length === 2) {
          var fi = results[0].which === 'front' ? 0 : 1, bi = 1 - fi;
          if (hasMrz(results[fi].text) && !hasMrz(results[bi].text)) {
            var tmp = results[fi]; results[fi] = results[bi]; results[bi] = tmp;
            results[fi].which = 'front'; results[bi].which = 'back';
            var chain = Promise.resolve();
            results.forEach(function (r) { chain = chain.then(function () { return applyFace(r.which, r.canvas); }); });
          }
        }
        var combined = results.map(function (r) { return r.text; }).join('\n');
        var summary = applyOcr(combined, kind);
        if (summary) ocrMsg('Detectado: ' + summary + '. Revisa y corrige si hace falta.', false);
        else ocrMsg('No se pudieron leer los datos automáticamente; rellénalos a mano.', false);
      }).catch(function () {
        ocrMsg('No se pudo ejecutar el lector automático; rellena los datos a mano.', false);
      });
    }

    // Rellena los campos VACÍOS del formulario con lo detectado; devuelve un resumen legible.
    function applyOcr(rawText, kind) {
      var got = [];
      var mrz = (kind === 'PASSPORT') ? parseMrzTd3(rawText) : parseMrz(rawText);
      if (kind === 'PASSPORT') {
        if (mrz.number && input('doc_number') && !input('doc_number').value) { input('doc_number').value = mrz.number; got.push('nº ' + mrz.number); }
      } else {
        var dni = findDni(rawText);
        if (dni && input('doc_number') && !input('doc_number').value) { input('doc_number').value = dni; got.push('nº ' + dni); }
      }
      if (mrz.fullName && input('full_name') && !input('full_name').value) { input('full_name').value = mrz.fullName; got.push(mrz.fullName); }
      if (mrz.birth && input('birth_date') && !input('birth_date').value) { input('birth_date').value = mrz.birth; got.push('nac. ' + fmtDate(mrz.birth)); }
      if (mrz.expiry && input('expiry_date') && !input('expiry_date').value) { input('expiry_date').value = mrz.expiry; got.push('cad. ' + fmtDate(mrz.expiry)); }
      // Fechas impresas (anverso sin MRZ) para nacimiento/caducidad.
      var dates = findDates(rawText);
      if (!mrz.birth && dates.length && input('birth_date') && !input('birth_date').value) { input('birth_date').value = dates[0]; got.push('nac. ' + fmtDate(dates[0])); }
      if (!mrz.expiry && dates.length > 1 && input('expiry_date') && !input('expiry_date').value) { input('expiry_date').value = dates[dates.length - 1]; got.push('cad. ' + fmtDate(dates[dates.length - 1])); }
      // Fecha de emisión (pasaporte): NO está en el MRZ; se busca en el texto impreso o se estima.
      if (kind === 'PASSPORT' && input('issue_date') && !input('issue_date').value) {
        var issue = findIssueDate(rawText, mrz.expiry || input('expiry_date').value);
        if (issue) { input('issue_date').value = issue; got.push('emis. ' + fmtDate(issue)); }
      }
      return got.join(' · ');
    }

    // ---- Parseo del MRZ (formato TD1 de 3 líneas del DNI/permiso españoles) ----
    function parseMrz(text) {
      var out = { fullName: '', birth: '', expiry: '' };
      var lines = String(text).toUpperCase().split(/\n+/).map(function (l) {
        return l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
      }).filter(function (l) { return l.length >= 20 && /[<A-Z0-9]/.test(l); });
      // Línea de nombres (apellidos<<nombre): tiene '<<' con LETRAS a ambos lados (la línea 1 del
      // MRSZ también acaba en '<<<<' de relleno, pero sin nombre detrás → se descarta). Entre las
      // candidatas se elige la que más letras tiene (la de nombres es casi toda alfabética).
      var nameCands = lines.filter(function (l) {
        var p = l.split('<<');
        return p.length >= 2 && /[A-Z]/.test(p[0]) && /[A-Z]/.test(p.slice(1).join(''));
      }).sort(function (a, b) { return (b.replace(/[^A-Z]/g, '').length) - (a.replace(/[^A-Z]/g, '').length); });
      if (nameCands.length) {
        var parts = nameCands[0].split('<<');
        var surn = (parts[0] || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
        var giv = (parts.slice(1).join(' ')).replace(/</g, ' ').replace(/\s+/g, ' ').trim();
        if (surn) out.fullName = giv ? (surn + ', ' + giv) : surn;
      }
      // Línea de fechas: empieza por 6 dígitos (YYMMDD nacimiento) + sexo + 6 dígitos (caducidad)
      var dl = lines.find(function (l) { return /^[0-9]{6}[0-9<][MFX<][0-9]{6}/.test(l); });
      if (dl) {
        out.birth = mrzDate(dl.substr(0, 6), false);
        out.expiry = mrzDate(dl.substr(8, 6), true);
      }
      return out;
    }
    function mrzDate(yymmdd, future) {
      if (!/^[0-9]{6}$/.test(yymmdd)) return '';
      var yy = parseInt(yymmdd.substr(0, 2), 10), mm = yymmdd.substr(2, 2), dd = yymmdd.substr(4, 2);
      if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return '';
      var thisYY = new Date().getFullYear() % 100;
      var year;
      if (future) year = 2000 + yy;                       // caducidad: siempre 20xx
      else year = (2000 + yy > new Date().getFullYear()) ? 1900 + yy : 2000 + yy;  // nacimiento
      return year + '-' + mm + '-' + dd;
    }

    // DNI español: 8 dígitos + letra de control (mod 23). Se valida para no colar ruido del OCR.
    function findDni(text) {
      var LET = 'TRWAGMYFPDXBNJZSQVHLCKE';
      var m, re = /(\d{8})[\-\s]?([A-Z])/g, up = String(text).toUpperCase();
      while ((m = re.exec(up))) {
        var num = parseInt(m[1], 10);
        if (LET.charAt(num % 23) === m[2]) return m[1] + m[2];
      }
      return '';
    }

    function findDates(text) {
      var out = [], m, re = /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/g;
      while ((m = re.exec(text))) {
        if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) out.push(m[3] + '-' + m[2] + '-' + m[1]);
      }
      return out;
    }

    // ---- Parseo del MRZ TD3 (pasaporte: 2 líneas de 44) ----
    // Línea 1: P<PAÍS APELLIDOS<<NOMBRES...  ·  Línea 2: nºpas(9)+chk nac(3) YYMMDD(nac)+chk sexo YYMMDD(cad)+chk ...
    function parseMrzTd3(text) {
      var out = { number: '', fullName: '', birth: '', expiry: '' };
      var lines = String(text).toUpperCase().split(/\n+/).map(function (l) {
        return l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
      }).filter(function (l) { return l.length >= 28; });
      var nameLine = lines.find(function (l) { return /^P[A-Z0-9<]/.test(l) && l.indexOf('<<') > 0; });
      if (nameLine) {
        var m = nameLine.match(/^P.?[A-Z<]{3}(.*)$/);   // quita tipo(1)+país(3)
        var np = ((m ? m[1] : nameLine)).split('<<');
        var surn = (np[0] || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
        var giv = (np.slice(1).join(' ')).replace(/</g, ' ').replace(/\s+/g, ' ').trim();
        if (surn) out.fullName = giv ? (surn + ', ' + giv) : surn;
      }
      var dataLine = lines.find(function (l) { return /^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}/.test(l); });
      if (dataLine) {
        out.number = (dataLine.substr(0, 9) || '').replace(/</g, '').trim();
        out.birth = mrzDate(dataLine.substr(13, 6), false);
        out.expiry = mrzDate(dataLine.substr(21, 6), true);
      }
      return out;
    }

    function normDate(s) {
      var m = String(s).match(/(\d{2})[\/\.\- ](\d{2})[\/\.\- ](\d{4})/);
      if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return '';
      return m[3] + '-' + m[2] + '-' + m[1];
    }
    // Fecha de emisión del pasaporte: junto a "expedición/emisión/issue", o ~10 años antes de la caducidad.
    function findIssueDate(text, expiryIso) {
      var kw = String(text).match(/(EXPEDICI[ÓO]N|EMISI[ÓO]N|ISSUE|D[ÉE]LIVRANCE)[^0-9]{0,24}(\d{2}[\/\.\- ]\d{2}[\/\.\- ]\d{4})/i);
      if (kw) { var d = normDate(kw[2]); if (d) return d; }
      var dates = findDates(text);
      if (expiryIso && dates.length) {
        var ey = parseInt(String(expiryIso).slice(0, 4), 10), best = '', bestDiff = 99;
        dates.forEach(function (dt) {
          var y = parseInt(dt.slice(0, 4), 10), gap = ey - y;
          if (gap >= 3 && gap <= 12 && Math.abs(gap - 10) < bestDiff) { bestDiff = Math.abs(gap - 10); best = dt; }
        });
        if (best) return best;
      }
      return '';
    }
  });
})();
