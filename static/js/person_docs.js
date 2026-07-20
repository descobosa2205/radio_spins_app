/* Documentos personales (DNI, carnet de conducir, tarjetas de fidelización, matrículas) en la
   ficha de personal y de tercero. Renderiza las tarjetas desde el JSON embebido, gestiona el alta
   /edición por modal (subida XHR con progreso y CSRF) y el OCR del DNI/carnet en el navegador
   (tesseract.js cargado bajo demanda: lee el MRZ del reverso y autorrellena nº, nombre, fecha de
   nacimiento y caducidad). No hace nada si la página no incluye el panel [data-person-docs]. */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  var KIND_LABEL = { DNI: 'DNI', LICENSE: 'Carnet de conducir', LOYALTY: 'Tarjeta de fidelización', PLATE: 'Vehículo' };
  var TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';

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
      var byKind = { DNI: [], LICENSE: [], LOYALTY: [], PLATE: [] };
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
      return idHtml(d);   // DNI + LICENSE
    }

    function idHtml(d) {
      var title = d.kind === 'LICENSE' ? 'Carnet de conducir' : 'DNI';
      return '<div class="docs-id" data-doc-card="' + d.id + '">' +
        actionsHtml(d) +
        '<div class="docs-id__faces">' + faceHtml(d.front_url, 'is-front') + faceHtml(d.back_url, 'is-back') + '</div>' +
        '<div class="docs-id__body">' +
          '<div class="docs-id__title"><i class="fa ' + (d.kind === 'LICENSE' ? 'fa-id-card-clip' : 'fa-id-card') + ' me-1"></i>' + esc(title) + '</div>' +
          idDataRow('Nombre', d.full_name) +
          idDataRow(d.kind === 'LICENSE' ? 'Nº carnet' : 'Nº DNI', d.doc_number) +
          idDataRow('F. nacimiento', fmtDate(d.birth_date)) +
          idDataRow('Caducidad', fmtDate(d.expiry_date)) +
        '</div>' +
      '</div>';
    }

    function loyaltyHtml(d) {
      var b = d.brand || {};
      var col1 = b.color || '#334155', col2 = b.color2 || '#64748b', fg = b.fg || '#fff';
      var name = (b.label || d.company || 'Tarjeta');
      var num = (d.doc_number || '').replace(/(.{4})/g, '$1 ').trim();
      var style = 'background:linear-gradient(135deg,' + col1 + ' 0%,' + col2 + ' 100%);color:' + fg + ';';
      var bg = d.front_url ? ('<div class="docs-loyalty__img" style="background-image:url(\'' + esc(d.front_url) + '\')"></div>') : '';
      return '<div class="docs-loyalty" data-doc-card="' + d.id + '" style="' + style + '">' +
        bg + actionsHtml(d) +
        '<div class="docs-loyalty__brand">' + esc(name) + '</div>' +
        '<div class="docs-loyalty__chip"></div>' +
        '<div class="docs-loyalty__num">' + esc(num || '—') + '</div>' +
      '</div>';
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
    if (!canEdit) return;   // sin permisos: solo lectura

    /* ------------------- Modal (alta / edición) ------------------- */
    var form = modalEl ? modalEl.querySelector('[data-doc-form]') : null;
    function fld(name) { return form.querySelector('[data-doc-field="' + name + '"]'); }
    function input(name) { return form.querySelector('[name="' + name + '"]'); }
    function setPreview(which, url) {
      var img = form.querySelector('[data-doc-preview="' + which + '"]');
      var hint = form.querySelector('[data-doc-drop="' + which + '"] .docs-drop__hint');
      if (url) { img.src = url; img.classList.remove('d-none'); if (hint) hint.classList.add('d-none'); }
      else { img.src = ''; img.classList.add('d-none'); if (hint) hint.classList.remove('d-none'); }
    }

    function configureForKind(kind) {
      var isId = (kind === 'DNI' || kind === 'LICENSE');
      form.querySelector('[data-doc-modal-title]').textContent = KIND_LABEL[kind] || 'Documento';
      // Imágenes: DNI/carnet dos caras; fidelización/matrícula solo una (opcional)
      form.querySelector('[data-doc-images]').classList.remove('d-none');
      form.querySelector('[data-doc-back-wrap]').classList.toggle('d-none', !isId);
      var frontLabel = form.querySelector('[data-doc-front-label]');
      frontLabel.textContent = isId ? 'Anverso (cara con la foto)'
        : (kind === 'LOYALTY' ? 'Foto de la tarjeta (opcional)' : 'Foto del coche (opcional)');
      // Campos
      show(fld('full_name'), isId);
      show(fld('doc_number'), true);
      show(fld('birth_date'), isId);
      show(fld('expiry_date'), isId);
      show(fld('company'), kind === 'LOYALTY');
      show(fld('label'), kind === 'PLATE');
      // Etiquetas dinámicas
      form.querySelector('[data-doc-number-label]').textContent =
        kind === 'DNI' ? 'Nº DNI' : kind === 'LICENSE' ? 'Nº de carnet'
        : kind === 'LOYALTY' ? 'Nº de tarjeta' : 'Matrícula';
      var labLab = form.querySelector('[data-doc-label-label]');
      if (labLab) labLab.textContent = 'Nombre del vehículo';
      form.querySelector('[data-doc-apply-wrap]').classList.toggle('d-none', !isId);
      form.querySelector('[data-doc-ocr]').classList.add('d-none');
    }
    function show(el, on) { if (el) el.classList.toggle('d-none', !on); }

    function openModal(kind, doc) {
      form.reset();
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

    // Previsualización + OCR al elegir imagen
    form.querySelectorAll('[data-doc-file]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var which = inp.getAttribute('data-doc-file');
        var f = inp.files && inp.files[0];
        if (!f) { return; }
        var url = URL.createObjectURL(f);
        setPreview(which, url);
        input(which + '_url_clear').value = '';   // se sube una nueva, no borrar
        var kind = input('kind').value;
        if (kind === 'DNI' || kind === 'LICENSE') runOcr(f, which);
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

    function runOcr(file, which) {
      ocrMsg('Leyendo el documento… (puede tardar unos segundos)', true);
      loadTesseract().then(function (T) {
        // El reverso lleva el MRSZ (‹‹‹): whitelist estricta. El anverso, texto normal en español.
        var isBack = (which === 'back');
        var opts = isBack ? { tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' } : {};
        return T.recognize(file, isBack ? 'eng' : 'spa+eng', opts);
      }).then(function (res) {
        var text = (res && res.data && res.data.text) || '';
        var found = applyOcr(text, which === 'back');
        if (found) ocrMsg('Detectado: ' + found + '. Revisa y corrige si hace falta.', false);
        else ocrMsg('No se pudieron leer los datos automáticamente; rellénalos a mano.', false);
      }).catch(function () {
        ocrMsg('No se pudo ejecutar el lector automático; rellena los datos a mano.', false);
      });
    }

    // Rellena los campos VACÍOS del formulario con lo detectado; devuelve un resumen legible.
    function applyOcr(rawText, preferMrz) {
      var got = [];
      var mrz = parseMrz(rawText);
      var dni = findDni(rawText);
      if (dni && !input('doc_number').value) { input('doc_number').value = dni; got.push('nº ' + dni); }
      if (mrz.fullName && input('full_name') && !input('full_name').value) { input('full_name').value = mrz.fullName; got.push(mrz.fullName); }
      if (mrz.birth && input('birth_date') && !input('birth_date').value) { input('birth_date').value = mrz.birth; got.push('nac. ' + fmtDate(mrz.birth)); }
      if (mrz.expiry && input('expiry_date') && !input('expiry_date').value) { input('expiry_date').value = mrz.expiry; got.push('cad. ' + fmtDate(mrz.expiry)); }
      // Anverso sin MRZ: intenta fechas sueltas dd/mm/aaaa para nacimiento/caducidad.
      if (!mrz.birth) {
        var dates = findDates(rawText);
        if (dates.length && input('birth_date') && !input('birth_date').value) { input('birth_date').value = dates[0]; got.push('nac. ' + fmtDate(dates[0])); }
        if (dates.length > 1 && input('expiry_date') && !input('expiry_date').value) { input('expiry_date').value = dates[dates.length - 1]; got.push('cad. ' + fmtDate(dates[dates.length - 1])); }
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
  });
})();
