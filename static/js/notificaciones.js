/* AVISOS de la app (campanita + aviso emergente).
 *
 * Cuando a alguien se le asigna algo (una tarea, una producción, una solicitud de diseño, una
 * petición o una bolsa para liquidar) el servidor le guarda un aviso. Aquí se pinta:
 *   · la CAMPANITA con los que no ha leído,
 *   · y un AVISO EMERGENTE que salta UNA vez por aviso (el servidor los marca como «ya saltó»).
 * Si el servidor tiene claves VAPID, ese mismo aviso llega además como notificación del sistema
 * (en el Mac, la notificación del propio Mac) por Web Push: eso lo hace `sw.js`, no este fichero.
 */
(function () {
  var caja = document.querySelector('[data-notif-menu]');
  if (!caja) return;                       // sin sesión no hay campanita
  var URL_LIST = '/avisos';
  var URL_READ = '/avisos/leidos';
  var contador = document.querySelector('[data-notif-count]');
  var lista = document.querySelector('[data-notif-list]');

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function pintarContador(n) {
    if (!contador) return;
    contador.textContent = n > 99 ? '99+' : String(n);
    contador.classList.toggle('d-none', !n);
  }

  function pintarLista(filas) {
    if (!lista) return;
    if (!filas || !filas.length) {
      lista.innerHTML = '<div class="px-3 py-3 small text-muted">No tienes avisos.</div>';
      return;
    }
    lista.innerHTML = filas.map(function (f) {
      var cuerpo = f.body ? '<div class="notif-item__body">' + f.body + '</div>' : '';
      return '<a class="notif-item' + (f.unread ? ' is-unread' : '') + '" href="' + (f.url || '#') + '">'
        + '<span class="notif-item__ico"><i class="fa ' + (f.icon || 'fa-bell') + '"></i></span>'
        + '<span class="notif-item__txt"><span class="notif-item__title">' + (f.title || '') + '</span>'
        + cuerpo + '<span class="notif-item__when">' + (f.when || '') + '</span></span></a>';
    }).join('');
  }

  // AVISO EMERGENTE: abajo a la derecha, con su enlace. Se cierra solo.
  function emergente(av) {
    var zona = document.getElementById('notifToasts');
    if (!zona) {
      zona = document.createElement('div');
      zona.id = 'notifToasts';
      zona.className = 'notif-toasts';
      document.body.appendChild(zona);
    }
    var el = document.createElement('a');
    el.className = 'notif-toast';
    el.href = av.url || '#';
    el.innerHTML = '<span class="notif-toast__ico"><i class="fa ' + (av.icon || 'fa-bell') + '"></i></span>'
      + '<span class="notif-toast__txt"><strong>' + (av.title || '') + '</strong>'
      + (av.body ? '<span>' + av.body + '</span>' : '') + '</span>'
      + '<button type="button" class="notif-toast__x" aria-label="Cerrar">&times;</button>';
    el.querySelector('.notif-toast__x').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation(); el.remove();
    });
    zona.appendChild(el);
    setTimeout(function () { el.classList.add('is-in'); }, 20);
    setTimeout(function () { el.classList.remove('is-in'); setTimeout(function () { el.remove(); }, 300); }, 12000);
  }

  function mirar(soloNuevos) {
    fetch(URL_LIST + (soloNuevos ? '?nuevos=1' : ''), {headers: {'X-Requested-With': 'XMLHttpRequest'}})
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        pintarContador(d.unread || 0);
        if (!soloNuevos) pintarLista(d.rows);
        (d.toasts || []).forEach(emergente);
      }).catch(function () {});
  }

  // Al abrir la campanita se cargan los avisos.
  var enlace = document.querySelector('#navBellItem [data-bs-toggle="dropdown"]');
  if (enlace) enlace.addEventListener('click', function () { mirar(false); });

  var leerTodo = document.querySelector('[data-notif-read-all]');
  if (leerTodo) {
    leerTodo.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      fetch(URL_READ, {method: 'POST', headers: {'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest'}})
        .then(function () { pintarContador(0); mirar(false); }).catch(function () {});
    });
  }

  // Al entrar en cualquier página: contador + lo que no haya saltado todavía. Y cada 60 s, por si
  // llega algo mientras la pestaña está abierta.
  mirar(true);
  setInterval(function () { if (!document.hidden) mirar(true); }, 60000);
})();
