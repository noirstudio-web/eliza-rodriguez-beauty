#!/usr/bin/env node
/* ==========================================================================
   Gestionar cuentas de clientas desde Visual Studio Code (o cualquier terminal)

   Uso:
     npm run clienta -- crear  --nombre "Ana Pérez" --correo ana@mail.com --whatsapp 3001234567 --clave "MiClave123"
     npm run clienta -- clave  --correo ana@mail.com --clave "NuevaClave123"
     npm run clienta -- listar
     npm run clienta -- desactivar --correo ana@mail.com
     npm run clienta -- activar    --correo ana@mail.com

   Si falta algún dato, el script lo pregunta. Si no pones --clave, genera una
   al azar y te la muestra para que se la envíes a la clienta.

   También desde VS Code: Terminal → Run Task → "Clientas: …" (ver .vscode/tasks.json).

   Conexión: usa la variable DATABASE_URL si existe; si no, se la pide a Netlify
   (esta computadora debe tener sesión iniciada con `npx netlify-cli login`).
   La clave de la base de datos nunca se guarda en archivos del proyecto.
   ========================================================================== */
import { execSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit, env } from "node:process";
import { neon } from "@neondatabase/serverless";
import { hashClave } from "../netlify/lib/fidelidad.mjs";

const SITIO = "https://eliza-rodriguez-beauty.netlify.app";

/* ---------- Argumentos ---------- */
const [accion = "ayuda", ...resto] = argv.slice(2);
const args = {};
for (let i = 0; i < resto.length; i++) {
  const m = resto[i].match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] ?? (resto[i + 1] && !resto[i + 1].startsWith("--") ? resto[++i] : "");
}

const rl = createInterface({ input: stdin, output: stdout });
const preguntar = async (campo, texto, { opcional = false } = {}) => {
  let v = (args[campo] ?? "").trim();
  while (!v && stdin.isTTY) {
    v = (await rl.question(`${texto}${opcional ? " (opcional, Enter para omitir)" : ""}: `)).trim();
    if (opcional) break;
  }
  if (!v && !opcional) salir(`Falta el dato: --${campo}`);
  return v;
};
function salir(msg, code = 1) { console.error(`\n✗ ${msg}\n`); rl.close(); exit(code); }
const generarClave = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => c[randomInt(c.length)]).join("");
};
const correoOk = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

