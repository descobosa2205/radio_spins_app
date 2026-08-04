/* address_autocomplete.js — AUTOCOMPLETAR LA DIRECCIÓN FISCAL (global).
 *
 * Se escribe la calle y se rellenan solos el código postal, el municipio, la provincia y el país,
 * que es lo que la contabilidad necesita separado para dar de alta al proveedor.
 *
 * Cómo funciona:
 *   · En el campo de la CALLE, a partir de 4 letras y con 350 ms de calma, se piden sugerencias a
 *     `/api/direcciones` y salen en una lista; al elegir una se rellena todo el bloque.
 *   · En el CÓDIGO POSTAL, al tener 5 dígitos, la PROVINCIA se pone al instante con la tabla de aquí
 *     abajo (sin pedir nada a nadie) y el municipio se sugiere si está vacío.
 *   · Nunca se pisa un dato ya escrito a mano sin avisar: al elegir una sugerencia se rellena todo
 *     (es lo que se ha pedido), pero el relleno automático del CP solo toca lo que está VACÍO.
 *
 * ⚠️ La tabla de provincias está ESPEJADA en `geo_utils.py` (PROVINCE_BY_CP): si se toca una, se toca
 * la otra. Son las 52 provincias por los dos primeros dígitos del CP y no cambian.
 *
 * Es una AYUDA: si el servicio no responde, no pasa nada y se escribe a mano.
 */
(function () {
  'use strict';

  var PROVINCIA_POR_CP = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
    '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
    '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
    '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
    '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
    '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
    '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria',
    '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
    '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora',
    '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
  };

  function cpLimpio(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 4) d = '0' + d;          // «8001» por «08001» pasa más de lo que parece
    return d.length === 5 ? d : '';
  }

  function provinciaDeCp(v) {
    var cp = cpLimpio(v);
    return cp ? (PROVINCIA_POR_CP[cp.slice(0, 2)] || '') : '';
  }

  function campos(zona) {
    return {
      calle: zona.querySelector('[data-addr="address"]'),
      cp: zona.querySelector('[data-addr="postal_code"]'),
      municipio: zona.querySelector('[data-addr="city"]'),
      provincia: zona.querySelector('[data-addr="province"]'),
      pais: zona.querySelector('[data-addr="country"]')
    };
  }

  function poner(input, valor, soloSiVacio) {
    if (!input || !valor) return;
    if (soloSiVacio && (input.value || '').trim()) return;
    input.value = valor;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------------------------------------------------------------- lista de sugerencias
  function lista(zona) {
    var caja = zona.querySelector('[data-addr-list]');
    if (!caja) {
      caja = document.createElement('div');
      caja.className = 'addr-suggest d-none';
      caja.setAttribute('data-addr-list', '');
      var padre = (campos(zona).calle || zona).parentElement || zona;
      padre.style.position = padre.style.position || 'relative';
      padre.appendChild(caja);
    }
    return caja;
  }

  function cerrar(zona) {
    var caja = zona.querySelector('[data-addr-list]');
    if (caja) { caja.classList.add('d-none'); caja.innerHTML = ''; }
  }

  function pintar(zona, filas) {
    var caja = lista(zona);
    if (!filas || !filas.length) { cerrar(zona); return; }
    caja.innerHTML = filas.map(function (f, i) {
      return '<button type="button" class="addr-suggest__item" data-addr-pick="' + i + '">' +
        '<span class="addr-suggest__main">' + (f.address || f.city || '') + '</span>' +
        '<span class="addr-suggest__sub">' +
        [f.postal_code, f.city, f.province].filter(Boolean).join(' · ') +
        (f.country && f.country !== 'España' ? ' · ' + f.country : '') + '</span></button>';
    }).join('');
    caja._filas = filas;
    caja.classList.remove('d-none');
  }

  function elegir(zona, fila) {
    if (!fila) return;
    var c = campos(zona);
    poner(c.calle, fila.address, false);
    poner(c.cp, fila.postal_code, false);
    poner(c.municipio, fila.city, false);
    // La provincia SIEMPRE del código postal: es el dato que no falla.
    poner(c.provincia, provinciaDeCp(fila.postal_code) || fila.province, false);
    poner(c.pais, fila.country || 'España', false);
    cerrar(zona);
  }

  // ---------------------------------------------------------------- buscar (con calma)
  var temporizadores = new WeakMap();

  function buscar(zona) {
    var c = campos(zona);
    if (!c.calle) return;
    var q = (c.calle.value || '').trim();
    // Con el municipio ya escrito, la búsqueda acierta mucho más.
    var muni = c.municipio && c.municipio.value ? (' ' + c.municipio.value.trim()) : '';
    if (q.length < 4) { cerrar(zona); return; }
    fetch('/api/direcciones?q=' + encodeURIComponent(q + muni), {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { pintar(zona, (d && d.results) || []); })
      .catch(function () { cerrar(zona); });     // es una ayuda: si falla, a mano y sin ruido
  }

  function programar(zona) {
    clearTimeout(temporizadores.get(zona));
    temporizadores.set(zona, setTimeout(function () { buscar(zona); }, 350));
  }

  // ---------------------------------------------------------------- código postal → provincia
  function alEscribirCp(zona, input) {
    var c = campos(zona);
    var prov = provinciaDeCp(input.value);
    if (!prov) return;
    poner(c.provincia, prov, true);            // solo si está vacía: no se pisa lo escrito a mano
    poner(c.pais, 'España', true);
    if (c.municipio && !(c.municipio.value || '').trim()) {
      fetch('/api/direcciones?q=' + encodeURIComponent(cpLimpio(input.value)), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.cities && d.cities.length) poner(c.municipio, d.cities[0], true);
        })
        .catch(function () {});
    }
  }

  // ---------------------------------------------------------------- eventos (delegados)
  document.addEventListener('input', function (e) {
    var input = e.target;
    if (!input || !input.matches) return;
    var zona = input.closest('[data-address-autocomplete]');
    if (!zona) return;
    if (input.matches('[data-addr="address"]')) programar(zona);
    if (input.matches('[data-addr="postal_code"]')) alEscribirCp(zona, input);
  });

  document.addEventListener('click', function (e) {
    var pick = e.target.closest ? e.target.closest('[data-addr-pick]') : null;
    if (pick) {
      e.preventDefault();
      var caja = pick.closest('[data-addr-list]');
      var zona = pick.closest('[data-address-autocomplete]');
      var filas = (caja && caja._filas) || [];
      elegir(zona, filas[parseInt(pick.getAttribute('data-addr-pick'), 10)]);
      return;
    }
    // Un clic fuera cierra la lista.
    document.querySelectorAll('[data-address-autocomplete]').forEach(function (zona) {
      if (!zona.contains(e.target)) cerrar(zona);
    });
  });

  // Escape cierra; las flechas y el Enter no envían el formulario por error.
  document.addEventListener('keydown', function (e) {
    var zona = e.target.closest ? e.target.closest('[data-address-autocomplete]') : null;
    if (!zona) return;
    if (e.key === 'Escape') { cerrar(zona); return; }
    var caja = zona.querySelector('[data-addr-list]');
    var abierta = caja && !caja.classList.contains('d-none');
    if (!abierta) return;
    var items = Array.prototype.slice.call(caja.querySelectorAll('[data-addr-pick]'));
    if (!items.length) return;
    var actual = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[Math.min(actual + 1, items.length - 1)].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (actual <= 0) { (campos(zona).calle || items[0]).focus(); } else { items[actual - 1].focus(); }
    } else if (e.key === 'Enter' && actual >= 0) {
      e.preventDefault();
      items[actual].click();
    }
  });
})();
