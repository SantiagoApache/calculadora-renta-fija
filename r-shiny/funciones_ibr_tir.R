# =============================================================
# RENTABILIDAD (TIR) DE UN BONO IBR MANTENIDO AL VENCIMIENTO
# =============================================================
# Requiere: funciones_modulo1.R (generar_calendario_cupones), funciones_modulo2.R
# (calcular_tir_operacion) y funciones_ibr.R (base de IBR y tasa aplicable).
#
# Bono IBR (confirmado): bullet (cupones + principal al vencimiento), tasas
# NOMINALES anuales, base 30/360:
#     cupon del periodo = VN * (IBR + spread) / pagos_por_año
# El IBR de cada cupon es el vigente al INICIO de su periodo (el cupon se
# fija en anticipado y se paga al final).
#
# Dos usos, interfaces separadas:
#  * "estimada": el IBR de cada cupon sale de la curva FR del profesor, en la
#    fecha de inicio del periodo, SIN ajuste por festivos (la curva ya es una
#    proyeccion). Opcion desfase_proyectado: 0 = misma fecha, 1 = dia anterior.
#  * "real": el IBR sale de la base publicada por el Banco de la Republica,
#    con la regla de dia habil/festivos (fecha_ibr_aplicable). Los periodos
#    cuyo IBR aun no esta publicado se ESTIMAN con la curva FR y se marcan
#    como "Est." (igual que el "Flujo Est. 12" del formulario del profesor).
#
# La TIR se anualiza con DIAS REALES / 365 (como XIRR de Excel): es lo que
# reproduce las TIR del formulario del profesor (11,51% y 12,26%).

# -------------------------------------------------------------
# Curva FR (Excel del profesor: Fecha, Tasa FR; diaria, nominal anual)
# -------------------------------------------------------------
cargar_curva_fra <- function(ruta, hoja = 1) {
  crudo <- readxl::read_excel(ruta, sheet = hoja)
  if (ncol(crudo) < 2) stop("La curva FR debe tener dos columnas: Fecha y Tasa.")
  fechas <- tryCatch(as.Date(crudo[[1]]), error = function(e) rep(NA, nrow(crudo)))
  tasa <- suppressWarnings(as.numeric(crudo[[2]]))      # celdas con #REF!/#DIV/0! quedan NA
  ok <- !is.na(fechas) & !is.na(tasa)
  if (!any(ok)) stop("La curva FR no tiene el formato esperado (Fecha, Tasa).")
  tasa <- tasa[ok]; fechas <- fechas[ok]
  # Unidades segun la mediana (no el maximo: al final de las curvas del
  # profesor hay filas dañadas con valores como 13,59 antes de los #REF!)
  if (stats::median(tasa) > 1) tasa <- tasa / 100        # venia en %
  # Se descartan las filas dañadas: tasas negativas o mayores al 100%
  validas <- tasa > 0 & tasa < 1
  df <- data.frame(fecha = fechas[validas], tasa = tasa[validas])
  df <- df[order(df$fecha), ]
  df <- df[!duplicated(df$fecha), ]
  rownames(df) <- NULL
  attr(df, "descartadas") <- sum(!validas)
  df
}

# Carga TODAS las hojas de un archivo de curvas (cada hoja = una curva
# publicada en una fecha; ej. "FRA 2024-10-22" y "FRA 2025-06-11"). Devuelve
# una lista de curvas ordenada por fecha de inicio; cada una con attr "nombre".
cargar_curvas_fra <- function(ruta) {
  hojas <- readxl::excel_sheets(ruta)
  curvas <- list()
  for (h in hojas) {
    c <- tryCatch(cargar_curva_fra(ruta, h), error = function(e) NULL)
    if (!is.null(c) && nrow(c) > 0) { attr(c, "nombre") <- h; curvas[[length(curvas) + 1]] <- c }
  }
  if (length(curvas) == 0) stop("Ninguna hoja del archivo tiene el formato de curva (Fecha, Tasa).")
  curvas[order(vapply(curvas, function(c) as.numeric(min(c$fecha)), numeric(1)))]
}

