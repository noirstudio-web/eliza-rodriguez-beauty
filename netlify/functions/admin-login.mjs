/* ==========================================================================
   /api/admin/sesion — entrar y salir del panel de admin
   POST   { usuario, clave } → { token }   (sesión de 12 horas)
   DELETE                    → cierra la sesión actual
   Bloqueo: 8 intentos fallidos desde la misma conexión en 15 minutos.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { db, json, readJson, credencialesAdmin, huellaToken, HORAS_SESION_ADMIN } from "../lib/shared.mjs";

export const config = { path: "/api/admin/sesion" };

const MAX_FALLOS = 8;

export default async (req, context) => {
  const sql = db();
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida";

  if (req.method === "POST") {
    const [{ fallos }] = await sql`SELECT count(*)::int AS fallos FROM admin_fallos WHERE ip = ${ip} AND creado_en > now() - interval '15 minutes'`;
    if (fallos >= MAX_FALLOS) {
      return json(429, { ok: false, error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." });
    }
    const b = await readJson(req);
    if (!credencialesAdmin(b.usuario, b.clave)) {
      await sql`INSERT INTO admin_fallos (ip) VALUES (${ip})`;
      await new Promise((r) => setTimeout(r, 700));
      const quedan = MAX_FALLOS - fallos - 1;
      return json(401, { ok: false, error: quedan <= 3 && quedan > 0 ? `Usuario o contraseña incorrectos. Te quedan ${quedan} intentos.` : "Usuario o contraseña incorrectos." });
    }
    const token = randomBytes(32).toString("base64url");
    await sql`INSERT INTO admin_sesiones (token_hash, usuario, expira_en)
              VALUES (${huellaToken(token)}, ${String(b.usuario).trim().toLowerCase()}, now() + make_interval(hours => ${HORAS_SESION_ADMIN}))`;
    // Limpieza: sesiones vencidas e intentos viejos
    await sql`DELETE FROM admin_sesiones WHERE expira_en < now()`;
    await sql`DELETE FROM admin_fallos WHERE creado_en < now() - interval '1 day' OR ip = ${ip}`;
    return json(200, { ok: true, token, horas: HORAS_SESION_ADMIN });
  }

  if (req.method === "DELETE") {
    const h = req.headers.get("authorization") || "";
    if (h.startsWith("Bearer ")) await sql`DELETE FROM admin_sesiones WHERE token_hash = ${huellaToken(h.slice(7))}`;
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: "Método no permitido" }, { Allow: "POST, DELETE" });
};
