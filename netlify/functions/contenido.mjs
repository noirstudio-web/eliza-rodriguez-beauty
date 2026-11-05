/* ==========================================================================
   GET /api/contenido — contenido editable de la página (público).
   Devuelve solo lo que Eliza cambió desde el panel; lo demás usa los textos
   y fotos por defecto del sitio.
   ========================================================================== */
import { db, json } from "../lib/shared.mjs";

export const config = { path: "/api/contenido" };

export default async (req) => {
  if (req.method !== "GET") return json(405, { ok: false, error: "Método no permitido" });
  try {
    const sql = db();
    const filas = await sql`SELECT clave, valor, actualizado_en FROM contenido WHERE clave <> 'agenda'`; // la agenda va por /api/disponibilidad
    const contenido = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    const version = filas.reduce((m, f) => Math.max(m, new Date(f.actualizado_en).getTime()), 0);
    // Caché corta: los cambios del panel se ven en menos de 1 minuto
    return json(200, { ok: true, version, contenido }, { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" });
  } catch (err) {
    console.error("[contenido] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
