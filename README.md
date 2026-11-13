# Calculadora de Renta Fija

Calculadora de bonos colombianos de renta fija. Tiene cuatro calculadoras y un portafolio:

- **Tasa Fija (TES):** valoración con TIR o con curva cero cupón + spread, y rentabilidad de compra y venta.
- **UVR:** precio, valor de giro en pesos y en UVR, y TIR en pesos y en UVR (estimada o real).
- **IPC:** bonos IPC + spread, valoración y rentabilidad estimada o real (con pronóstico opcional).
- **IBR:** bonos IBR + spread, rentabilidad proyectada o real, venta antes del vencimiento y sendas de TIR.
- **Portafolio:** las compras guardadas desde las calculadoras, con valor total, TIR, duración, DV01, próximos cupones y carry neto (con o sin fondos prestados).

Cada calculadora muestra el próximo cupón y organiza el detalle en pestañas:

1. **Flujos:** la tabla de flujos, descargable en CSV.
2. **Gráficos:** precio frente a tasa o flujos de la operación, la curva de los TES y, en IBR, las curvas FR.
3. **Escenarios:** gráfico interactivo con el precio del bono si la tasa de mercado se mueve de 25 en 25 pb hasta ±400 pb y se vende a los 30, 60, 90, 180 o 365 días. Al pasar el cursor muestra precio sucio y TIR; al hacer clic abre el detalle con el P&G.
4. **Riesgo:** duración de Macaulay, duración modificada, convexidad y DV01.

**Página publicada:** https://santiagoapache.github.io/calculadora-renta-fija/

## Cómo se actualizan los datos

Un proceso automático de GitHub Actions corre todos los días a las 6:37 a. m. y 6:37 p. m. (hora de Bogotá):

| Dato | Fuente | Automático |
|---|---|---|
| IPC (inflación total anual) | Banco de la República (portal SUAMECA, serie «Inflación y meta») | Sí |
| IBR (overnight, 1, 3, 6 y 12 meses) | Banco de la República (servicio SDMX y portal SUAMECA) | Sí |
| UVR diaria | Banco de la República (servicio SDMX) | Sí |
| TRM y tasa de política monetaria | Banco de la República (servicio SDMX) | Sí |
| Deuda pública local: tasas cero cupón de los TES en pesos y UVR (1, 5 y 10 años) y bid-ask spread | Banco de la República (portal SUAMECA, sección «Deuda pública») | Sí |
| Dólar spot (USD/COP) | Yahoo Finance; respaldo: ExchangeRate-API | Sí |
| Tasa de la Fed, inflación y desempleo de EE. UU. | FRED (Fed de San Luis) | Sí |
| Desempleo de Colombia | Página oficial del DANE (empleo y desempleo) | Sí |
| Noticias de Colombia y del mundo | Google Noticias (solo titular y enlace) | Sí |
| Curvas FR, curva cero cupón y pronóstico de IPC | Archivos de ejemplo incluidos | No: se suben en el botón «Datos» |

Reglas del proceso:

- Solo **agrega** datos nuevos; nunca borra.
- Antes de agregar, compara lo que publica el Banco con lo que ya había. Si no coinciden, no toca esa serie.
- Si una fuente falla, se conservan los últimos datos buenos.
- Antes de publicar, corre 27 casos de prueba contra una versión independiente en R. Si alguno falla, no publica y la página sigue como estaba.

Para correrlo a mano: pestaña **Actions** → «Actualizar datos y publicar» → **Run workflow**.

## Carpetas

- `index.html`: la calculadora completa en un solo archivo, con los datos incluidos. Se puede abrir con doble clic, sin internet.
- `src/`: código fuente (`motor.js` con los cálculos, `app.js` con la interfaz, `app.css` con el diseño, `plantilla.html` con la estructura).
- `data/`: series de IPC, UVR, IBR, curvas FR, pronóstico, curva cero cupón, indicadores, deuda pública y noticias.
- `scripts/build.js`: arma `index.html` a partir de `src/` y `data/`.
- `scripts/actualizar.js`: el proceso automático de datos.
- `test/`: pruebas del motor contra los resultados de la versión en R.
- `r-shiny/`: la versión original en R/Shiny, como respaldo.

Para reconstruir la página localmente: `node scripts/build.js` y luego `node test/probar.js`.
