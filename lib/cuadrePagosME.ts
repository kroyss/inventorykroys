// Cuadre diario de Pagos ME (20-11-2026, el dueño: «no quiero que les pase lo de mi equipo, que una venta les quede
// por fuera»). Cada venta de MercadoLibre de entre 24 h y 6 días de una cuenta conectada a Pagos ME tiene que tener
// una explicación: TRAÍDA (me_pagos), en SEGUIMIENTO esperando pago o guía, o VISTA en el portal sin pago (saltadas de
// una lectura). Si una no tiene ninguna después de una lectura buena posterior a la venta, se escapó: se anota en
// seguimiento con motivo 'cuadre' (la próxima traída la pide por su número) y se avisa por Telegram al dueño de la
// plataforma. 21-11 (el dueño: «¿por qué me lo avisa como si fuera una preocupación real?»): pasar a seguimiento NO
// avisa; el Telegram sale recién cuando una traída la pidió por su número y no volvió (caída) y no se trajo por otra vía:
// esa sí se escapó o se cobró fuera de MercadoEnvíos. Una sola vez por venta (me_seguimiento.avisado_at, mig. 194).
// Solo cuentas cuya extensión informa lo que salta (1.3.9+, `modo`); la 1.3.6 lee los 7 días completos
// cada vez y no puede dejar ventas atrás. No toca nada en MercadoLibre ni en el portal.
import { conEmpresa, dbGlobal } from '@/lib/db'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarTelegram, esc } from '@/lib/telegram'
import type { Country } from '@/lib/types'

export interface CuadreCuenta { empresa_id: number; empresa: string; cuenta: string; nickname: string; ventas: string[] }
export interface CuadreResultado { nuevas: CuadreCuenta[]; siguen: CuadreCuenta[] }

/** Margen para que la venta llegue al portal y la lea una traída. */
const DESPUES_HORAS = 24
/** Ventana del portal: 7 días; se deja 1 de margen. */
const HASTA_DIAS = 6
/** Cuentas que NO mandan todo por MercadoEnvíos (p. ej. CONTAORIENTE91: 24 de 26 ventas nunca aparecen en su portal):
 *  ahí lo que falta es su forma de trabajar, no una pérdida. Solo se avisa si las sin explicación son pocas. */
const MAX_ESCAPADAS_PCT = 10
const MAX_ESCAPADAS_MIN = 3

