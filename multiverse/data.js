/* Taller Multiverse — catálogo de dimensiones.
   Cada dimensión abre su proyecto ORIGINAL en su URL de siempre: acá no se
   reemplaza ni se toca ninguna app. Solo se las lista como mundos. */
window.TM_DIMS = [
  // ── Constelación Creación (editores) ──
  { id: "corte", nombre: "Corte", tipo: "Editor de video", cat: "creacion", color: "#e8a33d", ruta: "corte/",
    desc: "Editor de video multipista con transiciones, efectos, subtítulos automáticos y música libre.",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>' },
  { id: "lienzo", nombre: "Lienzo", tipo: "Editor de fotos", cat: "creacion", color: "#36c2b4", ruta: "lienzo/",
    desc: "Editor de imágenes con capas, pinceles, selecciones, ajustes, filtros y recorte de fondo con IA.",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>' },
  { id: "trazo", nombre: "Trazo", tipo: "Editor vectorial", cat: "creacion", color: "#9d83ff", ruta: "trazo/",
    desc: "Ilustración vectorial con pluma, formas, texto, operaciones booleanas y exportación a SVG y PDF.",
    icon: '<svg viewBox="0 0 24 24"><path d="M4 20c4-1 6-5 8-9s5-6 8-7"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/><path d="M12 11l-4-4"/></svg>' },
  { id: "folio", nombre: "Folio", tipo: "Editor de PDF", cat: "creacion", color: "#ef6b57", ruta: "folio/",
    desc: "Uní, dividí, ordená, firmá y comprimí PDF. Convertí imágenes a PDF y PDF a imágenes.",
    icon: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></svg>' },
  { id: "onda", nombre: "Onda", tipo: "Editor de audio", cat: "creacion", color: "#5aa9ff", ruta: "onda/",
    desc: "Editor de audio multipista: cortá, mezclá, grabá tu voz, limpiá el ruido y exportá a MP3 o WAV.",
    icon: '<svg viewBox="0 0 24 24"><path d="M3 12h2l2-6 3 12 3-14 3 12 2-4h3"/></svg>' },

  // ── Constelación Arcade (juegos) ──
  { id: "gonzacraft", nombre: "GonzaCraft", tipo: "Mundo de bloques", cat: "arcade", color: "#7ec850", ruta: "gonzacraft/",
    desc: "Juego de bloques con mundo infinito, supervivencia, creativo y multijugador. Para Windows, Linux, Android o el navegador.",
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/></svg>' },
  { id: "gonzasky", nombre: "GonzaSky", tipo: "Simulador de vuelo", cat: "arcade", color: "#4fb3ff", ruta: "gonzasky/",
    desc: "Simulador de vuelo con dogfight online, cuatro aviones (incluido el Stuka), ocho aeropuertos, día y noche, clima y desafíos.",
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3c.8 0 1.2.8 1.2 2v4.5l7 4v2l-7-2.2v4.3l2.3 1.9v1.5L12 20l-3.5 1v-1.5l2.3-1.9v-4.3l-7 2.2v-2l7-4V5c0-1.2.4-2 1.2-2z"/></svg>' },
  { id: "arena", nombre: "GonzaArena", tipo: "MOBA 5v5", cat: "arcade", color: "#d8b45a", ruta: "arena/",
    desc: "MOBA 5 contra 5 en el navegador: cinco campeones originales, tres carriles, jungla, Dragón y Coloso. Contra bots u online con amigos.",
    icon: '<svg viewBox="0 0 24 24"><path d="M5 4l9.5 9.5M19 4l-9.5 9.5M3.5 17.5l3 3M17.5 20.5l3-3M7 15l2 2M17 15l-2 2M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>' },
  { id: "gonzaops", nombre: "GonzaOps", tipo: "Shooter táctico", cat: "arcade", color: "#f39a3d", ruta: "gonzaops/",
    desc: "5 contra 5 en el navegador: el Asalto planta la carga y la Guardia defiende. Rondas, economía y granadas, contra bots u online.",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.2"/></svg>' },

  // ── Constelación Sistema ──
  { id: "jarvis", nombre: "Jarvis", tipo: "Asistente de voz", cat: "sistema", color: "#38e1ff", ruta: "jarvis/",
    desc: "Hablale y te responde con voz: hora, clima, temporizadores, notas, búsquedas y charla con IA. En Windows también maneja tu PC.",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.5" stroke-dasharray="6 3.2"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="11 4"/></svg>' },
  { id: "corteos", nombre: "Corte OS", tipo: "Sistema operativo", cat: "sistema", color: "#22d3ee", ruta: "https://corte-os.vercel.app/", externo: true, beta: true,
    desc: "Sistema operativo Linux propio, ligero y sin Internet: escritorio, apps, instalador y descarga en ISO para VirtualBox. En beta.",
    icon: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 9h4M7 12h7"/></svg>' },

  // ── Constelación Laboratorio (beta / en desarrollo) ──
  { id: "maquinita", nombre: "La Maquinita", tipo: "Juego de clics", cat: "lab", color: "#ffd23f", ruta: "maquinita/", beta: true,
    desc: "Sátira en pixel art: imprimí billetes, esquivá la inflación, contratá ñoquis y sobreviví a las elecciones.",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="13" height="11" rx="1.5"/><path d="M6 9h7M6 12h4M16 9h3l1 3M5 19h11"/><path d="M8 16v3M13 16v3"/></svg>' },
  { id: "lupa", nombre: "Lupa", tipo: "Análisis de metadatos", cat: "lab", color: "#8bd450", ruta: "lupa/", beta: true,
    desc: "Descubrí qué datos escondidos dejan tus documentos y fotos (autores, rutas, servidores, GPS) y limpialos antes de publicar.",
    icon: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg>' },
  { id: "ctf", nombre: "CTF", tipo: "Laboratorio de seguridad", cat: "lab", color: "#3ad97f", ruta: "ctf/", beta: true,
    desc: "Desafíos reales de seguridad para aprender rompiendo: web vulnerable, cripto, forense y reversing. Capturá flags y competí.",
    icon: '<svg viewBox="0 0 24 24"><path d="M6 4v16M6 5h11l-3 3.5L17 12H6"/></svg>' },
  { id: "garca", nombre: "El Garca", tipo: "Juego de estafas", cat: "lab", color: "#4ec98a", ruta: "garca/", beta: true,
    desc: "Sátira en pixel art: estafá por chat a personajes ficticios, ganate su confianza, cobrá y esquivá la cana. Todo inventado.",
    icon: '<svg viewBox="0 0 24 24"><path d="M4 5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M10.5 8.4c0-.6.7-1 1.5-1s1.5.4 1.5 1M13.5 11.6c0 .6-.7 1-1.5 1s-1.5-.4-1.5-1M12 6.6v7"/></svg>' },
  { id: "garita", nombre: "La Garita", tipo: "Inspección de documentos", cat: "lab", color: "#c7493a", ruta: "garita/", beta: true,
    desc: "Sos inspector de frontera de la ficticia Tramitania: revisá papeles, cazá contradicciones, sellá y mantené a tu familia.",
    icon: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/><circle cx="12" cy="14.5" r="3"/><path d="M10.6 14.5l1 1 1.8-2.1"/></svg>' },
];

window.TM_GALAXIES = [
  { cat: "creacion", nombre: "Creación", sub: "Las forjas: donde se crea video, imagen, sonido y forma.", color: "#8b5cf6" },
  { cat: "arcade", nombre: "Arcade", sub: "Los mundos jugables: construí, volá, competí.", color: "#22d3ee" },
  { cat: "sistema", nombre: "Sistema", sub: "El núcleo: asistentes y sistemas que te dan una mano.", color: "#3b82f6" },
  { cat: "lab", nombre: "Laboratorio", sub: "Dimensiones inestables en desarrollo: entrás bajo tu propio riesgo.", color: "#f0abfc" },
];
