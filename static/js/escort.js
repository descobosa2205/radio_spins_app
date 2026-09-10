/* QUIÉN VA CON EL ARTISTA · los paneles del pop-up (`_escort_modal.html`).
   Al elegir «alguien de la empresa» o «un tercero» se enseña solo su panel.
   ⚠️ Por DELEGACIÓN en `document`: este pop-up vive en la ficha de una actividad y en la de una
   promoción, y esas zonas se repintan por AJAX (un listener pegado a los nodos se quedaría muerto).
   ⚠️⚠️ El panel que se esconde se DESHABILITA: un campo oculto se envía igual, y con los dos a la
   vez el servidor se quedaría con el de la elección que NO se ha hecho. */
(function () {
  function aplica(form) {
    if (!form) return;
    var elegido = form.querySelector('[data-escort-kind]:checked');
    var kind = elegido ? elegido.value : 'NONE';
    form.querySelectorAll('[data-escort-panel]').forEach(function (panel) {
      var suyo = panel.getAttribute('data-escort-panel') === kind;
      panel.classList.toggle('d-none', !suyo);
      panel.querySelectorAll('select,input').forEach(function (campo) { campo.disabled = !suyo; });
    });
  }
  document.addEventListener('change', function (ev) {
    var radio = ev.target.closest && ev.target.closest('[data-escort-kind]');
    if (radio) aplica(radio.closest('form'));
  });
  /* Al abrir el pop-up y cada vez que su zona se repinta. */
  function repasa() {
    document.querySelectorAll('[data-escort-panel]').forEach(function (p) {
      var f = p.closest('form');
      if (f && !f.dataset.escortReady) { f.dataset.escortReady = '1'; aplica(f); }
    });
  }
  document.addEventListener('DOMContentLoaded', repasa);
  document.addEventListener('inline:updated', repasa);
  document.addEventListener('ficha:shown', repasa);
  document.addEventListener('show.bs.modal', function (ev) {
    var f = ev.target && ev.target.querySelector && ev.target.querySelector('[data-escort-panel]');
    if (f) aplica(f.closest('form'));
  });
  repasa();
})();
