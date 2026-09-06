/* VOLVER ATRÁS NO DEVUELVE UN FORMULARIO YA ENVIADO (ni un pop-up a medias).
 *
 * Se termina de crear una actividad con el asistente, la app lleva a su ficha y se vuelve con
 * «Volver» (que es `history.back()`): el navegador puede RESTAURAR la página anterior tal cual
 * estaba (bfcache) —el asistente ABIERTO, en su último paso y con los datos de lo que ya está
 * creado—, y «Atrás» va retrocediendo paso a paso por un formulario que ya se envió. Da igual el
 * formulario: pasa con cualquier pop-up de alta.
 *
 * Regla: si la página vuelve del bfcache (`pageshow` con `persisted`) y aquí se ENVIÓ un formulario
 * o hay un pop-up ABIERTO, se recarga: así lo que se ve es lo de ahora (con lo recién creado en
 * los listados) y el asistente empieza de cero. Una página restaurada sin nada de eso (una ficha
 * que se estaba leyendo, un editor con cambios sin guardar) se deja como estaba.
 *
 * ⚠️ El envío se apunta SOLO si no se canceló (`defaultPrevented` mirado un tic después): el envío
 *    que `form_check.js` para por un campo en rojo, o el que va por AJAX, no navegan y no cuentan.
 * ⚠️ La otra vía de «datos viejos» —sin bfcache, el navegador repone por su cuenta lo tecleado en
 *    los campos al volver atrás— se corta con `autocomplete="off"` en el <form> de cada asistente
 *    de alta (es lo que dice la especificación para no restaurar el estado de un formulario).
 */
(function () {
  'use strict';
  var enviado = false;
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.nodeName !== 'FORM') return;
    setTimeout(function () { if (!ev.defaultPrevented) enviado = true; }, 0);
  });
  window.addEventListener('pageshow', function (ev) {
    if (!ev || !ev.persisted) return;
    if (enviado || document.querySelector('.modal.show')) {
      try { window.location.reload(); } catch (e) {}
    }
  });
})();
