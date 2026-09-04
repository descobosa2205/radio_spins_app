/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ORDENAR LAS PESTAÑAS — cada uno se las coloca como quiera.

   Se MANTIENE PULSADA una pestaña, TIEMBLAN todas, se arrastran para ordenarlas y al PINCHAR FUERA
   se guarda. Vale para las pestañas de una ficha, las subpestañas de una sección (Producción,
   Contratación, Administración…) y el MENÚ de cabecera.

   · Es una PREFERENCIA de la persona (`UserProfile.ui_order`), no un permiso: solo se ordena lo que
     ya ve, y lo que se guarda es el ORDEN, nada más.
   · ⚠️ La CLAVE de cada grupo se calcula con las pestañas QUE HAY: si mañana se añade una, la clave
     cambia y se vuelve al orden natural — así una pestaña nueva nunca queda escondida.
   · ⚠️ Se arrastra con eventos de PUNTERO (no el arrastre nativo de HTML5): dentro de una pestaña
     hay enlaces que tienen que seguir funcionando, y con el dedo (iPad) el HTML5 no va.
   · ⚠️ Mientras se ordena, el clic de las pestañas NO navega (si no, arrastrar cambiaría de pestaña).
   Opt-out: `data-no-sort` en el contenedor.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var URL_GUARDAR = (document.body && document.body.getAttribute('data-ui-order-url')) || '';
  var GUARDADO = (function () {
    try { return JSON.parse((document.body && document.body.getAttribute('data-ui-order')) || '{}'); }
    catch (e) { return {}; }
  })();

  /* Los grupos que se pueden ordenar. Se cogen por selector para no tener que tocar 20 plantillas. */
  // ⚠️ `ul.nav-tabs` cubre las subpestañas de las secciones (Producción, Registros, Administración…),
  //    que no llevan una clase propia. Se excluye la barra del NAVBAR, que tiene su propio orden.
  var SELECTORES = ['ul.ficha-tabs', 'ul.contract-tabs', 'ul.nav-tabs:not(.navbar-nav)',
                    '[data-sortable]'];

  function items(grupo) {
    return Array.prototype.filter.call(grupo.children, function (el) {
      return el.nodeType === 1 && !el.hasAttribute('data-no-sort');
    });
  }

  /* La identidad de una pestaña: su destino (o su texto). Estable entre cargas. */
  function idDe(el) {
    var a = el.matches('a, button') ? el : el.querySelector('a, button');
    var v = (a && (a.getAttribute('data-bs-target') || a.getAttribute('href'))) || '';
    v = String(v).split('?')[1] || String(v);          // de la URL, lo que la distingue
    if (!v) v = (el.textContent || '').trim().slice(0, 24);
    return v.replace(/\s+/g, ' ').slice(0, 60);
  }

  /* La clave del GRUPO. ⚠️⚠️ Tiene que ser ESTABLE aunque cambien las pestañas: si dependiera de
     ellas, añadir una mañana cambiaría la clave y **se perdería el orden que puso la persona**.
     Se compone con la PÁGINA (el endpoint, que emite el servidor), la clase distintiva del grupo y
     su posición entre los de esa clase, que no cambian al añadir una pestaña. */
  var PAGINA = (document.body && document.body.getAttribute('data-ui-page')) || '';

  function claveDe(grupo) {
    var propia = grupo.getAttribute('data-sortable');
    if (propia) return 'tabs:' + propia;
    var clase = 'nav';
    ['ficha-tabs', 'contract-tabs', 'nav-tabs'].forEach(function (c) {
      if (grupo.classList.contains(c) && clase === 'nav') clase = c;
    });
    var hermanos = Array.prototype.slice.call(document.querySelectorAll('ul.' + clase));
    var i = hermanos.indexOf(grupo);
    return 'tabs:' + PAGINA + ':' + clase + ':' + (i < 0 ? 0 : i);
  }

  /* Aplica el orden guardado. ⚠️ Lo que NO estaba guardado (una pestaña NUEVA) se queda AL FINAL,
     en su orden natural: el orden que puso la persona se mantiene y lo nuevo se añade detrás. */
  function aplica(grupo) {
    var orden = GUARDADO[claveDe(grupo)];
    if (!orden || !orden.length) return;
    var mapa = {}, conocidas = {};
    items(grupo).forEach(function (el) { mapa[idDe(el)] = el; });
    orden.forEach(function (id) {
      if (mapa[id]) { grupo.appendChild(mapa[id]); conocidas[id] = true; }
    });
    // Las que no estaban en el orden guardado: al final, como estaban entre ellas.
    items(grupo).forEach(function (el) {
      if (!conocidas[idDe(el)]) grupo.appendChild(el);
    });
  }

  function guarda(grupo) {
    if (!URL_GUARDAR) return;
    var clave = claveDe(grupo), orden = items(grupo).map(idDe);
    GUARDADO[clave] = orden;
    try {
      fetch(URL_GUARDAR, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: clave, order: orden })
      });
    } catch (e) {}
  }

  /* ---------- el modo ORDENAR ---------- */
  var activo = null, arrastrado = null, pulsando = null, timer = null;

  function entra(grupo) {
    if (activo === grupo) return;
    sal();
    activo = grupo;
    grupo.classList.add('sorting');
    items(grupo).forEach(function (el) { el.classList.add('sorting__item'); });
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
  }

  function sal(guardar) {
    if (!activo) return;
    var g = activo;
    activo = null;
    g.classList.remove('sorting');
    items(g).forEach(function (el) { el.classList.remove('sorting__item', 'is-dragging'); });
    if (guardar) guarda(g);
  }

  function itemEn(grupo, x, y) {
    var res = null;
    items(grupo).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) res = el;
    });
    return res;
  }

  /* EL MISMO GESTO para lo que YA tiene su propio modo de ordenar: mantener pulsado un MÓDULO de
     Inicio entra en «Ordenar mi inicio», y mantener pulsado el MENÚ abre «Ordenar mi menú». No se
     duplica ningún motor: aquí solo se reconoce el gesto y se llama al suyo. */
  function gestoPropio(destino) {
    var mod = destino.closest && destino.closest('[data-home-modules] .card, [data-home-modules] [data-home-module]');
    if (mod && !mod.hasAttribute('data-home-fixed') && window.app33HomeOrderEnter) {
      window.app33HomeOrderEnter();
      return true;
    }
    var menu = destino.closest && destino.closest('#primaryNavList');
    if (menu) {
      var m = document.getElementById('navOrderModal');
      if (m && window.bootstrap) { new bootstrap.Modal(m).show(); return true; }
    }
    return false;
  }

  document.addEventListener('pointerdown', function (ev) {
    var grupo = null;
    for (var i = 0; i < SELECTORES.length && !grupo; i++) {
      grupo = ev.target.closest && ev.target.closest(SELECTORES[i]);
      if (grupo && grupo.hasAttribute('data-no-sort')) grupo = null;
    }
    if (!grupo) {
      if (activo) sal(true);
      // ¿Es un módulo de Inicio o el menú? Ahí el gesto abre SU modo de ordenar.
      var objetivo = ev.target;
      clearTimeout(timer);
      pulsando = { grupo: null, item: null, x: ev.clientX, y: ev.clientY };
      timer = setTimeout(function () {
        if (pulsando) { gestoPropio(objetivo); pulsando = null; }
      }, 600);
      return;
    }
    var it = ev.target.closest('li, [data-sort-item]');
    if (!it || it.parentElement !== grupo) return;
    if (activo === grupo) {                      // ya está temblando: se arrastra
      arrastrado = it;
      it.classList.add('is-dragging');
      try { it.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
      return;
    }
    // Mantener pulsado ~500 ms para entrar en el modo.
    pulsando = { grupo: grupo, item: it, x: ev.clientX, y: ev.clientY };
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!pulsando) return;
      entra(pulsando.grupo);
      pulsando = null;
    }, 500);
  }, true);

  document.addEventListener('pointermove', function (ev) {
    // Si se mueve el dedo antes de tiempo, es un scroll: no se entra en el modo.
    if (pulsando && (Math.abs(ev.clientX - pulsando.x) > 8 || Math.abs(ev.clientY - pulsando.y) > 8)) {
      clearTimeout(timer); pulsando = null;
    }
    if (!activo || !arrastrado) return;
    ev.preventDefault();
    var sobre = itemEn(activo, ev.clientX, ev.clientY);
    if (!sobre || sobre === arrastrado) return;
    var r = sobre.getBoundingClientRect();
    // Horizontal (pestañas) o vertical (menú apilado): manda el lado más largo.
    var antes = (r.width >= r.height)
      ? (ev.clientX < r.left + r.width / 2)
      : (ev.clientY < r.top + r.height / 2);
    activo.insertBefore(arrastrado, antes ? sobre : sobre.nextSibling);
  }, { passive: false });

  function suelta() {
    clearTimeout(timer); pulsando = null;
    if (arrastrado) { arrastrado.classList.remove('is-dragging'); arrastrado = null; }
  }
  document.addEventListener('pointerup', suelta);
  document.addEventListener('pointercancel', suelta);

  /* Mientras se ordena, un clic en una pestaña NO navega (si no, arrastrar cambiaría de pestaña).
     Y un clic FUERA sale del modo y guarda. */
  document.addEventListener('click', function (ev) {
    if (!activo) return;
    if (activo.contains(ev.target)) { ev.preventDefault(); ev.stopPropagation(); return; }
    sal(true);
  }, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') sal(true); });

  function arranca() {
    SELECTORES.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (g) {
        if (g.hasAttribute('data-no-sort') || g.dataset.sortBound) return;
        g.dataset.sortBound = '1';
        aplica(g);
      });
    });
  }
  if (document.readyState !== 'loading') arranca();
  else document.addEventListener('DOMContentLoaded', arranca);
  // Las pestañas que llegan por AJAX también se ordenan.
  document.addEventListener('inline:updated', arranca);
  window.app33SortableTabs = arranca;
})();
