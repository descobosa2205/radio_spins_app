/* Asistente por pasos genérico y reutilizable (giras, ciclos/festivales, y lo que venga).
 *
 * Marca el contenedor (normalmente el <form> del modal) con [data-step-wizard] y dentro:
 *   <div class="modal-header sw-head">                       -> la cabecera ROJA de la casa, con
 *     <h5 class="modal-title"><i class="fa fa-…"></i> Título</h5>
 *     <ol class="sw-head__steps" data-sw-steps></ol>          -> UN ICONO POR PASO (lo pinta el motor)
 *     <button class="btn-close" …>
 *   <div data-sw-progress></div>                 -> se rellena con "pills" de progreso
 *   <section class="sw-step" data-step="1" data-title="Artista"> ... </section>
 *   ... (una por paso, en orden)
 *   <button data-sw-prev>  <button data-sw-next>  <button data-sw-submit>   (en el footer)
 *
 * - LA CABECERA (sep 2026): la lista `[data-sw-steps]` se pinta a partir de los pasos QUE TOCAN, con
 *   su `data-title` (o `data-sw-head`, si en la cabecera tiene que decir otra cosa) y el ICONO de su
 *   pregunta (`.sw-step__q > i`, o `data-sw-icon`). El paso activo va en blanco, los ya hechos se
 *   pueden PINCHAR para volver (hacia delante no: habría que validar lo de en medio).
 *   `window.app33WizHead` es el mismo pintor para los asistentes con motor propio (el de actividad,
 *   el de peticiones, los de invitaciones, las importaciones…), así todos se ven igual.
 * - Valida los campos [required] del paso antes de avanzar.
 * - Auto-avance: un control con [data-sw-advance] pasa al siguiente paso al cambiar (menos clics),
 *   siempre que el paso sea válido. Úsalo solo en pasos de UNA elección (artista, tipo, empresa…).
 * - Se reinicia al primer paso cada vez que se abre el modal contenedor.
 * - PASOS CONDICIONALES: un paso con [data-sw-when="EMPRESA"] (o varios valores separados por
 *   comas) solo cuenta cuando el contenedor tiene data-sw-mode con ese valor. Los pasos que no
 *   tocan se saltan, no salen en la barra de progreso ni en la cabecera y sus campos se DESHABILITAN
 *   (si no, el navegador se pararía a validar un [required] que está oculto y no llegaría a enviarse).
 *   Al cambiar el modo hay que llamar a root.swRefresh().
 */
