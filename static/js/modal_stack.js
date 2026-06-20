/* modal_stack.js — Modales apilados (uno abierto desde DENTRO de otro).

   Problema: Bootstrap 5 no gestiona bien el apilado. Al abrir un 2º modal sobre otro, ambos y
   sus backdrops quedan al mismo z-index, de modo que el de arriba no tapa bien al de abajo, y al
   CERRAR el de arriba Bootstrap quita `modal-open` del <body> (pierde el bloqueo de scroll),
   dejando el de abajo roto y dando la sensación de que "se cerró el formulario en el que estabas".

   Esto rompía el alta rápida de entidades (recinto, tercero, ticketera, editorial, artista…)
   cuando se abre desde otro formulario/modal: al crear, debe quedarse SELECCIONADA y el usuario
   debe SEGUIR donde estaba, sin salir.

   Solución (global, para toda la app): al abrir un modal que se superpone a otro ya abierto, se le
   sube el z-index (a él y a su backdrop) por encima del de debajo; y al cerrarlo, si aún queda
   algún modal abierto, se restaura el bloqueo de scroll del <body>. Los modales sueltos (el caso
   normal, sin apilar) no cambian de comportamiento.
*/
(function () {
  'use strict';
  if (!window.bootstrap) return;

  var BASE_Z = 1055; // --bs-modal-zindex por defecto en Bootstrap 5 (.modal); backdrop = 1050
  var STEP = 20;

  document.addEventListener('show.bs.modal', function (e) {
    var modal = e.target;
    // En 'show.bs.modal' el modal que se abre AÚN no tiene la clase .show, así que esto cuenta
    // solo los que ya estaban abiertos. Si no hay ninguno, es un modal suelto: no tocar nada.
    var alreadyOpen = document.querySelectorAll('.modal.show').length;
    if (alreadyOpen < 1) return;

    var z = BASE_Z + alreadyOpen * STEP;
    modal.style.zIndex = String(z);

    // El backdrop de este modal lo inserta Bootstrap justo después de este evento: en el siguiente
    // frame lo subimos por encima del modal de debajo (z-1) y por debajo de este modal (z).
    requestAnimationFrame(function () {
      var pending = document.querySelectorAll('.modal-backdrop:not([data-stacked])');
      var last = pending[pending.length - 1];
      if (last) {
        last.setAttribute('data-stacked', '1');
        last.style.zIndex = String(z - 1);
      }
    });
  });

  document.addEventListener('hidden.bs.modal', function (e) {
    // Limpiar el z-index propio para que un reuso futuro lo recalcule.
    e.target.style.zIndex = '';
    // Bootstrap quita `modal-open` del <body> al cerrar ESTE modal aunque queden otros abiertos
    // debajo: si es así, lo restauramos para conservar el bloqueo de scroll y dejar el de abajo
    // plenamente operativo (no "cerrado").
    if (document.querySelectorAll('.modal.show').length > 0) {
      document.body.classList.add('modal-open');
    }
  });
})();
