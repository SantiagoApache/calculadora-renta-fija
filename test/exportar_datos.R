suppressMessages({library(readxl); library(jsonlite)})
setwd("/home/claude/renta_fija")
source("funciones_modulo1.R"); source("funciones_ipc.R"); source("funciones_uvr.R"); source("funciones_ibr.R"); source("funciones_ibr_tir.R")
S <- "/tmp/claude-0/-home-claude/b41e1e11-b557-520c-8c79-343117d5a588/scratchpad"
U <- "/root/.claude/uploads/b41e1e11-b557-520c-8c79-343117d5a588/"
ipc <- cargar_ipc(file.path(S, "ipc_user/ipc.xlsx"))
uvr <- cargar_uvr(file.path(S, "uvr_user/uvr.xlsx"))
ibr <- cargar_ibr("Tasas_de_interes_IBR.xlsx")
ibr2 <- tryCatch(cargar_ibr(paste0(U, "67e33547-Tasas_de_inter_s_1-.xlsx")), error=function(e) NULL)
if (!is.null(ibr2) && max(ibr2$fecha) > max(ibr$fecha)) ibr <- ibr2
c1 <- cargar_curva_fra("Curva_FRA.xlsx"); attr(c1, "nombre") <- "FR 2026-10-14"
cs <- cargar_curvas_fra("/mnt/user-data/attachments/b41e1e11-b557-520c-8c79-343117d5a588/ae514822-Tasas_de_inter_s_66.xlsx")
curvas <- c(cs, list(c1))
d0 <- as.numeric(as.Date("1970-01-01"))
stopifnot(all(diff(uvr$fecha) == 1))
datos <- list(
  generado = format(Sys.Date()),
  ipc = list(fechas = format(ipc$fecha), inflacion = ipc$inflacion),
  uvr = list(inicio = format(min(uvr$fecha)), valores = round(uvr$valor, 4)),
  ibr = list(fechas = format(ibr$fecha), overnight = ibr$overnight, m1 = ibr$m1, m3 = ibr$m3, m6 = ibr$m6, m12 = ibr$m12),
  curvas = lapply(curvas, function(c) list(nombre = attr(c, "nombre"), inicio = format(min(c$fecha)),
                                           offsets = as.integer(c$fecha - min(c$fecha)), tasas = round(c$tasa, 10)))
)
writeLines(toJSON(datos, digits = NA, auto_unbox = TRUE, na = "null"), "/home/claude/calculadora_web/data/datos.json")
cat("IPC", format(range(ipc$fecha)), "| UVR", format(range(uvr$fecha)), "| IBR", format(range(ibr$fecha)), "| curvas", sapply(curvas, attr, "nombre"), "\n")
cat("tamaño:", file.size("/home/claude/calculadora_web/data/datos.json")/1024, "KB\n")
