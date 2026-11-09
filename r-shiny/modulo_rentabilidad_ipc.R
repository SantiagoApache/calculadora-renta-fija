# =============================================================
# Interfaz (modulo Shiny) de rentabilidad de una operacion con bono IPC
# Se usa dos veces en app.R: tipo "estimada" y tipo "real".
# Requiere funciones_ipc_tir.R
# =============================================================

rentIpcUI <- function(id, tipo = "real") {
  ns <- NS(id)
  es_real <- tipo == "real"

  sidebarLayout(

    sidebarPanel(
      h4("Datos del bono"),
      dateInput(ns("fecha_emision"), "Fecha de emision:", value = "2019-01-15"),
      dateInput(ns("fecha_vencimiento"), "Fecha de vencimiento:", value = "2025-01-15"),
      numericInput(ns("spread"), "Spread EA sobre el IPC (%):", value = 4.85, min = 0, step = 0.01),
      selectInput(ns("periodo"), "Periodicidad del cupon:",
                  choices = list("Anual" = 1, "Semestral" = 2, "Trimestral" = 4, "Mensual" = 12),
                  selected = 4),
      radioButtons(ns("modo"), "IPC que se aplica a cada cupon:",
                   choices = list("IPC del inicio de su periodo" = "inicio",
                                  "IPC del final de su periodo" = "final"),
                   selected = "inicio"),

      hr(),
      h4("Compra"),
      dateInput(ns("fecha_compra"), "Fecha de compra:", value = "2024-01-15"),
      radioButtons(ns("modo_compra"), "Ingresar la compra por:",
                   choices = list("Tasa de mercado" = "tasa", "Precio sucio directo" = "precio"),
                   selected = "tasa", inline = TRUE),
      conditionalPanel(sprintf("input['%s'] == 'tasa'", ns("modo_compra")),
        numericInput(ns("tasa_compra"), "Tasa de negociacion compra (%):", value = 14.58008, step = 0.0001),
        radioButtons(ns("tipo_tasa_compra"), "La tasa es:",
                     choices = list("Tasa total efectiva anual" = "total",
                                    "Spread EA sobre el IPC vigente" = "spread_ipc"),
                     selected = "total")
      ),
      conditionalPanel(sprintf("input['%s'] == 'precio'", ns("modo_compra")),
        numericInput(ns("precio_compra"), "Precio sucio de compra (base 100):", value = 100, step = 0.001)
      ),

      hr(),
      h4("Venta (o vencimiento)"),
      dateInput(ns("fecha_venta"), "Fecha de venta:", value = "2025-01-14"),
      p(em("Si la fecha de venta es el dia del vencimiento, el bono se redime a su valor nominal.")),
      radioButtons(ns("modo_venta"), "Ingresar la venta por:",
                   choices = list("Tasa de mercado" = "tasa", "Precio sucio directo" = "precio"),
                   selected = "tasa", inline = TRUE),
      conditionalPanel(sprintf("input['%s'] == 'tasa'", ns("modo_venta")),
        numericInput(ns("tasa_venta"), "Tasa de negociacion venta (%):", value = 10.3022, step = 0.0001),
        radioButtons(ns("tipo_tasa_venta"), "La tasa es:",
                     choices = list("Tasa total efectiva anual" = "total",
                                    "Spread EA sobre el IPC vigente" = "spread_ipc"),
                     selected = "total")
      ),
      conditionalPanel(sprintf("input['%s'] == 'precio'", ns("modo_venta")),
        numericInput(ns("precio_venta"), "Precio sucio de venta (base 100):", value = 102.624, step = 0.001)
      ),

      hr(),
      h4("Valor nominal"),
      numericInput(ns("valor_nominal"), "Valor nominal del bono (base de calculo, usualmente 100):",
                   value = 100, min = 0, step = 1),
      numericInput(ns("monto_pesos"), "Valor nominal transado (en pesos):",
                   value = 10000000000, min = 0, step = 1000000),

      hr(),
      radioButtons(ns("base"), "Base de dias de cupones y TIR:",
                   choices = list("365/365 (dias reales, sin 29-feb)" = "365",
                                  "30/360 (meses de 30 dias; exige precios directos)" = "30_360"),
                   selected = "365"),
      if (!es_real) tagList(
        p(em("Pronostico de IPC (opcional): si cargas un archivo con Fecha e IPC por mes, esos valores reemplazan el supuesto de IPC constante despues de la ultima inflacion publicada.")),
        fileInput(ns("pronostico"), NULL, accept = ".xlsx",
                  buttonLabel = "Cargar pronostico...", placeholder = "(opcional)")
      ),
      selectInput(ns("dias_tir"), "Dias para anualizar la TIR (solo base 365/365):",
                  choices = list("Sin 29 de febrero (como la valoracion 365/365)" = "sin_feb29",
                                 "Dias reales, con 29 de febrero (como XIRR; convencion del profesor)" = "reales"),
                  selected = "reales"),

      actionButton(ns("calcular"), "Calcular", class = "btn-primary", width = "100%")
    ),

    mainPanel(
      if (es_real) {
        p(strong("Rentabilidad REAL:"), "cada cupon usa el IPC realmente publicado de su periodo, y la venta se valora con el IPC publicado a la fecha de venta.")
      } else {
        p(strong("Rentabilidad ESTIMADA al invertir:"), "solo se conocen los IPC publicados hasta la fecha de compra; se asume que el IPC vigente en la compra se mantiene constante (salvo el IPC del inicio del periodo de cada cupon, que ya es historico).")
      },
      uiOutput(ns("notas")),

      wellPanel(strong("TIR EA de la operacion"), h2(textOutput(ns("tir")))),

      fluidRow(
        column(6,
          h4("Compra"),
          p("Precio sucio: ", strong(textOutput(ns("p_compra"), inline = TRUE))),
          p("Precio limpio: ", strong(textOutput(ns("l_compra"), inline = TRUE))),
          p("Valor de giro (pesos): ", strong(textOutput(ns("giro"), inline = TRUE)))
        ),
        column(6,
          h4(textOutput(ns("titulo_venta"), inline = TRUE)),
          p("Precio sucio: ", strong(textOutput(ns("p_venta"), inline = TRUE))),
          p("Precio limpio: ", strong(textOutput(ns("l_venta"), inline = TRUE))),
          p("Valor recibido (pesos): ", strong(textOutput(ns("valor_venta"), inline = TRUE)))
        )
      ),
      p("Cupones recibidos (pesos): ", strong(textOutput(ns("cupones"), inline = TRUE)),
        " | Ganancia/perdida total (pesos): ", strong(textOutput(ns("pyg"), inline = TRUE))),

      hr(),
      h4("Flujos de la operacion"),
      tableOutput(ns("tabla"))
    )
  )
}