# Busca la curva en la carpeta de la app ("Curva...xlsx" o "FR...xlsx")
encontrar_archivo_fra <- function(carpeta = ".") {
  candidatos <- list.files(carpeta, pattern = "^(Curva|FR).*\\.xlsx$", ignore.case = TRUE, full.names = TRUE)
  candidatos <- candidatos[!startsWith(basename(candidatos), "~$")]
  # Solo sirve un archivo cuya primera columna sean FECHAS (no una curva cero
  # cupon por plazos en años, que tambien podria llamarse "Curva...")
  for (f in candidatos) {
    c <- tryCatch(cargar_curva_fra(f), error = function(e) NULL)
    if (!is.null(c) && nrow(c) > 0 && min(c$fecha) > as.Date("2000-01-01")) return(f)
  }
  NA_character_
}

# IBR proyectado en una fecha: la tasa de la curva en esa fecha
# (o desfase_dias antes); si la fecha no esta en la curva usa la anterior.
ibr_proyectado <- function(fecha, fra_df, desfase_dias = 0) {
  D <- as.Date(fecha) - desfase_dias
  # Si la fecha esta dentro de la curva pero el desfase la saca por el borde
  # inicial, se usa el primer dato de la curva
  if (D < min(fra_df$fecha) && as.Date(fecha) >= min(fra_df$fecha)) D <- min(fra_df$fecha)
  if (D < min(fra_df$fecha) || D > max(fra_df$fecha)) {
    stop(sprintf("La curva FR solo cubre del %s al %s y se necesita la tasa del %s.",
                 format(min(fra_df$fecha)), format(max(fra_df$fecha)), format(D)))
  }
  fila <- fra_df[fra_df$fecha <= D, ]
  fila <- fila[which.max(fila$fecha), ]
  list(valor = fila$tasa, fecha_dato = fila$fecha)
}

