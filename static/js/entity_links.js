/* entity_links.js — Lógica del modal "Vincular" (vinculaciones entre tercero ↔ artista / medio /
   recinto / ticketera / editorial / otro tercero).

   Funciona para cualquier `<form data-entity-link-form>` (panel de ficha y modal de invitaciones):
     1. Elegir el tipo de entidad (botones con icono).
     2. Buscar y seleccionar la entidad (con foto/icono) → /api/vinculaciones/search.
     3. Si no existe, "crear nueva" rápido (alta mínima) y queda seleccionada.
     4. Escribir la relación (un texto) y guardar.

   Guardar: si el form lleva `data-link-ajax` se envía por fetch y se cierra el modal sin salir
   (modal de invitaciones, superpuesto); si no, se envía normal (el panel recarga la ficha).

   El token CSRF lo añade csrf.js de forma automática (campo en el form y cabecera en fetch).
*/
(function () {
  'use strict';

  // Endpoints de alta rápida por tipo (rutas estables de la app).
  var CREATE_ENDPOINTS = {
    promoter: '/api/promoters/create',
    empresa: '/api/promoters/create',
    institucion: '/api/promoters/create',
    artist: '/api/artists/create',
    media: '/api/media/create',
    venue: '/api/venues/create',
    ticketer: '/api/ticketers/create',
    publishing: '/api/publishing_companies/create'
  };
  var SEARCH_URL = '/api/vinculaciones/search';

  function placeholder() {
    return (document.body && document.body.getAttribute('data-default-photo-url')) || '';
  }
  function esc(v) {
    return (v == null ? '' : String(v)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setup(form) {
    if (form.__entityLinkReady) return;
    form.__entityLinkReady = true;

    var typeBtns = form.querySelectorAll('[data-link-type]');
    var targetType = form.querySelector('[data-link-target-type]');
    var targetId = form.querySelector('[data-link-target-id]');
    var search = form.querySelector('[data-link-search]');
    var results = form.querySelector('[data-link-results]');
    var selected = form.querySelector('[data-link-selected]');
    var saveBtn = form.querySelector('[data-link-save]');
    var createWrap = form.querySelector('[data-link-create-panel]');
    var createToggle = form.querySelector('[data-link-create-toggle]');
    var createName = form.querySelector('[data-link-create-name]');
    var createMediaType = form.querySelector('[data-link-create-media-type]');
    var createMediaWrap = form.querySelector('[data-link-create-media-wrap]');
    var createLogo = form.querySelector('[data-link-create-logo]');
    var createSubmit = form.querySelector('[data-link-create-submit]');
    var createMsg = form.querySelector('[data-link-create-msg]');
    var timer = null;

    function currentType() { return targetType ? targetType.value : ''; }

    function resetSelection() {
      if (targetId) targetId.value = '';
      if (selected) { selected.classList.add('d-none'); selected.innerHTML = ''; }
      if (saveBtn) saveBtn.disabled = true;
    }

    function selectItem(item) {
      if (!item || !item.id) return;
      if (targetId) targetId.value = item.id;
      if (selected) {
        selected.classList.remove('d-none');
        selected.innerHTML =
          '<div class="el-selected-card">' +
            '<img src="' + esc(item.logo_url || placeholder()) + '" alt="" data-default-photo="1">' +
            '<div class="min-w-0"><div class="fw-semibold text-truncate">' + esc(item.label || '') + '</div>' +
            '<div class="small text-muted text-truncate"><i class="fa ' + esc(item.icon || 'fa-link') + ' me-1"></i>' + esc(item.type_label || '') + (item.subtitle ? ' · ' + esc(item.subtitle) : '') + '</div></div>' +
            '<button type="button" class="btn btn-sm btn-link text-muted ms-auto" data-link-clear aria-label="Quitar"><i class="fa fa-xmark"></i></button>' +
          '</div>';
      }
      if (results) results.innerHTML = '';
      if (search) search.value = '';
      if (saveBtn) saveBtn.disabled = false;
    }

    function renderResults(list) {
      if (!results) return;
      if (!list || !list.length) {
        results.innerHTML = '<div class="text-muted small p-2">Sin coincidencias. Usa “Crear nueva” si no existe.</div>';
        return;
      }
      results.innerHTML = list.map(function (it) {
        return '<button type="button" class="el-result" data-el-item=\'' + esc(JSON.stringify(it)) + '\'>' +
          '<img src="' + esc(it.logo_url || placeholder()) + '" alt="" data-default-photo="1">' +
          '<span class="min-w-0"><strong class="text-truncate d-block">' + esc(it.label || '') + '</strong>' +
          '<small class="text-muted text-truncate d-block">' + esc(it.subtitle || it.type_label || '') + '</small></span>' +
        '</button>';
      }).join('');
      results.querySelectorAll('[data-el-item]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var it = {};
          try { it = JSON.parse(btn.getAttribute('data-el-item')); } catch (e) {}
          selectItem(it);
        });
      });
    }

    function runSearch() {
      var type = currentType();
      if (!type) { if (results) results.innerHTML = '<div class="text-muted small p-3">Elige primero qué quieres vincular.</div>'; return; }
      var q = search ? search.value.trim() : '';
      if (results) results.innerHTML = '<div class="text-muted small p-2">Buscando…</div>';
      // Excluir la propia ficha de los resultados (no tiene sentido vincularse consigo misma).
      var srcT = form.querySelector('[name="source_type"]'), srcI = form.querySelector('[name="source_id"]');
      var url = SEARCH_URL + '?type=' + encodeURIComponent(type) + '&q=' + encodeURIComponent(q);
      if (srcT && srcT.value && srcI && srcI.value) url += '&exclude_type=' + encodeURIComponent(srcT.value) + '&exclude_id=' + encodeURIComponent(srcI.value);
      fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (data) { renderResults(Array.isArray(data) ? data : []); })
        .catch(function () { if (results) results.innerHTML = '<div class="text-danger small p-2">Error al buscar.</div>'; });
    }

    function chooseType(type, btn) {
      if (targetType) targetType.value = type;
      var lbl = btn.querySelector('span');
      form.__activeTypeLabel = lbl ? lbl.textContent.trim() : '';
      typeBtns.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      resetSelection();
      if (createMediaWrap) createMediaWrap.classList.toggle('d-none', type !== 'media');
      if (createWrap) createWrap.classList.add('d-none');
      // "Crear nueva" solo para tipos con alta rápida (p. ej. no aplica a Personal de oficina).
      if (createToggle) createToggle.classList.toggle('d-none', !CREATE_ENDPOINTS[type]);
      if (createMsg) createMsg.textContent = '';
      runSearch();
      if (search) search.focus();
    }

    typeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () { chooseType(btn.getAttribute('data-link-type'), btn); });
    });

    if (search) {
      search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 220); });
    }

    // Quitar la selección (la X del card seleccionado).
    form.addEventListener('click', function (e) {
      if (e.target.closest('[data-link-clear]')) { e.preventDefault(); resetSelection(); runSearch(); }
    });

    // Mostrar el mini-formulario de "crear nueva".
    if (createToggle) {
      createToggle.addEventListener('click', function () {
        if (!currentType()) { if (results) results.innerHTML = '<div class="text-muted small p-2">Elige primero el tipo.</div>'; return; }
        if (createWrap) createWrap.classList.toggle('d-none');
        if (createName && search) { createName.value = search.value.trim(); createName.focus(); }
      });
    }

    function doCreate(force) {
      var type = currentType();
      if (!type || !CREATE_ENDPOINTS[type]) return;
      var name = (createName && createName.value.trim()) || '';
      if (!name) { if (createMsg) { createMsg.className = 'small text-danger'; createMsg.textContent = 'Escribe un nombre.'; } return; }
      var fd = new FormData();
      fd.append('name', name); fd.append('nick', name);
      // Empresa/Institución se guardan como terceros clasificados (campo kind).
      if (type === 'empresa' || type === 'institucion') fd.append('kind', type);
      if (type === 'media' && createMediaType) fd.append('media_type', createMediaType.value || 'OTRO');
      if (createLogo && createLogo.files && createLogo.files[0]) { fd.append('logo', createLogo.files[0]); fd.append('photo', createLogo.files[0]); }
      if (force) fd.append('force_new', '1');
      if (createSubmit) createSubmit.disabled = true;
      if (createMsg) { createMsg.className = 'small text-muted'; createMsg.textContent = 'Creando…'; }
      fetch(CREATE_ENDPOINTS[type], { method: 'POST', body: fd })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (createSubmit) createSubmit.disabled = false;
          var d = res.data || {};
          if (res.status === 409 && d.similar && d.similar.length) {
            if (createMsg) {
              createMsg.className = 'small';
              createMsg.innerHTML = 'Ya existe algo parecido: ' +
                d.similar.map(function (s) { return '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1" data-el-use=\'' + esc(JSON.stringify(s)) + '\'>' + esc(s.label || s.name || s.nick || '') + '</button>'; }).join('') +
                ' <button type="button" class="btn btn-sm btn-primary mb-1" data-el-force>Crear igualmente</button>';
              createMsg.querySelectorAll('[data-el-use]').forEach(function (b) {
                b.addEventListener('click', function () { var s = {}; try { s = JSON.parse(b.getAttribute('data-el-use')); } catch (e) {} normalizeAndSelect(s, type); if (createWrap) createWrap.classList.add('d-none'); });
              });
              var fb = createMsg.querySelector('[data-el-force]');
              if (fb) fb.addEventListener('click', function () { doCreate(true); });
            }
            return;
          }
          if (!d.id) { if (createMsg) { createMsg.className = 'small text-danger'; createMsg.textContent = d.error || 'No se pudo crear.'; } return; }
          normalizeAndSelect(d, type);
          if (createWrap) createWrap.classList.add('d-none');
          if (createMsg) createMsg.textContent = '';
        })
        .catch(function () { if (createSubmit) createSubmit.disabled = false; if (createMsg) { createMsg.className = 'small text-danger'; createMsg.textContent = 'Error de red.'; } });
    }

    function normalizeAndSelect(d, type) {
      selectItem({
        id: d.id,
        label: d.label || d.name || d.nick || d.text || '',
        logo_url: d.logo_url || d.photo_url || '',
        type_label: d.type_label || form.__activeTypeLabel || '',
        icon: d.icon || '',
        subtitle: d.subtitle || ''
      });
    }

    if (createSubmit) createSubmit.addEventListener('click', function () { doCreate(false); });

    // Guardar.
    form.addEventListener('submit', function (e) {
      if (targetId && !targetId.value) { e.preventDefault(); return; }
      if (!form.hasAttribute('data-link-ajax')) return; // panel: envío normal (recarga la ficha)
      e.preventDefault();
      if (saveBtn) saveBtn.disabled = true;
      fetch(form.getAttribute('action'), { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function () {
          var modalEl = form.closest('.modal');
          if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide();
          document.dispatchEvent(new CustomEvent('entity-link:saved', { detail: { form: form } }));
        })
        .finally(function () { if (saveBtn) saveBtn.disabled = false; });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     VINCULAR AL CREAR (el módulo «Vinculaciones» del «Rellenar más campos» de un tercero)

     ⚠️⚠️ Aquí la ficha **todavía no existe**, así que no hay nada contra lo que guardar: lo que se
     elige se queda en el formulario en filas paralelas (`link_type[]` / `link_id[]` /
     `link_relation[]`) y las crea el servidor en cuanto el tercero tiene id
     (`_promoter_apply_extra_form` → `_entity_link_upsert`, el mismo punto único que el modal
     «Vincular» de una ficha).
     · Un clic en un resultado lo AÑADE a la lista (sin pasos intermedios) y deja el cursor en su
       relación; la X lo quita.
     · ⚠️ El buscador y los botones de tipo NO llevan `name`: no se envían con el formulario.
     · ⚠️ Al reabrir el modal, el `form.reset()` del alta rápida no borra filas añadidas a mano →
       se vacía la lista escuchando su `reset`.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function setupPicker(box) {
    if (box.__linkPickerReady) return;
    box.__linkPickerReady = true;

    var typeBtns = box.querySelectorAll('[data-link-type]');
    var search = box.querySelector('[data-link-search]');
    var results = box.querySelector('[data-link-results]');
    var chosen = box.querySelector('[data-link-chosen]');
    var tipo = '', tipoLabel = '', timer = null, ultimos = [];

    // ⚠️ Se recorre en vez de montar un selector con el id dentro: `esc` escapa HTML, no CSS, y un
    // selector mal compuesto no encontraría la fila y dejaría meter la misma vinculación dos veces.
    function yaEsta(id) {
      var clave = tipo + ':' + id;
      var filas = chosen.querySelectorAll('[data-link-row]');
      for (var i = 0; i < filas.length; i++) if (filas[i].getAttribute('data-row-key') === clave) return true;
      return false;
    }
    /* ⚠️ La lista SE QUEDA al añadir uno (con el añadido marcado y sin poder repetirse): casi
       siempre se vinculan varios seguidos, y cerrarla obligaba a volver a elegir el tipo cada vez. */
    function pinta(list) {
      ultimos = list || ultimos;
      if (!tipo) { results.innerHTML = ''; return; }
      if (!ultimos.length) {
        results.innerHTML = '<div class="text-muted small p-2">Sin coincidencias. Se puede vincular después desde su ficha.</div>';
        return;
      }
      results.innerHTML = ultimos.map(function (it) {
        var puesto = yaEsta(it.id);
        return '<button type="button" class="el-result" ' + (puesto ? 'disabled ' : '') + 'data-el-item=\'' + esc(JSON.stringify(it)) + '\'>' +
          '<img src="' + esc(it.logo_url || placeholder()) + '" alt="" data-default-photo="1">' +
          '<span class="min-w-0"><strong class="text-truncate d-block">' + esc(it.label || '') + '</strong>' +
          '<small class="text-muted text-truncate d-block">' + esc(it.subtitle || it.type_label || '') + '</small></span>' +
          (puesto ? '<span class="badge text-bg-light border ms-auto"><i class="fa fa-check me-1"></i>Añadido</span>' : '') +
        '</button>';
      }).join('');
      results.querySelectorAll('[data-el-item]').forEach(function (b) {
        b.addEventListener('click', function () {
          var it = {}; try { it = JSON.parse(b.getAttribute('data-el-item')); } catch (e) {}
          anade(it);
        });
      });
    }
    function busca() {
      if (!tipo) { results.innerHTML = '<div class="text-muted small p-2">Elige primero qué quieres vincular.</div>'; return; }
      results.innerHTML = '<div class="text-muted small p-2">Buscando…</div>';
      fetch(SEARCH_URL + '?type=' + encodeURIComponent(tipo) + '&q=' + encodeURIComponent(search ? search.value.trim() : ''),
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { pinta(Array.isArray(d) ? d : []); })
        .catch(function () { results.innerHTML = '<div class="text-danger small p-2">Error al buscar.</div>'; });
    }
    function anade(it) {
      if (!it || !it.id) return;
      if (yaEsta(it.id)) { results.innerHTML = ''; if (search) search.value = ''; return; }
      var fila = document.createElement('div');
      fila.className = 'entity-link-row';
      fila.setAttribute('data-link-row', '');
      fila.setAttribute('data-row-key', tipo + ':' + it.id);
      fila.innerHTML =
        '<input type="hidden" name="link_type[]" value="' + esc(tipo) + '">' +
        '<input type="hidden" name="link_id[]" value="' + esc(it.id) + '">' +
        '<span class="entity-link-avatar entity-link-avatar--sm"><img src="' + esc(it.logo_url || placeholder()) + '" alt="" data-default-photo="1"><i class="fa ' + esc(it.icon || 'fa-link') + '"></i></span>' +
        '<span class="min-w-0 flex-grow-1"><span class="entity-link-name text-truncate d-block">' + esc(it.label || '') + '</span>' +
        '<span class="entity-link-meta text-truncate d-block">' + esc(it.type_label || tipoLabel || '') + '</span></span>' +
        '<input class="form-control form-control-sm" style="max-width:220px" name="link_relation[]" placeholder="Relación (ej: mánager)">' +
        '<button type="button" class="btn-close btn-sm" data-link-del aria-label="Quitar"></button>';
      chosen.appendChild(fila);
      fila.querySelector('[data-link-del]').addEventListener('click', function () { fila.remove(); pinta(null); });
      pinta(null);                       // el añadido se marca y la lista se queda para el siguiente
      var rel = fila.querySelector('[name="link_relation[]"]');
      if (rel) rel.focus();
    }

    typeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        tipo = b.getAttribute('data-link-type') || '';
        var lbl = b.querySelector('span');
        tipoLabel = lbl ? lbl.textContent.trim() : '';
        typeBtns.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        busca();
        if (search) search.focus();
      });
    });
    if (search) search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(busca, 220); });
    // Al volver al buscador, la lista del tipo elegido se vuelve a ofrecer sin tener que escribir.
    if (search) search.addEventListener('focus', function () { if (tipo && !results.innerHTML) busca(); });
    // ⚠️ Un Intro en el buscador enviaría el formulario del alta: aquí solo vuelve a buscar.
    if (search) search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); busca(); } });

    var form = box.closest('form');
    if (form) form.addEventListener('reset', function () {
      setTimeout(function () {
        chosen.innerHTML = ''; results.innerHTML = '';
        tipo = ''; tipoLabel = ''; ultimos = [];
        typeBtns.forEach(function (x) { x.classList.remove('is-active'); });
      }, 0);
    });
  }

  function init(root) {
    (root || document).querySelectorAll('form[data-entity-link-form]').forEach(setup);
    (root || document).querySelectorAll('[data-entity-link-picker]').forEach(setupPicker);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
  else init(document);
  // Re-inicializar formularios insertados dinámicamente.
  document.addEventListener('shown.bs.modal', function (e) { init(e.target); });
})();
