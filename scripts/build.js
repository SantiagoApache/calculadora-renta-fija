// Empaqueta la calculadora en un solo HTML (index.html) con los datos incluidos.
// También deja dist/pagina.html (versión para el enlace de Claude, sin <html>/<head>).
const fs = require("fs"), path = require("path");
const RAIZ = path.join(__dirname, "..");
const R = p => fs.readFileSync(path.join(RAIZ, p), "utf8");
const datos = JSON.parse(R("data/datos.json"));
datos.pronostico = JSON.parse(R("data/pronostico.json"));
datos.curvaCC = JSON.parse(R("data/curva_cc.json"));
const mercado = JSON.parse(R("data/mercado.json"));
const js = s => s.replace(/<\/script/gi, "<\\/script");
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");
const cabeza = '<title>Calculadora de Renta Fija</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' +
  '<meta name="description" content="Calculadora de bonos de Tasa Fija (TES), UVR, IPC e IBR: valoración, rentabilidad, duración, convexidad, DV01 y sendas de TIR.">\n' +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">\n' +
  "<style>\n" + R("src/app.css") + "\n</style>\n";
const cuerpo = R("src/plantilla.html") +
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>\n' +
  "<script>window.DATOS=" + json(datos) + ";\nwindow.MERCADO=" + json(mercado) + ";</script>\n" +
  "<script>\n" + js(R("src/motor.js")) + "\n</script>\n<script>\n" + js(R("src/app.js")) + "\n</script>\n";
fs.mkdirSync(path.join(RAIZ, "dist"), { recursive: true });
fs.writeFileSync(path.join(RAIZ, "dist/pagina.html"), cabeza + cuerpo);
fs.writeFileSync(path.join(RAIZ, "index.html"),
  '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + cabeza + "</head>\n<body>\n" + cuerpo + "</body>\n</html>\n");
console.log("index.html listo:", (fs.statSync(path.join(RAIZ, "index.html")).size / 1024).toFixed(0), "KB");
