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
    lista.innerHTML = pend.map(function (f) {
      var cuerpo = f.body ? '<span class="notif-item__body">' + f.body + '</span>' : '';
      return '<a class="notif-item is-unread" href="' + (f.url || '#') + '" data-notif-id="' + f.id + '">'
        + '<span class="notif-item__ico"><i class="fa ' + (f.icon || 'fa-bell') + '"></i></span>'
        + '<span class="notif-item__txt"><span class="notif-item__title">' + (f.title || '') + '</span>'
        + cuerpo + '<span class="notif-item__when">' + (f.when || '') + '</span></span>'
        + '<i class="fa fa-chevron-right notif-item__go"></i></a>';
    }).join('');
  }

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
    var el = document.createElement('div');
    el.className = 'notif-strip';
    el.innerHTML =
      '<a class="notif-strip__link" href="' + (av.url || '#') + '">'
      + '<span class="notif-strip__ico"><i class="fa ' + (av.icon || 'fa-bell') + '"></i></span>'
      + '<span class="notif-strip__txt"><strong>' + (av.title || '') + '</strong>'
      + (av.body ? '<span>' + av.body + '</span>' : '') + '</span>'
      + '<span class="notif-strip__go">Ver <i class="fa fa-arrow-right ms-1"></i></span></a>'
      + '<button type="button" class="notif-strip__x" aria-label="Cerrar">&times;</button>';

    el.querySelector('.notif-strip__link').addEventListener('click', function () {
      // Se marca leída al pinchar; la navegación sigue su curso.
      marcarLeido(av.id);
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
    // Un aviso del pop-up: se marca leído y se navega.
    var item = ev.target.closest('#notifModal .notif-item');
    if (item) marcarLeido(item.getAttribute('data-notif-id'));
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
