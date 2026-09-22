/* HOJA DE RUTA EN CAMERINOS · el pop-up del botón «Camerinos» del panel de la hoja de ruta (sep 2026).
 *
 * En los camerinos hay pantallas (Alexa Echo Show) abiertas en `/camerinos`, y SOLO puede verse una
 * hoja de ruta en toda la casa. Este pop-up:
 *   1 · si ya se está mostrando OTRA, pregunta cuál se muestra (la de ahora o esta);
 *   2 · pregunta QUÉ hoja (general o técnica), solo si la actividad tiene las dos activas;
 *   3 · resume lo que se va a ver y lo manda. Si esta ya se está mostrando, deja también quitarla.
 * Es el asistente de la casa (`step_wizard.js`, arrancado a mano porque el contenido se crea aquí) y
 * pide el estado FRESCO al abrirse: lo que se muestra puede haberlo cambiado otra persona.
 * ⚠️ Todo por DELEGACIÓN en `document` (el panel de la hoja de ruta se repinta) y el `.modal-content`
 * se REHACE en cada apertura (si no, el motor se queda con listeners de pasos que ya no existen).
 */
(function () {
  'use strict';
  var ID = 'rmCamModal';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function el(html) { var d = document.createElement('div'); d.innerHTML = String(html || '').trim(); return d.firstElementChild; }
  function bs(m) { return (window.bootstrap && window.bootstrap.Modal) ? window.bootstrap.Modal.getOrCreateInstance(m) : null; }

  function ensureModal() {
    var m = document.getElementById(ID);
    if (!m) {
      m = el('<div class="modal fade" id="' + ID + '" tabindex="-1" aria-hidden="true">'
        + '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"><form class="modal-content" autocomplete="off"></form></div></div>');
      document.body.appendChild(m);
    }
    return m;
  }
  /* El `.modal-content` nuevo de cada apertura (un <form>, que es lo que arranca el motor). */
  function contenidoNuevo(m) {
    var viejo = m.querySelector('.modal-content');
    var nuevo = document.createElement('form');
    nuevo.className = 'modal-content';
    nuevo.setAttribute('autocomplete', 'off');
    viejo.parentNode.replaceChild(nuevo, viejo);
    return nuevo;
  }
  function cabecera(titulo, conPasos) {
    return '<div class="modal-header sw-head"><h5 class="modal-title"><i class="fa fa-tv me-2"></i>' + esc(titulo) + '</h5>'
      + (conPasos ? '<ol class="sw-head__steps" data-sw-steps></ol>' : '')
      + '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>';
  }
  function q(icon, txt, hint) {
    return '<div class="sw-step__q"><i class="fa ' + esc(icon) + ' me-2"></i>' + esc(txt) + '</div>'
      + (hint ? '<div class="sw-step__h">' + hint + '</div>' : '');
  }
  /* La TARJETA de una actividad: su foto, qué es, de quién, cuándo y dónde. */
  function tarjeta(c, etiqueta) {
    if (!c) return '';
    var vis = c.photo ? '<img src="' + esc(c.photo) + '" alt="">' : '<span class="cam-card__ico"><i class="fa fa-star"></i></span>';
    var linea1 = [c.word, c.title].filter(Boolean).join(' · ');
    var linea2 = [c.subtitle, c.venue_short].filter(Boolean).join(' · ');
    return '<div class="cam-card">' + vis + '<div class="min-w-0">'
      + (etiqueta ? '<div class="cam-card__lbl">' + esc(etiqueta) + '</div>' : '')
      + '<div class="cam-card__t">' + esc(linea1) + '</div>'
      + (linea2 ? '<div class="cam-card__s">' + esc(linea2) + '</div>' : '')
      + (c.date ? '<div class="cam-card__s"><i class="fa fa-calendar-day me-1"></i>' + esc(c.date) + '</div>' : '')
      + '</div></div>';
  }
  function pick(o) {
    return '<label class="promo-pick' + (o.cls ? ' ' + esc(o.cls) : '') + '"><input type="radio" name="' + esc(o.name) + '" value="' + esc(o.value) + '"'
      + (o.checked ? ' checked' : '') + (o.advance ? ' data-sw-advance' : '') + '>'
      + '<span class="promo-pick__box">' + (o.html || ('<i class="fa ' + esc(o.icon || 'fa-circle') + '"></i><span class="promo-pick__name">' + esc(o.label) + '</span>'
      + (o.hint ? '<span class="promo-pick__hint">' + esc(o.hint) + '</span>' : ''))) + '</span></label>';
  }
  function urlPantalla(url) {
    return '<div class="cam-url mt-3"><i class="fa fa-link text-muted"></i><span class="min-w-0 text-truncate">' + esc(url) + '</span>'
      + '<button type="button" class="btn btn-sm btn-outline-secondary ms-auto" data-cam-copy="' + esc(url) + '" title="Copiar el enlace"><i class="fa fa-copy"></i></button>'
      + '<a class="btn btn-sm btn-outline-secondary" href="' + esc(url) + '" target="_blank" rel="noopener" title="Abrir la pantalla"><i class="fa fa-arrow-up-right-from-square"></i></a></div>';
  }

  function cargando(form) {
    form.innerHTML = cabecera('Hoja de ruta en camerinos', false)
      + '<div class="modal-body text-center text-muted py-5"><i class="fa fa-circle-notch fa-spin me-2"></i>Mirando qué se está mostrando…</div>';
  }
  function fallo(form, msg) {
    form.innerHTML = cabecera('Hoja de ruta en camerinos', false)
      + '<div class="modal-body"><div class="alert alert-danger mb-0">' + esc(msg || 'No se pudo consultar el estado de los camerinos.') + '</div></div>'
      + '<div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button></div>';
  }
  /* El resultado de una acción: qué se ve ahora en camerinos (o que ya no se ve nada). */
  function resultado(form, resp, btn) {
    var activo = resp && resp.active;
    var url = (resp && resp.screen_url) || btn.getAttribute('data-cam-screen-url') || '';
    var h = cabecera('Hoja de ruta en camerinos', false) + '<div class="modal-body">';
    h += '<div class="alert ' + (activo ? 'alert-success' : 'alert-light border') + ' d-flex align-items-start gap-2 mb-3">'
      + '<i class="fa ' + (activo ? 'fa-circle-check' : 'fa-circle-info') + ' mt-1"></i><div>' + esc((resp && resp.message) || '') + '</div></div>';
    if (activo) h += tarjeta(activo, 'Se ve ahora en camerinos · ' + (activo.kind_label || ''));
    h += urlPantalla(url);
    h += '</div><div class="modal-footer"><button type="button" class="btn btn-danger" data-bs-dismiss="modal">Cerrar</button></div>';
    form.innerHTML = h;
    // El botón del panel se queda con el estado nuevo (pintado como lo pinta el servidor).
    var esEsta = !!(activo && activo.is_this);
    btn.classList.toggle('is-on', esEsta);
    btn.setAttribute('title', esEsta ? ('Se está mostrando en camerinos (' + String(activo.kind_label || '').toLowerCase() + ')') : 'Mostrar en camerinos');
  }

  function pintar(form, btn, st) {
    var otra = (st.active && !st.active.is_this) ? st.active : null;
    var esta = (st.active && st.active.is_this) ? st.active : null;
    var kinds = st.kinds || [];
    var kindSel = esta ? esta.kind : (kinds[0] ? kinds[0].key : 'GENERAL');
    var url = st.screen_url || btn.getAttribute('data-cam-screen-url') || '';
    var h = cabecera('Hoja de ruta en camerinos', true) + '<div class="modal-body"><div data-sw-progress></div>';

    // 1 · ¿CUÁL? Solo cuando ya se está mostrando otra: no puede haber dos.
    h += '<section class="sw-step" data-step="1" data-title="Cuál"' + (otra ? '' : ' data-sw-skip="1"') + '>'
      + q('fa-tv', 'Ya se está mostrando otra hoja de ruta en camerinos', 'Solo puede verse una. ¿Cuál quieres que se muestre?')
      + '<div class="promo-pick-grid promo-pick-grid--wide cam-which">'
      + pick({ name: 'cam_which', value: 'THIS', checked: true, advance: true, html: tarjeta(st['this'], 'Esta actividad') })
      + pick({ name: 'cam_which', value: 'KEEP', advance: true, html: tarjeta(otra, 'La que se ve ahora' + (otra && otra.kind_label ? ' · ' + otra.kind_label : '')) })
      + '</div></section>';

    // 2 · ¿QUÉ HOJA? Solo con las dos activas en la actividad.
    h += '<section class="sw-step" data-step="2" data-title="Qué hoja"' + (kinds.length > 1 ? '' : ' data-sw-skip="1"') + '>'
      + q('fa-route', '¿Qué hoja de ruta se muestra?', 'La pantalla enseña solo los <b>horarios</b> de esa hoja, como en su enlace compartido: sin contactos, notas ni adjuntos.')
      + '<div class="promo-pick-grid promo-pick-grid--wide">'
      + kinds.map(function (k) { return pick({ name: 'cam_kind', value: k.key, checked: k.key === kindSel, advance: true, icon: k.icon, label: k.label }); }).join('')
      + '</div></section>';

    // 3 · LISTO: lo que se va a ver.
    h += '<section class="sw-step" data-step="3" data-title="Listo">'
      + q('fa-tv', esta ? 'Esta actividad ya se ve en camerinos' : 'Se mostrará en camerinos',
          'En todas las pantallas que tengan abierta esa dirección. Se actualizan solas cuando cambie la hoja de ruta.')
      + '<div class="cam-summary border rounded-3 p-3 bg-white">' + tarjeta(st['this'], '') + '<div class="mt-2"><span class="rm-tag sheet"><i class="fa fa-route"></i> <span data-cam-kind-label>' + esc((kinds.filter(function (k) { return k.key === kindSel; })[0] || {}).label || '') + '</span></span></div></div>'
      + urlPantalla(url)
      + '</section>';

    h += '</div><div class="modal-footer">'
      + '<button type="button" class="btn btn-link" data-sw-prev>Atrás</button>'
      + (esta ? '<button type="button" class="btn btn-outline-danger me-auto" data-cam-stop><i class="fa fa-eye-slash me-1"></i>Dejar de mostrar</button>' : '')
      + '<button type="button" class="btn btn-outline-secondary" data-sw-next>Siguiente</button>'
      + '<button type="submit" class="btn btn-danger" data-sw-submit><i class="fa fa-tv me-1"></i>' + (esta ? 'Cambiar la hoja' : 'Mostrar en camerinos') + '</button>'
      + '</div>';
    form.innerHTML = h;
    form.setAttribute('data-step-wizard', '');
    if (window.app33StepWizard) window.app33StepWizard.init(form);

    // El nombre de la hoja del resumen sigue a lo que se marque.
    form.addEventListener('change', function (ev) {
      var r = ev.target;
      if (r.name === 'cam_kind') {
        var lbl = form.querySelector('[data-cam-kind-label]');
        var k = kinds.filter(function (x) { return x.key === r.value; })[0];
        if (lbl && k) lbl.textContent = k.label;
      }
      // «La que se ve ahora»: no hay nada que cambiar, se dice y ya.
      if (r.name === 'cam_which' && r.value === 'KEEP') {
        resultado(form, { active: otra, screen_url: url, message: 'Sin cambios: en camerinos se sigue viendo la de ' + (otra ? otra.title : 'antes') + '.' }, btn);
      }
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      var kindInput = form.querySelector('input[name="cam_kind"]:checked');
      enviar(form, btn, { action: 'show', kind: kindInput ? kindInput.value : kindSel });
    });
    var stop = form.querySelector('[data-cam-stop]');
    if (stop) stop.addEventListener('click', function () { enviar(form, btn, { action: 'stop' }); });
  }

  function enviar(form, btn, body) {
    var botones = form.querySelectorAll('.modal-footer button');
    botones.forEach(function (b) { b.disabled = true; });
    fetch(btn.getAttribute('data-cam-set-url'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (resp) {
        if (!resp || !resp.ok) { botones.forEach(function (b) { b.disabled = false; }); fallo(form, (resp && resp.error) || 'No se pudo cambiar lo que se muestra en camerinos.'); return; }
        resultado(form, resp, btn);
      })
      .catch(function () { botones.forEach(function (b) { b.disabled = false; }); fallo(form, 'No hay conexión con el servidor.'); });
  }

  function abrir(btn) {
    var m = ensureModal();
    var form = contenidoNuevo(m);
    cargando(form);
    var inst = bs(m); if (inst) inst.show();
    fetch(btn.getAttribute('data-cam-state-url'), { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (st) { if (!st || !st.ok) { fallo(form, st && st.error); return; } pintar(form, btn, st); })
      .catch(function () { fallo(form); });
  }

  document.addEventListener('click', function (e) {
    var copiar = e.target.closest('[data-cam-copy]');
    if (copiar) {
      e.preventDefault();
      var txt = copiar.getAttribute('data-cam-copy') || '';
      var listo = function () { copiar.innerHTML = '<i class="fa fa-check"></i>'; setTimeout(function () { copiar.innerHTML = '<i class="fa fa-copy"></i>'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(listo, listo); else { try { window.prompt('Copia el enlace', txt); } catch (_) {} }
      return;
    }
    var b = e.target.closest('[data-cam-open]');
    if (!b) return;
    e.preventDefault();
    abrir(b);
  });
})();
