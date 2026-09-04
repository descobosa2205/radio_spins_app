/* ══════════════════════════════════════════════════════════════════════════════════════════════
   UNA ACCIÓN DE MARKETING · el formulario

   · Lo que se enseña depende del TIPO: el MEDIO solo en las acciones que se hacen en uno (radio,
     TV, prensa, digital, plataformas) y el bloque de publicidad EXTERIOR solo si lo es.
   · El MEDIO y el PROVEEDOR se ven como lo elegido (con su logo) y se cambian con un botón; el «+»
     de al lado crea uno nuevo al vuelo.
   · Las SOCIEDADES que se ofrecen son las del proveedor elegido.
   · Las OLEADAS se añaden con el «+», cada una con su estado.
   · El IMPORTE se escribe UNA vez y se dice si lleva el IVA o si hay que sumárselo (igual que en un
     gasto de bolsa). El desglose que se ENSEÑA es una ayuda: el que vale lo hace el SERVIDOR.

   ⚠️⚠️ TODO POR DELEGACIÓN en `document`: este formulario se pinta en un modal y en la ficha, cuyas
   zonas se reemplazan por AJAX; con listeners pegados a los nodos que hay al cargar, los del HTML
   nuevo se quedan MUERTOS (regla de la casa).
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var IVA = 21;
  function caja(el) { return el && el.closest ? el.closest('[data-marketing-form]') : null; }
  function q(c, sel) { return c ? c.querySelector(sel) : null; }
  function tipo(c) {
    var r = c ? c.querySelector('[data-ma-type]:checked') : null;
    return r ? r.value : '';
  }

  /* Qué bloques se ven, según el tipo de acción. Los tipos que van contra un medio los emite el
     servidor en el propio HTML (`data-ma-media` nace oculto o no), y aquí se repiten en una lista
     corta: si un día cambian, se cambian en `MARKETING_MEDIA_ACTION_TYPES`. */
  var CON_MEDIO = ['RADIO', 'TV', 'PRENSA', 'DIGITAL', 'PLATAFORMAS'];

  function aplica(c) {
    if (!c) return;
    var t = tipo(c);
    var ext = q(c, '[data-ma-exterior]');
    if (ext) {
      ext.classList.toggle('d-none', t !== 'EXTERIOR');
      // Un campo oculto se envía igual: se deshabilita.
      ext.querySelectorAll('input').forEach(function (i) { i.disabled = (t !== 'EXTERIOR'); });
    }
    var med = q(c, '[data-ma-media]');
    if (med) {
      var hay = CON_MEDIO.indexOf(t) >= 0;
      med.classList.toggle('d-none', !hay);
      var sel = q(c, '[data-ma-media-select]');
      if (sel) sel.disabled = !hay;
    }
    var et = q(c, '[data-ma-type-label]');
    var r = c.querySelector('[data-ma-type]:checked');
    if (et && r) et.textContent = r.getAttribute('data-ma-label') || r.value;
  }

  document.addEventListener('change', function (ev) {
    if (ev.target.matches && ev.target.matches('[data-ma-type]')) aplica(caja(ev.target));
  });

  /* El MEDIO: «Cambiar» enseña el selector. */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ma-media-change]');
    if (!b) return;
    ev.preventDefault();
    var c = caja(b);
    var picked = q(c, '[data-ma-media-picked]'), pick = q(c, '[data-ma-media-pick]');
    if (picked) picked.classList.add('d-none');
    if (pick) pick.classList.remove('d-none');
  });

  /* Al elegir un medio se pinta con su logo; al elegir un proveedor, sus sociedades. */
  document.addEventListener('change', function (ev) {
    var sel = ev.target;
    if (sel.matches && sel.matches('[data-ma-media-select]')) {
      var c = caja(sel), op = sel.options[sel.selectedIndex];
      var picked = q(c, '[data-ma-media-picked]');
      if (sel.value && op) {
        var img = q(c, '[data-ma-media-photo]');
        if (img) img.src = op.getAttribute('data-photo') || img.src;
        var n = q(c, '[data-ma-media-name]');
        if (n) n.textContent = (op.textContent || '').trim();
        if (picked) picked.classList.remove('d-none');
        var pick = q(c, '[data-ma-media-pick]');
        if (pick) pick.classList.add('d-none');
      } else if (picked) { picked.classList.add('d-none'); }
    }
    if (sel.matches && sel.matches('[data-ma-provider]')) {
      var cc = caja(sel), zona = q(cc, '[data-ma-companies]'), cs = q(cc, '[data-ma-company]');
      if (!cs) return;
      var pid = sel.value || '';
      var n = 0;
      Array.prototype.forEach.call(cs.options, function (o) {
        if (!o.value) return;
        var suya = (o.getAttribute('data-provider') || '') === pid;
        o.hidden = !suya;
        o.disabled = !suya;
        if (suya) n++;
      });
      if (!Array.prototype.some.call(cs.options, function (o) { return o.selected && !o.hidden; })) cs.value = '';
      if (zona) zona.classList.toggle('d-none', !pid);
      var t = zona ? zona.querySelector('.form-text') : null;
      if (zona && !t && !n && pid) {
        var d = document.createElement('div');
        d.className = 'form-text';
        d.textContent = 'No tiene ninguna sociedad configurada: factura con sus propios datos.';
        zona.appendChild(d);
      } else if (t) { t.classList.toggle('d-none', n > 0); }
    }
  });

  /* EJECUCIÓN: de una vez o por oleadas. */
  document.addEventListener('change', function (ev) {
    if (!ev.target.matches || !ev.target.matches('[data-ma-mode]')) return;
    var c = caja(ev.target), oleadas = ev.target.value === 'OLEADAS';
    var p = q(c, '[data-ma-periodo]'), o = q(c, '[data-ma-oleadas]');
    if (p) p.classList.toggle('d-none', oleadas);
    if (o) o.classList.toggle('d-none', !oleadas);
    if (oleadas && o && !o.querySelector('[data-ma-wave]')) añadeOleada(c);
  });

  function añadeOleada(c) {
    var zona = q(c, '[data-ma-waves]');
    if (!zona) return;
    var plantilla = zona.querySelector('[data-ma-wave]');
    var fila;
    if (plantilla) {
      fila = plantilla.cloneNode(true);
      fila.querySelectorAll('input').forEach(function (i) { i.value = ''; });
      var s = fila.querySelector('select'); if (s) s.selectedIndex = 0;
    } else {
      fila = document.createElement('div');
      fila.className = 'row g-2 align-items-end mb-2';
      fila.setAttribute('data-ma-wave', '');
      fila.innerHTML =
        '<div class="col-6 col-md-3"><label class="form-label small">Desde</label>'
        + '<input type="date" name="wave_start" class="form-control form-control-sm"></div>'
        + '<div class="col-6 col-md-3"><label class="form-label small">Hasta</label>'
        + '<input type="date" name="wave_end" class="form-control form-control-sm"></div>'
        + '<div class="col-md-4"><label class="form-label small">Nota</label>'
        + '<input type="text" name="wave_note" class="form-control form-control-sm"></div>'
        + '<div class="col-md-2 d-flex gap-1">'
        + '<select class="form-select form-select-sm" name="wave_status">'
        + '<option value="PENDIENTE">Pendiente</option>'
        + '<option value="EN_EJECUCION">En ejecución</option>'
        + '<option value="FINALIZADO">Finalizado</option></select>'
        + '<button type="button" class="btn btn-sm btn-outline-danger" data-ma-wave-del>'
        + '<i class="fa fa-trash"></i></button></div>';
    }
    zona.appendChild(fila);
  }

  document.addEventListener('click', function (ev) {
    var add = ev.target.closest && ev.target.closest('[data-ma-wave-add]');
    if (add) { ev.preventDefault(); añadeOleada(caja(add)); return; }
    var del = ev.target.closest && ev.target.closest('[data-ma-wave-del]');
    if (del) {
      ev.preventDefault();
      var f = del.closest('[data-ma-wave]');
      if (f) f.remove();
    }
  });

  /* EL IMPORTE: con IVA o + IVA, y el desglose a la vista (el que vale lo hace el servidor). */
  function pintaImporte(c) {
    if (!c) return;
    var inp = q(c, '[data-ma-amount]'), modo = q(c, '[data-ma-vat-mode]'), out = q(c, '[data-ma-breakdown]');
    if (!inp || !modo || !out) return;
    var v = window.numv ? window.numv(inp.value) : parseFloat((inp.value || '0').replace(',', '.'));
    if (!v || isNaN(v)) { out.textContent = ''; return; }
    var base, iva;
    if (modo.value === 'PLUS') { base = v; iva = v * IVA / 100; }
    else { base = v / (1 + IVA / 100); iva = v - base; }
    var eur = function (n) { return n.toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €'; };
    out.textContent = 'Base ' + eur(base) + ' · IVA (' + IVA + '%) ' + eur(iva) + ' · Total ' + eur(base + iva);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ma-vat]');
    if (!b) return;
    ev.preventDefault();
    var c = caja(b), modo = q(c, '[data-ma-vat-mode]');
    if (modo) modo.value = b.getAttribute('data-ma-vat') || 'INCLUDED';
    c.querySelectorAll('[data-ma-vat]').forEach(function (x) {
      x.className = 'btn ' + (x === b ? 'btn-danger' : 'btn-outline-secondary');
    });
    pintaImporte(c);
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.matches && ev.target.matches('[data-ma-amount]')) pintaImporte(caja(ev.target));
  });
  document.addEventListener('change', function (ev) {
    if (!ev.target.matches || !ev.target.matches('[data-ma-amount-kind]')) return;
    var c = caja(ev.target), et = q(c, '[data-ma-amount-label]');
    if (et) et.textContent = ev.target.value === 'PRESUPUESTO' ? 'Presupuesto' : 'Importe';
  });

  /* EL ESTADO DE UN PERIODO se cambia PINCHÁNDOLO: Pendiente → En ejecución → Finalizado.
     No se recarga la pantalla: se cambia la etiqueta en el sitio. */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-wave-status]');
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (b.dataset.enCurso === '1') return;
    b.dataset.enCurso = '1';
    var meta = document.querySelector('meta[name="csrf-token"]');
    fetch(b.getAttribute('data-wave-url'), {
      method: 'POST', credentials: 'same-origin',
      headers: meta ? {'X-CSRFToken': meta.getAttribute('content')} : {}
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        b.dataset.enCurso = '';
        if (!d || !d.ok) { if (d && d.error) alert(d.error); return; }
        b.className = 'badge text-bg-' + (d.color || 'secondary') + ' border-0';
        b.innerHTML = '<i class="fa ' + (d.icon || 'fa-circle') + ' me-1"></i>' + d.label;
        b.setAttribute('data-wave-current', d.status);
      })
      .catch(function () { b.dataset.enCurso = ''; });
  });

  function arranca() {
    document.querySelectorAll('[data-marketing-form]').forEach(function (c) {
      aplica(c);
      var p = q(c, '[data-ma-provider]');
      if (p) p.dispatchEvent(new Event('change', {bubbles: true}));
      var m = q(c, '[data-ma-vat-mode]');
      if (m) {
        var b = c.querySelector('[data-ma-vat="' + m.value + '"]');
        if (b) b.className = 'btn btn-danger';
      }
      pintaImporte(c);
    });
  }
  if (document.readyState !== 'loading') arranca();
  else document.addEventListener('DOMContentLoaded', arranca);
  document.addEventListener('shown.bs.modal', arranca);
  document.addEventListener('inline:updated', arranca);
  window.app33MarketingForm = arranca;
})();
