/* Mapa de butacas del RECINTO (pestaña Ticketing de la ficha) — Lote 1: diseñador.
 *
 * Un recinto se define por SECCIONES PARAMÉTRICAS (nunca se guardan coordenadas por butaca):
 *  - arc   : grada CURVA — centro (cx,cy), radio de la 1ª fila, amplitud (°), orientación (°),
 *            filas, paso entre filas y entre butacas. El nº de butacas por fila se deriva de la
 *            longitud del arco (las filas de atrás tienen más butacas, como en un recinto real).
 *  - grid  : grada RECTA — centro, rotación, filas × columnas.
 *  - floor : zona DE PIE — rectángulo con aforo (sin butacas).
 * Más ELEMENTOS de pista sin butacas: escenario, torre mix, plataforma PMR, escalera, barandilla,
 * pasarela y foso de fotógrafos.
 *
 * Render en UN solo SVG con pan/zoom (rueda, pellizco en iPad) y 3 niveles de detalle (LOD):
 * lejos = bloque del sector con nombre; medio = filas como líneas; cerca = BUTACAS reales con
 * icono + número (misma estética que el plano de invitaciones). Solo se materializa lo visible.
 *
 * Guardado: POST JSON a data-save-url con bloqueo optimista por `version` (409 = otro guardó).
 * El layout persistido es {version:1, next, sections:[...], elements:[...]}.
 */
