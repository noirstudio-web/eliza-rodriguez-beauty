/* ==========================================================================
   /api/admin/reservas — usado por el panel privado /admin
   GET   → lista de reservas (requiere contraseña)
   PATCH → cambia el estado de una reserva { id, estado, valor_pagado? }
           Al marcar "Asistió" por 2.ª vez, se crea la cuenta de la clienta.
   La contraseña es la variable ADMIN_PASSWORD configurada en Netlify.
   ========================================================================== */
import { db, json, readJson, isAdmin, denied, ESTADOS } from "../lib/shared.mjs";
import { asegurarCuenta } from "../lib/fidelidad.mjs";

export const config = { path: "/api/admin/reservas" };

export default async (req) => {
  if (!isAdmin(req)) return denied();

  try {
    const sql = db();

    if (req.method === "GET") {
      const reservas = await sql`
        SELECT id, creada_en, nombre, whatsapp, correo, servicio,
               to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora,
               comentario, estado, cancelada_por, recordatorio_enviado_en IS NOT NULL AS recordatorio, valor_pagado
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
      const atendida = b.estado === "atendida";
      // Valor pagado (solo cuando asistió). Acepta "350.000", "$350000", 350000…
      let valor = null;
      if (atendida && b.valor_pagado !== undefined && b.valor_pagado !== null && String(b.valor_pagado).trim() !== "") {
        valor = Number(String(b.valor_pagado).replace(/[^\d]/g, ""));
        if (!Number.isFinite(valor) || valor < 0 || valor > 100000000) return json(400, { ok: false, error: "Valor pagado inválido" });
      }
      const filas = await sql`
        UPDATE reservas SET estado = ${b.estado},
          cancelada_en = CASE WHEN ${cancela} THEN COALESCE(cancelada_en, now()) ELSE NULL END,
          cancelada_por = CASE WHEN ${cancela} THEN COALESCE(cancelada_por, 'eliza') ELSE NULL END,
          valor_pagado = CASE WHEN ${atendida} THEN COALESCE(${valor}::int, valor_pagado) ELSE NULL END
        WHERE id = ${id} RETURNING id, estado, cancelada_por, valor_pagado, correo`;
      if (!filas.length) return json(404, { ok: false, error: "Reserva no encontrada" });
      const { correo, ...reserva } = filas[0];
      // ¿Ya suma 2 visitas? → se crea su cuenta y se le envía el enlace
      const cuenta = atendida ? await asegurarCuenta(sql, correo) : null;
      return json(200, { ok: true, reserva, cuentaNueva: cuenta });
    }

    return json(405, { ok: false, error: "Método no permitido" }, { Allow: "GET, PATCH" });
  } catch (err) {
    console.error("[admin] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
