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
    var elegidos = form.querySelector('[data-pv-chosen]');
    var contador = form.querySelector('[data-pv-count]');
    var vacio = form.querySelector('[data-pv-empty]');
    var oculto = form.querySelector('[data-pv-items]');
    var notaCaja = form.querySelector('[data-pv-note-box]');
    var notaEl = form.querySelector('[data-pv-note]');
    var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
    var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';
    var zonaPick = zona.querySelector('[data-plpick]');

    /* El orden del DOM ES el orden de la playlist: cada fila lleva sus datos y se lee de ahí. */
    function guarda() {
      var filas = Array.prototype.slice.call(elegidos.querySelectorAll('[data-pv-row]')).map(function (n) {
        var campo = n.querySelector('[data-pv-title-input]');
        return { kind: n.getAttribute('data-kind'),
                 song_id: n.getAttribute('data-song') || '',
                 demo_id: n.getAttribute('data-demo') || '',
                 title: campo ? (campo.value || '') : (n.getAttribute('data-title') || '') };
      });
      oculto.value = JSON.stringify(filas);
      var suenan = filas.filter(function (f) { return f.kind === 'SONG' || f.kind === 'DEMO'; }).length;
      if (contador) contador.textContent = String(suenan);
      if (vacio) vacio.classList.toggle('d-none', filas.length > 0);
      // Lo que ya está puesto se ve en VERDE en el buscador.
      if (zonaPick && typeof zonaPick.plPickRefresh === 'function') zonaPick.plPickRefresh();
    }

    function tiene(kind, id) {
      return !!elegidos.querySelector('[data-pv-row][data-kind="' + kind + '"][data-'
        + (kind === 'DEMO' ? 'demo' : 'song') + '="' + id + '"]');
    }

    function fila(clase, dentro, attrs) {
      var n = document.createElement('div');
      n.className = 'pv-row' + (clase ? ' ' + clase : '');
      n.setAttribute('data-pv-row', '');
      n.setAttribute('draggable', 'true');
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      n.innerHTML = '<i class="fa fa-grip-vertical pv-row__grip"></i>' + dentro
        + '<button class="btn btn-sm btn-link text-danger" type="button" data-pv-del title="Quitar">'
        + '<i class="fa fa-xmark"></i></button>';
      elegidos.appendChild(n);
      guarda();
      return n;
    }

    function añadeTema(f) {
      if (tiene(f.kind, f.id)) return;
      var attrs = { 'data-kind': f.kind, 'data-title': f.title || '' };
      attrs[f.kind === 'DEMO' ? 'data-demo' : 'data-song'] = f.id;
      fila('', '<img src="' + esc(f.cover_url || COVER) + '" alt="" data-cover>'
        + '<span class="pv-row__main"><span class="pv-row__t">' + esc(f.title) + '</span>'
        + (f.artist_name
            ? '<span class="pv-row__a"><img src="' + esc(f.artist_photo || AVATAR) + '" alt="" data-avatar="1">'
              + esc(f.artist_name) + '</span>'
            : '') + '</span>', attrs);
    }

    /* Un TÍTULO o una DIVISIÓN: las mismas que en el editor, para dejarlas puestas ya. */
    function añadeLinea(kind) {
      if (kind === 'TITLE') {
        var n = fila('pv-row--title',
          '<input class="form-control form-control-sm" data-pv-title-input placeholder="Escribe el título">',
          { 'data-kind': 'TITLE' });
        var campo = n.querySelector('[data-pv-title-input]');
        if (campo) campo.focus();
        return;
      }
      fila('pv-row--divider', '<span class="pv-row__line"></span>', { 'data-kind': 'DIVIDER' });
    }

    /* EL BUSCADOR de la derecha: el MISMO motor que el editor de una playlist. */
    if (zonaPick && window.app33PlaylistPicker) {
      window.app33PlaylistPicker.init(zonaPick, { tiene: tiene, onAdd: añadeTema });
    }

    zona.addEventListener('click', function (ev) {
      var add = ev.target.closest('[data-plb-add]');
      if (add) {
        var que = (add.getAttribute('data-plb-add') || '').toUpperCase();
        if (que === 'NOTE') {
          if (notaCaja) notaCaja.classList.remove('d-none');
          add.classList.add('d-none');
          if (notaEl) notaEl.focus();
        } else if (que === 'TITLE' || que === 'DIVIDER') {
          añadeLinea(que);
        }
        return;
      }
      if (ev.target.closest('[data-pv-note-del]')) {
        if (notaEl) notaEl.value = '';
        if (notaCaja) notaCaja.classList.add('d-none');
        var btnNota = zona.querySelector('[data-plb-add="NOTE"]');
        if (btnNota) btnNota.classList.remove('d-none');
        return;
      }
      var del = ev.target.closest('[data-pv-del]');
      if (del) {
        var f = del.closest('[data-pv-row]');
        if (f) f.remove();
        guarda();
      }
    });
    // El título de una línea de TÍTULO se guarda según se escribe.
    elegidos.addEventListener('input', function (ev) {
      if (ev.target.matches('[data-pv-title-input]')) guarda();
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
    guarda();
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
        // Ya decidido, solo se ve lo elegido; sin decidir, se ven las dos opciones.
        var grupo = dec.closest('[data-pv-pickbtns]');
        if (grupo) grupo.classList.toggle('is-decided', !!estado);
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

/* ===================== 3) LAS VALORACIONES (dentro de la ficha) =====================
 * La segunda pestaña de una playlist de valoración/selección: los botones de filtro con la FOTO y el
 * NOMBRE de cada persona (los mismos que los filtros de artistas del repertorio) y **«Todos» por
 * defecto**; con «Todos», los temas de los MÁS elegidos a los MENOS con el resultado en «cuántos de
 * cuántos»; con una persona, SU valoración en su orden.
 * Se pinta por AJAX para que los filtros no obliguen a recargar. No-op sin `[data-pvres]`.
 *
 * Las acciones sobre una persona (resetear, anular, reenviar) viven en la OTRA pestaña
 * (`[data-pvpeople]`), así que su handler mira las dos.
 */
(function () {
  'use strict';
  var raiz = document.querySelector('[data-pvres]');
  var gente = document.querySelector('[data-pvpeople]');
  if (!raiz && !gente) return;

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

  /* ---------- Las acciones sobre una persona (valen desde las dos pestañas) ---------- */
  document.addEventListener('click', function (ev) {
    var acc = ev.target.closest && ev.target.closest('[data-pvres-act]');
    if (!acc) return;
    var host = acc.closest('[data-pvpeople]') || acc.closest('[data-pvres]') || raiz || gente;
    if (!host) return;
    var pregunta = acc.getAttribute('data-confirm');
    if (pregunta && !window.confirm(pregunta)) return;
    var url = host.getAttribute('data-action-url')
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
  });

  if (!raiz) return;                         // en la pestaña de la playlist no hay nada más que hacer

  var zona = raiz.querySelector('[data-pvres-rows]');
  var filtros = raiz.querySelector('[data-pvres-filters]');
  var pie = raiz.querySelector('[data-pvres-caption]');
  var parcial = raiz.querySelector('[data-pvres-partial]');
  var datos = { rows: [], voters: [], count: 0 };
  // ⚠️ Por defecto, TODOS. Se puede llegar con una persona ya elegida (`?quien=`) desde la otra
  // pestaña, que es donde se ve quién ha contestado.
  var quien = (raiz.getAttribute('data-pvres-who') || '').trim();

  function estado(d) {
    return (d.state === 'KEEP' ? '<span class="badge text-bg-success">la elige</span>' : '')
         + (d.state === 'DROP' ? '<span class="badge text-bg-light border text-muted">la descarta</span>' : '');
  }

  /* Los botones de filtro: «Todos» y una persona por botón, con su foto y su nombre. */
  function pintaFiltros() {
    if (!filtros) return;
    var html = '<button type="button" class="btn btn-sm ' + (quien ? 'btn-outline-secondary' : 'btn-dark')
      + '" data-pvres-who-btn="">Todos</button>';
    html += (datos.voters || []).map(function (v) {
      return '<button type="button" class="btn btn-sm d-inline-flex align-items-center gap-2 '
        + (quien === v.id ? 'btn-dark' : 'btn-outline-secondary')
        + '" data-pvres-who-btn="' + esc(v.id) + '">'
        + '<img src="' + esc(v.photo_url || AVATAR) + '" class="artist-mini" alt="" data-avatar="1">'
        + '<span>' + esc(v.name) + '</span>'
        + (v.partial ? '<span class="badge text-bg-light border">sin enviar</span>' : '')
        + '</button>';
    }).join('');
    filtros.innerHTML = html;
  }

  /* LO DE TODOS: de las más elegidas a las menos, con «cuántos de cuántos». */
  function pintaTodos() {
    var total = datos.count || 0;
    if (pie) {
      // El rótulo dice lo que de verdad manda en el orden (lo elegido o la nota).
      var orden = datos.wants_pick ? 'De las más elegidas a las menos' : 'De las más votadas a las menos';
      pie.innerHTML = total
        ? '<i class="fa fa-arrow-down-wide-short me-1"></i>' + orden + ' · '
          + total + (total === 1 ? ' persona ha contestado' : ' personas han contestado')
        : '';
    }
    zona.innerHTML = datos.rows.map(function (r, i) {
      return '<div class="pv-res">'
        + '<span class="pv-res__n">' + (i + 1) + '</span>'
        + '<img src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>'
        + '<span class="pv-res__main"><span class="pv-res__t">' + esc(r.title) + '</span>'
        + (r.artist_name ? '<span class="pv-res__a">' + esc(r.artist_name) + '</span>' : '') + '</span>'
        // ⚠️ EL RESULTADO ES «CUÁNTOS DE CUÁNTOS»: 5 de 8 la eligen.
        + (total ? '<span class="badge text-bg-' + (r.kept ? 'success' : 'light border text-muted') + '">'
                   + r.kept + ' de ' + total + '</span>' : '')
        // ⚠️ La NOTA se pincha: sale el desglose de qué ha puesto cada uno.
        + (r.avg_label
            ? '<button class="pv-res__avg" type="button" data-pvres-item="' + esc(r.id) + '"'
              + ' data-title="' + esc(r.title) + '" title="Ver quién ha votado qué">'
              + esc(r.avg_label) + '</button>'
            : '<span class="pv-res__avg is-empty">—</span>')
        + '</div>';
    }).join('');
  }

  /* LO DE UNA PERSONA: sus temas, en SU orden (de la que más le gusta a la que menos). */
  function pintaPersona() {
    var ficha = (datos.voters || []).filter(function (v) { return v.id === quien; })[0];
    var suyas = datos.rows.map(function (r) {
      var d = (r.detail || []).filter(function (x) { return x.voter_id === quien; })[0];
      return d ? { id: r.id, title: r.title, artist_name: r.artist_name, cover_url: r.cover_url,
                   score: d.score, state: d.state } : null;
    }).filter(Boolean).sort(function (a, b) {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (a.title || '').localeCompare(b.title || '');
    });
    if (pie) {
      pie.innerHTML = ficha
        ? '<i class="fa fa-user me-1"></i>Lo que ha dicho <strong>' + esc(ficha.name) + '</strong>'
          + (ficha.partial ? ' · <span class="text-warning">todavía no lo ha enviado</span>' : '')
        : '';
    }
    if (!suyas.length) {
      zona.innerHTML = '<div class="text-muted small">Todavía no ha valorado nada.</div>';
      return;
    }
    zona.innerHTML = suyas.map(function (r, i) {
      return '<div class="pv-res">'
        + '<span class="pv-res__n">' + (i + 1) + '</span>'
        + '<img src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>'
        + '<span class="pv-res__main"><span class="pv-res__t">' + esc(r.title) + '</span>'
        + (r.artist_name ? '<span class="pv-res__a">' + esc(r.artist_name) + '</span>' : '') + '</span>'
        + estado(r)
        + '<span class="pv-res__avg' + (r.score == null ? ' is-empty' : '') + '">'
        + (r.score != null ? r.score : '—') + '</span>'
        + '</div>';
    }).join('');
  }

  function pinta() {
    pintaFiltros();
    if (!datos.rows.length) {
      if (pie) pie.innerHTML = '';
      zona.innerHTML = '<div class="text-muted small">Todavía no hay respuestas.</div>';
      return;
    }
    // Si la persona elegida ya no está (se ha anulado, o se ha quitado «incompletos»), vuelve a todos.
    if (quien && !(datos.voters || []).some(function (v) { return v.id === quien; })) quien = '';
    if (quien) pintaPersona(); else pintaTodos();
  }

  function carga() {
    var url = raiz.getAttribute('data-results-url') + (parcial && parcial.checked ? '?incompletos=1' : '');
    zona.innerHTML = '<div class="text-muted small">Cargando…</div>';
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (js) { datos = js || { rows: [], voters: [], count: 0 }; pinta(); })
      .catch(function () { zona.innerHTML = '<div class="text-muted small">No se pudo cargar.</div>'; });
  }
  if (parcial) parcial.addEventListener('change', carga);
  carga();

  function abrePopup(titulo, html) {
    var t = document.querySelector('[data-pvres-title]');
    var b = document.querySelector('[data-pvres-detail]');
    if (t) t.textContent = titulo;
    if (b) b.innerHTML = html;
    var m = document.getElementById('pvDetailModal');
    if (window.bootstrap && m) new bootstrap.Modal(m).show();
  }
  function persona(d) {
    return '<div class="pv-vrow">'
      + '<img class="pv-face" src="' + esc(d.photo_url || AVATAR) + '" alt="" data-avatar="1">'
      + '<span class="fw-semibold">' + esc(d.name) + '</span>'
      + (d.partial ? '<span class="badge text-bg-light border">sin enviar</span>' : '')
      + estado(d)
      + '<span class="pv-vrow__score ms-auto">' + (d.score != null ? d.score : '—') + '</span></div>';
  }

  raiz.addEventListener('click', function (ev) {
    // Cambiar de filtro: «Todos» o una persona.
    var f = ev.target.closest('[data-pvres-who-btn]');
    if (f) {
      quien = f.getAttribute('data-pvres-who-btn') || '';
      pinta();
      return;
    }
    // El DESGLOSE de un tema: quién ha votado qué, de más a menos.
    var nota = ev.target.closest('[data-pvres-item]');
    if (nota) {
      var id = nota.getAttribute('data-pvres-item');
      var fila = datos.rows.filter(function (r) { return r.id === id; })[0];
      if (!fila) return;
      abrePopup(fila.title, (fila.detail || []).map(persona).join('')
        || '<div class="text-muted small">Nadie la ha votado todavía.</div>');
    }
  });
})();
