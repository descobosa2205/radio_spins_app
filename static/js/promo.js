/* PROMOCIÓN de prensa: paneles que se abren según lo que se conteste, y los datos del medio.
 *
 * Lo comparten el asistente «+ Promoción» y el modal de la ficha (los dos usan las macros de
 * `_promo_activity_fields.html`), así que un arreglo aquí vale para las dos pantallas.
 *
 * Por delegación en `document`: los formularios viven dentro de modales que se pintan/reemplazan,
 * así que no vale enganchar listeners de una sola vez a cada input.
 */
(function () {
  'use strict';

  function formOf(el) { return el && el.closest ? el.closest('form') : null; }
  function show(el, visible) { if (el) el.classList.toggle('d-none', !visible); }

  // --- Paneles condicionales -----------------------------------------------------------------
  function syncModality(form) {
    var picked = form.querySelector('[data-promo-modality]:checked');
    var presencial = !!(picked && picked.value === 'PRESENCIAL');
    show(form.querySelector('[data-promo-location-panel]'), presencial);
  }
  function syncSings(form) {
    var sw = form.querySelector('[data-promo-sings]');
    show(form.querySelector('[data-promo-sings-panel]'), !!(sw && sw.checked));
  }
  function syncFormation(form) {
    var picked = form.querySelector('[data-promo-formation]:checked');
    show(form.querySelector('[data-promo-musicians-panel]'), !!(picked && picked.value === 'DIRECTO'));
  }
  function syncFee(form) {
    var sw = form.querySelector('[data-promo-fee]');
    show(form.querySelector('[data-promo-fee-panel]'), !!(sw && sw.checked));
  }
  function syncProduction(form) {
    var sw = form.querySelector('[data-promo-prod]');
    show(form.querySelector('[data-promo-prod-panel]'), !!(sw && sw.checked));
  }
  // Quién acompaña al artista (solo en la ficha).
  function syncEscort(form) {
    var picked = form.querySelector('[data-promo-escort]:checked');
    var kind = picked ? picked.value : 'NONE';
    show(form.querySelector('[data-promo-escort-user]'), kind === 'USER');
    show(form.querySelector('[data-promo-escort-promoter]'), kind === 'PROMOTER');
  }

  function syncAll(form) {
    if (!form) return;
    syncModality(form); syncSings(form); syncFormation(form);
    syncFee(form); syncProduction(form); syncEscort(form);
  }

  // --- Medio -> contactos y ubicaciones ------------------------------------------------------
  var cache = {};

  function renderContacts(form, contacts, keep) {
    var sel = form.querySelector('[data-promo-contact]');
    if (!sel) return;
    var current = keep || sel.getAttribute('data-selected') || '';
    sel.innerHTML = '<option value="">Sin contacto concreto</option>';
    (contacts || []).forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label || 'Contacto';
      if (c.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function renderLocations(form, locations) {
    var box = form.querySelector('[data-promo-location-suggestions]');
    if (!box) return;
    var hidden = form.querySelector('[data-promo-location-id]');
    var current = hidden ? (hidden.value || '') : '';
    if (!(locations || []).length) {
      box.innerHTML = '<div class="form-text">Este medio no tiene ubicaciones guardadas: escríbela abajo.</div>';
      return;
    }
    box.innerHTML = '<div class="form-text mb-1">Ubicaciones de este medio:</div>';
    var wrap = document.createElement('div');
    wrap.className = 'd-flex flex-wrap gap-2';
    locations.forEach(function (loc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline-secondary' + (loc.id === current ? ' active' : '');
      btn.innerHTML = '<i class="fa fa-location-dot me-1"></i>' + (loc.label || loc.name || 'Ubicación');
      btn.addEventListener('click', function () {
        wrap.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (hidden) hidden.value = loc.id;
        var name = form.querySelector('[data-promo-location-name]');
        var addr = form.querySelector('[data-promo-location-address]');
        if (name) name.value = loc.name || '';
        if (addr) addr.value = loc.address || '';
        // Ya está guardada: no hay que volver a vincularla.
        show(form.querySelector('[data-promo-location-link-wrap]'), false);
      });
      wrap.appendChild(btn);
    });
    box.appendChild(wrap);
  }

  function loadMedia(form, mediaId, keepContact) {
    if (!mediaId) { renderContacts(form, []); renderLocations(form, []); return; }
    if (cache[mediaId]) {
      renderContacts(form, cache[mediaId].contacts, keepContact);
      renderLocations(form, cache[mediaId].locations);
      return;
    }
    var base = form.getAttribute('data-promo-media-url') || '/promocion-prensa/api/medio/';
    fetch(base + encodeURIComponent(mediaId), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;
        cache[mediaId] = data;
        renderContacts(form, data.contacts, keepContact);
        renderLocations(form, data.locations);
      })
      .catch(function () { /* sin datos del medio se sigue a mano */ });
  }

  // --- Enganches ------------------------------------------------------------------------------
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.matches) return;
    var form = formOf(t);
    if (!form) return;
    if (t.matches('[data-promo-modality]')) syncModality(form);
    if (t.matches('[data-promo-sings]')) syncSings(form);
    if (t.matches('[data-promo-formation]')) syncFormation(form);
    if (t.matches('[data-promo-fee]')) syncFee(form);
    if (t.matches('[data-promo-prod]')) syncProduction(form);
    if (t.matches('[data-promo-escort]')) syncEscort(form);
    // Gastos cubiertos: mismo patrón que en la ficha de concierto.
    if (t.matches('[data-pc-toggle]')) show(form.querySelector('[data-pc-panel]'), t.checked);
    if (t.matches('[data-pc-item]')) {
      var key = t.getAttribute('data-pc-item');
      show(form.querySelector('[data-pc-detail="' + key + '"]'), t.checked);
    }
    if (t.matches('[data-promo-media]')) {
      var hidden = form.querySelector('[data-promo-location-id]');
      if (hidden) hidden.value = '';                       // otro medio, otra ubicación
      show(form.querySelector('[data-promo-location-link-wrap]'), true);
      loadMedia(form, t.value);
    }
  });

  function initForms(root) {
    (root || document).querySelectorAll('[data-promo-form]').forEach(function (form) {
      syncAll(form);
      var media = form.querySelector('[data-promo-media]');
      if (media && media.value) loadMedia(form, media.value, form.getAttribute('data-promo-contact-id') || '');
    });
  }

  if (document.readyState !== 'loading') initForms(document);
  else document.addEventListener('DOMContentLoaded', function () { initForms(document); });
  // Un modal que se abre por primera vez puede traer un formulario recién pintado.
  document.addEventListener('shown.bs.modal', function (e) { initForms(e.target); });
  window.app33PromoInit = initForms;
})();
