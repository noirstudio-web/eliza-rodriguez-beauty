/* ==========================================================================
   /api/admin/clientas — gestión de clientas y fidelidad desde el panel
   GET                                                 → clientas, sellos, historial y resumen
   POST { accion: "crear", nombre, correo, whatsapp, clave } → crea la cuenta a mano
   POST { accion: "clave",     correo, clave }         → cambia su contraseña
   POST { accion: "enlace",    correo }                → enlace para que ella cree su contraseña
   POST { accion: "canjear",   correo }                → entrega el regalo (descuenta sellos)
   POST { accion: "sellos",    correo, sellos, nota }  → suma o quita sellos a mano (±)
   POST { accion: "activar" | "desactivar", correo }   → habilita o bloquea su cuenta
   POST { accion: "fidelidad", correo, nivel, visitas_previas, consumo_previo } → fidelidad manual
   (al crear también se aceptan nivel, visitas_previas, consumo_previo y sellos_iniciales)
   ========================================================================== */
import { db, json, readJson, isAdmin, denied } from "../lib/shared.mjs";
import { cargarConfig, nivelDe, nuevoEnlace, correoAcceso, hashClave } from "../lib/fidelidad.mjs";

export const config = { path: "/api/admin/clientas" };

const correoOk = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
const claveOk = (c) => typeof c === "string" && c.length >= 8 && c.length <= 200;
const entero = (v, max) => Math.min(max, Math.max(0, Math.round(Number(String(v ?? "").replace(/[^\d]/g, "")) || 0)));

/** Lee y valida los campos de fidelidad manual que envía el panel. */
function leerFidelidad(b, cfg) {
  const nivel = b.nivel && b.nivel !== "auto" ? cfg.niveles.map((n) => n.nombre).find((n) => n === b.nivel) : null;
  if (b.nivel && b.nivel !== "auto" && !nivel) return { error: "Nivel inválido" };
  return {
    nivel,
    visitas: entero(b.visitas_previas, 10000),
    consumo: entero(b.consumo_previo, 10_000_000_000),
    sellos: entero(b.sellos_iniciales, 50),
  };
}

