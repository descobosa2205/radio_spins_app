
(function(){
  window.normalizeSearchText = window.normalizeSearchText || function(value){
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .toLowerCase()
      .trim();
  };
})();

let evoChart = null;

function enableFormEdit(btn){
  const form = btn.closest('form');
  form.querySelectorAll('input[type="number"]').forEach(i => i.disabled = false);
}

function initSelect2(){
  // Select2: soporta selects en página y dentro de modales Bootstrap.
  // Si no configuramos dropdownParent en modales, el desplegable puede quedar detrás (z-index).
  $('.select-artists, .select-with-thumbs, .select-country, .select-unified, .third-party-select, .select-promoters, .select-providers, .select-media, .select-songs, .select-venues').each(function(){
    const $el = $(this);
    if ($el.hasClass('select2-hidden-accessible')) return;

    const $modal = $el.closest('.modal');
    const isSquare = $el.hasClass('select-with-thumbs') && !$el.hasClass('select-artists');
    const isCountry = $el.hasClass('select-country');

    function optionMarkup(data){
      if (!data.id) return data.text;
      if (isCountry) {
        const flag = $(data.element).data('flag') || '';
        return $(`<span><span class="select2-country-flag">${flag}</span>${data.text}</span>`);
      }
      const photo = $(data.element).data('photo') || $(data.element).data('logo');
      const imgClass = isSquare ? 'thumb thumb-square' : 'thumb';
      const placeholder = isSquare ? `<span class="me-2"><i class="fa fa-ticket"></i></span>` : `<span class="me-2"><i class="fa fa-user-circle"></i></span>`;
      const img = photo ? `<img class="${imgClass}" src="${photo}" />` : placeholder;
      return $(`<span>${img}${data.text}</span>`);
    }

    $el.select2({
      width: '100%',
      ...( $modal.length ? { dropdownParent: $modal } : {} ),
      templateResult: optionMarkup,
      templateSelection: optionMarkup,
      matcher: function(params, data) {
        const term = window.normalizeSearchText(params.term || '');
        if (!term) return data;
        const el = data.element ? $(data.element) : $();
        const searchable = window.normalizeSearchText([
          data.text || '',
          el.data('search') || '',
          el.data('email') || '',
          el.data('nick') || '',
          el.data('name') || ''
        ].join(' '));
        return searchable.indexOf(term) > -1 ? data : null;
      },
      escapeMarkup: function (m) { return m; }
    });
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
      // (por ejemplo botones, inputs, selects, enlaces… y los nombres con data-artist-link,
      // que ya navegan a la ficha del artista vía artist_links.js)
      try {
        if (e && e.target && e.target.closest && e.target.closest('a,button,input,select,textarea,label,[data-artist-link]')) return;
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


function ensureAbsoluteShareUrl(url){
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return window.location.protocol + raw;
  if (raw.startsWith('/')) return window.location.origin + raw;
  return 'https://' + raw;
}

function shareTextWithClickableUrl(title, url){
  const cleanTitle = String(title || '').trim();
  const cleanUrl = ensureAbsoluteShareUrl(url);
  // El enlace va solo en su propia línea: WhatsApp/SMS/iMessage lo detectan como enlace clicable.
  return [cleanTitle, cleanUrl].filter(Boolean).join('\n\n');
}

window.ensureAbsoluteShareUrl = ensureAbsoluteShareUrl;
window.shareTextWithClickableUrl = shareTextWithClickableUrl;

function initImageFallbacks(){
  const defaultUrl = document.body ? (document.body.getAttribute('data-default-photo-url') || '') : '';
  const coverUrl = document.body ? (document.body.getAttribute('data-default-cover-url') || '') : '';
  if (!defaultUrl) return;
  // Las PORTADAS de canción/álbum (cover-square / song-hero-cover / .cover / [data-cover]) caen a un
  // placeholder de portada (disco gris), NO al avatar de persona.
  const isCover = (img) => !!(img && (img.classList.contains('cover-square') || img.classList.contains('song-hero-cover') || img.classList.contains('cover') || img.hasAttribute('data-cover')));
  const fbFor = (img) => (coverUrl && isCover(img)) ? coverUrl : defaultUrl;
  // Imágenes de Leaflet (tiles/marcadores del mapa) NUNCA pasan por el sistema de fallback: si un
  // tile falla momentáneamente (ráfaga/rate-limit de OSM) y le cambiáramos el src o lo ocultáramos,
  // el mapa entero se quedaba en gris (bug de simulaciones/cuadrantes).
  const isLeafletImg = (img) => (img.closest && img.closest('.leaflet-container')) ||
    (typeof img.className === 'string' && img.className.indexOf('leaflet') !== -1);
  const skipImg = (img) => !img || String(img.tagName || '').toUpperCase() !== 'IMG' ||
    img.closest('.navbar-brand') || img.classList.contains('brand') || img.dataset.keepLogo === '1' ||
    isLeafletImg(img);
  const selector = [
    'img.artist-avatar', 'img.artist-mini', 'img.song-hero-cover', 'img.cover-square', 'img.cover', 'img[data-cover]',
    'img.station-logo', 'img.user-nav-avatar', 'img[data-default-photo="1"]',
    'img[src$="/static/img/default_promoter.png"]',
    'img[src$="/static/img/promoter_default.png"]'
  ].join(',');

  // REINTENTAR antes de dar una imagen por perdida, SIN fases visibles:
  //  · Al fallar, la imagen pasa AL INSTANTE al placeholder (nunca el icono roto "?"). Para personas
  //    y logos el placeholder queda OCULTO por CSS (política: sin imagen → hueco omitido); las
  //    PORTADAS muestran su placeholder de disco.
  //  · El reintento hace fetch con cache:'reload' — además de reintentar, REPARA una posible
  //    respuesta de error CACHEADA por el navegador (causa de que la URL limpia fallara siempre y
  //    solo funcionara con cache-buster: error → placeholder → buena en CADA página). Después se
  //    comprueba la URL LIMPIA con un probe y, si carga, se restaura: la imagen queda con su URL
  //    original ya sana en caché, y las páginas siguientes cargan directas.
  // Más intentos y con JITTER (retardo aleatorizado): los fallos suelen venir en RÁFAGA (decenas de
  // miniaturas a la vez contra el Storage) y reintentarlas todas en el mismo milisegundo re-crea la
  // ráfaga que las hizo fallar — por eso a veces "no cargaban a la primera" pero sí al actualizar.
  const RETRY_DELAYS = [600, 1600, 3500, 7000, 15000];
  const retryDelay = (attempt) => Math.round(RETRY_DELAYS[attempt] * (0.7 + Math.random() * 0.6));
  const absUrl = (u) => {
    try { return new URL(u, window.location.href).href; } catch (e) { return u; }
  };
  const applyFallback = (img) => {
    const fb = fbFor(img);
    if (fb && img.src !== absUrl(fb)) { img.src = fb; img.classList.add('image-fallback'); }
  };
  const restoreImg = (img, url) => {
    img.classList.remove('image-fallback');
    img.src = url;
  };
  // Limitador: máximo 4 reparaciones simultáneas — sin él, tras una ráfaga de fallos todos los
  // fetch de reparación salían a la vez y volvían a saturar, fallando también los reintentos.
  let repairActive = 0;
  const repairQueue = [];
  const runRepair = (job) => {
    if (repairActive >= 4) { repairQueue.push(job); return; }
    repairActive++;
    job(() => {
      repairActive = Math.max(0, repairActive - 1);
      const next = repairQueue.shift();
      if (next) runRepair(next);
    });
  };
  // Último recurso agotados los reintentos: probar con cache-buster; si así carga, se muestra así
  // (mejor la imagen con sufijo que el hueco/placeholder hasta la próxima recarga).
  const tryCacheBuster = (img) => {
    const orig = img.dataset.origSrc;
    if (!orig || !img.isConnected) return;
    const busted = orig + (orig.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
    const probe = new Image();
    probe.onload = () => { if (img.isConnected) restoreImg(img, busted); };
    probe.onerror = () => {}; // agotado de verdad: queda el placeholder (oculto si no es portada)
    probe.src = busted;
  };
  const scheduleRetry = (img, attempt) => {
    if (attempt >= RETRY_DELAYS.length) { tryCacheBuster(img); return; }
    window.setTimeout(() => {
      if (!img.isConnected) return;
      const orig = img.dataset.origSrc;
      if (!orig) return;
      runRepair((done) => {
        const test = () => {
          const probe = new Image();
          probe.onload = () => { done(); if (img.isConnected) restoreImg(img, orig); };
          probe.onerror = () => { done(); scheduleRetry(img, attempt + 1); };
          probe.src = orig;
        };
        // noLoader: reparación en 2º plano — no debe encender el overlay de carga global.
        try { fetch(orig, { mode: 'no-cors', cache: 'reload', noLoader: true }).then(test, test); }
        catch (e) { test(); }
      });
    }, retryDelay(attempt));
  };
  const handleImgError = (img) => {
    if (skipImg(img)) return;
    img.classList.remove('img-error-pending');
    const fb = fbFor(img);
    if (!fb) return;
    if (img.dataset.origSrc) { applyFallback(img); return; } // falló tras restaurar: placeholder otra vez
    const raw = (img.getAttribute('src') || '').trim();
    if (!raw || absUrl(raw) === absUrl(fb)) { applyFallback(img); return; } // nada que reintentar
    img.dataset.origSrc = img.currentSrc || img.src || raw;
    applyFallback(img);
    scheduleRetry(img, 0);
  };

  if (!document.body.dataset.globalImgFallbackBound) {
    document.body.dataset.globalImgFallbackBound = '1';
    // Captura a nivel de documento: cubre también las imágenes insertadas después (Select2, AJAX,
    // galería de fotos…). Si el reintento vuelve a fallar, el propio 'error' reentra aquí y agota
    // los intentos antes de caer al placeholder.
    document.addEventListener('error', (ev) => { handleImgError(ev.target); }, true);
    // Imágenes que fallaron ANTES de llegar aquí: las encoló el capturador temprano del <head>
    // (layout.html) ya ocultas — se procesan ahora (reintento + placeholder/omisión).
    window.__imgFallbacksReady = true;
    (window.__imgErrQueue || []).forEach((img) => { try { handleImgError(img); } catch (e) {} });
    window.__imgErrQueue = [];
  }

  document.querySelectorAll(selector).forEach((img) => {
    if (skipImg(img)) return;
    const src = (img.getAttribute('src') || '').trim();
    if (!src || /\/static\/img\/(default_promoter|promoter_default)\.(png|jpg|jpeg|svg)$/i.test(src)) {
      applyFallback(img);
    }
  });

  // Barrido de seguridad: imágenes que ya habían fallado ANTES de registrar el listener global.
  // IMPORTANTE: naturalWidth===0 da FALSOS POSITIVOS con SVG válidos (un SVG sin ancho intrínseco
  // reporta 0 aunque cargue bien) — eso sustituía logos correctos por el placeholder gris. Por eso
  // solo se actúa si al re-verificar la URL con un probe (sale de caché, es inmediato) REALMENTE
  // falla; y aun entonces pasa por el ciclo de reintentos, no directo al placeholder.
  document.querySelectorAll('img').forEach((img) => {
    if (skipImg(img)) return;
    const fb = fbFor(img);
    if (!fb || img.src === absUrl(fb) || img.dataset.fallbackProbed === '1') return;
    const rawSrc = (img.getAttribute('src') || '').trim();
    if (!rawSrc) return;
    if (!(img.complete && img.naturalWidth === 0 && img.naturalHeight === 0)) return;
    img.dataset.fallbackProbed = '1';
    const probe = new Image();
    probe.onerror = () => handleImgError(img);
    probe.src = img.currentSrc || img.src;
  });
}

function initDropdownOverflowFix(){
  if (!window.bootstrap || !bootstrap.Dropdown) return;

  // App_33 global dropdown manager.
  // Objetivo: todos los menús de tres puntos y dropdowns se sacan al <body>
  // mientras están abiertos y se posicionan en coordenadas de viewport. Así no
  // quedan cortados por cards, tablas, listados, modales o contenedores con overflow.
  if (window.__app33DropdownManager && typeof window.__app33DropdownManager.refresh === 'function') {
    window.__app33DropdownManager.refresh();
    return;
  }

  const portalState = new WeakMap();
  const activeToggles = new Set();
  const TOGGLE_SELECTOR = '[data-bs-toggle="dropdown"]';

  function cssEscape(value){
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(value);
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function getRoot(toggle){
    return toggle ? toggle.closest('.dropdown, .btn-group, .dropup, .dropend, .dropstart') : null;
  }

  function getMenu(toggle){
    if (!toggle) return null;
    const controls = toggle.getAttribute('aria-controls');
    if (controls) {
      const byId = document.getElementById(controls);
      if (byId && byId.classList.contains('dropdown-menu')) return byId;
    }
    const target = toggle.getAttribute('data-bs-target') || toggle.getAttribute('href');
    if (target && target.charAt(0) === '#') {
      try {
        const byTarget = document.querySelector(target);
        if (byTarget && byTarget.classList.contains('dropdown-menu')) return byTarget;
      } catch (_) {}
    }
    const root = getRoot(toggle);
    if (!root) return null;
    try {
      return root.querySelector(':scope > .dropdown-menu');
    } catch (_) {
      return root.querySelector('.dropdown-menu');
    }
  }

  function dropdownOptions(){
    return {
      autoClose: true,
      boundary: 'viewport',
      display: 'static',
      reference: 'toggle'
    };
  }

  function prepareToggle(toggle){
    if (!toggle || toggle.dataset.app33DropdownPrepared === '1') return;
    toggle.dataset.app33DropdownPrepared = '1';
    toggle.setAttribute('data-bs-boundary', 'viewport');
    toggle.setAttribute('data-bs-display', 'static');
    try {
      const existing = bootstrap.Dropdown.getInstance(toggle);
      if (existing) existing.dispose();
    } catch (_) {}
    try { bootstrap.Dropdown.getOrCreateInstance(toggle, dropdownOptions()); } catch (_) {}
  }

  function prepareAll(scope){
    (scope || document).querySelectorAll(TOGGLE_SELECTOR).forEach(prepareToggle);
  }

  function setImportantStyle(menu, prop, value){
    try { menu.style.setProperty(prop, value, 'important'); }
    catch (_) { menu.style[prop] = value; }
  }

  function clearPositionStyles(menu){
    ['position','left','top','right','bottom','transform','inset','margin','min-width','max-width'].forEach((prop) => {
      try { menu.style.removeProperty(prop); } catch (_) {}
    });
    if (menu) {
      delete menu.dataset.app33Positioned;
      delete menu.dataset.app33Placement;
    }
  }

  function desiredHorizontalPlacement(toggle, menu){
    const root = getRoot(toggle);
    const isEnd = menu.classList.contains('dropdown-menu-end') || (root && root.classList.contains('dropdown-menu-end'));
    const isDropend = root && root.classList.contains('dropend');
    const isDropstart = root && root.classList.contains('dropstart');
    if (isDropend) return 'right-of-toggle';
    if (isDropstart) return 'left-of-toggle';
    return isEnd ? 'align-end' : 'align-start';
  }

  function placeMenu(toggle){
    const state = portalState.get(toggle);
    const menu = state ? state.menu : getMenu(toggle);
    if (!toggle || !menu || !menu.isConnected) return;

    // Forzamos display/visibility medibles aunque Bootstrap todavía esté terminando
    // la transición de show. La visibilidad real se activa al marcar positioned=1.
    setImportantStyle(menu, 'position', 'fixed');
    setImportantStyle(menu, 'transform', 'none');
    setImportantStyle(menu, 'inset', 'auto');
    setImportantStyle(menu, 'margin', '0');

    const rect = toggle.getBoundingClientRect();
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 768;
    const margin = 8;

    // Medición estable: al estar portaled y con .show se puede medir sin depender de Popper.
    const menuRect = menu.getBoundingClientRect();
    const minWidth = Math.max(rect.width, parseFloat(menu.dataset.app33MinWidth || '0') || 0, 180);
    const width = Math.min(Math.max(menuRect.width || menu.offsetWidth || minWidth, minWidth), Math.max(220, viewportW - margin * 2));
    const height = Math.min(menuRect.height || menu.offsetHeight || 0, Math.max(120, viewportH - margin * 2));
    const placement = desiredHorizontalPlacement(toggle, menu);

    let left;
    if (placement === 'right-of-toggle') left = rect.right + 6;
    else if (placement === 'left-of-toggle') left = rect.left - width - 6;
    else if (placement === 'align-end') left = rect.right - width;
    else left = rect.left;
    left = Math.max(margin, Math.min(left, viewportW - width - margin));

    let top = rect.bottom + 6;
    const opensUp = (top + height > viewportH - margin) && (rect.top - height - 6 >= margin);
    if (opensUp) top = rect.top - height - 6;
    top = Math.max(margin, Math.min(top, viewportH - Math.min(height, viewportH - margin * 2) - margin));

    setImportantStyle(menu, 'left', `${Math.round(left)}px`);
    setImportantStyle(menu, 'top', `${Math.round(top)}px`);
    setImportantStyle(menu, 'right', 'auto');
    setImportantStyle(menu, 'bottom', 'auto');
    setImportantStyle(menu, 'min-width', `${Math.round(minWidth)}px`);
    setImportantStyle(menu, 'max-width', `${Math.round(viewportW - margin * 2)}px`);
    menu.dataset.app33Positioned = '1';
    menu.dataset.app33Placement = opensUp ? 'top' : 'bottom';
  }

  function portalMenu(toggle){
    const menu = getMenu(toggle);
    if (!toggle || !menu || portalState.has(toggle)) return;
    const parent = menu.parentNode;
    if (!parent) return;
    const placeholder = document.createComment('app33-dropdown-menu-placeholder');
    parent.insertBefore(placeholder, menu);
    portalState.set(toggle, { menu, parent, placeholder });
    activeToggles.add(toggle);

    menu.dataset.app33Portaled = '1';
    menu.classList.add('dropdown-menu-portal-active');
    clearPositionStyles(menu);
    document.body.appendChild(menu);

    // Se coloca varias veces durante el ciclo de Bootstrap para evitar desfases
    // por cálculo tardío de tamaños, fuentes o imágenes en el menú.
    placeMenu(toggle);
    window.requestAnimationFrame(() => placeMenu(toggle));
    setTimeout(() => placeMenu(toggle), 60);
  }

  function restoreMenu(toggle){
    const state = portalState.get(toggle);
    if (!state) return;
    const { menu, parent, placeholder } = state;
    menu.classList.remove('dropdown-menu-portal-active');
    delete menu.dataset.app33Portaled;
    clearPositionStyles(menu);
    try {
      if (placeholder && placeholder.parentNode === parent) parent.insertBefore(menu, placeholder);
      else parent.appendChild(menu);
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    } catch (_) {}
    portalState.delete(toggle);
    activeToggles.delete(toggle);
  }

  function cleanupOrphanPortals(){
    // Menús ⋮ HUÉRFANOS: el menú se teleporta al <body> al abrirse (portalMenu) y, si un refresco
    // en sitio reemplaza la zona con el menú abierto, su botón desaparece del DOM y el menú queda
    // suelto pintado en la esquina superior izquierda (sin nadie que lo cierre). Aquí se detectan
    // (toggle desconectado) y se eliminan del body al momento.
    Array.from(activeToggles).forEach((toggle) => {
      if (toggle && toggle.isConnected) return;
      const state = portalState.get(toggle);
      if (state && state.menu){
        state.menu.classList.remove('show');
        try { state.menu.remove(); } catch (_) {}
      }
      portalState.delete(toggle);
      activeToggles.delete(toggle);
    });
  }

  function closeOtherOpenDropdowns(currentToggle){
    Array.from(activeToggles).forEach((toggle) => {
      if (toggle === currentToggle) return;
      try { bootstrap.Dropdown.getOrCreateInstance(toggle, dropdownOptions()).hide(); }
      catch (_) { restoreMenu(toggle); }
    });
  }

  document.addEventListener('click', (ev) => {
    const toggle = ev.target && ev.target.closest ? ev.target.closest(TOGGLE_SELECTOR) : null;
    if (!toggle) return;
    prepareToggle(toggle);
    closeOtherOpenDropdowns(toggle);
  }, true);

  document.addEventListener('show.bs.dropdown', (ev) => {
    const toggle = ev.target && ev.target.matches && ev.target.matches(TOGGLE_SELECTOR) ? ev.target : null;
    if (!toggle) return;
    prepareToggle(toggle);
    closeOtherOpenDropdowns(toggle);
    portalMenu(toggle);
  }, true);

  document.addEventListener('shown.bs.dropdown', (ev) => {
    const toggle = ev.target && ev.target.matches && ev.target.matches(TOGGLE_SELECTOR) ? ev.target : null;
    if (!toggle) return;
    placeMenu(toggle);
  }, true);

  document.addEventListener('hide.bs.dropdown', (ev) => {
    const toggle = ev.target && ev.target.matches && ev.target.matches(TOGGLE_SELECTOR) ? ev.target : null;
    if (!toggle) return;
    const menu = portalState.get(toggle)?.menu;
    if (menu) delete menu.dataset.app33Positioned;
  }, true);

  document.addEventListener('hidden.bs.dropdown', (ev) => {
    const toggle = ev.target && ev.target.matches && ev.target.matches(TOGGLE_SELECTOR) ? ev.target : null;
    if (!toggle) return;
    restoreMenu(toggle);
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    Array.from(activeToggles).forEach((toggle) => {
      try { bootstrap.Dropdown.getOrCreateInstance(toggle, dropdownOptions()).hide(); }
      catch (_) { restoreMenu(toggle); }
    });
  });

  const repositionAll = () => {
    Array.from(activeToggles).forEach((toggle) => placeMenu(toggle));
  };
  window.addEventListener('scroll', repositionAll, true);
  window.addEventListener('resize', repositionAll);

  const observer = new MutationObserver((mutations) => {
    let removedAny = false;
    mutations.forEach((mutation) => {
      if (mutation.removedNodes && mutation.removedNodes.length) removedAny = true;
      mutation.addedNodes.forEach((node) => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches && node.matches(TOGGLE_SELECTOR)) prepareToggle(node);
        else if (node.querySelectorAll) prepareAll(node);
      });
    });
    // Si el DOM ha quitado nodos con algún menú abierto, comprobar huérfanos al instante.
    if (removedAny && activeToggles.size) cleanupOrphanPortals();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  prepareAll(document);
  window.__app33DropdownManager = {
    refresh: () => prepareAll(document),
    reposition: repositionAll,
    restoreAll: () => Array.from(activeToggles).forEach(restoreMenu),
    cleanupOrphans: cleanupOrphanPortals
  };
}

function initVisualChoiceCards(){
  document.querySelectorAll('.activity-choice-card, .visual-choice-card').forEach((card) => {
    const input = card.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!input) return;
    const updateGroup = () => {
      const name = input.name;
      if (input.type === 'radio' && name) {
        const escapedName = (window.CSS && CSS.escape) ? CSS.escape(name) : String(name).replace(/"/g, '\\"');
        document.querySelectorAll(`input[type="radio"][name="${escapedName}"]`).forEach((other) => {
          const otherCard = other.closest('.activity-choice-card, .visual-choice-card');
          if (otherCard) otherCard.classList.toggle('is-selected', other.checked);
        });
      } else {
        card.classList.toggle('is-selected', input.checked);
      }
    };
    card.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest('a,button,select,textarea')) return;
      if (input.disabled) return;
      if (input.type === 'radio') input.checked = true;
      else if (ev.target !== input) input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateGroup();
    });
    input.addEventListener('change', updateGroup);
    updateGroup();
  });
}

function initUsageOrderedOverflowNav(){
  const nav = document.querySelector('.navbar-nav-primary');
  const overflow = document.getElementById('navOverflowItem');
  const menu = document.getElementById('navOverflowMenu');
  const userItem = document.getElementById('navUserItem');
  if (!nav || !overflow || !menu) return;

  nav.querySelectorAll('[data-nav-key]').forEach((el) => {
    el.addEventListener('click', () => {
      try {
        const key = el.getAttribute('data-nav-key') || '';
        if (!key) return;
        const storeKey = 'app33.nav.usage';
        const data = JSON.parse(localStorage.getItem(storeKey) || '{}');
        data[key] = (Number(data[key]) || 0) + 1;
        localStorage.setItem(storeKey, JSON.stringify(data));
      } catch (_) {}
    });
  });

  function topItems(){
    return Array.from(nav.children).filter((li) => li !== overflow && li !== userItem);
  }

  function clearOverflow(){
    menu.innerHTML = '';
    topItems().forEach((li) => li.classList.remove('nav-overflow-hidden', 'd-none'));
    overflow.classList.add('d-none');
  }

  function addCloneForItem(li){
    const topLink = li.querySelector(':scope > a.nav-link');
    const label = topLink ? (topLink.textContent || '').trim() : '';
    const childLinks = Array.from(li.querySelectorAll(':scope > .dropdown-menu .dropdown-item'));
    if (childLinks.length) {
      const headerLi = document.createElement('li');
      const header = document.createElement('h6');
      header.className = 'dropdown-header';
      header.textContent = label;
      headerLi.appendChild(header);
      menu.appendChild(headerLi);
      childLinks.forEach((child) => {
        const wrap = document.createElement('li');
        const clone = child.cloneNode(true);
        clone.classList.add('dropdown-item');
        wrap.appendChild(clone);
        menu.appendChild(wrap);
      });
      const divider = document.createElement('li');
      divider.innerHTML = '<hr class="dropdown-divider">';
      menu.appendChild(divider);
    } else if (topLink) {
      const wrap = document.createElement('li');
      const clone = topLink.cloneNode(true);
      clone.classList.remove('nav-link');
      clone.classList.add('dropdown-item');
      wrap.appendChild(clone);
      menu.appendChild(wrap);
    }
  }

  function availableWidth(){
    const parent = nav.parentElement;
    if (!parent) return 0;
    const userWidth = userItem ? userItem.getBoundingClientRect().width : 0;
    return Math.max(280, parent.getBoundingClientRect().width - userWidth - 36);
  }

  function applyOverflow(){
    if (window.innerWidth < 992) { clearOverflow(); return; }
    clearOverflow();
    const maxWidth = availableWidth();
    let items = topItems().filter((li) => !li.classList.contains('d-none'));
    let guard = 0;
    while (nav.scrollWidth > maxWidth && items.length > 1 && guard < 40) {
      const li = items[items.length - 1];
      li.classList.add('nav-overflow-hidden', 'd-none');
      overflow.classList.remove('d-none');
      addCloneForItem(li);
      items = topItems().filter((node) => !node.classList.contains('d-none'));
      guard += 1;
    }
    if (!menu.children.length) overflow.classList.add('d-none');
  }

  window.addEventListener('resize', () => window.requestAnimationFrame(applyOverflow));
  window.addEventListener('load', () => window.requestAnimationFrame(applyOverflow));
  setTimeout(applyOverflow, 50);
}

function initCopyLinkButtons(){
  document.querySelectorAll('.copy-link-btn[data-copy-url]').forEach((btn) => {
    if (btn.dataset.copyBound === '1') return;
    btn.dataset.copyBound = '1';
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copyUrl || '';
      if (!value) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value);
        else {
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-check me-1"></i>Copiado';
        setTimeout(() => { btn.innerHTML = original; }, 1400);
      } catch (err) {
        console.error(err);
        alert('No se pudo copiar el enlace.');
      }
    });
  });
}

