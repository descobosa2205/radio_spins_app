let evoChart = null;

function enableFormEdit(btn){
  const form = btn.closest('form');
  form.querySelectorAll('input[type="number"]').forEach(i => i.disabled = false);
}

function initSelect2(){
  $('.select-artists').select2({
    width: '100%',
    templateResult: function (data) {
      if (!data.id) return data.text;
      const photo = $(data.element).data('photo');
      const img = photo ? `<img class="thumb" src="${photo}" />` : `<span class="me-2"><i class="fa fa-user-circle"></i></span>`;
      return $(`<span>${img}${data.text}</span>`);
    },
    templateSelection: function (data) {
      const photo = $(data.element).data('photo');
      const img = photo ? `<img class="thumb" src="${photo}" />` : `<span class="me-2"><i class="fa fa-user-circle"></i></span>`;
      return $(`<span>${img}${data.text}</span>`);
    },
    escapeMarkup: function (m) { return m; }
  });
}

function initArtistContractControls(){
  // Habilita / deshabilita la selección de "beneficio" según la base.
  document.querySelectorAll('.commitment-row').forEach((row) => {
    const baseSel = row.querySelector('.commitment-base');
    const profitSel = row.querySelector('.commitment-profit-scope');
    const wrap = row.querySelector('.profit-scope-wrap') || profitSel?.parentElement;
    if (!baseSel || !profitSel) return;
    // Si la fila viene en modo lectura (disabled), no hacemos nada.
    if (baseSel.disabled) return;

    const apply = () => {
      const isProfit = (baseSel.value || '').toUpperCase() === 'PROFIT';
      profitSel.disabled = !isProfit;
      if (wrap) {
        wrap.classList.toggle('opacity-50', !isProfit);
      }
    };

    baseSel.addEventListener('change', apply);
    apply();
  });

  // Formularios de "añadir fila" (no están dentro de .commitment-row)
  document.querySelectorAll('form .commitment-base').forEach((baseSel) => {
    const form = baseSel.closest('form');
    if (!form) return;
    const profitSel = form.querySelector('.commitment-profit-scope');
    const wrap = form.querySelector('.profit-scope-wrap') || profitSel?.parentElement;
    if (!profitSel) return;
    if (baseSel.disabled) return;
    const apply = () => {
      const isProfit = (baseSel.value || '').toUpperCase() === 'PROFIT';
      profitSel.disabled = !isProfit;
      if (wrap) wrap.classList.toggle('opacity-50', !isProfit);
    };
    baseSel.addEventListener('change', apply);
    apply();
  });
}

function initClickableRows(){
  document.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      const href = row.getAttribute('data-href');
      if (href) window.location.href = href;
    });
  });
}

function initSongLinkModal(){
  const modalEl = document.getElementById('songLinkModal');
  if (!modalEl || !window.bootstrap) return;

  const titleEl = modalEl.querySelector('#songLinkModalTitle') || modalEl.querySelector('.modal-title');
  const platformInput = modalEl.querySelector('#songLinkPlatform');
  const urlInput = modalEl.querySelector('#songLinkUrl');
  const modal = new bootstrap.Modal(modalEl);

  document.querySelectorAll('a.song-platform.disabled').forEach((a) => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const platform = (a.dataset.platform || '').trim();
      const label = (a.dataset.platformLabel || platform || 'enlace').trim();
      if (platformInput) platformInput.value = platform;
      if (titleEl) titleEl.textContent = `Añadir enlace: ${label}`;
      if (urlInput) urlInput.value = '';
      modal.show();
      setTimeout(() => { if (urlInput) urlInput.focus(); }, 180);
    });
  });
}

function initBootstrapTooltips(){
  if (!window.bootstrap) return;
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    try { new bootstrap.Tooltip(el); } catch (_) {}
  });
}

function initDynamicRows(){
  // Intérpretes
  const addInterpreterBtn = document.getElementById('addInterpreterRow');
  const interpretersContainer = document.getElementById('interpretersContainer');
  if (addInterpreterBtn && interpretersContainer){
    addInterpreterBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'row g-2 interpreter-row';
      row.innerHTML = `
        <div class="col-12 col-md-7">
          <input class="form-control" name="interpreter_name[]" placeholder="Nombre" required>
        </div>
        <div class="col-8 col-md-4">
          <select class="form-select" name="interpreter_is_main[]">
            <option value="1">Main artist</option>
            <option value="0" selected>Colaborador</option>
          </select>
        </div>
        <div class="col-4 col-md-1 d-grid">
          <button type="button" class="btn btn-outline-danger btn-sm remove-row"><i class="fa fa-times"></i></button>
        </div>
      `;
      interpretersContainer.appendChild(row);
    });
  }

  // Músicos
  const addMusicianBtn = document.getElementById('addMusicianRow');
  const musiciansContainer = document.getElementById('musiciansContainer');
  if (addMusicianBtn && musiciansContainer){
    addMusicianBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'row g-2 musician-row';
      row.innerHTML = `
        <div class="col-12 col-md-5">
          <input class="form-control" name="musician_instrument[]" placeholder="Instrumento">
        </div>
        <div class="col-8 col-md-6">
          <input class="form-control" name="musician_name[]" placeholder="Nombre">
        </div>
        <div class="col-4 col-md-1 d-grid">
          <button type="button" class="btn btn-outline-danger btn-sm remove-row"><i class="fa fa-times"></i></button>
        </div>
      `;
      musiciansContainer.appendChild(row);
    });
  }

  // Botón quitar (delegación)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-row');
    if (!btn) return;
    const row = btn.closest('.interpreter-row') || btn.closest('.musician-row');
    if (row) row.remove();
  });
}

