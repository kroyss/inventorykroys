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
      // Una campaña propia que todavía no empieza (o recién borrada) puede no listar sus publicaciones:
      // se sigue con las demás en vez de fallar toda la cuenta.
      let p: { results: Record<string, unknown>[]; paging?: { searchAfter?: string } }
      try { p = await mlFetch(db, conexionId, q) } catch { break }
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

  // 4) La verdad la da el precio vigente de cada publicación (2026-10-16): el listado de cada campaña tarda en
  //    enterarse de quién entró o salió. De a 8 en paralelo.
  const lista = [...items.values()]
  for (let i = 0; i < lista.length; i += 8) {
    await Promise.all(lista.slice(i, i + 8).map(async it => {
      const v = await precioVigente(db, conexionId, it.id)
      if (!v) return
      if (v.campana) {
        const p = it.promos.find(x => x.campana === v.campana)
        if (p) { p.estado = 'started'; p.precio = v.amount }
        else it.promos.push({ campana: v.campana, estado: 'started', precio: v.amount, minimo: null })
      }
    }))
  }

  const foto: FotoPromociones = { campanas, items: lista }
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

// ── Fase 2 (migración 097): actuar en ML. Cada acción queda en ml_promociones_acciones. ──────────
// Probado en MLV el 16-10 con PIKEKE: crear campaña propia (SELLER_CAMPAIGN), agregarle una publicación
// con deal_price y borrarla. Unirse a una campaña de ML (DEAL) usa el mismo POST con su promotion_type.

export interface Accion {
  conexionId: number; usuarioId: number
  accion: 'crear_campana' | 'editar_campana' | 'borrar_campana' | 'agregar' | 'quitar'
  campanaId?: string | null; campanaTipo?: string | null; campanaNombre?: string | null
  itemId?: string | null; precio?: number | null; precioAntes?: number | null
}

