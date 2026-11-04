/* ==========================================================================
   /api/cuenta/* — cuentas de clientas
   POST /api/cuenta/login      { correo, clave }  → { token }
   GET  /api/cuenta/yo                            → perfil, nivel, sellos, citas
   POST /api/cuenta/salir                         → cierra la sesión
   GET  /api/cuenta/enlace?t=                     → valida enlace de acceso
   POST /api/cuenta/clave      { t, clave }       → crea / cambia la contraseña
   POST /api/cuenta/recuperar  { correo }         → envía enlace nuevo (si existe)
   ========================================================================== */
import { db, json, readJson, fechaLarga, hora12 } from "../lib/shared.mjs";
import {
  cargarConfig, resumen, hashClave, verificarClave, crearSesion, clientaDeSesion,
  huella, nuevoEnlace, correoAcceso,
} from "../lib/fidelidad.mjs";

export const config = { path: "/api/cuenta/*" };

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const correoOk = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export default async (req) => {
  const accion = new URL(req.url).pathname.replace(/^\/api\/cuenta\/?/, "");
  const sql = db();

  try {
    /* ---------- Iniciar sesión ---------- */
    if (accion === "login" && req.method === "POST") {
      const b = await readJson(req);
      const correo = String(b.correo || "").trim().toLowerCase().slice(0, 160);
      const clave = String(b.clave || "").slice(0, 200);
      const [c] = correoOk(correo) ? await sql`SELECT * FROM clientas WHERE correo = ${correo}` : [];
      if (c?.bloqueada_hasta && new Date(c.bloqueada_hasta) > new Date()) {
        return json(429, { ok: false, error: "Demasiados intentos. Intenta de nuevo en 15 minutos." });
      }
      const ok = c?.clave_hash && (await verificarClave(clave, c.clave_hash));
      if (!ok) {
        if (c) {
          await sql`UPDATE clientas SET fallos = fallos + 1,
                    bloqueada_hasta = CASE WHEN fallos + 1 >= 8 THEN now() + interval '15 minutes' ELSE bloqueada_hasta END
                    WHERE id = ${c.id}`;
        }
        await pausa(700);
        const sinClave = c && !c.clave_hash;
        return json(401, {
          ok: false,
          error: sinClave ? "Aún no has creado tu contraseña. Usa “¿Olvidaste tu contraseña?” para recibir el enlace." : "Correo o contraseña incorrectos.",
        });
      }
      await sql`UPDATE clientas SET fallos = 0, bloqueada_hasta = NULL, ultimo_acceso = now() WHERE id = ${c.id}`;
      return json(200, { ok: true, token: await crearSesion(sql, c.id), nombre: c.nombre.split(" ")[0] });
    }

    /* ---------- Mi cuenta ---------- */
    if (accion === "yo" && req.method === "GET") {
      const c = await clientaDeSesion(sql, req);
      if (!c) return json(401, { ok: false, error: "Sesión vencida" });
      const cfg = await cargarConfig(sql);
      const r = await resumen(sql, c.correo, c.id, cfg);
      const citas = await sql`
        SELECT servicio, estado, to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora, cancel_token
        FROM reservas WHERE correo = ${c.correo}
        ORDER BY fecha DESC, hora DESC LIMIT 50`;
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      return json(200, {
        ok: true,
        clienta: { nombre: c.nombre, correo: c.correo, desde: c.creada_en },
        ...r,
        premio: cfg.premio,
        niveles: cfg.niveles.map(({ nombre, descripcion }) => ({ nombre, descripcion })),
        citas: citas.map((x) => ({
          servicio: x.servicio,
          estado: x.estado,
          fecha: fechaLarga(x.fecha),
          hora: hora12(x.hora),
          proxima: x.fecha >= hoy && ["pendiente", "confirmada"].includes(x.estado),
          cancelar: x.fecha >= hoy && ["pendiente", "confirmada"].includes(x.estado) ? x.cancel_token : null,
        })),
      });
    }

    /* ---------- Cerrar sesión ---------- */
    if (accion === "salir" && req.method === "POST") {
      const h = req.headers.get("authorization") || "";
      if (h.startsWith("Bearer ")) await sql`DELETE FROM sesiones WHERE token_hash = ${huella(h.slice(7))}`;
      return json(200, { ok: true });
    }

    /* ---------- Validar enlace de acceso ---------- */
    if (accion === "enlace" && req.method === "GET") {
      const t = String(new URL(req.url).searchParams.get("t") || "");
      if (!TOKEN.test(t)) return json(404, { ok: false, error: "Enlace no válido" });
      const [c] = await sql`SELECT nombre, correo, clave_hash IS NOT NULL AS tiene FROM clientas WHERE token_acceso = ${t} AND token_expira > now()`;
      if (!c) return json(404, { ok: false, error: "El enlace venció o ya se usó. Pide uno nuevo." });
      return json(200, { ok: true, nombre: c.nombre.split(" ")[0], correo: c.correo, nueva: !c.tiene });
    }

    /* ---------- Crear / cambiar contraseña ---------- */
    if (accion === "clave" && req.method === "POST") {
      const b = await readJson(req);
      const t = String(b.t || "");
      const clave = String(b.clave || "");
      if (!TOKEN.test(t)) return json(404, { ok: false, error: "Enlace no válido" });
      if (clave.length < 8 || clave.length > 200) return json(400, { ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
      const [c] = await sql`SELECT id, correo, nombre FROM clientas WHERE token_acceso = ${t} AND token_expira > now()`;
      if (!c) return json(404, { ok: false, error: "El enlace venció o ya se usó. Pide uno nuevo." });
      if (clave.toLowerCase().includes(c.correo.split("@")[0]) && c.correo.split("@")[0].length >= 4) {
        return json(400, { ok: false, error: "La contraseña no puede contener tu correo." });
      }
      await sql`UPDATE clientas SET clave_hash = ${await hashClave(clave)}, clave_creada_en = now(),
                token_acceso = NULL, token_expira = NULL, fallos = 0, bloqueada_hasta = NULL, ultimo_acceso = now()
                WHERE id = ${c.id}`;
      await sql`DELETE FROM sesiones WHERE clienta_id = ${c.id}`; // cierra sesiones anteriores
      return json(200, { ok: true, token: await crearSesion(sql, c.id), nombre: c.nombre.split(" ")[0] });
    }

    /* ---------- Recuperar contraseña ---------- */
    if (accion === "recuperar" && req.method === "POST") {
      const b = await readJson(req);
      const correo = String(b.correo || "").trim().toLowerCase().slice(0, 160);
      if (correoOk(correo)) {
        const [c] = await sql`SELECT * FROM clientas WHERE correo = ${correo}`;
        if (c) {
          const url = await nuevoEnlace(sql, c.id);
          await correoAcceso(c, url, c.clave_hash ? "recuperar" : "bienvenida");
        }
      }
      await pausa(500);
      // Misma respuesta exista o no la cuenta (no revela quién es clienta)
      return json(200, { ok: true, mensaje: "Si ese correo tiene una cuenta, te enviamos un enlace para crear tu contraseña." });
    }

    return json(404, { ok: false, error: "No encontrado" });
  } catch (err) {
    console.error("[cuenta] error:", accion, err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
