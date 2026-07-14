/* Arrastrar y SOLTAR archivos en toda la app (global, sin dependencias).
 *
 * Cualquier <input type="file"> acepta ficheros arrastrados desde el sistema: sobre el propio
 * input, sobre su zona anotada ([data-file-drop-for]) o sobre su contenedor (modal/formulario)
 * cuando ahí solo hay UN input de fichero (sin ambigüedad). Al soltar se asignan los ficheros al
 * input (filtrados por `accept` y `multiple`) y se dispara un evento `change` normal, así TODOS
 * los flujos existentes (submit clásico, listeners change, XHR con barra de progreso, alta
 * rápida, ajax_inline…) funcionan sin tocarse.
 *
 * Convivencia con el drag&drop INTERNO de la app (solicitudes entre categorías, gastos de bolsa/
 * simulador, herramientas del plano, reordenación de fotos, hoja de ruta…): esos arrastres llevan
 * setData('text/plain'/'text/html'), así que aquí solo se actúa cuando el arrastre es de FICHEROS
 * del sistema (types incluye 'Files' y ningún tipo de texto). Además, al arrastrar ficheros se
 * hace preventDefault global: soltar fuera de una zona ya NO navega al fichero (antes se perdía
 * la página con lo que hubiera a medias).
 *
 * Exclusiones: [data-file-drop="off"] (zonas con drop propio, p. ej. la galería de Fotos),
 * inputs webkitdirectory (carpetas) e inputs deshabilitados o dentro de paneles ocultos.
 * Se carga en layout.html y en las páginas públicas standalone con subida de archivos.
 */
