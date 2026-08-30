/* AVISO DE CANCIÓN DUPLICADA (global, no-op si la pantalla no lo trae).
   Una canción con el MISMO nombre del MISMO artista casi siempre es la misma canción dada de alta
   dos veces (a mano y por un proyecto discográfico, por ejemplo). Antes de crear otra se avisa y se
   deja decidir: trabajar sobre la que ya está o crear una nueva a sabiendas.

   Cómo se engancha una pantalla — un contenedor con:
     data-song-dup                 (la zona del aviso; su HTML lo pinta este JS)
     data-dup-title="#selector"    campo del NOMBRE de la canción
     data-dup-artist="#selector"   campo del ARTISTA (un <select>, o un hidden)
     data-dup-exclude="#selector"  (opcional) canción que NO cuenta (al editar)
     data-dup-use="#selector"      (opcional) hidden donde dejar el id de la canción ELEGIDA:
                                   con él aparece el botón «Usar esta» (el asistente de proyecto
                                   trabaja sobre la que ya existe en vez de crear otra).
     data-dup-ok="#selector"       (opcional) hidden que se pone a 1 al aceptar crear otra igual.
   El formulario que la contiene no se envía mientras haya un duplicado sin decidir. */
(function () {
  var URL_DUP = '/api/canciones/duplicadas';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function val(zona, attr) {
    var sel = zona.getAttribute(attr);
    if (!sel) return null;
    // El campo puede estar fuera de la zona (el asistente los reparte por pasos): se busca en todo
    // el documento y, si no, dentro de la propia zona.
    return document.querySelector(sel) || zona.querySelector(sel);
  }
  function texto(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') return (el.value || '').trim();
    return (el.value || '').trim();
  }

  function pinta(zona, filas) {
    var usaHidden = val(zona, 'data-dup-use');
    var html = '';
    if (filas.length) {
      html += '<div class="alert alert-warning py-2 px-3 mb-0">';
      html += '<div class="fw-semibold mb-2"><i class="fa fa-triangle-exclamation me-1"></i>' +
              (filas.length === 1 ? 'Ya existe una canción con ese nombre de ese artista'
                                  : 'Ya existen canciones con ese nombre de ese artista') + '</div>';
      html += '<div class="d-flex flex-column gap-2">';
      filas.forEach(function (f) {
        html += '<div class="d-flex align-items-center gap-2 bg-white border rounded p-2">';
        html += f.cover_url
          ? '<img src="' + esc(f.cover_url) + '" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:6px;">'
          : '<span class="text-muted"><i class="fa fa-compact-disc fa-lg"></i></span>';
        html += '<div class="min-w-0 flex-grow-1">';
        html += '<div class="fw-semibold text-truncate">' + esc(f.title) + '</div>';
        var sub = [f.artist_name, f.release_label].filter(Boolean).join(' · ');
        html += '<div class="small text-muted text-truncate">' + esc(sub) + '</div>';
        if (f.is_provisional || f.project) {
          html += '<div class="mt-1 d-flex gap-1 flex-wrap">';
          if (f.is_provisional) html += '<span class="badge text-bg-warning text-dark">Provisional</span>';
          if (f.project) html += '<span class="badge text-bg-info">Proyecto: ' + esc(f.project.title) + '</span>';
          html += '</div>';
        }
        html += '</div>';
        html += '<div class="d-flex gap-1 flex-shrink-0">';
        if (usaHidden) {
          html += '<button type="button" class="btn btn-sm btn-primary" data-dup-pick="' + esc(f.id) + '">' +
                  '<i class="fa fa-check me-1"></i>Usar esta</button>';
        }
        if (f.url) {
          html += '<a class="btn btn-sm btn-outline-secondary" href="' + esc(f.url) + '" target="_blank" rel="noopener">' +
                  '<i class="fa fa-up-right-from-square me-1"></i>Abrirla</a>';
        }
        html += '</div></div>';
      });
      html += '</div>';
      html += '<div class="mt-2"><label class="small"><input type="checkbox" class="form-check-input me-1" data-dup-anyway>' +
              'No es la misma: crear una canción nueva de todas formas</label></div>';
      html += '</div>';
    }
    zona.innerHTML = html;
    zona.classList.toggle('d-none', !filas.length);
    sincroniza(zona);
  }

  // Estado del aviso: mientras haya duplicado y no se haya marcado «de todas formas», el formulario
  // no se envía (y su botón de enviar/siguiente se deshabilita para que se vea).
  function sincroniza(zona) {
    var hayDup = !!(zona._filas && zona._filas.length);
    var elegida = zona._elegida || '';
    var anyway = zona.querySelector('[data-dup-anyway]');
    var okOk = !hayDup || !!elegida || !!(anyway && anyway.checked);
    zona._resuelto = okOk;
    var hOk = val(zona, 'data-dup-ok');
    if (hOk) hOk.value = (hayDup && anyway && anyway.checked && !elegida) ? '1' : '';
    var hUse = val(zona, 'data-dup-use');
    if (hUse) hUse.value = elegida;
    var form = zona.closest('form');
    if (form) {
      // ⚠️ Un `<button>` SIN `type` dentro de un form ES de envío, y `[type="submit"]` no lo casa
      // (no tiene el atributo). Se mira la PROPIEDAD del DOM, que ahí sí dice «submit».
      form.querySelectorAll('button, input[type="submit"], [data-dup-guard]').forEach(function (b) {
        if (b.type === 'submit' || b.hasAttribute('data-dup-guard')) b.disabled = !okOk;
      });
    }
  }

  function consulta(zona) {
    var t = texto(val(zona, 'data-dup-title'));
    var a = texto(val(zona, 'data-dup-artist'));
    var ex = texto(val(zona, 'data-dup-exclude'));
    if (!t || !a) { zona._filas = []; zona._elegida = ''; pinta(zona, []); return; }
    var clave = t + '|' + a + '|' + ex;
    if (zona._clave === clave) return;      // ya preguntado: no se repite la consulta
    zona._clave = clave;
    var url = URL_DUP + '?title=' + encodeURIComponent(t) + '&artist_id=' + encodeURIComponent(a) +
              (ex ? '&exclude=' + encodeURIComponent(ex) : '');
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (zona._clave !== clave) return;   // llegó tarde: manda lo último que se escribió
        zona._filas = (d && d.rows) || [];
        zona._elegida = '';
        pinta(zona, zona._filas);
      })
      .catch(function () { zona._filas = []; pinta(zona, []); });
  }

  /* Si el aviso está en un PASO de un asistente que ahora no se ve, no basta con hacer scroll: hay
     que llevar a ese paso (`root.swGo` de step_wizard.js). Si no, el botón «Crear» no haría nada y
     no se vería por qué. */
  function llevaAlAviso(zona) {
    var paso = zona.closest('.sw-step');
    var root = zona.closest('[data-step-wizard]');
    if (paso && root && typeof root.swGo === 'function') {
      var pasos = [].slice.call(root.querySelectorAll('.sw-step'));
      pasos.sort(function (a, b) { return (+a.getAttribute('data-step')) - (+b.getAttribute('data-step')); });
      var i = pasos.indexOf(paso);
      if (i >= 0) root.swGo(i);
    }
    zona.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function engancha(zona) {
    if (zona.dataset.dupBound) return;
    zona.dataset.dupBound = '1';
    zona._filas = []; zona._elegida = ''; zona._clave = null; zona._resuelto = true;
    var temporizador = null;
    var pide = function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { consulta(zona); }, 300);
    };
    ['data-dup-title', 'data-dup-artist', 'data-dup-exclude'].forEach(function (attr) {
      var el = val(zona, attr);
      if (!el) return;
      el.addEventListener('input', pide);
      el.addEventListener('change', pide);
      // Los selectores de artista son Select2 (jQuery): su cambio no llega como evento nativo.
      try { if (window.jQuery) window.jQuery(el).on('change.songdup', pide); } catch (e) {}
    });
    zona.addEventListener('click', function (ev) {
      var pick = ev.target.closest('[data-dup-pick]');
      if (pick) {
        zona._elegida = pick.getAttribute('data-dup-pick') || '';
        zona.querySelectorAll('[data-dup-pick]').forEach(function (b) {
          var on = b === pick;
          b.classList.toggle('btn-primary', on);
          b.classList.toggle('btn-outline-primary', !on);
        });
        var anyway = zona.querySelector('[data-dup-anyway]');
        if (anyway) anyway.checked = false;
        sincroniza(zona);
      }
    });
    zona.addEventListener('change', function (ev) {
      if (ev.target.matches('[data-dup-anyway]')) {
        if (ev.target.checked) {
          zona._elegida = '';
          zona.querySelectorAll('[data-dup-pick]').forEach(function (b) {
            b.classList.remove('btn-primary'); b.classList.add('btn-outline-primary');
          });
        }
        sincroniza(zona);
      }
    });
    var form = zona.closest('form');
    if (form) {
      form.addEventListener('submit', function (ev) {
        if (zona._resuelto) return;
        ev.preventDefault();
        ev.stopPropagation();
        llevaAlAviso(zona);
      }, true);
    }
  }

  function init() { document.querySelectorAll('[data-song-dup]').forEach(engancha); }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  window.app33SongDupInit = init;   // para las zonas que llegan después (asistentes, AJAX)
})();
