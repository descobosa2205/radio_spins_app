/* Filtros del listado de actividades (fotos/vídeos) — nivel 2 (sección Fotos/Vídeos y pestaña Fotos
   de la ficha de artista). Actúa sobre cada [data-media-rows-root]: construye los chips de TIPO de
   actividad (por icono, a partir de las filas) y filtra por tipo / fecha / búsqueda en el cliente.
   No hay filtro por artista (ya estamos dentro de un artista). */
(function () {
  'use strict';
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function initRoot(root) {
    if (root.getAttribute('data-media-rows-init') === '1') return;
    root.setAttribute('data-media-rows-init', '1');
    var listEl = root.querySelector('[data-media-rows]');
    var rows = [].slice.call(root.querySelectorAll('.media-row'));
    var chipsBox = root.querySelector('[data-media-typechips]');
    var fromEl = root.querySelector('[data-media-from]');
    var toEl = root.querySelector('[data-media-to]');
    var searchEl = root.querySelector('[data-media-search]');
    var emptyEl = root.querySelector('[data-media-rows-empty]');
    if (!listEl || !rows.length) return;

    var typeSel = '';   // '' = todos

    // Chips de tipo (con icono), en el orden en que aparecen; sin duplicados.
    if (chipsBox) {
      var seen = {}, chips = '<button type="button" class="fotos-chip active" data-type-filter="">'
        + '<i class="fa fa-layer-group me-1"></i>Todo</button>';
      rows.forEach(function (r) {
        var k = r.getAttribute('data-type-key') || '';
        if (!k || seen[k]) return;
        seen[k] = true;
        var label = r.getAttribute('data-type-label') || 'Otro';
        var icon = r.getAttribute('data-type-icon') || 'fa-images';
        chips += '<button type="button" class="fotos-chip" data-type-filter="' + esc(k) + '">'
          + '<i class="fa ' + esc(icon) + ' me-1"></i>' + esc(label) + '</button>';
      });
      chipsBox.innerHTML = chips;
      chipsBox.addEventListener('click', function (e) {
        var b = e.target.closest('[data-type-filter]'); if (!b) return;
        typeSel = b.getAttribute('data-type-filter') || '';
        chipsBox.querySelectorAll('[data-type-filter]').forEach(function (x) { x.classList.toggle('active', x === b); });
        apply();
      });
    }

    function apply() {
      var from = fromEl && fromEl.value ? fromEl.value : '';
      var to = toEl && toEl.value ? toEl.value : '';
      var q = searchEl && searchEl.value ? searchEl.value.toLowerCase().trim() : '';
      var any = false;
      rows.forEach(function (r) {
        var d = r.getAttribute('data-date') || '';
        var okType = !typeSel || (r.getAttribute('data-type-key') || '') === typeSel;
        var okDate = (!from || (d && d >= from)) && (!to || (d && d <= to));
        var okText = !q || (r.getAttribute('data-text') || '').indexOf(q) > -1;
        var show = okType && okDate && okText;
        r.classList.toggle('d-none', !show);
        if (show) any = true;
      });
      if (emptyEl) emptyEl.classList.toggle('d-none', any);
    }
    if (fromEl) fromEl.addEventListener('change', apply);
    if (toEl) toEl.addEventListener('change', apply);
    if (searchEl) searchEl.addEventListener('input', apply);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }

  ready(function () { document.querySelectorAll('[data-media-rows-root]').forEach(initRoot); });
})();
