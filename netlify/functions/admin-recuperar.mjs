/* ==========================================================================
   /api/admin/recuperar — "¿Olvidaste la contraseña?" del panel de admin
   POST { usuario }          → si el usuario es el del panel, envía un enlace
                               al correo de administración (AVISOS_EMAIL o
                               SMTP_USER). Nunca a un correo que escriba alguien.
   POST { token, clave }     → crea la contraseña nueva, cierra todas las
                               sesiones abiertas y entra al panel.
   - El enlace dura 30 minutos y sirve una sola vez (solo se guarda su huella).
   - Como máximo un correo cada 5 minutos.
   - La respuesta al pedir el enlace es la misma si el usuario existe o no.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import {
  db, json, readJson, sendMail, plantilla, correoEliza, correoConfigurado, siteUrl,
  credencialAdmin, crearSesionAdmin, esUsuarioAdmin, hashClave, huellaEnvAdmin, huellaSimple, HORAS_SESION_ADMIN,
} from "../lib/shared.mjs";

export const config = { path: "/api/admin/recuperar" };

const MINUTOS_ENLACE = 30;
const MINUTOS_ENTRE_CORREOS = 5;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const ocultar = (correo) => String(correo).replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c);

async function guardarCuenta(sql, cuenta) {
  await sql`
    INSERT INTO contenido (clave, valor, actualizado_en) VALUES ('admin_cuenta', ${JSON.stringify(cuenta)}::jsonb, now())
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now()`;
}

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" }, { Allow: "POST" });
  const sql = db();
  const b = await readJson(req);
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida";

  try {
    // Mismo bloqueo que el inicio de sesión: 8 intentos fallidos en 15 minutos
    const [{ fallos }] = await sql`SELECT count(*)::int AS fallos FROM admin_fallos WHERE ip = ${ip} AND creado_en > now() - interval '15 minutes'`;
    if (fallos >= 8) return json(429, { ok: false, error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." });

    /* ---------- 2) Crear la contraseña nueva con el enlace ---------- */
    if (b.token !== undefined) {
      const token = String(b.token || "");
      const clave = String(b.clave || "");
      if (clave.length < 10 || clave.length > 200) return json(400, { ok: false, error: "La contraseña debe tener al menos 10 caracteres." });
      const { cuenta } = await credencialAdmin(sql);
      const vigente = cuenta.reset_hash && cuenta.reset_expira && new Date(cuenta.reset_expira) > new Date();
      if (token.length < 30 || !vigente || huellaSimple(token) !== cuenta.reset_hash) {
        await sql`INSERT INTO admin_fallos (ip) VALUES (${ip})`; // cuenta como intento fallido
        await pausa(700);
        return json(400, { ok: false, error: "El enlace venció o ya se usó. Pide uno nuevo desde “¿Olvidaste la contraseña?”." });
      }
      const nueva = { clave_hash: await hashClave(clave), env_huella: huellaEnvAdmin(), actualizado_en: new Date().toISOString() };
      await guardarCuenta(sql, nueva);
      await sql`DELETE FROM admin_sesiones`; // cierra TODAS las sesiones (también una robada)
      const cred = await credencialAdmin(sql);
      const sesion = await crearSesionAdmin(sql, cred, "admin");

      const aviso = sendMail({
        to: correoEliza(),
        subject: "Se cambió la contraseña del panel de admin",
        html: plantilla({
          titulo: "Contraseña del panel cambiada",
          intro: "La contraseña del panel de Eliza Rodriguez Beauty se acaba de cambiar con el enlace de recuperación. Todas las sesiones anteriores se cerraron.",
          filas: [["Conexión (IP)", ip], ["Hora", new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })]],
          nota: "Si no fuiste tú, pide otro enlace desde “¿Olvidaste la contraseña?” en el panel y crea una contraseña nueva de inmediato.",
        }),
      });
      if (context?.waitUntil) context.waitUntil(aviso); else await aviso;
      return json(200, { ok: true, token: sesion, horas: HORAS_SESION_ADMIN });
    }

    /* ---------- 1) Pedir el enlace ---------- */
    const usuario = String(b.usuario || "").slice(0, 200);
    if (!correoConfigurado() || !correoEliza()) {
      return json(503, { ok: false, error: "El envío de correos no está configurado (SMTP_USER y SMTP_PASS en Netlify). Pídele ayuda a quien administra la web." });
    }
    const respuesta = json(200, {
      ok: true,
      mensaje: `Si el usuario es correcto, en unos minutos llegará un enlace al correo de administración (${ocultar(correoEliza())}) para crear una contraseña nueva. Revisa también la carpeta de spam.`,
    });
    await pausa(500);
    if (!esUsuarioAdmin(usuario)) {
      await sql`INSERT INTO admin_fallos (ip) VALUES (${ip})`;
      return respuesta;
    }
    const { cuenta } = await credencialAdmin(sql);
    const reciente = cuenta.reset_enviado_en && Date.now() - new Date(cuenta.reset_enviado_en).getTime() < MINUTOS_ENTRE_CORREOS * 60000;
    if (reciente) return respuesta;

    const token = randomBytes(32).toString("base64url");
    await guardarCuenta(sql, {
      ...cuenta,
      reset_hash: huellaSimple(token),
      reset_expira: new Date(Date.now() + MINUTOS_ENLACE * 60000).toISOString(),
      reset_enviado_en: new Date().toISOString(),
    });
    const url = `${siteUrl()}/admin/?restablecer=${token}`;
    const envio = sendMail({
      to: correoEliza(),
      subject: "Crea una nueva contraseña para el panel de admin",
      html: plantilla({
        titulo: "Nueva contraseña del panel",
        intro: "Alguien pidió restablecer la contraseña del panel de Eliza Rodriguez Beauty. Si fuiste tú, usa el botón para crear una nueva.",
        filas: [["Conexión (IP)", ip], ["Hora", new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })]],
        boton: { texto: "Crear nueva contraseña", url },
        nota: `El enlace vence en ${MINUTOS_ENLACE} minutos y sirve una sola vez. Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.`,
      }),
    });
    if (context?.waitUntil) context.waitUntil(envio); else await envio;
    return respuesta;
  } catch (err) {
    console.error("[admin-recuperar] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
