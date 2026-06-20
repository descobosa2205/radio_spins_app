/* modal_stack.js — Abrir un modal (p. ej. "Añadir tercero") DESDE DENTRO de otro y que el de
   debajo SIGA ABIERTO (superpuesto), sin salir del punto donde estabas. Al crear la entidad queda
   seleccionada y se sigue ahí.

   ⚠️ IMPORTANTE: este script debe cargarse ANTES que `bootstrap.bundle.min.js`. Motivo: Bootstrap
   registra el handler del data-api de modales en fase de CAPTURA (en su fuente,
   `element.addEventListener(typeEvent, fn, isDelegated)` con isDelegated=true). Ese handler cierra a
   propósito el modal abierto al pulsar un disparador `data-bs-toggle="modal"`:
       const alreadyOpen = SelectorEngine.findOne('.modal.show');
       if (alreadyOpen) { Modal.getInstance(alreadyOpen).hide(); }
   Como los listeners de captura se ejecutan por orden de registro, para neutralizar ese cierre
   nuestro listener de captura tiene que registrarse ANTES (cargar este fichero antes que Bootstrap).

   Qué corrige (verificado en Bootstrap 5.3.3):
   1) AUTO-CIERRE: durante el clic en un disparador, dejamos `hide` de los modales abiertos como
      no-op (captura, antes que Bootstrap), así el de debajo NO se cierra. No paramos la propagación,
      de modo que los listeners propios del botón (p. ej. el que recuerda en qué campo dejar la
      entidad creada) siguen ejecutándose. Los modales abiertos por JS (alta rápida `quick_create.js`)
      no usan el data-api, así que no se autocierran.
   2) APILADO VISUAL: al mostrarse un modal sobre otro, le subimos el z-index (y el de su backdrop).
   3) BLOQUEO DE SCROLL: al cerrar el de arriba, Bootstrap quita `modal-open` del <body> aunque quede
      otro abierto; lo restauramos.

   Es global y automático; los modales sueltos (sin otro abierto debajo) no cambian.
*/
(function () {
  'use strict';
  var BASE_Z = 1055; // --bs-modal-zindex por defecto (.modal); backdrop = 1050
  var STEP = 20;

  // (1) Evitar que Bootstrap cierre el modal de debajo al pulsar un disparador de modal.
  // Captura + registrado antes que Bootstrap => corre antes que su handler de captura.
  document.addEventListener('click', function (e) {
    if (!window.bootstrap || !window.bootstrap.Modal) return;
    var trigger = e.target.closest('[data-bs-toggle="modal"]');
    if (!trigger) return;
    var open = document.querySelectorAll('.modal.show');
    if (!open.length) return; // no hay otro abierto: comportamiento normal de Bootstrap

    var sel = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href') || '';
    var targetModal = null;
    try { targetModal = sel && sel !== '#' ? document.querySelector(sel) : null; } catch (err) { targetModal = null; }

    open.forEach(function (m) {
      if (m === targetModal) return; // no neutralizar el propio destino
      var inst = bootstrap.Modal.getInstance(m);
      if (!inst || inst.__stackNoHide) return;
      inst.__stackNoHide = true;
      var realHide = inst.hide;
      inst.hide = function () {};               // no-op SOLO durante este clic
      setTimeout(function () { inst.hide = realHide; delete inst.__stackNoHide; }, 0);
    });
  }, true);

  // (2) Apilado visual: el modal que se abre sobre otro va por encima (z-index + backdrop).
  document.addEventListener('show.bs.modal', function (e) {
    var alreadyOpen = document.querySelectorAll('.modal.show').length; // sin contar el que se abre
    if (alreadyOpen < 1) return; // modal suelto: no tocar
    var z = BASE_Z + alreadyOpen * STEP;
    e.target.style.zIndex = String(z);
    requestAnimationFrame(function () {
      var pending = document.querySelectorAll('.modal-backdrop:not([data-stacked])');
      var last = pending[pending.length - 1];
      if (last) { last.setAttribute('data-stacked', '1'); last.style.zIndex = String(z - 1); }
    });
  });

  // (3) Al cerrar un modal apilado, conservar el bloqueo de scroll si queda alguno abierto.
  document.addEventListener('hidden.bs.modal', function (e) {
    e.target.style.zIndex = '';
    if (document.querySelectorAll('.modal.show').length > 0) {
      document.body.classList.add('modal-open');
    }
  });
})();
