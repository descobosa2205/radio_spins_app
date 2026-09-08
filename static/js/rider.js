/* EL EDITOR DE UN RIDER · las líneas de una sección y compartirlo.
 *
 * ⚠️ Las líneas se guardan TODAS de una vez y **cada fila lleva DENTRO sus campos**, así que el
 * orden del DOM es el orden que se guarda: al añadir o quitar una no hay nada que recalcular.
 * ⚠️ Todo va por DELEGACIÓN en `document`: la pantalla se repinta con cada guardado (POST +
 * redirect) y así da igual cuándo se cargue este fichero.
 */
(function () {
  'use strict';

  function cfg() {
    try {
      var el = document.querySelector('[data-rider-cfg]');
      return el ? JSON.parse(el.textContent || '{}') : {};
    } catch (e) { return {}; }
  }

  /* Una línea nueva, con las mismas casillas que las que ya están (las pinta el servidor). */
  function nuevaFila(providers) {
    var tr = document.createElement('tr');
    tr.setAttribute('data-rd-row', '');
    var ops = (providers || []).map(function (p) {
      return '<option value="' + p.key + '">' + p.label + '</option>';
    }).join('');
    tr.innerHTML =
      '<input type="hidden" name="item_id" value="">' +
      '<td><input class="form-control form-control-sm" name="item_qty"></td>' +
      '<td><input class="form-control form-control-sm" name="item_concept" placeholder="Qué hace falta"></td>' +
      '<td><select class="form-select form-select-sm" name="item_provider">' + ops + '</select></td>' +
      '<td><input class="form-control form-control-sm" name="item_note"></td>' +
      '<td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-rd-del' +
      ' title="Quitar la línea"><i class="fa fa-trash"></i></button></td>';
    return tr;
  }

  document.addEventListener('click', function (ev) {
    var add = ev.target.closest && ev.target.closest('[data-rd-add]');
    if (add) {
      var cuerpo = document.querySelector('[data-rd-rows]');
      if (!cuerpo) return;
      var fila = nuevaFila(cfg().providers || []);
      cuerpo.appendChild(fila);
      var primero = fila.querySelector('input[name="item_concept"]');
      if (primero) primero.focus();
      // El aviso de «todavía no tiene líneas» deja de tener sentido en cuanto se añade una.
      var vacio = cuerpo.closest('form') && cuerpo.closest('form').querySelector('.ficha-empty');
      if (vacio) vacio.remove();
      return;
    }
    var del = ev.target.closest && ev.target.closest('[data-rd-del]');
    if (del) {
      var tr = del.closest('[data-rd-row]');
      if (tr) tr.remove();
      return;
    }
    /* COMPARTIR: lo que se manda es SIEMPRE la página pública (nunca el PDF ni el archivo), con
       las funciones GLOBALES de la casa (`shareByWhatsapp`…). */
    var sh = ev.target.closest && ev.target.closest('[data-rd-share]');
    if (sh) {
      var c = cfg(), url = c.url || '', titulo = c.title || 'Rider';
      if (!url) { alert('Todavía no hay enlace que compartir.'); return; }
      var modo = sh.getAttribute('data-rd-share');
      if (modo === 'wa' && window.shareByWhatsapp) window.shareByWhatsapp(titulo, url);
      else if (modo === 'mail' && window.shareByMail) window.shareByMail(titulo, url);
      else if (modo === 'sms' && window.shareBySms) window.shareBySms(titulo, url);
      else if (modo === 'copy' && window.copyShareLink) window.copyShareLink(url);
    }
  });
})();
