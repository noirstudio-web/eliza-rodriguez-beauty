/* ==========================================================================
   /api/admin/reservas — usado por el panel privado /admin
   GET   → lista de reservas (requiere contraseña)
   PATCH → cambia el estado de una reserva { id, estado }
   La contraseña es la variable ADMIN_PASSWORD configurada en Netlify.
   ========================================================================== */
import { db, json, readJson, isAdmin, denied, ESTADOS } from "../lib/shared.mjs";

export const config = { path: "/api/admin/reservas" };

export default async (req) => {
  if (!isAdmin(req)) return denied();

  try {
    const sql = db();

    if (req.method === "GET") {
      const reservas = await sql`
        SELECT id, creada_en, nombre, whatsapp, correo, servicio,
               to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora,
               comentario, estado, cancelada_por, recordatorio_enviado_en IS NOT NULL AS recordatorio
        FROM reservas
        ORDER BY fecha DESC, hora DESC, id DESC
        LIMIT 2000`;
      return json(200, { ok: true, reservas });
    }

    if (req.method === "PATCH") {
      const b = await readJson(req);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1 || !ESTADOS.includes(b.estado)) {
        return json(400, { ok: false, error: "Datos inválidos" });
      }
      const cancela = b.estado === "cancelada";
      const filas = await sql`
        UPDATE reservas SET estado = ${b.estado},
          cancelada_en = CASE WHEN ${cancela} THEN COALESCE(cancelada_en, now()) ELSE NULL END,
          cancelada_por = CASE WHEN ${cancela} THEN COALESCE(cancelada_por, 'eliza') ELSE NULL END
        WHERE id = ${id} RETURNING id, estado, cancelada_por`;
      if (!filas.length) return json(404, { ok: false, error: "Reserva no encontrada" });
      return json(200, { ok: true, reserva: filas[0] });
    }

    return json(405, { ok: false, error: "Método no permitido" }, { Allow: "GET, PATCH" });
  } catch (err) {
    console.error("[admin] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
