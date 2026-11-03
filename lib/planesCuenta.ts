// Vencimiento de los planes pagados (01-11-2026, migración 138). El dueño: "pausa automática el día después del
// vencimiento". Lo llama el cron de preguntas en cada pasada (una consulta barata): una cuenta activa cuyo plan_hasta ya
// pasó (hora de Caracas) queda 'vencido' con motivo 'plan'; al entrar ve "Tu plan venció el DD/MM" (lib/cuenta.ts).
// Al registrar un pago nuevo en Plataforma vuelve a 'activo'. Las cuentas activas sin plan_hasta (las de antes) no vencen.
// Con un pago reportado en Mi plan ANTES del vencimiento y todavía en revisión (mig. 141) no se pausa: espera la revisión.
// El dueño (02-11): el Fundador que interrumpe su plan deja de serlo: al pausarse por no pagar pierde el 30% y vuelve
// como usuario normal. Lo mismo si su mes gratis termina sin pagar. Se avisa al dueño por Telegram.
import { dbGlobal } from '@/lib/db'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarTelegram, esc } from '@/lib/telegram'

export async function vencerPlanes() {
  const { rows } = await dbGlobal().query(
    `WITH v AS (
       UPDATE organizaciones o SET estado = 'vencido', motivo_pausa = 'plan', pausa_fecha = o.plan_hasta, fundador = false
       FROM organizaciones antes
       WHERE antes.id = o.id AND o.estado = 'activo' AND o.plan_hasta IS NOT NULL
         AND o.plan_hasta < (NOW() AT TIME ZONE 'America/Caracas')::date
         AND NOT EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = o.id AND k.estado = 'revision'
                           AND (k.creado_at AT TIME ZONE 'America/Caracas')::date <= o.plan_hasta)
       RETURNING o.id, o.nombre, antes.fundador AS era_fundador),
     f AS (
       INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle)
       SELECT id, 'fundador_perdido', 'plan sin pagar' FROM v WHERE era_fundador)
     INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle)
     SELECT id, 'pausada', 'plan' FROM v
     RETURNING organizacion_id, (SELECT nombre FROM v WHERE v.id = organizacion_id AND v.era_fundador) AS fundador_perdido`)
  // Fundador cuya prueba terminó sin pago (ni pago reportado antes del fin): la prueba no cambia de estado
  // (la cuenta queda deshabilitada por fecha, lib/cuenta.ts), así que aquí solo se le quita la marca.
  const { rows: prueba } = await dbGlobal().query(
    `WITH v AS (
       UPDATE organizaciones o SET fundador = false
       WHERE o.fundador AND o.estado = 'prueba' AND o.prueba_hasta < (NOW() AT TIME ZONE 'America/Caracas')::date
         AND NOT EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = o.id AND k.estado = 'revision'
                           AND (k.creado_at AT TIME ZONE 'America/Caracas')::date <= o.prueba_hasta)
       RETURNING o.id, o.nombre)
     INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle)
     SELECT id, 'fundador_perdido', 'prueba sin pagar' FROM v
     RETURNING organizacion_id, (SELECT nombre FROM v WHERE v.id = organizacion_id) AS fundador_perdido`)
  if (!rows.length && !prueba.length) return null
  const perdidos = [...rows, ...prueba].filter(r => r.fundador_perdido).map(r => String(r.fundador_perdido))
  if (perdidos.length) {
    const html = `🏷️ Dejó de ser Fundador (venció sin pago): <b>${perdidos.map(esc).join(', ')}</b>. Si vuelve, paga precio normal.`
    for (const chat of await chatsDuenoPlataforma().catch(() => [])) await enviarTelegram(chat, html).catch(() => {})
  }
  return { pausadas: rows.map(r => r.organizacion_id), fundadorPerdido: perdidos }
}
