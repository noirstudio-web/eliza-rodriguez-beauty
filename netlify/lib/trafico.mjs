/* ==========================================================================
   Analítica propia del sitio (sin Google Analytics ni cookies)
   Tabla `visitas`: una fila por página vista o por acción importante
   (clic en WhatsApp, reserva enviada, etc.). No se guarda la IP.
   La tabla se crea sola la primera vez.
   ========================================================================== */

let lista = false;
/** Crea la tabla e índices si no existen (una vez por arranque de la función). */
export async function asegurarTabla(sql) {
  if (lista) return;
  await sql`CREATE TABLE IF NOT EXISTS visitas (
    id          bigserial PRIMARY KEY,
    creado_en   timestamptz NOT NULL DEFAULT now(),
    tipo        text NOT NULL,          -- 'vista' | 'evento'
    evento      text,                   -- whatsapp, reserva, instagram, llamada…
    ruta        text,
    visitante   text NOT NULL,          -- id anónimo al azar guardado en el navegador
    sesion      text,
    nuevo       boolean NOT NULL DEFAULT false,
    fuente      text,                   -- Instagram, Google, WhatsApp, Directo…
    referencia  text,                   -- dominio de donde llegó
    campana     text,                   -- utm_campaign
    dispositivo text, navegador text, so text,
    pais text, region text, ciudad text,
    clienta_id  bigint,
    duracion    int                     -- segundos en la página
  )`;
  await sql`CREATE INDEX IF NOT EXISTS visitas_creado_idx ON visitas (creado_en)`;
  await sql`CREATE INDEX IF NOT EXISTS visitas_clienta_idx ON visitas (clienta_id) WHERE clienta_id IS NOT NULL`;
  lista = true;
}

export const MESES_CONSERVACION = 13;

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;
export const esBot = (ua) => !ua || BOTS.test(ua);

/** Tipo de dispositivo, navegador y sistema a partir del User-Agent. */
export function leerAgente(ua = "") {
  const dispositivo = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) ? "Tablet" : /Mobi|iPhone|Android/i.test(ua) ? "Celular" : "Computador";
  const navegador =
    /Instagram/i.test(ua) ? "App de Instagram" :
    /FBAN|FBAV|FB_IAB/i.test(ua) ? "App de Facebook" :
    /TikTok|musical_ly|BytedanceWebview/i.test(ua) ? "App de TikTok" :
    /Edg\//.test(ua) ? "Edge" :
    /SamsungBrowser/.test(ua) ? "Samsung Internet" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /Firefox|FxiOS/.test(ua) ? "Firefox" :
    /CriOS|Chrome/.test(ua) ? "Chrome" :
    /Safari/.test(ua) ? "Safari" : "Otro";
  const so =
    /iPhone|iPad|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" :
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /Linux/.test(ua) ? "Linux" : "Otro";
  return { dispositivo, navegador, so };
}

/** ¿De dónde llegó? (redes, buscador, WhatsApp, directo…) */
export function leerFuente({ referencia = "", utm = "", ua = "", sitio = "" }) {
  let dominio = "";
  try { dominio = referencia ? new URL(referencia).hostname.replace(/^www\./, "") : ""; } catch {}
  if (dominio && sitio && dominio === sitio) dominio = ""; // navegación interna
  const u = String(utm || "").toLowerCase();
  const d = dominio.toLowerCase();
  const fuente =
    /instagram|^ig$/.test(u) || /instagram/.test(d) || /Instagram/i.test(ua) ? "Instagram" :
    /facebook|^fb$|meta/.test(u) || /facebook|fb\.com|fb\.me/.test(d) || /FBAN|FBAV|FB_IAB/i.test(ua) ? "Facebook" :
    /tiktok/.test(u) || /tiktok/.test(d) || /TikTok|musical_ly/i.test(ua) ? "TikTok" :
    /whatsapp|^wa$/.test(u) || /whatsapp|wa\.me/.test(d) ? "WhatsApp" :
    /google/.test(u) || /google\./.test(d) ? "Google" :
    /bing|yahoo|duckduckgo|ecosia/.test(d) ? "Otros buscadores" :
    u ? u.slice(0, 40) :
    d ? "Otros sitios" : "Directo";
  return { fuente, dominio: dominio.slice(0, 120) || null };
}
