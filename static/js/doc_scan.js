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

  /* ---- OCR rápido SOLO para la banda MRZ (lo usa el escáner con cámara) ----
     Tres cosas lo hacen casi instantáneo frente al OCR normal:
       1) un worker que se crea UNA vez y se reutiliza (T.recognize monta uno nuevo en cada llamada),
       2) la lista blanca de caracteres: en el MRZ solo hay A-Z, 0-9 y «<», y
       3) un solo idioma (eng) y modo «un bloque de texto», en vez de spa+eng y análisis de página.
     Aun así el dato bueno lo valida el MRZ con sus dígitos de control: si el OCR se equivoca, se
     descarta el fotograma y se prueba con el siguiente. */
  var mrzWorkerPromise = null;
  function mrzWorker() {
    if (mrzWorkerPromise) return mrzWorkerPromise;
    mrzWorkerPromise = loadTesseract().then(function (T) {
      if (!T.createWorker) return null;                       // versión antigua: se cae a recognize()
      return Promise.resolve(T.createWorker('eng', 1, { legacyCore: false })).then(function (w) {
        return Promise.resolve(w.setParameters({
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<',
          tessedit_pageseg_mode: '6',        // un solo bloque de texto
          user_defined_dpi: '300',
        })).then(function () { return w; });
      });
    }).catch(function () { return null; });
    return mrzWorkerPromise;
  }
  function ocrMrz(canvas) {
    return mrzWorker().then(function (w) {
      if (!w) return ocrCanvas(canvas);
      return w.recognize(canvas).then(function (res) { return (res && res.data && res.data.text) || ''; });
    }).catch(function () { return ''; });
  }
  // Arranca el worker y el modelo por adelantado (al abrir el escáner), para que el primer
  // fotograma no pague la descarga.
  function mrzWarmUp() { return mrzWorker().then(function () { return true; }).catch(function () { return false; }); }
  // El MRZ tiene muchos rellenos '<'; el anverso casi ninguno → sirve para saber cuál es el reverso.
  /* ------------------- MRZ: banda legible por máquina -------------------
     ⚠️ PARIDAD OBLIGATORIA con `mrz_utils.py` (motor del servidor, que es el que está probado con
     documentos sintéticos). Si se toca aquí, se toca allí.

     Lo que hace fiable el escaneo es que el MRZ lleva DÍGITOS DE CONTROL: se sabe si lo leído está
     bien o si el OCR se ha inventado un carácter. Antes no se validaba nada y un «8» leído como «B»
     entraba como dato bueno.

     TD1 (DNI/NIE español, 3×30) · TD3 (pasaporte, 2×44).
     ⚠️ En el DNI español el hueco del «número de documento» del MRZ lleva el número de SOPORTE
     (BAA000589); el DNI/NIE va en los DATOS OPCIONALES. Por eso antes se rascaba del texto impreso. */
  var PESOS = [7, 3, 1];
  var LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
  var PREFIJO_NIE = { X: '0', Y: '1', Z: '2' };

  function mrzClean(linea) {
    return String(linea || '').toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9<]/g, '');
  }
  function charVal(c) {
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
    if (c === '<') return 0;
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
    return 0;
  }
  function checkDigit(campo) {
    var t = 0, s = String(campo || '');
    for (var i = 0; i < s.length; i++) t += charVal(s.charAt(i)) * PESOS[i % 3];
    return String(t % 10);
  }
  function checkOk(campo, digito) {
    digito = String(digito || '').trim();
    if (digito === '' || digito === '<') return true;
    return checkDigit(campo) === digito;
  }
  function normDocNumber(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function dniLetter(numero) {
    var n = normDocNumber(numero), cuerpo = n;
    if (PREFIJO_NIE[cuerpo.charAt(0)] !== undefined) cuerpo = PREFIJO_NIE[cuerpo.charAt(0)] + cuerpo.slice(1);
    if (!/^[0-9]+$/.test(cuerpo)) return '';
    return LETRAS_DNI.charAt(parseInt(cuerpo, 10) % 23);
  }
  function isValidDni(v) {
    var n = normDocNumber(v);
    return /^[0-9]{8}[A-Z]$/.test(n) && dniLetter(n.slice(0, 8)) === n.slice(-1);
  }
  function isValidNie(v) {
    var n = normDocNumber(v);
    return /^[XYZ][0-9]{7}[A-Z]$/.test(n) && dniLetter(n.slice(0, 8)) === n.slice(-1);
  }
  function docNumberKind(v) {
    var n = normDocNumber(v);
    if (isValidDni(n)) return 'DNI';
    if (isValidNie(n)) return 'NIE';
    if (/^[A-Z]{2,3}[0-9]{6}$/.test(n) || /^[A-Z][0-9]{7,8}$/.test(n)) return 'PASSPORT';
    return 'OTHER';
  }
  // DNI o NIE VÁLIDO dentro de un texto suelto (el impreso). Se valida la letra para no colar ruido.
  function findSpanishId(text) {
    var up = String(text || '').toUpperCase();
    var patrones = [/[XYZ][-\s]?[0-9]{7}[-\s]?[A-Z]/g, /[0-9]{8}[-\s]?[A-Z]/g];
    for (var p = 0; p < patrones.length; p++) {
      var m;
      while ((m = patrones[p].exec(up))) {
        var cand = normDocNumber(m[0]);
        if (isValidDni(cand) || isValidNie(cand)) return cand;
      }
    }
    return '';
  }
  // ⚠️ El calendario se comprueba de verdad (31 de febrero no existe): su espejo en Python lo hace
  // con `date(...)`, y sin esto salían fechas imposibles que reventaban el alta al guardarlas.
  function isRealDate(y, m, d) {
    var t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }
  function mrzDate(yymmdd, futura) {
    if (!/^[0-9]{6}$/.test(yymmdd || '')) return '';
    var yy = parseInt(yymmdd.substr(0, 2), 10), mm = yymmdd.substr(2, 2), dd = yymmdd.substr(4, 2);
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return '';
    var año = futura ? (2000 + yy) : ((2000 + yy) <= new Date().getFullYear() ? 2000 + yy : 1900 + yy);
    if (!isRealDate(año, +mm, +dd)) return '';
    return año + '-' + mm + '-' + dd;
  }
  var MINUSCULAS = { de: 1, del: 1, la: 1, las: 1, los: 1, y: 1, da: 1, do: 1, dos: 1, van: 1, von: 1, der: 1, di: 1 };
  function titleCase(s) {
    return String(s || '').trim().toLowerCase().split(/(\s+)/).map(function (w, i) {
      if (!w.trim()) return w;
      if (i > 0 && MINUSCULAS[w]) return w;
      return w.replace(/(^|[-'’])([a-záéíóúñüàèìòùç])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
    }).join('');
  }
  function mrzName(campo) {
    var partes = String(campo || '').split('<<');
    var ape = (partes[0] || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    var nom = partes.length > 1 ? partes.slice(1).join('<').replace(/</g, ' ').replace(/\s+/g, ' ').trim() : '';
    var completo = nom ? (nom + ' ' + ape) : ape;
    return { last_name: titleCase(ape), first_name: titleCase(nom), full_name: titleCase(completo) };
  }
  function pad(l, n) { l = String(l || ''); while (l.length < n) l += '<'; return l.slice(0, n); }

  function parseTd1(lineas) {
    var l1 = pad(lineas[0], 30), l2 = pad(lineas[1], 30), l3 = String(lineas[2] || '');
    var soporte = l1.substr(5, 9).replace(/</g, '').trim();
    var opc1 = l1.substr(15, 15).replace(/</g, '').trim();
    var nac = l2.substr(0, 6), dcNac = l2.charAt(6), sexo = l2.charAt(7);
    var cad = l2.substr(8, 6), dcCad = l2.charAt(14);
    var nacionalidad = l2.substr(15, 3).replace(/</g, '').trim();
    var opc2 = l2.substr(18, 11).replace(/</g, '').trim();
    var numero = findSpanishId(opc1) || findSpanishId(opc2) || normDocNumber(soporte);
    var compuesto = l1.substr(5, 25) + l2.substr(0, 7) + l2.substr(8, 7) + l2.substr(18, 11);
    var checks = {
      document: checkOk(l1.substr(5, 9), l1.charAt(14)),
      birth: checkOk(nac, dcNac), expiry: checkOk(cad, dcCad),
      composite: checkOk(compuesto, l2.charAt(29)),
    };
    var out = {
      format: 'TD1', number: numero, support_number: normDocNumber(soporte),
      birth: mrzDate(nac, false), expiry: mrzDate(cad, true),
      sex: (sexo === 'M' || sexo === 'F') ? sexo : '', nationality: nacionalidad, checks: checks,
      valid: !!(checks.birth && checks.expiry),
      valid_strict: !!(checks.document && checks.birth && checks.expiry && checks.composite),
    };
    var n = mrzName(l3);
    out.full_name = n.full_name; out.first_name = n.first_name; out.last_name = n.last_name;
    return out;
  }

  function parseTd3(lineas) {
    var l1 = pad(lineas[0], 44), l2 = pad(lineas[1], 44);
    var num = l2.substr(0, 9), dcNum = l2.charAt(9);
    var nacionalidad = l2.substr(10, 3).replace(/</g, '').trim();
    var nac = l2.substr(13, 6), dcNac = l2.charAt(19), sexo = l2.charAt(20);
    var cad = l2.substr(21, 6), dcCad = l2.charAt(27);
    var personales = l2.substr(28, 14), dcPers = l2.charAt(42);
    var compuesto = l2.substr(0, 10) + l2.substr(13, 7) + l2.substr(21, 7) + l2.substr(28, 15);
    var checks = {
      document: checkOk(num, dcNum), birth: checkOk(nac, dcNac), expiry: checkOk(cad, dcCad),
      personal: checkOk(personales, dcPers), composite: checkOk(compuesto, l2.charAt(43)),
    };
    var out = {
      format: 'TD3', number: normDocNumber(num), support_number: '',
      issuing_country: l1.substr(2, 3).replace(/</g, '').trim(),
      birth: mrzDate(nac, false), expiry: mrzDate(cad, true),
      sex: (sexo === 'M' || sexo === 'F') ? sexo : '', nationality: nacionalidad, checks: checks,
      valid: !!(checks.document && checks.birth && checks.expiry),
      valid_strict: !!(checks.document && checks.birth && checks.expiry && checks.personal && checks.composite),
    };
    var n = mrzName(l1.substr(5, 39));
    out.full_name = n.full_name; out.first_name = n.first_name; out.last_name = n.last_name;
    return out;
  }

  // Líneas del OCR con pinta de MRZ.
  function mrzCandidates(text) {
    return String(text || '').split(/[\r\n]+/).map(mrzClean)
      .filter(function (l) { return l.length >= 24 && l.indexOf('<') >= 0; });
  }
  function hasMrz(text) { return mrzCandidates(text).length > 0; }

  // Lee el MRZ. Decide TD1/TD3 por la FORMA de las líneas: si suben un pasaporte diciendo que es un
  // DNI, se lee bien igualmente.
  function parseMrzText(text) {
    var lineas = mrzCandidates(text);
    if (!lineas.length) return null;
    var largas = lineas.filter(function (l) { return l.length >= 40; });
    var l1td3 = null, i;
    for (i = 0; i < largas.length; i++) if (largas[i].charAt(0) === 'P') { l1td3 = largas[i]; break; }
    if (l1td3) {
      for (i = 0; i < largas.length; i++) {
        if (largas[i] !== l1td3 && /^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}/.test(largas[i])) {
          return parseTd3([l1td3, largas[i]]);
        }
      }
    }
    var medianas = lineas.filter(function (l) { return l.length >= 26 && l.length <= 34; });
    var l1 = null, l2 = null, l3 = null;
    for (i = 0; i < medianas.length; i++) {
      if (!l1 && /^I[A-Z0-9<]/.test(medianas[i])) { l1 = medianas[i]; continue; }
      if (!l2 && /^[0-9]{6}[0-9<][MFX<][0-9]{6}/.test(medianas[i])) { l2 = medianas[i]; continue; }
    }
    for (i = 0; i < medianas.length; i++) {
      if (medianas[i] !== l1 && medianas[i] !== l2 && medianas[i].indexOf('<<') > 0 && !/^[0-9]/.test(medianas[i])) {
        l3 = medianas[i]; break;
      }
    }
    if (l2) return parseTd1([l1 || '', l2, l3 || '']);
    // Solo el renglón del nombre (OCR a medias): al menos el nombre.
    for (i = 0; i < lineas.length; i++) {
      if (lineas[i].indexOf('<<') > 0 && !/^[0-9]/.test(lineas[i])) {
        var n = mrzName(lineas[i]);
        if (!n.full_name) return null;
        return { format: '', number: '', support_number: '', birth: '', expiry: '', sex: '',
                 nationality: '', checks: {}, valid: false, valid_strict: false,
                 full_name: n.full_name, first_name: n.first_name, last_name: n.last_name };
      }
    }
    return null;
  }

  function findDates(text) {
    var out = [], m, re = /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/g;
    while ((m = re.exec(text))) {
      if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 && isRealDate(+m[3], +m[2], +m[1])) {
        out.push(m[3] + '-' + m[2] + '-' + m[1]);
      }
    }
    return out;
  }
  function normDate(s) {
    var m = String(s).match(/(\d{2})[\/\.\- ](\d{2})[\/\.\- ](\d{4})/);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return '';
    if (!isRealDate(+m[3], +m[2], +m[1])) return '';
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
    // El MRZ manda: lleva el nombre partido en apellidos/nombre y las fechas sin ambigüedad, y se
    // puede COMPROBAR con sus dígitos de control. El texto impreso solo se usa de respaldo.
    var mrz = parseMrzText(rawText) || {};
    var out = {
      number: '', number_kind: '', support_number: '', full_name: '', first_name: '', last_name: '',
      birth: '', expiry: '', issue: '', address: '', sex: '', nationality: '',
      mrz_format: mrz.format || '', mrz_valid: !!mrz.valid, mrz_valid_strict: !!mrz.valid_strict,
      checks: mrz.checks || {},
    };
    out.number = mrz.number || '';
    // En DNI/NIE, si el MRZ no ha dado un número válido, se rebusca en el impreso (con letra de
    // control: así no entra ruido del OCR).
    if (kind !== 'PASSPORT' && !(isValidDni(out.number) || isValidNie(out.number))) {
      out.number = findSpanishId(rawText) || out.number;
    }
    out.number_kind = docNumberKind(out.number);
    out.support_number = mrz.support_number || '';
    out.full_name = mrz.full_name || '';
    out.first_name = mrz.first_name || '';   // la frontera nombre/apellidos la da el MRZ
    out.last_name = mrz.last_name || '';
    out.birth = mrz.birth || '';
    out.expiry = mrz.expiry || '';
    out.sex = mrz.sex || '';
    out.nationality = mrz.nationality || '';
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
    ocrMrz: ocrMrz,
    mrzWarmUp: mrzWarmUp,
    extractFields: extractFields,
    // MRZ (espejo de `mrz_utils.py`): lo usa el escáner con cámara para validar cada fotograma.
    parseMrzText: parseMrzText,
    hasMrz: hasMrz,
    isValidDni: isValidDni,
    isValidNie: isValidNie,
    docNumberKind: docNumberKind,
    findSpanishId: findSpanishId,
    scan: scan,
    openCropTool: openCropTool
  };
})();
