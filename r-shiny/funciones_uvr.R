# =============================================================
# MODULO UVR: Bonos denominados en UVR (tasa fija REAL)
# =============================================================
# Reutiliza SIN CAMBIOS el motor TES (funciones_modulo1.R):
# el bono UVR se valora igual que uno de tasa fija, pero todo en UVR
# (cupones, principal, precio) con tasa cupon real y tasa de mercado real,
# base 365/365 sin 29-feb. Solo el paso a pesos usa el valor de la UVR.
#
# Reglas (explicadas por el profesor, ejercicio validado):
#  1. Cupon = VN * [(1+tasa_cupon_real)^(dias/365) - 1], flujos en UVR.
#  2. Descuento con la tasa de mercado real EA; precio sucio TRUNCADO a
#     3 decimales (base 100); limpio = sucio truncado - cupon corrido.
#  3. Valor UVR de una fecha = valor publicado ese dia (serie diaria del
#     Banco de la Republica, ya publicada hasta el dia 15 del mes en curso).
#  4. Nominal en UVR = nominal en pesos / UVR de la negociacion (o directo).
#  5. Valor de giro (pesos) = precio sucio truncado/valor_nominal * nominal
#     en UVR * UVR de la negociacion, TRUNCADO a pesos enteros (el ejemplo
#     del profesor muestra 3.450.680.472 donde el valor exacto es ...472,72).

# -------------------------------------------------------------
# Carga de la serie diaria de UVR (Excel del Banco de la Republica)
# -------------------------------------------------------------
cargar_uvr <- function(ruta) {

  crudo <- readxl::read_excel(ruta, sheet = "Datos", col_names = FALSE,
                              col_types = "text")

  fechas_txt <- as.character(crudo[[1]])
  es_dato <- !is.na(fechas_txt) & grepl("^[0-9]{4}/[0-9]{2}/[0-9]{2}$", fechas_txt)
  datos <- crudo[es_dato, ]

  uvr <- data.frame(
    fecha = as.Date(as.character(datos[[1]]), format = "%Y/%m/%d"),
    valor = as.numeric(datos[[2]])
  )
  uvr <- uvr[order(uvr$fecha), ]
  rownames(uvr) <- NULL

  if (nrow(uvr) == 0 || any(is.na(uvr$fecha)) || any(is.na(uvr$valor))) {
    stop("El archivo de UVR no tiene el formato esperado (Fecha, valor de la UVR).")
  }
  uvr
}

# Busca el archivo de UVR en la carpeta de la app ("UVR_...xlsx")
encontrar_archivo_uvr <- function(carpeta = ".") {
  candidatos <- list.files(carpeta, pattern = "^UVR.*\\.xlsx$",
                           ignore.case = TRUE, full.names = TRUE)
  if (length(candidatos) == 0) return(NA_character_)
  candidatos[1]
}

# Valor de la UVR en una fecha: el valor publicado exactamente ese dia
uvr_en_fecha <- function(fecha, uvr_df) {
  fecha <- as.Date(fecha)
  fila <- uvr_df[uvr_df$fecha == fecha, ]
  if (nrow(fila) == 0) {
    stop(sprintf("No hay valor de UVR para el %s (la serie va del %s al %s).",
                 format(fecha), format(min(uvr_df$fecha)), format(max(uvr_df$fecha))))
  }
  fila$valor[1]
}

# -------------------------------------------------------------
# Valoracion del bono UVR
# -------------------------------------------------------------
# nominal_transado: numero; nominal_en: "pesos" o "uvr".
valorar_bono_uvr <- function(fecha_emision, fecha_vencimiento, periodo_cupon,
                              tasa_cupon_real, tasa_mercado_real, fecha_negociacion,
                              uvr_df, nominal_transado, nominal_en = "uvr",
                              valor_nominal = 100) {

  stopifnot(nominal_en %in% c("pesos", "uvr"))
  fecha_negociacion <- as.Date(fecha_negociacion)

  motor <- precio_bono_fechas(
    fecha_emision = fecha_emision, fecha_vencimiento = fecha_vencimiento,
    tasa_cupon_anual = tasa_cupon_real, periodo_cupon = periodo_cupon,
    tasa_mercado_anual = tasa_mercado_real, fecha_negociacion = fecha_negociacion,
    valor_nominal = valor_nominal
  )

  uvr_neg <- uvr_en_fecha(fecha_negociacion, uvr_df)

  nominal_uvr <- if (nominal_en == "uvr") nominal_transado else nominal_transado / uvr_neg
  nominal_pesos <- nominal_uvr * uvr_neg

  precio_sucio_trunc <- motor$precio_sucio_truncado
  valor_giro <- truncar(precio_sucio_trunc / valor_nominal * nominal_uvr * uvr_neg, 0)

  c(motor, list(
    uvr_negociacion = uvr_neg,
    nominal_uvr = nominal_uvr,
    nominal_pesos = nominal_pesos,
    valor_giro = valor_giro,
    # Valor de giro expresado en UVR: precio sucio truncado (base 100) x nominal en UVR
    valor_giro_uvr = precio_sucio_trunc / valor_nominal * nominal_uvr
  ))
}