// IMPORTANTE:
// Si cualquier inicializador lanza excepción, se cortaba el resto y algunas
// interacciones (p.ej. abrir ficha de canción al clickar una fila) dejaban de funcionar.
// Aislamos cada init con try/catch para que no "rompa" el resto de la página.
$(function(){
  try { initImageFallbacks(); } catch (e) { console.error('initImageFallbacks', e); }
  try { initSelect2(); } catch (e) { console.error('initSelect2', e); }
  try { initDropdownOverflowFix(); } catch (e) { console.error('initDropdownOverflowFix', e); }
  try { initVisualChoiceCards(); } catch (e) { console.error('initVisualChoiceCards', e); }
  try { initUsageOrderedOverflowNav(); } catch (e) { console.error('initUsageOrderedOverflowNav', e); }
  try { initCopyLinkButtons(); } catch (e) { console.error('initCopyLinkButtons', e); }
  try { initIncomeModals(); } catch (e) { console.error('initIncomeModals', e); }
  try { initArtistContractControls(); } catch (e) { console.error('initArtistContractControls', e); }
  try { initClickableRows(); } catch (e) { console.error('initClickableRows', e); }
  try { initSongLinkModal(); } catch (e) { console.error('initSongLinkModal', e); }
  try { initBootstrapTooltips(); } catch (e) { console.error('initBootstrapTooltips', e); }
  try { initDynamicRows(); } catch (e) { console.error('initDynamicRows', e); }
  try { initIsrcModalControls(); } catch (e) { console.error('initIsrcModalControls', e); }
  try { initSongOwnershipControls(); } catch (e) { console.error('initSongOwnershipControls', e); }
  try { initEditorialTab(); } catch (e) { console.error('initEditorialTab', e); }
  try { initInvitationDnd(); } catch (e) { console.error('initInvitationDnd', e); }
});

