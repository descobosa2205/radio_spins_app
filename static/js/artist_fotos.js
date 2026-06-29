/* Pestaña «Fotos» de la ficha del artista: al pinchar un grupo (concierto/acción) abre un popup
   con su galería (álbumes + fotos, modos de vista, badges de aprobación) y el detalle de cada foto.
   Es de solo lectura/navegación; para editar/subir se usa el botón «Abrir en la ficha». */
(function () {
  'use strict';
  var groups = document.querySelectorAll('[data-fotos-group]');
  if (!groups.length) return;

  var modalEl = document.getElementById('artistFotosModal');
  var gallery = document.getElementById('artistFotosGallery');
  var titleEl = document.getElementById('artistFotosTitle');
  var openLink = document.getElementById('artistFotosOpen');
  var amode = 'grid3';

  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function bsModal(id) { var el = document.getElementById(id); return (el && window.bootstrap) ? bootstrap.Modal.getOrCreateInstance(el) : null; }
  function avatar(url) { return '<span class="fotos-avatar">' + (url ? '<img src="' + esc(url) + '" alt="">' : '<i class="fa fa-user"></i>') + '</span>'; }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('es-ES'); } catch (e) { return ''; } }

  function mediaHtml(p, cls) {
    if (p.is_video) return '<video src="' + esc(p.file_url) + '" class="' + cls + '" preload="metadata" muted></video><span class="fotos-tile__play"><i class="fa fa-play"></i></span>';
    return '<img src="' + esc(p.file_url) + '" class="' + cls + '" loading="lazy" alt="">';
  }
  function approvalBadge(p) {
    var st = p.approval_state || 'NONE';
    if (st === 'NONE') return '';
    var map = { APPROVED: ['fa-circle-check', 'bg-success', 'Aprobada'], REJECTED: ['fa-circle-xmark', 'bg-danger', 'Rechazada'], PENDING: ['fa-circle-question', 'bg-warning text-dark', 'Pendiente'] };
    var m = map[st] || map.PENDING;
    var summary = (p.approvers || []).map(function (a) { return (a.decision === 'APPROVED' ? '✓' : (a.decision === 'REJECTED' ? '✗' : '?')) + ' ' + a.name; }).join('\n');
    return '<span class="fotos-tile__badge badge ' + m[1] + '" title="' + esc(summary || m[2]) + '"><i class="fa ' + m[0] + '"></i></span>';
  }
  function tileHtml(p) {
    return '<div class="fotos-tile" data-photo-id="' + esc(p.id) + '">'
      + approvalBadge(p)
      + '<div class="fotos-tile__frame">' + mediaHtml(p, 'fotos-tile__media') + '</div>'
      + '<div class="fotos-tile__title" title="' + esc(p.title) + '">' + esc(p.title || '—') + '</div></div>';
  }
  function albumHtml(a) {
    var items = (a.photos || []).map(tileHtml).join('');
    return '<div class="fotos-album">'
      + '<div class="fotos-album__head"><div class="fotos-album__cover">' + (a.cover_url ? '<img src="' + esc(a.cover_url) + '" alt="">' : '<i class="fa fa-images"></i>') + '</div>'
      + '<div class="fotos-album__meta"><div class="fotos-album__name">' + esc(a.name) + '</div><div class="small text-muted">(' + (a.count || 0) + ' foto' + (a.count === 1 ? '' : 's') + ')</div></div></div>'
      + '<div class="fotos-album__items fotos-gallery fotos-' + amode + '">' + items + '</div></div>';
  }
  function renderGallery(data) {
    gallery.className = 'fotos-gallery fotos-' + amode;
    var html = '';
    (data.albums || []).forEach(function (a) { html += albumHtml(a); });
    (data.photos || []).forEach(function (p) { html += tileHtml(p); });
    gallery.innerHTML = html || '<div class="text-muted text-center py-4">Sin fotos.</div>';
  }

  var lastData = null;
  function load(ownerType, ownerId) {
    gallery.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-spinner fa-spin"></i></div>';
    fetch('/fotos/' + ownerType + '/' + ownerId + '/list').then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { gallery.innerHTML = '<div class="alert alert-warning">No se pudo cargar.</div>'; return; }
      lastData = d; renderGallery(d);
    });
  }

  groups.forEach(function (g) {
    g.addEventListener('click', function (e) {
      e.preventDefault();
      titleEl.textContent = g.getAttribute('data-owner-title') || 'Fotos';
      openLink.setAttribute('href', g.getAttribute('href'));
      bsModal('artistFotosModal').show();
      load(g.getAttribute('data-owner-type'), g.getAttribute('data-owner-id'));
    });
  });

  document.querySelectorAll('#artistFotosModal [data-amode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      amode = btn.getAttribute('data-amode');
      document.querySelectorAll('#artistFotosModal [data-amode]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      if (lastData) renderGallery(lastData);
    });
  });

  // Detalle de foto
  gallery.addEventListener('click', function (e) {
    var tile = e.target.closest('.fotos-tile'); if (!tile) return;
    openDetail(tile.getAttribute('data-photo-id'));
  });
  function openDetail(photoId) {
    var media = document.getElementById('artistFotoDetailMedia');
    var info = document.getElementById('artistFotoDetailInfo');
    media.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-spinner fa-spin"></i></div>'; info.innerHTML = '';
    bsModal('artistFotoDetailModal').show();
    fetch('/fotos/photo/' + photoId).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { media.innerHTML = '<div class="alert alert-warning">No se pudo cargar.</div>'; return; }
      var p = d.photo;
      document.getElementById('artistFotoDetailTitle').textContent = p.title || 'Foto';
      media.innerHTML = p.is_video ? '<video src="' + esc(p.file_url) + '" class="fotos-detail-media__el" controls></video>' : '<img src="' + esc(p.file_url) + '" class="fotos-detail-media__el" alt="">';
      info.innerHTML = detailInfoHtml(p);
    });
  }
  function row(k, v) { return '<tr><th class="text-muted fw-normal small" style="width:40%">' + esc(k) + '</th><td>' + v + '</td></tr>'; }
  function detailInfoHtml(p) {
    var h = '';
    if (p.artist) h += row('Artista', '<span class="fotos-chip">' + avatar(p.artist.photo_url) + esc(p.artist.name) + '</span>');
    if (p.owner_title) h += row('Vinculada a', '<a href="' + esc(p.owner_url) + '">' + esc(p.owner_title) + '</a>');
    if (p.created_at) h += row('Subida', fmtDate(p.created_at));
    var photog = p.photographer_unknown ? '<span class="text-muted">Desconocido</span>' : (p.photographer ? '<span class="fotos-chip">' + avatar(p.photographer.logo_url) + esc(p.photographer.name) + '</span>' : '<span class="text-muted">Desconocido</span>');
    h += row('Fotógrafo', photog);
    var appr = (p.approvers || []).length ? (p.approvers || []).map(function (a) {
      var d = a.decision === 'APPROVED' ? '<i class="fa fa-circle-check text-success"></i>' : (a.decision === 'REJECTED' ? '<i class="fa fa-circle-xmark text-danger"></i>' : '<i class="fa fa-circle-question text-warning"></i>');
      return '<div class="d-flex align-items-center gap-1 small">' + avatar(a.photo_url) + esc(a.name) + ' ' + d + '</div>';
    }).join('') : '<span class="text-muted small">Sin solicitud de aprobación</span>';
    h += row('Aprobación', appr);
    var notes = (p.notes || []).length ? (p.notes || []).map(function (n) { return '<div class="small" title="' + esc(fmtDate(n.created_at)) + '"><strong>' + esc(n.author || '') + ':</strong> ' + esc(n.body) + '</div>'; }).join('') : '<span class="text-muted small fst-italic">Sin notas.</span>';
    return '<table class="table table-sm fotos-detail-table mb-3"><tbody>' + h + '</tbody></table><div class="small text-muted mb-1">Notas</div>' + notes;
  }
})();
