/* ==========================================================================
   Programa de fidelidad y cuentas de clientas
   - Niveles: Essential → Glow → Gold → VIP → Luxury (por visitas y consumo)
   - Tarjeta de sellos: 1 sello por visita; al completar N, un regalo
   - La cuenta se crea sola cuando la clienta suma 2 visitas ("Asistió")
   - Contraseñas cifradas con scrypt; sesiones con token aleatorio (se guarda
     solo su huella SHA-256 en la base de datos)
   ========================================================================== */
import { randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { sendMail, plantilla, siteUrl } from "./shared.mjs";

const scrypt = promisify(_scrypt);

export const VISITAS_PARA_CUENTA = 2;
export const DIAS_TOKEN = 7;     // validez del enlace para crear/recuperar contraseña
export const DIAS_SESION = 30;   // duración de la sesión iniciada

export const FIDELIDAD_DEFAULT = {
  niveles: [
    { nombre: "Essential", descripcion: "Clientas nuevas, desde su primera visita", visitas: 1, consumo: 0, regla: "o" },
    { nombre: "Glow", descripcion: "Clientas que regresan (3 o más visitas)", visitas: 3, consumo: 0, regla: "o" },
    { nombre: "Gold", descripcion: "Clientas frecuentes", visitas: 6, consumo: 0, regla: "o" },
    { nombre: "VIP", descripcion: "Clientas fieles con alto consumo", visitas: 10, consumo: 2000000, regla: "o" },
    { nombre: "Luxury", descripcion: "Las mejores clientas, nivel exclusivo", visitas: 15, consumo: 4000000, regla: "y" },
  ],
  sellos: 10,
  premio: "Una limpieza facial de regalo",
};

/** Configuración vigente (la del panel, o la de fábrica). */
export async function cargarConfig(sql) {
  const [f] = await sql`SELECT valor FROM contenido WHERE clave = 'fidelidad'`;
  const v = f?.valor || {};
  return {
    niveles: Array.isArray(v.niveles) && v.niveles.length === 5 ? v.niveles : FIDELIDAD_DEFAULT.niveles,
    sellos: Number(v.sellos) >= 2 ? Number(v.sellos) : FIDELIDAD_DEFAULT.sellos,
    premio: v.premio || FIDELIDAD_DEFAULT.premio,
  };
}

const cumple = (n, visitas, consumo) =>
  n.regla === "y"
    ? visitas >= n.visitas && consumo >= n.consumo
    : visitas >= n.visitas || (n.consumo > 0 && consumo >= n.consumo);

/** Nivel actual, siguiente nivel y cuánto falta para llegar. */
export function nivelDe(visitas, consumo, cfg) {
  let idx = 0;
  cfg.niveles.forEach((n, i) => { if (cumple(n, visitas, consumo)) idx = i; });
  const actual = { ...cfg.niveles[idx], indice: idx };
  const sig = cfg.niveles[idx + 1];
  const siguiente = sig && {
    nombre: sig.nombre,
    regla: sig.regla,
    faltanVisitas: Math.max(0, sig.visitas - visitas),
    faltaConsumo: sig.consumo > 0 ? Math.max(0, sig.consumo - consumo) : 0,
    progreso: Math.min(1, Math.max(visitas / (sig.visitas || 1), sig.consumo > 0 ? consumo / sig.consumo : 0)),
  };
  return { actual, siguiente: siguiente || null };
}

/** Visitas, consumo y sellos de una clienta (por su correo). */
export async function resumen(sql, correo, clientaId, cfg) {
  const [r] = await sql`
    SELECT count(*) FILTER (WHERE estado = 'atendida')::int AS visitas,
           coalesce(sum(valor_pagado) FILTER (WHERE estado = 'atendida'), 0)::bigint AS consumo,
           to_char(max(fecha) FILTER (WHERE estado = 'atendida'), 'YYYY-MM-DD') AS ultima
    FROM reservas WHERE correo = ${correo}`;
  let usados = 0, canjes = 0;
  if (clientaId) {
    const [c] = await sql`SELECT coalesce(sum(sellos_usados), 0)::int AS usados, count(*)::int AS canjes FROM canjes WHERE clienta_id = ${clientaId}`;
    usados = c.usados; canjes = c.canjes;
  }
  const visitas = r.visitas, consumo = Number(r.consumo);
  const sellos = Math.max(0, visitas - usados);
  return {
    visitas,
    consumo,
    ultimaVisita: r.ultima,
    sellos,
    sellosMeta: cfg.sellos,
    premioListo: sellos >= cfg.sellos,
    premiosCanjeados: canjes,
    ...nivelDe(visitas, consumo, cfg),
  };
}

/* ---------------- Contraseñas y sesiones ---------------- */
export async function hashClave(clave) {
  const sal = randomBytes(16);
  const h = await scrypt(clave, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString("base64")}$${h.toString("base64")}`;
}
export async function verificarClave(clave, guardado) {
  if (!guardado?.startsWith("scrypt$")) return false;
  const [, s, h] = guardado.split("$");
  const esperado = Buffer.from(h, "base64");
  const calc = await scrypt(clave, Buffer.from(s, "base64"), esperado.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(calc, esperado);
}
export const huella = (token) => createHash("sha256").update(token).digest("hex");

export async function crearSesion(sql, clientaId) {
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO sesiones (token_hash, clienta_id, expira_en)
            VALUES (${huella(token)}, ${clientaId}, now() + make_interval(days => ${DIAS_SESION}))`;
  await sql`DELETE FROM sesiones WHERE expira_en < now()`; // limpieza de sesiones vencidas
  return token;
}

/** Clienta de la sesión (cabecera Authorization: Bearer <token>) o null. */
export async function clientaDeSesion(sql, req) {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (token.length < 20) return null;
  const [c] = await sql`
    SELECT c.* FROM sesiones s JOIN clientas c ON c.id = s.clienta_id
    WHERE s.token_hash = ${huella(token)} AND s.expira_en > now()`;
  return c || null;
}

/* ---------------- Enlaces de acceso (crear / recuperar contraseña) ---------------- */
export async function nuevoEnlace(sql, clientaId) {
  const token = randomUUID();
  await sql`UPDATE clientas SET token_acceso = ${token}, token_expira = now() + make_interval(days => ${DIAS_TOKEN}) WHERE id = ${clientaId}`;
  return `${siteUrl()}/cuenta/?t=${token}`;
}

export function correoAcceso(clienta, url, tipo = "bienvenida") {
  const nombre = clienta.nombre.split(" ")[0];
  const bienvenida = tipo === "bienvenida";
  return sendMail({
    to: clienta.correo,
    subject: bienvenida ? "¡Bienvenida al club de clientas de Eliza Rodriguez Beauty!" : "Crea una nueva contraseña · Eliza Rodriguez Beauty",
    html: plantilla({
      titulo: bienvenida ? `${nombre}, ya tienes tu cuenta` : "Nueva contraseña",
      intro: bienvenida
        ? "Gracias por volver. Ahora tienes una cuenta de clienta donde puedes ver tu nivel de fidelidad, tus visitas y tu tarjeta de sellos. Solo falta crear tu contraseña."
        : "Recibimos una solicitud para crear una nueva contraseña. Si no fuiste tú, ignora este correo.",
      filas: [["Usuario", clienta.correo]],
      boton: { texto: bienvenida ? "Crear mi contraseña" : "Crear nueva contraseña", url },
      nota: `El enlace vence en ${DIAS_TOKEN} días.`,
    }),
  });
}

/**
 * Después de marcar "Asistió": si la clienta ya suma 2 visitas y no tiene cuenta,
 * se le crea una y se le envía el enlace para crear su contraseña.
 * Devuelve { creada, url } o null.
 */
export async function asegurarCuenta(sql, correo) {
  const [{ visitas }] = await sql`SELECT count(*)::int AS visitas FROM reservas WHERE correo = ${correo} AND estado = 'atendida'`;
  if (visitas < VISITAS_PARA_CUENTA) return null;
  const [existe] = await sql`SELECT id FROM clientas WHERE correo = ${correo}`;
  if (existe) return null;
  const [ultima] = await sql`SELECT nombre, whatsapp FROM reservas WHERE correo = ${correo} ORDER BY creada_en DESC LIMIT 1`;
  const [c] = await sql`
    INSERT INTO clientas (correo, nombre, whatsapp) VALUES (${correo}, ${ultima.nombre}, ${ultima.whatsapp})
    ON CONFLICT (correo) DO NOTHING RETURNING *`;
  if (!c) return null;
  const url = await nuevoEnlace(sql, c.id);
  await correoAcceso(c, url, "bienvenida");
  return { creada: true, url, nombre: c.nombre, whatsapp: c.whatsapp, correo };
}

/* ---------------- Validación de la configuración (panel) ---------------- */
export function limpiarFidelidad(v) {
  if (!v || typeof v !== "object" || !Array.isArray(v.niveles) || v.niveles.length !== 5) return null;
  const s = (x, m) => String(x ?? "").trim().slice(0, m);
  const n = (x, max) => Math.min(max, Math.max(0, Math.round(Number(x) || 0)));
  const niveles = v.niveles.map((x, i) => ({
    nombre: s(x.nombre, 30) || FIDELIDAD_DEFAULT.niveles[i].nombre,
    descripcion: s(x.descripcion, 160),
    visitas: Math.max(1, n(x.visitas, 1000)),
    consumo: n(x.consumo, 1_000_000_000),
    regla: x.regla === "y" ? "y" : "o",
  }));
  return { niveles, sellos: Math.max(2, n(v.sellos, 100)), premio: s(v.premio, 160) || FIDELIDAD_DEFAULT.premio };
}
