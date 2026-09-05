/* EL SELECTOR DE TEMAS DE UNA PLAYLIST · motor ÚNICO.
 *
 * Lo usan los DOS sitios donde se monta una playlist, y por eso se comportan igual:
 *   · el EDITOR de una playlist (`playlist_detail.html?edit=1`), y
 *   · el ASISTENTE de «+ Playlist selección» (paso de los temas).
 *
 * Va SIEMPRE a la DERECHA, con la playlist a la izquierda: así, según crece la playlist, el sitio
 * donde se ven el repertorio y las maquetas NO se encoge.
 *
 * Tres pasos, los de siempre: de dónde (maquetas o repertorio) → de quién → sus temas. Lo que YA
 * está en la playlist se ve **en verde** con su check, y pinchar un tema lo añade al final.
 *
 * Uso:
 *   window.app33PlaylistPicker.init(zona, {
 *     onAdd: function (fila) { ... },        // añadir a la playlist
 *     tiene: function (kind, id) { ... },    // ¿ya está? → se pinta en verde
 *   });
 * y `zona.plPickRefresh()` para repasar los verdes cuando la playlist cambia (p. ej. al quitar una).
 */
(function () {
  'use strict';

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(t) {
    return (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function init(zona, opciones) {
    if (!zona || zona.dataset.plPickReady === '1') return;
    zona.dataset.plPickReady = '1';
    var opts = opciones || {};
    var url = zona.getAttribute('data-picker-url') || '';
    var cuerpo = zona.querySelector('[data-plpick-body]');
    var sub = zona.querySelector('[data-plpick-sub]');
    var atras = zona.querySelector('[data-plpick-back]');
    if (!cuerpo) return;
    var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
    var estado = { paso: 'fuente', source: '', artist: '', artistName: '' };

    function cargando() {
      cuerpo.innerHTML = '<div class="text-center text-muted py-4"><i class="fa fa-spinner fa-spin"></i></div>';
    }

    /* Los que YA están en la playlist se ven en VERDE con su check. */
    function marca() {
      if (typeof opts.tiene !== 'function') return;
      Array.prototype.forEach.call(cuerpo.querySelectorAll('[data-pick-add]'), function (b) {
        var puesto = !!opts.tiene((b.getAttribute('data-kind') || 'SONG').toUpperCase(),
                                  b.getAttribute('data-id') || '');
        b.classList.toggle('is-added', puesto);
        var ico = b.querySelector('[data-pick-ico]');
        if (ico) ico.className = 'fa-solid ' + (puesto ? 'fa-circle-check' : 'fa-circle-plus')
          + ' text-success' + ' pl-pick-song__ico';
      });
    }
    zona.plPickRefresh = marca;

    function pintaFuente() {
      estado.paso = 'fuente';
      if (sub) sub.textContent = '¿De dónde la cogemos?';
      if (atras) atras.classList.add('d-none');
      cuerpo.innerHTML =
        '<div class="pl-pick-sources">' +
          '<button class="pl-pick-source" type="button" data-pick-source="demos">' +
            '<i class="fa fa-compact-disc"></i><span>Demos</span>' +
            '<span class="small text-muted">Las maquetas que se están valorando</span></button>' +
          '<button class="pl-pick-source" type="button" data-pick-source="repertorio">' +
            '<i class="fa fa-music"></i><span>Repertorio</span>' +
            '<span class="small text-muted">Las canciones del catálogo</span></button>' +
        '</div>';
    }

    function grupoHtml(g) {
      var img = g.photo
        ? '<img src="' + esc(g.photo) + '" alt="" data-avatar="1">'
        : '<span class="pl-pick-artist__icon"><i class="fa ' + esc(g.icon || 'fa-user') + '"></i></span>';
      return '<button class="pl-pick-artist" type="button" data-pick-artist="' + esc(g.id) + '"'
        + ' data-name="' + esc(g.name) + '">' + img
        + '<span class="pl-pick-artist__name">' + esc(g.name) + '</span>'
        + '<span class="badge text-bg-light border">' + (g.count || 0) + '</span></button>';
    }

    function pintaArtistas(js) {
      estado.paso = 'artistas';
      if (sub) sub.textContent = (estado.source === 'demos') ? 'Demos · elige de quién'
                                                             : 'Repertorio · elige el artista';
      if (atras) atras.classList.remove('d-none');
      var html = '<input class="form-control form-control-sm mb-2" data-pick-filter placeholder="Buscar…" autocomplete="off">';
      if (estado.source === 'demos') {
        var grupos = js.groups || [];
        html += grupos.length ? '<div class="pl-pick-artists">' + grupos.map(grupoHtml).join('') + '</div>'
                              : '<div class="alert alert-light border mb-0">No hay maquetas todavía.</div>';
      } else {
        var act = js.active || [], otros = js.others || [];
        html += act.length ? '<div class="pl-pick-artists">' + act.map(grupoHtml).join('') + '</div>'
                           : '<div class="alert alert-light border mb-0">Ningún artista activo con repertorio.</div>';
        if (otros.length) {
          html += '<div class="mt-3"><button class="btn btn-sm btn-outline-secondary" type="button" data-pick-more>'
            + '<i class="fa fa-chevron-down me-1"></i>Ver más artistas (' + otros.length + ')</button>'
            + '<div class="pl-pick-artists mt-2 d-none" data-pick-others>' + otros.map(grupoHtml).join('') + '</div></div>';
        }
      }
      cuerpo.innerHTML = html;
    }

    function pintaTemas(filas) {
      estado.paso = 'temas';
      if (sub) sub.textContent = estado.artistName + ' · pincha el tema para añadirlo';
      if (atras) atras.classList.remove('d-none');
      if (!filas.length) {
        cuerpo.innerHTML = '<div class="alert alert-light border mb-0">No hay nada aquí.</div>';
        return;
      }
      // ⚠️ Los datos van en data-* SUELTOS, no en un JSON dentro del atributo: un JSON con comillas
      //    dentro de un atributo se corta en la primera comilla (el mismo tropiezo que `|tojson`).
      cuerpo.innerHTML =
        '<input class="form-control form-control-sm mb-2" data-pick-filter placeholder="Buscar…" autocomplete="off">'
        + '<div class="pl-pick-songs">' + filas.map(function (f) {
          return '<button class="pl-pick-song" type="button" data-pick-add="1"'
            + ' data-kind="' + esc(f.kind) + '" data-id="' + esc(f.id) + '"'
            + ' data-title="' + esc(f.title) + '" data-cover="' + esc(f.cover_url || '') + '"'
            + ' data-artist="' + esc(f.artist_name || '') + '" data-photo="' + esc(f.artist_photo || '') + '"'
            + ' data-subtitle="' + esc(f.subtitle || '') + '">'
            + '<img src="' + esc(f.cover_url || COVER) + '" alt="" data-cover>'
            + '<span class="pl-pick-song__main"><span class="pl-pick-song__title">' + esc(f.title) + '</span>'
            + '<span class="pl-pick-song__sub">' + esc(f.artist_name || '')
            + (f.subtitle ? ' · ' + esc(f.subtitle) : '') + '</span></span>'
            + (f.playable ? '' : '<span class="badge text-bg-light border text-muted" title="Sin audio">sin audio</span>')
            + '<i class="fa-solid fa-circle-plus text-success pl-pick-song__ico" data-pick-ico></i></button>';
        }).join('') + '</div>';
      marca();
    }

    function pide(params) {
      cargando();
      var u = url + (url.indexOf('?') >= 0 ? '&' : '?') + new URLSearchParams(params).toString();
      return fetch(u, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: false }; });
    }

    cuerpo.addEventListener('click', function (ev) {
      var fuente = ev.target.closest('[data-pick-source]');
      if (fuente) {
        estado.source = fuente.getAttribute('data-pick-source');
        pide({ source: estado.source }).then(function (js) {
          if (!js || !js.ok) { cuerpo.innerHTML = '<div class="alert alert-danger mb-0">No se pudo cargar.</div>'; return; }
          pintaArtistas(js);
        });
        return;
      }
      var mas = ev.target.closest('[data-pick-more]');
      if (mas) {
        var caja = cuerpo.querySelector('[data-pick-others]');
        if (caja) caja.classList.remove('d-none');
        mas.classList.add('d-none');
        return;
      }
      var art = ev.target.closest('[data-pick-artist]');
      if (art) {
        estado.artist = art.getAttribute('data-pick-artist');
        estado.artistName = art.getAttribute('data-name') || '';
        pide({ source: estado.source, artist: estado.artist }).then(function (js) {
          if (!js || !js.ok) { cuerpo.innerHTML = '<div class="alert alert-danger mb-0">No se pudo cargar.</div>'; return; }
          pintaTemas(js.rows || []);
        });
        return;
      }
      var add = ev.target.closest('[data-pick-add]');
      if (add && typeof opts.onAdd === 'function') {
        opts.onAdd({
          kind: (add.getAttribute('data-kind') || 'SONG').toUpperCase(),
          id: add.getAttribute('data-id') || '',
          title: add.getAttribute('data-title') || '',
          cover_url: add.getAttribute('data-cover') || '',
          artist_name: add.getAttribute('data-artist') || '',
          artist_photo: add.getAttribute('data-photo') || '',
          subtitle: add.getAttribute('data-subtitle') || ''
        });
        marca();
      }
    });

    cuerpo.addEventListener('input', function (ev) {
      if (!ev.target.matches('[data-pick-filter]')) return;
      var q = norm(ev.target.value);
      Array.prototype.forEach.call(cuerpo.querySelectorAll('.pl-pick-artist, .pl-pick-song'), function (el) {
        el.classList.toggle('d-none', !!q && norm(el.textContent).indexOf(q) < 0);
      });
    });

    if (atras) atras.addEventListener('click', function () {
      if (estado.paso === 'temas') {
        pide({ source: estado.source }).then(function (js) { if (js && js.ok) pintaArtistas(js); });
      } else {
        pintaFuente();
      }
    });

    pintaFuente();
  }

  window.app33PlaylistPicker = { init: init };
})();
