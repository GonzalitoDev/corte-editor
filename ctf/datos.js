/* Retos del CTF — sólo la parte pública (título, categoría, pista, archivo o laboratorio).
   Las flags NO están acá: viven en la base privada y se verifican en el servidor. */
globalThis.RETOS = [
  // ---------- WEB ----------
  {
    id: "web-login", cat: "web", nombre: "Puerta de servicio", puntos: 150, dif: 2,
    desc: "Un panel de login consulta la base pegando tu usuario y tu clave directo en la consulta SQL, sin separarlos de los datos. Entrá como <b>admin</b> sin saber la contraseña.",
    pista: "La consulta es: <code>... where usuario='TUUSUARIO' and clave='TUCLAVE'</code>. ¿Qué pasa si tu usuario es <code>admin'--</code>? Las dos rayas comentan el resto de la línea.",
    lab: "login"
  },
  {
    id: "web-factura", cat: "web", nombre: "Facturas ajenas", puntos: 100, dif: 1,
    desc: "El sistema te muestra tus facturas por número, pero no revisa que la factura sea tuya. Encontrá la factura del administrador.",
    pista: "Mirá el número de factura en la dirección. Las tuyas son la 1 y la 2… probá otros números. El admin tiene uno bien redondo.",
    lab: "factura"
  },
  {
    id: "web-token", cat: "web", nombre: "Pase VIP", puntos: 200, dif: 3,
    desc: "El panel de admin usa un token JWT firmado con un secreto HS256 <b>muy débil</b>. Conseguí un token de invitado, descubrí el secreto y fabricá uno de admin.",
    pista: "El secreto está en cualquier diccionario conocido (pensá en las peores contraseñas del mundo). Con el secreto podés firmar un token nuevo cambiando <code>rol</code> a <code>admin</code>. Herramientas: jwt.io, o john/hashcat sobre el token.",
    lab: "token"
  },
  {
    id: "web-archivos", cat: "web", nombre: "Un pasito atrás", puntos: 200, dif: 3,
    desc: "Un visor de archivos te deja pedir el archivo que quieras por nombre, pero no limita a qué carpeta podés llegar. Salí de la carpeta pública y leé la flag que está guardada aparte.",
    pista: "Probá con <code>../</code> para subir de carpeta. La flag está en <code>/var/secreto/flag.txt</code> y vos arrancás en <code>/var/www/publico/</code>.",
    lab: "archivo"
  },
  // ---------- CRIPTO ----------
  {
    id: "cripto-xor", cat: "cripto", nombre: "Un solo byte", puntos: 100, dif: 1,
    desc: "Interceptamos un mensaje cifrado con XOR de una sola clave de un byte. Descifralo.",
    pista: "Sólo hay 256 claves posibles. Probá todas y fijate cuál da texto que empieza con <code>GONZA{</code>.",
    archivo: "cripto-xor.txt"
  },
  {
    id: "cripto-cesar", cat: "cripto", nombre: "Dos capas", puntos: 150, dif: 2,
    desc: "El mensaje pasó por dos transformaciones: primero las letras se corrieron un lugar fijo, después se codificó en texto. Destapá las dos capas.",
    pista: "Primero decodificá Base64. Lo que sale sigue ilegible: es un corrimiento de letras (probá ROT13).",
    archivo: "cripto-capas.txt"
  },
  {
    id: "cripto-rsa", cat: "cripto", nombre: "Primos vecinos", puntos: 250, dif: 4,
    desc: "Un RSA mal armado: los dos primos quedaron demasiado cerca. Factorizá <code>n</code>, calculá la clave privada y descifrá el mensaje.",
    pista: "Cuando p y q están cerca, la factorización de Fermat los encuentra enseguida (probá a ≈ √n y subí de a uno). Después: φ=(p-1)(q-1), d=e⁻¹ mod φ, m=cᵈ mod n, y pasás m a bytes.",
    archivo: "cripto-rsa.txt"
  },
  // ---------- FORENSE ----------
  {
    id: "forense-exif", cat: "forense", nombre: "La cámara habla", puntos: 100, dif: 1,
    desc: "Una foto que parece inofensiva. Pero la cámara dejó una nota en los metadatos.",
    pista: "Mirá los metadatos EXIF (campo «comentario de usuario»). Lo podés hacer con tu propia herramienta <b>Lupa</b> del Taller, o con exiftool.",
    archivo: "forense-foto.jpg"
  },
  {
    id: "forense-oculto", cat: "forense", nombre: "Blanco sobre blanco", puntos: 150, dif: 2,
    desc: "Un documento de Word con un «borrador» cualquiera. Pero hay texto escondido que no se ve a simple vista.",
    pista: "El .docx es un ZIP: abrilo y mirá <code>word/document.xml</code>. O pasalo por <b>Lupa</b>. Hay un párrafo con color de letra blanco.",
    archivo: "forense-informe.docx"
  },
  {
    id: "forense-imagen", cat: "forense", nombre: "El bit más chico", puntos: 250, dif: 4,
    desc: "Una imagen con ruido de colores. La flag está escondida en el bit menos significativo (LSB) de cada color.",
    pista: "Recorré los pixeles por filas; de cada uno tomá el último bit de R, G y B. Juntá los bits de a 8 para formar cada letra, hasta llegar a un byte 0.",
    archivo: "forense-stego.png", extra: "forense-stego.txt"
  },
  // ---------- REVERSING ----------
  {
    id: "rev-cerradura", cat: "reversing", nombre: "La cerradura", puntos: 150, dif: 2,
    desc: "Un archivo JavaScript con una función que revisa una clave. La clave correcta es la flag. Desarmá la lógica para recuperarla.",
    pista: "La función transforma cada letra y la compara con un arreglo. Invertí la cuenta: si hace <code>(x+7)^0x2d</code>, vos hacé <code>(k^0x2d)-7</code> sobre cada número del arreglo.",
    archivo: "rev-cerradura.js"
  },
  {
    id: "rev-crackme", cat: "reversing", nombre: "Crackme", puntos: 300, dif: 5,
    desc: "Un programa de Linux (ELF de 64 bits) que pide una clave y responde «Correcto» sólo con la correcta. Esa clave es la flag. No la vas a encontrar con <code>strings</code>: está ofuscada.",
    pista: "Compará cada letra de tu clave contra una tabla, haciendo XOR con <code>0x3b</code>. Sacá la tabla del binario (con Ghidra, radare2 o leyendo la sección de datos) y revertí el XOR. Corré el programa en Linux: <code>./rev-crackme &lt;clave&gt;</code>.",
    archivo: "rev-crackme", exe: true
  },
];

globalThis.CATS = {
  web:       { nombre: "Web", color: "#60a5fa", icono: "M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" },
  cripto:    { nombre: "Cripto", color: "#c084fc", icono: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" },
  forense:   { nombre: "Forense", color: "#f59e0b", icono: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.5-4.5" },
  reversing: { nombre: "Reversing", color: "#34d399", icono: "M4 7h16M4 12h10M4 17h16M14 9l3 3-3 3" },
};
