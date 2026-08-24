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

    // FESTIVOS: {iso: {name, office}}. El día se marca en ROJO con el nombre de la festividad (igual
    // que en el calendario de vacaciones); los «no laborables» de la oficina, en morado.
    var holidays = {};
    (data.holidays || []).forEach(function (h) { if (h && h.day) holidays[h.day] = h; });

    var activeArtists = {}; artists.forEach(function (a) { activeArtists[a.id] = true; });
    var activeKinds = {}; kinds.forEach(function (k) { activeKinds[k.key] = true; });

    // Colores ESTABLES por artista al navegar en Inicio: el servidor colorea cada ventana por
    // separado (y el mismo artista podría cambiar de color entre ventanas), así que el cliente
    // fija el color la primera vez que ve a cada artista. Misma paleta que AGENDA_PALETTE (app.py).
    // ⚠️ Espejo de AGENDA_PALETTE (app.py): SIN el rojo ni el azul de la casa, que son de «Calendario
    // general» y «Mi calendario». Al acabarse se generan colores nuevos girando el tono con el ángulo
    // dorado, así dos calendarios nunca se quedan con el mismo (antes se repetían a partir del 13).
    var PALETTE = ['#198754', '#6f42c1', '#fd7e14', '#d63384', '#20c997', '#0d6efd',
                   '#b5179e', '#e07a5f', '#457b9d', '#9c6644', '#2a9d8f', '#7048e8',
                   '#3a86ff', '#8ac926', '#118ab2', '#f4a261', '#5f6caf', '#00897b'];
    var KIND_ORDER = ['concierto', 'festival', 'evento', 'lanzamiento', 'accion', 'medios', 'cumple', 'otro', 'bloqueo'];
    var artistColors = {};
    artists.forEach(function (a) { artistColors[a.id] = a.color; });
    function nuevoColor(n) {
      if (n < PALETTE.length) return PALETTE[n];
      var tono = (n * 137.508) % 360;                 // ángulo dorado: tonos bien repartidos
      [355, 193].forEach(function (res) {             // fuera de los tonos reservados de la casa
        if (Math.abs(((tono - res + 180) % 360) - 180) < 8) tono = (tono + 18) % 360;
      });
      return 'hsl(' + Math.round(tono) + ' 48% 42%)';
    }
    function colorFor(id) {
      if (!artistColors[id]) artistColors[id] = nuevoColor(Object.keys(artistColors).length);
      return artistColors[id];
    }

    function colorOf(a) {
      // Bloqueos y CUMPLEAÑOS llevan su color de tipo SIEMPRE (gris el bloqueo, y el cumpleaños el
      // rojo de la casa, el mismo del «Calendario general»); el resto, por artista en Inicio y por
      // tipo en la ficha del artista.
      if (a.kind === 'bloqueo' || a.kind === 'cumple') return a.kind_color;
      if (mode === 'home') return a.artist_id ? colorFor(a.artist_id) : (a.artist_color || '#6c757d');
      return a.kind_color;
    }
    /* LOS TIPOS QUE SE OFRECEN son solo los que TIENEN algo en lo que se está viendo: la ventana
       actual y los calendarios encendidos.
       ⚠️ Se ignora el propio filtro de tipos (si no, al apagar uno desaparecería su botón y no habría
       forma de volver a encenderlo) y NO se usa `kinds` a secas: esa lista ACUMULA los tipos de todas
       las ventanas que se han ido cargando con las flechas, así que enseñaría tipos que aquí no hay. */
    function kindsVisibles() {
      var win = curWin(), ws = iso(win[0]), we = iso(win[1]);
      var hay = {};
      acts.forEach(function (a) {
        if ((a.end_date || a.date) < ws || a.date > we) return;   // fuera de la ventana
        if (mode === 'home' && artists.length) {
          var ids = (a.artist_ids && a.artist_ids.length) ? a.artist_ids : [a.artist_id];
          if (!ids.some(function (id) { return activeArtists[id]; })) return;   // calendario apagado
        }
        hay[a.kind] = true;
      });
      return kinds.filter(function (k) { return hay[k.key]; });
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
    // Re-renderizable: al navegar en Inicio pueden aparecer artistas/tipos nuevos en la ventana.
    var top = el('div', 'agenda-top');
    container.appendChild(top);

    function renderTop() {
      top.innerHTML = '';
      if (mode === 'home') {
        if (!artists.length) top.appendChild(el('span', 'text-muted small', 'Sin artistas con actividades próximas.'));
        var separadorPuesto = false;
        artists.forEach(function (a) {
          // Los calendarios propios («Mi calendario» y «Calendario general») van primero y separados
          // del resto por una barra vertical.
          if (!a.special && !separadorPuesto && artists.some(function (x) { return x.special; })) {
            separadorPuesto = true;
            top.appendChild(el('span', 'agenda-chip-sep'));
          }
          var chip = el('button', 'agenda-chip' + (activeArtists[a.id] ? ' is-on' : ''));
          chip.type = 'button';
          chip.style.setProperty('--c', colorFor(a.id));
          // Sin onerror propio: el gestor global de scripts.js REINTENTA la foto antes de caer al
          // placeholder (el onerror antiguo la sustituía al primer fallo puntual y ya no volvía).
          chip.innerHTML = '<span class="agenda-chip__dot"></span><img src="' + esc(a.photo_url || DEFAULT_PHOTO) + '"><span>' + esc(a.name) + '</span>';
          chip.addEventListener('click', function () {
            activeArtists[a.id] = !activeArtists[a.id];
            chip.classList.toggle('is-on', activeArtists[a.id]);
            render();
          });
          top.appendChild(chip);
        });
      } else {
        var visibles = kindsVisibles();
        if (!visibles.length) top.appendChild(el('span', 'text-muted small', 'Sin actividades en este periodo.'));
        visibles.forEach(function (k) {
          var chip = el('button', 'agenda-chip agenda-chip--kind' + (activeKinds[k.key] ? ' is-on' : ''));
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
    }

    // ---------- Cuerpo: lateral + calendario ----------
    var bodyWrap = el('div', 'agenda-body');
    var side = el('div', 'agenda-side');
    var calWrap = el('div', 'agenda-cal');
    bodyWrap.appendChild(side);
    bodyWrap.appendChild(calWrap);
    container.appendChild(bodyWrap);

    // ---------- Calendario ----------
    // Inicio (3 semanas) y agenda del artista (4 semanas, por meses): navegables SIN límite
    // temporal — las ventanas fuera de lo cargado se piden bajo demanda a /agenda/inicio.json.
    var isArtist = (mode === 'artist');
    var HOME_STEP = 21; // días que salta cada flecha en Inicio (la ventana completa)
    var artistId = data.artist_id || '';            // ficha: con él se piden más ventanas al servidor
    var unlimited = !isArtist || !!artistId;        // sin artist_id (payload antiguo), se limita al rango cargado
    // Límites SOLO para el modo limitado (ficha sin artist_id).
    var minStart = mondayOf(isArtist ? start : today);
    var maxStart = mondayOf(new Date(end.getTime() - 27 * 86400000));
    if (maxStart < minStart) maxStart = new Date(minStart);
    var winStart = mondayOf(today);
    if (isArtist && !unlimited) {
      if (winStart < minStart) winStart = new Date(minStart);
      if (winStart > maxStart) winStart = new Date(maxStart);
    }

    function curWin() {
      var s = new Date(winStart), e = new Date(winStart);
      e.setDate(e.getDate() + (isArtist ? 27 : HOME_STEP - 1));
      return [s, e];
    }
    function addMonths(d, n) { var x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

    // Rango embebido en la página (ficha: ±6 meses; Inicio: la ventana inicial) y cobertura de los
    // `acts` actuales: los días fuera de la cobertura se dimean (solo puede pasar en la ficha).
    var baseActs = acts, baseStart = start, baseEnd = end;
    var dataStart = start, dataEnd = end;
    // Ventanas ya cargadas (clave = lunes ISO); se cachean para volver sin repetir peticiones.
    var winCache = {};
    if (!isArtist) winCache[iso(winStart)] = { activities: acts, artists: artists.slice(), kinds: kinds.slice() };
    var fetching = false;
    var arrastrando = null;      // el bloqueo/nota que se está arrastrando por el calendario

    function mergeLists(d) {
      // Artistas/tipos nuevos de la ventana entran ACTIVOS y con color estable del cliente.
      (d.artists || []).forEach(function (a) {
        if (!artists.some(function (x) { return x.id === a.id; })) {
          artists.push(a);
          if (activeArtists[a.id] === undefined) activeArtists[a.id] = true;
        }
        colorFor(a.id);
      });
      // ⚠️ Los propios («Mi calendario» y «Calendario general») se quedan SIEMPRE delante: si se
      // ordenara solo por nombre, al cargar otra ventana perderían su sitio.
      artists.sort(function (x, y) {
        var px = (x.id === 'mio' ? 0 : (x.id === 'oficina' ? 1 : 9));
        var py = (y.id === 'mio' ? 0 : (y.id === 'oficina' ? 1 : 9));
        if (px !== py) return px - py;
        return (x.name || '').toLowerCase().localeCompare((y.name || '').toLowerCase());
      });
      (d.holidays || []).forEach(function (h) { if (h && h.day) holidays[h.day] = h; });
      (d.kinds || []).forEach(function (k) {
        if (!kinds.some(function (x) { return x.key === k.key; })) {
          kinds.push(k);
          if (activeKinds[k.key] === undefined) activeKinds[k.key] = true;
        }
      });
      kinds.sort(function (x, y) { return KIND_ORDER.indexOf(x.key) - KIND_ORDER.indexOf(y.key); });
    }

    function applyWindow(d, ws, we) {
      acts = d.activities || [];
      dataStart = ws; dataEnd = we;
      mergeLists(d);
      render();
    }

    function loadWindow() {
      var win = curWin(), ws = win[0], we = win[1];
      // Ficha: si la ventana cae ENTERA dentro del rango embebido, se usa sin pedir nada.
      if (isArtist && ws >= baseStart && we <= baseEnd) {
        fetching = false; acts = baseActs; dataStart = baseStart; dataEnd = baseEnd; render(); return;
      }
      var key = iso(ws);
      if (winCache[key]) { fetching = false; applyWindow(winCache[key], ws, we); return; }
      fetching = true;
      render(); // ventana con "Cargando…" y flechas desactivadas mientras llega
      var url = '/agenda/inicio.json?start=' + key + '&end=' + iso(we) +
                (artistId ? '&artist_id=' + encodeURIComponent(artistId) : '');
      fetch(url, { noLoader: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(function (d) {
          winCache[key] = d;
          fetching = false;
          if (iso(winStart) === key) applyWindow(d, ws, we);
        })
        .catch(function () { fetching = false; render(); });
    }

    function shift(dir) {
      if (!isArtist) {
        var h = new Date(winStart); h.setDate(h.getDate() + dir * HOME_STEP);
        winStart = h;
        loadWindow();
        return;
      }
      var d = mondayOf(addMonths(winStart, dir));
      if (!unlimited) {
        if (d < minStart) d = new Date(minStart);
        if (d > maxStart) d = new Date(maxStart);
        winStart = d;
        render();
        return;
      }
      winStart = d;
      loadWindow();
    }
    function goToday() { winStart = mondayOf(today); loadWindow(); }

    /* ---- Notas («otro») y BLOQUEOS: se editan con doble clic y se arrastran para cambiar de fecha.
       Lo demás (conciertos, promociones, cumpleaños…) no: eso se cambia en su ficha. ---- */
    function esEditable(a) {
      return !!(a && a.item_id && (a.kind === 'otro' || a.kind === 'bloqueo'));
    }

    function preparaEditable(elem, a) {
      if (!esEditable(a)) return elem;
      elem.classList.add('agenda-event--editable');
      elem.setAttribute('data-agenda-item', a.item_id);
      elem.setAttribute('title', 'Doble clic para editarlo · arrástralo para cambiar la fecha');
      elem.draggable = true;
      elem.addEventListener('dragstart', function (ev) {
        arrastrando = a;
        try { ev.dataTransfer.setData('text/plain', a.item_id); } catch (e) {}
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        elem.classList.add('is-dragging');
      });
      elem.addEventListener('dragend', function () {
        arrastrando = null;
        elem.classList.remove('is-dragging');
        root.querySelectorAll('.agenda-cal__day.is-drop').forEach(function (c) { c.classList.remove('is-drop'); });
      });
      elem.addEventListener('dblclick', function (ev) {
        ev.preventDefault();
        abrirEdicion(a);
      });
      return elem;
    }

    function makeChip(a) {
      // Bloqueos y notas no navegan: se pintan como <span>; el resto (eventos, cumpleaños) enlazan.
      var hasUrl = !!a.url;
      var chip = el(hasUrl ? 'a' : 'span', 'agenda-event' + (a.kind === 'bloqueo' ? ' agenda-event--block' : ''));
      if (hasUrl) chip.href = a.url; else chip.style.cursor = 'default';
      chip.style.setProperty('--c', colorOf(a));
      var inner = '';
      // En Inicio (multi-artista) se anteponen las fotos de los artistas para identificarlos de un
      // vistazo. Si la actividad tiene VARIOS, se apilan (máx. 3 + «+N»).
      if (mode === 'home') {
        var photos = (a.artist_photos && a.artist_photos.length)
          ? a.artist_photos
          : (a.artist_photo ? [{ photo_url: a.artist_photo, name: a.artist_name || '' }] : []);
        if (photos.length) {
          var maxShow = 3;
          inner += '<span class="agenda-event__avatars">';
          photos.slice(0, maxShow).forEach(function (p) {
            inner += '<img class="agenda-event__avatar" src="' + esc(p.photo_url || DEFAULT_PHOTO) + '" alt="" title="' + esc(p.name || '') + '">';
          });
          if (photos.length > maxShow) inner += '<span class="agenda-event__avatar agenda-event__avatar--more">+' + (photos.length - maxShow) + '</span>';
          inner += '</span>';
        }
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
      return preparaEditable(chip, a);
    }

    // Barra CONTINUA de un evento multi-día dentro de una semana (bloqueo/nota). `seg` lleva
    // contL/contR = si el evento continúa antes/después de esta semana (corta el redondeo del borde).
    function makeBar(a, seg) {
      var hasUrl = !!a.url;
      var bar = el(hasUrl ? 'a' : 'span', 'agenda-event agenda-event--bar' + (a.kind === 'bloqueo' ? ' agenda-event--block' : ''));
      if (hasUrl) bar.href = a.url; else bar.style.cursor = 'default';
      if (seg.contL) bar.classList.add('is-cont-l');
      if (seg.contR) bar.classList.add('is-cont-r');
      bar.style.setProperty('--c', colorOf(a));
      var inner = '';
      if (mode === 'home') {
        var photos = (a.artist_photos && a.artist_photos.length)
          ? a.artist_photos
          : (a.artist_photo ? [{ photo_url: a.artist_photo, name: a.artist_name || '' }] : []);
        if (photos.length) {
          inner += '<span class="agenda-event__avatars">';
          photos.slice(0, 3).forEach(function (p) {
            inner += '<img class="agenda-event__avatar" src="' + esc(p.photo_url || DEFAULT_PHOTO) + '" alt="" title="' + esc(p.name || '') + '">';
          });
          if (photos.length > 3) inner += '<span class="agenda-event__avatar agenda-event__avatar--more">+' + (photos.length - 3) + '</span>';
          inner += '</span>';
        }
      }
      inner += '<i class="fa ' + esc(a.icon) + ' agenda-event__icon"></i>';
      inner += '<span class="agenda-event__title">' + esc(a.title) + '</span>';
      bar.innerHTML = inner;
      bar.addEventListener('mouseenter', function (ev) { showTip(a, ev.clientX, ev.clientY); });
      bar.addEventListener('mousemove', function (ev) { showTip(a, ev.clientX, ev.clientY); });
      bar.addEventListener('mouseleave', hideTip);
      return preparaEditable(bar, a);
    }

    function buildNav() {
      var win = curWin(), s = win[0], e = win[1];
      var nav = el('div', 'agenda-cal__nav');
      var label = s.getDate() + ' ' + MONTHS[s.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS[e.getMonth()] + ' ' + e.getFullYear();
      nav.appendChild(el('span', 'agenda-cal__range', label));
      var arrows = el('div', 'agenda-cal__arrows');
      if (iso(winStart) !== iso(mondayOf(today))) {
        var hoy = el('button', 'agenda-nav-btn agenda-nav-btn--today', 'Hoy');
        hoy.type = 'button';
        hoy.setAttribute('aria-label', 'Volver a la semana actual');
        hoy.addEventListener('click', goToday);
        arrows.appendChild(hoy);
      }
      var prev = el('button', 'agenda-nav-btn', '<i class="fa fa-chevron-left"></i>');
      var next = el('button', 'agenda-nav-btn', '<i class="fa fa-chevron-right"></i>');
      prev.type = 'button'; next.type = 'button';
      prev.setAttribute('aria-label', isArtist ? 'Mes anterior' : 'Semanas anteriores');
      next.setAttribute('aria-label', isArtist ? 'Mes siguiente' : 'Semanas siguientes');
      // SIN límite temporal (solo se bloquean mientras carga); único tope: ficha sin artist_id
      // (payload antiguo), que se queda dentro del rango cargado.
      prev.disabled = unlimited ? fetching : (winStart <= minStart);
      next.disabled = unlimited ? fetching : (winStart >= maxStart);
      prev.addEventListener('click', function () { shift(-1); });
      next.addEventListener('click', function () { shift(1); });
      arrows.appendChild(prev); arrows.appendChild(next);
      nav.appendChild(arrows);
      return nav;
    }

    function renderCal() {
      calWrap.innerHTML = '';
      calWrap.appendChild(buildNav());
      if (fetching) { calWrap.appendChild(el('div', 'text-muted small text-center py-4', 'Cargando agenda…')); return; }
      var win = curWin(), gStart = win[0], gEnd = win[1];
      var head = el('div', 'agenda-cal__head');
      DOW.forEach(function (d) { head.appendChild(el('div', 'agenda-cal__dow', d)); });
      calWrap.appendChild(head);

      function dowIndex(d) { return (d.getDay() + 6) % 7; }  // 0=Lun … 6=Dom

      // Single-day vs multi-día (franja continua). Un evento con end_date > date se pinta como barra.
      var byDate = {}, spans = [];
      acts.forEach(function (a) {
        if (!passes(a)) return;
        if (a.end_date && a.end_date > a.date) spans.push(a);
        else (byDate[a.date] = byDate[a.date] || []).push(a);
      });
      function isBlockedDay(key) {
        if ((byDate[key] || []).some(function (a) { return a.kind === 'bloqueo'; })) return true;
        return spans.some(function (s) { return s.kind === 'bloqueo' && key >= s.date && key <= s.end_date; });
      }

      var BAR_H = 18, BARS_TOP = 22;  // alto por carril y desfase bajo el número del día (ver CSS)
      var weeks = el('div', 'agenda-cal__weeks');
      var weekStart = new Date(gStart);
      while (weekStart <= gEnd) {
        var weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
        var wS = iso(weekStart), wE = iso(weekEnd);

        // Segmentos de franja que tocan esta semana, recortados a [lunes..domingo], con carril (lane).
        var segs = [];
        spans.forEach(function (a) {
          if (a.end_date < wS || a.date > wE) return;
          segs.push({
            a: a,
            c0: a.date > wS ? dowIndex(parseISO(a.date)) : 0,
            c1: a.end_date < wE ? dowIndex(parseISO(a.end_date)) : 6,
            contL: a.date < wS, contR: a.end_date > wE, lane: 0
          });
        });
        var lanes = [];
        segs.sort(function (x, y) { return x.c0 - y.c0 || (y.c1 - y.c0) - (x.c1 - x.c0); });
        segs.forEach(function (sg) {
          var li = 0;
          for (; li < lanes.length; li++) {
            var clash = lanes[li].some(function (o) { return !(sg.c1 < o.c0 || sg.c0 > o.c1); });
            if (!clash) break;
          }
          sg.lane = li; (lanes[li] = lanes[li] || []).push(sg);
        });
        var laneCount = lanes.length;

        var weekEl = el('div', 'agenda-cal__week');
        var daysRow = el('div', 'agenda-cal__grid');
        var cur = new Date(weekStart);
        for (var di = 0; di < 7; di++) {
          var key = iso(cur);
          var cell = el('div', 'agenda-cal__day');
          if (isArtist && (cur < dataStart || cur > dataEnd)) cell.classList.add('is-out');
          if (key === data.today) cell.classList.add('is-today');
          if (isBlockedDay(key)) cell.classList.add('is-blocked');
          var fest = holidays[key];
          if (fest) {
            cell.classList.add(fest.office ? 'is-nonworking' : 'is-holiday');
            cell.title = fest.name + (fest.scope_label ? ' · ' + fest.scope_label : '');
          }
          cell.appendChild(el('div', 'agenda-cal__num', cur.getDate() + ' ' + MONTHS[cur.getMonth()]));
          // El NOMBRE de la festividad, dentro del día: es lo que dice de qué festivo se trata.
          if (fest) cell.appendChild(el('div', 'agenda-cal__fest', fest.name));
          if (laneCount) { var sp = el('div', 'agenda-cal__spanspace'); sp.style.height = (laneCount * BAR_H) + 'px'; cell.appendChild(sp); }
          var list = el('div', 'agenda-cal__events');
          (byDate[key] || []).forEach(function (a) { list.appendChild(makeChip(a)); });
          cell.appendChild(list);
          // Soltar aquí un bloqueo o una nota = cambiarle la fecha (conservando su duración).
          cell.setAttribute('data-day', key);
          cell.addEventListener('dragover', function (ev) {
            if (!arrastrando) return;
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
            this.classList.add('is-drop');
          });
          cell.addEventListener('dragleave', function () { this.classList.remove('is-drop'); });
          cell.addEventListener('drop', function (ev) {
            ev.preventDefault();
            this.classList.remove('is-drop');
            if (!arrastrando) return;
            mueveItem(arrastrando, this.getAttribute('data-day'));
          });
          daysRow.appendChild(cell);
          cur.setDate(cur.getDate() + 1);
        }
        weekEl.appendChild(daysRow);

        if (segs.length) {
          // Capa de franjas: left/width en calc() teniendo en cuenta el gap del grid (7 columnas).
          var bars = el('div', 'agenda-cal__bars');
          segs.forEach(function (sg) {
            var span = sg.c1 - sg.c0 + 1;
            var bar = makeBar(sg.a, sg);
            bar.style.left = 'calc((var(--cw) + var(--g)) * ' + sg.c0 + ')';
            bar.style.width = 'calc(var(--cw) * ' + span + ' + var(--g) * ' + (span - 1) + ')';
            bar.style.top = (BARS_TOP + sg.lane * BAR_H) + 'px';
            bars.appendChild(bar);
          });
          weekEl.appendChild(bars);
        }
        weeks.appendChild(weekEl);
        weekStart.setDate(weekStart.getDate() + 7);
      }
      calWrap.appendChild(weeks);
    }

    // ---------- Lateral ----------
    function renderSide() {
      side.innerHTML = '';
      if (mode === 'home') {
        // Filtros por TIPO de actividad
        side.appendChild(el('div', 'agenda-side__title', 'Tipos'));
        var tipos = kindsVisibles();
        if (!tipos.length) side.appendChild(el('div', 'text-muted small', 'Sin actividades.'));
        tipos.forEach(function (k) {
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
        // Solape con la ventana (un evento la toca si empieza <= fin de ventana y su fin >= inicio):
        // así una franja multi-día que EMPIEZA antes de la ventana pero llega hasta ella sigue en la
        // lista (y su botón de eliminar accesible), no solo si su día de inicio cae dentro.
        var visible = acts.filter(function (a) { return passes(a) && (a.end_date || a.date) >= ws && a.date <= we; });
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

    /* ================= EDITAR, MOVER Y AVISAR (notas «otro» y bloqueos) =================
       · Doble clic → el pop-up de editar (con su botón de eliminar).
       · Arrastrar a otro día → cambia la fecha conservando la duración.
       En los dos casos, si la FECHA cambia se pregunta si se avisa al artista y a los implicados:
       cambiar una fecha y comunicarlo son dos cosas distintas, y la segunda se decide. */
    function cuerpoForm(obj) {
      var fd = new FormData();
      Object.keys(obj || {}).forEach(function (k) { fd.append(k, obj[k] == null ? '' : obj[k]); });
      fd.append('next', location.pathname + location.search);
      return fd;
    }

    function guardaItem(id, datos) {
      return fetch('/agenda/' + id + '/editar', {
        method: 'POST', body: cuerpoForm(datos),
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }).then(function (r) { return r.json(); });
    }

    // Se refleja en el calendario sin recargar: se cambian las fechas del ítem y se repinta.
    function aplicaEnPantalla(itemId, item) {
      acts.forEach(function (a) {
        if (a.item_id !== itemId) return;
        a.date = item.start_date;
        a.end_date = item.end_date;
        a.item_start = item.start_date;
        a.item_end = item.end_date;
        if (item.title) a.title = item.title;
      });
      renderCal(); renderSide();
    }

    function mueveItem(a, nuevoDia) {
      if (!a || !nuevoDia || nuevoDia === (a.item_start || a.date)) return;
      guardaItem(a.item_id, { mover: '1', start_date: nuevoDia }).then(function (d) {
        if (!d || !d.ok) { alert((d && d.error) || 'No se pudo cambiar la fecha.'); return; }
        aplicaEnPantalla(a.item_id, d.item);
        if (d.date_changed) preguntaAviso(a, d);
      }).catch(function () { alert('No se pudo cambiar la fecha.'); });
    }

    function modal(id) { return document.getElementById(id); }
    function abre(el2) {
      if (!el2) return;
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(el2).show();
    }
    function cierra(el2) {
      if (!el2 || !window.bootstrap) return;
      var m = bootstrap.Modal.getInstance(el2);
      if (m) m.hide();
    }

    function abrirEdicion(a) {
      var box = modal('agendaEditModal');
      if (!box) return;
      box.querySelector('[data-ae-id]').value = a.item_id;
      box.querySelector('[data-ae-kind]').textContent = (a.kind === 'bloqueo' ? 'Bloqueo' : 'Otro');
      box.querySelector('[data-ae-title]').value = a.title || '';
      box.querySelector('[data-ae-note]').value = (a.kind === 'otro' ? (a.note || a.subtitle || '') : '');
      box.querySelector('[data-ae-start]').value = a.item_start || a.date || '';
      box.querySelector('[data-ae-end]').value = a.item_end || a.end_date || a.date || '';
      var horas = box.querySelector('[data-ae-times]');
      if (horas) horas.classList.toggle('d-none', a.kind !== 'otro');
      var notaZona = box.querySelector('[data-ae-note-zone]');
      if (notaZona) notaZona.classList.toggle('d-none', a.kind !== 'otro');
      box.querySelector('[data-ae-start-time]').value = a.start_time || '';
      box.querySelector('[data-ae-end-time]').value = a.end_time || '';
      box._item = a;
      abre(box);
    }

    function preguntaAviso(a, respuesta) {
      var box = modal('agendaNotifyModal');
      if (!box) return;
      box.querySelector('[data-an-what]').textContent =
        (a.artist_name ? a.artist_name + ' · ' : '') + (a.title || '');
      box.querySelector('[data-an-change]').textContent = respuesta.change_label || '';
      box._url = respuesta.notify_url;
      box._label = respuesta.change_label || '';
      var res = box.querySelector('[data-an-result]');
      if (res) { res.classList.add('d-none'); res.textContent = ''; }
      abre(box);
    }

    // Los botones de los dos pop-ups (una sola vez por página).
    if (!document.body.dataset.agendaEditWired) {
      document.body.dataset.agendaEditWired = '1';
      document.addEventListener('click', function (ev) {
        var guardar = ev.target.closest('[data-ae-save]');
        if (guardar) {
          var box = modal('agendaEditModal');
          var a = box && box._item;
          if (!a) return;
          guardaItem(box.querySelector('[data-ae-id]').value, {
            title: box.querySelector('[data-ae-title]').value,
            note: box.querySelector('[data-ae-note]').value,
            start_date: box.querySelector('[data-ae-start]').value,
            end_date: box.querySelector('[data-ae-end]').value,
            start_time: box.querySelector('[data-ae-start-time]').value,
            end_time: box.querySelector('[data-ae-end-time]').value
          }).then(function (d) {
            if (!d || !d.ok) { alert((d && d.error) || 'No se pudo guardar.'); return; }
            cierra(box);
            aplicaEnPantalla(a.item_id, d.item);
            if (d.date_changed) preguntaAviso(a, d);
          }).catch(function () { alert('No se pudo guardar.'); });
          return;
        }
        var borrar = ev.target.closest('[data-ae-delete]');
        if (borrar) {
          var box2 = modal('agendaEditModal');
          var id = box2 && box2.querySelector('[data-ae-id]').value;
          if (!id) return;
          if (!window.confirm('¿Eliminar esto de la agenda?')) return;
          fetch('/agenda/' + id + '/eliminar', {
            method: 'POST', body: cuerpoForm({}), headers: { 'X-Requested-With': 'XMLHttpRequest' }
          }).then(function () { location.reload(); });
          return;
        }
        var avisar = ev.target.closest('[data-an-send]');
        if (avisar) {
          var box3 = modal('agendaNotifyModal');
          if (!box3 || !box3._url) return;
          avisar.disabled = true;
          fetch(box3._url, {
            method: 'POST', body: cuerpoForm({ label: box3._label }),
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
          }).then(function (r) { return r.json(); }).then(function (d) {
            avisar.disabled = false;
            var res = box3.querySelector('[data-an-result]');
            if (res) {
              res.className = 'alert ' + (d && d.ok ? 'alert-success' : 'alert-danger') + ' py-2 px-3 small mt-2';
              res.textContent = (d && d.ok) ? ('Avisado: ' + (d.detalle || '')) : ((d && d.error) || 'No se pudo avisar.');
              res.classList.remove('d-none');
            }
          }).catch(function () { avisar.disabled = false; });
        }
      });
    }

    function render() { renderTop(); renderSide(); renderCal(); }
    render();
  }

  function init() { document.querySelectorAll('[data-agenda-calendar]').forEach(build); }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
