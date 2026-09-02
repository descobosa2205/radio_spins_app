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
    if (g) {
      var spans = g.querySelectorAll('.input-group-text');
      for (var i = 0; i < spans.length; i++) {
        if ((spans[i].textContent || '').indexOf('€') !== -1) return true;
      }
    }
    return pareceImporte(el);
  }

  /* ⚠️ UN IMPORTE SE FORMATEA AUNQUE NADIE LO HAYA MARCADO. Marcar campo a campo con `data-money`
     no escala —hay cientos de formularios— y se quedaban cachés y presupuestos escribiéndose «a
     pelo». Aquí se reconoce por el NOMBRE del campo, que en esta app es muy regular.
     Se excluye lo que NO es dinero aunque lo parezca: porcentajes, cantidades, años, códigos… */
  var IMPORTE_RE = /(amount|importe|cache|caché|fee|precio|price|total|coste|cost|budget|presupuesto|cuota|neto|bruto|gross|_net$|_eur|euros|salario|deposito|dep[oó]sito|adelanto|anticipo|revenue|ingreso|recaudac)/i;
  /* ⚠️ Lo que NO es dinero aunque su nombre lo parezca. Ojo con los campos de TEXTO que llevan la
     palabra dentro (`cache_concept[]` es el concepto del caché, no un importe): formatearlos
     destrozaría lo que se escribe. */
  var NO_IMPORTE_RE = new RegExp([
    'pct', 'percent', 'porcentaje', '_%',
    'qty', 'quantity', 'cantidad', 'count', 'num', 'numero',
    // ⚠️ `n_` SOLO como segmento (`n_personas`): suelto se comía «cache_mi(n_r)evenue».
    '(^|_)n_',
    'year', 'anio', 'año', '_id$', 'id$', 'code', 'codigo',
    'iban', 'bic', 'nif', 'cif', 'dni', 'tel', 'phone', 'zip', 'postal',
    'capacity', 'aforo', 'ticket',
    // campos de TEXTO o de elección que llevan una palabra de dinero dentro
    'concept', 'concepto', 'type', 'tipo', 'kind', 'label', 'name', 'nombre',
    'note', 'nota', 'desc', 'text', 'texto', 'basis', 'base', 'mode', 'modo',
    'option', 'opcion', 'url', 'email', 'date', 'fecha',
  ].join('|'), 'i');

  function pareceImporte(el) {
    var nombre = (el.getAttribute('name') || el.id || '');
    if (!nombre) return false;
    if (NO_IMPORTE_RE.test(nombre)) return false;
    if (!IMPORTE_RE.test(nombre)) return false;
    // Un `type="number"` con `step` de enteros no es un importe (son unidades).
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    var step = (el.getAttribute('step') || '').trim();
    if (t === 'number' && step && step.indexOf('.') < 0 && step !== 'any') return false;
    return true;
  }

  /* «1.234,56» / «1.234» / «1234.56» / «1234» → «1234.56» (canónico para el servidor).

     ⚠️⚠️ AQUÍ EL PUNTO ES DE MILES, NO DECIMAL (modelo de euros, no el de Estados Unidos). Un
     «40.000» son CUARENTA MIL. Bug real con captura: el asistente leía el caché con `parseFloat` y
     un caché de 40.000 € salía como 4,00 € —el `4.0000` a medio formatear que deja el teclear—, y
     el servidor guardaba 40 € de un «40.000». La regla, que es la MISMA en `_parse_money_decimal`
     (app.py) y en `invoice_read.py`:
       · hay COMA y punto → manda el ÚLTIMO: «1.234,56» es de aquí, «1,234.56» es de allí;
       · solo COMA → decimal (varias comas: son de miles);
       · solo PUNTO → manda CUÁNTOS DÍGITOS lo siguen: 1 o 2 son DECIMALES (así se sigue leyendo lo
         canónico que viaja al servidor, «1234.56»), y 3 o más —o ninguno— son MILES («40.000» y el
         «4.0000» de un importe a medio escribir). */
  function toCanonical(v) {
    v = String(v == null ? '' : v).trim();
    if (!v) return '';
    v = v.replace(/[€$£\s]/g, '');
    var neg = v.charAt(0) === '-';
    if (neg) v = v.slice(1);
    v = v.replace(/[^\d.,]/g, '');
    var coma = v.lastIndexOf(','), punto = v.lastIndexOf('.');
    if (coma !== -1 && punto !== -1) {
      if (coma > punto) v = v.replace(/\./g, '').replace(/,/g, '.');
      else v = v.replace(/,/g, '');
    } else if (coma !== -1) {
      v = (v.split(',').length > 2) ? v.replace(/,/g, '') : v.replace(/,/g, '.');
    } else if (punto !== -1) {
      var t = v.split('.');
      var dec = t[t.length - 1].length;
      if (t.length > 2 || dec < 1 || dec > 2) v = t.join('');
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

  /* ⚠️⚠️ EN FASE DE CAPTURA, A PROPÓSITO: el formateo tiene que pasar ANTES de que lo vea cualquier
     otro manejador de la app, porque casi todos leen `el.value` para sumar. Escuchando en burbujeo,
     un contenedor más cercano (el paso del caché del asistente) se ejecutaba PRIMERO y leía el valor
     a MEDIO ESCRIBIR («4.0000», que es lo que hay en el campo justo antes de reformatearlo): de ahí
     el «Caché fijo: 4,00 €» con 40.000 escrito (bug real, con captura). */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.tagName === 'INPUT' && isMoney(el)) { upgrade(el); formatLive(el); }
  }, true);
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
  // `numv` GLOBAL: el parser tolerante que usa el JS de las pantallas con importes. Antes cada
  // pantalla se lo definía por su cuenta y en algunas (la pestaña Gastos de una simulación) NO
  // existía: cualquier lectura de un importe petaba con ReferenceError y el guardado moría en
  // silencio. Definirlo aquí lo garantiza en TODA la app.
  if (typeof window.numv !== 'function') window.numv = num;
})();