// Arrastrar solicitudes de invitaciones entre categorías (gestión de invitados y enlace público).
// El contenedor lleva data-inv-dnd y data-recat-base (URL con __REQ__). Cada tarjeta movible lleva
// data-req/data-cat/data-can-move/data-assigned; cada zona, data-cat-drop="<cat_id>".
function initInvitationDnd(){
  var CONFIRM_MSG = 'Se va a cambiar la categoría. Las invitaciones ya asignadas se recuperarán (volverán a disponibles) y la solicitud quedará pendiente de asignar. ¿Cambiar de categoría?';
  function csrf(){ var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  document.querySelectorAll('[data-inv-dnd]').forEach(function(cont){
    if (cont.dataset.dndBound === '1') return; cont.dataset.dndBound = '1';
    var base = cont.getAttribute('data-recat-base') || '';
    var drag = null;
    function post(url, target, confirmFlag){
      return fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-CSRFToken': csrf() }, body: JSON.stringify({ category_id: target, confirm: confirmFlag ? 1 : 0 }) }).then(function(r){ return r.json().catch(function(){ return {}; }); });
    }
    cont.querySelectorAll('.inv-cat-row[data-can-move="1"]').forEach(function(row){
      row.addEventListener('dragstart', function(e){ drag = { id: row.getAttribute('data-req'), cat: row.getAttribute('data-cat') || '', assigned: row.getAttribute('data-assigned') === '1' }; row.classList.add('inv-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag.id); } catch(_){} });
      row.addEventListener('dragend', function(){ row.classList.remove('inv-dragging'); cont.querySelectorAll('.inv-dragover').forEach(function(z){ z.classList.remove('inv-dragover'); }); });
    });
    // Recalcula el total (badge) de una zona sumando el data-qty de sus filas.
    function refreshZoneTotal(zoneEl){
      if (!zoneEl) return;
      var dz = zoneEl.querySelector('.inv-cat-dropzone');
      var total = 0;
      (dz ? dz.querySelectorAll('.inv-cat-row') : []).forEach(function(r){ total += (parseInt(r.getAttribute('data-qty'), 10) || 0); });
      var badge = zoneEl.querySelector('.inv-cat-group-header .inv-qty-badge');
      if (badge) { badge.innerHTML = '<i class="fa fa-ticket me-1"></i>' + total; }
    }
    cont.querySelectorAll('[data-cat-drop]').forEach(function(zone){
      zone.addEventListener('dragover', function(e){ if (!drag) return; e.preventDefault(); zone.classList.add('inv-dragover'); });
      zone.addEventListener('dragleave', function(){ zone.classList.remove('inv-dragover'); });
      zone.addEventListener('drop', function(e){
        e.preventDefault(); zone.classList.remove('inv-dragover');
        if (!drag) return;
        var target = zone.getAttribute('data-cat-drop') || '';
        var d = drag; drag = null;
        if (target === d.cat) return;
        var rowEl = document.getElementById('req-' + d.id) || cont.querySelector('.inv-cat-row[data-req="' + d.id + '"]');
        if (!rowEl) return;
        if (d.assigned && !window.confirm(CONFIRM_MSG)) return;
        var url = base.replace('__REQ__', encodeURIComponent(d.id));
        // --- Movimiento OPTIMISTA (inmediato, sin recarga) ---
        var srcZone = rowEl.closest('[data-cat-drop]');
        var placeholder = document.createComment('inv-recat');       // marca la posición original para revertir
        rowEl.parentNode.insertBefore(placeholder, rowEl.nextSibling);
        var destDz = zone.querySelector('.inv-cat-dropzone') || zone;
        var newColor = (function(){ var sw = zone.querySelector('.inv-cat-group-header .inv-cat-swatch'); return sw ? (sw.style.backgroundColor || '') : ''; })();
        var oldColor = rowEl.style.borderLeftColor;
        destDz.appendChild(rowEl);
        rowEl.setAttribute('data-cat', target);
        if (newColor) rowEl.style.borderLeftColor = newColor;
        refreshZoneTotal(srcZone); refreshZoneTotal(zone);
        function revert(){
          if (placeholder && placeholder.parentNode) { placeholder.parentNode.insertBefore(rowEl, placeholder); }
          rowEl.setAttribute('data-cat', d.cat);
          if (oldColor) rowEl.style.borderLeftColor = oldColor;
          if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
          refreshZoneTotal(srcZone); refreshZoneTotal(zone);
        }
        function done(){ if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder); }
        post(url, target, d.assigned).then(function(res){
          if (res && res.needs_confirm) {
            if (window.confirm(CONFIRM_MSG)) {
              post(url, target, true).then(function(r2){ if (r2 && r2.ok) { done(); } else { revert(); alert((r2 && r2.error) || 'No se pudo cambiar.'); } });
            } else { revert(); }
            return;
          }
          if (res && res.ok) { done(); }
          else { revert(); alert((res && res.error) || 'No se pudo cambiar de categoría.'); }
        }).catch(function(){ revert(); alert('No se pudo cambiar de categoría.'); });
      });
    });
  });
}

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

// App_33 · Modales apilados y altas rápidas dentro de formularios.
// Mantiene el modal padre abierto cuando se crea un tercero/recinto/etc. desde un popup secundario.
(function(){
  if (window.__app33ModalStackingReady) return;
  window.__app33ModalStackingReady = true;
  document.addEventListener('show.bs.modal', function(ev){
    const openModals = Array.from(document.querySelectorAll('.modal.show'));
    const z = 1065 + (openModals.length * 20);
    ev.target.classList.add('app33-modal-stack');
    ev.target.style.setProperty('--app33-modal-z', z);
    setTimeout(function(){
      const backdrops = Array.from(document.querySelectorAll('.modal-backdrop:not(.app33-modal-backdrop-stack)'));
      const backdrop = backdrops[backdrops.length - 1];
      if (backdrop) {
        backdrop.classList.add('app33-modal-backdrop-stack');
        backdrop.style.setProperty('--app33-backdrop-z', z - 5);
      }
    }, 0);
  });
  document.addEventListener('hidden.bs.modal', function(){
    if (document.querySelectorAll('.modal.show').length) {
      document.body.classList.add('modal-open');
    }
  });
})();

/* Responsive · envuelve automáticamente cualquier <table> que no tenga ya un contenedor con scroll
   horizontal, para que en móvil las tablas anchas hagan scroll dentro de su caja en vez de
   desbordar la pantalla. Global (scripts.js se carga en todas las páginas). */
(function () {
  'use strict';
  function wrapTables(root) {
    var tables = (root || document).querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      // Ya está en un contenedor con scroll o marcada para no envolver.
      if (t.closest('.table-responsive') || t.closest('[data-no-table-wrap]') || t.__wrapped) continue;
      t.__wrapped = true;
      var w = document.createElement('div');
      w.className = 'table-responsive';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wrapTables(document); });
  } else {
    wrapTables(document);
  }
  // Tablas insertadas dinámicamente (p. ej. dentro de modales cargados por AJAX).
  document.addEventListener('shown.bs.modal', function (e) { wrapTables(e.target); });
})();

/* Volver "inteligente": cualquier botón de volver (los que empiezan por "Volver" con la flecha, o
   [data-smart-back]) regresa a la posición EXACTA anterior con history.back() cuando venimos de la
   propia app; si no hay historial, sigue su href (página padre) como respaldo. Global. */
(function () {
  'use strict';
  function sameOriginReferrer() {
    try { return !!document.referrer && new URL(document.referrer).origin === window.location.origin; }
    catch (e) { return false; }
  }
  function isBackLink(a) {
    if (!a) return false;
    // Opt-out explícito: botones que deben ir SIEMPRE a su href (un destino concreto), sin
    // retroceder por el historial (que en pantallas que recargan tras cada edición te dejaría en
    // una "edición ya hecha" en vez de en la pantalla anterior real).
    if (a.hasAttribute('data-no-smart-back')) return false;
    if (a.hasAttribute('data-smart-back')) return true;
    var txt = (a.textContent || '').trim().toLowerCase();
    return !!a.querySelector('.fa-arrow-left') && txt.indexOf('volver') === 0;
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!isBackLink(a)) return;
    if (sameOriginReferrer() && window.history.length > 1) {
      e.preventDefault();
      window.history.back();  // el navegador restaura la posición de scroll
    }
    // Si no hay historial de la app, se sigue el href (fallback a la página padre).
  });
})();

