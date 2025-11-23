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
    // meta
    const metaR = await fetch(`/api/concert_meta?concert_id=${concertId}`);
    if (!metaR.ok) throw new Error("No se pudo leer meta del concierto");
    const meta = await metaR.json();

    const titleParts = [];
    if (meta.artist && meta.artist.name) titleParts.push(meta.artist.name);
    if (meta.festival_name) titleParts.push(meta.festival_name);
    if (meta.date) titleParts.push(meta.date);
    const title = titleParts.join(" — ");

    $('#chart-song-title').text(title);
    $('#chart-artist-photo').attr('src', (meta.artist && meta.artist.photo_url) || '/static/img/logo.png');
    $('#chart-cover').attr('src', '/static/img/logo.png'); // no tenemos portada de concierto

    // serie de datos
    const r = await fetch(`/api/sales_json?concert_id=${concertId}`);
    if (!r.ok) throw new Error("No se pudo leer la serie de ventas");
    const js = await r.json();

    const modalEl = document.getElementById('chartModal');
    if (!modalEl) throw new Error("No existe el modal de gráficas (chartModal) en layout.html");

    const ctx = document.getElementById('evoChart');
    if (window.evoChart) { window.evoChart.destroy(); }
    window.evoChart = new Chart(ctx, {
      type: 'line',
      data: { labels: js.labels, datasets: [{ label: 'Acumulado', data: js.values, tension: 0.25 }] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } catch (err) {
    console.error(err);
    alert("No se pudo abrir el gráfico: " + (err.message || err));
  }
}