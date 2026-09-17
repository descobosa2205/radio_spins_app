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

  /* ---------- los invitados de una lista ---------- */
  function pintaInvitados(listId, datos) {
    var caja = document.querySelector('[data-ci-list="' + listId + '"] [data-ci-guests]');
    if (!caja) return;
    var filas = (datos && datos.rows) || [];
    if (!filas.length) {
      caja.innerHTML = '<div class="text-muted small">Todavía no hay nadie en esta lista.</div>';
    } else {
      caja.innerHTML = '<div class="ci-guests">' + filas.map(function (g) {
        return '<div class="ci-guest">' +
          (g.logo_url ? '<img src="' + esc(g.logo_url) + '" alt="" loading="lazy">'
                      : '<span class="ci-guest__ph"><i class="fa fa-user"></i></span>') +
          '<span class="ci-guest__t">' +
            (g.promoter_url ? '<a href="' + esc(g.promoter_url) + '"><b>' + esc(g.name) + '</b></a>'
                            : '<b>' + esc(g.name) + '</b>') +
            (g.email ? '<small><i class="fa fa-envelope fa-fw"></i>' + esc(g.email) + '</small>'
                     : '<small class="text-warning"><i class="fa fa-triangle-exclamation fa-fw"></i>Sin correo: no se le puede invitar</small>') +
            (g.phone ? '<small><i class="fa fa-phone fa-fw"></i>' + esc(g.phone) + '</small>' : '') +
          '</span>' +
          '<button type="button" class="btn btn-sm btn-link text-danger ci-guest__x" data-ci-remove="' + esc(g.id) + '" title="Quitar de la lista"><i class="fa fa-xmark"></i></button>' +
          '</div>';
      }).join('') + '</div>';
    }
    // El contador de la cabecera, al día sin recargar la página.
    var cab = document.querySelector('[data-ci-list="' + listId + '"] .accordion-button .badge');
    if (cab && datos) cab.textContent = datos.count + ' invitado' + (datos.count === 1 ? '' : 's');
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
    var env = ev.target.closest('[data-ci-send]');
    if (env) { envia(env.getAttribute('data-ci-send'), env); return; }
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

  /* ---------- subir un fichero ---------- */
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
      if (!js || !js.ok) {
        alert((js && js.error) || 'No se pudo importar el fichero.');
        if (caja) { caja.dataset.ciLoaded = ''; cargaInvitados(lid); }
        return;
      }
      pintaInvitados(lid, js);
      if (js.message) alert(js.message);
    });
  });

  /* ---------- enviar la invitación (por tandas) ---------- */
  function progreso(invId, texto, clase) {
    var caja = document.querySelector('[data-ci-invite="' + invId + '"] [data-ci-progress]');
    if (!caja) return;
    caja.className = 'ci-card__progress small ' + (clase || 'text-muted');
    caja.innerHTML = texto;
  }

  function envia(invId, boton) {
    if (!confirm('¿Mandar la invitación? Saldrá desde tu correo.')) return;
    if (boton) { boton.disabled = true; boton.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Enviando…'; }
    progreso(invId, '<i class="fa fa-spinner fa-spin me-1"></i>Enviando…');
    post(url('data-send-url-tpl', '__INV__', invId)).then(function (js) {
      if (!js || !js.ok) {
        if (boton) { boton.disabled = false; boton.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviar'; }
        progreso(invId, '<i class="fa fa-circle-exclamation me-1"></i>' + esc((js && js.error) || 'No se pudo enviar.'), 'text-danger');
        // Si falta configurar el correo, se lleva ahí (es lo único que hay que hacer).
        if (js && js.needs_mail && js.settings_url && confirm(js.error + '\n\n¿Vas a configurarlo ahora?')) {
          window.location.href = js.settings_url;
        } else if (js && js.design_url && confirm((js.error || '') + '\n\n¿Vas a diseñarlo ahora?')) {
          window.location.href = js.design_url;
        }
        return;
      }
      if (js.terminado) { window.location.reload(); return; }
      progreso(invId, '<i class="fa fa-spinner fa-spin me-1"></i>Enviadas ' + js.enviados + ' · quedan ' + js.quedan + '…');
      vigila(invId);
    }).catch(function () {
      if (boton) { boton.disabled = false; boton.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviar'; }
      progreso(invId, '<i class="fa fa-circle-exclamation me-1"></i>No se pudo enviar.', 'text-danger');
    });
  }

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
