/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ORDENAR MI INICIO — cada uno se coloca los módulos como quiera.
   · El ORDEN es una preferencia de la persona (`UserProfile.home_order`), no un permiso: solo se
     ordena LO QUE YA VE (los módulos se pintan según sus permisos y su departamento).
   · ⚠️ Los AVISOS no se mueven: son lo primero que hay que ver. Se marcan con `data-home-fixed`.
   · Las claves salen del propio módulo (`data-home-module` o, si no, un slug de su TÍTULO), así no
     hay que tocar los cuarenta bloques de `home.html` cada vez que se añade uno nuevo.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!document.body || !document.body.classList) return;

  var zona = null;

  function esModulo(el) {
    if (!el || el.nodeType !== 1 || el.hasAttribute('data-home-fixed')) return false;
    // Una tarjeta suelta, o un bloque que se ha marcado a mano porque son VARIOS hermanos que
    // van juntos (el cuadro de mando de dirección: su cabecera y su rejilla).
    return el.classList.contains('card') || el.hasAttribute('data-home-module');
  }

  function slug(t) {
    return String(t || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }

  /* El NOMBRE del módulo: el de su cabecera, SIN el contador ni la explicación de debajo (si no,
     el asa decía «Bolsas que solo te esperan a ti 3 No pasan a administración hasta que…»). */
  function titulo(el) {
    var h = el.querySelector('h6, h5, .card-header');
    if (!h) return '';
    var c = h.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.badge, small, .text-muted, .form-text'),
      function (x) { x.remove(); });
    var t = (c.textContent || '').trim().replace(/\s+/g, ' ');
    return t.length > 46 ? t.slice(0, 45).trim() + '…' : t;
  }

  function clave(el) {
    var k = el.getAttribute('data-home-module');
    if (k) return k;
    k = slug(titulo(el)) || ('mod-' + Array.prototype.indexOf.call(zona.children, el));
    el.setAttribute('data-home-module', k);
    return k;
  }

  function modulos() {
    return Array.prototype.filter.call(zona.children, esModulo);
  }

  /* Aplica el orden guardado. ⚠️ Los módulos NO son hermanos consecutivos (entre medias hay
     scripts y modales), así que se colocan TODOS SEGUIDOS en el sitio del primero, con un
     marcador: insertándolos «antes del primero» se desordenaban en cuanto el primero era uno de
     los que había que mover (bug real: el módulo movido acababa el último).
     Lo que no esté en la lista (un módulo nuevo, o uno que antes no se veía) va detrás, en su
     orden de siempre: así nunca desaparece de la vista. */
  function aplica(orden) {
    if (!zona) return;
    var mods = modulos();
    if (!mods.length) return;
    var porClave = {};
    mods.forEach(function (m) { porClave[clave(m)] = m; });
    var finales = [];
    (orden || []).forEach(function (k) {
      var m = porClave[k];
      if (m && finales.indexOf(m) < 0) finales.push(m);
    });
    mods.forEach(function (m) { if (finales.indexOf(m) < 0) finales.push(m); });
    var marca = document.createComment('home-order');
    zona.insertBefore(marca, mods[0]);
    finales.forEach(function (m) { zona.insertBefore(m, marca); });
    marca.parentNode.removeChild(marca);
  }

  // ── MODO ORDENAR ────────────────────────────────────────────────────────────────────────────
  var enModo = false;

  function barra() {
    var b = document.createElement('div');
    b.className = 'home-order-bar';
    b.innerHTML =
      '<span class="home-order-bar__t"><i class="fa fa-up-down-left-right me-2"></i>' +
      'Arrastra los módulos para colocarlos como quieras</span>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-ho-reset>Orden de siempre</button>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-ho-cancel>Cancelar</button>' +
      '<button type="button" class="btn btn-sm btn-primary" data-ho-save><i class="fa fa-check me-1"></i>Guardar</button>';
    return b;
  }

  function guardar(orden) {
    var cuerpo = new URLSearchParams();
    orden.forEach(function (k) { cuerpo.append('keys', k); });
    var cab = { 'X-Requested-With': 'XMLHttpRequest' };
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) cab['X-CSRFToken'] = meta.getAttribute('content') || '';
    return fetch('/mi-inicio/orden', { method: 'POST', headers: cab, body: cuerpo })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function entra() {
    if (enModo || !zona) return;
    enModo = true;
    document.body.classList.add('home-ordering');
    var previo = modulos().map(clave);
    modulos().forEach(function (m) {
      m.classList.add('home-order-item');
      if (!m.querySelector('.home-order-grip')) {
        var g = document.createElement('span');
        g.className = 'home-order-grip';
        g.innerHTML = '<i class="fa fa-grip-vertical"></i>' +
          '<span class="home-order-grip__t">' + (titulo(m) || 'Módulo') + '</span>';
        m.insertBefore(g, m.firstChild);
      }
    });
    var b = barra();
    document.body.appendChild(b);

    b.querySelector('[data-ho-save]').addEventListener('click', function () {
      guardar(modulos().map(clave)).then(function () { sale(b); });
    });
    b.querySelector('[data-ho-cancel]').addEventListener('click', function () {
      aplica(previo); sale(b);
    });
    b.querySelector('[data-ho-reset]').addEventListener('click', function () {
      guardar([]).then(function () { location.href = location.pathname; });
    });
  }

  function sale(b) {
    enModo = false;
    document.body.classList.remove('home-ordering');
    modulos().forEach(function (m) {
      m.classList.remove('home-order-item', 'is-dragging');
      var g = m.querySelector('.home-order-grip');
      if (g) g.remove();
    });
    if (b) b.remove();
    // Quitar el `?ordenar=1` de la barra de direcciones: si no, recargar volvería a entrar en el
    // modo de ordenar sin haberlo pedido.
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('ordenar')) {
        u.searchParams.delete('ordenar');
        history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      }
    } catch (e) {}
    // Que se vea que ha quedado guardado.
    if (window.showToast) { try { window.showToast('Inicio ordenado'); } catch (e) {} }
  }

  /* ARRASTRE POR EL ASA, con eventos de PUNTERO (no el arrastre nativo de HTML5): así vale
     también CON EL DEDO en un iPad, que es donde más se mira el Inicio. La tarjeta se MUEVE
     mientras se arrastra (se ve dónde va a quedar), como en el editor de playlists: con índices
     el módulo quedaba una posición desviada al bajarlo. */
  var arrastrando = null;

  function bajoElPuntero(x, y) {
    var el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('.home-order-item') : null;
  }

  function mueve(ev) {
    if (!arrastrando) return;
    ev.preventDefault();
    var sobre = bajoElPuntero(ev.clientX, ev.clientY);
    if (!sobre || sobre === arrastrando) return;
    var r = sobre.getBoundingClientRect();
    var despues = (ev.clientY - r.top) > r.height / 2;
    zona.insertBefore(arrastrando, despues ? sobre.nextSibling : sobre);
  }

  function suelta() {
    if (!arrastrando) return;
    arrastrando.classList.remove('is-dragging');
    arrastrando = null;
    document.removeEventListener('pointermove', mueve);
    document.removeEventListener('pointerup', suelta);
    document.removeEventListener('pointercancel', suelta);
  }

  document.addEventListener('pointerdown', function (ev) {
    if (!enModo || ev.button !== 0) return;
    var asa = ev.target.closest && ev.target.closest('.home-order-grip');
    if (!asa) return;
    var m = asa.closest('.home-order-item');
    if (!m) return;
    ev.preventDefault();
    arrastrando = m;
    m.classList.add('is-dragging');
    try { asa.setPointerCapture(ev.pointerId); } catch (e) {}
    document.addEventListener('pointermove', mueve);
    document.addEventListener('pointerup', suelta);
    document.addEventListener('pointercancel', suelta);
  });

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-home-order]');
    if (!b) return;
    ev.preventDefault();
    entra();
  });

  function arranca() {
    // SOLO EN INICIO: la zona la marca `home.html`. Fuera de ahí no hay módulos que ordenar (y el
    // enlace del menú lleva a Inicio con `?ordenar=1`).
    zona = document.querySelector('[data-home-modules]');
    if (!zona) return;
    try { aplica(window.HOME_ORDER || []); } catch (e) {}
    var p = new URLSearchParams(location.search);
    if (p.get('ordenar') === '1') entra();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
