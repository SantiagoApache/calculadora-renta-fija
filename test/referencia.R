suppressMessages({library(readxl); library(jsonlite)})
setwd("/home/claude/renta_fija")
for (f in c("funciones_modulo1.R","funciones_modulo2.R","funciones_ipc.R","funciones_ipc_tir.R","funciones_uvr.R","funciones_uvr_tir.R","funciones_ibr.R","funciones_ibr_tir.R","funciones_riesgo.R")) source(f)
S <- "/tmp/claude-0/-home-claude/b41e1e11-b557-520c-8c79-343117d5a588/scratchpad"
U <- "/root/.claude/uploads/b41e1e11-b557-520c-8c79-343117d5a588/"
ipc <- cargar_ipc(file.path(S, "ipc_user/ipc.xlsx")); ipc_viejo <- cargar_ipc("Inflacion_y_meta.xlsx")
uvr <- cargar_uvr(file.path(S, "uvr_user/uvr.xlsx"))
ibr <- cargar_ibr("Tasas_de_interes_IBR.xlsx")
c1 <- cargar_curva_fra("Curva_FRA.xlsx"); attr(c1, "nombre") <- "FR 2026-10-14"
cs <- c(cargar_curvas_fra("/mnt/user-data/attachments/b41e1e11-b557-520c-8c79-343117d5a588/ae514822-Tasas_de_inter_s_66.xlsx"), list(c1))
fc <- cargar_pronostico_ipc(paste0(U, "7a5eb932-inflaci_n_ejercicio.xlsx"))
cc <- cargar_curva_cc("CC_curva_cero_cupon_ejemplo.xlsx")
R <- list()
# --- TES ---
r <- precio_bono_fechas("2024-12-12","2027-12-12",0.1008,4,0.08,"2025-01-23")
R$tes1 <- c(r$precio_sucio, r$interes_corrido, r$precio_limpio)
r <- precio_bono_fechas("2026-10-20","2031-10-20",0.1385,4,0.136,"2026-11-04")
m <- medidas_riesgo(r$flujos, r$t_anios, 0.136, 4, r$precio_sucio_truncado, 1e8)
R$tes2 <- c(r$precio_sucio, r$precio_limpio, m$duracion_macaulay, m$duracion_modificada, m$convexidad, m$dv01_pesos, m$sensibilidad$Precio_exacto, m$sensibilidad$DV01_pesos, m$sube$dur_conv, m$baja$dur_conv)
r <- precio_bono_fechas("2025-01-01","2033-01-01",0.10,1,0.10,"2025-01-01")
m <- medidas_riesgo(r$flujos, r$t_anios, 0.10, 1, r$precio_sucio_truncado, 1e8)
R$tes3 <- c(m$duracion_macaulay, m$duracion_modificada, m$convexidad, m$sube$dur_conv, m$baja$dur_conv)
r <- precio_bono_fechas("2026-10-20","2031-10-20",0.1385,4,0.10,"2026-11-04"); v <- valorar_tes_con_curva(r, cc, 129, "2026-11-04")
m <- medidas_riesgo(r$flujos, r$t_anios, v$tir_equivalente, 4, v$precio_sucio_truncado, 1e8, tasas_flujo = v$tasas_flujo)
R$tes4 <- c(v$precio_sucio, v$tir_equivalente, m$duracion_modificada, m$dv01_pesos)
o <- rentabilidad_operacion("2024-12-12","2027-12-12",4,0.1008,100,"2025-01-23",truncar(precio_bono_fechas("2024-12-12","2027-12-12",0.1008,4,0.08,"2025-01-23")$precio_sucio,3),
     "2026-06-15", truncar(precio_bono_fechas("2024-12-12","2027-12-12",0.1008,4,0.09,"2026-06-15")$precio_sucio,3))
