/* Calendario de VACACIONES Y DÍAS LIBRES.
 *
 * Un solo componente para las dos pantallas: «Mis vacaciones» (año entero, y el mismo calendario
 * en modo selección para pedir) y la sección de gestión (un mes, con las fotos de quien está de
 * vacaciones y flechas para moverse). Así una mejora vale para las dos.
 *
 * Reglas que se ven aquí: sábados y domingos en otro color, festivos de Madrid marcados, y al
 * SELECCIONAR solo cuentan los días laborables (el contador lo dice en vivo). Quién puede pedir
 * cuántos días lo decide el servidor: esto es la ayuda visual, no el control.
 */
(function () {
  'use strict';

  var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  function iso(d) {
    // ⚠️ NADA de toISOString(): pasa por UTC y en España se lleva el día por delante.
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function fromIso(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  function dowIndex(d) { return (d.getDay() + 6) % 7; }   // 0 = lunes … 6 = domingo
  function isWeekend(d) { return dowIndex(d) >= 5; }

  /* ------------------------------------------------------------------ */

  function Calendar(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.holidays = {};
    (this.opts.holidays || []).forEach(function (h) { this.holidays[h.day] = h; }, this);
    this.byDay = {};                       // iso -> [{user_id,status,counts}]
    // Y el índice al revés: cada PETICIÓN con todos sus días, para poder destacar el tramo entero al
    // pasar el ratón por encima de cualquiera de ellos.
    this.byRequest = {};                   // request_id -> [iso, iso, …]
    (this.opts.days || []).forEach(function (d) {
      (this.byDay[d.day] = this.byDay[d.day] || []).push(d);
      if (d.request_id) (this.byRequest[d.request_id] = this.byRequest[d.request_id] || []).push(d.day);
    }, this);
    this.people = {};
    (this.opts.people || []).forEach(function (p) { this.people[p.user_id] = p; }, this);
    this.selected = {};                    // iso -> true
    (this.opts.selected || []).forEach(function (s) { this.selected[s] = true; }, this);
    this.month = this.opts.month || (new Date()).getMonth() + 1;
    this.year = this.opts.year || (new Date()).getFullYear();
    this.drag = null;
    this.render();
  }

  Calendar.prototype.selectedList = function () {
    return Object.keys(this.selected).filter(function (k) { return this.selected[k]; }, this).sort();
  };

  /* Los que CONSUMEN saldo: ni fin de semana ni festivo. Es la misma regla del servidor
     (_vacation_day_counts): si se toca una, se toca la otra. */
  Calendar.prototype.countingList = function () {
    return this.selectedList().filter(function (s) {
      return !isWeekend(fromIso(s)) && !this.holidays[s];
    }, this);
  };

  Calendar.prototype.notifyChange = function () {
    if (typeof this.opts.onChange === 'function') {
      this.opts.onChange(this.selectedList(), this.countingList());
    }
  };

  Calendar.prototype.setMonth = function (year, month) {
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    this.year = year; this.month = month;
    this.render();
    if (typeof this.opts.onMonthChange === 'function') this.opts.onMonthChange(year, month);
  };

  Calendar.prototype.render = function () {
    var mode = this.opts.mode || 'year';
    this.root.innerHTML = '';
    this.root.classList.add('vac-cal');
    this.root.classList.toggle('vac-cal--select', !!this.opts.selectable);

    if (mode === 'month') {
      var head = document.createElement('div');
      head.className = 'vac-cal__nav';
      head.innerHTML =
        '<button type="button" class="btn btn-outline-secondary btn-sm" data-vac-prev aria-label="Mes anterior"><i class="fa fa-chevron-left"></i></button>' +
        '<div class="vac-cal__navtitle">' + MESES[this.month - 1] + ' ' + this.year + '</div>' +
        '<button type="button" class="btn btn-outline-secondary btn-sm" data-vac-next aria-label="Mes siguiente"><i class="fa fa-chevron-right"></i></button>';
      this.root.appendChild(head);
      var self = this;
      head.querySelector('[data-vac-prev]').addEventListener('click', function () { self.setMonth(self.year, self.month - 1); });
      head.querySelector('[data-vac-next]').addEventListener('click', function () { self.setMonth(self.year, self.month + 1); });
      this.root.appendChild(this.buildMonth(this.year, this.month, true));
    } else {
      var grid = document.createElement('div');
      grid.className = 'vac-cal__year';
      for (var m = 1; m <= 12; m++) grid.appendChild(this.buildMonth(this.year, m, false));
      this.root.appendChild(grid);
    }
    this.bindSelection();
    // ⚠️ Se engancha UNA vez por calendario: `render()` rehace las casillas pero el listener vive en
    // la raíz (delegación), así que no hay que volver a atarlo en cada repintado.
    if (!this._hlBound) { this._hlBound = true; this.bindHighlight(); }
    if (this.pinned) this.highlight(this.pinned, true);
  };

  Calendar.prototype.buildMonth = function (year, month, big) {
    var box = document.createElement('div');
    box.className = 'vac-month' + (big ? ' vac-month--big' : '');

    var title = document.createElement('div');
    title.className = 'vac-month__title';
    title.textContent = MESES[month - 1] + (big ? '' : ' ' + year);
    if (!big) box.appendChild(title);

    var grid = document.createElement('div');
    grid.className = 'vac-month__grid';
    DOW.forEach(function (d, i) {
      var c = document.createElement('div');
      c.className = 'vac-dow' + (i >= 5 ? ' is-weekend' : '');
      c.textContent = d;
      grid.appendChild(c);
    });

    var first = new Date(year, month - 1, 1);
    for (var i = 0; i < dowIndex(first); i++) {
      var hueco = document.createElement('div');
      hueco.className = 'vac-day is-empty';
      grid.appendChild(hueco);
    }
    var last = new Date(year, month, 0).getDate();
    for (var day = 1; day <= last; day++) {
      grid.appendChild(this.buildDay(new Date(year, month - 1, day), big));
    }
    box.appendChild(grid);

    /* QUÉ FESTIVIDAD ES cada festivo: en la vista de año la casilla es un cuadradito donde no cabe
       el nombre, así que los festivos del mes se listan debajo (día + nombre). En la vista de mes el
       nombre va dentro de la propia casilla (`buildDay`). */
    var fiestas = this.holidaysOfMonth(year, month);
    if (fiestas.length && !big) {
      var pie = document.createElement('div');
      pie.className = 'vac-month__fests';
      pie.innerHTML = fiestas.map(function (f) {
        var clase = 'vac-fest' + (f.scope === 'EMPRESA' ? ' is-nonworking' : '');
        return '<span class="' + clase + '"><b>' + fromIso(f.day).getDate() + '</b> ' +
          String(f.name || '').replace(/[&<>]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
          }) + '</span>';
      }).join('');
      box.appendChild(pie);
    }
    return box;
  };

  /* Los festivos de un mes, en orden. */
  Calendar.prototype.holidaysOfMonth = function (year, month) {
    var pre = year + '-' + String(month).padStart(2, '0') + '-';
    var self = this;
    return Object.keys(this.holidays)
      .filter(function (k) { return k.indexOf(pre) === 0; })
      .sort()
      .map(function (k) { return self.holidays[k]; });
  };

  Calendar.prototype.buildDay = function (d, big) {
    var key = iso(d);
    var cel = document.createElement('div');
    cel.className = 'vac-day';
    cel.dataset.day = key;

    var fest = this.holidays[key];
    if (isWeekend(d)) cel.classList.add('is-weekend');
    if (fest) {
      // Un NO LABORABLE de la oficina se distingue del festivo oficial (los dos dejan de contar).
      cel.classList.add(fest.scope === 'EMPRESA' ? 'is-nonworking' : 'is-holiday');
      // Un no laborable que solo es de algunas personas se dice (en el calendario de toda la oficina
      // no se puede dar por hecho que es de todo el mundo).
      if (fest.partial) cel.classList.add('is-partial');
      cel.title = fest.name + (fest.scope_label ? ' · ' + fest.scope_label : '') +
        (fest.partial ? ' · solo para algunas personas' : '');
    }
    if (key === iso(new Date())) cel.classList.add('is-today');
    if (this.selected[key]) cel.classList.add('is-selected');

    var num = document.createElement('span');
    num.className = 'vac-day__n';
    num.textContent = d.getDate();
    cel.appendChild(num);

    // En la vista de MES cabe el nombre de la festividad dentro de la casilla: se pone, que es lo
    // que hace falta para saber de qué festivo se trata sin pasar el ratón por encima.
    if (fest && big) {
      var nombre = document.createElement('span');
      nombre.className = 'vac-day__fest';
      nombre.textContent = fest.name;
      cel.appendChild(nombre);
    }

    var ocupados = this.byDay[key] || [];
    if (ocupados.length) {
      // Qué peticiones tocan este día: es lo que se destaca al pasar el ratón por encima.
      cel.dataset.reqs = ocupados.map(function (o) { return o.request_id || ''; })
                                 .filter(function (x) { return x; }).join(' ');
      var pendiente = ocupados.some(function (o) { return o.status === 'PENDING'; });
      var aprobado = ocupados.some(function (o) { return o.status === 'APPROVED'; });
      // VACACIONES y DÍA LIBRE se ven distintos: son dos cuentas separadas.
      var esLibre = ocupados.every(function (o) { return o.kind === 'DIA_LIBRE'; });
      if (esLibre) cel.classList.add('is-free');
      cel.classList.add(aprobado ? 'is-approved' : (pendiente ? 'is-pending' : ''));
      /* RAYITAS por persona (cuadrante general): una barra por persona con SU color y su foto, y al
         pasar el ratón se dice qué es, el motivo y de quién. Vale también en la vista de año, donde
         la casilla es pequeña y no caben las etiquetas grandes. */
      if (this.opts.stripes && this.opts.people && this.opts.people.length) {
        var barras = document.createElement('div');
        barras.className = 'vac-day__bars';
        var puestos = {};
        ocupados.forEach(function (o) {
          var clave = o.user_id + '|' + (o.request_id || '');
          if (puestos[clave]) return;
          puestos[clave] = true;
          var p = this.people[o.user_id];
          if (!p) return;
          var bar = document.createElement('span');
          bar.className = 'vac-bar' + (o.status === 'PENDING' ? ' is-pending' : '');
          bar.dataset.req = o.request_id || '';
          bar.style.background = p.color || '#888';
          var tipo = (this.opts.kinds && this.opts.kinds[o.kind] && this.opts.kinds[o.kind].label) ||
                     (o.kind === 'DIA_LIBRE' ? 'Día libre' : 'Vacaciones');
          bar.title = p.nick + ' · ' + tipo +
                      (o.status === 'PENDING' ? ' (sin aprobar)' : ' (aprobado)') +
                      (o.note ? ' · ' + o.note : '');
          if (p.photo_url) {
            var foto = document.createElement('img');
            foto.src = p.photo_url; foto.alt = p.nick;
            bar.appendChild(foto);
          }
          barras.appendChild(bar);
        }, this);
        if (barras.childNodes.length) cel.appendChild(barras);
      } else if (big && this.opts.people && this.opts.people.length) {
        var chips = document.createElement('div');
        chips.className = 'vac-day__people';
        var vistos = {};
        ocupados.forEach(function (o) {
          if (vistos[o.user_id]) return;
          vistos[o.user_id] = true;
          var p = this.people[o.user_id];
          if (!p) return;
          var chip = document.createElement('span');
          chip.className = 'vac-chip' + (o.status === 'PENDING' ? ' is-pending' : '') +
                           (o.kind === 'DIA_LIBRE' ? ' is-free' : '');
          chip.title = p.nick + (o.kind === 'DIA_LIBRE' ? ' · día libre' : '') +
                       (o.status === 'PENDING' ? ' · pendiente de aprobar' : '');
          if (p.photo_url) {
            var img = document.createElement('img');
            img.src = p.photo_url; img.alt = p.nick;
            chip.appendChild(img);
          } else {
            chip.textContent = (p.nick || '?').slice(0, 2).toUpperCase();
            chip.style.background = p.color || '#888';
            chip.classList.add('vac-chip--txt');
          }
          chips.appendChild(chip);
        }, this);
        if (chips.childNodes.length) cel.appendChild(chips);
      } else if (!big) {
        var punto = document.createElement('span');
        punto.className = 'vac-day__dot' + (aprobado ? '' : ' is-pending') + (esLibre ? ' is-free' : '');
        cel.appendChild(punto);
      }
    }
    return cel;
  };

  /* Selección por clic y ARRASTRE. Se recorre el rango entre el día donde empezó el gesto y el
     de debajo del puntero: así un barrido rápido no se salta días (mismo problema que en el
     asignador de invitaciones y en el mapa de butacas). */
  Calendar.prototype.bindSelection = function () {
    if (!this.opts.selectable) return;
    var self = this;

    function celdaDe(el) {
      var cel = (el && el.closest) ? el.closest('.vac-day') : null;
      return (cel && cel.dataset.day && !cel.classList.contains('is-empty')) ? cel.dataset.day : null;
    }

    /* Qué día hay bajo el puntero.
       ⚠️ Al EMPEZAR el gesto manda `ev.target` (el propio elemento pulsado) y `elementFromPoint`
       queda de respaldo: dentro de un modal con scroll, una celda que no esté en el viewport hace
       que `elementFromPoint` devuelva otra cosa (o nada) y el clic se pierda. Al ARRASTRAR es al
       revés: con captura de puntero `ev.target` se queda en la celda de origen, así que ahí hay
       que mirar de verdad qué hay debajo. */
    function dayAt(ev, prefiereTarget) {
      var porPunto = function () {
        var t = document.elementFromPoint(
          (ev.touches ? ev.touches[0].clientX : ev.clientX),
          (ev.touches ? ev.touches[0].clientY : ev.clientY));
        return celdaDe(t);
      };
      return prefiereTarget ? (celdaDe(ev.target) || porPunto()) : (porPunto() || celdaDe(ev.target));
    }

    /* Marca UN día (el modo lo decide el primero del gesto: si estaba suelto se marca, si estaba
       marcado se desmarca). */
    function marcaDia(key) {
      if (!key) return false;
      if (self.drag.mode === 'add') {
        if (self.selected[key]) return false;
        self.selected[key] = true;
      } else {
        if (!self.selected[key]) return false;
        delete self.selected[key];
      }
      return true;
    }

    /* ⚠️ El arrastre marca los días POR LOS QUE SE PASA, uno a uno — NO el bloque entre el primero y
       el de debajo del puntero (antes se pintaba el rango entero, así que al cruzar de fila se
       marcaban días por los que no habías pasado).
       Para que un barrido rápido no se salte ninguno se recorre el CAMINO del puntero (los eventos
       coalescidos e interpolando entre puntos), el mismo truco del mapa de butacas. */
    function caminoDe(ev) {
      var puntos = [];
      // ⚠️ `getCoalescedEvents()` puede devolver una lista VACÍA (y una lista vacía es «verdadera»,
      // así que con un `||` no se caía al propio evento y no se marcaba nada).
      var brutos = [];
      try { brutos = (ev.getCoalescedEvents && ev.getCoalescedEvents()) || []; } catch (e) { brutos = []; }
      if (!brutos.length) brutos = [ev];
      brutos.forEach(function (e) {
        var x = (e.touches ? e.touches[0].clientX : e.clientX);
        var y = (e.touches ? e.touches[0].clientY : e.clientY);
        if (x == null || y == null) return;
        var ult = self.drag.lastPt;
        if (ult) {
          // Se interpola cada ~8 px: así no se cuela ninguna casilla entre dos posiciones.
          var dx = x - ult.x, dy = y - ult.y;
          var pasos = Math.min(60, Math.max(1, Math.round(Math.hypot(dx, dy) / 8)));
          for (var i = 1; i < pasos; i++) {
            puntos.push({ x: ult.x + (dx * i) / pasos, y: ult.y + (dy * i) / pasos });
          }
        }
        puntos.push({ x: x, y: y });
        self.drag.lastPt = { x: x, y: y };
      });
      return puntos;
    }

    this.root.addEventListener('pointerdown', function (ev) {
      var key = dayAt(ev, true);
      if (!key) return;
      ev.preventDefault();
      self.drag = { mode: self.selected[key] ? 'remove' : 'add',
                    lastPt: { x: ev.clientX, y: ev.clientY } };
      marcaDia(key);
      self.repaint();
    });

    this.root.addEventListener('pointermove', function (ev) {
      if (!self.drag) return;
      var cambio = false;
      caminoDe(ev).forEach(function (p) {
        var cel = document.elementFromPoint(p.x, p.y);
        if (marcaDia(celdaDe(cel))) cambio = true;
      });
      if (cambio) self.repaint();
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
      self.root.addEventListener(evt, function () {
        if (!self.drag) return;
        self.drag = null;
        self.notifyChange();
      });
    });
  };

  /* DESTACAR EL TRAMO ENTERO. Al pasar el ratón por encima de unas vacaciones o de un día libre se
     marcan TODOS sus días (y en el cuadrante general, su rayita), así se ve de un golpe cuánto dura.
     Al PINCHAR se queda fijo (y se suelta al volver a pinchar o al pulsar Escape); en los calendarios
     donde se marcan días el clic es para eso, así que ahí solo se destaca al pasar por encima. */
  Calendar.prototype.highlight = function (reqs, pinned) {
    var lista = (reqs || []).filter(function (x) { return x; });
    this.pinned = pinned ? lista.slice() : null;
    var dias = {};
    lista.forEach(function (rid) {
      (this.byRequest[rid] || []).forEach(function (d) { dias[d] = true; });
    }, this);
    var alguno = Object.keys(dias).length > 0;
    this.root.classList.toggle('vac-cal--hl', alguno);
    this.root.querySelectorAll('.vac-day').forEach(function (cel) {
      cel.classList.toggle('is-hl', !!dias[cel.dataset.day]);
    });
    this.root.querySelectorAll('.vac-bar').forEach(function (bar) {
      bar.classList.toggle('is-hl', lista.indexOf(bar.dataset.req) > -1);
    });
  };

  Calendar.prototype.bindHighlight = function () {
    var self = this;
    function reqsDe(ev) {
      var bar = ev.target.closest ? ev.target.closest('.vac-bar') : null;
      if (bar && bar.dataset.req) return [bar.dataset.req];      // la rayita de esa persona
      var cel = ev.target.closest ? ev.target.closest('.vac-day') : null;
      if (!cel || !cel.dataset.reqs) return [];
      return cel.dataset.reqs.split(' ');
    }
    this.root.addEventListener('mouseover', function (ev) {
      if (self.pinned || self.drag) return;
      var reqs = reqsDe(ev);
      if (reqs.length) self.highlight(reqs, false);
    });
    this.root.addEventListener('mouseleave', function () {
      if (!self.pinned) self.highlight([], false);
    });
    this.root.addEventListener('click', function (ev) {
      if (self.opts.selectable) return;      // ahí el clic es para marcar días
      var reqs = reqsDe(ev);
      var yaFijo = self.pinned && reqs.length && self.pinned.join(' ') === reqs.join(' ');
      self.highlight(yaFijo ? [] : reqs, !yaFijo && reqs.length > 0);
    });
    /* DOBLE CLIC = EDITAR esas vacaciones (quien las gestiona), igual que en la agenda: el clic
       simple fija el destacado y el doble clic abre su pop-up. Solo si la pantalla lo cablea
       (`onRequestOpen`), así que en «Mis vacaciones» no pasa nada: nadie toca sus propios días. */
    this.root.addEventListener('dblclick', function (ev) {
      if (self.opts.selectable || typeof self.opts.onRequestOpen !== 'function') return;
      var reqs = reqsDe(ev);
      if (!reqs.length) return;
      ev.preventDefault();
      self.opts.onRequestOpen(reqs[0]);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && self.pinned) self.highlight([], false);
    });
  };

  Calendar.prototype.repaint = function () {
    var self = this;
    this.root.querySelectorAll('.vac-day').forEach(function (cel) {
      cel.classList.toggle('is-selected', !!self.selected[cel.dataset.day]);
    });
  };

  Calendar.prototype.clear = function () {
    this.selected = {};
    this.repaint();
    this.notifyChange();
  };

  /* Cambiar los días OCUPADOS que se pintan (pedidos pendientes y aprobados). El calendario de un
     modal se reutiliza para personas distintas, así que sin esto se quedaban los de la anterior. */
  Calendar.prototype.setDays = function (days) {
    this.byDay = {};
    this.byRequest = {};
    (days || []).forEach(function (d) {
      (this.byDay[d.day] = this.byDay[d.day] || []).push(d);
      if (d.request_id) (this.byRequest[d.request_id] = this.byRequest[d.request_id] || []).push(d.day);
    }, this);
    this.render();
  };

  /* ------------------------------------------------------------------ */

  window.VacCalendar = {
    create: function (root, opts) {
      if (typeof root === 'string') root = document.querySelector(root);
      if (!root) return null;
      return new Calendar(root, opts);
    },
    iso: iso,
    isWeekend: function (s) { return isWeekend(fromIso(s)); }
  };
})();
