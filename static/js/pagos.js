/* Pendiente de pago: montar una REMESA arrastrando bolsas y gastos a la caja de su empresa.
 *
 * Una remesa es de UNA empresa del grupo (se paga desde una cuenta suya), así que la caja de cada
 * empresa solo acepta lo suyo: si sueltas algo de otra, avisa y no lo coge.
 */
(function () {
  'use strict';

  function euros(n) {
    try { return Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    catch (_) { return (n || 0) + ' €'; }
  }

  function refresh(form) {
    var zona = form.querySelector('[data-pay-zone]');
    var chips = zona.querySelectorAll('[data-pay-chip]');
    var total = 0;
    chips.forEach(function (c) { total += parseFloat(c.getAttribute('data-amount') || '0') || 0; });
    var contador = form.querySelector('[data-pay-count]');
    if (contador) contador.textContent = String(chips.length);
    var boton = form.querySelector('[data-pay-submit]');
    if (boton) {
      boton.disabled = chips.length === 0;
      boton.innerHTML = chips.length
        ? '<i class="fa fa-plus me-1"></i>Crear remesa · ' + euros(total)
        : '<i class="fa fa-plus me-1"></i>Crear remesa';
    }
    var pista = zona.querySelector('.pay-drop__hint');
    if (pista) pista.classList.toggle('d-none', chips.length > 0);
  }

  function addChip(form, datos) {
    var zona = form.querySelector('[data-pay-zone]');
    if (!zona) return;
    // Cada tipo de pago viaja en su propio campo: bolsas enteras, gastos y liquidaciones de royalties.
    var campo = datos.kind === 'bag' ? 'bag_ids' : (datos.kind === 'royalty' ? 'royalty_ids' : 'expense_ids');
    if (zona.querySelector('[data-pay-chip][data-id="' + datos.id + '"]')) return;   // ya está
    var chip = document.createElement('span');
    chip.className = 'pay-chip';
    chip.setAttribute('data-pay-chip', '1');
    chip.setAttribute('data-id', datos.id);
    chip.setAttribute('data-amount', datos.amount || '0');
    var icono = datos.kind === 'bag' ? 'fa-scale-balanced' : (datos.kind === 'royalty' ? 'fa-percent' : 'fa-receipt');
    chip.innerHTML = '<i class="fa ' + icono + ' me-1"></i>'
      + '<span class="pay-chip__t"></span>'
      + '<button type="button" class="pay-chip__x" aria-label="Quitar">&times;</button>'
      + '<input type="hidden" name="' + campo + '" value="' + datos.id + '">';
    chip.querySelector('.pay-chip__t').textContent = datos.label || 'Gasto';
    chip.querySelector('.pay-chip__x').addEventListener('click', function () {
      chip.remove();
      refresh(form);
    });
    zona.appendChild(chip);
    refresh(form);
  }

  function itemData(el) {
    return {
      kind: el.getAttribute('data-pay-item'),
      id: el.getAttribute('data-pay-id'),
      company: el.getAttribute('data-pay-company') || '',
      label: el.getAttribute('data-pay-label') || '',
      amount: el.getAttribute('data-pay-amount') || '0',
    };
  }

  // --- Arrastrar ------------------------------------------------------------------------------
  document.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('[data-pay-item]');
    if (!el) return;
    var datos = itemData(el);
    // ⚠️ setData es OBLIGATORIO: sin él, Firefox no arranca el arrastre.
    e.dataTransfer.setData('text/plain', JSON.stringify(datos));
    e.dataTransfer.effectAllowed = 'copy';
    el.classList.add('is-dragging');
  });
  document.addEventListener('dragend', function (e) {
    var el = e.target.closest && e.target.closest('[data-pay-item]');
    if (el) el.classList.remove('is-dragging');
    document.querySelectorAll('.pay-drop.is-over').forEach(function (d) { d.classList.remove('is-over'); });
  });

  // --- Soltar ---------------------------------------------------------------------------------
  document.addEventListener('dragover', function (e) {
    var drop = e.target.closest && e.target.closest('[data-pay-drop]');
    if (!drop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  document.addEventListener('dragleave', function (e) {
    var drop = e.target.closest && e.target.closest('[data-pay-drop]');
    if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove('is-over');
  });
  document.addEventListener('drop', function (e) {
    var drop = e.target.closest && e.target.closest('[data-pay-drop]');
    if (!drop) return;
    e.preventDefault();
    drop.classList.remove('is-over');
    var datos;
    try { datos = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch (_) { return; }
    if (!datos || !datos.id) return;
    var empresa = (drop.querySelector('input[name="company_id"]') || {}).value || '';
    if (datos.company && empresa && datos.company !== empresa) {
      var aviso = drop.querySelector('[data-pay-zone]');
      if (aviso) {
        var msg = document.createElement('div');
        msg.className = 'pay-drop__warn';
        msg.textContent = 'Eso es de otra empresa del grupo: una remesa se paga desde una sola cuenta.';
        aviso.appendChild(msg);
        setTimeout(function () { msg.remove(); }, 4000);
      }
      return;
    }
    addChip(drop, datos);
  });

  // Clic en el asa: lo mismo que arrastrar, para quien prefiera ir marcando.
  document.addEventListener('click', function (e) {
    var asa = e.target.closest && e.target.closest('[data-pay-item] .fa-grip-vertical');
    if (!asa) return;
    var el = asa.closest('[data-pay-item]');
    var grupo = el.closest('.pay-group');
    var drop = grupo && grupo.querySelector('[data-pay-drop]');
    if (drop) { e.preventDefault(); e.stopPropagation(); addChip(drop, itemData(el)); }
  });

  // --- «Marcar como pagado» y «Pago parcial» (mismo modal) -------------------------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-pay-paid]');
    if (!btn) return;
    var modal = document.getElementById('payPaidModal');
    if (!modal) return;
    var parcial = btn.getAttribute('data-pay-partial') === '1';
    var pendiente = btn.getAttribute('data-pay-pending') || '';
    var enRemesa = btn.getAttribute('data-pay-in-batch') === '1';
    var form = modal.querySelector('[data-pay-paid-form]');
    form.setAttribute('action', btn.getAttribute('data-pay-paid'));
    modal.querySelector('[data-pay-paid-concept]').textContent = btn.getAttribute('data-pay-concept') || '';

    var titulo = modal.querySelector('[data-pay-paid-title]');
    if (titulo) titulo.textContent = parcial ? 'Pago parcial' : 'Marcar como pagado';
    var enviar = modal.querySelector('[data-pay-paid-submit]');
    if (enviar) enviar.textContent = parcial ? 'Registrar pago parcial' : 'Marcar pagado';
    var marca = modal.querySelector('[data-pay-paid-partial]');
    if (marca) marca.value = parcial ? '1' : '';

    var pista = modal.querySelector('[data-pay-paid-pending]');
    if (pista) {
      pista.textContent = pendiente ? ('Pendiente: ' + euros(pendiente) +
        (parcial ? ' · lo que no pagues ahora se queda pendiente.' : '')) : '';
    }
    // El aviso de la remesa solo aplica al pago parcial: pagarlo entero fuera de la remesa es raro,
    // pero no rompe nada (el gasto queda pagado y la remesa lo verá pagado).
    var aviso = modal.querySelector('[data-pay-paid-batch-warn]');
    if (aviso) {
      aviso.classList.toggle('d-none', !(parcial && enRemesa));
      var chk = aviso.querySelector('input[type="checkbox"]');
      if (chk) chk.checked = false;
    }
    var importe = modal.querySelector('[data-pay-paid-amount]');
    if (importe) importe.value = btn.getAttribute('data-pay-amount-value') || '';
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
    if (parcial && importe) setTimeout(function () { importe.focus(); }, 300);
  });

  // Pop-up de la FACTURA VALIDADA: al pinchar en cualquier pendiente de pago se ve el documento sin
  // salir de la pantalla (PDF en un marco, foto como imagen).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-pay-doc]');
    if (!btn) return;
    var url = btn.getAttribute('data-pay-doc') || '';
    if (!url) return;
    var modal = document.getElementById('payDocModal');
    if (!modal) return;
    e.preventDefault();
    var titulo = modal.querySelector('[data-pay-doc-title]');
    if (titulo) titulo.textContent = btn.getAttribute('data-pay-doc-title') || 'Factura';
    var abrir = modal.querySelector('[data-pay-doc-open]');
    if (abrir) abrir.setAttribute('href', url);
    var bajar = modal.querySelector('[data-pay-doc-dl]');
    if (bajar) bajar.setAttribute('href', url);
    // RESUMEN del pago: importe, IVA, retención (si la hay) y la cuenta a la que se abona.
    var sum = modal.querySelector('[data-pay-doc-sum]');
    if (sum) {
      function num(attr) { return parseFloat(btn.getAttribute(attr) || '0') || 0; }
      var neto = num('data-pay-doc-net');
      var iva = num('data-pay-doc-vat');
      var ret = num('data-pay-doc-retention');
      var total = num('data-pay-doc-total');
      var numero = btn.getAttribute('data-pay-doc-number') || '';
      var quien = btn.getAttribute('data-pay-doc-beneficiary') || '';
      var iban = btn.getAttribute('data-pay-doc-iban') || '';
      var filas = '';
      function fila(etiqueta, valor, clase) {
        filas += '<div class="pay-doc__cell' + (clase ? ' ' + clase : '') + '">'
              + '<span class="pay-doc__lab">' + etiqueta + '</span>'
              + '<span class="pay-doc__val">' + euros(valor) + '</span></div>';
      }
      if (neto) fila('Base', neto);
      if (iva) fila('IVA', iva);
      if (ret) fila('Retención', -ret, 'is-neg');
      if (total) fila('A pagar', total, 'is-total');
      var datos = '';
      if (numero) datos += '<span><i class="fa fa-hashtag me-1"></i>' + numero + '</span>';
      if (quien) datos += '<span><i class="fa fa-user me-1"></i>' + quien + '</span>';
      if (iban) datos += '<span class="pay-doc__iban"><i class="fa fa-building-columns me-1"></i>' + iban + '</span>';
      if (filas || datos) {
        sum.innerHTML = (filas ? '<div class="pay-doc__nums">' + filas + '</div>' : '')
                      + (datos ? '<div class="pay-doc__meta">' + datos + '</div>' : '');
        sum.classList.remove('d-none');
      } else {
        sum.innerHTML = ''; sum.classList.add('d-none');
      }
    }
    // CORREGIR LOS IMPORTES A MANO: solo si sabemos de qué factura se trata. Se le pasan al modal
    // compartido los valores actuales y lo que se esperaba, para que pueda ofrecer «la diferencia es
    // una retención» (que es lo que descuadra el pago casi siempre).
    var fixWrap = modal.querySelector('[data-pay-doc-fixwrap]');
    var fix = modal.querySelector('[data-pay-doc-fix]');
    var invId = btn.getAttribute('data-pay-doc-invoice') || '';
    if (fixWrap && fix) {
      if (invId) {
        fix.setAttribute('data-inv-id', invId);
        fix.setAttribute('data-inv-net', btn.getAttribute('data-pay-doc-net') || '');
        fix.setAttribute('data-inv-vat', btn.getAttribute('data-pay-doc-vat') || '');
        fix.setAttribute('data-inv-ret', btn.getAttribute('data-pay-doc-retention') || '');
        fix.setAttribute('data-inv-gross', btn.getAttribute('data-pay-doc-total') || '');
        fix.setAttribute('data-inv-vat-pct', btn.getAttribute('data-pay-doc-vat-pct') || '');
        fix.setAttribute('data-inv-ret-pct', btn.getAttribute('data-pay-doc-ret-pct') || '');
        fix.setAttribute('data-inv-expected', btn.getAttribute('data-pay-doc-expected') || '');
        fixWrap.classList.remove('d-none');
      } else {
        fixWrap.classList.add('d-none');
      }
    }
    var cuerpo = modal.querySelector('[data-pay-doc-body]');
    if (cuerpo) {
      var bajo = url.toLowerCase();
      var esImagen = /\.(png|jpe?g|webp|gif|heic)(\?|$)/.test(bajo);
      // ⚠️ `zoom=page-width` además de `view=FitH`: sin él, un PDF con la página pequeña (o el visor
      // en «página completa») se veía diminuto en medio de un marco enorme.
      var ancla = (url.indexOf('#') >= 0 ? '&' : '#') + 'view=FitH&zoom=page-width&toolbar=1';
      cuerpo.innerHTML = esImagen
        ? '<img src="' + url + '" alt="Factura" class="pay-doc__img">'
        : '<iframe src="' + url + ancla + '" title="Factura" class="pay-doc__frame"></iframe>';
    }
    // Pantalla completa: para las facturas que vienen con la página muy pequeña.
    var full = modal.querySelector('[data-pay-doc-full]');
    var dialog = modal.querySelector('.modal-dialog');
    if (full && dialog) {
      full.onclick = function () {
        var puesto = dialog.classList.toggle('modal-fullscreen');
        dialog.classList.toggle('modal-xl', !puesto);
        full.querySelector('i').className = puesto ? 'fa fa-compress' : 'fa fa-expand';
      };
    }
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
  });

  document.querySelectorAll('[data-pay-drop]').forEach(refresh);
})();
