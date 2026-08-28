/* ============================================================================================
   ACTUALIZACIÓN DE DATOS EN BLOQUE desde los LABEL COPY en PDF.

   Tres pasos: los PDF → una canción cada vez (a la IZQUIERDA lo que dice el LC, a la DERECHA lo
   que hay ahora, y se marca lo que se queda) → el resumen.

   ⚠️ Lo que se puede VINCULAR (autores, su editorial, intérpretes) no se guarda como texto: se
   elige a quién corresponde entre las coincidencias —con su foto— o se crea al vuelo. Un nombre
   escrito en un PDF no puede decidir por su cuenta a qué ficha apunta.
   ============================================================================================ */
(function () {
  'use strict';

  var modalEl = document.getElementById('lcBulkModal');
  if (!modalEl || !window.LC_BULK) return;

  var cfg = window.LC_BULK;
  var $ = function (sel, raiz) { return (raiz || modalEl).querySelector(sel); };
  var $$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || modalEl).querySelectorAll(sel)); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  };

  var ficheros = [];
  var canciones = [];
  var idx = 0;
  var resultados = [];

  // ---------------------------------------------------------------- pasos
  function paso(n) {
    $$('[data-lc-step]').forEach(function (z) {
      z.classList.toggle('d-none', z.getAttribute('data-lc-step') !== String(n));
    });
    $('[data-lc-analyze]').classList.toggle('d-none', n !== 1 || !ficheros.length);
    $('[data-lc-save]').classList.toggle('d-none', n !== 2);
  }

  function msg(txt, clase) {
    var z = $('[data-lc-msg]');
    z.className = 'small mt-2 ' + (clase || 'text-muted');
    z.textContent = txt || '';
  }

  // ---------------------------------------------------------------- 1 · los PDF
  function pintaFicheros() {
    var ul = $('[data-lc-files]');
    ul.innerHTML = ficheros.map(function (f, i) {
      return '<li><i class="fa fa-file-pdf"></i><span class="lc-files__n">' + esc(f.name) + '</span>' +
             '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-auto" data-lc-del="' + i + '">' +
             '<i class="fa fa-xmark"></i></button></li>';
    }).join('');
    $('[data-lc-analyze]').classList.toggle('d-none', !ficheros.length);
    msg(ficheros.length ? (ficheros.length + (ficheros.length === 1 ? ' PDF listo' : ' PDF listos')) : '');
  }

  function añade(lista) {
    Array.prototype.forEach.call(lista || [], function (f) {
      if (!f) return;
      if (!/\.pdf$/i.test(f.name || '')) return;
      if (ficheros.some(function (x) { return x.name === f.name && x.size === f.size; })) return;
      ficheros.push(f);
    });
    pintaFicheros();
  }

  $('#lcBulkFiles').addEventListener('change', function (ev) { añade(ev.target.files); ev.target.value = ''; });
  var drop = $('[data-lc-drop]');
  ['dragenter', 'dragover'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (ev) {
    if (ev.dataTransfer && ev.dataTransfer.files) añade(ev.dataTransfer.files);
  });
  modalEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-lc-del]');
    if (!b) return;
    ficheros.splice(parseInt(b.getAttribute('data-lc-del'), 10), 1);
    pintaFicheros();
  });

  $('[data-lc-analyze]').addEventListener('click', function () {
    if (!ficheros.length) return;
    var fd = new FormData();
    ficheros.forEach(function (f) { fd.append('files', f); });
    var b = $('[data-lc-analyze]');
    b.disabled = true;
    msg('Leyendo los Label Copy…');
    fetch(cfg.analizar, { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (js) {
        b.disabled = false;
        if (!js || !js.ok) { msg((js && js.error) || 'No se ha podido leer.', 'text-danger'); return; }
        canciones = js.songs || [];
        if (!canciones.length) { msg('No se ha encontrado ninguna canción en esos PDF.', 'text-danger'); return; }
        var av = $('[data-lc-warnings]');
        av.classList.toggle('d-none', !(js.warnings || []).length);
        av.innerHTML = (js.warnings || []).map(esc).join('<br>');
        idx = 0; resultados = [];
        paso(2); pinta();
      })
      .catch(function () { b.disabled = false; msg('No se ha podido leer. Inténtalo otra vez.', 'text-danger'); });
  });

  // ---------------------------------------------------------------- 2 · canción a canción
  function elegido(campo) { return 'lcf-' + campo; }

  function filaCampo(f, i) {
    var id = elegido(f.key);
    var nuevoMarcado = !f.had;          // sin dato previo, se queda lo del LC
    var html = '<div class="lc-field" data-lc-field="' + esc(f.key) + '" data-lc-kind="' + esc(f.kind) + '">' +
      '<div class="lc-field__k">' + esc(f.label) + '</div>' +
      '<div class="lc-field__cols">';

    // IZQUIERDA: lo que dice el LC
    html += '<label class="lc-opt' + (f.same ? ' is-same' : '') + '">' +
      '<input type="radio" name="' + esc(id) + '" value="new"' + (nuevoMarcado || f.same ? ' checked' : '') + '>' +
      '<span class="lc-opt__b"><span class="lc-opt__t">Del Label Copy</span>' +
      '<span class="lc-opt__v">' + esc(f.new_show) + '</span></span></label>';

    // DERECHA: lo que hay ahora
    html += '<label class="lc-opt' + (f.had ? '' : ' is-empty') + '">' +
      '<input type="radio" name="' + esc(id) + '" value="old"' + (!nuevoMarcado && !f.same ? ' checked' : '') + '>' +
      '<span class="lc-opt__b"><span class="lc-opt__t">Lo que hay ahora</span>' +
      '<span class="lc-opt__v">' + (f.had ? esc(f.old_show) : '<em class="text-muted">Vacío</em>') + '</span></span></label>';

    html += '</div>';

    // Lo VINCULABLE: a quién corresponde cada nombre
    if (f.items && f.items.length) html += vinculos(f);
    html += '</div>';
    return html;
  }

  function opcionesHtml(campo, i, opciones, extra) {
    var name = 'lcv-' + campo + '-' + i;
    var html = '<div class="lc-link__opts">';
    (opciones || []).forEach(function (o, k) {
      html += '<label class="lc-pick">' +
        '<input type="radio" name="' + esc(name) + '" value="' + esc(o.id) + '"' +
        ((o.exact || (k === 0 && opciones.length === 1)) ? ' checked' : '') + '>' +
        '<img src="' + esc(o.photo || '') + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="lc-pick__t">' + esc(o.label) +
        (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span></label>';
    });
    html += '<label class="lc-pick lc-pick--new">' +
      '<input type="radio" name="' + esc(name) + '" value="__new__"' + ((opciones || []).length ? '' : ' checked') + '>' +
      '<span class="lc-pick__ico"><i class="fa fa-user-plus"></i></span>' +
      '<span class="lc-pick__t">Crear nuevo</span></label>';
    html += '</div>';
    return html;
  }

  function vinculos(f) {
    var html = '<div class="lc-links">';
    (f.items || []).forEach(function (it, i) {
      html += '<div class="lc-link" data-lc-item="' + i + '">' +
        '<div class="lc-link__n"><i class="fa fa-user-pen"></i>' + esc(it.name) +
        (it.pct != null ? ' <span class="badge text-bg-light border ms-1">' + esc(it.pct) + '%</span>' : '') +
        (it.role ? ' <span class="text-muted small ms-1">' + esc(it.role) + '</span>' : '') + '</div>' +
        opcionesHtml(f.key, i, it.options);
      // La EDITORIAL del autor, si el LC la trae
      if (f.kind === 'authors' && it.publisher) {
        html += '<div class="lc-link__pub"><span class="text-muted small">Editorial del LC:</span> ' +
          '<strong>' + esc(it.publisher) + '</strong>' +
          opcionesHtml(f.key + '-pub', i, it.publisher_options) + '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function pinta() {
    var c = canciones[idx];
    if (!c) { termina(); return; }
    $('[data-lc-pos]').textContent = 'Canción ' + (idx + 1) + ' de ' + canciones.length + ': ' + c.title;
    $('[data-lc-file]').textContent = c.file || '';
    $('[data-lc-prev]').disabled = idx === 0;

    var cab;
    if (c.is_new) {
      cab = '<div class="lc-head lc-head--new">' +
        '<div><span class="badge text-bg-warning"><i class="fa fa-circle-plus me-1"></i>No está en el sistema</span>' +
        '<div class="fw-bold fs-5 mt-1">' + esc(c.title) + '</div>' +
        (c.interpreters_text ? '<div class="text-muted small">' + esc(c.interpreters_text) + '</div>' : '') + '</div>' +
        '<div class="lc-head__artist"><label class="form-label small mb-1">¿De qué artista es?</label>' +
        '<input class="form-control form-control-sm" data-lc-artist-q placeholder="Busca el artista…" autocomplete="off">' +
        '<input type="hidden" data-lc-artist-id>' +
        '<div class="lc-artist-res" data-lc-artist-res></div></div></div>';
    } else {
      cab = '<div class="lc-head">' +
        (c.cover_url ? '<img class="lc-head__cover" src="' + esc(c.cover_url) + '" alt="">' : '') +
        '<div><span class="badge text-bg-success"><i class="fa fa-link me-1"></i>' + esc(c.match_label || 'Casada') + '</span>' +
        '<div class="fw-bold fs-5 mt-1">' + esc(c.song_title || c.title) + '</div>' +
        (c.song_artists ? '<div class="text-muted small">' + esc(c.song_artists) + '</div>' : '') + '</div></div>';
    }

    // ⚠️ Lo que ya DICE LO MISMO se pliega: con 18 campos y 3 distintos, lo que hay que decidir
    // se pierde entre lo que no hay que tocar. Se conserva a mano por si hay que mirarlo.
    var distintos = (c.fields || []).filter(function (f) { return !f.same; });
    var iguales = (c.fields || []).filter(function (f) { return f.same; });
    var campos = distintos.map(filaCampo).join('');
    if (!campos && !iguales.length) {
      campos = '<div class="alert alert-light border">En este Label Copy no hay ningún dato que volcar.</div>';
    } else if (!campos) {
      campos = '<div class="alert alert-light border">' +
        '<i class="fa fa-circle-check text-success me-1"></i>Todo lo que dice este Label Copy ya está igual en la ficha.</div>';
    }
    if (iguales.length) {
      campos += '<details class="lc-same"><summary>' + iguales.length +
        (iguales.length === 1 ? ' campo que ya coincide' : ' campos que ya coinciden') + '</summary>' +
        iguales.map(filaCampo).join('') + '</details>';
    }
    $('[data-lc-card]').innerHTML = cab + campos;
    $('[data-lc-save]').innerHTML = '<i class="fa fa-check me-1"></i>' +
      (c.is_new ? 'Crear la canción' : 'Guardar y seguir');
    if (c.is_new) cableaArtista();
  }

  // Buscador de artista para la canción que hay que crear
  function cableaArtista() {
    var q = $('[data-lc-artist-q]'), res = $('[data-lc-artist-res]'), hid = $('[data-lc-artist-id]');
    if (!q) return;
    var t = null;
    q.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        fetch(cfg.artistas + '?q=' + encodeURIComponent(q.value || ''))
          .then(function (r) { return r.json(); })
          .then(function (js) {
            res.innerHTML = (js || []).map(function (a) {
              return '<button type="button" class="lc-artist" data-id="' + esc(a.id) + '" data-label="' + esc(a.label) + '">' +
                '<img src="' + esc(a.photo || '') + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
                esc(a.label) + '</button>';
            }).join('');
          }).catch(function () {});
      }, 200);
    });
    res.addEventListener('click', function (ev) {
      var b = ev.target.closest('.lc-artist');
      if (!b) return;
      hid.value = b.getAttribute('data-id');
      q.value = b.getAttribute('data-label');
      res.innerHTML = '';
    });
  }

  // ---------------------------------------------------------------- lo elegido
  function recoge() {
    var c = canciones[idx];
    var fields = {};
    $$('[data-lc-field]', $('[data-lc-card]')).forEach(function (z) {
      var key = z.getAttribute('data-lc-field');
      var kind = z.getAttribute('data-lc-kind');
      var marcado = z.querySelector('input[name="' + elegido(key) + '"]:checked');
      if (!marcado || marcado.value !== 'new') return;      // se conserva lo que hay: no se manda
      var f = (c.fields || []).filter(function (x) { return x.key === key; })[0];
      if (!f) return;
      if (kind === 'authors') {
        fields[key] = (f.items || []).map(function (it, i) {
          var sel = z.querySelector('input[name="lcv-' + key + '-' + i + '"]:checked');
          var pub = z.querySelector('input[name="lcv-' + key + '-pub-' + i + '"]:checked');
          var fila = { pct: it.pct, role: it.role };
          if (sel && sel.value && sel.value !== '__new__') {
            var op = (it.options || []).filter(function (o) { return String(o.id) === sel.value; })[0];
            if (op && op.person_id) fila.artist_person_id = op.person_id; else fila.promoter_id = sel.value;
          } else {
            fila.create_name = it.name;
          }
          if (pub && pub.value && pub.value !== '__new__') fila.publishing_company_id = pub.value;
          else if (it.publisher) fila.publisher_name = it.publisher;
          return fila;
        });
      } else if (kind === 'people' || kind === 'person' || kind === 'artists') {
        // Se guarda el NOMBRE, pero el de la ficha elegida (así se escribe igual en todo el catálogo).
        var nombres = (f.items || []).map(function (it, i) {
          var sel = z.querySelector('input[name="lcv-' + key + '-' + i + '"]:checked');
          if (sel && sel.value && sel.value !== '__new__') {
            var op = (it.options || []).filter(function (o) { return String(o.id) === sel.value; })[0];
            if (op) return op.label;
          }
          return it.name;
        });
        fields[key] = (kind === 'person') ? (nombres[0] || '') : nombres;
      } else {
        fields[key] = f.new;
      }
    });
    return fields;
  }

  function guarda(saltar) {
    var c = canciones[idx];
    if (saltar) { siguiente(); return; }
    var cuerpo = { song_id: c.song_id || '', title: c.title, fields: recoge(), raw: c.raw || {} };
    if (c.is_new) {
      var aid = $('[data-lc-artist-id]');
      if (!aid || !aid.value) {
        alert('Elige de qué artista es la canción antes de crearla.');
        return;
      }
      cuerpo.artist_id = aid.value;
    }
    var b = $('[data-lc-save]');
    b.disabled = true;
    fetch(cfg.aplicar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); })
      .then(function (js) {
        b.disabled = false;
        if (!js || !js.ok) { alert((js && js.error) || 'No se ha podido guardar.'); return; }
        resultados.push({ title: js.title, created: js.created, changed: js.changed || [], url: js.url });
        siguiente();
      }).catch(function () { b.disabled = false; alert('No se ha podido guardar. Inténtalo otra vez.'); });
  }

  function siguiente() {
    idx += 1;
    if (idx >= canciones.length) termina(); else pinta();
  }

  $('[data-lc-save]').addEventListener('click', function () { guarda(false); });
  $('[data-lc-skip]').addEventListener('click', function () { guarda(true); });
  $('[data-lc-prev]').addEventListener('click', function () {
    if (idx > 0) { idx -= 1; pinta(); }
  });

  // ---------------------------------------------------------------- 3 · el resumen
  function termina() {
    var creadas = resultados.filter(function (r) { return r.created; });
    var tocadas = resultados.filter(function (r) { return !r.created; });
    var html = '<div class="alert alert-success"><i class="fa fa-circle-check me-1"></i>' +
      'Listo: <strong>' + tocadas.length + '</strong> actualizada(s) y <strong>' + creadas.length + '</strong> creada(s).</div>';
    if (resultados.length) {
      html += '<ul class="lc-result">' + resultados.map(function (r) {
        return '<li><a href="' + esc(r.url) + '" target="_blank">' + esc(r.title) + '</a>' +
          (r.created ? ' <span class="badge text-bg-warning">Nueva</span>' : '') +
          (r.changed.length ? '<div class="small text-muted">' + esc(r.changed.join(' · ')) + '</div>'
                            : '<div class="small text-muted">Sin cambios</div>') + '</li>';
      }).join('') + '</ul>';
    }
    html += '<button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-lc-restart>' +
            '<i class="fa fa-rotate-left me-1"></i>Subir más Label Copy</button>';
    $('[data-lc-result]').innerHTML = html;
    paso(3);
  }

  modalEl.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-lc-restart]')) return;
    ficheros = []; canciones = []; resultados = []; idx = 0;
    pintaFicheros(); paso(1);
  });

  modalEl.addEventListener('show.bs.modal', function () {
    if (!canciones.length) paso(1);
  });
  paso(1);
})();
