/* Set list por concierto/actividad (panel _setlist_panel.html).
 * Estado en el array `rows`; se re-renderiza al añadir/borrar/reordenar. Los inputs actualizan
 * `rows` en vivo por delegación. "Guardar" manda todo el array por AJAX.
 *
 * · Las canciones se AÑADEN desde el buscador del repertorio (con su PORTADA): al pinchar una entra
 *   al momento y la lista se queda abierta para seguir añadiendo.
 * · Cada canción puede llevar ICONOS (guitarra, piano, beso…): se ARRASTRAN desde la paleta hasta
 *   la canción, o —con el dedo— se pincha la canción y luego el icono. Se guardan con la línea y
 *   salen en el PDF. Cómo se pinta cada icono lo dice el servidor (`data-setlist-icons`): un dibujo
 *   propio para los que Font Awesome no trae (piano, guitarra eléctrica).
 * · Tipos de línea: SONG · BREAK (rayado, el texto en medio) · NOTE · SPEECH («Hablar», azul) ·
 *   THANKS (agradecimientos): cada uno en su propia línea, como una canción.
 * ⚠️ Un arrastre de ICONO viaja en `text/plain` como «icon:<clave>»: el de REORDENAR filas usa el
 *   mismo canal con el índice, así que el `drop` distingue por el prefijo. */
