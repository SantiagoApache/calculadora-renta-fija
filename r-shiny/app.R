library(shiny)

# Reutilizamos las funciones ya probadas de los Modulos 1 y 2
source("funciones_modulo1.R")
source("funciones_riesgo.R")   # Duracion, convexidad y DV01
source("funciones_modulo2.R")
source("funciones_ipc.R")     # Bonos indexados a IPC (requiere el paquete readxl)
source("funciones_uvr.R")     # Bonos en UVR (requiere el paquete readxl)
source("funciones_ipc_tir.R") # Rentabilidad (TIR) de operaciones con bono IPC
source("modulo_rentabilidad_ipc.R")
source("funciones_uvr_tir.R") # Rentabilidad (TIR) de operaciones con bono UVR
source("modulo_rentabilidad_uvr.R")
source("funciones_ibr.R")     # Base de IBR del Banco de la Republica + festivos (requiere readxl)
source("funciones_ibr_tir.R") # Rentabilidad (TIR) de bonos IBR (curva FR y base real)
source("modulo_rentabilidad_ibr.R")

# =============================================================
# UI: lo que el usuario ve e ingresa
# =============================================================
ui <- fluidPage(

  titlePanel("Calculadora de Renta Fija"),

  tabsetPanel(

    # =====================================================
    # PESTAÑA 1: Precio sucio / limpio (Modulo 1)
    # =====================================================
    tabPanel("Precio sucio / limpio",

      sidebarLayout(

        sidebarPanel(
          h4("Datos del bono"),

          dateInput("fecha_emision", "Fecha de emision:",
                    value = "2025-03-15"),

          dateInput("fecha_vencimiento", "Fecha de vencimiento:",
                    value = "2028-03-15"),

          numericInput("tasa_cupon", "Tasa cupon anual (%):",
                       value = 8, min = 0, max = 100, step = 0.1),

          selectInput("periodo_cupon", "Periodicidad del cupon:",
                      choices = list("Anual" = 1, "Semestral" = 2,
                                     "Trimestral" = 4, "Mensual" = 12),
                      selected = 4),

          numericInput("valor_nominal", "Valor nominal:",
                       value = 100, min = 0, step = 1),

          hr(),
          h4("Condiciones de mercado"),

          radioButtons("tes_metodo", "Valorar con:",
                       choices = list("Tasa de mercado (TIR)" = "tir",
                                      "Curva cero cupon (CC) + spread" = "curva"),
                       selected = "tir"),
          conditionalPanel("input.tes_metodo == 'tir'",
            numericInput("tasa_mercado", "Tasa de mercado anual (%):",
                         value = 10, min = 0, max = 100, step = 0.1)
          ),
          conditionalPanel("input.tes_metodo == 'curva'",
            p(em("Excel con la curva cero cupon: columna 1 = plazo en años (o fecha), columna 2 = tasa EA. Cada flujo se descuenta con la tasa de la curva en su plazo (interpolacion lineal) + el spread.")),
            fileInput("tes_curva_cc", NULL, accept = ".xlsx", buttonLabel = "Cargar curva CC...", placeholder = "(sin curva)"),
            numericInput("tes_spread_pb", "Spread sobre la curva CC (pb):", value = 0, step = 1)
          ),

          dateInput("fecha_negociacion", "Fecha de negociacion:",
                    value = "2026-08-01"),

          hr(),
          h4("Riesgo"),
          numericInput("tes_nominal_pesos", "Valor nominal transado (pesos, para el DV01):",
                       value = 10000000000, min = 0, step = 1000000),
          numericInput("tes_cambio_pb", "Cambio de la tasa para el resumen de precios (pb):",
                       value = 100, min = 1, step = 25),
          fluidRow(
            column(6, numericInput("tes_rango_pb", "Tabla: hasta +/- (pb)", value = 400, min = 1, step = 50)),
            column(6, numericInput("tes_paso_pb", "Tabla: de a (pb)", value = 100, min = 1, step = 10))
          ),

          hr(),
          actionButton("calcular", "Calcular", class = "btn-primary", width = "100%")
        ),

        mainPanel(

          h4("Resultados"),

          fluidRow(
            column(4,
              wellPanel(strong("Precio Sucio"), h3(textOutput("precio_sucio_out")))
            ),
            column(4,
              wellPanel(strong("Precio Limpio"), h3(textOutput("precio_limpio_out")))
            ),
            column(4,
              wellPanel(strong("Clasificacion"), h3(textOutput("clasificacion_out")))
            )
          ),

          p(strong("Interes corrido: "), textOutput("interes_corrido_out", inline = TRUE)),
          uiOutput("tes_tir_curva"),

          hr(),
          h4("Detalle de flujos de caja futuros"),
          tableOutput("tabla_flujos"),

          hr(),
          h4("Riesgo: duracion, convexidad y DV01"),
          fluidRow(
            column(3, wellPanel(strong("Duracion de Macaulay (años)"), h3(textOutput("tes_mac")))),
            column(3, wellPanel(strong("Duracion modificada"), h3(textOutput("tes_dmod")))),
            column(3, wellPanel(strong("Convexidad"), h3(textOutput("tes_conv")))),
            column(3, wellPanel(strong("DV01 de la posicion (pesos)"), h3(textOutput("tes_dv01_pesos")),
                                p("Por 100 de nominal: ", strong(textOutput("tes_dv01", inline = TRUE))),
                                p(em(textOutput("tes_dv01_formula", inline = TRUE)))))
          ),
          uiOutput("tes_riesgo_texto"),
          h4("Sensibilidad del precio y del DV01 a la tasa"),
          p(em("Precio exacto: revaloracion con la nueva tasa (con curva CC se desplaza toda la curva). Cambio de valor de la posicion: (precio del escenario - precio actual) x nominal. DV01 de la posicion: recalculado con la tasa de cada escenario.")),
          tableOutput("tes_sensibilidad"),
          h4("Calculo de la duracion y la convexidad"),
          tableOutput("tes_tabla_duracion")
        )
      )
    ),

    # =====================================================
    # PESTAÑA 2: Rentabilidad de una operacion (compra-venta)
    # =====================================================
    tabPanel("Rentabilidad de operacion",

      sidebarLayout(

        sidebarPanel(
          h4("Datos del bono"),

          dateInput("op_fecha_emision", "Fecha de emision:",
                    value = "2024-12-12"),

          dateInput("op_fecha_vencimiento", "Fecha de vencimiento:",
                    value = "2027-12-12"),

          numericInput("op_tasa_cupon", "Tasa cupon anual (%):",
                       value = 10.08, min = 0, max = 100, step = 0.01),

          selectInput("op_periodo_cupon", "Periodicidad del cupon:",
                      choices = list("Anual" = 1, "Semestral" = 2,
                                     "Trimestral" = 4, "Mensual" = 12),
                      selected = 4),

          numericInput("op_valor_nominal", "Valor nominal del bono (base de calculo, usualmente 100):",
                       value = 100, min = 0, step = 1),

          numericInput("op_monto_pesos", "Monto nominal transado (en pesos, opcional):",
                       value = 100, min = 0, step = 1000000),
          p(em("Si lo dejas igual al 'Valor nominal del bono' (100), los resultados se ven en porcentaje. Si ingresas el monto real en pesos, la app calcula el giro y el PyG en pesos.")),

          hr(),
          h4("Condiciones de compra"),

          dateInput("op_fecha_compra", "Fecha de compra:",
                    value = "2025-01-23"),

          radioButtons("op_modo_compra", "Como quieres ingresar el precio de compra:",
                       choices = list("Fecha + tasa de mercado" = "tasa",
                                      "Precio directo (sucio)" = "precio")),

          conditionalPanel(
            condition = "input.op_modo_compra == 'tasa'",
            numericInput("op_tasa_compra", "Tasa de mercado en la compra (%):",
                        value = 8, step = 0.01)
          ),
          conditionalPanel(
            condition = "input.op_modo_compra == 'precio'",
            numericInput("op_precio_compra_directo", "Precio sucio de compra:",
                        value = 106.107388, step = 0.0001)
          ),

          hr(),
          h4("Condiciones de venta"),

          dateInput("op_fecha_venta", "Fecha de venta:",
                    value = "2025-06-01"),

          radioButtons("op_modo_venta", "Como quieres ingresar el precio de venta:",
                       choices = list("Fecha + tasa de mercado" = "tasa",
                                      "Precio directo (sucio)" = "precio")),

          conditionalPanel(
            condition = "input.op_modo_venta == 'tasa'",
            numericInput("op_tasa_venta", "Tasa de mercado en la venta (%):",
                        value = 7, step = 0.01)
          ),
          conditionalPanel(
            condition = "input.op_modo_venta == 'precio'",
            numericInput("op_precio_venta_directo", "Precio sucio de venta:",
                        value = 108.837249, step = 0.0001)
          ),

          hr(),
          actionButton("calcular_operacion", "Calcular rentabilidad", class = "btn-primary", width = "100%")
        ),

        mainPanel(

          h4("Resultado"),

          wellPanel(
            strong("Rentabilidad efectiva anual de la operacion"),
            h2(textOutput("tir_operacion_out"))
          ),

          fluidRow(
            column(6,
              wellPanel(
                strong("Compra"),
                p("Precio sucio: ", strong(textOutput("precio_compra_out", inline = TRUE))),
                p("Precio limpio: ", strong(textOutput("precio_limpio_compra_out", inline = TRUE)))
              )
            ),
            column(6,
              wellPanel(
                strong("Venta"),
                p("Precio sucio: ", strong(textOutput("precio_venta_out", inline = TRUE))),
                p("Precio limpio: ", strong(textOutput("precio_limpio_venta_out", inline = TRUE)))
              )
            )
          ),

          hr(),
          h4("Valor de la operacion en pesos"),
          p(em("Los precios se truncan a 3 decimales antes de escalar a pesos (convencion del mercado TES) cuando se calculan a partir de una tasa. Si ingresaste el precio directo, se usa tal cual.")),
          fluidRow(
            column(6,
              wellPanel(strong("Giro de compra"), h4(textOutput("giro_compra_out")))
            ),
            column(6,
              wellPanel(strong("Giro de venta"), h4(textOutput("giro_venta_out")))
            )
          ),
          wellPanel(
            strong("PyG de la operacion (en pesos)"),
            h2(textOutput("pyg_pesos_out"))
          ),

          hr(),
          h4("Cupones recibidos durante la operacion"),
          p(em("Si esta tabla aparece vacia, el bono no pago ningun cupon entre la compra y la venta.")),
          tableOutput("tabla_cupones_operacion"),

          hr(),
          h4("Flujos completos de la operacion (usados para calcular la TIR)"),
          tableOutput("tabla_flujos_operacion")
        )
      )
    ),

    # =====================================================
    # PESTAÑA 3: Bono indexado a IPC
    # =====================================================
    tabPanel("Bono IPC",

      sidebarLayout(

        sidebarPanel(
          h4("Datos del bono"),

          dateInput("ipc_fecha_emision", "Fecha de emision:",
                    value = "2024-08-22"),

          dateInput("ipc_fecha_vencimiento", "Fecha de vencimiento:",
                    value = "2029-08-22"),

          numericInput("ipc_spread", "Spread EA sobre el IPC (%):",
                       value = 3, min = 0, max = 100, step = 0.01),

          selectInput("ipc_periodo_cupon", "Periodicidad del cupon:",
                      choices = list("Anual" = 1, "Semestral" = 2,
                                     "Trimestral" = 4, "Mensual" = 12),
                      selected = 1),

          radioButtons("ipc_modo", "IPC que se aplica al primer cupon:",
                       choices = list("IPC del inicio (IPC previo)" = "inicio",
                                      "IPC del final" = "final"),
                       selected = "inicio"),

          hr(),
          h4("Condiciones de mercado"),

          dateInput("ipc_fecha_negociacion", "Fecha de negociacion:",
                    value = "2026-03-13"),

          numericInput("ipc_tasa_mercado", "Tasa de mercado (%):",
                       value = 12, step = 0.01),

          radioButtons("ipc_tipo_tasa", "La tasa de mercado es:",
                       choices = list("Tasa total efectiva anual" = "total",
                                      "Spread EA sobre el IPC vigente" = "spread_ipc"),
                       selected = "total"),

          hr(),
          h4("Valor nominal"),

          numericInput("ipc_valor_nominal", "Valor nominal del bono (base de calculo, usualmente 100):",
                       value = 100, min = 0, step = 1),

          numericInput("ipc_monto_pesos", "Valor nominal transado (en pesos):",
                       value = 1000000000, min = 0, step = 1000000),

          hr(),
          h4("Riesgo"),
          numericInput("ipc_cambio_pb", "Cambio de la tasa para el resumen de precios (pb):",
                       value = 100, min = 1, step = 25),
          fluidRow(
            column(6, numericInput("ipc_rango_pb", "Tabla: hasta +/- (pb)", value = 400, min = 1, step = 50)),
            column(6, numericInput("ipc_paso_pb", "Tabla: de a (pb)", value = 100, min = 1, step = 10))
          ),

          hr(),
          h4("Base de datos de IPC"),
          p(em("Por defecto se usa el archivo 'Inflacion_y_meta.xlsx' ubicado en la carpeta de la app. Puedes cargar uno mas reciente aqui:")),
          fileInput("ipc_archivo", NULL, accept = ".xlsx",
                    buttonLabel = "Cargar archivo...", placeholder = "(opcional)"),
          textOutput("ipc_estado"),

          hr(),
          actionButton("calcular_ipc", "Calcular", class = "btn-primary", width = "100%")
        ),

        mainPanel(

          h4("Resultados"),

          fluidRow(
            column(4,
              wellPanel(strong("Precio Sucio"), h3(textOutput("ipc_precio_sucio_out")))
            ),
            column(4,
              wellPanel(strong("Precio Limpio"), h3(textOutput("ipc_precio_limpio_out")))
            ),
            column(4,
              wellPanel(strong("Clasificacion"), h3(textOutput("ipc_clasificacion_out")))
            )
          ),

          p(strong("Interes corrido: "), textOutput("ipc_interes_corrido_out", inline = TRUE)),
          p(strong("Tasa de descuento aplicada (EA): "), textOutput("ipc_tasa_descuento_out", inline = TRUE)),
          uiOutput("ipc_notas"),

          wellPanel(
            strong("Valor de giro (en pesos)"),
            h2(textOutput("ipc_valor_giro_out")),
            p(em("Se calcula con el precio sucio truncado a 3 decimales (base 100) y luego escalado al valor nominal transado."),
              " Precio sucio truncado: ", textOutput("ipc_precio_trunc_out", inline = TRUE))
          ),

          hr(),
          h4("Detalle de flujos de caja futuros"),
          tableOutput("ipc_tabla_flujos"),

          hr(),
          h4("Riesgo: duracion, convexidad y DV01"),
          fluidRow(
            column(3, wellPanel(strong("Duracion de Macaulay (años)"), h3(textOutput("ipc_mac")))),
            column(3, wellPanel(strong("Duracion modificada"), h3(textOutput("ipc_dmod")))),
            column(3, wellPanel(strong("Convexidad"), h3(textOutput("ipc_conv")))),
            column(3, wellPanel(strong("DV01 de la posicion (pesos)"), h3(textOutput("ipc_dv01_pesos")),
                                p("Por 100 de nominal: ", strong(textOutput("ipc_dv01", inline = TRUE))),
                                p(em(textOutput("ipc_dv01_formula", inline = TRUE)))))
          ),
          uiOutput("ipc_riesgo_texto"),
          h4("Sensibilidad del precio y del DV01 a la tasa"),
          p(em("Se mueve la tasa de descuento EA (IPC + spread de mercado) con los cupones proyectados fijos. Precio exacto: revaloracion con la nueva tasa. DV01 de cada fila: recalculado con la tasa de ese escenario.")),
          tableOutput("ipc_sensibilidad"),
          h4("Calculo de la duracion y la convexidad"),
          tableOutput("ipc_tabla_duracion")
        )
      )
    ),

    # =====================================================
    # PESTAÑA: Bono UVR (tasa fija real, flujos en UVR)
    # =====================================================
    tabPanel("Bono UVR",

      sidebarLayout(

        sidebarPanel(
          h4("Datos del bono (en UVR)"),

          dateInput("uvr_fecha_emision", "Fecha de emision:", value = "2024-04-18"),
          dateInput("uvr_fecha_vencimiento", "Fecha de vencimiento:", value = "2029-04-18"),

          numericInput("uvr_tasa_cupon", "Tasa cupon real EA (%):",
                       value = 2.25, min = 0, max = 100, step = 0.01),

          selectInput("uvr_periodo_cupon", "Periodicidad del cupon:",
                      choices = list("Anual" = 1, "Semestral" = 2,
                                     "Trimestral" = 4, "Mensual" = 12),
                      selected = 1),

          hr(),
          h4("Condiciones de mercado"),

          dateInput("uvr_fecha_negociacion", "Fecha de negociacion (valoracion):", value = "2025-02-03"),
          numericInput("uvr_tasa_mercado", "Tasa de mercado real EA (%):",
                       value = 5.11, step = 0.01),

          hr(),
          h4("Valor nominal"),

          numericInput("uvr_valor_nominal", "Valor nominal del bono (base de calculo, usualmente 100):",
                       value = 100, min = 0, step = 1),
          radioButtons("uvr_nominal_en", "El valor nominal transado se ingresa en:",
                       choices = list("UVR" = "uvr", "Pesos" = "pesos"),
                       selected = "uvr", inline = TRUE),
          numericInput("uvr_nominal_transado", "Valor nominal transado:",
                       value = 10000000, min = 0, step = 1000),

          hr(),
          h4("Riesgo"),
          numericInput("uvr_cambio_pb", "Cambio de la tasa para el resumen de precios (pb):",
                       value = 100, min = 1, step = 25),
          fluidRow(
            column(6, numericInput("uvr_rango_pb", "Tabla: hasta +/- (pb)", value = 400, min = 1, step = 50)),
            column(6, numericInput("uvr_paso_pb", "Tabla: de a (pb)", value = 100, min = 1, step = 10))
          ),

          hr(),
          h4("Base de datos de UVR"),
          p(em("Por defecto se usa el archivo 'UVR_...xlsx' ubicado en la carpeta de la app. Puedes cargar uno mas reciente aqui:")),
          fileInput("uvr_archivo", NULL, accept = ".xlsx",
                    buttonLabel = "Cargar archivo...", placeholder = "(opcional)"),
          textOutput("uvr_estado"),

          hr(),
          actionButton("calcular_uvr", "Calcular", class = "btn-primary", width = "100%")
        ),

        mainPanel(

          h4("Datos en UVR"),

          fluidRow(
            column(4, wellPanel(strong("Precio Sucio"), h3(textOutput("uvr_precio_sucio_out")))),
            column(4, wellPanel(strong("Precio Limpio"), h3(textOutput("uvr_precio_limpio_out")))),
            column(4, wellPanel(strong("Clasificacion"), h3(textOutput("uvr_clasificacion_out"))))
          ),

          p(strong("Cupon corrido: "), textOutput("uvr_interes_corrido_out", inline = TRUE)),
          p(strong("Valor nominal (UVR): "), textOutput("uvr_nominal_uvr_out", inline = TRUE)),

          hr(),
          h4("Datos en pesos"),
          p(strong("Valor UVR en fecha de valoracion: "), textOutput("uvr_valor_uvr_out", inline = TRUE)),
          p(strong("Valor nominal (pesos): "), textOutput("uvr_nominal_pesos_out", inline = TRUE)),

          fluidRow(
            column(4, wellPanel(strong("Valor UVR en la fecha de valoracion"), h3(textOutput("uvr_valor_uvr_caja")))),
            column(4, wellPanel(strong("Valor de giro (en UVR)"), h3(textOutput("uvr_valor_giro_uvr_out")))),
            column(4, wellPanel(strong("Valor de giro (en pesos)"), h3(textOutput("uvr_valor_giro_out"))))
          ),
          p(em("Valor de giro en UVR = precio sucio truncado a 3 decimales (base 100) x nominal en UVR. En pesos = giro en UVR x UVR de la fecha de valoracion, truncado a pesos enteros."),
            " Precio sucio truncado: ", textOutput("uvr_precio_trunc_out", inline = TRUE)),

          hr(),
          h4("Detalle de flujos de caja futuros (en UVR)"),
          tableOutput("uvr_tabla_flujos"),

          hr(),
          h4("Riesgo: duracion, convexidad y DV01"),
          fluidRow(
            column(3, wellPanel(strong("Duracion de Macaulay (años)"), h3(textOutput("uvr_mac")))),
            column(3, wellPanel(strong("Duracion modificada"), h3(textOutput("uvr_dmod")))),
            column(3, wellPanel(strong("Convexidad"), h3(textOutput("uvr_conv")))),
            column(3, wellPanel(strong("DV01 por 100 de nominal"), h3(textOutput("uvr_dv01"))))
          ),
          fluidRow(
            column(6, wellPanel(strong("DV01 de la posicion (en UVR)"), h3(textOutput("uvr_dv01_uvr")))),
            column(6, wellPanel(strong("DV01 de la posicion (en pesos)"), h3(textOutput("uvr_dv01_pesos")),
                                p(em(textOutput("uvr_dv01_formula", inline = TRUE)))))
          ),
          uiOutput("uvr_riesgo_texto"),
          h4("Sensibilidad del precio y del DV01 a la tasa real"),
          p(em("Precio exacto: revaloracion con la nueva tasa real. Cambio de valor y DV01 de la posicion en UVR y en pesos (con la UVR de la fecha de valoracion). DV01 de cada fila: recalculado con la tasa de ese escenario.")),
          tableOutput("uvr_sensibilidad"),
          h4("Calculo de la duracion y la convexidad"),
          tableOutput("uvr_tabla_duracion")
        )
      )
    ),

    # =====================================================
    # PESTAÑAS: Rentabilidad de operaciones con bono IPC
    # (usan la base de IPC cargada en la pestaña "Bono IPC")
    # =====================================================
    tabPanel("Rentabilidad IPC (estimada)", rentIpcUI("rent_est", tipo = "estimada")),
    tabPanel("Rentabilidad IPC (real)", rentIpcUI("rent_real", tipo = "real")),

    # PESTAÑAS: Rentabilidad de operaciones con bono UVR
    # (usan la base de UVR de la pestaña "Bono UVR"; la estimada tambien la base de IPC)
    tabPanel("Rentabilidad UVR (estimada)", rentUvrUI("rentuvr_est", tipo = "estimada")),
    tabPanel("Rentabilidad UVR (real)", rentUvrUI("rentuvr_real", tipo = "real")),

    # =====================================================
    # PESTAÑAS: Bono IBR (datos, rentabilidad proyectada y real)
    # =====================================================
    tabPanel("Datos IBR",
      fluidRow(column(8,
        h4("Base de IBR publicada (Banco de la Republica)"),
        p(em("Por defecto se usa el archivo 'Tasas...xlsx' ubicado en la carpeta de la app. Puedes cargar uno mas reciente aqui:")),
        fileInput("ibr_archivo", NULL, accept = ".xlsx", buttonLabel = "Cargar archivo...", placeholder = "(opcional)"),
        textOutput("ibr_estado"),
        hr(),
        h4("Curva FR, tasa nominal anual (la entrega el profesor)"),
        p(em("Por defecto se usa un archivo 'Curva...xlsx' o 'FR...xlsx' ubicado en la carpeta de la app (columnas Fecha y Tasa). Puedes cargarlo aqui:")),
        fileInput("fra_archivo", NULL, accept = ".xlsx", buttonLabel = "Cargar curva...", placeholder = "(opcional)"),
        textOutput("fra_estado")
      ))
    ),
    tabPanel("Rentabilidad IBR (proyectada)", rentIbrUI("rentibr_est", tipo = "estimada")),
    tabPanel("Rentabilidad IBR (real)", rentIbrUI("rentibr_real", tipo = "real"))
  )
)

