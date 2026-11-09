/* =============================================================
 * MOTOR DE RENTA FIJA — traducción a JavaScript de los motores en R
 * validados contra los ejercicios del profesor.
 * Fechas: números de día (días desde 1970-01-01, UTC) para evitar
 * problemas de zona horaria. Tasas en decimal (0.1385 = 13,85%).
 * Funciona en el navegador (window.Motor) y en Node (module.exports).
 * ============================================================= */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------
  // Fechas
  // ---------------------------------------------------------------
  const DIA = 86400000;
  function aDia(x) {
    if (typeof x === "number") return x;
    if (x instanceof Date) return Math.round(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) / DIA);
    const p = String(x).slice(0, 10).split(/[-/]/).map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DIA);
  }
  function aTexto(n) { return new Date(n * DIA).toISOString().slice(0, 10); }
  function ymd(n) { const d = new Date(n * DIA); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
  function diaSemana(n) { const w = new Date(n * DIA).getUTCDay(); return w === 0 ? 7 : w; } // 1 = lunes
  // Suma meses como seq.Date de R (desborda: 31-mar menos 1 mes = 2-mar)
  function sumarMeses(n, k) { const [y, m, d] = ymd(n); return Math.round(Date.UTC(y, m - 1 + k, d) / DIA); }
  function finDeMes(n) { const [y, m] = ymd(n); return Math.round(Date.UTC(y, m, 0) / DIA); }

  // ---------------------------------------------------------------
  // Auxiliares numéricos
  // ---------------------------------------------------------------
  const esBisiesto = a => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  // Días base 365 sin 29 de febrero: resta cada 29-feb en (a, b]
  function dias365(a, b) {
    a = aDia(a); b = aDia(b);
    let n = 0;
    const ya = ymd(a)[0], yb = ymd(b)[0];
    for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) {
      if (esBisiesto(y)) { const f = aDia(y + "-02-29"); if (f > a && f <= b) n++; }
    }
    return (b - a) - n;
  }
  // Días 30/360 (meses de 30 días; día 31 -> 30)
  function dias30360(a, b) {
    const [y1, m1, d1] = ymd(aDia(a)), [y2, m2, d2] = ymd(aDia(b));
    return 360 * (y2 - y1) + 30 * (m2 - m1) + (Math.min(d2, 30) - Math.min(d1, 30));
  }
  const truncar = (x, d) => { const f = Math.pow(10, d); return Math.trunc(x * f) / f; };
  const redondear = (x, d) => { const f = Math.pow(10, d); return Math.round(x * f) / f; };
  // Redondeo "hacia arriba en 5" de un cupón expresado en % del nominal (reglas IBR)
  const redondearPct = (cupon, vn, dec) => Math.floor(cupon / vn * 100 * Math.pow(10, dec) + 0.5 + 1e-9) / Math.pow(10, dec) * vn / 100;
  const suma = a => a.reduce((s, x) => s + x, 0);
  const promedio = a => suma(a) / a.length;

  // Raíz por bisección + secante (equivalente a uniroot con tolerancia fina)
  function raiz(f, a, b, tol) {
    tol = tol || 1e-13;
    let fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
    for (let i = 0; i < 300; i++) {
      const m = (a + b) / 2, fm = f(m);
      if (fm === 0 || (b - a) / 2 < tol) return m;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }

  // TIR de una lista de flujos {dias, monto}: NPV(r) = Σ monto/(1+r)^(dias/base)
  function tirOperacion(flujos, base) {
    base = base || 365;
    if (flujos.every(f => f.dias === 0)) return { tir: NaN, error: true, mensaje: "Operación del mismo día: no hay tiempo para anualizar." };
    const npv = r => suma(flujos.map(f => f.monto / Math.pow(1 + r, f.dias / base)));
    const r = raiz(npv, -0.9999, 10, 1e-14);
    if (isNaN(r)) return { tir: NaN, error: true, mensaje: "No fue posible encontrar una tasa que resuelva la operación. Revisa los precios y las fechas." };
    return { tir: r, error: false };
  }

  function clasificar(limpio, vn) {
    if (Math.abs(limpio - vn) < vn * 0.0001) return "A la par";
    return limpio < vn ? "Con descuento" : "Con prima";
  }
  function error(msg) { const e = new Error(msg); e.esValidacion = true; throw e; }

  // ---------------------------------------------------------------
  // TASA FIJA (TES)
  // ---------------------------------------------------------------
  function calendario(emision, vencimiento, m) {
    emision = aDia(emision); vencimiento = aDia(vencimiento);
    const paso = 12 / m;
    const fechas = [vencimiento];
    let act = vencimiento;
    for (;;) {
      const ant = sumarMeses(act, -paso);
      if (ant <= emision) break;
      fechas.unshift(ant); act = ant;
    }
    return fechas;
  }
  function tablaFlujos(emision, vencimiento, m, tasaCupon, vn) {
    emision = aDia(emision);
    const cal = calendario(emision, vencimiento, m);
    return cal.map((fin, k) => {
      const ini = k === 0 ? emision : cal[k - 1];
      const dias = dias365(ini, fin);
      return { inicio: ini, fecha: fin, dias, cupon: vn * (Math.pow(1 + tasaCupon, dias / 365) - 1) };
    });
  }
  function interesCorrido(tabla, f) {
    f = aDia(f);
    const p = tabla.find(r => r.inicio <= f && r.fecha > f);
    if (!p) error("La fecha de negociación debe estar entre la emisión y el vencimiento.");
    const dt = dias365(p.inicio, f);
    return { inicio: p.inicio, proximo: p.fecha, diasTranscurridos: dt, diasPeriodo: p.dias, valor: p.cupon * dt / p.dias };
  }
  // Precio de un bono de tasa fija (convención TES). tasaMercado en decimal EA.
  function precioTasaFija(o) {
    const vn = o.valorNominal || 100;
    const f = aDia(o.fechaNegociacion), em = aDia(o.emision), ve = aDia(o.vencimiento);
    if (ve <= em) error("La fecha de vencimiento debe ser posterior a la emisión.");
    if (f < em || f >= ve) error("La fecha de negociación debe estar entre la emisión y el vencimiento (sin incluirlo).");
    const tabla = tablaFlujos(em, ve, o.periodo, o.tasaCupon, vn);
    const ic = interesCorrido(tabla, f);
    const fut = tabla.filter(r => r.fecha > f);
    const flujos = fut.map(r => r.cupon); flujos[flujos.length - 1] += vn;
    const dias = fut.map(r => dias365(f, r.fecha));
    const t = dias.map(d => d / 365);
    let vp, tasas = null, tirEq = o.tasaMercado;
    if (o.curvaCC) {
      const z = tasaCC(t, o.curvaCC, f);
      tasas = z.map(x => x + (o.spreadPb || 0) / 1e4);
      vp = flujos.map((c, k) => c / Math.pow(1 + tasas[k], t[k]));
      const P = suma(vp);
      tirEq = raiz(y => suma(flujos.map((c, k) => c / Math.pow(1 + y, t[k]))) - P, -0.5, 2, 1e-15);
    } else {
      vp = flujos.map((c, k) => c / Math.pow(1 + o.tasaMercado, t[k]));
    }
    const sucio = suma(vp), sucioT = truncar(sucio, 3), limpio = sucioT - ic.valor;
    return {
      tabla, fechas: fut.map(r => r.fecha), diasPeriodo: fut.map(r => r.dias), flujos, dias, t, vp, tasas, tirEquivalente: tirEq,
      interesCorrido: ic.valor, precioSucio: sucio, precioSucioTruncado: sucioT, precioLimpio: limpio,
      clasificacion: clasificar(limpio, vn)
    };
  }
  // Curva cero cupón: {tipo: "plazo"|"fecha", x: [...], tasa: [...]} -> tasa por plazo t (interpolación lineal)
  function tasaCC(t, curva, fechaVal) {
    const xs = curva.tipo === "fecha" ? curva.x.map(d => dias365(fechaVal, d) / 365) : curva.x;
    const ys = curva.tasa;
    if (xs.length === 1) return t.map(() => ys[0]);
    return t.map(v => {
      if (v <= xs[0]) return ys[0];
      if (v >= xs[xs.length - 1]) return ys[ys.length - 1];
      let k = 1; while (xs[k] < v) k++;
      return ys[k - 1] + (ys[k] - ys[k - 1]) * (v - xs[k - 1]) / (xs[k] - xs[k - 1]);
    });
  }

  // Rentabilidad de una operación de compra-venta con un bono de tasa fija
  function operacionTasaFija(o) {
    const vn = o.valorNominal || 100;
    const em = aDia(o.emision), ve = aDia(o.vencimiento), fc = aDia(o.fechaCompra), fv = aDia(o.fechaVenta);
    if (fv < fc) error("La fecha de venta no puede ser anterior a la fecha de compra.");
    if (fv > ve) error("La fecha de venta no puede ser posterior al vencimiento.");
    const tabla = tablaFlujos(em, ve, o.periodo, o.tasaCupon, vn);
    const lado = (fecha, modo, tasa, precio) => {
      if (fecha === ve) return { precio: vn, limpio: vn, ic: 0, vencimiento: true };
      if (modo === "tasa") {
        const r = precioTasaFija({ emision: em, vencimiento: ve, tasaCupon: o.tasaCupon, periodo: o.periodo, tasaMercado: tasa, fechaNegociacion: fecha, valorNominal: vn });
        return { precio: r.precioSucioTruncado, limpio: r.precioLimpio, ic: r.interesCorrido };
      }
      const ic = interesCorrido(tabla, fecha).valor;
      return { precio: precio, limpio: precio - ic, ic };
    };
    const compra = lado(fc, o.modoCompra, o.tasaCompra, o.precioCompra);
    const venta = lado(fv, o.modoVenta, o.tasaVenta, o.precioVenta);
    const cupones = tabla.filter(r => r.fecha > fc && r.fecha <= fv).map(r => ({ fecha: r.fecha, monto: r.cupon }));
    const flujos = [{ fecha: fc, monto: -compra.precio }].concat(cupones, [{ fecha: fv, monto: venta.precio }])
      .map(x => ({ fecha: x.fecha, monto: x.monto, dias: dias365(fc, x.fecha) }));
    const t = tirOperacion(flujos, 365);
    const factor = (o.montoPesos || vn) / vn;
    return {
      compra, venta, cupones, flujos, tir: t.tir, mensajeTir: t.mensaje,
      giroCompra: compra.precio * factor, valorVenta: venta.precio * factor,
      cuponesPesos: suma(cupones.map(c => c.monto)) * factor, pygPesos: suma(flujos.map(f => f.monto)) * factor
    };
  }

  // ---------------------------------------------------------------
  // RIESGO: duración, convexidad, DV01, sensibilidad
  // ---------------------------------------------------------------
  function riesgo(o) {
    const flujos = o.flujos, t = o.t, y = o.tasa, m = o.periodo;
    const tasas = o.tasasFlujo || flujos.map(() => y);
    const factor = o.factor == null ? NaN : o.factor;
    const pasos = o.pasos || [-400, -300, -200, -100, 0, 100, 200, 300, 400];
    const vp = flujos.map((c, k) => c / Math.pow(1 + tasas[k], t[k]));
    const P = suma(vp);
    const precioActual = o.precioActual == null ? truncar(P, 3) : o.precioActual;
    const mac = suma(vp.map((v, k) => t[k] * v)) / P;
    const dmod = mac / (1 + y);
    const conv = suma(vp.map((v, k) => (t[k] * t[k] + t[k]) * v)) / (P * Math.pow(1 + y, 2 / m));
    const dmodT = truncar(dmod + 1e-12, 3);
    const dv01 = dmodT / 1e4 * precioActual;
    const exacto = dy => suma(flujos.map((c, k) => c / Math.pow(1 + tasas[k] + dy, t[k])));
    const aproxD = dy => precioActual * (1 - dmod * dy);
    const aproxDC = dy => precioActual * (1 - dmod * dy + 0.5 * conv * dy * dy);
    const dv01En = dy => {
      const v = flujos.map((c, k) => c / Math.pow(1 + tasas[k] + dy, t[k]));
      const Pk = suma(v);
      const dk = (suma(v.map((x, k) => t[k] * x)) / Pk) / (1 + y + dy);
      return truncar(dk + 1e-12, 3) / 1e4 * truncar(Pk, 3);
    };
    const sens = pasos.map(pb => {
      const dy = pb / 1e4, pe = exacto(dy), d = dv01En(dy);
      return { pb, tasa: y + dy, precioExacto: pe, precioDuracion: aproxD(dy), precioDurConv: aproxDC(dy),
               cambioValor: (pe - P) * factor, dv01: d, dv01Pesos: d * factor };
    });
    const dy = (o.cambioPb || 100) / 1e4;
    return {
      precio: P, precioActual, tasa: y, macaulay: mac, modificada: dmod, modificadaTrunc: dmodT, convexidad: conv,
      dv01, dv01Pesos: dv01 * factor, cambioPb: o.cambioPb || 100,
      sube: { exacto: exacto(dy), duracion: aproxD(dy), durConv: aproxDC(dy) },
      baja: { exacto: exacto(-dy), duracion: aproxD(-dy), durConv: aproxDC(-dy) },
      detalle: flujos.map((c, k) => ({ t: t[k], flujo: c, vp: vp[k], tvp: t[k] * vp[k], t2tvp: (t[k] * t[k] + t[k]) * vp[k] })),
      sensibilidad: sens
    };
  }

  // ---------------------------------------------------------------
  // IPC
  // ---------------------------------------------------------------
  // serie: {fechas: [dia...], inflacion: [% ...]} ordenada
  function ipcVigente(f, serie) {
    f = aDia(f);
    let k = -1;
    for (let i = 0; i < serie.fechas.length; i++) { if (serie.fechas[i] <= f) k = i; else break; }
    if (k < 0) error("No hay IPC publicado en o antes del " + aTexto(f) + " (la serie empieza el " + aTexto(serie.fechas[0]) + ").");
    return { valor: serie.inflacion[k] / 100, fecha: serie.fechas[k] };
  }
  const combinarIPC = (ipc, spread) => (1 + ipc) * (1 + spread) - 1;

  function tablaFlujosIPC(em, ve, m, spread, vn, fneg, modoIPC, serie) {
    em = aDia(em); fneg = aDia(fneg);
    const cal = calendario(em, ve, m);
    const ini = cal.map((x, k) => k === 0 ? em : cal[k - 1]);
    const idx = cal.findIndex((fin, k) => ini[k] <= fneg && fin > fneg);
    if (idx < 0) error("La fecha de negociación debe estar entre la emisión y el vencimiento.");
    const ipcNeg = ipcVigente(fneg, serie);
    const ref = modoIPC === "inicio" ? ini[idx] : cal[idx];
    const ipcPrimer = ipcVigente(Math.min(ref, fneg), serie);
    return cal.map((fin, k) => {
      const dias = dias365(ini[k], fin);
      if (k < idx) return { inicio: ini[k], fecha: fin, dias, ipc: NaN, fechaIpc: NaN, tasa: NaN, cupon: NaN };
      const src = k === idx ? ipcPrimer : ipcNeg;
      const tasa = combinarIPC(src.valor, spread);
      return { inicio: ini[k], fecha: fin, dias, ipc: src.valor, fechaIpc: src.fecha, tasa, cupon: vn * (Math.pow(1 + tasa, dias / 365) - 1) };
    });
  }
  // tipoTasa: "total" (EA) o "spread_ipc" (spread EA sobre el IPC vigente)
  function precioIPC(o) {
    const vn = o.valorNominal || 100;
    const f = aDia(o.fechaNegociacion), em = aDia(o.emision), ve = aDia(o.vencimiento);
    if (ve <= em) error("La fecha de vencimiento debe ser posterior a la emisión.");
    if (f < em || f >= ve) error("La fecha de negociación debe estar entre la emisión y el vencimiento (sin incluirlo).");
    const tabla = tablaFlujosIPC(em, ve, o.periodo, o.spread, vn, f, o.modoIPC, o.serie);
    const ic = interesCorrido(tabla, f);
    const fut = tabla.filter(r => r.fecha > f);
    const flujos = fut.map(r => r.cupon); flujos[flujos.length - 1] += vn;
    const dias = fut.map(r => dias365(f, r.fecha)), t = dias.map(d => d / 365);
    const ipcNeg = ipcVigente(f, o.serie);
    const tasaDesc = o.tipoTasa === "spread_ipc" ? combinarIPC(ipcNeg.valor, o.tasaMercado) : o.tasaMercado;
    const vp = flujos.map((c, k) => c / Math.pow(1 + tasaDesc, t[k]));
    const sucio = suma(vp), sucioT = truncar(sucio, 3), limpio = sucioT - ic.valor;
    const giro = o.montoPesos ? sucioT / vn * o.montoPesos : NaN;
    return {
      tabla, filas: fut, fechas: fut.map(r => r.fecha), flujos, dias, t, vp, tasaDescuento: tasaDesc, ipcNegociacion: ipcNeg,
      interesCorrido: ic.valor, precioSucio: sucio, precioSucioTruncado: sucioT, precioLimpio: limpio,
      clasificacion: clasificar(limpio, vn), valorGiro: giro,
      ultimoIPC: o.serie.fechas[o.serie.fechas.length - 1]
    };
  }
  // Pronóstico: [{fecha (cualquier día del mes), valor (% o decimal)}] -> serie al fin de mes en %
  function seriePronostico(filas) {
    const v = filas.map(r => r.valor);
    const enDecimal = Math.max.apply(null, v.map(Math.abs)) < 1;
    const out = filas.map(r => ({ fecha: finDeMes(aDia(r.fecha)), inflacion: enDecimal ? r.valor * 100 : r.valor }))
      .sort((a, b) => a.fecha - b.fecha);
    return { fechas: out.map(r => r.fecha), inflacion: out.map(r => r.inflacion) };
  }

  function rentabilidadIPC(o) {
    const vn = o.valorNominal || 100;
    const base = o.base || "365", diasTir = o.diasTir || "reales";
    const den = base === "30_360" ? 360 : 365;
    const diasFn = base === "30_360" ? dias30360 : dias365;
    const em = aDia(o.emision), ve = aDia(o.vencimiento), fc = aDia(o.fechaCompra), fv = aDia(o.fechaVenta);
    if (ve <= em) error("La fecha de vencimiento debe ser posterior a la emisión.");
    if (fc < em || fc >= ve) error("La fecha de compra debe estar entre la emisión y el vencimiento (sin incluirlo).");
    if (fv < fc) error("La fecha de venta no puede ser anterior a la fecha de compra.");
    if (fv > ve) error("La fecha de venta no puede ser posterior al vencimiento.");
    const alVenc = fv === ve;
    if (base === "30_360" && (o.modoCompra === "tasa" || (!alVenc && o.modoVenta === "tasa")))
      error("Con base 30/360 ingresa la compra y la venta por precio sucio directo.");

    // Serie visible: estimada = publicada hasta la compra (+ pronóstico después del último dato)
    let serie = o.serie;
    if (o.tipo === "estimada") {
      const f = [], v = [];
      serie.fechas.forEach((d, i) => { if (d <= fc) { f.push(d); v.push(serie.inflacion[i]); } });
      if (o.pronostico && o.pronostico.fechas.length) {
        const ult = f.length ? f[f.length - 1] : -1e9;
        o.pronostico.fechas.forEach((d, i) => { if (d > ult) { f.push(d); v.push(o.pronostico.inflacion[i]); } });
        const idx = f.map((d, i) => i).sort((a, b) => f[a] - f[b]);
        serie = { fechas: idx.map(i => f[i]), inflacion: idx.map(i => v[i]) };
      } else serie = { fechas: f, inflacion: v };
    }
    if (!serie.fechas.length) error("No hay IPC publicado en o antes de la fecha de compra.");

    const valorar = (fecha, modo, tasa, tipoTasa, precio) => {
      if (base === "30_360") {
        const cal = calendario(em, ve, o.periodo), ini = cal.map((x, k) => k === 0 ? em : cal[k - 1]);
        const k = cal.findIndex((fin, i) => ini[i] <= fecha && fin > fecha);
        const ref = o.modoIPC === "inicio" ? ini[k] : Math.min(cal[k], fecha);
        const tk = combinarIPC(ipcVigente(ref, serie).valor, o.spread);
        const ck = vn * (Math.pow(1 + tk, dias30360(ini[k], cal[k]) / den) - 1);
        const ic = ck * dias30360(ini[k], fecha) / dias30360(ini[k], cal[k]);
        return { precio, limpio: precio - ic, ic, motor: null };
      }
      const r = precioIPC({ emision: em, vencimiento: ve, periodo: o.periodo, spread: o.spread, modoIPC: o.modoIPC,
        tasaMercado: modo === "tasa" ? tasa : 0, fechaNegociacion: fecha, serie, tipoTasa, valorNominal: vn });
      const p = modo === "tasa" ? r.precioSucioTruncado : precio;
      return { precio: p, limpio: p - r.interesCorrido, ic: r.interesCorrido, motor: r };
    };
    const compra = valorar(fc, o.modoCompra, o.tasaCompra, o.tipoTasaCompra || "total", o.precioCompra);
    const venta = alVenc ? { precio: vn, limpio: vn, ic: 0, motor: null }
      : valorar(fv, o.modoVenta, o.tasaVenta, o.tipoTasaVenta || "total", o.precioVenta);

    const cal = calendario(em, ve, o.periodo), ini = cal.map((x, k) => k === 0 ? em : cal[k - 1]);
    const cupones = [];
    cal.forEach((fin, k) => {
      if (fin > fc && fin <= fv) {
        const ref = o.modoIPC === "inicio" ? ini[k] : fin;
        const ip = ipcVigente(ref, serie);
        const tasa = combinarIPC(ip.valor, o.spread);
        const dp = diasFn(ini[k], fin);
        cupones.push({ fecha: fin, inicio: ini[k], fechaRef: ref, ipc: ip.valor, fechaIpc: ip.fecha, tasa,
                       monto: vn * redondear(Math.pow(1 + tasa, dp / den) - 1, 6) });
      }
    });
    const fechas = [fc].concat(cupones.map(c => c.fecha), [fv]);
    const montos = [-compra.precio].concat(cupones.map(c => c.monto), [venta.precio]);
    const dias = fechas.map(d => base === "30_360" ? dias30360(fc, d) : diasTir === "sin_feb29" ? dias365(fc, d) : d - fc);
    const t = tirOperacion(fechas.map((d, k) => ({ dias: dias[k], monto: montos[k] })), den);
    const factor = (o.montoPesos || vn) / vn;
    const ipcCompra = ipcVigente(fc, serie), ipcVenta = ipcVigente(fv, serie);
    const conceptos = ["Compra"].concat(cupones.map((c, i) => "Flujo " + (i + 1)), [alVenc ? "Vencimiento" : "Venta"]);
    return {
      tipo: o.tipo, alVencimiento: alVenc, tir: t.tir, mensajeTir: t.mensaje,
      precioCompra: compra.precio, limpioCompra: compra.limpio, precioVenta: venta.precio, limpioVenta: venta.limpio,
      giroCompra: compra.precio * factor, valorVenta: venta.precio * factor,
      cuponesPesos: suma(cupones.map(c => c.monto)) * factor, pygPesos: suma(montos) * factor,
      ipcCompra, ipcVenta, cupones,
      tabla: fechas.map((d, k) => ({ concepto: conceptos[k], fecha: d, valor: montos[k] * factor,
        fechaRef: k === 0 ? fc : k === fechas.length - 1 ? fv : cupones[k - 1].fechaRef,
        ipc: k === 0 ? ipcCompra.valor : k === fechas.length - 1 ? ipcVenta.valor : cupones[k - 1].ipc })),
      conPronostico: o.tipo === "estimada" && !!(o.pronostico && o.pronostico.fechas.length)
    };
  }

  // ---------------------------------------------------------------
  // UVR
  // ---------------------------------------------------------------
  // serie UVR: {mapa: Map(dia -> valor), fechas: [...], valores: [...]}
  function uvrEnFecha(f, serie) {
    f = aDia(f);
    const v = serie.mapa.get(f);
    if (v == null) error("No hay valor de UVR para el " + aTexto(f) + " (la serie va del " + aTexto(serie.fechas[0]) + " al " + aTexto(serie.fechas[serie.fechas.length - 1]) + ").");
    return v;
  }
  function precioUVR(o) {
    const vn = o.valorNominal || 100;
    const motor = precioTasaFija({ emision: o.emision, vencimiento: o.vencimiento, tasaCupon: o.tasaCupon, periodo: o.periodo,
      tasaMercado: o.tasaMercado, fechaNegociacion: o.fechaNegociacion, valorNominal: vn });
    const uvr = uvrEnFecha(o.fechaNegociacion, o.serieUVR);
    const nominalUVR = o.nominalEn === "uvr" ? o.nominal : o.nominal / uvr;
    return Object.assign(motor, {
      uvr, nominalUVR, nominalPesos: nominalUVR * uvr,
      valorGiro: truncar(motor.precioSucioTruncado / vn * nominalUVR * uvr, 0),
      valorGiroUVR: motor.precioSucioTruncado / vn * nominalUVR
    });
  }
  // UVR proyectada (UVR_t = UVR_15 (1+i)^(t/d)); conocida: serie hasta la compra
  function uvrProyectada(fechas, conocida, inflacionAnual) {
    const L = conocida.fechas[conocida.fechas.length - 1];
    const iProj = Math.pow(1 + inflacionAnual, 1 / 12) - 1;
    const valor = f => { const v = conocida.mapa.get(f); if (v == null) error("No hay valor de UVR publicado para el " + aTexto(f) + "."); return v; };
    const sig15 = s => sumarMeses(s, 1), ant15 = s => sumarMeses(s, -1);
    const inicioCiclo = D => { const [y, m] = ymd(D); const d15 = aDia(y + "-" + String(m).padStart(2, "0") + "-15"); return D <= d15 ? ant15(d15) : d15; };
    const iCiclo = s => {
      if (s + 1 <= L) { const e = sig15(s), d = e - s, mm = Math.min(L, e); return Math.pow(valor(mm) / valor(s), d / (mm - s)) - 1; }
      return iProj;
    };
    const u15 = s => s <= L ? valor(s) : u15(ant15(s)) * (1 + iCiclo(ant15(s)));
    return fechas.map(D => {
      D = aDia(D);
      if (D <= L) return valor(D);
      const s = inicioCiclo(D), d = sig15(s) - s;
      return u15(s) * Math.pow(1 + iCiclo(s), (D - s) / d);
    });
  }
  function rentabilidadUVR(o) {
    const vn = o.valorNominal || 100, diasTir = o.diasTir || "reales";
    const em = aDia(o.emision), ve = aDia(o.vencimiento), fc = aDia(o.fechaCompra), fv = aDia(o.fechaVenta);
    if (ve <= em) error("La fecha de vencimiento debe ser posterior a la emisión.");
    if (fc < em || fc >= ve) error("La fecha de compra debe estar entre la emisión y el vencimiento (sin incluirlo).");
    if (fv < fc) error("La fecha de venta no puede ser anterior a la fecha de compra.");
    if (fv > ve) error("La fecha de venta no puede ser posterior al vencimiento.");
    const alVenc = fv === ve;
    let uvrEn, inflacion = NaN;
    if (o.tipo === "real") uvrEn = fs => fs.map(f => uvrEnFecha(f, o.serieUVR));
    else {
      if (!o.serieIPC) error("Para la TIR estimada se necesita la serie de IPC.");
      const f = [], v = [], mapa = new Map();
      o.serieUVR.fechas.forEach((d, i) => { if (d <= fc) { f.push(d); v.push(o.serieUVR.valores[i]); mapa.set(d, o.serieUVR.valores[i]); } });
      const conocida = { fechas: f, valores: v, mapa };
      uvrEnFecha(fc, conocida);
      inflacion = ipcVigente(fc, o.serieIPC).valor;
      uvrEn = fs => uvrProyectada(fs, conocida, inflacion);
    }
    const tabla = tablaFlujos(em, ve, o.periodo, o.tasaCupon, vn);
    const valorar = (fecha, modo, tasa, precio) => {
      if (modo === "tasa") {
        const r = precioTasaFija({ emision: em, vencimiento: ve, tasaCupon: o.tasaCupon, periodo: o.periodo, tasaMercado: tasa, fechaNegociacion: fecha, valorNominal: vn });
        return { precio: r.precioSucioTruncado, limpio: r.precioLimpio, ic: r.interesCorrido };
      }
      const ic = interesCorrido(tabla, fecha).valor;
      return { precio, limpio: precio - ic, ic };
    };
    const compra = valorar(fc, o.modoCompra, o.tasaCompra, o.precioCompra);
    const venta = alVenc ? { precio: vn, limpio: vn, ic: 0 } : valorar(fv, o.modoVenta, o.tasaVenta, o.precioVenta);
    const cupones = tabla.filter(r => r.fecha > fc && r.fecha <= fv).map(r => ({ fecha: r.fecha, monto: r.cupon }));
    const uvrCompra = uvrEn([fc])[0];
    const nominalUVR = o.nominalEn === "uvr" ? o.nominal : o.nominal / uvrCompra;
    const fechas = [fc].concat(cupones.map(c => c.fecha), [fv]);
    const uvrF = [uvrCompra].concat(cupones.length ? uvrEn(cupones.map(c => c.fecha)) : [], uvrEn([fv]));
    const base100 = [-compra.precio].concat(cupones.map(c => c.monto), [venta.precio]);
    const fUVR = base100.map(x => x / vn * nominalUVR);
    const fPesos = fUVR.map((x, k) => x * uvrF[k]);
    const n = fPesos.length;
    fPesos[0] = -truncar(-fPesos[0], 0); fPesos[n - 1] = truncar(fPesos[n - 1], 0);
    const dias = fechas.map(d => diasTir === "sin_feb29" ? dias365(fc, d) : d - fc);
    const tirDe = ms => tirOperacion(fechas.map((d, k) => ({ dias: dias[k], monto: ms[k] })), 365).tir;
    const conceptos = ["Compra"].concat(cupones.map((c, i) => "Flujo " + (i + 1)), [alVenc ? "Vencimiento" : "Venta"]);
    return {
      tipo: o.tipo, alVencimiento: alVenc, precioCompra: compra.precio, limpioCompra: compra.limpio,
      precioVenta: venta.precio, limpioVenta: venta.limpio, nominalUVR, uvrCompra, uvrVenta: uvrF[n - 1],
      giroCompra: -fPesos[0], valorVenta: fPesos[n - 1], cuponesPesos: suma(fPesos.slice(1, n - 1)), pygPesos: suma(fPesos),
      tirPesos: tirDe(fPesos), tirUVR: tirDe(fUVR), inflacionSupuesta: inflacion,
      tabla: fechas.map((d, k) => ({ concepto: conceptos[k], fecha: d, uvr: uvrF[k], valorUVR: fUVR[k], valorPesos: fPesos[k] }))
    };
  }

  // ---------------------------------------------------------------
  // IBR: festivos de Colombia, regla de la tasa aplicable
  // ---------------------------------------------------------------
  function pascua(a) {
    const A = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * A + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((A + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return Math.round(Date.UTC(a, mes - 1, dia) / DIA);
  }
  const aLunes = n => { const w = diaSemana(n); return w === 1 ? n : n + (8 - w); };
  const cacheFestivos = {};
  function festivos(a) {
    if (cacheFestivos[a]) return cacheFestivos[a];
    const p = pascua(a), F = s => aDia(a + "-" + s);
    const corpus = aLunes(p + 60);
    const lista = [F("01-01"), F("05-01"), F("07-20"), F("08-07"), F("12-08"), F("12-25"), p - 3, p - 2, corpus, corpus + 7]
      .concat(["01-06", "03-19", "06-29", "08-15", "10-12", "11-01", "11-11"].map(s => aLunes(F(s))), [aLunes(p + 39)]);
    return (cacheFestivos[a] = new Set(lista));
  }
  const esFestivo = n => festivos(ymd(n)[0]).has(n);
  const esHabil = n => diaSemana(n) <= 5 && !esFestivo(n);
  // Regla: tasa publicada el día hábil inmediatamente anterior al último día hábil <= D
  function fechaIbrAplicable(D) {
    let B = aDia(D); while (!esHabil(B)) B--;
    let P = B - 1; while (!esHabil(P)) P--;
    return P;
  }
  // serie IBR: {fechas: [...], overnight: [...], m1: [...], m3, m6, m12} en %
  const COL_IBR = { overnight: "overnight", "1m": "m1", "3m": "m3", "6m": "m6", "12m": "m12" };
  function ibrReal(D, tenor, serie) {
    const col = COL_IBR[tenor]; if (!col) error("Plazo de IBR no válido.");
    const P = fechaIbrAplicable(D);
    const ult = serie.fechas[serie.fechas.length - 1];
    if (P > ult) return null;                              // aún no publicado
    let k = -1;
    for (let i = 0; i < serie.fechas.length; i++) { if (serie.fechas[i] > P) break; if (serie[col][i] != null && !isNaN(serie[col][i])) k = i; }
    if (k < 0) error("No hay IBR a " + tenor + " publicado en o antes del " + aTexto(P) + ".");
    return { valor: serie[col][k] / 100, fechaPublicacion: P, fechaDato: serie.fechas[k], retroceso: serie.fechas[k] !== P };
  }
  // curva FR: {nombre, fechas: [...], tasas: [...] (decimal)}
  function ibrCurva(D, curva) {
    D = aDia(D);
    const f = curva.fechas;
    if (D < f[0] || D > f[f.length - 1]) error("La curva FR \"" + curva.nombre + "\" solo cubre del " + aTexto(f[0]) + " al " + aTexto(f[f.length - 1]) + " y se necesita la tasa del " + aTexto(D) + ".");
    let lo = 0, hi = f.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (f[m] <= D) lo = m; else hi = m - 1; }
    return { valor: curva.tasas[lo], fechaDato: f[lo] };
  }

  function rentabilidadIBR(o) {
    const vn = o.valorNominal || 100, m = o.periodo;
    const metodo = o.metodoDescuento || "promedio";
    const em = aDia(o.emision), ve = aDia(o.vencimiento), fc = aDia(o.fechaCompra);
    const fv = o.fechaVenta == null ? ve : aDia(o.fechaVenta);
    const alVenc = fv === ve;
    if (ve <= em) error("La fecha de vencimiento debe ser posterior a la emisión.");
    if (fc < em || fc >= ve) error("La fecha de compra debe estar entre la emisión y el vencimiento (sin incluirlo).");
    if (fv <= fc) error("La fecha de venta debe ser posterior a la fecha de compra.");
    if (fv > ve) error("La fecha de venta no puede ser posterior al vencimiento.");
    const revisar = (modo, precio, spread, tir, que) => {
      if (modo === "precio" && !(precio > 0)) error("Falta el precio de " + que + ".");
      if (modo === "tasa" && (spread == null || isNaN(spread))) error("Falta el spread de negociación de la " + que + ".");
      if (modo === "tir" && (tir == null || isNaN(tir))) error("Falta la TIR de negociación de la " + que + ".");
    };
    revisar(o.modoCompra || "precio", o.precioCompra, o.spreadCompra, o.tirCompra, "compra");
    if (!alVenc) revisar(o.modoVenta || "precio", o.precioVenta, o.spreadVenta, o.tirVenta, "venta");
    if (o.tipo === "real" && !o.serieIBR) error("Para la rentabilidad real se necesita la base de IBR del Banco de la República.");
    if (o.tipo === "estimada" && !(o.curvas && o.curvas.length)) error("Para la rentabilidad proyectada se necesita la curva FR.");
    let tenor = o.tenor || "auto";
    if (tenor === "auto") { tenor = { 12: "1m", 4: "3m", 2: "6m", 1: "12m" }[m]; if (!tenor) error("Con esta periodicidad elige el plazo del IBR manualmente."); }

    const cal = calendario(em, ve, m), ini = cal.map((x, k) => k === 0 ? em : cal[k - 1]);
    const curvas = (o.curvas || []).slice().sort((a, b) => a.fechas[0] - b.fechas[0]);
    const curvaEn = V => { let c = null; curvas.forEach(x => { if (x.fechas[0] <= V) c = x; }); return c; };
    const publicado = D => o.serieIBR ? ibrReal(D, tenor, o.serieIBR) : null;
    const fuenteCurva = o.tipo === "real" ? "Estimada (curva FR)" : "Curva FR";
    const desdeCurva = (D, c) => { const p = ibrCurva(D, c); return { valor: p.valor, fuente: fuenteCurva, fechaDato: p.fechaDato, curva: c.nombre }; };
    const textoCurvas = () => curvas.length ? "las curvas FR empiezan el " + curvas.map(c => aTexto(c.fechas[0])).join(" / ") : "no hay curva FR cargada";
    // IBR del periodo que inicia en D con la información disponible en V
    const info = (D, V, etiqueta) => {
      const cv = curvaEn(V);
      if (D <= V) {
        const r = publicado(D);
        if (r) return { valor: r.valor, fuente: "Publicada", fechaDato: r.fechaDato, retroceso: r.retroceso };
        if (cv && D >= cv.fechas[0]) return desdeCurva(D, cv);
        error("El IBR aplicable al " + aTexto(D) + " aún no está publicado y no hay curva FR vigente en esa fecha (" + textoCurvas() + ").");
      }
      if (cv && D >= cv.fechas[0]) return desdeCurva(D, cv);
      const r = publicado(V);
      if (r) return { valor: r.valor, fuente: "IBR vigente " + (etiqueta || "a la compra") + " (constante)", fechaDato: r.fechaDato, retroceso: r.retroceso };
      if (cv) return desdeCurva(V, cv);
      error("No hay IBR publicado para el " + aTexto(V) + " ni curva FR vigente en esa fecha (" + textoCurvas() + ").");
    };

    const valorarEn = (V, modo, precio, spreadNeg, tirNeg, fInfo, etiqueta) => {
      const fut = cal.map((f, k) => k).filter(k => cal[k] > V);
      const iniCur = ini[fut[0]];
      const ibrCur = info(iniCur, fInfo, etiqueta);
      const cuponCur = vn * (ibrCur.valor + o.spread) / m;
      const cc = cuponCur * dias30360(iniCur, V) / dias30360(iniCur, cal[fut[0]]);
      const limpio = s => truncar(s - cc, 3);
      if (modo === "precio") return { precio, valoracion: null, cuponCorrido: cc, precioLimpio: limpio(precio) };
      const cv = curvaEn(fInfo);
      const proy = fut.map(k => info(ini[k], fInfo, etiqueta));
      const ibrP = proy.map(x => x.valor);
      const dias = fut.map(k => dias365(V, cal[k]));
      let flu, vp, v;
      if (modo === "tir") {
        flu = ibrP.map(x => redondearPct(vn * (x + o.spread) / m, vn, 6));
        flu[flu.length - 1] += vn;
        vp = flu.map((c, k) => c / Math.pow(1 + tirNeg, dias[k] / 365));
        v = { metodo: "tir", tasaDescuento: tirNeg };
      } else {
        flu = ibrP.map(x => vn * (x + o.spread) / m);
        flu[flu.length - 1] += vn;
        const vig = info(V, fInfo, etiqueta);
        const baseIbr = metodo === "vigente" ? vig.valor : promedio(ibrP);
        const tasaNA = baseIbr + spreadNeg;
        const tasaEA = Math.pow(1 + tasaNA / m, m) - 1;
        vp = flu.map((c, k) => c / Math.pow(1 + tasaEA, dias[k] / 365));
        v = { metodo: "spread", metodoDescuento: metodo, ibrPeriodo: ibrCur.valor, ibrVigente: vig.valor, ibrPromedio: promedio(ibrP),
              fuenteVigente: vig.fuente, fechaDatoVigente: vig.fechaDato, tasaNegociacionNA: tasaNA,
              tasaVigenteNA: vig.valor + spreadNeg, tasaVigenteEA: Math.pow(1 + (vig.valor + spreadNeg) / m, m) - 1, tasaDescuento: tasaEA };
      }
      const P = suma(vp);
      Object.assign(v, { precioSucio: P, precioSucioTruncado: truncar(P, 3), cuponCorrido: cc, precioLimpio: limpio(P),
        curva: cv ? cv.nombre : null,
        tabla: fut.map((k, i) => ({ fecha: cal[k], dias: dias[i], ibr: ibrP[i], fuente: proy[i].fuente, flujo: flu[i], vp: vp[i] })) });
      return { precio: v.precioSucioTruncado, valoracion: v, cuponCorrido: cc, precioLimpio: v.precioLimpio };
    };

    const compra = valorarEn(fc, o.modoCompra || "precio", o.precioCompra, o.spreadCompra, o.tirCompra, fc, "a la compra");
    const precioCompra = compra.precio;

    // Base para el riesgo en la fecha de compra
    let riesgoBase = null;
    try {
      const v = compra.valoracion;
      if (v) riesgoBase = { fechas: v.tabla.map(r => r.fecha), flujos: v.tabla.map(r => r.flujo), t: v.tabla.map(r => r.dias / 365), tasa: v.tasaDescuento, origen: "negociacion" };
      else {
        const fut = cal.map((f, k) => k).filter(k => cal[k] > fc);
        const ib = fut.map(k => info(ini[k], fc, "a la compra").valor);
        const flu = ib.map(x => redondearPct(vn * (x + o.spread) / m, vn, 6)); flu[flu.length - 1] += vn;
        const tt = fut.map(k => dias365(fc, cal[k]) / 365);
        const y = raiz(y => suma(flu.map((c, k) => c / Math.pow(1 + y, tt[k]))) - precioCompra, -0.5, 2, 1e-15);
        riesgoBase = { fechas: fut.map(k => cal[k]), flujos: flu, t: tt, tasa: y, origen: "implicita" };
      }
    } catch (e) { riesgoBase = null; }

    const venta = alVenc ? { precio: NaN, valoracion: null, cuponCorrido: NaN, precioLimpio: NaN }
      : valorarEn(fv, o.modoVenta || "precio", o.precioVenta, o.spreadVenta, o.tirVenta, fv, "a la venta");

    const recibidos = cal.map((f, k) => k).filter(k => cal[k] > fc && cal[k] <= fv);
    const tasas = recibidos.map(k => o.tipo === "real" ? info(ini[k], ini[k]) : info(ini[k], fc, "a la compra"));
    const ibrK = tasas.map(x => x.valor);
    const cupK = ibrK.map(x => redondearPct(vn * (x + o.spread) / m, vn, o.tipo === "real" ? 4 : 6));
    const n = recibidos.length;
    const flujos100 = cupK.slice(); if (alVenc && n > 0) flujos100[n - 1] += vn;
    const fechas = [fc].concat(recibidos.map(k => cal[k]), alVenc ? [] : [fv]);
    const montos = [-precioCompra].concat(flujos100, alVenc ? [] : [venta.precio]);
    const t = tirOperacion(fechas.map((d, k) => ({ dias: d - fc, monto: montos[k] })), 365);
    const factor = (o.montoPesos || vn) / vn;
    const fuentes = tasas.map(x => x.fuente);
    const etiq = fuentes.map(f => o.tipo === "real" ? (f === "Publicada" ? "Flujo Real" : "Flujo Est.") : "Flujo");
    const tabla = fechas.map((d, k) => {
      if (k === 0) return { concepto: "Valor compra", fecha: d, valor: montos[0] * factor };
      if (k <= n) return { concepto: etiq[k - 1] + " " + k, fecha: d, valor: montos[k] * factor, ibr: ibrK[k - 1], fuente: fuentes[k - 1], fechaDato: tasas[k - 1].fechaDato };
      return { concepto: "Venta", fecha: d, valor: montos[k] * factor };
    });
    return {
      tipo: o.tipo, tir: t.tir, mensajeTir: t.mensaje, tabla, tenor, sinBaseIBR: !o.serieIBR, riesgoBase,
      ibrPromedio: n ? promedio(ibrK) : NaN, nEstimados: o.tipo === "real" ? fuentes.filter(f => f !== "Publicada").length : 0,
      nRetroceso: tasas.filter(x => x.retroceso).length, alVencimiento: alVenc,
      precioCompra, valoracion: compra.valoracion, cuponCorridoCompra: compra.cuponCorrido, limpioCompra: compra.precioLimpio,
      precioVenta: venta.precio, valoracionVenta: venta.valoracion, cuponCorridoVenta: venta.cuponCorrido, limpioVenta: venta.precioLimpio,
      giroCompra: precioCompra * factor, valorVenta: alVenc ? NaN : venta.precio * factor,
      cuponesPesos: suma(cupK) * factor, pygPesos: suma(montos) * factor
    };
  }

  // Sendas de TIR: vender en cada fecha de cupón (±pb) vs. mantener al vencimiento
  function sendaTirIBR(args, pasos) {
    pasos = pasos || [-50, -25, 0, 25, 50];
    const ve = aDia(args.vencimiento), fc = aDia(args.fechaCompra);
    let modo = args.modoVenta, s0 = args.spreadVenta, t0 = args.tirVenta;
    const hayVenta = args.fechaVenta != null && aDia(args.fechaVenta) < ve;
    if (!hayVenta || !modo || modo === "precio") { modo = args.modoCompra; s0 = args.spreadCompra; t0 = args.tirCompra; }
    if (!modo || modo === "precio") error("Para las sendas de TIR ingresa la venta (o la compra) por spread o por TIR de negociación.");
    const cal = calendario(args.emision, ve, args.periodo);
    let fechas = cal.filter(f => f > fc && f < ve);
    if (hayVenta) fechas = Array.from(new Set(fechas.concat([aDia(args.fechaVenta)]))).sort((a, b) => a - b);
    let tirMant = NaN;
    try { tirMant = rentabilidadIBR(Object.assign({}, args, { fechaVenta: null, modoVenta: "precio" })).tir; } catch (e) { /* sin dato */ }
    const filas = fechas.map(f => {
      const corrida = pb => {
        const a = Object.assign({}, args, { fechaVenta: f, modoVenta: modo });
        if (modo === "tasa") a.spreadVenta = s0 + pb / 1e4; else a.tirVenta = t0 + pb / 1e4;
        try { return rentabilidadIBR(a); } catch (e) { return null; }
      };
      const r0 = corrida(0);
      return { fecha: f, precio: r0 ? r0.precioVenta : NaN, tirs: pasos.map(pb => { const r = pb === 0 ? r0 : corrida(pb); return r ? r.tir : NaN; }) };
    });
    return { filas, pasos, tirVencimiento: tirMant, modo, valorBase: modo === "tasa" ? s0 : t0, ventaElegida: hayVenta ? aDia(args.fechaVenta) : null };
  }

  const Motor = {
    aDia, aTexto, ymd, sumarMeses, finDeMes, dias365, dias30360, truncar, redondear, tirOperacion, raiz,
    calendario, tablaFlujos, interesCorrido, precioTasaFija, tasaCC, operacionTasaFija, riesgo,
    ipcVigente, precioIPC, rentabilidadIPC, seriePronostico,
    uvrEnFecha, precioUVR, uvrProyectada, rentabilidadUVR,
    festivos, esHabil, fechaIbrAplicable, ibrReal, ibrCurva, rentabilidadIBR, sendaTirIBR
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Motor;
  else root.Motor = Motor;
})(typeof window !== "undefined" ? window : globalThis);
