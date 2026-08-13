/* Asistente por pasos genérico y reutilizable (giras, ciclos/festivales, y lo que venga).
 *
 * Marca el contenedor (normalmente el <form> del modal) con [data-step-wizard] y dentro:
 *   <div data-sw-progress></div>                 -> se rellena con "pills" de progreso
 *   <section class="sw-step" data-step="1" data-title="Artista"> ... </section>
 *   ... (una por paso, en orden)
 *   <button data-sw-prev>  <button data-sw-next>  <button data-sw-submit>   (en el footer)
 *
 * - Valida los campos [required] del paso antes de avanzar.
 * - Auto-avance: un control con [data-sw-advance] pasa al siguiente paso al cambiar (menos clics),
 *   siempre que el paso sea válido. Úsalo solo en pasos de UNA elección (artista, tipo, empresa…).
 * - Se reinicia al primer paso cada vez que se abre el modal contenedor.
 * - PASOS CONDICIONALES: un paso con [data-sw-when="EMPRESA"] (o varios valores separados por
 *   comas) solo cuenta cuando el contenedor tiene data-sw-mode con ese valor. Los pasos que no
 *   tocan se saltan, no salen en la barra de progreso y sus campos se DESHABILITAN (si no, el
 *   navegador se pararía a validar un [required] que está oculto y no llegaría a enviarse nunca).
 *   Al cambiar el modo hay que llamar a root.swRefresh().
 */
(function () {
  function initWizard(root) {
    var steps = Array.prototype.slice.call(root.querySelectorAll('.sw-step'));
    if (!steps.length) return;
    steps.sort(function (a, b) { return (+a.getAttribute('data-step')) - (+b.getAttribute('data-step')); });

    var prevBtn = root.querySelector('[data-sw-prev]');
    var nextBtn = root.querySelector('[data-sw-next]');
    var submitBtn = root.querySelector('[data-sw-submit]');
    var progress = root.querySelector('[data-sw-progress]');
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

    function stepValid(i) {
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
      if (progress) {
        progress.innerHTML = '';
        steps.forEach(function (s, i) {
          if (!applicable(i)) return;                 // los pasos que no tocan no se cuentan
          var dot = document.createElement('span');
          dot.className = 'sw-pill' + (i === idx ? ' active' : '') + (i < idx ? ' done' : '');
          dot.title = s.getAttribute('data-title') || ('Paso ' + (i + 1));
          progress.appendChild(dot);
        });
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
  if (document.readyState !== 'loading') initAll();
  else document.addEventListener('DOMContentLoaded', initAll);
})();
