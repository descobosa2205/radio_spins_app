/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   MANDARLE UN MENSAJE AL PERSONAL DE LA HOJA DE RUTA (SMS o correo)

   A la izquierda a quién —con los chips de FUNCIÓN para elegir en bloque— y a la derecha lo que se
   manda con su VISTA PREVIA.
   ⚠️ El contador de caracteres y trozos del SMS y el HTML del correo los compone el SERVIDOR: aquí
   solo se piden y se pintan. Si se calculara aquí habría dos verdades.
   ⚠️ Todo por DELEGACIÓN: el panel de la hoja de ruta se repinta entero en cada cambio de pestaña.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  var modal = null, datos = null, canal = 'SMS', elegidos = null, tPrev = null;

  function raiz() { return document.querySelector('[data-rm-msg]'); }
  function q(sel) { var r = raiz(); return r ? r.querySelector(sel) : null; }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }

  function alcanzables() {
    if (!datos) return [];
    var campo = canal === 'SMS' ? 'phone' : 'email';
    return (datos.people || []).filter(function (p) { return p[campo]; });
  }

  function pintaCanales() {
    var z = q('[data-rm-msg-channels]'); if (!z || !datos) return;
    z.innerHTML = (datos.channels || []).map(function (c) {
      var on = c[0] === canal;
      return '<button type="button" class="btn btn-sm ' + (on ? 'btn-primary' : 'btn-outline-secondary')
        + '" data-rm-msg-ch="' + c[0] + '"><i class="fa ' + c[2] + ' me-1"></i>' + esc(c[1]) + '</button>';
    }).join(' ');
  }

  function pintaRoles() {
    var z = q('[data-rm-msg-roles]'); if (!z || !datos) return;
    var puedo = alcanzables().map(function (p) { return p.id; });
    var todos = puedo.every(function (id) { return elegidos.has(id); }) && puedo.length;
    var h = '<button type="button" class="filter-chip' + (todos ? ' is-on' : '') + '" data-rm-msg-role="*">'
      + 'Todos <span class="badge text-bg-light ms-1">' + puedo.length + '</span></button>';
    (datos.roles || []).forEach(function (r) {
      var suyos = r.ids.filter(function (id) { return puedo.indexOf(id) >= 0; });
      if (!suyos.length) return;   // un chip que no puede mandar a nadie solo estorba
      var on = suyos.every(function (id) { return elegidos.has(id); });
      h += '<button type="button" class="filter-chip' + (on ? ' is-on' : '') + '" data-rm-msg-role="'
        + esc(r.key) + '">' + esc(r.label) + ' <span class="badge text-bg-light ms-1">' + suyos.length + '</span></button>';
    });
    z.innerHTML = h;
  }

  function pintaGente() {
    var z = q('[data-rm-msg-people]'); if (!z || !datos) return;
    var campo = canal === 'SMS' ? 'phone' : 'email';
    z.innerHTML = (datos.people || []).map(function (p) {
      var puede = !!p[campo];
      var dato = canal === 'SMS' ? (p.phone_label || p.phone) : p.email;
      return '<label class="rmmsg-person' + (puede ? '' : ' is-off') + '">'
        + '<input type="checkbox" class="form-check-input" data-rm-msg-p="' + esc(p.id) + '"'
        + (puede ? '' : ' disabled') + (elegidos.has(p.id) && puede ? ' checked' : '') + '>'
        + (p.photo ? '<img src="' + esc(p.photo) + '" alt="" data-avatar="1">'
                   : '<span class="rmmsg-person__ico"><i class="fa fa-user"></i></span>')
        + '<span class="rmmsg-person__body"><span class="rmmsg-person__name">' + esc(p.name) + '</span>'
        + '<span class="rmmsg-person__meta">' + esc(p.role || 'Sin función')
        + (dato ? ' · ' + esc(dato) : ' · <span class="text-danger">sin ' + (canal === 'SMS' ? 'teléfono' : 'correo') + '</span>')
        + '</span></span></label>';
    }).join('');
    var n = alcanzables().filter(function (p) { return elegidos.has(p.id); }).length;
    var c = q('[data-rm-msg-count]'); if (c) c.textContent = n;
    var sin = (datos.people || []).length - alcanzables().length;
    var hint = q('[data-rm-msg-hint]');
    if (hint) {
      hint.innerHTML = sin ? ('<i class="fa fa-circle-info me-1"></i>' + sin + (sin === 1
        ? ' persona no tiene ' : ' personas no tienen ') + (canal === 'SMS' ? 'teléfono' : 'correo')
        + ': complétalo en su ficha o en el personal.') : '';
    }
    var b = q('[data-rm-msg-send]');
    if (b) {
      b.disabled = !n;
      b.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviar' + (n ? ' a ' + n : '');
    }
  }

  function modos() {
    var email = canal === 'EMAIL';
    ['[data-rm-msg-subject-box]', '[data-rm-msg-btnlabel-box]'].forEach(function (s) {
      var el = q(s); if (el) el.classList.toggle('d-none', !email);
    });
    var av = q('[data-rm-msg-sms-count]');
    if (av && !email && !datos.sms_gateway) {
      av.innerHTML = '<span class="text-danger"><i class="fa fa-triangle-exclamation me-1"></i>'
        + 'La pasarela de SMS no está configurada (Integraciones → SMS): ahora mismo no se puede mandar.</span>';
    }
  }

  function previa() {
    if (!raiz()) return;
    var cuerpo = (q('[data-rm-msg-body]') || {}).value || '';
    var enlace = (q('[data-rm-msg-link]') || {}).value || '';
    var zona = q('[data-rm-msg-preview]');
    if (!cuerpo.trim() && !enlace.trim()) {
      if (zona) zona.innerHTML = '<div class="text-muted small">Escribe el mensaje para verlo.</div>';
      var c0 = q('[data-rm-msg-sms-count]'); if (c0 && canal === 'SMS') c0.textContent = '';
      return;
    }
    fetch(raiz().getAttribute('data-url-preview'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: canal, body: cuerpo, link: enlace,
        subject: (q('[data-rm-msg-subject]') || {}).value || '',
        button_label: (q('[data-rm-msg-btnlabel]') || {}).value || ''
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok || !zona) return;
      if (canal === 'SMS') {
        zona.innerHTML = '<div class="rmmsg-sms">' + esc(d.text || '') + '</div>';
        var c = q('[data-rm-msg-sms-count]');
        if (c) {
          // ⚠️ El servidor lo llama `segments` (los trozos en que se parte el SMS): cada uno se
          // cobra, así que se dice.
          var trozos = d.segments || 1;
          c.innerHTML = (d.chars || 0) + ' caracteres · ' + trozos + (trozos > 1 ? ' SMS (cada uno cuenta)' : ' SMS')
            + (d.gsm7 === false ? ' <span class="text-warning">· lleva acentos raros, así que caben menos</span>' : '');
        }
      } else {
        zona.innerHTML = '<div class="rmmsg-mail">' + (d.html || '') + '</div>';
      }
    }).catch(function () {});
  }

  function carga() {
    var r = raiz(); if (!r) return;
    fetch(r.getAttribute('data-url-data')).then(function (x) { return x.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      datos = d;
      if (!datos.sms_gateway) canal = 'EMAIL';      // sin pasarela, el SMS no se puede mandar
      elegidos = new Set(alcanzables().map(function (p) { return p.id; }));
      pintaCanales(); pintaRoles(); pintaGente(); modos(); previa();
    }).catch(function () {});
  }

  document.addEventListener('click', function (ev) {
    // Abrir el pop-up (desde la barra del Personal)
    if (ev.target.closest('[data-rm-msg-open]')) {
      var el = document.getElementById('rmMsgModal');
      if (!el || !window.bootstrap) return;
      modal = bootstrap.Modal.getOrCreateInstance(el);
      carga();
      modal.show();
      return;
    }
    if (!raiz()) return;
    var ch = ev.target.closest('[data-rm-msg-ch]');
    if (ch) {
      canal = ch.getAttribute('data-rm-msg-ch');
      elegidos = new Set(alcanzables().map(function (p) { return p.id; }));
      pintaCanales(); pintaRoles(); pintaGente(); modos(); previa();
      return;
    }
    var rol = ev.target.closest('[data-rm-msg-role]');
    if (rol) {
      var key = rol.getAttribute('data-rm-msg-role');
      var puedo = alcanzables().map(function (p) { return p.id; });
      var ids = key === '*' ? puedo
        : (datos.roles.filter(function (r) { return r.key === key; })[0] || { ids: [] }).ids
            .filter(function (id) { return puedo.indexOf(id) >= 0; });
      var todos = ids.every(function (id) { return elegidos.has(id); });
      ids.forEach(function (id) { if (todos) elegidos.delete(id); else elegidos.add(id); });
      pintaRoles(); pintaGente();
      return;
    }
    var envia = ev.target.closest('[data-rm-msg-send]');
    if (envia) { manda(envia); return; }
  });

  document.addEventListener('change', function (ev) {
    var p = ev.target.closest('[data-rm-msg-p]');
    if (!p || !elegidos) return;
    var id = p.getAttribute('data-rm-msg-p');
    if (p.checked) elegidos.add(id); else elegidos.delete(id);
    pintaRoles(); pintaGente();
  });

  document.addEventListener('input', function (ev) {
    if (!ev.target.closest('[data-rm-msg]')) return;
    if (!ev.target.matches('[data-rm-msg-body],[data-rm-msg-link],[data-rm-msg-subject],[data-rm-msg-btnlabel]')) return;
    clearTimeout(tPrev);
    tPrev = setTimeout(previa, 350);
  });

  function manda(btn) {
    var r = raiz(); if (!r || !elegidos) return;
    var ids = alcanzables().filter(function (p) { return elegidos.has(p.id); }).map(function (p) { return p.id; });
    if (!ids.length) return;
    var cuerpo = (q('[data-rm-msg-body]') || {}).value || '';
    if (!cuerpo.trim()) { alert('Escribe el mensaje.'); return; }
    if (!confirm('Se va a mandar a ' + ids.length + (ids.length === 1 ? ' persona.' : ' personas.'))) return;
    btn.disabled = true;
    var previo = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando…';
    fetch(r.getAttribute('data-url-send'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: canal, ids: ids, body: cuerpo,
        link: (q('[data-rm-msg-link]') || {}).value || '',
        subject: (q('[data-rm-msg-subject]') || {}).value || '',
        button_label: (q('[data-rm-msg-btnlabel]') || {}).value || ''
      })
    }).then(function (x) { return x.json(); }).then(function (d) {
      btn.disabled = false; btn.innerHTML = previo;
      var est = q('[data-rm-msg-status]');
      if (!d || !d.ok) {
        if (est) est.innerHTML = '<span class="text-danger">' + esc((d && d.error) || 'No se pudo mandar.') + '</span>';
        return;
      }
      if (est) {
        est.innerHTML = '<span class="text-success"><i class="fa fa-circle-check me-1"></i>' + esc(d.message) + '</span>'
          + ((d.failed && d.failed.length) ? ' <span class="text-danger">No salió para: ' + esc(d.failed.join(' · ')) + '</span>' : '');
      }
    }).catch(function () {
      btn.disabled = false; btn.innerHTML = previo;
      var est = q('[data-rm-msg-status]');
      if (est) est.innerHTML = '<span class="text-danger">No se pudo mandar.</span>';
    });
  }
})();