export async function cuadrePagosME(opciones: { avisar?: boolean; empresa?: number } = {}): Promise<CuadreResultado> {
  const { rows: empresas } = await dbGlobal().query(
    `SELECT id, nombre, country FROM empresas
     WHERE is_active AND 'pagos_me' = ANY(modulos) AND ($1::int IS NULL OR id = $1) ORDER BY id`, [opciones.empresa ?? null])
  const out: CuadreCuenta[] = []
  const siguen: CuadreCuenta[] = []
  for (const e of empresas) {
    try {
      const filas = await conEmpresa(e.id, e.country as Country, async db => {
        const { rows: all } = await db.query(
          `WITH perf AS (
             SELECT DISTINCT ON (conexion_id) conexion_id, perfil, COALESCE(cuenta, perfil) AS cuenta
             FROM me_latidos WHERE conexion_id IS NOT NULL AND perfil <> 'DESPERTADOR' AND visto_at > NOW() - INTERVAL '3 days'
             ORDER BY conexion_id, visto_at DESC),
           lect AS (   -- lecturas buenas de versiones que informan (1.3.9+)
             SELECT p.pedido_at, e.k AS perfil, e.v FROM me_pedidos p CROSS JOIN LATERAL jsonb_each(p.resultados) e(k, v)
             WHERE p.pedido_at > NOW() - make_interval(days => $2 + 1) AND e.v->>'ok' = 'true' AND e.v->>'modo' IS NOT NULL
               AND e.v->>'modo' <> 'parcial'),
           salt AS (
             SELECT DISTINCT s->>'orden' AS orden FROM lect
             CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(lect.v->'saltadas') = 'array' THEN lect.v->'saltadas' ELSE '[]' END) s)
           SELECT f.cuenta, c.nickname, o.id::text AS venta, o.fecha,
             EXISTS (SELECT 1 FROM me_pagos m WHERE m.venta IN (o.id::text, COALESCE(o.pack_id::text, '')))
             OR EXISTS (SELECT 1 FROM me_seguimiento s WHERE s.orden IN (o.id::text, COALESCE(o.pack_id::text, '')))
             OR EXISTS (SELECT 1 FROM salt WHERE salt.orden IN (o.id::text, COALESCE(o.pack_id::text, ''))) AS explicada
           FROM perf f
           JOIN ml_conexiones c ON c.id = f.conexion_id
           JOIN ml_ordenes o ON o.conexion_id = f.conexion_id
           WHERE o.fecha > NOW() - make_interval(days => $2) AND o.fecha < NOW() - make_interval(hours => $1)
             -- hubo una lectura buena de ese perfil DESPUÉS de la venta (si no trajo nada desde entonces, no hay qué cuadrar)
             AND EXISTS (SELECT 1 FROM lect WHERE lect.perfil = f.perfil AND lect.pedido_at > o.fecha + INTERVAL '1 hour')
           ORDER BY f.cuenta, o.fecha`, [DESPUES_HORAS, HASTA_DIAS])
        const total = new Map<string, number>()
        for (const r of all) total.set(r.cuenta, (total.get(r.cuenta) ?? 0) + 1)
        const sueltas = all.filter(r => !r.explicada)
        const rows = sueltas.filter(r => {
          const n = sueltas.filter(x => x.cuenta === r.cuenta).length
          return n <= Math.max(MAX_ESCAPADAS_MIN, Math.floor((total.get(r.cuenta) ?? 0) * MAX_ESCAPADAS_PCT / 100))
        })
        const otraForma = [...new Set(sueltas.filter(r => !rows.includes(r)).map(r => `${r.nickname} ${sueltas.filter(x => x.cuenta === r.cuenta).length}/${total.get(r.cuenta)}`))]
        if (otraForma.length) console.log('[cuadre pagos me] no manda todo por MercadoEnvíos:', e.id, otraForma.join(' · '))
        // A seguimiento: la próxima traída (1.4.0 y 1.4.1) las pide por su número.
        if (rows.length) await db.query(
          `INSERT INTO me_seguimiento (cuenta, orden, venta, fecha_orden, motivo)
           SELECT x.cuenta, x.venta, x.venta, x.fecha::timestamptz, 'cuadre'
           FROM jsonb_to_recordset($1::jsonb) AS x(cuenta text, venta text, fecha text)
           ON CONFLICT (empresa_id, cuenta, orden) DO NOTHING`,
          [JSON.stringify(rows.map(r => ({ cuenta: r.cuenta, venta: r.venta, fecha: new Date(r.fecha).toISOString() })))])
        // Las de días anteriores que una traída ya pidió por su número y no volvieron (ni como pago ni como saltada).
        const { rows: sig } = await db.query(
          `UPDATE me_seguimiento s SET avisado_at = NOW()
           WHERE s.motivo = 'cuadre' AND s.caida_at IS NOT NULL AND s.avisado_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM me_pagos m WHERE m.venta IN (s.orden, COALESCE(s.venta, '')))
             AND $1::boolean   -- con avisar=0 (a mano) no se gasta el aviso
           RETURNING s.cuenta, s.orden AS venta,
             COALESCE((SELECT c.nickname FROM me_latidos l JOIN ml_conexiones c ON c.id = l.conexion_id
                       WHERE COALESCE(l.cuenta, l.perfil) = s.cuenta ORDER BY l.visto_at DESC LIMIT 1), s.cuenta) AS nickname`,
          [opciones.avisar !== false])
        return { rows, sig }
      })
      out.push(...agrupar(e, filas.rows))
      siguen.push(...agrupar(e, filas.sig))
    } catch (err) {
      console.error('[cuadre pagos me]', e.id, err instanceof Error ? err.message : err)
    }
  }
  if (out.length) console.log('[cuadre pagos me] a seguimiento:', out.map(c => `${c.empresa_id}/${c.nickname}: ${c.ventas.length}`).join(' · '))
  if (siguen.length) console.log('[cuadre pagos me] siguen sin aparecer:', siguen.map(c => `${c.empresa_id}/${c.nickname}: ${c.ventas.length}`).join(' · '))
  if (siguen.length && opciones.avisar !== false) {
    const lineas = siguen.map(c => `• <b>${esc(c.empresa)}</b> · ${esc(c.nickname)}: ${c.ventas.length} venta${c.ventas.length === 1 ? '' : 's'} ` +
      `(${c.ventas.slice(0, 8).map(esc).join(', ')}${c.ventas.length > 8 ? '…' : ''})`)
    const html = `🔎 <b>Cuadre de Pagos ME</b>: ventas que siguen sin aparecer en el portal de MercadoEnvíos
${lineas.join('\n')}
Las buscamos por su número y el portal no las tiene pagadas. Lo más probable: se cobraron fuera de MercadoEnvíos (retiro o acuerdo con el comprador). Si esa cuenta cobra todo por MercadoEnvíos, conviene revisarlas.`
    for (const chat of await chatsDuenoPlataforma().catch(() => [])) await enviarTelegram(chat, html).catch(() => {})
  }
  return { nuevas: out, siguen }
}

function agrupar(e: { id: number; nombre: string }, filas: { cuenta: string; nickname: string; venta: string }[]): CuadreCuenta[] {
  const porCuenta = new Map<string, CuadreCuenta>()
  for (const r of filas) {
    const k = `${r.cuenta}|${r.nickname}`
    if (!porCuenta.has(k)) porCuenta.set(k, { empresa_id: e.id, empresa: e.nombre, cuenta: r.cuenta, nickname: r.nickname, ventas: [] })
    porCuenta.get(k)!.ventas.push(r.venta)
  }
  return [...porCuenta.values()]
}

