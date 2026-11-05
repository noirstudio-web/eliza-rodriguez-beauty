/* ==========================================================================
   /api/admin/contenido — guardar una sección editable desde el panel.
   PUT    { clave, valor } → guarda (textos, servicios, resultados, fotos…)
   DELETE { clave }        → vuelve a los valores por defecto del sitio
   GET    ?clave=agenda    → configuración de la agenda (solo el panel: incluye notas privadas)
   ========================================================================== */
import { db, json, readJson, isAdmin, denied, limpiarContenido } from "../lib/shared.mjs";
import { limpiarFidelidad } from "../lib/fidelidad.mjs";
import { limpiarAgenda, cargarAgenda } from "../lib/agenda.mjs";

const PROPIAS = { fidelidad: limpiarFidelidad, agenda: limpiarAgenda };
const limpiar = (clave, valor) => (PROPIAS[clave] ? PROPIAS[clave](valor) : limpiarContenido(clave, valor));

export const config = { path: "/api/admin/contenido" };

export default async (req) => {
  if (!(await isAdmin(req))) return denied();
  const sql = db();

  if (req.method === "GET") {
    if (new URL(req.url).searchParams.get("clave") !== "agenda") return json(400, { ok: false, error: "Sección inválida" });
    try { return json(200, { ok: true, clave: "agenda", valor: await cargarAgenda(sql) }); }
    catch (err) { console.error("[admin-contenido] error:", err); return json(500, { ok: false, error: "Error del servidor" }); }
  }

  const b = await readJson(req);
  const clave = String(b.clave || "");

  try {
    if (req.method === "PUT") {
      const valor = limpiar(clave, b.valor);
      if (valor === null) return json(400, { ok: false, error: "Datos inválidos" });
      const texto = JSON.stringify(valor);
      if (texto.length > 300_000) return json(413, { ok: false, error: "Demasiado contenido" });
      await sql`
        INSERT INTO contenido (clave, valor, actualizado_en) VALUES (${clave}, ${texto}::jsonb, now())
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`;
      return json(200, { ok: true, clave, valor });
    }

    if (req.method === "DELETE") {
      if (!PROPIAS[clave] && limpiarContenido(clave, clave === "textos" || clave === "fotos" ? {} : []) === null) {
        return json(400, { ok: false, error: "Sección inválida" });
      }
      await sql`DELETE FROM contenido WHERE clave = ${clave}`;
      return json(200, { ok: true, clave });
    }

    return json(405, { ok: false, error: "Método no permitido" }, { Allow: "GET, PUT, DELETE" });
  } catch (err) {
    console.error("[admin-contenido] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