(function () {
  /* ---------- EL PINTOR DE LA CABECERA (común a todos los asistentes de la app) ---------- */
  var ICON_SKIP = /^fa-(solid|regular|brands|light|thin|duotone|fw|lg|sm|xs|xl|2xl|\dx|spin|pulse|beat|fade|flip|shake|bounce|stack|inverse|ul|li)$/;
  function iconOf(el) {
    /* El icono de un elemento: la primera clase `fa-…` que sea un icono de verdad (no la familia ni
       un tamaño). Sirve para leerlo de la pregunta de un paso sin tener que declararlo dos veces. */
    if (!el) return '';
    var i = el.matches && el.matches('i,svg') ? el : el.querySelector('.sw-step__q i, .sw-step__q svg, .wizard-card__title i, h5 i, h6 i, i');
    if (!i) return '';
    var cls = Array.prototype.slice.call(i.classList || []);
    for (var k = 0; k < cls.length; k++) if (/^fa-/.test(cls[k]) && !ICON_SKIP.test(cls[k])) return cls[k];
    return '';
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* paint(ol, items, active, onGoto): items = [{title, icon}], active = índice del paso activo. */
  function paint(ol, items, active, onGoto) {
    if (!ol) return;
    var html = '';
    (items || []).forEach(function (it, i) {
      var cls = i === active ? ' class="is-active"' : (i < active ? ' class="is-done"' : '');
      html += '<li' + cls + ' data-sw-goto="' + i + '" title="' + esc(it.title || '') + '">' +
              '<i class="fa ' + esc(it.icon || 'fa-circle') + '"></i><span>' + esc(it.title || ('Paso ' + (i + 1))) + '</span></li>';
    });
    ol.innerHTML = html;
    if (onGoto && !ol.__swGoto) {
      ol.__swGoto = true;
      ol.addEventListener('click', function (ev) {
        var li = ev.target.closest('li.is-done'); if (!li) return;
        var fn = ol.__swGotoFn; if (fn) fn(parseInt(li.getAttribute('data-sw-goto'), 10));
      });
    }
    if (onGoto) ol.__swGotoFn = onGoto;
  }
  /* pills(box, total, active): la barra de progreso de debajo de la cabecera (las mismas pastillas). */
  function pills(box, total, active) {
    if (!box) return;
    var html = '';
    for (var i = 0; i < total; i++) html += '<span class="sw-pill' + (i === active ? ' active' : '') + (i < active ? ' done' : '') + '"></span>';
    box.innerHTML = html;
    box.classList.add('sw-progress');
  }
  /* fromSteps(ol, stepEls, activeEl): lo mismo, pero leyendo los pasos de sus propios elementos
     (`data-sw-head`/`data-title`/`data-icon` + el icono de su pregunta). Un paso sin título no cuenta. */
  function fromSteps(ol, stepEls, activeEl, onGoto) {
    var items = [], active = -1, idx = 0;
    Array.prototype.forEach.call(stepEls || [], function (s) {
      var t = s.getAttribute('data-sw-head') || s.getAttribute('data-title') || s.getAttribute('data-sw-title') || '';
      if (!t) return;
      if (s === activeEl) active = idx;
      items.push({ title: t, icon: s.getAttribute('data-sw-icon') || s.getAttribute('data-icon') || iconOf(s) || 'fa-circle', el: s });
      idx++;
    });
    paint(ol, items, active, onGoto ? function (i) { onGoto(items[i].el, i); } : null);
    return items;
  }
  window.app33WizHead = { paint: paint, pills: pills, fromSteps: fromSteps, iconOf: iconOf };

  /* ---------- EL MOTOR ---------- */
  function initWizard(root) {
    var steps = Array.prototype.slice.call(root.querySelectorAll('.sw-step'));
    if (!steps.length) return;
    steps.sort(function (a, b) { return (+a.getAttribute('data-step')) - (+b.getAttribute('data-step')); });

    var prevBtn = root.querySelector('[data-sw-prev]');
    var nextBtn = root.querySelector('[data-sw-next]');
    var submitBtn = root.querySelector('[data-sw-submit]');
    var progress = root.querySelector('[data-sw-progress]');
    // La cabecera puede estar FUERA del <form> (modal-content > modal-header + form): se busca arriba.
    var head = root.querySelector('[data-sw-steps]') || (root.closest('.modal-content') || document).querySelector('[data-sw-steps]');
    var idx = 0;

    function applicable(i) {
      // Un paso marcado con data-sw-skip no cuenta AHORA (lo pone el JS de la pantalla cuando la
      // pregunta ya está contestada: p. ej. si lo que se promociona es el propio artista, no hay que
      // volver a preguntar cuál). Es una dimensión aparte de data-sw-mode.
      if ((steps[i].getAttribute('data-sw-skip') || '').trim() === '1') return false;
      var when = (steps[i].getAttribute('data-sw-when') || '').trim();
      if (!when) return true;
      var mode = (root.getAttribute('data-sw-mode') || '').trim().toUpperCase();
      return when.toUpperCase().split(/[\s,|]+/).indexOf(mode) >= 0;
    }
    function seek(from, dir) {
      for (var i = from; i >= 0 && i < steps.length; i += dir) if (applicable(i)) return i;
      return -1;
    }
    function syncEnabled() {
      steps.forEach(function (s, i) {
        var off = !applicable(i);
        s.querySelectorAll('input, select, textarea').forEach(function (el) {
          if (off) {
            if (!el.disabled) { el.disabled = true; el.setAttribute('data-sw-off', '1'); }
          } else if (el.getAttribute('data-sw-off')) {
            el.disabled = false; el.removeAttribute('data-sw-off');
          }
        });
      });
    }

    /* ⚠️ NO SE PASA DE PASO CON ALGO SIN RELLENAR O MAL, y se VE cuál: lo comprueba el motor de la
       casa (`form_check.js`), que marca en AMARILLO lo obligatorio que falta y en ROJO lo que está
       mal y lleva el foco al primero. Antes se usaba `reportValidity()` (el bocadillo del
       navegador), que solo enseña uno y desaparece al mover el ratón. */
    function stepValid(i) {
      if (window.app33FormCheck) return window.app33FormCheck.check(steps[i]);
      var reqs = steps[i].querySelectorAll('input[required], select[required], textarea[required]');
      for (var k = 0; k < reqs.length; k++) {
        if (!reqs[k].checkValidity()) {
          if (reqs[k].reportValidity) reqs[k].reportValidity();
          return false;
        }
      }
      return true;
    }

    function render() {
      steps.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
      var primero = seek(0, 1), ultimo = seek(steps.length - 1, -1);
      if (prevBtn) prevBtn.style.display = idx === primero ? 'none' : '';
      if (nextBtn) nextBtn.style.display = idx === ultimo ? 'none' : '';
      if (submitBtn) submitBtn.style.display = idx === ultimo ? '' : 'none';
      var vivos = [], pos = 0;
      steps.forEach(function (s, i) { if (applicable(i)) { vivos.push(s); if (i === idx) pos = vivos.length - 1; } });
      if (progress) pills(progress, vivos.length, pos);
      if (head) {
        paint(head, vivos.map(function (s) {
          return { title: s.getAttribute('data-sw-head') || s.getAttribute('data-title') || '', icon: s.getAttribute('data-sw-icon') || iconOf(s) || 'fa-circle' };
        }), pos, function (k) { var s = vivos[k]; if (s) go(steps.indexOf(s)); });
      }
    }

    function go(n) {
      if (n < 0 || n >= steps.length) return;
      if (!applicable(n)) { var alt = seek(n, n >= idx ? 1 : -1); if (alt < 0) return; n = alt; }
      idx = n; render();
    }
    function next() { if (stepValid(idx)) { var n = seek(idx + 1, 1); if (n >= 0) go(n); } }
    function prev() { var n = seek(idx - 1, -1); if (n >= 0) go(n); }

    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.preventDefault(); next(); });
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.preventDefault(); prev(); });

    root.querySelectorAll('[data-sw-advance]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (idx < steps.length - 1 && stepValid(idx)) setTimeout(next, 140);
      });
    });

    var modal = root.closest('.modal');
    if (modal) modal.addEventListener('shown.bs.modal', function () { go(0); });

    // Cambiar el modo (p. ej. Empresa/Particular) obliga a recalcular qué pasos tocan.
    root.swRefresh = function () { syncEnabled(); if (!applicable(idx)) { var n = seek(idx, 1); go(n >= 0 ? n : seek(steps.length - 1, -1)); } else render(); };
    root.swGo = go;
    syncEnabled();
    go(seek(0, 1) < 0 ? 0 : seek(0, 1));
    root.__swReady = true;
  }

  function initAll() {
    document.querySelectorAll('[data-step-wizard]').forEach(function (r) { if (!r.__swReady) initWizard(r); });
  }
  /* ⚠️ Un asistente que se CREA por JavaScript (el de un punto de los horarios de la hoja de ruta)
     no existe al cargar la página, así que no pasa por `initAll`: se arranca a mano con esto. Es el
     MISMO motor, así que se comporta igual que los demás (pasos, validación, cabecera y pastillas). */
  window.app33StepWizard = { init: function (root) { if (root && !root.__swReady) initWizard(root); }, initAll: initAll };
  if (document.readyState !== 'loading') initAll();
  else document.addEventListener('DOMContentLoaded', initAll);
})();
