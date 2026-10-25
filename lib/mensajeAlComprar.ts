// MENSAJE AL COMPRAR (migración 118, 23-10-2026, pedido de un Fundador): a cada venta NUEVA de MercadoLibre le llega
// un mensaje propio de la empresa, unos minutos después de los dos automáticos de ML. Reglas (cuidando no infringir
// las de ML, que castiga los mensajes repetidos o publicitarios):
//   - APAGADO por defecto; texto de la empresa con {nombre} y {producto}; máximo MAX_TEXTO ya armado (ML corta sin avisar);
//   - UNA sola vez por venta (pack): ml_bienvenidas se anota ANTES de mandar (dos pasadas nunca mandan dos);
//   - solo las ventas hechas DESDE que se prendió (prenderlo no le escribe a las ventas viejas) y de las últimas 24 h;
//   - no se manda si la venta se canceló o el comprador ya escribió (no se pisa la conversación);
//   - justo antes de mandar se relee la orden y la conversación en ML.
// Para que llegue "al minuto" (25-10, paso 2a de notificaciones): la venta entra por el aviso de ML en segundos
// (lib/notificacionesML.ts) y el cron de cada minuto la manda pasado ESPERA_MIN. Solo si los avisos dejaron de llegar
// (avisosCaidos) se vuelve a lo de antes: traer de ML las ventas del último día cada SYNC_MIN minutos. Un aviso suelto
// perdido lo trae la sincronización de cada hora (llega más tarde, con las mismas reglas).
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { leerHilo } from '@/lib/mensajesML'
import { registrarOrigen } from '@/lib/respuestasOrigen'
import { sincronizarOrdenes } from '@/lib/calificacionesML'
import { armarTexto, MAX_TEXTO } from '@/lib/recordatoriosPago'
import { avisosCaidos } from '@/lib/notificacionesML'

export const CLAVE_CONFIG = 'mensaje_al_comprar'
const CLAVE_SYNC = 'mensaje_al_comprar_sync'
/** Minutos que se espera después de la compra (que primero lleguen los dos mensajes de ML; 25-10: 3 → 1). */
export const ESPERA_MIN = 1
const SYNC_MIN = 5
const MAX_POR_PASADA = 30
export { MAX_TEXTO }

export interface ConfigAlComprar { activo: boolean; texto: string; desde: string | null }

export const CONFIG_DEFECTO: ConfigAlComprar = {
  activo: false, desde: null,
  texto: '¡Hola {nombre}! Gracias por tu compra de {producto}. Por aquí te indicamos cómo pagar y coordinar el envío. Cualquier duda, escríbenos por este chat.',
}

export function leerConfig(valor: string | null | undefined): ConfigAlComprar {
  try {
    const v = JSON.parse(valor ?? '') as Partial<ConfigAlComprar>
    return { activo: !!v.activo, texto: v.texto?.trim() || CONFIG_DEFECTO.texto, desde: v.desde ?? null }
  } catch { return CONFIG_DEFECTO }
}

export async function leerConfigDb(db: Pool) {
  const { rows: [c] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_CONFIG])
  return leerConfig(c?.value)
}

/** Ventas a las que les toca: nuevas desde que se prendió, sin mensaje todavía, sin cancelar y sin que el comprador
 *  haya escrito. $1 = desde. Una por venta (pack). */
const SQL_CANDIDATOS = `
  WITH o AS (
    SELECT DISTINCT ON (COALESCE(o.pack_id, o.id)) COALESCE(o.pack_id, o.id) AS pack, o.id, o.conexion_id, o.fecha,
           o.comprador, o.comprador_nombre, COALESCE(o.detalle->0->>'titulo', o.productos) AS producto, o.productos
    FROM ml_ordenes o JOIN ml_conexiones x ON x.id = o.conexion_id AND x.estado = 'activa'
    WHERE o.fecha >= $1::timestamptz AND o.fecha > NOW() - INTERVAL '24 hours'
      AND o.fecha < NOW() - make_interval(mins => ${ESPERA_MIN})
    ORDER BY COALESCE(o.pack_id, o.id), o.fecha
  )
  SELECT o.pack::text, o.id::text, o.conexion_id, o.fecha, o.comprador, o.comprador_nombre, o.producto, o.productos
  FROM o
  WHERE NOT EXISTS (SELECT 1 FROM ml_bienvenidas b WHERE b.pack_id = o.pack)
    AND NOT EXISTS (SELECT 1 FROM ml_ordenes o2 WHERE COALESCE(o2.pack_id, o2.id) = o.pack AND o2.estado = 'cancelled')
    AND NOT EXISTS (SELECT 1 FROM ml_mensajes m WHERE m.pack_id = o.pack AND NOT m.propio AND m.fecha > o.fecha)
  ORDER BY o.fecha LIMIT ${MAX_POR_PASADA}`

interface Candidato {
  pack: string; id: string; conexion_id: number; fecha: string; comprador: string | null; comprador_nombre: string | null
  producto: string | null; productos: string | null
}

