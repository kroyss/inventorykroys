// Notificaciones de ML.
//   Paso 1b (24-10, mig 121): de cada aviso de MENSAJE se lee el mensaje en ML y se anota quién lo escribió, en qué
//   conversación y desde qué aplicación (sin el texto). Solo para medir.
//   Paso 2a (25-10): cada aviso de VENTA (orders_v2) trae esa venta de ML y la guarda (la misma traerOrden de siempre:
//   una fila por número, sin duplicar). Así entra en segundos a Por confirmar / Pagos ME y el Mensaje al comprar sale
//   al minuto. La sincronización de cada hora sigue como red de seguridad (trae lo que un aviso perdido no trajo), y
//   si los avisos dejan de llegar del todo (avisosCaidos) el Mensaje al comprar vuelve a traer ventas cada 5 min.
// ml_notificaciones es global; la cuenta (ml_conexiones, por empresa con RLS) se busca empresa por empresa y se guarda
// en memoria unos minutos.
import { conEmpresa, dbGlobal } from '@/lib/db'
import { mlFetch } from '@/lib/ml'
import { traerOrden } from '@/lib/calificacionesML'
import { SQL_CUENTA_SINCRONIZA } from '@/lib/cuenta'
import type { Country } from '@/lib/types'

/** `sincroniza` = la empresa tiene Preguntas y la cuenta al día (lo mismo que mira el cron): solo esas reciben ventas. */
interface Cuenta { empresaId: number; country: Country; conexionId: number; sincroniza: boolean }
let mapa: { at: number; cuentas: Map<string, Cuenta> } | null = null
const MAPA_MIN = 10

async function cuentaDe(mlUserId: string): Promise<Cuenta | null> {
  if (!mapa || Date.now() - mapa.at > MAPA_MIN * 60_000) {
    const cuentas = new Map<string, Cuenta>()
    const { rows: empresas } = await dbGlobal().query(
      `SELECT e.id, e.country, (e.is_active AND 'preguntas' = ANY(e.modulos) AND ${SQL_CUENTA_SINCRONIZA}) AS sincroniza
       FROM empresas e JOIN organizaciones o ON o.id = e.organizacion_id`)
    for (const e of empresas) {
      const { rows } = await conEmpresa(e.id, e.country as Country, db =>
        db.query(`SELECT id, ml_user_id::text AS u FROM ml_conexiones WHERE estado = 'activa'`))
      for (const r of rows) cuentas.set(r.u, { empresaId: e.id, country: e.country as Country, conexionId: r.id, sincroniza: !!e.sincroniza })
    }
    mapa = { at: Date.now(), cuentas }
  }
  return mapa.cuentas.get(mlUserId) ?? null
}

// ── Paso 2a: ventas ──
/** ML manda varios avisos por venta (pago, envío…: ~3 por venta). La misma venta no se vuelve a leer antes de esto. */
const RELEER_SEG = 60
const leidas = new Map<string, number>()

/** Trae y guarda la venta avisada y anota en la notificación qué pasó (`nueva` = no estaba: la trajo el aviso; sirve
 *  para medir cuántas trae el barrido de cada hora que el aviso no trajo). Nunca tira. */
export async function procesarVentaNotificada(id: number, mlUserId: string | null, resource: string | null) {
  const orden = resource?.match(/^\/orders\/(\d+)$/)?.[1]
  if (process.env.APP_ENV === 'staging' || !mlUserId || !orden) return
  const ahora = Date.now()
  if ((leidas.get(orden) ?? 0) > ahora - RELEER_SEG * 1000) return
  leidas.set(orden, ahora)
  if (leidas.size > 2000) for (const [k, t] of leidas) if (t < ahora - RELEER_SEG * 1000) leidas.delete(k)
  let detalle: Record<string, unknown>
  try {
    const c = await cuentaDe(mlUserId)
    if (!c) detalle = { error: 'cuenta no conectada' }
    else if (!c.sincroniza) detalle = { empresa: c.empresaId, omitida: 'no sincroniza' }
    else {
      detalle = await conEmpresa(c.empresaId, c.country, async db => {
        const { rowCount: estaba } = await db.query(`SELECT 1 FROM ml_ordenes WHERE id = $1`, [orden])
        const o = await traerOrden(db, c.conexionId, orden)
        return { empresa: c.empresaId, nueva: !estaba, estado: o?.status ?? null, ...(o ? {} : { error: 'no es de esta cuenta' }) }
      })
    }
  } catch (e) {
    detalle = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }
  await dbGlobal().query(`UPDATE ml_notificaciones SET detalle = $2, leido_at = NOW() WHERE id = $1`, [id, JSON.stringify(detalle)])
    .catch(e => console.error('[ml notificaciones] venta', e instanceof Error ? e.message : e))
}

