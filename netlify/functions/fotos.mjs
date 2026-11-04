/* ==========================================================================
   GET /fotos/<archivo> — sirve las fotos subidas desde el panel.
   Cada archivo tiene un nombre único, así que se puede guardar en caché
   para siempre (si Eliza cambia una foto, se crea un archivo nuevo).
   ========================================================================== */
import { getStore } from "@netlify/blobs";

export const config = { path: "/fotos/*" };

export default async (req) => {
  const clave = decodeURIComponent(new URL(req.url).pathname.replace(/^\/fotos\//, ""));
  if (!/^[\w.-]{1,120}$/.test(clave)) return new Response("No encontrado", { status: 404 });

  const store = getStore("fotos");
  const foto = await store.getWithMetadata(clave, { type: "arrayBuffer" });
  if (!foto) return new Response("No encontrado", { status: 404 });

  return new Response(foto.data, {
    headers: {
      "Content-Type": foto.metadata?.tipo || "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
