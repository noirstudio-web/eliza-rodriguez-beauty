/* ==========================================================================
   /api/admin/sesion — entrar y salir del panel de admin
   POST   { usuario, clave } → { token }   (sesión de 12 horas)
   DELETE                    → cierra la sesión actual
   Bloqueos:
   - 8 intentos fallidos desde la misma conexión en 15 minutos → esa conexión espera 15 min.
   - 40 intentos fallidos en total (desde cualquier conexión) en 15 minutos → el
     acceso se pausa 15 min para todos (frena ataques repartidos entre muchas IP).
   Cuando una conexión queda bloqueada, se avisa por correo a Eliza.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import {
  db, json, readJson, credencialesAdmin, huellaToken, HORAS_SESION_ADMIN,
  sendMail, plantilla, correoEliza, siteUrl,
} from "../lib/shared.mjs";

export const config = { path: "/api/admin/sesion" };

const MAX_FALLOS = 8;
const MAX_FALLOS_TOTAL = 40;

export default async (req, context) => {
  const sql = db();
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida";

  if (req.method === "POST") {
    const [{ fallos, total }] = await sql`
      SELECT count(*) FILTER (WHERE ip = ${ip})::int AS fallos, count(*)::int AS total
      FROM admin_fallos WHERE creado_en > now() - interval '15 minutes'`;
    if (fallos >= MAX_FALLOS || total >= MAX_FALLOS_TOTAL) {
      await new Promise((r) => setTimeout(r, 700));
      return json(429, { ok: false, error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." });
    }
    const b = await readJson(req);
    if (!credencialesAdmin(String(b.usuario ?? "").slice(0, 200), String(b.clave ?? "").slice(0, 500))) {
      await sql`INSERT INTO admin_fallos (ip) VALUES (${ip})`;
      await new Promise((r) => setTimeout(r, 700));
      const quedan = MAX_FALLOS - fallos - 1;
      if (quedan === 0 || total + 1 === MAX_FALLOS_TOTAL) {
        const aviso = sendMail({
          to: correoEliza(),
          subject: "Aviso de seguridad: intentos fallidos en el panel de admin",
          html: plantilla({
            titulo: "Se bloqueó un intento de entrar al panel",
            intro: quedan === 0
              ? "Alguien escribió mal el usuario o la contraseña del panel varias veces seguidas. Esa conexión quedó bloqueada 15 minutos."
              : "Hubo muchos intentos fallidos de entrar al panel desde varias conexiones. El acceso quedó pausado 15 minutos.",
            filas: [["Conexión (IP)", ip], ["Hora", new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })]],
            boton: { texto: "Abrir el panel", url: `${siteUrl()}/admin/` },
            nota: "Si no fuiste tú, cambia la contraseña del panel (variable ADMIN_PASSWORD en Netlify) por una larga y difícil de adivinar.",
          }),
        });
        if (context?.waitUntil) context.waitUntil(aviso);
        else await aviso;
      }
      return json(401, { ok: false, error: quedan <= 3 && quedan > 0 ? `Usuario o contraseña incorrectos. Te quedan ${quedan} intentos.` : "Usuario o contraseña incorrectos." });
    }
    const token = randomBytes(32).toString("base64url");
    await sql`INSERT INTO admin_sesiones (token_hash, usuario, expira_en)
              VALUES (${huellaToken(token)}, ${String(b.usuario).trim().toLowerCase().slice(0, 200)}, now() + make_interval(hours => ${HORAS_SESION_ADMIN}))`;
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
