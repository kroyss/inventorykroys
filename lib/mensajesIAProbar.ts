// Mi IA (09-11-2026, activación para clientes): probar la IA de MENSAJES con 10 mensajes REALES de compradores que el
// equipo ya contestó (últimos 30 días, una por conversación). La IA ve la conversación solo hasta ese mensaje
// (borradorMensaje con `hasta`) y responde con lo que hay hoy en Mi IA; se muestra junto a lo que contestó el equipo y si
// habría salido sola (las mismas reglas que el automático, sin horario ni tope). No manda nada ni toca la conversación.
// No descuenta créditos (módulo 'simulacion'): es para decidir si se enciende.
import type { Pool } from 'pg'
import { borradorMensaje } from '@/lib/mensajesIA'
import { mensajeCorregible, motivosMensaje } from '@/lib/mensajesIAPrueba'
import { AUTOMATICOS, textoPlano } from '@/lib/mensajesML'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'
import { registrarUso, type LlamadaIA } from '@/lib/ia'

export const PRUEBA_MENSAJES_N = 10
const AUTOMATICO = new RegExp(AUTOMATICOS, 'i')

export interface CasoMensaje {
  id: string; mensaje: string; titulo: string | null
  tuya: string | null; ia: string; decision: 'sola' | 'revisar' | 'nada'; motivos: string[]; error?: string
}

export async function probarMensajesIA(db: Pool, country: string, conInventario: boolean, usuarioId: number | string | null): Promise<CasoMensaje[]> {
  // Mensaje del comprador seguido de una respuesta del vendedor (la del equipo). Los avisos automáticos y lo que
  // ya mandó la IA no cuentan como respuesta del equipo.
  const { rows } = await db.query(
    `WITH m AS (
       SELECT pack_id, conexion_id, propio, texto, fecha,
              LEAD(propio) OVER w AS sig_propio, LEAD(texto) OVER w AS sig_texto, LEAD(fecha) OVER w AS sig_fecha
       FROM ml_mensajes WHERE fecha > NOW() - INTERVAL '30 days'
       WINDOW w AS (PARTITION BY pack_id ORDER BY fecha))
     SELECT DISTINCT ON (m.pack_id) m.pack_id::text AS pack, m.conexion_id, m.texto, m.fecha, m.sig_texto, x.ml_user_id,
            c.productos
     FROM m JOIN ml_conexiones x ON x.id = m.conexion_id AND x.estado = 'activa'
     LEFT JOIN ml_conversaciones c ON c.pack_id = m.pack_id
     WHERE NOT m.propio AND m.sig_propio AND length(trim(m.texto)) >= 3
       AND NOT EXISTS (SELECT 1 FROM ml_mensajes_ia i WHERE i.pack_id = m.pack_id AND i.enviada_at IS NOT NULL
                       AND i.enviada_at BETWEEN m.sig_fecha - INTERVAL '5 minutes' AND m.sig_fecha + INTERVAL '5 minutes')
     ORDER BY m.pack_id, m.fecha DESC`)
  const elegidos = rows
    .filter(r => !AUTOMATICO.test(String(r.sig_texto ?? '')))
    .sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha))
    .slice(0, PRUEBA_MENSAJES_N)
  const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
  const persona = leerMiIA(mi?.value)?.persona ?? []
  const llamadas: LlamadaIA[] = []
  const caso = async (r: typeof elegidos[number]): Promise<CasoMensaje> => {
    const fecha = new Date(r.fecha).toISOString()
    const base = { id: `${r.pack}-${fecha}`, mensaje: textoPlano(String(r.texto)).slice(0, 600), titulo: r.productos ? String(r.productos) : null, tuya: textoPlano(String(r.sig_texto ?? '')).slice(0, 600) }
    try {
      const b = await borradorMensaje(db, r.conexion_id, Number(r.ml_user_id), r.pack, country, conInventario, fecha)
      llamadas.push({ modelo: b.modelo, uso: b.uso })
      // Lo del vendedor ANTES de ese mensaje (los montos que ya dio no frenan).
      const { rows: antes } = await db.query(
        `SELECT texto FROM ml_mensajes WHERE pack_id = $1 AND propio AND fecha < $2 ORDER BY fecha`, [r.pack, fecha])
      const vendedorAntes = antes.map(x => String(x.texto)).join('\n')
      const motivos = motivosMensaje(b, base.mensaje, persona, vendedorAntes)
      // 12-11: igual que la automática, la frenada solo por confianza, vacía o "no hay" se corrige.
      if (mensajeCorregible(motivos)) {
        const k = await borradorMensaje(db, r.conexion_id, Number(r.ml_user_id), r.pack, country, conInventario, fecha,
          { anterior: b.respuesta, problemas: motivos }).catch(() => null)
        if (k) {
          llamadas.push({ modelo: k.modelo, uso: k.uso })
          if (k.respuesta && !motivosMensaje(k, base.mensaje, persona, vendedorAntes).length) return { ...base, ia: k.respuesta, decision: 'sola', motivos: [] }
        }
      }
      const decision = !b.respuesta && b.confianza === 'alta' && !motivos.length ? 'nada' : motivos.length ? 'revisar' : 'sola'
      return { ...base, ia: b.respuesta, decision, motivos }
    } catch (e) {
      return { ...base, ia: '', decision: 'revisar', motivos: ['Error de la IA'], error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
    }
  }
  // De a 3 en paralelo (cada una lee la conversación y la venta en ML).
  const out: CasoMensaje[] = []
  for (let i = 0; i < elegidos.length; i += 3) out.push(...await Promise.all(elegidos.slice(i, i + 3).map(caso)))
  if (llamadas.length) await registrarUso(db, 'simulacion', llamadas, usuarioId)
  return out
}