async function registrar(db: Pool, a: Accion, ok: boolean, detalle: string | null) {
  await db.query(
    `INSERT INTO ml_promociones_acciones (conexion_id, accion, campana_id, campana_tipo, campana_nombre, item_id,
                                          precio, precio_antes, resultado, detalle, usuario_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.conexionId, a.accion, a.campanaId ?? null, a.campanaTipo ?? null, a.campanaNombre ?? null, a.itemId ?? null,
     a.precio ?? null, a.precioAntes ?? null, ok ? 'ok' : 'error', detalle?.slice(0, 500) ?? null, a.usuarioId]).catch(() => {})
}

/** Campaña propia: ML no deja que dure más de esto (probado el 16-10: 31 días sí, 45 no). */
export const MAX_DIAS_CAMPANA = 31

/** Los errores de ML que se ven en pantalla, en español y con qué hacer. */
export function errorClaro(msg: string) {
  if (/CREDIBILITY_DISCOUNTED_PRICE|not credible/i.test(msg)) {
    return 'ML no lo acepta: ese precio no es una rebaja real comparado con lo que costó la publicación en las últimas semanas. Prueba con más descuento.'
  }
  if (/maximum period cannot exceed/i.test(msg)) return `La campaña puede durar como máximo ${MAX_DIAS_CAMPANA} días.`
  if (/No offers found/i.test(msg)) return 'Esa publicación ya no está en la campaña.'
  return msg
}
export const esNoCreible = (msg: string) => /CREDIBILITY_DISCOUNTED_PRICE|not credible/i.test(msg)

/** Hace la acción en ML y la registra. Devuelve { ok, error?, datos? } (nunca lanza por un error de ML). */
async function hacer<T>(db: Pool, a: Accion, fn: () => Promise<T>): Promise<{ ok: true; datos: T } | { ok: false; error: string }> {
  try {
    const datos = await fn()
    await registrar(db, a, true, null)
    return { ok: true, datos }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await registrar(db, a, false, error)
    return { ok: false, error: errorClaro(error) }
  }
}

/** Fechas de ML para campañas: "YYYY-MM-DDTHH:MM:SS" en hora local de Venezuela. */
const fechaML = (fecha: string, fin = false) => {
  if (fin) return `${fecha}T23:59:59`
  // Empieza HOY: desde ya (la hora de ahora en Venezuela), para no mandar un inicio en el pasado.
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Caracas' }).replace(' ', 'T')
  return fecha === ahora.slice(0, 10) ? ahora.slice(0, 19) : `${fecha}T00:00:00`
}

export async function crearCampana(db: Pool, conexionId: number, usuarioId: number, nombre: string, desde: string, hasta: string) {
  return hacer(db, { conexionId, usuarioId, accion: 'crear_campana', campanaTipo: 'SELLER_CAMPAIGN', campanaNombre: nombre },
    async () => {
      const r = await mlFetch<Record<string, unknown>>(db, conexionId, `/seller-promotions/promotions?app_version=v2`, {
        method: 'POST',
        body: { promotion_type: 'SELLER_CAMPAIGN', name: nombre, sub_type: 'FLEXIBLE_PERCENTAGE', start_date: fechaML(desde), finish_date: fechaML(hasta, true) },
      })
      // El listado de ML tarda unos segundos en mostrar la campaña nueva: se anota ya en las conocidas y
      // actualizarCampanas la suma mientras ML no la liste (ver abajo).
      await db.query(
        `INSERT INTO ml_campanas_vistas (conexion_id, campana_id, tipo, nombre, inicio, fin)
         VALUES ($1, $2, 'SELLER_CAMPAIGN', $3, $4::timestamptz, $5::timestamptz)
         ON CONFLICT (empresa_id, conexion_id, campana_id) DO NOTHING`,
        [conexionId, String(r.id), nombre, (r.start_date as string) ?? null, (r.finish_date as string) ?? null])
      await actualizarCampanas(db, conexionId)
      return { id: String(r.id), nombre }
    })
}

/**
 * Editar una campaña propia (probado el 16-10). Antes de empezar se cambian nombre, inicio y fin; ya empezada
 * solo nombre y fin (si se manda el inicio ML responde "start_date cannot be modified for the current status").
 */
export async function editarCampana(db: Pool, conexionId: number, usuarioId: number, campanaId: string,
  nombre: string, desde: string | null, hasta: string) {
  return hacer(db, { conexionId, usuarioId, accion: 'editar_campana', campanaId, campanaTipo: 'SELLER_CAMPAIGN', campanaNombre: nombre },
    async () => {
      const estado = await estadoCampana(db, conexionId, campanaId, 'SELLER_CAMPAIGN')
      const conInicio = estado !== 'started' && desde != null
      const r = await mlFetch<Record<string, unknown>>(db, conexionId, `/seller-promotions/promotions/${encodeURIComponent(campanaId)}?app_version=v2`, {
        method: 'PUT',
        body: { promotion_type: 'SELLER_CAMPAIGN', name: nombre, ...(conInicio ? { start_date: fechaML(desde!) } : {}), finish_date: fechaML(hasta, true) },
      })
      await db.query(
        `UPDATE ml_campanas_vistas SET nombre = $3, inicio = COALESCE($4::timestamptz, inicio), fin = $5::timestamptz
         WHERE conexion_id = $1 AND campana_id = $2`,
        [conexionId, campanaId, nombre, conInicio ? (r.start_date as string) ?? null : null, (r.finish_date as string) ?? null])
      await actualizarCampanas(db, conexionId)
      return { estado: String(r.status ?? estado ?? ''), inicioCambiado: conInicio }
    })
}

/** En qué estado figura la publicación en esa campaña según ML (started, pending, candidate…);
 *  'fuera' si ya no aparece; null si no se pudo leer. */
async function estadoEnCampana(db: Pool, conexionId: number, itemId: string, campanaId: string): Promise<string | null> {
  const r = await mlFetch<{ id?: string; status?: string }[]>(db, conexionId,
    `/seller-promotions/items/${encodeURIComponent(itemId)}?app_version=v2`).catch(() => null)
  if (!Array.isArray(r)) return null
  return r.find(p => p.id === campanaId)?.status ?? 'fuera'
}

/** Estado actual de una campaña según ML (started, pending, finished…); null si no se pudo leer. */
export async function estadoCampana(db: Pool, conexionId: number, campanaId: string, tipo: string): Promise<string | null> {
  const r = await mlFetch<{ status?: string }>(db, conexionId,
    `/seller-promotions/promotions/${encodeURIComponent(campanaId)}?promotion_type=${encodeURIComponent(tipo)}&app_version=v2`).catch(() => null)
  return r?.status ?? null
}

// ── Precio REAL de la publicación (2026-10-16) ─────────────────────────────
// La API que lista "en qué promoción está" una publicación (seller-promotions/items) tarda en enterarse, y
// al agregar a una campaña propia que todavía no empezó ML responde 201 pero NO guarda la oferta. Por eso
// cada cambio se comprueba con el precio vigente (/items/{id}/sale_price): dice a qué campaña pertenece.
interface PrecioVigente { amount: number; regular: number | null; campana: string | null }
async function precioVigente(db: Pool, conexionId: number, itemId: string): Promise<PrecioVigente | null> {
  const r = await mlFetch<{ amount?: number; regular_amount?: number | null; metadata?: { campaign_id?: string } }>(
    db, conexionId, `/items/${encodeURIComponent(itemId)}/sale_price`).catch(() => null)
  if (!r || r.amount == null) return null
  return { amount: Number(r.amount), regular: r.regular_amount != null ? Number(r.regular_amount) : null, campana: r.metadata?.campaign_id ?? null }
}
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Precios de promoción guardados (activos o por empezar). Una publicación puede estar en VARIAS a la vez
 *  (probado 16-10: 15% a $5,33 y Ofertas top Q4 a $5,64): ML cobra la más baja y, cuando esa termina, la otra. */
async function preciosPromo(db: Pool, conexionId: number, itemId: string): Promise<number[]> {
  const r = await mlFetch<{ prices?: { type: string; amount: number; conditions?: { end_time?: string | null } }[] }>(
    db, conexionId, `/items/${encodeURIComponent(itemId)}/prices`).catch(() => null)
  const ahora = Date.now()
  return (r?.prices ?? []).filter(p => p.type === 'promotion' && (!p.conditions?.end_time || Date.parse(p.conditions.end_time) > ahora))
    .map(p => Number(p.amount))
}

/** Anota en la foto guardada una publicación en esa campaña a ese precio (precio null = salió de ella).
 *  Las demás promociones de la publicación no se tocan: puede estar en varias a la vez. */
async function marcarEnFoto(db: Pool, conexionId: number, itemId: string, campanaId: string, precio: number | null) {
  await db.query(
    `UPDATE ml_promociones_cache SET datos = jsonb_set(datos, '{items}', (
       SELECT COALESCE(jsonb_agg(CASE WHEN i->>'id' = $2 THEN jsonb_set(i, '{promos}',
         CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(i->'promos') p WHERE p->>'campana' = $3)
           THEN (SELECT jsonb_agg(CASE WHEN p->>'campana' = $3
                   THEN jsonb_set(jsonb_set(p, '{estado}', to_jsonb(CASE WHEN $4::numeric IS NULL THEN 'candidate' ELSE 'started' END)), '{precio}', COALESCE(to_jsonb($4::numeric), 'null'))
                   ELSE p END) FROM jsonb_array_elements(i->'promos') p)
           ELSE COALESCE(i->'promos', '[]'::jsonb) || CASE WHEN $4::numeric IS NULL THEN '[]'::jsonb
                ELSE jsonb_build_array(jsonb_build_object('campana', $3, 'estado', 'started', 'precio', $4::numeric, 'minimo', NULL)) END
         END) ELSE i END), '[]'::jsonb)
       FROM jsonb_array_elements(datos->'items') i))
     WHERE conexion_id = $1`,
    [conexionId, itemId, campanaId, precio])
}

/** ¿Qué publicaciones tiene esta campaña? Las que ML lista como adentro + las agregadas desde el sistema. */
async function publicacionesDeCampana(db: Pool, conexionId: number, campanaId: string, tipo: string) {
  const ids = new Set<string>()
  let despues: string | null = null
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const q: string = `/seller-promotions/promotions/${encodeURIComponent(campanaId)}/items?promotion_type=${encodeURIComponent(tipo)}`
      + `&app_version=v2&limit=${POR_PAGINA_CAMPANA}${despues ? `&search_after=${encodeURIComponent(despues)}` : ''}`
    let p: { results: Record<string, unknown>[] | null; paging?: { searchAfter?: string } }
    try { p = await mlFetch(db, conexionId, q) } catch { break }
    for (const x of p.results ?? []) if (x.status === 'started' || x.status === 'pending') ids.add(String(x.id))
    despues = p.paging?.searchAfter ?? null
    if (!despues || (p.results ?? []).length < POR_PAGINA_CAMPANA) break
  }
  const { rows } = await db.query(
    `SELECT DISTINCT ON (item_id) item_id, accion FROM ml_promociones_acciones
     WHERE conexion_id = $1 AND campana_id = $2 AND resultado = 'ok' AND item_id IS NOT NULL
     ORDER BY item_id, creado_at DESC`, [conexionId, campanaId])
  for (const r of rows) if (r.accion === 'agregar') ids.add(r.item_id)
  return [...ids]
}

/**
 * Borrar una campaña propia. ML NO quita el descuento de sus publicaciones al borrar la campaña (probado el
 * 16-10: quedó "deleted" y la publicación seguía con el precio rebajado), así que primero se saca cada una
 * y se comprueba que volvió a su precio; recién ahí se borra la campaña.
 */
export async function borrarCampana(db: Pool, conexionId: number, usuarioId: number, campanaId: string, nombre: string | null) {
  return hacer(db, { conexionId, usuarioId, accion: 'borrar_campana', campanaId, campanaTipo: 'SELLER_CAMPAIGN', campanaNombre: nombre },
    async () => {
      const items = await publicacionesDeCampana(db, conexionId, campanaId, 'SELLER_CAMPAIGN')
      const fallaron: string[] = []
      for (const id of items) {
        const r = await quitarDeCampana(db, conexionId, usuarioId, id, { id: campanaId, tipo: 'SELLER_CAMPAIGN', nombre })
        if (!r.ok && !/ya no está/.test(r.error)) fallaron.push(id)
      }
      if (fallaron.length) throw new Error(`No se pudo sacar de la campaña: ${fallaron.join(', ')}. La campaña no se borró para no dejarlas con descuento.`)
      await mlFetch(db, conexionId, `/seller-promotions/promotions/${encodeURIComponent(campanaId)}?promotion_type=SELLER_CAMPAIGN&app_version=v2`, { method: 'DELETE' })
      await db.query(`DELETE FROM ml_campanas_vistas WHERE conexion_id = $1 AND campana_id = $2`, [conexionId, campanaId])
      await actualizarCampanas(db, conexionId)
      return { sacadas: items.length }
    })
}

/**
 * Cambiar el precio de una publicación que YA está en una campaña (probado 17-10 en una propia): volver a
 * agregarla (POST) responde 201 pero deja el precio viejo; con PUT sí cambia. Se comprueba con los precios
 * guardados de la publicación. Se registra como 'agregar' (el último precio de esa campaña es el que vale).
 */
export async function cambiarPrecioEnCampana(db: Pool, conexionId: number, usuarioId: number,
  item: { id: string; precio: number; precioAntes: number }, campana: { id: string; tipo: string; nombre: string | null }) {
  const precio = Math.round(item.precio * 100) / 100
  return hacer(db, { conexionId, usuarioId, accion: 'agregar', campanaId: campana.id, campanaTipo: campana.tipo, campanaNombre: campana.nombre,
    itemId: item.id, precio, precioAntes: item.precioAntes },
    async () => {
      await mlFetch(db, conexionId, `/seller-promotions/items/${encodeURIComponent(item.id)}?app_version=v2`, {
        method: 'PUT', body: { promotion_id: campana.id, promotion_type: campana.tipo, deal_price: precio },
      })
      let guardado = false
      for (let i = 0; i < 4 && !guardado; i++) {
        await esperar(1500)
        guardado = (await preciosPromo(db, conexionId, item.id)).some(a => Math.abs(a - precio) < 0.011)
      }
      if (!guardado) throw new Error('MercadoLibre respondió que sí, pero el precio nuevo no quedó guardado en la publicación')
      await marcarEnFoto(db, conexionId, item.id, campana.id, precio)
      return { precio, manda: null as number | null }
    })
}

/** % por defecto de las campañas propias ({ "C-MLV…": 15 }): el que se propone al agregar publicaciones. */
export async function leerPctCampanas(db: Pool): Promise<Record<string, number>> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'promo_pct_campanas'`)
  try { return r?.value ? JSON.parse(r.value) : {} } catch { return {} }
}
export async function guardarPctCampana(db: Pool, campanaId: string, pct: number) {
  const actual = await leerPctCampanas(db)
  actual[campanaId] = pct
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('promo_pct_campanas', $1)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(actual)])
}

