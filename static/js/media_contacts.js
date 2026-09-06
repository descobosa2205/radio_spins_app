/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CONTACTOS DE UN MEDIO (ficha del medio → pestaña «Contactos»)

   · El pop-up es UNO para añadir y para editar: lo rellena este JS EN EL PROPIO CLIC (con
     `modal_stack.js` por medio, `shown.bs.modal` no siempre llega — regla de la casa).
   · PROGRAMA: se escribe y salen los que YA tiene el medio; lo que no esté, se crea con lo escrito.
     La lista cuelga del `<body>` (`app33FloatList`): dentro del modal la recortaría su scroll.
   · NOTAS DE PRENSA: el interruptor se guarda AL MOMENTO (como los de una playlist). El CSRF lo
     pone `csrf.js`, que parchea `fetch`.
   Todo por DELEGACIÓN en `document`.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__mediaContactsReady) return;
  window.__mediaContactsReady = true;

  var MODAL = '#mediaContactModal';

  function modal() { return document.querySelector(MODAL); }
  function campo(clave) {
    var m = modal();
    return m ? m.querySelector('[data-mc-f="' + clave + '"]') : null;
  }

  /* ---------- Abrir el pop-up ---------- */
  function abrir(datos) {
    var m = modal();
    if (!m) return;
    var d = datos || {};
    var editando = !!d.id;
    var pon = function (clave, valor) { var el = campo(clave); if (el) el.value = valor == null ? '' : valor; };
    pon('nick', d.nick); pon('full', d.full); pon('program', d.program);
    pon('role', d.role); pon('phone', d.phone); pon('email', d.email);
    var press = campo('press');
    if (press) press.checked = !!d.press;
    var modo = m.querySelector('[data-mc-mode]');
    if (modo) modo.value = editando ? 'update_contact' : 'add_contact';
    var cid = m.querySelector('[data-mc-contact-id]');
    if (cid) cid.value = d.id || '';
    var titulo = m.querySelector('[data-mc-title]');
    if (titulo) titulo.textContent = editando ? 'Editar contacto' : 'Nuevo contacto';
    var enviar = m.querySelector('[data-mc-submit]');
    if (enviar) enviar.textContent = editando ? 'Guardar cambios' : 'Añadir contacto';
    m.querySelectorAll('.is-check-missing, .is-check-bad').forEach(function (el) {
      el.classList.remove('is-check-missing', 'is-check-bad');
    });
    if (window.bootstrap) window.bootstrap.Modal.getOrCreateInstance(m).show();
  }

  document.addEventListener('click', function (ev) {
    var nuevo = ev.target.closest('[data-mc-new]');
    if (nuevo) { ev.preventDefault(); abrir(null); return; }

    var editar = ev.target.closest('[data-mc-edit]');
    if (editar) {
      ev.preventDefault();
      abrir({
        id: editar.getAttribute('data-mc-id') || '',
        nick: editar.getAttribute('data-mc-nick') || '',
        full: editar.getAttribute('data-mc-full') || '',
        program: editar.getAttribute('data-mc-program') || '',
        role: editar.getAttribute('data-mc-role') || '',
        phone: editar.getAttribute('data-mc-phone') || '',
        email: editar.getAttribute('data-mc-email') || '',
        press: !!(editar.getAttribute('data-mc-press') || '')
      });
      return;
    }

    var copiar = ev.target.closest('.copy-media-contact');
    if (copiar) {
      ev.preventDefault();
      var txt = copiar.getAttribute('data-share-text') || '';
      try {
        navigator.clipboard.writeText(txt);
        var antes = copiar.innerHTML;
        copiar.textContent = 'Copiado';
        setTimeout(function () { copiar.innerHTML = antes; }, 1200);
      } catch (e) {}
    }
  });

  /* ---------- El interruptor de NOTAS DE PRENSA ---------- */
  document.addEventListener('change', function (ev) {
    var sw = ev.target.closest('[data-mc-press]');
    if (!sw) return;
    var caja = sw.closest('[data-mc-press-box]');
    var url = sw.getAttribute('data-mc-url');
    sw.disabled = true;
    if (caja) caja.classList.toggle('is-on', sw.checked);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: sw.checked ? 1 : 0 })
    }).then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (js) {
        sw.disabled = false;
        if (!js || !js.ok) {
          sw.checked = !sw.checked;
          if (caja) caja.classList.toggle('is-on', sw.checked);
          alert('No se pudo guardar el envío de notas de prensa.');
        }
      })
      .catch(function () {
        sw.disabled = false;
        sw.checked = !sw.checked;
        if (caja) caja.classList.toggle('is-on', sw.checked);
        alert('No se pudo guardar el envío de notas de prensa.');
      });
  });

  /* ---------- El PROGRAMA: los que ya existen, y lo que no está se crea ---------- */
  function norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function programas() {
    var m = modal();
    if (!m) return [];
    try { return JSON.parse(m.getAttribute('data-mc-programs') || '[]') || []; } catch (e) { return []; }
  }

  var box = null, seguir = null;
  function caja() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'ta-results';
    box.style.display = 'none';
    document.body.appendChild(box);
    if (window.app33FloatList) window.app33FloatList.attach(box);
    box.addEventListener('mousedown', function (ev) {
      var it = ev.target.closest('[data-mc-pick]');
      if (!it) return;
      ev.preventDefault();
      var input = campo('program');
      if (input) { input.value = it.getAttribute('data-mc-pick') || ''; input.focus(); }
      cerrar();
    });
    return box;
  }
  function cerrar() {
    if (box) box.style.display = 'none';
    if (seguir) { seguir(); seguir = null; }
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function pinta(input) {
    var q = norm(input.value);
    var lista = programas();
    var casan = lista.filter(function (p) { return !q || norm(p).indexOf(q) >= 0; });
    var exacto = lista.some(function (p) { return norm(p) === q; });
    var html = casan.slice(0, 20).map(function (p) {
      return '<button type="button" class="ta-item" data-mc-pick="' + esc(p) + '">' +
        '<span class="ta-item__noimg"><i class="fa fa-microphone-lines"></i></span>' +
        '<span class="ta-item__t">' + esc(p) + '</span></button>';
    }).join('');
    // Lo que no está se crea: se dice, para que se vea que va a ser un programa nuevo.
    if (q && !exacto) {
      html += '<button type="button" class="ta-item" data-mc-pick="' + esc(input.value.trim()) + '">' +
        '<span class="ta-item__noimg"><i class="fa fa-plus"></i></span>' +
        '<span class="ta-item__t">Crear «' + esc(input.value.trim()) + '»' +
        '<small class="ta-item__s">Un programa nuevo de este medio</small></span></button>';
    }
    var b = caja();
    if (!html) { cerrar(); return; }
    b.innerHTML = html;
    if (window.app33FloatList) window.app33FloatList.ensureRoom(input, { abajo: true });
    b.style.display = 'block';
    if (window.app33FloatList) {
      window.app33FloatList.place(input, b, { abajo: true, max: 260 });
      if (seguir) seguir();
      seguir = window.app33FloatList.follow(input, b, { abajo: true, max: 260 }, cerrar);
    }
  }

  document.addEventListener('input', function (ev) {
    if (ev.target.matches('[data-mc-prog]')) pinta(ev.target);
  });
  document.addEventListener('focusin', function (ev) {
    if (ev.target.matches('[data-mc-prog]')) pinta(ev.target);
  });
  document.addEventListener('focusout', function (ev) {
    if (ev.target.matches('[data-mc-prog]')) setTimeout(cerrar, 180);
  });
})();
