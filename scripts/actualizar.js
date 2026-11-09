// =============================================================
// ROBOT DE ACTUALIZACIÓN (corre en GitHub Actions)
// Trae IBR, UVR, TRM y tasa de política del Banco de la República (SDMX),
// tasa de la Fed y desempleo de EE. UU. (FRED) y titulares (Google Noticias).
// Reglas: solo AGREGA datos nuevos, nunca borra; si una fuente falla o sus
// datos no coinciden con los que ya teníamos, se conserva lo anterior.
// =============================================================
const fs = require("fs"), path = require("path");
const RAIZ = path.join(__dirname, "..");
const ARCH_DATOS = path.join(RAIZ, "data/datos.json"), ARCH_MERC = path.join(RAIZ, "data/mercado.json");
const datos = JSON.parse(fs.readFileSync(ARCH_DATOS, "utf8"));
const mercado = JSON.parse(fs.readFileSync(ARCH_MERC, "utf8"));
const SDMX = "https://totoro.banrep.gov.co/nsi-jax-ws/rest/data/ESTAT,";
const DIA = 86400000;
const aDia = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DIA);
const aTexto = n => new Date(n * DIA).toISOString().slice(0, 10);
const hoy = aTexto(Math.floor((Date.now() - 5 * 3600000) / DIA));   // fecha en Bogotá
const log = (...a) => console.log(...a);
const resumen = [];

async function traer(url, headers, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, { headers: Object.assign({ "User-Agent": "calculadora-renta-fija (GitHub Actions)" }, headers || {}), signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) {
      log("  intento", i, "falló:", url.slice(0, 90), e.message);
      if (i === intentos) throw e;
      await new Promise(s => setTimeout(s, 4000 * i));
    }
  }
}
// SDMX genérico -> [{dim: {SUBJECT, UNIT_MEASURE, ...}, obs: [['YYYY-MM-DD', valor]]}]
async function sdmx(flujo, query) {
  const x = await traer(SDMX + flujo + ",1.0/all/ALL/" + (query || ""), { Accept: "application/vnd.sdmx.genericdata+xml;version=2.1" });
  return [...x.matchAll(/<generic:Series>([\s\S]*?)<\/generic:Series>/g)].map(m => {
    const k = (m[1].match(/<generic:SeriesKey>([\s\S]*?)<\/generic:SeriesKey>/) || ["", ""])[1];
    const dim = Object.fromEntries([...k.matchAll(/id="([^"]+)" value="([^"]*)"/g)].map(v => [v[1], v[2]]));
    const obs = [...m[1].matchAll(/<generic:ObsDimension value="(\d{8})"\s*\/>\s*<generic:ObsValue value="([^"]+)"/g)]
      .map(o => [o[1].slice(0, 4) + "-" + o[1].slice(4, 6) + "-" + o[1].slice(6, 8), Number(o[2])]).filter(o => isFinite(o[1]));
    return { dim, obs };
  });
}
function serieDe(series, subject, unidad) {
  const m = new Map();
  series.filter(x => x.dim.SUBJECT === subject && (!unidad || x.dim.UNIT_MEASURE === unidad)).forEach(s => s.obs.forEach(o => m.set(o[0], o[1])));
  return m;
}
const ultimo = mapa => { const k = [...mapa.keys()].sort(); return k.length ? [k[k.length - 1], mapa.get(k[k.length - 1])] : null; };

// ---------- IBR (tasas nominales, como el Excel del Banco de la República) ----------
async function actualizarIBR() {
  const anio = Number(hoy.slice(0, 4));
  const series = (await sdmx("DF_IBR_DAILY_HIST", "?startPeriod=" + (anio - 1))).concat(await sdmx("DF_IBR_DAILY_LATEST"));
  const col = { overnight: "IRIBRM00", m1: "IRIBRM01", m3: "IRIBRM03", m6: "IRIBRM06", m12: "IRIBRM12" };
  const mapas = {};
  for (const c in col) mapas[c] = serieDe(series, col[c], "NR");
  if (!mapas.overnight.size) throw new Error("la respuesta no trae el IBR overnight nominal");
  // Control: los días que ya teníamos deben coincidir con lo que publica el Banco
  const idx = new Map(datos.ibr.fechas.map((f, i) => [f, i]));
  let comparados = 0, distintos = 0;
  for (const c of ["overnight", "m1", "m3", "m6"]) for (const [f, v] of mapas[c]) {
    const i = idx.get(f);
    if (i == null || datos.ibr[c][i] == null) continue;
    comparados++;
    if (Math.abs(datos.ibr[c][i] - v) > 0.0011) distintos++;
  }
  log("  IBR: días comparados", comparados, "distintos", distintos);
  if (comparados > 20 && distintos / comparados > 0.02) throw new Error("no coincide con la base actual (" + distintos + " de " + comparados + ")");
  const ult = datos.ibr.fechas[datos.ibr.fechas.length - 1];
  const nuevas = [...mapas.overnight.keys()].filter(f => f > ult).sort();
  nuevas.forEach(f => {
    datos.ibr.fechas.push(f);
    for (const c in col) datos.ibr[c].push(mapas[c].has(f) ? mapas[c].get(f) : null);
  });
  resumen.push("IBR: " + nuevas.length + " día(s) nuevo(s); último dato " + datos.ibr.fechas[datos.ibr.fechas.length - 1]);
}

