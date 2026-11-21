// Prueba de Inventario 15 días (21-11-2026, migración 193). El dueño: ofrecer Inventario a clientes que ya pagan, primero
// solo a SHOPIT_VE. Reglas acordadas:
//  · Solo la ven las organizaciones con «Ofrecer Inventario» prendido en Plataforma (inventario_oferta) y solo su admin.
//  · El cliente la activa él mismo con 2 clics: se prende el módulo Inventario (compras básicas) en sus empresas. Una
//    sola vez por organización.
//  · Siempre 15 días (regla A): si el plan vence antes, se pausa toda la cuenta con la regla de siempre; si renueva, la
//    prueba sigue hasta su fecha. No se recorta.
//  · Avisos: línea gris con los días que quedan; desde 3 días antes, ámbar con el monto para pasar a Completo; en
//    Telegram, en el resumen diario (una línea, no un mensaje aparte).
//  · Pasar a Completo: la diferencia de plan por los días que le quedan al plan, contados DESDE QUE TERMINA LA PRUEBA
//    (pagar antes no le quita días gratis). Con su descuento: Fundador 30 % (único, no se suma) o trimestral 10 %.
//  · Si termina sin Completo: al día siguiente se apaga el módulo; los datos quedan guardados (60 días prometidos).
import { dbGlobal } from '@/lib/db'
import { calcularMejora, type Mejora } from '@/lib/cobros'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarTelegram, esc } from '@/lib/telegram'
import { currentDate } from '@/lib/tz'

