/* ==========================================================================
   Agenda en línea: horarios de atención y huecos libres
   - Eliza la configura en el panel (pestaña Agenda); se guarda en la tabla
     `contenido` con la clave "agenda".
   - Cada cita ocupa `duracion` minutos. Un hueco está libre si las citas
     pendientes o confirmadas que se cruzan con él son menos que `capacidad`.
   - Colombia no cambia de hora en el año: la hora local es siempre UTC−5.
   ========================================================================== */

export const AGENDA_DEFAULT = {
  activa: false,
  duracion: 60,     // minutos que dura cada cita
  capacidad: 1,     // citas a la misma hora
  anticipacion: 3,  // horas mínimas de anticipación para reservar
  diasMax: 60,      // hasta cuántos días hacia adelante se puede reservar
  // 0 = domingo … 6 = sábado. Cada día: lista de franjas { desde, hasta }
  semana: {
    0: [],
    1: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }],
    2: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }],
    3: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }],
    4: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }],
    5: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }],
    6: [{ desde: "09:00", hasta: "13:00" }],
  },
  bloqueos: [],     // días sin atención: [{ fecha: "2026-12-24", nota: "Navidad" }]
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DURACIONES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180];
const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const entero = (v, min, max, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Limpia y valida lo que envía el panel. Devuelve null si no es válido. */
export function limpiarAgenda(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const semana = {};
  for (let d = 0; d < 7; d++) {
    const franjas = Array.isArray(v.semana?.[d]) ? v.semana[d] : [];
    semana[d] = franjas
      .slice(0, 4)
      .map((f) => ({ desde: String(f?.desde || ""), hasta: String(f?.hasta || "") }))
      .filter((f) => HORA.test(f.desde) && HORA.test(f.hasta) && aMin(f.hasta) > aMin(f.desde))
      .sort((a, b) => aMin(a.desde) - aMin(b.desde));
  }
  const vistos = new Set();
  const bloqueos = (Array.isArray(v.bloqueos) ? v.bloqueos : [])
    .map((b) => ({ fecha: String(b?.fecha || ""), nota: String(b?.nota || "").trim().slice(0, 80) }))
    .filter((b) => FECHA.test(b.fecha) && !vistos.has(b.fecha) && vistos.add(b.fecha))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .slice(0, 366);
  const duracion = Number(v.duracion);
  return {
    activa: v.activa === true,
    duracion: DURACIONES.includes(duracion) ? duracion : AGENDA_DEFAULT.duracion,
    capacidad: entero(v.capacidad, 1, 10, 1),
    anticipacion: entero(v.anticipacion, 0, 168, AGENDA_DEFAULT.anticipacion),
    diasMax: entero(v.diasMax, 1, 365, AGENDA_DEFAULT.diasMax),
    semana,
    bloqueos,
  };
}

/** Configuración vigente (la del panel, o la de fábrica). */
export async function cargarAgenda(sql) {
  const [f] = await sql`SELECT valor FROM contenido WHERE clave = 'agenda'`;
  return f?.valor ? limpiarAgenda(f.valor) || AGENDA_DEFAULT : AGENDA_DEFAULT;
}

/* Fechas en hora de Colombia (UTC−5) */
const OFFSET_MIN = 5 * 60;
const instante = (fecha, hora) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, aMin(hora) + OFFSET_MIN);
};
const fechaMas = (fecha, dias) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};
const diaSemana = (fecha) => new Date(fecha + "T12:00:00Z").getUTCDay();
export const hoyColombia = () => new Date(Date.now() - OFFSET_MIN * 60000).toISOString().slice(0, 10);

/** Horas de inicio posibles de un día (sin mirar las reservas). */
export function horasDelDia(cfg, fecha) {
  if (cfg.bloqueos.some((b) => b.fecha === fecha)) return [];
  const out = [];
  for (const f of cfg.semana[diaSemana(fecha)] || []) {
    for (let m = aMin(f.desde); m + cfg.duracion <= aMin(f.hasta); m += cfg.duracion) out.push(aHora(m));
  }
  return [...new Set(out)];
}

/**
 * Huecos libres desde hoy hasta `diasMax` días: { "2026-11-09": ["09:00", …], … }
 * Solo incluye los días que tienen al menos un hueco.
 */
export async function disponibilidad(sql, cfg) {
  const desde = hoyColombia();
  const hasta = fechaMas(desde, cfg.diasMax);
  const ocupadas = await sql`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora
    FROM reservas
    WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date AND estado IN ('pendiente', 'confirmada')`;
  const porDia = {};
  for (const r of ocupadas) (porDia[r.fecha] ||= []).push(aMin(r.hora));

  const limite = Date.now() + cfg.anticipacion * 3600000;
  const dias = {};
  for (let f = desde; f <= hasta; f = fechaMas(f, 1)) {
    const citas = porDia[f] || [];
    const libres = horasDelDia(cfg, f).filter((h) => {
      if (instante(f, h) < limite) return false;
      const ini = aMin(h), fin = ini + cfg.duracion;
      const cruces = citas.filter((c) => c < fin && c + cfg.duracion > ini).length;
      return cruces < cfg.capacidad;
    });
    if (libres.length) dias[f] = libres;
  }
  return { desde, hasta, dias };
}