# -------------------------------------------------------------
# Rentabilidad de una operacion con bono IBR (compra y venta o vencimiento)
# -------------------------------------------------------------
# spread_nominal: decimal nominal anual (1,10% -> 0.011).
# tenor: "auto" (segun la periodicidad: mensual->1m, trimestral->3m,
#        semestral->6m, anual->12m) u "overnight","1m","3m","6m","12m".
# Compra y venta: por precio sucio directo ("precio"), por TIR de negociacion
# EA ("tir": flujos proyectados descontados a la TIR) o por IBR + spread
# ("tasa": IBR vigente constante, metodo del ejercicio Davivienda).
# fecha_venta = NULL o el vencimiento -> se mantiene al vencimiento.
#
# Informacion disponible en una fecha V para el IBR de un periodo que inicia en D:
#   D <= V : IBR publicado (regla de dias habiles); si no esta publicado, curva FR.
#   D >  V : curva FR si la curva ya existia en V (V >= inicio de la curva);
#            si no, el IBR vigente en V, constante.
# Pestaña real: cupones recibidos con lo publicado (o curva "Est."); la venta
#   se valora con la informacion del dia de la venta.
# Pestaña estimada: los cupones con la informacion del dia de compra; cada
#   negociacion (compra y venta) se valora parada en su propia fecha: IBR
#   publicados hasta ese dia y la curva FR vigente ese dia de ahi en adelante.
rentabilidad_ibr <- function(tipo = "real",
                              fecha_emision, fecha_vencimiento, periodo_cupon,
                              spread_nominal, tenor = "auto",
                              fecha_compra, precio_compra = 100,
                              valor_nominal = 100, monto_pesos = NULL,
                              ibr_df = NULL, fra_df = NULL, desfase_proyectado = 0,
                              modo_compra = "precio", spread_negociacion = NULL,
                              tir_negociacion = NULL,
                              fecha_venta = NULL, modo_venta = "precio", precio_venta = NULL,
                              spread_negociacion_venta = NULL, tir_negociacion_venta = NULL,
                              metodo_descuento = "promedio") {

  stopifnot(tipo %in% c("real", "estimada"))
  stopifnot(metodo_descuento %in% c("promedio", "vigente"))
  fecha_emision <- as.Date(fecha_emision); fecha_vencimiento <- as.Date(fecha_vencimiento)
  fecha_compra <- as.Date(fecha_compra)
  fecha_venta <- if (is.null(fecha_venta)) fecha_vencimiento else as.Date(fecha_venta)
  al_vencimiento <- fecha_venta == fecha_vencimiento

  if (fecha_vencimiento <= fecha_emision) stop("La fecha de vencimiento debe ser posterior a la emision.")
  if (fecha_compra < fecha_emision || fecha_compra >= fecha_vencimiento) {
    stop("La fecha de compra debe estar entre la emision y el vencimiento (sin incluirlo).")
  }
  if (fecha_venta <= fecha_compra) stop("La fecha de venta debe ser posterior a la fecha de compra.")
  if (fecha_venta > fecha_vencimiento) stop("La fecha de venta no puede ser posterior al vencimiento.")

  revisar_modo <- function(modo, precio, spread, tir, que) {
    if (!modo %in% c("precio", "tasa", "tir")) stop("Modo de negociacion no valido.")
    if (modo == "precio" && (is.null(precio) || is.na(precio) || precio <= 0)) stop(sprintf("Falta el precio de %s.", que))
    if (modo == "tasa" && (is.null(spread) || is.na(spread))) stop(sprintf("Falta el spread de negociacion de la %s.", que))
    if (modo == "tir" && (is.null(tir) || is.na(tir))) stop(sprintf("Falta la TIR de negociacion de la %s.", que))
  }
  revisar_modo(modo_compra, precio_compra, spread_negociacion, tir_negociacion, "compra")
  if (!al_vencimiento) revisar_modo(modo_venta, precio_venta, spread_negociacion_venta, tir_negociacion_venta, "venta")

  if (tipo == "real" && is.null(ibr_df)) stop("Para la rentabilidad real se necesita la base de IBR del Banco de la Republica.")
  if (tipo == "estimada" && is.null(fra_df)) stop("Para la rentabilidad proyectada se necesita la curva FR.")

  if (tenor == "auto") {
    tenor <- c("12" = "1m", "4" = "3m", "2" = "6m", "1" = "12m")[as.character(periodo_cupon)]
    if (is.na(tenor)) stop("Con esta periodicidad elige el plazo del IBR manualmente.")
    tenor <- unname(tenor)
  }

  calendario <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)
  inicio_periodo <- c(fecha_emision, calendario[-length(calendario)])
  # Curvas FR: una (data.frame) o varias (lista, una por fecha de publicacion).
  # En cada fecha V se usa la curva vigente: la ultima que empezo en o antes de V.
  curvas <- if (is.null(fra_df)) list() else if (is.data.frame(fra_df)) list(fra_df) else fra_df
  curvas <- Filter(function(c) !is.null(c) && nrow(c) > 0, curvas)
  for (i in seq_along(curvas)) if (is.null(attr(curvas[[i]], "nombre"))) {
    attr(curvas[[i]], "nombre") <- paste("curva del", format(min(curvas[[i]]$fecha)))
  }
  inicio_curva <- vapply(curvas, function(c) as.numeric(min(c$fecha)), numeric(1))
  curva_en <- function(V) {
    k <- which(inicio_curva <= as.numeric(as.Date(V)))
    if (length(k) == 0) NULL else curvas[[k[which.max(inicio_curva[k])]]]
  }

  # --- Fuentes de IBR ---
  publicado <- function(D) {
    if (is.null(ibr_df)) return(NULL)
    tryCatch(obtener_ibr_real(D, tenor, ibr_df), ibr_no_publicado = function(e) NULL)
  }
  desde_curva <- function(D, fuente, curva) {
    p <- ibr_proyectado(D, curva, desfase_proyectado)
    list(valor = p$valor, fuente = fuente, fecha_dato = p$fecha_dato, retroceso = FALSE,
         curva = attr(curva, "nombre"))
  }
  fuente_curva <- if (tipo == "real") "Estimada (curva FR)" else "Curva FR"
  texto_curvas <- function() if (length(curvas) == 0) "no hay curva FR cargada" else
    paste("las curvas FR empiezan el", paste(format(as.Date(inicio_curva, origin = "1970-01-01")), collapse = " / "))
  # IBR del periodo que inicia en D con la informacion disponible en V
  info <- function(D, V, etiqueta_v = "a la compra") {
    cv <- curva_en(V)
    if (D <= V) {
      r <- publicado(D)
      if (!is.null(r)) return(list(valor = r$valor, fuente = "Publicada", fecha_dato = r$fecha_dato, retroceso = r$retroceso))
      if (!is.null(cv) && D >= min(cv$fecha)) return(desde_curva(D, fuente_curva, cv))
      if (is.null(ibr_df)) stop(sprintf("No hay IBR para el %s: carga la base de IBR o una curva FR que cubra esa fecha (%s).", format(D), texto_curvas()))
      stop(sprintf("El IBR aplicable al %s aun no esta publicado y no hay curva FR vigente en esa fecha (%s).", format(D), texto_curvas()))
    }
    if (!is.null(cv) && D >= min(cv$fecha)) return(desde_curva(D, fuente_curva, cv))
    r <- publicado(V)
    if (!is.null(r)) {
      return(list(valor = r$valor, fuente = paste0("IBR vigente ", etiqueta_v, " (constante)"),
                  fecha_dato = r$fecha_dato, retroceso = r$retroceso))
    }
    if (!is.null(cv)) return(desde_curva(V, fuente_curva, cv))
    stop(sprintf("No hay IBR publicado para el %s ni curva FR vigente en esa fecha (%s).", format(V), texto_curvas()))
  }

  redondear_pct <- function(cupon, dec) floor(cupon / valor_nominal * 100 * 10^dec + 0.5 + 1e-9) / 10^dec * valor_nominal / 100

  # --- Valoracion en una fecha V (compra o venta) ---
  # fecha_info: hasta que fecha se conoce la informacion (V en la real; la
  # compra en la estimada).
  # Dias 30/360 (cada mes de 30 dias; dia 31 -> 30) para el cupon corrido
  dias30 <- function(a, b) {
    a <- as.POSIXlt(a); b <- as.POSIXlt(b)
    360 * (b$year - a$year) + 30 * (b$mon - a$mon) + (min(b$mday, 30) - min(a$mday, 30))
  }

  valorar_en <- function(V, modo, precio, spread_neg, tir_neg, fecha_info, etiqueta_v) {
    fut <- which(calendario > V)
    # Cupon en curso y cupon corrido (base 30/360): cupon * dias30 transcurridos / dias30 del periodo
    ini_cur <- inicio_periodo[fut[1]]
    ibr_cur <- info(ini_cur, fecha_info, etiqueta_v)
    cupon_cur <- valor_nominal * (ibr_cur$valor + spread_nominal) / periodo_cupon
    cc <- cupon_cur * dias30(ini_cur, V) / dias30(ini_cur, calendario[fut[1]])
    limpio <- function(sucio) truncar(sucio - cc, 3)

    if (modo == "precio") {
      return(list(precio = precio, valoracion = NULL, cupon_corrido = cc, precio_limpio = limpio(precio)))
    }
    cv <- curva_en(fecha_info)
    nombre_curva <- if (is.null(cv)) NA_character_ else attr(cv, "nombre")
    proy <- lapply(inicio_periodo[fut], info, V = fecha_info, etiqueta_v = etiqueta_v)
    ibr_p <- vapply(proy, function(x) x$valor, numeric(1))
    dias <- as.numeric(mapply(contar_dias_365, V, calendario[fut]))

    if (modo == "tir") {
      # TIR de negociacion EA (hoja de valoracion del profesor): flujos redondeados a 6 decimales en %
      flu <- redondear_pct(valor_nominal * (ibr_p + spread_nominal) / periodo_cupon, 6)
      flu[length(flu)] <- flu[length(flu)] + valor_nominal
      vp <- flu / (1 + tir_neg)^(dias / 365)
      v <- list(metodo = "tir", tasa_descuento_ea = tir_neg)
    } else {
      # IBR + spread de negociacion. Flujos con el IBR publicado (cupon en curso) y la
      # curva FR (los siguientes), sin redondear. Una sola tasa de descuento:
      #   "promedio": TIR EA = EFFECT(promedio de los IBR proyectados + spread, m)
      #   "vigente" : TIR EA = EFFECT(IBR vigente en V + spread, m)  (ejercicio Davivienda)
      # VP = flujo / (1 + TIR EA)^(dias/365).
      flu <- valor_nominal * (ibr_p + spread_nominal) / periodo_cupon
      flu[length(flu)] <- flu[length(flu)] + valor_nominal
      ibr_vig <- info(V, fecha_info, etiqueta_v)
      base <- if (metodo_descuento == "vigente") ibr_vig$valor else mean(ibr_p)
      tasa_na <- base + spread_neg
      tasa_ea <- (1 + tasa_na / periodo_cupon)^periodo_cupon - 1
      vp <- flu / (1 + tasa_ea)^(dias / 365)
      v <- list(metodo = "spread", metodo_descuento = metodo_descuento,
                ibr_periodo = ibr_cur$valor, ibr_vigente = ibr_vig$valor, ibr_promedio = mean(ibr_p),
                fuente_ibr_vigente = ibr_vig$fuente, fecha_dato_ibr_vigente = ibr_vig$fecha_dato,
                tasa_negociacion_na = tasa_na, tasa_vigente_na = ibr_vig$valor + spread_neg,
                tasa_vigente_ea = (1 + (ibr_vig$valor + spread_neg) / periodo_cupon)^periodo_cupon - 1,
                tasa_descuento_ea = tasa_ea)
    }
    v$precio_sucio <- sum(vp)
    v$precio_sucio_truncado <- truncar(sum(vp), 3)
    v$cupon_corrido <- cc
    v$precio_limpio <- limpio(sum(vp))
    v$curva <- nombre_curva
    v$tabla <- data.frame(Fecha_cupon = calendario[fut], Dias_descuento = dias, IBR = ibr_p, Flujo = flu, VP = vp)
    list(precio = v$precio_sucio_truncado, valoracion = v, cupon_corrido = cc, precio_limpio = v$precio_limpio)
  }

  # --- Compra ---
  compra <- valorar_en(fecha_compra, modo_compra, precio_compra, spread_negociacion, tir_negociacion,
                       fecha_compra, "a la compra")
  precio_compra <- compra$precio

  # --- Base para el riesgo (duracion, convexidad, DV01) en la fecha de compra ---
  # Flujos proyectados con la informacion de la compra y la TIR de valoracion
  # (la de la negociacion; si la compra es por precio directo, la TIR implicita).
  riesgo_base <- tryCatch({
    v <- compra$valoracion
    if (!is.null(v)) {
      list(fechas = v$tabla$Fecha_cupon, flujos = v$tabla$Flujo, t = v$tabla$Dias_descuento / 365,
           tasa = v$tasa_descuento_ea, origen = "negociacion")
    } else {
      fut <- which(calendario > fecha_compra)
      proy <- lapply(inicio_periodo[fut], info, V = fecha_compra, etiqueta_v = "a la compra")
      ib <- vapply(proy, function(x) x$valor, numeric(1))
      flu <- redondear_pct(valor_nominal * (ib + spread_nominal) / periodo_cupon, 6)
      flu[length(flu)] <- flu[length(flu)] + valor_nominal
      tt <- as.numeric(mapply(contar_dias_365, fecha_compra, calendario[fut])) / 365
      y <- stats::uniroot(function(y) sum(flu / (1 + y)^tt) - precio_compra, c(-0.5, 2), tol = 1e-14)$root
      list(fechas = calendario[fut], flujos = flu, t = tt, tasa = y, origen = "implicita")
    }
  }, error = function(e) NULL)

  # --- Venta ---
  venta <- if (al_vencimiento) {
    list(precio = NA_real_, valoracion = NULL, cupon_corrido = NA_real_, precio_limpio = NA_real_)
  } else {
    valorar_en(fecha_venta, modo_venta, precio_venta, spread_negociacion_venta, tir_negociacion_venta,
               fecha_venta, "a la venta")
  }

  # --- Cupones recibidos entre la compra (excluida) y la venta (incluida) ---
  recibidos <- which(calendario > fecha_compra & calendario <= fecha_venta)
  tasas <- lapply(inicio_periodo[recibidos], function(D) {
    if (tipo == "real") info(D, D) else info(D, fecha_compra, "a la compra")
  })
  ibr_k <- vapply(tasas, function(x) x$valor, numeric(1))
  cupon_k <- valor_nominal * (ibr_k + spread_nominal) / periodo_cupon      # base 100
  # Redondeo de los flujos como en los formularios del profesor:
  #  real: 4 decimales en % del nominal (0,944083% -> 0,9441%; Excel del
  #        profesor "IBRTIRReal", que calcula con el IBR de 3 decimales)
  #  estimada: 6 decimales en % del nominal ($100 por cada $10.000 MM)
  # (La valoracion por IBR + spread usa los cupones sin redondear.)
  cupon_k <- redondear_pct(cupon_k, if (tipo == "real") 4 else 6)

  n <- length(recibidos)
  flujos100 <- cupon_k
  if (al_vencimiento && n > 0) flujos100[n] <- flujos100[n] + valor_nominal

  fechas <- as.Date(c(fecha_compra, calendario[recibidos], if (!al_vencimiento) fecha_venta), origin = "1970-01-01")
  montos100 <- c(-precio_compra, flujos100, if (!al_vencimiento) venta$precio)
  dias_reales <- as.numeric(fechas - fecha_compra)

  t <- calcular_tir_operacion(data.frame(fecha = fechas, dias_desde_compra = dias_reales, monto = montos100), 365)
  tir <- if (t$error) NA_real_ else t$tir

  factor <- if (is.null(monto_pesos)) NA_real_ else monto_pesos / valor_nominal
  fuentes <- vapply(tasas, function(x) x$fuente, character(1))
  etiqueta <- if (tipo == "real") ifelse(fuentes == "Publicada", "Flujo Real", "Flujo Est.") else rep("Flujo", n)

  tabla <- data.frame(
    Concepto = c("Valor compra", if (n > 0) paste(etiqueta, seq_len(n)), if (!al_vencimiento) "Venta"),
    Fecha_transaccion = fechas,
    Valor_transaccion = montos100 * factor,
    IBR_usado = c(NA_real_, ibr_k, if (!al_vencimiento) NA_real_),
    Fuente = c("", fuentes, if (!al_vencimiento) ""),
    Fecha_dato = as.Date(c(NA, vapply(tasas, function(x) as.numeric(x$fecha_dato), numeric(1)),
                           if (!al_vencimiento) NA), origin = "1970-01-01"),
    stringsAsFactors = FALSE
  )

  list(tipo = tipo, tir = tir, tabla = tabla, tenor = tenor,
       sin_base_ibr = is.null(ibr_df),
       riesgo_base = riesgo_base,
       ibr_promedio = if (n > 0) mean(ibr_k) else NA_real_,
       n_estimados = sum(fuentes != "Publicada" & tipo == "real"),
       n_retroceso = sum(vapply(tasas, function(x) isTRUE(x$retroceso), logical(1))),
       al_vencimiento = al_vencimiento,
       precio_compra = precio_compra, valoracion = compra$valoracion,
       cupon_corrido_compra = compra$cupon_corrido, precio_limpio_compra = compra$precio_limpio,
       precio_venta = venta$precio, valoracion_venta = venta$valoracion,
       cupon_corrido_venta = venta$cupon_corrido, precio_limpio_venta = venta$precio_limpio,
       giro_compra = precio_compra * factor,
       valor_venta = if (al_vencimiento) NA_real_ else venta$precio * factor,
       cupones_pesos = sum(cupon_k) * factor,
       pyg_pesos = sum(montos100) * factor)
}

