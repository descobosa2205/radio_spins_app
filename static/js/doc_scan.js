/* DocScan — módulo global (window.DocScan) para escanear documentos de identidad (DNI, carnet,
   pasaporte) desde FOTO o PDF, todo en el navegador:
     - render de PDF con pdf.js (bajo demanda) e imágenes a canvas,
     - auto-recorte del fondo (trim), división de las dos caras si vienen en una misma página,
     - OCR con tesseract.js (bajo demanda): MRZ TD1 (DNI/carnet) y TD3 (pasaporte),
     - herramienta de recorte MANUAL (openCropTool) por si el recorte automático no es correcto.
   Lo usan person_docs.js (adjuntar documento a una persona) y doc_intake.js (alta con documento).
   No toca el DOM de ninguna ficha: devuelve canvases y datos; cada consumidor los cablea a su UI. */
(function () {
  'use strict';

  var TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
  var PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var ID_KINDS = { DNI: 1, LICENSE: 1, PASSPORT: 1 };   // documentos con foto/PDF + OCR
  var TWO_FACE_KINDS = { DNI: 1, LICENSE: 1 };            // dos caras (el pasaporte solo tiene una)

  /* ------------------- Carga perezosa de librerías ------------------- */
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

  /* ------------------- Render de fichero → canvases (una página por canvas) ------------------- */
  function fileArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file); });
  }
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

  /* ------------------- Recorte automático (bounding box del contenido vs fondo uniforme) ------------------- */
  function subCanvas(canvas, sx, sy, sw, sh) {
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
    c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  // Devuelve {x,y,w,h} del contenido (o el canvas entero si no hay un borde uniforme claro).
  function contentRect(canvas) {
    var w = canvas.width, h = canvas.height, full = { x: 0, y: 0, w: w, h: h };
    if (w < 60 || h < 60) return full;
    var sw = Math.min(w, 420), sh = Math.max(1, Math.round(h * (sw / w)));
    var tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
    var tctx = tmp.getContext('2d'); tctx.drawImage(canvas, 0, 0, sw, sh);
    var data;
    try { data = tctx.getImageData(0, 0, sw, sh).data; } catch (e) { return full; }
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
    if (maxX < 0) return full;
    var bw = maxX - minX + 1, bh = maxY - minY + 1, frac = (bw * bh) / (sw * sh);
    if (frac > 0.9 || frac < 0.1) return full;   // nada que quitar / demasiado pequeño (ruido)
    var scaleX = w / sw, scaleY = h / sh, pad = Math.round(0.012 * w);
    var rx = Math.max(0, Math.round(minX * scaleX) - pad), ry = Math.max(0, Math.round(minY * scaleY) - pad);
    var rw = Math.min(w - rx, Math.round(bw * scaleX) + 2 * pad), rh = Math.min(h - ry, Math.round(bh * scaleY) + 2 * pad);
    return { x: rx, y: ry, w: rw, h: rh };
  }
  function cropRect(canvas, r) { return subCanvas(canvas, r.x, r.y, r.w, r.h); }

  // Divide la región de contenido en dos caras: apiladas (corte horizontal) o en fila (corte
  // vertical), según la proporción del contenido. Devuelve [{source,rect}] (1 o 2 caras).
  function splitFaces(page) {
    var r = contentRect(page), a = r.w / r.h;
    if (a < 1.15) {
      var half = Math.round(r.h / 2);
      var top = subCanvas(page, r.x, r.y, r.w, half), bot = subCanvas(page, r.x, r.y + half, r.w, r.h - half);
      return [top, bot];
    }
    if (a > 2.4) {
      var halfw = Math.round(r.w / 2);
      var left = subCanvas(page, r.x, r.y, halfw, r.h), right = subCanvas(page, r.x + halfw, r.y, r.w - halfw, r.h);
      return [left, right];
    }
    return [page];
  }

  function canvasToFile(canvas, name) {
    return new Promise(function (resolve) {
      if (!canvas.toBlob) { resolve(null); return; }
      canvas.toBlob(function (blob) { resolve(blob ? new File([blob], name, { type: 'image/jpeg' }) : null); }, 'image/jpeg', 0.9);
    });
  }

  /* ------------------- OCR ------------------- */
  function ocrCanvas(canvas) {
    return loadTesseract().then(function (T) { return T.recognize(canvas, 'spa+eng'); })
      .then(function (res) { return (res && res.data && res.data.text) || ''; });
  }
  // El MRZ tiene muchos rellenos '<'; el anverso casi ninguno → sirve para saber cuál es el reverso.
  function hasMrz(text) { var m = String(text).match(/</g); return !!(m && m.length >= 8); }

  function mrzDate(yymmdd, future) {
    if (!/^[0-9]{6}$/.test(yymmdd)) return '';
    var yy = parseInt(yymmdd.substr(0, 2), 10), mm = yymmdd.substr(2, 2), dd = yymmdd.substr(4, 2);
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return '';
    var year;
    if (future) year = 2000 + yy;
    else year = (2000 + yy > new Date().getFullYear()) ? 1900 + yy : 2000 + yy;
    return year + '-' + mm + '-' + dd;
  }
  // MRZ TD1 (DNI / permiso de conducir españoles: 3 líneas de 30).
  function parseMrz(text) {
    var out = { fullName: '', birth: '', expiry: '' };
    var lines = String(text).toUpperCase().split(/\n+/).map(function (l) {
      return l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
    }).filter(function (l) { return l.length >= 20 && /[<A-Z0-9]/.test(l); });
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
    var dl = lines.find(function (l) { return /^[0-9]{6}[0-9<][MFX<][0-9]{6}/.test(l); });
    if (dl) { out.birth = mrzDate(dl.substr(0, 6), false); out.expiry = mrzDate(dl.substr(8, 6), true); }
    return out;
  }
  // MRZ TD3 (pasaporte: 2 líneas de 44).
  function parseMrzTd3(text) {
    var out = { number: '', fullName: '', birth: '', expiry: '' };
    var lines = String(text).toUpperCase().split(/\n+/).map(function (l) {
      return l.replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
    }).filter(function (l) { return l.length >= 28; });
    var nameLine = lines.find(function (l) { return /^P[A-Z0-9<]/.test(l) && l.indexOf('<<') > 0; });
    if (nameLine) {
      var m = nameLine.match(/^P.?[A-Z<]{3}(.*)$/);
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
  // DNI español: 8 dígitos + letra de control (mod 23). Se valida para no colar ruido del OCR.
  function findDni(text) {
    var LET = 'TRWAGMYFPDXBNJZSQVHLCKE';
    var m, re = /(\d{8})[\-\s]?([A-Z])/g, up = String(text).toUpperCase();
    while ((m = re.exec(up))) { var num = parseInt(m[1], 10); if (LET.charAt(num % 23) === m[2]) return m[1] + m[2]; }
    return '';
  }
  function findDates(text) {
    var out = [], m, re = /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/g;
    while ((m = re.exec(text))) { if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) out.push(m[3] + '-' + m[2] + '-' + m[1]); }
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
      dates.forEach(function (dt) { var y = parseInt(dt.slice(0, 4), 10), gap = ey - y; if (gap >= 3 && gap <= 12 && Math.abs(gap - 10) < bestDiff) { bestDiff = Math.abs(gap - 10); best = dt; } });
      if (best) return best;
    }
    return '';
  }

  // Domicilio del DNI (reverso, tras «DOMICILIO»). Best-effort: no está en el MRZ; texto libre.
  function findAddress(text) {
    var up = String(text).toUpperCase();
    var i = up.indexOf('DOMICILIO');
    if (i < 0) return '';
    var after = String(text).slice(i + 9);
    // Corta en la siguiente etiqueta conocida del reverso o al empezar el MRZ (rellenos '<').
    var stop = after.search(/(LUGAR\s+DE\s+NACIMIENTO|HIJ[OA]\s+DE|EQUIPO|IDESP|N[º°]?\s*SOPORT|<<|[A-Z0-9<]{12,})/i);
    var chunk = (stop > 0 ? after.slice(0, stop) : after.slice(0, 90));
    chunk = chunk.replace(/^[\s:.\-]+/, '').replace(/[^0-9A-Za-zÁÉÍÓÚÑÜáéíóúñü.,ºª/\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return chunk.length >= 5 ? chunk : '';
  }

  // Extrae los campos oficiales del texto OCR combinado (puro, no toca el DOM).
  function extractFields(rawText, kind) {
    var mrz = (kind === 'PASSPORT') ? parseMrzTd3(rawText) : parseMrz(rawText);
    var out = { number: '', full_name: '', birth: '', expiry: '', issue: '', address: '' };
    out.number = (kind === 'PASSPORT') ? (mrz.number || '') : (findDni(rawText) || '');
    out.full_name = mrz.fullName || '';
    out.birth = mrz.birth || '';
    out.expiry = mrz.expiry || '';
    var dates = findDates(rawText);
    if (!out.birth && dates.length) out.birth = dates[0];
    if (!out.expiry && dates.length > 1) out.expiry = dates[dates.length - 1];
    if (kind === 'PASSPORT') out.issue = findIssueDate(rawText, out.expiry) || '';
    if (kind === 'DNI') out.address = findAddress(rawText);
    return out;
  }

  /* ------------------- Orquestación: escanear un fichero ------------------- */
  // Devuelve Promise<{faces:[{which,canvas,source,rect}], data:{number,full_name,birth,expiry,issue}}>.
  // `which` = 'front'|'back'. `source` = canvas completo de esa cara (para el recorte manual);
  // `rect` = recorte automático dentro de `source`; `canvas` = recorte ya aplicado.
  function scan(file, kind, which, onProgress) {
    onProgress && onProgress('Procesando el documento… (puede tardar unos segundos)', true);
    return fileToPageCanvases(file).then(function (pages) {
      var faces;
      function mk(w, src) { return { which: w, source: src, rect: contentRect(src) }; }
      if (kind === 'PASSPORT') {
        faces = [mk('front', pages[0])];
      } else if (which === 'back') {
        faces = [mk('back', pages[0])];
      } else if (pages.length >= 2) {
        faces = [mk('front', pages[0]), mk('back', pages[1])];
      } else {
        var parts = splitFaces(pages[0]);
        faces = parts.length === 2 ? [mk('front', parts[0]), mk('back', parts[1])] : [mk('front', parts[0])];
      }
      faces.forEach(function (f) { f.canvas = cropRect(f.source, f.rect); });
      onProgress && onProgress('Leyendo los datos…', true);
      return Promise.all(faces.map(function (f) {
        return ocrCanvas(f.canvas).then(function (t) { f.text = t; return f; });
      })).then(function () {
        // DNI/carnet: si la cara marcada como anverso lleva MRZ y la otra no, intercambia etiquetas.
        if (TWO_FACE_KINDS[kind] && faces.length === 2) {
          var fi = faces[0].which === 'front' ? 0 : 1, bi = 1 - fi;
          if (hasMrz(faces[fi].text) && !hasMrz(faces[bi].text)) { faces[fi].which = 'back'; faces[bi].which = 'front'; }
        }
        var combined = faces.map(function (f) { return f.text; }).join('\n');
        return { faces: faces, data: extractFields(combined, kind) };
      });
    });
  }

  /* ------------------- Herramienta de recorte MANUAL ------------------- */
  // openCropTool(sourceCanvas, rect, onApply) — muestra la imagen y un recuadro ajustable; al aplicar
  // llama onApply(nuevoRect) en coordenadas de sourceCanvas. rect opcional (por defecto, todo).
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function openCropTool(sourceCanvas, rect, onApply) {
    var W = sourceCanvas.width, H = sourceCanvas.height;
    rect = rect || { x: 0, y: 0, w: W, h: H };
    var vw = Math.min(window.innerWidth * 0.92, 900), vh = window.innerHeight * 0.72;
    var scale = Math.min(vw / W, vh / H, 1); if (!isFinite(scale) || scale <= 0) scale = 1;
    var dispW = Math.round(W * scale), dispH = Math.round(H * scale);

    var ov = document.createElement('div');
    ov.className = 'dscrop-ov';
    ov.innerHTML =
      '<div class="dscrop-panel">' +
        '<div class="dscrop-head"><i class="fa fa-crop-simple me-2"></i>Ajusta el recorte y pulsa Aplicar</div>' +
        '<div class="dscrop-stage" style="width:' + dispW + 'px;height:' + dispH + 'px;">' +
          '<img class="dscrop-img" src="' + sourceCanvas.toDataURL('image/jpeg', 0.9) + '" style="width:' + dispW + 'px;height:' + dispH + 'px;">' +
          '<div class="dscrop-box">' +
            '<span class="dscrop-h" data-h="nw"></span><span class="dscrop-h" data-h="ne"></span>' +
            '<span class="dscrop-h" data-h="sw"></span><span class="dscrop-h" data-h="se"></span>' +
          '</div>' +
        '</div>' +
        '<div class="dscrop-foot">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm" data-dscrop-cancel>Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" data-dscrop-apply><i class="fa fa-check me-1"></i>Aplicar recorte</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var box = ov.querySelector('.dscrop-box');
    // Estado del recuadro en coordenadas de pantalla (px del stage).
    var st = { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
    function paint() { box.style.left = st.x + 'px'; box.style.top = st.y + 'px'; box.style.width = st.w + 'px'; box.style.height = st.h + 'px'; }
    paint();

    var drag = null;  // {mode:'move'|handle, sx,sy, ox,oy,ow,oh}
    function onDown(e) {
      var h = e.target.closest('.dscrop-h');
      var p = pt(e);
      drag = { mode: h ? h.getAttribute('data-h') : (e.target.closest('.dscrop-box') ? 'move' : null), sx: p.x, sy: p.y, ox: st.x, oy: st.y, ow: st.w, oh: st.h };
      if (!drag.mode) { drag = null; return; }
      e.preventDefault();
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    }
    function pt(e) { var r = box.parentNode.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function onMove(e) {
      if (!drag) return;
      var p = pt(e), dx = p.x - drag.sx, dy = p.y - drag.sy, MIN = 24;
      if (drag.mode === 'move') {
        st.x = clamp(drag.ox + dx, 0, dispW - st.w); st.y = clamp(drag.oy + dy, 0, dispH - st.h);
      } else {
        var x1 = drag.ox, y1 = drag.oy, x2 = drag.ox + drag.ow, y2 = drag.oy + drag.oh;
        if (drag.mode.indexOf('w') >= 0) x1 = clamp(drag.ox + dx, 0, x2 - MIN);
        if (drag.mode.indexOf('e') >= 0) x2 = clamp(drag.ox + drag.ow + dx, x1 + MIN, dispW);
        if (drag.mode.indexOf('n') >= 0) y1 = clamp(drag.oy + dy, 0, y2 - MIN);
        if (drag.mode.indexOf('s') >= 0) y2 = clamp(drag.oy + drag.oh + dy, y1 + MIN, dispH);
        st.x = x1; st.y = y1; st.w = x2 - x1; st.h = y2 - y1;
      }
      paint();
    }
    function onUp() { drag = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    box.addEventListener('pointerdown', onDown);

    function close() { ov.remove(); }
    ov.querySelector('[data-dscrop-cancel]').addEventListener('click', close);
    ov.querySelector('[data-dscrop-apply]').addEventListener('click', function () {
      var out = {
        x: Math.round(clamp(st.x / scale, 0, W)), y: Math.round(clamp(st.y / scale, 0, H)),
        w: Math.round(clamp(st.w / scale, 1, W)), h: Math.round(clamp(st.h / scale, 1, H))
      };
      close();
      if (onApply) onApply(out);
    });
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
  }

  window.DocScan = {
    ID_KINDS: ID_KINDS,
    TWO_FACE_KINDS: TWO_FACE_KINDS,
    loadTesseract: loadTesseract,
    loadPdfjs: loadPdfjs,
    fileToPageCanvases: fileToPageCanvases,
    contentRect: contentRect,
    cropRect: cropRect,
    subCanvas: subCanvas,
    canvasToFile: canvasToFile,
    ocrCanvas: ocrCanvas,
    extractFields: extractFields,
    scan: scan,
    openCropTool: openCropTool
  };
})();
