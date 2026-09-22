/* ══════════════════════════════════════════════════════════════════════════════════════════════
   EL FORMULARIO DE UN GASTO DE BOLSA · motor del parcial `_bag_expense_form.html`
   Por módulos (bocadillos), en un solo paso y con el CONCEPTO como único campo obligatorio.

   Lo que hace:
     · **LA FACTURA ES LO PRIMERO**: se arrastra y se LEE (el mismo lector que la base de facturas).
       De ahí salen el tipo (factura o ticket), el nº, la fecha, el importe, el concepto y **quién
       nos factura**. ⚠️ No siempre hay factura: nada de esto es obligatorio.
     · **SE VE A LA IZQUIERDA** mientras se repasan los datos (`.be-split`), para no tener que
       abrirla en otra pantalla. El formulario NO cambia de tamaño: crece el modal.
     · **IMPORTE con o sin IVA**: se escribe una vez y se dice si lo lleva; si no, se ve al momento
       el IVA que se le va a calcular (21% por defecto, configurable en el gasto). ⚠️ El desglose que
       se GUARDA lo hace el servidor (`_bag_update_expense_from_form`): aquí solo se enseña.
     · **AVISO**: la campanita abre el día y la hora, con «el día de antes» y «una semana antes».
     · **PROVEEDOR**: se reconoce solo si está en la base (por su CIF, por su cuenta o por su
       nombre) y, si no, se busca en toda la base (terceros, medios, artistas y personal). Debajo,
       con qué **sociedad factura** y **QUÉ LE FALTA A SU FICHA**, en amarillo: lo que se rellene
       queda guardado en ella y no se vuelve a pedir.
     · **PAGO**: pagado (completo o parcial) y con qué método, todo con iconos.

   ⚠️ GLOBAL y por DELEGACIÓN: este formulario se pinta en la pantalla de la bolsa y también EMBEBIDO
   en una ficha (proyecto, actividad, promoción), cuyas zonas se repintan por AJAX — un `<script>` de
   dentro no se volvería a ejecutar (regla de la casa).
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.app33BagExpense) return;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }
  function num(v) {
    // Los importes se escriben formateados («1.200,50»): el lector de la casa es `window.numv`.
    if (window.numv) return window.numv(v) || 0;
    var t = String(v == null ? '' : v).replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isNaN(n) ? 0 : n;
  }
  function eur(n) {
    try { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
    catch (e) { return n.toFixed(2) + ' €'; }
  }
  function form(el) { return el ? el.closest('[data-bag-expense-form]') : null; }
  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? { 'X-CSRFToken': m.getAttribute('content') } : {};
  }

  /* ---------------------------------------------------------------- 1 · IMPORTE E IVA */
  /* QUÉ ES el documento (FACTURA / TICKET / SIN_DOCUMENTO). ⚠️ Punto único: es un grupo de RADIOS
     (antes era un hidden), y en edición se pinta uno por gasto, así que hay que leer el marcado
     DE ESTE formulario, no el primero de la página. */
  function tipoDoc(root) {
    var marcado = root && root.querySelector('input[name="document_type"]:checked');
    if (marcado) return (marcado.value || 'FACTURA').toUpperCase();
    var hidden = q(root, '[data-be-doc-type]');
    return ((hidden && hidden.value) || 'FACTURA').toUpperCase();
  }

  function pintaIva(root) {
    if (!root) return;
    var hint = q(root, '[data-be-vat-hint]');
    if (!hint) return;
    var valor = num(q(root, 'input[name="amount_value"]') ? q(root, 'input[name="amount_value"]').value : '');
    var pct = num(q(root, '[data-be-vat-pct]') ? q(root, '[data-be-vat-pct]').value : '21') || 0;
    var modo = (q(root, 'input[name="amount_mode"]:checked') || {}).value || 'GROSS';
    var esTicket = tipoDoc(root) === 'TICKET';
    if (!valor) { hint.textContent = pct ? ('Sin IVA se le calcula el ' + pct + '% automáticamente.') : ''; return; }
    if (esTicket) {
      hint.innerHTML = 'Es un <strong>ticket</strong>: el IVA no se desglosa (no es deducible). Total ' + esc(eur(valor)) + '.';
      return;
    }
    if (modo === 'NET') {
      var iva = valor * pct / 100;
      hint.innerHTML = 'IVA (' + pct + '%): <strong>' + esc(eur(iva)) + '</strong> · Total <strong>' + esc(eur(valor + iva)) + '</strong>.';
    } else {
      var base = pct ? valor / (1 + pct / 100) : valor;
      hint.innerHTML = 'Base <strong>' + esc(eur(base)) + '</strong> + IVA (' + pct + '%) <strong>' + esc(eur(valor - base)) + '</strong>.';
    }
  }

  /* ---------------------------------------------------------------- 1 · EL AVISO */
  function fechaBase(root) {
    var f = q(root, '[data-be-issue]');
    var v = f && f.value ? f.value : '';
    var d = v ? new Date(v + 'T00:00:00') : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function iso(d) {
    // ⚠️ Nada de `toISOString()`: pasa por UTC y en España se lleva el día por delante.
    var m = String(d.getMonth() + 1), dd = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (dd.length < 2 ? '0' + dd : dd);
  }

  /* ---------------------------------------------------------------- EL VISOR DE LA FACTURA
     ⚠️ La factura se ve A LA IZQUIERDA y el formulario conserva su ancho: el que crece es el modal
     (`.be-dialog.is-split`). Así se repasa lo que se está apuntando contra el documento sin abrirlo
     en otra pantalla, que es justo lo que pidió Dani. */
  function esImagen(nombre, tipo) {
    return /^image\//.test(String(tipo || '')) || /\.(png|jpe?g|webp|gif|heic|bmp|tiff?)($|\?)/i.test(String(nombre || ''));
  }
  function abreVisor(root, src, nombre, imagen) {
    var caja = q(root, '[data-be-viewer]');
    var marco = q(root, '[data-be-viewer-frame]');
    if (!caja || !marco || !src) return;
    var rotulo = q(root, '[data-be-viewer-name]');
    if (rotulo) rotulo.textContent = nombre || 'Documento';
    marco.innerHTML = imagen
      ? '<img src="' + esc(src) + '" alt="Documento del gasto">'
      : '<iframe src="' + esc(src) + (src.indexOf('#') >= 0 ? '&' : '#') + 'view=FitH&zoom=page-width" title="Documento del gasto"></iframe>';
    caja.classList.remove('d-none');
    var dlg = root.closest('.modal-dialog');
    if (dlg) dlg.classList.add('is-split');
  }
  function cierraVisor(root) {
    var caja = q(root, '[data-be-viewer]');
    var marco = q(root, '[data-be-viewer-frame]');
    if (marco) marco.innerHTML = '';
    if (caja) caja.classList.add('d-none');
    var dlg = root.closest('.modal-dialog');
    if (dlg) dlg.classList.remove('is-split');
  }
  function visorDeArchivo(root, file) {
    if (!file) return;
    if (root.__beObjUrl) { try { URL.revokeObjectURL(root.__beObjUrl); } catch (e) {} }
    root.__beObjUrl = URL.createObjectURL(file);
    abreVisor(root, root.__beObjUrl, file.name, esImagen(file.name, file.type));
  }
  function visorGuardado(root) {
    // En EDICIÓN el gasto ya tiene su documento: se monta EN EL CLIC que abre el modal (con
    // `modal_stack` por medio, `shown.bs.modal` no siempre llega — regla de la casa).
    var caja = q(root, '[data-be-viewer]');
    var url = caja && caja.getAttribute('data-be-doc-url');
    if (!url || (q(root, '[data-be-viewer-frame]') || {}).innerHTML) return;
    abreVisor(root, url, caja.getAttribute('data-be-doc-label') || 'Documento', esImagen(url, ''));
  }

  /* ---------------------------------------------------------------- 3 · EL PROVEEDOR */
  var caja = null, activo = null, dejarDeSeguir = null;
  var ALTO_MAX = 320;         // una lista más alta tapa media pantalla y no se deja deslizar
  function lista() {
    if (caja) return caja;
    caja = document.createElement('div');
    caja.className = 'ta-results';
    document.body.appendChild(caja);
    if (window.app33FloatList) window.app33FloatList.attach(caja);
    caja.addEventListener('mousedown', function (ev) {
      var it = ev.target.closest('[data-be-pick]');
      if (!it || !activo) return;
      ev.preventDefault();
      var fila = {};
      try { fila = JSON.parse(it.getAttribute('data-be-pick') || '{}'); } catch (e) { fila = {}; }
      if (activo.campo === 'linked') eligeSociedad(activo.root, fila);
      else eligeProveedor(activo.root, fila);
      cierra();
    });
    return caja;
  }
  function cierra() {
    if (caja) caja.style.display = 'none';
    if (dejarDeSeguir) { dejarDeSeguir(); dejarDeSeguir = null; }
  }

  function pinta(root, input, filas, campo) {
    activo = { root: root, campo: campo };
    var b = lista();
    if (!filas.length) {
      b.innerHTML = '<div class="px-2 py-2 small text-muted">No hay nadie con ese nombre. Con el <strong>+</strong> lo creas.</div>';
    } else {
      b.innerHTML = filas.map(function (f) {
        var foto = f.photo_url || '';
        return '<button type="button" class="ta-item" data-be-pick="' + esc(JSON.stringify(f)) + '">' +
          (foto ? '<img src="' + esc(foto) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
                : '<span class="ta-item__noimg"></span>') +
          '<span class="ta-item__t">' + esc(f.name || '—') +
          '<small class="ta-item__s">' + esc(f.kind_label || '') + (f.tax_id ? ' · ' + esc(f.tax_id) : '') + '</small>' +
          '</span></button>';
      }).join('');
    }
    /* ⚠️ SIEMPRE HACIA ABAJO (un desplegable que se abre hacia arriba despista) y SIGUIENDO al
       campo: es `position:fixed`, así que sin `follow` se quedaba quieta al mover la página. */
    var opts = { abajo: true, max: ALTO_MAX };
    if (window.app33FloatList) {
      window.app33FloatList.ensureRoom(input, opts);
      b.style.display = 'block';
      window.app33FloatList.place(input, b, opts);
      if (dejarDeSeguir) dejarDeSeguir();
      dejarDeSeguir = window.app33FloatList.follow(input, b, opts, cierra);
    } else {
      b.style.display = 'block';
    }
  }

  var timers = new WeakMap();
  function busca(root, input, campo) {
    var zona = q(root, '[data-be-provider]');
    var url = (zona && zona.getAttribute('data-url-search')) || '';
    var t = (input.value || '').trim();
    if (!url || t.length < 2) { cierra(); return; }
    clearTimeout(timers.get(input));
    timers.set(input, setTimeout(function () {
      fetch(url + '?q=' + encodeURIComponent(t), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .then(function (d) { pinta(root, input, (d && d.rows) || [], campo); })
        .catch(function () { cierra(); });
    }, 220));
  }

  function chip(f) {
    var foto = f.photo_url || '';
    return '<span class="be-chip">' +
      (foto ? '<img src="' + esc(foto) + '" alt="" onerror="this.remove()">' : '<i class="fa fa-user"></i>') +
      '<span>' + esc(f.name || '—') + '</span>' +
      (f.kind_label ? '<small class="text-muted">· ' + esc(f.kind_label) + '</small>' : '') +
      '<button type="button" class="btn btn-sm btn-link p-0 ms-1 text-danger" data-be-prov-clear title="Quitar"><i class="fa fa-xmark"></i></button>' +
      '</span>';
  }

  function eligeProveedor(root, f) {
    var zona = q(root, '[data-be-provider]');
    if (!zona || !f || !f.id) return;
    q(root, '[data-be-prov-input]').value = '';
    q(root, '[data-be-prov-kind]').value = f.kind || 'promoter';
    q(root, '[data-be-prov-ref]').value = f.id;
    q(root, '[data-be-prov-id]').value = (f.kind === 'promoter') ? f.id : '';
    var elegido = q(root, '[data-be-prov-chosen]');
    elegido.innerHTML = chip(f);
    elegido.classList.remove('d-none');
    zona.__prov = f;
    pintaFacturacion(root, f);
    pideFicha(root);
  }
  function limpiaProveedor(root) {
    var zona = q(root, '[data-be-provider]');
    ['[data-be-prov-kind]', '[data-be-prov-ref]', '[data-be-prov-id]', '[data-be-company-id]',
     '[data-be-billing-id]', '[data-be-billing-company-id]'].forEach(function (sel) {
      var el = q(root, sel); if (el) el.value = '';
    });
    var elegido = q(root, '[data-be-prov-chosen]');
    if (elegido) { elegido.innerHTML = ''; elegido.classList.add('d-none'); }
    var fact = q(root, '[data-be-billing]');
    if (fact) { fact.classList.add('d-none'); q(root, '[data-be-billing-opts]').innerHTML = ''; }
    var link = q(root, '[data-be-linked-wrap]');
    if (link) link.classList.add('d-none');
    if (zona) zona.__prov = null;
    var emb = q(root, '[data-be-prov-embargo]');
    if (emb) emb.classList.add('d-none');
    ocultaFicha(root);
    var auto = q(root, '[data-be-prov-auto]');
    if (auto) auto.classList.add('d-none');
  }

  /* DATOS DE FACTURACIÓN: sus sociedades con logo, o las dos opciones con icono. */
  function pintaFacturacion(root, f, companyId) {
    var fact = q(root, '[data-be-billing]');
    var opts = q(root, '[data-be-billing-opts]');
    if (!fact || !opts) return;
    var empresas = f.companies || [];
    var elegida = String(companyId || '');
    var html = '<label class="be-opt"><input type="radio" name="be_billing" value="SELF"' +
      (elegida ? '' : ' checked') + '><i class="fa fa-user"></i><span>Datos del proveedor</span></label>';
    empresas.forEach(function (c) {
      html += '<label class="be-opt"><input type="radio" name="be_billing" value="C:' + esc(c.id) + '"' +
        (elegida && String(c.id) === elegida ? ' checked' : '') + '>' +
        (c.logo_url ? '<img src="' + esc(c.logo_url) + '" alt="" onerror="this.remove()">' : '<i class="fa fa-building"></i>') +
        '<span>' + esc(c.name) + '</span></label>';
    });
    html += '<label class="be-opt"><input type="radio" name="be_billing" value="LINKED">' +
      '<i class="fa fa-link"></i><span>Factura otra sociedad</span></label>';
    opts.innerHTML = html;
    fact.classList.remove('d-none');
    var cid = q(root, '[data-be-company-id]');
    if (cid) cid.value = elegida;
    var link = q(root, '[data-be-linked-wrap]');
    if (link) link.classList.add('d-none');
  }

  function eligeSociedad(root, f) {
    // La sociedad (o el tercero) que EMITE la factura por el proveedor.
    if (!f || !f.id) return;
    var wrap = q(root, '[data-be-linked-wrap]');
    q(root, '[data-be-linked-input]').value = f.name || '';
    var oculto = q(root, '[data-be-billing-id]');
    if (!oculto) {
      oculto = document.createElement('input');
      oculto.type = 'hidden'; oculto.name = 'provider_billing_id';
      oculto.setAttribute('data-be-billing-id', '');
      wrap.appendChild(oculto);
      var linkFlag = document.createElement('input');
      linkFlag.type = 'hidden'; linkFlag.name = 'provider_billing_link'; linkFlag.value = '1';
      wrap.appendChild(linkFlag);
    }
    oculto.value = (f.kind === 'promoter') ? f.id : '';
    // Si es un medio/artista/persona hay que espejarlo: se manda como proveedor «de facturación».
    var kind = q(root, '[data-be-prov-kind]');
    if (f.kind !== 'promoter' && kind) {
      // Se deja al servidor: el espejo se crea con `provider_kind`/`provider_ref`.
      kind.value = f.kind; q(root, '[data-be-prov-ref]').value = f.id;
      oculto.value = '';
    }
  }

  /* ---------------------------------------------------------------- 3 · SU FICHA: LO QUE FALTA
     ⚠️ Lo que ya tenemos NO se pregunta (se enseña de un vistazo) y lo que falta sale EN AMARILLO
     con lo que diga la factura ya puesto. Al guardar queda en SU ficha: solo se pide una vez. */
  var SUGERENCIAS = { tax_id: 'tax_id', email: 'email', phone: 'phone', bank_account: 'bank_account' };

  function ocultaFicha(root) {
    var card = q(root, '[data-be-prov-card]');
    if (card) card.classList.add('d-none');
    var campos = q(root, '[data-be-prov-fields]');
    if (campos) campos.innerHTML = '';
  }

  function pintaFicha(root, perfil, leido) {
    var card = q(root, '[data-be-prov-card]');
    var campos = q(root, '[data-be-prov-fields]');
    if (!card || !campos || !perfil || !perfil.ok) { ocultaFicha(root); return; }
    root.__bePerfil = perfil;
    var sug = leido || root.__beLeido || {};
    var faltan = [], hechos = [], html = '';
    (perfil.fields || []).forEach(function (f) {
      // La CUENTA vive en el HTML (es la que EXIGE el servidor cuando hay factura): aquí solo se
      // marca en amarillo y se precarga con la que diga la factura.
      if (f.key === 'bank_account') {
        var wrap = q(root, '[data-be-bank-wrap]');
        var input = q(root, '[data-be-bank]');
        if (input) {
          if (!input.value) input.value = f.value || (sug[SUGERENCIAS[f.key]] || '');
          var falta = f.missing && !input.value;
          input.classList.toggle('is-need', !!falta);
          if (wrap) wrap.classList.toggle('inv-need', !!falta);
        }
        (f.missing ? faltan : hechos).push(f.label);
        return;
      }
      if (f.missing) {
        faltan.push(f.label);
        var valor = sug[SUGERENCIAS[f.key]] || '';
        html += '<div class="col-md-6 inv-need"><label class="form-label small"><i class="fa ' +
          esc(f.icon) + ' me-1"></i>' + esc(f.label) + '</label>' +
          '<input class="form-control form-control-sm is-need" name="prov_' + esc(f.key) + '" ' +
          'autocomplete="off" value="' + esc(valor) + '"></div>';
      } else {
        hechos.push(f.label);
        html += '<div class="col-md-6"><span class="be-prov-ok" title="' + esc(f.label) + '">' +
          '<i class="fa ' + esc(f.icon) + '"></i><span class="text-truncate">' + esc(f.value) + '</span></span></div>';
      }
    });
    campos.innerHTML = html;
    var estado = q(root, '[data-be-prov-state]');
    if (estado) {
      estado.className = 'be-prov-card__state ' + (faltan.length ? 'is-need' : 'is-ok');
      estado.innerHTML = faltan.length
        ? '<i class="fa fa-triangle-exclamation me-1"></i>Le falta: ' + esc(faltan.join(', '))
        : '<i class="fa fa-circle-check me-1"></i>Su ficha está completa';
    }
    card.classList.remove('d-none');
    var msg = q(root, '[data-be-prov-msg]');
    if (msg) { msg.textContent = ''; msg.className = 'small'; }
  }

  function pideFicha(root, leido) {
    var zona = q(root, '[data-be-provider]');
    var url = (zona && zona.getAttribute('data-url-profile')) || '';
    var pid = (q(root, '[data-be-prov-id]') || {}).value || '';
    var cid = (q(root, '[data-be-company-id]') || {}).value || '';
    if (leido) root.__beLeido = leido;
    if (!url || !pid) { ocultaFicha(root); return; }
    fetch(url + '?id=' + encodeURIComponent(pid) + (cid ? '&company_id=' + encodeURIComponent(cid) : ''),
          { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { pintaFicha(root, d, leido); })
      .catch(function () { /* es una AYUDA: sin ella el gasto se guarda igual */ });
  }

  function guardaProveedor(root, boton) {
    var zona = q(root, '[data-be-provider]');
    var url = (zona && zona.getAttribute('data-url-save')) || '';
    var pid = (q(root, '[data-be-prov-id]') || {}).value || '';
    var msg = q(root, '[data-be-prov-msg]');
    if (!url || !pid) {
      if (msg) { msg.className = 'small text-danger'; msg.textContent = 'Antes hay que elegir quién nos factura.'; }
      return;
    }
    var datos = new FormData();
    datos.append('provider_id', pid);
    datos.append('company_id', (q(root, '[data-be-company-id]') || {}).value || '');
    root.querySelectorAll('[name^="prov_"]').forEach(function (el) { datos.append(el.name, el.value || ''); });
    var banco = q(root, '[data-be-bank]');
    if (banco) datos.append('bank_account', banco.value || '');
    if (boton) boton.disabled = true;
    if (msg) { msg.className = 'small text-muted'; msg.textContent = 'Guardando…'; }
    fetch(url, { method: 'POST', body: datos,
                 headers: Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, csrf()) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (boton) boton.disabled = false;
        if (!res.ok || !res.d || res.d.ok === false) {
          if (msg) { msg.className = 'small text-danger'; msg.textContent = (res.d && res.d.error) || 'No se ha podido guardar.'; }
          return;
        }
        pintaFicha(root, res.d);
        if (msg) { msg.className = 'small text-success'; msg.textContent = 'Guardado en su ficha.'; }
      })
      .catch(function () {
        if (boton) boton.disabled = false;
        if (msg) { msg.className = 'small text-danger'; msg.textContent = 'No se ha podido guardar.'; }
      });
  }

  /* ---------------------------------------------------------------- 1 · LO QUE DICE EL DOCUMENTO */
  function ponDoc(root, res, nombre) {
    var badge = q(root, '[data-be-doc-kind]');
    var campos = q(root, '[data-be-doc-fields]');
    var esTicket = (res && res.kind) === 'TICKET';
    var radio = root.querySelector('input[name="document_type"][value="' + (esTicket ? 'TICKET' : 'FACTURA') + '"]');
    if (radio) { radio.checked = true; }
    else { var hidden = q(root, '[data-be-doc-type]'); if (hidden) hidden.value = esTicket ? 'TICKET' : 'FACTURA'; }
    if (badge) {
      badge.textContent = esTicket ? 'Ticket · sin desglose de IVA' : 'Factura · con IVA desglosado';
      badge.classList.remove('d-none');
    }
    if (campos) campos.classList.remove('d-none');
    var est = q(root, '[data-be-establishment-wrap]');
    if (est) est.classList.toggle('d-none', !esTicket);
    var leidos = [];
    var invnum = q(root, '[data-be-invnum]');
    if (invnum && res && res.invoice_number && !invnum.value) { invnum.value = res.invoice_number; leidos.push('el nº'); }
    var issue = q(root, '[data-be-issue]');
    if (issue && res && res.issue_date && !issue.value) { issue.value = res.issue_date; leidos.push('la fecha'); }
    var ret = root.querySelector('input[name="retention_amount"]');
    if (ret && res && res.retention_amount && !num(ret.value)) {
      ret.value = String(res.retention_amount).replace('.', ',');
      leidos.push('la retención');
    }
    // El IMPORTE: lo que diga el documento (con IVA), y el modo se ajusta a lo que se ha leído.
    var valor = q(root, 'input[name="amount_value"]');
    if (valor && !num(valor.value) && res) {
      var total = res.amount_gross || res.amount_net || '';
      if (total) {
        valor.value = String(total).replace('.', ',');
        var gross = q(root, 'input[name="amount_mode"][value="GROSS"]');
        if (gross) { gross.checked = true; }
        leidos.push('el importe');
      }
    }
    if (res && res.vat_pct) {
      var pct = q(root, '[data-be-vat-pct]');
      if (pct) pct.value = String(res.vat_pct).replace(',', '.');
    }
    var concepto = q(root, 'input[name="concept"]');
    if (concepto && !concepto.value.trim()) {
      concepto.value = (res && res.concept) ? res.concept : (nombre || '').replace(/\.[a-z0-9]+$/i, '');
      if (res && res.concept) leidos.push('el concepto');
      if (window.app33FormCheck) window.app33FormCheck.ok(concepto);
    }
    // ⚠️⚠️ QUIÉN NOS FACTURA: si el proveedor está en la base, se elige SOLO (por su CIF, por su
    // cuenta o por su nombre) y se pide su ficha para pintar en amarillo lo que le falte.
    root.__beLeido = res || {};
    var yaHay = (q(root, '[data-be-prov-id]') || {}).value || '';
    var auto = q(root, '[data-be-prov-auto]');
    if (res && res.provider && res.provider.id && !yaHay) {
      eligeProveedor(root, res.provider);
      if (res.provider_company_id) {
        pintaFacturacion(root, res.provider, res.provider_company_id);
      }
      if (auto) {
        auto.innerHTML = '<i class="fa fa-wand-magic-sparkles me-1"></i>Reconocido por ' +
          esc({ CIF: 'su CIF', CUENTA: 'su cuenta', NOMBRE: 'su nombre' }[res.matched_by] || 'la factura');
        auto.classList.remove('d-none');
      }
      leidos.push('el proveedor');
      pideFicha(root, res);
    } else if (yaHay) {
      pideFicha(root, res);
    }
    var nota = q(root, '[data-be-read-note]');
    if (nota) {
      if (leidos.length) {
        nota.innerHTML = '<i class="fa fa-circle-check me-1"></i>De la factura se han cogido <strong>' +
          esc(leidos.join(', ')) + '</strong>. Repásalo con el documento al lado.';
        nota.classList.remove('d-none');
      } else {
        nota.innerHTML = '<i class="fa fa-circle-info me-1"></i>No se ha podido leer nada del documento: rellénalo a mano.';
        nota.className = 'alert alert-warning py-2 px-3 small mt-2 mb-0';
        nota.classList.remove('d-none');
      }
    }
    pintaIva(root);
  }

  function leeDoc(root, input) {
    var zona = q(root, '[data-be-doc]');
    var url = (zona && zona.getAttribute('data-url-detect')) || '';
    var f = input.files && input.files[0];
    var nombre = q(root, '[data-be-doc-name]');
    if (!f) {
      if (nombre) nombre.textContent = 'Arrastra aquí la factura o el ticket, o pincha para elegirlo';
      return;
    }
    if (nombre) nombre.textContent = input.files.length > 1
      ? (input.files.length + ' documentos · se creará un gasto por cada uno')
      : f.name;
    // LA FACTURA, A LA IZQUIERDA: se pinta desde el propio archivo, sin subirla todavía.
    if (input.files.length === 1) visorDeArchivo(root, f);
    if (!url || input.files.length > 1) { return; }
    var datos = new FormData();
    datos.append('document', f);
    fetch(url, {
      method: 'POST', body: datos,
      headers: Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, csrf())
    }).then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) ponDoc(root, d, f.name); })
      .catch(function () { /* es una AYUDA: si no se puede leer, se rellena a mano */ });
  }

  /* ---------------------------------------------------------------- eventos (delegados) */
  document.addEventListener('input', function (e) {
    var root = form(e.target);
    if (!root) return;
    if (e.target.matches('input[name="amount_value"], [data-be-vat-pct]')) pintaIva(root);
    if (e.target.matches('[data-be-prov-input]')) busca(root, e.target, 'prov');
    if (e.target.matches('[data-be-linked-input]')) busca(root, e.target, 'linked');
  });
  document.addEventListener('focusin', function (e) {
    var root = form(e.target);
    if (!root) return;
    if (e.target.matches('[data-be-prov-input], [data-be-linked-input]') && (e.target.value || '').trim().length >= 2) {
      busca(root, e.target, e.target.matches('[data-be-linked-input]') ? 'linked' : 'prov');
    }
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.matches && e.target.matches('[data-be-prov-input], [data-be-linked-input]')) setTimeout(cierra, 180);
  });
  document.addEventListener('change', function (e) {
    var root = form(e.target);
    if (!root) return;
    if (e.target.matches('input[name="amount_mode"], [data-be-doc-type]')) pintaIva(root);
    if (e.target.matches('[data-be-doc-input]')) leeDoc(root, e.target);
    // ¿Pagado? → completo o parcial y método.
    if (e.target.matches('input[name="payment_status"]')) {
      var pagado = e.target.value === 'PAGADO' && e.target.checked;
      var panel = q(root, '[data-be-pay-panel]');
      if (panel) panel.classList.toggle('d-none', !pagado);
    }
    if (e.target.matches('input[name="paid_kind"]')) {
      var parcial = e.target.value === 'PARTIAL' && e.target.checked;
      var wrap = q(root, '[data-be-paid-amount-wrap]');
      if (wrap) wrap.classList.toggle('d-none', !parcial);
      /* ⚠️ El ESTADO lo decide el SERVIDOR con `payment_status` + `paid_kind` (completo o parcial) y
         el importe pagado: aquí no se manda un segundo `payment_status` (dos campos con el mismo
         nombre se pisan al leerlos). */
    }
    // Datos de facturación: sus sociedades, o la de otro.
    if (e.target.matches('input[name="be_billing"]')) {
      var v = e.target.value || 'SELF';
      var cid = q(root, '[data-be-company-id]');
      var link = q(root, '[data-be-linked-wrap]');
      if (cid) cid.value = (v.indexOf('C:') === 0) ? v.slice(2) : '';
      if (link) link.classList.toggle('d-none', v !== 'LINKED');
      if (v !== 'LINKED') {
        var bid = q(root, '[data-be-billing-id]');
        if (bid) bid.value = '';
      }
      // La ficha que hay que completar es la de QUIEN COBRA: si factura una sociedad, la de ella.
      if (v !== 'LINKED') pideFicha(root);
    }
    // El alta rápida deja el tercero nuevo en el `<select>` oculto: se recoge de ahí.
    if (e.target.matches('[data-be-prov-select]')) {
      var opt = e.target.options[e.target.selectedIndex];
      if (opt && opt.value) {
        eligeProveedor(root, { kind: 'promoter', kind_label: 'Tercero', id: opt.value,
                               name: opt.textContent, photo_url: (opt.dataset.photo || opt.dataset.logo || ''),
                               companies: [] });
      }
    }
    if (e.target.matches('[data-be-linked-select]')) {
      var o2 = e.target.options[e.target.selectedIndex];
      if (o2 && o2.value) eligeSociedad(root, { kind: 'promoter', id: o2.value, name: o2.textContent });
    }
  });
  document.addEventListener('click', function (e) {
    /* EN EDICIÓN el documento ya está subido: el visor se monta EN EL CLIC que abre el modal
       (`shown.bs.modal` no siempre llega con `modal_stack` por medio). */
    var abre = e.target.closest ? e.target.closest('[data-bs-toggle="modal"][data-bs-target]') : null;
    if (abre) {
      var destino = document.querySelector(abre.getAttribute('data-bs-target'));
      var dentro = destino ? destino.querySelector('[data-bag-expense-form]') : null;
      if (dentro) setTimeout(function () { visorGuardado(dentro); }, 60);
    }
    var root = form(e.target);
    if (!root) return;
    if (e.target.closest('[data-be-prov-clear]')) { e.preventDefault(); limpiaProveedor(root); return; }
    if (e.target.closest('[data-be-viewer-hide]')) { e.preventDefault(); cierraVisor(root); return; }
    if (e.target.closest('[data-be-viewer-show]')) { e.preventDefault(); visorGuardado(root); return; }
    var guardar = e.target.closest('[data-be-prov-save]');
    if (guardar) { e.preventDefault(); guardaProveedor(root, guardar); return; }
    if (e.target.closest('[data-be-alert-toggle]')) {
      e.preventDefault();
      var panel = q(root, '[data-be-alert-panel]');
      if (panel) panel.classList.toggle('d-none');
      return;
    }
    var preset = e.target.closest('[data-be-alert-preset]');
    if (preset) {
      e.preventDefault();
      var dias = parseInt(preset.getAttribute('data-be-alert-preset'), 10) || 0;
      var d = fechaBase(root);
      d.setDate(d.getDate() - dias);
      var campo = q(root, '[data-be-alert-date]');
      if (campo) campo.value = iso(d);
      return;
    }
  });

  /* Repintado inicial: en EDICIÓN el formulario llega precargado, así que el desglose del IVA se
     tiene que ver sin tocar nada. Se re-engancha con los eventos de la casa porque el panel de la
     bolsa se pinta también embebido en fichas cuyas zonas se repintan por AJAX. */
  function pintaTodos() {
    document.querySelectorAll('[data-bag-expense-form]').forEach(function (root) { pintaIva(root); });
  }
  document.addEventListener('DOMContentLoaded', pintaTodos);
  document.addEventListener('inline:updated', pintaTodos);
  document.addEventListener('ficha:shown', pintaTodos);
  if (document.readyState !== 'loading') { try { pintaTodos(); } catch (e) {} }

  window.app33BagExpense = { paintVat: pintaIva, docType: tipoDoc, providerCard: pideFicha };
})();
