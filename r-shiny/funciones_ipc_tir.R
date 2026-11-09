# =============================================================
# RENTABILIDAD (TIR) DE UNA OPERACION CON BONO IPC
# =============================================================
# Requiere haber cargado antes: funciones_modulo1.R, funciones_modulo2.R
# (calcular_tir_operacion) y funciones_ipc.R (motor IPC). No modifica nada
# de esos archivos.
#
# Dos usos con el MISMO calculo, cambiando solo la serie de IPC visible:
#
#  * tipo = "real": rentabilidad de la operacion ya realizada (o que se
#    evalua a posteriori). Se usan los IPC realmente publicados:
#       - Cada cupon recibido usa el IPC de SU propio periodo:
#            modo "inicio": IPC vigente al INICIO del periodo del cupon
#            modo "final" : IPC vigente al FINAL del periodo del cupon
#       - La venta se valora con el motor IPC en la fecha de venta
#         (primer cupon segun el modo, con tope en la fecha de venta).
#
#  * tipo = "estimada": rentabilidad esperada al momento de INVERTIR. Solo
#    se conocen los IPC publicados hasta la fecha de compra; los datos
#    posteriores se desconocen y se asume que el IPC vigente a la compra
#    se mantiene constante (regla ya usada en el calculo del bono IPC).
#    Se implementa recortando la serie a fecha <= fecha de compra.
#
# La compra y la venta se pueden ingresar por TASA de mercado (el precio
# sucio se TRUNCA a 3 decimales, base 100) o por PRECIO sucio directo.
# Si la venta es el dia del vencimiento, el bono se redime a su valor
# nominal (ademas del ultimo cupon).

# -------------------------------------------------------------
# Pronostico de IPC (opcional, solo para la TIR estimada)
# -------------------------------------------------------------
# Archivo con columnas Fecha (primer dia de cada mes) e IPC (inflacion anual
# pronosticada, en decimal, ej. 0.0629; si vienen en %, ej. 6.29, se detecta).
# El dato de cada mes se trata como el IPC de ESE mes y, igual que la serie
# publicada, queda vigente desde el ultimo dia del mes (por eso se convierte
# la fecha al fin de mes: en octubre rige el pronostico de septiembre).
# Devuelve data.frame(fecha, inflacion) con inflacion en % (como cargar_ipc).
cargar_pronostico_ipc <- function(ruta) {
  crudo <- readxl::read_excel(ruta, sheet = 1)
  if (ncol(crudo) < 2) stop("El archivo de pronostico debe tener dos columnas: Fecha e IPC.")
  fechas <- as.Date(crudo[[1]])
  valores <- suppressWarnings(as.numeric(crudo[[2]]))
  ok <- !is.na(fechas) & !is.na(valores)
  if (!any(ok)) stop("El archivo de pronostico no tiene el formato esperado (Fecha, IPC).")
  fechas <- fechas[ok]; valores <- valores[ok]
  if (max(abs(valores)) < 1) valores <- valores * 100          # venia en decimal
  # Fin de mes: primer dia del mes siguiente menos un dia
  primero <- as.Date(format(fechas, "%Y-%m-01"))
  fin_mes <- seq(min(primero), by = "month", length.out = 2)[2]  # solo para fijar la clase
  fin_mes <- as.Date(vapply(primero, function(d) as.numeric(seq(d, by = "month", length.out = 2)[2]) - 1,
                            numeric(1)), origin = "1970-01-01")
  out <- data.frame(fecha = fin_mes, inflacion = valores)
  out <- out[order(out$fecha), ]
  rownames(out) <- NULL
  out
}

# Dias entre dos fechas en base 30/360 (cada mes de 30 dias; dia 31 -> 30)
dias_30_360 <- function(desde, hasta) {
  desde <- as.Date(desde); hasta <- as.Date(hasta)
  una <- function(a, b) {
    d1 <- min(as.integer(format(a, "%d")), 30); d2 <- min(as.integer(format(b, "%d")), 30)
    360 * (as.integer(format(b, "%Y")) - as.integer(format(a, "%Y"))) +
      30 * (as.integer(format(b, "%m")) - as.integer(format(a, "%m"))) + (d2 - d1)
  }
  as.numeric(mapply(una, desde, hasta))
}

