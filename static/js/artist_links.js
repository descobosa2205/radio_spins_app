/* Enlace global a la ficha de artista. Cualquier elemento con data-artist-link="<id>" se vuelve
   clicable y navega a /artistas/<id>, SIN cambiar su aspecto (solo el cursor de mano). Con
   cmd/ctrl/clic central abre la ficha en una pestaña nueva. Delegación: funciona con cualquier
   número de elementos, incluidos los pintados dinámicamente (p. ej. el calendario de agenda). */
(function () {
  function urlFor(id) { return '/artistas/' + encodeURIComponent(id); }

  function target(ev) {
    var t = ev.target.closest('[data-artist-link]');
    if (!t || !t.getAttribute('data-artist-link')) return null;
    // Si se pincha un enlace/botón propio dentro del elemento, respétalo (no navegar al artista).
    var inner = ev.target.closest('a,button');
    if (inner && inner !== t && t.contains(inner)) return null;
    return t;
  }

  document.addEventListener('click', function (ev) {
    var t = target(ev);
    if (!t) return;
    var url = urlFor(t.getAttribute('data-artist-link'));
    ev.preventDefault();
    if (ev.metaKey || ev.ctrlKey || ev.button === 1) window.open(url, '_blank');
    else window.location.href = url;
  });

  document.addEventListener('auxclick', function (ev) {
    if (ev.button !== 1) return;
    var t = target(ev);
    if (!t) return;
    ev.preventDefault();
    window.open(urlFor(t.getAttribute('data-artist-link')), '_blank');
  });
})();
