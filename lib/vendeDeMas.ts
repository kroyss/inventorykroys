// «Vende de más» (16-11-2026, el dueño, caso del kit 544 de PIKEKE): MercadoLibre ofrece unidades que el inventario no
// tiene. Dos niveles, con la misma cuenta que usa Stock en ML (lib/stockConML.ts: disponible = stock − ventas de ML sin
// registrar, combos «trae N u.», lo marcado «No sincronizar» no cuenta):
//   - sin: disponible 0 y alguna publicación ACTIVA con stock en ML (la venta que no se puede cumplir).
//   - mas: tiene algo, pero las activas suman más de lo que hay.
// Las pausadas no cuentan (no venden). Antes de decidir se releen de ML esas publicaciones (el catálogo guardado se
// actualiza cada 6 h y después de una venta mostraría stock viejo). El resultado se guarda en app_settings
// `stock_ml_vende_de_mas` (por empresa): de ahí salen el numerito del menú y el aviso de Telegram (sin recalcular).
import type { Pool } from 'pg'
import { filasStockML, type FilaStockML } from '@/lib/stockConML'
import { refrescarItems } from '@/lib/catalogoML'
import { grupoDe } from '@/lib/stockGrupos'

export type NivelVende = 'sin' | 'mas'
const CLAVE = 'stock_ml_vende_de_mas'
const CLAVE_TURNO = 'stock_ml_vende_turno'
/** Cada cuánto lo revisa el cron por empresa. */
export const MINUTOS_REVISION = 10
const TOPE_RELEER = 200

const nivelVende = (f: FilaStockML): NivelVende | null => f.vende

// 27-11: stock y comprometidas para explicar el 0 en el aviso (opcionales: estados guardados antes no los traen).
export interface ProductoVende { id: number; code: string; name: string; disponible: number; ofrece: number; cuentas: string[]; stock?: number; comprometidas?: number }
export interface EstadoVende {
  at: string
  sin: number
  mas: number
  /** Desde cuándo está cada producto en «sin» (el aviso sale una vez por cada vez que entra). */
  desde: Record<string, string>
  /** Los de «sin», para el texto del aviso (hasta 50). */
  lista: ProductoVende[]
  /** 17-11: los mismos grupos de Stock en ML (lib/stockGrupos.ts), para el numerito configurable en Mis avisos. */
  sinpub?: number; ajustar?: number; decidir?: number
  /** «Tienes y no vendes»: desde cuándo y los primeros 50 (aviso de Telegram). */
  desde_sinpub?: Record<string, string>
  lista_sinpub?: { id: number; code: string; name: string; disponible: number }[]
}

export async function leerEstadoVende(db: Pick<Pool, 'query'>): Promise<EstadoVende | null> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE])
  try { return r ? JSON.parse(r.value) as EstadoVende : null } catch { return null }
}

/** Calcula, relee de ML lo que parece vender de más y guarda el estado. Devuelve las filas ya frescas. */
export async function revisarVendeDeMas(db: Pool, pais: string): Promise<{ filas: FilaStockML[]; estado: EstadoVende }> {
  let filas = await filasStockML(db, pais)
  const items = [...new Set(filas.filter(f => nivelVende(f)).flatMap(f =>
    f.pubs.filter(p => p.estado === 'active' && (p.ml_disponible ?? 0) > 0).map(p => p.item_id)))].slice(0, TOPE_RELEER)
  if (items.length) {
    const { rows } = await db.query(`SELECT item_id, conexion_id FROM ml_catalogo WHERE item_id = ANY($1::text[])`, [items])
    const porCuenta = new Map<number, string[]>()
    for (const r of rows) porCuenta.set(r.conexion_id, [...(porCuenta.get(r.conexion_id) ?? []), r.item_id])
    let leidas = 0
    for (const [conexionId, ids] of porCuenta) {
      try { leidas += await refrescarItems(db, conexionId, ids) }
      catch (e) { console.error('[vende de más] releer', conexionId, e instanceof Error ? e.message : e) }
    }
    if (leidas) filas = await filasStockML(db, pais)
  }
  return { filas, estado: await guardarEstadoVende(db, filas) }
}

/** Guarda el estado con filas ya calculadas (al abrir Stock en ML, sin releer de ML: el numerito queda al día). */
export async function guardarEstadoVende(db: Pick<Pool, 'query'>, filas: FilaStockML[]): Promise<EstadoVende> {
  const antes = await leerEstadoVende(db)
  const ahora = new Date().toISOString()
  const desde: Record<string, string> = {}
  const lista: ProductoVende[] = []
  let sin = 0, mas = 0, sinpub = 0, ajustar = 0, decidir = 0
  const desdeSinpub: Record<string, string> = {}
  const listaSinpub: NonNullable<EstadoVende['lista_sinpub']> = []
  for (const f of filas) {
    const g = grupoDe(f)
    if (g === 'ajustar') ajustar++
    if (g === 'decidir') decidir++
    if (g === 'sinpub') {
      sinpub++
      desdeSinpub[f.product_id] = antes?.desde_sinpub?.[f.product_id] ?? ahora
      if (listaSinpub.length < 50) listaSinpub.push({ id: f.product_id, code: f.code, name: f.name, disponible: f.disponible })
    }
    const n = nivelVende(f)
    if (n === 'mas') mas++
    if (n !== 'sin') continue
    sin++
    desde[f.product_id] = antes?.desde?.[f.product_id] ?? ahora
    if (lista.length < 50) lista.push({
      id: f.product_id, code: f.code, name: f.name, disponible: f.disponible, ofrece: f.ofrece, stock: f.stock, comprometidas: f.comprometidas,
      cuentas: [...new Set(f.pubs.filter(p => p.estado === 'active' && (p.ml_disponible ?? 0) > 0).map(p => p.cuenta))],
    })
  }
  const estado: EstadoVende = { at: ahora, sin, mas, desde, lista, sinpub, ajustar, decidir, desde_sinpub: desdeSinpub, lista_sinpub: listaSinpub }
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [CLAVE, JSON.stringify(estado)])
  return estado
}

/** Para el cron: lo revisa si pasaron MINUTOS_REVISION (el turno se toma de forma atómica: las dos copias de la app
 *  corren el cron y solo una lo hace). Devuelve el estado, o null si no tocaba. */
export async function revisarSiToca(db: Pool, pais: string) {
  const { rows } = await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, NOW()::text)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value
     WHERE app_settings.value::timestamptz < NOW() - make_interval(mins => $2)
     RETURNING 1`, [CLAVE_TURNO, MINUTOS_REVISION])
  if (!rows.length) return null
  return (await revisarVendeDeMas(db, pais)).estado
}