export default async (req) => {
  if (!(await isAdmin(req))) return denied();
  const sql = db();

  try {
    const cfg = await cargarConfig(sql);

    if (req.method === "GET") {
      const filas = await sql`
        WITH base AS (
          SELECT correo,
                 (array_agg(nombre ORDER BY creada_en DESC))[1] AS nombre,
                 (array_agg(whatsapp ORDER BY creada_en DESC))[1] AS whatsapp,
                 count(*) FILTER (WHERE estado = 'atendida')::int AS visitas,
                 count(*) FILTER (WHERE estado = 'no_asistio')::int AS faltas,
                 coalesce(sum(valor_pagado) FILTER (WHERE estado = 'atendida'), 0)::bigint AS consumo,
                 to_char(max(fecha) FILTER (WHERE estado = 'atendida'), 'YYYY-MM-DD') AS ultima
          FROM reservas GROUP BY correo
        )
        SELECT coalesce(c.correo, b.correo) AS correo,
               coalesce(c.nombre, b.nombre) AS nombre,
               coalesce(c.whatsapp, b.whatsapp) AS whatsapp,
               coalesce(b.visitas, 0) AS visitas, coalesce(b.faltas, 0) AS faltas,
               coalesce(b.consumo, 0) AS consumo, b.ultima,
               c.id AS clienta_id, c.clave_hash IS NOT NULL AS con_clave, c.activa, c.ultimo_acceso,
               coalesce(c.visitas_previas, 0) AS visitas_previas, coalesce(c.consumo_previo, 0)::bigint AS consumo_previo, c.nivel_manual,
               coalesce((SELECT sum(sellos_usados) FROM canjes k WHERE k.clienta_id = c.id), 0)::int AS usados,
               coalesce((SELECT sum(sellos) FROM ajustes_sellos a WHERE a.clienta_id = c.id), 0)::int AS ajuste,
               (SELECT count(*) FROM canjes k WHERE k.clienta_id = c.id)::int AS regalos,
               (SELECT coalesce(json_agg(h), '[]') FROM (
                  SELECT * FROM (
                    SELECT 'regalo' AS tipo, creado_en AS fecha, -sellos_usados AS sellos, premio AS nota FROM canjes WHERE clienta_id = c.id
                    UNION ALL
                    SELECT 'ajuste', creado_en, sellos, nota FROM ajustes_sellos WHERE clienta_id = c.id
                  ) u ORDER BY fecha DESC LIMIT 10) h) AS historial
        FROM base b FULL OUTER JOIN clientas c ON c.correo = b.correo
        ORDER BY (c.id IS NOT NULL) DESC, coalesce(b.visitas, 0) DESC, coalesce(b.consumo, 0) DESC`;

      const porNivel = Object.fromEntries(cfg.niveles.map((n) => [n.nombre, 0]));
      const clientas = filas.map((f) => {
        // Totales = lo registrado en el sistema + lo anterior que anotó Eliza
        const visitasTotal = f.visitas + Number(f.visitas_previas || 0);
        const consumo = Number(f.consumo) + Number(f.consumo_previo || 0);
        const n = nivelDe(visitasTotal, consumo, cfg, f.nivel_manual);
        if (f.clienta_id) porNivel[n.actual.nombre] = (porNivel[n.actual.nombre] || 0) + 1;
        return {
          correo: f.correo, nombre: f.nombre, whatsapp: f.whatsapp,
          visitas: visitasTotal, visitasSistema: f.visitas, visitasPrevias: Number(f.visitas_previas || 0),
          consumoPrevio: Number(f.consumo_previo || 0), faltas: f.faltas, consumo, ultima: f.ultima,
          nivel: n.actual.nombre, nivelManual: f.nivel_manual || null, siguiente: n.actual.manual ? null : n.siguiente,
          sellos: Math.max(0, f.visitas + f.ajuste - f.usados), sellosMeta: cfg.sellos, ajuste: f.ajuste,
          regalos: f.regalos, historial: f.historial || [],
          cuenta: !f.clienta_id ? "no" : !f.activa ? "desactivada" : f.con_clave ? "activa" : "sin_clave",
          ultimoAcceso: f.ultimo_acceso,
        };
      });
      const conCuenta = clientas.filter((c) => c.cuenta !== "no");
      const resumen = {
        conCuenta: conCuenta.length,
        sinCuenta: clientas.length - conCuenta.length,
        regalosListos: conCuenta.filter((c) => c.sellos >= c.sellosMeta).length,
        regalosEntregados: conCuenta.reduce((s, c) => s + c.regalos, 0),
        porNivel,
      };
      return json(200, { ok: true, clientas, resumen, config: cfg });
    }

    if (req.method === "POST") {
      const b = await readJson(req);
      const correo = String(b.correo || "").trim().toLowerCase().slice(0, 160);
      if (!correoOk(correo)) return json(400, { ok: false, error: "Correo inválido" });

      /* ----- Crear cuenta a mano ----- */
      if (b.accion === "crear") {
        const nombre = String(b.nombre || "").trim().slice(0, 120);
        const whatsapp = String(b.whatsapp || "").trim().slice(0, 25) || null;
        if (!nombre) return json(400, { ok: false, error: "Escribe el nombre de la clienta" });
        if (!claveOk(b.clave)) return json(400, { ok: false, error: "La contraseña debe tener al menos 8 caracteres" });
        const [existe] = await sql`SELECT id, clave_hash FROM clientas WHERE correo = ${correo}`;
        if (existe?.clave_hash) return json(409, { ok: false, error: "Ya existe una cuenta con ese correo. Usa “Cambiar contraseña”." });
        const fid = leerFidelidad(b, cfg);
        if (fid.error) return json(400, { ok: false, error: fid.error });
        const hash = await hashClave(b.clave);
        const [c] = await sql`
          INSERT INTO clientas (correo, nombre, whatsapp, clave_hash, clave_creada_en, nivel_manual, visitas_previas, consumo_previo)
          VALUES (${correo}, ${nombre}, ${whatsapp}, ${hash}, now(), ${fid.nivel}, ${fid.visitas}, ${fid.consumo})
          ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre, whatsapp = coalesce(EXCLUDED.whatsapp, clientas.whatsapp),
            clave_hash = EXCLUDED.clave_hash, clave_creada_en = now(), activa = true, fallos = 0, bloqueada_hasta = NULL,
            nivel_manual = EXCLUDED.nivel_manual, visitas_previas = EXCLUDED.visitas_previas, consumo_previo = EXCLUDED.consumo_previo
          RETURNING id, nombre, whatsapp, correo`;
        if (fid.sellos > 0) {
          await sql`INSERT INTO ajustes_sellos (clienta_id, sellos, nota) VALUES (${c.id}, ${fid.sellos}, 'Sellos iniciales')`;
        }
        return json(201, { ok: true, clienta: c });
      }

      // Para el resto de acciones: la clienta debe existir (con cuenta o con reservas)
      const [r] = await sql`
        SELECT nombre, whatsapp FROM clientas WHERE correo = ${correo}
        UNION ALL
        (SELECT nombre, whatsapp FROM reservas WHERE correo = ${correo} ORDER BY creada_en DESC LIMIT 1)
        LIMIT 1`;
      if (!r) return json(404, { ok: false, error: "Clienta no encontrada" });
      const cuenta = async () => (await sql`
          INSERT INTO clientas (correo, nombre, whatsapp) VALUES (${correo}, ${r.nombre}, ${r.whatsapp})
          ON CONFLICT (correo) DO UPDATE SET whatsapp = coalesce(clientas.whatsapp, EXCLUDED.whatsapp)
          RETURNING *`)[0];

      if (b.accion === "clave") {
        if (!claveOk(b.clave)) return json(400, { ok: false, error: "La contraseña debe tener al menos 8 caracteres" });
        const c = await cuenta();
        await sql`UPDATE clientas SET clave_hash = ${await hashClave(b.clave)}, clave_creada_en = now(),
                  fallos = 0, bloqueada_hasta = NULL, token_acceso = NULL, token_expira = NULL WHERE id = ${c.id}`;
        await sql`DELETE FROM sesiones WHERE clienta_id = ${c.id}`; // cierra sus sesiones anteriores
        return json(200, { ok: true, clienta: { nombre: c.nombre, whatsapp: c.whatsapp, correo } });
      }

      if (b.accion === "enlace") {
        const c = await cuenta();
        if (!c.activa) return json(400, { ok: false, error: "La cuenta está desactivada. Actívala primero." });
        const url = await nuevoEnlace(sql, c.id);
        const enviado = await correoAcceso(c, url, c.clave_hash ? "recuperar" : "bienvenida");
        return json(200, { ok: true, url, correoEnviado: enviado, nombre: c.nombre, whatsapp: c.whatsapp });
      }

      if (b.accion === "sellos") {
        const n = Math.trunc(Number(b.sellos));
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 50) return json(400, { ok: false, error: "Cantidad de sellos inválida" });
        const c = await cuenta();
        await sql`INSERT INTO ajustes_sellos (clienta_id, sellos, nota) VALUES (${c.id}, ${n}, ${String(b.nota || "").trim().slice(0, 160) || null})`;
        return json(200, { ok: true });
      }

      if (b.accion === "canjear") {
        const c = await cuenta();
        const [{ disponibles }] = await sql`
          SELECT ((SELECT count(*) FROM reservas WHERE correo = ${correo} AND estado = 'atendida')
                 + coalesce((SELECT sum(sellos) FROM ajustes_sellos WHERE clienta_id = ${c.id}), 0)
                 - coalesce((SELECT sum(sellos_usados) FROM canjes WHERE clienta_id = ${c.id}), 0))::int AS disponibles`;
        if (disponibles < cfg.sellos) return json(400, { ok: false, error: "Aún no completa la tarjeta de sellos" });
        await sql`INSERT INTO canjes (clienta_id, sellos_usados, premio) VALUES (${c.id}, ${cfg.sellos}, ${cfg.premio})`;
        return json(200, { ok: true });
      }

      if (b.accion === "fidelidad") {
        const fid = leerFidelidad(b, cfg);
        if (fid.error) return json(400, { ok: false, error: fid.error });
        const c = await cuenta();
        await sql`UPDATE clientas SET nivel_manual = ${fid.nivel}, visitas_previas = ${fid.visitas}, consumo_previo = ${fid.consumo} WHERE id = ${c.id}`;
        return json(200, { ok: true });
      }

      if (b.accion === "activar" || b.accion === "desactivar") {
        const c = await cuenta();
        const activa = b.accion === "activar";
        await sql`UPDATE clientas SET activa = ${activa} WHERE id = ${c.id}`;
        if (!activa) await sql`DELETE FROM sesiones WHERE clienta_id = ${c.id}`; // la saca de su sesión
        return json(200, { ok: true, activa });
      }

      return json(400, { ok: false, error: "Acción no válida" });
    }

    return json(405, { ok: false, error: "Método no permitido" });
  } catch (err) {
    console.error("[admin-clientas] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
