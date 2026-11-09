# =============================================================
# Calendario de festivos de Colombia (Ley 51 de 1983 - Ley Emiliani)
# =============================================================
# Clasificacion:
#  - FIJOS (nunca se mueven): Ano Nuevo, Dia del Trabajo, Independencia,
#    Batalla de Boyaca, Inmaculada Concepcion, Navidad
#  - BASADOS EN PASCUA, FIJOS (no se mueven): Jueves Santo, Viernes Santo
#  - TRASLADABLES (si no caen lunes, se mueven al lunes siguiente):
#    Reyes Magos, San Jose, Ascension, Corpus Christi, Sagrado Corazon,
#    San Pedro y San Pablo, Asuncion, Dia de la Raza, Todos los Santos,
#    Independencia de Cartagena

# --- Calculo de la fecha de Pascua (algoritmo de Gauss/Meeus) ---
calcular_pascua <- function(anio) {
  a <- anio %% 19
  b <- anio %/% 100
  c <- anio %% 100
  d <- b %/% 4
  e <- b %% 4
  f <- (b + 8) %/% 25
  g <- (b - f + 1) %/% 3
  h <- (19*a + b - d - g + 15) %% 30
  i <- c %/% 4
  k <- c %% 4
  l <- (32 + 2*e + 2*i - h - k) %% 7
  m <- (a + 11*h + 22*l) %/% 451
  mes <- (h + l - 7*m + 114) %/% 31
  dia <- ((h + l - 7*m + 114) %% 31) + 1
  as.Date(sprintf("%d-%02d-%02d", anio, mes, dia))
}

# --- Mueve una fecha al lunes siguiente si no cae lunes ---
mover_a_lunes <- function(fecha) {
  dia_semana <- as.integer(format(fecha, "%u"))  # 1=lunes, 7=domingo
  if (dia_semana == 1) return(fecha)
  fecha + (8 - dia_semana)
}

festivos_colombia <- function(anio) {
  pascua <- calcular_pascua(anio)

  # Fijos (nunca se mueven)
  fijos <- as.Date(sprintf(c("%d-01-01","%d-05-01","%d-07-20",
                              "%d-08-07","%d-12-08","%d-12-25"), anio))

  # Basados en Pascua, fijos (no se mueven)
  jueves_santo <- pascua - 3
  viernes_santo <- pascua - 2

  # Trasladables (se mueven al lunes siguiente)
  corpus_christi <- mover_a_lunes(pascua + 60)

  # Sagrado Corazon NO se calcula por offset de Pascua: la regla oficial
  # (Banco de la Republica) es "el lunes siguiente al festivo de Corpus
  # Christi (ya trasladado)". En anios donde esto coincide con San Pedro
  # y San Pablo (ej. 2025), ambos festivos caen el MISMO dia - eso es
  # correcto, no es un error.
  sagrado_corazon <- corpus_christi + 7

  trasladables_base <- c(
    as.Date(sprintf("%d-01-06", anio)),   # Reyes Magos
    as.Date(sprintf("%d-03-19", anio)),   # San Jose
    pascua + 39,                           # Ascension
    as.Date(sprintf("%d-06-29", anio)),   # San Pedro y San Pablo
    as.Date(sprintf("%d-08-15", anio)),   # Asuncion
    as.Date(sprintf("%d-10-12", anio)),   # Dia de la Raza
    as.Date(sprintf("%d-11-01", anio)),   # Todos los Santos
    as.Date(sprintf("%d-11-11", anio))    # Independencia de Cartagena
  )
  trasladables <- as.Date(sapply(trasladables_base, mover_a_lunes), origin = "1970-01-01")

  todos <- sort(unique(c(fijos, jueves_santo, viernes_santo, corpus_christi, sagrado_corazon, trasladables)))
  todos
}

es_festivo <- function(fecha) {
  fecha <- as.Date(fecha)
  anio <- as.integer(format(fecha, "%Y"))
  fecha %in% festivos_colombia(anio)
}

es_dia_habil <- function(fecha) {
  fecha <- as.Date(fecha)
  dia_semana <- as.integer(format(fecha, "%u"))
  dia_semana <= 5 && !es_festivo(fecha)
}
