/* ==========================================================================
   POST /api/admin/fotos?nombre=labios — sube una foto desde el panel.
   El panel la reduce y convierte a WebP en el navegador antes de enviarla.
   Se guarda en Netlify Blobs y se sirve en /fotos/<archivo>.
   ========================================================================== */
import { getStore } from "@netlify/blobs";
import { json, isAdmin, denied } from "../lib/shared.mjs";

export const config = { path: "/api/admin/fotos" };

const TIPOS = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export default async (req) => {
  if (!isAdmin(req)) return denied();
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" }, { Allow: "POST" });

  const tipo = (req.headers.get("content-type") || "").split(";")[0].trim();
  const ext = TIPOS[tipo];
  if (!ext) return json(415, { ok: false, error: "Formato no permitido (usa JPG, PNG o WebP)" });

  const datos = await req.arrayBuffer();
  if (!datos.byteLength) return json(400, { ok: false, error: "Archivo vacío" });
  if (datos.byteLength > MAX_BYTES) return json(413, { ok: false, error: "La foto pesa más de 3 MB" });

  const nombre = (new URL(req.url).searchParams.get("nombre") || "foto")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
  const clave = `${Date.now().toString(36)}-${nombre}.${ext}`;

  try {
    const store = getStore("fotos");
    await store.set(clave, datos, { metadata: { tipo } });
    return json(201, { ok: true, url: `/fotos/${clave}` });
  } catch (err) {
    console.error("[admin-fotos] error:", err);
    return json(500, { ok: false, error: "No se pudo guardar la foto" });
  }
};
