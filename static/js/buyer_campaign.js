/* ENVÍO A COMPRADORES (SMS o correo).
 *
 * Lo que se ve es lo que sale: la previsualización y el CONTADOR de caracteres los compone el
 * SERVIDOR con el mismo código que el envío (`/compradores/envio/previsualizar`), así que no hay
 * dos versiones de la misma cuenta — el GSM-7, los acentos y los trozos de un SMS son cosa de
 * `sms_utils`, y aquí no se copia esa lógica.
 *
 * ⚠️ Un envío a miles de personas no cabe en una petición: al mandar se crea la campaña y se manda
 *    la primera tanda; si quedan, sale el botón «Seguir enviando» (nadie recibe dos veces, porque
 *    cada destinatario queda marcado en cuanto se le manda).
 */
(function () {
  'use strict';

  function init(root) {
    if (!root || root.dataset.bcReady === '1') return;
    root.dataset.bcReady = '1';

    var q = function (s) { return root.querySelector(s); };
    var qa = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
    var st = {
      channel: 'SMS',
      files: [],
      campaign: null,
      total: 0,
      segments: 1,
      timer: null,
      test: [],
      testTimer: null
    };
    var urls = {
      preview: root.dataset.urlPreview,
      send: root.dataset.urlSend,
      cont: root.dataset.urlContinue,
      status: root.dataset.urlStatus,
      attach: root.dataset.urlAttach,
      sender: root.dataset.urlSender,
      test: root.dataset.urlTest,
      contacts: root.dataset.urlContacts
    };
    var smsReady = root.dataset.smsReady === '1';
    var errBox = q('[data-bc-error]');

    function error(msg) {
      if (!errBox) return;
      if (!msg) { errBox.classList.add('d-none'); errBox.textContent = ''; return; }
      errBox.textContent = msg;
      errBox.classList.remove('d-none');
    }

    function esc(t) {
      return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    /* ---------- canal ---------- */
    function setChannel(canal) {
      st.channel = canal === 'EMAIL' ? 'EMAIL' : 'SMS';
      var esMail = st.channel === 'EMAIL';
      var t = q('[data-bc-title]');
      if (t) t.textContent = esMail ? 'Envío de Email' : 'Envío de SMS';
      var i1 = q('[data-bc-icon-sms]'); if (i1) i1.classList.toggle('d-none', esMail);
      var i2 = q('[data-bc-icon-mail]'); if (i2) i2.classList.toggle('d-none', !esMail);
      qa('[data-bc-only]').forEach(function (el) {
        el.classList.toggle('d-none', el.getAttribute('data-bc-only') !== st.channel);
      });
      var aviso = q('[data-bc-sms-off]');
      if (aviso) aviso.classList.toggle('d-none', esMail || smsReady);
      pintaEmpresaNota();
      // Lo puesto para la prueba no sirve al cambiar de canal (un correo no vale para un SMS).
      st.test = [];
      pintaTest();
      programaPreview();
    }

    /* ---------- ¿a quién? ---------- */
    root.addEventListener('change', function (ev) {
      if (ev.target.name === 'bc_who') {
        var zona = q('[data-bc-filters]');
        if (zona) zona.classList.toggle('d-none', ev.target.value !== 'filtros');
        programaPreview();
        return;
      }
      if (ev.target.matches('[data-bc-cat], [data-bc-flag]')) { programaPreview(); return; }
      if (ev.target.name === 'bc_sender') { pintaEmpresaNota(); programaPreview(); return; }
      if (ev.target.matches('[data-bc-accept]')) { pintaBotonEnviar(); }
    });

    root.addEventListener('input', function (ev) {
      if (ev.target.matches('[data-bc-body], [data-bc-subject], [data-bc-title-in], [data-bc-link], [data-bc-button-label], [data-bc-button-url]')) {
        programaPreview();
      }
    });

    function quienManda() {
      var r = root.querySelector('input[name="bc_sender"]:checked');
      if (!r) return null;
      return { kind: r.getAttribute('data-kind') || 'COMPANY', id: r.getAttribute('data-id') || '',
               name: r.getAttribute('data-name') || '', sms: r.getAttribute('data-sms') || '' };
    }

    function pintaEmpresaNota() {
      var nota = q('[data-bc-company-note]');
      var quien = quienManda();
      var caja = q('[data-bc-shortname]');
      if (!quien) { if (caja) caja.classList.add('d-none'); return; }
      if (nota) {
        if (st.channel === 'SMS') {
          nota.innerHTML = quien.sms
            ? 'El SMS saldrá como <strong>' + esc(quien.sms) + '</strong>.'
            : 'Sin nombre abreviado, el SMS sale con el remitente general de la casa.';
        } else {
          nota.innerHTML = 'En el correo va su logo arriba a la derecha.';
        }
      }
      // El nombre abreviado solo hace falta para el SMS.
      if (caja) {
        var falta = (st.channel === 'SMS' && !quien.sms);
        caja.classList.toggle('d-none', !falta);
        var who = q('[data-bc-shortname-who]');
        if (who) who.textContent = quien.name;
        var inp = q('[data-bc-shortname-in]');
        if (inp && !inp.value) {
          inp.value = (quien.name || '').replace(/[^A-Za-z0-9 .\-]/g, '').slice(0, 11).toUpperCase();
        }
      }
    }

    var btnShort = q('[data-bc-shortname-save]');
    if (btnShort) {
      btnShort.addEventListener('click', function () {
        var quien = quienManda();
        var inp = q('[data-bc-shortname-in]');
        var errZ = q('[data-bc-shortname-err]');
        if (!quien || !inp) return;
        if (errZ) errZ.classList.add('d-none');
        btnShort.disabled = true;
        fetch(urls.sender, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: quien.kind, id: quien.id, sender: inp.value })
        }).then(function (r) { return r.json(); }).then(function (data) {
          btnShort.disabled = false;
          if (!data.ok) {
            if (errZ) { errZ.textContent = data.error || 'No se pudo guardar.'; errZ.classList.remove('d-none'); }
            return;
          }
          // Se queda guardado en su ficha, así que la tarjeta ya lo lleva.
          var marcada = root.querySelector('input[name="bc_sender"]:checked');
          if (marcada) marcada.setAttribute('data-sms', data.sender);
          pintaEmpresaNota();
          programaPreview();
        }).catch(function () {
          btnShort.disabled = false;
          if (errZ) { errZ.textContent = 'No se pudo guardar.'; errZ.classList.remove('d-none'); }
        });
      });
    }

    /* ---------- botón y enlace ---------- */
    var btnAddButton = q('[data-bc-add-button]');
    if (btnAddButton) {
      btnAddButton.addEventListener('click', function () {
        var z = q('[data-bc-button-fields]');
        if (z) z.classList.remove('d-none');
        btnAddButton.classList.add('d-none');
        var i = q('[data-bc-button-label]'); if (i) i.focus();
      });
    }
    var btnDelButton = q('[data-bc-button-del]');
    if (btnDelButton) {
      btnDelButton.addEventListener('click', function () {
        var z = q('[data-bc-button-fields]');
        if (z) z.classList.add('d-none');
        if (btnAddButton) btnAddButton.classList.remove('d-none');
        var a = q('[data-bc-button-label]'); if (a) a.value = '';
        var b = q('[data-bc-button-url]'); if (b) b.value = '';
        programaPreview();
      });
    }
    var btnAddLink = q('[data-bc-add-link]');
    if (btnAddLink) {
      btnAddLink.addEventListener('click', function () {
        var z = q('[data-bc-link-fields]');
        if (z) z.classList.remove('d-none');
        btnAddLink.classList.add('d-none');
        var i = q('[data-bc-link]'); if (i) i.focus();
      });
    }
    var btnDelLink = q('[data-bc-link-del]');
    if (btnDelLink) {
      btnDelLink.addEventListener('click', function () {
        var z = q('[data-bc-link-fields]');
        if (z) z.classList.add('d-none');
        if (btnAddLink) btnAddLink.classList.remove('d-none');
        var i = q('[data-bc-link]'); if (i) i.value = '';
        programaPreview();
      });
    }

    /* ---------- adjuntos ---------- */
    var input = document.getElementById('buyerCampaignFileInput');
    if (input) {
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        files.forEach(sube);
      });
    }

    function sube(file) {
      var errZ = document.querySelector('[data-bc-files-error]');
      if (errZ) errZ.classList.add('d-none');
      var fd = new FormData();
      fd.append('file', file);
      var fila = { name: file.name, url: '', pending: true };
      st.files.push(fila);
      pintaFiles();
      fetch(urls.attach, { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || 'no se pudo subir');
          fila.url = data.file.url;
          fila.mimetype = data.file.mimetype;
          fila.image = data.file.image;
          fila.pending = false;
          pintaFiles();
          programaPreview();
        })
        .catch(function (e) {
          st.files = st.files.filter(function (f) { return f !== fila; });
          pintaFiles();
          if (errZ) { errZ.textContent = file.name + ': ' + e.message; errZ.classList.remove('d-none'); }
        });
    }

    function pintaFiles() {
      var html = st.files.length ? st.files.map(function (f, i) {
        var ico = f.pending ? 'fa-spinner fa-spin' : (f.image ? 'fa-image' : 'fa-file-lines');
        return '<span class="bc-file"><i class="fa ' + ico + '"></i>' + esc(f.name) +
          '<button type="button" class="bc-file__x" data-bc-file-del="' + i + '" title="Quitar"><i class="fa fa-xmark"></i></button></span>';
      }).join('') : '<span class="text-muted small">Sin adjuntos.</span>';
      var a = q('[data-bc-files]'); if (a) a.innerHTML = html;
      var b = document.querySelector('[data-bc-files-modal]'); if (b) b.innerHTML = html;
    }

    document.addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-bc-file-del]');
      if (!del) return;
      var i = parseInt(del.getAttribute('data-bc-file-del'), 10);
      if (!isNaN(i)) { st.files.splice(i, 1); pintaFiles(); programaPreview(); }
    });

    /* ---------- previsualización (la compone el servidor) ---------- */
    function payload() {
      var who = root.querySelector('input[name="bc_who"]:checked');
      var todos = !who || who.value === 'todos';
      var quien = quienManda() || {};
      return {
        channel: st.channel,
        event: root.dataset.event || '',
        lista: root.dataset.lista || '',
        todos: todos ? '1' : '',
        cat: todos ? [] : qa('[data-bc-cat]:checked').map(function (i) { return i.value; }),
        flags: todos ? [] : qa('[data-bc-flag]:checked').map(function (i) { return i.value; }),
        sender_kind: quien.kind || 'COMPANY',
        company_id: (quien.kind === 'COMPANY' ? (quien.id || '') : ''),
        subject: (q('[data-bc-subject]') || {}).value || '',
        title: (q('[data-bc-title-in]') || {}).value || '',
        body: (q('[data-bc-body]') || {}).value || '',
        button_label: (q('[data-bc-button-label]') || {}).value || '',
        button_url: (q('[data-bc-button-url]') || {}).value || '',
        link_url: (q('[data-bc-link]') || {}).value || '',
        files: st.files.filter(function (f) { return f.url; })
      };
    }

    function programaPreview() {
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(preview, 320);
    }

    function preview() {
      fetch(urls.preview, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload())
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (!data.ok) { error(data.error || 'No se pudo previsualizar.'); return; }
        error('');
        st.total = data.total || 0;
        var n = q('[data-bc-total]'); if (n) n.textContent = st.total;
        var l = q('[data-bc-total-l]'); if (l) l.textContent = st.total === 1 ? 'envío' : 'envíos';
        var nota = q('[data-bc-total-note]');
        if (nota) {
          nota.innerHTML = data.sin_dato
            ? '<i class="fa fa-circle-info me-1"></i>' + data.sin_dato + ' se quedan fuera por no tener ' +
              (st.channel === 'EMAIL' ? 'email' : 'teléfono') + '.'
            : '';
        }
        if (st.channel === 'EMAIL') {
          var marco = q('[data-bc-preview-mail]');
          if (marco) marco.srcdoc = data.html || '';
          st.segments = 1;
          pintaSegmentos(null);
        } else {
          var burbuja = q('[data-bc-preview-sms]');
          if (burbuja) burbuja.textContent = data.text || '';
          var de = q('[data-bc-sms-from]');
          if (de) de.textContent = data.sender ? ('De: ' + data.sender) : 'De: (el número de la pasarela)';
          var cont = q('[data-bc-counter]');
          if (cont) {
            var restan = Math.max(0, (data.limit || 160) * (data.segments || 1) - (data.chars || 0));
            cont.innerHTML = '<strong>' + (data.chars || 0) + '</strong> caracteres · ' +
              '<strong>' + (data.segments || 0) + '</strong> SMS · quedan ' + restan +
              ' para el siguiente' + (data.gsm7 ? '' : ' <span class="text-warning-emphasis">(con acentos raros: 70 por SMS)</span>') +
              (data.files_link ? ' · el enlace de los adjuntos se crea al enviar (mide lo mismo)' : '');
          }
          st.segments = data.segments || 1;
          pintaSegmentos(st.segments);
        }
        pintaBotonEnviar();
      }).catch(function () { error('No se pudo previsualizar.'); });
    }

    function pintaSegmentos(trozos) {
      var caja = q('[data-bc-segments]');
      if (!caja) return;
      if (!trozos || trozos <= 1) {
        caja.classList.add('d-none');
        var chk = q('[data-bc-accept]'); if (chk) chk.checked = false;
        return;
      }
      var txt = q('[data-bc-segments-text]');
      if (txt) txt.textContent = 'El mensaje ocupa ' + trozos + ' SMS por persona (' + (trozos * st.total) + ' en total).';
      caja.classList.remove('d-none');
    }

    function pintaBotonEnviar() {
      var btn = q('[data-bc-send]');
      if (!btn) return;
      var lbl = q('[data-bc-send-label]');
      var cuerpo = ((q('[data-bc-body]') || {}).value || '').trim();
      var asunto = ((q('[data-bc-subject]') || {}).value || '').trim();
      var acepta = q('[data-bc-accept]');
      var falta = (!st.total || !cuerpo ||
        (st.channel === 'EMAIL' && !asunto) ||
        (st.channel === 'SMS' && !smsReady) ||
        (st.segments > 1 && acepta && !acepta.checked));
      btn.disabled = !!falta;
      if (lbl) lbl.textContent = st.total ? ('Enviar a ' + st.total) : 'Enviar';
    }

    /* ---------- enviar ---------- */
    var btnSend = q('[data-bc-send]');
    if (btnSend) {
      btnSend.addEventListener('click', function () {
        btnSend.disabled = true;
        var lbl = q('[data-bc-send-label]');
        if (lbl) lbl.textContent = 'Enviando…';
        fetch(urls.send, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload())
        }).then(function (r) { return r.json(); }).then(function (data) {
          if (lbl) lbl.textContent = 'Enviar';
          if (!data.ok) { error(data.error || 'No se pudo mandar.'); btnSend.disabled = false; return; }
          st.campaign = data.campaign_id;
          resultado(data);
        }).catch(function () {
          if (lbl) lbl.textContent = 'Enviar';
          btnSend.disabled = false;
          error('No se pudo mandar.');
        });
      });
    }

    var btnCont = q('[data-bc-continue]');
    if (btnCont) {
      btnCont.addEventListener('click', function () {
        if (!st.campaign) return;
        btnCont.disabled = true;
        btnCont.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Enviando…';
        fetch(urls.cont.replace('__CID__', st.campaign), { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            btnCont.disabled = false;
            btnCont.innerHTML = '<i class="fa fa-forward me-1"></i>Seguir enviando';
            if (!data.ok) { error(data.error || 'No se pudo seguir.'); return; }
            resultado(data);
          })
          .catch(function () {
            btnCont.disabled = false;
            btnCont.innerHTML = '<i class="fa fa-forward me-1"></i>Seguir enviando';
            error('No se pudo seguir.');
          });
      });
    }

    function resultado(data) {
      var caja = q('[data-bc-result]');
      var quedan = data.quedan || 0;
      var enviando = !!data.enviando;
      if (caja) {
        caja.className = 'alert ' + (quedan ? 'alert-warning' : 'alert-success');
        caja.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviados <strong>' + (data.enviados || 0) + '</strong>' +
          (data.total ? ' de ' + data.total : '') +
          (data.fallos ? ' · <strong>' + data.fallos + '</strong> no salieron' : '') +
          (quedan
            ? (enviando
                ? ' · quedan <strong>' + quedan + '</strong>, se están mandando… <i class="fa fa-spinner fa-spin"></i>'
                : ' · quedan <strong>' + quedan + '</strong>: pulsa «Seguir enviando».')
            : ' · <strong>envío terminado</strong>.') +
          (data.aviso ? '<div class="small mt-1">' + esc(data.aviso) + '</div>' : '');
        caja.classList.remove('d-none');
      }
      // El botón de seguir a mano se deja para cuando el envío en segundo plano se haya parado
      // (un despliegue, por ejemplo): nadie recibe dos veces, así que pulsarlo es seguro.
      if (btnCont) btnCont.classList.toggle('d-none', !quedan);
      if (btnSend) btnSend.classList.toggle('d-none', true);
      if (quedan && enviando) vigila();
    }

    var vigilando = null;
    function vigila() {
      if (vigilando || !st.campaign || !urls.status) return;
      vigilando = setInterval(function () {
        fetch(urls.status.replace('__CID__', st.campaign))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.ok) return;
            if (!data.quedan || !data.enviando) { clearInterval(vigilando); vigilando = null; }
            resultado(data);
          })
          .catch(function () { clearInterval(vigilando); vigilando = null; });
      }, 4000);
    }

    /* ---------- LA PRUEBA: antes de mandarlo a miles de personas ---------- */
    // Se manda EXACTAMENTE lo que está compuesto (el mismo payload que el envío), a los correos o
    // teléfonos que se digan. No toca a ningún comprador.
    function testEsMail() { return st.channel === 'EMAIL'; }

    function pintaTest() {
      var zona = document.querySelector('[data-bt-list]');
      if (zona) {
        zona.innerHTML = st.test.length ? st.test.map(function (t, i) {
          return '<span class="bc-file"><i class="fa ' + (testEsMail() ? 'fa-at' : 'fa-mobile-screen-button') +
            '"></i>' + esc(t) + '<button type="button" class="bc-file__x" data-bt-del="' + i +
            '" title="Quitar"><i class="fa fa-xmark"></i></button></span>';
        }).join('') : '<span class="text-muted small">Todavía no has puesto a nadie.</span>';
      }
      var btn = document.querySelector('[data-bt-send]');
      if (btn) btn.disabled = !st.test.length;
      var lbl = document.querySelector('[data-bt-lbl]');
      if (lbl) lbl.textContent = testEsMail() ? 'Correo' : 'Teléfono';
      var inp = document.querySelector('[data-bt-manual]');
      if (inp) inp.placeholder = testEsMail() ? 'prueba@33producciones.es' : '+34600111222';
    }

    function testAñade(valor) {
      var v = (valor || '').trim();
      if (!v) return;
      var errZ = document.querySelector('[data-bt-error]');
      var vale = testEsMail() ? (v.indexOf('@') > 0) : /[0-9]{6,}/.test(v);
      if (!vale) {
        if (errZ) {
          errZ.textContent = testEsMail() ? 'Eso no es un correo.' : 'Eso no es un teléfono.';
          errZ.classList.remove('d-none');
        }
        return;
      }
      if (errZ) errZ.classList.add('d-none');
      if (st.test.indexOf(v) < 0) st.test.push(v);
      pintaTest();
    }

    document.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-bt-add]')) {
        var inp = document.querySelector('[data-bt-manual]');
        if (inp) { testAñade(inp.value); inp.value = ''; }
        return;
      }
      var del = ev.target.closest('[data-bt-del]');
      if (del) {
        var i = parseInt(del.getAttribute('data-bt-del'), 10);
        if (!isNaN(i)) { st.test.splice(i, 1); pintaTest(); }
        return;
      }
      var fila = ev.target.closest('[data-bt-pick]');
      if (fila) { testAñade(fila.getAttribute('data-bt-pick')); return; }
      if (ev.target.closest('[data-bt-send]')) enviaPrueba();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      if (ev.target && ev.target.matches('[data-bt-manual]')) {
        ev.preventDefault();
        testAñade(ev.target.value);
        ev.target.value = '';
      }
    });

    document.addEventListener('input', function (ev) {
      if (!ev.target.matches('[data-bt-search]')) return;
      var txt = (ev.target.value || '').trim();
      if (st.testTimer) clearTimeout(st.testTimer);
      var zona = document.querySelector('[data-bt-results]');
      if (txt.length < 2) { if (zona) zona.innerHTML = ''; return; }
      st.testTimer = setTimeout(function () {
        fetch(urls.contacts + '?channel=' + encodeURIComponent(st.channel) + '&q=' + encodeURIComponent(txt))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!zona) return;
            var filas = (data.rows || []);
            if (!filas.length) { zona.innerHTML = '<div class="text-muted small py-2">Nadie con ese nombre tiene ' + (testEsMail() ? 'correo' : 'teléfono') + '.</div>'; return; }
            zona.innerHTML = filas.map(function (r) {
              var valor = testEsMail() ? (r.email || '') : (r.phone || '');
              var foto = r.photo_url
                ? '<img src="' + esc(r.photo_url) + '" alt="" data-avatar="1">'
                : '<span class="bt-res__ico"><i class="fa fa-user"></i></span>';
              return '<button type="button" class="bt-res"' + (valor ? ' data-bt-pick="' + esc(valor) + '"' : ' disabled') + '>' +
                foto + '<span class="bt-res__t"><span class="bt-res__n">' + esc(r.name) +
                (r.extra ? ' <span class="text-muted small">· ' + esc(r.extra) + '</span>' : '') + '</span>' +
                '<span class="bt-res__s">' + esc(valor || (testEsMail() ? 'sin correo' : 'sin teléfono')) + '</span></span>' +
                '<span class="bt-res__k">' + esc(r.kind_label) + '</span></button>';
            }).join('');
          })
          .catch(function () { if (zona) zona.innerHTML = '<div class="text-danger small py-2">No se pudo buscar.</div>'; });
      }, 280);
    });

    function enviaPrueba() {
      var btn = document.querySelector('[data-bt-send]');
      var errZ = document.querySelector('[data-bt-error]');
      var okZ = document.querySelector('[data-bt-result]');
      if (!st.test.length) return;
      if (errZ) errZ.classList.add('d-none');
      if (okZ) okZ.classList.add('d-none');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Enviando…'; }
      var cuerpo = payload();
      cuerpo.targets = st.test.slice();
      fetch(urls.test, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviar la prueba'; }
        if (!data.ok) {
          if (errZ) { errZ.textContent = data.error || 'No se pudo mandar la prueba.'; errZ.classList.remove('d-none'); }
          return;
        }
        if (okZ) {
          okZ.innerHTML = '<i class="fa fa-check me-1"></i>Prueba enviada a <strong>' + (data.enviados || 0) + '</strong>' +
            (data.fallos ? '. No salió para: ' + esc((data.errores || []).join(' · ')) : '.');
          okZ.classList.remove('d-none');
        }
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane me-1"></i>Enviar la prueba'; }
        if (errZ) { errZ.textContent = 'No se pudo mandar la prueba.'; errZ.classList.remove('d-none'); }
      });
    }

    /* ---------- de dónde se abre (SMS o correo) ---------- */
    // ⚠️ En el CLIC, no en `shown.bs.modal`: con modal_stack.js ese evento no siempre llega.
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-bs-target="#buyerCampaignModal"]');
      if (!t) return;
      setChannel(t.getAttribute('data-bc-channel') || 'SMS');
      // Se reinicia el estado del envío anterior (el mismo pop-up sirve para varios).
      st.campaign = null;
      var caja = q('[data-bc-result]'); if (caja) caja.classList.add('d-none');
      if (btnCont) btnCont.classList.add('d-none');
      if (btnSend) { btnSend.classList.remove('d-none'); btnSend.disabled = true; }
    }, true);

    pintaFiles();
    setChannel('SMS');
  }

  function boot() { document.querySelectorAll('[data-buyer-campaign]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