(function () {
  'use strict';

  /* ---- estilos autocontenidos (valen también en páginas públicas sin styles.css) ---- */
  try {
    var st = document.createElement('style');
    st.textContent =
      '.file-drop-hover{outline:2px dashed #E33D48 !important;outline-offset:-2px;' +
      'background-color:rgba(227,61,72,.06) !important;border-radius:.5rem;}' +
      '.file-drop-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'background:#212529;color:#fff;padding:.55rem 1rem;border-radius:10px;font-size:.9rem;' +
      'z-index:2147483000;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:0;transition:opacity .2s;' +
      'pointer-events:none;max-width:92vw;text-align:center;}' +
      '.file-drop-toast.show{opacity:1;}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    try {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'file-drop-toast';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3800);
    } catch (e) {}
  }

  /* Solo arrastres de FICHEROS del sistema. Los drags internos ponen text/plain (u otros tipos de
     texto) en dataTransfer, y arrastrar una <img> de la página añade text/uri-list: todos fuera. */
  function isFileDrag(e) {
    var t = e.dataTransfer && e.dataTransfer.types;
    if (!t) return false;
    var hasFiles = false;
    for (var i = 0; i < t.length; i++) {
      if (t[i] === 'Files') hasFiles = true;
      if (t[i] === 'text/plain' || t[i] === 'text/html' || t[i] === 'text/uri-list') return false;
    }
    return hasFiles;
  }

  function usable(input) {
    // Debe ser un input file de verdad (protege la rama data-file-drop-for con selector erróneo).
    if (!input || !input.matches || !input.matches('input[type="file"]') || input.disabled) return false;
    if (input.hasAttribute('webkitdirectory')) return false;      // carpetas: no se pueden asignar por drop
    if (input.closest('[data-file-drop="off"]')) return false;    // zonas con drop propio
    var parent = input.parentElement || input;
    if (parent.getClientRects().length > 0) return true;          // el padre se ve (aunque el input vaya oculto)
    return !!input.closest('.collapse');                          // en un collapse cerrado: se abre al soltar
  }

  function usableIn(root) {
    var out = [];
    if (!root || !root.querySelectorAll) return out;
    var list = root.querySelectorAll('input[type="file"]');
    for (var i = 0; i < list.length; i++) if (usable(list[i])) out.push(list[i]);
    return out;
  }

  /* Resuelve el input destino para el elemento bajo el cursor:
     1) zona anotada [data-file-drop-for] (con selector opcional),
     2) el propio input,
     3) subiendo por los ancestros, el primero que contenga EXACTAMENTE un input utilizable
        (límite: el modal o form contenedor; sin ellos, un halo de 2 niveles). Con varios inputs
        en el mismo contenedor hay que soltar más cerca del campo concreto. */
  function resolve(el) {
    if (!el || el.nodeType !== 1 || !el.closest) return null;
    if (el.closest('[data-file-drop="off"]')) return null;
    var z = el.closest('[data-file-drop-for]');
    if (z) {
      var sel = z.getAttribute('data-file-drop-for');
      var tgt = null;
      if (sel) { try { tgt = document.querySelector(sel); } catch (e) { tgt = null; } }
      if (!tgt) { var zi = usableIn(z); tgt = (zi.length === 1) ? zi[0] : null; }
      if (tgt && usable(tgt)) return { input: tgt, zone: z };
    }
    if (el.matches && el.matches('input[type="file"]') && usable(el)) return { input: el, zone: el };
    var stop = el.closest('.modal-content') || el.closest('form');
    var cur = el;
    var ups = 0;
    while (cur && cur !== document.body && cur !== document.documentElement && cur.nodeType === 1) {
      var ins = usableIn(cur);
      if (ins.length === 1) return { input: ins[0], zone: cur };
      if (ins.length > 1) return null;   // ambiguo aquí (y lo será en todos los ancestros)
      if (stop) { if (cur === stop) return null; }
      else if (ups >= 2) return null;    // sin form/modal: halo pequeño (labels-botón, celdas…)
      cur = cur.parentElement;
      ups++;
    }
    return null;
  }

  function acceptList(input) {
    return (input.getAttribute('accept') || '')
      .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }
  function matchesAccept(f, acc) {
    if (!acc.length) return true;
    var name = (f.name || '').toLowerCase();
    var type = (f.type || '').toLowerCase();
    for (var i = 0; i < acc.length; i++) {
      var a = acc[i];
      if (a.charAt(0) === '.') { if (name.length >= a.length && name.slice(-a.length) === a) return true; }
      else if (a.slice(-2) === '/*') { if (type.indexOf(a.slice(0, -1)) === 0) return true; }
      else if (type === a) return true;
    }
    return false;
  }

  function assign(input, fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) files.push(fileList[i]);
    var acc = acceptList(input);
    var ok = files.filter(function (f) { return matchesAccept(f, acc); });
    var rejected = files.length - ok.length;
    if (!ok.length) {
      toast('Ese tipo de archivo no vale aquí' + (acc.length ? ' (admite: ' + acc.join(', ') + ')' : '') + '.');
      return;
    }
    var truncated = false;
    if (!input.multiple && ok.length > 1) { ok = ok.slice(0, 1); truncated = true; }
    try {
      var dt = new DataTransfer();
      for (var j = 0; j < ok.length; j++) dt.items.add(ok[j]);
      input.files = dt.files;
    } catch (e) {
      // Navegador sin DataTransfer(): solo se puede asignar el arrastre tal cual.
      if (rejected || (!input.multiple && files.length > 1)) {
        toast('Tu navegador no permite filtrar el arrastre: selecciona el archivo con el botón.');
        return;
      }
      try { input.files = fileList; } catch (e2) { return; }
    }
    // Campo dentro de un collapse cerrado (p. ej. «Reemplazar PDF» de una entrada): se muestra.
    var col = input.closest('.collapse');
    if (col && !col.classList.contains('show')) col.classList.add('show');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (truncated) toast('Aquí solo cabe un archivo: se ha usado «' + ok[0].name + '». Suelta cada archivo sobre su campo.');
    else if (rejected) toast(rejected + ' archivo(s) descartado(s) por tipo no admitido; el resto, añadido.');
    else if (input.getClientRects().length === 0) {
      // Input oculto (botones tipo «Subir factura», adjuntos de hoja de ruta…): confirmación visible.
      toast(ok.length === 1 ? ('«' + ok[0].name + '» añadido.') : (ok.length + ' archivos añadidos.'));
    }
  }

  var curZone = null;
  var clearTimer = null;
  function setZone(z) {
    if (curZone === z) return;
    if (curZone && curZone.classList) curZone.classList.remove('file-drop-hover');
    curZone = z;
    if (curZone && curZone.classList) curZone.classList.add('file-drop-hover');
  }

  // Memoización por elemento: los dragover llegan a ~60 Hz repitiendo el mismo target y resolve()
  // recorre ancestros con querySelectorAll — sin caché, en páginas grandes (invitaciones, asignador)
  // el arrastre iría a tirones.
  var lastEl = null, lastRes = null;
  function resolveCached(el) {
    if (el === lastEl) return lastRes;
    lastEl = el;
    lastRes = resolve(el);
    return lastRes;
  }
  function resetState() { setZone(null); lastEl = null; lastRes = null; }

  // Los input de CARPETA (webkitdirectory) tienen drop nativo del navegador: no interferir.
  function overDirInput(e) {
    return !!(e.target.closest && e.target.closest('input[type="file"][webkitdirectory]:not([disabled])'));
  }

  document.addEventListener('dragover', function (e) {
    if (!isFileDrag(e)) return;
    // Si otro handler ya aceptó este arrastre (p. ej. la dropzone propia de Fotos), estamos en una
    // zona excluida o sobre un input de carpeta (drop nativo), NO tocar dropEffect: ponerlo a
    // 'none' cancelaría SU drop (regresión verificada).
    if (e.defaultPrevented || overDirInput(e) || (e.target.closest && e.target.closest('[data-file-drop="off"]'))) { setZone(null); return; }
    e.preventDefault();   // permite soltar en zonas y evita que el navegador navegue al fichero
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    var r = resolveCached(e.target);
    setZone(r ? r.zone : null);
    try { e.dataTransfer.dropEffect = r ? 'copy' : 'none'; } catch (err) {}
  });
  document.addEventListener('dragleave', function (e) {
    // En WebKit relatedTarget también es null cruzando entre elementos: limpiar con retardo corto
    // (el siguiente dragover lo cancela) para que el resaltado no parpadee; salir de la ventana de
    // verdad no genera más dragover y el timer limpia.
    if (!e.relatedTarget) {
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(resetState, 150);
    }
  });
  document.addEventListener('dragend', resetState);
  document.addEventListener('drop', function (e) {
    if (e.defaultPrevented) { resetState(); return; }   // lo ha gestionado una dropzone propia
    if (overDirInput(e)) { resetState(); return; }      // drop NATIVO de carpeta: lo hace el navegador
    // Verdad terreno en el drop: hay FICHEROS reales (algunos gestores de archivos añaden
    // text/uri-list y la heurística de dragover los excluiría). Se sigue excluyendo text/html
    // (arrastre de una <img> de la propia página).
    var files = e.dataTransfer && e.dataTransfer.files;
    var types = (e.dataTransfer && e.dataTransfer.types) || [];
    var isHtmlDrag = false;
    for (var i = 0; i < types.length; i++) if (types[i] === 'text/html') isHtmlDrag = true;
    if (!files || !files.length || isHtmlDrag) { resetState(); return; }
    e.preventDefault();   // nunca navegar al fichero soltado
    var r = resolveCached(e.target);
    resetState();
    if (!r) return;
    // Filtrar CARPETAS (llegan como pseudo-File sin tipo y no se pueden subir): con la API de
    // entries se detectan; si todo eran carpetas, aviso claro. items solo vive durante el evento.
    var list = [];
    var items = e.dataTransfer.items;
    var checked = false;
    if (items && items.length === files.length) {
      try {
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          var entry = (it.kind === 'file' && it.webkitGetAsEntry) ? it.webkitGetAsEntry() : null;
          if (!entry || entry.isFile) list.push(files[j]);
        }
        checked = true;
      } catch (err) { checked = false; }
    }
    if (!checked) { list = []; for (var k = 0; k < files.length; k++) list.push(files[k]); }
    if (!list.length) {
      toast('Las carpetas no se pueden arrastrar aquí: suelta archivos (o usa el campo de carpeta si existe).');
      return;
    }
    assign(r.input, list);
  });
})();
