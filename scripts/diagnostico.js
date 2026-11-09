// Diagnóstico de fuentes: catálogo SDMX del Banco de la República y otras fuentes
const BASE = "https://totoro.banrep.gov.co/nsi-jax-ws/rest";
const ACC = { Accept: "application/vnd.sdmx.genericdata+xml;version=2.1" };
async function txt(url, headers) {
  const r = await fetch(url, { headers: Object.assign({ "User-Agent": "calculadora-renta-fija" }, headers || {}) });
  return [r.status, await r.text()];
}
(async () => {
  let [st, cat] = await txt(BASE + "/dataflow/all/all/latest");
  console.log("CATALOGO", st, cat.length);
  const flujos = [...cat.matchAll(/<str:Dataflow[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/str:Dataflow>/g)].map(m => {
    const n = (m[2].match(/<com:Name xml:lang="es">([^<]*)/) || m[2].match(/<com:Name[^>]*>([^<]*)/) || [])[1];
    return [m[1], n];
  });
  flujos.forEach(f => console.log("FLOW", f[0], "|", f[1]));
  const buscar = /CBR|IBR|UVR|CPI|IPC|INF|TRM|UNE|DES|TIB|DTF|EXR/i;
  for (const [id] of flujos.filter(f => buscar.test(f[0] + " " + f[1]))) {
    try {
      const [s, x] = await txt(BASE + "/data/ESTAT," + id + ",1.0/all/ALL/?startPeriod=2026-09-01", ACC);
      const series = [...x.matchAll(/<generic:Series>([\s\S]*?)<\/generic:Series>/g)];
      console.log("\n== DATA", id, s, "series:", series.length, "bytes:", x.length);
      series.slice(0, 12).forEach(se => {
        const key = [...se[1].matchAll(/<generic:Value id="([^"]+)" value="([^"]*)"/g)].slice(0, 12).map(v => v[1] + "=" + v[2]).join(",");
        const obs = [...se[1].matchAll(/<generic:ObsDimension value="([^"]+)"\/>\s*<generic:ObsValue value="([^"]+)"/g)];
        console.log("  KEY", key, "| n=" + obs.length, "| primero", obs[0] && obs[0][1], obs[0] && obs[0][2], "| ultimo", obs.length && obs[obs.length - 1][1], obs.length && obs[obs.length - 1][2]);
      });
      if (!series.length) console.log(x.slice(0, 600));
    } catch (e) { console.log("ERR", id, e.message); }
  }
  for (const u of ["https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=2",
                   "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU", "https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE",
                   "https://news.google.com/rss/search?q=Banco%20de%20la%20Rep%C3%BAblica%20tasas&hl=es-419&gl=CO&ceid=CO:es-419"]) {
    try { const [s, x] = await txt(u); console.log("\nSRC", u, s, x.length, "\n", x.slice(0, 300), "\n...", x.slice(-200)); } catch (e) { console.log("ERR", u, e.message); }
  }
})();
