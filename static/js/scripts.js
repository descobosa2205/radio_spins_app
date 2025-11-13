let evoChart = null;

function toggleRowEdit(btn){
  const tr = btn.closest('tr');
  tr.querySelectorAll('input').forEach(i => i.disabled = !i.disabled);
}

function enableFormEdit(btn){
  const form = btn.closest('form');
  form.querySelectorAll('input').forEach(i => i.disabled = false);
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
  // Metadatos (título, imágenes)
  const metaResp = await fetch(`/api/song_meta?song_id=${songId}`);
  const meta = await metaResp.json();
  const title = meta.title || '';
  const cover = meta.cover_url || '';
  const artistPhoto = (meta.artists && meta.artists[0] && meta.artists[0].photo_url) || '';

  $('#chart-song-title').text(title);
  $('#chart-artist-photo').attr('src', artistPhoto || '/static/img/logo.png');
  $('#chart-cover').attr('src', cover || '/static/img/logo.png');

  // Serie temporal
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