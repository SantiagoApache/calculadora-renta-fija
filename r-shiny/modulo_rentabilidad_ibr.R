# =============================================================
# Interfaz (modulo Shiny) de la rentabilidad de una operacion con bono IBR
# (compra y venta antes del vencimiento, o mantenido al vencimiento).
# Se usa dos veces en app.R: tipo "estimada" (curva FR) y tipo "real".
# Requiere funciones_ibr_tir.R
# =============================================================

# Entradas de negociacion (compra o venta): precio, TIR EA o IBR + spread
.entradas_negociacion_ibr <- function(ns, prefijo, titulo, precio_defecto, tir_defecto, spread_defecto) {
  modo <- ns(paste0("modo_", prefijo))
  tagList(
    radioButtons(modo, titulo,
                 choices = list("Precio sucio directo" = "precio",
                                "TIR de negociacion EA (flujos proyectados con la curva)" = "tir",
                                "Spread de negociacion: IBR + x% (flujos con la curva)" = "tasa"),
                 selected = "precio"),
    conditionalPanel(sprintf("input['%s'] == 'precio'", modo),
      numericInput(ns(paste0("precio_", prefijo)), "Precio sucio (base 100):", value = precio_defecto, step = 0.001)
    ),
    conditionalPanel(sprintf("input['%s'] == 'tir'", modo),
      numericInput(ns(paste0("tir_neg_", prefijo)), "TIR de negociacion (% EA):", value = tir_defecto, step = 0.001)
    ),
    conditionalPanel(sprintf("input['%s'] == 'tasa'", modo),
      numericInput(ns(paste0("spread_neg_", prefijo)), "Spread de negociacion sobre el IBR (% nominal, misma periodicidad del cupon):",
                   value = spread_defecto, step = 0.01)
    )
  )
}

