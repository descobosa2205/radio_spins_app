/* SUBIDA DIRECTA A STORAGE desde un FORMULARIO · punto único del navegador.

   ⚠️ Por qué existe: un vídeo pesado que viaja DENTRO del formulario pasa por el servidor, y la
   petición muere por tiempo o por tamaño antes de que el servidor termine de subirlo a Storage
   (el 524 del proxy, el 502 del worker…). El navegador veía «subiendo…» un rato y luego un fallo,
   y no quedaba nada guardado. Es el mismo caso que ya se resolvió con los vídeos de la galería
   (fotos.js) y con los masters (la entrega pública): el archivo se sube ANTES, del navegador a
   Storage con una URL firmada, y al formulario solo le llega su dirección.

   Cómo se usa (sin escribir JS en la plantilla):
     <form data-direct-upload="<url que firma la subida>" [data-du-only-if="campo=valor"]>
       <input type="file" name="…" data-direct>
       <div data-du-progress class="d-none">…<div class="progress-bar" data-du-bar>…<span data-du-label>
       <div data-du-error class="d-none"></div>
     </form>
   Al enviar: se firma (POST JSON {filename, size, mime} → {ok, key, upload_url}), se hace el PUT
   con progreso y, cuando está arriba, se añaden los ocultos `uploaded_key` · `uploaded_name` ·
   `uploaded_mime` · `uploaded_size`, se DESHABILITA el <input type=file> (un campo oculto se
   envía igual, y este ya no tiene que viajar) y se envía el formulario de la forma normal.
   `data-du-only-if` limita la subida directa a un caso del formulario (p. ej. solo el VIDEOCLIP del
   pop-up de materiales, que sirve también para portadas y masters).

   ⚠️ Si la FIRMA falla (el servidor no tiene Storage configurado), el formulario se manda como
   siempre, con el archivo dentro: es el respaldo de antes. Si falla el PUT (la red se corta, o
   Storage dice que el archivo es demasiado grande) NO se manda por el servidor —ahí moriría igual—:
   se dice qué ha pasado y se puede volver a intentar.
   ⚠️ Se escucha en `document` en fase de CAPTURA: así corre antes que el resto de manejadores de
   `submit` (el loader, el motor inline) y con `stopImmediatePropagation` ninguno se queda a medias.
   El envío final va por `form.submit()`, que NO dispara `submit`, así que no puede entrar en bucle. */
