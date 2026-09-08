/* Alta rápida de entidades (recinto, tercero, ticketera, editorial, artista) desde cualquier
   formulario, en un modal superpuesto, dejándola seleccionada sin recargar ni salir del formulario.

   Uso en una plantilla, junto a un <select id="mi_select">:
     <button type="button" class="btn btn-outline-secondary qc-open"
             data-quick-create="promoter" data-target="mi_select"><i class="fa fa-plus"></i></button>
*/
(function () {
  'use strict';
  var currentTargetId = null;

  function feedback(form, html) {
    var f = form.querySelector('.qc-feedback');
    if (f) f.innerHTML = html || '';
  }

  var currentTargetHiddenId = '';
  /* Un selector cuyos VALORES llevan prefijo (el «¿De quién es la actividad?» del asistente mezcla
     artistas y eventos como `artist:<id>` / `event:<id>`) lo dice con `data-target-prefix` en el
     botón «+», y con `data-target-group` el <optgroup> (por su rótulo) en el que se coloca lo nuevo.
     ⚠️ Antes el «+» y la «★» del asistente apuntaban a los <select> OCULTOS que espera el servidor:
     lo creado entraba ahí pero NO en el selector visible, y al validar el paso el espejo (que manda
     lo visible) lo borraba — «se crea y no se queda seleccionado» (bug real). */
  var currentTargetPrefix = '';
  var currentTargetGroup = '';

  function selectInTarget(targetId, id, label, logo) {
    var sel = document.getElementById(targetId);
    if (!sel || !id) return;
    if (sel.tagName === 'SELECT') {
      var valor = (currentTargetPrefix || '') + id;
      var opt = sel.querySelector('option[value="' + (window.CSS && CSS.escape ? CSS.escape(valor) : valor) + '"]');
      if (!opt) {
        opt = document.createElement('option');
        opt.value = valor;
        opt.textContent = label;
        var grupo = null;
        if (currentTargetGroup) {
          Array.prototype.forEach.call(sel.querySelectorAll('optgroup'), function (g) {
            if (!grupo && (g.getAttribute('label') || '') === currentTargetGroup) grupo = g;
          });
        }
        (grupo || sel).appendChild(opt);
      } else {
        opt.textContent = label;
      }
      if (logo) { opt.setAttribute('data-photo', logo); }
      // En un <select multiple> asignar .value reemplaza toda la selección; marcar la opción AÑADE
      // la recién creada conservando las ya elegidas.
      if (sel.multiple) { opt.selected = true; } else { sel.value = valor; }
      if (window.jQuery && jQuery.fn.select2 && jQuery(sel).hasClass('select2-hidden-accessible')) {
        jQuery(sel).trigger('change');
      } else {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      /* Un BUSCADOR de la casa (input de texto + su oculto): se rellenan los DOS y se avisa del
         cambio, igual que si se hubiera elegido de la lista. El oculto se dice con
         `data-target-hidden` en el botón «+» o con `data-ta-hidden` en el propio input. */
      sel.value = label;
      var hid = document.getElementById(
        (currentTargetHiddenId || sel.getAttribute('data-ta-hidden') || ''));
      if (hid) hid.value = id;
      if (logo) sel.setAttribute('data-photo', logo);
      /* ⚠️ Se le DICE al buscador que esto es lo elegido: si no, el `change` de abajo dispara su
         `resolveSelection`, que no encuentra el texto en el datalist y BORRA el oculto — el tercero
         quedaba creado y su id perdido (ver `input.app33TaPick` en typeahead.js). */
      if (typeof sel.app33TaPick === 'function') sel.app33TaPick(id, label);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function submitForm(form, force) {
    var modalEl = form.closest('.modal');
    var endpoint = form.getAttribute('data-qc-endpoint');
    var asJson = form.getAttribute('data-qc-json') === '1';
    var btn = form.querySelector('button[type="submit"]');
    var targetId = currentTargetId;
    var opts;
    if (asJson) {
      var payload = {};
      form.querySelectorAll('[name]').forEach(function (i) { payload[i.name] = i.value; });
      if (force) payload.force_new = true;
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    } else {
      var fd = new FormData(form);
      if (force) fd.set('force_new', '1');
      opts = { method: 'POST', body: fd };
    }
    if (btn) btn.disabled = true;
    fetch(endpoint, opts)
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (btn) btn.disabled = false;
        var data = res.data || {};
        if (res.status === 409 && data.similar) {
          // Mostrar los SIMILARES (con su logo/foto) para elegir uno de ellos, o crear igualmente.
          var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
          var html = '<div class="alert alert-warning py-2 mb-2">' + esc(data.error || 'Parece que ya existe algo similar.') + ' Elige uno de estos o crea el nuevo igualmente:</div>';
          data.similar.forEach(function (s) {
            var thumb = (s.logo_url || s.photo_url || '').trim();
            var img = thumb ? '<img src="' + esc(thumb) + '" alt="" style="width:20px;height:20px;object-fit:contain;border-radius:4px;background:#fff">' : '';
            html += '<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1 qc-use d-inline-flex align-items-center gap-1" data-id="' + esc(s.id) + '" data-label="' + esc(s.label || '') + '" data-logo="' + esc(thumb) + '">' + img + '<span>Usar: ' + esc(s.label || '') + '</span></button>';
          });
          html += '<button type="button" class="btn btn-sm btn-primary mb-1 qc-force">Crear igualmente</button>';
          feedback(form, html);
          return;
        }
        if (!res.ok) {
          feedback(form, '<div class="alert alert-danger py-2 mb-0">' + (data.error || 'No se pudo crear.') + '</div>');
          return;
        }
        var label = data.label || data.text || data.name || data.nick || '';
        selectInTarget(targetId, data.id, label, data.logo_url || data.photo_url || '');
        if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl).hide();
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        feedback(form, '<div class="alert alert-danger py-2 mb-0">Error de red al crear.</div>');
      });
  }


  /* ── NUEVO TERCERO: EMPRESA o PARTICULAR ────────────────────────────────────────────────────
     Los datos que hacen falta no son los mismos, así que se enseña un panel u otro.
     ⚠️ El que NO toca se DESHABILITA, no basta con esconderlo: un campo oculto se envía igual, y
     como las dos ramas comparten los nombres (`nick`, `tax_id`, la dirección fiscal) se pisarían.
     ⚠️ Y va por DELEGACIÓN: el modal se puede repintar y hay pantallas que lo incluyen dos veces. */
  function pintaTipoTercero(zona) {
    if (!zona) return;
    var elegido = zona.querySelector('input[name="kind"]:checked');
    var esEmpresa = !!elegido && (elegido.value || '') === 'empresa';
    zona.querySelectorAll('[data-qc-when]').forEach(function (panel) {
      var toca = (panel.getAttribute('data-qc-when') === (esEmpresa ? 'empresa' : 'particular'));
      panel.classList.toggle('d-none', !toca);
      panel.querySelectorAll('input,select,textarea').forEach(function (campo) {
        campo.disabled = !toca;
      });
    });
  }
  document.addEventListener('change', function (e) {
    if (!e.target || e.target.name !== 'kind') return;
    pintaTipoTercero(e.target.closest('[data-qc-promoter]'));
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     «RELLENAR MÁS CAMPOS» de un TERCERO (`_promoter_extra_fields.html`)

     Al crear un tercero se pedía lo justo y había que entrar después en su ficha. Con el botón se
     abren, uno debajo de otro, los módulos con TODO lo demás (etiquetas, alta y PRL, banco, la
     sociedad con la que factura, viaje, cómo se le avisa). Nada es obligatorio.

     ⚠️⚠️ Nacen ocultos **y DESHABILITADOS**: un campo oculto se envía igual, y sus CENTINELAS
     (`assoc_present`, `travel_prefs_present`) harían que se guardara un vacío como si se hubiera
     dicho. Esto vale para el modal de alta rápida Y para el «Nuevo tercero» de Terceros, que no es
     un `.qc-form`: por eso se inicializa por selector, no al abrir el modal.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  function mas(raiz, abierto) {
    if (!raiz) return;
    var caja = raiz.querySelector('[data-qc-more]');
    if (!caja) return;
    caja.classList.toggle('d-none', !abierto);
    caja.querySelectorAll('input,select,textarea').forEach(function (c) { c.disabled = !abierto; });
    var boton = raiz.querySelector('[data-qc-more-btn]');
    if (boton) boton.classList.toggle('d-none', !!abierto);
    caja.dataset.qcMoreOpen = abierto ? '1' : '';
  }

  function raizDe(el) { return (el && (el.closest('form') || el.closest('.modal'))) || document; }

  document.addEventListener('click', function (e) {
    var abre = e.target.closest('[data-qc-more-open]');
    if (!abre) return;
    e.preventDefault();
    mas(raizDe(abre), true);
  });

  /* ⚠️ Si lo que se escribió y NO se envió se repone (`form_autosave.js` avisa con un `input` por
     cada campo que rellena), la caja se abre sola: si no, esos datos volverían escondidos —y
     deshabilitados— y se perderían al guardar otra vez. */
  document.addEventListener('input', function (e) {
    var caja = e.target.closest && e.target.closest('[data-qc-more]');
    if (caja && !caja.dataset.qcMoreOpen) mas(raizDe(caja), true);
  });

  function arrancaMas() {
    document.querySelectorAll('[data-qc-more]').forEach(function (caja) {
      if (caja.dataset.qcMoreInit) return;
      caja.dataset.qcMoreInit = '1';
      mas(raizDe(caja), false);
    });
  }
  if (document.readyState !== 'loading') arrancaMas();
  else document.addEventListener('DOMContentLoaded', arrancaMas);
  document.addEventListener('inline:updated', arrancaMas);

  // Abrir el modal del tipo indicado
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-quick-create]');
    if (!btn) return;
    e.preventDefault();
    var type = btn.getAttribute('data-quick-create');
    currentTargetId = btn.getAttribute('data-target');
    currentTargetHiddenId = btn.getAttribute('data-target-hidden') || '';
    currentTargetPrefix = btn.getAttribute('data-target-prefix') || '';
    currentTargetGroup = btn.getAttribute('data-target-group') || '';
    var modalEl = document.getElementById('qcModal-' + type);
    if (!modalEl || !window.bootstrap) return;
    var form = modalEl.querySelector('.qc-form');
    if (form) { form.reset(); feedback(form, ''); }
    pintaTipoTercero(modalEl.querySelector('[data-qc-promoter]'));
    mas(modalEl, false);          // los módulos de más, plegados otra vez
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    var first = modalEl.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 300);
  });

  // Enviar el formulario de creación
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('.qc-form');
    if (!form) return;
    e.preventDefault();
    submitForm(form, false);
  });

  // Acciones del aviso de "ya existe algo similar"
  document.addEventListener('click', function (e) {
    var use = e.target.closest('.qc-use');
    if (use) {
      e.preventDefault();
      selectInTarget(currentTargetId, use.getAttribute('data-id'), use.getAttribute('data-label'), use.getAttribute('data-logo') || '');
      var m = use.closest('.modal');
      if (m && window.bootstrap) bootstrap.Modal.getInstance(m).hide();
      return;
    }
    var force = e.target.closest('.qc-force');
    if (force) {
      e.preventDefault();
      var form = force.closest('.qc-form');
      if (form) submitForm(form, true);
    }
  });
})();
