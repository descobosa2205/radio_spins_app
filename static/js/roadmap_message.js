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
  var cuando = 'now';   // AHORA, o PROGRAMADO (`later`): lo manda el cron único a su hora

  function raiz() { return document.querySelector('[data-rm-msg]'); }
  function q(sel) { var r = raiz(); return r ? r.querySelector(sel) : null; }
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML; }
  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  /* El valor por defecto al programar: mañana a las 9:00 (hora local, que es la de España). */
  function defaultSendAt() {
    var d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T09:00';
  }
  /* Los mensajes que están PROGRAMADOS y todavía no han salido (y los que fallaron), con su anular. */
  function pintaProgramados(filas) {
    var box = q('[data-rm-msg-scheduled-box]'), z = q('[data-rm-msg-scheduled]');
    if (!box || !z) return;
    filas = filas || [];
    box.classList.toggle('d-none', !filas.length);
    z.innerHTML = filas.map(function (f) {
      var err = f.status === 'ERROR';
      return '<div class="rmmsg-sched' + (err ? ' is-error' : '') + '">'
        + '<i class="fa ' + (f.channel === 'EMAIL' ? 'fa-envelope' : 'fa-comment-sms') + ' text-muted"></i>'
        + '<span class="rmmsg-sched__body"><span class="fw-semibold">' + esc(f.send_at_label) + '</span> · ' + f.count + (f.count === 1 ? ' persona' : ' personas')
        + (f.by ? ' · ' + esc(f.by) : '')
        + (err ? '<span class="text-danger d-block small">No salió: ' + esc(f.error || 'error') + '</span>' : '')
        + '<span class="d-block small text-muted">' + esc(f.body) + '</span></span>'
        + '<button type="button" class="btn btn-sm btn-outline-danger py-0" data-rm-msg-cancel="' + esc(f.id) + '" title="Anular"><i class="fa fa-ban"></i></button>'
        + '</div>';
    }).join('');
  }
  function modosCuando() {
    var box = q('[data-rm-msg-when-box]'); if (box) box.classList.toggle('d-none', cuando !== 'later');
    var inp = q('[data-rm-msg-sendat]'); if (inp && cuando === 'later' && !inp.value) inp.value = defaultSendAt();
    var b = q('[data-rm-msg-send]');
    if (b) {
      var n = alcanzables().filter(function (p) { return elegidos && elegidos.has(p.id); }).length;
      b.innerHTML = cuando === 'later'
        ? '<i class="fa fa-clock me-1"></i>Programar' + (n ? ' para ' + n : '')
        : '<i class="fa fa-paper-plane me-1"></i>Enviar' + (n ? ' a ' + n : '');
    }
  }

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
    if (b) b.disabled = !n;
    modosCuando();
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
      pintaProgramados(datos.scheduled);
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
    var anula = ev.target.closest('[data-rm-msg-cancel]');
    if (anula) {
      if (!confirm('¿Anular este mensaje programado? No se mandará.')) return;
      fetch(raiz().getAttribute('data-url-cancel'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify({ id: anula.getAttribute('data-rm-msg-cancel') })
      }).then(function (x) { return x.json(); }).then(function (d) {
        if (d && d.ok) pintaProgramados(d.scheduled_rows);
        else alert((d && d.error) || 'No se pudo anular.');
      }).catch(function () { alert('No se pudo anular.'); });
      return;
    }
  });

  document.addEventListener('change', function (ev) {
    var w = ev.target.closest('[data-rm-msg-when]');
    if (w) { cuando = w.value === 'later' ? 'later' : 'now'; modosCuando(); return; }
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
    var sendAt = '';
    if (cuando === 'later') {
      sendAt = (q('[data-rm-msg-sendat]') || {}).value || '';
      if (!sendAt) { alert('Di cuándo se manda.'); return; }
      if (new Date(sendAt) <= new Date()) { alert('Esa hora ya ha pasado: elige una posterior o mándalo ahora.'); return; }
      if (!confirm('Se dejará programado para ' + sendAt.replace('T', ' a las ') + ' a ' + ids.length + (ids.length === 1 ? ' persona.' : ' personas.'))) return;
    } else if (!confirm('Se va a mandar a ' + ids.length + (ids.length === 1 ? ' persona.' : ' personas.'))) return;
    btn.disabled = true;
    var previo = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' + (sendAt ? 'Programando…' : 'Enviando…');
    fetch(r.getAttribute('data-url-send'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
      body: JSON.stringify({
        channel: canal, ids: ids, body: cuerpo,
        link: (q('[data-rm-msg-link]') || {}).value || '',
        subject: (q('[data-rm-msg-subject]') || {}).value || '',
        button_label: (q('[data-rm-msg-btnlabel]') || {}).value || '',
        send_at: sendAt
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
      if (d.scheduled) pintaProgramados(d.scheduled_rows);
    }).catch(function () {
      btn.disabled = false; btn.innerHTML = previo;
      var est = q('[data-rm-msg-status]');
      if (est) est.innerHTML = '<span class="text-danger">No se pudo mandar.</span>';
    });
  }
})();
