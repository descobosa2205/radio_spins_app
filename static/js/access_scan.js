/* CONTROL DE ACCESO · el LECTOR DE QR de la puerta (templates/public_invitation_access.html).
   Un lector de QR y nada más: se abre a pantalla completa con la cámara TRASERA, lee un código tras
   otro SIN CERRARSE (lectura continua), enseña el resultado ENCIMA del vídeo —verde o rojo, con su
   pitido y su vibración— y sigue leyendo. No es el escáner de documentos (`doc_camera.js`, que lee
   el MRZ con OCR y cierra al leer): en una puerta se leen cien códigos seguidos y cada segundo cuenta.
     · Motor nativo `BarcodeDetector` donde lo hay (Chrome/Android) y, si no —Safari en el iPhone,
       que es lo que lleva medio equipo—, **jsQR** cargado al vuelo desde el CDN.
     · Un código leído no se vuelve a mandar en `REPEAT_MS` (el mismo QR delante de la cámara dispara
       decenas de fotogramas): así una entrada válida no se marca «ya usada» un segundo después.
   Uso:  window.AccessScan.open({ onCode: fn(texto), label: 'Acceso entrada' })
         window.AccessScan.result({ good: true, title: 'Acceso OK', detail: '…', html: '…' })
         window.AccessScan.setLabel('After Party') · window.AccessScan.close() */
