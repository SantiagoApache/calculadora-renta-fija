# =============================================================
# MEDIDAS DE RIESGO DE UN BONO: duracion de Macaulay, duracion modificada,
# convexidad, DV01 y sensibilidad del precio a cambios en la tasa
# =============================================================
# Convenciones del profesor (Excel "Duracion y convexidad" y hoja de
# valoracion IBR):
#   t      = dias/365 desde la fecha de negociacion (sin 29 de febrero, igual
#            que la valoracion)
#   VP     = flujo / (1 + TIR)^t, con TIR efectiva anual
#   D_Mac  = sum(t * VP) / P                                   (años)
#   D*     = D_Mac / (1 + TIR)
#   C      = sum((t^2 + t) * VP) / [ P * (1 + TIR)^(2/m) ]     (m = pagos por año)
#   DV01   = truncar(D*, 3) / 10.000 * valor de giro (cambio del valor por 1 pb)
#   Precio aproximado con un cambio dy de la tasa (sobre el precio actual,
#   el sucio truncado a 3 decimales):
#     solo duracion:          P * (1 - D* * dy)
#     duracion + convexidad:  P * (1 - D* * dy + 1/2 * C * dy^2)
# Tabla de sensibilidad: escenarios pasos_pb (en la app: -400 a +400 de 100 en 100) con el
# precio exacto, las aproximaciones, el DV01 del escenario y el cambio del valor
# de la posicion en pesos.
# Validado: Excel del profesor (8 años, cupon 10% anual, TIR 10%): D_Mac
# 5,868419; D* 5,334926; C 38,842905; precios +-100 pb 94,859288 / 105,529141.
# Hoja IBR del profesor: D_Mac 1,825; D* 1,664; precio +-100 pb 98,763 / 102,105.
# tasas_flujo (opcional): tasa EA con la que se descuenta CADA flujo (curva cero
# cupon + spread). Si se da, los VP salen de la curva, tasa_ea es la TIR
# equivalente (se usa en D* y C) y la sensibilidad desplaza toda la curva.
medidas_riesgo <- function(flujos, t_anios, tasa_ea, periodo_cupon,
                           precio_actual = NULL, factor_pesos = NA_real_,
                           cambio_pb = 100, pasos_pb = NULL,
                           tasas_flujo = NULL) {
  if (is.null(tasas_flujo)) tasas_flujo <- rep(tasa_ea, length(flujos))
  # Escenarios de la tabla (por defecto -400 a +400 pb de 100 en 100)
  if (is.null(pasos_pb)) pasos_pb <- seq(-400, 400, by = 100)
  vp <- flujos / (1 + tasas_flujo)^t_anios
  P <- sum(vp)                                   # precio sucio exacto
  if (is.null(precio_actual)) precio_actual <- truncar(P, 3)
  m <- periodo_cupon

  mac <- sum(t_anios * vp) / P
  dmod <- mac / (1 + tasa_ea)
  conv <- sum((t_anios^2 + t_anios) * vp) / (P * (1 + tasa_ea)^(2 / m))
  # DV01 (regla del profesor): D* truncada a 3 decimales / 10.000 x valor de giro.
  # Por 100 de nominal el "giro" es el precio sucio truncado; en pesos, el giro
  # de la posicion (= precio truncado x nominal / 100).
  dmod_trunc <- truncar(dmod + 1e-12, 3)
  dv01 <- dmod_trunc / 1e4 * precio_actual

  precio_exacto <- function(dy) sum(flujos / (1 + tasas_flujo + dy)^t_anios)
  aprox_d <- function(dy) precio_actual * (1 - dmod * dy)
  aprox_dc <- function(dy) precio_actual * (1 - dmod * dy + 0.5 * conv * dy^2)

  sens <- data.frame(
    Cambio_pb = pasos_pb,
    Tasa_ea = tasa_ea + pasos_pb / 1e4,
    Precio_exacto = vapply(pasos_pb / 1e4, precio_exacto, numeric(1)),
    Precio_duracion = vapply(pasos_pb / 1e4, aprox_d, numeric(1)),
    Precio_dur_conv = vapply(pasos_pb / 1e4, aprox_dc, numeric(1))
  )
  sens$Error_duracion <- sens$Precio_duracion - sens$Precio_exacto
  sens$Error_dur_conv <- sens$Precio_dur_conv - sens$Precio_exacto
  # DV01 en cada escenario: se recalcula la duracion modificada con la nueva
  # tasa (o la curva desplazada) y se aplica sobre el precio de ese escenario
  # truncado a 3 decimales (en 0 pb coincide con el DV01 principal).
  dv01_en <- function(dy) {
    vp_k <- flujos / (1 + tasas_flujo + dy)^t_anios
    P_k <- sum(vp_k)
    dmod_k <- (sum(t_anios * vp_k) / P_k) / (1 + tasa_ea + dy)
    truncar(dmod_k + 1e-12, 3) / 1e4 * truncar(P_k, 3)
  }
  sens$DV01 <- vapply(pasos_pb / 1e4, dv01_en, numeric(1))
  sens$DV01_pesos <- sens$DV01 * factor_pesos
  sens$Cambio_valor_pesos <- (sens$Precio_exacto - P) * factor_pesos

  dy <- cambio_pb / 1e4
  list(
    precio = P, precio_actual = precio_actual, tasa_ea = tasa_ea,
    duracion_macaulay = mac, duracion_modificada = dmod, convexidad = conv,
    dv01 = dv01, dv01_pesos = dv01 * factor_pesos, duracion_modificada_trunc = dmod_trunc,
    cambio_pb = cambio_pb,
    sube = list(exacto = precio_exacto(dy), duracion = aprox_d(dy), dur_conv = aprox_dc(dy)),
    baja = list(exacto = precio_exacto(-dy), duracion = aprox_d(-dy), dur_conv = aprox_dc(-dy)),
    tabla_flujos = data.frame(t = t_anios, Flujo = flujos, VP = vp, t_VP = t_anios * vp,
                              t2t_VP = (t_anios^2 + t_anios) * vp),
    sensibilidad = sens
  )
}

