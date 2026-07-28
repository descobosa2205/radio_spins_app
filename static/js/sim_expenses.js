/* MÓDULO DE GASTOS POR CATEGORÍAS (los «bocadillos» de las simulaciones).
 *
 * Es EL MISMO código que usa la pestaña Gastos de una simulación: se sacó aquí para poder reutilizarlo
 * tal cual en las PLANTILLAS DE GASTOS de la ficha del artista/evento/recinto. Así las dos pantallas se
 * comportan igual (tarjetas por categoría, rueda de IVA, cantidad, arrastrar entre categorías,
 * subtotales y total) y cualquier mejora vale para las dos.
 *
 * Uso:
 *   var api = SimExpenses.init({ root: form, rows: [...], qtyCats: [...], onChange: fn });
 *   api.collect()    -> [{category, concept, amount_net, quantity, iva_pct, includes_iva, iva_exempt,
 *                         is_variable, var_type, var_value, var_threshold_*, cond_under_tickets}]
 *   api.recompute()  -> recalcula subtotales y total
 * El HTML de las tarjetas lo pone `templates/_expenses_categories.html`.
 */
(function () {
  'use strict';
  // Los importes se escriben formateados («1.200,50»): hay que leerlos con el parser de la casa.
  function numv(v) {
    if (window.MoneyInput && window.MoneyInput.num) return window.MoneyInput.num(v);
    if (typeof window.numv === 'function') return window.numv(v);
    var n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function init(opts) {
    opts = opts || {};
    var form = opts.root;
    if (!form) return null;
    var QTY_CATS = opts.qtyCats || [];
    var onChange = opts.onChange || function () {};

    // --- helpers (los mismos que en la simulación) ---
    function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
    function val(v){ return (v!=null && v!=='')? v : ''; }
    function sel(a,b){ return String(a==null?'':a).toUpperCase()===b ? 'selected' : ''; }
    function eur(v){ var n=Number(v)||0; return n.toLocaleString('es-ES', { useGrouping: 'always', minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }
    function isQtyCat(k){ return QTY_CATS.indexOf(k) > -1; }
  function varFrag(o, opts){
    o=o||{}; opts=opts||{};
    var vt=(o.var_type||''); var tt=(o.var_threshold_type||'NONE');
    var more = vt ? '' : 'd-none';
    var thrHidden = (tt==='NONE') ? 'd-none' : '';   // el valor del umbral solo si hay umbral
    var profitOpt = opts.profit ? ('<option value="PERCENT_PROFIT" '+sel(vt,'PERCENT_PROFIT')+'>Porcentaje sobre el beneficio (%)</option>') : '';
    return '<div class="row g-2 align-items-end cv-wrap">'+
      '<div class="col-md-6"><label class="form-label small mb-0">Variable por</label>'+
        '<select class="form-select form-select-sm cv-type">'+
          '<option value="" '+sel(vt,'')+'>— Elige tipo de variable —</option>'+
          '<option value="PER_TICKET" '+sel(vt,'PER_TICKET')+'>Por entrada (€)</option>'+
          '<option value="PERCENT" '+sel(vt,'PERCENT')+'>Porcentaje sobre ingresos (% taquilla)</option>'+
          profitOpt+
        '</select></div>'+
      '<div class="col-md-6 cv-more '+more+'"><label class="form-label small mb-0">Valor</label><input type="number" step="0.01" min="0" class="form-control form-control-sm cv-value" value="'+val(o.var_value)+'"></div>'+
      '<div class="col-md-6 cv-more '+more+'"><label class="form-label small mb-0">Umbral</label>'+
        '<select class="form-select form-select-sm cv-tt">'+
          '<option value="NONE" '+sel(tt,'NONE')+'>Sin umbral</option>'+
          '<option value="TICKETS" '+sel(tt,'TICKETS')+'>A partir de nº de entradas</option>'+
          '<option value="AMOUNT" '+sel(tt,'AMOUNT')+'>A partir de importe (€)</option>'+
        '</select></div>'+
      '<div class="col-md-6 cv-more cv-thr '+more+' '+thrHidden+'"><label class="form-label small mb-0">Umbral (valor)</label><input type="number" step="0.01" min="0" class="form-control form-control-sm cv-tv" value="'+val(o.var_threshold_value)+'"></div>'+
      (opts.condUnder ? '<div class="col-12 cv-more '+more+'"><label class="form-label small mb-0">Solo si se venden <strong>menos de</strong>… entradas (vacío = aplica siempre)</label><input type="number" min="0" class="form-control form-control-sm cv-cond" style="max-width:220px;" value="'+val(o.cond_under_tickets)+'"></div>' : '')+
    '</div>';
  }
  function prodRow(o, catKey){
    o=o||{};
    var isVar=!!o.is_variable;
    var iva=(o.iva_pct!=null&&o.iva_pct!=='')?o.iva_pct:21;
    var qty=(o.quantity!=null&&o.quantity!=='')?o.quantity:1;
    var qtyCat=isQtyCat(catKey);
    var qtyCol = qtyCat
      ? '<div class="col-4 col-md-2"><label class="form-label small mb-0">Cantidad</label><input type="number" step="1" min="0" class="form-control form-control-sm pr-qty" value="'+val(qty)+'"></div>'
      : '';
    var totalCol = qtyCat
      ? '<div class="col-12 mt-1"><span class="small text-muted">Total: </span><span class="fw-semibold sim-amt pr-row-total" title="Importe × cantidad (sin IVA)">0,00 €</span></div>'
      : '';
    return '<div class="card card-body p-2 mb-2 prod-row" data-cat="'+esc(catKey)+'" draggable="true">'+
      '<div class="row g-2 align-items-end">'+
        '<div class="col-auto d-flex align-items-end pb-1"><span class="prod-drag-handle" title="Arrastra para cambiar de categoría"><i class="fa fa-grip-vertical"></i></span></div>'+
        '<div class="col '+(qtyCat?'col-md-4':'col-md-5')+'"><label class="form-label small mb-0">Concepto</label><input type="text" class="form-control form-control-sm pr-concept" value="'+esc(o.concept)+'"></div>'+
        '<div class="col-'+(qtyCat?'4':'7')+' col-md-'+(qtyCat?'2':'3')+'"><label class="form-label small mb-0">'+(qtyCat?'Importe/ud.':'Importe')+'</label><div class="input-group input-group-sm"><input type="number" step="0.01" min="0" class="form-control pr-net" value="'+val(o.amount_net)+'"><span class="input-group-text">€</span></div></div>'+
        qtyCol+
        '<div class="col-12 col-md-'+(qtyCat?'3':'4')+' d-flex gap-1 justify-content-end align-items-center">'+
          '<span class="badge text-bg-light border pr-iva-badge me-auto" title="Configura el IVA con la rueda"></span>'+
          '<button type="button" class="btn btn-sm '+(isVar?'btn-primary':'btn-outline-secondary')+' pr-var-toggle" title="Importe variable"><i class="fa fa-chart-line"></i></button>'+
          '<button type="button" class="btn btn-sm btn-outline-secondary pr-cfg-toggle" title="Configurar gasto (IVA)"><i class="fa fa-gear"></i></button>'+
          '<button type="button" class="btn btn-sm btn-outline-danger prod-del" title="Quitar"><i class="fa fa-trash"></i></button>'+
        '</div>'+
        totalCol+
      '</div>'+
      '<div class="pr-cfg mt-2 d-none"><div class="d-flex flex-wrap gap-3 align-items-end border rounded p-2 bg-light">'+
        '<div><label class="form-label small mb-0">IVA</label><div class="input-group input-group-sm" style="width:110px;"><input type="number" step="0.01" min="0" class="form-control pr-iva" value="'+iva+'"><span class="input-group-text">%</span></div></div>'+
        '<label class="form-check small mb-1"><input type="checkbox" class="form-check-input pr-inciva" '+(o.includes_iva?'checked':'')+'> El importe incluye IVA</label>'+
        '<label class="form-check small mb-1"><input type="checkbox" class="form-check-input pr-exempt" '+(o.iva_exempt?'checked':'')+'> Exento de IVA</label>'+
      '</div></div>'+
      '<div class="prod-var mt-2 '+(isVar?'':'d-none')+'">'+varFrag(o,{condUnder: catKey==='RECINTO'})+'</div>'+
    '</div>';
  }
  function ivaBadge(row){
    var b=row.querySelector('.pr-iva-badge'); if(!b) return;
    var exempt=row.querySelector('.pr-exempt').checked;
    var inc=row.querySelector('.pr-inciva').checked;
    var iva=numv(row.querySelector('.pr-iva').value||'21')||0;
    b.textContent = exempt ? 'Exento de IVA' : (inc ? ('IVA '+iva+'% incluido') : ('+ IVA '+iva+'%'));
  }

  function appendHtml(c, html){ var d=document.createElement('div'); d.innerHTML=html; var el=d.firstElementChild; c.appendChild(el); return el; }

  function addProd(catKey, o){
    var wrap=form.querySelector('[data-cat-rows="'+catKey+'"]');
    if(!wrap) return null;
    var el=appendHtml(wrap, prodRow(o, catKey));
    ivaBadge(el);
    recompute();
    return el;
  }
  // Lee los valores actuales de una fila (para re-crearla al cambiar de categoría por arrastre).
  function readProdRow(row){
    var isVar=!row.querySelector('.prod-var').classList.contains('d-none');
    var q=row.querySelector('.pr-qty');
    var o={ concept:row.querySelector('.pr-concept').value||'',
            amount_net:numv(row.querySelector('.pr-net').value||'0')||0,
            quantity:(q?(numv(q.value||'1')||1):1),
            iva_pct:numv(row.querySelector('.pr-iva').value||'21')||0,
            includes_iva:row.querySelector('.pr-inciva').checked,
            iva_exempt:row.querySelector('.pr-exempt').checked,
            is_variable:isVar };
    if(isVar) Object.assign(o, readVar(row.querySelector('.prod-var')));
    return o;
  }

  function readVar(c){
    var cond=c.querySelector('.cv-cond');
    return {
      var_type: c.querySelector('.cv-type') ? (c.querySelector('.cv-type').value || null) : null,
      var_value: c.querySelector('.cv-value') ? (numv(c.querySelector('.cv-value').value||'0')||0) : 0,
      var_threshold_type: c.querySelector('.cv-tt') ? c.querySelector('.cv-tt').value : null,
      var_threshold_value: c.querySelector('.cv-tv') ? (numv(c.querySelector('.cv-tv').value||'0')||0) : 0,
      cond_under_tickets: (cond && cond.value !== '') ? (numv(cond.value)||0) : null
    };
  }
  function rowNet(row){
    var n=numv(row.querySelector('.pr-net').value||'0')||0;
    var q=row.querySelector('.pr-qty');
    var qty=q ? (numv(q.value||'1')||0) : 1;
    n = n * qty;
    var exempt=row.querySelector('.pr-exempt').checked;
    var inc=row.querySelector('.pr-inciva').checked;
    var iva=numv(row.querySelector('.pr-iva').value||'21')||0;
    if(!exempt && inc && iva>0) n = n/(1+iva/100);
    return n;
  }
  function recompute(){
    var grand=0;
    form.querySelectorAll('[data-cat-rows]').forEach(function(wrap){
      var key=wrap.getAttribute('data-cat-rows');
      var net=0, vars=0;
      wrap.querySelectorAll('.prod-row').forEach(function(row){
        if(row.querySelector('.prod-var').classList.contains('d-none')){
          var rn=rowNet(row); net+=rn;
          var rt=row.querySelector('.pr-row-total'); if(rt) rt.textContent=eur(rn);
        }
        else { vars++; }
      });
      grand+=net;
      var t=form.querySelector('[data-cat-total="'+key+'"]'); if(t) t.textContent=eur(net);
      var vn=form.querySelector('[data-cat-var-note="'+key+'"]'); if(vn) vn.textContent = vars ? ('+ '+vars+' variable'+(vars>1?'s':'')) : '';
      var empty=form.querySelector('[data-cat-empty="'+key+'"]'); if(empty) empty.classList.toggle('d-none', wrap.children.length>0);
    });
    var g=document.getElementById('gastosGrandTotal'); if(g) g.textContent=eur(grand);
  }

  function collectProduction(){
    var out=[];
    form.querySelectorAll('[data-cat-rows]').forEach(function(wrap){
      var key=wrap.getAttribute('data-cat-rows');
      wrap.querySelectorAll('.prod-row').forEach(function(row){
        var isVar=!row.querySelector('.prod-var').classList.contains('d-none');
        var q=row.querySelector('.pr-qty');
        var o={ category:key, concept:row.querySelector('.pr-concept').value||'',
                amount_net:numv(row.querySelector('.pr-net').value||'0')||0,
                quantity:(q?(numv(q.value||'1')||1):1),
                iva_pct:numv(row.querySelector('.pr-iva').value||'21')||0,
                includes_iva:row.querySelector('.pr-inciva').checked,
                iva_exempt:row.querySelector('.pr-exempt').checked,
                is_variable:isVar };
        if(isVar) Object.assign(o, readVar(row.querySelector('.prod-var')));
        out.push(o);
      });
    });
    return out;
  }
  var dragRow = null;
  form.addEventListener('dragstart', function(e){
    var row = e.target.closest('.prod-row'); if(!row) return;
    dragRow = row; row.classList.add('dragging');
    try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','row'); }catch(_){}
  });
  form.addEventListener('dragend', function(){
    if(dragRow) dragRow.classList.remove('dragging');
    form.querySelectorAll('.sim-cat-card.drag-over').forEach(function(c){ c.classList.remove('drag-over'); });
    dragRow = null;
  });
  form.addEventListener('dragover', function(e){
    if(!dragRow) return;
    var card = e.target.closest('[data-cat-card]'); if(!card) return;
    e.preventDefault();
    form.querySelectorAll('.sim-cat-card.drag-over').forEach(function(c){ if(c!==card) c.classList.remove('drag-over'); });
    card.classList.add('drag-over');
  });
  form.addEventListener('drop', function(e){
    if(!dragRow) return;
    var card = e.target.closest('[data-cat-card]'); if(!card) return;
    e.preventDefault();
    var newCat = card.getAttribute('data-cat-card');
    var oldCat = dragRow.getAttribute('data-cat');
    card.classList.remove('drag-over');
    if(newCat === oldCat){ return; }
    // Re-crear la fila en la categoría destino (el layout depende de si lleva cantidad).
    var vals = readProdRow(dragRow);
    dragRow.remove();
    addProd(newCat, vals);
    onChange();
  });
    // clic y escritura dentro de las tarjetas
    form.addEventListener('click', function(e){
      var ca=e.target.closest('[data-cat-add]');
      if(ca){ addProd(ca.getAttribute('data-cat-add'), null); onChange(); return; }
      var pdel=e.target.closest('.prod-del'); if(pdel){ pdel.closest('.prod-row').remove(); recompute(); onChange(); return; }
      var pv=e.target.closest('.pr-var-toggle'); if(pv){ var row=pv.closest('.prod-row'); var on=row.querySelector('.prod-var').classList.toggle('d-none'); pv.classList.toggle('btn-primary', !on); pv.classList.toggle('btn-outline-secondary', on); recompute(); onChange(); return; }
      var pc=e.target.closest('.pr-cfg-toggle'); if(pc){ pc.closest('.prod-row').querySelector('.pr-cfg').classList.toggle('d-none'); return; }
    });
    form.addEventListener('input', function(e){
      if(e.target.matches('.pr-net,.pr-iva,.pr-qty,.pr-concept')) { var r=e.target.closest('.prod-row'); if(r) ivaBadge(r); recompute(); onChange(); }
    });
    form.addEventListener('change', function(e){
      if(!e.target.closest('.prod-row')) return;
      if(e.target.matches('.pr-inciva,.pr-exempt')){ var r=e.target.closest('.prod-row'); if(r) ivaBadge(r); recompute(); onChange(); return; }
      if(e.target.matches('.cv-type')){
        var wrap=e.target.closest('.prod-var'); if(!wrap) return;
        var show=!!e.target.value;
        wrap.querySelectorAll('.cv-more').forEach(function(el){ el.classList.toggle('d-none', !show); });
        var tt=wrap.querySelector('.cv-tt'); var thr=wrap.querySelector('.cv-thr');
        if(thr) thr.classList.toggle('d-none', !show || !tt || tt.value==='NONE');
      }
      if(e.target.matches('.cv-tt')){
        var wrap2=e.target.closest('.prod-var'); if(wrap2){ var thr2=wrap2.querySelector('.cv-thr'); if(thr2) thr2.classList.toggle('d-none', e.target.value==='NONE'); }
      }
      onChange();
    });
    // ---- arranque: pinta las filas que llegan ----
    (opts.rows || []).forEach(function (o) { addProd((o.category || 'OTROS'), o); });
    recompute();
    return { collect: collectProduction, recompute: recompute, addRow: addProd };
  }

  window.SimExpenses = { init: init };
})();
