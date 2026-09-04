/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ORDENAR LAS PESTAÑAS — cada uno se las coloca como quiera.

   Se MANTIENE PULSADA una pestaña, TIEMBLAN todas, se arrastran para ordenarlas y al PINCHAR FUERA
   se guarda. Vale para las pestañas de una ficha, las subpestañas de una sección (Producción,
   Contratación, Administración…) y el MENÚ de cabecera.

   · Es una PREFERENCIA de la persona (`UserProfile.ui_order`), no un permiso: solo se ordena lo que
     ya ve, y lo que se guarda es el ORDEN, nada más.
   · ⚠️ La CLAVE de cada grupo es ESTABLE (la página + la clase + su posición): añadir una pestaña
     mañana NO puede cambiarla, o se perdería el orden que puso la persona. Lo nuevo va al final.
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
  var activo = null, arrastrado = null, pulsando = null, timer = null, agarre = null;

  function entra(grupo) {
    if (activo === grupo) return;
    sal();
    activo = grupo;
    grupo.classList.add('sorting');
    items(grupo).forEach(function (el) { el.classList.add('sorting__item'); });
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
  }

  /* Coger una pieza: punto único, lo usan el segundo toque y la propia entrada en el modo. */
  function agarra(it, x, y, pid) {
    arrastrado = it;
    agarre = { x: x, y: y };
    it.style.transition = 'none';
    it.classList.add('is-dragging');
    try { it.setPointerCapture(pid); } catch (e) {}
  }

  function sal(guardar) {
    if (!activo) return;
    var g = activo;
    activo = null;
    g.classList.remove('sorting');
    items(g).forEach(function (el) {
      el.classList.remove('sorting__item', 'is-dragging');
      el.style.transition = ''; el.style.transform = '';
    });
    if (guardar) guarda(g);
  }

  /* FLIP (First-Last-Invert-Play): se apuntan las posiciones, se reordena y cada pieza se anima
     DESDE donde estaba hasta donde ha quedado. Sin esto el reordenado es un salto seco, que es lo
     que se siente «poco fluido». El arrastrado se excluye: ese va pegado al dedo. */
  var animando = false, tAnim = null;
  function flip(grupo, cambia) {
    var piezas = items(grupo), antes = piezas.map(function (el) { return el.getBoundingClientRect(); });
    cambia();
    var movio = false;
    piezas.forEach(function (el, i) {
      if (el === arrastrado) return;
      var r = el.getBoundingClientRect();
      var dx = antes[i].left - r.left, dy = antes[i].top - r.top;
      if (!dx && !dy) return;
      movio = true;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      // Dos fotogramas: el primero fija el punto de partida, el segundo anima.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
        });
      });
    });
    // RED DE SEGURIDAD: si de verdad no se ha movido nada, no se bloquea el gesto esperando una
    // animación que no existe.
    if (!movio) return;
    animando = true;
    clearTimeout(tAnim);
    tAnim = setTimeout(function () { animando = false; }, 190);
  }

  /* ⚠️⚠️ DÓNDE SE VA A QUEDAR: se compara el dedo con el CENTRO de cada pieza, EXCLUYENDO la que se
     arrastra. Antes se miraba «sobre qué pieza está el dedo» y se insertaba antes o después de ella,
     y eso NO ES SIMÉTRICO: hacia la izquierda bastaba con rozar la mitad del vecino, pero hacia la
     derecha el destino calculado era justo el hueco en el que ya estaba, así que no pasaba nada
     hasta cruzar pieza y media (bug real: «a la izquierda se ve dónde se va a colocar, a la derecha
     no»). Comparando centros, el umbral es EL MISMO en los dos sentidos. */
  function destinoPara(grupo, x, y) {
    var lista = items(grupo).filter(function (el) { return el !== arrastrado; });
    if (!lista.length) return null;
    var horiz = esHorizontal(grupo, lista);
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i].getBoundingClientRect();
      var centro = horiz ? (r.left + r.width / 2) : (r.top + r.height / 2);
      if ((horiz ? x : y) < centro) return lista[i];
    }
    return null;   // más allá del último: al final
  }

  // Horizontal o vertical lo dice CÓMO ESTÁN PUESTAS las piezas (una fila de pestañas o un menú
  // apilado), no la forma de una de ellas.
  function esHorizontal(grupo, lista) {
    lista = lista || items(grupo);
    if (lista.length < 2) return true;
    var a = lista[0].getBoundingClientRect(), b = lista[lista.length - 1].getBoundingClientRect();
    return Math.abs(b.left - a.left) >= Math.abs(b.top - a.top);
  }

  /* EL MISMO GESTO para lo que YA tiene su propio modo de ordenar: mantener pulsado un MÓDULO de
     Inicio entra en «Ordenar mi inicio», y mantener pulsado el MENÚ abre «Ordenar mi menú». No se
     duplica ningún motor: aquí solo se reconoce el gesto y se llama al suyo. */
  function gestoPropio(destino, x, y, pid) {
    var mod = destino.closest && destino.closest('[data-home-modules] .card, [data-home-modules] [data-home-module]');
    if (mod && !mod.hasAttribute('data-home-fixed') && window.app33HomeOrderEnter) {
      window.app33HomeOrderEnter(mod, x, y, pid);   // entra Y AGARRA: se sigue arrastrando sin soltar
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
      var objetivo = ev.target, ox = ev.clientX, oy = ev.clientY, opid = ev.pointerId;
      clearTimeout(timer);
      pulsando = { grupo: null, item: null, x: ev.clientX, y: ev.clientY };
      timer = setTimeout(function () {
        if (pulsando) { gestoPropio(objetivo, ox, oy, opid); pulsando = null; }
      }, 600);
      return;
    }
    var it = ev.target.closest('li, [data-sort-item]');
    if (!it || it.parentElement !== grupo) return;
    if (activo === grupo) {                      // ya está temblando: se arrastra
      agarra(it, ev.clientX, ev.clientY, ev.pointerId);
      ev.preventDefault();
      return;
    }
    // Mantener pulsado ~500 ms para entrar en el modo.
    pulsando = { grupo: grupo, item: it, x: ev.clientX, y: ev.clientY, pid: ev.pointerId };
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!pulsando) return;
      var p = pulsando; pulsando = null;
      entra(p.grupo);
      /* ⚠️⚠️ Y SE AGARRA YA, EN EL MISMO GESTO: el dedo sigue abajo, así que de aquí se sigue
         arrastrando sin soltar, que es lo que uno espera al mantener pulsado algo. Antes esto solo
         ponía a temblar las pestañas y había que SOLTAR y volver a cogerlas para moverlas: sin
         hacerlo, arrastrar no movía nada (bug real que se notaba como «hacia un lado va y hacia el
         otro no», según si quedaba un agarre suelto de antes). */
      agarra(p.item, p.x, p.y, p.pid);
    }, 500);
  }, true);

  document.addEventListener('pointermove', function (ev) {
    // Si se mueve el dedo antes de tiempo, es un scroll: no se entra en el modo.
    if (pulsando && (Math.abs(ev.clientX - pulsando.x) > 8 || Math.abs(ev.clientY - pulsando.y) > 8)) {
      clearTimeout(timer); pulsando = null;
    }
    if (!activo || !arrastrado) return;
    ev.preventDefault();
    // EL ARRASTRADO SIGUE AL DEDO (si no, se queda quieto y el gesto se siente muerto).
    if (agarre) {
      arrastrado.style.transform = 'translate(' + (ev.clientX - agarre.x) + 'px,'
        + (ev.clientY - agarre.y) + 'px)';
    }
    // ⚠️ Mientras la animación del hueco está en marcha, los rectángulos MIENTEN (están a mitad de
    // camino): recolocar ahí produce temblor y saltos. Se espera a que termine.
    if (animando) return;
    var destino = destinoPara(activo, ev.clientX, ev.clientY);
    // ⚠️⚠️ `nextElementSibling`, NO `nextSibling`: entre dos <li> hay un NODO DE TEXTO (el salto de
    // línea del HTML), así que con `nextSibling` esta guarda no acertaba NUNCA — se reordenaba a la
    // misma posición, eso disparaba el FLIP y su bandera `animando` bloqueaba los 190 ms
    // siguientes, con lo que el arrastre se quedaba clavado (bug real: «hacia un lado se ve dónde
    // se va a colocar y hacia el otro no»).
    if (destino === arrastrado || destino === arrastrado.nextElementSibling) return;   // ya está ahí
    flip(activo, function () { activo.insertBefore(arrastrado, destino); });
  }, { passive: false });

  function suelta() {
    clearTimeout(timer); pulsando = null;
    if (arrastrado) {
      // Vuelve a su hueco con animación, en vez de aparecer de golpe.
      arrastrado.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
      arrastrado.style.transform = '';
      arrastrado.classList.remove('is-dragging');
      arrastrado = null;
    }
    agarre = null;
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
