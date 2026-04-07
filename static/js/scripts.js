let evoChart = null;

function enableFormEdit(btn){
  const form = btn.closest('form');
  form.querySelectorAll('input[type="number"]').forEach(i => i.disabled = false);
}

function initSelect2(){
  // Select2: soporta selects en página y dentro de modales Bootstrap.
  // Si no configuramos dropdownParent en modales, el desplegable puede quedar detrás (z-index).
  $('.select-artists, .select-with-thumbs').each(function(){
    const $el = $(this);
    // Evitar doble inicialización
    if ($el.hasClass('select2-hidden-accessible')) return;

    const $modal = $el.closest('.modal');

    const isSquare = $el.hasClass('select-with-thumbs') && !$el.hasClass('select-artists');

    const opts = {
      width: '100%',
      ...( $modal.length ? { dropdownParent: $modal } : {} ),
      templateResult: function (data) {
        if (!data.id) return data.text;
        const photo = $(data.element).data('photo');
        const imgClass = isSquare ? 'thumb thumb-square' : 'thumb';
        const placeholder = isSquare ? `<span class="me-2"><i class="fa fa-ticket"></i></span>` : `<span class="me-2"><i class="fa fa-user-circle"></i></span>`;
        const img = photo ? `<img class="${imgClass}" src="${photo}" />` : placeholder;
        return $(`<span>${img}${data.text}</span>`);
      },
      templateSelection: function (data) {
        const photo = $(data.element).data('photo');
        const imgClass = isSquare ? 'thumb thumb-square' : 'thumb';
        const placeholder = isSquare ? `<span class="me-2"><i class="fa fa-ticket"></i></span>` : `<span class="me-2"><i class="fa fa-user-circle"></i></span>`;
        const img = photo ? `<img class="${imgClass}" src="${photo}" />` : placeholder;
        return $(`<span>${img}${data.text}</span>`);
      },
      escapeMarkup: function (m) { return m; }
    };

    $el.select2(opts);
  });
}

function initArtistContractControls(){
  function normalizeConcept(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .toUpperCase();
  }

  function normalizePct(value){
    const raw = String(value ?? '').trim().replace(',', '.');
    if (!raw) return '0';
    const num = Number(raw);
    return Number.isFinite(num) ? String(num) : raw;
  }

  function normalizeConfig(values){
    const base = String(values.base || 'GROSS').trim().toUpperCase() || 'GROSS';
    return {
      pct_artist: normalizePct(values.pct_artist),
      pct_office: normalizePct(values.pct_office),
      base,
      profit_scope: base === 'PROFIT' ? String(values.profit_scope || 'CONCEPT_ONLY').trim().toUpperCase() : ''
    };
  }

  function configsDiffer(a, b){
    const aa = normalizeConfig(a || {});
    const bb = normalizeConfig(b || {});
    return aa.pct_artist !== bb.pct_artist
      || aa.pct_office !== bb.pct_office
      || aa.base !== bb.base
      || aa.profit_scope !== bb.profit_scope;
  }

  function ensureScopeModal(){
    let modalEl = document.getElementById('contractScopeModal');
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'contractScopeModal';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Aplicación del nuevo porcentaje</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <p class="mb-2">Se ha detectado un cambio de porcentaje o base para este concepto respecto a contratos anteriores.</p>
            <p class="text-muted small mb-0">Los ingresos ya generados antes de la fecha del nuevo contrato no se modificarán.</p>
          </div>
          <div class="modal-footer flex-column align-items-stretch gap-2">
            <button type="button" class="btn btn-primary" data-scope="ALL_MATERIALS">Aplicar desde ahora a todos los materiales</button>
            <button type="button" class="btn btn-outline-primary" data-scope="ONLY_NEW_MATERIALS">Aplicar solo a materiales nuevos desde esta fecha</button>
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    return modalEl;
  }

  function showScopeChooser(form, hiddenInput){
    const modalEl = ensureScopeModal();
    const modal = new bootstrap.Modal(modalEl);

    const cleanup = () => {
      modalEl.querySelectorAll('[data-scope]').forEach((btn) => {
        btn.replaceWith(btn.cloneNode(true));
      });
    };

    modalEl.querySelectorAll('[data-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        hiddenInput.value = btn.dataset.scope || 'ALL_MATERIALS';
        form.dataset.scopeResolved = '1';
        modal.hide();
        setTimeout(() => form.requestSubmit ? form.requestSubmit() : form.submit(), 0);
      }, { once: true });
    });

    modalEl.addEventListener('hidden.bs.modal', () => {
      cleanup();
    }, { once: true });

    modal.show();
  }

  function applyBaseVisibility(baseSel, profitSel, wrap){
    if (!baseSel || !profitSel) return;
    const isProfit = (baseSel.value || '').toUpperCase() === 'PROFIT';
    profitSel.disabled = !isProfit;
    if (wrap) wrap.classList.toggle('opacity-50', !isProfit);
  }

  document.querySelectorAll('.commitment-row').forEach((row) => {
    const baseSel = row.querySelector('.commitment-base');
    const profitSel = row.querySelector('.commitment-profit-scope');
    const wrap = row.querySelector('.profit-scope-wrap') || profitSel?.parentElement;
    if (!baseSel || !profitSel || baseSel.disabled) return;
    const apply = () => applyBaseVisibility(baseSel, profitSel, wrap);
    baseSel.addEventListener('change', apply);
    apply();
  });

  document.querySelectorAll('form .commitment-base').forEach((baseSel) => {
    const form = baseSel.closest('form');
    if (!form) return;
    const profitSel = form.querySelector('.commitment-profit-scope');
    const wrap = form.querySelector('.profit-scope-wrap') || profitSel?.parentElement;
    if (!profitSel || baseSel.disabled) return;
    const apply = () => applyBaseVisibility(baseSel, profitSel, wrap);
    baseSel.addEventListener('change', apply);
    apply();
  });

  document.querySelectorAll('form.commitment-impact-form').forEach((form) => {
    const hiddenScope = form.querySelector('input[name="material_scope"]');
    const conceptEl = form.querySelector('[name="concept"]');
    const pctArtistEl = form.querySelector('[name="pct_artist"]');
    const pctOfficeEl = form.querySelector('[name="pct_office"]');
    const baseEl = form.querySelector('[name="base"]');
    const profitScopeEl = form.querySelector('[name="profit_scope"]');
    if (!hiddenScope || !conceptEl || !pctArtistEl || !pctOfficeEl || !baseEl) return;

    form.addEventListener('submit', (ev) => {
      if (form.dataset.scopeResolved === '1') {
        delete form.dataset.scopeResolved;
        return;
      }

      const concept = normalizeConcept(conceptEl.value);
      if (!concept) return;

      let existing = [];
      try {
        existing = JSON.parse(form.dataset.existingCommitments || '[]');
      } catch (_e) {
        existing = [];
      }

      const comparable = existing.filter((item) => normalizeConcept(item && item.concept) === concept);
      if (!comparable.length) {
        hiddenScope.value = hiddenScope.value || form.dataset.defaultScope || 'ALL_MATERIALS';
        return;
      }

      const submitted = {
        pct_artist: pctArtistEl.value,
        pct_office: pctOfficeEl.value,
        base: baseEl.value,
        profit_scope: profitScopeEl ? profitScopeEl.value : ''
      };

      const hasDifferent = comparable.some((item) => configsDiffer(submitted, item || {}));
      if (!hasDifferent) {
        hiddenScope.value = hiddenScope.value || form.dataset.defaultScope || 'ALL_MATERIALS';
        return;
      }

      ev.preventDefault();
      showScopeChooser(form, hiddenScope);
    });
  });
}

