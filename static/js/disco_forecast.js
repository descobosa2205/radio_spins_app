/* CUADRO DE MANDO DE PREVISIONES (Discográfica → Previsiones).
   Todo se pinta desde el JSON que deja el servidor (`data-fc`) y, al cambiar de artista, de semana
   o de ventana, se vuelve a pedir por `forecast_data` SIN recargar la página (así no se pierde por
   dónde se iba).
   ⚠️ Lo que se decide aquí se guarda DONDE VIVE: el focus y la continuidad en la canción, las
   presentaciones en `SongRadioPitch` y los periodos de promoción en su tabla. */
(function () {
  'use strict';

  function boot() {
    var root = document.querySelector('[data-forecast]');
    if (!root || root.dataset.fcBound === '1') return;
    root.dataset.fcBound = '1';

    var D = {};
    try { D = JSON.parse(root.getAttribute('data-fc') || '{}'); } catch (e) { D = {}; }
    var CAN = root.getAttribute('data-can-edit') === '1';
    var U = {
      json: root.getAttribute('data-url-json') || '',
      kind: root.getAttribute('data-url-kind') || '',
      drop: root.getAttribute('data-url-drop') || '',
      window: root.getAttribute('data-url-window') || '',
      windowDel: root.getAttribute('data-url-window-del') || '',
      radio: root.getAttribute('data-url-radio') || '',
      prefs: root.getAttribute('data-url-prefs') || '',
      hide: root.getAttribute('data-url-hide') || '',
      move: root.getAttribute('data-url-move') || '',
    };
    // ⚠️ EL FILTRO VA AL REVÉS: todos encendidos y se apagan los que se pinchen. Se guarda lo
    // APAGADO, así un artista nuevo aparece solo.
    var apagados = new Set(D.off_artists || []);
    var ocultos = new Set(D.hidden || []);
    var pitchMode = 'station';     // por emisora | por artista
    var semanasPedidas = 0;        // cuántas semanas se piden (0 = las que decida el servidor)

    // ------------------------------------------------------------ helpers
    function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
    function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
    function csrf() { var m = document.querySelector('meta[name="csrf-token"]'); return m ? (m.getAttribute('content') || '') : ''; }
    function post(url, data) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
        body: JSON.stringify(data || {}),
      }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
    }
    function fechaEs(iso) {
      var p = String(iso || '').slice(0, 10).split('-');
      return (p.length === 3) ? (p[2] + '/' + p[1]) : '';
    }
    function avatar(url, icon) {
      return url ? '<img src="' + esc(url) + '" alt="">'
                 : '<span class="noimg"><i class="fa ' + (icon || 'fa-user') + '"></i></span>';
    }
    function kindMeta(key) {
      var l = D.release_kinds || [];
      for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
      return null;
    }
    function artistById(id) {
      var l = D.artists || [];
      for (var i = 0; i < l.length; i++) if (l[i].id === String(id)) return l[i];
      return null;
    }
    function visibles() {
      return (D.artists || []).filter(function (a) { return !apagados.has(a.id); });
    }
    /* ¿Está quitado del calendario? (`TIPO:id`, p. ej. «SONG:…» o «WIN:…»). */
    function oculto(clave) { return ocultos.has(String(clave || '')); }
    /* ⚠️ QUITAR DEL CALENDARIO **NO BORRA NADA**: el concierto, el lanzamiento o la promoción
       siguen donde estaban; solo dejan de pintarse aquí (y es del CUADRO: lo ve todo el mundo). */
    var seleccion = '';               // la clave del elemento seleccionado (para la tecla Suprimir)
    function quitar(clave, undo) {
      if (!U.hide || !clave) return;
      post(U.hide, { key: clave, undo: undo ? 1 : '' }).then(function (r) {
        if (r && r.ok) { seleccion = ''; recarga({}); }
        else alert((r && r.error) || 'No se pudo quitar del calendario.');
      });
    }
    // Con algo seleccionado, la tecla de eliminar lo quita del calendario.
    document.addEventListener('keydown', function (ev) {
      if (!seleccion || !CAN) return;
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      var t = ev.target || {};
      var etiqueta = (t.tagName || '').toLowerCase();
      if (etiqueta === 'input' || etiqueta === 'textarea' || t.isContentEditable) return;
      ev.preventDefault();
      quitar(seleccion, false);
    });
    /* ⚠️ ARRASTRAR = CAMBIAR DE SEMANA, y lo que se mueve se guarda EN SU FICHA (no hay una fecha
       paralela aquí). Una ACTIVIDAD no se arrastra: se queda en su día. */
    function mueve(clave, semana) {
      if (!U.move || !clave || !semana) return;
      post(U.move, { key: clave, week: semana }).then(function (r) {
        if (r && r.ok) recarga({});
        else alert((r && r.error) || 'No se pudo mover.');
      });
    }
    /* Lo que se ARRASTRA desde la paleta para AÑADIRLO al calendario. */
    function sueltaNuevo(tipo, artistId, semana) {
      abreAnadir({ tipo: tipo, artist_id: artistId, week: semana });
    }
    /* La semana en la que estamos hoy (para lo que se añade sin arrastrar a una semana concreta). */
    function semanaDeHoy() {
      var hoy = new Date();
      var iso = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      var w = D.weeks || [];
      for (var i = 0; i < w.length; i++) if (iso >= w[i].start && iso <= w[i].end) return w[i].start;
      return (w[0] || {}).start || iso;
    }
    function selecciona(el, clave) {
      var raiz = root.querySelector('[data-fc-cal]');
      if (raiz) {
        raiz.querySelectorAll('.is-sel').forEach(function (x) { x.classList.remove('is-sel'); });
        raiz.querySelectorAll('.fc-x').forEach(function (x) { x.remove(); });
      }
      seleccion = '';
      if (!el || !clave) return;
      seleccion = clave;
      el.classList.add('is-sel');
      if (!CAN) return;
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'fc-x';
      x.title = 'Quitarlo del calendario (no se borra nada)';
      x.innerHTML = '<i class="fa fa-xmark"></i>';
      x.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); quitar(clave, false); });
      (el.classList.contains('fc-hito') ? el.parentNode : el).appendChild(x);
    }
    var guardaPrefsTimer = null;
    function guardaPrefs() {
      if (!U.prefs) return;
      clearTimeout(guardaPrefsTimer);
      guardaPrefsTimer = setTimeout(function () {
        post(U.prefs, { off_artists: Array.from(apagados) });
      }, 500);     // con un respiro: no se guarda en cada clic
    }
    /* ⚠️ EL CALENDARIO VA POR SEMANAS: cada cosa cae DENTRO de la semana que le toca (no se
       posiciona por día). Estos dos son el punto único de «en qué columna va esto».
       Las fechas se comparan EN ISO tal cual (texto): así no entra ningún huso horario por medio. */
    function semanaDe(iso) {
      var w = D.weeks || [], d = String(iso || '').slice(0, 10);
      if (!d) return null;
      for (var i = 0; i < w.length; i++) if (d >= w[i].start && d <= w[i].end) return i;
      return null;
    }
    /* Las semanas que ocupa algo que dura varios días, RECORTADO a la ventana: [i0, i1] o null. */
    function tramoSemanas(desde, hasta) {
      var w = D.weeks || [];
      if (!w.length) return null;
      var d0 = String(desde || '').slice(0, 10);
      var d1 = String(hasta || desde || '').slice(0, 10) || d0;
      if (!d0) return null;
      if (d1 < d0) { var x = d0; d0 = d1; d1 = x; }
      if (d1 < w[0].start || d0 > w[w.length - 1].end) return null;   // se queda fuera de la ventana
      var i0 = 0, i1 = w.length - 1;
      for (var i = 0; i < w.length; i++) if (w[i].end >= d0) { i0 = i; break; }
      for (var j = w.length - 1; j >= 0; j--) if (w[j].start <= d1) { i1 = j; break; }
      return [i0, Math.max(i0, i1)];
    }

    // ------------------------------------------------------------ recarga
    function recarga(cambios) {
      Object.keys(cambios || {}).forEach(function (k) { D[k] = cambios[k]; });
      var qs = [];
      if (D.artist_id) qs.push('fa=' + encodeURIComponent(D.artist_id));
      if (D.week_start) qs.push('fw=' + encodeURIComponent(D.week_start));
      if (D.from) qs.push('fd=' + encodeURIComponent(D.from));
      if (semanasPedidas) qs.push('fs=' + semanasPedidas);
      if (D.todos) qs.push('ftodos=1');
      if (D.show_agenda === false) qs.push('fagenda=0');
      if (D.ver_ocultos) qs.push('fver=1');
      root.classList.add('is-loading');
      return fetch(U.json + (qs.length ? '?' + qs.join('&') : ''), { headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (resp) {
          root.classList.remove('is-loading');
          if (resp && resp.ok && resp.forecast) {
            D = resp.forecast;
            ocultos = new Set(D.hidden || []);
            render();
          }
        })
        .catch(function () { root.classList.remove('is-loading'); });
    }

    // ------------------------------------------------------------ cabecera
    function renderTools() {
      var z = root.querySelector('[data-fc-tools]');
      var semanas = (D.weeks || []).length;
      z.innerHTML =
        '<div class="fc-range">'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-fc-move="-1" title="Atrás"><i class="fa fa-chevron-left"></i></button>'
        + '<span class="fc-range__label">' + esc(fechaEs(D.from)) + ' – ' + esc(fechaEs(D.to)) + '</span>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-fc-move="1" title="Adelante"><i class="fa fa-chevron-right"></i></button>'
        + '</div>'
        + '<div class="btn-group btn-group-sm" role="group">'
        + [8, 16, 26, 52].map(function (n) {
            return '<button type="button" class="btn btn-outline-secondary' + (semanas === n ? ' active' : '')
              + '" data-fc-weeks="' + n + '">' + (n < 26 ? (n + ' sem.') : (n === 26 ? '6 meses' : '1 año')) + '</button>';
          }).join('')
        + '</div>'
        // ⚠️ Ya no hay botón «Agenda»: la agenda es UNO MÁS de los elementos que se arrastran al
        // calendario (la paleta de abajo). Y el «+ Periodo de promoción» es ahora esa paleta.
        + ((D.hidden_count || (D.ver_ocultos ? 1 : 0))
            ? ('<button type="button" class="btn btn-sm ' + (D.ver_ocultos ? 'btn-outline-primary active' : 'btn-outline-secondary')
               + '" data-fc-vero title="Lo que se ha quitado del calendario (no se ha borrado: se puede devolver)">'
               + '<i class="fa fa-eye-slash me-1"></i>Quitados' + (D.hidden_count ? (' ' + D.hidden_count) : '') + '</button>')
            : '');
      z.querySelectorAll('[data-fc-move]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = new Date(Date.parse(D.from));
          d.setDate(d.getDate() + (parseInt(b.getAttribute('data-fc-move'), 10) * 28));
          recarga({ from: d.toISOString().slice(0, 10) });
        });
      });
      z.querySelectorAll('[data-fc-weeks]').forEach(function (b) {
        b.addEventListener('click', function () {
          semanasPedidas = parseInt(b.getAttribute('data-fc-weeks'), 10);
          recarga({});
        });
      });
      var vo = z.querySelector('[data-fc-vero]');
      if (vo) vo.addEventListener('click', function () { recarga({ ver_ocultos: !D.ver_ocultos }); });
    }

    function renderArtists() {
      var z = root.querySelector('[data-fc-artists]');
      var lista = (D.artists || []);
      var encendidos = lista.filter(function (a) { return !apagados.has(a.id); }).length;
      // «Todos» / «Ninguno» solo cuando HACEN algo (la regla de la casa): con todo encendido no se
      // ofrece «Todos», y con todo apagado no se ofrece «Ninguno».
      var h = '';
      if (lista.length > 1) {
        if (encendidos < lista.length) h += '<button type="button" class="filter-chip fc-all" data-fc-all="1">Todos</button>';
        if (encendidos > 0) h += '<button type="button" class="filter-chip fc-all" data-fc-all="0">Ninguno</button>';
      }
      lista.forEach(function (a) {
        h += '<button type="button" class="fc-artist' + (apagados.has(a.id) ? '' : ' is-on') + '" data-fc-artist="' + esc(a.id) + '"'
          + ' style="--c:' + esc(a.color) + '" title="' + esc(apagados.has(a.id) ? ('Ver ' + a.name) : ('Ocultar ' + a.name)) + '">'
          + avatar(a.photo_url, 'fa-guitar') + '<span>' + esc(a.name) + '</span></button>';
      });
      if (!D.todos) h += '<button type="button" class="fc-artist fc-artist--more" data-fc-todos>Ver más artistas</button>';
      z.innerHTML = h;
      z.querySelectorAll('[data-fc-artist]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-fc-artist');
          if (apagados.has(id)) apagados.delete(id); else apagados.add(id);
          guardaPrefs();
          render();                     // el filtro es de la pantalla: no hace falta ir al servidor
        });
      });
      z.querySelectorAll('[data-fc-all]').forEach(function (b) {
        b.addEventListener('click', function () {
          apagados = (b.getAttribute('data-fc-all') === '1')
            ? new Set()
            : new Set(lista.map(function (a) { return a.id; }));
          guardaPrefs();
          render();
        });
      });
      var m = z.querySelector('[data-fc-todos]');
      if (m) m.addEventListener('click', function () { recarga({ todos: true }); });
    }

    function renderLegend() {
      var z = root.querySelector('[data-fc-legend]');
      var h = (D.release_kinds || []).map(function (k) {
        return '<span class="fc-leg"><i class="fa ' + esc(k.icon) + '" style="color:' + esc(k.color) + '"></i>' + esc(k.label) + '</span>';
      }).join('');
      h += '<span class="fc-leg"><i class="fa fa-tower-broadcast" style="color:#0ea5e9"></i>A radio</span>';
      (D.window_kinds || []).forEach(function (k) {
        h += '<span class="fc-leg"><span class="fc-leg__bar" style="background:' + esc(k.color) + '"></span>' + esc(k.label) + '</span>';
      });
      z.innerHTML = h;
    }

    // ------------------------------------------------------------ la PALETA
    /* Lo que se arrastra al calendario. Se puede **arrastrar** a la semana de un artista o
       **pinchar** (y entonces el asistente pregunta también de quién es). */
    function renderPalette() {
      var z = root.querySelector('[data-fc-palette]');
      if (!z) return;
      if (!CAN) { z.innerHTML = ''; return; }
      z.innerHTML = '<span class="fc-palette__lbl">Arrastra al calendario:</span>'
        + (D.add_kinds || []).map(function (k) {
            return '<button type="button" class="fc-pal" draggable="true" data-fc-add-kind="' + esc(k.key) + '"'
              + ' style="--c:' + esc(k.color) + '" title="Arrástralo a la semana de un artista (o púlsalo)">'
              + '<i class="fa ' + esc(k.icon) + '"></i><span>' + esc(k.label) + '</span></button>';
          }).join('');
      z.querySelectorAll('[data-fc-add-kind]').forEach(function (b) {
        var tipo = b.getAttribute('data-fc-add-kind');
        b.addEventListener('dragstart', function (ev) {
          ev.dataTransfer.setData('text/plain', 'nuevo:' + tipo);
          ev.dataTransfer.effectAllowed = 'copy';
          b.classList.add('is-dragging');
        });
        b.addEventListener('dragend', function () { b.classList.remove('is-dragging'); });
        b.addEventListener('click', function () { abreAnadir({ tipo: tipo }); });
      });
    }

    /* AÑADIR algo al calendario: qué es → de quién → cuál (o crear uno nuevo). Lo que ya se sabe
       (porque se ha soltado en la fila de un artista y en una semana) no se vuelve a preguntar. */
    function abreAnadir(pre) {
      pre = pre || {};
      var estado = { tipo: pre.tipo || '', artist_id: pre.artist_id || '', week: pre.week || '', subtipo: '' };
      var m = modal('fcAddModal', 'Añadir al calendario', '<div class="fc-add" data-fc-addbody></div>',
                    [{ label: 'Cerrar', click: function () { m.hide(); } }]);
      var cuerpo = m.el.querySelector('[data-fc-addbody]');

      function meta(k) {
        var l = D.add_kinds || [];
        for (var i = 0; i < l.length; i++) if (l[i].key === k) return l[i];
        return { label: k, icon: 'fa-plus', color: '#6b7280' };
      }
      function cabecera() {
        var partes = [];
        if (estado.tipo) partes.push('<span class="fc-add__crumb"><i class="fa ' + esc(meta(estado.tipo).icon) + '"></i>' + esc(meta(estado.tipo).label) + '</span>');
        var a = artistById(estado.artist_id);
        if (a) partes.push('<span class="fc-add__crumb">' + avatar(a.photo_url, 'fa-guitar') + esc(a.name) + '</span>');
        if (estado.week) partes.push('<span class="fc-add__crumb"><i class="fa fa-calendar-week"></i>Semana del ' + esc(fechaEs(estado.week)) + '</span>');
        return partes.length ? ('<div class="fc-add__crumbs">' + partes.join('') + '</div>') : '';
      }
      function pinta(html) { cuerpo.innerHTML = cabecera() + html; }

      function pasoTipo() {
        pinta('<div class="fc-add__q">¿Qué quieres poner en el calendario?</div><div class="fc-add__grid">'
          + (D.add_kinds || []).map(function (k) {
              return '<button type="button" class="fc-add__card" data-k="' + esc(k.key) + '" style="--c:' + esc(k.color) + '">'
                + '<i class="fa ' + esc(k.icon) + '"></i><span>' + esc(k.label) + '</span></button>';
            }).join('') + '</div>');
        cuerpo.querySelectorAll('[data-k]').forEach(function (b) {
          b.addEventListener('click', function () { estado.tipo = b.getAttribute('data-k'); siguiente(); });
        });
      }
      function pasoArtista() {
        pinta('<div class="fc-add__q">¿De quién es?</div><div class="fc-add__grid">'
          + (D.artists || []).map(function (a) {
              return '<button type="button" class="fc-add__card" data-a="' + esc(a.id) + '" style="--c:' + esc(a.color) + '">'
                + avatar(a.photo_url, 'fa-guitar') + '<span>' + esc(a.name) + '</span></button>';
            }).join('') + '</div>');
        cuerpo.querySelectorAll('[data-a]').forEach(function (b) {
          b.addEventListener('click', function () { estado.artist_id = b.getAttribute('data-a'); siguiente(); });
        });
      }
      function pasoCual() {
        pinta('<div class="fc-add__q">Cargando…</div>');
        var qs = '?tipo=' + encodeURIComponent(estado.tipo) + '&artist_id=' + encodeURIComponent(estado.artist_id)
               + (estado.subtipo ? ('&subtipo=' + encodeURIComponent(estado.subtipo)) : '');
        fetch((root.getAttribute('data-url-add-options') || '') + qs, { headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (resp) {
            if (!resp || !resp.ok) { pinta('<div class="fc-empty">No se pudo cargar.</div>'); return; }
            // En AGENDA se pregunta antes QUÉ TIPO de cosa es.
            if (estado.tipo === 'AGENDA' && !estado.subtipo) {
              pinta('<div class="fc-add__q">¿Qué tipo de cosa?</div><div class="fc-add__grid">'
                + (resp.tipos || []).map(function (t) {
                    return '<button type="button" class="fc-add__card" data-t="' + esc(t.key) + '">'
                      + '<i class="fa ' + esc(t.icon) + '"></i><span>' + esc(t.label) + '</span></button>';
                  }).join('') + '</div>');
              cuerpo.querySelectorAll('[data-t]').forEach(function (b) {
                b.addEventListener('click', function () { estado.subtipo = b.getAttribute('data-t'); pasoCual(); });
              });
              return;
            }
            var fijo = estado.tipo === 'AGENDA';   // una actividad NO se mueve: se queda en su día
            pinta('<div class="fc-add__q">¿Cuál?</div>'
              + ((resp.items || []).length
                  ? '<div class="fc-add__list">' + resp.items.map(function (it) {
                      return '<button type="button" class="fc-add__row" data-i="' + esc(it.key) + '">'
                        + (it.cover_url ? ('<img src="' + esc(it.cover_url) + '" alt="">')
                                        : ('<span class="noimg"><i class="fa ' + esc(it.icon || 'fa-circle') + '"></i></span>'))
                        + '<span class="fc-add__row-main"><b>' + esc(it.title) + '</b>'
                        + (it.sub ? ('<span class="fc-sub">' + esc(it.sub) + '</span>') : '') + '</span></button>';
                    }).join('') + '</div>'
                  : '<div class="fc-empty">No hay nada de esto todavía para este artista.</div>')
              + (fijo ? '<div class="form-text mt-2">Una actividad se pone en <b>su día</b>: no se mueve a la semana donde la sueltes.</div>' : '')
              + '<div class="mt-3"><button type="button" class="btn btn-outline-danger btn-sm" data-nuevo><i class="fa fa-plus me-1"></i>Crear uno nuevo</button></div>');
            cuerpo.querySelectorAll('[data-i]').forEach(function (b) {
              b.addEventListener('click', function () { añade(b.getAttribute('data-i')); });
            });
            cuerpo.querySelector('[data-nuevo]').addEventListener('click', crear);
          })
          .catch(function () { pinta('<div class="fc-empty">No se pudo cargar.</div>'); });
      }
      function añade(clave) {
        // Lo que se elige se pone en ESA semana (menos una actividad, que se queda en su día).
        if (!estado.week || estado.tipo === 'AGENDA') { m.hide(); recarga({}); return; }
        post(U.move, { key: clave, week: estado.week }).then(function (r) {
          m.hide();
          if (r && r.ok) recarga({});
          else alert((r && r.error) || 'No se pudo poner en el calendario.');
        });
      }
      /* ⚠️ UNA PROMOCIÓN NUEVA **se vincula a algo** (obligatorio): sin decir qué se promociona no
         se sabe de qué va, y es lo que hace que salga también en la ficha de ESO y en el proyecto
         como pendiente de ejecutar. Las fechas son APROXIMADAS: la semana donde se suelte (y se
         puede decir cuántas semanas dura). */
      function pasoPromo() {
        pinta('<div class="fc-add__q">Cargando…</div>');
        fetch((root.getAttribute('data-url-promo-targets') || '') + '?artist_id=' + encodeURIComponent(estado.artist_id),
              { headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (resp) {
            var items = (resp && resp.items) || [];
            pinta('<div class="fc-add__q">¿Qué se promociona?</div>'
              + '<div class="form-text mb-2">Hay que vincularla a algo: así se ve también en su ficha y, si es un proyecto, en su lista de tareas.</div>'
              + '<div class="fc-add__list">' + items.map(function (it) {
                  return '<button type="button" class="fc-add__row" data-t="' + esc(it.type) + '" data-id="' + esc(it.id) + '">'
                    + (it.cover_url ? ('<img src="' + esc(it.cover_url) + '" alt="">')
                                    : ('<span class="noimg"><i class="fa ' + esc(it.icon || 'fa-circle') + '"></i></span>'))
                    + '<span class="fc-add__row-main"><b>' + esc(it.title) + '</b><span class="fc-sub">' + esc(it.sub || '') + '</span></span></button>';
                }).join('') + '</div>'
              + '<div class="row g-2 mt-2 align-items-end">'
              + '<div class="col-auto"><label class="form-label mb-0 small">¿Cuántas semanas?</label>'
              + '<input class="form-control form-control-sm" type="number" min="1" max="26" value="1" data-semanas style="width:6rem"></div>'
              + '<div class="col"><label class="form-label mb-0 small">Nombre <span class="text-muted">(si se deja vacío se compone solo)</span></label>'
              + '<input class="form-control form-control-sm" data-nombre></div></div>');
            cuerpo.querySelectorAll('[data-t]').forEach(function (b) {
              b.addEventListener('click', function () {
                var semanas = parseInt((cuerpo.querySelector('[data-semanas]') || {}).value, 10) || 1;
                var nombre = ((cuerpo.querySelector('[data-nombre]') || {}).value || '').trim();
                b.disabled = true;
                post(root.getAttribute('data-url-promo-create'), {
                  artist_id: estado.artist_id, subject_type: b.getAttribute('data-t'),
                  subject_id: b.getAttribute('data-id'), week: estado.week || semanaDeHoy(),
                  weeks: semanas, name: nombre,
                }).then(function (r) {
                  b.disabled = false;
                  if (r && r.ok) { m.hide(); recarga({}); }
                  else alert((r && r.error) || 'No se pudo crear la promoción.');
                });
              });
            });
          })
          .catch(function () { pinta('<div class="fc-empty">No se pudo cargar.</div>'); });
      }
      function crear() {
        // Cada cosa se crea DONDE SE CREA (no se inventa aquí otro sitio para lo mismo); la
        // PROMOCIÓN sí se crea desde aquí, porque es planificarla.
        if (estado.tipo === 'PROMO') return pasoPromo();
        var destinos = {
          PROJECT: '/discografica?section=proyectos&open_wizard=1',
          ALBUM: '/discografica?section=lanzamientos',
          AGENDA: '/actividades?open_wizard=1' + (estado.artist_id ? ('&wizard_artist=' + estado.artist_id) : '')
                  + (estado.week ? ('&wizard_date=' + estado.week) : ''),
        };
        window.location.href = destinos[estado.tipo] || '/discografica?section=previsiones';
      }
      function siguiente() {
        if (!estado.tipo) return pasoTipo();
        if (!estado.artist_id) return pasoArtista();
        return pasoCual();
      }
      siguiente();
    }

    // ------------------------------------------------------------ A · calendario
    /* UNA COLUMNA POR SEMANA. En la celda de cada semana va lo que ese artista tiene ESA semana
       (sus lanzamientos y, como referencia, lo que ya hay en su agenda); un PERIODO DE PROMOCIÓN es
       una barra que ocupa las columnas de las semanas que dura, en su carril para que no se pisen. */
    function renderCal() {
      var z = root.querySelector('[data-fc-cal]');
      var weeks = D.weeks || [];
      var todosArts = visibles();
      function tieneAlgo(a) {
        return ((D.releases || {})[a.id] || []).length
            || ((D.promo_windows || {})[a.id] || []).length
            || (D.show_agenda && ((D.agenda || {})[a.id] || []).length);
      }
      var arts = D.artist_id ? todosArts : todosArts.filter(tieneAlgo);
      var fuera = todosArts.length - arts.length;
      if (!arts.length) {
        z.innerHTML = '<div class="fc-empty">Ningún artista tiene nada entre el ' + esc(fechaEs(D.from))
          + ' y el ' + esc(fechaEs(D.to)) + '. Prueba a mover el periodo o a abrirlo más.</div>';
        return;
      }
      function clases(w) { return (w.is_now ? ' is-now' : '') + (w.first_of_month ? ' is-month' : ''); }

      var head = '<div class="fc-cal__row fc-cal__row--head"><div class="fc-cal__who"></div>'
        + '<div class="fc-cal__weeks">'
        + weeks.map(function (w) {
            return '<div class="fc-cal__w' + clases(w) + '" title="Semana del ' + esc(fechaEs(w.start))
              + ' al ' + esc(fechaEs(w.end)) + '">'
              + (w.first_of_month ? '<b>' + esc(w.month) + '</b>' : '') + '<span>' + esc(w.label) + '</span></div>';
          }).join('')
        + '</div></div>';

      var body = arts.map(function (a) {
        var rel = (D.releases || {})[a.id] || [];
        var win = (D.promo_windows || {})[a.id] || [];
        var ag = (D.show_agenda ? ((D.agenda || {})[a.id] || []) : []);

        // --- qué cae en cada semana
        var porSemana = weeks.map(function () { return { rel: [], ref: [] }; });
        rel.forEach(function (r) {
          var i = semanaDe(r.date);
          if (i !== null) porSemana[i].rel.push(r);
        });
        ag.forEach(function (it) {
          // Lo que dura varios días se marca en TODAS las semanas que ocupa: dice que esos días
          // el artista ya está cogido, que es para lo que se mira.
          var t = tramoSemanas(it.date, it.end_date);
          if (!t) return;
          for (var i = t[0]; i <= t[1]; i++) porSemana[i].ref.push(it);
        });

        // --- los periodos de promoción, en carriles para que dos que se solapan no se pisen
        var carriles = [];
        var franjas = win.map(function (w) {
          var t = tramoSemanas(w.start_date, w.end_date);
          if (!t) return '';
          var fila = 0;
          while (carriles[fila] !== undefined && carriles[fila] >= t[0]) fila++;
          carriles[fila] = t[1];
          return '<button type="button" class="fc-win' + (w.hidden ? ' is-hidden' : '')
            + (w.is_promotion ? ' is-promo' : '') + (w.draft ? ' is-draft' : '') + '"'
            + (w.is_promotion ? (' data-fc-promo="' + esc(w.url || '') + '"') : (' data-fc-win="' + esc(w.id) + '"'))
            + ' data-fc-key="' + esc(w.key || '') + '"'
            + (CAN && !w.hidden ? ' draggable="true"' : '')
            + ' style="grid-column:' + (t[0] + 1) + ' / span ' + (t[1] - t[0] + 1) + ';grid-row:' + (fila + 1) + ';--c:' + esc(w.color) + '"'
            + ' title="' + esc((w.label ? (w.label + ' · ') : '') + w.name + ' · ' + fechaEs(w.start_date)
                                 + ' – ' + fechaEs(w.end_date) + (w.note ? (' · ' + w.note) : '')
                                 + (w.linked ? (' · ' + w.linked) : '')) + '">'
            + '<i class="fa ' + esc(w.icon) + '"></i><span>' + esc(w.name) + '</span></button>';
        }).join('');
        var filaCeldas = carriles.length + 1;

        var celdas = weeks.map(function (w, i) {
          var c = porSemana[i];
          var hitos = c.rel.map(function (r) {
            var meta = kindMeta(r.release_kind);
            var icono = meta ? meta.icon : (r.kind === 'ALBUM' ? 'fa-compact-disc' : 'fa-music');
            var color = meta ? meta.color : '#6b7280';
            var titulo = r.title + ' · ' + fechaEs(r.date) + (meta ? (' · ' + meta.label) : '')
              + (r.radio_ok ? (' · en ' + r.radio_ok + ' emisora' + (r.radio_ok === 1 ? '' : 's')) : '');
            // ⚠️ Un FOCUS SINGLE se enmarca distinto (`is-focus`): es lo prioritario del trimestre
            // y tiene que verse de un vistazo entre lo demás.
            var clases = 'fc-hito'
              + (r.provisional ? ' is-prov' : '')
              + (r.release_kind === 'FOCUS' ? ' is-focus' : '')
              + (r.hidden ? ' is-hidden' : '');
            return '<span class="fc-rel">'
              + '<button type="button" class="' + clases + '" style="--c:' + esc(color) + '"'
              + ' data-fc-rel="' + esc(r.kind + ':' + r.id) + '" data-fc-key="' + esc(r.key || '') + '"'
              + (CAN && !r.hidden ? ' draggable="true"' : '')
              + ' title="' + esc(titulo) + '">'
              + (r.cover_url ? '<img src="' + esc(r.cover_url) + '" alt="">' : '<i class="fa ' + esc(icono) + '"></i>')
              + (meta ? '<i class="fa ' + esc(meta.icon) + ' fc-hito__k"></i>' : '')
              + ((r.radio || []).length ? '<span class="fc-hito__radio">' + (r.radio || []).length + '</span>' : '')
              + '</button>'
              + '<span class="fc-wkcell__t">' + esc(r.title) + '</span></span>';
          }).join('');
          var refs = '';
          if (c.ref.length) {
            var TOPE = 4;
            refs = '<div class="fc-wkcell__refs">'
              + c.ref.slice(0, TOPE).map(function (it) {
                  return '<span class="fc-ref' + (it.hidden ? ' is-hidden' : '') + '"'
                    + ' style="--c:' + esc(it.color) + '" data-fc-key="' + esc(it.key || '') + '"'
                    + ' title="' + esc((it.label ? it.label + ' · ' : '') + it.title + ' · ' + fechaEs(it.date)
                                        + (it.subtitle ? (' · ' + it.subtitle) : '')) + '">'
                    + '<i class="fa ' + esc(it.icon) + '"></i></span>';
                }).join('')
              + (c.ref.length > TOPE
                  ? '<span class="fc-ref fc-ref--n" title="' + esc(c.ref.slice(TOPE).map(function (x) { return x.title; }).join(' · ')) + '">+'
                    + (c.ref.length - TOPE) + '</span>'
                  : '')
              + '</div>';
          }
          return '<div class="fc-wkcell' + clases(w) + (CAN ? ' is-add' : '') + '"'
            + ' style="grid-column:' + (i + 1) + ';grid-row:' + filaCeldas + '" data-fc-wk="' + i + '"'
            + (CAN ? ' title="Doble clic: periodo de promoción la semana del ' + esc(fechaEs(w.start)) + '"' : '') + '>'
            + (hitos ? '<div class="fc-wkcell__items">' + hitos + '</div>' : '')
            + refs + '</div>';
        }).join('');

        return '<div class="fc-cal__row" data-fc-artistrow="' + esc(a.id) + '" style="--c:' + esc(a.color) + '">'
          + '<div class="fc-cal__who">' + avatar(a.photo_url, 'fa-guitar') + '<span>' + esc(a.name) + '</span></div>'
          + '<div class="fc-cal__weeks" data-fc-track="' + esc(a.id) + '">' + franjas + celdas + '</div>'
          + '</div>';
      }).join('');

      z.innerHTML = '<div class="fc-cal__grid' + (weeks.length <= 8 ? ' is-wide' : '') + '" style="--n:' + weeks.length + '">'
        + head + body + '</div>'
        + (fuera ? ('<div class="fc-cal__rest">' + fuera + ' artista' + (fuera === 1 ? '' : 's')
                    + ' sin nada en este periodo</div>') : '');
      // ⚠️ EL GESTO de cada elemento: pasar el ratón lo EXPLICA (su tooltip), un CLIC lo
      // SELECCIONA y saca la «x» para quitarlo del calendario, y el DOBLE CLIC lo abre.
      z.querySelectorAll('[data-fc-key]').forEach(function (el) {
        var clave = el.getAttribute('data-fc-key') || '';
        if (el.classList.contains('is-hidden')) {
          // Lo que está quitado se ve atenuado y se DEVUELVE pinchándolo.
          el.addEventListener('click', function (ev) { ev.preventDefault(); quitar(clave, true); });
          return;
        }
        el.addEventListener('click', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          selecciona(el, clave);
        });
        el.addEventListener('dblclick', function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          if (el.hasAttribute('data-fc-rel')) openRelease(el.getAttribute('data-fc-rel'));
          else if (el.getAttribute('data-fc-promo')) window.location.href = el.getAttribute('data-fc-promo');
          else if (el.hasAttribute('data-fc-win')) openWindow(el.getAttribute('data-fc-win'));
          else if (el.getAttribute('data-fc-url')) window.location.href = el.getAttribute('data-fc-url');
        });
      });
      // Pinchar fuera suelta la selección (y con ella la «x»).
      z.addEventListener('click', function () { selecciona(null, ''); });

      if (!CAN) return;
      // --- ARRASTRAR: lo que ya está en el calendario cambia de semana; lo que viene de la paleta
      //     se AÑADE en la semana donde se suelte.
      z.querySelectorAll('[draggable="true"][data-fc-key]').forEach(function (el) {
        el.addEventListener('dragstart', function (ev) {
          ev.dataTransfer.setData('text/plain', 'mover:' + el.getAttribute('data-fc-key'));
          ev.dataTransfer.effectAllowed = 'move';
          el.classList.add('is-dragging');
        });
        el.addEventListener('dragend', function () { el.classList.remove('is-dragging'); });
      });
      z.querySelectorAll('[data-fc-wk]').forEach(function (celda) {
        var pista = celda.closest('[data-fc-track]');
        var semana = (weeks[parseInt(celda.getAttribute('data-fc-wk'), 10)] || {}).start || '';
        celda.addEventListener('dragover', function (ev) { ev.preventDefault(); celda.classList.add('is-drop'); });
        celda.addEventListener('dragleave', function () { celda.classList.remove('is-drop'); });
        celda.addEventListener('drop', function (ev) {
          ev.preventDefault();
          celda.classList.remove('is-drop');
          var carga = (ev.dataTransfer.getData('text/plain') || '').split(':');
          var que = carga.shift();
          var resto = carga.join(':');
          if (que === 'mover') mueve(resto, semana);
          else if (que === 'nuevo') sueltaNuevo(resto, pista ? pista.getAttribute('data-fc-track') : '', semana);
        });
      });
      if (!CAN) return;
      // Doble clic en la celda de una semana = periodo de promoción ESA SEMANA (el gesto del
      // calendario de la casa, aquí encajado a la semana: este cuadro no va por días).
      z.querySelectorAll('[data-fc-track]').forEach(function (pista) {
        var aid = pista.getAttribute('data-fc-track');
        pista.querySelectorAll('[data-fc-wk]').forEach(function (celda) {
          celda.addEventListener('dblclick', function () {
            var w = weeks[parseInt(celda.getAttribute('data-fc-wk'), 10)];
            if (w) openWindow(null, { artist_id: aid, start: w.start, end: w.end });
          });
        });
      });
    }

    // ------------------------------------------------------------ B · radio ahora
    function renderWeekNav() {
      var z = root.querySelector('[data-fc-weeknav]');
      z.innerHTML = '<button type="button" class="btn btn-sm btn-outline-secondary" data-fc-week="' + esc(D.week_prev) + '"><i class="fa fa-chevron-left"></i></button>'
        + '<span class="fc-week">' + esc(D.week_label) + '</span>'
        + '<button type="button" class="btn btn-sm btn-outline-secondary" data-fc-week="' + esc(D.week_next) + '"><i class="fa fa-chevron-right"></i></button>';
      z.querySelectorAll('[data-fc-week]').forEach(function (b) {
        b.addEventListener('click', function () { recarga({ week_start: b.getAttribute('data-fc-week') }); });
      });
    }
    function renderRadio() {
      var z = root.querySelector('[data-fc-radio]');
      var arts = visibles();
      var bloques = arts.map(function (a) {
        var filas = ((D.radio_now || {})[a.id] || []);
        if (!filas.length) return '';
        return '<div class="fc-rblock"><div class="fc-rblock__who">' + avatar(a.photo_url, 'fa-guitar')
          + '<span>' + esc(a.name) + '</span><span class="fc-rblock__n">' + filas.length + ' tema' + (filas.length === 1 ? '' : 's') + '</span></div>'
          + filas.map(function (r) {
              var meta = kindMeta(r.release_kind);
              return '<div class="fc-song' + (r.dropped ? ' is-dropped' : '') + '">'
                + '<span class="fc-song__cover">' + (r.cover_url ? '<img src="' + esc(r.cover_url) + '" alt="">' : '<i class="fa fa-music"></i>') + '</span>'
                + '<div class="fc-song__main"><div class="fc-song__title">'
                + (r.url ? '<a href="' + esc(r.url) + '">' + esc(r.title) + '</a>' : esc(r.title))
                + (meta ? ' <span class="fc-badge" style="--c:' + esc(meta.color) + '"><i class="fa ' + esc(meta.icon) + '"></i>' + esc(meta.label) + '</span>' : '')
                + (r.dropped ? ' <span class="fc-badge fc-badge--off"><i class="fa fa-ban"></i>Descartada</span>' : '')
                + '</div>'
                + '<div class="fc-stations">' + (r.stations || []).map(function (s) {
                    var d = s.delta || 0;
                    return '<span class="fc-st" title="' + esc(s.name + ' · ' + s.spins + ' tocada' + (s.spins === 1 ? '' : 's')
                             + (d ? (d > 0 ? (' · +' + d) : (' · ' + d)) : ' · igual que la semana anterior')) + '">'
                      + (s.logo_url ? '<img src="' + esc(s.logo_url) + '" alt="">' : '<i class="fa fa-radio"></i>')
                      + '<b>' + s.spins + '</b>'
                      + (d > 0 ? '<i class="fa fa-arrow-up fc-up"></i>' : (d < 0 ? '<i class="fa fa-arrow-down fc-down"></i>' : ''))
                      + '</span>';
                  }).join('') + '</div></div>'
                + '<div class="fc-song__side"><span class="fc-spins" title="Tocadas de la semana">' + r.spins + '</span>'
                + (CAN ? '<button type="button" class="btn btn-sm btn-link p-0 fc-drop" data-fc-drop="' + esc(r.song_id) + '" data-undo="' + (r.dropped ? '1' : '') + '">'
                    + (r.dropped ? 'Recuperar' : 'Descartar') + '</button>' : '')
                + '</div></div>';
            }).join('')
          + '</div>';
      }).filter(Boolean).join('');
      z.innerHTML = bloques || '<div class="fc-empty">Ningún tema de estos artistas suena en la semana del ' + esc(D.week_label) + '.</div>';
      z.querySelectorAll('[data-fc-drop]').forEach(function (b) {
        b.addEventListener('click', function () {
          var undo = b.getAttribute('data-undo') === '1';
          post(U.drop.replace('SID', b.getAttribute('data-fc-drop')) + (undo ? '?undo=1' : ''), {})
            .then(function (r) { if (r && r.ok) recarga({}); else alert((r && r.error) || 'No se pudo guardar.'); });
        });
      });
    }

    // ------------------------------------------------------------ C · última entrada
    function renderLast() {
      var z = root.querySelector('[data-fc-last]');
      var arts = visibles();
      var h = arts.map(function (a) {
        var filas = ((D.last_entries || {})[a.id] || []);
        if (!filas.length) return '';
        return '<div class="fc-lblock"><div class="fc-rblock__who">' + avatar(a.photo_url, 'fa-guitar') + '<span>' + esc(a.name) + '</span></div>'
          + filas.map(function (r) {
              return '<div class="fc-last__row' + (r.stale ? ' is-stale' : '') + '">'
                + '<span class="fc-st__logo">' + (r.logo_url ? '<img src="' + esc(r.logo_url) + '" alt="">' : '<i class="fa fa-radio"></i>') + '</span>'
                + '<span class="fc-last__st">' + esc(r.station) + '</span>'
                + '<span class="fc-last__song">' + esc(r.title) + '</span>'
                + '<span class="fc-last__when" title="' + esc('Entró el ' + r.entered_label) + '">' + esc(r.ago) + '</span>'
                + '</div>';
            }).join('')
          + '</div>';
      }).filter(Boolean).join('');
      z.innerHTML = h || '<div class="fc-empty">Todavía no consta ninguna entrada en radio de estos artistas.</div>';
    }

    // ------------------------------------------------------------ D · presentaciones
    var PITCH_ST = { PENDING: ['Pendiente', 'fa-hourglass-half', '#f59e0b'],
                     ACCEPTED: ['Entra', 'fa-check', '#198754'],
                     REJECTED: ['No entra', 'fa-xmark', '#6c757d'] };
    function renderPitchModes() {
      var z = root.querySelector('[data-fc-pitchmodes]');
      z.innerHTML = '<div class="btn-group btn-group-sm" role="group">'
        + '<button type="button" class="btn btn-outline-secondary' + (pitchMode === 'station' ? ' active' : '') + '" data-fc-pm="station">Por emisora</button>'
        + '<button type="button" class="btn btn-outline-secondary' + (pitchMode === 'artist' ? ' active' : '') + '" data-fc-pm="artist">Por artista</button>'
        + '</div>';
      z.querySelectorAll('[data-fc-pm]').forEach(function (b) {
        b.addEventListener('click', function () { pitchMode = b.getAttribute('data-fc-pm'); renderPitches(); renderPitchModes(); });
      });
    }
    function renderPitches() {
      var z = root.querySelector('[data-fc-pitches]');
      var filas = D.pitches || [];
      if (!filas.length) { z.innerHTML = '<div class="fc-empty">No hay presentaciones a radio programadas en este periodo.</div>'; return; }
      var grupos = {};
      filas.forEach(function (r) {
        var clave = (pitchMode === 'station') ? (r.station || 'Sin emisora') : ((artistById(r.artist_id) || {}).name || 'Sin artista');
        (grupos[clave] = grupos[clave] || []).push(r);
      });
      z.innerHTML = Object.keys(grupos).sort().map(function (g) {
        var rows = grupos[g];
        var cabecera = (pitchMode === 'station')
          ? ('<span class="fc-st__logo">' + (rows[0].logo_url ? '<img src="' + esc(rows[0].logo_url) + '" alt="">' : '<i class="fa fa-radio"></i>') + '</span>' + esc(g))
          : (avatar(((artistById(rows[0].artist_id) || {}).photo_url) || '', 'fa-guitar') + esc(g));
        return '<div class="fc-pblock"><div class="fc-rblock__who">' + cabecera
          + '<span class="fc-rblock__n">' + rows.length + '</span></div>'
          + rows.map(function (r) {
              var st = PITCH_ST[r.status] || PITCH_ST.PENDING;
              return '<div class="fc-pitch">'
                + '<span class="fc-song__cover">' + (r.cover_url ? '<img src="' + esc(r.cover_url) + '" alt="">' : '<i class="fa fa-music"></i>') + '</span>'
                + '<div class="fc-pitch__main"><div>' + esc(r.title) + '</div>'
                + '<div class="fc-sub">' + (pitchMode === 'station' ? esc((artistById(r.artist_id) || {}).name || '') : esc(r.station)) + '</div></div>'
                + '<span class="fc-pitch__date">' + esc(r.date_label) + '</span>'
                + '<span class="fc-badge" style="--c:' + st[2] + '"><i class="fa ' + st[1] + '"></i>' + st[0] + '</span>'
                + '</div>';
            }).join('')
          + '</div>';
      }).join('');
    }

    // ------------------------------------------------------------ pop-ups
    function modal(id, titulo, cuerpo, botones) {
      var m = document.getElementById(id);
      if (m) m.remove();
      m = el('<div class="modal fade" id="' + id + '" tabindex="-1"><div class="modal-dialog modal-dialog-scrollable"><div class="modal-content">'
        + '<div class="modal-header"><h5 class="modal-title">' + esc(titulo) + '</h5>'
        + '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>'
        + '<div class="modal-body">' + cuerpo + '</div><div class="modal-footer"></div></div></div></div>');
      document.body.appendChild(m);
      var pie = m.querySelector('.modal-footer');
      (botones || []).forEach(function (b) {
        var bt = el('<button type="button" class="btn ' + (b.cls || 'btn-outline-secondary') + '">' + esc(b.label) + '</button>');
        bt.addEventListener('click', function () { b.click(m); });
        pie.appendChild(bt);
      });
      var inst = (window.bootstrap && window.bootstrap.Modal) ? new window.bootstrap.Modal(m) : null;
      if (inst) inst.show();
      m.addEventListener('hidden.bs.modal', function () { m.remove(); });
      return { el: m, hide: function () { if (inst) inst.hide(); else m.remove(); } };
    }

    /* Un lanzamiento: qué es (focus / continuidad) y a qué emisoras va. */
    function openRelease(clave) {
      var partes = String(clave || '').split(':');
      var tipo = partes[0], id = partes[1];
      var fila = null, artista = null;
      Object.keys(D.releases || {}).forEach(function (aid) {
        (D.releases[aid] || []).forEach(function (r) { if (r.kind === tipo && r.id === id) { fila = r; artista = aid; } });
      });
      if (!fila) return;
      var meta = kindMeta(fila.release_kind);
      var cuerpo = '<div class="fc-relhead">'
        + '<span class="fc-song__cover fc-song__cover--lg">' + (fila.cover_url ? '<img src="' + esc(fila.cover_url) + '" alt="">' : '<i class="fa fa-music"></i>') + '</span>'
        + '<div><div class="fw-semibold">' + esc(fila.title) + '</div>'
        + '<div class="text-muted small">' + esc((artistById(artista) || {}).name || '') + ' · ' + esc(fechaEs(fila.date))
        + (fila.provisional ? ' · Provisional' : '') + '</div>'
        + (fila.url ? '<a class="small" href="' + esc(fila.url) + '">Abrir su ficha</a>' : '') + '</div></div>';
      if (tipo === 'SONG') {
        cuerpo += '<div class="fc-relkind mt-3"><div class="form-label">¿Qué es en el planteamiento?</div>'
          + (D.release_kinds || []).map(function (k) {
              return '<button type="button" class="fc-pick' + (fila.release_kind === k.key ? ' is-on' : '') + '" data-k="' + esc(k.key) + '" style="--c:' + esc(k.color) + '">'
                + '<i class="fa ' + esc(k.icon) + '"></i>' + esc(k.label) + '</button>';
            }).join('')
          + '<button type="button" class="fc-pick' + (fila.release_kind ? '' : ' is-on') + '" data-k="">Sin decidir</button></div>';
        cuerpo += '<div class="mt-3"><div class="form-label">A qué emisoras va</div>'
          + ((fila.radio || []).length
              ? '<div class="fc-stations">' + fila.radio.map(function (r) {
                  var st = PITCH_ST[r.status] || PITCH_ST.PENDING;
                  return '<span class="fc-st" title="' + esc(r.name + ' · ' + st[0] + (r.start_date ? (' · ' + fechaEs(r.start_date)) : '')) + '">'
                    + (r.logo_url ? '<img src="' + esc(r.logo_url) + '" alt="">' : '<i class="fa fa-radio"></i>')
                    + '<b>' + esc(r.name) + '</b><i class="fa ' + st[1] + '" style="color:' + st[2] + '"></i></span>';
                }).join('') + '</div>'
              : '<div class="text-muted small">Todavía no se ha presentado a ninguna emisora.</div>')
          + (CAN ? '<div class="mt-2"><a class="small" href="' + esc(fila.url || '#') + '">Presentarla a radio desde su ficha</a></div>' : '')
          + '</div>';
      }
      var m = modal('fcRelModal', 'Lanzamiento', cuerpo, [{ label: 'Cerrar', click: function () { m.hide(); } }]);
      if (!CAN || tipo !== 'SONG') return;
      m.el.querySelectorAll('[data-k]').forEach(function (b) {
        b.addEventListener('click', function () {
          post(U.kind.replace('SID', fila.id), { kind: b.getAttribute('data-k') })
            .then(function (r) {
              if (r && r.ok) { m.hide(); recarga({}); }
              else alert((r && r.error) || 'No se pudo guardar.');
            });
        });
      });
    }

    /* Un PERIODO DE PROMOCIÓN: de quién, cuándo, de qué y qué es. */
    function openWindow(wid, pre) {
      var fila = null;
      Object.keys(D.promo_windows || {}).forEach(function (aid) {
        (D.promo_windows[aid] || []).forEach(function (w) { if (w.id === String(wid)) fila = Object.assign({ artist_id: aid }, w); });
      });
      pre = pre || {};
      var artista = (fila && fila.artist_id) || pre.artist_id || D.artist_id || ((D.artists || [])[0] || {}).id || '';
      var desde = (fila && fila.start_date) || pre.start || D.week_start || '';
      var hasta = (fila && fila.end_date) || pre.end || pre.start || desde;
      var cuerpo = '<div class="row g-2">'
        + '<div class="col-12"><label class="form-label">Artista</label><select class="form-select" data-w="artist_id">'
        + (D.artists || []).map(function (a) {
            return '<option value="' + esc(a.id) + '"' + (a.id === artista ? ' selected' : '') + '>' + esc(a.name) + '</option>';
          }).join('') + '</select></div>'
        + '<div class="col-md-6"><label class="form-label">Desde</label><input class="form-control" type="date" data-w="start_date" value="' + esc(desde) + '"></div>'
        + '<div class="col-md-6"><label class="form-label">Hasta</label><input class="form-control" type="date" data-w="end_date" value="' + esc(hasta) + '"></div>'
        + '<div class="col-12"><label class="form-label">¿Qué es?</label><div class="fc-relkind">'
        + (D.window_kinds || []).map(function (k) {
            var on = (fila ? fila.kind : 'PROMO') === k.key;
            return '<button type="button" class="fc-pick' + (on ? ' is-on' : '') + '" data-wk="' + esc(k.key) + '" style="--c:' + esc(k.color) + '">'
              + '<i class="fa ' + esc(k.icon) + '"></i>' + esc(k.label) + '</button>';
          }).join('') + '</div><input type="hidden" data-w="kind" value="' + esc(fila ? fila.kind : 'PROMO') + '"></div>'
        + '<div class="col-12"><label class="form-label">Nombre <span class="text-muted small">(si se deja vacío se compone solo)</span></label>'
        + '<input class="form-control" data-w="name" value="' + esc(fila ? (fila.linked ? '' : fila.name) : '') + '"></div>'
        + '<div class="col-12"><label class="form-label">De qué lanzamiento <span class="text-muted small">(opcional)</span></label>'
        + '<select class="form-select" data-w="song_id"><option value="">— sin vincular —</option>'
        + ((D.releases || {})[artista] || []).filter(function (r) { return r.kind === 'SONG'; }).map(function (r) {
            return '<option value="' + esc(r.id) + '"' + ((fila && fila.song_id === r.id) ? ' selected' : '') + '>' + esc(r.title) + ' · ' + esc(fechaEs(r.date)) + '</option>';
          }).join('') + '</select>'
        + '<div class="form-text">Vinculado a un lanzamiento, el nombre se compone solo y se ve a qué está atado.</div></div>'
        + '<div class="col-12"><label class="form-label">Nota</label><textarea class="form-control" rows="2" data-w="note">' + esc(fila ? fila.note : '') + '</textarea></div>'
        + '</div>';
      var botones = [{ label: 'Cancelar', click: function () { m.hide(); } }];
      if (fila) botones.push({ label: 'Eliminar', cls: 'btn-outline-danger', click: function () {
        if (!confirm('¿Eliminar este periodo de promoción?')) return;
        post(U.windowDel.replace('WID', fila.id), {}).then(function (r) {
          if (r && r.ok) { m.hide(); recarga({}); } else alert((r && r.error) || 'No se pudo eliminar.');
        });
      } });
      botones.push({ label: 'Guardar', cls: 'btn-primary', click: function () {
        var d = { id: (fila ? fila.id : '') };
        m.el.querySelectorAll('[data-w]').forEach(function (i) { d[i.getAttribute('data-w')] = i.value; });
        if (!d.start_date) { alert('Falta la fecha de comienzo.'); return; }
        post(U.window, d).then(function (r) {
          if (r && r.ok) { m.hide(); recarga({}); } else alert((r && r.error) || 'No se pudo guardar.');
        });
      } });
      var m = modal('fcWinModal', fila ? 'Periodo de promoción' : 'Nuevo periodo de promoción', cuerpo, botones);
      m.el.querySelectorAll('[data-wk]').forEach(function (b) {
        b.addEventListener('click', function () {
          m.el.querySelectorAll('[data-wk]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
          m.el.querySelector('[data-w="kind"]').value = b.getAttribute('data-wk');
        });
      });
      // Al cambiar de artista, los lanzamientos que se ofrecen son LOS SUYOS.
      m.el.querySelector('[data-w="artist_id"]').addEventListener('change', function (ev) {
        var sel = m.el.querySelector('[data-w="song_id"]');
        var lista = (D.releases || {})[ev.target.value] || [];
        sel.innerHTML = '<option value="">— sin vincular —</option>'
          + lista.filter(function (r) { return r.kind === 'SONG'; }).map(function (r) {
              return '<option value="' + esc(r.id) + '">' + esc(r.title) + ' · ' + esc(fechaEs(r.date)) + '</option>';
            }).join('');
      });
    }

    function render() {
      renderTools(); renderArtists(); renderPalette(); renderLegend();
      renderCal(); renderWeekNav(); renderRadio(); renderLast();
      renderPitchModes(); renderPitches();
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
