# =============================================================
# Interfaz (modulo Shiny) de rentabilidad de una operacion con bono UVR
# Se usa dos veces en app.R: tipo "estimada" y tipo "real".
# Requiere funciones_uvr_tir.R
# =============================================================

rentUvrUI <- function(id, tipo = "real") {
  ns <- NS(id)
  es_real <- tipo == "real"

  sidebarLayout(

    sidebarPanel(
      h4("Datos del bono (en UVR)"),
      dateInput(ns("fecha_emision"), "Fecha de emision:", value = "2024-04-18"),
      dateInput(ns("fecha_vencimiento"), "Fecha de vencimiento:", value = "2029-04-18"),
      numericInput(ns("tasa_cupon"), "Tasa cupon real EA (%):", value = 2.25, min = 0, step = 0.01),
      selectInput(ns("periodo"), "Periodicidad del cupon:",
                  choices = list("Anual" = 1, "Semestral" = 2, "Trimestral" = 4, "Mensual" = 12),
                  selected = 1),

      hr(),
      h4("Compra"),
      dateInput(ns("fecha_compra"), "Fecha de compra:", value = "2025-02-03"),
      radioButtons(ns("modo_compra"), "Ingresar la compra por:",
                   choices = list("Tasa de mercado real" = "tasa", "Precio sucio directo" = "precio"),
                   selected = "tasa", inline = TRUE),
      conditionalPanel(sprintf("input['%s'] == 'tasa'", ns("modo_compra")),
        numericInput(ns("tasa_compra"), "Tasa de compra real EA (%):", value = 5.11, step = 0.0001)
      ),
      conditionalPanel(sprintf("input['%s'] == 'precio'", ns("modo_compra")),
        numericInput(ns("precio_compra"), "Precio sucio de compra (base 100):", value = 91.208, step = 0.001)
      ),

      hr(),
      h4("Venta (o vencimiento)"),
      dateInput(ns("fecha_venta"), "Fecha de venta:", value = "2026-02-03"),
      p(em("Si la fecha de venta es el dia del vencimiento, el bono se redime a su valor nominal.")),
      radioButtons(ns("modo_venta"), "Ingresar la venta por:",
                   choices = list("Tasa de mercado real" = "tasa", "Precio sucio directo" = "precio"),
                   selected = "tasa", inline = TRUE),
      conditionalPanel(sprintf("input['%s'] == 'tasa'", ns("modo_venta")),
        numericInput(ns("tasa_venta"), "Tasa de venta real EA (%):", value = 5, step = 0.0001)
      ),
      conditionalPanel(sprintf("input['%s'] == 'precio'", ns("modo_venta")),
        numericInput(ns("precio_venta"), "Precio sucio de venta (base 100):", value = 93.828, step = 0.001)
      ),

      hr(),
      h4("Valor nominal"),
      numericInput(ns("valor_nominal"), "Valor nominal del bono (base de calculo, usualmente 100):",
                   value = 100, min = 0, step = 1),
      radioButtons(ns("nominal_en"), "El valor nominal transado se ingresa en:",
                   choices = list("UVR" = "uvr", "Pesos" = "pesos"), selected = "uvr", inline = TRUE),
      numericInput(ns("nominal_transado"), "Valor nominal transado:", value = 10000000, min = 0, step = 1000),

      hr(),
      selectInput(ns("dias_tir"), "Dias para anualizar la TIR:",
                  choices = list("Sin 29 de febrero (como la valoracion 365/365)" = "sin_feb29",
                                 "Dias reales, con 29 de febrero (como XIRR; convencion del profesor)" = "reales"),
                  selected = "reales"),

      actionButton(ns("calcular"), "Calcular", class = "btn-primary", width = "100%")
    ),

    mainPanel(
      if (es_real) {
        p(strong("Rentabilidad REAL:"), "se usa la UVR realmente publicada en la fecha de compra, de cada cupon y de la venta.")
      } else {
        p(strong("Rentabilidad ESTIMADA al invertir:"), "solo se conoce la UVR hasta la fecha de compra; la UVR futura se proyecta con la formula del Banco de la Republica (UVR del dia 15 x (1+i)^(t/d)), suponiendo que la inflacion anual (IPC) vigente en la compra se mantiene.")
      },
      uiOutput(ns("notas")),

      fluidRow(
        column(6, wellPanel(strong("TIR EA en pesos"), h2(textOutput(ns("tir_pesos"))))),
        column(6, wellPanel(strong("TIR real EA en UVR"), h2(textOutput(ns("tir_uvr")))))
      ),

      fluidRow(
        column(6,
          h4("Compra"),
          p("Precio sucio: ", strong(textOutput(ns("p_compra"), inline = TRUE))),
          p("Precio limpio: ", strong(textOutput(ns("l_compra"), inline = TRUE))),
          p("UVR del dia: ", strong(textOutput(ns("uvr_compra"), inline = TRUE))),
          p("Valor de giro (pesos): ", strong(textOutput(ns("giro"), inline = TRUE)))
        ),
        column(6,
          h4(textOutput(ns("titulo_venta"), inline = TRUE)),
          p("Precio sucio: ", strong(textOutput(ns("p_venta"), inline = TRUE))),
          p("Precio limpio: ", strong(textOutput(ns("l_venta"), inline = TRUE))),
          p("UVR del dia: ", strong(textOutput(ns("uvr_venta"), inline = TRUE))),
          p("Valor recibido (pesos): ", strong(textOutput(ns("valor_venta"), inline = TRUE)))
        )
      ),
      p("Valor nominal (UVR): ", strong(textOutput(ns("nominal_uvr"), inline = TRUE)),
        " | Cupones recibidos (pesos): ", strong(textOutput(ns("cupones"), inline = TRUE)),
        " | Ganancia/perdida total (pesos): ", strong(textOutput(ns("pyg"), inline = TRUE))),

      hr(),
      h4("Flujos de la operacion"),
      tableOutput(ns("tabla"))
    )
  )
}

