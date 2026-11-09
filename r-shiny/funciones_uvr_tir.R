# =============================================================
# RENTABILIDAD (TIR) DE UNA OPERACION CON BONO UVR
# =============================================================
# Requiere: funciones_modulo1.R, funciones_modulo2.R, funciones_uvr.R y
# funciones_ipc.R (para ipc_vigente, usado solo en la TIR estimada).
#
# El bono UVR tiene flujos fijos EN UVR. Lo que cambia entre estimada y real
# es el valor en pesos de la UVR en cada fecha:
#
#  * "real": se usa la UVR publicada en cada fecha (compra, cupones, venta).
#  * "estimada": al invertir solo se conoce la UVR hasta la fecha de compra;
#    la UVR futura se proyecta con la formula del Banco de la Republica:
#         UVR_t = UVR_15 * (1 + i)^(t/d)
#    (periodo de calculo = del dia 15 al dia 15 del mes siguiente; t = dias
#    desde el dia 15 inicial; d = dias del periodo; i = variacion mensual del
#    IPC). Para el periodo en curso, i se deduce de los valores ya publicados;
#    para los periodos siguientes se supone que la inflacion anual vigente a
#    la compra se mantiene: i = (1 + IPC_anual)^(1/12) - 1.

# -------------------------------------------------------------
# UVR proyectada (formula del profesor)
# -------------------------------------------------------------
# uvr_conocida: data.frame(fecha, valor) con la UVR ya publicada (hasta la
# fecha de compra). inflacion_anual: decimal (ej. 0.052).
uvr_proyectada <- function(fechas, uvr_conocida, inflacion_anual) {

  fechas <- as.Date(fechas)
  L <- max(uvr_conocida$fecha)
  i_proj <- (1 + inflacion_anual)^(1 / 12) - 1

  valor <- function(f) {
    v <- uvr_conocida$valor[match(as.numeric(f), as.numeric(uvr_conocida$fecha))]
    if (is.na(v)) stop(sprintf("No hay valor de UVR publicado para el %s.", format(f)))
    v
  }
  siguiente15 <- function(s) seq(s, by = "month", length.out = 2)[2]
  anterior15 <- function(s) seq(s, by = "-1 month", length.out = 2)[2]
  inicio_ciclo <- function(D) {
    d15 <- as.Date(format(D, "%Y-%m-15"))
    if (D <= d15) anterior15(d15) else d15
  }

  # Variacion mensual i del periodo de calculo que inicia el dia 15 = s
  i_ciclo <- function(s) {
    if (s + 1 <= L) {                                    # periodo con datos publicados
      e <- siguiente15(s)
      d <- as.numeric(e - s)
      m <- min(L, e)                                    # ultimo dia conocido del periodo
      (valor(m) / valor(s))^(d / as.numeric(m - s)) - 1
    } else {
      i_proj                                             # periodo futuro: IPC supuesto
    }
  }
  # UVR del dia 15 que inicia el periodo s
  u15 <- function(s) {
    if (s <= L) valor(s) else u15(anterior15(s)) * (1 + i_ciclo(anterior15(s)))
  }

  vapply(seq_along(fechas), function(k) {
    D <- fechas[k]
    if (D <= L) return(valor(D))
    s <- inicio_ciclo(D)
    d <- as.numeric(siguiente15(s) - s)
    u15(s) * (1 + i_ciclo(s))^(as.numeric(D - s) / d)
  }, numeric(1))
}

