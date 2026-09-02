/* =========================================================================
   VISOR DE PIEZAS · SE PINCHA Y SE VE, con flechas para pasar a la siguiente.

   Un cartel, un logo o un material puede ser una IMAGEN, un VÍDEO, un AUDIO
   (una cuña de radio), un PDF o un archivo que solo se descarga. Antes, al
   pincharlo, o se lo descargaba el navegador o se abría en otra pestaña: nunca
   se veía en el sitio. Aquí se abre a tamaño, se reproduce lo que se puede
   reproducir y se pasa a la anterior/siguiente sin cerrar nada.

   Cómo se usa (marcando el elemento que se pincha):
     data-viewer-src="URL para VERLO"      ← obligatorio
     data-viewer-kind="IMAGE|VIDEO|AUDIO|PDF|FILE"
     data-viewer-name="cómo se llama"
     data-viewer-download="URL para guardarlo"   (opcional)
     data-viewer-poster="URL de su miniatura"    (opcional, vídeos)
   Las piezas de un mismo grupo se recorren con las flechas: son las que están
   dentro del `[data-viewer-group]` más cercano (si no hay, todas las de la
   página). Para que un control de dentro NO abra el visor: `data-viewer-ignore`.

   Es AUTOCONTENIDO (se pinta su propio CSS y no depende de Bootstrap) a
   propósito: lo usan también las páginas públicas, que son standalone.
   ========================================================================= */
