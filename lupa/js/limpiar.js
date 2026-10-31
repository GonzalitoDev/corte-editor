/* Lupa · limpieza de metadatos: devuelve una copia del archivo sin autores, rutas, impresoras ni GPS.
 * JPEG y PNG se limpian sin perder calidad (se sacan los bloques de metadatos). Office, OpenDocument y PDF se reescriben.
 */
(function () {
  'use strict';
  const L = globalThis.Lupa = globalThis.Lupa || {};

  // JPEG: saca APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) y comentarios; deja la imagen intacta
  function jpeg(b) {
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    const out = [b.subarray(0, 2)]; let i = 2, quitados = 0;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) break;
      const m = b[i + 1];
      if (m === 0xda) { out.push(b.subarray(i)); i = b.length; break; } // empieza la imagen: el resto se copia tal cual
      const len = (b[i + 2] << 8) | b[i + 3];
      const seg = b.subarray(i, i + 2 + len);
      if (m === 0xe1 || m === 0xed || m === 0xfe || (m >= 0xe3 && m <= 0xef && m !== 0xee)) quitados++; else out.push(seg);
      i += 2 + len;
    }
    if (i < b.length) out.push(b.subarray(i));
    return { bytes: unir(out), cambios: quitados ? [`Se quitaron ${quitados} bloques de metadatos (EXIF, GPS, XMP, IPTC).`] : ['No tenía metadatos para quitar.'] };
  }
  // PNG: saca textos (tEXt, iTXt, zTXt), EXIF (eXIf) y fecha (tIME)
  function png(b) {
    if (b[0] !== 0x89 || b[1] !== 0x50) return null;
    const out = [b.subarray(0, 8)]; let i = 8, quitados = 0;
    while (i + 12 <= b.length) {
      const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
      const tipo = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
      const total = 12 + len;
      if (['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(tipo)) quitados++; else out.push(b.subarray(i, i + total));
      i += total; if (tipo === 'IEND') break;
    }
    return { bytes: unir(out), cambios: quitados ? [`Se quitaron ${quitados} bloques de texto y metadatos.`] : ['No tenía metadatos para quitar.'] };
  }
  function unir(partes) { const n = partes.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of partes) { o.set(p, k); k += p.length; } return o; }

  // otras imágenes (WebP, HEIC…): se vuelven a dibujar en el navegador
  async function redibujar(b, nombre) {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    const ext = nombre.split('.').pop().toLowerCase(), tipo = ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const bmp = await createImageBitmap(new Blob([b]), { imageOrientation: 'from-image' });
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, tipo, 0.93));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), cambios: ['La imagen se volvió a guardar sin metadatos.'], ext: tipo === 'image/webp' ? 'webp' : 'jpg' };
  }

  const ANON = 'Autor';
  async function ooxml(b) {
    const zip = await globalThis.JSZip.loadAsync(b); const cambios = [];
    const reemplazar = async (ruta, fn) => { const f = zip.file(ruta); if (!f) return; const x = await f.async('string'); const y = fn(x); if (y !== x) { zip.file(ruta, y); return true; } };
    if (await reemplazar('docProps/core.xml', x => x
      .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator></dc:creator>')
      .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>')
      .replace(/<cp:lastPrinted>[\s\S]*?<\/cp:lastPrinted>/, '')
      .replace(/<cp:revision>[\s\S]*?<\/cp:revision>/, '<cp:revision>1</cp:revision>'))) cambios.push('Autor y última edición borrados.');
    if (await reemplazar('docProps/app.xml', x => x
      .replace(/<Company>[\s\S]*?<\/Company>/, '<Company></Company>').replace(/<Manager>[\s\S]*?<\/Manager>/, '<Manager></Manager>')
      .replace(/<Template>[\s\S]*?<\/Template>/, '<Template></Template>').replace(/<TotalTime>[\s\S]*?<\/TotalTime>/, '<TotalTime>0</TotalTime>'))) cambios.push('Empresa, responsable, plantilla y tiempo de edición borrados.');
    if (zip.file('docProps/custom.xml')) { zip.file('docProps/custom.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>'); cambios.push('Propiedades personalizadas borradas.'); }
    let autores = 0;
    for (const n of Object.keys(zip.files)) {
      if (!/\.xml$/i.test(n) || zip.files[n].dir) continue;
      if (/^word\/(document|comments|commentsExtended|people|footnotes|endnotes|header\d*|footer\d*)\.xml$|^ppt\/(commentAuthors|comments\/.*)\.xml$|^xl\/comments\d*\.xml$/.test(n)) {
        await reemplazar(n, x => x.replace(/(w(?:15)?:author=")[^"]*(")/g, (m, a, c) => { autores++; return a + ANON + c; })
          .replace(/(w:initials=")[^"]*(")/g, '$1A$2').replace(/(<p:cmAuthor[^>]*name=")[^"]*(")/g, (m, a, c) => { autores++; return a + ANON + c; })
          .replace(/(<p:cmAuthor[^>]*initials=")[^"]*(")/g, '$1A$2').replace(/(<author>)[^<]*(<\/author>)/g, (m, a, c) => { autores++; return a + ANON + c; })
          .replace(/(w15:userId=")[^"]*(")/g, '$1$2').replace(/(<w15:presenceInfo[^>]*\/>)/g, ''));
      }
    }
    if (autores) cambios.push(`Se anonimizaron ${autores} autores de comentarios y cambios.`);
    for (const n of Object.keys(zip.files).filter(n => /printerSettings\d*\.bin$/i.test(n))) { const d = await zip.file(n).async('uint8array'); d.fill(0, 0, Math.min(64, d.length)); zip.file(n, d); cambios.push('Nombre de impresora borrado.'); }
    let fotos = 0;
    for (const n of Object.keys(zip.files).filter(n => /media\/[^/]+\.(jpe?g|png)$/i.test(n))) {
      const d = await zip.file(n).async('uint8array'); const r = /png$/i.test(n) ? png(d) : jpeg(d);
      if (r && r.bytes.length !== d.length) { zip.file(n, r.bytes); fotos++; }
    }
    if (fotos) cambios.push(`Se limpiaron ${fotos} imágenes de adentro del documento.`);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { bytes, cambios: cambios.length ? cambios : ['No había metadatos para borrar.'] };
  }

  async function odf(b) {
    const zip = await globalThis.JSZip.loadAsync(b); const cambios = [];
    const mime = zip.file('mimetype') ? await zip.file('mimetype').async('string') : null;
    const m = zip.file('meta.xml');
    if (m) {
      const x = await m.async('string');
      const y = x.replace(/<meta:initial-creator>[\s\S]*?<\/meta:initial-creator>/, '').replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '')
        .replace(/<meta:printed-by>[\s\S]*?<\/meta:printed-by>/, '').replace(/<meta:print-date>[\s\S]*?<\/meta:print-date>/, '')
        .replace(/<meta:user-defined[\s\S]*?<\/meta:user-defined>/g, '').replace(/<meta:editing-cycles>[\s\S]*?<\/meta:editing-cycles>/, '<meta:editing-cycles>1</meta:editing-cycles>')
        .replace(/<meta:editing-duration>[\s\S]*?<\/meta:editing-duration>/, '<meta:editing-duration>PT0S</meta:editing-duration>');
      if (y !== x) { zip.file('meta.xml', y); cambios.push('Autores, impresión y propiedades personalizadas borrados.'); }
    }
    const s = zip.file('settings.xml');
    if (s) { const x = await s.async('string'); const y = x.replace(/(config:name="PrinterName"[^>]*>)[^<]*</, '$1<').replace(/(config:name="PrinterSetup"[^>]*>)[^<]*</, '$1<'); if (y !== x) { zip.file('settings.xml', y); cambios.push('Impresora borrada.'); } }
    const c = zip.file('content.xml');
    if (c) { const x = await c.async('string'); const y = x.replace(/(<dc:creator>)[^<]*(<\/dc:creator>)/g, '$1' + ANON + '$2'); if (y !== x) { zip.file('content.xml', y); cambios.push('Autores de comentarios anonimizados.'); } }
    if (mime != null) zip.file('mimetype', mime, { compression: 'STORE' });
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: mime || undefined });
    return { bytes, cambios: cambios.length ? cambios : ['No había metadatos para borrar.'] };
  }

  async function pdf(b) {
    const P = globalThis.PDFLib;
    const doc = await P.PDFDocument.load(b, { updateMetadata: false, ignoreEncryption: true });
    doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer('');
    const info = doc.getInfoDict(); for (const k of ['CreationDate', 'ModDate', 'Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer']) info.delete(P.PDFName.of(k));
    for (const k of info.keys()) info.delete(k); // propiedades propias
    doc.catalog.delete(P.PDFName.of('Metadata')); doc.catalog.delete(P.PDFName.of('PieceInfo'));
    for (const page of doc.getPages()) { page.node.delete(P.PDFName.of('Metadata')); page.node.delete(P.PDFName.of('PieceInfo')); }
    const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
    return { bytes, cambios: ['Título, autor, programas, fechas y metadatos XMP borrados.'] };
  }

  L.puedeLimpiar = tipo => ['img', 'ooxml', 'odf', 'pdf'].includes(tipo);
  L.limpiar = async function (nombre, bytes, tipo) {
    const ext = (nombre.split('.').pop() || '').toLowerCase();
    let r = null;
    if (tipo === 'img') r = /jpe?g$/.test(ext) || (bytes[0] === 0xff && bytes[1] === 0xd8) ? jpeg(bytes) : ext === 'png' ? png(bytes) : await redibujar(bytes, nombre);
    else if (tipo === 'ooxml') r = await ooxml(bytes);
    else if (tipo === 'odf') r = await odf(bytes);
    else if (tipo === 'pdf') r = await pdf(bytes);
    if (!r) return null;
    const base = nombre.replace(/\.[^.]+$/, '');
    r.nombre = base + '-limpio.' + (r.ext || ext);
    return r;
  };
})();