(function(){
  'use strict';

  function init(){
    var host = document.querySelector('[data-venue-map]');
    if(!host || host.dataset.vmapBound === '1') return;
    host.dataset.vmapBound = '1';
    var R = Math.PI/180;
    var canEdit = host.dataset.canEdit === '1';
    var saveUrl = host.dataset.saveUrl || '';

    var payload = {};
    try { payload = JSON.parse(document.getElementById('venueMapData').textContent || '{}'); } catch(e){}
    var mapVersion = parseInt(payload.version || 0, 10) || 0;
    var layout = (payload.layout && typeof payload.layout === 'object') ? payload.layout : {};
    var sections = Array.isArray(layout.sections) ? layout.sections : [];
    var elements = Array.isArray(layout.elements) ? layout.elements : [];
    var nextId = parseInt(layout.next || 0, 10) || 0;
    function nid(pfx){ nextId += 1; return pfx + nextId; }
    // ids que faltan (layouts antiguos/manuales) → asignar
    sections.concat(elements).forEach(function(o){ if(!o.id) o.id = nid(o.kind ? 's' : 'e'); });

    /* ================= Estructura del bloque ================= */
    host.innerHTML =
      '<div class="vmap-toolbar">' +
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
        '</div>' +
        (canEdit ? '<div class="vmap-side" data-vm-side></div>' : '') +
      '</div>' +
      '<div class="vmap-hint text-muted small mt-2">' + (canEdit
        ? '<b>Pincha</b> un sector para editar sus parámetros y <b>arrástralo</b> para moverlo. Arrastra el fondo para desplazarte; rueda o pellizco para hacer zoom: de lejos verás los sectores y, al acercarte, cada <b>butaca con su número</b>.'
        : 'Arrastra para desplazarte; rueda o pellizco para hacer zoom: de lejos verás los sectores y, al acercarte, cada butaca con su número.') + '</div>';

    var svg = host.querySelector('[data-vm-svg]');
    var world = host.querySelector('[data-vm-world]');
    var side = host.querySelector('[data-vm-side]');
    var tip = host.querySelector('[data-vm-tip]');

    /* ================= Geometría derivada (nunca persistida) ================= */
    function numOf(s){ var n = s.num || {}; return { start: parseInt(n.start||1,10)||1, step: parseInt(n.step||1,10)||1, dir: (n.dir==='rtl'?'rtl':'ltr') }; }
    function arcRows(s){
      var rows = [], nm = numOf(s);
      for(var r=0;r<s.rows;r++){
        var radius = s.r0 + r*s.rowGap;
        var count = Math.max(2, Math.floor((radius * s.span * R) / s.pitch));
        var seats = [];
        for(var i=0;i<count;i++){
          var idx = (nm.dir==='rtl') ? (count-1-i) : i;
          var t = (s.dir - s.span/2 + (i+.5)*(s.span/count)) * R;
          seats.push({ row:r+1, n: nm.start + idx*nm.step,
                       x:s.cx + radius*Math.cos(t), y:s.cy + radius*Math.sin(t), a:t/R - 90 });
        }
        rows.push({label:String(r+1), seats:seats});
      }
      return rows;
    }
    function gridRows(s){
      var rows = [], nm = numOf(s), cr = Math.cos(s.rot*R), sr = Math.sin(s.rot*R);
      for(var r=0;r<s.rows;r++){
        var seats = [];
        for(var i=0;i<s.cols;i++){
          var idx = (nm.dir==='rtl') ? (s.cols-1-i) : i;
          var lx = (i-(s.cols-1)/2)*s.pitch, ly = (r-(s.rows-1)/2)*s.rowGap;
          seats.push({ row:r+1, n: nm.start + idx*nm.step,
                       x:s.x + lx*cr - ly*sr, y:s.y + lx*sr + ly*cr, a:s.rot });
        }
        rows.push({label:String(r+1), seats:seats});
      }
      return rows;
    }
    function rowsOf(s){ return s.kind==='arc' ? arcRows(s) : s.kind==='grid' ? gridRows(s) : []; }
    function seatCount(s){
      if(s.kind==='floor') return 0;
      if(s.kind==='arc'){ var t=0; for(var r=0;r<s.rows;r++){ t += Math.max(2, Math.floor(((s.r0 + r*s.rowGap) * s.span * R) / s.pitch)); } return t; }
      return s.rows * s.cols;
    }
    function bboxOf(s){
      if(s.kind==='floor') return {x:s.x-s.w/2, y:s.y-s.h/2, w:s.w, h:s.h};
      var xs=[], ys=[];
      rowsOf(s).forEach(function(r){ r.seats.forEach(function(p){ xs.push(p.x); ys.push(p.y); }); });
      if(!xs.length) return {x:0,y:0,w:0,h:0};
      var mx=Math.min.apply(null,xs), Mx=Math.max.apply(null,xs), my=Math.min.apply(null,ys), My=Math.max.apply(null,ys);
      var pad = (s.pitch||30);
      return {x:mx-pad, y:my-pad, w:Mx-mx+2*pad, h:My-my+2*pad};
    }
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

    /* ================= Vista (pan/zoom) y render con LOD ================= */
    var view = {x:-1700, y:-1500, w:3400, h:3000};
    var selId = null;
    var raf = null;
    function px(){ return (svg.clientWidth || 1) / view.w; }
    function esc(t){ return String(t==null?'':t).replace(/[<>&"]/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }
    function client2world(cx,cy){
      var r = svg.getBoundingClientRect();
      return { x: view.x + (cx-r.left)/r.width*view.w, y: view.y + (cy-r.top)/r.height*view.h };
    }

    function render(){
      raf = null;
      svg.setAttribute('viewBox', view.x+' '+view.y+' '+view.w+' '+view.h);
      var scale = px(), out = [], vx0=view.x, vy0=view.y, vx1=view.x+view.w, vy1=view.y+view.h;

      sections.forEach(function(s){
        var bb = bboxOf(s);
        if(bb.x>vx1||bb.y>vy1||bb.x+bb.w<vx0||bb.y+bb.h<vy0) return;   // fuera de pantalla
        var isSel = (canEdit && s.id===selId);
        var selCss = isSel? ';stroke:#E33D48;stroke-width:'+(3/scale)+';stroke-dasharray:'+(8/scale)+' '+(5/scale) : '';

        if(s.kind==='floor'){
          out.push('<g data-sec="'+s.id+'" style="cursor:pointer">'+
            '<rect x="'+(s.x-s.w/2)+'" y="'+(s.y-s.h/2)+'" width="'+s.w+'" height="'+s.h+'" rx="26" transform="rotate('+(s.rot||0)+' '+s.x+' '+s.y+')" style="fill:#7593ab;opacity:.9'+selCss+'"/>'+
            '<text x="'+s.x+'" y="'+s.y+'" text-anchor="middle" style="font:700 34px system-ui;fill:#fff">'+esc(s.name)+'</text>'+
            '<text x="'+s.x+'" y="'+(s.y+44)+'" text-anchor="middle" style="font:600 24px system-ui;fill:rgba(255,255,255,.85)">'+(s.cap||0).toLocaleString('es-ES')+' de pie</text>'+
          '</g>');
          return;
        }

        var pitchPx = s.pitch * scale;
        if(pitchPx < 2.6){
          /* LEJOS: bloque del sector con su nombre */
          var lbl = s.name || '';
          if(s.kind==='arc'){
            var mid=(s.dir)*R, rMid=s.r0+(s.rows-1)*s.rowGap/2;
            out.push('<g data-sec="'+s.id+'" style="cursor:pointer"><path d="'+arcBandPath(s)+'" style="fill:#d7dee6;opacity:.95;stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/>'+
              '<text x="'+(s.cx+rMid*Math.cos(mid))+'" y="'+(s.cy+rMid*Math.sin(mid))+'" text-anchor="middle" dominant-baseline="middle" style="font:700 '+(s.rows*s.rowGap*.36)+'px system-ui;fill:#5b6673">'+esc(lbl)+'</text></g>');
          } else {
            var o=gridOutline(s);
            out.push('<g data-sec="'+s.id+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="cursor:pointer">'+
              '<rect x="'+o.x+'" y="'+o.y+'" width="'+o.w+'" height="'+o.h+'" rx="14" style="fill:#d7dee6;opacity:.95;stroke:#fff;stroke-width:'+(2/scale)+selCss+'"/>'+
              '<text text-anchor="middle" dominant-baseline="middle" style="font:700 '+(o.h*.26)+'px system-ui;fill:#5b6673">'+esc(lbl)+'</text></g>');
          }
        } else if(pitchPx < 9.5){
          /* MEDIO: filas como líneas (+ banda invisible que captura el clic en todo el sector) */
          var sw = Math.max(s.pitch*.62, 10);
          var g = ['<g data-sec="'+s.id+'" style="cursor:pointer">'];
          if(s.kind==='arc') g.push('<path d="'+arcBandPath(s)+'" style="fill:#fff;fill-opacity:0.01'+(isSel?selCss:'')+'"/>');
          else { var go=gridOutline(s); g.push('<rect x="'+go.x+'" y="'+go.y+'" width="'+go.w+'" height="'+go.h+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="fill:#fff;fill-opacity:0.01'+(isSel?selCss:'')+'"/>'); }
          rowsOf(s).forEach(function(r){
            var d='M'+r.seats.map(function(p){ return p.x+' '+p.y; }).join(' L');
            g.push('<path d="'+d+'" style="fill:none;stroke:#c3ccd6;stroke-width:'+sw+';stroke-linecap:round"/>');
          });
          g.push('</g>');
          out.push(g.join(''));
        } else {
          /* CERCA: butacas reales (icono + número), como el plano de invitaciones */
          var size = s.pitch*.86, half=size/2, showNum = pitchPx>=15;
          var g2=['<g data-sec="'+s.id+'">'];
          if(isSel){ if(s.kind==='arc') g2.push('<path d="'+arcBandPath(s)+'" style="fill:none'+selCss+'"/>');
                     else { var go2=gridOutline(s); g2.push('<rect x="'+go2.x+'" y="'+go2.y+'" width="'+go2.w+'" height="'+go2.h+'" transform="translate('+s.x+' '+s.y+') rotate('+s.rot+')" style="fill:none'+selCss+'"/>'); } }
          rowsOf(s).forEach(function(r){
            r.seats.forEach(function(p){
              if(p.x<vx0-size||p.x>vx1+size||p.y<vy0-size||p.y>vy1+size) return;   // culling por butaca
              g2.push('<g data-seat="'+s.id+'|'+p.row+'|'+p.n+'" data-sec="'+s.id+'" transform="translate('+p.x+' '+p.y+') rotate('+p.a.toFixed(1)+')" style="cursor:pointer">'+
                '<rect x="'+(-half)+'" y="'+(-half)+'" width="'+size+'" height="'+size+'" rx="'+(size*.24)+'" style="fill:#effaf2;stroke:#cfe4d6;stroke-width:'+(size*.05)+'"/>'+
                '<use href="#vmSeatIcon" x="'+(-size*.30)+'" y="'+(-size*.34)+'" width="'+(size*.6)+'" height="'+(size*.45)+'" style="fill:#16803a"/>'+
                (showNum? '<text y="'+(size*.33)+'" text-anchor="middle" style="font:600 '+(size*.30)+'px system-ui;fill:#16803a">'+p.n+'</text>' : '')+
              '</g>');
            });
          });
          g2.push('</g>');
          out.push(g2.join(''));
        }
      });

      /* Elementos de pista */
      elements.forEach(function(el){
        var sel = (canEdit && el.id===selId)? ';stroke:#E33D48;stroke-width:'+(3/px())+';stroke-dasharray:'+(8/px())+' '+(5/px()) : '';
        var t='translate('+el.x+' '+el.y+') rotate('+(el.rot||0)+')';
        if(el.type==='stage'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="18" style="fill:#111'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" transform="rotate(-90)" style="font:800 '+Math.min(el.w*.34,64)+'px system-ui;letter-spacing:.12em;fill:#fff">'+esc(el.label)+'</text></g>');
        } else if(el.type==='mix'){
          out.push('<g data-el="'+el.id+'" transform="'+t+'" style="cursor:pointer"><rect x="'+(-el.w/2)+'" y="'+(-el.h/2)+'" width="'+el.w+'" height="'+el.h+'" rx="10" style="fill:#3d4653'+sel+'"/>'+
            '<text text-anchor="middle" dominant-baseline="middle" style="font:800 '+el.w*.3+'px system-ui;fill:#fff">'+esc(el.label)+'</text></g>');
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
        }
      });

      world.innerHTML = out.join('');
      renderStats();
    }
    function queueRender(){ if(!raf) raf = requestAnimationFrame(render); }

    function renderStats(){
      var seated=0, standing=0;
      sections.forEach(function(s){ if(s.kind==='floor') standing += parseInt(s.cap||0,10)||0; else seated += seatCount(s); });
      var set = function(sel,v){ var e=host.querySelector(sel); if(e) e.textContent = v.toLocaleString('es-ES'); };
      set('[data-vm-total]', seated+standing); set('[data-vm-seated]', seated); set('[data-vm-standing]', standing);
    }

    /* ================= Panel lateral (solo edición) ================= */
    function slider(lbl,key,min,max,stepv,val,suf){
      return '<div class="vmap-param"><label>'+lbl+'</label><input type="range" data-p="'+key+'" min="'+min+'" max="'+max+'" step="'+stepv+'" value="'+val+'"><output>'+val+(suf||'')+'</output></div>';
    }
    function renderSide(){
      if(!side) return;
      var html = '';
      if(!sections.length && !elements.length){
        html += '<h6 class="vmap-h">Empezar con plantilla</h6><div class="vmap-tools">'+
          '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="arena">Arena (anillo + pista)</button>'+
          '<button type="button" class="btn btn-sm btn-outline-danger" data-tpl="teatro">Teatro (abanico)</button></div>';
      }
      html += '<h6 class="vmap-h">Añadir al plano</h6><div class="vmap-tools">'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="arc">+ Grada curva</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="grid">+ Grada recta</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="floor">+ Zona de pie</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="stage">+ Escenario</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="catwalk">+ Pasarela</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="mix">+ Torre mix</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="pmr">+ Plataforma PMR</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="pit">+ Foso fotógrafos</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="stair">+ Escalera</button>'+
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-add="rail">+ Barandilla</button></div>';

      var s = sections.find(function(x){return x.id===selId;});
      var el = elements.find(function(x){return x.id===selId;});
      if(s){
        html += '<h6 class="vmap-h">Sección: '+esc(s.name||'')+'</h6>';
        html += '<div class="vmap-param"><label>Nombre</label><input type="text" class="form-control form-control-sm" data-p="name" value="'+esc(s.name||'')+'"></div>';
        if(s.kind!=='floor'){
          html += '<div class="vmap-param"><label>Alias <i class="fa fa-circle-info text-muted" title="Otros nombres con los que las ticketeras llaman a este sector en los PDF (separados por comas). Sirve para casar las invitaciones subidas con el mapa."></i></label><input type="text" class="form-control form-control-sm" data-p="aliases" value="'+esc(s.aliases||'')+'" placeholder="201, SECTOR 201"></div>';
        }
        if(s.kind==='arc'){
          html += slider('Filas','rows',1,40,1,s.rows)
                + slider('Amplitud','span',6,180,1,s.span,'°')
                + slider('Orientación','dir',-180,180,1,s.dir,'°')
                + slider('Radio','r0',150,2600,10,s.r0)
                + slider('Paso butaca','pitch',18,44,1,s.pitch)
                + slider('Paso fila','rowGap',20,60,1,s.rowGap);
        } else if(s.kind==='grid'){
          html += slider('Filas','rows',1,60,1,s.rows) + slider('Butacas/fila','cols',2,80,1,s.cols)
                + slider('Rotación','rot',-180,180,1,s.rot,'°')
                + slider('Paso butaca','pitch',18,44,1,s.pitch)
                + slider('Paso fila','rowGap',20,60,1,s.rowGap);
        } else {
          html += slider('Ancho','w',120,2400,10,s.w) + slider('Alto','h',120,2400,10,s.h)
                + slider('Aforo de pie','cap',0,30000,50,s.cap) + slider('Rotación','rot',-180,180,1,s.rot,'°');
        }
        if(s.kind!=='floor'){
          var nm = numOf(s);
          html += '<div class="vmap-numrow"><label>Numeración</label>'+
            '<input type="number" class="form-control form-control-sm" data-p="num_start" value="'+nm.start+'" min="0" title="Primera butaca">'+
            '<select class="form-select form-select-sm" data-p="num_step"><option value="1"'+(nm.step===1?' selected':'')+'>1,2,3…</option><option value="2"'+(nm.step===2?' selected':'')+'>pares/impares</option></select>'+
            '<select class="form-select form-select-sm" data-p="num_dir"><option value="ltr"'+(nm.dir==='ltr'?' selected':'')+'>Izq → der</option><option value="rtl"'+(nm.dir==='rtl'?' selected':'')+'>Der → izq</option></select></div>';
        }
        html += '<div class="vmap-tools mt-2">'+
          (s.kind==='arc' ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="ring">⟳ Repetir en anillo</button><input type="number" class="form-control form-control-sm vmap-ringn" data-ring-n value="12" min="2" max="40" title="Nº de sectores del anillo">' : '')+
          '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button>'+
          '<button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
        if(s.kind!=='floor') html += '<p class="text-muted small mt-2 mb-0">Butacas de esta sección: <b>'+seatCount(s).toLocaleString('es-ES')+'</b></p>';
      } else if(el){
        html += '<h6 class="vmap-h">Elemento: '+esc(el.label||'')+'</h6>';
        html += '<div class="vmap-param"><label>Etiqueta</label><input type="text" class="form-control form-control-sm" data-p="label" value="'+esc(el.label||'')+'"></div>'
              + slider('Ancho','w',30,2400,5,el.w) + slider('Alto','h',8,2400,5,el.h)
              + slider('Rotación','rot',-180,180,1,el.rot||0,'°');
        html += '<div class="vmap-tools mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" data-act="dup">Duplicar</button><button type="button" class="btn btn-sm btn-outline-danger" data-act="del">Eliminar</button></div>';
      } else {
        html += '<h6 class="vmap-h">Sección</h6><p class="text-muted small mb-0">Pincha un sector o elemento del plano para editar sus parámetros. Arrástralo para moverlo.</p>';
      }
      side.innerHTML = html;
    }

    /* ================= Plantillas de arranque ================= */
    function tplArena(){
      var i, n=11, step=28, start=-140;
      for(i=0;i<n;i++) sections.push({id:nid('s'), kind:'arc', name:'Sector 1'+String(i+1).padStart(2,'0'), cx:0, cy:0, r0:950, span:24, dir:start+i*step, rows:10, rowGap:30, pitch:26});
      sections.push({id:nid('s'), kind:'floor', name:'Pista', x:60, y:0, w:540, h:640, rot:0, cap:2000});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:-810, y:0, w:220, h:560, rot:0});
      elements.push({id:nid('e'), type:'mix', label:'MIX', x:390, y:0, w:110, h:110, rot:0});
    }
    function tplTeatro(){
      sections.push({id:nid('s'), kind:'arc', name:'Patio de butacas', cx:0, cy:-620, r0:640, span:78, dir:90, rows:16, rowGap:32, pitch:26});
      sections.push({id:nid('s'), kind:'arc', name:'Anfiteatro', cx:0, cy:-620, r0:1220, span:86, dir:90, rows:8, rowGap:32, pitch:26});
      elements.push({id:nid('e'), type:'stage', label:'ESCENARIO', x:0, y:-780, w:640, h:240, rot:90});
    }

    /* ================= Interacciones del panel ================= */
    if(side) side.addEventListener('input', function(e){
      var p = e.target.dataset.p; if(!p) return;
      var o = sections.find(function(x){return x.id===selId;}) || elements.find(function(x){return x.id===selId;});
      if(!o) return;
      var v = (e.target.type==='range' || e.target.type==='number') ? parseFloat(e.target.value) : e.target.value;
      if(p==='num_start'||p==='num_step'||p==='num_dir'){
        o.num = o.num || {};
        if(p==='num_start') o.num.start = parseInt(v,10)||1;
        else if(p==='num_step') o.num.step = parseInt(e.target.value,10)||1;
        else o.num.dir = e.target.value;
      } else o[p] = v;
      var outp = e.target.parentElement && e.target.parentElement.querySelector('output');
      if(outp) outp.textContent = e.target.value + ((p==='span'||p==='dir'||p==='rot')?'°':'');
      queueRender();
    });
    if(side) side.addEventListener('click', function(e){
      var tpl=e.target.dataset.tpl, add=e.target.dataset.add, act=e.target.dataset.act;
      var cxw=view.x+view.w/2, cyw=view.y+view.h/2;
      if(tpl){ if(tpl==='arena') tplArena(); else tplTeatro(); selId=null; renderSide(); fitAll(); return; }
      if(add){
        if(add==='arc'){ var na={id:nid('s'), kind:'arc', name:'Sector nuevo', cx:cxw, cy:cyw+900, r0:900, span:24, dir:-90, rows:8, rowGap:30, pitch:26}; sections.push(na); selId=na.id; }
        else if(add==='grid'){ var ng={id:nid('s'), kind:'grid', name:'Grada nueva', x:cxw, y:cyw, rot:0, rows:8, cols:14, pitch:26, rowGap:30}; sections.push(ng); selId=ng.id; }
        else if(add==='floor'){ var nf={id:nid('s'), kind:'floor', name:'Zona de pie', x:cxw, y:cyw, w:400, h:300, rot:0, cap:500}; sections.push(nf); selId=nf.id; }
        else {
          var defs={ stage:['ESCENARIO',220,520], mix:['MIX',110,110], pmr:['PLATAFORMA PMR',420,64], stair:['Escalera',60,120], rail:['Barandilla',420,8], catwalk:['PASARELA',420,90], pit:['FOSO FOTÓGRAFOS',420,70] };
          var d=defs[add]||['Elemento',200,100];
          var ne={id:nid('e'), type:add, label:d[0], x:cxw, y:cyw, w:d[1], h:d[2], rot:0};
          elements.push(ne); selId=ne.id;
        }
        renderSide(); queueRender(); return;
      }
      if(act==='del'){ sections=sections.filter(function(x){return x.id!==selId;}); elements=elements.filter(function(x){return x.id!==selId;}); selId=null; renderSide(); queueRender(); return; }
      if(act==='dup'){
        var o=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        if(!o) return;
        var c=JSON.parse(JSON.stringify(o)); c.id=nid(o.kind?'s':'e');
        if(c.kind==='arc'){ c.dir=(c.dir||0)+ (c.span||24)+4; } else { c.x=(c.x||c.cx||0)+120; c.y=(c.y||0)+60; }
        if(c.name) c.name = c.name+' (copia)';
        (o.kind?sections:elements).push(c); selId=c.id; renderSide(); queueRender(); return;
      }
      if(act==='ring'){
        var base=sections.find(function(x){return x.id===selId;});
        if(!base || base.kind!=='arc') return;
        var nEl=side.querySelector('[data-ring-n]');
        var n=Math.max(2, Math.min(40, parseInt(nEl && nEl.value || '12',10)||12));
        var stepDeg=360/n;
        // Nombre base «Sector 101» → copias «Sector 102», «Sector 103», …
        var m=(base.name||'Sector 1').match(/^(.*?)(\d+)\s*$/); var pref=m?m[1]:(base.name||'Sector ')+' '; var num0=m?parseInt(m[2],10):1; var pad=m?m[2].length:0;
        for(var k=1;k<n;k++){
          var c2=JSON.parse(JSON.stringify(base)); c2.id=nid('s'); c2.dir=(base.dir||0)+k*stepDeg;
          var numk=String(num0+k); while(pad && numk.length<pad) numk='0'+numk;
          c2.name=pref+numk;
          sections.push(c2);
        }
        renderSide(); queueRender(); return;
      }
    });

    /* ================= Zoom / pan / pinch / arrastre ================= */
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
      elements.forEach(function(el){ xs.push(el.x-el.w/2, el.x+el.w/2); ys.push(el.y-el.h/2, el.y+el.h/2); });
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
    svg.addEventListener('pointerdown', function(e){
      try{ svg.setPointerCapture(e.pointerId); }catch(_){}
      pointers[e.pointerId]={x:e.clientX, y:e.clientY};
      var ids=Object.keys(pointers);
      if(ids.length===2){ var a=pointers[ids[0]], b=pointers[ids[1]];
        pinch0={d:Math.hypot(a.x-b.x,a.y-b.y), view:JSON.parse(JSON.stringify(view)), cx:(a.x+b.x)/2, cy:(a.y+b.y)/2}; drag=null; return; }
      var secEl=e.target.closest('[data-sec]'), elEl=e.target.closest('[data-el]');
      var w=client2world(e.clientX,e.clientY);
      if(canEdit && (secEl||elEl)){
        selId=(secEl?secEl.getAttribute('data-sec'):elEl.getAttribute('data-el'));
        var obj=sections.find(function(x){return x.id===selId;})||elements.find(function(x){return x.id===selId;});
        drag={kind:'move', obj:obj, w0:w, o0:JSON.parse(JSON.stringify(obj)), moved:false};
        renderSide(); queueRender();
      } else {
        if(canEdit && selId){ selId=null; renderSide(); }
        drag={kind:'pan', c0:{x:e.clientX,y:e.clientY}, v0:JSON.parse(JSON.stringify(view))};
        queueRender();
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
      // Tooltip de butaca (sector · fila · butaca)
      var seatEl = e.target.closest && e.target.closest('[data-seat]');
      if(seatEl && !drag){
        var parts=seatEl.getAttribute('data-seat').split('|');
        var sObj=sections.find(function(x){return x.id===parts[0];});
        tip.textContent=(sObj?sObj.name:'')+' · Fila '+parts[1]+' · Butaca '+parts[2];
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
        if(Math.abs(dx)+Math.abs(dy)>2) drag.moved=true;
        if(o.kind==='arc'){ o.cx=drag.o0.cx+dx; o.cy=drag.o0.cy+dy; } else { o.x=drag.o0.x+dx; o.y=drag.o0.y+dy; }
        queueRender();
      }
    });
    function endPointer(e){
      delete pointers[e.pointerId];
      if(Object.keys(pointers).length<2) pinch0=null;
      drag=null;
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', endPointer);

    /* ================= Guardar ================= */
    var saveBtn = host.querySelector('[data-vm-save]');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      var body = { version: mapVersion, layout: { version:1, next: nextId, sections: sections, elements: elements } };
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
    renderSide();
    // El encuadre inicial espera al layout (clientWidth/Height aún son 0 al ejecutar el script).
    requestAnimationFrame(function(){ fitAll(); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
