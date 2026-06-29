/* Galería de Fotos/Vídeos (pestaña «Fotos» de conciertos y acciones).
   Renderiza desde el JSON embebido (#fotosData), gestiona modos de vista, selección,
   subida con barra de progreso, detalle, filtros y reordenación por arrastre. */
(function () {
  'use strict';
  var panel = document.getElementById('fotosPanel');
  if (!panel) return;

  var listUrl = panel.getAttribute('data-list-url');
  var uploadUrl = panel.getAttribute('data-upload-url');
  var reorderUrl = panel.getAttribute('data-reorder-url');
  var canEdit = panel.getAttribute('data-can-edit') === '1';

  var state = { albums: [], photos: [], owner_type: '', owner_id: '' };
  try { state = JSON.parse(document.getElementById('fotosData').textContent || '{}'); } catch (e) {}

  var gallery = document.getElementById('fotosGallery');
  var emptyEl = document.getElementById('fotosEmpty');
  var bulkBar = document.getElementById('fotosBulkBar');
  var selCountEl = document.getElementById('fotosSelCount');
  var selectAll = document.getElementById('fotosSelectAll');

  var viewMode = localStorage.getItem('fotosViewMode') || 'grid3';
  var selected = {};
  var filters = { APPROVED: true, REJECTED: false, PENDING: false, NONE: true };

  function csrfToken() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function bsModal(id) { var el = document.getElementById(id); return (el && window.bootstrap) ? bootstrap.Modal.getOrCreateInstance(el) : null; }

  // ----------------------------------------------------------------- render
  function passesFilter(p) { return !!filters[p.approval_state || 'NONE']; }

  function mediaHtml(p, cls) {
    if (p.is_video) {
      return '<video src="' + esc(p.file_url) + '" class="' + cls + '" preload="metadata" muted></video>'
        + '<span class="fotos-tile__play"><i class="fa fa-play"></i></span>';
    }
    return '<img src="' + esc(p.file_url) + '" class="' + cls + '" loading="lazy" alt="">';
  }

  function tileHtml(p, inAlbum) {
    var selCls = selected[p.id] ? ' fotos-tile--selected' : '';
    return '<div class="fotos-tile' + selCls + '" data-photo-id="' + esc(p.id) + '"' + (canEdit && !inAlbum ? ' draggable="true"' : '') + '>'
      + '<label class="fotos-tile__check"><input type="checkbox" class="form-check-input fotos-check" data-id="' + esc(p.id) + '"' + (selected[p.id] ? ' checked' : '') + '></label>'
      + '<div class="fotos-tile__frame">' + mediaHtml(p, 'fotos-tile__media') + '</div>'
      + '<div class="fotos-tile__title" title="' + esc(p.title) + '">' + esc(p.title || '—') + '</div>'
      + '</div>';
  }

  function albumHtml(a) {
    var thumbs = (a.photos || []).filter(passesFilter).map(function (p) { return tileHtml(p, true); }).join('');
    return '<div class="fotos-album">'
      + '<div class="fotos-album__head">'
      + '<div class="fotos-album__cover">' + (a.cover_url ? '<img src="' + esc(a.cover_url) + '" alt="">' : '<i class="fa fa-images"></i>') + '</div>'
      + '<div class="fotos-album__meta"><div class="fotos-album__name">' + esc(a.name) + '</div>'
      + '<div class="small text-muted">(' + (a.count || 0) + ' foto' + (a.count === 1 ? '' : 's') + ')</div></div>'
      + '</div>'
      + '<div class="fotos-album__items fotos-gallery fotos-' + viewMode + '">' + thumbs + '</div>'
      + '</div>';
  }

  function render() {
    gallery.className = 'fotos-gallery fotos-' + viewMode;
    var html = '';
    (state.albums || []).forEach(function (a) { html += albumHtml(a); });
    var loose = (state.photos || []).filter(passesFilter);
    loose.forEach(function (p) { html += tileHtml(p, false); });
    gallery.innerHTML = html;
    var hasAny = ((state.albums || []).length) || loose.length;
    emptyEl.classList.toggle('d-none', !!hasAny);
    updateBulk();
  }

  // ------------------------------------------------------------- selección
  function allVisibleIds() {
    var ids = [];
    (state.albums || []).forEach(function (a) { (a.photos || []).forEach(function (p) { if (passesFilter(p)) ids.push(p.id); }); });
    (state.photos || []).forEach(function (p) { if (passesFilter(p)) ids.push(p.id); });
    return ids;
  }

  function updateBulk() {
    var n = Object.keys(selected).length;
    if (n > 1) { bulkBar.classList.remove('d-none'); bulkBar.classList.add('d-flex'); }
    else { bulkBar.classList.add('d-none'); bulkBar.classList.remove('d-flex'); }
    selCountEl.textContent = n + (n === 1 ? ' seleccionada' : ' seleccionadas');
    var visible = allVisibleIds();
    selectAll.checked = visible.length > 0 && visible.every(function (id) { return selected[id]; });
  }

  gallery.addEventListener('change', function (e) {
    var cb = e.target.closest('.fotos-check');
    if (!cb) return;
    var id = cb.getAttribute('data-id');
    if (cb.checked) selected[id] = true; else delete selected[id];
    var tile = cb.closest('.fotos-tile');
    if (tile) tile.classList.toggle('fotos-tile--selected', cb.checked);
    updateBulk();
  });

  selectAll.addEventListener('change', function () {
    var ids = allVisibleIds();
    if (selectAll.checked) ids.forEach(function (id) { selected[id] = true; });
    else selected = {};
    render();
  });

  // -------------------------------------------------------- abrir detalle
  gallery.addEventListener('click', function (e) {
    if (e.target.closest('.fotos-tile__check')) return; // no abrir al marcar
    var tile = e.target.closest('.fotos-tile');
    if (!tile) return;
    openDetail(tile.getAttribute('data-photo-id'));
  });

  function openDetail(photoId) {
    var media = document.getElementById('fotosDetailMedia');
    var info = document.getElementById('fotosDetailInfo');
    media.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-spinner fa-spin"></i></div>';
    info.innerHTML = '';
    bsModal('fotosDetailModal').show();
    fetch('/fotos/photo/' + photoId).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { media.innerHTML = '<div class="alert alert-warning">No se pudo cargar.</div>'; return; }
      var p = d.photo;
      document.getElementById('fotosDetailTitle').textContent = p.title || 'Foto';
      media.innerHTML = p.is_video
        ? '<video src="' + esc(p.file_url) + '" class="fotos-detail-media__el" controls></video>'
        : '<img src="' + esc(p.file_url) + '" class="fotos-detail-media__el" alt="">';
      info.innerHTML = detailInfoHtml(p);
    });
  }

  function detailInfoHtml(p) {
    var rows = '';
    if (p.artist) {
      rows += infoRow('Artista', '<span class="fotos-chip">' + avatar(p.artist.photo_url) + esc(p.artist.name) + '</span>');
    }
    if (p.owner_title) {
      rows += infoRow('Vinculada a', '<a href="' + esc(p.owner_url) + '"><i class="fa ' + (p.owner_type === 'CONCERT' ? 'fa-guitar' : 'fa-bullhorn') + ' me-1"></i>' + esc(p.owner_title) + '</a>');
    }
    if (p.created_at) rows += infoRow('Subida', new Date(p.created_at).toLocaleDateString('es-ES'));
    var photog = p.photographer_unknown ? '<span class="text-muted">Desconocido</span>'
      : (p.photographer ? '<span class="fotos-chip">' + avatar(p.photographer.logo_url) + esc(p.photographer.name) + '</span>' : '<span class="text-muted">Desconocido</span>');
    rows += infoRow('Fotógrafo', photog);
    rows += infoRow('Aprobación', '<span class="text-muted small">Sin solicitud de aprobación</span>');
    return '<table class="table table-sm fotos-detail-table mb-0"><tbody>' + rows + '</tbody></table>';
  }
  function infoRow(k, v) { return '<tr><th class="text-muted fw-normal small" style="width:40%">' + esc(k) + '</th><td>' + v + '</td></tr>'; }
  function avatar(url) { return '<span class="fotos-avatar">' + (url ? '<img src="' + esc(url) + '" alt="">' : '<i class="fa fa-user"></i>') + '</span>'; }

  // ---------------------------------------------------------- modos de vista
  panel.querySelectorAll('[data-view-mode]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-view-mode') === viewMode);
    btn.addEventListener('click', function () {
      viewMode = btn.getAttribute('data-view-mode');
      localStorage.setItem('fotosViewMode', viewMode);
      panel.querySelectorAll('[data-view-mode]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      render();
    });
  });

  // -------------------------------------------------------------- filtros
  document.getElementById('fotosFilterBtn').addEventListener('click', function () { bsModal('fotosFilterModal').show(); });
  var applyBtn = document.getElementById('fotosFilterApply');
  if (applyBtn) applyBtn.addEventListener('click', function () {
    ['APPROVED', 'REJECTED', 'PENDING', 'NONE'].forEach(function (k) {
      var cb = document.querySelector('#fotosFilterModal input[value="' + k + '"]');
      filters[k] = cb ? cb.checked : false;
    });
    render();
  });

  // --------------------------------------------------------------- reorder
  var dragId = null;
  gallery.addEventListener('dragstart', function (e) {
    var tile = e.target.closest('.fotos-tile');
    if (!tile || tile.parentElement !== gallery) return; // solo fotos sueltas
    dragId = tile.getAttribute('data-photo-id');
    tile.classList.add('fotos-tile--dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  gallery.addEventListener('dragover', function (e) {
    if (!dragId) return;
    e.preventDefault();
    var over = e.target.closest('.fotos-tile');
    var dragged = gallery.querySelector('.fotos-tile--dragging');
    if (!over || !dragged || over === dragged || over.parentElement !== gallery) return;
    var rect = over.getBoundingClientRect();
    var after = (e.clientY - rect.top) > rect.height / 2 || (e.clientX - rect.left) > rect.width / 2;
    gallery.insertBefore(dragged, after ? over.nextSibling : over);
  });
  gallery.addEventListener('drop', function (e) { if (dragId) e.preventDefault(); });
  gallery.addEventListener('dragend', function () {
    var dragged = gallery.querySelector('.fotos-tile--dragging');
    if (dragged) dragged.classList.remove('fotos-tile--dragging');
    if (dragId) persistOrder();
    dragId = null;
  });
  function persistOrder() {
    var ids = [].slice.call(gallery.children).filter(function (n) { return n.classList && n.classList.contains('fotos-tile'); })
      .map(function (t) { return t.getAttribute('data-photo-id'); });
    // reordena el estado local para mantener coherencia
    var byId = {}; (state.photos || []).forEach(function (p) { byId[p.id] = p; });
    state.photos = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    fetch(reorderUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: ids }) });
  }

  // --------------------------------------------------------------- bulk
  document.querySelectorAll('#fotosBulkBar [data-bulk]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var action = a.getAttribute('data-bulk');
      var ids = Object.keys(selected);
      if (!ids.length) return;
      if (action === 'delete') bulkDelete(ids);
      else if (action === 'download') bulkDownload(ids);
    });
  });

  function photoById(id) {
    var found = null;
    (state.photos || []).forEach(function (p) { if (p.id === id) found = p; });
    (state.albums || []).forEach(function (a) { (a.photos || []).forEach(function (p) { if (p.id === id) found = p; }); });
    return found;
  }
  function bulkDownload(ids) {
    ids.forEach(function (id) {
      var p = photoById(id);
      if (!p) return;
      var a = document.createElement('a');
      a.href = p.file_url; a.download = p.title || p.file_name || 'foto';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }
  function bulkDelete(ids) {
    if (!confirm('¿Eliminar ' + ids.length + ' elemento(s)? Esta acción no se puede deshacer.')) return;
    var jobs = ids.map(function (id) { return fetch('/fotos/photo/' + id + '/delete', { method: 'POST' }); });
    Promise.all(jobs).then(function () { selected = {}; refresh(); });
  }

  // ------------------------------------------------------------- refresh
  function refresh() {
    return fetch(listUrl).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) { state.albums = d.albums || []; state.photos = d.photos || []; render(); }
    });
  }

  // =====================================================================
  // Subida de fotos
  // =====================================================================
  var addBtn = document.getElementById('fotosAddBtn');
  var pending = [];      // [{file, key}]
  var photographer = null; // {id, name, logo_url}
  var photographerUnknown = false;
  var keySeq = 0;

  if (addBtn) addBtn.addEventListener('click', function () { resetUpload(); bsModal('fotosUploadModal').show(); });

  function resetUpload() {
    pending = []; photographer = null; photographerUnknown = false;
    var u = document.getElementById('fotosPhotographerUnknown'); if (u) u.checked = false;
    var s = document.getElementById('fotosPhotographerSearch'); if (s) { s.value = ''; s.disabled = false; }
    document.getElementById('fotosPhotographerChip').classList.add('d-none');
    document.getElementById('fotosPhotographerResults').classList.remove('show');
    document.getElementById('fotosProgress').classList.add('d-none');
    document.getElementById('fotosProgressBar').style.width = '0%';
    document.getElementById('fotosUploadHint').textContent = '';
    renderFileList();
  }

  // -- dropzone / file input
  var dz = document.getElementById('fotosDropzone');
  var fileInput = document.getElementById('fotosFileInput');
  if (dz) {
    dz.addEventListener('click', function () { fileInput.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('fotos-dropzone--over'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('fotos-dropzone--over'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); dz.classList.remove('fotos-dropzone--over');
      addFiles(e.dataTransfer.files);
    });
  }
  if (fileInput) fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });

  function addFiles(fileList) {
    [].slice.call(fileList || []).forEach(function (f) { pending.push({ file: f, key: 'f' + (keySeq++) }); });
    renderFileList();
  }
  function renderFileList() {
    var box = document.getElementById('fotosFileList');
    if (!pending.length) { box.innerHTML = ''; }
    else {
      box.innerHTML = pending.map(function (it) {
        var f = it.file;
        var isImg = /^image\//.test(f.type);
        var thumb = isImg ? '<img src="' + URL.createObjectURL(f) + '" alt="">' : '<i class="fa fa-film"></i>';
        return '<div class="fotos-fileitem" data-key="' + it.key + '">'
          + '<span class="fotos-fileitem__thumb">' + thumb + '</span>'
          + '<span class="fotos-fileitem__name text-truncate">' + esc(f.name) + '</span>'
          + '<button type="button" class="btn btn-sm btn-link text-danger fotos-fileitem__rm" data-key="' + it.key + '"><i class="fa fa-xmark"></i></button>'
          + '</div>';
      }).join('');
    }
    var btn = document.getElementById('fotosUploadBtn');
    btn.disabled = !pending.length;
    document.getElementById('fotosUploadHint').textContent = pending.length ? (pending.length + ' archivo(s) listos') : '';
  }
  document.getElementById('fotosFileList').addEventListener('click', function (e) {
    var rm = e.target.closest('.fotos-fileitem__rm');
    if (!rm) return;
    var key = rm.getAttribute('data-key');
    pending = pending.filter(function (it) { return it.key !== key; });
    renderFileList();
  });

  // -- fotógrafo: buscador
  var phSearch = document.getElementById('fotosPhotographerSearch');
  var phResults = document.getElementById('fotosPhotographerResults');
  var phUnknown = document.getElementById('fotosPhotographerUnknown');
  var searchTimer = null;
  if (phSearch) phSearch.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var q = phSearch.value.trim();
    if (q.length < 2) { phResults.classList.remove('show'); phResults.innerHTML = ''; return; }
    searchTimer = setTimeout(function () {
      fetch('/api/search/promoters?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (rows) {
        var list = Array.isArray(rows) ? rows : (rows.results || rows.items || []);
        if (!list.length) { phResults.innerHTML = '<span class="dropdown-item-text text-muted small">Sin resultados</span>'; }
        else {
          phResults.innerHTML = list.slice(0, 12).map(function (r) {
            var name = r.label || r.text || r.nick || '';
            return '<a class="dropdown-item d-flex align-items-center gap-2" href="#" data-id="' + esc(r.id) + '" data-name="' + esc(name) + '" data-logo="' + esc(r.logo_url || '') + '">'
              + avatar(r.logo_url) + '<span class="text-truncate">' + esc(name) + '</span></a>';
          }).join('');
        }
        phResults.classList.add('show');
      });
    }, 250);
  });
  if (phResults) phResults.addEventListener('click', function (e) {
    var a = e.target.closest('[data-id]');
    if (!a) return;
    e.preventDefault();
    setPhotographer({ id: a.getAttribute('data-id'), name: a.getAttribute('data-name'), logo_url: a.getAttribute('data-logo') });
    phResults.classList.remove('show'); phSearch.value = '';
  });
  if (phUnknown) phUnknown.addEventListener('change', function () {
    photographerUnknown = phUnknown.checked;
    if (photographerUnknown) { setPhotographer(null); }
    phSearch.disabled = photographerUnknown;
  });
  function setPhotographer(p) {
    photographer = p;
    var chip = document.getElementById('fotosPhotographerChip');
    if (p) {
      photographerUnknown = false; if (phUnknown) phUnknown.checked = false;
      chip.innerHTML = '<span class="fotos-chip">' + avatar(p.logo_url) + esc(p.name) + '</span>'
        + '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-2" id="fotosPhClear"><i class="fa fa-xmark"></i></button>';
      chip.classList.remove('d-none');
      var clr = document.getElementById('fotosPhClear');
      if (clr) clr.addEventListener('click', function () { setPhotographer(null); });
    } else {
      chip.classList.add('d-none'); chip.innerHTML = '';
    }
  }
  // alta rápida de tercero -> el <select> oculto recibe la opción y dispara change
  var phHiddenSel = document.getElementById('fotosPhotographerSelect');
  if (phHiddenSel) phHiddenSel.addEventListener('change', function () {
    var opt = phHiddenSel.options[phHiddenSel.selectedIndex];
    if (opt && opt.value) setPhotographer({ id: opt.value, name: opt.textContent, logo_url: opt.getAttribute('data-photo') || '' });
  });

  // -- subir
  document.getElementById('fotosUploadBtn').addEventListener('click', function () { doUpload(); });
  function doUpload() {
    if (!pending.length) return;
    var fd = new FormData();
    pending.forEach(function (it) { fd.append('files', it.file); });
    if (photographerUnknown) fd.append('photographer_unknown', '1');
    else if (photographer) fd.append('photographer_promoter_id', photographer.id);

    var prog = document.getElementById('fotosProgress');
    var bar = document.getElementById('fotosProgressBar');
    var pct = document.getElementById('fotosProgressPct');
    var label = document.getElementById('fotosProgressLabel');
    prog.classList.remove('d-none');
    document.getElementById('fotosUploadBtn').disabled = true;

    var xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('X-CSRFToken', csrfToken());
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var p = Math.round(e.loaded * 100 / e.total);
      bar.style.width = p + '%'; pct.textContent = p + '%';
    };
    xhr.onload = function () {
      var ok = xhr.status >= 200 && xhr.status < 300;
      var data = {}; try { data = JSON.parse(xhr.responseText); } catch (e) {}
      if (ok && data.ok) {
        var n = (data.created || []).length;
        label.textContent = n + ' ' + (n === 1 ? 'archivo guardado' : 'archivos guardados');
        bar.classList.add('bg-success');
        refresh().then(function () {
          setTimeout(function () { var m = bsModal('fotosUploadModal'); if (m) m.hide(); bar.classList.remove('bg-success'); }, 800);
        });
      } else {
        label.textContent = (data && data.error) ? data.error : 'Error al subir.';
        bar.classList.add('bg-danger');
        document.getElementById('fotosUploadBtn').disabled = false;
      }
    };
    xhr.onerror = function () { label.textContent = 'Error de red.'; document.getElementById('fotosUploadBtn').disabled = false; };
    xhr.send(fd);
  }

  render();
})();
