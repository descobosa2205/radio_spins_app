/* FORMULARIO DE UNA MAQUETA · el MISMO dentro y en el enlace público de envío de demos.
 *
 * Se engancha a cualquier `[data-demo-form]` y se encarga de:
 *  · los AUTORES (filas que se añaden, con buscador de terceros: el mismo patrón que los masters),
 *  · la PORTADA (vista previa de lo que se arrastre o se elija),
 *  · los PRODUCTORES (varios: un tema lo pueden producir dos personas), con el mismo buscador y el
 *    «+» para crear el tercero con lo escrito,
 *  · el AUDIO: calcula su HUELLA (sha256) y pregunta al servidor si ese MISMO archivo ya está subido
 *    —si lo está, avisa con el nombre que tiene y deja subirlo igualmente o no—, y después lo sube
 *    DIRECTAMENTE a Storage con barra de progreso (una maqueta puede pesar como un master).
 *
 * ⚠️⚠️ SE PUEDEN SUBIR VARIAS DE UNA VEZ: al elegir varios archivos sale UNA FILA POR MAQUETA con su
 * hueco para el nombre; lo que se escribe se queda en ESA fila (sus ocultos van dentro de ella, así
 * que el orden del DOM es el orden con el que se guardan). Todo lo demás es común al bloque.
 * Editando una maqueta el múltiple se apaga (`elAudio.multiple = false`): ahí solo hay una.
 *
 * ⚠️ La huella la calcula el navegador, pero la decisión es del SERVIDOR: `_demo_duplicate_check` lo
 * vuelve a comprobar, así que saltarse este JS no cuela una maqueta repetida sin avisar.
 */
