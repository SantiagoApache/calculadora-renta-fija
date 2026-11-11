# Calculadora de Renta Fija

Calculadora de bonos para el curso de Renta Fija (Universidad Icesi). Tiene cuatro calculadoras:

- **Tasa Fija (TES):** valoración con TIR o con curva cero cupón + spread, y rentabilidad de compra y venta.
- **UVR:** precio, valor de giro en pesos y en UVR, y TIR en pesos y en UVR (estimada o real).
- **IPC:** bonos IPC + spread, valoración y rentabilidad estimada o real (con pronóstico opcional).
- **IBR:** bonos IBR + spread, rentabilidad proyectada o real, venta antes del vencimiento y sendas de TIR.

Cada una incluye duración de Macaulay, duración modificada, convexidad, DV01 y una tabla de sensibilidad de −400 a +400 pb.

**Página publicada:** https://santiagoapache.github.io/calculadora-renta-fija/

## Cómo se actualizan los datos

Un proceso automático de GitHub Actions corre todos los días a las 6:37 a. m. y 6:37 p. m. (hora de Bogotá):

| Dato | Fuente | Automático |
|---|---|---|
| IBR (overnight, 1, 3, 6 y 12 meses) | Banco de la República (servicio SDMX y portal SUAMECA) | Sí |
| UVR diaria | Banco de la República (servicio SDMX) | Sí |
| TRM y tasa de política monetaria | Banco de la República (servicio SDMX) | Sí |
| Tasa de la Fed, inflación y desempleo de EE. UU. | FRED (Fed de San Luis) | Sí |
| Noticias de Colombia y del mundo | Google Noticias (solo titular y enlace) | Sí |
| IPC (inflación total anual) | Banco de la República (portal SUAMECA, serie «Inflación y meta») | Sí |
| Desempleo de Colombia | Página oficial del DANE (empleo y desempleo) | Sí |
| Curvas FR, curva CC y pronóstico de IPC | Archivos del curso | No: se suben en el botón «Datos» |

Reglas del proceso:

- Solo **agrega** datos nuevos; nunca borra.
- Antes de agregar, compara lo que publica el Banco con lo que ya había. Si no coinciden, no toca esa serie.
- Si una fuente falla, se conservan los últimos datos buenos.
- Antes de publicar, corre las 27 pruebas contra la versión en R. Si alguna falla, no publica y la página sigue como estaba.

Para correrlo a mano: pestaña **Actions** → «Actualizar datos y publicar» → **Run workflow**.

## Carpetas

- `index.html`: la calculadora completa en un solo archivo, con los datos incluidos. Se puede abrir con doble clic, sin internet.
- `src/`: código fuente (`motor.js` con los cálculos, `app.js` con la interfaz, `app.css` con el diseño, `plantilla.html` con la estructura).
- `data/`: series de IPC, UVR, IBR, curvas FR, pronóstico, curva CC, indicadores y noticias.
- `scripts/build.js`: arma `index.html` a partir de `src/` y `data/`.
- `scripts/actualizar.js`: el proceso automático de datos.
- `test/`: pruebas del motor contra los resultados de la versión en R.
- `r-shiny/`: la versión original en R/Shiny, como respaldo.

Para reconstruir la página localmente: `node scripts/build.js` y luego `node test/probar.js`.
