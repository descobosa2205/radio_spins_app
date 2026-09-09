/* ============================================================================================
   GÉNEROS de una canción (y ETIQUETAS de un medio): se ELIGEN de lo que ya hay, y solo se crean
   cuando de verdad no existen.

   ⚠️⚠️ LA REGLA: al escribir se enseñan SIEMPRE las coincidencias del catálogo. Un género escrito
   de otra forma es un género DUPLICADO («Hip Hop» y «HipHop» quedarían como dos), y con eso el
   repertorio deja de poder filtrarse, presentarse a radio o a una sincronización por género. Por
   eso aquí se busca con la MISMA tolerancia que el servidor (`_norm_text_key`: sin acentos, sin
   mayúsculas y con la puntuación como un espacio) y además SIN ESPACIOS, así «hiphop», «hip-hop»
   y «Hip Hop» llevan todos al que ya existe. Crear uno nuevo se dice con todas las letras.

   ⚠️⚠️ Y TRES REGLAS que vienen de bugs reales (los géneros «no se añadían» y, peor, GUARDAR DOS
   VECES la pestaña Información los BORRABA todos):

   1) El ESTADO vive en el HTML SERVIDO, no en una variable de JavaScript: cada etiqueta lleva
      dentro su propio <input type="hidden">. Así, aunque este motor no llegue a arrancar, los
      géneros se ven y se envían igual —y no se pierden—.

   2) Todo va por DELEGACIÓN en `document`. La pestaña se guarda con `ajax_inline.js`, que
      REEMPLAZA la zona entera con HTML nuevo; los <script> de dentro NO se vuelven a ejecutar y
      cualquier listener pegado a esos nodos muere con ellos. Con delegación da igual cuántas
      veces se repinte la zona: sigue funcionando.

   3) Y NO se usa un <datalist> nativo: al pinchar una de sus opciones cada navegador dispara unos
      eventos distintos (y a veces ninguno reconocible), así que elegir un género «no hacía nada»
      —había que escribirlo entero y pulsar Enter, que es justo lo que duplica el catálogo—.
      La lista es DOM de la casa (`.ta-results`) y pinchar es un clic normal.

   ⚠️ La lista es UNA SOLA para toda la página y cuelga del <body> (`app33FloatList`): dentro de un
   modal con scroll —el asistente de un proyecto discográfico— cualquier `overflow` la recortaría,
   y al ser `position:fixed` sin colocar se quedaba quieta al mover el modal.
   ============================================================================================ */
