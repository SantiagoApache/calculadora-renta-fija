// Compara el motor JS contra los resultados de referencia calculados en R
const fs = require("fs");
const path = require("path");
const M = require("../src/motor.js");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/datos.json"), "utf8"));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, "referencia.json"), "utf8"));
const XLSX_PRON = require("../data/pronostico.json");    // pronóstico del profe exportado desde R
const CC = require("../data/curva_cc.json");

// --- series en el formato del motor ---
const CORTE_IPC = M.aDia("2026-09-30"), nP = D.ipc.fechas.filter(f => M.aDia(f) <= CORTE_IPC).length;
const ipc = { fechas: D.ipc.fechas.slice(0, nP).map(M.aDia), inflacion: D.ipc.inflacion.slice(0, nP) };
const ipcViejo = { fechas: ipc.fechas.filter(d => d <= M.aDia("2026-08-31")), inflacion: ipc.inflacion.slice(0, ipc.fechas.filter(d => d <= M.aDia("2026-08-31")).length) };
// Las referencias de R se calcularon con las bases hasta estas fechas: el robot
// diario agrega datos nuevos, así que las pruebas cortan las series ahí.
const CORTE_UVR = M.aDia("2026-11-15"), CORTE_IBR = M.aDia("2026-10-07");
const u0 = M.aDia(D.uvr.inicio);
const uvrV = D.uvr.valores.filter((v, i) => u0 + i <= CORTE_UVR);
const uvr = { fechas: uvrV.map((v, i) => u0 + i), valores: uvrV, mapa: new Map(uvrV.map((v, i) => [u0 + i, v])) };
const nI = D.ibr.fechas.filter(f => M.aDia(f) <= CORTE_IBR).length, cortar = a => a.slice(0, nI);
const ibr = { fechas: cortar(D.ibr.fechas).map(M.aDia), overnight: cortar(D.ibr.overnight), m1: cortar(D.ibr.m1), m3: cortar(D.ibr.m3), m6: cortar(D.ibr.m6), m12: cortar(D.ibr.m12) };
const curvas = D.curvas.map(c => { const i0 = M.aDia(c.inicio); return { nombre: c.nombre, fechas: c.offsets.map(o => i0 + o), tasas: c.tasas }; });
const pron = { fechas: XLSX_PRON.fechas.map(M.aDia), inflacion: XLSX_PRON.inflacion };
const curvaCC = { tipo: "plazo", x: CC.x, tasa: CC.tasa };

const JS = {};
let r, m;
// --- TES ---
r = M.precioTasaFija({ emision: "2024-12-12", vencimiento: "2027-12-12", tasaCupon: 0.1008, periodo: 4, tasaMercado: 0.08, fechaNegociacion: "2025-01-23" });
JS.tes1 = [r.precioSucio, r.interesCorrido, r.precioLimpio];
r = M.precioTasaFija({ emision: "2026-10-20", vencimiento: "2031-10-20", tasaCupon: 0.1385, periodo: 4, tasaMercado: 0.136, fechaNegociacion: "2026-11-04" });
m = M.riesgo({ flujos: r.flujos, t: r.t, tasa: 0.136, periodo: 4, precioActual: r.precioSucioTruncado, factor: 1e8 });
JS.tes2 = [r.precioSucio, r.precioLimpio, m.macaulay, m.modificada, m.convexidad, m.dv01Pesos, ...m.sensibilidad.map(s => s.precioExacto), ...m.sensibilidad.map(s => s.dv01Pesos), m.sube.durConv, m.baja.durConv];
r = M.precioTasaFija({ emision: "2025-01-01", vencimiento: "2033-01-01", tasaCupon: 0.10, periodo: 1, tasaMercado: 0.10, fechaNegociacion: "2025-01-01" });
m = M.riesgo({ flujos: r.flujos, t: r.t, tasa: 0.10, periodo: 1, precioActual: r.precioSucioTruncado, factor: 1e8 });
JS.tes3 = [m.macaulay, m.modificada, m.convexidad, m.sube.durConv, m.baja.durConv];
r = M.precioTasaFija({ emision: "2026-10-20", vencimiento: "2031-10-20", tasaCupon: 0.1385, periodo: 4, tasaMercado: 0.10, fechaNegociacion: "2026-11-04", curvaCC, spreadPb: 129 });
m = M.riesgo({ flujos: r.flujos, t: r.t, tasa: r.tirEquivalente, periodo: 4, precioActual: r.precioSucioTruncado, factor: 1e8, tasasFlujo: r.tasas });
JS.tes4 = [r.precioSucio, r.tirEquivalente, m.modificada, m.dv01Pesos];
r = M.operacionTasaFija({ emision: "2024-12-12", vencimiento: "2027-12-12", tasaCupon: 0.1008, periodo: 4, fechaCompra: "2025-01-23", modoCompra: "tasa", tasaCompra: 0.08,
  fechaVenta: "2026-06-15", modoVenta: "tasa", tasaVenta: 0.09 });
