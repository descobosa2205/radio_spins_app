/* Reporte de ventas — filtrado y agrupado EN CLIENTE (estilo gestión de invitaciones).
 *
 * El servidor pinta todas las tarjetas (#salesList) ya en orden cronológico. Aquí:
 *  - Artistas/eventos: chips multi (todos activos por defecto; se desactivan al pulsar).
 *  - Tipo: selección única con "Todos".
 *  - Estado: Todos / Actualizado / Sin actualizar (selección única).
 *  - Búsqueda por texto.
 *  - Agrupar por artistas / por tipos (excluyentes); si no, lista plana cronológica.
 */
(function () {
  var list = document.getElementById('salesList');
  if (!list) return;

  var cards = Array.prototype.slice.call(list.querySelectorAll('[data-sales-card]'));
  var empty = document.getElementById('salesEmpty');
  var typeChips = document.getElementById('salesTypeChips');
  var stateChips = document.getElementById('salesStateChips');
  var artistChips = document.getElementById('salesArtistChips');
  var searchInput = document.getElementById('salesSearch');

  // Orden de los tipos = el orden en que aparecen los chips de tipo (salta el "Todos" = value vacío).
  var typeOrder = [];
  if (typeChips) {
    typeChips.querySelectorAll('[data-type-chip]').forEach(function (b) {
      var v = b.getAttribute('data-type-chip');
      if (v) typeOrder.push(v);
    });
  }

  var norm = function (v) {
    return (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  };

  // --- Estado de los filtros ---
  var activeArtists = null;   // Set de claves activas (null = todas)
  var typeSel = '';
  var stateSel = '';
  var query = '';
  var groupMode = null;       // null | 'artist' | 'type'

  function currentArtistSet() {
    if (!artistChips) return null;
    var s = new Set();
    artistChips.querySelectorAll('[data-artist-chip].active').forEach(function (b) {
      s.add(b.getAttribute('data-artist-chip'));
    });
    return s;
  }

  function cardVisible(card) {
    if (activeArtists && !activeArtists.has(card.getAttribute('data-artist'))) return false;
    if (typeSel && card.getAttribute('data-type') !== typeSel) return false;
    if (stateSel === 'updated' && card.getAttribute('data-updated') !== '1') return false;
    if (stateSel === 'pending' && card.getAttribute('data-updated') !== '0') return false;
    if (query && (card.getAttribute('data-search') || '').indexOf(query) === -1) return false;
    return true;
  }

  function clearGroupHeaders() {
    list.querySelectorAll('.sales-group-header').forEach(function (h) { h.remove(); });
  }

  function makeHeader(label, count) {
    var h = document.createElement('div');
    h.className = 'sales-group-header';
    h.innerHTML = '<span class="sales-group-header__t"></span> <span class="sales-group-header__n"></span>';
    h.querySelector('.sales-group-header__t').textContent = label;
    h.querySelector('.sales-group-header__n').textContent = '(' + count + ')';
    return h;
  }

  function apply() {
    activeArtists = currentArtistSet();
    var anyVisible = false;

    // 1) Visibilidad por tarjeta.
    cards.forEach(function (c) {
      var vis = cardVisible(c);
      c.style.display = vis ? '' : 'none';
      if (vis) anyVisible = true;
    });

    // 2) Orden / agrupado (reconstruye el DOM manteniendo las tarjetas).
    clearGroupHeaders();
    if (!groupMode) {
      // Lista plana: re-inserta en el orden original (el que vino del servidor).
      cards.forEach(function (c) { list.appendChild(c); });
    } else {
      var groups = new Map();  // key -> {label, cards[]}
      cards.forEach(function (c) {
        var key, label;
        if (groupMode === 'type') {
          key = c.getAttribute('data-type') || '—';
          label = c.getAttribute('data-type-label') || key;
        } else {
          key = c.getAttribute('data-artist') || '—';
          label = c.getAttribute('data-artist-name') || key;
        }
        if (!groups.has(key)) groups.set(key, { label: label, cards: [] });
        groups.get(key).cards.push(c);
      });

      var keys = Array.from(groups.keys());
      if (groupMode === 'type') {
        keys.sort(function (a, b) {
          var ia = typeOrder.indexOf(a), ib = typeOrder.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
      } else {
        keys.sort(function (a, b) {
          return norm(groups.get(a).label).localeCompare(norm(groups.get(b).label));
        });
      }

      keys.forEach(function (key) {
        var g = groups.get(key);
        var visibleCount = g.cards.filter(function (c) { return c.style.display !== 'none'; }).length;
        var header = makeHeader(g.label, visibleCount);
        if (!visibleCount) header.style.display = 'none';
        list.appendChild(header);
        g.cards.forEach(function (c) { list.appendChild(c); });
      });
    }

    if (empty) empty.classList.toggle('d-none', anyVisible);
  }

  // --- Chips de artista (multi-toggle) ---
  if (artistChips) {
    artistChips.querySelectorAll('[data-artist-chip]').forEach(function (b) {
      b.addEventListener('click', function () { b.classList.toggle('active'); apply(); });
    });
  }
  document.querySelectorAll('[data-artist-all]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var on = btn.getAttribute('data-artist-all') === 'on';
      if (artistChips) {
        artistChips.querySelectorAll('[data-artist-chip]').forEach(function (b) {
          b.classList.toggle('active', on);
        });
      }
      apply();
    });
  });

  // --- Selección única (tipo / estado) ---
  function wireSingle(container, cb) {
    if (!container) return;
    container.querySelectorAll('.sales-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        container.querySelectorAll('.sales-chip').forEach(function (o) { o.classList.remove('active'); });
        b.classList.add('active');
        cb(b);
        apply();
      });
    });
  }
  wireSingle(typeChips, function (b) { typeSel = b.getAttribute('data-type-chip') || ''; });
  wireSingle(stateChips, function (b) { stateSel = b.getAttribute('data-state-chip') || ''; });

  // --- Búsqueda ---
  if (searchInput) {
    searchInput.addEventListener('input', function () { query = norm(searchInput.value); apply(); });
  }

  // --- Agrupar (excluyente; volver a pulsar desagrupa) ---
  document.querySelectorAll('[data-group-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-group-mode');
      groupMode = (groupMode === mode) ? null : mode;
      document.querySelectorAll('[data-group-mode]').forEach(function (o) {
        var on = groupMode === o.getAttribute('data-group-mode');
        o.classList.toggle('btn-dark', on);
        o.classList.toggle('active', on);
        o.classList.toggle('btn-outline-secondary', !on);
      });
      apply();
    });
  });

  apply();
})();
