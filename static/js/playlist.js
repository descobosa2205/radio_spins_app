/* PLAYLIST (Discográfica) · reproductor + edición.
 *
 * Dos piezas independientes, las dos no-op si su marca no está en la pantalla:
 *
 *  1) REPRODUCTOR (`[data-playlist-player]`, en la ficha y en el enlace público): al pasar el ratón la
 *     línea se subraya y sale el play sobre la portada; al pinchar en cualquier sitio de la línea
 *     suena, y a la derecha aparece la barra (pausar, arrastrar para moverte y el segundo por el que
 *     vas). Al terminar una canción arranca la siguiente. SOLO SUENA UNA A LA VEZ (un único <audio>).
 *     La DURACIÓN la lee el navegador (`preload="metadata"`, una lectura del principio del archivo) de
 *     una en una para no hacer una ráfaga de peticiones, y se apunta en el servidor la primera vez
 *     (`data-duration-base`) para no volver a pedirla en cada carga.
 *
 *  2) EDICIÓN (`[data-playlist-edit]`): el estado vive en el array `rows` y se repinta al añadir,
 *     borrar o reordenar (mismo patrón que el set list de una actividad); «Guardar» manda todo el
 *     array. Las líneas se arrastran, y el pop-up de añadir va de fuente (demos/repertorio) a artista
 *     y de artista a temas.
 *
 * ⚠️ El audio se pide SIEMPRE a nuestro endpoint puente (`data-pl-src`), nunca a Storage: por eso la
 * playlist puede decir que no se descarga.
 */
