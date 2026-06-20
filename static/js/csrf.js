/* Protección CSRF en el cliente (acompaña a Flask-WTF en el servidor).

   Lee el token del <meta name="csrf-token"> que pone el layout y, de forma automática:
   - añade un campo oculto `csrf_token` a todos los formularios POST (al cargar la página, a los
     formularios insertados después por JS, y como red de seguridad justo antes de enviar);
   - manda el token en la cabecera `X-CSRFToken` en todas las peticiones `fetch` que modifican datos.

   Así no hay que tocar uno por uno los ~300 formularios ni las llamadas AJAX de la app.
*/
(function () {
  'use strict';

  var FIELD = 'csrf_token';

  function token() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? (m.getAttribute('content') || '') : '';
  }

  function isPostForm(form) {
    return (form.getAttribute('method') || 'get').toLowerCase() === 'post';
  }

  function ensureField(form) {
    if (!form || form.tagName !== 'FORM' || !isPostForm(form)) return;
    if (form.querySelector('input[name="' + FIELD + '"]')) return;
    var t = token();
    if (!t) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = FIELD;
    input.value = t;
    form.appendChild(input);
  }

  function scan(root) {
    try { (root || document).querySelectorAll('form').forEach(ensureField); } catch (e) {}
  }

  // 1) Formularios presentes al cargar la página.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(document); });
  } else {
    scan(document);
  }

  // 2) Formularios insertados después (modales de alta rápida, zonas refrescadas por AJAX, paneles…).
  //    Necesario porque varios envíos se hacen con form.submit() (programático), que NO dispara el
  //    evento submit, así que el token debe estar ya en el DOM.
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'FORM') ensureField(n);
          else if (n.querySelectorAll) scan(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // 3) Red de seguridad: en captura, antes que cualquier otro manejador (p. ej. ajax_inline).
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.tagName === 'FORM') ensureField(e.target);
  }, true);

  // 4) Cabecera X-CSRFToken en las peticiones fetch que modifican datos (solo mismo origen).
  if (window.fetch) {
    var _fetch = window.fetch;
    var SAFE = { GET: 1, HEAD: 1, OPTIONS: 1, TRACE: 1 };
    window.fetch = function (input, init) {
      try {
        init = init || {};
        var method = (init.method || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
        if (!SAFE[method]) {
          var url = (typeof input === 'string') ? input : (input && input.url) || '';
          var crossOrigin = /^https?:\/\//i.test(url) && url.indexOf(window.location.origin) !== 0;
          if (!crossOrigin) {
            var headers = new Headers(init.headers || (input && typeof input === 'object' && input.headers) || {});
            if (!headers.has('X-CSRFToken')) headers.set('X-CSRFToken', token());
            init.headers = headers;
          }
        }
      } catch (e) {}
      return _fetch.call(this, input, init);
    };
  }
})();
