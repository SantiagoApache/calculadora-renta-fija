// Diagnóstico 2: formato de las series SDMX y fuentes de IPC
const BASE = "https://totoro.banrep.gov.co/nsi-jax-ws/rest";
const ACC = { Accept: "application/vnd.sdmx.genericdata+xml;version=2.1" };
async function txt(url, headers) {
  const r = await fetch(url, { headers: Object.assign({ "User-Agent": "calculadora-renta-fija" }, headers || {}) });
  return [r.status, await r.text()];
}
(async () => {
  for (const id of ["DF_IBR_DAILY_LATEST", "DF_UVR_DAILY_LATEST", "DF_CBR_DAILY_LATEST", "DF_TRM_DAILY_LATEST"]) {
    const [s, x] = await txt(BASE + "/data/ESTAT," + id + ",1.0/all/ALL/", ACC);
    console.log("\n== RAW", id, s, x.length);
    const i = x.indexOf("<generic:Series");
    console.log(x.slice(i, i + 1800).replace(/\s+/g, " "));
    const keys = [...x.matchAll(/<generic:SeriesKey>([\s\S]*?)<\/generic:SeriesKey>/g)].map(m => [...m[1].matchAll(/id="([^"]+)" value="([^"]*)"/g)].map(v => v[1] + "=" + v[2]).join(","));
    console.log("SERIES", keys.length); keys.forEach(k => console.log("  ", k));
  }
  const [s2, x2] = await txt(BASE + "/data/ESTAT,DF_IBR_DAILY_HIST,1.0/all/ALL/?startPeriod=2026-10-01", ACC);
  console.log("\n== IBR HIST", s2, x2.length, "obs:", (x2.match(/<generic:Obs>/g) || []).length);
  const [s3, x3] = await txt(BASE + "/data/ESTAT,DF_UVR_DAILY_HIST,1.0/all/ALL/", ACC);
  console.log("== UVR HIST", s3, x3.length, "obs:", (x3.match(/<generic:Obs>/g) || []).length);
  for (const u of ["https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPALTT01COM659N",
                   "https://api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&q=IPC%20inflacion&limit=15",
                   "https://api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&q=desempleo&limit=10"]) {
    try { const [s, x] = await txt(u); console.log("\nSRC", u, s, x.length);
      if (u.includes("catalog")) JSON.parse(x).results.forEach(r => console.log("  ", r.resource.id, "|", r.resource.name, "|", r.resource.data_updated_at));
      else console.log(x.slice(-300)); } catch (e) { console.log("ERR", u, e.message); }
  }
})();