JS.tes5 = [r.tir, r.cupones.reduce((s, c) => s + c.monto, 0)];
// --- IPC ---
r = M.precioIPC({ emision: "2026-10-20", vencimiento: "2036-10-20", periodo: 4, spread: 0.0798, modoIPC: "inicio", tasaMercado: 0.075, tipoTasa: "spread_ipc", fechaNegociacion: "2026-11-04", serie: ipc, montoPesos: 1e10 });
m = M.riesgo({ flujos: r.flujos, t: r.t, tasa: r.tasaDescuento, periodo: 4, precioActual: r.precioSucioTruncado, factor: 1e8 });
JS.ipc1 = [r.precioSucio, r.interesCorrido, r.precioLimpio, r.valorGiro, m.macaulay, m.convexidad, m.dv01Pesos];
r = M.precioIPC({ emision: "2024-01-15", vencimiento: "2026-01-15", periodo: 2, spread: 0.06, modoIPC: "final", tasaMercado: 0.12, tipoTasa: "total", fechaNegociacion: "2024-08-20", serie: ipc, montoPesos: 1e9 });
JS.ipc2 = [r.precioSucio, r.interesCorrido];
for (const md of ["inicio", "final"]) {
  const base = { emision: "2024-01-15", vencimiento: "2025-01-15", periodo: 4, spread: 0.0485, modoIPC: md, fechaCompra: "2024-01-15", modoCompra: "tasa", tasaCompra: 0.1458008,
    fechaVenta: "2025-01-14", modoVenta: "tasa", tasaVenta: 0.103022, serie: ipc, montoPesos: 1e10 };
  let a = M.rentabilidadIPC(Object.assign({ tipo: "real" }, base));
  JS["ipc_real_" + md] = [a.tir, a.precioVenta, a.pygPesos, ...a.cupones.map(c => c.monto)];
  a = M.rentabilidadIPC(Object.assign({ tipo: "estimada" }, base));
  JS["ipc_est_" + md] = [a.tir, a.precioVenta, a.pygPesos];
}
const pronBase = { tipo: "estimada", emision: "2026-10-14", vencimiento: "2027-10-14", periodo: 4, spread: 0.059, modoIPC: "inicio", fechaCompra: "2026-10-14", modoCompra: "precio", precioCompra: 100,
  fechaVenta: "2027-10-14", modoVenta: "precio", precioVenta: 100, montoPesos: 1e9, pronostico: pron, base: "30_360" };
r = M.rentabilidadIPC(Object.assign({}, pronBase, { serie: ipcViejo })); JS.ipc_pron_viejo = [r.tir, ...r.cupones.map(c => c.monto)];
r = M.rentabilidadIPC(Object.assign({}, pronBase, { serie: ipc })); JS.ipc_pron = [r.tir, ...r.cupones.map(c => c.monto)];
r = M.rentabilidadIPC({ tipo: "real", emision: "2024-01-15", vencimiento: "2026-01-15", periodo: 4, spread: 0.05, modoIPC: "inicio", fechaCompra: "2024-03-01", modoCompra: "tasa", tasaCompra: 0.03, tipoTasaCompra: "spread_ipc",
  fechaVenta: "2025-05-20", modoVenta: "precio", precioVenta: 101.2, serie: ipc, montoPesos: 1e10, diasTir: "sin_feb29" });
JS.ipc_spread = [r.tir, r.precioCompra, r.pygPesos];
// --- UVR ---
r = M.precioUVR({ emision: "2026-10-20", vencimiento: "2031-10-20", periodo: 4, tasaCupon: 0.1385, tasaMercado: 0.136, fechaNegociacion: "2026-11-04", serieUVR: uvr, nominal: 1e7, nominalEn: "uvr" });
m = M.riesgo({ flujos: r.flujos, t: r.t, tasa: 0.136, periodo: 4, precioActual: r.precioSucioTruncado, factor: r.nominalUVR / 100 });
JS.uvr1 = [r.precioSucio, r.valorGiro, r.valorGiroUVR, r.uvr, m.dv01Pesos, m.modificadaTrunc / 1e4 * r.valorGiro];
for (const tp of ["real", "estimada"]) {
  const a = M.rentabilidadUVR({ tipo: tp, emision: "2023-03-10", vencimiento: "2028-03-10", periodo: 1, tasaCupon: 0.04, fechaCompra: "2024-02-20", modoCompra: "tasa", tasaCompra: 0.051,
    fechaVenta: "2026-09-30", modoVenta: "tasa", tasaVenta: 0.046, serieUVR: uvr, serieIPC: ipc, nominal: 1e10, nominalEn: "pesos" });
  JS["uvr_" + tp] = [a.tirPesos, a.tirUVR, a.giroCompra, a.valorVenta, a.pygPesos, a.nominalUVR];
}
// --- IBR ---
const ib = (o) => M.rentabilidadIBR(Object.assign({ serieIBR: ibr, curvas, montoPesos: 1e10 }, o));
r = ib({ tipo: "real", emision: "2024-01-15", vencimiento: "2025-01-15", periodo: 12, spread: 0.011, fechaCompra: "2024-01-15", modoCompra: "precio", precioCompra: 100.003 });
JS.ibr_real_muestra = [r.tir, ...r.tabla.map(x => x.valor)];
r = ib({ tipo: "estimada", emision: "2024-10-22", vencimiento: "2026-10-22", periodo: 12, spread: 0.02, fechaCompra: "2024-10-22", modoCompra: "tir", tirCompra: 0.09674 });
m = M.riesgo({ flujos: r.riesgoBase.flujos, t: r.riesgoBase.t, tasa: r.riesgoBase.tasa, periodo: 12, precioActual: r.precioCompra, factor: 1e8 });
JS.ibr_est_tir = [r.precioCompra, r.tir, ...r.tabla.map(x => x.valor), m.macaulay, m.modificada, m.convexidad, m.dv01Pesos];
r = ib({ tipo: "estimada", emision: "2024-10-22", vencimiento: "2026-10-22", periodo: 12, spread: 0.02, fechaCompra: "2024-10-22", modoCompra: "tasa", spreadCompra: 0.018 });
JS.ibr_est_prom = [r.valoracion.precioSucio, r.valoracion.tasaDescuento, r.tir];
r = ib({ tipo: "real", emision: "2024-10-22", vencimiento: "2026-10-22", periodo: 12, spread: 0.02, fechaCompra: "2024-10-22", modoCompra: "tasa", spreadCompra: 0.018,
  fechaVenta: "2025-06-11", modoVenta: "tasa", spreadVenta: 0.013 });
