/* Lupa · extracción de metadatos.
 * Lee PDF, Word/Excel/PowerPoint (nuevos y viejos), OpenDocument, imágenes (EXIF/GPS/XMP) y SVG,
 * y busca lo que se filtra sin querer: personas, usuarios del sistema, software, rutas internas,
 * servidores, impresoras, correos, IP privadas y ubicaciones.
 * Necesita (globales): JSZip, pdfjsLib, exifr, CFB. Todo corre en tu navegador: los archivos no se suben a ningún lado.
 */
(function () {
  'use strict';
  const L = globalThis.Lupa = globalThis.Lupa || {};

  const EXT = {
    pdf: 'pdf', docx: 'ooxml', docm: 'ooxml', dotx: 'ooxml', xlsx: 'ooxml', xlsm: 'ooxml', pptx: 'ooxml', ppsx: 'ooxml', pptm: 'ooxml',
    odt: 'odf', ods: 'odf', odp: 'odf', odg: 'odf', doc: 'ole', xls: 'ole', ppt: 'ole', pps: 'ole', dot: 'ole', msg: 'ole',
    jpg: 'img', jpeg: 'img', tif: 'img', tiff: 'img', png: 'img', heic: 'img', heif: 'img', webp: 'img', avif: 'img',
    svg: 'svg', xml: 'texto', txt: 'texto', csv: 'texto', rtf: 'texto', html: 'texto', htm: 'texto', json: 'texto',
  };
  L.EXT = EXT;
  L.tipoDe = nombre => EXT[(nombre.split('.').pop() || '').toLowerCase()] || 'otro';

  /* ───── buscadores de texto ───── */
  const RX = {
    correo: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,80}\.[A-Za-z]{2,12}/g,
    rutaWin: /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\x00-\x1f]{1,120}\\){1,12}[^\\/:*?"<>|\r\n\x00-\x1f]{0,120}/g,
    unc: /\\\\[A-Za-z0-9][A-Za-z0-9._$-]{0,62}\\[^\s"<>|\x00-\x1f]{1,160}/g,
    rutaWin2: /\b[A-Za-z]:\/(?:[^\/:*?"<>|\r\n\x00-\x1f]{1,120}\/){1,12}[^\/:*?"<>|\r\n\x00-\x1f\s]{0,120}/g,
    rutaUnix: /(?<![A-Za-z]:)(?:\/home|\/Users|\/media|\/mnt|\/var\/www|\/srv)\/[A-Za-z0-9._ -]{1,60}(?:\/[^\s"'<>|\x00-\x1f:;]{1,80}){0,10}/g,
    fileUrl: /file:\/\/\/?[^\s"'<>\x00-\x1f]{3,200}/g,
    ipPriv: /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    urlInterna: /https?:\/\/(?:intranet|localhost|[a-z0-9-]+\.(?:local|lan|internal|corp|intra))(?::\d+)?[^\s"'<>]{0,120}/gi,
  };
  const USUARIO_EN_RUTA = [/[A-Za-z]:\\(?:Users|Usuarios|Documents and Settings|Dokumente und Einstellungen)\\([^\\]{1,60})\\/i, /\/(?:home|Users)\/([^/]{1,60})\//];
  const SISTEMA = new Set(['public', 'default', 'all users', 'administrator', 'administrador', 'default user', 'appdata', 'shared', 'guest']);

  function limpiarTxt(v) { return String(v == null ? '' : v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\s+/g, ' ').trim(); }
  function escanear(txt, r) {
    if (!txt) return;
    if (txt.length > 6e6) txt = txt.slice(0, 6e6);
    const add = (k, v) => { v = limpiarTxt(v).replace(/[.,;)\]]+$/, ''); if (v.length > 2) r[k].add(v); };
    for (const m of txt.matchAll(RX.correo)) if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(m[0]) && !/@(?:[0-9]x|2x|3x)\./.test(m[0])) add('correos', m[0].toLowerCase());
    for (const m of txt.matchAll(RX.rutaWin)) add('rutas', m[0]);
    for (const m of txt.matchAll(RX.rutaWin2)) add('rutas', m[0].replace(/\//g, '\\'));
    for (const m of txt.matchAll(RX.unc)) { add('rutas', m[0]); const h = m[0].slice(2).split('\\')[0]; add('equipos', h); }
    for (const m of txt.matchAll(RX.rutaUnix)) add('rutas', m[0]);
    for (const m of txt.matchAll(RX.fileUrl)) add('rutas', decodeURIComponentSeguro(m[0]));
    for (const m of txt.matchAll(RX.ipPriv)) if (m[0].split('.').every(n => +n <= 255)) add('equipos', m[0]);
    for (const m of txt.matchAll(RX.urlInterna)) add('equipos', m[0]);
  }
  function decodeURIComponentSeguro(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  // texto «visible» de un binario: latin1 y UTF-16LE (los documentos viejos de Office guardan rutas así)
  function textoDeBinario(bytes, max) {
    const n = Math.min(bytes.length, max || 8e6);
    let a = '', b = '';
    const sub = bytes.subarray(0, n);
    try { a = new TextDecoder('latin1').decode(sub); } catch (e) { }
    // UTF-16LE: solo los tramos donde cada segundo byte es 0
    const partes = []; let cur = '';
    for (let i = 0; i + 1 < n; i += 2) { const lo = sub[i], hi = sub[i + 1]; if (hi === 0 && lo >= 32 && lo < 127) cur += String.fromCharCode(lo); else { if (cur.length >= 6) partes.push(cur); cur = ''; } }
    if (cur.length >= 6) partes.push(cur);
    for (let i = 1; i + 1 < n; i += 2) { const lo = sub[i], hi = sub[i + 1]; if (hi === 0 && lo >= 32 && lo < 127) cur += String.fromCharCode(lo); else { if (cur.length >= 6) partes.push(cur); cur = ''; } }
    b = partes.join('\n');
    return a + '\n' + b;
  }

  /* ───── resultado común ───── */
  function nuevo(nombre, tipo, tam) {
    return { nombre, tipo, tam, campos: [], personas: new Set(), usuarios: new Set(), software: new Set(), rutas: new Set(), correos: new Set(), equipos: new Set(), impresoras: new Set(), fechas: {}, gps: null, avisos: [], embebidos: [] };
  }
  function campo(r, k, v, cat) {
    v = v instanceof Date ? fechaTxt(v) : limpiarTxt(v); if (!v || v === '0' || v === 'null' || v === 'undefined') return;
    r.campos.push([k, v]);
    if (cat === 'persona' && !/^(usuario|user|admin|administrador|autor|author|unknown|desconocido|microsoft office user|usuario de windows|owner)$/i.test(v)) r.personas.add(v);
    if (cat === 'software') r.software.add(v);
    if (cat === 'impresora') r.impresoras.add(v);
  }
  function fechaTxt(d) { try { return d.toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return ''; } }
  function fechaPdf(s) { // D:20240131123456-03'00'
    const m = String(s || '').match(/D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/); if (!m) return s;
    return `${m[1]}-${m[2] || '01'}-${m[3] || '01'} ${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}`;
  }
  function cerrar(r) {
    // usuarios del sistema a partir de las rutas
    for (const p of r.rutas) for (const rx of USUARIO_EN_RUTA) { const m = p.match(rx); if (m && !SISTEMA.has(m[1].toLowerCase())) r.usuarios.add(m[1]); }
    const out = {};
    for (const k of ['personas', 'usuarios', 'software', 'rutas', 'correos', 'equipos', 'impresoras']) out[k] = [...r[k]].slice(0, 200);
    // riesgo: qué tan delicado es lo que se filtra
    let p = 0;
    if (r.gps) { p += 7; r.avisos.push('Tiene la ubicación GPS de donde se sacó la foto.'); }
    if (out.usuarios.length) { p += 3; r.avisos.push('Deja ver nombres de usuario de las computadoras.'); }
    if (out.rutas.length) { p += 2; r.avisos.push('Tiene rutas de carpetas internas.'); }
    if (out.equipos.length) { p += 3; r.avisos.push('Menciona servidores, IP privadas o sitios internos.'); }
    if (out.impresoras.length) { p += 2; r.avisos.push('Tiene el nombre de una impresora de la red.'); }
    if (out.correos.length) { p += 2; r.avisos.push('Tiene direcciones de correo.'); }
    if (out.personas.length) { p += 2; r.avisos.push('Tiene nombres de autores o de quien lo editó.'); }
    if (out.software.length) p += 1;
    return { nombre: r.nombre, tipo: r.tipo, tam: r.tam, campos: r.campos, ...out, fechas: r.fechas, gps: r.gps, avisos: r.avisos, embebidos: r.embebidos, riesgo: p >= 7 ? 'alto' : p >= 3 ? 'medio' : p > 0 ? 'bajo' : 'limpio', puntos: p };
  }

  /* ───── PDF ───── */
  async function pdf(bytes, r) {
    const lib = globalThis.pdfjsLib;
    try {
      const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
      const { info, metadata } = await doc.getMetadata();
      campo(r, 'Versión de PDF', info.PDFFormatVersion);
      campo(r, 'Páginas', doc.numPages);
      campo(r, 'Título', info.Title); campo(r, 'Asunto', info.Subject); campo(r, 'Palabras clave', info.Keywords);
      campo(r, 'Autor', info.Author, 'persona'); campo(r, 'Creado con', info.Creator, 'software'); campo(r, 'Convertido con', info.Producer, 'software');
      if (info.CreationDate) { const f = fechaPdf(info.CreationDate); campo(r, 'Creado', f); r.fechas.creado = f; }
      if (info.ModDate) { const f = fechaPdf(info.ModDate); campo(r, 'Modificado', f); r.fechas.modificado = f; }
      if (info.IsEncrypted || doc._pdfInfo && doc._pdfInfo.isEncrypted) campo(r, 'Cifrado', 'sí');
      if (info.Custom) for (const [k, v] of Object.entries(info.Custom)) campo(r, 'Propio: ' + k, typeof v === 'object' ? JSON.stringify(v) : v);
      if (metadata) {
        const all = metadata.getAll ? metadata.getAll() : {};
        for (const [k, v] of Object.entries(all)) {
          const val = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v;
          const cat = /creator$|author/i.test(k) && !/tool/i.test(k) ? 'persona' : /creatortool|producer|softwareagent/i.test(k) ? 'software' : null;
          campo(r, 'XMP ' + k, val, cat);
        }
      }
      try { await doc.destroy(); } catch (e) { }
    } catch (e) { r.avisos.push('No se pudo leer el PDF por completo (' + (e.message || e) + ').'); }
    const txt = textoDeBinario(bytes, 4e6);
    // XMP sin comprimir: historial de edición y programas
    for (const m of txt.matchAll(/stEvt:softwareAgent(?:="|>)([^"<]{2,80})/g)) r.software.add(limpiarTxt(m[1]));
    for (const m of txt.matchAll(/<pdf:Producer>([^<]{2,120})</g)) r.software.add(limpiarTxt(m[1]));
    escanear(txt, r);
  }

  /* ───── Office nuevo (docx, xlsx, pptx) ───── */
  const leerXml = async (zip, ruta) => { const f = zip.file(ruta); return f ? await f.async('string') : ''; };
  const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? desXml(m[1]) : ''; };
  const desXml = s => String(s).replace(/<\/(?:w:p|text:p|a:p|p|div|li|tr|td|w:tc)>|<[^>]+\/>|<br[^>]*>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  async function ooxml(bytes, r) {
    const zip = await globalThis.JSZip.loadAsync(bytes);
    const core = await leerXml(zip, 'docProps/core.xml'), app = await leerXml(zip, 'docProps/app.xml'), custom = await leerXml(zip, 'docProps/custom.xml');
    campo(r, 'Título', tag(core, 'dc:title')); campo(r, 'Asunto', tag(core, 'dc:subject')); campo(r, 'Palabras clave', tag(core, 'cp:keywords')); campo(r, 'Descripción', tag(core, 'dc:description')); campo(r, 'Categoría', tag(core, 'cp:category'));
    campo(r, 'Autor', tag(core, 'dc:creator'), 'persona'); campo(r, 'Última edición por', tag(core, 'cp:lastModifiedBy'), 'persona');
    campo(r, 'Revisión', tag(core, 'cp:revision'));
    const cr = tag(core, 'dcterms:created'), mo = tag(core, 'dcterms:modified'), pr = tag(core, 'cp:lastPrinted');
    if (cr) { campo(r, 'Creado', cr.replace('T', ' ').replace('Z', '')); r.fechas.creado = cr; }
    if (mo) { campo(r, 'Modificado', mo.replace('T', ' ').replace('Z', '')); r.fechas.modificado = mo; }
    if (pr) campo(r, 'Impreso por última vez', pr.replace('T', ' ').replace('Z', ''));
    const appN = tag(app, 'Application'), ver = tag(app, 'AppVersion');
    campo(r, 'Programa', appN + (ver ? ' ' + ver : ''), 'software');
    campo(r, 'Empresa', tag(app, 'Company'), 'persona'); campo(r, 'Responsable', tag(app, 'Manager'), 'persona');
    campo(r, 'Plantilla', tag(app, 'Template')); campo(r, 'Minutos de edición', tag(app, 'TotalTime'));
    campo(r, 'Páginas', tag(app, 'Pages')); campo(r, 'Palabras', tag(app, 'Words')); campo(r, 'Diapositivas', tag(app, 'Slides'));
    for (const m of custom.matchAll(/<property[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/property>/g)) campo(r, 'Propio: ' + desXml(m[1]), desXml(m[2]));
    // autores de comentarios y cambios con control de cambios
    const nombres = Object.keys(zip.files);
    for (const n of nombres) {
      if (!/\.(xml|rels)$/i.test(n)) continue;
      const f = zip.files[n]; if (f.dir) continue;
      if (f._data && f._data.uncompressedSize > 8e6) continue;
      const x = await f.async('string');
      for (const m of x.matchAll(/w(?:15)?:author="([^"]{1,80})"/g)) { const v = desXml(m[1]); r.personas.add(v); }
      for (const m of x.matchAll(/<p:cmAuthor[^>]*name="([^"]{1,80})"/g)) r.personas.add(desXml(m[1]));
      if (/comments\d*\.xml$/.test(n)) for (const m of x.matchAll(/<author>([^<]{1,80})<\/author>/g)) r.personas.add(desXml(m[1]));
      for (const m of x.matchAll(/<(?:p188:author|w15:person)[^>]*(?:name|w15:author)="([^"]{1,80})"/g)) r.personas.add(desXml(m[1]));
      if (/\.rels$/.test(n)) for (const rel of x.matchAll(/<Relationship\b[^>]*>/g)) { if (!/TargetMode="External"/.test(rel[0])) continue; const tm = rel[0].match(/Target="([^"]+)"/); if (!tm) continue; const t = desXml(tm[1]); if (/^(file:|[A-Za-z]:[\\/]|\\\\|\.\.\/)/.test(t)) r.rutas.add(decodeURIComponentSeguro(t).replace(/^(\.\.\/)+/, '')); else if (/^https?:/.test(t) && !/schemas\.(openxmlformats|microsoft)/.test(t)) r.campos.push(['Enlace externo', t]); }
      if (/settings\.xml$/.test(n)) { const t = x.match(/<w:attachedTemplate[^>]*r:id="([^"]+)"/); if (t) campo(r, 'Usa plantilla adjunta', 'sí'); }
      if (!/^\[Content_Types\]|theme|styles|fontTable/.test(n)) escanear(/^docProps\//.test(n) ? x.replace(/<[^>]+>/g, ' ') : desXml(x), r);
    }
    // impresoras (configuración de impresión de Excel/PowerPoint: estructura DEVMODE)
    for (const n of nombres.filter(n => /printerSettings\d*\.bin$/i.test(n))) {
      const b = await zip.file(n).async('uint8array'); const nm = utf16(b.subarray(0, 64)); if (nm) r.impresoras.add(nm);
    }
    // imágenes adentro del documento: muchas veces tienen EXIF con GPS
    const imgs = nombres.filter(n => /media\/[^/]+\.(jpe?g|tiff?|heic|png)$/i.test(n)).slice(0, 12);
    for (const n of imgs) {
      try { const b = await zip.file(n).async('uint8array'); const sub = nuevo(n.split('/').pop(), 'img', b.length); await imagen(b, sub); const c = cerrar(sub); if (c.puntos > 0 || c.campos.length > 2) { r.embebidos.push(c); for (const k of ['personas', 'software', 'rutas', 'usuarios']) c[k].forEach(v => r[k].add(v)); if (c.gps && !r.gps) r.gps = { ...c.gps, de: n }; } } catch (e) { }
    }
    if (zip.file('docProps/thumbnail.jpeg') || zip.file('docProps/thumbnail.wmf') || zip.file('docProps/thumbnail.emf')) campo(r, 'Miniatura guardada', 'sí (muestra la primera página)');
    if (nombres.some(n => /vbaProject\.bin$/i.test(n))) { campo(r, 'Macros', 'sí'); r.avisos.push('Tiene macros (código VBA).'); }
  }
  function utf16(b) { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) { const c = b[i] | (b[i + 1] << 8); if (!c) break; s += String.fromCharCode(c); } return limpiarTxt(s); }

  /* ───── OpenDocument (LibreOffice) ───── */
  async function odf(bytes, r) {
    const zip = await globalThis.JSZip.loadAsync(bytes);
    const meta = await leerXml(zip, 'meta.xml'), settings = await leerXml(zip, 'settings.xml');
    campo(r, 'Título', tag(meta, 'dc:title')); campo(r, 'Asunto', tag(meta, 'dc:subject')); campo(r, 'Descripción', tag(meta, 'dc:description'));
    campo(r, 'Autor original', tag(meta, 'meta:initial-creator'), 'persona'); campo(r, 'Última edición por', tag(meta, 'dc:creator'), 'persona');
    campo(r, 'Programa', tag(meta, 'meta:generator'), 'software');
    const cr = tag(meta, 'meta:creation-date'), mo = tag(meta, 'dc:date');
    if (cr) { campo(r, 'Creado', cr.replace('T', ' ')); r.fechas.creado = cr; } if (mo) { campo(r, 'Modificado', mo.replace('T', ' ')); r.fechas.modificado = mo; }
    campo(r, 'Veces que se editó', tag(meta, 'meta:editing-cycles')); campo(r, 'Tiempo de edición', tag(meta, 'meta:editing-duration'));
    const pi = tag(meta, 'meta:print-date'); if (pi) campo(r, 'Impreso', pi.replace('T', ' ')); campo(r, 'Impreso por', tag(meta, 'meta:printed-by'), 'persona');
    for (const m of meta.matchAll(/<meta:user-defined[^>]*meta:name="([^"]+)"[^>]*>([\s\S]*?)<\/meta:user-defined>/g)) campo(r, 'Propio: ' + desXml(m[1]), desXml(m[2]));
    const imp = settings.match(/config:name="PrinterName"[^>]*>([^<]+)</); if (imp) campo(r, 'Impresora', desXml(imp[1]), 'impresora');
    const cont = await leerXml(zip, 'content.xml');
    for (const m of cont.matchAll(/dc:creator>([^<]{1,80})</g)) r.personas.add(desXml(m[1]));
    for (const m of cont.matchAll(/xlink:href="([^"]+)"/g)) { const t = desXml(m[1]); if (/^(file:|[A-Za-z]:\\|\\\\|\.\.\/)/.test(t)) r.rutas.add(decodeURIComponentSeguro(t).replace(/^(\.\.\/)+/, '')); }
    escanear(desXml(meta + ' ' + settings + ' ' + cont.slice(0, 2e6)), r);
  }

  /* ───── Office viejo (doc, xls, ppt): «Compound File» con SummaryInformation ───── */
  function leerPropiedades(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); if (b.length < 48) return {};
    const nSets = dv.getUint32(24, true); const out = {};
    for (let s = 0; s < Math.min(nSets, 2); s++) {
      const off = dv.getUint32(28 + s * 20 + 16, true); if (off + 8 > b.length) continue;
      const n = dv.getUint32(off + 4, true); let cp = 1252;
      const props = [];
      for (let i = 0; i < Math.min(n, 200); i++) { const pid = dv.getUint32(off + 8 + i * 8, true), po = dv.getUint32(off + 12 + i * 8, true); props.push([pid, off + po]); }
      for (const [pid, p] of props) if (pid === 1 && p + 6 <= b.length) cp = dv.getUint16(p + 4, true);
      for (const [pid, p] of props) {
        if (p + 8 > b.length) continue; const t = dv.getUint32(p, true) & 0xffff;
        let v = null;
        try {
          if (t === 30) { const len = dv.getUint32(p + 4, true); const raw = b.subarray(p + 8, p + 8 + Math.min(len, 4096)); v = decodificar(raw, cp); }
          else if (t === 31) { const len = dv.getUint32(p + 4, true); v = utf16(b.subarray(p + 8, p + 8 + Math.min(len * 2, 8192))); }
          else if (t === 64) { const lo = dv.getUint32(p + 4, true), hi = dv.getUint32(p + 8, true); const ms = (hi * 4294967296 + lo) / 1e4; v = { ms }; }
          else if (t === 3) v = dv.getInt32(p + 4, true);
          else if (t === 2) v = dv.getInt16(p + 4, true);
        } catch (e) { }
        out[(s ? 'd' : 's') + pid] = v;
      }
    }
    return out;
  }
  function decodificar(raw, cp) {
    let i = raw.indexOf(0); if (i >= 0) raw = raw.subarray(0, i);
    const enc = cp === 65001 ? 'utf-8' : cp === 1200 ? 'utf-16le' : 'windows-' + (cp >= 1250 && cp <= 1258 ? cp : 1252);
    try { return new TextDecoder(enc).decode(raw); } catch (e) { return new TextDecoder('latin1').decode(raw); }
  }
  const filetime = v => v && v.ms ? new Date(v.ms - 11644473600000) : null;
  function ole(bytes, r) {
    const C = globalThis.CFB; const cfb = C.read(bytes, { type: 'array' });
    const busca = nombre => { const e = C.find(cfb, nombre); return e && e.content ? Uint8Array.from(e.content) : null; };
    const si = busca('\u0005SummaryInformation'), dsi = busca('\u0005DocumentSummaryInformation');
    const p = Object.assign({}, si ? leerPropiedades(si) : {});
    if (dsi) { const d = leerPropiedades(dsi); for (const k in d) p['ds' + k.slice(1)] = d[k]; }
    campo(r, 'Título', p.s2); campo(r, 'Asunto', p.s3); campo(r, 'Autor', p.s4, 'persona'); campo(r, 'Palabras clave', p.s5); campo(r, 'Comentarios', p.s6);
    campo(r, 'Plantilla', p.s7); campo(r, 'Última edición por', p.s8, 'persona'); campo(r, 'Revisión', p.s9); campo(r, 'Programa', p.s18, 'software');
    const cr = filetime(p.s12), sv = filetime(p.s13), pr = filetime(p.s11);
    if (cr && cr.getFullYear() > 1980) { campo(r, 'Creado', cr); r.fechas.creado = fechaTxt(cr); }
    if (sv && sv.getFullYear() > 1980) { campo(r, 'Guardado', sv); r.fechas.modificado = fechaTxt(sv); }
    if (pr && pr.getFullYear() > 1980) campo(r, 'Impreso por última vez', pr);
    campo(r, 'Empresa', p.ds15, 'persona'); campo(r, 'Responsable', p.ds14, 'persona');
    // el resto de los flujos: plantillas, rutas e impresoras escritas en texto
    let txt = '';
    for (const e of cfb.FileIndex) { if (!e.content || !e.content.length || /SummaryInformation/.test(e.name)) continue; txt += textoDeBinario(e.content instanceof Uint8Array ? e.content : Uint8Array.from(e.content), 3e6) + '\n'; if (txt.length > 8e6) break; }
    escanear(txt, r);
    for (const m of txt.matchAll(/(?:^|[\s"])([A-Za-z0-9][\w .-]{2,40}(?:LaserJet|DeskJet|OfficeJet|Epson|Brother|Canon|Xerox|Lexmark|Ricoh|Kyocera|Samsung|Konica)[\w .-]{0,30})/gi)) r.impresoras.add(limpiarTxt(m[1]));
    if (cfb.FileIndex.some(e => /^(Macros|VBA|_VBA_PROJECT)$/i.test(e.name))) { campo(r, 'Macros', 'sí'); r.avisos.push('Tiene macros (código VBA).'); }
  }

  /* ───── imágenes ───── */
  async function imagen(bytes, r) {
    let d = null;
    try { d = await globalThis.exifr.parse(bytes, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, jfif: false, ihdr: true, mergeOutput: true, translateValues: true, reviveValues: true }); } catch (e) { }
    if (!d) return;
    const g = (k, n, cat) => { if (d[k] != null) campo(r, n, d[k], cat); };
    g('Make', 'Marca de la cámara'); g('Model', 'Modelo'); g('LensModel', 'Lente'); g('Software', 'Programa', 'software'); g('CreatorTool', 'Programa (XMP)', 'software'); g('HostComputer', 'Equipo', null);
    g('Artist', 'Autor', 'persona'); g('Copyright', 'Derechos'); g('OwnerName', 'Dueño de la cámara', 'persona'); g('CameraOwnerName', 'Dueño de la cámara', 'persona'); g('BodySerialNumber', 'Número de serie'); g('SerialNumber', 'Número de serie');
    g('creator', 'Creador (XMP)', 'persona'); g('Credit', 'Crédito'); g('By-line', 'Autor (IPTC)', 'persona'); g('ImageDescription', 'Descripción'); g('UserComment', 'Comentario');
    if (d.HostComputer) r.equipos.add(limpiarTxt(d.HostComputer));
    const f = d.DateTimeOriginal || d.CreateDate || d.ModifyDate; if (f instanceof Date) { campo(r, 'Fecha de la foto', f); r.fechas.creado = fechaTxt(f); }
    if (d.ImageWidth && d.ImageHeight) campo(r, 'Tamaño', `${d.ImageWidth} × ${d.ImageHeight}`); else if (d.ExifImageWidth) campo(r, 'Tamaño', `${d.ExifImageWidth} × ${d.ExifImageHeight}`);
    if (typeof d.latitude === 'number' && typeof d.longitude === 'number' && (d.latitude || d.longitude)) {
      r.gps = { lat: +d.latitude.toFixed(6), lon: +d.longitude.toFixed(6), alt: d.GPSAltitude != null ? Math.round(d.GPSAltitude) : null };
      campo(r, 'Ubicación GPS', `${r.gps.lat}, ${r.gps.lon}${r.gps.alt != null ? ` (altura ${r.gps.alt} m)` : ''}`);
    }
    if (d.DocumentID || d.OriginalDocumentID) campo(r, 'ID de documento (XMP)', d.OriginalDocumentID || d.DocumentID);
    if (Array.isArray(d.History)) for (const h of d.History.slice(0, 10)) if (h && h.softwareAgent) r.software.add(limpiarTxt(h.softwareAgent));
  }

  /* ───── SVG y texto ───── */
  function svg(bytes, r) {
    const t = new TextDecoder().decode(bytes.subarray(0, 4e6));
    for (const [rx, n] of [[/inkscape:export-filename="([^"]+)"/, 'Exportado a'], [/sodipodi:docname="([^"]+)"/, 'Nombre original'], [/<dc:creator>[\s\S]*?<dc:title>([^<]+)</, 'Autor']]) { const m = t.match(rx); if (m) campo(r, n, desXml(m[1]), n === 'Autor' ? 'persona' : null); }
    const gen = t.match(/Generator: ([^-]{2,80})/) || t.match(/inkscape:version="([^"]+)"/); if (gen) campo(r, 'Programa', gen[1].replace(/inkscape:version="/, 'Inkscape '), 'software');
    escanear(t, r);
  }

  /* ───── entrada principal ───── */
  L.analizar = async function (nombre, bytes) {
    const tipo = L.tipoDe(nombre), r = nuevo(nombre, tipo, bytes.length);
    // detectar por la firma si la extensión miente
    const sig = bytes.subarray(0, 8);
    const real = sig[0] === 0x25 && sig[1] === 0x50 ? 'pdf' : sig[0] === 0x50 && sig[1] === 0x4b ? 'zip' : sig[0] === 0xd0 && sig[1] === 0xcf ? 'ole' : sig[0] === 0xff && sig[1] === 0xd8 ? 'img' : sig[0] === 0x89 && sig[1] === 0x50 ? 'img' : null;
    let t = tipo;
    if (real === 'pdf') t = 'pdf'; else if (real === 'ole') t = 'ole'; else if (real === 'img' && t !== 'img') t = 'img';
    else if (real === 'zip' && t !== 'ooxml' && t !== 'odf') { try { const z = await globalThis.JSZip.loadAsync(bytes); t = z.file('docProps/core.xml') || z.file('[Content_Types].xml') ? 'ooxml' : z.file('meta.xml') ? 'odf' : 'otro'; } catch (e) { } }
    r.tipo = t;
    try {
      if (t === 'pdf') await pdf(bytes, r);
      else if (t === 'ooxml') await ooxml(bytes, r);
      else if (t === 'odf') await odf(bytes, r);
      else if (t === 'ole') ole(bytes, r);
      else if (t === 'img') { await imagen(bytes, r); escanear(textoDeBinario(bytes.subarray(0, 65536)), r); }
      else if (t === 'svg') svg(bytes, r);
      else escanear(textoDeBinario(bytes, 3e6), r);
    } catch (e) { r.avisos.push('No se pudo leer: ' + (e.message || e)); }
    return cerrar(r);
  };
  L._interno = { escanear, textoDeBinario, leerPropiedades, nuevo, cerrar };
})();