R$tes5 <- c(o$tir, sum(o$cupones_recibidos$monto))
# --- IPC ---
r <- precio_bono_ipc("2026-10-20","2036-10-20",4,0.0798,"inicio",0.075,"2026-11-04",ipc,"spread_ipc",100,1e10)
m <- medidas_riesgo(r$flujos, r$t_anios, r$tasa_descuento, 4, r$precio_sucio_truncado, 1e8)
R$ipc1 <- c(r$precio_sucio, r$interes_corrido, r$precio_limpio, r$valor_giro, m$duracion_macaulay, m$convexidad, m$dv01_pesos)
r <- precio_bono_ipc("2024-01-15","2026-01-15",2,0.06,"final",0.12,"2024-08-20",ipc,"total",100,1e9)
R$ipc2 <- c(r$precio_sucio, r$interes_corrido)
for (md in c("inicio","final")) {
  a <- rentabilidad_ipc("real","2024-01-15","2025-01-15",4,0.0485,md,"2024-01-15","tasa",14.58008,"total",NULL,"2025-01-14","tasa",10.3022,"total",NULL,ipc,100,1e10)
  R[[paste0("ipc_real_", md)]] <- c(a$tir, a$precio_venta, a$pyg_pesos, a$cupones$monto)
  a <- rentabilidad_ipc("estimada","2024-01-15","2025-01-15",4,0.0485,md,"2024-01-15","tasa",14.58008,"total",NULL,"2025-01-14","tasa",10.3022,"total",NULL,ipc,100,1e10)
  R[[paste0("ipc_est_", md)]] <- c(a$tir, a$precio_venta, a$pyg_pesos)
}
a <- rentabilidad_ipc("estimada","2026-10-14","2027-10-14",4,0.059,"inicio","2026-10-14","precio",NULL,"total",100,"2027-10-14","precio",NULL,"total",100,ipc_viejo,100,1e9, ipc_pronostico = fc, base = "30_360")
R$ipc_pron_viejo <- c(a$tir, a$cupones$monto)
a <- rentabilidad_ipc("estimada","2026-10-14","2027-10-14",4,0.059,"inicio","2026-10-14","precio",NULL,"total",100,"2027-10-14","precio",NULL,"total",100,ipc,100,1e9, ipc_pronostico = fc, base = "30_360")
R$ipc_pron <- c(a$tir, a$cupones$monto)
a <- rentabilidad_ipc("real","2024-01-15","2026-01-15",4,0.05,"inicio","2024-03-01","tasa",3,"spread_ipc",NULL,"2025-05-20","precio",NULL,"total",101.2,ipc,100,1e10, dias_tir="sin_feb29")
R$ipc_spread <- c(a$tir, a$precio_compra, a$pyg_pesos)
# --- UVR ---
r <- valorar_bono_uvr("2026-10-20","2031-10-20",4,0.1385,0.136,"2026-11-04",uvr,1e7,"uvr")
m <- medidas_riesgo(r$flujos, r$t_anios, 0.136, 4, r$precio_sucio_truncado, r$nominal_uvr/100)
R$uvr1 <- c(r$precio_sucio, r$valor_giro, r$valor_giro_uvr, r$uvr_negociacion, m$dv01_pesos, m$duracion_modificada_trunc/1e4*r$valor_giro)
for (tp in c("real","estimada")) {
  a <- rentabilidad_uvr(tp,"2023-03-10","2028-03-10",1,0.04,"2024-02-20","tasa",5.1,NULL,"2026-09-30","tasa",4.6,NULL,uvr,ipc,1e10,"pesos")
  R[[paste0("uvr_", tp)]] <- c(a$tir_pesos, a$tir_uvr, a$giro_compra, a$valor_venta, a$pyg_pesos, a$nominal_uvr)
}
# --- IBR ---
a <- rentabilidad_ibr("real","2024-01-15","2025-01-15",12,0.011,"auto","2024-01-15",100.003,100,1e10,ibr,cs)
R$ibr_real_muestra <- c(a$tir, a$tabla$Valor_transaccion)
a <- rentabilidad_ibr("estimada","2024-10-22","2026-10-22",12,0.02,"auto","2024-10-22",NULL,100,1e10,ibr,cs, modo_compra="tir", tir_negociacion=0.09674)
m <- medidas_riesgo(a$riesgo_base$flujos, a$riesgo_base$t, a$riesgo_base$tasa, 12, a$precio_compra, 1e8)
R$ibr_est_tir <- c(a$precio_compra, a$tir, a$tabla$Valor_transaccion, m$duracion_macaulay, m$duracion_modificada, m$convexidad, m$dv01_pesos)
a <- rentabilidad_ibr("estimada","2024-10-22","2026-10-22",12,0.02,"auto","2024-10-22",NULL,100,1e10,ibr,cs, modo_compra="tasa", spread_negociacion=0.018)
R$ibr_est_prom <- c(a$valoracion$precio_sucio, a$valoracion$tasa_descuento_ea, a$tir)
a <- rentabilidad_ibr("real","2024-10-22","2026-10-22",12,0.02,"auto","2024-10-22",NULL,100,1e10,ibr,cs, modo_compra="tasa", spread_negociacion=0.018,
       fecha_venta="2025-06-11", modo_venta="tasa", spread_negociacion_venta=0.013)
R$ibr_real_venta <- c(a$precio_compra, a$precio_venta, a$tir, a$pyg_pesos, a$tabla$Valor_transaccion, a$cupon_corrido_venta, a$precio_limpio_venta)
a <- rentabilidad_ibr("real","2025-01-08","2026-01-08",12,0.015,"auto","2025-01-29",NULL,100,1e10,ibr,NULL, modo_compra="tasa", spread_negociacion=0.015, metodo_descuento="vigente")
R$ibr_davivienda <- c(a$valoracion$precio_sucio, a$valoracion$tasa_descuento_ea, a$tir)
a <- rentabilidad_ibr("estimada","2026-10-14","2027-10-14",12,0.011,"auto","2026-10-14",100,100,1e10,ibr,cs)
R$ibr_fr2026 <- c(a$tir)
a <- rentabilidad_ibr("estimada","2024-10-22","2026-10-22",12,0.02,"auto","2024-10-22",NULL,100,1e10,ibr,cs, modo_compra="tasa", spread_negociacion=0.018,
       fecha_venta="2025-06-11", modo_venta="tasa", spread_negociacion_venta=0.013)
R$ibr_est_venta <- c(a$precio_venta, a$tir)
args <- list(tipo="real", fecha_emision="2024-10-22", fecha_vencimiento="2026-10-22", periodo_cupon=12, spread_nominal=0.02, tenor="auto",
  fecha_compra="2024-10-22", valor_nominal=100, monto_pesos=1e10, ibr_df=ibr, fra_df=cs, modo_compra="tasa", spread_negociacion=0.018,
  fecha_venta="2025-06-11", modo_venta="tasa", spread_negociacion_venta=0.013, metodo_descuento="promedio")
s <- senda_tir_ibr(args)
R$ibr_senda <- c(s$tir_vencimiento, s$tabla$Precio_venta, unlist(s$tabla[,-(1:2)]))
# festivos 2024-2026 y regla de fecha
fs <- sort(c(festivos_colombia(2024), festivos_colombia(2025), festivos_colombia(2026)))
R$festivos <- as.numeric(fs)
ds <- seq(as.Date("2024-01-01"), as.Date("2026-12-31"), by = "day")
R$regla_ibr <- as.numeric(sapply(ds, function(d) as.numeric(fecha_ibr_aplicable(d))))
writeLines(toJSON(R, digits = NA), "/home/claude/calculadora_web/test/referencia.json")
cat("casos:", length(R), "\n")
