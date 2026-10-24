// Notificaciones de ML, paso 1b (24-10, mig 121): de cada aviso de MENSAJE se lee el mensaje en ML y se anota quién lo
// escribió, en qué conversación y desde qué aplicación (sin el texto). Solo para medir: no dispara nada.
// ml_notificaciones es global; la cuenta (ml_conexiones, por empresa con RLS) se busca empresa por empresa y se guarda
// en memoria unos minutos.
import { conEmpresa, dbGlobal } from '@/lib/db'
import { mlFetch } from '@/lib/ml'
import type { Country } from '@/lib/types'

interface Cuenta { empresaId: number; country: Country; conexionId: number }
let mapa: { at: number; cuentas: Map<string, Cuenta> } | null = null
const MAPA_MIN = 10

async function cuentaDe(mlUserId: string): Promise<Cuenta | null> {
  if (!mapa || Date.now() - mapa.at > MAPA_MIN * 60_000) {
    const cuentas = new Map<string, Cuenta>()
    const { rows: empresas } = await dbGlobal().query(`SELECT id, country FROM empresas`)
    for (const e of empresas) {
      const { rows } = await conEmpresa(e.id, e.country as Country, db =>
        db.query(`SELECT id, ml_user_id::text AS u FROM ml_conexiones WHERE estado = 'activa'`))
      for (const r of rows) cuentas.set(r.u, { empresaId: e.id, country: e.country as Country, conexionId: r.id })
    }
    mapa = { at: Date.now(), cuentas }
  }
  return mapa.cuentas.get(mlUserId) ?? null
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
