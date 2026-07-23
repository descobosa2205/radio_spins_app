/* Galería de Fotos/Vídeos (pestaña «Fotos» de conciertos y acciones).
   Render desde JSON embebido (#fotosData): modos de vista, selección, subida con progreso,
   detalle + notas, filtros, álbumes (crear/editar/eliminar/añadir), edición en bloque y
   reordenación por arrastre (sueltas y dentro de álbum). */
(function () {
  'use strict';
  var panel = document.getElementById('fotosPanel');
  if (!panel) return;

  var listUrl = panel.getAttribute('data-list-url');
  var uploadUrl = panel.getAttribute('data-upload-url');
  var reorderUrl = panel.getAttribute('data-reorder-url');
  var ownerBase = listUrl.replace(/\/list$/, '');   // /fotos/<tipo>/<id>
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
  var showDiscarded = false;   // "Ver descartadas": incluye las fotos ocultas
  var detailPhotoId = null;
  var bulkContext = { ids: [] };       // contexto de acciones en bloque / sobre álbum

  function csrfToken() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function bsModal(id) { var el = document.getElementById(id); return (el && window.bootstrap) ? bootstrap.Modal.getOrCreateInstance(el) : null; }
  function postJson(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().catch(function () { return {}; }); }); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('es-ES'); } catch (e) { return ''; } }
  function avatar(url) { return '<span class="fotos-avatar">' + (url ? '<img src="' + esc(url) + '" alt="">' : '<i class="fa fa-user"></i>') + '</span>'; }

  // =================================================== picker de fotógrafo
  function createPhotographerPicker(ids) {
    var search = document.getElementById(ids.search);
    var results = document.getElementById(ids.results);
    var chip = document.getElementById(ids.chip);
    var unknown = document.getElementById(ids.unknown);
    var hidden = document.getElementById(ids.hidden);
    var value = { unknown: false, id: null, name: '', logo_url: '' };
    var timer = null;

    function setValue(p) {
      if (p) {
        value = { unknown: false, id: p.id, name: p.name, logo_url: p.logo_url || '' };
        if (unknown) unknown.checked = false;
        chip.innerHTML = '<span class="fotos-chip">' + avatar(p.logo_url) + esc(p.name) + '</span>'
          + '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-2 fotos-ph-clear"><i class="fa fa-xmark"></i></button>';
        chip.classList.remove('d-none');
      } else {
        value = { unknown: !!(unknown && unknown.checked), id: null, name: '', logo_url: '' };
        chip.classList.add('d-none'); chip.innerHTML = '';
      }
    }
    if (chip) chip.addEventListener('click', function (e) { if (e.target.closest('.fotos-ph-clear')) setValue(null); });
    if (search) search.addEventListener('input', function () {
      clearTimeout(timer);
      var q = search.value.trim();
      if (q.length < 2) { results.classList.remove('show'); results.innerHTML = ''; return; }
      timer = setTimeout(function () {
        fetch('/api/search/promoters?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (rows) {
          var list = Array.isArray(rows) ? rows : (rows.results || rows.items || []);
          if (!list.length) { results.innerHTML = '<span class="dropdown-item-text text-muted small">Sin resultados</span>'; }
          else {
            results.innerHTML = list.slice(0, 12).map(function (r) {
              var name = r.label || r.text || r.nick || '';
              return '<a class="dropdown-item d-flex align-items-center gap-2" href="#" data-id="' + esc(r.id) + '" data-name="' + esc(name) + '" data-logo="' + esc(r.logo_url || '') + '">' + avatar(r.logo_url) + '<span class="text-truncate">' + esc(name) + '</span></a>';
            }).join('');
          }
          results.classList.add('show');
        });
      }, 250);
    });
    if (results) results.addEventListener('click', function (e) {
      var a = e.target.closest('[data-id]'); if (!a) return;
      e.preventDefault();
      setValue({ id: a.getAttribute('data-id'), name: a.getAttribute('data-name'), logo_url: a.getAttribute('data-logo') });
      results.classList.remove('show'); search.value = '';
    });
    if (unknown) unknown.addEventListener('change', function () {
      if (unknown.checked) setValue(null);
      value.unknown = unknown.checked;
      if (search) search.disabled = unknown.checked;
    });
    if (hidden) hidden.addEventListener('change', function () {
      var opt = hidden.options[hidden.selectedIndex];
      if (opt && opt.value) setValue({ id: opt.value, name: opt.textContent, logo_url: opt.getAttribute('data-photo') || '' });
    });
    return {
      value: function () { return value; },
      reset: function () { if (unknown) unknown.checked = false; if (search) { search.value = ''; search.disabled = false; } if (results) results.classList.remove('show'); setValue(null); }
    };
  }

  // =============================================================== render
  function passesFilter(p) { return !!filters[p.approval_state || 'NONE']; }

  function mediaHtml(p, cls) {
    if (p.is_video) return '<video src="' + esc(p.file_url) + '" class="' + cls + '" preload="metadata" muted></video><span class="fotos-tile__play"><i class="fa fa-play"></i></span>';
    return '<img src="' + esc(p.file_url) + '" class="' + cls + '" loading="lazy" alt="">';
  }
  function approvalBadge(p) {
    var st = p.approval_state || 'NONE';
    if (st === 'NONE') return '';
    var map = { APPROVED: ['fa-circle-check', 'bg-success', 'Aprobada'], REJECTED: ['fa-circle-xmark', 'bg-danger', 'Rechazada'], PENDING: ['fa-circle-question', 'bg-warning text-dark', 'Pendiente'] };
    var m = map[st] || map.PENDING;
    var summary = (p.approvers || []).map(function (a) {
      var d = a.decision === 'APPROVED' ? '✓' : (a.decision === 'REJECTED' ? '✗' : '?');
      return d + ' ' + a.name;
    }).join('\n');
    return '<span class="fotos-tile__badge badge ' + m[1] + '" title="' + esc(summary || m[2]) + '"><i class="fa ' + m[0] + '"></i></span>';
  }
  function tileHtml(p, draggable) {
    var selCls = selected[p.id] ? ' fotos-tile--selected' : '';
    var discBadge = p.discarded ? '<span class="fotos-tile__badge badge bg-secondary" style="left:6px;right:auto;" title="Descartada"><i class="fa fa-eye-slash"></i></span>' : '';
    return '<div class="fotos-tile' + selCls + (p.discarded ? ' fotos-tile--discarded' : '') + '" data-photo-id="' + esc(p.id) + '"' + (canEdit && draggable ? ' draggable="true"' : '') + '>'
      + '<label class="fotos-tile__check"><input type="checkbox" class="form-check-input fotos-check" data-id="' + esc(p.id) + '"' + (selected[p.id] ? ' checked' : '') + '></label>'
      + approvalBadge(p) + discBadge
      + '<div class="fotos-tile__frame">' + mediaHtml(p, 'fotos-tile__media') + '</div>'
      + '<div class="fotos-tile__title" title="' + esc(p.title) + '">' + esc(p.title || '—') + '</div>'
      + '</div>';
  }
  function albumHtml(a) {
    var items = (a.photos || []).filter(passesFilter).map(function (p) { return tileHtml(p, canEdit); }).join('');
    var menu = canEdit ? ('<div class="dropdown fotos-album__menu"><button class="btn btn-sm btn-light border" type="button" data-bs-toggle="dropdown"><i class="fa fa-ellipsis-vertical"></i></button>'
      + '<ul class="dropdown-menu dropdown-menu-end">'
      + '<li><a class="dropdown-item" href="#" data-album-action="approval" data-album-id="' + esc(a.id) + '"><i class="fa fa-thumbs-up fa-fw me-2"></i>Pedir aprobación</a></li>'
      + '<li><a class="dropdown-item" href="#" data-album-action="edit" data-album-id="' + esc(a.id) + '"><i class="fa fa-pen fa-fw me-2"></i>Editar álbum</a></li>'
      + '<li><a class="dropdown-item" href="#" data-album-action="bulkedit" data-album-id="' + esc(a.id) + '"><i class="fa fa-list-check fa-fw me-2"></i>Editar datos en bloque</a></li>'
      + '<li><a class="dropdown-item" href="#" data-album-action="download" data-album-id="' + esc(a.id) + '"><i class="fa fa-download fa-fw me-2"></i>Descargar</a></li>'
      + '<li><a class="dropdown-item" href="#" data-album-action="share" data-album-id="' + esc(a.id) + '"><i class="fa fa-share-nodes fa-fw me-2"></i>Compartir</a></li>'
      + '<li><hr class="dropdown-divider"></li>'
      + '<li><a class="dropdown-item text-danger" href="#" data-album-action="delete" data-album-id="' + esc(a.id) + '"><i class="fa fa-trash fa-fw me-2"></i>Eliminar</a></li>'
      + '</ul></div>') : '';
    return '<div class="fotos-album" data-album-id="' + esc(a.id) + '">'
      + '<div class="fotos-album__head">'
      + '<div class="fotos-album__cover">' + (a.cover_url ? '<img src="' + esc(a.cover_url) + '" alt="">' : '<i class="fa fa-images"></i>') + '</div>'
      + '<div class="fotos-album__meta"><div class="fotos-album__name">' + esc(a.name) + '</div><div class="small text-muted">(' + (a.count || 0) + ' foto' + (a.count === 1 ? '' : 's') + ')</div></div>'
      + menu + '</div>'
      + '<div class="fotos-album__items fotos-gallery fotos-' + viewMode + '" data-album-items="' + esc(a.id) + '">' + items + '</div>'
      + '</div>';
  }
  function render() {
    gallery.className = 'fotos-gallery fotos-' + viewMode;
    var html = '';
    (state.albums || []).forEach(function (a) { html += albumHtml(a); });
    var loose = (state.photos || []).filter(passesFilter);
    loose.forEach(function (p) { html += tileHtml(p, canEdit); });
    gallery.innerHTML = html;
    emptyEl.classList.toggle('d-none', !!(((state.albums || []).length) || loose.length));
    if (canEdit) {
      enableReorder(gallery, function (ids) { reorderLoose(ids); });
      gallery.querySelectorAll('[data-album-items]').forEach(function (c) {
        enableReorder(c, function (ids) { postJson(reorderUrl, { album_id: c.getAttribute('data-album-items'), order: ids }); });
      });
    }
    updateBulk();
    updateCounts();
    renderPendingAlert();
  }

  // Barra AMARILLA: contenido pendiente de aprobación (a quién se pidió, cuándo y su enlace).
  // Desaparece sola cuando todo está aprobado o rechazado.
  function renderPendingAlert() {
    var box = document.getElementById('fotosPendingAlert'); if (!box) return;
    var reqs = state.pending_approvals || [];
    if (!reqs.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="alert alert-warning py-2 px-3 d-flex flex-column gap-1 mb-2">'
      + reqs.map(function (r) {
        return '<div class="d-flex align-items-center gap-2 flex-wrap">'
          + '<i class="fa fa-hourglass-half"></i>'
          + '<span class="small">Hay <b>' + r.pending + '</b> contenido' + (r.pending === 1 ? '' : 's') + ' pendiente' + (r.pending === 1 ? '' : 's') + ' de aprobación, solicitado' + (r.pending === 1 ? '' : 's') + ' a <b>' + esc(r.approver) + '</b>' + (r.date ? ' el ' + esc(r.date) : '') + '</span>'
          + '<button type="button" class="btn btn-sm btn-outline-secondary py-0" data-copy-approval="' + esc(r.url) + '"><i class="fa fa-link me-1"></i>Copiar enlace</button>'
          + '</div>';
      }).join('')
      + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-approval]'); if (!b) return;
    var url = b.getAttribute('data-copy-approval');
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
      b.innerHTML = '<i class="fa fa-check me-1"></i>Copiado';
      setTimeout(function () { b.innerHTML = '<i class="fa fa-link me-1"></i>Copiar enlace'; }, 1600);
    }).catch(function () { window.prompt('Copia el enlace:', url); });
  });

  // Etiquetas "N fotos" / "M vídeos" (sobre TODAS las fotos, no las filtradas).
  function updateCounts() {
    var all = [];
    (state.albums || []).forEach(function (a) { (a.photos || []).forEach(function (p) { all.push(p); }); });
    (state.photos || []).forEach(function (p) { all.push(p); });
    var vids = all.filter(function (p) { return p.is_video; }).length;
    var imgs = all.length - vids;
    var pc = document.getElementById('fotosPhotoCount');
    var vc = document.getElementById('fotosVideoCount');
    if (pc) { pc.innerHTML = '<i class="fa fa-image me-1"></i>' + imgs + ' foto' + (imgs === 1 ? '' : 's'); pc.classList.toggle('d-none', imgs === 0); }
    if (vc) { vc.innerHTML = '<i class="fa fa-video me-1"></i>' + vids + ' vídeo' + (vids === 1 ? '' : 's'); vc.classList.toggle('d-none', vids === 0); }
  }

  // ============================================================ selección
  function allVisibleIds() {
    var ids = [];
    (state.albums || []).forEach(function (a) { (a.photos || []).forEach(function (p) { if (passesFilter(p)) ids.push(p.id); }); });
    (state.photos || []).forEach(function (p) { if (passesFilter(p)) ids.push(p.id); });
    return ids;
  }
  function updateBulk() {
    var n = Object.keys(selected).length;
    bulkBar.classList.toggle('d-none', n <= 1);
    bulkBar.classList.toggle('d-flex', n > 1);
    selCountEl.textContent = n + (n === 1 ? ' seleccionada' : ' seleccionadas');
    var vis = allVisibleIds();
    selectAll.checked = vis.length > 0 && vis.every(function (id) { return selected[id]; });
  }
  gallery.addEventListener('change', function (e) {
    var cb = e.target.closest('.fotos-check'); if (!cb) return;
    var id = cb.getAttribute('data-id');
    if (cb.checked) selected[id] = true; else delete selected[id];
    var tile = cb.closest('.fotos-tile'); if (tile) tile.classList.toggle('fotos-tile--selected', cb.checked);
    updateBulk();
  });
  selectAll.addEventListener('change', function () {
    if (selectAll.checked) allVisibleIds().forEach(function (id) { selected[id] = true; });
    else selected = {};
    render();
  });

  // ============================================================== detalle
  gallery.addEventListener('click', function (e) {
    if (e.target.closest('.fotos-tile__check') || e.target.closest('.fotos-album__menu')) return;
    var tile = e.target.closest('.fotos-tile'); if (!tile) return;
    openDetail(tile.getAttribute('data-photo-id'));
  });
  function openDetail(photoId) {
    detailPhotoId = photoId;
    var media = document.getElementById('fotosDetailMedia');
    var info = document.getElementById('fotosDetailInfo');
    media.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-spinner fa-spin"></i></div>';
    info.innerHTML = '';
    bsModal('fotosDetailModal').show();
    fetch('/fotos/photo/' + photoId).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { media.innerHTML = '<div class="alert alert-warning">No se pudo cargar.</div>'; return; }
      var p = d.photo;
      document.getElementById('fotosDetailTitle').textContent = p.title || 'Foto';
      media.innerHTML = p.is_video ? '<video src="' + esc(p.file_url) + '" class="fotos-detail-media__el" controls></video>' : '<img src="' + esc(p.file_url) + '" class="fotos-detail-media__el" alt="">';
      info.innerHTML = detailInfoHtml(p);
      renderNotes(p.notes || []);
      wireNoteForm();
      buildDetailActions(p);
    });
  }
  // Barra de acciones de la vista previa (descargar JPG/PNG, compartir, álbum, descartar, eliminar).
  function buildDetailActions(p) {
    var box = document.getElementById('fotosDetailActions'); if (!box) return;
    var id = esc(p.id);
    var html;
    if (p.is_video) {
      html = '<a class="btn btn-sm btn-outline-secondary" href="/fotos/photo/' + id + '/download?fmt=original"><i class="fa fa-download me-1"></i>Descargar</a>';
    } else {
      html = '<a class="btn btn-sm btn-outline-secondary" href="/fotos/photo/' + id + '/download?fmt=jpg"><i class="fa fa-download me-1"></i>JPG</a>'
        + '<a class="btn btn-sm btn-outline-secondary" href="/fotos/photo/' + id + '/download?fmt=png"><i class="fa fa-download me-1"></i>PNG</a>';
    }
    html += '<button type="button" class="btn btn-sm btn-outline-secondary" data-detail-act="share"><i class="fa fa-share-nodes me-1"></i>Compartir</button>'
      + '<button type="button" class="btn btn-sm btn-outline-secondary" data-detail-act="album"><i class="fa fa-layer-group me-1"></i>Álbum</button>';
    if (canEdit) {
      // Cambiar el ESTADO de aprobación a mano (aprobado / rechazado / volver a pendiente).
      html += '<div class="dropdown d-inline-block"><button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"><i class="fa fa-clipboard-check me-1"></i>Estado</button>'
        + '<ul class="dropdown-menu">'
        + '<li><button type="button" class="dropdown-item" data-detail-state="APPROVED"><i class="fa fa-circle-check text-success me-1"></i>Aprobado</button></li>'
        + '<li><button type="button" class="dropdown-item" data-detail-state="REJECTED"><i class="fa fa-circle-xmark text-danger me-1"></i>Rechazado</button></li>'
        + '<li><button type="button" class="dropdown-item" data-detail-state="PENDING"><i class="fa fa-circle-question text-warning me-1"></i>Pendiente de aprobación</button></li>'
        + '</ul></div>';
      html += p.discarded
        ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-detail-act="restore"><i class="fa fa-rotate-left me-1"></i>Restaurar</button>'
        : '<button type="button" class="btn btn-sm btn-outline-warning" data-detail-act="discard"><i class="fa fa-eye-slash me-1"></i>Descartar</button>';
      html += '<button type="button" class="btn btn-sm btn-outline-danger" data-detail-act="delete"><i class="fa fa-trash me-1"></i>Eliminar</button>';
    }
    box.innerHTML = html;
  }
  document.getElementById('fotosDetailActions').addEventListener('click', function (e) {
    var st = e.target.closest('[data-detail-state]');
    if (st && detailPhotoId) {
      postJson('/fotos/photo/' + detailPhotoId + '/estado-aprobacion', { state: st.getAttribute('data-detail-state') }).then(function (d) {
        if (d && d.ok) { refresh(); openDetail(detailPhotoId); }
        else alert((d && d.error) || 'No se pudo cambiar el estado.');
      });
      return;
    }
    var b = e.target.closest('[data-detail-act]'); if (!b) return;
    var act = b.getAttribute('data-detail-act');
    var id = detailPhotoId; if (!id) return;
    if (act === 'share') { openShare([id]); }          // se apila sobre la vista previa (modal_stack)
    else if (act === 'album') { openAddToAlbum([id]); }
    else if (act === 'discard' || act === 'restore') {
      postJson('/fotos/photo/' + id + '/discard', { discarded: (act === 'discard') }).then(function (d) {
        if (d && d.ok) { bsModal('fotosDetailModal').hide(); refresh(); }
      });
    } else if (act === 'delete') {
      if (!confirm('¿Eliminar este elemento? No se puede deshacer.')) return;
      fetch('/fotos/photo/' + id + '/delete', { method: 'POST' }).then(function () { bsModal('fotosDetailModal').hide(); selected = {}; refresh(); });
    }
  });
  function socialLinksHtml(sl) {
    if (!sl) return '';
    var icons = { instagram: 'fa-instagram', tiktok: 'fa-tiktok', twitter: 'fa-x-twitter', facebook: 'fa-facebook', youtube: 'fa-youtube' };
    var bases = { instagram: 'https://instagram.com/', tiktok: 'https://www.tiktok.com/@', twitter: 'https://x.com/', facebook: 'https://facebook.com/', youtube: 'https://youtube.com/' };
    var out = [];
    ['instagram', 'tiktok', 'twitter', 'facebook', 'youtube'].forEach(function (k) {
      var v = (sl[k] || '').toString().trim(); if (!v) return;
      var url = /^https?:\/\//i.test(v) ? v : ((bases[k] || '') + v.replace(/^@/, ''));
      out.push('<a class="fotos-social me-2" href="' + esc(url) + '" target="_blank" rel="noopener"><i class="fa-brands ' + icons[k] + ' me-1"></i>' + esc(v) + '</a>');
    });
    return out.join('');
  }
  function detailInfoHtml(p) {
    var rows = '';
    if (p.artist) rows += infoRow('Artista', '<span class="fotos-chip">' + avatar(p.artist.photo_url) + esc(p.artist.name) + '</span>');
    if (p.owner_title) rows += infoRow('Vinculada a', '<a href="' + esc(p.owner_url) + '"><i class="fa ' + (p.owner_type === 'CONCERT' ? 'fa-guitar' : 'fa-bullhorn') + ' me-1"></i>' + esc(p.owner_title) + '</a>');
    if (p.created_at) rows += infoRow('Subida', fmtDate(p.created_at));
    var photog = p.photographer_unknown ? '<span class="text-muted">Desconocido</span>' : (p.photographer ? '<span class="fotos-chip">' + avatar(p.photographer.logo_url) + esc(p.photographer.name) + '</span>' : '<span class="text-muted">Desconocido</span>');
    rows += infoRow('Fotógrafo', photog);
    if (p.photographer && !p.photographer_unknown) { var sh = socialLinksHtml(p.photographer.social_links); if (sh) rows += infoRow('Menciones', sh); }
    // Estado REAL de aprobación (antes salía siempre «Sin solicitud», aunque la hubiera).
    var apSt = (p.approval_state || 'NONE').toUpperCase();
    var apHtml;
    if (apSt === 'APPROVED') apHtml = '<span class="text-success"><i class="fa fa-circle-check me-1"></i>Aprobado</span>';
    else if (apSt === 'REJECTED') apHtml = '<span class="text-danger"><i class="fa fa-circle-xmark me-1"></i>Rechazado</span>';
    else if (apSt === 'PENDING') apHtml = '<span class="text-warning"><i class="fa fa-circle-question me-1"></i>Pendiente de aprobación</span>';
    else apHtml = '<span class="text-muted small">Sin solicitud de aprobación</span>';
    if ((p.approvers || []).length) {
      apHtml += ' <span class="text-muted small">· ' + p.approvers.map(function (a) {
        var ic = a.decision === 'APPROVED' ? '✓' : (a.decision === 'REJECTED' ? '✗' : '?');
        return ic + ' ' + esc(a.name || '');
      }).join(' · ') + '</span>';
    }
    rows += infoRow('Aprobación', apHtml);
    return '<table class="table table-sm fotos-detail-table mb-3"><tbody>' + rows + '</tbody></table>'
      + '<div class="fotos-notes"><div class="small text-muted mb-1">Notas</div><div id="fotosNotesList"></div>'
      + (canEdit ? '<div class="input-group input-group-sm mt-2"><input type="text" class="form-control" id="fotosNoteInput" placeholder="Añadir una nota…"><button class="btn btn-outline-secondary" id="fotosNoteAdd"><i class="fa fa-plus"></i></button></div>' : '')
      + '</div>';
  }
  function infoRow(k, v) { return '<tr><th class="text-muted fw-normal small" style="width:40%">' + esc(k) + '</th><td>' + v + '</td></tr>'; }
  function renderNotes(notes) {
    var box = document.getElementById('fotosNotesList'); if (!box) return;
    if (!notes.length) { box.innerHTML = '<div class="text-muted small fst-italic">Sin notas.</div>'; return; }
    box.innerHTML = notes.map(function (n) {
      return '<div class="fotos-note d-flex gap-2 align-items-start mb-1">' + avatar(n.author_photo)
        + '<div class="small"><span title="' + esc(fmtDate(n.created_at)) + '">' + esc(n.body) + '</span></div></div>';
    }).join('');
  }
  function wireNoteForm() {
    var btn = document.getElementById('fotosNoteAdd'); var inp = document.getElementById('fotosNoteInput');
    if (!btn || !inp) return;
    btn.addEventListener('click', function () {
      var body = inp.value.trim(); if (!body) return;
      btn.disabled = true;
      postJson('/fotos/photo/' + detailPhotoId + '/note', { body: body }).then(function (d) {
        btn.disabled = false; if (d.ok) { inp.value = ''; renderNotes(d.notes || []); }
      });
    });
  }

  // ========================================================= modos / filtros
  panel.querySelectorAll('[data-view-mode]').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-view-mode') === viewMode);
    btn.addEventListener('click', function () {
      viewMode = btn.getAttribute('data-view-mode'); localStorage.setItem('fotosViewMode', viewMode);
      panel.querySelectorAll('[data-view-mode]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      render();
    });
  });
  document.getElementById('fotosFilterBtn').addEventListener('click', function () { bsModal('fotosFilterModal').show(); });
  var applyBtn = document.getElementById('fotosFilterApply');
  if (applyBtn) applyBtn.addEventListener('click', function () {
    ['APPROVED', 'REJECTED', 'PENDING', 'NONE'].forEach(function (k) { var cb = document.querySelector('#fotosFilterModal input[value="' + k + '"]'); filters[k] = cb ? cb.checked : false; });
    render();
  });

  // =============================================================== reorder
  function enableReorder(container, persist) {
    var dragId = null;
    container.addEventListener('dragstart', function (e) {
      var tile = e.target.closest('.fotos-tile'); if (!tile || tile.parentElement !== container) return;
      dragId = true; tile.classList.add('fotos-tile--dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    container.addEventListener('dragover', function (e) {
      if (!dragId) return; e.preventDefault();
      var over = e.target.closest('.fotos-tile'); var dragged = container.querySelector('.fotos-tile--dragging');
      if (!over || !dragged || over === dragged || over.parentElement !== container) return;
      var rect = over.getBoundingClientRect();
      var after = (e.clientY - rect.top) > rect.height / 2 || (e.clientX - rect.left) > rect.width / 2;
      container.insertBefore(dragged, after ? over.nextSibling : over);
    });
    container.addEventListener('drop', function (e) { if (dragId) e.preventDefault(); });
    container.addEventListener('dragend', function () {
      var dragged = container.querySelector('.fotos-tile--dragging'); if (dragged) dragged.classList.remove('fotos-tile--dragging');
      if (dragId) {
        var ids = [].slice.call(container.children).filter(function (n) { return n.classList && n.classList.contains('fotos-tile'); }).map(function (t) { return t.getAttribute('data-photo-id'); });
        persist(ids);
      }
      dragId = null;
    });
  }
  function reorderLoose(ids) {
    var byId = {}; (state.photos || []).forEach(function (p) { byId[p.id] = p; });
    state.photos = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    postJson(reorderUrl, { order: ids });
  }

  // ================================================================ helpers datos
  function photoById(id) {
    var f = null;
    (state.photos || []).forEach(function (p) { if (p.id === id) f = p; });
    (state.albums || []).forEach(function (a) { (a.photos || []).forEach(function (p) { if (p.id === id) f = p; }); });
    return f;
  }
  function albumById(id) { var f = null; (state.albums || []).forEach(function (a) { if (a.id === id) f = a; }); return f; }
  function refresh() {
    var url = listUrl + (showDiscarded ? '?include_discarded=1' : '');
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) { if (d && d.ok) { state.albums = d.albums || []; state.photos = d.photos || []; render(); } });
  }
  var discardedBtn = document.getElementById('fotosDiscardedBtn');
  if (discardedBtn) discardedBtn.addEventListener('click', function () {
    showDiscarded = !showDiscarded;
    discardedBtn.classList.toggle('active', showDiscarded);
    discardedBtn.title = showDiscarded ? 'Ocultar descartadas' : 'Ver descartadas';
    refresh();
  });
  // ================================================================== bulk
  document.querySelectorAll('#fotosBulkBar [data-bulk]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var ids = Object.keys(selected); if (!ids.length) return;
      doBulk(a.getAttribute('data-bulk'), ids);
    });
  });
  function doBulk(action, ids) {
    bulkContext = { ids: ids };
    if (action === 'download') openDownload(ids);
    else if (action === 'delete') {
      if (!confirm('¿Eliminar ' + ids.length + ' elemento(s)? No se puede deshacer.')) return;
      Promise.all(ids.map(function (id) { return fetch('/fotos/photo/' + id + '/delete', { method: 'POST' }); })).then(function () { selected = {}; refresh(); });
    } else if (action === 'album') openAddToAlbum(ids);
    else if (action === 'edit') openBulkEdit(ids);
    else if (action === 'approval') openApproval(ids);
    else if (action === 'share') openShare(ids);
  }

  // -- añadir a álbum
  function openAddToAlbum(ids) {
    bulkContext = { ids: ids };
    var box = document.getElementById('fotosAlbumChoices');
    var albums = state.albums || [];
    box.innerHTML = albums.length ? albums.map(function (a) {
      return '<label class="d-flex align-items-center gap-2 py-1"><input type="radio" name="fotosAlbumPick" value="' + esc(a.id) + '">'
        + '<span class="fotos-album__cover" style="width:34px;height:34px;">' + (a.cover_url ? '<img src="' + esc(a.cover_url) + '" alt="">' : '<i class="fa fa-images"></i>') + '</span>'
        + '<span>' + esc(a.name) + ' <span class="text-muted small">(' + a.count + ')</span></span></label>';
    }).join('') : '<div class="text-muted small">Todavía no hay álbumes.</div>';
    document.getElementById('fotosNewAlbumName').value = '';
    bsModal('fotosAddToAlbumModal').show();
  }
  document.getElementById('fotosAddToAlbumSave').addEventListener('click', function () {
    var ids = bulkContext.ids || [];
    var newName = document.getElementById('fotosNewAlbumName').value.trim();
    var picked = document.querySelector('input[name="fotosAlbumPick"]:checked');
    var done = function () { bsModal('fotosAddToAlbumModal').hide(); selected = {}; refresh(); };
    if (newName) postJson(ownerBase + '/albumes/create', { name: newName, photo_ids: ids }).then(done);
    else if (picked) postJson('/fotos/album/' + picked.value + '/add', { photo_ids: ids }).then(done);
    else alert('Elige un álbum o escribe el nombre de uno nuevo.');
  });

  // -- editar en bloque
  var bulkPicker = createPhotographerPicker({ search: 'fotosBulkPhSearch', results: 'fotosBulkPhResults', chip: 'fotosBulkPhChip', unknown: 'fotosBulkPhUnknown', hidden: 'fotosBulkPhotographerSelect' });
  function openBulkEdit(ids) {
    bulkContext = { ids: ids };
    document.getElementById('fotosBulkCount').textContent = ids.length;
    document.getElementById('fotosBulkTitle').value = '';
    document.getElementById('fotosBulkDate').value = '';
    document.getElementById('fotosBulkNote').value = '';
    bulkPicker.reset();
    bsModal('fotosBulkEditModal').show();
  }
  document.getElementById('fotosBulkEditSave').addEventListener('click', function () {
    var ids = bulkContext.ids || []; if (!ids.length) return;
    var body = { photo_ids: ids };
    var title = document.getElementById('fotosBulkTitle').value.trim(); if (title) body.title_base = title;
    var date = document.getElementById('fotosBulkDate').value; if (date) body.taken_date = date;
    var note = document.getElementById('fotosBulkNote').value.trim(); if (note) body.note = note;
    var ph = bulkPicker.value();
    if (ph.unknown) body.photographer_unknown = true;
    else if (ph.id) body.photographer_promoter_id = ph.id;
    postJson(ownerBase + '/bulk-update', body).then(function () { bsModal('fotosBulkEditModal').hide(); selected = {}; refresh(); });
  });

  // ============================================================ acciones álbum
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-album-action]'); if (!a || !panel.contains(a)) return;
    e.preventDefault();
    var albumId = a.getAttribute('data-album-id');
    var action = a.getAttribute('data-album-action');
    var album = albumById(albumId); if (!album) return;
    var ids = (album.photos || []).map(function (p) { return p.id; });
    if (action === 'download') openDownload(ids);
    else if (action === 'bulkedit') openBulkEdit(ids);
    else if (action === 'approval') openApproval(ids);
    else if (action === 'share') openShare(ids);
    else if (action === 'edit') openEditAlbum(album);
    else if (action === 'delete') { document.getElementById('fotosDeleteAlbumId').value = albumId; bsModal('fotosDeleteAlbumModal').show(); }
  });
  function openEditAlbum(album) {
    document.getElementById('fotosEditAlbumId').value = album.id;
    document.getElementById('fotosEditAlbumName').value = album.name;
    var cover = document.getElementById('fotosEditAlbumCover');
    cover.innerHTML = (album.photos || []).map(function (p) {
      var sel = (p.id === album.cover_photo_id) ? ' fotos-cover-picker__opt--sel' : '';
      return '<span class="fotos-cover-picker__opt' + sel + '" data-cover-id="' + esc(p.id) + '"><img src="' + esc(p.file_url) + '" alt=""></span>';
    }).join('');
    cover.querySelectorAll('[data-cover-id]').forEach(function (opt) {
      opt.addEventListener('click', function () {
        cover.querySelectorAll('[data-cover-id]').forEach(function (o) { o.classList.remove('fotos-cover-picker__opt--sel'); });
        opt.classList.add('fotos-cover-picker__opt--sel');
      });
    });
    bsModal('fotosEditAlbumModal').show();
  }
  document.getElementById('fotosEditAlbumSave').addEventListener('click', function () {
    var id = document.getElementById('fotosEditAlbumId').value;
    var name = document.getElementById('fotosEditAlbumName').value.trim();
    var coverSel = document.querySelector('#fotosEditAlbumCover .fotos-cover-picker__opt--sel');
    var body = { name: name };
    if (coverSel) body.cover_photo_id = coverSel.getAttribute('data-cover-id');
    postJson('/fotos/album/' + id + '/update', body).then(function () { bsModal('fotosEditAlbumModal').hide(); refresh(); });
  });
  document.querySelectorAll('#fotosDeleteAlbumModal [data-album-delete-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = document.getElementById('fotosDeleteAlbumId').value;
      postJson('/fotos/album/' + id + '/delete', { mode: btn.getAttribute('data-album-delete-mode') }).then(function () { bsModal('fotosDeleteAlbumModal').hide(); refresh(); });
    });
  });

  // ============================================================ aprobación
  var approvalIds = [];
  function openApproval(ids) {
    approvalIds = ids;
    document.getElementById('fotosApprovalCount').textContent = ids.length;
    document.getElementById('fotosApprovalOthers').innerHTML = '';
    document.getElementById('fotosApprovalHint').textContent = '';
    // Reset de vistas (formulario visible, resultado oculto).
    document.getElementById('fotosApprovalForm').classList.remove('d-none');
    var resBox = document.getElementById('fotosApprovalResult');
    resBox.classList.add('d-none'); resBox.innerHTML = '';
    document.getElementById('fotosApprovalSubmit').classList.remove('d-none');
    document.getElementById('fotosApprovalDone').classList.add('d-none');
    var supIn = document.getElementById('fotosApprovalSupervision'); if (supIn) supIn.value = '';
    var sendChk = document.getElementById('fotosApprovalSendEmail'); if (sendChk) sendChk.checked = true;
    var list = document.getElementById('fotosApprovalList');
    list.innerHTML = '<div class="text-muted small"><i class="fa fa-spinner fa-spin"></i> Cargando…</div>';
    bsModal('fotosApprovalModal').show();
    fetch(ownerBase + '/approval-options').then(function (r) { return r.json(); }).then(function (o) {
      if (!o.ok) { list.innerHTML = '<div class="text-danger small">No se pudo cargar.</div>'; return; }
      var html = '';
      (o.artists || []).forEach(function (a) {
        var role = a.is_primary ? 'Artista' : 'Artista colaborador';
        html += approverRow({ kind: a.is_primary ? 'ARTIST' : 'COLLABORATOR', name: a.name, role: role, email: a.email, photo_url: a.photo_url });
        (a.members || []).forEach(function (m) {
          html += approverRow({ kind: 'ARTIST_MEMBER', name: m, role: 'Miembro de ' + a.name, email: '', photo_url: a.photo_url }, true);
        });
      });
      if (o.promoter) html += approverRow({ kind: 'PROMOTER', name: o.promoter.name, role: 'Promotor', email: o.promoter.email, photo_url: o.promoter.photo_url });
      if (o.show_responsible) html += approverRow({ kind: 'RESPONSIBLE', name: 'Responsable de aprobaciones', role: 'Responsable de aprobaciones', email: '', photo_url: '' });
      list.innerHTML = html || '<div class="text-muted small">No hay candidatos automáticos; añade personas abajo.</div>';
    });
  }
  function approverRow(a, isMember) {
    var data = " data-kind='" + esc(a.kind) + "' data-name='" + esc(a.name) + "' data-role='" + esc(a.role || '') + "' data-email='" + esc(a.email || '') + "' data-photo='" + esc(a.photo_url || '') + "'";
    return '<label class="d-flex align-items-center gap-2 py-1' + (isMember ? ' ms-4' : '') + '">'
      + '<input type="checkbox" class="form-check-input fotos-approver"' + data + '>'
      + avatar(a.photo_url) + '<span>' + esc(a.name) + ' <span class="text-muted small">· ' + esc(a.role || '') + '</span></span></label>';
  }
  document.getElementById('fotosApprovalAddOther').addEventListener('click', function () {
    var box = document.getElementById('fotosApprovalOthers');
    var row = document.createElement('div');
    row.className = 'row g-1 mb-1 fotos-other-row';
    row.innerHTML = '<div class="col-4"><input class="form-control form-control-sm fo-name" placeholder="Nombre"></div>'
      + '<div class="col-3"><input class="form-control form-control-sm fo-role" placeholder="Cargo"></div>'
      + '<div class="col-4"><input class="form-control form-control-sm fo-email" placeholder="Correo" type="email"></div>'
      + '<div class="col-1"><button type="button" class="btn btn-sm btn-link text-danger fo-rm"><i class="fa fa-xmark"></i></button></div>';
    box.appendChild(row);
    row.querySelector('.fo-rm').addEventListener('click', function () { row.remove(); });
  });
  function renderApprovalResult(d) {
    function copyBtn(url) { return '<button type="button" class="btn btn-outline-secondary fotos-copy" data-copy="' + esc(url) + '"><i class="fa fa-copy"></i></button>'; }
    var html = '<div class="alert alert-success py-2 small mb-3">Solicitud creada.'
      + (d.emailed ? ' ' + d.emailed + ' correo(s) de aprobación enviados.' : '')
      + (d.supervision_emailed ? ' ' + d.supervision_emailed + ' correo(s) de supervisión enviados.' : '')
      + '</div>';
    if ((d.approvers || []).length) {
      html += '<div class="fw-semibold small mb-1">Enlaces de aprobación <span class="text-muted fw-normal">(cópialos para enviarlos a mano)</span></div>';
      d.approvers.forEach(function (a) {
        html += '<div class="mb-2"><div class="small">' + esc(a.name) + (a.email ? ' · ' + esc(a.email) : '')
          + (a.emailed ? ' <span class="badge text-bg-success">enviado</span>' : ' <span class="badge text-bg-light border">sin enviar</span>') + '</div>'
          + '<div class="input-group input-group-sm"><input class="form-control" readonly value="' + esc(a.url) + '">' + copyBtn(a.url) + '</div></div>';
      });
    }
    if (d.supervision_url) {
      html += '<div class="fw-semibold small mb-1 mt-3">Enlace de supervisión <span class="text-muted fw-normal">(solo revisar, sin aprobar)</span></div>'
        + '<div class="input-group input-group-sm"><input class="form-control" readonly value="' + esc(d.supervision_url) + '">' + copyBtn(d.supervision_url) + '</div>';
    }
    var res = document.getElementById('fotosApprovalResult');
    res.innerHTML = html; res.classList.remove('d-none');
    document.getElementById('fotosApprovalForm').classList.add('d-none');
    document.getElementById('fotosApprovalSubmit').classList.add('d-none');
    document.getElementById('fotosApprovalDone').classList.remove('d-none');
    document.getElementById('fotosApprovalHint').textContent = '';
  }
  document.getElementById('fotosApprovalResult').addEventListener('click', function (e) {
    var b = e.target.closest('.fotos-copy'); if (!b) return;
    var url = b.getAttribute('data-copy');
    var done = function () { var old = b.innerHTML; b.innerHTML = '<i class="fa fa-check"></i>'; setTimeout(function () { b.innerHTML = old; }, 1000); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, done); }
    else { var i = b.closest('.input-group').querySelector('input'); if (i) { i.select(); try { document.execCommand('copy'); } catch (e2) {} } done(); }
  });
  document.getElementById('fotosApprovalDone').addEventListener('click', function () {
    bsModal('fotosApprovalModal').hide(); selected = {}; refresh();
  });
  document.getElementById('fotosApprovalSubmit').addEventListener('click', function () {
    var approvers = [];
    document.querySelectorAll('.fotos-approver:checked').forEach(function (cb) {
      approvers.push({ kind: cb.getAttribute('data-kind'), name: cb.getAttribute('data-name'), role: cb.getAttribute('data-role'), email: cb.getAttribute('data-email'), photo_url: cb.getAttribute('data-photo') });
    });
    document.querySelectorAll('#fotosApprovalOthers .fotos-other-row').forEach(function (row) {
      var name = row.querySelector('.fo-name').value.trim();
      if (name) approvers.push({ kind: 'CUSTOM', name: name, role: row.querySelector('.fo-role').value.trim(), email: row.querySelector('.fo-email').value.trim(), photo_url: '' });
    });
    var supEmails = (document.getElementById('fotosApprovalSupervision').value || '')
      .split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!approvers.length && !supEmails.length) { document.getElementById('fotosApprovalHint').textContent = 'Selecciona a quién pedir aprobación o indica un correo de supervisión.'; return; }
    var body = {
      photo_ids: approvalIds,
      send_email: document.getElementById('fotosApprovalSendEmail').checked,
      approvers: approvers,
      supervision_emails: supEmails
    };
    var btn = document.getElementById('fotosApprovalSubmit'); btn.disabled = true;
    postJson(ownerBase + '/approval/create', body).then(function (d) {
      btn.disabled = false;
      if (d.ok) { renderApprovalResult(d); }
      else document.getElementById('fotosApprovalHint').textContent = d.error || 'Error.';
    });
  });

  // ============================================================== descargar
  var downloadIdsCtx = [];
  function openDownload(ids) { downloadIdsCtx = ids; bsModal('fotosDownloadModal').show(); }
  document.querySelectorAll('#fotosDownloadModal [data-download-fmt]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fmt = btn.getAttribute('data-download-fmt');
      bsModal('fotosDownloadModal').hide();
      var ids = downloadIdsCtx;
      if (ids.length === 1) {
        var a = document.createElement('a'); a.href = '/fotos/photo/' + ids[0] + '/download?fmt=' + fmt;
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        // ZIP del servidor (fetch -> blob para conservar el nombre del archivo)
        fetch(ownerBase + '/zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_ids: ids, fmt: fmt }) })
          .then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
            if (!blob) return; var url = URL.createObjectURL(blob); var a = document.createElement('a');
            a.href = url; a.download = 'fotografias.zip'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          });
      }
    });
  });

  // ============================================================== compartir
  var shareIds = [];
  function openShare(ids) {
    shareIds = ids;
    document.getElementById('fotosShareEmail').classList.add('d-none');
    document.getElementById('fotosShareHint').textContent = '';
    bsModal('fotosShareModal').show();
  }
  document.querySelectorAll('#fotosShareModal [data-share-channel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var ch = btn.getAttribute('data-share-channel');
      if (ch === 'email') openShareEmail();
      else shareViaLink(ch);
    });
  });
  function shareViaLink(channel) {
    postJson(ownerBase + '/share/create', { photo_ids: shareIds }).then(function (d) {
      if (!d.ok) return;
      var msg = d.message || d.public_url;
      var url = (channel === 'whatsapp') ? ('https://wa.me/?text=' + encodeURIComponent(msg)) : ('sms:?&body=' + encodeURIComponent(msg));
      bsModal('fotosShareModal').hide();
      window.open(url, '_blank');
    });
  }
  function openShareEmail() {
    var box = document.getElementById('fotosShareEmail');
    box.classList.remove('d-none');
    document.getElementById('fotosShareSubject').value = 'Fotografías';
    var rec = document.getElementById('fotosShareRecipients');
    rec.innerHTML = '<span class="text-muted small">Cargando…</span>';
    fetch(ownerBase + '/emails').then(function (r) { return r.json(); }).then(function (d) {
      var emails = (d && d.emails) || [];
      rec.innerHTML = emails.length ? emails.map(function (e) {
        return '<label class="d-block small"><input type="checkbox" class="form-check-input me-1 fotos-share-rec" value="' + esc(e.email) + '" checked> ' + esc(e.label) + ' <span class="text-muted">(' + esc(e.email) + ')</span></label>';
      }).join('') : '<span class="text-muted small">Sin correos vinculados; añade abajo.</span>';
    });
    var sel = document.getElementById('fotosShareCompany');
    if (!sel.options.length) {
      fetch(ownerBase + '/approval-options').then(function (r) { return r.json(); }).then(function (o) {
        if (!o.ok) return;
        sel.innerHTML = '<option value="">—</option>' + (o.companies || []).map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === o.default_company_id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
        loadSharePreview();
      });
    }
    loadSharePreview();
  }
  // Vista previa EN VIVO del correo de materiales (misma estética que invitaciones).
  var sharePreviewTimer = null;
  function loadSharePreview() {
    var frame = document.getElementById('fotosSharePreview'); if (!frame) return;
    if (sharePreviewTimer) clearTimeout(sharePreviewTimer);
    sharePreviewTimer = setTimeout(function () {
      postJson(ownerBase + '/share/email/preview', {
        photo_ids: shareIds,
        note: (document.getElementById('fotosShareNote') || {}).value || '',
        brand_company_id: (document.getElementById('fotosShareCompany') || {}).value || null
      }).then(function (d) { if (d && d.ok) frame.srcdoc = d.html; }).catch(function () {});
    }, 400);
  }
  ['fotosShareNote', 'fotosShareCompany'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('input', loadSharePreview); el.addEventListener('change', loadSharePreview); }
  });
  document.getElementById('fotosShareSendEmail').addEventListener('click', function () {
    var recips = [];
    document.querySelectorAll('.fotos-share-rec:checked').forEach(function (cb) { recips.push(cb.value); });
    var extra = document.getElementById('fotosShareExtra').value.trim();
    if (extra) extra.split(',').forEach(function (e) { if (e.trim()) recips.push(e.trim()); });
    if (!recips.length) { document.getElementById('fotosShareHint').textContent = 'Indica al menos un destinatario.'; return; }
    var body = {
      photo_ids: shareIds, recipients: recips,
      subject: document.getElementById('fotosShareSubject').value.trim(),
      note: document.getElementById('fotosShareNote').value.trim(),
      brand_company_id: document.getElementById('fotosShareCompany').value || null
    };
    var btn = document.getElementById('fotosShareSendEmail'); btn.disabled = true;
    postJson(ownerBase + '/share/email', body).then(function (d) {
      btn.disabled = false;
      if (d.ok) { bsModal('fotosShareModal').hide(); }
      else document.getElementById('fotosShareHint').textContent = d.error || 'Error al enviar.';
    });
  });

  // ================================================================== subida
  var addBtn = document.getElementById('fotosAddBtn');
  var pending = [];
  var keySeq = 0;
  var uploadPicker = createPhotographerPicker({ search: 'fotosPhotographerSearch', results: 'fotosPhotographerResults', chip: 'fotosPhotographerChip', unknown: 'fotosPhotographerUnknown', hidden: 'fotosPhotographerSelect' });

  if (addBtn) addBtn.addEventListener('click', function () { resetUpload(); bsModal('fotosUploadModal').show(); });
  function resetUpload() {
    pending = []; uploadPicker.reset();
    document.getElementById('fotosProgress').classList.add('d-none');
    document.getElementById('fotosProgressBar').style.width = '0%';
    document.getElementById('fotosProgressBar').classList.remove('bg-success', 'bg-danger');
    document.getElementById('fotosUploadHint').textContent = '';
    renderFileList();
  }
  var dz = document.getElementById('fotosDropzone');
  var fileInput = document.getElementById('fotosFileInput');
  if (dz) {
    dz.addEventListener('click', function () { fileInput.click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('fotos-dropzone--over'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('fotos-dropzone--over'); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('fotos-dropzone--over'); addFiles(e.dataTransfer.files); });
  }
  if (fileInput) fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = ''; });
  function addFiles(fl) { [].slice.call(fl || []).forEach(function (f) { pending.push({ file: f, key: 'f' + (keySeq++) }); }); renderFileList(); }
  function renderFileList() {
    var box = document.getElementById('fotosFileList');
    box.innerHTML = pending.map(function (it) {
      var f = it.file; var isImg = /^image\//.test(f.type);
      var thumb = isImg ? '<img src="' + URL.createObjectURL(f) + '" alt="">' : '<i class="fa fa-film"></i>';
      return '<div class="fotos-fileitem" data-key="' + it.key + '"><span class="fotos-fileitem__thumb">' + thumb + '</span><span class="fotos-fileitem__name text-truncate">' + esc(f.name) + '</span><button type="button" class="btn btn-sm btn-link text-danger fotos-fileitem__rm" data-key="' + it.key + '"><i class="fa fa-xmark"></i></button></div>';
    }).join('');
    document.getElementById('fotosUploadBtn').disabled = !pending.length;
    document.getElementById('fotosUploadHint').textContent = pending.length ? (pending.length + ' archivo(s) listos') : '';
  }
  document.getElementById('fotosFileList').addEventListener('click', function (e) {
    var rm = e.target.closest('.fotos-fileitem__rm'); if (!rm) return;
    var key = rm.getAttribute('data-key'); pending = pending.filter(function (it) { return it.key !== key; }); renderFileList();
  });
  document.getElementById('fotosUploadBtn').addEventListener('click', function () { doUpload(); });
  function doUpload() {
    if (!pending.length) return;
    var fd = new FormData();
    pending.forEach(function (it) { fd.append('files', it.file); });
    var ph = uploadPicker.value();
    if (ph.unknown) fd.append('photographer_unknown', '1');
    else if (ph.id) fd.append('photographer_promoter_id', ph.id);
    var prog = document.getElementById('fotosProgress'), bar = document.getElementById('fotosProgressBar'), pct = document.getElementById('fotosProgressPct'), label = document.getElementById('fotosProgressLabel');
    prog.classList.remove('d-none'); document.getElementById('fotosUploadBtn').disabled = true;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('X-CSRFToken', csrfToken());
    xhr.upload.onprogress = function (e) { if (!e.lengthComputable) return; var p = Math.round(e.loaded * 100 / e.total); bar.style.width = p + '%'; pct.textContent = p + '%'; };
    xhr.onload = function () {
      var ok = xhr.status >= 200 && xhr.status < 300; var data = {}; try { data = JSON.parse(xhr.responseText); } catch (e) {}
      var hint = document.getElementById('fotosUploadHint');
      if (ok && data.ok) {
        var n = (data.created || []).length;
        var dups = data.duplicates || [];
        var errs = data.errors || [];
        var msgs = [];
        if (n) msgs.push(n + ' ' + (n === 1 ? 'archivo guardado' : 'archivos guardados') + '.');
        if (dups.length) {
          // Duplicados: NO se suben porque ya se habían subido antes (con su fecha).
          msgs.push('No se ' + (dups.length === 1 ? 'ha subido 1 contenido' : ('han subido ' + dups.length + ' contenidos')) +
            ' porque ya se ' + (dups.length === 1 ? 'había' : 'habían') + ' subido anteriormente: ' +
            dups.map(function (d) { return d.name + ' (el ' + (d.prev_date || 'sin fecha') + ')'; }).join(' · ') + '.');
        }
        if (errs.length) {
          msgs.push('Con ERROR: ' + errs.map(function (er) {
            if (typeof er === 'string') return er;
            return er.name + (er.reason ? ' — ' + er.reason : '');
          }).join(' · '));
        }
        label.textContent = msgs[0] || 'Nada que subir.';
        if (hint) hint.textContent = msgs.slice(1).join('  ');
        bar.classList.add(errs.length ? 'bg-danger' : 'bg-success');
        // Solo se cierra solo si TODO fue bien; con duplicados o errores se queda para leerlos.
        refresh().then(function () {
          if (!dups.length && !errs.length) {
            setTimeout(function () { var m = bsModal('fotosUploadModal'); if (m) m.hide(); }, 800);
          } else {
            pending = []; renderFileList();
            document.getElementById('fotosUploadBtn').disabled = false;
          }
        });
      } else {
        if (xhr.status === 413) label.textContent = 'El envío es demasiado grande para el servidor (los vídeos muy pesados hay que subirlos de uno en uno o reducirlos).';
        else label.textContent = (data && data.error) ? data.error : ('Error al subir (HTTP ' + xhr.status + ').');
        bar.classList.add('bg-danger'); document.getElementById('fotosUploadBtn').disabled = false;
      }
    };
    xhr.onerror = function () { label.textContent = 'Error de red (¿archivo demasiado grande o conexión cortada?).'; document.getElementById('fotosUploadBtn').disabled = false; };
    xhr.send(fd);
  }

  render();
})();
