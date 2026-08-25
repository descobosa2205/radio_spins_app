/* ============================================================================================
   PROYECTOS DISCOGRÁFICOS · el motor de los POP-UPS por pasos.
   · `data-dp-when="campo=VALOR[,VALOR2]"` → el panel se ve solo con esa elección, y lo que se
     esconde se DESHABILITA (un campo oculto se envía igual, y un `required` invisible impide enviar).
   · `data-dp-mirror="campo"` → un oculto que ESPEJA el radio de las tarjetas, para que al servidor le
     llegue el valor con el nombre que espera.
   · `[data-dp-add-other]` → añade otra fila de «Otra» creatividad.
   ⚠️ Todo por DELEGACIÓN en el documento: estos pop-ups se pintan con la página, pero un `change` de
   Select2 o del ayudante de tarjetas puede llegar en cualquier momento.
   ============================================================================================ */
/* Paneles que dependen de una elección (`data-dp-when="campo=VALOR[,VALOR2]"`) + los ocultos que
   ESPEJAN el radio de las tarjetas (`data-dp-mirror="campo"`), para que al servidor le llegue el
   valor con el nombre que espera.
   ⚠️ Va por DELEGACIÓN en el documento: estos modales se pintan con la página, pero un `change` de
   Select2 o del ayudante de tarjetas puede llegar en cualquier momento. */
(function () {
  function valorDe(nombre, raiz) {
    var el = (raiz || document).querySelector('input[name="' + nombre + '"]:checked');
    return el ? (el.value || '') : '';
  }
  function sincroniza(raiz) {
    var ambito = raiz || document;
    ambito.querySelectorAll('[data-dp-mirror]').forEach(function (h) {
      var v = valorDe(h.dataset.dpMirror, h.closest('form') || document);
      if (v !== '') h.value = v;
    });
    ambito.querySelectorAll('[data-dp-when]').forEach(function (panel) {
      var partes = (panel.dataset.dpWhen || '').split('=');
      var nombre = (partes[0] || '').trim();
      var quiere = (partes[1] || '').split(',').map(function (x) { return x.trim(); });
      var actual = valorDe(nombre, panel.closest('form') || document);
      var visible = quiere.indexOf(actual) >= 0;
      panel.classList.toggle('d-none', !visible);
      // ⚠️ Un campo OCULTO se envía igual: se deshabilita para que no llegue al servidor (y un
      // `required` invisible no impida enviar el formulario).
      panel.querySelectorAll('input,select,textarea').forEach(function (i) { i.disabled = !visible; });
    });
  }
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.matches('input[type="radio"]')) sincroniza(document);
  });
  // «Añadir otra» creatividad: clona la fila vacía (se pueden añadir varias).
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest('[data-dp-add-other]');
    if (!btn) return;
    var zona = document.querySelector('[data-dp-others]');
    if (!zona || !zona.firstElementChild) return;
    var fila = zona.firstElementChild.cloneNode(true);
    fila.querySelectorAll('input').forEach(function (i) { i.value = ''; });
    zona.appendChild(fila);
  });
  document.addEventListener('DOMContentLoaded', function () { sincroniza(document); });
  if (document.readyState !== 'loading') sincroniza(document);
  // Al abrir un modal se vuelve a sincronizar (por si se pintó oculto).
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('show.bs.modal', function () { setTimeout(function () { sincroniza(m); }, 0); });
  });
})();
