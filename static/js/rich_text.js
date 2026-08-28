/* ============================================================================================
   EDITOR DE TEXTO CON FORMATO (negrita · cursiva · subrayado)
   --------------------------------------------------------------------------------------------
   Lo usa el PITCH (la ficha del lanzamiento y el paso del proyecto): el texto se escribe —o se
   PEGA desde un Word o un Google Docs— con su formato, y ese formato tiene que llegar igual al
   PDF, al correo y a la página pública.
   ⚠️ Lo que viaja al servidor es el HTML del área, que allí se SANEA otra vez
      (`_pitch_clean_html`): aquí se limpia para que se VEA ya limpio al pegar, no como seguridad.
   ⚠️ Es GLOBAL y no hace nada si la página no tiene ningún `[data-rich-editor]`.
   ============================================================================================ */
(function () {
  'use strict';

  var PERMITIDAS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', INS: 'u' };

  function etiquetasDe(el) {
    var fuera = [];
    var tag = PERMITIDAS[el.tagName];
    if (tag) fuera.push(tag);
    // Word y Google Docs pegan la negrita como `style="font-weight:700"`: se traduce, o al pegar
    // desde fuera se perdería justo lo que se quiere conservar.
    var st = el.style || {};
    var peso = (st.fontWeight || '').toString().toLowerCase();
    if ((peso === 'bold' || peso === 'bolder' || parseInt(peso, 10) >= 600) && fuera.indexOf('b') < 0) fuera.push('b');
    if ((st.fontStyle || '').toString().toLowerCase() === 'italic' && fuera.indexOf('i') < 0) fuera.push('i');
    if (((st.textDecoration || '') + ' ' + (st.textDecorationLine || '')).indexOf('underline') >= 0 && fuera.indexOf('u') < 0) fuera.push('u');
    return fuera;
  }

  function limpiarNodos(origen, destino, doc) {
    Array.prototype.forEach.call(origen.childNodes, function (nodo) {
      if (nodo.nodeType === 3) {                     // texto
        destino.appendChild(doc.createTextNode(nodo.nodeValue));
        return;
      }
      if (nodo.nodeType !== 1) return;
      var tag = nodo.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (tag === 'BR') { destino.appendChild(doc.createElement('br')); return; }

      var envoltorios = etiquetasDe(nodo);
      var bloque = (tag === 'P' || tag === 'DIV' || tag === 'LI' || /^H[1-6]$/.test(tag));
      var anfitrion = destino;
      if (bloque) {
        var p = doc.createElement('p');
        destino.appendChild(p);
        anfitrion = p;
      }
      envoltorios.forEach(function (t) {
        var el = doc.createElement(t);
        anfitrion.appendChild(el);
        anfitrion = el;
      });
      limpiarNodos(nodo, anfitrion, doc);
    });
    return destino;
  }

  function limpiarHtml(htmlTexto) {
    var doc = document;
    var origen = doc.createElement('div');
    origen.innerHTML = htmlTexto || '';
    var destino = doc.createElement('div');
    limpiarNodos(origen, destino, doc);
    // Fuera los párrafos que se quedan vacíos al tirar lo que no vale.
    Array.prototype.forEach.call(destino.querySelectorAll('p'), function (p) {
      if (!p.textContent.trim() && !p.querySelector('br')) p.remove();
    });
    return destino.innerHTML;
  }

  function sincroniza(caja) {
    var area = caja.querySelector('[data-rich-area]');
    var input = caja.querySelector('[data-rich-input]');
    if (!area || !input) return;
    var html = (area.innerHTML || '').trim();
    // Un área vacía deja el campo vacío de verdad (y no un `<br>` suelto).
    if (!area.textContent.trim() && !area.querySelector('img')) html = '';
    input.value = html;
  }

  function prepara(caja) {
    if (caja.dataset.richReady === '1') return;
    caja.dataset.richReady = '1';
    var area = caja.querySelector('[data-rich-area]');
    if (!area) return;

    caja.querySelectorAll('[data-rich-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        area.focus();
        try { document.execCommand(btn.getAttribute('data-rich-cmd'), false, null); } catch (e) {}
        sincroniza(caja);
      });
    });

    // Al PEGAR se limpia lo que venga de fuera (se queda solo negrita, cursiva y subrayado).
    area.addEventListener('paste', function (ev) {
      var dt = ev.clipboardData || window.clipboardData;
      if (!dt) return;
      var html = dt.getData('text/html');
      var texto = dt.getData('text/plain');
      ev.preventDefault();
      var limpio = html ? limpiarHtml(html)
                        : (texto || '').replace(/[&<>]/g, function (c) {
                            return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
                          }).replace(/\n/g, '<br>');
      try { document.execCommand('insertHTML', false, limpio); }
      catch (e) { area.innerHTML += limpio; }
      sincroniza(caja);
    });

    ['input', 'blur', 'keyup'].forEach(function (evt) {
      area.addEventListener(evt, function () { sincroniza(caja); });
    });

    // ⚠️ Y al ENVIAR: el formulario puede mandarse por AJAX (`data-inline`), así que el campo
    // oculto tiene que estar al día en ese momento sí o sí.
    var form = caja.closest('form');
    if (form && form.dataset.richBound !== '1') {
      form.dataset.richBound = '1';
      form.addEventListener('submit', function () {
        form.querySelectorAll('[data-rich-editor]').forEach(sincroniza);
      }, true);
    }
    sincroniza(caja);
  }

  function preparaTodo(raiz) {
    (raiz || document).querySelectorAll('[data-rich-editor]').forEach(prepara);
  }

  document.addEventListener('DOMContentLoaded', function () { preparaTodo(document); });
  // Las fichas se repintan en sitio (ajax_inline) y los modales se crean al vuelo.
  var obs = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (!n || n.nodeType !== 1) return;
        if (n.matches && n.matches('[data-rich-editor]')) prepara(n);
        else if (n.querySelectorAll) preparaTodo(n);
      });
    });
  });
  try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}

  window.app33RichSync = function (raiz) {
    (raiz || document).querySelectorAll('[data-rich-editor]').forEach(sincroniza);
  };
})();
