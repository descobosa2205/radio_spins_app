/* HOJA DE RUTA EN CAMERINOS · el pop-up del botón «Camerinos» del panel de la hoja de ruta (sep 2026).
 *
 * En los camerinos hay pantallas (Alexa Echo Show) abiertas en `/camerinos`, y SOLO puede verse una
 * hoja de ruta en toda la casa. Este pop-up tiene dos partes:
 *   · QUÉ SE VE (el asistente de la casa): 1 · si ya se está mostrando OTRA, cuál se muestra;
 *     2 · QUÉ hoja (general o técnica), solo si la actividad tiene las dos; 3 · el resumen. Si esta
 *     ya se está mostrando, deja también quitarla.
 *   · AVISOS (la campanita): se escribe un aviso —o se toca un AVISO RÁPIDO preguardado, que se manda
 *     sin escribir nada— y en todas las pantallas sale una nota en medio, suena la campana y se lee
 *     en voz alta. Se ve en cuántas pantallas se ha visto, se retira y se edita la lista de rápidos.
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
  function getJson(url) {
    return fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function postJson(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  /* Las URLs de los AVISOS salen de la del botón: una sola base, `/hoja-ruta/<tipo>/<id>/camerinos`. */
  function urls(btn) {
    var base = btn.getAttribute('data-cam-set-url') || '';
    return { state: btn.getAttribute('data-cam-state-url') || base, set: base, avisos: base + '/avisos', aviso: base + '/aviso',
             retirar: base + '/aviso/retirar', rapidos: base + '/avisos-rapidos' };
  }

  var avTimer = null;
  function pararAvisos() { if (avTimer) { clearInterval(avTimer); avTimer = null; } }

  function ensureModal() {
    var m = document.getElementById(ID);
    if (!m) {
      m = el('<div class="modal fade" id="' + ID + '" tabindex="-1" aria-hidden="true">'
        + '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"><form class="modal-content" autocomplete="off"></form></div></div>');
      document.body.appendChild(m);
      m.addEventListener('hidden.bs.modal', pararAvisos);
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
  function cabecera(titulo, conPasos, icono) {
    return '<div class="modal-header sw-head"><h5 class="modal-title"><i class="fa ' + esc(icono || 'fa-tv') + ' me-2"></i>' + esc(titulo) + '</h5>'
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

  function cargando(form, texto) {
    form.innerHTML = cabecera('Hoja de ruta en camerinos', false)
      + '<div class="modal-body text-center text-muted py-5"><i class="fa fa-circle-notch fa-spin me-2"></i>' + esc(texto || 'Mirando qué se está mostrando…') + '</div>';
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

  /* ═══════════════════════════════ QUÉ SE VE (el asistente) ═══════════════════════════════ */
  function pintar(form, btn, st) {
    pararAvisos();
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

    var nAvisos = (st.notices && st.notices.screens) ? st.notices.screens.online : 0;
    h += '</div><div class="modal-footer">'
      + '<button type="button" class="btn btn-outline-secondary me-auto" data-cam-avisos title="Mandar un aviso a las pantallas"><i class="fa fa-bell me-1"></i>Avisos'
      + (nAvisos ? ' <span class="badge text-bg-success ms-1" title="Pantallas conectadas">' + nAvisos + '</span>' : '') + '</button>'
      + '<button type="button" class="btn btn-link" data-sw-prev>Atrás</button>'
      + (esta ? '<button type="button" class="btn btn-outline-danger" data-cam-stop><i class="fa fa-eye-slash me-1"></i>Dejar de mostrar</button>' : '')
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
    var avisos = form.querySelector('[data-cam-avisos]');
    if (avisos) avisos.addEventListener('click', function () { pintarAvisos(form, btn, st); });
  }

  function enviar(form, btn, body) {
    var botones = form.querySelectorAll('.modal-footer button');
    botones.forEach(function (b) { b.disabled = true; });
    postJson(btn.getAttribute('data-cam-set-url'), body)
      .then(function (resp) {
        if (!resp || !resp.ok) { botones.forEach(function (b) { b.disabled = false; }); fallo(form, (resp && resp.error) || 'No se pudo cambiar lo que se muestra en camerinos.'); return; }
        resultado(form, resp, btn);
      })
      .catch(function () { botones.forEach(function (b) { b.disabled = false; }); fallo(form, 'No hay conexión con el servidor.'); });
  }

  /* ═══════════════════════════════ AVISOS (la campanita) ═══════════════════════════════ */
  function pantallasTag(av) {
    var n = (av.screens && av.screens.online) || 0;
    if (!n) return '<span class="rm-tag warn" data-av-online><i class="fa fa-tv"></i> Ninguna pantalla conectada</span>';
    return '<span class="rm-tag ok" data-av-online><i class="fa fa-tv"></i> ' + n + ' pantalla' + (n === 1 ? '' : 's') + ' conectada' + (n === 1 ? '' : 's') + '</span>';
  }
  function activoHtml(av) {
    var a = av.active;
    if (!a) return '<div class="text-muted small" data-av-active>Ahora no hay ningún aviso en las pantallas.</div>';
    var vistos = (a.seen == null) ? '' : ('Visto en ' + a.seen + ' de ' + (a.screens || 0) + ' pantalla' + (a.screens === 1 ? '' : 's'));
    return '<div class="cam-av-active" data-av-active><i class="fa fa-bell text-danger mt-1"></i><div class="min-w-0 flex-grow-1">'
      + '<div class="cam-av-active__t">' + esc(a.text) + '</div>'
      + '<div class="cam-av-active__s">' + esc([a.sent_at_label ? 'Mandado a las ' + a.sent_at_label : '', a.sent_by, a.expires_label ? 'hasta las ' + a.expires_label : '', a.speak ? 'se lee en voz alta' : 'sin voz', vistos].filter(Boolean).join(' · ')) + '</div>'
      + '</div><button type="button" class="btn btn-sm btn-outline-danger flex-shrink-0" data-av-withdraw="' + esc(a.id) + '"><i class="fa fa-eye-slash me-1"></i>Retirar</button></div>';
  }
  function presetsHtml(av, editando) {
    var lista = av.presets || [];
    var h = '';
    if (!lista.length) h += '<div class="text-muted small">No hay avisos rápidos guardados.</div>';
    lista.forEach(function (t, i) {
      if (editando) h += '<span class="cam-av-preset cam-av-preset--edit"><span>' + esc(t) + '</span><button type="button" class="cam-av-x" data-av-del="' + i + '" title="Quitar de la lista">&times;</button></span>';
      else h += '<button type="button" class="cam-av-preset" data-av-preset="' + esc(t) + '" title="Mandar este aviso ahora"><i class="fa fa-bell"></i><span>' + esc(t) + '</span></button>';
    });
    if (editando) {
      h += '<div class="d-flex gap-2 w-100 mt-1"><input class="form-control form-control-sm" maxlength="' + (av.max_chars || 240) + '" placeholder="Otro aviso rápido…" data-av-new>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-av-add><i class="fa fa-plus me-1"></i>Añadir</button>'
        + '<button type="button" class="btn btn-sm btn-danger" data-av-edit-done>Listo</button></div>';
    }
    return h;
  }
  function historialHtml(av) {
    var lista = av.history || [];
    if (!lista.length) return '<div data-av-history></div>';
    return '<div data-av-history><div class="small fw-bold text-muted mt-3 mb-1">Últimos avisos</div><ul class="list-unstyled cam-av-hist mb-0">'
      + lista.map(function (n) { return '<li>' + esc(n.sent_at_label || '') + ' · <span class="cam-av-hist__t">' + esc(n.text) + '</span>' + (n.sent_by ? ' · ' + esc(n.sent_by) : '') + (n.withdrawn ? ' · retirado' : '') + '</li>'; }).join('')
      + '</ul></div>';
  }
  function minutosHtml(av) {
    var ops = av.minutes_options || [5, 10, 30, 0], def = av.default_minutes || 10;
    return ops.map(function (m) { return '<option value="' + m + '"' + (m === def ? ' selected' : '') + '>' + (m ? m + ' min' : 'hasta que se retire') + '</option>'; }).join('');
  }

  function pintarAvisos(form, btn, st) {
    var U = urls(btn);
    pararAvisos();
    cargando(form, 'Mirando las pantallas…');
    getJson(U.avisos).then(function (av) {
      if (!av || !av.ok) { fallo(form, (av && av.error) || 'No se pudo consultar los avisos.'); return; }
      renderAvisos(form, btn, st, av);
      avTimer = setInterval(function () { refrescar(form, U); }, 4000);
    }).catch(function () { fallo(form, 'No hay conexión con el servidor.'); });
  }

  function renderAvisos(form, btn, st, av) {
    var seVe = st && st.active ? [st.active.word, st.active.title].filter(Boolean).join(' · ') : '';
    var max = av.max_chars || 240;
    var h = cabecera('Avisos a las pantallas', false, 'fa-bell') + '<div class="modal-body">';
    h += '<div class="cam-av-top">' + pantallasTag(av)
      + (seVe ? '<span class="text-muted small"><i class="fa fa-tv me-1"></i>Se ve ahora: ' + esc(seVe) + '</span>' : '<span class="text-muted small">Ahora no se ve ninguna hoja de ruta en camerinos.</span>')
      + '</div>';
    h += '<div class="alert alert-success py-2 d-none" data-av-flash></div>';
    h += activoHtml(av);
    h += '<div class="mt-3">' + q('fa-bolt', 'Avisos rápidos', 'Un toque y se manda a todas las pantallas, con la campana y leído en voz alta. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-av-edit>Editar la lista</button>') + '</div>';
    h += '<div class="cam-av-presets" data-av-presets>' + presetsHtml(av, false) + '</div>';
    h += '<div class="mt-3">' + q('fa-pen', 'Escribir un aviso', '') + '</div>';
    h += '<textarea class="form-control" rows="2" maxlength="' + max + '" data-av-text placeholder="Lo que tiene que salir en las pantallas"></textarea>';
    h += '<div class="d-flex flex-wrap gap-3 align-items-center mt-2 small">'
      + '<span class="text-muted"><span data-av-count>0</span>/' + max + '</span>'
      + '<label class="form-check mb-0 d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input mt-0" data-av-speak checked> Leer en voz alta</label>'
      + '<label class="d-flex align-items-center gap-1 mb-0">Se queda <select class="form-select form-select-sm w-auto" data-av-minutes>' + minutosHtml(av) + '</select></label>'
      + '<label class="form-check mb-0 d-flex align-items-center gap-1"><input type="checkbox" class="form-check-input mt-0" data-av-save> Guardar como aviso rápido</label>'
      + '</div>';
    h += '<div class="mt-2"><button type="button" class="btn btn-danger" data-av-send><i class="fa fa-bell me-1"></i>Mandar a las pantallas</button></div>';
    h += historialHtml(av);
    h += '</div><div class="modal-footer">'
      + '<button type="button" class="btn btn-link me-auto" data-av-back><i class="fa fa-arrow-left me-1"></i>Qué se ve en camerinos</button>'
      + '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button></div>';
    form.innerHTML = h;
    form.__av = av;
    form.__editando = false;
    form.addEventListener('submit', function (ev) { ev.preventDefault(); ev.stopImmediatePropagation(); });
    var ta = form.querySelector('[data-av-text]'), cnt = form.querySelector('[data-av-count]');
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length; });
    form.addEventListener('click', function (ev) { clicAvisos(ev, form, btn, st); });
  }

  function opciones(form) {
    var sp = form.querySelector('[data-av-speak]'), mn = form.querySelector('[data-av-minutes]');
    return { speak: sp ? sp.checked : true, minutes: mn ? parseInt(mn.value, 10) : 10 };
  }
  function flash(form, texto, ok) {
    var f = form.querySelector('[data-av-flash]'); if (!f) return;
    f.className = 'alert py-2 ' + (ok ? 'alert-success' : 'alert-danger');
    f.innerHTML = '<i class="fa ' + (ok ? 'fa-circle-check' : 'fa-triangle-exclamation') + ' me-1"></i>' + esc(texto);
    f.classList.remove('d-none');
  }
  /* Lo que cambia con el tiempo (el aviso vivo y las pantallas) se repinta; lo que se está
     escribiendo, no. */
  function aplicar(form, av) {
    form.__av = av;
    var tag = form.querySelector('[data-av-online]'); if (tag) tag.outerHTML = pantallasTag(av);
    var act = form.querySelector('[data-av-active]'); if (act) act.outerHTML = activoHtml(av);
    var hist = form.querySelector('[data-av-history]'); if (hist) hist.outerHTML = historialHtml(av);
    if (!form.__editando) { var pr = form.querySelector('[data-av-presets]'); if (pr) pr.innerHTML = presetsHtml(av, false); }
  }
  function refrescar(form, U) {
    if (!document.body.contains(form)) { pararAvisos(); return; }
    getJson(U.avisos).then(function (av) { if (av && av.ok) aplicar(form, av); }).catch(function () {});
  }
  function mandar(form, btn, body) {
    var U = urls(btn);
    var botones = form.querySelectorAll('[data-av-send], [data-av-preset]');
    botones.forEach(function (b) { b.disabled = true; });
    postJson(U.aviso, body).then(function (resp) {
      botones.forEach(function (b) { b.disabled = false; });
      if (!resp || !resp.ok) { flash(form, (resp && resp.error) || 'No se pudo mandar el aviso.', false); return; }
      aplicar(form, resp);
      flash(form, resp.message || 'Aviso enviado.', true);
      var ta = form.querySelector('[data-av-text]'), cnt = form.querySelector('[data-av-count]'), sv = form.querySelector('[data-av-save]');
      if (ta) { ta.value = ''; } if (cnt) cnt.textContent = '0'; if (sv) sv.checked = false;
    }).catch(function () { botones.forEach(function (b) { b.disabled = false; }); flash(form, 'No hay conexión con el servidor.', false); });
  }
  function clicAvisos(ev, form, btn, st) {
    var U = urls(btn), t = ev.target;
    var preset = t.closest('[data-av-preset]');
    if (preset) { ev.preventDefault(); var o = opciones(form); mandar(form, btn, { text: preset.getAttribute('data-av-preset'), speak: o.speak, minutes: o.minutes }); return; }
    if (t.closest('[data-av-send]')) {
      ev.preventDefault();
      var ta = form.querySelector('[data-av-text]'), o2 = opciones(form), sv = form.querySelector('[data-av-save]');
      var texto = (ta.value || '').trim();
      if (!texto) { flash(form, 'Escribe el aviso (o toca uno de los avisos rápidos).', false); ta.focus(); return; }
      mandar(form, btn, { text: texto, speak: o2.speak, minutes: o2.minutes, save_preset: !!(sv && sv.checked) });
      return;
    }
    var ret = t.closest('[data-av-withdraw]');
    if (ret) {
      ev.preventDefault(); ret.disabled = true;
      postJson(U.retirar, { id: ret.getAttribute('data-av-withdraw') }).then(function (resp) {
        if (!resp || !resp.ok) { ret.disabled = false; flash(form, (resp && resp.error) || 'No se pudo retirar el aviso.', false); return; }
        aplicar(form, resp); flash(form, resp.message || 'Aviso retirado.', true);
      }).catch(function () { ret.disabled = false; flash(form, 'No hay conexión con el servidor.', false); });
      return;
    }
    if (t.closest('[data-av-edit]')) { ev.preventDefault(); form.__editando = true; form.querySelector('[data-av-presets]').innerHTML = presetsHtml(form.__av || {}, true); return; }
    if (t.closest('[data-av-edit-done]')) { ev.preventDefault(); form.__editando = false; form.querySelector('[data-av-presets]').innerHTML = presetsHtml(form.__av || {}, false); return; }
    var del = t.closest('[data-av-del]');
    if (del) {
      ev.preventDefault();
      var lista = (form.__av && form.__av.presets || []).slice(); lista.splice(parseInt(del.getAttribute('data-av-del'), 10), 1);
      guardarRapidos(form, btn, lista); return;
    }
    if (t.closest('[data-av-add]')) {
      ev.preventDefault();
      var inp = form.querySelector('[data-av-new]'); var nuevo = (inp && inp.value || '').trim();
      if (!nuevo) { if (inp) inp.focus(); return; }
      guardarRapidos(form, btn, (form.__av && form.__av.presets || []).concat([nuevo])); return;
    }
    if (t.closest('[data-av-back]')) {
      ev.preventDefault(); pararAvisos(); cargando(form);
      getJson(U.state).then(function (st2) { if (!st2 || !st2.ok) { fallo(form, st2 && st2.error); return; } pintar(form, btn, st2); }).catch(function () { fallo(form); });
    }
  }
  function guardarRapidos(form, btn, lista) {
    var U = urls(btn);
    postJson(U.rapidos, { presets: lista }).then(function (resp) {
      if (!resp || !resp.ok) { flash(form, (resp && resp.error) || 'No se pudo guardar la lista.', false); return; }
      form.__av = resp;
      form.querySelector('[data-av-presets]').innerHTML = presetsHtml(resp, form.__editando);
      var inp = form.querySelector('[data-av-new]'); if (inp) inp.focus();
    }).catch(function () { flash(form, 'No hay conexión con el servidor.', false); });
  }

  /* ═══════════════════════════════ ABRIR ═══════════════════════════════ */
  function abrir(btn) {
    var m = ensureModal();
    var form = contenidoNuevo(m);
    cargando(form);
    var inst = bs(m); if (inst) inst.show();
    getJson(urls(btn).state)
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
