/* ============================================================================
 * Contactos de la actividad (Producción / Ticketing / Comunicación).
 *
 * Pinta un selector por función con las personas que ya cuelgan del promotor y permite crear una
 * nueva sin salir de la pantalla, avisando de las que se le parecen para no duplicarla. La misma
 * persona puede cubrir varias funciones: se elige en cada selector y el backend la guarda una sola
 * vez con varias etiquetas.
 *
 * Es GLOBAL y no hace nada si la página no tiene [data-concert-contacts], así que puede ir en el
 * layout junto al resto de utilidades.
 * ========================================================================== */
(function () {
  'use strict';

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setup(root) {
    if (root.__ccReady) return;
    root.__ccReady = true;

    var roles = [];
    try { roles = JSON.parse(root.getAttribute('data-roles') || '[]'); } catch (e) { roles = []; }
    var selected = {};
    try { selected = JSON.parse(root.getAttribute('data-selected') || '{}') || {}; } catch (e) { selected = {}; }

    var contactsUrl = root.getAttribute('data-contacts-url') || '';
    var createUrl = root.getAttribute('data-create-url') || '';
    var promoterInputSel = root.getAttribute('data-promoter-input') || '';
    var fixedPromoter = root.getAttribute('data-promoter-id') || '';

    var body = root.querySelector('[data-cc-body]');
    var noPromoter = root.querySelector('[data-cc-nopromoter]');
    var rolesWrap = root.querySelector('[data-cc-roles]');
    var sameChk = root.querySelector('[data-cc-same]');
    var newBox = root.querySelector('[data-cc-new]');
    var newRoleLbl = root.querySelector('[data-cc-new-role]');
    var newName = root.querySelector('[data-cc-new-name]');
    var newEmail = root.querySelector('[data-cc-new-email]');
    var newPhone = root.querySelector('[data-cc-new-phone]');
    var dupsBox = root.querySelector('[data-cc-dups]');
    var errBox = root.querySelector('[data-cc-new-error]');

    var contacts = [];      // personas del promotor
    var extra = [];         // personas de OTROS terceros que se han vinculado a mano
    var creatingFor = null; // rol para el que se está creando

    function promoterId() {
      if (fixedPromoter) return fixedPromoter;
      var inp = promoterInputSel ? document.querySelector(promoterInputSel) : null;
      return inp ? (inp.value || '').trim() : '';
    }

    function all() {
      var seen = {};
      return contacts.concat(extra).filter(function (c) {
        if (seen[c.id]) return false;
        seen[c.id] = 1;
        return true;
      });
    }

    function hiddenFor(role) { return root.querySelector('[data-cc-input="' + role + '"]'); }

    function renderRoles() {
      rolesWrap.innerHTML = '';
      roles.forEach(function (r) {
        var key = r[0], label = r[1], icon = r[2];
        var row = el('div', 'cc-role');
        row.innerHTML =
          '<div class="cc-role__label"><i class="fa ' + esc(icon) + '"></i>' + esc(label) + '</div>';
        var sel = el('select', 'form-select form-select-sm');
        sel.setAttribute('data-cc-role', key);
        row.appendChild(sel);
        rolesWrap.appendChild(row);
        fillSelect(sel, key);
        sel.addEventListener('change', function () { onRoleChange(key, sel); });
      });
    }

    function fillSelect(sel, key) {
      var cur = (hiddenFor(key) || {}).value || '';
      sel.innerHTML = '';
      sel.appendChild(new Option('Sin asignar', ''));
      all().forEach(function (c) {
        var bits = [c.name];
        if (c.email) bits.push(c.email);
        else if (c.phone) bits.push(c.phone);
        var o = new Option(bits.join(' · '), c.id);
        sel.appendChild(o);
      });
      sel.appendChild(new Option('➕ Crear nueva persona…', '__new__'));
      sel.value = cur && all().some(function (c) { return c.id === cur; }) ? cur : '';
      if (!sel.value) { var h = hiddenFor(key); if (h && h.value && !cur) h.value = ''; }
    }

    function refreshSelects() {
      roles.forEach(function (r) {
        var sel = rolesWrap.querySelector('[data-cc-role="' + r[0] + '"]');
        if (sel) fillSelect(sel, r[0]);
      });
    }

    function onRoleChange(key, sel) {
      if (sel.value === '__new__') {
        sel.value = (hiddenFor(key) || {}).value || '';
        openNew(key);
        return;
      }
      var h = hiddenFor(key);
      if (h) h.value = sel.value || '';
      if (sameChk && sameChk.checked && sel.value) applyToAll(sel.value);
    }

    function applyToAll(contactId) {
      roles.forEach(function (r) {
        var h = hiddenFor(r[0]);
        if (h) h.value = contactId;
        var s = rolesWrap.querySelector('[data-cc-role="' + r[0] + '"]');
        if (s) s.value = contactId;
      });
    }

    function openNew(key) {
      creatingFor = key;
      var meta = roles.filter(function (r) { return r[0] === key; })[0];
      if (newRoleLbl) newRoleLbl.textContent = meta ? meta[1] : '';
      newBox.classList.remove('d-none');
      dupsBox.classList.add('d-none');
      dupsBox.innerHTML = '';
      errBox.classList.add('d-none');
      newName.value = ''; newEmail.value = ''; newPhone.value = '';
      newName.focus();
    }

    function closeNew() {
      creatingFor = null;
      newBox.classList.add('d-none');
      dupsBox.innerHTML = '';
      dupsBox.classList.add('d-none');
    }

    function assign(contact) {
      // Una persona de otro tercero también vale: se añade a la lista para poder elegirla.
      if (!all().some(function (c) { return c.id === contact.id; })) extra.push(contact);
      var key = creatingFor;
      refreshSelects();
      if (sameChk && sameChk.checked) applyToAll(contact.id);
      else if (key) {
        var h = hiddenFor(key);
        if (h) h.value = contact.id;
        var s = rolesWrap.querySelector('[data-cc-role="' + key + '"]');
        if (s) s.value = contact.id;
      }
      closeNew();
    }

    function showDuplicates(list) {
      dupsBox.innerHTML = '';
      var head = el('div', 'small fw-semibold mb-1',
        '<i class="fa fa-triangle-exclamation me-1 text-warning"></i>Ya hay ' +
        (list.length === 1 ? 'una persona parecida' : 'personas parecidas') +
        '. Si es la misma, vincúlala en vez de crearla otra vez:');
      dupsBox.appendChild(head);
      list.forEach(function (d) {
        var row = el('div', 'cc-dup');
        var bits = [];
        if (d.email) bits.push(esc(d.email));
        if (d.phone) bits.push(esc(d.phone));
        if (d.promoter_name) bits.push('de ' + esc(d.promoter_name));
        row.innerHTML =
          '<div class="cc-dup__info"><span class="fw-semibold">' + esc(d.name) + '</span>' +
          (bits.length ? '<span class="text-muted small"> · ' + bits.join(' · ') + '</span>' : '') +
          '<span class="badge text-bg-light border ms-1">' + esc(d.why || '') + '</span></div>';
        var btn = el('button', 'btn btn-sm btn-outline-primary', 'Vincular esta');
        btn.type = 'button';
        btn.addEventListener('click', function () { assign(d); });
        row.appendChild(btn);
        dupsBox.appendChild(row);
      });
      var force = el('button', 'btn btn-sm btn-link p-0 mt-1', 'No es ninguna de estas, crear igualmente');
      force.type = 'button';
      force.addEventListener('click', function () { save(true); });
      dupsBox.appendChild(force);
      dupsBox.classList.remove('d-none');
    }

    function save(force) {
      var name = (newName.value || '').trim();
      errBox.classList.add('d-none');
      if (!name) { errBox.textContent = 'Indica al menos el nombre.'; errBox.classList.remove('d-none'); return; }
      fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({
          promoter_id: promoterId(), name: name,
          email: (newEmail.value || '').trim(), phone: (newPhone.value || '').trim(),
          force: force ? 1 : 0
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.duplicates && data.duplicates.length) { showDuplicates(data.duplicates); return; }
          if (data && data.ok && data.contact) { contacts.push(data.contact); assign(data.contact); return; }
          errBox.textContent = (data && data.error) || 'No se pudo crear la persona.';
          errBox.classList.remove('d-none');
        })
        .catch(function () {
          errBox.textContent = 'No se pudo crear la persona.';
          errBox.classList.remove('d-none');
        });
    }

    var lastPromoter = null;
    function loadContacts() {
      var pid = promoterId();
      if (pid === lastPromoter) return;
      lastPromoter = pid;
      closeNew();
      if (!pid) {
        contacts = [];
        body.classList.add('d-none');
        if (noPromoter) noPromoter.classList.remove('d-none');
        return;
      }
      if (noPromoter) noPromoter.classList.add('d-none');
      body.classList.remove('d-none');
      fetch(contactsUrl.replace('__PID__', encodeURIComponent(pid)), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          contacts = (data && data.contacts) || [];
          refreshSelects();
        })
        .catch(function () { contacts = []; refreshSelects(); });
    }

    renderRoles();
    if (sameChk) {
      sameChk.addEventListener('change', function () {
        if (!sameChk.checked) return;
        var first = '';
        for (var i = 0; i < roles.length && !first; i++) first = (hiddenFor(roles[i][0]) || {}).value || '';
        if (first) applyToAll(first);
      });
    }
    root.querySelector('[data-cc-new-save]').addEventListener('click', function () { save(false); });
    root.querySelector('[data-cc-new-cancel]').addEventListener('click', closeNew);

    if (fixedPromoter) {
      loadContacts();
    } else if (promoterInputSel) {
      // El promotor se elige en otro paso del asistente: no hay evento fiable, se sondea.
      loadContacts();
      setInterval(loadContacts, 600);
    }
  }

  function init(scope) {
    (scope || document).querySelectorAll('[data-concert-contacts]').forEach(setup);
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });
  // La ficha muestra el formulario al pulsar «Editar» (ficha_inline.js emite este evento).
  document.addEventListener('ficha:shown', function (ev) { init(ev.target || document); });
  window.initConcertContacts = init;
})();