/* ---------- Conexión a la base de datos ---------- */
function databaseUrl() {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  try {
    console.log("Conectando con Netlify para obtener la base de datos…");
    const out = execSync("npx --yes netlify-cli@latest env:get DATABASE_URL", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    // Se quitan los códigos de color de la terminal antes de buscar la dirección
    const limpio = out.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
    const url = (limpio.match(/postgres(?:ql)?:\/\/\S+/) || [])[0];
    if (url) return url;
  } catch { /* sigue abajo */ }
  salir("No se pudo obtener DATABASE_URL. Inicia sesión con `npx netlify-cli login` o define la variable DATABASE_URL.");
}

const AYUDA = `
Cuentas de clientas — Eliza Rodriguez Beauty

  npm run clienta -- crear       Crea una cuenta (usuario = correo)
  npm run clienta -- clave       Cambia la contraseña de una clienta
  npm run clienta -- listar      Muestra las cuentas
  npm run clienta -- desactivar  Bloquea una cuenta
  npm run clienta -- activar     Vuelve a habilitar una cuenta

Opciones: --nombre  --correo  --whatsapp  --clave
`;

async function main() {
  if (!["crear", "clave", "listar", "desactivar", "activar"].includes(accion)) { console.log(AYUDA); rl.close(); return; }
  const sql = neon(databaseUrl());

  if (accion === "listar") {
    const filas = await sql`
      SELECT c.nombre, c.correo, c.whatsapp, c.activa, c.clave_hash IS NOT NULL AS con_clave,
             (SELECT count(*) FROM reservas r WHERE r.correo = c.correo AND r.estado = 'atendida')::int AS visitas,
             to_char(c.ultimo_acceso AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') AS ultimo
      FROM clientas c ORDER BY c.creada_en DESC`;
    if (!filas.length) console.log("\nAún no hay cuentas de clientas.\n");
    else console.table(filas.map((f) => ({
      Nombre: f.nombre, Usuario: f.correo, WhatsApp: f.whatsapp || "", Visitas: f.visitas,
      Estado: !f.activa ? "desactivada" : f.con_clave ? "activa" : "sin contraseña", "Último acceso": f.ultimo || "—",
    })));
    rl.close(); return;
  }

  const correo = (await preguntar("correo", "Correo de la clienta (será su usuario)")).toLowerCase();
  if (!correoOk(correo)) salir("El correo no es válido.");

  if (accion === "crear") {
    const [existe] = await sql`SELECT clave_hash FROM clientas WHERE correo = ${correo}`;
    if (existe?.clave_hash) salir(`Ya existe una cuenta con ${correo}. Para cambiar su contraseña: npm run clienta -- clave --correo ${correo}`);
    const [ultima] = await sql`SELECT nombre, whatsapp FROM reservas WHERE correo = ${correo} ORDER BY creada_en DESC LIMIT 1`;
    if (ultima && !args.nombre) console.log(`(Encontré reservas de ${ultima.nombre}; se sumarán sus visitas)`);
    const nombre = args.nombre || (ultima && !stdin.isTTY ? ultima.nombre : "") || (await preguntar("nombre", `Nombre${ultima ? ` [${ultima.nombre}]` : ""}`, { opcional: Boolean(ultima) })) || ultima?.nombre;
    const whatsapp = args.whatsapp || (await preguntar("whatsapp", `WhatsApp${ultima?.whatsapp ? ` [${ultima.whatsapp}]` : ""}`, { opcional: true })) || ultima?.whatsapp || null;
    const clave = args.clave || generarClave();
    if (clave.length < 8) salir("La contraseña debe tener al menos 8 caracteres.");
    await sql`
      INSERT INTO clientas (correo, nombre, whatsapp, clave_hash, clave_creada_en)
      VALUES (${correo}, ${nombre}, ${whatsapp}, ${await hashClave(clave)}, now())
      ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre, whatsapp = coalesce(EXCLUDED.whatsapp, clientas.whatsapp),
        clave_hash = EXCLUDED.clave_hash, clave_creada_en = now(), activa = true, fallos = 0, bloqueada_hasta = NULL`;
    mostrarCredenciales("Cuenta creada", nombre, correo, clave, whatsapp);
  }

  if (accion === "clave") {
    const [c] = await sql`SELECT id, nombre, whatsapp FROM clientas WHERE correo = ${correo}`;
    if (!c) salir(`No existe una cuenta con ${correo}. Créala con: npm run clienta -- crear --correo ${correo}`);
    const clave = args.clave || generarClave();
    if (clave.length < 8) salir("La contraseña debe tener al menos 8 caracteres.");
    await sql`UPDATE clientas SET clave_hash = ${await hashClave(clave)}, clave_creada_en = now(), fallos = 0, bloqueada_hasta = NULL,
              token_acceso = NULL, token_expira = NULL WHERE id = ${c.id}`;
    await sql`DELETE FROM sesiones WHERE clienta_id = ${c.id}`;
    mostrarCredenciales("Contraseña cambiada", c.nombre, correo, clave, c.whatsapp);
  }

  if (accion === "desactivar" || accion === "activar") {
    const activa = accion === "activar";
    const r = await sql`UPDATE clientas SET activa = ${activa} WHERE correo = ${correo} RETURNING id, nombre`;
    if (!r.length) salir(`No existe una cuenta con ${correo}.`);
    if (!activa) await sql`DELETE FROM sesiones WHERE clienta_id = ${r[0].id}`;
    console.log(`\n✓ Cuenta de ${r[0].nombre} ${activa ? "activada" : "desactivada"}.\n`);
  }
  rl.close();
}

function mostrarCredenciales(titulo, nombre, correo, clave, whatsapp) {
  console.log(`\n✓ ${titulo} para ${nombre}\n`);
  console.log(`   Entrar en:   ${SITIO}/cuenta/`);
  console.log(`   Usuario:     ${correo}`);
  console.log(`   Contraseña:  ${clave}\n`);
  if (whatsapp) {
    let n = String(whatsapp).replace(/\D/g, "");
    if (n.length === 10 && n.startsWith("3")) n = "57" + n;
    const msg = `Hola ${String(nombre).split(" ")[0]}, ¡bienvenida al club de clientas de Eliza Rodriguez Beauty! 💛\n\nEntra a ${SITIO}/cuenta/ con:\nUsuario: ${correo}\nContraseña: ${clave}\n\nPuedes cambiar la contraseña desde tu cuenta.`;
    console.log(`   Enviar por WhatsApp (Ctrl + clic):\n   https://wa.me/${n}?text=${encodeURIComponent(msg)}\n`);
  }
}

main().catch((e) => salir(e.message || String(e)));
