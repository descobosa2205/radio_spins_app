/* ============================================================================
 * Contactos de la actividad (Producción / Ticketing / Comunicación).
 *
 * Los contactos se ponen SIN TENER QUE TOCAR EL PROMOTOR: al elegirlo se cargan sus personas (y los
 * datos de contacto de su propia ficha, y los de los terceros VINCULADOS con él) para marcar las que
 * van a la actividad. Se puede buscar a cualquiera en toda la base y reutilizarlo, o crear una
 * persona nueva —y entonces se PREGUNTA si se vincula al promotor—. Sin promotor también se pueden
 * poner contactos: quedan colgados de la actividad.
 *
 * Una persona puede llevar VARIAS funciones y una función puede ser de VARIAS personas.
 *
 * Es GLOBAL y no hace nada si la página no tiene [data-concert-contacts].
 * ========================================================================== */
(function () {
  'use strict';

  function csrf() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pedir(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, opts.headers || {});
    if ((opts.method || 'GET').toUpperCase() !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRFToken'] = csrf();
    }
    return fetch(url, opts).then(function (r) { return r.json().catch(function () { return null; }); });
  }

  function setup(root) {
    if (root.__ccReady) return;
    root.__ccReady = true;

    var roles = [];
    try { roles = JSON.parse(root.getAttribute('data-roles') || '[]'); } catch (e) { roles = []; }
    var elegidos = {};          // { contact_id: {datos de la persona, roles: [] } }
    var yaTenia = {};
    try { yaTenia = JSON.parse(root.getAttribute('data-selected') || '{}') || {}; } catch (e) { yaTenia = {}; }

    var cajaElegidos = root.querySelector('[data-cc-chosen]');
    var cajaDisponibles = root.querySelector('[data-cc-available]');
    var cajaResultados = root.querySelector('[data-cc-results]');
    var cajaInputs = root.querySelector('[data-cc-inputs]');
    var avisoSinPromotor = root.querySelector('[data-cc-nopromoter]');
    var formNueva = root.querySelector('[data-cc-new]');
    var grupos = [];

    // ------------------------------------------------------------------ el promotor
    function inputPromotor() {
      var sel = root.getAttribute('data-promoter-input');
      return sel ? document.querySelector(sel) : null;
    }
    function promotorId() {
      var el = inputPromotor();
      if (el && (el.value || '').trim()) return (el.value || '').trim();
      return (root.getAttribute('data-promoter-id') || '').trim();
    }
    function nombrePromotor() {
      var el = inputPromotor();
      if (el && el.tagName === 'SELECT' && el.selectedIndex >= 0) {
        var t = (el.options[el.selectedIndex].textContent || '').trim();
        if (t && t !== '—') return t;
      }
      var g = (grupos[0] || {}).title || '';
      return g.indexOf('·') >= 0 ? g.split('·').slice(1).join('·').trim() : '';
    }

    // ------------------------------------------------------------------ pintar
    function pintaElegidos() {
      var ids = Object.keys(elegidos);
      if (!ids.length) {
        cajaElegidos.innerHTML = '<div class="cc-empty small text-muted">Todavía no hay nadie. ' +
          'Añádelo de la lista de abajo o crea una persona nueva.</div>';
        pintaInputs();
        return;
      }
      cajaElegidos.innerHTML = ids.map(function (id) {
        var p = elegidos[id];
        var chips = roles.map(function (r) {
          var on = (p.roles || []).indexOf(r[0]) >= 0;
          return '<button type="button" class="cc-role' + (on ? ' is-on' : '') + '"' +
                 ' data-cc-role="' + esc(r[0]) + '" data-cc-for="' + esc(id) + '"' +
                 ' title="' + (on ? 'Quitarle' : 'Ponerle') + ' ' + esc(r[1]) + '">' +
                 '<i class="fa ' + esc(r[2]) + '"></i>' + esc(r[1]) + '</button>';
        }).join('');
        var meta = [];
        if (p.email) meta.push(esc(p.email));
        if (p.phone) meta.push(esc(p.phone));
        if (p.promoter_name) meta.push(esc(p.promoter_name));
        else if (!p.promoter_id) meta.push('sin tercero');
        return '<div class="cc-card" data-cc-chosen-row="' + esc(id) + '">' +
          avatar(p, 'cc-card__avatar') +
          '<div style="min-width:0;flex:1 1 auto;">' +
            '<div class="cc-card__name">' + esc(p.name) + (p.title ? ' <span class="text-muted fw-normal">· ' + esc(p.title) + '</span>' : '') + '</div>' +
            (meta.length ? '<div class="cc-card__meta">' + meta.join(' · ') + '</div>' : '') +
            '<div class="cc-roles-row">' + chips + '</div>' +
          '</div>' +
          '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-2" data-cc-drop="' + esc(id) + '"' +
          ' title="Quitarlo de la actividad"><i class="fa fa-xmark"></i></button>' +
        '</div>';
      }).join('');
      pintaInputs();
    }

    /* LA FOTO de quien se pone de contacto: la de su tercero (una persona de contacto no tiene una
       propia). Sin foto, el muñequito gris de la casa — el hueco se conserva para que las filas
       midan lo mismo. */
    function avatar(p, clase) {
      var src = (p && p.photo) || '';
      var def = document.body.getAttribute('data-default-avatar-url') || '';
      if (!src && !def) return '<span class="' + clase + '"><i class="fa fa-user"></i></span>';
      return '<img class="' + clase + '" src="' + esc(src || def) + '" alt="" data-avatar="1">';
    }

    function tarjetaDisponible(p) {
      var meta = [];
      if (p.title) meta.push(esc(p.title));
      if (p.email) meta.push(esc(p.email));
      if (p.phone) meta.push(esc(p.phone));
      if (p.promoter_name) meta.push(esc(p.promoter_name));
      var datos = ' data-cc-add=\'' + esc(JSON.stringify(p)) + '\'';
      return '<button type="button" class="cc-opt"' + datos + '>' +
        avatar(p, 'cc-opt__avatar') +
        '<span class="cc-opt__body"><span class="cc-opt__name">' + esc(p.name) + '</span>' +
        (meta.length ? '<span class="cc-opt__meta">' + meta.join(' · ') + '</span>' : '') + '</span>' +
        '<i class="fa fa-plus ms-auto text-muted"></i></button>';
    }

    function pintaDisponibles() {
      var html = '';
      (grupos || []).forEach(function (g) {
        var libres = (g.people || []).filter(function (p) {
          return !(p.id && elegidos[p.id]);
        });
        if (!libres.length) return;
        html += '<div class="cc-group"><div class="cc-group__head">' + esc(g.title) + '</div>' +
                libres.map(tarjetaDisponible).join('') + '</div>';
      });
      cajaDisponibles.innerHTML = html || '<div class="cc-empty small text-muted">' +
        (promotorId() ? 'Este promotor no tiene ninguna persona de contacto dada de alta.'
                      : 'Busca a la persona abajo o créala.') + '</div>';
      if (avisoSinPromotor) avisoSinPromotor.classList.toggle('d-none', !!promotorId());
      var w = root.querySelector('[data-cc-link-wrap]');
      if (w) {
        w.classList.toggle('d-none', !promotorId());
        var n = root.querySelector('[data-cc-link-name]');
        if (n) n.textContent = nombrePromotor();
      }
    }

    function pintaInputs() {
      var html = '';
      Object.keys(elegidos).forEach(function (id) {
        html += '<input type="hidden" name="cc_contact_ids[]" value="' + esc(id) + '">';
        (elegidos[id].roles || []).forEach(function (r) {
          html += '<input type="hidden" name="cc_roles_' + esc(id) + '[]" value="' + esc(r) + '">';
        });
      });
      cajaInputs.innerHTML = html;
    }

    // ------------------------------------------------------------------ cargar opciones
    function cargaOpciones(mantener) {
      var url = root.getAttribute('data-options-url');
      var pid = promotorId();
      if (pid) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'promoter_id=' + encodeURIComponent(pid);
      return pedir(url).then(function (d) {
        if (!d || !d.ok) { grupos = []; pintaDisponibles(); return; }
        grupos = d.groups || [];
        if (Array.isArray(d.roles) && d.roles.length) roles = d.roles;
        if (!mantener) {
          // Lo que YA tenía la actividad: se rellena con los datos que traen los grupos.
          var porId = {};
          grupos.forEach(function (g) {
            (g.people || []).forEach(function (p) { if (p.id) porId[p.id] = p; });
          });
          Object.keys(yaTenia).forEach(function (id) {
            var p = porId[id] || { id: id, name: 'Contacto', title: '', email: '', phone: '' };
            elegidos[id] = Object.assign({}, p, { roles: (yaTenia[id] || []).slice() });
          });
        }
        pintaElegidos();
        pintaDisponibles();
      });
    }

    // ------------------------------------------------------------------ acciones
    function anade(p) {
      if (!p) return;
      if (!p.id && p.self_promoter_id) {
        // «El propio X»: hace falta una fila de contacto para poder colgarla de la actividad.
        pedir(root.getAttribute('data-self-url'), {
          method: 'POST', body: JSON.stringify({ promoter_id: p.self_promoter_id })
        }).then(function (d) {
          if (d && d.ok && d.contact) anade(Object.assign({}, d.contact, { title: p.title || d.contact.title }));
          else alert((d && d.error) || 'No se ha podido usar ese contacto.');
        });
        return;
      }
      if (!p.id || elegidos[p.id]) return;
      elegidos[p.id] = Object.assign({}, p, { roles: [] });
      pintaElegidos();
      pintaDisponibles();
    }

    root.addEventListener('click', function (ev) {
      var add = ev.target.closest('[data-cc-add]');
      if (add) {
        ev.preventDefault();
        var p = null;
        try { p = JSON.parse(add.getAttribute('data-cc-add')); } catch (e) { p = null; }
        anade(p);
        return;
      }
      var drop = ev.target.closest('[data-cc-drop]');
      if (drop) {
        ev.preventDefault();
        delete elegidos[drop.getAttribute('data-cc-drop')];
        pintaElegidos();
        pintaDisponibles();
        return;
      }
      var rol = ev.target.closest('[data-cc-role]');
      if (rol) {
        ev.preventDefault();
        var id = rol.getAttribute('data-cc-for');
        var clave = rol.getAttribute('data-cc-role');
        var p = elegidos[id];
        if (!p) return;
        p.roles = p.roles || [];
        var i = p.roles.indexOf(clave);
        if (i >= 0) p.roles.splice(i, 1); else p.roles.push(clave);
        pintaElegidos();
        return;
      }
      if (ev.target.closest('[data-cc-new-open]')) {
        ev.preventDefault();
        formNueva.classList.remove('d-none');
        var n = root.querySelector('[data-cc-new-name]');
        if (n) n.focus();
        return;
      }
      if (ev.target.closest('[data-cc-new-cancel]')) {
        ev.preventDefault();
        cierraNueva();
        return;
      }
      if (ev.target.closest('[data-cc-new-save]')) {
        ev.preventDefault();
        creaNueva(false);
        return;
      }
      var usar = ev.target.closest('[data-cc-usedup]');
      if (usar) {
        ev.preventDefault();
        var d = null;
        try { d = JSON.parse(usar.getAttribute('data-cc-usedup')); } catch (e) { d = null; }
        anade(d);
        cierraNueva();
        return;
      }
      if (ev.target.closest('[data-cc-forcenew]')) {
        ev.preventDefault();
        creaNueva(true);
        return;
      }
    });

    function cierraNueva() {
      formNueva.classList.add('d-none');
      ['[data-cc-new-name]', '[data-cc-new-title]', '[data-cc-new-email]', '[data-cc-new-phone]']
        .forEach(function (sel) { var el = root.querySelector(sel); if (el) el.value = ''; });
      var dups = root.querySelector('[data-cc-dups]');
      if (dups) { dups.innerHTML = ''; dups.classList.add('d-none'); }
      var err = root.querySelector('[data-cc-new-error]');
      if (err) { err.textContent = ''; err.classList.add('d-none'); }
    }

    function creaNueva(forzar) {
      var nombre = (root.querySelector('[data-cc-new-name]') || {}).value || '';
      var cargo = (root.querySelector('[data-cc-new-title]') || {}).value || '';
      var correo = (root.querySelector('[data-cc-new-email]') || {}).value || '';
      var tel = (root.querySelector('[data-cc-new-phone]') || {}).value || '';
      var err = root.querySelector('[data-cc-new-error]');
      var dups = root.querySelector('[data-cc-dups]');
      if (!nombre.trim()) {
        if (err) { err.textContent = 'Indica al menos el nombre.'; err.classList.remove('d-none'); }
        return;
      }
      /* ⚠️ SE PREGUNTA si la persona se queda en la ficha del tercero (SIEMPRE) o solo en esta
         actividad: apuntar a alguien aquí no significa que tenga que quedarse como contacto suyo. */
      var vincular = true;
      var op = root.querySelector('[data-cc-link-mode]:checked');
      if (promotorId() && op) vincular = (op.value === 'ALWAYS');
      pedir(root.getAttribute('data-create-url'), {
        method: 'POST',
        body: JSON.stringify({
          name: nombre, title: cargo, email: correo, phone: tel,
          promoter_id: promotorId(), link_to_promoter: vincular ? 1 : 0,
          force: forzar ? 1 : 0
        })
      }).then(function (d) {
        if (d && d.duplicates && d.duplicates.length) {
          if (dups) {
            dups.innerHTML = '<div class="small mb-1">Puede que ya esté dada de alta:</div>' +
              d.duplicates.map(function (p) {
                var meta = [p.title, p.email, p.phone, p.promoter_name].filter(Boolean).map(esc).join(' · ');
                return '<button type="button" class="cc-opt" data-cc-usedup=\'' + esc(JSON.stringify(p)) + '\'>' +
                  '<i class="fa fa-user-check"></i><span class="cc-opt__body">' +
                  '<span class="cc-opt__name">' + esc(p.name) + '</span>' +
                  (meta ? '<span class="cc-opt__meta">' + meta + '</span>' : '') + '</span></button>';
              }).join('') +
              '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-cc-forcenew>' +
              'No es ninguna: crearla igualmente</button>';
            dups.classList.remove('d-none');
          }
          return;
        }
        if (!d || !d.ok) {
          if (err) { err.textContent = (d && d.error) || 'No se ha podido crear.'; err.classList.remove('d-none'); }
          return;
        }
        anade(d.contact);
        cierraNueva();
      });
    }

    // ------------------------------------------------------------------ buscar
    var espera = null;
    var buscador = root.querySelector('[data-cc-search]');
    if (buscador) {
      buscador.addEventListener('input', function () {
        clearTimeout(espera);
        var q = (buscador.value || '').trim();
        if (q.length < 2) { cajaResultados.innerHTML = ''; return; }
        espera = setTimeout(function () {
          pedir(root.getAttribute('data-search-url') + '?q=' + encodeURIComponent(q)).then(function (d) {
            var libres = ((d && d.results) || []).filter(function (p) { return !elegidos[p.id]; });
            // Los TERCEROS que casan (por cualquier campo): se añaden como «el propio X».
            var terceros = ((d && d.promoters) || []).filter(function (p) {
              return !Object.keys(elegidos).some(function (id) {
                return elegidos[id] && elegidos[id].promoter_id === p.promoter_id;
              });
            });
            var html = '';
            if (libres.length) {
              html += '<div class="cc-group"><div class="cc-group__head">Personas</div>' +
                      libres.map(tarjetaDisponible).join('') + '</div>';
            }
            if (terceros.length) {
              html += '<div class="cc-group"><div class="cc-group__head">Terceros</div>' +
                      terceros.map(tarjetaDisponible).join('') + '</div>';
            }
            cajaResultados.innerHTML = html ||
              '<div class="cc-empty small text-muted">Nadie con ese nombre. Créala con el botón de abajo.</div>';
          });
        }, 300);
      });
    }

    // Al cambiar el PROMOTOR se recargan sus personas (sin perder lo ya elegido).
    var pin = inputPromotor();
    if (pin) {
      pin.addEventListener('change', function () { cargaOpciones(true); });
      if (window.jQuery) {
        try { window.jQuery(pin).on('select2:select select2:clear', function () { cargaOpciones(true); }); }
        catch (e) {}
      }
    }

    /* API por bloque: poner de golpe las personas YA ELEGIDAS ({id: [funciones]}). La usa el
       precumplimentado del asistente cuando la actividad viene de una PETICIÓN que ya los puso.
       Los datos de cada persona (nombre, foto, correo) se rellenan desde los grupos que devuelve el
       servidor, igual que con los que ya tenía la actividad. */
    root.__ccApi = {
      preselect: function (sel) {
        yaTenia = sel || {};
        elegidos = {};
        return cargaOpciones(false);
      },
    };

    cargaOpciones(false);
  }

  function init() {
    document.querySelectorAll('[data-concert-contacts]').forEach(setup);
  }
  /* Punto único para las pantallas: `app33ConcertContacts.preselect('#idDelBloque', {id:[roles]})`. */
  window.app33ConcertContacts = {
    preselect: function (sel, elegidos) {
      var root = (typeof sel === 'string') ? document.querySelector(sel) : sel;
      if (!root) return;
      if (!root.__ccReady) setup(root);
      if (root.__ccApi) root.__ccApi.preselect(elegidos || {});
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // La ficha reemplaza zonas por AJAX: al repintarse hay que volver a cablear el selector.
  document.addEventListener('inline:updated', init);
  document.addEventListener('ficha:shown', init);
})();

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CONTACTOS POR FUNCIÓN QUE SE GUARDAN AL SELECCIONAR (`data-ac-live`, sep 2026 — lo pidió Dani).

   El módulo de la ficha ya NO tiene botón de editar: en cada función se añade o se quita gente con
   su «+» y su «x», y cada acción se guarda en el acto (POST a la sección `contactos` con
   `cc_action`, por el motor `data-inline` de siempre, que repinta la zona general).

   ⚠️⚠️ TODO POR DELEGACIÓN EN `document`: la zona se reemplaza por AJAX en cada guardado, así que
   un listener pegado a un nodo de dentro moriría en el primer repintado (trampa de la casa).
   ⚠️ El estado lo pinta el SERVIDOR: aquí no se decide nada, solo se manda la acción.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function tarjeta(el) { return el && el.closest ? el.closest('[data-ac-role]') : null; }

  /* Manda una acción y deja que el motor `data-inline` repinte. ⚠️ `requestSubmit` y no `submit()`:
     `form.submit()` NO dispara el evento y el motor no se enteraría (se recargaría la página). */
  function mandar(datos) {
    var form = document.querySelector('[data-ac-live-form]');
    if (!form) return;
    ['cc_action', 'cc_role', 'cc_key', 'cc_kind', 'cc_contact_id', 'cc_promoter_id',
     'cc_name', 'cc_email', 'cc_phone']
      .forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]');
        if (el) el.value = (datos[n] == null ? '' : String(datos[n]));
      });
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function rol(el) {
    var t = tarjeta(el);
    return t ? (t.getAttribute('data-ac-role') || '') : '';
  }

  /* ---- Abrir el buscador de una función ---- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-add]');
    if (!b) return;
    var t = tarjeta(b), caja = t && t.querySelector('[data-ac-picker]');
    if (!caja) return;
    caja.classList.toggle('d-none');
    if (!caja.classList.contains('d-none')) {
      var q = caja.querySelector('[data-ac-q]');
      if (q) { q.value = ''; q.focus(); }
    }
  });

  /* ---- Quitar a alguien ---- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-del]');
    if (!b) return;
    mandar({ cc_action: 'remove', cc_role: rol(b), cc_key: b.getAttribute('data-ac-del') || '' });
  });

  /* ---- El contacto del promotor, y el que se propone ---- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-pick-promoter]');
    if (b) { mandar({ cc_action: 'add', cc_role: rol(b), cc_kind: 'PROMOTER' }); return; }
    var s = ev.target.closest && ev.target.closest('[data-ac-use-suggested]');
    if (!s) return;
    var id = s.getAttribute('data-ac-sug-id') || '';
    mandar({ cc_action: 'add', cc_role: rol(s),
             cc_kind: (id ? '' : (s.getAttribute('data-ac-sug-kind') || 'PROMOTER')),
             cc_promoter_id: id });
  });

  /* ---- Buscar en toda la base ---- */
  var espera = null;
  document.addEventListener('input', function (ev) {
    var q = ev.target.closest && ev.target.closest('[data-ac-q]');
    if (!q) return;
    var t = tarjeta(q), caja = t && t.querySelector('[data-ac-results]');
    if (!caja) return;
    var texto = (q.value || '').trim();
    clearTimeout(espera);
    if (texto.length < 2) { caja.innerHTML = ''; return; }
    espera = setTimeout(function () {
      fetch('/api/contactos/buscar?q=' + encodeURIComponent(texto), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) { caja.innerHTML = ''; return; }
          var filas = (d.results || []).concat(d.promoters || []);
          if (!filas.length) {
            caja.innerHTML = '<div class="small text-muted py-1">Nadie con ese nombre. ' +
              'Puedes crear su ficha con el <i class="fa fa-plus"></i>.</div>';
            return;
          }
          caja.innerHTML = filas.slice(0, 12).map(function (p) {
            var foto = p.photo || '';
            var sub = [p.title || '', p.email || '', p.promoter_name || '']
                        .filter(Boolean).join(' · ');
            return '<button type="button" class="btn btn-sm btn-light w-100 text-start d-flex ' +
              'align-items-center gap-2 mb-1" data-ac-hit ' +
              'data-contact="' + (p.self_promoter_id ? '' : (p.id || '')) + '" ' +
              'data-id="' + (p.self_promoter_id || (p.id ? '' : (p.promoter_id || '')) || '') + '" ' +
              'data-name="' + String(p.name || '').replace(/"/g, '&quot;') + '" ' +
              'data-email="' + String(p.email || '').replace(/"/g, '&quot;') + '" ' +
              'data-phone="' + String(p.phone || '').replace(/"/g, '&quot;') + '">' +
              (foto ? '<img src="' + foto + '" alt="" style="width:26px;height:26px;' +
                      'border-radius:50%;object-fit:cover;flex:0 0 auto">'
                    : '<i class="fa fa-user text-muted"></i>') +
              '<span style="min-width:0"><span class="d-block text-truncate">' +
              String(p.name || '') + '</span>' +
              (sub ? '<span class="d-block small text-muted text-truncate">' + sub + '</span>' : '') +
              '</span></button>';
          }).join('');
        })
        .catch(function () { caja.innerHTML = ''; });
    }, 250);
  });

  /* ---- Elegir uno de los resultados ---- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ac-hit]');
    if (!b) return;
    /* ⚠️ Una PERSONA de una ficha (`data-contact`) no es su empresa (`data-id`): si se manda el id
       del tercero, el contacto que queda guardado es la EMPRESA y no quien se ha elegido. */
    mandar({ cc_action: 'add', cc_role: rol(b),
             cc_contact_id: b.getAttribute('data-contact') || '',
             cc_promoter_id: b.getAttribute('data-id') || '',
             cc_name: b.getAttribute('data-name') || '',
             cc_email: b.getAttribute('data-email') || '',
             cc_phone: b.getAttribute('data-phone') || '' });
  });

  /* ---- Un tercero recién CREADO con el «+»: el alta rápida lo deja en este <select> ---- */
  document.addEventListener('change', function (ev) {
    var sel = ev.target.closest && ev.target.closest('[data-ac-new]');
    if (!sel || !sel.value) return;
    var id = sel.value;
    var nombre = (sel.options[sel.selectedIndex] || {}).textContent || '';
    sel.value = '';
    mandar({ cc_action: 'add', cc_role: rol(sel), cc_promoter_id: id, cc_name: nombre.trim() });
  });
})();
