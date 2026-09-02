/* =========================================================================
   BARRA DE DESCARGA · NO BLOQUEA LA PANTALLA.

   El problema que resuelve: un documento que el servidor GENERA al vuelo (un
   ZIP de carteles, un PDF, un Excel) tarda unos segundos en empezar a llegar.
   Hasta ahora eso se tapaba con el loader global —que es un velo a pantalla
   completa— o con nada en absoluto: se pinchaba «Descargar todos», no pasaba
   nada visible y un rato después se abría el diálogo de guardar.

   Aquí la descarga se ve en una TARJETA abajo a la derecha con su barra, su
   porcentaje y su botón de cancelar, y **se puede seguir trabajando** mientras
   tanto (nada de velos ni de clics bloqueados).

   Cómo se usa:
   · `window.app33Download.get(url, {name: 'Carteles.zip'})` desde cualquier JS.
   · O marcando el enlace con `data-dl-bar` (se intercepta su clic).
   Si algo falla se dice en la propia tarjeta y se ofrece el enlace de siempre,
   así nadie se queda sin su fichero.

   Es AUTOCONTENIDO (se pinta su propio CSS) a propósito: lo usan también las
   páginas públicas, que son standalone y no cargan styles.css.
   ========================================================================= */
(function () {
  'use strict';
  if (window.app33Download) return;

  var CSS = ''
    + '.dlbar{position:fixed;right:16px;bottom:16px;z-index:2147482000;display:flex;'
    + 'flex-direction:column;gap:10px;pointer-events:none;max-width:min(360px,calc(100vw - 32px))}'
    + '.dlbar__item{pointer-events:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;'
    + 'box-shadow:0 12px 34px rgba(15,23,42,.18);padding:11px 13px;display:flex;gap:11px;'
    + 'align-items:flex-start;font:400 13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'
    + 'color:#111827;animation:dlbarIn .18s ease}'
    + '@keyframes dlbarIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
    + '.dlbar__item.is-out{opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s}'
    + '.dlbar__ico{flex:0 0 30px;height:30px;border-radius:9px;display:grid;place-items:center;'
    + 'background:rgba(0,124,162,.10);color:#007CA2;font-size:14px}'
    + '.dlbar__item.is-err .dlbar__ico{background:rgba(227,61,72,.10);color:#E33D48}'
    + '.dlbar__b{min-width:0;flex:1 1 auto}'
    + '.dlbar__name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.dlbar__st{color:#6b7280;font-size:12px;margin-top:1px}'
    + '.dlbar__item.is-err .dlbar__st{color:#b02a37}'
    + '.dlbar__bar{margin-top:7px;height:6px;border-radius:99px;background:#e7ecf2;overflow:hidden;position:relative}'
    + '.dlbar__fill{position:absolute;top:0;bottom:0;left:0;width:38%;border-radius:99px;'
    + 'background:linear-gradient(90deg,#E33D48,#007CA2);animation:dlbarSweep 1.15s ease-in-out infinite}'
    + '.dlbar__bar.is-det .dlbar__fill{animation:none;transition:width .18s ease}'
    + '@keyframes dlbarSweep{0%{margin-left:-45%}100%{margin-left:100%}}'
    + '.dlbar__x{flex:0 0 auto;background:none;border:0;color:#9aa3ad;font-size:13px;cursor:pointer;'
    + 'padding:2px 4px;line-height:1}'
    + '.dlbar__x:hover{color:#111827}'
    + '.dlbar__again{display:inline-block;margin-top:5px;font-size:12px;font-weight:700;color:#E33D48}'
    + '@media (max-width:600px){.dlbar{left:12px;right:12px;bottom:12px;max-width:none}}'
    + '@media (prefers-reduced-motion:reduce){.dlbar__fill{animation:none}}';

  var cajón = null;

  function estilos() {
    if (document.getElementById('dlbarCss')) return;
    var st = document.createElement('style');
    st.id = 'dlbarCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function contenedor() {
    estilos();
    if (cajón && cajón.isConnected) return cajón;
    cajón = document.createElement('div');
    cajón.className = 'dlbar';
    cajón.setAttribute('aria-live', 'polite');
    (document.body || document.documentElement).appendChild(cajón);
    return cajón;
  }

  function humano(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function icono(nombre) {
    var n = (nombre || '').toLowerCase();
    if (/\.zip(\?|$)/.test(n)) return 'fa-file-zipper';
    if (/\.pdf(\?|$)/.test(n)) return 'fa-file-pdf';
    if (/\.(xlsx?|csv)(\?|$)/.test(n)) return 'fa-file-excel';
    if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(n)) return 'fa-film';
    if (/\.(mp3|wav|m4a|aac|flac)(\?|$)/.test(n)) return 'fa-music';
    if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(n)) return 'fa-image';
    return 'fa-download';
  }

  function tarjeta(nombre) {
    var el = document.createElement('div');
    el.className = 'dlbar__item';
    el.innerHTML = '<span class="dlbar__ico"><i class="fa ' + icono(nombre) + '"></i></span>'
      + '<span class="dlbar__b"><span class="dlbar__name"></span>'
      + '<span class="dlbar__st">Preparándolo…</span>'
      + '<span class="dlbar__bar"><span class="dlbar__fill"></span></span></span>'
      + '<button type="button" class="dlbar__x" title="Cancelar"><i class="fa fa-xmark"></i></button>';
    el.querySelector('.dlbar__name').textContent = nombre || 'Descarga';
    contenedor().appendChild(el);
    return el;
  }

  function quitar(el, ms) {
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 280);
    }, ms || 0);
  }

  function nombreDeUrl(url) {
    try {
      var p = (url || '').split('?')[0].split('#')[0].split('/');
      return decodeURIComponent(p[p.length - 1] || '') || 'documento';
    } catch (e) { return 'documento'; }
  }

  function nombreDeCabecera(valor, respaldo) {
    var n = '';
    if (valor) {
      var m = /filename\*=UTF-8''([^;]+)/i.exec(valor) || /filename="?([^";]+)"?/i.exec(valor);
      if (m) { try { n = decodeURIComponent(m[1]); } catch (e) { n = m[1]; } }
    }
    return n || respaldo || 'documento';
  }

  function guardar(blob, nombre) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = nombre || 'documento';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (e) {}
      URL.revokeObjectURL(u);
    }, 2000);
  }

  /* Descarga `url` enseñando su tarjeta. Devuelve el XHR (por si hay que abortarlo). */
  function get(url, opciones) {
    var op = opciones || {};
    var nombre = op.name || nombreDeUrl(url);
    var el = tarjeta(nombre);
    var st = el.querySelector('.dlbar__st');
    var barra = el.querySelector('.dlbar__bar');
    var relleno = el.querySelector('.dlbar__fill');
    var xhr = new XMLHttpRequest();
    var cancelado = false;

    el.querySelector('.dlbar__x').addEventListener('click', function () {
      cancelado = true;
      try { xhr.abort(); } catch (e) {}
      quitar(el);
    });

    function fallo(motivo) {
      if (cancelado) return;
      el.classList.add('is-err');
      barra.style.display = 'none';
      st.textContent = motivo || 'No se pudo descargar.';
      var a = document.createElement('a');
      a.className = 'dlbar__again';
      a.href = url;
      a.textContent = 'Abrirlo en el navegador';
      a.setAttribute('data-no-doc-loader', '1');
      st.parentNode.appendChild(a);
      quitar(el, 20000);
    }

    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.addEventListener('progress', function (e) {
      if (e.lengthComputable && e.total > 0) {
        var pct = Math.max(2, Math.round(e.loaded * 100 / e.total));
        barra.classList.add('is-det');
        relleno.style.width = pct + '%';
        st.textContent = 'Descargando… ' + pct + '% · ' + humano(e.total);
      } else {
        st.textContent = 'Descargando… ' + humano(e.loaded);
      }
    });
    xhr.addEventListener('load', function () {
      if (cancelado) return;
      if (xhr.status !== 200 || !xhr.response) { fallo(); return; }
      var tipo = (xhr.getResponseHeader('Content-Type') || '');
      // Si llega HTML es que el servidor ha devuelto un error o la pantalla de acceso: no se da
      // por bueno (si no, se guardaría un «documento» que es una página).
      if (/text\/html/i.test(tipo)) { fallo('No se pudo generar el documento.'); return; }
      // ⚠️ Y si contesta un MOTIVO (JSON), se enseña ESE en vez de un error genérico: los endpoints
      // que no tienen nada que dar responden `{ok:false, error:"…"}` (antes hacían flash+redirect y
      // el motivo se perdía dentro del XHR: «No hay carteles aprobados que descargar» no se veía).
      if (/application\/json/i.test(tipo)) {
        var motivo = '';
        try {
          var fr = new FileReader();
          fr.onload = function () {
            try { motivo = (JSON.parse(fr.result || '{}') || {}).error || ''; } catch (e2) {}
            fallo(motivo || 'No se pudo generar el documento.');
          };
          fr.onerror = function () { fallo('No se pudo generar el documento.'); };
          fr.readAsText(xhr.response);
        } catch (e) { fallo('No se pudo generar el documento.'); }
        return;
      }
      var fin = nombreDeCabecera(xhr.getResponseHeader('Content-Disposition'), nombre);
      barra.classList.add('is-det');
      relleno.style.width = '100%';
      st.textContent = 'Listo · ' + humano(xhr.response.size);
      el.querySelector('.dlbar__x').title = 'Cerrar';
      guardar(xhr.response, fin);
      quitar(el, 3200);
    });
    xhr.addEventListener('error', function () { fallo(); });
    xhr.addEventListener('timeout', function () { fallo('Ha tardado demasiado.'); });
    try { xhr.send(); } catch (e) { fallo(); }
    return xhr;
  }

  window.app33Download = { get: get, save: guardar };

  /* Enlaces marcados a mano: `data-dl-bar` (y `data-dl-name` para el nombre del fichero). */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var a = e.target.closest ? e.target.closest('a[data-dl-bar]') : null;
    if (!a || !a.getAttribute('href')) return;
    if (a.host && a.host !== location.host) return;      // fuera de casa: que navegue
    e.preventDefault();
    // ⚠️ `stopImmediatePropagation`, no `stopPropagation`: `doc_download.js` escucha el clic en
    // captura sobre el MISMO nodo (`document`), y con `stopPropagation` a secas se ejecutaría
    // también → dos descargas, dos tarjetas y dos ficheros guardados.
    e.stopImmediatePropagation();
    e.stopPropagation();
    get(a.href, { name: a.getAttribute('data-dl-name') || '' });
  }, true);
})();
