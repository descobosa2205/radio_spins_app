/* ESCÁNER DE DOCUMENTOS CON LA CÁMARA — lee un DNI, un NIE o un pasaporte en vivo, como un lector
 * de códigos QR, y dice a quién corresponde.
 *
 * ⚠️⚠️ LEE LAS DOS CARAS, Y NO SE LE PIDE A NADIE «LA PARTE DE ATRÁS». En el DNI español el MRZ
 * (la banda de letras y «<») está en el REVERSO, así que un lector que solo sepa leer el MRZ obliga
 * a dar el documento de la vuelta… y quien pone la cara de la foto —que es «el DNI» para cualquiera—
 * no consigue nada nunca. Aquí:
 *   · **el REVERSO va primero y es lo más rápido**: se lee SOLO la banda de abajo (un recorte
 *     pequeño), y el MRZ lleva DÍGITOS DE CONTROL, así que en cuanto un fotograma sale limpio se
 *     dispara solo —sin que nadie tenga que acertar con el encuadre— y nunca da un dato inventado;
 *   · si en las primeras vueltas no aparece esa banda, es que están poniendo la CARA DELANTERA: se
 *     alterna con el OCR del impreso (`DocScan.parseFrontText`), que saca el número —comprobado con
 *     su letra de control—, el nombre, los apellidos y las fechas.
 *   · Dos workers de OCR reutilizados (uno con la lista de caracteres del MRZ y otro con la del
 *     texto), el MISMO modelo para los dos y el binarizado por el método de Otsu.
 *
 * Uso:  window.DocCamera.open({ onFound: fn, onCreate: fn })
 *   onFound(resultado)  — se llamó al servidor y hay fichas con ese número
 *   onCreate(resultado) — no hay ninguna: crear una nueva con los datos ya leídos
 *   resultado = { data: {number, number_kind, full_name, first_name, last_name, birth, expiry, …},
 *                 matches: [{kind, kind_label, id, name, photo_url, detail, why, url}] }
 *
 * Modo SOLO LEER:  window.DocCamera.open({ onRead: fn, title: '…' })
 *   No consulta al servidor (sirve en páginas públicas, sin sesión): en cuanto un fotograma sale
 *   limpio devuelve los datos y el recorte de la tarjeta, y se cierra.
 *   onRead({ data: {…los mismos campos…}, image: 'data:image/jpeg;base64,…' })
 *
 * Modo DOCUMENTO **o** QR:  window.DocCamera.open({ onRead: fn, qr: true })
 *   UN SOLO escáner para las dos cosas: en cada fotograma se prueba primero el código QR (detector
 *   nativo del navegador, instantáneo) y después la banda del documento. Vale lo que aparezca antes,
 *   así que quien escanea no tiene que decir de antemano qué va a poner delante.
 *   Con QR:  onRead({ qr: '<contenido del código>', data: {} })
 */
