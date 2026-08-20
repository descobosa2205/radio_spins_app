/* sw3.js — INTERRUPTOR DE TRES POSICIONES (`.sw3`), global.
 *
 * Apagado (0) = no se pide · ámbar en medio (1) = se pide · verde a la derecha (2) = obligatorio.
 * El valor viaja en el `<input type="hidden">` que va justo detrás del interruptor.
 *
 * Se usa de TRES formas, y las tres tienen que funcionar:
 *   · SE ARRASTRA el pomo (con el dedo o con el ratón) y sigue al puntero.
 *   · SE PINCHA en la posición que se quiere (izquierda / centro / derecha).
 *   · Con el TECLADO: flechas ← →, y espacio/enter avanza a la siguiente.
 *
 * ⚠️⚠️ EL ARRASTRE ES LO QUE FALTABA EN EL IPHONE Y EL IPAD (bug real, ago 2026): parece un slider,
 * así que con el dedo uno lo ARRASTRA — y en iOS un arrastre NO genera `click`, así que con un
 * manejador de `click` no pasaba absolutamente nada («no te deja moverlos»). Y si en vez de arrastrar
 * se intentaba pinchar, el control medía 64×23 px (21 px por posición): imposible de acertar con el
 * dedo, y en cuanto el dedo se movía dos píxeles el navegador lo tomaba por un scroll y tampoco había
 * clic. Ahora se maneja con POINTER EVENTS (valen para dedo, ratón y lápiz) y en táctil el control se
 * agranda por CSS con una zona de toque más grande que el dibujo.
 *
 * Global y no-op si la página no tiene ningún `[data-sw3]`.
 */
(function () {
  'use strict';

  function poner(sw, estado) {
    estado = Math.max(0, Math.min(2, estado));
    if (String(estado) === sw.getAttribute('data-state')) return;
    sw.setAttribute('data-state', String(estado));
    // El valor va en el oculto de justo detrás (así el interruptor es solo la parte visual).
    var oculto = sw.nextElementSibling;
    if (oculto && oculto.type === 'hidden') oculto.value = String(estado);
    sw.dispatchEvent(new CustomEvent('sw3:change', { bubbles: true, detail: { state: estado } }));
  }

  function estadoActual(sw) {
    return parseInt(sw.getAttribute('data-state'), 10) || 0;
  }

  /* En qué posición cae una X de la pantalla (izquierda / centro / derecha). */
  function desdeX(sw, x) {
    var caja = sw.getBoundingClientRect();
    if (!caja.width) return estadoActual(sw);
    var tercio = Math.floor(((x - caja.left) / caja.width) * 3);
    return Math.max(0, Math.min(2, tercio));
  }

  var activo = null;          // interruptor que se está arrastrando

  if (window.PointerEvent) {
    document.addEventListener('pointerdown', function (ev) {
      var sw = ev.target.closest && ev.target.closest('[data-sw3]');
      if (!sw || ev.button > 0) return;
      activo = sw;
      // Con la captura, los `pointermove` siguen llegando aunque el dedo se salga del interruptor.
      try { sw.setPointerCapture(ev.pointerId); } catch (e) { /* da igual: seguimos por document */ }
      poner(sw, desdeX(sw, ev.clientX));
    });

    document.addEventListener('pointermove', function (ev) {
      if (!activo) return;
      poner(activo, desdeX(activo, ev.clientX));
      // Sin esto, el navegador puede tomar el arrastre por un scroll a mitad del gesto.
      if (ev.cancelable) ev.preventDefault();
    });

    var suelta = function () { activo = null; };
    document.addEventListener('pointerup', suelta);
    document.addEventListener('pointercancel', suelta);

    // Tras un arrastre llega un `click` con las coordenadas del final: ya está aplicado, se ignora.
    document.addEventListener('click', function (ev) {
      var sw = ev.target.closest && ev.target.closest('[data-sw3]');
      if (sw) ev.preventDefault();
    });
  } else {
    // Navegador sin Pointer Events: el clic de siempre (se pincha la posición).
    document.addEventListener('click', function (ev) {
      var sw = ev.target.closest && ev.target.closest('[data-sw3]');
      if (!sw) return;
      poner(sw, desdeX(sw, ev.clientX));
      ev.preventDefault();
    });
  }

  document.addEventListener('keydown', function (ev) {
    var sw = ev.target.closest && ev.target.closest('[data-sw3]');
    if (!sw) return;
    var actual = estadoActual(sw);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { poner(sw, actual + 1); ev.preventDefault(); }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { poner(sw, actual - 1); ev.preventDefault(); }
    else if (ev.key === ' ' || ev.key === 'Enter') { poner(sw, (actual + 1) % 3); ev.preventDefault(); }
  });
})();
