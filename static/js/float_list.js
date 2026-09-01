/* ══════════════════════════════════════════════════════════════════════════════════════════════
   UNA LISTA DE SUGERENCIAS NO PUEDE QUEDAR RECORTADA NI SALIR A MEDIAS
   ⚠️⚠️ Colgada de su campo (`position:absolute`), la recorta cualquier ancestro con `overflow`: un
   bocadillo con `overflow:hidden` (por su border-radius), el cuerpo de un modal con scroll, una
   tabla… y los resultados se ven a medias o no se ven (bug real en el formulario de demos).
   La solución es SACARLA al `<body>` y colocarla a mano en `position:fixed`.
   Este fichero es el punto ÚNICO: lo usan el buscador de la casa (`typeahead.js`) y las listas
   propias del formulario de demos (`demo_form.js`).
   ⚠️ Va en su propio fichero, y no dentro de `typeahead.js`, porque hay páginas PÚBLICAS
   (standalone) que traen el formulario de demos pero no cargan el buscador de la casa: allí el
   helper no existiría y la lista volvería a salir recortada.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33FloatList) return;      // alguna pantalla lo carga dos veces (parcial + layout)
  var MIN_HUECO = 180;   // por debajo de esto no merece la pena abrirla: se acerca el campo

  window.app33FloatList = {
    // La saca del contenedor que la recorta (una sola vez) y la deja colgando del body.
    attach: function (box) {
      if (!box || box.__floating) return;
      box.__floating = true;
      document.body.appendChild(box);
      box.style.position = 'fixed';
      if (!box.style.zIndex) box.style.zIndex = '2000';
    },

    /* La pega al campo, con su ancho, por el lado en el que QUEPA ENTERA. Si no cabe por ninguno,
       por el que tenga más sitio: así se ve lo máximo posible en vez de quedarse a medias.
       ⚠️ Con `{abajo: true}` sale SIEMPRE hacia abajo: un desplegable que se abre hacia arriba
       despista (lo pidió así Dani en el buscador de proveedor del gasto). Para que quepa, el campo
       se acerca antes con `ensureRoom(input, {abajo: true})`. */
    place: function (input, box, opciones) {
      if (!input || !box) return;
      var forzarAbajo = !!(opciones && opciones.abajo);
      var r = input.getBoundingClientRect();
      // El alto NATURAL del contenido: `offsetHeight` ya viene recortado por el `max-height` que
      // le pusimos la vez anterior, así que mirándolo la lista nunca volvería a crecer.
      var previo = box.style.maxHeight;
      box.style.maxHeight = 'none';
      var alto = box.scrollHeight || 0;
      box.style.maxHeight = previo;

      var abajo = window.innerHeight - r.bottom - 12;
      var arriba = r.top - 12;
      var poner = forzarAbajo ? 'abajo'
                : (alto <= abajo) ? 'abajo'
                : (alto <= arriba) ? 'arriba'
                : (arriba > abajo) ? 'arriba' : 'abajo';

      box.style.left = Math.max(4, Math.min(r.left, window.innerWidth - r.width - 4)) + 'px';
      box.style.width = r.width + 'px';
      // ⚠️ Con `{max: N}` la lista no pasa de ese alto: doce resultados tapaban media pantalla, y una
      // lista que no puede crecer más SE DESLIZA por dentro (que es lo que se espera al mover la
      // rueda encima de ella).
      var tope = (opciones && opciones.max) ? opciones.max : Infinity;
      if (poner === 'arriba') {
        box.style.top = 'auto';
        box.style.bottom = (window.innerHeight - r.top + 2) + 'px';
        box.style.maxHeight = Math.min(tope, Math.max(120, arriba)) + 'px';
      } else {
        box.style.bottom = 'auto';
        box.style.top = (r.bottom + 2) + 'px';
        box.style.maxHeight = Math.min(tope, Math.max(120, abajo)) + 'px';
      }
    },

    /* ⚠️⚠️ UNA LISTA `position:fixed` NO SIGUE AL SCROLL: al mover la página (o el cuerpo de un
       modal) se quedaba QUIETA mientras el campo se iba, con las opciones flotando en medio de otra
       cosa (bug real, con captura). `follow` la vuelve a colocar mientras está abierta y la CIERRA
       si el campo se sale de la vista. Devuelve la función para dejar de seguirla.
       Es el mismo remedio que ya usaba el buscador de la casa; aquí es el punto único. */
    follow: function (input, box, opciones, onClose) {
      if (!input || !box) return function () {};
      var self = this;
      var vivo = true;
      var recolocar = function () {
        if (!vivo) return;
        if (box.style.display === 'none') return;
        var r = input.getBoundingClientRect();
        // El campo ya no se ve (se ha ido con el scroll): la lista se cierra.
        if (r.bottom < 0 || r.top > window.innerHeight) {
          if (typeof onClose === 'function') onClose();
          return;
        }
        self.place(input, box, opciones);
      };
      window.addEventListener('scroll', recolocar, true);
      window.addEventListener('resize', recolocar);
      return function () {
        vivo = false;
        window.removeEventListener('scroll', recolocar, true);
        window.removeEventListener('resize', recolocar);
      };
    },

    /* Antes de abrirla: si al campo no le queda sitio ni arriba ni abajo (está en el borde de un
       modal con scroll), se ACERCA para que la lista quepa. Sin esto salían cinco resultados de
       doce y el resto había que buscarlos con el scroll de la propia lista. */
    ensureRoom: function (input, opciones) {
      if (!input) return;
      try {
        var r = input.getBoundingClientRect();
        // Con `{abajo: true}` solo cuenta el hueco de ABAJO: la lista va a salir por ahí sí o sí.
        var hueco = (opciones && opciones.abajo)
          ? (window.innerHeight - r.bottom - 12)
          : (Math.max(window.innerHeight - r.bottom, r.top) - 12);
        if (hueco >= MIN_HUECO) return;
        /* ⚠️⚠️ `behavior: 'instant'` A PROPÓSITO: la app tiene `scroll-behavior: smooth`, así que un
           `scrollIntoView` normal ANIMA y quien mide justo después (el `place` de la línea siguiente)
           lee la posición VIEJA — la lista salía pegada a donde estaba el campo y con el alto mínimo
           (bug real, con captura). */
        input.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch (e) {}
    },
  };
})();
