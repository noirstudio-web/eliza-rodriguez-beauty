/* ==========================================================================
   /api/admin/trafico — resumen de visitas para la pestaña "Tráfico" del panel
   GET ?dias=1|7|30|90   (1 = hoy)
   ========================================================================== */
import { db, json, isAdmin, denied } from "../lib/shared.mjs";
import { asegurarTabla } from "../lib/trafico.mjs";

export const config = { path: "/api/admin/trafico" };

const TZ = "America/Bogota";

export default async (req) => {
  if (!(await isAdmin(req))) return denied();
  if (req.method !== "GET") return json(405, { ok: false, error: "Método no permitido" });
  const pedido = Number(new URL(req.url).searchParams.get("dias"));
  const dias = [1, 7, 30, 90].includes(pedido) ? pedido : 7;

  try {
    const sql = db();
    await asegurarTabla(sql);
    // Inicio del periodo: medianoche de Colombia de hace (dias-1) días; y el periodo anterior, de igual largo
    const [r] = await sql`
      SELECT ((date_trunc('day', now() AT TIME ZONE ${TZ}) - make_interval(days => ${dias - 1})) AT TIME ZONE ${TZ}) AS desde,
             ((date_trunc('day', now() AT TIME ZONE ${TZ}) - make_interval(days => ${2 * dias - 1})) AT TIME ZONE ${TZ}) AS antes`;
    const { desde, antes } = r;

    const [
      [tot], [prev], [ahora], porDia, porHora, fuentes, paginas, ciudades, dispositivos, navegadores, eventos, clientas, recientes,
    ] = await Promise.all([
      sql`SELECT count(*) FILTER (WHERE tipo = 'vista')::int AS vistas,
                 count(DISTINCT visitante) FILTER (WHERE tipo = 'vista')::int AS visitantes,
                 count(DISTINCT visitante) FILTER (WHERE tipo = 'vista' AND nuevo)::int AS nuevos,
                 count(DISTINCT sesion) FILTER (WHERE tipo = 'vista')::int AS sesiones,
                 round(avg(duracion) FILTER (WHERE duracion BETWEEN 1 AND 3600))::int AS duracion
          FROM visitas WHERE creado_en >= ${desde}`,
      sql`SELECT count(DISTINCT visitante)::int AS visitantes, count(*)::int AS vistas
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${antes} AND creado_en < ${desde}`,
      sql`SELECT count(DISTINCT visitante)::int AS n FROM visitas WHERE creado_en > now() - interval '5 minutes'`,
      sql`SELECT to_char(d, 'YYYY-MM-DD') AS dia,
                 coalesce(count(v.id), 0)::int AS vistas, count(DISTINCT v.visitante)::int AS visitantes
          FROM generate_series(date_trunc('day', ${desde}::timestamptz AT TIME ZONE ${TZ}), date_trunc('day', now() AT TIME ZONE ${TZ}), interval '1 day') AS d
          LEFT JOIN visitas v ON v.tipo = 'vista' AND v.creado_en >= ${desde} AND date_trunc('day', v.creado_en AT TIME ZONE ${TZ}) = d
          GROUP BY d ORDER BY d`,
      sql`SELECT extract(hour FROM creado_en AT TIME ZONE ${TZ})::int AS hora, count(DISTINCT visitante)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 1`,
      sql`SELECT coalesce(fuente, 'Directo') AS nombre, count(DISTINCT visitante)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      sql`SELECT ruta AS nombre, count(*)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
      sql`SELECT concat_ws(', ', coalesce(ciudad, 'Desconocida'), nullif(pais, 'Colombia')) AS nombre, count(DISTINCT visitante)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      sql`SELECT coalesce(dispositivo, 'Otro') AS nombre, count(DISTINCT visitante)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC`,
      sql`SELECT coalesce(navegador, 'Otro') AS nombre, count(DISTINCT visitante)::int AS n
          FROM visitas WHERE tipo = 'vista' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      sql`SELECT evento AS nombre, count(*)::int AS n, count(DISTINCT visitante)::int AS personas
          FROM visitas WHERE tipo = 'evento' AND creado_en >= ${desde} GROUP BY 1 ORDER BY 2 DESC`,
      sql`SELECT c.nombre, c.correo, count(*) FILTER (WHERE v.tipo = 'vista')::int AS vistas,
                 count(*) FILTER (WHERE v.tipo = 'evento')::int AS acciones, max(v.creado_en) AS ultima
          FROM visitas v JOIN clientas c ON c.id = v.clienta_id
          WHERE v.creado_en >= ${desde} GROUP BY c.id, c.nombre, c.correo ORDER BY ultima DESC LIMIT 50`,
      sql`SELECT v.creado_en, v.tipo, v.evento, v.ruta, v.fuente, v.dispositivo, v.navegador, v.ciudad, v.pais,
                 v.nuevo, v.duracion, c.nombre AS clienta, right(v.visitante, 6) AS quien
          FROM visitas v LEFT JOIN clientas c ON c.id = v.clienta_id
          ORDER BY v.creado_en DESC LIMIT 40`,
    ]);

    return json(200, {
      ok: true, dias,
      totales: { ...tot, recurrentes: Math.max(0, tot.visitantes - tot.nuevos), enLinea: ahora.n },
      anterior: prev,
      porDia, porHora, fuentes, paginas, ciudades, dispositivos, navegadores, eventos, clientas, recientes,
    });
  } catch (err) {
    console.error("[admin-trafico] error:", err);
    return json(500, { ok: false, error: "Error del servidor" });
  }
};
