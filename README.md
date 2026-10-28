# Taller

Suite de apps creativas que funcionan en el navegador. Gratis, sin marca de agua, sin cuenta y sin subir tus archivos a ningún servidor: todo se procesa en tu computadora.

| App | Para qué sirve | Carpeta |
|---|---|---|
| **Corte** | Editor de video multipista | [`corte/`](corte/) |
| **Lienzo** | Editor de fotos con capas | [`lienzo/`](lienzo/) |
| **Trazo** | Editor vectorial | [`trazo/`](trazo/) |
| **Folio** | Herramientas PDF | [`folio/`](folio/) |

La página de inicio (`index.html`) muestra todas las apps.

## Corte · video
Multipista ilimitada, transiciones, animaciones, fotogramas clave, filtros, efectos, stickers, pantalla verde, quitar fondo con IA, subtítulos automáticos con Whisper, grabar voz/pantalla/cámara, música y efectos de sonido libres, exportación MP4/WebM hasta 1440p a 60 fps.

## Lienzo · fotos
- Capas con opacidad, 16 modos de fusión, bloqueo, reordenar arrastrando, combinar y acoplar
- Pincel con dureza y presión, borrador, tampón de clonar, bote de pintura, degradado, formas, texto editable
- Selección rectangular, elíptica, lazo y varita mágica (sumar, restar, invertir)
- Transformar libremente (escalar y rotar), recortar con proporciones, rotar y voltear
- Ajustes: brillo y contraste, tono y saturación, temperatura, niveles, intensidad, posterizar, umbral, mejora automática
- Filtros: desenfocar, enfocar, ruido, pixelar, viñeta, relieve, bordes y 12 filtros rápidos
- **Quitar fondo y seleccionar sujeto con IA**
- Exporta PNG, JPG y WebP; guarda proyectos `.lienzo`

## Trazo · vectores
- Pluma Bézier, lápiz, rectángulo, elipse, polígono, estrella, línea y texto
- Edición de nodos, curvas y esquinas
- Unir, restar, intersección, excluir y dividir formas
- Alinear, distribuir, agrupar, ordenar, voltear e imán con guías
- Rellenos sólidos y degradados, bordes con guiones, sombras y modos de fusión
- Importa SVG e imágenes; exporta SVG, PNG, JPG y PDF vectorial

## Folio · PDF
- Unir PDF e imágenes, reordenar arrastrando, rotar, duplicar, eliminar e insertar páginas en blanco
- Firmar (dibujada, escrita o desde una imagen), agregar texto, imágenes, rectángulos, resaltar y tapar
- Marca de agua, numeración de páginas y metadatos
- Comprimir, PDF a imágenes, dividir y extraer páginas, imágenes a PDF

## Uso

Es un sitio estático. Publicalo en Vercel (ya incluye `vercel.json`), Netlify o GitHub Pages, o servilo localmente con `npx serve`. Las librerías y los modelos de IA se cargan desde CDN la primera vez y después quedan en caché.

Librerías de código abierto usadas: paper.js, pdf-lib, pdf.js, JSZip, jsPDF, svg2pdf.js, Transformers.js (Whisper), MediaPipe e @imgly/background-removal.
