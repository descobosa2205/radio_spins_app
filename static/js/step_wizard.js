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
      if (prevBtn) prevBtn.style.display = idx === 0 ? 'none' : '';
      if (nextBtn) nextBtn.style.display = idx === steps.length - 1 ? 'none' : '';
      if (submitBtn) submitBtn.style.display = idx === steps.length - 1 ? '' : 'none';
      if (progress) {
        progress.innerHTML = '';
        steps.forEach(function (s, i) {
          var dot = document.createElement('span');
          dot.className = 'sw-pill' + (i === idx ? ' active' : '') + (i < idx ? ' done' : '');
          dot.title = s.getAttribute('data-title') || ('Paso ' + (i + 1));
          progress.appendChild(dot);
        });
      }
    }

    function go(n) { if (n < 0 || n >= steps.length) return; idx = n; render(); }
    function next() { if (stepValid(idx)) go(idx + 1); }
    function prev() { go(idx - 1); }

    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.preventDefault(); next(); });
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.preventDefault(); prev(); });

    root.querySelectorAll('[data-sw-advance]').forEach(function (el) {
      el.addEventListener('change', function () {
        if (idx < steps.length - 1 && stepValid(idx)) setTimeout(next, 140);
      });
    });

    var modal = root.closest('.modal');
    if (modal) modal.addEventListener('shown.bs.modal', function () { go(0); });

    go(0);
    root.__swReady = true;
  }

  function initAll() {
    document.querySelectorAll('[data-step-wizard]').forEach(function (r) { if (!r.__swReady) initWizard(r); });
  }
  if (document.readyState !== 'loading') initAll();
  else document.addEventListener('DOMContentLoaded', initAll);
})();
