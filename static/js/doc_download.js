/* =========================================================================
   Descarga de DOCUMENTOS generados por el servidor (PDF, Excel, ZIP…) con
   aviso corporativo de «Generando documento» y barra de estado.

   El problema que resuelve: los documentos se generan al vuelo y tardan unos
   segundos. Antes, un enlace con target="_blank" abría una pestaña EN BLANCO
   hasta que el fichero llegaba (parecía un fallo), y una descarga normal no
   daba ninguna señal de que estuviera pasando algo.

   Cómo funciona:
   · target="_blank" → se abre la pestaña AL INSTANTE (síncrono, así el
     navegador no la bloquea) con una pantalla propia «Generando documento…»
     (mismos colores e iconos que el resto de la app) y, cuando el fichero
     está listo, esa misma pestaña lo muestra.
   · Descarga normal → se usa el loader global de la app con la barra de
     progreso y al terminar se guarda el fichero.
   · Si algo falla, se cae al comportamiento de siempre (navegar al enlace),
     así nunca se queda nadie sin su documento.

   Se aplica a los enlaces same-origin de documentos (por extensión o por las
   rutas de la app que generan ficheros). Para excluir uno: data-no-doc-loader.
   ========================================================================= */
(function () {
  'use strict';

  // Extensiones de documento y rutas de la app que GENERAN ficheros al vuelo.
  var DOC_EXT_RE = /\.(pdf|zip|csv|xlsx?|docx?|pptx?|ics)(\?|$)/i;
  var DOC_PATH_RE = /\/(pdf|xlsx|excel|csv|zip|descargar|descargar-todas|export|exportar)(\/|\?|$)/i;
  var OK_TYPES_RE = /(application\/pdf|spreadsheet|excel|zip|csv|octet-stream|calendar|msword|officedocument)/i;

  function isDocLink(a) {
    if (!a || a.hasAttribute('data-no-doc-loader')) return false;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return false;
    if (/^(javascript:|mailto:|tel:|blob:|data:)/i.test(href)) return false;
    if (a.host && a.host !== location.host) return false;   // ficheros ya subidos (Storage): van directos
    return DOC_EXT_RE.test(href) || DOC_PATH_RE.test(href);
  }

  /* ---- Pantalla «Generando documento» dentro de la pestaña nueva ---- */
  function pendingTabHtml() {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Generando documento…</title><style>'
      + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
      + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
      + 'background:radial-gradient(120% 150% at 0% 0%,rgba(0,124,162,.08),transparent 46%),'
      + 'radial-gradient(120% 150% at 100% 0%,rgba(227,61,72,.07),transparent 46%),#f5f7fb;color:#111}'
      + '.box{text-align:center;padding:28px 24px;max-width:420px}'
      + '.ico{display:flex;gap:11px;justify-content:center;margin-bottom:18px}'
      + '.ico span{width:44px;height:44px;border-radius:14px;display:inline-flex;align-items:center;'
      + 'justify-content:center;font-size:19px;border:1px solid rgba(227,61,72,.22);background:rgba(227,61,72,.10);'
      + 'animation:bob 3.2s ease-in-out infinite}'
      + '.ico span:nth-child(even){background:rgba(0,124,162,.10);border-color:rgba(0,124,162,.22)}'
      + '.ico span:nth-child(2){animation-delay:.15s}.ico span:nth-child(3){animation-delay:.3s}'
      + '.ico span:nth-child(4){animation-delay:.45s}'
      + '@keyframes bob{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-11px) rotate(5deg)}}'
      + 'h1{font-size:20px;margin:0 0 6px}p{margin:0;color:#5b6470;font-size:14px}'
      + '.bar{margin:18px auto 0;height:8px;width:260px;border-radius:99px;background:rgba(0,0,0,.07);overflow:hidden}'
      + '.fill{height:100%;width:35%;border-radius:99px;background:linear-gradient(90deg,#E33D48,#007CA2);'
      + 'animation:sweep 1.15s ease-in-out infinite}'
      + '.fill.det{animation:none;transition:width .2s ease}'
      + '@keyframes sweep{0%{margin-left:-40%}100%{margin-left:100%}}'
      + '.err{margin-top:16px;color:#b02a37;font-size:14px;display:none}'
      + '</style></head><body><div class="box">'
      + '<div class="ico"><span>📄</span><span>🎵</span><span>🎫</span><span>✨</span></div>'
      + '<h1>Generando documento…</h1>'
      + '<p id="st">Estamos preparándolo, tarda solo unos segundos.</p>'
      + '<div class="bar"><div class="fill" id="fl"></div></div>'
      + '<div class="err" id="er">No se pudo generar el documento. Cierra esta pestaña e inténtalo otra vez.</div>'
      + '</div></body></html>';
  }

  function setTabProgress(win, pct, label) {
    try {
      var fl = win.document.getElementById('fl');
      var st = win.document.getElementById('st');
      if (fl && pct != null) { fl.className = 'fill det'; fl.style.width = Math.max(3, Math.min(100, pct)) + '%'; }
      if (st && label) st.textContent = label;
    } catch (e) { /* la pestaña puede haberse cerrado */ }
  }

  function tabError(win) {
    try {
      var er = win.document.getElementById('er');
      var st = win.document.getElementById('st');
      if (er) er.style.display = 'block';
      if (st) st.textContent = '';
    } catch (e) { /* ignorada */ }
  }

  function filenameFromDisposition(value, fallback) {
    var name = '';
    if (value) {
      var m = /filename\*=UTF-8''([^;]+)/i.exec(value) || /filename="?([^";]+)"?/i.exec(value);
      if (m) { try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; } }
    }
    return name || fallback || 'documento';
  }

  function fetchDoc(url, onProgress, done, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.addEventListener('progress', function (e) {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100), e.loaded);
      else onProgress(null, e.loaded);
    });
    xhr.addEventListener('load', function () {
      var type = (xhr.getResponseHeader('Content-Type') || '');
      // Si no llega un documento (p. ej. un error devuelve HTML), no lo damos por bueno.
      if (xhr.status !== 200 || (type && !OK_TYPES_RE.test(type))) { fail(); return; }
      done(xhr.response, filenameFromDisposition(xhr.getResponseHeader('Content-Disposition'),
                                                 (url.split('/').pop() || 'documento').split('?')[0]));
    });
    xhr.addEventListener('error', fail);
    xhr.addEventListener('abort', fail);
    xhr.send();
  }

  function saveBlob(blob, filename) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} URL.revokeObjectURL(u); }, 2000);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!isDocLink(a)) return;

    var url = a.href;
    var newTab = a.target === '_blank';
    e.preventDefault();
    e.stopPropagation();     // que no salte también el iframe/loader de navegación del layout

    if (newTab) {
      // La pestaña se abre YA (si no, el navegador la bloquea) y muestra el aviso.
      var win = window.open('', '_blank');
      if (!win) { window.location.href = url; return; }     // bloqueada: fallback directo
      try { win.document.open(); win.document.write(pendingTabHtml()); win.document.close(); } catch (err) {}
      fetchDoc(url,
        function (pct) { setTabProgress(win, pct, pct != null ? 'Preparando el documento… ' + pct + '%' : null); },
        function (blob) {
          try { win.location.replace(URL.createObjectURL(blob)); }
          catch (err) { saveBlob(blob, 'documento'); try { win.close(); } catch (e2) {} }
        },
        function () { tabError(win); });
      return;
    }

    // Descarga normal: loader global de la app con su barra.
    var loader = window.appLoader;
    if (loader && loader.progress) loader.progress(4, 'Generando documento…');
    fetchDoc(url,
      function (pct) {
        if (!loader || !loader.progress) return;
        loader.progress(pct != null ? Math.max(4, pct) : 40,
                        pct != null ? 'Generando documento… ' + pct + '%' : 'Generando documento…');
      },
      function (blob, filename) {
        if (loader && loader.hide) loader.hide();
        saveBlob(blob, filename);
      },
      function () {
        if (loader && loader.hide) loader.hide();
        window.location.href = url;      // fallback: comportamiento de siempre
      });
  }, true);
})();