/* Restaurar la posición EXACTA al "volver" a una pantalla concreta, aunque entre medias haya habido
   recargas (p. ej. en la gestión de invitaciones cada edición recarga la página, así que history.back
   dejaría en una edición previa). Un enlace con [data-restore-scroll] indica que, al llegar a su
   destino, hay que restaurar el scroll que esa pantalla tenía. Guardamos el scroll de cada página en
   su pagehide (por URL) y, al cargar, si el destino coincide con lo marcado, lo restauramos. Global. */
(function () {
  'use strict';
  var PREFIX = 'scrollpos:', FLAG = 'restoreScrollPath';
  function keyFor(path) { return PREFIX + path; }
  function curPath() { return location.pathname + location.search; }
  function save() { try { sessionStorage.setItem(keyFor(curPath()), String(window.scrollY || window.pageYOffset || 0)); } catch (e) {} }
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-restore-scroll]') : null;
    if (!a || !a.getAttribute('href')) return;
    try { var u = new URL(a.href, location.origin); sessionStorage.setItem(FLAG, u.pathname + u.search); } catch (err) {}
  });
  try {
    if (sessionStorage.getItem(FLAG) === curPath()) {
      sessionStorage.removeItem(FLAG);
      var y = parseInt(sessionStorage.getItem(keyFor(curPath())) || '0', 10) || 0;
      if (y > 0) {
        if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }
        var restore = function () { window.scrollTo(0, y); };
        window.addEventListener('load', restore);
        requestAnimationFrame(function () { requestAnimationFrame(restore); });
      }
    }
  } catch (e) {}
})();