(function () {
  'use strict';

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function csrf() {
    var t = document.querySelector('meta[name="csrf-token"]');
    return t ? (t.getAttribute('content') || '') : '';
  }
  function postJson(url, datos) {
    var cab = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (csrf()) cab['X-CSRFToken'] = csrf();
    return fetch(url, { method: 'POST', headers: cab, body: JSON.stringify(datos || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  /* ⚠️ Las listas de sugerencias van FUERA de su bocadillo: `.demo-card` lleva `overflow:hidden` (por
     su border-radius) y el cuerpo del modal tiene scroll, así que dentro se veían RECORTADAS. El
     punto único es `app33FloatList` (typeahead.js); si no estuviera cargado, no se hace nada y la
     lista se queda donde estaba. */
  function flota(input, lista) {
    try {
      if (!window.app33FloatList) return;
      // ⚠️ Al sacarla del formulario deja de ser descendiente de su fila, así que la fila (y el campo)
      // se guardan EN la lista: es de donde los leen los clics, que ya no pueden usar `closest`.
      lista.__input = input;
      lista.__fila = input.closest('[data-demo-author],[data-demo-producer]') || null;
      if (lista.__fila) lista.__fila.__lista = lista;
      window.app33FloatList.ensureRoom(input);
      window.app33FloatList.attach(lista);
      window.app33FloatList.place(input, lista);
      if (!lista.__sigue) {
        lista.__sigue = function () {
          if (lista.classList.contains('d-none')) return;
          window.app33FloatList.place(lista.__input, lista);
        };
        window.addEventListener('scroll', lista.__sigue, true);
        window.addEventListener('resize', lista.__sigue);
      }
    } catch (e) {}
  }

  /* ---------- La HUELLA del archivo (sha256) ---------- */
  function huella(file) {
    if (!window.crypto || !crypto.subtle || !file) return Promise.resolve('');
    return file.arrayBuffer()
      .then(function (buf) { return crypto.subtle.digest('SHA-256', buf); })
      .then(function (h) {
        return Array.prototype.map.call(new Uint8Array(h), function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      })
      .catch(function () { return ''; });     // si no se puede, lo comprueba el servidor al subirla
  }

  function init(form) {
    if (!form || form.dataset.demoFormReady === '1') return;
    form.dataset.demoFormReady = '1';

    var elAudio = form.querySelector('[data-demo-audio]');
    var elSha = form.querySelector('[data-demo-sha]');
    var elDupOk = form.querySelector('[data-demo-dup-ok]');
    var cajaDup = form.querySelector('[data-demo-dup-box]');
    var nombreAudio = form.querySelector('[data-demo-audio-name]');
    var elUploaded = form.querySelector('[data-demo-uploaded]');
    var zonaProg = form.querySelector('[data-demo-progress]');
    var barra = form.querySelector('[data-demo-progress-bar]');
    var urlFirma = form.getAttribute('data-sign-url') || '';
    var urlCheck = form.getAttribute('data-check-url') || '';

    /* ---------- PORTADA: vista previa ---------- */
    var elCover = form.querySelector('[data-demo-cover]');
    if (elCover) {
      elCover.addEventListener('change', function () {
        var f = elCover.files && elCover.files[0];
        var nom = form.querySelector('[data-demo-cover-name]');
        var vista = form.querySelector('[data-demo-cover-preview]');
        if (nom) nom.textContent = f ? f.name : '';
        if (f && vista) { try { vista.src = URL.createObjectURL(f); } catch (e) {} }
        var quitar = form.querySelector('[data-demo-cover-remove]');
        if (f && quitar) quitar.checked = false;
      });
    }

    /* ---------- VARIAS MAQUETAS DE UNA VEZ: una FILA por archivo ----------
       El artista, la portada, los autores, el productor, la letra y las notas son COMUNES al bloque;
       lo único de cada maqueta es su audio y su NOMBRE, que se escribe en su propia fila. */
    var lista = form.querySelector('[data-demo-list]');
    var tplFila = form.querySelector('[data-demo-track-tpl]');
    var cardTitulo = form.querySelector('[data-demo-title-card]');
    var elTitulo = form.querySelector('[data-demo-title]');

    // ⚠️ Editando una maqueta el múltiple se apaga (solo hay una): lo decide el propio campo.
    function multi() { return !!(elAudio && elAudio.multiple && lista && tplFila); }
    function pistas() {
      return lista ? Array.prototype.slice.call(lista.querySelectorAll('[data-demo-track]')) : [];
    }
    /* Con filas, el nombre se pone en cada una: el hueco común del título se esconde y se
       DESHABILITA (un campo oculto y obligatorio bloquearía el guardado). */
    function repasaTitulo() {
      var n = pistas().length;
      if (lista) lista.classList.toggle('d-none', n === 0);
      if (cardTitulo) cardTitulo.classList.toggle('d-none', n > 0);
      if (elTitulo) elTitulo.disabled = (n > 0);
    }
    // El nombre del archivo vale como primer título (así ninguna fila nace vacía).
    function nombreLimpio(nombre) {
      var t = String(nombre || '').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
      return t.replace(/\s+/g, ' ').trim();
    }
    function avisaRepetida(fila, js) {
      var caja = fila.querySelector('[data-demo-track-warn]');
      if (!caja) return;
      fila.classList.add('is-bad');
      fila.dataset.dupTitle = js.title || '';
      caja.innerHTML = '<i class="fa fa-triangle-exclamation me-1"></i>Ese mismo audio ya está subido como «'
        + esc(js.title || 'sin título') + '». '
        + '<button class="btn btn-sm btn-link p-0 align-baseline" type="button" data-demo-track-dupsi>Subirla igualmente</button>'
        + ' · <button class="btn btn-sm btn-link p-0 align-baseline text-danger" type="button" data-demo-track-dupno>Quitarla</button>';
      caja.classList.remove('d-none');
    }
    function anadeFila(file) {
      if (!tplFila || !lista || !file) return null;
      var nodo = tplFila.content.firstElementChild.cloneNode(true);
      nodo.__file = file;
      var nom = nodo.querySelector('[data-demo-track-file]');
      if (nom) { nom.textContent = file.name; nom.title = file.name; }
      nodo.querySelector('[data-demo-track-name]').value = file.name;
      var campo = nodo.querySelector('[data-demo-track-title]');
      var oculto = nodo.querySelector('[data-demo-track-title-hidden]');
      campo.value = nombreLimpio(file.name);
      oculto.value = campo.value;
      lista.appendChild(nodo);
      repasaTitulo();
      // La HUELLA y, con ella, el aviso de que ese MISMO audio ya está subido.
      huella(file).then(function (sha) {
        var h = nodo.querySelector('[data-demo-track-sha]');
        if (h) h.value = sha || '';
        if (!sha || !urlCheck) return;
        postJson(urlCheck, { sha256: sha }).then(function (js) {
          if (js && js.duplicate) avisaRepetida(nodo, js);
        });
      });
      return nodo;
    }
    if (lista) {
      // Lo que se escribe se queda en SU maqueta (el oculto va dentro de la fila).
      lista.addEventListener('input', function (ev) {
        var campo = ev.target.closest('[data-demo-track-title]');
        if (!campo) return;
        var fila = campo.closest('[data-demo-track]');
        if (fila) fila.querySelector('[data-demo-track-title-hidden]').value = campo.value;
      });
      lista.addEventListener('click', function (ev) {
        var quitar = ev.target.closest('[data-demo-track-del], [data-demo-track-dupno]');
        if (quitar) {
          var f1 = quitar.closest('[data-demo-track]');
          if (f1) f1.remove();
          repasaTitulo();
          return;
        }
        var si = ev.target.closest('[data-demo-track-dupsi]');
        if (si) {
          var f2 = si.closest('[data-demo-track]');
          if (!f2) return;
          f2.querySelector('[data-demo-track-dup]').value = '1';
          f2.classList.remove('is-bad');
          var w = f2.querySelector('[data-demo-track-warn]');
          w.innerHTML = '<i class="fa fa-circle-check me-1"></i>Se subirá igualmente. Ponle un nombre '
            + 'distinto de «' + esc(f2.dataset.dupTitle || '') + '».';
          var t = f2.querySelector('[data-demo-track-title]');
          if (t) { t.focus(); t.select(); }
        }
      });
      repasaTitulo();
    }

    /* ---------- AUDIO: nombre, huella y aviso de repetida ---------- */
    if (elAudio) {
      elAudio.addEventListener('change', function () {
        if (multi()) {
          var elegidos = Array.prototype.slice.call(elAudio.files || []);
          elegidos.forEach(anadeFila);
          // ⚠️ El campo se VACÍA: los archivos ya están en sus filas, así que se pueden añadir más
          // en otra tanda (y volver a elegir el mismo si se ha quitado).
          elAudio.value = '';
          if (nombreAudio) {
            nombreAudio.textContent = elegidos.length
              ? (elegidos.length + (elegidos.length === 1 ? ' audio añadido' : ' audios añadidos'))
              : '';
          }
          return;
        }
        var f = elAudio.files && elAudio.files[0];
        if (nombreAudio) nombreAudio.textContent = f ? f.name : '';
        if (elUploaded) elUploaded.value = '';
        if (elDupOk) elDupOk.value = '';
        if (cajaDup) { cajaDup.classList.add('d-none'); cajaDup.innerHTML = ''; }
        if (elSha) elSha.value = '';
        if (!f) return;
        huella(f).then(function (sha) {
          if (elSha) elSha.value = sha || '';
          if (!sha || !urlCheck) return;
          postJson(urlCheck, { sha256: sha }).then(function (js) {
            if (!js || !js.duplicate || !cajaDup) return;
            // Ese MISMO audio ya está subido: se dice con qué nombre y se deja decidir.
            cajaDup.innerHTML =
              '<div class="fw-semibold mb-1"><i class="fa fa-triangle-exclamation me-1"></i>'
              + 'Esta demo ya está subida con el nombre de «' + esc(js.title || 'sin título') + '»'
              + (js.artist ? ' (' + esc(js.artist) + ')' : '') + '.</div>'
              + '<div class="small mb-2">Si es la misma, no hace falta subirla otra vez. Si quieres '
              + 'subirla igualmente, ponle otro nombre para diferenciarlas.</div>'
              + '<div class="d-flex gap-2 flex-wrap">'
              + '<button class="btn btn-sm btn-outline-danger" type="button" data-demo-dup-si>Subirla igualmente</button>'
              + '<button class="btn btn-sm btn-outline-secondary" type="button" data-demo-dup-no>Quitar el audio</button>'
              + '</div>';
            cajaDup.classList.remove('d-none');
            cajaDup.dataset.dupTitle = js.title || '';
          });
        });
      });
    }

    form.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-demo-dup-si]')) {
        if (elDupOk) elDupOk.value = '1';
        if (cajaDup) {
          cajaDup.innerHTML = '<div class="small"><i class="fa fa-circle-check me-1"></i>Se subirá igualmente. '
            + 'Ponle un nombre distinto de «' + esc(cajaDup.dataset.dupTitle || '') + '».</div>';
        }
        var t = form.querySelector('[data-demo-title]');
        if (t) t.focus();
        return;
      }
      if (ev.target.closest('[data-demo-dup-no]')) {
        if (elAudio) { elAudio.value = ''; }
        if (nombreAudio) nombreAudio.textContent = '';
        if (elSha) elSha.value = '';
        if (elDupOk) elDupOk.value = '';
        if (cajaDup) { cajaDup.classList.add('d-none'); cajaDup.innerHTML = ''; }
        return;
      }
    });

    /* ---------- QUIÉN LA MANDA ----------
       Una sola barra que busca en terceros, personal y artistas; si no está, se crea el tercero con lo
       escrito. Lo elegido se guarda como nombre (y, si es un tercero, también su ficha). */
    var zonaQuien = form.querySelector('[data-demo-sender]');
    if (zonaQuien) {
      var campoQuien = zonaQuien.querySelector('[data-demo-sender-input]');
      var nombreQuien = zonaQuien.querySelector('[data-demo-sender-name]');
      var terceroQuien = zonaQuien.querySelector('[data-demo-sender-promoter]');
      var listaQuien = zonaQuien.querySelector('[data-demo-sender-list]');
      var elegidoQuien = zonaQuien.querySelector('[data-demo-sender-picked]');
      var urlBuscaQuien = zonaQuien.getAttribute('data-search-url') || '';
      var urlCrearQuien = zonaQuien.getAttribute('data-create-url') || '';
      var esperaQuien = null;

      function pintaElegido(texto) {
        if (elegidoQuien) elegidoQuien.textContent = texto || '';
      }

      campoQuien.addEventListener('input', function () {
        // Lo escrito vale como nombre aunque no sea nadie de la base.
        nombreQuien.value = campoQuien.value;
        terceroQuien.value = '';
        pintaElegido('');
        var q = campoQuien.value.trim();
        if (!urlBuscaQuien || q.length < 2) { listaQuien.classList.add('d-none'); return; }
        clearTimeout(esperaQuien);
        esperaQuien = setTimeout(function () {
          fetch(urlBuscaQuien + '?q=' + encodeURIComponent(q),
                { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (js) {
              var filas = (js && js.rows) || [];
              var html = filas.map(function (o) {
                return '<button class="demo-author__opt" type="button" data-demo-sender-pick'
                  + ' data-kind="' + esc(o.kind) + '" data-id="' + esc(o.id) + '"'
                  + ' data-name="' + esc(o.name) + '">'
                  + (o.photo_url ? '<img src="' + esc(o.photo_url) + '" alt="" data-avatar="1">'
                                 : '<i class="fa fa-user"></i>')
                  + '<span>' + esc(o.name) + '</span>'
                  + '<span class="badge text-bg-light border ms-auto">' + esc(o.kind_label) + '</span>'
                  + '</button>';
              }).join('');
              // Si no está en la base, se puede crear el tercero con lo escrito.
              if (urlCrearQuien) {
                html += '<button class="demo-author__opt" type="button" data-demo-sender-create>'
                  + '<i class="fa fa-plus text-success"></i><span>Crear «' + esc(q) + '» como tercero</span></button>';
              }
              listaQuien.innerHTML = html;
              listaQuien.classList.remove('d-none');
              flota(campoQuien, listaQuien);
            }).catch(function () { listaQuien.classList.add('d-none'); });
        }, 220);
      });

      // ⚠️ La lista de resultados vive en el `<body>` (ver `flota`), así que el clic NO llega
      // por la zona: se escucha en las DOS.
      function clicQuien(ev) {
        var op = ev.target.closest('[data-demo-sender-pick]');
        if (op) {
          campoQuien.value = op.getAttribute('data-name') || '';
          nombreQuien.value = campoQuien.value;
          terceroQuien.value = (op.getAttribute('data-kind') === 'promoter')
            ? (op.getAttribute('data-id') || '') : '';
          pintaElegido('Elegido: ' + campoQuien.value);
          listaQuien.classList.add('d-none');
          return;
        }
        var crear = ev.target.closest('[data-demo-sender-create]');
        if (crear) {
          var nombre = campoQuien.value.trim();
          if (!nombre) return;
          crear.disabled = true;
          var cuerpo = new URLSearchParams();
          cuerpo.append('nick', nombre);
          cuerpo.append('force_new', '1');
          var cab = { 'X-Requested-With': 'XMLHttpRequest' };
          if (csrf()) cab['X-CSRFToken'] = csrf();
          fetch(urlCrearQuien, { method: 'POST', headers: cab, body: cuerpo })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (js) {
              crear.disabled = false;
              if (js && js.id) {
                terceroQuien.value = js.id;
                nombreQuien.value = nombre;
                pintaElegido('Creado y elegido: ' + nombre);
                listaQuien.classList.add('d-none');
              } else {
                alert((js && js.error) || 'No se pudo crear el tercero.');
              }
            });
        }
      }
      zonaQuien.addEventListener('click', clicQuien);
      listaQuien.addEventListener('click', clicQuien);
    }

    /* ---------- PRODUCTORES ----------
       La misma sección que los autores: se busca el productor (con su foto) y, si no está, se crea
       con el «+». ⚠️ Pueden ser VARIOS: un tema lo pueden producir dos personas. */
    var zonaProd = form.querySelector('[data-demo-producers]');
    if (zonaProd) {
      var filasProd = zonaProd.querySelector('[data-demo-producer-rows]');
      var tplProd = zonaProd.querySelector('[data-demo-producer-tpl]');
      var urlBuscaProd = zonaProd.getAttribute('data-search-url') || '';
      var urlCrearProd = zonaProd.getAttribute('data-create-url') || '';

      function nuevaProd() {
        if (!tplProd || !filasProd) return null;
        var nodo = tplProd.content.firstElementChild.cloneNode(true);
        filasProd.appendChild(nodo);
        return nodo;
      }
      form.demoAddProducer = nuevaProd;      // lo usa el pop-up al pintar los que ya tiene

      var btnProd = zonaProd.querySelector('[data-demo-producer-add]');
      if (btnProd) btnProd.addEventListener('click', function () {
        var f = nuevaProd();
        if (f) { var i = f.querySelector('[data-demo-producer-name]'); if (i) i.focus(); }
      });

      function eligeProd(fila, id, nombre) {
        fila.querySelector('[data-demo-producer-name]').value = nombre || '';
        fila.querySelector('[data-demo-producer-hidden]').value = nombre || '';
        fila.querySelector('[data-demo-producer-id]').value = id || '';
        var caja = fila.querySelector('[data-demo-producer-list]') || fila.__lista;
        if (caja) caja.classList.add('d-none');
      }
      // Crear el tercero con lo escrito. ⚠️ Sin `force_new`: si ya hay uno parecido, el servidor
      // devuelve 409 con la lista y se ofrece elegirlo (o crearlo igualmente).
      function creaProd(fila, forzar) {
        var campo = fila.querySelector('[data-demo-producer-name]');
        var nombre = (campo.value || '').trim();
        if (!nombre || !urlCrearProd) return;
        var cuerpo = new URLSearchParams();
        cuerpo.append('nick', nombre);
        if (forzar) cuerpo.append('force_new', '1');
        var cab = { 'X-Requested-With': 'XMLHttpRequest' };
        if (csrf()) cab['X-CSRFToken'] = csrf();
        fetch(urlCrearProd, { method: 'POST', headers: cab, body: cuerpo })
          .then(function (r) { return r.json().catch(function () { return {}; })
            .then(function (js) { return { status: r.status, js: js }; }); })
          .then(function (res) {
            var js = res.js || {};
            if (js.id) { eligeProd(fila, js.id, nombre); return; }
            var lista = fila.querySelector('[data-demo-producer-list]') || fila.__lista;
            if (res.status === 409 && (js.similar || []).length && lista) {
              lista.innerHTML = '<div class="small text-muted px-2 py-1">Ya hay alguien parecido:</div>'
                + js.similar.map(function (o) {
                  return '<button class="demo-author__opt" type="button" data-demo-producer-pick'
                    + ' data-id="' + esc(o.id) + '" data-name="' + esc(o.label) + '">'
                    + (o.logo_url ? '<img src="' + esc(o.logo_url) + '" alt="" data-avatar="1">'
                                  : '<i class="fa fa-user"></i>')
                    + '<span>' + esc(o.label) + '</span></button>';
                }).join('')
                + '<button class="demo-author__opt" type="button" data-demo-producer-force>'
                + '<i class="fa fa-plus text-success"></i><span>Crear «' + esc(nombre)
                + '» igualmente</span></button>';
              lista.classList.remove('d-none');
              flota(campo, lista);
              if (!lista.__clic) { lista.__clic = true; lista.addEventListener('click', clicProd); }
              return;
            }
            alert(js.error || 'No se pudo crear el tercero.');
          });
      }

      // ⚠️ Como en los autores, la lista de resultados vive en el <body>: el clic se escucha en la
      // zona Y en la propia lista, y la fila se lee de la lista (`__fila`).
      function clicProd(ev) {
        var del = ev.target.closest('[data-demo-producer-del]');
        if (del) {
          var f0 = del.closest('[data-demo-producer]');
          if (f0) { if (f0.__lista) f0.__lista.remove(); f0.remove(); }
          return;
        }
        var op = ev.target.closest('[data-demo-producer-pick]');
        if (op) {
          var caja = op.closest('[data-demo-producer-list]');
          var f1 = op.closest('[data-demo-producer]') || (caja && caja.__fila);
          if (f1) eligeProd(f1, op.getAttribute('data-id'), op.getAttribute('data-name'));
          return;
        }
        var mas = ev.target.closest('[data-demo-producer-new]');
        if (mas) { creaProd(mas.closest('[data-demo-producer]'), false); return; }
        var forzar = ev.target.closest('[data-demo-producer-force]');
        if (forzar) {
          var caja2 = forzar.closest('[data-demo-producer-list]');
          var f2 = forzar.closest('[data-demo-producer]') || (caja2 && caja2.__fila);
          if (f2) creaProd(f2, true);
        }
      }
      zonaProd.addEventListener('click', clicProd);

      var esperaProd = null;
      zonaProd.addEventListener('input', function (ev) {
        var campo = ev.target.closest('[data-demo-producer-name]');
        if (!campo) return;
        var fila = campo.closest('[data-demo-producer]');
        // Lo escrito vale como nombre aunque no sea un tercero de la base.
        fila.querySelector('[data-demo-producer-hidden]').value = campo.value;
        fila.querySelector('[data-demo-producer-id]').value = '';
        var lista = fila.querySelector('[data-demo-producer-list]') || fila.__lista;
        if (!lista) return;
        var q = campo.value.trim();
        if (!urlBuscaProd || q.length < 2) { lista.classList.add('d-none'); return; }
        clearTimeout(esperaProd);
        esperaProd = setTimeout(function () {
          fetch(urlBuscaProd + (urlBuscaProd.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(q),
                { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (js) {
              var opciones = (js && (js.results || js)) || [];
              if (!opciones.length) { lista.classList.add('d-none'); return; }
              lista.innerHTML = opciones.slice(0, 8).map(function (o) {
                var nombre = o.label || o.text || o.name || o.nick || '';
                var foto = o.logo_url || o.photo_url || '';
                return '<button class="demo-author__opt" type="button" data-demo-producer-pick'
                  + ' data-id="' + esc(o.id) + '" data-name="' + esc(nombre) + '">'
                  + (foto ? '<img src="' + esc(foto) + '" alt="" data-avatar="1">' : '<i class="fa fa-user"></i>')
                  + '<span>' + esc(nombre) + '</span></button>';
              }).join('');
              lista.classList.remove('d-none');
              flota(campo, lista);
              if (!lista.__clic) { lista.__clic = true; lista.addEventListener('click', clicProd); }
            }).catch(function () { lista.classList.add('d-none'); });
        }, 220);
      });
    }

    /* ---------- AUTORES ---------- */
    var zonaAut = form.querySelector('[data-demo-authors]');
    if (zonaAut) {
      var filas = zonaAut.querySelector('[data-demo-author-rows]');
      var plantilla = zonaAut.querySelector('[data-demo-author-tpl]');
      var urlBusca = zonaAut.getAttribute('data-search-url') || '';

      function nuevaFila() {
        if (!plantilla || !filas) return null;
        var nodo = plantilla.content.firstElementChild.cloneNode(true);
        filas.appendChild(nodo);
        return nodo;
      }
      var btnAdd = zonaAut.querySelector('[data-demo-author-add]');
      if (btnAdd) btnAdd.addEventListener('click', function () {
        var f = nuevaFila();
        if (f) { var i = f.querySelector('[data-demo-author-name]'); if (i) i.focus(); }
      });
      // ⚠️ Igual que arriba: las listas cuelgan del `<body>`, así que su clic se escucha aparte
      // (`clicAutor` se engancha a cada lista al abrirla) y la fila se lee de la propia lista.
      function clicAutor(ev) {
        var del = ev.target.closest('[data-demo-author-del]');
        if (del) {
          var fila = del.closest('[data-demo-author]');
          // La lista flotante ya no cuelga de la fila: hay que tirarla a mano o se queda
          // colgando del `<body>` para siempre.
          if (fila) { if (fila.__lista) fila.__lista.remove(); fila.remove(); }
          return;
        }
        var op = ev.target.closest('[data-demo-author-pick]');
        if (op) {
          var caja = op.closest('[data-demo-author-list]');
          var fila2 = op.closest('[data-demo-author]') || (caja && caja.__fila);
          if (!fila2) return;
          fila2.querySelector('[data-demo-author-name]').value = op.getAttribute('data-name') || '';
          fila2.querySelector('[data-demo-author-hidden]').value = op.getAttribute('data-name') || '';
          fila2.querySelector('[data-demo-author-id]').value = op.getAttribute('data-id') || '';
          var pub = fila2.querySelector('input[name="author_publisher_name[]"]');
          if (pub && !pub.value) pub.value = op.getAttribute('data-publisher') || '';
          (caja || fila2.querySelector('[data-demo-author-list]')).classList.add('d-none');
        }
      }
      zonaAut.addEventListener('click', clicAutor);
      var temporizador = null;
      zonaAut.addEventListener('input', function (ev) {
        var campo = ev.target.closest('[data-demo-author-name]');
        if (!campo) return;
        var fila = campo.closest('[data-demo-author]');
        // Lo escrito vale como nombre aunque no sea un tercero de la base.
        fila.querySelector('[data-demo-author-hidden]').value = campo.value;
        fila.querySelector('[data-demo-author-id]').value = '';
        // ⚠️ Si ya se abrió una vez, la lista NO cuelga de la fila (vive en el `<body>`, ver
        // `flota`): hay que cogerla de la fila, que se la guarda.
        var lista = fila.querySelector('[data-demo-author-list]') || fila.__lista;
        if (!lista) return;
        var q = campo.value.trim();
        if (!urlBusca || q.length < 2) { lista.classList.add('d-none'); return; }
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
          fetch(urlBusca + (urlBusca.indexOf('?') >= 0 ? '&' : '?') + 'q=' + encodeURIComponent(q),
                { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) { return r.json(); })
            .then(function (js) {
              var opciones = (js && (js.results || js)) || [];
              if (!opciones.length) { lista.classList.add('d-none'); return; }
              lista.innerHTML = opciones.slice(0, 8).map(function (o) {
                // El buscador de terceros de la casa devuelve `label`/`text` y `publishing_company_name`.
                var nombre = o.label || o.text || o.name || o.nick || '';
                var foto = o.logo_url || o.photo_url || '';
                return '<button class="demo-author__opt" type="button" data-demo-author-pick'
                  + ' data-id="' + esc(o.id) + '" data-name="' + esc(nombre) + '"'
                  + ' data-publisher="' + esc(o.publishing_company_name || o.publisher || '') + '">'
                  + (foto ? '<img src="' + esc(foto) + '" alt="" data-avatar="1">' : '<i class="fa fa-user"></i>')
                  + '<span>' + esc(nombre) + '</span></button>';
              }).join('');
              lista.classList.remove('d-none');
              flota(campo, lista);
              if (!lista.__clic) { lista.__clic = true; lista.addEventListener('click', clicAutor); }
            }).catch(function () { lista.classList.add('d-none'); });
        }, 220);
      });
    }

    /* ---------- ENVIAR: el audio va antes, directo a Storage ----------
       ⚠️ `despues(ok)` dice si TODO ha subido: si algún audio ha fallado NO se envía el formulario
       (se quedaría una maqueta sin su archivo y sin decirlo). */
    function subeUno(file, alProgreso) {
      return postJson(urlFirma, { filename: file.name }).then(function (sig) {
        if (!sig || !sig.ok || !sig.upload_url) return null;
        return new Promise(function (resolve) {
          var fd = new FormData();
          fd.append('cacheControl', '31536000');
          fd.append('', file);
          var xhr = new XMLHttpRequest();
          xhr.open('PUT', sig.upload_url);
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable && alProgreso) alProgreso(Math.round(e.loaded * 100 / e.total));
          };
          xhr.onload = function () {
            resolve((xhr.status >= 200 && xhr.status < 300) ? { key: sig.key, name: file.name } : null);
          };
          xhr.onerror = function () { resolve(null); };
          xhr.send(fd);
        });
      });
    }

    /* Las filas, UNA A UNA (no todas a la vez: son archivos grandes y la barra de cada una tiene que
       decir por dónde va). Lo ya subido no se vuelve a subir. */
    function subeFilas(despues) {
      var pendientes = pistas();
      var i = 0, malas = 0;
      function siguiente() {
        if (i >= pendientes.length) { despues(malas === 0); return; }
        var fila = pendientes[i++];
        var clave = fila.querySelector('[data-demo-track-key]');
        if (!fila.__file || (clave && clave.value)) { siguiente(); return; }
        var bar = fila.querySelector('[data-demo-track-bar]');
        var trozo = bar ? bar.querySelector('span') : null;
        var estado = fila.querySelector('[data-demo-track-state]');
        if (bar) bar.classList.remove('d-none');
        subeUno(fila.__file, function (p) { if (trozo) trozo.style.width = p + '%'; })
          .then(function (res) {
            if (res && res.key) {
              clave.value = res.key;
              fila.querySelector('[data-demo-track-name]').value = res.name;
              if (trozo) trozo.style.width = '100%';
              if (estado) { estado.className = 'demo-track__state is-ok'; estado.innerHTML = '<i class="fa fa-circle-check"></i>'; }
            } else {
              malas++;
              fila.classList.add('is-bad');
              if (estado) { estado.className = 'demo-track__state is-bad'; estado.innerHTML = '<i class="fa fa-triangle-exclamation"></i>'; }
              var w = fila.querySelector('[data-demo-track-warn]');
              if (w) {
                w.textContent = 'No se pudo subir este audio. Vuelve a intentarlo o quítalo de la lista.';
                w.classList.remove('d-none');
              }
            }
            siguiente();
          });
      }
      siguiente();
    }

    function subeAudioYSigue(despues) {
      if (multi() && pistas().length) { subeFilas(despues); return; }
      var f = elAudio && elAudio.files && elAudio.files[0];
      if (!f || !urlFirma) { despues(true); return; }
      if (zonaProg) zonaProg.classList.remove('d-none');
      postJson(urlFirma, { filename: f.name }).then(function (sig) {
        if (!sig || !sig.ok || !sig.upload_url) { despues(true); return; }   // por el servidor, como antes
        var fd = new FormData();
        fd.append('cacheControl', '31536000');
        fd.append('', f);
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', sig.upload_url);
        xhr.upload.onprogress = function (e) {
          if (!e.lengthComputable || !barra) return;
          var p = Math.round(e.loaded * 100 / e.total);
          barra.style.width = p + '%'; barra.textContent = p + '%';
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (elUploaded) elUploaded.value = JSON.stringify({ audio: { key: sig.key, name: f.name } });
            elAudio.disabled = true;          // ya está arriba: no se manda otra vez
          }
          despues(true);
        };
        xhr.onerror = function () { despues(true); };
        xhr.send(fd);
      });
    }
    form.demoUploadAudio = subeAudioYSigue;      // lo usa el envío AJAX del enlace público

    // Ninguna fila puede quedarse sin nombre: se dice cuál falta en vez de dejar que lo rebote el
    // servidor con el formulario ya enviado.
    function faltaAlgunTitulo() {
      var mala = null;
      pistas().forEach(function (fila) {
        var t = fila.querySelector('[data-demo-track-title]');
        if (!mala && t && !(t.value || '').trim()) mala = t;
      });
      if (mala) { mala.focus(); alert('Ponle un nombre a cada maqueta.'); return true; }
      return false;
    }
    form.demoFaltaTitulo = faltaAlgunTitulo;

    if (form.getAttribute('data-ajax') !== '1') {
      form.addEventListener('submit', function (ev) {
        if (form.dataset.listo === '1') return;
        var hayFilas = multi() && pistas().length;
        if (!hayFilas && !(elAudio && elAudio.files && elAudio.files.length)) return;
        ev.preventDefault();
        if (hayFilas && faltaAlgunTitulo()) return;
        var boton = form.querySelector('[type="submit"]');
        if (boton) boton.disabled = true;
        subeAudioYSigue(function (ok) {
          if (boton) boton.disabled = false;
          if (!ok) {
            alert('Algún audio no se ha podido subir: míralo en la lista y vuelve a intentarlo.');
            return;
          }
          form.dataset.listo = '1';
          form.submit();
        });
      });
    }
  }

  function initAll(root) {
    (root || document).querySelectorAll('[data-demo-form]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }
  document.addEventListener('inline:updated', function (ev) { initAll(ev.target || document); });
  window.initDemoForm = initAll;
})();
