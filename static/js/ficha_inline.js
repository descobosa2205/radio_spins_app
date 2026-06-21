/* Edición inline por sección para fichas (canción / álbum / artista).

   Genérico y autónomo. Se carga SOLO en esas fichas vía {% block scripts %} (NO en la de concierto,
   que usa su propio concert_form.js), de modo que no hay doble manejo del toggle.

   Patrón (idéntico al de concierto):
     <div class="ficha-section">
       <div class="ficha-section__head">… <button data-edit-toggle>Editar</button></div>
       <div class="ficha-section__body" data-section-view> … vista de solo lectura … </div>
       <form class="ficha-section__body d-none" data-section-form data-inline data-inline-target="#zona">
         … campos … <button data-edit-cancel>Cancelar</button> <button>Guardar</button>
       </form>
     </div>

   - [data-edit-toggle]  (sin valor) muestra el [data-section-form] de SU .ficha-section.
   - [data-edit-toggle="#id"] muestra ese form concreto (por si hace falta apuntar por id).
   - [data-edit-cancel] vuelve a la vista.
   El guardado lo hace ajax_inline.js (data-inline + data-inline-target → reemplaza la zona sin recargar).
*/
(function () {
  'use strict';

  function viewFor(form) {
    // Caso 0: selector de vista explícito en el form (p. ej. el "Datos" del concierto, cuya vista
    // es [data-datos-view] y no encaja en los casos por contenedor).
    var explicit = form.getAttribute('data-view');
    if (explicit) { var ve = document.querySelector(explicit); if (ve) return ve; }
    // Caso 1: form dentro de una .ficha-section (su vista hermana).
    var s = form.closest('.ficha-section');
    if (s) { var v = s.querySelector('[data-section-view]'); if (v) return v; }
    // Caso 2: form y vista como hermanos dentro de una zona [data-inline-zone].
    var z = form.closest('[data-inline-zone]');
    if (z) { var v2 = z.querySelector('[data-section-view]'); if (v2) return v2; }
    return null;
  }

  // Elementos que solo deben verse en modo edición de un form concreto: [data-edit-only="#formId"].
  // (p. ej. el botón "Eliminar" de canción/álbum, que aparece solo al editar la Información.)
  function setEditOnly(form, visible) {
    if (!form || !form.id) return;
    document.querySelectorAll('[data-edit-only="#' + form.id + '"]').forEach(function (el) {
      el.classList.toggle('d-none', !visible);
    });
  }

  function show(form) {
    if (!form) return;
    form.classList.remove('d-none');
    var v = viewFor(form);
    if (v) v.classList.add('d-none');
    setEditOnly(form, true);
    try { if (window.initSelect2) window.initSelect2(); } catch (e) {}
    // Aviso para inicializadores específicos de cada ficha (p. ej. concert_form.js: sale_type+tags,
    // rehidratación de filas). Quien lo necesite escucha "ficha:shown".
    try { document.dispatchEvent(new CustomEvent('ficha:shown', { detail: { form: form } })); } catch (e) {}
    try { form.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  }

  function hide(form) {
    if (!form) return;
    form.classList.add('d-none');
    var v = viewFor(form);
    if (v) v.classList.remove('d-none');
    setEditOnly(form, false);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit-toggle]');
    if (t) {
      e.preventDefault();
      var sel = t.getAttribute('data-edit-toggle');
      var form = sel ? document.querySelector(sel)
        : (function () { var s = t.closest('.ficha-section'); return s ? s.querySelector('[data-section-form]') : null; })();
      show(form);
      return;
    }
    var c = e.target.closest('[data-edit-cancel]');
    if (c) {
      e.preventDefault();
      var csel = c.getAttribute('data-edit-cancel');
      var cform = csel ? document.querySelector(csel) : (c.closest('[data-section-form]') || c.closest('form'));
      hide(cform);
    }
  });
})();