(function () {
  'use strict';

  var LIMITE = 12;
  var ALTO_MAX = 320;   // más alta tapa media pantalla y no se deja deslizar

  /* Espejo de `_norm_text_key` (app.py): minúsculas, sin acentos y la puntuación como un espacio.
     ⚠️ Si se toca una, se toca la otra: es lo que hace que «Hip-Hop» y «Hip Hop» sean el mismo. */
  function clave(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return '';
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^0-9a-z_]+/gi, ' ');   // `_norm_text_key` usa \w: letras, dígitos y _
    return s.split(/\s+/).filter(Boolean).join(' ');
  }
  // La misma clave sin espacios: «hiphop» tiene que encontrar «Hip Hop».
  function pegado(v) { return clave(v).replace(/ /g, ''); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function picker(el) { return el && el.closest ? el.closest('[data-genre-picker]') : null; }
  function chipsDe(p) { return p.querySelector('[data-genre-chips]'); }
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

  /* ⚠️ EL DEL CATÁLOGO MANDA: si lo escrito equivale a uno que ya existe («HIP-HOP» → «Hip Hop»),
     se pone EL DEL CATÁLOGO con su ortografía. Es lo que evita que el mismo género acabe escrito
     de tres maneras distintas. */
  function equivalente(p, nombre) {
    var k = clave(nombre), kp = pegado(nombre);
    if (!k) return null;
    var lista = catalogo(p);
    for (var i = 0; i < lista.length; i++) {
      if (clave(lista[i]) === k || pegado(lista[i]) === kp) return lista[i];
    }
    return null;
  }

  function anade(p, nombre) {
    nombre = limpia(nombre);
    if (!nombre) return false;
    nombre = equivalente(p, nombre) || nombre;
    var k = clave(nombre);
    var ya = puestos(p).map(clave);
    if (ya.indexOf(k) !== -1) return false;   // ya está: no se duplica
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

  /* ---- LA LISTA: una sola para toda la página, colgada del <body> ---- */
  var caja = null, activo = null, dejarDeSeguir = null;

  function lista() {
    if (caja) return caja;
    caja = document.createElement('div');
    caja.className = 'ta-results';
    document.body.appendChild(caja);
    if (window.app33FloatList) window.app33FloatList.attach(caja);
    // `mousedown`: el blur del campo llega antes que el `click`, así que con `click` no daría tiempo.
    caja.addEventListener('mousedown', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-genre-pick]') : null;
      if (!b || !activo) return;
      ev.preventDefault();
      var p = activo;
      anade(p, b.getAttribute('data-genre-pick'));
      var campo = campoDe(p);
      if (campo) { campo.value = ''; campo.focus(); }
      cierra();
    });
    return caja;
  }

  function cierra() {
    if (caja) caja.style.display = 'none';
    if (dejarDeSeguir) { dejarDeSeguir(); dejarDeSeguir = null; }
    activo = null;
  }

  function pinta(p) {
    if (!p) return;
    var campo = campoDe(p);
    if (!campo) return;
    var texto = limpia(campo.value);
    var k = clave(texto), kp = pegado(texto);
    var ya = puestos(p).map(clave);

    var hay = catalogo(p).filter(function (g) {
      if (ya.indexOf(clave(g)) !== -1) return false;
      if (!k) return true;
      return clave(g).indexOf(k) !== -1 || pegado(g).indexOf(kp) !== -1;
    });
    // Lo que EMPIEZA por lo escrito, primero: es lo que se está buscando.
    if (k) {
      hay.sort(function (a, b) {
        var ea = (clave(a).indexOf(k) === 0 || pegado(a).indexOf(kp) === 0) ? 0 : 1;
        var eb = (clave(b).indexOf(k) === 0 || pegado(b).indexOf(kp) === 0) ? 0 : 1;
        return ea - eb;
      });
    }
    hay = hay.slice(0, LIMITE);

    // ¿Lo escrito es nuevo de verdad? Solo entonces se ofrece crearlo, y se DICE.
    var nuevo = (k && !equivalente(p, texto) && ya.indexOf(k) === -1) ? texto : '';

    if (!hay.length && !nuevo) { cierra(); return; }

    var b = lista();
    activo = p;
    b.innerHTML = hay.map(function (g) {
      return '<button type="button" class="ta-item" data-genre-pick="' + esc(g) + '">' +
        '<i class="fa fa-tag text-muted"></i><span class="ta-item__t">' + esc(g) + '</span></button>';
    }).join('') + (nuevo
      ? '<button type="button" class="ta-item" data-genre-pick="' + esc(nuevo) + '">' +
        '<i class="fa fa-plus text-danger"></i><span class="ta-item__t">Crear «' + esc(nuevo) + '»' +
        '<small class="ta-item__s">No está en la lista: se añade como género nuevo</small></span></button>'
      : '');

    var opts = { abajo: true, max: ALTO_MAX };
    if (window.app33FloatList) {
      window.app33FloatList.ensureRoom(campo, opts);
      b.style.display = 'block';
      window.app33FloatList.place(campo, b, opts);
      if (dejarDeSeguir) dejarDeSeguir();
      dejarDeSeguir = window.app33FloatList.follow(campo, b, opts, cierra);
    } else {
      b.style.display = 'block';
    }
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
    var campo = ev.target.closest ? ev.target.closest('[data-genre-input]') : null;
    if (campo) setTimeout(cierra, 180);
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
    cierra();
    if (campo) campo.focus();
  });
  // Enter (o coma) añade lo escrito, como en el resto de la app.
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ',') return;
    var campo = ev.target.closest ? ev.target.closest('[data-genre-input]') : null;
    if (!campo) return;
    ev.preventDefault();
    var p = picker(campo);
    // Con la lista abierta, Enter coge la PRIMERA opción; si no, lo escrito (que `anade` casa
    // igualmente contra el catálogo antes de crear nada).
    var abierta = caja && caja.style.display === 'block' && activo === p;
    var primera = abierta ? caja.querySelector('[data-genre-pick]') : null;
    if (anade(p, primera ? primera.getAttribute('data-genre-pick') : campo.value)) campo.value = '';
    cierra();
  });

  /* Los géneros que hay puestos ahora mismo en un picker (lo usa el asistente de un proyecto
     discográfico para no dejar enviar sin ninguno). */
  window.app33Genres = {
    puestos: function (raiz) {
      var p = (raiz && raiz.matches && raiz.matches('[data-genre-picker]'))
        ? raiz : (raiz ? raiz.querySelector('[data-genre-picker]') : null);
      return p ? puestos(p) : [];
    },
    addFromInput: function (raiz) {
      var p = (raiz && raiz.matches && raiz.matches('[data-genre-picker]'))
        ? raiz : (raiz ? raiz.querySelector('[data-genre-picker]') : null);
      if (!p) return false;
      var campo = campoDe(p);
      if (!campo) return false;
      var ok = anade(p, campo.value);
      if (ok) campo.value = '';
      cierra();
      return ok;
    },
  };
})();
