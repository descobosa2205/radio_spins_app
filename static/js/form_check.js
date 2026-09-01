/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LO QUE FALTA O ESTÁ MAL SE VE, Y NO SE DEJA PASAR · comprobación de formularios (GLOBAL)

   ⚠️⚠️ Antes se podía recorrer un asistente entero y el fallo aparecía AL FINAL, sin decir dónde:
   había que volver a buscar el campo. Ahora, al intentar pasar de pantalla (o al enviar), lo que
   falta se marca **EN AMARILLO** y lo que está **MAL en ROJO**, se lleva el foco al primero y no se
   avanza hasta arreglarlo.

   Cómo se usa (nada que declarar: va por delegación en TODA la app):
     · `submit` de cualquier formulario → se comprueba solo. Opt-out: `[data-no-check]`.
     · un asistente por pasos comprueba SU paso con
       `window.app33FormCheck.check(seccion)` → true/false (lo hacen `step_wizard.js` y el
       asistente de actividad).
     · una pantalla puede marcar un campo suyo como mal con
       `window.app33FormCheck.bad(campo, 'por qué')` y limpiarlo con `clear(campo)`.

   Reglas:
     · **Obligatorio y vacío → AMARILLO** (`.is-check-missing`): no es un error, es que falta.
     · **Relleno pero mal → ROJO** (`.is-check-bad`): un correo sin arroba, un número fuera de rango.
     · Un campo **oculto o deshabilitado NO se comprueba**: los pasos que no tocan y los paneles
       cerrados no pueden bloquear un envío (la casa ya los deshabilita, y aquí se mira además si se
       ven).
     · La marca se quita **en cuanto se arregla** (al escribir o al elegir), sin volver a enviar.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33FormCheck) return;

  var CLS_FALTA = 'is-check-missing';
  var CLS_MAL = 'is-check-bad';
  var CAMPOS = 'input, select, textarea';

  function visible(el) {
    if (!el || el.disabled) return false;
    if (el.type === 'hidden') return false;
    // `offsetParent` es null en lo que está oculto (d-none, display:none, un paso que no toca).
    // ⚠️ Un radio o un checkbox pueden estar escondidos a propósito (las tarjetas de la casa usan
    // `visually-hidden`): ahí manda si SU tarjeta se ve.
    if (el.offsetParent !== null) return true;
    var caja = el.closest('label, .form-check, .activity-choice-card');
    return !!(caja && caja.offsetParent !== null);
  }
  function esObligatorio(el) {
    return !!(el.required || el.getAttribute('data-required') === '1');
  }
  function vacio(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
    return !String(el.value == null ? '' : el.value).trim();
  }
  /* Un GRUPO de radios está vacío cuando no hay ninguno marcado: lo que se marca es su caja, no un
     radio suelto (si no, se pintaría de amarillo una sola de las opciones). */
  function grupoVacio(el, ambito) {
    if (el.type !== 'radio' || !el.name) return vacio(el);
    var todos = (ambito || document).querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]');
    return !Array.prototype.some.call(todos, function (r) { return r.checked; });
  }
  function caja(el) {
    // Donde se pinta la marca: el propio campo y, en un radio/checkbox, su tarjeta o su etiqueta.
    if (el.type === 'radio' || el.type === 'checkbox') {
      return el.closest('.activity-choice-card, label, .form-check') || el;
    }
    /* ⚠️ UN SELECT2 SE PINTA ÉL SOLO: su `<select>` de verdad está escondido detrás, así que la
       marca hay que ponerla en el recuadro que se VE (`.select2-selection`), o no se ve nada
       (comprobado con el selector de artista del asistente de actividad). */
    if (el.classList && el.classList.contains('select2-hidden-accessible')) {
      var s2 = el.parentElement ? el.parentElement.querySelector('.select2-selection') : null;
      if (s2) return s2;
    }
    return el;
  }

  function limpiaUno(el) {
    caja(el).classList.remove(CLS_FALTA, CLS_MAL);
    if (el.type === 'radio' && el.name) {
      (el.form || document).querySelectorAll('input[type="radio"][name="' + CSS.escape(el.name) + '"]')
        .forEach(function (r) { caja(r).classList.remove(CLS_FALTA, CLS_MAL); });
    }
  }
  function clear(ambito) {
    if (!ambito) return;
    if (ambito.matches && ambito.matches(CAMPOS)) { limpiaUno(ambito); return; }
    ambito.querySelectorAll('.' + CLS_FALTA + ', .' + CLS_MAL).forEach(function (el) {
      el.classList.remove(CLS_FALTA, CLS_MAL);
    });
    var msg = ambito.querySelector ? ambito.querySelector('[data-check-msg]') : null;
    if (msg) msg.remove();
  }

  /* DÓNDE se pinta el aviso: dentro del cuerpo de lo que se está mirando. ⚠️ En un modal, el
     formulario envuelve también la cabecera y el pie, así que puesto «al principio del formulario»
     el aviso salía FUERA del modal, flotando sobre la página. */
  function donde(ambito) {
    if (!ambito || !ambito.querySelector) return ambito;
    return ambito.querySelector('.modal-body') || ambito;
  }

  function aviso(ambito, falta, mal) {
    var previo = ambito.querySelector('[data-check-msg]');
    if (previo) previo.remove();
    var partes = [];
    if (falta.length) {
      partes.push(falta.length === 1 ? 'falta 1 dato obligatorio (en amarillo)'
                                     : ('faltan ' + falta.length + ' datos obligatorios (en amarillo)'));
    }
    if (mal.length) partes.push(mal.length === 1 ? 'hay 1 dato mal (en rojo)'
                                                 : ('hay ' + mal.length + ' datos mal (en rojo)'));
    if (!partes.length) return;
    var caja0 = document.createElement('div');
    caja0.className = 'check-msg alert alert-warning py-2 px-3 mb-2';
    caja0.setAttribute('data-check-msg', '');
    caja0.innerHTML = '<i class="fa fa-triangle-exclamation me-2"></i>' +
      'Antes de seguir, ' + partes.join(' y ') + '.';
    var host = donde(ambito);
    host.insertBefore(caja0, host.firstChild);
  }

  /* La comprobación. `ambito` = el paso, el formulario o cualquier trozo de pantalla. */
  function check(ambito, opciones) {
    opciones = opciones || {};
    if (!ambito) return true;
    clear(ambito);
    var falta = [], mal = [], vistosRadio = {};
    Array.prototype.forEach.call(ambito.querySelectorAll(CAMPOS), function (el) {
      if (!visible(el)) return;
      if (el.type === 'radio' && el.name) {
        if (vistosRadio[el.name]) return;
        vistosRadio[el.name] = true;
      }
      var obligatorio = esObligatorio(el);
      var estaVacio = (el.type === 'radio') ? grupoVacio(el, ambito) : vacio(el);
      if (obligatorio && estaVacio) { caja(el).classList.add(CLS_FALTA); falta.push(el); return; }
      // Marcado a mano por la pantalla (una regla que el navegador no puede saber).
      if (el.getAttribute('data-check-bad') === '1') { caja(el).classList.add(CLS_MAL); mal.push(el); return; }
      if (estaVacio) return;                       // vacío y no obligatorio: no se dice nada
      if (el.checkValidity && !el.checkValidity()) { caja(el).classList.add(CLS_MAL); mal.push(el); }
    });
    if (!falta.length && !mal.length) return true;
    if (opciones.message !== false) aviso(ambito, falta, mal);
    var primero = falta[0] || mal[0];
    if (primero && opciones.focus !== false) {
      try {
        primero.focus({ preventScroll: true });
        (caja(primero).scrollIntoView ? caja(primero) : primero).scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {}
    }
    return false;
  }

  // La marca se quita en cuanto se arregla (y con ella el aviso si ya no queda nada).
  document.addEventListener('input', function (e) { alArreglar(e.target); });
  document.addEventListener('change', function (e) { alArreglar(e.target); });
  function alArreglar(el) {
    if (!el || !el.matches || !el.matches(CAMPOS)) return;
    var marcado = caja(el).classList.contains(CLS_FALTA) || caja(el).classList.contains(CLS_MAL)
      || (el.type === 'radio' && el.name);
    if (!marcado) return;
    if (!vacio(el) && (!el.checkValidity || el.checkValidity()) && el.getAttribute('data-check-bad') !== '1') {
      limpiaUno(el);
      var ambito = el.closest('[data-check-msg-scope]') || el.form || document;
      if (ambito.querySelectorAll && !ambito.querySelectorAll('.' + CLS_FALTA + ', .' + CLS_MAL).length) {
        var msg = ambito.querySelector('[data-check-msg]');
        if (msg) msg.remove();
      }
    }
  }

  /* ⚠️⚠️ HAY QUE QUITARLE AL NAVEGADOR SU PROPIA VALIDACIÓN. Con un campo `required`, el navegador
     PARA el envío **antes** de lanzar el evento `submit` y saca su bocadillo: nuestro aviso no
     llegaba a pintarse nunca (comprobado en el navegador). Así que a cada formulario que gestionamos
     se le pone `novalidate` y la comprobación la hace este motor, que marca en amarillo y en rojo.
     Opt-out: `[data-no-check]` (ese conserva la validación del navegador). */
  function gestiona(form) {
    if (!form || form.nodeName !== 'FORM' || form.__checkReady) return;
    form.__checkReady = true;
    if (form.hasAttribute('data-no-check')) return;
    form.noValidate = true;
    form.setAttribute('novalidate', '');
  }
  function repasaFormularios(raiz) {
    (raiz || document).querySelectorAll('form').forEach(gestiona);
  }
  if (document.readyState !== 'loading') repasaFormularios(document);
  else document.addEventListener('DOMContentLoaded', function () { repasaFormularios(document); });
  // Lo que se pinta después (un modal por AJAX, una zona `data-inline` que se repinta) también.
  try {
    new MutationObserver(function (cambios) {
      for (var i = 0; i < cambios.length; i++) {
        var nodos = cambios[i].addedNodes || [];
        for (var j = 0; j < nodos.length; j++) {
          var n = nodos[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.nodeName === 'FORM') gestiona(n); else repasaFormularios(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* AL ENVIAR: si falta algo o hay algo mal, NO se envía. Va en fase de CAPTURA para que ningún otro
     motor (el envío por AJAX, el loader) llegue a hacer nada con un formulario que no está listo. */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.nodeName !== 'FORM') return;
    if (form.hasAttribute('data-no-check')) return;
    // Un formulario que ya se está validando a mano (un asistente) puede pedir que no se repita.
    if (form.getAttribute('data-check-manual') === '1') return;
    /* El `formnovalidate` del botón que envía se respeta (un «guardar borrador», un «omitir»): si
       no, se bloquearían envíos que a propósito se hacen a medias. */
    if (e.submitter && e.submitter.hasAttribute && e.submitter.hasAttribute('formnovalidate')) return;
    /* ⚠️⚠️ `stopImmediatePropagation`, no `stopPropagation`: los demás motores (el LOADER a pantalla
       completa, el envío por AJAX, la subida con progreso) escuchan en `document` **igual que este**,
       y `stopPropagation` solo impide que el evento SALTE a otro nodo — los del mismo nodo se
       ejecutan igual, así que salía el «Cargando…» de un formulario que no se estaba enviando. */
    if (!check(form)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* Una regla PROPIA de la pantalla que no se cumple: se marca el campo (amarillo si falta, rojo si
     está mal), se dice POR QUÉ arriba de lo que se está mirando y se lleva el foco. Devuelve false,
     para poder escribir `return app33FormCheck.fail(...)`. */
  function fail(ambito, el, motivo, opciones) {
    opciones = opciones || {};
    var rojo = !!opciones.bad;
    if (el) caja(el).classList.add(rojo ? CLS_MAL : CLS_FALTA);
    if (ambito) {
      var previo = ambito.querySelector('[data-check-msg]');
      if (previo) previo.remove();
      var box = document.createElement('div');
      box.className = 'check-msg alert alert-warning py-2 px-3 mb-2';
      box.setAttribute('data-check-msg', '');
      box.textContent = motivo || 'Falta un dato obligatorio.';
      box.insertAdjacentHTML('afterbegin', '<i class="fa fa-triangle-exclamation me-2"></i>');
      var host2 = donde(ambito);
      host2.insertBefore(box, host2.firstChild);
    }
    if (el) {
      try {
        el.focus({ preventScroll: true });
        caja(el).scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {}
    }
    return false;
  }

  window.app33FormCheck = {
    check: check,
    clear: clear,
    fail: fail,
    /* Marcar un campo como MAL (en rojo) por una regla propia de la pantalla. */
    bad: function (el, motivo) {
      if (!el) return;
      el.setAttribute('data-check-bad', '1');
      if (motivo) el.setAttribute('title', motivo);
      caja(el).classList.add(CLS_MAL);
    },
    /* Marcar un campo como QUE FALTA (en amarillo). */
    missing: function (el) { if (el) caja(el).classList.add(CLS_FALTA); },
    ok: function (el) { if (el) { el.removeAttribute('data-check-bad'); limpiaUno(el); } },
  };
})();
