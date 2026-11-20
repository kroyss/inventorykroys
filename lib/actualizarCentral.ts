// Central de actualización (18-11): estado de cada grupo y ejecutar uno. Usa EXACTAMENTE lo mismo que usaban los
// botones sueltos de cada pantalla (ver lib/actualizarGrupos.ts), sin consultas nuevas a MercadoLibre:
//   ventas        → sincronizarOrdenes de los últimos días (lo mismo que Por confirmar)
//   preguntas     → sincronizarEmpresa forzada (lo que hacía «Actualizar ahora» en Preguntas)
//   publicaciones → revisarStockCuenta: UNA lectura que deja al día catálogo y Stock (antes «Actualizar desde ML» y «Revisar ahora»)
//   promociones   → actualizarPromocionesEmpresa (antes «Actualizar desde MercadoLibre» en Promociones)
//   pagosme       → UNA traída de Pagos ME con pagos, guías y (con Inventario) pesos; si ya hay una en curso, se usa esa
import type { Pool } from 'pg'
import { GRUPOS, GRUPOS_ML, type Grupo } from '@/lib/actualizarGrupos'
import { sincronizarOrdenes, DIAS_RECIENTES } from '@/lib/calificacionesML'
import { sincronizarEmpresa } from '@/lib/preguntas'
import { revisarStockCuenta } from '@/lib/alertasStock'
import { actualizarPromocionesEmpresa } from '@/lib/promocionesML'
import { estadoTraida, ocupada, AYUDA_EXTENSION_TRABADA, AYUDA_SIN_SENAL, AYUDA_TRABADA } from '@/lib/meTraida'
import { esDemo } from '@/lib/demo'
import { asegurarPagosDemo, traerDemo } from '@/lib/demoDatos'

export interface EstadoGrupo {
  grupo: Grupo
  /** Última vez que quedó al día (la cuenta más atrasada). null = nunca. */
  at: string | null
  /** Pagos ME: hay una traída corriendo o esperando a la PC. */
  ocupado?: boolean
  /** Pagos ME: la traída espera y el programa de la PC no está abierto. */
  sinPC?: boolean
  /** Pagos ME: la última traída terminó con algún error. */
  error?: string | null
}

/** Estado de los grupos pedidos. Los de MercadoLibre salen solo si hay alguna cuenta conectada. */
export async function estadoCentral(db: Pool, grupos: Grupo[]): Promise<EstadoGrupo[]> {
  const { rows: [c] } = await db.query(`
    SELECT COUNT(*)::int AS cuentas,
           MIN(ordenes_sync_at) AS ventas, MIN(ultima_sync) AS preguntas,
           MIN(GREATEST(catalogo_at, stock_alertas_at)) AS publicaciones,
           (SELECT MIN(pc.actualizado_at) FROM ml_promociones_cache pc
              JOIN ml_conexiones x ON x.id = pc.conexion_id AND x.estado = 'activa') AS promociones
    FROM ml_conexiones WHERE estado = 'activa'`)
  const iso = (v: Date | string | null) => v ? new Date(v).toISOString() : null
  const res: EstadoGrupo[] = []
  for (const g of grupos) {
    if (GRUPOS_ML.includes(g)) {
      if (!c?.cuentas) continue
      res.push({ grupo: g, at: iso(c[g]) })
    } else if (g === 'pagosme') {
      const e = await estadoTraida(db)
      const errores = e?.cuentas.filter(x => x.hecho && !x.ok).map(x => `${x.nombre}: ${x.error ?? 'error'}`) ?? []
      // 19-11: la que no terminó también se dice (antes quedaba como lista sin esa cuenta), con qué hacer.
      if (e && !ocupada(e)) for (const x of e.cuentas) if (!x.hecho) errores.push(`${x.nombre} no respondió: ${x.lenta ? AYUDA_EXTENSION_TRABADA : x.sin_senal ? AYUDA_SIN_SENAL : AYUDA_TRABADA}`)
      res.push({ grupo: g, at: e?.terminada_at ?? null, ocupado: ocupada(e), sinPC: !!e?.esperando_pc,
        error: errores.length ? errores.join(' · ').slice(0, 200) : null })
    }
  }
  return res
}

/** Edad en minutos (null = nunca). */
const edadMin = (at: string | null) => at ? (Date.now() - new Date(at).getTime()) / 60_000 : Infinity

export type ResultadoGrupo = { ok: boolean; omitido?: boolean; errores?: string[]; pedido?: number }

/** Actualiza UN grupo. No relee lo que está al día (refrescarMin): así ni varios clics ni varias personas a la vez
 *  multiplican las consultas a MercadoLibre. */
export async function ejecutarGrupo(db: Pool, grupo: Grupo, opc: { userId: number; pesos: boolean }): Promise<ResultadoGrupo> {
  const def = GRUPOS.find(g => g.id === grupo)!
  const [estado] = await estadoCentral(db, [grupo])
  if (!estado) return { ok: false, errores: ['No hay ninguna cuenta de MercadoLibre conectada'] }
  if (grupo === 'pagosme') {
    if (await esDemo(db)) { await asegurarPagosDemo(db); return { ok: true, pedido: await traerDemo(db, opc.userId) } }
    // UNA traída a la vez (como el botón de Pagos ME): si hay una corriendo o esperando, se usa esa.
    const e = await estadoTraida(db)
    if (ocupada(e)) return { ok: true, pedido: e!.id }
    if (edadMin(estado.at) < def.refrescarMin) return { ok: true, omitido: true }
    const { rows: [p] } = await db.query(`INSERT INTO me_pedidos (pedido_por, pesos) VALUES ($1, $2) RETURNING id`, [opc.userId, opc.pesos])
    return { ok: true, pedido: p.id }
  }
  if (edadMin(estado.at) < def.refrescarMin) return { ok: true, omitido: true }

  const errores: string[] = []
  const { rows: cuentas } = await db.query<{ id: number; nickname: string }>(
    `SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const porCuenta = async (f: (id: number) => Promise<unknown>) => {
    for (const c of cuentas) {
      try { await f(c.id) } catch (e) { errores.push(`${c.nickname}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)) }
    }
  }
  if (grupo === 'ventas') {
    await porCuenta(async id => {
      await sincronizarOrdenes(db, id, true, DIAS_RECIENTES)
      // Con días explícitos no anota la hora (no cambia el ritmo del cron): aquí sí, la lectura reciente quedó hecha.
      await db.query(`UPDATE ml_conexiones SET ordenes_sync_at = NOW() WHERE id = $1`, [id])
    })
  } else if (grupo === 'preguntas') {
    for (const r of await sincronizarEmpresa(db, true)) {
      if (r.error) errores.push(`${r.cuenta}: ${r.error}`.slice(0, 200))
    }
  } else if (grupo === 'publicaciones') {
    await porCuenta(id => revisarStockCuenta(db, id))
  } else if (grupo === 'promociones') {
    for (const r of await actualizarPromocionesEmpresa(db)) if (!r.ok) errores.push(`${r.cuenta}: ${r.error ?? 'error'}`)
  }
  return { ok: !errores.length, errores }
}
