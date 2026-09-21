/* ══════════════════════════════════════════════════════════════════════════════════════════════
   EL EDITOR DEL ONE SHEET

   La página se ve tal como se publica (es el MISMO cuerpo, `_onesheet_body.html`) y encima van las
   asas: cada módulo se ARRASTRA por su asa a otra celda de la rejilla de 12 columnas, se ENSANCHA
   por los bordes (columnas) y se ALARGA por abajo (filas), y al pincharlo se abren sus opciones en
   el panel de la derecha. Los textos (biografía, texto libre) se escriben directamente encima, con
   la barra de negrita · cursiva · subrayado · enlace · alineación · color · tamaño.

   El TEMA (color de fondo, letras, iconos, tipografía) y la CABECERA se cambian en vivo desde el
   panel: los colores derivados los calcula `themeColors` — ESPEJO de `onesheet_render.theme_colors`
   (si se toca uno, se toca el otro)— y se aplican como variables CSS en `.os-page`, así que no hace
   falta pedir nada al servidor para verlos. Los MÓDULOS sí los pinta el servidor (`data-module-url`),
   con la misma plantilla que la página pública: lo que se ve es lo que se publica.

   La rejilla: cada bloque tiene x (0-11), w (1-12), y (fila) y h (filas). Al soltar, el que pisa a
   otro lo empuja hacia abajo y luego todo sube lo que puede (`resolver`, espejo de `resolve_layout`).
   Lo que se guarda es el DISEÑO (JSON): el servidor lo normaliza y lo devuelve.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('[data-ose]');
  if (!root) return;
  var canEdit = root.getAttribute('data-can-edit') === '1';
  var page = root.querySelector('[data-os-page]');
  var grid = root.querySelector('[data-os-grid]');
  var stage = root.querySelector('[data-ose-stage]');
  var toolbar = root.querySelector('[data-ose-toolbar]');
  var side = root.querySelector('[data-ose-side]');
  var COLS = 12;
  var design = { theme: {}, hero: {}, blocks: [] };
  try { design = JSON.parse((document.getElementById('oseDesign') || {}).textContent || '{}') || design; } catch (e) {}
  var CAT = { modules: [], metrics: [], award_icons: [], highlight_icons: [], corporate: [], services: [], fonts: [] };
  try { CAT = JSON.parse((document.getElementById('oseCatalog') || {}).textContent || '{}') || CAT; } catch (e) {}
  var MODS = {}; (CAT.modules || []).forEach(function (m) { MODS[m.key] = m; });
  var FONTS = {}; (CAT.fonts || []).forEach(function (f) { FONTS[f.key] = f; });
  var METRIC = {}; (CAT.metrics || []).forEach(function (m) { METRIC[m.key] = m; });
  var sel = null, dirty = false, assets = null, assetsPromise = null, refrescoPendiente = {};

  /* ---------- utilidades ---------- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }
  function postForm(url, fd) {
    fd.append('csrf_token', csrf());
    return fetch(url, { method: 'POST', headers: { 'X-CSRFToken': csrf() }, body: fd }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta no válida.' }; }); });
  }
  function marca(t) { dirty = true; var s = root.querySelector('[data-ose-saved]'); if (s) s.textContent = t || 'Sin guardar'; }
  function bloque(id) { return design.blocks.filter(function (b) { return b.id === id; })[0]; }
  function elDe(id) { return grid.querySelector('.os-mod[data-os-id="' + id + '"]'); }
  function maxRow() { var m = -1; design.blocks.forEach(function (b) { m = Math.max(m, b.y + b.h - 1); }); return m; }
  function esTexto(b) { return !!b && (b.type === 'bio' || b.type === 'text'); }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function toast(t, tipo) {
    var s = root.querySelector('[data-ose-saved]'); if (s) { s.textContent = t; s.classList.toggle('text-danger', tipo === 'error'); }
  }

  /* ---------- COLORES · espejo de onesheet_render.theme_colors ---------- */
  function hexNorm(v) {
    var m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(String(v || '').trim());
    if (!m) return '';
    var h = m[1]; if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    return '#' + h.toLowerCase();
  }
  function rgb(h) { h = hexNorm(h) || '#000000'; return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function lum(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function isDark(h) { return lum(h) < 0.42; }
  function contrast(h) { return isDark(h) ? '#ffffff' : '#111827'; }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (Math.round(a * 1000) / 1000) + ')'; }
  function themeColors(t) {
    t = t || {};
    var bg = hexNorm(t.bg) || '#0f2a24', text = hexNorm(t.text) || contrast(bg), icon = hexNorm(t.icon) || text, accent = hexNorm(t.accent) || icon;
    return { bg: bg, dark: isDark(bg), text: text, title: hexNorm(t.title) || text, icon: icon, accent: accent, on_accent: contrast(accent),
      muted: rgba(text, 0.68), faint: rgba(text, 0.45), line: rgba(text, 0.16), chip: rgba(text, 0.10), chip_strong: rgba(text, 0.18), card: rgba(text, 0.07), soldout: '#e33d48' };
  }
  function gradientCss(bg) {
    var partes = [];
    for (var i = 0; i <= 6; i++) { var f = i / 6; partes.push(rgba(bg, f * f) + ' ' + Math.round(f * 100) + '%'); }
    return 'linear-gradient(to bottom, ' + partes.join(', ') + ')';
  }
  function heroUrl() { return (design.hero && design.hero.image_url) || root.getAttribute('data-subject-photo') || ''; }
  function themeVars() {
    var th = design.theme || {}, c = themeColors(th), h = design.hero || {};
    var font = (FONTS[th.font] || FONTS.poppins || { css: 'Poppins, sans-serif' }).css;
    var v = ['--os-bg:' + c.bg, '--os-text:' + c.text, '--os-title:' + c.title, '--os-icon:' + c.icon, '--os-accent:' + c.accent, '--os-on-accent:' + c.on_accent,
      '--os-muted:' + c.muted, '--os-faint:' + c.faint, '--os-line:' + c.line, '--os-chip:' + c.chip, '--os-chip-strong:' + c.chip_strong, '--os-card:' + c.card, '--os-soldout:' + c.soldout,
      '--os-radius:' + num(th.radius, 16) + 'px', '--os-gap:' + num(th.gap, 28) + 'px', '--os-max:' + num(th.max_width, 1200) + 'px', '--os-font:' + font,
      '--os-hero-h:' + num(h.height, 68) + 'vh', '--os-hero-fade:' + num(h.fade, 55) + '%', '--os-hero-focus:' + (h.focus || '50% 30%'), '--os-name-size:' + num(h.name_size, 64) + 'px',
      '--os-name-color:' + (hexNorm(h.name_color) || c.title), '--os-hero-darken:' + rgba('#000000', num(h.darken, 0.15)), '--os-hero-grad:' + gradientCss(c.bg),
      '--os-bg-img-op:' + num(th.bg_image_opacity, 0.35), '--os-bg-blur:' + num(th.bg_image_blur, 0) + 'px'];
    var hu = heroUrl(); if (hu) v.push("--os-hero-img:url('" + hu.replace(/'/g, '%27') + "')");
    if (th.bg_image_url) v.push("--os-bg-img:url('" + th.bg_image_url.replace(/'/g, '%27') + "')");
    return v.join(';') + ';';
  }
  var fontLinkTimer = null;
  function aplicaTema() {
    var c = themeColors(design.theme);
    page.setAttribute('style', themeVars());
    page.classList.toggle('os-dark', c.dark); page.classList.toggle('os-light', !c.dark);
    // La imagen de fondo: se pinta si la hay.
    var bgimg = page.querySelector('[data-os-bgimg]');
    if (design.theme.bg_image_url && !bgimg) { bgimg = document.createElement('div'); bgimg.className = 'os-bgimg'; bgimg.setAttribute('data-os-bgimg', ''); page.insertBefore(bgimg, page.firstChild); }
    if (!design.theme.bg_image_url && bgimg) bgimg.remove();
    // La tipografía: se carga la elegida (solo esa) desde Google Fonts.
    var f = FONTS[design.theme.font];
    var link = document.querySelector('link[data-ose-font]');
    clearTimeout(fontLinkTimer);
    fontLinkTimer = setTimeout(function () {
      if (f && f.gf) {
        var href = 'https://fonts.googleapis.com/css2?family=' + f.gf + '&display=swap';
        if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.setAttribute('data-ose-font', ''); document.head.appendChild(link); }
        if (link.getAttribute('href') !== href) link.setAttribute('href', href);
      } else if (link) link.remove();
    }, 150);
    // Los colores propios de cada módulo dependen del tema para los que no los fijan: se repasan.
    design.blocks.forEach(aplicaEstilo);
    pintaHero();
    pintaSwatches();
  }
  function pintaHero() {
    var h = design.hero || {};
    var hero = page.querySelector('[data-os-hero]'); if (!hero) return;
    hero.classList.toggle('os-hero--center', h.align === 'center'); hero.classList.toggle('os-hero--left', h.align !== 'center');
    hero.classList.toggle('os-hero--noimg', !heroUrl());
    var inner = hero.querySelector('.os-hero__inner');
    var name = hero.querySelector('[data-os-hero-name]');
    if (h.show_name !== false) {
      if (!name) { name = document.createElement('h1'); name.className = 'os-hero__name'; name.setAttribute('data-os-hero-name', ''); inner.insertBefore(name, inner.firstChild); }
      name.textContent = (h.name || '').trim() || root.getAttribute('data-name') || '';
    } else if (name) name.remove();
    var svcs = hero.querySelector('[data-os-hero-services]');
    if (svcs) svcs.hidden = (h.show_services === false);
    // Las cifras de la cabecera (solo artistas): se repintan con lo que haya en `assets.metrics`.
    var kind = page.getAttribute('data-os-kind');
    var mets = hero.querySelector('[data-os-hero-metrics]');
    if (kind === 'ARTIST' && assets) {
      var keys = (h.metrics || []).filter(function (k) { return assets.metricsByKey[k]; });
      if (keys.length) {
        if (!mets) { mets = document.createElement('div'); mets.className = 'os-hero__metrics'; mets.setAttribute('data-os-hero-metrics', ''); inner.appendChild(mets); }
        mets.innerHTML = keys.map(function (k) { var m = assets.metricsByKey[k]; return '<div class="os-hm" title="' + esc(m.label) + '"><span class="os-hm__l"><i class="' + esc(m.icon) + '"></i>' + esc(m.short || m.label) + '</span><strong>' + esc(m.value_fmt) + '</strong></div>'; }).join('');
      } else if (mets) mets.remove();
    }
    var prev = root.querySelector('[data-ose-hero-prev]');
    if (prev) { prev.style.backgroundImage = heroUrl() ? 'url("' + heroUrl() + '")' : ''; prev.style.backgroundPosition = h.focus || '50% 30%'; }
  }

  /* ---------- LA REJILLA: posiciones, solapes, orden ---------- */
  function overlaps(a, b) { return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y); }
  function resolver(fijo) {
    var orden = design.blocks.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    if (fijo) orden = [fijo].concat(orden.filter(function (b) { return b !== fijo; }));
    var colocados = [];
    orden.forEach(function (b) {
      var n = 0;
      while (colocados.some(function (o) { return overlaps(b, o); }) && n++ < 400) b.y += 1;
      colocados.push(b);
    });
    colocados.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    colocados.forEach(function (b) {
      while (b.y > 0) {
        var prueba = { x: b.x, y: b.y - 1, w: b.w, h: b.h };
        if (colocados.some(function (o) { return o !== b && overlaps(prueba, o); })) break;
        b.y -= 1;
      }
    });
  }
  function aplicaPos(b) {
    var el = elDe(b.id); if (!el) return;
    el.style.setProperty('--gc', (b.x + 1) + ' / span ' + b.w);
    el.style.setProperty('--gr', (b.y + 1) + ' / span ' + b.h);
    el.style.setProperty('--gc-md', 'span ' + (b.w > 6 ? 12 : 6));
  }
  function aplicaPosTodo() { design.blocks.forEach(aplicaPos); ordenaDom(); }
  function ordenaDom() {
    // El orden del DOM es el de lectura: es el que manda en tableta y móvil (colocación automática).
    var orden = design.blocks.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    orden.forEach(function (b) { var el = elDe(b.id); if (el) grid.appendChild(el); });
  }
  /* Los colores PROPIOS de un módulo (espejo de `_onesheet_block_style`). */
  function aplicaEstilo(b) {
    var el = elDe(b.id); if (!el) return;
    var st = b.style || {};
    ['--os-text', '--os-muted', '--os-faint', '--os-line', '--os-chip', '--os-card', '--os-title', '--os-icon', '--os-accent', '--os-on-accent', '--os-scale'].forEach(function (k) { el.style.removeProperty(k); });
    if (st.text) { el.style.setProperty('--os-text', st.text); el.style.setProperty('--os-muted', rgba(st.text, 0.68)); el.style.setProperty('--os-faint', rgba(st.text, 0.45)); el.style.setProperty('--os-line', rgba(st.text, 0.16)); el.style.setProperty('--os-chip', rgba(st.text, 0.10)); el.style.setProperty('--os-card', rgba(st.text, 0.07)); }
    if (st.title) el.style.setProperty('--os-title', st.title); else if (st.text) el.style.setProperty('--os-title', st.text);
    if (st.icon) el.style.setProperty('--os-icon', st.icon);
    if (st.accent) { el.style.setProperty('--os-accent', st.accent); el.style.setProperty('--os-on-accent', contrast(st.accent)); }
    if (st.scale) el.style.setProperty('--os-scale', st.scale);
    el.classList.remove('os-mod--bg-soft', 'os-mod--bg-strong', 'os-mod--center', 'os-mod--right');
    var bg = st.bg && st.bg !== 'theme' ? st.bg : (design.theme.module_bg || 'none');
    if (bg === 'soft' || bg === 'strong') el.classList.add('os-mod--bg-' + bg);
    if (st.align === 'center' || st.align === 'right') el.classList.add('os-mod--' + st.align);
  }

  /* ---------- PINTAR un módulo (lo pinta el servidor) ---------- */
  function pintaModulo(b, cb) {
    return post(root.getAttribute('data-module-url'), { block: b, design: serializa() }).then(function (js) {
      if (!js || !js.ok) { toast((js && js.error) || 'No se pudo pintar el módulo.', 'error'); return; }
      var viejo = elDe(b.id);
      var tmp = document.createElement('div'); tmp.innerHTML = js.html;
      var nuevo = tmp.firstElementChild; if (!nuevo) return;
      nuevo.setAttribute('data-os-id', b.id);
      if (viejo) grid.replaceChild(nuevo, viejo); else grid.appendChild(nuevo);
      aplicaPos(b); aplicaEstilo(b);
      if (sel === b.id) nuevo.classList.add('is-sel');
      enganchaTexto(b);
      ordenaDom();
      if (cb) cb(nuevo);
    });
  }
  function pintaModuloLuego(b) { clearTimeout(refrescoPendiente[b.id]); refrescoPendiente[b.id] = setTimeout(function () { pintaModulo(b); }, 450); }
  function enganchaTexto(b) {
    if (!esTexto(b) || !canEdit) return;
    var el = elDe(b.id); if (!el) return;
    var rich = el.querySelector('[data-os-rich]');
    if (!rich) {
      // Un texto vacío se pinta como hueco: se le pone el editor igualmente.
      var body = el.querySelector('.os-mod__b'); if (!body) return;
      body.innerHTML = '<div class="os-rich" data-os-rich style="font-size:' + (b.opts.size || 15) + 'px;"></div>';
      rich = body.firstElementChild;
    }
    rich.contentEditable = 'true';
    rich.addEventListener('input', function () { b.opts.html = rich.innerHTML; marca(); });
    rich.addEventListener('focus', function () { if (sel !== b.id) selecciona(b.id); colocaToolbar(); });
    rich.addEventListener('paste', function (ev) {
      ev.preventDefault();
      var texto = (ev.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, texto);
    });
  }

  /* ---------- SELECCIÓN ---------- */
  function selecciona(id) {
    sel = id;
    grid.querySelectorAll('.os-mod').forEach(function (e) { e.classList.toggle('is-sel', e.getAttribute('data-os-id') === id); });
    var b = bloque(id);
    if (!b) { deselecciona(); return; }
    abrePanel('props');
    pintaProps(b);
    toolbar.classList.toggle('d-none', !esTexto(b));
    if (esTexto(b)) { var n = toolbar.querySelector('[data-ose-size-input]'); if (n) n.value = b.opts.size || 15; colocaToolbar(); }
  }
  function deselecciona() {
    sel = null;
    grid.querySelectorAll('.os-mod.is-sel').forEach(function (e) { e.classList.remove('is-sel'); });
    toolbar.classList.add('d-none');
    var props = root.querySelector('[data-ose-panel="props"]'); if (props) props.hidden = true;
    if (root.querySelector('.ose__tabs .is-on') == null) abrePanel('modules');
  }
  function colocaToolbar() {
    if (toolbar.classList.contains('d-none') || !sel) return;
    var el = elDe(sel); if (!el) return;
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    var top = r.top - s.top + stage.scrollTop - toolbar.offsetHeight - 30;
    if (top < 4) top = r.bottom - s.top + stage.scrollTop + 8;
    toolbar.style.top = Math.round(top) + 'px';
    toolbar.style.left = Math.round(Math.max(4, Math.min(r.left - s.left + stage.scrollLeft, stage.clientWidth - toolbar.offsetWidth - 4))) + 'px';
  }
  grid.addEventListener('pointerdown', function (ev) {
    var el = ev.target.closest('.os-mod'); if (!el) return;
    var id = el.getAttribute('data-os-id');
    if (sel !== id) selecciona(id);
  });
  page.addEventListener('pointerdown', function (ev) { if (!ev.target.closest('.os-mod') && !ev.target.closest('[data-ose-toolbar]')) deselecciona(); });

  /* ---------- EL PANEL DE LA DERECHA: pestañas ---------- */
  function abrePanel(nombre) {
    root.querySelectorAll('[data-ose-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-ose-panel') !== nombre; });
    root.querySelectorAll('[data-ose-tab]').forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-ose-tab') === nombre); });
    if (side) side.scrollTop = 0;
  }
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ose-tab]');
    if (t) { if (t.getAttribute('data-ose-tab') !== 'props') { sel = null; grid.querySelectorAll('.os-mod.is-sel').forEach(function (e) { e.classList.remove('is-sel'); }); toolbar.classList.add('d-none'); } abrePanel(t.getAttribute('data-ose-tab')); }
    if (ev.target.closest('[data-ose-unsel]')) { deselecciona(); abrePanel('modules'); }
  });

  /* ---------- LAS OPCIONES del módulo seleccionado ---------- */
  function colorRow(label, path, actual, auto) {
    return '<div class="ose__colorrow"><label class="ose__colorbtn"><input type="color" data-p="' + path + '" data-type="color" value="' + esc(hexNorm(actual) || '#888888') + '"><span style="' + (actual ? 'background:' + esc(actual) : '') + '" class="' + (actual ? '' : 'is-auto') + '"></span></label>' +
      '<span class="ose__colorlbl">' + esc(label) + '</span>' + (auto ? '<button type="button" class="btn btn-sm btn-link text-muted p-0" data-p-clear="' + path + '">auto</button>' : '') + '</div>';
  }
  function iconosHtml(lista, actual, attr) {
    return '<div class="ose__icons">' + lista.map(function (par) { return '<button type="button" class="' + (par[0] === actual ? 'is-on' : '') + '" ' + attr + '="' + esc(par[0]) + '" title="' + esc(par[1]) + '"><i class="fa-solid fa-' + esc(par[0]) + '"></i></button>'; }).join('') + '</div>';
  }
  function listaItems(b, campos) {
    // Una lista editable (premios, destacados, vídeos, contactos, enlaces extra): filas con sus campos.
    var items = b.opts.items || [];
    var html = '<div class="ose__list" data-li-list>';
    items.forEach(function (it, i) {
      html += '<div class="ose__item" data-li="' + i + '">';
      campos.forEach(function (c) {
        if (c.tipo === 'icon') html += '<div class="small text-muted">' + esc(c.label) + '</div>' + iconosHtml(c.lista, it[c.key] || c.def, 'data-li-icon="' + c.key + '"');
        else if (c.tipo === 'row') {
          html += '<div class="ose__item-row">' + c.campos.map(function (cc) { return '<input class="form-control form-control-sm" data-li-field="' + cc.key + '" placeholder="' + esc(cc.label) + '" value="' + esc(it[cc.key] || '') + '"' + (cc.style ? ' style="' + cc.style + '"' : '') + '>'; }).join('') + '</div>';
        } else html += '<input class="form-control form-control-sm" data-li-field="' + c.key + '" placeholder="' + esc(c.label) + '" value="' + esc(it[c.key] || '') + '">';
      });
      html += '<div class="ose__item-acts"><button type="button" data-li-up title="Subir"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-li-down title="Bajar"><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-li-del title="Quitar"><i class="fa-solid fa-trash"></i></button></div></div>';
    });
    html += '</div><button type="button" class="btn btn-sm btn-outline-primary mt-2" data-li-add><i class="fa-solid fa-plus me-1"></i>Añadir</button>';
    return html;
  }
  var CAMPOS = {
    highlights: [{ tipo: 'icon', key: 'icon', label: 'Icono', lista: CAT.highlight_icons, def: 'star' }, { key: 'text', label: 'El punto fuerte' }],
    awards: [{ tipo: 'icon', key: 'icon', label: 'La forma del premio', lista: CAT.award_icons, def: 'trophy' }, { key: 'name', label: 'Nombre del premio' }, { tipo: 'row', campos: [{ key: 'by', label: 'Quién lo da (opcional)' }, { key: 'year', label: 'Año', style: 'max-width:5.5rem' }] }],
    videos: [{ key: 'url', label: 'https://www.youtube.com/watch?v=…' }, { key: 'title', label: 'Título (opcional)' }],
    contact: [{ tipo: 'row', campos: [{ key: 'role', label: 'Qué lleva (Management, Contratación…)' }, { key: 'name', label: 'Nombre' }] }, { tipo: 'row', campos: [{ key: 'email', label: 'Correo' }, { key: 'phone', label: 'Teléfono' }] }],
  };
  function pintaProps(b) {
    var box = root.querySelector('[data-ose-panel="props"]'), body = root.querySelector('[data-ose-props-body]'), tit = root.querySelector('[data-ose-props-title]');
    if (!box || !body) return;
    box.hidden = false;
    var meta = MODS[b.type] || { label: b.type, icon: 'fa-cube' };
    if (tit) tit.innerHTML = '<i class="fa-solid ' + esc(meta.icon) + '"></i>' + esc(meta.label);
    var o = b.opts || {}, st = b.style || {};
    var html = '';
    html += '<div class="ose__group"><div class="ose__group-t"><i class="fa-solid fa-heading"></i>Título del módulo</div>' +
      '<div class="ose__item-row"><input class="form-control form-control-sm" data-p="opts.title" data-type="str" data-refresh="1" value="' + esc(o.title || '') + '" placeholder="' + esc(meta.label) + '">' +
      '<label class="form-check form-switch mb-0 ms-1" title="Se ve el título"><input class="form-check-input" type="checkbox" data-p="opts.show_title" data-type="bool" data-refresh="1"' + (o.show_title !== false ? ' checked' : '') + '></label></div></div>';
    html += '<div class="ose__group"><div class="ose__group-t"><i class="fa-solid fa-sliders"></i>' + esc(meta.label) + '</div>' + propsTipo(b) + '</div>';
    html += '<div class="ose__group"><div class="ose__group-t"><i class="fa-solid fa-palette"></i>Colores de este módulo <span class="fw-normal text-muted">(vacío = los del diseño)</span></div>' +
      colorRow('Texto', 'style.text', st.text, true) + colorRow('Título', 'style.title', st.title, true) + colorRow('Iconos', 'style.icon', st.icon, true) + colorRow('Botones y detalles', 'style.accent', st.accent, true) +
      '<div class="small fw-semibold mt-1">Fondo del módulo</div><div class="btn-group btn-group-sm" role="group">' +
      [['theme', 'Como el diseño'], ['none', 'Transparente'], ['soft', 'Suave'], ['strong', 'Marcado']].map(function (p) { return '<button type="button" class="btn ' + (((st.bg || 'theme') === p[0]) ? 'btn-dark' : 'btn-outline-secondary') + '" data-p-set="style.bg" data-value="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      '<label class="ose__range mt-2"><span>Tamaño del texto <b>' + Math.round((st.scale || 1) * 100) + ' %</b></span><input type="range" min="0.7" max="1.6" step="0.05" data-p="style.scale" data-type="num" value="' + (st.scale || 1) + '"></label>' +
      '<div class="small fw-semibold mt-1 mb-1">Alineación</div><div class="btn-group btn-group-sm" role="group">' +
      [['left', 'fa-align-left'], ['center', 'fa-align-center'], ['right', 'fa-align-right']].map(function (p) { return '<button type="button" class="btn ' + (((st.align || 'left') === p[0]) ? 'btn-dark' : 'btn-outline-secondary') + '" data-p-set="style.align" data-value="' + p[0] + '"><i class="fa ' + p[1] + '"></i></button>'; }).join('') + '</div></div>';
    html += '<div class="ose__group"><div class="ose__group-t"><i class="fa-solid fa-table-cells-large"></i>Sitio y tamaño</div>' +
      '<label class="ose__range"><span>Ancho <b>' + b.w + ' de 12 columnas</b></span><input type="range" min="1" max="12" step="1" data-p="w" data-type="int" data-layout="1" value="' + b.w + '"></label>' +
      '<label class="ose__range"><span>Filas que ocupa <b>' + b.h + '</b></span><input type="range" min="1" max="6" step="1" data-p="h" data-type="int" data-layout="1" value="' + b.h + '"></label>' +
      '<div class="ose__hint">También se mueve arrastrándolo por su asa y se ensancha tirando de sus bordes.</div>' +
      '<div class="d-flex gap-2 flex-wrap mt-1"><button type="button" class="btn btn-sm btn-outline-secondary" data-p-dup><i class="fa fa-clone me-1"></i>Duplicar</button><button type="button" class="btn btn-sm btn-outline-danger" data-p-del><i class="fa fa-trash me-1"></i>Quitar</button></div></div>';
    body.innerHTML = html;
    if (!canEdit) body.querySelectorAll('input,select,button').forEach(function (x) { x.disabled = true; });
    cargaAssets().then(function () { rellenaAssets(b); });
  }
  function check(path, label, on, extra) { return '<label class="form-check"><input class="form-check-input" type="checkbox" data-p="' + path + '" data-type="bool" data-refresh="1"' + (on ? ' checked' : '') + '> ' + label + (extra || '') + '</label>'; }
  function botones(path, actual, opciones) {
    return '<div class="btn-group btn-group-sm" role="group">' + opciones.map(function (p) { return '<button type="button" class="btn ' + (actual === p[0] ? 'btn-dark' : 'btn-outline-secondary') + '" data-p-set="' + path + '" data-value="' + p[0] + '" data-refresh="1">' + p[1] + '</button>'; }).join('') + '</div>';
  }
  function rango(path, label, val, min, max, step, unidad) {
    return '<label class="ose__range"><span>' + label + ' <b>' + val + (unidad || '') + '</b></span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" data-p="' + path + '" data-type="int" data-refresh="1" value="' + val + '"></label>';
  }
  function propsTipo(b) {
    var o = b.opts || {}, t = b.type, h = '';
    if (t === 'bio' || t === 'text') {
      h += '<div class="ose__hint">El texto se escribe directamente en la página. Selecciona una palabra para ponerla en negrita, subrayarla o enlazarla; el tamaño es de todo el bloque.</div>' +
        rango('opts.size', 'Tamaño de la letra', o.size || 15, 10, 40, 1, ' px') + rango('opts.columns', 'Columnas de texto', o.columns || 1, 1, 3, 1, '') +
        check('opts.more', 'Recortar con «Leer más» si es largo', o.more);
    } else if (t === 'highlights') {
      h += listaItems(b, CAMPOS.highlights) + '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'list', [['list', 'Lista'], ['chips', 'Etiquetas'], ['grid', 'Tarjetas']]);
    } else if (t === 'stats') {
      h += '<div class="small fw-semibold mb-1">Qué cifras se enseñan</div><div class="ose__check-list" data-a-metrics data-path="opts.metrics"><div class="small text-muted">Cargando…</div></div>' +
        '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'tiles', [['tiles', 'Tarjetas'], ['row', 'En fila']]) +
        check('opts.trend', 'Con la variación a 30 días', o.trend !== false) + check('opts.sparkline', 'Con la línea de tendencia', o.sparkline !== false);
    } else if (t === 'followers') {
      h += '<div class="small fw-semibold mb-1">Qué redes se enseñan <span class="fw-normal text-muted">(sin marcar ninguna salen todas las que tengan dato)</span></div><div class="ose__check-list" data-a-metrics data-path="opts.metrics" data-null-all="1"><div class="small text-muted">Cargando…</div></div>' +
        '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'list', [['list', 'Lista'], ['tiles', 'Tarjetas']]) + check('opts.trend', 'Con la flecha de tendencia', o.trend);
    } else if (t === 'socials') {
      h += '<div class="small fw-semibold mb-1">Qué redes y plataformas <span class="fw-normal text-muted">(las que tienen enlace)</span></div><div class="ose__check-list" data-a-socials><div class="small text-muted">Cargando…</div></div>' +
        '<div class="small fw-semibold mt-2 mb-1">Otros enlaces</div>' + listaItemsExtra(b) +
        '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.style_kind', o.style_kind || 'pills', [['pills', 'Botones'], ['icons', 'Iconos'], ['list', 'Lista']]) + check('opts.labels', 'Con el nombre de la red', o.labels !== false);
    } else if (t === 'concerts') {
      h += '<div class="ose__hint">Salen solas las fechas <b>confirmadas y ya anunciadas</b> de conciertos, festivales, ciclos y eventos promocionales, de hoy en adelante. Un Sold Out sale marcado en rojo.</div>' +
        rango('opts.limit', 'Cuántas como máximo', o.limit || 8, 1, 40, 1, '') + check('opts.show_venue', 'Con el recinto', o.show_venue !== false) + check('opts.compact', 'Filas compactas', o.compact) +
        '<div class="small fw-semibold mt-2 mb-1">Botón al final <span class="fw-normal text-muted">(opcional)</span></div><div class="ose__item-row"><input class="form-control form-control-sm" data-p="opts.cta" data-type="str" data-refresh="1" placeholder="Texto («Entradas»)" value="' + esc(o.cta || '') + '"><input class="form-control form-control-sm" data-p="opts.cta_url" data-type="str" data-refresh="1" placeholder="https://…" value="' + esc(o.cta_url || '') + '"></div>';
    } else if (t === 'photos') {
      var n = (o.album_ids || []).length, m = (o.photo_ids || []).length;
      h += '<div class="d-flex align-items-center gap-2 flex-wrap mb-2"><button type="button" class="btn btn-sm btn-primary" data-a-photos><i class="fa-solid fa-images me-1"></i>Elegir fotos</button><span class="small text-muted">' + (n ? n + ' álbum' + (n > 1 ? 'es' : '') : '') + (n && m ? ' · ' : '') + (m ? m + ' suelta' + (m > 1 ? 's' : '') : '') + (!n && !m ? 'Nada elegido todavía' : '') + '</span></div>' +
        '<div class="small fw-semibold mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'grid', [['grid', 'Rejilla'], ['masonry', 'Mosaico'], ['strip', 'Tira']]) +
        rango('opts.cols', 'Columnas', o.cols || 4, 2, 6, 1, '') + rango('opts.limit', 'Cuántas como máximo', o.limit || 12, 1, 60, 1, '') +
        '<div class="small fw-semibold mt-2 mb-1">Proporción</div>' + botones('opts.ratio', o.ratio || 'square', [['square', '1:1'], ['landscape', '4:3'], ['portrait', '3:4'], ['free', 'Libre']]);
    } else if (t === 'certifications') {
      h += '<div class="ose__hint">Salen solas de las canciones y discos del artista. Desmarca la que no quieras enseñar.</div><div class="ose__check-list" data-a-certs><div class="small text-muted">Cargando…</div></div>' +
        rango('opts.limit', 'Cuántas como máximo', o.limit || 12, 1, 60, 1, '') + check('opts.show_country', 'Con el país', o.show_country);
    } else if (t === 'release') {
      h += '<div class="small fw-semibold mb-1">Qué lanzamiento</div><select class="form-select form-select-sm" data-a-release><option value="">El último publicado (automático)</option></select>' +
        check('opts.embed', 'Con el reproductor de Spotify', o.embed) + check('opts.show_date', 'Con la fecha', o.show_date !== false) + check('opts.show_platforms', 'Con los iconos de las plataformas', o.show_platforms !== false);
    } else if (t === 'videos') {
      h += listaItems(b, CAMPOS.videos) + '<div class="small fw-semibold mt-2 mb-1">Los vídeos que ya conocemos</div><div class="ose__sugg" data-a-videos><span class="small text-muted">Cargando…</span></div>' +
        '<div class="mt-2">' + rango('opts.cols', 'Columnas', o.cols || 2, 1, 3, 1, '') + '</div>';
    } else if (t === 'countries') {
      h += '<div class="ose__hint">El ranking de países por oyentes mensuales en Spotify (Chartmetric). Se actualiza solo.</div>' + rango('opts.limit', 'Cuántos países', o.limit || 6, 3, 15, 1, '') + check('opts.show_values', 'Con el número de oyentes', o.show_values !== false);
    } else if (t === 'awards') {
      h += listaItems(b, CAMPOS.awards) + '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'list', [['list', 'Lista'], ['grid', 'Tarjetas']]);
    } else if (t === 'press') {
      h += '<div class="ose__hint">Las últimas notas de prensa enviadas. Desmarca la que no quieras enseñar.</div><div class="ose__check-list" data-a-press><div class="small text-muted">Cargando…</div></div>' +
        rango('opts.limit', 'Cuántas como máximo', o.limit || 4, 1, 12, 1, '') + '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'cards', [['cards', 'Tarjetas'], ['list', 'Lista']]);
    } else if (t === 'documents') {
      h += listaDocs(b) + '<div class="small fw-semibold mt-2 mb-1">Cómo se ven</div>' + botones('opts.layout', o.layout || 'list', [['list', 'Lista'], ['grid', 'Tarjetas']]) +
        check('opts.show_size', 'Con el tamaño del archivo', o.show_size !== false);
    } else if (t === 'contact') {
      h += listaItems(b, CAMPOS.contact) + '<div class="small fw-semibold mt-2 mb-1">Gente de la casa</div><div class="ose__sugg" data-a-contacts><span class="small text-muted">Cargando…</span></div>' +
        '<div class="mt-2">' + botones('opts.layout', o.layout || 'cards', [['cards', 'Tarjetas'], ['list', 'Lista']]) + '</div>';
    }
    return h;
  }
  function listaItemsExtra(b) {
    var items = b.opts.extra || [];
    var html = '<div class="ose__list" data-lx-list>';
    items.forEach(function (it, i) {
      html += '<div class="ose__item" data-lx="' + i + '"><div class="ose__item-row"><input class="form-control form-control-sm" data-lx-field="label" placeholder="Nombre" value="' + esc(it.label || '') + '" style="max-width:9rem"><input class="form-control form-control-sm" data-lx-field="url" placeholder="https://…" value="' + esc(it.url || '') + '"><div class="ose__item-acts"><button type="button" data-lx-del title="Quitar"><i class="fa-solid fa-trash"></i></button></div></div></div>';
    });
    return html + '</div><button type="button" class="btn btn-sm btn-outline-secondary mt-1" data-lx-add><i class="fa-solid fa-plus me-1"></i>Añadir un enlace</button>';
  }

  /* ---------- EL MÓDULO «DOCUMENTOS»: archivos que se SUBEN y se descargan ----------
     Cada fila enseña el archivo tal cual (el icono de su tipo, su nombre y su tamaño) y deja poner
     cómo se llama en la página. El icono sale del MISMO catálogo que pinta el servidor
     (`CAT.doc_icons`, de `onesheet_render.DOC_ICONS`): una lista, no dos. Subir, quitar y ordenar; el
     nombre se edita con el campo genérico `data-li-field`. */
  function docExt(nombre) { var t = String(nombre || '').toLowerCase().split('?')[0]; return (t.indexOf('.') >= 0 ? t.split('.').pop() : t).replace(/[^a-z0-9]/g, '').slice(0, 12); }
  function docIcon(ext) { return (CAT.doc_icons || {})[docExt(ext)] || 'fa-file'; }
  function fmtSize(n) {
    n = parseFloat(n); if (!n || n <= 0) return '';
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    var v = n < 1073741824 ? [n / 1048576, 'MB'] : [n / 1073741824, 'GB'];
    return (v[0].toFixed(1).replace('.', ',').replace(/,0$/, '')) + ' ' + v[1];
  }
  function listaDocs(b) {
    var items = b.opts.items || [];
    var html = '<div class="ose__list" data-li-list>';
    items.forEach(function (it, i) {
      var ext = it.ext || docExt(it.file_name || it.url), tam = fmtSize(it.size);
      html += '<div class="ose__item" data-li="' + i + '">' +
        '<div class="ose__item-row"><span class="ose__doc-i"><i class="fa-solid ' + esc(docIcon(ext)) + '"></i></span>' +
        '<span class="ose__doc-f" title="' + esc(it.file_name || '') + '">' + esc(it.file_name || 'archivo') + (tam ? ' <small class="text-muted">· ' + esc(tam) + '</small>' : '') + '</span>' +
        '<div class="ose__item-acts"><button type="button" data-li-up title="Subir"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-li-down title="Bajar"><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-li-del title="Quitar"><i class="fa-solid fa-trash"></i></button></div></div>' +
        '<input class="form-control form-control-sm" data-li-field="name" placeholder="Cómo se llama en la página (si no, el nombre del archivo)" value="' + esc(it.name || '') + '"></div>';
    });
    var acepta = (CAT.doc_exts || []).map(function (e) { return '.' + e; }).join(',');
    html += '</div><label class="btn btn-sm btn-outline-primary mt-2 mb-0"><i class="fa-solid fa-upload me-1"></i>Añadir documento<input type="file" hidden data-li-file multiple accept="' + esc(acepta) + '"></label>' +
      '<div class="ose__hint">PDF, Word, Excel, PowerPoint, ZIP, imágenes, audio o vídeo. En la página se descargan al pincharlos.</div>';
    return html;
  }
  function subeDocumentos(b, files) {
    var url = root.getAttribute('data-upload-file-url'); if (!url || !files.length) return;
    var i = 0, subidos = 0;
    function siguiente() {
      if (i >= files.length) {
        if (subidos) { marca(subidos > 1 ? 'Documentos subidos · sin guardar' : 'Documento subido · sin guardar'); pintaModulo(b); pintaProps(b); }
        return;
      }
      var f = files[i++]; var fd = new FormData(); fd.append('file', f);
      toast('Subiendo ' + f.name + (files.length > 1 ? ' (' + i + ' de ' + files.length + ')' : '') + '…');
      postForm(url, fd).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || ('No se pudo subir ' + f.name + '.')); toast('No se pudo subir', 'error'); }
        else { b.opts.items = b.opts.items || []; b.opts.items.push({ id: uid(), url: js.url, file_name: js.file_name || f.name, name: '', size: js.size || f.size || 0, ext: js.ext || docExt(f.name) }); subidos++; }
        siguiente();
      });
    }
    siguiente();
  }
  root.addEventListener('change', function (ev) {
    var inp = ev.target.closest('[data-li-file]'); if (!inp || !inp.files || !inp.files.length || !sel || !canEdit) return;
    var b = bloque(sel); if (!b) return;
    var files = Array.prototype.slice.call(inp.files); inp.value = '';
    subeDocumentos(b, files);
  });

  /* Lo que viene del servidor para elegir (fotos, métricas, redes, lanzamientos…). */
  function cargaAssets() {
    if (assets) return Promise.resolve(assets);
    if (!assetsPromise) {
      assetsPromise = fetch(root.getAttribute('data-assets-url'), { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (js) {
        assets = js || {}; assets.metricsByKey = {}; (assets.metrics || []).forEach(function (m) { assets.metricsByKey[m.key] = m; });
        pintaPaleta(); pintaHero(); pintaMetricasHero();
        return assets;
      }).catch(function () { assets = { metricsByKey: {} }; return assets; });
    }
    return assetsPromise;
  }
  function rellenaAssets(b) {
    var body = root.querySelector('[data-ose-props-body]'); if (!body || sel !== b.id) return;
    var o = b.opts || {};
    var mets = body.querySelector('[data-a-metrics]');
    if (mets) {
      var elegidas = o.metrics, nullAll = mets.hasAttribute('data-null-all');
      var lista = (assets.metrics || []);
      mets.innerHTML = lista.length ? lista.map(function (m) {
        var on = elegidas == null ? (nullAll ? true : false) : elegidas.indexOf(m.key) >= 0;
        return '<label><input class="form-check-input" type="checkbox" data-a-metric="' + esc(m.key) + '"' + (on ? ' checked' : '') + '><i class="' + esc(m.icon) + ' fa-fw"></i><span>' + esc(m.label) + '</span><small class="ms-auto text-muted">' + esc(m.value_fmt) + '</small></label>';
      }).join('') : '<div class="small text-muted">Todavía no hay cifras de Chartmetric para este artista.</div>';
    }
    var soc = body.querySelector('[data-a-socials]');
    if (soc) {
      var keys = o.keys, lista2 = assets.socials || [];
      soc.innerHTML = lista2.length ? lista2.map(function (s) {
        var on = keys == null ? true : keys.indexOf(s.key) >= 0;
        return '<label><input class="form-check-input" type="checkbox" data-a-social="' + esc(s.key) + '"' + (on ? ' checked' : '') + '><i class="' + esc(s.icon) + ' fa-fw"></i><span>' + esc(s.label) + '</span></label>';
      }).join('') : '<div class="small text-muted">No hay redes con enlace (se cogen de Chartmetric y de la ficha del artista).</div>';
    }
    var certs = body.querySelector('[data-a-certs]');
    if (certs) {
      var ocultas = o.hidden || [], lista3 = assets.certifications || [];
      certs.innerHTML = lista3.length ? lista3.map(function (c) {
        return '<label><input class="form-check-input" type="checkbox" data-a-cert="' + esc(c.id) + '"' + (ocultas.indexOf(c.id) < 0 ? ' checked' : '') + '><img src="' + esc(c.icon_url) + '" alt=""><span>' + esc(c.title) + '</span><small class="ms-auto text-muted">' + esc(c.label) + '</small></label>';
      }).join('') : '<div class="small text-muted">Sin certificaciones registradas.</div>';
    }
    var press = body.querySelector('[data-a-press]');
    if (press) {
      var ocultasP = o.hidden || [], lista4 = assets.press || [];
      press.innerHTML = lista4.length ? lista4.map(function (p) {
        return '<label><input class="form-check-input" type="checkbox" data-a-pr="' + esc(p.id) + '"' + (ocultasP.indexOf(p.id) < 0 ? ' checked' : '') + '>' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="">' : '<i class="fa-solid fa-newspaper fa-fw"></i>') + '<span>' + esc(p.title) + '</span><small class="ms-auto text-muted">' + esc(p.date_label) + '</small></label>';
      }).join('') : '<div class="small text-muted">No hay notas de prensa enviadas.</div>';
    }
    var rel = body.querySelector('[data-a-release]');
    if (rel) {
      (assets.releases || []).forEach(function (r) {
        var opt = document.createElement('option'); opt.value = r.kind + ':' + r.id; opt.textContent = r.title + ' · ' + r.kind_label + (r.date ? ' · ' + r.date : '');
        if (o.pick_id === r.id && (!o.pick_kind || o.pick_kind === r.kind)) opt.selected = true;
        rel.appendChild(opt);
      });
    }
    var vids = body.querySelector('[data-a-videos]');
    if (vids) {
      var ya = (o.items || []).map(function (it) { return it.url; });
      var lista5 = (assets.videos || []).filter(function (v) { return ya.indexOf(v.url) < 0; });
      vids.innerHTML = lista5.length ? lista5.map(function (v) { return '<button type="button" data-a-video-add="' + esc(v.url) + '" data-title="' + esc(v.title) + '">' + (v.cover ? '<img src="' + esc(v.cover) + '" alt="">' : '<i class="fa-brands fa-youtube"></i>') + esc(v.title) + '</button>'; }).join('') : '<span class="small text-muted">Ninguno más (los de las canciones ya están o no tienen vídeo).</span>';
    }
    var cts = body.querySelector('[data-a-contacts]');
    if (cts) {
      cts.innerHTML = (assets.contacts || []).map(function (c, i) { return '<button type="button" data-a-contact-add="' + i + '">' + (c.photo_url ? '<img src="' + esc(c.photo_url) + '" alt="">' : '<i class="fa-solid fa-user"></i>') + esc(c.name) + '</button>'; }).join('') || '<span class="small text-muted">—</span>';
    }
  }

  /* Un valor del panel → el bloque. `path` es «opts.x», «style.x», «w» o «h». */
  function setPath(b, path, valor) {
    var partes = path.split('.');
    if (partes.length === 1) { b[partes[0]] = valor; return; }
    b[partes[0]] = b[partes[0]] || {};
    if (valor === '' || valor == null) delete b[partes[0]][partes[1]]; else b[partes[0]][partes[1]] = valor;
  }
  function trasCambio(b, inp) {
    var path = inp.getAttribute('data-p') || inp.getAttribute('data-p-set') || '';
    if (path.indexOf('style.') === 0) { aplicaEstilo(b); marca(); if (path === 'style.bg') pintaProps(b); return; }
    if (inp.hasAttribute('data-layout')) { if (b.x + b.w > COLS) b.x = COLS - b.w; resolver(b); aplicaPosTodo(); marca(); return; }
    if (esTexto(b) && path === 'opts.size') { var el = elDe(b.id), rich = el && el.querySelector('[data-os-rich]'); if (rich) rich.style.fontSize = b.opts.size + 'px'; var n = toolbar.querySelector('[data-ose-size-input]'); if (n) n.value = b.opts.size; marca(); return; }
    marca();
    if (inp.hasAttribute('data-refresh')) { if (inp.type === 'text' || inp.type === 'range') pintaModuloLuego(b); else pintaModulo(b); }
  }
  root.addEventListener('input', function (ev) {
    var panel = ev.target.closest('[data-ose-panel="props"]'); if (!panel || !sel) return;
    var b = bloque(sel); if (!b) return;
    var inp = ev.target;
    if (inp.hasAttribute('data-p')) {
      var tipo = inp.getAttribute('data-type'), v;
      if (tipo === 'bool') v = !!inp.checked;
      else if (tipo === 'int') v = parseInt(inp.value, 10) || 0;
      else if (tipo === 'num') v = parseFloat(inp.value) || 0;
      else if (tipo === 'color') { v = hexNorm(inp.value); var sw = inp.parentNode.querySelector('span'); if (sw) { sw.style.background = v; sw.classList.remove('is-auto'); } }
      else v = inp.value;
      setPath(b, inp.getAttribute('data-p'), v);
      var lbl = inp.closest('.ose__range'); if (lbl) { var bb = lbl.querySelector('b'); if (bb) bb.textContent = (tipo === 'num' && inp.getAttribute('data-p') === 'style.scale') ? Math.round(v * 100) + ' %' : String(v) + (lbl.textContent.indexOf('px') >= 0 ? ' px' : ''); }
      trasCambio(b, inp); return;
    }
    var f = inp.closest('[data-li-field]') ? inp : null;
    if (f) { var row = f.closest('[data-li]'); var i = parseInt(row.getAttribute('data-li'), 10); b.opts.items = b.opts.items || []; if (b.opts.items[i]) { b.opts.items[i][f.getAttribute('data-li-field')] = f.value; marca(); pintaModuloLuego(b); } return; }
    var fx = inp.closest('[data-lx-field]') ? inp : null;
    if (fx) { var rowx = fx.closest('[data-lx]'); var ix = parseInt(rowx.getAttribute('data-lx'), 10); b.opts.extra = b.opts.extra || []; if (b.opts.extra[ix]) { b.opts.extra[ix][fx.getAttribute('data-lx-field')] = fx.value; marca(); pintaModuloLuego(b); } return; }
  });
  root.addEventListener('change', function (ev) {
    var panel = ev.target.closest('[data-ose-panel="props"]'); if (!panel || !sel) return;
    var b = bloque(sel); if (!b) return;
    var inp = ev.target;
    if (inp.matches('[data-a-metric]')) {
      var todas = Array.prototype.map.call(panel.querySelectorAll('[data-a-metric]'), function (x) { return x.getAttribute('data-a-metric'); });
      var marcadas = Array.prototype.filter.call(panel.querySelectorAll('[data-a-metric]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-a-metric'); });
      b.opts.metrics = (b.type === 'followers' && marcadas.length === todas.length) ? null : marcadas;
      marca(); pintaModulo(b); return;
    }
    if (inp.matches('[data-a-social]')) {
      var marcS = Array.prototype.filter.call(panel.querySelectorAll('[data-a-social]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-a-social'); });
      var todasS = panel.querySelectorAll('[data-a-social]').length;
      b.opts.keys = (marcS.length === todasS) ? null : marcS; marca(); pintaModulo(b); return;
    }
    if (inp.matches('[data-a-cert]') || inp.matches('[data-a-pr]')) {
      var attr = inp.matches('[data-a-cert]') ? 'data-a-cert' : 'data-a-pr';
      b.opts.hidden = Array.prototype.filter.call(panel.querySelectorAll('[' + attr + ']'), function (x) { return !x.checked; }).map(function (x) { return x.getAttribute(attr); });
      marca(); pintaModulo(b); return;
    }
    if (inp.matches('[data-a-release]')) {
      var v = inp.value.split(':'); b.opts.pick_kind = v.length === 2 ? v[0] : ''; b.opts.pick_id = v.length === 2 ? v[1] : ''; marca(); pintaModulo(b); return;
    }
  });
  root.addEventListener('click', function (ev) {
    var panel = ev.target.closest('[data-ose-panel="props"]'); if (!panel || !sel) return;
    var b = bloque(sel); if (!b) return;
    var set = ev.target.closest('[data-p-set]');
    if (set) { setPath(b, set.getAttribute('data-p-set'), set.getAttribute('data-value')); set.parentNode.querySelectorAll('.btn').forEach(function (x) { x.classList.toggle('btn-dark', x === set); x.classList.toggle('btn-outline-secondary', x !== set); }); trasCambio(b, set); return; }
    var clr = ev.target.closest('[data-p-clear]');
    if (clr) { setPath(b, clr.getAttribute('data-p-clear'), ''); aplicaEstilo(b); marca(); pintaProps(b); return; }
    if (ev.target.closest('[data-p-dup]')) { duplica(b); return; }
    if (ev.target.closest('[data-p-del]')) { borra(b.id); return; }
    if (ev.target.closest('[data-a-photos]')) { abreFotos(b); return; }
    var va = ev.target.closest('[data-a-video-add]');
    if (va) { b.opts.items = b.opts.items || []; b.opts.items.push({ id: uid(), url: va.getAttribute('data-a-video-add'), title: va.getAttribute('data-title') || '' }); marca(); pintaModulo(b); pintaProps(b); return; }
    var ca = ev.target.closest('[data-a-contact-add]');
    if (ca) { var c = (assets.contacts || [])[parseInt(ca.getAttribute('data-a-contact-add'), 10)]; if (c) { b.opts.items = b.opts.items || []; b.opts.items.push({ id: uid(), role: c.role || '', name: c.name || '', email: c.email || '', phone: c.phone || '', photo_url: c.photo_url || '' }); marca(); pintaModulo(b); pintaProps(b); } return; }
    var icon = ev.target.closest('[data-li-icon]');
    // El icono elegido (la forma del premio, el del destacado): el botón lleva el CAMPO en
    // `data-li-icon` y el nombre del icono en su <i class="fa-solid fa-…">.
    if (icon) { var row1 = icon.closest('[data-li]'); var i1 = parseInt(row1.getAttribute('data-li'), 10); var ic = icon.querySelector('i'); var nombre = ic ? (ic.className.match(/fa-([a-z0-9-]+)$/) || [])[1] : ''; if (b.opts.items && b.opts.items[i1] && nombre) { b.opts.items[i1][icon.getAttribute('data-li-icon')] = nombre; icon.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === icon); }); marca(); pintaModuloLuego(b); } return; }
    if (ev.target.closest('[data-li-add]')) { b.opts.items = b.opts.items || []; var nuevo = { id: uid() }; if (b.type === 'awards') nuevo.icon = 'trophy'; if (b.type === 'highlights') nuevo.icon = 'star'; b.opts.items.push(nuevo); pintaProps(b); marca(); var inputs = panel.querySelectorAll('[data-li-list] .ose__item:last-child input'); if (inputs.length) inputs[0].focus(); return; }
    var del = ev.target.closest('[data-li-del]');
    if (del) { var r2 = del.closest('[data-li]'); b.opts.items.splice(parseInt(r2.getAttribute('data-li'), 10), 1); marca(); pintaModulo(b); pintaProps(b); return; }
    var up = ev.target.closest('[data-li-up]'), down = ev.target.closest('[data-li-down]');
    if (up || down) { var r3 = (up || down).closest('[data-li]'); var i3 = parseInt(r3.getAttribute('data-li'), 10), j = up ? i3 - 1 : i3 + 1; if (j >= 0 && j < b.opts.items.length) { var tmp = b.opts.items[i3]; b.opts.items[i3] = b.opts.items[j]; b.opts.items[j] = tmp; marca(); pintaModulo(b); pintaProps(b); } return; }
    if (ev.target.closest('[data-lx-add]')) { b.opts.extra = b.opts.extra || []; b.opts.extra.push({ id: uid(), label: '', url: '' }); pintaProps(b); marca(); return; }
    var delx = ev.target.closest('[data-lx-del]');
    if (delx) { var rx = delx.closest('[data-lx]'); b.opts.extra.splice(parseInt(rx.getAttribute('data-lx'), 10), 1); marca(); pintaModulo(b); pintaProps(b); return; }
  });

  /* ---------- AÑADIR, DUPLICAR, QUITAR ---------- */
  function nuevoBloque(tipo, x, y) {
    var meta = MODS[tipo]; if (!meta) return null;
    var w = meta.w || 6;
    var b = { id: uid(), type: tipo, x: clamp(x == null ? 0 : x, 0, COLS - w), y: (y == null ? maxRow() + 1 : y), w: w, h: 1, opts: { title: meta.label, show_title: true }, style: {} };
    if (tipo === 'photos') { b.opts.layout = 'grid'; b.opts.cols = 4; }
    if (tipo === 'socials') b.opts.style_kind = 'pills';
    design.blocks.push(b);
    resolver(b);
    aplicaPosTodo();
    marca();
    pintaModulo(b, function (el) { selecciona(b.id); try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} });
    return b;
  }
  function duplica(o) {
    var c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.y = o.y + o.h;
    if (esTexto(o)) { var el = elDe(o.id), rich = el && el.querySelector('[data-os-rich]'); if (rich) c.opts.html = rich.innerHTML; }
    design.blocks.push(c); resolver(c); aplicaPosTodo(); marca();
    pintaModulo(c, function () { selecciona(c.id); });
  }
  function borra(id) {
    var el = elDe(id); if (el) el.remove();
    design.blocks = design.blocks.filter(function (b) { return b.id !== id; });
    resolver(null); aplicaPosTodo(); deselecciona(); abrePanel('modules'); marca();
  }
  root.addEventListener('click', function (ev) {
    var p = ev.target.closest('[data-ose-add]'); if (!p || !canEdit) return;
    nuevoBloque(p.getAttribute('data-ose-add'));
  });

  /* ---------- ARRASTRAR desde la paleta (HTML5) ---------- */
  var arrastrandoTipo = null, placeholder = null;
  root.addEventListener('dragstart', function (ev) {
    var p = ev.target.closest('[data-ose-add]'); if (!p || !canEdit) return;
    arrastrandoTipo = p.getAttribute('data-ose-add'); p.classList.add('is-dragging');
    try { ev.dataTransfer.setData('text/plain', arrastrandoTipo); ev.dataTransfer.effectAllowed = 'copy'; } catch (e) {}
  });
  root.addEventListener('dragend', function (ev) { var p = ev.target.closest('[data-ose-add]'); if (p) p.classList.remove('is-dragging'); arrastrandoTipo = null; quitaPlaceholder(); });
  grid.addEventListener('dragover', function (ev) {
    if (!arrastrandoTipo) return;
    ev.preventDefault();
    var meta = MODS[arrastrandoTipo] || { w: 6 };
    var celda = celdaDe(ev.clientX, ev.clientY, null);
    muestraPlaceholder(clamp(celda.x, 0, COLS - meta.w), celda.y, meta.w, 1);
  });
  grid.addEventListener('dragleave', function (ev) { if (!grid.contains(ev.relatedTarget)) quitaPlaceholder(); });
  grid.addEventListener('drop', function (ev) {
    if (!arrastrandoTipo) return;
    ev.preventDefault();
    var meta = MODS[arrastrandoTipo] || { w: 6 };
    var celda = celdaDe(ev.clientX, ev.clientY, null);
    quitaPlaceholder();
    nuevoBloque(arrastrandoTipo, clamp(celda.x, 0, COLS - meta.w), celda.y);
    arrastrandoTipo = null;
  });
  function muestraPlaceholder(x, y, w, h) {
    if (!placeholder) { placeholder = document.createElement('div'); placeholder.className = 'ose-ph'; grid.appendChild(placeholder); }
    placeholder.style.setProperty('--gc', (x + 1) + ' / span ' + w); placeholder.style.setProperty('--gr', (y + 1) + ' / span ' + h);
  }
  function quitaPlaceholder() { if (placeholder) { placeholder.remove(); placeholder = null; } }

  /* La celda (columna, fila) que hay bajo el puntero. La fila se deduce de dónde están pintados los
     bloques (las filas son de alto variable): la banda vertical de cada fila es de sus bloques. */
  function celdaDe(px, py, excluir) {
    var cs = getComputedStyle(grid), r = grid.getBoundingClientRect();
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, gapC = parseFloat(cs.columnGap) || 0;
    var ancho = r.width - padL - padR, colW = (ancho - gapC * (COLS - 1)) / COLS;
    var x = Math.floor((px - r.left - padL + gapC / 2) / (colW + gapC));
    x = clamp(x, 0, COLS - 1);
    var bandas = {};
    design.blocks.forEach(function (b) {
      if (excluir && b.id === excluir) return;
      var el = elDe(b.id); if (!el) return;
      var er = el.getBoundingClientRect();
      var bd = bandas[b.y] || { top: Infinity, bottom: -Infinity };
      bd.top = Math.min(bd.top, er.top); bd.bottom = Math.max(bd.bottom, er.bottom); bandas[b.y] = bd;
    });
    var filas = Object.keys(bandas).map(Number).sort(function (a, b) { return a - b; });
    if (!filas.length) return { x: x, y: 0 };
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i], bd2 = bandas[f];
      var sig = filas[i + 1], limite = sig != null ? (bd2.bottom + bandas[sig].top) / 2 : bd2.bottom;
      if (py < limite) return { x: x, y: f };
    }
    return { x: x, y: filas[filas.length - 1] + 1 };
  }

  /* ---------- MOVER un módulo (por su asa) y REDIMENSIONAR (bordes) ---------- */
  var drag = null;
  grid.addEventListener('pointerdown', function (ev) {
    if (!canEdit) return;
    var grip = ev.target.closest('[data-ose-grip]'), rs = ev.target.closest('[data-ose-rs]');
    if (!grip && !rs) return;
    var el = ev.target.closest('.os-mod'); if (!el) return;
    var b = bloque(el.getAttribute('data-os-id')); if (!b) return;
    ev.preventDefault();
    var act = document.activeElement; if (act && act.closest && act.closest('[data-os-rich]')) act.blur();
    selecciona(b.id);
    var r = el.getBoundingClientRect();
    drag = { b: b, modo: rs ? 'rs' : 'mv', dir: rs ? rs.getAttribute('data-ose-rs') : '', x0: ev.clientX, y0: ev.clientY, bx: b.x, by: b.y, bw: b.w, bh: b.h,
      offCols: 0, moved: false, ancho: r.width };
    if (!rs) { var celda = celdaDe(ev.clientX, ev.clientY, b.id); drag.offCols = clamp(celda.x - b.x, 0, b.w - 1); el.classList.add('is-dragging'); }
    try { (grip || rs).setPointerCapture(ev.pointerId); } catch (e) {}
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var b = drag.b;
    if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) > 4) drag.moved = true;
    if (!drag.moved) return;
    var cs = getComputedStyle(grid), r = grid.getBoundingClientRect();
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, gapC = parseFloat(cs.columnGap) || 0;
    var colW = (r.width - padL - padR - gapC * (COLS - 1)) / COLS + gapC;
    if (drag.modo === 'mv') {
      var celda = celdaDe(ev.clientX, ev.clientY, b.id);
      var nx = clamp(celda.x - drag.offCols, 0, COLS - b.w), ny = Math.max(0, celda.y);
      if (nx !== b.x || ny !== b.y) { b.x = nx; b.y = ny; resolver(b); aplicaPosTodo(); }
      muestraPlaceholder(b.x, b.y, b.w, b.h);
    } else {
      var dcols = Math.round((ev.clientX - drag.x0) / colW);
      if (drag.dir === 'e') b.w = clamp(drag.bw + dcols, 1, COLS - b.x);
      else if (drag.dir === 'w') { var der = drag.bx + drag.bw; var nx2 = clamp(drag.bx + dcols, 0, der - 1); b.x = nx2; b.w = der - nx2; }
      else if (drag.dir === 's') { var celda2 = celdaDe(ev.clientX, ev.clientY, null); b.h = clamp(celda2.y - b.y + 1, 1, 6); }
      resolver(b); aplicaPosTodo();
    }
  });
  function sueltaDrag() {
    if (!drag) return;
    var el = elDe(drag.b.id); if (el) el.classList.remove('is-dragging');
    quitaPlaceholder();
    if (drag.moved) { marca(); pintaProps(drag.b); }
    drag = null;
    colocaToolbar();
  }
  document.addEventListener('pointerup', sueltaDrag);
  document.addEventListener('pointercancel', sueltaDrag);

  /* ---------- LA BARRA DEL TEXTO ---------- */
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  function richDe(b) { var el = elDe(b.id); return el && el.querySelector('[data-os-rich]'); }
  function enlaceDeSeleccion() {
    var s = window.getSelection(); if (!s || !s.rangeCount) return null;
    var n = s.getRangeAt(0).commonAncestorContainer; if (n.nodeType === 3) n = n.parentNode;
    return n.closest ? n.closest('a') : null;
  }
  toolbar.addEventListener('mousedown', function (ev) { if (!ev.target.closest('select,input')) ev.preventDefault(); });
  toolbar.addEventListener('click', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b || !esTexto(b)) return;
    var t = richDe(b);
    var sz = ev.target.closest('[data-ose-size]');
    if (sz) { b.opts.size = clamp((parseInt(b.opts.size, 10) || 15) + parseInt(sz.getAttribute('data-ose-size'), 10), 10, 40); if (t) t.style.fontSize = b.opts.size + 'px'; toolbar.querySelector('[data-ose-size-input]').value = b.opts.size; marca(); return; }
    var sw = ev.target.closest('[data-ose-swatch]');
    if (sw) { aplicaColor(b, sw.getAttribute('data-ose-swatch')); return; }
    var btn = ev.target.closest('[data-ose-cmd]'); if (!btn || !t) return;
    var cmd = btn.getAttribute('data-ose-cmd');
    t.focus();
    if (cmd === 'link') {
      var a = enlaceDeSeleccion();
      var url = window.prompt('Dirección del enlace (https://…)', a ? a.getAttribute('href') : 'https://');
      if (!url) return;
      if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = 'https://' + url;
      if (a) a.setAttribute('href', url); else document.execCommand('createLink', false, url);
      t.querySelectorAll('a').forEach(function (x) { x.setAttribute('target', '_blank'); x.setAttribute('rel', 'noopener'); });
    } else if (cmd === 'unlink') document.execCommand('unlink', false, null);
    else document.execCommand(cmd, false, null);
    b.opts.html = t.innerHTML; marca();
  });
  toolbar.addEventListener('change', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b || !esTexto(b)) return;
    if (ev.target.matches('[data-ose-size-input]')) { b.opts.size = clamp(parseInt(ev.target.value, 10) || 15, 10, 40); var t = richDe(b); if (t) t.style.fontSize = b.opts.size + 'px'; marca(); }
  });
  toolbar.addEventListener('input', function (ev) {
    var b = sel ? bloque(sel) : null; if (!b || !esTexto(b)) return;
    if (ev.target.matches('[data-ose-color]')) aplicaColor(b, ev.target.value);
  });
  function aplicaColor(b, color) {
    var t = richDe(b); var s = window.getSelection();
    if (t && s && s.rangeCount && !s.isCollapsed && t.contains(s.anchorNode)) { t.focus(); document.execCommand('foreColor', false, color); b.opts.html = t.innerHTML; }
    else { b.style = b.style || {}; b.style.text = hexNorm(color); aplicaEstilo(b); }
    marca();
  }
  function pintaSwatches() {
    var box = toolbar.querySelector('[data-ose-swatches]'); if (!box) return;
    var c = themeColors(design.theme);
    var colores = [c.text, c.icon, c.accent].concat((assets && assets.palette) || []).concat(CAT.corporate || []);
    var vistos = {}; colores = colores.filter(function (x) { x = hexNorm(x); if (!x || vistos[x]) return false; vistos[x] = 1; return true; });
    box.innerHTML = colores.map(function (x) { return '<button type="button" class="pr-swatch" data-ose-swatch="' + esc(hexNorm(x)) + '" style="background:' + esc(hexNorm(x)) + '" title="' + esc(hexNorm(x)) + '"></button>'; }).join('');
  }

  /* ---------- EL TEMA (panel Diseño) ---------- */
  function rellenaTema() {
    var th = design.theme || {};
    root.querySelectorAll('[data-ose-theme]').forEach(function (inp) {
      var k = inp.getAttribute('data-ose-theme');
      if (inp.type === 'color') { var v = hexNorm(th[k]); if (k === 'bg') v = v || '#0f2a24'; inp.value = v || '#888888'; var sw = root.querySelector('[data-ose-theme-swatch="' + k + '"]'); if (sw) { sw.style.background = v || ''; sw.classList.toggle('is-auto', !v); } }
      else if (inp.type === 'range') { inp.value = th[k] != null ? th[k] : inp.value; var lbl = root.querySelector('[data-ose-val="' + k + '"]'); if (lbl) lbl.textContent = etiquetaValor(k, inp.value); }
      else inp.value = th[k] != null ? th[k] : '';
    });
    var hex = root.querySelector('[data-ose-theme-hex="bg"]'); if (hex) hex.value = hexNorm(th.bg) || '';
    root.querySelectorAll('[data-ose-theme-set="module_bg"]').forEach(function (btn) { var on = (th.module_bg || 'none') === btn.getAttribute('data-value'); btn.classList.toggle('btn-dark', on); btn.classList.toggle('btn-outline-secondary', !on); });
    var nm = root.querySelector('[data-ose-bgimg-name]'); if (nm) nm.textContent = th.bg_image_url ? 'Imagen puesta' : 'Sin imagen';
  }
  function etiquetaValor(k, v) {
    if (k === 'bg_image_opacity') return Math.round(v * 100) + ' %';
    if (k === 'darken') return Math.round(v * 100) + ' %';
    if (k === 'bg_image_blur' || k === 'radius' || k === 'gap' || k === 'max_width' || k === 'name_size') return v + ' px';
    if (k === 'height') return v + ' % de la pantalla';
    if (k === 'fade') return v + ' %';
    return String(v);
  }
  root.addEventListener('input', function (ev) {
    var inp = ev.target.closest('[data-ose-theme]'); if (!inp) return;
    var k = inp.getAttribute('data-ose-theme');
    var v = inp.type === 'color' ? hexNorm(inp.value) : (inp.type === 'range' ? parseFloat(inp.value) : inp.value);
    design.theme[k] = v;
    if (inp.type === 'color') { var sw = root.querySelector('[data-ose-theme-swatch="' + k + '"]'); if (sw) { sw.style.background = v; sw.classList.remove('is-auto'); } if (k === 'bg') { var hex = root.querySelector('[data-ose-theme-hex="bg"]'); if (hex) hex.value = v; } }
    var lbl = root.querySelector('[data-ose-val="' + k + '"]'); if (lbl) lbl.textContent = etiquetaValor(k, inp.value);
    aplicaTema(); marca();
  });
  root.addEventListener('change', function (ev) {
    var hex = ev.target.closest('[data-ose-theme-hex]');
    if (hex) { var v = hexNorm(hex.value); if (v) { design.theme.bg = v; rellenaTema(); aplicaTema(); marca(); } return; }
    var fu = ev.target.closest('[data-ose-upload]');
    if (fu && fu.files && fu.files[0]) { subeImagen(fu.files[0], fu.getAttribute('data-ose-upload')); fu.value = ''; }
  });
  root.addEventListener('click', function (ev) {
    var clr = ev.target.closest('[data-ose-theme-clear]');
    if (clr) { design.theme[clr.getAttribute('data-ose-theme-clear')] = ''; rellenaTema(); aplicaTema(); marca(); return; }
    var set = ev.target.closest('[data-ose-theme-set]');
    if (set) { design.theme[set.getAttribute('data-ose-theme-set')] = set.getAttribute('data-value'); rellenaTema(); aplicaTema(); marca(); return; }
    var pal = ev.target.closest('[data-ose-pal-color]');
    if (pal) { design.theme.bg = pal.getAttribute('data-ose-pal-color'); rellenaTema(); aplicaTema(); marca(); return; }
  });
  function pintaPaleta() {
    var box = root.querySelector('[data-ose-palette]'); if (!box) return;
    var colores = ((assets && assets.palette) || []).concat(CAT.corporate || []);
    var vistos = {}; colores = colores.filter(function (x) { x = hexNorm(x); if (!x || vistos[x]) return false; vistos[x] = 1; return true; });
    box.innerHTML = colores.map(function (x) { return '<button type="button" class="pr-swatch pr-swatch--lg" data-ose-pal-color="' + esc(hexNorm(x)) + '" style="background:' + esc(hexNorm(x)) + '" title="' + esc(hexNorm(x)) + '"></button>'; }).join('') || '<span class="small text-muted">Sube una foto de cabecera para sacar sus colores.</span>';
  }
  function subeImagen(file, proposito) {
    var fd = new FormData(); fd.append('file', file); fd.append('purpose', proposito);
    toast('Subiendo la imagen…');
    postForm(root.getAttribute('data-upload-url'), fd).then(function (js) {
      if (!js || !js.ok) { alert((js && js.error) || 'No se pudo subir la imagen.'); toast('No se pudo subir', 'error'); return; }
      if (proposito === 'hero') { design.hero.image_url = js.url; if (assets) { assets.palette = js.palette || assets.palette; assets.hero_url = js.url; } }
      else if (proposito === 'bg') design.theme.bg_image_url = js.url;
      rellenaTema(); rellenaHero(); aplicaTema(); pintaPaleta(); marca('Imagen subida · sin guardar');
    });
  }

  /* ---------- LA CABECERA (panel) ---------- */
  function rellenaHero() {
    var h = design.hero || {};
    root.querySelectorAll('[data-ose-hero]').forEach(function (inp) {
      var k = inp.getAttribute('data-ose-hero');
      if (inp.type === 'checkbox') inp.checked = h[k] !== false;
      else if (inp.type === 'color') { var v = hexNorm(h[k]); inp.value = v || '#ffffff'; var sw = root.querySelector('[data-ose-hero-swatch="' + k + '"]'); if (sw) { sw.style.background = v || ''; sw.classList.toggle('is-auto', !v); } }
      else if (inp.type === 'range') { inp.value = h[k] != null ? h[k] : inp.value; var lb = root.querySelector('[data-ose-val="' + k + '"]'); if (lb) lb.textContent = etiquetaValor(k, inp.value); }
      else inp.value = h[k] != null ? h[k] : '';
    });
    root.querySelectorAll('[data-ose-focus] button').forEach(function (btn) { btn.classList.toggle('is-on', btn.getAttribute('data-focus') === (h.focus || '50% 30%')); });
    root.querySelectorAll('[data-ose-hero-set="align"]').forEach(function (btn) { var on = (h.align || 'left') === btn.getAttribute('data-value'); btn.classList.toggle('btn-dark', on); btn.classList.toggle('btn-outline-secondary', !on); });
    pintaMetricasHero();
  }
  function pintaMetricasHero() {
    var h = design.hero || {};
    root.querySelectorAll('[data-ose-hero-metric]').forEach(function (inp) {
      var k = inp.getAttribute('data-ose-hero-metric');
      inp.checked = (h.metrics || []).indexOf(k) >= 0;
      var tiene = assets && assets.metricsByKey && assets.metricsByKey[k];
      var lab = inp.closest('label'); if (lab) { lab.classList.toggle('text-muted', !tiene); lab.title = tiene ? ('Ahora: ' + tiene.value_fmt) : 'Sin dato todavía (Chartmetric)'; }
    });
  }
  root.addEventListener('input', function (ev) {
    var inp = ev.target.closest('[data-ose-hero]'); if (!inp) return;
    var k = inp.getAttribute('data-ose-hero');
    var v = inp.type === 'checkbox' ? inp.checked : (inp.type === 'color' ? hexNorm(inp.value) : (inp.type === 'range' ? parseFloat(inp.value) : inp.value));
    design.hero[k] = v;
    if (inp.type === 'color') { var sw = root.querySelector('[data-ose-hero-swatch="' + k + '"]'); if (sw) { sw.style.background = v; sw.classList.remove('is-auto'); } }
    var lbl = root.querySelector('[data-ose-val="' + k + '"]'); if (lbl) lbl.textContent = etiquetaValor(k, inp.value);
    aplicaTema(); marca();
  });
  root.addEventListener('change', function (ev) {
    var m = ev.target.closest('[data-ose-hero-metric]'); if (!m) return;
    design.hero.metrics = Array.prototype.filter.call(root.querySelectorAll('[data-ose-hero-metric]'), function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-ose-hero-metric'); }).slice(0, 4);
    pintaMetricasHero(); pintaHero(); marca();
  });
  root.addEventListener('click', function (ev) {
    var f = ev.target.closest('[data-ose-focus] button');
    if (f) { design.hero.focus = f.getAttribute('data-focus'); rellenaHero(); aplicaTema(); marca(); return; }
    var set = ev.target.closest('[data-ose-hero-set]');
    if (set) { design.hero[set.getAttribute('data-ose-hero-set')] = set.getAttribute('data-value'); rellenaHero(); aplicaTema(); marca(); return; }
    var clr = ev.target.closest('[data-ose-hero-clear]');
    if (clr) { design.hero[clr.getAttribute('data-ose-hero-clear')] = ''; rellenaHero(); aplicaTema(); marca(); return; }
    if (ev.target.closest('[data-ose-hero-photo]')) { design.hero.image_url = ''; rellenaHero(); aplicaTema(); marca(); return; }
  });

  /* ---------- ELEGIR FOTOS ---------- */
  var fotosBloque = null;
  function abreFotos(b) {
    fotosBloque = b;
    var modal = document.getElementById('osePhotos'); if (!modal) return;
    var list = modal.querySelector('[data-ose-photo-list]');
    list.innerHTML = '<div class="text-muted small p-3">Cargando…</div>';
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).show();
    cargaAssets().then(function () {
      var albums = assets.photos || [];
      var albumIds = b.opts.album_ids || [], photoIds = b.opts.photo_ids || [];
      if (!albums.length) { list.innerHTML = '<div class="alert alert-light border mb-0">No hay fotos de este artista en la app todavía (se suben en su pestaña Fotos o en la de una actividad).</div>'; return; }
      list.innerHTML = albums.map(function (al) {
        var enAlbum = albumIds.indexOf(al.id) >= 0;
        return '<div class="ose__photo-alb" data-alb="' + esc(al.id) + '"><div class="ose__photo-alb-h" data-alb-toggle>' +
          '<label class="form-check" title="Todo el álbum (se actualiza solo)"><input class="form-check-input" type="checkbox" data-alb-all' + (enAlbum ? ' checked' : '') + '></label>' +
          (al.cover ? '<img src="' + esc(al.cover) + '" alt="">' : '') + '<div class="flex-grow-1" style="min-width:0"><div class="fw-semibold text-truncate">' + esc(al.name) + '</div><div class="small text-muted">' + esc(al.sub || '') + ' · ' + al.count + ' foto' + (al.count !== 1 ? 's' : '') + '</div></div><i class="fa-solid fa-chevron-down text-muted"></i></div>' +
          '<div class="ose__photo-grid">' + al.photos.map(function (f) { return '<div class="ose__photo' + (enAlbum ? ' is-on is-album' : (photoIds.indexOf(f.id) >= 0 ? ' is-on' : '')) + '" data-photo="' + esc(f.id) + '" title="' + esc(f.title || '') + '"><img src="' + esc(f.url) + '" alt="" loading="lazy"></div>'; }).join('') + '</div></div>';
      }).join('');
      cuentaFotos();
    });
  }
  function cuentaFotos() {
    var modal = document.getElementById('osePhotos'); if (!modal) return;
    var nAlb = modal.querySelectorAll('[data-alb-all]:checked').length;
    var nFot = modal.querySelectorAll('.ose__photo.is-on:not(.is-album)').length;
    var c = modal.querySelector('[data-ose-photo-count]'); if (c) c.textContent = (nAlb ? nAlb + ' álbum' + (nAlb > 1 ? 'es' : '') : '') + (nAlb && nFot ? ' · ' : '') + (nFot ? nFot + ' foto' + (nFot > 1 ? 's' : '') + ' suelta' + (nFot > 1 ? 's' : '') : '');
  }
  document.addEventListener('click', function (ev) {
    var modal = ev.target.closest('#osePhotos'); if (!modal) return;
    var tog = ev.target.closest('[data-alb-toggle]');
    if (tog && !ev.target.closest('[data-alb-all]') && !ev.target.closest('.form-check')) { tog.parentNode.classList.toggle('is-open'); return; }
    var ph = ev.target.closest('.ose__photo');
    if (ph && !ph.classList.contains('is-album')) { ph.classList.toggle('is-on'); cuentaFotos(); return; }
    if (ev.target.closest('[data-ose-photo-apply]') && fotosBloque) {
      var b = fotosBloque;
      b.opts.album_ids = Array.prototype.map.call(modal.querySelectorAll('[data-alb-all]:checked'), function (x) { return x.closest('[data-alb]').getAttribute('data-alb'); });
      b.opts.photo_ids = Array.prototype.map.call(modal.querySelectorAll('.ose__photo.is-on:not(.is-album)'), function (x) { return x.getAttribute('data-photo'); });
      marca(); pintaModulo(b); pintaProps(b);
      if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).hide();
    }
  });
  document.addEventListener('change', function (ev) {
    var all = ev.target.closest('[data-alb-all]'); if (!all) return;
    var alb = all.closest('[data-alb]');
    alb.querySelectorAll('.ose__photo').forEach(function (p) { p.classList.toggle('is-album', all.checked); if (all.checked) p.classList.add('is-on'); else p.classList.remove('is-on'); });
    cuentaFotos();
  });

  /* ---------- PLANTILLAS ---------- */
  function cargaPlantillas() {
    var menu = root.querySelector('[data-ose-templates-menu]'); if (!menu) return;
    fetch(root.getAttribute('data-templates-url'), { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }).then(function (js) {
      var tpls = (js && js.templates) || [];
      var html = '<li><h6 class="dropdown-header">Cargar un formato</h6></li>';
      html += tpls.length ? tpls.map(function (t) {
        return '<li><div class="dropdown-item" style="cursor:default"><button type="button" class="btn btn-link p-0 text-start flex-grow-1 d-flex align-items-center gap-2 text-decoration-none" data-ose-tpl="' + esc(t.id) + '" title="Cargar esta plantilla">' +
          (t.thumb_url ? '<img class="ose__tpl-thumb" src="' + esc(t.thumb_url) + '" alt="">' : '<span class="ose__tpl-thumb" style="background:' + esc(t.bg) + '"></span>') +
          '<span><span class="d-block fw-semibold">' + esc(t.name) + '</span><small class="text-muted">' + t.blocks + ' módulos' + (t.by ? ' · ' + esc(t.by) : '') + '</small></span></button>' +
          (canEdit ? '<button type="button" class="btn btn-sm btn-link text-muted" data-ose-tpl-del="' + esc(t.id) + '" title="Borrar la plantilla"><i class="fa fa-trash"></i></button>' : '') + '</div></li>';
      }).join('') : '<li><span class="dropdown-item-text small text-muted">Todavía no hay plantillas guardadas.</span></li>';
      if (canEdit) html += '<li><hr class="dropdown-divider"></li><li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#oseTemplate"><i class="fa fa-floppy-disk fa-fw me-1"></i>Guardar este diseño como plantilla</button></li>';
      menu.innerHTML = html;
    }).catch(function () {});
  }
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-ose-tpl]');
    if (t) {
      if (!confirm('Se carga el formato de la plantilla (colores, tipografía, cabecera y qué módulos van dónde). Lo que hay escrito en los módulos del mismo tipo se conserva. ¿Seguimos?')) return;
      toast('Cargando la plantilla…');
      post(root.getAttribute('data-template-apply-url'), { template_id: t.getAttribute('data-ose-tpl'), design: serializa() }).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || 'No se pudo cargar la plantilla.'); return; }
        dirty = false; window.location.reload();
      });
      return;
    }
    var d = ev.target.closest('[data-ose-tpl-del]');
    if (d) { if (!confirm('¿Borrar esta plantilla? Los one sheets que se hicieron con ella no cambian.')) return; post(root.getAttribute('data-templates-url').replace(/lista$/, '') + d.getAttribute('data-ose-tpl-del') + '/borrar', {}).then(function () { cargaPlantillas(); }); return; }
    if (ev.target.closest('[data-ose-template-save]')) {
      var campo = document.querySelector('[data-ose-template-name]'); var nombre = ((campo && campo.value) || '').trim();
      if (!nombre) { alert('Ponle un nombre a la plantilla.'); return; }
      post(root.getAttribute('data-template-new-url'), { osid: root.getAttribute('data-osid'), name: nombre, design: serializa() }).then(function (js) {
        if (!js || !js.ok) { alert((js && js.error) || 'No se pudo guardar la plantilla.'); return; }
        if (campo) campo.value = '';
        var m = document.getElementById('oseTemplate'); if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
        cargaPlantillas(); toast('Plantilla «' + nombre + '» guardada');
      });
    }
  });

  /* ---------- AJUSTES (dirección pública, etiquetas, Roster) ---------- */
  root.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-ose-settings-save]')) return;
    var modal = document.getElementById('oseSettings'); if (!modal) return;
    var msg = modal.querySelector('[data-ose-settings-msg]');
    var payload = {
      slug: (modal.querySelector('[data-ose-set="slug"]') || {}).value || '',
      services: Array.prototype.map.call(modal.querySelectorAll('[data-ose-set-service]:checked'), function (x) { return x.getAttribute('data-ose-set-service'); }),
      roster_visible: !!(modal.querySelector('[data-ose-set="roster_visible"]') || {}).checked,
      published: !!(modal.querySelector('[data-ose-set="published"]') || {}).checked
    };
    if (msg) msg.textContent = 'Guardando…';
    post(root.getAttribute('data-settings-url'), payload).then(function (js) {
      if (!js || !js.ok) { if (msg) msg.textContent = (js && js.error) || 'No se pudo guardar.'; return; }
      if (msg) msg.textContent = 'Guardado ✓';
      root.setAttribute('data-public-url', js.public_url);
      root.querySelectorAll('[data-ose-public-link]').forEach(function (a) { a.setAttribute('href', js.public_url); });
      var txt = root.querySelector('[data-ose-public-text]'); if (txt) txt.textContent = js.public_url.replace(/^https?:\/\//, '');
      var su = document.querySelector('[data-ose-share-url]'); if (su) su.value = js.public_url;
      var cp = document.querySelector('#oseShare [data-copy-url]'); if (cp) cp.setAttribute('data-copy-url', js.public_url);
      // Las etiquetas de la cabecera cambian con lo que llevamos: se repinta la página.
      var svcs = page.querySelector('[data-os-hero-services]');
      var todas = CAT.services || [];
      var html = todas.filter(function (s) { return js.services.indexOf(s.key) >= 0; }).map(function (s) { return '<span class="os-chip os-chip--svc"><i class="fa-solid ' + esc(s.icon) + '"></i>' + esc(s.label) + '</span>'; }).join('');
      if (html) { if (!svcs) { svcs = document.createElement('div'); svcs.className = 'os-hero__services'; svcs.setAttribute('data-os-hero-services', ''); var inner = page.querySelector('.os-hero__inner'); var nm = inner.querySelector('[data-os-hero-name]'); if (nm && nm.nextSibling) inner.insertBefore(svcs, nm.nextSibling); else inner.appendChild(svcs); } svcs.innerHTML = html; svcs.hidden = design.hero.show_services === false; }
      else if (svcs) svcs.remove();
    });
  });
  document.addEventListener('change', function (ev) {
    var chip = ev.target.closest('#oseSettings .ost__chip'); if (chip) chip.classList.toggle('is-on', ev.target.checked);
  });

  /* ---------- DISPOSITIVO (cómo se ve en cada pantalla) ---------- */
  root.addEventListener('click', function (ev) {
    var d = ev.target.closest('[data-ose-device]'); if (!d) return;
    root.querySelectorAll('[data-ose-device]').forEach(function (x) { x.classList.toggle('is-on', x === d); });
    stage.classList.remove('ose__stage--tablet', 'ose__stage--mobile');
    var v = d.getAttribute('data-ose-device'); if (v !== 'desktop') stage.classList.add('ose__stage--' + v);
    setTimeout(colocaToolbar, 300);
  });

  /* ---------- TECLADO ---------- */
  function escribiendo(ev) {
    if (document.querySelector('.modal.show')) return true;
    var a = document.activeElement;
    if (ev && ev.target && ev.target.closest && ev.target.closest('[data-os-rich], input, textarea, select, [contenteditable="true"]')) return true;
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '')));
  }
  document.addEventListener('keydown', function (ev) {
    var meta = ev.metaKey || ev.ctrlKey, tecla = (ev.key || '').toLowerCase();
    if (meta && tecla === 's') { ev.preventDefault(); if (canEdit) guarda(); return; }
    if (ev.key === 'Escape' && sel && !escribiendo(ev)) { deselecciona(); abrePanel('modules'); return; }
    if (!canEdit || escribiendo(ev) || !sel) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); borra(sel); return; }
    var b = bloque(sel); if (!b) return;
    if (ev.key === 'ArrowLeft' && b.x > 0) { b.x -= 1; resolver(b); aplicaPosTodo(); marca(); ev.preventDefault(); }
    if (ev.key === 'ArrowRight' && b.x + b.w < COLS) { b.x += 1; resolver(b); aplicaPosTodo(); marca(); ev.preventDefault(); }
    if (ev.key === 'ArrowUp' && b.y > 0) { b.y -= 1; resolver(b); aplicaPosTodo(); marca(); ev.preventDefault(); }
    if (ev.key === 'ArrowDown') { b.y += 1; resolver(b); aplicaPosTodo(); marca(); ev.preventDefault(); }
  });

  /* ---------- GUARDAR ---------- */
  function serializa() {
    return {
      version: 2, theme: design.theme, hero: design.hero,
      blocks: design.blocks.map(function (b) {
        var o = { id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, opts: JSON.parse(JSON.stringify(b.opts || {})), style: b.style || {} };
        if (esTexto(b)) { var rich = richDe(b); if (rich) o.opts.html = rich.innerHTML; }
        return o;
      })
    };
  }
  function guarda() {
    var s = root.querySelector('[data-ose-saved]'); if (s) { s.textContent = 'Guardando…'; s.classList.remove('text-danger'); }
    return post(root.getAttribute('data-save-url'), { design: serializa() }).then(function (js) {
      if (!js || !js.ok) { if (s) s.textContent = 'No se pudo guardar'; alert((js && js.error) || 'No se pudo guardar.'); return false; }
      // El servidor devuelve el diseño NORMALIZADO (rangos, solapes, HTML saneado): se toma como verdad,
      // conservando lo que se está escribiendo.
      var porId = {}; (js.design.blocks || []).forEach(function (b) { porId[b.id] = b; });
      design.blocks.forEach(function (b) { var n = porId[b.id]; if (n) { b.x = n.x; b.y = n.y; b.w = n.w; b.h = n.h; if (!esTexto(b)) b.opts = n.opts; b.style = n.style; } });
      design.theme = js.design.theme || design.theme; design.hero = js.design.hero || design.hero;
      aplicaPosTodo(); dirty = false;
      if (s) s.textContent = 'Guardado ✓' + (js.updated_label ? ' · ' + js.updated_label : '');
      return true;
    }).catch(function () { if (s) s.textContent = 'No se pudo guardar'; return false; });
  }
  var btnSave = root.querySelector('[data-ose-save]'); if (btnSave) btnSave.addEventListener('click', guarda);
  var btnBack = root.querySelector('[data-ose-back]');
  if (btnBack) btnBack.addEventListener('click', function (ev) {
    if (!dirty || !canEdit) return;
    ev.preventDefault(); var dest = btnBack.getAttribute('href');
    guarda().then(function (ok) { if (ok && dest) window.location.href = dest; });
  });
  window.addEventListener('beforeunload', function (ev) { if (dirty && canEdit) { ev.preventDefault(); ev.returnValue = ''; } });
  window.addEventListener('resize', colocaToolbar);
  stage.addEventListener('scroll', colocaToolbar);

  /* ---------- ARRANQUE ---------- */
  design.theme = design.theme || {}; design.hero = design.hero || {}; design.blocks = Array.isArray(design.blocks) ? design.blocks : [];
  design.blocks.forEach(function (b) { b.opts = b.opts || {}; b.style = b.style || {}; enganchaTexto(b); aplicaEstilo(b); });
  rellenaTema(); rellenaHero(); pintaSwatches();
  cargaPlantillas();
  cargaAssets();
  if (!canEdit) { root.querySelectorAll('[data-ose-panel] input, [data-ose-panel] select, [data-ose-panel] button:not([data-ose-tab])').forEach(function (x) { x.disabled = true; }); }
})();
