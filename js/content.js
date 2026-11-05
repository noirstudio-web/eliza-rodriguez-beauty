/* ==========================================================================
   CONTENIDO EDITABLE
   Resultados (antes/después), certificaciones y testimonios.
   ========================================================================== */

/**
 * RESULTADOS — una pestaña por cada elemento.
 * Las fotos van en /assets/img/resultados/ (ideal: cuadradas, 900×900, WebP).
 * Importante: la foto de "antes" y la de "después" deben tener el mismo encuadre.
 */
const RESULTADOS = [
  {
    servicio: "Limpieza facial",
    antes: "assets/img/resultados/limpieza-facial-antes.webp?v=20261105",
    despues: "assets/img/resultados/limpieza-facial-despues.webp?v=20261105",
    nota: "Limpieza profunda con extracción: piel con acné, antes y después.",
  },
  {
    servicio: "Dermapen",
    antes: "assets/img/resultados/dermapen-antes.webp?v=20261105",
    despues: "assets/img/resultados/dermapen-despues.webp?v=20261105",
    nota: "Microagujas para manchas y marcas de acné.",
  },
  {
    servicio: "Botox",
    antes: "assets/img/resultados/botox-antes.webp?v=20261105",
    despues: "assets/img/resultados/botox-despues.webp?v=20261105",
    nota: "Toxina botulínica en la frente: líneas de expresión suavizadas.",
  },
  {
    servicio: "Labios",
    antes: "assets/img/resultados/labios-antes.webp?v=202611041312",
    despues: "assets/img/resultados/labios-despues.webp?v=202611041312",
    nota: "Perfilamiento y aumento de labios.",
  },
  {
    servicio: "Nariz",
    antes: "assets/img/resultados/nariz-antes.webp?v=202611041312",
    despues: "assets/img/resultados/nariz-despues.webp?v=202611041312",
    nota: "Rinomodelación sin cirugía, resultado inmediato.",
  },
  {
    servicio: "Peeling",
    antes: "assets/img/resultados/peeling-antes.webp?v=202611041312",
    despues: "assets/img/resultados/peeling-despues.webp?v=202611041312",
    nota: "Protocolo de 3 sesiones para manchas.",
  },
];

/** CERTIFICACIONES / FORMACIÓN — agrega o quita líneas libremente. */
const CERTIFICACIONES = [
  "Certificación en armonización facial con ácido hialurónico",
  "Diplomado en aplicación de toxina botulínica",
  "Curso de peelings químicos y manejo de manchas",
  "Formación en microagujas (Dermapen) y regeneración de la piel",
  "Bioseguridad y protocolos de asepsia en estética",
];

/** TESTIMONIOS — nombre, servicio y texto. Se muestran con 5 estrellas. */
const TESTIMONIOS = [
  {
    nombre: "Valentina M.",
    servicio: "Aumento de labios",
    texto: "Quedé feliz, se ven naturales y tal como los quería. Eliza me explicó todo con mucha paciencia y casi no sentí molestias.",
  },
  {
    nombre: "Daniela R.",
    servicio: "Limpieza facial",
    texto: "Mi piel quedó suavecita y luminosa. El lugar es muy limpio y cómodo, se nota el cuidado en cada detalle.",
  },
  {
    nombre: "Carolina P.",
    servicio: "Botox",
    texto: "Resultado súper natural, nadie nota que me hice algo, solo me dicen que me veo descansada. ¡Totalmente recomendada!",
  },
  {
    nombre: "Luisa F.",
    servicio: "Peeling químico",
    texto: "Llevaba años con manchas y en pocas sesiones la diferencia es enorme. Atención personalizada de principio a fin.",
  },
];
