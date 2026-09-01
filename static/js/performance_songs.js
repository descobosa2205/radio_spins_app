/* ══════════════════════════════════════════════════════════════════════════════════════════════
   EL REPERTORIO DE UNA ACTIVIDAD · buscar escribiendo y ORDENAR ARRASTRANDO
   Motor ÚNICO del parcial `_performance_songs.html`, que usan el asistente de actividad y la
   sección «Actividad» de la ficha: así el repertorio se pone IGUAL en los dos sitios.

   ⚠️⚠️ ANTES ERA UN `<select multiple>` CON SELECT2 Y NO SE PODÍA USAR: dentro del asistente (un
   modal con scroll) su desplegable se queda detrás y no se abre — el clásico de esta app. Aquí la
   lista de sugerencias cuelga del `<body>` con `app33FloatList`, así que no la recorta ni el modal
   ni ningún bocadillo con `overflow`.

   ⚠️ Va por DELEGACIÓN en `document` y es GLOBAL: la sección «Actividad» de la ficha vive dentro de
   una zona `data-inline-zone` que se REEMPLAZA al guardar, y un `<script>` de dentro no se volvería
   a ejecutar (regla de la casa).

   ⚠️ El ORDEN DEL DOM **es** el orden que se guarda: cada fila lleva dentro su
   `<input type="hidden" name="performance_song_ids[]">`. Al arrastrar no hay nada que recalcular.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33PerfSongs) return;              // por si una pantalla lo carga dos veces

  var caja = null;            // la lista de sugerencias (una sola para toda la página)
  var activo = null;          // el bloque que la está usando
  var dejarDeSeguir = null;   // para dejar de recolocarla al cerrarla
  var ALTO_MAX = 320;         // una lista más alta tapa media pantalla y no se deja deslizar

  function norm(t) {
    return String(t == null ? '' : t).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function bloque(el) { return el ? el.closest('[data-perf-songs]') : null; }
  function filas(root) {
    var c = root ? root.querySelector('[data-perf-rows]') : null;
    return c ? Array.prototype.slice.call(c.querySelectorAll('[data-perf-row]')) : [];
  }
  /* El repertorio del artista: del JSON que deja el servidor y, si la pantalla lo cambia (el
     asistente, al elegir otro artista), de lo que le pase `setCatalog`. */
  function catalogo(root) {
    if (!root) return [];
    if (!root.__catalogo) {
      var js = root.querySelector('[data-perf-catalog]');
      var datos = [];
      try { datos = JSON.parse((js && js.textContent) || '[]') || []; } catch (e) { datos = []; }
      root.__catalogo = datos.map(function (x) {
        return { id: String((x && (x.id != null ? x.id : x.song_id)) || ''),
                 title: (x && x.title) || '', cover_url: (x && x.cover_url) || '' };
      }).filter(function (x) { return !!x.id; });
    }
    return root.__catalogo;
  }
  function renumera(root) {
    filas(root).forEach(function (f, i) {
      var n = f.querySelector('[data-perf-n]');
      if (n) n.textContent = (i + 1) + '.';
    });
    /* El «Nº de canciones» sigue a lo elegido MIENTRAS nadie lo haya escrito a mano (el patrón
       `dataset.touched` de la casa: en cuanto se escribe un número, ese manda). */
    var id = root.getAttribute('data-perf-count') || '';
    var cuenta = id ? document.getElementById(id) : null;
    if (cuenta && !cuenta.dataset.touched) {
      var n = filas(root).length;
      cuenta.value = n ? String(n) : '';
    }
  }
  /* La PORTADA de la canción (con la de «sin portada» de la casa como respaldo): es como se
     reconoce un tema de un golpe, y sale igual en la lista y en las filas ya elegidas. */
  function portada(url) {
    var src = (url || '').trim() || (document.body.getAttribute('data-default-cover-url') || '');
    if (!src) return '<span class="wz-song__cover"><i class="fa fa-music text-muted"></i></span>';
    // Si la portada no se puede leer se queda el hueco (no un cuadro roto): la nota la pone el CSS.
    return '<img class="wz-song__cover" src="' + esc(src) + '" alt="" onerror="this.remove()">';
  }

  function añade(root, id, title, cover) {
    var cont = root.querySelector('[data-perf-rows]');
    if (!cont || !id) return;
    if (filas(root).some(function (f) { return f.getAttribute('data-perf-row') === String(id); })) return;
    var f = document.createElement('div');
    f.className = 'wz-song';
    f.draggable = true;
    f.setAttribute('data-perf-row', String(id));
    f.innerHTML =
      '<span class="wz-song__grip" title="Arrastra para cambiar el orden"><i class="fa fa-grip-vertical"></i></span>' +
      '<span class="wz-song__n" data-perf-n></span>' +
      portada(cover) +
      '<span class="wz-song__t">' + esc(title) + '</span>' +
      '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-auto" data-perf-del title="Quitar"><i class="fa fa-xmark"></i></button>' +
      '<input type="hidden" name="performance_song_ids[]" value="' + esc(id) + '">';
    cont.appendChild(f);
    renumera(root);
  }

  function laCaja() {
    if (caja) return caja;
    caja = document.createElement('div');
    caja.className = 'ta-results';
    document.body.appendChild(caja);
    if (window.app33FloatList) window.app33FloatList.attach(caja);
    // `mousedown`: con `click` el `blur` del campo ya habría cerrado la lista.
    caja.addEventListener('mousedown', function (ev) {
      var it = ev.target.closest('[data-perf-pick]');
      if (!it || !activo) return;
      ev.preventDefault();
      añade(activo, it.getAttribute('data-perf-pick'), it.getAttribute('data-perf-title'),
            it.getAttribute('data-perf-cover'));
      var input = activo.querySelector('[data-perf-input]');
      if (input) { input.value = ''; input.focus(); }
      pinta(activo);
    });
    return caja;
  }
  function cierra() {
    if (caja) caja.style.display = 'none';
    if (dejarDeSeguir) { dejarDeSeguir(); dejarDeSeguir = null; }
  }
  function resultados(root) {
    var input = root.querySelector('[data-perf-input]');
    var q = norm(input ? input.value : '');
    var puestas = {};
    filas(root).forEach(function (f) { puestas[f.getAttribute('data-perf-row')] = true; });
    var todas = catalogo(root).filter(function (x) { return !puestas[x.id]; });
    var hay = q ? todas.filter(function (x) { return norm(x.title).indexOf(q) >= 0; }) : todas;
    return hay.slice(0, 12);
  }
  function pinta(root) {
    var input = root && root.querySelector('[data-perf-input]');
    if (!input) return;
    activo = root;
    var lista = resultados(root);
    var b = laCaja();
    if (lista.length) {
      b.innerHTML = lista.map(function (x) {
        return '<button type="button" class="ta-item" data-perf-pick="' + esc(x.id) + '"' +
          ' data-perf-title="' + esc(x.title) + '" data-perf-cover="' + esc(x.cover_url || '') + '">' +
          portada(x.cover_url) +
          '<span class="ta-item__t">' + esc(x.title) + '</span></button>';
      }).join('');
    } else if (!catalogo(root).length) {
      // Se DICE por qué no sale nada, en vez de no pasar nada al escribir.
      b.innerHTML = '<div class="px-2 py-2 small text-muted">Este artista todavía no tiene canciones en el repertorio.</div>';
    } else {
      cierra();
      return;
    }
    /* ⚠️⚠️ La lista SIGUE AL CAMPO: es `position:fixed`, así que sin esto se quedaba QUIETA al mover
       la página (o el cuerpo del modal) y las opciones acababan flotando sobre otra cosa. Y sale
       SIEMPRE hacia abajo, con tope de alto para que se pueda deslizar por dentro. */
    var opts = { abajo: true, max: ALTO_MAX };
    if (window.app33FloatList) {
      window.app33FloatList.ensureRoom(input, opts);
      b.style.display = 'block';
      window.app33FloatList.place(input, b, opts);
      if (dejarDeSeguir) dejarDeSeguir();
      dejarDeSeguir = window.app33FloatList.follow(input, b, opts, cierra);
    } else {
      b.style.display = 'block';
    }
  }

  // ── El buscador ────────────────────────────────────────────────────────────────────────────
  document.addEventListener('input', function (ev) {
    if (ev.target.matches('[data-perf-input]')) { pinta(bloque(ev.target)); return; }
    // Un número escrito a mano manda sobre el automático.
    if (ev.target.matches('input[name="performance_songs_count"]')) ev.target.dataset.touched = '1';
  });
  document.addEventListener('focusin', function (ev) {
    if (ev.target.matches('[data-perf-input]')) pinta(bloque(ev.target));
  });
  document.addEventListener('focusout', function (ev) {
    if (ev.target.matches('[data-perf-input]')) setTimeout(cierra, 180);
  });
  document.addEventListener('keydown', function (ev) {
    if (!ev.target.matches('[data-perf-input]')) return;
    var root = bloque(ev.target);
    if (ev.key === 'Enter') {
      // ⚠️ Enter NO envía el formulario: añade la primera coincidencia.
      ev.preventDefault();
      var primera = resultados(root)[0];
      if (primera) { añade(root, primera.id, primera.title); ev.target.value = ''; pinta(root); }
    } else if (ev.key === 'Escape') { cierra(); }
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-perf-del]');
    if (!b) return;
    var root = bloque(b);
    var fila = b.closest('[data-perf-row]');
    if (fila) fila.remove();
    renumera(root);
  });

  // ── ARRASTRAR PARA ORDENAR ────────────────────────────────────────────────────────────────
  /* La fila se MUEVE de verdad mientras se arrastra (`insertBefore` según la mitad de la fila por
     la que se pasa), así se ve dónde va a quedar antes de soltarla.
     ⚠️ `setData` es obligatorio: sin él, el arrastre global de ficheros (`file_drop.js`) toma el
     gesto por una carga de archivos. */
  var moviendo = null;
  document.addEventListener('dragstart', function (ev) {
    var fila = ev.target.closest ? ev.target.closest('[data-perf-row]') : null;
    if (!fila) return;
    moviendo = fila;
    fila.classList.add('is-drag');
    try { ev.dataTransfer.setData('text/plain', fila.getAttribute('data-perf-row') || ''); } catch (e) {}
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragover', function (ev) {
    if (!moviendo) return;
    var cont = moviendo.parentElement;
    var sobre = ev.target.closest ? ev.target.closest('[data-perf-row]') : null;
    if (!sobre || !cont || sobre.parentElement !== cont) return;
    ev.preventDefault();
    if (sobre === moviendo) return;
    var r = sobre.getBoundingClientRect();
    cont.insertBefore(moviendo, ((ev.clientY - r.top) > (r.height / 2)) ? sobre.nextSibling : sobre);
  });
  document.addEventListener('drop', function (ev) { if (moviendo) ev.preventDefault(); });
  document.addEventListener('dragend', function () {
    if (!moviendo) return;
    moviendo.classList.remove('is-drag');
    var root = bloque(moviendo);
    moviendo = null;
    renumera(root);
  });

  window.app33PerfSongs = {
    /* Cambiar el repertorio que se busca (el asistente lo llama al elegir otro artista). */
    setCatalog: function (root, songs) {
      if (!root) return;
      root.__catalogo = (songs || []).map(function (x) {
        return { id: String((x && (x.id != null ? x.id : x.song_id)) || ''),
                 title: (x && x.title) || '', cover_url: (x && x.cover_url) || '' };
      }).filter(function (x) { return !!x.id; });
      if (activo === root) pinta(root);
    },
    /* Vaciar lo elegido (al cambiar de artista, lo de antes era de otro repertorio). */
    clear: function (root) {
      var c = root && root.querySelector('[data-perf-rows]');
      if (c) c.innerHTML = '';
      if (root) renumera(root);
    },
    /* Los ids elegidos, EN SU ORDEN (por si alguna pantalla los necesita). */
    ids: function (root) {
      return filas(root).map(function (f) { return f.getAttribute('data-perf-row'); });
    },
  };
})();
