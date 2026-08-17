/* FORMULARIO DE UNA MAQUETA · el MISMO dentro y en el enlace público de envío de demos.
 *
 * Se engancha a cualquier `[data-demo-form]` y se encarga de:
 *  · los AUTORES (filas que se añaden, con buscador de terceros: el mismo patrón que los masters),
 *  · la PORTADA (vista previa de lo que se arrastre o se elija),
 *  · el AUDIO: calcula su HUELLA (sha256) y pregunta al servidor si ese MISMO archivo ya está subido
 *    —si lo está, avisa con el nombre que tiene y deja subirlo igualmente o no—, y después lo sube
 *    DIRECTAMENTE a Storage con barra de progreso (una maqueta puede pesar como un master).
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

    /* ---------- AUDIO: nombre, huella y aviso de repetida ---------- */
    if (elAudio) {
      elAudio.addEventListener('change', function () {
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
            }).catch(function () { listaQuien.classList.add('d-none'); });
        }, 220);
      });

      zonaQuien.addEventListener('click', function (ev) {
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
      zonaAut.addEventListener('click', function (ev) {
        var del = ev.target.closest('[data-demo-author-del]');
        if (del) { var fila = del.closest('[data-demo-author]'); if (fila) fila.remove(); return; }
        var op = ev.target.closest('[data-demo-author-pick]');
        if (op) {
          var fila2 = op.closest('[data-demo-author]');
          fila2.querySelector('[data-demo-author-name]').value = op.getAttribute('data-name') || '';
          fila2.querySelector('[data-demo-author-hidden]').value = op.getAttribute('data-name') || '';
          fila2.querySelector('[data-demo-author-id]').value = op.getAttribute('data-id') || '';
          var pub = fila2.querySelector('input[name="author_publisher_name[]"]');
          if (pub && !pub.value) pub.value = op.getAttribute('data-publisher') || '';
          fila2.querySelector('[data-demo-author-list]').classList.add('d-none');
        }
      });
      var temporizador = null;
      zonaAut.addEventListener('input', function (ev) {
        var campo = ev.target.closest('[data-demo-author-name]');
        if (!campo) return;
        var fila = campo.closest('[data-demo-author]');
        // Lo escrito vale como nombre aunque no sea un tercero de la base.
        fila.querySelector('[data-demo-author-hidden]').value = campo.value;
        fila.querySelector('[data-demo-author-id]').value = '';
        var lista = fila.querySelector('[data-demo-author-list]');
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
            }).catch(function () { lista.classList.add('d-none'); });
        }, 220);
      });
    }

    /* ---------- ENVIAR: el audio va antes, directo a Storage ---------- */
    function subeAudioYSigue(despues) {
      var f = elAudio && elAudio.files && elAudio.files[0];
      if (!f || !urlFirma) { despues(); return; }
      if (zonaProg) zonaProg.classList.remove('d-none');
      postJson(urlFirma, { filename: f.name }).then(function (sig) {
        if (!sig || !sig.ok || !sig.upload_url) { despues(); return; }     // por el servidor, como antes
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
          despues();
        };
        xhr.onerror = function () { despues(); };
        xhr.send(fd);
      });
    }
    form.demoUploadAudio = subeAudioYSigue;      // lo usa el envío AJAX del enlace público

    if (form.getAttribute('data-ajax') !== '1') {
      form.addEventListener('submit', function (ev) {
        if (form.dataset.listo === '1') return;
        if (!(elAudio && elAudio.files && elAudio.files.length)) return;
        ev.preventDefault();
        var boton = form.querySelector('[type="submit"]');
        if (boton) boton.disabled = true;
        subeAudioYSigue(function () {
          form.dataset.listo = '1';
          if (boton) boton.disabled = false;
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
