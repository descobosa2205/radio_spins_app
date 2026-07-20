/* Mapa de butacas del RECINTO (pestaña Ticketing de la ficha) — diseñador + categorías.
 *
 * SECCIONES PARAMÉTRICAS (nunca se guardan coordenadas por butaca):
 *  - arc   : grada CURVA — centro, radio 1ª fila, amplitud (°), orientación (°), filas, pasos.
 *  - grid  : grada RECTA — centro, rotación, filas × columnas.
 *  - box   : PALCO — mini-grada con marco decorativo de palco.
 *  - floor : zona DE PIE — rectángulo con aforo (sin butacas).
 * Cada sección numera sus butacas (inicio, paso 1/pares-impares, sentido), etiqueta las filas
 * (números o LETRAS) y admite RETOQUES por butaca (hueco/apagada, con política de numeración
 * «salta el número» o «renumera») y ESCALERAS INTEGRADAS que parten el sector (corte radial o
 * vertical; los pasillos no consumen números). El icono de la butaca mira SIEMPRE al escenario.
 *
 * ELEMENTOS: escenario (con PROVOCADOR opcional), pasarela, torre mix, torre delay, plataforma
 * PMR, foso de fotógrafos, baños, baños PMR, merchandising, barras, escaleras sueltas,
 * barandillas, SILUETA exterior del recinto y PUERTAS de acceso.
 *
 * CATEGORÍAS (modo «Categorías»): pintar butacas por clic/recuadro (de lejos, el sector entero),
 * contar por arrastre sin asignar, quitar, resumen por categoría y alta de categorías con color
 * propio (se rechazan colores demasiado parecidos). Asignación por butaca en `assignments`
 * (comprimida a RANGOS por fila al guardar).
 *
 * Render en UN solo SVG con pan/zoom (rueda/dos dedos = pan; pellizco o Ctrl/Cmd+rueda = zoom;
 * mano/espacio/botón central = arrastrar la vista) y 3 niveles de detalle (LOD);
 * solo se materializa lo visible. Guardado: POST JSON con bloqueo optimista por `version`.
 */
