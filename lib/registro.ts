// Autoregistro con prueba gratis de 15 días (26-10, migración 125; página /registro, API /api/registro).
// Fundadores quedan como están (30 días); todo alta nueva por /registro es una prueba normal de 15 días.
import { dbGlobal } from '@/lib/db'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { enviarTelegram, ENTORNO, telegramConfigurado } from '@/lib/telegram'

/** Lo que trae la prueba: el plan Automatizaciones (lo mismo con lo que arrancaron los Fundadores) + Pagos ME.
 *  Sin Inventario: es el paso 2, se prende a mano en Plataforma cuando el cliente lo pide. */
export const MODULOS_PRUEBA = ['despachos', 'reportador', 'preguntas', 'alertas_stock', 'pagos_me'] as const

/** Telegram a los admins de la organización dueña de la plataforma (los que conectaron su Telegram en este entorno). */
export async function avisarDuenoPlataforma(html: string) {
  if (!telegramConfigurado()) return
  const { rows } = await dbGlobal().query(
    `SELECT DISTINCT t.chat_id::text AS chat_id
     FROM telegram_usuarios t
     JOIN usuario_empresas ue ON ue.user_id = t.user_id AND ue.role = 'admin'
     JOIN empresas e ON e.id = ue.empresa_id AND e.organizacion_id = $1
     WHERE t.chat_id IS NOT NULL AND t.entorno = $2`, [ORGANIZACION_PLATAFORMA, ENTORNO])
  for (const r of rows) await enviarTelegram(r.chat_id, html).catch(() => {})
}

/** Al conectar una cuenta de ML: ¿esta organización de autoregistro quiere usar una cuenta de ML que ya pasó por otra?
 *  Devuelve el nombre de la otra organización (para el log) o null si puede seguir. Solo frena al autoregistro:
 *  las cuentas que crea el dueño en Plataforma conectan lo que él decida. */
export async function pruebaYaUsada(organizacionId: number, mlUserId: number): Promise<string | null> {
  const { rows: [r] } = await dbGlobal().query(
    // organizacion_id NULL = la cuenta que la usó ya se eliminó (mig 126): igual cuenta como prueba usada.
    `SELECT COALESCE(o2.nombre, 'una cuenta ya eliminada') AS nombre
     FROM organizaciones o
     JOIN ml_pruebas_usadas u ON u.ml_user_id = $2 AND u.organizacion_id IS DISTINCT FROM o.id
     LEFT JOIN organizaciones o2 ON o2.id = u.organizacion_id
     WHERE o.id = $1 AND o.origen = 'autoregistro'`, [organizacionId, mlUserId])
  return r?.nombre ?? null
}

/** Deja anotada la cuenta de ML en esta organización (la primera vez que se conecta en el sistema). */
export async function anotarCuentaML(organizacionId: number, mlUserId: number, nickname: string) {
  await dbGlobal().query(
    `INSERT INTO ml_pruebas_usadas (ml_user_id, organizacion_id, nickname) VALUES ($1, $2, $3)
     ON CONFLICT (ml_user_id) DO NOTHING`, [mlUserId, organizacionId, nickname])
}
