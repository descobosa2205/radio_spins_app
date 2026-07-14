/* Fusión de DUPLICADOS en bases de datos (modal genérico #mergeModal).
 *
 * Un botón [data-merge-open] (menú ⋮ de cada elemento) abre el modal con: buscador dentro de la
 * MISMA categoría → comparación campo a campo de los dos elementos (se elige cuál se conserva y,
 * por campo, qué valor te quedas) → confirmación. El POST es un submit clásico (flash + recarga);
 * el servidor re-apunta TODAS las referencias del perdedor al ganador antes de eliminarlo.
 */
(function () {
  'use strict';
  var modalEl = document.getElementById('mergeModal');
  if (!modalEl) return;
  if (modalEl.dataset.mergeReady) return;   // el partial podría incluirse dos veces
  modalEl.dataset.mergeReady = '1';

  var state = null;
  function $q(sel) { return modalEl.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function stepShow(name) {
    modalEl.querySelectorAll('[data-merge-step]').forEach(function (st) {
      st.classList.toggle('d-none', st.getAttribute('data-merge-step') !== name);
    });
    $q('[data-merge-confirm]').classList.toggle('d-none', name !== 'compare');
  }

  // ---- abrir el modal desde el menú ⋮ de un elemento ----
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-merge-open]');
    if (!btn) return;
    e.preventDefault();
    state = {
      label: btn.getAttribute('data-merge-label') || 'elemento',
      id: btn.getAttribute('data-merge-id'),
      name: btn.getAttribute('data-merge-name') || '—',
      photo: btn.getAttribute('data-merge-photo') || '',
      searchUrl: btn.getAttribute('data-merge-search'),
      compareUrl: btn.getAttribute('data-merge-compare'),
      executeUrl: btn.getAttribute('data-merge-execute'),
      cmp: null, choices: {}, survivor: 'a'
    };
    $q('[data-merge-title-label]').textContent = state.label.toLowerCase();
    $q('[data-merge-src-name]').textContent = state.name;
    var img = $q('[data-merge-src-photo]');
    if (state.photo) { img.src = state.photo; img.classList.remove('d-none'); }
    else { img.classList.add('d-none'); }
    $q('[data-merge-search-input]').value = '';
    $q('[data-merge-results]').innerHTML = '';
    $q('[data-merge-noresults]').classList.add('d-none');
    stepShow('search');
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).show();
    setTimeout(function () { try { $q('[data-merge-search-input]').focus(); } catch (err) {} }, 260);
  });

  // ---- paso 1: buscar el duplicado en la misma categoría ----
  var timer = null;
  modalEl.addEventListener('input', function (e) {
    if (!e.target.matches('[data-merge-search-input]') || !state) return;
    clearTimeout(timer);
    var q = e.target.value.trim();
    timer = setTimeout(function () { search(q); }, 220);
  });
  function search(q) {
    fetch(state.searchUrl + '?q=' + encodeURIComponent(q) + '&exclude=' + encodeURIComponent(state.id),
      { headers: { 'X-Requested-With': 'XMLHttpRequest' }, noLoader: true })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!state) return;
        var box = $q('[data-merge-results]');
        box.innerHTML = (list || []).map(function (it) {
          var img = it.photo
            ? '<img src="' + esc(it.photo) + '" alt="" style="width:30px;height:30px;object-fit:contain;border-radius:8px;border:1px solid #eee;background:#fff;">'
            : '<span style="width:30px;text-align:center;"><i class="fa fa-circle-user text-muted"></i></span>';
          return '<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2" data-merge-pick="' + esc(it.id) + '">' + img + '<span>' + esc(it.name) + '</span></button>';
        }).join('');
        $q('[data-merge-noresults]').classList.toggle('d-none', !!(list && list.length));
      })
      .catch(function () {});
  }

  // ---- paso 2: comparación, superviviente y elección por campo ----
  modalEl.addEventListener('click', function (e) {
    if (!state) return;
    var pick = e.target.closest('[data-merge-pick]');
    if (pick) { loadCompare(pick.getAttribute('data-merge-pick')); return; }
    if (e.target.closest('[data-merge-back]')) { stepShow('search'); return; }
    var card = e.target.closest('[data-merge-survivor]');
    if (card && state.cmp) { setSurvivor(card.getAttribute('data-merge-survivor')); return; }
    var val = e.target.closest('[data-merge-choice]');
    if (val && state.cmp) {
      var key = val.getAttribute('data-key');
      state.choices[key] = val.getAttribute('data-merge-choice');
      modalEl.querySelectorAll('[data-merge-choice][data-key="' + key + '"]').forEach(function (c) {
        c.classList.toggle('is-picked', c === val);
      });
      return;
    }
    if (e.target.closest('[data-merge-confirm]') && state.cmp) submitMerge();
  });

  function loadCompare(otherId) {
    fetch(state.compareUrl + '?a=' + encodeURIComponent(state.id) + '&b=' + encodeURIComponent(otherId),
      { headers: { 'X-Requested-With': 'XMLHttpRequest' }, noLoader: true })
      .then(function (r) { if (!r.ok) throw new Error('HTTP'); return r.json(); })
      .then(function (cmp) {
        state.cmp = cmp;
        state.choices = {};
        renderCompare();
        stepShow('compare');
        setSurvivor('a');
      })
      .catch(function () { alert('No se pudo cargar la comparación. Inténtalo de nuevo.'); });
  }

  function survivorCard(side, it) {
    return '<div class="col-12 col-md-6"><button type="button" class="w-100 text-start border rounded-3 p-2 bg-white merge-surv" data-merge-survivor="' + side + '">' +
      '<div class="d-flex align-items-center gap-2">' +
      (it.photo
        ? '<img src="' + esc(it.photo) + '" alt="" style="width:34px;height:34px;object-fit:contain;border-radius:8px;border:1px solid #eee;background:#fff;">'
        : '<i class="fa fa-circle-user text-muted fa-lg"></i>') +
      '<div class="min-w-0"><div class="fw-semibold text-truncate">' + esc(it.name) + '</div>' +
      '<div class="small text-muted">' + (side === 'a' ? 'Elemento de partida' : 'Elegido en la búsqueda') + '</div></div>' +
      '<span class="ms-auto badge text-bg-success d-none flex-shrink-0" data-surv-badge><i class="fa fa-check me-1"></i>Se conserva</span>' +
      '</div></button></div>';
  }
  function renderCompare() {
    var c = state.cmp;
    $q('[data-merge-survivors]').innerHTML = survivorCard('a', c.a) + survivorCard('b', c.b);
    $q('[data-merge-col-a]').textContent = c.a.name;
    $q('[data-merge-col-b]').textContent = c.b.name;
    $q('[data-merge-fields]').innerHTML = (c.fields || []).map(function (f) {
      var cell = function (side, v) {
        var empty = (v == null || v === '');
        return '<td><button type="button" class="w-100 text-start merge-val' + (empty ? ' merge-val--empty' : '') + '" data-merge-choice="' + side + '" data-key="' + esc(f.key) + '">' +
          (empty ? '<span class="text-muted">—</span>' : esc(v)) + '</button></td>';
      };
      return '<tr><td class="small text-muted">' + esc(f.label) + '</td>' + cell('a', f.a) + cell('b', f.b) + '</tr>';
    }).join('');
  }
  function setSurvivor(side) {
    state.survivor = side;
    modalEl.querySelectorAll('[data-merge-survivor]').forEach(function (cd) {
      var on = cd.getAttribute('data-merge-survivor') === side;
      cd.classList.toggle('is-picked', on);
      var b = cd.querySelector('[data-surv-badge]');
      if (b) b.classList.toggle('d-none', !on);
    });
    // Por defecto cada campo toma el valor del superviviente; si lo tiene vacío, el del otro.
    (state.cmp.fields || []).forEach(function (f) {
      var sv = (side === 'a') ? f.a : f.b;
      var pick = (sv !== '' && sv != null) ? side : (side === 'a' ? 'b' : 'a');
      state.choices[f.key] = pick;
      modalEl.querySelectorAll('[data-merge-choice][data-key="' + f.key + '"]').forEach(function (cel) {
        cel.classList.toggle('is-picked', cel.getAttribute('data-merge-choice') === pick);
      });
    });
  }
  function submitMerge() {
    var c = state.cmp;
    var keep = (state.survivor === 'b') ? c.b : c.a;
    var drop = (state.survivor === 'b') ? c.a : c.b;
    if (!confirm('¿Fusionar «' + drop.name + '» dentro de «' + keep.name + '»?\n\nTodo lo que apuntaba a «' + drop.name + '» pasará a «' + keep.name + '» y el duplicado desaparecerá. No se puede deshacer.')) return;
    var choices = {};
    Object.keys(state.choices).forEach(function (k) {
      choices[k] = (state.choices[k] === state.survivor) ? 'keep' : 'drop';
    });
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = state.executeUrl;
    form.className = 'd-none';
    var add = function (n, v) {
      var i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; form.appendChild(i);
    };
    add('keep_id', keep.id);
    add('drop_id', drop.id);
    add('choices_json', JSON.stringify(choices));
    add('next', window.location.href);
    // form.submit() programático NO dispara el evento submit: el token CSRF se añade a mano.
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) add('csrf_token', meta.getAttribute('content') || '');
    document.body.appendChild(form);
    form.submit();
  }
})();