/** Lo llama el cron cada minuto (empresas con preguntas/mensajes). Barato si está apagado. */
export async function mensajeAlComprar(db: Pool) {
  const cfg = await leerConfigDb(db)
  if (!cfg.activo || !cfg.desde) return null
  // Ventas del último día cada SYNC_MIN minutos (una pasada del cron toma el turno), solo si los avisos no llegan.
  const { rows: [toca] } = !await avisosCaidos() ? { rows: [] as { value: string }[] } : await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, NOW()::text)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     WHERE app_settings.value::timestamptz < NOW() - make_interval(mins => ${SYNC_MIN})
     RETURNING value`, [CLAVE_SYNC])
  if (toca) {
    const { rows: cuentas } = await db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa'`)
    for (const c of cuentas) {
      try { await sincronizarOrdenes(db, c.id, true, 1) } catch (e) { console.error('[mensaje al comprar] ventas', c.nickname, e instanceof Error ? e.message : e) }
    }
  }
  const { rows } = await db.query<Candidato>(SQL_CANDIDATOS, [cfg.desde])
  let enviados = 0, saltados = 0, errores = 0
  for (const c of rows) {
    const r = await mandarUno(db, c, cfg)
    if (r === 'enviado') enviados++
    else if (r === 'error') errores++
    else saltados++
  }
  return rows.length ? { enviados, saltados, errores } : null
}

async function anotar(db: Pool, pack: string, estado: 'enviado' | 'saltado' | 'error', motivo: string | null, texto: string | null) {
  await db.query(
    `UPDATE ml_bienvenidas SET estado = $2, motivo = $3, texto = COALESCE($4, texto),
            enviado_at = CASE WHEN $2 = 'enviado' THEN NOW() ELSE enviado_at END
     WHERE pack_id = $1::bigint`, [pack, estado, motivo, texto])
}

async function mandarUno(db: Pool, c: Candidato, cfg: ConfigAlComprar): Promise<'enviado' | 'saltado' | 'error'> {
  // UNA vez: se anota antes de mandar. Si otra pasada ya la tomó, no se hace nada.
  const { rowCount } = await db.query(
    `INSERT INTO ml_bienvenidas (pack_id, orden_id) VALUES ($1::bigint, $2::bigint) ON CONFLICT (empresa_id, pack_id) DO NOTHING`,
    [c.pack, c.id])
  if (!rowCount) return 'saltado'
  // Staging tiene copias de los tokens de producción: NUNCA manda mensajes reales desde ahí.
  if (process.env.APP_ENV === 'staging') { await anotar(db, c.pack, 'saltado', 'staging: no se manda', null); return 'saltado' }
  try {
    const orden = await mlFetch<{ status?: string; buyer?: { id: number; first_name?: string } }>(db, c.conexion_id, `/orders/${c.id}`)
    if (orden.status === 'cancelled') { await anotar(db, c.pack, 'saltado', 'cancelada', null); return 'saltado' }
    if (!orden.buyer?.id) { await anotar(db, c.pack, 'error', 'ML no dijo quién es el comprador', null); return 'error' }
    const { rows: [cx] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [c.conexion_id])
    const seller = Number(cx.ml_user_id)
    const hilo = await leerHilo(db, c.conexion_id, c.pack, seller, false)
    if (hilo.mensajes.some(m => !m.propio && new Date(m.fecha) > new Date(c.fecha))) {
      await anotar(db, c.pack, 'saltado', 'el comprador escribió primero', null); return 'saltado'
    }
    const texto = armarTexto(cfg.texto, orden.buyer.first_name || c.comprador_nombre, c.producto)
    await mlFetch(db, c.conexion_id, `/messages/packs/${c.pack}/sellers/${seller}?tag=post_sale`, {
      method: 'POST', body: { from: { user_id: seller }, to: { user_id: orden.buyer.id }, text: texto },
    })
    await db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, productos, comprador_nick, comprador_nombre, ultimo_texto, ultimo_de_comprador, ultimo_at)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, FALSE, NOW())
       ON CONFLICT (empresa_id, pack_id) DO UPDATE SET ultimo_texto = EXCLUDED.ultimo_texto, ultimo_de_comprador = FALSE,
         ultimo_at = NOW(), actualizada_at = NOW()`,
      [c.pack, c.conexion_id, c.productos, c.comprador, c.comprador_nombre, texto])
    await anotar(db, c.pack, 'enviado', null, texto)
    await registrarOrigen(db, { modulo: 'mensajes', ref: String(c.pack), fuente: 'automatica', base: texto, texto })
    return 'enviado'
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    // No se reintenta (una sola vez, ante la duda no insistir): queda el motivo a la vista.
    await anotar(db, c.pack, 'error', e instanceof ErrorML ? `ML: ${msg}` : msg, null)
    console.error('[mensaje al comprar]', c.pack, msg)
    return 'error'
  }
}

/** Los últimos mensajes (para la pantalla). */
export async function ultimos(db: Pool) {
  const { rows } = await db.query(
    `SELECT b.pack_id::text AS pack, b.estado, b.motivo, b.texto, b.creado_at, b.enviado_at, o.comprador,
            COALESCE(o.detalle->0->>'titulo', o.productos) AS producto, x.nickname AS cuenta
     FROM ml_bienvenidas b
     LEFT JOIN LATERAL (SELECT comprador, detalle, productos, conexion_id FROM ml_ordenes WHERE COALESCE(pack_id, id) = b.pack_id LIMIT 1) o ON TRUE
     LEFT JOIN ml_conexiones x ON x.id = o.conexion_id
     WHERE b.creado_at > NOW() - INTERVAL '7 days' ORDER BY b.creado_at DESC LIMIT 50`)
  return rows
}