/**
 * Agregar una publicación a una campaña YA INICIADA (de ML o propia) a un precio, y comprobarlo con el precio
 * real. Si ML dice "ok" pero el precio vigente no es de esa campaña, se toma como error.
 */
export async function agregarACampana(db: Pool, conexionId: number, usuarioId: number,
  item: { id: string; precio: number; precioAntes: number }, campana: { id: string; tipo: string; nombre: string | null }) {
  const precio = Math.round(item.precio * 100) / 100
  return hacer(db, { conexionId, usuarioId, accion: 'agregar', campanaId: campana.id, campanaTipo: campana.tipo, campanaNombre: campana.nombre,
    itemId: item.id, precio, precioAntes: item.precioAntes },
    async () => {
      await mlFetch(db, conexionId, `/seller-promotions/items/${encodeURIComponent(item.id)}?app_version=v2`, {
        method: 'POST', body: { promotion_id: campana.id, promotion_type: campana.tipo, deal_price: precio },
      })
      let v: PrecioVigente | null = null
      let guardado = false
      for (let i = 0; i < 4 && !guardado; i++) {
        await esperar(1500)
        v = await precioVigente(db, conexionId, item.id)
        guardado = v?.campana === campana.id || (await preciosPromo(db, conexionId, item.id)).some(a => Math.abs(a - precio) < 0.011)
      }
      if (!guardado) throw new Error('MercadoLibre respondió que sí, pero el precio no quedó guardado en la publicación: no entró a la campaña')
      await marcarEnFoto(db, conexionId, item.id, campana.id, precio)
      // Hoy manda otra promoción más baja: esta queda guardada y se aplica cuando aquella termine.
      return { precio, manda: v && v.campana !== campana.id && v.amount < precio ? v.amount : null }
    })
}