(function () {
  'use strict';

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(seg) {
    var s = Math.max(0, Math.round(seg || 0));
    if (!isFinite(s)) return '';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
  }
  function csrfHeaders() {
    var t = document.querySelector('meta[name="csrf-token"]');
    var h = { 'X-Requested-With': 'XMLHttpRequest' };
    if (t && t.getAttribute('content')) h['X-CSRFToken'] = t.getAttribute('content');
    return h;
  }
  function post(url, data) {
    var body = new URLSearchParams();
    Object.keys(data || {}).forEach(function (k) { body.append(k, data[k]); });
    return fetch(url, { method: 'POST', headers: csrfHeaders(), body: body })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .catch(function () { return { ok: false }; });
  }

  /* ===================== 1) REPRODUCTOR ===================== */
  function initPlayer(root) {
    if (!root || root.dataset.plPlayerReady === '1') return;
    root.dataset.plPlayerReady = '1';

    var filas = Array.prototype.slice.call(root.querySelectorAll('[data-pl-row]'))
      .filter(function (li) { return !!li.getAttribute('data-pl-src'); });
    if (!filas.length) return;

    var audio = new Audio();
    audio.preload = 'none';
    var actual = -1;                       // índice de la fila que está sonando
    var arrastrando = false;

    function zona(li) { return li.querySelector('[data-pl-player-zone]'); }

    function limpia(li) {
      li.classList.remove('is-playing', 'is-paused');
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = '0%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = '0%';
      var t = li.querySelector('[data-pl-time]'); if (t) t.textContent = '0:00';
      var ic = li.querySelector('[data-pl-icon]'); if (ic) ic.className = 'fa fa-play';
    }

    function pinta() {
      filas.forEach(function (li, i) {
        if (i !== actual) { limpia(li); return; }
        li.classList.add('is-playing');
        li.classList.toggle('is-paused', audio.paused);
        var ic = li.querySelector('[data-pl-icon]');
        if (ic) ic.className = 'fa ' + (audio.paused ? 'fa-play' : 'fa-pause');
        var bt = li.querySelector('[data-pl-toggle] i');
        if (bt) bt.className = 'fa ' + (audio.paused ? 'fa-play' : 'fa-pause');
      });
    }

    function progreso() {
      if (actual < 0 || arrastrando) return;
      var li = filas[actual];
      var total = audio.duration;
      var pct = (isFinite(total) && total > 0) ? (audio.currentTime / total) * 100 : 0;
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = pct + '%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = pct + '%';
      var t = li.querySelector('[data-pl-time]'); if (t) t.textContent = fmt(audio.currentTime);
    }

    function suena(idx) {
      if (idx < 0 || idx >= filas.length) return;
      if (idx === actual) {                     // la misma: pausa o sigue
        if (audio.paused) { audio.play().catch(function () {}); } else { audio.pause(); }
        pinta();
        return;
      }
      actual = idx;
      var li = filas[idx];
      audio.src = li.getAttribute('data-pl-src');
      audio.currentTime = 0;
      pinta();
      audio.play().catch(function () { pinta(); });
    }

    audio.addEventListener('timeupdate', progreso);
    audio.addEventListener('play', pinta);
    audio.addEventListener('pause', pinta);
    audio.addEventListener('loadedmetadata', function () {
      if (actual < 0) return;
      var li = filas[actual];
      var etq = li.querySelector('[data-pl-durlabel]');
      if (etq && !etq.textContent.trim() && isFinite(audio.duration)) etq.textContent = fmt(audio.duration);
      progreso();
    });
    audio.addEventListener('ended', function () {
      // Al terminar una canción se reproduce automáticamente la siguiente.
      var siguiente = actual + 1;
      limpia(filas[actual]);
      if (siguiente < filas.length) { actual = -1; suena(siguiente); }
      else { actual = -1; }
    });

    // --- Clic en cualquier sitio de la línea (menos en los botones de dentro) ---
    root.addEventListener('click', function (ev) {
      var li = ev.target.closest('[data-pl-row]');
      if (!li || !root.contains(li)) return;
      if (ev.target.closest('[data-pl-track]')) return;                  // la barra la lleva su gesto
      if (ev.target.closest('.pl-row__dl, .dropdown-menu, a')) return;   // descargar / enlaces
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      ev.preventDefault();
      suena(idx);
    });

    // --- Arrastrar la barra para moverte ---
    function seek(li, clientX) {
      var track = li.querySelector('[data-pl-track]');
      if (!track) return;
      var caja = track.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (clientX - caja.left) / (caja.width || 1)));
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = (pct * 100) + '%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = (pct * 100) + '%';
      if (isFinite(audio.duration) && audio.duration > 0) {
        var t = li.querySelector('[data-pl-time]');
        if (t) t.textContent = fmt(audio.duration * pct);
        return audio.duration * pct;
      }
      return null;
    }
    root.addEventListener('pointerdown', function (ev) {
      var track = ev.target.closest('[data-pl-track]');
      if (!track) return;
      var li = track.closest('[data-pl-row]');
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      if (idx !== actual) { suena(idx); return; }
      arrastrando = true;
      try { track.setPointerCapture(ev.pointerId); } catch (e) {}
      seek(li, ev.clientX);
      function mueve(e2) { seek(li, e2.clientX); }
      function suelta(e2) {
        var destino = seek(li, e2.clientX);
        arrastrando = false;
        if (destino != null) { try { audio.currentTime = destino; } catch (e) {} }
        track.removeEventListener('pointermove', mueve);
        track.removeEventListener('pointerup', suelta);
        track.removeEventListener('pointercancel', suelta);
      }
      track.addEventListener('pointermove', mueve);
      track.addEventListener('pointerup', suelta);
      track.addEventListener('pointercancel', suelta);
      ev.preventDefault();
    });

    // --- Pausar con su botón ---
    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pl-toggle]');
      if (!btn) return;
      ev.stopPropagation();
      ev.preventDefault();
      var li = btn.closest('[data-pl-row]');
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      suena(idx);
    }, true);

    // --- DURACIONES que faltan: de una en una, y se apuntan en el servidor ---
    var base = root.getAttribute('data-duration-base') || '';
    var cola = filas.filter(function (li) { return !(li.getAttribute('data-pl-dur') || '').trim(); });
    (function siguiente() {
      var li = cola.shift();
      if (!li) return;
      var sonda = document.createElement('audio');
      sonda.preload = 'metadata';
      var listo = false;
      function acaba() {
        if (listo) return;
        listo = true;
        sonda.removeAttribute('src');
        setTimeout(siguiente, 0);
      }
      sonda.addEventListener('loadedmetadata', function () {
        var seg = Math.round(sonda.duration || 0);
        if (seg > 0 && isFinite(seg)) {
          var etq = li.querySelector('[data-pl-durlabel]');
          if (etq) etq.textContent = fmt(seg);
          li.setAttribute('data-pl-dur', String(seg));
          if (base) {
            var url = base.replace('__ID__', li.getAttribute('data-pl-item') || '');
            post(url, { seconds: seg });
          }
        }
        acaba();
      });
      sonda.addEventListener('error', acaba);
      sonda.src = li.getAttribute('data-pl-src');
    })();
  }

  /* ===================== 2) EDICIÓN ===================== */
  function initEdit(root) {
    if (!root || root.dataset.plEditReady === '1') return;
    root.dataset.plEditReady = '1';

    var rowsEl = root.querySelector('[data-pl-rows]');
    var emptyEl = root.querySelector('[data-pl-empty]');
    var countEl = root.querySelector('[data-pl-count]');
    var savedEl = root.querySelector('[data-pl-saved]');
    var nameEl = root.querySelector('[data-pl-name]');
    var noteBox = root.querySelector('[data-pl-note-box]');
    var noteEl = root.querySelector('[data-pl-note]');
    var noteAdd = root.querySelector('[data-pl-note-add]');

    var rows = [];
    try { rows = JSON.parse(root.querySelector('[data-pl-items]').textContent || '[]') || []; } catch (e) { rows = []; }
    rows = rows.map(function (r) {
      return {
        id: r.id || '', kind: (r.kind || 'SONG').toUpperCase(), title: r.title || '',
        song_id: r.song_id || '', demo_id: r.demo_id || '',
        cover_url: r.cover_url || '', artist_name: r.artist_name || '',
        artist_photo: r.artist_photo || '', subtitle: r.subtitle || '',
        duration_seconds: r.duration_seconds || 0
      };
    });

    var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
    var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';

    function rowHtml(r, i) {
      var asa = '<span class="pl-erow__handle" title="Arrastra para colocarla"><i class="fa fa-grip-vertical"></i></span>';
      var quitar = '<button class="pl-erow__del" type="button" data-pl-del title="Quitar de la playlist" aria-label="Quitar"><i class="fa fa-xmark"></i></button>';
      if (r.kind === 'TITLE') {
        return '<li class="pl-erow pl-erow--title" draggable="true" data-idx="' + i + '">' + asa +
          '<span class="pl-erow__tag">TÍTULO</span>' +
          '<input class="form-control form-control-sm" data-pl-field="title" value="' + esc(r.title) + '" placeholder="Escribe el título">' +
          quitar + '</li>';
      }
      if (r.kind === 'DIVIDER') {
        return '<li class="pl-erow pl-erow--divider" draggable="true" data-idx="' + i + '">' + asa +
          '<span class="pl-erow__tag">DIVISIÓN</span><span class="pl-erow__line"></span>' + quitar + '</li>';
      }
      return '<li class="pl-erow" draggable="true" data-idx="' + i + '">' + asa +
        '<img class="pl-erow__cover" src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>' +
        '<span class="pl-erow__main">' +
          '<span class="pl-erow__title">' + esc(r.title) + '</span>' +
          '<span class="pl-erow__artist">' +
            (r.artist_name ? '<img src="' + esc(r.artist_photo || AVATAR) + '" alt="" data-avatar="1">' + esc(r.artist_name) : '') +
            (r.subtitle ? '<span class="pl-row__tag">' + esc(r.subtitle) + '</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="pl-erow__dur">' + (r.duration_seconds ? fmt(r.duration_seconds) : '') + '</span>' +
        quitar + '</li>';
    }

    function render() {
      rowsEl.innerHTML = rows.map(rowHtml).join('');
      var suenan = rows.filter(function (r) { return r.kind === 'SONG' || r.kind === 'DEMO'; }).length;
      if (countEl) countEl.textContent = suenan;
      if (emptyEl) emptyEl.classList.toggle('d-none', rows.length > 0);
      if (window.initImageFallbacks) { try { window.initImageFallbacks(); } catch (e) {} }
    }

    function tocado() { if (savedEl) savedEl.textContent = 'Sin guardar'; }

    // --- Edición en vivo del título de una línea ---
    rowsEl.addEventListener('input', function (ev) {
      if (ev.target.getAttribute('data-pl-field') !== 'title') return;
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      var r = rows[+li.getAttribute('data-idx')]; if (!r) return;
      r.title = ev.target.value;
      tocado();
    });
    rowsEl.addEventListener('click', function (ev) {
      if (!ev.target.closest('[data-pl-del]')) return;
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      rows.splice(+li.getAttribute('data-idx'), 1);
      render(); tocado();
    });

    // --- Arrastrar para colocar (vale igual para canciones, títulos y divisiones) ---
    var dragIdx = null;
    rowsEl.addEventListener('dragstart', function (ev) {
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      dragIdx = +li.getAttribute('data-idx');
      li.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', String(dragIdx)); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
    });
    rowsEl.addEventListener('dragend', function () {
      dragIdx = null;
      Array.prototype.forEach.call(rowsEl.querySelectorAll('.dragging'), function (n) { n.classList.remove('dragging'); });
    });
    rowsEl.addEventListener('dragover', function (ev) { ev.preventDefault(); });
    rowsEl.addEventListener('drop', function (ev) {
      ev.preventDefault();
      if (dragIdx === null) return;
      var li = ev.target.closest('[data-idx]');
      var to = li ? +li.getAttribute('data-idx') : rows.length - 1;
      if (to === dragIdx) return;
      rows.splice(to, 0, rows.splice(dragIdx, 1)[0]);
      dragIdx = null;
      render(); tocado();
    });

    // --- Añadir título / división ---
    var btnTitle = root.querySelector('[data-pl-add-title]');
    if (btnTitle) btnTitle.addEventListener('click', function () {
      rows.push({ id: '', kind: 'TITLE', title: '' });
      render(); tocado();
      var last = rowsEl.querySelector('.pl-erow:last-child input'); if (last) last.focus();
    });
    var btnDiv = root.querySelector('[data-pl-add-divider]');
    if (btnDiv) btnDiv.addEventListener('click', function () {
      rows.push({ id: '', kind: 'DIVIDER', title: '' });
      render(); tocado();
    });

    // --- Nota ---
    if (noteAdd) noteAdd.addEventListener('click', function () {
      if (noteBox) noteBox.classList.remove('d-none');
      noteAdd.classList.add('d-none');
      if (noteEl) noteEl.focus();
    });
    var noteDel = root.querySelector('[data-pl-note-del]');
    if (noteDel) noteDel.addEventListener('click', function () {
      if (noteEl) noteEl.value = '';
      if (noteBox) noteBox.classList.add('d-none');
      if (noteAdd) noteAdd.classList.remove('d-none');
      tocado();
    });
    if (noteEl) noteEl.addEventListener('input', tocado);
    if (nameEl) nameEl.addEventListener('input', tocado);

    // --- Guardar ---
    function payload() {
      return rows.map(function (r) {
        return { id: r.id || '', kind: r.kind, title: r.title || '', song_id: r.song_id || '', demo_id: r.demo_id || '' };
      });
    }
    function guarda() {
      var btn = root.querySelector('[data-pl-save]');
      if (btn) btn.disabled = true;
      if (savedEl) savedEl.textContent = 'Guardando…';
      return post(root.getAttribute('data-save-url'), {
        name: (nameEl && nameEl.value) || '',
        note: (noteEl && noteEl.value) || '',
        items: JSON.stringify(payload())
      }).then(function (js) {
        if (btn) btn.disabled = false;
        if (js && js.ok) {
          // Las líneas nuevas ya tienen id: se recogen para que un segundo guardado no las duplique.
          rows = (js.items || []).map(function (r) {
            return {
              id: r.id || '', kind: (r.kind || 'SONG').toUpperCase(), title: r.title || '',
              song_id: r.song_id || '', demo_id: r.demo_id || '', cover_url: r.cover_url || '',
              artist_name: r.artist_name || '', artist_photo: r.artist_photo || '',
              subtitle: r.subtitle || '', duration_seconds: r.duration_seconds || 0
            };
          });
          render();
          if (savedEl) savedEl.textContent = 'Guardada';
        } else {
          if (savedEl) savedEl.textContent = '';
          alert('No se pudo guardar la playlist.' + (js && js.error ? ' (' + js.error + ')' : ''));
        }
        return js;
      });
    }
    var btnSave = root.querySelector('[data-pl-save]');
    if (btnSave) btnSave.addEventListener('click', guarda);

    /* ---------- Pop-up de añadir canción ---------- */
    var modal = document.getElementById('playlistPickModal');
    if (modal) {
      var cuerpo = modal.querySelector('[data-pick-body]');
      var sub = modal.querySelector('[data-pick-sub]');
      var atras = modal.querySelector('[data-pick-back]');
      var pickerUrl = root.getAttribute('data-picker-url') || '';
      var estado = { paso: 'fuente', source: '', artist: '', artistName: '' };

      function cargando() { cuerpo.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-spinner fa-spin"></i></div>'; }

      function pintaFuente() {
        estado.paso = 'fuente';
        if (sub) sub.textContent = '¿De dónde la cogemos?';
        if (atras) atras.classList.add('d-none');
        cuerpo.innerHTML =
          '<div class="pl-pick-sources">' +
            '<button class="pl-pick-source" type="button" data-pick-source="demos">' +
              '<i class="fa fa-compact-disc"></i><span>Demos</span>' +
              '<span class="small text-muted">Las maquetas que se están valorando</span></button>' +
            '<button class="pl-pick-source" type="button" data-pick-source="repertorio">' +
              '<i class="fa fa-music"></i><span>Repertorio</span>' +
              '<span class="small text-muted">Las canciones del catálogo</span></button>' +
          '</div>';
      }

      function grupoHtml(g) {
        var img = g.photo
          ? '<img src="' + esc(g.photo) + '" alt="" data-avatar="1">'
          : '<span class="pl-pick-artist__icon"><i class="fa ' + esc(g.icon || 'fa-user') + '"></i></span>';
        return '<button class="pl-pick-artist" type="button" data-pick-artist="' + esc(g.id) + '" data-name="' + esc(g.name) + '">' +
          img + '<span class="pl-pick-artist__name">' + esc(g.name) + '</span>' +
          '<span class="badge text-bg-light border">' + (g.count || 0) + '</span></button>';
      }

      function pintaArtistas(js) {
        estado.paso = 'artistas';
        if (sub) sub.textContent = (estado.source === 'demos') ? 'Demos · elige de quién' : 'Repertorio · elige el artista';
        if (atras) atras.classList.remove('d-none');
        var html = '<input class="form-control form-control-sm mb-3" data-pick-filter placeholder="Buscar…" autocomplete="off">';
        if (estado.source === 'demos') {
          var grupos = js.groups || [];
          html += grupos.length ? '<div class="pl-pick-artists">' + grupos.map(grupoHtml).join('') + '</div>'
                                : '<div class="alert alert-light border">No hay maquetas todavía.</div>';
        } else {
          var act = js.active || [], otros = js.others || [];
          html += act.length ? '<div class="pl-pick-artists">' + act.map(grupoHtml).join('') + '</div>'
                             : '<div class="alert alert-light border">Ningún artista activo con repertorio.</div>';
          if (otros.length) {
            html += '<div class="mt-3"><button class="btn btn-sm btn-outline-secondary" type="button" data-pick-more>' +
              '<i class="fa fa-chevron-down me-1"></i>Ver más artistas (' + otros.length + ')</button>' +
              '<div class="pl-pick-artists mt-2 d-none" data-pick-others>' + otros.map(grupoHtml).join('') + '</div></div>';
          }
        }
        cuerpo.innerHTML = html;
      }

      function pintaTemas(filas) {
        estado.paso = 'temas';
        if (sub) sub.textContent = estado.artistName + ' · pincha el tema para añadirlo';
        if (atras) atras.classList.remove('d-none');
        if (!filas.length) {
          cuerpo.innerHTML = '<div class="alert alert-light border">No hay nada aquí.</div>';
          return;
        }
        // ⚠️ Los datos van en data-* SUELTOS, no en un JSON dentro del atributo: un JSON con comillas
        //    dentro de un atributo se corta en la primera comilla (el mismo tropiezo que `|tojson`).
        cuerpo.innerHTML =
          '<input class="form-control form-control-sm mb-3" data-pick-filter placeholder="Buscar…" autocomplete="off">' +
          '<div class="pl-pick-songs">' + filas.map(function (f) {
            return '<button class="pl-pick-song" type="button" data-pick-add="1"' +
              ' data-kind="' + esc(f.kind) + '" data-id="' + esc(f.id) + '"' +
              ' data-title="' + esc(f.title) + '" data-cover="' + esc(f.cover_url || '') + '"' +
              ' data-artist="' + esc(f.artist_name || '') + '" data-photo="' + esc(f.artist_photo || '') + '"' +
              ' data-subtitle="' + esc(f.subtitle || '') + '">' +
              '<img src="' + esc(f.cover_url || COVER) + '" alt="" data-cover>' +
              '<span class="pl-pick-song__main"><span class="pl-pick-song__title">' + esc(f.title) + '</span>' +
              '<span class="pl-pick-song__sub">' + esc(f.artist_name || '') +
              (f.subtitle ? ' · ' + esc(f.subtitle) : '') + '</span></span>' +
              (f.playable ? '' : '<span class="badge text-bg-light border text-muted" title="Sin audio">sin audio</span>') +
              '<i class="fa fa-plus text-success"></i></button>';
          }).join('') + '</div>';
      }

      function pide(params) {
        cargando();
        var url = pickerUrl + (pickerUrl.indexOf('?') >= 0 ? '&' : '?') + new URLSearchParams(params).toString();
        return fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function (r) { return r.json(); })
          .catch(function () { return { ok: false }; });
      }

      cuerpo.addEventListener('click', function (ev) {
        var fuente = ev.target.closest('[data-pick-source]');
        if (fuente) {
          estado.source = fuente.getAttribute('data-pick-source');
          pide({ source: estado.source }).then(function (js) {
            if (!js || !js.ok) { cuerpo.innerHTML = '<div class="alert alert-danger">No se pudo cargar.</div>'; return; }
            pintaArtistas(js);
          });
          return;
        }
        var mas = ev.target.closest('[data-pick-more]');
        if (mas) {
          var caja = cuerpo.querySelector('[data-pick-others]');
          if (caja) caja.classList.remove('d-none');
          mas.classList.add('d-none');
          return;
        }
        var art = ev.target.closest('[data-pick-artist]');
        if (art) {
          estado.artist = art.getAttribute('data-pick-artist');
          estado.artistName = art.getAttribute('data-name') || '';
          pide({ source: estado.source, artist: estado.artist }).then(function (js) {
            if (!js || !js.ok) { cuerpo.innerHTML = '<div class="alert alert-danger">No se pudo cargar.</div>'; return; }
            pintaTemas(js.rows || []);
          });
          return;
        }
        var add = ev.target.closest('[data-pick-add]');
        if (add) {
          var kind = (add.getAttribute('data-kind') || 'SONG').toUpperCase();
          var id = add.getAttribute('data-id') || '';
          rows.push({
            id: '', kind: kind, title: add.getAttribute('data-title') || '',
            song_id: (kind === 'SONG' ? id : ''), demo_id: (kind === 'DEMO' ? id : ''),
            cover_url: add.getAttribute('data-cover') || '',
            artist_name: add.getAttribute('data-artist') || '',
            artist_photo: add.getAttribute('data-photo') || '',
            subtitle: add.getAttribute('data-subtitle') || '', duration_seconds: 0
          });
          render(); tocado();
          add.classList.add('is-added');
          var mas = add.querySelector('i.fa-plus');
          if (mas) mas.className = 'fa fa-check text-success';
          return;
        }
      });

      cuerpo.addEventListener('input', function (ev) {
        if (!ev.target.matches('[data-pick-filter]')) return;
        var q = (ev.target.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        Array.prototype.forEach.call(cuerpo.querySelectorAll('.pl-pick-artist, .pl-pick-song'), function (el) {
          var txt = (el.textContent || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          el.classList.toggle('d-none', !!q && txt.indexOf(q) < 0);
        });
      });

      if (atras) atras.addEventListener('click', function () {
        if (estado.paso === 'temas') {
          pide({ source: estado.source }).then(function (js) { if (js && js.ok) pintaArtistas(js); });
        } else {
          pintaFuente();
        }
      });

      // ⚠️ Se monta en el PROPIO CLIC (o en `show`): con modal_stack.js por medio `shown.bs.modal`
      //    puede no llegar nunca, y el pop-up saldría vacío (bug real de los calendarios).
      modal.addEventListener('show.bs.modal', pintaFuente);
      pintaFuente();
    }

    /* ---------- Nombre del archivo de la portada ---------- */
    var coverInput = document.getElementById('plCoverFile');
    var coverName = document.querySelector('[data-pl-cover-name]');
    if (coverInput && coverName) {
      coverInput.addEventListener('change', function () {
        var f = coverInput.files && coverInput.files[0];
        coverName.textContent = f ? f.name : '';
      });
    }

    render();          // ⚠️ el pintado INICIAL: sin esto la playlist sale vacía al entrar a editar
  }

  /* ===================== 3) ¿Se puede descargar? ===================== */
  function initAllowDownload() {
    var sw = document.querySelector('[data-pl-allow-download]');
    if (!sw || sw.dataset.plReady === '1') return;
    sw.dataset.plReady = '1';
    sw.addEventListener('change', function () {
      sw.disabled = true;
      post(sw.getAttribute('data-pl-allow-download'), { allow_download: sw.checked ? '1' : '0' })
        .then(function (js) {
          if (js && js.ok) {
            // Recargamos: el icono de descargar de cada tema aparece o desaparece con esto.
            window.location.reload();
          } else {
            sw.disabled = false;
            sw.checked = !sw.checked;
            alert('No se pudo guardar el ajuste.');
          }
        });
    });
  }

  function init(root) {
    var ambito = root || document;
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-playlist-player]') : []).forEach(initPlayer);
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-playlist-edit]') : []).forEach(initEdit);
    initAllowDownload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('inline:updated', function (ev) { init(ev.target || document); });
  window.initPlaylist = init;
})();
