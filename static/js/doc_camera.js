/* ESCÁNER DE DOCUMENTOS CON LA CÁMARA — lee un DNI, un NIE o un pasaporte en vivo, como un lector
 * de códigos QR, y dice a quién corresponde.
 *
 * Cómo consigue ser casi instantáneo (y no equivocarse):
 *   · No lee el documento entero: lee SOLO la banda de abajo, el MRZ (esas dos o tres líneas de
 *     letras y «<»). Es un recorte pequeño, así que el OCR tarda una fracción de lo que tardaría
 *     con la tarjeta completa.
 *   · El MRZ lleva DÍGITOS DE CONTROL: cada fotograma se valida y, si no cuadra, se tira y se prueba
 *     con el siguiente. Por eso no hace falta que el usuario acierte con el encuadre: se dispara solo
 *     en cuanto un fotograma sale limpio, y nunca da un dato inventado por el OCR.
 *   · Un único worker de OCR reutilizado, con la lista blanca de caracteres del MRZ.
 *
 * Uso:  window.DocCamera.open({ onFound: fn, onCreate: fn })
 *   onFound(resultado)  — se llamó al servidor y hay fichas con ese número
 *   onCreate(resultado) — no hay ninguna: crear una nueva con los datos ya leídos
 *   resultado = { data: {number, number_kind, full_name, first_name, last_name, birth, expiry, …},
 *                 matches: [{kind, kind_label, id, name, photo_url, detail, why, url}] }
 */
