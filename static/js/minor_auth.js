/* AUTORIZACIÓN DE ACCESO A MENORES — hoja pública.
 *
 * Tres pasos: rellenar → leer y firmar la declaración → gracias.
 *
 * El DNI del tutor y del autorizado se leen con la cámara (`DocCamera` en modo solo leer) o
 * subiendo una foto/PDF (`DocScan`, que recorta y hace el OCR en el navegador); la imagen recortada
 * se sube y se enseña a la derecha de los datos.
 * ⚠️ El DNI del MENOR se lee pero NO se sube: de él solo se apunta el número.
 * La EDAD nunca se teclea: se calcula de la fecha de nacimiento a la fecha del concierto.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-ma]');
  if (!root) return;

  var UPLOAD_URL = root.getAttribute('data-upload-url');
  var SUBMIT_URL = root.getAttribute('data-submit-url');
  var LIMITE = parseInt(root.getAttribute('data-age-limit') || '18', 10) || 18;
  var PIDE_DNI_TUTOR = !!root.getAttribute('data-require-guardian-dni');
  var FECHA_EVENTO = root.getAttribute('data-event-date') || '';

  function q(sel, ctx) { return (ctx || root).querySelector(sel); }
  function qa(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }
  function campo(nombre) { return q('[data-f="' + nombre + '"]'); }
  function valor(nombre) { var el = campo(nombre); return el ? String(el.value || '').trim() : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fechaES(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  /* ---------------------------- Tarjetas de elección ---------------------------- */
  qa('.ma-choice').forEach(function (lab) {
    var inp = lab.querySelector('input');
    if (!inp) return;
    function pintar() {
      qa('input[name="' + inp.name + '"]').forEach(function (o) {
        var l = o.closest('.ma-choice');
        if (l) l.classList.toggle('is-on', o.checked);
      });
    }
    inp.addEventListener('change', pintar);
    pintar();
  });

  // «¿Acompaña el propio tutor?»: si no, se abren sus datos.
  var zonaEscort = q('[data-ma-escort]');
  function escoltaEsTutor() {
    var m = q('input[name="escort_is_guardian"]:checked');
    return !m || m.value === '1';
  }
  qa('input[name="escort_is_guardian"]').forEach(function (r) {
    r.addEventListener('change', function () {
      // ⚠️ .d-none, no style.display: la zona es un bloque normal pero el resto de la hoja usa las
      // clases de Bootstrap y conviene no mezclar.
      zonaEscort.classList.toggle('d-none', escoltaEsTutor());
      revisar();
    });
  });

  /* ---------------------------- Escaneo de documentos ---------------------------- */
  function rellenarPersona(prefijo, datos, imagenDataUrl) {
    if (datos.first_name && !valor(prefijo + '_first_name')) campo(prefijo + '_first_name').value = datos.first_name;
    if (datos.last_name && !valor(prefijo + '_last_name')) campo(prefijo + '_last_name').value = datos.last_name;
    if (datos.number) campo(prefijo + '_doc_number').value = datos.number;
    if (datos.birth) campo(prefijo + '_birth_date').value = datos.birth;
    if (imagenDataUrl) subirRecorte(prefijo, imagenDataUrl);
    revisar();
  }

  function pintarRecorte(prefijo, src) {
    var caja = q('[data-ma-shot="' + prefijo + '"]');
    if (!caja) return;
    caja.innerHTML = '<img src="' + esc(src) + '" alt="DNI">';
    caja.classList.add('is-on');
  }

  function subirRecorte(prefijo, dataUrl) {
    pintarRecorte(prefijo, dataUrl);
    var caja = q('[data-ma-shot="' + prefijo + '"]');
    if (caja) caja.classList.add('is-loading');
    fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var fd = new FormData();
      fd.append('file', blob, prefijo + '-dni.jpg');
      return fetch(UPLOAD_URL, { method: 'POST', body: fd }).then(function (r) { return r.json(); });
    }).then(function (res) {
      if (caja) caja.classList.remove('is-loading');
      if (res && res.ok && res.url) {
        campo(prefijo + '_doc_url').value = res.url;
        pintarRecorte(prefijo, res.url);
      } else {
        error((res && res.error) || 'No se ha podido guardar la foto del DNI.');
      }
      revisar();
    }).catch(function () {
      if (caja) caja.classList.remove('is-loading');
      error('No se ha podido guardar la foto del DNI. Revisa la conexión.');
    });
  }

  // Cámara (modo solo leer: esta página es pública y no hay a quién consultar).
  qa('[data-ma-camera]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var prefijo = btn.getAttribute('data-ma-camera');
      if (!window.DocCamera) { error('Este navegador no puede abrir la cámara. Sube una foto del DNI.'); return; }
      window.DocCamera.open({
        title: prefijo === 'guardian' ? 'DNI del padre, madre o tutor' : 'DNI de la persona autorizada',
        onRead: function (res) { rellenarPersona(prefijo, res.data || {}, res.image || ''); },
      });
    });
  });

  // Subir foto o PDF: DocScan recorta y lee.
  qa('[data-ma-file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var prefijo = inp.getAttribute('data-ma-file');
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (!window.DocScan) { error('No se ha podido cargar el lector de documentos.'); return; }
      var caja = q('[data-ma-shot="' + prefijo + '"]');
      if (caja) caja.classList.add('is-loading');
      window.DocScan.scan(f, 'DNI').then(function (res) {
        if (caja) caja.classList.remove('is-loading');
        var datos = (res && res.data) || {};
        // La cara que se guarda es el ANVERSO (la de la foto). `scan` ya deja cada cara recortada
        // en `.canvas`, que es justo lo que hay que subir.
        var caras = (res && res.faces) || [];
        var cara = null;
        for (var i = 0; i < caras.length; i++) { if (caras[i].which === 'front') { cara = caras[i]; break; } }
        if (!cara) cara = caras[0] || null;
        var img = '';
        if (cara && cara.canvas && cara.canvas.toDataURL) {
          try { img = cara.canvas.toDataURL('image/jpeg', 0.88); } catch (_) {}
        }
        rellenarPersona(prefijo, datos, img);
        if (!datos.number) error('No hemos podido leer el documento. Rellena los datos a mano; la foto ya está guardada.');
      }).catch(function () {
        if (caja) caja.classList.remove('is-loading');
        error('No hemos podido leer el documento. Rellena los datos a mano.');
      });
      inp.value = '';
    });
  });

  /* ---------------------------- Menores ---------------------------- */
  var zonaMenores = q('[data-ma-minors]');
  var tpl = document.querySelector('[data-ma-minor-tpl]');

  function edadEn(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    var n = iso.split('-').map(Number);
    var ref = /^\d{4}-\d{2}-\d{2}$/.test(FECHA_EVENTO) ? FECHA_EVENTO.split('-').map(Number) : null;
    var hoy = new Date();
    var r = ref ? { y: ref[0], m: ref[1], d: ref[2] }
                : { y: hoy.getFullYear(), m: hoy.getMonth() + 1, d: hoy.getDate() };
    var años = r.y - n[0] - ((r.m < n[1] || (r.m === n[1] && r.d < n[2])) ? 1 : 0);
    return años >= 0 ? años : null;
  }

  function renumerar() {
    qa('.ma-minor', zonaMenores).forEach(function (fila, i) {
      var n = fila.querySelector('[data-ma-minor-idx]');
      if (n) n.textContent = String(i + 1);
      var del = fila.querySelector('[data-ma-minor-del]');
      if (del) del.classList.toggle('d-none', qa('.ma-minor', zonaMenores).length <= 1);
    });
  }

  function recalcularEdad(fila) {
    var iso = (fila.querySelector('[data-m="birth_date"]').value || '').trim();
    var edad = edadEn(iso);
    fila.querySelector('[data-m="age"]').value = (edad === null ? '' : edad + ' años');
    var aviso = fila.querySelector('[data-ma-minor-warn]');
    // Aviso, no bloqueo: quien rellena puede haberse equivocado, pero también puede tratarse de un
    // hermano mayor al que no le hace falta la hoja. Se avisa y se deja seguir.
    if (edad !== null && edad >= LIMITE) {
      aviso.textContent = 'Con ' + edad + ' años no necesita autorización (es para menores de ' + LIMITE + ').';
      aviso.classList.remove('d-none');
    } else {
      aviso.classList.add('d-none');
    }
  }

  function añadirMenor() {
    var nodo = tpl.content.firstElementChild.cloneNode(true);
    zonaMenores.appendChild(nodo);
    nodo.querySelector('[data-m="birth_date"]').addEventListener('change', function () { recalcularEdad(nodo); revisar(); });
    qa('input', nodo).forEach(function (i) { i.addEventListener('input', revisar); });
    nodo.querySelector('[data-ma-minor-del]').addEventListener('click', function () {
      nodo.remove(); renumerar(); revisar();
    });
    nodo.querySelector('[data-ma-minor-camera]').addEventListener('click', function () {
      if (!window.DocCamera) { error('Este navegador no puede abrir la cámara. Escribe los datos a mano.'); return; }
      window.DocCamera.open({
        title: 'DNI del menor (no se guarda la imagen)',
        onRead: function (res) {
          var d = res.data || {};
          if (d.first_name) nodo.querySelector('[data-m="first_name"]').value = d.first_name;
          if (d.last_name) nodo.querySelector('[data-m="last_name"]').value = d.last_name;
          if (d.number) nodo.querySelector('[data-m="doc_number"]').value = d.number;
          if (d.birth) nodo.querySelector('[data-m="birth_date"]').value = d.birth;
          recalcularEdad(nodo);
          revisar();
        },
      });
    });
    renumerar();
    revisar();
    return nodo;
  }

  q('[data-ma-add-minor]').addEventListener('click', function () { añadirMenor(); });
  añadirMenor();

  function menores() {
    return qa('.ma-minor', zonaMenores).map(function (fila) {
      return {
        first_name: (fila.querySelector('[data-m="first_name"]').value || '').trim(),
        last_name: (fila.querySelector('[data-m="last_name"]').value || '').trim(),
        doc_number: (fila.querySelector('[data-m="doc_number"]').value || '').trim().toUpperCase(),
        birth_date: (fila.querySelector('[data-m="birth_date"]').value || '').trim(),
      };
    });
  }

  /* ---------------------------- Validación ---------------------------- */
  function error(msg, cual) {
    var caja = q(cual === 2 ? '[data-ma-error2]' : '[data-ma-error]');
    if (!caja) return;
    if (!msg) { caja.classList.add('d-none'); caja.textContent = ''; return; }
    caja.textContent = msg;
    caja.classList.remove('d-none');
  }

  function loQueFalta() {
    var falta = [];
    [['guardian_first_name', 'el nombre del tutor'], ['guardian_last_name', 'los apellidos del tutor'],
     ['guardian_doc_number', 'el DNI del tutor'], ['guardian_birth_date', 'la fecha de nacimiento del tutor'],
     ['guardian_phone', 'el teléfono del tutor'], ['guardian_email', 'el email del tutor']
    ].forEach(function (par) { if (!valor(par[0])) falta.push(par[1]); });
    if (PIDE_DNI_TUTOR && !valor('guardian_doc_url')) falta.push('la foto del DNI del tutor');
    var ms = menores();
    if (!ms.length) falta.push('los datos del menor');
    ms.forEach(function (m, i) {
      if (!m.first_name || !m.last_name || !m.doc_number || !m.birth_date) {
        falta.push('los datos del menor ' + (i + 1));
      }
    });
    if (!escoltaEsTutor()) {
      [['escort_first_name', 'el nombre del autorizado'], ['escort_last_name', 'los apellidos del autorizado'],
       ['escort_doc_number', 'el DNI del autorizado'], ['escort_birth_date', 'la fecha de nacimiento del autorizado'],
       ['escort_phone', 'el teléfono del autorizado'], ['escort_email', 'el email del autorizado']
      ].forEach(function (par) { if (!valor(par[0])) falta.push(par[1]); });
      if (PIDE_DNI_TUTOR && !valor('escort_doc_url')) falta.push('la foto del DNI del autorizado');
    }
    var cons = campo('consent');
    if (!cons || !cons.checked) falta.push('aceptar el tratamiento de datos');
    return falta;
  }

  var btnSeguir = q('[data-ma-continue]');
  function revisar() {
    var falta = loQueFalta();
    btnSeguir.disabled = falta.length > 0;
    if (!falta.length) error('');
  }
  qa('input, textarea, select').forEach(function (el) {
    el.addEventListener('input', revisar);
    el.addEventListener('change', revisar);
  });
  revisar();

  /* ---------------------------- Paso 2: la declaración ---------------------------- */
  function paso(cual) {
    qa('[data-ma-step]').forEach(function (el) {
      el.classList.toggle('d-none', el.getAttribute('data-ma-step') !== cual);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function linea(etiqueta, valorTxt) {
    if (!valorTxt) return '';
    return '<div><span>' + esc(etiqueta) + '</span><strong>' + esc(valorTxt) + '</strong></div>';
  }

  function pintarDeclaracion() {
    var tipo = (q('input[name="guardian_kind"]:checked') || {}).value || 'TUTOR';
    var etiquetaTipo = { PADRE: 'Padre', MADRE: 'Madre', TUTOR: 'Tutor legal' }[tipo] || 'Tutor legal';
    q('[data-ma-doc-guardian]').innerHTML =
      linea('Nombre y apellidos', valor('guardian_first_name') + ' ' + valor('guardian_last_name')) +
      linea('En calidad de', etiquetaTipo) +
      linea('DNI', valor('guardian_doc_number')) +
      linea('Teléfono', valor('guardian_phone')) +
      linea('Email', valor('guardian_email'));
    var shot = valor('guardian_doc_url');
    q('[data-ma-doc-guardian-shot]').innerHTML = shot ? '<img src="' + esc(shot) + '" alt="">' : '';

    q('[data-ma-doc-minors]').innerHTML = menores().map(function (m) {
      var e = edadEn(m.birth_date);
      return '<div class="ma-doc__grid ma-doc__grid--minor">' +
        linea('Nombre y apellidos', m.first_name + ' ' + m.last_name) +
        linea('DNI', m.doc_number) +
        linea('Fecha de nacimiento', fechaES(m.birth_date)) +
        linea('Edad', e === null ? '' : e + ' años') +
        '</div>';
    }).join('');

    var wrap = q('[data-ma-doc-escort-wrap]');
    if (escoltaEsTutor()) {
      wrap.classList.add('d-none');
    } else {
      wrap.classList.remove('d-none');
      q('[data-ma-doc-escort]').innerHTML =
        linea('Nombre y apellidos', valor('escort_first_name') + ' ' + valor('escort_last_name')) +
        linea('DNI', valor('escort_doc_number'));
      var s2 = valor('escort_doc_url');
      q('[data-ma-doc-escort-shot]').innerHTML = s2 ? '<img src="' + esc(s2) + '" alt="">' : '';
    }
  }

  btnSeguir.addEventListener('click', function () {
    var falta = loQueFalta();
    if (falta.length) { error('Falta ' + falta.slice(0, 4).join(', ') + (falta.length > 4 ? '…' : '') + '.'); return; }
    pintarDeclaracion();
    paso('sign');
    ajustarLienzo();
  });
  q('[data-ma-back]').addEventListener('click', function () { paso('form'); });

  /* ---------------------------- Firma a mano ---------------------------- */
  var lienzo = q('[data-ma-canvas]');
  var ctx = lienzo.getContext('2d');
  var pintando = false, hayFirma = false;

  function ajustarLienzo() {
    var ancho = lienzo.parentNode.clientWidth || 600;
    var ratio = window.devicePixelRatio || 1;
    var datos = hayFirma ? lienzo.toDataURL() : '';
    lienzo.width = Math.round(ancho * ratio);
    lienzo.height = Math.round(200 * ratio);
    lienzo.style.width = ancho + 'px';
    lienzo.style.height = '200px';
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111820';
    if (datos) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, ancho, 200); };
      img.src = datos;
    }
  }
  window.addEventListener('resize', ajustarLienzo);

  function punto(ev) {
    var r = lienzo.getBoundingClientRect();
    var t = ev.touches ? ev.touches[0] : ev;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function empezar(ev) {
    ev.preventDefault();
    pintando = true; hayFirma = true;
    var p = punto(ev);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }
  function mover(ev) {
    if (!pintando) return;
    ev.preventDefault();
    var p = punto(ev);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function acabar() { pintando = false; }
  ['mousedown', 'touchstart'].forEach(function (e) { lienzo.addEventListener(e, empezar, { passive: false }); });
  ['mousemove', 'touchmove'].forEach(function (e) { lienzo.addEventListener(e, mover, { passive: false }); });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (e) { lienzo.addEventListener(e, acabar); });
  q('[data-ma-clear]').addEventListener('click', function () {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    hayFirma = false;
  });

  /* ---------------------------- Enviar ---------------------------- */
  var btnEnviar = q('[data-ma-submit]');
  btnEnviar.addEventListener('click', function () {
    if (!hayFirma) { error('Firma en el recuadro antes de enviar.', 2); return; }
    var falta = loQueFalta();
    if (falta.length) { error('Falta ' + falta.slice(0, 4).join(', ') + '.', 2); paso('form'); return; }
    error('', 2);
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i class="fa fa-spinner fa-spin me-2"></i>Guardando…';
    var cuerpo = {
      guardian_kind: (q('input[name="guardian_kind"]:checked') || {}).value || 'TUTOR',
      guardian_first_name: valor('guardian_first_name'),
      guardian_last_name: valor('guardian_last_name'),
      guardian_doc_number: valor('guardian_doc_number'),
      guardian_birth_date: valor('guardian_birth_date'),
      guardian_phone: valor('guardian_phone'),
      guardian_email: valor('guardian_email'),
      guardian_doc_url: valor('guardian_doc_url'),
      escort_is_guardian: escoltaEsTutor() ? '1' : '',
      escort_first_name: valor('escort_first_name'),
      escort_last_name: valor('escort_last_name'),
      escort_doc_number: valor('escort_doc_number'),
      escort_birth_date: valor('escort_birth_date'),
      escort_phone: valor('escort_phone'),
      escort_email: valor('escort_email'),
      escort_doc_url: valor('escort_doc_url'),
      consent: '1',
      minors: menores(),
      signature: lienzo.toDataURL('image/png'),
    };
    fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(cuerpo),
    }).then(function (r) { return r.json(); }).then(function (res) {
      btnEnviar.disabled = false;
      btnEnviar.innerHTML = '<i class="fa fa-check me-2"></i>Aceptar y firmar';
      if (!res || !res.ok) { error((res && res.error) || 'No se ha podido guardar.', 2); return; }
      var enlace = q('[data-ma-pass]');
      if (enlace && res.pass_url) enlace.setAttribute('href', res.pass_url);
      var aviso = q('[data-ma-mailwarn]');
      if (aviso) aviso.hidden = !!res.email_sent;
      paso('done');
    }).catch(function () {
      btnEnviar.disabled = false;
      btnEnviar.innerHTML = '<i class="fa fa-check me-2"></i>Aceptar y firmar';
      error('No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.', 2);
    });
  });
})();