function initIsrcModalControls(){
  const primarySel = document.getElementById('isrcPrimarySelect');
  const subWrap = document.getElementById('isrcSubproductWrap');
  const manualWrap = document.getElementById('isrcManualWrap');
  const modeManual = document.getElementById('modeManual');
  const modeGenerate = document.getElementById('modeGenerate');

  const apply = () => {
    if (subWrap && primarySel){
      subWrap.style.display = (primarySel.value === 'subproduct') ? '' : 'none';
    }
    const isManual = modeManual && modeManual.checked;
    if (manualWrap) manualWrap.style.display = isManual ? '' : 'none';
  };

  if (primarySel) primarySel.addEventListener('change', apply);
  if (modeManual) modeManual.addEventListener('change', apply);
  if (modeGenerate) modeGenerate.addEventListener('change', apply);
  apply();
}

function initSongOwnershipControls(){
  // Oculta / muestra el % de propiedad del master dependiendo de si la canción
  // es "Propia" o "Distribución".
  document.querySelectorAll('form').forEach((form) => {
    const radios = form.querySelectorAll('input[name="ownership_type"]');
    const wrap = form.querySelector('.master-ownership-wrap');
    if (!radios || radios.length === 0 || !wrap) return;

    const pctInput = wrap.querySelector('input[name="master_ownership_pct"]');

    const apply = () => {
      const dist = form.querySelector('input[name="ownership_type"][value="distribution"]');
      const isDist = !!(dist && dist.checked);
      wrap.style.display = isDist ? 'none' : '';
      if (pctInput) {
        pctInput.disabled = isDist;
        if (isDist) pctInput.value = pctInput.value || '0';
      }
    };

    radios.forEach((r) => r.addEventListener('change', apply));
    apply();
  });
}

async function openChart(songId, stationId){
  const metaResp = await fetch(`/api/song_meta?song_id=${songId}`);
  const meta = await metaResp.json();
  const title = meta.title || '';
  const cover = meta.cover_url || '';
  const artistPhoto = (meta.artists && meta.artists[0] && meta.artists[0].photo_url) || '';

  $('#chart-song-title').text(title);
  $('#chart-artist-photo').attr('src', artistPhoto || '/static/img/logo.png');
  $('#chart-cover').attr('src', cover || '/static/img/logo.png');

  const url = `/api/plays_json?song_id=${songId}` + (stationId ? `&station_id=${stationId}` : '');
  const r = await fetch(url);
  const js = await r.json();

  const ctx = document.getElementById('evoChart');
  if (evoChart) { evoChart.destroy(); }
  evoChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: js.labels,
      datasets: [{
        label: stationId ? 'Tocadas (emisora)' : 'Tocadas (total)',
        data: js.values,
        tension: 0.3
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  const modal = new bootstrap.Modal(document.getElementById('chartModal'));
  modal.show();
}

$(function(){
  initSelect2();
  initArtistContractControls();
  initClickableRows();
  initSongLinkModal();
  initBootstrapTooltips();
  initDynamicRows();
  initIsrcModalControls();
  initSongOwnershipControls();
});

async function openSalesChart(concertId){
  try {
    const modalEl = document.getElementById('chartModal');
    const canvas = document.getElementById('evoChart');
    if (!modalEl || !canvas) throw new Error("Falta el modal o el canvas del gráfico");

    // Destruir gráfico previo
    const existing = (window.Chart && Chart.getChart) ? Chart.getChart(canvas) : (window.evoChart || null);
    if (existing && existing.destroy) existing.destroy();

    // Metadatos para subtítulo
    const metaR = await fetch(`/api/concert_meta?concert_id=${concertId}`);
    const meta = metaR.ok ? await metaR.json() : {};
    document.getElementById('chart-modal-title').textContent = "Evolución ventas";
    const parts = [];
    if (meta.festival_name) parts.push(meta.festival_name);
    if (meta.venue && meta.venue.name) parts.push(meta.venue.name);
    const loc = [];
    if (meta.venue && meta.venue.municipality) loc.push(meta.venue.municipality);
    if (meta.venue && meta.venue.province) loc.push(meta.venue.province);
    if (loc.length) parts.push(loc.join(", "));
    if (meta.date) {
      const d = new Date(meta.date + "T00:00:00");
      parts.push(d.toLocaleDateString('es-ES'));
    }
    document.getElementById('chart-modal-subtitle').textContent = parts.join(" · ");

    // Serie
    const r = await fetch(`/api/sales_json?concert_id=${concertId}`);
    if (!r.ok) throw new Error("No se pudo leer la serie de ventas");
    const js = await r.json();

    const ctx = canvas.getContext('2d');
    window.evoChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: js.labels || [],
        datasets: [{ data: js.values || [], tension: 0.25 }]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false } }
      }
    });

    new bootstrap.Modal(modalEl).show();
  } catch (err) {
    console.error(err);
    alert("No se pudo abrir el gráfico: " + (err && err.message ? err.message : err));
  }
}