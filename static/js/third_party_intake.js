/* Alta / actualización de un TERCERO desde el enlace público (templates/public_third_party_intake.html).
 *
 * Lo que hace, por partes:
 *  - Empresa o particular: cambia el modo del asistente (data-sw-mode) para que se salten los pasos
 *    que no tocan, y adapta las etiquetas (CIF/DNI, foto/logo).
 *  - Paso 1: comprueba el CIF/DNI contra la base de datos. Si ya existe, avisa y ofrece ACTUALIZAR
 *    sus datos (los rellena, enmascarados si no es su propio enlace); si no existe, sigue con el alta.
 *  - Cada documento se sube EN SU HUECO, con barra de progreso (XHR), y solo se envía la URL: así en
 *    el móvil se ve subir cada cosa en vez de esperar a un POST enorme al final.
 *  - Del certificado bancario, el servidor intenta leer el IBAN y aquí se muestra para confirmarlo.
 *  - Filas que se repiten: personas de contacto y tarjetas de fidelización.
 */
(function () {
  'use strict';
  var form = document.getElementById('intakeForm');
  if (!form) return;

  var UP = form.getAttribute('data-upload-url');
  var IDENT = form.getAttribute('data-identify-url');
  var SUBMIT = form.getAttribute('data-submit-url');

  function mode() { return (form.getAttribute('data-sw-mode') || 'PARTICULAR').toUpperCase(); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ---------------------------------------------------- empresa / particular
  function applyMode() {
    var m = mode();
    form.querySelectorAll('[data-only]').forEach(function (el) {
      var on = (el.getAttribute('data-only') || '').toUpperCase() === m;
      el.classList.toggle('d-none', !on);
      // Un campo oculto no se manda (si no, al cambiar de idea se enviarían los dos nombres).
      el.querySelectorAll('input, select, textarea').forEach(function (i) { i.disabled = !on; });
    });
    var lbl = document.getElementById('taxLabel');
    if (lbl) lbl.textContent = m === 'EMPRESA' ? 'CIF de la sociedad' : 'DNI';
    var tax = document.getElementById('taxId');
    if (tax) tax.placeholder = m === 'EMPRESA' ? 'B12345678' : '12345678Z';
    var pt = form.querySelector('[data-photo-title]');
    if (pt) pt.textContent = m === 'EMPRESA' ? 'Sube tu logo' : 'Sube tu foto';
    if (form.swRefresh) form.swRefresh();
  }
  form.querySelectorAll('input[name="entity_kind"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (!r.checked) return;
      form.setAttribute('data-sw-mode', (r.value || '').toUpperCase());
      applyMode();
    });
  });

  // ---------------------------------------------------- paso 1: ¿existe ya?
  var taxBtn = document.getElementById('taxCheck');
  var taxOut = document.getElementById('taxResult');

  function fill(profile) {
    // Rellena lo que ya tenemos. Si viene enmascarado (no es su propio enlace) se deja el hueco
    // vacío con el dato a la vista como pista, para que lo escriba entero.
    var masked = !!profile.masked;
    function set(name, value) {
      var el = form.querySelector('[name="' + name + '"]');
      if (!el || !value) return;
      if (masked && /•/.test(String(value))) { el.placeholder = value; return; }
      el.value = value;
    }
    document.getElementById('promoterId').value = profile.id || '';
    if (profile.kind) {
      var r = form.querySelector('input[name="entity_kind"][value="' + profile.kind + '"]');
      if (r) { r.checked = true; form.setAttribute('data-sw-mode', profile.kind); applyMode(); }
    }
    set('full_name', profile.full_name);
    set('company_name', profile.company_name);
    set('fiscal_address', profile.fiscal_address);
    set('email', profile.email);
    set('phone', profile.phone);
    set('bank_account', profile.bank_account);
    set('travel_departure_flight', profile.travel_departure_flight);
    set('travel_departure_train', profile.travel_departure_train);
    (profile.contacts || []).forEach(function (c) { addRow('tplContact', 'contactRows', c, ['contact_name', 'contact_title', 'contact_email', 'contact_phone'], ['name', 'title', 'email', 'phone']); });
    (profile.loyalty || []).forEach(function (t) { addRow('tplLoyalty', 'loyaltyRows', t, ['loyalty_company', 'loyalty_number'], ['company', 'number']); });
  }

  function checkTax() {
    var tax = document.getElementById('taxId');
    var valor = (tax.value || '').trim();
    if (!valor) { tax.reportValidity(); return; }
    taxOut.innerHTML = '<div class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Comprobando…</div>';
    var fd = new FormData();
    fd.append('tax_id', valor);
    fetch(IDENT, { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { taxOut.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + esc((j && j.error) || 'No se pudo comprobar') + '</div>'; return; }
        if (j.kind) {
          var r2 = form.querySelector('input[name="entity_kind"][value="' + j.kind + '"]');
          if (r2 && !r2.checked) { r2.checked = true; form.setAttribute('data-sw-mode', j.kind); applyMode(); }
        }
        if (!j.found) {
          taxOut.innerHTML = '<div class="alert alert-success py-2 mb-0"><i class="fa fa-circle-check me-1"></i>'
            + 'No estás en nuestra base de datos todavía: sigue y te damos de alta.</div>';
          if (form.swRefresh) form.swRefresh();
          var next = form.querySelector('[data-sw-next]');
          if (next) setTimeout(function () { next.click(); }, 500);
          return;
        }
        var p = j.profile || {};
        taxOut.innerHTML =
          '<div class="alert alert-warning mb-0"><div class="fw-semibold mb-1"><i class="fa fa-triangle-exclamation me-1"></i>'
          + 'Ya estás creado en nuestra base de datos' + (p.label ? ' como <strong>' + esc(p.label) + '</strong>' : '') + '.</div>'
          + '<div class="small mb-2">Puedes actualizar tus datos ahora mismo.</div>'
          + '<button type="button" class="btn btn-sm btn-primary" id="taxUpdate"><i class="fa fa-pen me-1"></i>Actualizar mis datos</button></div>';
        document.getElementById('taxUpdate').addEventListener('click', function () {
          fill(p);
          taxOut.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fa fa-circle-info me-1"></i>'
            + 'Revisa y completa lo que falte.</div>';
          var next = form.querySelector('[data-sw-next]');
          if (next) next.click();
        });
      })
      .catch(function () { taxOut.innerHTML = '<div class="alert alert-danger py-2 mb-0">No se pudo comprobar</div>'; });
  }
  if (taxBtn) taxBtn.addEventListener('click', checkTax);
  var taxInput = document.getElementById('taxId');
  if (taxInput) taxInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkTax(); } });

  // ---------------------------------------------------- subida por huecos
  function upload(zone, file) {
    var slot = zone.getAttribute('data-slot');
    var hidden = form.querySelector('[name="' + slot + '_url"]');
    var bar = zone.querySelector('.intake-drop__bar');
    var barIn = bar ? bar.querySelector('span') : null;
    var hint = zone.querySelector('.intake-drop__h');
    zone.classList.remove('is-error');
    zone.classList.add('is-busy');
    if (bar) { bar.classList.remove('d-none'); if (barIn) barIn.style.width = '4%'; }
    var fd = new FormData();
    fd.append('slot', slot);
    fd.append('file', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', UP);
    xhr.upload.onprogress = function (e) {
      if (!barIn || !e.lengthComputable) return;
      barIn.style.width = Math.max(4, Math.round(e.loaded / e.total * 100)) + '%';
    };
    xhr.onload = function () {
      zone.classList.remove('is-busy');
      if (bar) bar.classList.add('d-none');
      var j = null;
      try { j = JSON.parse(xhr.responseText); } catch (_) {}
      if (!j || !j.ok) {
        zone.classList.add('is-error');
        if (hint) hint.textContent = (j && j.error) || 'No se pudo subir';
        return;
      }
      if (hidden) hidden.value = j.file_url;
      zone.classList.add('is-done');
      if (hint) hint.textContent = file.name;
      // Previsualización solo de imágenes (un PDF no se puede pintar aquí).
      if (/^image\//.test(file.type)) {
        var prev = zone.querySelector('.intake-drop__prev');
        if (!prev) { prev = document.createElement('img'); prev.className = 'intake-drop__prev'; zone.appendChild(prev); }
        prev.src = URL.createObjectURL(file);
      }
      if (slot === 'bank_cert') {
        var iban = document.getElementById('ibanField');
        var nota = document.getElementById('ibanNote');
        if (j.detected && iban && !(iban.value || '').trim()) iban.value = j.iban_pretty || j.iban;
        if (nota) nota.textContent = j.detected
          ? 'Hemos leído este IBAN del documento. Compruébalo antes de seguir.'
          : (j.note || 'No hemos podido leer el IBAN del documento: escríbelo tú.');
      }
    };
    xhr.onerror = function () {
      zone.classList.remove('is-busy'); zone.classList.add('is-error');
      if (bar) bar.classList.add('d-none');
      if (hint) hint.textContent = 'No se pudo subir';
    };
    xhr.send(fd);
  }

  form.querySelectorAll('.intake-drop').forEach(function (zone) {
    var input = zone.querySelector('[data-intake-file]');
    input.addEventListener('change', function () { if (input.files && input.files[0]) upload(zone, input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      zone.addEventListener(ev, function () { zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('is-over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) upload(zone, f);
    });
  });

  // ---------------------------------------------------- carnet de conducir
  var lic = document.getElementById('hasLicense');
  var licWrap = document.getElementById('licenseWrap');
  function syncLicense() { if (licWrap) licWrap.classList.toggle('d-none', !(lic && lic.checked)); }
  if (lic) lic.addEventListener('change', syncLicense);

  // ---------------------------------------------------- filas que se repiten
  function addRow(tplId, hostId, data, names, keys) {
    var tpl = document.getElementById(tplId);
    var host = document.getElementById(hostId);
    if (!tpl || !host) return null;
    var node = tpl.content.firstElementChild.cloneNode(true);
    if (data) {
      names.forEach(function (n, i) {
        var el = node.querySelector('[name="' + n + '"]');
        if (el && data[keys[i]]) el.value = data[keys[i]];
      });
    }
    host.appendChild(node);
    return node;
  }
  var addC = form.querySelector('[data-add-contact]');
  if (addC) addC.addEventListener('click', function () { addRow('tplContact', 'contactRows'); });
  var addL = form.querySelector('[data-add-loyalty]');
  if (addL) addL.addEventListener('click', function () { addRow('tplLoyalty', 'loyaltyRows'); });
  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-remove-row]');
    if (!b) return;
    var row = b.closest('[data-row]');
    if (row) row.remove();
  });

  // ---------------------------------------------------- envío final
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('intakeError');
    var btn = form.querySelector('[data-sw-submit]');
    err.classList.add('d-none');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Guardando…'; }
    fetch(SUBMIT, { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) {
          err.textContent = (j && j.error) || 'No se pudieron guardar los datos';
          err.classList.remove('d-none');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check me-1"></i>Guardar'; }
          return;
        }
        form.outerHTML = '<div class="alert alert-success"><div class="fw-semibold mb-1">'
          + '<i class="fa fa-circle-check me-2"></i>' + (j.created ? '¡Ya estás dado de alta!' : '¡Datos actualizados!')
          + '</div><div>Gracias' + (j.name ? ', ' + esc(j.name) : '') + '. Ya lo tenemos todo en nuestra base de datos.</div></div>';
      })
      .catch(function () {
        err.textContent = 'No se pudieron guardar los datos. Inténtalo de nuevo.';
        err.classList.remove('d-none');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-check me-1"></i>Guardar'; }
      });
  });

  applyMode();
  syncLicense();
})();
