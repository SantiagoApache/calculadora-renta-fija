# =============================================================
# MODULO 1: Motor de valoracion de bonos - CONVENCION TES
# Tasa efectiva anual, capitalizada sobre dias reales, base 365
# (Version validada contra el Excel de Santiago)
# =============================================================
# Este archivo SOLO contiene definiciones de funciones.

# -------------------------------------------------------------
# FUNCION AUXILIAR: conteo de dias en base 365 "sin bisiesto"
# -------------------------------------------------------------
# Motivo: en base 365/365, un ano bisiesto tiene un dia de mas
# (29 de febrero). Si no lo excluimos, un periodo que cruce esa
# fecha quedaria con un dia "de mas" respecto a un periodo
# equivalente en un ano normal, rompiendo la base 365/365. Por eso
# contamos los dias normales entre dos fechas y RESTAMOS 1 por cada
# 29 de febrero que caiga estrictamente dentro del rango
# (fecha_inicio, fecha_fin].
es_bisiesto <- function(anio) {
  (anio %% 4 == 0 & anio %% 100 != 0) | (anio %% 400 == 0)
}

contar_dias_365 <- function(fecha_inicio, fecha_fin) {

  fecha_inicio <- as.Date(fecha_inicio)
  fecha_fin <- as.Date(fecha_fin)

  dias_brutos <- as.numeric(fecha_fin - fecha_inicio)

  anio_ini <- as.numeric(format(fecha_inicio, "%Y"))
  anio_fin <- as.numeric(format(fecha_fin, "%Y"))

  anios_en_rango <- anio_ini:anio_fin
  anios_bisiestos <- anios_en_rango[es_bisiesto(anios_en_rango)]

  num_29_feb <- 0
  for (a in anios_bisiestos) {
    feb29 <- as.Date(sprintf("%d-02-29", a))
    if (feb29 > fecha_inicio && feb29 <= fecha_fin) {
      num_29_feb <- num_29_feb + 1
    }
  }

  dias_brutos - num_29_feb
}

# -------------------------------------------------------------
# FUNCION AUXILIAR: truncar (NO redondear) a n decimales
# Se usa para mostrar el Valor_presente en la tabla de Shiny.
# -------------------------------------------------------------
truncar <- function(x, decimales) {
  factor <- 10^decimales
  trunc(x * factor) / factor
}

# -------------------------------------------------------------
# PASO 1: Calendario de fechas de pago de cupon
# -------------------------------------------------------------
generar_calendario_cupones <- function(fecha_emision, fecha_vencimiento, periodo_cupon) {

  meses_entre_cupones <- 12 / periodo_cupon
  fecha_emision <- as.Date(fecha_emision)
  fecha_vencimiento <- as.Date(fecha_vencimiento)

  fechas <- fecha_vencimiento
  fecha_actual <- fecha_vencimiento

  repeat {
    fecha_anterior <- seq(fecha_actual, by = paste0("-", meses_entre_cupones, " months"), length.out = 2)[2]
    if (fecha_anterior <= fecha_emision) break
    fechas <- c(fecha_anterior, fechas)
    fecha_actual <- fecha_anterior
  }

  fechas <- as.Date(fechas, origin = "1970-01-01")
  return(sort(fechas))
}

# -------------------------------------------------------------
# PASO 2: Tabla completa de flujos, con el cupon de CADA periodo
# calculado sobre sus dias reales (Actual/365, tasa efectiva anual)
# -------------------------------------------------------------
# cupon_periodo = VN * [ (1+tasa_anual)^(dias_periodo/365) - 1 ]
construir_tabla_flujos <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                                    tasa_cupon_anual, valor_nominal, base_dias = 365) {

  fecha_emision <- as.Date(fecha_emision)
  calendario <- generar_calendario_cupones(fecha_emision, fecha_vencimiento, periodo_cupon)

  inicio_periodo <- c(fecha_emision, calendario[-length(calendario)])
  fin_periodo <- calendario

  dias_periodo <- mapply(contar_dias_365, inicio_periodo, fin_periodo)
  dias_periodo <- as.numeric(dias_periodo)

  cupon_periodo <- valor_nominal * ((1 + tasa_cupon_anual)^(dias_periodo / base_dias) - 1)

  data.frame(
    inicio_periodo = inicio_periodo,
    fecha_flujo = fin_periodo,
    dias_periodo = dias_periodo,
    cupon = cupon_periodo
  )
}

# -------------------------------------------------------------
# PASO 3: Interes corrido (acumulacion LINEAL dentro del periodo)
# -------------------------------------------------------------
calcular_interes_corrido <- function(tabla_flujos, fecha_negociacion) {

  fecha_negociacion <- as.Date(fecha_negociacion)

  fila_actual <- tabla_flujos[tabla_flujos$inicio_periodo <= fecha_negociacion &
                               tabla_flujos$fecha_flujo > fecha_negociacion, ]

  dias_transcurridos <- contar_dias_365(fila_actual$inicio_periodo, fecha_negociacion)

  interes_corrido <- fila_actual$cupon * (dias_transcurridos / fila_actual$dias_periodo)

  list(
    cupon_anterior = fila_actual$inicio_periodo,
    proximo_cupon = fila_actual$fecha_flujo,
    dias_transcurridos = dias_transcurridos,
    dias_periodo = fila_actual$dias_periodo,
    interes_corrido = interes_corrido
  )
}

# -------------------------------------------------------------
# PASO 4, 5 y 6: Precio sucio, limpio y clasificacion
# -------------------------------------------------------------
precio_bono_fechas <- function(fecha_emision, fecha_vencimiento, tasa_cupon_anual,
                                periodo_cupon, tasa_mercado_anual, fecha_negociacion,
                                valor_nominal = 100, base_dias = 365) {

  fecha_negociacion <- as.Date(fecha_negociacion)

  tabla <- construir_tabla_flujos(fecha_emision, fecha_vencimiento, periodo_cupon,
                                   tasa_cupon_anual, valor_nominal, base_dias)

  ic <- calcular_interes_corrido(tabla, fecha_negociacion)

  futuros <- tabla[tabla$fecha_flujo > fecha_negociacion, ]
  n_flujos <- nrow(futuros)

  flujos <- futuros$cupon
  flujos[n_flujos] <- flujos[n_flujos] + valor_nominal   # el ultimo incluye el principal

  dias_hasta_flujo <- mapply(contar_dias_365, fecha_negociacion, futuros$fecha_flujo)
  dias_hasta_flujo <- as.numeric(dias_hasta_flujo)
  t_anios <- dias_hasta_flujo / base_dias

  valores_presentes <- flujos / (1 + tasa_mercado_anual)^t_anios
  precio_sucio <- sum(valores_presentes)
  # Convencion del profesor: el precio sucio se TRUNCA a 3 decimales y a ese
  # valor se le resta el interes corrido (sin truncar) para obtener el limpio.
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

  list(
    fechas_flujos_futuros = futuros$fecha_flujo,
    dias_periodo = futuros$dias_periodo,     # <-- dias del periodo de cada flujo (para la tabla)
    flujos = flujos,
    dias_hasta_flujo = dias_hasta_flujo,
    t_anios = t_anios,
    valores_presentes = valores_presentes,
    interes_corrido = ic$interes_corrido,
    precio_sucio = precio_sucio,
    precio_limpio = precio_limpio,
    precio_sucio_truncado = precio_sucio_trunc,
    clasificacion = clasificacion
  )
}
