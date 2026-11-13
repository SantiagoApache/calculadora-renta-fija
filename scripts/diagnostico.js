// Diagnóstico temporal: catálogo SUAMECA (deuda pública / TES) y fuentes de USD/COP
const B = "https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService/";
const H = { Referer: "https://suameca.banrep.gov.co/estadisticas-economicas/", Accept: "application/json" };
const NAV = { Accept: "application/json,text/csv,*/*" };
const txt = async (u, h) => { const r = await fetch(u, { headers: h || H, signal: AbortSignal.timeout(90000) }); return [r.status, await r.text()]; };
function plano(nodos, padre, out) { (nodos || []).forEach(n => { out.push({ id: n.id, padre, nombre: n.nombre, url: n.urlAcceso }); plano(n.menuHijos, n.nombre, out); }); return out; }
(async () => {
  const [s, c] = await txt(B + "consultaMenuXopcion?opcion=CATALOGO_DATOS");
  console.log("CATALOGO", s, c.length);
  const cat = plano(JSON.parse(c), "", []);
  console.log("entradas", cat.length);
  const re = /TES|cero cup|deuda|tesorer|t[ií]tulos|bonos|curva|dólar|dolar|tasa de cambio/i;
  const sel = cat.filter(x => re.test(x.nombre + " " + x.padre));
  sel.forEach(x => console.log("CAT", x.id, "|", x.padre, "|", x.nombre, "|", x.url));
  for (const x of sel.filter(x => x.url && x.url.trim() && /TES|cero cup|deuda|tesorer/i.test(x.nombre + " " + x.padre)).slice(0, 25)) {
    try {
      const [s2, d] = await txt(B + "consultaMenuXId?idMenu=" + x.id);
      const j = JSON.parse(d), se = j.SERIES || [];
      console.log("\n== SERIE", x.id, x.nombre, s2, "n=" + se.length);
      se.slice(0, 40).forEach(q => { const u = q.data && q.data[q.data.length - 1], p = q.data && q.data[0];
        console.log("   ", q.id, "|", q.nombre, "|", q.unidad, "|", q.periodicidad || "", "| n=" + (q.data || []).length, "| primero", p && new Date(p[0]).toISOString().slice(0, 10), p && p[1], "| ultimo", u && new Date(u[0]).toISOString().slice(0, 10), u && u[1]); });
      if (!se.length) console.log(d.slice(0, 300));
    } catch (e) { console.log("ERR", x.id, e.message); }
  }
  for (const u of ["https://query1.finance.yahoo.com/v8/finance/chart/COP=X?interval=1d&range=5d", "https://query2.finance.yahoo.com/v8/finance/chart/USDCOP=X?interval=1d&range=5d",
                   "https://open.er-api.com/v6/latest/USD", "https://stooq.com/q/l/?s=usdcop&f=sd2t2ohlc&h&e=csv"]) {
    try { const [s3, x] = await txt(u, NAV); console.log("\nSRC", u, s3, x.length, "\n", x.slice(0, 700).replace(/\s+/g, " "), u.includes("er-api") ? "COP=" + JSON.parse(x).rates.COP + " " + JSON.parse(x).time_last_update_utc : ""); } catch (e) { console.log("ERR", u, e.message); }
  }
})();
