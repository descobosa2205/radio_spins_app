/* Ficha de concierto — edición inline por sección + filas dinámicas.

   Carga SOLO en concert_detail.html (vía {% block scripts %}). Lee los catálogos
   (promotores/empresas/tags) desde `window.CONCERT_FORM`, que el template inyecta:

     window.CONCERT_FORM = {
       promoterOptionsHtml: '<option ...> ...',   // opciones de promotor (sin seleccionar), con data-photo=logo
       companyOptionsHtml:  '<option ...> ...',    // opciones de empresa del grupo (sin seleccionar)
       initialTags: ['gira', ...]                  // tags del concierto (para "datos")
     };

   Patrón de edición inline por sección (CLAUDE.md):
     - Cada `.ficha-section` tiene su vista de solo-lectura `[data-section-view]` y su
       `<form ... data-section-form>` (oculto con .d-none).
     - El botón `[data-edit-toggle]` (sin valor) muestra el form de SU sección; con valor
       (un selector) muestra ese form concreto (caso especial "datos").
     - `[data-edit-cancel]` vuelve a la vista.
     - El form guarda por AJAX (ajax_inline.js) contra `concert_section_update` y refresca la
       zona `#concert-general-zone`.

   Filas dinámicas: por delegación (sin onclick inline).
     - Añadir:  <button data-add-row="TIPO">      (TIPO: company-share|promoter-share|zone|cache|contract|note|equip-doc|equip-note)
     - Contenedor: <div data-rows="TIPO">
     - Borrar fila (solo en memoria): <button data-remove-row>  (quita el `.cf-row` contenedor)
*/
(function () {
  'use strict';

  var cfSeq = 0; // ids únicos para los selects con alta rápida

  // ---------------------------------------------------------------- helpers
  function cfData() { return window.CONCERT_FORM || {}; }

  function moneyBaseSelect(name, selected) {
    var g = (selected === 'NET') ? '' : ' selected';
    var n = (selected === 'NET') ? ' selected' : '';
    return '<select name="' + name + '" class="form-select">'
      + '<option value="GROSS"' + g + '>Bruto</option>'
      + '<option value="NET"' + n + '>Neto</option></select>';
  }

  // Grupo selector de promotor/tercero (select2 con logo + alta rápida superpuesta).
  function promoterGroup(name) {
    var id = 'cfp' + (++cfSeq);
    var opts = cfData().promoterOptionsHtml || '<option value="">—</option>';
    return '<div class="input-group">'
      + '<select id="' + id + '" name="' + name + '" class="form-select select-providers">' + opts + '</select>'
      + '<button type="button" class="btn btn-outline-secondary" data-quick-create="promoter" data-target="' + id + '"><i class="fa fa-plus"></i></button>'
      + '</div>';
  }

  function companySelect(name) {
    var opts = cfData().companyOptionsHtml || '<option value="">—</option>';
    return '<select name="' + name + '" class="form-select">' + opts + '</select>';
  }

  // ------------------------------------------------------------ cachés (UI)
  // Opciones de la condición "variable" por modo (etiqueta visible).
  var CACHE_OPTIONS = {
    FIXED: [
      ['FIXED_PER_TICKET_FROM', 'Importe fijo por entrada vendida (desde entrada X)'],
      ['FIXED_FROM_TICKETS', 'Importe fijo (desde X entradas vendidas)'],
      ['FIXED_FROM_REVENUE', 'Importe fijo (desde X recaudación)']
    ],
    PERCENT: [
      ['PCT_FROM_REVENUE', '% de taquilla (desde un importe)'],
      ['PCT_FROM_TICKETS', '% de taquilla (desde X entradas vendidas)'],
      ['PCT_TICKET_TYPE', '% de un tipo de entradas vendidas']
    ]
  };

  function setShown(el, shown) { if (el) el.style.display = shown ? '' : 'none'; }

  function applyCacheOption(row) {
    var opt = (row.querySelector('.cache-var-option') || {}).value || '';
    setShown(row.querySelector('.cache-from-ticket'), opt === 'FIXED_PER_TICKET_FROM');
    setShown(row.querySelector('.cache-min-tickets'), opt === 'FIXED_FROM_TICKETS' || opt === 'PCT_FROM_TICKETS');
    setShown(row.querySelector('.cache-min-revenue'), opt === 'FIXED_FROM_REVENUE' || opt === 'PCT_FROM_REVENUE');
    setShown(row.querySelector('.cache-ticket-type'), opt === 'PCT_TICKET_TYPE');
  }

  function applyCacheMode(row, desiredOption) {
    var modeSel = row.querySelector('.cache-var-mode');
    var optSel = row.querySelector('.cache-var-option');
    var mode = modeSel ? modeSel.value : 'FIXED';
    if (optSel) {
      var list = CACHE_OPTIONS[mode] || CACHE_OPTIONS.FIXED;
      optSel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
      if (desiredOption) {
        var ok = list.some(function (o) { return o[0] === desiredOption; });
        if (ok) optSel.value = desiredOption;
      }
    }
    // valor: importe (modo FIJO) vs % + base (modo PORCENTAJE)
    setShown(row.querySelector('.cache-amount'), mode === 'FIXED');
    setShown(row.querySelector('.cache-pct'), mode === 'PERCENT');
    setShown(row.querySelector('.cache-pct-base'), mode === 'PERCENT');
    applyCacheOption(row);
  }

  function applyCacheKind(row, desiredOption) {
    var kind = (row.querySelector('.cache-kind') || {}).value || 'FIXED';
    var isVar = kind === 'VARIABLE';
    setShown(row.querySelector('.cache-concept'), kind === 'OTHER');
    setShown(row.querySelector('.cache-variable'), isVar);
    if (isVar) {
      applyCacheMode(row, desiredOption);
    } else {
      // FIJO y OTROS: importe visible; % oculto.
      setShown(row.querySelector('.cache-amount'), true);
      setShown(row.querySelector('.cache-pct'), false);
      setShown(row.querySelector('.cache-pct-base'), false);
    }
  }

  // -------------------------------------------------------- constructor de filas
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function buildRow(type) {
    var del = '<div class="col-md-1 d-grid"><label class="form-label small">&nbsp;</label>'
      + '<button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>';

    if (type === 'company-share') {
      return el('<div class="cf-row row g-2 align-items-end mb-2">'
        + '<div class="col-md-4"><label class="form-label small">Empresa</label>' + companySelect('company_share_id[]') + '</div>'
        + '<div class="col-md-2"><label class="form-label small">%</label><input type="number" step="0.01" name="company_share_pct[]" class="form-control" placeholder="%"></div>'
        + '<div class="col-md-2"><label class="form-label small">Base %</label>' + moneyBaseSelect('company_share_pct_base[]') + '</div>'
        + '<div class="col-md-2"><label class="form-label small">Fijo (€)</label><input type="number" step="0.01" name="company_share_amount[]" class="form-control" placeholder="€"></div>'
        + '<div class="col-md-1"><label class="form-label small">Base fijo</label>' + moneyBaseSelect('company_share_amount_base[]') + '</div>'
        + del + '</div>');
    }
    if (type === 'promoter-share') {
      return el('<div class="cf-row row g-2 align-items-end mb-2">'
        + '<div class="col-md-4"><label class="form-label small">Promotor / tercero</label>' + promoterGroup('promoter_share_id[]') + '</div>'
        + '<div class="col-md-2"><label class="form-label small">%</label><input type="number" step="0.01" name="promoter_share_pct[]" class="form-control" placeholder="%"></div>'
        + '<div class="col-md-2"><label class="form-label small">Base %</label>' + moneyBaseSelect('promoter_share_pct_base[]') + '</div>'
        + '<div class="col-md-2"><label class="form-label small">Fijo (€)</label><input type="number" step="0.01" name="promoter_share_amount[]" class="form-control" placeholder="€"></div>'
        + '<div class="col-md-1"><label class="form-label small">Base fijo</label>' + moneyBaseSelect('promoter_share_amount_base[]') + '</div>'
        + del + '</div>');
    }
    if (type === 'zone') {
      return el('<div class="cf-row border rounded p-2 mb-2">'
        + '<div class="row g-2 align-items-end">'
        + '<div class="col-md-4"><label class="form-label small">Comisionista</label>' + promoterGroup('zone_promoter_id[]') + '</div>'
        + '<div class="col-md-2"><label class="form-label small">Tipo</label><select name="zone_commission_mode[]" class="form-select zone-mode"><option value="FIXED" selected>Fijo</option><option value="PERCENT">% Variable</option></select></div>'
        + '<div class="col-md-2 zone-pct" style="display:none;"><label class="form-label small">%</label><input type="number" step="0.01" name="zone_commission_pct[]" class="form-control" placeholder="%"></div>'
        + '<div class="col-md-2 zone-base" style="display:none;"><label class="form-label small">Base</label>' + moneyBaseSelect('zone_commission_base[]') + '</div>'
        + '<div class="col-md-2 zone-amount"><label class="form-label small">Importe (€)</label><input type="number" step="0.01" name="zone_commission_amount[]" class="form-control" placeholder="€"></div>'
        + '<div class="col-md-3"><label class="form-label small">Importe exento <span class="text-muted">(opc.)</span></label><input type="number" step="0.01" name="zone_exempt_amount[]" class="form-control" placeholder="€"></div>'
        + '<div class="col-md-7"><label class="form-label small">Motivo / concepto</label><textarea name="zone_concept[]" class="form-control" rows="1" placeholder="Motivo de la comisión..."></textarea></div>'
        + '<div class="col-md-2 d-grid"><label class="form-label small">&nbsp;</label><button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>'
        + '</div></div>');
    }
    if (type === 'cache') {
      var row = el('<div class="cf-row cache-row border rounded p-2 mb-2">'
        + '<div class="row g-2 align-items-end">'
        + '<div class="col-md-3"><label class="form-label small">Tipo de caché</label><select name="cache_kind[]" class="form-select cache-kind"><option value="FIXED">Fijo</option><option value="VARIABLE">Variable</option><option value="OTHER">Otros</option></select></div>'
        + '<div class="col-md-4 cache-concept" style="display:none;"><label class="form-label small">Concepto</label><input name="cache_concept[]" class="form-control" placeholder="Nombre / concepto"></div>'
        + '<div class="col-md-3 cache-amount"><label class="form-label small">Importe (€)</label><input type="number" step="0.01" name="cache_amount[]" class="form-control" placeholder="0,00"></div>'
        + '<div class="col-md-2 cache-pct" style="display:none;"><label class="form-label small">%</label><input type="number" step="0.01" name="cache_pct[]" class="form-control" placeholder="%"></div>'
        + '<div class="col-md-2 cache-pct-base" style="display:none;"><label class="form-label small">Base</label>' + moneyBaseSelect('cache_pct_base[]') + '</div>'
        + '<div class="col-md-1 d-grid"><label class="form-label small">&nbsp;</label><button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>'
        + '</div>'
        + '<div class="row g-2 align-items-end mt-1 cache-variable" style="display:none;">'
        + '<div class="col-md-4"><label class="form-label small">Modo</label><select name="cache_var_mode[]" class="form-select cache-var-mode"><option value="FIXED">Importe fijo</option><option value="PERCENT">Porcentaje</option></select></div>'
        + '<div class="col-md-5"><label class="form-label small">Condición</label><select name="cache_var_option[]" class="form-select cache-var-option"></select></div>'
        + '<div class="col-md-3 cache-from-ticket" style="display:none;"><label class="form-label small">Desde entrada #</label><input type="number" name="cache_from_ticket[]" class="form-control"></div>'
        + '<div class="col-md-3 cache-min-tickets" style="display:none;"><label class="form-label small">Desde X entradas</label><input type="number" name="cache_min_tickets[]" class="form-control"></div>'
        + '<div class="col-md-3 cache-min-revenue" style="display:none;"><label class="form-label small">Desde recaudación (€)</label><input type="number" step="0.01" name="cache_min_revenue[]" class="form-control"></div>'
        + '<div class="col-md-3 cache-ticket-type" style="display:none;"><label class="form-label small">Tipo de entrada</label><input name="cache_ticket_type[]" class="form-control" placeholder="VIP / grada / ..."></div>'
        + '</div></div>');
      applyCacheKind(row);
      return row;
    }
    if (type === 'contract') {
      return el('<div class="cf-row row g-2 align-items-end mb-2">'
        + '<div class="col-md-4"><label class="form-label small">Concepto</label><input name="contract_concept[]" class="form-control" placeholder="Ej: Contrato principal"></div>'
        + '<div class="col-md-6"><label class="form-label small">PDF</label><input type="file" name="contract_file[]" class="form-control" accept="application/pdf"></div>'
        + '<div class="col-md-2 d-grid"><label class="form-label small">&nbsp;</label><button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>'
        + '</div>');
    }
    if (type === 'note') {
      return el('<div class="cf-row border rounded p-2 mb-2">'
        + '<div class="row g-2 align-items-end">'
        + '<div class="col-md-4"><label class="form-label small">Título</label><input name="note_title[]" class="form-control" placeholder="Título"></div>'
        + '<div class="col-md-7"><label class="form-label small">Texto</label><textarea name="note_body[]" class="form-control" rows="2" placeholder="Escribe la nota..."></textarea></div>'
        + '<div class="col-md-1 d-grid"><label class="form-label small">&nbsp;</label><button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>'
        + '</div></div>');
    }
    if (type === 'equip-doc') {
      return el('<div class="cf-row row g-2 align-items-end mb-2">'
        + '<div class="col-md-4"><label class="form-label small">Concepto</label><input name="equipment_doc_concept[]" class="form-control" placeholder="Ej: Rider artista"></div>'
        + '<div class="col-md-6"><label class="form-label small">PDF</label><input type="file" name="equipment_doc_file[]" class="form-control" accept="application/pdf"></div>'
        + '<div class="col-md-2 d-grid"><label class="form-label small">&nbsp;</label><button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button></div>'
        + '</div>');
    }
    if (type === 'equip-note') {
      return el('<div class="cf-row border rounded p-2 mb-2">'
        + '<div class="d-flex gap-2 align-items-end">'
        + '<div class="flex-grow-1"><label class="form-label small">Nota de equipamiento</label><textarea name="equipment_note_body[]" class="form-control" rows="2" placeholder="Escribe la nota..."></textarea></div>'
        + '<button type="button" class="btn btn-outline-danger" data-remove-row><i class="fa fa-trash"></i></button>'
        + '</div></div>');
    }
    return null;
  }

  // Reconstruye en JS las filas existentes a partir de placeholders
  // `<script type="application/json" data-row-type="TIPO">{...}</script>` (una sola fuente de
  // markup: `buildRow`). El JSON va keyado por el `name` del input (sin `[]`).
  function buildExisting(form) {
    form.querySelectorAll('script[data-row-type]').forEach(function (ph) {
      var type = ph.getAttribute('data-row-type');
      var container = ph.closest('[data-rows]');
      if (!container) { ph.remove(); return; }
      var data = {};
      try { data = JSON.parse(ph.textContent || '{}'); } catch (e) { data = {}; }
      var row = buildRow(type);
      if (row) {
        // El tipo/modo debe fijarse antes de poblar (para caché/comisionista).
        if (type === 'cache' && data.cache_kind) { row.querySelector('.cache-kind').value = data.cache_kind; }
        Object.keys(data).forEach(function (k) {
          if (k === 'cache_var_option') return; // se preselecciona tras construir las opciones
          var n = row.querySelector('[name="' + k + '[]"]');
          if (n != null && data[k] != null && data[k] !== '') n.value = data[k];
        });
        if (type === 'cache') applyCacheKind(row, data.cache_var_option || '');
        if (type === 'zone') onZoneMode(row);
        container.insertBefore(row, ph);
      }
      ph.remove();
    });
  }

  // ------------------------------------------------------------- "datos" (sale_type + tags)
  function applySaleType(form) {
    var sel = form.querySelector('[data-sale-type]');
    var v = sel ? sel.value : '';
    var prom = form.querySelector('[data-promoter-wrap]');
    var be = form.querySelector('[data-breakeven-wrap]');
    setShown(prom, ['VENDIDO', 'GRATUITO', 'GIRAS_COMPRADAS'].indexOf(v) >= 0);
    setShown(be, !(v === 'VENDIDO' || v === 'GRATUITO'));
  }

  function initDatosForm(form) {
    if (!form.__datosInit) {
      form.__datosInit = true;
      var sel = form.querySelector('[data-sale-type]');
      if (sel) sel.addEventListener('change', function () { applySaleType(form); });
      if (window.initConcertTagManager && document.getElementById('concertTagInputDetail')) {
        window.concertTagManagers = window.concertTagManagers || {};
        window.concertTagManagers.detail = window.initConcertTagManager({
          inputId: 'concertTagInputDetail', chipsId: 'concertTagChipsDetail', hiddenId: 'concertTagHiddenDetail',
          initialTags: cfData().initialTags || []
        });
      }
    }
    applySaleType(form);
  }

  function initSectionForm(form) {
    if (!form.__sectionInit) {
      form.__sectionInit = true;
      buildExisting(form);
    }
    try { if (window.initSelect2) window.initSelect2(); } catch (e) {}
  }

  // El toggle vista<->form (mostrar/ocultar) lo gestiona ahora `ficha_inline.js` (compartido por
  // todas las fichas). Aquí solo reaccionamos a su evento "ficha:shown" para los inicializadores
  // específicos del concierto (sale_type+tags en "datos"; rehidratar filas en las secciones).
  document.addEventListener('ficha:shown', function (e) {
    var form = e.detail && e.detail.form;
    if (!form) return;
    if (form.matches('[data-concert-datos-form]')) initDatosForm(form);
    else if (form.matches('[data-section-form]')) initSectionForm(form);
  });

  // ------------------------------------------------------------------- filas dinámicas (delegado)
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add-row]');
    if (add) {
      e.preventDefault();
      var type = add.getAttribute('data-add-row');
      var scope = add.closest('[data-section-form]') || add.closest('.ficha-section') || document;
      var container = scope.querySelector('[data-rows="' + type + '"]');
      if (container) {
        var row = buildRow(type);
        if (row) {
          container.appendChild(row);
          try { if (window.initSelect2) window.initSelect2(); } catch (e2) {}
        }
      }
      return;
    }
    var rm = e.target.closest('[data-remove-row]');
    if (rm) {
      e.preventDefault();
      var r = rm.closest('.cf-row');
      if (r) r.remove();
    }
  });

  document.addEventListener('change', function (e) {
    var el2 = e.target;
    if (el2.classList.contains('cache-kind')) applyCacheKind(el2.closest('.cache-row'));
    else if (el2.classList.contains('cache-var-mode')) applyCacheMode(el2.closest('.cache-row'));
    else if (el2.classList.contains('cache-var-option')) applyCacheOption(el2.closest('.cache-row'));
    else if (el2.classList.contains('zone-mode')) onZoneMode(el2.closest('.cf-row'));
  });

  function onZoneMode(row) {
    if (!row) return;
    var pct = (row.querySelector('.zone-mode') || {}).value === 'PERCENT';
    setShown(row.querySelector('.zone-pct'), pct);
    setShown(row.querySelector('.zone-base'), pct);
    setShown(row.querySelector('.zone-amount'), !pct);
  }
})();
