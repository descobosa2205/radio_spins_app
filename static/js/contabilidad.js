/* contabilidad.js — Contabilidad → Pendiente de contabilizar.
 *
 * Tres cosas, todas sobre `#accZone` (la zona que ajax_inline reemplaza sin recargar):
 *   1) SELECCIÓN MÚLTIPLE: la casilla de la cabecera marca todo lo visible y, en cuanto hay algo
 *      marcado, aparece la barra con «Subir a Holded» y «Marcar como contabilizado».
 *   2) POP-UP del documento: la factura o el ticket se ven sin salir de la pantalla (PDF en un marco
 *      con `zoom=page-width`, porque un PDF de página pequeña se veía diminuto; las fotos, como
 *      imagen).
 *   3) MODAL de corregir datos: se rellena con los `data-acc-*` de la fila y apunta al endpoint de
 *      ESE gasto.
 *
 * Todo con delegación en `document`: la zona se sustituye entera al guardar y los elementos son
 * nuevos, así que no vale engancharse a ellos uno por uno.
 */
(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---------------------------------------------------------------- selección
  function checksOf(form) { return $$('[data-acc-check]', form); }

  function refreshBulk(form) {
    if (!form) return;
    var marcados = checksOf(form).filter(function (c) { return c.checked; });
    var barra = $('[data-acc-bulk]', form);
    var cuenta = $('[data-acc-count]', form);
    if (cuenta) cuenta.textContent = String(marcados.length);
    if (barra) barra.classList.toggle('d-none', marcados.length === 0);
    // La casilla de la cabecera refleja el estado real (todo / nada / a medias).
    $$('[data-acc-all]', form).forEach(function (todo) {
      var tabla = todo.closest('table') || form;
      var hijos = $$('[data-acc-check]', tabla);
      var n = hijos.filter(function (c) { return c.checked; }).length;
      todo.checked = n > 0 && n === hijos.length;
      todo.indeterminate = n > 0 && n < hijos.length;
    });
  }

  document.addEventListener('change', function (e) {
    var todo = e.target.closest ? e.target.closest('[data-acc-all]') : null;
    if (todo) {
      var tabla = todo.closest('table');
      $$('[data-acc-check]', tabla || document).forEach(function (c) { c.checked = todo.checked; });
      refreshBulk(todo.closest('form'));
      return;
    }
    if (e.target.matches && e.target.matches('[data-acc-check]')) {
      refreshBulk(e.target.closest('form'));
    }
  });

  document.addEventListener('click', function (e) {
    var limpiar = e.target.closest ? e.target.closest('[data-acc-clear]') : null;
    if (limpiar) {
      var form = limpiar.closest('form');
      checksOf(form).forEach(function (c) { c.checked = false; });
      refreshBulk(form);
    }
  });

  // ---------------------------------------------------------- pop-up del documento
  function esImagen(url) { return /\.(png|jpe?g|gif|webp|heic|bmp)(\?|$)/i.test(url || ''); }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-acc-doc]') : null;
    if (!btn) return;
    e.preventDefault();
    var url = btn.getAttribute('data-acc-doc') || '';
    if (!url) return;
    var modalEl = document.getElementById('accDocModal');
    if (!modalEl || !window.bootstrap) { window.open(url, '_blank', 'noopener'); return; }
    var titulo = $('[data-acc-doc-modal-title]', modalEl);
    if (titulo) titulo.textContent = btn.getAttribute('data-acc-doc-title') || 'Documento';
    var abrir = $('[data-acc-doc-open]', modalEl);
    var bajar = $('[data-acc-doc-download]', modalEl);
    if (abrir) abrir.href = url;
    if (bajar) {
      bajar.href = url;
      bajar.setAttribute('download', btn.getAttribute('data-acc-doc-name') || '');
    }
    var cuerpo = $('[data-acc-doc-body]', modalEl);
    if (cuerpo) {
      if (esImagen(url)) {
        cuerpo.innerHTML = '<div class="text-center p-3"><img src="' + url +
          '" alt="" style="max-width:100%;height:auto;"></div>';
      } else {
        // `zoom=page-width`: sin él, un PDF con la página pequeña se ve diminuto en medio del marco.
        var sep = url.indexOf('#') >= 0 ? '&' : '#';
        cuerpo.innerHTML = '<iframe src="' + url + sep + 'view=FitH&zoom=page-width" ' +
          'style="width:100%;height:75vh;border:0;"></iframe>';
      }
    }
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  });

  // ------------------------------------------------------- modal de corregir datos
  // La fecha llega como dd/mm/aaaa (lo que se ve) y el input `type=date` quiere aaaa-mm-dd.
  function isoFecha(txt) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((txt || '').trim());
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  // Pinta el documento (o dice que no hay) en el hueco de la izquierda del pop-up.
  function pintaDoc(modalEl, url, nombre, etiqueta) {
    var marco = $('[data-acc-edit-frame]', modalEl);
    var lab = $('[data-acc-edit-doclab]', modalEl);
    var abrir = $('[data-acc-edit-open]', modalEl);
    var bajar = $('[data-acc-edit-download]', modalEl);
    if (lab) lab.textContent = etiqueta || 'El documento';
    [abrir, bajar].forEach(function (a) {
      if (!a) return;
      a.classList.toggle('d-none', !url);
      a.href = url || '#';
    });
    if (bajar && nombre) bajar.setAttribute('download', nombre);
    if (!marco) return;
    if (!url) {
      marco.innerHTML = '<div class="d-flex flex-column align-items-center justify-content-center ' +
        'h-100 text-muted gap-2 p-3 text-center"><i class="fa fa-file-circle-xmark fa-2x"></i>' +
        '<div>Este gasto no tiene documento subido.<br>Los datos se pueden corregir igualmente.</div></div>';
      return;
    }
    if (esImagen(url)) {
      marco.innerHTML = '<img src="' + url + '" alt="">';
    } else {
      // `zoom=page-width`: sin él, un PDF con la página pequeña se ve diminuto en medio del marco.
      var sep = url.indexOf('#') >= 0 ? '&' : '#';
      marco.innerHTML = '<iframe src="' + url + sep + 'view=FitH&zoom=page-width"></iframe>';
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-acc-edit]') : null;
    if (!btn || btn.disabled) return;
    e.preventDefault();
    var modalEl = document.getElementById('accEditModal');
    if (!modalEl || !window.bootstrap) return;
    var form = $('[data-acc-edit-form]', modalEl);
    // ⚠️ La URL la manda la PLANTILLA (`data-acc-action`): así el mismo pop-up sirve para un gasto y
    // para la factura de una liquidación de royalties, sin que el JS sepa de rutas.
    if (form) form.setAttribute('action', btn.getAttribute('data-acc-action') || '#');
    var sub = $('[data-acc-edit-sub]', modalEl);
    if (sub) sub.textContent = btn.getAttribute('data-acc-edit-sub') || '';
    var titulo = $('.modal-title', modalEl);
    if (titulo) {
      titulo.textContent = 'Editar los datos de la factura';
      var quien = btn.getAttribute('data-acc-edit-title') || '';
      if (quien) titulo.textContent += ' · ' + quien;
    }
    pintaDoc(modalEl, btn.getAttribute('data-acc-edit-doc') || '',
             btn.getAttribute('data-acc-edit-doc-name') || '',
             btn.getAttribute('data-acc-edit-doclab') || '');
    var full = $('[data-acc-edit-full]', modalEl);
    if (full) {
      var href = btn.getAttribute('data-acc-full') || '';
      full.classList.toggle('d-none', !href);
      full.href = href || '#';
    }
    var mapa = {
      concept: btn.getAttribute('data-acc-concept') || '',
      number: btn.getAttribute('data-acc-number') || '',
      date: isoFecha(btn.getAttribute('data-acc-date')),
      net: btn.getAttribute('data-acc-net') || '',
      vat: btn.getAttribute('data-acc-vat') || '',
      retention: btn.getAttribute('data-acc-retention') || '',
      total: btn.getAttribute('data-acc-total') || ''
    };
    Object.keys(mapa).forEach(function (k) {
      var input = $('[data-acc-f="' + k + '"]', modalEl);
      if (input) input.value = mapa[k];
    });
    window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  });

  // La zona se sustituye al guardar: hay que recalcular la barra de selección.
  document.addEventListener('inline:updated', function () { refreshBulk($('#accForm')); });
  document.addEventListener('DOMContentLoaded', function () { refreshBulk($('#accForm')); });
  refreshBulk($('#accForm'));
})();