function initConcertTagManager(opts){
  const input = document.getElementById(opts.inputId);
  const chipsWrap = document.getElementById(opts.chipsId);
  const hiddenWrap = document.getElementById(opts.hiddenId);
  if (!input || !chipsWrap || !hiddenWrap) return null;

  const normalizeTag = (value) => String(value || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ');

  const values = [];

  function sync(){
    chipsWrap.innerHTML = '';
    hiddenWrap.innerHTML = '';

    values.forEach((tag, idx) => {
      const chip = document.createElement('span');
      chip.className = 'badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-2 me-2 mb-2';
      chip.innerHTML = `<span>#${tag}</span><button type="button" class="btn btn-sm p-0 border-0 bg-transparent text-danger" aria-label="Eliminar"><i class="fa fa-times"></i></button>`;
      chip.querySelector('button').addEventListener('click', () => {
        values.splice(idx, 1);
        sync();
      });
      chipsWrap.appendChild(chip);

      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'concert_tags[]';
      hidden.value = tag;
      hiddenWrap.appendChild(hidden);
    });
  }

  function addTag(raw){
    const tag = normalizeTag(raw);
    if (!tag) return false;
    const exists = values.some((v) => v.localeCompare(tag, 'es', { sensitivity: 'accent' }) === 0);
    if (exists) return false;
    values.push(tag);
    sync();
    return true;
  }

  function addFromInput(){
    if (!input) return;
    addTag(input.value);
    input.value = '';
    input.focus();
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      addFromInput();
    }
  });

  (opts.initialTags || []).forEach(addTag);
  sync();

  return {
    addTag,
    addFromInput,
    getTags: () => values.slice(),
  };
}
window.initConcertTagManager = initConcertTagManager;
window.concertTagManagers = window.concertTagManagers || {};

