# =============================================================
# MODULO 2 (v2): Rentabilidad de una operacion de compra-venta
#                de un bono TES (TIR de la operacion)
# =============================================================
# Reutiliza el motor del Modulo 1 (funciones_modulo1.R) para:
#  - Calcular precios sucios (cuando el usuario ingresa tasa de
#    mercado en vez de precio directo)
#  - Identificar el calendario completo de cupones del bono, para
#    saber si se recibio algun cupon entre la compra y la venta
#
# IMPORTANTE: este modulo asume que funciones_modulo1.R ya fue
# cargado (contiene construir_tabla_flujos, precio_bono_fechas,
# contar_dias_365, etc.)

# -------------------------------------------------------------
# PASO 1: Identificar cupones recibidos ENTRE compra y venta
# -------------------------------------------------------------
# Un cupon cuenta como "recibido" si su fecha de pago cae
# estrictamente despues de la compra, y hasta (incluyendo) la fecha
# de venta. Si la venta ocurre EXACTAMENTE el dia de un cupon, ese
# cupon SI se cuenta como recibido (el vendedor lo cobra antes de
# transferir el bono) - esto es consistente con como precio_bono_fechas()
# ya trata las fechas de negociacion que coinciden con un cupon.
identificar_cupones_recibidos <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                                           tasa_cupon_anual, valor_nominal,
                                           fecha_compra, fecha_venta, base_dias = 365) {

  fecha_compra <- as.Date(fecha_compra)
  fecha_venta <- as.Date(fecha_venta)

  tabla <- construir_tabla_flujos(fecha_emision, fecha_vencimiento, periodo_cupon,
                                   tasa_cupon_anual, valor_nominal, base_dias)

  cupones <- tabla[tabla$fecha_flujo > fecha_compra & tabla$fecha_flujo <= fecha_venta, ]

  data.frame(
    fecha_flujo = cupones$fecha_flujo,
    monto = cupones$cupon
  )
}

# -------------------------------------------------------------
# PASO 2: Construir la lista completa de flujos de la operacion
# -------------------------------------------------------------
# t = 0 en la fecha de compra:  -precio_compra (salida de dinero)
# cada cupon recibido:          +monto del cupon, en su fecha exacta
# fecha de venta:                +precio_venta (entrada de dinero)
construir_flujos_operacion <- function(fecha_compra, precio_compra,
                                        fecha_venta, precio_venta,
                                        cupones_recibidos, base_dias = 365) {

  fecha_compra <- as.Date(fecha_compra)
  fecha_venta <- as.Date(fecha_venta)

  fechas <- c(fecha_compra, cupones_recibidos$fecha_flujo, fecha_venta)
  fechas <- as.Date(fechas, origin = "1970-01-01")

  montos <- c(-precio_compra, cupones_recibidos$monto, precio_venta)

  dias_desde_compra <- mapply(contar_dias_365, fecha_compra, fechas)
  dias_desde_compra <- as.numeric(dias_desde_compra)

  data.frame(
    fecha = fechas,
    dias_desde_compra = dias_desde_compra,
    monto = montos
  )
}

# -------------------------------------------------------------
# PASO 3: Resolver la TIR de la operacion (tasa efectiva anual)
# -------------------------------------------------------------
# Busca la tasa r (efectiva anual, base 365/365, consistente con
# todo el proyecto) tal que el valor presente de TODOS los flujos
# de la operacion (descontados desde la fecha de compra) sea cero:
#   0 = -precio_compra + sum[ cupon_i / (1+r)^(dias_i/365) ]
#                        + precio_venta / (1+r)^(dias_venta/365)
calcular_tir_operacion <- function(tabla_flujos_operacion, base_dias = 365) {

  npv <- function(r) {
    sum(tabla_flujos_operacion$monto / (1 + r)^(tabla_flujos_operacion$dias_desde_compra / base_dias))
  }

  # Busqueda robusta de un intervalo donde uniroot pueda encontrar la raiz
  limite_inferior <- -0.9999
  limite_superior <- 10

  valor_inf <- npv(limite_inferior)
  valor_sup <- npv(limite_superior)

  if (is.na(valor_inf) || is.na(valor_sup) || valor_inf * valor_sup > 0) {
    return(list(tir = NA, error = TRUE,
                mensaje = "No fue posible encontrar una tasa que resuelva la operacion con los datos ingresados. Revisa los precios y las fechas."))
  }

  resultado <- uniroot(npv, lower = limite_inferior, upper = limite_superior, tol = 1e-10)

  list(tir = resultado$root, error = FALSE, mensaje = NULL)
}

# -------------------------------------------------------------
# FUNCION PRINCIPAL: junta todos los pasos anteriores
# -------------------------------------------------------------
rentabilidad_operacion <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                                    tasa_cupon_anual, valor_nominal,
                                    fecha_compra, precio_compra,
                                    fecha_venta, precio_venta,
                                    base_dias = 365) {

  cupones <- identificar_cupones_recibidos(fecha_emision, fecha_vencimiento, periodo_cupon,
                                            tasa_cupon_anual, valor_nominal,
                                            fecha_compra, fecha_venta, base_dias)

  flujos <- construir_flujos_operacion(fecha_compra, precio_compra,
                                        fecha_venta, precio_venta,
                                        cupones, base_dias)

  tir <- calcular_tir_operacion(flujos, base_dias)

  list(
    cupones_recibidos = cupones,
    flujos_operacion = flujos,
    tir = tir$tir,
    error = tir$error,
    mensaje_error = tir$mensaje
  )
}
