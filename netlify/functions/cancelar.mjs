/* ==========================================================================
   /api/cancelar — la clienta cancela su cita con el enlace del correo.
   GET  ?t=<token> → datos de la cita y si todavía puede cancelarla
   POST { t }      → cancela (solo hasta 3 h antes) y avisa a Eliza al instante
   ========================================================================== */
import {
  db, json, readJson, sendMail, plantilla, correoEliza, siteUrl, fechaLarga, hora12, HORAS_CANCELACION,
} from "../lib/shared.mjs";

export const config = { path: "/api/cancelar" };

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buscar(sql, token) {
  const [r] = await sql`
    SELECT id, nombre, whatsapp, correo, servicio, estado,
           to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora,
           ((fecha + hora) AT TIME ZONE 'America/Bogota') - now() > make_interval(hours => ${HORAS_CANCELACION}) AS a_tiempo
    FROM reservas WHERE cancel_token = ${token}`;
  return r;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const token = req.method === "POST" ? String((await readJson(req)).t || "") : String(url.searchParams.get("t") || "");
  if (!TOKEN.test(token)) return json(404, { ok: false, error: "Enlace no válido" });

  const sql = db();
  const r = await buscar(sql, token);
  if (!r) return json(404, { ok: false, error: "Enlace no válido" });

  const cita = {
    nombre: r.nombre.split(" ")[0],
    servicio: r.servicio,
    fecha: fechaLarga(r.fecha),
    hora: hora12(r.hora),
    estado: r.estado,
    puedeCancelar: r.a_tiempo && ["pendiente", "confirmada"].includes(r.estado),
    horasLimite: HORAS_CANCELACION,
  };

  if (req.method === "GET") return json(200, { ok: true, cita });
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" });

  if (r.estado === "cancelada") return json(200, { ok: true, cita, yaCancelada: true });
  if (!cita.puedeCancelar) return json(409, { ok: false, error: "Fuera de plazo", cita });

  await sql`UPDATE reservas SET estado = 'cancelada', cancelada_en = now(), cancelada_por = 'clienta' WHERE id = ${r.id}`;
  cita.estado = "cancelada";
  cita.puedeCancelar = false;

  const aviso = sendMail({
    to: correoEliza(),
    replyTo: r.correo,
    subject: `Cita cancelada: ${r.nombre} · ${r.servicio} · ${cita.fecha} ${cita.hora}`,
    html: plantilla({
      titulo: "Una clienta canceló su cita",
      intro: `${r.nombre} canceló su cita desde el enlace del correo. El espacio quedó libre.`,
      filas: [["Clienta", r.nombre], ["Servicio", r.servicio], ["Fecha", cita.fecha], ["Hora", cita.hora], ["WhatsApp", r.whatsapp], ["Correo", r.correo]],
      boton: { texto: "Abrir panel de reservas", url: `${siteUrl()}/admin/` },
    }),
  });
  if (context?.waitUntil) context.waitUntil(aviso);
  else await aviso;

  return json(200, { ok: true, cita });
};
