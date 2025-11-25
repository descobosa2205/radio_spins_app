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