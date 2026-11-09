# =============================================================
# MODULO IPC: Bonos indexados a inflacion (IPC) + spread EA
# =============================================================
# Reutiliza SIN CAMBIOS el motor TES (funciones_modulo1.R):
#   contar_dias_365(), truncar(), generar_calendario_cupones()
# Requiere haber cargado funciones_modulo1.R antes (source).
#
# Reglas de negocio (definidas por Santiago / profesor):
#  1. Se usa la variacion ANUAL de la inflacion (serie "Inflacion total anual").
#  2. Tasa de cada cupon: (1 + IPC) * (1 + spread_EA) - 1   (efectivas -> se multiplican)
#  3. El PRIMER cupon (el del periodo en curso en la fecha de negociacion)
#     usa el IPC segun el modo del bono:
#        - "inicio": IPC vigente en la fecha de INICIO del periodo (IPC previo)
#        - "final":  IPC vigente en la fecha de FIN del periodo
#  4. Los cupones SIGUIENTES usan el IPC vigente en la fecha de negociacion.
#  5. "IPC vigente en una fecha" = ultimo valor publicado con fecha <= esa fecha.
#  6. Base 365/365 sin 29-feb, descuento, interes corrido, precio sucio/limpio:
#     identico al calculo de tasa fija (TES).

# -------------------------------------------------------------
# PASO 1: Cargar la serie de IPC (Excel del Banco de la Republica)
# -------------------------------------------------------------
# El archivo trae: fila 1 = encabezados, fila 2 = unidades, luego datos
# (Fecha en texto "YYYY/MM/DD", Meta de inflacion %, Inflacion total anual %),
# y al final filas vacias + una nota de descarga. Se leen todas las celdas
# como texto y se conservan solo las filas con una fecha valida.
cargar_ipc <- function(ruta) {

  crudo <- readxl::read_excel(ruta, sheet = "Datos", col_names = FALSE,
                              col_types = "text")

  fechas_txt <- as.character(crudo[[1]])
  es_dato <- !is.na(fechas_txt) & grepl("^[0-9]{4}/[0-9]{2}/[0-9]{2}$", fechas_txt)
  datos <- crudo[es_dato, ]

  ipc <- data.frame(
    fecha = as.Date(as.character(datos[[1]]), format = "%Y/%m/%d"),
    meta = as.numeric(datos[[2]]),
    inflacion = as.numeric(datos[[3]])          # en porcentaje (ej. 6.24)
  )
  ipc <- ipc[order(ipc$fecha), ]
  rownames(ipc) <- NULL

  if (nrow(ipc) == 0 || any(is.na(ipc$fecha)) || any(is.na(ipc$inflacion))) {
    stop("El archivo de IPC no tiene el formato esperado (Fecha, Meta, Inflacion total anual).")
  }
  ipc
}

# Busca el archivo de IPC en la carpeta de la app sin depender de la tilde
# del nombre ("Inflacion_y_meta.xlsx" / "Inflación_y_meta.xlsx").
encontrar_archivo_ipc <- function(carpeta = ".") {
  # Acepta nombres que empiecen por "Inflaci..." o por "IPC" (ej. IPC.xlsx).
  # Solo sirven los archivos con el formato del Banco de la Republica (hoja
  # "Datos"); si hay varios, se usa el que tenga el dato de IPC mas reciente.
  candidatos <- list.files(carpeta, pattern = "^(Inflaci|IPC).*\\.xlsx$",
                           ignore.case = TRUE, full.names = TRUE)
  candidatos <- candidatos[!startsWith(basename(candidatos), "~$")]   # temporales de Excel abierto
  mejor <- NA_character_; ultima <- as.Date(-Inf)
  for (f in candidatos) {
    d <- tryCatch(cargar_ipc(f), error = function(e) NULL)
    if (!is.null(d) && nrow(d) > 0 && max(d$fecha) > ultima) { mejor <- f; ultima <- max(d$fecha) }
  }
  mejor
}

