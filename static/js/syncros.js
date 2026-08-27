/* ============================================================================
   SYNCROS · añadir un supervisor (dos pantallas) e importar desde un fichero.

   ⚠️ Un supervisor ES un tercero: la primera pantalla BUSCA en la base de terceros (en vivo, con su
   foto) y solo crea uno nuevo si de verdad no está; la segunda son los campos propios de Syncro.
   ⚠️ Lo que hay que hacer al abrir un modal se hace EN EL CLIC, no en `shown.bs.modal`: con
   `modal_stack.js` por medio ese evento no siempre llega (regla de la casa).
   ============================================================================ */
(function () {
  var CFG = window.SYNCROS || {};
  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------------ AÑADIR */
  var modalNuevo = document.getElementById('supNewModal');
  if (modalNuevo) {
    var form = document.getElementById('supNewForm'),
        buscador = modalNuevo.querySelector('[data-sup-search]'),
        resultados = modalNuevo.querySelector('[data-sup-results]'),
        paso1 = modalNuevo.querySelector('[data-sup-step="1"]'),
        paso2 = modalNuevo.querySelector('[data-sup-step="2"]'),
        enviar = modalNuevo.querySelector('[data-sup-submit]'),
        campoPid = modalNuevo.querySelector('[data-sup-pid]'),
        campoNuevo = modalNuevo.querySelector('[data-sup-newname]'),
        bloqueContacto = modalNuevo.querySelector('[data-sup-contact]'),
        campoEmail = modalNuevo.querySelector('[data-sup-email]'),
        campoTel = modalNuevo.querySelector('[data-sup-phone]'),
        temporizador = null;

    function paso(n) {
      paso1.classList.toggle('d-none', n !== 1);
      paso2.classList.toggle('d-none', n !== 2);
      enviar.classList.toggle('d-none', n !== 2);
    }

    function elegir(fila) {
      campoPid.value = fila.id || '';
      campoNuevo.value = fila.id ? '' : (fila.name || '');
      modalNuevo.querySelector('[data-sup-chosen-name]').textContent = fila.name || '';
      modalNuevo.querySelector('[data-sup-chosen-photo]').src = fila.photo || '';
      var sub = [];
      if (fila.email) sub.push(fila.email);
      if (fila.phone) sub.push(fila.phone);
      if (!fila.id) sub.push('nuevo tercero');
      modalNuevo.querySelector('[data-sup-chosen-sub]').textContent = sub.join(' · ');
      // El email y el teléfono son del TERCERO: solo se piden si su ficha no los tiene.
      var faltan = !fila.email || !fila.phone;
      bloqueContacto.classList.toggle('d-none', !faltan);
      campoEmail.value = fila.email || '';
      campoTel.value = fila.phone || '';
      campoEmail.closest('.col-12').classList.toggle('d-none', !!fila.email);
      campoTel.closest('.col-12').classList.toggle('d-none', !!fila.phone);
      paso(2);
    }

    function pintar(filas, texto) {
      var html = (filas || []).map(function (r) {
        return '<button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2"' +
          ' data-sup-pick=\'' + esc(JSON.stringify(r)) + '\'' + (r.in_syncros ? ' disabled' : '') + '>' +
          '<img src="' + esc(r.photo) + '" alt="" data-avatar="1" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex:0 0 auto;">' +
          '<span class="min-w-0 text-start"><span class="d-block fw-semibold text-truncate">' + esc(r.name) + '</span>' +
          '<span class="d-block small text-muted text-truncate">' +
          esc([r.email, r.phone].filter(Boolean).join(' · ')) + '</span></span>' +
          (r.in_syncros ? '<span class="badge text-bg-secondary ms-auto">ya está en Syncros</span>' : '') +
          '</button>';
      }).join('');
      // La ÚLTIMA fila siempre ofrece crearlo con lo escrito (patrón del resto de la app).
      if ((texto || '').trim().length > 1) {
        html += '<button type="button" class="list-group-item list-group-item-action text-primary"' +
          ' data-sup-pick=\'' + esc(JSON.stringify({ id: '', name: texto.trim() })) + '\'>' +
          '<i class="fa fa-plus me-1"></i>Crear «' + esc(texto.trim()) + '» como tercero nuevo</button>';
      }
      resultados.innerHTML = html ? '<div class="list-group">' + html + '</div>' : '';
    }

    function buscar() {
      var q = (buscador.value || '').trim();
      if (!CFG.buscar) return;
      fetch(CFG.buscar + '?q=' + encodeURIComponent(q), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) { pintar((j && j.results) || [], q); })
        .catch(function () { pintar([], q); });
    }

    buscador.addEventListener('input', function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(buscar, 180);   // en vivo, sin una petición por tecla
    });
    resultados.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sup-pick]');
      if (!b || b.disabled) return;
      try { elegir(JSON.parse(b.getAttribute('data-sup-pick'))); } catch (err) { }
    });
    modalNuevo.querySelector('[data-sup-back]').addEventListener('click', function () { paso(1); });

    // El país solo se pide si la región ES un país (y si no, el campo se deshabilita: un campo
    // oculto se envía igual).
    var zonaPais = modalNuevo.querySelector('[data-sup-country]');
    function pintaPais() {
      var marcado = modalNuevo.querySelector('[data-sup-region]:checked');
      var esPais = marcado && marcado.value === 'COUNTRY';
      zonaPais.classList.toggle('d-none', !esPais);
      var input = zonaPais.querySelector('input');
      if (input) input.disabled = !esPais;
    }
    modalNuevo.querySelectorAll('[data-sup-region]').forEach(function (r) {
      r.addEventListener('change', pintaPais);
    });
    pintaPais();

    // Al abrirlo se limpia y se vuelve al paso 1 (EN EL CLIC del botón que lo abre).
    document.querySelectorAll('[data-bs-target="#supNewModal"]').forEach(function (b) {
      b.addEventListener('click', function () {
        form.reset();
        campoPid.value = ''; campoNuevo.value = '';
        resultados.innerHTML = ''; buscador.value = '';
        pintaPais(); paso(1);
        setTimeout(function () { buscador.focus(); buscar(); }, 250);
      });
    });
  }

  /* --------------------------------------------------------------- IMPORTAR */
  var modalImp = document.getElementById('supImportModal');
  if (!modalImp) return;
  var estado = { rows: [], columns: [], fields: [] };
  var zona = modalImp.querySelector('[data-si-drop]'),
      input = document.getElementById('supImportFile'),
      msg = modalImp.querySelector('[data-si-msg]'),
      cuerpo = modalImp.querySelector('[data-si-cols]'),
      btnAplicar = modalImp.querySelector('[data-si-apply]');

  function pasoImp(n) {
    [1, 2, 3].forEach(function (i) {
      modalImp.querySelector('[data-si-step="' + i + '"]').classList.toggle('d-none', i !== n);
    });
    btnAplicar.classList.toggle('d-none', n !== 2);
  }

  function pintarColumnas() {
    var opciones = estado.fields.map(function (f) {
      return '<option value="' + esc(f.key) + '">' + esc(f.label) + '</option>';
    }).join('');
    cuerpo.innerHTML = estado.columns.map(function (c) {
      return '<tr' + (c.field ? '' : ' class="pi-row--unknown"') + '>' +
        '<td class="fw-semibold">' + esc(c.header) + '</td>' +
        '<td class="small text-muted">' + esc((c.samples || []).join(' · ')) + '</td>' +
        '<td><select class="form-select form-select-sm" data-si-col="' + c.index + '">' +
        '<option value="">— No importar esta columna —</option>' + opciones + '</select></td></tr>';
    }).join('');
    estado.columns.forEach(function (c) {
      var sel = cuerpo.querySelector('[data-si-col="' + c.index + '"]');
      if (sel && c.field) sel.value = c.field;
    });
  }

  function analizar(file) {
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file, file.name);
    msg.className = 'small mt-2 text-muted';
    msg.textContent = 'Leyendo «' + file.name + '»…';
    fetch(CFG.analizar, { method: 'POST', headers: { 'X-CSRFToken': csrf() }, body: fd })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (!j || !j.ok) {
          msg.className = 'small mt-2 text-danger';
          msg.textContent = (j && j.error) || 'No se pudo leer el fichero.';
          return;
        }
        estado.rows = j.rows || [];
        estado.columns = j.columns || [];
        estado.fields = j.fields || [];
        modalImp.querySelector('[data-si-file]').textContent = j.filename || file.name;
        modalImp.querySelector('[data-si-count]').textContent = '· ' + (j.count || 0) + ' fila(s)';
        var aviso = modalImp.querySelector('[data-si-unknown]');
        aviso.classList.toggle('d-none', !j.unknown);
        if (j.unknown) {
          aviso.innerHTML = '<i class="fa fa-circle-question me-1"></i>Hay <strong>' + j.unknown +
            '</strong> columna(s) que no se han reconocido: dinos qué son o déjalas fuera.';
        }
        pintarColumnas();
        pasoImp(2);
      })
      .catch(function () {
        msg.className = 'small mt-2 text-danger';
        msg.textContent = 'No se pudo leer el fichero.';
      });
  }

  zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('pi-drop--over'); });
  zona.addEventListener('dragleave', function () { zona.classList.remove('pi-drop--over'); });
  zona.addEventListener('drop', function (e) {
    e.preventDefault();
    zona.classList.remove('pi-drop--over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) analizar(f);
  });
  input.addEventListener('change', function () { analizar(input.files[0]); input.value = ''; });
  modalImp.querySelector('[data-si-restart]').addEventListener('click', function () {
    msg.textContent = ''; pasoImp(1);
  });

  btnAplicar.addEventListener('click', function () {
    var mapping = {};
    cuerpo.querySelectorAll('[data-si-col]').forEach(function (sel) {
      if (sel.value) mapping[sel.getAttribute('data-si-col')] = { field: sel.value };
    });
    if (!Object.keys(mapping).length) {
      alert('Dinos al menos qué columna es el nombre o el email.');
      return;
    }
    btnAplicar.disabled = true;
    btnAplicar.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Importando…';
    fetch(CFG.aplicar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
      body: JSON.stringify({ rows: estado.rows, mapping: mapping })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        btnAplicar.disabled = false;
        btnAplicar.innerHTML = '<i class="fa fa-check me-1"></i>Importar';
        if (!j || !j.ok) {
          alert((j && j.error) || 'No se pudieron importar.');
          return;
        }
        var html = '<div class="alert alert-success"><i class="fa fa-check me-1"></i><strong>' +
          (j.count || 0) + '</strong> supervisor(es) en Syncros.</div><ul class="small mb-0">';
        if ((j.created || []).length) html += '<li><strong>' + j.created.length + '</strong> terceros nuevos: ' + esc(j.created.slice(0, 12).join(', ')) + '</li>';
        if ((j.linked || []).length) html += '<li><strong>' + j.linked.length + '</strong> ya estaban en la base de terceros (se han reutilizado, no se duplican): ' + esc(j.linked.slice(0, 12).join(', ')) + '</li>';
        if ((j.updated || []).length) html += '<li><strong>' + j.updated.length + '</strong> ya estaban en Syncros (se les ha completado la ficha)</li>';
        if ((j.errors || []).length) html += '<li class="text-danger"><strong>' + j.errors.length + '</strong> con problemas: ' + esc(j.errors.slice(0, 6).join(' · ')) + '</li>';
        html += '</ul>';
        modalImp.querySelector('[data-si-result]').innerHTML = html;
        pasoImp(3);
        setTimeout(function () { window.location.reload(); }, 2200);
      })
      .catch(function () {
        btnAplicar.disabled = false;
        btnAplicar.innerHTML = '<i class="fa fa-check me-1"></i>Importar';
        alert('No se pudieron importar.');
      });
  });
})();