# -------------------------------------------------------------
# VALORACION DE UN BONO IBR POR TASA DE NEGOCIACION (IBR + spread)
# -------------------------------------------------------------
# Metodo del profesor (ejercicio CDT Davivienda, enero 2025):
#  * El cupon del periodo en curso ya esta fijado con el IBR del inicio
#    de su periodo (ibr_periodo).
#  * Los cupones siguientes se proyectan con el IBR vigente a la fecha de
#    valoracion (ibr_vigente), constante.
#  * cupon = VN * (IBR + spread_cupon) / pagos_por_año
#  * Tasa de descuento EA = (1 + (ibr_vigente + spread_negociacion)/m)^m - 1
#    (la tasa de negociacion es nominal con la misma periodicidad del cupon,
#    ej. NAMV para cupon mensual).
#  * VP = flujo / (1 + tasa EA)^(dias/365), dias 365/365 (sin 29-feb, como
#    la valoracion de TES). Precio sucio = suma de VP.
valorar_bono_ibr <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                             spread_cupon, fecha_valoracion, spread_negociacion,
                             ibr_periodo, ibr_vigente, valor_nominal = 100) {
  fecha_emision <- as.Date(fecha_emision); fecha_vencimiento <- as.Date(fecha_vencimiento)
  fecha_valoracion <- as.Date(fecha_valoracion)
  if (fecha_valoracion < fecha_emision || fecha_valoracion >= fecha_vencimiento) {
    stop("La fecha de valoracion debe estar entre la emision y el vencimiento (sin incluirlo).")
  }
  m <- periodo_cupon
  calendario <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)
  futuros <- calendario[calendario > fecha_valoracion]
  n <- length(futuros)

  ibr_k <- c(ibr_periodo, rep(ibr_vigente, n - 1))
  cupon <- valor_nominal * (ibr_k + spread_cupon) / m
  flujo <- cupon; flujo[n] <- flujo[n] + valor_nominal

  tasa_ea <- (1 + (ibr_vigente + spread_negociacion) / m)^m - 1
  dias <- as.numeric(mapply(contar_dias_365, fecha_valoracion, futuros))
  vp <- flujo / (1 + tasa_ea)^(dias / 365)

  precio_sucio <- sum(vp)
  list(precio_sucio = precio_sucio,
       precio_sucio_truncado = truncar(precio_sucio, 3),
       tasa_descuento_ea = tasa_ea,
       ibr_periodo = ibr_periodo, ibr_vigente = ibr_vigente,
       tabla = data.frame(Fecha_cupon = futuros, Dias_descuento = dias,
                          IBR = ibr_k, Flujo = flujo, VP = vp))
}

