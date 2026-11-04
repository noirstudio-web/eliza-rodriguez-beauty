/* ==========================================================================
   CONFIGURACIÓN GENERAL
   Cambia aquí el número de WhatsApp, las redes sociales y los horarios.
   ========================================================================== */

/**
 * Número de WhatsApp en formato internacional, SIN "+", espacios ni guiones.
 * Ejemplo para Colombia: "573001234567"  (57 = indicativo + número celular)
 */
const WHATSAPP_NUMBER = "573128802463";

const SITE_CONFIG = {
  /* Mensaje por defecto de los botones generales de WhatsApp */
  mensajeGeneral: "Hola Eliza, quiero agendar una cita",

  /* Redes sociales (usa la URL completa) */
  instagram: "https://www.instagram.com/eliza_rodriguez_beauty/",
  instagramUsuario: "@eliza_rodriguez_beauty",
  facebook: "https://www.facebook.com/", // TODO: reemplazar por la página real

  /* Dirección visible en la sección de contacto */
  direccion: "Bahía Solano, Chocó, Colombia",

  /* Horarios (puedes agregar o quitar filas).
     Ejemplo con horario fijo: { dias: "Lunes a viernes", horas: "9:00 a. m. – 6:00 p. m." } */
  horarios: [
    { dias: "Atención", horas: "Sobre reserva" },
    { dias: "Días y horas", horas: "Se acuerdan al agendar tu cita" },
  ],
};