# =============================================================
# SERVER: la logica de calculo
# =============================================================
server <- function(input, output, session) {

  # ---------- Logica de la pestaña "Precio sucio / limpio" ----------

  resultado <- eventReactive(input$calcular, {

    validate(
      need(input$fecha_vencimiento > input$fecha_emision,
           "La fecha de vencimiento debe ser posterior a la fecha de emision."),
      need(input$fecha_negociacion >= input$fecha_emision &&
           input$fecha_negociacion < input$fecha_vencimiento,
           "La fecha de negociacion debe estar entre la emision y el vencimiento.")
    )

    metodo <- if (is.null(input$tes_metodo)) "tir" else input$tes_metodo
    r <- precio_bono_fechas(
      fecha_emision = input$fecha_emision,
      fecha_vencimiento = input$fecha_vencimiento,
      tasa_cupon_anual = input$tasa_cupon / 100,
      periodo_cupon = as.numeric(input$periodo_cupon),
      tasa_mercado_anual = if (metodo == "tir") input$tasa_mercado / 100 else 0.10,
      fecha_negociacion = input$fecha_negociacion,
      valor_nominal = input$valor_nominal
    )
    if (metodo == "curva") {
      validate(need(!is.null(input$tes_curva_cc), "Carga el Excel de la curva cero cupon."),
               need(!is.na(input$tes_spread_pb), "Completa el spread sobre la curva (pb)."))
      curva <- tryCatch(cargar_curva_cc(input$tes_curva_cc$datapath),
                        error = function(e) validate(paste("No se pudo leer la curva CC:", conditionMessage(e))))
      r <- valorar_tes_con_curva(r, curva, input$tes_spread_pb, input$fecha_negociacion, input$valor_nominal)
      r$metodo <- "curva"
    } else {
      r$metodo <- "tir"
      r$tir_equivalente <- input$tasa_mercado / 100
    }
    r
  })

  output$precio_sucio_out <- renderText({ sprintf("%.6f", resultado()$precio_sucio) })
  output$precio_limpio_out <- renderText({ sprintf("%.6f", resultado()$precio_limpio) })
  output$clasificacion_out <- renderText({ resultado()$clasificacion })
  output$interes_corrido_out <- renderText({ sprintf("%.6f", resultado()$interes_corrido) })

  # ---------- Riesgo (duracion, convexidad, DV01) de la pestaña TES ----------
  riesgo_tes <- eventReactive(input$calcular, {
    r <- resultado()
    nom <- if (is.na(input$tes_nominal_pesos)) NA_real_ else input$tes_nominal_pesos
    cpb <- if (is.na(input$tes_cambio_pb) || input$tes_cambio_pb <= 0) 100 else input$tes_cambio_pb
    rango <- if (is.null(input$tes_rango_pb) || is.na(input$tes_rango_pb) || input$tes_rango_pb <= 0) 400 else input$tes_rango_pb
    paso <- if (is.null(input$tes_paso_pb) || is.na(input$tes_paso_pb) || input$tes_paso_pb <= 0) 100 else input$tes_paso_pb
    pasos <- unique(sort(c(seq(-rango, rango, by = min(paso, rango)), 0)))
    medidas_riesgo(r$flujos, r$t_anios, r$tir_equivalente, as.numeric(input$periodo_cupon),
                   precio_actual = r$precio_sucio_truncado,
                   factor_pesos = nom / input$valor_nominal, cambio_pb = cpb,
                   pasos_pb = pasos, tasas_flujo = r$tasas_flujo)
  })
  output$tes_tir_curva <- renderUI({
    r <- resultado()
    if (!identical(r$metodo, "curva")) return(NULL)
    p(strong("TIR equivalente (curva CC + spread): "), sprintf("%.4f%% EA", r$tir_equivalente * 100),
      sprintf(" | spread %g pb | tasas de descuento de %.4f%% a %.4f%%.", r$spread_pb, min(r$tasas_flujo) * 100, max(r$tasas_flujo) * 100))
  })
  output$tes_mac <- renderText(sprintf("%.6f", riesgo_tes()$duracion_macaulay))
  output$tes_dmod <- renderText(sprintf("%.6f", riesgo_tes()$duracion_modificada))
  output$tes_conv <- renderText(sprintf("%.6f", riesgo_tes()$convexidad))
  output$tes_dv01 <- renderText(sprintf("%.6f", riesgo_tes()$dv01))
  output$tes_dv01_formula <- renderText({
    m <- riesgo_tes()
    sprintf("= D* %.3f / 10.000 x giro $ %s", m$duracion_modificada_trunc,
            formatC(m$dv01_pesos / (m$duracion_modificada_trunc / 1e4), format = "f", digits = 0, big.mark = ","))
  })
  output$tes_dv01_pesos <- renderText({
    v <- riesgo_tes()$dv01_pesos
    if (is.na(v)) "N/A" else paste0("$ ", formatC(v, format = "f", digits = 0, big.mark = ","))
  })
  output$tes_riesgo_texto <- renderUI({
    m <- riesgo_tes()
    pb <- m$cambio_pb
    fmt <- function(x) formatC(x, format = "f", digits = 2, big.mark = ",")
    tagList(
      p(strong("DV01 de la posicion: "), sprintf("$ %s", fmt(m$dv01_pesos)),
        sprintf(" (si la tasa sube 1 pb, el valor de la posicion cae aproximadamente esa cantidad; precio actual %.3f).", m$precio_actual)),
      p(sprintf("Si la tasa sube %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$sube$exacto, m$sube$duracion, m$sube$dur_conv, m$sube$dur_conv - m$precio_actual)),
      p(sprintf("Si la tasa baja %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$baja$exacto, m$baja$duracion, m$baja$dur_conv, m$baja$dur_conv - m$precio_actual))
    )
  })
  output$tes_sensibilidad <- renderTable({
    s <- riesgo_tes()$sensibilidad
    fmtp <- function(x) ifelse(is.na(x), "", formatC(x, format = "f", digits = 0, big.mark = ","))
    data.frame(Cambio_pb = sprintf("%+g", s$Cambio_pb), Tasa_EA = sprintf("%.2f%%", s$Tasa_ea * 100),
               Precio_exacto = sprintf("%.4f", s$Precio_exacto),
               Cambio_valor_posicion = fmtp(s$Cambio_valor_pesos),
               DV01_posicion = fmtp(s$DV01_pesos),
               check.names = FALSE)
  }, align = "r")
  output$tes_tabla_duracion <- renderTable({
    r <- resultado(); t <- riesgo_tes()$tabla_flujos
    data.frame(Fecha = format(r$fechas_flujos_futuros), t_anios = sprintf("%.6f", t$t),
               Flujo = sprintf("%.6f", t$Flujo), VP = sprintf("%.6f", t$VP),
               t_x_VP = sprintf("%.6f", t$t_VP), t2_mas_t_x_VP = sprintf("%.6f", t$t2t_VP))
  }, align = "r")

  output$tabla_flujos <- renderTable({
    r <- resultado()
    data.frame(
      Fecha = format(r$fechas_flujos_futuros),
      Dias_cupon = as.integer(r$dias_periodo),
      Dias_hasta_flujo = as.integer(r$dias_hasta_flujo),
      Flujo = sprintf("%.6f", r$flujos),
      Tasa_descuento = if (identical(r$metodo, "curva")) sprintf("%.4f%%", r$tasas_flujo * 100) else sprintf("%.4f%%", r$tir_equivalente * 100),
      Valor_presente = sprintf("%.3f", truncar(r$valores_presentes, 3))
    )
  }, align = "r")

  # ---------- Logica de la pestaña "Rentabilidad de operacion" ----------

  resultado_operacion <- eventReactive(input$calcular_operacion, {

    validate(
      need(input$op_fecha_vencimiento > input$op_fecha_emision,
           "La fecha de vencimiento debe ser posterior a la fecha de emision."),
      need(input$op_fecha_venta >= input$op_fecha_compra,
           "La fecha de venta no puede ser anterior a la fecha de compra."),
      need(input$op_fecha_compra >= input$op_fecha_emision &&
           input$op_fecha_venta <= input$op_fecha_vencimiento,
           "La compra y la venta deben estar dentro de la vida del bono (entre emision y vencimiento).")
    )

    # --- Precio de compra: calculado con tasa (se trunca a 3 decimales,
    #     convencion del mercado TES), o ingresado directo (no se toca) ---
    if (input$op_modo_compra == "tasa") {
      res_compra <- precio_bono_fechas(
        fecha_emision = input$op_fecha_emision,
        fecha_vencimiento = input$op_fecha_vencimiento,
        tasa_cupon_anual = input$op_tasa_cupon / 100,
        periodo_cupon = as.numeric(input$op_periodo_cupon),
        tasa_mercado_anual = input$op_tasa_compra / 100,
        fecha_negociacion = input$op_fecha_compra,
        valor_nominal = input$op_valor_nominal
      )
      precio_compra <- truncar(res_compra$precio_sucio, 3)
      precio_limpio_compra <- precio_compra - res_compra$interes_corrido
    } else {
      precio_compra <- input$op_precio_compra_directo
      tabla_bono <- construir_tabla_flujos(
        input$op_fecha_emision, input$op_fecha_vencimiento,
        as.numeric(input$op_periodo_cupon), input$op_tasa_cupon / 100,
        input$op_valor_nominal
      )
      ic_compra <- calcular_interes_corrido(tabla_bono, input$op_fecha_compra)
      precio_limpio_compra <- precio_compra - ic_compra$interes_corrido
    }

    # --- Precio de venta: calculado con tasa (truncado), o ingresado directo ---
    if (input$op_modo_venta == "tasa") {
      res_venta <- precio_bono_fechas(
        fecha_emision = input$op_fecha_emision,
        fecha_vencimiento = input$op_fecha_vencimiento,
        tasa_cupon_anual = input$op_tasa_cupon / 100,
        periodo_cupon = as.numeric(input$op_periodo_cupon),
        tasa_mercado_anual = input$op_tasa_venta / 100,
        fecha_negociacion = input$op_fecha_venta,
        valor_nominal = input$op_valor_nominal
      )
      precio_venta <- truncar(res_venta$precio_sucio, 3)
      precio_limpio_venta <- precio_venta - res_venta$interes_corrido
    } else {
      precio_venta <- input$op_precio_venta_directo
      tabla_bono <- construir_tabla_flujos(
        input$op_fecha_emision, input$op_fecha_vencimiento,
        as.numeric(input$op_periodo_cupon), input$op_tasa_cupon / 100,
        input$op_valor_nominal
      )
      ic_venta <- calcular_interes_corrido(tabla_bono, input$op_fecha_venta)
      precio_limpio_venta <- precio_venta - ic_venta$interes_corrido
    }

    resultado <- rentabilidad_operacion(
      fecha_emision = input$op_fecha_emision,
      fecha_vencimiento = input$op_fecha_vencimiento,
      periodo_cupon = as.numeric(input$op_periodo_cupon),
      tasa_cupon_anual = input$op_tasa_cupon / 100,
      valor_nominal = input$op_valor_nominal,
      fecha_compra = input$op_fecha_compra,
      precio_compra = precio_compra,
      fecha_venta = input$op_fecha_venta,
      precio_venta = precio_venta
    )

    # Si la compra y la venta son el mismo dia, la TIR (tasa ANUALIZADA)
    # no esta matematicamente definida (no hay tiempo transcurrido para
    # anualizar) - en ese caso mostramos TIR como NA, pero el giro y el
    # PyG en pesos SI se calculan igual, porque no dependen de la TIR.
    tir_valor <- if (resultado$error) NA else resultado$tir

    # --- Escalado a pesos: la TIR no cambia con la escala (es la misma
    #     tasa en % o en pesos), pero el giro y el PyG si dependen de ella ---
    factor_escala <- input$op_monto_pesos / input$op_valor_nominal

    giro_compra <- precio_compra * factor_escala
    giro_venta <- precio_venta * factor_escala
    cupones_pesos <- resultado$cupones_recibidos$monto * factor_escala
    pyg_pesos <- giro_venta + sum(cupones_pesos) - giro_compra

    list(precio_compra = precio_compra, precio_venta = precio_venta,
         precio_limpio_compra = precio_limpio_compra, precio_limpio_venta = precio_limpio_venta,
         cupones_recibidos = resultado$cupones_recibidos,
         flujos_operacion = resultado$flujos_operacion,
         tir = tir_valor,
         giro_compra = giro_compra, giro_venta = giro_venta,
         cupones_pesos = cupones_pesos, pyg_pesos = pyg_pesos)
  })

  output$precio_compra_out <- renderText({ sprintf("%.6f", resultado_operacion()$precio_compra) })
  output$precio_venta_out <- renderText({ sprintf("%.6f", resultado_operacion()$precio_venta) })
  output$precio_limpio_compra_out <- renderText({ sprintf("%.6f", resultado_operacion()$precio_limpio_compra) })
  output$precio_limpio_venta_out <- renderText({ sprintf("%.6f", resultado_operacion()$precio_limpio_venta) })

  output$tir_operacion_out <- renderText({
    tir <- resultado_operacion()$tir
    if (is.na(tir)) "N/A (operacion intradia, sin tiempo transcurrido para anualizar)"
    else paste0(sprintf("%.4f", tir * 100), "%")
  })

  output$giro_compra_out <- renderText({ sprintf("%.2f", resultado_operacion()$giro_compra) })
  output$giro_venta_out <- renderText({ sprintf("%.2f", resultado_operacion()$giro_venta) })
  output$pyg_pesos_out <- renderText({ sprintf("%.2f", resultado_operacion()$pyg_pesos) })

  output$tabla_cupones_operacion <- renderTable({
    r <- resultado_operacion()
    cup <- r$cupones_recibidos
    if (nrow(cup) == 0) return(data.frame(Mensaje = "No se recibieron cupones en esta operacion"))
    data.frame(
      Fecha = format(cup$fecha_flujo),
      Monto_porcentual = sprintf("%.6f", cup$monto),
      Monto_pesos = sprintf("%.2f", r$cupones_pesos)
    )
  }, align = "r")

  output$tabla_flujos_operacion <- renderTable({
    f <- resultado_operacion()$flujos_operacion
    data.frame(
      Fecha = format(f$fecha),
      Dias_desde_compra = as.integer(f$dias_desde_compra),
      Monto = sprintf("%.6f", f$monto)
    )
  }, align = "r")

  # ---------- Logica de la pestaña "Bono IPC" ----------

  # Base de IPC: archivo cargado por el usuario, o el de la carpeta de la app
  ipc_datos <- reactive({
    ruta <- if (!is.null(input$ipc_archivo)) input$ipc_archivo$datapath else encontrar_archivo_ipc(".")
    validate(need(!is.na(ruta),
                  "No se encontro el archivo de IPC. Pon 'Inflacion_y_meta.xlsx' en la carpeta de la app o cargalo con el boton."))
    tryCatch(cargar_ipc(ruta),
             error = function(e) validate(paste("No se pudo leer el archivo de IPC:", conditionMessage(e))))
  })

  output$ipc_estado <- renderText({
    d <- ipc_datos()
    sprintf("IPC cargado: %d meses, del %s al %s (ultimo valor: %.2f%%)",
            nrow(d), format(min(d$fecha)), format(max(d$fecha)), d$inflacion[which.max(d$fecha)])
  })

  # ---------- Logica de las pestañas IBR ----------

  # Base de IBR y curva FR: archivo cargado o el de la carpeta de la app.
  # Si no hay archivo devuelven NULL (cada pestaña avisa lo que le falta).
  ibr_datos <- reactive({
    ruta <- if (!is.null(input$ibr_archivo)) input$ibr_archivo$datapath else encontrar_archivo_ibr(".")
    if (is.na(ruta)) return(NULL)
    tryCatch(cargar_ibr(ruta),
             error = function(e) validate(paste("No se pudo leer el archivo de IBR:", conditionMessage(e))))
  })
  fra_datos <- reactive({
    ruta <- if (!is.null(input$fra_archivo)) input$fra_archivo$datapath else encontrar_archivo_fra(".")
    if (is.na(ruta)) return(NULL)
    tryCatch(cargar_curva_fra(ruta),
             error = function(e) validate(paste("No se pudo leer la curva FR:", conditionMessage(e))))
  })

  output$ibr_estado <- renderText({
    d <- ibr_datos()
    if (is.null(d)) return("Sin base de IBR cargada.")
    sprintf("IBR cargado: %d dias habiles, del %s al %s (ultimo IBR a 1 mes: %.3f%%)",
            nrow(d), format(min(d$fecha)), format(max(d$fecha)), d$m1[which.max(d$fecha)])
  })
  output$fra_estado <- renderText({
    d <- fra_datos()
    if (is.null(d)) return("Sin curva FR cargada.")
    sprintf("Curva FR cargada: %d dias, del %s al %s (primera tasa: %.3f%%)",
            nrow(d), format(min(d$fecha)), format(max(d$fecha)), d$tasa[1] * 100)
  })

  rentIbrServer("rentibr_est", ibr_datos, fra_datos, tipo = "estimada")
  rentIbrServer("rentibr_real", ibr_datos, fra_datos, tipo = "real")

  # ---------- Logica de la pestaña "Bono UVR" ----------

  uvr_datos <- reactive({
    ruta <- if (!is.null(input$uvr_archivo)) input$uvr_archivo$datapath else encontrar_archivo_uvr(".")
    validate(need(!is.na(ruta),
                  "No se encontro el archivo de UVR. Pon 'UVR_...xlsx' en la carpeta de la app o cargalo con el boton."))
    tryCatch(cargar_uvr(ruta),
             error = function(e) validate(paste("No se pudo leer el archivo de UVR:", conditionMessage(e))))
  })

  output$uvr_estado <- renderText({
    d <- uvr_datos()
    sprintf("UVR cargada: %d dias, del %s al %s (ultimo valor: %.4f)",
            nrow(d), format(min(d$fecha)), format(max(d$fecha)), d$valor[which.max(d$fecha)])
  })

  # Rentabilidad de operaciones con bono UVR (estimada y real)
  rentUvrServer("rentuvr_est", uvr_datos, ipc_datos, tipo = "estimada")
  rentUvrServer("rentuvr_real", uvr_datos, ipc_datos, tipo = "real")

  resultado_uvr <- eventReactive(input$calcular_uvr, {

    validate(
      need(input$uvr_fecha_vencimiento > input$uvr_fecha_emision,
           "La fecha de vencimiento debe ser posterior a la fecha de emision."),
      need(input$uvr_fecha_negociacion >= input$uvr_fecha_emision &&
           input$uvr_fecha_negociacion < input$uvr_fecha_vencimiento,
           "La fecha de negociacion debe estar entre la emision y el vencimiento."),
      need(!is.na(input$uvr_tasa_cupon) && !is.na(input$uvr_tasa_mercado),
           "Completa la tasa cupon y la tasa de mercado."),
      need(!is.na(input$uvr_valor_nominal) && input$uvr_valor_nominal > 0 &&
           !is.na(input$uvr_nominal_transado) && input$uvr_nominal_transado > 0,
           "El valor nominal y el valor nominal transado deben ser mayores a cero.")
    )

    tryCatch(
      valorar_bono_uvr(
        fecha_emision = input$uvr_fecha_emision,
        fecha_vencimiento = input$uvr_fecha_vencimiento,
        periodo_cupon = as.numeric(input$uvr_periodo_cupon),
        tasa_cupon_real = input$uvr_tasa_cupon / 100,
        tasa_mercado_real = input$uvr_tasa_mercado / 100,
        fecha_negociacion = input$uvr_fecha_negociacion,
        uvr_df = uvr_datos(),
        nominal_transado = input$uvr_nominal_transado,
        nominal_en = input$uvr_nominal_en,
        valor_nominal = input$uvr_valor_nominal
      ),
      error = function(e) validate(conditionMessage(e))
    )
  })

  output$uvr_precio_sucio_out <- renderText({ sprintf("%.6f", resultado_uvr()$precio_sucio) })
  output$uvr_precio_limpio_out <- renderText({ sprintf("%.6f", resultado_uvr()$precio_limpio) })
  output$uvr_clasificacion_out <- renderText({ resultado_uvr()$clasificacion })
  output$uvr_interes_corrido_out <- renderText({ sprintf("%.6f", resultado_uvr()$interes_corrido) })
  output$uvr_nominal_uvr_out <- renderText({ formatC(resultado_uvr()$nominal_uvr, format = "f", digits = 4, big.mark = ",") })
  output$uvr_valor_uvr_out <- renderText({ sprintf("%.4f", resultado_uvr()$uvr_negociacion) })
  output$uvr_nominal_pesos_out <- renderText({ formatC(resultado_uvr()$nominal_pesos, format = "f", digits = 2, big.mark = ",") })
  output$uvr_valor_giro_out <- renderText({ formatC(resultado_uvr()$valor_giro, format = "f", digits = 2, big.mark = ",") })
  output$uvr_precio_trunc_out <- renderText({ sprintf("%.3f", resultado_uvr()$precio_sucio_truncado) })

  output$uvr_valor_uvr_caja <- renderText({ sprintf("%.4f", resultado_uvr()$uvr_negociacion) })
  output$uvr_valor_giro_uvr_out <- renderText({ formatC(resultado_uvr()$valor_giro_uvr, format = "f", digits = 4, big.mark = ",") })

  # ---------- Riesgo (duracion, convexidad, DV01) del bono UVR ----------
  # Todo en terminos reales (UVR): flujos en UVR descontados a la tasa real.
  # DV01 = D* truncada a 3 decimales / 10.000 x valor de giro (en UVR y en pesos).
  riesgo_uvr <- eventReactive(input$calcular_uvr, {
    r <- resultado_uvr()
    cpb <- if (is.na(input$uvr_cambio_pb) || input$uvr_cambio_pb <= 0) 100 else input$uvr_cambio_pb
    rango <- if (is.null(input$uvr_rango_pb) || is.na(input$uvr_rango_pb) || input$uvr_rango_pb <= 0) 400 else input$uvr_rango_pb
    paso <- if (is.null(input$uvr_paso_pb) || is.na(input$uvr_paso_pb) || input$uvr_paso_pb <= 0) 100 else input$uvr_paso_pb
    pasos <- unique(sort(c(seq(-rango, rango, by = min(paso, rango)), 0)))
    m <- medidas_riesgo(r$flujos, r$t_anios, input$uvr_tasa_mercado / 100, as.numeric(input$uvr_periodo_cupon),
                        precio_actual = r$precio_sucio_truncado,
                        factor_pesos = r$nominal_uvr / input$uvr_valor_nominal,   # aqui: unidades de UVR
                        cambio_pb = cpb, pasos_pb = pasos)
    m$uvr <- r$uvr_negociacion
    m$dv01_uvr <- m$dv01_pesos
    # En pesos: D* truncada a 3 decimales / 10.000 x valor de giro en pesos
    m$dv01_en_pesos <- m$duracion_modificada_trunc / 1e4 * r$valor_giro
    m
  })
  fmt0 <- function(x) ifelse(is.na(x), "", formatC(x, format = "f", digits = 0, big.mark = ","))
  fmt2 <- function(x) ifelse(is.na(x), "", formatC(x, format = "f", digits = 2, big.mark = ","))
  output$uvr_mac <- renderText(sprintf("%.6f", riesgo_uvr()$duracion_macaulay))
  output$uvr_dmod <- renderText(sprintf("%.6f", riesgo_uvr()$duracion_modificada))
  output$uvr_conv <- renderText(sprintf("%.6f", riesgo_uvr()$convexidad))
  output$uvr_dv01 <- renderText(sprintf("%.6f", riesgo_uvr()$dv01))
  output$uvr_dv01_uvr <- renderText(paste(fmt2(riesgo_uvr()$dv01_uvr), "UVR"))
  output$uvr_dv01_pesos <- renderText(paste0("$ ", fmt0(riesgo_uvr()$dv01_en_pesos)))
  output$uvr_dv01_formula <- renderText({
    m <- riesgo_uvr(); r <- resultado_uvr()
    sprintf("= D* %.3f / 10.000 x giro $ %s (en UVR: x giro %s UVR)", m$duracion_modificada_trunc,
            fmt0(r$valor_giro), fmt2(r$valor_giro_uvr))
  })
  output$uvr_riesgo_texto <- renderUI({
    m <- riesgo_uvr(); pb <- m$cambio_pb
    tagList(
      p(sprintf("Si la tasa real sube %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$sube$exacto, m$sube$duracion, m$sube$dur_conv, m$sube$dur_conv - m$precio_actual)),
      p(sprintf("Si la tasa real baja %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$baja$exacto, m$baja$duracion, m$baja$dur_conv, m$baja$dur_conv - m$precio_actual))
    )
  })
  output$uvr_sensibilidad <- renderTable({
    m <- riesgo_uvr(); s <- m$sensibilidad
    data.frame(Cambio_pb = sprintf("%+g", s$Cambio_pb), Tasa_real_EA = sprintf("%.2f%%", s$Tasa_ea * 100),
               Precio_exacto = sprintf("%.4f", s$Precio_exacto),
               Cambio_valor_UVR = fmt2(s$Cambio_valor_pesos),
               Cambio_valor_pesos = fmt0(s$Cambio_valor_pesos * m$uvr),
               DV01_UVR = fmt2(s$DV01_pesos),
               DV01_pesos = fmt0(s$DV01_pesos * m$uvr),
               check.names = FALSE)
  }, align = "r")
  output$uvr_tabla_duracion <- renderTable({
    r <- resultado_uvr(); t <- riesgo_uvr()$tabla_flujos
    data.frame(Fecha = format(r$fechas_flujos_futuros), t_anios = sprintf("%.6f", t$t),
               Flujo = sprintf("%.6f", t$Flujo), VP = sprintf("%.6f", t$VP),
               t_x_VP = sprintf("%.6f", t$t_VP), t2_mas_t_x_VP = sprintf("%.6f", t$t2t_VP))
  }, align = "r")

  output$uvr_tabla_flujos <- renderTable({
    r <- resultado_uvr()
    data.frame(
      Fecha = format(r$fechas_flujos_futuros),
      Dias_cupon = as.integer(r$dias_periodo),
      Dias_hasta_flujo = as.integer(r$dias_hasta_flujo),
      Flujo = sprintf("%.6f", r$flujos),
      Valor_presente = sprintf("%.3f", truncar(r$valores_presentes, 3))
    )
  }, align = "r")

  # Rentabilidad de operaciones con bono IPC (estimada y real)
  rentIpcServer("rent_est", ipc_datos, tipo = "estimada")
  rentIpcServer("rent_real", ipc_datos, tipo = "real")

  resultado_ipc <- eventReactive(input$calcular_ipc, {

    validate(
      need(input$ipc_fecha_vencimiento > input$ipc_fecha_emision,
           "La fecha de vencimiento debe ser posterior a la fecha de emision."),
      need(input$ipc_fecha_negociacion >= input$ipc_fecha_emision &&
           input$ipc_fecha_negociacion < input$ipc_fecha_vencimiento,
           "La fecha de negociacion debe estar entre la emision y el vencimiento."),
      need(!is.na(input$ipc_spread) && !is.na(input$ipc_tasa_mercado),
           "Completa el spread y la tasa de mercado."),
      need(!is.na(input$ipc_valor_nominal) && input$ipc_valor_nominal > 0 &&
           !is.na(input$ipc_monto_pesos) && input$ipc_monto_pesos > 0,
           "El valor nominal y el valor nominal transado deben ser mayores a cero.")
    )

    ipc_df <- ipc_datos()

    res <- tryCatch(
      precio_bono_ipc(
        fecha_emision = input$ipc_fecha_emision,
        fecha_vencimiento = input$ipc_fecha_vencimiento,
        periodo_cupon = as.numeric(input$ipc_periodo_cupon),
        spread_ea = input$ipc_spread / 100,
        modo_ipc = input$ipc_modo,
        tasa_mercado_anual = input$ipc_tasa_mercado / 100,
        fecha_negociacion = input$ipc_fecha_negociacion,
        ipc_df = ipc_df,
        tipo_tasa_mercado = input$ipc_tipo_tasa,
        valor_nominal = input$ipc_valor_nominal,
        monto_nominal_pesos = input$ipc_monto_pesos
      ),
      error = function(e) validate(conditionMessage(e))
    )

    # Fecha de referencia del IPC del primer cupon (para avisar si no esta publicado aun)
    futuros <- res$tabla_completa[res$tabla_completa$fecha_flujo > input$ipc_fecha_negociacion, ]
    fecha_ref_primer <- if (input$ipc_modo == "inicio") futuros$inicio_periodo[1] else futuros$fecha_flujo[1]

    res$fecha_ref_primer <- fecha_ref_primer
    res$ultima_fecha_ipc <- max(ipc_df$fecha)
    res
  })

  output$ipc_precio_sucio_out <- renderText({ sprintf("%.6f", resultado_ipc()$precio_sucio) })
  output$ipc_precio_limpio_out <- renderText({ sprintf("%.6f", resultado_ipc()$precio_limpio) })
  output$ipc_clasificacion_out <- renderText({ resultado_ipc()$clasificacion })
  # ---------- Riesgo (duracion, convexidad, DV01) del bono IPC ----------
  # Cupones proyectados del motor (IPC vigente constante) descontados a la tasa EA total.
  riesgo_ipc <- eventReactive(input$calcular_ipc, {
    r <- resultado_ipc()
    cpb <- if (is.na(input$ipc_cambio_pb) || input$ipc_cambio_pb <= 0) 100 else input$ipc_cambio_pb
    rango <- if (is.null(input$ipc_rango_pb) || is.na(input$ipc_rango_pb) || input$ipc_rango_pb <= 0) 400 else input$ipc_rango_pb
    paso <- if (is.null(input$ipc_paso_pb) || is.na(input$ipc_paso_pb) || input$ipc_paso_pb <= 0) 100 else input$ipc_paso_pb
    pasos <- unique(sort(c(seq(-rango, rango, by = min(paso, rango)), 0)))
    medidas_riesgo(r$flujos, r$t_anios, r$tasa_descuento, as.numeric(input$ipc_periodo_cupon),
                   precio_actual = r$precio_sucio_truncado,
                   factor_pesos = input$ipc_monto_pesos / input$ipc_valor_nominal,
                   cambio_pb = cpb, pasos_pb = pasos)
  })
  output$ipc_mac <- renderText(sprintf("%.6f", riesgo_ipc()$duracion_macaulay))
  output$ipc_dmod <- renderText(sprintf("%.6f", riesgo_ipc()$duracion_modificada))
  output$ipc_conv <- renderText(sprintf("%.6f", riesgo_ipc()$convexidad))
  output$ipc_dv01 <- renderText(sprintf("%.6f", riesgo_ipc()$dv01))
  output$ipc_dv01_formula <- renderText({
    m <- riesgo_ipc()
    sprintf("= D* %.3f / 10.000 x giro $ %s", m$duracion_modificada_trunc,
            formatC(m$dv01_pesos / (m$duracion_modificada_trunc / 1e4), format = "f", digits = 0, big.mark = ","))
  })
  output$ipc_dv01_pesos <- renderText(paste0("$ ", formatC(riesgo_ipc()$dv01_pesos, format = "f", digits = 0, big.mark = ",")))
  output$ipc_riesgo_texto <- renderUI({
    m <- riesgo_ipc(); pb <- m$cambio_pb
    tagList(
      p(sprintf("Si la tasa sube %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$sube$exacto, m$sube$duracion, m$sube$dur_conv, m$sube$dur_conv - m$precio_actual)),
      p(sprintf("Si la tasa baja %g pb: precio exacto %.6f | con duracion %.6f | con duracion + convexidad %.6f (variacion %+.3f).",
                pb, m$baja$exacto, m$baja$duracion, m$baja$dur_conv, m$baja$dur_conv - m$precio_actual))
    )
  })
  output$ipc_sensibilidad <- renderTable({
    s <- riesgo_ipc()$sensibilidad
    f0 <- function(x) ifelse(is.na(x), "", formatC(x, format = "f", digits = 0, big.mark = ","))
    data.frame(Cambio_pb = sprintf("%+g", s$Cambio_pb), Tasa_EA = sprintf("%.2f%%", s$Tasa_ea * 100),
               Precio_exacto = sprintf("%.4f", s$Precio_exacto),
               Cambio_valor_posicion = f0(s$Cambio_valor_pesos), DV01_posicion = f0(s$DV01_pesos),
               check.names = FALSE)
  }, align = "r")
  output$ipc_tabla_duracion <- renderTable({
    r <- resultado_ipc(); t <- riesgo_ipc()$tabla_flujos
    data.frame(Fecha = format(r$fechas_flujos_futuros), t_anios = sprintf("%.6f", t$t),
               Flujo = sprintf("%.6f", t$Flujo), VP = sprintf("%.6f", t$VP),
               t_x_VP = sprintf("%.6f", t$t_VP), t2_mas_t_x_VP = sprintf("%.6f", t$t2t_VP))
  }, align = "r")

  output$ipc_interes_corrido_out <- renderText({ sprintf("%.6f", resultado_ipc()$interes_corrido) })
  output$ipc_tasa_descuento_out <- renderText({ sprintf("%.6f%%", resultado_ipc()$tasa_descuento * 100) })
  output$ipc_valor_giro_out <- renderText({ sprintf("%.2f", resultado_ipc()$valor_giro) })
  output$ipc_precio_trunc_out <- renderText({ sprintf("%.3f", resultado_ipc()$precio_sucio_truncado) })

  # Avisos cuando la fecha de referencia es posterior al ultimo IPC publicado
  output$ipc_notas <- renderUI({
    r <- resultado_ipc()
    notas <- character(0)
    if (r$fecha_ref_primer > input$ipc_fecha_negociacion) {
      notas <- c(notas, sprintf(
        "IPC del final: el IPC de la fecha %s (fin del periodo del primer cupon) aun no se conoce en la fecha de negociacion; se uso el IPC vigente en la negociacion (dato del %s).",
        format(r$fecha_ref_primer), format(r$fecha_ipc_usado[1])))
    }
    if (input$ipc_fecha_negociacion > r$ultima_fecha_ipc) {
      notas <- c(notas, sprintf(
        "La fecha de negociacion es posterior al ultimo IPC de la base (%s); los cupones siguientes usan ese ultimo valor.",
        format(r$ultima_fecha_ipc)))
    }
    if (length(notas) == 0) return(NULL)
    div(class = "alert alert-warning", lapply(notas, function(n) p(n)))
  })

  output$ipc_tabla_flujos <- renderTable({
    r <- resultado_ipc()
    data.frame(
      Fecha = format(r$fechas_flujos_futuros),
      Dias_cupon = as.integer(r$dias_periodo),
      Dias_hasta_flujo = as.integer(r$dias_hasta_flujo),
      Flujo = sprintf("%.6f", r$flujos),
      Valor_presente = sprintf("%.3f", truncar(r$valores_presentes, 3)),
      IPC_usado = sprintf("%.2f%%", r$ipc_usado * 100),
      Fecha_IPC = format(r$fecha_ipc_usado),
      Tasa_cupon_EA = sprintf("%.4f%%", r$tasa_cupon_ea * 100)
    )
  }, align = "r")
}

shinyApp(ui = ui, server = server)

