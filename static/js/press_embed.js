/* ══════════════════════════════════════════════════════════════════════════════════════════════
   NOTAS DE PRENSA · EL MÓDULO INSERTABLE EN CUALQUIER WEB (el código de inserción).

   Lo carga un <script src="…/np/insercion/<KIND>/<ids>.js"> pegado en otra web: el servidor manda
   esta librería y, detrás, `np33Embed.boot(DATA, document.currentScript)` con las notas ENVIADAS de
   ese artista o evento (solo las enviadas: ni borradores ni programadas; un reenvío es la misma nota,
   así que no se repite). Pinta un carrusel a TODO EL ANCHO DE LA PANTALLA con fondo transparente,
   una tarjeta por nota (su miniatura, el titular, el resumen y la fecha) que se mueve a derecha e
   izquierda para ver las más antiguas, y al pinchar una se abre la nota en un POP-UP dentro de la
   misma web (un iframe a su página pública en modo embebido).
   El texto se pone CLARO u OSCURO según el fondo de la web donde se inserta (se mira el color de
   fondo real de los contenedores; si todos son transparentes, la preferencia del sistema).
   ⚠️ No usa nada de la web anfitriona (ni jQuery ni Bootstrap) y todo su CSS va con el prefijo
   `np33-` para no pisar ni ser pisado.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.np33Embed) return;

  var CSS = [
    '.np33{position:relative;box-sizing:border-box;width:100%;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;--np33-fg:#111827;--np33-muted:#6b7280;--np33-card:rgba(255,255,255,.72);--np33-line:rgba(15,23,42,.10);--np33-btn:rgba(255,255,255,.92)}',
    '.np33--bleed{width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw)}',
    '.np33--dark{color:#f8fafc;--np33-fg:#f8fafc;--np33-muted:#cbd5e1;--np33-card:rgba(255,255,255,.08);--np33-line:rgba(255,255,255,.16);--np33-btn:rgba(30,41,59,.92)}',
    '.np33 *{box-sizing:border-box}',
    '.np33__track{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:8px 48px 14px;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
    '.np33__track::-webkit-scrollbar{display:none}',
    '.np33__card{flex:0 0 300px;max-width:82vw;scroll-snap-align:start;border:1px solid var(--np33-line);border-radius:16px;background:var(--np33-card);overflow:hidden;cursor:pointer;text-align:left;padding:0;color:inherit;font:inherit;display:flex;flex-direction:column;transition:transform .18s ease,box-shadow .18s ease}',
    '.np33__card:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(15,23,42,.18)}',
    '.np33__thumb{aspect-ratio:16/10;width:100%;object-fit:cover;display:block;background:rgba(127,127,127,.12)}',
    '.np33__body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px}',
    '.np33__date{font-size:12px;color:var(--np33-muted)}',
    '.np33__title{font-size:16px;font-weight:700;line-height:1.25;color:var(--np33-fg);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.np33__sum{font-size:13px;line-height:1.45;color:var(--np33-muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.np33__arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:1px solid var(--np33-line);background:var(--np33-btn);color:var(--np33-fg);font-size:18px;line-height:36px;text-align:center;cursor:pointer;z-index:2;box-shadow:0 4px 14px rgba(15,23,42,.15)}',
    '.np33__arrow--l{left:6px}.np33__arrow--r{right:6px}.np33__arrow[disabled]{opacity:.3;cursor:default}',
    '.np33__empty{padding:14px;font-size:14px;color:var(--np33-muted)}',
    '.np33-pop{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.np33-pop__box{position:relative;width:min(720px,100%);height:min(92vh,1100px);background:#f3f4f6;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45);display:flex;flex-direction:column}',
    '.np33-pop__bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#fff;border-bottom:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:#374151}',
    '.np33-pop__bar a{color:#374151;text-decoration:none;border:1px solid #e5e7eb;border-radius:999px;padding:5px 11px;background:#fff}',
    '.np33-pop__x{border:0;background:#fff;font-size:22px;line-height:1;cursor:pointer;color:#374151;border-radius:50%;width:34px;height:34px}',
    '.np33-pop__frame{flex:1;width:100%;border:0;background:#f3f4f6}',
    '@media (max-width:640px){.np33__track{padding:6px 12px 12px;gap:12px}.np33__arrow{display:none}.np33__card{flex-basis:78vw}}'
  ].join('\n');

  function css() {
    if (document.getElementById('np33-css')) return;
    var st = document.createElement('style'); st.id = 'np33-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  /* ¿La web donde se inserta es OSCURA? Se mira el color de fondo REAL subiendo por los contenedores;
     si todos son transparentes, lo que prefiera el sistema. */
  function esOscuro(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var bg = (window.getComputedStyle(n).backgroundColor || '').trim();
      var m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        var p = m[1].split(',').map(function (x) { return parseFloat(x); });
        if (p.length < 4 || p[3] > 0.05) {
          var lum = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
          return lum < 128;
        }
      }
      n = n.parentElement;
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function pop(item) {
    var o = document.createElement('div'); o.className = 'np33-pop';
    o.innerHTML = '<div class="np33-pop__box" role="dialog" aria-modal="true">' +
      '<div class="np33-pop__bar"><span>' + esc(item.title || 'Nota de prensa') + '</span>' +
      '<span><a href="' + esc(item.url) + '" target="_blank" rel="noopener">Abrir</a> ' +
      '<button type="button" class="np33-pop__x" aria-label="Cerrar">&times;</button></span></div>' +
      '<iframe class="np33-pop__frame" src="' + esc(item.embed_url) + '" title="' + esc(item.title || '') + '" loading="eager"></iframe></div>';
    function cierra() { o.remove(); document.removeEventListener('keydown', tecla); document.documentElement.style.overflow = antes; }
    function tecla(ev) { if (ev.key === 'Escape') cierra(); }
    var antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    o.addEventListener('click', function (ev) { if (ev.target === o || ev.target.closest('.np33-pop__x')) cierra(); });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(o);
  }

  function render(container, data) {
    css();
    var items = (data && data.items) || [];
    container.classList.add('np33');
    if (container.getAttribute('data-np33-bleed') !== '0') container.classList.add('np33--bleed');
    container.classList.toggle('np33--dark', esOscuro(container.parentElement || container));
    if (!items.length) { container.innerHTML = '<div class="np33__empty">' + esc(data.empty || 'Todavía no hay notas de prensa.') + '</div>'; return; }
    container.innerHTML = '<button type="button" class="np33__arrow np33__arrow--l" aria-label="Anteriores">&#8249;</button>' +
      '<div class="np33__track">' + items.map(function (it, i) {
        return '<button type="button" class="np33__card" data-np33-i="' + i + '">' +
          (it.thumb ? '<img class="np33__thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy">' : '<div class="np33__thumb"></div>') +
          '<span class="np33__body">' + (it.date ? '<span class="np33__date">' + esc(it.date) + '</span>' : '') +
          '<span class="np33__title">' + esc(it.title || 'Nota de prensa') + '</span>' +
          (it.summary ? '<span class="np33__sum">' + esc(it.summary) + '</span>' : '') + '</span></button>';
      }).join('') + '</div>' +
      '<button type="button" class="np33__arrow np33__arrow--r" aria-label="Siguientes">&#8250;</button>';
    var track = container.querySelector('.np33__track');
    function paso() { var c = track.querySelector('.np33__card'); return c ? c.getBoundingClientRect().width + 16 : 320; }
    function flechas() {
      var l = container.querySelector('.np33__arrow--l'), r = container.querySelector('.np33__arrow--r');
      if (l) l.disabled = track.scrollLeft <= 2;
      if (r) r.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    }
    container.addEventListener('click', function (ev) {
      if (ev.target.closest('.np33__arrow--l')) { track.scrollBy({ left: -paso() * 2, behavior: 'smooth' }); return; }
      if (ev.target.closest('.np33__arrow--r')) { track.scrollBy({ left: paso() * 2, behavior: 'smooth' }); return; }
      var card = ev.target.closest('.np33__card');
      if (card) pop(items[parseInt(card.getAttribute('data-np33-i'), 10)]);
    });
    track.addEventListener('scroll', flechas);
    window.addEventListener('resize', flechas);
    setTimeout(flechas, 50);
  }

  function boot(data, script) {
    var clave = (data && data.key) || '';
    var container = clave ? document.querySelector('[data-np33="' + clave.replace(/"/g, '') + '"]:not(.np33)') : null;
    if (!container) {
      // Sin el <div> del código de inserción (se pegó solo el <script>): se pinta justo donde está.
      container = document.createElement('div');
      container.setAttribute('data-np33', clave);
      if (script && script.parentNode) script.parentNode.insertBefore(container, script.nextSibling);
      else document.body.appendChild(container);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(container, data); });
    else render(container, data);
  }
  window.np33Embed = { boot: boot, render: render };
})();
