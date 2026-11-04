/* ==========================================================================
   Función programada: cada 10 minutos busca las citas que empiezan dentro de
   las próximas 2 horas y envía el recordatorio a la clienta y a Eliza.
   Cada cita recibe un solo recordatorio (se marca recordatorio_enviado_en).
   ========================================================================== */
import { db, sendMail, plantilla, correoEliza, correoConfigurado, siteUrl, fechaLarga, hora12, HORAS_RECORDATORIO } from "../lib/shared.mjs";

export const config = { schedule: "*/10 * * * *" };

export default async () => {
  if (!correoConfigurado()) {
    console.log("[recordatorios] correo sin configurar (SMTP_USER / SMTP_PASS); no se envía nada.");
    return;
  }
  const sql = db();

  // Se "reservan" las filas marcándolas primero: así, si la función corre dos
  // veces a la vez, ninguna cita recibe dos recordatorios.
  const citas = await sql`
    UPDATE reservas SET recordatorio_enviado_en = now()
    WHERE recordatorio_enviado_en IS NULL
      AND estado IN ('pendiente', 'confirmada')
      AND ((fecha + hora) AT TIME ZONE 'America/Bogota') > now()
      AND ((fecha + hora) AT TIME ZONE 'America/Bogota') <= now() + make_interval(hours => ${HORAS_RECORDATORIO})
      -- reservas hechas con menos de 2 h de anticipación ya recibieron su correo al reservar
      AND creada_en <= ((fecha + hora) AT TIME ZONE 'America/Bogota') - make_interval(hours => ${HORAS_RECORDATORIO})
    RETURNING id, nombre, whatsapp, correo, servicio, cancel_token,
              to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(hora, 'HH24:MI') AS hora`;

  for (const c of citas) {
    const filas = [["Servicio", c.servicio], ["Fecha", fechaLarga(c.fecha)], ["Hora", hora12(c.hora)]];
    await Promise.allSettled([
      sendMail({
        to: c.correo,
        subject: `Recordatorio: tu cita es hoy a las ${hora12(c.hora)} · Eliza Rodriguez Beauty`,
        html: plantilla({
          titulo: `${c.nombre.split(" ")[0]}, te esperamos pronto`,
          intro: "Te recordamos tu cita de hoy. Llega unos minutos antes, sin maquillaje en la zona a tratar si es posible.",
          filas,
          nota: "Si tienes algún inconveniente, escríbenos por WhatsApp. Las cancelaciones en línea se permiten hasta 3 horas antes de la cita.",
        }),
      }),
      sendMail({
        to: correoEliza(),
        replyTo: c.correo,
        subject: `Recordatorio: ${c.nombre} a las ${hora12(c.hora)} · ${c.servicio}`,
        html: plantilla({
          titulo: "Tienes una cita en 2 horas",
          intro: `${c.nombre} tiene cita contigo hoy.`,
          filas: [["Clienta", c.nombre], ...filas, ["WhatsApp", c.whatsapp], ["Correo", c.correo]],
          boton: { texto: "Abrir panel de reservas", url: `${siteUrl()}/admin/` },
        }),
      }),
    ]);
  }

  console.log(`[recordatorios] enviados: ${citas.length}`);
};
