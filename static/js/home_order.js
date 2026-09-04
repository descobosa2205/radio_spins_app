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
    // ⚠️⚠️ NO HAY PANTALLA DE GUARDAR: se guarda al PINCHAR FUERA de los módulos, en cualquier
    // sitio (o con Escape). Una barra con «Guardar / Cancelar» es un paso más que nadie pide.
    void previo;
  }

  function sale(b) {
    if (!enModo) return;
    enModo = false;
    document.body.classList.remove('home-ordering');
    modulos().forEach(function (m) {
      m.classList.remove('home-order-item', 'is-dragging');
      m.style.transition = ''; m.style.transform = '';
      var g = m.querySelector('.home-order-grip');
      if (g) g.remove();
    });
    if (b && b.remove) b.remove();
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
  var arrastrando = null, agarre = null;

  /* ⚠️⚠️ DÓNDE SE VA A QUEDAR: se compara el dedo con el CENTRO de cada módulo, EXCLUYENDO el que
     se arrastra. Antes se miraba «sobre qué módulo está el dedo» y se insertaba antes o después de
     él, y eso NO ES SIMÉTRICO: en un sentido bastaba con rozar la mitad del vecino y en el otro el
     destino calculado era el hueco en el que ya estaba, así que no pasaba nada hasta cruzar módulo
     y medio (el mismo bug que en las pestañas). Comparando centros, el umbral es EL MISMO en los
     dos sentidos — y además no depende de `elementFromPoint`, que devuelve el propio módulo
     arrastrado cuando pasa por encima de los demás. */
  function destinoPara(y) {
    var lista = modulos().filter(function (el) { return el !== arrastrando; });
    for (var i = 0; i < lista.length; i++) {
      var r = lista[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return lista[i];
    }
    return null;   // más abajo del último: al final
  }

  /* FLIP: se apuntan las posiciones, se reordena y cada módulo se anima DESDE donde estaba. Sin
     esto el reordenado es un salto seco, que es lo que se siente «poco fluido». */
  var animando = false, tAnim = null;
  function flip(cambia) {
    var piezas = modulos(), antes = piezas.map(function (el) { return el.getBoundingClientRect(); });
    cambia();
    var movio = false;
    piezas.forEach(function (el, i) {
      if (el === arrastrando) return;
      var r = el.getBoundingClientRect();
      var dy = antes[i].top - r.top, dx = antes[i].left - r.left;
      if (!dx && !dy) return;
      movio = true;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
          el.style.transform = '';
        });
      });
    });
    // RED DE SEGURIDAD: si no se ha movido nada, no se bloquea el gesto por una animación que no hay.
    if (!movio) return;
    animando = true;
    clearTimeout(tAnim);
    tAnim = setTimeout(function () { animando = false; }, 190);
  }

  function mueve(ev) {
    if (!arrastrando) return;
    ev.preventDefault();
    // EL MÓDULO SIGUE AL DEDO: si se queda quieto, el gesto se siente muerto.
    if (agarre) {
      arrastrando.style.transform = 'translate(' + (ev.clientX - agarre.x) + 'px,'
        + (ev.clientY - agarre.y) + 'px)';
    }
    // ⚠️ Mientras la animación del hueco está en marcha, los rectángulos MIENTEN (están a mitad de
    // camino): recolocar ahí produce temblor y saltos. Se espera a que termine.
    if (animando) return;
    var destino = destinoPara(ev.clientY);
    // ⚠️⚠️ `nextElementSibling`, NO `nextSibling`: entre dos módulos hay un NODO DE TEXTO, así que
    // con `nextSibling` esta guarda no acertaba y se reordenaba a la MISMA posición, disparando el
    // FLIP y bloqueando el gesto los 190 ms siguientes.
    if (destino === arrastrando || destino === arrastrando.nextElementSibling) return;
    flip(function () { zona.insertBefore(arrastrando, destino); });
  }

  function suelta() {
    if (!arrastrando) return;
    arrastrando.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
    arrastrando.style.transform = '';
    arrastrando.classList.remove('is-dragging');
    arrastrando = null;
    agarre = null;
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
    agarre = { x: ev.clientX, y: ev.clientY };
    m.style.transition = 'none';
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

  // Se entra al modo también MANTENIENDO PULSADO un módulo (el mismo gesto que las pestañas):
  // lo dispara `sortable_tabs.js`, que no sabe nada de módulos — solo avisa.
  /* ⚠️⚠️ AL ENTRAR SE AGARRA YA: el dedo sigue abajo sobre el módulo, así que de aquí se sigue
     arrastrando SIN SOLTAR, que es lo que uno espera al mantener pulsado algo. Antes esto solo
     entraba en el modo y había que soltar y volver a coger el asa; sin hacerlo, arrastrar no movía
     nada (el mismo bug que tenían las pestañas). Se le pasa el módulo y dónde está el dedo. */
  window.app33HomeOrderEnter = function (destino, x, y, pid) {
    if (!zona) return;
    entra();
    if (!destino) return;
    var m = destino.closest && destino.closest('.home-order-item');
    if (!m || m.hasAttribute('data-home-fixed')) return;
    agarre = { x: x, y: y };
    m.style.transition = 'none';
    arrastrando = m;
    m.classList.add('is-dragging');
    try { m.setPointerCapture(pid); } catch (e) {}
    document.addEventListener('pointermove', mueve);
    document.addEventListener('pointerup', suelta);
    document.addEventListener('pointercancel', suelta);
  };

  /* SE GUARDA AL PINCHAR FUERA de los módulos, en cualquier sitio de la página. Mientras se ordena,
     un clic DENTRO de un módulo no navega (si no, arrastrar abriría lo que hay debajo). */
  document.addEventListener('click', function (ev) {
    if (!enModo) return;
    var dentro = ev.target.closest && ev.target.closest('.home-order-item');
    if (dentro) { ev.preventDefault(); ev.stopPropagation(); return; }
    guardar(modulos().map(clave));
    sale();
  }, true);
  document.addEventListener('keydown', function (ev) {
    if (enModo && ev.key === 'Escape') { guardar(modulos().map(clave)); sale(); }
  });
})();
