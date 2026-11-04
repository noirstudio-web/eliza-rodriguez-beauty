/* ==========================================================================
   /api/admin/contenido — guardar una sección editable desde el panel.
   PUT    { clave, valor } → guarda (textos, servicios, resultados, fotos…)
   DELETE { clave }        → vuelve a los valores por defecto del sitio
   ========================================================================== */
import { db, json, readJson, isAdmin, denied, limpiarContenido } from "../lib/shared.mjs";

export const config = { path: "/api/admin/contenido" };

export default async (req) => {
  if (!isAdmin(req)) return denied();
  const b = await readJson(req);
  const clave = String(b.clave || "");
  const sql = db();

  try {
    if (req.method === "PUT") {
      const valor = limpiarContenido(clave, b.valor);
      if (valor === null) return json(400, { ok: false, error: "Datos inválidos" });
      const texto = JSON.stringify(valor);
      if (texto.length > 300_000) return json(413, { ok: false, error: "Demasiado contenido" });
      await sql`
        INSERT INTO contenido (clave, valor, actualizado_en) VALUES (${clave}, ${texto}::jsonb, now())
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`;
      return json(200, { ok: true, clave, valor });
    }

    if (req.method === "DELETE") {
      if (limpiarContenido(clave, clave === "textos" || clave === "fotos" ? {} : []) === null) {
        return json(400, { ok: false, error: "Sección inválida" });
      }
      await sql`DELETE FROM contenido WHERE clave = ${clave}`;
      return json(200, { ok: true, clave });
    }

    return json(405, { ok: false, error: "Método no permitido" }, { Allow: "PUT, DELETE" });
  } catch (err) {
    console.error("[admin-contenido] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