JS.ibr_real_venta = [r.precioCompra, r.precioVenta, r.tir, r.pygPesos, ...r.tabla.map(x => x.valor), r.cuponCorridoVenta, r.limpioVenta];
r = M.rentabilidadIBR({ tipo: "real", serieIBR: ibr, curvas: [], montoPesos: 1e10, emision: "2025-01-08", vencimiento: "2026-01-08", periodo: 12, spread: 0.015, fechaCompra: "2025-01-29",
  modoCompra: "tasa", spreadCompra: 0.015, metodoDescuento: "vigente" });
JS.ibr_davivienda = [r.valoracion.precioSucio, r.valoracion.tasaDescuento, r.tir];
r = ib({ tipo: "estimada", emision: "2026-10-14", vencimiento: "2027-10-14", periodo: 12, spread: 0.011, fechaCompra: "2026-10-14", modoCompra: "precio", precioCompra: 100 });
JS.ibr_fr2026 = [r.tir];
r = ib({ tipo: "estimada", emision: "2024-10-22", vencimiento: "2026-10-22", periodo: 12, spread: 0.02, fechaCompra: "2024-10-22", modoCompra: "tasa", spreadCompra: 0.018,
  fechaVenta: "2025-06-11", modoVenta: "tasa", spreadVenta: 0.013 });
JS.ibr_est_venta = [r.precioVenta, r.tir];
const s = M.sendaTirIBR({ tipo: "real", serieIBR: ibr, curvas, montoPesos: 1e10, emision: "2024-10-22", vencimiento: "2026-10-22", periodo: 12, spread: 0.02,
  fechaCompra: "2024-10-22", modoCompra: "tasa", spreadCompra: 0.018, fechaVenta: "2025-06-11", modoVenta: "tasa", spreadVenta: 0.013 });
JS.ibr_senda = [s.tirVencimiento, ...s.filas.map(f => f.precio)];
for (let j = 0; j < s.pasos.length; j++) s.filas.forEach(f => JS.ibr_senda.push(f.tirs[j]));
JS.festivos = [2024, 2025, 2026].flatMap(a => Array.from(M.festivos(a))).sort((a, b) => a - b).filter((v, i, arr) => arr.indexOf(v) === i);
JS.regla_ibr = [];
for (let d = M.aDia("2024-01-01"); d <= M.aDia("2026-12-31"); d++) JS.regla_ibr.push(M.fechaIbrAplicable(d));

// --- comparación ---
let fallos = 0, total = 0;
for (const k of Object.keys(REF)) {
  const a = REF[k], b = JS[k];
  if (!b) { console.log("FALTA", k); fallos++; continue; }
  if (a.length !== b.length) { console.log("LONGITUD", k, a.length, b.length); fallos++; continue; }
  let peor = 0, idx = -1;
  a.forEach((x, i) => {
    const y = b[i];
    if (x === null && (y === null || Number.isNaN(y))) return;
    const err = Math.abs(x - y) / Math.max(1, Math.abs(x));
    if (!(err <= peor)) { peor = err; idx = i; }
  });
  total++;
  const ok = peor < 1e-9;
  if (!ok) fallos++;
  console.log((ok ? "ok   " : "FALLA") + " " + k.padEnd(18) + " error relativo max " + peor.toExponential(2) + (ok ? "" : "  [i=" + idx + " R=" + a[idx] + " JS=" + b[idx] + "]"));
}
console.log("\n" + (total - fallos) + "/" + total + " casos iguales a R");
process.exit(fallos ? 1 : 0);
