# =============================================================
# MODULO IBR: carga de la base del Banco de la Republica y busqueda
# de la tasa IBR aplicable a una fecha
# =============================================================
# Requiere: festivos_colombia.R e ibr_fecha_aplicable.R (se cargan con source).
#
# Regla de la tasa aplicable (definida por Santiago/profesor, 4 reglas
# unificadas en ibr_fecha_aplicable.R): la tasa vigente para una fecha D es la
# publicada el dia habil INMEDIATAMENTE ANTERIOR al ultimo dia habil <= D.
# Si en la base no hay dato exactamente en esa fecha (la base trae algunos
# dias habiles menos que el calendario de festivos calculado), se usa el
# dato disponible mas cercano hacia atras y se marca en el resultado.

source("festivos_colombia.R")
source("ibr_fecha_aplicable.R")

# -------------------------------------------------------------
# Carga del Excel de tasas IBR (hoja "Datos")
# -------------------------------------------------------------
# Columnas del archivo: Fecha (texto YYYY/MM/DD), IBR overnight, 1 mes,
# 3 meses, 6 meses, 12 meses (todas nominales, en %).
cargar_ibr <- function(ruta) {

  crudo <- readxl::read_excel(ruta, sheet = "Datos", col_names = FALSE, col_types = "text")

  fechas_txt <- as.character(crudo[[1]])
  es_dato <- !is.na(fechas_txt) & grepl("^[0-9]{4}/[0-9]{2}/[0-9]{2}$", fechas_txt)
  datos <- crudo[es_dato, ]
  if (nrow(datos) == 0 || ncol(datos) < 6) {
    stop("El archivo de IBR no tiene el formato esperado (Fecha + 5 series de IBR).")
  }

  ibr <- data.frame(
    fecha = as.Date(as.character(datos[[1]]), format = "%Y/%m/%d"),
    overnight = suppressWarnings(as.numeric(datos[[2]])),
    m1 = suppressWarnings(as.numeric(datos[[3]])),
    m3 = suppressWarnings(as.numeric(datos[[4]])),
    m6 = suppressWarnings(as.numeric(datos[[5]])),
    m12 = suppressWarnings(as.numeric(datos[[6]]))
  )
  ibr <- ibr[order(ibr$fecha), ]
  rownames(ibr) <- NULL
  if (any(is.na(ibr$fecha))) stop("El archivo de IBR tiene fechas invalidas.")
  ibr
}

# Busca el archivo de IBR en la carpeta de la app ("Tasas...xlsx")
# (solo acepta archivos con la hoja "Datos" del Banco de la Republica: asi no
# confunde con un archivo de curvas FR cuyo nombre tambien empiece por "Tasas")
encontrar_archivo_ibr <- function(carpeta = ".") {
  candidatos <- list.files(carpeta, pattern = "^Tasas.*\\.xlsx$", ignore.case = TRUE, full.names = TRUE)
  candidatos <- candidatos[!startsWith(basename(candidatos), "~$")]   # archivos temporales de Excel abierto
  for (f in candidatos) {
    hojas <- tryCatch(readxl::excel_sheets(f), error = function(e) character(0))
    if ("Datos" %in% hojas) return(f)
  }
  NA_character_
}

# Columna de la base segun el plazo del IBR
.columna_ibr <- function(tenor) {
  col <- c("overnight" = "overnight", "1m" = "m1", "3m" = "m3", "6m" = "m6", "12m" = "m12")[tenor]
  if (is.na(col)) stop("Plazo de IBR no valido (usa overnight, 1m, 3m, 6m o 12m).")
  unname(col)
}

# -------------------------------------------------------------
# IBR real aplicable a una fecha de valoracion
# -------------------------------------------------------------
# Devuelve la tasa como decimal nominal anual (ej. 0.1196), la fecha de
# publicacion que correspondia por la regla y la fecha del dato realmente
# usado (distinta solo si hubo que buscar hacia atras).
obtener_ibr_real <- function(fecha_valoracion, tenor, ibr_df) {

  col <- .columna_ibr(tenor)
  D <- as.Date(fecha_valoracion)
  P <- fecha_ibr_aplicable(D)

  # Dato aun no publicado: se señala con un error de clase propia para que
  # quien llama pueda reemplazarlo por una estimacion (curva FRA)
  if (P > max(ibr_df$fecha)) {
    stop(structure(class = c("ibr_no_publicado", "error", "condition"),
                   list(message = sprintf("La fecha de publicacion aplicable (%s) es posterior al ultimo dato de IBR de la base (%s).",
                                          format(P), format(max(ibr_df$fecha))),
                        call = NULL)))
  }

  serie <- ibr_df[!is.na(ibr_df[[col]]) & ibr_df$fecha <= P, ]
  if (nrow(serie) == 0) {
    stop(sprintf("No hay IBR a %s publicado en o antes del %s (la serie empieza el %s).",
                 tenor, format(P), format(min(ibr_df$fecha[!is.na(ibr_df[[col]])]))))
  }
  usada <- serie[which.max(serie$fecha), ]

  list(valor = usada[[col]] / 100,
       fecha_publicacion = P,
       fecha_dato = usada$fecha,
       retroceso = usada$fecha != P)
}
