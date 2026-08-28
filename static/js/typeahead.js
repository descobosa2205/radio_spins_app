function debounce(fn, ms){ let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms); }; }

/* ============================================================================
   BUSCADOR CON SUGERENCIAS.
   ⚠️ Si el endpoint devuelve IMAGEN (`logo_url` o `photo_url`) se pinta una lista PROPIA con la
   miniatura: un `<datalist>` nativo NO admite imágenes, y por eso los selectores de editorial (y
   cualquier otro con logo) salían pelados. Sin imagen se sigue usando el datalist de siempre, así
   que ningún buscador existente cambia de comportamiento.
   ============================================================================ */
function initTypeahead(inputId, hiddenId, endpoint){
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
  function caja(){
    if (box) return box;
    box = document.createElement('div');
    box.className = 'ta-results';
    const padre = input.parentElement;
    if (padre && getComputedStyle(padre).position === 'static') padre.style.position = 'relative';
    (padre || document.body).appendChild(box);
    box.addEventListener('mousedown', (ev) => {
      const it = ev.target.closest('[data-ta-id]');
      if (!it) return;
      ev.preventDefault();
      input.value = it.getAttribute('data-ta-label') || '';
      if (hidden) hidden.value = it.getAttribute('data-ta-id') || '';
      cerrar();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return box;
  }
  function cerrar(){ if (box) box.style.display = 'none'; }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const search = debounce(async (q) => {
    if(!q || q.length < 1){ dl.innerHTML = ""; cerrar(); return; }
    let r;
    try { r = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`); } catch (e) { return; }
    if(!r.ok) return;
    const js = await r.json();
    const conImagen = (js || []).some(it => it && (it.logo_url || it.photo_url));
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
    b.innerHTML = (js || []).map(it => {
      const img = it.logo_url || it.photo_url || '';
      const nombre = it.label || it.name || '';
      return '<button type="button" class="ta-item" data-ta-id="' + esc(it.id) + '" data-ta-label="' + esc(nombre) + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" onerror="this.style.visibility=\'hidden\'">'
            : '<span class="ta-item__noimg"></span>') +
        '<span class="ta-item__t">' + esc(nombre) + '</span></button>';
    }).join('');
    b.style.display = js && js.length ? 'block' : 'none';
  }, 150);

  input.addEventListener('input', (e)=>search(e.target.value));
  input.addEventListener('blur', () => setTimeout(cerrar, 180));

  function resolveSelection(){
    if (box && box.style.display === 'block') return;   // lo resuelve el clic en la lista
    const val = input.value;
    const opts = dl.querySelectorAll('option');
    let foundId = "";
    for(const o of opts){
      if(o.value === val){ foundId = o.dataset.id || ""; break; }
    }
    if (hidden) hidden.value = foundId;
  }

  input.addEventListener('change', resolveSelection);
  input.addEventListener('blur', resolveSelection);
}
