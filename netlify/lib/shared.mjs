/* ==========================================================================
   Utilidades compartidas por las funciones de Netlify (netlify/functions)
   ========================================================================== */
import { neon } from "@neondatabase/serverless";
import { createHash, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || "";

/** Cliente SQL de Neon. DATABASE_URL se configura en Netlify → Environment variables. */
export function db() {
  const url = env("DATABASE_URL");
  if (!url) throw new Error("Falta la variable DATABASE_URL");
  return neon(url);
}

/** Dirección pública del sitio (para los enlaces de los correos). */
export const siteUrl = () => (env("SITE_URL") || env("URL") || "https://eliza-rodriguez-beauty.netlify.app").replace(/\/$/, "");

export const ESTADOS = ["pendiente", "confirmada", "cancelada", "atendida", "no_asistio"];
export const HORAS_CANCELACION = 3; // la clienta puede cancelar hasta 3 h antes
export const HORAS_RECORDATORIO = 2; // recordatorio automático 2 h antes

/** Respuesta JSON. */
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
  const expected = env("ADMIN_PASSWORD");
  const header = req.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Respuesta estándar cuando la contraseña no es válida (con pausa anti-fuerza bruta). */
export async function denied() {
  await new Promise((r) => setTimeout(r, 600));
  return json(401, { ok: false, error: "Contraseña incorrecta" });
}

/** Fecha y hora actuales en Colombia. */
export function ahoraColombia() {
  const d = new Date();
  return {
    fecha: d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
    hora: d.toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }),
  };
}

/* ---------------- Formato para correos ---------------- */
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fechaLarga(fecha) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
export function hora12(hora) {
  const [h, m] = String(hora).split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/* ---------------- Correo (Gmail u otro SMTP) ----------------
   Variables: SMTP_USER (correo que envía), SMTP_PASS (contraseña de aplicación),
   opcionales: SMTP_HOST (por defecto smtp.gmail.com), AVISOS_EMAIL (a quién avisar; por
   defecto el mismo SMTP_USER). Si faltan, los correos se omiten sin romper nada. */
let transporter;
export const correoEliza = () => env("AVISOS_EMAIL") || env("SMTP_USER");
export const correoConfigurado = () => Boolean(env("SMTP_USER") && env("SMTP_PASS"));

export async function sendMail({ to, subject, html, replyTo }) {
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  if (!user || !pass || !to) {
    console.log("[correo] sin configurar o sin destinatario; omitido:", subject);
    return false;
  }
  transporter ??= nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  try {
    await transporter.sendMail({
      from: `"Eliza Rodriguez Beauty" <${user}>`,
      to,
      subject,
      html,
      replyTo: replyTo || undefined,
    });
    return true;
  } catch (err) {
    console.error("[correo] error al enviar:", subject, err?.message);
    return false;
  }
}

/** Plantilla HTML de correo con la marca. `filas` = [[etiqueta, valor], ...] */
export function plantilla({ titulo, intro, filas = [], boton, nota }) {
  const tr = filas
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#5A4E46;width:120px;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#2B2420">${esc(v)}</td></tr>`)
    .join("");
  const btn = boton
    ? `<p style="margin:24px 0 8px"><a href="${esc(boton.url)}" style="display:inline-block;background:#B8945A;color:#2B2420;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${esc(boton.texto)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F8F1E7;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border:1px solid #e6d7c2;border-radius:16px;padding:26px 24px">
      <p style="margin:0 0 4px;color:#7E5F30;font-size:12px;letter-spacing:2px;text-transform:uppercase">Eliza Rodriguez Beauty</p>
      <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-weight:normal;color:#2B2420;font-size:24px">${esc(titulo)}</h1>
      <p style="margin:0 0 16px;color:#2B2420;line-height:1.55">${esc(intro)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #eee3d3">${tr}</table>
      ${btn}
      ${nota ? `<p style="margin:16px 0 0;color:#5A4E46;font-size:13px;line-height:1.5">${esc(nota)}</p>` : ""}
    </div>
    <p style="text-align:center;color:#8a7d72;font-size:12px;margin:16px 0 0">Estética avanzada · Bahía Solano, Chocó<br>
    <a href="${esc(siteUrl())}" style="color:#7E5F30">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a></p>
  </div></body></html>`;
}

/* ---------------- Validación del contenido editable ---------------- */
const IMG_OK = /^(\/fotos\/[\w.-]{1,120}|assets\/img\/[\w\/.-]{1,160}(\?v=\d{1,16})?)$/;
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const img = (v) => {
  const s = str(v, 200);
  return IMG_OK.test(s) ? s : "";
};

/** Limpia y valida el valor de cada sección editable. Devuelve null si no es válido. */
export function limpiarContenido(clave, valor) {
  switch (clave) {
    case "textos": {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
      const out = {};
      for (const [k, v] of Object.entries(valor).slice(0, 300)) {
        if (/^[a-z0-9.-]{1,60}$/.test(k)) out[k] = str(v, 2000);
      }
      return out;
    }
    case "fotos": {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
      const out = {};
      for (const [k, v] of Object.entries(valor).slice(0, 50)) {
        if (/^[a-z0-9-]{1,40}$/.test(k) && img(v)) out[k] = img(v);
      }
      return out;
    }
    case "servicios": {
      if (!Array.isArray(valor)) return null;
      return valor.slice(0, 40).map((s, i) => ({
        id: str(s.id, 40).replace(/[^a-z0-9-]/gi, "") || `servicio-${i + 1}`,
        nombre: str(s.nombre, 120),
        descripcion: str(s.descripcion, 400),
        duracion: str(s.duracion, 40),
        precio: str(s.precio, 40),
        imagen: img(s.imagen),
        alt: str(s.alt, 200),
      })).filter((s) => s.nombre);
    }
    case "resultados": {
      if (!Array.isArray(valor)) return null;
      return valor.slice(0, 40).map((r) => ({
        servicio: str(r.servicio, 60),
        antes: img(r.antes),
        despues: img(r.despues),
        nota: str(r.nota, 300),
      })).filter((r) => r.servicio && r.antes && r.despues);
    }
    case "certificaciones":
      return Array.isArray(valor) ? valor.slice(0, 40).map((c) => str(c, 200)).filter(Boolean) : null;
    case "testimonios":
      return Array.isArray(valor)
        ? valor.slice(0, 30).map((t) => ({ nombre: str(t.nombre, 80), servicio: str(t.servicio, 80), texto: str(t.texto, 600) })).filter((t) => t.nombre && t.texto)
        : null;
    default:
      return null;
  }
}
