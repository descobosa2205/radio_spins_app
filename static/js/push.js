/* Web Push en el cliente: registra el service worker y gestiona la suscripción del usuario.
 * El botón #pushToggle (en el navbar) activa/desactiva las notificaciones. Requiere claves VAPID
 * en el servidor; si no están, el botón se oculta. En iPhone solo funciona si la web se ha añadido
 * a la pantalla de inicio como app (restricción de Apple). */
(function () {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  var swReg = null;
  var btn = document.getElementById('pushToggle');

  function b64ToUint8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function api(url, opts) {
    return fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } }, opts || {}));
  }
  function setLabel(on) {
    if (!btn) return;
    btn.classList.toggle('active', on);
    btn.title = on ? 'Notificaciones activadas (pulsa para desactivar)' : 'Activar notificaciones';
    var lab = btn.querySelector('[data-push-label]');
    if (lab) lab.textContent = on ? 'Notificaciones activas' : 'Activar notificaciones';
  }
  function refreshState() {
    if (!swReg || !btn) return;
    swReg.pushManager.getSubscription().then(function (sub) {
      setLabel(!!sub && Notification.permission === 'granted');
    });
  }
  function subscribe() {
    swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(btn.dataset.key) })
      .then(function (sub) {
        api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) })
          .then(function (r) { return r.json(); })
          .then(function (js) {
            refreshState();
            if (js && js.ok) api('/push/test', { method: 'POST', body: '{}' });  // aviso de prueba al activar
          });
      })
      .catch(function (e) { alert('No se pudieron activar las notificaciones: ' + e); });
  }
  function toggle() {
    if (!swReg || !btn) return;
    swReg.pushManager.getSubscription().then(function (sub) {
      if (sub) {  // ya suscrito -> desactivar
        var ep = sub.endpoint;
        sub.unsubscribe().finally(function () {
          api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: ep }) }).finally(refreshState);
        });
        return;
      }
      Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') { alert('Permiso de notificaciones denegado en el navegador.'); return; }
        subscribe();
      });
    });
  }

  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    swReg = reg;
    if (!btn) return;
    api('/push/public-key').then(function (r) { return r.json(); }).then(function (js) {
      if (!js || !js.enabled || !js.key) { btn.style.display = 'none'; return; }
      btn.dataset.key = js.key;
      btn.addEventListener('click', toggle);
      refreshState();
    }).catch(function () { if (btn) btn.style.display = 'none'; });
  }).catch(function () { if (btn) btn.style.display = 'none'; });
})();
