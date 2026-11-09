source("festivos_colombia.R")

# =============================================================
# Fecha de publicacion del IBR aplicable a una fecha de valoracion D
# =============================================================
# Regla unificada (equivalente a las 4 reglas de negocio):
# tasa_vigente(D) = tasa publicada en el dia habil INMEDIATAMENTE
# ANTERIOR al ULTIMO dia habil que sea <= D.
fecha_ibr_aplicable <- function(fecha_valoracion) {
  D <- as.Date(fecha_valoracion)

  # Paso 1: ultimo dia habil <= D
  B <- D
  while (!es_dia_habil(B)) B <- B - 1

  # Paso 2: dia habil inmediatamente anterior a B
  P <- B - 1
  while (!es_dia_habil(P)) P <- P - 1

  P
}
