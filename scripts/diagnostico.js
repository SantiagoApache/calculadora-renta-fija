// Diagnóstico temporal: dólar intradía del Banco de la República
const B = "https://suameca.banrep.gov.co/estadisticas-economicas-back/rest/estadisticaEconomicaRestService/";
const H = { Referer: "https://suameca.banrep.gov.co/estadisticas-economicas/", Accept: "application/json" };
const txt = async u => { const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(90000) }); return [r.status, await r.text()]; };
(async () => {
  for (const id of ["1.1", "1", "4110"]) {
    try {
      const [s, d] = await txt(B + "consultaMenuXId?idMenu=" + id);
      console.log("\n== MENU", id, s, d.length, d.slice(0, 500).replace(/\s+/g, " "));
      const j = JSON.parse(d);
      console.log("claves", Object.keys(j).join(","));
      (j.SERIES || []).forEach(q => { const n = (q.data || []).length;
        console.log("   ", q.id, "|", q.nombre, "|", q.unidad, "| n=" + n, "| ultimos", (q.data || []).slice(-4).map(p => new Date(p[0]).toISOString() + "=" + p[1]).join("  "));
        console.log("      campos", Object.keys(q).filter(k => k !== "data").map(k => k + "=" + String(q[k]).slice(0, 60)).join(" ; ")); });
    } catch (e) { console.log("ERR", id, e.message); }
  }
})();