// ---------- UVR diaria ----------
async function actualizarUVR() {
  const m = serieDe(await sdmx("DF_UVR_DAILY_HIST"), "RVU", "CRVU");
  if (!m.size) throw new Error("la respuesta no trae el valor de la UVR");
  const u0 = aDia(datos.uvr.inicio), v = datos.uvr.valores;
  let comparados = 0, distintos = 0;
  v.forEach((x, i) => { const f = aTexto(u0 + i); if (m.has(f)) { comparados++; if (Math.abs(m.get(f) - x) > 0.00011) distintos++; } });
  log("  UVR: días comparados", comparados, "distintos", distintos);
  if (comparados > 100 && distintos / comparados > 0.01) throw new Error("no coincide con la base actual (" + distintos + " de " + comparados + ")");
  let n = 0;
  for (let d = u0 + v.length; m.has(aTexto(d)); d++) { v.push(Math.round(m.get(aTexto(d)) * 1e4) / 1e4); n++; }
  resumen.push("UVR: " + n + " día(s) nuevo(s); último dato " + aTexto(u0 + v.length - 1));
}

// ---------- Indicadores ----------
function fijar(id, campos) {
  const x = mercado.indicadores.find(i => i.id === id);
  if (x) { delete x.texto; Object.assign(x, campos); } else mercado.indicadores.push(Object.assign({ id }, campos));
}
async function indicadoresBanRep() {
  const trm = ultimo(serieDe(await sdmx("DF_TRM_DAILY_LATEST"), "CCSP"));
  if (trm) fijar("trm", { nombre: "TRM", valor: trm[1], unidad: "cop", fecha: trm[0], detalle: "Tasa Representativa del Mercado vigente", fuente: "Banco de la República", url: "https://www.banrep.gov.co/es/estadisticas/trm" });
  const tpm = ultimo(serieDe(await sdmx("DF_CBR_DAILY_LATEST"), "IRCBRM01"));
  if (tpm) fijar("banrep", { nombre: "Tasa BanRep", valor: tpm[1], unidad: "pct", fecha: tpm[0], detalle: "Tasa de política monetaria vigente", fuente: "Banco de la República", url: "https://www.banrep.gov.co/es/estadisticas/tasas-interes-politica-monetaria" });
  resumen.push("TRM: " + (trm ? trm[1] + " (" + trm[0] + ")" : "sin dato") + " · Tasa BanRep: " + (tpm ? tpm[1] + " %" : "sin dato"));
}
async function fred(id) {
  const filas = (await traer("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + id)).trim().split("\n").slice(1)
    .map(l => l.split(",")).filter(p => p[1] && p[1] !== "." && isFinite(+p[1]));
  return filas.length ? [filas[filas.length - 1][0], +filas[filas.length - 1][1]] : null;
}
const coma = x => x.toFixed(2).replace(".", ",");
async function indicadoresEEUU() {
  const lo = await fred("DFEDTARL"), hi = await fred("DFEDTARU"), un = await fred("UNRATE");
  if (lo && hi) fijar("fed", { nombre: "Tasa Fed", texto: coma(lo[1]) + " – " + coma(hi[1]) + " %", valor: (lo[1] + hi[1]) / 2, unidad: "rango", fecha: hi[0], detalle: "Rango objetivo de fondos federales", fuente: "FRED (Fed de San Luis)", url: "https://fred.stlouisfed.org/series/DFEDTARU" });
  if (un) {
    const p = un[0].split("-").map(Number), fin = aTexto(Math.round(Date.UTC(p[0], p[1], 0) / DIA));
    fijar("desUsa", { nombre: "Desempleo EE. UU.", valor: un[1], unidad: "pct", fecha: fin, detalle: "Tasa de desempleo mensual (BLS)", fuente: "FRED", url: "https://fred.stlouisfed.org/series/UNRATE" });
  }
  resumen.push("Fed: " + (lo && hi ? coma(lo[1]) + "–" + coma(hi[1]) + " %" : "sin dato") + " · Desempleo EE. UU.: " + (un ? un[1] + " % (" + un[0].slice(0, 7) + ")" : "sin dato"));
}

// ---------- Noticias: solo titular, fuente, fecha y enlace ----------
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const limpiar = s => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&(amp|lt|gt|quot|apos|#39);/g, m => ENT[m]).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
async function rss(q) {
  const x = await traer("https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:7d") + "&hl=es-419&gl=CO&ceid=CO:es-419");
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = t => (m[1].match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">")) || [])[1];
    const fuente = limpiar(g("source") || "");
    let titulo = limpiar(g("title") || "");
    if (fuente && titulo.endsWith(" - " + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    const f = new Date(g("pubDate") || 0);
    return { titulo, fuente, url: limpiar(g("link") || ""), fecha: isNaN(f) ? hoy : f.toISOString().slice(0, 10), t: +f };
  }).filter(n => n.titulo && /^https:\/\//.test(n.url));
}
// Medios financieros y generalistas reconocidos: van primero; los demás solo
// completan la lista si no alcanza.
const CONFIABLES = /portafolio|la rep[uú]blica|el tiempo|el espectador|valora analitik|semana|infobae|bloomberg|el colombiano|rcn|caracol|la fm|forbes|reuters|expansi[oó]n|el pa[ií]s|cnn|el economista|bbc|investing|financial times|wall street journal|dinero|blu radio|w radio|cambio|el heraldo|pulzo|france 24|dw|europa press|ámbito|el financiero/i;
const palabras = t => new Set(t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(w => w.length > 3));
function parecidas(a, b) { const A = palabras(a), B = palabras(b); let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / Math.max(1, Math.min(A.size, B.size)) >= 0.5; }
async function noticias() {
  const grupos = {
    Colombia: ["Banco de la República tasas de interés", "dólar en Colombia", "inflación Colombia", "TES deuda pública Colombia", "Ministerio de Hacienda Colombia"],
    Mundo: ["Reserva Federal tasas de interés", "Wall Street bolsa", "bonos del Tesoro Estados Unidos rendimientos", "Banco Central Europeo tasas", "petróleo precio mercados"]
  };
  const out = [];
  for (const amb in grupos) {
    let lista = [];
    for (const q of grupos[amb]) { try { lista = lista.concat(await rss(q)); } catch (e) { log("  noticias:", q, e.message); } }
    lista.sort((a, b) => (CONFIABLES.test(b.fuente) - CONFIABLES.test(a.fuente)) || (b.t - a.t));
    const elegidas = [];
    for (const n of lista) {
      if (elegidas.length >= 6) break;
      if (elegidas.some(e => parecidas(e.titulo, n.titulo))) continue;
      elegidas.push(n);
    }
    elegidas.sort((a, b) => b.t - a.t).forEach(n => out.push({ titulo: n.titulo, fuente: n.fuente, fecha: n.fecha, ambito: amb, url: n.url }));
  }
  if (out.length >= 4) { mercado.noticias = out; resumen.push("Noticias: " + out.length + " titulares"); }
  else resumen.push("Noticias: se conservan las anteriores (respuesta incompleta)");
}

(async () => {
  const pasos = [["IBR", actualizarIBR], ["UVR", actualizarUVR], ["Indicadores del Banco de la República", indicadoresBanRep],
                 ["Indicadores de EE. UU.", indicadoresEEUU], ["Noticias", noticias]];
  let fallas = 0;
  for (const [n, f] of pasos) {
    log("→", n);
    try { await f(); } catch (e) { fallas++; resumen.push(n + ": se conservan los datos anteriores (" + e.message + ")"); log("  ERROR", e.message); }
  }
  datos.generado = hoy;
  mercado.actualizado = hoy;
  fs.writeFileSync(ARCH_DATOS, JSON.stringify(datos));
  fs.writeFileSync(ARCH_MERC, JSON.stringify(mercado, null, 1));
  log("\nRESUMEN\n- " + resumen.join("\n- "));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Actualización " + hoy + "\n- " + resumen.join("\n- ") + "\n");
  if (fallas === pasos.length) process.exit(1);
})();
