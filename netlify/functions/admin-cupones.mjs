/* ==========================================================================
   /api/admin/cupones — cupones de descuento (panel de Eliza)
   GET                                     → cupones con cuántos se han usado
   POST { accion: "crear", titulo, tipo, valor, alcance, nivel?, correo?, vence?, prefijo?, descripcion? }
   POST { accion: "validar", codigo }      → de quién es, cuánto descuenta, si está vigente
   POST { accion: "usar", codigo, nota? }  → lo marca como usado (al cobrar)
   POST { accion: "activar" | "desactivar" | "eliminar", id }
   ========================================================================== */
import { db, json, readJson, isAdmin, denied } from "../lib/shared.mjs";
import { cargarConfig } from "../lib/fidelidad.mjs";
import { textoDescuento, validarCodigo } from "../lib/cupones.mjs";

export const config = { path: "/api/admin/cupones" };

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const limpiarCodigo = (c) => String(c || "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 30);

export default async (req) => {
  if (!(await isAdmin(req))) return denied();
  const sql = db();

  try {
    if (req.method === "GET") {
      const cupones = await sql`
        SELECT c.id, c.prefijo, c.titulo, c.descripcion, c.tipo, c.valor, c.alcance, c.nivel, c.activo,
               to_char(c.vence, 'YYYY-MM-DD') AS vence, c.creado_en,
               cl.nombre AS clienta_nombre, cl.correo AS clienta_correo,
               (SELECT count(*) FROM cupon_codigos k WHERE k.cupon_id = c.id)::int AS entregados,
               (SELECT count(*) FROM cupon_codigos k WHERE k.cupon_id = c.id AND k.usado_en IS NOT NULL)::int AS usados
        FROM cupones c LEFT JOIN clientas cl ON cl.id = c.clienta_id
        ORDER BY c.activo DESC, c.creado_en DESC`;
      const cfg = await cargarConfig(sql);
      return json(200, {
        ok: true,
        hoy: hoy(),
        niveles: cfg.niveles.map((n) => n.nombre),
        cupones: cupones.map((c) => ({ ...c, descuento: textoDescuento(c), vencido: Boolean(c.vence && c.vence < hoy()) })),
      });
    }

    if (req.method !== "POST") return json(405, { ok: false, error: "Método no permitido" });
    const b = await readJson(req);

    /* ----- Crear ----- */
    if (b.accion === "crear") {
      const titulo = String(b.titulo || "").trim().slice(0, 80);
      const descripcion = String(b.descripcion || "").trim().slice(0, 300) || null;
      const tipo = b.tipo === "valor" ? "valor" : "porcentaje";
      const valor = Math.round(Number(String(b.valor ?? "").replace(/[^\d]/g, "")));
      const alcance = ["todas", "nivel", "clienta"].includes(b.alcance) ? b.alcance : "todas";
      const vence = String(b.vence || "").trim() || null;
      if (!titulo) return json(400, { ok: false, error: "Escribe un nombre para el cupón (ej. “10 % en limpieza facial”)." });
      if (!valor || valor < 1) return json(400, { ok: false, error: "Escribe el valor del descuento." });
      if (tipo === "porcentaje" && valor > 100) return json(400, { ok: false, error: "El porcentaje no puede ser mayor a 100." });
      if (tipo === "valor" && valor > 10_000_000) return json(400, { ok: false, error: "Valor de descuento demasiado alto." });
      if (vence && (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || vence < hoy())) return json(400, { ok: false, error: "La fecha de vencimiento debe ser hoy o una fecha futura." });

      let nivel = null, clientaIds = [null];
      if (alcance === "nivel") {
        const cfg = await cargarConfig(sql);
        nivel = cfg.niveles.map((n) => n.nombre).find((n) => n === b.nivel);
        if (!nivel) return json(400, { ok: false, error: "Elige el nivel." });
      }
      if (alcance === "clienta") {
        // Una o varias clientas elegidas en el panel (se acepta también `correo` suelto)
        const lista = Array.isArray(b.correos) ? b.correos : [b.correo];
        const correos = [...new Set(lista.map((c) => String(c || "").trim().toLowerCase().slice(0, 160)).filter(Boolean))].slice(0, 500);
        if (!correos.length) return json(400, { ok: false, error: "Elige al menos una clienta." });
        const filas = await sql`SELECT id, correo FROM clientas WHERE correo = ANY(${correos})`;
        const faltan = correos.filter((c) => !filas.some((f) => f.correo === c));
        if (faltan.length) return json(400, { ok: false, error: `Sin cuenta: ${faltan.slice(0, 3).join(", ")}${faltan.length > 3 ? "…" : ""}. Créales una primero (pestaña Clientas).` });
        clientaIds = filas.map((f) => f.id);
      }
      // Prefijo del código: el que escriba Eliza o uno a partir del nombre (ej. "10 % limpieza" → "LIMPIEZA10")
      let prefijo = String(b.prefijo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      if (prefijo.length < 2) {
        const palabra = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(" ").filter((w) => w.length > 3)[0] || "DESC";
        prefijo = (palabra.slice(0, 8) + valor).slice(0, 12);
      }
      // Para "clientas que yo elija" se crea un cupón por clienta (cada una ve solo el suyo)
      const nuevos = await sql`
        INSERT INTO cupones (prefijo, titulo, descripcion, tipo, valor, alcance, nivel, clienta_id, vence)
        SELECT ${prefijo}, ${titulo}, ${descripcion}, ${tipo}, ${valor}, ${alcance}, ${nivel}, x, ${vence}::date
        FROM unnest(${clientaIds}::bigint[]) AS x
        RETURNING id, prefijo`;
      return json(201, { ok: true, cupon: nuevos[0], creados: nuevos.length });
    }

    /* ----- Validar / usar ----- */
    if (b.accion === "validar" || b.accion === "usar") {
      const codigo = limpiarCodigo(b.codigo);
      if (codigo.length < 5) return json(400, { ok: false, error: "Escribe el código completo." });
      const info = await validarCodigo(sql, codigo);
      if (!info) return json(404, { ok: false, error: "Ese código no existe. Revisa que esté bien escrito." });
      if (b.accion === "validar") return json(200, { ok: true, cupon: info });
      if (info.estado !== "valido") return json(409, { ok: false, error: "Este cupón no se puede usar (" + info.estado.replace("_", " ") + ").", cupon: info });
      const nota = String(b.nota || "").trim().slice(0, 160) || null;
      await sql`UPDATE cupon_codigos SET usado_en = now(), nota_uso = ${nota} WHERE codigo = ${codigo} AND usado_en IS NULL`;
      return json(200, { ok: true, cupon: await validarCodigo(sql, codigo) });
    }

    /* ----- Activar / desactivar / eliminar ----- */
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 1) return json(400, { ok: false, error: "Cupón inválido" });
    if (b.accion === "activar" || b.accion === "desactivar") {
      await sql`UPDATE cupones SET activo = ${b.accion === "activar"} WHERE id = ${id}`;
      return json(200, { ok: true });
    }
    if (b.accion === "eliminar") {
      await sql`DELETE FROM cupones WHERE id = ${id}`;
      return json(200, { ok: true });
    }
    return json(400, { ok: false, error: "Acción no válida" });
  } catch (err) {
    console.error("[admin-cupones] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
