/* ============================================================================================
   PROYECTOS DISCOGRÁFICOS · el motor de los POP-UPS por pasos.
   · `data-dp-when="campo=VALOR[,VALOR2]"` → el panel se ve solo con esa elección, y lo que se
     esconde se DESHABILITA (un campo oculto se envía igual, y un `required` invisible impide enviar).
   · `data-dp-mirror="campo"` → un oculto que ESPEJA el radio de las tarjetas, para que al servidor le
     llegue el valor con el nombre que espera.
   · `[data-dp-add-other]` → añade otra fila de «Otra» creatividad.
   ⚠️ Todo por DELEGACIÓN en el documento: estos pop-ups se pintan con la página, pero un `change` de
   Select2 o del ayudante de tarjetas puede llegar en cualquier momento.
   ============================================================================================ */
/* Paneles que dependen de una elección (`data-dp-when="campo=VALOR[,VALOR2]"`) + los ocultos que
   ESPEJAN el radio de las tarjetas (`data-dp-mirror="campo"`), para que al servidor le llegue el
   valor con el nombre que espera.
   ⚠️ Va por DELEGACIÓN en el documento: estos modales se pintan con la página, pero un `change` de
   Select2 o del ayudante de tarjetas puede llegar en cualquier momento. */
(function () {
  function valorDe(nombre, raiz) {
    var el = (raiz || document).querySelector('input[name="' + nombre + '"]:checked');
    return el ? (el.value || '') : '';
  }
  function sincroniza(raiz) {
    var ambito = raiz || document;
    ambito.querySelectorAll('[data-dp-mirror]').forEach(function (h) {
      var v = valorDe(h.dataset.dpMirror, h.closest('form') || document);
      if (v !== '') h.value = v;
    });
    ambito.querySelectorAll('[data-dp-when]').forEach(function (panel) {
      var partes = (panel.dataset.dpWhen || '').split('=');
      var nombre = (partes[0] || '').trim();
      var quiere = (partes[1] || '').split(',').map(function (x) { return x.trim(); });
      var actual = valorDe(nombre, panel.closest('form') || document);
      var visible = quiere.indexOf(actual) >= 0;
      panel.classList.toggle('d-none', !visible);
      // ⚠️ Un campo OCULTO se envía igual: se deshabilita para que no llegue al servidor (y un
      // `required` invisible no impida enviar el formulario).
      panel.querySelectorAll('input,select,textarea').forEach(function (i) { i.disabled = !visible; });
    });
  }
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.matches('input[type="radio"]')) sincroniza(document);
  });
  // «Añadir otra» creatividad: clona la fila vacía (se pueden añadir varias).
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest('[data-dp-add-other]');
    if (!btn) return;
    var zona = document.querySelector('[data-dp-others]');
    if (!zona || !zona.firstElementChild) return;
    var fila = zona.firstElementChild.cloneNode(true);
    fila.querySelectorAll('input').forEach(function (i) { i.value = ''; });
    zona.appendChild(fila);
  });
  /* ─────────────────────────────────────────────────────────────────────────────────────────
     EJEMPLOS ANTERIORES DE PITCH: se cargan al pinchar (no se traen en cada carga de la ficha) y
     se puede saltar de un artista a otro para coger ideas. Por delegación: el modal puede pintarse
     en cualquier momento.
     ───────────────────────────────────────────────────────────────────────────────────────── */
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pintaEjemplos(caja, datos, artistaActivo) {
    var zonaA = caja.querySelector('[data-pitch-artists]');
    var zonaR = caja.querySelector('[data-pitch-rows]');
    if (zonaA) {
      zonaA.classList.remove('d-none');
      zonaA.innerHTML = '<div class="d-flex flex-wrap gap-1">'
        + '<button type="button" class="btn btn-sm ' + (artistaActivo ? 'btn-outline-secondary' : 'btn-secondary')
        + '" data-pitch-artist="">Todos</button>'
        + (datos.artists || []).map(function (a) {
            var on = String(a.id) === String(artistaActivo || '');
            return '<button type="button" class="btn btn-sm ' + (on ? 'btn-secondary' : 'btn-outline-secondary')
              + '" data-pitch-artist="' + esc(a.id) + '">' + esc(a.name)
              + ' <span class="badge text-bg-light border ms-1">' + (a.count || 0) + '</span></button>';
          }).join('') + '</div>';
    }
    if (!zonaR) return;
    if (!(datos.rows || []).length) {
      zonaR.innerHTML = '<div class="alert alert-secondary small mb-0">Todavía no hay pitchs escritos.</div>';
      return;
    }
    zonaR.innerHTML = (datos.rows || []).map(function (r) {
      return '<div class="border rounded-3 p-2 mb-2 bg-white">'
        + '<div class="d-flex align-items-center gap-2">'
        + (r.cover_url ? '<img src="' + esc(r.cover_url) + '" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:8px;">' : '')
        + '<div class="min-w-0"><div class="fw-semibold small text-truncate">' + esc(r.title) + '</div>'
        + '<div class="small text-muted text-truncate">' + esc(r.artist_name)
        + (r.date_label ? ' · ' + esc(r.date_label) : '') + '</div></div></div>'
        + (r.pitch_title ? '<div class="small fw-semibold mt-2">' + esc(r.pitch_title) + '</div>' : '')
        + '<div class="small text-muted mt-1" style="white-space:pre-wrap;">' + esc(r.pitch_text) + '</div>'
        + '</div>';
    }).join('');
  }

  function cargaEjemplos(caja, artistaId) {
    var url = caja.getAttribute('data-url');
    if (!url) return;
    var zonaR = caja.querySelector('[data-pitch-rows]');
    if (zonaR) zonaR.innerHTML = '<div class="small text-muted">Cargando…</div>';
    fetch(url + (artistaId ? ('?artist_id=' + encodeURIComponent(artistaId)) : ''),
          {headers: {'X-Requested-With': 'XMLHttpRequest'}})
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error('nope');
        caja.setAttribute('data-artist-id', artistaId || '');
        pintaEjemplos(caja, d, artistaId);
      })
      .catch(function () {
        if (zonaR) zonaR.innerHTML = '<div class="alert alert-warning small mb-0">No se pudieron cargar los ejemplos.</div>';
      });
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest('[data-pitch-load]');
    if (btn) {
      var caja = btn.closest('[data-pitch-examples]');
      if (caja) {
        btn.classList.add('d-none');
        cargaEjemplos(caja, caja.getAttribute('data-artist-id') || '');
      }
      return;
    }
    var chip = ev.target && ev.target.closest('[data-pitch-artist]');
    if (chip) {
      var caja2 = chip.closest('[data-pitch-examples]');
      if (caja2) cargaEjemplos(caja2, chip.getAttribute('data-pitch-artist') || '');
    }
  });

  document.addEventListener('DOMContentLoaded', function () { sincroniza(document); });
  if (document.readyState !== 'loading') sincroniza(document);
  // Al abrir un modal se vuelve a sincronizar (por si se pintó oculto).
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('show.bs.modal', function () { setTimeout(function () { sincroniza(m); }, 0); });
  });
})();