export const DIAS_PRUEBA_INVENTARIO = 15
export const DIAS_DATOS_INVENTARIO = 60
export const AVISAR_INVENTARIO_DESDE = 3

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
function sumarDias(f: string, n: number) {
  const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

export interface InfoInventario {
  oferta: boolean
  /** Fechas de la prueba (YYYY-MM-DD) o null si nunca la activó. `hasta` es el último día con acceso. */
  desde: string | null; hasta: string | null
  /** Días que quedan (0 = hoy es el último); negativo = terminó. null sin prueba. */
  quedan: number | null
  estado: string; interna: boolean
  plan: string | null; escalon: number | null; ciclo: string | null; fundador: boolean; planHasta: string | null
  /** Tiene hoy el módulo Inventario prendido en alguna empresa. */
  conInventario: boolean
  /** Hay un pago de plan Completo en revisión (no se apaga ni se insiste mientras tanto). */
  completoEnRevision: boolean
}

export async function infoInventario(organizacionId: number): Promise<InfoInventario | null> {
  const { rows: [o] } = await dbGlobal().query(
    `SELECT o.inventario_oferta AS oferta, to_char(o.inventario_prueba_desde, 'YYYY-MM-DD') AS desde,
            to_char(o.inventario_prueba_hasta, 'YYYY-MM-DD') AS hasta,
            o.inventario_prueba_hasta - (NOW() AT TIME ZONE 'America/Caracas')::date AS quedan,
            o.estado, o.interna, o.plan, o.escalon, o.ciclo, o.fundador, to_char(o.plan_hasta, 'YYYY-MM-DD') AS plan_hasta,
            EXISTS (SELECT 1 FROM empresas e WHERE e.organizacion_id = o.id AND 'inventario' = ANY(e.modulos)) AS con_inventario,
            EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = o.id AND k.estado = 'revision'
                      AND k.tipo IN ('plan', 'upgrade') AND k.plan = 'completo') AS completo_en_revision
     FROM organizaciones o WHERE o.id = $1`, [organizacionId])
  if (!o) return null
  return {
    oferta: !!o.oferta, desde: o.desde, hasta: o.hasta, quedan: o.quedan == null ? null : Number(o.quedan),
    estado: o.estado, interna: !!o.interna, plan: o.plan, escalon: o.escalon == null ? null : Number(o.escalon), ciclo: o.ciclo,
    fundador: !!o.fundador, planHasta: o.plan_hasta, conInventario: !!o.con_inventario, completoEnRevision: !!o.completo_en_revision,
  }
}

/** ¿Puede activar la prueba ahora? (oferta prendida, nunca la tuvo, cuenta al día y todavía sin Inventario). */
export function puedeActivar(i: InfoInventario) {
  return i.oferta && !i.hasta && !i.conInventario && (i.estado === 'activo' || i.estado === 'prueba')
}

/** Lo que pagaría HOY por pasar a Completo (null si su plan no está activo o vence antes de que termine la prueba: en
 *  ese caso renueva directamente en Completo). Cuenta desde que termina la prueba. */
export function pasarACompleto(i: InfoInventario, hoy = currentDate()): Mejora | null {
  if (i.estado !== 'activo' || !i.plan || i.escalon == null || !i.planHasta || i.planHasta < hoy) return null
  const desde = i.hasta && i.hasta > hoy ? i.hasta : hoy
  return calcularMejora(i.plan, 'completo', i.escalon, i.ciclo, i.fundador, desde, i.planHasta)
}

export class ErrorPrueba extends Error {}

/** El cliente activa su prueba (Mi plan / aviso de arriba). Devuelve hasta cuándo va. */
export async function activarPruebaInventario(organizacionId: number, userId: number) {
  const client = await dbGlobal().connect()
  try {
    await client.query('BEGIN')
    const { rows: [o] } = await client.query(
      `SELECT nombre, estado, inventario_oferta, inventario_prueba_hasta,
              EXISTS (SELECT 1 FROM empresas e WHERE e.organizacion_id = o.id AND 'inventario' = ANY(e.modulos)) AS con_inventario
       FROM organizaciones o WHERE id = $1 FOR UPDATE`, [organizacionId])
    if (!o || !o.inventario_oferta) throw new ErrorPrueba('La prueba de Inventario no está disponible para tu cuenta.')
    if (o.inventario_prueba_hasta) throw new ErrorPrueba('Ya usaste tu prueba de Inventario.')
    if (o.con_inventario) throw new ErrorPrueba('Tu cuenta ya tiene Inventario.')
    if (o.estado !== 'activo' && o.estado !== 'prueba') throw new ErrorPrueba('Tu cuenta está pausada: primero renueva tu plan en Mi plan.')
    // Mismo cálculo que la prueba gratis de la cuenta (Plataforma → Dar prueba): hoy + 15, hora de Venezuela.
    const { rows: [h] } = await client.query(
      `UPDATE organizaciones SET inventario_prueba_desde = (NOW() AT TIME ZONE 'America/Caracas')::date,
         inventario_prueba_hasta = (NOW() AT TIME ZONE 'America/Caracas')::date + $2::int
       WHERE id = $1 RETURNING to_char(inventario_prueba_hasta, 'YYYY-MM-DD') AS hasta`, [organizacionId, DIAS_PRUEBA_INVENTARIO])
    await client.query(
      `UPDATE empresas SET modulos = ARRAY(SELECT DISTINCT unnest(modulos || ARRAY['inventario']::text[])) WHERE organizacion_id = $1`,
      [organizacionId])
    await client.query(`INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle, por) VALUES ($1, 'prueba_inventario', $2, $3)`,
      [organizacionId, `Prueba de Inventario hasta ${h.hasta}`, userId])
    await client.query('COMMIT')
    const html = `📦 <b>${esc(o.nombre)}</b> activó la <b>prueba de Inventario</b> (hasta el ${ddmm(h.hasta)}).`
    for (const chat of await chatsDuenoPlataforma().catch(() => [])) await enviarTelegram(chat, html).catch(() => {})
    return { hasta: h.hasta as string }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Cron (cada pasada, consulta barata): apaga Inventario a quien lo tuvo por la prueba y no tiene plan Completo:
 *  prueba terminada (el día después de `hasta`), o después bajó de Completo a otro plan. Solo cuentas que usaron la
 *  prueba (un Inventario dado a mano en Plataforma no se toca); nunca la propietaria ni las internas, ni con un pago de
 *  Completo en revisión. Los datos no se tocan. */
export async function vencerPruebasInventario() {
  const { rows } = await dbGlobal().query(
    `WITH o AS (
       SELECT o.id, o.nombre FROM organizaciones o
       WHERE NOT o.interna AND o.estado <> 'propietario'
         AND o.inventario_prueba_hasta < (NOW() AT TIME ZONE 'America/Caracas')::date
         AND COALESCE(o.plan, '') <> 'completo'
         AND NOT EXISTS (SELECT 1 FROM organizacion_cobros k WHERE k.organizacion_id = o.id AND k.estado = 'revision'
                           AND k.tipo IN ('plan', 'upgrade') AND k.plan = 'completo')),
     e AS (
       UPDATE empresas SET modulos = array_remove(modulos, 'inventario')
       WHERE organizacion_id IN (SELECT id FROM o) AND 'inventario' = ANY(modulos)
       RETURNING organizacion_id),
     v AS (SELECT DISTINCT organizacion_id FROM e)
     INSERT INTO organizacion_eventos (organizacion_id, tipo, detalle)
     SELECT organizacion_id, 'prueba_inventario_fin', 'Inventario apagado (sin plan Completo)' FROM v
     RETURNING organizacion_id, (SELECT nombre FROM o WHERE o.id = organizacion_id) AS nombre`)
  if (!rows.length) return null
  const html = `📦 Se apagó Inventario (prueba terminada sin Completo): <b>${rows.map(r => esc(String(r.nombre))).join(', ')}</b>.`
  for (const chat of await chatsDuenoPlataforma().catch(() => [])) await enviarTelegram(chat, html).catch(() => {})
  return rows.map(r => r.organizacion_id)
}

/** Línea del resumen diario de Telegram (admin), desde 3 días antes del fin de la prueba. */
export async function lineaTelegramInventario(organizacionId: number): Promise<string | null> {
  const i = await infoInventario(organizacionId).catch(() => null)
  if (!i || i.interna || !i.hasta || i.quedan == null || i.quedan < 0 || i.quedan > AVISAR_INVENTARIO_DESDE) return null
  if (i.plan === 'completo' || i.completoEnRevision) return null
  const cuando = i.quedan === 0 ? 'hoy' : i.quedan === 1 ? 'mañana' : `el ${ddmm(i.hasta)}`
  const m = pasarACompleto(i)
  const monto = m ? ` por ${fmtUsd(m.monto)}` : ''
  return `📦 <b>Tu prueba de Inventario termina ${cuando}</b>: para seguir con él pasa a Completo${monto} en Menú → Mi plan`
}

export const fmtUsd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
/** Hasta cuándo se guardan los datos después del fin de la prueba. */
export const datosHasta = (hasta: string) => sumarDias(hasta, DIAS_DATOS_INVENTARIO)