# -------------------------------------------------------------
# PASO 2: IPC vigente en una fecha = ultimo valor con fecha <= esa fecha
# -------------------------------------------------------------
# Devuelve la inflacion anual como decimal (6.24% -> 0.0624).
ipc_vigente <- function(fecha, ipc_df) {
  fecha <- as.Date(fecha)
  candidatos <- ipc_df[ipc_df$fecha <= fecha, ]
  if (nrow(candidatos) == 0) {
    stop(sprintf("No hay IPC publicado en o antes del %s (la serie empieza el %s).",
                 format(fecha), format(min(ipc_df$fecha))))
  }
  ultimo <- candidatos[which.max(candidatos$fecha), ]
  list(valor = ultimo$inflacion / 100, fecha_ipc = ultimo$fecha)
}

# Tasa EA total = (1 + IPC) * (1 + spread) - 1
combinar_ipc_spread <- function(ipc, spread_ea) {
  (1 + ipc) * (1 + spread_ea) - 1
}

# -------------------------------------------------------------
# PASO 3: Tabla de flujos del bono IPC
# -------------------------------------------------------------
# Periodo "en curso" = el que contiene la fecha de negociacion. Solo ese
# periodo y los futuros tienen cupon (los periodos ya vencidos no afectan
# el precio y quedan en NA).
construir_tabla_flujos_ipc <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                                        spread_ea, valor_nominal, fecha_negociacion,
                                        modo_ipc, ipc_df, base_dias = 365) {

  stopifnot(modo_ipc %in% c("inicio", "final"))

  fecha_emision <- as.Date(fecha_emision)
  fecha_negociacion <- as.Date(fecha_negociacion)

  calendario <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)
  inicio_periodo <- c(fecha_emision, calendario[-length(calendario)])
  fin_periodo <- calendario

  dias_periodo <- as.numeric(mapply(contar_dias_365, inicio_periodo, fin_periodo))

  n <- length(calendario)
  idx_actual <- which(inicio_periodo <= fecha_negociacion & fin_periodo > fecha_negociacion)
  if (length(idx_actual) != 1) {
    stop("La fecha de negociacion debe estar entre la emision y el vencimiento.")
  }

  # IPC vigente a la fecha de negociacion (para los cupones siguientes)
  ipc_neg <- ipc_vigente(fecha_negociacion, ipc_df)

  # IPC del primer cupon (periodo en curso) segun el modo.
  # Tope: el IPC vigente nunca puede ser posterior a la fecha de negociacion,
  # porque un dato de esa fecha aun no esta publicado el dia de la valoracion.
  # En modo "final" la fecha de referencia (fin del periodo) siempre es posterior
  # a la negociacion, asi que el tope siempre aplica; en modo "inicio" no cambia nada.
  fecha_ref_primer <- if (modo_ipc == "inicio") inicio_periodo[idx_actual] else fin_periodo[idx_actual]
  ipc_primer <- ipc_vigente(min(fecha_ref_primer, fecha_negociacion), ipc_df)

  ipc_usado <- rep(NA_real_, n)
  fecha_ipc_usado <- as.Date(rep(NA, n))
  for (k in seq_len(n)) {
    if (k < idx_actual) next                       # periodo ya vencido: no aplica
    src <- if (k == idx_actual) ipc_primer else ipc_neg
    ipc_usado[k] <- src$valor
    fecha_ipc_usado[k] <- src$fecha_ipc
  }

  tasa_ea <- combinar_ipc_spread(ipc_usado, spread_ea)
  cupon <- valor_nominal * ((1 + tasa_ea)^(dias_periodo / base_dias) - 1)

  data.frame(
    inicio_periodo = inicio_periodo,
    fecha_flujo = fin_periodo,
    dias_periodo = dias_periodo,
    ipc_usado = ipc_usado,
    fecha_ipc_usado = fecha_ipc_usado,
    tasa_cupon_ea = tasa_ea,
    cupon = cupon
  )
}