rentIbrUI <- function(id, tipo = "real") {
  ns <- NS(id)
  es_real <- tipo == "real"

  sidebarLayout(

    sidebarPanel(
      h4("Datos del bono"),
      dateInput(ns("fecha_emision"), "Fecha de emision:", value = if (es_real) "2024-01-15" else "2026-10-14"),
      dateInput(ns("fecha_vencimiento"), "Fecha de vencimiento:", value = if (es_real) "2025-01-15" else "2027-10-14"),
      numericInput(ns("spread"), "Spread fijo sobre el IBR (% nominal anual):", value = 1.10, step = 0.01),
      selectInput(ns("periodo"), "Periodicidad del cupon:",
                  choices = list("Mensual" = 12, "Trimestral" = 4, "Semestral" = 2, "Anual" = 1),
                  selected = 12),
      selectInput(ns("tenor"), "Plazo del IBR:",
                  choices = list("Segun la periodicidad (mensual = 1 mes, trimestral = 3, semestral = 6, anual = 12)" = "auto",
                                 "Overnight" = "overnight", "1 mes" = "1m", "3 meses" = "3m",
                                 "6 meses" = "6m", "12 meses" = "12m"),
                  selected = "auto"),

      hr(),
      h4("Compra"),
      dateInput(ns("fecha_compra"), "Fecha de compra:", value = if (es_real) "2024-01-15" else "2026-10-14"),
      .entradas_negociacion_ibr(ns, "compra", "Ingresar la compra por:",
                                if (es_real) 100.003 else 100, 9.674, 1.10),

      hr(),
      h4("Venta"),
      checkboxInput(ns("vender"), "Vender antes del vencimiento", value = FALSE),
      conditionalPanel(sprintf("input['%s']", ns("vender")),
        dateInput(ns("fecha_venta"), "Fecha de venta:", value = if (es_real) "2024-07-15" else "2027-04-14"),
        p(em("La venta se valora parado en su fecha: el cupon en curso con el IBR publicado y los siguientes con la curva FR vigente ese dia (o con el IBR vigente constante si no hay curva).")),
        .entradas_negociacion_ibr(ns, "venta", "Ingresar la venta por:", 100, 9.674, 1.10)
      ),
      checkboxInput(ns("sendas"), "Calcular sendas de TIR (vender en cada fecha de cupon, con +/- 25 y 50 pb, vs. mantener al vencimiento)", value = FALSE),

      hr(),
      selectInput(ns("metodo_descuento"), "Metodo de descuento con spread de negociacion (IBR + x%):",
                  choices = list("TIR con IBR promedio: EA de (promedio de los IBR proyectados + spread)" = "promedio",
                                 "TIR con IBR vigente: EA de (IBR vigente + spread), como el ejercicio Davivienda" = "vigente"),
                  selected = "promedio"),

      hr(),
      h4("Curva FR"),
      p(em("Opcional: carga aqui un Excel de curvas FR (columnas Fecha y Tasa nominal anual). Si trae varias hojas (una curva por fecha de publicacion), en cada fecha se usa la curva vigente: la ultima publicada en o antes de esa fecha. Si no cargas nada, se usa la de la pestaña 'Datos IBR'.")),
      fileInput(ns("curva_fr"), NULL, accept = ".xlsx",
                buttonLabel = "Cargar curva FR...", placeholder = "(usa la de 'Datos IBR')"),
      uiOutput(ns("estado_curva")),

      hr(),
      h4("Riesgo"),
      numericInput(ns("cambio_pb"), "Cambio de la tasa para el resumen de precios (pb):", value = 100, min = 1, step = 25),
      fluidRow(
        column(6, numericInput(ns("rango_pb"), "Tabla: hasta +/- (pb)", value = 400, min = 1, step = 50)),
        column(6, numericInput(ns("paso_pb"), "Tabla: de a (pb)", value = 100, min = 1, step = 10))
      ),

      hr(),
      h4("Valor nominal"),
      numericInput(ns("valor_nominal"), "Valor nominal del bono (base de calculo, usualmente 100):",
                   value = 100, min = 0, step = 1),
      numericInput(ns("monto_pesos"), "Valor nominal transado (en pesos):",
                   value = 10000000000, min = 0, step = 1000000),

      hr(),
      actionButton(ns("calcular"), "Calcular", class = "btn-primary", width = "100%")
    ),

    mainPanel(
      if (es_real) {
        p(strong("Rentabilidad REAL:"), "cada cupon usa el IBR publicado por el Banco de la Republica aplicable al inicio de su periodo (con dias habiles y festivos). Si ese IBR aun no esta publicado, se estima con la curva FR y el flujo se marca como \"Est.\".")
      } else {
        p(strong("Rentabilidad PROYECTADA:"), "el cupon en curso usa el IBR publicado; los siguientes, la tasa de la curva FR (nominal anual, dia a dia) en la fecha de inicio de su periodo, sin ajuste por festivos.")
      },
      uiOutput(ns("notas")),

      wellPanel(strong(textOutput(ns("titulo_tir"), inline = TRUE)), h2(textOutput(ns("tir")))),

      uiOutput(ns("linea_compra")),
      uiOutput(ns("linea_venta")),
      p("Cupones recibidos (pesos): ", strong(textOutput(ns("cupones"), inline = TRUE)),
        " | Ganancia total (pesos): ", strong(textOutput(ns("pyg"), inline = TRUE))),

      uiOutput(ns("bloque_valoracion")),
      uiOutput(ns("bloque_valoracion_venta")),

      hr(),
      h4("Flujos de la inversion"),
      tableOutput(ns("tabla")),

      hr(),
      h4("Riesgo en la fecha de compra: duracion, convexidad y DV01"),
      uiOutput(ns("riesgo_nota")),
      fluidRow(
        column(3, wellPanel(strong("Duracion de Macaulay (años)"), h3(textOutput(ns("mac"))))),
        column(3, wellPanel(strong("Duracion modificada"), h3(textOutput(ns("dmod"))))),
        column(3, wellPanel(strong("Convexidad"), h3(textOutput(ns("conv"))))),
        column(3, wellPanel(strong("DV01 de la posicion (pesos)"), h3(textOutput(ns("dv01_pesos"))),
                            p("Por 100 de nominal: ", strong(textOutput(ns("dv01"), inline = TRUE))),
                            p(em(textOutput(ns("dv01_formula"), inline = TRUE)))))
      ),
      uiOutput(ns("riesgo_texto")),
      h4("Sensibilidad del precio y del DV01 a la tasa"),
      p(em("Se mueve la TIR de valoracion con los flujos proyectados fijos. Precio exacto: revaloracion con la nueva tasa. DV01 de cada fila: recalculado con la tasa de ese escenario.")),
      tableOutput(ns("sensibilidad")),
      h4("Calculo de la duracion y la convexidad"),
      tableOutput(ns("tabla_duracion")),

      uiOutput(ns("bloque_senda"))
    )
  )
}

