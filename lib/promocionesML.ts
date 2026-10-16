// PROMOCIONES de MercadoLibre, Fase 1: SOLO LECTURA (2026-10-16, migración 094, módulo `promociones`).
//
// Foto, por cuenta, de lo que ML tiene en su Central de promociones (API seller-promotions, probada en
// MLV con PIKEKE): las campañas que ML ofrece (DEAL, …) y, de cada una, qué publicaciones ya están
// adentro (started, con su precio en promoción) o pueden entrar (candidate, con el precio mínimo que ML
// acepta). Más el precio y título de todas las publicaciones activas. Se guarda en ml_promociones_cache
// y se renueva con "Actualizar desde MercadoLibre": la pantalla no le pega a ML en cada vista.
//
// Lo que esta versión NO ve: el descuento individual del vendedor (PRICE_DISCOUNT) ya aplicado; ML solo
// lo da publicación por publicación (una consulta por publicación). Queda para la Fase 2.
import type { Pool } from 'pg'
import { mlFetch } from '@/lib/ml'

export interface CampanaML {
  id: string
  tipo: string                 // DEAL, MARKETPLACE_CAMPAIGN, SELLER_CAMPAIGN, …
  estado: string               // started, pending, …
  nombre: string
  inicio: string | null
  fin: string | null
  limite: string | null        // hasta cuándo se puede entrar
}

export interface PromoDeItem {
  campana: string              // id de la campaña
  estado: string               // started (adentro) · candidate (puede entrar) · pending · …
  precio: number | null        // precio en la promoción (started)
  minimo: number | null        // precio mínimo que acepta ML para entrar (candidate)
}

export interface ItemML {
  id: string
  titulo: string
  precio: number               // precio publicado (sin la promoción de campaña)
  estado: string
  promos: PromoDeItem[]
}

export interface FotoPromociones { campanas: CampanaML[]; items: ItemML[] }

const POR_PAGINA_CAMPANA = 49        // ML: "limit must be lower than 50"
const MAX_ITEMS = 2000

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Lee todo de ML para una cuenta y lo guarda. Devuelve la foto (o lanza el error de ML). */
export async function actualizarPromociones(db: Pool, conexionId: number): Promise<FotoPromociones> {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!c) throw new Error('Cuenta no encontrada')
  const uid = c.ml_user_id

  // 1) Publicaciones activas (ids) y su precio/título, de a 20 (multiget).
  const ids: string[] = []
  for (let offset = 0; offset < MAX_ITEMS; offset += 100) {
    const r = await mlFetch<{ results: string[]; paging: { total: number } }>(db, conexionId,
      `/users/${uid}/items/search?status=active&limit=100&offset=${offset}`)
    ids.push(...r.results)
    if (offset + 100 >= r.paging.total || r.results.length === 0) break
  }
  const items = new Map<string, ItemML>()
  for (let i = 0; i < ids.length; i += 20) {
    const lote = await mlFetch<{ code: number; body: { id: string; title: string; price: number; status: string } }[]>(
      db, conexionId, `/items?ids=${ids.slice(i, i + 20).join(',')}&attributes=id,title,price,status`)
    for (const x of lote) if (x.code === 200 && x.body) {
      items.set(x.body.id, { id: x.body.id, titulo: x.body.title, precio: Number(x.body.price), estado: x.body.status, promos: [] })
    }
  }

  // 2) Campañas que ML tiene para la cuenta.
  const r = await mlFetch<{ results: Record<string, unknown>[] }>(db, conexionId, `/seller-promotions/users/${uid}?app_version=v2`)
  const campanas: CampanaML[] = (r.results ?? []).map(p => ({
    id: String(p.id), tipo: String(p.type ?? ''), estado: String(p.status ?? ''), nombre: String(p.name ?? p.type ?? ''),
    inicio: (p.start_date as string) ?? null, fin: (p.finish_date as string) ?? null, limite: (p.deadline_date as string) ?? null,
  }))

  // 3) De cada campaña, sus publicaciones (adentro o candidatas), paginando con search_after.
  for (const camp of campanas) {
    let despues: string | null = null
    for (let vuelta = 0; vuelta < Math.ceil(MAX_ITEMS / POR_PAGINA_CAMPANA); vuelta++) {
      const q: string = `/seller-promotions/promotions/${encodeURIComponent(camp.id)}/items?promotion_type=${encodeURIComponent(camp.tipo)}`
        + `&app_version=v2&limit=${POR_PAGINA_CAMPANA}${despues ? `&search_after=${encodeURIComponent(despues)}` : ''}`
      const p: { results: Record<string, unknown>[]; paging?: { searchAfter?: string } } = await mlFetch(db, conexionId, q)
      for (const x of p.results ?? []) {
        const id = String(x.id)
        const it = items.get(id)
        if (!it) continue                    // pausada o de otra cuenta: no se muestra
        it.promos.push({ campana: camp.id, estado: String(x.status ?? ''), precio: num(x.price), minimo: num(x.min_discounted_price) })
        if (!it.precio && num(x.original_price)) it.precio = Number(x.original_price)
      }
      despues = p.paging?.searchAfter ?? null
      if (!despues || (p.results ?? []).length < POR_PAGINA_CAMPANA) break
    }
  }

  const foto: FotoPromociones = { campanas, items: [...items.values()] }
  await db.query(
    `INSERT INTO ml_promociones_cache (conexion_id, datos, error, actualizado_at) VALUES ($1, $2, NULL, NOW())
     ON CONFLICT (empresa_id, conexion_id) DO UPDATE SET datos = EXCLUDED.datos, error = NULL, actualizado_at = NOW()`,
    [conexionId, JSON.stringify(foto)])
  return foto
}

/** Anota el error de una cuenta sin borrar la última foto buena. */
export async function anotarErrorPromociones(db: Pool, conexionId: number, error: string) {
  await db.query(
    `INSERT INTO ml_promociones_cache (conexion_id, datos, error, actualizado_at) VALUES ($1, '{"campanas":[],"items":[]}', $2, NOW())
     ON CONFLICT (empresa_id, conexion_id) DO UPDATE SET error = EXCLUDED.error`, [conexionId, error.slice(0, 300)])
}