/** Vigilante: ¿dejaron de llegar los avisos? De 7 a 22 h (hora Caracas) llegan varios por minuto (el hueco más largo
 *  medido de día fue ~8 min); 20 min sin NINGUNO = falla de ML o de nuestro lado. De noche los huecos son normales y
 *  queda la sincronización de cada hora. Staging no recibe avisos: siempre "caídos" (se comporta como antes). */
export const AVISOS_CAIDOS_MIN = 20
export async function avisosCaidos(): Promise<boolean> {
  if (process.env.APP_ENV === 'staging') return true
  const { rows: [r] } = await dbGlobal().query(
    `SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Caracas')::int AS hora,
            COALESCE((SELECT received_at FROM ml_notificaciones ORDER BY id DESC LIMIT 1)
                     > NOW() - make_interval(mins => ${AVISOS_CAIDOS_MIN}), FALSE) AS llegan`)
  return r.hora >= 7 && r.hora < 22 && !r.llegan
}

interface MensajeML {
  id?: string; client_id?: number | string; site_id?: string
  from?: { user_id?: number | string }; to?: { user_id?: number | string }
  message_date?: { created?: string; received?: string }; status?: string
  message_resources?: { id?: string | number; name?: string }[]
  text?: string
}

/** Lee el mensaje avisado y guarda su detalle en la notificación `id`. Nunca tira: ante un error lo anota. */
export async function leerMensajeNotificado(id: number, mlUserId: string | null, mensajeId: string | null) {
  if (process.env.APP_ENV === 'staging' || !mlUserId || !mensajeId || !/^[0-9a-f]{20,40}$/i.test(mensajeId)) return
  let detalle: Record<string, unknown>
  try {
    const c = await cuentaDe(mlUserId)
    if (!c) detalle = { error: 'cuenta no conectada' }
    else {
      const m = await conEmpresa(c.empresaId, c.country, db =>
        mlFetch<MensajeML | { messages?: MensajeML[] }>(db, c.conexionId, `/messages/${mensajeId}?tag=post_sale`))
      const msg: MensajeML = 'messages' in m && Array.isArray(m.messages) ? m.messages[0] ?? {} : m as MensajeML
      const de = String(msg.from?.user_id ?? '')
      const yaGuardado = await conEmpresa(c.empresaId, c.country, db =>
        db.query(`SELECT 1 FROM ml_mensajes WHERE msg_id = $1`, [mensajeId])).then(r => r.rowCount! > 0)
      detalle = {
        empresa: c.empresaId,
        quien: de === mlUserId ? 'vendedor' : de ? 'comprador' : null,
        pack: msg.message_resources?.find(r => r.name === 'packs')?.id ?? null,
        recursos: msg.message_resources?.map(r => r.name) ?? [],
        app: msg.client_id != null ? String(msg.client_id) : null,
        nuestra_app: msg.client_id != null && String(msg.client_id) === process.env.ML_CLIENT_ID,
        creado: msg.message_date?.created ?? null,
        estado: msg.status ?? null,
        largo: msg.text?.length ?? null,
        ya_guardado: yaGuardado,
      }
    }
  } catch (e) {
    detalle = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }
  await dbGlobal().query(`UPDATE ml_notificaciones SET detalle = $2, leido_at = NOW() WHERE id = $1`, [id, JSON.stringify(detalle)])
    .catch(e => console.error('[ml notificaciones] detalle', e instanceof Error ? e.message : e))
}