/** Sacar una publicación de una campaña y comprobar que dejó de tener ese precio. */
export async function quitarDeCampana(db: Pool, conexionId: number, usuarioId: number, itemId: string, campana: { id: string; tipo: string; nombre: string | null }) {
  return hacer(db, { conexionId, usuarioId, accion: 'quitar', campanaId: campana.id, campanaTipo: campana.tipo, campanaNombre: campana.nombre, itemId },
    async () => {
      await mlFetch(db, conexionId, `/seller-promotions/items/${encodeURIComponent(itemId)}?promotion_type=${encodeURIComponent(campana.tipo)}`
        + `&promotion_id=${encodeURIComponent(campana.id)}&app_version=v2`, { method: 'DELETE' })
      // Al SACAR, lo que tarda es el precio (probado 17-10: la publicación ya figuraba "candidate" en la
      // campaña y /sale_price seguía con el precio de la promo unos minutos). Salió si el precio ya no es de
      // la campaña O si ML ya no la lista adentro; en ese caso el precio vuelve solo en unos minutos.
      let v: PrecioVigente | null = null
      let fuera = false
      for (let i = 0; i < 4; i++) {
        await esperar(1500)
        v = await precioVigente(db, conexionId, itemId)
        if (v?.campana !== campana.id) break
        const estado = await estadoEnCampana(db, conexionId, itemId, campana.id)
        if (estado != null && estado !== 'started' && estado !== 'pending') { fuera = true; break }
      }
      if (v?.campana === campana.id && !fuera) throw new Error('MercadoLibre respondió que sí, pero la publicación sigue en la campaña')
      await marcarEnFoto(db, conexionId, itemId, campana.id, null)
      return { precioTarda: v?.campana === campana.id }
    })
}