rentIpcServer <- function(id, ipc_datos, tipo = "real") {

  moduleServer(id, function(input, output, session) {

    fmt_pesos <- function(x) formatC(x, format = "f", digits = 2, big.mark = ",")

    resultado <- eventReactive(input$calcular, {

      validate(
        need(!is.na(input$spread), "Completa el spread."),
        need(!is.na(input$valor_nominal) && input$valor_nominal > 0 &&
             !is.na(input$monto_pesos) && input$monto_pesos > 0,
             "El valor nominal y el valor nominal transado deben ser mayores a cero.")
      )

      ipc_df <- ipc_datos()

      pronostico <- NULL
      if (tipo == "estimada" && !is.null(input$pronostico)) {
        pronostico <- tryCatch(cargar_pronostico_ipc(input$pronostico$datapath),
                               error = function(e) validate(paste("No se pudo leer el pronostico:", conditionMessage(e))))
      }

      res <- tryCatch(
        rentabilidad_ipc(
          tipo = tipo,
          fecha_emision = input$fecha_emision, fecha_vencimiento = input$fecha_vencimiento,
          periodo_cupon = as.numeric(input$periodo), spread_ea = input$spread / 100,
          modo_ipc = input$modo,
          fecha_compra = input$fecha_compra, modo_compra = input$modo_compra,
          tasa_compra = input$tasa_compra, tipo_tasa_compra = input$tipo_tasa_compra,
          precio_compra_directo = input$precio_compra,
          fecha_venta = input$fecha_venta, modo_venta = input$modo_venta,
          tasa_venta = input$tasa_venta, tipo_tasa_venta = input$tipo_tasa_venta,
          precio_venta_directo = input$precio_venta,
          ipc_df = ipc_df, valor_nominal = input$valor_nominal,
          monto_pesos = input$monto_pesos, dias_tir = input$dias_tir,
          ipc_pronostico = pronostico, base = input$base
        ),
        error = function(e) validate(conditionMessage(e))
      )
      res$ultima_fecha_ipc <- max(ipc_df$fecha)
      res$fecha_venta <- input$fecha_venta
      res
    })

    output$tir <- renderText({
      r <- resultado()
      if (is.na(r$tir)) "N/A (operacion intradia, sin tiempo para anualizar)"
      else sprintf("%.4f%%", r$tir * 100)
    })
    output$p_compra <- renderText(sprintf("%.6f", resultado()$precio_compra))
    output$l_compra <- renderText(sprintf("%.6f", resultado()$precio_limpio_compra))
    output$giro <- renderText(fmt_pesos(resultado()$giro_compra))
    output$titulo_venta <- renderText(if (resultado()$al_vencimiento) "Vencimiento" else "Venta")
    output$p_venta <- renderText(sprintf("%.6f", resultado()$precio_venta))
    output$l_venta <- renderText(sprintf("%.6f", resultado()$precio_limpio_venta))
    output$valor_venta <- renderText(fmt_pesos(resultado()$valor_venta))
    output$cupones <- renderText(fmt_pesos(resultado()$cupones_pesos))
    output$pyg <- renderText(fmt_pesos(resultado()$pyg_pesos))

    output$notas <- renderUI({
      r <- resultado()
      notas <- character(0)
      if (tipo == "estimada" && isTRUE(r$con_pronostico)) {
        notas <- c(notas, "Se uso el pronostico de IPC cargado para los periodos posteriores a la ultima inflacion publicada (cada cupon toma el IPC pronosticado vigente al inicio/final de su periodo).")
      } else if (tipo == "estimada") {
        notas <- c(notas, sprintf(
          "IPC supuesto hacia adelante: %.2f%% (dato del %s, vigente en la compra).",
          r$ipc_compra$valor * 100, format(r$ipc_compra$fecha_ipc)))
      }
      if (identical(r$base, "30_360")) {
        notas <- c(notas, "Base 30/360: cupon = [(1+IPC)(1+spread)]^(dias30/360) - 1 y TIR con t = dias30/360 (trimestral = exponente 1/4).")
      }
      if (tipo == "real" && r$fecha_venta > r$ultima_fecha_ipc) {
        notas <- c(notas, sprintf(
          "La fecha de venta es posterior al ultimo IPC de la base (%s); se usa ese ultimo valor para los datos que faltan.",
          format(r$ultima_fecha_ipc)))
      }
      if (length(notas) == 0) return(NULL)
      div(class = "alert alert-info", lapply(notas, function(n) p(n)))
    })

    output$tabla <- renderTable({
      t <- resultado()$tabla
      data.frame(
        Concepto = t$Concepto,
        Fecha_transaccion = format(t$Fecha_transaccion),
        Valor_transaccion = fmt_pesos(t$Valor_transaccion),
        Fecha_referencia_IPC = format(t$Fecha_referencia_IPC),
        IPC_usado = sprintf("%.2f%%", t$IPC_usado * 100)
      )
    }, align = "r")
  })
}