(function () {
  'use strict';

  var LOOKUP_URL = '/api/documento/leer';
  // ⚠️ El OCR ya corre en su propio worker, así que el hilo de la página no está esperando: el
  // intervalo solo existe para dejarlo respirar. Antes eran 220 ms de tiempo MUERTO en cada vuelta.
  var INTERVALO_MS = 40;
  var MAX_MS = 30000;              // medio minuto y se avisa, en vez de girar en balde
  // Vueltas de solo REVERSO antes de empezar a probar también la cara delantera: así el caso rápido
  // (la banda del MRZ) se resuelve en menos de un segundo y no paga nada.
  var VUELTAS_SOLO_MRZ = 2;
  var overlay = null, stream = null, corriendo = false, temporizador = null, cbs = {};
  var detQr = null;                // detector de QR (solo en modo qr y si el navegador lo trae)
  // ⚠️ Todo lo asíncrono (getUserMedia, el OCR, el fetch) lleva el número de SESIÓN con el que se
  // lanzó: al cerrar o reiniciar el escáner, lo que vuelva de la sesión vieja se descarta. Sin esto
  // una cámara que tardaba en abrir se quedaba encendida después de cerrar, y una consulta lenta de
  // la lectura anterior secuestraba el escaneo nuevo.
  var sesion = 0, intentos = 0, arranque = 0, tocaAnverso = false;
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
          '<span><i class="fa fa-expand me-2"></i>' + esc(cbs.title || 'Escanear documento') + '</span>' +
          '<button type="button" class="btn-close btn-close-white" data-doccam-close aria-label="Cerrar"></button>' +
        '</div>' +
        '<div class="doccam__stage">' +
          '<video class="doccam__video" playsinline muted autoplay></video>' +
          '<div class="doccam__guide"><span class="doccam__band"></span></div>' +
          '<div class="doccam__hint" data-doccam-hint>' +
            (cbs.qr
              ? 'Pon delante el <b>DNI</b> dentro del marco —<b>por cualquiera de las dos caras</b>— <b>o el código QR</b>: lee lo que aparezca antes'
              : 'Pon el documento dentro del marco, <b>por cualquiera de las dos caras</b>') +
          '</div>' +
        '</div>' +
        '<div class="doccam__foot">' +
          '<div class="doccam__state" data-doccam-state><span class="doccam__dot"></span>' +
            (cbs.qr ? 'Buscando un documento o un código QR…' : 'Buscando el documento…') +
          '</div>' +
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
        // ⚠️ 720p es DE SOBRA para el MRZ (la banda queda a ~23 px por carácter) y cuesta la mitad
        // de trabajo por fotograma que 1080p: con 1080p el móvil se arrastraba sin leer mejor.
        width: { ideal: 1280 }, height: { ideal: 720 },
        frameRate: { ideal: 24 },
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
    intentos = 0; arranque = Date.now(); tocaAnverso = false;
    arrancarCamara(mia).then(function () {
      if (viva(mia) && !corriendo) { corriendo = true; bucle(mia); }
    }).catch(function () {});
  }

  /* ---------------- Los recortes que se le dan al OCR ---------------- */
  // El marco guía: el 88% del ancho y proporción de tarjeta (85,6×54 mm ≈ 1,585). Es el mismo que
  // se dibuja en pantalla, así que lo que el usuario ve encuadrado es lo que se lee.
  function marco(video) {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    var gw = vw * 0.88, gh = gw / 1.585;
    if (gh > vh * 0.9) { gh = vh * 0.9; gw = gh * 1.585; }
    return { x: (vw - gw) / 2, y: (vh - gh) / 2, w: gw, h: gh };
  }

  // Umbral de OTSU: el valor que mejor separa el texto del fondo, calculado del propio fotograma.
  // ⚠️ Antes se usaba «la media × 0,82» y con una sombra o un reflejo en el plástico se queda corto:
  // la banda salía empastada y el OCR no leía nada, vuelta tras vuelta.
  function umbralOtsu(hist, total) {
    var suma = 0, i;
    for (i = 0; i < 256; i++) suma += i * hist[i];
    var sumaB = 0, wB = 0, mejor = -1, umbral = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (wF <= 0) break;
      sumaB += i * hist[i];
      var mB = sumaB / wB, mF = (suma - sumaB) / wF, entre = wB * wF * (mB - mF) * (mB - mF);
      if (entre > mejor) { mejor = entre; umbral = i; }
    }
    return umbral;
  }
  function aGris(d, hist) {
    for (var i = 0; i < d.length; i += 4) {
      var g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
      d[i] = d[i + 1] = d[i + 2] = g;
      if (hist) hist[g]++;
    }
  }
  function binariza(ctx, w, h) {
    var img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (_) { return; }
    var d = img.data, hist = [], i;
    for (i = 0; i < 256; i++) hist.push(0);
    aGris(d, hist);
    var u = umbralOtsu(hist, d.length / 4);
    for (i = 0; i < d.length; i += 4) {
      var v = d[i] < u ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }
  // Para la cara delantera NO se binariza: el DNI tiene el fondo lleno de dibujos y un umbral de
  // golpe empasta el texto pequeño. Se pasa a gris y se estira el contraste.
  function estiraContraste(ctx, w, h) {
    var img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (_) { return; }
    var d = img.data, hist = [], i;
    for (i = 0; i < 256; i++) hist.push(0);
    aGris(d, hist);
    var total = d.length / 4, acc = 0, lo = 0, hi = 255;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
    if (hi - lo > 24) {
      var k = 255 / (hi - lo);
      for (i = 0; i < d.length; i += 4) {
        var v = (d[i] - lo) * k;
        d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : (v > 255 ? 255 : v);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // La BANDA de abajo del marco: ahí está el MRZ, tanto en la tarjeta (TD1, 3 líneas) como en el
  // pasaporte (TD3, 2). Se coge un 45% de alto para que quepan las dos y se REDUCE a ~200 px de
  // alto: con tres líneas son ~65 px cada una, de sobra para el OCR, y es bastante menos trabajo por
  // fotograma que mandar la resolución bruta.
  var BANDA_ALTO = 200;
  function recorteBanda(video) {
    var g = marco(video);
    if (!g) return null;
    var bh = g.h * 0.45, by = g.y + g.h - bh;
    var escala = Math.min(1.4, BANDA_ALTO / bh);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(g.w * escala));
    c.height = Math.max(1, Math.round(bh * escala));
    var ctx = c.getContext('2d');
    ctx.drawImage(video, g.x, by, g.w, bh, 0, 0, c.width, c.height);
    binariza(ctx, c.width, c.height);
    return c;
  }

  // La CARA DELANTERA entera (el impreso: rótulos, nombre, fechas y el número).
  var ANVERSO_ANCHO = 1000;
  function recorteAnverso(video) {
    var g = marco(video);
    if (!g) return null;
    var escala = Math.min(1.2, ANVERSO_ANCHO / g.w);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(g.w * escala));
    c.height = Math.max(1, Math.round(g.h * escala));
    var ctx = c.getContext('2d');
    ctx.drawImage(video, g.x, g.y, g.w, g.h, 0, 0, c.width, c.height);
    estiraContraste(ctx, c.width, c.height);
    return c;
  }

  // Recorta la TARJETA entera del marco guía (sin tocar el color): es la foto del documento que se
  // guarda cuando el escáner se usa para rellenar un formulario.
  function recorteTarjeta(video) {
    var g = marco(video);
    if (!g) return '';
    var c = document.createElement('canvas');
    c.width = Math.round(g.w); c.height = Math.round(g.h);
    try {
      c.getContext('2d').drawImage(video, g.x, g.y, g.w, g.h, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88);
    } catch (_) { return ''; }
  }

  function reintentar(miSesion) {
    if (!viva(miSesion) || !corriendo) return;
    intentos += 1;
    if (Date.now() - arranque > MAX_MS) {
      corriendo = false;
      estado(cbs.qr
        ? 'No se ha podido leer ni el documento ni el código. Prueba con más luz, sin reflejos, o escribe el número.'
        : 'No se ha podido leer el documento. Prueba con más luz, sin reflejos, o acércalo un poco más. También puedes escribir el número.', 'is-err');
      return;
    }
    temporizador = setTimeout(function () { bucle(miSesion); }, INTERVALO_MS);
  }

  // Un solo escaneo para las dos cosas: el QR se prueba PRIMERO porque el detector es nativo y tarda
  // unos pocos milisegundos; si no hay código en el fotograma se sigue con la banda del documento.
  function probarQr(video, miSesion) {
    if (!detQr || !video || !video.videoWidth) return Promise.resolve(false);
    return detQr.detect(video).then(function (codigos) {
      if (!corriendo || !viva(miSesion)) return true;      // ya no es asunto de esta sesión
      var texto = (codigos && codigos.length) ? (codigos[0].rawValue || '') : '';
      if (!texto) return false;
      corriendo = false;
      estado('Código leído', 'is-ok');
      var fn = cbs.onRead;
      close();
      if (fn) fn({ qr: texto, data: {}, image: '' });
      return true;
    }).catch(function () { return false; });               // navegador quisquilloso: se sigue con el MRZ
  }

  function bucle(miSesion) {
    if (!corriendo || !viva(miSesion)) return;
    if (!window.DocScan) {
      corriendo = false;
      estado('No se ha podido cargar el lector. Escribe el número a mano.', 'is-err');
      return;
    }
    var video = overlay.querySelector('.doccam__video');
    if (detQr) {
      probarQr(video, miSesion).then(function (listo) {
        if (listo) return;                                 // ya se ha resuelto (o se ha cerrado)
        if (corriendo && viva(miSesion)) bucleDoc(miSesion, video);
      });
      return;
    }
    bucleDoc(miSesion, video);
  }

  /* ⚠️⚠️ LAS DOS CARAS. El REVERSO va primero porque es lo más rápido y lo más fiable (su banda
     lleva dígitos de control); si en las primeras vueltas no aparece, es que están poniendo la CARA
     DELANTERA —que es lo normal— y se empieza a alternar con el OCR del impreso. */
  function bucleDoc(miSesion, video) {
    if (!corriendo || !viva(miSesion)) return;
    var pruebaAnverso = intentos >= VUELTAS_SOLO_MRZ && tocaAnverso;
    tocaAnverso = !tocaAnverso;
    if (pruebaAnverso) leeAnverso(miSesion, video);
    else leeBanda(miSesion, video);
  }

  // El REVERSO: la banda del MRZ.
  function leeBanda(miSesion, video) {
    var banda = video ? recorteBanda(video) : null;
    if (!banda) { reintentar(miSesion); return; }        // el vídeo aún no tiene dimensiones
    if (intentos >= VUELTAS_SOLO_MRZ) estado('Leyendo el reverso…', 'is-warn');
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
        mrz.number_kind = tipo;
        acepta(miSesion, video, texto, mrz);
        return;
      }
      if (mrz && mrz.full_name) estado('Leyendo… ' + mrz.full_name, 'is-warn');
      reintentar(miSesion);
    }).catch(function () {
      reintentar(miSesion);
    });
  }

  // La CARA DELANTERA: el impreso (rótulos, nombre, fechas y el número).
  function leeAnverso(miSesion, video) {
    var img = video ? recorteAnverso(video) : null;
    if (!img) { reintentar(miSesion); return; }
    estado('Leyendo la cara delantera…', 'is-warn');
    window.DocScan.ocrFront(img).then(function (texto) {
      if (!corriendo || !viva(miSesion)) return;
      var d = window.DocScan.parseFrontText(texto) || {};
      var tipo = d.number ? window.DocScan.docNumberKind(d.number) : 'OTHER';
      // ⚠️ El impreso no tiene dígitos de control: la garantía es la LETRA del DNI/NIE (que solo
      // cuadra por azar 1 de cada 23 veces), así que solo se acepta con un número español válido.
      // Un pasaporte no entra por aquí: su MRZ está en la propia página de datos.
      if (tipo === 'DNI' || tipo === 'NIE') {
        d.number_kind = tipo;
        acepta(miSesion, video, texto, d);
        return;
      }
      if (d.full_name) estado('Leyendo… ' + d.full_name, 'is-warn');
      reintentar(miSesion);
    }).catch(function () {
      reintentar(miSesion);
    });
  }

  // Lectura buena: se cierra (modo solo leer) o se pregunta al servidor a quién corresponde.
  function acepta(miSesion, video, texto, datos) {
    corriendo = false;
    estado('Documento leído · ' + datos.number, 'is-ok');
    if (cbs.onRead) {
      var foto = recorteTarjeta(video), fn = cbs.onRead;
      close();
      fn({ data: datos, image: foto });
      return;
    }
    consultar(texto, datos, miSesion);
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
    estado('Buscando el documento…');
    pararCamara();
    sesion += 1; intentos = 0; arranque = Date.now(); tocaAnverso = false;
    var mia = sesion;
    arrancarCamara(mia).then(function () {
      if (!viva(mia)) return;
      corriendo = true; bucle(mia);
    }).catch(function () {});
  }

  // Salida sin cámara: escribir el número a mano y buscar igual.
  function manual() {
    var numero = window.prompt(cbs.qr
      ? 'Escribe el número del DNI, o pega el enlace del código QR:'
      : 'Número del documento (DNI, NIE o pasaporte):', '');
    if (!numero) return;
    corriendo = false;
    // En modo solo leer no hay nada que consultar: se devuelve lo escrito tal cual.
    if (cbs.onRead) {
      var fn = cbs.onRead;
      var txt = String(numero).trim();
      close();
      // Con el lector de QR activo, lo que se escribe puede ser un enlace o un token (largo): eso
      // NO es un número de documento, así que se devuelve como código.
      if (cbs.qr && (txt.indexOf('/') >= 0 || txt.length > 20)) {
        fn({ qr: txt, data: {}, image: '' });
        return;
      }
      fn({ data: { number: txt.toUpperCase().replace(/[^0-9A-Z]/g, ''), manual: true }, image: '' });
      return;
    }
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
    detQr = null;
    pararCamara();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.classList.remove('doccam-open');
  }

  function open(opciones) {
    cbs = opciones || {};
    if (overlay) close();
    // Lector de QR además del documento: solo tiene sentido en modo «solo leer» (con onRead), porque
    // un código no es un número de documento que se pueda consultar contra la base.
    detQr = null;
    if (cbs.qr && cbs.onRead && ('BarcodeDetector' in window)) {
      try { detQr = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { detQr = null; }
    }
    overlay = ui();
    document.body.classList.add('doccam-open');
    sesion += 1; intentos = 0; arranque = Date.now(); tocaAnverso = false;
    var mia = sesion;
    // El modelo de OCR se va cargando mientras el usuario coloca el documento.
    // El modelo de OCR se va cargando mientras el usuario coloca el documento (los dos workers
    // comparten el mismo modelo, así que el segundo no descarga nada más).
    if (window.DocScan && window.DocScan.mrzWarmUp) window.DocScan.mrzWarmUp();
    if (window.DocScan && window.DocScan.frontWarmUp) {
      setTimeout(function () { try { window.DocScan.frontWarmUp(); } catch (_) {} }, 400);
    }
    arrancarCamara(mia).then(function () {
      if (!viva(mia)) return;
      corriendo = true;
      bucle(mia);
    }).catch(function () { /* el estado ya explica qué ha pasado */ });
  }

  window.DocCamera = { open: open, close: close };
})();
