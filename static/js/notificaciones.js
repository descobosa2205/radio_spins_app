/* AVISOS de la app: FRANJAS bajo el menú + campana con los pendientes.
 *
 * Cuando a alguien se le asigna algo (una producción, una solicitud de diseño, una petición, una
 * bolsa para liquidar, unas vacaciones…) el servidor le guarda un aviso. Aquí se pinta:
 *   · una FRANJA justo debajo del menú, que **se queda EN TODAS LAS PÁGINAS hasta que se pincha**
 *     (te lleva a la gestión que toca y el aviso queda leído) o se cierra con la ✕ —y entonces deja
 *     de salir, pero el aviso sigue pendiente en la campana—;
 *   · la CAMPANA, la primera del menú, que **solo se ve si hay avisos pendientes** y lleva el
 *     número; al pincharla salen TODOS en un pop-up para irlos resolviendo uno a uno.
 * Si el servidor tiene claves VAPID, ese mismo aviso llega además como notificación del sistema
 * por Web Push: eso lo hace `sw.js`, no este fichero.
 */
(function () {
  var barra = document.querySelector('[data-notif-bar]');
  var itemCampana = document.getElementById('navBellItem');
  if (!barra && !itemCampana) return;      // sin sesión no hay avisos

  var URL_LIST = '/avisos';
  var URL_READ = '/avisos/leidos';
  var URL_HIDE = '/avisos/ocultar-franja';
  var contador = document.querySelector('[data-notif-count]');
  var lista = document.querySelector('#notifModal [data-notif-list]');
  var vistos = {};                          // id -> true (franjas ya pintadas en esta página)
  var porId = {};                           // id -> aviso (para abrir su pop-up)

  /* Lo que va dentro de un atributo se escapa: la foto y la url vienen de la BD. */
  function attr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* La CARA de quien provoca el aviso; si no hay, el icono de su tipo. */
  function cara(f, claseIcono) {
    if (f && f.photo_url) {
      return '<img class="notif-ava" src="' + attr(f.photo_url) + '" alt="" data-avatar="1"'
        + ' title="' + attr(f.actor_name || '') + '">';
    }
    return '<span class="' + claseIcono + '"><i class="fa ' + attr((f && f.icon) || 'fa-bell') + '"></i></span>';
  }

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function marcarLeido(id) {
    var fd = new FormData();
    if (id) fd.append('id', id);
    return fetch(URL_READ, {
      method: 'POST', body: fd,
      headers: {'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest'}
    }).catch(function () {});
  }

  /* La campana SOLO existe si hay algo pendiente: sin avisos no se enseña un icono muerto. */
  function pintarContador(n) {
    n = Number(n) || 0;
    if (contador) contador.textContent = n > 99 ? '99+' : String(n);
    if (itemCampana) itemCampana.classList.toggle('d-none', n <= 0);
    if (!n) {
      var m = document.getElementById('notifModal');
      if (m && window.bootstrap && m.classList.contains('show')) {
        try { bootstrap.Modal.getInstance(m).hide(); } catch (e) {}
      }
    }
  }

  function pintarLista(filas) {
    if (!lista) return;
    var pend = (filas || []).filter(function (f) { return f.unread; });
    if (!pend.length) {
      lista.innerHTML = '<div class="px-3 py-4 text-center small text-muted">No tienes avisos pendientes.</div>';
      return;
    }
    porId = {};
    lista.innerHTML = pend.map(function (f) {
      porId[f.id] = f;
      var cuerpo = f.body ? '<span class="notif-item__body">' + f.body + '</span>' : '';
      /* ⚠️ NO es un enlace: al pinchar se abre el POP-UP del aviso (con su botón de cerrarlo). */
      return '<button type="button" class="notif-item is-unread w-100 text-start border-0 bg-transparent"'
        + ' data-notif-id="' + attr(f.id) + '">'
        + cara(f, 'notif-item__ico')
        + '<span class="notif-item__txt"><span class="notif-item__title">' + (f.title || '') + '</span>'
        + cuerpo + '<span class="notif-item__when">' + (f.when || '') + '</span></span>'
        + '<i class="fa fa-chevron-right notif-item__go"></i></button>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════════
     UN AVISO SE VE EN UN POP-UP, no navegando a otra pantalla.
     Al pincharlo (en la franja, en la campana o en «Mis avisos» de Inicio) se abre aquí con su cara,
     su texto y —si el aviso ES una página (el de vacaciones)— su contenido dentro, y dos botones:
     **cerrar el aviso** (lo marca leído y desaparece) e **ir a resolverlo**.
     ═══════════════════════════════════════════════════════════════════════════════════════ */
  var vistoActual = null;

  function abrirAviso(av) {
    var m = document.getElementById('notifViewModal');
    if (!m || !window.bootstrap) {              // sin el pop-up, se navega como antes
      if (av && av.url) window.location.href = av.url;
      return;
    }
    vistoActual = av || {};
    var ava = m.querySelector('[data-notif-view-ava]');
    if (ava) ava.innerHTML = cara(av, 'notif-item__ico');
    var t = m.querySelector('[data-notif-view-title]');
    if (t) t.textContent = av.title || 'Aviso';
    var w = m.querySelector('[data-notif-view-when]');
    if (w) w.textContent = [av.kind_label, av.when].filter(Boolean).join(' · ');
    var b = m.querySelector('[data-notif-view-body]');
    if (b) b.textContent = av.body || '';
    /* Los avisos que son una PÁGINA se ven dentro; los demás llevan su botón de ir. */
    var frame = m.querySelector('[data-notif-view-frame]');
    if (frame) {
      if (av.embed && av.url) { frame.src = av.url; frame.classList.remove('d-none'); }
      else { frame.removeAttribute('src'); frame.classList.add('d-none'); }
    }
    var go = m.querySelector('[data-notif-view-go]');
    if (go) {
      if (av.url && !av.embed) { go.href = av.url; go.classList.remove('d-none'); }
      else { go.classList.add('d-none'); }
    }
    bootstrap.Modal.getOrCreateInstance(m).show();
  }

  document.addEventListener('click', function (ev) {
    var cerrar = ev.target.closest && ev.target.closest('[data-notif-view-close]');
    if (cerrar) {
      var id = (vistoActual || {}).id;
      var m = document.getElementById('notifViewModal');
      if (id) {
        marcarLeido(id).then(function () { mirar(false); });
        var franjaEl = document.querySelector('.notif-strip[data-notif-id="' + id + '"]');
        if (franjaEl) franjaEl.remove();
        var item = document.querySelector('#notifModal .notif-item[data-notif-id="' + id + '"]');
        if (item) item.remove();
        var enInicio = document.querySelector('[data-notif-item][data-notif-id="' + id + '"]');
        if (enInicio) enInicio.remove();
      }
      if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
      return;
    }
    // «Ir a resolverlo»: queda leído y se navega.
    var ir = ev.target.closest && ev.target.closest('[data-notif-view-go]');
    if (ir && (vistoActual || {}).id) marcarLeido(vistoActual.id);
  });

  function ocultarFranja(id) {
    var fd = new FormData();
    fd.append('id', id);
    return fetch(URL_HIDE, {
      method: 'POST', body: fd,
      headers: {'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest'}
    }).catch(function () {});
  }

  /* FRANJA bajo el menú. No se va sola: sale en TODAS las páginas hasta que se pincha (lleva a su
     gestión y queda leída) o se cierra con la ✕ (y entonces deja de salir, pero sigue pendiente en
     la campana, para no perderla). */
  function franja(av) {
    if (!barra || !av || vistos[av.id]) return;
    vistos[av.id] = true;
    porId[av.id] = av;
    var el = document.createElement('div');
    el.className = 'notif-strip';
    el.setAttribute('data-notif-id', av.id);
    el.innerHTML =
      '<button type="button" class="notif-strip__link">'
      + cara(av, 'notif-strip__ico')
      + '<span class="notif-strip__txt"><strong>' + (av.title || '') + '</strong>'
      + (av.body ? '<span>' + av.body + '</span>' : '') + '</span>'
      + '<span class="notif-strip__go">Ver <i class="fa fa-arrow-right ms-1"></i></span></button>'
      + '<button type="button" class="notif-strip__x" aria-label="Cerrar">&times;</button>';

    el.querySelector('.notif-strip__link').addEventListener('click', function () {
      // ⚠️ El aviso se ve en un POP-UP: no se sale de la pantalla en la que estás.
      abrirAviso(av);
    });
    el.querySelector('.notif-strip__x').addEventListener('click', function () {
      // La ✕ se APUNTA en el servidor: si no, la franja volvería a salir en la página siguiente.
      ocultarFranja(av.id);
      el.classList.remove('is-in');
      setTimeout(function () { el.remove(); }, 250);
    });
    barra.appendChild(el);
    setTimeout(function () { el.classList.add('is-in'); }, 20);
  }

  function mirar(soloNuevos) {
    return fetch(URL_LIST + (soloNuevos ? '?nuevos=1' : ''), {headers: {'X-Requested-With': 'XMLHttpRequest'}})
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        pintarContador(d.unread || 0);
        if (!soloNuevos) pintarLista(d.rows);
        (d.toasts || []).forEach(franja);
      }).catch(function () {});
  }

  // Campana → pop-up con TODOS los pendientes, para irlos pinchando uno a uno.
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-notif-open]')) {
      ev.preventDefault();
      var m = document.getElementById('notifModal');
      if (!m || !window.bootstrap) return;
      if (lista) lista.innerHTML = '<div class="px-3 py-3 small text-muted">Cargando…</div>';
      bootstrap.Modal.getOrCreateInstance(m).show();
      mirar(false);
      return;
    }
    // Un aviso del pop-up de la campana: se abre SU pop-up (no se navega).
    var item = ev.target.closest('#notifModal .notif-item');
    if (item) {
      ev.preventDefault();
      var av = porId[item.getAttribute('data-notif-id')];
      if (av) abrirAviso(av);
    }
    // …y lo mismo en el módulo «Mis avisos» de Inicio.
    var enInicio = ev.target.closest('[data-notif-item]');
    if (enInicio) {
      ev.preventDefault();
      abrirAviso({
        id: enInicio.getAttribute('data-notif-id'),
        title: enInicio.getAttribute('data-notif-title') || '',
        body: enInicio.getAttribute('data-notif-body') || '',
        when: enInicio.getAttribute('data-notif-when') || '',
        kind_label: enInicio.getAttribute('data-notif-kind') || '',
        icon: enInicio.getAttribute('data-notif-icon') || 'fa-bell',
        photo_url: enInicio.getAttribute('data-notif-photo') || '',
        url: enInicio.getAttribute('data-notif-url') || '',
        embed: enInicio.getAttribute('data-notif-embed') === '1'
      });
    }
  });

  var leerTodo = document.querySelector('[data-notif-read-all]');
  if (leerTodo) {
    leerTodo.addEventListener('click', function (e) {
      e.preventDefault();
      marcarLeido('').then(function () { pintarContador(0); mirar(false); });
    });
  }

  // Al entrar en CUALQUIER página: el contador y las franjas de lo que sigue pendiente sin cerrar.
  // Y cada 60 s, por si llega algo con la pestaña abierta.
  mirar(true);
  setInterval(function () { if (!document.hidden) mirar(true); }, 60000);
})();
