/* ==========================================================================
   POST /api/reserva — guarda una reserva enviada desde el formulario
   y envía los correos: aviso a Eliza + confirmación a la clienta (con enlace
   para cancelar). Valida todo en el servidor.
   ========================================================================== */
import {
  db, json, readJson, ahoraColombia, sendMail, plantilla, correoEliza, siteUrl,
  fechaLarga, hora12, HORAS_CANCELACION,
} from "../lib/shared.mjs";

export const config = { path: "/api/reserva" };

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" }, { Allow: "POST" });

  const b = await readJson(req);

  // Campo trampa anti-spam: si viene lleno es un bot. Respondemos "ok" sin guardar.
  if (clean(b["bot-field"], 200)) return json(200, { ok: true });

  const r = {
    nombre: clean(b.nombre, 120),
    whatsapp: clean(b.whatsapp, 25),
    correo: clean(b.correo, 160).toLowerCase(),
    servicio: clean(b.servicio, 120),
    fecha: clean(b.fecha, 10),
    hora: clean(b.hora, 5),
    comentario: clean(b.comentario, 1000) || null,
    // Acepta "si", "sí", "true", "on" o true (sin depender de tildes/codificación)
    autoriza: b["autorizo-datos"] === true ||
      ["si", "true", "on"].includes(String(b["autorizo-datos"] ?? "").normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase()),
  };

  const ahora = ahoraColombia();
  const errores = [];
  if (!r.nombre) errores.push("nombre");
  const digitos = r.whatsapp.replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 15) errores.push("whatsapp");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.correo)) errores.push("correo");
  if (!r.servicio) errores.push("servicio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || r.fecha < ahora.fecha) errores.push("fecha");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora) || (r.fecha === ahora.fecha && r.hora <= ahora.hora)) errores.push("hora");
  if (!r.autoriza) errores.push("autorizo-datos");
  if (errores.length) return json(400, { ok: false, error: "Datos inválidos", campos: errores });

  let fila;
  try {
    const sql = db();
    [fila] = await sql`
      INSERT INTO reservas (nombre, whatsapp, correo, servicio, fecha, hora, comentario, autoriza_datos)
      VALUES (${r.nombre}, ${r.whatsapp}, ${r.correo}, ${r.servicio}, ${r.fecha}, ${r.hora}, ${r.comentario}, true)
      RETURNING id, cancel_token`;
  } catch (err) {
    console.error("[reserva] error al guardar:", err);
    return json(500, { ok: false, error: "No se pudo guardar la reserva" });
  }

  // Correos en segundo plano: la respuesta a la clienta no espera por ellos.
  const filas = [
    ["Servicio", r.servicio],
    ["Fecha", fechaLarga(r.fecha)],
    ["Hora", hora12(r.hora)],
  ];
  const cancelUrl = `${siteUrl()}/cancelar/?t=${fila.cancel_token}`;
  const envios = Promise.allSettled([
    sendMail({
      to: correoEliza(),
      replyTo: r.correo,
      subject: `Nueva reserva: ${r.nombre} · ${r.servicio} · ${fechaLarga(r.fecha)} ${hora12(r.hora)}`,
      html: plantilla({
        titulo: "Nueva reserva",
        intro: `${r.nombre} solicitó una cita. Confírmala desde el panel o por WhatsApp.`,
        filas: [["Clienta", r.nombre], ...filas, ["WhatsApp", r.whatsapp], ["Correo", r.correo], ["Comentario", r.comentario]],
        boton: { texto: "Abrir panel de reservas", url: `${siteUrl()}/admin/` },
      }),
    }),
    sendMail({
      to: r.correo,
      subject: "Recibimos tu solicitud de cita · Eliza Rodriguez Beauty",
      html: plantilla({
        titulo: `¡Hola, ${r.nombre}!`,
        intro: "Recibimos tu solicitud de cita. Eliza te confirmará la disponibilidad por WhatsApp.",
        filas,
        boton: { texto: "Cancelar mi cita", url: cancelUrl },
        nota: `Si necesitas cancelar, hazlo con el botón de arriba al menos ${HORAS_CANCELACION} horas antes de tu cita. Te enviaremos un recordatorio 2 horas antes.`,
      }),
    }),
  ]);
  if (context?.waitUntil) context.waitUntil(envios);
  else await envios;

  return json(201, { ok: true, id: fila.id });
};
