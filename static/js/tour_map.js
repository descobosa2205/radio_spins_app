/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LA FICHA DE UNA GIRA / CICLO · el MAPA DE LA RUTA y el POP-UP para vincular fechas
   ----------------------------------------------------------------------------------------------
   EL MAPA DE LA RUTA · las fechas de una gira (o de un ciclo) sobre el mapa, NUMERADAS
   ----------------------------------------------------------------------------------------------
   ⚠️⚠️ Lo pidió Dani (sep 2026): «el listado de fechas como está ahora y debajo un mapa con las
   fechas enumeradas, y enumera el listado, con una chincheta con el número».
   El número es el MISMO en los dos sitios (el orden del listado, cronológico), que es lo que
   permite leer la lista y el mapa a la vez: la chincheta 3 es la tercera fila.

   · Al pasar el ratón por una fila, su chincheta se levanta y el mapa se mueve hasta ella.
   · Al pinchar una chincheta, se abre su ficha desde el globo.
   · La ruta se dibuja punteada en el orden de las fechas (se ve el viaje de un vistazo).

   ⚠️ Leaflet se carga BAJO DEMANDA (solo en las pantallas que tienen mapa), igual que en la hoja
   de ruta. Y el motor es GLOBAL y por delegación: estas zonas se repintan por AJAX.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33TourMap) return;

  var OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var CARGANDO = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  function ensureLeaflet(cb) {
    if (window.L && window.L.map) { cb(); return; }
    if (!CARGANDO) {
      CARGANDO = new Promise(function (resolve) {
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        var js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = resolve; js.onerror = resolve;
        document.head.appendChild(js);
      });
    }
    CARGANDO.then(function () { if (window.L && window.L.map) cb(); });
  }

  /* LA CHINCHETA: una lágrima con el número dentro. Verde si la fecha está CONFIRMADA y en el rojo
     de la casa si todavía no, que es la misma lectura que las etiquetas del listado. */
  function pinHtml(p) {
    var clase = 'tour-pin' + ((p.status || '').toUpperCase() === 'CONFIRMADO' ? ' is-done' : '');
    return '<div class="' + clase + '" data-pin="' + esc(p.n) + '"><span>' + esc(p.n) + '</span></div>';
  }

  function popupHtml(p) {
    var sitio = [p.venue_name, p.municipality].filter(Boolean).map(esc).join(' · ');
    return '<div class="tour-pop">' +
      '<div class="tour-pop__n">' + esc(p.n) + '</div>' +
      '<div class="tour-pop__b">' +
        '<div class="tour-pop__d">' + esc(p.date_label) + '</div>' +
        (sitio ? '<div class="tour-pop__v">' + sitio + '</div>' : '') +
        (p.artist_name ? '<div class="tour-pop__a">' + esc(p.artist_name) + '</div>' : '') +
        (p.status_label ? '<span class="tour-pop__s">' + esc(p.status_label) + '</span>' : '') +
        '<a class="tour-pop__go" href="' + esc(p.url) + '">Abrir la ficha</a>' +
      '</div></div>';
  }

  function pinta(box) {
    if (!box || box.dataset.beDone) return;
    var puntos = [];
    try { puntos = JSON.parse(box.getAttribute('data-points') || '[]'); } catch (e) { puntos = []; }
    if (!puntos.length) return;
    box.dataset.beDone = '1';
    ensureLeaflet(function () {
      if (!document.body.contains(box)) return;
      try {
        var map = L.map(box, { scrollWheelZoom: false });
        L.tileLayer(OSM, { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
        var coords = [], marcas = {};
        puntos.forEach(function (p) {
          var icono = L.divIcon({
            className: 'tour-pin-wrap', html: pinHtml(p),
            iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -38],
          });
          var m = L.marker([p.lat, p.lng], { icon: icono, title: p.n + ' · ' + (p.venue_name || '') }).addTo(map);
          m.bindPopup(popupHtml(p));
          marcas[String(p.n)] = m;
          coords.push([p.lat, p.lng]);
        });
        // LA RUTA: une las fechas en su orden, punteada para que no tape las chinchetas.
        if (coords.length > 1) {
          L.polyline(coords, { color: '#E33D48', weight: 3, opacity: .7, dashArray: '7 7' }).addTo(map);
          // ⚠️ El margen va en PÍXELES: con `pad()` (que es proporcional) el encuadre se quedaba
          // lejísimos y la ruta se veía diminuta en medio del mapa.
          map.fitBounds(L.latLngBounds(coords), { padding: [34, 34] });
        } else {
          map.setView(coords[0], 12);
        }
        box.__mapa = map;
        box.__marcas = marcas;
        // ⚠️ Si el mapa nace dentro de una pestaña OCULTA, Leaflet no sabe cuánto mide y se queda
        // en gris: al enseñarla hay que decírselo.
        document.addEventListener('shown.bs.tab', function () {
          try { map.invalidateSize(); } catch (e) {}
        });
      } catch (e) { /* el mapa es una AYUDA: si falla, el listado sigue estando */ }
    });
  }

  function pintaTodos() {
    document.querySelectorAll('[data-tour-map]').forEach(pinta);
  }

  /* LISTADO ↔ MAPA: al pasar el ratón por una fila, su chincheta se levanta y el mapa va a ella. */
  function resalta(n, encendido) {
    document.querySelectorAll('[data-tour-map]').forEach(function (box) {
      var m = box.__marcas ? box.__marcas[String(n)] : null;
      if (!m) return;
      var el = m.getElement ? m.getElement() : null;
      var pin = el ? el.querySelector('.tour-pin') : null;
      if (pin) pin.classList.toggle('is-on', !!encendido);
      // ⚠️ Solo se mueve el mapa si esa fecha NO se está viendo: moverlo cuando ya está delante
      // desencuadra la ruta entera por pasar el ratón por encima de una fila.
      if (encendido && box.__mapa) {
        try {
          if (!box.__mapa.getBounds().contains(m.getLatLng())) {
            box.__mapa.panTo(m.getLatLng(), { animate: true, duration: .4 });
          }
        } catch (e) {}
      }
    });
    document.querySelectorAll('[data-tour-row="' + n + '"]').forEach(function (fila) {
      fila.classList.toggle('is-on', !!encendido);
    });
  }

  document.addEventListener('mouseover', function (e) {
    var fila = e.target.closest ? e.target.closest('[data-tour-row]') : null;
    if (fila) resalta(fila.getAttribute('data-tour-row'), true);
  });
  document.addEventListener('mouseout', function (e) {
    var fila = e.target.closest ? e.target.closest('[data-tour-row]') : null;
    if (fila) resalta(fila.getAttribute('data-tour-row'), false);
  });


  /* ──────────────────────────────────────────────────────────────────────────────────────────
     VINCULAR FECHAS · el pop-up con el listado y VARIAS a la vez
     ⚠️ Lo pidió Dani (sep 2026): antes era un desplegable de una en una, así que meter ocho
     fechas eran ocho envíos. Aquí se buscan, se marcan las que sean y se vinculan de un golpe.
     ⚠️ Por DELEGACIÓN y montándose en el propio evento: el pop-up se pinta en una ficha cuyas
     zonas se repintan por AJAX, y `shown.bs.modal` no siempre llega.
     ────────────────────────────────────────────────────────────────────────────────────────── */
  function norm(v) {
    return String(v == null ? '' : v).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function ldCuenta(form) {
    if (!form) return;
    var marcadas = form.querySelectorAll('input[name="concert_ids"]:checked').length;
    var rotulo = form.querySelector('[data-ld-count]');
    var boton = form.querySelector('[data-ld-submit]');
    if (rotulo) {
      rotulo.textContent = !marcadas ? 'Ninguna seleccionada'
        : (marcadas === 1 ? '1 fecha seleccionada' : marcadas + ' fechas seleccionadas');
    }
    if (boton) {
      boton.disabled = !marcadas;
      boton.innerHTML = '<i class="fa fa-link me-1"></i>Vincular' + (marcadas ? ' (' + marcadas + ')' : '');
    }
  }

  function ldFiltra(form) {
    if (!form) return;
    var campo = form.querySelector('[data-ld-search]');
    var texto = norm(campo ? campo.value : '').trim();
    var vistas = 0;
    form.querySelectorAll('[data-ld-item]').forEach(function (fila) {
      var casa = !texto || norm(fila.getAttribute('data-ld-search-key') || '').indexOf(texto) >= 0;
      fila.classList.toggle('d-none', !casa);
      if (casa) vistas++;
    });
    var vacio = form.querySelector('[data-ld-empty]');
    if (vacio) vacio.classList.toggle('d-none', vistas > 0);
  }

  document.addEventListener('input', function (e) {
    if (e.target.matches && e.target.matches('[data-ld-search]')) ldFiltra(e.target.closest('[data-ld-form]'));
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('input[name="concert_ids"]')) {
      ldCuenta(e.target.closest('[data-ld-form]'));
    }
  });
  document.addEventListener('click', function (e) {
    var todas = e.target.closest ? e.target.closest('[data-ld-all]') : null;
    if (!todas) return;
    e.preventDefault();
    var form = todas.closest('[data-ld-form]');
    if (!form) return;
    // «Seleccionar todas» actúa sobre LO QUE SE ESTÁ VIENDO (si hay un filtro puesto, solo esas):
    // marcar a ciegas lo que el buscador esconde es la forma de vincular algo sin querer.
    var visibles = [].slice.call(form.querySelectorAll('[data-ld-item]:not(.d-none) input[name="concert_ids"]'));
    var faltan = visibles.some(function (x) { return !x.checked; });
    visibles.forEach(function (x) { x.checked = faltan; });
    ldCuenta(form);
  });

  document.addEventListener('DOMContentLoaded', pintaTodos);
  document.addEventListener('inline:updated', pintaTodos);
  document.addEventListener('ficha:shown', pintaTodos);
  if (document.readyState !== 'loading') { try { pintaTodos(); } catch (e) {} }

  window.app33TourMap = { draw: pintaTodos, highlight: resalta, linkCount: ldCuenta };
})();