# -------------------------------------------------------------
# Rentabilidad de la operacion
# -------------------------------------------------------------
rentabilidad_uvr <- function(tipo = "real",
                              fecha_emision, fecha_vencimiento, periodo_cupon, tasa_cupon_real,
                              fecha_compra, modo_compra = "tasa", tasa_compra = NULL,
                              precio_compra_directo = NULL,
                              fecha_venta, modo_venta = "tasa", tasa_venta = NULL,
                              precio_venta_directo = NULL,
                              uvr_df, ipc_df = NULL,
                              nominal_transado, nominal_en = "uvr", valor_nominal = 100,
                              dias_tir = "reales", base_dias = 365) {

  stopifnot(tipo %in% c("real", "estimada"), nominal_en %in% c("uvr", "pesos"),
            dias_tir %in% c("sin_feb29", "reales"))

  fecha_emision <- as.Date(fecha_emision); fecha_vencimiento <- as.Date(fecha_vencimiento)
  fecha_compra <- as.Date(fecha_compra); fecha_venta <- as.Date(fecha_venta)

  if (fecha_vencimiento <= fecha_emision) stop("La fecha de vencimiento debe ser posterior a la emision.")
  if (fecha_compra < fecha_emision || fecha_compra >= fecha_vencimiento) {
    stop("La fecha de compra debe estar entre la emision y el vencimiento (sin incluirlo).")
  }
  if (fecha_venta < fecha_compra) stop("La fecha de venta no puede ser anterior a la fecha de compra.")
  if (fecha_venta > fecha_vencimiento) stop("La fecha de venta no puede ser posterior al vencimiento.")
  al_vencimiento <- fecha_venta == fecha_vencimiento
  if (modo_compra == "tasa" && (is.null(tasa_compra) || is.na(tasa_compra))) stop("Falta la tasa de compra.")
  if (modo_compra == "precio" && (is.null(precio_compra_directo) || is.na(precio_compra_directo))) stop("Falta el precio de compra.")
  if (!al_vencimiento) {
    if (modo_venta == "tasa" && (is.null(tasa_venta) || is.na(tasa_venta))) stop("Falta la tasa de venta.")
    if (modo_venta == "precio" && (is.null(precio_venta_directo) || is.na(precio_venta_directo))) stop("Falta el precio de venta.")
  }

  # --- Valor de la UVR en pesos en cada fecha, segun el tipo ---
  inflacion_supuesta <- NA_real_
  if (tipo == "real") {
    uvr_en <- function(f) vapply(f, function(x) uvr_en_fecha(x, uvr_df), numeric(1))
  } else {
    if (is.null(ipc_df)) stop("Para la TIR estimada se necesita la base de IPC.")
    conocida <- uvr_df[uvr_df$fecha <= fecha_compra, ]
    uvr_en_fecha(fecha_compra, conocida)   # falla con mensaje claro si no hay UVR ese dia
    inflacion_supuesta <- ipc_vigente(fecha_compra, ipc_df)$valor
    uvr_en <- function(f) uvr_proyectada(f, conocida, inflacion_supuesta)
  }

  # --- Precios (base 100): por tasa real (sucio truncado a 3 dec.) o directo ---
  tabla_bono <- construir_tabla_flujos(fecha_emision, fecha_vencimiento, periodo_cupon,
                                        tasa_cupon_real, valor_nominal)
  valorar <- function(fecha, modo, tasa, precio_directo) {
    if (modo == "tasa") {
      r <- precio_bono_fechas(fecha_emision = fecha_emision, fecha_vencimiento = fecha_vencimiento,
                              tasa_cupon_anual = tasa_cupon_real, periodo_cupon = periodo_cupon,
                              tasa_mercado_anual = tasa / 100, fecha_negociacion = fecha,
                              valor_nominal = valor_nominal)
      list(precio = r$precio_sucio_truncado, limpio = r$precio_limpio, ic = r$interes_corrido)
    } else {
      ic <- calcular_interes_corrido(tabla_bono, fecha)$interes_corrido
      list(precio = precio_directo, limpio = precio_directo - ic, ic = ic)
    }
  }
  compra <- valorar(fecha_compra, modo_compra, tasa_compra, precio_compra_directo)
  venta <- if (al_vencimiento) list(precio = valor_nominal, limpio = valor_nominal, ic = 0) else
    valorar(fecha_venta, modo_venta, tasa_venta, precio_venta_directo)

  # --- Cupones recibidos entre compra (excluida) y venta (incluida) ---
  cupones <- identificar_cupones_recibidos(fecha_emision, fecha_vencimiento, periodo_cupon,
                                            tasa_cupon_real, valor_nominal, fecha_compra, fecha_venta)

  # --- Nominal en UVR ---
  uvr_compra <- uvr_en(fecha_compra)
  nominal_uvr <- if (nominal_en == "uvr") nominal_transado else nominal_transado / uvr_compra

  # --- Flujos en UVR y en pesos ---
  fechas <- as.Date(c(fecha_compra, cupones$fecha_flujo, fecha_venta), origin = "1970-01-01")
  uvr_fechas <- c(uvr_compra, if (nrow(cupones) > 0) uvr_en(cupones$fecha_flujo), uvr_en(fecha_venta))
  base100 <- c(-compra$precio, cupones$monto, venta$precio)
  flujos_uvr <- base100 / valor_nominal * nominal_uvr
  flujos_pesos <- flujos_uvr * uvr_fechas
  # El giro de la compra y el valor de la venta se truncan a pesos enteros
  # (convencion del profesor); los cupones quedan exactos.
  n <- length(flujos_pesos)
  flujos_pesos[1] <- -truncar(-flujos_pesos[1], 0)
  flujos_pesos[n] <- truncar(flujos_pesos[n], 0)

  dias_desde_compra <- if (dias_tir == "sin_feb29") {
    as.numeric(mapply(contar_dias_365, fecha_compra, fechas))
  } else as.numeric(fechas - fecha_compra)

  tir_de <- function(montos) {
    if (all(dias_desde_compra == 0)) return(NA_real_)
    t <- calcular_tir_operacion(data.frame(fecha = fechas, dias_desde_compra = dias_desde_compra,
                                            monto = montos), base_dias)
    if (t$error) NA_real_ else t$tir
  }

  tabla <- data.frame(
    Concepto = c("Compra", if (nrow(cupones) > 0) paste("Flujo", seq_len(nrow(cupones))),
                 if (al_vencimiento) "Vencimiento" else "Venta"),
    Fecha = fechas, UVR_dia = uvr_fechas,
    Valor_UVR = flujos_uvr, Valor_pesos = flujos_pesos
  )

  list(
    tipo = tipo, al_vencimiento = al_vencimiento,
    precio_compra = compra$precio, precio_limpio_compra = compra$limpio,
    precio_venta = venta$precio, precio_limpio_venta = venta$limpio,
    nominal_uvr = nominal_uvr, uvr_compra = uvr_compra, uvr_venta = uvr_fechas[n],
    giro_compra = -flujos_pesos[1], valor_venta = flujos_pesos[n],
    cupones_pesos = sum(flujos_pesos[-c(1, n)]), pyg_pesos = sum(flujos_pesos),
    tir_pesos = tir_de(flujos_pesos), tir_uvr = tir_de(flujos_uvr),
    tabla = tabla, inflacion_supuesta = inflacion_supuesta, fecha_compra = fecha_compra
  )
}