rentIbrServer <- function(id, ibr_datos, fra_datos, tipo = "real") {

  moduleServer(id, function(input, output, session) {

    fmt_pesos <- function(x) formatC(x, format = "f", digits = 2, big.mark = ",")

    # Curvas que usa esta pestaña: todas las hojas del archivo cargado aqui
    # (una curva por fecha de publicacion) o, si no hay, la general.
    curva_usada <- reactive({
      if (!is.null(input$curva_fr)) {
        tryCatch(cargar_curvas_fra(input$curva_fr$datapath),
                 error = function(e) validate(paste("No se pudo leer la curva FR cargada:", conditionMessage(e))))
      } else {
        fra_datos()
      }
    })

    output$estado_curva <- renderUI({
      d <- curva_usada()
      if (is.null(d)) return(p("Sin curva FR cargada."))
      lista <- if (is.data.frame(d)) list(d) else d
      origen <- if (!is.null(input$curva_fr)) paste0("Archivo cargado aqui (", input$curva_fr$name, "):") else "Curva de 'Datos IBR':"
      tagList(p(strong(origen)), tags$ul(lapply(lista, function(c) {
        desc <- attr(c, "descartadas")
        tags$li(sprintf("%s: del %s al %s, primera tasa %.3f%%%s",
                        if (is.null(attr(c, "nombre"))) "Curva" else attr(c, "nombre"),
                        format(min(c$fecha)), format(max(c$fecha)), c$tasa[1] * 100,
                        if (!is.null(desc) && desc > 0) sprintf(" (%d filas dañadas descartadas)", desc) else ""))
      })))
    })

    # Argumentos de la operacion (se fijan al presionar Calcular)
    argumentos <- eventReactive(input$calcular, {

      validate(
        need(!is.na(input$spread), "Completa el spread."),
        need(!is.na(input$valor_nominal) && input$valor_nominal > 0 &&
             !is.na(input$monto_pesos) && input$monto_pesos > 0,
             "El valor nominal y el valor nominal transado deben ser mayores a cero.")
      )

      ibr_df <- ibr_datos()
      fra_df <- curva_usada()
      if (tipo == "real") {
        validate(need(!is.null(ibr_df), "Carga la base de IBR en la pestaña 'Datos IBR' (o ponla en la carpeta de la app)."))
      } else {
        validate(need(!is.null(fra_df), "Carga la curva FR en la pestaña 'Datos IBR' o en esta pestaña."))
      }

      modo_c <- if (is.null(input$modo_compra)) "precio" else input$modo_compra
      vender <- isTRUE(input$vender)
      modo_v <- if (is.null(input$modo_venta)) "precio" else input$modo_venta

      list(
        tipo = tipo,
        fecha_emision = input$fecha_emision, fecha_vencimiento = input$fecha_vencimiento,
        periodo_cupon = as.numeric(input$periodo), spread_nominal = input$spread / 100,
        tenor = input$tenor,
        fecha_compra = input$fecha_compra,
        precio_compra = if (modo_c == "precio") input$precio_compra else NULL,
        valor_nominal = input$valor_nominal, monto_pesos = input$monto_pesos,
        ibr_df = ibr_df, fra_df = fra_df, desfase_proyectado = 0,
        modo_compra = modo_c,
        spread_negociacion = if (modo_c == "tasa") input$spread_neg_compra / 100 else NULL,
        tir_negociacion = if (modo_c == "tir") input$tir_neg_compra / 100 else NULL,
        fecha_venta = if (vender) input$fecha_venta else NULL,
        modo_venta = modo_v,
        precio_venta = if (vender && modo_v == "precio") input$precio_venta else NULL,
        spread_negociacion_venta = if (vender && modo_v == "tasa") input$spread_neg_venta / 100 else NULL,
        tir_negociacion_venta = if (vender && modo_v == "tir") input$tir_neg_venta / 100 else NULL,
        metodo_descuento = if (is.null(input$metodo_descuento)) "promedio" else input$metodo_descuento
      )
    })

    resultado <- reactive({
      tryCatch(do.call(rentabilidad_ibr, argumentos()), error = function(e) validate(conditionMessage(e)))
    })

    # Sendas de TIR (solo si se marco la casilla al calcular)
    senda <- eventReactive(input$calcular, {
      if (!isTRUE(input$sendas)) return(NULL)
      resultado()   # si la operacion falla, no se calcula la senda
      withProgress(message = "Calculando sendas de TIR...", value = 0.5, {
        tryCatch(senda_tir_ibr(argumentos()), error = function(e) list(error = conditionMessage(e)))
      })
    })

    output$bloque_senda <- renderUI({
      s <- senda()
      if (is.null(s)) return(NULL)
      if (!is.null(s$error)) return(tagList(hr(), h4("Sendas de TIR"), div(class = "alert alert-warning", s$error)))
      que <- if (s$modo == "tasa") sprintf("spread de venta IBR + %.2f%% (columna TIR)", s$valor_base * 100)
             else sprintf("TIR de negociacion de venta %.4f%% EA (columna TIR)", s$valor_base * 100)
      tagList(
        hr(),
        h4("Sendas de TIR: vender en cada fecha de cupon vs. mantener al vencimiento"),
        p(sprintf("Cada fila es la TIR de la operacion si se vende ese dia, valorando la venta con %s; las demas columnas suben o bajan ese valor en puntos basicos. La venta se valora parado en su fecha (IBR publicados hasta ese dia y curva FR vigente de ahi en adelante).", que)),
        wellPanel(strong("TIR si se mantiene al vencimiento: "),
                  strong(if (is.na(s$tir_vencimiento)) "N/A" else sprintf("%.4f%%", s$tir_vencimiento * 100))),
        tableOutput(session$ns("tabla_senda"))
      )
    })
    output$tabla_senda <- renderTable({
      s <- senda()
      req(!is.null(s), is.null(s$error))
      t <- s$tabla
      out <- data.frame(Fecha_venta = paste0(format(t$Fecha_venta),
                                             ifelse(!is.na(s$venta_elegida) & t$Fecha_venta == s$venta_elegida, " (elegida)", "")),
                        Precio_venta = sprintf("%.3f", t$Precio_venta), check.names = FALSE)
      for (k in names(t)[-(1:2)]) out[[k]] <- ifelse(is.na(t[[k]]), "", sprintf("%.4f%%", t[[k]] * 100))
      out[["vs. mantener (pb)"]] <- ifelse(is.na(t$TIR), "", sprintf("%+.1f", (t$TIR - s$tir_vencimiento) * 10000))
      out
    }, align = "r")

    # ---------- Riesgo (duracion, convexidad, DV01) en la fecha de compra ----------
    riesgo <- reactive({
      r <- resultado(); b <- r$riesgo_base
      validate(need(!is.null(b), "No se pudo calcular el riesgo con los datos de la compra."))
      cpb <- if (is.null(input$cambio_pb) || is.na(input$cambio_pb) || input$cambio_pb <= 0) 100 else input$cambio_pb
      rango <- if (is.null(input$rango_pb) || is.na(input$rango_pb) || input$rango_pb <= 0) 400 else input$rango_pb
      paso <- if (is.null(input$paso_pb) || is.na(input$paso_pb) || input$paso_pb <= 0) 100 else input$paso_pb
      pasos <- unique(sort(c(seq(-rango, rango, by = min(paso, rango)), 0)))
      a <- argumentos()
      m <- medidas_riesgo(b$flujos, b$t, b$tasa, a$periodo_cupon, precio_actual = r$precio_compra,
                          factor_pesos = a$monto_pesos / a$valor_nominal, cambio_pb = cpb, pasos_pb = pasos)
      m$fechas <- b$fechas; m$origen <- b$origen
      m
    })
    output$riesgo_nota <- renderUI({
      m <- riesgo()
      p(em(sprintf("Flujos proyectados en la fecha de compra (cupon en curso con el IBR publicado; los siguientes con la curva FR o el IBR vigente) descontados a la TIR de %s: %.4f%% EA. Precio de compra: %.3f.",
                   if (m$origen == "negociacion") "negociacion" else "la compra (implicita en el precio)", m$tasa_ea * 100, m$precio_actual)))
    })
    output$mac <- renderText(sprintf("%.6f", riesgo()$duracion_macaulay))
    output$dmod <- renderText(sprintf("%.6f", riesgo()$duracion_modificada))
    output$conv <- renderText(sprintf("%.6f", riesgo()$convexidad))
    output$dv01 <- renderText(sprintf("%.6f", riesgo()$dv01))
    output$dv01_formula <- renderText({
      m <- riesgo()
      sprintf("= D* %.3f / 10.000 x giro $ %s", m$duracion_modificada_trunc,
              formatC(m$dv01_pesos / (m$duracion_modificada_trunc / 1e4), format = "f", digits = 0, big.mark = ","))
    })
    output$dv01_pesos <- renderText(paste0("$ ", formatC(riesgo()$dv01_pesos, format = "f", digits = 0, big.mark = ",")))
    output$riesgo_texto <- renderUI({
      m <- riesgo(); pb <- m$cambio_pb
      tagList(
        p(sprintf("Si la tasa sube %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                  pb, m$sube$exacto, m$sube$duracion, m$sube$dur_conv, m$sube$dur_conv - m$precio_actual)),
        p(sprintf("Si la tasa baja %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                  pb, m$baja$exacto, m$baja$duracion, m$baja$dur_conv, m$baja$dur_conv - m$precio_actual))
      )
    })
    output$sensibilidad <- renderTable({
      s <- riesgo()$sensibilidad
      f0 <- function(x) ifelse(is.na(x), "", formatC(x, format = "f", digits = 0, big.mark = ","))
      data.frame(Cambio_pb = sprintf("%+g", s$Cambio_pb), Tasa_EA = sprintf("%.2f%%", s$Tasa_ea * 100),
                 Precio_exacto = sprintf("%.4f", s$Precio_exacto),
                 Cambio_valor_posicion = f0(s$Cambio_valor_pesos), DV01_posicion = f0(s$DV01_pesos),
                 check.names = FALSE)
    }, align = "r")
    output$tabla_duracion <- renderTable({
      m <- riesgo(); t <- m$tabla_flujos
      data.frame(Fecha = format(m$fechas), t_anios = sprintf("%.6f", t$t),
                 Flujo = sprintf("%.6f", t$Flujo), VP = sprintf("%.6f", t$VP),
                 t_x_VP = sprintf("%.6f", t$t_VP), t2_mas_t_x_VP = sprintf("%.6f", t$t2t_VP))
    }, align = "r")

    output$titulo_tir <- renderText({
      if (resultado()$al_vencimiento) "TIR EA de la inversion al vencimiento" else "TIR EA de la operacion (compra y venta)"
    })
    output$tir <- renderText({
      r <- resultado()
      if (is.na(r$tir)) "N/A" else sprintf("%.4f%%", r$tir * 100)
    })
    output$giro <- renderText(fmt_pesos(resultado()$giro_compra))
    output$cupones <- renderText(fmt_pesos(resultado()$cupones_pesos))
    output$pyg <- renderText(fmt_pesos(resultado()$pyg_pesos))
    output$linea_compra <- renderUI({
      r <- resultado()
      p("Compra: precio sucio ", strong(sprintf("%.3f", r$precio_compra)),
        " | cupon corrido ", strong(sprintf("%.6f", r$cupon_corrido_compra)),
        " | precio limpio ", strong(sprintf("%.3f", r$precio_limpio_compra)),
        " | valor de giro (pesos): ", strong(fmt_pesos(r$giro_compra)))
    })
    output$linea_venta <- renderUI({
      r <- resultado()
      if (r$al_vencimiento) return(NULL)
      p("Venta: precio sucio ", strong(sprintf("%.3f", r$precio_venta)),
        " | cupon corrido ", strong(sprintf("%.6f", r$cupon_corrido_venta)),
        " | precio limpio ", strong(sprintf("%.3f", r$precio_limpio_venta)),
        " | valor recibido (pesos): ", strong(fmt_pesos(r$valor_venta)))
    })

    # Detalle de una valoracion (compra o venta) por TIR o por IBR + spread
    bloque <- function(v, titulo, id_tabla, momento) {
      if (is.null(v)) return(NULL)
      tagList(
        h4(titulo),
        p(sprintf("Flujos proyectados parado %s: cupon en curso con el IBR publicado; los siguientes con la curva FR vigente ese dia (o con el IBR vigente constante si no hay curva). Descuento con dias/365.", momento)),
        if (identical(v$metodo, "spread")) tagList(
          p(sprintf("IBR del cupon en curso: %.3f%% | IBR vigente: %.3f%% (%s, dato del %s) | IBR promedio proyectado: %.4f%%",
                    v$ibr_periodo * 100, v$ibr_vigente * 100, v$fuente_ibr_vigente, format(v$fecha_dato_ibr_vigente), v$ibr_promedio * 100)),
          p(sprintf("Tasa de negociacion = IBR vigente + spread: %.4f%% N.A. | equivalente %.4f%% E.A.",
                    v$tasa_vigente_na * 100, v$tasa_vigente_ea * 100)),
          p("TIR de descuento usada (", if (identical(v$metodo_descuento, "vigente")) "IBR vigente" else "IBR promedio", "): ",
            strong(sprintf("%.6f%% E.A.", v$tasa_descuento_ea * 100)))
        ) else p("TIR de negociacion EA: ", strong(sprintf("%.4f%%", v$tasa_descuento_ea * 100))),
        p("Precio sucio: ", strong(sprintf("%.6f", v$precio_sucio)),
          " | truncado (usado): ", strong(sprintf("%.3f", v$precio_sucio_truncado)),
          " | cupon corrido (30/360): ", strong(sprintf("%.6f", v$cupon_corrido)),
          " | precio limpio: ", strong(sprintf("%.3f", v$precio_limpio))),
        if (!is.null(v$curva) && !is.na(v$curva)) p(em(sprintf("Curva FR usada en esta valoracion: %s.", v$curva))),
        tableOutput(session$ns(id_tabla))
      )
    }
    tabla_val <- function(v) {
      t <- v$tabla
      data.frame(Fecha_cupon = format(t$Fecha_cupon), Dias_descuento = t$Dias_descuento,
                 IBR = sprintf("%.3f%%", t$IBR * 100), Flujo = sprintf("%.6f", t$Flujo),
                 VP_flujo = sprintf("%.4f", t$VP))
    }

    output$bloque_valoracion <- renderUI(
      bloque(resultado()$valoracion, "Valoracion de la compra", "tabla_valoracion", "en la fecha de compra"))
    output$tabla_valoracion <- renderTable(tabla_val(resultado()$valoracion), align = "r")

    output$bloque_valoracion_venta <- renderUI(
      bloque(resultado()$valoracion_venta, "Valoracion de la venta", "tabla_valoracion_venta",
             "en la fecha de venta"))
    output$tabla_valoracion_venta <- renderTable(tabla_val(resultado()$valoracion_venta), align = "r")

    output$notas <- renderUI({
      r <- resultado()
      notas <- sprintf("Plazo de IBR usado: %s (tasas nominales anuales; cupon = (IBR + spread) / pagos por año; TIR con dias reales/365).",
                       r$tenor)
      if (tipo == "real" && r$n_estimados > 0) {
        notas <- c(notas, sprintf("%d flujo(s) usan un IBR aun no publicado, estimado con la curva FR (marcados \"Est.\").", r$n_estimados))
      }
      if (!is.na(r$ibr_promedio)) {
        notas <- c(notas, sprintf("IBR promedio de los cupones recibidos: %.3f%%.", r$ibr_promedio * 100))
      }
      if (any(grepl("constante", r$tabla$Fuente))) {
        notas <- c(notas, "La compra es anterior a la curva FR: los cupones futuros se proyectan con el IBR vigente a la fecha de compra, constante (como en la valoracion del profesor).")
      }
      if (r$n_retroceso > 0) {
        notas <- c(notas, sprintf("En %d fecha(s) no habia dato exacto en la base de IBR y se uso el dato disponible mas cercano hacia atras.", r$n_retroceso))
      }
      aviso <- if (isTRUE(r$sin_base_ibr)) div(class = "alert alert-warning", p(strong("Atencion: no hay base de IBR del Banco de la Republica cargada."),
        "Los IBR que ya estaban publicados (como el del cupon en curso) se tomaron de la curva FR, y el resultado cambia. Revisa la pestaña 'Datos IBR': debe decir 'IBR cargado...'. Pon el archivo de tasas IBR del Banco de la Republica (con la hoja 'Datos') en la carpeta de la app o cargalo en esa pestaña."))
      tagList(aviso, div(class = "alert alert-info", lapply(notas, function(n) p(n))))
    })

    output$tabla <- renderTable({
      t <- resultado()$tabla
      data.frame(
        Concepto = t$Concepto,
        Fecha_transaccion = format(t$Fecha_transaccion),
        Valor_transaccion = fmt_pesos(t$Valor_transaccion),
        IBR_aplicada = ifelse(is.na(t$IBR_usado), "", sprintf("%.3f%%", t$IBR_usado * 100)),
        Fuente = t$Fuente,
        Fecha_del_dato = ifelse(is.na(t$Fecha_dato), "", format(t$Fecha_dato))
      )
    }, align = "r")
  })
}
