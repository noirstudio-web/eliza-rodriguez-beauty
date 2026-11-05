/* ==========================================================================
   /api/visita — registra visitas del sitio público (lo llama js/visitas.js)
   POST { t: "vista", p, r, u, c?, v, s, n, k? }  → { ok, id }
   POST { t: "evento", e, p, v, s, k? }           → { ok }
   POST { t: "dur", id, d, v }                    → guarda los segundos en la página
     p = ruta · r = referencia · u = utm_source · c = utm_campaign
     v = visitante anónimo · s = sesión · n = ¿primera vez? · k = sesión de clienta
   No se guarda la IP. La ciudad la calcula Netlify y solo se guarda el nombre.
   ========================================================================== */
import { db, json, readJson } from "../lib/shared.mjs";
import { huella } from "../lib/fidelidad.mjs";
import { asegurarTabla, esBot, leerAgente, leerFuente, MESES_CONSERVACION } from "../lib/trafico.mjs";

export const config = { path: "/api/visita" };

const ID = /^[a-z0-9]{8,40}$/i;
const EVENTOS = ["whatsapp", "reserva", "instagram", "facebook", "llamada", "mapa"];
const txt = (v, max) => String(v ?? "").trim().slice(0, max) || null;

async function clientaDe(sql, token) {
  if (!token || typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const [c] = await sql`SELECT s.clienta_id FROM sesiones s JOIN clientas c ON c.id = s.clienta_id
                        WHERE s.token_hash = ${huella(token)} AND s.expira_en > now() AND c.activa`;
  return c?.clienta_id ?? null;
}

export default async (req, context) => {
  if (req.method !== "POST") return json(405, { ok: false });
  const ua = req.headers.get("user-agent") || "";
  if (esBot(ua)) return json(200, { ok: true, omitido: true });

  const b = await readJson(req);
  const visitante = String(b.v || "");
  if (!ID.test(visitante)) return json(400, { ok: false });
  const sesion = ID.test(String(b.s || "")) ? String(b.s) : null;

  try {
    const sql = db();
    await asegurarTabla(sql);

    /* ----- Tiempo en la página ----- */
    if (b.t === "dur") {
      const id = Number(b.id), d = Math.round(Number(b.d));
      if (Number.isInteger(id) && id > 0 && d > 0) {
        await sql`UPDATE visitas SET duracion = ${Math.min(d, 3600)}
                  WHERE id = ${id} AND visitante = ${visitante} AND creado_en > now() - interval '3 hours'`;
      }
      return json(200, { ok: true });
    }

    const ruta = txt(String(b.p || "/").split("#")[0], 160) || "/";
    const clientaId = await clientaDe(sql, b.k).catch(() => null);

    /* ----- Acción importante (clic en WhatsApp, reserva…) ----- */
    if (b.t === "evento") {
      const evento = String(b.e || "");
      if (!EVENTOS.includes(evento)) return json(400, { ok: false });
      await sql`INSERT INTO visitas (tipo, evento, ruta, visitante, sesion, clienta_id)
                VALUES ('evento', ${evento}, ${ruta}, ${visitante}, ${sesion}, ${clientaId})`;
      return json(200, { ok: true });
    }

    /* ----- Página vista ----- */
    if (b.t !== "vista") return json(400, { ok: false });
    const sitio = new URL(req.url).hostname.replace(/^www\./, "");
    const { fuente, dominio } = leerFuente({ referencia: txt(b.r, 500) || "", utm: txt(b.u, 60) || "", ua, sitio });
    const { dispositivo, navegador, so } = leerAgente(ua);
    const geo = context?.geo || {};
    const [fila] = await sql`
      INSERT INTO visitas (tipo, ruta, visitante, sesion, nuevo, fuente, referencia, campana,
                           dispositivo, navegador, so, pais, region, ciudad, clienta_id)
      VALUES ('vista', ${ruta}, ${visitante}, ${sesion}, ${b.n === true}, ${fuente}, ${dominio}, ${txt(b.c, 80)},
              ${dispositivo}, ${navegador}, ${so},
              ${txt(geo.country?.name, 60)}, ${txt(geo.subdivision?.name, 80)}, ${txt(geo.city, 80)}, ${clientaId})
      RETURNING id`;

    // De vez en cuando se borran los registros viejos
    if (Math.random() < 0.01) {
      await sql`DELETE FROM visitas WHERE creado_en < now() - make_interval(months => ${MESES_CONSERVACION})`;
    }
    return json(200, { ok: true, id: fila.id });
  } catch (err) {
    console.error("[visita] error:", err?.message);
    return json(200, { ok: false }); // nunca rompe la página
  }
};
