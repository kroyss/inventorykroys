// Poner en ML lo que calcula Stock en ML (lib/stockConML.ts) para UNA publicación. Lo usan «Aplicar en ML» (directo,
// pocas) y la cola de MercadoLibre (17-11, lib/colaML.ts: tipo 'stock', cuando son más de 10): siempre con lo que el
// servidor calcula EN ESE MOMENTO, nunca con un número guardado al encolar (entre medio puede entrar una venta).
import type { Pool } from 'pg'
import { filasStockML, type FilaStockML, type PubStockML } from '@/lib/stockConML'
import { aplicarCambio, type Resultado } from '@/lib/stockML'

// La cola procesa varias publicaciones seguidas de la misma empresa: el cálculo (~0,4 s) se reusa unos segundos.
const cache = new Map<string, { at: number; filas: Promise<FilaStockML[]> }>()
export async function filasRecientes(db: Pool, pais: string, empresa: string) {
  const c = cache.get(empresa)
  if (c && Date.now() - c.at < 15_000) return c.filas
  const filas = filasStockML(db, pais)
  cache.set(empresa, { at: Date.now(), filas })
  filas.catch(() => cache.delete(empresa))
  return filas
}

export function pubsPorClave(filas: FilaStockML[]) {
  return new Map<string, PubStockML>(filas.flatMap(f => f.pubs).map(p => [`${p.item_id}:${p.variante_id ?? ''}`, p]))
}

export async function igualarPub(db: Pool, pubs: Map<string, PubStockML>, x: { item_id: string; variante_id: string | null },
  usuarioId: number | null): Promise<Resultado> {
  const p = pubs.get(`${x.item_id}:${x.variante_id ?? ''}`)
  if (!p || p.objetivo == null) return { item_id: x.item_id, variante_id: x.variante_id, ok: false, error: 'Esta publicación no se iguala desde aquí' }
  // 17-11: vinculada entera con variantes y todos sus productos en 0 → cada variante a 0 (un solo resultado por fila).
  if (p.entera_con_variantes) {
    if (p.objetivo !== 0) return { item_id: x.item_id, variante_id: x.variante_id, ok: false, error: 'Divídela por variantes primero' }
    let error: string | undefined
    for (const v of p.variantes_ml ?? []) {
      const r = await aplicarCambio(db, { item_id: p.item_id, variante_id: v.id, cantidad: 0 }, { reactivar: false, origen: 'stock_ml', usuarioId })
      if (!r.ok) error ??= `${v.nombre ?? v.id}: ${r.error ?? 'no se pudo'}`
    }
    return { item_id: x.item_id, variante_id: x.variante_id, ok: !error, error, estado: p.estado ?? undefined, disponible: 0 }
  }
  if (p.objetivo === p.ml_disponible && !p.reactivar) return { item_id: x.item_id, variante_id: x.variante_id, ok: true, estado: p.estado ?? undefined, disponible: p.objetivo }
  return aplicarCambio(db, { item_id: p.item_id, variante_id: p.variante_id, cantidad: p.objetivo }, { reactivar: p.reactivar, origen: 'stock_ml', usuarioId })
}
