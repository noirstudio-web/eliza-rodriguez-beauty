/* ==========================================================================
   /api/admin/clientas — fidelidad desde el panel de Eliza
   GET                                   → clientas con visitas, consumo, nivel y sellos
   POST { accion: "enlace",  correo }    → crea la cuenta si falta y genera un enlace
                                           de acceso (para enviarlo por WhatsApp)
   POST { accion: "canjear", correo }    → entrega el regalo (descuenta los sellos)
   ========================================================================== */
import { db, json, readJson, isAdmin, denied } from "../lib/shared.mjs";
import { cargarConfig, nivelDe, nuevoEnlace, correoAcceso, VISITAS_PARA_CUENTA } from "../lib/fidelidad.mjs";

export const config = { path: "/api/admin/clientas" };

export default async (req) => {
  if (!isAdmin(req)) return denied();
  const sql = db();

  try {
    const cfg = await cargarConfig(sql);

    if (req.method === "GET") {
      const filas = await sql`
        WITH base AS (
          SELECT correo,
                 (array_agg(nombre ORDER BY creada_en DESC))[1] AS nombre,
                 (array_agg(whatsapp ORDER BY creada_en DESC))[1] AS whatsapp,
                 count(*) FILTER (WHERE estado = 'atendida')::int AS visitas,
                 count(*) FILTER (WHERE estado = 'no_asistio')::int AS faltas,
                 coalesce(sum(valor_pagado) FILTER (WHERE estado = 'atendida'), 0)::bigint AS consumo,
                 to_char(max(fecha) FILTER (WHERE estado = 'atendida'), 'YYYY-MM-DD') AS ultima
          FROM reservas GROUP BY correo
        )
        SELECT b.*, c.id AS clienta_id, c.clave_hash IS NOT NULL AS activa, c.ultimo_acceso,
               coalesce((SELECT sum(sellos_usados) FROM canjes k WHERE k.clienta_id = c.id), 0)::int AS usados
        FROM base b LEFT JOIN clientas c ON c.correo = b.correo
        WHERE b.visitas > 0 OR c.id IS NOT NULL
        ORDER BY b.visitas DESC, b.consumo DESC`;
      const clientas = filas.map((f) => {
        const consumo = Number(f.consumo);
        const n = nivelDe(f.visitas, consumo, cfg);
        return {
          correo: f.correo, nombre: f.nombre, whatsapp: f.whatsapp,
          visitas: f.visitas, faltas: f.faltas, consumo, ultima: f.ultima,
          nivel: n.actual.nombre, siguiente: n.siguiente,
          sellos: Math.max(0, f.visitas - f.usados), sellosMeta: cfg.sellos,
          cuenta: f.clienta_id ? (f.activa ? "activa" : "sin_clave") : f.visitas >= VISITAS_PARA_CUENTA ? "pendiente" : "no",
          ultimoAcceso: f.ultimo_acceso,
        };
      });
      return json(200, { ok: true, clientas, config: cfg, visitasParaCuenta: VISITAS_PARA_CUENTA });
    }

    if (req.method === "POST") {
      const b = await readJson(req);
      const correo = String(b.correo || "").trim().toLowerCase();
      const [r] = await sql`SELECT nombre, whatsapp FROM reservas WHERE correo = ${correo} ORDER BY creada_en DESC LIMIT 1`;
      if (!r) return json(404, { ok: false, error: "Clienta no encontrada" });

      if (b.accion === "enlace") {
        const [c] = await sql`
          INSERT INTO clientas (correo, nombre, whatsapp) VALUES (${correo}, ${r.nombre}, ${r.whatsapp})
          ON CONFLICT (correo) DO UPDATE SET whatsapp = coalesce(clientas.whatsapp, EXCLUDED.whatsapp)
          RETURNING *`;
        const url = await nuevoEnlace(sql, c.id);
        const enviado = await correoAcceso(c, url, c.clave_hash ? "recuperar" : "bienvenida");
        return json(200, { ok: true, url, correoEnviado: enviado, nombre: c.nombre, whatsapp: c.whatsapp });
      }

      if (b.accion === "canjear") {
        const [c] = await sql`SELECT id FROM clientas WHERE correo = ${correo}`;
        if (!c) return json(400, { ok: false, error: "La clienta aún no tiene cuenta" });
        const [{ visitas }] = await sql`SELECT count(*)::int AS visitas FROM reservas WHERE correo = ${correo} AND estado = 'atendida'`;
        const [{ usados }] = await sql`SELECT coalesce(sum(sellos_usados), 0)::int AS usados FROM canjes WHERE clienta_id = ${c.id}`;
        if (visitas - usados < cfg.sellos) return json(400, { ok: false, error: "Aún no completa la tarjeta de sellos" });
        await sql`INSERT INTO canjes (clienta_id, sellos_usados, premio) VALUES (${c.id}, ${cfg.sellos}, ${cfg.premio})`;
        return json(200, { ok: true });
      }
    }

    return json(405, { ok: false, error: "Método no permitido" });
  } catch (err) {
    console.error("[admin-clientas] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
