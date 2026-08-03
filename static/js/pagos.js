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
    var cuerpo = modal.querySelector('[data-pay-doc-body]');
    if (cuerpo) {
      var bajo = url.toLowerCase();
      var esImagen = /\.(png|jpe?g|webp|gif|heic)(\?|$)/.test(bajo);
      cuerpo.innerHTML = esImagen
        ? '<img src="' + url + '" alt="Factura" style="width:100%;height:auto;display:block;">'
        : '<iframe src="' + url + '#view=FitH" title="Factura" style="width:100%;height:75vh;border:0;display:block;"></iframe>';
    }
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
  });

  document.querySelectorAll('[data-pay-drop]').forEach(refresh);
})();