function initClickableRows(){
  document.querySelectorAll('.clickable-row[data-href]').forEach((row) => {
    row.addEventListener('click', (e) => {
      // Si el click viene de un control interactivo dentro de la fila, no navegamos.
      // (por ejemplo botones, inputs, selects, enlaces…)
      try {
        if (e && e.target && e.target.closest && e.target.closest('a,button,input,select,textarea,label')) return;
      } catch (_) {}
      const href = row.getAttribute('data-href');
      if (href) window.location.href = href;
    });

    // Accesibilidad: Enter / Space abre igual.
    row.addEventListener('keydown', (e) => {
      if (!e) return;
      const key = e.key || '';
      if (key !== 'Enter' && key !== ' ') return;
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
  const bindInterpreterRows = (buttonId, containerId) => {
    const addBtn = document.getElementById(buttonId);
    const container = document.getElementById(containerId);
    if (!addBtn || !container) return;
    addBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'row g-2 interpreter-row';
      row.innerHTML = `
        <div class="col-12 col-md-7">
          <input class="form-control" name="interpreter_name[]" placeholder="Nombre" autocomplete="off" data-lpignore="true" required>
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
      container.appendChild(row);
      const input = row.querySelector('input[name="interpreter_name[]"]');
      if (input){
        input.value = '';
        input.setAttribute('autocomplete', 'off');
        setTimeout(() => { try { input.focus(); } catch (_) {} }, 30);
      }
    });
  };

  // Intérpretes
  bindInterpreterRows('addInterpreterRow', 'interpretersContainer');
  bindInterpreterRows('addSongInterpreterRow', 'songCreateInterpretersContainer');

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

function initEditorialTab(){
  const modalEl = document.getElementById('editorialShareModal');
  const dataEl = document.getElementById('editorialData');
  if (!modalEl || !dataEl || typeof initTypeahead !== 'function' || !window.bootstrap) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  const total = parseFloat(dataEl.dataset.total || '0') || 0;

  const titleEl = document.getElementById('editorialShareModalTitle');
  const shareIdEl = document.getElementById('editorialShareId');
  const promoterSearchEl = document.getElementById('editorialPromoterSearch');
  const promoterIdEl = document.getElementById('editorialPromoterId');
  const firstNameEl = document.getElementById('editorialFirstName');
  const lastNameEl = document.getElementById('editorialLastName');
  const emailEl = document.getElementById('editorialEmail');
  const phoneEl = document.getElementById('editorialPhone');
  const publisherInputEl = document.getElementById('editorialPublisherInput');
  const publisherIdEl = document.getElementById('editorialPublisherId');
  const roleEl = document.getElementById('editorialRole');
  const pctEl = document.getElementById('editorialPct');
  const pctHelpEl = document.getElementById('editorialPctHelp');

  const btnAdd = document.getElementById('btnAddEditorialShare');
  const btnCreateNewPromoter = document.getElementById('editorialCreateNewPromoter');
  const btnShowNewPublisher = document.getElementById('btnShowNewPublisher');
  const newPublisherWrap = document.getElementById('newPublisherWrap');
  const newPublisherName = document.getElementById('newPublisherName');
  const newPublisherLogo = document.getElementById('newPublisherLogo');
  const btnCancelNewPublisher = document.getElementById('btnCancelNewPublisher');
  const btnCreateNewPublisher = document.getElementById('btnCreateNewPublisher');
  const newPublisherError = document.getElementById('newPublisherError');

  // Typeaheads
  initTypeahead('editorialPromoterSearch', 'editorialPromoterId', '/api/search/promoters');
  initTypeahead('editorialPublisherInput', 'editorialPublisherId', '/api/search/publishing_companies');

  function showPublisherError(msg){
    if (!newPublisherError) return;
    newPublisherError.textContent = msg || '';
    newPublisherError.style.display = msg ? '' : 'none';
  }

  function resetNewPublisherUI(){
    if (newPublisherWrap) newPublisherWrap.style.display = 'none';
    if (newPublisherName) newPublisherName.value = '';
    if (newPublisherLogo) newPublisherLogo.value = '';
    showPublisherError('');
  }

  function updatePctHelp(currentPct){
    if (!pctHelpEl) return;
    const cur = parseFloat(currentPct || '0') || 0;
    const available = Math.max(0, 100 - (total - cur));
    pctHelpEl.textContent = `Disponible: ${available.toFixed(2)}% (total actual: ${total.toFixed(2)}%)`;
  }

  function setAddMode(){
    modalEl.dataset.mode = 'add';
    if (titleEl) titleEl.textContent = 'Añadir autor/compositor';
    if (shareIdEl) shareIdEl.value = '';
    if (promoterSearchEl) promoterSearchEl.value = '';
    if (promoterIdEl) promoterIdEl.value = '';
    if (firstNameEl) firstNameEl.value = '';
    if (lastNameEl) lastNameEl.value = '';
    if (emailEl) emailEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (publisherInputEl) publisherInputEl.value = '';
    if (publisherIdEl) publisherIdEl.value = '';
    if (roleEl) roleEl.value = 'AUTHOR';
    if (pctEl) pctEl.value = '';
    updatePctHelp(0);
    resetNewPublisherUI();
  }

  async function fillFromPromoterId(pid){
    if (!pid) return;
    try {
      const r = await fetch(`/api/promoters/${encodeURIComponent(pid)}`);
      if (!r.ok) return;
      const js = await r.json();
      if (js.error) return;

      if (firstNameEl) firstNameEl.value = js.first_name || '';
      if (lastNameEl) lastNameEl.value = js.last_name || '';
      if (emailEl) emailEl.value = js.contact_email || '';
      if (phoneEl) phoneEl.value = js.contact_phone || '';

      if (publisherInputEl) publisherInputEl.value = js.publishing_company_name || '';
      if (publisherIdEl) publisherIdEl.value = js.publishing_company_id || '';
    } catch (_) {}
  }

  function switchToNewPromoter(){
    if (promoterSearchEl) promoterSearchEl.value = '';
    if (promoterIdEl) promoterIdEl.value = '';
    if (firstNameEl) firstNameEl.value = '';
    if (lastNameEl) lastNameEl.value = '';
    if (emailEl) emailEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (firstNameEl) firstNameEl.focus();
  }

  if (btnAdd) btnAdd.addEventListener('click', setAddMode);
  if (btnCreateNewPromoter) btnCreateNewPromoter.addEventListener('click', switchToNewPromoter);

  // Si el usuario vuelve a escribir, asumimos que cambia de tercero
  if (promoterSearchEl && promoterIdEl){
    promoterSearchEl.addEventListener('input', () => {
      promoterIdEl.value = '';
    });
    promoterSearchEl.addEventListener('change', () => {
      setTimeout(() => fillFromPromoterId(promoterIdEl.value), 0);
    });
  }

  // Si el usuario vuelve a escribir editorial, limpiamos id
  if (publisherInputEl && publisherIdEl){
    publisherInputEl.addEventListener('input', () => {
      publisherIdEl.value = '';
    });
  }

  // Editar share existente
  document.querySelectorAll('.btn-edit-editorial[data-share-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shareId = btn.getAttribute('data-share-id');
      const currentPct = btn.getAttribute('data-current-pct') || '0';
      updatePctHelp(currentPct);

      try {
        const r = await fetch(`/api/song_editorial_shares/${encodeURIComponent(shareId)}`);
        if (!r.ok) throw new Error('No se pudo cargar');
        const js = await r.json();
        if (js.error) throw new Error(js.error);

        modalEl.dataset.mode = 'edit';
        if (titleEl) titleEl.textContent = 'Editar autor/compositor';

        if (shareIdEl) shareIdEl.value = js.id || '';
        if (promoterIdEl) promoterIdEl.value = (js.promoter && js.promoter.id) ? js.promoter.id : '';
        if (promoterSearchEl) promoterSearchEl.value = (js.promoter && js.promoter.nick) ? js.promoter.nick : '';

        if (firstNameEl) firstNameEl.value = (js.promoter && js.promoter.first_name) ? js.promoter.first_name : '';
        if (lastNameEl) lastNameEl.value = (js.promoter && js.promoter.last_name) ? js.promoter.last_name : '';
        if (emailEl) emailEl.value = (js.promoter && js.promoter.contact_email) ? js.promoter.contact_email : '';
        if (phoneEl) phoneEl.value = (js.promoter && js.promoter.contact_phone) ? js.promoter.contact_phone : '';

        if (publisherIdEl) publisherIdEl.value = (js.promoter && js.promoter.publishing_company_id) ? js.promoter.publishing_company_id : '';
        if (publisherInputEl) publisherInputEl.value = (js.promoter && js.promoter.publishing_company_name) ? js.promoter.publishing_company_name : '';

        if (roleEl) roleEl.value = (js.role || 'AUTHOR');
        if (pctEl) pctEl.value = (js.pct != null) ? js.pct : '';

        resetNewPublisherUI();
        modal.show();
      } catch (e) {
        // Silencioso: el servidor ya mostrará flash en el submit si falla
        console.error(e);
      }
    });
  });

  // Crear editorial en el propio modal
  if (btnShowNewPublisher && newPublisherWrap){
    btnShowNewPublisher.addEventListener('click', () => {
      newPublisherWrap.style.display = '';
      showPublisherError('');
      if (newPublisherName) newPublisherName.focus();
    });
  }
  if (btnCancelNewPublisher){
    btnCancelNewPublisher.addEventListener('click', resetNewPublisherUI);
  }
  if (btnCreateNewPublisher){
    btnCreateNewPublisher.addEventListener('click', async () => {
      const name = (newPublisherName && newPublisherName.value || '').trim();
      if (!name){
        showPublisherError('El nombre de la editorial es obligatorio.');
        return;
      }

      try {
        const fd = new FormData();
        fd.append('name', name);
        if (newPublisherLogo && newPublisherLogo.files && newPublisherLogo.files[0]){
          fd.append('logo', newPublisherLogo.files[0]);
        }
        const r = await fetch('/api/publishing_companies/create', { method: 'POST', body: fd });
        const js = await r.json();
        if (!r.ok || js.error){
          showPublisherError(js.error || 'Error creando la editorial.');
          return;
        }
        if (publisherInputEl) publisherInputEl.value = js.label || name;
        if (publisherIdEl) publisherIdEl.value = js.id || '';
        resetNewPublisherUI();
      } catch (e) {
        showPublisherError('Error creando la editorial.');
      }
    });
  }
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



// -------------------------------
// Discográfica > Ingresos
// -------------------------------

function _detectCsvDelimiter(headerLine) {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

function _splitCsvHeader(line, delimiter) {
  // Split CSV header line respecting simple quotes.
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length) out.push(cur.trim());
  return out.map(c => c.replace(/^﻿/, '')); // remove BOM
}

function _populateSelectOptions(selectEl, cols, preferred) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Selecciona…</option>';
  cols.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selectEl.appendChild(opt);
  });
  if (preferred) {
    const prefLower = preferred.map(p => p.toLowerCase());
    const hit = cols.find(c => prefLower.some(p => c.toLowerCase().includes(p)));
    if (hit) selectEl.value = hit;
  }
}

function initIncomeModals() {
  // Add / Edit income entry modal
  const entryModalEl = document.getElementById('incomeEntryModal');
  if (entryModalEl) {
    const titleEl = document.getElementById('incomeEntryModalTitle');
    const entryIdEl = document.getElementById('incomeEntryId');
    const songIdEl = document.getElementById('incomeSongId');
    const songTitleEl = document.getElementById('incomeSongTitle');
    const periodTypeEl = document.getElementById('incomePeriodType');
    const periodStartEl = document.getElementById('incomePeriodStart');
    const nameEl = document.getElementById('incomeName');
    const grossEl = document.getElementById('incomeGross');
    const netEl = document.getElementById('incomeNet');

    document.querySelectorAll('.btn-income-add').forEach(btn => {
      btn.addEventListener('click', () => {
        if (titleEl) titleEl.textContent = 'Añadir ingreso';
        if (entryIdEl) entryIdEl.value = '';
        if (songIdEl) songIdEl.value = btn.dataset.songId || '';
        if (songTitleEl) songTitleEl.textContent = btn.dataset.songTitle || '—';
        if (periodTypeEl) periodTypeEl.value = btn.dataset.periodType || '';
        if (periodStartEl) periodStartEl.value = btn.dataset.periodStart || '';
        if (nameEl) nameEl.value = '';
        if (grossEl) grossEl.value = '';
        if (netEl) netEl.value = '';
      });
    });

    document.querySelectorAll('.btn-income-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        if (titleEl) titleEl.textContent = 'Editar ingreso';
        if (entryIdEl) entryIdEl.value = btn.dataset.entryId || '';
        if (songIdEl) songIdEl.value = btn.dataset.songId || ''; // optional
        if (songTitleEl) songTitleEl.textContent = btn.dataset.songTitle || '—';
        if (periodTypeEl) periodTypeEl.value = btn.dataset.periodType || '';
        if (periodStartEl) periodStartEl.value = btn.dataset.periodStart || '';
        if (nameEl) nameEl.value = btn.dataset.name || '';
        if (grossEl) grossEl.value = btn.dataset.gross || '';
        if (netEl) netEl.value = btn.dataset.net || '';
      });
    });
  }

  // Upload CSV modal
  const uploadModalEl = document.getElementById('incomeUploadModal');
  if (uploadModalEl) {
    const artistIdEl = document.getElementById('incomeUploadArtistId');
    const artistNameEl = document.getElementById('incomeUploadArtistName');
    const artistPhotoEl = document.getElementById('incomeUploadArtistPhoto');
    const periodTypeEl = document.getElementById('incomeUploadPeriodType');
    const periodStartEl = document.getElementById('incomeUploadPeriodStart');
    const fileEl = document.getElementById('incomeUploadFile');
    const amountColEl = document.getElementById('incomeUploadAmountColFixed');
    const netRadio = document.getElementById('incomeAmtNet');
    const grossRadio = document.getElementById('incomeAmtGross');

    uploadModalEl.addEventListener('show.bs.modal', (ev) => {
      const btn = ev.relatedTarget;
      const fallbackPhoto = artistPhotoEl ? (artistPhotoEl.getAttribute('data-default-src') || artistPhotoEl.src) : '';

      if (artistIdEl) artistIdEl.value = (btn && btn.dataset.artistId) ? btn.dataset.artistId : '';
      if (artistNameEl) artistNameEl.textContent = (btn && btn.dataset.artistName) ? btn.dataset.artistName : 'Importación por ISRC';
      if (artistPhotoEl) {
        const p = (btn && btn.dataset.artistPhoto) ? btn.dataset.artistPhoto : '';
        artistPhotoEl.src = p || fallbackPhoto;
      }
      if (periodTypeEl) periodTypeEl.value = (btn && btn.dataset.periodType) ? btn.dataset.periodType : (periodTypeEl.value || '');
      if (periodStartEl) periodStartEl.value = (btn && btn.dataset.periodStart) ? btn.dataset.periodStart : (periodStartEl.value || '');

      if (fileEl) fileEl.value = '';
      if (netRadio) netRadio.checked = true;
      if (amountColEl) amountColEl.value = 'Net Revenue';
    });

    if (netRadio && amountColEl) {
      netRadio.addEventListener('change', () => {
        if (netRadio.checked) amountColEl.value = 'Net Revenue';
      });
    }
    if (grossRadio && amountColEl) {
      grossRadio.addEventListener('change', () => {
        if (grossRadio.checked) amountColEl.value = 'Gross Revenue';
      });
    }
  }
}

// IMPORTANTE:
// Si cualquier inicializador lanza excepción, se cortaba el resto y algunas
// interacciones (p.ej. abrir ficha de canción al clickar una fila) dejaban de funcionar.
// Aislamos cada init con try/catch para que no "rompa" el resto de la página.
$(function(){
  try { initSelect2(); } catch (e) { console.error('initSelect2', e); }
  try { initIncomeModals(); } catch (e) { console.error('initIncomeModals', e); }
  try { initArtistContractControls(); } catch (e) { console.error('initArtistContractControls', e); }
  try { initClickableRows(); } catch (e) { console.error('initClickableRows', e); }
  try { initSongLinkModal(); } catch (e) { console.error('initSongLinkModal', e); }
  try { initBootstrapTooltips(); } catch (e) { console.error('initBootstrapTooltips', e); }
  try { initDynamicRows(); } catch (e) { console.error('initDynamicRows', e); }
  try { initIsrcModalControls(); } catch (e) { console.error('initIsrcModalControls', e); }
  try { initSongOwnershipControls(); } catch (e) { console.error('initSongOwnershipControls', e); }
  try { initEditorialTab(); } catch (e) { console.error('initEditorialTab', e); }
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
// =========================
// Discográfica > Royalties
// =========================

function _royaltyStatusMeta(status){
  const s = (status || '').toUpperCase();
  if (s === 'SENT') return {label: 'Enviada', color: 'primary'};
  if (s === 'INVOICED') return {label: 'Facturada', color: 'warning'};
  if (s === 'PAID') return {label: 'Pagado', color: 'success'};
  return {label: 'Generada', color: 'secondary'};
}

async function downloadRoyaltyLiquidationPdf(kind, bid, semesterKey){
  try {
    const url = `/discografica/royalties/liquidacion/pdf?kind=${encodeURIComponent(kind)}&bid=${encodeURIComponent(bid)}&s=${encodeURIComponent(semesterKey)}`;

    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || 'No se pudo generar el PDF');
    }

    const blob = await r.blob();
    const objUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `liquidacion_royalties_${semesterKey}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(objUrl);

    // Recargar para que aparezca la etiqueta de estado (Generada)
    setTimeout(() => { window.location.reload(); }, 250);

  } catch (err) {
    console.error(err);
    alert('Error al generar la liquidación: ' + (err && err.message ? err.message : err));
  }
}

async function setRoyaltyLiquidationStatus(kind, bid, semesterKey, status){
  try {
    const r = await fetch('/discografica/royalties/liquidacion/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, bid, s: semesterKey, status })
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || 'No se pudo actualizar el estado');
    }

    const js = await r.json();
    if (!js || !js.ok) throw new Error('Respuesta inválida');

    const meta = _royaltyStatusMeta(js.status);
    const wrap = document.getElementById(`royLiqBadgeWrap_${kind}_${bid}`);
    if (wrap) {
      // Si hay badge dropdown ya renderizado, actualizamos el botón.
      const btn = wrap.querySelector('button.badge');
      if (btn) {
        btn.textContent = meta.label;
        btn.className = btn.className
          .replace(/text-bg-\w+/g, '')
          .trim() + ` text-bg-${meta.color}`;
      } else {
        // Si no existe (por ejemplo, aún no estaba generada), montamos uno mínimo
        wrap.innerHTML = `<span class="badge rounded-pill text-bg-${meta.color}">${meta.label}</span>`;
      }
    }

  } catch (err) {
    console.error(err);
    alert('Error al actualizar estado: ' + (err && err.message ? err.message : err));
  }
}

(function(){
  function getRoyaltyPreviewState(){
    if (!window.__royaltyPreviewState) {
      window.__royaltyPreviewState = {
        kind: '',
        bid: '',
        semesterKey: '',
        subject: '',
        currentHtml: '',
        previousHtml: '',
        mode: 'current',
        hasChanges: false,
        canSendPrevious: false,
        recipients: [],
        suggestedRecipients: [],
        lastSentAtLabel: '',
        lastSentTo: []
      };
    }
    return window.__royaltyPreviewState;
  }

  function getRoyaltyPreviewModal(){
    const el = document.getElementById('royaltyLiquidationPreviewModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
  }

  function getRoyaltyInfoModal(){
    const el = document.getElementById('royaltyLiquidationInfoModal');
    return el ? bootstrap.Modal.getOrCreateInstance(el) : null;
  }

  function renderRoyaltyPreviewRecipients(){
    const state = getRoyaltyPreviewState();
    const wrap = document.getElementById('royaltyPreviewRecipients');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!Array.isArray(state.recipients) || state.recipients.length === 0) {
      state.recipients = [''];
    }
    state.recipients.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'royalty-preview-recipient-row';

      const input = document.createElement('input');
      input.type = 'email';
      input.className = 'form-control';
      input.placeholder = 'correo@dominio.com';
      input.value = value || '';
      input.addEventListener('input', () => {
        state.recipients[index] = input.value || '';
      });
      row.appendChild(input);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-outline-danger btn-sm';
      removeBtn.innerHTML = '<i class="fa fa-trash"></i>';
      removeBtn.disabled = state.recipients.length <= 1;
      removeBtn.addEventListener('click', () => {
        state.recipients.splice(index, 1);
        renderRoyaltyPreviewRecipients();
        renderRoyaltyPreviewSuggestions();
      });
      row.appendChild(removeBtn);

      wrap.appendChild(row);
    });
  }

  function renderRoyaltyPreviewSuggestions(){
    const state = getRoyaltyPreviewState();
    const wrap = document.getElementById('royaltyPreviewSuggestions');
    if (!wrap) return;
    wrap.innerHTML = '';
    const current = (state.recipients || []).map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    (state.suggestedRecipients || []).forEach((email) => {
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || current.includes(normalized)) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm';
      btn.textContent = email;
      btn.addEventListener('click', () => {
        state.recipients.push(email);
        renderRoyaltyPreviewRecipients();
        renderRoyaltyPreviewSuggestions();
      });
      wrap.appendChild(btn);
    });
  }

  function collectRoyaltyPreviewRecipients(){
    const state = getRoyaltyPreviewState();
    const values = [];
    document.querySelectorAll('#royaltyPreviewRecipients input').forEach((input) => {
      const email = (input.value || '').trim();
      if (email) values.push(email);
    });
    state.recipients = values;
    return values;
  }

  function renderRoyaltyPreviewAlert(){
    const state = getRoyaltyPreviewState();
    const wrap = document.getElementById('royaltyPreviewAlertWrap');
    const modeButtons = document.getElementById('royaltyPreviewModeButtons');
    if (!wrap || !modeButtons) return;
    wrap.innerHTML = '';
    if (state.hasChanges && state.canSendPrevious) {
      const details = state.lastSentAtLabel ? ` Último envío: ${state.lastSentAtLabel}.` : '';
      wrap.innerHTML = `<div class="alert alert-warning mb-3">Ha habido cambios respecto a la última liquidación enviada.${details} Puedes generar y enviar una nueva o reenviar la anterior.</div>`;
      modeButtons.classList.remove('d-none');
    } else {
      modeButtons.classList.add('d-none');
    }
  }

  function renderRoyaltyPreviewFrame(){
    const state = getRoyaltyPreviewState();
    const frame = document.getElementById('royaltyLiquidationPreviewFrame');
    if (!frame) return;
    const usePrevious = state.mode === 'previous' && state.canSendPrevious && state.previousHtml;
    frame.srcdoc = usePrevious ? state.previousHtml : (state.currentHtml || '<div style="padding:24px;font-family:Arial,sans-serif;">Sin previsualización.</div>');
  }

  window.setRoyaltyPreviewMode = function setRoyaltyPreviewMode(mode){
    const state = getRoyaltyPreviewState();
    state.mode = mode === 'previous' ? 'previous' : 'current';
    const currentBtn = document.getElementById('royaltyPreviewModeCurrent');
    const previousBtn = document.getElementById('royaltyPreviewModePrevious');
    if (currentBtn) currentBtn.className = `btn ${state.mode === 'current' ? 'btn-primary' : 'btn-outline-primary'}`;
    if (previousBtn) previousBtn.className = `btn ${state.mode === 'previous' ? 'btn-primary' : 'btn-outline-primary'}`;
    renderRoyaltyPreviewFrame();
  };

  window.addRoyaltyPreviewRecipient = function addRoyaltyPreviewRecipient(value){
    const state = getRoyaltyPreviewState();
    state.recipients.push(value || '');
    renderRoyaltyPreviewRecipients();
    renderRoyaltyPreviewSuggestions();
  };

  window.openRoyaltyLiquidationPreview = async function openRoyaltyLiquidationPreview(kind, bid, semesterKey){
    try {
      const r = await fetch(`/discografica/royalties/liquidacion/preview?kind=${encodeURIComponent(kind)}&bid=${encodeURIComponent(bid)}&s=${encodeURIComponent(semesterKey)}`);
      const js = await r.json().catch(() => ({}));
      if (!r.ok || !js.ok) throw new Error((js && js.message) || 'No se pudo cargar la previsualización');

      const state = getRoyaltyPreviewState();
      state.kind = kind;
      state.bid = bid;
      state.semesterKey = semesterKey;
      state.subject = js.subject || '';
      state.currentHtml = js.html_body || '';
      state.previousHtml = js.previous_html_body || '';
      state.hasChanges = !!js.has_changes;
      state.canSendPrevious = !!js.can_send_previous;
      state.suggestedRecipients = Array.isArray(js.suggested_recipients) ? js.suggested_recipients.slice() : [];
      state.recipients = Array.isArray(js.default_recipients) && js.default_recipients.length
        ? js.default_recipients.slice()
        : (state.suggestedRecipients.length ? [state.suggestedRecipients[0]] : ['']);
      state.lastSentAtLabel = js.last_sent_at_label || '';
      state.lastSentTo = Array.isArray(js.last_sent_to) ? js.last_sent_to.slice() : [];
      state.mode = 'current';

      const subjectEl = document.getElementById('royaltyPreviewSubject');
      if (subjectEl) subjectEl.textContent = state.subject;

      renderRoyaltyPreviewAlert();
      renderRoyaltyPreviewRecipients();
      renderRoyaltyPreviewSuggestions();
      window.setRoyaltyPreviewMode('current');

      const modal = getRoyaltyPreviewModal();
      if (modal) modal.show();
    } catch (err) {
      console.error(err);
      alert('No se pudo abrir la previsualización: ' + (err && err.message ? err.message : err));
    }
  };

  window.sendRoyaltyLiquidationPreview = async function sendRoyaltyLiquidationPreview(){
    const state = getRoyaltyPreviewState();
    const recipients = collectRoyaltyPreviewRecipients();
    if (!recipients.length) {
      alert('Debes indicar al menos una dirección de correo.');
      return;
    }

    const btn = document.getElementById('royaltyPreviewSendBtn');
    const originalHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Enviando...';
      }
      const r = await fetch('/discografica/royalties/liquidacion/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          kind: state.kind,
          bid: state.bid,
          s: state.semesterKey,
          mode: state.mode,
          recipients
        })
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok || !js.ok) throw new Error((js && js.message) || 'No se pudo enviar la liquidación');

      const modal = getRoyaltyPreviewModal();
      if (modal) modal.hide();
      alert(js.message || 'Liquidación enviada.');
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('No se pudo enviar la liquidación: ' + (err && err.message ? err.message : err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  };

  window.showRoyaltyLiquidationInfo = async function showRoyaltyLiquidationInfo(kind, bid, semesterKey){
    try {
      const r = await fetch(`/discografica/royalties/liquidacion/info?kind=${encodeURIComponent(kind)}&bid=${encodeURIComponent(bid)}&s=${encodeURIComponent(semesterKey)}`);
      const js = await r.json().catch(() => ({}));
      if (!r.ok || !js.ok) throw new Error((js && js.message) || 'No se pudo cargar la información');
      if (!js.has_info) {
        alert('Todavía no hay información de envío guardada para esta liquidación.');
        return;
      }
      const sentAt = document.getElementById('royaltyInfoSentAt');
      if (sentAt) sentAt.textContent = js.sent_at_label || '—';
      const recipientsWrap = document.getElementById('royaltyInfoRecipients');
      if (recipientsWrap) {
        recipientsWrap.innerHTML = '';
        (js.sent_to || []).forEach((email) => {
          const li = document.createElement('li');
          li.textContent = email;
          recipientsWrap.appendChild(li);
        });
      }
      const pdfLink = document.getElementById('royaltyInfoPdfLink');
      if (pdfLink) {
        pdfLink.href = js.pdf_url || '#';
        pdfLink.classList.toggle('disabled', !js.pdf_url);
      }
      const modal = getRoyaltyInfoModal();
      if (modal) modal.show();
    } catch (err) {
      console.error(err);
      alert('No se pudo cargar la información del envío: ' + (err && err.message ? err.message : err));
    }
  };

  window.scrollRoyaltySemesters = function scrollRoyaltySemesters(direction){
    const scroller = document.getElementById('royaltySemesterScroller');
    if (!scroller) return;
    const delta = Math.max(220, Math.round(scroller.clientWidth * 0.75));
    scroller.scrollBy({ left: direction < 0 ? -delta : delta, behavior: 'smooth' });
    setTimeout(updateRoyaltySemesterScrollButtons, 250);
  };

  function updateRoyaltySemesterScrollButtons(){
    const scroller = document.getElementById('royaltySemesterScroller');
    const prevBtn = document.getElementById('royaltySemesterPrevBtn');
    const nextBtn = document.getElementById('royaltySemesterNextBtn');
    if (!scroller || !prevBtn || !nextBtn) return;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const hasOverflow = maxScroll > 4;
    prevBtn.style.visibility = hasOverflow ? 'visible' : 'hidden';
    nextBtn.style.visibility = hasOverflow ? 'visible' : 'hidden';
    prevBtn.disabled = !hasOverflow || scroller.scrollLeft <= 4;
    nextBtn.disabled = !hasOverflow || scroller.scrollLeft >= (maxScroll - 4);
  }

  window.updateRoyaltySemesterScrollButtons = updateRoyaltySemesterScrollButtons;
  window.addEventListener('resize', updateRoyaltySemesterScrollButtons);
  window.addEventListener('load', () => {
    const scroller = document.getElementById('royaltySemesterScroller');
    if (!scroller) return;
    scroller.addEventListener('scroll', updateRoyaltySemesterScrollButtons, { passive: true });
    updateRoyaltySemesterScrollButtons();
  });
})();
