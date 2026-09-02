/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LO QUE SE ESCRIBE NO SE PIERDE · guardado en vivo de lo tecleado (GLOBAL)

   ⚠️⚠️ EL PROBLEMA: casi todos los endpoints guardan con POST → `flash('…')` → `redirect(...)`.
   Cuando algo falla, el navegador acaba en un GET limpio y **el formulario sale VACÍO**: hay que
   volver a teclearlo todo. En el asistente de actividad es peor, porque el redirect va a OTRA
   pantalla y con el modal cerrado.

   CÓMO FUNCIONA (nada que declarar en los formularios: va por DELEGACIÓN):
     · mientras se escribe, lo tecleado se guarda en `sessionStorage` bajo una clave estable;
     · si el guardado SALE BIEN, se tira: al enviar se borra por defecto;
     · **solo se conserva si el SERVIDOR dice que ha rechazado el envío** (`_flash_form_error` en
       app.py → `data-form-rechazado` en el `<body>`), y entonces se repone solo, se reabre el sitio
       donde se estaba y se marca en rojo lo que hay que arreglar;
     · y si queda algo sin enviar de antes, NO se pisa nada a la callada: sale una línea con
       «Tienes lo que escribiste a las 12:40 sin enviar · Seguir con eso / Empezar de cero».

   ⚠️⚠️ POR QUÉ NO SE MIRA EL COLOR DEL AVISO: en esta app hay decenas de avisos ÁMBAR que
   significan ÉXITO («Usuario creado. No se pudo enviar el correo de bienvenida», «ITA subido, pero
   no se pudo leer la fecha»…). Dando eso por rechazado, el formulario volvería relleno después de
   haber creado la ficha y se acabarían duplicando terceros y personas — que en esta casa rompe el
   cruce por DNI de facturación y el reparto editorial. Manda el servidor, no el color.

   ⚠️ VOCABULARIO: aquí no se dice «borrador» (en esta app BORRADOR es el estado de una actividad y
   nadie sabría si se habla de una cosa o de la otra), ni «autoguardado», ni «restaurar». Se dice
   «lo que escribiste» y «seguir con eso».
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33FormAutosave) return;

  /* ── POLÍTICA: dónde se guarda, qué, cuánto y hasta cuándo ───────────────────────────────── */
  var PREFIJO = 'a33f:';
  var CLAVE_ENVIO = 'a33f!envio';            // el último envío, para saber qué borrar
  var RETARDO = 400;                         // ms desde la última tecla
  var CADUCA_MS = 6 * 60 * 60 * 1000;        // lo de hace seis horas ya no se ofrece
  var MAX_VALOR = 20 * 1024;                 // un valor más gordo no se guarda
  var MAX_TOTAL = 300 * 1024;
  var MAX_GUARDADOS = 12;
  var CAMPOS = 'input, select, textarea';
  var TIPOS_FUERA = { password: 1, file: 1, submit: 1, button: 1, image: 1, reset: 1 };
  /* Por NOMBRE, lo que NO puede quedar escrito en el disco de nadie. Es la red de seguridad para
     cuando alguien añada mañana un formulario con credenciales y se olvide de marcarlo. */
  var NOMBRES_FUERA = new RegExp([
    'contrase', 'password', 'passwd', 'clave', 'secret', 'token', 'refresh',
    'api_?key', '(^|_)key$', 'credential', 'cvv', 'card', 'tarjeta',
    'consent', 'acepto', 'acepta', 'firma', 'signature',   // un consentimiento se da, no se repone
    '_b64$',                                               // la foto del DNI del escáner
  ].join('|'), 'i');
  var CSRF = /^(csrf_token|_csrf|csrf)$/i;

  function almacen() {
    try {
      var s = window.sessionStorage;
      s.getItem(PREFIJO);                    // en una ventana privada esto ya revienta
      return s;
    } catch (e) { return null; }
  }
  /* ⚠️ SOLO EN EL BACK OFFICE: lo enciende `layout.html` con `data-autosave` en el `<body>`. Las
     páginas públicas (facturación, entrega de masters, PRL, autorizaciones de MENORES con su DNI y
     su firma) se rellenan desde el móvil de un tercero o desde un ordenador compartido: ahí no se
     deja nada escrito en el disco — y además esas páginas ya vuelven rellenas del servidor. */
  function encendido() {
    try { return !!(document.body && document.body.hasAttribute('data-autosave')); }
    catch (e) { return false; }
  }
  function ahora() { return (new Date()).getTime(); }
  function esc(s) { return String(s == null ? '' : s); }

  /* ── LA CLAVE de un formulario ────────────────────────────────────────────────────────────── */
  function uuidsDe(txt) {
    var m = esc(txt).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
    return m ? m.join(',') : '';
  }
  /* ⚠️⚠️ LISTA BLANCA: un formulario solo entra si se puede identificar SIN AMBIGÜEDAD. Que un
     campo no se recupere es un fallo tolerable; que se recupere **en la fila de al lado** no lo es
     (el importe de un gasto apareciendo escrito en el gasto siguiente se firma sin sospechar). Por
     eso hacen falta: un `data-autosave` propio, o un `id` ÚNICO en la página, o que su acción lleve
     el id del registro. Los cientos de formularios de dentro de un `{% for %}` que postean a la
     misma URL sin id se quedan fuera a propósito. */
  function claveForm(form) {
    if (!form || form.nodeName !== 'FORM') return '';
    if (form.hasAttribute('data-no-autosave')) return '';
    if ((form.getAttribute('method') || 'get').toLowerCase() !== 'post') return '';
    var ref = uuidsDe(form.getAttribute('action'));
    var nombre = form.getAttribute('data-autosave') || '';
    if (!nombre && form.id) {
      try {
        if (document.querySelectorAll('[id="' + form.id + '"]').length === 1) nombre = form.id;
      } catch (e) { nombre = form.id; }
    }
    if (!nombre && ref) {
      // Sin nombre propio pero con el id del registro en la acción: eso ya identifica la fila.
      try { nombre = (new URL(form.getAttribute('action'), location.href)).pathname; }
      catch (e) { nombre = form.getAttribute('action') || ''; }
    }
    if (!nombre) return '';
    return PREFIJO + nombre + '|' + (ref || uuidsDe(location.pathname));
  }
  /* Cómo se llama lo que se recupera, para poder decirlo: «Gasto · bolsa Los Ñus». Un guardado que
     no se puede rotular no se ofrece. */
  function tituloDe(form) {
    var t = form.getAttribute('data-autosave-title');
    if (t) return t.trim();
    var caja = form.closest('.modal');
    var h = (caja && caja.querySelector('.modal-title'))
      || form.querySelector('.modal-title, legend, h1, h2, h3, h5, h6');
    var txt = h ? esc(h.textContent).replace(/\s+/g, ' ').trim() : '';
    return txt.slice(0, 70);
  }

  /* ── LOS CAMPOS ───────────────────────────────────────────────────────────────────────────── */
  function fuera(el) {
    if (!el || !el.name) return true;
    if (TIPOS_FUERA[el.type]) return true;
    if (CSRF.test(el.name)) return true;
    if (NOMBRES_FUERA.test(el.name)) return true;
    if (el.hasAttribute('data-no-autosave')) return true;
    if (el.closest('[data-no-autosave]')) return true;
    return false;
  }
  function claveCampo(el) {
    if (el.type === 'radio' || el.type === 'checkbox') return el.name + ' = ' + esc(el.value);
    if (el.multiple) return el.name + ' []';
    return el.name;
  }
  function valorDe(el) {
    if (el.type === 'radio' || el.type === 'checkbox') return el.checked ? '1' : '';
    if (el.multiple) {
      return Array.prototype.filter.call(el.options, function (o) { return o.selected; })
        .map(function (o) { return o.value; });
    }
    return esc(el.value);
  }
  function vacio(v) { return Array.isArray(v) ? !v.length : !esc(v).trim(); }

  /* ⚠️ SOLO SE GUARDA LO QUE APORTA: un valor escrito, o un campo que se ha DEJADO VACÍO a
     propósito habiéndolo traído relleno (`defaultValue`/`defaultChecked`, que el navegador conserva
     tal como llegó del servidor). Guardando también los cientos de radios vacíos de un asistente,
     lo tecleado eran 14 KB de nada. */
  function aporta(el, v) {
    if (el.type === 'radio' || el.type === 'checkbox') return el.checked !== el.defaultChecked || el.checked;
    if (!vacio(v)) return true;
    if (el.multiple) return Array.prototype.some.call(el.options, function (o) { return o.defaultSelected; });
    return !!esc(el.defaultValue).trim();          // venía relleno y se ha vaciado: eso también es un dato
  }
  function recoge(form) {
    var datos = {}, hay = false, peso = 0;
    Array.prototype.forEach.call(form.querySelectorAll(CAMPOS), function (el) {
      if (fuera(el)) return;
      var v = valorDe(el);
      if (!aporta(el, v)) return;
      var texto = Array.isArray(v) ? v.join('|') : v;
      if (texto.length > MAX_VALOR) return;
      peso += texto.length;
      if (peso > MAX_TOTAL) return;
      datos[claveCampo(el)] = v;
      if (!vacio(v)) hay = true;
    });
    return hay ? datos : null;
  }
  /* ¿El formulario venía con datos del servidor? (una ficha de EDICIÓN, o un alta precumplimentada)
     ⚠️ NO cuentan los radios ni las casillas marcadas por defecto: el asistente de actividad trae
     una docena («¿tiene caché?» No, «anuncio» TBC…) y con eso TODO formulario parecía venir relleno,
     así que nunca se reponía nada y solo salía la línea de ofrecerlo. Lo que cuenta es un valor
     ESCRITO por el servidor: `defaultValue` de un campo de texto o una opción elegida de un select. */
  function traiaDatos(form) {
    if (form.__autosaveTraia !== undefined) return form.__autosaveTraia;
    var trae = false;
    Array.prototype.forEach.call(form.querySelectorAll(CAMPOS), function (el) {
      if (trae || fuera(el)) return;
      if (el.type === 'radio' || el.type === 'checkbox') return;
      if (el.nodeName === 'SELECT') {
        var elegida = Array.prototype.filter.call(el.options, function (o) { return o.defaultSelected; });
        if (elegida.length && elegida[0] !== el.options[0] && esc(elegida[0].value).trim()) trae = true;
        return;
      }
      if (esc(el.defaultValue).trim()) trae = true;
    });
    form.__autosaveTraia = trae;
    return trae;
  }

  /* ── GUARDAR / LEER / BORRAR ──────────────────────────────────────────────────────────────── */
  function lee(clave) {
    var s = almacen(); if (!s || !clave) return null;
    try {
      var b = JSON.parse(s.getItem(clave) || 'null');
      if (!b || !b.campos) return null;
      if (ahora() - (b.t || 0) > CADUCA_MS) { s.removeItem(clave); return null; }
      return b;
    } catch (e) { return null; }
  }
  function escribe(clave, b) {
    var s = almacen(); if (!s || !clave) return;
    try { s.setItem(clave, JSON.stringify(b)); }
    catch (e) { try { poda(true); s.setItem(clave, JSON.stringify(b)); } catch (e2) {} }
  }
  function borra(clave) {
    var s = almacen(); if (!s || !clave) return;
    try { s.removeItem(clave); } catch (e) {}
  }
  function poda(agresiva) {
    var s = almacen(); if (!s) return;
    try {
      var filas = [];
      for (var i = 0; i < s.length; i++) {
        var k = s.key(i);
        if (!k || k.indexOf(PREFIJO) !== 0) continue;
        var b = null;
        try { b = JSON.parse(s.getItem(k) || 'null'); } catch (e) {}
        filas.push([(b && b.t) || 0, k]);
      }
      filas.sort(function (a, b2) { return b2[0] - a[0]; });
      var tope = agresiva ? Math.max(2, Math.floor(MAX_GUARDADOS / 3)) : MAX_GUARDADOS;
      filas.forEach(function (f, idx) {
        if (!f[0] || idx >= tope || ahora() - f[0] > CADUCA_MS) s.removeItem(f[1]);
      });
    } catch (e) {}
  }
  // Al salir de la sesión no puede quedar nada de nadie (un equipo compartido).
  function limpiaTodo() {
    var s = almacen(); if (!s) return;
    try {
      var quitar = [];
      for (var i = 0; i < s.length; i++) {
        var k = s.key(i);
        if (k && (k.indexOf(PREFIJO) === 0 || k === CLAVE_ENVIO)) quitar.push(k);
      }
      quitar.forEach(function (k) { s.removeItem(k); });
    } catch (e) {}
  }

  var temporizadores = {};
  function programa(form) {
    var clave = claveForm(form); if (!clave) return;
    if (temporizadores[clave]) clearTimeout(temporizadores[clave]);
    temporizadores[clave] = setTimeout(function () {
      delete temporizadores[clave];
      guarda(form);
    }, RETARDO);
  }
  function guarda(form) {
    var clave = claveForm(form); if (!clave || !form.isConnected) return;
    var datos = recoge(form);
    if (!datos) { borra(clave); return; }
    escribe(clave, {
      t: ahora(), campos: datos, titulo: tituloDe(form),
      ruta: location.pathname + location.search,
      modal: (function () { var m = form.closest('.modal'); return m && m.id ? m.id : ''; })(),
      // ¿había archivos adjuntos? Un fichero no se puede reponer: hay que decirlo.
      ficheros: !!form.querySelector('input[type="file"]'),
    });
  }

  /* ── REPONER LO ESCRITO ───────────────────────────────────────────────────────────────────── */
  function avisa(el) {
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    /* ⚠️ UN SELECT2 SOLO SE ENTERA POR jQuery: un evento nativo no ejecuta sus manejadores. */
    try {
      if (window.jQuery && el.classList && el.classList.contains('select2-hidden-accessible')) {
        window.jQuery(el).trigger('change');
      }
    } catch (e) {}
  }
  function pon(el, v) {
    if (el.type === 'radio' || el.type === 'checkbox') {
      var marcado = !vacio(v);
      if (el.checked === marcado) return false;
      el.checked = marcado;
      return true;
    }
    if (el.multiple && Array.isArray(v)) {
      var set = {}; v.forEach(function (x) { set[x] = 1; });
      var cambio = false;
      Array.prototype.forEach.call(el.options, function (o) {
        var q = !!set[o.value];
        if (o.selected !== q) { o.selected = q; cambio = true; }
      });
      return cambio;
    }
    if (esc(el.value) === esc(v)) return false;
    el.value = esc(v);
    return true;
  }

  function repone(form, b) {
    if (!form || !b || !b.campos) return 0;
    var puestos = [];
    Array.prototype.forEach.call(form.querySelectorAll(CAMPOS), function (el) {
      if (fuera(el)) return;
      var k = claveCampo(el);
      if (!(k in b.campos)) return;
      if (pon(el, b.campos[k])) puestos.push(el);
    });
    puestos.forEach(avisa);
    /* ⚠️ Un `change` puede haber LIMPIADO campos que dependen de él (elegir artista vacía el
       repertorio): lo que se haya quedado sin su valor se vuelve a poner, esta vez sin avisar. */
    Array.prototype.forEach.call(form.querySelectorAll(CAMPOS), function (el) {
      if (fuera(el)) return;
      var k = claveCampo(el);
      if (k in b.campos) pon(el, b.campos[k]);
    });
    marcaFicheros(form, b);
    form.__autosaveRepuesto = true;
    return puestos.length;
  }
  /* ⚠️ UN ARCHIVO NO SE PUEDE REPONER: el hueco vuelve vacío y, sin decirlo, el formulario tiene
     aspecto de estar completo y se manda la factura SIN la factura. Se marca y se dice. */
  function marcaFicheros(form, b) {
    if (!b || !b.ficheros) return;
    form.querySelectorAll('input[type="file"]').forEach(function (el) {
      if (el.disabled || el.offsetParent === null) return;
      el.classList.add('is-check-missing');
      if (!el.getAttribute('data-autosave-file-msg')) {
        el.setAttribute('data-autosave-file-msg', '1');
        var n = document.createElement('div');
        n.className = 'form-text text-warning-emphasis';
        n.textContent = 'Vuelve a adjuntarlo: un archivo no se puede guardar solo.';
        if (el.parentNode) el.parentNode.insertBefore(n, el.nextSibling);
      }
    });
  }

  /* ── LA LÍNEA de «tienes algo sin enviar» ─────────────────────────────────────────────────── */
  function ofrece(form, clave, b) {
    if (form.querySelector('[data-autosave-bar]')) return;
    /* ⚠️ Si el formulario ya trae el aviso del rechazo, lo escrito YA está repuesto: ofrecer encima
       «¿quieres recuperar lo que escribiste?» es preguntar por algo que ya está hecho (y salía, con
       captura, en el asistente de actividad). Da igual quién llame aquí. */
    if (form.querySelector('[data-autosave-msg]')) return;
    if (form.__autosaveRepuesto) return;
    var que = b.titulo ? (' en ' + b.titulo) : '';
    var caja = document.createElement('div');
    caja.className = 'autosave-bar';
    caja.setAttribute('data-autosave-bar', '');
    caja.innerHTML =
      '<span class="autosave-bar__txt"><i class="fa fa-clock-rotate-left me-2"></i>Tienes lo que '
      + 'escribiste a las ' + hora(b.t) + esc(que) + ' sin enviar.</span>'
      + '<span class="autosave-bar__btns">'
      + '<button type="button" class="btn btn-sm btn-outline-primary" data-autosave-go>Seguir con eso</button> '
      + '<button type="button" class="btn btn-sm btn-link text-muted" data-autosave-drop>Empezar de cero</button>'
      + '</span>';
    var host = form.querySelector('.modal-body') || form;
    host.insertBefore(caja, host.firstChild);
    caja.querySelector('[data-autosave-go]').addEventListener('click', function () {
      repone(form, b);
      caja.remove();
    });
    caja.querySelector('[data-autosave-drop]').addEventListener('click', function () {
      borra(clave);
      caja.remove();
    });
  }
  function hora(t) {
    try {
      var d = new Date(t || ahora());
      return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    } catch (e) { return '—'; }
  }

  /* ── LO QUE DICE EL SERVIDOR ──────────────────────────────────────────────────────────────── */
  function delCuerpo(attr) {
    try { return (document.body && document.body.getAttribute(attr)) || ''; } catch (e) { return ''; }
  }
  function rechazo() {
    // `data-form-rechazado` lo pone `_flash_form_error` (app.py): {campos, mensaje, abrir}
    var raw = delCuerpo('data-form-rechazado');
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      return (d && typeof d === 'object') ? d : null;
    } catch (e) { return null; }
  }
  /* El aviso de que NO se ha guardado va DENTRO del formulario (en un modal, el flash de arriba
     queda detrás; en una ficha larga, fuera de pantalla). ⚠️ Y no puede ser hijo directo de
     `<main>`: `showFlashes` borra y reinserta todos los `.alert` de ahí en cada guardado inline. */
  function aviso(form, texto) {
    if (!texto) return;
    var previo = form.querySelector('[data-autosave-msg]');
    if (previo) previo.remove();
    var caja = document.createElement('div');
    caja.className = 'alert alert-danger py-2 px-3 mb-2';
    caja.setAttribute('data-autosave-msg', '');
    caja.innerHTML = '<i class="fa fa-triangle-exclamation me-2"></i>' + esc(texto);
    var host = form.querySelector('.modal-body') || form;
    host.insertBefore(caja, host.firstChild);
  }
  function pintaCampos(campos) {
    var primero = null;
    (campos || []).forEach(function (n) {
      var sel = '[name="' + ((window.CSS && CSS.escape) ? CSS.escape(n) : n) + '"]';
      document.querySelectorAll(sel).forEach(function (el) {
        if (window.app33FormCheck) window.app33FormCheck.bad(el);
        else el.classList.add('is-check-bad');
        if (!primero) primero = el;
      });
    });
    return primero;
  }

  /* ── EL CICLO ─────────────────────────────────────────────────────────────────────────────── */
  function alEnviar(form) {
    var clave = claveForm(form); if (!clave) return;
    guarda(form);
    var s = almacen(); if (!s) return;
    try { s.setItem(CLAVE_ENVIO, JSON.stringify({ clave: clave, t: ahora() })); } catch (e) {}
  }
  /* ⚠️⚠️ SE BORRA POR DEFECTO: si el servidor no dice que ha rechazado el envío, el guardado ENTRÓ
     (aunque el aviso sea ámbar) y lo tecleado ya no vale. Conservarlo sería devolver el formulario
     relleno después de crear la ficha, y de ahí salen los duplicados. */
  function cierra(rech) {
    var s = almacen(); if (!s) return null;
    var info = null;
    try { info = JSON.parse(s.getItem(CLAVE_ENVIO) || 'null'); } catch (e) {}
    try { s.removeItem(CLAVE_ENVIO); } catch (e) {}
    if (!info || !info.clave) return null;
    if (rech) return info.clave;
    borra(info.clave);
    return null;
  }

  function reabre(id) {
    if (!id) return;
    try {
      if (typeof window.app33AutoOpenModal === 'function') window.app33AutoOpenModal(id);
    } catch (e) {}
  }

  function repasa(raiz, claveRepuesta) {
    (raiz || document).querySelectorAll('form').forEach(function (form) {
      var clave = claveForm(form);
      if (!clave || form.__autosaveVisto === clave) return;
      form.__autosaveVisto = clave;
      var b = lee(clave);
      if (!b) return;
      if (clave === claveRepuesta) return;          // ya se ha repuesto arriba
      /* ⚠️ NUNCA se fusiona campo a campo en silencio: en una ficha de EDICIÓN el resultado sería
         mitad de hoy y mitad de anteayer sin ninguna señal, y eso en un caché o un IBAN se firma.
         Si el formulario venía con datos, se OFRECE; si estaba vacío, se repone y se dice. */
      if (traiaDatos(form)) { ofrece(form, clave, b); return; }
      repone(form, b);
      ofrece(form, clave, b);
      var barra = form.querySelector('[data-autosave-bar]');
      if (barra) {
        barra.querySelector('.autosave-bar__txt').innerHTML =
          '<i class="fa fa-clock-rotate-left me-2"></i>Esto es lo que escribiste a las '
          + hora(b.t) + ' y no se envió.';
        var go = barra.querySelector('[data-autosave-go]');
        if (go) go.remove();
      }
    });
  }

  var arrancado = false;                     // hasta el primer repaso no se ofrece nada
  function alCargar() {
    if (!encendido()) {
      // Fuera del back office no se guarda nada… y si algo quedó de otra sesión, se tira.
      if (document.querySelector('form[action*="/admin"], form#loginForm, [data-login-form]')) limpiaTodo();
      return;
    }
    poda(false);
    var rech = rechazo();
    var clave = cierra(!!rech);
    if (rech) {
      /* ⚠️ Si el envío no pasó por el evento `submit` (hay pantallas que llaman a `form.submit()`,
         que NO lo dispara) no hay clave apuntada: se saca del FORMULARIO del sitio que el servidor
         dice reabrir. Sin esto el modal se reabría vacío, que es el bug que se quería arreglar. */
      var form = null;
      if (!clave && rech.abrir) {
        var caja = document.getElementById(rech.abrir);
        var cand = caja ? caja.querySelector('form') : null;
        if (cand) { clave = claveForm(cand); form = cand; }
      }
      /* ⚠️ Se marca como visto ANTES de reabrir: si Bootstrap ya está cargado, `show.bs.modal`
         salta en el mismo instante y el repaso general se adelantaba, sacando la línea de «tienes
         algo sin enviar» encima de lo que se estaba reponiendo (bug real, con captura). */
      if (form && clave) form.__autosaveVisto = clave;
      // Se vuelve al SITIO donde se estaba (el modal que se cerró con el redirect).
      reabre(rech.abrir || (clave ? (lee(clave) || {}).modal : ''));
      var b = clave ? lee(clave) : null;
      if (b && !form) {
        document.querySelectorAll('form').forEach(function (f) {
          if (!form && claveForm(f) === clave) form = f;
        });
      }
      if (form) {
        form.__autosaveVisto = clave;
        repone(form, b);
        aviso(form, rech.mensaje || 'No se ha guardado. Repasa lo que está marcado.');
      }
      var primero = pintaCampos(rech.campos || []);
      if (form && !(rech.campos || []).length && window.app33FormCheck) {
        try { window.app33FormCheck.check(form, { message: false, focus: false }); } catch (e) {}
      }
      if (primero) { try { primero.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    }
    repasa(document, clave);
    arrancado = true;
    observa();
  }
  if (document.readyState !== 'loading') alCargar();
  else document.addEventListener('DOMContentLoaded', alCargar);

  document.addEventListener('input', function (e) {
    if (!encendido()) return;
    var f = e.target && e.target.form;
    if (f) programa(f);
  }, true);
  document.addEventListener('change', function (e) {
    if (!encendido()) return;
    var f = e.target && e.target.form;
    if (f) programa(f);
  }, true);
  document.addEventListener('submit', function (e) {
    if (!encendido()) return;
    if (e.target && e.target.nodeName === 'FORM') alEnviar(e.target);
  });

  /* Un modal que se abre: sus formularios se repasan AHÍ (con `show`, no con `shown`, que con
     `modal_stack.js` por medio no siempre llega).
     ⚠️⚠️ PERO NO ANTES DEL PRIMER REPASO: cuando el servidor rechaza el envío, el redirect lleva
     `open_wizard=1` y el asistente **se abre solo** —su propio script, con reintentos— y eso pasaba
     ANTES del `DOMContentLoaded` de este motor: `repasa` no sabía todavía que ese formulario era el
     del envío rechazado y sacaba la línea de «tienes algo sin enviar» encima de lo que un instante
     después se reponía solo (bug real, con captura: las dos cosas a la vez). */
  document.addEventListener('show.bs.modal', function (e) {
    if (!encendido() || !arrancado) return;
    try { repasa(e.target, null); } catch (err) {}
  });

  /* Un guardado por AJAX no navega. `ajax_inline.js` dice si salió bien (`ok` en el evento): si
     entró, lo tecleado ya no vale; si no, se conserva y se ofrece sobre la zona nueva. */
  document.addEventListener('inline:updated', function (e) {
    if (!encendido()) return;
    var det = (e && e.detail) || {};
    var scope = det.scope || document;
    var forms = scope.querySelectorAll ? scope.querySelectorAll('form') : [];
    Array.prototype.forEach.call(forms, function (form) {
      var clave = claveForm(form); if (!clave) return;
      form.__autosaveVisto = clave;
      form.__autosaveTraia = undefined;
      if (det.ok === false) {
        var b = lee(clave);
        if (b) ofrece(form, clave, b);
      } else {
        borra(clave);
      }
    });
  });

  /* Lo que se pinta DESPUÉS (un modal por AJAX, una zona repintada) también entra.
     ⚠️⚠️ El observador se instala AL FINAL del primer repaso, NO al cargar el fichero: mientras el
     navegador terminaba de leer la página, el observador iba viendo aparecer nodos y llamaba a
     `repasa` ANTES de que `alCargar` hubiera repuesto nada — así que sacaba la línea de «tienes algo
     sin enviar» encima de un formulario que un instante después se reponía solo (bug real, con
     captura: salían las dos cosas a la vez en el asistente). */
  function observa() {
    try {
      new MutationObserver(function (cambios) {
        if (!encendido() || !arrancado) return;
        for (var i = 0; i < cambios.length; i++) {
          var nodos = cambios[i].addedNodes || [];
          for (var j = 0; j < nodos.length; j++) {
            var n = nodos[j];
            if (!n || n.nodeType !== 1) continue;
            if (n.nodeName === 'FORM') repasa(n.parentNode || document, null);
            else if (n.querySelector && n.querySelector('form')) repasa(n, null);
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  window.app33FormAutosave = {
    save: guarda,
    restore: function (form) { var b = lee(claveForm(form)); return b ? repone(form, b) : 0; },
    clear: function (form) { borra(claveForm(form)); },
    clearAll: limpiaTodo,
    key: claveForm,
    /* Para una pantalla que guarda por su cuenta (un fetch propio): decir cómo fue. */
    done: function (form, ok) { if (ok === false) guarda(form); else borra(claveForm(form)); },
  };
})();
