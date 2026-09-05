/* ENVÍO DE DEMOS · la página pública (`public_demo_submit.html`).
 *
 * Solo lleva lo propio de esa página: identificarse con el DNI o CIF, añadir cada maqueta (el
 * formulario y la subida del audio los lleva `demo_form.js`, el mismo que usamos dentro), quitarlas
 * antes de mandarlas y ENVIARLAS todas.
 *
 * ⚠️ Hasta que no le da a «Enviar demos» las maquetas NO existen para el sello: quedan pendientes de
 * enviar y no salen en la sección.
 */
(function () {
  'use strict';

  var raiz = document.querySelector('[data-demo-submit]');
  if (!raiz) return;

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function postJson(url, datos) {
    return fetch(url, { method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                        body: JSON.stringify(datos || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  /* ---------- 1) Identificarse ---------- */
  var btnId = raiz.querySelector('[data-demo-identify]');
  if (btnId) {
    var elTax = raiz.querySelector('[data-demo-tax]');
    var elError = raiz.querySelector('[data-demo-id-error]');
    var elExtra = raiz.querySelector('[data-demo-id-extra]');
    var elChoices = raiz.querySelector('[data-demo-id-choices]');

    function identifica(extra) {
      var datos = { tax_id: (elTax.value || '').trim() };
      if (extra) {
        datos.name = (raiz.querySelector('[data-demo-name]') || {}).value || '';
        datos.email = (raiz.querySelector('[data-demo-email]') || {}).value || '';
        datos.phone = (raiz.querySelector('[data-demo-phone]') || {}).value || '';
      }
      btnId.disabled = true;
      postJson(raiz.getAttribute('data-identify-url'), datos).then(function (js) {
        btnId.disabled = false;
        if (!js || !js.ok) {
          elError.textContent = (js && js.error) || 'No se pudo comprobar. Inténtalo otra vez.';
          elError.classList.remove('d-none');
          return;
        }
        elError.classList.add('d-none');
        if (js.ready) { window.location.reload(); return; }      // ya identificado: a subir maquetas
        if (js.choices && js.choices.length) {
          // Ese número está en varias fichas: que elija la suya.
          elChoices.innerHTML = '<div class="small text-muted mb-1">¿Cuál eres?</div>'
            + js.choices.map(function (c) {
              return '<button class="pl-pick-artist w-100 mb-1" type="button" data-demo-pick="' + esc(c.id) + '">'
                + (c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="" data-avatar="1">'
                               : '<span class="pl-pick-artist__icon"><i class="fa fa-user"></i></span>')
                + '<span class="pl-pick-artist__name">' + esc(c.name) + '</span></button>';
            }).join('');
          elChoices.classList.remove('d-none');
          return;
        }
        if (js.needs_data) {
          elExtra.classList.remove('d-none');
          var n = raiz.querySelector('[data-demo-name]');
          if (n) { if (js.suggested_name && !n.value) n.value = js.suggested_name; n.focus(); }
        }
      });
    }

    btnId.addEventListener('click', function () {
      identifica(elExtra && !elExtra.classList.contains('d-none'));
    });
    if (elTax) elTax.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); btnId.click(); }
    });
    if (elChoices) elChoices.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-demo-pick]');
      if (!b) return;
      postJson(raiz.getAttribute('data-identify-url'),
               { tax_id: (elTax.value || '').trim(), promoter_id: b.getAttribute('data-demo-pick') })
        .then(function (js) { if (js && js.ok && js.ready) window.location.reload(); });
    });
  }

  /* ---------- 2) Añadir una maqueta (el formulario compartido, por AJAX) ---------- */
  var form = document.getElementById('demoAddForm');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var error = form.querySelector('[data-demo-add-error]');
      var boton = form.querySelector('[type="submit"]');
      error.classList.add('d-none');
      boton.disabled = true;
      var manda = function () {
        var fd = new FormData(form);
        fetch(raiz.getAttribute('data-add-url'),
              { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (js) {
            boton.disabled = false;
            if (!js || !js.ok) {
              error.textContent = (js && js.error) || 'No se pudo añadir la maqueta.';
              error.classList.remove('d-none');
              return;
            }
            // Se recarga para verlas con el mismo aspecto que dentro (y que suenen).
            window.location.reload();
          })
          .catch(function () {
            boton.disabled = false;
            error.textContent = 'No se pudo añadir la maqueta.';
            error.classList.remove('d-none');
          });
      };
      // El audio primero (va directo a Storage con su barra de progreso).
      // ⚠️ Se pueden mandar VARIAS de una vez: si alguna no ha subido, NO se envía el formulario.
      if (typeof form.demoFaltaTitulo === 'function' && form.demoFaltaTitulo()) {
        boton.disabled = false;
        return;
      }
      if (typeof form.demoUploadAudio === 'function') {
        form.demoUploadAudio(function (ok) {
          if (ok === false) {
            boton.disabled = false;
            error.textContent = 'Algún audio no se ha podido subir: míralo en la lista y vuelve a intentarlo.';
            error.classList.remove('d-none');
            return;
          }
          manda();
        });
      } else manda();
    });
  }

  /* ---------- 3) Quitar y ENVIAR ---------- */
  raiz.addEventListener('click', function (ev) {
    var quitar = ev.target.closest('[data-demo-remove]');
    if (quitar) {
      ev.preventDefault();
      ev.stopPropagation();
      var base = raiz.getAttribute('data-remove-base') || '';
      postJson(base.replace('__ID__', quitar.getAttribute('data-demo-remove')), {})
        .then(function (js) { if (js && js.ok) window.location.reload(); });
      return;
    }
    var enviar = ev.target.closest('[data-demo-send]');
    if (enviar) {
      enviar.disabled = true;
      postJson(raiz.getAttribute('data-send-url'), {}).then(function (js) {
        var aviso = raiz.querySelector('[data-demo-sent]');
        if (js && js.ok) {
          if (aviso) {
            aviso.innerHTML = '<i class="fa fa-circle-check me-1"></i>¡Enviadas! Hemos recibido '
              + js.sent + ' maqueta' + (js.sent === 1 ? '' : 's') + '. Gracias.';
            aviso.classList.remove('d-none');
          }
          var lista = raiz.querySelector('[data-demo-rows]');
          if (lista) lista.innerHTML = '';
          var vacio = raiz.querySelector('[data-demo-empty]');
          if (vacio) vacio.classList.add('d-none');
        } else {
          enviar.disabled = false;
          alert((js && js.error) || 'No se pudieron enviar las maquetas.');
        }
      });
    }
  });
})();