# -------------------------------------------------------------
# PASO 4: Precio sucio, limpio, interes corrido, giro
# -------------------------------------------------------------
# tasa_mercado_anual: tasa EA de descuento (decimal). Si tipo_tasa_mercado es
# "spread_ipc", se interpreta como un spread sobre el IPC vigente a la fecha
# de negociacion: tasa_descuento = (1 + IPC_vigente) * (1 + tasa_mercado) - 1.
precio_bono_ipc <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                             spread_ea, modo_ipc, tasa_mercado_anual,
                             fecha_negociacion, ipc_df,
                             tipo_tasa_mercado = "total",
                             valor_nominal = 100, monto_nominal_pesos = NULL,
                             base_dias = 365) {

  fecha_negociacion <- as.Date(fecha_negociacion)

  tabla <- construir_tabla_flujos_ipc(fecha_emision, fecha_vencimiento, periodo_cupon,
                                       spread_ea, valor_nominal, fecha_negociacion,
                                       modo_ipc, ipc_df, base_dias)

  # Reutiliza el calculo de interes corrido del motor TES (misma tabla de periodos)
  ic <- calcular_interes_corrido(tabla, fecha_negociacion)

  futuros <- tabla[tabla$fecha_flujo > fecha_negociacion, ]
  n_flujos <- nrow(futuros)

  flujos <- futuros$cupon
  flujos[n_flujos] <- flujos[n_flujos] + valor_nominal

  dias_hasta_flujo <- as.numeric(mapply(contar_dias_365, fecha_negociacion, futuros$fecha_flujo))
  t_anios <- dias_hasta_flujo / base_dias

  # Tasa de descuento
  ipc_neg <- ipc_vigente(fecha_negociacion, ipc_df)
  tasa_descuento <- if (tipo_tasa_mercado == "spread_ipc") {
    combinar_ipc_spread(ipc_neg$valor, tasa_mercado_anual)
  } else {
    tasa_mercado_anual
  }

  valores_presentes <- flujos / (1 + tasa_descuento)^t_anios
  precio_sucio <- sum(valores_presentes)

  # Convencion del profesor: el precio sucio se TRUNCA a 3 decimales y a ese
  # valor truncado se le resta el cupon corrido (sin truncar) para obtener el
  # precio limpio. Ej.: 95.639 - 1.569881 = 94.069119.
  precio_sucio_trunc <- truncar(precio_sucio, 3)
  precio_limpio <- precio_sucio_trunc - ic$interes_corrido

  tolerancia_par <- valor_nominal * 0.0001
  clasificacion <- if (abs(precio_limpio - valor_nominal) < tolerancia_par) {
    "A la par"
  } else if (precio_limpio < valor_nominal) {
    "Con descuento"
  } else {
    "Con prima"
  }

  # Valor de giro: se usa el precio sucio TRUNCADO a 3 decimales (base 100),
  # calculado arriba, ANTES de escalar al monto en pesos (igual que en TES).
  valor_giro <- NA_real_
  if (!is.null(monto_nominal_pesos)) {
    valor_giro <- precio_sucio_trunc / valor_nominal * monto_nominal_pesos
  }

  list(
    tabla_completa = tabla,
    fechas_flujos_futuros = futuros$fecha_flujo,
    dias_periodo = futuros$dias_periodo,
    ipc_usado = futuros$ipc_usado,
    fecha_ipc_usado = futuros$fecha_ipc_usado,
    tasa_cupon_ea = futuros$tasa_cupon_ea,
    flujos = flujos,
    dias_hasta_flujo = dias_hasta_flujo,
    t_anios = t_anios,
    valores_presentes = valores_presentes,
    tasa_descuento = tasa_descuento,
    interes_corrido = ic$interes_corrido,
    precio_sucio = precio_sucio,
    precio_limpio = precio_limpio,
    precio_sucio_truncado = precio_sucio_trunc,
    valor_giro = valor_giro,
    clasificacion = clasificacion
  )
}
