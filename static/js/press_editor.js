/* ══════════════════════════════════════════════════════════════════════════════════════════════
   EL EDITOR DE NOTAS DE PRENSA

   El lienzo mide 600 (las unidades del diseño) y se ESCALA con `transform` al hueco que haya. Encima
   del fondo, los BLOQUES: titular y textos (contenteditable, con negrita · cursiva · subrayado ·
   enlaces · alineación · tipografía · color; el tamaño es del bloque) y MÓDULOS (audio, repertorio,
   videoclip, enlaces, fotos, contacto), cuyo HTML lo pinta el SERVIDOR con el mismo motor que el
   correo. Cada bloque se arrastra desde su asa y se redimensiona desde la esquina; un texto crece
   solo si el contenido no cabe. Al mover o redimensionar salen GUÍAS para alinearlo con los demás
   (mismo borde izquierdo, derecho, centro o mismo ancho) y se imanta a ellas (con Alt, no).
   Con un bloque seleccionado, Supr lo borra y ⌘C / ⌘V lo copian y pegan; las flechas lo mueven.
   La barra del texto ofrece además los COLORES DEL FONDO que hay puesto (`design.bg.palette`, los
   calcula el servidor al subir el fondo).
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
  var filesUrl = root.getAttribute('data-files-url') || '';
  var staffUrl = root.getAttribute('data-staff-url') || '';
  var esCampana = root.getAttribute('data-campaign') === '1';
  var imageUrl = root.getAttribute('data-image-url') || '';
  var imageCropUrl = root.getAttribute('data-image-crop-url') || '';
  var photosUrlTpl = root.getAttribute('data-photos-url') || '';
  var designAsset = {}; try { designAsset = JSON.parse(root.getAttribute('data-design-asset') || '{}') || {}; } catch (e) {}
  var corporate = []; try { corporate = JSON.parse(root.getAttribute('data-corporate') || '[]') || []; } catch (e) {}
  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  var design = { width: W, bg: {}, blocks: [] };
  try { design = JSON.parse((document.getElementById('prDesign') || {}).textContent || '{}') || design; } catch (e) {}
  design.blocks = Array.isArray(design.blocks) ? design.blocks : [];
  design.bg = design.bg || {};
  /* ⚠️⚠️ SE PUEDEN SELECCIONAR VARIOS MÓDULOS A LA VEZ (sep 2026, lo pidió Dani: «pulsando el
     botón comando en mac o el que corresponda en windows se pueden seleccionar varios módulos a la
     vez de los que están añadidos»). `sel` es el ÚLTIMO pinchado —el que manda en el panel de la
     derecha y en la barra de formato— y `selExtra` son los demás; así todo lo que ya funcionaba con
     uno sigue igual y lo de varios se añade encima. */
  var k = 1, sel = null, selExtra = [], dirty = false, assets = null;
  function seleccionados() {
    return (sel ? [sel] : []).concat(selExtra).filter(function (id) { return !!bloque(id); });
  }
  function estaSel(id) { return id === sel || selExtra.indexOf(id) >= 0; }

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }
  function marca(t) { dirty = true; var s = root.querySelector('[data-pr-saved]'); if (s) s.textContent = t || 'Sin guardar'; }
  function esTexto(b) { return !!b && (b.type === 'title' || b.type === 'text'); }
  /* Lo que tiene PROPORCIÓN FIJA: al redimensionarlo, el alto sale del ancho y no se deforma.
     ⚠️ Un VÍDEO DE YOUTUBE es siempre 16:9 (la miniatura la recorta a 16:9 el servidor), así que
     entra aquí igual que una imagen integrada: se mueve y se cambia de tamaño como los demás. */
  function proporcion(b) {
    if (!b) return null;
    if (b.type === 'youtube') return 9 / 16;
    if (b.type === 'image' && b.ref && b.ref.w > 0 && b.ref.h > 0) return b.ref.h / b.ref.w;
    return null;
  }
  function conMedidas(b) { return proporcion(b) != null; }

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
  /* EL COLOR DE FONDO del diseño (`bg.color`, detrás y debajo de la imagen) y el FUNDIDO de la imagen
     con él (`bg.fade`, en % de la imagen). El fundido se HORNEA en la imagen en el servidor
     (`_press_bg_bake`), que es lo único que vale igual en el correo; mientras se mueve la barra se
     previsualiza con un degradado CSS (`fadePreview`) y al soltar se pide la imagen fundida. */
  var fadePreview = null;
  function colorFondo() { var c = (design.bg || {}).color || ''; return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ffffff'; }
  function pintaFondo() {
    var b = design.bg || {};
    canvas.style.height = Math.round(canvasH()) + 'px';
    canvas.style.width = W + 'px';
    canvas.style.background = b.url ? (colorFondo() + ' url(' + b.url + ') no-repeat 0 0 / ' + W + 'px auto') : colorFondo();
    var vacio = root.querySelector('[data-pr-empty]');
    if (vacio) vacio.classList.toggle('d-none', !!b.url);
    pintaFundidoPreview();
    pintaBgControles();
    escala();
    pintaSwatches();
  }
  function pintaFundidoPreview() {
    var ov = canvas.querySelector('[data-pr-fade-preview]');
    if (fadePreview == null || !(design.bg || {}).url) { if (ov) ov.remove(); return; }
    if (!ov) { ov = document.createElement('div'); ov.setAttribute('data-pr-fade-preview', ''); ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'; canvas.insertBefore(ov, canvas.firstChild); }
    var alto = bgH();
    ov.style.width = W + 'px'; ov.style.height = Math.round(alto) + 'px';
    var c = colorFondo(), f = Math.max(0, Math.min(100, fadePreview));
    ov.style.background = f ? ('linear-gradient(to bottom, rgba(0,0,0,0) ' + (100 - f) + '%, ' + c + ' 100%)') : 'none';
  }
  function pintaBgControles() {
    var b = design.bg || {};
    var col = root.querySelector('[data-pr-bg-color]'); if (col) col.value = colorFondo();
    var hex = root.querySelector('[data-pr-bg-hex]'); if (hex) hex.textContent = b.color ? colorFondo() : 'blanco';
    var fd = root.querySelector('[data-pr-bg-fade]'); if (fd) fd.value = parseInt(b.fade || 0, 10) || 0;
    var fv = root.querySelector('[data-pr-bg-fade-val]'); if (fv) fv.textContent = (parseInt(b.fade || 0, 10) || 0) + ' %';
    var sw = root.querySelector('[data-pr-bg-colors]'); if (sw) sw.innerHTML = coloresHtml(b.color || '', 'data-pr-bg-color-pick');
  }
  function guardaEstiloFondo() {
    var url = root.getAttribute('data-bg-style-url'); if (!url) return;
    marca('Fundiendo el fondo…');
    post(url, { color: (design.bg || {}).color || '', fade: parseInt((design.bg || {}).fade || 0, 10) || 0 }).then(function (js) {
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo cambiar el fondo.'); return; }
      design.bg = js.bg || design.bg; fadePreview = null; pintaFondo(); marca('Fondo cambiado · sin guardar el resto');
    });
  }
  root.addEventListener('input', function (ev) {
    if (ev.target.matches('[data-pr-bg-color]')) { design.bg = design.bg || {}; design.bg.color = ev.target.value; pintaFondo(); marca(); return; }
    if (ev.target.matches('[data-pr-bg-fade]')) { fadePreview = parseInt(ev.target.value, 10) || 0; var fv = root.querySelector('[data-pr-bg-fade-val]'); if (fv) fv.textContent = fadePreview + ' %'; pintaFundidoPreview(); return; }
    if (ev.target.matches('[data-pr-bg-color-pick-custom]')) { design.bg = design.bg || {}; design.bg.color = ev.target.value; pintaFondo(); marca(); }
  });
  root.addEventListener('change', function (ev) {
    if (ev.target.matches('[data-pr-bg-color], [data-pr-bg-color-pick-custom]')) { design.bg = design.bg || {}; design.bg.color = ev.target.value; guardaEstiloFondo(); return; }
    if (ev.target.matches('[data-pr-bg-fade]')) { design.bg = design.bg || {}; design.bg.fade = parseInt(ev.target.value, 10) || 0; guardaEstiloFondo(); }
  });
  root.addEventListener('click', function (ev) {
    var pick = ev.target.closest('[data-pr-bg-color-pick]');
    if (pick) { design.bg = design.bg || {}; design.bg.color = pick.getAttribute('data-pr-bg-color-pick'); pintaFondo(); guardaEstiloFondo(); return; }
    if (ev.target.closest('[data-pr-bg-color-clear]')) { if (design.bg) delete design.bg.color; pintaFondo(); guardaEstiloFondo(); }
  });

  /* ---------- bloques ---------- */
  /* ⚠️⚠️ LO QUE SE VE AQUÍ ES LO QUE SE MANDA: los valores por defecto de un texto los da el motor
     (`press_render.TEXT_DEFAULTS`, que viajan en `data-text-defaults`), no este fichero. Cuando cada
     uno tenía los suyos, un titular se pintaba a 26px con interlineado 1,25 en el editor y salía a
     15px con 1,4 en el correo, así que la vista previa no se parecía a lo configurado. */
  var TEXT_DEF = (function () {
    var d = {};
    try { d = JSON.parse(root.getAttribute('data-text-defaults') || '{}') || {}; } catch (e) { d = {}; }
    return d;
  })();
  function porDefecto(b) {
    return TEXT_DEF[b && b.type === 'title' ? 'title' : 'text'] || {};
  }
  function estiloTexto(b) {
    var st = b.style || {}, d = porDefecto(b);
    return 'font-family:' + (st.font || d.font || 'Arial, Helvetica, sans-serif') + ';font-size:' + (st.size || d.size || 15) + 'px;' +
      'line-height:' + (st.line || d.line || 1.45) + ';color:' + (st.color || d.color || '#111827') + ';text-align:' + (st.align || d.align || 'left') + ';' +
      (st.bold ? 'font-weight:700;' : '');
  }
  function elDe(id) { return canvas.querySelector('.pr-blk[data-id="' + id + '"]'); }

  /* ---------- las ASAS del tamaño: las cuatro esquinas y el medio de cada lado ----------
     Con un cuadradito en cada lado se ajusta el tamaño tirando del borde que toca, sin tener que
     apuntar siempre a la esquina de abajo a la derecha.
     ⚠️ El alto de un MÓDULO lo manda su contenido (`ajustaAltoModulo`), así que ahí las asas de
     arriba y de abajo no se ofrecen: volverían solas a su sitio y parecería que no funcionan. */
  var RS_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  function altoAuto(b) { return !esTexto(b) && !conMedidas(b); }
  function asasHtml() {
    return RS_DIRS.map(function (d) {
      return '<div class="pr-blk__rs pr-blk__rs--' + d + '" data-pr-rs="' + d + '" title="Arrastra para cambiar el tamaño"></div>';
    }).join('');
  }
  function pintaBloque(b) {
    var el = elDe(b.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pr-blk pr-blk--' + b.type + (altoAuto(b) ? ' pr-blk--autoh' : '');
      el.setAttribute('data-id', b.id);
      el.innerHTML = '<div class="pr-blk__grip" title="Arrastra para mover"><i class="fa fa-grip-lines"></i></div>' +
        '<div class="pr-blk__body"></div>' + asasHtml();
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
    // El id viaja también: los ADJUNTOS cuelgan del id del bloque.
    post(root.getAttribute('data-block-url'), { id: b.id, type: b.type, pick: b.pick || '', ref: b.ref || {}, opts: b.opts || {}, w: b.w }).then(function (js) {
      var el = elDe(b.id); if (!el) return;
      var m = el.querySelector('.pr-blk__mod');
      if (js && js.ok) {
        b.html_cache = js.html; m.innerHTML = js.html || '<div class="text-muted small p-2">(vacío)</div>';
        el.classList.toggle('is-pending', !!js.pending);
      } else m.innerHTML = '<div class="text-danger small p-2">No se pudo pintar el módulo.</div>';
      ajustaAltoModulo(b);
    });
  }
  var refrescoPendiente = {};
  function refrescaModuloLuego(b) {          // con un respiro: mientras se escribe un título no se pide cada tecla
    clearTimeout(refrescoPendiente[b.id]);
    refrescoPendiente[b.id] = setTimeout(function () { refrescaModulo(b); }, 450);
  }
  function ajustaAltoModulo(b) {
    var el = elDe(b.id); if (!el) return;
    if (conMedidas(b)) {
      var hh = Math.round(b.w * proporcion(b));
      if (Math.abs(hh - b.h) > 1) { b.h = hh; canvas.style.height = Math.round(canvasH()) + 'px'; escala(); }
      return;
    }
    var h = el.offsetHeight;
    if (h && Math.abs(h - b.h) > 1) { b.h = h; canvas.style.height = Math.round(canvasH()) + 'px'; escala(); }
  }
  function crecerTexto(b) {
    var el = elDe(b.id); if (!el) return;
    var t = el.querySelector('.pr-blk__text');
    /* ⚠️⚠️ SE MIDE EL CONTENIDO, NO EL CONTENEDOR. El texto va con `height:100%`, así que su
       `scrollHeight` NUNCA es menor que el bloque: midiéndolo así (y sumándole 8) el bloque crecía
       unos píxeles en CADA repaso, acababa pisando al de abajo y en el correo —donde dos bloques no
       se pueden superponer— los dos salían apilados con un hueco enorme. Era la causa de que la
       vista previa no se pareciera a lo configurado. */
    var antes = t.style.height;
    t.style.height = 'auto';
    var necesario = Math.ceil(t.scrollHeight);
    t.style.height = antes;
    if (necesario > Math.round(b.h)) { b.h = necesario; el.style.height = Math.round(b.h) + 'px'; canvas.style.height = Math.round(canvasH()) + 'px'; escala(); }
  }
  function bloque(id) { return design.blocks.filter(function (b) { return b.id === id; })[0]; }

  /* ---------- seleccionar ---------- */
  function deselecciona() {
    sel = null; selExtra = [];
    canvas.querySelectorAll('.pr-blk').forEach(function (e) { e.classList.remove('is-sel'); });
    toolbar.classList.add('d-none'); pintaProps(null);
  }
  function pintaSeleccion() {
    canvas.querySelectorAll('.pr-blk').forEach(function (e) {
      e.classList.toggle('is-sel', estaSel(e.getAttribute('data-id')));
    });
  }
  /* `aditiva` = se ha pinchado con ⌘ (Mac) o Ctrl (Windows): SUMA a lo que ya hay seleccionado, y
     si ya estaba, lo QUITA. Sin ⌘, un clic deja seleccionado solo lo pinchado, como siempre. */
  function selecciona(id, aditiva) {
    if (!aditiva) { selExtra = []; sel = id; }
    else if (estaSel(id)) {                       // ya estaba: se quita de la selección
      selExtra = selExtra.filter(function (x) { return x !== id; });
      if (id === sel) sel = selExtra.shift() || null;
    } else {
      if (sel && sel !== id) selExtra.push(sel);
      sel = id;
    }
    pintaSeleccion();
    var b = sel ? bloque(sel) : null;
    if (!b) { toolbar.classList.add('d-none'); pintaProps(null); return; }
    toolbar.classList.toggle('d-none', selExtra.length > 0 || (b.type !== 'title' && b.type !== 'text'));
    if (b && (b.type === 'title' || b.type === 'text')) {
      var st = b.style || {};
      var f = toolbar.querySelector('[data-pr-font]'); if (f) f.value = st.font || f.options[0].value;
      var n = toolbar.querySelector('[data-pr-size-input]'); if (n) n.value = st.size || porDefecto(b).size || 15;
      var c = toolbar.querySelector('[data-pr-color]'); if (c) c.value = /^#[0-9a-fA-F]{6}$/.test(st.color || '') ? st.color : '#111827';
    }
    colocaToolbar();
    pintaProps(b);
  }
  /* ⚠️⚠️ LA BARRA DE FORMATO VA POR ENCIMA DEL ASA DE ARRASTRAR. El asa (`.pr-blk__grip`) cuelga
     18 px por encima del bloque, así que dejando solo 8 px la barra se le ponía justo encima y el
     bloque no se podía coger para moverlo (bug real, con captura). Se separa el alto del asa más un
     hueco. Debajo del bloque no hay asa, así que ahí se queda como estaba. */
  var ALTO_ASA = 18;
  function colocaToolbar() {
    if (toolbar.classList.contains('d-none') || !sel) return;
    var el = elDe(sel); if (!el) return;
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    var top = r.top - s.top + stage.scrollTop - toolbar.offsetHeight - ALTO_ASA - 6;
    if (top < 4) top = r.bottom - s.top + stage.scrollTop + 8;
    toolbar.style.top = Math.round(top) + 'px';
    toolbar.style.left = Math.round(Math.max(4, Math.min(r.left - s.left + stage.scrollLeft, stage.clientWidth - toolbar.offsetWidth - 4))) + 'px';
  }
  var TIPO_LABEL = { title: 'Titular', text: 'Texto', audio: 'Audio', album: 'Repertorio del disco', video: 'Videoclip', links: 'Enlaces de plataformas', contact: 'Contactos', photos: 'Fotos', image: 'Imagen', files: 'Archivos adjuntos', playlist: 'Playlist', artwork: 'Cartelería' };
  function pintaProps(b) {
    var box = root.querySelector('[data-pr-props]'), body = root.querySelector('[data-pr-props-body]');
    if (!box || !body) return;
    if (!b) { box.classList.add('d-none'); return; }
    box.classList.remove('d-none');
    var kind = root.querySelector('[data-pr-props-kind]');
    // El panel va ARRIBA de la columna de la derecha: se enseña desde el principio, no donde se
    // hubiera quedado el scroll de la paleta.
    var side = root.querySelector('[data-pr-side]'); if (side) side.scrollTop = 0;
    /* ⚠️ CON VARIOS SELECCIONADOS no se pueden enseñar las propiedades de uno (serían las del
       último pinchado y se cambiaría lo que no se ve): se dice cuántos hay y qué se puede hacer
       con ellos. Para tocar uno, se pincha ese solo. */
    if (selExtra.length) {
      var n = selExtra.length + 1;
      if (kind) kind.textContent = '— ' + n + ' seleccionados';
      body.innerHTML = '<div class="small text-muted mb-2">Hay <b>' + n + ' módulos</b> seleccionados: se ' +
        'mueven juntos arrastrando cualquiera de ellos o con las <b>flechas</b>, y ⌘C · ⌘V los copia.</div>' +
        '<div class="d-flex gap-2 flex-wrap">' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-pr-unsel><i class="fa fa-xmark me-1"></i>Quitar la selección</button>' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-pr-del><i class="fa fa-trash me-1"></i>Borrar los ' + n + '</button>' +
        '</div>';
      return;
    }
    if (kind) kind.textContent = '— ' + (TIPO_LABEL[b.type] || b.type);
    var o = b.opts || {};
    var html = '';
    if (b.type === 'contact') {
      html += '<div class="small text-muted mb-2">Salen siempre el contacto de prensa y quien crea la nota; se pueden añadir otros del personal.</div>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-pr-contacts-open><i class="fa fa-user-plus me-1"></i>Añadir otro</button>';
    }
    if (b.type === 'image') {
      var ref = b.ref || {}, tieneImg = !!ref.url;
      if (tieneImg) {
        // La imagen que hay, con RECORTAR / AJUSTAR (girar, proporción) al lado; si ya se recortó,
        // se puede volver a la original.
        html += '<div class="pr-props__img mb-2"><img src="' + esc(ref.url) + '" alt=""></div>' +
          '<div class="d-flex gap-2 flex-wrap mb-2">' +
          '<button type="button" class="btn btn-sm btn-outline-primary" data-pr-image-crop title="Recortar, girar o cambiar la proporción de la imagen"><i class="fa fa-crop-simple me-1"></i>Recortar o ajustar</button>' +
          (ref.orig_url && ref.orig_url !== ref.url ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-pr-image-orig title="Deshacer el recorte y volver a la imagen tal como se subió"><i class="fa fa-rotate-left me-1"></i>Original</button>' : '') +
          '</div>';
      }
      var esLogo = b.pick === 'logo';
      html += '<button type="button" class="btn btn-sm btn-outline-' + (tieneImg ? 'secondary' : 'primary') + ' mb-3" data-pr-image-pick><i class="fa ' + (esLogo ? 'fa-building' : 'fa-image') + ' me-1"></i>' + (tieneImg ? (esLogo ? 'Cambiar el logo' : 'Cambiar la imagen') : (esLogo ? 'Elegir el logo' : 'Elegir la imagen')) + '</button>' +
        '<label class="form-label small text-muted mb-1 d-flex justify-content-between">Esquinas redondeadas <span data-pr-range-val>' + (parseInt(o.radius || 0, 10) || 0) + ' px</span></label>' +
        '<input type="range" class="form-range mb-2" min="0" max="40" step="1" data-pr-opt-range="radius" value="' + (parseInt(o.radius || 0, 10) || 0) + '">' +
        '<label class="form-label small text-muted mb-1">Enlace al pinchar la imagen <span class="fw-normal">(opcional)</span></label>' +
        '<input class="form-control form-control-sm mb-2" data-pr-opt-text="href" value="' + esc(o.href || '') + '" placeholder="https://…">' +
        '<label class="form-label small text-muted mb-1">Texto alternativo</label>' +
        '<input class="form-control form-control-sm mb-2" data-pr-ref-text="alt" value="' + esc(ref.alt || '') + '" placeholder="Qué se ve en la imagen">';
    }
    if (b.type === 'youtube') {
      var yurl = (b.ref && b.ref.url) || '';
      html += '<div class="small text-muted mb-2">En el correo se ve <strong>la miniatura del vídeo con el botón de YouTube</strong>, sin título ni nada más. Al pincharla, el vídeo se abre y se reproduce.</div>' +
        (yurl ? '<div class="small text-truncate mb-2" title="' + esc(yurl) + '"><i class="fa-brands fa-youtube text-danger me-1"></i>' + esc(yurl) + '</div>' : '') +
        '<button type="button" class="btn btn-sm btn-outline-' + (yurl ? 'secondary' : 'primary') + ' mb-3" data-pr-yt-open>' +
        '<i class="fa-brands fa-youtube me-1"></i>' + (yurl ? 'Cambiar la URL' : 'Poner la URL') + '</button>' +
        '<label class="form-label small text-muted mb-1 d-flex justify-content-between">Esquinas redondeadas <span data-pr-range-val>' + (parseInt(o.radius == null ? 12 : o.radius, 10) || 0) + ' px</span></label>' +
        '<input type="range" class="form-range mb-2" min="0" max="40" step="1" data-pr-opt-range="radius" value="' + (parseInt(o.radius == null ? 12 : o.radius, 10) || 0) + '">';
    }
    if (b.type === 'files') {
      html += '<label class="form-label small text-muted mb-1">Cómo se llama este bloque</label>' +
        '<input class="form-control form-control-sm mb-2" data-pr-opt-text="title" value="' + esc(o.title || '') + '" placeholder="Ej: Fotos de prensa">' +
        '<label class="form-label small text-muted mb-1">Color del icono <span class="fw-normal">(los de la casa y los del fondo)</span></label>' +
        '<div class="pr-colors mb-2">' + coloresHtml(o.color, 'data-pr-color-pick') + '</div>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" data-pr-files-open><i class="fa fa-paperclip me-1"></i>Gestionar los archivos</button>';
    }
    /* QUÉ LLEVA el módulo (el single, el disco, el videoclip, los enlaces o la playlist): se elige
       al colocarlo y se cambia aquí. Es el MISMO selector, así que se comporta igual en los cinco. */
    if (PICK[clavePick(b)] && b.type !== 'image') {
      var elegido = (opcionesDe(clavePick(b)) || []).filter(function (it) { return mismoRef(it.ref, b.ref); })[0];
      if (elegido) {
        html += '<div class="pr-props__pick mb-2">' +
          (elegido.cover ? '<img src="' + esc(elegido.cover) + '" alt="">' : '<span class="pr-props__pick-ph"><i class="fa fa-music"></i></span>') +
          '<span><b>' + esc(elegido.label || '') + '</b><small>' + esc(elegido.sub || '') + '</small></span></div>';
      }
      html += '<button type="button" class="btn btn-sm btn-outline-' + (elegido ? 'secondary' : 'primary') + ' mb-3" data-pr-pick-open>' +
        '<i class="fa fa-list-ul me-1"></i>' + (elegido ? 'Cambiar' : PICK[clavePick(b)].titulo) + '</button>';
    }
    if (b.type === 'audio' || b.type === 'album' || b.type === 'video' || b.type === 'photos' || b.type === 'artwork') {
      html += '<label class="form-check"><input type="checkbox" class="form-check-input" data-pr-opt="download"' + (o.download ? ' checked' : '') + '> Se puede <b>descargar</b>' +
        (b.type === 'photos' ? ' (las fotos)' : (b.type === 'artwork' ? ' (los carteles)' : (b.type === 'video' ? ' (el vídeo)' : ' (el audio)'))) + '</label>' +
        '<div class="form-text">Sin marcarlo solo se ' + ((b.type === 'photos' || b.type === 'artwork' || b.type === 'video') ? 've' : 'escucha') + '.</div>';
    }
    if (b.type === 'links') {
      html += '<div class="small fw-semibold mb-1">Alineación</div><div class="btn-group btn-group-sm" role="group">' +
        ['left', 'center', 'right'].map(function (a) { return '<button type="button" class="btn ' + ((o.align || 'center') === a ? 'btn-dark' : 'btn-outline-secondary') + '" data-pr-opt-align="' + a + '"><i class="fa fa-align-' + a + '"></i></button>'; }).join('') + '</div>';
    }
    /* LOS COLORES DE ESTE MÓDULO (sep 2026, lo pidió Dani): las letras y los iconos por separado, para
       cada módulo. Los aplica el servidor en el HTML del módulo (`press_render.apply_module_colors`):
       lo que se ve es lo que llega. Vacío = los colores de siempre. */
    if (!esTexto(b) && b.type !== 'image') {
      html += '<div class="small fw-semibold mt-3 mb-1">Colores de este módulo <span class="fw-normal text-muted">(vacío = los de siempre)</span></div>' +
        '<div class="small text-muted mb-1">Letras' + (o.text_color ? ' · <button type="button" class="btn btn-sm btn-link p-0 text-muted" data-pr-modcolor-clear="text_color">volver al de siempre</button>' : '') + '</div>' +
        '<div class="pr-colors mb-2">' + coloresHtml(o.text_color, 'data-pr-modtext-pick') + '</div>' +
        '<div class="small text-muted mb-1">Iconos' + (o.icon_color ? ' · <button type="button" class="btn btn-sm btn-link p-0 text-muted" data-pr-modcolor-clear="icon_color">volver al de siempre</button>' : '') + '</div>' +
        '<div class="pr-colors mb-2">' + coloresHtml(o.icon_color, 'data-pr-modicon-pick') + '</div>';
    }
    html += '<div class="mt-3 d-flex gap-2 flex-wrap"><button type="button" class="btn btn-sm btn-outline-secondary" data-pr-dup><i class="fa fa-clone me-1"></i>Duplicar</button>' +
      '<button type="button" class="btn btn-sm btn-outline-danger" data-pr-del><i class="fa fa-trash me-1"></i>Eliminar</button></div>';
    body.innerHTML = html;
  }
  root.addEventListener('change', function (ev) {
    var opt = ev.target.closest('[data-pr-opt]');
    if (opt && sel) { var b = bloque(sel); b.opts = b.opts || {}; b.opts[opt.getAttribute('data-pr-opt')] = opt.checked; marca(); refrescaModulo(b); }
    // Los colores propios del módulo (letras / iconos) elegidos con el selector de «otro color».
    var mt = ev.target.closest('[data-pr-modtext-pick-custom]');
    if (mt && sel) { var bt = bloque(sel); bt.opts = bt.opts || {}; bt.opts.text_color = mt.value; marca(); refrescaModulo(bt); pintaProps(bt); }
    var mi = ev.target.closest('[data-pr-modicon-pick-custom]');
    if (mi && sel) { var bi2 = bloque(sel); bi2.opts = bi2.opts || {}; bi2.opts.icon_color = mi.value; marca(); refrescaModulo(bi2); pintaProps(bi2); }
    var cc = ev.target.closest('[data-pr-color-pick-custom]');
    if (cc && sel) { var bc = bloque(sel); bc.opts = bc.opts || {}; bc.opts.color = cc.value; marca(); refrescaModulo(bc); pintaProps(bc); }
  });
  // Los textos del panel (el enlace de una imagen, el título de los adjuntos) se aplican al escribir.
  root.addEventListener('input', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b) return;
    var t = ev.target.closest('[data-pr-opt-text]');
    if (t) { b.opts = b.opts || {}; b.opts[t.getAttribute('data-pr-opt-text')] = t.value; marca(); refrescaModuloLuego(b); return; }
    var rg = ev.target.closest('[data-pr-opt-range]');
    if (rg) {
      b.opts = b.opts || {}; b.opts[rg.getAttribute('data-pr-opt-range')] = parseInt(rg.value, 10) || 0;
      var lbl = root.querySelector('[data-pr-range-val]'); if (lbl) lbl.textContent = (parseInt(rg.value, 10) || 0) + ' px';
      marca(); refrescaModuloLuego(b); return;
    }
    var r = ev.target.closest('[data-pr-ref-text]');
    if (r) { b.ref = b.ref || {}; b.ref[r.getAttribute('data-pr-ref-text')] = r.value; marca(); refrescaModuloLuego(b); }
  });
  root.addEventListener('click', function (ev) {
    var al = ev.target.closest('[data-pr-opt-align]');
    if (al && sel) { var b = bloque(sel); b.opts = b.opts || {}; b.opts.align = al.getAttribute('data-pr-opt-align'); marca(); refrescaModulo(b); pintaProps(b); return; }
    if (ev.target.closest('[data-pr-unsel]')) { deselecciona(); return; }
    if (ev.target.closest('[data-pr-del]') && sel) { borra(seleccionados()); return; }
    if (ev.target.closest('[data-pr-image-pick]') && sel) {
      var bi = bloque(sel); if (bi && bi.pick) abrePick(bi); else abreImagen(bi); return;
    }
    if (ev.target.closest('[data-pr-image-crop]') && sel) { abreRecorte(bloque(sel)); return; }
    if (ev.target.closest('[data-pr-image-orig]') && sel) { var bo = bloque(sel); if (bo && bo.ref && bo.ref.orig_url) aplicaImagenBloque(bo, bo.ref.orig_url, 0, 0, bo.ref.orig_url); return; }
    if (ev.target.closest('[data-pr-files-open]') && sel) { abreArchivos(bloque(sel)); return; }
    if (ev.target.closest('[data-pr-contacts-open]') && sel) { abreContactos(bloque(sel)); return; }
    var cp = ev.target.closest('[data-pr-color-pick]');
    if (cp && sel) { var bc = bloque(sel); bc.opts = bc.opts || {}; bc.opts.color = cp.getAttribute('data-pr-color-pick'); marca(); refrescaModulo(bc); pintaProps(bc); return; }
    var mtp = ev.target.closest('[data-pr-modtext-pick]');
    if (mtp && sel) { var bmt = bloque(sel); bmt.opts = bmt.opts || {}; bmt.opts.text_color = mtp.getAttribute('data-pr-modtext-pick'); marca(); refrescaModulo(bmt); pintaProps(bmt); return; }
    var mip = ev.target.closest('[data-pr-modicon-pick]');
    if (mip && sel) { var bmi = bloque(sel); bmi.opts = bmi.opts || {}; bmi.opts.icon_color = mip.getAttribute('data-pr-modicon-pick'); marca(); refrescaModulo(bmi); pintaProps(bmi); return; }
    var mcl = ev.target.closest('[data-pr-modcolor-clear]');
    if (mcl && sel) { var bmc = bloque(sel); bmc.opts = bmc.opts || {}; delete bmc.opts[mcl.getAttribute('data-pr-modcolor-clear')]; marca(); refrescaModulo(bmc); pintaProps(bmc); return; }
    if (ev.target.closest('[data-pr-dup]') && sel) {
      var o = bloque(sel), c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.y = o.y + o.h + 12; delete c.html_cache;
      if (c.type === 'title' || c.type === 'text') c.html = elDe(o.id).querySelector('.pr-blk__text').innerHTML;
      design.blocks.push(c); pintaBloque(c); marca(); selecciona(c.id);
    }
  });
  /* Borra TODO lo seleccionado (uno o varios: con ⌘ se pueden marcar los que haga falta). */
  function borra(ids) {
    var lista = Array.isArray(ids) ? ids : [ids];
    if (!lista.length) return;
    lista.forEach(function (id) { var el = elDe(id); if (el) el.remove(); });
    design.blocks = design.blocks.filter(function (b) { return lista.indexOf(b.id) < 0; });
    sel = null; selExtra = []; toolbar.classList.add('d-none'); pintaProps(null); marca();
    canvas.style.height = Math.round(canvasH()) + 'px'; escala();
  }

  /* ---------- mover y redimensionar (eventos de puntero: vale con el ratón y con el dedo) ---------- */
  var drag = null;
  canvas.addEventListener('pointerdown', function (ev) {
    var el = ev.target.closest('.pr-blk');
    if (!el || !canEdit) return;
    var id = el.getAttribute('data-id'), b = bloque(id);
    /* ⚠️ Con ⌘/Ctrl se SUMA a la selección y no se arrastra nada: el clic es para marcar. */
    var aditiva = !!(ev.metaKey || ev.ctrlKey);
    var yaEstaba = estaSel(id);
    /* ⚠️⚠️ AL COGER UN BLOQUE SE SUELTA EL TEXTO QUE SE ESTUVIERA ESCRIBIENDO: si no, el cursor
       sigue dentro del texto de antes y Supr, ⌘C y las FLECHAS actúan sobre una letra en vez de
       sobre los bloques marcados (`escribiendo()` los deja pasar). Va ANTES de lo de ⌘: marcar
       varios con el cursor puesto en un texto es justo el caso que fallaba. */
    var act = document.activeElement;
    if (act && act.closest && act.closest('.pr-blk__text')) act.blur();
    /* ⚠️ Pinchar SIN ⌘ un bloque que YA estaba marcado NO deshace la selección: se arrastra el
       grupo entero (es lo que se espera al mover varios). Si se suelta sin haberlo movido, ahí sí
       se queda solo ese (lo resuelve `sueltaDrag`). */
    if (!(!aditiva && yaEstaba)) selecciona(id, aditiva);
    if (aditiva) { ev.preventDefault(); return; }
    var rs = ev.target.closest('.pr-blk__rs'), grip = ev.target.closest('.pr-blk__grip');
    // Un módulo se mueve agarrándolo por cualquier sitio; un texto, por su asa (dentro se escribe).
    if (!rs && !grip && esTexto(b)) return;
    ev.preventDefault();
    drag = { id: id, modo: rs ? 'rs' : 'mv', dir: rs ? (rs.getAttribute('data-pr-rs') || 'se') : '',
      x0: ev.clientX, y0: ev.clientY, bx: b.x, by: b.y, bw: b.w, bh: b.h, moved: false };
    /* ⚠️⚠️ CON VARIOS SELECCIONADOS SE MUEVEN TODOS A LA VEZ: se apunta dónde estaba cada uno y se
       les aplica el MISMO desplazamiento que al que se agarra (si se agarra uno que no estaba
       seleccionado, el clic ya ha dejado solo a ese). El tamaño se cambia de uno en uno. */
    if (!rs && yaEstaba) {
      drag.otros = seleccionados().filter(function (x) { return x !== id; }).map(function (x) {
        var o = bloque(x); return { id: x, x: o.x, y: o.y };
      });
    }
    el.classList.add('is-dragging');
    try { el.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var b = bloque(drag.id); if (!b) return;
    var dx = (ev.clientX - drag.x0) / k, dy = (ev.clientY - drag.y0) / k;
    if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) > 4) drag.moved = true;
    if (drag.modo === 'mv') {
      b.x = drag.bx + dx;
      b.y = drag.by + dy;
    } else {
      // Se trabaja con los BORDES, no con el ancho: así tirando de la izquierda o de arriba el bloque
      // crece hacia ese lado y el borde de enfrente se queda donde estaba.
      var d = drag.dir || 'se';
      var izq = drag.bx, der = drag.bx + drag.bw, arr = drag.by, aba = drag.by + drag.bh;
      var altoLibre = esTexto(b) || conMedidas(b);
      if (d.indexOf('e') >= 0) der = Math.max(izq + 60, der + dx);
      if (d.indexOf('w') >= 0) izq = Math.min(der - 60, Math.max(0, izq + dx));
      if (altoLibre && d.indexOf('s') >= 0) aba = Math.max(arr + 24, aba + dy);
      if (altoLibre && d.indexOf('n') >= 0) arr = Math.min(aba - 24, Math.max(0, arr + dy));
      if (conMedidas(b)) {                                   // no se deforma
        var prop = proporcion(b);
        if (d === 'n' || d === 's') der = izq + Math.max(60, (aba - arr) / prop);
        var alto = (der - izq) * prop;
        if (d.indexOf('n') >= 0) arr = aba - alto; else aba = arr + alto;
      }
      b.x = izq; b.w = der - izq;
      if (altoLibre) { b.y = arr; b.h = aba - arr; }
    }
    // Las GUÍAS: se imanta al borde o al ancho de los demás bloques (con Alt pulsado, no).
    // ⚠️ Moviendo VARIOS no hay imantado: la guía es de UN borde y arrastraría al grupo entero a
    //    saltos; el desplazamiento se aplica tal cual y se alinea a ojo.
    if (ev.altKey || (drag.otros && drag.otros.length)) limpiaGuias(); else alinea(b, drag.modo, drag.dir);
    b.x = Math.max(0, Math.min(W - 40, b.x)); b.y = Math.max(0, b.y);
    b.w = Math.max(60, Math.min(W - b.x, b.w)); if (esTexto(b)) b.h = Math.max(24, b.h);
    if (conMedidas(b)) b.h = b.w * proporcion(b);          // no se deforma
    pintaBloque(b);
    if (drag.otros) {
      // Lo que se ha movido DE VERDAD el que se agarra (con sus topes), no el ratón.
      var mx = b.x - drag.bx, my = b.y - drag.by;
      drag.otros.forEach(function (o) {
        var ob = bloque(o.id); if (!ob) return;
        ob.x = Math.max(0, Math.min(W - 40, o.x + mx));
        ob.y = Math.max(0, o.y + my);
        pintaBloque(ob);
      });
    }
    canvas.style.height = Math.round(canvasH()) + 'px';
    escala();
  });
  function sueltaDrag(ev) {
    if (!drag) return;
    var el = elDe(drag.id); if (el) el.classList.remove('is-dragging');
    var b = bloque(drag.id);
    var drag2id = drag.id;
    var clic = !drag.moved && drag.modo === 'mv';
    var varios = !!(drag.otros && drag.otros.length);
    if (b && !esTexto(b)) ajustaAltoModulo(b);
    if (b && esTexto(b)) crecerTexto(b);
    drag = null; limpiaGuias(); colocaToolbar();
    // Con varios seleccionados, un clic sin mover deja marcado SOLO ese (no abre nada: se ha
    // pinchado para quedarse con uno, que es lo que se espera).
    if (clic && varios) { selecciona(drag2id, false); return; }
    if (clic) {
      // Un CLIC (sin mover) sobre una imagen o unos adjuntos abre su configuración.
      if (b && b.type === 'image') { if (b.pick) abrePick(b); else abreImagen(b); }
      else if (b && b.type === 'youtube') abreYoutube(b);
      else if (b && b.type === 'files') abreArchivos(b);
      else if (b && b.type === 'contact') abreContactos(b);
      return;
    }
    marca();
  }

  /* ---------- las GUÍAS de alineación ----------
     Al mover: el borde izquierdo, el derecho o el centro del bloque con los de otro (y con el centro
     del lienzo), y el borde superior o inferior. Al redimensionar: el borde derecho, el centro o el
     MISMO ANCHO que otro bloque (y, en un texto, el mismo borde inferior). Se imanta a la más cercana
     dentro de SNAP unidades y se pinta la línea; el bloque de referencia se marca. */
  var SNAP = 6;
  function limpiaGuias() {
    canvas.querySelectorAll('.pr-guide').forEach(function (g) { g.remove(); });
    canvas.querySelectorAll('.pr-blk.is-ref').forEach(function (e) { e.classList.remove('is-ref'); });
  }
  function pintaGuia(eje, pos) {
    var g = document.createElement('div');
    g.className = 'pr-guide pr-guide--' + eje;
    if (eje === 'v') g.style.left = Math.round(pos) + 'px'; else g.style.top = Math.round(pos) + 'px';
    canvas.appendChild(g);
  }
  function alinea(b, modo, dir) {
    var otros = design.blocks.filter(function (o) { return o.id !== b.id; });
    var cx = [], cy = [], mid = W / 2;
    if (modo === 'mv') {
      otros.forEach(function (o) {
        cx.push({ d: Math.abs(b.x - o.x), v: o.x, set: function () { b.x = o.x; }, ref: o });
        cx.push({ d: Math.abs(b.x + b.w - o.x - o.w), v: o.x + o.w, set: function () { b.x = o.x + o.w - b.w; }, ref: o });
        cx.push({ d: Math.abs(b.x + b.w / 2 - o.x - o.w / 2), v: o.x + o.w / 2, set: function () { b.x = o.x + o.w / 2 - b.w / 2; }, ref: o });
        cy.push({ d: Math.abs(b.y - o.y), v: o.y, set: function () { b.y = o.y; }, ref: o });
        cy.push({ d: Math.abs(b.y + b.h - o.y - o.h), v: o.y + o.h, set: function () { b.y = o.y + o.h - b.h; }, ref: o });
      });
      cx.push({ d: Math.abs(b.x + b.w / 2 - mid), v: mid, set: function () { b.x = mid - b.w / 2; } });
    } else {
      // Cada borde se imanta con lo que tiene sentido: el derecho con los bordes derechos, el izquierdo
      // con los izquierdos… Así la guía que se pinta es la del borde que se está moviendo.
      var d = dir || 'se';
      var este = d.indexOf('e') >= 0, oeste = d.indexOf('w') >= 0;
      var sur = d.indexOf('s') >= 0, norte = d.indexOf('n') >= 0;
      var altoLibre = esTexto(b);
      otros.forEach(function (o) {
        if (este) {
          cx.push({ d: Math.abs(b.x + b.w - o.x - o.w), v: o.x + o.w, set: function () { b.w = o.x + o.w - b.x; }, ref: o });
          cx.push({ d: Math.abs(b.x + b.w - o.x), v: o.x, set: function () { b.w = o.x - b.x; }, ref: o });
          cx.push({ d: Math.abs(b.w - o.w), v: b.x + o.w, set: function () { b.w = o.w; }, ref: o, ancho: true });
          cx.push({ d: Math.abs(b.x + b.w / 2 - o.x - o.w / 2), v: o.x + o.w / 2, set: function () { b.w = 2 * (o.x + o.w / 2 - b.x); }, ref: o });
        }
        if (oeste) {
          cx.push({ d: Math.abs(b.x - o.x), v: o.x, set: function () { b.w = b.x + b.w - o.x; b.x = o.x; }, ref: o });
          cx.push({ d: Math.abs(b.x - o.x - o.w), v: o.x + o.w, set: function () { b.w = b.x + b.w - o.x - o.w; b.x = o.x + o.w; }, ref: o });
          cx.push({ d: Math.abs(b.w - o.w), v: b.x + b.w - o.w, set: function () { b.x = b.x + b.w - o.w; b.w = o.w; }, ref: o, ancho: true });
        }
        if (altoLibre && sur) cy.push({ d: Math.abs(b.y + b.h - o.y - o.h), v: o.y + o.h, set: function () { b.h = o.y + o.h - b.y; }, ref: o });
        if (altoLibre && norte) cy.push({ d: Math.abs(b.y - o.y), v: o.y, set: function () { b.h = b.y + b.h - o.y; b.y = o.y; }, ref: o });
      });
      if (este) cx.push({ d: Math.abs(b.x + b.w / 2 - mid), v: mid, set: function () { b.w = 2 * (mid - b.x); } });
      if (oeste) cx.push({ d: Math.abs(b.x + b.w / 2 - mid), v: mid, set: function () { var der = b.x + b.w; b.x = 2 * mid - der; b.w = der - b.x; } });
    }
    limpiaGuias();
    [[cx, 'v'], [cy, 'h']].forEach(function (par) {
      var mejor = null;
      par[0].forEach(function (c) { if (c.d <= SNAP && (!mejor || c.d < mejor.d)) mejor = c; });
      if (!mejor) return;
      mejor.set();
      pintaGuia(par[1], mejor.v);
      if (mejor.ancho) pintaGuia('v', b.x);                   // mismo ancho: las dos aristas
      if (mejor.ref) { var re = elDe(mejor.ref.id); if (re) re.classList.add('is-ref'); }
    });
  }

  /* ---------- el teclado: borrar, copiar, pegar, mover ----------
     Solo cuando NO se está escribiendo dentro de un texto (ahí las teclas son del texto). */
  var portapapeles = null;
  function escribiendo(ev) {
    if (document.querySelector('.modal.show')) return true;      // con un pop-up abierto, las teclas son suyas
    var a = document.activeElement;
    if (ev && ev.target && ev.target.closest && ev.target.closest('.pr-blk__text, input, textarea, select, [contenteditable="true"]')) return true;
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '')));
  }
  function copiaBloque(b) {
    var c = JSON.parse(JSON.stringify(b)); delete c.html_cache;
    if (esTexto(b)) { var el = elDe(b.id); if (el) c.html = el.querySelector('.pr-blk__text').innerHTML; }
    return c;
  }
  function pegaBloque(c) {
    var n = JSON.parse(JSON.stringify(c)); n.id = uid();
    n.x = Math.max(0, Math.min(W - 40, (n.x || 0) + 16)); n.y = (n.y || 0) + 16;
    design.blocks.push(n); pintaBloque(n);
    canvas.style.height = Math.round(canvasH()) + 'px'; escala(); marca(); selecciona(n.id);
    return n;
  }
  /* Copiar y pegar VARIOS: se pegan todos con el mismo desplazamiento y quedan seleccionados,
     así se pueden seguir moviendo en bloque. */
  function copiaVarios(ids) { return ids.map(function (id) { return copiaBloque(bloque(id)); }).filter(Boolean); }
  function pegaVarios(lista) {
    if (!lista || !lista.length) return;
    var nuevos = lista.map(function (c) { return pegaBloque(c); });
    sel = nuevos[nuevos.length - 1].id;
    selExtra = nuevos.slice(0, -1).map(function (n) { return n.id; });
    pintaSeleccion(); pintaProps(bloque(sel));
  }
  document.addEventListener('keydown', function (ev) {
    var meta = ev.metaKey || ev.ctrlKey, tecla = (ev.key || '').toLowerCase();
    if (meta && tecla === 's') { ev.preventDefault(); guarda(); return; }
    if (!canEdit || escribiendo(ev)) return;
    var b = sel ? bloque(sel) : null;
    // ⚠️ Todas las teclas actúan sobre TODO lo seleccionado (con ⌘ pueden ser varios).
    var ids = seleccionados();
    if (b && (ev.key === 'Delete' || ev.key === 'Backspace')) { ev.preventDefault(); borra(ids); return; }
    if (b && meta && tecla === 'c') {
      ev.preventDefault(); portapapeles = copiaVarios(ids);
      marca(ids.length > 1 ? (ids.length + ' bloques copiados') : 'Bloque copiado'); return;
    }
    if (b && meta && tecla === 'x') { ev.preventDefault(); portapapeles = copiaVarios(ids); borra(ids); return; }
    if (meta && tecla === 'v' && portapapeles) { ev.preventDefault(); pegaVarios(portapapeles); return; }
    if (b && meta && tecla === 'd') { ev.preventDefault(); pegaVarios(copiaVarios(ids)); return; }
    if (b && ev.key === 'Escape') { deselecciona(); return; }
    if (b && /^Arrow(Up|Down|Left|Right)$/.test(ev.key)) {
      ev.preventDefault();
      var paso = ev.shiftKey ? 10 : 1;
      ids.forEach(function (id) {
        var bb = bloque(id); if (!bb) return;
        if (ev.key === 'ArrowUp') bb.y = Math.max(0, bb.y - paso);
        if (ev.key === 'ArrowDown') bb.y += paso;
        if (ev.key === 'ArrowLeft') bb.x = Math.max(0, bb.x - paso);
        if (ev.key === 'ArrowRight') bb.x = Math.min(W - 40, bb.x + paso);
        pintaBloque(bb);
      });
      canvas.style.height = Math.round(canvasH()) + 'px'; escala(); marca(); colocaToolbar();
    }
  });
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
  function aplicaColor(b, color) {
    var el = elDe(sel), t = el && el.querySelector('.pr-blk__text');
    var s = window.getSelection();
    if (t && s && s.rangeCount && !s.isCollapsed && t.contains(s.anchorNode)) {
      t.focus(); document.execCommand('foreColor', false, color); b.html = t.innerHTML;
    } else { b.style = b.style || {}; b.style.color = color; pintaBloque(b); }
    var c = toolbar.querySelector('[data-pr-color]'); if (c && /^#[0-9a-fA-F]{6}$/.test(color)) c.value = color;
    marca();
  }
  toolbar.addEventListener('input', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b) return;
    if (ev.target.matches('[data-pr-color]')) aplicaColor(b, ev.target.value);
  });
  /* Los COLORES a un clic: los del FONDO (los calcula el servidor al subirlo) y los que se hayan
     COGIDO CON EL CUENTAGOTAS (`design.swatches`, que se guardan con el diseño). */
  function misColores() {
    return (Array.isArray(design.swatches) ? design.swatches : []).filter(function (c) {
      return /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
    });
  }
  function pintaSwatches() {
    var box = toolbar.querySelector('[data-pr-swatches]'); if (!box) return;
    var pal = (design.bg && Array.isArray(design.bg.palette)) ? design.bg.palette : [];
    var mios = misColores();
    var html = pal.map(function (c) {
      return '<button type="button" class="pr-swatch" data-pr-swatch="' + esc(c) + '" style="background:' + esc(c) + '" title="Color del fondo · ' + esc(c) + '"></button>';
    }).join('') + mios.map(function (c) {
      return '<button type="button" class="pr-swatch pr-swatch--mine" data-pr-swatch="' + esc(c) + '" style="background:' + esc(c) + '" title="Color cogido con el cuentagotas · ' + esc(c) + ' (doble clic para quitarlo)"></button>';
    }).join('');
    box.innerHTML = html;
    box.classList.toggle('d-none', !(pal.length || mios.length));
  }
  toolbar.addEventListener('click', function (ev) {
    var sw = ev.target.closest('[data-pr-swatch]'); var b = sel ? bloque(sel) : null;
    if (sw && b) aplicaColor(b, sw.getAttribute('data-pr-swatch'));
  });
  // Doble clic en un color propio: se quita de la paleta.
  toolbar.addEventListener('dblclick', function (ev) {
    var sw = ev.target.closest('.pr-swatch--mine'); if (!sw) return;
    var c = (sw.getAttribute('data-pr-swatch') || '').toLowerCase();
    design.swatches = misColores().filter(function (x) { return String(x).toLowerCase() !== c; });
    pintaSwatches(); marca();
  });

  /* ⚠️⚠️ CUENTAGOTAS: coge un color de CUALQUIER PARTE DE LA PANTALLA (`EyeDropper`, la API nativa
     del navegador) y lo AÑADE a la paleta del diseño, así queda a un clic para el resto del texto.
     Si el navegador no la tiene (Safari), el botón no se pinta: un botón que no funciona estorba. */
  function añadeColor(c) {
    c = String(c || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(c)) return;
    var ya = misColores().map(function (x) { return String(x).toLowerCase(); });
    if (ya.indexOf(c) < 0) design.swatches = misColores().concat([c]).slice(-12);
    pintaSwatches(); marca();
  }
  window.app33PressAddColor = añadeColor;      // lo usan también los selectores de color de módulo
  var btnGota = toolbar.querySelector('[data-pr-eyedrop]');
  if (btnGota && window.EyeDropper) {
    btnGota.classList.remove('d-none');
    btnGota.addEventListener('click', function () {
      var b = sel ? bloque(sel) : null;
      new window.EyeDropper().open().then(function (res) {
        var c = (res && res.sRGBHex) || '';
        añadeColor(c);
        // Si hay un texto seleccionado, se le aplica ya; si no, queda en la paleta para usarlo.
        if (b && c) aplicaColor(b, c);
        var inp = toolbar.querySelector('[data-pr-color]');
        if (inp && /^#[0-9a-fA-F]{6}$/.test(c)) inp.value = c;
      }).catch(function () {});   // cancelar con Escape no es un error
    });
  }

  /* ---------- añadir: desde la paleta (arrastrando o pinchando) ---------- */
  function nuevoBloque(tipo, x, y, extra) {
    var b = { id: uid(), type: tipo, x: (x == null ? 40 : x), y: y, w: 520, h: 60 };
    if (tipo === 'title') { b.h = 60; b.html = esCampana ? '<p>Titular del correo</p>' : '<p>Titular de la nota de prensa</p>'; b.style = { size: 28, bold: true, align: 'left', line: 1.2, color: '#111827' }; }
    else if (tipo === 'text') { b.h = 120; b.html = esCampana ? '<p>Escribe o pega aquí el texto…</p>' : '<p>Escribe o pega aquí el texto de la nota…</p>'; b.style = { size: 15, bold: false, align: 'left', line: 1.45, color: '#111827' }; }
    else if (tipo === 'image') {
      // Un LOGO de la paleta llega ya con su URL: se coloca sin preguntar (más pequeño, como un logo).
      var pre = (extra && extra.ref && extra.ref.url) ? extra.ref : null;
      b.ref = pre ? { url: pre.url, w: pre.w || 0, h: pre.h || 0, alt: pre.alt || '' } : { url: '', w: 0, h: 0, alt: '' };
      b.opts = { href: '' }; b.h = 150;
      // El módulo de LOGO se arrastra vacío y luego se elige cuál: nace con el tamaño de un logo.
      if (extra && extra.pick) { b.pick = extra.pick; b.w = 180; b.h = 90; }
      if (pre) { b.w = 180; b.h = 90; }
    }
    else if (tipo === 'files') { b.ref = {}; b.opts = { title: 'Archivos adjuntos', color: (corporate[0] || '#E33D48') }; b.h = 96; }
    else if (tipo === 'playlist') { b.ref = (extra && extra.ref) || {}; b.opts = {}; b.h = 120; }
    /* Los DATOS DE LA ACTIVIDAD: el cartel a la izquierda y los datos a la derecha, así que nace
       ancho (el alto lo calcula su contenido, como todos los módulos). */
    else if (tipo === 'activity') { b.ref = (extra && extra.ref) || {}; b.opts = {}; b.h = 170; }
    /* UN VÍDEO DE YOUTUBE: nace con la proporción del vídeo (16:9) y se le pide la URL al colocarlo.
       Se mueve, se cambia de tamaño y se pueden poner todos los que hagan falta, como cualquier
       otro módulo: cada arrastre es un vídeo nuevo. */
    else if (tipo === 'youtube') { b.ref = { url: ((extra && extra.ref && extra.ref.url) || '') }; b.opts = { radius: 12 }; b.h = Math.round(b.w * 9 / 16); }
    else { b.ref = (extra && extra.ref) || {}; b.opts = { download: false, align: 'center' }; b.h = 90; }
    if (y == null) { var abajo = Math.max(bgH() * 0.55, 0); design.blocks.forEach(function (o) { abajo = Math.max(abajo, o.y + o.h + 16); }); b.y = abajo; }
    design.blocks.push(b);
    pintaBloque(b);
    canvas.style.height = Math.round(canvasH()) + 'px'; escala();
    marca(); selecciona(b.id);
    if (tipo === 'title' || tipo === 'text') { var t = elDe(b.id).querySelector('.pr-blk__text'); t.focus(); document.execCommand('selectAll', false, null); }
    // Se elige en cuanto se coloca: la imagen, o el LOGO si el módulo es el de logos.
    if (tipo === 'image' && !(b.ref && b.ref.url)) { if (b.pick) abrePick(b); else abreImagen(b); }
    if (tipo === 'image' && b.ref && b.ref.url) { refrescaModulo(b); midePreset(b); }
    if (tipo === 'files') abreArchivos(b);          // y los archivos se suben en cuanto se coloca
    if (tipo === 'youtube' && !(b.ref && b.ref.url)) abreYoutube(b);   // se pega la URL al colocarlo
    // ⚠️ Un módulo que se arrastra VACÍO (single, disco, videoclip, enlaces, playlist) pregunta qué
    // lleva en cuanto se coloca; se pueden poner todos los que hagan falta.
    if (tipo !== 'image' && PICK[clavePick(b)] && !refPuesta(b)) abrePick(b);
    return b;
  }
  root.addEventListener('dragstart', function (ev) {
    var p = ev.target.closest('[data-pr-pal]'); if (!p) return;
    ev.dataTransfer.setData('text/plain', JSON.stringify({ type: p.getAttribute('data-pr-pal'),
      pick: p.getAttribute('data-pr-pick') || '', ref: JSON.parse(p.getAttribute('data-pr-ref') || '{}') }));
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
    nuevoBloque(datos.type, Math.max(0, Math.min(W - 520, x - 20)), Math.max(0, y - 10), { ref: datos.ref, pick: datos.pick });
  });
  root.addEventListener('click', function (ev) {
    var p = ev.target.closest('[data-pr-pal]');
    if (p && !ev.target.closest('.pr-pal__hint')) nuevoBloque(p.getAttribute('data-pr-pal'), null, null,
      { ref: JSON.parse(p.getAttribute('data-pr-ref') || '{}'), pick: p.getAttribute('data-pr-pick') || '' });
  });

  /* ---------- los módulos disponibles ---------- */
  function cargaModulos() {
    var box = root.querySelector('[data-pr-modules]');
    fetch(root.getAttribute('data-assets-url')).then(function (r) { return r.json(); }).then(function (js) {
      assets = js || {};
      var grupos = [['activities', 'Datos de la actividad', 'fa-calendar-day'],
                    ['logos', 'Logos del grupo', 'fa-building'], ['artwork', 'Cartelería', 'fa-clapperboard'],
                    ['audios', 'Audio (escuchar / descargar)', 'fa-music'], ['albums', 'Repertorio del disco', 'fa-compact-disc'], ['videos', 'Videoclip', 'fa-film'],
                    ['links', 'Enlaces de plataformas', 'fa-link'], ['photos', 'Fotos', 'fa-images'], ['playlists', 'Playlists', 'fa-list-ul'],
                    ['contact', 'Contactos', 'fa-address-card']];
      /* ⚠️⚠️ EN CADA GRUPO QUE SE ELIGE, **SOLO EL MÓDULO VACÍO**: se arrastra y luego se elige qué
         lleva en el pop-up (y se pueden poner todos los que hagan falta). Lo concreto solo se lista
         en los grupos que no tienen pop-up (cartelería, fotos, contactos). Ver abajo el porqué. */
      // Qué grupo de la paleta lleva su módulo VACÍO arriba, y cómo se llama.
      var GENERICO = { audios: 'audio', albums: 'album', videos: 'video', links: 'links', playlists: 'playlist',
                       activities: 'activity', logos: 'logo' };
      var VACIO_LABEL = { audio: 'Un single', album: 'Un disco', video: 'Un videoclip',
                          links: 'Unos enlaces', playlist: 'Una playlist',
                          activity: 'Una actividad', logo: 'Un logo' };
      /* ⚠️ UN LOGO ES UNA IMAGEN: el bloque que nace es `image` (se mueve, se redimensiona y se
         recorta como cualquier imagen) y `pick` dice QUÉ se elige al colocarlo. */
      var VACIO_TIPO = { logo: 'image' };
      /* ⚠️ EL VÍDEO DE YOUTUBE ESTÁ SIEMPRE: no sale de los materiales de nadie, se pega una URL.
         Va el primero porque es el que más se usa en un correo, y se arrastran los que hagan falta. */
      var html = '<div class="pr-pal-group"><div class="pr-pal-group__t"><i class="fa-brands fa-youtube"></i>Vídeo de YouTube</div>' +
        '<div class="pr-pal pr-pal--empty" draggable="true" data-pr-pal="youtube" data-pr-ref="{}">' +
        '<span class="pr-pal__ico"><i class="fa-brands fa-youtube" style="color:#FF0000"></i></span>' +
        '<span><b>Un vídeo</b><small>Se pega la URL al colocarlo</small></span></div></div>';
      grupos.forEach(function (g) {
        var items = assets[g[0]] || [];
        var gen = GENERICO[g[0]];
        if (!items.length && !gen) return;
        html += '<div class="pr-pal-group"><div class="pr-pal-group__t"><i class="fa ' + g[2] + '"></i>' + esc(g[1]) + '</div>';
        if (gen) {
          html += '<div class="pr-pal pr-pal--empty" draggable="true" data-pr-pal="' + esc(VACIO_TIPO[gen] || gen) + '"' +
            (VACIO_TIPO[gen] ? ' data-pr-pick="' + esc(gen) + '"' : '') + ' data-pr-ref="{}">' +
            '<span class="pr-pal__ico"><i class="fa ' + g[2] + '"></i></span>' +
            '<span><b>' + esc(VACIO_LABEL[gen] || 'Módulo') + '</b><small>Se elige al colocarlo</small></span></div>';
        }
        /* ⚠️⚠️ SOLO EL MÓDULO VACÍO EN TODO LO QUE SE ELIGE (sep 2026, lo pidió Dani en tres
           tandas: primero «pon solo lo de una actividad; lo arrastras y ahí sí seleccionas la
           actividad», después «el módulo de singles también va a ser para arrastrar y luego
           seleccionar el single, y el de logos igual», y el 23-sep «en todas las comunicaciones, un
           single se arrastra y después se selecciona qué canción, para que no aparezcan todas las
           opciones mostradas en la derecha, y lo mismo con las playlist»). Listar lo concreto —cada
           single, cada playlist, cada disco, cada videoclip, los enlaces de cada single— llenaba la
           barra de entradas que hay que leer una a una, cuando el pop-up de elegir (`PICK`) ya las
           trae con su portada y su buscador. La regla es UNA: **si un grupo tiene módulo vacío
           (`GENERICO`), en la paleta va solo ese**; lo concreto se lista únicamente en los grupos
           sin pop-up (cartelería, fotos, contactos). ⚠️ Vale para los TRES envíos (notas de prensa,
           compradores y comunicaciones corporativas): es el mismo editor. */
        if (!gen) {
          html += items.map(function (it) {
            return '<div class="pr-pal" draggable="true" data-pr-pal="' + esc(it.kind) + '" data-pr-ref="' + esc(JSON.stringify(it.ref || {})) + '">' +
              (it.cover ? '<img class="pr-pal__cover" src="' + esc(it.cover) + '" alt="">' : '<span class="pr-pal__ico"><i class="fa ' + g[2] + '"></i></span>') +
              '<span><b>' + esc(it.label) + '</b><small>' + esc(it.sub || '') + '</small></span></div>';
          }).join('');
        }
        html += '</div>';
      });
      box.innerHTML = html;
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
        return '<li><button type="button" class="dropdown-item d-flex align-items-center gap-2" data-pr-tpl="' + esc(t.id) + '">' +
          (t.url ? '<img src="' + esc(t.url) + '" alt="" style="width:34px;height:24px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb">' : '<i class="fa fa-swatchbook fa-fw"></i>') +
          '<span><span class="d-block">' + esc(t.name) + '</span><small class="text-muted">' + esc(t.what || '') + '</small></span></button></li>';
      }).join('');
      html += (tpls.length ? '<li><hr class="dropdown-divider"></li>' : '') +
        '<li><a class="dropdown-item" href="' + esc(root.getAttribute('data-templates-page') || '#') + '"><i class="fa fa-swatchbook fa-fw me-1"></i>Gestionar plantillas</a></li>';
      // Delante, el DISEÑO de la nota que subió Diseño al proyecto del lanzamiento (o su estado).
      var diseno = '';
      if (designAsset && designAsset.available && designAsset.is_image) {
        diseno = '<li><button type="button" class="dropdown-item" data-pr-bg-design><i class="fa fa-palette fa-fw me-1 text-danger"></i>Usar el diseño de Diseño <small class="text-muted">· ' + esc(designAsset.name || '') + '</small></button></li><li><hr class="dropdown-divider"></li>';
      } else if (designAsset && designAsset.pending) {
        diseno = '<li><span class="dropdown-item-text small text-warning"><i class="fa fa-clock me-1"></i>Diseño todavía no ha subido el diseño de la nota (pendiente)</span></li><li><hr class="dropdown-divider"></li>';
      } else if (designAsset && designAsset.available) {
        diseno = '<li><span class="dropdown-item-text small text-muted">' + esc(designAsset.reason || '') + '</span></li><li><hr class="dropdown-divider"></li>';
      }
      menu.innerHTML = diseno + html;
    }).catch(function () {});
  }
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pr-tpl]');
    if (t) {
      /* ⚠️ Una plantilla trae su FONDO **y sus MÓDULOS**: si ya hay algo puesto se pregunta, porque
         reemplaza el diseño entero. */
      var hayAlgo = (design.blocks || []).length > 0;
      if (hayAlgo && !confirm('La plantilla reemplaza el diseño que tienes ahora. ¿Seguimos?')) return;
      var fd = new FormData(); fd.append('template_id', t.getAttribute('data-pr-tpl'));
      marca('Cargando la plantilla…');
      fetch(root.getAttribute('data-tpl-apply-url'), { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || 'No se pudo cargar la plantilla.'); return; }
        design = js.design || design; pintaFondo(); pintaTodo(); marca('Plantilla cargada');
      });
      return;
    }
    if (ev.target.closest('[data-pr-bg-design]')) {
      var fd2 = new FormData(); fd2.append('source', 'design');
      marca('Cargando el diseño de Diseño…');
      fetch(root.getAttribute('data-bg-url'), { method: 'POST', body: fd2 }).then(function (r) { return r.json(); }).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || 'No se pudo usar el diseño.'); return; }
        design.bg = js.bg; pintaFondo(); marca('Fondo cambiado');
      });
    }
  });

  /* ---------- copiar el PITCH ---------- */
  document.addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-pr-copy]'); if (!c) return;
    var el = document.querySelector(c.getAttribute('data-pr-copy')); if (!el) return;
    var texto = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.innerText;
    var antes = c.innerHTML;
    function hecho() { c.innerHTML = '<i class="fa fa-check me-1"></i>Copiado'; setTimeout(function () { c.innerHTML = antes; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(hecho, function () { copiaAntigua(texto); hecho(); });
    else { copiaAntigua(texto); hecho(); }
  });
  function copiaAntigua(texto) {
    var ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }

  /* ---------- los COLORES que se ofrecen: los de la casa y los del fondo ---------- */
  function coloresHtml(actual, attr) {
    var lista = [];
    corporate.forEach(function (c) { if (lista.indexOf(c) < 0) lista.push(c); });
    ((design.bg && design.bg.palette) || []).forEach(function (c) { if (lista.indexOf(c) < 0) lista.push(c); });
    var act = (actual || '').toLowerCase();
    return lista.map(function (c) {
      return '<button type="button" class="pr-swatch--lg' + (act === c.toLowerCase() ? ' is-on' : '') + '" style="background:' + esc(c) + '" ' + attr + '="' + esc(c) + '" title="' + esc(c) + '"></button>';
    }).join('') +
      '<label class="pr-swatch--lg" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);position:relative;overflow:hidden;" title="Otro color">' +
      '<input type="color" ' + attr + '-custom value="' + esc(/^#[0-9a-fA-F]{6}$/.test(actual || '') ? actual : '#E33D48') + '" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;"></label>';
  }

  /* ---------- la IMAGEN integrada: de las fotos, de los materiales o subida ---------- */
  var imgModal = document.getElementById('prImageModal'), imgTarget = null;
  /* ══════════════════════════════════════════════════════════════════════════════════════════
     QUÉ VA DENTRO de un módulo · el single, el disco, el videoclip, los enlaces o la playlist.
     ⚠️⚠️ El módulo se arrastra VACÍO y aquí se elige lo que lleva, así que se pueden poner TODOS
     los que hagan falta (cada arrastre es un módulo nuevo) y cambiarlo después desde su panel.
     Antes había que arrastrar la entrada CONCRETA de la paleta y, salvo la playlist, no se podía
     cambiar sin borrar el módulo.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  var pickModal = document.getElementById('prPickModal');
  var pickTarget = null;
  // De qué grupo de `assets` sale cada módulo y cómo se llama lo que se elige.
  var PICK = {
    audio:    { grupo: 'audios',    titulo: 'Elegir el single',   vacio: 'Este artista no tiene ningún single con máster subido.' },
    album:    { grupo: 'albums',    titulo: 'Elegir el disco',    vacio: 'Este artista no tiene discos.' },
    video:    { grupo: 'videos',    titulo: 'Elegir el videoclip', vacio: 'No hay ningún single con videoclip subido.' },
    links:    { grupo: 'links',     titulo: 'Elegir los enlaces', vacio: 'Ningún single ni disco tiene enlaces de plataforma configurados.' },
    playlist: { grupo: 'playlists', titulo: 'Elegir la playlist', vacio: 'Todavía no hay ninguna playlist.' },
    /* Los DATOS DE UNA ACTIVIDAD: qué es, el artista con su foto, la fecha, el recinto y la hora de
       comienzo, con su cartel si lo hay. Solo se ofrecen las que están POR VENIR. */
    activity: { grupo: 'activities', titulo: 'Elegir la actividad', icon: 'fa-calendar-day',
                vacio: 'No hay ninguna actividad por venir.' },
    /* ⚠️ EL LOGO no es un tipo de bloque: el bloque es una IMAGEN y esta clave vive en `b.pick`
       (por eso todo lo de aquí abajo pregunta por `clavePick(b)` y no por `b.type`). */
    logo:     { grupo: 'logos',      titulo: 'Elegir el logo',     icon: 'fa-building',
                vacio: 'No hay logos de empresa del grupo para esta comunicación.' },
  };
  /* Qué se elige en este bloque: su `pick` si lo lleva (el logo) y, si no, su propio tipo. */
  function clavePick(b) { return (b && b.pick) || (b && b.type) || ''; }
  function opcionesDe(clave) {
    var cfg = PICK[clave]; if (!cfg) return [];
    return (assets && assets[cfg.grupo]) || [];
  }
  function mismoRef(a, b) {
    a = a || {}; b = b || {};
    return ['song_id', 'album_id', 'playlist_id', 'concert_id', 'url'].every(function (k) { return (a[k] || '') === (b[k] || ''); });
  }
  function pintaPick(filtro) {
    if (!pickModal || !pickTarget) return;
    var b = bloque(pickTarget); if (!b) return;
    var cfg = PICK[clavePick(b)] || {};
    var q = (filtro || '').toLowerCase().trim();
    var items = opcionesDe(clavePick(b)).filter(function (it) {
      if (!q) return true;
      return ((it.label || '') + ' ' + (it.sub || '')).toLowerCase().indexOf(q) >= 0;
    });
    var grid = pickModal.querySelector('[data-pr-pick-grid]');
    grid.innerHTML = items.length
      ? items.map(function (it, i) {
          var on = mismoRef(it.ref, b.ref) ? ' is-on' : '';
          return '<button type="button" class="pr-pick' + on + '" data-pr-pick-item="' + i + '">' +
            (it.cover ? '<img src="' + esc(it.cover) + '" alt="" loading="lazy">' : '<span class="pr-pick__ph"><i class="fa ' + esc(cfg.icon || 'fa-music') + '"></i></span>') +
            '<span class="pr-pick__t">' + esc(it.label || '') + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span></button>';
        }).join('')
      : '<div class="text-muted small">' + esc(q ? 'Nada con ese nombre.' : (cfg.vacio || 'No hay nada que elegir.')) + '</div>';
    grid.__items = items;
  }
  function abrePick(b) {
    if (!pickModal || !window.bootstrap || !b || !PICK[clavePick(b)]) return;
    pickTarget = b.id;
    var tt = pickModal.querySelector('[data-pr-pick-title]');
    if (tt) tt.textContent = PICK[clavePick(b)].titulo;
    var q = pickModal.querySelector('[data-pr-pick-search]'); if (q) q.value = '';
    pintaPick('');
    bootstrap.Modal.getOrCreateInstance(pickModal).show();
  }
  if (pickModal) {
    pickModal.addEventListener('click', function (ev) {
      var it = ev.target.closest('[data-pr-pick-item]'); if (!it || !pickTarget) return;
      var grid = pickModal.querySelector('[data-pr-pick-grid]');
      var datos = (grid.__items || [])[parseInt(it.getAttribute('data-pr-pick-item'), 10)];
      var b = bloque(pickTarget); if (!b || !datos) return;
      bootstrap.Modal.getOrCreateInstance(pickModal).hide();
      /* ⚠️ Un LOGO es una imagen: se pone con el mismo camino que cualquier otra para que respete
         su proporción (si no, sale estirado) y se pueda recortar después. */
      if (b.type === 'image') {
        var r = datos.ref || {};
        aplicaImagenBloque(b, r.url || '', r.w || 0, r.h || 0, r.url || '');
        pintaProps(b);
        return;
      }
      b.ref = Object.assign({}, datos.ref || {});
      delete b.html_cache;
      marca(); refrescaModulo(b); pintaProps(b);
    });
    pickModal.addEventListener('input', function (ev) {
      if (ev.target.closest('[data-pr-pick-search]')) pintaPick(ev.target.value);
    });
  }
  /* Pinchar un módulo VACÍO en el lienzo abre su selector: es justo lo que dice su hueco
     («Pincha para elegir qué single»). En uno ya elegido se cambia desde su panel. */
  canvas.addEventListener('click', function (ev) {
    var el = ev.target.closest('.pr-blk'); if (!el) return;
    var b = bloque(el.getAttribute('data-id'));
    if (b && b.type === 'youtube' && !(b.ref && b.ref.url)) { abreYoutube(b); return; }
    if (b && PICK[clavePick(b)] && !refPuesta(b)) abrePick(b);
  });
  function refPuesta(b) {
    var r = (b && b.ref) || {};
    return !!(r.song_id || r.album_id || r.playlist_id || r.concert_id || r.url);
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LA URL DEL VÍDEO DE YOUTUBE
     ⚠️ Se acepta lo que cualquiera copia y pega (la barra del navegador, «Compartir», un Short o
     el propio código): quién decide si vale es el SERVIDOR (`youtube_video_id`), que es el mismo
     que compone la miniatura y la página del pop-up — aquí solo se avisa pronto de lo que se ve a
     simple vista que no es un YouTube, para no hacer ir y volver.
     ══════════════════════════════════════════════════════════════════════════════════════════ */
  var ytModal = document.getElementById('prYoutubeModal'), ytTarget = null;
  function abreYoutube(b) {
    if (!ytModal || !window.bootstrap || !b) return;
    ytTarget = b.id;
    var inp = ytModal.querySelector('[data-pr-yt-url]');
    if (inp) inp.value = (b.ref && b.ref.url) || '';
    ytError('');
    bootstrap.Modal.getOrCreateInstance(ytModal).show();
    // ⚠️ `shown.bs.modal` no siempre llega (con modal_stack.js por medio): se enfoca con un respiro.
    setTimeout(function () { if (inp) { inp.focus(); inp.select(); } }, 250);
  }
  function ytError(msg) {
    var e = ytModal && ytModal.querySelector('[data-pr-yt-error]'); if (!e) return;
    e.textContent = msg || ''; e.classList.toggle('d-none', !msg);
  }
  function ytGuarda() {
    var b = bloque(ytTarget); if (!b || !ytModal) return;
    var inp = ytModal.querySelector('[data-pr-yt-url]');
    var v = ((inp && inp.value) || '').trim();
    if (!v) { ytError('Pega la URL del vídeo de YouTube.'); return; }
    if (v.indexOf('youtu') < 0 && !/^[A-Za-z0-9_-]{11}$/.test(v)) {
      ytError('Eso no parece un vídeo de YouTube. Pega el enlace tal cual lo copias del navegador.');
      return;
    }
    b.ref = { url: v };
    delete b.html_cache;
    marca(); refrescaModulo(b); pintaProps(b);
    bootstrap.Modal.getOrCreateInstance(ytModal).hide();
  }
  if (ytModal) {
    ytModal.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-pr-yt-save]')) ytGuarda();
    });
    ytModal.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target.closest('[data-pr-yt-url]')) { ev.preventDefault(); ytGuarda(); }
    });
  }
  // Desde el panel de la derecha: «Cambiar la URL».
  root.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-pr-yt-open]')) return;
    var b = sel ? bloque(sel) : null;
    if (b && b.type === 'youtube') abreYoutube(b);
  });

  function abreImagen(b) {
    if (!imgModal || !window.bootstrap || !b) return;
    imgTarget = b.id;
    var tt = imgModal.querySelector('.modal-title'); if (tt) tt.innerHTML = '<i class="fa fa-image me-2 text-danger"></i>Elegir la imagen';
    pintaImgTab('photos'); pintaAlbums(); pintaMateriales();
    bootstrap.Modal.getOrCreateInstance(imgModal).show();
  }
  /* La FOTO DE MINIATURA de la nota (la tarjeta del enlace y la del módulo insertable): el MISMO selector
     que una imagen, con el destino `__thumb__`. */
  function abreMiniatura() {
    if (!imgModal || !window.bootstrap) return;
    imgTarget = '__thumb__';
    var tt = imgModal.querySelector('.modal-title'); if (tt) tt.innerHTML = '<i class="fa fa-image-portrait me-2 text-danger"></i>La foto de miniatura de la nota';
    pintaImgTab('photos'); pintaAlbums(); pintaMateriales();
    bootstrap.Modal.getOrCreateInstance(imgModal).show();
  }
  function guardaMiniatura(url) {
    post(root.getAttribute('data-thumb-url'), { url: url || '' }).then(function (js) {
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo guardar la miniatura.'); return; }
      var im = root.querySelector('[data-pr-thumb-img]'), ico = root.querySelector('[data-pr-thumb-ico]');
      if (im) { im.src = js.url || ''; im.classList.toggle('d-none', !js.url); }
      if (ico) ico.classList.toggle('d-none', !!js.url);
      marca(js.url ? 'Miniatura guardada' : 'Miniatura quitada');
    });
  }
  root.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-pr-thumb-pick]')) abreMiniatura();
    // «Elegir / Cambiar» del panel: el MISMO selector que al colocar el módulo.
    if (ev.target.closest('[data-pr-pick-open]') && sel) { var bp = bloque(sel); if (bp) abrePick(bp); }
  });
  function pintaImgTab(t) {
    imgModal.querySelectorAll('[data-pr-img-tab]').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-pr-img-tab') === t); });
    imgModal.querySelectorAll('[data-pr-img-pane]').forEach(function (p) { p.classList.toggle('d-none', p.getAttribute('data-pr-img-pane') !== t); });
  }
  function tarjetaImg(thumb, label, sub, attrs) {
    return '<button type="button" class="pr-pick" ' + attrs + '>' +
      (thumb ? '<img src="' + esc(thumb) + '" alt="" loading="lazy">' : '<span class="pr-pick__ph"><i class="fa fa-image"></i></span>') +
      '<span class="pr-pick__t">' + esc(label || '') + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
  }
  function pintaAlbums() {
    var box = imgModal.querySelector('[data-pr-img-albums]'), fotos = imgModal.querySelector('[data-pr-img-photos]');
    box.classList.remove('d-none'); fotos.classList.add('d-none'); imgModal.querySelector('[data-pr-img-back]').classList.add('d-none');
    imgModal.querySelector('[data-pr-img-hint]').textContent = 'Los álbumes de fotos del artista, del evento y de la actividad de la nota.';
    var albums = (assets && assets.photos) || [];
    box.innerHTML = albums.length ? albums.map(function (a) { return tarjetaImg(a.cover, a.label, a.sub, 'data-pr-img-album="' + esc(a.ref.album_id) + '"'); }).join('')
      : '<div class="text-muted small">No hay álbumes de fotos de este artista o actividad: usa «Materiales» o «Subir».</div>';
  }
  function pintaFotos(albumId, nombre) {
    var box = imgModal.querySelector('[data-pr-img-albums]'), fotos = imgModal.querySelector('[data-pr-img-photos]');
    box.classList.add('d-none'); fotos.classList.remove('d-none'); imgModal.querySelector('[data-pr-img-back]').classList.remove('d-none');
    imgModal.querySelector('[data-pr-img-hint]').textContent = nombre || 'Fotos';
    fotos.innerHTML = '<div class="text-muted small">Cargando…</div>';
    fetch(photosUrlTpl.replace('__ALBUM__', encodeURIComponent(albumId))).then(function (r) { return r.json(); }).then(function (js) {
      var lista = (js && js.photos) || [];
      fotos.innerHTML = lista.length ? lista.map(function (p) { return tarjetaImg(p.thumb, p.title, '', 'data-pr-img-use="' + esc(p.url) + '" data-w="' + (p.w || 0) + '" data-h="' + (p.h || 0) + '"'); }).join('')
        : '<div class="text-muted small">Este álbum no tiene fotos.</div>';
    }).catch(function () { fotos.innerHTML = '<div class="text-danger small">No se pudieron cargar las fotos.</div>'; });
  }
  function pintaMateriales() {
    var box = imgModal.querySelector('[data-pr-img-materials]');
    var lista = (assets && assets.images) || [];
    box.innerHTML = lista.length ? lista.map(function (m) { return tarjetaImg(m.thumb, m.label, m.sub, 'data-pr-img-use="' + esc(m.url) + '"'); }).join('')
      : '<div class="text-muted small">No hay materiales con imagen para este lanzamiento.</div>';
  }
  function usaImagen(url, w, h) {
    if (imgTarget === '__thumb__') {
      guardaMiniatura(url);
      var inst0 = window.bootstrap && bootstrap.Modal.getInstance(imgModal); if (inst0) inst0.hide();
      return;
    }
    var b = bloque(imgTarget); if (!b) return;
    aplicaImagenBloque(b, url, w, h, url);
    var inst = window.bootstrap && bootstrap.Modal.getInstance(imgModal); if (inst) inst.hide();
  }
  /* Pone una imagen en un bloque (elegida, subida o recortada) conservando la proporción.
     `origUrl` es la imagen TAL COMO SE SUBIÓ: desde ella se vuelve a recortar y a ella se vuelve. */
  function aplicaImagenBloque(b, url, w, h, origUrl) {
    function aplica(ww, hh) {
      b.ref = { url: url, w: ww || 0, h: hh || 0, alt: (b.ref || {}).alt || '', orig_url: origUrl || url };
      if (ww > 0 && hh > 0) b.h = Math.round(b.w * hh / ww);
      delete b.html_cache; pintaBloque(b); refrescaModulo(b); marca(); selecciona(b.id);
      canvas.style.height = Math.round(canvasH()) + 'px'; escala();
    }
    if (w > 0 && h > 0) aplica(w, h);
    else { var im = new Image(); im.onload = function () { aplica(im.naturalWidth, im.naturalHeight); }; im.onerror = function () { aplica(0, 0); }; im.src = url; }
  }
  function subeImagen(file) {
    if (!file) return;
    var prog = imgModal.querySelector('[data-pr-img-progress]');
    prog.classList.remove('d-none'); prog.textContent = 'Subiendo ' + file.name + '…';
    var fd = new FormData(); fd.append('file', file);
    fetch(imageUrl, { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (js) {
      prog.classList.add('d-none');
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo subir la imagen.'); return; }
      usaImagen(js.url, js.w, js.h);
    }).catch(function () { prog.classList.add('d-none'); alert('No se pudo subir la imagen.'); });
  }
  if (imgModal) {
    imgModal.setAttribute('data-file-drop', 'off');           // el arrastre global no se mete en este pop-up
    imgModal.addEventListener('click', function (ev) {
      var tab = ev.target.closest('[data-pr-img-tab]'); if (tab) { pintaImgTab(tab.getAttribute('data-pr-img-tab')); return; }
      var al = ev.target.closest('[data-pr-img-album]'); if (al) { pintaFotos(al.getAttribute('data-pr-img-album'), al.textContent.trim()); return; }
      if (ev.target.closest('[data-pr-img-back]')) { pintaAlbums(); return; }
      var use = ev.target.closest('[data-pr-img-use]'); if (use) { usaImagen(use.getAttribute('data-pr-img-use'), parseInt(use.getAttribute('data-w') || '0', 10), parseInt(use.getAttribute('data-h') || '0', 10)); }
    });
    var inpImg = imgModal.querySelector('[data-pr-img-file]');
    if (inpImg) inpImg.addEventListener('change', function () { subeImagen(inpImg.files && inpImg.files[0]); inpImg.value = ''; });
    var dropImg = imgModal.querySelector('[data-pr-img-drop]');
    if (dropImg) {
      dropImg.addEventListener('dragover', function (ev) { ev.preventDefault(); dropImg.classList.add('is-over'); });
      dropImg.addEventListener('dragleave', function () { dropImg.classList.remove('is-over'); });
      dropImg.addEventListener('drop', function (ev) { ev.preventDefault(); dropImg.classList.remove('is-over'); var f = ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) subeImagen(f); });
    }
  }

  /* ---------- RECORTAR / AJUSTAR la imagen de un bloque ----------
     Un recuadro que se arrastra y se redimensiona sobre la imagen (con la parte de fuera atenuada),
     botones de PROPORCIÓN (libre, la original, 1:1, 4:3, 3:2, 16:9, 9:16) y de GIRAR. El recuadro se
     mide en FRACCIONES de la imagen ya girada y el recorte lo hace el SERVIDOR (Pillow), que
     devuelve una imagen NUEVA: la original no se toca y queda en `ref.orig_url` para poder volver. */
  var ASPECTS = [['', 'Libre'], ['orig', 'Original'], ['1', '1:1'], ['1.3333', '4:3'], ['1.5', '3:2'], ['1.7778', '16:9'], ['0.5625', '9:16']];
  function abreRecorte(b) {
    if (!b || !b.ref || !b.ref.url || !imageCropUrl) return;
    var src = b.ref.orig_url || b.ref.url;
    var ov = document.createElement('div');
    ov.className = 'prcrop-ov';
    ov.innerHTML = '<div class="prcrop-panel"><div class="prcrop-head"><i class="fa fa-crop-simple me-2"></i>Recortar o ajustar la imagen' +
      '<button type="button" class="btn-close btn-close-white ms-auto" data-prcrop-cancel aria-label="Cerrar"></button></div>' +
      '<div class="prcrop-tools">' +
      '<span class="prcrop-tools__t">Proporción</span>' + ASPECTS.map(function (a) { return '<button type="button" class="prcrop-tb' + (a[0] === '' ? ' is-on' : '') + '" data-prcrop-aspect="' + a[0] + '">' + a[1] + '</button>'; }).join('') +
      '<span class="prcrop-tools__sep"></span>' +
      '<button type="button" class="prcrop-tb" data-prcrop-rot="-90" title="Girar a la izquierda"><i class="fa fa-rotate-left"></i></button>' +
      '<button type="button" class="prcrop-tb" data-prcrop-rot="90" title="Girar a la derecha"><i class="fa fa-rotate-right"></i></button>' +
      '<span class="prcrop-tools__sep"></span>' +
      '<button type="button" class="prcrop-tb" data-prcrop-reset title="Toda la imagen, sin girar"><i class="fa fa-expand"></i> Toda</button>' +
      '</div>' +
      '<div class="prcrop-stage" data-prcrop-stage><div class="prcrop-loading text-muted small">Cargando la imagen…</div></div>' +
      '<div class="prcrop-foot"><span class="small text-muted" data-prcrop-info></span>' +
      '<button type="button" class="btn btn-outline-secondary btn-sm" data-prcrop-cancel>Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-prcrop-apply disabled><i class="fa fa-check me-1"></i>Aplicar</button></div></div>';
    document.body.appendChild(ov);
    var stageEl = ov.querySelector('[data-prcrop-stage]'), info = ov.querySelector('[data-prcrop-info]'), btnApply = ov.querySelector('[data-prcrop-apply]');
    var natW = 0, natH = 0, rot = 0, aspect = null, aspectKey = '';
    var st = { x: 0, y: 0, w: 1, h: 1 };            // en fracciones de la imagen GIRADA
    var dispW = 0, dispH = 0, img = null, boxEl = null;
    function cierra() { ov.remove(); }
    function rotDims() { return (rot === 90 || rot === 270) ? [natH, natW] : [natW, natH]; }
    function monta() {
      var rd = rotDims(), rw = rd[0], rh = rd[1];
      var maxW = Math.min(window.innerWidth * 0.92, 900) - 24, maxH = Math.max(240, window.innerHeight * 0.62);
      var sc = Math.min(maxW / rw, maxH / rh, 1); if (!isFinite(sc) || sc <= 0) sc = 1;
      dispW = Math.round(rw * sc); dispH = Math.round(rh * sc);
      stageEl.style.width = dispW + 'px'; stageEl.style.height = dispH + 'px';
      var iw = (rot === 90 || rot === 270) ? dispH : dispW, ih = (rot === 90 || rot === 270) ? dispW : dispH;
      stageEl.innerHTML = '<img class="prcrop-img" src="' + esc(src) + '" alt="" draggable="false" style="width:' + iw + 'px;height:' + ih + 'px;left:' + Math.round((dispW - iw) / 2) + 'px;top:' + Math.round((dispH - ih) / 2) + 'px;transform:rotate(' + rot + 'deg);">' +
        '<div class="prcrop-box" data-prcrop-box>' + ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map(function (h) { return '<span class="prcrop-h prcrop-h--' + h + '" data-h="' + h + '"></span>'; }).join('') + '</div>';
      boxEl = stageEl.querySelector('[data-prcrop-box]');
      pinta();
    }
    function pinta() {
      if (!boxEl) return;
      boxEl.style.left = Math.round(st.x * dispW) + 'px'; boxEl.style.top = Math.round(st.y * dispH) + 'px';
      boxEl.style.width = Math.round(st.w * dispW) + 'px'; boxEl.style.height = Math.round(st.h * dispH) + 'px';
      var rd = rotDims();
      info.textContent = Math.round(st.w * rd[0]) + ' × ' + Math.round(st.h * rd[1]) + ' px' + (rot ? ' · girada ' + rot + '°' : '');
    }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    // Encaja un recuadro con la proporción pedida (en px del stage), lo más grande posible y centrado.
    function encaja(asp) {
      if (!asp) { st = { x: 0, y: 0, w: 1, h: 1 }; pinta(); return; }
      var w = dispW, h = w / asp; if (h > dispH) { h = dispH; w = h * asp; }
      st = { x: (dispW - w) / 2 / dispW, y: (dispH - h) / 2 / dispH, w: w / dispW, h: h / dispH }; pinta();
    }
    function aspectValor(key) { if (key === 'orig') { var rd = rotDims(); return rd[1] ? rd[0] / rd[1] : null; } var v = parseFloat(key); return (isFinite(v) && v > 0) ? v : null; }
    // Arrastrar: mover o redimensionar (en px del stage); con proporción fija manda el ancho y el
    // alto se deduce, anclando la esquina contraria.
    var drag = null;
    stageEl.addEventListener('pointerdown', function (ev) {
      if (!boxEl) return;
      var h = ev.target.closest('.prcrop-h'), enBox = ev.target.closest('.prcrop-box');
      var r = stageEl.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      var bx = { x: st.x * dispW, y: st.y * dispH, w: st.w * dispW, h: st.h * dispH };
      if (h) drag = { modo: h.getAttribute('data-h'), sx: px, sy: py, o: bx };
      else if (enBox) drag = { modo: 'move', sx: px, sy: py, o: bx };
      else {
        // Pinchar FUERA del recuadro empieza uno nuevo desde ese punto.
        drag = { modo: 'se', sx: px, sy: py, o: { x: clamp(px, 0, dispW), y: clamp(py, 0, dispH), w: 0, h: 0 }, nuevo: true };
      }
      ev.preventDefault();
      try { stageEl.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    stageEl.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var r = stageEl.getBoundingClientRect(), px = clamp(ev.clientX - r.left, 0, dispW), py = clamp(ev.clientY - r.top, 0, dispH);
      var dx = px - drag.sx, dy = py - drag.sy, o = drag.o, MIN = 24;
      var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (drag.modo === 'move') {
        x1 = clamp(o.x + dx, 0, dispW - o.w); y1 = clamp(o.y + dy, 0, dispH - o.h); x2 = x1 + o.w; y2 = y1 + o.h;
      } else {
        var m = drag.modo;
        if (m.indexOf('w') >= 0) x1 = clamp(o.x + dx, 0, x2 - MIN);
        if (m.indexOf('e') >= 0) x2 = clamp(o.x + o.w + dx, x1 + MIN, dispW);
        if (m.indexOf('n') >= 0) y1 = clamp(o.y + dy, 0, y2 - MIN);
        if (m.indexOf('s') >= 0) y2 = clamp(o.y + o.h + dy, y1 + MIN, dispH);
        if (aspect) {
          // El ANCHO manda salvo en los tiradores de arriba/abajo; la esquina contraria se queda quieta.
          var w = x2 - x1, hh = y2 - y1;
          if (m === 'n' || m === 's') w = hh * aspect; else hh = w / aspect;
          if (m.indexOf('w') >= 0) x1 = x2 - w; else x2 = x1 + w;
          if (m.indexOf('n') >= 0) y1 = y2 - hh; else y2 = y1 + hh;
          if (m === 'n' || m === 's') { x1 = o.x + (o.w - w) / 2; x2 = x1 + w; }
          if (m === 'e' || m === 'w') { y1 = o.y + (o.h - hh) / 2; y2 = y1 + hh; }
          // Si se sale del lienzo se encoge conservando la proporción.
          var k2 = 1;
          if (x1 < 0) k2 = Math.min(k2, (x2) / (x2 - x1)); if (x2 > dispW) k2 = Math.min(k2, (dispW - x1) / (x2 - x1));
          if (y1 < 0) k2 = Math.min(k2, (y2) / (y2 - y1)); if (y2 > dispH) k2 = Math.min(k2, (dispH - y1) / (y2 - y1));
          if (k2 < 1) {
            var nw = (x2 - x1) * k2, nh = (y2 - y1) * k2;
            if (m.indexOf('w') >= 0) x1 = x2 - nw; else x2 = x1 + nw;
            if (m.indexOf('n') >= 0) y1 = y2 - nh; else y2 = y1 + nh;
            if (m === 'n' || m === 's') { x1 = clamp(o.x + (o.w - nw) / 2, 0, dispW - nw); x2 = x1 + nw; }
            if (m === 'e' || m === 'w') { y1 = clamp(o.y + (o.h - nh) / 2, 0, dispH - nh); y2 = y1 + nh; }
          }
        }
      }
      st = { x: x1 / dispW, y: y1 / dispH, w: (x2 - x1) / dispW, h: (y2 - y1) / dispH };
      pinta();
    });
    function suelta() { drag = null; }
    stageEl.addEventListener('pointerup', suelta); stageEl.addEventListener('pointercancel', suelta);
    ov.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-prcrop-cancel]')) { cierra(); return; }
      var a = ev.target.closest('[data-prcrop-aspect]');
      if (a) {
        aspectKey = a.getAttribute('data-prcrop-aspect'); aspect = aspectValor(aspectKey);
        ov.querySelectorAll('[data-prcrop-aspect]').forEach(function (x) { x.classList.toggle('is-on', x === a); });
        encaja(aspect); return;
      }
      var rb = ev.target.closest('[data-prcrop-rot]');
      if (rb) { rot = (rot + parseInt(rb.getAttribute('data-prcrop-rot'), 10) + 360) % 360; monta(); aspect = aspectValor(aspectKey); encaja(aspect); return; }
      if (ev.target.closest('[data-prcrop-reset]')) {
        rot = 0; aspectKey = ''; aspect = null;
        ov.querySelectorAll('[data-prcrop-aspect]').forEach(function (x) { x.classList.toggle('is-on', x.getAttribute('data-prcrop-aspect') === ''); });
        monta(); return;
      }
      if (ev.target.closest('[data-prcrop-apply]')) {
        btnApply.disabled = true; btnApply.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Recortando…';
        post(imageCropUrl, { url: src, x: st.x, y: st.y, w: st.w, h: st.h, rotate: rot }).then(function (js) {
          if (!js || !js.ok) { alert((js && js.error) || 'No se pudo recortar la imagen.'); btnApply.disabled = false; btnApply.innerHTML = '<i class="fa fa-check me-1"></i>Aplicar'; return; }
          aplicaImagenBloque(b, js.url, js.w, js.h, src);
          cierra();
        }).catch(function () { alert('No se pudo recortar la imagen.'); btnApply.disabled = false; btnApply.innerHTML = '<i class="fa fa-check me-1"></i>Aplicar'; });
      }
    });
    document.addEventListener('keydown', function esc_(ev) { if (!document.body.contains(ov)) { document.removeEventListener('keydown', esc_); return; } if (ev.key === 'Escape') { cierra(); document.removeEventListener('keydown', esc_); } });
    var pre = new Image();
    pre.onload = function () { natW = pre.naturalWidth; natH = pre.naturalHeight; if (!natW || !natH) { stageEl.innerHTML = '<div class="text-danger small p-3">No se pudo leer la imagen.</div>'; return; } monta(); btnApply.disabled = false; };
    pre.onerror = function () { stageEl.innerHTML = '<div class="text-danger small p-3">No se pudo cargar la imagen.</div>'; };
    pre.src = src;
  }

  /* ---------- los CONTACTOS del módulo de contacto: prensa + quien crea la nota + los que se añadan ---------- */
  var contactsModal = document.getElementById('prContactsModal'), contactsTarget = null, staffTimer = null;
  function midePreset(b) {
    // Un logo que llega sin medidas: se miden al cargarlo para no deformarlo al redimensionar.
    if (!b || !b.ref || !b.ref.url || (b.ref.w > 0 && b.ref.h > 0)) return;
    var im = new Image();
    im.onload = function () {
      b.ref.w = im.naturalWidth; b.ref.h = im.naturalHeight;
      if (b.ref.w > 0) b.h = Math.round(b.w * b.ref.h / b.ref.w);
      pintaBloque(b); canvas.style.height = Math.round(canvasH()) + 'px'; escala(); marca();
    };
    im.src = b.ref.url;
  }
  function abreContactos(b) {
    if (!contactsModal || !window.bootstrap || !b) return;
    contactsTarget = b.id;
    pintaContactos(b);
    var inp = contactsModal.querySelector('[data-pr-contacts-search]'); if (inp) inp.value = '';
    contactsModal.querySelector('[data-pr-contacts-results]').innerHTML = '';
    bootstrap.Modal.getOrCreateInstance(contactsModal).show();
    buscaPersonal('');
  }
  function tarjetaContacto(c, quitable) {
    return '<div class="pr-contact">' +
      (c.photo ? '<img class="pr-contact__ava" src="' + esc(c.photo) + '" alt="" data-avatar="1">' : '<span class="pr-contact__ava pr-contact__ava--ico"><i class="fa fa-user"></i></span>') +
      '<span class="pr-contact__t"><small>' + esc(c.role_label || 'Contacto') + '</small><b>' + esc(c.name || '') + '</b>' +
      '<span class="text-muted">' + esc(c.email || '') + (c.phone ? ' · ' + esc(c.phone) : '') + '</span></span>' +
      (quitable ? '<button type="button" class="btn btn-sm btn-outline-danger" data-pr-contact-del="' + esc(c.kind === 'press' ? '__press__' : c.user_id) + '" title="Quitar"><i class="fa fa-trash"></i></button>'
                : '<span class="badge text-bg-light border">Siempre</span>') + '</div>';
  }
  function pintaContactos(b) {
    var box = contactsModal.querySelector('[data-pr-contacts-list]');
    // Lo pinta el SERVIDOR (el mismo renderizador): se le pide el módulo y se lee su `data`.
    box.innerHTML = '<div class="text-muted small">Cargando…</div>';
    post(root.getAttribute('data-block-url'), { id: b.id, type: b.type, pick: b.pick || '', ref: b.ref || {}, opts: b.opts || {}, w: b.w }).then(function (js) {
      var lista = (js && js.data && js.data.contacts) || [];
      // NINGUNO es fijo: todos se pueden quitar (y volver a añadir).
      box.innerHTML = lista.length ? lista.map(function (c) { return tarjetaContacto(c, true); }).join('') : '<div class="text-muted small">Sin contactos: añade a alguien abajo.</div>';
      var sinPrensa = !lista.some(function (c) { return c.kind === 'press'; });
      var btn = contactsModal.querySelector('[data-pr-contact-press-add]'); if (btn) btn.classList.toggle('d-none', !sinPrensa);
      var el = elDe(b.id); if (el && js && js.ok) { el.querySelector('.pr-blk__mod').innerHTML = js.html || ''; b.html_cache = js.html; ajustaAltoModulo(b); }
    });
  }
  function buscaPersonal(q) {
    var box = contactsModal.querySelector('[data-pr-contacts-results]');
    fetch(staffUrl + '?q=' + encodeURIComponent(q || '')).then(function (r) { return r.json(); }).then(function (js) {
      var b = bloque(contactsTarget); var ya = ((b && b.ref && b.ref.user_ids) || []).map(String);
      var rows = ((js && js.rows) || []).filter(function (r) { return ya.indexOf(String(r.user_id)) < 0; });
      box.innerHTML = rows.length ? rows.map(function (r) {
        return '<button type="button" class="pr-pick" data-pr-contact-add="' + esc(r.user_id) + '" title="' + esc(r.department_label || '') + '">' +
          (r.photo ? '<img src="' + esc(r.photo) + '" alt="" loading="lazy">' : '<span class="pr-pick__ph"><i class="fa fa-user"></i></span>') +
          '<span class="pr-pick__t">' + esc(r.name || '') + '<small>' + esc(r.department_label || '') + '</small></span></button>';
      }).join('') : '<div class="text-muted small">Nadie con ese nombre.</div>';
    }).catch(function () { box.innerHTML = '<div class="text-danger small">No se pudo buscar.</div>'; });
  }
  if (contactsModal) {
    contactsModal.addEventListener('input', function (ev) {
      if (!ev.target.matches('[data-pr-contacts-search]')) return;
      clearTimeout(staffTimer); var v = ev.target.value;
      staffTimer = setTimeout(function () { buscaPersonal(v); }, 200);
    });
    contactsModal.addEventListener('click', function (ev) {
      var b = bloque(contactsTarget); if (!b) return;
      var add = ev.target.closest('[data-pr-contact-add]');
      if (add) {
        b.ref = b.ref || {}; b.ref.user_ids = (b.ref.user_ids || []).map(String);
        if (!b.ref.preset) {
          // Módulo ANTIGUO: se fija la lista tal como se ve antes de añadir (quien creó la nota iba implícito).
          var vistos = Array.prototype.slice.call(contactsModal.querySelectorAll('[data-pr-contact-del]'))
            .map(function (x) { return x.getAttribute('data-pr-contact-del'); }).filter(function (x) { return x && x !== '__press__'; });
          vistos.forEach(function (x) { if (b.ref.user_ids.indexOf(x) < 0) b.ref.user_ids.push(x); });
          b.ref.preset = 'custom'; b.ref.press = (b.ref.press !== false);
        }
        var uid = add.getAttribute('data-pr-contact-add');
        if (b.ref.user_ids.indexOf(uid) < 0) b.ref.user_ids.push(uid);
        delete b.html_cache; marca(); pintaContactos(b); buscaPersonal(contactsModal.querySelector('[data-pr-contacts-search]').value);
        return;
      }
      var pressAdd = ev.target.closest('[data-pr-contact-press-add]');
      if (pressAdd) {
        b.ref = b.ref || {}; b.ref.press = true; if (!b.ref.preset) { b.ref.preset = 'custom'; b.ref.user_ids = b.ref.user_ids || []; }
        delete b.html_cache; marca(); pintaContactos(b);
        return;
      }
      var del = ev.target.closest('[data-pr-contact-del]');
      if (del) {
        var quitar = del.getAttribute('data-pr-contact-del');
        b.ref = b.ref || {};
        if (quitar === '__press__') {
          // Quitar el contacto de promoción: se apunta explícitamente (un módulo antiguo lo traía por defecto).
          b.ref.press = false;
          if (!b.ref.preset) { b.ref.preset = 'custom'; b.ref.user_ids = (b.ref.user_ids || []).map(String); }
        } else {
          // Un módulo ANTIGUO llevaba a quien creó la nota sin apuntarlo: al quitar a alguien se
          // pasa a la forma nueva con la lista tal como se ve, menos el que se quita.
          if (!b.ref.preset) {
            var ahora = Array.prototype.slice.call(contactsModal.querySelectorAll('[data-pr-contact-del]'))
              .map(function (x) { return x.getAttribute('data-pr-contact-del'); }).filter(function (x) { return x && x !== '__press__'; });
            b.ref.preset = 'custom'; b.ref.press = (b.ref.press !== false); b.ref.user_ids = ahora;
          }
          b.ref.user_ids = (b.ref.user_ids || []).map(String).filter(function (x) { return x !== quitar; });
        }
        delete b.html_cache; marca(); pintaContactos(b); buscaPersonal(contactsModal.querySelector('[data-pr-contacts-search]').value);
      }
    });
  }

  /* ---------- los ARCHIVOS ADJUNTOS: subirlos (también carpetas), su nombre y su color ---------- */
  var filesModal = document.getElementById('prFilesModal'), filesTarget = null;
  function abreArchivos(b) {
    if (!filesModal || !window.bootstrap || !b) return;
    filesTarget = b.id;
    filesModal.querySelector('[data-pr-files-title]').value = (b.opts || {}).title || '';
    filesModal.querySelector('[data-pr-files-colors]').innerHTML = coloresHtml((b.opts || {}).color, 'data-pr-files-color');
    cargaArchivos();
    bootstrap.Modal.getOrCreateInstance(filesModal).show();
  }
  function cargaArchivos() {
    var box = filesModal.querySelector('[data-pr-files-list]'); box.innerHTML = '<div class="text-muted small">Cargando…</div>';
    fetch(filesUrl + '?block_id=' + encodeURIComponent(filesTarget)).then(function (r) { return r.json(); })
      .then(function (js) { pintaArchivos((js && js.files) || [], false); })
      .catch(function () { box.innerHTML = '<div class="text-danger small">No se pudieron leer los archivos.</div>'; });
  }
  function pintaArchivos(lista, refresca) {
    var box = filesModal.querySelector('[data-pr-files-list]');
    box.innerHTML = lista.length ? lista.map(function (f) {
      return '<div class="pr-file">' +
        (f.thumb ? '<img class="pr-file__thumb" src="' + esc(f.thumb) + '" alt="">' : '<span class="pr-file__thumb"><i class="fa ' + esc(f.icon || 'fa-file') + '"></i></span>') +
        '<span class="pr-file__n" title="' + esc(f.name) + '">' + esc(f.name) + '<small>' + esc(f.size_label || '') + '</small></span>' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-pr-file-del="' + esc(f.id) + '" title="Quitar este archivo"><i class="fa fa-trash"></i></button></div>';
    }).join('') : '<div class="text-muted small">Todavía no hay archivos: arrastra aquí los que se van a poder descargar.</div>';
    if (refresca !== false) { var b = bloque(filesTarget); if (b) refrescaModulo(b); }
  }
  function subeArchivos(items) {
    var prog = filesModal.querySelector('[data-pr-files-progress]'); var i = 0, total = items.length;
    if (!total) return;
    prog.classList.remove('d-none');
    function siguiente() {
      if (i >= total) {
        prog.textContent = 'Subido' + (total === 1 ? '' : 's') + ' ' + total + ' archivo' + (total === 1 ? '' : 's') + '.';
        setTimeout(function () { prog.classList.add('d-none'); }, 2500); marca(); return;
      }
      var it = items[i]; i++;
      prog.textContent = 'Subiendo ' + i + ' de ' + total + ': ' + it.path + '…';
      var fd = new FormData(); fd.append('file', it.file, it.file.name); fd.append('path', it.path); fd.append('block_id', filesTarget);
      var xhr = new XMLHttpRequest(); xhr.open('POST', filesUrl);
      xhr.setRequestHeader('X-CSRFToken', csrf());           // csrf.js parchea fetch, no XMLHttpRequest
      xhr.upload.onprogress = function (e) { if (e.lengthComputable) prog.textContent = 'Subiendo ' + i + ' de ' + total + ': ' + it.path + ' · ' + Math.round(e.loaded * 100 / e.total) + '%'; };
      xhr.onload = function () {
        var js = null; try { js = JSON.parse(xhr.responseText); } catch (e) {}
        if (!js || !js.ok) alert('No se pudo subir ' + it.path + ((js && js.error) ? ': ' + js.error : ''));
        else pintaArchivos(js.files || [], i >= total);
        siguiente();
      };
      xhr.onerror = function () { alert('No se pudo subir ' + it.path); siguiente(); };
      xhr.send(fd);
    }
    siguiente();
  }
  // Lo arrastrado puede traer CARPETAS: se recorren enteras y cada archivo llega con su ruta.
  function recogeEntradas(dt, cb) {
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var salida = [], pendientes = 0, conEntries = false;
    function fin() { if (pendientes === 0) cb(salida); }
    function lee(entry, prefijo) {
      if (entry.isFile) {
        pendientes++;
        entry.file(function (f) { salida.push({ file: f, path: prefijo + f.name }); pendientes--; fin(); }, function () { pendientes--; fin(); });
      } else if (entry.isDirectory) {
        pendientes++;
        var reader = entry.createReader();
        (function leer() {
          reader.readEntries(function (ents) {
            if (!ents.length) { pendientes--; fin(); return; }
            ents.forEach(function (e) { lee(e, prefijo + entry.name + '/'); });
            leer();
          }, function () { pendientes--; fin(); });
        })();
      }
    }
    items.forEach(function (it) { var e = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (e) { conEntries = true; lee(e, ''); } });
    if (!conEntries) { Array.prototype.slice.call(dt.files || []).forEach(function (f) { salida.push({ file: f, path: f.name }); }); cb(salida); return; }
    fin();
  }
  if (filesModal) {
    filesModal.setAttribute('data-file-drop', 'off');
    var dropF = filesModal.querySelector('[data-pr-files-drop]');
    dropF.addEventListener('dragover', function (ev) { ev.preventDefault(); dropF.classList.add('is-over'); });
    dropF.addEventListener('dragleave', function () { dropF.classList.remove('is-over'); });
    dropF.addEventListener('drop', function (ev) { ev.preventDefault(); ev.stopPropagation(); dropF.classList.remove('is-over'); recogeEntradas(ev.dataTransfer, subeArchivos); });
    filesModal.querySelectorAll('[data-pr-files-input], [data-pr-files-dir]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var items = Array.prototype.slice.call(inp.files || []).map(function (f) { return { file: f, path: f.webkitRelativePath || f.name }; });
        inp.value = ''; subeArchivos(items);
      });
    });
    filesModal.addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-pr-file-del]');
      if (del) {
        if (!window.confirm('¿Quitar este archivo de la nota?')) return;
        fetch(filesUrl.replace(/\/adjuntos$/, '') + '/adjuntos/' + encodeURIComponent(del.getAttribute('data-pr-file-del')) + '/borrar', { method: 'POST' })
          .then(function (r) { return r.json(); }).then(function (js) { if (js && js.ok) { pintaArchivos(js.files || []); marca(); } else alert((js && js.error) || 'No se pudo quitar.'); });
        return;
      }
      var sw = ev.target.closest('[data-pr-files-color]');
      if (sw) { var b = bloque(filesTarget); if (b) { b.opts = b.opts || {}; b.opts.color = sw.getAttribute('data-pr-files-color'); filesModal.querySelector('[data-pr-files-colors]').innerHTML = coloresHtml(b.opts.color, 'data-pr-files-color'); marca(); refrescaModulo(b); if (sel === b.id) pintaProps(b); } }
    });
    filesModal.addEventListener('input', function (ev) {
      var b = bloque(filesTarget); if (!b) return;
      if (ev.target.matches('[data-pr-files-title]')) { b.opts = b.opts || {}; b.opts.title = ev.target.value; marca(); refrescaModuloLuego(b); if (sel === b.id) pintaProps(b); }
      if (ev.target.matches('[data-pr-files-color-custom]')) {
        b.opts = b.opts || {}; b.opts.color = ev.target.value; marca(); refrescaModuloLuego(b);
        if (window.app33PressAddColor) window.app33PressAddColor(ev.target.value);
      }
    });
  }
  /* «Guardar este diseño como plantilla»: guarda primero (para que la plantilla lleve lo que hay
     en pantalla) y crea la plantilla por el MISMO camino que la pantalla de Plantillas. */
  var btnTpl = document.querySelector('[data-pr-template-save]');
  if (btnTpl) btnTpl.addEventListener('click', function () {
    var campo = document.querySelector('[data-pr-template-name]');
    var nombre = ((campo && campo.value) || '').trim();
    if (!nombre) { alert('Ponle un nombre a la plantilla.'); return; }
    btnTpl.disabled = true;
    guarda().then(function (ok) {
      if (!ok) { btnTpl.disabled = false; return; }   // `guarda` ya ha avisado del motivo
      var f = document.createElement('form');
      f.method = 'post';
      f.action = root.getAttribute('data-tpl-new-url');
      f.innerHTML = '<input name="name"><input name="from_release_id">';
      f.querySelector('[name=name]').value = nombre;
      f.querySelector('[name=from_release_id]').value = root.getAttribute('data-pr-id') || '';
      document.body.appendChild(f);
      f.submit();
    });
  });

  /* ---------- guardar y previsualizar ---------- */
  function serializa() {
    return { width: W, bg: design.bg, swatches: misColores(), blocks: design.blocks.map(function (b) {
      var o = { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h };
      if (b.type === 'title' || b.type === 'text') { var el = elDe(b.id); o.html = el ? el.querySelector('.pr-blk__text').innerHTML : (b.html || ''); o.style = b.style || {}; }
      else { o.ref = b.ref || {}; o.opts = b.opts || {}; if (b.pick) o.pick = b.pick; }
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
  // «Siguiente: enviar»: se guarda y se pasa a la pantalla de envío (lo que se ha diseñado ES la nota).
  var btnNext = root.querySelector('[data-pr-next]');
  if (btnNext) btnNext.addEventListener('click', function () {
    var dest = root.getAttribute('data-next-url');
    guarda().then(function (ok) { if (ok && dest) window.location.href = dest; });
  });
  // La flecha de VOLVER guarda antes de salir: una nota a medias se queda en borrador, no se pierde.
  var btnBack = root.querySelector('[data-pr-back]');
  if (btnBack) btnBack.addEventListener('click', function (ev) {
    if (!dirty || !canEdit) return;
    ev.preventDefault();
    var dest = btnBack.getAttribute('href');
    guarda().then(function (ok) { if (ok && dest) window.location.href = dest; });
  });
  root.querySelector('[data-pr-preview]').addEventListener('click', function () {
    guarda().then(function (ok) {
      if (!ok) return;
      var m = document.getElementById('prPreviewModal'), f = m && m.querySelector('[data-pr-preview-frame]');
      if (f) f.src = root.getAttribute('data-preview-url') + '?t=' + Date.now();
      if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).show();
    });
  });
  window.addEventListener('beforeunload', function (ev) { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('resize', escala);
  stage.addEventListener('scroll', colocaToolbar);
  canvas.addEventListener('pointerdown', function (ev) { if (ev.target === canvas) deselecciona(); });

  pintaTodo();
  cargaModulos();
  cargaPlantillas();
  setTimeout(function () { design.blocks.forEach(function (b) { if (b.type === 'title' || b.type === 'text') crecerTexto(b); }); }, 300);
})();
