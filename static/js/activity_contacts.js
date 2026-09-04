/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CONTACTOS DE UNA ACTIVIDAD, POR FUNCIÓN — ticketing · producción · producción local · contratación

   Un contacto se pone UNA VEZ y sirve para todas las actividades de ese promotor: al elegir a
   alguien, si es distinto del que ya tenía el promotor se pregunta si el cambio vale **para todas
   sus actividades de aquí en adelante** o **solo para esta**.

   ⚠️⚠️ TODO POR DELEGACIÓN en `document`: este bloque se pinta en el ASISTENTE (un modal) y en la
   FICHA de la actividad, cuyas zonas se reemplazan por AJAX. Con listeners pegados a los botones
   que hay al cargar, los del HTML nuevo se quedan MUERTOS (regla de la casa).
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BUSCAR = '/api/search/promoters';
  var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';

  function caja(el) { return el && el.closest ? el.closest('[data-ac-role]') : null; }
  function q(c, sel) { return c ? c.querySelector(sel) : null; }

  /* Pinta quién ha quedado elegido (foto o logo + nombre + cómo se le escribe). */
  function pinta(c, datos) {
    var zona = q(c, '[data-ac-picked]');
    if (!zona) return;
    if (!datos) { zona.classList.add('d-none'); return; }
    zona.classList.remove('d-none');
    var img = q(c, '[data-ac-photo]');
    if (img) img.src = datos.photo || AVATAR;
    var n = q(c, '[data-ac-name]');
    if (n) n.textContent = datos.name || '';
    var d = q(c, '[data-ac-contact]');
    if (d) d.textContent = [datos.email, datos.phone].filter(Boolean).join(' · ');
  }

  function modo(c, kind) {
    var k = q(c, '[data-ac-kind]');
    if (k) k.value = kind || '';
    var same = q(c, '[data-ac-same]'), otro = q(c, '[data-ac-other]');
    if (same) same.className = 'btn btn-sm ' + (kind === 'PROMOTER' ? 'btn-danger' : 'btn-outline-secondary');
    if (otro) otro.className = 'btn btn-sm ' + (kind === 'THIRD' || kind === 'EMAIL' ? 'btn-danger' : 'btn-outline-secondary');
    var busca = q(c, '[data-ac-search]');
    if (busca) busca.classList.toggle('d-none', !(kind === 'THIRD' || kind === 'EMAIL'));
  }

  /* ¿Hay que preguntar el ALCANCE? Solo cuando lo elegido NO es lo que ya tenía el promotor. */
  function alcance(c) {
    var zona = q(c, '[data-ac-scope]');
    if (!zona) return;
    var kind = (q(c, '[data-ac-kind]') || {}).value || '';
    var id = (q(c, '[data-ac-id]') || {}).value || '';
    var antes = c.getAttribute('data-ac-was') || '';
    if (!antes) {
      antes = kind + '|' + id;                       // lo que había al pintar
      c.setAttribute('data-ac-was', antes);
      zona.classList.add('d-none');
      return;
    }
    zona.classList.toggle('d-none', (kind + '|' + id) === antes);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-same], [data-ac-other]');
    if (!b) return;
    var c = caja(b);
    if (!c) return;
    ev.preventDefault();
    if (b.hasAttribute('data-ac-same')) {
      // El propio promotor: el nombre y el correo se leen EN VIVO de su ficha, no se congela nada.
      modo(c, 'PROMOTER');
      var id = q(c, '[data-ac-id]'); if (id) id.value = '';
      var n = q(c, '[data-ac-hidden-name]'); if (n) n.value = '';
      var p = document.querySelector('[data-ac-promoter-name]');
      pinta(c, { name: (p && p.getAttribute('data-ac-promoter-name')) || 'El promotor',
                 photo: (p && p.getAttribute('data-ac-promoter-photo')) || '',
                 email: (p && p.getAttribute('data-ac-promoter-email')) || '',
                 phone: (p && p.getAttribute('data-ac-promoter-phone')) || '' });
    } else {
      modo(c, 'THIRD');
      var inp = q(c, '[data-ac-input]');
      if (inp) inp.focus();
    }
    alcance(c);
  });

  /* La barra: se escribe y salen las coincidencias con su foto o su logo. La lista cuelga del
     <body> (`app33FloatList`), o dentro de un modal la recortaría cualquier `overflow`. */
  var tCambio = null;
  document.addEventListener('input', function (ev) {
    var inp = ev.target.closest && ev.target.closest('[data-ac-input]');
    if (!inp) return;
    var c = caja(inp);
    clearTimeout(tCambio);
    var texto = (inp.value || '').trim();
    if (texto.length < 2) { cierra(); return; }
    tCambio = setTimeout(function () { busca(c, inp, texto); }, 200);
  });

  var lista = null;
  function cierra() {
    if (lista && lista.parentNode) lista.parentNode.removeChild(lista);
    lista = null;
  }
  document.addEventListener('click', function (ev) {
    if (lista && !ev.target.closest('[data-ac-input], .ta-results')) cierra();
  });

  function busca(c, inp, texto) {
    fetch(BUSCAR + '?q=' + encodeURIComponent(texto), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (filas) {
        cierra();
        if (!Array.isArray(filas) || !filas.length) return;
        lista = document.createElement('div');
        lista.className = 'ta-results';
        filas.slice(0, 12).forEach(function (f) {
          var it = document.createElement('div');
          it.className = 'ta-item d-flex align-items-center gap-2';
          var img = document.createElement('img');
          img.src = f.logo_url || AVATAR;
          img.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex:0 0 auto';
          var txt = document.createElement('span');
          txt.textContent = f.label || f.nick || '';
          it.appendChild(img); it.appendChild(txt);
          it.addEventListener('mousedown', function (e) {
            e.preventDefault();
            elige(c, {
              id: f.id, name: f.label || f.nick || '', photo: f.logo_url || '',
              email: f.contact_email || '', phone: f.contact_phone || ''
            });
            cierra();
          });
          lista.appendChild(it);
        });
        document.body.appendChild(lista);
        if (window.app33FloatList && window.app33FloatList.place) {
          window.app33FloatList.place(inp, lista, { max: 320, abajo: true });
        } else {
          var r = inp.getBoundingClientRect();
          lista.style.cssText += ';position:fixed;z-index:2147482000;left:' + r.left + 'px;top:'
            + (r.bottom + 2) + 'px;width:' + r.width + 'px;max-height:320px;overflow:auto';
        }
      })
      .catch(function () { cierra(); });
  }

  function elige(c, f) {
    modo(c, 'THIRD');
    var id = q(c, '[data-ac-id]'); if (id) id.value = f.id || '';
    var n = q(c, '[data-ac-hidden-name]'); if (n) n.value = f.name || '';
    var inp = q(c, '[data-ac-input]'); if (inp) inp.value = f.name || '';
    var mail = q(c, 'input[name$="_email"]'); if (mail) mail.value = f.email || '';
    var tel = q(c, 'input[name$="_phone"]'); if (tel) tel.value = f.phone || '';
    // Si su ficha no trae ni correo ni teléfono, se piden aquí: sin uno de los dos no se le puede
    // escribir y el contacto no serviría de nada.
    var datos = q(c, '[data-ac-datos]');
    if (datos) datos.classList.toggle('d-none', !!(f.email || f.phone));
    pinta(c, f);
    alcance(c);
  }

  /* El «+» crea la persona al vuelo con el sistema global (`quick_create.js`), que deja lo creado
     en el <select> oculto de esta caja; de ahí se copia al buscador y a los ocultos de verdad. */
  document.addEventListener('change', function (ev) {
    var sel = ev.target.closest && ev.target.closest('[data-ac-select]');
    if (!sel || !sel.value) return;
    var c = caja(sel);
    var op = sel.options[sel.selectedIndex] || {};
    elige(c, { id: sel.value, name: op.text || '', photo: op.getAttribute ? (op.getAttribute('data-photo') || '') : '' });
  });
  // El botón «+» necesita saber en qué <select> dejar lo creado: se le dice EN EL CLIC (con
  // `modal_stack.js` por medio, `shown.bs.modal` no siempre llega).
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-plus]');
    if (!b) return;
    var c = caja(b), sel = q(c, '[data-ac-select]');
    if (!sel) return;
    if (!sel.id) sel.id = 'acSel' + Math.abs((c.getAttribute('data-ac-role') || '').split('')
      .reduce(function (a, ch) { return a + ch.charCodeAt(0); }, 0)) + '_' + (document.querySelectorAll('[data-ac-select]').length);
    b.setAttribute('data-target', sel.id);
    b.setAttribute('data-target-hidden', '');
  });

  // Escribir un correo a mano sin haber elegido ficha: es el modo EMAIL.
  document.addEventListener('input', function (ev) {
    var m = ev.target.closest && ev.target.closest('[data-ac-datos] input[name$="_email"]');
    if (!m) return;
    var c = caja(m);
    var id = (q(c, '[data-ac-id]') || {}).value || '';
    if (!id && (m.value || '').indexOf('@') > 0) { modo(c, 'EMAIL'); alcance(c); }
  });
})();
