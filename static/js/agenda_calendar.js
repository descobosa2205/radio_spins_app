/* Calendario de agenda (Inicio + pestaña Agenda del artista).
   Renderiza un calendario visual de 2 semanas (lunes a domingo, hoy destacado) a partir de un blob
   JSON embebido. Dos modos:
     - mode="home"   -> arriba etiquetas de ARTISTA (foto+color) para activar/desactivar; a la
                        izquierda los TIPOS de actividad; a la derecha el calendario. Color por artista.
     - mode="artist" -> arriba etiquetas de TIPO de actividad (color); a la izquierda el LISTADO de
                        eventos (color por tipo); a la derecha el calendario. Color por tipo.
   Los lanzamientos se pintan con su portada. Hover = info; clic = navega al detalle. */
(function () {
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var DEFAULT_PHOTO = '/static/img/placeholder_photo.png';

  function parseISO(s) { var p = (s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mondayOf(d) { var x = new Date(d); var wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
  function sundayOf(d) { var x = mondayOf(d); x.setDate(x.getDate() + 6); return x; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return (s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---- Tooltip flotante único ----
  var tip = null;
  function ensureTip() {
    if (!tip) { tip = el('div', 'agenda-tip'); tip.style.display = 'none'; document.body.appendChild(tip); }
    return tip;
  }
  function showTip(act, x, y) {
    var t = ensureTip();
    var dt = parseISO(act.date);
    var when = DOW[(dt.getDay() + 6) % 7] + ' ' + dt.getDate() + ' ' + MONTHS[dt.getMonth()];
    var html = '<div class="agenda-tip__head"><i class="fa ' + esc(act.icon) + '"></i> ' + esc(act.kind_label) + '</div>';
    html += '<div class="agenda-tip__title">' + esc(act.title) + '</div>';
    if (act.artist_name) html += '<div class="agenda-tip__sub">' + esc(act.artist_name) + '</div>';
    if (act.subtitle) html += '<div class="agenda-tip__sub">' + esc(act.subtitle) + '</div>';
    html += '<div class="agenda-tip__meta">' + when;
    if (act.status_label) html += ' · <span class="agenda-status status-' + esc(act.status_class) + '">' + esc(act.status_label) + '</span>';
    html += '</div>';
    t.innerHTML = html;
    t.style.display = 'block';
    var r = t.getBoundingClientRect();
    var left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  function build(container) {
    var dataEl = container.querySelector('[data-agenda-json]');
    if (!dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
    var mode = container.getAttribute('data-mode') || 'home';
    var today = parseISO(data.today), start = parseISO(data.start), end = parseISO(data.end);
    var acts = data.activities || [];
    var artists = data.artists || [];
    var kinds = data.kinds || [];

    var activeArtists = {}; artists.forEach(function (a) { activeArtists[a.id] = true; });
    var activeKinds = {}; kinds.forEach(function (k) { activeKinds[k.key] = true; });

    function colorOf(a) {
      // Bloqueos y cumpleaños llevan su color de tipo siempre (gris / rosa); el resto por artista
      // en Inicio y por tipo en la ficha del artista.
      if (a.kind === 'bloqueo' || a.kind === 'cumple') return a.kind_color;
      return mode === 'home' ? a.artist_color : a.kind_color;
    }
    function passes(a) {
      if (!activeKinds[a.kind]) return false;
      if (mode === 'home' && artists.length) {
        var ids = a.artist_ids && a.artist_ids.length ? a.artist_ids : [a.artist_id];
        var ok = ids.some(function (id) { return activeArtists[id]; });
        if (!ok) return false;
      }
      return true;
    }

    container.innerHTML = '';

    // ---------- Barra superior de etiquetas ----------
    var top = el('div', 'agenda-top');
    if (mode === 'home') {
      if (!artists.length) top.appendChild(el('span', 'text-muted small', 'Sin artistas con actividades próximas.'));
      artists.forEach(function (a) {
        var chip = el('button', 'agenda-chip is-on');
        chip.type = 'button';
        chip.style.setProperty('--c', a.color);
        chip.innerHTML = '<span class="agenda-chip__dot"></span><img src="' + esc(a.photo_url || DEFAULT_PHOTO) + '" onerror="this.src=\'' + DEFAULT_PHOTO + '\'"><span>' + esc(a.name) + '</span>';
        chip.addEventListener('click', function () {
          activeArtists[a.id] = !activeArtists[a.id];
          chip.classList.toggle('is-on', activeArtists[a.id]);
          render();
        });
        top.appendChild(chip);
      });
    } else {
      kinds.forEach(function (k) {
        var chip = el('button', 'agenda-chip agenda-chip--kind is-on');
        chip.type = 'button';
        chip.style.setProperty('--c', k.color);
        chip.innerHTML = '<span class="agenda-chip__dot"></span><i class="fa ' + esc(k.icon) + '"></i><span>' + esc(k.label) + '</span>';
        chip.addEventListener('click', function () {
          activeKinds[k.key] = !activeKinds[k.key];
          chip.classList.toggle('is-on', activeKinds[k.key]);
          render();
        });
        top.appendChild(chip);
      });
    }
    container.appendChild(top);

    // ---------- Cuerpo: lateral + calendario ----------
    var bodyWrap = el('div', 'agenda-body');
    var side = el('div', 'agenda-side');
    var calWrap = el('div', 'agenda-cal');
    bodyWrap.appendChild(side);
    bodyWrap.appendChild(calWrap);
    container.appendChild(bodyWrap);

    // ---------- Calendario ----------
    // Inicio: ventana fija de 2 semanas. Agenda del artista: 4 semanas navegables por meses.
    var isArtist = (mode === 'artist');
    // En la agenda del artista se puede navegar también al pasado (hasta el inicio del rango cargado).
    var minStart = mondayOf(isArtist ? start : today);
    var maxStart = mondayOf(new Date(end.getTime() - 27 * 86400000));
    if (maxStart < minStart) maxStart = new Date(minStart);
    var winStart = mondayOf(today);
    if (winStart < minStart) winStart = new Date(minStart);
    if (winStart > maxStart) winStart = new Date(maxStart);

    function curWin() {
      if (!isArtist) return [mondayOf(today), sundayOf(end)];
      var s = new Date(winStart), e = new Date(winStart);
      e.setDate(e.getDate() + 27);
      return [s, e];
    }
    function addMonths(d, n) { var x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
    function shift(dir) {
      var d = mondayOf(addMonths(winStart, dir));
      if (d < minStart) d = new Date(minStart);
      if (d > maxStart) d = new Date(maxStart);
      winStart = d;
      render();
    }

    function makeChip(a) {
      // Bloqueos y notas no navegan: se pintan como <span>; el resto (eventos, cumpleaños) enlazan.
      var hasUrl = !!a.url;
      var chip = el(hasUrl ? 'a' : 'span', 'agenda-event' + (a.kind === 'bloqueo' ? ' agenda-event--block' : ''));
      if (hasUrl) chip.href = a.url; else chip.style.cursor = 'default';
      chip.style.setProperty('--c', colorOf(a));
      var inner = '';
      // En Inicio (multi-artista) se antepone la foto del artista para identificarlo de un vistazo.
      if (mode === 'home' && a.artist_photo) {
        inner += '<img class="agenda-event__avatar" src="' + esc(a.artist_photo) + '" alt="" onerror="this.style.display=\'none\'">';
      }
      if (a.kind === 'lanzamiento' && a.cover_url) {
        inner += '<img class="agenda-event__cover" src="' + esc(a.cover_url) + '" alt="">';
      } else {
        inner += '<i class="fa ' + esc(a.icon) + ' agenda-event__icon"></i>';
      }
      inner += '<span class="agenda-event__title">' + esc(a.title) + '</span>';
      if (a.status_class) inner += '<span class="agenda-event__dot status-' + esc(a.status_class) + '"></span>';
      chip.innerHTML = inner;
      chip.addEventListener('mouseenter', function (ev) { showTip(a, ev.clientX, ev.clientY); });
      chip.addEventListener('mousemove', function (ev) { showTip(a, ev.clientX, ev.clientY); });
      chip.addEventListener('mouseleave', hideTip);
      return chip;
    }

    function buildNav() {
      var win = curWin(), s = win[0], e = win[1];
      var nav = el('div', 'agenda-cal__nav');
      var label = s.getDate() + ' ' + MONTHS[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS[e.getMonth()] + ' ' + e.getFullYear();
      nav.appendChild(el('span', 'agenda-cal__range', label));
      var arrows = el('div', 'agenda-cal__arrows');
      var prev = el('button', 'agenda-nav-btn', '<i class="fa fa-chevron-left"></i>');
      var next = el('button', 'agenda-nav-btn', '<i class="fa fa-chevron-right"></i>');
      prev.type = 'button'; next.type = 'button';
      prev.setAttribute('aria-label', 'Mes anterior'); next.setAttribute('aria-label', 'Mes siguiente');
      prev.disabled = (winStart <= minStart); next.disabled = (winStart >= maxStart);
      prev.addEventListener('click', function () { shift(-1); });
      next.addEventListener('click', function () { shift(1); });
      arrows.appendChild(prev); arrows.appendChild(next);
      nav.appendChild(arrows);
      return nav;
    }

    function renderCal() {
      calWrap.innerHTML = '';
      if (isArtist) calWrap.appendChild(buildNav());
      var win = curWin(), gStart = win[0], gEnd = win[1];
      var head = el('div', 'agenda-cal__head');
      DOW.forEach(function (d) { head.appendChild(el('div', 'agenda-cal__dow', d)); });
      calWrap.appendChild(head);

      var byDate = {};
      acts.forEach(function (a) { if (passes(a)) { (byDate[a.date] = byDate[a.date] || []).push(a); } });

      var grid = el('div', 'agenda-cal__grid');
      var cur = new Date(gStart);
      while (cur <= gEnd) {
        var key = iso(cur);
        var cell = el('div', 'agenda-cal__day');
        if (cur < (isArtist ? start : today) || cur > end) cell.classList.add('is-out');
        if (key === data.today) cell.classList.add('is-today');
        var label = cur.getDate() + ' ' + MONTHS[cur.getMonth()];
        cell.appendChild(el('div', 'agenda-cal__num', label));
        var dayActs = byDate[key] || [];
        if (dayActs.some(function (a) { return a.kind === 'bloqueo'; })) cell.classList.add('is-blocked');
        var list = el('div', 'agenda-cal__events');
        dayActs.forEach(function (a) { list.appendChild(makeChip(a)); });
        cell.appendChild(list);
        grid.appendChild(cell);
        cur.setDate(cur.getDate() + 1);
      }
      calWrap.appendChild(grid);
    }

    // ---------- Lateral ----------
    function renderSide() {
      side.innerHTML = '';
      if (mode === 'home') {
        // Filtros por TIPO de actividad
        side.appendChild(el('div', 'agenda-side__title', 'Tipos'));
        if (!kinds.length) side.appendChild(el('div', 'text-muted small', 'Sin actividades.'));
        kinds.forEach(function (k) {
          // En Inicio el color codifica el ARTISTA, así que los filtros de tipo van neutros.
          var b = el('button', 'agenda-type agenda-type--plain is-on');
          b.type = 'button';
          b.innerHTML = '<i class="fa ' + esc(k.icon) + '"></i><span>' + esc(k.label) + '</span>';
          if (!activeKinds[k.key]) b.classList.remove('is-on');
          b.addEventListener('click', function () {
            activeKinds[k.key] = !activeKinds[k.key];
            b.classList.toggle('is-on', activeKinds[k.key]);
            renderCal();
          });
          side.appendChild(b);
        });
      } else {
        // Listado de eventos del artista (color por tipo), en sintonía con la ventana visible
        side.appendChild(el('div', 'agenda-side__title', 'Actividades'));
        var win = curWin(), ws = iso(win[0]), we = iso(win[1]);
        var visible = acts.filter(function (a) { return passes(a) && a.date >= ws && a.date <= we; });
        // Bloqueos/notas multi-día se expanden por día: en el listado se muestran una sola vez.
        var seenItem = {};
        visible = visible.filter(function (a) {
          if (!a.item_id) return true;
          if (seenItem[a.item_id]) return false;
          seenItem[a.item_id] = true; return true;
        });
        if (!visible.length) { side.appendChild(el('div', 'text-muted small', 'Sin actividades en este periodo.')); return; }
        visible.forEach(function (a) {
          var hasUrl = !!a.url;
          var row = el(hasUrl ? 'a' : 'div', 'agenda-listitem');
          if (hasUrl) row.href = a.url;
          row.style.setProperty('--c', colorOf(a));
          var dt = parseISO(a.date);
          var when = '<span class="agenda-listitem__date">' + dt.getDate() + ' ' + MONTHS[dt.getMonth()] + '</span>';
          var media = (a.kind === 'lanzamiento' && a.cover_url)
            ? '<img class="agenda-listitem__cover" src="' + esc(a.cover_url) + '" alt="">'
            : '<span class="agenda-listitem__icon"><i class="fa ' + esc(a.icon) + '"></i></span>';
          var st = a.status_label ? '<span class="agenda-status status-' + esc(a.status_class) + '">' + esc(a.status_label) + '</span>' : '';
          var del = a.item_id ? '<button type="button" class="agenda-listitem__del" title="Eliminar" data-del="' + esc(a.item_id) + '"><i class="fa fa-trash"></i></button>' : '';
          row.innerHTML = media + '<span class="agenda-listitem__body"><span class="agenda-listitem__title">' + esc(a.title) + '</span>' +
            '<span class="agenda-listitem__sub">' + when + (a.subtitle ? ' · ' + esc(a.subtitle) : '') + ' ' + st + '</span></span>' + del;
          row.addEventListener('mouseenter', function (ev) { showTip(a, ev.clientX, ev.clientY); });
          row.addEventListener('mouseleave', hideTip);
          var delBtn = row.querySelector('[data-del]');
          if (delBtn) delBtn.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            if (!window.confirm('¿Eliminar de la agenda?')) return;
            var fd = new FormData(); fd.append('next', location.pathname + location.search);
            fetch('/agenda/' + a.item_id + '/eliminar', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
              .then(function () { location.reload(); });
          });
          side.appendChild(row);
        });
      }
    }

    function render() { renderSide(); renderCal(); }
    render();
  }

  function init() { document.querySelectorAll('[data-agenda-calendar]').forEach(build); }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