/* Red de seguridad para táctiles (iPad/iOS): cerrar los menús desplegables (⋮) al tocar fuera.
   En iOS el `click` fuera a veces no llega a Bootstrap y el menú se queda abierto/superpuesto. */
(function () {
  'use strict';
  document.addEventListener('touchend', function (e) {
    var openMenus = document.querySelectorAll('.dropdown-menu.show');
    if (!openMenus.length || !window.bootstrap || !bootstrap.Dropdown) return;
    // Si el toque es sobre un toggle o dentro de un menú abierto, no cerramos (deja actuar a Bootstrap).
    if (e.target.closest('[data-bs-toggle="dropdown"]')) return;
    if (e.target.closest('.dropdown-menu.show')) return;
    openMenus.forEach(function (menu) {
      var toggle = menu.parentElement ? menu.parentElement.querySelector('[data-bs-toggle="dropdown"]') : null;
      if (!toggle) return;
      var inst = bootstrap.Dropdown.getInstance(toggle);
      if (inst) { try { inst.hide(); } catch (err) {} }
    });
  }, true);
})();

/* ============================================================================
   Cambio de ESTADO pinchando la etiqueta (conciertos y acciones).
   Contenedor: [data-status-menu] con data-status-url (endpoint POST) y opcional
   data-status-extra (JSON con campos extra, p. ej. {"form_action":"status"}).
   Opciones: [data-status-option="VALOR"] dentro del dropdown. Se envía por fetch
   (csrf.js añade el token) y se recarga la página al confirmar el servidor.
   Solo se pinta para quien puede editar (gate en la plantilla).
   ========================================================================== */
(function () {
  document.addEventListener('click', function (e) {
    var opt = e.target.closest('[data-status-option]');
    if (!opt) return;
    var wrap = opt.closest('[data-status-menu]');
    if (!wrap) return;
    e.preventDefault();
    e.stopPropagation();
    var url = wrap.getAttribute('data-status-url');
    if (!url) return;
    var params = new URLSearchParams();
    params.set('status', opt.getAttribute('data-status-option') || '');
    var extra = wrap.getAttribute('data-status-extra');
    if (extra) {
      try {
        var o = JSON.parse(extra);
        Object.keys(o).forEach(function (k) { params.set(k, o[k]); });
      } catch (_) {}
    }
    opt.classList.add('disabled');
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        window.location.reload();
      })
      .catch(function () {
        opt.classList.remove('disabled');
        alert('No se pudo cambiar el estado.');
      });
  });
})();
