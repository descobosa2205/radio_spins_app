/* ══════════════════════════════════════════════════════════════════════════════════════════════
   EL EDITOR DE NOTAS DE PRENSA

   El lienzo mide 600 (las unidades del diseño) y se ESCALA con `transform` al hueco que haya. Encima
   del fondo, los BLOQUES: titular y textos (contenteditable, con negrita · cursiva · subrayado ·
   enlaces · alineación · tipografía · color; el tamaño es del bloque) y MÓDULOS (audio, repertorio,
   videoclip, enlaces, fotos, contacto), cuyo HTML lo pinta el SERVIDOR con el mismo motor que el
   correo. Cada bloque se arrastra desde su asa y se redimensiona desde la esquina; un texto crece
   solo si el contenido no cabe.
   Lo que se guarda es el DISEÑO (JSON): de él salen el correo, la página, el PDF y la miniatura.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('[data-pr-editor]');
  if (!root) return;
  var W = 600;
  var canvas = root.querySelector('[data-pr-canvas]');
  var wrap = root.querySelector('[data-pr-wrap]');
  var stage = root.querySelector('[data-pr-stage]');
  var toolbar = root.querySelector('[data-pr-toolbar]');
  var canEdit = root.getAttribute('data-can-edit') === '1';
  var design = { width: W, bg: {}, blocks: [] };
  try { design = JSON.parse((document.getElementById('prDesign') || {}).textContent || '{}') || design; } catch (e) {}
  design.blocks = Array.isArray(design.blocks) ? design.blocks : [];
  design.bg = design.bg || {};
  var k = 1, sel = null, dirty = false, assets = null;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }
  function marca(t) { dirty = true; var s = root.querySelector('[data-pr-saved]'); if (s) s.textContent = t || 'Sin guardar'; }

  /* ---------- geometría ---------- */
  function bgH() { var b = design.bg || {}; return (b.w > 0 && b.h > 0) ? W * b.h / b.w : 0; }
  function canvasH() {
    var abajo = 0;
    design.blocks.forEach(function (b) { abajo = Math.max(abajo, (b.y || 0) + (b.h || 0)); });
    var fondo = bgH();
    return Math.max(fondo, abajo + (abajo > fondo ? 24 : 0), 220);
  }
  function escala() {
    var ancho = Math.max(200, stage.clientWidth - 24);
    k = Math.min(1, ancho / W);
    canvas.style.transform = 'scale(' + k + ')';
    wrap.style.height = Math.round(canvasH() * k) + 'px';
    wrap.style.width = Math.round(W * k) + 'px';
    colocaToolbar();
  }
  function pintaFondo() {
    var b = design.bg || {};
    canvas.style.height = Math.round(canvasH()) + 'px';
    canvas.style.width = W + 'px';
    canvas.style.background = b.url ? ('#fff url(' + b.url + ') no-repeat 0 0 / ' + W + 'px auto') : '#fff';
    var vacio = root.querySelector('[data-pr-empty]');
    if (vacio) vacio.classList.toggle('d-none', !!b.url);
    escala();
  }

  /* ---------- bloques ---------- */
  function estiloTexto(b) {
    var st = b.style || {};
    return 'font-family:' + (st.font || 'Arial, Helvetica, sans-serif') + ';font-size:' + (st.size || (b.type === 'title' ? 26 : 15)) + 'px;' +
      'line-height:' + (st.line || (b.type === 'title' ? 1.25 : 1.45)) + ';color:' + (st.color || '#111827') + ';text-align:' + (st.align || 'left') + ';' +
      (st.bold ? 'font-weight:700;' : '');
  }
  function elDe(id) { return canvas.querySelector('.pr-blk[data-id="' + id + '"]'); }
  function pintaBloque(b) {
    var el = elDe(b.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pr-blk pr-blk--' + b.type;
      el.setAttribute('data-id', b.id);
      el.innerHTML = '<div class="pr-blk__grip" title="Arrastra para mover"><i class="fa fa-grip-lines"></i></div>' +
        '<div class="pr-blk__body"></div><div class="pr-blk__rs" title="Arrastra para cambiar el tamaño"></div>';
      canvas.appendChild(el);
      var body = el.querySelector('.pr-blk__body');
      if (b.type === 'title' || b.type === 'text') {
        var t = document.createElement('div');
        t.className = 'pr-blk__text';
        t.contentEditable = canEdit ? 'true' : 'false';
        t.innerHTML = b.html || '<p>Escribe aquí…</p>';
        t.setAttribute('data-placeholder', b.type === 'title' ? 'Titular' : 'Texto');
        body.appendChild(t);
      } else {
        var m = document.createElement('div');
        m.className = 'pr-blk__mod';
        m.innerHTML = b.html_cache || '<div class="text-muted small p-2">Cargando…</div>';
        body.appendChild(m);
        if (!b.html_cache) refrescaModulo(b);
      }
    }
    el.style.left = Math.round(b.x) + 'px';
    el.style.top = Math.round(b.y) + 'px';
    el.style.width = Math.round(b.w) + 'px';
    if (b.type === 'title' || b.type === 'text') {
      el.style.height = Math.round(b.h) + 'px';
      var txt = el.querySelector('.pr-blk__text');
      txt.setAttribute('style', estiloTexto(b));
    } else {
      el.style.height = 'auto';
    }
    return el;
  }
  function pintaTodo() {
    pintaFondo();
    design.blocks.forEach(pintaBloque);
    canvas.style.height = Math.round(canvasH()) + 'px';
    escala();
  }
  function refrescaModulo(b) {
    post(root.getAttribute('data-block-url'), { type: b.type, ref: b.ref || {}, opts: b.opts || {}, w: b.w }).then(function (js) {
      var el = elDe(b.id); if (!el) return;
      var m = el.querySelector('.pr-blk__mod');
      if (js && js.ok) { b.html_cache = js.html; m.innerHTML = js.html || '<div class="text-muted small p-2">(vacío)</div>'; }
      else m.innerHTML = '<div class="text-danger small p-2">No se pudo pintar el módulo.</div>';
      ajustaAltoModulo(b);
    });
  }
  function ajustaAltoModulo(b) {
    var el = elDe(b.id); if (!el) return;
    var h = el.offsetHeight;
    if (h && Math.abs(h - b.h) > 1) { b.h = h; canvas.style.height = Math.round(canvasH()) + 'px'; escala(); }
  }
  function crecerTexto(b) {
    var el = elDe(b.id); if (!el) return;
    var t = el.querySelector('.pr-blk__text');
    var necesario = t.scrollHeight + 8;
    if (necesario > b.h) { b.h = necesario; el.style.height = Math.round(b.h) + 'px'; canvas.style.height = Math.round(canvasH()) + 'px'; escala(); }
  }
  function bloque(id) { return design.blocks.filter(function (b) { return b.id === id; })[0]; }

  /* ---------- seleccionar ---------- */
  function selecciona(id) {
    sel = id;
    canvas.querySelectorAll('.pr-blk').forEach(function (e) { e.classList.toggle('is-sel', e.getAttribute('data-id') === id); });
    var b = bloque(id);
    toolbar.classList.toggle('d-none', !b || (b.type !== 'title' && b.type !== 'text'));
    if (b && (b.type === 'title' || b.type === 'text')) {
      var st = b.style || {};
      var f = toolbar.querySelector('[data-pr-font]'); if (f) f.value = st.font || f.options[0].value;
      var n = toolbar.querySelector('[data-pr-size-input]'); if (n) n.value = st.size || (b.type === 'title' ? 26 : 15);
      var c = toolbar.querySelector('[data-pr-color]'); if (c) c.value = /^#[0-9a-fA-F]{6}$/.test(st.color || '') ? st.color : '#111827';
    }
    colocaToolbar();
    pintaProps(b);
  }
  function colocaToolbar() {
    if (toolbar.classList.contains('d-none') || !sel) return;
    var el = elDe(sel); if (!el) return;
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    var top = r.top - s.top + stage.scrollTop - toolbar.offsetHeight - 8;
    if (top < 4) top = r.bottom - s.top + stage.scrollTop + 8;
    toolbar.style.top = Math.round(top) + 'px';
    toolbar.style.left = Math.round(Math.max(4, Math.min(r.left - s.left + stage.scrollLeft, stage.clientWidth - toolbar.offsetWidth - 4))) + 'px';
  }
  function pintaProps(b) {
    var box = root.querySelector('[data-pr-props]'), body = root.querySelector('[data-pr-props-body]');
    if (!box || !body) return;
    if (!b) { box.classList.add('d-none'); return; }
    box.classList.remove('d-none');
    var o = b.opts || {};
    var html = '<div class="small text-muted mb-2">' + esc({ title: 'Titular', text: 'Texto', audio: 'Audio', album: 'Repertorio del disco', video: 'Videoclip', links: 'Enlaces de plataformas', contact: 'Contacto de prensa', photos: 'Fotos' }[b.type] || b.type) + '</div>';
    if (b.type === 'audio' || b.type === 'album' || b.type === 'video' || b.type === 'photos') {
      html += '<label class="form-check"><input type="checkbox" class="form-check-input" data-pr-opt="download"' + (o.download ? ' checked' : '') + '> Se puede <b>descargar</b>' +
        (b.type === 'photos' ? ' (las fotos)' : (b.type === 'video' ? ' (el vídeo)' : ' (el audio)')) + '</label>' +
        '<div class="form-text">Sin marcarlo solo se ' + (b.type === 'photos' ? 've' : (b.type === 'video' ? 've' : 'escucha')) + '.</div>';
    }
    if (b.type === 'links') {
      html += '<div class="small fw-semibold mb-1">Alineación</div><div class="btn-group btn-group-sm" role="group">' +
        ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="btn ' + ((o.align || 'center') === a ? 'btn-dark' : 'btn-outline-secondary') + '" data-pr-opt-align="' + a + '"><i class="fa fa-align-' + a + '"></i></button>'; }).join('') + '</div>';
    }
    html += '<div class="mt-3 d-flex gap-2 flex-wrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-pr-dup><i class="fa fa-clone me-1"></i>Duplicar</button>' +
      '<button type="button" class="btn btn-sm btn-outline-danger" data-pr-del><i class="fa fa-trash me-1"></i>Eliminar</button></div>';
    body.innerHTML = html;
  }
  root.addEventListener('change', function (ev) {
    var opt = ev.target.closest('[data-pr-opt]');
    if (opt && sel) { var b = bloque(sel); b.opts = b.opts || {}; b.opts[opt.getAttribute('data-pr-opt')] = opt.checked; marca(); refrescaModulo(b); }
  });
  root.addEventListener('click', function (ev) {
    var al = ev.target.closest('[data-pr-opt-align]');
    if (al && sel) { var b = bloque(sel); b.opts = b.opts || {}; b.opts.align = al.getAttribute('data-pr-opt-align'); marca(); refrescaModulo(b); pintaProps(b); return; }
    if (ev.target.closest('[data-pr-del]') && sel) { borra(sel); return; }
    if (ev.target.closest('[data-pr-dup]') && sel) {
      var o = bloque(sel), c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.y = o.y + o.h + 12; delete c.html_cache;
      if (c.type === 'title' || c.type === 'text') c.html = elDe(o.id).querySelector('.pr-blk__text').innerHTML;
      design.blocks.push(c); pintaBloque(c); marca(); selecciona(c.id);
    }
  });
  function borra(id) {
    var el = elDe(id); if (el) el.remove();
    design.blocks = design.blocks.filter(function (b) { return b.id !== id; });
    sel = null; toolbar.classList.add('d-none'); pintaProps(null); marca();
    canvas.style.height = Math.round(canvasH()) + 'px'; escala();
  }

  /* ---------- mover y redimensionar (eventos de puntero: vale con el ratón y con el dedo) ---------- */
  var drag = null;
  canvas.addEventListener('pointerdown', function (ev) {
    var el = ev.target.closest('.pr-blk');
    if (!el || !canEdit) return;
    var id = el.getAttribute('data-id'), b = bloque(id);
    selecciona(id);
    var rs = ev.target.closest('.pr-blk__rs'), grip = ev.target.closest('.pr-blk__grip');
    var esTexto = (b.type === 'title' || b.type === 'text');
    // Un módulo se mueve agarrándolo por cualquier sitio; un texto, por su asa (dentro se escribe).
    if (!rs && !grip && esTexto) return;
    ev.preventDefault();
    drag = { id: id, modo: rs ? 'rs' : 'mv', x0: ev.clientX, y0: ev.clientY, bx: b.x, by: b.y, bw: b.w, bh: b.h };
    el.classList.add('is-dragging');
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var b = bloque(drag.id); if (!b) return;
    var dx = (ev.clientX - drag.x0) / k, dy = (ev.clientY - drag.y0) / k;
    if (drag.modo === 'mv') {
      b.x = Math.max(0, Math.min(W - 40, drag.bx + dx));
      b.y = Math.max(0, drag.by + dy);
    } else {
      b.w = Math.max(60, Math.min(W - b.x, drag.bw + dx));
      if (b.type === 'title' || b.type === 'text') b.h = Math.max(24, drag.bh + dy);
    }
    pintaBloque(b);
    canvas.style.height = Math.round(canvasH()) + 'px';
    escala();
  });
  function sueltaDrag(ev) {
    if (!drag) return;
    var el = elDe(drag.id); if (el) el.classList.remove('is-dragging');
    var b = bloque(drag.id);
    if (b && b.type !== 'title' && b.type !== 'text') ajustaAltoModulo(b);
    if (b && (b.type === 'title' || b.type === 'text')) crecerTexto(b);
    drag = null; marca(); colocaToolbar();
  }
  canvas.addEventListener('pointerup', sueltaDrag);
  canvas.addEventListener('pointercancel', sueltaDrag);

  /* ---------- escribir ---------- */
  canvas.addEventListener('input', function (ev) {
    var t = ev.target.closest('.pr-blk__text'); if (!t) return;
    var b = bloque(t.closest('.pr-blk').getAttribute('data-id'));
    b.html = t.innerHTML; crecerTexto(b); marca();
  });
  canvas.addEventListener('focusin', function (ev) {
    var el = ev.target.closest('.pr-blk'); if (el) selecciona(el.getAttribute('data-id'));
  });
  // Pegar: solo texto y formato básico (el servidor lo vuelve a sanear).
  canvas.addEventListener('paste', function (ev) {
    var t = ev.target.closest('.pr-blk__text'); if (!t) return;
    ev.preventDefault();
    var html = (ev.clipboardData || window.clipboardData).getData('text/html');
    var texto = (ev.clipboardData || window.clipboardData).getData('text/plain');
    if (html) {
      var tmp = document.createElement('div'); tmp.innerHTML = html;
      tmp.querySelectorAll('script,style,img,table,iframe,meta,link').forEach(function (n) { n.remove(); });
      tmp.querySelectorAll('*').forEach(function (n) {
        var mant = {};
        var st = n.style || {};
        if (/bold|[6-9]00/.test(st.fontWeight || '')) mant.b = 1;
        if ((st.fontStyle || '') === 'italic') mant.i = 1;
        if ((st.textDecoration || '').indexOf('underline') >= 0) mant.u = 1;
        var color = st.color || '';
        Array.prototype.slice.call(n.attributes).forEach(function (a) { if (a.name !== 'href') n.removeAttribute(a.name); });
        if (color) n.style.color = color;
        if (mant.b && n.tagName !== 'B') { var bb = document.createElement('b'); bb.innerHTML = n.innerHTML; n.innerHTML = ''; n.appendChild(bb); }
      });
      document.execCommand('insertHTML', false, tmp.innerHTML);
    } else {
      document.execCommand('insertText', false, texto);
    }
  });

  /* ---------- la barra del texto ---------- */
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  function enlaceDeSeleccion() {
    var s = window.getSelection(); if (!s || !s.rangeCount) return null;
    var n = s.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    return n.closest ? n.closest('a') : null;
  }
  toolbar.addEventListener('mousedown', function (ev) { if (!ev.target.closest('select,input')) ev.preventDefault(); });
  toolbar.addEventListener('click', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b) return;
    var btn = ev.target.closest('[data-pr-cmd]');
    var sz = ev.target.closest('[data-pr-size]');
    var el = elDe(sel), t = el && el.querySelector('.pr-blk__text');
    if (sz) {
      b.style = b.style || {}; b.style.size = Math.max(8, Math.min(96, (parseInt(b.style.size, 10) || (b.type === 'title' ? 26 : 15)) + parseInt(sz.getAttribute('data-pr-size'), 10)));
      toolbar.querySelector('[data-pr-size-input]').value = b.style.size; pintaBloque(b); crecerTexto(b); marca(); return;
    }
    if (!btn) return;
    var cmd = btn.getAttribute('data-pr-cmd');
    if (cmd === 'delete') { borra(sel); return; }
    if (!t) return;
    t.focus();
    if (cmd === 'link') {
      var a = enlaceDeSeleccion();
      var url = window.prompt('Dirección del enlace (https://…)', a ? a.getAttribute('href') : 'https://');
      if (!url) return;
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = 'https://' + url;
      if (a) { a.setAttribute('href', url); }
      else {
        document.execCommand('createLink', false, url);
        // Un enlace nuevo va SUBRAYADO por defecto (después se le puede quitar con el botón de subrayado).
        t.querySelectorAll('a[href="' + url.replace(/"/g, '&quot;') + '"]').forEach(function (x) { if (!x.style.textDecoration) x.style.textDecoration = 'underline'; });
      }
    } else if (cmd === 'unlink') {
      document.execCommand('unlink', false, null);
    } else if (cmd === 'underline') {
      var a2 = enlaceDeSeleccion();
      // En un enlace, el botón de subrayado quita o pone SU subrayado (el enlace sigue siendo enlace).
      if (a2) a2.style.textDecoration = (a2.style.textDecoration === 'none') ? 'underline' : 'none';
      else document.execCommand('underline', false, null);
    } else {
      document.execCommand(cmd, false, null);
    }
    b.html = t.innerHTML; crecerTexto(b); marca();
  });
  toolbar.addEventListener('change', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b) return;
    var el = elDe(sel), t = el && el.querySelector('.pr-blk__text');
    if (ev.target.matches('[data-pr-font]')) {
      var s = window.getSelection();
      if (t && s && s.rangeCount && !s.isCollapsed && t.contains(s.anchorNode)) {
        t.focus(); document.execCommand('fontName', false, ev.target.value); b.html = t.innerHTML;
      } else { b.style = b.style || {}; b.style.font = ev.target.value; pintaBloque(b); }
      marca(); crecerTexto(b);
    }
    if (ev.target.matches('[data-pr-size-input]')) {
      b.style = b.style || {}; b.style.size = Math.max(8, Math.min(96, parseInt(ev.target.value, 10) || 15)); pintaBloque(b); crecerTexto(b); marca();
    }
  });
  toolbar.addEventListener('input', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b) return;
    if (ev.target.matches('[data-pr-color]')) {
      var el = elDe(sel), t = el && el.querySelector('.pr-blk__text');
      var s = window.getSelection();
      if (t && s && s.rangeCount && !s.isCollapsed && t.contains(s.anchorNode)) {
        t.focus(); document.execCommand('foreColor', false, ev.target.value); b.html = t.innerHTML;
      } else { b.style = b.style || {}; b.style.color = ev.target.value; pintaBloque(b); }
      marca();
    }
  });

  /* ---------- añadir: desde la paleta (arrastrando o pinchando) ---------- */
  function nuevoBloque(tipo, x, y, extra) {
    var b = { id: uid(), type: tipo, x: (x == null ? 40 : x), y: y, w: 520, h: 60 };
    if (tipo === 'title') { b.h = 60; b.html = '<p>Titular de la nota de prensa</p>'; b.style = { size: 28, bold: true, align: 'left', line: 1.2, color: '#111827' }; }
    else if (tipo === 'text') { b.h = 120; b.html = '<p>Escribe o pega aquí el texto de la nota…</p>'; b.style = { size: 15, bold: false, align: 'left', line: 1.45, color: '#111827' }; }
    else { b.ref = (extra && extra.ref) || {}; b.opts = { download: false, align: 'center' }; b.h = 90; }
    if (y == null) { var abajo = Math.max(bgH() * 0.55, 0); design.blocks.forEach(function (o) { abajo = Math.max(abajo, o.y + o.h + 16); }); b.y = abajo; }
    design.blocks.push(b);
    pintaBloque(b);
    canvas.style.height = Math.round(canvasH()) + 'px'; escala();
    marca(); selecciona(b.id);
    if (tipo === 'title' || tipo === 'text') { var t = elDe(b.id).querySelector('.pr-blk__text'); t.focus(); document.execCommand('selectAll', false, null); }
    return b;
  }
  root.addEventListener('dragstart', function (ev) {
    var p = ev.target.closest('[data-pr-pal]'); if (!p) return;
    ev.dataTransfer.setData('text/plain', JSON.stringify({ type: p.getAttribute('data-pr-pal'), ref: JSON.parse(p.getAttribute('data-pr-ref') || '{}') }));
    ev.dataTransfer.effectAllowed = 'copy';
  });
  canvas.addEventListener('dragover', function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; canvas.classList.add('is-over'); });
  canvas.addEventListener('dragleave', function () { canvas.classList.remove('is-over'); });
  canvas.addEventListener('drop', function (ev) {
    ev.preventDefault(); canvas.classList.remove('is-over');
    var datos; try { datos = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}'); } catch (e) { return; }
    if (!datos.type) return;
    var r = canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left) / k, y = (ev.clientY - r.top) / k;
    nuevoBloque(datos.type, Math.max(0, Math.min(W - 520, x - 20)), Math.max(0, y - 10), { ref: datos.ref });
  });
  root.addEventListener('click', function (ev) {
    var p = ev.target.closest('[data-pr-pal]');
    if (p && !ev.target.closest('.pr-pal__hint')) nuevoBloque(p.getAttribute('data-pr-pal'), null, null, { ref: JSON.parse(p.getAttribute('data-pr-ref') || '{}') });
  });

  /* ---------- los módulos disponibles ---------- */
  function cargaModulos() {
    var box = root.querySelector('[data-pr-modules]');
    fetch(root.getAttribute('data-assets-url')).then(function (r) { return r.json(); }).then(function (js) {
      assets = js || {};
      var grupos = [['audios', 'Audio (escuchar / descargar)', 'fa-music'], ['albums', 'Repertorio del disco', 'fa-compact-disc'], ['videos', 'Videoclip', 'fa-film'],
                    ['links', 'Enlaces de plataformas', 'fa-link'], ['photos', 'Fotos', 'fa-images'], ['contact', 'Contacto de prensa', 'fa-address-card']];
      var html = '';
      grupos.forEach(function (g) {
        var items = assets[g[0]] || [];
        if (!items.length) return;
        html += '<div class="pr-pal-group"><div class="pr-pal-group__t"><i class="fa ' + g[2] + '"></i>' + esc(g[1]) + '</div>' + items.map(function (it) {
          return '<div class="pr-pal" draggable="true" data-pr-pal="' + esc(it.kind) + '" data-pr-ref="' + esc(JSON.stringify(it.ref || {})) + '">' +
            (it.cover ? '<img class="pr-pal__cover" src="' + esc(it.cover) + '" alt="">' : '<span class="pr-pal__ico"><i class="fa ' + g[2] + '"></i></span>') +
            '<span><b>' + esc(it.label) + '</b><small>' + esc(it.sub || '') + '</small></span></div>';
        }).join('') + '</div>';
      });
      box.innerHTML = html || '<div class="text-muted small">No hay módulos para este sujeto (sin audios, discos ni fotos).</div>';
    }).catch(function () { box.innerHTML = '<div class="text-danger small">No se pudieron cargar los módulos.</div>'; });
  }

  /* ---------- fondo y plantillas ---------- */
  function subeFondo(file) {
    if (!file) return;
    var fd = new FormData(); fd.append('file', file);
    marca('Subiendo el fondo…');
    fetch(root.getAttribute('data-bg-url'), { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (js) {
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo subir el fondo.'); return; }
      design.bg = js.bg; pintaFondo(); marca('Fondo cambiado · sin guardar el resto');
    });
  }
  root.querySelectorAll('[data-pr-bg-file]').forEach(function (inp) { inp.addEventListener('change', function () { subeFondo(inp.files && inp.files[0]); inp.value = ''; }); });
  function cargaPlantillas() {
    var menu = root.querySelector('[data-pr-templates-menu]'); if (!menu) return;
    fetch(root.getAttribute('data-templates-url')).then(function (r) { return r.json(); }).then(function (js) {
      var tpls = (js && js.templates) || [];
      var html = tpls.map(function (t) {
        return '<li><button type="button" class="dropdown-item d-flex align-items-center gap-2" data-pr-tpl="' + esc(t.id) + '"><img src="' + esc(t.url) + '" alt="" style="width:34px;height:24px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb">' + esc(t.name) + '</button></li>';
      }).join('');
      html += (tpls.length ? '<li><hr class="dropdown-divider"></li>' : '') +
        '<li><button type="button" class="dropdown-item" data-pr-tpl-save' + (design.bg && design.bg.url ? '' : ' disabled') + '><i class="fa fa-floppy-disk fa-fw me-1"></i>Guardar este fondo como plantilla</button></li>';
      menu.innerHTML = html;
    }).catch(function () {});
  }
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pr-tpl]');
    if (t) {
      var fd = new FormData(); fd.append('template_id', t.getAttribute('data-pr-tpl'));
      fetch(root.getAttribute('data-bg-url'), { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || 'No se pudo cargar la plantilla.'); return; }
        design.bg = js.bg; pintaFondo(); marca('Fondo cambiado');
      });
      return;
    }
    if (ev.target.closest('[data-pr-tpl-save]')) {
      var m = document.getElementById('prTemplateModal');
      if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).show();
    }
  });
  var btnTpl = document.querySelector('[data-pr-template-save]');
  if (btnTpl) btnTpl.addEventListener('click', function () {
    var nombre = (document.querySelector('[data-pr-template-name]').value || '').trim();
    if (!nombre) return alert('Ponle un nombre a la plantilla.');
    var fd = new FormData(); fd.append('name', nombre); fd.append('background_url', design.bg.url || ''); fd.append('w', design.bg.w || 0); fd.append('h', design.bg.h || 0);
    fetch(root.getAttribute('data-templates-url'), { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (js) {
      if (!js || !js.ok) return alert((js && js.error) || 'No se pudo guardar.');
      cargaPlantillas();
      var m = document.getElementById('prTemplateModal'); if (m && window.bootstrap) bootstrap.Modal.getInstance(m).hide();
    });
  });

  /* ---------- guardar y previsualizar ---------- */
  function serializa() {
    return { width: W, bg: design.bg, blocks: design.blocks.map(function (b) {
      var o = { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h };
      if (b.type === 'title' || b.type === 'text') { var el = elDe(b.id); o.html = el ? el.querySelector('.pr-blk__text').innerHTML : (b.html || ''); o.style = b.style || {}; }
      else { o.ref = b.ref || {}; o.opts = b.opts || {}; }
      return o;
    }) };
  }
  function guarda() {
    var s = root.querySelector('[data-pr-saved]'); if (s) s.textContent = 'Guardando…';
    return post(root.getAttribute('data-save-url'), { design: serializa() }).then(function (js) {
      if (!js || !js.ok) { if (s) s.textContent = 'No se pudo guardar'; alert((js && js.error) || 'No se pudo guardar.'); return false; }
      dirty = false; if (s) s.textContent = 'Guardado ✓';
      return true;
    });
  }
  root.querySelector('[data-pr-save]').addEventListener('click', guarda);
  root.querySelector('[data-pr-preview]').addEventListener('click', function () {
    guarda().then(function (ok) {
      if (!ok) return;
      var m = document.getElementById('prPreviewModal'), f = m && m.querySelector('[data-pr-preview-frame]');
      if (f) f.src = root.getAttribute('data-preview-url') + '?t=' + Date.now();
      if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).show();
    });
  });
  document.addEventListener('keydown', function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); guarda(); }
  });
  window.addEventListener('beforeunload', function (ev) { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('resize', escala);
  stage.addEventListener('scroll', colocaToolbar);
  canvas.addEventListener('pointerdown', function (ev) { if (ev.target === canvas) { sel = null; canvas.querySelectorAll('.pr-blk').forEach(function (e) { e.classList.remove('is-sel'); }); toolbar.classList.add('d-none'); pintaProps(null); } });

  pintaTodo();
  cargaModulos();
  cargaPlantillas();
  setTimeout(function () { design.blocks.forEach(function (b) { if (b.type === 'title' || b.type === 'text') crecerTexto(b); }); }, 300);
})();
