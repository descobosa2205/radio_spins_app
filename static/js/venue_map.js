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
 * Render en UN solo SVG con pan/zoom (rueda + pellizco iPad) y 3 niveles de detalle (LOD);
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

  function init(){
    var host = document.querySelector('[data-venue-map]');
    if(!host || host.dataset.vmapBound === '1') return;
    host.dataset.vmapBound = '1';
    var canEdit = host.dataset.canEdit === '1';
    var saveUrl = host.dataset.saveUrl || '';

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
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-vm-zout aria-label="Alejar">−</button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-vm-zin aria-label="Acercar">+</button>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-vm-fit>Ver todo</button>' +
          (canEdit && saveUrl ? '<button type="button" class="btn btn-sm btn-danger ms-2" data-vm-save><i class="fa fa-check me-1"></i>Guardar mapa</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="vmap-body">' +
        '<div class="vmap-canvas"><svg data-vm-svg xmlns="http://www.w3.org/2000/svg">' +
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
    var view = {x:-1700, y:-1500, w:3400, h:3000};
    var mode = 'design';         // design | cats
    var tool = null;             // diseño: gap | off | stair (retoques) — null = seleccionar/mover
    var catTool = 'paint';       // categorías: paint | count | erase
    var activeCat = cats.length ? cats[0].id : null;
    var selId = null;
    var raf = null;
    var geomCache = {};          // secciones: filas+bbox derivadas (se invalida al editar)
    function invalidate(id){ if(id) delete geomCache[id]; else geomCache = {}; }

    function px(){ return (svg.clientWidth || 1) / view.w; }
    function esc(t){ return String(t==null?'':t).replace(/[<>&"]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }
    function client2world(cx,cy){
      var r = svg.getBoundingClientRect();
      return { x: view.x + (cx-r.left)/r.width*view.w, y: view.y + (cy-r.top)/r.height*view.h };
    }
    function stageCenter(){
      var st = elements.find(function(el){ return el.type==='stage'; });
      return st ? {x:st.x, y:st.y} : null;
    }

    /* ================= Geometría derivada ================= */
    function numOf(s){
      var n = s.num || {};
      var st = parseInt(n.start,10); if(isNaN(st)) st = 1;   // 0 es válido (hay recintos que numeran desde 0)
      return { start: st, step: parseInt(n.step||1,10)||1, dir: (n.dir==='rtl'?'rtl':'ltr') };
    }
    function rowLabelOf(s, rowIdx){ return (s.rowScheme==='alpha') ? alphaLabel(rowIdx) : String(rowIdx); }
    function modsOf(s, rowIdx){
      var m = (s.mods || {})[String(rowIdx)] || {};
      return { gaps: m.gaps || [], off: m.off || [] };
    }

    // Filas de una sección con todo aplicado: escaleras integradas (cortes), huecos/apagadas por
    // butaca, numeración (inicio/paso/sentido + política de hueco) y orientación hacia el escenario.
    function secRows(s){
      if(geomCache[s.id]) return geomCache[s.id];
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
          var radius = s.r0 + r*s.rowGap;
          var count = Math.max(2, Math.floor((radius * s.span * R) / s.pitch));
          for(i=0;i<count;i++){
            var frac = (i+.5)/count;
            var t = (s.dir - s.span/2 + frac*s.span) * R;
            var inStair = stairs.some(function(b){ return Math.abs(frac - b.at) * s.span * R * radius < (b.w*s.pitch)/2 + s.pitch*.5; });
            slots.push({ slot:i+1, frac:frac, x:s.cx + radius*Math.cos(t), y:s.cy + radius*Math.sin(t),
                         a: t/R + (flip? -90 : 90), inStair:inStair });
          }
        } else {
          var cr = Math.cos(s.rot*R), sr = Math.sin(s.rot*R), width = s.cols*s.pitch;
          for(i=0;i<s.cols;i++){
            var lx = (i-(s.cols-1)/2)*s.pitch, ly = (r-(s.rows-1)/2)*s.rowGap;
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
          sl.state = sl.inStair ? 'stair' : (mods.gaps.indexOf(sl.slot)!==-1 ? 'gap' : (mods.off.indexOf(sl.slot)!==-1 ? 'off' : 'seat'));
        });
        var ordered = (nm.dir==='rtl') ? slots.slice().reverse() : slots;
        var counter = nm.start;
        ordered.forEach(function(sl){
          if(sl.state==='stair'){ sl.n=null; return; }
          if(sl.state==='gap'){ sl.n=null; if((s.gapPolicy||'skip')==='skip') counter += nm.step; return; }
          sl.n = counter; counter += nm.step;
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
    function arcBandPath(s){
      var a0=(s.dir-s.span/2)*R, a1=(s.dir+s.span/2)*R, rIn=s.r0-s.pitch*.7, rOut=s.r0+(s.rows-1)*s.rowGap+s.pitch*.7;
      var la = s.span>180?1:0;
      function pt(rr,aa){ return (s.cx+rr*Math.cos(aa))+' '+(s.cy+rr*Math.sin(aa)); }
      return 'M'+pt(rOut,a0)+' A'+rOut+' '+rOut+' 0 '+la+' 1 '+pt(rOut,a1)+
             ' L'+pt(rIn,a1)+' A'+rIn+' '+rIn+' 0 '+la+' 0 '+pt(rIn,a0)+' Z';
    }
    function gridOutline(s){
      var hw=(s.cols-1)/2*s.pitch+s.pitch*.7, hh=(s.rows-1)/2*s.rowGap+s.rowGap*.6;
      return {x:-hw, y:-hh, w:2*hw, h:2*hh};
    }
    // Franjas de las escaleras integradas de una sección (para pintarlas y poder quitarlas).
    function stairBandSvg(s, scale){
      var out=[], bands = Array.isArray(s.stairs)? s.stairs : [];
      bands.forEach(function(b, idx){
        var half = (b.w*s.pitch)/2, steps='', d='';
        if(s.kind==='arc'){
          var ang = (s.dir - s.span/2 + b.at*s.span)*R;
          var rIn = s.r0 - s.pitch*.6, rOut = s.r0 + (s.rows-1)*s.rowGap + s.pitch*.6;
          function pt(rr, side){ var ha = half/rr; return (s.cx+rr*Math.cos(ang+side*ha))+' '+(s.cy+rr*Math.sin(ang+side*ha)); }
          d = 'M'+pt(rIn,-1)+' L'+pt(rOut,-1)+' L'+pt(rOut,1)+' L'+pt(rIn,1)+' Z';
          for(var k=1;k<7;k++){ var rr = rIn + (rOut-rIn)*k/7, ha2 = half/rr;
            steps += '<line x1="'+(s.cx+rr*Math.cos(ang-ha2))+'" y1="'+(s.cy+rr*Math.sin(ang-ha2))+'" x2="'+(s.cx+rr*Math.cos(ang+ha2))+'" y2="'+(s.cy+rr*Math.sin(ang+ha2))+'" style="stroke:#007CA2;stroke-width:'+Math.max(2, s.pitch*.09)+'"/>'; }
        } else {
          var cr = Math.cos(s.rot*R), sr = Math.sin(s.rot*R), width = s.cols*s.pitch;
          var xAt = (b.at-.5)*width, y0 = -(s.rows-1)/2*s.rowGap - s.pitch*.6, y1 = ((s.rows-1)/2)*s.rowGap + s.pitch*.6;
          function tp(lx,ly){ return (s.x + lx*cr - ly*sr)+' '+(s.y + lx*sr + ly*cr); }
          d = 'M'+tp(xAt-half,y0)+' L'+tp(xAt-half,y1)+' L'+tp(xAt+half,y1)+' L'+tp(xAt+half,y0)+' Z';
          for(var k2=1;k2<7;k2++){ var yy = y0 + (y1-y0)*k2/7;
            steps += '<line x1="'+tp(xAt-half,yy).split(' ')[0]+'" y1="'+tp(xAt-half,yy).split(' ')[1]+'" x2="'+tp(xAt+half,yy).split(' ')[0]+'" y2="'+tp(xAt+half,yy).split(' ')[1]+'" style="stroke:#007CA2;stroke-width:'+Math.max(2, s.pitch*.09)+'"/>'; }
        }
        out.push('<g data-stairband="'+s.id+'|'+idx+'" style="cursor:pointer"><path d="'+d+'" style="fill:rgba(0,124,162,.08);stroke:#007CA2;stroke-width:'+(1.6/scale)+';stroke-dasharray:'+(6/scale)+' '+(4/scale)+'"/>'+steps+'</g>');
      });
      return out.join('');
    }

    /* ================= Render con LOD ================= */
    function catColor(key){ var c=assign[key]; return c && catById[c] ? catById[c].color : null; }

    function render(){
      raf = null;
      svg.setAttribute('viewBox', view.x+' '+view.y+' '+view.w+' '+view.h);
      var scale = px(), out = [], vx0=view.x, vy0=view.y, vx1=view.x+view.w, vy1=view.y+view.h;

      // 1) SILUETA del recinto (siempre detrás de todo).
      elements.forEach(function(el){
        if(el.type!=='outline') return;
        var sel = (mode==='design' && canEdit && el.id===selId)? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';
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
        var isSel = (mode==='design' && canEdit && s.id===selId);
        var selCss = isSel? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';

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
          var lbl = s.name || '';
          if(s.kind==='arc'){
            var mid=(s.dir)*R, rMid=s.r0+(s.rows-1)*s.rowGap/2;
            out.push('<g data-sec="'+s.id+'" style="cursor:pointer"><path d="'+arcBandPath(s)+'" style="fill:#d7dee6;opacity:.95;stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/>'+
              '<text x="'+(s.cx+rMid*Math.cos(mid))+'" y="'+(s.cy+rMid*Math.sin(mid))+'" text-anchor="middle" dominant-baseline="middle" style="font:700 '+(s.rows*s.rowGap*.36)+'px system-ui;fill:#5b6673">'+esc(lbl)+'</text></g>');
          } else {
            var o=gridOutline(s);
            out.push('<g data-sec="'+s.id+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="cursor:pointer">'+
              '<rect x="'+o.x+'" y="'+o.y+'" width="'+o.w+'" height="'+o.h+'" rx="14" style="fill:'+(isBox?'#f3e9d4':'#d7dee6')+';opacity:.95;stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/>'+
              '<text text-anchor="middle" dominant-baseline="middle" style="font:700 '+(o.h*.26)+'px system-ui;fill:#5b6673">'+esc(lbl)+'</text></g>');
          }
        } else if(pitchPx < 9.5){
          var sw = Math.max(s.pitch*.62, 10);
          var g = ['<g data-sec="'+s.id+'" style="cursor:pointer">'];
          if(s.kind==='arc') g.push('<path d="'+arcBandPath(s)+'" style="fill:#fff;fill-opacity:0.01'+(isSel?selCss:'')+'"/>');
          else { var go=gridOutline(s); g.push('<rect x="'+go.x+'" y="'+go.y+'" width="'+go.w+'" height="'+go.h+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="fill:#fff;fill-opacity:0.01'+(isSel?selCss:'')+'"/>'); }
          // Filas partidas en runs por hueco/escalera; cada run coloreado por su asignación.
          geo.rows.forEach(function(row){
            var runs=[], cur=null;
            row.seats.forEach(function(p){
              if(p.state==='stair' || p.state==='gap'){ cur=null; return; }
              var col = (p.state==='off') ? '#d7dbe2' : (catColor(s.id+'|'+row.rowIdx+'|'+p.slot) || '#c3ccd6');
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
        } else {
          var size = s.pitch*.86, half=size/2, showNum = pitchPx>=15, showRowLbl = pitchPx>=13;
          var g2=['<g data-sec="'+s.id+'">'];
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
            row.seats.forEach(function(p){
              if(p.state==='stair') return;
              if(p.x<vx0-size||p.x>vx1+size||p.y<vy0-size||p.y>vy1+size) return;
              var key = s.id+'|'+row.rowIdx+'|'+p.slot;
              if(p.state==='gap'){
                // Hueco (no hay butaca): celda discontinua; clicable para quitarlo con la herramienta.
                g2.push('<g data-seat="'+key+'" data-kind="gap" data-frac="'+p.frac.toFixed(4)+'" transform="translate('+p.x+' '+p.y+') rotate('+p.a.toFixed(1)+')" style="cursor:pointer">'+
                  '<rect x="'+(-half)+'" y="'+(-half)+'" width="'+size+'" height="'+size+'" rx="'+(size*.24)+'" style="fill:transparent;stroke:#d5dbe2;stroke-width:'+(size*.05)+';stroke-dasharray:'+(size*.16)+' '+(size*.12)+'"/></g>');
                return;
              }
              var col = catColor(key);
              var isOff = p.state==='off';
              var fill = isOff ? '#d7dbe2' : (col ? col+'22' : '#effaf2');
              var stroke = isOff ? '#c3c9d2' : (col || '#cfe4d6');
              var ink = isOff ? '#7b838f' : (col || '#16803a');
              g2.push('<g data-seat="'+key+'" data-kind="'+p.state+'" data-n="'+(p.n!=null?p.n:'')+'" data-frac="'+p.frac.toFixed(4)+'" transform="translate('+p.x+' '+p.y+') rotate('+p.a.toFixed(1)+')" style="cursor:pointer">'+
                '<rect x="'+(-half)+'" y="'+(-half)+'" width="'+size+'" height="'+size+'" rx="'+(size*.24)+'" style="fill:'+fill+';stroke:'+stroke+';stroke-width:'+(size*.05)+'"/>'+
                '<use href="#vmSeatIcon" x="'+(-size*.30)+'" y="'+(-size*.34)+'" width="'+(size*.6)+'" height="'+(size*.45)+'" style="fill:'+ink+'"/>'+
                (showNum && p.n!=null? '<text y="'+(size*.33)+'" text-anchor="middle" style="font:600 '+(size*.30)+'px system-ui;fill:'+ink+'">'+p.n+'</text>' : '')+
              '</g>');
            });
          });
          g2.push('</g>');
          out.push(g2.join(''));
          out.push(stairBandSvg(s, scale));
        }
      });

      // 3) ELEMENTOS de pista/servicios (encima de las secciones; la silueta ya fue).
      elements.forEach(function(el){
        if(el.type==='outline') return;
        var sel = (mode==='design' && canEdit && el.id===selId)? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';
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
    function slider(lbl,key,min,max,stepv,val,suf){
      return '<div class="vmap-param"><label>'+lbl+'</label><input type="range" data-p="'+key+'" min="'+min+'" max="'+max+'" step="'+stepv+'" value="'+val+'"><output>'+val+(suf||'')+'</output></div>';
    }
    function toolChip(key, icon, label){
      return '<button type="button" class="btn btn-sm '+(tool===key?'btn-primary':'btn-outline-secondary')+'" data-tool="'+key+'" title="Pínchalo y luego pincha en el plano (o arrástralo hasta una butaca)">'+icon+' '+label+'</button>';
    }
    function renderSide(){
      if(!side) return;
      var html = '';
      if(mode==='design'){
        if(!sections.length && !elements.length){
          html += '<h6 class="vmap-h">Empezar con plantilla</h6><div class="vmap-tools">'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="arena">Arena (anillo + pista)</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="teatro">Teatro (abanico)</button></div>';
        }
        html += '<h6 class="vmap-h">Gradas y zonas</h6><div class="vmap-tools">'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="arc">+ Grada curva</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="grid">+ Grada recta</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="box">+ Palco</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="floor">+ Zona de pie</button></div>';
        html += '<h6 class="vmap-h">Pista</h6><div class="vmap-tools">'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="stage">+ Escenario</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="catwalk">+ Pasarela</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="mix">+ Torre mix</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="delay">+ Torre delay</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="pmr">+ Plataforma PMR</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="pit">+ Foso fotógrafos</button></div>';
        html += '<h6 class="vmap-h">Servicios</h6><div class="vmap-tools">'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="wc">+ Baños</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="wc_pmr">+ Baños PMR</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="merch">+ Merchandising</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="bar">+ Barra</button></div>';
        html += '<h6 class="vmap-h">Recinto</h6><div class="vmap-tools">'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="outline">+ Silueta del recinto</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="door">+ Puerta de acceso</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="stair">+ Escalera suelta</button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="rail">+ Barandilla</button></div>';
        html += '<h6 class="vmap-h">Retoques por butaca <i class="fa fa-circle-info text-muted" title="Activa una herramienta y pincha una butaca del plano (acércate hasta ver las butacas). Hueco = no existe la butaca; Apagada = existe pero no se ofrece; Escalera = pasillo que parte el sector de arriba abajo. Pincha un retoque ya puesto para quitarlo."></i></h6>'+
          '<div class="vmap-tools" data-tool-chips>'+
          toolChip('gap','▢','Hueco')+toolChip('off','◼','Apagada')+toolChip('stair','☰','Escalera')+'</div>';

        var s = sections.find(function(x){return x.id===selId;});
        var el = elements.find(function(x){return x.id===selId;});
        if(s){
          html += '<h6 class="vmap-h">Sección: '+esc(s.name||'')+'</h6>';
          html += '<div class="vmap-param"><label>Nombre</label><input type="text" class="form-control form-control-sm" data-p="name" value="'+esc(s.name||'')+'"></div>';
          if(s.kind!=='floor'){
            html += '<div class="vmap-param"><label>Alias <i class="fa fa-circle-info text-muted" title="Otros nombres con los que las ticketeras llaman a este sector en los PDF (separados por comas)."></i></label><input type="text" class="form-control form-control-sm" data-p="aliases" value="'+esc(s.aliases||'')+'" placeholder="201, SECTOR 201"></div>';
          }
          if(s.kind==='arc'){
            html += slider('Filas','rows',1,40,1,s.rows)
                  + slider('Amplitud','span',6,180,1,s.span,'°')
                  + slider('Orientación','dir',-180,180,1,s.dir,'°')
                  + slider('Radio','r0',150,2600,10,s.r0)
                  + slider('Paso butaca','pitch',18,44,1,s.pitch)
                  + slider('Paso fila','rowGap',20,60,1,s.rowGap);
          } else if(s.kind==='grid' || s.kind==='box'){
            html += slider('Filas','rows',1,(s.kind==='box'?4:60),1,s.rows) + slider('Butacas/fila','cols',1,(s.kind==='box'?10:80),1,s.cols)
                  + slider('Rotación','rot',-180,180,1,s.rot,'°')
                  + slider('Paso butaca','pitch',16,44,1,s.pitch)
                  + slider('Paso fila','rowGap',18,60,1,s.rowGap);
          } else {
            html += slider('Ancho','w',120,2400,10,s.w) + slider('Alto','h',120,2400,10,s.h)
                  + slider('Aforo de pie','cap',0,30000,50,s.cap) + slider('Rotación','rot',-180,180,1,s.rot,'°');
          }
          if(s.kind!=='floor'){
            var nm = numOf(s);
            html += '<div class="vmap-numrow"><label>Butacas</label>'+
              '<input type="number" class="form-control form-control-sm" data-p="num_start" value="'+nm.start+'" min="0" title="Primera butaca">'+
              '<select class="form-select form-select-sm" data-p="num_step"><option value="1"'+(nm.step===1?' selected':'')+'>1,2,3…</option><option value="2"'+(nm.step===2?' selected':'')+'>pares/impares</option></select>'+
              '<select class="form-select form-select-sm" data-p="num_dir"><option value="ltr"'+(nm.dir==='ltr'?' selected':'')+'>Izq → der</option><option value="rtl"'+(nm.dir==='rtl'?' selected':'')+'>Der → izq</option></select></div>';
            html += '<div class="vmap-numrow vmap-numrow--2"><label>Filas</label>'+
              '<select class="form-select form-select-sm" data-p="rowScheme"><option value="num"'+((s.rowScheme||'num')==='num'?' selected':'')+'>1, 2, 3…</option><option value="alpha"'+(s.rowScheme==='alpha'?' selected':'')+'>A, B, C…</option></select>'+
              '<select class="form-select form-select-sm" data-p="gapPolicy" title="Qué pasa con la numeración al poner un HUECO"><option value="skip"'+((s.gapPolicy||'skip')==='skip'?' selected':'')+'>Hueco salta nº</option><option value="renumber"'+(s.gapPolicy==='renumber'?' selected':'')+'>Hueco renumera</option></select></div>';
            var nStairs = (s.stairs||[]).length, nMods = 0;
            Object.keys(s.mods||{}).forEach(function(k){ var m=s.mods[k]; nMods += (m.gaps||[]).length + (m.off||[]).length; });
            if(nStairs || nMods) html += '<p class="text-muted small mb-0 mt-1">Retoques: '+nMods+' butaca(s) · '+nStairs+' escalera(s) integrada(s).</p>';
          }
          html += '<div class="vmap-tools mt-2">'+
            (s.kind==='arc' ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="ring">⟳ Repetir en anillo</button><input type="number" class="form-control form-control-sm vmap-ringn" data-ring-n value="12" min="2" max="40" title="Nº de sectores del anillo">' : '')+
            '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button>'+
            '<button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
          if(s.kind!=='floor') html += '<p class="text-muted small mt-2 mb-0">Butacas de esta sección: <b>'+seatCount(s).toLocaleString('es-ES')+'</b></p>';
        } else if(el){
          html += '<h6 class="vmap-h">Elemento: '+esc(el.label|| (el.type==='outline'?'Silueta del recinto':''))+'</h6>';
          if(el.type!=='outline') html += '<div class="vmap-param"><label>Etiqueta</label><input type="text" class="form-control form-control-sm" data-p="label" value="'+esc(el.label||'')+'"></div>';
          html += slider('Ancho','w',30,4000,5,el.w||100) + slider('Alto','h',8,4000,5,el.h||100)
                + slider('Rotación','rot',-180,180,1,el.rot||0,'°');
          if(el.type==='outline') html += slider('Redondez','corner',0,100,1,(el.corner!=null?el.corner:60),'%');
          if(el.type==='stage'){
            html += '<h6 class="vmap-h">Provocador <i class="fa fa-circle-info text-muted" title="Extensión del escenario hacia la pista. Déjalo a 0 si no hay."></i></h6>'
                  + slider('Largo','extL',0,900,5,el.extL||0) + slider('Ancho','extW',0,500,5,el.extW||0);
          }
          html += '<div class="vmap-tools mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
        } else {
          html += '<h6 class="vmap-h">Sección</h6><p class="text-muted small mb-0">Pincha un sector o elemento del plano para editar sus parámetros. Arrástralo para moverlo.</p>';
        }
      } else {
        /* -------- modo Categorías -------- */
        html += '<h6 class="vmap-h">Herramienta</h6><div class="vmap-seg vmap-seg--full">'+
          '<button type="button" class="'+(catTool==='paint'?'on':'')+'" data-cat-tool="paint">🖌 Pintar</button>'+
          '<button type="button" class="'+(catTool==='count'?'on':'')+'" data-cat-tool="count">☝ Contar</button>'+
          '<button type="button" class="'+(catTool==='erase'?'on':'')+'" data-cat-tool="erase">⌫ Quitar</button></div>';
        html += '<h6 class="vmap-h">Categorías</h6><div class="vmap-cats">'+cats.map(function(c){
          return '<div class="vmap-cat '+(c.id===activeCat?'on':'')+'" data-cat="'+c.id+'"><span class="sw" style="background:'+c.color+'"></span><span class="nm">'+esc(c.name)+'</span></div>';
        }).join('')+'</div>';
        html += '<div class="vmap-addcat"><input type="text" class="form-control form-control-sm" data-nc-name placeholder="Nueva categoría"><input type="color" data-nc-color value="#0891b2"><button type="button" class="btn btn-sm btn-outline-secondary" data-nc-add>+</button></div>'+
                '<div class="text-danger small mt-1" data-nc-warn style="display:none">Ese color se parece demasiado a otra categoría.</div>';
        html += '<h6 class="vmap-h">Resumen</h6><div class="vmap-summary" data-vm-summary></div>';
        html += '<p class="text-muted small mt-2 mb-0"><b>Pintar</b>: pincha una butaca o arrastra un recuadro; de lejos, el clic pinta el sector entero (las zonas de pie se pintan enteras). <b>Contar</b>: arrastra y verás cuántas butacas abarcas sin asignar nada. <b>Quitar</b>: igual que pintar, pero libera.</p>';
      }
      side.innerHTML = html;
      if(mode==='cats') renderSummaryCounts();
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
      if(!canEdit){ h.innerHTML = 'Arrastra para desplazarte; rueda o pellizco para hacer zoom: de lejos verás los sectores y, al acercarte, cada butaca con su número.'; return; }
      h.innerHTML = mode==='design'
        ? '<b>Diseñar:</b> pincha un sector para editar sus parámetros y arrástralo para moverlo. Con una herramienta de retoque activa (Hueco/Apagada/Escalera), acércate y pincha butacas para aplicarla. Rueda o pellizco para zoom.'
        : '<b>Categorías:</b> elige categoría y pinta butacas (clic o recuadro; de lejos, el sector entero). «Contar» muestra cuántas butacas abarcas sin tocar nada.';
    }

    /* ================= Plantillas ================= */
    function tplArena(){
      var i, n=11, step=28, start=-140;
      for(i=0;i<n;i++) sections.push({id:nid('s'), kind:'arc', name:'Sector 1'+String(i+1).padStart(2,'0'), cx:0, cy:0, r0:950, span:24, dir:start+i*step, rows:10, rowGap:30, pitch:26});
      sections.push({id:nid('s'), kind:'floor', name:'Pista', x:60, y:0, w:540, h:640, rot:0, cap:2000});
      elements.push({id:nid('e'), type:'outline', label:'', x:0, y:0, w:3600, h:3200, corner:70, rot:0});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:-810, y:0, w:220, h:560, rot:0});
      elements.push({id:nid('e'), type:'mix', label:'MIX', x:390, y:0, w:110, h:110, rot:0});
    }
    function tplTeatro(){
      sections.push({id:nid('s'), kind:'arc', name:'Patio de butacas', cx:0, cy:-620, r0:640, span:78, dir:90, rows:16, rowGap:32, pitch:26, rowScheme:'alpha'});
      sections.push({id:nid('s'), kind:'arc', name:'Anfiteatro', cx:0, cy:-620, r0:1220, span:86, dir:90, rows:8, rowGap:32, pitch:26, rowScheme:'alpha'});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:0, y:-780, w:640, h:240, rot:90});
    }

    /* ================= Acciones del panel ================= */
    if(side) side.addEventListener('input', function(e){
      var p = e.target.dataset.p; if(!p) return;
      var o = sections.find(function(x){return x.id===selId;}) || elements.find(function(x){return x.id===selId;});
      if(!o) return;
      if(p==='num_start'||p==='num_step'||p==='num_dir'){
        o.num = o.num || {};
        if(p==='num_start'){ var v0=parseInt(e.target.value,10); o.num.start = isNaN(v0)?1:v0; }  // 0 es válido
        else if(p==='num_step') o.num.step = parseInt(e.target.value,10)||1;
        else o.num.dir = e.target.value;
      } else if(p==='rowScheme' || p==='gapPolicy'){
        o[p] = e.target.value;
      } else if(e.target.type==='range' || e.target.type==='number'){
        o[p] = parseFloat(e.target.value);
      } else {
        o[p] = e.target.value;
      }
      var outp = e.target.parentElement && e.target.parentElement.querySelector('output');
      if(outp) outp.textContent = e.target.value + ((p==='span'||p==='dir'||p==='rot')?'°':(p==='corner'?'%':''));
      if(o.kind) invalidate(o.id);
      // (Los sliders del escenario no tocan su posición x/y, que es lo único que cambia la
      // orientación de las butacas: solo el ARRASTRE del escenario invalida toda la caché.)
      queueRender();
    });

    if(side) side.addEventListener('click', function(e){
      var tpl=e.target.closest('[data-tpl]'), add=e.target.closest('[data-add]'), act=e.target.closest('[data-act]');
      var tch=e.target.closest('[data-tool]'), ctl=e.target.closest('[data-cat-tool]'), cat=e.target.closest('[data-cat]');
      var cxw=view.x+view.w/2, cyw=view.y+view.h/2;
      if(tpl){ if(tpl.dataset.tpl==='arena') tplArena(); else tplTeatro(); selId=null; invalidate(); renderSide(); fitAll(); return; }
      if(tch){ tool = (tool===tch.dataset.tool) ? null : tch.dataset.tool; renderSide(); return; }
      if(ctl){ catTool = ctl.dataset.catTool; renderSide(); return; }
      if(cat){ activeCat = cat.dataset.cat; renderSide(); return; }
      if(e.target.closest('[data-nc-add]')){
        var nmI=side.querySelector('[data-nc-name]'), colI=side.querySelector('[data-nc-color]'), warn=side.querySelector('[data-nc-warn]');
        var nm2=(nmI.value||'').trim(), col2=colI.value;
        if(!nm2) return;
        var clash = cats.some(function(c){ var a=parseInt(c.color.slice(1),16), b=parseInt(col2.slice(1),16);
          var dr=((a>>16)&255)-((b>>16)&255), dg=((a>>8)&255)-((b>>8)&255), db2=(a&255)-(b&255);
          return (dr*dr+dg*dg+db2*db2) < 3600; });
        warn.style.display = clash?'block':'none';
        if(clash) return;
        var id='c'+(nextId+=1);
        var nc={id:id, name:nm2, color:col2, kind:'otros'}; cats.push(nc); catById[id]=nc; activeCat=id; renderSide(); return;
      }
      if(add){
        var kind = add.dataset.add;
        if(kind==='arc'){ var na={id:nid('s'), kind:'arc', name:'Sector nuevo', cx:cxw, cy:cyw+900, r0:900, span:24, dir:-90, rows:8, rowGap:30, pitch:26}; sections.push(na); selId=na.id; }
        else if(kind==='grid'){ var ng={id:nid('s'), kind:'grid', name:'Grada nueva', x:cxw, y:cyw, rot:0, rows:8, cols:14, pitch:26, rowGap:30}; sections.push(ng); selId=ng.id; }
        else if(kind==='box'){ var nb={id:nid('s'), kind:'box', name:'Palco 1', x:cxw, y:cyw, rot:0, rows:2, cols:4, pitch:24, rowGap:28}; sections.push(nb); selId=nb.id; }
        else if(kind==='floor'){ var nf={id:nid('s'), kind:'floor', name:'Zona de pie', x:cxw, y:cyw, w:400, h:300, rot:0, cap:500}; sections.push(nf); selId=nf.id; }
        else {
          var defs={ stage:['ESCENARIO',220,520], mix:['MIX',110,110], delay:['DELAY',95,95], pmr:['PLATAFORMA PMR',420,64],
                     stair:['Escalera',60,120], rail:['Barandilla',420,8], catwalk:['PASARELA',420,90], pit:['FOSO FOTÓGRAFOS',420,70],
                     wc:['WC',150,80], wc_pmr:['WC ♿',190,80], merch:['MERCH',230,80], bar:['BARRA',260,70],
                     door:['Puerta 1',0,0], outline:['',3200,2800] };
          var d=defs[kind]||['Elemento',200,100];
          var ne={id:nid('e'), type:kind, label:d[0], x:cxw, y:cyw, w:d[1], h:d[2], rot:0};
          if(kind==='outline') ne.corner=70;
          elements.push(ne); selId=ne.id;
          if(kind==='stage') invalidate();   // añadir escenario reorienta TODAS las butacas
        }
        renderSide(); markSummary(); return;
      }
      if(act && act.dataset.act==='del'){
        var delWasStage = elements.some(function(x){ return x.id===selId && x.type==='stage'; });
        sections=sections.filter(function(x){return x.id!==selId;}); elements=elements.filter(function(x){return x.id!==selId;});
        Object.keys(assign).forEach(function(k){ if(k.indexOf(selId+'|')===0) delete assign[k]; }); delete floorCat[selId];
        if(delWasStage) invalidate(); else invalidate(selId);
        selId=null; renderSide(); markSummary(); return; }
      if(act && act.dataset.act==='dup'){
        var o2=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        if(!o2) return;
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
    });

    /* ================= Modo (Diseñar / Categorías) ================= */
    host.querySelectorAll('[data-vm-mode]').forEach(function(b){
      b.addEventListener('click', function(){
        mode = b.dataset.vmMode; tool = null; selId = null;
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
      if(tool==='stair'){
        var frac = parseFloat(seatEl.getAttribute('data-frac')||'0.5');
        s.stairs = s.stairs || [];
        s.stairs.push({at: Math.round(frac*1000)/1000, w: 1.2});
        invalidate(s.id); markSummary(); renderSide(); return true;
      }
      s.mods = s.mods || {};
      var m = s.mods[rowIdx] = s.mods[rowIdx] || {gaps:[], off:[]};
      // Toggle robusto SIN depender del data-kind del DOM (puede quedar desfasado hasta el
      // siguiente frame): si el slot ya tiene el retoque se quita; si no, se pone (y se retira
      // el retoque contrario y su categoría — deja de ser vendible).
      function applyMod(arr, other){
        var i = arr.indexOf(slot);
        if(i!==-1){ arr.splice(i,1); return; }
        arr.push(slot);
        var j = other.indexOf(slot); if(j!==-1) other.splice(j,1);
        delete assign[key];
      }
      if(tool==='gap') applyMod(m.gaps, m.off);
      else if(tool==='off') applyMod(m.off, m.gaps);
      if(!m.gaps.length && !m.off.length) delete s.mods[rowIdx];
      invalidate(s.id); markSummary(); renderSide(); return true;
    }
    function removeStairBand(el){
      var parts = (el.getAttribute('data-stairband')||'').split('|');
      var s = sections.find(function(x){return x.id===parts[0];});
      if(!s || !s.stairs) return;
      s.stairs.splice(parseInt(parts[1],10), 1);
      invalidate(s.id); markSummary(); renderSide();
    }

    /* ================= Asignación de categorías ================= */
    function paintSeat(seatEl){
      var key = seatEl.getAttribute('data-seat');
      if(!key || seatEl.getAttribute('data-kind')!=='seat') return;
      if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key] = activeCat;
      markSummary();
    }
    function paintSection(s){
      if(s.kind==='floor'){ if(catTool==='erase') delete floorCat[s.id]; else if(activeCat) floorCat[s.id]=activeCat; markSummary(); return; }
      secRows(s).rows.forEach(function(row){ row.seats.forEach(function(p){
        if(p.state!=='seat') return;
        var key = s.id+'|'+row.rowIdx+'|'+p.slot;
        if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key]=activeCat;
      }); });
      markSummary();
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
    function zoomAt(cx, cy, f){
      var w0=client2world(cx,cy);
      view.w*=f; view.h*=f;
      var w1=client2world(cx,cy);
      view.x += w0.x-w1.x; view.y += w0.y-w1.y;
      queueRender();
    }
    svg.addEventListener('wheel', function(e){ e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY>0?1.13:1/1.13); }, {passive:false});
    host.querySelector('[data-vm-zin]').addEventListener('click', function(){ var r=svg.getBoundingClientRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1/1.35); });
    host.querySelector('[data-vm-zout]').addEventListener('click', function(){ var r=svg.getBoundingClientRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1.35); });
    host.querySelector('[data-vm-fit]').addEventListener('click', fitAll);
    function fitAll(){
      var xs=[],ys=[];
      sections.forEach(function(s){ var b=bboxOf(s); if(b.w||b.h){ xs.push(b.x,b.x+b.w); ys.push(b.y,b.y+b.h); } });
      elements.forEach(function(el){ if(el.type==='door'){ xs.push(el.x-60, el.x+60); ys.push(el.y-40, el.y+60); return; }
        xs.push(el.x-(el.w||0)/2, el.x+(el.w||0)/2); ys.push(el.y-(el.h||0)/2, el.y+(el.h||0)/2); });
      if(!xs.length){ view={x:-1200,y:-900,w:2400,h:1800}; queueRender(); return; }
      var mx=Math.min.apply(null,xs), Mx=Math.max.apply(null,xs), my=Math.min.apply(null,ys), My=Math.max.apply(null,ys);
      var pad=.07*Math.max(Mx-mx, My-my, 100);
      var ar=(svg.clientWidth>0 && svg.clientHeight>0)? svg.clientWidth/svg.clientHeight : 4/3;
      var w=Mx-mx+2*pad, h=My-my+2*pad;
      if(w/h<ar) w=h*ar; else h=w/ar;
      view={x:(mx+Mx)/2-w/2, y:(my+My)/2-h/2, w:w, h:h};
      queueRender();
    }

    var pointers={}, pinch0=null, drag=null;
    function drawLasso(a,b){
      var l=svg.querySelector('#vmLasso');
      if(!l){ l=document.createElementNS('http://www.w3.org/2000/svg','rect'); l.id='vmLasso'; svg.appendChild(l); }
      l.setAttribute('x',Math.min(a.x,b.x)); l.setAttribute('y',Math.min(a.y,b.y));
      l.setAttribute('width',Math.abs(b.x-a.x)); l.setAttribute('height',Math.abs(b.y-a.y));
      l.setAttribute('style','fill:rgba(0,124,162,.10);stroke:#007CA2;stroke-width:'+(1.5/px())+';stroke-dasharray:'+(6/px())+' '+(4/px()));
    }
    function clearLasso(){ var l=svg.querySelector('#vmLasso'); if(l) l.remove(); }

    svg.addEventListener('pointerdown', function(e){
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      pointers[e.pointerId]={x:e.clientX, y:e.clientY};
      var ids=Object.keys(pointers);
      if(ids.length===2){ var a=pointers[ids[0]], b=pointers[ids[1]];
        pinch0={d:Math.hypot(a.x-b.x,a.y-b.y), view:JSON.parse(JSON.stringify(view)), cx:(a.x+b.x)/2, cy:(a.y+b.y)/2}; drag=null; return; }
      var seatEl=e.target.closest('[data-seat]'), secEl=e.target.closest('[data-sec]'), elEl=e.target.closest('[data-el]'), stairEl=e.target.closest('[data-stairband]');
      var w=client2world(e.clientX,e.clientY);
      if(mode==='design' && canEdit && tool){
        // Herramienta de retoque activa: pinchar butacas aplica; pinchar franja de escalera la quita.
        if(tool==='stair' && stairEl){ removeStairBand(stairEl); drag={kind:'none'}; return; }
        if(seatEl && applyTool(seatEl)){
          drag={kind:'tooldrag', done:{}};
          drag.done[seatEl.getAttribute('data-seat')]=1;   // la primera ya está aplicada
          return;
        }
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
        return;
      }
      if(mode==='cats' && canEdit){
        if(catTool==='count'){ drag={kind:'lasso', w0:w}; return; }
        if(seatEl){ paintSeat(seatEl); drag={kind:'paintdrag'}; return; }
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
      // Diseñar sin herramienta (o solo lectura): seleccionar/mover o pan.
      if(mode==='design' && canEdit && (secEl||elEl)){
        selId=(secEl?secEl.getAttribute('data-sec'):elEl.getAttribute('data-el'));
        var obj=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        drag={kind:'move', obj:obj, w0:w, o0:JSON.parse(JSON.stringify(obj))};
        renderSide(); queueRender();
      } else {
        if(mode==='design' && canEdit && selId){ selId=null; renderSide(); queueRender(); }
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
      }
    });
    svg.addEventListener('pointermove', function(e){
      if(pointers[e.pointerId]) pointers[e.pointerId]={x:e.clientX,y:e.clientY};
      var ids=Object.keys(pointers);
      if(pinch0 && ids.length===2){
        var a=pointers[ids[0]], b=pointers[ids[1]], d=Math.hypot(a.x-b.x,a.y-b.y);
        var f=pinch0.d/Math.max(20,d);
        view.w=pinch0.view.w*f; view.h=pinch0.view.h*f;
        var r=svg.getBoundingClientRect();
        view.x=pinch0.view.x+(pinch0.cx-r.left)/r.width*(pinch0.view.w-view.w);
        view.y=pinch0.view.y+(pinch0.cy-r.top)/r.height*(pinch0.view.h-view.h);
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
        tip.textContent=(sObj?sObj.name:'')+' · Fila '+rowLbl+' · Butaca '+seatNo+(aKey && catById[aKey] ? ' · '+catById[aKey].name : '');
        var r2=svg.getBoundingClientRect();
        tip.style.left=(e.clientX-r2.left)+'px'; tip.style.top=(e.clientY-r2.top)+'px'; tip.style.display='block';
      } else tip.style.display='none';
      if(!drag) return;
      if(drag.kind==='pan'){
        var s2=px();
        view.x=drag.v0.x-(e.clientX-drag.c0.x)/s2;
        view.y=drag.v0.y-(e.clientY-drag.c0.y)/s2;
        queueRender();
      } else if(drag.kind==='move'){
        var w2=client2world(e.clientX,e.clientY), dx=w2.x-drag.w0.x, dy=w2.y-drag.w0.y, o=drag.obj;
        if(o.kind==='arc'){ o.cx=drag.o0.cx+dx; o.cy=drag.o0.cy+dy; } else { o.x=drag.o0.x+dx; o.y=drag.o0.y+dy; }
        if(o.kind) invalidate(o.id);
        if(o.type==='stage') invalidate();
        queueRender();
      } else if(drag.kind==='tooldrag' || drag.kind==='paintdrag'){
        // OJO: con setPointerCapture los pointermove llegan retargeteados al <svg> (e.target ya
        // no es la butaca): hay que buscar el elemento REAL bajo el dedo con elementFromPoint.
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var se = under && under.closest ? under.closest('[data-seat]') : null;
        if(!se) return;
        if(drag.kind==='paintdrag'){ paintSeat(se); return; }
        if(tool==='stair') return;                        // la escalera se coloca de una en una
        var k = se.getAttribute('data-seat');
        drag.done = drag.done || {};
        if(drag.done[k]) return;                          // una vez por butaca y gesto (sin parpadeo)
        drag.done[k] = 1;
        applyTool(se);
      } else if(drag.kind==='secmaybe'){
        if(Math.hypot(e.clientX-drag.c0.x, e.clientY-drag.c0.y) > 8){ drag={kind:'lasso', w0:drag.w0}; }
      } else if(drag.kind==='lasso'){
        drag.w1=client2world(e.clientX,e.clientY);
        var r3=svg.getBoundingClientRect();
        chip.style.left=(e.clientX-r3.left)+'px'; chip.style.top=(e.clientY-r3.top)+'px';
        queueRender();   // el conteo y el rectángulo se pintan en el rAF (no a 120 Hz de puntero)
      }
    });
    function endPointer(e){
      delete pointers[e.pointerId];
      if(Object.keys(pointers).length<2) pinch0=null;
      if(drag && drag.kind==='secmaybe' && drag.sec){
        // Clic corto sobre el sector (no llegó a arrastre): pintar el sector entero, solo de lejos.
        if(drag.far){ var sPS=sections.find(function(x){return x.id===drag.sec;}); if(sPS) paintSection(sPS); }
      } else if(drag && drag.kind==='lasso' && drag.w1 && catTool!=='count' && mode==='cats'){
        eachSeatInRect(drag.w0, drag.w1, function(key){ if(catTool==='erase') delete assign[key]; else if(activeCat) assign[key]=activeCat; });
        markSummary();
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
      var body = { version: mapVersion,
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
            saveBtn.innerHTML = '<i class="fa fa-check me-1"></i>Guardado';
            setTimeout(function(){ saveBtn.innerHTML = orig; saveBtn.disabled=false; }, 1600);
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
