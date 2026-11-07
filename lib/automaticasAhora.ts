// Respuestas automáticas de preguntas AL INSTANTE (07-11-2026, pedido del dueño: tardaban ~45 s a 1:47 porque la IA
// esperaba la vuelta del cron de cada minuto y, en ella, iba después de sincronizar todas las empresas).
// Ahora: llega el aviso de ML de una pregunta nueva → respuestas rápidas automáticas y, si la empresa la tiene, la IA
// automática, en ese momento. El cron hace lo mismo cada minuto como respaldo (avisos perdidos).
// Candado por empresa (advisory lock de Postgres): el aviso y el cron nunca corren esto a la vez para la misma empresa
// (las respuestas rápidas no tienen reserva propia; la IA sí). Si está tomado, se sale: el que lo tiene ya las procesa.
import type { Pool } from 'pg'
import { responderAutomaticas } from '@/lib/automaticasPreguntas'
import { procesarIAAutomatica } from '@/lib/iaAutomatica'

export async function responderAlInstante(db: Pool, empresaId: number, country: string, iaAuto: boolean) {
  const { rows: [l] } = await db.query(`SELECT pg_try_advisory_lock(hashtext('auto_preguntas'), $1) AS ok`, [empresaId])
  if (!l?.ok) return { ocupado: true }
  try {
    const rapidas = await responderAutomaticas(db)
    const ia = iaAuto ? await procesarIAAutomatica(db, empresaId, country) : null
    return { rapidas, ia }
  } finally {
    await db.query(`SELECT pg_advisory_unlock(hashtext('auto_preguntas'), $1)`, [empresaId]).catch(() => {})
  }
}
