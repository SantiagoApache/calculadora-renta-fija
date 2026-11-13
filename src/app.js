/* Interfaz de la Calculadora de Renta Fija. Usa window.Motor (motores
   validados contra R) y window.DATOS (series del Banco de la República). */
(function () {
  "use strict";
  const M = window.Motor, RAW = window.DATOS;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

  // =============================================================
  // FORMATO (es-CO: punto de miles, coma decimal)
  // =============================================================
  const NF = {};
  function fN(x, d) {
    if (d == null) d = 2;
    if (x == null || !isFinite(x)) return "—";
    const f = NF[d] || (NF[d] = new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
    return f.format(x).replace("-", "−");
  }
  const fPct = (x, d) => (x == null || !isFinite(x)) ? "—" : fN(x * 100, d == null ? 4 : d) + " %";
  function compacto(v) {
    if (v == null || !isFinite(v)) return "";
    const a = Math.abs(v);
    if (a >= 1e12) return fN(v / 1e12, 2) + " billones";
    if (a >= 1e9) return fN(v / 1e9, 2) + " mil millones";
    if (a >= 1e6) return fN(v / 1e6, 2) + " millones";
    if (a >= 1e3) return fN(v / 1e3, 2) + " mil";
    return fN(v, 2);
  }
  function fPesos(v, d) {
    if (v == null || !isFinite(v)) return "—";
    if (d == null) d = Math.abs(v) >= 1000 ? 0 : 2;
    return (v < 0 ? "−$ " : "$ ") + fN(Math.abs(v), d);
  }
  const fUVR = (v, d) => (v == null || !isFinite(v)) ? "—" : fN(v, d == null ? 2 : d) + " UVR";
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function fF(n) {
    if (n == null || !isFinite(n)) return "—";
    const p = M.ymd(n);
    return String(p[2]).padStart(2, "0") + " " + MESES[p[1] - 1] + " " + p[0];
  }
  const hoy = (() => { const d = new Date(); return M.aDia(d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate()); })();

  // Lectura de lo que escribe la persona
  function pNum(s) {
    if (typeof s === "number") return s;
    s = String(s == null ? "" : s).trim().replace(/[\s%$]/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return Number(s);
  }
  const pPct = s => pNum(s) / 100;
  function pDinero(s) {
    s = String(s == null ? "" : s).replace(/[\s$]/g, "").replace(/\./g, "").replace(",", ".");
    return s ? Number(s) : NaN;
  }
  function formatoDinero(s) {
    const v = pDinero(s);
    if (!isFinite(v)) return s;
    const ent = Math.trunc(v), dec = Math.abs(v - ent);
    return fN(ent, 0).replace("−", "-") + (dec > 1e-9 ? "," + String(dec.toFixed(2)).slice(2) : "");
  }
  function falta(x, nombre) { if (x == null || (typeof x === "number" && !isFinite(x)) || x === "") { const e = new Error("Revisa el campo «" + nombre + "»: está vacío o no es un número."); e.esValidacion = true; throw e; } return x; }

  // =============================================================
  // SERIES DE DATOS
  // =============================================================
  const S = { origen: {} };
  function serieUVR(fechas, valores) {
    const idx = fechas.map((f, i) => i).sort((a, b) => fechas[a] - fechas[b]);
    const f = idx.map(i => fechas[i]), v = idx.map(i => valores[i]);
    return { fechas: f, valores: v, mapa: new Map(f.map((d, i) => [d, v[i]])) };
  }
  const ORIGINAL = {
    ipc: () => ({ fechas: RAW.ipc.fechas.map(M.aDia), inflacion: RAW.ipc.inflacion.slice() }),
    uvr: () => { const u0 = M.aDia(RAW.uvr.inicio); return serieUVR(RAW.uvr.valores.map((v, i) => u0 + i), RAW.uvr.valores); },
    ibr: () => ({ fechas: RAW.ibr.fechas.map(M.aDia), overnight: RAW.ibr.overnight, m1: RAW.ibr.m1, m3: RAW.ibr.m3, m6: RAW.ibr.m6, m12: RAW.ibr.m12 }),
    curvas: () => RAW.curvas.map(c => { const i0 = M.aDia(c.inicio); return { nombre: c.nombre, fechas: c.offsets.map(o => i0 + o), tasas: c.tasas }; }),
    pron: () => ({ fechas: RAW.pronostico.fechas.map(M.aDia), inflacion: RAW.pronostico.inflacion.slice() }),
    cc: () => ({ tipo: "plazo", x: RAW.curvaCC.x.slice(), tasa: RAW.curvaCC.tasa.slice() })
  };
  const ETIQUETA_ORIGINAL = {
    ipc: "Banco de la República", uvr: "Banco de la República · " + (RAW.generado || ""),
    ibr: "Banco de la República · " + (RAW.generado || ""), curvas: "Curvas de ejemplo", pron: "Pronóstico de ejemplo", cc: "Curva de ejemplo"
  };
  function restaurar(k) { S[k] = ORIGINAL[k](); S.origen[k] = ETIQUETA_ORIGINAL[k]; }
  Object.keys(ORIGINAL).forEach(restaurar);

  // =============================================================
  // DEFINICIÓN DE LAS CALCULADORAS
  // =============================================================
  const PER = [["1", "Anual"], ["2", "Semestral"], ["4", "Trimestral"], ["12", "Mensual"]];
  const MODO_PT = [["tasa", "Por tasa"], ["precio", "Por precio sucio"]];
  const CALCS = {
    tf: {
      nombre: "Tasa Fija", corto: "TES · cupón fijo",
      modos: [
        { id: "valorar", nombre: "Valorar", form: "tf_valorar", desc: "Precio sucio, limpio, interés corrido y riesgo de un bono de cupón fijo, descontado con una TIR o con una curva cero cupón más un spread." },
        { id: "operacion", nombre: "Comprar y vender", form: "tf_operacion", desc: "Rentabilidad (TIR) de comprar el bono en una fecha y venderlo en otra o mantenerlo hasta el vencimiento." }
      ]
    },
    uvr: {
      nombre: "UVR", corto: "TES en unidades UVR",
      modos: [
        { id: "valorar", nombre: "Valorar", form: "uvr_valorar", desc: "Precio del TES UVR, valor de giro en pesos y en UVR con la UVR del día, y su riesgo en ambas unidades." },
        { id: "rent", nombre: "Rentabilidad", form: "uvr_rent", desc: "TIR de la operación en pesos y en UVR. La estimada proyecta la UVR con el IPC vigente a la compra; la real usa la UVR publicada." }
      ]
    },
    ipc: {
      nombre: "IPC", corto: "Bonos IPC + spread",
      modos: [
        { id: "valorar", nombre: "Valorar", form: "ipc_valorar", desc: "Precio de un bono indexado al IPC: cupón (1 + IPC)(1 + spread) − 1, descontado con tasa total o con spread sobre el IPC." },
        { id: "rent", nombre: "Rentabilidad", form: "ipc_rent", desc: "TIR de la operación. La estimada usa solo el IPC conocido a la compra (y, si quieres, un pronóstico); la real usa el IPC publicado." }
      ]
    },
    ibr: {
      nombre: "IBR", corto: "Bonos IBR + spread",
      modos: [
        { id: "rent", nombre: "Rentabilidad", form: "ibr", desc: "Flujos, precio y TIR de un bono IBR + spread. La proyectada usa la curva FR vigente a la compra; la real usa el IBR publicado y estima con la curva lo que aún no se conoce." },
        { id: "sendas", nombre: "Sendas de TIR", form: "ibr", desc: "TIR que obtendrías vendiendo en cada fecha de cupón con la tasa de venta y con ±25 y ±50 pb, frente a mantener el bono al vencimiento." }
      ]
    }
  };
  const si = (k, val) => v => v[k] === val;
  const FORMS = {
    tf_valorar: [
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2026-10-20" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2031-10-20" },
        { id: "tasaCupon", l: "Cupón", tipo: "pct", v: "13,85", suf: "% EA" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "4" }] },
      { t: "Negociación", c: [
        { id: "fecha", l: "Fecha de negociación", tipo: "fecha", v: "2026-11-04" },
        { id: "nominal", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000" },
        { id: "metodo", l: "Descontar con", tipo: "seg", op: [["tir", "TIR de mercado"], ["curva", "Curva CC + spread"]], v: "tir", ancho: true },
        { id: "tasa", l: "TIR de mercado", tipo: "pct", v: "13,6", suf: "% EA", si: si("metodo", "tir") },
        { id: "spread", l: "Spread sobre la curva", tipo: "num", v: "129", suf: "pb", si: si("metodo", "curva") }] }
    ],
    tf_operacion: [
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2024-12-12" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2027-12-12" },
        { id: "tasaCupon", l: "Cupón", tipo: "pct", v: "10,08", suf: "% EA" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "4" }] },
      { t: "Compra", c: [
        { id: "fechaCompra", l: "Fecha de compra", tipo: "fecha", v: "2025-01-23" },
        { id: "modoCompra", l: "Compra", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tasaCompra", l: "TIR de compra", tipo: "pct", v: "8", suf: "% EA", si: si("modoCompra", "tasa") },
        { id: "precioCompra", l: "Precio sucio de compra", tipo: "num", v: "100", suf: "%", si: si("modoCompra", "precio") }] },
      { t: "Venta", c: [
        { id: "fechaVenta", l: "Fecha de venta", tipo: "fecha", v: "2026-06-15", ayuda: "Si es el vencimiento, recibes el 100 %." },
        { id: "modoVenta", l: "Venta", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tasaVenta", l: "TIR de venta", tipo: "pct", v: "9", suf: "% EA", si: si("modoVenta", "tasa") },
        { id: "precioVenta", l: "Precio sucio de venta", tipo: "num", v: "100", suf: "%", si: si("modoVenta", "precio") },
        { id: "monto", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000", ancho: true }] }
    ],
    uvr_valorar: [
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2026-10-20" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2031-10-20" },
        { id: "tasaCupon", l: "Cupón", tipo: "pct", v: "13,85", suf: "% EA" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "4" }] },
      { t: "Negociación", c: [
        { id: "fecha", l: "Fecha de negociación", tipo: "fecha", v: "2026-11-04" },
        { id: "tasa", l: "Tasa en UVR", tipo: "pct", v: "13,6", suf: "% EA" },
        { id: "nominalEn", l: "Nominal expresado en", tipo: "seg", op: [["uvr", "UVR"], ["pesos", "Pesos"]], v: "uvr", ancho: true },
        { id: "nominal", l: "Valor nominal", tipo: "dinero", v: "10.000.000", ancho: true, unidad: v => v.nominalEn === "uvr" ? "UVR" : "$" }] }
    ],
    uvr_rent: [
      { t: "Escenario", c: [
        { id: "tipo", l: "Rentabilidad", tipo: "seg", op: [["estimada", "Estimada"], ["real", "Real"]], v: "real", ancho: true }] },
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2023-03-10" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2028-03-10" },
        { id: "tasaCupon", l: "Cupón", tipo: "pct", v: "4", suf: "% EA" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "1" }] },
      { t: "Compra", c: [
        { id: "fechaCompra", l: "Fecha de compra", tipo: "fecha", v: "2024-02-20" },
        { id: "modoCompra", l: "Compra", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tasaCompra", l: "Tasa de compra (UVR)", tipo: "pct", v: "5,1", suf: "% EA", si: si("modoCompra", "tasa") },
        { id: "precioCompra", l: "Precio sucio de compra", tipo: "num", v: "100", suf: "%", si: si("modoCompra", "precio") }] },
      { t: "Venta", c: [
        { id: "fechaVenta", l: "Fecha de venta", tipo: "fecha", v: "2026-09-30" },
        { id: "modoVenta", l: "Venta", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tasaVenta", l: "Tasa de venta (UVR)", tipo: "pct", v: "4,6", suf: "% EA", si: si("modoVenta", "tasa") },
        { id: "precioVenta", l: "Precio sucio de venta", tipo: "num", v: "100", suf: "%", si: si("modoVenta", "precio") }] },
      { t: "Monto", c: [
        { id: "nominalEn", l: "Nominal expresado en", tipo: "seg", op: [["pesos", "Pesos"], ["uvr", "UVR"]], v: "pesos", ancho: true },
        { id: "nominal", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000", ancho: true, unidad: v => v.nominalEn === "uvr" ? "UVR" : "$" },
        { id: "diasTir", l: "Días para la TIR", tipo: "sel", op: [["reales", "Reales (como TIR.NO.PER)"], ["sin_feb29", "365 sin 29 de feb."]], v: "reales", ancho: true }] }
    ],
    ipc_valorar: [
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2026-10-20" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2036-10-20" },
        { id: "spread", l: "Spread facial", tipo: "pct", v: "7,98", suf: "% EA", ayuda: "IPC + spread" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "4" },
        { id: "modoIPC", l: "IPC del primer cupón", tipo: "seg", op: [["inicio", "Inicio del periodo"], ["final", "Final del periodo"]], v: "inicio", ancho: true }] },
      { t: "Negociación", c: [
        { id: "fecha", l: "Fecha de negociación", tipo: "fecha", v: "2026-11-04" },
        { id: "monto", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000" },
        { id: "tipoTasa", l: "Tasa de negociación", tipo: "seg", op: [["spread_ipc", "Spread sobre IPC"], ["total", "Tasa total EA"]], v: "spread_ipc", ancho: true },
        { id: "tasa", l: "Tasa", tipo: "pct", v: "7,5", suf: "% EA", ancho: true }] }
    ],
    ipc_rent: [
      { t: "Escenario", c: [
        { id: "tipo", l: "Rentabilidad", tipo: "seg", op: [["estimada", "Estimada"], ["real", "Real"]], v: "real", ancho: true },
        { id: "usarPron", l: "Completar con el pronóstico de IPC", tipo: "check", v: true, ancho: true, si: si("tipo", "estimada"), ayuda: "Se cambia en Datos." }] },
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2024-01-15" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2025-01-15" },
        { id: "spread", l: "Spread facial", tipo: "pct", v: "4,85", suf: "% EA" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "4" },
        { id: "modoIPC", l: "IPC del primer cupón", tipo: "seg", op: [["inicio", "Inicio del periodo"], ["final", "Final del periodo"]], v: "inicio", ancho: true }] },
      { t: "Compra", c: [
        { id: "fechaCompra", l: "Fecha de compra", tipo: "fecha", v: "2024-01-15" },
        { id: "modoCompra", l: "Compra", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tipoTasaCompra", l: "Tipo de tasa", tipo: "sel", op: [["total", "Total EA"], ["spread_ipc", "Spread sobre IPC"]], v: "total", si: si("modoCompra", "tasa") },
        { id: "tasaCompra", l: "Tasa de compra", tipo: "pct", v: "14,58008", suf: "% EA", si: si("modoCompra", "tasa") },
        { id: "precioCompra", l: "Precio sucio de compra", tipo: "num", v: "100", suf: "%", si: si("modoCompra", "precio") }] },
      { t: "Venta", c: [
        { id: "fechaVenta", l: "Fecha de venta", tipo: "fecha", v: "2025-01-14" },
        { id: "modoVenta", l: "Venta", tipo: "sel", op: MODO_PT, v: "tasa" },
        { id: "tipoTasaVenta", l: "Tipo de tasa", tipo: "sel", op: [["total", "Total EA"], ["spread_ipc", "Spread sobre IPC"]], v: "total", si: si("modoVenta", "tasa") },
        { id: "tasaVenta", l: "Tasa de venta", tipo: "pct", v: "10,3022", suf: "% EA", si: si("modoVenta", "tasa") },
        { id: "precioVenta", l: "Precio sucio de venta", tipo: "num", v: "100", suf: "%", si: si("modoVenta", "precio") }] },
      { t: "Cálculo", c: [
        { id: "monto", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000", ancho: true },
        { id: "base", l: "Base de los cupones", tipo: "sel", op: [["365", "Días reales / 365"], ["30_360", "30/360"]], v: "365", ancho: true }] }
    ],
    ibr: [
      { t: "Escenario", c: [
        { id: "tipo", l: "Rentabilidad", tipo: "seg", op: [["estimada", "Proyectada"], ["real", "Real"]], v: "real", ancho: true }] },
      { t: "Bono", c: [
        { id: "emision", l: "Emisión", tipo: "fecha", v: "2024-10-22" },
        { id: "vencimiento", l: "Vencimiento", tipo: "fecha", v: "2026-10-22" },
        { id: "spread", l: "Spread facial", tipo: "pct", v: "2", suf: "% NA", ayuda: "IBR + spread" },
        { id: "periodo", l: "Pago del cupón", tipo: "sel", op: PER, v: "12" },
        { id: "tenor", l: "Plazo del IBR", tipo: "sel", op: [["auto", "Según el pago"], ["overnight", "Overnight"], ["1m", "1 mes"], ["3m", "3 meses"], ["6m", "6 meses"], ["12m", "12 meses"]], v: "auto", ancho: true }] },
      { t: "Compra", c: [
        { id: "fechaCompra", l: "Fecha de compra", tipo: "fecha", v: "2024-10-22", ancho: true },
        { id: "modoCompra", l: "Comprar por", tipo: "seg", op: [["precio", "Precio"], ["tir", "TIR"], ["tasa", "Spread"]], v: "tasa", ancho: true },
        { id: "precioCompra", l: "Precio sucio de compra", tipo: "num", v: "100", suf: "%", si: si("modoCompra", "precio") },
        { id: "tirCompra", l: "TIR de negociación", tipo: "pct", v: "9,674", suf: "% EA", si: si("modoCompra", "tir") },
        { id: "spreadCompra", l: "Spread de negociación", tipo: "pct", v: "1,8", suf: "% NA", si: si("modoCompra", "tasa") }] },
      { t: "Venta", c: [
        { id: "vender", l: "Vender antes del vencimiento", tipo: "check", v: true, ancho: true },
        { id: "fechaVenta", l: "Fecha de venta", tipo: "fecha", v: "2025-06-11", ancho: true, si: v => v.vender },
        { id: "modoVenta", l: "Vender por", tipo: "seg", op: [["precio", "Precio"], ["tir", "TIR"], ["tasa", "Spread"]], v: "tasa", ancho: true, si: v => v.vender },
        { id: "precioVenta", l: "Precio sucio de venta", tipo: "num", v: "101,435", suf: "%", si: v => v.vender && v.modoVenta === "precio" },
        { id: "tirVenta", l: "TIR de venta", tipo: "pct", v: "9,9", suf: "% EA", si: v => v.vender && v.modoVenta === "tir" },
        { id: "spreadVenta", l: "Spread de venta", tipo: "pct", v: "1,3", suf: "% NA", si: v => v.vender && v.modoVenta === "tasa" }] },
      { t: "Cálculo", c: [
        { id: "monto", l: "Valor nominal", tipo: "dinero", v: "10.000.000.000", ancho: true },
        { id: "metodo", l: "Descuento con spread", tipo: "sel", op: [["promedio", "IBR promedio proyectado + spread"], ["vigente", "IBR vigente + spread"]], v: "promedio", ancho: true,
          si: v => v.modoCompra === "tasa" || (v.vender && v.modoVenta === "tasa") }] }
    ]
  };

  // Estado: valores de cada formulario, calculadora y modo activos
  const ST = { calc: "tf", modo: { tf: "valorar", uvr: "valorar", ipc: "valorar", ibr: "rent" }, v: {}, pestana: {} };
  Object.keys(FORMS).forEach(k => {
    ST.v[k] = {};
    FORMS[k].forEach(g => g.c.forEach(c => { ST.v[k][c.id] = c.v; }));
  });
  const modoActual = () => CALCS[ST.calc].modos.find(m => m.id === ST.modo[ST.calc]);

  // =============================================================
  // FORMULARIO
  // =============================================================
  function htmlCampo(k, c, v) {
    const id = "f-" + k + "-" + c.id, val = v[c.id];
    const cls = "campo" + (c.ancho ? " ancho" : "");
    const ayuda = c.ayuda ? '<span class="ayuda">' + esc(c.ayuda) + "</span>" : "";
    if (c.tipo === "check") {
      return '<div class="' + cls + '"><label class="chk" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + c.id + '"' + (val ? " checked" : "") + "> " + esc(c.l) + "</label>" + ayuda + "</div>";
    }
    if (c.tipo === "seg") {
      return '<div class="' + cls + '"><span class="lbl">' + esc(c.l) + '</span><div class="seg" role="group">' +
        c.op.map(o => '<button type="button" data-seg="' + c.id + '" data-val="' + o[0] + '" aria-pressed="' + (val === o[0]) + '">' + esc(o[1]) + "</button>").join("") + "</div>" + ayuda + "</div>";
    }
    if (c.tipo === "sel") {
      return '<div class="' + cls + '"><label for="' + id + '">' + esc(c.l) + '</label><select id="' + id + '" data-k="' + c.id + '">' +
        c.op.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select>" + ayuda + "</div>";
    }
    if (c.tipo === "fecha") {
      return '<div class="' + cls + '"><label for="' + id + '">' + esc(c.l) + '</label><input type="date" id="' + id + '" data-k="' + c.id + '" value="' + esc(val) + '">' + ayuda + "</div>";
    }
    const suf = c.tipo === "dinero" ? (c.unidad ? c.unidad(v) : "$") : c.suf;
    const extra = c.tipo === "dinero" ? '<span class="ayuda num" data-compacto="' + c.id + '">' + esc(textoCompacto(val, suf)) + "</span>" : ayuda;
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(c.l) + '</label><div class="sufijo"><input type="text" inputmode="decimal" autocomplete="off" id="' + id + '" data-k="' + c.id + '" data-tipo="' + c.tipo + '" value="' + esc(val) + '"><span>' + esc(suf || "") + "</span></div>" + extra + "</div>";
  }
  function textoCompacto(val, unidad) {
    const n = pDinero(val);
    if (!isFinite(n)) return "Escribe un número";
    return (unidad === "UVR" ? "" : "$ ") + compacto(n) + (unidad === "UVR" ? " UVR" : "");
  }
  function pintarForm() {
    const md = modoActual(), k = md.form, v = ST.v[k];
    $("#formulario").innerHTML = FORMS[k].map(g => {
      const campos = g.c.filter(c => !c.si || c.si(v));
      if (!campos.length) return "";
      return '<div class="grupo"><p class="grupo-t">' + esc(g.t) + "</p>" + campos.map(c => htmlCampo(k, c, v)).join("") + "</div>";
    }).join("");
  }
  function campoDef(k, id) { for (const g of FORMS[k]) for (const c of g.c) if (c.id === id) return c; return null; }

  // =============================================================
  // TABLAS, GRÁFICOS Y BLOQUES DE RESULTADO
  // =============================================================
  const TABLAS = {};
  function tabla(id, nombre, cols, filas, claseFila) {
    TABLAS[id] = { nombre, cols, filas };
    const th = cols.map(c => '<th class="' + (c.t ? "t" : "") + '">' + esc(c.n) + "</th>").join("");
    const tr = filas.map(f => '<tr class="' + (claseFila ? claseFila(f) : "") + '">' + cols.map(c => {
      const x = c.k ? f[c.k] : null;
      const txt = c.h ? c.h(f) : c.f ? esc(c.f(x, f)) : esc(x);
      return '<td class="' + (c.t ? "t" : "n") + '">' + txt + "</td>";
    }).join("") + "</tr>").join("");
    return '<div class="tabla-w"><table><thead><tr>' + th + "</tr></thead><tbody>" + tr + "</tbody></table></div>";
  }
  function barraTabla(id) {
    return '<div class="tarjeta-c" style="border-bottom:0;padding-bottom:0"><span class="sub">' + esc(TABLAS[id].nombre) + "</span>" +
      (DESCARGAS !== false ? '<button class="btn mini" data-csv="' + id + '">' + ICON.bajar + " CSV</button>" : "") + "</div>";
  }
  function csvDe(id) {
    const t = TABLAS[id];
    const celda = x => {
      if (x == null || (typeof x === "number" && !isFinite(x))) return "";
      if (typeof x === "number") return String(x).replace(".", ",");
      const s = String(x);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const filas = [t.cols.map(c => celda(c.n)).join(";")].concat(t.filas.map(f => t.cols.map(c => {
      let x = c.csv ? c.csv(f) : c.k ? f[c.k] : "";
      if (c.esFecha && typeof x === "number") x = M.aTexto(x);
      return celda(x);
    }).join(";")));
    return "﻿" + filas.join("\n");
  }

  function ticks(min, max, n) {
    const paso0 = (max - min) / Math.max(1, n), p10 = Math.pow(10, Math.floor(Math.log10(paso0 || 1)));
    const paso = [1, 2, 2.5, 5, 10].map(x => x * p10).find(x => x >= paso0) || p10 * 10;
    const out = [];
    for (let x = Math.ceil(min / paso - 1e-9) * paso; x <= max + 1e-9; x += paso) out.push(+x.toFixed(10));
    return out;
  }
  const W = 720, H = 290, ML = 70, MR = 18, MT = 16, MB = 34;
  function marco(xmin, xmax, ymin, ymax) {
    const sx = x => ML + (x - xmin) / (xmax - xmin || 1) * (W - ML - MR);
    const sy = y => H - MB - (y - ymin) / (ymax - ymin || 1) * (H - MT - MB);
    return { sx, sy };
  }
  function ejes(xs, ys, sx, sy, fx, fy) {
    let s = "";
    ys.forEach(y => { s += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + sy(y) + '" y2="' + sy(y) + '" stroke="var(--line)" stroke-width="1"/>' +
      '<text x="' + (ML - 8) + '" y="' + (sy(y) + 4) + '" text-anchor="end">' + esc(fy(y)) + "</text>"; });
    xs.forEach(x => { s += '<text x="' + sx(x) + '" y="' + (H - MB + 18) + '" text-anchor="middle">' + esc(fx(x)) + "</text>"; });
    return s;
  }
  const ruta = (pts, sx, sy) => pts.map((p, i) => (i ? "L" : "M") + sx(p[0]).toFixed(1) + " " + sy(p[1]).toFixed(1)).join(" ");

  // Curva precio–tasa: exacta, aproximación por duración y por duración + convexidad
  function graficoPrecioTasa(o) {
    const n = 41, rango = 0.04, y0 = o.tasa;
    const precio = dy => o.flujos.reduce((s, c, k) => s + c / Math.pow(1 + (o.tasas ? o.tasas[k] : y0) + dy, o.t[k]), 0);
    const P0 = o.precioActual, ex = [], dur = [], dc = [];
    for (let i = 0; i < n; i++) {
      const dy = -rango + 2 * rango * i / (n - 1), x = y0 + dy;
      ex.push([x, precio(dy)]); dur.push([x, P0 * (1 - o.dmod * dy)]); dc.push([x, P0 * (1 - o.dmod * dy + 0.5 * o.conv * dy * dy)]);
    }
    const todos = ex.concat(dur, dc).map(p => p[1]);
    let ymin = Math.min.apply(null, todos), ymax = Math.max.apply(null, todos);
    const pad = (ymax - ymin) * 0.06; ymin -= pad; ymax += pad;
    const { sx, sy } = marco(y0 - rango, y0 + rango, ymin, ymax);
    const xs = ticks(y0 - rango, y0 + rango, 8), ys = ticks(ymin, ymax, 5);
    const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Precio del bono según la tasa de descuento">' +
      ejes(xs, ys, sx, sy, x => fN(x * 100, 1) + "%", y => fN(y, 1)) +
      '<line x1="' + sx(y0) + '" x2="' + sx(y0) + '" y1="' + MT + '" y2="' + (H - MB) + '" stroke="var(--line-2)" stroke-dasharray="3 4"/>' +
      '<path d="' + ruta(dur, sx, sy) + '" fill="none" stroke="var(--dim)" stroke-width="1.5" stroke-dasharray="6 5"/>' +
      '<path d="' + ruta(dc, sx, sy) + '" fill="none" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="2 4"/>' +
      '<path d="' + ruta(ex, sx, sy) + '" fill="none" stroke="var(--accent)" stroke-width="2.5"/>' +
      '<circle cx="' + sx(y0) + '" cy="' + sy(P0) + '" r="5" fill="var(--accent-2)" stroke="var(--bg)" stroke-width="2"/>' +
      '<text x="' + (sx(y0) + 9) + '" y="' + (sy(P0) - 9) + '" style="fill:var(--fg)">' + esc(fN(P0, 3) + " @ " + fN(y0 * 100, 3) + "%") + "</text></svg>";
    return { titulo: "Precio frente a la tasa", sub: "Movimientos de ±400 pb" + (o.tasas ? " sobre toda la curva" : ""), svg,
      leyenda: [["var(--accent)", "Precio exacto"], ["var(--dim)", "Solo duración"], ["var(--warn)", "Duración + convexidad"]] };
  }
  // Barras de flujos de una operación (en pesos), en un solo gráfico. Cuando los
  // cupones son muy pequeños frente a la compra y la venta, el eje vertical se
  // comprime (escala de potencia): las barras grandes se acortan y los cupones
  // se alcanzan a ver; las marcas del eje siguen mostrando los valores reales.
  function graficoFlujos(filas, titulo) {
    const n = filas.length, vals = filas.map(f => f.valor);
    const cup = filas.slice(1, -1).map(f => Math.abs(f.valor)), maxTodo = Math.max.apply(null, vals.map(Math.abs));
    const comprimir = cup.length > 0 && Math.max.apply(null, cup) < 0.2 * maxTodo;
    const e = comprimir ? 0.38 : 1, tr = v => Math.sign(v) * Math.pow(Math.abs(v), e);
    let ymin = Math.min(0, Math.min.apply(null, vals)), ymax = Math.max(0, Math.max.apply(null, vals));
    const tmax = tr(ymax) * 1.08, tmin = ymin < 0 ? tr(ymin) * 1.08 : 0;
    const bw = Math.max(3, Math.min(34, (W - ML - MR) / n * 0.62));
    const sx = i => ML + (i + 0.5) * (W - ML - MR) / n;
    const sy = y => H - MB - (tr(y) - tmin) / (tmax - tmin || 1) * (H - MT - MB);
    let ys;
    if (!comprimir) ys = ticks(ymin * 1.08, ymax * 1.08, 5);
    else {   // marcas en valores redondos (1, 2, 5 × 10^k), separadas al menos 24 px
      const cand = [];
      for (let k = Math.floor(Math.log10(maxTodo)); k >= Math.floor(Math.log10(Math.min.apply(null, cup.filter(x => x > 0).concat([maxTodo])))) - 1; k--)
        [5, 2, 1].forEach(m => { const x = m * Math.pow(10, k); if (x <= maxTodo * 1.02) cand.push(x); });
      const pos = [];
      cand.forEach(x => { if (ymax >= x * 0.98 || -ymin >= x * 0.98) { if (!pos.length || Math.abs(sy(x) - sy(pos[pos.length - 1])) >= 24) { if (Math.abs(sy(x) - sy(0)) >= 16) pos.push(x); } } });
      ys = [0].concat(pos.filter(x => ymax >= x * 0.98), pos.filter(x => -ymin >= x * 0.98).map(x => -x));
    }
    let s = ys.map(y => '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + sy(y) + '" y2="' + sy(y) + '" stroke="var(--line)"/>' +
      '<text x="' + (ML - 8) + '" y="' + (sy(y) + 4) + '" text-anchor="end">' + esc(compactoCorto(y)) + "</text>").join("");
    const cadaN = Math.ceil(n / 7);
    filas.forEach((f, i) => {
      const y1 = sy(Math.max(0, f.valor)), y2 = sy(Math.min(0, f.valor));
      const col = f.valor < 0 ? "var(--neg)" : (i === n - 1 ? "var(--accent-2)" : "var(--accent)");
      s += '<rect x="' + (sx(i) - bw / 2) + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(1, y2 - y1) + '" fill="' + col + '" rx="2"><title>' + esc(f.concepto + " · " + fF(f.fecha) + " · " + fPesos(f.valor)) + "</title></rect>";
      if (i % cadaN === 0 || i === n - 1) s += '<text x="' + sx(i) + '" y="' + (H - MB + 18) + '" text-anchor="middle">' + esc(fFcorta(f.fecha)) + "</text>";
    });
    s += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + sy(0) + '" y2="' + sy(0) + '" stroke="var(--muted)"/>';
    return { titulo: titulo || "Flujos de la operación", sub: "En pesos" + (comprimir ? ", con el eje comprimido para que se vean los cupones" : "") + "; pasa el cursor sobre cada barra",
      svg: '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Flujos de caja">' + s + "</svg>",
      leyenda: [["var(--neg)", "Compra"], ["var(--accent)", "Cupones"], ["var(--accent-2)", "Venta o vencimiento"]] };
  }
  function compactoCorto(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return fN(v / 1e9, 1) + " mM";
    if (a >= 1e6) return fN(v / 1e6, 1) + " M";
    if (a >= 1e3) return fN(v / 1e3, 0) + " mil";
    return fN(v, 0);
  }
  const fFcorta = n => { const p = M.ymd(n); return MESES[p[1] - 1] + " " + String(p[0]).slice(2); };

  // Curva de los TES (tasas cero cupón del Banco de la República): pesos y UVR,
  // hoy y hace un mes. marca = {x: plazo en años, y: tasa decimal, texto} ubica el bono que se está valorando.
  function graficoCurvaTES(marca) {
    const T = MERC && MERC.tes;
    if (!T || !Array.isArray(T.pesos) || !Array.isArray(T.uvr)) return null;
    const X = T.plazos || [1, 5, 10];
    const lineas = [{ v: T.pesos, c: "var(--accent)", w: 2.6 }, { v: T.uvr, c: "var(--warn)", w: 2.6 }];
    if (T.mes) lineas.push({ v: T.mes.pesos, c: "var(--accent)", w: 1.2, d: "5 4" }, { v: T.mes.uvr, c: "var(--warn)", w: 1.2, d: "5 4" });
    const m = marca && isFinite(marca.x) && isFinite(marca.y) ? { x: Math.max(0.15, marca.x), y: marca.y * 100, texto: marca.texto } : null;
    const vals = [].concat(...lineas.map(l => l.v)).concat(m ? [m.y] : []).filter(x => x != null && isFinite(x));
    let ymin = Math.min.apply(null, vals), ymax = Math.max.apply(null, vals);
    const pad = (ymax - ymin) * 0.14 || 1; ymin -= pad; ymax += pad;
    const xmax = Math.max(X[X.length - 1], m ? m.x : 0) + 0.7;
    const { sx, sy } = marco(0, xmax, ymin, ymax);
    let s = ejes(X, ticks(ymin, ymax, 5), sx, sy, x => x + (x === 1 ? " año" : " años"), y => fN(y, 1) + "%");
    lineas.forEach(l => {
      const pts = X.map((x, i) => [x, l.v[i]]).filter(p => p[1] != null && isFinite(p[1]));
      s += '<path d="' + ruta(pts, sx, sy) + '" fill="none" stroke="' + l.c + '" stroke-width="' + l.w + '"' + (l.d ? ' stroke-dasharray="' + l.d + '"' : "") + "/>";
      if (!l.d) pts.forEach(p => {
        const abajo = m && Math.abs(sx(p[0]) - sx(m.x)) < 150 && m.y >= p[1] && sy(p[1]) - sy(m.y) < 40;
        s += '<circle cx="' + sx(p[0]) + '" cy="' + sy(p[1]) + '" r="4" fill="' + l.c + '" stroke="var(--panel)" stroke-width="2"/>' +
          '<text x="' + sx(p[0]) + '" y="' + (sy(p[1]) + (abajo ? 20 : -10)) + '" text-anchor="middle" style="fill:var(--fg)">' + esc(fN(p[1], 2) + "%") + "</text>";
      });
    });
    if (m) {
      const der = sx(m.x) > W - 190;
      s += '<rect x="' + (sx(m.x) - 5) + '" y="' + (sy(m.y) - 5) + '" width="10" height="10" transform="rotate(45 ' + sx(m.x) + " " + sy(m.y) + ')" fill="var(--fg)" stroke="var(--panel)" stroke-width="2"/>' +
        '<text x="' + (sx(m.x) + (der ? -12 : 12)) + '" y="' + (sy(m.y) + 4) + '" text-anchor="' + (der ? "end" : "start") + '" style="fill:var(--fg)">' + esc(m.texto) + "</text>";
    }
    return {
      titulo: "Curva de los TES", svg: '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Curva de tasas cero cupón de los TES">' + s + "</svg>",
      sub: "Tasas cero cupón a 1, 5 y 10 años del " + fF(M.aDia(T.fecha)) + ", Banco de la República." + (T.mes ? " Punteada: " + fF(M.aDia(T.mes.fecha)) + "." : ""),
      leyenda: [["var(--accent)", "TES en pesos"], ["var(--warn)", "TES en UVR"]].concat(m ? [["var(--fg)", "El bono que estás valorando"]] : [])
    };
  }
  // Curvas FR cargadas: el IBR que el mercado espera para cada fecha futura
  function graficoCurvaFR() {
    const cs = (S.curvas || []).filter(c => c.fechas.length > 1);
    if (!cs.length) return null;
    const colores = ["var(--dim)", "var(--accent-2)", "var(--accent)", "var(--warn)", "var(--pos)"];
    let x0 = Infinity, x1 = -Infinity, ymin = Infinity, ymax = -Infinity;
    cs.forEach(c => {
      x0 = Math.min(x0, c.fechas[0]); x1 = Math.max(x1, c.fechas[c.fechas.length - 1]);
      c.tasas.forEach(t => { if (t < ymin) ymin = t; if (t > ymax) ymax = t; });
    });
    const pad = (ymax - ymin) * 0.1 || 0.005; ymin -= pad; ymax += pad;
    const { sx, sy } = marco(x0, x1, ymin, ymax);
    const a0 = M.ymd(x0)[0], a1 = M.ymd(x1)[0], paso = Math.max(1, Math.ceil((a1 - a0) / 7)), xs = [];
    for (let a = a0 + 1; a <= a1; a += paso) xs.push(M.aDia(a + "-01-01"));
    let s = ejes(xs, ticks(ymin, ymax, 5), sx, sy, x => String(M.ymd(x)[0]), y => fN(y * 100, 1) + "%");
    cs.forEach((c, i) => {
      const k = Math.max(1, Math.ceil(c.fechas.length / 220)), pts = [];
      c.fechas.forEach((f, j) => { if (j % k === 0 || j === c.fechas.length - 1) pts.push([f, c.tasas[j]]); });
      s += '<path d="' + ruta(pts, sx, sy) + '" fill="none" stroke="' + colores[i % 5] + '" stroke-width="' + (i === cs.length - 1 ? 2.4 : 1.5) + '"/>';
    });
    return {
      titulo: "Curvas FR del IBR", svg: '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Curvas FR del IBR">' + s + "</svg>",
      sub: "IBR nominal anual que el mercado espera para cada fecha futura, según cada curva cargada.",
      leyenda: cs.map((c, i) => [colores[i % 5], c.nombre])
    };
  }
  const bloqueGrafico = g => '<div class="bloque"><div class="bloque-c"><div><h3>' + esc(g.titulo) + '</h3><div class="sub">' + esc(g.sub || "") + '</div></div><div class="leyenda">' +
    (g.leyenda || []).map(l => '<span><i style="background:' + l[0] + '"></i>' + esc(l[1]) + "</span>").join("") + '</div></div><div class="graf">' + g.svg + "</div></div>";

  // Bloque de riesgo (duración, convexidad, DV01)
  function bloqueRiesgo(rg, op) {
    op = op || {};
    const u = op.uvr;
    const dvPos = u ? fUVR(rg.dv01Pesos) : fPesos(rg.dv01Pesos, 0);
    let html = '<div class="tarjeta-b"><div class="mini-g">' +
      mini("Duración de Macaulay", fN(rg.macaulay, 4) + " años") +
      mini("Duración modificada", fN(rg.modificada, 4), "Truncada: " + fN(rg.modificadaTrunc, 3)) +
      mini("Convexidad", fN(rg.convexidad, 4)) +
      mini("DV01 de la posición", dvPos, u ? "En pesos: " + fPesos(op.dv01PesosRegla, 0) : "Por 100: " + fN(rg.dv01, 6)) +
      "</div>" +
      '<p class="nota">DV01 = duración modificada truncada a 3 decimales ÷ 10.000 × valor de giro: lo que cambia el valor de la posición por cada punto básico. ' +
      "Las aproximaciones parten del precio sucio truncado (" + fN(rg.precioActual, 3) + "). Los movimientos de −400 a +400 pb están en la pestaña Escenarios.</p></div>";
    const pb = rg.cambioPb;
    const filas100 = [
      { esc: "Tasa +" + pb + " pb", ex: rg.sube.exacto, d: rg.sube.duracion, dc: rg.sube.durConv },
      { esc: "Tasa −" + pb + " pb", ex: rg.baja.exacto, d: rg.baja.duracion, dc: rg.baja.durConv }
    ];
    const idA = "riesgo100-" + ST.calc;
    const hA = tabla(idA, "Precio con ±" + pb + " pb", [
      { n: "Escenario", k: "esc", t: true }, { n: "Precio exacto", k: "ex", f: x => fN(x, 4) },
      { n: "Solo duración", k: "d", f: x => fN(x, 4) }, { n: "Duración + convexidad", k: "dc", f: x => fN(x, 4) }], filas100);
    html += barraTabla(idA) + hA;
    return html;
  }
  const mini = (l, v, s) => '<div class="mini"><div class="kpi-l">' + esc(l) + '</div><div class="kpi-v">' + esc(v) + "</div>" + (s ? '<div class="kpi-s">' + esc(s) + "</div>" : "") + "</div>";
  const kpi = (l, v, s, extra) => Object.assign({ l, v, s }, extra || {});
  const conTabla = (id, html) => barraTabla(id) + html;

  // =============================================================
  // CÁLCULOS POR CALCULADORA (devuelven el modelo de la vista)
  // =============================================================
  // TIR de comprar hoy al precio de giro (sucio truncado) y mantener hasta el vencimiento
  const intento = f => { try { const x = f(); return isFinite(x) ? x : null; } catch (e) { return null; } };
  const CALC = {};
  const req = (v, id, k) => { const c = campoDef(k, id); return falta(c.tipo === "pct" ? pPct(v[id]) : c.tipo === "dinero" ? pDinero(v[id]) : c.tipo === "num" ? pNum(v[id]) : v[id], c.l); };

  const intentoObj = f => { try { return f(); } catch (e) { return null; } };
  const kpiProx = p => kpi("Próximo cupón", fF(p.fecha), p.texto);
  const txtPct = y => (y * 100).toFixed(6).replace(".", ",");
  const tirImplicita = (flujos, t, precio) => M.raiz(x => flujos.reduce((s, c, i) => s + c / Math.pow(1 + x, t[i]), 0) - precio, -0.5, 2, 1e-13);
  const corta = n => compacto(n).replace(" mil millones", " mil M").replace(" millones", " M");

  CALC.tf_valorar = v => {
    const k = "tf_valorar", per = +v.periodo, nominal = req(v, "nominal", k), curva = v.metodo === "curva";
    const tasa = curva ? NaN : req(v, "tasa", k), cupon = req(v, "tasaCupon", k), spr = curva ? req(v, "spread", k) : 0;
    const bono = { emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: cupon, periodo: per };
    const r = M.precioTasaFija(Object.assign({ tasaMercado: curva ? 0.1 : tasa, fechaNegociacion: req(v, "fecha", k), curvaCC: curva ? S.cc : null, spreadPb: spr }, bono));
    const y = curva ? r.tirEquivalente : tasa;
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa: y, periodo: per, precioActual: r.precioSucioTruncado, factor: nominal / 100, tasasFlujo: r.tasas });
    const giro = r.precioSucioTruncado / 100 * nominal, fc = M.aDia(v.fecha), ve = M.aDia(v.vencimiento);
    const cup1 = r.tabla.find(x => x.fecha === r.fechas[0]).cupon;
    const prox = { fecha: r.fechas[0], valor: cup1 / 100 * nominal, texto: fPesos(cup1 / 100 * nominal, 0) + " · " + fN(cup1, 4) + " por cada 100" };
    const kp = [
      kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
      kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion),
      kpi("Interés corrido", fN(r.interesCorrido, 6), "Por cada 100 de nominal"),
      kpi("Valor de giro", fPesos(giro), compacto(giro) + " de pesos")
    ];
    if (curva) kp.push(kpi("TIR equivalente", fPct(y, 4), "Tasa única que da el mismo precio"));
    const compra = Object.assign({ fechaCompra: fc, modoCompra: "precio", precioCompra: r.precioSucioTruncado, montoPesos: nominal }, bono);
    const tirV = intento(() => M.operacionTasaFija(Object.assign({ fechaVenta: ve, modoVenta: "precio", precioVenta: 100 }, compra)).tir);
    if (tirV != null) kp.push(kpi("TIR al vencimiento", fPct(tirV, 4), "Comprando al precio de giro y manteniendo"));
    kp.push(kpiProx(prox));
    const idF = "flujos-tf";
    const filas = r.fechas.map((f, i) => ({ fecha: f, dias: r.dias[i], t: r.t[i], tasa: r.tasas ? r.tasas[i] : y, flujo: r.flujos[i], vp: r.vp[i] }));
    const tf = tabla(idF, "Flujos por cada 100 de nominal", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) }, { n: "t (años)", k: "t", f: x => fN(x, 4) },
      { n: curva ? "Tasa curva + spread" : "Tasa", k: "tasa", f: x => fPct(x, 4) }, { n: "Flujo", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }], filas);
    const valorarEn = (d, s) => M.precioTasaFija(Object.assign({ tasaMercado: curva ? 0.1 : y + s / 1e4, fechaNegociacion: d, curvaCC: curva ? S.cc : null, spreadPb: spr + s }, bono));
    return {
      kpis: kp,
      avisos: curva ? [{ tipo: "info", html: "Cada flujo se descuenta con la tasa cero cupón de su plazo (interpolación lineal) más <b>" + fN(spr, 0) + " pb</b>. Curva: " + esc(S.origen.cc) + "." }] : [],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa: y, tasas: r.tasas, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(idF, tf) }, { id: "riesgo", n: "Riesgo", html: bloqueRiesgo(rg) }],
      marcaTES: { x: r.t[r.t.length - 1], y, texto: "Este bono: " + fPct(y, 2) },
      posicion: { form: k, v: Object.assign({}, v) },
      resumen: { tipo: "Tasa Fija", bono: "Cupón " + fPct(cupon, 2) + " · vence " + fF(ve), compra: fc, nominal: "$ " + corta(nominal), precio: r.precioSucioTruncado, giro,
        tir: tirV != null ? tirV : y, dmod: rg.modificada, conv: rg.convexidad, dv01: rg.dv01Pesos, prox },
      escenarios: {
        calc: "tf", nombre: "Tasa Fija", fc, ve, tasaBase: y, etiquetaTasa: curva ? "TIR equivalente" : "Tasa de mercado",
        punto: (d, s) => {
          let tasaV, o;
          if (curva) { const pv = valorarEn(d, s); tasaV = pv.tirEquivalente; o = M.operacionTasaFija(Object.assign({ fechaVenta: d, modoVenta: "precio", precioVenta: pv.precioSucioTruncado }, compra)); }
          else { tasaV = y + s / 1e4; o = M.operacionTasaFija(Object.assign({ fechaVenta: d, modoVenta: "tasa", tasaVenta: tasaV }, compra)); }
          return { tasa: tasaV, precio: o.venta.precio, limpio: o.venta.limpio, ic: o.venta.ic, valorVenta: o.valorVenta, cupones: o.cuponesPesos, nCup: o.cupones.length, giro: o.giroCompra, pyg: o.pygPesos, tir: o.tir };
        },
        riesgoEn: (d, s) => {
          const pv = valorarEn(d, s), yy = curva ? pv.tirEquivalente : y + s / 1e4;
          const g = M.riesgo({ flujos: pv.flujos, t: pv.t, tasa: yy, periodo: per, precioActual: pv.precioSucioTruncado, factor: nominal / 100, tasasFlujo: pv.tasas });
          return { dmod: g.modificada, dv01: fPesos(g.dv01Pesos, 0) };
        }
      }
    };
  };

  function tablaOperacion(id, filas, extras) {
    return tabla(id, "Flujos de la operación en pesos", [{ n: "Concepto", k: "concepto", t: true }, { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }]
      .concat(extras || [], [{ n: "Valor", k: "valor", f: x => fPesos(x, 0) }]), filas);
  }
  function kpisOperacion(tir, r, etiquetaTir, sub) {
    return [
      kpi(etiquetaTir || "TIR de la operación", fPct(tir, 4), sub || "Efectiva anual", { prin: true }),
      kpi("Valor de giro (compra)", fPesos(r.giroCompra), compacto(r.giroCompra) + " de pesos"),
      kpi(r.alVencimiento ? "Pago al vencimiento" : "Valor de la venta", fPesos(r.valorVenta), compacto(r.valorVenta) + " de pesos"),
      kpi("Cupones recibidos", fPesos(r.cuponesPesos), compacto(r.cuponesPesos)),
      kpi("Pérdidas y ganancias", fPesos(r.pygPesos), compacto(r.pygPesos), { cls: r.pygPesos >= 0 ? "pos" : "neg" })
    ];
  }

  CALC.tf_operacion = v => {
    const k = "tf_operacion", monto = req(v, "monto", k);
    const bono = { emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: +v.periodo };
    const r = M.operacionTasaFija(Object.assign({ fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN,
      precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN, fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta,
      tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN, montoPesos: monto }, bono));
    const f = monto / 100, n = r.flujos.length;
    r.alVencimiento = !!r.venta.vencimiento;
    const filas = r.flujos.map((x, i) => ({ concepto: i === 0 ? "Compra" : i === n - 1 ? (r.alVencimiento ? "Vencimiento" : "Venta") : "Cupón " + i, fecha: x.fecha, dias: x.dias, valor: x.monto * f }));
    const id = "op-tf";
    const avisos = [];
    if (r.mensajeTir) avisos.push({ tipo: "err", html: esc(r.mensajeTir) });
    const kp = kpisOperacion(r.tir, r);
    let posicion = null;
    const b = intentoObj(() => M.precioTasaFija(Object.assign({ tasaMercado: 0.1, fechaNegociacion: v.fechaCompra }, bono)));
    if (b) {
      const cup1 = b.tabla.find(x => x.fecha === b.fechas[0]).cupon;
      kp.push(kpiProx({ fecha: b.fechas[0], texto: fPesos(cup1 / 100 * monto, 0) + " · el primero después de la compra" }));
      const yImp = v.modoCompra === "tasa" ? null : intento(() => tirImplicita(b.flujos, b.t, r.compra.precio));
      if (v.modoCompra === "tasa" || yImp != null) posicion = { form: "tf_valorar", v: { emision: v.emision, vencimiento: v.vencimiento, tasaCupon: v.tasaCupon, periodo: v.periodo,
        fecha: v.fechaCompra, nominal: v.monto, metodo: "tir", tasa: v.modoCompra === "tasa" ? v.tasaCompra : txtPct(yImp), spread: "0" } };
    }
    return {
      kpis: kp, avisos, posicion,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.compra.precio, 3), "Limpio: " + fN(r.compra.limpio, 3)) +
        mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.venta.precio, 3), "Limpio: " + fN(r.venta.limpio, 3)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "Días", k: "dias", f: x => fN(x, 0) }])) }]
    };
  };

  CALC.uvr_valorar = v => {
    const k = "uvr_valorar", per = +v.periodo, tasa = req(v, "tasa", k), nominal = req(v, "nominal", k), cupon = req(v, "tasaCupon", k);
    const bono = { emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: cupon, periodo: per };
    const r = M.precioUVR(Object.assign({ tasaMercado: tasa, fechaNegociacion: req(v, "fecha", k), serieUVR: S.uvr, nominal, nominalEn: v.nominalEn }, bono));
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa, periodo: per, precioActual: r.precioSucioTruncado, factor: r.nominalUVR / 100 });
    const dvPesos = rg.modificadaTrunc / 1e4 * r.valorGiro, fc = M.aDia(v.fecha), ve = M.aDia(v.vencimiento);
    const compra = Object.assign({ tipo: "estimada", fechaCompra: fc, modoCompra: "precio", precioCompra: r.precioSucioTruncado, serieUVR: S.uvr, serieIPC: S.ipc, nominal, nominalEn: v.nominalEn, diasTir: "reales" }, bono);
    let tirVto = null;
    try { tirVto = M.rentabilidadUVR(Object.assign({ fechaVenta: ve, modoVenta: "precio", precioVenta: 100 }, compra));
      if (!isFinite(tirVto.tirPesos) || !isFinite(tirVto.tirUVR)) tirVto = null; } catch (e) { tirVto = null; }
    const cup1 = r.tabla.find(x => x.fecha === r.fechas[0]).cupon, cupUVR = cup1 / 100 * r.nominalUVR;
    const prox = { fecha: r.fechas[0], valor: cupUVR * r.uvr, texto: fUVR(cupUVR) + " · unos " + fPesos(cupUVR * r.uvr, 0) + " con la UVR de la negociación" };
    const idF = "flujos-uvr";
    const filas = r.fechas.map((f, i) => ({ fecha: f, dias: r.dias[i], flujo: r.flujos[i], vp: r.vp[i], flujoUVR: r.flujos[i] / 100 * r.nominalUVR }));
    const tf = tabla(idF, "Flujos (por 100 y de la posición en UVR)", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) },
      { n: "Flujo por 100", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }, { n: "Flujo posición", k: "flujoUVR", f: x => fUVR(x) }], filas);
    return {
      kpis: [
        kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
        kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion + " · IC " + fN(r.interesCorrido, 6)),
        kpi("UVR del día", fN(r.uvr, 4), fF(fc)),
        kpi("Valor de giro en pesos", fPesos(r.valorGiro), compacto(r.valorGiro) + " de pesos"),
        kpi("Valor de giro en UVR", fUVR(r.valorGiroUVR), "Nominal: " + fUVR(r.nominalUVR))
      ].concat(tirVto ? [kpi("TIR al vencimiento en UVR", fPct(tirVto.tirUVR, 4), "Comprando al precio de giro y manteniendo"),
        kpi("TIR al vencimiento en pesos", fPct(tirVto.tirPesos, 4), "Estimada con IPC de " + fPct(tirVto.inflacionSupuesta, 2))] : [], [kpiProx(prox)]),
      avisos: tirVto ? [{ tipo: "info", html: "La TIR en pesos al vencimiento es una estimación: proyecta la UVR con el IPC vigente a la negociación (" + fPct(tirVto.inflacionSupuesta, 2) + " anual)." }] : [],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(idF, tf) },
             { id: "riesgo", n: "Riesgo", html: bloqueRiesgo(rg, { uvr: true, uvrPesos: r.uvr, dv01PesosRegla: dvPesos, etiquetaTasa: "Tasa UVR" }) }],
      marcaTES: { x: r.t[r.t.length - 1], y: tasa, texto: "Este bono UVR: " + fPct(tasa, 2) },
      posicion: { form: k, v: Object.assign({}, v) },
      resumen: { tipo: "UVR", bono: "Cupón " + fPct(cupon, 2) + " · vence " + fF(ve), compra: fc, nominal: corta(r.nominalUVR) + " UVR", precio: r.precioSucioTruncado, giro: r.valorGiro,
        tir: tirVto ? tirVto.tirPesos : null, dmod: rg.modificada, conv: rg.convexidad, dv01: dvPesos, prox },
      escenarios: {
        calc: "uvr", nombre: "UVR", fc, ve, tasaBase: tasa, etiquetaTasa: "Tasa de mercado en UVR",
        punto: (d, s) => {
          const o = M.rentabilidadUVR(Object.assign({ fechaVenta: d, modoVenta: "tasa", tasaVenta: tasa + s / 1e4 }, compra));
          return { tasa: tasa + s / 1e4, precio: o.precioVenta, limpio: o.limpioVenta, ic: o.precioVenta - o.limpioVenta, valorVenta: o.valorVenta, cupones: o.cuponesPesos, nCup: o.tabla.length - 2,
            giro: o.giroCompra, pyg: o.pygPesos, tir: o.tirPesos, uvr: o.uvrVenta, extra: [["UVR estimada ese día", fN(o.uvrVenta, 4)], ["TIR de la operación en UVR", fPct(o.tirUVR, 4)]] };
        },
        riesgoEn: (d, s, p) => {
          const pv = M.precioTasaFija(Object.assign({ tasaMercado: tasa + s / 1e4, fechaNegociacion: d }, bono));
          const g = M.riesgo({ flujos: pv.flujos, t: pv.t, tasa: tasa + s / 1e4, periodo: per, precioActual: pv.precioSucioTruncado, factor: r.nominalUVR / 100 });
          return { dmod: g.modificada, dv01: fUVR(g.dv01Pesos) + " · " + fPesos(g.dv01Pesos * p.uvr, 0) };
        }
      }
    };
  };

  CALC.uvr_rent = v => {
    const k = "uvr_rent";
    const bono = { emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: +v.periodo };
    const r = M.rentabilidadUVR(Object.assign({ tipo: v.tipo, fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN,
      precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN, fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta,
      tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN,
      serieUVR: S.uvr, serieIPC: S.ipc, nominal: req(v, "nominal", k), nominalEn: v.nominalEn, diasTir: v.diasTir }, bono));
    const filas = r.tabla.map(x => ({ concepto: x.concepto, fecha: x.fecha, uvr: x.uvr, valorUVR: x.valorUVR, valor: x.valorPesos }));
    const id = "op-uvr";
    const kp = kpisOperacion(r.tirPesos, r, "TIR en pesos", v.tipo === "real" ? "Con la UVR publicada" : "Con la UVR proyectada");
    kp.splice(1, 0, kpi("TIR en UVR", fPct(r.tirUVR, 4), "Sin el efecto de la inflación"));
    const avisos = [];
    if (v.tipo === "estimada") avisos.push({ tipo: "info", html: "La UVR después de la compra se proyecta con el IPC vigente a la compra: <b>" + fPct(r.inflacionSupuesta, 2) + "</b> anual." });
    const ultUVR = S.uvr.fechas[S.uvr.fechas.length - 1];
    if (v.tipo === "real" && M.aDia(v.fechaVenta) > ultUVR) avisos.push({ tipo: "warn", html: "La serie de UVR llega al " + fF(ultUVR) + "; actualízala en Datos." });
    let posicion = null;
    const b = intentoObj(() => M.precioTasaFija(Object.assign({ tasaMercado: 0.1, fechaNegociacion: v.fechaCompra }, bono)));
    if (b) {
      const cupUVR = b.tabla.find(x => x.fecha === b.fechas[0]).cupon / 100 * r.nominalUVR, enTabla = r.tabla.find((x, i) => i > 0 && i < r.tabla.length - 1 && x.fecha === b.fechas[0]);
      kp.push(kpiProx({ fecha: b.fechas[0], texto: fUVR(cupUVR) + " · " + (enTabla ? fPesos(enTabla.valorPesos, 0) : "unos " + fPesos(cupUVR * r.uvrCompra, 0) + " con la UVR de la compra") }));
      const yImp = v.modoCompra === "tasa" ? null : intento(() => tirImplicita(b.flujos, b.t, r.precioCompra));
      if (v.modoCompra === "tasa" || yImp != null) posicion = { form: "uvr_valorar", v: { emision: v.emision, vencimiento: v.vencimiento, tasaCupon: v.tasaCupon, periodo: v.periodo,
        fecha: v.fechaCompra, tasa: v.modoCompra === "tasa" ? v.tasaCompra : txtPct(yImp), nominalEn: v.nominalEn, nominal: v.nominal } };
    }
    return {
      kpis: kp, avisos, posicion,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.precioCompra, 3), "Limpio: " + fN(r.limpioCompra, 3)) + mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.precioVenta, 3), "Limpio: " + fN(r.limpioVenta, 3)) +
        mini("UVR a la compra", fN(r.uvrCompra, 4)) + mini(r.alVencimiento ? "UVR al vencimiento" : "UVR a la venta", fN(r.uvrVenta, 4)) + mini("Nominal en UVR", fUVR(r.nominalUVR)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "UVR", k: "uvr", f: x => fN(x, 4) }, { n: "Valor en UVR", k: "valorUVR", f: x => fUVR(x) }])) }]
    };
  };

  CALC.ipc_valorar = v => {
    const k = "ipc_valorar", per = +v.periodo, monto = req(v, "monto", k), tasaNeg = req(v, "tasa", k), spread = req(v, "spread", k);
    const bono = { emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), periodo: per, spread, modoIPC: v.modoIPC };
    const r = M.precioIPC(Object.assign({ tasaMercado: tasaNeg, tipoTasa: v.tipoTasa, fechaNegociacion: req(v, "fecha", k), serie: S.ipc, montoPesos: monto }, bono));
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa: r.tasaDescuento, periodo: per, precioActual: r.precioSucioTruncado, factor: monto / 100 });
    const fc = M.aDia(v.fecha), ve = M.aDia(v.vencimiento);
    const compra = Object.assign({ tipo: "estimada", fechaCompra: fc, modoCompra: "precio", precioCompra: r.precioSucioTruncado, serie: S.ipc, montoPesos: monto, diasTir: "reales", base: "365", pronostico: null }, bono);
    const tirVI = intento(() => M.rentabilidadIPC(Object.assign({ fechaVenta: ve, modoVenta: "precio", precioVenta: 100 }, compra)).tir);
    const filas = r.filas.map((x, i) => ({ fecha: x.fecha, dias: r.dias[i], ipc: x.ipc, fechaIpc: x.fechaIpc, tasa: x.tasa, flujo: r.flujos[i], vp: r.vp[i] }));
    const prox = { fecha: r.filas[0].fecha, valor: r.filas[0].cupon / 100 * monto, texto: fPesos(r.filas[0].cupon / 100 * monto, 0) + " · con IPC de " + fPct(r.filas[0].ipc, 2) };
    const id = "flujos-ipc";
    const tf = tabla(id, "Flujos por cada 100 de nominal", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) },
      { n: "IPC usado", k: "ipc", f: x => fPct(x, 2) }, { n: "Dato del", k: "fechaIpc", f: fF, esFecha: true },
      { n: "Tasa cupón", k: "tasa", f: x => fPct(x, 4) }, { n: "Flujo", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }], filas);
    const porSpread = v.tipoTasa === "spread_ipc";
    const serieCompra = { fechas: S.ipc.fechas.filter(d => d <= fc), inflacion: S.ipc.inflacion.filter((x, i) => S.ipc.fechas[i] <= fc) };
    return {
      kpis: [
        kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
        kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion),
        kpi("Interés corrido", fN(r.interesCorrido, 6), "Por cada 100 de nominal"),
        kpi("Valor de giro", fPesos(r.valorGiro), compacto(r.valorGiro) + " de pesos"),
        kpi("Tasa de descuento", fPct(r.tasaDescuento, 4), "IPC vigente " + fPct(r.ipcNegociacion.valor, 2) + " (" + fFcorta(r.ipcNegociacion.fecha) + ")")
      ].concat(tirVI != null ? [kpi("TIR al vencimiento", fPct(tirVI, 4), "Estimada: el IPC vigente no cambia")] : [], [kpiProx(prox)]),
      avisos: [{ tipo: "info", html: "Los cupones futuros usan el IPC vigente a la negociación (" + fPct(r.ipcNegociacion.valor, 2) + "). Último IPC en la base: " + fF(r.ultimoIPC) + "." }],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa: r.tasaDescuento, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tf) }, { id: "riesgo", n: "Riesgo", html: bloqueRiesgo(rg, { etiquetaTasa: "Tasa EA" }) }],
      marcaTES: { x: r.t[r.t.length - 1], y: r.tasaDescuento, texto: "Este bono IPC: " + fPct(r.tasaDescuento, 2) },
      posicion: { form: k, v: Object.assign({}, v) },
      resumen: { tipo: "IPC", bono: "IPC + " + fPct(spread, 2) + " · vence " + fF(ve), compra: fc, nominal: "$ " + corta(monto), precio: r.precioSucioTruncado, giro: r.valorGiro,
        tir: tirVI != null ? tirVI : r.tasaDescuento, dmod: rg.modificada, conv: rg.convexidad, dv01: rg.dv01Pesos, prox },
      escenarios: {
        calc: "ipc", nombre: "IPC", fc, ve, tasaBase: r.tasaDescuento, etiquetaTasa: "Tasa de mercado",
        punto: (d, s) => {
          const o = M.rentabilidadIPC(Object.assign({ fechaVenta: d, modoVenta: "tasa", tasaVenta: tasaNeg + s / 1e4, tipoTasaVenta: v.tipoTasa }, compra));
          const total = porSpread ? (1 + o.ipcVenta.valor) * (1 + tasaNeg + s / 1e4) - 1 : tasaNeg + s / 1e4;
          return { tasa: total, precio: o.precioVenta, limpio: o.limpioVenta, ic: o.precioVenta - o.limpioVenta, valorVenta: o.valorVenta, cupones: o.cuponesPesos, nCup: o.cupones.length,
            giro: o.giroCompra, pyg: o.pygPesos, tir: o.tir, extra: porSpread ? [["Spread sobre el IPC ese día", fPct(tasaNeg + s / 1e4, 4)], ["IPC supuesto", fPct(o.ipcVenta.valor, 2)]] : [] };
        },
        riesgoEn: (d, s) => {
          const pv = M.precioIPC(Object.assign({ tasaMercado: tasaNeg + s / 1e4, tipoTasa: v.tipoTasa, fechaNegociacion: d, serie: serieCompra, montoPesos: monto }, bono));
          const g = M.riesgo({ flujos: pv.flujos, t: pv.t, tasa: pv.tasaDescuento, periodo: per, precioActual: pv.precioSucioTruncado, factor: monto / 100 });
          return { dmod: g.modificada, dv01: fPesos(g.dv01Pesos, 0) };
        }
      }
    };
  };

  // Riesgo del bono IPC a la fecha de compra: flujos con el IPC vigente ese día,
  // descontados con la tasa de compra (o con la TIR implícita si se compró por precio).
  function riesgoCompraIPC(v, r) {
    try {
      const per = +v.periodo, monto = pDinero(v.monto), porTasa = v.modoCompra === "tasa";
      const b = M.precioIPC({ emision: v.emision, vencimiento: v.vencimiento, periodo: per, spread: pPct(v.spread), modoIPC: v.modoIPC,
        tasaMercado: porTasa ? pPct(v.tasaCompra) : 0.1, tipoTasa: porTasa ? v.tipoTasaCompra : "total", fechaNegociacion: v.fechaCompra, serie: S.ipc, montoPesos: monto });
      const y = porTasa ? b.tasaDescuento : tirImplicita(b.flujos, b.t, r.precioCompra);
      if (!isFinite(y)) return { b, y: null, tabs: [] };
      const rg = M.riesgo({ flujos: b.flujos, t: b.t, tasa: y, periodo: per, precioActual: M.truncar(r.precioCompra, 3), factor: monto / 100 });
      return { b, y, tabs: [{ id: "riesgo", n: "Riesgo", html: bloqueRiesgo(rg, { etiquetaTasa: "Tasa EA" }) +
        '<div class="tarjeta-b"><p class="nota" style="margin:0">Riesgo a la fecha de compra: los cupones futuros usan el IPC vigente ese día y se descuentan con ' +
        (porTasa ? "la tasa de compra (" : "la TIR implícita en el precio de compra (") + esc(fPct(y, 4)) + ").</p></div>" }] };
    } catch (e) { return { b: null, y: null, tabs: [] }; }
  }

  CALC.ipc_rent = v => {
    const k = "ipc_rent", monto = req(v, "monto", k);
    const r = M.rentabilidadIPC({ tipo: v.tipo, emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), periodo: +v.periodo, spread: req(v, "spread", k), modoIPC: v.modoIPC,
      fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN, tipoTasaCompra: v.tipoTasaCompra,
      precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN,
      fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta, tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, tipoTasaVenta: v.tipoTasaVenta,
      precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN,
      serie: S.ipc, montoPesos: monto, diasTir: "reales", base: v.base,
      pronostico: v.tipo === "estimada" && v.usarPron ? S.pron : null });
    const filas = r.tabla.map((x, i) => ({ concepto: x.concepto, fecha: x.fecha, fechaRef: x.fechaRef, ipc: x.ipc, tasa: i > 0 && i < r.tabla.length - 1 ? r.cupones[i - 1].tasa : NaN, valor: x.valor }));
    const id = "op-ipc";
    const avisos = [];
    if (r.mensajeTir) avisos.push({ tipo: "err", html: esc(r.mensajeTir) });
    if (v.tipo === "estimada") avisos.push({ tipo: "info", html: r.conPronostico ? "IPC conocido hasta la compra y, después del último dato, el pronóstico cargado (" + esc(S.origen.pron) + ")." : "Solo se usa el IPC conocido a la fecha de compra: los cupones siguientes repiten el IPC vigente." });
    const rc = riesgoCompraIPC(v, r), kp = kpisOperacion(r.tir, r, "TIR de la operación", (v.tipo === "real" ? "Real" : "Estimada") + " · efectiva anual");
    let posicion = null;
    if (r.cupones.length) kp.push(kpiProx({ fecha: r.cupones[0].fecha, texto: fPesos(r.cupones[0].monto / 100 * monto, 0) + " · con IPC de " + fPct(r.cupones[0].ipc, 2) }));
    else if (rc.b) kp.push(kpiProx({ fecha: rc.b.filas[0].fecha, texto: fPesos(rc.b.filas[0].cupon / 100 * monto, 0) + " · con IPC de " + fPct(rc.b.filas[0].ipc, 2) }));
    if (rc.b && rc.y != null) {
      const porTasa = v.modoCompra === "tasa";
      posicion = { form: "ipc_valorar", v: { emision: v.emision, vencimiento: v.vencimiento, spread: v.spread, periodo: v.periodo, modoIPC: v.modoIPC, fecha: v.fechaCompra, monto: v.monto,
        tipoTasa: porTasa ? v.tipoTasaCompra : "total", tasa: porTasa ? v.tasaCompra : txtPct(rc.y) } };
    }
    return {
      kpis: kp, avisos, posicion,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.precioCompra, 3), "Limpio: " + fN(r.limpioCompra, 3)) + mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.precioVenta, 3), "Limpio: " + fN(r.limpioVenta, 3)) +
        mini("IPC a la compra", fPct(r.ipcCompra.valor, 2), fF(r.ipcCompra.fecha)) + mini("IPC a la venta", fPct(r.ipcVenta.valor, 2), fF(r.ipcVenta.fecha)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "Fecha del IPC", k: "fechaRef", f: fF, esFecha: true }, { n: "IPC", k: "ipc", f: x => fPct(x, 2) }, { n: "Tasa cupón", k: "tasa", f: x => fPct(x, 4) }])) }]
        .concat(rc.tabs)
    };
  };

  function argsIBR(v) {
    const k = "ibr";
    return { tipo: v.tipo, emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), periodo: +v.periodo, spread: req(v, "spread", k), tenor: v.tenor,
      fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra,
      precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN, tirCompra: v.modoCompra === "tir" ? req(v, "tirCompra", k) : NaN, spreadCompra: v.modoCompra === "tasa" ? req(v, "spreadCompra", k) : NaN,
      fechaVenta: v.vender ? req(v, "fechaVenta", k) : null, modoVenta: v.vender ? v.modoVenta : "precio",
      precioVenta: v.vender && v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN, tirVenta: v.vender && v.modoVenta === "tir" ? req(v, "tirVenta", k) : NaN,
      spreadVenta: v.vender && v.modoVenta === "tasa" ? req(v, "spreadVenta", k) : NaN,
      metodoDescuento: v.metodo, serieIBR: S.ibr, curvas: S.curvas, montoPesos: req(v, "monto", k) };
  }
  const chipFuente = f => !f ? "" : '<span class="chip ' + (f === "Publicada" ? "pub" : /curva/i.test(f) ? "est" : "acc") + '">' + esc(f) + "</span>";
  function tablaValoracion(id, nombre, val) {
    return tabla(id, nombre, [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) }, { n: "IBR", k: "ibr", f: x => fPct(x, 4) },
      { n: "Fuente", k: "fuente", h: f => chipFuente(f.fuente), t: true }, { n: "Flujo", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }], val.tabla);
  }
  function textoValoracion(val, que) {
    if (!val) return "";
    if (val.metodo === "tir") return "Precio de " + que + " con la TIR de negociación " + fPct(val.tasaDescuento, 4) + " (flujos proyectados redondeados a 6 decimales).";
    return "Precio de " + que + ": flujos descontados a (" + (val.metodoDescuento === "vigente" ? "IBR vigente " + fPct(val.ibrVigente, 4) : "IBR promedio proyectado " + fPct(val.ibrPromedio, 4)) +
      " + spread) = " + fPct(val.tasaNegociacionNA, 4) + " NA → " + fPct(val.tasaDescuento, 4) + " EA" + (val.curva ? " · curva " + val.curva : "") + ".";
  }
  const posicionIBR = v => ({ form: "ibr", v: Object.assign({}, v, { vender: false }) });

  CALC.ibr_rent = v => {
    const a = argsIBR(v), r = M.rentabilidadIBR(a);
    const sinVenta = { fechaVenta: null, modoVenta: "precio", precioVenta: NaN, tirVenta: NaN, spreadVenta: NaN };
    const tirVtoIBR = r.alVencimiento ? null : intento(() => M.rentabilidadIBR(Object.assign({}, a, sinVenta)).tir);
    const avisos = [];
    if (r.mensajeTir) avisos.push({ tipo: "err", html: esc(r.mensajeTir) });
    if (r.sinBaseIBR) avisos.push({ tipo: "warn", html: "No hay base de IBR publicada: el primer cupón sale de la curva FR. Carga la base en Datos." });
    if (r.nEstimados > 0) avisos.push({ tipo: "warn", html: "<b>" + r.nEstimados + "</b> cupón(es) aún no tienen IBR publicado y se estimaron con la curva FR." });
    if (r.nRetroceso > 0) avisos.push({ tipo: "info", html: r.nRetroceso + " tasa(s) usan el último dato publicado antes de la fecha aplicable." });
    [textoValoracion(r.valoracion, "compra"), textoValoracion(r.valoracionVenta, "venta")].filter(Boolean).forEach(t => avisos.push({ tipo: "info", html: esc(t) }));
    const filas = r.tabla.map(x => Object.assign({}, x));
    const id = "op-ibr";
    const tabs = [{ id: "flujos", n: "Flujos", html: conTabla(id, tabla(id, "Flujos de la operación en pesos", [
      { n: "Concepto", k: "concepto", t: true }, { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "IBR", k: "ibr", f: x => x == null ? "" : fPct(x, 4) },
      { n: "Fuente", k: "fuente", h: f => chipFuente(f.fuente), t: true }, { n: "Dato del", k: "fechaDato", f: x => x == null ? "" : fF(x), esFecha: true }, { n: "Valor", k: "valor", f: x => fPesos(x, 0) }], filas)) }];
    if (r.valoracion) tabs.push({ id: "valc", n: "Valoración de compra", html: conTabla("valc-ibr", tablaValoracion("valc-ibr", "Valoración a la compra (por 100)", r.valoracion)) });
    if (r.valoracionVenta) tabs.push({ id: "valv", n: "Valoración de venta", html: conTabla("valv-ibr", tablaValoracion("valv-ibr", "Valoración a la venta (por 100)", r.valoracionVenta)) });
    let rg = null;
    if (r.riesgoBase) {
      const b = r.riesgoBase;
      rg = M.riesgo({ flujos: b.flujos, t: b.t, tasa: b.tasa, periodo: a.periodo, precioActual: r.precioCompra, factor: a.montoPesos / 100 });
      tabs.push({ id: "riesgo", n: "Riesgo", html: bloqueRiesgo(rg, { etiquetaTasa: "TIR EA" }) +
        '<div class="tarjeta-b"><p class="nota" style="margin:0">Riesgo a la fecha de compra con los flujos proyectados y ' + (b.origen === "implicita" ? "la TIR implícita en el precio de compra (" : "la tasa de descuento de la negociación (") + esc(fPct(b.tasa, 4)) + ").</p></div>" });
    }
    // Próximo cupón después de la compra
    let prox = null;
    const cups = r.tabla.slice(1, r.alVencimiento ? r.tabla.length : r.tabla.length - 1);
    if (cups.length) prox = { fecha: cups[0].fecha, valor: cups[0].valor - (r.alVencimiento && cups.length === 1 ? a.montoPesos : 0), ibr: cups[0].ibr };
    else if (r.valoracion && r.valoracion.tabla.length) { const f0 = r.valoracion.tabla[0]; prox = { fecha: f0.fecha, valor: (f0.flujo - (r.valoracion.tabla.length === 1 ? 100 : 0)) / 100 * a.montoPesos, ibr: f0.ibr }; }
    if (prox) prox.texto = fPesos(prox.valor, 0) + (prox.ibr != null ? " · con IBR de " + fPct(prox.ibr, 3) : "");
    const fc = M.aDia(a.fechaCompra), ve = M.aDia(a.vencimiento);
    // Escenarios: la venta se valora igual que la compra (por spread o por TIR)
    const modoB = a.modoCompra === "tasa" ? "tasa" : "tir";
    const baseB = a.modoCompra === "tasa" ? a.spreadCompra : a.modoCompra === "tir" ? a.tirCompra : (r.riesgoBase ? r.riesgoBase.tasa : NaN);
    const tasaBase = r.valoracion ? r.valoracion.tasaDescuento : baseB;
    return {
      kpis: [
        kpi("TIR de la operación", fPct(r.tir, 4), (v.tipo === "real" ? "Real" : "Proyectada") + " · IBR " + r.tenor, { prin: true }),
        kpi("Precio de compra", fN(r.precioCompra, 3), "Cupón corrido " + fN(r.cuponCorridoCompra, 6) + " · limpio " + fN(r.limpioCompra, 3)),
        kpi("Valor de giro (compra)", fPesos(r.giroCompra), compacto(r.giroCompra) + " de pesos"),
        r.alVencimiento ? kpi("Al vencimiento", "Se mantiene", "Recibe el 100 % más el último cupón") :
          kpi("Valor de la venta", fPesos(r.valorVenta), "Precio " + fN(r.precioVenta, 3) + " · limpio " + fN(r.limpioVenta, 3)),
        kpi("Cupones recibidos", fPesos(r.cuponesPesos), compacto(r.cuponesPesos)),
        kpi("Pérdidas y ganancias", fPesos(r.pygPesos), compacto(r.pygPesos), { cls: r.pygPesos >= 0 ? "pos" : "neg" })
      ].concat(tirVtoIBR != null ? [kpi("TIR al vencimiento", fPct(tirVtoIBR, 4), "Si no vendes y mantienes el bono")] : [], prox ? [kpiProx(prox)] : []),
      avisos, graf: graficoFlujos(filas), grafs: [graficoCurvaFR()], tabs,
      posicion: posicionIBR(v),
      resumen: { tipo: "IBR", bono: "IBR + " + fPct(a.spread, 2) + " · vence " + fF(ve), compra: fc, nominal: "$ " + corta(a.montoPesos), precio: r.precioCompra, giro: r.giroCompra,
        tir: r.alVencimiento ? r.tir : tirVtoIBR, dmod: rg ? rg.modificada : null, conv: rg ? rg.convexidad : null, dv01: rg ? rg.dv01Pesos : null, prox },
      escenarios: !isFinite(baseB) ? null : {
        calc: "ibr", nombre: "IBR", fc, ve, tasaBase, etiquetaTasa: "Tasa de descuento",
        punto: (d, s) => {
          const o = M.rentabilidadIBR(Object.assign({}, a, { fechaVenta: d, modoVenta: modoB, precioVenta: NaN, spreadVenta: modoB === "tasa" ? baseB + s / 1e4 : NaN, tirVenta: modoB === "tir" ? baseB + s / 1e4 : NaN }));
          return { tasa: o.valoracionVenta ? o.valoracionVenta.tasaDescuento : NaN, precio: o.precioVenta, limpio: o.limpioVenta, ic: o.cuponCorridoVenta, valorVenta: o.valorVenta, cupones: o.cuponesPesos,
            nCup: o.tabla.length - 2, giro: o.giroCompra, pyg: o.pygPesos, tir: o.tir, extra: modoB === "tasa" ? [["Spread de negociación ese día", fPct(baseB + s / 1e4, 4) + " NA"]] : [] };
        }
      }
    };
  };

  CALC.ibr_sendas = v => {
    const a = argsIBR(v), s = M.sendaTirIBR(a);
    const filas = s.filas.map(f => Object.assign({ fecha: f.fecha, precio: f.precio }, ...s.pasos.map((p, j) => ({ ["t" + j]: f.tirs[j] }))));
    const j0 = s.pasos.indexOf(0);
    let mejor = null;
    filas.forEach(f => { if (isFinite(f["t" + j0]) && (!mejor || f["t" + j0] > mejor["t" + j0])) mejor = f; });
    const elegida = s.ventaElegida != null ? filas.find(f => f.fecha === s.ventaElegida) : null;
    const id = "sendas-ibr";
    const cols = [{ n: "Vender el", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Precio de venta", k: "precio", f: x => fN(x, 3) }]
      .concat(s.pasos.map((p, j) => ({ n: p === 0 ? "TIR" : "TIR " + (p > 0 ? "+" : "−") + Math.abs(p) + " pb", k: "t" + j, f: x => fPct(x, 3) })));
    // Gráfico: TIR por fecha de venta (cada desplazamiento) y TIR de mantener
    const xs0 = filas.map(f => f.fecha);
    let svg = "";
    if (filas.length) {
      const vals = [].concat(...filas.map(f => s.pasos.map((p, j) => f["t" + j])), [s.tirVencimiento]).filter(isFinite);
      let ymin = Math.min.apply(null, vals), ymax = Math.max.apply(null, vals); const pad = (ymax - ymin) * 0.1 || 0.005; ymin -= pad; ymax += pad;
      const x0 = xs0[0], x1 = xs0[xs0.length - 1] === x0 ? x0 + 30 : xs0[xs0.length - 1];
      const { sx, sy } = marco(x0, x1, ymin, ymax);
      const ys = ticks(ymin, ymax, 5);
      const xt = xs0.filter((x, i) => i % Math.ceil(xs0.length / 6) === 0);
      svg = ejes(xt, ys, sx, sy, fFcorta, y => fN(y * 100, 2) + "%");
      const colores = ["var(--dim)", "var(--accent-2)", "var(--accent)", "var(--warn)", "var(--neg)"];
      s.pasos.forEach((p, j) => {
        const pts = filas.map(f => [f.fecha, f["t" + j]]).filter(q => isFinite(q[1]));
        svg += '<path d="' + ruta(pts, sx, sy) + '" fill="none" stroke="' + colores[j % 5] + '" stroke-width="' + (p === 0 ? 2.5 : 1.3) + '"' + (p === 0 ? "" : ' stroke-dasharray="4 4"') + "/>";
      });
      if (isFinite(s.tirVencimiento)) svg += '<line x1="' + ML + '" x2="' + (W - MR) + '" y1="' + sy(s.tirVencimiento) + '" y2="' + sy(s.tirVencimiento) + '" stroke="var(--pos)" stroke-width="1.5"/>' +
        '<text x="' + (W - MR - 4) + '" y="' + (sy(s.tirVencimiento) - 6) + '" text-anchor="end" style="fill:var(--pos)">Mantener ' + esc(fPct(s.tirVencimiento, 2)) + "</text>";
      if (elegida) svg += '<circle cx="' + sx(elegida.fecha) + '" cy="' + sy(elegida["t" + j0]) + '" r="5" fill="var(--accent-2)" stroke="var(--bg)" stroke-width="2"/>';
      svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="TIR según la fecha de venta">' + svg + "</svg>";
    }
    const base = s.modo === "tasa" ? "spread de " + fPct(s.valorBase, 3) + " NA" : "TIR de " + fPct(s.valorBase, 3) + " EA";
    return {
      kpis: [
        kpi("TIR si lo mantienes", fPct(s.tirVencimiento, 4), "Hasta el vencimiento", { prin: true }),
        elegida ? kpi("TIR con tu venta", fPct(elegida["t" + j0], 4), fF(elegida.fecha)) : kpi("Venta elegida", "Ninguna", "Activa «Vender antes del vencimiento»"),
        mejor ? kpi("Mejor fecha de venta", fF(mejor.fecha), "TIR " + fPct(mejor["t" + j0], 4)) : kpi("Mejor fecha de venta", "—"),
        kpi("Venta valorada con", s.modo === "tasa" ? "Spread" : "TIR", base)
      ],
      avisos: [{ tipo: "info", html: "Cada fila vende el bono en esa fecha con la información disponible ese día (" + esc(v.tipo === "real" ? "IBR publicado y curva vigente" : "curva FR vigente a la compra") + "). Las columnas ±pb mueven la tasa de venta." }],
      graf: { titulo: "TIR según la fecha de venta", sub: "Línea verde: mantener al vencimiento", svg: svg || '<p class="vacio">No hay fechas de cupón entre la compra y el vencimiento.</p>',
        leyenda: s.pasos.map((p, j) => [["var(--dim)", "var(--accent-2)", "var(--accent)", "var(--warn)", "var(--neg)"][j % 5], p === 0 ? "Tasa de venta" : (p > 0 ? "+" : "−") + Math.abs(p) + " pb"]) },
      grafs: [graficoCurvaFR()],
      tabs: [{ id: "sendas", n: "Sendas", html: conTabla(id, tabla(id, "TIR por fecha de venta", cols, filas, f => elegida && f.fecha === elegida.fecha ? "marca-fila" : "")) }]
    };
  };

  // =============================================================
  // ESCENARIOS: precio del bono en cada senda de tasas y en cada plazo
  // =============================================================
  // Sendas: la tasa de mercado sube o baja de 25 en 25 pb hasta ±400 pb.
  // Plazos: vender a 30, 60, 90, 180 y 365 días de la compra.
  const HORIZONTES = [30, 60, 90, 180, 365];
  const SENDAS = []; for (let s = -400; s <= 400; s += 25) SENDAS.push(s);
  const fPb = s => (s > 0 ? "+" : s < 0 ? "−" : "") + Math.abs(s) + " pb";
  const txtSenda = s => s === 0 ? "tasas sin cambio" : "tasas " + fPb(s);
  let ESC = null;                       // escenarios de la pestaña que está a la vista
  function construirEscenarios(def) {
    const hs = HORIZONTES.filter(h => def.fc + h < def.ve), puntos = [];
    let err = null;
    hs.forEach(h => SENDAS.forEach(s => {
      try {
        const p = def.punto(def.fc + h, s);
        if (p && isFinite(p.precio)) puntos.push(Object.assign(p, { h, s, fecha: def.fc + h }));
      } catch (e) { err = err || e.message; }
    }));
    return { def, hs: hs.filter(h => puntos.some(p => p.h === h)), puntos, err };
  }
  function colorSenda(s) {
    if (s === 0) return "var(--fg)";
    const k = Math.abs(s) / 400;
    return s < 0 ? "hsl(214,100%," + (82 - 28 * k).toFixed(0) + "%)" : "hsl(6,92%," + (84 - 26 * k).toFixed(0) + "%)";
  }
  function htmlEscenarios(def) {
    let E;
    try { E = construirEscenarios(def); } catch (e) { E = { def, hs: [], puntos: [], err: e.message }; }
    ESC = E;
    if (!E.puntos.length) {
      return '<div class="tarjeta-b"><div class="alerta ' + (E.err ? "err" : "info") + '">' + esc(E.err ? "No se pudieron calcular los escenarios: " + E.err :
        "El bono vence en menos de 30 días desde la compra, así que no hay plazos para proyectar.") + "</div></div>";
    }
    // En pantallas angostas el dibujo usa un lienzo más pequeño para que las letras no se encojan
    const movil = window.innerWidth < 640;
    const G = movil ? { w: 420, h: 410, l: 46, r: 60, t: 16, b: 52 } : { w: 760, h: 424, l: 58, r: 74, t: 18, b: 54 };
    const EW = G.w, EH = G.h, EL = G.l, ER = G.r, ET = G.t, EB = G.b;
    E.g = G;
    const hs = E.hs, h0 = hs[0], h1 = hs[hs.length - 1], precios = E.puntos.map(p => p.precio);
    let ymin = Math.min.apply(null, precios), ymax = Math.max.apply(null, precios);
    const pad = (ymax - ymin) * 0.06 || 1; ymin -= pad; ymax += pad;
    const sx = h => hs.length === 1 ? (EL + EW - ER) / 2 : EL + 16 + (h - h0) / (h1 - h0) * (EW - EL - ER - 16);
    const sy = y => EH - EB - (y - ymin) / (ymax - ymin) * (EH - ET - EB);
    E.sx = sx; E.sy = sy;
    let g = "";
    ticks(ymin, ymax, 6).forEach(y => {
      g += '<line x1="' + EL + '" x2="' + (EW - ER) + '" y1="' + sy(y) + '" y2="' + sy(y) + '" stroke="var(--line)"/><text x="' + (EL - 8) + '" y="' + (sy(y) + 4) + '" text-anchor="end">' + esc(fN(y, 1)) + "</text>";
    });
    hs.forEach(h => {
      g += '<line x1="' + sx(h) + '" x2="' + sx(h) + '" y1="' + ET + '" y2="' + (EH - EB) + '" stroke="var(--line)" stroke-dasharray="2 5"/><text x="' + sx(h) + '" y="' + (EH - EB + 18) + '" text-anchor="middle">' + h + "</text>";
    });
    g += '<text x="' + (EL + EW - ER) / 2 + '" y="' + (EH - 10) + '" text-anchor="middle">Días desde la compra</text>';
    // Primero las sendas intermedias, luego las de 100 en 100 y al final la de tasas sin cambio
    const orden = SENDAS.slice().sort((a, b) => ((a === 0) - (b === 0)) || ((a % 100 === 0) - (b % 100 === 0)));
    orden.forEach(s => {
      const pts = E.puntos.filter(p => p.s === s); if (!pts.length) return;
      const c = colorSenda(s), cien = s % 100 === 0;
      g += '<path data-s="' + s + '" d="' + pts.map((p, i) => (i ? "L" : "M") + sx(p.h).toFixed(1) + " " + sy(p.precio).toFixed(1)).join(" ") + '" fill="none" stroke="' + c +
        '" stroke-width="' + (s === 0 ? 2.6 : cien ? 1.5 : 0.9) + '" opacity="' + (cien ? 1 : 0.55) + '" stroke-linejoin="round"/>';
      pts.forEach(p => { g += '<circle cx="' + sx(p.h).toFixed(1) + '" cy="' + sy(p.precio).toFixed(1) + '" r="' + (s === 0 ? 2.8 : cien ? 2.2 : 1.5) + '" fill="' + c + '" opacity="' + (cien ? 1 : 0.7) + '"/>'; });
    });
    let ultY = null;
    [400, 200, 0, -200, -400].map(s => E.puntos.find(p => p.s === s && p.h === h1)).filter(Boolean).sort((a, b) => sy(a.precio) - sy(b.precio)).forEach(p => {
      const y = sy(p.precio);
      if (ultY != null && Math.abs(y - ultY) < 12) return;
      ultY = y;
      g += '<text x="' + (sx(h1) + 9) + '" y="' + (y + 4) + '" style="fill:' + colorSenda(p.s) + '">' + esc(p.s === 0 ? (movil ? "0 pb" : "Sin cambio") : fPb(p.s)) + "</text>";
    });
    g += '<circle id="esc-pt" r="6.5" cx="0" cy="0" fill="var(--bg)" stroke="var(--fg)" stroke-width="2.5" visibility="hidden"/>';
    const idT = "esc-" + def.calc;
    tabla(idT, "Escenarios de precio por senda y plazo", [
      { n: "Plazo (días)", k: "h" }, { n: "Fecha de venta", k: "fecha", esFecha: true }, { n: "Senda (pb)", k: "s" }, { n: def.etiquetaTasa, k: "tasa" },
      { n: "Precio sucio", k: "precio" }, { n: "Precio limpio", k: "limpio" }, { n: "Valor de la venta", k: "valorVenta" }, { n: "Cupones recibidos", k: "cupones" },
      { n: "P&G", k: "pyg" }, { n: "TIR de la operación", k: "tir" }], E.puntos);
    const grad = (a, b) => "linear-gradient(90deg," + colorSenda(a) + "," + colorSenda(b) + ")";
    return '<div class="bloque"><div class="bloque-c"><div><h3>Precio del bono en cada escenario</h3><div class="sub">Cada línea es una senda: la tasa de mercado ' +
      "se mueve de 25 en 25 pb hasta ±400 pb y el bono se vende a los 30, 60, 90, 180 o 365 días de la compra. El precio sucio baja cada vez que el bono paga un cupón. Pasa el cursor para ver el precio y la TIR; haz clic en un punto para ver el P&amp;G.</div></div>" +
      '<div class="leyenda"><span class="esc-esc"><i style="background:' + grad(-25, -400) + '"></i>Tasas bajan</span><span class="esc-esc"><i style="background:var(--fg);width:18px"></i>Sin cambio</span>' +
      '<span class="esc-esc"><i style="background:' + grad(25, 400) + '"></i>Tasas suben</span>' + (DESCARGAS !== false ? '<button class="btn mini" data-csv="' + idT + '">' + ICON.bajar + " CSV</button>" : "") + "</div></div>" +
      '<div class="graf"><div class="esc-wrap" id="esc-wrap"><svg class="esc" viewBox="0 0 ' + EW + " " + EH + '" role="img" aria-label="Precio sucio del bono según la senda de tasas y el plazo de venta">' + g +
      '</svg><div class="esc-tip" id="esc-tip" hidden></div></div></div>' +
      '<div class="esc-ctl"><label for="esc-s">Senda<select id="esc-s">' + SENDAS.slice().reverse().map(s => '<option value="' + s + '"' + (s === 0 ? " selected" : "") + ">" + esc(s === 0 ? "Sin cambio" : fPb(s)) + "</option>").join("") +
      '</select></label><label for="esc-h">Plazo<select id="esc-h">' + hs.map(h => '<option value="' + h + '"' + (h === h1 ? " selected" : "") + ">" + h + " días</option>").join("") +
      '</select></label><button class="btn mini" data-escver>Ver detalle del punto</button></div></div>';
  }
  function puntoCercano(svg, e) {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * ESC.g.w, y = (e.clientY - r.top) / r.height * ESC.g.h;
    let mejor = null, dm = Infinity;
    ESC.puntos.forEach(p => { const dx = ESC.sx(p.h) - x, dy = ESC.sy(p.precio) - y, d = dx * dx + dy * dy; if (d < dm) { dm = d; mejor = p; } });
    return mejor;
  }
  function marcarPunto(p, conTip) {
    const w = $("#esc-wrap"); if (!w || !p || !ESC) return;
    const pt = $("#esc-pt"), cx = ESC.sx(p.h), cy = ESC.sy(p.precio), EW = ESC.g.w, EH = ESC.g.h;
    pt.setAttribute("cx", cx); pt.setAttribute("cy", cy); pt.setAttribute("visibility", "visible"); pt.setAttribute("stroke", colorSenda(p.s));
    w.querySelectorAll("path.sel").forEach(x => x.classList.remove("sel"));
    const linea = w.querySelector('path[data-s="' + p.s + '"]'); if (linea) linea.classList.add("sel");
    const selS = $("#esc-s"), selH = $("#esc-h");
    if (selS) selS.value = String(p.s); if (selH) selH.value = String(p.h);
    const tip = $("#esc-tip");
    if (!conTip) { tip.hidden = true; return; }
    tip.innerHTML = "<b>A " + p.h + " días · " + esc(txtSenda(p.s)) + "</b><div><span>Precio sucio</span><span>" + esc(fN(p.precio, 3)) + "</span></div><div><span>" + esc(ESC.def.etiquetaTasa) +
      "</span><span>" + esc(fPct(p.tasa, 3)) + "</span></div><div><span>TIR de la operación</span><span>" + esc(fPct(p.tir, 3)) + "</span></div><em>Clic para ver el P&amp;G y más datos</em>";
    tip.style.left = (cx / EW * 100) + "%"; tip.style.top = (cy / EH * 100) + "%";
    tip.className = "esc-tip" + (cx < EW * 0.24 ? " der" : cx > EW * 0.76 ? " izq" : cy < EH * 0.4 ? " abajo" : "");
    tip.hidden = false;
  }
  const ocultarTip = () => { const t = $("#esc-tip"); if (t) t.hidden = true; };
  function detalleEscenario(p) {
    if (!p || !ESC) return;
    const d = ESC.def, base = ESC.puntos.find(q => q.h === p.h && q.s === 0);
    const fila = (a, b) => "<span>" + a + "</span><span>" + b + "</span>";
    const color = x => '<b class="' + (x >= 0 ? "pos" : "neg") + '">' + esc(fPesos(x, 0)) + "</b>";
    let rg = null;
    if (d.riesgoEn) { try { rg = d.riesgoEn(p.fecha, p.s, p); } catch (e) { rg = null; } }
    let h = '<div class="mini-g"><div class="mini"><div class="kpi-l">Pérdidas y ganancias</div><div class="kpi-v ' + (p.pyg >= 0 ? "pos" : "neg") + '">' + esc(fPesos(p.pyg, 0)) + '</div><div class="kpi-s">' +
      esc(fN(p.pyg / p.giro * 100, 2)) + " % de lo invertido</div></div>" + mini("TIR de la operación", fPct(p.tir, 4), "Efectiva anual") + mini("Precio sucio de venta", fN(p.precio, 3), "Limpio: " + fN(p.limpio, 3)) + "</div>";
    h += '<div><h4>La venta</h4><div class="dl">' + fila("Fecha de venta", esc(fF(p.fecha)) + " <small>(" + p.h + " días después)</small>") +
      fila(esc(d.etiquetaTasa) + " ese día", esc(fPct(p.tasa, 4)) + (isFinite(d.tasaBase) ? " <small>(a la compra: " + esc(fPct(d.tasaBase, 4)) + ")</small>" : "")) +
      (p.extra || []).map(x => fila(esc(x[0]), esc(x[1]))).join("") + fila("Interés corrido", esc(fN(p.ic, 6))) + fila("Precio limpio", esc(fN(p.limpio, 3))) + fila("Valor de la venta", esc(fPesos(p.valorVenta, 0))) + "</div></div>";
    h += '<div><h4>El resultado</h4><div class="dl">' + fila("Valor de giro de la compra", esc(fPesos(p.giro, 0))) + fila("Cupones recibidos", esc(fPesos(p.cupones, 0)) + " <small>(" + p.nCup + (p.nCup === 1 ? " cupón" : " cupones") + ")</small>") +
      fila("Pérdidas y ganancias", color(p.pyg)) + (base && p.s !== 0 ? fila("Si las tasas no cambiaran, a la misma fecha", esc(fPesos(base.pyg, 0))) + fila("Efecto del movimiento de tasas", color(p.pyg - base.pyg)) : "") +
      (rg ? fila("Duración modificada ese día", esc(fN(rg.dmod, 4))) + fila("DV01 de la posición ese día", esc(rg.dv01)) : "") + "</div></div>";
    const misma = ESC.puntos.filter(q => q.s === p.s);
    h += '<div><h4>Esta senda en cada plazo</h4><div class="tabla-w"><table><thead><tr><th class="t">Vender a</th><th>Precio sucio</th><th>P&amp;G</th><th>TIR de la operación</th></tr></thead><tbody>' +
      misma.map(q => '<tr class="' + (q.h === p.h ? "marca-fila" : "") + '"><td class="t">' + q.h + ' días</td><td class="n">' + esc(fN(q.precio, 3)) + '</td><td class="n ' + (q.pyg >= 0 ? "pos" : "neg") + '">' + esc(fPesos(q.pyg, 0)) +
        '</td><td class="n">' + esc(fPct(q.tir, 3)) + "</td></tr>").join("") + "</tbody></table></div></div>";
    abrirModal("Vender a " + p.h + " días con " + txtSenda(p.s), d.nombre + " · venta el " + fF(p.fecha), h);
  }
  function abrirModal(titulo, sub, html) {
    $("#modal-t").textContent = titulo; $("#modal-s").textContent = sub; $("#modal-b").innerHTML = html;
    $("#modal").hidden = false; $("#modal [data-cerrar-modal]").focus();
  }
  const cerrarModal = () => { $("#modal").hidden = true; };
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-cerrar-modal]")) cerrarModal(); });
  (function () {
    const R = $("#resultados");
    R.addEventListener("mousemove", e => { const svg = e.target.closest && e.target.closest("svg.esc"); if (svg && ESC) marcarPunto(puntoCercano(svg, e), true); else ocultarTip(); });
    R.addEventListener("mouseleave", ocultarTip);
    R.addEventListener("click", e => { const svg = e.target.closest && e.target.closest("svg.esc"); if (svg && ESC) { const p = puntoCercano(svg, e); marcarPunto(p, false); detalleEscenario(p); } });
    R.addEventListener("change", e => {
      if (!ESC || (e.target.id !== "esc-s" && e.target.id !== "esc-h")) return;
      marcarPunto(puntoElegido(), false);
    });
  })();
  function puntoElegido() {
    const s = +$("#esc-s").value, h = +$("#esc-h").value;
    return ESC.puntos.find(p => p.s === s && p.h === h) || ESC.puntos.find(p => p.h === h) || ESC.puntos[0];
  }

  // =============================================================
  // PINTAR RESULTADOS
  // =============================================================
  let ULTIMO = null, PEST = [];
  function calcular() {
    if (ST.calc === "port") { pintarPortafolio(); return; }
    const md = modoActual(), clave = ST.calc === "ibr" ? "ibr_" + md.id : md.form;
    const v = ST.v[md.form];
    let vista;
    try { vista = CALC[clave](v); }
    catch (e) {
      if (!e.esValidacion && window.console) console.warn(e);
      vista = { error: e.esValidacion ? e.message : "No fue posible calcular con estos datos: " + e.message };
    }
    ULTIMO = vista;
    pintarResultados(vista);
  }
  // Pestañas en este orden: flujos (y valoraciones), gráficos, escenarios y riesgo
  function armarPestanas(vista) {
    const tabs = (vista.tabs || []).slice(), nuevas = [];
    const grafs = [vista.graf].concat(vista.grafs || [], [graficoCurvaTES(vista.marcaTES)]).filter(Boolean);
    if (grafs.length) nuevas.push({ id: "graf", n: "Gráficos", html: grafs.map(bloqueGrafico).join("") });
    if (vista.escenarios) nuevas.push({ id: "esc", n: "Escenarios", lazy: () => htmlEscenarios(vista.escenarios) });
    const i = tabs.findIndex(t => t.id === "riesgo");
    if (i < 0) return tabs.concat(nuevas);
    tabs.splice(i, 0, ...nuevas);
    return tabs;
  }
  function pintarResultados(vista) {
    const R = $("#resultados");
    if (vista.error) {
      R.innerHTML = '<div class="avisos"><div class="alerta err"><b>Falta algo.</b> ' + esc(vista.error) + "</div></div>" + (R.dataset.ok ? "" : '<div class="tarjeta vacio">Corrige el dato y el resultado aparece aquí.</div>');
      return;
    }
    R.dataset.ok = "1";
    let html = '<div class="kpis" id="kpis">' + vista.kpis.map(k => '<div class="kpi' + (k.prin ? " prin" : "") + '"><div class="kpi-l">' + esc(k.l) + '</div><div class="kpi-v ' + (k.cls || "") + '" title="' + esc(k.v) + '">' + esc(k.v) + "</div>" +
      (k.s ? '<div class="kpi-s">' + esc(k.s) + "</div>" : "") + "</div>").join("") + "</div>";
    if (vista.avisos && vista.avisos.length) html += '<div class="avisos">' + vista.avisos.map(a => '<div class="alerta ' + (a.tipo === "warn" ? "" : a.tipo) + '">' + a.html + "</div>").join("") + "</div>";
    if (vista.extra) html += vista.extra;
    if (vista.posicion) html += barraPosicion();
    PEST = armarPestanas(vista);
    if (PEST.length) {
      const clave = ST.calc + "_" + ST.modo[ST.calc];
      let act = ST.pestana[clave];
      if (!PEST.some(t => t.id === act)) act = PEST[0].id;
      html += '<section class="tarjeta" id="pestanas"><div class="pestanas" role="tablist">' + PEST.map(t => '<button role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === act) + '">' + esc(t.n) + "</button>").join("") + "</div>" +
        PEST.map(t => '<div role="tabpanel" data-panel="' + t.id + '"' + (t.id === act ? "" : " hidden") + ">" + (t.lazy ? (t.id === act ? t.lazy() : "") : t.html) + "</div>").join("") + "</section>";
    }
    R.innerHTML = html;
  }

  // =============================================================
  // NAVEGACIÓN
  // =============================================================
  function pintarNav() {
    $("#nav-calcs").innerHTML = Object.keys(CALCS).map(k => '<button class="calc-b" data-calc="' + k + '" aria-pressed="' + (ST.calc === k) + '">' + esc(CALCS[k].nombre) + "<small>" + esc(CALCS[k].corto) + "</small></button>").join("") +
      '<button class="calc-b port" id="btn-port" data-calc="port" aria-pressed="' + (ST.calc === "port") + '"><span>Portafolio' + (PORT.pos.length ? '<span class="cuenta">' + PORT.pos.length + "</span>" : "") + "</span><small>Posiciones y carry</small></button>";
    if (ST.calc === "port") {
      $("#cab").innerHTML = "<div><h1>Portafolio</h1><p>Las compras que has guardado desde las calculadoras, con el valor total, la TIR, la duración, el DV01, los próximos cupones y el carry neto.</p></div>";
      return;
    }
    const c = CALCS[ST.calc], md = modoActual();
    $("#cab").innerHTML = '<div><h1>' + esc(c.nombre) + " · " + esc(md.nombre) + "</h1><p>" + esc(md.desc) + '</p></div><div class="seg submodos" id="submodos" role="group" aria-label="Modo">' +
      c.modos.map(m => '<button data-modo="' + m.id + '" aria-pressed="' + (m.id === md.id) + '">' + esc(m.nombre) + "</button>").join("") + "</div>";
  }
  function irA(calc, modo) {
    ST.calc = calc;
    const esPort = calc === "port";
    $("#zona-calc").hidden = esPort; $("#portafolio").hidden = !esPort;
    if (!esPort && modo) ST.modo[calc] = modo;
    pintarNav();
    if (esPort) pintarPortafolio();
    else { pintarForm(); delete $("#resultados").dataset.ok; calcular(); }
    const h = esPort ? "#port" : "#" + calc + "-" + ST.modo[calc];
    if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) { location.hash = h; } }
    if (esPort) window.scrollTo(0, 0);
  }
  function desdeHash() {
    const m = (location.hash || "").replace("#", "").split("-");
    if (m[0] === "port") return ["port", null];
    if (CALCS[m[0]]) { const md = CALCS[m[0]].modos.find(x => x.id === m[1]); return [m[0], md ? md.id : null]; }
    return null;
  }

  let tCalc = null;
  const programar = () => { clearTimeout(tCalc); tCalc = setTimeout(calcular, 220); };

  document.addEventListener("click", e => {
    const b = e.target.closest("button, [data-tick]");
    if (!b) return;
    if (b.dataset.calc) return irA(b.dataset.calc);
    if (b.dataset.modo) return irA(ST.calc, b.dataset.modo);
    if (clicPortafolio(b)) return;
    if (b.dataset.escver !== undefined) { if (ESC) { const pt = puntoElegido(); marcarPunto(pt, false); detalleEscenario(pt); } return; }
    if (b.dataset.ccTes !== undefined) return usarCurvaTES();
    if (b.dataset.seg) {
      const k = modoActual().form; ST.v[k][b.dataset.seg] = b.dataset.val; pintarForm(); calcular(); return;
    }
    if (b.dataset.tab) {
      ST.pestana[ST.calc + "_" + ST.modo[ST.calc]] = b.dataset.tab;
      const sec = b.closest("#pestanas");
      sec.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
      sec.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
      const t = PEST.find(x => x.id === b.dataset.tab), panel = sec.querySelector('[data-panel="' + b.dataset.tab + '"]');
      if (t && t.lazy && panel && !panel.innerHTML) panel.innerHTML = t.lazy();
      return;
    }
    if (b.dataset.csv) return descargar(b.dataset.csv);
    if (b.dataset.abrir) return abrirPanel(b.dataset.abrir);
    if (b.dataset.tick !== undefined) return abrirPanel("mercado");
    if (b.dataset.cerrar !== undefined) return cerrarPanel();
    if (b.dataset.restaurar) { restaurar(b.dataset.restaurar); abrirPanel("datos"); pintarCinta(); calcular(); return; }
    if (b.id === "btn-guia" || b.dataset.guia !== undefined) return guia.iniciar();
    if (b.id === "cerrar-aviso") { lsSet("rf_aviso_guia", "1"); $("#aviso-guia").hidden = true; return; }
    if (b.dataset.trmvivo !== undefined) return trmEnVivo(true);
  });
  const form = () => $("#formulario");
  document.addEventListener("input", e => {
    const el = e.target; if (!form().contains(el) || !el.dataset.k) return;
    const k = modoActual().form;
    ST.v[k][el.dataset.k] = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.tipo === "dinero") {
      const c = campoDef(k, el.dataset.k), sp = form().querySelector('[data-compacto="' + el.dataset.k + '"]');
      if (sp) sp.textContent = textoCompacto(el.value, c.unidad ? c.unidad(ST.v[k]) : "$");
    }
    if (el.tagName === "SELECT" || el.type === "checkbox") { pintarForm(); calcular(); } else programar();
  });
  document.addEventListener("change", e => {
    const el = e.target; if (!form().contains(el) || el.dataset.tipo !== "dinero") return;
    el.value = formatoDinero(el.value); ST.v[modoActual().form][el.dataset.k] = el.value;
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (guia.activo) guia.fin(); else if (!$("#modal").hidden) cerrarModal(); else cerrarPanel(); } });

  // =============================================================
  // PORTAFOLIO: posiciones compradas, totales y carry neto
  // =============================================================
  // Cada posición guarda las condiciones de la compra (los mismos campos del
  // formulario); sus cifras se recalculan con los datos vigentes cada vez.
  const PORT = { pos: [], prestados: false, tasa: "", pct: "100" };
  try { const j = JSON.parse(lsGet("rf_portafolio") || "null"); if (j && Array.isArray(j.pos)) Object.assign(PORT, j); } catch (e) { /* portafolio vacío */ }
  const guardarPort = () => lsSet("rf_portafolio", JSON.stringify(PORT));
  const DESTINO = { tf_valorar: ["tf", "valorar", "tf_valorar"], uvr_valorar: ["uvr", "valorar", "uvr_valorar"], ipc_valorar: ["ipc", "valorar", "ipc_valorar"], ibr: ["ibr", "rent", "ibr_rent"] };
  function calcularSilencioso(clave, v) {
    const copia = Object.assign({}, TABLAS);
    try { return CALC[clave](v); }
    finally { Object.keys(TABLAS).forEach(k => delete TABLAS[k]); Object.assign(TABLAS, copia); }
  }
  function metricasPortafolio() {
    return PORT.pos.map(p => {
      const d = DESTINO[p.form];
      try {
        if (!d) throw new Error("tipo de posición desconocido");
        const r = calcularSilencioso(d[2], p.v).resumen;
        if (!r) throw new Error("sin datos para esta posición");
        return Object.assign({ id: p.id }, r);
      } catch (e) { return { id: p.id, error: e.message, tipo: d ? CALCS[d[0]].nombre : "—" }; }
    });
  }
  function agregarPosicion() {
    if (!ULTIMO || !ULTIMO.posicion) return;
    PORT.pos.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), form: ULTIMO.posicion.form, v: Object.assign({}, ULTIMO.posicion.v) });
    guardarPort(); pintarNav(); pintarResultados(ULTIMO);
    toast("Posición agregada al portafolio (" + PORT.pos.length + ")");
  }
  function barraPosicion() {
    const n = PORT.pos.length;
    return '<div class="barra-pos"><p>Guarda esta compra para ver el valor, la duración, el DV01 y el carry de todo lo que llevas comprado.</p>' +
      '<button class="btn pri" id="btn-agregar" data-agregar>Agregar al portafolio</button>' + (n ? '<button class="btn" data-calc="port">Ver portafolio (' + n + ")</button>" : "") + "</div>";
  }
  // Carry: lo que genera el portafolio (su TIR sobre el valor invertido) menos lo
  // que cuesta el préstamo (su tasa sobre la parte financiada), con interés compuesto.
  function carry(ms) {
    const ok = ms.filter(m => !m.error && isFinite(m.giro) && m.tir != null && isFinite(m.tir));
    const V = ok.reduce((s, m) => s + m.giro, 0);
    const f = PORT.prestados ? pPct(PORT.tasa) : 0, pct = PORT.prestados ? pNum(PORT.pct) / 100 : 0;
    const valido = !PORT.prestados || (isFinite(f) && f > -1 && isFinite(pct) && pct >= 0 && pct <= 1);
    const F = V * (valido ? pct : 0);
    const fila = h => {
      const ing = ok.reduce((s, m) => s + m.giro * (Math.pow(1 + m.tir, h / 365) - 1), 0), cos = valido ? F * (Math.pow(1 + f, h / 365) - 1) : 0;
      return { h, ing, cos, neto: ing - cos };
    };
    return { V, F, f, pct, valido, sinTir: ms.filter(m => !m.error).length - ok.length, tir: V ? ok.reduce((s, m) => s + m.giro * m.tir, 0) / V : NaN, filas: [fila(1), fila(30), fila(365)] };
  }
  function htmlCarry(ms) {
    const c = carry(ms), anio = c.filas[2];
    if (!c.valido) return '<div class="tarjeta-b"><div class="alerta err"><b>Falta algo.</b> Escribe la tasa del préstamo y la parte financiada (entre 0 y 100 %).</div></div>';
    const tiles = PORT.prestados
      ? '<div class="mini"><div class="kpi-l">Carry neto al año</div><div class="kpi-v ' + (anio.neto >= 0 ? "pos" : "neg") + '">' + esc(fPesos(anio.neto, 0)) + '</div><div class="kpi-s">' + esc(compacto(anio.neto)) + " de pesos</div></div>" +
        mini("TIR del portafolio", fPct(c.tir, 3), "Promedio por valor invertido") + mini("Costo de los fondos", fPct(c.f, 3), "Sobre el " + fN(c.pct * 100, 0) + " % financiado: " + fPesos(c.F, 0)) +
        mini("Diferencial", fN((c.tir - c.f) * 1e4, 0) + " pb", c.tir >= c.f ? "El portafolio rinde más que el préstamo" : "El préstamo cuesta más de lo que rinde")
      : mini("El portafolio genera al año", fPesos(anio.ing, 0), compacto(anio.ing) + " de pesos") + mini("TIR del portafolio", fPct(c.tir, 3), "Promedio por valor invertido");
    const filas = c.filas.map(x => ({ per: x.h === 1 ? "Por día" : x.h === 30 ? "Por mes (30 días)" : "Por año", ing: x.ing, cos: x.cos, neto: x.neto }));
    const t = tabla("carry", "Carry neto del portafolio", [{ n: "Periodo", k: "per", t: true }, { n: "Genera el portafolio", k: "ing", f: x => fPesos(x, 0) },
      { n: "Cuesta el préstamo", k: "cos", f: x => fPesos(x, 0) }, { n: "Carry neto", k: "neto", h: f => '<span class="' + (f.neto >= 0 ? "pos" : "neg") + '">' + esc(fPesos(f.neto, 0)) + "</span>", csv: f => f.neto }], filas);
    return '<div class="tarjeta-b"><div class="mini-g">' + tiles + "</div>" +
      '<p class="nota">' + (PORT.prestados ? "El portafolio gana su TIR sobre lo invertido y el préstamo cuesta su tasa sobre la parte financiada, ambos con interés compuesto. " : "Con fondos propios no hay costo de préstamo: el carry es todo lo que genera el portafolio. ") +
      "La TIR de cada posición es la de mantenerla hasta el vencimiento" + (c.sinTir ? "; " + c.sinTir + " posición(es) sin TIR quedaron por fuera" : "") + ".</p></div>" + t;
  }
  const dosLineas = t => { const i = String(t).indexOf(" · "); return i < 0 ? esc(t) : esc(t.slice(0, i)) + "<small>" + esc(t.slice(i + 3)) + "</small>"; };
  function pintarPortafolio() {
    const P = $("#portafolio"), ms = metricasPortafolio();
    if (!ms.length) {
      P.innerHTML = '<div class="tarjeta vacio"><h3>Tu portafolio está vacío</h3><p>Entra a una calculadora, arma la compra de un bono y toca «Agregar al portafolio». Aquí verás el valor total, la TIR, la duración, el DV01, los próximos cupones y el carry neto.</p>' +
        '<p style="margin-top:14px"><button class="btn pri" data-calc="tf">Ir a Tasa Fija</button></p></div>';
      return;
    }
    const ok = ms.filter(m => !m.error), V = ok.reduce((s, m) => s + m.giro, 0);
    const pond = k => { const q = ok.filter(m => m[k] != null && isFinite(m[k])), w = q.reduce((s, m) => s + m.giro, 0); return w ? q.reduce((s, m) => s + m.giro * m[k], 0) / w : NaN; };
    const dv = ok.reduce((s, m) => s + (isFinite(m.dv01) ? m.dv01 : 0), 0);
    const conCupon = ok.filter(m => m.prox).sort((a, b) => a.prox.fecha - b.prox.fecha);
    const prox = conCupon.find(m => m.prox.fecha >= hoy) || conCupon[0];
    let html = '<div class="kpis">' + [
      kpi("Valor del portafolio", fPesos(V), compacto(V) + " de pesos · " + ok.length + (ok.length === 1 ? " posición" : " posiciones"), { prin: true, ancha: true }),
      kpi("TIR promedio", fPct(pond("tir"), 3), "Ponderada por valor invertido"),
      kpi("Duración modificada", fN(pond("dmod"), 3), "Ponderada · convexidad " + fN(pond("conv"), 2)),
      kpi("DV01 total", fPesos(dv, 0), "Cambio de valor por cada punto básico"),
      prox ? kpi("Próximo cupón", fF(prox.prox.fecha), fPesos(prox.prox.valor, 0) + " · " + prox.tipo) : kpi("Próximo cupón", "—")
    ].map(k => '<div class="kpi' + (k.prin ? " prin" : "") + (k.ancha ? " ancha" : "") + '"><div class="kpi-l">' + esc(k.l) + '</div><div class="kpi-v">' + esc(k.v) + "</div>" + (k.s ? '<div class="kpi-s">' + esc(k.s) + "</div>" : "") + "</div>").join("") + "</div>";
    const sug = (MERC.indicadores.find(i => i.id === "banrep") || {}).valor;
    html += '<section class="tarjeta"><div class="tarjeta-c"><div><h3>Carry neto</h3><div class="sub">Lo que genera el portafolio menos lo que cuesta el dinero con el que se compró.</div></div></div><div class="carry"><div class="carry-f">' +
      '<div class="campo ancho"><span class="lbl">¿Los fondos son prestados?</span><div class="seg" role="group"><button type="button" data-prest="no" aria-pressed="' + !PORT.prestados + '">No, son propios</button>' +
      '<button type="button" data-prest="si" aria-pressed="' + !!PORT.prestados + '">Sí, son prestados</button></div></div>' +
      (PORT.prestados ? '<div class="campo"><label for="p-tasa">Tasa del préstamo</label><div class="sufijo"><input type="text" inputmode="decimal" autocomplete="off" id="p-tasa" data-port="tasa" value="' + esc(PORT.tasa) + '"><span>% EA</span></div>' +
        (sug ? '<span class="ayuda">Tasa del Banco de la República: ' + esc(fN(sug, 2)) + " %</span>" : "") + "</div>" +
        '<div class="campo"><label for="p-pct">Parte financiada</label><div class="sufijo"><input type="text" inputmode="decimal" autocomplete="off" id="p-pct" data-port="pct" value="' + esc(PORT.pct) + '"><span>%</span></div><span class="ayuda">Del valor del portafolio</span></div>' : "") +
      '</div><div class="carry-r" id="carry-res">' + htmlCarry(ms) + "</div></div></section>";
    const filas = ms.map(m => m).concat([{ total: true, tipo: "Total", bono: ok.length + (ok.length === 1 ? " posición" : " posiciones"), giro: V, tir: pond("tir"), dmod: pond("dmod"), dv01: dv }]);
    const nd = (x, f) => x == null || !isFinite(x) ? "—" : f(x);
    const t = tabla("portafolio", "Posiciones del portafolio", [
      { n: "Tipo", k: "tipo", t: true },
      { n: "Bono", k: "bono", t: true, h: f => f.error ? '<span class="neg">No se pudo calcular: ' + esc(f.error) + "</span>" : dosLineas(f.bono), csv: f => f.error ? "Error: " + f.error : f.bono },
      { n: "Compra", k: "compra", f: x => x == null ? "" : fF(x), esFecha: true },
      { n: "Nominal", k: "nominal", f: x => x || "" },
      { n: "Precio sucio", k: "precio", f: x => nd(x, y => fN(y, 3)) },
      { n: "Valor de giro", k: "giro", f: x => nd(x, y => fPesos(y, 0)) },
      { n: "TIR", k: "tir", f: x => nd(x, y => fPct(y, 3)) },
      { n: "Dur. modificada", k: "dmod", f: x => nd(x, y => fN(y, 3)) },
      { n: "DV01", k: "dv01", f: x => nd(x, y => fPesos(y, 0)) },
      { n: "Próximo cupón", h: f => f.prox ? dosLineas(fF(f.prox.fecha) + " · " + fPesos(f.prox.valor, 0)) : "", csv: f => f.prox ? M.aTexto(f.prox.fecha) + " " + Math.round(f.prox.valor) : "" },
      { n: "", t: true, h: f => f.total ? "" : (f.error ? "" : '<button class="btn mini" data-pos-abrir="' + f.id + '">Abrir</button> ') + '<button class="btn mini" data-pos-quitar="' + f.id + '">Quitar</button>', csv: () => "" }
    ], filas, f => f.total ? "total" : "");
    html += '<section class="tarjeta"><div class="tarjeta-c"><div><h3>Posiciones</h3><div class="sub">Las cifras se recalculan con los datos vigentes. «Abrir» lleva la compra de vuelta a su calculadora.</div></div>' +
      '<div class="fila-b" style="display:flex;gap:8px;flex-wrap:wrap">' + (DESCARGAS !== false ? '<button class="btn mini" data-csv="portafolio">' + ICON.bajar + " CSV</button>" : "") + '<button class="btn mini" data-port-vaciar>Vaciar portafolio</button></div></div>' + t + "</section>";
    P.innerHTML = html;
  }
  document.addEventListener("input", e => {
    const el = e.target; if (!el.dataset || !el.dataset.port) return;
    PORT[el.dataset.port] = el.value; guardarPort();
    const r = $("#carry-res"); if (r) r.innerHTML = htmlCarry(metricasPortafolio());
  });
  function clicPortafolio(b) {
    if (b.dataset.agregar !== undefined) { agregarPosicion(); return true; }
    if (b.dataset.prest) {
      PORT.prestados = b.dataset.prest === "si";
      if (PORT.prestados && !PORT.tasa) { const s = (MERC.indicadores.find(i => i.id === "banrep") || {}).valor; PORT.tasa = s ? String(s).replace(".", ",") : ""; }
      guardarPort(); pintarPortafolio(); return true;
    }
    if (b.dataset.posQuitar) { PORT.pos = PORT.pos.filter(p => p.id !== b.dataset.posQuitar); guardarPort(); pintarNav(); pintarPortafolio(); return true; }
    if (b.dataset.posAbrir) {
      const p = PORT.pos.find(x => x.id === b.dataset.posAbrir), d = p && DESTINO[p.form];
      if (d) { Object.assign(ST.v[p.form], p.v); irA(d[0], d[1]); }
      return true;
    }
    if (b.dataset.portVaciar !== undefined) {
      if (b.dataset.confirmar) { PORT.pos = []; guardarPort(); pintarNav(); pintarPortafolio(); }
      else { b.dataset.confirmar = "1"; b.textContent = "Toca otra vez para vaciar"; b.classList.add("pri"); }
      return true;
    }
    return false;
  }

  // =============================================================
  // DESCARGAS (capacidad downloads en el enlace; Blob en la copia local)
  // =============================================================
  let DESCARGAS = null, NS_DESCARGAS = null;
  async function descargar(id) {
    const datos = csvDe(id), nombre = (TABLAS[id].nombre || id).replace(/[^\wáéíóúñ ]+/gi, "").trim().replace(/\s+/g, "_") + ".csv";
    if (NS_DESCARGAS) {
      try { await NS_DESCARGAS.save({ filename: nombre, data: datos }); toast("Archivo guardado"); }
      catch (e) { if (e && e.code !== "declined") toast("No se pudo descargar el archivo aquí."); }
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([datos], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast("No se pudo descargar el archivo aquí."); }
  }
  function toast(t) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));background:var(--panel-2);border:1px solid var(--accent);padding:9px 14px;border-radius:6px;z-index:90;font-size:13px";
      document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // =============================================================
  // MERCADO: cinta superior y panel
  // =============================================================
  let MERC = window.MERCADO;
  function indicadoresSeries() {
    const out = [];
    const ip = S.ipc, n = ip.fechas.length;
    if (n) out.push({ id: "ipc", nombre: "IPC anual", texto: fN(ip.inflacion[n - 1], 2) + " %", fecha: M.aTexto(ip.fechas[n - 1]), detalle: "Inflación total anual (base de IPC)", fuente: S.origen.ipc });
    const u = S.uvr; let f = hoy; if (!u.mapa.has(f)) f = u.fechas[u.fechas.length - 1];
    if (u.mapa.has(f)) out.push({ id: "uvr", nombre: f === hoy ? "UVR hoy" : "UVR", texto: fN(u.mapa.get(f), 4), fecha: M.aTexto(f), detalle: "Valor diario de la UVR", fuente: S.origen.uvr });
    const b = S.ibr, m = b.fechas.length;
    if (m) {
      const ult = c => { for (let i = m - 1; i >= 0; i--) if (b[c][i] != null) return [b[c][i], b.fechas[i]]; return [NaN, NaN]; };
      const on = ult("overnight");
      out.push({ id: "ibr", nombre: "IBR overnight", texto: fN(on[0], 3) + " %", fecha: M.aTexto(on[1]), detalle: "Nominal anual · último dato en la base", fuente: S.origen.ibr });
    }
    return out;
  }
  function textoInd(x) {
    if (x.texto) return x.texto;
    if (x.unidad === "cop") return "$ " + fN(x.valor, 2);
    if (x.unidad === "pct") return fN(x.valor, 2) + " %";
    if (x.unidad === "pct1") return fN(x.valor, 1) + " %";
    return fN(x.valor, 2);
  }
  function todosIndicadores() {
    const ext = (MERC && MERC.indicadores) || [];
    const orden = ["trm", "usdcop", "banrep", "fed"];
    const resto = ext.filter(x => !orden.includes(x.id)), fin = ["tes10", "desCol", "infUsa", "desUsa"];
    resto.sort((a, b) => (fin.indexOf(a.id) + 99) % 99 - (fin.indexOf(b.id) + 99) % 99);
    return ext.filter(x => orden.includes(x.id)).sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id)).concat(indicadoresSeries(), resto);
  }
  function pintarCinta() {
    $("#cinta").innerHTML = '<div class="cinta-in">' + todosIndicadores().map(x => '<button class="tick" data-tick title="' + esc(x.detalle || "") + '"><span class="tick-l">' + esc(x.nombre) +
      '</span><span class="tick-v">' + esc(textoInd(x)) + '</span><span class="tick-f">' + esc(x.fecha ? fF(M.aDia(x.fecha)) : "") + "</span></button>").join("") + "</div>";
  }
  function pintarPanelMercado() {
    const ind = todosIndicadores();
    const local = location.protocol === "file:";
    const notas = (MERC && MERC.noticias) || [];
    const grupo = amb => notas.filter(n => n.ambito === amb).map(n => '<a class="noticia" href="' + esc(n.url) + '" target="_blank" rel="noopener"><span class="noticia-t">' + esc(n.titulo) +
      '</span><span class="noticia-m">' + esc(n.fuente) + " · " + esc(fF(M.aDia(n.fecha))) + "</span></a>").join("") || '<p class="nota">Sin noticias por ahora.</p>';
    return '<div><h4>Indicadores</h4>' + ind.map(x => '<div class="ind"><span class="ind-n">' + esc(x.nombre) + '</span><span class="ind-v">' + esc(textoInd(x)) + '</span><span class="ind-d">' +
      esc((x.detalle || "") + (x.fecha ? " · " + fF(M.aDia(x.fecha)) : "")) + (x.url ? ' · <a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.fuente) + "</a>" : x.fuente ? " · " + esc(x.fuente) : "") + "</span></div>").join("") +
      '<p class="nota">Actualizado el ' + esc(fF(M.aDia(MERC.actualizado || M.aTexto(hoy)))) + ". " + (local ? "En esta copia local puedes traer la TRM en vivo desde datos.gov.co." : /github\.io$/.test(location.hostname) ? "Se actualiza automáticamente dos veces al día." : "") + "</p>" +
      (local ? '<div style="margin-top:8px"><button class="btn mini" data-trmvivo>Traer TRM en vivo</button></div>' : "") +
      "</div>" + htmlDeudaPublica() + '<div><h4>Noticias de Colombia</h4>' + grupo("Colombia") + '</div><div><h4>Noticias del mundo</h4>' + grupo("Mundo") + "</div>";
  }
  // Deuda pública local: tasas cero cupón de los TES que publica el Banco de la República
  function htmlDeudaPublica() {
    const T = MERC && MERC.tes;
    if (!T || !Array.isArray(T.pesos)) return "";
    const X = T.plazos || [1, 5, 10], pb = (a, b) => a == null || b == null ? "" : ' <small style="color:var(--dim)">' + (a - b >= 0 ? "+" : "−") + fN(Math.abs(a - b) * 100, 0) + " pb</small>";
    const filas = X.map((x, i) => '<tr><td class="t">' + x + (x === 1 ? " año" : " años") + '</td><td class="n">' + esc(fN(T.pesos[i], 2)) + " %" + (T.mes ? pb(T.pesos[i], T.mes.pesos[i]) : "") +
      '</td><td class="n">' + esc(fN(T.uvr[i], 2)) + " %" + (T.mes ? pb(T.uvr[i], T.mes.uvr[i]) : "") + "</td></tr>").join("");
    const ba = T.bidask ? '<div class="ind"><span class="ind-n">Bid-ask spread de los TES</span><span class="ind-v">' + esc(fN(T.bidask.pesos, 2)) + " · " + esc(fN(T.bidask.uvr, 2)) + '</span><span class="ind-d">Pesos · UVR. Diferencia entre las puntas de compra y de venta: entre más baja, más líquido el mercado · ' +
      esc(fF(M.aDia(T.bidask.fecha))) + ' · <a href="' + esc(T.bidask.url) + '" target="_blank" rel="noopener">Banco de la República</a></span></div>' : "";
    return '<div><h4>Deuda pública local (TES)</h4><div class="tabla-w"><table><thead><tr><th class="t">Tasa cero cupón</th><th>TES en pesos</th><th>TES en UVR</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
      '<p class="nota">Datos del ' + esc(fF(M.aDia(T.fecha))) + (T.mes ? "; en pequeño, el cambio frente al " + esc(fF(M.aDia(T.mes.fecha))) : "") + '. Fuente: <a href="' + esc(T.url) + '" target="_blank" rel="noopener">Banco de la República</a>. La curva se ve en la pestaña Gráficos de cada calculadora.</p>' + ba + "</div>";
  }
  async function trmEnVivo(avisar) {
    try {
      const r = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1");
      const j = await r.json();
      if (!j || !j[0]) throw new Error("sin datos");
      const x = MERC.indicadores.find(i => i.id === "trm");
      x.valor = Number(j[0].valor); x.fecha = String(j[0].vigenciadesde).slice(0, 10);
      x.detalle = "Vigente desde el " + fF(M.aDia(x.fecha)) + " (consulta en vivo)"; x.fuente = "datos.gov.co"; x.url = "https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-TRM/32sa-8pi3";
      pintarCinta(); if (PANEL === "mercado") abrirPanel("mercado");
      if (avisar) toast("TRM actualizada: $ " + fN(x.valor, 2));
    } catch (e) { if (avisar) toast("No se pudo consultar la TRM. Revisa tu conexión."); }
  }

  // =============================================================
  // PANEL DE DATOS (cargar Excel del Banco de la República)
  // =============================================================
  function resumenBase(k) {
    try {
      if (k === "ipc") { const n = S.ipc.fechas.length; return n + " meses · último " + fF(S.ipc.fechas[n - 1]) + ": " + fN(S.ipc.inflacion[n - 1], 2) + " %"; }
      if (k === "uvr") return fF(S.uvr.fechas[0]) + " a " + fF(S.uvr.fechas[S.uvr.fechas.length - 1]);
      if (k === "ibr") { const n = S.ibr.fechas.length; return n + " días · último " + fF(S.ibr.fechas[n - 1]); }
      if (k === "curvas") return S.curvas.map(c => c.nombre + " (" + fF(c.fechas[0]) + " a " + fF(c.fechas[c.fechas.length - 1]) + ")").join(" · ");
      if (k === "pron") { const n = S.pron.fechas.length; return n ? n + " meses · " + fFcorta(S.pron.fechas[0]) + " a " + fFcorta(S.pron.fechas[n - 1]) : "Vacío"; }
      if (k === "cc") return S.cc.x.length + " puntos · " + (S.cc.tipo === "plazo" ? "plazos " + fN(S.cc.x[0], 2) + " a " + fN(S.cc.x[S.cc.x.length - 1], 2) + " años" : "por fecha");
    } catch (e) { return "Sin datos"; }
  }
  const BASES = [
    ["ipc", "IPC", "Excel del Banco de la República con la hoja «Datos»: Fecha, Meta, Inflación total anual."],
    ["uvr", "UVR", "Excel del Banco de la República con la hoja «Datos»: Fecha y valor diario de la UVR."],
    ["ibr", "IBR", "Excel del Banco de la República con la hoja «Datos»: Fecha, overnight, 1, 3, 6 y 12 meses."],
    ["curvas", "Curvas FR", "IBR que el mercado espera para cada fecha futura; se usa para proyectar los cupones de los bonos IBR. Una curva por hoja: Fecha y Tasa nominal anual. El nombre de la hoja es el nombre de la curva."],
    ["pron", "Pronóstico de IPC", "Inflación anual esperada para los meses que aún no se publican; se usa en la rentabilidad estimada de IPC. Primera hoja: Fecha (cualquier día del mes) e IPC anual."],
    ["cc", "Curva cero cupón", "Tasa de descuento para cada plazo; se usa en Tasa Fija al descontar con «Curva CC + spread». Primera hoja: Plazo en años (o Fecha) y Tasa EA."]
  ];
  function pintarPanelDatos() {
    return '<p class="nota" style="margin:0">Las bases vienen cargadas. Sube un Excel nuevo para reemplazar una; el cambio aplica a todas las calculadoras mientras la página esté abierta.</p>' +
      BASES.map(b => '<div class="base"><div class="base-t"><b>' + esc(b[1]) + '</b><span class="chip ' + (S.origen[b[0]] === ETIQUETA_ORIGINAL[b[0]] ? "" : "acc") + '">' + esc(S.origen[b[0]]) + "</span></div>" +
        '<p class="num" style="color:var(--fg)">' + esc(resumenBase(b[0])) + "</p><p>" + esc(b[2]) + '</p><div class="fila-b"><span class="btn mini archivo">' + ICON.subir + ' Cargar Excel<input type="file" accept=".xlsx,.xls" data-base="' + b[0] + '" aria-label="Cargar Excel de ' + esc(b[1]) + '"></span>' +
        (b[0] === "cc" && MERC.tes && S.origen.cc.indexOf("TES") !== 0 ? '<button class="btn mini" data-cc-tes>Usar la curva TES del Banco de la República</button>' : "") +
        (S.origen[b[0]] === ETIQUETA_ORIGINAL[b[0]] ? "" : '<button class="btn mini" data-restaurar="' + b[0] + '">Restaurar original</button>') + '<span class="nota" data-estado="' + b[0] + '" style="margin:0"></span></div></div>').join("");
  }
  function usarCurvaTES() {
    const T = MERC.tes; if (!T) return;
    S.cc = { tipo: "plazo", x: (T.plazos || [1, 5, 10]).slice(), tasa: T.pesos.map(x => x / 100) };
    S.origen.cc = "TES en pesos del " + fF(M.aDia(T.fecha)) + " (Banco de la República)";
    abrirPanel("datos"); calcular(); toast("Curva cero cupón: TES en pesos");
  }
  document.addEventListener("change", async e => {
    const el = e.target; if (!el.dataset || !el.dataset.base || !el.files || !el.files[0]) return;
    const k = el.dataset.base, file = el.files[0], estado = $('[data-estado="' + k + '"]');
    if (estado) estado.textContent = "Leyendo…";
    try {
      if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel (requiere conexión a internet).");
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
      LECTORES[k](wb);
      S.origen[k] = file.name;
      abrirPanel("datos"); pintarCinta(); calcular();
      toast("Base de " + BASES.find(b => b[0] === k)[1] + " actualizada");
    } catch (err) { if (estado) estado.textContent = err.message; else toast(err.message); }
  });
  const filasHoja = ws => window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  function celdaFecha(c) {
    if (c == null) return NaN;
    if (typeof c === "number") return c > 20000 && c < 80000 ? Math.round(c) - 25569 : NaN;
    if (c instanceof Date) return M.aDia(c);
    const s = String(c).trim();
    let m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (m) return M.aDia(m[1] + "-" + m[2] + "-" + m[3]);
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) return M.aDia(m[3] + "-" + m[2] + "-" + m[1]);
    return NaN;
  }
  const celdaNum = c => typeof c === "number" ? c : c == null ? NaN : pNum(c);
  const hojaDatos = wb => wb.Sheets["Datos"] || wb.Sheets[wb.SheetNames[0]];
  const mediana = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
  function filasValidas(ws, minCols) {
    return filasHoja(ws).map(r => ({ f: celdaFecha(r[0]), r })).filter(x => isFinite(x.f) && x.r.length >= minCols).sort((a, b) => a.f - b.f);
  }
  function exigir(cond, msg) { if (!cond) throw new Error(msg); }
  const LECTORES = {
    ipc(wb) {
      const fs = filasValidas(hojaDatos(wb), 2).map(x => ({ f: x.f, v: celdaNum(x.r.length >= 3 && x.r[2] != null ? x.r[2] : x.r[1]) })).filter(x => isFinite(x.v));
      exigir(fs.length > 0, "El archivo de IPC no tiene el formato esperado (Fecha, Meta, Inflación total anual).");
      S.ipc = { fechas: fs.map(x => x.f), inflacion: fs.map(x => x.v) };
    },
    uvr(wb) {
      const fs = filasValidas(hojaDatos(wb), 2).map(x => ({ f: x.f, v: celdaNum(x.r[1]) })).filter(x => isFinite(x.v));
      exigir(fs.length > 0, "El archivo de UVR no tiene el formato esperado (Fecha, valor de la UVR).");
      S.uvr = serieUVR(fs.map(x => x.f), fs.map(x => x.v));
    },
    ibr(wb) {
      const fs = filasValidas(hojaDatos(wb), 6);
      exigir(fs.length > 0, "El archivo de IBR no tiene el formato esperado (Fecha + 5 series de IBR).");
      const col = j => fs.map(x => { const n = celdaNum(x.r[j]); return isFinite(n) ? n : null; });
      S.ibr = { fechas: fs.map(x => x.f), overnight: col(1), m1: col(2), m3: col(3), m6: col(4), m12: col(5) };
    },
    curvas(wb) {
      const out = [];
      wb.SheetNames.forEach(nombre => {
        const fs = filasValidas(wb.Sheets[nombre], 2).map(x => ({ f: x.f, v: celdaNum(x.r[1]) })).filter(x => isFinite(x.v) && x.f > 10957);
        if (!fs.length) return;
        const div = mediana(fs.map(x => x.v)) > 1 ? 100 : 1;
        const vistos = new Set(), ok = fs.map(x => ({ f: x.f, v: x.v / div })).filter(x => x.v > 0 && x.v < 1 && !vistos.has(x.f) && vistos.add(x.f));
        if (ok.length) out.push({ nombre, fechas: ok.map(x => x.f), tasas: ok.map(x => x.v) });
      });
      exigir(out.length > 0, "Ninguna hoja tiene el formato de curva (Fecha, Tasa).");
      S.curvas = out.sort((a, b) => a.fechas[0] - b.fechas[0]);
    },
    pron(wb) {
      const fs = filasValidas(wb.Sheets[wb.SheetNames[0]], 2).map(x => ({ fecha: x.f, valor: celdaNum(x.r[1]) })).filter(x => isFinite(x.valor));
      exigir(fs.length > 0, "El pronóstico no tiene el formato esperado (Fecha, IPC).");
      S.pron = M.seriePronostico(fs);
    },
    cc(wb) {
      const filas = filasHoja(wb.Sheets[wb.SheetNames[0]]).filter(r => r.length >= 2 && isFinite(celdaNum(r[1])) && r[0] != null && (isFinite(celdaNum(r[0])) || isFinite(celdaFecha(r[0]))));
      exigir(filas.length > 0, "La curva cero cupón debe tener dos columnas: Plazo (años) o Fecha, y Tasa EA.");
      const esFecha = filas.every(r => isFinite(celdaFecha(r[0])) && (typeof r[0] !== "number" || r[0] > 20000));
      let pts = filas.map(r => ({ x: esFecha ? celdaFecha(r[0]) : celdaNum(r[0]), y: celdaNum(r[1]) }));
      const div = mediana(pts.map(p => p.y)) > 1 ? 100 : 1;
      pts = pts.map(p => ({ x: p.x, y: p.y / div })).sort((a, b) => a.x - b.x);
      S.cc = { tipo: esFecha ? "fecha" : "plazo", x: pts.map(p => p.x), tasa: pts.map(p => p.y) };
    }
  };

  // =============================================================
  // PANEL LATERAL
  // =============================================================
  let PANEL = null;
  function abrirPanel(cual) {
    PANEL = cual;
    $("#velo").hidden = false; $("#panel").hidden = false;
    $("#panel-t").textContent = cual === "datos" ? "Datos de la calculadora" : "Mercado y noticias";
    $("#panel-b").innerHTML = cual === "datos" ? pintarPanelDatos() : pintarPanelMercado();
    $("#panel [data-cerrar]").focus();
  }
  function cerrarPanel() { if (!PANEL) return; PANEL = null; $("#velo").hidden = true; $("#panel").hidden = true; }
  $("#velo").addEventListener("click", cerrarPanel);

  // =============================================================
  // RECORRIDO GUIADO
  // =============================================================
  const PASOS = [
    { sel: "#nav-calcs", t: "Elige la calculadora", p: "Hay cuatro: Tasa Fija (TES), UVR, IPC e IBR. Todo lo de cada tipo de bono vive dentro de su botón. Al final está el Portafolio." },
    { sel: "#submodos", t: "Elige qué quieres hacer", p: "Cada calculadora tiene sus modos: valorar el bono, medir la rentabilidad de una compra y venta o, en IBR, comparar sendas de TIR." },
    { sel: "#formulario", t: "Escribe las condiciones", p: "Fechas, cupón, tasas y monto. Puedes escribir decimales con coma (13,6). El resultado se recalcula solo mientras escribes." },
    { sel: "#kpis", t: "Lee el resultado", p: "Arriba van las cifras clave: precio, TIR, valor de giro, P&G y el próximo cupón. Los montos se muestran completos y en miles, millones o miles de millones." },
    { sel: "#btn-agregar", t: "Guarda la compra", p: "Con «Agregar al portafolio» la posición queda guardada. En Portafolio ves el valor total, la duración, el DV01 y el carry neto, con o sin fondos prestados." },
    { sel: "#pestanas", t: "Revisa el detalle", p: "Flujos uno a uno; Gráficos, con la curva de los TES; Escenarios, un gráfico interactivo con el precio si las tasas se mueven hasta ±400 pb; y Riesgo, con duración, convexidad y DV01." },
    { sel: "#btn-datos", t: "Actualiza las bases", p: "IPC, UVR, IBR y curvas vienen cargados. Aquí puedes subir un Excel nuevo del Banco de la República o tus propias curvas." },
    { sel: "#cinta", t: "Mira el mercado", p: "TRM, dólar spot, tasas del Banco de la República y de la Fed, TES, IPC, UVR, IBR y desempleo. Toca la cinta para ver el detalle, la deuda pública y las noticias." }
  ];
  const guia = {
    activo: false, i: 0,
    iniciar() { cerrarPanel(); cerrarModal(); if (ST.calc === "port") irA("tf"); this.activo = true; this.i = 0; $("#foco").hidden = false; $("#guia").hidden = false; this.mostrar(); },
    fin() { this.activo = false; $("#foco").hidden = true; $("#guia").hidden = true; lsSet("rf_aviso_guia", "1"); const a = $("#aviso-guia"); if (a) a.hidden = true; },
    mostrar() {
      const p = PASOS[this.i], el = $(p.sel);
      if (!el) { this.i < PASOS.length - 1 ? (this.i++, this.mostrar()) : this.fin(); return; }
      el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setTimeout(() => this.ubicar(el), 260);
      $("#guia").innerHTML = '<div class="guia-n">' + (this.i + 1) + " de " + PASOS.length + "</div><h3>" + esc(p.t) + "</h3><p>" + esc(p.p) + '</p><div class="guia-b"><button class="btn" id="g-salir">Salir</button>' +
        (this.i ? '<button class="btn" id="g-ant">Anterior</button>' : "") + '<button class="btn pri" id="g-sig">' + (this.i === PASOS.length - 1 ? "Terminar" : "Siguiente") + "</button></div>";
      $("#g-salir").onclick = () => this.fin();
      if ($("#g-ant")) $("#g-ant").onclick = () => { this.i--; this.mostrar(); };
      $("#g-sig").onclick = () => { if (this.i === PASOS.length - 1) this.fin(); else { this.i++; this.mostrar(); } };
      $("#g-sig").focus();
    },
    ubicar(el) {
      const r = el.getBoundingClientRect(), f = $("#foco"), g = $("#guia"), pad = 6;
      const top = Math.max(4, r.top - pad), alto = Math.min(window.innerHeight - 8, r.height + 2 * pad);
      Object.assign(f.style, { left: (r.left - pad) + "px", top: top + "px", width: (r.width + 2 * pad) + "px", height: alto + "px" });
      const gh = g.offsetHeight, gw = g.offsetWidth;
      let gt = top + alto + 12; if (gt + gh > window.innerHeight - 8) gt = Math.max(8, top - gh - 12);
      if (gt + gh > window.innerHeight - 8 || gt < 8) gt = window.innerHeight - gh - 16;
      const gl = Math.min(Math.max(16, r.left), window.innerWidth - gw - 16);
      Object.assign(g.style, { top: gt + "px", left: gl + "px" });
    }
  };
  window.addEventListener("resize", () => { if (guia.activo) guia.ubicar($(PASOS[guia.i].sel)); });

  // =============================================================
  // ICONOS Y ARRANQUE
  // =============================================================
  const ICON = {
    bajar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"/></svg>',
    subir: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 11V3m0 0 3 3M8 3 5 6M3 13h10"/></svg>'
  };
  function arrancar() {
    const h = desdeHash();
    if (h) { ST.calc = h[0]; if (h[1]) ST.modo[h[0]] = h[1]; }
    pintarCinta();
    if (ST.calc === "port") irA("port"); else { pintarNav(); pintarForm(); calcular(); }
    if (lsGet("rf_aviso_guia") === "1") $("#aviso-guia").hidden = true;
    window.addEventListener("hashchange", () => { const x = desdeHash(); if (x && (x[0] !== ST.calc || (x[1] && x[1] !== ST.modo[x[0]]))) irA(x[0], x[1]); });
    if (location.protocol === "file:") trmEnVivo(false);
    conectarCapacidades();
  }
  async function conectarCapacidades() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    try {
      NS_DESCARGAS = await window.claude.use("downloads");
      if (!NS_DESCARGAS) { DESCARGAS = false; if (ST.calc === "port") pintarPortafolio(); else if (ULTIMO) pintarResultados(ULTIMO); }
    } catch (e) { DESCARGAS = false; }
    try {
      const db = await window.claude.use("db");
      if (!db) return;
      db.doc("mercado/indicadores").onSnapshot(snap => {
        if (!snap.exists) return;
        const d = snap.data();
        if (d && Array.isArray(d.indicadores)) {
          MERC = { actualizado: d.actualizado || MERC.actualizado, indicadores: d.indicadores, noticias: Array.isArray(d.noticias) ? d.noticias : MERC.noticias, tes: d.tes || MERC.tes };
          pintarCinta(); if (PANEL === "mercado") abrirPanel("mercado");
        }
      }, () => { /* se queda con los datos incluidos */ });
    } catch (e) { /* sin base: datos incluidos */ }
  }
  arrancar();
})();
