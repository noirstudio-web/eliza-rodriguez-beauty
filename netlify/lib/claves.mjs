/* ==========================================================================
   Contraseñas cifradas con scrypt (clientas y panel de admin).
   Nadie, ni siquiera quien tenga acceso a la base de datos, puede ver la
   contraseña: solo se guarda "scrypt$<sal>$<huella>".
   ========================================================================== */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);
const OPCIONES = { N: 16384, r: 8, p: 1 };

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const h = await scrypt(String(clave), sal, 64, OPCIONES);
  return `scrypt$${sal.toString("base64")}$${h.toString("base64")}`;
}

export async function verificarClave(clave, guardado) {
  if (typeof guardado !== "string" || !guardado.startsWith("scrypt$")) return false;
  const [, s, h] = guardado.split("$");
  const esperado = Buffer.from(h || "", "base64");
  if (!esperado.length) return false;
  const calc = await scrypt(String(clave), Buffer.from(s || "", "base64"), esperado.length, OPCIONES);
  return timingSafeEqual(calc, esperado);
}
