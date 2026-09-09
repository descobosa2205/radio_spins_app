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
    /* ⚠️ AL AÑADIR se empieza BUSCANDO entre los terceros (una persona de un medio ES un tercero);
       al EDITAR se va directo a sus datos. */
    pon('promoter_id', d.promoter_id || '');
    pintaElegido(d.promoter_id ? d : null);
    vista(editando ? 'form' : 'search');
    var buscador = m.querySelector('[data-mc-search]');
    if (buscador) { buscador.value = ''; }
    var res = m.querySelector('[data-mc-results]');
    if (res) res.innerHTML = '';
    if (window.bootstrap) window.bootstrap.Modal.getOrCreateInstance(m).show();
    if (!editando && buscador) setTimeout(function () { buscador.focus(); }, 250);
  }

  /* Lo que YA viene de la ficha del tercero se marca (y se desmarca en cuanto se toca). */
  function marcaHeredados(activar) {
    var m = modal();
    if (!m) return;
    ['nick', 'full', 'email', 'phone'].forEach(function (k) {
      var el = campo(k);
      if (!el) return;
      el.classList.toggle('is-from-promoter', !!(activar && (el.value || '').trim()));
    });
    var aviso = m.querySelector('[data-mc-inherited]');
    if (aviso) aviso.classList.toggle('d-none', !activar);
  }
  document.addEventListener('input', function (ev) {
    if (ev.target.matches('[data-mc-f]')) ev.target.classList.remove('is-from-promoter');
  });

  /* ---------- Buscar / crear: las dos caras del pop-up ---------- */
  function vista(cual) {
    var m = modal();
    if (!m) return;
    m.querySelectorAll('[data-mc-view]').forEach(function (z) {
      z.classList.toggle('d-none', z.getAttribute('data-mc-view') !== cual);
    });
    var enviar = m.querySelector('[data-mc-submit]');
    if (enviar) enviar.classList.toggle('d-none', cual !== 'form');
    var atras = m.querySelector('[data-mc-back]');
    var editando = !!((m.querySelector('[data-mc-contact-id]') || {}).value || '');
    if (atras) atras.classList.toggle('d-none', cual !== 'form' || editando);
  }

  /* A quién se ha elegido, con su foto (o el muñequito gris de la casa).
     ⚠️ `pintaElegido`, NO `pinta`: ya hay una `pinta()` (la de las sugerencias de programa) y en JS
     la última definición PISA a la anterior (la trampa de siempre de los nombres repetidos). */
  function pintaElegido(p) {
    var m = modal();
    var caja = m ? m.querySelector('[data-mc-picked]') : null;
    if (!caja) return;
    if (!p) { caja.classList.add('d-none'); return; }
    var img = caja.querySelector('[data-mc-picked-img]');
    var def = document.body.getAttribute('data-default-avatar-url') || '';
    if (img) img.src = (p.logo_url || p.photo || def || '');
    var n = caja.querySelector('[data-mc-picked-name]');
    if (n) n.textContent = p.label || p.nick || p.full || 'Persona nueva';
    var meta = caja.querySelector('[data-mc-picked-meta]');
    if (meta) {
      meta.textContent = [p.contact_email || p.email || '', p.contact_phone || p.phone || '']
        .filter(Boolean).join(' · ') || (p.promoter_id ? 'Ficha de tercero' : 'Se le creará su ficha de tercero');
    }
    caja.classList.remove('d-none');
  }

  document.addEventListener('click', function (ev) {
    var nuevo = ev.target.closest('[data-mc-new]');
    if (nuevo) { ev.preventDefault(); abrir(null); return; }

    // «No está: crear una persona nueva» → los campos, en blanco. Se le creará su ficha de tercero.
    if (ev.target.closest('[data-mc-create]')) {
      ev.preventDefault();
      var mc = modal();
      ['nick', 'full', 'program', 'role', 'phone', 'email'].forEach(function (k) {
        var el = campo(k); if (el) el.value = '';
      });
      var hid = campo('promoter_id'); if (hid) hid.value = '';
      pintaElegido({ label: 'Persona nueva' });
      marcaHeredados(false);
      vista('form');
      var primero = campo('nick'); if (primero) setTimeout(function () { primero.focus(); }, 120);
      return;
    }
    if (ev.target.closest('[data-mc-back]')) { ev.preventDefault(); vista('search'); return; }
    if (ev.target.closest('[data-mc-unpick]')) {
      ev.preventDefault();
      var h = campo('promoter_id'); if (h) h.value = '';
      pintaElegido(null);
      vista('search');
      return;
    }

    // Un resultado de la búsqueda: se usa SU ficha y solo se piden los datos que falten.
    var pick = ev.target.closest('[data-mc-promoter]');
    if (pick) {
      ev.preventDefault();
      var p = {};
      try { p = JSON.parse(pick.getAttribute('data-mc-promoter')) || {}; } catch (e) { p = {}; }
      var hidp = campo('promoter_id'); if (hidp) hidp.value = p.id || '';
      var full = [p.first_name || '', p.last_name || ''].filter(Boolean).join(' ');
      var pon2 = function (k, v) { var el = campo(k); if (el) el.value = v || ''; };
      pon2('nick', p.nick || '');
      pon2('full', full);
      pon2('email', p.contact_email || '');
      pon2('phone', p.contact_phone || '');
      pon2('role', '');
      pintaElegido(Object.assign({ promoter_id: p.id }, p));
      vista('form');
      /* ⚠️ SOLO SE PIDE LO QUE FALTA: lo que ya está en su ficha viene puesto y se marca como tal
         (fondo suave), y el foco va al primer hueco vacío —el cargo, casi siempre—. */
      marcaHeredados(true);
      var falta = ['role', 'program', 'email', 'phone', 'full'].filter(function (k) {
        var el = campo(k); return el && !(el.value || '').trim();
      })[0] || 'role';
      var el0 = campo(falta); if (el0) setTimeout(function () { el0.focus(); }, 120);
      return;
    }

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
        press: !!(editar.getAttribute('data-mc-press') || ''),
        promoter_id: editar.getAttribute('data-mc-promoter-id') || ''
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

  /* ---------- EL BUSCADOR de terceros (con su foto) ---------- */
  var espera = null;
  document.addEventListener('input', function (ev) {
    if (!ev.target.matches('[data-mc-search]')) return;
    var input = ev.target;
    var caja = modal() ? modal().querySelector('[data-mc-results]') : null;
    if (!caja) return;
    clearTimeout(espera);
    var q = (input.value || '').trim();
    if (q.length < 2) { caja.innerHTML = ''; return; }
    espera = setTimeout(function () {
      fetch('/api/search/promoters?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var filas = Array.isArray(d) ? d : ((d && (d.results || d.items)) || []);
          var def = document.body.getAttribute('data-default-avatar-url') || '';
          caja.innerHTML = filas.slice(0, 12).map(function (p) {
            var meta = [p.contact_email, p.contact_phone, p.link_summary_text].filter(Boolean).join(' · ');
            return '<button type="button" class="mc-opt" data-mc-promoter=\'' + esc(JSON.stringify(p)) + '\'>' +
              '<img class="mc-opt__ava" src="' + esc(p.logo_url || def) + '" alt="" data-avatar="1">' +
              '<span class="mc-opt__body"><span class="mc-opt__name">' + esc(p.label || p.nick || '') + '</span>' +
              (meta ? '<span class="mc-opt__meta">' + esc(meta) + '</span>' : '') + '</span>' +
              '<i class="fa fa-plus ms-auto text-muted"></i></button>';
          }).join('') || '<div class="text-muted small mt-2">Nadie con ese dato. Créala con el botón de abajo.</div>';
        })
        .catch(function () { caja.innerHTML = ''; });
    }, 280);
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