# =============================================================
# VALORACION CON CURVA CERO CUPON (CC) + SPREAD
# =============================================================
# Archivo Excel (primera hoja): columna 1 = plazo en AÑOS (numero) o FECHA;
# columna 2 = tasa cero cupon efectiva anual (en % o decimal).
# Cada flujo se descuenta con su propia tasa: z(t) + spread, donde z(t) se
# interpola linealmente en el plazo t (dias/365 sin 29-feb); fuera del rango
# de la curva se usa la tasa del extremo mas cercano.
cargar_curva_cc <- function(ruta) {
  crudo <- readxl::read_excel(ruta, sheet = 1)
  if (ncol(crudo) < 2) stop("La curva cero cupon debe tener dos columnas: Plazo (años) o Fecha, y Tasa EA.")
  x <- crudo[[1]]
  es_fecha <- inherits(x, "POSIXct") || inherits(x, "Date")
  tasa <- suppressWarnings(as.numeric(crudo[[2]]))
  if (es_fecha) {
    x <- as.Date(x)
  } else {
    x <- suppressWarnings(as.numeric(x))
  }
  ok <- !is.na(x) & !is.na(tasa)
  if (sum(ok) < 1) stop("La curva cero cupon no tiene datos validos (Plazo o Fecha, Tasa).")
  x <- x[ok]; tasa <- tasa[ok]
  if (stats::median(tasa) > 1) tasa <- tasa / 100
  df <- data.frame(x = x, tasa = tasa)
  df <- df[order(df$x), ]
  attr(df, "tipo") <- if (es_fecha) "fecha" else "plazo"
  df
}

# Tasa cero cupon para plazos t (años) desde la fecha de valoracion
tasa_cc <- function(t_anios, curva, fecha_valoracion) {
  if (identical(attr(curva, "tipo"), "fecha")) {
    plazos <- as.numeric(mapply(contar_dias_365, as.Date(fecha_valoracion), curva$x)) / 365
  } else {
    plazos <- curva$x
  }
  if (length(plazos) == 1) return(rep(curva$tasa, length(t_anios)))
  stats::approx(plazos, curva$tasa, xout = t_anios, rule = 2, ties = mean)$y
}

# Valora un bono de tasa fija (resultado de precio_bono_fechas) con la curva
# CC + spread (en puntos basicos). Devuelve la misma estructura del motor
# TES (precio sucio, truncado, limpio, VP...) mas la TIR equivalente.
valorar_tes_con_curva <- function(res_tes, curva, spread_pb, fecha_negociacion, valor_nominal = 100) {
  z <- tasa_cc(res_tes$t_anios, curva, fecha_negociacion)
  tasas <- z + spread_pb / 1e4
  vp <- res_tes$flujos / (1 + tasas)^res_tes$t_anios
  P <- sum(vp)
  tir <- stats::uniroot(function(y) sum(res_tes$flujos / (1 + y)^res_tes$t_anios) - P,
                        c(-0.5, 2), tol = 1e-14)$root
  out <- res_tes
  out$valores_presentes <- vp
  out$precio_sucio <- P
  out$precio_sucio_truncado <- truncar(P, 3)
  out$precio_limpio <- out$precio_sucio_truncado - res_tes$interes_corrido
  tol <- valor_nominal * 0.0001
  out$clasificacion <- if (abs(out$precio_limpio - valor_nominal) < tol) "A la par" else
    if (out$precio_limpio < valor_nominal) "Con descuento" else "Con prima"
  out$tasa_cc <- z
  out$tasas_flujo <- tasas
  out$tir_equivalente <- tir
  out$spread_pb <- spread_pb
  out
}