(function () {
  var root = document.querySelector('[data-setlist]');
  if (!root) return;
  var rowsEl = root.querySelector('[data-setlist-rows]');
  var emptyEl = root.querySelector('[data-setlist-empty]');
  var totalEl = root.querySelector('[data-setlist-total]');
  var pickInput = root.querySelector('[data-setlist-pick-input]');
  var pickList = root.querySelector('[data-setlist-pick-list]');
  var palette = root.querySelector('[data-setlist-palette]');
  var hintEl = root.querySelector('[data-setlist-icon-hint]');

  function readJson(sel) { try { return JSON.parse((root.querySelector(sel) || {}).textContent || 'null'); } catch (e) { return null; } }
  var SONGS = readJson('[data-setlist-songs]') || [];
  var SONG_BY_ID = {};
  SONGS.forEach(function (s) { SONG_BY_ID[String(s.id)] = s; });
  var ICON_HTML = {}, ICON_LABEL = {};
  (readJson('[data-setlist-icons]') || []).forEach(function (ic) { ICON_HTML[ic.key] = ic.html || ''; ICON_LABEL[ic.key] = ic.label || ic.key; });
  var KIND = {
    BREAK:  { tag: 'Parón', icon: 'fa-grip-lines', ph: 'Texto en medio de la raya (opcional)' },
    NOTE:   { tag: 'Nota', icon: 'fa-note-sticky', ph: 'Nota (sale en su propia línea, como una canción)' },
    SPEECH: { tag: 'Hablar', icon: 'fa-comment-dots', ph: 'Qué se dice al público…' },
    THANKS: { tag: 'Agradecimientos', icon: 'fa-hands-clapping', ph: 'A quién se agradece…' }
  };

  function normRow(r) {
    var k = (r.kind || 'SONG').toUpperCase();
    if (!KIND[k] && k !== 'SONG') k = 'SONG';
    return { kind: k, song_id: r.song_id || '', title: r.title || '',
             duration_seconds: parseInt(r.duration_seconds || 0, 10) || 0, note: r.note || '',
             icons: (k === 'SONG' ? (r.icons || []).filter(function (x) { return ICON_HTML[x] !== undefined; }) : []) };
  }
  var rows = (readJson('[data-setlist-items]') || []).map(normRow);
  var selIdx = null;   // la canción ELEGIDA (pinchada) para ponerle un icono sin arrastrar

  function esc(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function parseDur(txt) {
    txt = (txt || '').trim();
    if (!txt) return 0;
    if (/^\d+$/.test(txt)) return parseInt(txt, 10);              // solo segundos
    var p = txt.split(':').map(function (x) { return parseInt(x, 10) || 0; });
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
  }
  function fmtDur(s) {
    s = parseInt(s || 0, 10) || 0;
    if (s <= 0) return '0:00';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = (h ? String(m).padStart(2, '0') : String(m)), ss = String(sec).padStart(2, '0');
    return (h ? h + ':' + mm + ':' + ss : mm + ':' + ss);
  }
  function total() { return rows.reduce(function (a, r) { return a + (r.kind === 'SONG' ? (r.duration_seconds || 0) : 0); }, 0); }
  function updateTotal() { if (totalEl) totalEl.textContent = 'Duración total: ' + fmtDur(total()); }
  function coverOf(r) { var s = r.song_id ? SONG_BY_ID[String(r.song_id)] : null; return (s && s.cover_url) || ''; }
  function hint(msg, warn) {
    if (!hintEl) return;
    hintEl.textContent = msg;
    hintEl.classList.toggle('is-warn', !!warn);
    if (warn) { clearTimeout(hint._t); hint._t = setTimeout(function () { hintEl.classList.remove('is-warn'); hintEl.textContent = 'Arrastra un icono al lado de una canción (salen en el PDF).'; }, 3500); }
  }

  function iconsHtml(r) {
    var h = '<span class="setlist-row__icons" title="Iconos de esta canción">';
    (r.icons || []).forEach(function (k, j) {
      h += '<span class="sl-icon" data-icon-key="' + esc(k) + '" title="' + esc(ICON_LABEL[k] || k) + ' · quitar"><span class="sl-icon__g">' + (ICON_HTML[k] || '') + '</span><button type="button" class="sl-icon__x" data-icon-del="' + j + '" aria-label="Quitar"><i class="fa fa-xmark"></i></button></span>';
    });
    h += '<span class="setlist-row__dropzone" aria-hidden="true"><i class="fa fa-plus"></i></span></span>';
    return h;
  }

  function rowHtml(r, idx) {
    var handle = '<span class="setlist-row__handle" title="Arrastra para ordenar"><i class="fa fa-grip-vertical"></i></span>';
    var menu = '<div class="dropdown setlist-row__menu">' +
      '<button class="btn btn-sm btn-link text-muted p-1" type="button" data-bs-toggle="dropdown" aria-label="Opciones"><i class="fa fa-ellipsis-vertical"></i></button>' +
      '<ul class="dropdown-menu dropdown-menu-end">' +
      (r.kind === 'SONG' ? '<li><a class="dropdown-item" href="#" data-act="comment"><i class="fa fa-comment me-2"></i>Comentario</a></li>' : '') +
      '<li><a class="dropdown-item text-danger" href="#" data-act="del"><i class="fa fa-trash me-2"></i>Eliminar</a></li>' +
      '</ul></div>';
    var k = KIND[r.kind];
    if (k) {
      var cls = 'setlist-row setlist-row--' + r.kind.toLowerCase();
      return '<li class="' + cls + '" draggable="true" data-idx="' + idx + '">' + handle +
        '<span class="setlist-row__tag"><i class="fa ' + k.icon + '"></i> ' + esc(k.tag) + '</span>' +
        '<input class="form-control form-control-sm setlist-row__txt" data-field="title" placeholder="' + esc(k.ph) + '" value="' + esc(r.title) + '">' +
        menu + '</li>';
    }
    // SONG
    var cover = coverOf(r);
    var coverHtml = cover ? '<img class="setlist-row__cover" src="' + esc(cover) + '" alt="" onerror="this.remove()">'
                          : '<span class="setlist-row__cover setlist-row__cover--none"><i class="fa fa-music"></i></span>';
    var noteRow = '<div class="setlist-row__note' + (r.note ? '' : ' d-none') + '">' +
      '<input class="form-control form-control-sm" data-field="note" placeholder="Comentario (se verá en el PDF)" value="' + esc(r.note) + '"></div>';
    return '<li class="setlist-row setlist-row--song' + (selIdx === idx ? ' is-selected' : '') + '" draggable="true" data-idx="' + idx + '">' +
      '<div class="setlist-row__main">' + handle +
      '<span class="setlist-row__num"></span>' + coverHtml +
      '<input class="form-control form-control-sm setlist-row__title" data-field="title" value="' + esc(r.title) + '" placeholder="Título">' +
      iconsHtml(r) +
      '<input class="form-control form-control-sm setlist-row__dur" data-field="dur" value="' + (r.duration_seconds ? fmtDur(r.duration_seconds) : '') + '" placeholder="0:00" title="Duración (m:ss)" inputmode="numeric">' +
      menu + '</div>' + noteRow + '</li>';
  }

  function render() {
    rowsEl.innerHTML = rows.map(rowHtml).join('');
    // numerar solo las canciones
    var n = 0;
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.setlist-row'), function (li) {
      var numEl = li.querySelector('.setlist-row__num');
      if (li.classList.contains('setlist-row--song') && numEl) { numEl.textContent = (++n) + '.'; }
    });
    if (emptyEl) emptyEl.classList.toggle('d-none', rows.length > 0);
    updateTotal();
    if (pickList && !pickList.classList.contains('d-none')) paintPick();
  }
  function selectRow(i) {
    if (selIdx === i) return;
    selIdx = i;
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.setlist-row--song'), function (li) {
      li.classList.toggle('is-selected', +li.getAttribute('data-idx') === i);
    });
  }
  function addIcon(i, key) {
    var r = rows[i];
    if (!r || r.kind !== 'SONG' || !ICON_HTML[key]) return false;
    if (r.icons.indexOf(key) >= 0) { hint('Esa canción ya lleva ese icono.', true); return false; }
    if (r.icons.length >= 6) { hint('Como mucho seis iconos por canción.', true); return false; }
    r.icons.push(key);
    selIdx = i;
    render();
    return true;
  }

  // --- Edición en vivo (delegación) ---
  rowsEl.addEventListener('input', function (e) {
    var f = e.target.getAttribute('data-field'); if (!f) return;
    var li = e.target.closest('[data-idx]'); if (!li) return;
    var i = +li.getAttribute('data-idx'); var r = rows[i]; if (!r) return;
    if (f === 'title') r.title = e.target.value;
    else if (f === 'note') r.note = e.target.value;
    else if (f === 'dur') { r.duration_seconds = parseDur(e.target.value); updateTotal(); }
  });
  rowsEl.addEventListener('focusin', function (e) {
    var li = e.target.closest('.setlist-row--song[data-idx]');
    if (li) selectRow(+li.getAttribute('data-idx'));
  });
  rowsEl.addEventListener('click', function (e) {
    var del = e.target.closest('[data-icon-del]');
    if (del) {
      e.preventDefault();
      var liD = del.closest('[data-idx]'); var iD = +liD.getAttribute('data-idx');
      if (rows[iD]) { rows[iD].icons.splice(+del.getAttribute('data-icon-del'), 1); selIdx = iD; render(); }
      return;
    }
    var act = e.target.closest('[data-act]');
    if (!act) {
      var liS = e.target.closest('.setlist-row--song[data-idx]');
      if (liS) selectRow(+liS.getAttribute('data-idx'));
      return;
    }
    e.preventDefault();
    var li = act.closest('[data-idx]'); var i = +li.getAttribute('data-idx');
    var a = act.getAttribute('data-act');
    if (a === 'del') { rows.splice(i, 1); if (selIdx === i) selIdx = null; else if (selIdx !== null && selIdx > i) selIdx--; render(); }
    else if (a === 'comment') {
      var note = li.querySelector('.setlist-row__note');
      if (note) { note.classList.remove('d-none'); var inp = note.querySelector('input'); if (inp) inp.focus(); }
    }
  });

  // --- Arrastrar: reordenar filas · soltar un icono sobre una canción ---
  var dragIdx = null, dragIcon = null;
  function limpiaDrop() { Array.prototype.forEach.call(rowsEl.querySelectorAll('.is-dropover'), function (n) { n.classList.remove('is-dropover'); }); }
  rowsEl.addEventListener('dragstart', function (e) {
    var li = e.target.closest('[data-idx]'); if (!li) return;
    dragIdx = +li.getAttribute('data-idx'); li.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', String(dragIdx)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  });
  rowsEl.addEventListener('dragend', function () {
    dragIdx = null;
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.dragging'), function (n) { n.classList.remove('dragging'); });
    limpiaDrop();
  });
  rowsEl.addEventListener('dragover', function (e) {
    e.preventDefault();
    if (dragIcon === null) return;
    limpiaDrop();
    var li = e.target.closest('.setlist-row--song[data-idx]');
    if (li) { li.classList.add('is-dropover'); try { e.dataTransfer.dropEffect = 'copy'; } catch (_) {} }
  });
  rowsEl.addEventListener('dragleave', function (e) {
    var li = e.target.closest && e.target.closest('.setlist-row--song');
    if (li && !li.contains(e.relatedTarget)) li.classList.remove('is-dropover');
  });
  rowsEl.addEventListener('drop', function (e) {
    e.preventDefault();
    limpiaDrop();
    var raw = ''; try { raw = e.dataTransfer.getData('text/plain') || ''; } catch (_) {}
    var iconKey = dragIcon || (raw.indexOf('icon:') === 0 ? raw.slice(5) : '');
    if (iconKey) {
      var liI = e.target.closest('.setlist-row--song[data-idx]');
      if (liI) addIcon(+liI.getAttribute('data-idx'), iconKey);
      else hint('Suelta el icono ENCIMA de una canción.', true);
      dragIcon = null;
      return;
    }
    if (dragIdx === null) return;
    var li = e.target.closest('[data-idx]');
    var to = li ? +li.getAttribute('data-idx') : rows.length - 1;
    if (to === dragIdx) return;
    var moved = rows.splice(dragIdx, 1)[0];
    rows.splice(to, 0, moved);
    if (selIdx === dragIdx) selIdx = to;
    dragIdx = null;
    render();
  });

  // --- La PALETA de iconos ---
  if (palette) {
    palette.addEventListener('dragstart', function (e) {
      var b = e.target.closest('[data-icon]'); if (!b) return;
      dragIcon = b.getAttribute('data-icon');
      try { e.dataTransfer.setData('text/plain', 'icon:' + dragIcon); e.dataTransfer.effectAllowed = 'copy'; } catch (_) {}
      b.classList.add('dragging');
    });
    palette.addEventListener('dragend', function (e) {
      var b = e.target.closest('[data-icon]'); if (b) b.classList.remove('dragging');
      dragIcon = null; limpiaDrop();
    });
    palette.addEventListener('click', function (e) {
      var b = e.target.closest('[data-icon]'); if (!b) return;
      e.preventDefault();
      if (selIdx === null || !rows[selIdx] || rows[selIdx].kind !== 'SONG') {
        hint('Pincha antes en la canción a la que va (o arrastra el icono hasta ella).', true);
        return;
      }
      addIcon(selIdx, b.getAttribute('data-icon'));
    });
  }

  // --- El BUSCADOR del repertorio, con las portadas ---
  function inSetlist(id) { return rows.some(function (r) { return r.kind === 'SONG' && String(r.song_id) === String(id); }); }
  function paintPick() {
    if (!pickList) return;
    var q = norm(pickInput ? pickInput.value : '');
    var lista = SONGS.filter(function (s) { return !q || norm(s.title).indexOf(q) >= 0; });
    if (!lista.length) {
      pickList.innerHTML = '<div class="setlist-pick__empty">' + (SONGS.length ? 'Ninguna canción del repertorio se llama así.' : 'El artista no tiene canciones en el repertorio de la app.') + '</div>';
      return;
    }
    pickList.innerHTML = lista.slice(0, 60).map(function (s) {
      var puesto = inSetlist(s.id);
      var cover = s.cover_url ? '<img class="setlist-pick__cover" src="' + esc(s.cover_url) + '" alt="" onerror="this.remove()">'
                              : '<span class="setlist-pick__cover setlist-pick__cover--none"><i class="fa fa-music"></i></span>';
      return '<button type="button" class="setlist-pick__it' + (puesto ? ' is-added' : '') + '" data-pick="' + esc(s.id) + '">' + cover +
        '<span class="setlist-pick__title">' + esc(s.title) + '</span>' +
        (s.duration_seconds ? '<span class="setlist-pick__dur">' + fmtDur(s.duration_seconds) + '</span>' : '') +
        '<span class="setlist-pick__st"><i class="fa ' + (puesto ? 'fa-circle-check' : 'fa-plus') + '"></i></span></button>';
    }).join('') + (lista.length > 60 ? '<div class="setlist-pick__empty">Escribe para afinar: hay ' + lista.length + ' canciones.</div>' : '');
  }
  function showPick() { if (!pickList || !pickInput || pickInput.disabled) return; paintPick(); pickList.classList.remove('d-none'); }
  function hidePick() { if (pickList) pickList.classList.add('d-none'); }
  function addSong(s) {
    rows.push({ kind: 'SONG', song_id: s.id, title: s.title || '', duration_seconds: parseInt(s.duration_seconds || 0, 10) || 0, note: '', icons: [] });
    selIdx = rows.length - 1;
    render();
  }
  if (pickInput) {
    pickInput.addEventListener('focus', showPick);
    pickInput.addEventListener('click', showPick);
    pickInput.addEventListener('input', showPick);
    pickInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hidePick(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = pickList && pickList.querySelector('[data-pick]:not(.is-added)') || (pickList && pickList.querySelector('[data-pick]'));
        if (first) { var s = SONG_BY_ID[first.getAttribute('data-pick')]; if (s) { addSong(s); paintPick(); } }
      }
    });
  }
  if (pickList) {
    pickList.addEventListener('mousedown', function (e) { e.preventDefault(); });   // no le quita el foco al buscador
    pickList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]'); if (!b) return;
      var s = SONG_BY_ID[b.getAttribute('data-pick')]; if (!s) return;
      addSong(s);
      paintPick();                        // la lista se queda abierta para seguir añadiendo
      if (pickInput) pickInput.focus();
    });
  }
  document.addEventListener('click', function (e) {
    if (!root.contains(e.target) || !e.target.closest('[data-setlist-pick]')) hidePick();
  });

  // --- Añadir a mano y las demás líneas ---
  function add(r) { rows.push(normRow(r)); render(); }
  root.querySelector('[data-setlist-add-manual]').addEventListener('click', function () {
    add({ kind: 'SONG', song_id: '', title: '', duration_seconds: 0, note: '' });
    selIdx = rows.length - 1; render();
    var last = rowsEl.querySelector('.setlist-row:last-child .setlist-row__title'); if (last) last.focus();
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-setlist-add-kind]'), function (b) {
    b.addEventListener('click', function () {
      add({ kind: b.getAttribute('data-setlist-add-kind'), song_id: '', title: '', duration_seconds: 0, note: '' });
      var last = rowsEl.querySelector('.setlist-row:last-child input[data-field="title"]'); if (last) last.focus();
    });
  });

  // --- Guardar / plantillas / PDF ---
  function payloadItems() {
    return rows.filter(function (r) { return r.kind !== 'SONG' || (r.title || '').trim(); })
               .map(function (r) { return { kind: r.kind, song_id: r.song_id, title: r.title, duration_seconds: r.duration_seconds, note: r.note, icons: r.icons || [] }; });
  }
  function postForm(url, data) {
    var body = new URLSearchParams();
    Object.keys(data).forEach(function (k) { body.append(k, data[k]); });
    return fetch(url, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: body })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }
  var owner = { owner_type: root.getAttribute('data-owner-type'), owner_id: root.getAttribute('data-owner-id') };

  function save() {
    var btn = root.querySelector('[data-setlist-save]');
    if (btn) { btn.disabled = true; }
    return postForm(root.getAttribute('data-save-url'),
      { owner_type: owner.owner_type, owner_id: owner.owner_id, items: JSON.stringify(payloadItems()) })
      .then(function (js) {
        if (btn) btn.disabled = false;
        if (js && js.ok) { if (totalEl) totalEl.textContent = 'Duración total: ' + (js.total_label || fmtDur(total())); }
        else alert('No se pudo guardar el set list.' + (js && js.error ? ' (' + js.error + ')' : ''));
        return js;
      })
      .catch(function () { if (btn) btn.disabled = false; alert('No se pudo guardar el set list.'); });
  }
  root.querySelector('[data-setlist-save]').addEventListener('click', save);

  root.querySelector('[data-setlist-save-tpl]').addEventListener('click', function () {
    var artistId = root.getAttribute('data-artist-id');
    if (!artistId) { alert('Este evento no tiene artista para vincular la plantilla.'); return; }
    var name = prompt('Nombre de la plantilla (quedará guardada en el artista):', '');
    if (name === null) return;
    name = name.trim(); if (!name) return;
    // Guardamos primero el set list actual y luego lo copiamos como plantilla.
    save().then(function (js) {
      if (!js || !js.ok) return;
      postForm(root.getAttribute('data-save-tpl-url'), { owner_type: owner.owner_type, owner_id: owner.owner_id, artist_id: artistId, name: name })
        .then(function (r) { alert(r && r.ok ? 'Plantilla «' + name + '» guardada.' : 'No se pudo guardar la plantilla.'); });
    });
  });

  Array.prototype.forEach.call(root.querySelectorAll('[data-setlist-load]'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (rows.length && !confirm('Se reemplazará el set list actual por la plantilla. ¿Continuar?')) return;
      var tid = a.getAttribute('data-setlist-load');
      var url = root.getAttribute('data-tpl-items-base').replace('__TID__', tid);
      fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (js) {
          if (!js || !js.ok) { alert('No se pudo cargar la plantilla.'); return; }
          rows = (js.items || []).map(normRow);
          selIdx = null;
          render();
        });
    });
  });

  root.querySelector('[data-setlist-pdf]').addEventListener('click', function (e) {
    e.preventDefault();
    // El PDF refleja lo guardado: guardamos y luego abrimos.
    save().then(function (js) { if (js && js.ok) window.open(root.getAttribute('data-pdf-url'), '_blank'); });
  });

  render();
})();
