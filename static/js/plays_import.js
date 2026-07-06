/* Importación de tocadas por Excel (pantalla "Actualizar tocadas").
   Paso 1: subir el .xlsx -> /tocadas/importar/analizar (detecta canción por ISRC y emisora por
   "channel", agrega tocadas por par). Paso 2: revisar/enlazar canciones y emisoras y aplicar a la
   semana en curso -> /tocadas/importar/aplicar. */
(function () {
  'use strict';
  var root = document.getElementById('playsImportRoot');
  if (!root) return;

  var analyzeUrl = root.getAttribute('data-analyze-url');
  var applyUrl = root.getAttribute('data-apply-url');
  var weekStart = root.getAttribute('data-week');

  var fileInput = document.getElementById('playsImportFile');
  var errBox = document.getElementById('playsImportError');
  var step1 = document.getElementById('playsImportStep1');
  var step2 = document.getElementById('playsImportStep2');
  var mismatchBox = document.getElementById('playsImportMismatch');
  var summaryBox = document.getElementById('playsImportSummary');
  var songsBody = document.getElementById('piSongsBody');
  var stationsBody = document.getElementById('piStationsBody');
  var songsCount = document.getElementById('piSongsCount');
  var stationsCount = document.getElementById('piStationsCount');
  var analyzeBtn = document.getElementById('playsImportAnalyzeBtn');
  var applyBtn = document.getElementById('playsImportApplyBtn');
  var applyInfo = document.getElementById('playsImportApplyInfo');

  var state = null;
  var songOptionsHtml = '';

  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function showError(msg) { errBox.textContent = msg; errBox.classList.remove('d-none'); }
  function clearError() { errBox.textContent = ''; errBox.classList.add('d-none'); }

  function reset() {
    state = null;
    step1.classList.remove('d-none');
    step2.classList.add('d-none');
    analyzeBtn.classList.remove('d-none');
    applyBtn.classList.add('d-none');
    applyInfo.classList.add('d-none');
    mismatchBox.classList.add('d-none');
    clearError();
    if (fileInput) fileInput.value = '';
  }
  // Reiniciar cada vez que se abre el modal.
  document.getElementById('playsImportModal').addEventListener('show.bs.modal', reset);

  function buildSongOptions(options) {
    var html = '<option value="">— No actualizar —</option>';
    for (var i = 0; i < options.length; i++) {
      html += '<option value="' + esc(options[i].id) + '">' + esc(options[i].label) + '</option>';
    }
    return html;
  }
  function buildStationOptions(stations) {
    var html = '<option value="">— No actualizar —</option>';
    for (var i = 0; i < stations.length; i++) {
      html += '<option value="' + esc(stations[i].id) + '">' + esc(stations[i].name) + '</option>';
    }
    return html;
  }

  function renderSongs() {
    songOptionsHtml = buildSongOptions(state.song_options || []);
    var html = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr>'
      + '<th>Estado</th><th>Canción (Excel)</th><th class="text-end">Tocadas</th><th>Vincular a la canción de la app</th></tr></thead><tbody>';
    (state.songs || []).forEach(function (s, idx) {
      var badge = s.matched
        ? '<span class="badge text-bg-success">Detectada</span>'
        : (s.ambiguous ? '<span class="badge text-bg-warning text-dark">ISRC ambiguo</span>' : '<span class="badge text-bg-secondary">Sin detectar</span>');
      var name = esc(s.track || '(sin título)') + (s.artist ? ' <span class="text-muted">· ' + esc(s.artist) + '</span>' : '');
      html += '<tr data-song-row data-isrc="' + esc(s.isrc) + '">'
        + '<td>' + badge + '</td>'
        + '<td>' + name + '<div class="small text-muted">ISRC: ' + esc(s.isrc) + '</div></td>'
        + '<td class="text-end fw-semibold">' + (s.spins || 0) + '</td>'
        + '<td><select class="form-select form-select-sm" data-song-select>' + songOptionsHtml + '</select></td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
    songsBody.innerHTML = html;
    // Preseleccionar el song_id detectado por fila.
    var rows = songsBody.querySelectorAll('[data-song-row]');
    (state.songs || []).forEach(function (s, idx) {
      var sel = rows[idx] ? rows[idx].querySelector('[data-song-select]') : null;
      if (sel && s.song_id) sel.value = s.song_id;
    });
    songsCount.textContent = (state.songs || []).length;
  }

  function renderStations() {
    var baseOpts = buildStationOptions(state.all_stations || []);
    var html = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr>'
      + '<th>Estado</th><th>Emisora (Excel)</th><th class="text-end">Tocadas</th><th>Enlazar con la emisora de la app</th></tr></thead><tbody>';
    (state.stations || []).forEach(function (st) {
      var badge = st.matched
        ? '<span class="badge text-bg-success">Enlazada</span>'
        : '<span class="badge text-bg-secondary">Sin enlazar</span>';
      var createOpt = '<option value="__create__">➕ Crear emisora «' + esc(st.channel) + '»</option>';
      html += '<tr data-station-row data-key="' + esc(st.channel_key) + '" data-channel="' + esc(st.channel) + '">'
        + '<td>' + badge + '</td>'
        + '<td>' + esc(st.channel) + '</td>'
        + '<td class="text-end fw-semibold">' + (st.spins || 0) + '</td>'
        + '<td><select class="form-select form-select-sm" data-station-select>' + baseOpts + createOpt + '</select></td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
    stationsBody.innerHTML = html;
    var rows = stationsBody.querySelectorAll('[data-station-row]');
    (state.stations || []).forEach(function (st, idx) {
      var sel = rows[idx] ? rows[idx].querySelector('[data-station-select]') : null;
      if (!sel) return;
      // Enlazadas: preseleccionadas. Sin enlazar: "— No actualizar —" (el usuario enlaza o crea a
      // conciencia, para no crear emisoras duplicadas por accidente).
      if (st.station_id) sel.value = st.station_id;
    });
    stationsCount.textContent = (state.stations || []).length;
  }

  function analyze() {
    clearError();
    if (!fileInput || !fileInput.files || !fileInput.files.length) { showError('Elige un archivo Excel.'); return; }
    var fd = new FormData();
    fd.append('file', fileInput.files[0]);
    fd.append('week_start', weekStart);
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Analizando…';
    fetch(analyzeUrl, { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) { showError((res.d && res.d.error) || 'No se pudo analizar el archivo.'); return; }
        state = res.d;
        document.getElementById('playsImportWeek').textContent = state.week_label || '';
        if (state.week_mismatch && state.detected_range) {
          mismatchBox.innerHTML = '<i class="fa fa-triangle-exclamation me-1"></i>El archivo cubre <strong>' + esc(state.detected_range)
            + '</strong>, pero se aplicará a la semana <strong>' + esc(state.week_label) + '</strong> (la que estás viendo). Cambia de semana si no es la correcta.';
          mismatchBox.classList.remove('d-none');
        } else if (state.detected_range) {
          summaryBox.innerHTML = 'Rango detectado en el archivo: <strong>' + esc(state.detected_range) + '</strong>.';
        }
        var c = state.counts || {};
        summaryBox.innerHTML = (summaryBox.innerHTML ? summaryBox.innerHTML + ' · ' : '')
          + (c.rows || 0) + ' tocadas · ' + (c.songs || 0) + ' canciones · ' + (c.stations || 0) + ' emisoras.';
        renderSongs();
        renderStations();
        step1.classList.add('d-none');
        step2.classList.remove('d-none');
        analyzeBtn.classList.add('d-none');
        applyBtn.classList.remove('d-none');
      })
      .catch(function () { showError('Error de red al analizar el archivo.'); })
      .finally(function () { analyzeBtn.disabled = false; analyzeBtn.innerHTML = '<i class="fa fa-magnifying-glass me-1"></i>Analizar'; });
  }

  function apply() {
    if (!state) return;
    var songs = [];
    songsBody.querySelectorAll('[data-song-row]').forEach(function (row) {
      var sel = row.querySelector('[data-song-select]');
      songs.push({ isrc: row.getAttribute('data-isrc'), song_id: (sel && sel.value) ? sel.value : null });
    });
    var stations = [];
    stationsBody.querySelectorAll('[data-station-row]').forEach(function (row) {
      var sel = row.querySelector('[data-station-select]');
      var val = sel ? sel.value : '';
      var entry = { channel_key: row.getAttribute('data-key'), channel: row.getAttribute('data-channel') };
      if (val === '__create__') { entry.create = true; entry.name = row.getAttribute('data-channel'); entry.station_id = null; }
      else if (val) { entry.station_id = val; }
      else { entry.discard = true; }
      stations.push(entry);
    });
    var payload = { week_start: state.week_start, songs: songs, stations: stations, cells: state.cells || [] };
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Aplicando…';
    fetch(applyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) { showError((res.d && res.d.error) || 'No se pudo aplicar la importación.'); step2.scrollIntoView(); return; }
        // Recargar para ver las tocadas actualizadas en la tabla.
        window.location.reload();
      })
      .catch(function () { showError('Error de red al aplicar la importación.'); })
      .finally(function () { applyBtn.disabled = false; applyBtn.innerHTML = '<i class="fa fa-check me-1"></i>Aplicar a la semana'; });
  }

  analyzeBtn.addEventListener('click', analyze);
  applyBtn.addEventListener('click', apply);
})();