(function () {
  'use strict';
  if (window.app33DirectUpload) return;   // incluido dos veces en la misma página: con uno basta

  function csrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? (m.getAttribute('content') || '') : '';
  }

  function humanSize(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1073741824) return (n / 1073741824).toFixed(1).replace('.', ',') + ' GB';
    if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }

  /* Paso 1: pedirle al servidor la URL firmada. Resuelve a {key, upload_url} o rechaza con
     {stage:'sign', message}. */
  function sign(signUrl, file) {
    return fetch(signUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
      body: JSON.stringify({ filename: file.name, size: file.size, mime: file.type || '' })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d || {} }; });
    }).then(function (res) {
      var d = res.data;
      if (d && d.ok && d.upload_url && d.key) return { key: d.key, upload_url: d.upload_url };
      return Promise.reject({ stage: 'sign', status: res.status, message: (d && d.error) || ('No se pudo preparar la subida (HTTP ' + res.status + ').') });
    }, function () {
      return Promise.reject({ stage: 'sign', status: 0, message: 'No se pudo preparar la subida.' });
    });
  }

  /* Paso 2: el PUT del archivo a Storage, con progreso. Resuelve a la key; rechaza con
     {stage:'put', status, message}. Mecánica canónica de storage-js: multipart con el fichero en un
     campo de nombre VACÍO, sin Content-Type propio (lo pone el navegador) y el token en la URL. */
  function put(uploadUrl, key, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('cacheControl', '31536000');
      fd.append('', file);
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      if (xhr.upload) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
        };
      }
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(key); return; }
        var msg;
        if (xhr.status === 413) {
          msg = 'El archivo pesa ' + humanSize(file.size) + ' y supera el tamaño máximo que admite el ' +
                'almacenamiento (Supabase Storage). Hay que subir ese límite en Supabase o comprimir el vídeo.';
        } else if (xhr.status === 401 || xhr.status === 403) {
          msg = 'La autorización de la subida ha caducado. Vuelve a intentarlo.';
        } else {
          var detalle = '';
          try { detalle = (JSON.parse(xhr.responseText || '{}').message) || ''; } catch (e) { detalle = ''; }
          msg = 'El almacenamiento no aceptó el archivo (HTTP ' + xhr.status + ')' + (detalle ? ': ' + detalle : '.');
        }
        reject({ stage: 'put', status: xhr.status, message: msg });
      };
      xhr.onerror = function () {
        reject({ stage: 'put', status: 0, message: 'Se cortó la conexión mientras se subía el archivo (' + humanSize(file.size) + '). Comprueba la red y vuelve a intentarlo.' });
      };
      xhr.onabort = function () { reject({ stage: 'put', status: 0, message: 'Subida cancelada.' }); };
      xhr.send(fd);
    });
  }

  /* Sube UN archivo. Resuelve a {key, name, mime, size}. */
  function upload(signUrl, file, onProgress) {
    return sign(signUrl, file).then(function (sig) {
      return put(sig.upload_url, sig.key, file, onProgress).then(function (key) {
        return { key: key, name: file.name, mime: file.type || '', size: file.size };
      });
    });
  }

  function setHidden(form, name, value) {
    var el = form.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.name = name;
      form.appendChild(el);
    }
    el.value = value == null ? '' : String(value);
  }

  function ui(form) {
    var box = form.querySelector('[data-du-progress]');
    var bar = form.querySelector('[data-du-bar]');
    var label = form.querySelector('[data-du-label]');
    var error = form.querySelector('[data-du-error]');
    return {
      progress: function (loaded, total) {
        if (box) box.classList.remove('d-none');
        var pct = total ? Math.max(1, Math.min(100, Math.round(loaded * 100 / total))) : 0;
        if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct)); }
        if (label) label.textContent = 'Subiendo… ' + pct + '% (' + humanSize(loaded) + ' de ' + humanSize(total) + ')';
      },
      done: function (text) {
        if (box) box.classList.remove('d-none');
        if (bar) { bar.style.width = '100%'; bar.classList.add('bg-success'); }
        if (label) label.textContent = text || 'Subido. Guardando…';
      },
      fail: function (message) {
        if (box) box.classList.add('d-none');
        if (bar) { bar.style.width = '0%'; bar.classList.remove('bg-success'); }
        if (error) { error.textContent = message; error.classList.remove('d-none'); }
        else window.alert(message);
      },
      reset: function () {
        if (error) { error.textContent = ''; error.classList.add('d-none'); }
        if (bar) { bar.style.width = '0%'; bar.classList.remove('bg-success'); }
      }
    };
  }

  function conditionHolds(form) {
    var cond = form.getAttribute('data-du-only-if') || '';
    if (!cond) return true;
    var idx = cond.indexOf('=');
    if (idx < 0) return true;
    var field = form.querySelector('[name="' + cond.slice(0, idx) + '"]');
    return !!field && String(field.value || '') === cond.slice(idx + 1);
  }

  document.addEventListener('submit', function (ev) {
    var form = ev.target && ev.target.closest ? ev.target.closest('form[data-direct-upload]') : null;
    if (!form || ev.defaultPrevented) return;
    if (form.dataset.duDone === '1' || form.dataset.duBusy === '1') return;   // segunda vuelta o en curso
    var signUrl = form.getAttribute('data-direct-upload') || '';
    if (!signUrl || !conditionHolds(form)) return;
    var input = form.querySelector('input[type="file"][data-direct]:not([disabled])');
    if (!input || !input.files || !input.files.length) return;            // sin archivo: envío normal
    var file = input.files[0];

    ev.preventDefault();
    ev.stopImmediatePropagation();
    form.dataset.duBusy = '1';
    var vista = ui(form);
    vista.reset();
    var botones = Array.prototype.slice.call(form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]'));
    botones.forEach(function (b) { b.disabled = true; });
    vista.progress(0, file.size);

    upload(signUrl, file, vista.progress).then(function (res) {
      setHidden(form, 'uploaded_key', res.key);
      setHidden(form, 'uploaded_name', res.name);
      setHidden(form, 'uploaded_mime', res.mime);
      setHidden(form, 'uploaded_size', res.size);
      // El archivo YA está arriba: no tiene que viajar otra vez dentro del formulario.
      Array.prototype.forEach.call(form.querySelectorAll('input[type="file"]'), function (i) { i.disabled = true; });
      form.dataset.duDone = '1';
      vista.done();
      if (window.appLoader && window.appLoader.show) { try { window.appLoader.show(); } catch (e) {} }
      form.submit();
    }, function (err) {
      form.dataset.duBusy = '';
      botones.forEach(function (b) { b.disabled = false; });
      if (err && err.stage === 'sign') {
        // Sin firma no hay subida directa: se manda como siempre (respaldo), con el archivo dentro.
        form.dataset.duDone = '1';
        if (window.appLoader && window.appLoader.show) { try { window.appLoader.show(); } catch (e) {} }
        form.submit();
        return;
      }
      vista.fail((err && err.message) || 'No se pudo subir el archivo. Vuelve a intentarlo.');
    });
  }, true);

  window.app33DirectUpload = { upload: upload, humanSize: humanSize };
})();