(function () {
  'use strict';
  if (window.app33Viewer) return;

  var CSS = ''
    + '.mv{position:fixed;inset:0;z-index:2147482500;background:rgba(9,12,18,.93);display:none;'
    + 'font:400 14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff}'
    + '.mv.is-open{display:flex;flex-direction:column}'
    + '.mv__top{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:12px 14px}'
    + '.mv__name{flex:1 1 auto;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.mv__pos{flex:0 0 auto;color:#c7cdd6;font-size:13px;font-variant-numeric:tabular-nums}'
    + '.mv__btn{flex:0 0 auto;background:rgba(255,255,255,.12);border:0;color:#fff;border-radius:999px;'
    + 'padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px}'
    + '.mv__btn:hover{background:rgba(255,255,255,.22)}'
    + '.mv__btn--icon{padding:8px 11px}'
    + '.mv__stage{flex:1 1 auto;min-height:0;position:relative;display:grid;place-items:center;padding:0 14px 14px}'
    + '.mv__box{max-width:100%;max-height:100%;display:grid;place-items:center}'
    + '.mv__box img,.mv__box video{max-width:100%;max-height:calc(100vh - 130px);width:auto;height:auto;'
    + 'object-fit:contain;border-radius:10px;background:#000;display:block}'
    + '.mv__box iframe{width:min(1000px,calc(100vw - 40px));height:calc(100vh - 130px);border:0;'
    + 'border-radius:10px;background:#fff}'
    + '.mv__audio{text-align:center;padding:26px 22px;background:rgba(255,255,255,.06);border-radius:16px;'
    + 'min-width:min(420px,calc(100vw - 48px))}'
    + '.mv__audio i{font-size:34px;opacity:.85}'
    + '.mv__audio audio{width:100%;margin-top:16px}'
    + '.mv__file{text-align:center;padding:30px 24px;background:rgba(255,255,255,.06);border-radius:16px}'
    + '.mv__file i{font-size:40px;opacity:.8}'
    + '.mv__file p{margin:12px 0 16px;color:#c7cdd6}'
    + '.mv__nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.14);'
    + 'border:0;color:#fff;width:46px;height:46px;border-radius:50%;font-size:18px;cursor:pointer;display:grid;'
    + 'place-items:center}'
    + '.mv__nav:hover{background:rgba(255,255,255,.26)}'
    + '.mv__nav--prev{left:10px}.mv__nav--next{right:10px}'
    + '.mv__nav[hidden]{display:none}'
    + '@media (max-width:600px){.mv__top{padding:10px}.mv__btn{padding:8px 11px}.mv__nav{width:40px;height:40px}'
    + '.mv__box img,.mv__box video{max-height:calc(100vh - 170px)}.mv__box iframe{height:calc(100vh - 170px)}}';

  var cosas = [], i = 0, capa = null, activo = null;

  function estilos() {
    if (document.getElementById('mvCss')) return;
    var st = document.createElement('style');
    st.id = 'mvCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function montar() {
    estilos();
    if (capa && capa.isConnected) return capa;
    capa = document.createElement('div');
    capa.className = 'mv';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.innerHTML = ''
      + '<div class="mv__top">'
      + '  <span class="mv__name" data-mv-name></span>'
      + '  <span class="mv__pos" data-mv-pos></span>'
      + '  <a class="mv__btn" data-mv-dl hidden data-dl-bar target="_blank" rel="noopener" download>'
      + '    <i class="fa fa-download"></i><span>Descargar</span></a>'
      + '  <button type="button" class="mv__btn mv__btn--icon" data-mv-close title="Cerrar (Esc)">'
      + '    <i class="fa fa-xmark"></i></button>'
      + '</div>'
      + '<div class="mv__stage">'
      + '  <button type="button" class="mv__nav mv__nav--prev" data-mv-prev title="Anterior (←)">'
      + '    <i class="fa fa-chevron-left"></i></button>'
      + '  <div class="mv__box" data-mv-box></div>'
      + '  <button type="button" class="mv__nav mv__nav--next" data-mv-next title="Siguiente (→)">'
      + '    <i class="fa fa-chevron-right"></i></button>'
      + '</div>';
    (document.body || document.documentElement).appendChild(capa);

    capa.querySelector('[data-mv-close]').addEventListener('click', cerrar);
    capa.querySelector('[data-mv-prev]').addEventListener('click', function () { mover(-1); });
    capa.querySelector('[data-mv-next]').addEventListener('click', function () { mover(1); });
    // Pinchar el fondo cierra; pinchar el contenido, no (si no, se cierra al usar los controles).
    capa.querySelector('.mv__stage').addEventListener('click', function (ev) {
      if (ev.target === ev.currentTarget) cerrar();
    });
    // Con el dedo: arrastrar a los lados pasa de pieza.
    var x0 = null, y0 = null;
    capa.addEventListener('touchstart', function (ev) {
      if (!ev.touches || ev.touches.length !== 1) { x0 = null; return; }
      x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY;
    }, { passive: true });
    capa.addEventListener('touchend', function (ev) {
      if (x0 == null || !ev.changedTouches || !ev.changedTouches.length) return;
      var dx = ev.changedTouches[0].clientX - x0, dy = ev.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) mover(dx < 0 ? 1 : -1);
    }, { passive: true });
    return capa;
  }

  function pausar() {
    if (!capa) return;
    capa.querySelectorAll('video,audio').forEach(function (m) {
      try { m.pause(); } catch (e) {}
    });
  }

  function pintar() {
    var it = cosas[i] || {};
    var caja = capa.querySelector('[data-mv-box]');
    var kind = (it.kind || 'IMAGE').toUpperCase();
    pausar();
    caja.innerHTML = '';
    capa.querySelector('[data-mv-name]').textContent = it.name || '';
    var pos = capa.querySelector('[data-mv-pos]');
    pos.textContent = cosas.length > 1 ? ((i + 1) + ' / ' + cosas.length) : '';
    var dl = capa.querySelector('[data-mv-dl]');
    if (it.download) {
      dl.hidden = false;
      dl.setAttribute('href', it.download);
      dl.setAttribute('data-dl-name', it.name || '');
    } else {
      dl.hidden = true;
      dl.removeAttribute('href');
    }
    capa.querySelector('[data-mv-prev]').hidden = cosas.length < 2;
    capa.querySelector('[data-mv-next]').hidden = cosas.length < 2;

    if (kind === 'VIDEO') {
      var v = document.createElement('video');
      v.src = it.src; v.controls = true; v.playsInline = true; v.preload = 'metadata';
      if (it.poster) v.poster = it.poster;
      caja.appendChild(v);
      // Se intenta arrancar solo; si el navegador lo bloquea (sonido), quedan sus controles.
      try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      activo = v;
    } else if (kind === 'AUDIO') {
      caja.innerHTML = '<div class="mv__audio"><i class="fa fa-music"></i>'
        + '<div style="margin-top:8px;font-weight:700;">' + esc(it.name || 'Audio') + '</div>'
        + '<audio controls preload="metadata" src="' + esc(it.src) + '"></audio></div>';
      var a = caja.querySelector('audio');
      try { var p2 = a.play(); if (p2 && p2.catch) p2.catch(function () {}); } catch (e) {}
      activo = a;
    } else if (kind === 'PDF') {
      // El PDF se ve en su marco; en el móvil algunos navegadores no lo pintan, así que debajo
      // queda el enlace para abrirlo.
      caja.innerHTML = '<iframe src="' + esc(it.src) + '#view=FitH&zoom=page-width"></iframe>';
      activo = null;
    } else if (kind === 'FILE') {
      caja.innerHTML = '<div class="mv__file"><i class="fa fa-file-zipper"></i>'
        + '<div style="margin-top:10px;font-weight:700;">' + esc(it.name || 'Archivo') + '</div>'
        + '<p>Este archivo no se puede ver en pantalla (es para abrirlo en su programa).</p>'
        + (it.download ? '<a class="mv__btn" href="' + esc(it.download) + '" data-dl-bar'
            + ' data-dl-name="' + esc(it.name || '') + '"><i class="fa fa-download"></i>'
            + '<span>Descargar</span></a>' : '') + '</div>';
      activo = null;
    } else {
      var img = document.createElement('img');
      img.src = it.src;
      img.alt = it.name || '';
      caja.appendChild(img);
      activo = null;
    }
  }

  function mover(paso) {
    if (cosas.length < 2) return;
    i = (i + paso + cosas.length) % cosas.length;
    pintar();
  }

  function teclas(ev) {
    if (!capa || !capa.classList.contains('is-open')) return;
    if (ev.key === 'Escape') { cerrar(); return; }
    if (ev.key === 'ArrowLeft') { mover(-1); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { mover(1); ev.preventDefault(); }
  }

  function cerrar() {
    if (!capa) return;
    pausar();
    capa.classList.remove('is-open');
    capa.querySelector('[data-mv-box]').innerHTML = '';
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', teclas);
  }

  function abrir(items, indice) {
    var lista = (items || []).filter(function (x) { return x && x.src; });
    if (!lista.length) return;
    cosas = lista;
    i = Math.min(Math.max(0, indice || 0), cosas.length - 1);
    montar();
    capa.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', teclas);
    pintar();
  }

  function deElemento(el) {
    return {
      src: el.getAttribute('data-viewer-src') || '',
      kind: (el.getAttribute('data-viewer-kind') || 'IMAGE').toUpperCase(),
      name: el.getAttribute('data-viewer-name') || '',
      download: el.getAttribute('data-viewer-download') || '',
      poster: el.getAttribute('data-viewer-poster') || ''
    };
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (e.target.closest && e.target.closest('[data-viewer-ignore],a[data-dl-bar]')) return;
    var el = e.target.closest ? e.target.closest('[data-viewer-src]') : null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    // Qué piezas recorren las flechas: las del mismo CONJUNTO (`data-viewer-set`, que es lo que
    // usan las secciones de una ficha), o las que estén dentro del `[data-viewer-group]` más
    // cercano (una rejilla), o —si no se dice nada— todas las de la pantalla.
    var conjunto = el.getAttribute('data-viewer-set') || '';
    var hermanos;
    if (conjunto) {
      hermanos = Array.prototype.slice.call(document.querySelectorAll(
        '[data-viewer-src][data-viewer-set="' + conjunto.replace(/"/g, '') + '"]'));
    } else {
      var ambito = el.closest('[data-viewer-group]') || document;
      hermanos = Array.prototype.slice.call(ambito.querySelectorAll('[data-viewer-src]'));
    }
    var idx = Math.max(0, hermanos.indexOf(el));
    abrir(hermanos.map(deElemento), idx);
  }, true);

  // Con el teclado: una tarjeta que se puede ver es un botón (role="button" tabindex="0"), así que
  // Enter y Espacio la abren igual que el clic.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = e.target && e.target.closest ? e.target.closest('[data-viewer-src][tabindex]') : null;
    if (!el) return;
    e.preventDefault();
    el.click();
  });

  window.app33Viewer = { open: abrir, close: cerrar };
})();
