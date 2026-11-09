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
    ibr: "Banco de la República · " + (RAW.generado || ""), curvas: "Curvas del profesor", pron: "Pronóstico del profesor (ejemplo)", cc: "Curva de ejemplo"
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
        { id: "base", l: "Base de los cupones", tipo: "sel", op: [["365", "Días reales / 365"], ["30_360", "30/360"]], v: "365" },
        { id: "diasTir", l: "Días para la TIR", tipo: "sel", op: [["reales", "Reales"], ["sin_feb29", "365 sin 29 feb."]], v: "reales" }] }
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
  // Barras de flujos de una operación (en pesos)
  function graficoFlujos(filas, titulo) {
    const vals = filas.map(f => f.valor);
    let ymin = Math.min(0, Math.min.apply(null, vals)), ymax = Math.max(0, Math.max.apply(null, vals));
    const pad = (ymax - ymin) * 0.08; ymax += pad; if (ymin < 0) ymin -= pad;
    const n = filas.length, bw = Math.max(3, Math.min(34, (W - ML - MR) / n * 0.62));
    const sx = i => ML + (i + 0.5) * (W - ML - MR) / n;
    const sy = y => H - MB - (y - ymin) / (ymax - ymin || 1) * (H - MT - MB);
    const ys = ticks(ymin, ymax, 5);
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
    return { titulo: titulo || "Flujos de la operación", sub: "En pesos; pasa el cursor sobre cada barra", svg: '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Flujos de caja">' + s + "</svg>",
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

  // Bloque de riesgo (duración, convexidad, DV01, sensibilidad)
  function bloqueRiesgo(rg, op) {
    op = op || {};
    const u = op.uvr, k = op.uvrPesos || 1;
    const dvPos = u ? fUVR(rg.dv01Pesos) : fPesos(rg.dv01Pesos, 0);
    let html = '<div class="tarjeta-b"><div class="mini-g">' +
      mini("Duración de Macaulay", fN(rg.macaulay, 4) + " años") +
      mini("Duración modificada", fN(rg.modificada, 4), "Truncada: " + fN(rg.modificadaTrunc, 3)) +
      mini("Convexidad", fN(rg.convexidad, 4)) +
      mini("DV01 de la posición", dvPos, u ? "En pesos: " + fPesos(op.dv01PesosRegla, 0) : "Por 100: " + fN(rg.dv01, 6)) +
      "</div>" +
      '<p class="nota">DV01 = duración modificada truncada a 3 decimales ÷ 10.000 × valor de giro: lo que cambia el valor de la posición por cada punto básico. ' +
      "Las aproximaciones parten del precio sucio truncado (" + fN(rg.precioActual, 3) + ").</p></div>";
    const pb = rg.cambioPb;
    const filas100 = [
      { esc: "Tasa +" + pb + " pb", ex: rg.sube.exacto, d: rg.sube.duracion, dc: rg.sube.durConv },
      { esc: "Tasa −" + pb + " pb", ex: rg.baja.exacto, d: rg.baja.duracion, dc: rg.baja.durConv }
    ];
    const idA = "riesgo100-" + ST.calc, idB = "sens-" + ST.calc;
    const hA = tabla(idA, "Precio con ±" + pb + " pb", [
      { n: "Escenario", k: "esc", t: true }, { n: "Precio exacto", k: "ex", f: x => fN(x, 4) },
      { n: "Solo duración", k: "d", f: x => fN(x, 4) }, { n: "Duración + convexidad", k: "dc", f: x => fN(x, 4) }], filas100);
    html += barraTabla(idA) + hA;
    const cols = [
      { n: "Cambio", k: "pb", f: x => (x > 0 ? "+" : "") + fN(x, 0) + " pb", csv: f => f.pb },
      { n: op.etiquetaTasa || "Tasa", k: "tasa", f: x => fPct(x, 3) },
      { n: "Precio exacto", k: "precioExacto", f: x => fN(x, 4) },
      { n: u ? "Cambio valor (UVR)" : "Cambio valor posición", k: "cambioValor", f: x => u ? fUVR(x) : fPesos(x, 0) },
      { n: u ? "DV01 (UVR)" : "DV01 posición", k: "dv01Pesos", f: x => u ? fUVR(x) : fPesos(x, 0) }];
    if (u) cols.push({ n: "Cambio valor ($)", h: f => esc(fPesos(f.cambioValor * k, 0)), csv: f => f.cambioValor * k },
                     { n: "DV01 ($)", h: f => esc(fPesos(f.dv01Pesos * k, 0)), csv: f => f.dv01Pesos * k });
    const hB = tabla(idB, "Sensibilidad de −400 a +400 pb", cols, rg.sensibilidad, f => f.pb === 0 ? "fila-cero" : "");
    html += barraTabla(idB) + hB;
    return html;
  }
  const mini = (l, v, s) => '<div class="mini"><div class="kpi-l">' + esc(l) + '</div><div class="kpi-v">' + esc(v) + "</div>" + (s ? '<div class="kpi-s">' + esc(s) + "</div>" : "") + "</div>";
  const kpi = (l, v, s, extra) => Object.assign({ l, v, s }, extra || {});
  const conTabla = (id, html) => barraTabla(id) + html;

  // =============================================================
  // CÁLCULOS POR CALCULADORA (devuelven el modelo de la vista)
  // =============================================================
  const CALC = {};
  const req = (v, id, k) => { const c = campoDef(k, id); return falta(c.tipo === "pct" ? pPct(v[id]) : c.tipo === "dinero" ? pDinero(v[id]) : c.tipo === "num" ? pNum(v[id]) : v[id], c.l); };

  CALC.tf_valorar = v => {
    const k = "tf_valorar", per = +v.periodo, nominal = req(v, "nominal", k), curva = v.metodo === "curva";
    const tasa = curva ? NaN : req(v, "tasa", k);
    const r = M.precioTasaFija({ emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: per,
      tasaMercado: curva ? 0.1 : tasa, fechaNegociacion: req(v, "fecha", k), curvaCC: curva ? S.cc : null, spreadPb: curva ? req(v, "spread", k) : 0 });
    const y = curva ? r.tirEquivalente : tasa;
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa: y, periodo: per, precioActual: r.precioSucioTruncado, factor: nominal / 100, tasasFlujo: r.tasas });
    const giro = r.precioSucioTruncado / 100 * nominal;
    const kp = [
      kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
      kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion),
      kpi("Interés corrido", fN(r.interesCorrido, 6), "Por cada 100 de nominal"),
      kpi("Valor de giro", fPesos(giro), compacto(giro) + " de pesos")
    ];
    if (curva) kp.push(kpi("TIR equivalente", fPct(y, 4), "Tasa única que da el mismo precio"));
    const idF = "flujos-tf";
    const filas = r.fechas.map((f, i) => ({ fecha: f, dias: r.dias[i], t: r.t[i], tasa: r.tasas ? r.tasas[i] : y, flujo: r.flujos[i], vp: r.vp[i] }));
    const tf = tabla(idF, "Flujos por cada 100 de nominal", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) }, { n: "t (años)", k: "t", f: x => fN(x, 4) },
      { n: curva ? "Tasa curva + spread" : "Tasa", k: "tasa", f: x => fPct(x, 4) }, { n: "Flujo", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }], filas);
    return {
      kpis: kp,
      avisos: curva ? [{ tipo: "info", html: "Cada flujo se descuenta con la tasa cero cupón de su plazo (interpolación lineal) más <b>" + fN(pNum(v.spread), 0) + " pb</b>. Curva: " + esc(S.origen.cc) + "." }] : [],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa: y, tasas: r.tasas, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(idF, tf) }, { id: "riesgo", n: "Riesgo y sensibilidad", html: bloqueRiesgo(rg) }]
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
    const r = M.operacionTasaFija({ emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: +v.periodo,
      fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN, precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN,
      fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta, tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN, montoPesos: monto });
    const f = monto / 100, n = r.flujos.length;
    r.alVencimiento = !!r.venta.vencimiento;
    const filas = r.flujos.map((x, i) => ({ concepto: i === 0 ? "Compra" : i === n - 1 ? (r.alVencimiento ? "Vencimiento" : "Venta") : "Cupón " + i, fecha: x.fecha, dias: x.dias, valor: x.monto * f }));
    const id = "op-tf";
    const avisos = [];
    if (r.mensajeTir) avisos.push({ tipo: "err", html: esc(r.mensajeTir) });
    return {
      kpis: kpisOperacion(r.tir, r),
      avisos,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.compra.precio, 3), "Limpio: " + fN(r.compra.limpio, 3)) +
        mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.venta.precio, 3), "Limpio: " + fN(r.venta.limpio, 3)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "Días", k: "dias", f: x => fN(x, 0) }])) }]
    };
  };

  CALC.uvr_valorar = v => {
    const k = "uvr_valorar", per = +v.periodo, tasa = req(v, "tasa", k);
    const r = M.precioUVR({ emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: per, tasaMercado: tasa,
      fechaNegociacion: req(v, "fecha", k), serieUVR: S.uvr, nominal: req(v, "nominal", k), nominalEn: v.nominalEn });
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa, periodo: per, precioActual: r.precioSucioTruncado, factor: r.nominalUVR / 100 });
    const dvPesos = rg.modificadaTrunc / 1e4 * r.valorGiro;
    const idF = "flujos-uvr";
    const filas = r.fechas.map((f, i) => ({ fecha: f, dias: r.dias[i], flujo: r.flujos[i], vp: r.vp[i], flujoUVR: r.flujos[i] / 100 * r.nominalUVR }));
    const tf = tabla(idF, "Flujos (por 100 y de la posición en UVR)", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) },
      { n: "Flujo por 100", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }, { n: "Flujo posición", k: "flujoUVR", f: x => fUVR(x) }], filas);
    return {
      kpis: [
        kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
        kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion + " · IC " + fN(r.interesCorrido, 6)),
        kpi("UVR del día", fN(r.uvr, 4), fF(M.aDia(v.fecha))),
        kpi("Valor de giro en pesos", fPesos(r.valorGiro), compacto(r.valorGiro) + " de pesos"),
        kpi("Valor de giro en UVR", fUVR(r.valorGiroUVR), "Nominal: " + fUVR(r.nominalUVR))
      ],
      avisos: [],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(idF, tf) },
             { id: "riesgo", n: "Riesgo y sensibilidad", html: bloqueRiesgo(rg, { uvr: true, uvrPesos: r.uvr, dv01PesosRegla: dvPesos, etiquetaTasa: "Tasa UVR" }) }]
    };
  };

  CALC.uvr_rent = v => {
    const k = "uvr_rent";
    const r = M.rentabilidadUVR({ tipo: v.tipo, emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), tasaCupon: req(v, "tasaCupon", k), periodo: +v.periodo,
      fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN, precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN,
      fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta, tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN,
      serieUVR: S.uvr, serieIPC: S.ipc, nominal: req(v, "nominal", k), nominalEn: v.nominalEn, diasTir: v.diasTir });
    const filas = r.tabla.map(x => ({ concepto: x.concepto, fecha: x.fecha, uvr: x.uvr, valorUVR: x.valorUVR, valor: x.valorPesos }));
    const id = "op-uvr";
    const kp = kpisOperacion(r.tirPesos, r, "TIR en pesos", v.tipo === "real" ? "Con la UVR publicada" : "Con la UVR proyectada");
    kp.splice(1, 0, kpi("TIR en UVR", fPct(r.tirUVR, 4), "Sin el efecto de la inflación"));
    const avisos = [];
    if (v.tipo === "estimada") avisos.push({ tipo: "info", html: "La UVR después de la compra se proyecta con el IPC vigente a la compra: <b>" + fPct(r.inflacionSupuesta, 2) + "</b> anual." });
    const ultUVR = S.uvr.fechas[S.uvr.fechas.length - 1];
    if (v.tipo === "real" && M.aDia(v.fechaVenta) > ultUVR) avisos.push({ tipo: "warn", html: "La serie de UVR llega al " + fF(ultUVR) + "; actualízala en Datos." });
    return {
      kpis: kp, avisos,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.precioCompra, 3), "Limpio: " + fN(r.limpioCompra, 3)) + mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.precioVenta, 3), "Limpio: " + fN(r.limpioVenta, 3)) +
        mini("UVR a la compra", fN(r.uvrCompra, 4)) + mini(r.alVencimiento ? "UVR al vencimiento" : "UVR a la venta", fN(r.uvrVenta, 4)) + mini("Nominal en UVR", fUVR(r.nominalUVR)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "UVR", k: "uvr", f: x => fN(x, 4) }, { n: "Valor en UVR", k: "valorUVR", f: x => fUVR(x) }])) }]
    };
  };

  CALC.ipc_valorar = v => {
    const k = "ipc_valorar", per = +v.periodo, monto = req(v, "monto", k);
    const r = M.precioIPC({ emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), periodo: per, spread: req(v, "spread", k), modoIPC: v.modoIPC,
      tasaMercado: req(v, "tasa", k), tipoTasa: v.tipoTasa, fechaNegociacion: req(v, "fecha", k), serie: S.ipc, montoPesos: monto });
    const rg = M.riesgo({ flujos: r.flujos, t: r.t, tasa: r.tasaDescuento, periodo: per, precioActual: r.precioSucioTruncado, factor: monto / 100 });
    const filas = r.filas.map((x, i) => ({ fecha: x.fecha, dias: r.dias[i], ipc: x.ipc, fechaIpc: x.fechaIpc, tasa: x.tasa, flujo: r.flujos[i], vp: r.vp[i] }));
    const id = "flujos-ipc";
    const tf = tabla(id, "Flujos por cada 100 de nominal", [
      { n: "Fecha", k: "fecha", f: fF, t: true, esFecha: true }, { n: "Días", k: "dias", f: x => fN(x, 0) },
      { n: "IPC usado", k: "ipc", f: x => fPct(x, 2) }, { n: "Dato del", k: "fechaIpc", f: fF, esFecha: true },
      { n: "Tasa cupón", k: "tasa", f: x => fPct(x, 4) }, { n: "Flujo", k: "flujo", f: x => fN(x, 6) }, { n: "Valor presente", k: "vp", f: x => fN(x, 6) }], filas);
    return {
      kpis: [
        kpi("Precio sucio", fN(r.precioSucioTruncado, 3), "Exacto: " + fN(r.precioSucio, 6), { prin: true }),
        kpi("Precio limpio", fN(r.precioLimpio, 3), r.clasificacion),
        kpi("Interés corrido", fN(r.interesCorrido, 6), "Por cada 100 de nominal"),
        kpi("Valor de giro", fPesos(r.valorGiro), compacto(r.valorGiro) + " de pesos"),
        kpi("Tasa de descuento", fPct(r.tasaDescuento, 4), "IPC vigente " + fPct(r.ipcNegociacion.valor, 2) + " (" + fFcorta(r.ipcNegociacion.fecha) + ")")
      ],
      avisos: [{ tipo: "info", html: "Los cupones futuros usan el IPC vigente a la negociación (" + fPct(r.ipcNegociacion.valor, 2) + "). Último IPC en la base: " + fF(r.ultimoIPC) + "." }],
      graf: graficoPrecioTasa({ flujos: r.flujos, t: r.t, tasa: r.tasaDescuento, precioActual: r.precioSucioTruncado, dmod: rg.modificada, conv: rg.convexidad }),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tf) }, { id: "riesgo", n: "Riesgo y sensibilidad", html: bloqueRiesgo(rg, { etiquetaTasa: "Tasa EA" }) }]
    };
  };

  CALC.ipc_rent = v => {
    const k = "ipc_rent";
    const r = M.rentabilidadIPC({ tipo: v.tipo, emision: req(v, "emision", k), vencimiento: req(v, "vencimiento", k), periodo: +v.periodo, spread: req(v, "spread", k), modoIPC: v.modoIPC,
      fechaCompra: req(v, "fechaCompra", k), modoCompra: v.modoCompra, tasaCompra: v.modoCompra === "tasa" ? req(v, "tasaCompra", k) : NaN, tipoTasaCompra: v.tipoTasaCompra,
      precioCompra: v.modoCompra === "precio" ? req(v, "precioCompra", k) : NaN,
      fechaVenta: req(v, "fechaVenta", k), modoVenta: v.modoVenta, tasaVenta: v.modoVenta === "tasa" ? req(v, "tasaVenta", k) : NaN, tipoTasaVenta: v.tipoTasaVenta,
      precioVenta: v.modoVenta === "precio" ? req(v, "precioVenta", k) : NaN,
      serie: S.ipc, montoPesos: req(v, "monto", k), diasTir: v.diasTir, base: v.base,
      pronostico: v.tipo === "estimada" && v.usarPron ? S.pron : null });
    const filas = r.tabla.map((x, i) => ({ concepto: x.concepto, fecha: x.fecha, fechaRef: x.fechaRef, ipc: x.ipc, tasa: i > 0 && i < r.tabla.length - 1 ? r.cupones[i - 1].tasa : NaN, valor: x.valor }));
    const id = "op-ipc";
    const avisos = [];
    if (r.mensajeTir) avisos.push({ tipo: "err", html: esc(r.mensajeTir) });
    if (v.tipo === "estimada") avisos.push({ tipo: "info", html: r.conPronostico ? "IPC conocido hasta la compra y, después del último dato, el pronóstico (" + esc(S.origen.pron) + ")." : "Solo se usa el IPC conocido a la fecha de compra: los cupones siguientes repiten el IPC vigente." });
    return {
      kpis: kpisOperacion(r.tir, r, "TIR de la operación", (v.tipo === "real" ? "Real" : "Estimada") + " · efectiva anual"),
      avisos,
      extra: '<div class="mini-g">' + mini("Precio de compra", fN(r.precioCompra, 3), "Limpio: " + fN(r.limpioCompra, 3)) + mini(r.alVencimiento ? "Precio al vencimiento" : "Precio de venta", fN(r.precioVenta, 3), "Limpio: " + fN(r.limpioVenta, 3)) +
        mini("IPC a la compra", fPct(r.ipcCompra.valor, 2), fF(r.ipcCompra.fecha)) + mini("IPC a la venta", fPct(r.ipcVenta.valor, 2), fF(r.ipcVenta.fecha)) + "</div>",
      graf: graficoFlujos(filas),
      tabs: [{ id: "flujos", n: "Flujos", html: conTabla(id, tablaOperacion(id, filas, [{ n: "Fecha del IPC", k: "fechaRef", f: fF, esFecha: true }, { n: "IPC", k: "ipc", f: x => fPct(x, 2) }, { n: "Tasa cupón", k: "tasa", f: x => fPct(x, 4) }])) }]
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

  CALC.ibr_rent = v => {
    const a = argsIBR(v), r = M.rentabilidadIBR(a);
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
    let graf = graficoFlujos(filas);
    if (r.riesgoBase) {
      const b = r.riesgoBase, rg = M.riesgo({ flujos: b.flujos, t: b.t, tasa: b.tasa, periodo: a.periodo, precioActual: r.precioCompra, factor: a.montoPesos / 100 });
      tabs.push({ id: "riesgo", n: "Riesgo y sensibilidad", html: bloqueRiesgo(rg, { etiquetaTasa: "TIR EA" }) +
        '<div class="tarjeta-b"><p class="nota" style="margin:0">Riesgo a la fecha de compra con los flujos proyectados y ' + (b.origen === "implicita" ? "la TIR implícita en el precio de compra (" : "la tasa de descuento de la negociación (") + esc(fPct(b.tasa, 4)) + ").</p></div>" });
    }
    return {
      kpis: [
        kpi("TIR de la operación", fPct(r.tir, 4), (v.tipo === "real" ? "Real" : "Proyectada") + " · IBR " + r.tenor, { prin: true }),
        kpi("Precio de compra", fN(r.precioCompra, 3), "Cupón corrido " + fN(r.cuponCorridoCompra, 6) + " · limpio " + fN(r.limpioCompra, 3)),
        kpi("Valor de giro (compra)", fPesos(r.giroCompra), compacto(r.giroCompra) + " de pesos"),
        r.alVencimiento ? kpi("Al vencimiento", "Se mantiene", "Recibe el 100 % más el último cupón") :
          kpi("Valor de la venta", fPesos(r.valorVenta), "Precio " + fN(r.precioVenta, 3) + " · limpio " + fN(r.limpioVenta, 3)),
        kpi("Cupones recibidos", fPesos(r.cuponesPesos), compacto(r.cuponesPesos)),
        kpi("Pérdidas y ganancias", fPesos(r.pygPesos), compacto(r.pygPesos), { cls: r.pygPesos >= 0 ? "pos" : "neg" })
      ],
      avisos, graf, tabs
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
      tabs: [{ id: "sendas", n: "Sendas", html: conTabla(id, tabla(id, "TIR por fecha de venta", cols, filas, f => elegida && f.fecha === elegida.fecha ? "marca-fila" : "")) }]
    };
  };

  // =============================================================
  // PINTAR RESULTADOS
  // =============================================================
  let ULTIMO = null;
  function calcular() {
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
    if (vista.graf) {
      const g = vista.graf;
      html += '<section class="tarjeta"><div class="tarjeta-c"><div><h3>' + esc(g.titulo) + '</h3><div class="sub">' + esc(g.sub || "") + '</div></div><div class="leyenda">' +
        (g.leyenda || []).map(l => '<span><i style="background:' + l[0] + '"></i>' + esc(l[1]) + "</span>").join("") + '</div></div><div class="tarjeta-b graf">' + g.svg + "</div></section>";
    }
    if (vista.tabs && vista.tabs.length) {
      const clave = ST.calc + "_" + ST.modo[ST.calc];
      let act = ST.pestana[clave];
      if (!vista.tabs.some(t => t.id === act)) act = vista.tabs[0].id;
      html += '<section class="tarjeta" id="pestanas"><div class="pestanas" role="tablist">' + vista.tabs.map(t => '<button role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === act) + '">' + esc(t.n) + "</button>").join("") + "</div>" +
        vista.tabs.map(t => '<div role="tabpanel" data-panel="' + t.id + '"' + (t.id === act ? "" : " hidden") + ">" + t.html + "</div>").join("") + "</section>";
    }
    R.innerHTML = html;
  }

  // =============================================================
  // NAVEGACIÓN
  // =============================================================
  function pintarNav() {
    $("#nav-calcs").innerHTML = Object.keys(CALCS).map(k => '<button class="calc-b" data-calc="' + k + '" aria-pressed="' + (ST.calc === k) + '">' + esc(CALCS[k].nombre) + "<small>" + esc(CALCS[k].corto) + "</small></button>").join("");
    const c = CALCS[ST.calc], md = modoActual();
    $("#cab").innerHTML = '<div><h1>' + esc(c.nombre) + " · " + esc(md.nombre) + "</h1><p>" + esc(md.desc) + '</p></div><div class="seg submodos" id="submodos" role="group" aria-label="Modo">' +
      c.modos.map(m => '<button data-modo="' + m.id + '" aria-pressed="' + (m.id === md.id) + '">' + esc(m.nombre) + "</button>").join("") + "</div>";
  }
  function irA(calc, modo) {
    ST.calc = calc;
    if (modo) ST.modo[calc] = modo;
    pintarNav(); pintarForm(); delete $("#resultados").dataset.ok; calcular();
    const h = "#" + calc + "-" + ST.modo[calc];
    if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) { location.hash = h; } }
  }
  function desdeHash() {
    const m = (location.hash || "").replace("#", "").split("-");
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
    if (b.dataset.seg) {
      const k = modoActual().form; ST.v[k][b.dataset.seg] = b.dataset.val; pintarForm(); calcular(); return;
    }
    if (b.dataset.tab) {
      ST.pestana[ST.calc + "_" + ST.modo[ST.calc]] = b.dataset.tab;
      const sec = b.closest("#pestanas");
      sec.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
      sec.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
      return;
    }
    if (b.dataset.csv) return descargar(b.dataset.csv);
    if (b.dataset.abrir) return abrirPanel(b.dataset.abrir);
    if (b.dataset.tick !== undefined) return abrirPanel("mercado");
    if (b.dataset.cerrar !== undefined) return cerrarPanel();
    if (b.dataset.restaurar) { restaurar(b.dataset.restaurar); pintarPanelDatos(); pintarCinta(); calcular(); return; }
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
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (guia.activo) guia.fin(); else cerrarPanel(); } });

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
      const on = ult("overnight"), t3 = ult("m3");
      out.push({ id: "ibr", nombre: "IBR overnight", texto: fN(on[0], 3) + " %", fecha: M.aTexto(on[1]), detalle: "Nominal anual · último dato en la base", fuente: S.origen.ibr });
      out.push({ id: "ibr3", nombre: "IBR 3 meses", texto: fN(t3[0], 3) + " %", fecha: M.aTexto(t3[1]), detalle: "Nominal anual · último dato en la base", fuente: S.origen.ibr });
    }
    return out;
  }
  function textoInd(x) {
    if (x.texto) return x.texto;
    if (x.unidad === "cop") return "$ " + fN(x.valor, 2);
    if (x.unidad === "pct") return fN(x.valor, 2) + " %";
    return fN(x.valor, 2);
  }
  function todosIndicadores() {
    const ext = (MERC && MERC.indicadores) || [];
    const orden = ["trm", "banrep", "fed"];
    return ext.filter(x => orden.includes(x.id)).concat(indicadoresSeries(), ext.filter(x => !orden.includes(x.id)));
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
      '</div><div><h4>Colombia</h4>' + grupo("Colombia") + '</div><div><h4>Mundo</h4>' + grupo("Mundo") + "</div>";
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
    ["curvas", "Curvas FR", "Una curva por hoja: Fecha y Tasa nominal anual. El nombre de la hoja es el nombre de la curva."],
    ["pron", "Pronóstico de IPC", "Primera hoja: Fecha (cualquier día del mes) e IPC anual pronosticado."],
    ["cc", "Curva cero cupón", "Primera hoja: Plazo en años (o Fecha) y Tasa cero cupón EA."]
  ];
  function pintarPanelDatos() {
    return '<p class="nota" style="margin:0">Las bases vienen cargadas. Sube un Excel nuevo para reemplazar una; el cambio aplica a todas las calculadoras mientras la página esté abierta.</p>' +
      BASES.map(b => '<div class="base"><div class="base-t"><b>' + esc(b[1]) + '</b><span class="chip ' + (S.origen[b[0]] === ETIQUETA_ORIGINAL[b[0]] ? "" : "acc") + '">' + esc(S.origen[b[0]]) + "</span></div>" +
        '<p class="num" style="color:var(--fg)">' + esc(resumenBase(b[0])) + "</p><p>" + esc(b[2]) + '</p><div class="fila-b"><span class="btn mini archivo">' + ICON.subir + ' Cargar Excel<input type="file" accept=".xlsx,.xls" data-base="' + b[0] + '" aria-label="Cargar Excel de ' + esc(b[1]) + '"></span>' +
        (S.origen[b[0]] === ETIQUETA_ORIGINAL[b[0]] ? "" : '<button class="btn mini" data-restaurar="' + b[0] + '">Restaurar original</button>') + '<span class="nota" data-estado="' + b[0] + '" style="margin:0"></span></div></div>').join("");
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
    { sel: "#nav-calcs", t: "Elige la calculadora", p: "Hay cuatro: Tasa Fija (TES), UVR, IPC e IBR. Todo lo de cada tipo de bono vive dentro de su botón." },
    { sel: "#submodos", t: "Elige qué quieres hacer", p: "Cada calculadora tiene sus modos: valorar el bono, medir la rentabilidad de una compra y venta o, en IBR, comparar sendas de TIR." },
    { sel: "#formulario", t: "Escribe las condiciones", p: "Fechas, cupón, tasas y monto. Puedes escribir decimales con coma (13,6). El resultado se recalcula solo mientras escribes." },
    { sel: "#kpis", t: "Lee el resultado", p: "Arriba van las cifras clave: precio, TIR, valor de giro y P&G. Los montos se muestran completos y en miles, millones o miles de millones." },
    { sel: "#pestanas", t: "Revisa el detalle", p: "Flujos uno a uno, riesgo (Macaulay, duración modificada, convexidad, DV01) y la tabla de sensibilidad. Cada tabla se descarga en CSV para Excel." },
    { sel: "#btn-datos", t: "Actualiza las bases", p: "IPC, UVR, IBR y curvas vienen cargados. Aquí subes el Excel nuevo del Banco de la República o la curva del profesor." },
    { sel: "#cinta", t: "Mira el mercado", p: "TRM, tasas del Banco de la República y de la Fed, IPC, UVR, IBR y desempleo. Toca la cinta para ver el detalle y las noticias." }
  ];
  const guia = {
    activo: false, i: 0,
    iniciar() { cerrarPanel(); this.activo = true; this.i = 0; $("#foco").hidden = false; $("#guia").hidden = false; this.mostrar(); },
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
    pintarCinta(); pintarNav(); pintarForm(); calcular();
    if (lsGet("rf_aviso_guia") === "1") $("#aviso-guia").hidden = true;
    window.addEventListener("hashchange", () => { const x = desdeHash(); if (x && (x[0] !== ST.calc || (x[1] && x[1] !== ST.modo[x[0]]))) irA(x[0], x[1]); });
    if (location.protocol === "file:") trmEnVivo(false);
    conectarCapacidades();
  }
  async function conectarCapacidades() {
    if (!window.claude || typeof window.claude.use !== "function") return;
    try {
      NS_DESCARGAS = await window.claude.use("downloads");
      if (!NS_DESCARGAS) { DESCARGAS = false; if (ULTIMO) pintarResultados(ULTIMO); }
    } catch (e) { DESCARGAS = false; }
    try {
      const db = await window.claude.use("db");
      if (!db) return;
      db.doc("mercado/indicadores").onSnapshot(snap => {
        if (!snap.exists) return;
        const d = snap.data();
        if (d && Array.isArray(d.indicadores)) {
          MERC = { actualizado: d.actualizado || MERC.actualizado, indicadores: d.indicadores, noticias: Array.isArray(d.noticias) ? d.noticias : MERC.noticias };
          pintarCinta(); if (PANEL === "mercado") abrirPanel("mercado");
        }
      }, () => { /* se queda con los datos incluidos */ });
    } catch (e) { /* sin base: datos incluidos */ }
  }
  arrancar();
})();
