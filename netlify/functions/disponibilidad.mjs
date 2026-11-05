/* ==========================================================================
   GET /api/disponibilidad — horarios libres para el formulario de reserva.
   { ok, activa: false }                         → agenda apagada (fecha y hora libres)
   { ok, activa: true, duracion, desde, hasta, dias: { "2026-11-09": ["09:00", …] } }
   No revela quién reservó ni las notas de los días bloqueados.
   ========================================================================== */
import { db, json } from "../lib/shared.mjs";
import { cargarAgenda, disponibilidad } from "../lib/agenda.mjs";

export const config = { path: "/api/disponibilidad" };

export default async (req) => {
  if (req.method !== "GET") return json(405, { ok: false, error: "Método no permitido" }, { Allow: "GET" });
  try {
    const sql = db();
    const cfg = await cargarAgenda(sql);
    if (!cfg.activa) return json(200, { ok: true, activa: false });
    const d = await disponibilidad(sql, cfg);
    return json(200, { ok: true, activa: true, duracion: cfg.duracion, ...d }, { "Cache-Control": "no-store" });
  } catch (err) {
    console.error("[disponibilidad] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
