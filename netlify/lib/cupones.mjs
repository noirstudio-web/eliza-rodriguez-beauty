/* ==========================================================================
   Cupones de descuento del programa de fidelidad
   - Eliza crea el cupón (porcentaje o valor fijo) para: todas las clientas
     con cuenta, un nivel (ese nivel o superior) o una clienta.
   - Cada clienta recibe un CÓDIGO PERSONAL (p. ej. GLOW10-K7P2QX) que ve en
     su perfil; un solo uso por clienta.
   - Eliza valida el código en el panel: ve de quién es, cuánto descuenta y
     si está vigente, y lo marca como usado al cobrar.
   ========================================================================== */
import { randomBytes } from "node:crypto";

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1 para no confundir

export const nuevoCodigo = (prefijo) =>
  `${prefijo}-${Array.from(randomBytes(6), (b) => LETRAS[b % LETRAS.length]).join("")}`;

export const textoDescuento = (c) =>
  c.tipo === "porcentaje" ? `${c.valor} %` : `$${Number(c.valor).toLocaleString("es-CO")} COP`;

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

/**
 * Cupones vigentes para una clienta, con su código personal (se crea la
 * primera vez que la clienta ve su perfil).
 * @param nivelIndice índice de su nivel actual (0 = Essential … 4 = Luxury)
 */
export async function cuponesDeClienta(sql, clientaId, nivelIndice, cfg) {
  const nombres = cfg.niveles.map((n) => n.nombre);
  const alcanza = nombres.slice(0, nivelIndice + 1); // niveles que ya alcanzó
  const cupones = await sql`
    SELECT id, prefijo, titulo, descripcion, tipo, valor, alcance, nivel, to_char(vence, 'YYYY-MM-DD') AS vence
    FROM cupones
    WHERE activo AND (vence IS NULL OR vence >= ${hoyBogota()}::date)
      AND (alcance = 'todas'
           OR (alcance = 'nivel' AND nivel = ANY(${alcanza}))
           OR (alcance = 'clienta' AND clienta_id = ${clientaId}))
    ORDER BY creado_en DESC`;

  const out = [];
  for (const c of cupones) {
    let [cod] = await sql`SELECT codigo, usado_en FROM cupon_codigos WHERE cupon_id = ${c.id} AND clienta_id = ${clientaId}`;
    for (let i = 0; !cod && i < 5; i++) {
      // Código único; si choca (muy raro), se intenta otro
      [cod] = await sql`
        INSERT INTO cupon_codigos (codigo, cupon_id, clienta_id) VALUES (${nuevoCodigo(c.prefijo)}, ${c.id}, ${clientaId})
        ON CONFLICT DO NOTHING RETURNING codigo, usado_en`;
      if (!cod) [cod] = await sql`SELECT codigo, usado_en FROM cupon_codigos WHERE cupon_id = ${c.id} AND clienta_id = ${clientaId}`;
    }
    if (!cod) continue;
    out.push({
      titulo: c.titulo, descripcion: c.descripcion, descuento: textoDescuento(c), vence: c.vence,
      codigo: cod.codigo, usado: Boolean(cod.usado_en), usadoEn: cod.usado_en,
      para: c.alcance === "nivel" ? `Nivel ${c.nivel} en adelante` : c.alcance === "clienta" ? "Solo para ti" : "Para todas las clientas",
    });
  }
  // Primero los disponibles, luego los usados
  return out.sort((a, b) => Number(a.usado) - Number(b.usado));
}

/** Estado de un código para el validador del panel. */
export async function validarCodigo(sql, codigo) {
  const [r] = await sql`
    SELECT k.codigo, k.usado_en, k.nota_uso, c.id AS cupon_id, c.titulo, c.tipo, c.valor, c.activo,
           to_char(c.vence, 'YYYY-MM-DD') AS vence, c.alcance, c.nivel,
           cl.nombre, cl.correo, cl.whatsapp, cl.activa
    FROM cupon_codigos k JOIN cupones c ON c.id = k.cupon_id JOIN clientas cl ON cl.id = k.clienta_id
    WHERE k.codigo = ${codigo}`;
  if (!r) return null;
  const vencido = r.vence && r.vence < hoyBogota();
  const estado = r.usado_en ? "usado" : !r.activo ? "inactivo" : vencido ? "vencido" : !r.activa ? "cuenta_desactivada" : "valido";
  return {
    codigo: r.codigo, estado, titulo: r.titulo, descuento: textoDescuento(r), tipo: r.tipo, valor: r.valor,
    vence: r.vence, usadoEn: r.usado_en, notaUso: r.nota_uso,
    clienta: { nombre: r.nombre, correo: r.correo, whatsapp: r.whatsapp },
  };
}
