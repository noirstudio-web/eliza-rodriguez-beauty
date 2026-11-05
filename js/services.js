/* ==========================================================================
   SERVICIOS
   Edita esta lista para cambiar nombres, textos, duración, precios e imágenes.
   - El orden de la lista es el orden en que aparecen en la página.
   - Las tarjetas, el selector del formulario y los mensajes de WhatsApp
     se generan automáticamente a partir de estos datos.
   ========================================================================== */

const SERVICES = [
  {
    id: "labios",
    nombre: "Perfilamiento y aumento de labios",
    descripcion: "Define el contorno y aporta volumen con ácido hialurónico, cuidando la armonía de tu rostro.",
    duracion: "45–60 min",
    precio: "$XXX", // Escribe el valor (ej. 350000): se muestra como "desde $350.000 COP"
    imagen: "assets/img/servicios/labios.webp?v=202611041312",
    alt: "Labios perfilados con acabado natural",
  },
  {
    id: "nariz",
    nombre: "Perfilamiento de nariz",
    descripcion: "Rinomodelación sin cirugía para corregir pequeñas imperfecciones y equilibrar el perfil.",
    duracion: "30–45 min",
    precio: "$XXX",
    imagen: "assets/img/servicios/nariz.webp?v=202611041312",
    alt: "Perfil de nariz armonizado sin cirugía",
  },
  {
    id: "botox",
    nombre: "Botox",
    descripcion: "Suaviza líneas de expresión en frente, entrecejo y patas de gallo con un resultado fresco.",
    duracion: "30 min",
    precio: "$XXX",
    imagen: "assets/img/servicios/botox.webp?v=202611041312",
    alt: "Rostro con líneas de expresión suavizadas",
  },
  {
    id: "limpieza-facial",
    nombre: "Limpieza facial",
    descripcion: "Limpieza profunda, extracción y mascarilla según tu tipo de piel para un rostro luminoso.",
    duracion: "60–90 min",
    precio: "$XXX",
    imagen: "assets/img/servicios/limpieza-facial.webp?v=202611041312",
    alt: "Piel limpia e hidratada después de una limpieza facial",
  },
  {
    id: "peeling",
    nombre: "Peeling químico",
    descripcion: "Renueva la piel, mejora manchas, textura y marcas de acné con ácidos de grado profesional.",
    duracion: "45 min",
    precio: "$XXX",
    imagen: "assets/img/servicios/peeling.webp?v=202611041312",
    alt: "Piel uniforme y renovada tras un peeling químico",
  },
  {
    id: "dermapen",
    nombre: "Dermapen",
    descripcion: "Microagujas que estimulan colágeno para cicatrices, poros abiertos y firmeza de la piel.",
    duracion: "60 min",
    precio: "$XXX",
    imagen: "assets/img/servicios/dermapen.webp?v=202611041312",
    alt: "Tratamiento de microagujas Dermapen",
  },
];
