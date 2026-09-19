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
      cmp: null, choices: {}, docs: {}, survivor: 'a'
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
    /* ⚠️ Cuando YA se sabe con quién es el duplicado (el bloque de «Fichas repetidas» de Terceros:
       la app lo ha detectado), se entra directamente en la comparación — hacer buscar a mano lo que
       la propia pantalla acaba de decir sería trabajo tonto. El paso de búsqueda sigue ahí: con
       «Atrás» se cambia de pareja. */
    var otro = btn.getAttribute('data-merge-with') || '';
    if (otro) { loadCompare(otro); return; }
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
          // Segunda fila: con qué se distingue de otro que se llame igual (el nombre completo de
          // esa persona). La compone el servidor y solo viene cuando salen varios homónimos.
          var sub = (it.sub || '').trim();
          return '<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2" data-merge-pick="' + esc(it.id) + '">' + img +
            '<span class="min-w-0"><span class="d-block text-truncate">' + esc(it.name) + '</span>' +
            (sub ? '<small class="d-block text-muted text-truncate">' + esc(sub) + '</small>' : '') + '</span></button>';
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
    var doc = e.target.closest('[data-merge-doc]');
    if (doc && state.cmp) {
      var dk = doc.getAttribute('data-doc-key');
      state.docs[dk] = doc.getAttribute('data-merge-doc');
      modalEl.querySelectorAll('[data-merge-doc][data-doc-key="' + dk + '"]').forEach(function (c) {
        c.classList.toggle('is-picked', c === doc);
      });
      return;
    }
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
        state.docs = {};
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
    // Avisos propios de esa categoría (p. ej.: en una canción, que su PROYECTO discográfico se
    // mantiene). Los manda el servidor en `notes`, así que aquí no se sabe de qué van.
    var caja = $q('[data-merge-notes]');
    if (caja) {
      var notas = c.notes || [];
      caja.innerHTML = notas.map(function (n) {
        return '<div class="alert alert-info small py-2 mb-2"><i class="fa fa-circle-info me-1"></i>' + esc(n) + '</div>';
      }).join('');
      caja.classList.toggle('d-none', !notas.length);
    }
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
    renderDocs();
  }
  /* ⚠️⚠️ LOS DOCUMENTOS: lo que sube cada ficha (DNI, carnet, pasaporte, tarjetas, matrículas) NO
     cuelga de ninguna clave ajena, así que antes se perdía al fusionar. Ahora se dice qué va a
     pasar con cada uno ANTES de fusionar: los que solo tiene una ficha se MANTIENEN, y los que
     tienen las dos se eligen (no se duplica un DNI). */
  function renderDocs() {
    var caja = $q('[data-merge-docs]');
    if (!caja) return;
    var d = (state.cmp && state.cmp.documents) || {};
    var conflictos = d.conflicts || [], mantiene = d.kept || [], otros = d.other || 0;
    if (!conflictos.length && !mantiene.length && !otros) { caja.classList.add('d-none'); return; }
    var c = state.cmp;
    var tarjeta = function (lado, key, doc, nombre) {
      return '<button type="button" class="w-100 text-start merge-val merge-doc" data-merge-doc="' + lado + '" data-doc-key="' + esc(key) + '">' +
        '<span class="d-flex align-items-center gap-2">' +
        (doc.photo
          ? '<img src="' + esc(doc.photo) + '" alt="" style="width:46px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #eee;background:#fff;">'
          : '<i class="fa fa-id-card text-muted"></i>') +
        '<span class="min-w-0"><span class="d-block small fw-semibold text-truncate">' + esc(nombre) + '</span>' +
        '<span class="d-block small text-muted text-truncate">' + esc(doc.sub || '—') + '</span></span></span></button>';
    };
    var html = '';
    conflictos.forEach(function (cf) {
      html += '<div class="border rounded-3 p-2 mb-2">' +
        '<div class="small mb-2"><i class="fa fa-triangle-exclamation text-warning me-1"></i>' +
        'Las dos fichas tienen <strong>' + esc(cf.kind_label) + '</strong>. ¿Con cuál te quedas?</div>' +
        '<div class="row g-2">' +
        '<div class="col-12 col-md-6">' + tarjeta('a', cf.key, cf.a, c.a.name) + '</div>' +
        '<div class="col-12 col-md-6">' + tarjeta('b', cf.key, cf.b, c.b.name) + '</div>' +
        '</div></div>';
    });
    if (mantiene.length) {
      html += '<div class="small text-muted"><i class="fa fa-circle-check text-success me-1"></i>' +
        'Se mantienen <strong>' + mantiene.length + '</strong> documento' + (mantiene.length === 1 ? '' : 's') + ': ' +
        esc(mantiene.map(function (m) { return m.kind_label; }).join(' · ')) + '.</div>';
    }
    if (otros) {
      html += '<div class="small text-muted"><i class="fa fa-circle-check text-success me-1"></i>' +
        'Y ' + otros + ' papel' + (otros === 1 ? '' : 'es') + ' de alta/PRL, que pasan enteros.</div>';
    }
    $q('[data-merge-docs-body]').innerHTML = html;
    caja.classList.remove('d-none');
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
    // Y de un documento que tienen los dos, por defecto el del que se conserva.
    (((state.cmp || {}).documents || {}).conflicts || []).forEach(function (cf) {
      state.docs[cf.key] = side;
      modalEl.querySelectorAll('[data-merge-doc][data-doc-key="' + cf.key + '"]').forEach(function (cel) {
        cel.classList.toggle('is-picked', cel.getAttribute('data-merge-doc') === side);
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
    // Los documentos que tienen los dos: «keep» = el del que se conserva, «drop» = el del otro.
    var docs = {};
    Object.keys(state.docs || {}).forEach(function (k) {
      docs[k] = (state.docs[k] === state.survivor) ? 'keep' : 'drop';
    });
    add('docs_json', JSON.stringify(docs));
    add('next', window.location.href);
    // form.submit() programático NO dispara el evento submit: el token CSRF se añade a mano.
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) add('csrf_token', meta.getAttribute('content') || '');
    document.body.appendChild(form);
    form.submit();
  }
})();