rentUvrServer <- function(id, uvr_datos, ipc_datos, tipo = "real") {

  moduleServer(id, function(input, output, session) {

    fmt_pesos <- function(x) formatC(x, format = "f", digits = 2, big.mark = ",")
    fmt_tir <- function(x) if (is.na(x)) "N/A" else sprintf("%.4f%%", x * 100)

    resultado <- eventReactive(input$calcular, {

      validate(
        need(!is.na(input$tasa_cupon), "Completa la tasa cupon."),
        need(!is.na(input$valor_nominal) && input$valor_nominal > 0 &&
             !is.na(input$nominal_transado) && input$nominal_transado > 0,
             "El valor nominal y el valor nominal transado deben ser mayores a cero.")
      )

      uvr_df <- uvr_datos()
      ipc_df <- if (tipo == "estimada") ipc_datos() else NULL

      res <- tryCatch(
        rentabilidad_uvr(
          tipo = tipo,
          fecha_emision = input$fecha_emision, fecha_vencimiento = input$fecha_vencimiento,
          periodo_cupon = as.numeric(input$periodo), tasa_cupon_real = input$tasa_cupon / 100,
          fecha_compra = input$fecha_compra, modo_compra = input$modo_compra,
          tasa_compra = input$tasa_compra, precio_compra_directo = input$precio_compra,
          fecha_venta = input$fecha_venta, modo_venta = input$modo_venta,
          tasa_venta = input$tasa_venta, precio_venta_directo = input$precio_venta,
          uvr_df = uvr_df, ipc_df = ipc_df,
          nominal_transado = input$nominal_transado, nominal_en = input$nominal_en,
          valor_nominal = input$valor_nominal, dias_tir = input$dias_tir
        ),
        error = function(e) validate(conditionMessage(e))
      )
      res
    })

    output$tir_pesos <- renderText(fmt_tir(resultado()$tir_pesos))
    output$tir_uvr <- renderText(fmt_tir(resultado()$tir_uvr))
    output$p_compra <- renderText(sprintf("%.6f", resultado()$precio_compra))
    output$l_compra <- renderText(sprintf("%.6f", resultado()$precio_limpio_compra))
    output$uvr_compra <- renderText(sprintf("%.4f", resultado()$uvr_compra))
    output$giro <- renderText(fmt_pesos(resultado()$giro_compra))
    output$titulo_venta <- renderText(if (resultado()$al_vencimiento) "Vencimiento" else "Venta")
    output$p_venta <- renderText(sprintf("%.6f", resultado()$precio_venta))
    output$l_venta <- renderText(sprintf("%.6f", resultado()$precio_limpio_venta))
    output$uvr_venta <- renderText(sprintf("%.4f", resultado()$uvr_venta))
    output$valor_venta <- renderText(fmt_pesos(resultado()$valor_venta))
    output$nominal_uvr <- renderText(formatC(resultado()$nominal_uvr, format = "f", digits = 4, big.mark = ","))
    output$cupones <- renderText(fmt_pesos(resultado()$cupones_pesos))
    output$pyg <- renderText(fmt_pesos(resultado()$pyg_pesos))

    output$notas <- renderUI({
      r <- resultado()
      if (tipo != "estimada") return(NULL)
      div(class = "alert alert-info",
          p(sprintf("Inflacion anual supuesta hacia adelante: %.2f%% (IPC vigente en la compra). La UVR del %s y anteriores es la publicada; las posteriores son proyectadas.",
                    r$inflacion_supuesta * 100, format(r$fecha_compra))))
    })

    output$tabla <- renderTable({
      t <- resultado()$tabla
      data.frame(
        Concepto = t$Concepto,
        Fecha = format(t$Fecha),
        UVR_del_dia = sprintf("%.4f", t$UVR_dia),
        Valor_UVR = formatC(t$Valor_UVR, format = "f", digits = 4, big.mark = ","),
        Valor_pesos = fmt_pesos(t$Valor_pesos)
      )
    }, align = "r")
  })
}
