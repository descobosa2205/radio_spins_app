/* Set list por concierto/actividad (panel _setlist_panel.html).
 * Estado en el array `rows`; se re-renderiza al añadir/borrar/reordenar. Los inputs actualizan
 * `rows` en vivo por delegación. "Guardar" manda todo el array por AJAX. */
(function () {
  var root = document.querySelector('[data-setlist]');
  if (!root) return;
  var rowsEl = root.querySelector('[data-setlist-rows]');
  var emptyEl = root.querySelector('[data-setlist-empty]');
  var totalEl = root.querySelector('[data-setlist-total]');
  var pick = root.querySelector('[data-setlist-song-pick]');

  var rows = [];
  try { rows = JSON.parse(root.querySelector('[data-setlist-items]').textContent || '[]'); } catch (e) { rows = []; }
  rows = (rows || []).map(function (r) {
    return { kind: (r.kind || 'SONG').toUpperCase(), song_id: r.song_id || '', title: r.title || '',
             duration_seconds: parseInt(r.duration_seconds || 0, 10) || 0, note: r.note || '' };
  });

  function esc(v) { return (v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
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

  function rowHtml(r, idx) {
    var handle = '<span class="setlist-row__handle" title="Arrastra para ordenar"><i class="fa fa-grip-vertical"></i></span>';
    var menu = '<div class="dropdown setlist-row__menu">' +
      '<button class="btn btn-sm btn-link text-muted p-1" type="button" data-bs-toggle="dropdown" aria-label="Opciones"><i class="fa fa-ellipsis-vertical"></i></button>' +
      '<ul class="dropdown-menu dropdown-menu-end">' +
      (r.kind === 'SONG' ? '<li><a class="dropdown-item" href="#" data-act="comment"><i class="fa fa-comment me-2"></i>Comentario</a></li>' : '') +
      '<li><a class="dropdown-item text-danger" href="#" data-act="del"><i class="fa fa-trash me-2"></i>Eliminar</a></li>' +
      '</ul></div>';
    if (r.kind === 'BREAK') {
      return '<li class="setlist-row setlist-row--break" draggable="true" data-idx="' + idx + '">' + handle +
        '<span class="setlist-row__tag">PARÓN</span>' +
        '<input class="form-control form-control-sm" data-field="title" placeholder="Etiqueta (opcional)" value="' + esc(r.title) + '">' +
        menu + '</li>';
    }
    if (r.kind === 'NOTE') {
      return '<li class="setlist-row setlist-row--note" draggable="true" data-idx="' + idx + '">' + handle +
        '<span class="setlist-row__tag"><i class="fa fa-comment"></i></span>' +
        '<input class="form-control form-control-sm" data-field="title" placeholder="Nota / agradecimiento" value="' + esc(r.title) + '">' +
        menu + '</li>';
    }
    // SONG
    var noteRow = '<div class="setlist-row__note' + (r.note ? '' : ' d-none') + '">' +
      '<input class="form-control form-control-sm" data-field="note" placeholder="Comentario (se verá en el PDF)" value="' + esc(r.note) + '"></div>';
    return '<li class="setlist-row setlist-row--song" draggable="true" data-idx="' + idx + '">' +
      '<div class="setlist-row__main">' + handle +
      '<span class="setlist-row__num"></span>' +
      '<input class="form-control form-control-sm setlist-row__title" data-field="title" value="' + esc(r.title) + '" placeholder="Título">' +
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
  rowsEl.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]'); if (!act) return;
    e.preventDefault();
    var li = act.closest('[data-idx]'); var i = +li.getAttribute('data-idx');
    var a = act.getAttribute('data-act');
    if (a === 'del') { rows.splice(i, 1); render(); }
    else if (a === 'comment') {
      var note = li.querySelector('.setlist-row__note');
      if (note) { note.classList.remove('d-none'); var inp = note.querySelector('input'); if (inp) inp.focus(); }
    }
  });

  // --- Arrastrar para reordenar ---
  var dragIdx = null;
  rowsEl.addEventListener('dragstart', function (e) {
    var li = e.target.closest('[data-idx]'); if (!li) return;
    dragIdx = +li.getAttribute('data-idx'); li.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', String(dragIdx)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
  });
  rowsEl.addEventListener('dragend', function () {
    dragIdx = null;
    Array.prototype.forEach.call(rowsEl.querySelectorAll('.dragging'), function (n) { n.classList.remove('dragging'); });
  });
  rowsEl.addEventListener('dragover', function (e) { e.preventDefault(); });
  rowsEl.addEventListener('drop', function (e) {
    e.preventDefault();
    if (dragIdx === null) return;
    var li = e.target.closest('[data-idx]');
    var to = li ? +li.getAttribute('data-idx') : rows.length - 1;
    if (to === dragIdx) return;
    var moved = rows.splice(dragIdx, 1)[0];
    rows.splice(to, 0, moved);
    dragIdx = null;
    render();
  });

  // --- Añadir ---
  function add(r) { rows.push(r); render(); }
  root.querySelector('[data-setlist-add-song]').addEventListener('click', function () {
    if (!pick || !pick.value) return;
    var opt = pick.options[pick.selectedIndex];
    add({ kind: 'SONG', song_id: pick.value, title: opt.getAttribute('data-title') || opt.textContent.trim(),
          duration_seconds: parseInt(opt.getAttribute('data-duration') || 0, 10) || 0, note: '' });
    pick.value = '';
  });
  root.querySelector('[data-setlist-add-manual]').addEventListener('click', function () {
    add({ kind: 'SONG', song_id: '', title: '', duration_seconds: 0, note: '' });
    var last = rowsEl.querySelector('.setlist-row:last-child .setlist-row__title'); if (last) last.focus();
  });
  root.querySelector('[data-setlist-add-break]').addEventListener('click', function () { add({ kind: 'BREAK', song_id: '', title: '', duration_seconds: 0, note: '' }); });
  root.querySelector('[data-setlist-add-note]').addEventListener('click', function () {
    add({ kind: 'NOTE', song_id: '', title: '', duration_seconds: 0, note: '' });
    var last = rowsEl.querySelector('.setlist-row:last-child input[data-field="title"]'); if (last) last.focus();
  });

  // --- Guardar / plantillas / PDF ---
  function payloadItems() {
    return rows.filter(function (r) { return r.kind !== 'SONG' || (r.title || '').trim(); })
               .map(function (r) { return { kind: r.kind, song_id: r.song_id, title: r.title, duration_seconds: r.duration_seconds, note: r.note }; });
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
          rows = (js.items || []).map(function (r) {
            return { kind: (r.kind || 'SONG').toUpperCase(), song_id: r.song_id || '', title: r.title || '',
                     duration_seconds: parseInt(r.duration_seconds || 0, 10) || 0, note: r.note || '' };
          });
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
