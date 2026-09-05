/* PLAYLIST DE SELECCIÓN / VALORACIÓN.
 *
 * Dos piezas independientes, las dos no-op si su marca no está en la pantalla:
 *
 *  1) EL ASISTENTE (`[data-pv-picker]`, dentro del modal de «+ Playlist selección»): el paso de los
 *     TEMAS —el mismo buscador que el editor: de dónde (repertorio o maquetas) → artista → temas—,
 *     lo elegido en columna y arrastrable, y el panel de «cuántas hay que seleccionar», que solo
 *     sale con las dinámicas que llevan selección.
 *
 *  2) LA PÁGINA DE QUIEN VOTA (`[data-pv-vote]`): puntuar del 1 al 10 (rojo → azul), elegir o
 *     descartar, y enviar. ⚠️⚠️ Para puntuar (o decidir) hay que **haber escuchado el tema entero**:
 *     el reproductor de la casa avisa con el evento `playlist:ended` y hasta entonces no se deja.
 *     Todo se guarda AL MOMENTO, así que se puede dejar a medias y **seguir donde se dejó**.
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
      .catch(function () { return { ok: false }; });
  }

  /* ===================== 1) EL ASISTENTE ===================== */
  function initPicker(zona) {
    if (!zona || zona.dataset.pvReady === '1') return;
    zona.dataset.pvReady = '1';
    var form = zona.closest('form');
    var url = (form && form.getAttribute('data-picker-url')) || '';
    var lista = zona.querySelector('[data-pv-list]');
    var atras = zona.querySelector('[data-pv-back]');
    var elegidos = form.querySelector('[data-pv-chosen]');
    var contador = form.querySelector('[data-pv-count]');
    var oculto = form.querySelector('[data-pv-items]');
    var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
    var filas = [];
    var fuente = '';

    function guarda() {
      filas = Array.prototype.slice.call(elegidos.querySelectorAll('[data-pv-row]')).map(function (n) {
        return { kind: n.getAttribute('data-kind'), song_id: n.getAttribute('data-song') || '',
                 demo_id: n.getAttribute('data-demo') || '', title: n.getAttribute('data-title') || '' };
      });
      oculto.value = JSON.stringify(filas);
      if (contador) contador.textContent = String(filas.length);
    }

    function yaEsta(kind, id) {
      return !!elegidos.querySelector('[data-pv-row][data-kind="' + kind + '"][data-'
        + (kind === 'DEMO' ? 'demo' : 'song') + '="' + id + '"]');
    }

    function añade(r) {
      var kind = (r.kind || 'SONG').toUpperCase();
      var id = kind === 'DEMO' ? r.id : r.id;
      if (yaEsta(kind, id)) return;
      var n = document.createElement('div');
      n.className = 'pv-row';
      n.setAttribute('data-pv-row', '');
      n.setAttribute('data-kind', kind);
      n.setAttribute(kind === 'DEMO' ? 'data-demo' : 'data-song', id);
      n.setAttribute('data-title', r.title || '');
      n.setAttribute('draggable', 'true');
      n.innerHTML = '<i class="fa fa-grip-vertical pv-row__grip"></i>'
        + '<img src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>'
        + '<span class="pv-row__main"><span class="pv-row__t">' + esc(r.title) + '</span>'
        + (r.artist_name ? '<span class="pv-row__a">' + esc(r.artist_name) + '</span>' : '') + '</span>'
        + '<button class="btn btn-sm btn-link text-danger" type="button" data-pv-del title="Quitar">'
        + '<i class="fa fa-xmark"></i></button>';
      elegidos.appendChild(n);
      guarda();
    }

    function pideGrupos(src) {
      fuente = src;
      if (atras) atras.classList.add('d-none');
      lista.innerHTML = '<div class="text-muted small">Cargando…</div>';
      fetch(url + '?source=' + encodeURIComponent(src), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (js) {
          var grupos = (js.groups || []).concat(js.active || [], js.others || []);
          if (!grupos.length) { lista.innerHTML = '<div class="text-muted small">No hay nada aquí.</div>'; return; }
          lista.innerHTML = grupos.map(function (g) {
            return '<button class="pv-artist" type="button" data-pv-artist="' + esc(g.id) + '">'
              + (g.photo ? '<img src="' + esc(g.photo) + '" alt="" data-avatar="1">'
                         : '<span class="pv-artist__ico"><i class="fa ' + esc(g.icon || 'fa-user') + '"></i></span>')
              + '<span>' + esc(g.name) + '</span>'
              + '<span class="badge text-bg-light border ms-auto">' + esc(g.count) + '</span></button>';
          }).join('');
        });
    }

    function pideTemas(artista) {
      lista.innerHTML = '<div class="text-muted small">Cargando…</div>';
      fetch(url + '?source=' + encodeURIComponent(fuente) + '&artist=' + encodeURIComponent(artista),
            { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (js) {
          var temas = js.rows || [];
          if (atras) atras.classList.remove('d-none');
          if (!temas.length) { lista.innerHTML = '<div class="text-muted small">No hay temas.</div>'; return; }
          lista.innerHTML = temas.map(function (t) {
            return '<button class="pv-song" type="button" data-pv-add=\'' + esc(JSON.stringify(t)) + '\'>'
              + '<img src="' + esc(t.cover_url || COVER) + '" alt="" data-cover>'
              + '<span class="pv-song__main"><span class="pv-song__t">' + esc(t.title) + '</span>'
              + (t.artist_name ? '<span class="pv-song__a">' + esc(t.artist_name) + '</span>' : '') + '</span>'
              + '<i class="fa fa-plus text-success ms-auto"></i></button>';
          }).join('');
        });
    }

    zona.addEventListener('click', function (ev) {
      var src = ev.target.closest('[data-pv-source]');
      if (src) { pideGrupos(src.getAttribute('data-pv-source')); return; }
      if (ev.target.closest('[data-pv-back]')) { pideGrupos(fuente); return; }
      var art = ev.target.closest('[data-pv-artist]');
      if (art) { pideTemas(art.getAttribute('data-pv-artist')); return; }
      var add = ev.target.closest('[data-pv-add]');
      if (add) {
        try { añade(JSON.parse(add.getAttribute('data-pv-add'))); } catch (e) {}
        add.classList.add('is-added');
      }
    });
    elegidos.addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-pv-del]');
      if (!del) return;
      var fila = del.closest('[data-pv-row]');
      if (fila) fila.remove();
      guarda();
    });

    /* Se ARRASTRAN para ordenarlos: el orden del DOM es el orden de la playlist. */
    var llevando = null;
    elegidos.addEventListener('dragstart', function (ev) {
      llevando = ev.target.closest('[data-pv-row]');
      if (llevando) llevando.classList.add('is-drag');
    });
    elegidos.addEventListener('dragend', function () {
      if (llevando) llevando.classList.remove('is-drag');
      llevando = null;
      guarda();
    });
    elegidos.addEventListener('dragover', function (ev) {
      if (!llevando) return;
      ev.preventDefault();
      var sobre = ev.target.closest('[data-pv-row]');
      if (!sobre || sobre === llevando) return;
      var r = sobre.getBoundingClientRect();
      elegidos.insertBefore(llevando, (ev.clientY - r.top) > r.height / 2 ? sobre.nextSibling : sobre);
    });

    /* «¿Cuántas hay que seleccionar?» solo con las dinámicas que llevan selección.
       ⚠️ Su campo se DESHABILITA al esconderlo: un `required` oculto bloquearía el envío. */
    var panel = form.querySelector('[data-pv-when-pick]');
    function repasaModo() {
      var m = form.querySelector('input[name="vote_mode"]:checked');
      var conSeleccion = !!m && (m.value === 'PICK' || m.value === 'PICK_RATE');
      if (!panel) return;
      panel.classList.toggle('d-none', !conSeleccion);
      panel.querySelectorAll('input').forEach(function (i) { i.disabled = !conSeleccion; });
    }
    form.addEventListener('change', function (ev) {
      if (ev.target.name === 'vote_mode') repasaModo();
    });
    repasaModo();
  }

  /* ===================== 2) LA PÁGINA DE QUIEN VOTA ===================== */
  function initVote(root) {
    if (!root || root.dataset.pvVoteReady === '1') return;
    root.dataset.pvVoteReady = '1';
    var urlGuardar = root.getAttribute('data-save-url') || '';
    var urlEnviar = root.getAttribute('data-submit-url') || '';
    var aviso = root.querySelector('[data-pv-msg]');
    var botonEnviar = root.querySelector('[data-pv-submit]');
    var listaEl = root.querySelector('[data-playlist-player]');

    function pintaAvance(p) {
      if (!p) return;
      if (aviso) {
        aviso.textContent = p.message || (p.ready ? '¡Listo! Ya puedes enviarlo.' : '');
        aviso.classList.toggle('is-ok', !!p.ready);
      }
      if (botonEnviar) botonEnviar.classList.toggle('d-none', !p.ready);
      var contador = root.querySelector('[data-pv-progress]');
      if (contador) {
        var partes = [p.heard + ' de ' + p.total + ' escuchadas'];
        if (p.wants_pick) partes.push(p.kept + (p.pick_count ? ' de ' + p.pick_count : '') + ' elegidas');
        if (p.wants_rate) partes.push(p.rated + ' puntuadas');
        contador.textContent = partes.join(' · ');
      }
    }

    function guarda(datos) {
      return postJson(urlGuardar, datos).then(function (js) {
        if (!js || !js.ok) {
          if (js && js.error) alert(js.error);
          return null;
        }
        pintaAvance(js.progress);
        return js.progress;
      });
    }

    function fila(id) { return root.querySelector('[data-pl-row][data-pl-item="' + id + '"]'); }

    /* ⚠️⚠️ ESCUCHAR LA CANCIÓN ENTERA es lo que abre la puntuación (y la selección): el reproductor
       de la casa avisa cuando un tema termina y aquí se apunta. */
    function abre(li) {
      // Ya se ha escuchado entera: se quita el candado y salen sus botones.
      li.querySelectorAll('[data-pv-lock]').forEach(function (n) { n.classList.add('d-none'); });
      li.querySelectorAll('.pv-pickbtns, .pv-scores').forEach(function (n) { n.classList.remove('d-none'); });
    }
    document.addEventListener('playlist:ended', function (ev) {
      var id = (ev.detail || {}).itemId;
      var li = id && fila(id);
      if (!li || li.dataset.pvHeard === '1') return;
      li.dataset.pvHeard = '1';
      li.classList.add('is-heard');
      abre(li);
      guarda({ item_id: id, heard: true });
    });
    // Lo que YA estaba escuchado de otras veces (se puede volver otro día y seguir).
    root.querySelectorAll('[data-pl-row]').forEach(function (li) {
      if (li.dataset.pvHeard === '1') abre(li);
    });

    /* REORDENAR por puntuación: la más votada, arriba. */
    function reordena() {
      if (!listaEl) return;
      var filas = Array.prototype.slice.call(listaEl.querySelectorAll('[data-pl-row]'));
      if (!filas.some(function (f) { return f.dataset.pvScore; })) return;
      filas.sort(function (a, b) {
        return (parseInt(b.dataset.pvScore || '0', 10) - parseInt(a.dataset.pvScore || '0', 10));
      });
      filas.forEach(function (f) { listaEl.appendChild(f); });
      // ⚠️ El reproductor guarda las filas en un array: hay que decirle que han cambiado de sitio.
      if (typeof listaEl.plReindex === 'function') listaEl.plReindex();
    }

    root.addEventListener('click', function (ev) {
      // --- PUNTUAR ---
      var nota = ev.target.closest('[data-pv-score]');
      if (nota) {
        var li = nota.closest('[data-pl-row]');
        if (li.dataset.pvHeard !== '1') {
          alert('Para puntuarla tienes que escuchar la canción completa.');
          return;
        }
        var valor = parseInt(nota.getAttribute('data-pv-score'), 10);
        li.dataset.pvScore = String(valor);
        li.querySelectorAll('[data-pv-score]').forEach(function (b) {
          b.classList.toggle('is-on', parseInt(b.getAttribute('data-pv-score'), 10) <= valor);
        });
        guarda({ item_id: li.getAttribute('data-pl-item'), score: valor }).then(reordena);
        return;
      }
      // --- ELEGIR o DESCARTAR ---
      var dec = ev.target.closest('[data-pv-state]');
      if (dec) {
        var li2 = dec.closest('[data-pl-row]');
        if (li2.dataset.pvHeard !== '1') {
          alert('Para decidir tienes que escuchar la canción completa.');
          return;
        }
        var estado = dec.getAttribute('data-pv-state');
        // Volver a pulsar lo que ya estaba lo deshace.
        if (li2.dataset.pvState === estado) estado = '';
        li2.dataset.pvState = estado;
        li2.classList.toggle('is-kept', estado === 'KEEP');
        li2.classList.toggle('is-dropped', estado === 'DROP');
        li2.querySelectorAll('[data-pv-state]').forEach(function (b) {
          b.classList.toggle('is-on', b.getAttribute('data-pv-state') === estado);
        });
        guarda({ item_id: li2.getAttribute('data-pl-item'), state: estado });
        return;
      }
      // --- ENVIAR ---
      if (ev.target.closest('[data-pv-submit]')) {
        if (botonEnviar) botonEnviar.disabled = true;
        postJson(urlEnviar, {}).then(function (js) {
          if (botonEnviar) botonEnviar.disabled = false;
          if (!js || !js.ok) { alert((js && js.error) || 'No se pudo enviar.'); return; }
          window.location.reload();
        });
      }
    });
  }

  function init(root) {
    var ambito = root || document;
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-pv-picker]') : []).forEach(initPicker);
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-pv-vote]') : []).forEach(initVote);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else { init(document); }
  document.addEventListener('inline:updated', function (ev) { init(ev.target || document); });
  window.initPlaylistVote = init;
})();

