/* Importes con separador de miles EN VIVO (es-ES: 1.234.567,89) — GLOBAL.
 *
 * Qué formatea:
 *  - cualquier <input data-money>, y
 *  - los inputs (texto o number) dentro de un .input-group cuyo .input-group-text lleva «€».
 *  - opt-out: data-no-money-format en el input o en cualquier ancestro.
 * Los type="number" se CONVIERTEN a text + inputmode=decimal (el navegador no admite puntos).
 *
 * Al enviarse CUALQUIER formulario (evento `formdata`, que salta también al construir
 * FormData(form) en los envíos por fetch/XHR), los campos formateados viajan CANÓNICOS
 * («1234567.89»): ningún parseo del servidor cambia. Los decimales se escriben con COMA.
 *
 * Para el JS de cliente que lee estos campos: window.MoneyInput.num(valor) — parser
 * tolerante (formateado o sin formatear; devuelve NaN si está vacío, como parseFloat).
 */
(function () {
  'use strict';

  function isMoney(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t !== 'text' && t !== 'number') return false;
    if (el.hasAttribute('data-no-money-format')) return false;
    if (el.closest && el.closest('[data-no-money-format]')) return false;
    if (el.hasAttribute('data-money')) return true;
    var g = el.closest ? el.closest('.input-group') : null;
    if (!g) return false;
    var spans = g.querySelectorAll('.input-group-text');
    for (var i = 0; i < spans.length; i++) {
      if ((spans[i].textContent || '').indexOf('€') !== -1) return true;
    }
    return false;
  }

  // «1.234,56» / «1.234» / «1234.56» / «1234» → «1234.56» (canónico para el servidor).
  function toCanonical(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    v = v.replace(/[€$£\s]/g, '');
    var neg = v.charAt(0) === '-';
    if (neg) v = v.slice(1);
    if (v.indexOf(',') !== -1) {
      v = v.replace(/\./g, '').replace(/,/, '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
      v = v.replace(/\./g, '');   // solo puntos con grupos de 3 = separadores de miles
    }
    v = v.replace(/[^\d.]/g, '');
    return v ? (neg ? '-' : '') + v : '';
  }

  function num(v) {
    var c = toCanonical(v);
    if (c === '' || c === '-') return NaN;
    return parseFloat(c);
  }

  // Canónico/lo que sea → presentación es-ES con puntos de miles y coma decimal.
  function display(v) {
    var c = toCanonical(v);
    if (c === '') return '';
    var neg = c.charAt(0) === '-';
    if (neg) c = c.slice(1);
    var p = c.split('.');
    var i = (p[0] || '').replace(/^0+(?=\d)/, '') || '0';
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var d = p.length > 1 && p[1] !== '' ? ',' + p[1].slice(0, 2) : '';
    return (neg ? '-' : '') + i + d;
  }

  // Formateo EN VIVO mientras se teclea, conservando la posición del cursor
  // (se cuenta cuántos caracteres significativos —dígitos/coma— hay a su izquierda).
  function formatLive(el) {
    var raw = el.value;
    var caret = el.selectionStart == null ? raw.length : el.selectionStart;
    var left = 0;
    for (var i = 0; i < caret && i < raw.length; i++) {
      if (/[\d,\-]/.test(raw.charAt(i))) left++;
    }
    var neg = /^\s*-/.test(raw);
    var clean = raw.replace(/[^\d,]/g, '');
    var fc = clean.indexOf(',');
    if (fc !== -1) clean = clean.slice(0, fc + 1) + clean.slice(fc + 1).replace(/,/g, '');
    var parts = clean.split(',');
    var intp = (parts[0] || '').replace(/^0+(?=\d)/, '');
    var fmt = intp.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var out = (neg ? '-' : '') + fmt + (parts.length > 1 ? ',' + (parts[1] || '').slice(0, 2) : '');
    if (out === el.value) return;
    el.value = out;
    var pos = 0, count = 0;
    while (pos < out.length && count < left) {
      if (/[\d,\-]/.test(out.charAt(pos))) count++;
      pos++;
    }
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }

  function upgrade(el) {
    if (el.__moneyFmt) return;
    el.__moneyFmt = true;
    if ((el.getAttribute('type') || '').toLowerCase() === 'number') {
      try { el.type = 'text'; } catch (_) {}
    }
    el.setAttribute('inputmode', 'decimal');
    if (el.value) el.value = display(el.value);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    var inputs = root.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      if (isMoney(inputs[i])) upgrade(inputs[i]);
    }
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && isMoney(el)) { upgrade(el); formatLive(el); }
  });
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && isMoney(el)) upgrade(el);
  });

  // Envío: valores canónicos. Con names repetidos (arrays tipo gasto_amount[]) se
  // reconstruye la lista completa en orden de DOM (set() machacaría las demás entradas).
  document.addEventListener('formdata', function (e) {
    var form = e.target;
    if (!form || !form.querySelectorAll) return;
    var byName = {};
    var inputs = form.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.__moneyFmt && el.name && !el.disabled) {
        (byName[el.name] = byName[el.name] || []).push(el);
      }
    }
    Object.keys(byName).forEach(function (nm) {
      e.formData.delete(nm);
      byName[nm].forEach(function (el) { e.formData.append(nm, toCanonical(el.value)); });
    });
  });

  // Filas añadidas por JS (gastos, cachés…): se formatea lo nuevo que llegue con valor.
  if (window.MutationObserver) {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) {
          if (added[j] && added[j].nodeType === 1) scan(added[j]);
        }
      }
    });
    var boot = function () { scan(document); mo.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } else {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(document); });
    else scan(document);
  }

  window.MoneyInput = { num: num, toCanonical: toCanonical, display: display, scan: scan };
})();