/** Relee solo la lista de campañas de la cuenta (1 consulta) y anota las nuevas en ml_campanas_vistas.
 *  Devuelve las que aparecieron por primera vez. */
export async function actualizarCampanas(db: Pool, conexionId: number): Promise<CampanaML[]> {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  if (!c) return []
  const r = await mlFetch<{ results: Record<string, unknown>[] }>(db, conexionId, `/seller-promotions/users/${c.ml_user_id}?app_version=v2`)
  const campanas: CampanaML[] = (r.results ?? []).filter(p => p.status !== 'deleted').map(p => ({
    id: String(p.id), tipo: String(p.type ?? ''), estado: String(p.status ?? ''), nombre: String(p.name ?? p.type ?? ''),
    inicio: (p.start_date as string) ?? null, fin: (p.finish_date as string) ?? null, limite: (p.deadline_date as string) ?? null,
  }))
  // Propias recién creadas que ML todavía no lista (tarda unos segundos): se suman igual.
  const { rows: recientes } = await db.query(
    `SELECT campana_id, nombre, inicio, fin FROM ml_campanas_vistas
     WHERE conexion_id = $1 AND tipo = 'SELLER_CAMPAIGN' AND primera_vez_at > NOW() - INTERVAL '30 minutes'`, [conexionId])
  for (const k of recientes) {
    if (!campanas.some(c => c.id === k.campana_id)) {
      campanas.push({ id: k.campana_id, tipo: 'SELLER_CAMPAIGN', estado: 'pending', nombre: k.nombre,
        inicio: k.inicio ? new Date(k.inicio).toISOString() : null, fin: k.fin ? new Date(k.fin).toISOString() : null, limite: null })
    }
  }
  await db.query(
    `UPDATE ml_promociones_cache SET datos = jsonb_set(datos, '{campanas}', $2::jsonb) WHERE conexion_id = $1`,
    [conexionId, JSON.stringify(campanas)])
  // La primera vez que se miran las campañas de una cuenta, las que ya estaban no son "nuevas" (no se avisan).
  const { rows: [antes] } = await db.query(`SELECT COUNT(*)::int AS n FROM ml_campanas_vistas WHERE conexion_id = $1`, [conexionId])
  const nuevas: CampanaML[] = []
  for (const k of campanas) {
    const { rows: [n] } = await db.query(
      `INSERT INTO ml_campanas_vistas (conexion_id, campana_id, tipo, nombre, inicio, fin, limite)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz)
       ON CONFLICT (empresa_id, conexion_id, campana_id) DO UPDATE SET nombre = EXCLUDED.nombre, fin = EXCLUDED.fin,
         limite = EXCLUDED.limite, visto_at = NOW()
       RETURNING (xmax = 0) AS nueva`, [conexionId, k.id, k.tipo, k.nombre, k.inicio, k.fin, k.limite])
    if (n?.nueva) nuevas.push(k)
  }
  return antes.n === 0 ? [] : nuevas
}

