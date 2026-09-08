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

  /* ⚠️⚠️ UNA FOTO DE UNA SOLA CARA NO SE PARTE POR LA MITAD (bug real). El criterio era la
     PROPORCIÓN del contenido, y una foto de móvil EN VERTICAL de un DNI (proporción ~0,75) se
     partía en dos mitades: se leía medio documento por arriba y medio por abajo, o sea nada. Y la
     proporción no puede distinguirlo, porque una foto 3:4 partida en dos da justo dos trozos con
     la forma de una tarjeta.
     Lo que SÍ lo distingue es que entre dos documentos apilados queda una franja de FONDO: se mira
     la «tinta» por filas (o por columnas) y solo se parte si hay un hueco de verdad en el medio. */
  function proyeccionTinta(canvas, r, porFilas) {
    var W = 200, H = Math.max(1, Math.round(r.h * (W / r.w)));
    if (r.w < 40 || r.h < 40) return null;
    var tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    var ctx = tmp.getContext('2d');
    ctx.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, W, H);
    var data;
    try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { return null; }
    function gris(x, y) { var i = (y * W + x) * 4; return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; }
    var esquinas = [gris(1, 1), gris(W - 2, 1), gris(1, H - 2), gris(W - 2, H - 2)].sort(function (a, b) { return a - b; });
    var fondo = (esquinas[1] + esquinas[2]) / 2, TH = 40;
    var n = porFilas ? H : W, otro = porFilas ? W : H, acc = [], i, j;
    for (i = 0; i < n; i++) {
      var suma = 0;
      for (j = 0; j < otro; j++) {
        var g = porFilas ? gris(j, i) : gris(i, j);
        if (Math.abs(g - fondo) > TH) suma++;
      }
      acc.push(suma);
    }
    return acc;
  }
  function hayHuecoEnMedio(canvas, r, porFilas) {
    var pr = proyeccionTinta(canvas, r, porFilas);
    if (!pr || !pr.length) return false;
    var max = 0, i;
    for (i = 0; i < pr.length; i++) if (pr[i] > max) max = pr[i];
    if (max < 6) return false;                       // no hay contenido que separar
    var n = pr.length, ini = Math.round(n * 0.30), fin = Math.round(n * 0.70);
    var mejor = 0, seguidas = 0;
    for (i = ini; i < fin; i++) {
      if (pr[i] < max * 0.06) { seguidas++; if (seguidas > mejor) mejor = seguidas; } else seguidas = 0;
    }
    return mejor >= Math.max(4, Math.round(n * 0.05));
  }
  // Devuelve 1 o 2 caras del contenido de la página.
  function splitFaces(page) {
    var r = contentRect(page), a = r.w / r.h;
    if (a < 1.35 && hayHuecoEnMedio(page, r, true)) {        // dos caras APILADAS
      var half = Math.round(r.h / 2);
      return [subCanvas(page, r.x, r.y, r.w, half), subCanvas(page, r.x, r.y + half, r.w, r.h - half)];
    }
    if (a > 2.4 && hayHuecoEnMedio(page, r, false)) {        // dos caras EN FILA
      var halfw = Math.round(r.w / 2);
      return [subCanvas(page, r.x, r.y, halfw, r.h), subCanvas(page, r.x + halfw, r.y, r.w - halfw, r.h)];
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

  /* ---- OCR de TEXTO: la CARA DELANTERA (que no tiene MRZ) ----
     Va en su propio worker para no cambiarle los parámetros al del MRZ en cada fotograma, y con el
     MISMO idioma (eng): así no hay que descargar otro modelo, que en un móvil son varios megas más.
     Los rótulos y los nombres del DNI van en mayúsculas, así que la lista de caracteres se queda en
     A-Z, dígitos y los separadores de las fechas. */
  var frontWorkerPromise = null;
  function frontWorker() {
    if (frontWorkerPromise) return frontWorkerPromise;
    frontWorkerPromise = loadTesseract().then(function (T) {
      if (!T.createWorker) return null;
      return Promise.resolve(T.createWorker('eng', 1, { legacyCore: false })).then(function (w) {
        return Promise.resolve(w.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ",
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        })).then(function () { return w; });
      });
    }).catch(function () { return null; });
    return frontWorkerPromise;
  }
  function ocrFront(canvas) {
    return frontWorker().then(function (w) {
      if (!w) return ocrCanvas(canvas);
      return w.recognize(canvas).then(function (res) { return (res && res.data && res.data.text) || ''; });
    }).catch(function () { return ''; });
  }
  function frontWarmUp() { return frontWorker().then(function () { return true; }).catch(function () { return false; }); }
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
    // ⚠️ Los límites de los extremos son imprescindibles: sin ellos «PEDIDO 20260908 REFERENCIA»
    // daba el «DNI» 20260908R —la letra la aportaba la palabra de al lado, y la de control acierta
    // por azar 1 de cada 23 veces—.
    var patrones = [/(?:^|[^A-Z0-9])([XYZ][-\s]?[0-9]{7}[-\s]?[A-Z])(?![A-Z0-9])/g,
                    /(?:^|[^A-Z0-9])([0-9]{8}[-\s]?[A-Z])(?![A-Z0-9])/g];
    for (var p = 0; p < patrones.length; p++) {
      var m;
      while ((m = patrones[p].exec(up))) {
        var cand = normDocNumber(m[1]);
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

  /* ============== REPARAR LO QUE EL OCR LEE MAL (por POSICIÓN) ==============
     ⚠️⚠️ ESTO ES LO QUE HACE QUE EL LECTOR FUNCIONE DE VERDAD. En el MRZ cada posición SOLO puede
     ser una cosa: una fecha son seis DÍGITOS y la nacionalidad tres LETRAS. Así que cuando el OCR
     devuelve una «O» donde va un cero, no hay que descartar la lectura: hay que traducirla.
     Antes, UNA sola «O» en la fecha tiraba el MRZ ENTERO (ni el nombre se salvaba) y la cámara se
     quedaba «pensando» hasta agotar los intentos: es justo lo que se veía como «el lector no
     funciona» y «tarda muchísimo».
     ⚠️ Las letras que NO se parecen a ningún dígito (H, K, M, N, W) no se traducen: si aparecen en
     un campo numérico, la lectura está tan mal que reparar sería inventar.
     ⚠️ PARIDAD OBLIGATORIA con `mrz_utils.py` (que es el que tiene la prueba de regresión,
     `tools/check_mrz.py`). Si se toca aquí, se toca allí. */
  var A_DIGITO = { O: '0', Q: '0', D: '0', U: '0', C: '0', I: '1', L: '1', J: '1', V: '1',
                   Z: '2', E: '3', A: '4', S: '5', G: '6', T: '7', Y: '7', B: '8', R: '8', P: '9' };
  var A_LETRA = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G' };
  // La «M» del sexo se confunde con H/N/W y la «F» con E/P/R. Lo que no se reconozca queda como
  // «no informado» («<»), que ya NO invalida la línea: antes un sexo mal leído tiraba el MRZ.
  var SEXO_OCR = { H: 'M', N: 'M', W: 'M', K: 'M', E: 'F', P: 'F', R: 'F' };
  var CONF = '0-9' + Object.keys(A_DIGITO).sort().join('');

  function esDigito(c) { return c >= '0' && c <= '9'; }
  // El «<» del MRZ se confunde a menudo con K, L o C: una racha de 3+ letras IDÉNTICAS es relleno.
  // ⚠️ Solo se aplica a las zonas de RELLENO (opcionales y nombre), nunca al número de documento:
  // un pasaporte «AAA123456» tiene tres letras iguales de verdad.
  function rellenos(campo) {
    return String(campo || '').replace(/([A-Z])\1{2,}/g, function (m) { return new Array(m.length + 1).join('<'); });
  }
  function aDigitos(campo) {
    var s = String(campo || ''), out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += (esDigito(c) || c === '<') ? c : (A_DIGITO[c] || c);
    }
    return out;
  }
  function aLetras(campo) {
    var s = String(campo || ''), out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += esDigito(c) ? (A_LETRA[c] || c) : c;
    }
    return out;
  }
  function sexoMrz(c) {
    c = String(c || '<').toUpperCase();
    if (c === 'M' || c === 'F' || c === 'X' || c === '<') return c;
    return SEXO_OCR[c] || '<';
  }
  function soloDigitos(s) { var n = 0; for (var i = 0; i < s.length; i++) if (esDigito(s.charAt(i))) n++; return n; }

  // Corrige UN carácter del campo si con eso cuadra su dígito de control y la comprobación extra
  // (p. ej. «es una fecha que existe»). Solo si la solución es ÚNICA: con dudas se devuelve lo
  // leído, que es mejor descartar el fotograma que colar un dato inventado.
  function arreglaPorCheck(campo, digito, valida) {
    campo = String(campo || '');
    if (checkOk(campo, digito) && (!valida || valida(campo))) return campo;
    if (!/^[0-9]$/.test(String(digito || '')) || !/^[0-9]+$/.test(campo)) return campo;
    var encontradas = [];
    for (var i = 0; i < campo.length; i++) {
      for (var d = 0; d < 10; d++) {
        var alt = String(d);
        if (alt === campo.charAt(i)) continue;
        var cand = campo.slice(0, i) + alt + campo.slice(i + 1);
        if (checkDigit(cand) === String(digito) && (!valida || valida(cand))) {
          encontradas.push(cand);
          if (encontradas.length > 1) return campo;
        }
      }
    }
    return encontradas.length === 1 ? encontradas[0] : campo;
  }

  function reparaTd1(l1, l2, l3) {
    l1 = pad(l1, 30); l2 = pad(l2, 30);
    var n1 = aLetras(l1.substr(0, 5)) + l1.substr(5, 9) + aDigitos(l1.charAt(14)) + rellenos(l1.substr(15, 15));
    if (n1.charAt(0) === '1' || n1.charAt(0) === '|') n1 = 'I' + n1.slice(1);   // «ID» leído «1D»
    var n2 = aDigitos(l2.substr(0, 6)) + aDigitos(l2.charAt(6)) + sexoMrz(l2.charAt(7)) +
             aDigitos(l2.substr(8, 6)) + aDigitos(l2.charAt(14)) + aLetras(l2.substr(15, 3)) +
             rellenos(l2.substr(18, 11)) + aDigitos(l2.charAt(29));
    return [n1, n2, aLetras(rellenos(l3))];   // un nombre no lleva dígitos ni letras triples
  }
  function reparaTd3(l1, l2) {
    l1 = pad(l1, 44); l2 = pad(l2, 44);
    var n1 = aLetras(l1.substr(0, 5) + rellenos(l1.substr(5, 39)));  // país + nombre: alfabético
    var n2 = l2.substr(0, 9) + aDigitos(l2.charAt(9)) + aLetras(l2.substr(10, 3)) +
             aDigitos(l2.substr(13, 6)) + aDigitos(l2.charAt(19)) + sexoMrz(l2.charAt(20)) +
             aDigitos(l2.substr(21, 6)) + aDigitos(l2.charAt(27)) + rellenos(l2.substr(28, 14)) +
             aDigitos(l2.charAt(42)) + aDigitos(l2.charAt(43));
    return [n1, n2];
  }

  // DNI/NIE con las confusiones del OCR corregidas, o '' si no cuadra la letra de control.
  // ⚠️ La LETRA no se toca nunca: es la comprobación. Reparándola, cualquier tira de ocho dígitos
  // daría un «DNI válido» y entraría ruido.
  var A_LETRA_CONTROL = { '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G',
                          '7': 'T', '8': 'B', '9': 'G' };
  function reparaDni(valor, letraConfundible) {
    var crudo = normDocNumber(valor);
    if (isValidDni(crudo) || isValidNie(crudo)) return crudo;
    if (crudo.length !== 9) return '';
    var cuerpo = crudo.slice(0, 8), letra = crudo.charAt(8);
    if (!/^[A-Z]$/.test(letra)) {
      // ⚠️ La letra de control leída como un DÍGITO («12345678Z» → «123456782») es el fallo más
      // típico del OCR del impreso. Se traduce a la letra que se le parece y se comprueba el
      // mod-23: si cuadra, es la buena. Solo cuando el número viene pegado a su rótulo («DNI …»),
      // porque en un texto suelto cualquier teléfono de nueve dígitos podría colar.
      if (!(letraConfundible && A_LETRA_CONTROL[letra] && /^[0-9]{8}$/.test(cuerpo))) return '';
      letra = A_LETRA_CONTROL[letra];
    }
    var prefijo = '';
    if ('XYZ'.indexOf(cuerpo.charAt(0)) >= 0) { prefijo = cuerpo.charAt(0); cuerpo = cuerpo.slice(1); }
    var cand = prefijo + aDigitos(cuerpo) + letra;
    return (isValidDni(cand) || isValidNie(cand)) ? cand : '';
  }

  // DNI o NIE en un texto que puede traer confusiones del OCR. Primero en limpio; solo si no hay
  // nada se admiten los caracteres confundibles, y entonces se exige que al menos 6 de los 8 sean
  // dígitos DE VERDAD (si no, cualquier palabra de nueve letras podría traducirse y colar por azar:
  // la letra de control solo acierta 1 de cada 23).
  function findSpanishIdOcr(text) {
    var limpio = findSpanishId(text);
    if (limpio) return limpio;
    var up = String(text || '').toUpperCase();
    var pats = [new RegExp('(?:^|[^A-Z0-9])([XYZ][' + CONF + ']{7}[A-Z])(?![A-Z0-9])', 'g'),
                new RegExp('(?:^|[^A-Z0-9])([' + CONF + ']{8}[A-Z])(?![A-Z0-9])', 'g')];
    for (var p = 0; p < pats.length; p++) {
      var m;
      while ((m = pats[p].exec(up))) {
        var crudo = normDocNumber(m[1]);
        var cuerpo = ('XYZ'.indexOf(crudo.charAt(0)) >= 0) ? crudo.slice(1, 8) : crudo.slice(0, 8);
        if (soloDigitos(cuerpo) < 6) continue;
        var arreglado = reparaDni(crudo);
        if (arreglado) return arreglado;
      }
    }
    return '';
  }

  function parseTd1(lineas, sinReparar) {
    var rr = sinReparar ? [pad(lineas[0], 30), pad(lineas[1], 30), String(lineas[2] || '')]
                        : reparaTd1(lineas[0], lineas[1], lineas[2]);
    var l1 = rr[0], l2 = rr[1], l3 = rr[2];
    var soporte = l1.substr(5, 9), dcSoporte = l1.charAt(14);
    var opc1 = l1.substr(15, 15).replace(/</g, '').trim();
    var nac = l2.substr(0, 6), dcNac = l2.charAt(6), sexo = l2.charAt(7);
    var cad = l2.substr(8, 6), dcCad = l2.charAt(14);
    var nacionalidad = l2.substr(15, 3).replace(/</g, '').trim();
    var opc2 = l2.substr(18, 11).replace(/</g, '').trim();
    // Un carácter mal leído en una fecha se corrige con su dígito de control (solo si la solución
    // es única y la fecha resultante existe en el calendario).
    nac = arreglaPorCheck(nac, dcNac, function (v) { return !!mrzDate(v, false); });
    cad = arreglaPorCheck(cad, dcCad, function (v) { return !!mrzDate(v, true); });
    var numero = '';
    var cands = [opc1, opc2];
    for (var k = 0; k < cands.length && !numero; k++) {
      numero = findSpanishId(cands[k]) || reparaDni(cands[k]) || findSpanishIdOcr(cands[k]);
    }
    if (!numero) numero = normDocNumber(soporte);   // documento no español: el hueco de siempre
    var compuesto = l1.substr(5, 25) + l2.substr(0, 7) + l2.substr(8, 7) + l2.substr(18, 11);
    var checks = {
      document: checkOk(soporte, dcSoporte),
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

  function parseTd3(lineas, sinReparar) {
    var rr = sinReparar ? [pad(lineas[0], 44), pad(lineas[1], 44)] : reparaTd3(lineas[0], lineas[1]);
    var l1 = rr[0], l2 = rr[1];
    var num = l2.substr(0, 9), dcNum = l2.charAt(9);
    var nacionalidad = l2.substr(10, 3).replace(/</g, '').trim();
    var nac = l2.substr(13, 6), dcNac = l2.charAt(19), sexo = l2.charAt(20);
    var cad = l2.substr(21, 6), dcCad = l2.charAt(27);
    var personales = l2.substr(28, 14), dcPers = l2.charAt(42);
    nac = arreglaPorCheck(nac, dcNac, function (v) { return !!mrzDate(v, false); });
    cad = arreglaPorCheck(cad, dcCad, function (v) { return !!mrzDate(v, true); });
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

  /* --------- ¿Qué línea es cada una? Se decide por la FORMA, ya REPARADA ---------
     ⚠️ Antes la forma se comprobaba sobre la línea tal cual la leía el OCR, así que una sola letra
     donde iba un dígito hacía que la línea no se reconociera y se perdía el MRZ entero.
     ⚠️ Y se exige que la MAYORÍA de esas posiciones sean dígitos DE VERDAD: traduciendo a ciegas,
     «IDESPBAA000589…» —que es la línea 1— también casaba con «fechas + sexo» y se leía del revés. */
  function esL2Td1(l) {
    if (l.length < 26 || l.length > 34) return false;
    if (soloDigitos(l.substr(0, 7) + l.substr(8, 7)) < 11) return false;
    var forma = aDigitos(l.substr(0, 7)) + sexoMrz(l.charAt(7)) + aDigitos(l.substr(8, 7));
    if (!/^[0-9]{7}[MFX<][0-9]{7}/.test(forma)) return false;
    return !!(mrzDate(forma.substr(0, 6), false) && mrzDate(forma.substr(8, 6), true));
  }
  function esL1Td1(l) {
    if (l.length < 26 || l.length > 34 || aLetras(l.charAt(0)) !== 'I') return false;
    return soloDigitos(l.substr(5, 10)) >= 4;      // lleva el número de soporte
  }
  function esL3Td1(l) {
    if (l.length < 26 || l.length > 34 || l.indexOf('<<') < 0) return false;
    if (soloDigitos(l) > 2) return false;          // un nombre no lleva dígitos
    return (l.match(/[A-Z]/g) || []).length >= 3;
  }
  function esL2Td3(l) {
    if (l.length < 40) return false;
    if (soloDigitos(l.substr(13, 7) + l.substr(21, 7)) < 11) return false;
    var forma = l.substr(0, 9) + aDigitos(l.charAt(9)) + aLetras(l.substr(10, 3)) +
                aDigitos(l.substr(13, 6)) + aDigitos(l.charAt(19)) + sexoMrz(l.charAt(20)) +
                aDigitos(l.substr(21, 6));
    if (!/^[A-Z0-9<]{9}[0-9<][A-Z<]{3}[0-9]{6}[0-9<][MFX<][0-9]{6}/.test(forma)) return false;
    return !!(mrzDate(forma.substr(13, 6), false) && mrzDate(forma.substr(21, 6), true));
  }

  // El OCR puede devolver las líneas del MRZ PEGADAS en una sola: se parten por su longitud (un TD1
  // son 3×30 y un TD3 2×44). Se devuelven TODAS las particiones que encajan —88 caracteres son 2×44
  // pero también entran en 3×30— y quien decide es parseMrzText, mirando la forma de cada trozo.
  function desdobla(linea) {
    var n = linea.length, opciones = [[44, 2], [30, 3], [30, 2]], trozos = [];
    opciones.forEach(function (o) {
      var largo = o[0] * o[1];
      if (n >= largo - 2 && n <= largo + 2) {
        for (var k = 0; k < o[1]; k++) {
          var t = linea.substr(k * o[0], o[0]);
          if (t && trozos.indexOf(t) < 0) trozos.push(t);
        }
      }
    });
    return trozos.length ? trozos : [linea];
  }

  // Líneas del OCR con pinta de MRZ.
  function mrzCandidates(text) {
    var out = [];
    String(text || '').split(/[\r\n]+/).forEach(function (cruda) {
      var limpia = mrzClean(cruda);
      if (limpia.length < 24) return;
      desdobla(limpia).forEach(function (t) {
        // Se admite sin rellenos «<» si la forma ya es reconocible: una línea de fechas del TD1
        // puede venir sin ninguno y antes se descartaba.
        if (t.length >= 24 && (t.indexOf('<') >= 0 || esL2Td1(t) || esL2Td3(t))) out.push(t);
      });
    });
    return out;
  }
  function hasMrz(text) { return mrzCandidates(text).length > 0; }

  // Lee el MRZ. Decide TD1/TD3 por la FORMA de las líneas: si suben un pasaporte diciendo que es un
  // DNI, se lee bien igualmente.
  function parseMrzText(text) {
    var lineas = mrzCandidates(text);
    if (!lineas.length) return null;
    var i, largas = lineas.filter(function (l) { return l.length >= 40; });
    var l1td3 = null;
    for (i = 0; i < largas.length; i++) if (aLetras(largas[i].charAt(0)) === 'P') { l1td3 = largas[i]; break; }
    if (l1td3) {
      for (i = 0; i < largas.length; i++) {
        if (largas[i] !== l1td3 && esL2Td3(largas[i])) return parseTd3([l1td3, largas[i]]);
      }
    }
    var medianas = lineas.filter(function (l) { return l.length >= 26 && l.length <= 34; });
    var l1 = null, l2 = null, l3 = null;
    for (i = 0; i < medianas.length; i++) if (esL2Td1(medianas[i])) { l2 = medianas[i]; break; }
    for (i = 0; i < medianas.length; i++) if (medianas[i] !== l2 && esL1Td1(medianas[i])) { l1 = medianas[i]; break; }
    for (i = 0; i < medianas.length; i++) {
      if (medianas[i] !== l1 && medianas[i] !== l2 && esL3Td1(medianas[i])) { l3 = medianas[i]; break; }
    }
    if (l2) return parseTd1([l1 || '', l2, l3 || '']);
    // Solo el renglón del nombre (OCR a medias): al menos el nombre.
    for (i = 0; i < lineas.length; i++) {
      if (esL3Td1(lineas[i])) {
        var n = mrzName(aLetras(lineas[i]));
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

  /* ============== LA CARA DELANTERA (el impreso, que NO tiene MRZ) ==============
     ⚠️⚠️ EN EL DNI ESPAÑOL EL MRZ ESTÁ EN EL REVERSO, así que un lector que solo sepa leer el MRZ
     le pide a la gente «la parte de atrás»… y quien pone la cara de la foto —que es «el DNI» para
     cualquiera— no consigue nada nunca. Aquí se lee la CARA DELANTERA: el número (comprobado con su
     letra de control), el nombre y los apellidos (por sus rótulos) y las fechas.
     El pasaporte no necesita esto: su MRZ está en la propia página de datos.
     ⚠️ PARIDAD OBLIGATORIA con `parse_front` de `mrz_utils.py`. */
  var ANV_IGNORA = /\b(ESPA[NÑ]A|SPAIN|REINO|DOCUMENTO|NACIONAL|IDENTIDAD|IDENTITY|IDENTIFICACI[OÓ]N|MINISTERIO|INTERIOR|DIRECCI[OÓ]N|GENERAL|POLIC[IÍ]A|TARJETA|EXTRANJERO|RESIDENCIA|PERMISO|CONDUCIR|UNI[OÓ]N|EUROPEA|SEXO|SEX|NACIONALIDAD|NATIONALITY|VALIDEZ|IDESP|SOPORTE|DOMICILIO|EQUIPO|HIJ[OA]|LUGAR|NACIMIENTO|CADUCIDAD|EXPEDICI[OÓ]N|N[UÚ]MERO|NUM|DNI|NIE|CARD|CARTE|IDENTITE)\b/;
  var RE_ANV_APELLIDOS = /\b(?:PRIMER\s+)?APELLIDOS?\b|\bSURNAMES?\b/;
  var RE_ANV_NOMBRE = /\bNOMBRES?\b|\bGIVEN\s+NAMES?\b/;
  var RE_ANV_SOPORTE = /(?:^|[^A-Z0-9])([A-Z]{3}[0-9]{6})(?![A-Z0-9])/;
  // Rótulos que dicen «esto es un documento de identidad». Se cuentan los DISTINTOS: con dos o más,
  // el texto es un documento y no un contrato ni una factura.
  var RE_ANV_PISTAS = /\b(APELLIDOS?|NOMBRES?|VALIDEZ|NACIONALIDAD|IDESP|SOPORTE|NACIMIENTO|IDENTIDAD|SURNAMES?|EXTRANJERO|CADUCIDAD)\b/g;
  var RE_ANV_TELEFONO = /\b(?:TEL[EÉ]FONO|TELF?|M[OÓ]VIL|FAX|WHATSAPP)\b[^0-9]{0,12}$/;
  // Nueve dígitos donde el último es la letra de control mal leída («…78Z» → «…782»). Solo se usa
  // cuando el texto ES un documento y solo si hay UNA solución: con dos candidatos no se adivina.
  function dniConLetraLeidaComoDigito(plano) {
    var re = /(?:^|[^0-9A-Z])([0-9]{9})(?![0-9A-Z])/g, m, out = [];
    while ((m = re.exec(plano))) {
      var antes = plano.slice(0, m.index + m[0].length - 9);
      if (RE_ANV_TELEFONO.test(antes)) continue;
      var arr = reparaDni(m[1], true);
      if (arr && out.indexOf(arr) < 0) out.push(arr);
    }
    return out.length === 1 ? out[0] : '';
  }

  function anvLimpiaNombre(texto) {
    var t = String(texto || '').toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑÇ'\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[-']+|[-']+$/g, '').trim();
    if (t.length < 2 || t.length > 60) return '';
    if (ANV_IGNORA.test(t) || RE_ANV_APELLIDOS.test(t) || RE_ANV_NOMBRE.test(t)) return '';
    return t;
  }
  // El valor que sigue a un rótulo: en la misma línea o en las siguientes (el DNI lo pone debajo).
  function anvValorTras(lineas, patron, maximo) {
    maximo = maximo || 2;
    for (var i = 0; i < lineas.length; i++) {
      var m = patron.exec(lineas[i].toUpperCase());
      patron.lastIndex = 0;
      if (!m) continue;
      var valor = anvLimpiaNombre(lineas[i].slice(m.index + m[0].length));
      if (valor) return valor;
      for (var k = 1; k <= maximo; k++) {
        if (i + k < lineas.length) {
          valor = anvLimpiaNombre(lineas[i + k]);
          if (valor) return valor;
        }
      }
      return '';
    }
    return '';
  }
  // Fechas del impreso, con su posición. ⚠️ El DNI las imprime con ESPACIOS («01 01 1980»), así que
  // el patrón de siempre (dd/mm/aaaa) no encontraba NINGUNA.
  function anvFechas(texto) {
    var up = String(texto || '').toUpperCase(), out = [];
    // ⚠️ Los separadores son OPCIONALES: el OCR junta los grupos («0101 1980», «01011980») y con
    // el patrón de siempre no se encontraba NINGUNA fecha. Lo que descarta la basura es el calendario.
    var re = new RegExp('(?:^|[^0-9])([' + CONF + ']{2})[\\s./\\-]{0,3}([' + CONF + ']{2})[\\s./\\-]{0,3}([' + CONF + ']{4})(?![0-9])', 'g');
    var m;
    while ((m = re.exec(up))) {
      var crudo = m[1] + m[2] + m[3];
      // Tiene que quedar algo legible de verdad: 3 de los 8 son dígitos y el AÑO 2 de sus 4. Con
      // menos que eso no se está leyendo una fecha: se está adivinando.
      if (soloDigitos(crudo) < 3 || soloDigitos(m[3]) < 2) continue;
      var dd = aDigitos(m[1]), mm = aDigitos(m[2]), aaaa = aDigitos(m[3]);
      if (!/^[0-9]{2}$/.test(dd) || !/^[0-9]{2}$/.test(mm) || !/^[0-9]{4}$/.test(aaaa)) continue;
      var y = +aaaa;
      if (y < 1900 || y > 2100 || !isRealDate(y, +mm, +dd)) continue;
      out.push({ iso: aaaa + '-' + mm + '-' + dd, pos: m.index });
    }
    return out;
  }
  function anvFechaTras(texto, patron, fechas) {
    var up = String(texto || '').toUpperCase(), re = new RegExp(patron, 'g'), m;
    while ((m = re.exec(up))) {
      var fin = m.index + m[0].length;
      for (var i = 0; i < fechas.length; i++) {
        var d = fechas[i].pos - fin;
        if (d >= 0 && d <= 90) return fechas[i].iso;
      }
    }
    return '';
  }
  function hoyIso() {
    var d = new Date(), mm = String(d.getMonth() + 1), dd = String(d.getDate());
    return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
  }
  // Lee la CARA DELANTERA de un DNI/NIE (o el impreso de cualquier documento sin MRZ).
  function parseFrontText(text) {
    var lineas = String(text || '').split(/[\r\n]+/).map(function (l) { return l.trim(); })
      .filter(function (l) { return !!l; });
    var plano = lineas.join('\n').toUpperCase();

    // Número: el que va junto a su rótulo manda sobre cualquier otro del impreso.
    var numero = '';
    // ⚠️ El rótulo se admite MAL LEÍDO («DN» por «DNI», «N1E» por «NIE»): es lo que devuelve el OCR
    // de verdad, y sin esa tolerancia el número se quedaba sin leer teniéndolo delante.
    var junto = /\b(?:D\.?N\.?I?|N\.?[I1]\.?E|N[UÚ]M(?:ERO)?\.?\s*(?:DE\s+)?(?:DOCUMENTO|DNI|NIE)?)\b[^0-9A-Z]{0,12}([0-9A-Z][0-9A-Z\-\s]{7,13})/.exec(plano);
    if (junto) numero = findSpanishIdOcr(junto[1]) || reparaDni(normDocNumber(junto[1]).slice(0, 9), true);
    if (!numero) numero = findSpanishIdOcr(plano);
    if (!numero) {
      var pistas = {}, mp, np = 0;
      RE_ANV_PISTAS.lastIndex = 0;
      while ((mp = RE_ANV_PISTAS.exec(plano))) { if (!pistas[mp[1]]) { pistas[mp[1]] = 1; np++; } }
      if (np >= 2) numero = dniConLetraLeidaComoDigito(plano);
    }

    var apellidos = anvValorTras(lineas, RE_ANV_APELLIDOS);
    var nombre = anvValorTras(lineas, RE_ANV_NOMBRE);

    var fechas = anvFechas(plano);
    var hoy = hoyIso();
    var nacimiento = anvFechaTras(plano, 'FECHA\\s+DE\\s+NACIMIENTO|F(?:ECHA)?\\.?\\s*NAC\\b|NACIMIENTO|DATE\\s+OF\\s+BIRTH|BIRTH', fechas);
    var caducidad = anvFechaTras(plano, 'VALIDEZ|V[AÁ]LIDO\\s+HASTA|CADUCIDAD|EXPIRY|DATE\\s+OF\\s+EXPIRY', fechas);
    var i;
    if (!nacimiento) {
      var pasadas = fechas.filter(function (f) { return f.iso < hoy; }).map(function (f) { return f.iso; }).sort();
      if (pasadas.length) nacimiento = pasadas[0];
    }
    if (!caducidad) {
      var futuras = fechas.filter(function (f) { return f.iso >= hoy; }).map(function (f) { return f.iso; }).sort();
      if (futuras.length) caducidad = futuras[futuras.length - 1];
    }
    // Si han salido la misma, no se sabe cuál es cuál.
    if (nacimiento && nacimiento === caducidad) caducidad = '';

    var soporte = '', ms = RE_ANV_SOPORTE.exec(plano);
    if (ms) soporte = ms[1];

    var sexo = '', mx = /\b(?:SEXO|SEX)\b[^A-Z0-9]{0,10}([MF])(?![A-Z])/.exec(plano);
    if (mx) sexo = mx[1];
    else {
      // ⚠️ El DNI pone los rótulos en una línea («SEXO NACIONALIDAD FECHA DE NACIMIENTO») y los
      // valores en la SIGUIENTE («M ESP 01 01 1980»): hay que mirar también la línea de abajo.
      for (i = 0; i < lineas.length; i++) {
        if (/\b(?:SEXO|SEX)\b/.test(lineas[i].toUpperCase()) && i + 1 < lineas.length) {
          var suelta = /^\s*([MF])\b/.exec(lineas[i + 1].toUpperCase());
          if (suelta) sexo = suelta[1];
          break;
        }
      }
    }
    var nacionalidad = '', mn = /\b(?:NACIONALIDAD|NATIONALITY)\b[^A-Z]{0,10}([A-Z]{3})\b/.exec(plano);
    if (mn) nacionalidad = mn[1];
    else if (/\bESP\b/.test(plano)) nacionalidad = 'ESP';

    // El nombre solo se da por bueno si de verdad se ha leído un documento (hay número o fechas):
    // sobre un texto cualquiera la palabra «NOMBRE» aparece en cualquier parte.
    if (!numero && !fechas.length) { nombre = ''; apellidos = ''; }
    var completo = (nombre && apellidos) ? (nombre + ' ' + apellidos) : (nombre || apellidos);
    return {
      source: 'FRONT', number: numero, support_number: soporte,
      first_name: titleCase(nombre), last_name: titleCase(apellidos), full_name: titleCase(completo),
      birth: nacimiento, expiry: caducidad, sex: sexo, nationality: nacionalidad
    };
  }

  /* Campos oficiales a partir del texto del OCR (puro, no toca el DOM).
     ⚠️ Manda el MRZ (trae el nombre partido en apellidos/nombre, las fechas sin ambigüedad y
     dígitos de control), pero **lo que el MRZ no dé lo rellena la CARA DELANTERA**: antes del
     impreso solo se rascaba el número, así que quien subía la foto del anverso de su DNI se
     quedaba sin nombre, sin apellidos y sin fechas. */
  function extractFields(rawText, kind) {
    var mrz = parseMrzText(rawText) || {};
    var anv = parseFrontText(rawText);
    var out = {
      number: '', number_kind: '', support_number: '', full_name: '', first_name: '', last_name: '',
      birth: '', expiry: '', issue: '', address: '', sex: '', nationality: '',
      mrz_format: mrz.format || '', mrz_valid: !!mrz.valid, mrz_valid_strict: !!mrz.valid_strict,
      checks: mrz.checks || {}, source: '',
    };
    out.number = mrz.number || '';
    if (kind !== 'PASSPORT' && !(isValidDni(out.number) || isValidNie(out.number))) {
      out.number = anv.number || out.number;
    }
    out.number_kind = docNumberKind(out.number);
    out.support_number = mrz.support_number || anv.support_number || '';
    var nombreMrz = !!mrz.full_name;
    out.full_name = mrz.full_name || anv.full_name || '';
    out.first_name = mrz.first_name || (nombreMrz ? '' : (anv.first_name || ''));
    out.last_name = mrz.last_name || (nombreMrz ? '' : (anv.last_name || ''));
    out.birth = mrz.birth || anv.birth || '';
    out.expiry = mrz.expiry || anv.expiry || '';
    out.sex = mrz.sex || anv.sex || '';
    out.nationality = mrz.nationality || anv.nationality || '';
    // De dónde ha salido: «MRZ» (la banda del reverso) o «FRONT» (la cara delantera).
    out.source = mrz.valid ? 'MRZ' : ((anv.number || anv.full_name) ? 'FRONT' : '');
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
      } else if (pages.length >= 2) {
        // Un PDF con las dos caras: una por página (esto va PRIMERO aunque se haya dicho «front»,
        // porque el hueco del anverso admite a propósito el PDF con las dos).
        faces = [mk('front', pages[0]), mk('back', pages[1])];
      } else if (which === 'back' || which === 'front') {
        // Se ha dicho qué cara es: NO se parte la imagen (una foto de una sola cara partida por la
        // mitad no se lee).
        faces = [mk(which, pages[0])];
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
        // Una sola cara sin que nadie haya dicho cuál es: si lleva la banda MRZ, es el REVERSO.
        if (TWO_FACE_KINDS[kind] && faces.length === 1 && !which && hasMrz(faces[0].text)) {
          faces[0].which = 'back';
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
    ocrFront: ocrFront,
    frontWarmUp: frontWarmUp,
    extractFields: extractFields,
    // La CARA DELANTERA (el impreso del DNI, que no tiene MRZ): lo usa el escáner con la cámara
    // para leer el documento por la cara de la foto, que es la que pone todo el mundo.
    parseFrontText: parseFrontText,
    reparaDni: reparaDni,
    findSpanishIdOcr: findSpanishIdOcr,
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
