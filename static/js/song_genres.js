/* ============================================================================================
   GÉNEROS de una canción: etiquetas que se eligen de una lista o se crean escribiéndolas.

   ⚠️⚠️ DOS REGLAS que vienen de un bug real (los géneros «no se añadían» y, peor, GUARDAR DOS
   VECES la pestaña Información los BORRABA todos):

   1) El ESTADO vive en el HTML SERVIDO, no en una variable de JavaScript: cada etiqueta lleva
      dentro su propio <input type="hidden">. Así, aunque este motor no llegue a arrancar, los
      géneros se ven y se envían igual —y no se pierden—.

   2) Todo va por DELEGACIÓN en `document`. La pestaña se guarda con `ajax_inline.js`, que
      REEMPLAZA la zona entera con HTML nuevo; los <script> de dentro NO se vuelven a ejecutar y
      cualquier listener pegado a esos nodos muere con ellos. Con delegación da igual cuántas
      veces se repinte la zona: sigue funcionando.

   3) Y NO se usa un <datalist> nativo: al pinchar una de sus opciones cada navegador dispara unos
      eventos distintos (y a veces ninguno reconocible), así que elegir un género «no hacía nada».
      La lista es DOM de la casa (`.ta-results`) y pinchar es un clic normal.
   ============================================================================================ */
(function () {
  'use strict';

  var LIMITE = 12;

  function sinAcentos(v) {
    return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function picker(el) { return el && el.closest ? el.closest('[data-genre-picker]') : null; }
  function chipsDe(p) { return p.querySelector('[data-genre-chips]'); }
  function cajaDe(p) { return p.querySelector('[data-genre-results]'); }
  function campoDe(p) { return p.querySelector('[data-genre-input]'); }

  function puestos(p) {
    return Array.prototype.map.call(p.querySelectorAll('[data-genre-chip] input[type="hidden"]'),
                                    function (i) { return i.value; });
  }

  function catalogo(p) {
    var json = p.querySelector('[data-genre-catalog]');
    if (!json) return [];
    try { return JSON.parse(json.textContent || '[]') || []; } catch (e) { return []; }
  }

  function limpia(nombre) {
    return String(nombre || '').replace(/^#+/, '').replace(/\s+/g, ' ').trim();
  }

  function anade(p, nombre) {
    nombre = limpia(nombre);
    if (!nombre) return false;
    var ya = puestos(p).map(sinAcentos);
    if (ya.indexOf(sinAcentos(nombre)) !== -1) return false;   // ya está: no se duplica
    var zona = chipsDe(p);
    if (!zona) return false;
    var campo = p.getAttribute('data-genre-field') || 'song_genres[]';
    var chip = document.createElement('span');
    chip.className = 'badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-2 me-2 mb-2';
    chip.setAttribute('data-genre-chip', '');
    chip.innerHTML = '<span>' + esc(nombre) + '</span>' +
      '<button type="button" class="btn btn-sm p-0 border-0 bg-transparent text-danger" ' +
      'data-genre-del aria-label="Quitar"><i class="fa fa-times"></i></button>' +
      '<input type="hidden" name="' + esc(campo) + '" value="' + esc(nombre) + '">';
    zona.appendChild(chip);
    return true;
  }

  function cierra(p) { var c = cajaDe(p); if (c) c.style.display = 'none'; }

  function pinta(p) {
    var campo = campoDe(p), caja = cajaDe(p);
    if (!campo || !caja) return;
    var q = sinAcentos(campo.value);
    var ya = puestos(p).map(sinAcentos);
    var hay = catalogo(p).filter(function (g) {
      return ya.indexOf(sinAcentos(g)) === -1 && (!q || sinAcentos(g).indexOf(q) !== -1);
    }).slice(0, LIMITE);
    if (!hay.length) { cierra(p); return; }
    caja.innerHTML = hay.map(function (g) {
      return '<button type="button" class="ta-item" data-genre-pick="' + esc(g) + '">' +
        '<i class="fa fa-tag text-muted"></i><span class="ta-item__t">' + esc(g) + '</span></button>';
    }).join('');
    caja.style.display = 'block';
  }

  // ---- Delegación: sobrevive a que la zona se repinte cuantas veces haga falta ----
  document.addEventListener('input', function (ev) {
    var campo = ev.target.closest ? ev.target.closest('[data-genre-input]') : null;
    if (campo) pinta(picker(campo));
  });
  document.addEventListener('focusin', function (ev) {
    var campo = ev.target.closest ? ev.target.closest('[data-genre-input]') : null;
    if (campo) pinta(picker(campo));
  });
  document.addEventListener('focusout', function (ev) {
    var p = picker(ev.target);
    if (p) setTimeout(function () { cierra(p); }, 180);
  });
  // `mousedown`: el blur del campo llega antes que el `click`, así que con `click` no daría tiempo.
  document.addEventListener('mousedown', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-genre-pick]') : null;
    if (!b) return;
    var p = picker(b);
    if (!p) return;
    ev.preventDefault();
    anade(p, b.getAttribute('data-genre-pick'));
    var campo = campoDe(p);
    if (campo) { campo.value = ''; campo.focus(); }
    cierra(p);
  });
  document.addEventListener('click', function (ev) {
    var del = ev.target.closest ? ev.target.closest('[data-genre-del]') : null;
    if (del) {
      var chip = del.closest('[data-genre-chip]');
      if (chip) chip.remove();
      return;
    }
    var mas = ev.target.closest ? ev.target.closest('[data-genre-add]') : null;
    if (!mas) return;
    var p = picker(mas);
    if (!p) return;
    var campo = campoDe(p);
    if (campo && anade(p, campo.value)) campo.value = '';
    cierra(p);
    if (campo) campo.focus();
  });
  // Enter (o coma) añade lo escrito, como en el resto de la app.
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ',') return;
    var campo = ev.target.closest ? ev.target.closest('[data-genre-input]') : null;
    if (!campo) return;
    ev.preventDefault();
    var p = picker(campo);
    // Con la lista abierta, Enter coge la PRIMERA opción; si no, se crea lo escrito.
    var caja = cajaDe(p);
    var primera = (caja && caja.style.display === 'block') ? caja.querySelector('[data-genre-pick]') : null;
    if (anade(p, primera ? primera.getAttribute('data-genre-pick') : campo.value)) campo.value = '';
    cierra(p);
  });
})();
