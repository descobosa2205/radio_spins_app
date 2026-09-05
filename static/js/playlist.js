/* PLAYLIST (Discográfica) · reproductor + edición.
 *
 * Dos piezas independientes, las dos no-op si su marca no está en la pantalla:
 *
 *  1) REPRODUCTOR (`[data-playlist-player]`, en la ficha y en el enlace público): al pasar el ratón la
 *     línea se subraya y sale el play sobre la portada; al pinchar en cualquier sitio de la línea
 *     suena, y a la derecha aparece la barra (pausar, arrastrar para moverte y el segundo por el que
 *     vas). Al terminar una canción arranca la siguiente. SOLO SUENA UNA A LA VEZ (un único <audio>).
 *     La DURACIÓN la lee el navegador (`preload="metadata"`, una lectura del principio del archivo) de
 *     una en una para no hacer una ráfaga de peticiones, y se apunta en el servidor la primera vez
 *     (`data-duration-base`) para no volver a pedirla en cada carga.
 *
 *  2) EDICIÓN (`[data-playlist-edit]`): el estado vive en el array `rows` y se repinta al añadir,
 *     borrar o reordenar (mismo patrón que el set list de una actividad); «Guardar» manda todo el
 *     array. Las líneas se arrastran, y el pop-up de añadir va de fuente (demos/repertorio) a artista
 *     y de artista a temas.
 *
 * ⚠️ El audio se pide SIEMPRE a nuestro endpoint puente (`data-pl-src`), nunca a Storage: por eso la
 * playlist puede decir que no se descarga.
 *
 * ⚠️⚠️ **LOS BOTONES DEL DISPOSITIVO** (Media Session): mientras suena, la playlist se comporta como
 * lo que es —música—, así que la **pantalla de bloqueo del iPhone**, **CarPlay** en el coche, los
 * **AirPods** (doble toque), el Centro de control, el reloj y los botones del volante pueden
 * **pasar de canción, retroceder, parar y seguir**, y enseñan el título, el artista y la portada.
 * Lo hace `mediaSession` (ver `initMediaSession`): metadatos al empezar cada tema, los mandos
 * (`nexttrack`/`previoustrack`/`play`/`pause`/`stop`/`seekto`) y la posición, para que la barra del
 * coche se mueva. Donde el navegador no lo tenga, no pasa nada: se ignora.
 */
