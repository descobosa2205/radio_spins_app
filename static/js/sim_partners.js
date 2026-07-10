/* Simulaciones · Módulo de SOCIOS (beneficio potencial / riesgo asumido) con slider de venta.
 *
 * Uso: un contenedor <div data-sim-partners="idDelScript"></div> y un
 * <script type="application/json" id="idDelScript">{...}</script> con:
 *   { mode: 'activity'|'general',
 *     activities: [ { label, partners:[{name,logo,pct,company_id,promoter_id,label}],
 *                     series:[{pct,tickets,ingresos,gastos,resultado} x0..100],
 *                     sellable, break_even_pct, break_even_tickets } ] }
 *
 * - Slider 0–100% en pasos de 1% con degradado rojo→verde según el resultado en cada punto.
 * - Flecha-etiqueta en el punto de empate (entradas y %).
 * - Por socio: beneficio potencial (resultado × su %) y riesgo (gastos × su %), en vivo.
 * - En modo general agrega varias fechas (cada una con sus propios socios y %).
 */
(function () {
  'use strict';

  function fmtEur(n) {
    n = Number(n) || 0;
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function fmtInt(n) { return (Number(n) || 0).toLocaleString('es-ES'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Interpolación de color rojo → ámbar → verde según el resultado (t en [-1, 1]).
  function mix(a, b, t) { return Math.round(a + (b - a) * t); }
  function colorFor(t) {
    var red = [220, 38, 38], amber = [245, 158, 11], green = [22, 163, 74];
    var c;
    if (t < 0) { var u = 1 + Math.max(t, -1); c = [mix(red[0], amber[0], u), mix(red[1], amber[1], u), mix(red[2], amber[2], u)]; }
    else { var v = Math.min(t, 1); c = [mix(amber[0], green[0], v), mix(amber[1], green[1], v), mix(amber[2], green[2], v)]; }
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function partnerKey(p) { return p.company_id || p.promoter_id || ('label:' + (p.label || p.name || '')); }

  function build(container, data) {
    var acts = (data.activities || []).filter(function (a) { return a && a.series && a.series.length; });
    if (!acts.length) {
      container.innerHTML = '<div class="text-muted">Configura el ticketing para ver el reparto por socios.</div>';
      return;
    }

    // Agregado total por % (suma de todas las fechas del payload).
    var agg = [];
    for (var p = 0; p <= 100; p++) {
      var t = { pct: p, tickets: 0, ingresos: 0, gastos: 0, resultado: 0 };
      acts.forEach(function (a) {
        var pt = a.series[p] || a.series[a.series.length - 1];
        t.tickets += pt.tickets; t.ingresos += pt.ingresos; t.gastos += pt.gastos; t.resultado += pt.resultado;
      });
      agg.push(t);
    }
    var sellable = acts.reduce(function (n, a) { return n + (a.sellable || 0); }, 0);

    // Punto de empate agregado (primer % con resultado >= 0; si en 0% ya es >= 0 no se marca).
    var be = null;
    for (var i = 0; i <= 100; i++) { if (agg[i].resultado >= 0) { be = agg[i]; break; } }
    var beAtZero = be && be.pct === 0;

    // Socios agregados (una fila por socio; su beneficio/riesgo suma cada fecha con su % en ella).
    var partnersMap = {}, partnersOrder = [];
    acts.forEach(function (a) {
      (a.partners || []).forEach(function (pr) {
        var k = partnerKey(pr);
        if (!partnersMap[k]) { partnersMap[k] = { name: pr.name, logo: pr.logo || '' }; partnersOrder.push(k); }
      });
    });

    function partnerTotals(pct) {
      var out = {};
      partnersOrder.forEach(function (k) { out[k] = { beneficio: 0, riesgo: 0, pcts: [] }; });
      acts.forEach(function (a) {
        var pt = a.series[pct] || a.series[a.series.length - 1];
        // Riesgo: los socios que «no soportan pérdidas» no asumen gasto; su parte se reparte entre
        // el resto proporcional a su %. Así los que sí soportan pérdidas se reparten TODO el gasto.
        var lossPctSum = 0;
        (a.partners || []).forEach(function (pr) { if (!pr.no_loss) lossPctSum += (Number(pr.pct) || 0); });
        (a.partners || []).forEach(function (pr) {
          var k = partnerKey(pr), pct2 = (Number(pr.pct) || 0), share = pct2 / 100.0;
          out[k].beneficio += pt.resultado * share;
          if (pr.no_loss) {
            // sin riesgo
          } else if (lossPctSum > 0) {
            out[k].riesgo += pt.gastos * (pct2 / lossPctSum);
          } else {
            out[k].riesgo += pt.gastos * share;
          }
          out[k].pcts.push(pct2);
        });
      });
      return out;
    }

    // Degradado del slider según el resultado en cada punto.
    var maxAbs = agg.reduce(function (m, r) { return Math.max(m, Math.abs(r.resultado)); }, 0) || 1;
    var stops = [];
    for (var q = 0; q <= 100; q += 5) {
      stops.push(colorFor(agg[q].resultado / maxAbs) + ' ' + q + '%');
    }
    var gradient = 'linear-gradient(90deg,' + stops.join(',') + ')';

    var hasPartners = partnersOrder.length > 0;
    var html = '';
    html += '<div class="simp-top d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">';
    html += '<div class="small text-muted">Venta simulada</div>';
    html += '<div class="simp-live"><span class="badge text-bg-dark" data-simp-live></span></div>';
    html += '</div>';
    html += '<div class="simp-slider-wrap">';
    if (be && !beAtZero) {
      html += '<div class="simp-be" style="left:' + be.pct + '%;" title="Punto de empate">' +
        '<span class="simp-be__label">Empate · ' + fmtInt(be.tickets) + ' ent (' + be.pct + '%)</span>' +
        '<span class="simp-be__arrow"></span></div>';
    }
    html += '<input type="range" min="0" max="100" step="1" value="100" class="simp-range" style="background:' + gradient + ';" aria-label="Porcentaje de venta">';
    html += '</div>';
    if (!be) html += '<div class="small text-warning mt-1"><i class="fa fa-triangle-exclamation me-1"></i>No se alcanza el punto de empate ni al 100% de la venta.</div>';
    html += '<div class="d-flex flex-wrap gap-3 my-2" data-simp-totals></div>';
    if (hasPartners) {
      // Cabeceras a dos líneas (la aclaración entre paréntesis va debajo del título) y filas altas.
      html += '<div class="table-responsive"><table class="table table-sm align-middle mb-0 simp-table"><thead><tr>' +
        '<th class="align-bottom">Socio</th>' +
        '<th class="text-end align-bottom">Participación</th>' +
        '<th class="text-end">Beneficio potencial<br><span class="text-muted fw-normal small">(neto, sin IVA y sin SGAE)</span></th>' +
        '<th class="text-end">Riesgo asumido<br><span class="text-muted fw-normal small">(gastos, sin IVA)</span></th>' +
        '</tr></thead><tbody data-simp-rows></tbody></table></div>';
    } else {
      html += '<div class="text-muted small">Sin socios configurados: añade socios para ver el reparto.</div>';
    }
    container.innerHTML = html;

    var range = container.querySelector('.simp-range');
    var live = container.querySelector('[data-simp-live]');
    var totalsEl = container.querySelector('[data-simp-totals]');
    var rowsEl = container.querySelector('[data-simp-rows]');

    function render(pct) {
      var pt = agg[pct];
      live.textContent = pct + '% · ' + fmtInt(pt.tickets) + ' de ' + fmtInt(sellable) + ' entradas';
      var cls = pt.resultado >= 0 ? 'text-success' : 'text-danger';
      totalsEl.innerHTML =
        '<div class="sim-stat"><div class="sim-stat__n ' + cls + '"><span class="sim-amt" title="Neto: sin IVA y sin SGAE">' + fmtEur(pt.resultado) + '</span></div><div class="sim-stat__l">Resultado a este % de venta</div></div>' +
        '<div class="sim-stat"><div class="sim-stat__n"><span class="sim-amt" title="Sin IVA">' + fmtEur(pt.ingresos) + '</span></div><div class="sim-stat__l">Ingresos</div></div>' +
        '<div class="sim-stat"><div class="sim-stat__n"><span class="sim-amt" title="Sin IVA">' + fmtEur(pt.gastos) + '</span></div><div class="sim-stat__l">Gastos</div></div>';
      if (rowsEl) {
        var tot = partnerTotals(pct);
        rowsEl.innerHTML = partnersOrder.map(function (k) {
          var pr = partnersMap[k], v = tot[k];
          var img = pr.logo
            ? '<img src="' + esc(pr.logo) + '" alt="" style="height:26px;max-width:74px;object-fit:contain;">'
            : '<i class="fa fa-user text-muted"></i>';
          var pcts = v.pcts.length ? Array.from(new Set(v.pcts)).join('% / ') + '%' : '—';
          return '<tr>' +
            '<td><span class="d-inline-flex align-items-center gap-2"><span class="simp-logo">' + img + '</span>' +
            '<span class="fw-medium simp-name">' + esc(pr.name) + '</span></span></td>' +
            '<td class="text-end fw-semibold">' + pcts + '</td>' +
            '<td class="text-end fw-semibold ' + (v.beneficio >= 0 ? 'text-success' : 'text-danger') + '"><span class="sim-amt" title="Neto: sin IVA y sin SGAE">' + fmtEur(v.beneficio) + '</span></td>' +
            '<td class="text-end"><span class="sim-amt" title="Sin IVA">' + fmtEur(v.riesgo) + '</span></td>' +
            '</tr>';
        }).join('');
      }
      range.style.setProperty('--simp-pct', pct);
    }
    range.addEventListener('input', function () { render(parseInt(this.value, 10) || 0); });
    render(100);
  }

  function init() {
    document.querySelectorAll('[data-sim-partners]').forEach(function (el) {
      if (el.dataset.simpReady) return;
      var src = document.getElementById(el.getAttribute('data-sim-partners'));
      if (!src) return;
      var data = null;
      try { data = JSON.parse(src.textContent || 'null'); } catch (e) { data = null; }
      if (!data) return;
      el.dataset.simpReady = '1';
      build(el, data);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