/* ===================== 3) LO VOTADO (dentro de la ficha) =====================
 * Los temas de más a menos votados, quién ha votado y los POP-UPS del desglose. Se pinta por AJAX
 * para que el filtro «Ver resultados incompletos» no obligue a recargar. No-op sin `[data-pvres]`.
 */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-pvres]');
  if (!raiz) return;

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function csrf() {
    var t = document.querySelector('meta[name="csrf-token"]');
    return t ? (t.getAttribute('content') || '') : '';
  }
  var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';
  var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
  var zona = raiz.querySelector('[data-pvres-rows]');
  var parcial = raiz.querySelector('[data-pvres-partial]');
  var datos = { rows: [], voters: [] };

  function pinta() {
    if (!datos.rows.length) {
      zona.innerHTML = '<div class="text-muted small">Todavía no hay respuestas.</div>';
      return;
    }
    zona.innerHTML = datos.rows.map(function (r, i) {
      return '<div class="pv-res">'
        + '<span class="pv-res__n">' + (i + 1) + '</span>'
        + '<img src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>'
        + '<span class="pv-res__main"><span class="pv-res__t">' + esc(r.title) + '</span>'
        + (r.artist_name ? '<span class="pv-res__a">' + esc(r.artist_name) + '</span>' : '') + '</span>'
        + (r.kept ? '<span class="badge text-bg-light border">' + r.kept + ' la eligen</span>' : '')
        // ⚠️ La NOTA se pincha: sale el desglose de qué ha puesto cada uno.
        + (r.avg_label
            ? '<button class="pv-res__avg" type="button" data-pvres-item="' + esc(r.id) + '"'
              + ' data-title="' + esc(r.title) + '" title="Ver quién ha votado qué">'
              + esc(r.avg_label) + '</button>'
            : '<span class="pv-res__avg is-empty">—</span>')
        + '</div>';
    }).join('');
  }

  function carga() {
    var url = raiz.getAttribute('data-results-url') + (parcial && parcial.checked ? '?incompletos=1' : '');
    zona.innerHTML = '<div class="text-muted small">Cargando…</div>';
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (js) { datos = js || { rows: [], voters: [] }; pinta(); })
      .catch(function () { zona.innerHTML = '<div class="text-muted small">No se pudo cargar.</div>'; });
  }
  if (parcial) parcial.addEventListener('change', carga);
  carga();

  function abrePopup(titulo, html) {
    raiz.parentNode.querySelector('[data-pvres-title]').textContent = titulo;
    raiz.parentNode.querySelector('[data-pvres-detail]').innerHTML = html;
    var m = document.getElementById('pvDetailModal');
    if (window.bootstrap && m) new bootstrap.Modal(m).show();
  }
  function persona(d) {
    return '<div class="pv-vrow">'
      + '<img class="pv-face" src="' + esc(d.photo_url || AVATAR) + '" alt="" data-avatar="1">'
      + '<span class="fw-semibold">' + esc(d.name) + '</span>'
      + (d.partial ? '<span class="badge text-bg-light border">sin enviar</span>' : '')
      + (d.state === 'KEEP' ? '<span class="badge text-bg-success">la elige</span>' : '')
      + (d.state === 'DROP' ? '<span class="badge text-bg-light border text-muted">la descarta</span>' : '')
      + '<span class="pv-vrow__score ms-auto">' + (d.score != null ? d.score : '—') + '</span></div>';
  }

  document.addEventListener('click', function (ev) {
    // El DESGLOSE de un tema: quién ha votado qué, de más a menos.
    var nota = ev.target.closest('[data-pvres-item]');
    if (nota) {
      var id = nota.getAttribute('data-pvres-item');
      var fila = datos.rows.filter(function (r) { return r.id === id; })[0];
      if (!fila) return;
      abrePopup(fila.title, (fila.detail || []).map(persona).join('')
        || '<div class="text-muted small">Nadie la ha votado todavía.</div>');
      return;
    }
    // EL ORDEN de una persona: sus temas de más a menos.
    var quien = ev.target.closest('[data-pvres-open]');
    if (quien) {
      var vid = quien.getAttribute('data-pvres-open');
      var suyas = datos.rows.map(function (r) {
        var d = (r.detail || []).filter(function (x) { return x.voter_id === vid; })[0];
        return d ? { title: r.title, cover_url: r.cover_url, score: d.score, state: d.state } : null;
      }).filter(Boolean).sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
      abrePopup(quien.getAttribute('data-name') || 'Su orden',
        suyas.map(function (r) {
          return '<div class="pv-vrow">'
            + '<img src="' + esc(r.cover_url || COVER) + '" alt="" data-cover class="pv-vrow__cover">'
            + '<span class="fw-semibold">' + esc(r.title) + '</span>'
            + (r.state === 'KEEP' ? '<span class="badge text-bg-success">la elige</span>' : '')
            + (r.state === 'DROP' ? '<span class="badge text-bg-light border text-muted">la descarta</span>' : '')
            + '<span class="pv-vrow__score ms-auto">' + (r.score != null ? r.score : '—') + '</span></div>';
        }).join('') || '<div class="text-muted small">Todavía no ha votado nada.</div>');
      return;
    }
    // Las acciones sobre una persona (resetear, anular, reenviar…).
    var acc = ev.target.closest('[data-pvres-act]');
    if (acc) {
      var pregunta = acc.getAttribute('data-confirm');
      if (pregunta && !window.confirm(pregunta)) return;
      var url = raiz.getAttribute('data-action-url')
        .replace('VID', acc.getAttribute('data-vid'))
        .replace('ACC', acc.getAttribute('data-pvres-act'));
      acc.disabled = true;
      var cab = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
      if (csrf()) cab['X-CSRFToken'] = csrf();
      fetch(url, { method: 'POST', headers: cab, body: '{}' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (js) {
          acc.disabled = false;
          if (!js || !js.ok) { alert((js && js.error) || 'No se pudo hacer.'); return; }
          window.location.reload();
        });
    }
  });
})();