(function () {
  'use strict';

  function esc(v) {
    return (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(seg) {
    var s = Math.max(0, Math.round(seg || 0));
    if (!isFinite(s)) return '';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(r).padStart(2, '0');
  }
  function csrfHeaders() {
    var t = document.querySelector('meta[name="csrf-token"]');
    var h = { 'X-Requested-With': 'XMLHttpRequest' };
    if (t && t.getAttribute('content')) h['X-CSRFToken'] = t.getAttribute('content');
    return h;
  }
  function post(url, data) {
    var body = new URLSearchParams();
    Object.keys(data || {}).forEach(function (k) { body.append(k, data[k]); });
    return fetch(url, { method: 'POST', headers: csrfHeaders(), body: body })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .catch(function () { return { ok: false }; });
  }

  /* ===================== 1) REPRODUCTOR ===================== */
  function initPlayer(root) {
    if (!root || root.dataset.plPlayerReady === '1') return;
    root.dataset.plPlayerReady = '1';

    var filas = Array.prototype.slice.call(root.querySelectorAll('[data-pl-row]'))
      .filter(function (li) { return !!li.getAttribute('data-pl-src'); });
    if (!filas.length) return;

    /* ⚠️⚠️ EL <audio> TIENE QUE ESTAR EN LA PÁGINA, no suelto en memoria. Un `new Audio()` que no
       se cuelga del documento SUENA igual, pero para **Safari (el iPhone y el Mac)** no es «lo que
       está sonando en este dispositivo»: no entra en el Now Playing del sistema, así que **ni la
       pantalla de bloqueo, ni CarPlay, ni el coche por Bluetooth, ni los AirPods, ni el Centro de
       control enseñan el tema ni dejan pasar de canción**. En Chrome funciona de las dos formas —por
       eso probándolo en el navegador de aquí «iba»— y en Safari no. Sin `controls` no se ve nada ni
       ocupa sitio: es el mismo reproductor de siempre, pero colgado del documento. */
    var audio = document.createElement('audio');
    audio.preload = 'none';
    audio.setAttribute('playsinline', '');            // iOS: nada de abrir el reproductor a pantalla completa
    audio.setAttribute('aria-hidden', 'true');
    try { document.body.appendChild(audio); } catch (e) {}
    var actual = -1;                       // índice de la fila que está sonando
    var arrastrando = false;

    function zona(li) { return li.querySelector('[data-pl-player-zone]'); }

    function limpia(li) {
      li.classList.remove('is-playing', 'is-paused');
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = '0%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = '0%';
      var t = li.querySelector('[data-pl-time]'); if (t) t.textContent = '0:00';
      var ic = li.querySelector('[data-pl-icon]'); if (ic) ic.className = 'fa fa-play';
    }

    function pinta() {
      filas.forEach(function (li, i) {
        if (i !== actual) { limpia(li); return; }
        li.classList.add('is-playing');
        li.classList.toggle('is-paused', audio.paused);
        var ic = li.querySelector('[data-pl-icon]');
        if (ic) ic.className = 'fa ' + (audio.paused ? 'fa-play' : 'fa-pause');
        var bt = li.querySelector('[data-pl-toggle] i');
        if (bt) bt.className = 'fa ' + (audio.paused ? 'fa-play' : 'fa-pause');
      });
    }

    function progreso() {
      if (actual < 0 || arrastrando) return;
      var li = filas[actual];
      var total = audio.duration;
      var pct = (isFinite(total) && total > 0) ? (audio.currentTime / total) * 100 : 0;
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = pct + '%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = pct + '%';
      var t = li.querySelector('[data-pl-time]'); if (t) t.textContent = fmt(audio.currentTime);
    }

    function suena(idx) {
      if (idx < 0 || idx >= filas.length) return;
      if (idx === actual) {                     // la misma: pausa o sigue
        if (audio.paused) { audio.play().catch(function () {}); } else { audio.pause(); }
        pinta();
        return;
      }
      actual = idx;
      var li = filas[idx];
      audio.src = li.getAttribute('data-pl-src');
      audio.currentTime = 0;
      pinta();
      // Lo que va a ver el coche (o la pantalla de bloqueo) y los botones que va a poder usar.
      metadatos(li);
      enganchaMandos();
      if (ms) { try { ms.playbackState = 'playing'; } catch (e) {} }
      audio.play().catch(function () { pinta(); });
    }

    /* ---------- LOS BOTONES DEL DISPOSITIVO (Media Session) ----------
       Para que el iPhone, CarPlay, los AirPods o el reloj puedan pasar de canción hay que decirle al
       sistema QUÉ está sonando y QUÉ se puede hacer. Es lo que convierte esto, para el coche, en
       «música» y no en «un sonido de una web». */
    var ms = (typeof navigator !== 'undefined' && navigator.mediaSession) ? navigator.mediaSession : null;

    function abs(url) {
      try { return new URL(url, window.location.href).href; } catch (e) { return url || ''; }
    }
    function metadatos(li) {
      if (!ms || !window.MediaMetadata) return;
      var portada = li.getAttribute('data-pl-cover') || '';
      var arte = [];
      if (portada) {
        // ⚠️ Se declaran VARIOS tamaños con la misma imagen: cada sitio (la pantalla de bloqueo, el
        // coche, el reloj) pide el que le cuadra y, sin candidatos, algunos no enseñan ninguna.
        // ⚠️ El `type` se DEDUCE de la extensión y, si no se sabe, no se pone: un `type: ''` hace
        // que algunos sistemas descarten la imagen y el coche se queda sin portada.
        var m = /\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(portada || '');
        var tipo = m ? ('image/' + (m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase())) : '';
        ['256x256', '512x512'].forEach(function (tam) {
          var a = { src: abs(portada), sizes: tam };
          if (tipo) a.type = tipo;
          arte.push(a);
        });
      }
      try {
        ms.metadata = new MediaMetadata({
          title: li.getAttribute('data-pl-title') || '',
          artist: li.getAttribute('data-pl-artist') || '',
          album: album,
          artwork: arte
        });
      } catch (e) {}
    }
    function posicion() {
      if (!ms || typeof ms.setPositionState !== 'function') return;
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      try {
        ms.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime || 0, audio.duration)
        });
      } catch (e) {}
    }
    function mando(nombre, fn) {
      if (!ms || typeof ms.setActionHandler !== 'function') return;
      // ⚠️ Un mando que el navegador no conozca revienta: cada uno en su try.
      try { ms.setActionHandler(nombre, fn); } catch (e) {}
    }
    // El «disco» es la playlist (o la pantalla): es lo que se lee debajo del tema en el coche.
    var album = (root.getAttribute('data-pl-album') || '').trim()
                || (document.title || '').split('·')[0].trim();

    /* ⚠️ SALTAR DE TEMA es lo que hacen el volante, el doble toque de los AirPods y la pantalla de
       bloqueo. `previous` se comporta como en cualquier reproductor: si ya lleva un rato sonando,
       vuelve al principio del tema; si acaba de empezar, va al anterior. */
    function siguienteTema() {
      if (actual < 0) { suena(0); return; }
      if (actual + 1 < filas.length) { var i = actual + 1; actual = -1; limpia(filas[i - 1]); suena(i); }
      else { audio.pause(); }
    }
    function temaAnterior() {
      if (actual < 0) { suena(0); return; }
      if ((audio.currentTime || 0) > 3 || actual === 0) {
        try { audio.currentTime = 0; } catch (e) {}
        audio.play().catch(function () {});
        return;
      }
      var i = actual - 1;
      limpia(filas[actual]);
      actual = -1;
      suena(i);
    }
    function enganchaMandos() {
      /* ⚠️ Se vuelven a enganchar en CADA tema, a propósito: en una pantalla puede haber más de un
         reproductor (el de la ficha y el de una lista), los mandos del sistema son UNOS SOLOS y los
         registra el último que suena. Con un cerrojo de «ya está hecho», al volver al primero los
         botones del coche seguían mandando sobre el otro. Registrarlos no cuesta nada. */
      if (!ms) return;
      mando('play', function () { audio.play().catch(function () {}); });
      mando('pause', function () { audio.pause(); });
      mando('stop', function () { audio.pause(); try { audio.currentTime = 0; } catch (e) {} });
      mando('nexttrack', siguienteTema);
      mando('previoustrack', temaAnterior);
      mando('seekbackward', function (d) {
        var s = (d && d.seekOffset) || 10;
        try { audio.currentTime = Math.max(0, (audio.currentTime || 0) - s); } catch (e) {}
      });
      mando('seekforward', function (d) {
        var s = (d && d.seekOffset) || 10;
        try { audio.currentTime = Math.min(audio.duration || 0, (audio.currentTime || 0) + s); } catch (e) {}
      });
      mando('seekto', function (d) {
        if (!d || d.seekTime == null) return;
        try { audio.currentTime = d.seekTime; } catch (e) {}
        posicion();
      });
    }

    audio.addEventListener('timeupdate', progreso);
    audio.addEventListener('timeupdate', posicion);
    audio.addEventListener('play', pinta);
    audio.addEventListener('pause', pinta);
    audio.addEventListener('play', function () {
      // Si mientras tanto ha sonado OTRO reproductor de la página, los mandos del sistema son suyos:
      // se vuelven a coger al arrancar este.
      enganchaMandos();
      if (ms) { try { ms.playbackState = 'playing'; } catch (e) {} }
    });
    audio.addEventListener('pause', function () { if (ms) { try { ms.playbackState = 'paused'; } catch (e) {} } });
    audio.addEventListener('loadedmetadata', function () {
      if (actual < 0) return;
      var li = filas[actual];
      var etq = li.querySelector('[data-pl-durlabel]');
      if (etq && !etq.textContent.trim() && isFinite(audio.duration)) etq.textContent = fmt(audio.duration);
      progreso();
      posicion();          // con la duración ya sabida, la barra del coche se puede mover
    });
    audio.addEventListener('ended', function () {
      /* ⚠️ SE AVISA DE QUE ESE TEMA SE HA ESCUCHADO ENTERO. El reproductor no sabe nada de
         valoraciones: solo lanza el evento y quien lo escuche decide (el mismo patrón que
         `agenda:external-drop`). Es lo que abre la puntuación en una playlist de valoración. */
      try {
        var terminado = filas[actual];
        document.dispatchEvent(new CustomEvent('playlist:ended', {
          detail: { itemId: terminado && terminado.getAttribute('data-pl-item'), root: root }
        }));
      } catch (e) {}
      // Al terminar una canción se reproduce automáticamente la siguiente.
      var siguiente = actual + 1;
      limpia(filas[actual]);
      if (siguiente < filas.length) { actual = -1; suena(siguiente); }
      else {
        actual = -1;
        // Se acabó la lista: el sistema deja de anunciar que hay música sonando.
        if (ms) { try { ms.playbackState = 'none'; ms.metadata = null; } catch (e) {} }
      }
    });

    /* ⚠️ SI LAS FILAS CAMBIAN DE SITIO (una playlist de valoración se reordena por puntuación), el
       array `filas` y el índice `actual` dejan de casar: se vuelven a leer del DOM y se busca por su
       id la que está sonando. Sin esto, «siguiente» saltaría a otra canción. */
    root.plReindex = function () {
      var sonando = (actual >= 0 && filas[actual]) ? filas[actual].getAttribute('data-pl-item') : '';
      filas = Array.prototype.slice.call(root.querySelectorAll('[data-pl-row]'))
        .filter(function (li) { return !!li.getAttribute('data-pl-src'); });
      actual = -1;
      for (var i = 0; i < filas.length; i++) {
        if (sonando && filas[i].getAttribute('data-pl-item') === sonando) { actual = i; break; }
      }
      pinta();
    };

    // --- Clic en cualquier sitio de la línea (menos en los CONTROLES de dentro) ---
    /* ⚠️⚠️ Un clic en un CONTROL de la fila NO puede reproducir ni parar nada: en el listado de demos
       cada línea lleva sus tres puntitos, sus etiquetas y sus formularios (y en una playlist, además,
       las casillas), así que abrir el menú arrancaba el audio —o cortaba lo que estuviera sonando—.
       Se ignora cualquier cosa con la que se pueda interactuar: el que suene se decide pinchando la
       línea (o la portada), no un botón. El botón de PAUSA sigue funcionando porque tiene su propio
       handler en fase de CAPTURA (más abajo). */
    var CONTROLES = 'button, a, input, label, select, textarea, form, .dropdown, .dropdown-menu,'
                  + ' [role="button"], [data-bs-toggle], [data-pl-track]';
    root.addEventListener('click', function (ev) {
      var li = ev.target.closest('[data-pl-row]');
      if (!li || !root.contains(li)) return;
      if (ev.target.closest(CONTROLES)) return;
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      ev.preventDefault();
      suena(idx);
    });

    // --- Arrastrar la barra para moverte ---
    function seek(li, clientX) {
      var track = li.querySelector('[data-pl-track]');
      if (!track) return;
      var caja = track.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (clientX - caja.left) / (caja.width || 1)));
      var f = li.querySelector('[data-pl-fill]'); if (f) f.style.width = (pct * 100) + '%';
      var k = li.querySelector('[data-pl-knob]'); if (k) k.style.left = (pct * 100) + '%';
      if (isFinite(audio.duration) && audio.duration > 0) {
        var t = li.querySelector('[data-pl-time]');
        if (t) t.textContent = fmt(audio.duration * pct);
        return audio.duration * pct;
      }
      return null;
    }
    root.addEventListener('pointerdown', function (ev) {
      var track = ev.target.closest('[data-pl-track]');
      if (!track) return;
      var li = track.closest('[data-pl-row]');
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      if (idx !== actual) { suena(idx); return; }
      arrastrando = true;
      try { track.setPointerCapture(ev.pointerId); } catch (e) {}
      seek(li, ev.clientX);
      function mueve(e2) { seek(li, e2.clientX); }
      function suelta(e2) {
        var destino = seek(li, e2.clientX);
        arrastrando = false;
        if (destino != null) { try { audio.currentTime = destino; } catch (e) {} }
        track.removeEventListener('pointermove', mueve);
        track.removeEventListener('pointerup', suelta);
        track.removeEventListener('pointercancel', suelta);
      }
      track.addEventListener('pointermove', mueve);
      track.addEventListener('pointerup', suelta);
      track.addEventListener('pointercancel', suelta);
      ev.preventDefault();
    });

    // --- Pausar con su botón ---
    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-pl-toggle]');
      if (!btn) return;
      ev.stopPropagation();
      ev.preventDefault();
      var li = btn.closest('[data-pl-row]');
      var idx = filas.indexOf(li);
      if (idx < 0) return;
      suena(idx);
    }, true);

    // --- DURACIONES que faltan: de una en una, y se apuntan en el servidor ---
    var base = root.getAttribute('data-duration-base') || '';
    var cola = filas.filter(function (li) { return !(li.getAttribute('data-pl-dur') || '').trim(); });
    (function siguiente() {
      var li = cola.shift();
      if (!li) return;
      var sonda = document.createElement('audio');
      sonda.preload = 'metadata';
      var listo = false;
      function acaba() {
        if (listo) return;
        listo = true;
        sonda.removeAttribute('src');
        setTimeout(siguiente, 0);
      }
      sonda.addEventListener('loadedmetadata', function () {
        var seg = Math.round(sonda.duration || 0);
        if (seg > 0 && isFinite(seg)) {
          var etq = li.querySelector('[data-pl-durlabel]');
          if (etq) etq.textContent = fmt(seg);
          li.setAttribute('data-pl-dur', String(seg));
          if (base) {
            var url = base.replace('__ID__', li.getAttribute('data-pl-item') || '');
            post(url, { seconds: seg });
          }
        }
        acaba();
      });
      sonda.addEventListener('error', acaba);
      sonda.src = li.getAttribute('data-pl-src');
    })();
  }

  /* ===================== 2) EDICIÓN ===================== */
  function initEdit(root) {
    if (!root || root.dataset.plEditReady === '1') return;
    root.dataset.plEditReady = '1';

    var rowsEl = root.querySelector('[data-pl-rows]');
    var emptyEl = root.querySelector('[data-pl-empty]');
    var countEl = root.querySelector('[data-pl-count]');
    var savedEl = root.querySelector('[data-pl-saved]');
    var nameEl = root.querySelector('[data-pl-name]');
    var noteBox = root.querySelector('[data-pl-note-box]');
    var noteEl = root.querySelector('[data-pl-note]');
    var noteAdd = root.querySelector('[data-pl-note-add]');

    var rows = [];
    try { rows = JSON.parse(root.querySelector('[data-pl-items]').textContent || '[]') || []; } catch (e) { rows = []; }
    function normaliza(r) {
      return {
        id: r.id || '', kind: (r.kind || 'SONG').toUpperCase(), title: r.title || '',
        song_id: r.song_id || '', demo_id: r.demo_id || '',
        cover_url: r.cover_url || '', artist_name: r.artist_name || '',
        artist_photo: r.artist_photo || '', subtitle: r.subtitle || '',
        duration_seconds: r.duration_seconds || 0,
        // Los EXTRAS vienen siempre al editar: se enseñan u ocultan según los interruptores, así se
        // ve al momento cómo va a quedar la playlist.
        lyrics: r.lyrics || '', authors: r.authors || [], authors_tooltip: r.authors_tooltip || '',
        sender: r.sender || null, notes: r.notes || '',
        download_wav_url: r.download_wav_url || '', download_mp3_url: r.download_mp3_url || ''
      };
    }
    rows = rows.map(normaliza);

    var COVER = (document.body && document.body.getAttribute('data-default-cover-url')) || '';
    var AVATAR = (document.body && document.body.getAttribute('data-default-avatar-url')) || '';
    var refrescaPick = null;   // lo pone el buscador de la derecha (repasa sus verdes)

    function rowHtml(r, i) {
      var asa = '<span class="pl-erow__handle" title="Arrastra para colocarla"><i class="fa fa-grip-vertical"></i></span>';
      var quitar = '<button class="pl-erow__del" type="button" data-pl-del title="Quitar de la playlist" aria-label="Quitar"><i class="fa fa-xmark"></i></button>';
      // El TÍTULO y la DIVISIÓN no llevan etiqueta: se ven por lo que son.
      if (r.kind === 'TITLE') {
        return '<li class="pl-erow pl-erow--title" draggable="true" data-idx="' + i + '">' + asa +
          '<input class="form-control form-control-sm" data-pl-field="title" value="' + esc(r.title) + '" placeholder="Escribe el título">' +
          quitar + '</li>';
      }
      if (r.kind === 'DIVIDER') {
        return '<li class="pl-erow pl-erow--divider" draggable="true" data-idx="' + i + '">' + asa +
          '<span class="pl-erow__line"></span>' + quitar + '</li>';
      }
      /* Los EXTRAS, tal como se van a ver en la playlist. Se pintan SIEMPRE y se enseñan u ocultan
         con las clases del contenedor (`is-show-*`), así al encender un interruptor se ve al momento
         cómo va a quedar sin recargar ni perder lo que no esté guardado. */
      var letra = r.lyrics
        ? '<span class="pl-x pl-x--lyrics pl-tag" title="Tiene letra"><i class="fa fa-align-left"></i></span>'
        : '';
      var autores = (r.authors && r.authors.length)
        ? '<span class="pl-x pl-x--authors pl-authors" title="' + esc(r.authors_tooltip) + '">'
          + '<i class="fa fa-feather-pointed"></i>'
          + esc(r.authors.map(function (a) { return a.name; }).join(', ')) + '</span>'
        : '';
      var quien = (r.sender && r.sender.name)
        ? '<span class="pl-x pl-x--sender pl-sender" title="Enviada por ' + esc(r.sender.label || r.sender.name) + '">'
          + (r.sender.photo_url ? '<img src="' + esc(r.sender.photo_url) + '" alt="" data-avatar="1">'
                                : '<i class="fa fa-paper-plane"></i>')
          + 'Enviada por ' + esc(r.sender.name) + '</span>'
        : '';
      var nota = r.notes
        ? '<span class="pl-x pl-x--notes pl-erow__notes"><i class="fa fa-note-sticky me-1"></i>'
          + esc(r.notes) + '</span>'
        : '';
      var descarga = r.download_wav_url
        ? '<span class="pl-x pl-x--download pl-erow__dl" title="Se puede descargar">'
          + '<i class="fa fa-download"></i></span>'
        : '';
      return '<li class="pl-erow" draggable="true" data-idx="' + i + '">' + asa +
        '<img class="pl-erow__cover" src="' + esc(r.cover_url || COVER) + '" alt="" data-cover>' +
        '<span class="pl-erow__main">' +
          '<span class="pl-erow__title">' + esc(r.title) + letra + '</span>' +
          '<span class="pl-erow__artist">' +
            (r.artist_name ? '<img src="' + esc(r.artist_photo || AVATAR) + '" alt="" data-avatar="1">' + esc(r.artist_name) : '') +
            (r.subtitle ? '<span class="pl-row__tag">' + esc(r.subtitle) + '</span>' : '') +
            autores + quien +
          '</span>' +
          nota +
        '</span>' +
        '<span class="pl-erow__dur">' + (r.duration_seconds ? fmt(r.duration_seconds) : '') + '</span>' +
        descarga + quitar + '</li>';
    }

    function render() {
      rowsEl.innerHTML = rows.map(rowHtml).join('');
      var suenan = rows.filter(function (r) { return r.kind === 'SONG' || r.kind === 'DEMO'; }).length;
      if (countEl) countEl.textContent = suenan;
      if (emptyEl) emptyEl.classList.toggle('d-none', rows.length > 0);
      if (window.initImageFallbacks) { try { window.initImageFallbacks(); } catch (e) {} }
      // Lo que está puesto se ve en VERDE en el buscador: al quitar una línea deja de estarlo.
      if (refrescaPick) refrescaPick();
    }

    function tocado() { if (savedEl) savedEl.textContent = 'Sin guardar'; }

    /* Los interruptores mandan lo que se VE de cada tema mientras se edita: en cuanto se encienden,
       la línea enseña la letra, los autores, la nota, quién la envió o la descarga. */
    function pintaInterruptores() {
      document.querySelectorAll('[data-pl-switch]').forEach(function (sw) {
        var clave = sw.getAttribute('data-pl-switch');
        var clase = { allow_download: 'is-show-download', show_lyrics: 'is-show-lyrics',
                      show_authors: 'is-show-authors', show_sender: 'is-show-sender',
                      show_notes: 'is-show-notes' }[clave];
        if (clase) root.classList.toggle(clase, !!sw.checked);
      });
    }
    root.plRefreshSwitches = pintaInterruptores;      // lo llama el manejador de los interruptores
    pintaInterruptores();

    // --- Edición en vivo del título de una línea ---
    rowsEl.addEventListener('input', function (ev) {
      if (ev.target.getAttribute('data-pl-field') !== 'title') return;
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      var r = rows[+li.getAttribute('data-idx')]; if (!r) return;
      r.title = ev.target.value;
      tocado();
    });
    rowsEl.addEventListener('click', function (ev) {
      if (!ev.target.closest('[data-pl-del]')) return;
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      rows.splice(+li.getAttribute('data-idx'), 1);
      render(); tocado();
    });

    /* --- Arrastrar para colocar (canciones, títulos y divisiones) ---
       ⚠️ La línea se MUEVE DE VERDAD mientras se arrastra (se cambia de sitio en la propia lista según
       pasa por encima de las demás), así se ve dónde va a quedar antes de soltarla. Y al soltar, el
       array se reconstruye LEYENDO EL ORDEN DE LA LISTA: hacerlo con índices (splice de quitar y
       splice de meter) dejaba la línea una posición desviada al bajarla, porque al quitarla los
       índices de abajo ya se habían movido (bug real). */
    var nodo = null;                       // la línea que se está arrastrando

    function limpiaArrastre() {
      nodo = null;
      Array.prototype.forEach.call(rowsEl.querySelectorAll('.dragging'), function (n) { n.classList.remove('dragging'); });
      rowsEl.classList.remove('is-dragging');
    }

    function reconstruyeDesdeLista() {
      var nuevas = [];
      Array.prototype.forEach.call(rowsEl.children, function (li) {
        var r = rows[+li.getAttribute('data-idx')];
        if (r) nuevas.push(r);
      });
      if (nuevas.length !== rows.length) return false;      // por si acaso: no se toca nada
      var cambio = nuevas.some(function (r, i) { return r !== rows[i]; });
      rows = nuevas;
      render();                                            // renumera los data-idx
      return cambio;
    }

    // Escribir en el título de una línea no debe arrastrarla (si no, no se puede ni seleccionar texto).
    rowsEl.addEventListener('mousedown', function (ev) {
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      li.draggable = !ev.target.closest('input, textarea, select, button');
    });
    document.addEventListener('mouseup', function () {
      Array.prototype.forEach.call(rowsEl.querySelectorAll('[data-idx]'), function (li) { li.draggable = true; });
    });

    rowsEl.addEventListener('dragstart', function (ev) {
      var li = ev.target.closest('[data-idx]'); if (!li) return;
      nodo = li;
      rowsEl.classList.add('is-dragging');
      // El estilo de «me estoy moviendo» se pone en el siguiente ciclo: si se pone ya, algunos
      // navegadores hacen la foto del arrastre con la fila translúcida.
      setTimeout(function () { if (nodo) nodo.classList.add('dragging'); }, 0);
      try { ev.dataTransfer.setData('text/plain', li.getAttribute('data-idx')); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
    });

    rowsEl.addEventListener('dragover', function (ev) {
      if (!nodo) return;
      ev.preventDefault();
      try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
      var sobre = ev.target.closest('[data-idx]');
      if (!sobre) {                                        // por debajo de la última: al final
        if (ev.clientY > rowsEl.getBoundingClientRect().bottom - 4) rowsEl.appendChild(nodo);
        return;
      }
      if (sobre === nodo) return;
      var caja = sobre.getBoundingClientRect();
      var porDebajo = (ev.clientY - caja.top) > caja.height / 2;
      rowsEl.insertBefore(nodo, porDebajo ? sobre.nextSibling : sobre);
    });

    rowsEl.addEventListener('drop', function (ev) {
      ev.preventDefault();
      if (!nodo) return;
      limpiaArrastre();
      if (reconstruyeDesdeLista()) tocado();
    });

    rowsEl.addEventListener('dragend', function () {
      if (!nodo) return;                                   // ya lo resolvió el `drop`
      limpiaArrastre();
      if (reconstruyeDesdeLista()) tocado();
    });

    /* --- Añadir un TÍTULO, una DIVISIÓN o la NOTA ---
       Los tres botones viven en la COLUMNA DE LA DERECHA (`_playlist_picker.html`), encima del
       buscador, y son los mismos en el editor y en el asistente. */
    function abreNota() {
      if (noteBox) noteBox.classList.remove('d-none');
      if (noteAdd) noteAdd.classList.add('d-none');
      if (noteEl) noteEl.focus();
    }
    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-plb-add]');
      if (!b) return;
      var que = (b.getAttribute('data-plb-add') || '').toUpperCase();
      if (que === 'NOTE') { abreNota(); return; }
      if (que !== 'TITLE' && que !== 'DIVIDER') return;
      rows.push({ id: '', kind: que, title: '' });
      render(); tocado();
      if (que === 'TITLE') {
        var last = rowsEl.querySelector('.pl-erow:last-child input');
        if (last) last.focus();
      }
    });
    if (noteAdd) noteAdd.addEventListener('click', abreNota);
    var noteDel = root.querySelector('[data-pl-note-del]');
    if (noteDel) noteDel.addEventListener('click', function () {
      if (noteEl) noteEl.value = '';
      if (noteBox) noteBox.classList.add('d-none');
      if (noteAdd) noteAdd.classList.remove('d-none');
      tocado();
    });
    if (noteEl) noteEl.addEventListener('input', tocado);
    if (nameEl) nameEl.addEventListener('input', tocado);

    // --- Guardar ---
    function payload() {
      return rows.map(function (r) {
        return { id: r.id || '', kind: r.kind, title: r.title || '', song_id: r.song_id || '', demo_id: r.demo_id || '' };
      });
    }
    function guarda() {
      var btn = root.querySelector('[data-pl-save]');
      if (btn) btn.disabled = true;
      if (savedEl) savedEl.textContent = 'Guardando…';
      return post(root.getAttribute('data-save-url'), {
        name: (nameEl && nameEl.value) || '',
        note: (noteEl && noteEl.value) || '',
        items: JSON.stringify(payload())
      }).then(function (js) {
        if (btn) btn.disabled = false;
        if (js && js.ok) {
          // Las líneas nuevas ya tienen id: se recogen para que un segundo guardado no las duplique.
          rows = (js.items || []).map(function (r) {
            return {
              id: r.id || '', kind: (r.kind || 'SONG').toUpperCase(), title: r.title || '',
              song_id: r.song_id || '', demo_id: r.demo_id || '', cover_url: r.cover_url || '',
              artist_name: r.artist_name || '', artist_photo: r.artist_photo || '',
              subtitle: r.subtitle || '', duration_seconds: r.duration_seconds || 0
            };
          });
          render();
          if (savedEl) savedEl.textContent = 'Guardada';
        } else {
          if (savedEl) savedEl.textContent = '';
          alert('No se pudo guardar la playlist.' + (js && js.error ? ' (' + js.error + ')' : ''));
        }
        return js;
      });
    }
    var btnSave = root.querySelector('[data-pl-save]');
    if (btnSave) btnSave.addEventListener('click', guarda);

    /* ---------- El BUSCADOR de temas (columna de la derecha) ----------
       ⚠️ El motor es ÚNICO (`playlist_picker.js`) y lo comparte con el asistente de «+ Playlist
       selección»: los dos se comportan igual y lo que ya está puesto se ve en VERDE. */
    var zonaPick = root.querySelector('[data-plpick]');
    if (zonaPick && window.app33PlaylistPicker) {
      window.app33PlaylistPicker.init(zonaPick, {
        tiene: function (kind, id) {
          return rows.some(function (r) {
            return r.kind === kind && (kind === 'DEMO' ? r.demo_id : r.song_id) === id;
          });
        },
        onAdd: function (f) {
          rows.push({
            id: '', kind: f.kind, title: f.title,
            song_id: (f.kind === 'SONG' ? f.id : ''), demo_id: (f.kind === 'DEMO' ? f.id : ''),
            cover_url: f.cover_url, artist_name: f.artist_name, artist_photo: f.artist_photo,
            subtitle: f.subtitle, duration_seconds: 0
          });
          render(); tocado();
        }
      });
      // Al QUITAR una línea, el buscador tiene que dejar de darla por puesta.
      refrescaPick = function () {
        if (typeof zonaPick.plPickRefresh === 'function') zonaPick.plPickRefresh();
      };
    }

    /* ---------- Nombre del archivo de la portada ---------- */
    var coverInput = document.getElementById('plCoverFile');
    var coverName = document.querySelector('[data-pl-cover-name]');
    if (coverInput && coverName) {
      coverInput.addEventListener('change', function () {
        var f = coverInput.files && coverInput.files[0];
        coverName.textContent = f ? f.name : '';
      });
    }

    render();          // ⚠️ el pintado INICIAL: sin esto la playlist sale vacía al entrar a editar
  }

  /* ===================== 3) LOS INTERRUPTORES =====================
     Descarga · Letra · Autores · Quién la envió. Son los de los accesos, están en la barra de botones
     y se guardan al momento (todos nacen apagados). */
  function initSwitches() {
    document.querySelectorAll('[data-pl-switch]').forEach(function (sw) {
      if (sw.dataset.plReady === '1') return;
      sw.dataset.plReady = '1';
      var caja = sw.closest('.pl-switch');
      sw.addEventListener('change', function () {
        var campo = sw.getAttribute('data-pl-switch');
        var editor = document.querySelector('[data-playlist-edit]');
        sw.disabled = true;
        if (caja) caja.classList.toggle('is-on', sw.checked);
        // Editando se ve AL MOMENTO lo que se acaba de encender (sin esperar al guardado).
        if (editor && typeof editor.plRefreshSwitches === 'function') editor.plRefreshSwitches();
        var datos = {};
        datos[campo] = sw.checked ? '1' : '0';
        post(sw.getAttribute('data-pl-save-url'), datos).then(function (js) {
          sw.disabled = false;
          if (!js || !js.ok) {
            sw.checked = !sw.checked;
            if (caja) caja.classList.toggle('is-on', sw.checked);
            if (editor && typeof editor.plRefreshSwitches === 'function') editor.plRefreshSwitches();
            alert('No se pudo guardar el ajuste.');
            return;
          }
          // ⚠️ Solo se recarga en la VISTA (lo que se enseña de cada tema cambia con esto). Editando
          // NO se recarga —se perdería lo que no esté guardado—: ahí lo enseñan las clases de arriba.
          if (!editor) window.location.reload();
        });
      });
    });
  }

  /* ---------- La LETRA: se abre y se cierra al pinchar su icono ---------- */
  function initLyrics() {
    if (document.body.dataset.plLyricsReady === '1') return;
    document.body.dataset.plLyricsReady = '1';
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pl-lyrics]');
      if (!b) return;
      ev.preventDefault();
      ev.stopPropagation();                       // que no arranque la canción
      var caja = document.querySelector('[data-pl-lyrics-box="' + b.getAttribute('data-pl-lyrics') + '"]');
      if (caja) caja.classList.toggle('d-none');
    }, true);
  }

  function init(root) {
    var ambito = root || document;
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-playlist-player]') : []).forEach(initPlayer);
    (ambito.querySelectorAll ? ambito.querySelectorAll('[data-playlist-edit]') : []).forEach(initEdit);
    initSwitches();
    initLyrics();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('inline:updated', function (ev) { init(ev.target || document); });
  window.initPlaylist = init;
})();