(function(){
  'use strict';

  var R = Math.PI/180;
  var DEFAULT_CATS = [
    {id:'venta',   name:'Venta general',    color:'#007ca2', kind:'venta'},
    {id:'vip',     name:'VIP',              color:'#f59e0b', kind:'venta'},
    {id:'inv',     name:'Invitaciones',     color:'#e83b4b', kind:'invitaciones'},
    {id:'bloqueo', name:'Bloqueo técnico',  color:'#6b7280', kind:'bloqueo'},
    {id:'reserva', name:'Reserva promotor', color:'#7c3aed', kind:'reserva'}
  ];

  function alphaLabel(n){ // 1→A, 26→Z, 27→AA…
    var s=''; while(n>0){ n-=1; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26); } return s;
  }

  // GEOMETRÍA PURA del layout (sin visor): posición en el MUNDO de cada butaca ("sec|fila|slot"),
  // el bbox del contenido, el centroide de cada sección y el escenario. La usa el ASIGNADOR de
  // invitaciones para colocar sus botones sobre el plano real del recinto. ⚠️ Misma matemática
  // que secRows del visor (grid/box, arc con conteo por radio, points con lx/ly): mantener en
  // sincronía si se toca una de las dos.
  window.VenueMapGeom = function(layout){
    var R2 = Math.PI/180;
    var pos = {}, secs = [], xs = [], ys = [], pitches = [];
    function sepExtra2(s, rowIdx, slot){
      var seps = Array.isArray(s.rowSeps) ? s.rowSeps : [];
      var n = 0;
      seps.forEach(function(x){
        var e = (typeof x === 'number') ? {r:x, a:1, b:1e9} : x;   // pasillos por TRAMOS {r,a,b}
        if(e.r < rowIdx && (slot == null || (slot >= e.a && slot <= e.b))) n++;
      });
      return n * (s.rowGap || 30);
    }
    (layout.sections || []).forEach(function(s){
      if(!s || s.kind === 'floor') return;
      var sxs = [], sys = [];
      function put(key, x, y){ pos[key] = {x:x, y:y}; sxs.push(x); sys.push(y); xs.push(x); ys.push(y); }
      if(s.kind === 'points'){
        var crP = Math.cos((s.rot||0)*R2), srP = Math.sin((s.rot||0)*R2);
        (s.seats || []).forEach(function(t){
          var lx = +t.lx || 0, ly = +t.ly || 0;
          put(s.id + '|' + (parseInt(t.row,10)||1) + '|' + (parseInt(t.slot,10)||1),
              s.x + lx*crP - ly*srP, s.y + lx*srP + ly*crP);
        });
      } else if(s.kind === 'arc'){
        for(var r = 0; r < (s.rows||1); r++){
          var radius = s.r0 + r*s.rowGap, radiusPos = radius + sepExtra2(s, r+1);
          var count = Math.max(2, Math.floor((radius * s.span * R2) / s.pitch));
          for(var i = 0; i < count; i++){
            var t2 = (s.dir - s.span/2 + ((i+.5)/count)*s.span) * R2;
            put(s.id + '|' + (r+1) + '|' + (i+1), s.cx + radiusPos*Math.cos(t2), s.cy + radiusPos*Math.sin(t2));
          }
        }
      } else if(s.kind === 'grid' || s.kind === 'box'){
        var cr = Math.cos((s.rot||0)*R2), sr = Math.sin((s.rot||0)*R2);
        for(var r2 = 0; r2 < (s.rows||1); r2++){
          for(var i2 = 0; i2 < (s.cols||1); i2++){
            var lx2 = (i2-(s.cols-1)/2)*s.pitch;
            var ly2 = (r2-(s.rows-1)/2)*s.rowGap + sepExtra2(s, r2+1, i2+1);
            put(s.id + '|' + (r2+1) + '|' + (i2+1), s.x + lx2*cr - ly2*sr, s.y + lx2*sr + ly2*cr);
          }
        }
      } else { return; }
      if(s.pitch) pitches.push(+s.pitch);
      if(sxs.length){
        var cx0 = 0, cy0 = 0;
        sxs.forEach(function(v){ cx0 += v; }); sys.forEach(function(v){ cy0 += v; });
        secs.push({ id: s.id, name: s.name || '', cx: cx0/sxs.length, cy: cy0/sys.length,
                    minY: Math.min.apply(null, sys) });
      }
    });
    var stage = null;
    (layout.elements || []).forEach(function(el){
      if(el && el.type === 'stage' && !stage){
        stage = { x: el.x, y: el.y, w: el.w || 220, h: el.h || 520, rot: el.rot || 0, label: el.label || 'ESCENARIO' };
        xs.push(el.x - (el.w||220)/2); xs.push(el.x + (el.w||220)/2);
        ys.push(el.y - (el.h||520)/2); ys.push(el.y + (el.h||520)/2);
      }
    });
    if(!xs.length) return null;
    pitches.sort(function(a,b){ return a-b; });
    var pit = pitches.length ? pitches[Math.floor(pitches.length/2)] : 26;
    var minX = Math.min.apply(null, xs) - pit, minY = Math.min.apply(null, ys) - pit;
    return { pos: pos, secs: secs, stage: stage, pitch: pit,
             bbox: { x: minX, y: minY,
                     w: Math.max.apply(null, xs) + pit - minX,
                     h: Math.max.apply(null, ys) + pit - minY } };
  };

  function init(){
    var host = document.querySelector('[data-venue-map]');
    if(!host || host.dataset.vmapBound === '1') return;
    host.dataset.vmapBound = '1';
    var canEdit = host.dataset.canEdit === '1';
    var saveUrl = host.dataset.saveUrl || '';
    var bgUploadUrl = host.dataset.bgUploadUrl || '';
    var importUrl = host.dataset.importUrl || '';

    var payload = {};
    try { payload = JSON.parse(document.getElementById('venueMapData').textContent || '{}'); } catch(e){}
    var mapVersion = parseInt(payload.version || 0, 10) || 0;
    var layout = (payload.layout && typeof payload.layout === 'object') ? payload.layout : {};
    var sections = Array.isArray(layout.sections) ? layout.sections : [];
    var elements = Array.isArray(layout.elements) ? layout.elements : [];
    var cats = (Array.isArray(layout.categories) && layout.categories.length) ? layout.categories : JSON.parse(JSON.stringify(DEFAULT_CATS));
    var catById = {}; cats.forEach(function(c){ catById[c.id]=c; });
    var nextId = parseInt(layout.next || 0, 10) || 0;
    function nid(pfx){ nextId += 1; return pfx + nextId; }
    sections.concat(elements).forEach(function(o){ if(!o.id) o.id = nid(o.kind ? 's' : 'e'); });

    // Asignaciones butaca→categoría: en memoria un mapa "sec|fila|slot" → catId (slot = posición
    // FÍSICA en la fila, estable aunque cambie la numeración); las zonas de pie van enteras.
    var assign = {}, floorCat = {};
    (function(){
      var a = (payload.assignments && typeof payload.assignments === 'object') ? payload.assignments : {};
      Object.keys(a).forEach(function(secId){
        var rowsA = a[secId] || {};
        Object.keys(rowsA).forEach(function(row){
          if(row === '__floor'){ if(typeof rowsA[row] === 'string') floorCat[secId] = rowsA[row]; return; }
          (rowsA[row] || []).forEach(function(rg){
            if(!Array.isArray(rg) || rg.length < 3) return;
            for(var i=rg[0]; i<=rg[1]; i++) assign[secId+'|'+row+'|'+i] = rg[2];
          });
        });
      });
    })();

    /* ================= Estructura del bloque ================= */
    host.innerHTML =
      '<div class="vmap-toolbar">' +
        (canEdit ? '<div class="vmap-seg" role="tablist"><button type="button" class="on" data-vm-mode="design">Diseñar</button><button type="button" data-vm-mode="cats">Categorías</button></div>' : '') +
        '<div class="vmap-stats"><span>Aforo: <b data-vm-total>–</b></span><span class="d-none d-md-inline">Sentado: <b data-vm-seated>–</b></span><span class="d-none d-md-inline">De pie: <b data-vm-standing>–</b></span></div>' +
        '<div class="vmap-zoom">' +
          (canEdit && saveUrl ? '<button type="button" class="btn btn-sm btn-danger" data-vm-save><i class="fa fa-check me-1"></i>Guardar mapa</button>' : '') +
        '</div>' +
      '</div>' +
      // Barra de AÑADIR piezas: en fila sobre el lienzo (iconos directos + grupos desplegables).
      (canEdit ?
      '<div class="vmap-addbar" data-vm-addbar>' +
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="select" title="SELECCIONAR: pincha una butaca y, sin soltar, barre las demás para ir seleccionándolas; pincha un SECTOR y barre otros para seleccionar varios (se mueven y giran a la vez); o arrastra un recuadro por el vacío. Mayús añade/quita; pincha algo ya seleccionado para MOVER todo el conjunto.">⛶<span>Seleccionar</span></button>' +
        '<span class="vmap-addsep"></span>' +
        '<button type="button" class="vmap-addbtn" data-add="grid" title="Grada recta de filas y columnas"><i class="fa fa-table-cells"></i><span>Grada</span></button>' +
        '<button type="button" class="vmap-addbtn" data-add="arc" title="Grada curva (sector de anillo)"><i class="fa fa-circle-notch"></i><span>Curva</span></button>' +
        '<button type="button" class="vmap-addbtn" data-add="draw" title="Actívalo y ARRASTRA en el plano: según arrastras se van añadiendo butacas y filas"><i class="fa fa-pen"></i><span>Dibujar</span></button>' +
        '<button type="button" class="vmap-addbtn" data-add="box" title="Palco"><i class="fa fa-crown"></i><span>Palco</span></button>' +
        '<button type="button" class="vmap-addbtn" data-add="floor" title="Zona de pie con aforo"><i class="fa fa-people-group"></i><span>De pie</span></button>' +
        '<button type="button" class="vmap-addbtn" data-arm-seat title="Actívalo y pincha en el plano para ir poniendo butacas sueltas: junto a otras se ENCAJAN al patrón de su fila (mismo tamaño y orientación)"><i class="fa fa-chair"></i><span>Butaca</span></button>' +
        '<span class="vmap-addsep"></span>' +
        '<div class="vmap-addgroup"><button type="button" class="vmap-addbtn" data-addgroup><i class="fa fa-music"></i><span>Pista <i class="fa fa-caret-down"></i></span></button><div class="vmap-addmenu">' +
          '<button type="button" data-add="stage"><i class="fa fa-square"></i>Escenario</button>' +
          '<button type="button" data-add="catwalk"><i class="fa fa-grip-lines"></i>Pasarela</button>' +
          '<button type="button" data-add="mix"><i class="fa fa-sliders"></i>Torre mix</button>' +
          '<button type="button" data-add="delay"><i class="fa fa-tower-cell"></i>Torre delay</button>' +
          '<button type="button" data-add="pmr"><i class="fa fa-wheelchair"></i>Plataforma PMR</button>' +
          '<button type="button" data-add="pit"><i class="fa fa-camera"></i>Foso fotógrafos</button>' +
        '</div></div>' +
        '<div class="vmap-addgroup"><button type="button" class="vmap-addbtn" data-addgroup><i class="fa fa-store"></i><span>Servicios <i class="fa fa-caret-down"></i></span></button><div class="vmap-addmenu">' +
          '<button type="button" data-add="wc"><i class="fa fa-restroom"></i>Baños</button>' +
          '<button type="button" data-add="wc_pmr"><i class="fa fa-wheelchair"></i>Baños PMR</button>' +
          '<button type="button" data-add="merch"><i class="fa fa-shirt"></i>Merchandising</button>' +
          '<button type="button" data-add="bar"><i class="fa fa-martini-glass"></i>Barra</button>' +
        '</div></div>' +
        '<div class="vmap-addgroup"><button type="button" class="vmap-addbtn" data-addgroup><i class="fa fa-vector-square"></i><span>Recinto <i class="fa fa-caret-down"></i></span></button><div class="vmap-addmenu">' +
          '<button type="button" data-add="outline"><i class="fa fa-vector-square"></i>Silueta del recinto</button>' +
          '<button type="button" data-add="door"><i class="fa fa-door-open"></i>Puerta de acceso</button>' +
          '<button type="button" data-add="stair"><i class="fa fa-stairs"></i>Escalera suelta</button>' +
          '<button type="button" data-add="rail"><i class="fa fa-grip-lines"></i>Barandilla</button>' +
        '</div></div>' +
        '<span class="vmap-addsep"></span>' +
        // RETOQUES arrastrables: se COGEN y se sueltan sobre una butaca (la ocupan), entre dos
        // butacas (se hacen sitio moviéndolas) o en un borde del sector (la grada crece).
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="gap" title="HUECO: arrástralo sobre una butaca (la ocupa), entre dos (se hace sitio) o a un borde (la grada crece)">▢<span>Hueco</span></button>' +
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="off" title="APAGADA: existe pero no se ofrece. Arrástrala igual que el hueco"><i class="fa fa-square"></i><span>Apagada</span></button>' +
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="stair" title="ESCALERA: arrástrala sobre una butaca (ocupa su sitio), entre dos (las separa) o a un lado (la grada crece)"><i class="fa fa-stairs"></i><span>Escalera</span></button>' +
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="rowsep" title="PASILLO horizontal: arrástralo entre dos filas"><i class="fa fa-grip-lines"></i><span>Pasillo</span></button>' +
        '<button type="button" class="vmap-addbtn vmap-addbtn--tool" data-tool="renum" title="NÚMERO: arrástralo a una butaca para cambiar su número">№<span>Número</span></button>' +
        ((importUrl || bgUploadUrl) ? '<span class="vmap-addsep"></span>' : '') +
        (importUrl ? '<button type="button" class="vmap-addbtn" data-vm-import title="Importar bloques de butacas desde un Excel: cada celda con un número es una butaca con ESE número, las celdas en blanco son huecos/pasillos y los textos, títulos y filas (F16…). Se puede repetir para ir AÑADIENDO bloques hasta completar el recinto."><i class="fa fa-file-excel"></i><span>Importar Excel</span></button>' : '') +
        (bgUploadUrl ? '<button type="button" class="vmap-addbtn" data-bg-upload title="Subir una IMAGEN del plano del recinto como fondo-guía: se calca encima (mover/escalar/bloquear desde el panel) y se pueden detectar los asientos automáticamente."><i class="fa fa-image"></i><span>Subir plano</span></button>' : '') +
      '</div>' : '') +
      '<div class="vmap-body">' +
        '<div class="vmap-canvas">' +
        // Controles flotantes arriba a la IZQUIERDA (como en los mapas): zoom +/−, girar el plano
        // para verlo desde otra perspectiva, enderezar, ver todo y (en edición) deshacer.
        '<div class="vmap-ctrls">' +
          '<div class="vmap-ctrl-group">' +
            '<button type="button" data-vm-zin title="Acercar" aria-label="Acercar"><i class="fa fa-plus"></i></button>' +
            '<button type="button" data-vm-zout title="Alejar" aria-label="Alejar"><i class="fa fa-minus"></i></button>' +
          '</div>' +
          '<div class="vmap-ctrl-group">' +
            '<button type="button" data-vm-rotl title="Girar el plano a la izquierda"><i class="fa fa-arrow-rotate-left"></i></button>' +
            '<button type="button" data-vm-rotr title="Girar el plano a la derecha"><i class="fa fa-arrow-rotate-right"></i></button>' +
            '<button type="button" data-vm-rotn title="Enderezar el plano"><i class="fa fa-location-arrow"></i></button>' +
          '</div>' +
          '<div class="vmap-ctrl-group">' +
            '<button type="button" data-vm-fit title="Ver todo el recinto"><i class="fa fa-expand"></i></button>' +
          '</div>' +
          '<div class="vmap-ctrl-group">' +
            '<button type="button" data-vm-hand title="Mano: arrastra para DESPLAZARTE por el plano sin mover ninguna pieza (también manteniendo la barra espaciadora o con el botón central del ratón). La rueda/los dos dedos desplazan; el zoom, con pellizco o Ctrl/Cmd + rueda."><i class="fa fa-hand"></i></button>' +
          '</div>' +
          '<div class="vmap-ctrl-group">' +
            '<button type="button" data-vm-full title="Pantalla completa (usar toda la pantalla para el diseñador)"><i class="fa fa-up-right-and-down-left-from-center"></i></button>' +
          '</div>' +
          (canEdit ? '<div class="vmap-ctrl-group"><button type="button" class="vmap-undo" data-vm-undo title="Deshacer lo último (Ctrl+Z)" disabled><i class="fa fa-rotate-left"></i></button></div>' : '') +
        '</div>' +
        '<svg data-vm-svg xmlns="http://www.w3.org/2000/svg">' +
          '<defs><symbol id="vmSeatIcon" viewBox="0 0 24 18">' +
            '<rect x="4" y="0" width="16" height="9" rx="2.6"/><rect x="0" y="5.5" width="4.6" height="9" rx="2.2"/>' +
            '<rect x="19.4" y="5.5" width="4.6" height="9" rx="2.2"/><rect x="3.4" y="9.2" width="17.2" height="5.2" rx="1.7"/>' +
            '<rect x="4.6" y="15.4" width="2.6" height="2.6" rx=".8"/><rect x="16.8" y="15.4" width="2.6" height="2.6" rx=".8"/>' +
          '</symbol><symbol id="vmPmrIcon" viewBox="0 0 24 24">' +
            '<circle cx="10" cy="3.4" r="2.4"/><path d="M8.6 7h3v5.6h5.2l1.6 6.4-2.3.6-1.3-5H8.6z"/>' +
            '<path d="M9.7 12.2a5.5 5.5 0 1 0 6.6 8.2l-1.9-1.2a3.3 3.3 0 1 1-4.1-5z"/>' +
          '</symbol></defs><g data-vm-world></g></svg>' +
          '<div class="vmap-tip" data-vm-tip></div>' +
          '<div class="vmap-chip" data-vm-chip></div>' +
          '<div class="vmap-selpop" data-vm-selpop>' +
            '<div class="vmap-selpop-head"><b><span data-selpop-n>0</span> butacas</b>' +
            '<button type="button" class="vmap-selpop-x" data-selpop-clear title="Vaciar selección">✕</button></div>' +
            '<div class="vmap-selpop-hint">Arrastra esta tarjeta hasta una categoría (o pincha una) para asignarlas.</div>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary w-100 mt-1" data-selpop-unassign>Quitar su categoría</button>' +
          '</div>' +
          // Popup de selección en DISEÑO (a la derecha, sin tapar lo seleccionado): muestra los
          // PARÁMETROS COMUNES (sector/fila) y escribiendo encima se cambian para TODA la selección;
          // con UNA sola butaca también se edita su nº de asiento. Además, agrupar por contigüidad.
          '<div class="vmap-dpop" data-vm-dpop>' +
            '<div class="vmap-selpop-head"><b><span data-dpop-n>0</span> butacas</b>' +
            '<button type="button" class="vmap-selpop-x" data-dpop-clear title="Vaciar selección">✕</button></div>' +
            '<div class="vmap-selpop-hint" data-dpop-blocks></div>' +
            '<div class="vmap-dpop-row"><label>Sector</label><input type="text" class="form-control form-control-sm" data-dpop-name placeholder="Grada, Palco 3…" title="Escribe para cambiar el sector de TODAS las seleccionadas"></div>' +
            '<div class="vmap-dpop-row"><label>Fila</label><input type="text" class="form-control form-control-sm" data-dpop-row placeholder="1, 2… o A, B…" title="Número O LETRA de fila: la fila de las seleccionadas pasa a llamarse así (el resto de la sección sigue en orden)"></div>' +
            '<div class="vmap-dpop-row"><label>Nº inicial</label><input type="text" inputmode="numeric" class="form-control form-control-sm" data-dpop-numstart placeholder="1" title="Primer número de asiento de LAS FILAS seleccionadas (cada fila puede empezar en un número distinto)"></div>' +
            '<div class="vmap-dpop-row"><label>Sentido</label><select class="form-select form-select-sm" data-dpop-numdir title="Sentido de la numeración de LAS FILAS seleccionadas"><option value="">—</option><option value="ltr">Izq → der</option><option value="rtl">Der → izq</option></select></div>' +
            '<div class="vmap-dpop-row"><label>Números</label><select class="form-select form-select-sm" data-dpop-nummode title="Consecutivos o solo pares/impares, en LAS FILAS seleccionadas"><option value="">—</option><option value="seq">Consecutivos (1,2,3…)</option><option value="odd">Solo impares (1,3,5…)</option><option value="even">Solo pares (2,4,6…)</option></select></div>' +
            '<div class="vmap-dpop-row d-none" data-dpop-seatrow><label>Nº asiento</label><input type="text" class="form-control form-control-sm" data-dpop-seatnum title="Número de ESTA butaca (vacío = volver al automático)"></div>' +
            '<div data-dpop-groupwrap>' +
              '<button type="button" class="btn btn-sm btn-danger w-100 mt-2" data-dpop-auto><i class="fa fa-object-group me-1"></i>Agrupar en bloques</button>' +
              '<div class="vmap-dpop-btns">' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" data-dpop-one title="Todo lo seleccionado en UN solo sector">Un sector</button>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" data-dpop-rowg title="Todo lo seleccionado como UNA fila">En fila</button>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary" data-dpop-box title="Todo lo seleccionado como un palco">Palco</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        (canEdit ? '<div class="vmap-side" data-vm-side></div>' : '') +
      '</div>' +
      '<div class="vmap-hint text-muted small mt-2" data-vm-hint></div>';

    var svg = host.querySelector('[data-vm-svg]');
    var world = host.querySelector('[data-vm-world]');
    var side = host.querySelector('[data-vm-side]');
    var tip = host.querySelector('[data-vm-tip]');
    var chip = host.querySelector('[data-vm-chip]');

    /* ================= Estado ================= */
    var view = {x:-1700, y:-1500, w:3400, h:3000, rot:0, px:0, py:0};   // rot=giro (grados); px/py=pivote del giro (centro del contenido)
    var mode = 'design';         // design | cats
    var drawArm = false;         // «Dibujar grada» armado: el siguiente arrastre en el plano la crea
    var seatArm = false;         // «Butaca suelta» armado: cada clic en vacío añade una butaca suelta
    var lastSeatAdd = null;      // última butaca añadida {secId,row,slot}: encadena las siguientes (fila + orientación)
    var dsel = {};               // butacas SELECCIONADAS en diseño (mover/orientar/agrupar en bloque) → "sec|fila|slot"
    var dselO = {};              // ELEMENTOS/sectores seleccionados en diseño (mover/eliminar en bloque) → id
    var detectArm = false;       // «Detectar asientos» armado: el siguiente clic elige el asiento de muestra
    var detectTol = 60;          // sensibilidad de color de la detección (0-140, distancia RGB)
    var lastSample = null;       // {x,y} en el mundo del último asiento de muestra (para «Volver a detectar»)
    var bgPixCache = {};         // url del plano → píxeles cacheados para no releer la imagen
    var tool = null;             // diseño: gap | off | stair | rowsep | renum — null = seleccionar/mover
    var catTool = 'select';      // categorías: select | paint | count | erase
    var sel = {};                // SELECCIÓN de butacas (keys) — popup flotante con el total
    var activeCat = cats.length ? cats[0].id : null;
    var selId = null;
    var raf = null;
    var geomCache = {};          // secciones: filas+bbox derivadas (se invalida al editar)
    function invalidate(id){ if(id) delete geomCache[id]; else geomCache = {}; }

    /* ================= Deshacer (pila de estados) =================
       Antes de CADA cambio (añadir/mover/borrar secciones o elementos, retoques por butaca,
       sliders, pintado de categorías…) se guarda una foto del estado. El botón ↶ de la esquina
       del plano (o Ctrl+Z) restaura la última. Los gestos continuos (slider, arrastre, barrido)
       se agrupan en UNA sola entrada por etiqueta+ventana de tiempo. */
    var undoStack = [];
    var undoLast = {label: '', at: 0};
    function undoBtn(){ return host.querySelector('[data-vm-undo]'); }
    function pushUndo(label){
      if(!canEdit) return;
      var now = Date.now();
      if(label && label === undoLast.label && (now - undoLast.at) < 900){ undoLast.at = now; return; }
      undoLast = {label: label || '', at: now};
      undoStack.push(JSON.stringify({sections: sections, elements: elements, cats: cats,
                                     assign: assign, floorCat: floorCat, next: nextId}));
      if(undoStack.length > 40) undoStack.shift();
      var b = undoBtn(); if(b) b.disabled = false;
    }
    function undo(){
      if(!undoStack.length) return;
      var snap = JSON.parse(undoStack.pop());
      sections = snap.sections || []; elements = snap.elements || [];
      cats = snap.cats || []; catById = {}; cats.forEach(function(c){ catById[c.id]=c; });
      assign = snap.assign || {}; floorCat = snap.floorCat || {}; nextId = snap.next || nextId;
      if(activeCat && !catById[activeCat]) activeCat = cats.length ? cats[0].id : null;
      undoLast = {label: '', at: 0};
      selId = null; sel = {};
      invalidate();
      var b = undoBtn(); if(b) b.disabled = !undoStack.length;
      renderSide(); markSummary(); updateSelPop();
    }

    function px(){ return (svg.clientWidth || 1) / view.w; }
    function esc(t){ return String(t==null?'':t).replace(/[<>&"]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }
    // Punto en coords del viewBox SIN girar (para el zoom, que trabaja sobre el viewBox).
    function client2raw(cx,cy){
      var r = svg.getBoundingClientRect();
      return { x: view.x + (cx-r.left)/r.width*view.w, y: view.y + (cy-r.top)/r.height*view.h };
    }
    // Punto en coords del MUNDO (deshace el giro del plano): lo usan colocar/mover/lazo/snap.
    function client2world(cx,cy){
      var p = client2raw(cx,cy);
      if(!view.rot) return p;
      var a = -view.rot*R, ca=Math.cos(a), sa=Math.sin(a), dx=p.x-view.px, dy=p.y-view.py;
      return { x: view.px + dx*ca - dy*sa, y: view.py + dx*sa + dy*ca };
    }
    function stageCenter(){
      var st = elements.find(function(el){ return el.type==='stage'; });
      return st ? {x:st.x, y:st.y} : null;
    }

    /* ================= Geometría derivada ================= */
    function numOf(s){
      var n = s.num || {};
      var st = parseInt(n.start,10); if(isNaN(st)) st = 1;   // 0 es válido (hay recintos que numeran desde 0)
      // Modo de numeración explícito: CONSECUTIVOS (1,2,3…), IMPARES (1,3,5…) o PARES (2,4,6…).
      // Compat con mapas guardados solo con step: 2 → impares o pares según la primera butaca.
      var mode = n.mode || ((parseInt(n.step||1,10)===2) ? ((st%2===0)?'even':'odd') : 'seq');
      var step = 1;
      if(mode==='odd'){ step=2; if(st%2===0) st+=1; }
      else if(mode==='even'){ step=2; if(st%2!==0) st+=1; }
      return { start: st, step: step, mode: mode, dir: (n.dir==='rtl'?'rtl':'ltr') };
    }
    function numOfRow(s, rowIdx){
      // Numeración POR FILA: cada fila puede empezar en un número distinto y con su propio patrón
      // (pares/impares, sentido) — hay planos donde una fila empieza en un número y la de atrás en
      // otro. s.rowNums["<fila>"] pisa el ajuste general de la sección (s.num) campo a campo.
      var ov = (s.rowNums || {})[String(rowIdx)];
      if(!ov) return numOf(s);
      var base = s.num || {};
      return numOf({ num: {
        start: (ov.start!=null && ov.start!=='' ? ov.start : base.start),
        mode:  (ov.mode || base.mode),
        dir:   (ov.dir  || base.dir),
        step:  base.step
      } });
    }
    function rowLabelOf(s, rowIdx){
      // «Primera fila» configurable: rowStart 3 → las filas se etiquetan 3,4,5… (o C,D,E… por
      // letras). El 0 es un valor VÁLIDO (hay recintos con fila 0), no «ausente».
      // rowDir 'desc': las etiquetas DESCIENDEN con el índice interno (la fila rowStart es la de
      // ABAJO del dibujo) — para calcar planos donde la fila 1 está delante sin espejar la grada.
      // Paridad con seat_lookup de seatmap_calc.py.
      var st = parseInt(s.rowStart,10); if(isNaN(st)) st = 1;
      var idx = (s.rowDir==='desc') ? ((parseInt(s.rows,10)||1) - rowIdx + 1) : rowIdx;
      var n = st - 1 + idx;
      return (s.rowScheme==='alpha') ? alphaLabel(n) : String(n);
    }
    function modsOf(s, rowIdx){
      var m = (s.mods || {})[String(rowIdx)] || {};
      return { gaps: m.gaps || [], off: m.off || [], stairs: m.stairs || [] };
    }

    // PASILLOS entre filas: desplazan la POSICIÓN de las filas siguientes (hueco físico) sin
    // tocar conteos ni numeración (así seatmap_calc sigue en paridad exacta con el JS).
    // Cada entrada de s.rowSeps puede ser un NÚMERO (pasillo a todo lo ancho, formato antiguo)
    // o {r, a, b} = pasillo tras la fila r SOLO en los asientos a..b (por TRAMOS, como las
    // escaleras): el hueco existe únicamente donde está el pasillo y el resto sigue unido —
    // necesario para calcar recintos reales con vomitorios parciales.
    function sepEntries(s){
      var seps = Array.isArray(s.rowSeps) ? s.rowSeps : [];
      return seps.map(function(e){ return (typeof e === 'number') ? {r:e, a:1, b:1e9} : e; });
    }
    function sepExtra(s, rowIdx, slot){
      var n = 0;
      sepEntries(s).forEach(function(e){ if(e.r < rowIdx && (slot == null || (slot >= e.a && slot <= e.b))) n++; });
      return n * s.rowGap;
    }
    function totalSep(s){
      var rSeen = {};
      sepEntries(s).forEach(function(e){ rSeen[e.r] = 1; });
      return Object.keys(rSeen).length * s.rowGap;
    }

    // Filas de una sección con todo aplicado: escaleras integradas (cortes), huecos/apagadas por
    // butaca, pasillos entre filas, numeración (inicio/modo/sentido + política de hueco, con
    // OVERRIDES por butaca) y orientación hacia el escenario.
    // Asientos DETECTADOS de un plano (kind 'points'): coordenadas propias por butaca (no
    // paramétricas). Devuelve la MISMA estructura que secRows para reusar render/selección/
    // categorías/numeración. seats = [{row, slot, lx, ly}] (locales al centro de la sección).
    function secRowsPoints(s){
      var nm = numOf(s), crP = Math.cos((s.rot||0)*R), srP = Math.sin((s.rot||0)*R);
      var byRow = {}; (s.seats||[]).forEach(function(t){ var r=parseInt(t.row,10)||1; (byRow[r]=byRow[r]||[]).push(t); });
      var rowIdxs = Object.keys(byRow).map(Number).sort(function(a,b){ return a-b; });
      var rows=[], xs=[], ys=[], nSeats=0, valid={}, overrides=s.numOverrides||{};
      rowIdxs.forEach(function(ri){
        var arr = byRow[ri].slice().sort(function(a,b){ return (a.slot||0)-(b.slot||0); });
        var mods = modsOf(s, ri);
        var slots = arr.map(function(t){
          var lx=+t.lx||0, ly=+t.ly||0, slot=parseInt(t.slot,10)||1;
          var perStair = mods.stairs.indexOf(slot)!==-1;
          var state = (perStair?'stair':(mods.gaps.indexOf(slot)!==-1?'gap':(mods.off.indexOf(slot)!==-1?'off':'seat')));
          // Ángulo por butaca (butacas sueltas orientables): s.rot + el giro propio de la butaca.
          return { slot:slot, frac:0, x:s.x+lx*crP-ly*srP, y:s.y+lx*srP+ly*crP, a:(s.rot||0)+(parseFloat(t.a)||0), state:state, perStair:perStair };
        });
        var nmR = numOfRow(s, ri);   // numeración propia de ESTA fila (o la general si no tiene)
        var ordered = (nmR.dir==='rtl') ? slots.slice().reverse() : slots, counter=nmR.start;
        ordered.forEach(function(sl){
          if(sl.state==='gap'){ sl.n=null; if((s.gapPolicy||'skip')==='skip') counter+=nmR.step; return; }
          sl.n=counter; counter+=nmR.step;
        });
        slots.forEach(function(sl){ var ov=overrides[ri+'|'+sl.slot]; if(ov!=null&&ov!==''&&sl.state!=='gap') sl.n=ov; });
        slots.forEach(function(p){ xs.push(p.x); ys.push(p.y); if(p.state==='seat'){ nSeats++; valid[ri+'|'+p.slot]=1; } });
        rows.push({ rowIdx:ri, label:rowLabelOf(s,ri), seats:slots });
      });
      var pit=s.pitch||26;
      var bbox = xs.length
        ? {x:Math.min.apply(null,xs)-pit, y:Math.min.apply(null,ys)-pit, w:Math.max.apply(null,xs)-Math.min.apply(null,xs)+2*pit, h:Math.max.apply(null,ys)-Math.min.apply(null,ys)+2*pit}
        : {x:s.x-pit, y:s.y-pit, w:2*pit, h:2*pit};
      return {rows:rows, bbox:bbox, count:nSeats, valid:valid};
    }
    function secRows(s){
      if(geomCache[s.id]) return geomCache[s.id];
      if(s.kind==='points') return (geomCache[s.id]=secRowsPoints(s));
      var st = stageCenter();
      var nm = numOf(s), rows = [], r, i;
      var isArc = s.kind==='arc';
      var stairs = Array.isArray(s.stairs) ? s.stairs : [];
      var flip = false;
      if(isArc){
        // Mirar «adentro» (al centro del arco) salvo que el escenario quede DETRÁS de la grada:
        // se compara la mirada-adentro en el punto medio del sector con la dirección al escenario
        // (la distancia radial fallaba en herraduras amplias con escenario en el extremo abierto).
        if(st){
          var midA = s.dir*R, rMid = s.r0 + (s.rows-1)*s.rowGap/2;
          var mx = s.cx + rMid*Math.cos(midA), my = s.cy + rMid*Math.sin(midA);
          flip = ((-Math.cos(midA))*(st.x-mx) + (-Math.sin(midA))*(st.y-my)) < 0;
        }
      } else if(s.kind==='grid' || s.kind==='box'){
        // Mirada base = perpendicular a las filas (y+ local); girar 180° si el escenario queda al otro lado.
        if(st){
          var lookX = -Math.sin(s.rot*R), lookY = Math.cos(s.rot*R);
          flip = (lookX*(st.x-s.x) + lookY*(st.y-s.y)) < 0;
        }
      }
      for(r=0;r<s.rows;r++){
        var rowIdx = r+1, mods = modsOf(s, rowIdx), slots = [];
        if(isArc){
          var radius = s.r0 + r*s.rowGap;                       // radio BASE: define el nº de butacas
          var radiusPos = radius + sepExtra(s, rowIdx);         // radio VISUAL: desplazado por pasillos
          var count = Math.max(2, Math.floor((radius * s.span * R) / s.pitch));
          for(i=0;i<count;i++){
            var frac = (i+.5)/count;
            var t = (s.dir - s.span/2 + frac*s.span) * R;
            var inStair = stairs.some(function(b){ return Math.abs(frac - b.at) * s.span * R * radius < (b.w*s.pitch)/2 + s.pitch*.5; });
            slots.push({ slot:i+1, frac:frac, x:s.cx + radiusPos*Math.cos(t), y:s.cy + radiusPos*Math.sin(t),
                         a: t/R + (flip? -90 : 90), inStair:inStair });
          }
        } else {
          var cr = Math.cos(s.rot*R), sr = Math.sin(s.rot*R), width = s.cols*s.pitch;
          for(i=0;i<s.cols;i++){
            var lx = (i-(s.cols-1)/2)*s.pitch, ly = (r-(s.rows-1)/2)*s.rowGap + sepExtra(s, rowIdx, i+1);
            var frac2 = (i+.5)/s.cols;
            var inStair2 = stairs.some(function(b){ return Math.abs(lx - (b.at-.5)*width) < (b.w*s.pitch)/2 + s.pitch*.5; });
            slots.push({ slot:i+1, frac:frac2, x:s.x + lx*cr - ly*sr, y:s.y + lx*sr + ly*cr,
                         a: s.rot + (flip?180:0), inStair:inStair2 });
          }
        }
        // Estado por butaca + numeración. Los pasillos de escalera NO consumen número; los huecos
        // según la política de la sección («salta» = 1,2,_,4 · «renumera» = 1,2,_,3); las apagadas
        // conservan su número (existen pero no se ofrecen).
        slots.forEach(function(sl){
          sl.perStair = mods.stairs.indexOf(sl.slot)!==-1;
          sl.state = (sl.inStair || sl.perStair) ? 'stair' : (mods.gaps.indexOf(sl.slot)!==-1 ? 'gap' : (mods.off.indexOf(sl.slot)!==-1 ? 'off' : 'seat'));
        });
        var nmR = numOfRow(s, rowIdx);   // numeración propia de ESTA fila (o la general si no tiene)
        var ordered = (nmR.dir==='rtl') ? slots.slice().reverse() : slots;
        var counter = nmR.start;
        var overrides = s.numOverrides || {};
        ordered.forEach(function(sl){
          if(sl.state==='stair'){ sl.n=null; return; }
          if(sl.state==='gap'){ sl.n=null; if((s.gapPolicy||'skip')==='skip') counter += nmR.step; return; }
          sl.n = counter; counter += nmR.step;
        });
        // Números CAMBIADOS a mano por butaca (herramienta №): sustituyen al calculado.
        slots.forEach(function(sl){
          var ov = overrides[rowIdx+'|'+sl.slot];
          if(ov!=null && ov!=='' && sl.state!=='stair' && sl.state!=='gap') sl.n = ov;
        });
        rows.push({ rowIdx: rowIdx, label: rowLabelOf(s, rowIdx), seats: slots });
      }
      // bbox + aforo + índice de butacas VÁLIDAS ("fila|slot" con estado seat), todo cacheado:
      // así contar y depurar asignaciones huérfanas no vuelve a recorrer la geometría.
      var xs=[], ys=[], nSeats=0, valid={};
      rows.forEach(function(row){ row.seats.forEach(function(p){
        xs.push(p.x); ys.push(p.y);
        if(p.state==='seat'){ nSeats++; valid[row.rowIdx+'|'+p.slot]=1; }
      }); });
      var bbox = xs.length
        ? {x:Math.min.apply(null,xs)-s.pitch, y:Math.min.apply(null,ys)-s.pitch,
           w:Math.max.apply(null,xs)-Math.min.apply(null,xs)+2*s.pitch, h:Math.max.apply(null,ys)-Math.min.apply(null,ys)+2*s.pitch}
        : {x:0,y:0,w:0,h:0};
      var out = {rows: rows, bbox: bbox, count: nSeats, valid: valid};
      geomCache[s.id] = out;
      return out;
    }
    function bboxOf(s){
      if(s.kind==='floor') return {x:s.x-s.w/2, y:s.y-s.h/2, w:s.w, h:s.h};
      return secRows(s).bbox;
    }
    function seatCount(s){ return s.kind==='floor' ? 0 : secRows(s).count; }
    // Paso (tamaño de butaca) PREDOMINANTE del plano: mediana de las secciones con butacas. Las
    // butacas y elementos NUEVOS se crean a esta escala para mantener la PROPORCIÓN con lo
    // generado desde el plano de fondo (si aún no hay nada, el 26 de siempre).
    function prevailingPitch(){
      var ps = sections.filter(function(s){ return s.kind!=='floor' && s.pitch; })
                       .map(function(s){ return +s.pitch; })
                       .sort(function(a,b){ return a-b; });
      if(ps.length) return ps[Math.floor(ps.length/2)];
      // Sin butacas aún pero con PLANO de fondo: butaca pequeña acorde al tamaño del plano, para
      // ir colocándolas SOBRE la guía y que casen con su dibujo (luego se afina con «Tamaño butaca»
      // y el zoom); sin plano, el 26 de siempre.
      var bg=elements.find(function(x){ return x.type==='bgimage' && x.url; });
      if(bg) return Math.max(9, Math.min(26, Math.round(Math.min(bg.w||0, bg.h||0)/70) || 26));
      return 26;
    }
    function arcBandPath(s){
      var a0=(s.dir-s.span/2)*R, a1=(s.dir+s.span/2)*R, rIn=s.r0-s.pitch*.7, rOut=s.r0+(s.rows-1)*s.rowGap+totalSep(s)+s.pitch*.7;
      var la = s.span>180?1:0;
      function pt(rr,aa){ return (s.cx+rr*Math.cos(aa))+' '+(s.cy+rr*Math.sin(aa)); }
      return 'M'+pt(rOut,a0)+' A'+rOut+' '+rOut+' 0 '+la+' 1 '+pt(rOut,a1)+
             ' L'+pt(rIn,a1)+' A'+rIn+' '+rIn+' 0 '+la+' 0 '+pt(rIn,a0)+' Z';
    }
    function gridOutline(s){
      var hw=(s.cols-1)/2*s.pitch+s.pitch*.7, hh=(s.rows-1)/2*s.rowGap+s.rowGap*.6;
      return {x:-hw, y:-hh, w:2*hw, h:2*hh+totalSep(s)};   // los pasillos alargan el sector hacia atrás
    }
    // Franjas de los PASILLOS entre filas (para verlos y poder quitarlos pinchándolos: en
    // gradas rectas se quita SOLO el tramo pinchado). Un tramo puede quedar a dos alturas si
    // otro pasillo de más arriba cubre parte de su ancho: se dibuja por sub-tramos uniformes.
    function rowSepSvg(s, scale){
      var seps = Array.isArray(s.rowSeps) ? s.rowSeps : [];
      if(!seps.length) return '';
      var out=[];
      var sepHit = (mode==='design' && canEdit && (!tool || tool==='rowsep'));
      seps.forEach(function(sepRaw, idx){
        var css='fill:rgba(120,132,146,.10);stroke:#9aa8b5;stroke-width:'+(1.4/scale)+';stroke-dasharray:'+(6/scale)+' '+(4/scale)+(sepHit?'':';pointer-events:none');
        if(s.kind==='arc'){
          var sepRow = (typeof sepRaw==='number') ? sepRaw : sepRaw.r;
          var rIn = s.r0 + sepRow*s.rowGap + sepExtra(s, sepRow) + s.pitch*.5;
          var rOut = rIn + s.rowGap - s.pitch;
          var a0=(s.dir-s.span/2)*R, a1=(s.dir+s.span/2)*R, la=s.span>180?1:0;
          function pt(rr,aa){ return (s.cx+rr*Math.cos(aa))+' '+(s.cy+rr*Math.sin(aa)); }
          out.push('<path data-rowsep="'+s.id+'|'+idx+'" d="M'+pt(rOut,a0)+' A'+rOut+' '+rOut+' 0 '+la+' 1 '+pt(rOut,a1)+' L'+pt(rIn,a1)+' A'+rIn+' '+rIn+' 0 '+la+' 0 '+pt(rIn,a0)+' Z" style="'+css+';cursor:pointer"><title>Pasillo (pincha para quitarlo)</title></path>');
        } else {
          var e = (typeof sepRaw==='number') ? {r:sepRaw, a:1, b:1e9} : sepRaw;
          var aC = Math.max(1, e.a), bC = Math.min(s.cols|0, e.b);
          if(bC < aC) return;
          var run0 = aC, prevOff = sepExtra(s, e.r, aC);
          for(var kSl = aC+1; kSl <= bC+1; kSl++){
            var off = (kSl <= bC) ? sepExtra(s, e.r, kSl) : null;
            if(off !== prevOff){
              var x0 = (run0-1-(s.cols-1)/2)*s.pitch - s.pitch/2;
              var x1 = (kSl-2-(s.cols-1)/2)*s.pitch + s.pitch/2;
              var yIn = (e.r-1-(s.rows-1)/2)*s.rowGap + prevOff + s.pitch*.5;
              out.push('<rect data-rowsep="'+s.id+'|'+idx+'" x="'+x0+'" y="'+yIn+'" width="'+(x1-x0)+'" height="'+(s.rowGap - s.pitch)+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="'+css+';cursor:pointer"><title>Pasillo (pincha en un tramo para quitarlo)</title></rect>');
              run0 = kSl; prevOff = off;
            }
          }
        }
      });
      return out.join('');
    }
    function bboxAny(o){
      if(o.kind) return bboxOf(o);
      var w=o.w||0, h=o.h||0;
      return {x:(o.x||0)-w/2, y:(o.y||0)-h/2, w:w, h:h};
    }
    // IMÁN al arrastrar: el sector/elemento que mueves se «enlaza» a los de al lado — bordes
    // alineados, centros alineados o contacto directo (mi borde contra el suyo) — con una
    // tolerancia en píxeles de PANTALLA (funciona igual desde cualquier zoom). Cada pieza sigue
    // siendo independiente: el imán solo coloca, no agrupa. Y las piezas SE PUEDEN SUPERPONER:
    // si ya estás claramente encima de otra (p. ej. asientos sobre los huecos de otro sector,
    // para que todo cuadre), el imán se apaga con ese objetivo y te deja colocarla libre.
    function overlapArea(a, b){
      var ox = Math.max(0, Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x));
      var oy = Math.max(0, Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y));
      return ox*oy;
    }
    function applySnap(o){
      var tol = 12/px();
      var bb = bboxAny(o);
      if(!bb.w && !bb.h) return;
      var ex=[bb.x, bb.x+bb.w, bb.x+bb.w/2], ey=[bb.y, bb.y+bb.h, bb.y+bb.h/2];
      var bestX=null, bestY=null;
      sections.concat(elements).forEach(function(t){
        if(t===o || t.id===o.id || t.type==='outline') return;
        var tb=bboxAny(t); if(!tb.w && !tb.h) return;
        // Superposición intencionada (>15% del área de la pieza menor): ese objetivo no imanta.
        if(overlapArea(bb, tb) > 0.15*Math.min(bb.w*bb.h||1, tb.w*tb.h||1)) return;
        var cx2=[tb.x, tb.x+tb.w, tb.x+tb.w/2], cy2=[tb.y, tb.y+tb.h, tb.y+tb.h/2];
        ex.forEach(function(a){ cx2.forEach(function(b){ var d=b-a; if(Math.abs(d)<tol && (bestX===null||Math.abs(d)<Math.abs(bestX))) bestX=d; }); });
        ey.forEach(function(a){ cy2.forEach(function(b){ var d=b-a; if(Math.abs(d)<tol && (bestY===null||Math.abs(d)<Math.abs(bestY))) bestY=d; }); });
      });
      var moved=false;
      if(bestX!==null){ if(o.kind==='arc'){ o.cx+=bestX; } else { o.x+=bestX; } moved=true; }
      if(bestY!==null){ if(o.kind==='arc'){ o.cy+=bestY; } else { o.y+=bestY; } moved=true; }
      if(moved && o.kind) invalidate(o.id);
    }
    // Franjas de las escaleras integradas: PURAMENTE estéticas (espacio visual, no capturan clics
    // salvo con su herramienta para quitarlas) y con la MISMA pinta que en el plano de
    // invitaciones: fondo azul suave, bordes laterales discontinuos, PELDAÑOS regulares y el
    // rótulo «ESCALERA» a lo largo.
    function stairBandSvg(s, scale){
      var out=[], bands = Array.isArray(s.stairs)? s.stairs : [];
      var lblSize = s.pitch*.52;
      bands.forEach(function(b, idx){
        var half = (b.w*s.pitch)/2, steps='', sides='', d='', label='';
        var stepEvery = s.pitch*.85;   // peldaños a distancia física constante, como una escalera real
        if(s.kind==='arc'){
          var ang = (s.dir - s.span/2 + b.at*s.span)*R;
          var rIn = s.r0 - s.pitch*.6, rOut = s.r0 + (s.rows-1)*s.rowGap + totalSep(s) + s.pitch*.6;
          function pt(rr, side){ var ha = half/rr; return (s.cx+rr*Math.cos(ang+side*ha))+' '+(s.cy+rr*Math.sin(ang+side*ha)); }
          d = 'M'+pt(rIn,-1)+' L'+pt(rOut,-1)+' L'+pt(rOut,1)+' L'+pt(rIn,1)+' Z';
          sides = '<path d="M'+pt(rIn,-1)+' L'+pt(rOut,-1)+'" style="fill:none;stroke:#007CA2;stroke-width:'+Math.max(1.6/scale, s.pitch*.05)+';stroke-dasharray:'+(s.pitch*.28)+' '+(s.pitch*.2)+'"/>'+
                  '<path d="M'+pt(rIn,1)+' L'+pt(rOut,1)+'" style="fill:none;stroke:#007CA2;stroke-width:'+Math.max(1.6/scale, s.pitch*.05)+';stroke-dasharray:'+(s.pitch*.28)+' '+(s.pitch*.2)+'"/>';
          var nSteps = Math.max(3, Math.round((rOut-rIn)/stepEvery));
          for(var k=1;k<nSteps;k++){ var rr = rIn + (rOut-rIn)*k/nSteps, ha2 = half/rr;
            steps += '<line x1="'+(s.cx+rr*Math.cos(ang-ha2))+'" y1="'+(s.cy+rr*Math.sin(ang-ha2))+'" x2="'+(s.cx+rr*Math.cos(ang+ha2))+'" y2="'+(s.cy+rr*Math.sin(ang+ha2))+'" style="stroke:#007CA2;stroke-width:'+(s.pitch*.1)+';stroke-opacity:.55;stroke-linecap:round"/>'; }
          if((rOut-rIn) > s.pitch*4.5){
            var rMidL = (rIn+rOut)/2, lx = s.cx+rMidL*Math.cos(ang), ly = s.cy+rMidL*Math.sin(ang);
            label = '<text x="'+lx+'" y="'+ly+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(ang/R+90)+' '+lx+' '+ly+')" style="font:800 '+lblSize+'px system-ui;letter-spacing:.18em;fill:#007CA2;fill-opacity:.75">ESCALERA</text>';
          }
        } else {
          var cr = Math.cos(s.rot*R), sr = Math.sin(s.rot*R), width = s.cols*s.pitch;
          var xAt = (b.at-.5)*width, y0 = -(s.rows-1)/2*s.rowGap - s.pitch*.6, y1 = ((s.rows-1)/2)*s.rowGap + totalSep(s) + s.pitch*.6;
          function tp(lx2,ly2){ return (s.x + lx2*cr - ly2*sr)+' '+(s.y + lx2*sr + ly2*cr); }
          d = 'M'+tp(xAt-half,y0)+' L'+tp(xAt-half,y1)+' L'+tp(xAt+half,y1)+' L'+tp(xAt+half,y0)+' Z';
          sides = '<path d="M'+tp(xAt-half,y0)+' L'+tp(xAt-half,y1)+'" style="fill:none;stroke:#007CA2;stroke-width:'+Math.max(1.6/scale, s.pitch*.05)+';stroke-dasharray:'+(s.pitch*.28)+' '+(s.pitch*.2)+'"/>'+
                  '<path d="M'+tp(xAt+half,y0)+' L'+tp(xAt+half,y1)+'" style="fill:none;stroke:#007CA2;stroke-width:'+Math.max(1.6/scale, s.pitch*.05)+';stroke-dasharray:'+(s.pitch*.28)+' '+(s.pitch*.2)+'"/>';
          var nSteps2 = Math.max(3, Math.round((y1-y0)/stepEvery));
          for(var k2=1;k2<nSteps2;k2++){ var yy = y0 + (y1-y0)*k2/nSteps2;
            steps += '<line x1="'+tp(xAt-half,yy).split(' ')[0]+'" y1="'+tp(xAt-half,yy).split(' ')[1]+'" x2="'+tp(xAt+half,yy).split(' ')[0]+'" y2="'+tp(xAt+half,yy).split(' ')[1]+'" style="stroke:#007CA2;stroke-width:'+(s.pitch*.1)+';stroke-opacity:.55;stroke-linecap:round"/>'; }
          if((y1-y0) > s.pitch*4.5){
            var mid = tp(xAt, (y0+y1)/2).split(' ');
            label = '<text x="'+mid[0]+'" y="'+mid[1]+'" text-anchor="middle" dominant-baseline="middle" transform="rotate('+(s.rot+90)+' '+mid[0]+' '+mid[1]+')" style="font:800 '+lblSize+'px system-ui;letter-spacing:.18em;fill:#007CA2;fill-opacity:.75">ESCALERA</text>';
          }
        }
        var stairHit = (mode==='design' && canEdit && tool==='stair');
        out.push('<g data-stairband="'+s.id+'|'+idx+'" style="'+(stairHit?'cursor:pointer':'pointer-events:none')+'"><path d="'+d+'" style="fill:rgba(0,124,162,.07)"/>'+sides+steps+label+'</g>');
      });
      return out.join('');
    }

    /* ================= Render con LOD ================= */
    function catColor(key){ var c=assign[key]; return c && catById[c] ? catById[c].color : null; }

    // Conteo de asignadas por sección y categoría (para las etiquetas del zoom lejano).
    function catCountsBySec(){
      var by = {};
      var secById = {}; sections.forEach(function(s){ secById[s.id]=s; });
      Object.keys(assign).forEach(function(k){
        if(!seatIsValid(secById, k)) return;
        var sid = k.split('|')[0];
        (by[sid] = by[sid] || {})[assign[k]] = (by[sid][assign[k]]||0)+1;
      });
      return by;
    }
    // Butacas seleccionadas en DISEÑO (mover/orientar/agrupar en bloque).
    function dselKeys(){ return Object.keys(dsel).filter(function(k){ return dsel[k]; }); }
    function dselOkeys(){ return Object.keys(dselO).filter(function(k){ return dselO[k]; }); }
    // Selección por RECUADRO: butacas sueltas/detectadas (dsel) + elementos/sectores (dselO) dentro.
    function marqueeSelect(a, b, add){
      var x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x), y0=Math.min(a.y,b.y), y1=Math.max(a.y,b.y);
      if(!add){ dsel={}; dselO={}; }
      sections.forEach(function(s){
        if(s.kind==='points'){
          secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
            if(p.state==='seat' && p.x>=x0 && p.x<=x1 && p.y>=y0 && p.y<=y1) dsel[s.id+'|'+row.rowIdx+'|'+p.slot]=1;
          }); });
        } else if(s.kind==='floor'){
          var bbF=bboxOf(s), fcx=bbF.x+bbF.w/2, fcy=bbF.y+bbF.h/2;
          if(fcx>=x0 && fcx<=x1 && fcy>=y0 && fcy<=y1) dselO[s.id]=1;
        } else {
          // GRADAS: envuelta ENTERA en el recuadro → como objeto (moverla); tocada en PARTE →
          // se seleccionan sus BUTACAS de dentro (para configurar fila/numeración).
          var bb=bboxOf(s);
          if(bb.x>=x0 && bb.y>=y0 && bb.x+bb.w<=x1 && bb.y+bb.h<=y1){ dselO[s.id]=1; }
          else if(!(bb.x>x1 || bb.y>y1 || bb.x+bb.w<x0 || bb.y+bb.h<y0)){
            secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
              if(p.state==='seat' && p.x>=x0 && p.x<=x1 && p.y>=y0 && p.y<=y1) dsel[s.id+'|'+row.rowIdx+'|'+p.slot]=1;
            }); });
          }
        }
      });
      elements.forEach(function(el){ if(el.type==='bgimage') return; if(el.x>=x0 && el.x<=x1 && el.y>=y0 && el.y<=y1) dselO[el.id]=1; });
    }
    // Prepara el arrastre EN CONJUNTO de todo lo seleccionado (objetos + butacas sueltas).
    function startMultiMove(w){
      var snap={seats:{}, objs:{}};
      dselKeys().forEach(function(k){ var pp=k.split('|'), sc=sections.find(function(x){return x.id===pp[0] && x.kind==='points';}); if(sc){ var st=(sc.seats||[]).find(function(t){return (+t.row)===(+pp[1]) && (+t.slot)===(+pp[2]);}); if(st) snap.seats[k]={sec:sc, seat:st, lx:+st.lx||0, ly:+st.ly||0}; } });
      dselOkeys().forEach(function(id){ var o=sections.find(function(x){return x.id===id;})||elements.find(function(x){return x.id===id;}); if(o) snap.objs[id]={o:o, x:(o.kind==='arc'?o.cx:o.x), y:(o.kind==='arc'?o.cy:o.y)}; });
      // GRADAS/BLOQUES FUSIONADOS: si en el conjunto va una pieza del grupo (como objeto o con
      // TODAS sus butacas), las demás piezas del grupo acompañan al movimiento.
      var lgs={};
      Object.keys(snap.objs).forEach(function(id){ var o=snap.objs[id].o; if(o && o.kind && o.linkGroup) lgs[o.linkGroup]=1; });
      var perSecLG={}, seatSecIds={};
      Object.keys(snap.seats).forEach(function(k){ var sc=snap.seats[k].sec; seatSecIds[sc.id]=1; perSecLG[sc.id]=(perSecLG[sc.id]||0)+1; });
      Object.keys(perSecLG).forEach(function(id){ var sc=sections.find(function(x){return x.id===id;}); if(sc && sc.linkGroup && perSecLG[id]>=((sc.seats||[]).length)) lgs[sc.linkGroup]=1; });
      sections.forEach(function(sc){
        if(!sc.linkGroup || !lgs[sc.linkGroup]) return;
        if(snap.objs[sc.id] || seatSecIds[sc.id]) return;
        snap.objs[sc.id]={o:sc, x:(sc.kind==='arc'?sc.cx:sc.x), y:(sc.kind==='arc'?sc.cy:sc.y)};
      });
      drag={kind:'multimove', w0:w, snap:snap};
    }
    // Saca de sus secciones 'points' las butacas seleccionadas y devuelve sus puntos {x,y,a}
    // (mundo, con su ORIENTACIÓN actual: agrupar no cambia ni forma ni giro de las butacas).
    function extractSelectedSeatPoints(){
      var dk=dselKeys(); if(!dk.length) return [];
      var pts=[], bySec={};
      dk.forEach(function(k){ var pp=k.split('|'); (bySec[pp[0]]=bySec[pp[0]]||[]).push({ri:+pp[1], sl:+pp[2]}); });
      Object.keys(bySec).forEach(function(secId){
        var sc=sections.find(function(x){return x.id===secId;}); if(!sc || sc.kind!=='points') return;
        var geo=secRows(sc), want={}; bySec[secId].forEach(function(o){ want[o.ri+'|'+o.sl]=1; });
        geo.rows.forEach(function(row){ row.seats.forEach(function(p){ if(want[row.rowIdx+'|'+p.slot]) pts.push({x:p.x, y:p.y, a:(p.a||0)}); }); });
        sc.seats=(sc.seats||[]).filter(function(t){ return !want[(+t.row)+'|'+(+t.slot)]; });
        if(sc.loose && !sc.seats.length){ sections=sections.filter(function(x){return x.id!==sc.id;}); }
        invalidate(sc.id);
      });
      return pts;
    }
    // Paso (tamaño) de ORIGEN de la selección: el de la primera sección con butacas seleccionadas
    // (agrupar conserva el tamaño; los umbrales de contigüidad también se miden con él).
    function dselPitch(){
      var dk=dselKeys(); if(!dk.length) return prevailingPitch();
      var sc=sections.find(function(x){ return x.id===dk[0].split('|')[0]; });
      return (sc && +sc.pitch) || prevailingPitch();
    }
    // BLOQUES CONTIGUOS: componentes conexas uniendo butacas a menos de maxDist (rejilla + BFS).
    function contiguousClusters(pts, maxDist){
      var cell=maxDist, grid={}, md2=maxDist*maxDist;
      pts.forEach(function(p,i){ var k=Math.floor(p.x/cell)+'_'+Math.floor(p.y/cell); (grid[k]=grid[k]||[]).push(i); });
      var seen=new Array(pts.length), out=[];
      for(var i=0;i<pts.length;i++){
        if(seen[i]) continue;
        var comp=[], q=[i]; seen[i]=1;
        while(q.length){
          var j=q.pop(), p=pts[j]; comp.push(p);
          var gx=Math.floor(p.x/cell), gy=Math.floor(p.y/cell);
          for(var dx=-1;dx<=1;dx++) for(var dy=-1;dy<=1;dy++){
            (grid[(gx+dx)+'_'+(gy+dy)]||[]).forEach(function(t){
              if(seen[t]) return;
              var o=pts[t], ddx=o.x-p.x, ddy=o.y-p.y;
              if(ddx*ddx+ddy*ddy<=md2){ seen[t]=1; q.push(t); }
            });
          }
        }
        out.push(comp);
      }
      return out;
    }
    // Crea una sección 'points' a partir de puntos del mundo (filas por proximidad vertical, como
    // la detección). opts: {name, box, singleRow, rowStart}. (Distinta de buildPointsSection, que
    // es la de la DETECCIÓN y trabaja con el tamaño muestreado.)
    function makePointsSection(pts, opts){
      opts = opts || {};
      var cx=0, cy=0; pts.forEach(function(p){ cx+=p.x; cy+=p.y; }); cx/=pts.length; cy/=pts.length;
      // Agrupar NO cambia tamaño ni forma: las posiciones se conservan tal cual, el paso viene del
      // origen (opts.pitch) y cada butaca mantiene su orientación (p.a) si la tenía.
      var pit=(+opts.pitch)||28, seats=[], maxRow=1;
      if(opts.singleRow){
        pts.slice().sort(function(a,b){ return a.x-b.x; }).forEach(function(p,i){ seats.push({row:1, slot:i+1, lx:Math.round(p.x-cx), ly:Math.round(p.y-cy), a:(p.a||0)}); });
      } else {
        var sorted=pts.slice().sort(function(a,b){ return a.y-b.y; }), thr=pit*1.1, rows=[], cur=null;
        sorted.forEach(function(p){ if(!cur || p.y-cur.y0>thr){ cur={y0:p.y, items:[]}; rows.push(cur); } cur.items.push(p); });
        rows.forEach(function(row, ri){ maxRow=ri+1; row.items.sort(function(a,b){ return a.x-b.x; }).forEach(function(p, si){ seats.push({row:ri+1, slot:si+1, lx:Math.round(p.x-cx), ly:Math.round(p.y-cy), a:(p.a||0)}); }); });
      }
      var sec={id:nid('s'), kind:'points', name:(opts.name||'Sector'),
               x:Math.round(cx), y:Math.round(cy), rot:0, pitch:pit, rows:maxRow, box:!!opts.box,
               num:{start:1, mode:'seq', step:1, dir:'ltr'}, rowScheme:'num',
               rowStart:(parseInt(opts.rowStart,10)||1), gapPolicy:'skip', seats:seats};
      sections.push(sec);
      return sec;
    }
    // Reordena los SLOTS de una fila de una sección 'points' por su ORDEN GEOMÉTRICO a lo largo de
    // la fila: así se pueden añadir butacas «entre medias» y la numeración sigue la fila. Remapea
    // huecos/apagadas (mods), números manuales (numOverrides) y asignaciones de categoría.
    function renumberRowSlots(sec, rowIdx){
      var rowSeats=(sec.seats||[]).filter(function(t){ return (+t.row)===(+rowIdx); });
      if(rowSeats.length<2) return;
      var crC=Math.cos((sec.rot||0)*R), srC=Math.sin((sec.rot||0)*R);
      function wpos(t){ return {x:sec.x+(+t.lx||0)*crC-(+t.ly||0)*srC, y:sec.y+(+t.lx||0)*srC+(+t.ly||0)*crC}; }
      var pts2=rowSeats.map(function(t){ return {t:t, p:wpos(t)}; });
      // Eje de la fila: entre los dos extremos (por x o por y, el que más se extienda — así
      // también valen filas verticales); se ordena por la proyección sobre ese eje.
      var minX=pts2[0], maxX=pts2[0], minY=pts2[0], maxY=pts2[0];
      pts2.forEach(function(o){
        if(o.p.x<minX.p.x) minX=o; if(o.p.x>maxX.p.x) maxX=o;
        if(o.p.y<minY.p.y) minY=o; if(o.p.y>maxY.p.y) maxY=o;
      });
      var horiz=(maxX.p.x-minX.p.x) >= (maxY.p.y-minY.p.y);
      var A0=horiz?minX:minY, B0=horiz?maxX:maxY;
      var ax=B0.p.x-A0.p.x, ay=B0.p.y-A0.p.y, al=Math.hypot(ax,ay)||1; ax/=al; ay/=al;
      pts2.sort(function(A,B){ return (A.p.x*ax+A.p.y*ay) - (B.p.x*ax+B.p.y*ay); });
      var mapOld={}, changed=false;
      pts2.forEach(function(o, i){ mapOld[+o.t.slot]=i+1; if((+o.t.slot)!==i+1) changed=true; });
      if(!changed) return;
      var m=(sec.mods||{})[String(+rowIdx)];
      if(m){
        if(Array.isArray(m.gaps)) m.gaps=m.gaps.map(function(sl){ return mapOld[sl]||sl; });
        if(Array.isArray(m.off)) m.off=m.off.map(function(sl){ return mapOld[sl]||sl; });
        if(Array.isArray(m.stairs)) m.stairs=m.stairs.map(function(sl){ return mapOld[sl]||sl; });
      }
      if(sec.numOverrides){
        var nov={};
        Object.keys(sec.numOverrides).forEach(function(k){
          var pp2=k.split('|');
          if((+pp2[0])===(+rowIdx) && mapOld[+pp2[1]]) nov[pp2[0]+'|'+mapOld[+pp2[1]]]=sec.numOverrides[k];
          else nov[k]=sec.numOverrides[k];
        });
        sec.numOverrides=nov;
      }
      var na={};
      Object.keys(assign).forEach(function(k){
        var pp2=k.split('|');
        if(pp2[0]===sec.id && (+pp2[1])===(+rowIdx) && mapOld[+pp2[2]]) na[pp2[0]+'|'+pp2[1]+'|'+mapOld[+pp2[2]]]=assign[k];
        else na[k]=assign[k];
      });
      assign=na;
      pts2.forEach(function(o, i){ o.t.slot=i+1; });   // aplicar al final (tras leer los antiguos)
      invalidate(sec.id);
    }

    // INSERTAR una COLUMNA en una grada (grid/box): las butacas se hacen sitio (media a cada lado)
    // y la nueva columna queda ocupada por el retoque (hueco/apagada) o por una ESCALERA (banda
    // estrecha). Remapea huecos/apagadas, números manuales, bandas y asignaciones. atSlot=1 =
    // crecer por la IZQUIERDA; atSlot=cols+1 = por la DERECHA; intermedio = entre dos butacas.
    function insertGridColumn(s, atSlot, kind){
      var oldCols = s.cols || 1, p = s.pitch || 26;
      atSlot = Math.max(1, Math.min(oldCols + 1, atSlot));
      var mods = s.mods || {};
      Object.keys(mods).forEach(function(rk){
        var m = mods[rk];
        if(Array.isArray(m.gaps)) m.gaps = m.gaps.map(function(sl){ return sl >= atSlot ? sl + 1 : sl; });
        if(Array.isArray(m.off)) m.off = m.off.map(function(sl){ return sl >= atSlot ? sl + 1 : sl; });
        if(Array.isArray(m.stairs)) m.stairs = m.stairs.map(function(sl){ return sl >= atSlot ? sl + 1 : sl; });
      });
      if(s.numOverrides){
        var nov = {};
        Object.keys(s.numOverrides).forEach(function(k){
          var pp = k.split('|'); var sl = +pp[1];
          nov[pp[0] + '|' + (sl >= atSlot ? sl + 1 : sl)] = s.numOverrides[k];
        });
        s.numOverrides = nov;
      }
      var na = {};
      Object.keys(assign).forEach(function(k){
        var pp = k.split('|');
        if(pp[0] === s.id && pp.length === 3){
          var sl2 = +pp[2];
          na[pp[0] + '|' + pp[1] + '|' + (sl2 >= atSlot ? sl2 + 1 : sl2)] = assign[k];
        } else na[k] = assign[k];
      });
      assign = na;
      (s.stairs || []).forEach(function(b){
        var colPos = b.at * oldCols;
        if(colPos >= atSlot - 1) colPos += 1;
        b.at = colPos / (oldCols + 1);
      });
      if(Array.isArray(s.rowSeps)) s.rowSeps = s.rowSeps.map(function(x){
        if(typeof x === 'number') return x;
        return {r:x.r, a:(x.a >= atSlot ? x.a + 1 : x.a), b:(x.b >= atSlot ? x.b + 1 : x.b)};
      });
      s.cols = oldCols + 1;
      // Mantener quietas las butacas del lado IZQUIERDO (crece hacia la derecha del punto).
      var ax = Math.cos((s.rot || 0) * R), ay = Math.sin((s.rot || 0) * R);
      var kx = (atSlot === 1 ? -1 : 1) * p / 2;
      s.x += ax * kx; s.y += ay * kx;
      s.mods = s.mods || {};
      for(var r = 1; r <= (s.rows || 1); r++){
        var m2 = s.mods[String(r)] = s.mods[String(r)] || { gaps: [], off: [] };
        var lst = (kind === 'stair') ? (m2.stairs = m2.stairs || []) : (kind === 'off' ? (m2.off = m2.off || []) : (m2.gaps = m2.gaps || []));
        lst.push(atSlot);
      }
      invalidate(s.id);
    }
    // QUITAR una COLUMNA/FILA de la grada (inversa de insertar): al eliminar TODAS las butacas de
    // una columna o fila, esa columna/fila desaparece y el sector se AJUSTA (remapeando huecos,
    // apagadas, escaleras por butaca, números manuales, bandas y asignaciones).
    function removeGridColumn(s, atSlot){
      var oldCols = s.cols || 1, p = s.pitch || 26;
      if(oldCols <= 1) return;
      var mods = s.mods || {};
      Object.keys(mods).forEach(function(rk){
        var m = mods[rk];
        ['gaps','off','stairs'].forEach(function(kk){
          if(Array.isArray(m[kk])) m[kk] = m[kk].filter(function(sl){ return sl !== atSlot; }).map(function(sl){ return sl > atSlot ? sl - 1 : sl; });
        });
      });
      if(s.numOverrides){
        var nov = {};
        Object.keys(s.numOverrides).forEach(function(k){
          var pp = k.split('|'); var sl = +pp[1];
          if(sl === atSlot) return;
          nov[pp[0] + '|' + (sl > atSlot ? sl - 1 : sl)] = s.numOverrides[k];
        });
        s.numOverrides = nov;
      }
      var na = {};
      Object.keys(assign).forEach(function(k){
        var pp = k.split('|');
        if(pp[0] === s.id && pp.length === 3){
          var sl2 = +pp[2];
          if(sl2 === atSlot) return;
          na[pp[0] + '|' + pp[1] + '|' + (sl2 > atSlot ? sl2 - 1 : sl2)] = assign[k];
        } else na[k] = assign[k];
      });
      assign = na;
      (s.stairs || []).forEach(function(b){
        var colPos = b.at * oldCols;
        if(colPos > atSlot - 0.5) colPos -= 1;
        b.at = colPos / (oldCols - 1);
      });
      if(Array.isArray(s.rowSeps)) s.rowSeps = s.rowSeps.map(function(x){
        if(typeof x === 'number') return x;
        var a2 = x.a > atSlot ? x.a - 1 : x.a, b2 = x.b >= atSlot ? x.b - 1 : x.b;
        return (b2 < a2) ? null : {r:x.r, a:a2, b:b2};
      }).filter(Boolean);
      s.cols = oldCols - 1;
      var ax = Math.cos((s.rot || 0) * R), ay = Math.sin((s.rot || 0) * R);
      var kx = (atSlot === 1 ? 1 : -1) * p / 2;
      s.x += ax * kx; s.y += ay * kx;
      invalidate(s.id);
    }
    function removeGridRow(s, atRow){
      var oldRows = s.rows || 1, g = s.rowGap || 30;
      if(oldRows <= 1) return;
      function shiftKeyedDel(obj){
        if(!obj) return obj;
        var out = {};
        Object.keys(obj).forEach(function(rk){ var r0 = +rk; if(r0 === atRow) return; out[String(r0 > atRow ? r0 - 1 : r0)] = obj[rk]; });
        return out;
      }
      s.mods = shiftKeyedDel(s.mods);
      s.rowNums = shiftKeyedDel(s.rowNums);
      if(s.numOverrides){
        var nov = {};
        Object.keys(s.numOverrides).forEach(function(k){
          var pp = k.split('|'); var r1 = +pp[0];
          if(r1 === atRow) return;
          nov[(r1 > atRow ? r1 - 1 : r1) + '|' + pp[1]] = s.numOverrides[k];
        });
        s.numOverrides = nov;
      }
      var na = {};
      Object.keys(assign).forEach(function(k){
        var pp = k.split('|');
        if(pp[0] === s.id && pp.length === 3){
          var r2 = +pp[1];
          if(r2 === atRow) return;
          na[pp[0] + '|' + (r2 > atRow ? r2 - 1 : r2) + '|' + pp[2]] = assign[k];
        } else na[k] = assign[k];
      });
      assign = na;
      if(Array.isArray(s.rowSeps)) s.rowSeps = s.rowSeps
        .filter(function(x){ return ((typeof x === 'number') ? x : x.r) !== atRow; })
        .map(function(x){
          if(typeof x === 'number') return x > atRow ? x - 1 : x;
          return x.r > atRow ? {r:x.r - 1, a:x.a, b:x.b} : x;
        });
      s.rows = oldRows - 1;
      var ax = -Math.sin((s.rot || 0) * R), ay = Math.cos((s.rot || 0) * R);
      var ky = (atRow === 1 ? 1 : -1) * g / 2;
      s.x += ax * ky; s.y += ay * ky;
      invalidate(s.id);
    }
    // Tras un BORRADO: si una columna o fila entera quedó en huecos, desaparece (el sector se ajusta).
    function compactGridSection(s){
      if(!s || (s.kind !== 'grid' && s.kind !== 'box')) return;
      var changed = true, guard = 0;
      while(changed && guard++ < 200){
        changed = false;
        var mods = s.mods || {};
        // columna entera de huecos: en TODAS las filas ese slot es gap
        for(var c = 1; c <= (s.cols || 1); c++){
          var full = (s.cols || 1) > 1;
          for(var r = 1; r <= (s.rows || 1) && full; r++){
            var m = mods[String(r)];
            if(!m || !Array.isArray(m.gaps) || m.gaps.indexOf(c) === -1) full = false;
          }
          if(full){ removeGridColumn(s, c); changed = true; break; }
        }
        if(changed) continue;
        // fila entera de huecos
        for(var r2 = 1; r2 <= (s.rows || 1); r2++){
          var m2 = (s.mods || {})[String(r2)];
          if((s.rows || 1) > 1 && m2 && Array.isArray(m2.gaps) && m2.gaps.length >= (s.cols || 1)){
            var allG = true;
            for(var c2 = 1; c2 <= (s.cols || 1); c2++){ if(m2.gaps.indexOf(c2) === -1){ allG = false; break; } }
            if(allG){ removeGridRow(s, r2); changed = true; break; }
          }
        }
      }
    }
    // INSERTAR una FILA de huecos/apagadas arriba (atRow=1) o abajo (atRow=rows+1) de la grada.
    function insertGridRow(s, atRow, kind){
      var oldRows = s.rows || 1, g = s.rowGap || 30;
      atRow = Math.max(1, Math.min(oldRows + 1, atRow));
      function shiftKeyed(obj){
        if(!obj) return obj;
        var out = {};
        Object.keys(obj).forEach(function(rk){ var r0 = +rk; out[String(r0 >= atRow ? r0 + 1 : r0)] = obj[rk]; });
        return out;
      }
      s.mods = shiftKeyed(s.mods);
      s.rowNums = shiftKeyed(s.rowNums);
      if(s.numOverrides){
        var nov = {};
        Object.keys(s.numOverrides).forEach(function(k){
          var pp = k.split('|'); var r1 = +pp[0];
          nov[(r1 >= atRow ? r1 + 1 : r1) + '|' + pp[1]] = s.numOverrides[k];
        });
        s.numOverrides = nov;
      }
      var na = {};
      Object.keys(assign).forEach(function(k){
        var pp = k.split('|');
        if(pp[0] === s.id && pp.length === 3){
          var r2 = +pp[1];
          na[pp[0] + '|' + (r2 >= atRow ? r2 + 1 : r2) + '|' + pp[2]] = assign[k];
        } else na[k] = assign[k];
      });
      assign = na;
      if(Array.isArray(s.rowSeps)) s.rowSeps = s.rowSeps.map(function(x){
        if(typeof x === 'number') return x >= atRow ? x + 1 : x;
        return x.r >= atRow ? {r:x.r + 1, a:x.a, b:x.b} : x;
      });
      s.rows = oldRows + 1;
      var ax = -Math.sin((s.rot || 0) * R), ay = Math.cos((s.rot || 0) * R);
      var ky = (atRow === 1 ? -1 : 1) * g / 2;
      s.x += ax * ky; s.y += ay * ky;
      s.mods = s.mods || {};
      var mR = s.mods[String(atRow)] = { gaps: [], off: [], stairs: [] };
      var list = (kind === 'stair') ? mR.stairs : ((kind === 'off') ? mR.off : mR.gaps);
      for(var i = 1; i <= (s.cols || 1); i++) list.push(i);
      invalidate(s.id);
    }

    // Agrupar las butacas SUELTAS/detectadas seleccionadas: 'row' | 'box' | 'sector' (un solo bloque)
    // o 'auto' (un bloque por cada grupo CONTIGUO). opts: {name, rowStart} desde el popup de selección.
    function groupSelectedSeats(kindArg, opts){
      var dk=dselKeys(); if(!dk.length) return;
      // Solo hay algo que agrupar si la selección tiene butacas SUELTAS ('points'): sin esto, el
      // pushUndo quedaría huérfano (un Ctrl+Z «que no hace nada») con butacas de grada.
      if(!dk.some(function(k){ var sc=sections.find(function(x){return x.id===k.split('|')[0];}); return sc && sc.kind==='points'; })) return;
      pushUndo('group');
      var srcPitch=dselPitch();   // ANTES de extraer (después la selección ya no existe)
      var pts=extractSelectedSeatPoints();
      if(!pts.length){ renderSide(); return; }
      opts = opts || {};
      var made=[];
      if(kindArg==='auto'){
        var base=opts.name||'Sector';
        var clusters=contiguousClusters(pts, srcPitch*1.6);
        clusters.forEach(function(cl, i){
          made.push(makePointsSection(cl, {name:(clusters.length>1 ? base+' '+(i+1) : base), rowStart:opts.rowStart, pitch:srcPitch}));
        });
      } else if(kindArg==='row'){
        made.push(makePointsSection(pts, {name:opts.name||'Fila', singleRow:true, rowStart:opts.rowStart, pitch:srcPitch}));
      } else if(kindArg==='box'){
        made.push(makePointsSection(pts, {name:opts.name||'Palco', box:true, rowStart:opts.rowStart, pitch:srcPitch}));
      } else {
        made.push(makePointsSection(pts, {name:opts.name||'Sector', rowStart:opts.rowStart, pitch:srcPitch}));
      }
      dsel={}; dselO={}; selId=(made.length===1?made[0].id:null);
      invalidate(); markSummary(); renderSide(); queueRender();
    }
    function dselSeatObjs(sec){
      var out=[], geo=secRows(sec);
      geo.rows.forEach(function(row){ row.seats.forEach(function(p){ var k=sec.id+'|'+row.rowIdx+'|'+p.slot; if(dsel[k]) out.push({key:k, row:row.rowIdx, slot:p.slot, x:p.x, y:p.y}); }); });
      return out;
    }
    // Caja conjunta (mundo) de las PIEZAS seleccionadas (dselO): centro y bordes — para el
    // tirador de giro del grupo y para girar todas alrededor del mismo pivote.
    function dselOBounds(){
      var xs=[], ys=[];
      dselOkeys().forEach(function(id){
        var o=sections.find(function(x){return x.id===id;})||elements.find(function(x){return x.id===id;});
        if(!o) return;
        var b = o.kind ? bboxOf(o) : {x:o.x-(o.w||120)/2, y:o.y-(o.h||100)/2, w:(o.w||120), h:(o.h||100)};
        xs.push(b.x, b.x+b.w); ys.push(b.y, b.y+b.h);
      });
      if(!xs.length) return null;
      var mx=Math.min.apply(null,xs), Mx=Math.max.apply(null,xs), my=Math.min.apply(null,ys), My=Math.max.apply(null,ys);
      return {cx:(mx+Mx)/2, cy:(my+My)/2, mx:mx, Mx:Mx, my:my, My:My};
    }
    // Geometría del tirador de GIRO del objeto seleccionado (o de las butacas sueltas seleccionadas).
    function rotHandleGeom(o){
      var scale=px();
      if(o.kind==='points' && dselKeys().length){
        var arr=dselSeatObjs(o); if(!arr.length) return null;
        var cx=0, cy=0; arr.forEach(function(a){ cx+=a.x; cy+=a.y; }); cx/=arr.length; cy/=arr.length;
        var ext=(o.pitch||26); arr.forEach(function(a){ ext=Math.max(ext, Math.hypot(a.x-cx, a.y-cy)); });
        var D=ext+34/scale;
        return {cx:cx, cy:cy, hx:cx, hy:cy-D, target:'SEL'};
      }
      if(o.kind==='arc') return null;   // el arco se orienta con el slider Orientación
      var cx2, cy2, ext2;
      if(o.kind){ var bb=bboxOf(o); cx2=o.x; cy2=o.y; ext2=Math.max(bb.w, bb.h)/2; }
      else { cx2=o.x; cy2=o.y; ext2=Math.max(o.w||60, o.h||60)/2; }
      if(cx2==null||cy2==null) return null;
      var rot=(o.rot||0)*R, D2=ext2+34/scale;
      return {cx:cx2, cy:cy2, hx:cx2+D2*Math.sin(rot), hy:cy2-D2*Math.cos(rot), target:o.id};
    }
    function render(){
      raf = null;
      svg.setAttribute('viewBox', view.x+' '+view.y+' '+view.w+' '+view.h);
      // Giro del plano: pivote = centro del contenido (congelado mientras se arrastra/pellizca para
      // que no derive). El giro se aplica al grupo del mundo; client2world lo deshace.
      if(!drag && !pinch0){ var _cc=contentCenter(); if(_cc){ view.px=_cc.x; view.py=_cc.y; } }
      world.setAttribute('transform', view.rot ? ('rotate('+(view.rot)+' '+view.px+' '+view.py+')') : '');
      var scale = px(), out = [], vx0=view.x, vy0=view.y, vx1=view.x+view.w, vy1=view.y+view.h;
      var labelsA = [];     // etiquetas del zoom lejano: se pintan al FINAL, encima de los bloques
      var lodACounts = null; // conteos por categoría (solo se calculan si hace falta)
      // ¿Sector ENCAJADO dentro de otro (p. ej. en sus huecos)? De lejos no pinta etiqueta para
      // no superponerse al nombre del sector grande (su nombre se ve al acercar).
      function isNested(me, bb){
        var area = bb.w*bb.h; if(!area) return false;
        return sections.some(function(t){
          if(t===me || t.id===me.id || t.kind==='floor') return false;
          var tb = bboxOf(t); if(tb.w*tb.h <= area) return false;
          return overlapArea(bb, tb) >= 0.6*area;
        });
      }
      // Etiqueta «rica» del sector mientras NO se ven las butacas: nombre, nº de asientos y, si
      // conviven varias categorías, el desglose por categoría. Con halo blanco para leerse sobre
      // las filas; los sectores ENCAJADOS en otro no la pintan (su nombre se ve al acercar).
      function pushRichLabel(s, bb){
        if(isNested(s, bb)) return;
        var lcx, lcy, lsz;
        if(s.kind==='arc'){
          var mid=(s.dir)*R, rMid=s.r0+(s.rows-1)*s.rowGap/2;
          lcx = s.cx+rMid*Math.cos(mid); lcy = s.cy+rMid*Math.sin(mid);
          lsz = Math.max(s.pitch*1.1, s.rows*s.rowGap*.16);
        } else {
          var o=gridOutline(s);
          lcx = s.x; lcy = s.y; lsz = Math.max(s.pitch*1.1, o.h*.14);
        }
        var halo = ';paint-order:stroke;stroke:#fff;stroke-width:'+(lsz*.22)+';stroke-linejoin:round';
        if(lodACounts===null) lodACounts = catCountsBySec();
        var lines = ['<text x="'+lcx+'" y="'+lcy+'" text-anchor="middle" dominant-baseline="middle" style="font:700 '+lsz+'px system-ui;fill:#3f4956'+halo+'">'+esc(s.name||'')+'</text>'];
        var byCat = lodACounts[s.id] || {};
        var catIds = Object.keys(byCat).filter(function(c){ return catById[c]; });
        var lineSz = lsz*.68, ly2 = lcy + lsz*1.05;
        lines.push('<text x="'+lcx+'" y="'+ly2+'" text-anchor="middle" style="font:600 '+lineSz+'px system-ui;fill:#5b6673'+halo+'">'+seatCount(s).toLocaleString('es-ES')+' asientos</text>');
        if(catIds.length>1){
          catIds.sort(function(a,b){ return byCat[b]-byCat[a]; }).slice(0,4).forEach(function(cid){
            ly2 += lineSz*1.3;
            lines.push('<circle cx="'+(lcx - lineSz*3.6)+'" cy="'+(ly2-lineSz*.34)+'" r="'+(lineSz*.36)+'" style="fill:'+catById[cid].color+'"/>'+
              '<text x="'+(lcx - lineSz*2.9)+'" y="'+ly2+'" style="font:600 '+lineSz+'px system-ui;fill:#5b6673'+halo+'">'+byCat[cid].toLocaleString('es-ES')+' '+esc(catById[cid].name)+'</text>');
          });
        }
        labelsA.push(lines.join(''));
      }

      // 0) PLANO DE FONDO subido (capa-guía para calcar / autodetectar): detrás de TODO. Cuando no
      //    está bloqueado y estamos diseñando, lleva su rect de selección para moverlo/escalarlo.
      var bgEl = elements.find(function(el){ return el.type==='bgimage' && el.url; });
      if(bgEl){
        var bt = 'translate('+bgEl.x+' '+bgEl.y+') rotate('+(bgEl.rot||0)+')';
        var op = (bgEl.opacity!=null? bgEl.opacity : 0.6);
        out.push('<g transform="'+bt+'" style="pointer-events:none"><image href="'+esc(bgEl.url)+'" x="'+(-bgEl.w/2)+'" y="'+(-bgEl.h/2)+'" width="'+bgEl.w+'" height="'+bgEl.h+'" opacity="'+op+'" preserveAspectRatio="none"/></g>');
        if(mode==='design' && canEdit && !bgEl.locked){
          var bgSel = (bgEl.id===selId)? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : ';stroke:#9aa8b5;stroke-width:'+(1.5/scale)+';stroke-dasharray:'+(7/scale)+' '+(5/scale);
          out.push('<rect data-el="'+bgEl.id+'" x="'+(-bgEl.w/2)+'" y="'+(-bgEl.h/2)+'" width="'+bgEl.w+'" height="'+bgEl.h+'" transform="'+bt+'" style="fill:rgba(0,0,0,0.001);cursor:move'+bgSel+'"/>');
        }
      }

      // 1) SILUETA del recinto (siempre detrás de todo).
      elements.forEach(function(el){
        if(el.type!=='outline') return;
        var sel = (mode==='design' && canEdit && (el.id===selId || dselO[el.id]))? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';
        var rx = (el.corner!=null? el.corner:60)/100 * Math.min(el.w, el.h)/2;
        out.push('<g transform="translate('+el.x+' '+el.y+') rotate('+(el.rot||0)+')">'+
          '<rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="'+rx+'" style="fill:#e7ecf2;stroke:#ccd6e0;stroke-width:'+(2/scale)+';pointer-events:none"/>'+
          '<rect data-el="'+el.id+'" x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="'+rx+'" style="fill:none;stroke:rgba(0,0,0,0.001);stroke-width:'+(16/scale)+';cursor:pointer'+sel+'"/>'+
        '</g>');
      });

      // 2) SECCIONES.
      sections.forEach(function(s){
        var bb = bboxOf(s);
        if(bb.x>vx1||bb.y>vy1||bb.x+bb.w<vx0||bb.y+bb.h<vy0) return;
        var isSel = (mode==='design' && canEdit && (s.id===selId || dselO[s.id]));
        var selCss = isSel? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';

        // Asientos detectados de un plano: cada butaca en su sitio (dots de lejos, butaca+nº de cerca).
        if(s.kind==='points'){
          var geoP=secRows(s), pit=(s.pitch||26), szP=pit*.86, halfP=szP/2, pxP=pit*scale, far=pxP<9.5;
          var showN=pxP>=15, showRL=pxP>=13;
          var gP=['<g data-sec="'+s.id+'" style="cursor:pointer">'];
          var stairCellsP=[];   // escaleras por butaca del bloque: se agrupan en escaleras continuas
          // Marco «dorado» de PALCO para los grupos marcados como palco (agrupados «en palco»).
          if(s.box){ var pb=geoP.bbox; gP.push('<rect x="'+(pb.x-pit*.2)+'" y="'+(pb.y-pit*.2)+'" width="'+(pb.w+pit*.4)+'" height="'+(pb.h+pit*.4)+'" rx="'+(pit*1.1)+'" style="fill:#fbf6ec;stroke:#b08d4a;stroke-width:'+Math.max(2.5, pit*.14)+';pointer-events:none"/>'); }
          // La zona CLICABLE del grupo son SOLO sus butacas: bandas estrechas por fila (como el
          // LOD medio de las gradas), nada de bbox invisible que tape butacas de otros bloques
          // cercanos. El marco punteado de selección es solo visual (no captura clics).
          if(mode==='design' && canEdit){
            if(isSel) gP.push('<rect x="'+geoP.bbox.x+'" y="'+geoP.bbox.y+'" width="'+geoP.bbox.w+'" height="'+geoP.bbox.h+'" rx="'+pit+'" style="fill:none;pointer-events:none'+selCss+'"/>');
            geoP.rows.forEach(function(row){
              if(!row.seats.length) return;
              // Filas de 1 butaca (columnas verticales): trazo de longitud ~0 con remate redondo
              // = disco de agarre bajo la butaca (el grupo sigue teniendo dónde cogerse).
              var dHit = row.seats.length>=2
                ? 'M'+row.seats.map(function(p){ return p.x+' '+p.y; }).join(' L')
                : 'M'+row.seats[0].x+' '+row.seats[0].y+' L'+(row.seats[0].x+0.01)+' '+row.seats[0].y;
              gP.push('<path d="'+dHit+'" style="fill:none;stroke:#fff;stroke-opacity:0.01;stroke-width:'+(pit*1.05)+';stroke-linecap:round"/>');
            });
          }
          geoP.rows.forEach(function(row){
            if(showRL && row.seats[0]){ var f0=row.seats[0], cr4=Math.cos((s.rot||0)*R), sr4=Math.sin((s.rot||0)*R);
              gP.push('<text x="'+(f0.x-1.4*pit*cr4)+'" y="'+(f0.y-1.4*pit*sr4)+'" text-anchor="middle" dominant-baseline="middle" style="font:700 '+(szP*.42)+'px system-ui;fill:#9aa3af">'+esc(row.label)+'</text>'); }
            row.seats.forEach(function(p){
              if(p.x<vx0-szP||p.x>vx1+szP||p.y<vy0-szP||p.y>vy1+szP) return;
              var key=s.id+'|'+row.rowIdx+'|'+p.slot;
              if(p.state==='stair'){
                if(p.perStair) stairCellsP.push({r:row.rowIdx, s:p.slot, x:p.x, y:p.y});
                return;
              }
              if(p.state==='gap'){
                var gapHit=(mode==='design'&&canEdit);   // en diseño, pinchar un hueco lo QUITA
                gP.push('<circle data-seat="'+key+'" data-kind="gap" data-frac="0" cx="'+p.x+'" cy="'+p.y+'" r="'+halfP+'" style="fill:'+(gapHit?'transparent':'none')+';stroke:#d5dbe2;stroke-width:'+(szP*.06)+';stroke-dasharray:'+(szP*.18)+' '+(szP*.14)+';'+(gapHit?'cursor:pointer':'pointer-events:none')+'"/>');
                return;
              }
              var col=catColor(key), isOff=p.state==='off';
              var dseated = (mode==='design' && dsel[key]);   // butaca seleccionada en diseño (mover/orientar en bloque)
              if(far){
                gP.push('<circle data-seat="'+key+'" data-kind="'+p.state+'" data-frac="0" cx="'+p.x+'" cy="'+p.y+'" r="'+(halfP*.82)+'" style="fill:'+(dseated||sel[key]?'#e0a800':(col||(isOff?'#d7dbe2':'#7fae90')))+';cursor:pointer"/>');
              } else {
                var fill=(dseated||sel[key])?'#ffdf7e':(isOff?'#d7dbe2':(col?col+'22':'#effaf2'));
                var stroke=(dseated||sel[key])?'#e0a800':(isOff?'#c3c9d2':(col||'#cfe4d6'));
                var ink=(dseated||sel[key])?'#7a5b00':(isOff?'#7b838f':(col||'#16803a'));
                gP.push('<g data-seat="'+key+'" data-kind="'+p.state+'" data-n="'+(p.n!=null?p.n:'')+'" data-frac="0" transform="translate('+p.x+' '+p.y+') rotate('+p.a+')" style="cursor:pointer">'+
                  '<rect x="'+(-halfP)+'" y="'+(-halfP)+'" width="'+szP+'" height="'+szP+'" rx="'+(szP*.24)+'" style="fill:'+fill+';stroke:'+stroke+';stroke-width:'+(szP*.05)+'"/>'+
                  '<use href="#vmSeatIcon" x="'+(-szP*.30)+'" y="'+(-szP*.34)+'" width="'+(szP*.6)+'" height="'+(szP*.45)+'" style="fill:'+ink+'"/>'+
                  (showN&&p.n!=null?'<text y="'+(szP*.33)+'" text-anchor="middle" style="font:600 '+(szP*.30)+'px system-ui;fill:'+ink+'">'+p.n+'</text>':'')+
                '</g>');
              }
            });
          });
          if(stairCellsP.length){
            var seenP={};
            stairCellsP.forEach(function(c, ci){
              if(seenP[ci]) return;
              var comp=[c]; seenP[ci]=1;
              for(var gg=0; gg<comp.length; gg++){
                stairCellsP.forEach(function(o, oi){
                  if(seenP[oi]) return;
                  if(Math.hypot(o.x-comp[gg].x, o.y-comp[gg].y) <= pit*1.4){ seenP[oi]=1; comp.push(o); }
                });
              }
              var xs3=comp.map(function(u){return u.x;}), ys3=comp.map(function(u){return u.y;});
              var x0=Math.min.apply(null,xs3)-halfP, x1=Math.max.apply(null,xs3)+halfP;
              var y0=Math.min.apply(null,ys3)-halfP, y1=Math.max.apply(null,ys3)+halfP;
              var keys=comp.map(function(u){return s.id+'|'+u.r+'|'+u.s;}).join(',');
              var steps='';
              for(var sy3=y0+szP*0.3; sy3<y1-szP*0.12; sy3+=szP*0.42) steps+='<line x1="'+(x0+szP*0.16)+'" y1="'+sy3+'" x2="'+(x1-szP*0.16)+'" y2="'+sy3+'" style="stroke:#93a0af;stroke-width:'+(szP*0.07)+'"/>';
              gP.push('<g data-stairgroup="'+keys+'" style="cursor:pointer"><title>Escalera (pincha en un tramo para quitarlo)</title><rect x="'+x0+'" y="'+y0+'" width="'+(x1-x0)+'" height="'+(y1-y0)+'" rx="'+(szP*.2)+'" style="fill:#eef1f5;stroke:#b9c2cd;stroke-width:'+(szP*.05)+'"/>'+steps+'</g>');
            });
          }
          gP.push('</g>'); out.push(gP.join(''));
          if(pxP<2.6) pushRichLabel(s, bb);
          return;
        }

        if(s.kind==='floor'){
          var fc = floorCat[s.id] && catById[floorCat[s.id]] ? catById[floorCat[s.id]].color : '#7593ab';
          out.push('<g data-sec="'+s.id+'" style="cursor:pointer">'+
            '<rect x="'+(s.x-s.w/2)+'" y="'+(s.y-s.h/2)+'" width="'+s.w+'" height="'+s.h+'" rx="26" transform="rotate('+(s.rot||0)+' '+s.x+' '+s.y+')" style="fill:'+fc+';opacity:.9'+selCss+'"/>'+
            '<text x="'+s.x+'" y="'+s.y+'" text-anchor="middle" style="font:700 34px system-ui;fill:#fff">'+esc(s.name)+'</text>'+
            '<text x="'+s.x+'" y="'+(s.y+44)+'" text-anchor="middle" style="font:600 24px system-ui;fill:rgba(255,255,255,.85)">'+(parseInt(s.cap||0,10)||0).toLocaleString('es-ES')+' de pie</text>'+
          '</g>');
          return;
        }

        var geo = secRows(s);
        var isBox = s.kind==='box';
        var pitchPx = s.pitch * scale;

        // Marco de PALCO (siempre visible, a cualquier zoom): borde grueso «dorado» + fondo crema.
        if(isBox){
          var ob = gridOutline(s);
          out.push('<g transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="pointer-events:none">'+
            '<rect x="'+(ob.x-s.pitch*.5)+'" y="'+(ob.y-s.pitch*.5)+'" width="'+(ob.w+s.pitch)+'" height="'+(ob.h+s.pitch)+'" rx="'+(s.pitch*1.1)+'" style="fill:#fbf6ec;stroke:#b08d4a;stroke-width:'+Math.max(2.5, s.pitch*.14)+'"/>'+
            '<rect x="'+(ob.x-s.pitch*.18)+'" y="'+(ob.y-s.pitch*.18)+'" width="'+(ob.w+s.pitch*.36)+'" height="'+(ob.h+s.pitch*.36)+'" rx="'+(s.pitch*.8)+'" style="fill:none;stroke:#d9c08c;stroke-width:'+Math.max(1.4, s.pitch*.07)+'"/>'+
          '</g>');
        }

        if(pitchPx < 2.6){
          // De LEJOS: bloque del sector; la ETIQUETA (nombre, nº de asientos y desglose por
          // categoría si hay varias) va en una PASADA FINAL para que ningún bloque la tape.
          // En el VISOR (no edición) el bloque toma el COLOR de su categoría mayoritaria: de un
          // vistazo se ve qué es cada sector con su nombre y su aforo.
          var farFill = isBox ? '#f3e9d4' : '#d7dee6';
          if(!canEdit){
            if(lodACounts===null) lodACounts = catCountsBySec();
            var _bc=lodACounts[s.id]||{}, _bestC='', _bestN=0;
            Object.keys(_bc).forEach(function(cid){ if(_bc[cid]>_bestN && catById[cid]){ _bestN=_bc[cid]; _bestC=catById[cid].color; } });
            if(_bestC) farFill=_bestC;
          }
          var lbl = s.name || '';
          var lcx, lcy, lsz;
          if(s.kind==='arc'){
            var mid=(s.dir)*R, rMid=s.r0+(s.rows-1)*s.rowGap/2;
            lcx = s.cx+rMid*Math.cos(mid); lcy = s.cy+rMid*Math.sin(mid);
            lsz = s.rows*s.rowGap*.3;
            out.push('<g data-sec="'+s.id+'" style="cursor:pointer"><path d="'+arcBandPath(s)+'" style="fill:'+farFill+';opacity:'+(canEdit?'.95':'.72')+';stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/></g>');
          } else {
            var o=gridOutline(s);
            lcx = s.x; lcy = s.y; lsz = o.h*.22;
            out.push('<g data-sec="'+s.id+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="cursor:pointer">'+
              '<rect x="'+o.x+'" y="'+o.y+'" width="'+o.w+'" height="'+o.h+'" rx="14" style="fill:'+farFill+';opacity:'+(canEdit?'.95':'.72')+';stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/></g>');
          }
          pushRichLabel(s, bb);
        } else if(pitchPx < 9.5){
          var sw = Math.max(s.pitch*.62, 10);
          var g = ['<g data-sec="'+s.id+'" style="cursor:pointer">'];
          // La CAPTURA de clics va por FRANJAS DE FILA (no por el rectángulo entero): así los
          // huecos, pasillos y bordes vacíos del sector NO cuentan — se puede pinchar o crear
          // otro sector justo encima de esas zonas en blanco.
          if(isSel){
            if(s.kind==='arc') g.push('<path d="'+arcBandPath(s)+'" style="fill:none'+selCss+'"/>');
            else { var go=gridOutline(s); g.push('<rect x="'+go.x+'" y="'+go.y+'" width="'+go.w+'" height="'+go.h+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="fill:none'+selCss+'"/>'); }
          }
          geo.rows.forEach(function(row){
            if(row.seats.length<2) return;
            var dHit='M'+row.seats.map(function(p){ return p.x+' '+p.y; }).join(' L');
            g.push('<path d="'+dHit+'" style="fill:none;stroke:#fff;stroke-opacity:0.01;stroke-width:'+(s.rowGap*.92)+';stroke-linecap:round"/>');
          });
          // Filas partidas en runs por hueco/escalera; cada run coloreado por su asignación.
          geo.rows.forEach(function(row){
            var runs=[], cur=null;
            row.seats.forEach(function(p){
              if(p.state==='stair' || p.state==='gap'){ cur=null; return; }
              var kSel = s.id+'|'+row.rowIdx+'|'+p.slot;
              var col = (sel[kSel] || (mode==='design' && dsel[kSel])) ? '#e0a800' : ((p.state==='off') ? '#d7dbe2' : (catColor(kSel) || '#c3ccd6'));
              if(cur && cur.col===col){ cur.pts.push(p); } else { cur={col:col, pts:[p]}; runs.push(cur); }
            });
            runs.forEach(function(run){
              if(run.pts.length===1){ var q=run.pts[0]; g.push('<circle cx="'+q.x+'" cy="'+q.y+'" r="'+(sw/2)+'" style="fill:'+run.col+'"/>'); return; }
              var d='M'+run.pts.map(function(p){ return p.x+' '+p.y; }).join(' L');
              g.push('<path d="'+d+'" style="fill:none;stroke:'+run.col+';stroke-width:'+sw+';stroke-linecap:round"/>');
            });
          });
          g.push('</g>');
          out.push(g.join(''));
          out.push(stairBandSvg(s, scale));
          out.push(rowSepSvg(s, scale));
          // Mientras no se ven las butacas: nombre + asientos + desglose por categoría.
          pushRichLabel(s, bb);
        } else {
          var size = s.pitch*.86, half=size/2, showNum = pitchPx>=15, showRowLbl = pitchPx>=13;
          var g2=['<g data-sec="'+s.id+'">'];
          var stairCells=[];   // casillas de ESCALERA por butaca: se agrupan en escaleras continuas
          if(isSel){ if(s.kind==='arc') g2.push('<path d="'+arcBandPath(s)+'" style="fill:none'+selCss+'"/>');
                     else { var go2=gridOutline(s); g2.push('<rect x="'+go2.x+'" y="'+go2.y+'" width="'+go2.w+'" height="'+go2.h+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="fill:none'+selCss+'"/>'); } }
          geo.rows.forEach(function(row){
            var first = row.seats[0];
            if(showRowLbl && first && first.x>=vx0-99&&first.x<=vx1+99&&first.y>=vy0-99&&first.y<=vy1+99){
              // Etiqueta de FILA junto al primer asiento (número o letra según la sección).
              var back = 1.5*s.pitch;
              var lx2, ly2;
              if(s.kind==='arc'){ var rr2 = Math.hypot(first.x-s.cx, first.y-s.cy); var t2 = Math.atan2(first.y-s.cy, first.x-s.cx) - back/rr2;
                lx2 = s.cx + rr2*Math.cos(t2); ly2 = s.cy + rr2*Math.sin(t2); }
              else { var cr3=Math.cos(s.rot*R), sr3=Math.sin(s.rot*R); lx2 = first.x - back*cr3; ly2 = first.y - back*sr3; }
              g2.push('<text x="'+lx2+'" y="'+ly2+'" text-anchor="middle" dominant-baseline="middle" style="font:700 '+(size*.42)+'px system-ui;fill:#9aa3af">'+esc(row.label)+'</text>');
            }
            var nameRuns=[], curRun=null;   // bloques de butacas seguidas del MISMO invitado (nombre + raya)
            row.seats.forEach(function(p){
              if(p.x<vx0-size||p.x>vx1+size||p.y<vy0-size||p.y>vy1+size){ curRun=null; return; }
              if(p.state==='stair'){
                curRun=null;
                if(p.perStair) stairCells.push({r:row.rowIdx, s:p.slot, x:p.x, y:p.y});
                return;
              }
              var key = s.id+'|'+row.rowIdx+'|'+p.slot;
              var aCat = assign[key] ? catById[assign[key]] : null;
              if(p.state==='seat' && aCat && aCat.kind==='guest'){
                if(curRun && curRun.cat===aCat){ curRun.pts.push(p); }
                else { curRun={cat:aCat, pts:[p]}; nameRuns.push(curRun); }
              } else curRun=null;
              if(p.state==='gap'){
                // Hueco (no hay butaca): celda discontinua. Solo captura el clic cuando la
                // herramienta Hueco/Apagada está activa (para poder quitarlo); si no, el clic
                // ATRAVIESA — lo que haya debajo (otro sector encajado ahí) responde.
                var gapHit = (mode==='design' && canEdit);   // en diseño, pinchar un hueco lo QUITA
                g2.push('<g data-seat="'+key+'" data-kind="gap" data-frac="'+p.frac.toFixed(4)+'" transform="translate('+p.x+' '+p.y+') rotate('+p.a.toFixed(1)+')" style="'+(gapHit?'cursor:pointer':'pointer-events:none')+'">'+
                  '<rect x="'+(-half)+'" y="'+(-half)+'" width="'+size+'" height="'+size+'" rx="'+(size*.24)+'" style="fill:'+(gapHit?'transparent':'none')+';stroke:#d5dbe2;stroke-width:'+(size*.05)+';stroke-dasharray:'+(size*.16)+' '+(size*.12)+'"/></g>');
                return;
              }
              var col = catColor(key);
              var isOff = p.state==='off';
              var fill = isOff ? '#d7dbe2' : (col ? col+'22' : '#effaf2');
              var stroke = isOff ? '#c3c9d2' : (col || '#cfe4d6');
              var ink = isOff ? '#7b838f' : (col || '#16803a');
              if(sel[key] || (mode==='design' && dsel[key])){ fill='#ffdf7e'; stroke='#e0a800'; ink='#7a5b00'; }   // seleccionada (staging o diseño)
              g2.push('<g data-seat="'+key+'" data-kind="'+p.state+'" data-n="'+(p.n!=null?p.n:'')+'" data-frac="'+p.frac.toFixed(4)+'" transform="translate('+p.x+' '+p.y+') rotate('+p.a.toFixed(1)+')" style="cursor:pointer">'+
                '<rect x="'+(-half)+'" y="'+(-half)+'" width="'+size+'" height="'+size+'" rx="'+(size*.24)+'" style="fill:'+fill+';stroke:'+stroke+';stroke-width:'+(size*.05)+'"/>'+
                '<use href="#vmSeatIcon" x="'+(-size*.30)+'" y="'+(-size*.34)+'" width="'+(size*.6)+'" height="'+(size*.45)+'" style="fill:'+ink+'"/>'+
                (showNum && p.n!=null? '<text y="'+(size*.33)+'" text-anchor="middle" style="font:600 '+(size*.30)+'px system-ui;fill:'+ink+'">'+p.n+'</text>' : '')+
              '</g>');
            });
            // Nombre + raya sobre cada bloque de invitado (igual que el plano de invitaciones).
            if(pitchPx>=12) nameRuns.forEach(function(run){
              if(!run.pts.length) return;
              var p0=run.pts[0], p1=run.pts[run.pts.length-1];
              var midA=((p0.a+p1.a)/2+90)*R;                        // «hacia fuera» de la fila
              var off=size*.95, ox=-Math.cos(midA)*off, oy=-Math.sin(midA)*off;
              g2.push('<line x1="'+(p0.x+ox)+'" y1="'+(p0.y+oy)+'" x2="'+(p1.x+ox)+'" y2="'+(p1.y+oy)+'" style="stroke:'+run.cat.color+';stroke-width:'+(size*.09)+';stroke-linecap:round;pointer-events:none"/>');
              g2.push('<text x="'+((p0.x+p1.x)/2+ox*1.55)+'" y="'+((p0.y+p1.y)/2+oy*1.55)+'" text-anchor="middle" style="font:600 '+(size*.36)+'px system-ui;fill:'+run.cat.color+';pointer-events:none">'+esc(run.cat.name)+'</text>');
            });
          });
          if(stairCells.length){
            // ESCALERA CONTINUA: todas las casillas de escalera contiguas se muestran como UNA
            // sola escalera (como en el editor de invitaciones). Pinchando encima se quita entera.
            var setC={}; stairCells.forEach(function(c){ setC[c.r+'|'+c.s]=c; });
            var seenC={};
            stairCells.forEach(function(c){
              var k0=c.r+'|'+c.s; if(seenC[k0]) return;
              var comp=[], q=[c]; seenC[k0]=1;
              while(q.length){ var u=q.pop(); comp.push(u);
                [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dv){ var kk2=(u.r+dv[0])+'|'+(u.s+dv[1]); var v=setC[kk2]; if(v && !seenC[kk2]){ seenC[kk2]=1; q.push(v); } });
              }
              var xs2=comp.map(function(u){return u.x;}), ys2=comp.map(function(u){return u.y;});
              var x0=Math.min.apply(null,xs2)-half, x1=Math.max.apply(null,xs2)+half;
              var y0=Math.min.apply(null,ys2)-half, y1=Math.max.apply(null,ys2)+half;
              var keys=comp.map(function(u){return s.id+'|'+u.r+'|'+u.s;}).join(',');
              var steps='';
              for(var sy2=y0+size*0.3; sy2<y1-size*0.12; sy2+=size*0.42) steps+='<line x1="'+(x0+size*0.16)+'" y1="'+sy2+'" x2="'+(x1-size*0.16)+'" y2="'+sy2+'" style="stroke:#93a0af;stroke-width:'+(size*0.07)+'"/>';
              g2.push('<g data-stairgroup="'+keys+'" style="cursor:pointer"><title>Escalera (pincha en un tramo para quitarlo)</title><rect x="'+x0+'" y="'+y0+'" width="'+(x1-x0)+'" height="'+(y1-y0)+'" rx="'+(size*.2)+'" style="fill:#eef1f5;stroke:#b9c2cd;stroke-width:'+(size*.05)+'"/>'+steps+'</g>');
            });
          }
          g2.push('</g>');
          out.push(g2.join(''));
          out.push(stairBandSvg(s, scale));
          out.push(rowSepSvg(s, scale));
        }
      });

      // Etiquetas del zoom lejano ENCIMA de todos los bloques (ningún sector encajado las tapa).
      if(labelsA.length) out.push('<g style="pointer-events:none">'+labelsA.join('')+'</g>');

      // 3) ELEMENTOS de pista/servicios (encima de las secciones; la silueta ya fue).
      elements.forEach(function(el){
        if(el.type==='outline') return;
        var sel = (mode==='design' && canEdit && (el.id===selId || dselO[el.id]))? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';
        var t='translate('+el.x+' '+el.y+') rotate('+(el.rot||0)+')';
        if(el.type==='stage'){
          var extW = parseFloat(el.extW||0)||0, extL = parseFloat(el.extL||0)||0;
          var ext = (extW>0 && extL>0) ? '<rect x="'+(el.w/2-4)+'" y="'+(-extW/2)+'" width="'+(extL+4)+'" height="'+extW+'" rx="12" style="fill:#111"/>' : '';
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer">'+ext+'<rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="18" style="fill:#111'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" transform="rotate(-90)" style="font:800 '+Math.min(el.w*.34,64)+'px system-ui;letter-spacing:.12em;fill:#fff">'+esc(el.label)+'</text></g>');
        } else if(el.type==='mix' || el.type==='delay'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="10" style="fill:#3d4653'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" style="font:800 '+Math.min(el.w,el.h)*.3+'px system-ui;fill:#fff">'+esc(el.label)+'</text></g>');
        } else if(el.type==='pmr'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="10" style="fill:#0e7490;opacity:.85'+sel+'"/>'+
            '<use href="#vmPmrIcon" x="'+(-el.w/2+14)+'" y="'+(-el.h*.36)+'" width="'+el.h*.7+'" height="'+el.h*.7+'" style="fill:#fff"/>'+
            '<text x="'+el.h*.4+'" text-anchor="middle" dominant-baseline="middle" style="font:800 '+el.h*.38+'px system-ui;letter-spacing:.08em;fill:#fff">'+esc(el.label)+'</text></g>');
        } else if(el.type==='rail'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="4" style="fill:#8b95a1'+sel+'"/></g>');
        } else if(el.type==='catwalk'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="12" style="fill:#20262e'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" style="font:800 '+Math.min(el.h*.5,40)+'px system-ui;letter-spacing:.1em;fill:#fff">'+esc(el.label)+'</text></g>');
        } else if(el.type==='pit'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="8" style="fill:rgba(227,61,72,.12);stroke:#E33D48;stroke-width:2.5;stroke-dasharray:10 7'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" style="font:800 '+Math.min(el.h*.42,34)+'px system-ui;letter-spacing:.08em;fill:#E33D48">'+esc(el.label)+'</text></g>');
        } else if(el.type==='stair'){
          var steps=''; for(var k=0;k<4;k++){ steps+='<line x1="'+(-el.w/2+6)+'" y1="'+(-el.h/2+(k+1)*el.h/5)+'" x2="'+(el.w/2-6)+'" y2="'+(-el.h/2+(k+1)*el.h/5)+'" style="stroke:#007CA2;stroke-width:4"/>'; }
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="6" style="fill:rgba(0,124,162,.10);stroke:#007CA2;stroke-width:2;stroke-dasharray:7 5'+sel+'"/>'+steps+'</g>');
        } else if(el.type==='door'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer">'+
            '<rect x="-34" y="-16" width="68" height="32" rx="8" style="fill:#fff;stroke:#007CA2;stroke-width:3'+sel+'"/>'+
            '<path d="M-12 0 L8 0 M0 -9 L10 0 L0 9" style="stroke:#007CA2;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round"/>'+
            '<text y="42" text-anchor="middle" style="font:700 22px system-ui;fill:#3f4c5a">'+esc(el.label)+'</text></g>');
        } else if(el.type==='wc' || el.type==='wc_pmr' || el.type==='merch' || el.type==='bar'){
          var fills = {wc:'#46689b', wc_pmr:'#46689b', merch:'#8a4a9e', bar:'#a8742e'};
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="12" style="fill:'+fills[el.type]+''+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" style="font:800 '+Math.min(el.h*.42, el.w*.24)+'px system-ui;letter-spacing:.05em;fill:#fff">'+esc(el.label)+'</text></g>');
        }
      });

      // Asa de REDIMENSIONADO en la esquina inferior derecha del seleccionado (zonas de pie,
      // silueta, escenario, torre mix/delay, PMR, pasarela, foso, baños, barras…): se arrastra
      // para cambiar el tamaño. (Las gradas se dimensionan por filas/butacas, no por asa.)
      if(mode==='design' && canEdit && selId){
        var rzObj = sections.find(function(x){ return x.id===selId && x.kind==='floor'; }) ||
                    elements.find(function(x){ return x.id===selId && x.type!=='door' && x.w && x.h; });
        if(rzObj){
          var hs = Math.max(14/scale, 10);
          out.push('<g transform="translate('+rzObj.x+' '+rzObj.y+') rotate('+(rzObj.rot||0)+')">'+
            '<rect data-resize="'+rzObj.id+'" x="'+(rzObj.w/2-hs/2)+'" y="'+(rzObj.h/2-hs/2)+'" width="'+hs+'" height="'+hs+'" rx="'+(hs*.2)+'" '+
            'style="fill:#fff;stroke:#E33D48;stroke-width:'+(2.4/scale)+';cursor:nwse-resize"/></g>');
        }
        // TIRADOR DE GIRO (círculo): gira el objeto seleccionado (palcos, escenario/FOH, escaleras,
        // butacas sueltas…) arrastrándolo. Si hay BUTACAS SUELTAS seleccionadas, gira ESAS en bloque.
        var rObj = sections.find(function(x){ return x.id===selId; }) || elements.find(function(x){ return x.id===selId; });
        var rot = rObj ? rotHandleGeom(rObj) : null;
        if(rot){
          var hr = Math.max(9/scale, 7);
          out.push('<line x1="'+rot.cx+'" y1="'+rot.cy+'" x2="'+rot.hx+'" y2="'+rot.hy+'" style="stroke:#E33D48;stroke-width:'+(1.6/scale)+';stroke-dasharray:'+(4/scale)+' '+(3/scale)+';pointer-events:none"/>'+
            '<circle data-rotate="'+rot.target+'" cx="'+rot.hx+'" cy="'+rot.hy+'" r="'+hr+'" style="fill:#fff;stroke:#E33D48;stroke-width:'+(2.4/scale)+';cursor:grab"/>'+
            '<circle cx="'+rot.hx+'" cy="'+rot.hy+'" r="'+(hr*.34)+'" style="fill:#E33D48;pointer-events:none"/>');
        }
      }
      // TIRADOR DE GIRO DEL GRUPO: con VARIOS sectores/elementos seleccionados (dselO), un
      // tirador sobre la caja conjunta gira TODO el grupo alrededor de su centro (los arcos
      // giran su centro y su orientación; las butacas se reorientan al escenario solas).
      if(mode==='design' && canEdit && dselOkeys().length>=2){
        var gb = dselOBounds();
        if(gb){
          var ghr = Math.max(9/scale, 7);
          var ghy = gb.my - 40/scale;
          out.push('<line x1="'+gb.cx+'" y1="'+gb.cy+'" x2="'+gb.cx+'" y2="'+ghy+'" style="stroke:#E33D48;stroke-width:'+(1.6/scale)+';stroke-dasharray:'+(4/scale)+' '+(3/scale)+';pointer-events:none"/>'+
            '<circle data-rotate="SELO" cx="'+gb.cx+'" cy="'+ghy+'" r="'+ghr+'" style="fill:#fff;stroke:#E33D48;stroke-width:'+(2.4/scale)+';cursor:grab"><title>Girar TODO lo seleccionado a la vez (Mayús = pasos de 15°)</title></circle>'+
            '<circle cx="'+gb.cx+'" cy="'+ghy+'" r="'+(ghr*.34)+'" style="fill:#E33D48;pointer-events:none"/>');
        }
      }
      world.innerHTML = out.join('');
      renderStats();
      // El resumen por categoría solo se recalcula cuando algo cambió (no en cada pan/zoom).
      if(summaryDirty && mode==='cats'){ summaryDirty=false; renderSummaryCounts(); }
      // El conteo del lazo se hace aquí (rAF) y no en cada pointermove: en iPad los eventos
      // llegan a 120 Hz y contar butacas en cada uno atascaba justo la interacción de pintar.
      if(drag && drag.kind==='lasso' && drag.w1){
        var nL=0; eachSeatInRect(drag.w0, drag.w1, function(){ nL++; });
        chip.textContent=nL.toLocaleString('es-ES')+' butaca'+(nL===1?'':'s'); chip.style.display='block';
        drawLasso(drag.w0, drag.w1);
      }
    }
    var summaryDirty = true;
    function markSummary(){ summaryDirty = true; queueRender(); }
    function queueRender(){ if(!raf) raf = requestAnimationFrame(render); }

    function renderStats(){
      var seated=0, standing=0;
      sections.forEach(function(s){ if(s.kind==='floor') standing += parseInt(s.cap||0,10)||0; else seated += seatCount(s); });
      var set = function(sel,v){ var e=host.querySelector(sel); if(e) e.textContent = v.toLocaleString('es-ES'); };
      set('[data-vm-total]', seated+standing); set('[data-vm-seated]', seated); set('[data-vm-standing]', standing);
    }

    /* ================= Panel lateral ================= */
    // Slider para el gesto rápido + CAMPO NUMÉRICO editable a mano y SIN tope (el rango del
    // slider es solo comodidad; el valor real puede escribirse directamente, p. ej. 120 butacas
    // por fila o una silueta de 8000).
    function slider(lbl,key,min,max,stepv,val,suf){
      return '<div class="vmap-param vmap-param--num"><label>'+lbl+(suf?' <span class="text-muted">('+suf.replace(/[()]/g,'')+')</span>':'')+'</label>'+
        '<input type="range" data-p="'+key+'" min="'+min+'" max="'+max+'" step="'+stepv+'" value="'+val+'">'+
        '<input type="number" class="form-control form-control-sm vmap-numin" data-p="'+key+'" min="'+min+'" step="'+stepv+'" value="'+val+'">'+
      '</div>';
    }
    function toolChip(key, icon, label){
      return '<button type="button" class="btn btn-sm '+(tool===key?'btn-primary':'btn-outline-secondary')+'" data-tool="'+key+'" title="Pínchalo y luego pincha en el plano (o arrástralo hasta una butaca)">'+icon+' '+label+'</button>';
    }
    function renderSide(){
      if(!side) return;
      var html = '';
      if(mode==='design'){
        if(!sections.length && !elements.length){
          html += '<h6 class="vmap-h"><i class="fa fa-shapes me-1"></i>Empezar con plantilla</h6><div class="vmap-tools">'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="plaza">Plaza de toros</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="arena">Arena (rectangular)</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="teatro">Teatro (abanico)</button></div>';
        }
        // Los botones de AÑADIR piezas viven en la barra horizontal de ARRIBA del lienzo
        // (data-vm-addbar): el panel queda para plano de fondo, herramientas y parámetros.
        // Plano de fondo (imagen subida): capa-guía para calcar el recinto encima.
        var bgE = elements.find(function(x){ return x.type==='bgimage' && x.url; });
        html += '<h6 class="vmap-h"><i class="fa fa-image me-1"></i>Plano de fondo</h6>';
        if(!bgE){
          html += '<div class="vmap-tools"><button type="button" class="btn btn-sm btn-outline-secondary" data-bg-upload><i class="fa fa-image me-1"></i>Subir plano</button></div>'+
            '<p class="text-muted small mb-0">Sube una imagen del plano para calcar el recinto encima (gradas, sectores…).</p>';
        } else {
          html += '<div class="vmap-param"><label>Opacidad</label><input type="range" class="form-range" min="10" max="100" step="5" value="'+Math.round((bgE.opacity!=null?bgE.opacity:0.6)*100)+'" data-bg-op></div>'+
            '<div class="vmap-tools">'+
              '<button type="button" class="btn btn-sm '+(bgE.locked?'btn-primary':'btn-outline-secondary')+'" data-bg-lock>'+(bgE.locked?'<i class="fa fa-lock me-1"></i>Bloqueado':'<i class="fa fa-lock-open me-1"></i>Desbloqueado')+'</button>'+
              '<button type="button" class="btn btn-sm btn-outline-secondary" data-bg-upload>Cambiar</button>'+
              '<button type="button" class="btn btn-sm btn-outline-danger" data-bg-remove>Quitar</button></div>'+
            '<p class="text-muted small mb-0">'+(bgE.locked?'Bloqueado: no se mueve mientras dibujas encima.':'Pincha el plano (zonas vacías) para moverlo; arrastra la esquina roja para escalarlo.')+'</p>'+
            '<h6 class="vmap-h mt-2">Crear plano desde la imagen</h6>'+
            '<div class="vmap-tools"><button type="button" class="btn btn-sm btn-danger" data-bg-auto><i class="fa fa-wand-magic-sparkles me-1"></i>Crear plano según la imagen</button></div>'+
            '<p class="text-muted small mb-0">Detecta los asientos de la imagen y crea los SECTORES automáticamente: lo que va junto se agrupa (los huecos de escaleras se conservan) y cada grupo se mueve por separado.</p>'+
            '<div class="vmap-tools mt-2"><button type="button" class="btn btn-sm '+(detectArm?'btn-primary':'btn-outline-secondary')+'" data-bg-detect title="Detección manual: pincha un asiento de EJEMPLO y se detectan todos los parecidos (color y tamaño).">'+(detectArm?'<i class="fa fa-crosshairs me-1"></i>Pincha un asiento…':'Detección manual')+'</button>'+
              (lastSample?'<button type="button" class="btn btn-sm btn-outline-secondary" data-bg-redetect>Volver a detectar</button>':'')+'</div>';
        }
        // HERRAMIENTAS: seleccionar (recuadro) + retoques por butaca, en una sola fila de chips.
        html += '<h6 class="vmap-h"><i class="fa fa-wand-magic-sparkles me-1"></i>Herramientas <i class="fa fa-circle-info text-muted" title="Seleccionar: arrastra un recuadro (Mayús añade); Supr borra lo seleccionado. Hueco = no existe la butaca; Apagada = existe pero no se ofrece; Escalera = corte vertical; Pasillo = hueco horizontal entre filas; № = cambiar el número de una butaca (o varias, barriéndolas). Pincha un retoque ya puesto para quitarlo."></i></h6>'+
          '<div class="vmap-tools" data-tool-chips>'+
          toolChip('select','⛶','Seleccionar')+'</div>'+
          '<p class="text-muted small mb-0 mt-1">Hueco, apagada, escalera, pasillo y nº se ARRASTRAN desde la barra de arriba. Con butacas seleccionadas, pincha uno de ellos y todas pasan a ser ese elemento.</p>';
        var nSeatsSel=dselKeys().length, nObjSel=dselOkeys().length;
        if(nSeatsSel || nObjSel){
          html += '<p class="text-muted small mb-1 mt-1">Seleccionado: '+(nSeatsSel?nSeatsSel+' butaca'+(nSeatsSel===1?'':'s'):'')+(nSeatsSel&&nObjSel?' · ':'')+(nObjSel?nObjSel+' elemento'+(nObjSel===1?'':'s'):'')+'. Arrastra uno para mover el conjunto; Supr (o «Eliminar selección») borra todo lo seleccionado.'+(nSeatsSel>=2?' En la tarjeta de la DERECHA del plano puedes agruparlas y ponerles sector, fila y numeración.':'')+'</p>';
          if(nSeatsSel>=2 && dselInfo().allPoints){
            html += '<div class="vmap-tools"><span class="text-muted small" style="align-self:center;margin-right:.2rem">Agrupar butacas:</span>'+
              '<button type="button" class="btn btn-sm btn-outline-secondary" data-group="row">en fila</button>'+
              '<button type="button" class="btn btn-sm btn-outline-secondary" data-group="box">en palco</button>'+
              '<button type="button" class="btn btn-sm btn-outline-secondary" data-group="sector">en sector</button></div>';
          }
          html += '<div class="vmap-tools"><button type="button" class="btn btn-sm btn-outline-danger" data-del-multi><i class="fa fa-trash me-1"></i>Eliminar selección</button></div>';
        }

        var s = sections.find(function(x){return x.id===selId;});
        var el = elements.find(function(x){return x.id===selId;});
        if(s){
          html += '<h6 class="vmap-h"><i class="fa fa-sliders me-1"></i>Sección: '+esc(s.name||'')+'</h6>';
          html += '<div class="vmap-param"><label>Nombre</label><input type="text" class="form-control form-control-sm" data-p="name" value="'+esc(s.name||'')+'"></div>';
          if(s.kind!=='floor'){
            html += '<div class="vmap-param"><label>Alias <i class="fa fa-circle-info text-muted" title="Otros nombres con los que las ticketeras llaman a este sector en los PDF (separados por comas)."></i></label><input type="text" class="form-control form-control-sm" data-p="aliases" value="'+esc(s.aliases||'')+'" placeholder="201, SECTOR 201"></div>';
          }
          // El TAMAÑO de butaca es el mismo en todos los módulos (uniforme): sin sliders de paso.
          if(s.kind==='arc'){
            html += slider('Filas','rows',1,40,1,s.rows)
                  + slider('Amplitud','span',6,180,1,s.span,'°')
                  + slider('Orientación','dir',-180,180,1,s.dir,'°')
                  + slider('Radio','r0',150,2600,10,s.r0);
          } else if(s.kind==='grid' || s.kind==='box'){
            html += slider('Filas','rows',1,(s.kind==='box'?4:60),1,s.rows) + slider('Butacas/fila','cols',1,(s.kind==='box'?10:80),1,s.cols)
                  + slider('Rotación','rot',-180,180,1,s.rot,'°');
          } else if(s.kind==='points'){
            html += slider('Tamaño butaca','pitch',10,60,1,s.pitch||26) + slider('Rotación','rot',-180,180,1,s.rot||0,'°');
          } else {
            html += slider('Ancho','w',120,2400,10,s.w) + slider('Alto','h',120,2400,10,s.h)
                  + slider('Aforo de pie','cap',0,30000,50,s.cap) + slider('Rotación','rot',-180,180,1,s.rot,'°');
          }
          if(s.kind!=='floor'){
            var nm = numOf(s);
            html += '<div class="vmap-numrow"><label>Butacas</label>'+
              '<input type="number" class="form-control form-control-sm" data-p="num_start" value="'+nm.start+'" min="0" title="Primera butaca">'+
              '<select class="form-select form-select-sm" data-p="num_mode" title="Numeración de las butacas"><option value="seq"'+(nm.mode==='seq'?' selected':'')+'>Consecutivos</option><option value="odd"'+(nm.mode==='odd'?' selected':'')+'>Impares</option><option value="even"'+(nm.mode==='even'?' selected':'')+'>Pares</option></select>'+
              '<select class="form-select form-select-sm" data-p="num_dir"><option value="ltr"'+(nm.dir==='ltr'?' selected':'')+'>Izq → der</option><option value="rtl"'+(nm.dir==='rtl'?' selected':'')+'>Der → izq</option></select></div>';
            var _desc = s.rowDir==='desc';
            html += '<div class="vmap-numrow"><label>Filas</label>'+
              '<select class="form-select form-select-sm" data-p="rowSchemeDir" title="Cómo se etiquetan las filas. «Desc.» = la primera fila es la de ABAJO del dibujo (planos calcados donde la fila 1 está delante)">'+
                '<option value="num"'+((s.rowScheme||'num')==='num'&&!_desc?' selected':'')+'>1, 2, 3…</option>'+
                '<option value="alpha"'+(s.rowScheme==='alpha'&&!_desc?' selected':'')+'>A, B, C…</option>'+
                '<option value="num_desc"'+((s.rowScheme||'num')==='num'&&_desc?' selected':'')+'>…3, 2, 1 (desc.)</option>'+
                '<option value="alpha_desc"'+(s.rowScheme==='alpha'&&_desc?' selected':'')+'>…C, B, A (desc.)</option>'+
              '</select>'+
              '<input type="number" class="form-control form-control-sm" data-p="rowStart" value="'+(parseInt(s.rowStart,10)||1)+'" min="1" title="Primera fila: 3 = empieza en la fila 3 (o en la C si van por letras)">'+
              '<select class="form-select form-select-sm" data-p="gapPolicy" title="Qué pasa con la numeración al poner un HUECO"><option value="skip"'+((s.gapPolicy||'skip')==='skip'?' selected':'')+'>Hueco salta nº</option><option value="renumber"'+(s.gapPolicy==='renumber'?' selected':'')+'>Hueco renumera</option></select></div>';
            var nStairs = (s.stairs||[]).length, nMods = 0;
            Object.keys(s.mods||{}).forEach(function(k){ var m=s.mods[k]; nMods += (m.gaps||[]).length + (m.off||[]).length; });
            if(nStairs || nMods) html += '<p class="text-muted small mb-0 mt-1">Retoques: '+nMods+' butaca(s) · '+nStairs+' escalera(s) integrada(s).</p>';
          }
          html += '<div class="vmap-tools mt-2">'+
            (s.linkGroup ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="unlink" title="Esta grada está FUSIONADA con otras (se mueven en conjunto): separarla del grupo">⛓ Separar grada</button>' : '')+
            (s.kind==='arc' ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="ring">⟳ Repetir en anillo</button><input type="number" class="form-control form-control-sm vmap-ringn" data-ring-n value="12" min="2" max="40" title="Nº de sectores del anillo">' : '')+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button>'+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="front" title="Ponerlo POR ENCIMA de lo que tenga debajo (p. ej. asientos sobre los huecos de otro sector)">⬆ Al frente</button>'+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="back" title="Mandarlo detrás de las demás piezas">⬇ Al fondo</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
          if(s.kind!=='floor') html += '<p class="text-muted small mt-2 mb-0">Butacas de esta sección: <b>'+seatCount(s).toLocaleString('es-ES')+'</b></p>';
        } else if(el){
          html += '<h6 class="vmap-h"><i class="fa fa-sliders me-1"></i>Elemento: '+esc(el.label|| (el.type==='outline'?'Silueta del recinto':''))+'</h6>';
          if(el.type!=='outline') html += '<div class="vmap-param"><label>Etiqueta</label><input type="text" class="form-control form-control-sm" data-p="label" value="'+esc(el.label||'')+'"></div>';
          html += slider('Ancho','w',30,4000,5,el.w||100) + slider('Alto','h',8,4000,5,el.h||100)
                + slider('Rotación','rot',-180,180,1,el.rot||0,'°');
          if(el.type==='outline') html += slider('Redondez','corner',0,100,1,(el.corner!=null?el.corner:60),'%');
          if(el.type==='stage'){
            html += '<h6 class="vmap-h">Provocador <i class="fa fa-circle-info text-muted" title="Extensión del escenario hacia la pista. Déjalo a 0 si no hay."></i></h6>'
                  + slider('Largo','extL',0,900,5,el.extL||0) + slider('Ancho','extW',0,500,5,el.extW||0);
          }
          html += '<div class="vmap-tools mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button>'+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="front">⬆ Al frente</button>'+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="back">⬇ Al fondo</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
        } else {
          html += '<h6 class="vmap-h"><i class="fa fa-sliders me-1"></i>Sección</h6><p class="text-muted small mb-0">Añade gradas y elementos desde la barra de ARRIBA del plano. Pincha una pieza para editar aquí sus parámetros y arrástrala para moverla. Los sectores se pueden superponer: «Al frente / Al fondo» decide cuál queda encima.</p>';
        }
      } else {
        /* -------- modo Categorías -------- */
        html += '<h6 class="vmap-h">Herramienta</h6><div class="vmap-seg vmap-seg--full">'+
          '<button type="button" class="'+(catTool==='select'?'on':'')+'" data-cat-tool="select">▢ Seleccionar</button>'+
          '<button type="button" class="'+(catTool==='paint'?'on':'')+'" data-cat-tool="paint">🖌 Pintar</button>'+
          '<button type="button" class="'+(catTool==='count'?'on':'')+'" data-cat-tool="count">☝ Contar</button>'+
          '<button type="button" class="'+(catTool==='erase'?'on':'')+'" data-cat-tool="erase">⌫ Quitar</button></div>';
        html += '<h6 class="vmap-h">Categorías</h6><div class="vmap-cats">'+cats.map(function(c){
          return '<div class="vmap-cat '+(c.id===activeCat?'on':'')+'" data-cat="'+c.id+'"><span class="sw" style="background:'+c.color+'"></span><span class="nm">'+esc(c.name)+'</span>'+
                 '<button type="button" class="vmap-cat-x" data-cat-del="'+c.id+'" title="Eliminar esta categoría (sus butacas quedan sin asignar)">✕</button></div>';
        }).join('')+'</div>';
        html += '<div class="vmap-addcat"><input type="text" class="form-control form-control-sm" data-nc-name placeholder="Nueva categoría"><input type="color" data-nc-color value="#0891b2"><button type="button" class="btn btn-sm btn-outline-secondary" data-nc-add>+</button></div>'+
                '<div class="text-danger small mt-1" data-nc-warn style="display:none">Ese color se parece demasiado a otra categoría.</div>';
        html += '<h6 class="vmap-h">Resumen</h6><div class="vmap-summary" data-vm-summary></div>';
        html += '<p class="text-muted small mt-2 mb-0"><b>Seleccionar</b>: pincha o barre butacas (de lejos, el sector entero) y verás el TOTAL en una tarjeta flotante: arrástrala hasta una categoría (o pincha una) para asignarlas. <b>Pintar</b>: aplica la categoría activa directamente. <b>Contar</b>: solo muestra cuántas abarcas. <b>Quitar</b>: libera.</p>';
      }
      side.innerHTML = html;
      // Barra de añadir de ARRIBA: solo en modo diseño; refleja los modos armados (Dibujar/Butaca).
      if(addbar){
        addbar.style.display = (mode==='design') ? '' : 'none';
        var abD=addbar.querySelector('[data-add="draw"]'); if(abD) abD.classList.toggle('on', drawArm);
        var abS=addbar.querySelector('[data-arm-seat]'); if(abS) abS.classList.toggle('on', seatArm);
        addbar.querySelectorAll('[data-tool]').forEach(function(b){ b.classList.toggle('on', tool===b.dataset.tool); });
      }
      if(mode==='cats') renderSummaryCounts();
      updateDPop();   // el popup de selección de diseño sigue SIEMPRE al estado actual de dsel
    }
    // ¿Existe HOY esa butaca (sección viva + slot con estado seat)? Depura asignaciones huérfanas:
    // al encoger una sección, cortar una escalera o poner huecos, las claves antiguas se ignoran
    // (y compressAssignments las borra del todo al guardar).
    function seatIsValid(secById, key){
      var p = key.split('|'); if(p.length!==3) return false;
      var s = secById[p[0]];
      if(!s || s.kind==='floor') return false;
      return !!secRows(s).valid[p[1]+'|'+p[2]];
    }
    function renderSummaryCounts(){
      var box = host.querySelector('[data-vm-summary]');
      if(!box) return;
      var secById = {}; sections.forEach(function(s){ secById[s.id]=s; });
      var counts={}, total=0;
      Object.keys(assign).forEach(function(k){ if(!seatIsValid(secById,k)) return; var c=assign[k]; counts[c]=(counts[c]||0)+1; });
      sections.forEach(function(s){
        if(s.kind==='floor'){ var cap=parseInt(s.cap||0,10)||0; total+=cap; if(floorCat[s.id]) counts[floorCat[s.id]]=(counts[floorCat[s.id]]||0)+cap; }
        else total += seatCount(s);
      });
      var assigned=0; Object.keys(counts).forEach(function(k){ assigned+=counts[k]; });
      var html = '<div class="vmap-srow head"><span>Asignadas</span><span class="n">'+assigned.toLocaleString('es-ES')+' / '+total.toLocaleString('es-ES')+'</span></div>';
      cats.forEach(function(c){
        html += '<div class="vmap-srow"><span class="sw" style="background:'+c.color+'"></span><span>'+esc(c.name)+'</span><span class="n">'+(counts[c.id]||0).toLocaleString('es-ES')+'</span></div>';
      });
      html += '<div class="vmap-srow"><span class="sw" style="background:#effaf2;border:1px solid #cfe4d6"></span><span>Sin asignar</span><span class="n">'+Math.max(0,total-assigned).toLocaleString('es-ES')+'</span></div>';
      box.innerHTML = html;
    }
    function setHint(){
      var h = host.querySelector('[data-vm-hint]');
      if(!h) return;
      if(!canEdit){ h.innerHTML = 'Arrastra o usa la rueda/dos dedos para desplazarte; pellizco o Ctrl/Cmd + rueda para hacer zoom: de lejos verás los sectores y, al acercarte, cada butaca con su número.'; return; }
      if(detectArm){ h.innerHTML = '<b>Detectar asientos:</b> pincha en el CENTRO de un asiento de ejemplo del plano subido. Se detectarán todos los parecidos.'; return; }
      if(seatArm){ h.innerHTML = '<b>Butaca suelta:</b> pincha en el plano para ir poniendo butacas: junto a otras se ENCAJAN solas al patrón de su fila (mismo tamaño y orientación, sin montarse) y pinchando un HUECO lo rellenas. Luego puedes moverlas o girarlas; con Mayús seleccionas varias.'; return; }
      if(tool==='select'){ h.innerHTML = '<b>Seleccionar:</b> pincha una butaca y, SIN SOLTAR, pasa por encima de las demás para ir seleccionándolas (aunque salgas a otro sector); pincha un SECTOR y pasa por otros para seleccionar varios; o arrastra un recuadro por el vacío. Lo YA seleccionado se ARRASTRA para mover el conjunto, y con varios sectores aparece un tirador para GIRARLOS todos a la vez. En el panel flotante configuras fila y numeración de LAS FILAS seleccionadas. Mayús añade/quita.'; return; }
      h.innerHTML = mode==='design'
        ? '<b>Diseñar:</b> pincha una BUTACA de una grada para configurarla (fila, numeración; Mayús añade) y ARRASTRA desde ella para mover el sector. Con una herramienta de retoque activa (Hueco/Apagada/Escalera), pincha butacas para aplicarla. Rueda desplaza; pellizco o Ctrl/Cmd + rueda hace zoom.'
        : '<b>Categorías:</b> selecciona butacas (clic, barrido o el sector entero de lejos) y verás el total en una tarjeta flotante: arrástrala hasta una categoría (o pincha una) para asignarlas. «Pintar» aplica directo; «Contar» solo cuenta.';
    }

    /* ========= Detección de asientos desde el plano de fondo (Lote B) =========
       Guiada por MUESTRA: el usuario pincha un asiento de ejemplo; se toma su color y tamaño y se
       buscan todos los blobs parecidos en la imagen (getImageData + componentes conexas). Los
       centroides pasan a coordenadas del mundo, se agrupan en filas y se crea una sección 'points'. */
    function loadBgPixels(url, cb){
      if(bgPixCache[url]){ cb(bgPixCache[url]); return; }
      var img=new Image(); img.crossOrigin='anonymous';
      img.onload=function(){
        var maxSide=1300, sc=Math.min(1, maxSide/Math.max(img.naturalWidth||1, img.naturalHeight||1));
        var cw=Math.max(1,Math.round((img.naturalWidth||1)*sc)), ch=Math.max(1,Math.round((img.naturalHeight||1)*sc));
        var cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
        var cx=cv.getContext('2d'); cx.drawImage(img,0,0,cw,ch);
        var im; try{ im=cx.getImageData(0,0,cw,ch); }catch(err){ cb(null,'cors'); return; }
        var rec={data:im.data, w:cw, h:ch}; bgPixCache[url]=rec; cb(rec);
      };
      img.onerror=function(){ cb(null,'load'); };
      img.src=url;
    }
    function bgWorldToPx(bg, wx, wy, W, H){
      var a=-(bg.rot||0)*R, ca=Math.cos(a), sa=Math.sin(a), dx=wx-bg.x, dy=wy-bg.y;
      return { px: Math.round((dx*ca - dy*sa + bg.w/2)/bg.w*W), py: Math.round((dx*sa + dy*ca + bg.h/2)/bg.h*H) };
    }
    function bgPxToWorld(bg, cpx, cpy, W, H){
      var lx=cpx/W*bg.w - bg.w/2, ly=cpy/H*bg.h - bg.h/2, cr=Math.cos((bg.rot||0)*R), sr=Math.sin((bg.rot||0)*R);
      return { x: bg.x + lx*cr - ly*sr, y: bg.y + lx*sr + ly*cr };
    }
    function detectFromPixels(rec, bg, sampleWorld, tol){
      var W=rec.w, H=rec.h, D=rec.data, N=W*H;
      var sp=bgWorldToPx(bg, sampleWorld.x, sampleWorld.y, W, H);
      if(sp.px<0||sp.py<0||sp.px>=W||sp.py>=H) return {err:'outside'};
      var si=(sp.py*W+sp.px)*4, sr=D[si], sg=D[si+1], sb=D[si+2], tol2=tol*tol*3;
      function match(i4){ var dr=D[i4]-sr, dg=D[i4+1]-sg, db=D[i4+2]-sb; return (dr*dr+dg*dg+db*db) <= tol2; }
      var seen=new Uint8Array(N);
      function bfs(start){
        var stack=[start], area=0, sx=0, sy=0, minx=1e9, miny=1e9, maxx=-1, maxy=-1;
        while(stack.length){
          var p=stack.pop(); if(seen[p]) continue; if(!match(p*4)){ seen[p]=1; continue; }
          seen[p]=1; area++; var x=p%W, y=(p-x)/W; sx+=x; sy+=y;
          if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
          if(area>200000) break;
          if(x>0) stack.push(p-1); if(x<W-1) stack.push(p+1); if(y>0) stack.push(p-W); if(y<H-1) stack.push(p+W);
        }
        return {area:area, cx:sx/Math.max(1,area), cy:sy/Math.max(1,area), w:maxx-minx+1, h:maxy-miny+1, minx:minx, miny:miny};
      }
      // AGUJEROS interiores (topología): una butaca maciza no tiene; un 8/0/6 del plano sí. El
      // número impreso DENTRO de una butaca es pequeño (≤22 % del recuadro) y no la descarta.
      function holeRatio(b){
        var w=b.w, h=b.h, x0=b.minx, y0=b.miny, n2=w*h;
        if(n2>20000) return 0;   // blob enorme: ya lo filtra el tamaño, no perder tiempo aquí
        function isBg(x,y){ return !match((y*W+x)*4); }
        var vis=new Uint8Array(n2), st=[], x, y, i2;
        for(x=x0;x<x0+w;x++){ st.push(x, y0, x, y0+h-1); }
        for(y=y0;y<y0+h;y++){ st.push(x0, y, x0+w-1, y); }
        var reach=0;
        while(st.length){
          y=st.pop(); x=st.pop();
          if(x<x0 || y<y0 || x>=x0+w || y>=y0+h) continue;
          i2=(y-y0)*w+(x-x0);
          if(vis[i2]) continue; vis[i2]=1;
          if(!isBg(x,y)) continue;
          reach++;
          st.push(x-1,y, x+1,y, x,y-1, x,y+1);
        }
        var bgN=0;
        for(y=y0;y<y0+h;y++) for(x=x0;x<x0+w;x++){ if(isBg(x,y)) bgN++; }
        return (bgN-reach)/n2;
      }
      var sample=bfs(sp.py*W+sp.px);
      if(sample.area<3) return {err:'nomatch'};
      if(sample.area > N*0.02) return {err:'toobig'};
      // SOLO asientos: blobs CUADRADOS o REDONDOS (lados parecidos) y MACIZOS (relleno alto).
      // Las letras, números y símbolos del plano son trazos finos, alargados o huecos: fuera.
      function seatShape(b){
        if(b.w<3 || b.h<3) return false;                                   // motas
        if(Math.max(b.w,b.h) > Math.max(1,Math.min(b.w,b.h))*1.7) return false;  // alargado (rótulos)
        if(b.area / Math.max(1, b.w*b.h) < 0.45) return false;             // trazo fino (glifos)
        return holeRatio(b) <= 0.22;                                       // 8/0/6 huecos, fuera
      }
      if(!seatShape(sample)) return {err:'nomatch'};   // la muestra no parece una butaca
      var sArea=sample.area, loMax=Math.max(sample.w,sample.h)*2.6, guard=0;
      // El asiento de la MUESTRA ya se marcó como visto al medir su tamaño: lo añadimos a mano para
      // que no falte (si no, se detectan todos MENOS el que pinchaste).
      var blobs=[sample];
      for(var p=0;p<N;p++){
        if(seen[p]) continue;
        if(!match(p*4)){ seen[p]=1; continue; }
        var b=bfs(p);
        if(b.area < sArea*0.30 || b.area > sArea*3.5) continue;
        if(b.w > loMax || b.h > loMax) continue;
        if(!seatShape(b)) continue;
        blobs.push(b);
        if(++guard>20000) break;
      }
      // Banda de TAMAÑO alrededor de la MEDIANA: en un plano todas las butacas miden lo mismo;
      // lo que se salga (números junto a las filas, adornos, mini-blobs entre butacas) no entra.
      var sizes=blobs.map(function(b){ return Math.max(b.w,b.h); }).sort(function(a,b2){ return a-b2; });
      var refS=sizes[Math.floor(sizes.length/2)];
      var pts=blobs.filter(function(b){ var s2=Math.max(b.w,b.h); return s2>=refS*0.62 && s2<=refS*1.6; })
                   .map(function(b){ return bgPxToWorld(bg, b.cx, b.cy, W, H); });
      var sizeWorld = refS / (((W/bg.w) + (H/bg.h))/2);
      return { pts: dedupPoints(pts, sizeWorld*0.7), sizeWorld: sizeWorld };
    }
    function dedupPoints(pts, minDist){
      if(minDist<=0 || pts.length<2) return pts;
      var grid={}, out=[], md2=minDist*minDist;
      pts.forEach(function(p){
        var gx=Math.round(p.x/minDist), gy=Math.round(p.y/minDist), near=false;
        for(var dx=-1;dx<=1&&!near;dx++) for(var dy=-1;dy<=1;dy++){ var arr=grid[(gx+dx)+','+(gy+dy)]; if(arr){ for(var k=0;k<arr.length;k++){ var q=arr[k]; if((q.x-p.x)*(q.x-p.x)+(q.y-p.y)*(q.y-p.y)<md2){ near=true; break; } } } }
        if(!near){ out.push(p); (grid[gx+','+gy]=grid[gx+','+gy]||[]).push(p); }
      });
      return out;
    }
    function buildPointsSectionFrom(pts, size, name){
      // El bloque se crea COMO UNA GRADA acorde al plano: filas por proximidad vertical; si la fila
      // es RECTA se alinea su y (las curvas de teatro se conservan); si las separaciones son
      // uniformes se ajusta a rejilla exacta; y donde FALTA un asiento se inserta un HUECO (mods
      // gap) para que todo quede alineado y luego sea fácil retocar: huecos, escaleras, arrastrar
      // asientos entre medias… La numeración salta los huecos según la política de la sección.
      var cx=0, cy=0;
      pts.forEach(function(p){ cx+=p.x; cy+=p.y; }); cx/=pts.length; cy/=pts.length;
      var sorted=pts.slice().sort(function(a,b){ return a.y-b.y; });
      var rowThresh=Math.max(size*1.1, 6), rowsArr=[], cur=null;
      sorted.forEach(function(p){ if(!cur || p.y-cur.y0>rowThresh){ cur={y0:p.y, items:[]}; rowsArr.push(cur); } cur.items.push(p); });
      var seats=[], mods={}, maxRow=0, rowPitches=[];
      rowsArr.forEach(function(row, ri){
        var ridx=ri+1; maxRow=ridx;
        var items=row.items.slice().sort(function(a,b){ return a.x-b.x; }).map(function(p){ return {x:p.x, y:p.y}; });
        // Paso de la fila: mediana de las separaciones entre vecinos «normales».
        var dists=[];
        for(var i=1;i<items.length;i++) dists.push(Math.hypot(items[i].x-items[i-1].x, items[i].y-items[i-1].y));
        var near=dists.filter(function(d){ return d<=size*1.6 && d>2; }).sort(function(a,b){ return a-b; });
        var pitchRow=near.length ? near[Math.floor(near.length/2)] : size;
        if(pitchRow>4) rowPitches.push(pitchRow);
        // ¿Fila RECTA? → alinear la y de todas sus butacas.
        var straight=false;
        if(items.length>=4){
          var my=0; items.forEach(function(p){ my+=p.y; }); my/=items.length;
          var vy=0; items.forEach(function(p){ vy+=(p.y-my)*(p.y-my); }); vy=Math.sqrt(vy/items.length);
          if(vy<=pitchRow*0.30){ straight=true; items.forEach(function(p){ p.y=my; }); }
        }
        // HUECOS donde falta asiento (escaleras/pasillos del plano): posiciones interpoladas
        // marcadas como gap. Los huecos grandes (sectores separados) ya no llegan aquí.
        var full=[];
        for(var j=0;j<items.length;j++){
          if(j>0){
            var d=Math.hypot(items[j].x-items[j-1].x, items[j].y-items[j-1].y);
            if(d>pitchRow*1.6 && d<pitchRow*4.9){
              var k=Math.min(3, Math.round(d/pitchRow)-1);
              for(var g2=1; g2<=k; g2++){
                full.push({x:items[j-1].x+(items[j].x-items[j-1].x)*g2/(k+1),
                           y:items[j-1].y+(items[j].y-items[j-1].y)*g2/(k+1), gap:true});
              }
            }
          }
          full.push(items[j]);
        }
        // ¿Recta y con separaciones uniformes? → rejilla exacta (como una grada nueva).
        if(straight && full.length>=4){
          var dd=[];
          for(var u=1;u<full.length;u++) dd.push(full[u].x-full[u-1].x);
          var mean=dd.reduce(function(a2,b2){ return a2+b2; }, 0)/dd.length;
          var sd=Math.sqrt(dd.reduce(function(a2,v){ return a2+(v-mean)*(v-mean); }, 0)/dd.length);
          if(mean>2 && sd<=pitchRow*0.22){
            var x0=full[0].x;
            full.forEach(function(p, u2){ p.x=x0+mean*u2; });
          }
        }
        var gapSlots=[];
        full.forEach(function(p, si){
          seats.push({ row:ridx, slot:si+1, lx:Math.round(p.x-cx), ly:Math.round(p.y-cy) });
          if(p.gap) gapSlots.push(si+1);
        });
        if(gapSlots.length) mods[String(ridx)]={gaps:gapSlots};
      });
      // El paso de la sección sale del ESPACIADO real entre butacas (mediana de filas); mínimo 8
      // para que lo creado case con el plano de la guía y se pueda recrear/modificar encima.
      var pit=rowPitches.length ? rowPitches.sort(function(a,b){ return a-b; })[Math.floor(rowPitches.length/2)] : size;
      var sec={ id:nid('s'), kind:'points', name:(name||'Asientos detectados'), x:Math.round(cx), y:Math.round(cy), rot:0,
               pitch:Math.max(8, Math.min(60, Math.round(pit))), rows:maxRow,
               num:{start:1, mode:'seq', step:1, dir:'ltr'}, rowScheme:'num', rowStart:1, gapPolicy:'skip', seats:seats };
      if(Object.keys(mods).length) sec.mods=mods;
      return sec;
    }
    // Puntos detectados → SECTORES por contigüidad: mucha separación = sectores distintos (cada uno
    // se mueve por separado); los huecos pequeños (escaleras/pasillos) se CONSERVAN dentro del
    // sector como huecos. Las posiciones respetan la orientación del plano tal cual se detectaron.
    function buildSectorsFromPoints(pts, size){
      var clusters=contiguousClusters(pts, Math.max(size*3.0, 12));
      var n0=sections.filter(function(s){ return s.kind==='points'; }).length;
      var made=[];
      clusters.forEach(function(cl){
        if(!cl.length) return;
        made.push(buildPointsSectionFrom(cl, size, 'Sector '+(n0+made.length+1)));
      });
      made.forEach(function(sec){ sections.push(sec); });
      return made;
    }
    function runDetect(clientX, clientY, sampleOpt){
      var bg=elements.find(function(x){return x.type==='bgimage' && x.url;});
      if(!bg){ alert('Primero sube un plano de fondo.'); return; }
      var sw = sampleOpt || client2world(clientX, clientY); lastSample=sw;
      loadBgPixels(bg.url, function(rec, err){
        if(!rec){ alert(err==='cors' ? 'El navegador no deja leer esta imagen para detectar (seguridad del navegador). Vuelve a subir el plano en esta sesión y detecta sin recargar la página.' : 'No se pudo cargar el plano.'); return; }
        var res=detectFromPixels(rec, bg, sw, detectTol);
        if(res.err==='outside'){ alert('Pincha DENTRO del plano subido, sobre un asiento.'); return; }
        if(res.err==='toobig'){ alert('Parece que has pinchado el fondo, no un asiento. Pincha justo en el centro de un asiento.'); return; }
        if(!res.pts || !res.pts.length){ alert('No se detectaron asientos parecidos. Pincha en el centro de un asiento y prueba a subir la sensibilidad.'); return; }
        pushUndo('detect');
        buildSectorsFromPoints(res.pts, res.sizeWorld);
        selId=null; invalidate(); markSummary(); renderSide(); fitAll();
      });
    }
    // «Crear plano según la imagen» EN UN CLIC: busca solo los colores de asiento dominantes de la
    // imagen (saturados, ni fondo ni líneas grises), detecta las butacas de cada color y las agrupa
    // en sectores por contigüidad. Sin pinchar ejemplo; si no encuentra nada, queda la detección manual.
    function runAutoPlan(){
      var bg=elements.find(function(x){return x.type==='bgimage' && x.url;});
      if(!bg){ alert('Primero sube un plano de fondo.'); return; }
      loadBgPixels(bg.url, function(rec, err){
        if(!rec){ alert(err==='cors' ? 'El navegador no deja leer esta imagen (seguridad del navegador). Vuelve a subirla en esta sesión y prueba sin recargar.' : 'No se pudo cargar el plano.'); return; }
        var D=rec.data, W=rec.w, H=rec.h, hist={};
        var step=Math.max(1, Math.round(Math.sqrt((W*H)/400000)));
        for(var y=0;y<H;y+=step){ for(var x=0;x<W;x+=step){
          var i4=(y*W+x)*4, r=D[i4], g=D[i4+1], b=D[i4+2], a=D[i4+3];
          if(a<200) continue;
          var mx=Math.max(r,g,b), mn=Math.min(r,g,b);
          if(mx<50) continue;              // negro: líneas y textos
          // Los NEUTROS (grises y blancos) también pueden ser butacas: puntitos grises de arena o
          // celdas blancas con borde. Se prueban con tolerancia corta; los fondos/calles se
          // descartan solos porque su blob de muestra sale gigante ('toobig').
          var neutral = (mx-mn) < 28;
          var key=((r>>4)<<8)|((g>>4)<<4)|(b>>4);
          var h0=(hist[key]=hist[key]||{n:0, neutral:neutral, s:[]});
          h0.n++;
          // Hasta 3 píxeles de muestra REPARTIDOS por la imagen: si uno cae en un borde o en el
          // fondo del mismo color, se reintenta con el siguiente.
          if(h0.s.length<1) h0.s.push({x:x, y:y});
          else if(h0.s.length<2 && (h0.n%37)===0) h0.s.push({x:x, y:y});
          else if(h0.s.length<3 && (h0.n%101)===0) h0.s.push({x:x, y:y});
        }}
        var all=Object.keys(hist).map(function(k){ return hist[k]; }).sort(function(p,q){ return q.n-p.n; });
        var cands=all.filter(function(c){ return !c.neutral; }).slice(0, 8)
                     .concat(all.filter(function(c){ return c.neutral; }).slice(0, 4));
        if(!cands.length){ alert('No se han encontrado colores de asiento en la imagen. Usa la detección manual (pincha un asiento de ejemplo).'); return; }
        pushUndo('autoplan');
        // Rejilla de lo ya creado (evita duplicar butacas entre pasadas de colores parecidos).
        var placedGrid={}, PCELL=16, madeTotal=0;
        function markPlaced(p){ var k=Math.round(p.x/PCELL)+','+Math.round(p.y/PCELL); (placedGrid[k]=placedGrid[k]||[]).push(p); }
        function farFromPlaced(p, d){
          var gx=Math.round(p.x/PCELL), gy=Math.round(p.y/PCELL), r0=Math.max(1, Math.ceil(d/PCELL));
          for(var dx=-r0;dx<=r0;dx++) for(var dy=-r0;dy<=r0;dy++){
            var arr=placedGrid[(gx+dx)+','+(gy+dy)];
            if(!arr) continue;
            for(var i=0;i<arr.length;i++){ if(Math.hypot(arr[i].x-p.x, arr[i].y-p.y) < d) return false; }
          }
          return true;
        }
        // Sembrar con las butacas YA existentes: los sectores nuevos no se montan sobre ellas.
        sections.forEach(function(sE){
          if(sE.kind==='floor') return;
          secRows(sE).rows.forEach(function(rw){ rw.seats.forEach(function(p){
            if(p.state!=='stair') markPlaced({x:p.x, y:p.y});
          }); });
        });
        var domSizeW=null;   // tamaño de butaca del PRIMER color aceptado (el mayoritario = butacas)
        cands.forEach(function(cd){
          // Saturados: tolerancia normal. Neutros: corta, para que el blanco/gris de la butaca no
          // se funda con el fondo claro que la rodea (el borde/hueco hace de frontera).
          var tol = cd.neutral ? 40 : Math.max(detectTol, 60);
          var res=null;
          for(var siN=0; siN<cd.s.length && !res; siN++){
            var rTry=detectFromPixels(rec, bg, bgPxToWorld(bg, cd.s[siN].x, cd.s[siN].y, W, H), tol);
            if(!rTry.err && rTry.pts && rTry.pts.length>=6) res=rTry;
          }
          if(!res) return;
          var fresh=res.pts.filter(function(p){ return farFromPlaced(p, res.sizeWorld*0.8); });
          if(fresh.length<6) return;
          // Coherencia de TAMAÑO entre colores: los rótulos (números de fila, letras, símbolos)
          // forman su propio color con blobs más pequeños que las butacas ya aceptadas → fuera.
          // Si son MUCHOS, puede ser una zona real con butacas de otro tamaño: se pregunta.
          if(domSizeW && (res.sizeWorld < domSizeW*0.55 || res.sizeWorld > domSizeW*1.9)){
            if(!(fresh.length>=20 && window.confirm('Se han detectado ' + fresh.length + ' elementos de un tamaño distinto al de las butacas (podrían ser números/letras del plano o una zona con butacas más pequeñas). ¿Añadirlos como butacas?'))) return;
          }
          buildSectorsFromPoints(fresh, res.sizeWorld);
          if(domSizeW==null) domSizeW=res.sizeWorld;
          fresh.forEach(markPlaced);
          madeTotal+=fresh.length;
        });
        if(!madeTotal){ undo(); alert('No se han podido detectar asientos automáticamente. Prueba la detección manual: pincha en el CENTRO de un asiento de ejemplo del plano.'); return; }
        selId=null; dsel={}; dselO={};
        invalidate(); markSummary(); renderSide(); fitAll();
      });
    }

    /* ================= Plantillas ================= */
    function tplPlaza(){
      // Plaza de toros: ruedo circular completo de tendidos alrededor de la pista.
      var i, n=11, step=28, start=-140;
      for(i=0;i<n;i++) sections.push({id:nid('s'), kind:'arc', name:'Tendido '+(i+1), cx:0, cy:0, r0:950, span:24, dir:start+i*step, rows:10, rowGap:30, pitch:26});
      sections.push({id:nid('s'), kind:'floor', name:'Ruedo', x:60, y:0, w:540, h:640, rot:0, cap:2000});
      elements.push({id:nid('e'), type:'outline', label:'', x:0, y:0, w:3600, h:3200, corner:100, rot:0});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:-810, y:0, w:220, h:560, rot:0});
      elements.push({id:nid('e'), type:'mix', label:'MIX', x:390, y:0, w:110, h:110, rot:0});
    }
    function tplArena(){
      // Arena RECTANGULAR: gradas rectas en 3 lados (los dos largos + el ancho del fondo);
      // el escenario ocupa el otro lado ancho y la pista queda en el centro.
      sections.push({id:nid('s'), kind:'grid', name:'Grada Norte', x:-100, y:-760, rot:0,   rows:10, cols:44, pitch:26, rowGap:30});
      sections.push({id:nid('s'), kind:'grid', name:'Grada Sur',   x:-100, y:760,  rot:0,   rows:10, cols:44, pitch:26, rowGap:30});
      sections.push({id:nid('s'), kind:'grid', name:'Grada Fondo', x:900,  y:0,    rot:90,  rows:10, cols:30, pitch:26, rowGap:30});
      sections.push({id:nid('s'), kind:'floor', name:'Pista', x:-150, y:0, w:1150, h:820, rot:0, cap:3000});
      elements.push({id:nid('e'), type:'outline', label:'', x:0, y:0, w:3100, h:2300, corner:22, rot:0});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:-1060, y:0, w:220, h:620, rot:0});
      elements.push({id:nid('e'), type:'mix', label:'MIX', x:310, y:0, w:110, h:110, rot:0});
    }
    function tplTeatro(){
      sections.push({id:nid('s'), kind:'arc', name:'Patio de butacas', cx:0, cy:-620, r0:640, span:78, dir:90, rows:16, rowGap:32, pitch:26, rowScheme:'alpha'});
      sections.push({id:nid('s'), kind:'arc', name:'Anfiteatro', cx:0, cy:-620, r0:1220, span:86, dir:90, rows:8, rowGap:32, pitch:26, rowScheme:'alpha'});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:0, y:-780, w:640, h:240, rot:90});
    }

    /* ================= Acciones del panel ================= */
    if(side) side.addEventListener('input', function(e){
      if(e.target.hasAttribute('data-bg-op')){
        var bg0=elements.find(function(x){return x.type==='bgimage';});
        if(bg0){ bg0.opacity = Math.max(.1, Math.min(1, (parseInt(e.target.value,10)||60)/100)); queueRender(); }
        return;
      }
      var p = e.target.dataset.p; if(!p) return;
      var o = sections.find(function(x){return x.id===selId;}) || elements.find(function(x){return x.id===selId;});
      if(!o) return;
      pushUndo('param:'+selId+':'+p);   // una entrada por gesto de slider/campo (coalescida)
      if(p==='num_start'||p==='num_mode'||p==='num_dir'){
        o.num = o.num || {};
        if(p==='num_start'){ var v0=parseInt(e.target.value,10); o.num.start = isNaN(v0)?1:v0; }  // 0 es válido
        else if(p==='num_mode'){ o.num.mode = e.target.value; o.num.step = (e.target.value==='seq'?1:2); }
        else o.num.dir = e.target.value;
      } else if(p==='rowSchemeDir'){
        // Un solo selector para dos campos: esquema (números/letras) + sentido de las etiquetas
        // (rowDir 'desc' = la fila rowStart es la de abajo del dibujo).
        var vRS = e.target.value;
        o.rowScheme = (vRS.indexOf('alpha')===0) ? 'alpha' : 'num';
        if(vRS.indexOf('_desc')!==-1) o.rowDir = 'desc'; else delete o.rowDir;
      } else if(p==='rowScheme' || p==='gapPolicy'){
        o[p] = e.target.value;
      } else if(e.target.type==='range' || e.target.type==='number'){
        var vNum = parseFloat(e.target.value);
        if(isNaN(vNum)) return;   // campo a medio escribir: no aplicar todavía
        o[p] = vNum;
      } else {
        o[p] = e.target.value;
      }
      // Slider y campo numérico van EN PAREJA: mover uno actualiza el otro.
      var twin = e.target.parentElement && e.target.parentElement.querySelector(
        e.target.type==='range' ? 'input[type="number"][data-p]' : 'input[type="range"][data-p]');
      if(twin && twin!==e.target) twin.value = e.target.value;
      if(o.kind) invalidate(o.id);
      // (Los sliders del escenario no tocan su posición x/y, que es lo único que cambia la
      // orientación de las butacas: solo el ARRASTRE del escenario invalida toda la caché.)
      queueRender();
    });

    // ---- Plano de fondo: subir imagen, bloquear, quitar ----
    function pickAndUploadBg(){
      if(!bgUploadUrl){ alert('No disponible.'); return; }
      var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.style.display='none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function(){
        var f=inp.files && inp.files[0]; inp.remove(); if(!f) return;
        var fd=new FormData(); fd.append('image', f);
        // El loader global aparece solo en fetch >300 ms (layout.html); no hay que gestionarlo aquí.
        fetch(bgUploadUrl, {method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, body: fd})
          .then(function(res){ return res.json().then(function(j){ return {ok:res.ok, j:j}; }); })
          .then(function(r){
            if(!(r.ok && r.j.ok && r.j.url)){ alert((r.j && r.j.error) || 'No se pudo subir el plano.'); return; }
            var img=new Image();
            img.onload=function(){
              var ar=(img.naturalWidth||4)/(img.naturalHeight||3);
              var cc=contentCenter() || {x:view.x+view.w/2, y:view.y+view.h/2};
              var W=1600, H=Math.round(W/(ar||1.333));
              pushUndo('bg');
              var ex=elements.find(function(x){return x.type==='bgimage';});
              if(ex){ ex.url=r.j.url; }   // «Cambiar»: conserva posición/tamaño/opacidad
              else { elements.push({id:'bgimg', type:'bgimage', url:r.j.url, x:cc.x, y:cc.y, w:W, h:H, rot:0, opacity:0.6, locked:false}); }
              renderSide(); queueRender();
            };
            img.onerror=function(){ alert('La imagen se subió pero no se pudo cargar.'); };
            img.src=r.j.url;
          })
          .catch(function(){ alert('No se pudo subir el plano.'); });
      });
      inp.click();
    }

    // ---- IMPORTAR bloques de butacas desde un Excel (plano «dibujado» en celdas) ----
    // El servidor (seatmap_import.py) parsea el libro y devuelve BLOQUES neutros: rejilla con
    // huecos (celdas en blanco), pasillos entre filas (filas vacías), numeración por fila donde
    // el patrón aritmético encaja y el número EXACTO por butaca donde no. Aquí se convierten en
    // secciones `grid` y se colocan conservando la composición de cada hoja (misma escala y
    // posiciones relativas). Se puede repetir: cada importación AÑADE bloques debajo de lo que
    // haya, seleccionados y listos para arrastrar/girar hasta completar el recinto.
    function pickAndImportXlsx(){
      if(!importUrl){ alert('No disponible.'); return; }
      var inp=document.createElement('input'); inp.type='file';
      inp.accept='.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      inp.style.display='none';
      document.body.appendChild(inp);
      inp.addEventListener('change', function(){
        var f=inp.files && inp.files[0]; inp.remove(); if(!f) return;
        var fd=new FormData(); fd.append('file', f);
        // El loader global aparece solo en fetch >300 ms (layout.html); no hay que gestionarlo aquí.
        fetch(importUrl, {method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, body: fd})
          .then(function(res){ return res.json().then(function(j){ return {ok:res.ok, j:j}; }); })
          .then(function(r){
            if(!(r.ok && r.j.ok && (r.j.sheets||[]).length)){ alert((r.j && r.j.error) || 'No se pudo importar el archivo.'); return; }
            applyImportedPlan(r.j);
          })
          .catch(function(){ alert('No se pudo importar el archivo.'); });
      });
      inp.click();
    }
    function applyImportedPlan(plan){
      var p = prevailingPitch();
      var rg = Math.max(8, Math.round(p*30/26));   // misma proporción butaca/fila que el 26/30 de siempre
      pushUndo('importxlsx');
      var bb = contentBounds();
      var ox = bb ? bb.mx : 0;
      var oy = bb ? (bb.My + 4*rg) : 0;            // debajo de lo que ya haya en el plano
      var newIds = [], nBlocks = 0, nSeats = 0, prefixes = {};
      (plan.sheets||[]).forEach(function(sh){
        var items = sh.blocks || [], labels = sh.labels || [];
        if(!items.length && !labels.length) return;
        var r0=Infinity, rMax=-Infinity, c0=Infinity;
        items.forEach(function(b){ r0=Math.min(r0,b.row_span[0]); rMax=Math.max(rMax,b.row_span[1]); c0=Math.min(c0,b.col_span[0]); });
        labels.forEach(function(lb){ r0=Math.min(r0,lb.row_span[0]); rMax=Math.max(rMax,lb.row_span[1]); c0=Math.min(c0,lb.col_span[0]); });
        function colX(c){ return ox + (c - c0)*p; }
        function rowY(r){ return oy + (r - r0)*rg; }
        items.forEach(function(b){
          var sec = {id:nid('s'), kind:'grid', name:(b.name||'Grada'), rot:0,
                     rows:b.rows, cols:b.cols, pitch:p, rowGap:rg,
                     x: colX(b.col_span[0]) + (b.cols-1)/2*p,
                     y: rowY(b.row_span[0]) + (b.rows-1)/2*rg,
                     num: b.num || {start:1, mode:'seq', dir:'ltr'},
                     gapPolicy: b.gap_policy || 'skip',
                     rowScheme: b.row_scheme || 'num',
                     rowStart: (b.row_start!=null ? b.row_start : 1)};
          sec.num.step = (sec.num.mode==='seq' ? 1 : 2);
          if(b.alias) sec.aliases = b.alias;
          if(b.row_dir==='desc') sec.rowDir = 'desc';
          if(b.row_nums && Object.keys(b.row_nums).length) sec.rowNums = b.row_nums;
          if(b.num_overrides && Object.keys(b.num_overrides).length) sec.numOverrides = b.num_overrides;
          if(b.gaps && Object.keys(b.gaps).length){
            sec.mods = {};
            Object.keys(b.gaps).forEach(function(ri){ sec.mods[ri] = {gaps: b.gaps[ri]}; });
          }
          if(b.row_seps && b.row_seps.length) sec.rowSeps = b.row_seps.slice();
          if(b.row_prefix) prefixes[b.row_prefix] = 1;
          sections.push(sec); newIds.push(sec.id);
          nBlocks++; nSeats += (b.seat_count||0);
        });
        // Zonas etiquetadas SIN butacas del plano (p. ej. «PALCO VIP»): entran como rectángulo
        // con su nombre (zona de pie con aforo 0) para verlas y sustituirlas por lo que toque.
        labels.forEach(function(lb){
          var secL = {id:nid('s'), kind:'floor', name:(lb.text||'Zona'), rot:0, cap:0,
                      x:(colX(lb.col_span[0])+colX(lb.col_span[1]))/2,
                      y:(rowY(lb.row_span[0])+rowY(lb.row_span[1]))/2,
                      w:(lb.col_span[1]-lb.col_span[0]+1)*p,
                      h:(lb.row_span[1]-lb.row_span[0]+1)*rg};
          sections.push(secL); newIds.push(secL.id);
        });
        oy = rowY(rMax) + 5*rg;   // la siguiente hoja, debajo de esta
      });
      // Lo importado queda SELECCIONADO: se ve resaltado y se puede mover en grupo.
      dsel = {}; sel = {}; selId = null; dselO = {};
      newIds.forEach(function(id){ dselO[id] = 1; });
      invalidate(); markSummary(); renderSide(); fitAll();
      var msg = 'Importados '+nBlocks+' bloque(s) con '+nSeats.toLocaleString('es-ES')+' butacas.';
      var pfx = Object.keys(prefixes);
      if(pfx.length) msg += '\nLas filas del Excel llevaban prefijo «'+pfx.join('», «')+'» (F16 → fila 16): se guarda solo el número.';
      if((plan.warnings||[]).length){
        msg += '\n\nAvisos:\n· ' + plan.warnings.slice(0,8).join('\n· ');
        if(plan.warnings.length>8) msg += '\n· (+'+(plan.warnings.length-8)+' más)';
      }
      msg += '\n\nColoca y orienta los bloques (arrastrar / girar) y pulsa «Guardar mapa».';
      alert(msg);
    }

    // El MISMO handler sirve para el panel lateral y para la barra de añadir de arriba
    // (los botones comparten los data-add / data-arm-seat / data-tool…).
    var addbar = host.querySelector('[data-vm-addbar]');
    function designPanelClick(e){
      // Grupos desplegables de la barra (Pista/Servicios/Recinto): abrir/cerrar.
      var grpBtn = e.target.closest('[data-addgroup]');
      if(grpBtn){
        var grp=grpBtn.parentElement, was=grp.classList.contains('open');
        host.querySelectorAll('.vmap-addgroup.open').forEach(function(g){ g.classList.remove('open'); });
        if(!was) grp.classList.add('open');
        return;
      }
      host.querySelectorAll('.vmap-addgroup.open').forEach(function(g){ g.classList.remove('open'); });
      sideClickBody(e);
    }
    if(side) side.addEventListener('click', designPanelClick);
    if(addbar) addbar.addEventListener('click', designPanelClick);
    document.addEventListener('click', function(e){
      if(addbar && !addbar.contains(e.target)) host.querySelectorAll('.vmap-addgroup.open').forEach(function(g){ g.classList.remove('open'); });
    });
    function sideClickBody(e){
      if(e.target.closest('[data-vm-import]')){ pickAndImportXlsx(); return; }
      if(e.target.closest('[data-bg-upload]')){ pickAndUploadBg(); return; }
      if(e.target.closest('[data-bg-lock]')){ var b1=elements.find(function(x){return x.type==='bgimage';}); if(b1){ pushUndo('bglock'); b1.locked=!b1.locked; if(b1.locked && selId===b1.id) selId=null; renderSide(); queueRender(); } return; }
      if(e.target.closest('[data-bg-remove]')){ var b2=elements.find(function(x){return x.type==='bgimage';}); var i2=b2?elements.indexOf(b2):-1; if(i2>=0){ pushUndo('bgdel'); elements.splice(i2,1); if(selId===b2.id) selId=null; renderSide(); queueRender(); } return; }
      if(e.target.closest('[data-bg-auto]')){ runAutoPlan(); return; }
      if(e.target.closest('[data-bg-detect]')){ detectArm=!detectArm; if(detectArm) tool=null; setHint(); renderSide(); return; }
      if(e.target.closest('[data-bg-redetect]')){ if(lastSample) runDetect(null, null, lastSample); return; }
      var tpl=e.target.closest('[data-tpl]'), add=e.target.closest('[data-add]'), act=e.target.closest('[data-act]');
      var tch=e.target.closest('[data-tool]'), ctl=e.target.closest('[data-cat-tool]'), cat=e.target.closest('[data-cat]');
      var cxw=view.x+view.w/2, cyw=view.y+view.h/2;
      if(tpl){ pushUndo('tpl'); ({plaza: tplPlaza, arena: tplArena, teatro: tplTeatro}[tpl.dataset.tpl] || tplArena)(); selId=null; invalidate(); renderSide(); fitAll(); return; }
      var catDel = e.target.closest('[data-cat-del]');
      if(catDel){
        // Eliminar la categoría: sus butacas quedan sin asignar. Con Deshacer.
        var cidDel = catDel.dataset.catDel;
        pushUndo('cat-del');
        cats = cats.filter(function(c){ return c.id!==cidDel; }); delete catById[cidDel];
        Object.keys(assign).forEach(function(k){ if(assign[k]===cidDel) delete assign[k]; });
        Object.keys(floorCat).forEach(function(k){ if(floorCat[k]===cidDel) delete floorCat[k]; });
        if(activeCat===cidDel) activeCat = cats.length ? cats[0].id : null;
        markSummary(); renderSide(); return;
      }
      if(tch){
        if(tch.dataset.suppressClick){ delete tch.dataset.suppressClick; return; }   // acaba de arrastrarse
        var tkC = tch.dataset.tool;
        // Con butacas SELECCIONADAS: pinchar el elemento las convierte TODAS en él (sin toggle).
        if(mode==='design' && (tkC==='gap' || tkC==='off' || tkC==='stair') && dselKeys().length){
          pushUndo('tool-sel');
          dselKeys().forEach(function(k){
            var pp=k.split('|'); var s2=sections.find(function(x){return x.id===pp[0];});
            if(!s2 || s2.kind==='floor') return;
            var mr=(s2.mods=s2.mods||{})[pp[1]]=(s2.mods[pp[1]]||{gaps:[],off:[]});
            mr.gaps=mr.gaps||[]; mr.off=mr.off||[]; mr.stairs=mr.stairs||[];
            var sl=+pp[2];
            [mr.gaps, mr.off, mr.stairs].forEach(function(a){ var i2=a.indexOf(sl); if(i2!==-1) a.splice(i2,1); });
            (tkC==='gap'?mr.gaps:(tkC==='off'?mr.off:mr.stairs)).push(sl);
            delete assign[k];
            invalidate(s2.id);
          });
          dsel={}; markSummary(); renderSide(); queueRender(); return;
        }
        // Con butacas seleccionadas, pinchar PASILLO abre un tramo bajo cada una (solo en esas
        // columnas): seleccionar un trozo de fila + Pasillo = vomitorio parcial de una vez.
        if(mode==='design' && tkC==='rowsep' && dselKeys().length){
          pushUndo('tool-sel');
          dselKeys().forEach(function(k){
            var pp=k.split('|'); var s2=sections.find(function(x){return x.id===pp[0];});
            if(!s2 || s2.kind==='floor' || s2.kind==='points') return;
            var rI2=Math.min(parseInt(pp[1],10), Math.max(1, (s2.rows|0)-1));
            addRowSepSegment(s2, rI2, +pp[2]);
            invalidate(s2.id);
          });
          dsel={}; markSummary(); renderSide(); queueRender(); return;
        }
        tool = (tool===tkC) ? null : tkC; if(tool==='select'){ seatArm=false; drawArm=false; } setHint(); renderSide(); queueRender(); return;
      }
      if(ctl){ catTool = ctl.dataset.catTool; if(catTool!=='select') clearSel(); renderSide(); return; }
      if(cat){
        activeCat = cat.dataset.cat;
        // Con selección activa, pinchar una categoría ASIGNA la selección (equivale a soltar la tarjeta).
        if(catTool==='select' && selCount()) assignSelectionTo(activeCat);
        renderSide(); return;
      }
      if(e.target.closest('[data-nc-add]')){
        var nmI=side.querySelector('[data-nc-name]'), colI=side.querySelector('[data-nc-color]'), warn=side.querySelector('[data-nc-warn]');
        var nm2=(nmI.value||'').trim(), col2=colI.value;
        if(!nm2) return;
        var clash = cats.some(function(c){ var a=parseInt(c.color.slice(1),16), b=parseInt(col2.slice(1),16);
          var dr=((a>>16)&255)-((b>>16)&255), dg=((a>>8)&255)-((b>>8)&255), db2=(a&255)-(b&255);
          return (dr*dr+dg*dg+db2*db2) < 3600; });
        warn.style.display = clash?'block':'none';
        if(clash) return;
        pushUndo('newcat');
        var id='c'+(nextId+=1);
        var nc={id:id, name:nm2, color:col2, kind:'otros'}; cats.push(nc); catById[id]=nc; activeCat=id; renderSide(); return;
      }
      if(add && add.dataset.add==='draw'){ drawArm = !drawArm; if(drawArm){ seatArm=false; tool=null; } setHint(); renderSide(); return; }
      if(e.target.closest('[data-arm-seat]')){ seatArm = !seatArm; if(seatArm){ drawArm=false; tool=null; detectArm=false; } setHint(); renderSide(); return; }
      var grp=e.target.closest('[data-group]'); if(grp){ groupSelectedSeats(grp.getAttribute('data-group')); return; }
      if(e.target.closest('[data-del-multi]')){ deleteSelected(); return; }
      if(add){
        pushUndo('add');
        var kind = add.dataset.add;
        // Escala PROPORCIONAL al plano: las piezas nuevas se crean al paso predominante (así lo
        // añadido casa con lo generado desde la imagen). f = factor sobre los tamaños de siempre.
        var ppA = prevailingPitch(), fA = ppA/26;
        function scA(v){ return Math.round(v*fA); }
        if(kind==='arc'){ sections.push({id:nid('s'), kind:'arc', name:'Sector nuevo', cx:cxw, cy:cyw+scA(900), r0:scA(900), span:24, dir:-90, rows:8, rowGap:scA(30), pitch:ppA}); }
        else if(kind==='grid'){ sections.push({id:nid('s'), kind:'grid', name:'Grada nueva', x:cxw, y:cyw, rot:0, rows:8, cols:14, pitch:ppA, rowGap:scA(30)}); }
        else if(kind==='box'){ sections.push({id:nid('s'), kind:'box', name:'Palco 1', x:cxw, y:cyw, rot:0, rows:2, cols:4, pitch:ppA, rowGap:scA(30)}); }
        else if(kind==='floor'){ sections.push({id:nid('s'), kind:'floor', name:'Zona de pie', x:cxw, y:cyw, w:scA(400), h:scA(300), rot:0, cap:500}); }
        else {
          var defs={ stage:['ESCENARIO',220,520], mix:['MIX',110,110], delay:['DELAY',95,95], pmr:['PLATAFORMA PMR',420,64],
                     stair:['Escalera',60,120], rail:['Barandilla',420,8], catwalk:['PASARELA',420,90], pit:['FOSO FOTÓGRAFOS',420,70],
                     wc:['WC',150,80], wc_pmr:['WC ♿',190,80], merch:['MERCH',230,80], bar:['BARRA',260,70],
                     door:['Puerta 1',0,0], outline:['',3200,2800] };
          var d=defs[kind]||['Elemento',200,100];
          var ne={id:nid('e'), type:kind, label:d[0], x:cxw, y:cyw, w:scA(d[1]), h:scA(d[2]), rot:0};
          if(kind==='outline') ne.corner=70;
          elements.push(ne);
          if(kind==='stage') invalidate();   // añadir escenario reorienta TODAS las butacas
        }
        // Lo añadido NO se queda marcado (solo las butacas sueltas mantienen su flujo de ir pinchando).
        selId=null;
        renderSide(); markSummary(); queueRender(); return;
      }
      if(act && act.dataset.act==='unlink'){
        var sU=sections.find(function(x){return x.id===selId;});
        if(sU && sU.linkGroup){
          pushUndo('unlink');
          var lg=sU.linkGroup; delete sU.linkGroup;
          // Si el grupo queda con UNA sola grada, deja de ser grupo.
          var rest=sections.filter(function(x){return x.linkGroup===lg;});
          if(rest.length===1) delete rest[0].linkGroup;
          renderSide(); markSummary();
        }
        return;
      }
      if(act && (act.dataset.act==='front' || act.dataset.act==='back')){ reorderSelected(act.dataset.act); return; }
      if(act && act.dataset.act==='del'){ deleteSelected(); return; }
      if(act && act.dataset.act==='dup'){
        var o2=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        if(!o2) return;
        pushUndo('dup');
        var c3=JSON.parse(JSON.stringify(o2)); c3.id=nid(o2.kind?'s':'e');
        if(c3.kind==='arc'){ c3.dir=(c3.dir||0)+(c3.span||24)+4; } else { c3.x=(c3.x||c3.cx||0)+120; c3.y=(c3.y||0)+60; }
        if(c3.name) c3.name=c3.name+' (copia)';
        (o2.kind?sections:elements).push(c3); selId=c3.id;
        if(c3.type==='stage') invalidate();   // un segundo escenario también cambia orientaciones
        renderSide(); markSummary(); return;
      }
      if(act && act.dataset.act==='ring'){
        var base=sections.find(function(x){return x.id===selId;});
        if(!base || base.kind!=='arc') return;
        pushUndo('ring');
        var nEl=side.querySelector('[data-ring-n]');
        var n2=Math.max(2, Math.min(40, parseInt(nEl && nEl.value || '12',10)||12));
        var stepDeg=360/n2;
        var m=(base.name||'Sector 1').match(/^(.*?)(\d+)\s*$/); var pref=m?m[1]:(base.name||'Sector ')+' '; var num0=m?parseInt(m[2],10):1; var pad=m?m[2].length:0;
        for(var k3=1;k3<n2;k3++){
          var c4=JSON.parse(JSON.stringify(base)); c4.id=nid('s'); c4.dir=(base.dir||0)+k3*stepDeg;
          // Las copias del anillo nacen SIN los retoques del sector base (huecos/apagadas y
          // escaleras integradas son propios de cada sector; copiarlos falseaba el aforo).
          delete c4.mods; delete c4.stairs;
          var numk=String(num0+k3); while(pad && numk.length<pad) numk='0'+numk;
          c4.name=pref+numk;
          sections.push(c4);
        }
        renderSide(); queueRender(); return;
      }
    }

    /* ================= Orden de apilado (Al frente / Al fondo) =================
       Las piezas se pintan en el orden de su lista: la última queda ENCIMA. Así un sector de
       asientos puede superponerse a los huecos de otro para que visualmente todo cuadre. */
    function reorderSelected(where){
      if(!selId) return;
      var arr = sections.some(function(x){return x.id===selId;}) ? sections : elements;
      var idx = arr.findIndex(function(x){return x.id===selId;});
      if(idx===-1) return;
      pushUndo('order');
      var obj = arr.splice(idx,1)[0];
      if(where==='front') arr.push(obj); else arr.unshift(obj);
      queueRender();
    }

    /* ================= Borrar la selección (botón Eliminar o tecla Supr) ================= */
    function deleteSelected(){
      // Selección MÚLTIPLE: borra TODO lo seleccionado a la vez — butacas sueltas (se eliminan),
      // butacas de GRADA paramétrica (se convierten en HUECO, la grada es filas×columnas) y
      // elementos/sectores marcados como objeto (se eliminan enteros).
      var dkAll=dselKeys(), dko=dselOkeys();
      var dk=[], gapBySec={};
      dkAll.forEach(function(k){
        var scD=sections.find(function(x){return x.id===k.split('|')[0];});
        if(!scD) return;
        if(scD.kind==='points') dk.push(k);
        else if(scD.kind!=='floor'){ var pp=k.split('|'); (gapBySec[pp[0]]=gapBySec[pp[0]]||[]).push({row:+pp[1], slot:+pp[2]}); }
      });
      var nGapSecs=Object.keys(gapBySec).length;
      if(dk.length || dko.length || nGapSecs){
        pushUndo('del-multi');
        var bySec={}; dk.forEach(function(k){ var pp=k.split('|'); (bySec[pp[0]]=bySec[pp[0]]||{})[(+pp[1])+'|'+(+pp[2])]=1; delete assign[k]; });
        Object.keys(bySec).forEach(function(secId){
          var sc=sections.find(function(x){return x.id===secId;});
          if(sc && sc.seats){ sc.seats=sc.seats.filter(function(t){ return !bySec[secId][(+t.row)+'|'+(+t.slot)]; });
            if(sc.loose && !sc.seats.length && dko.indexOf(sc.id)<0) dko.push(sc.id); invalidate(sc.id); }
        });
        // Butacas de GRADA: «eliminar» = ponerlas como HUECO (y liberar su asignación). Si con
        // ello una columna o fila queda VACÍA entera, desaparece y el sector se ajusta.
        Object.keys(gapBySec).forEach(function(secId){
          var sc=sections.find(function(x){return x.id===secId;}); if(!sc) return;
          sc.mods = sc.mods || {};
          gapBySec[secId].forEach(function(o){
            var m = sc.mods[String(o.row)] = sc.mods[String(o.row)] || {gaps:[], off:[]};
            m.gaps = m.gaps || []; m.off = m.off || [];
            if(m.gaps.indexOf(o.slot)===-1) m.gaps.push(o.slot);
            var oi=m.off.indexOf(o.slot); if(oi>=0) m.off.splice(oi,1);
            delete assign[secId+'|'+o.row+'|'+o.slot];
          });
          compactGridSection(sc);
          invalidate(sc.id);
        });
        if(dko.length){
          dko.forEach(function(id){ Object.keys(assign).forEach(function(k){ if(k.indexOf(id+'|')===0) delete assign[k]; }); delete floorCat[id]; });
          sections=sections.filter(function(x){return dko.indexOf(x.id)<0;});
          elements=elements.filter(function(x){return dko.indexOf(x.id)<0;});
          invalidate();
        }
        dsel={}; dselO={}; selId=null; renderSide(); markSummary(); return;
      }
      if(!selId) return;
      pushUndo('del');
      var delWasStage = elements.some(function(x){ return x.id===selId && x.type==='stage'; });
      sections=sections.filter(function(x){return x.id!==selId;}); elements=elements.filter(function(x){return x.id!==selId;});
      Object.keys(assign).forEach(function(k){ if(k.indexOf(selId+'|')===0) delete assign[k]; }); delete floorCat[selId];
      if(delWasStage) invalidate(); else invalidate(selId);
      selId=null; renderSide(); markSummary();
    }
    /* ================= Copiar / pegar (Ctrl+C/V y botón derecho) ================= */
    var clipboard = null;      // {kind:'section'|'element', data:{...}} — portapapeles interno del mapa
    var lastPtr = null;        // última posición del puntero en coordenadas de MUNDO (para pegar ahí)
    function copySelected(){
      if(!selId) return false;
      var o = sections.find(function(x){return x.id===selId;});
      if(o){ clipboard={kind:'section', data:JSON.parse(JSON.stringify(o))}; return true; }
      var el2 = elements.find(function(x){return x.id===selId;});
      if(el2){ clipboard={kind:'element', data:JSON.parse(JSON.stringify(el2))}; return true; }
      return false;
    }
    function pasteClipboard(atW){
      if(!clipboard) return;
      pushUndo('paste');
      var c = JSON.parse(JSON.stringify(clipboard.data));
      c.id = nid(clipboard.kind==='section' ? 's' : 'e');
      var px2 = atW || lastPtr || {x:view.x+view.w/2, y:view.y+view.h/2};
      if(c.kind==='arc'){
        // El arco se pega desplazando su centro para que el CENTRO DEL SECTOR caiga en el puntero.
        var rMid = c.r0 + (c.rows-1)*c.rowGap/2, mid=(c.dir)*R;
        var curX = c.cx + rMid*Math.cos(mid), curY = c.cy + rMid*Math.sin(mid);
        c.cx += px2.x-curX; c.cy += px2.y-curY;
      } else { c.x = px2.x; c.y = px2.y; }
      (clipboard.kind==='section' ? sections : elements).push(c);
      selId = c.id;
      if(c.type==='stage') invalidate();
      renderSide(); markSummary();
    }
    if(canEdit){
      var ub = undoBtn();
      if(ub) ub.addEventListener('click', function(){ undo(); });
      document.addEventListener('keydown', function(e){
        if(!document.body.contains(host)) return;
        var a = document.activeElement;
        if(a && (a.tagName==='INPUT' || a.tagName==='TEXTAREA' || a.tagName==='SELECT' || a.isContentEditable)) return;
        // Esc sale del modo maximizado propio (el fullscreen nativo ya lo hace el navegador).
        if(e.key==='Escape' && host.classList.contains('vmap-max')){ e.preventDefault(); _fsMaxExit(); return; }
        // Barra espaciadora mantenida = MANO (desplazarse sin tocar piezas); solo bloquea el
        // scroll de la página cuando el puntero está sobre el plano.
        if(e.key===' ' || e.code==='Space'){ spaceHeld=true; svg.classList.add('vmap-hand'); if(overCanvas) e.preventDefault(); return; }
        if((e.key==='z' || e.key==='Z') && (e.ctrlKey || e.metaKey)){ e.preventDefault(); undo(); return; }
        if((e.key==='c' || e.key==='C') && (e.ctrlKey || e.metaKey)){ if(mode==='design' && copySelected()) e.preventDefault(); return; }
        if((e.key==='v' || e.key==='V') && (e.ctrlKey || e.metaKey)){ if(mode==='design' && clipboard){ e.preventDefault(); pasteClipboard(); } return; }
        if((e.key==='Delete' || e.key==='Backspace') && mode==='design' && (selId || dselKeys().length || dselOkeys().length)){ e.preventDefault(); deleteSelected(); }
      });
      // Menú contextual (botón derecho / pulsación larga del trackpad): Copiar / Pegar / Duplicar / Eliminar.
      var ctx = document.createElement('div');
      ctx.className = 'vmap-ctx';
      host.querySelector('.vmap-canvas').appendChild(ctx);
      function hideCtx(){ ctx.style.display='none'; }
      document.addEventListener('pointerdown', function(ev){ if(!ctx.contains(ev.target)) hideCtx(); }, true);
      svg.addEventListener('contextmenu', function(ev){
        if(mode!=='design') return;
        ev.preventDefault();
        var secC = ev.target.closest('[data-sec]'), elC = ev.target.closest('[data-el]');
        var hitId = secC ? secC.getAttribute('data-sec') : (elC ? elC.getAttribute('data-el') : null);
        if(hitId){ selId = hitId; renderSide(); queueRender(); }
        lastPtr = client2world(ev.clientX, ev.clientY);
        var items = '';
        if(hitId){
          items += '<button type="button" data-ctx="copy"><i class="fa fa-copy fa-fw me-1"></i>Copiar</button>'+
                   '<button type="button" data-ctx="dup"><i class="fa fa-clone fa-fw me-1"></i>Duplicar</button>'+
                   '<button type="button" data-ctx="front"><i class="fa fa-arrow-up fa-fw me-1"></i>Traer al frente</button>'+
                   '<button type="button" data-ctx="back"><i class="fa fa-arrow-down fa-fw me-1"></i>Enviar al fondo</button>'+
                   '<button type="button" data-ctx="del" class="text-danger"><i class="fa fa-trash fa-fw me-1"></i>Eliminar</button>';
        }
        items += '<button type="button" data-ctx="paste"'+(clipboard?'':' disabled')+'><i class="fa fa-paste fa-fw me-1"></i>Pegar aquí</button>';
        ctx.innerHTML = items;
        var wrap = host.querySelector('.vmap-canvas').getBoundingClientRect();
        ctx.style.left = Math.min(ev.clientX-wrap.left, wrap.width-170)+'px';
        ctx.style.top = Math.min(ev.clientY-wrap.top, wrap.height-150)+'px';
        ctx.style.display = 'flex';
      });
      ctx.addEventListener('click', function(ev){
        var b = ev.target.closest('[data-ctx]'); if(!b) return;
        var act2 = b.getAttribute('data-ctx');
        hideCtx();
        if(act2==='copy'){ copySelected(); }
        else if(act2==='paste'){ pasteClipboard(lastPtr); }
        else if(act2==='del'){ deleteSelected(); }
        else if(act2==='front' || act2==='back'){ reorderSelected(act2); }
        else if(act2==='dup'){ if(copySelected()) pasteClipboard({x:(lastPtr?lastPtr.x:view.x+view.w/2)+120, y:(lastPtr?lastPtr.y:view.y+view.h/2)+60}); }
      });
    }

    /* ================= Herramientas ARRASTRABLES desde el panel =================
       Como en el editor de mapas de invitaciones: además de activar el chip y pinchar, puedes
       ARRASTRAR el elemento (Hueco/Apagada/Escalera/Pasillo/№) desde el panel hasta el plano —
       un fantasma sigue al puntero y se aplica donde lo sueltes (sobre una butaca, entre
       butacas, entre filas o en los bordes). El clic corto sigue activando el modo pincel. */
    // ¿Qué pasaría si soltara el retoque AQUÍ? Lo usan el arrastre (para PREVISUALIZAR el
    // destino) y la suelta (para actuar): sobre una butaca la REEMPLAZA; en cualquier otro punto
    // de una grada, inserta en la juntura más cercana (entre butacas, principio/final de fila,
    // arriba/abajo del sector: la grada CRECE por ahí).
    function resolveDropTarget(toolKey, cx, cy){
      var under = document.elementFromPoint(cx, cy);
      var seatB = under && under.closest ? under.closest('[data-seat]') : null;
      var stairB = under && under.closest ? under.closest('[data-stairband]') : null;
      var sgB = under && under.closest ? under.closest('[data-stairgroup]') : null;
      var sepB = under && under.closest ? under.closest('[data-rowsep]') : null;
      if(toolKey==='stair' && sgB) return {type:'stairgroup', el:sgB, label:'Quitar este tramo de escalera'};
      if(toolKey==='stair' && stairB) return {type:'stairband', el:stairB, label:'Quitar esta escalera'};
      if(toolKey==='rowsep' && sepB) return {type:'rowsepband', el:sepB, label:'Quitar este tramo de pasillo'};
      if(seatB) return {type:'seat', el:seatB, key:seatB.getAttribute('data-seat'),
                        label:({gap:'Hueco en esta butaca', off:'Apagar esta butaca', stair:'Escalera en esta butaca', renum:'Cambiar el número', rowsep:'Pasillo bajo esta butaca (solo este tramo)'})[toolKey]||''};
      var w=client2world(cx, cy);
      // PASILLO soltado ENTRE dos filas (sin butaca debajo): tramo en la juntura más cercana,
      // solo en la columna del punto — el resto de la grada sigue unido.
      if(toolKey==='rowsep'){
        var bestRS=null;
        sections.forEach(function(sG){
          if(sG.kind!=='grid' && sG.kind!=='box') return;
          var pG=sG.pitch||26, gG=sG.rowGap||30;
          var cr=Math.cos((sG.rot||0)*R), sr=Math.sin((sG.rot||0)*R);
          var dx=w.x-sG.x, dy=w.y-sG.y;
          var lx=dx*cr+dy*sr, ly=-dx*sr+dy*cr;
          var cols=sG.cols||1, rows=sG.rows||1;
          if(rows<2) return;
          var colF=lx/pG+(cols-1)/2, rowF=ly/gG+(rows-1)/2;
          if(colF<-0.5 || colF>cols-0.5 || rowF<0 || rowF>rows-1) return;
          var jR=Math.max(1, Math.min(rows-1, Math.round(rowF+0.5)));   // juntura más cercana
          var d=Math.abs(rowF-(jR-0.5));
          var slotRS=Math.max(1, Math.min(cols, Math.round(colF)+1));
          if(!bestRS || d<bestRS.d) bestRS={type:'rowsep-seg', sec:sG, row:jR, slot:slotRS, d:d, label:'Pasillo entre estas filas (solo este tramo)'};
        });
        if(bestRS) return bestRS;
      }
      if(toolKey==='gap' || toolKey==='off' || toolKey==='stair'){
        var best=null, MARGIN=2.2;
        sections.forEach(function(sG){
          if(sG.kind!=='grid' && sG.kind!=='box') return;
          var pG=sG.pitch||26, gG=sG.rowGap||30;
          var cr=Math.cos((sG.rot||0)*R), sr=Math.sin((sG.rot||0)*R);
          var dx=w.x-sG.x, dy=w.y-sG.y;
          var lx=dx*cr+dy*sr, ly=-dx*sr+dy*cr;
          var cols=sG.cols||1, rows=sG.rows||1;
          var colF=lx/pG+(cols-1)/2, rowF=ly/gG+(rows-1)/2;
          var inRows=(rowF>=-0.5 && rowF<=rows-0.5), inCols=(colF>=-0.5 && colF<=cols-0.5);
          var cand=null;
          if(inRows && colF<-0.5 && colF>=-MARGIN) cand={type:'insert-col', sec:sG, at:1, d:(-0.5-colF), label:'Ampliar la grada por la IZQUIERDA'};
          else if(inRows && colF>cols-0.5 && colF<=cols-1+MARGIN) cand={type:'insert-col', sec:sG, at:cols+1, d:(colF-(cols-0.5)), label:'Ampliar la grada por la DERECHA'};
          else if(inRows && inCols) cand={type:'insert-col', sec:sG, at:Math.max(1, Math.min(cols+1, Math.round(colF)+1)), d:0, label:'Añadir ENTRE butacas (se hacen sitio)'};
          else if(inCols && rowF<-0.5 && rowF>=-MARGIN) cand={type:'insert-row', sec:sG, at:1, d:(-0.5-rowF), label:'Ampliar la grada por ARRIBA'};
          else if(inCols && rowF>rows-0.5 && rowF<=rows-1+MARGIN) cand={type:'insert-row', sec:sG, at:rows+1, d:(rowF-(rows-0.5)), label:'Ampliar la grada por ABAJO'};
          if(cand && (!best || cand.d < best.d)) best=cand;
        });
        if(best) return best;
      }
      // Butaca MÁS CERCANA (bloques detectados y arcos), dentro de ~1.5 pasos.
      var bestK=null, bestD=Infinity, bestPit=26;
      sections.forEach(function(s){
        if(s.kind==='floor' || s.kind==='grid' || s.kind==='box') return;
        var bb=bboxOf(s), m=(s.pitch||26)*1.6;
        if(w.x<bb.x-m || w.y<bb.y-m || w.x>bb.x+bb.w+m || w.y>bb.y+bb.h+m) return;
        secRows(s).rows.forEach(function(rw){ rw.seats.forEach(function(pt){
          if(pt.state==='stair') return;
          var d=Math.hypot(pt.x-w.x, pt.y-w.y);
          if(d<bestD){ bestD=d; bestK=s.id+'|'+rw.rowIdx+'|'+pt.slot; bestPit=(s.pitch||26); }
        }); });
      });
      if(bestK && bestD<=bestPit*1.5){
        var el2=svg.querySelector('[data-seat="'+bestK.replace(/"/g,'\\"')+'"]');
        if(el2) return {type:'seat', el:el2, key:bestK, label:'Aplicar a la butaca más cercana'};
      }
      return null;
    }
    function dropToolAt(toolKey, cx, cy){
      var t = resolveDropTarget(toolKey, cx, cy);
      if(!t) return;
      var prevTool = tool; tool = toolKey;
      try {
        if(t.type==='stairgroup'){ var wSG=client2world(cx, cy); removeStairCellAt(t.el, wSG.x, wSG.y); }
        else if(t.type==='stairband'){ removeStairBand(t.el); }
        else if(t.type==='rowsepband'){ var wRS=client2world(cx, cy); removeRowSep(t.el, wRS.x, wRS.y); }
        else if(t.type==='rowsep-seg'){ pushUndo('tool'); addRowSepSegment(t.sec, t.row, t.slot); invalidate(t.sec.id); markSummary(); }
        else if(t.type==='insert-col'){ pushUndo('insert'); insertGridColumn(t.sec, t.at, toolKey); markSummary(); }
        else if(t.type==='insert-row'){ pushUndo('insert'); insertGridRow(t.sec, t.at, toolKey); markSummary(); }
        else if(t.type==='seat'){ if(toolKey==='renum') applyRenum([t.key]); else applyTool(t.el); }
      } finally { tool = prevTool; }
      renderSide(); queueRender();
    }
    // Quitar SOLO el tramo pinchado de una escalera continua: se libera la casilla del grupo más
    // cercana al punto (el resto de la escalera se conserva) — así una escalera que no es lineal
    // se esculpe soltando la tira entera y quitando después los tramos que sobran.
    function removeStairCellAt(el, wx, wy){
      var keys=(el.getAttribute('data-stairgroup')||'').split(',').filter(Boolean);
      if(!keys.length) return;
      var best=null, bd=Infinity;
      keys.forEach(function(k){
        var pp=k.split('|'); var s=sections.find(function(x){return x.id===pp[0];});
        if(!s) return;
        secRows(s).rows.forEach(function(row){
          if(String(row.rowIdx)!==pp[1]) return;
          row.seats.forEach(function(q){
            if(String(q.slot)!==pp[2]) return;
            var d=Math.hypot(q.x-wx, q.y-wy);
            if(d<bd){ bd=d; best={s:s, row:pp[1], slot:+pp[2]}; }
          });
        });
      });
      if(!best) return;
      pushUndo('stair-del');
      var mB=best.s.mods && best.s.mods[best.row];
      var lstB=(mB && mB.stairs)||[];
      var iB=lstB.indexOf(best.slot); if(iB!==-1) lstB.splice(iB,1);
      if(mB && !(mB.gaps||[]).length && !(mB.off||[]).length && !lstB.length) delete best.s.mods[best.row];
      invalidate(best.s.id);
      markSummary(); renderSide(); queueRender();
    }
    function chipDragBind(rootEl){ if(rootEl) rootEl.addEventListener('pointerdown', function(e){
      var chipT = e.target.closest('[data-tool]');
      if(!chipT || mode!=='design') return;
      var toolKey = chipT.dataset.tool;
      var sx=e.clientX, sy=e.clientY, movedT=false, ghost=null;
      function mv(ev){
        if(!movedT && Math.hypot(ev.clientX-sx, ev.clientY-sy) > 7){
          movedT = true;
          ghost = document.createElement('div');
          ghost.className = 'vmap-toolghost vmap-toolghost--' + toolKey;
          ghost.innerHTML = ({gap:'▢', off:'◼', stair:'<i class="fa fa-stairs"></i>', rowsep:'═', renum:'№', select:'⛶'})[toolKey] || '';
          // En PANTALLA COMPLETA nativa, lo que cuelga de <body> no se pinta (queda fuera del
          // elemento fullscreen): el fantasma y sus ayudas van dentro del elemento activo.
          ghost.__root = document.fullscreenElement || document.webkitFullscreenElement || document.body;
          ghost.__root.appendChild(ghost);
        }
        if(ghost){
          // El FANTASMA se coloca EN EL SITIO donde caería el elemento según mueves el ratón
          // (la butaca que reemplazaría, la columna/fila nueva o el tramo de pasillo); si no
          // hay destino, sigue al puntero. La etiqueta explica la acción bajo el cursor.
          var tPrev = resolveDropTarget(toolKey, ev.clientX, ev.clientY);
          if(!ghost.__cap){ ghost.__cap=document.createElement('div'); ghost.__cap.className='vmap-toolghost-cap'; ghost.__root.appendChild(ghost.__cap); }
          if(!ghost.__hl){ ghost.__hl=document.createElement('div'); ghost.__hl.className='vmap-drophl'; ghost.__root.appendChild(ghost.__hl); }
          ghost.__cap.style.left = ev.clientX+'px'; ghost.__cap.style.top = (ev.clientY+26)+'px';
          ghost.__cap.textContent = tPrev ? (tPrev.label||'') : '';
          ghost.__cap.style.display = (tPrev && tPrev.label) ? '' : 'none';
          var hl=ghost.__hl; hl.style.display='none';
          var ghostFollow = function(){
            ghost.classList.remove('vmap-toolghost--fit');
            ghost.style.left=ev.clientX+'px'; ghost.style.top=ev.clientY+'px';
            ghost.style.width=''; ghost.style.height=''; ghost.style.fontSize='';
          };
          var ghostFit = function(x,y,wd,ht){
            ghost.classList.add('vmap-toolghost--fit');
            ghost.style.left=x+'px'; ghost.style.top=y+'px';
            ghost.style.width=Math.max(6,wd)+'px'; ghost.style.height=Math.max(6,ht)+'px';
            ghost.style.fontSize=Math.max(9, Math.min(wd,ht)*.6)+'px';
          };
          // Mundo → pantalla (respeta zoom, pan y giro de la vista) y punto local de una grada.
          var mCTM = world.getScreenCTM ? world.getScreenCTM() : null;
          var w2c = function(x,y){ return mCTM ? {x:mCTM.a*x+mCTM.c*y+mCTM.e, y:mCTM.b*x+mCTM.d*y+mCTM.f} : null; };
          var secPt = function(sG,lx,ly){ var rr=(sG.rot||0)*R; return w2c(sG.x+lx*Math.cos(rr)-ly*Math.sin(rr), sG.y+lx*Math.sin(rr)+ly*Math.cos(rr)); };
          if(tPrev && tPrev.type==='seat' && tPrev.el){
            var rF=tPrev.el.getBoundingClientRect();
            ghostFit(rF.x, rF.y, rF.width, rF.height);
          } else if(tPrev && (tPrev.type==='insert-col' || tPrev.type==='insert-row')){
            var sG2=tPrev.sec, pG2=sG2.pitch||26, gG2=sG2.rowGap||30, cols2=sG2.cols||1, rows2=sG2.rows||1;
            var p0,p1,thick;
            if(tPrev.type==='insert-col'){
              var jx=(tPrev.at-1-(cols2-1)/2)*pG2 - pG2/2;
              p0=secPt(sG2, jx, -(rows2-1)/2*gG2 - gG2*.5);
              p1=secPt(sG2, jx, (rows2-1)/2*gG2 + totalSep(sG2) + gG2*.5);
              thick=pG2;
            } else {
              var jy=(tPrev.at-1-(rows2-1)/2)*gG2 - gG2/2;
              p0=secPt(sG2, -(cols2-1)/2*pG2 - pG2*.5, jy);
              p1=secPt(sG2, (cols2-1)/2*pG2 + pG2*.5, jy);
              thick=gG2;
            }
            if(p0 && p1){
              var scl=mCTM?Math.hypot(mCTM.a,mCTM.b):1, tPx=Math.max(6, thick*scl);
              var x0f=Math.min(p0.x,p1.x), y0f=Math.min(p0.y,p1.y);
              var wF=Math.abs(p1.x-p0.x), hF=Math.abs(p1.y-p0.y);
              if(wF < tPx){ x0f=(p0.x+p1.x)/2 - tPx/2; wF=tPx; }
              if(hF < tPx){ y0f=(p0.y+p1.y)/2 - tPx/2; hF=tPx; }
              ghostFit(x0f, y0f, wF, hF);
            } else ghostFollow();
          } else if(tPrev && tPrev.type==='rowsep-seg'){
            var sG3=tPrev.sec, pG3=sG3.pitch||26, gG3=sG3.rowGap||30, cols3=sG3.cols||1, rows3=sG3.rows||1;
            var yj=(tPrev.row-1-(rows3-1)/2)*gG3 + sepExtra(sG3, tPrev.row, tPrev.slot) + pG3*.5;
            var lxa=(tPrev.slot-1-(cols3-1)/2)*pG3;
            var pa=secPt(sG3, lxa-pG3/2, yj), pb=secPt(sG3, lxa+pG3/2, yj+Math.max(4, gG3-pG3));
            if(pa && pb) ghostFit(Math.min(pa.x,pb.x), Math.min(pa.y,pb.y), Math.abs(pb.x-pa.x), Math.abs(pb.y-pa.y));
            else ghostFollow();
          } else if(tPrev && (tPrev.type==='stairgroup' || tPrev.type==='stairband' || tPrev.type==='rowsepband')){
            ghostFollow();
            var rHL2=tPrev.el.getBoundingClientRect();
            hl.style.display=''; hl.className='vmap-drophl vmap-drophl--del';
            hl.style.left=rHL2.x+'px'; hl.style.top=rHL2.y+'px'; hl.style.width=rHL2.width+'px'; hl.style.height=rHL2.height+'px';
          } else ghostFollow();
        }
      }
      function up(ev){
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', up);
        if(ghost){ if(ghost.__cap) ghost.__cap.remove(); if(ghost.__hl) ghost.__hl.remove(); ghost.remove(); }
        if(movedT){
          chipT.dataset.suppressClick = '1';   // que el click posterior no active/desactive el modo
          dropToolAt(toolKey, ev.clientX, ev.clientY);
        }
      }
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
    }); }
    chipDragBind(side);
    chipDragBind(host.querySelector('[data-vm-addbar]'));

    /* ================= Modo (Diseñar / Categorías) ================= */
    host.querySelectorAll('[data-vm-mode]').forEach(function(b){
      b.addEventListener('click', function(){
        mode = b.dataset.vmMode; tool = null; selId = null; clearSel(); dsel = {}; dselO = {}; seatArm = false; drawArm = false;
        host.querySelectorAll('[data-vm-mode]').forEach(function(x){ x.classList.toggle('on', x===b); });
        setHint(); renderSide(); queueRender();
      });
    });

    /* ================= Retoques por butaca ================= */
    function applyTool(seatEl){
      var key = seatEl.getAttribute('data-seat'); if(!key) return false;
      var parts = key.split('|'); var s = sections.find(function(x){return x.id===parts[0];});
      if(!s || s.kind==='floor') return false;
      var rowIdx = parts[1], slot = parseInt(parts[2],10);
      pushUndo('tool');   // el barrido con la herramienta se agrupa en una sola entrada
      if(tool==='rowsep'){
        // PASILLO por TRAMOS: hueco entre esta fila y la siguiente SOLO bajo esta butaca (los
        // tramos contiguos se funden; en la última fila, delante). En curvas, a todo lo ancho.
        if(s.kind==='points') return false;
        var rI = parseInt(rowIdx,10);
        var sepAt = Math.min(rI, Math.max(1, (s.rows|0)-1));
        addRowSepSegment(s, sepAt, slot);
        invalidate(s.id); markSummary(); renderSide(); return true;
      }
      s.mods = s.mods || {};
      var m = s.mods[rowIdx] = s.mods[rowIdx] || {gaps:[], off:[]};
      m.gaps = m.gaps || []; m.off = m.off || []; m.stairs = m.stairs || [];
      // Toggle robusto SIN depender del data-kind del DOM: si el slot ya tiene el retoque se
      // quita; si no, se pone (retirando los otros y su categoría). La ESCALERA reemplaza SOLO
      // esa butaca (estado por butaca, igual que hueco/apagada; ya no pone bandas anchas).
      function applyMod(arr, others){
        var i = arr.indexOf(slot);
        if(i!==-1){ arr.splice(i,1); return; }
        arr.push(slot);
        others.forEach(function(o){ var j=o.indexOf(slot); if(j!==-1) o.splice(j,1); });
        delete assign[key];
      }
      if(tool==='gap') applyMod(m.gaps, [m.off, m.stairs]);
      else if(tool==='off') applyMod(m.off, [m.gaps, m.stairs]);
      else if(tool==='stair') applyMod(m.stairs, [m.gaps, m.off]);
      if(!m.gaps.length && !m.off.length && !m.stairs.length) delete s.mods[rowIdx];
      invalidate(s.id); markSummary(); renderSide(); return true;
    }
    function removeStairBand(el){
      var parts = (el.getAttribute('data-stairband')||'').split('|');
      var s = sections.find(function(x){return x.id===parts[0];});
      if(!s || !s.stairs) return;
      pushUndo('stair-del');
      s.stairs.splice(parseInt(parts[1],10), 1);
      invalidate(s.id); markSummary(); renderSide();
    }
    // Añadir un TRAMO de pasillo tras la fila `row` en el asiento `slot` (se funde con los
    // tramos contiguos de esa misma juntura). En curvas el pasillo es a todo lo ancho.
    function addRowSepSegment(s, row, slot){
      s.rowSeps = s.rowSeps || [];
      if(s.kind==='arc'){
        if(s.rowSeps.indexOf(row)===-1){ s.rowSeps.push(row); s.rowSeps.sort(function(a,b){return a-b;}); }
        return;
      }
      var covered = sepEntries(s).some(function(e){ return e.r===row && slot>=e.a && slot<=e.b; });
      if(covered) return;
      var mine = s.rowSeps.filter(function(e){ return typeof e!=='number' && e.r===row; });
      var rest = s.rowSeps.filter(function(e){ return typeof e==='number' || e.r!==row; });
      mine.push({r:row, a:slot, b:slot});
      mine.sort(function(x,y){ return x.a-y.a; });
      var merged=[];
      mine.forEach(function(e){
        var last=merged[merged.length-1];
        if(last && e.a<=last.b+1){ last.b=Math.max(last.b, e.b); }
        else merged.push({r:e.r, a:e.a, b:e.b});
      });
      s.rowSeps = rest.concat(merged);
    }
    // Quitar el pasillo pinchado. En gradas rectas se quita SOLO el tramo del punto pinchado
    // (las filas se vuelven a JUNTAR ahí; si el pasillo queda partido se divide en dos);
    // en curvas el pasillo es a todo lo ancho y se quita entero.
    function removeRowSep(el, wx, wy){
      var parts = (el.getAttribute('data-rowsep')||'').split('|');
      var s = sections.find(function(x){return x.id===parts[0];});
      if(!s || !Array.isArray(s.rowSeps)) return;
      var idx = parseInt(parts[1],10);
      if(isNaN(idx) || idx<0 || idx>=s.rowSeps.length) return;
      pushUndo('rowsep-del');
      if(s.kind==='arc' || wx==null){
        s.rowSeps.splice(idx, 1);
      } else {
        var raw=s.rowSeps[idx];
        var e=(typeof raw==='number') ? {r:raw, a:1, b:(s.cols|0)} : raw;
        var aC=Math.max(1, e.a), bC=Math.min(s.cols|0, e.b);
        // Columna del punto pinchado, en coordenadas locales de la grada.
        var cr=Math.cos((s.rot||0)*R), sr=Math.sin((s.rot||0)*R);
        var lxRS=(wx-s.x)*cr+(wy-s.y)*sr;
        var k=Math.round(lxRS/(s.pitch||26)+((s.cols|0)-1)/2)+1;
        k=Math.max(aC, Math.min(bC, k));
        var partsNew=[];
        if(aC<=k-1) partsNew.push({r:e.r, a:aC, b:k-1});
        if(k+1<=bC) partsNew.push({r:e.r, a:k+1, b:bC});
        s.rowSeps.splice.apply(s.rowSeps, [idx,1].concat(partsNew));
      }
      invalidate(s.id); markSummary(); renderSide(); queueRender();
    }
    // Números a mano tras un barrido con la herramienta №: una butaca = número exacto; varias =
    // número inicial y se numeran SEGUIDAS en el orden del barrido (respetando pares/impares).
    function applyRenum(seq){
      if(!seq.length) return;
      var p0 = seq[0].split('|'); var s = sections.find(function(x){return x.id===p0[0];});
      if(!s) return;
      var seatEl0 = document.querySelector('[data-seat="'+seq[0]+'"]');
      if(seq.length===1){
        var kOv = p0[1]+'|'+p0[2];
        var cur = (s.numOverrides||{})[kOv];
        if(cur==null) cur = (seatEl0 && seatEl0.getAttribute('data-n')) || '';
        var nv = window.prompt('Número para esta butaca (vacío = volver al automático):', cur);
        if(nv===null) return;
        pushUndo('renum');
        s.numOverrides = s.numOverrides || {};
        if(String(nv).trim()==='') delete s.numOverrides[kOv]; else s.numOverrides[kOv]=String(nv).trim();
      } else {
        var nv2 = window.prompt('Número INICIAL para las '+seq.length+' butacas barridas (se numeran seguidas; vacío = volver al automático):', '');
        if(nv2===null) return;
        pushUndo('renum');
        var empty = String(nv2).trim()==='';
        var stepR = numOf(s).step;
        var counter = parseInt(nv2,10);
        seq.forEach(function(k){
          var pp = k.split('|');
          var sK = sections.find(function(x){return x.id===pp[0];});
          if(!sK) return;
          sK.numOverrides = sK.numOverrides || {};
          if(empty || isNaN(counter)){ delete sK.numOverrides[pp[1]+'|'+pp[2]]; }
          else { sK.numOverrides[pp[1]+'|'+pp[2]] = String(counter); counter += stepR; }
          invalidate(sK.id);
        });
      }
      invalidate(s.id); renderSide(); queueRender();
    }

    /* ================= Asignación de categorías ================= */
    function paintSeat(seatEl){
      var key = seatEl.getAttribute('data-seat');
      if(!key || seatEl.getAttribute('data-kind')!=='seat') return;
      pushUndo('paint');
      if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key] = activeCat;
      markSummary();
    }
    function paintSection(s){
      pushUndo('paintsec');
      if(s.kind==='floor'){ if(catTool==='erase') delete floorCat[s.id]; else if(activeCat) floorCat[s.id]=activeCat; markSummary(); return; }
      secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
        if(p.state!=='seat') return;
        var key = s.id+'|'+row.rowIdx+'|'+p.slot;
        if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key]=activeCat;
      }); });
      markSummary();
    }
    /* ===== Selección con TARJETA FLOTANTE (pop-up con el total, arrastrable a una categoría) ===== */
    var selpop = host.querySelector('[data-vm-selpop]');
    function selCount(){ return Object.keys(sel).length; }
    function updateSelPop(){
      if(!selpop) return;
      var n = selCount();
      var nEl = selpop.querySelector('[data-selpop-n]'); if(nEl) nEl.textContent = n.toLocaleString('es-ES');
      // La tarjeta vive en su ESQUINA (superior derecha, por CSS) para no taparse con lo que
      // estás seleccionando; solo se mueve si el usuario la arrastra (hacia una categoría).
      selpop.classList.toggle('show', n>0 && mode==='cats' && catTool==='select');
    }
    function clearSel(){
      sel={};
      if(selpop){ delete selpop.dataset.userMoved; selpop.style.left=''; selpop.style.top=''; }
      updateSelPop(); queueRender();
    }
    function assignSelectionTo(cid){
      pushUndo('assign-sel');
      Object.keys(sel).forEach(function(k){ if(cid==null){ delete assign[k]; } else { assign[k]=cid; } });
      clearSel(); markSummary();
    }
    function toggleSel(seatEl, e){
      var key = seatEl.getAttribute('data-seat');
      if(!key || seatEl.getAttribute('data-kind')!=='seat') return;
      if(sel[key]) delete sel[key]; else sel[key]=1;
      updateSelPop(e && e.clientX, e && e.clientY); queueRender();
    }
    function selectSection(s, e){
      if(s.kind==='floor') return;   // las zonas de pie se pintan enteras con Pintar
      secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
        if(p.state==='seat') sel[s.id+'|'+row.rowIdx+'|'+p.slot]=1;
      }); });
      updateSelPop(e && e.clientX, e && e.clientY); queueRender();
    }
    if(selpop){
      selpop.addEventListener('click', function(e){
        if(e.target.closest('[data-selpop-clear]')){ clearSel(); return; }
        if(e.target.closest('[data-selpop-unassign]')){ assignSelectionTo(null); return; }
      });
      // Arrastrar la tarjeta hasta una categoría del panel = asignar la selección a esa categoría.
      var dragPop = null;
      selpop.addEventListener('pointerdown', function(e){
        if(e.target.closest('button')) return;
        try{ selpop.setPointerCapture(e.pointerId); }catch(_){}
        var r = selpop.getBoundingClientRect();
        dragPop = {dx: e.clientX-r.left, dy: e.clientY-r.top};
        selpop.classList.add('dragging');
        e.preventDefault();
      });
      function underPop(x, y){
        // La tarjeta va pegada al puntero: hay que apartarla un instante para ver qué hay debajo.
        var prev = selpop.style.visibility;
        selpop.style.visibility = 'hidden';
        var el = document.elementFromPoint(x, y);
        selpop.style.visibility = prev || '';
        return el;
      }
      selpop.addEventListener('pointermove', function(e){
        if(!dragPop) return;
        var wrap = selpop.parentElement.getBoundingClientRect();
        selpop.dataset.userMoved = '1';
        selpop.style.left = (e.clientX-wrap.left-dragPop.dx)+'px';
        selpop.style.top = (e.clientY-wrap.top-dragPop.dy)+'px';
        var under = underPop(e.clientX, e.clientY);
        var cat = under && under.closest ? under.closest('.vmap-cat') : null;
        host.querySelectorAll('.vmap-cat').forEach(function(c){ c.classList.toggle('drop-hint', c===cat); });
      });
      function popUp(e){
        if(!dragPop) return;
        dragPop = null; selpop.classList.remove('dragging');
        var under = underPop(e.clientX, e.clientY);
        var cat = under && under.closest ? under.closest('.vmap-cat') : null;
        host.querySelectorAll('.vmap-cat').forEach(function(c){ c.classList.remove('drop-hint'); });
        if(cat && selCount()){ activeCat = cat.dataset.cat; assignSelectionTo(cat.dataset.cat); renderSide(); }
      }
      selpop.addEventListener('pointerup', popUp);
      selpop.addEventListener('pointercancel', function(){ dragPop=null; selpop.classList.remove('dragging'); });
    }

    /* ===== Popup de selección en DISEÑO (tarjeta fija a la DERECHA del lienzo) =====
       Se abre al seleccionar butacas (1 o varias) sin mover la vista ni tapar lo seleccionado.
       Muestra los PARÁMETROS COMUNES (sector / fila): escribir encima los cambia para TODA la
       selección. Con UNA sola butaca también se edita su Nº de asiento. Con varias, además,
       agrupa por contigüidad (sin cambiar tamaño, forma ni orientación de las butacas). */
    var dpop = host.querySelector('[data-vm-dpop]');
    var dpopSig = '';
    // Radiografía de la selección: puntos, secciones implicadas, valores comunes y —con una sola
    // butaca— su sección/fila/slot/número para editarla individualmente.
    function dselInfo(){
      var dk=dselKeys(), pts=[], secIds=[], secSeen={}, names={}, rowLabels={}, single=null, pitch=null, allPoints=true;
      sections.forEach(function(s){
        if(s.kind==='floor') return;
        var any=false;
        var geo=secRows(s);
        geo.rows.forEach(function(row){ row.seats.forEach(function(p){
          var k=s.id+'|'+row.rowIdx+'|'+p.slot;
          if(!dsel[k]) return;
          any=true;
          pts.push({x:p.x, y:p.y});
          if(!secSeen[s.id]){ secSeen[s.id]=1; secIds.push(s.id); }
          names[s.name||'']=1;
          rowLabels[rowLabelOf(s,row.rowIdx)]=1;
          if(pitch==null) pitch=(+s.pitch)||26;
          single={sec:s, rowIdx:row.rowIdx, slot:p.slot, n:p.n};
        }); });
        if(any && s.kind!=='points') allPoints=false;
      });
      var sameSection = secIds.length===1;
      var wholeSection = false;
      if(sameSection){
        var s0=sections.find(function(x){return x.id===secIds[0];});
        wholeSection = !!s0 && secRows(s0).count===dk.length;
      }
      var nm=Object.keys(names), rl=Object.keys(rowLabels);
      return { keys:dk, pts:pts, secIds:secIds, sameSection:sameSection, wholeSection:wholeSection,
               allPoints:allPoints, pitch:(pitch||prevailingPitch()),
               commonName:(nm.length===1?nm[0]:''), commonRowLabel:(rl.length===1?rl[0]:''),
               single:(dk.length===1?single:null) };
    }
    function updateDPop(){
      if(!dpop) return;
      var dk = dselKeys();
      var show = canEdit && mode==='design' && dk.length>=1;
      dpop.classList.toggle('show', show);
      if(!show){ dpopSig=''; return; }
      var sig = dk.length + '|' + dk[0] + '|' + dk[dk.length-1];
      if(sig === dpopSig) return;   // misma selección: no repintar (no pisa lo que se esté escribiendo)
      dpopSig = sig;
      var info = dselInfo();
      dpop.querySelector('[data-dpop-n]').textContent = dk.length.toLocaleString('es-ES');
      var blocksEl = dpop.querySelector('[data-dpop-blocks]');
      if(!info.allPoints){
        blocksEl.textContent = 'Edita fila (número o letra) y la numeración del sector: se aplican al momento.';
      } else if(dk.length===1){
        blocksEl.textContent = 'Edita sector, fila o nº de asiento: se aplican al momento.';
      } else {
        var nBlocks = contiguousClusters(info.pts, info.pitch*1.6).length;
        blocksEl.textContent = (nBlocks>1
          ? nBlocks+' bloques contiguos: «Agrupar en bloques» crea un sector por cada uno.'
          : 'Butacas contiguas: «Agrupar en bloques» crea un sector con sus filas.')
          + ' Sector y fila se aplican a TODAS las seleccionadas.';
      }
      dpop.querySelector('[data-dpop-name]').value = info.commonName || '';
      dpop.querySelector('[data-dpop-row]').value = info.commonRowLabel || '';
      // Numeración de LAS FILAS seleccionadas (valor común o «—» si difieren entre filas).
      var nvStart={}, nvDir={}, nvMode={}, _seenRow={};
      dk.forEach(function(k){
        var pp=k.split('|'), rk=pp[0]+'|'+pp[1];
        if(_seenRow[rk]) return; _seenRow[rk]=1;
        var sN=sections.find(function(x){return x.id===pp[0];}); if(!sN || sN.kind==='floor') return;
        var n0=numOfRow(sN, +pp[1]); nvStart[n0.start]=1; nvDir[n0.dir]=1; nvMode[n0.mode]=1;
      });
      function _common(o){ var ks=Object.keys(o); return ks.length===1 ? ks[0] : ''; }
      dpop.querySelector('[data-dpop-numstart]').value = _common(nvStart);
      dpop.querySelector('[data-dpop-numdir]').value = _common(nvDir);
      dpop.querySelector('[data-dpop-nummode]').value = _common(nvMode);
      dpop.querySelector('[data-dpop-seatrow]').classList.toggle('d-none', dk.length!==1);
      if(info.single) dpop.querySelector('[data-dpop-seatnum]').value = (info.single.n!=null ? String(info.single.n) : '');
      var gw = dpop.querySelector('[data-dpop-groupwrap]');
      if(gw) gw.style.display = (dk.length>=2 && info.allPoints) ? '' : 'none';
    }
    if(dpop){
      dpop.addEventListener('click', function(e){
        if(e.target.closest('[data-dpop-clear]')){ dsel={}; renderSide(); queueRender(); return; }
        var btnAuto=e.target.closest('[data-dpop-auto]'), btnOne=e.target.closest('[data-dpop-one]'),
            btnRow=e.target.closest('[data-dpop-rowg]'), btnBox=e.target.closest('[data-dpop-box]');
        if(!(btnAuto||btnOne||btnRow||btnBox)) return;
        var nm=(dpop.querySelector('[data-dpop-name]').value||'').trim();
        var rs=parseInt(dpop.querySelector('[data-dpop-row]').value, 10)||1;
        if(btnAuto) groupSelectedSeats('auto', {name:nm||'Sector', rowStart:rs});
        else if(btnOne) groupSelectedSeats('sector', {name:nm||'Sector', rowStart:rs});
        else if(btnRow) groupSelectedSeats('row', {name:nm||'Fila', rowStart:rs});
        else if(btnBox) groupSelectedSeats('box', {name:nm||'Palco', rowStart:rs});
      });
      // Editar ESCRIBIENDO ENCIMA: sector y fila se aplican a toda la selección; el nº de asiento,
      // a la butaca única seleccionada (numOverrides, como la herramienta №; vacío = automático).
      var nmI=dpop.querySelector('[data-dpop-name]'), rwI=dpop.querySelector('[data-dpop-row]'), snI=dpop.querySelector('[data-dpop-seatnum]');
      nmI.addEventListener('change', function(){
        var v=(nmI.value||'').trim(); if(!v || !dselKeys().length) return;
        var info=dselInfo();
        if(info.sameSection && info.wholeSection){
          // TODA la sección seleccionada: renombrar en sitio (no cambia nada más).
          pushUndo('sel-name');
          var s0=sections.find(function(x){return x.id===info.secIds[0];});
          if(s0){ s0.name=v; delete s0.loose; }
          dpopSig=''; markSummary(); renderSide(); queueRender();
        } else if(!info.allPoints){
          // Hay GRADAS paramétricas implicadas: no se re-agrupa, se renombra la(s) sección(es).
          pushUndo('sel-name');
          info.secIds.forEach(function(sid){
            var sR=sections.find(function(x){return x.id===sid;});
            if(sR){ sR.name=v; delete sR.loose; }
          });
          dpopSig=''; markSummary(); renderSide(); queueRender();
        } else {
          // Parte de una sección (o varias): esas butacas pasan a un sector con ese nombre,
          // conservando posición, tamaño y orientación.
          groupSelectedSeats('sector', {name:v});
        }
      });
      rwI.addEventListener('change', function(){
        // Fila por NÚMERO (12) o por LETRA (C): la fila de la selección pasa a llamarse así y el
        // resto de la sección sigue en orden (rowStart + esquema numérico/alfabético).
        var raw=(rwI.value||'').trim(), n=null, scheme=null;
        if(/^\d+$/.test(raw)){ n=parseInt(raw,10); scheme='num'; }
        else if(/^[A-Za-z]{1,2}$/.test(raw)){
          n=0; raw.toUpperCase().split('').forEach(function(ch){ n=n*26+(ch.charCodeAt(0)-64); });
          scheme='alpha';
        }
        if(n==null || !dselKeys().length) return;
        var info=dselInfo();
        pushUndo('sel-row');
        info.secIds.forEach(function(sid){
          var s0=sections.find(function(x){return x.id===sid;}); if(!s0) return;
          var geo=secRows(s0), minRow=null;
          geo.rows.forEach(function(row){ row.seats.forEach(function(p){ if(dsel[s0.id+'|'+row.rowIdx+'|'+p.slot]) minRow=(minRow==null?row.rowIdx:Math.min(minRow,row.rowIdx)); }); });
          if(minRow==null) return;
          // La PRIMERA fila seleccionada pasa a llamarse n; el resto de la sección sigue en orden
          // (con etiquetas descendentes, la cuenta va desde la fila de abajo).
          var rs0 = (s0.rowDir==='desc')
            ? (n - ((parseInt(s0.rows,10)||1) - minRow))
            : (n - (minRow - 1));
          // Por letras no existen filas antes de la A: si la combinación deja filas anteriores
          // sin letra (p. ej. «A» en la fila 3), se ancla la PRIMERA fila de la sección a la A.
          if(scheme==='alpha' && rs0 < 1) rs0 = 1;
          s0.rowStart = rs0;
          s0.rowScheme = scheme;
          invalidate(s0.id);
        });
        dpopSig=''; markSummary(); renderSide(); queueRender();
      });
      // Numeración de LAS FILAS de la selección: inicio, sentido y tipo (consecutivos / impares /
      // pares) se aplican SOLO a las filas con butacas seleccionadas (hay planos donde una fila
      // empieza en un número y la de atrás en otro). Se guarda como override por fila (s.rowNums);
      // el panel lateral sigue editando el ajuste GENERAL de la sección (filas sin override).
      function applyNumCfg(fn){
        var dk=dselKeys(); if(!dk.length) return;
        pushUndo('sel-numcfg');
        var rowsBySec={};
        dk.forEach(function(k){ var pp=k.split('|'); (rowsBySec[pp[0]]=rowsBySec[pp[0]]||{})[String(+pp[1])]=1; });
        Object.keys(rowsBySec).forEach(function(sid){
          var s0=sections.find(function(x){return x.id===sid;}); if(!s0 || s0.kind==='floor') return;
          s0.rowNums = s0.rowNums || {};
          Object.keys(rowsBySec[sid]).forEach(function(ri){
            var ov = s0.rowNums[ri] = s0.rowNums[ri] || {};
            fn(ov);
          });
          invalidate(s0.id);
        });
        dpopSig=''; markSummary(); renderSide(); queueRender();
      }
      var nsI=dpop.querySelector('[data-dpop-numstart]'), ndI=dpop.querySelector('[data-dpop-numdir]'), nmoI=dpop.querySelector('[data-dpop-nummode]');
      nsI.addEventListener('change', function(){ var v=parseInt(nsI.value,10); if(isNaN(v)) return; applyNumCfg(function(n){ n.start=v; }); });
      ndI.addEventListener('change', function(){ var v=ndI.value; if(!v) return; applyNumCfg(function(n){ n.dir=v; }); });
      nmoI.addEventListener('change', function(){ var v=nmoI.value; if(!v) return; applyNumCfg(function(n){ n.mode=v; }); });
      snI.addEventListener('change', function(){
        var info=dselInfo(); if(!info.single) return;
        pushUndo('sel-num');
        var s0=info.single.sec;
        s0.numOverrides = s0.numOverrides || {};
        var kOv=info.single.rowIdx+'|'+info.single.slot, v=(snI.value||'').trim();
        if(v==='') delete s0.numOverrides[kOv]; else s0.numOverrides[kOv]=v;
        invalidate(s0.id);
        dpopSig=''; markSummary(); renderSide(); queueRender();
      });
    }

    function eachSeatInRect(a, b, fn){
      var x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x), y0=Math.min(a.y,b.y), y1=Math.max(a.y,b.y);
      sections.forEach(function(s){
        if(s.kind==='floor') return;
        var bb=bboxOf(s); if(bb.x>x1||bb.y>y1||bb.x+bb.w<x0||bb.y+bb.h<y0) return;
        secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
          if(p.state!=='seat') return;
          if(p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1) fn(s.id+'|'+row.rowIdx+'|'+p.slot);
        }); });
      });
    }

    /* ================= Zoom / pan / pinch / punteros ================= */
    var MIN_VIEW_W = 140;   // acercamiento MÁXIMO (evita seguir haciendo zoom hasta perderse en blanco)
    function contentBounds(){   // caja del contenido en coords del MUNDO
      var xs=[],ys=[];
      sections.forEach(function(s){ var b=bboxOf(s); if(b.w||b.h){ xs.push(b.x,b.x+b.w); ys.push(b.y,b.y+b.h); } });
      elements.forEach(function(el){ if(el.type==='door'){ xs.push(el.x-60, el.x+60); ys.push(el.y-40, el.y+60); return; }
        xs.push(el.x-(el.w||0)/2, el.x+(el.w||0)/2); ys.push(el.y-(el.h||0)/2, el.y+(el.h||0)/2); });
      if(!xs.length) return null;
      return {mx:Math.min.apply(null,xs), Mx:Math.max.apply(null,xs), my:Math.min.apply(null,ys), My:Math.max.apply(null,ys)};
    }
    function contentCenter(){ var b=contentBounds(); return b?{x:(b.mx+b.Mx)/2, y:(b.my+b.My)/2}:null; }
    // La misma caja pero YA girada (coords del viewBox): al girar, el contenido ocupa una caja mayor.
    // Cajas (en coords del viewBox, ya giradas) de cada sector/elemento: sirven para encajar,
    // limitar el pan y NO dejar el zoom en un hueco vacío (que se vería en blanco).
    function objBoxesRaw(){
      var out=[], a=view.rot*R, ca=Math.cos(a), sa=Math.sin(a);
      function push(x,y,w,h){
        if(!w && !h) return;
        if(!view.rot){ out.push({mx:x,my:y,Mx:x+w,My:y+h}); return; }
        var xs=[],ys=[];
        [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(function(p){
          var dx=p[0]-view.px, dy=p[1]-view.py; xs.push(view.px+dx*ca-dy*sa); ys.push(view.py+dx*sa+dy*ca);
        });
        out.push({mx:Math.min.apply(null,xs),my:Math.min.apply(null,ys),Mx:Math.max.apply(null,xs),My:Math.max.apply(null,ys)});
      }
      sections.forEach(function(s){ var b=bboxOf(s); push(b.x,b.y,b.w,b.h); });
      elements.forEach(function(el){ if(el.type==='door') push(el.x-60,el.y-40,120,100); else push(el.x-(el.w||0)/2, el.y-(el.h||0)/2, (el.w||0), (el.h||0)); });
      return out;
    }
    function contentBoundsRaw(){
      var boxes=objBoxesRaw(); if(!boxes.length) return null;
      var mx=Infinity,my=Infinity,Mx=-Infinity,My=-Infinity;
      boxes.forEach(function(b){ if(b.mx<mx)mx=b.mx; if(b.my<my)my=b.my; if(b.Mx>Mx)Mx=b.Mx; if(b.My>My)My=b.My; });
      return {mx:mx,my:my,Mx:Mx,My:My};
    }
    function computeFit(){
      var b=contentBoundsRaw(); if(!b) return null;
      var pad=.07*Math.max(b.Mx-b.mx, b.My-b.my, 100);
      var ar=(svg.clientWidth>0 && svg.clientHeight>0)? svg.clientWidth/svg.clientHeight : 4/3;
      var w=(b.Mx-b.mx)+2*pad, h=(b.My-b.my)+2*pad;
      if(w/h<ar) w=h*ar; else h=w/ar;
      return {x:(b.mx+b.Mx)/2-w/2, y:(b.my+b.My)/2-h/2, w:w, h:h};
    }
    function fitAll(){
      var f=computeFit() || {x:-1200,y:-900,w:2400,h:1800};
      view.x=f.x; view.y=f.y; view.w=f.w; view.h=f.h;   // conserva rot/px/py
      queueRender();
    }
    // El zoom NO deja alejarse más allá del recinto completo: si te pasas, se encaja al plano.
    function clampZoomOut(){
      var fv = computeFit();
      if(fv && view.w > fv.w*1.02){ view.x=fv.x; view.y=fv.y; view.w=fv.w; view.h=fv.h; }
    }
    // Mantener SIEMPRE parte del recinto a la vista (no perderse en zonas en blanco).
    function clampView(){
      clampZoomOut();
      var boxes=objBoxesRaw(); if(!boxes.length) return;
      var b={mx:Infinity,my:Infinity,Mx:-Infinity,My:-Infinity};
      boxes.forEach(function(x){ if(x.mx<b.mx)b.mx=x.mx; if(x.my<b.my)b.my=x.my; if(x.Mx>b.Mx)b.Mx=x.Mx; if(x.My>b.My)b.My=x.My; });
      var cw=b.Mx-b.mx, ch=b.My-b.my;
      var mX=Math.min(view.w,cw)*0.4, mY=Math.min(view.h,ch)*0.4;
      var maxX=b.Mx-mX, minX=b.mx+mX-view.w;
      view.x = (minX>maxX) ? ((b.mx+b.Mx)/2 - view.w/2) : Math.max(minX, Math.min(maxX, view.x));
      var maxY=b.My-mY, minY=b.my+mY-view.h;
      view.y = (minY>maxY) ? ((b.my+b.My)/2 - view.h/2) : Math.max(minY, Math.min(maxY, view.y));
      // Si aun así el viewport no toca NINGÚN sector (quedaría en un hueco en blanco), céntralo en
      // el sector más cercano — así el zoom nunca te «pierde» en el vacío.
      var vx0=view.x, vy0=view.y, vx1=view.x+view.w, vy1=view.y+view.h;
      var touches=boxes.some(function(x){ return x.Mx>vx0 && x.mx<vx1 && x.My>vy0 && x.my<vy1; });
      if(!touches){
        var cx=(vx0+vx1)/2, cy=(vy0+vy1)/2, best=null, bd=Infinity;
        boxes.forEach(function(x){
          var ex=Math.max(x.mx,Math.min(cx,x.Mx)), ey=Math.max(x.my,Math.min(cy,x.My));
          var d=(ex-cx)*(ex-cx)+(ey-cy)*(ey-cy); if(d<bd){ bd=d; best=x; }
        });
        if(best){ view.x += (best.mx+best.Mx)/2 - cx; view.y += (best.my+best.My)/2 - cy; }
      }
    }
    function zoomAt(cx, cy, f){
      var fit=computeFit(), maxW=fit?fit.w:1e9;
      var tw=Math.max(MIN_VIEW_W, Math.min(maxW, view.w*f));
      f=tw/view.w; if(Math.abs(f-1)<1e-4) return;
      var r0=client2raw(cx,cy);
      view.w*=f; view.h*=f;
      var r1=client2raw(cx,cy);
      view.x += r0.x-r1.x; view.y += r0.y-r1.y;
      clampView();
      queueRender();
    }
    // Girar el plano para verlo desde otra perspectiva (pivote = centro del contenido).
    function rotateBy(dd){ view.rot=(((view.rot||0)+dd)%360+360)%360; clampView(); queueRender(); }
    // Navegación tipo mapa (Mac incluido): la RUEDA / el scroll de dos dedos DESPLAZA el plano
    // (antes hacía zoom y con el Magic Mouse/trackpad era imposible moverse); el ZOOM va con el
    // PELLIZCO del trackpad (llega como wheel con ctrlKey) o con Ctrl/⌘ + rueda, además de los
    // botones +/− y el pinch táctil de siempre.
    svg.addEventListener('wheel', function(e){
      e.preventDefault();
      if(e.ctrlKey || e.metaKey){
        var f=Math.exp(Math.max(-40, Math.min(40, e.deltaY)) * 0.0045);
        zoomAt(e.clientX, e.clientY, f);
        return;
      }
      var mult=(e.deltaMode===1 ? 16 : (e.deltaMode===2 ? svg.clientHeight : 1));
      var s2=px();
      view.x += (e.deltaX*mult)/s2;
      view.y += (e.deltaY*mult)/s2;
      clampView(); queueRender();
    }, {passive:false});
    host.querySelector('[data-vm-zin]').addEventListener('click', function(){ var r=svg.getBoundingClientRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1/1.35); });
    host.querySelector('[data-vm-zout]').addEventListener('click', function(){ var r=svg.getBoundingClientRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1.35); });
    host.querySelector('[data-vm-fit]').addEventListener('click', fitAll);
    var _rl=host.querySelector('[data-vm-rotl]'); if(_rl) _rl.addEventListener('click', function(){ rotateBy(-15); });
    var _rr=host.querySelector('[data-vm-rotr]'); if(_rr) _rr.addEventListener('click', function(){ rotateBy(15); });
    var _rn=host.querySelector('[data-vm-rotn]'); if(_rn) _rn.addEventListener('click', function(){ view.rot=0; clampView(); queueRender(); });

    var pointers={}, pinch0=null, drag=null;
    // Modo MANO (desplazarse sin tocar piezas): botón ✋, barra espaciadora u botón central.
    var panLock=false, spaceHeld=false, overCanvas=false;
    var _handBtn=host.querySelector('[data-vm-hand]');
    if(_handBtn) _handBtn.addEventListener('click', function(){
      panLock=!panLock;
      _handBtn.classList.toggle('on', panLock);
      svg.classList.toggle('vmap-hand', panLock);
    });
    // PANTALLA COMPLETA: el diseñador entero (barra + lienzo + panel) ocupa toda la pantalla.
    // Si el navegador no concede el fullscreen nativo (API bloqueada, iframe, etc.) se cae a un
    // modo «maximizado» propio (posición fija a todo el viewport), que funciona siempre.
    var _fsBtn=host.querySelector('[data-vm-full]');
    function _fsSet(on){
      host.classList.toggle('vmap-fs', on);
      if(_fsBtn){
        _fsBtn.classList.toggle('on', on);
        var ic=_fsBtn.querySelector('i');
        if(ic) ic.className = on ? 'fa fa-down-left-and-up-right-to-center' : 'fa fa-up-right-and-down-left-from-center';
      }
      setTimeout(fitAll, 80);   // el lienzo cambia de tamaño: reencuadrar el plano
    }
    function _fsMaxExit(){ host.classList.remove('vmap-max'); document.body.classList.remove('vmap-max-open'); _fsSet(false); }
    function _fsMaxEnter(){ host.classList.add('vmap-max'); document.body.classList.add('vmap-max-open'); _fsSet(true); }
    function _fsOnChange(){
      if(host.classList.contains('vmap-max')) return;   // en modo maximizado propio, ignorar
      _fsSet((document.fullscreenElement||document.webkitFullscreenElement)===host);
    }
    if(_fsBtn){
      _fsBtn.addEventListener('click', function(){
        if(host.classList.contains('vmap-max')){ _fsMaxExit(); return; }
        if((document.fullscreenElement||document.webkitFullscreenElement)===host){
          (document.exitFullscreen||document.webkitExitFullscreen).call(document);
          return;
        }
        var p=null, ok=false;
        try{ var rq=host.requestFullscreen||host.webkitRequestFullscreen; if(rq){ p=rq.call(host); ok=true; } }catch(err){ ok=false; }
        if(p && typeof p.then==='function'){ p.catch(function(){ _fsMaxEnter(); }); }
        else if(!ok){ _fsMaxEnter(); }
        else setTimeout(function(){ if((document.fullscreenElement||document.webkitFullscreenElement)!==host) _fsMaxEnter(); }, 300);
      });
      document.addEventListener('fullscreenchange', _fsOnChange);
      document.addEventListener('webkitfullscreenchange', _fsOnChange);
    }
    svg.addEventListener('pointerenter', function(){ overCanvas=true; });
    svg.addEventListener('pointerleave', function(){ overCanvas=false; });
    document.addEventListener('keyup', function(e){
      if(e.key===' ' || e.code==='Space'){ spaceHeld=false; if(!panLock) svg.classList.remove('vmap-hand'); }
    });
    function drawLasso(a,b){
      var l=svg.querySelector('#vmLasso');
      if(!l){ l=document.createElementNS('http://www.w3.org/2000/svg','rect'); l.id='vmLasso'; svg.appendChild(l); }
      l.setAttribute('x',Math.min(a.x,b.x)); l.setAttribute('y',Math.min(a.y,b.y));
      l.setAttribute('width',Math.abs(b.x-a.x)); l.setAttribute('height',Math.abs(b.y-a.y));
      // El lazo está en coords del MUNDO: si el plano está girado, aplícale el mismo giro para que
      // encaje con las butacas.
      l.setAttribute('transform', view.rot ? ('rotate('+view.rot+' '+view.px+' '+view.py+')') : '');
      l.setAttribute('style','fill:rgba(0,124,162,.10);stroke:#007CA2;stroke-width:'+(1.5/px())+';stroke-dasharray:'+(6/px())+' '+(4/px()));
    }
    function clearLasso(){ var l=svg.querySelector('#vmLasso'); if(l) l.remove(); }

    svg.addEventListener('pointerdown', function(e){
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      dismissAsk();   // seguir trabajando descarta la oferta de fusión pendiente
      pointers[e.pointerId]={x:e.clientX, y:e.clientY};
      var ids=Object.keys(pointers);
      if(ids.length===2){ var a=pointers[ids[0]], b=pointers[ids[1]];
        pinch0={d:Math.hypot(a.x-b.x,a.y-b.y), view:JSON.parse(JSON.stringify(view)), cx:(a.x+b.x)/2, cy:(a.y+b.y)/2}; drag=null; return; }
      // Detección de asientos: el clic elige el asiento de MUESTRA del plano de fondo.
      if(detectArm && canEdit){ detectArm=false; drag={kind:'none'}; runDetect(e.clientX, e.clientY); setHint(); renderSide(); return; }
      // MANO / barra espaciadora / botón central: SIEMPRE desplaza, sin tocar ninguna pieza.
      if(panLock || spaceHeld || e.button===1){
        if(e.button===1) e.preventDefault();
        drag={kind:'pan', c0:{x:e.clientX, y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
        return;
      }
      var seatEl=e.target.closest('[data-seat]'), secEl=e.target.closest('[data-sec]'), elEl=e.target.closest('[data-el]'), stairEl=e.target.closest('[data-stairband]');
      var rzEl=e.target.closest('[data-resize]'), rotEl=e.target.closest('[data-rotate]');
      var w=client2world(e.clientX,e.clientY);
      // GIRO por tirador: gira el objeto (o las butacas sueltas seleccionadas) arrastrando el círculo.
      if(mode==='design' && canEdit && rotEl){
        var rid=rotEl.getAttribute('data-rotate');
        if(rid==='SELO'){
          // GIRO DE GRUPO: todas las piezas seleccionadas giran alrededor del centro de su caja
          // conjunta (cada una gira sobre sí misma Y su posición orbita el centro común).
          var gbR=dselOBounds();
          if(gbR){
            var snapG=[];
            dselOkeys().forEach(function(id){
              var o=sections.find(function(x){return x.id===id;})||elements.find(function(x){return x.id===id;});
              if(!o) return;
              snapG.push({o:o, x:(o.kind==='arc'?o.cx:o.x), y:(o.kind==='arc'?o.cy:o.y),
                          rot:(o.kind==='arc' ? (o.dir||0) : (o.rot||0))});
            });
            if(snapG.length){
              drag={kind:'rotate', rmode:'group', c:{x:gbR.cx, y:gbR.cy},
                    start:Math.atan2(w.y-gbR.cy, w.x-gbR.cx), snap:snapG};
              return;
            }
          }
        }
        if(rid==='SEL'){
          var secR=sections.find(function(x){return x.id===selId && x.kind==='points';});
          if(secR){
            var arrR=dselSeatObjs(secR);
            if(arrR.length){
              var ccx=0, ccy=0; arrR.forEach(function(a){ ccx+=a.x; ccy+=a.y; }); ccx/=arrR.length; ccy/=arrR.length;
              var snapR=arrR.map(function(a){ var st=(secR.seats||[]).find(function(t){return (+t.row)===a.row && (+t.slot)===a.slot;}); return {seat:st, x:a.x, y:a.y, a0:(st?parseFloat(st.a)||0:0)}; });
              drag={kind:'rotate', rmode:'seats', sec:secR, c:{x:ccx,y:ccy}, start:Math.atan2(w.y-ccy, w.x-ccx), snap:snapR};
              return;
            }
          }
        } else {
          var roR=sections.find(function(x){return x.id===rid;})||elements.find(function(x){return x.id===rid;});
          if(roR){ drag={kind:'rotate', rmode:'obj', obj:roR, c:{x:roR.x, y:roR.y}}; return; }
        }
      }
      if(mode==='design' && canEdit && rzEl){
        var rzId=rzEl.getAttribute('data-resize');
        var rzObj2=sections.find(function(x){return x.id===rzId;})||elements.find(function(x){return x.id===rzId;});
        if(rzObj2){ drag={kind:'resize', obj:rzObj2, w0:w, o0:{w:rzObj2.w, h:rzObj2.h, x:rzObj2.x, y:rzObj2.y}}; return; }
      }
      // BUTACA SUELTA: cada clic en el plano añade una butaca (movible/orientable). Si cae JUNTO a
      // otra butaca (la última añadida o cualquiera de un bloque points), se ENCADENA a su fila:
      // se coloca ALINEADA al patrón (a un paso exacto, en el eje de la fila y en el sentido del
      // clic), NUNCA encima de otra (si el sitio está ocupado corre al siguiente hueco), hereda la
      // orientación y el TAMAÑO del bloque. Lejos de todo = grupo nuevo independiente.
      if(mode==='design' && canEdit && seatArm){
        pushUndo('seat');
        var ppS=prevailingPitch();
        // Objetivo de encadenado: la butaca 'points' MÁS CERCANA al clic (extiende bloques
        // detectados y rellena huecos, no solo la última añadida).
        var chain=null, bd=Infinity;
        sections.forEach(function(sc){
          if(sc.kind!=='points') return;
          var crC=Math.cos((sc.rot||0)*R), srC=Math.sin((sc.rot||0)*R);
          (sc.seats||[]).forEach(function(st){
            var wx=sc.x+(+st.lx||0)*crC-(+st.ly||0)*srC, wy=sc.y+(+st.lx||0)*srC+(+st.ly||0)*crC;
            var d=Math.hypot(w.x-wx, w.y-wy);
            if(d<bd){ bd=d; chain={sc:sc, st:st, wx:wx, wy:wy, d:d}; }
          });
        });
        if(!(chain && chain.d <= (chain.sc.pitch||ppS)*1.9)) chain=null;
        var lp, rowN=1, aInh=0, target={x:w.x, y:w.y};
        if(chain){
          lp=chain.sc; rowN=(+chain.st.row)||1; aInh=(parseFloat(chain.st.a)||0);
          var pit=(+lp.pitch)||ppS;
          // Clic SOBRE un hueco = RELLENARLO: el hueco se convierte en butaca (queda alineado
          // de serie, sin añadir nada nuevo).
          var mCh=(lp.mods||{})[String(rowN)];
          if(mCh && Array.isArray(mCh.gaps) && chain.d<=pit*0.6 && mCh.gaps.indexOf(+chain.st.slot)!==-1){
            mCh.gaps=mCh.gaps.filter(function(sl){ return sl!==(+chain.st.slot); });
            if(!mCh.gaps.length && !(mCh.off||[]).length) delete lp.mods[String(rowN)];
            lastSeatAdd={secId:lp.id, row:rowN, slot:(+chain.st.slot)};
            selId=lp.id; dsel={}; dsel[lp.id+'|'+rowN+'|'+(+chain.st.slot)]=1;
            invalidate(lp.id); markSummary(); renderSide(); queueRender();
            drag={kind:'none'}; return;
          }
          var crW=Math.cos((lp.rot||0)*R), srW=Math.sin((lp.rot||0)*R);
          function _wp(t){ return {x:lp.x+(+t.lx||0)*crW-(+t.ly||0)*srW, y:lp.y+(+t.lx||0)*srW+(+t.ly||0)*crW}; }
          // Eje de la fila: el de sus dos últimas butacas; con una sola, el de su orientación.
          var rowSeats=(lp.seats||[]).filter(function(t){ return (+t.row)===rowN; });
          var ax, ay;
          if(rowSeats.length>=2){
            var so=rowSeats.slice().sort(function(a,b){ return (+a.slot)-(+b.slot); });
            var p1=_wp(so[so.length-2]), p2=_wp(so[so.length-1]);
            var dl=Math.hypot(p2.x-p1.x, p2.y-p1.y)||1;
            ax=(p2.x-p1.x)/dl; ay=(p2.y-p1.y)/dl;
          } else {
            var arard=((lp.rot||0)+aInh)*R;
            ax=Math.cos(arard); ay=Math.sin(arard);
          }
          var dir=((w.x-chain.wx)*ax + (w.y-chain.wy)*ay) >= 0 ? 1 : -1;
          target={x:chain.wx + dir*ax*pit, y:chain.wy + dir*ay*pit};
          // Nunca ENCIMA de otra: si el sitio está ocupado, correr al siguiente hueco del patrón.
          function _occupied(p){
            return (lp.seats||[]).some(function(t){ var q=_wp(t); return Math.hypot(q.x-p.x, q.y-p.y) < pit*0.72; });
          }
          var guardO=0;
          while(_occupied(target) && guardO++<24){ target={x:target.x + dir*ax*pit, y:target.y + dir*ay*pit}; }
        } else {
          lp={id:nid('s'), kind:'points', loose:true, name:'Butacas sueltas', x:w.x, y:w.y, rot:0, pitch:ppS, rows:1, num:{start:1,mode:'seq',step:1,dir:'ltr'}, rowScheme:'num', rowStart:1, gapPolicy:'skip', seats:[]};
          sections.push(lp);
        }
        var nslot=1; (lp.seats||[]).forEach(function(t){ if((+t.row)===rowN && (+t.slot)>=nslot) nslot=(+t.slot)+1; });
        // Coordenadas locales deshaciendo la rotación de la sección de destino.
        var crN=Math.cos((lp.rot||0)*R), srN=Math.sin((lp.rot||0)*R);
        var dxN=target.x-lp.x, dyN=target.y-lp.y;
        var newSeat={row:rowN, slot:nslot, lx:Math.round(dxN*crN+dyN*srN), ly:Math.round(-dxN*srN+dyN*crN), a:aInh};
        lp.seats.push(newSeat);
        // Insertar «entre medias» renumera la fila por orden geométrico (numeración = geometría).
        if(chain) renumberRowSlots(lp, rowN);
        lastSeatAdd={secId:lp.id, row:rowN, slot:(+newSeat.slot)};
        selId=lp.id; dsel={}; dsel[lp.id+'|'+rowN+'|'+(+newSeat.slot)]=1;
        invalidate(lp.id); markSummary(); renderSide(); queueRender();
        drag={kind:'none'}; return;
      }
      if(mode==='design' && canEdit && drawArm){
        // DIBUJAR GRADA: pincha y arrastra — según arrastras se van añadiendo butacas y filas.
        // El tamaño de butaca es el PREDOMINANTE del plano (uniforme con lo que ya haya).
        pushUndo('draw');
        var ppD=prevailingPitch();
        var nd={id:nid('s'), kind:'grid', name:'Grada nueva', x:w.x, y:w.y, rot:0, rows:1, cols:2, pitch:ppD, rowGap:Math.round(ppD*1.15)};
        sections.push(nd); selId=nd.id;
        drag={kind:'drawsec', obj:nd, w0:w};
        renderSide(); queueRender();
        return;
      }
      // SELECCIONAR (recuadro): arrastra un recuadro por el vacío para seleccionar varias butacas
      // sueltas o varios elementos; pincha uno seleccionado para mover TODO en conjunto.
      if(mode==='design' && canEdit && tool==='select'){
        var addSel=(e.shiftKey||e.metaKey||e.ctrlKey);
        if(seatEl){
          var sk=seatEl.getAttribute('data-seat'), scSel=sections.find(function(x){return x.id===sk.split('|')[0];});
          if(scSel && scSel.kind!=='floor'){
            // Grada marcada como PIEZA (dselO): pinchar sus butacas mueve el conjunto (Mayús desmarca).
            if(scSel.kind!=='points' && dselO[scSel.id]){
              selId=scSel.id;
              if(addSel){ delete dselO[scSel.id]; drag={kind:'none'}; }
              else startMultiMove(w);
              renderSide(); queueRender(); return;
            }
            selId=scSel.id;
            // Butaca YA seleccionada: arrastrarla mueve el conjunto (sueltas + piezas marcadas);
            // con Mayús se quita de la selección.
            if(dsel[sk]){
              if(addSel){ delete dsel[sk]; drag={kind:'none'}; }
              else startMultiMove(w);
              renderSide(); queueRender(); return;
            }
            // Butaca nueva: se selecciona y, SIN SOLTAR, se van seleccionando las butacas por
            // donde pases (vertical, horizontal o saliendo a OTRO sector).
            if(!addSel){ dsel={}; dselO={}; }
            dsel[sk]=1;
            drag={kind:'selpaint', done:{}, lastPt:{x:e.clientX, y:e.clientY}}; drag.done[sk]=1;
            renderSide(); queueRender(); return;
          }
        }
        if(secEl || elEl){
          var oid=(elEl?elEl.getAttribute('data-el'):secEl.getAttribute('data-sec'));
          // El plano de fondo y la silueta cubren el lienzo entero: con la herramienta de
          // seleccionar cuentan como VACÍO (recuadro); se mueven en el modo normal.
          var oSel=sections.find(function(x){return x.id===oid;})||elements.find(function(x){return x.id===oid;});
          if(oSel && (oSel.type==='bgimage' || oSel.type==='outline')){
            drag={kind:'marquee', w0:w, add:addSel}; return;
          }
          selId=oid;
          if(addSel){
            if(dselO[oid]) delete dselO[oid]; else dselO[oid]=1;
            drag={kind:'none'}; renderSide(); queueRender(); return;
          }
          // Pieza YA seleccionada: arrastrarla mueve TODO el conjunto seleccionado.
          if(dselO[oid]){ startMultiMove(w); renderSide(); queueRender(); return; }
          // Pieza nueva: se selecciona y, SIN SOLTAR, se van seleccionando los sectores y
          // elementos por los que pases (selección por zonas: luego se mueven o GIRAN a la vez
          // con el tirador del grupo).
          dsel={}; dselO={}; dselO[oid]=1;
          drag={kind:'secselpaint', done:{}, lastPt:{x:e.clientX, y:e.clientY}}; drag.done[oid]=1;
          renderSide(); queueRender(); return;
        }
        drag={kind:'marquee', w0:w, add:addSel}; return;   // vacío → recuadro
      }
      if(mode==='design' && canEdit && tool){
        // Herramienta de retoque activa: pinchar butacas aplica; pinchar un retoque puesto lo quita.
        if(tool==='stair' && stairEl){ removeStairBand(stairEl); drag={kind:'none'}; return; }
        var rowsepEl=e.target.closest('[data-rowsep]');
        if(tool==='rowsep' && rowsepEl){ removeRowSep(rowsepEl, w.x, w.y); drag={kind:'none'}; return; }
        if(tool==='renum' && seatEl){
          // El № se decide al SOLTAR: una butaca = número exacto; barriendo varias = seguidas.
          var kR=seatEl.getAttribute('data-seat');
          drag={kind:'renumdrag', seq:[kR], done:{}, lastPt:{x:e.clientX, y:e.clientY}}; drag.done[kR]=1;
          return;
        }
        if(seatEl && applyTool(seatEl)){
          drag={kind:'tooldrag', done:{}, lastPt:{x:e.clientX, y:e.clientY}};
          drag.done[seatEl.getAttribute('data-seat')]=1;   // la primera ya está aplicada
          return;
        }
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
        return;
      }
      if(mode==='cats' && canEdit){
        if(catTool==='count'){ drag={kind:'lasso', w0:w}; return; }
        if(catTool==='select'){
          if(seatEl){ toggleSel(seatEl, e); drag={kind:'seldrag', done:{}, lastPt:{x:e.clientX, y:e.clientY}}; return; }
          if(secEl){
            var sSel=sections.find(function(x){return x.id===secEl.getAttribute('data-sec');});
            var farSel = sSel && sSel.kind!=='floor' ? (sSel.pitch*px() < 9.5) : false;
            if(farSel && sSel){
              // De lejos: el sector se marca ENTERO ya, y ARRASTRANDO se van marcando enteros
              // todos los sectores que toques (selección por zonas, tipo selector del sistema).
              selectSection(sSel, e);
              drag={kind:'secdrag', done:{}, lastPt:{x:e.clientX, y:e.clientY}}; drag.done[sSel.id]=1;
              return;
            }
            drag={kind:'secmaybe', sec:(sSel?sSel.id:null), far:false, select:true, c0:{x:e.clientX,y:e.clientY}, w0:w};
            return;
          }
          drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
          return;
        }
        if(seatEl){ paintSeat(seatEl); drag={kind:'paintdrag', done:{}, lastPt:{x:e.clientX, y:e.clientY}}; return; }
        if(secEl){
          // Sobre un sector: CLIC corto pinta el sector ENTERO — pero solo de lejos (LOD sin
          // butacas); de cerca un roce con la etiqueta de fila arrasaría cientos de asignaciones.
          // ARRASTRAR desde el sector dibuja el recuadro (lazo) para pintar varias.
          var sPS=sections.find(function(x){return x.id===secEl.getAttribute('data-sec');});
          var far = sPS && sPS.kind!=='floor' ? (sPS.pitch*px() < 9.5) : true;
          drag={kind:'secmaybe', sec:(sPS?sPS.id:null), far:far, c0:{x:e.clientX,y:e.clientY}, w0:w};
          return;
        }
        // Fondo: arrastrar DESPLAZA el mapa (antes era imposible moverse mientras asignabas).
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
        return;
      }
      // ⌘/Ctrl + ARRASTRE (sin herramienta) = RECUADRO de selección ADITIVO en cualquier punto
      // (butaca, hueco o vacío): seleccionar varias butacas arrastrando, sin mover nada. El clic
      // suelto con ⌘ alterna la butaca (se resuelve al soltar, en endPointer).
      if(mode==='design' && canEdit && !tool && (e.metaKey || e.ctrlKey)){
        e.preventDefault();
        drag={kind:'marquee', w0:w, add:true};
        return;
      }
      // BUTACAS SUELTAS / detectadas: pinchar una butaca la selecciona y la mueve (en bloque si hay
      // varias seleccionadas; Mayús/Cmd añade o quita de la selección). Pinchar el cuerpo del sector
      // (fuera de las butacas) mueve el sector entero (más abajo).
      if(mode==='design' && canEdit && !tool && seatEl){
        var sk=seatEl.getAttribute('data-seat'), skSec=sk.split('|')[0];
        var sPts=sections.find(function(x){return x.id===skSec && x.kind==='points';});
        if(sPts){
          selId=skSec;
          var additive=(e.shiftKey||e.metaKey||e.ctrlKey);
          if(additive){ if(dsel[sk]) delete dsel[sk]; else dsel[sk]=1; }
          else if(!dsel[sk]){ dsel={}; dsel[sk]=1; }   // si ya estaba en el bloque, conserva el bloque
          var keys=dselKeys(), snap={};
          keys.forEach(function(k){ var pp=k.split('|'), ri=+pp[1], sl=+pp[2], st=(sPts.seats||[]).find(function(t){return (+t.row)===ri && (+t.slot)===sl;}); if(st) snap[k]={lx:+st.lx||0, ly:+st.ly||0}; });
          // Bloque FUSIONADO movido entero (todas sus butacas): las demás piezas del grupo acompañan.
          var linkedSM=null;
          if(sPts.linkGroup && keys.length>=((sPts.seats||[]).length)){
            linkedSM=sections.filter(function(x){ return x!==sPts && x.linkGroup===sPts.linkGroup; })
                             .map(function(x){ return {o:x, x:(x.kind==='arc'?x.cx:x.x), y:(x.kind==='arc'?x.cy:x.y)}; });
          }
          drag={kind:'seatmove', sec:sPts, w0:w, keys:keys, snap:snap, linked:linkedSM};
          renderSide(); queueRender();
          return;
        }
      }
      // Pinchar ENCIMA de un retoque colocado lo QUITA directamente (hueco, escalera continua,
      // banda de escalera o pasillo), sin necesidad de armar la herramienta.
      if(mode==='design' && canEdit && !tool){
        var sgDel=e.target.closest('[data-stairgroup]');
        if(sgDel){ removeStairCellAt(sgDel, w.x, w.y); drag={kind:'none'}; return; }
        if(stairEl){ removeStairBand(stairEl); drag={kind:'none'}; return; }
        var rsDel=e.target.closest('[data-rowsep]');
        if(rsDel){ removeRowSep(rsDel, w.x, w.y); drag={kind:'none'}; return; }
        if(seatEl && seatEl.getAttribute('data-kind')==='gap'){
          var kG=seatEl.getAttribute('data-seat'), ppG=kG.split('|');
          var sDel=sections.find(function(x){return x.id===ppG[0];});
          var mDel=sDel && sDel.mods ? sDel.mods[ppG[1]] : null;
          if(mDel && Array.isArray(mDel.gaps)){
            pushUndo('tool');
            var iDel=mDel.gaps.indexOf(+ppG[2]); if(iDel!==-1) mDel.gaps.splice(iDel,1);
            if(!mDel.gaps.length && !(mDel.off||[]).length && !(mDel.stairs||[]).length) delete sDel.mods[ppG[1]];
            invalidate(sDel.id); markSummary(); renderSide(); queueRender();
            drag={kind:'none'}; return;
          }
        }
      }
      // GRADAS (grid/arc/palco) sin herramienta: pinchar una BUTACA la selecciona para configurarla
      // (fila, numeración, nº de asiento; Mayús añade/quita); ARRASTRAR desde ella mueve el sector
      // entero. Se decide al soltar/mover (umbral en px de pantalla).
      if(mode==='design' && canEdit && !tool && seatEl && secEl){
        var skG2=seatEl.getAttribute('data-seat');
        var sParG=sections.find(function(x){return x.id===skG2.split('|')[0];});
        if(sParG && sParG.kind!=='points' && sParG.kind!=='floor'){
          drag={kind:'gseatmaybe', sec:sParG, key:skG2, additive:(e.shiftKey||e.metaKey||e.ctrlKey), c0:{x:e.clientX,y:e.clientY}, w0:w};
          return;
        }
      }
      // Diseñar sin herramienta (o solo lectura): seleccionar/mover o pan.
      if(mode==='design' && canEdit && (secEl||elEl)){
        selId=(secEl?secEl.getAttribute('data-sec'):elEl.getAttribute('data-el'));
        var obj=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        // Al mover otro sector/elemento se limpia la selección de butacas — se conserva solo si
        // pertenece al PROPIO grupo points pinchado (mover el grupo con sus butacas marcadas).
        if(!(obj && obj.kind==='points' && dselKeys().some(function(k){ return k.split('|')[0]===obj.id; }))) dsel={};
        drag={kind:'move', obj:obj, w0:w, o0:JSON.parse(JSON.stringify(obj))};
        renderSide(); queueRender();
      } else {
        if(mode==='design' && canEdit && (selId || dselKeys().length)){ selId=null; dsel={}; renderSide(); queueRender(); }
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
      }
    });
    // Camino REAL del puntero desde el último evento del gesto: los pointermove llegan MENOS
    // veces de lo que se mueve el ratón (y agrupados), así que un barrido rápido «salta»
    // butacas. Se recuperan los eventos coalescidos del navegador y ADEMÁS se interpola entre
    // muestras a pasos de media butaca en pantalla: los arrastres de seleccionar/pintar/retocar
    // pasan por TODAS las butacas del recorrido aunque el gesto sea rápido.
    function pointerPath(e, dragState){
      var pts = [];
      if(typeof e.getCoalescedEvents === 'function'){
        try { e.getCoalescedEvents().forEach(function(ce){ pts.push({x:ce.clientX, y:ce.clientY}); }); } catch(_e){}
      }
      if(!pts.length) pts.push({x:e.clientX, y:e.clientY});
      var step = Math.max(3, prevailingPitch()*px()*0.5);
      var out = [], prev = dragState.lastPt;
      pts.forEach(function(p){
        if(prev){
          var d = Math.hypot(p.x-prev.x, p.y-prev.y);
          var n = Math.min(80, Math.floor(d/step));
          for(var i=1;i<=n;i++) out.push({x:prev.x+(p.x-prev.x)*i/(n+1), y:prev.y+(p.y-prev.y)*i/(n+1)});
        }
        out.push(p); prev = p;
      });
      dragState.lastPt = {x:prev.x, y:prev.y};
      return out;
    }
    svg.addEventListener('pointermove', function(e){
      lastPtr = client2world(e.clientX, e.clientY);   // para «Pegar aquí» y Ctrl+V
      if(pointers[e.pointerId]) pointers[e.pointerId]={x:e.clientX,y:e.clientY};
      var ids=Object.keys(pointers);
      if(pinch0 && ids.length===2){
        var a=pointers[ids[0]], b=pointers[ids[1]], d=Math.hypot(a.x-b.x,a.y-b.y);
        var f=pinch0.d/Math.max(20,d);
        var fitP=computeFit(), maxWp=fitP?fitP.w:1e9;                 // tope de acercamiento/alejamiento
        var twp=Math.max(MIN_VIEW_W, Math.min(maxWp, pinch0.view.w*f)); f=twp/pinch0.view.w;
        view.w=pinch0.view.w*f; view.h=pinch0.view.h*f;
        var r=svg.getBoundingClientRect();
        view.x=pinch0.view.x+(pinch0.cx-r.left)/r.width*(pinch0.view.w-view.w);
        view.y=pinch0.view.y+(pinch0.cy-r.top)/r.height*(pinch0.view.h-view.h);
        clampView();
        queueRender(); return;
      }
      var seatEl = e.target.closest && e.target.closest('[data-seat]');
      if(seatEl && !drag){
        var parts=seatEl.getAttribute('data-seat').split('|');
        var sObj=sections.find(function(x){return x.id===parts[0];});
        var rowLbl = sObj ? rowLabelOf(sObj, parseInt(parts[1],10)) : parts[1];
        var aKey = assign[seatEl.getAttribute('data-seat')];
        // El número mostrado es el IMPRESO en la butaca (data-n), no la posición física: con
        // numeración der→izq, pares/impares o huecos que renumeran, ambos difieren.
        var seatNo = seatEl.getAttribute('data-n') || parts[2];
        // La viñeta va ANCLADA a la esquina inferior izquierda (no sigue al puntero: se
        // superponía justo con las butacas que estabas mirando o seleccionando).
        tip.textContent=(sObj?sObj.name:'')+' · Fila '+rowLbl+' · Butaca '+seatNo+(aKey && catById[aKey] ? ' · '+catById[aKey].name : '');
        tip.style.display='block';
      } else tip.style.display='none';
      if(!drag) return;
      if(drag.kind==='pan'){
        var s2=px();
        view.x=drag.v0.x-(e.clientX-drag.c0.x)/s2;
        view.y=drag.v0.y-(e.clientY-drag.c0.y)/s2;
        clampView();               // no dejar que el pan te lleve a zonas en blanco
        queueRender();
      } else if(drag.kind==='resize'){
        // Redimensionar por la esquina: SOLO crece/encoge hacia donde arrastras (el lado opuesto
        // queda FIJO, nada de escalar desde el centro). El delta se proyecta a los ejes locales
        // del objeto (por si está rotado) y el centro se desplaza la mitad para anclar la esquina
        // contraria.
        var wr=client2world(e.clientX,e.clientY), o5=drag.obj;
        if(!drag.pushed){ pushUndo('resize:'+(o5.id||'')); drag.pushed=true; }
        var rr=(o5.rot||0)*R, dxr=wr.x-drag.w0.x, dyr=wr.y-drag.w0.y;
        var dxl=dxr*Math.cos(rr)+dyr*Math.sin(rr), dyl=-dxr*Math.sin(rr)+dyr*Math.cos(rr);
        var nw=Math.max(20, drag.o0.w+dxl), nh=Math.max(8, drag.o0.h+dyl);
        var gw=(nw-drag.o0.w)/2, gh=(nh-drag.o0.h)/2;   // el centro acompaña a la esquina arrastrada
        o5.w=nw; o5.h=nh;
        o5.x=drag.o0.x + gw*Math.cos(rr) - gh*Math.sin(rr);
        o5.y=drag.o0.y + gw*Math.sin(rr) + gh*Math.cos(rr);
        queueRender();
      } else if(drag.kind==='move'){
        var w2=client2world(e.clientX,e.clientY), dx=w2.x-drag.w0.x, dy=w2.y-drag.w0.y, o=drag.obj;
        if(!drag.pushed){ pushUndo('move:'+(o.id||'')); drag.pushed=true; }   // una entrada por arrastre
        if(o.kind==='arc'){ o.cx=drag.o0.cx+dx; o.cy=drag.o0.cy+dy; } else { o.x=drag.o0.x+dx; o.y=drag.o0.y+dy; }
        if(o.kind) invalidate(o.id);
        applySnap(o);   // imán: enlazar con los sectores/elementos de al lado
        // GRADAS FUSIONADAS (linkGroup): las demás del grupo se mueven EN CONJUNTO con esta
        // (delta real tras el imán, para que el grupo no se descuadre).
        if(o.linkGroup){
          if(!drag.linked){
            drag.linked = sections.filter(function(x){ return x!==o && x.linkGroup===o.linkGroup; })
              .map(function(x){ return {o:x, x0:(x.kind==='arc'?x.cx:x.x), y0:(x.kind==='arc'?x.cy:x.y)}; });
          }
          var rdx=(o.kind==='arc'?o.cx-drag.o0.cx:o.x-drag.o0.x), rdy=(o.kind==='arc'?o.cy-drag.o0.cy:o.y-drag.o0.y);
          drag.linked.forEach(function(L){
            if(L.o.kind==='arc'){ L.o.cx=L.x0+rdx; L.o.cy=L.y0+rdy; } else { L.o.x=L.x0+rdx; L.o.y=L.y0+rdy; }
            invalidate(L.o.id);
          });
        }
        if(o.type==='stage') invalidate();
        queueRender();
      } else if(drag.kind==='rotate'){
        var wR=client2world(e.clientX,e.clientY);
        if(!drag.pushed){ pushUndo('rotate'); drag.pushed=true; }
        if(drag.rmode==='group'){
          // Giro del GRUPO: cada pieza orbita el centro común y gira sobre sí misma el mismo
          // ángulo (los arcos mueven su centro y suman a su orientación `dir`).
          var angG=Math.atan2(wR.y-drag.c.y, wR.x-drag.c.x), daG=angG-drag.start;
          if(e.shiftKey) daG=Math.round(daG/(15*R))*(15*R);
          var caG=Math.cos(daG), saG=Math.sin(daG);
          drag.snap.forEach(function(sn){
            var oG=sn.o;
            var nx=drag.c.x + (sn.x-drag.c.x)*caG - (sn.y-drag.c.y)*saG;
            var ny=drag.c.y + (sn.x-drag.c.x)*saG + (sn.y-drag.c.y)*caG;
            var nrot=Math.round((((sn.rot + daG/R) % 360) + 360) % 360);
            if(oG.kind==='arc'){ oG.cx=nx; oG.cy=ny; oG.dir=nrot; }
            else { oG.x=nx; oG.y=ny; oG.rot=nrot; }
            if(oG.kind) invalidate(oG.id);
            if(oG.type==='stage') invalidate();
          });
          queueRender();
        } else if(drag.rmode==='seats'){
          var ang=Math.atan2(wR.y-drag.c.y, wR.x-drag.c.x), da=ang-drag.start;
          if(e.shiftKey) da=Math.round(da/(15*R))*(15*R);
          var caR=Math.cos(da), saR=Math.sin(da), scR=drag.sec, rotLR=(scR.rot||0)*R, cLR=Math.cos(rotLR), sLR=Math.sin(rotLR);
          drag.snap.forEach(function(sn){
            if(!sn.seat) return;
            var nx=drag.c.x + (sn.x-drag.c.x)*caR - (sn.y-drag.c.y)*saR;
            var ny=drag.c.y + (sn.x-drag.c.x)*saR + (sn.y-drag.c.y)*caR;
            var ddx=nx-scR.x, ddy=ny-scR.y;
            sn.seat.lx=Math.round(ddx*cLR + ddy*sLR);
            sn.seat.ly=Math.round(-ddx*sLR + ddy*cLR);
            sn.seat.a=Math.round(sn.a0 + da/R);
          });
          invalidate(scR.id); queueRender();
        } else {
          var o6=drag.obj, ang2=Math.atan2(wR.y-drag.c.y, wR.x-drag.c.x)/R + 90;
          if(e.shiftKey) ang2=Math.round(ang2/15)*15;
          o6.rot=Math.round(((ang2%360)+360)%360);
          if(o6.kind) invalidate(o6.id);
          if(o6.type==='stage') invalidate();
          queueRender();
        }
      } else if(drag.kind==='seatmove'){
        var wm=client2world(e.clientX,e.clientY), scM=drag.sec;
        if(!drag.pushed){ pushUndo('seatmove'); drag.pushed=true; }
        var dxm=wm.x-drag.w0.x, dym=wm.y-drag.w0.y, rotLM=(scM.rot||0)*R, cLM=Math.cos(rotLM), sLM=Math.sin(rotLM);
        var dlx=dxm*cLM+dym*sLM, dly=-dxm*sLM+dym*cLM;
        drag.keys.forEach(function(k){
          var pp=k.split('|'), ri=+pp[1], sl=+pp[2], st=(scM.seats||[]).find(function(t){return (+t.row)===ri && (+t.slot)===sl;}), o0=drag.snap[k];
          if(st && o0){ st.lx=Math.round(o0.lx+dlx); st.ly=Math.round(o0.ly+dly); }
        });
        if(drag.linked) drag.linked.forEach(function(L){ var oL=L.o; if(oL.kind==='arc'){ oL.cx=L.x+dxm; oL.cy=L.y+dym; } else { oL.x=L.x+dxm; oL.y=L.y+dym; } invalidate(oL.id); });
        invalidate(scM.id); queueRender();
      } else if(drag.kind==='marquee'){
        drag.w1=client2world(e.clientX,e.clientY); drawLasso(drag.w0, drag.w1);
      } else if(drag.kind==='multimove'){
        var wM=client2world(e.clientX,e.clientY), ddx=wM.x-drag.w0.x, ddy=wM.y-drag.w0.y;
        if(!drag.pushed){ pushUndo('multimove'); drag.pushed=true; }
        var snapM=drag.snap;
        Object.keys(snapM.objs).forEach(function(id){ var s=snapM.objs[id], o=s.o; if(o.kind==='arc'){ o.cx=s.x+ddx; o.cy=s.y+ddy; } else { o.x=s.x+ddx; o.y=s.y+ddy; } if(o.kind) invalidate(o.id); if(o.type==='stage') invalidate(); });
        Object.keys(snapM.seats).forEach(function(k){ var s=snapM.seats[k], rr=(s.sec.rot||0)*R, cR=Math.cos(rr), sR=Math.sin(rr); s.seat.lx=Math.round(s.lx + ddx*cR + ddy*sR); s.seat.ly=Math.round(s.ly - ddx*sR + ddy*cR); invalidate(s.sec.id); });
        queueRender();
      } else if(drag.kind==='tooldrag' || drag.kind==='paintdrag' || drag.kind==='seldrag'){
        // OJO: con setPointerCapture los pointermove llegan retargeteados al <svg> (e.target ya
        // no es la butaca): hay que buscar el elemento REAL bajo el dedo con elementFromPoint —
        // y recorrer el CAMINO completo del puntero (pointerPath) para no saltarse butacas.
        if(drag.kind==='tooldrag' && tool==='stair') return;   // la escalera se coloca de una en una
        drag.done = drag.done || {};
        pointerPath(e, drag).forEach(function(pt){
          var under = document.elementFromPoint(pt.x, pt.y);
          var se = under && under.closest ? under.closest('[data-seat]') : null;
          if(!se) return;
          var k = se.getAttribute('data-seat');
          if(!k || drag.done[k]) return;                  // una vez por butaca y gesto (sin parpadeo)
          if(drag.kind==='paintdrag'){ drag.done[k]=1; paintSeat(se); return; }
          if(drag.kind==='seldrag'){
            if(se.getAttribute('data-kind')==='seat' && !sel[k]){ drag.done[k]=1; sel[k]=1; updateSelPop(e.clientX, e.clientY); queueRender(); }
            return;
          }
          drag.done[k] = 1;
          applyTool(se);
        });
      } else if(drag.kind==='drawsec'){
        // La grada crece hacia donde arrastres: columnas y filas según la distancia recorrida.
        var wd=client2world(e.clientX,e.clientY), od=drag.obj;
        var dxd=wd.x-drag.w0.x, dyd=wd.y-drag.w0.y;
        od.cols=Math.max(2, Math.round(Math.abs(dxd)/od.pitch)+1);
        od.rows=Math.max(1, Math.round(Math.abs(dyd)/od.rowGap)+1);
        od.x=drag.w0.x+dxd/2; od.y=drag.w0.y+dyd/2;   // crece desde el punto inicial hacia el arrastre
        // Información del dibujo ARRIBA A LA DERECHA (como la tarjeta de selección).
        var wrapD = svg.getBoundingClientRect();
        chip.style.left=(wrapD.width-240)+'px'; chip.style.top='44px';
        chip.textContent = od.rows+' filas × '+od.cols+' butacas/fila = '+(od.rows*od.cols).toLocaleString('es-ES')+' asientos';
        chip.style.display='block';
        invalidate(od.id); queueRender();
      } else if(drag.kind==='renumdrag'){
        // El barrido del № respeta el ORDEN del recorrido (pointerPath interpola en orden).
        pointerPath(e, drag).forEach(function(pt){
          var underR = document.elementFromPoint(pt.x, pt.y);
          var seR = underR && underR.closest ? underR.closest('[data-seat]') : null;
          if(seR && seR.getAttribute('data-kind')==='seat'){
            var kR2 = seR.getAttribute('data-seat');
            if(!drag.done[kR2]){ drag.done[kR2]=1; drag.seq.push(kR2); }
          }
        });
      } else if(drag.kind==='secdrag'){
        // Selección por ZONAS: cada sector que el RECORRIDO toca se marca entero (una sola vez).
        pointerPath(e, drag).forEach(function(pt){
          var underS = document.elementFromPoint(pt.x, pt.y);
          var secU = underS && underS.closest ? underS.closest('[data-sec]') : null;
          if(secU){
            var idU = secU.getAttribute('data-sec');
            if(!drag.done[idU]){
              var sU = sections.find(function(x){ return x.id===idU; });
              if(sU && sU.kind!=='floor'){ drag.done[idU]=1; selectSection(sU, e); }
            }
          }
        });
      } else if(drag.kind==='secmaybe'){
        if(Math.hypot(e.clientX-drag.c0.x, e.clientY-drag.c0.y) > 8){ drag={kind:'lasso', w0:drag.w0}; }
      } else if(drag.kind==='selpaint'){
        // Pintar-seleccionar: cada butaca por la que pasa el RECORRIDO del puntero se añade a la
        // selección (da igual la dirección o que cruce a otro sector). El panel se refresca al soltar.
        var chgP=false;
        pointerPath(e, drag).forEach(function(pt){
          var underP=document.elementFromPoint(pt.x, pt.y);
          var seatP=underP && underP.closest ? underP.closest('[data-seat]') : null;
          if(!seatP) return;
          var kP=seatP.getAttribute('data-seat');
          if(kP && !drag.done[kP] && seatP.getAttribute('data-kind')!=='gap'){
            drag.done[kP]=1; dsel[kP]=1; chgP=true;
          }
        });
        if(chgP){ updateDPop(); queueRender(); }
      } else if(drag.kind==='secselpaint'){
        // Selección por ZONAS en diseño: cada sector/elemento que el recorrido toca se añade a la
        // selección de piezas (dselO) — para luego moverlas o girarlas TODAS a la vez. El plano de
        // fondo y la silueta del recinto se ignoran (cubren todo el lienzo y se colarían solos).
        var chgO=false;
        pointerPath(e, drag).forEach(function(pt){
          var uO=document.elementFromPoint(pt.x, pt.y);
          if(!uO || !uO.closest) return;
          var idU=null;
          var seatO=uO.closest('[data-seat]');
          if(seatO){ idU=(seatO.getAttribute('data-seat')||'').split('|')[0]; }
          else {
            var elO=uO.closest('[data-sec],[data-el]');
            if(elO) idU=elO.getAttribute('data-sec')||elO.getAttribute('data-el');
          }
          if(!idU || drag.done[idU]) return;
          drag.done[idU]=1;
          var oSw=sections.find(function(x){return x.id===idU;})||elements.find(function(x){return x.id===idU;});
          if(oSw && oSw.type!=='bgimage' && oSw.type!=='outline'){ dselO[idU]=1; chgO=true; }
        });
        if(chgO) queueRender();
      } else if(drag.kind==='gseatmaybe'){
        // Se empezó a ARRASTRAR desde una butaca de grada → mover el sector entero (el undo lo
        // apunta la propia rama 'move' en su primer tick).
        if(Math.hypot(e.clientX-drag.c0.x, e.clientY-drag.c0.y) > 6){
          selId=drag.sec.id; dsel={}; dselO={};
          drag={kind:'move', obj:drag.sec, w0:drag.w0, o0:JSON.parse(JSON.stringify(drag.sec))};
          renderSide(); queueRender();
        }
      } else if(drag.kind==='lasso'){
        drag.w1=client2world(e.clientX,e.clientY);
        var r3=svg.getBoundingClientRect();
        chip.style.left=(e.clientX-r3.left)+'px'; chip.style.top=(e.clientY-r3.top)+'px';
        queueRender();   // el conteo y el rectángulo se pintan en el rAF (no a 120 Hz de puntero)
      }
    });
    // FUSIONAR GRADAS/BLOQUES: al soltar una pieza PEGADA a otra (borde con borde) se ofrece
    // unirlas. Siguen siendo sectores distintos, pero quedan enlazadas (linkGroup) y se mueven en
    // conjunto. La pregunta es una TARJETA propia dentro del lienzo (no un confirm(): los diálogos
    // nativos expulsan de la pantalla completa) — se descarta sola al seguir trabajando.
    var askEl=null;
    function dismissAsk(){ if(askEl && askEl.parentNode) askEl.parentNode.removeChild(askEl); askEl=null; }
    function offerMergeUI(s, t){
      dismissAsk();
      askEl=document.createElement('div');
      askEl.className='vmap-ask';
      askEl.innerHTML=
        '<div class="vmap-ask-msg"><b>«'+esc(s.name||'Bloque')+'»</b> ha quedado pegado a <b>«'+esc(t.name||'Bloque')+'»</b>. ¿Unirlos en un solo bloque?</div>'+
        '<div class="vmap-ask-note">Seguirán siendo sectores distintos, pero se moverán en conjunto.</div>'+
        '<div class="vmap-ask-btns">'+
          '<button type="button" class="btn btn-sm btn-danger" data-ask="yes"><i class="fa fa-link me-1"></i>Unir</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-ask="no">Ahora no</button>'+
        '</div>';
      askEl.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
      askEl.addEventListener('click', function(ev){
        var b=ev.target.closest('[data-ask]'); if(!b) return;
        if(b.getAttribute('data-ask')==='yes'){
          pushUndo('merge');
          var gidM=t.linkGroup || s.linkGroup || nid('lg');
          t.linkGroup=gidM; s.linkGroup=gidM;
          renderSide(); markSummary(); queueRender();
        }
        dismissAsk();
      });
      // Dentro del lienzo (posicionado y presente también en pantalla completa nativa).
      var cv=host.querySelector('.vmap-canvas') || host;
      cv.appendChild(askEl);
    }
    // Bordes de las BUTACAS (el bbox de secRows va inflado un paso por cada lado).
    function seatBoxOf(s){
      var bb=bboxOf(s), p=(s.pitch||26);
      return {x:bb.x+p, y:bb.y+p, w:Math.max(1, bb.w-2*p), h:Math.max(1, bb.h-2*p)};
    }
    // skipIds: piezas que se movieron EN EL MISMO arrastre (no se han «acercado» entre sí).
    function maybeOfferMerge(s, skipIds){
      if(!s || (s.kind!=='grid' && s.kind!=='box' && s.kind!=='points')) return false;
      var bb=seatBoxOf(s);
      for(var i=0;i<sections.length;i++){
        var t=sections[i];
        if(t===s || (t.kind!=='grid' && t.kind!=='box' && t.kind!=='points')) continue;
        if(skipIds && skipIds[t.id]) continue;
        if(s.linkGroup && s.linkGroup===t.linkGroup) continue;
        var db=seatBoxOf(t), m=Math.max(s.pitch||26, t.pitch||26);
        var gapX=Math.max(db.x-(bb.x+bb.w), bb.x-(db.x+db.w));
        var gapY=Math.max(db.y-(bb.y+bb.h), bb.y-(db.y+db.h));
        // Pegadas = butacas a menos de ~2 pasos por algún lado…
        if(Math.max(gapX, gapY) > m*2.2) continue;
        // …sin estar montada una encima de la otra (solape profundo de las dos cajas).
        if(gapX<0 && gapY<0){
          var ovl=(-gapX)*(-gapY), minA=Math.min(bb.w*bb.h, db.w*db.h);
          if(minA>0 && ovl/minA > 0.25) continue;
        }
        offerMergeUI(s, t);
        return true;
      }
      return false;
    }
    function endPointer(e){
      delete pointers[e.pointerId];
      if(Object.keys(pointers).length<2) pinch0=null;
      if(drag && drag.kind==='move' && drag.pushed && drag.obj && drag.obj.kind){ maybeOfferMerge(drag.obj); }
      // La fusión también se ofrece al mover bloques POR SELECCIÓN (recuadro/Seleccionar) o
      // arrastrando TODAS las butacas de un bloque detectado — es como se mueven los points.
      if(drag && drag.kind==='multimove' && drag.pushed && drag.snap){
        var movedM=[], skipM={};
        Object.keys(drag.snap.objs||{}).forEach(function(id){
          var o=drag.snap.objs[id].o;
          if(o && o.kind){ skipM[o.id]=1; movedM.push(o); }
        });
        var cntM={};
        Object.keys(drag.snap.seats||{}).forEach(function(k){ var scc=drag.snap.seats[k].sec; cntM[scc.id]=(cntM[scc.id]||0)+1; });
        Object.keys(cntM).forEach(function(id){
          if(skipM[id]) return;
          var scc=sections.find(function(x){return x.id===id;});
          if(scc && cntM[id] >= ((scc.seats||[]).length)){ skipM[id]=1; movedM.push(scc); }
        });
        for(var iM=0; iM<movedM.length; iM++){ if(maybeOfferMerge(movedM[iM], skipM)) break; }
      }
      if(drag && drag.kind==='seatmove' && drag.pushed && drag.sec && (drag.keys||[]).length >= ((drag.sec.seats||[]).length)){
        maybeOfferMerge(drag.sec);
      }
      if(drag && drag.kind==='drawsec'){
        // Fin del dibujo: si apenas se arrastró, se descarta. Como el resto de piezas nuevas, la
        // grada dibujada NO se queda marcada (pincha en ella si quieres afinar sus parámetros).
        chip.style.display='none';
        var od2 = drag.obj; drag=null; drawArm=false;
        if(od2.cols<2 && od2.rows<2){ sections=sections.filter(function(x){return x.id!==od2.id;}); undoStack.pop(); }
        selId=null;
        renderSide(); markSummary();
        return;
      }
      if(drag && drag.kind==='renumdrag'){
        var seqR = drag.seq.slice(); drag=null;
        applyRenum(seqR);
        chip.style.display='none'; clearLasso(); queueRender();
        return;
      }
      if(drag && drag.kind==='marquee'){
        if(drag.w1) marqueeSelect(drag.w0, drag.w1, drag.add);
        else if(drag.add){
          // ⌘+clic SUELTO (sin arrastre): alternar la butaca bajo el puntero en la selección.
          var underM=document.elementFromPoint(e.clientX, e.clientY);
          var seatM=underM && underM.closest ? underM.closest('[data-seat]') : null;
          if(seatM){
            var kM=seatM.getAttribute('data-seat');
            if(dsel[kM]) delete dsel[kM]; else dsel[kM]=1;
            selId=kM.split('|')[0];
          }
        }
        else { dsel={}; dselO={}; }   // clic sin arrastre en vacío: vacía la selección
        drag=null; clearLasso(); renderSide(); queueRender(); return;
      }
      if(drag && drag.kind==='selpaint' || drag && drag.kind==='secselpaint'){
        drag=null; renderSide(); queueRender(); return;
      }
      if(drag && drag.kind==='gseatmaybe'){
        // Clic corto sobre una butaca de GRADA: seleccionarla para configurar (Mayús añade/quita
        // SIN tocar las piezas marcadas como objeto, igual que las demás ramas aditivas).
        selId=drag.sec.id;
        if(drag.additive){ if(dsel[drag.key]) delete dsel[drag.key]; else dsel[drag.key]=1; }
        else if(!dsel[drag.key]){ dsel={}; dselO={}; dsel[drag.key]=1; }
        drag=null; renderSide(); queueRender(); return;
      }
      if(drag && drag.kind==='secmaybe' && drag.sec){
        // Clic corto sobre el sector (no llegó a arrastre), solo de lejos: seleccionar o pintar entero.
        if(drag.far){
          var sPS=sections.find(function(x){return x.id===drag.sec;});
          if(sPS){ if(drag.select) selectSection(sPS, e); else paintSection(sPS); }
        }
      } else if(drag && drag.kind==='lasso' && drag.w1 && mode==='cats'){
        if(catTool==='select'){
          eachSeatInRect(drag.w0, drag.w1, function(key){ sel[key]=1; });
          updateSelPop(e.clientX, e.clientY); queueRender();
        } else if(catTool!=='count'){
          pushUndo('lasso');
          eachSeatInRect(drag.w0, drag.w1, function(key){ if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key]=activeCat; });
          markSummary();
        }
      }
      drag=null; chip.style.display='none'; clearLasso(); queueRender();
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);

    /* ================= Guardar ================= */
    function compressAssignments(){
      // "sec|fila|slot" → { sec: { fila: [[desde, hasta, cat], …], __floor: cat } } (rangos compactos).
      // Antes se DEPURAN las claves huérfanas (butacas que ya no existen tras encoger la sección,
      // cortar una escalera o poner huecos): no se cuentan ni se persisten.
      var secById = {}; sections.forEach(function(s){ secById[s.id]=s; });
      var by = {};
      Object.keys(assign).forEach(function(k){
        if(!seatIsValid(secById, k)){ delete assign[k]; return; }
        var p = k.split('|');
        (by[p[0]] = by[p[0]] || {});
        (by[p[0]][p[1]] = by[p[0]][p[1]] || []).push({slot:parseInt(p[2],10), cat:assign[k]});
      });
      var out = {};
      Object.keys(by).forEach(function(sec){
        out[sec] = {};
        Object.keys(by[sec]).forEach(function(row){
          var items = by[sec][row].sort(function(a,b){ return a.slot-b.slot; });
          var ranges = [], cur=null;
          items.forEach(function(it){
            if(cur && it.slot===cur[1]+1 && it.cat===cur[2]) cur[1]=it.slot;
            else { cur=[it.slot, it.slot, it.cat]; ranges.push(cur); }
          });
          out[sec][row] = ranges;
        });
      });
      Object.keys(floorCat).forEach(function(sec){ (out[sec] = out[sec] || {}).__floor = floorCat[sec]; });
      return out;
    }
    var saveBtn = host.querySelector('[data-vm-save]');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      // EL MAPA MANDA: si hay categorías asignadas sobre el plano, al guardar se REEMPLAZA la
      // tabla de ticketing del recinto por lo configurado aquí. Avisar antes.
      var hasAssign = Object.keys(assign).some(function(k){ return assign[k]; }) || Object.keys(floorCat).length > 0;
      if(hasAssign && !window.confirm('El ticketing del recinto se reemplazará por lo configurado en el plano (categorías y aforos del mapa). ¿Guardar?')) return;
      var body = { version: mapVersion,
                   // Formato activo (subpestañas de la ficha del recinto); vacío = el principal.
                   map_id: host.dataset.mapId || '',
                   layout: { version:1, next: nextId, sections: sections, elements: elements, categories: cats },
                   assignments: compressAssignments() };
      saveBtn.disabled = true;
      var orig = saveBtn.innerHTML;
      saveBtn.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i>Guardando…';
      fetch(saveUrl, {method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, body: JSON.stringify(body)})
        .then(function(res){ return res.json().then(function(j){ return {ok:res.ok, j:j}; }); })
        .then(function(r){
          if(r.ok && r.j.ok){
            mapVersion = r.j.version;
            if(r.j.id && !host.dataset.mapId) host.dataset.mapId = r.j.id;   // primer guardado: fija el formato
            saveBtn.innerHTML = '<i class="fa fa-check me-1"></i>Guardado';
            // Guardado OK → SALIR del modo edición: la página vuelve al VISOR (solo el plano con
            // las categorías a la izquierda y las herramientas de navegación; las de edición
            // solo se ven en modo edición, con «Editar mapa»).
            try {
              var uV = new URL(window.location.href);
              uV.searchParams.delete('map_edit');
              uV.searchParams.set('tab', 'ticketing');
              if(host.dataset.mapId) uV.searchParams.set('map', host.dataset.mapId);
              window.location.assign(uV.toString());
            } catch(_e){ window.location.reload(); }
          } else {
            alert((r.j && r.j.error) || 'No se pudo guardar el mapa.');
            saveBtn.innerHTML = orig; saveBtn.disabled=false;
          }
        })
        .catch(function(){ alert('No se pudo guardar el mapa.'); saveBtn.innerHTML = orig; saveBtn.disabled=false; });
    });

    window.addEventListener('resize', queueRender);
    setHint(); renderSide();
    // El encuadre inicial espera al layout (clientWidth/Height aún son 0 al ejecutar el script).
    requestAnimationFrame(function(){ fitAll(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
