/* A QUIÉN SE LE MANDA una playlist de selección/valoración (`[data-pvsend]`).
 *
 * A la izquierda a quién y la nota; a la derecha la PREVISUALIZACIÓN, que compone el SERVIDOR con el
 * MISMO HTML que se manda. La búsqueda es EN VIVO y con foto (terceros, personal y artistas) y el
 * «+» crea un tercero con lo escrito.
 * ⚠️ No-op si su marca no está en la pantalla.
 */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-pvsend]');
  if (!raiz) return;

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function csrf() {
    var t = document.querySelector('meta[name="csrf-token"]');
    return t ? (t.getAttribute('content') || '') : '';
  }
  function postJson(url, datos) {
    var cab = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (csrf()) cab['X-CSRFToken'] = csrf();
    return fetch(url, { method: 'POST', headers: cab, body: JSON.stringify(datos || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return { ok: false }; });
  }

  var campo = raiz.querySelector('[data-pvsend-q]');
  var lista = raiz.querySelector('[data-pvsend-list]');
  var elegidos = raiz.querySelector('[data-pvsend-picked]');
  var vacio = raiz.querySelector('[data-pvsend-empty]');
  var nota = raiz.querySelector('[data-pvsend-note]');
  var plazo = raiz.querySelector('[data-pvsend-due]');
  var previa = raiz.querySelector('[data-pvsend-preview]');
  var asunto = raiz.querySelector('[data-pvsend-subject]');
  var error = raiz.querySelector('[data-pvsend-error]');
  var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';
  var espera = null, esperaPrevia = null;

  function repasaVacio() {
    if (vacio) vacio.classList.toggle('d-none', !!elegidos.querySelector('[data-pvsend-row]'));
  }

  function yaEsta(clave) {
    return !!elegidos.querySelector('[data-pvsend-row][data-key="' + clave + '"]');
  }

  function añade(o) {
    var clave = (o.email || '') + '|' + (o.phone || '');
    if (!clave.replace('|', '') || yaEsta(clave)) return;
    var n = document.createElement('div');
    n.className = 'pv-dest';
    n.setAttribute('data-pvsend-row', '');
    n.setAttribute('data-key', clave);
    n.setAttribute('data-name', o.name || '');
    n.setAttribute('data-email', o.email || '');
    n.setAttribute('data-phone', o.phone || '');
    n.innerHTML = '<img class="pv-face" src="' + esc(o.photo_url || AVATAR) + '" alt="" data-avatar="1">'
      + '<span class="pv-dest__main"><span class="fw-semibold">' + esc(o.name || '—') + '</span>'
      + '<span class="d-block small text-muted">' + esc(o.email || o.phone || '') + '</span></span>'
      + (o.kind_label ? '<span class="badge text-bg-light border">' + esc(o.kind_label) + '</span>' : '')
      + '<button class="btn btn-sm btn-link text-danger" type="button" data-pvsend-del title="Quitar">'
      + '<i class="fa fa-xmark"></i></button>';
    elegidos.appendChild(n);
    repasaVacio();
  }

  campo.addEventListener('input', function () {
    var q = campo.value.trim();
    if (q.length < 2) { lista.classList.add('d-none'); return; }
    clearTimeout(espera);
    espera = setTimeout(function () {
      fetch(raiz.getAttribute('data-search-url') + '?q=' + encodeURIComponent(q),
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (js) {
          var filas = (js && js.rows) || [];
          if (!filas.length) { lista.classList.add('d-none'); return; }
          lista.innerHTML = filas.slice(0, 10).map(function (o) {
            return '<button class="demo-author__opt" type="button" data-pvsend-pick=\'' + esc(JSON.stringify(o)) + '\'>'
              + (o.photo_url ? '<img src="' + esc(o.photo_url) + '" alt="" data-avatar="1">'
                             : '<i class="fa fa-user"></i>')
              + '<span>' + esc(o.name) + '</span>'
              + '<span class="badge text-bg-light border ms-auto">' + esc(o.kind_label || '') + '</span></button>';
          }).join('');
          lista.classList.remove('d-none');
          if (window.app33FloatList) {
            try {
              window.app33FloatList.ensureRoom(campo);
              window.app33FloatList.attach(lista);
              window.app33FloatList.place(campo, lista);
            } catch (e) {}
          }
        });
    }, 220);
  });

  // ⚠️ La lista puede colgar del <body> (`app33FloatList`): el clic se escucha en las DOS.
  function clic(ev) {
    var op = ev.target.closest('[data-pvsend-pick]');
    if (op) {
      try { añade(JSON.parse(op.getAttribute('data-pvsend-pick'))); } catch (e) {}
      lista.classList.add('d-none');
      campo.value = '';
      return;
    }
    var del = ev.target.closest('[data-pvsend-del]');
    if (del) { del.closest('[data-pvsend-row]').remove(); repasaVacio(); }
  }
  raiz.addEventListener('click', clic);
  lista.addEventListener('click', clic);

  // El «+»: crea el tercero con lo escrito y lo deja elegido.
  raiz.querySelector('[data-pvsend-new]').addEventListener('click', function () {
    var nombre = (campo.value || '').trim();
    if (!nombre) { campo.focus(); return; }
    var cuerpo = new URLSearchParams();
    cuerpo.append('nick', nombre);
    cuerpo.append('force_new', '1');
    var cab = { 'X-Requested-With': 'XMLHttpRequest' };
    if (csrf()) cab['X-CSRFToken'] = csrf();
    fetch(raiz.getAttribute('data-create-url'), { method: 'POST', headers: cab, body: cuerpo })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (js) {
        if (!js || !js.id) { alert((js && js.error) || 'No se pudo crear el tercero.'); return; }
        // ⚠️ Sin correo no se le puede escribir: se pide aquí mismo.
        var correo = (prompt('¿A qué correo se lo mandamos?') || '').trim();
        if (!correo) { alert('Sin correo no se le puede mandar.'); return; }
        añade({ name: nombre, email: correo, promoter_id: js.id, kind_label: 'Nuevo' });
        campo.value = '';
      });
  });

  /* ---------- LA PREVISUALIZACIÓN (la compone el servidor) ---------- */
  function pintaPrevia() {
    postJson(raiz.getAttribute('data-preview-url'), { note: (nota && nota.value) || '' })
      .then(function (js) {
        if (!js || !js.ok) return;
        previa.innerHTML = js.html || '';
        if (asunto && js.subject) asunto.textContent = js.subject;
      });
  }
  if (nota) nota.addEventListener('input', function () {
    clearTimeout(esperaPrevia);
    esperaPrevia = setTimeout(pintaPrevia, 350);
  });
  pintaPrevia();

  /* ---------- ENVIAR ---------- */
  raiz.querySelector('[data-pvsend-send]').addEventListener('click', function (ev) {
    var boton = ev.target.closest('[data-pvsend-send]');
    var filas = Array.prototype.slice.call(elegidos.querySelectorAll('[data-pvsend-row]')).map(function (n) {
      return { name: n.getAttribute('data-name'), email: n.getAttribute('data-email'),
               phone: n.getAttribute('data-phone'), channel: 'EMAIL' };
    });
    if (!filas.length) { alert('Elige a quién se le manda.'); return; }
    boton.disabled = true;
    postJson(raiz.getAttribute('data-send-url'), {
      to: filas, note: (nota && nota.value) || '', due_date: (plazo && plazo.value) || ''
    }).then(function (js) {
      boton.disabled = false;
      if (!js || !js.ok) {
        error.textContent = (js && js.error) || 'No se pudo enviar.';
        error.classList.remove('d-none');
        return;
      }
      if ((js.errors || []).length) {
        error.innerHTML = '<strong>Se ha mandado a ' + js.sent + '.</strong> No salió para: '
          + esc(js.errors.join(' · '));
        error.classList.remove('d-none');
        return;
      }
      window.location.href = js.url || raiz.getAttribute('data-done-url');
    });
  });
})();