(function () {
  'use strict';

  var JSQR_SRC = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  var REPEAT_MS = 4000;        // el mismo código no se relee antes de esto
  var RESULT_MS = 2600;        // cuánto se queda el resultado encima del vídeo
  var FPS_MS = 90;             // ~11 lecturas por segundo (jsQR) — BarcodeDetector va a su ritmo

  var overlay = null, stream = null, video = null, canvas = null, ctx2d = null;
  var detector = null, cbs = {}, corriendo = false, timer = null, sesion = 0;
  var ultimoCodigo = '', ultimoMs = 0, pausadoHasta = 0, camaraTrasera = true;
  var audioCtx = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* --- pitido y vibración: verde agudo, rojo grave doble --- */
  function sonar(good) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var t0 = audioCtx.currentTime;
      var tono = function (f, ini, dur) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + ini);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + ini + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + ini + dur);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + ini); o.stop(t0 + ini + dur + 0.02);
      };
      if (good) { tono(1046, 0, 0.12); tono(1568, 0.11, 0.16); }
      else { tono(220, 0, 0.18); tono(220, 0.24, 0.24); }
    } catch (e) { /* sin audio, sin drama */ }
    try { if (navigator.vibrate) navigator.vibrate(good ? 60 : [120, 80, 160]); } catch (e) {}
  }

  function ui() {
    var ov = document.createElement('div');
    ov.className = 'accsc';
    ov.innerHTML =
      '<div class="accsc__top">' +
        '<div class="accsc__ctl"><i class="fa fa-qrcode me-2"></i><span data-accsc-label>' + esc(cbs.label || 'Control de acceso') + '</span></div>' +
        '<div class="accsc__topbtns">' +
          '<button type="button" class="accsc__ibtn" data-accsc-flip title="Cambiar de cámara"><i class="fa fa-camera-rotate"></i></button>' +
          '<button type="button" class="accsc__ibtn" data-accsc-close title="Cerrar el lector"><i class="fa fa-xmark"></i></button>' +
        '</div>' +
      '</div>' +
      '<video class="accsc__video" playsinline muted autoplay></video>' +
      '<div class="accsc__guide"><span></span></div>' +
      '<div class="accsc__state" data-accsc-state><i class="fa fa-spinner fa-spin me-2"></i>Abriendo la cámara…</div>' +
      '<div class="accsc__result" data-accsc-result hidden></div>' +
      '<div class="accsc__foot">' +
        '<button type="button" class="accsc__manual" data-accsc-manual><i class="fa fa-keyboard me-2"></i>Escribir el código</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-accsc-close]')) { close(); return; }
      if (e.target.closest('[data-accsc-flip]')) { flip(); return; }
      if (e.target.closest('[data-accsc-manual]')) { manual(); return; }
      if (e.target.closest('[data-accsc-result]')) { ocultarResultado(); return; }
    });
    return ov;
  }

  function estado(html, clase) {
    if (!overlay) return;
    var el = overlay.querySelector('[data-accsc-state]');
    if (!el) return;
    el.innerHTML = html; el.className = 'accsc__state' + (clase ? ' ' + clase : '');
  }

  function setLabel(txt) {
    cbs.label = txt || cbs.label;
    if (!overlay) return;
    var el = overlay.querySelector('[data-accsc-label]');
    if (el) el.textContent = cbs.label || '';
  }

  /* --- la cámara --- */
  function pararCamara() {
    if (stream) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); stream = null; }
  }

  function arrancarCamara(mia) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      estado('<i class="fa fa-triangle-exclamation me-2"></i>Este navegador no da acceso a la cámara. Escribe el código.', 'is-err');
      return Promise.reject(new Error('sin getUserMedia'));
    }
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: camaraTrasera ? { ideal: 'environment' } : 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
      audio: false,
    }).then(function (s) {
      if (mia !== sesion || !overlay) { s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); return; }
      pararCamara();
      stream = s;
      video.srcObject = s;
      return video.play().catch(function () {});
    }).catch(function (err) {
      if (mia !== sesion) throw err;
      var msg = 'No se ha podido abrir la cámara.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) msg = 'Has bloqueado la cámara. Permítela en el candado de la barra de direcciones y vuelve a abrir el lector.';
      else if (err && err.name === 'NotFoundError') msg = 'Este dispositivo no tiene cámara.';
      estado('<i class="fa fa-triangle-exclamation me-2"></i>' + esc(msg) + ' También puedes escribir el código.', 'is-err');
      throw err;
    });
  }

  function flip() {
    camaraTrasera = !camaraTrasera;
    pararCamara();
    sesion += 1;
    var mia = sesion;
    arrancarCamara(mia).then(function () { if (mia === sesion) { estado('<i class="fa fa-qrcode me-2"></i>Enfoca el código QR de la invitación', ''); } }).catch(function () {});
  }

  /* --- el motor de lectura: BarcodeDetector nativo o jsQR --- */
  var jsqrCargando = null;
  function cargarJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (jsqrCargando) return jsqrCargando;
    jsqrCargando = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = JSQR_SRC; s.async = true;
      s.onload = function () { window.jsQR ? ok(window.jsQR) : ko(new Error('jsQR no cargó')); };
      s.onerror = function () { ko(new Error('jsQR no cargó')); };
      document.head.appendChild(s);
    });
    return jsqrCargando;
  }

  function leerConDetector() {
    if (!video.videoWidth) return Promise.resolve('');
    return detector.detect(video).then(function (codigos) {
      return (codigos && codigos.length) ? (codigos[0].rawValue || '') : '';
    }).catch(function () { return ''; });
  }

  function leerConJsQR() {
    if (!video.videoWidth || !window.jsQR) return '';
    // Se reduce el fotograma: jsQR sobre 1280×720 tarda demasiado en un móvil; a ~640 de ancho lee
    // un QR de entrada sin problema y va fluido.
    var w = video.videoWidth, h = video.videoHeight;
    var escala = Math.min(1, 640 / w);
    var cw = Math.round(w * escala), ch = Math.round(h * escala);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx2d.drawImage(video, 0, 0, cw, ch);
    var img;
    try { img = ctx2d.getImageData(0, 0, cw, ch); } catch (e) { return ''; }
    var r = window.jsQR(img.data, cw, ch, { inversionAttempts: 'dontInvert' });
    return (r && r.data) ? r.data : '';
  }

  function bucle(mia) {
    if (!corriendo || mia !== sesion || !overlay) return;
    var ahora = Date.now();
    if (ahora < pausadoHasta) { timer = setTimeout(function () { bucle(mia); }, 120); return; }
    var p = detector ? leerConDetector() : Promise.resolve(leerConJsQR());
    p.then(function (texto) {
      if (!corriendo || mia !== sesion) return;
      if (texto) {
        texto = String(texto).trim();
        // El mismo código delante de la cámara dispara decenas de fotogramas: uno solo cuenta.
        if (!(texto === ultimoCodigo && (ahora - ultimoMs) < REPEAT_MS)) {
          ultimoCodigo = texto; ultimoMs = ahora;
          pausadoHasta = ahora + 900;          // un respiro mientras el servidor contesta
          estado('<i class="fa fa-spinner fa-spin me-2"></i>Comprobando…', 'is-busy');
          try { if (cbs.onCode) cbs.onCode(texto); } catch (e) {}
        }
      }
      timer = setTimeout(function () { bucle(mia); }, detector ? 140 : FPS_MS);
    });
  }

  /* --- el resultado encima del vídeo --- */
  var resultTimer = null;
  function result(r) {
    if (!overlay) return;
    var box = overlay.querySelector('[data-accsc-result]');
    if (!box) return;
    var good = !!(r && r.good);
    box.className = 'accsc__result ' + (good ? 'is-good' : 'is-bad');
    box.innerHTML =
      '<div class="accsc__result-ico"><i class="fa ' + (good ? 'fa-circle-check' : 'fa-circle-xmark') + '"></i></div>' +
      '<div class="accsc__result-title">' + esc((r && r.title) || (good ? 'OK' : 'No válida')) + '</div>' +
      ((r && r.detail) ? '<div class="accsc__result-detail">' + esc(r.detail) + '</div>' : '') +
      ((r && r.html) ? '<div class="accsc__result-extra">' + r.html + '</div>' : '') +
      '<div class="accsc__result-hint">Toca para seguir leyendo</div>';
    box.hidden = false;
    sonar(good);
    estado('<i class="fa fa-qrcode me-2"></i>Enfoca el código QR de la invitación', '');
    clearTimeout(resultTimer);
    resultTimer = setTimeout(ocultarResultado, (r && r.ms) || RESULT_MS);
    pausadoHasta = Date.now() + 700;
  }

  function ocultarResultado() {
    clearTimeout(resultTimer);
    if (!overlay) return;
    var box = overlay.querySelector('[data-accsc-result]');
    if (box) box.hidden = true;
  }

  function manual() {
    var txt = window.prompt('Escribe el código de la invitación (los 16 caracteres que van bajo el QR):');
    if (!txt) return;
    txt = String(txt).trim();
    if (!txt) return;
    ultimoCodigo = txt; ultimoMs = Date.now();
    estado('<i class="fa fa-spinner fa-spin me-2"></i>Comprobando…', 'is-busy');
    try { if (cbs.onCode) cbs.onCode(txt); } catch (e) {}
  }

  function open(opciones) {
    cbs = opciones || {};
    if (overlay) close();
    overlay = ui();
    video = overlay.querySelector('.accsc__video');
    canvas = document.createElement('canvas');
    ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    document.body.classList.add('accsc-open');
    sesion += 1; ultimoCodigo = ''; ultimoMs = 0; pausadoHasta = 0;
    var mia = sesion;
    detector = null;
    if ('BarcodeDetector' in window) {
      try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }
    // Sin lector nativo (Safari), jsQR; se pide a la vez que se abre la cámara para no esperar dos veces.
    var motor = detector ? Promise.resolve() : cargarJsQR().then(function () {}, function () {
      estado('<i class="fa fa-triangle-exclamation me-2"></i>No se ha podido cargar el lector de QR. Escribe el código.', 'is-err');
      throw new Error('sin motor');
    });
    Promise.all([arrancarCamara(mia), motor]).then(function () {
      if (mia !== sesion || !overlay) return;
      corriendo = true;
      estado('<i class="fa fa-qrcode me-2"></i>Enfoca el código QR de la invitación', '');
      bucle(mia);
    }).catch(function () { /* el estado ya dice qué ha pasado */ });
  }

  function close() {
    corriendo = false;
    clearTimeout(timer); clearTimeout(resultTimer);
    pararCamara();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; video = null;
    document.body.classList.remove('accsc-open');
    try { if (cbs.onClose) cbs.onClose(); } catch (e) {}
  }

  window.AccessScan = { open: open, close: close, result: result, setLabel: setLabel, isOpen: function () { return !!overlay; } };
})();