rentabilidad_ipc <- function(tipo = "real",
                              fecha_emision, fecha_vencimiento, periodo_cupon,
                              spread_ea, modo_ipc,
                              fecha_compra, modo_compra = "tasa",
                              tasa_compra = NULL, tipo_tasa_compra = "total",
                              precio_compra_directo = NULL,
                              fecha_venta, modo_venta = "tasa",
                              tasa_venta = NULL, tipo_tasa_venta = "total",
                              precio_venta_directo = NULL,
                              ipc_df, valor_nominal = 100, monto_pesos = NULL,
                              dias_tir = "reales", base_dias = 365,
                              ipc_pronostico = NULL, base = "365") {

  stopifnot(tipo %in% c("real", "estimada"), modo_ipc %in% c("inicio", "final"),
            dias_tir %in% c("sin_feb29", "reales"), base %in% c("365", "30_360"))

  # Base de dias: "365" = dias reales sin 29-feb sobre 365 (convencion del proyecto);
  # "30_360" = meses de 30 dias sobre 360 (cupon trimestral = exponente 1/4).
  # En 30/360 se aplica a los cupones y a la TIR de la operacion.
  den <- if (base == "30_360") 360 else base_dias
  dias_fn <- if (base == "30_360") dias_30_360 else contar_dias_365

  fecha_emision <- as.Date(fecha_emision)
  fecha_vencimiento <- as.Date(fecha_vencimiento)
  fecha_compra <- as.Date(fecha_compra)
  fecha_venta <- as.Date(fecha_venta)

  if (fecha_vencimiento <= fecha_emision) stop("La fecha de vencimiento debe ser posterior a la emision.")
  if (fecha_compra < fecha_emision || fecha_compra >= fecha_vencimiento) {
    stop("La fecha de compra debe estar entre la emision y el vencimiento (sin incluirlo).")
  }
  if (fecha_venta < fecha_compra) stop("La fecha de venta no puede ser anterior a la fecha de compra.")
  if (fecha_venta > fecha_vencimiento) stop("La fecha de venta no puede ser posterior al vencimiento.")
  if (modo_compra == "tasa" && (is.null(tasa_compra) || is.na(tasa_compra))) stop("Falta la tasa de compra.")
  if (modo_compra == "precio" && (is.null(precio_compra_directo) || is.na(precio_compra_directo))) stop("Falta el precio de compra.")
  al_vencimiento <- fecha_venta == fecha_vencimiento
  if (base == "30_360" && (modo_compra == "tasa" || (!al_vencimiento && modo_venta == "tasa"))) {
    stop("Con base 30/360 ingresa la compra y la venta por precio sucio directo (la valoracion por tasa de mercado solo esta disponible en base 365/365).")
  }
  if (!al_vencimiento) {
    if (modo_venta == "tasa" && (is.null(tasa_venta) || is.na(tasa_venta))) stop("Falta la tasa de venta.")
    if (modo_venta == "precio" && (is.null(precio_venta_directo) || is.na(precio_venta_directo))) stop("Falta el precio de venta.")
  }

  # --- Serie de IPC visible segun el tipo de calculo ---
  ipc_trabajo <- if (tipo == "estimada") ipc_df[ipc_df$fecha <= fecha_compra, ] else ipc_df
  # Estimada con pronostico: despues del ultimo IPC publicado a la compra rigen
  # los valores pronosticados (en vez de mantener el IPC constante).
  if (tipo == "estimada" && !is.null(ipc_pronostico) && nrow(ipc_pronostico) > 0) {
    ultimo_publicado <- if (nrow(ipc_trabajo) > 0) max(ipc_trabajo$fecha) else as.Date("1900-01-01")
    futuro <- ipc_pronostico[ipc_pronostico$fecha > ultimo_publicado, c("fecha", "inflacion")]
    ipc_trabajo <- rbind(ipc_trabajo[, c("fecha", "inflacion")], futuro)
    ipc_trabajo <- ipc_trabajo[order(ipc_trabajo$fecha), ]
  }
  if (nrow(ipc_trabajo) == 0) {
    stop(sprintf("No hay IPC publicado en o antes del %s (la serie empieza el %s).",
                 format(fecha_compra), format(min(ipc_df$fecha))))
  }

  # --- Valoracion de una fecha (compra o venta) con el motor IPC ---
  valorar <- function(fecha, modo, tasa, tipo_tasa, precio_directo) {
    if (base == "30_360") {
      # Precio directo; el cupon corrido se calcula en 30/360 con el cupon del periodo en curso
      cal <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)
      ini <- c(fecha_emision, cal[-length(cal)])
      k <- which(ini <= fecha & cal > fecha)
      ref <- if (modo_ipc == "inicio") ini[k] else min(cal[k], fecha)
      tasa_k <- combinar_ipc_spread(ipc_vigente(ref, ipc_trabajo)$valor, spread_ea)
      cupon_k <- valor_nominal * ((1 + tasa_k)^(dias_30_360(ini[k], cal[k]) / den) - 1)
      ic <- cupon_k * dias_30_360(ini[k], fecha) / dias_30_360(ini[k], cal[k])
      return(list(precio = precio_directo, limpio = precio_directo - ic,
                  interes_corrido = ic, motor = NULL))
    }
    res <- precio_bono_ipc(
      fecha_emision = fecha_emision, fecha_vencimiento = fecha_vencimiento,
      periodo_cupon = periodo_cupon, spread_ea = spread_ea, modo_ipc = modo_ipc,
      # Si el precio es directo, la tasa no se usa; el interes corrido (que
      # no depende de la tasa de mercado) se toma del mismo motor.
      tasa_mercado_anual = if (modo == "tasa") tasa else 0,
      fecha_negociacion = fecha, ipc_df = ipc_trabajo,
      tipo_tasa_mercado = tipo_tasa, valor_nominal = valor_nominal, base_dias = base_dias
    )
    precio <- if (modo == "tasa") res$precio_sucio_truncado else precio_directo
    list(precio = precio, limpio = precio - res$interes_corrido,
         interes_corrido = res$interes_corrido, motor = res)
  }

  compra <- valorar(fecha_compra, modo_compra, if (modo_compra == "tasa") tasa_compra / 100 else NULL,
                    tipo_tasa_compra, precio_compra_directo)

  if (al_vencimiento) {
    venta <- list(precio = valor_nominal, limpio = valor_nominal, interes_corrido = 0, motor = NULL)
  } else {
    venta <- valorar(fecha_venta, modo_venta, if (modo_venta == "tasa") tasa_venta / 100 else NULL,
                     tipo_tasa_venta, precio_venta_directo)
  }

  # --- Cupones recibidos entre la compra (excluida) y la venta (incluida) ---
  calendario <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)
  inicio_periodo <- c(fecha_emision, calendario[-length(calendario)])
  recibidos <- which(calendario > fecha_compra & calendario <= fecha_venta)

  cupones <- data.frame(
    fecha = calendario[recibidos],
    inicio_periodo = inicio_periodo[recibidos]
  )
  if (length(recibidos) > 0) {
    cupones$fecha_ref_ipc <- if (modo_ipc == "inicio") cupones$inicio_periodo else cupones$fecha
    ipcs <- lapply(cupones$fecha_ref_ipc, ipc_vigente, ipc_df = ipc_trabajo)
    cupones$ipc <- vapply(ipcs, function(x) x$valor, numeric(1))
    cupones$fecha_dato_ipc <- as.Date(vapply(ipcs, function(x) as.numeric(x$fecha_ipc), numeric(1)),
                                       origin = "1970-01-01")
    cupones$tasa_ea <- combinar_ipc_spread(cupones$ipc, spread_ea)
    dias_p <- as.numeric(mapply(dias_fn, cupones$inicio_periodo, cupones$fecha))
    # Tasa del cupon del periodo redondeada a 4 decimales en % (6 como fraccion),
    # como el formulario del profesor (3,41293205% -> 3,4129%)
    cupones$monto <- valor_nominal * round((1 + cupones$tasa_ea)^(dias_p / den) - 1, 6)
  } else {
    cupones$fecha_ref_ipc <- as.Date(character(0)); cupones$ipc <- numeric(0)
    cupones$fecha_dato_ipc <- as.Date(character(0)); cupones$tasa_ea <- numeric(0)
    cupones$monto <- numeric(0)
  }

  # --- Flujos de la operacion (base 100) y TIR ---
  ipc_compra <- ipc_vigente(fecha_compra, ipc_trabajo)
  ipc_venta <- ipc_vigente(fecha_venta, ipc_trabajo)

  fechas <- as.Date(c(fecha_compra, cupones$fecha, fecha_venta), origin = "1970-01-01")
  montos <- c(-compra$precio, cupones$monto, venta$precio)
  dias_desde_compra <- if (base == "30_360") {
    dias_30_360(fecha_compra, fechas)
  } else if (dias_tir == "sin_feb29") {
    as.numeric(mapply(contar_dias_365, fecha_compra, fechas))
  } else {
    as.numeric(fechas - fecha_compra)
  }
  flujos <- data.frame(fecha = fechas, dias_desde_compra = dias_desde_compra, monto = montos)

  if (all(dias_desde_compra == 0)) {
    tir <- NA_real_   # operacion intradia: no hay tiempo para anualizar
  } else {
    t <- calcular_tir_operacion(flujos, den)
    tir <- if (t$error) NA_real_ else t$tir
  }

  # --- Tabla estilo "Rentabilidad Inversion IPC" (en pesos) ---
  factor <- if (is.null(monto_pesos)) NA_real_ else monto_pesos / valor_nominal
  tabla <- data.frame(
    Concepto = c("Compra", if (nrow(cupones) > 0) paste("Flujo", seq_len(nrow(cupones))),
                 if (al_vencimiento) "Vencimiento" else "Venta"),
    Fecha_transaccion = fechas,
    Valor_transaccion = montos * factor,
    Fecha_referencia_IPC = as.Date(c(fecha_compra, cupones$fecha_ref_ipc, fecha_venta), origin = "1970-01-01"),
    IPC_usado = c(ipc_compra$valor, cupones$ipc, ipc_venta$valor),
    stringsAsFactors = FALSE
  )

  list(
    tipo = tipo, al_vencimiento = al_vencimiento,
    precio_compra = compra$precio, precio_limpio_compra = compra$limpio,
    precio_venta = venta$precio, precio_limpio_venta = venta$limpio,
    giro_compra = compra$precio * factor, valor_venta = venta$precio * factor,
    cupones_pesos = sum(cupones$monto) * factor,
    pyg_pesos = sum(montos) * factor,
    cupones = cupones, flujos = flujos, tabla = tabla, tir = tir,
    ipc_compra = ipc_compra, ipc_venta = ipc_venta,
    motor_venta = venta$motor, dias_tir = dias_tir, base = base,
    con_pronostico = tipo == "estimada" && !is.null(ipc_pronostico) && nrow(ipc_pronostico) > 0
  )
}
