/* INVITACIONES CORPORATIVAS · la pantalla
   · Mis listas de invitados: se abren, se les añade gente (buscando entre los terceros o creando
     uno nuevo), se sube un fichero y se quita a alguien.
   · Las invitaciones: vista previa, enviar (por tandas) y cómo va.

   ⚠️ TODO por DELEGACIÓN en `document`: las zonas se repintan al vuelo, así que un listener pegado
   a un nodo se moriría con él (la regla de la casa).
   ⚠️ El token CSRF lo pone `csrf.js` en cada `fetch`: aquí no hay que hacer nada.
*/
(function () {
  'use strict';
  var root = document.querySelector('[data-ci]');
  if (!root) return;

  function url(attr, marca, valor) {
    return (root.getAttribute(attr) || '').replace(marca, encodeURIComponent(valor));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function post(u, fd) {
    return fetch(u, { method: 'POST', body: fd || new FormData() }).then(function (r) { return r.json(); });
  }
  /* El mismo POST pero con JSON (lo que va y viene de la revisión del fichero). */
  function post2(u, payload) {
    return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida del servidor.' }; }); });
  }

  /* ---------- los invitados de una lista ---------- */

  /* ⚠️⚠️ LO QUE SE LEE ES EL **NICK** (así llamamos nosotros a esa persona) y, debajo y más
     pequeño, **SU VINCULACIÓN con su logo o su foto** — lo pidió Dani, y es lo mismo que se enseña
     en el resto de la app. El nick es clicable (lleva a su ficha) pero **NO se pinta en azul**: va
     en el color del texto, como el resto de la lista, y solo se subraya al pasar por encima.
     ⚠️ Y dos marcas, a la derecha: el TRIÁNGULO cuando el último correo rebotó (o la dirección no
     existe) y el SOBRE TACHADO cuando le han llegado los últimos y no ha abierto ninguno. */
  function marcaCorreo(g) {
    if (g.mail_status === 'error') {
      var qué = g.mail_hard ? 'Ese correo no existe (lo rechazó el servidor)' : 'El último correo no le llegó';
      return '<span class="ci-guest__mark ci-guest__mark--bad" title="' + esc(qué + (g.mail_error ? ' · ' + g.mail_error : '')) + '">' +
        '<i class="fa fa-triangle-exclamation"></i></span>';
    }
    if (g.mail_status === 'unopened') {
      return '<span class="ci-guest__mark ci-guest__mark--quiet" title="' + esc('No ha abierto los últimos ' + g.mail_sent + ' correos') + '">' +
        '<span class="ci-slash"><i class="fa fa-envelope"></i><i class="fa fa-slash"></i></span></span>';
    }
    return '';
  }
  function filaInvitado(g) {
    /* ⚠️ Sin correo, la fila lleva su botón de arreglarlo (uno a uno). Todo lo clicable de dentro
       va en `<button>` o en un `<a>` suelto: un `<a>` dentro de otro parte el HTML (la regla de la
       casa), así que la fila NO es un enlace. */
    var vinc = g.link
      ? '<small class="ci-guest__link">' +
          (g.link.logo_url ? '<img src="' + esc(g.link.logo_url) + '" alt="" loading="lazy">'
                           : '<i class="fa ' + esc(g.link.icon || 'fa-link') + ' fa-fw"></i>') +
          '<span>' + esc(g.link.label) + (g.link.relation ? ' · ' + esc(g.link.relation) : '') + '</span></small>'
      : (g.email ? '<small><i class="fa fa-envelope fa-fw"></i>' + esc(g.email) + '</small>'
                 /* Sin correo y sin vinculación, el teléfono es lo único que dice quién es. */
                 : (g.phone ? '<small><i class="fa fa-phone fa-fw"></i>' + esc(g.phone) + '</small>' : ''));
    return '<div class="ci-guest' + (g.email ? '' : ' is-missing') + '"' +
      ' data-ci-name="' + esc(g.name || g.nick) + '" data-ci-phone="' + esc(g.phone || '') + '">' +
      (g.logo_url ? '<img src="' + esc(g.logo_url) + '" alt="" loading="lazy">'
                  : '<span class="ci-guest__ph"><i class="fa fa-user"></i></span>') +
      '<span class="ci-guest__t">' +
        (g.promoter_url ? '<a class="ci-guest__nick" href="' + esc(g.promoter_url) + '" title="' + esc(g.name || g.nick) + '"><b>' + esc(g.nick) + '</b></a>'
                        : '<b class="ci-guest__nick">' + esc(g.nick) + '</b>') +
        vinc +
      '</span>' +
      marcaCorreo(g) +
      (g.email ? '' :
        '<button type="button" class="btn btn-sm btn-warning ci-guest__fix" data-ci-fix-one="' + esc(g.id) + '">' +
          '<i class="fa fa-envelope-circle-check me-1"></i>Falta el correo</button>') +
      '<button type="button" class="btn btn-sm btn-link text-danger ci-guest__x" data-ci-remove="' + esc(g.id) + '" title="Quitar de la lista"><i class="fa fa-xmark"></i></button>' +
      '</div>';
  }

  function pintaInvitados(listId, datos) {
    var caja = document.querySelector('[data-ci-list="' + listId + '"] [data-ci-guests]');
    if (!caja) return;
    var filas = (datos && datos.rows) || [];
    if (!filas.length) {
      caja.innerHTML = '<div class="text-muted small">Todavía no hay nadie en esta lista.</div>';
    } else {
      caja.innerHTML = '<div class="ci-guests">' + filas.map(filaInvitado).join('') + '</div>';
    }
    // El contador de la cabecera, al día sin recargar la página.
    var cab = document.querySelector('[data-ci-list="' + listId + '"] .accordion-button .badge');
    if (cab && datos) cab.textContent = datos.count + ' invitado' + (datos.count === 1 ? '' : 's');
    // Y lo que falta por arreglar (la galleta ámbar y el botón de «Arreglar los N sin correo»).
    if (datos) {
      var faltan = Math.max(0, (datos.count || 0) - (datos.with_email || 0));
      var item = document.querySelector('[data-ci-list="' + listId + '"]');
      var aviso = item && item.querySelector('.accordion-button .text-bg-warning');
      if (aviso) {
        aviso.textContent = faltan + ' sin correo';
        aviso.classList.toggle('d-none', !faltan);
      }
      var botonFix = item && item.querySelector('[data-ci-fix-open]');
      if (botonFix) {
        botonFix.classList.toggle('d-none', !faltan);
        var n = botonFix.querySelector('[data-ci-fix-count]');
        if (n) n.textContent = faltan;
      }
      // Y las galletas de «no le llega» / «sin abrir», al día sin recargar.
      [['[data-ci-bounced]', '[data-ci-bounced-n]', datos.bounced],
       ['[data-ci-quiet]', '[data-ci-quiet-n]', datos.quiet]].forEach(function (par) {
        var gal = item && item.querySelector(par[0]); if (!gal) return;
        var cuantos = par[2] || 0;
        gal.classList.toggle('d-none', !cuantos);
        var e = gal.querySelector(par[1]); if (e) e.textContent = cuantos;
      });
    }
  }

  function cargaInvitados(listId) {
    var caja = document.querySelector('[data-ci-list="' + listId + '"] [data-ci-guests]');
    if (!caja || caja.dataset.ciLoaded === '1') return;
    fetch(url('data-guests-url-tpl', '__LIST__', listId)).then(function (r) { return r.json(); })
      .then(function (js) {
        if (!js || !js.ok) { caja.innerHTML = '<div class="text-danger small">No se pudieron cargar los invitados.</div>'; return; }
        caja.dataset.ciLoaded = '1';
        pintaInvitados(listId, js);
      }).catch(function () {
        caja.innerHTML = '<div class="text-danger small">No se pudieron cargar los invitados.</div>';
      });
  }

  document.addEventListener('click', function (ev) {
    var abre = ev.target.closest('[data-ci-load]');
    if (abre) { cargaInvitados(abre.getAttribute('data-ci-load')); return; }

    var quita = ev.target.closest('[data-ci-remove]');
    if (quita) {
      var item = quita.closest('[data-ci-list]');
      var lid = item ? item.getAttribute('data-ci-list') : '';
      post(url('data-remove-url-tpl', '__GUEST__', quita.getAttribute('data-ci-remove')))
        .then(function (js) {
          if (!js || !js.ok) { alert((js && js.error) || 'No se pudo quitar.'); return; }
          pintaInvitados(lid, js);
        });
      return;
    }

    var ren = ev.target.closest('[data-ci-rename]');
    if (ren) {
      var nuevo = prompt('¿Cómo se llama la lista?', ren.getAttribute('data-ci-name') || '');
      if (nuevo == null) return;
      nuevo = nuevo.trim();
      if (!nuevo) { alert('Ponle un nombre a la lista.'); return; }
      var fd = new FormData(); fd.append('name', nuevo);
      post(url('data-rename-url-tpl', '__LIST__', ren.getAttribute('data-ci-rename')), fd)
        .then(function (js) {
          if (!js || !js.ok) { alert((js && js.error) || 'No se pudo guardar.'); return; }
          window.location.reload();
        });
      return;
    }

    /* AÑADIR A ALGUIEN: de qué lista se abre se decide EN EL CLIC (con `modal_stack.js` por medio,
       `shown.bs.modal` no siempre llega — la trampa que ya documenta la guía). */
    var addBtn = ev.target.closest('[data-ci-add-open]');
    if (addBtn) {
      var modal = document.getElementById('corpGuestModal');
      if (!modal || !window.bootstrap) return;
      modal.dataset.ciList = addBtn.getAttribute('data-ci-add-open');
      modal.querySelector('[data-ci-search]').value = '';
      modal.querySelector('[data-ci-results]').innerHTML = '';
      ['[data-ci-new-name]', '[data-ci-new-email]', '[data-ci-new-phone]'].forEach(function (s) {
        var i = modal.querySelector(s); if (i) i.value = '';
      });
      var err = modal.querySelector('[data-ci-guest-error]'); if (err) err.classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(modal).show();
      return;
    }

    var pick = ev.target.closest('[data-ci-pick]');
    if (pick) {
      var m = document.getElementById('corpGuestModal');
      var fd2 = new FormData();
      fd2.append('promoter_id', pick.getAttribute('data-ci-pick'));
      fd2.append('name', pick.getAttribute('data-ci-pick-name') || '');
      fd2.append('email', pick.getAttribute('data-ci-pick-email') || '');
      fd2.append('phone', pick.getAttribute('data-ci-pick-phone') || '');
      añade(m, fd2);
      return;
    }

    if (ev.target.closest('[data-ci-new-save]')) {
      var mm = document.getElementById('corpGuestModal');
      var fd3 = new FormData();
      fd3.append('name', (mm.querySelector('[data-ci-new-name]').value || '').trim());
      fd3.append('email', (mm.querySelector('[data-ci-new-email]').value || '').trim());
      fd3.append('phone', (mm.querySelector('[data-ci-new-phone]').value || '').trim());
      añade(mm, fd3);
      return;
    }

    /* VISTA PREVIA del correo */
    var prev = ev.target.closest('[data-ci-preview]');
    if (prev) {
      var pm = document.getElementById('corpPreviewModal');
      if (!pm || !window.bootstrap) return;
      pm.querySelector('[data-ci-preview-frame]').src =
        url('data-preview-url-tpl', '__INV__', prev.getAttribute('data-ci-preview'));
      bootstrap.Modal.getOrCreateInstance(pm).show();
      return;
    }

    /* ENVIAR */
  });

  function añade(modal, fd) {
    var lid = modal ? (modal.dataset.ciList || '') : '';
    if (!lid) return;
    var err = modal.querySelector('[data-ci-guest-error]');
    if (err) err.classList.add('d-none');
    post(url('data-add-url-tpl', '__LIST__', lid), fd).then(function (js) {
      if (!js || !js.ok) {
        if (err) { err.textContent = (js && js.error) || 'No se pudo añadir.'; err.classList.remove('d-none'); }
        return;
      }
      pintaInvitados(lid, js);
      // Se deja el pop-up abierto: lo normal es añadir a varios seguidos.
      modal.querySelector('[data-ci-search]').value = '';
      modal.querySelector('[data-ci-results]').innerHTML = '';
      ['[data-ci-new-name]', '[data-ci-new-email]', '[data-ci-new-phone]'].forEach(function (s) {
        var i = modal.querySelector(s); if (i) i.value = '';
      });
    });
  }

  /* ---------- buscar entre los terceros ---------- */
  var tBusca = null;
  document.addEventListener('input', function (ev) {
    if (ev.target.closest('[data-ci-search]')) {
      clearTimeout(tBusca);
      var q = ev.target.value;
      tBusca = setTimeout(function () { busca(q); }, 250);
      return;
    }
    // El buscador de ACTIVIDADES del pop-up de nueva invitación (filtra lo que ya está pintado).
    if (ev.target.closest('[data-ci-act-search]')) {
      var t = (ev.target.value || '').toLowerCase().trim();
      document.querySelectorAll('[data-ci-act-text]').forEach(function (el) {
        var ok = !t || (el.getAttribute('data-ci-act-text') || '').indexOf(t) >= 0;
        el.classList.toggle('d-none', !ok);
      });
    }
  });

  function busca(q) {
    var caja = document.querySelector('[data-ci-results]');
    if (!caja) return;
    if (!(q || '').trim()) { caja.innerHTML = ''; return; }
    fetch(root.getAttribute('data-search-url') + '?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (filas) {
        filas = filas || [];
        if (!filas.length) { caja.innerHTML = '<div class="text-muted small">Nadie con ese nombre.</div>'; return; }
        caja.innerHTML = filas.slice(0, 12).map(function (p) {
          var correo = p.contact_email || '';
          return '<button type="button" class="ci-result" data-ci-pick="' + esc(p.id) + '"' +
            ' data-ci-pick-name="' + esc(p.label || '') + '"' +
            ' data-ci-pick-email="' + esc(correo) + '"' +
            ' data-ci-pick-phone="' + esc(p.contact_phone || '') + '">' +
            (p.logo_url ? '<img src="' + esc(p.logo_url) + '" alt="">' : '<span class="ci-result__ph"><i class="fa fa-user"></i></span>') +
            '<span><b>' + esc(p.label || '') + '</b>' +
            (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') +
            (correo ? '<small><i class="fa fa-envelope fa-fw"></i>' + esc(correo) + '</small>'
                    : '<small class="text-warning"><i class="fa fa-triangle-exclamation fa-fw"></i>Sin correo en su ficha</small>') +
            '</span></button>';
        }).join('');
      }).catch(function () { caja.innerHTML = '<div class="text-danger small">No se pudo buscar.</div>'; });
  }

  /* ══════════ SUBIR UN FICHERO · LA REVISIÓN ══════════
     ⚠️ Nada se crea a ciegas: el fichero se LEE y se enseña lo que trae. Antes esto daba de alta
     los terceros en el mismo golpe y salían fichas raras en Terceros (con el nombre de su empresa,
     o sin correo) sin que nadie pudiera evitarlo. */
  var imp = { listId: '', columns: [], fileRows: [], rows: [], fields: [], counts: {},
              basicos: [], nuevos: [], idx: 0, creados: 0, anadidos: 0 };

  function impRoot() { return document.querySelector('[data-ci-imp]'); }
  function impError(msg) {
    var caja = impRoot() && impRoot().querySelector('[data-ci-imp-error]');
    if (!caja) return;
    caja.textContent = msg || '';
    caja.classList.toggle('d-none', !msg);
  }

  function impPaso(nombre) {
    var root = impRoot();
    if (!root) return;
    var pasos = Array.prototype.slice.call(root.querySelectorAll('[data-ci-imp-step]'));
    pasos.forEach(function (el) { el.classList.toggle('d-none', el.getAttribute('data-ci-imp-step') !== nombre); });
    impError('');
    /* La cabecera roja con un icono por paso: el pintor común de la casa. */
    if (window.app33WizHead) {
      window.app33WizHead.fromSteps(root.querySelector('[data-ci-imp-steps]'), pasos,
        root.querySelector('[data-ci-imp-step="' + nombre + '"]'));
    }
    impPie(nombre);
  }

  function impPie(paso) {
    var root = impRoot();
    if (!root) return;
    var atras = root.querySelector('[data-ci-imp-back]');
    var caja = root.querySelector('[data-ci-imp-actions]');
    if (!caja || !atras) return;
    var marcados = impMarcados().length;
    if (paso === 'columnas') {
      atras.classList.remove('d-none');
      atras.innerHTML = '<i class="fa fa-arrow-left me-1"></i>Volver a la revisión';
      caja.innerHTML = '<button type="button" class="btn btn-danger" data-ci-imp-reread>' +
        '<i class="fa fa-rotate me-1"></i>Volver a leer el fichero con esto</button>';
      return;
    }
    if (paso === 'alta') {
      atras.classList.remove('d-none');
      atras.innerHTML = '<i class="fa fa-arrow-left me-1"></i>Volver a la revisión';
      caja.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-ci-imp-skip>' +
          'Saltarme a esta persona<i class="fa fa-arrow-right ms-1"></i></button>' +
        '<button type="button" class="btn btn-danger" data-ci-imp-save>' +
          '<i class="fa fa-user-plus me-1"></i>Crear y añadir a la lista</button>';
      return;
    }
    atras.classList.remove('d-none');
    atras.innerHTML = '<i class="fa fa-table-columns me-1"></i>¿No se ha leído bien? Revisar las columnas';
    var nuevos = imp.rows.filter(function (r) { return r.status === 'nuevo'; }).length;
    var conocidos = imp.rows.filter(function (r) { return r.status === 'tercero'; }).length;
    caja.innerHTML =
      (nuevos ? '<button type="button" class="btn btn-outline-danger" data-ci-imp-start-new>' +
                  '<i class="fa fa-user-plus me-1"></i>Dar de alta ' +
                  (nuevos === 1 ? 'al que falta' : 'a los ' + nuevos + ' que faltan') + '</button>' : '') +
      /* El botón de añadir solo se pinta si hay a quién: con el fichero entero de gente nueva, un
         «Añadir los 0 marcados» apagado no dice nada. */
      (conocidos ? '<button type="button" class="btn btn-danger" data-ci-imp-add' + (marcados ? '' : ' disabled') + '>' +
        '<i class="fa fa-check me-1"></i>' +
        (marcados === 0 ? 'Añadir los marcados' : (marcados === 1 ? 'Añadir al marcado' : 'Añadir los ' + marcados + ' marcados')) +
        '</button>' : '') +
      /* Cuando ya no queda nada que hacer, el pie tiene que decirlo y dejar cerrar. */
      (!nuevos && !conocidos ? '<button type="button" class="btn btn-danger" data-bs-dismiss="modal">' +
        '<i class="fa fa-check me-1"></i>Listo</button>' : '');
  }

  function impMarcados() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-ci-imp-pick]:checked'))
      .map(function (c) { return parseInt(c.getAttribute('data-ci-imp-pick'), 10); })
      .filter(function (i) { return !isNaN(i); });
  }

  function impFila(r) {
    var p = r.promoter || null;
    var delFichero = [r.name, r.email, r.phone].filter(Boolean).map(esc).join(' · ');
    var extra = (r.extra || []).map(function (x) {
      return '<span class="ci-imp__x"><b>' + esc(x.label) + ':</b> ' + esc(x.value) + '</span>';
    }).join('');
    var foto = (p && p.logo_url)
      ? '<img src="' + esc(p.logo_url) + '" alt="" loading="lazy">'
      : '<span class="ci-imp__ph"><i class="fa fa-user"></i></span>';
    var cuerpo = '<span class="ci-imp__t"><b>' + esc((p && p.name) || r.name || r.email || 'Sin nombre') + '</b>' +
      (p && p.email ? '<small><i class="fa fa-envelope fa-fw"></i>' + esc(p.email) + '</small>' : '') +
      (!p && r.email ? '<small><i class="fa fa-envelope fa-fw"></i>' + esc(r.email) + '</small>' : '') +
      (!p && !r.email ? '<small class="text-warning"><i class="fa fa-triangle-exclamation fa-fw"></i>Sin correo: no se le podrá invitar</small>' : '') +
      (p ? '<small class="text-muted"><i class="fa fa-file-lines fa-fw"></i>En el fichero: ' + delFichero + '</small>' : '') +
      (r.why ? '<small class="text-muted"><i class="fa fa-link fa-fw"></i>Lo tenemos ' + esc(r.why) + '</small>' : '') +
      (extra ? '<small class="ci-imp__xs">' + extra + '</small>' : '') +
      '</span>';
    if (r.status === 'lista') {
      return '<div class="ci-imp__row is-done">' + foto + cuerpo +
        '<span class="badge text-bg-light border"><i class="fa fa-check me-1"></i>Ya añadido</span></div>';
    }
    if (r.status === 'tercero') {
      return '<label class="ci-imp__row is-pick">' +
        '<input type="checkbox" data-ci-imp-pick="' + r.i + '"' + (r.sure ? ' checked' : '') + '>' +
        foto + cuerpo +
        (p ? '<span class="ci-imp__go"><i class="fa fa-id-card"></i></span>' : '') + '</label>';
    }
    return '<div class="ci-imp__row">' + foto + cuerpo +
      '<span class="badge text-bg-warning-subtle border text-dark">Hay que darlo de alta</span></div>';
  }

  function impGrupo(titulo, icono, clase, filas, ayuda, conMarcar) {
    if (!filas.length) return '';
    return '<section class="ci-imp__g ' + clase + '">' +
      '<h6 class="ci-imp__gh"><i class="fa ' + icono + ' me-2"></i>' + esc(titulo) +
        '<span class="badge text-bg-light border ms-2">' + filas.length + '</span>' +
        (conMarcar ? '<span class="ci-imp__gb">' +
          '<button type="button" class="btn btn-sm btn-link p-0" data-ci-imp-all="1">Marcar todos</button>' +
          '<button type="button" class="btn btn-sm btn-link p-0 text-muted" data-ci-imp-all="0">Ninguno</button>' +
          '</span>' : '') +
      '</h6>' +
      (ayuda ? '<p class="small text-muted mb-2">' + ayuda + '</p>' : '') +
      filas.map(impFila).join('') + '</section>';
  }

  function pintaRevision() {
    var root = impRoot();
    if (!root) return;
    var c = imp.counts || {};
    var sum = root.querySelector('[data-ci-imp-sum]');
    if (sum) {
      var hecho = [];
      if (imp.anadidos) hecho.push('<b>' + imp.anadidos + '</b> ' + (imp.anadidos === 1 ? 'añadido' : 'añadidos') + ' a la lista');
      if (imp.creados) hecho.push('<b>' + imp.creados + '</b> ' + (imp.creados === 1 ? 'ficha nueva' : 'fichas nuevas') + ' en Terceros');
      sum.innerHTML = '<div class="ci-imp__sumline"><i class="fa fa-file-lines me-2"></i>' +
        '<b>' + (c.total || 0) + '</b> ' + ((c.total === 1) ? 'fila' : 'filas') + ' en el fichero' +
        (c.sin_correo ? ' · <span class="text-warning"><i class="fa fa-triangle-exclamation me-1"></i>' +
          c.sin_correo + ' sin correo</span>' : '') + '</div>' +
        (hecho.length ? '<div class="ci-imp__sumline ci-imp__sumline--ok mt-2">' +
          '<i class="fa fa-circle-check me-2"></i>' + hecho.join(' · ') + '</div>' : '');
    }
    var caja = root.querySelector('[data-ci-imp-groups]');
    var porEstado = function (e) { return imp.rows.filter(function (r) { return r.status === e; }); };
    caja.innerHTML =
      impGrupo('Ya los tenemos en Terceros', 'fa-address-book', 'is-known', porEstado('tercero'),
        'Marca a quién añades. Los que casan por su <strong>correo</strong>, su DNI o su teléfono vienen ya ' +
        'marcados; los que solo casan <strong>por el nombre</strong>, no: dos personas pueden llamarse igual.', true) +
      impGrupo('Hay que darlos de alta', 'fa-user-plus', 'is-new', porEstado('nuevo'),
        'No los tenemos en Terceros. Se revisan <strong>uno a uno</strong> antes de crear su ficha.', false) +
      impGrupo('Ya están en esta lista', 'fa-check-double', 'is-done', porEstado('lista'),
        'No hace falta hacer nada con ellos.', false);
    impPie('revisar');
  }

  function pintaColumnas() {
    var root = impRoot();
    var tb = root && root.querySelector('[data-ci-imp-cols]');
    if (!tb) return;
    tb.innerHTML = (imp.columns || []).map(function (col) {
      var opciones = '<option value="">— No es un dato de la ficha (se guarda como dato extra) —</option>' +
        '<option value="__ignore__">Omitir esta columna</option>' +
        (imp.fields || []).map(function (f) {
          return '<option value="' + esc(f.key) + '"' + (col.field === f.key ? ' selected' : '') + '>' + esc(f.label) + '</option>';
        }).join('');
      return '<tr><td><b>' + esc(col.header || '') + '</b></td>' +
        '<td class="small text-muted">' + esc((col.samples || []).join(' · ')) + '</td>' +
        '<td><select class="form-select form-select-sm" data-ci-imp-col="' + col.index + '">' + opciones + '</select></td></tr>';
    }).join('');
  }

  function pintaAlta() {
    var root = impRoot();
    var caja = root && root.querySelector('[data-ci-imp-new]');
    if (!caja) return;
    var r = imp.nuevos[imp.idx];
    if (!r) {
      caja.innerHTML = '<div class="alert alert-success mb-0"><i class="fa fa-circle-check me-2"></i>' +
        'Listo: no queda nadie por revisar.</div>';
      return;
    }
    var etiqueta = {};
    (imp.fields || []).forEach(function (f) { etiqueta[f.key] = f.label; });
    var basicos = imp.basicos.length ? imp.basicos : ['nick', 'first_name', 'last_name', 'contact_email', 'contact_phone'];
    /* Si el fichero trae el nombre completo en UNA columna (lo normal en un listado de invitados),
       se PROPONE partido en nombre y apellidos: así la ficha nace como las demás y se encuentra
       buscando por el apellido. Se ve y se corrige aquí mismo, que es para lo que está esta pantalla. */
    if (!(r.values || {}).first_name && !(r.values || {}).last_name) {
      var partes = String((r.values || {}).nick || '').trim().split(/\s+/);
      if (partes.length >= 2) {
        r.values.first_name = partes[0];
        r.values.last_name = partes.slice(1).join(' ');
        r.propuesto = true;
      }
    }
    var otros = Object.keys(r.values || {}).filter(function (k) { return basicos.indexOf(k) < 0; });
    function campo(k, ancho) {
      var val = (r.values || {})[k] || '';
      var obliga = (k === 'contact_email');
      return '<div class="col-12 col-md-' + (ancho || 6) + '">' +
        '<label class="form-label small">' + esc(etiqueta[k] || k) +
          (obliga ? ' <span class="text-muted">(sin él no se le puede invitar)</span>' : '') + '</label>' +
        '<input class="form-control form-control-sm" data-ci-imp-f="' + esc(k) + '" value="' + esc(val) + '">' +
        '</div>';
    }
    caja.innerHTML =
      '<div class="ci-imp__step"><span class="badge text-bg-light border">' + (imp.idx + 1) + ' de ' + imp.nuevos.length + '</span>' +
        '<b class="ms-2">' + esc(r.name || r.email || 'Sin nombre') + '</b>' +
        '<span class="text-muted small ms-2">tal y como viene en el fichero</span></div>' +
      '<div class="row g-2 mt-1">' +
        basicos.map(function (k, n) { return campo(k, n === 0 ? 12 : 6); }).join('') +
        otros.map(function (k) { return campo(k); }).join('') +
      '</div>' +
      ((r.extra || []).length
        ? '<div class="ci-imp__extra mt-3"><div class="fw-semibold small mb-2">' +
            '<i class="fa fa-table-columns me-1"></i>Lo demás que trae el fichero' +
            '<span class="text-muted fw-normal"> — se guarda en su ficha como dato extra, con el nombre de su columna</span></div>' +
            '<div class="row g-2">' + r.extra.map(function (x, n) {
              return '<div class="col-12 col-md-6"><label class="form-label small">' + esc(x.label) + '</label>' +
                '<input class="form-control form-control-sm" data-ci-imp-x="' + n + '" value="' + esc(x.value) + '"></div>';
            }).join('') + '</div></div>'
        : '') +
      (r.propuesto ? '<div class="form-text"><i class="fa fa-wand-magic-sparkles me-1"></i>' +
          'El nombre y los apellidos se han separado del nombre que trae el fichero: cámbialos si no es así.</div>' : '') +
      '<div class="form-text mt-2"><i class="fa fa-circle-info me-1"></i>Se crea su ficha en ' +
        '<strong>Terceros</strong> y queda añadido a la lista. Si ese correo ya estuviera en la base, ' +
        'se usa esa ficha en vez de crear otra.</div>';
    impPie('alta');
  }

  function impAbre(listId, js) {
    imp.listId = listId;
    imp.columns = js.columns || [];
    imp.fileRows = js.file_rows || [];
    imp.rows = js.rows || [];
    imp.fields = js.fields || [];
    imp.basicos = js.basic_fields || [];
    imp.counts = js.counts || {};
    imp.nuevos = []; imp.idx = 0; imp.creados = 0; imp.anadidos = 0;
    var root = impRoot();
    if (!root || !window.bootstrap) return;
    var f = root.querySelector('[data-ci-imp-file]');
    if (f) f.textContent = (js.filename || '') + (js.sheet_rows ? ' · ' + js.sheet_rows + ' filas leídas' : '');
    pintaColumnas();
    pintaRevision();
    impPaso('revisar');
    bootstrap.Modal.getOrCreateInstance(root.closest('.modal')).show();
  }

  function impRevisaDeNuevo() {
    var root = impRoot();
    (imp.columns || []).forEach(function (col) {
      var sel = root.querySelector('[data-ci-imp-col="' + col.index + '"]');
      if (sel) col.field = sel.value;
    });
    impError('');
    post2(url('data-import-review-url-tpl', '__LIST__', imp.listId),
          { columns: imp.columns, file_rows: imp.fileRows }).then(function (js) {
      if (!js || !js.ok) { impError((js && js.error) || 'No se pudo volver a leer el fichero.'); return; }
      imp.columns = js.columns || imp.columns;
      imp.rows = js.rows || [];
      imp.counts = js.counts || {};
      pintaColumnas();
      pintaRevision();
      impPaso('revisar');
    });
  }

  function impAnadeMarcados() {
    var elegidos = impMarcados();
    if (!elegidos.length) return;
    var items = elegidos.map(function (i) {
      var r = imp.rows[i] || {};
      return { promoter_id: (r.promoter || {}).id || '', name: r.name || '', email: r.email || '', phone: r.phone || '' };
    }).filter(function (x) { return x.promoter_id; });
    post2(url('data-import-add-url-tpl', '__LIST__', imp.listId), { items: items }).then(function (js) {
      if (!js || !js.ok) { impError((js && js.error) || 'No se pudieron añadir.'); return; }
      imp.anadidos += (js.added || 0);
      pintaInvitados(imp.listId, js);
      // Los que acaban de entrar pasan a «ya están en la lista»: la revisión dice la verdad.
      elegidos.forEach(function (i) { if (imp.rows[i]) imp.rows[i].status = 'lista'; });
      imp.counts.tercero = imp.rows.filter(function (r) { return r.status === 'tercero'; }).length;
      imp.counts.lista = imp.rows.filter(function (r) { return r.status === 'lista'; }).length;
      pintaRevision();
      impError('');
    });
  }

  function impEmpiezaAltas() {
    imp.nuevos = imp.rows.filter(function (r) { return r.status === 'nuevo'; });
    imp.idx = 0;
    if (!imp.nuevos.length) return;
    impPaso('alta');
    pintaAlta();
  }

  function impSiguiente() {
    imp.idx += 1;
    if (imp.idx >= imp.nuevos.length) {
      imp.nuevos = [];
      pintaRevision();
      impPaso('revisar');
      impError('');
      return;
    }
    pintaAlta();
  }

  function impGuardaAlta() {
    var root = impRoot();
    var r = imp.nuevos[imp.idx];
    if (!r) return;
    var values = {};
    Array.prototype.slice.call(root.querySelectorAll('[data-ci-imp-f]')).forEach(function (i) {
      var v = (i.value || '').trim();
      if (v) values[i.getAttribute('data-ci-imp-f')] = v;
    });
    var extra = (r.extra || []).map(function (x, n) {
      var i = root.querySelector('[data-ci-imp-x="' + n + '"]');
      return { label: x.label, value: i ? (i.value || '').trim() : x.value };
    }).filter(function (x) { return x.value; });
    if (!Object.keys(values).length && !extra.length) { impError('No hay nada que guardar de esta persona.'); return; }
    post2(url('data-import-new-url-tpl', '__LIST__', imp.listId), { values: values, extra: extra })
      .then(function (js) {
        if (!js || !js.ok) { impError((js && js.error) || 'No se pudo dar de alta.'); return; }
        if (js.created) imp.creados += 1;
        if (js.added) imp.anadidos += 1;
        // La fila deja de estar pendiente (si se vuelve a la revisión, ya no sale como nueva).
        var orig = imp.rows[r.i];
        if (orig) { orig.status = 'lista'; orig.promoter = js.promoter || orig.promoter; }
        imp.counts.nuevo = imp.rows.filter(function (x) { return x.status === 'nuevo'; }).length;
        imp.counts.lista = imp.rows.filter(function (x) { return x.status === 'lista'; }).length;
        pintaInvitados(imp.listId, js);
        impSiguiente();
      });
  }

  /* El fichero: se sube, se lee y se abre la REVISIÓN (no se crea nada todavía). */
  document.addEventListener('change', function (ev) {
    var inp = ev.target.closest('[data-ci-file]');
    if (!inp || !inp.files || !inp.files[0]) return;
    var lid = inp.getAttribute('data-ci-file');
    var caja = document.querySelector('[data-ci-list="' + lid + '"] [data-ci-guests]');
    if (caja) caja.innerHTML = '<div class="text-muted small"><i class="fa fa-spinner fa-spin me-1"></i>Leyendo el fichero…</div>';
    var fd = new FormData();
    fd.append('file', inp.files[0]);
    inp.value = '';
    post(url('data-import-url-tpl', '__LIST__', lid), fd).then(function (js) {
      if (caja) { caja.dataset.ciLoaded = ''; cargaInvitados(lid); }
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo leer el fichero.'); return; }
      impAbre(lid, js);
    });
  });

  /* Los botones de la revisión (delegados: el modal se repinta entero). */
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-ci-imp]')) return;
    var todos = ev.target.closest('[data-ci-imp-all]');
    if (todos) {
      var on = todos.getAttribute('data-ci-imp-all') === '1';
      Array.prototype.slice.call(document.querySelectorAll('[data-ci-imp-pick]')).forEach(function (c) { c.checked = on; });
      impPie('revisar');
      return;
    }
    if (ev.target.closest('[data-ci-imp-add]')) { impAnadeMarcados(); return; }
    if (ev.target.closest('[data-ci-imp-start-new]')) { impEmpiezaAltas(); return; }
    if (ev.target.closest('[data-ci-imp-reread]')) { impRevisaDeNuevo(); return; }
    if (ev.target.closest('[data-ci-imp-save]')) { impGuardaAlta(); return; }
    if (ev.target.closest('[data-ci-imp-skip]')) { impSiguiente(); return; }
    if (ev.target.closest('[data-ci-imp-back]')) {
      var visible = document.querySelector('[data-ci-imp-step]:not(.d-none)');
      var paso = visible ? visible.getAttribute('data-ci-imp-step') : 'revisar';
      if (paso === 'revisar') { pintaColumnas(); impPaso('columnas'); }
      else { pintaRevision(); impPaso('revisar'); }
      return;
    }
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.closest('[data-ci-imp-pick]')) impPie('revisar');
  });

  /* ══════════ LOS QUE NO TIENEN CORREO · UNO A UNO ══════════
     ⚠️ Lo pidió Dani: «que cuando pinches en uno te vaya pasando uno a uno para dejarlo todo
     solucionado, sin tener que salir y volver». Se escribe el correo y se salta al siguiente; el
     que no valga se quita. Al acabar se dice que ya está. */
  var fix = { listId: '', faltan: [], idx: 0, arreglados: 0, quitados: 0 };

  function fixRoot() { return document.querySelector('[data-ci-fix]'); }

  function fixPendientes(listId) {
    var caja = document.querySelector('[data-ci-list="' + listId + '"] [data-ci-guests]');
    if (!caja) return [];
    return Array.prototype.slice.call(caja.querySelectorAll('[data-ci-fix-one]'))
      .map(function (b) {
        /* ⚠️ El nombre y el teléfono salen de los `data-*` de la fila, no de lo PINTADO: la fila
           enseña el nick y su vinculación, y leer el texto se rompería en cuanto cambie el diseño
           (ya pasó: el teléfono dejó de pintarse y aquí llegaba vacío). */
        var fila = b.closest('.ci-guest');
        return { id: b.getAttribute('data-ci-fix-one'),
                 name: (fila && fila.getAttribute('data-ci-name')) || '',
                 phone: (fila && fila.getAttribute('data-ci-phone')) || '',
                 foto: (fila && fila.querySelector('img')) ? fila.querySelector('img').src : '' };
      });
  }

  function fixPinta() {
    var root = fixRoot();
    if (!root) return;
    var caja = root.querySelector('[data-ci-fix-body]');
    var pie = root.querySelectorAll('[data-ci-fix-drop], [data-ci-fix-skip], [data-ci-fix-save]');
    var g = fix.faltan[fix.idx];
    if (!g) {
      var hecho = [];
      if (fix.arreglados) hecho.push('<b>' + fix.arreglados + '</b> con su correo');
      if (fix.quitados) hecho.push('<b>' + fix.quitados + '</b> fuera de la lista');
      /* ⚠️ Al acabar la vuelta puede quedar gente sin correo: los que se han saltado y —si se entró
         pinchando en uno del medio— los de antes. Se dice CUÁNTOS quedan y se sigue con ellos, que
         es lo que se pidió: hasta dejarlos todos resueltos. */
      var quedan = fixPendientes(fix.listId);
      caja.innerHTML = (quedan.length
        ? '<div class="alert alert-warning mb-0"><i class="fa fa-triangle-exclamation me-2"></i>' +
            'Todavía ' + (quedan.length === 1 ? 'queda <b>1</b> sin correo' : 'quedan <b>' + quedan.length + '</b> sin correo') + '.' +
            (hecho.length ? '<div class="small mt-1">' + hecho.join(' · ') + '</div>' : '') +
            '<button type="button" class="btn btn-sm btn-warning mt-2" data-ci-fix-again>' +
              '<i class="fa fa-rotate me-1"></i>Seguir con ' + (quedan.length === 1 ? 'el que queda' : 'los que quedan') + '</button>' +
          '</div>'
        : '<div class="alert alert-success mb-0"><i class="fa fa-circle-check me-2"></i>' +
            'Ya está: no queda nadie sin correo.' +
            (hecho.length ? '<div class="small mt-1">' + hecho.join(' · ') + '</div>' : '') + '</div>');
      pie.forEach(function (b) { b.classList.add('d-none'); });
      return;
    }
    pie.forEach(function (b) { b.classList.remove('d-none'); });
    caja.innerHTML =
      '<div class="ci-imp__step mb-2"><span class="badge text-bg-light border">' +
        (fix.idx + 1) + ' de ' + fix.faltan.length + '</span>' +
        '<b class="ms-2">' + esc(g.name || 'Sin nombre') + '</b></div>' +
      '<div class="row g-2">' +
        '<div class="col-12"><label class="form-label small">Correo <span class="text-danger">*</span></label>' +
          '<input class="form-control" type="email" data-ci-fix-email placeholder="correo@dominio.com" autocomplete="off"></div>' +
        '<div class="col-12 col-sm-6"><label class="form-label small">Teléfono</label>' +
          '<input class="form-control form-control-sm" data-ci-fix-phone value="' + esc(g.phone || '') + '"></div>' +
      '</div>' +
      '<div class="form-text mt-2"><i class="fa fa-circle-info me-1"></i>Se guarda también en su ficha de ' +
        '<strong>Terceros</strong> si la tenía vacía. Sin correo no se le puede mandar la invitación.</div>' +
      '<div class="alert alert-danger py-2 px-3 small mt-2 d-none" data-ci-fix-error></div>';
    var input = caja.querySelector('[data-ci-fix-email]');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }

  function fixError(msg) {
    var caja = fixRoot() && fixRoot().querySelector('[data-ci-fix-error]');
    if (!caja) return;
    caja.textContent = msg || '';
    caja.classList.toggle('d-none', !msg);
  }

  function fixAbre(listId, guestId) {
    var modal = document.getElementById('corpFixModal');
    if (!modal || !window.bootstrap) return;
    fix.listId = listId;
    fix.faltan = fixPendientes(listId);
    fix.arreglados = 0; fix.quitados = 0;
    fix.idx = 0;
    if (guestId) {
      var n = fix.faltan.map(function (g) { return g.id; }).indexOf(guestId);
      if (n >= 0) fix.idx = n;      // se empieza por el que se ha pinchado
    }
    fixPinta();
    bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  function fixSiguiente() {
    // ⚠️ Se avanza SIN quitar al de antes de la lista de pendientes: así «1 de 5» sigue contando lo
    // que había, que es lo que la persona ve delante.
    fix.idx += 1;
    fixPinta();
  }

  function fixGuarda() {
    var root = fixRoot();
    var g = fix.faltan[fix.idx];
    if (!g) return;
    var correo = (root.querySelector('[data-ci-fix-email]').value || '').trim();
    var tel = (root.querySelector('[data-ci-fix-phone]').value || '').trim();
    if (!correo) { fixError('Escribe el correo, o sáltatelo si no lo tienes.'); return; }
    var fd = new FormData();
    fd.append('email', correo);
    fd.append('phone', tel);
    post(url('data-fix-url-tpl', '__GUEST__', g.id), fd).then(function (js) {
      if (!js || !js.ok) { fixError((js && js.error) || 'No se pudo guardar.'); return; }
      fix.arreglados += 1;
      pintaInvitados(fix.listId, js);
      fixSiguiente();
    });
  }

  function fixQuita() {
    var g = fix.faltan[fix.idx];
    if (!g) return;
    post(url('data-remove-url-tpl', '__GUEST__', g.id)).then(function (js) {
      if (!js || !js.ok) { fixError((js && js.error) || 'No se pudo quitar.'); return; }
      fix.quitados += 1;
      pintaInvitados(fix.listId, js);
      fixSiguiente();
    });
  }

  document.addEventListener('click', function (ev) {
    var uno = ev.target.closest('[data-ci-fix-one]');
    if (uno) {
      var item = uno.closest('[data-ci-list]');
      fixAbre(item ? item.getAttribute('data-ci-list') : '', uno.getAttribute('data-ci-fix-one'));
      return;
    }
    var todos = ev.target.closest('[data-ci-fix-open]');
    if (todos) { fixAbre(todos.getAttribute('data-ci-fix-open'), ''); return; }
    if (!ev.target.closest('[data-ci-fix]')) return;
    if (ev.target.closest('[data-ci-fix-save]')) { fixGuarda(); return; }
    if (ev.target.closest('[data-ci-fix-skip]')) { fixError(''); fixSiguiente(); return; }
    if (ev.target.closest('[data-ci-fix-drop]')) { fixQuita(); return; }
    if (ev.target.closest('[data-ci-fix-again]')) {
      fix.faltan = fixPendientes(fix.listId);
      fix.idx = 0;
      fixPinta();
      return;
    }
  });

  // El Enter en el correo guarda y pasa al siguiente (es un formulario de una sola línea).
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ev.target.closest('[data-ci-fix-email]')) return;
    ev.preventDefault();
    fixGuarda();
  });

  /* ---------- enviar la invitación (por tandas) ---------- */
  function progreso(invId, texto, clase) {
    var caja = document.querySelector('[data-ci-invite="' + invId + '"] [data-ci-progress]');
    if (!caja) return;
    caja.className = 'ci-card__progress small ' + (clase || 'text-muted');
    caja.innerHTML = texto;
  }

  /* ⚠️⚠️ PINCHAR UNA INVITACIÓN YA ENVIADA ABRE SU FICHA. La tarjeta no puede ser un `<a>` (dentro
     hay enlaces, botones y un formulario, y un `<a>` dentro de otro parte el HTML), así que navega
     este listener — y deja pasar todo lo que ya es clicable por su cuenta. */
  document.addEventListener('click', function (ev) {
    var card = ev.target.closest('[data-ci-open]');
    if (!card) return;
    if (ev.target.closest('a, button, form, input, label, [data-ci-preview]')) return;
    window.location.href = card.getAttribute('data-ci-open');
  });

  /* ⚠️ LA INVITACIÓN SE MANDA DESDE LA PANTALLA PREVIA AL ENVÍO (la común de toda la app), no
     desde la tarjeta: ahí se ve cómo llega el correo, a quién se le manda y se puede mandar una
     prueba antes. Aquí solo queda VIGILAR lo que se está mandando, para que la tarjeta lo diga. */
  function vigila(invId) {
    setTimeout(function () {
      fetch(url('data-status-url-tpl', '__INV__', invId)).then(function (r) { return r.json(); })
        .then(function (js) {
          if (!js || !js.ok) return;
          if (js.terminado) { window.location.reload(); return; }
          progreso(invId, '<i class="fa fa-spinner fa-spin me-1"></i>Enviadas ' + js.enviados + ' de ' + js.total + ' · quedan ' + js.quedan + '…');
          if (js.enviando) { vigila(invId); return; }
          // Si el hilo se ha muerto (un despliegue), se sigue: nadie recibe dos veces.
          post(url('data-continue-url-tpl', '__INV__', invId)).then(function () { vigila(invId); });
        }).catch(function () {});
    }, 4000);
  }

  // Lo que se esté MANDANDO ahora mismo se vigila solo: la tarjeta dice por dónde va y, al
  // terminar, la pantalla se refresca con los números buenos.
  Array.prototype.forEach.call(document.querySelectorAll('[data-ci-status="SENDING"]'), function (c) {
    vigila(c.getAttribute('data-ci-invite'));
  });

  // Si se vuelve del editor con `?invitacion=`, se abre esa tarjeta a la vista.
  var abierta = root.getAttribute('data-open-invite');
  if (abierta) {
    var card = document.querySelector('[data-ci-invite="' + abierta + '"]');
    if (card) {
      card.classList.add('is-focus');
      try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
  }
})();
