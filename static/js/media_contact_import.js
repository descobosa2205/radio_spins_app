/* ══════════════════════════════════════════════════════════════════════════════════════════════
   SUBIR CONTACTOS DE MEDIOS DESDE UN FICHERO

   Dos piezas en el mismo fichero, porque son el mismo trabajo:
     1) el POP-UP: el fichero → las columnas (lo que no se reconoce se pregunta o se omite) → subir.
     2) la pantalla de VINCULACIÓN: se arrastra cada contacto a su medio y se guarda al momento.

   ⚠️ El arrastre es HTML5, pero SIEMPRE hay camino sin arrastrar (se pincha el contacto y luego su
   medio): con el dedo el arrastre nativo no funciona, y esta pantalla se abre también en un iPad.
   ⚠️ El CSRF lo pone `csrf.js`, que parchea `fetch`.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function post(url, payload) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida del servidor.' }; });
    });
  }

  /* ═════════════════ 1) EL POP-UP ═════════════════ */
  function initModal(root) {
    if (!root || root.dataset.miReady === '1') return;
    root.dataset.miReady = '1';
    var q = function (sel) { return root.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
    var st = { columns: [], rows: [], fields: [], ignore: '__ignore__', filename: '' };

    function error(msg) {
      var box = q('[data-mi-error]');
      if (!box) return;
      box.textContent = msg || '';
      box.classList.toggle('d-none', !msg);
    }
    function paso(nombre) {
      qa('[data-mi-step]').forEach(function (el) {
        el.classList.toggle('d-none', el.getAttribute('data-mi-step') !== nombre);
      });
      error('');
    }

    var input = q('#mediaImportFile');
    var btnLeer = q('[data-mi-analyze]');
    if (input) {
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        var nombre = q('[data-mi-filename]');
        if (nombre) nombre.textContent = f ? f.name : '';
        if (btnLeer) btnLeer.disabled = !f;
      });
    }

    if (btnLeer) {
      btnLeer.addEventListener('click', function () {
        var f = input && input.files && input.files[0];
        if (!f) return;
        var fd = new FormData();
        fd.append('file', f);
        btnLeer.disabled = true;
        fetch(root.getAttribute('data-url-analyze'), { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            btnLeer.disabled = false;
            if (!data || !data.ok) { error((data && data.error) || 'No se pudo leer el fichero.'); return; }
            st.columns = data.columns || [];
            st.rows = data.rows || [];
            st.fields = data.fields || [];
            st.ignore = data.ignore || '__ignore__';
            st.filename = data.filename || f.name;
            pintaColumnas(data.sheet_rows || st.rows.length);
            paso('columns');
          })
          .catch(function () { btnLeer.disabled = false; error('No se pudo leer el fichero.'); });
      });
    }

    function pintaColumnas(nFilas) {
      var tbody = q('[data-mi-cols]');
      if (!tbody) return;
      tbody.innerHTML = '';
      var sinReconocer = 0;
      st.columns.forEach(function (c) {
        if (!c.field) sinReconocer++;
        var tr = document.createElement('tr');
        if (!c.field) tr.className = 'pi-row--unknown';
        var opciones = ['<option value="' + esc(st.ignore) + '">Omitir esta columna</option>'];
        st.fields.forEach(function (f) {
          opciones.push('<option value="' + esc(f.key) + '"' + (f.key === c.field ? ' selected' : '') +
                        '>' + esc(f.label) + '</option>');
        });
        tr.innerHTML =
          '<td class="small fw-semibold">' + esc(c.header) + '</td>' +
          '<td class="small text-muted">' + esc((c.samples || [])[0] || '—') + '</td>' +
          '<td><select class="form-select form-select-sm" data-mi-col="' + c.index + '">' +
          opciones.join('') + '</select></td>';
        tbody.appendChild(tr);
      });
      var aviso = q('[data-mi-unknown]');
      if (aviso) {
        if (sinReconocer) {
          aviso.innerHTML = '<i class="fa fa-triangle-exclamation me-1"></i>Hay <strong>' + sinReconocer +
            '</strong> columna(s) que no hemos reconocido (en ámbar): di qué son o déjalas en «Omitir esta columna».';
          aviso.classList.remove('d-none');
        } else { aviso.classList.add('d-none'); }
      }
      var press = q('[data-mi-press]');
      var nota = q('[data-mi-press-note]');
      if (nota) nota.classList.toggle('d-none', !(press && press.checked));
      var sub = q('[data-mi-subtitle]');
      if (sub) sub.textContent = st.filename + ' · ' + nFilas + ' fila(s) con datos';
    }

    var atras = q('[data-mi-back]');
    if (atras) atras.addEventListener('click', function () { paso('file'); });

    var btnCrear = q('[data-mi-create]');
    if (btnCrear) {
      btnCrear.addEventListener('click', function () {
        var mapeo = {};
        qa('[data-mi-col]').forEach(function (sel) {
          mapeo[sel.getAttribute('data-mi-col')] = sel.value;
        });
        var press = q('[data-mi-press]');
        btnCrear.disabled = true;
        post(root.getAttribute('data-url-create'), {
          rows: st.rows, mapping: mapeo, filename: st.filename,
          press_all: (press && press.checked) ? 1 : 0
        }).then(function (js) {
          btnCrear.disabled = false;
          if (!js || !js.ok) { error((js && js.error) || 'No se pudo subir el fichero.'); return; }
          window.location.href = js.url;
        });
      });
    }
  }

  /* ═════════════════ 2) LA PANTALLA DE VINCULACIÓN ═════════════════ */
  function initAssign(root) {
    if (!root || root.dataset.mciReady === '1') return;
    root.dataset.mciReady = '1';
    var elegido = null;                        // el contacto marcado (camino sin arrastrar)

    function toast(texto, malo) {
      var t = root.parentNode.querySelector('[data-mci-toast]') || document.querySelector('[data-mci-toast]');
      if (!t) return;
      t.textContent = texto;
      t.classList.toggle('is-bad', !!malo);
      t.hidden = false;
      clearTimeout(t.__tm);
      t.__tm = setTimeout(function () { t.hidden = true; }, 2600);
    }

    function cuentaPendientes() {
      var n = root.querySelectorAll('[data-mci-row]').length;
      var c = document.querySelector('[data-mci-pending]');
      if (c) c.textContent = n;
      var vacio = root.querySelector('[data-mci-empty]');
      if (vacio) vacio.classList.toggle('d-none', n > 0);
      return n;
    }
    function sumaColocado() {
      var c = document.querySelector('[data-mci-done]');
      if (c) c.textContent = (parseInt(c.textContent, 10) || 0) + 1;
    }

    function tarjeta(id) { return root.querySelector('[data-mci-row="' + id + '"]'); }

    function marca(card) {
      root.querySelectorAll('.mci-card.is-picked').forEach(function (el) { el.classList.remove('is-picked'); });
      if (card) card.classList.add('is-picked');
      elegido = card ? card.getAttribute('data-mci-row') : null;
      root.classList.toggle('is-picking', !!elegido);
    }

    function asigna(rowId, mediaEl) {
      if (!rowId || !mediaEl) return;
      var mediaId = mediaEl.getAttribute('data-mci-drop');
      var card = tarjeta(rowId);
      if (card) card.classList.add('is-saving');
      post(root.getAttribute('data-url-assign'), { row_id: rowId, media_id: mediaId })
        .then(function (js) {
          if (card) card.classList.remove('is-saving');
          if (!js || !js.ok) { toast((js && js.error) || 'No se pudo guardar.', true); return; }
          if (card) card.remove();
          if (elegido === rowId) marca(null);
          sumaColocado();
          // El contador del medio, al día sin recargar.
          var n = mediaEl.querySelector('[data-mci-count]');
          if (n) n.textContent = js.media_contacts;
          var s = mediaEl.querySelector('[data-mci-count-s]');
          if (s) s.textContent = (js.media_contacts === 1 ? '' : 's');
          mediaEl.classList.add('is-hit');
          setTimeout(function () { mediaEl.classList.remove('is-hit'); }, 700);
          toast((js.created ? 'Guardado en ' : 'Ya estaba en ') + (js.media_name || 'el medio') +
                (js.created ? '' : ' · se le ha completado lo que faltaba'));
          cuentaPendientes();
        });
    }

    /* ---------- Arrastrar ---------- */
    root.addEventListener('dragstart', function (ev) {
      var card = ev.target.closest('[data-mci-row]');
      if (!card) return;
      ev.dataTransfer.setData('text/plain', card.getAttribute('data-mci-row'));
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
      root.classList.add('is-dragging');
    });
    root.addEventListener('dragend', function (ev) {
      var card = ev.target.closest('[data-mci-row]');
      if (card) card.classList.remove('is-dragging');
      root.classList.remove('is-dragging');
      root.querySelectorAll('.mci-media.is-over').forEach(function (el) { el.classList.remove('is-over'); });
    });
    root.addEventListener('dragover', function (ev) {
      var destino = ev.target.closest('[data-mci-drop]');
      if (!destino) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      destino.classList.add('is-over');
    });
    root.addEventListener('dragleave', function (ev) {
      var destino = ev.target.closest('[data-mci-drop]');
      if (destino) destino.classList.remove('is-over');
    });
    root.addEventListener('drop', function (ev) {
      var destino = ev.target.closest('[data-mci-drop]');
      if (!destino) return;
      ev.preventDefault();
      destino.classList.remove('is-over');
      asigna(ev.dataTransfer.getData('text/plain'), destino);
    });

    /* ---------- Sin arrastrar: se pincha el contacto y luego su medio ---------- */
    root.addEventListener('click', function (ev) {
      var descartar = ev.target.closest('[data-mci-skip]');
      if (descartar) {
        ev.preventDefault();
        var rid = descartar.getAttribute('data-mci-skip');
        post(root.getAttribute('data-url-skip'), { row_id: rid }).then(function (js) {
          if (!js || !js.ok) { toast((js && js.error) || 'No se pudo descartar.', true); return; }
          var c = tarjeta(rid);
          if (c) c.remove();
          if (elegido === rid) marca(null);
          cuentaPendientes();
          toast('Contacto descartado');
        });
        return;
      }
      var card = ev.target.closest('[data-mci-row]');
      if (card) {
        marca(card.classList.contains('is-picked') ? null : card);
        return;
      }
      var destino = ev.target.closest('[data-mci-drop]');
      if (destino && elegido) { asigna(elegido, destino); }
    });

    /* ---------- Los dos buscadores ---------- */
    function filtra(input, selector) {
      var q = norm(input.value);
      root.querySelectorAll(selector).forEach(function (el) {
        el.classList.toggle('d-none', !!q && norm(el.getAttribute('data-search') || '').indexOf(q) < 0);
      });
    }
    var bRows = root.querySelector('[data-mci-search-rows]');
    if (bRows) bRows.addEventListener('input', function () { filtra(bRows, '[data-mci-row]'); });
    var bMedia = root.querySelector('[data-mci-search-media]');
    if (bMedia) bMedia.addEventListener('input', function () { filtra(bMedia, '[data-mci-drop]'); });

    /* ---------- Crear un medio sobre la marcha ----------
       El alta rápida de la casa deja lo creado en un `<select>` oculto y avisa con un `change`: de
       ahí sale su tarjeta, arriba del todo y ya lista para soltarle contactos. */
    var nuevo = document.getElementById('mciNewMedia');
    if (nuevo) {
      nuevo.addEventListener('change', function () {
        var id = nuevo.value;
        if (!id) return;
        var opt = nuevo.querySelector('option[value="' + id + '"]');
        var nombre = opt ? opt.textContent : 'Medio nuevo';
        var logo = (opt && opt.getAttribute('data-photo')) || '';
        /* ⚠️ Sin logo se pone el MUÑEQUITO GRIS, nunca `placeholder_photo`: esa imagen la esconde
           el CSS a propósito («sin imagen → el hueco se omite») y la tarjeta se quedaba coja. */
        if (!logo || logo.indexOf('placeholder_photo') >= 0) {
          logo = (document.body.dataset.defaultAvatarUrl || '');
        }
        if (root.querySelector('[data-mci-drop="' + id + '"]')) return;   // ya estaba
        var lista = root.querySelector('[data-mci-media]');
        if (!lista) return;
        var div = document.createElement('div');
        div.className = 'mci-media is-new';
        div.setAttribute('data-mci-drop', id);
        div.setAttribute('data-search', norm(nombre));
        div.setAttribute('data-name', nombre);
        div.innerHTML =
          '<img src="' + esc(logo) + '" alt="" class="mci-media__logo" data-avatar="1">' +
          '<div class="mci-media__main"><div class="mci-media__name">' + esc(nombre) + '</div>' +
          '<div class="mci-media__sub">Nuevo · <span data-mci-count>0</span> contacto<span data-mci-count-s>s</span></div></div>' +
          '<i class="fa fa-arrow-down-to-line mci-media__drop"></i>';
        lista.insertBefore(div, lista.firstChild);
        lista.scrollTop = 0;
        toast('Medio «' + nombre + '» creado');
      });
    }

    cuentaPendientes();
  }

  function init() {
    document.querySelectorAll('[data-media-import]').forEach(initModal);
    document.querySelectorAll('[data-mci]').forEach(initAssign);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
