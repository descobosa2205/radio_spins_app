/* notify_channel.js — CÓMO SE AVISA A CADA UNO (correo o SMS), global.
 *
 * Cablea cualquier `[data-notify-picker]` (el parcial `_notify_channel_picker.html`): al pinchar el
 * icono de un destinatario se marca su pastilla, se cambia el dato que se enseña debajo (su correo o
 * su teléfono) y se rehace el resumen «Por correo: … · Por SMS: …».
 *
 * ⚠️ Por DELEGACIÓN: estas listas se repintan por AJAX (la vista previa de un aviso), así que un
 * listener pegado a cada nodo se quedaría muerto. No hace nada si la página no tiene ningún selector.
 */
(function () {
  'use strict';

  function pintaFila(radio) {
    var fila = radio.closest('.notify-row');
    if (!fila) return;
    fila.querySelectorAll('.notify-pref__opt').forEach(function (o) {
      o.classList.toggle('is-on', o.contains(radio));
    });
    // Debajo del nombre se enseña el dato por el que le va a llegar, no los dos.
    var dest = fila.querySelector('[data-notify-dest]');
    if (dest) {
      var v = (radio.value || '').toUpperCase();
      dest.textContent = (v === 'SMS')
        ? (radio.getAttribute('data-notify-phone') || '')
        : (radio.getAttribute('data-notify-email') || '');
    }
  }

  function resumen(caja) {
    var porCorreo = [], porSms = [];
    caja.querySelectorAll('.notify-row').forEach(function (fila) {
      var check = fila.querySelector('[data-notify-on]');
      if (check && !check.checked) return;               // a quien se ha quitado no se le cuenta
      var nombre = (fila.querySelector('.notify-row__name') || {}).textContent || '';
      nombre = nombre.trim();
      var elegido = fila.querySelector('[data-notify-channel]:checked')
                 || fila.querySelector('input[type="hidden"][name^="canal_"]');
      var canal = ((elegido && elegido.value) || 'EMAIL').toUpperCase();
      (canal === 'SMS' ? porSms : porCorreo).push(nombre);
    });
    var trozos = [];
    if (porCorreo.length) trozos.push('Por correo: ' + porCorreo.join(', '));
    if (porSms.length) trozos.push('Por SMS: ' + porSms.join(', '));
    var salida = caja.querySelector('[data-notify-summary]');
    if (salida) salida.textContent = trozos.join(' · ');
  }

  function todos() {
    document.querySelectorAll('[data-notify-picker]').forEach(resumen);
  }

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t) return;
    if (t.matches && t.matches('[data-notify-channel]')) {
      pintaFila(t);
      var caja = t.closest('[data-notify-picker]');
      if (caja) resumen(caja);
      return;
    }
    if (t.matches && t.matches('[data-notify-on]')) {
      var c = t.closest('[data-notify-picker]');
      if (c) resumen(c);
    }
  });

  // La lista puede llegar por AJAX (la vista previa de un aviso se repinta).
  document.addEventListener('inline:updated', todos);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', todos);
  } else {
    todos();
  }
  window.app33NotifySummary = todos;      // por si una pantalla repinta la lista por su cuenta
})();