/**
 * Cron (cada 6 h por empresa, solo Inventario + Promociones, VE): relee las campañas de cada cuenta y anota
 * las nuevas en ml_campanas_vistas (de ahí sale el aviso por Telegram). Si apareció alguna, relee la foto
 * completa de esa cuenta para saber cuántas publicaciones pueden entrar.
 */
export const VIGILANCIA_HORAS = 6
export async function vigilarCampanas(db: Pool) {
  const { rows: [u] } = await db.query(`SELECT value FROM app_settings WHERE key = 'promociones_vigilancia_at'`)
  if (u?.value && Date.now() - new Date(u.value).getTime() < VIGILANCIA_HORAS * 3600e3) return null
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('promociones_vigilancia_at', $1)
     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value`, [new Date().toISOString()])
  const { rows: cuentas } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  let nuevas = 0
  for (const c of cuentas) {
    const n = await actualizarCampanas(db, c.id)
    if (n.length) {
      nuevas += n.length
      const f = await actualizarPromociones(db, c.id)
      await actualizarCampanas(db, c.id)
      for (const k of f.campanas) {
        const cant = f.items.filter(i => i.promos.some(p => p.campana === k.id && p.estado === 'candidate')).length
        await db.query(`UPDATE ml_campanas_vistas SET candidatas = $3 WHERE conexion_id = $1 AND campana_id = $2`, [c.id, k.id, cant])
      }
    }
  }
  return { cuentas: cuentas.length, nuevas }
}
