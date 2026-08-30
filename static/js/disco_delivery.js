/* CALENDARIO DE ENTREGAS de un proyecto discográfico.
 *
 * A la izquierda lo que hay que fijar (la mezcla final, el máster, la portada…) y a la derecha el
 * calendario: se ARRASTRA cada cosa al día que le toca.
 * ⚠️ Solo se puede soltar donde el plazo es POSIBLE: cada cosa tiene su tope (si para distribuir el
 *    máster hacen falta 3 semanas, no se puede entregar 2 semanas antes). Los días imposibles para
 *    lo que se está arrastrando se ven apagados y no aceptan el soltar.
 * ⚠️ Lo ya puesto se vuelve a arrastrar para moverlo, y con la ✕ se quita.
 * ⚠️ El tope lo comprueba TAMBIÉN el servidor (`_disco_delivery_apply`): esto es la comodidad, no la
 *    barrera.
 */
(function () {
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
               'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function deIso(v) {
    var p = String(v || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  function bonita(v) {
    var d = deIso(v);
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
      + '/' + d.getFullYear();
  }

  function init(root) {
    if (!root || root.__dc) return;
    root.__dc = true;
    var grid = root.querySelector('[data-dc-grid]');
    var titulo = root.querySelector('[data-dc-title]');
    var lanzamiento = deIso(root.getAttribute('data-release'));
    var mes = lanzamiento ? new Date(lanzamiento.getFullYear(), lanzamiento.getMonth(), 1)
                          : new Date();
    var arrastrando = null;          // la ficha que se está moviendo

    function fichas() {
      return Array.prototype.slice.call(root.querySelectorAll('[data-dc-key]'));
    }
    function fechaDe(ficha) {
      var input = ficha.querySelector('input[type="hidden"]');
      return input ? input.value : '';
    }
    function pon(ficha, valor) {
      var input = ficha.querySelector('input[type="hidden"]');
      if (input) input.value = valor || '';
      var etq = ficha.querySelector('[data-dc-date]');
      if (etq) etq.textContent = bonita(valor);
      ficha.classList.toggle('is-set', !!valor);
      pinta();
    }

    /* El calendario del mes, con lo que cae en cada día. */
    function pinta() {
      if (!grid) return;
      if (titulo) titulo.textContent = MESES[mes.getMonth()] + ' ' + mes.getFullYear();
      var primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
      var hueco = (primero.getDay() + 6) % 7;          // lunes primero
      var total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      var puestas = {};
      fichas().forEach(function (f) {
        var v = fechaDe(f);
        if (v) (puestas[v] = puestas[v] || []).push(f);
      });
      var html = '<div class="dc-cal__dow">'
        + DIAS.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>'
        + '<div class="dc-cal__days">';
      for (var i = 0; i < hueco; i++) html += '<span class="dc-day is-empty"></span>';
      for (var dia = 1; dia <= total; dia++) {
        var f = new Date(mes.getFullYear(), mes.getMonth(), dia);
        var v = iso(f);
        var esLanz = lanzamiento && v === iso(lanzamiento);
        var dentro = (puestas[v] || []).map(function (x) {
          return '<span class="dc-chip" data-dc-chip="' + x.getAttribute('data-dc-key') + '">'
            + '<i class="fa ' + (x.querySelector('.fa') ? x.querySelector('.fa').className.replace('fa ', '') : 'fa-circle') + '"></i>'
            + x.getAttribute('data-dc-label') + '</span>';
        }).join('');
        // ⚠️ El día del LANZAMIENTO se marca como el resto de elementos (su borde y su fondo, igual
        // que en el calendario de Inicio): nada de emojis.
        html += '<span class="dc-day' + (esLanz ? ' is-release' : '') + '" data-dc-day="' + v + '"'
          + (esLanz ? ' title="Día de lanzamiento"' : '') + '>'
          + '<span class="dc-day__n">' + dia + '</span>' + dentro + '</span>';
      }
      html += '</div>';
      grid.innerHTML = html;
      marcaImposibles();
    }

    /* Mientras se arrastra, los días a los que ya no se llega se apagan. */
    function marcaImposibles() {
      var tope = arrastrando ? deIso(arrastrando.getAttribute('data-dc-limit')) : null;
      Array.prototype.forEach.call(grid.querySelectorAll('[data-dc-day]'), function (celda) {
        var d = deIso(celda.getAttribute('data-dc-day'));
        var mal = !!(arrastrando && tope && d && d > tope);
        celda.classList.toggle('is-off', mal);
      });
    }

    root.addEventListener('dragstart', function (ev) {
      var ficha = ev.target.closest('[data-dc-key]');
      var chip = ev.target.closest('[data-dc-chip]');
      if (chip) {
        ficha = root.querySelector('[data-dc-key="' + chip.getAttribute('data-dc-chip') + '"]');
      }
      if (!ficha) return;
      arrastrando = ficha;
      // Hace falta setData para que el arrastre funcione en todos los navegadores.
      try { ev.dataTransfer.setData('text/plain', ficha.getAttribute('data-dc-key')); } catch (e) {}
      ev.dataTransfer.effectAllowed = 'move';
      marcaImposibles();
    });
    root.addEventListener('dragend', function () {
      arrastrando = null;
      marcaImposibles();
    });
    root.addEventListener('dragover', function (ev) {
      var celda = ev.target.closest('[data-dc-day]');
      if (!celda || !arrastrando || celda.classList.contains('is-off')) return;
      ev.preventDefault();
      celda.classList.add('is-over');
    });
    root.addEventListener('dragleave', function (ev) {
      var celda = ev.target.closest('[data-dc-day]');
      if (celda) celda.classList.remove('is-over');
    });
    root.addEventListener('drop', function (ev) {
      var celda = ev.target.closest('[data-dc-day]');
      if (!celda || !arrastrando) return;
      ev.preventDefault();
      celda.classList.remove('is-over');
      if (celda.classList.contains('is-off')) return;
      pon(arrastrando, celda.getAttribute('data-dc-day'));
      arrastrando = null;
    });
    // Un clic en un día también vale (más cómodo en el móvil): fija la ficha seleccionada.
    root.addEventListener('click', function (ev) {
      var quitar = ev.target.closest('[data-dc-clear]');
      if (quitar) {
        var f = quitar.closest('[data-dc-key]');
        if (f) pon(f, '');
        return;
      }
      var ficha = ev.target.closest('[data-dc-key]');
      if (ficha) {
        fichas().forEach(function (x) { x.classList.toggle('is-picked', x === ficha); });
        arrastrando = ficha;
        marcaImposibles();
        return;
      }
      var celda = ev.target.closest('[data-dc-day]');
      if (celda && arrastrando && !celda.classList.contains('is-off')) {
        pon(arrastrando, celda.getAttribute('data-dc-day'));
        arrastrando.classList.remove('is-picked');
        arrastrando = null;
        marcaImposibles();
      }
    });
    var prev = root.querySelector('[data-dc-prev]');
    var next = root.querySelector('[data-dc-next]');
    if (prev) prev.addEventListener('click', function () {
      mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); pinta();
    });
    if (next) next.addEventListener('click', function () {
      mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); pinta();
    });
    // Las fichas del calendario también se arrastran (para mover lo ya puesto).
    grid.addEventListener('mousedown', function (ev) {
      var chip = ev.target.closest('[data-dc-chip]');
      if (chip) chip.setAttribute('draggable', 'true');
    });
    pinta();
  }

  function initAll() {
    document.querySelectorAll('[data-dc-root]').forEach(init);
  }
  document.addEventListener('DOMContentLoaded', initAll);
  if (document.readyState !== 'loading') initAll();
  // El pop-up puede pintarse después: al abrirlo se inicializa (y `__dc` evita repetirlo).
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-bs-target="#dpDeliveryModal"]')) setTimeout(initAll, 60);
  });
})();
