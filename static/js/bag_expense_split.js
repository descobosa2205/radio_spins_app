/* DIVIDIR UN GASTO ENTRE VARIAS BOLSAS.

   GLOBAL y por DELEGACIÓN en `document`: el panel de bolsa se pinta también EMBEBIDO en fichas
   (proyecto, actividad, canción, álbum) cuyas zonas se repintan por AJAX, y un <script> de dentro
   no se vuelve a ejecutar.

   ⚠️ El pop-up se configura EN EL CLIC (`data-bag-split`), no en `shown.bs.modal` (modal_stack.js
   se come ese evento).
   ⚠️ Los importes se ESCRIBEN formateados: se leen SIEMPRE con `window.numv` — `parseFloat('40.000')`
   da 40, porque el punto es de MILES.
*/
(function () {
  'use strict';

  var URL_SUJETOS = '/bolsas/split/sujetos';
  var URL_BOLSAS = '/bolsas/split/bolsas';
  var estado = null;   // {modal, urlSave, urlUndo, total, mode, self:{...}, rows:[...]}

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) { var d = document.createElement('div'); d.textContent = v == null ? '' : String(v); return d.innerHTML; }
  function num(v) { return (window.numv ? window.numv(v) : parseFloat(String(v || '0').replace(',', '.'))) || 0; }
  function eur(v) { return (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function money(v) { return (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function modal() { return document.getElementById('bagSplitModal'); }

  function paso(nombre) {
    var m = modal(); if (!m) return;
    qa('[data-split-step]', m).forEach(function (el) {
      el.classList.toggle('d-none', el.getAttribute('data-split-step') !== nombre);
    });
  }

  /* ---------------------------------------------------------------- paso 1 · de quién es */
  var sujetos = null, verMas = false;
  function pintaSujetos() {
    var m = modal(); if (!m || !sujetos) return;
    var caja = q('[data-split-subjects]', m);
    var busca = (q('[data-split-subject-search]', m).value || '').toLowerCase();
    var filas = sujetos.filter(function (s) {
      if (busca) return (s.name || '').toLowerCase().indexOf(busca) >= 0;
      return verMas || s.active;
    });
    caja.innerHTML = filas.slice(0, 200).map(function (s) {
      return '<button type="button" class="promo-pick" data-split-subject="' + esc(s.id) + '" data-split-subject-kind="' + esc(s.kind) + '" data-split-subject-label="' + esc(s.name) + '">'
        + '<span class="promo-pick__box">'
        + (s.photo_url ? '<img src="' + esc(s.photo_url) + '" alt="">' : '<span class="promo-pick__avatar"><i class="fa fa-' + (s.kind === 'event' ? 'masks-theater' : 'user') + '"></i></span>')
        + '<span class="promo-pick__name">' + esc(s.name) + '</span></span></button>';
    }).join('');
    var btn = q('[data-split-more]', m);
    if (btn) btn.classList.toggle('d-none', !!busca || verMas || sujetos.every(function (s) { return s.active; }));
  }

  function cargaSujetos() {
    var m = modal(); if (!m) return;
    fetch(URL_SUJETOS, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        sujetos = d.rows || [];
        pintaSujetos();
        var kinds = q('[data-split-kinds]', m);
        kinds.innerHTML = (d.kinds || []).map(function (k) {
          return '<div class="col-6 col-md-4"><button type="button" class="activity-choice-card border rounded p-3 text-center h-100 w-100 d-block bg-white" data-split-kind="' + esc(k.key) + '" data-split-kind-label="' + esc(k.label) + '">'
            + '<i class="fa ' + esc(k.icon) + ' d-block fs-3 mb-2 text-dark"></i>'
            + '<span class="fw-semibold small">' + esc(k.label) + '</span></button></div>';
        }).join('');
      }).catch(function () {});
  }

  /* ---------------------------------------------------------------- paso 3 · las bolsas */
  var sujetoActual = null, kindActual = null;
  function cargaBolsas() {
    var m = modal(); if (!m || !sujetoActual || !kindActual) return;
    var excluir = [estado.self.bag_id].concat(estado.rows.map(function (r) { return r.bag_id; })).join(',');
    var url = URL_BOLSAS + '?subject_kind=' + encodeURIComponent(sujetoActual.kind)
      + '&subject_id=' + encodeURIComponent(sujetoActual.id)
      + '&kind=' + encodeURIComponent(kindActual.key)
      + '&exclude=' + encodeURIComponent(excluir);
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var caja = q('[data-split-bags]', m);
        var filas = (d && d.rows) || [];
        caja.innerHTML = filas.map(function (b) {
          return '<button type="button" class="list-group-item list-group-item-action" data-split-bag="' + esc(b.id) + '" data-split-bag-label="' + esc(b.title) + '">'
            + '<div class="fw-semibold">' + esc(b.title) + '</div>'
            + '<div class="small text-muted">' + esc(b.subtitle || b.artist || '') + '</div></button>';
        }).join('');
        q('[data-split-bags-empty]', m).classList.toggle('d-none', filas.length > 0);
      }).catch(function () {});
  }

  /* ---------------------------------------------------------------- el reparto */
  function pintaReparto() {
    var m = modal(); if (!m || !estado) return;
    q('[data-split-shares-card]', m).classList.toggle('d-none', estado.rows.length === 0);
    var modos = q('[data-split-modes]', m);
    modos.innerHTML = (estado.modes || []).map(function (k) {
      var on = estado.mode === k.key;
      return '<button type="button" class="btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline-secondary') + '" data-split-set-mode="' + esc(k.key) + '">'
        + '<i class="fa ' + esc(k.icon) + ' me-1"></i>' + esc(k.label) + '</button>';
    }).join('');
    var libre = estado.mode !== 'EQUAL';
    var unidad = estado.mode === 'PERCENT' ? '%' : '€';
    var filas = [{ bag_id: estado.self.bag_id, title: estado.self.title, titular: true, value: estado.self.value }]
      .concat(estado.rows);
    q('[data-split-rows]', m).innerHTML = filas.map(function (r, i) {
      return '<div class="d-flex align-items-center gap-2 border rounded p-2 mb-2">'
        + '<div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">' + esc(r.title) + '</div>'
        + (r.titular ? '<div class="small text-muted"><i class="fa fa-star me-1"></i>Bolsa de origen: aquí se lleva la factura, el pago y la contabilidad</div>' : '')
        + '</div>'
        + (libre
          ? '<div class="input-group input-group-sm" style="width:150px;"><input type="text" class="form-control" data-split-value="' + i + '" value="' + esc(r.value || '') + '" inputmode="decimal"><span class="input-group-text">' + unidad + '</span></div>'
          : '<span class="badge text-bg-light border" data-split-calc="' + i + '"></span>')
        + (r.titular ? '' : '<button type="button" class="btn btn-sm btn-outline-danger" data-split-remove="' + i + '"><i class="fa fa-trash"></i></button>')
        + '</div>';
    }).join('');
    calcula();
  }

  function calcula() {
    var m = modal(); if (!m || !estado) return;
    var n = estado.rows.length + 1;
    var total = estado.total;
    var repartido = 0, importes = [];
    if (estado.mode === 'EQUAL') {
      var parte = Math.round((total / n) * 100) / 100;
      importes = new Array(n).fill(parte);
    } else if (estado.mode === 'PERCENT') {
      importes = [num(estado.self.value)].concat(estado.rows.map(function (r) { return num(r.value); }))
        .map(function (p) { return Math.round(total * p) / 100; });
    } else {
      importes = [num(estado.self.value)].concat(estado.rows.map(function (r) { return num(r.value); }));
    }
    importes.forEach(function (v) { repartido += v; });
    qa('[data-split-calc]', m).forEach(function (el) {
      el.textContent = eur(importes[parseInt(el.getAttribute('data-split-calc'), 10)] || 0);
    });
    var pend = q('[data-split-pending]', m);
    if (estado.mode === 'PERCENT') {
      var pct = [num(estado.self.value)].concat(estado.rows.map(function (r) { return num(r.value); }))
        .reduce(function (a, b) { return a + b; }, 0);
      pend.textContent = 'Suman ' + money(pct) + '% (tienen que sumar 100%)';
      pend.className = 'small fw-normal ' + (Math.abs(pct - 100) < 0.05 ? 'text-success' : 'text-danger');
    } else if (estado.mode === 'AMOUNT') {
      var queda = total - repartido;
      pend.textContent = Math.abs(queda) < 0.005
        ? 'Repartido del todo'
        : (queda > 0 ? 'Quedan ' + eur(queda) + ' por repartir (se los queda la bolsa de origen)'
                     : 'Te has pasado en ' + eur(-queda));
      pend.className = 'small fw-normal ' + (queda < -0.005 ? 'text-danger' : 'text-muted');
    } else {
      pend.textContent = 'A partes iguales entre ' + n + ' bolsas';
      pend.className = 'small fw-normal text-muted';
    }
  }

  /* ---------------------------------------------------------------- abrir */
  function abre(btn) {
    var m = modal(); if (!m) return;
    estado = { urlSave: btn.getAttribute('data-split-url'), urlUndo: btn.getAttribute('data-split-undo-url'),
               total: 0, mode: 'EQUAL', modes: [], self: { bag_id: '', title: 'Esta bolsa', value: '' }, rows: [] };
    q('[data-split-form]', m).setAttribute('action', estado.urlSave);
    q('[data-split-lock]', m).classList.add('d-none');
    verMas = false; sujetoActual = null; kindActual = null;
    paso('subject');
    fetch(btn.getAttribute('data-split-state-url'), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        estado.total = num(d.total_gross);
        estado.mode = d.mode || 'EQUAL';
        estado.modes = d.modes || [];
        q('[data-split-concept]', m).textContent = d.concept || 'Gasto';
        q('[data-split-total-gross]', m).textContent = eur(num(d.total_gross));
        q('[data-split-total-net]', m).textContent = eur(num(d.total_net));
        (d.rows || []).forEach(function (r) {
          if (r.titular) { estado.self = { bag_id: r.bag_id, title: r.bag_title, value: (estado.mode === 'PERCENT' ? r.pct : r.amount) }; }
          else { estado.rows.push({ bag_id: r.bag_id, title: r.bag_title, value: (estado.mode === 'PERCENT' ? r.pct : r.amount) }); }
        });
        if (!estado.self.bag_id) { estado.self.bag_id = d.bag_id; estado.self.title = 'Esta bolsa'; }
        if (d.lock) {
          var av = q('[data-split-lock]', m);
          av.textContent = d.lock; av.classList.remove('d-none');
          q('[data-split-submit]', m).disabled = true;
        } else {
          q('[data-split-submit]', m).disabled = false;
        }
        q('[data-split-undo]', m).classList.toggle('d-none', estado.rows.length === 0);
        pintaReparto();
      }).catch(function () {});
    cargaSujetos();
    try { new bootstrap.Modal(m).show(); } catch (e) {}
  }

  /* ---------------------------------------------------------------- eventos (delegación) */
  document.addEventListener('click', function (e) {
    var abrir = e.target.closest('[data-bag-split]');
    if (abrir) { e.preventDefault(); abre(abrir); return; }
    var m = modal(); if (!m || !m.contains(e.target)) return;

    var suj = e.target.closest('[data-split-subject]');
    if (suj) {
      sujetoActual = { id: suj.getAttribute('data-split-subject'), kind: suj.getAttribute('data-split-subject-kind'),
                       name: suj.getAttribute('data-split-subject-label') };
      q('[data-split-subject-name]', m).textContent = sujetoActual.name;
      paso('kind'); return;
    }
    var kind = e.target.closest('[data-split-kind]');
    if (kind) {
      kindActual = { key: kind.getAttribute('data-split-kind'), label: kind.getAttribute('data-split-kind-label') };
      q('[data-split-kind-name]', m).textContent = sujetoActual.name + ' · ' + kindActual.label;
      paso('bag'); cargaBolsas(); return;
    }
    var bag = e.target.closest('[data-split-bag]');
    if (bag) {
      estado.rows.push({ bag_id: bag.getAttribute('data-split-bag'), title: bag.getAttribute('data-split-bag-label'), value: '' });
      q('[data-split-undo]', m).classList.remove('d-none');
      paso('subject'); pintaReparto(); return;
    }
    var back = e.target.closest('[data-split-back]');
    if (back) { paso(back.getAttribute('data-split-back')); return; }
    var mas = e.target.closest('[data-split-more]');
    if (mas) { verMas = true; pintaSujetos(); return; }
    var add = e.target.closest('[data-split-add]');
    if (add) { paso('subject'); return; }
    var setm = e.target.closest('[data-split-set-mode]');
    if (setm) { estado.mode = setm.getAttribute('data-split-set-mode'); pintaReparto(); return; }
    var quita = e.target.closest('[data-split-remove]');
    if (quita) {
      var i = parseInt(quita.getAttribute('data-split-remove'), 10) - 1;
      if (i >= 0) estado.rows.splice(i, 1);
      pintaReparto(); return;
    }
    var undo = e.target.closest('[data-split-undo]');
    if (undo && estado && estado.urlUndo) {
      e.preventDefault();
      if (!window.confirm(undo.getAttribute('data-confirm') || '¿Deshacer la división?')) return;
      var f = document.createElement('form');
      f.method = 'post'; f.action = estado.urlUndo;
      var tok = document.querySelector('meta[name="csrf-token"]');
      if (tok) { var i2 = document.createElement('input'); i2.type = 'hidden'; i2.name = 'csrf_token'; i2.value = tok.getAttribute('content'); f.appendChild(i2); }
      document.body.appendChild(f); f.submit();
    }
  });

  document.addEventListener('input', function (e) {
    var m = modal(); if (!m || !m.contains(e.target) || !estado) return;
    if (e.target.matches('[data-split-subject-search]')) { pintaSujetos(); return; }
    if (e.target.matches('[data-split-value]')) {
      var i = parseInt(e.target.getAttribute('data-split-value'), 10);
      if (i === 0) estado.self.value = e.target.value;
      else if (estado.rows[i - 1]) estado.rows[i - 1].value = e.target.value;
      calcula();
    }
  });

  /* Al enviar, los valores viajan en campos ocultos (el reparto se arma en JS). */
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-split-form]');
    if (!f || !estado) return;
    qa('[data-split-hidden]', f).forEach(function (el) { el.remove(); });
    q('[data-split-mode]', f).value = estado.mode;
    q('[data-split-self-value]', f).value = (estado.self.value || '');
    estado.rows.forEach(function (r) {
      ['split_bag_id[]', 'split_value[]'].forEach(function (name, k) {
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = name; i.value = (k === 0 ? r.bag_id : (r.value || ''));
        i.setAttribute('data-split-hidden', '1');
        f.appendChild(i);
      });
    });
  });
})();
