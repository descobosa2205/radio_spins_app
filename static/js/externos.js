/* PORTAL DE EXTERNOS · lo poco que necesita el navegador aquí.

   ⚠️⚠️ EL NÚMERO SE PONE SOLO, sin copiar ni pegar. Tres cosas, y hacen falta las tres:
     1. el campo lleva `autocomplete="one-time-code"` (lo pone la plantilla): es lo que miran iPhone
        y Android para ofrecerlo encima del teclado en cuanto llega el SMS o el correo;
     2. el SMS termina con «@dominio #codigo» (lo compone el servidor, `_ext_code_sms_text`), que es
        el formato WebOTP y lo que permite el autorrelleno SIN que el usuario toque nada;
     3. en Chrome/Android se pide además con la API WebOTP (`navigator.credentials.get`), que lo
        rellena y envía el formulario él solo.
   Donde nada de esto exista, se escribe a mano y ya: nunca se queda bloqueado. */
(function () {
  'use strict';

  function initCodigo() {
    var campo = document.querySelector('[data-ext-code]');
    var form = document.querySelector('[data-ext-code-form]');
    if (!campo || !form) return;

    // Solo dígitos, y al completarlo se envía solo (es lo que se espera de un código).
    campo.addEventListener('input', function () {
      var limpio = (campo.value || '').replace(/\D+/g, '').slice(0, 6);
      if (limpio !== campo.value) campo.value = limpio;
      if (limpio.length === 6) enviar();
    });

    var enviado = false;
    function enviar() {
      if (enviado) return;
      enviado = true;
      try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch (e) { form.submit(); }
    }

    // WebOTP (Android/Chrome): el navegador lee el SMS y lo pone solo.
    if ('OTPCredential' in window && window.isSecureContext) {
      var ac = new AbortController();
      // Si se envía el formulario por otro camino, se deja de escuchar.
      form.addEventListener('submit', function () { try { ac.abort(); } catch (e) {} });
      try {
        navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ac.signal })
          .then(function (otp) {
            if (!otp || !otp.code) return;
            campo.value = String(otp.code).replace(/\D+/g, '').slice(0, 6);
            enviar();
          })
          .catch(function () { /* lo cancela el usuario o no llega: se escribe a mano */ });
      } catch (e) { /* navegador que no lo soporta */ }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodigo);
  } else {
    initCodigo();
  }
})();
