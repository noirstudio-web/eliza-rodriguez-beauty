/* ==========================================================================
   POST /api/reserva — guarda una reserva enviada desde el formulario.
   Valida todo en el servidor (no se confía en el navegador).
   ========================================================================== */
import { db, json, readJson, hoyColombia } from "../lib/shared.mjs";

export const config = { path: "/api/reserva" };

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" }, { Allow: "POST" });

  const b = await readJson(req);

  // Campo trampa anti-spam: las personas no lo ven; si viene lleno, es un bot.
  // Respondemos "ok" para no darle pistas, pero no guardamos nada.
  if (clean(b["bot-field"], 200)) return json(200, { ok: true });

  const r = {
    nombre: clean(b.nombre, 120),
    whatsapp: clean(b.whatsapp, 25),
    correo: clean(b.correo, 160).toLowerCase(),
    servicio: clean(b.servicio, 120),
    fecha: clean(b.fecha, 10),
    hora: clean(b.hora, 5),
    comentario: clean(b.comentario, 1000) || null,
    autoriza: b["autorizo-datos"] === "sí" || b["autorizo-datos"] === true,
  };

  const errores = [];
  if (!r.nombre) errores.push("nombre");
  const digitos = r.whatsapp.replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 15) errores.push("whatsapp");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.correo)) errores.push("correo");
  if (!r.servicio) errores.push("servicio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || r.fecha < hoyColombia()) errores.push("fecha");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) errores.push("hora");
  if (!r.autoriza) errores.push("autorizo-datos");
  if (errores.length) return json(400, { ok: false, error: "Datos inválidos", campos: errores });

  try {
    const sql = db();
    const [fila] = await sql`
      INSERT INTO reservas (nombre, whatsapp, correo, servicio, fecha, hora, comentario, autoriza_datos)
      VALUES (${r.nombre}, ${r.whatsapp}, ${r.correo}, ${r.servicio}, ${r.fecha}, ${r.hora}, ${r.comentario}, true)
      RETURNING id`;
    return json(201, { ok: true, id: fila.id });
  } catch (err) {
    console.error("[reserva] error al guardar:", err);
    return json(500, { ok: false, error: "No se pudo guardar la reserva" });
  }
};