# -------------------------------------------------------------
# SENDAS DE TIR: vender en cada fecha de cupon vs. mantener al vencimiento
# -------------------------------------------------------------
# args: lista de argumentos de rentabilidad_ibr (la operacion del usuario).
# Para cada fecha de cupon posterior a la compra (y la fecha de venta elegida,
# si no es fecha de cupon) calcula la TIR de vender ese dia, valorando la
# venta con el metodo de venta elegido (spread o TIR de negociacion) y con
# subidas/bajadas de ese spread o TIR en pasos_pb puntos basicos.
# Si la venta es por precio directo (o no hay venta), se usa el metodo y el
# valor de la COMPRA para valorar las ventas de la senda.
senda_tir_ibr <- function(args, pasos_pb = c(-50, -25, 0, 25, 50)) {
  venc <- as.Date(args$fecha_vencimiento); compra <- as.Date(args$fecha_compra)

  modo <- args$modo_venta; spread0 <- args$spread_negociacion_venta; tir0 <- args$tir_negociacion_venta
  hay_venta <- !is.null(args$fecha_venta) && as.Date(args$fecha_venta) < venc
  if (!hay_venta || is.null(modo) || modo == "precio") {
    modo <- args$modo_compra; spread0 <- args$spread_negociacion; tir0 <- args$tir_negociacion
  }
  if (is.null(modo) || modo == "precio") {
    stop("Para las sendas de TIR ingresa la venta (o la compra) por spread de negociacion o por TIR de negociacion.")
  }

  cal <- generar_calendario_cupones(as.Date(args$fecha_emision), venc, args$periodo_cupon)
  fechas <- cal[cal > compra & cal < venc]
  if (hay_venta) fechas <- sort(unique(c(fechas, as.Date(args$fecha_venta))))

  base_mant <- modifyList(args, list(modo_venta = "precio"))
  base_mant["fecha_venta"] <- list(NULL)
  tir_mant <- tryCatch(do.call(rentabilidad_ibr, base_mant)$tir, error = function(e) NA_real_)

  filas <- lapply(fechas, function(f) {
    tirs <- vapply(pasos_pb, function(pb) {
      a <- modifyList(args, list(fecha_venta = f, modo_venta = modo))
      if (modo == "tasa") a$spread_negociacion_venta <- spread0 + pb / 10000
      else a$tir_negociacion_venta <- tir0 + pb / 10000
      r <- tryCatch(do.call(rentabilidad_ibr, a), error = function(e) NULL)
      if (is.null(r)) NA_real_ else r$tir
    }, numeric(1))
    a0 <- modifyList(args, list(fecha_venta = f, modo_venta = modo))
    if (modo == "tasa") a0$spread_negociacion_venta <- spread0 else a0$tir_negociacion_venta <- tir0
    r0 <- tryCatch(do.call(rentabilidad_ibr, a0), error = function(e) NULL)
    c(precio = if (is.null(r0)) NA_real_ else r0$precio_venta, tirs)
  })
  m <- do.call(rbind, filas)
  tabla <- data.frame(Fecha_venta = fechas, Precio_venta = m[, 1], m[, -1, drop = FALSE], check.names = FALSE)
  names(tabla)[-(1:2)] <- ifelse(pasos_pb == 0, "TIR", sprintf("TIR %+d pb", pasos_pb))
  list(tabla = tabla, tir_vencimiento = tir_mant, modo = modo,
       valor_base = if (modo == "tasa") spread0 else tir0, pasos_pb = pasos_pb,
       venta_elegida = if (hay_venta) as.Date(args$fecha_venta) else as.Date(NA))
}
