/* LOGOS ADJUNTOS A UNA SOLICITUD DE CARTELERÍA (sep 2026, lo pidió Dani).
 *
 * El bloque lo pinta `templates/_artwork_logo_upload.html` (macro `artwork_logo_upload`) y está en
 * TODOS los sitios desde los que se piden carteles: el paso de cartelería del asistente de
 * actividad, la solicitud a diseño desde la ficha (el formulario y su pop-up), la solicitud al
 * promotor y la de «cartelería y fecha de anuncio». Por eso el JS es GLOBAL y va POR DELEGACIÓN en
 * `document` (regla de la casa: sobrevive a que una zona se repinte).
 *
 *   · [data-alogo-add]     añade una fila (archivo + nombre) y abre el selector de archivos.
 *   · [data-alogo-remove]  quita esa fila.
 *   · [data-alogo-delete]  quita un logo YA guardado (POST al endpoint que trae, y fuera la galleta).
 *   · al elegir archivos: el nombre del archivo (sin extensión) es el nombre del logo si no se ha
 *     escrito otro, y si se eligen VARIOS de golpe cada uno se va a su propia fila.
 *
 * ⚠️ Los `name` de los campos (`logo_file_<n>` / `logo_name_<n>`) se ponen aquí con un contador: el
 *    servidor los lee por PREFIJO (`_artwork_logos_save`), así que el orden da igual y una fila con
 *    varios archivos no despareja los nombres.
 * ⚠️ `app33SinArchivosDeLogos(fd)`: las vistas previas de los correos mandan el formulario entero
 *    en cada tecla; esto les quita los ARCHIVOS (subirlos veinte veces no tiene sentido) y deja los
 *    nombres, que es lo que la previa enseña.
 */
(function () {
  'use strict';
  var seq = 0;

  function stem(nombre) {
    return String(nombre || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }

  function nuevaFila(caja) {
    if (!caja) return null;
    var tpl = caja.querySelector('template[data-alogo-tpl]');
    var rows = caja.querySelector('[data-alogo-rows]');
    if (!tpl || !rows) return null;
    var frag = tpl.content.cloneNode(true);
    var row = frag.querySelector('[data-alogo-row]');
    if (!row) return null;
    seq += 1;
    var f = row.querySelector('[data-alogo-file]');
    var n = row.querySelector('[data-alogo-name]');
    if (f) f.name = 'logo_file_' + seq;
    if (n) n.name = 'logo_name_' + seq;
    rows.appendChild(frag);
    return row;
  }

  function ponNombre(row, file) {
    var n = row && row.querySelector('[data-alogo-name]');
    if (n && file && !n.value.trim()) n.value = stem(file.name).slice(0, 120);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var add = t.closest('[data-alogo-add]');
    if (add) {
      e.preventDefault();
      var row = nuevaFila(add.closest('[data-alogos]'));
      var f = row && row.querySelector('[data-alogo-file]');
      // Un clic = elegir el archivo: la fila ya está puesta y el nombre se rellena solo.
      if (f) { try { f.click(); } catch (err) {} }
      return;
    }
    var rm = t.closest('[data-alogo-remove]');
    if (rm) {
      e.preventDefault();
      var fila = rm.closest('[data-alogo-row]');
      if (fila) fila.remove();
      return;
    }
    var del = t.closest('[data-alogo-delete]');
    if (del) {
      e.preventDefault();
      var url = del.getAttribute('data-alogo-delete');
      if (!url) return;
      if (!confirm('¿Quitar este logo de la solicitud?')) return;
      del.disabled = true;
      // `csrf.js` añade el token a los fetch del mismo origen.
      fetch(url, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d || {} }; }); })
        .then(function (res) {
          if (res.ok && res.d.ok !== false) {
            var chip = del.closest('.alogo-chip');
            if (chip) chip.remove();
            return;
          }
          del.disabled = false;
          alert(res.d.error || 'No se pudo quitar el logo.');
        })
        .catch(function () { del.disabled = false; alert('No se pudo quitar el logo.'); });
    }
  });

  document.addEventListener('change', function (e) {
    var f = e.target && e.target.closest && e.target.closest('[data-alogo-file]');
    if (!f) return;
    var row = f.closest('[data-alogo-row]');
    var caja = f.closest('[data-alogos]');
    var files = Array.prototype.slice.call(f.files || []);
    if (!files.length || !row) return;
    /* VARIOS ARCHIVOS DE GOLPE: cada uno a su fila, con su nombre. Si el navegador no deja repartir
       (`DataTransfer`), se quedan todos en esta fila y el servidor les pone el nombre de su archivo. */
    if (files.length > 1 && window.DataTransfer) {
      try {
        files.slice(1).forEach(function (file) {
          var r2 = nuevaFila(caja);
          if (!r2) return;
          var f2 = r2.querySelector('[data-alogo-file]');
          var dt = new DataTransfer(); dt.items.add(file); f2.files = dt.files;
          ponNombre(r2, file);
        });
        var dt0 = new DataTransfer(); dt0.items.add(files[0]); f.files = dt0.files;
      } catch (err) { /* se quedan todos en esta fila */ }
    }
    ponNombre(row, files[0]);
  });

  window.app33SinArchivosDeLogos = function (fd) {
    try {
      Array.from(fd.keys()).forEach(function (k) { if (String(k).indexOf('logo_file_') === 0) fd.delete(k); });
    } catch (err) {}
    return fd;
  };
})();
