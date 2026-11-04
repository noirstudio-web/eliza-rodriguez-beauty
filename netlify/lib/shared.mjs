/* ==========================================================================
   Utilidades compartidas por las funciones de Netlify (netlify/functions)
   ========================================================================== */
import { neon } from "@neondatabase/serverless";
import { createHash, timingSafeEqual } from "node:crypto";

/** Cliente SQL de Neon. DATABASE_URL se configura en Netlify → Project configuration → Environment variables. */
export function db() {
  const url = Netlify.env.get("DATABASE_URL");
  if (!url) throw new Error("Falta la variable DATABASE_URL");
  return neon(url);
}

export const ESTADOS = ["pendiente", "confirmada", "cancelada", "atendida"];

/** Respuesta JSON sin caché. */
export function json(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

/** Lee el cuerpo JSON sin romper si viene vacío o mal formado. */
export async function readJson(req) {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

/** Compara la contraseña del panel en tiempo constante. */
export function isAdmin(req) {
  const expected = Netlify.env.get("ADMIN_PASSWORD") || "";
  const header = req.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Fecha de hoy en Colombia, formato AAAA-MM-DD. */
export function hoyColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