(function () {
  'use strict';

  var LOOKUP_URL = '/api/documento/leer';
  var INTERVALO_MS = 220;          // entre intentos; el OCR de la banda tarda ~150-400 ms
  var MAX_INTENTOS = 90;           // ~20 s: pasado eso se avisa en vez de girar en balde
  var overlay = null, stream = null, corriendo = false, temporizador = null, cbs = {};
  // ⚠️ Todo lo asíncrono (getUserMedia, el OCR, el fetch) lleva el número de SESIÓN con el que se
  // lanzó: al cerrar o reiniciar el escáner, lo que vuelva de la sesión vieja se descarta. Sin esto
  // una cámara que tardaba en abrir se quedaba encendida después de cerrar, y una consulta lenta de
  // la lectura anterior secuestraba el escaneo nuevo.
  var sesion = 0, intentos = 0;
  function viva(n) { return n === sesion && !!overlay; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return (m && m.content) || '';
  }

  function ui() {
    var ov = document.createElement('div');
    ov.className = 'doccam';
    ov.innerHTML =
      '<div class="doccam__panel">' +
        '<div class="doccam__head">' +
          '<span><i class="fa fa-expand me-2"></i>Escanear documento</span>' +
          '<button type="button" class="btn-close btn-close-white" data-doccam-close aria-label="Cerrar"></button>' +
        '</div>' +
        '<div class="doccam__stage">' +
          '<video class="doccam__video" playsinline muted autoplay></video>' +
          '<div class="doccam__guide"><span class="doccam__band"></span></div>' +
          '<div class="doccam__hint" data-doccam-hint>Pon el documento dentro del marco, con la banda de letras de abajo bien visible</div>' +
        '</div>' +
        '<div class="doccam__foot">' +
          '<div class="doccam__state" data-doccam-state><span class="doccam__dot"></span>Buscando la banda del documento…</div>' +
          '<div class="d-flex gap-2">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-doccam-manual><i class="fa fa-keyboard me-1"></i>Escribir el número</button>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-doccam-flip><i class="fa fa-camera-rotate me-1"></i>Cambiar cámara</button>' +
          '</div>' +
        '</div>' +
        '<div class="doccam__result d-none" data-doccam-result></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target.closest('[data-doccam-close]') || e.target === ov) close();
    });
    ov.querySelector('[data-doccam-flip]').addEventListener('click', function () { flip(); });
    ov.querySelector('[data-doccam-manual]').addEventListener('click', function () { manual(); });
    return ov;
  }

  function estado(texto, clase) {
    if (!overlay) return;
    var el = overlay.querySelector('[data-doccam-state]');
    if (el) el.innerHTML = '<span class="doccam__dot ' + (clase || '') + '"></span>' + esc(texto);
  }

  var camaraTrasera = true;
  function arrancarCamara(miSesion) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      estado('Este navegador no da acceso a la cámara.', 'is-err');
      return Promise.reject(new Error('sin getUserMedia'));
    }
    var video = overlay.querySelector('.doccam__video');
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: camaraTrasera ? { ideal: 'environment' } : 'user',
        width: { ideal: 1920 }, height: { ideal: 1080 },
      },
      audio: false,
    }).then(function (s) {
      // Si mientras se abría la cámara se ha cerrado el escáner (o se ha vuelto a abrir), esta
      // pista ya no es de nadie: se apaga aquí mismo o se quedaría encendida para siempre.
      if (!viva(miSesion)) {
        s.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
        return;
      }
      pararCamara();                 // por si hubiera otra pista en marcha
      stream = s;
      video.srcObject = s;
      return video.play().catch(function () { /* algunos navegadores ya lo reproducen solos */ });
    }).catch(function (err) {
      if (!viva(miSesion)) throw err;
      var msg = 'No se ha podido abrir la cámara.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        msg = 'Has bloqueado la cámara. Permítela en el candado de la barra de direcciones y vuelve a intentarlo.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'Este dispositivo no tiene cámara.';
      }
      estado(msg, 'is-err');
      throw err;
    });
  }

  function pararCamara() {
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      stream = null;
    }
  }

  function flip() {
    camaraTrasera = !camaraTrasera;
    pararCamara();
    sesion += 1;                     // la pista anterior ya no cuenta
    var mia = sesion;
    intentos = 0;
    arrancarCamara(mia).then(function () {
      if (viva(mia) && !corriendo) { corriendo = true; bucle(mia); }
    }).catch(function () {});
  }

  // Recorta la BANDA de abajo del marco guía: ahí está el MRZ, tanto en la tarjeta (TD1, 3 líneas)
  // como en el pasaporte (TD3, 2 líneas). Se coge un 45% de alto para que quepan las dos.
  function recorteBanda(video) {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    // El marco guía ocupa el 88% del ancho y una proporción de tarjeta (85,6×54 mm ≈ 1,585).
    var gw = vw * 0.88, gh = gw / 1.585;
    if (gh > vh * 0.9) { gh = vh * 0.9; gw = gh * 1.585; }
    var gx = (vw - gw) / 2, gy = (vh - gh) / 2;
    var bh = gh * 0.45, by = gy + gh - bh;
    var escala = Math.min(2, Math.max(1, 1000 / gw));   // subir un poco la resolución ayuda al OCR
    var c = document.createElement('canvas');
    c.width = Math.round(gw * escala);
    c.height = Math.round(bh * escala);
    var ctx = c.getContext('2d');
    ctx.drawImage(video, gx, by, gw, bh, 0, 0, c.width, c.height);
    // Umbral simple: el MRZ es negro sobre fondo claro; binarizar sube mucho el acierto.
    try {
      var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, suma = 0;
      for (var i = 0; i < d.length; i += 4) suma += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      var media = suma / (d.length / 4);
      for (var j = 0; j < d.length; j += 4) {
        var g = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
        var v = g < media * 0.82 ? 0 : 255;
        d[j] = d[j + 1] = d[j + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    } catch (_) { /* si el canvas está contaminado, se manda tal cual */ }
    return c;
  }

  function reintentar(miSesion) {
    if (!viva(miSesion) || !corriendo) return;
    intentos += 1;
    if (intentos > MAX_INTENTOS) {
      corriendo = false;
      estado('No se ha podido leer la banda del documento. Prueba con más luz, sin reflejos, o escribe el número.', 'is-err');
      return;
    }
    temporizador = setTimeout(function () { bucle(miSesion); }, INTERVALO_MS);
  }

  function bucle(miSesion) {
    if (!corriendo || !viva(miSesion)) return;
    if (!window.DocScan) {
      corriendo = false;
      estado('No se ha podido cargar el lector. Escribe el número a mano.', 'is-err');
      return;
    }
    var video = overlay.querySelector('.doccam__video');
    var banda = video ? recorteBanda(video) : null;
    if (!banda) { reintentar(miSesion); return; }        // el vídeo aún no tiene dimensiones
    window.DocScan.ocrMrz(banda).then(function (texto) {
      if (!corriendo || !viva(miSesion)) return;
      var mrz = window.DocScan.parseMrzText(texto);
      // ⚠️ En un DNI el hueco del «número de documento» del MRZ lleva el número de SOPORTE: si el
      // OCR se come un carácter de los datos opcionales, `number` acaba siendo el soporte y el
      // documento pasaría por «pasaporte». Solo se acepta el fotograma si el número es un DNI o un
      // NIE válido, o si cuadra el dígito de control compuesto (documento no español).
      var tipo = mrz && mrz.number ? window.DocScan.docNumberKind(mrz.number) : 'OTHER';
      var fiable = tipo === 'DNI' || tipo === 'NIE' || !!(mrz && mrz.valid_strict);
      if (mrz && mrz.valid && mrz.number && fiable) {
        corriendo = false;
        estado('Documento leído · ' + mrz.number, 'is-ok');
        consultar(texto, mrz, miSesion);
        return;
      }
      if (mrz && mrz.full_name) estado('Leyendo… ' + mrz.full_name, 'is-warn');
      reintentar(miSesion);
    }).catch(function () {
      reintentar(miSesion);
    });
  }

  function consultar(textoMrz, mrzLocal, miSesion) {
    fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'Accept': 'application/json' },
      body: JSON.stringify({ mrz: textoMrz, number: (mrzLocal && mrzLocal.number) || '' }),
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        // Si mientras consultaba se cerró el escáner o se empezó otra lectura, esta respuesta ya no
        // vale: pintarla mataría la cámara nueva y repetiría la callback.
        if (!viva(miSesion)) return;
        if (!res || !res.ok) {
          estado((res && res.error) || 'No se ha podido leer el documento.', 'is-err');
          corriendo = true; intentos = 0; reintentar(miSesion);
          return;
        }
        pintarResultado(res);
      })
      .catch(function () {
        if (!viva(miSesion)) return;
        estado('No se ha podido consultar. Revisa la conexión.', 'is-err');
        corriendo = true; intentos = 0; reintentar(miSesion);
      });
  }

  function pintarResultado(res) {
    pararCamara();
    var caja = overlay.querySelector('[data-doccam-result]');
    var d = res.data || {}, matches = res.matches || [];
    var etiquetaTipo = { DNI: 'DNI', NIE: 'NIE', PASSPORT: 'Pasaporte' }[d.number_kind] || 'Documento';
    var html =
      '<div class="doccam__read">' +
        '<div class="doccam__num"><i class="fa fa-id-card me-2"></i>' + esc(d.number) +
          ' <span class="doccam__kind">' + esc(etiquetaTipo) + '</span></div>' +
        '<div class="doccam__name">' + esc(d.full_name || '—') + '</div>' +
        '<div class="doccam__meta">' +
          (d.birth ? '<span><i class="fa fa-cake-candles me-1"></i>' + esc(d.birth) + '</span>' : '') +
          (d.expiry ? '<span><i class="fa fa-hourglass-end me-1"></i>caduca ' + esc(d.expiry) + '</span>' : '') +
          (d.nationality ? '<span><i class="fa fa-flag me-1"></i>' + esc(d.nationality) + '</span>' : '') +
        '</div>' +
      '</div>';
    if (matches.length) {
      html += '<div class="doccam__found"><div class="doccam__foundttl">' +
        (matches.length === 1 ? 'Ya está en la base de datos' : 'Hay ' + matches.length + ' fichas con ese número') +
        '</div>';
      matches.forEach(function (m) {
        html += '<a class="doccam__row" href="' + esc(m.url) + '">' +
          (m.photo_url ? '<img src="' + esc(m.photo_url) + '" alt="">' : '<span class="doccam__ph"><i class="fa fa-user"></i></span>') +
          '<span class="doccam__rowtxt"><strong>' + esc(m.name) + '</strong>' +
            '<span class="doccam__rowsub">' + esc(m.kind_label) + (m.detail ? ' · ' + esc(m.detail) : '') +
            (m.why ? ' · ' + esc(m.why) : '') + '</span></span>' +
          '<i class="fa fa-arrow-right"></i></a>';
      });
      html += '</div>';
    } else {
      html += '<div class="doccam__none"><i class="fa fa-circle-info me-2"></i>' +
        'No hay ninguna ficha con ese número.</div>';
    }
    html += '<div class="doccam__actions">' +
      '<button type="button" class="btn btn-outline-secondary" data-doccam-again><i class="fa fa-rotate me-1"></i>Escanear otro</button>' +
      (cbs.onCreate ? '<button type="button" class="btn btn-primary" data-doccam-create><i class="fa fa-plus me-1"></i>Crear con estos datos</button>' : '') +
      '</div>';
    caja.innerHTML = html;
    caja.classList.remove('d-none');
    overlay.querySelector('.doccam__stage').classList.add('d-none');
    caja.querySelector('[data-doccam-again]').addEventListener('click', function () { reiniciar(); });
    var crear = caja.querySelector('[data-doccam-create]');
    if (crear) crear.addEventListener('click', function () {
      var fn = cbs.onCreate; close();
      if (fn) fn(res);
    });
    if (matches.length && cbs.onFound) cbs.onFound(res);
  }

  function reiniciar() {
    var caja = overlay.querySelector('[data-doccam-result]');
    caja.classList.add('d-none'); caja.innerHTML = '';
    overlay.querySelector('.doccam__stage').classList.remove('d-none');
    estado('Buscando la banda del documento…');
    pararCamara();
    sesion += 1; intentos = 0;
    var mia = sesion;
    arrancarCamara(mia).then(function () {
      if (!viva(mia)) return;
      corriendo = true; bucle(mia);
    }).catch(function () {});
  }

  // Salida sin cámara: escribir el número a mano y buscar igual.
  function manual() {
    var numero = window.prompt('Número del documento (DNI, NIE o pasaporte):', '');
    if (!numero) return;
    corriendo = false;
    var mia = sesion;
    estado('Buscando ' + numero + '…');
    fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'Accept': 'application/json' },
      body: JSON.stringify({ number: numero }),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!viva(mia)) return;
      if (res && res.ok) { pintarResultado(res); return; }
      estado((res && res.error) || 'No se ha encontrado nada.', 'is-err');
      corriendo = true; intentos = 0; reintentar(mia);      // se sigue escaneando
    }).catch(function () {
      if (!viva(mia)) return;
      estado('No se ha podido consultar.', 'is-err');
      corriendo = true; intentos = 0; reintentar(mia);
    });
  }

  function close() {
    corriendo = false;
    sesion += 1;                     // lo que vuelva de la sesión anterior se descarta
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    pararCamara();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.classList.remove('doccam-open');
  }

  function open(opciones) {
    cbs = opciones || {};
    if (overlay) close();
    overlay = ui();
    document.body.classList.add('doccam-open');
    sesion += 1; intentos = 0;
    var mia = sesion;
    // El modelo de OCR se va cargando mientras el usuario coloca el documento.
    if (window.DocScan && window.DocScan.mrzWarmUp) window.DocScan.mrzWarmUp();
    arrancarCamara(mia).then(function () {
      if (!viva(mia)) return;
      corriendo = true;
      bucle(mia);
    }).catch(function () { /* el estado ya explica qué ha pasado */ });
  }

  window.DocCamera = { open: open, close: close };
})();
