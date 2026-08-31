function debounce(fn, ms){ let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms); }; }

/* ============================================================================
   BUSCADOR CON SUGERENCIAS.
   ⚠️ Si el endpoint devuelve IMAGEN (`logo_url` o `photo_url`) se pinta una lista PROPIA con la
   miniatura: un `<datalist>` nativo NO admite imágenes, y por eso los selectores de editorial (y
   cualquier otro con logo) salían pelados. Sin imagen se sigue usando el datalist de siempre, así
   que ningún buscador existente cambia de comportamiento.
   ============================================================================ */
function initTypeahead(inputId, hiddenId, endpoint, opciones){
  const input  = document.getElementById(inputId);
  // ⚠️ Si ese campo no está en la pantalla (se llama desde un script que corre en TODAS las
  // pestañas de la ficha), no hay nada que cablear: sin esta guarda petaba con
  // «Cannot read properties of null» y se llevaba por delante el resto del arranque de la página.
  if (!input) return;
  const hidden = document.getElementById(hiddenId);
  const listId = inputId + "_list";
  let dl = document.getElementById(listId);
  if(!dl){
    dl = document.createElement('datalist');
    dl.id = listId;
    document.body.appendChild(dl);
  }
  input.setAttribute('list', listId);

  // La lista propia (con miniatura), que se crea la primera vez que hace falta.
  let box = null;
  // Lo último que se ha ELEGIDO en esa lista (con su texto), para que el `change`/`blur` posterior
  // no lo borre al no encontrarlo en el datalist.
  let elegido = '', elegidoLabel = '';
  /* ⚠️⚠️ LA LISTA CUELGA DEL `<body>`, no del campo. Dentro de su contenedor la recortaba
     cualquier ancestro con `overflow` —un bocadillo `.demo-card` (que lo lleva por el
     border-radius), el `.modal-body` con scroll, una tabla— y los resultados se veían a medias o
     no se veían (bug real en el formulario de demos). Colgada del body y con `position:fixed` no
     la puede cortar nadie; su sitio se calcula al abrirla (`coloca`). Es el mismo remedio que ya
     usa la casa con los desplegables. */
  function caja(){
    if (box) return box;
    box = document.createElement('div');
    box.className = 'ta-results';
    document.body.appendChild(box);
    if (window.app33FloatList) window.app33FloatList.attach(box);
    box.addEventListener('mousedown', (ev) => {
      const it = ev.target.closest('[data-ta-id]');
      if (!it) return;
      ev.preventDefault();
      input.value = it.getAttribute('data-ta-label') || '';
      if (hidden) hidden.value = it.getAttribute('data-ta-id') || '';
      // Campos EXTRA del resultado a sus propios ocultos (p. ej. el integrante de un artista que
      // todavía no tiene ficha de tercero: viaja su `artist_person_id`).
      try {
        var extra = JSON.parse(it.getAttribute('data-ta-extra') || '{}');
        Object.keys(extra).forEach(function (campo) {
          var destino = document.getElementById(((opciones || {}).extra || {})[campo] || '');
          if (destino) destino.value = extra[campo] == null ? '' : String(extra[campo]);
        });
      } catch (e) {}
      cerrar();
      // ⚠️ Lo ELEGIDO EN LA LISTA manda: se apunta antes de avisar del cambio. Si no,
      // `resolveSelection` (que corre con el `change` y con el `blur`) busca el texto en el
      // DATALIST —que con imagen se vacía a propósito— no lo encuentra y BORRA el oculto: el
      // buscador dejaba el nombre puesto y el id vacío, así que no se guardaba nada.
      elegido = it.getAttribute('data-ta-id') || '';
      elegidoLabel = it.getAttribute('data-ta-label') || '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return box;
  }
  function cerrar(){
    if (box) box.style.display = 'none';
    window.removeEventListener('scroll', coloca, true);
    window.removeEventListener('resize', coloca);
  }

  /* Dónde se pinta la lista: pegada al campo, con su ancho. Si no cabe debajo, se abre HACIA
     ARRIBA (en un modal, el campo suele estar cerca del borde de abajo). */
  function coloca(){
    // ⚠️ Sin el helper (una pantalla que no cargue `float_list.js`) no se peta: la lista se queda
    // donde estaba. Un error aquí se llevaría por delante el resto del arranque de la página.
    if (!box || box.style.display === 'none' || !window.app33FloatList) return;
    window.app33FloatList.place(input, box);
  }

  function abrir(){
    if (!box) return;
    // Si al campo no le queda sitio, se acerca antes de abrir (ver `float_list.js`).
    if (window.app33FloatList) window.app33FloatList.ensureRoom(input);
    box.style.display = 'block';
    coloca();
    window.addEventListener('scroll', coloca, true);
    window.addEventListener('resize', coloca);
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const search = debounce(async (q) => {
    if(!q || q.length < 1){ dl.innerHTML = ""; cerrar(); return; }
    let r;
    try { r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`); } catch (e) { return; }
    if(!r.ok) return;
    const js = await r.json();
    /* ⚠️ Con `alwaysList` se usa SIEMPRE la lista propia, traiga imagen o no: hay buscadores en los
       que el desplegable nativo no vale (el promotor del asistente de actividad, que se pidió como
       barra de búsqueda con resultados a la vista). Quien no tenga foto sale con su hueco. */
    const conImagen = ((opciones || {}).alwaysList === true)
      || (js || []).some(it => it && (it.logo_url || it.photo_url));
    if (!conImagen){
      cerrar();
      dl.innerHTML = "";
      (js || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.label;
        opt.dataset.id = item.id;
        dl.appendChild(opt);
      });
      return;
    }
    // Con imagen: lista propia (el datalist se vacía para que no salgan las dos).
    dl.innerHTML = "";
    const b = caja();
    const campos = Object.keys(((opciones || {}).extra) || {});
    b.innerHTML = (js || []).map(it => {
      const img = it.logo_url || it.photo_url || '';
      const nombre = it.label || it.name || '';
      const sub = it.sub || '';
      const extra = {};
      campos.forEach(function (c) { extra[c] = it[c] == null ? '' : it[c]; });
      return '<button type="button" class="ta-item" data-ta-id="' + esc(it.id) + '" data-ta-label="' + esc(nombre) + '"' +
        (campos.length ? ' data-ta-extra="' + esc(JSON.stringify(extra)) + '"' : '') + '>' +
        (img ? '<img src="' + esc(img) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
            : '<span class="ta-item__noimg"></span>') +
        '<span class="ta-item__t">' + esc(nombre) +
        (sub ? '<small class="ta-item__s">' + esc(sub) + '</small>' : '') +
        '</span></button>';
    }).join('');
    if (js && js.length) abrir(); else cerrar();
  }, 150);

  input.addEventListener('input', (e)=>search(e.target.value));
  input.addEventListener('blur', () => setTimeout(cerrar, 180));

  function resolveSelection(){
    if (box && box.style.display === 'block') return;   // lo resuelve el clic en la lista
    const val = input.value;
    // Lo elegido en la lista con imagen sigue valiendo mientras no se toque el texto.
    if (elegido && val === elegidoLabel) { if (hidden) hidden.value = elegido; return; }
    const opts = dl.querySelectorAll('option');
    let foundId = "";
    for(const o of opts){
      if(o.value === val){ foundId = o.dataset.id || ""; break; }
    }
    if (hidden) hidden.value = foundId;
    if (!foundId) {
      const mapa = ((opciones || {}).extra) || {};
      Object.keys(mapa).forEach(function (c) {
        const destino = document.getElementById(mapa[c]);
        if (destino) destino.value = '';
      });
    }
  }

  input.addEventListener('change', resolveSelection);
  input.addEventListener('blur', resolveSelection);
}
