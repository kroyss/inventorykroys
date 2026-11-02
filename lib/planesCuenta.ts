// Vencimiento de los planes pagados (01-11-2026, migración 138). El dueño: "pausa automática el día después del
// vencimiento". Lo llama el cron de preguntas en cada pasada (una consulta barata): una cuenta activa cuyo plan_hasta ya
// pasó (hora de Caracas) queda 'vencido' con motivo 'plan'; al entrar ve "Tu plan venció el DD/MM" (lib/cuenta.ts).
// Al registrar un pago nuevo en Plataforma vuelve a 'activo'. Las cuentas activas sin plan_hasta (las de antes) no vencen.
// Con un pago reportado en Mi plan ANTES del vencimiento y todavía en revisión (mig. 141) no se pausa: espera la revisión.
import { dbGlobal } from '@/lib/db'

export async function vencerPlanes() {
  const { rows } = await dbGlobal().query(
    `WITH v AS (
       UPDATE organizaciones SET estado = 'vencido', motivo_pausa = 'plan', pausa_fecha = plan_hasta
       WHERE estado = 'activo' AND plan_hasta IS NOT NULL AND plan_hasta < (NOW() AT TIME ZONE 'America/Caracas')::date
         AND NOT EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = organizaciones.id AND k.estado = 'revision'
                           AND (k.creado_at AT TIME ZONE 'America/Caracas')::date <= organizaciones.plan_hasta)
       RETURNING id, nombre, plan_hasta)
     INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle)
     SELECT id, 'pausada', 'plan' FROM v RETURNING organizacion_id`)
  return rows.length ? { pausadas: rows.map(r => r.organizacion_id) } : null
}
