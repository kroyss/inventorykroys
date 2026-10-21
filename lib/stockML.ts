// CAMBIAR STOCK Y REACTIVAR desde el sistema (2026-10-21, decisión del dueño; migración 111). Una sola ventana
// (components/preguntas/CambiarStock.tsx) desde el chip ✎ de Preguntas/Mensajes, la ficha y Stock → Pausadas.
//   - leer la publicación como está AHORA en ML (estado, stock, variantes);
//   - gemelas: la misma mercancía publicada en la otra cuenta (vinculada al MISMO producto del inventario), para no
//     subir una y dejar la otra igual (se vende lo que no hay); y el stock del inventario como referencia;
//   - aplicar: cambia la cantidad (de la publicación o de una variante) y, si se pide, la reactiva; relee ML para
//     confirmar y deja al día catálogo, Stock y Preguntas; registra quién cambió qué (ml_stock_cambios).
// Cambiar el stock en ML NO toca el inventario del sistema (es solo lo publicado).
import type { Pool } from 'pg'
import { ErrorML, mlFetch } from '@/lib/ml'
import { esDemo } from '@/lib/demo'

interface ItemML {
  id: string; title: string; status: string; sub_status?: string[]; available_quantity: number; thumbnail?: string
  variations?: { id: number; available_quantity: number; attribute_combinations?: { name: string; value_name: string | null }[] }[]
}

export interface PubStock {
  item_id: string; conexion_id: number; cuenta: string; titulo: string; estado: string; sub_status: string[]
  disponible: number; imagen: string | null
  variantes: { id: string; nombre: string; disponible: number }[]
}

const nombreVariante = (v: NonNullable<ItemML['variations']>[number]) =>
  (v.attribute_combinations ?? []).map(a => a.value_name ?? '—').join(' · ') || `Variante ${v.id}`

/** La cuenta (conexión) dueña de una publicación, con lo que ya está guardado. */
export async function conexionDeItem(db: Pool, item: string): Promise<number | null> {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(
       (SELECT conexion_id FROM ml_catalogo WHERE item_id = $1),
       (SELECT conexion_id FROM ml_stock_alertas WHERE item_id = $1 LIMIT 1),
       (SELECT conexion_id FROM ml_preguntas WHERE item_id = $1 ORDER BY fecha DESC LIMIT 1),
       (SELECT conexion_id FROM ml_ordenes WHERE items[1] LIKE $1 || '%' ORDER BY fecha DESC LIMIT 1)) AS c`, [item])
  return r?.c ?? null
}

/** La publicación como está ahora en MercadoLibre. */
export async function leerPublicacion(db: Pool, conexionId: number, item: string): Promise<PubStock> {
  const [it, { rows: [x] }] = await Promise.all([
    mlFetch<ItemML>(db, conexionId, `/items/${item}?attributes=id,title,status,sub_status,available_quantity,thumbnail,variations`),
    db.query(`SELECT nickname FROM ml_conexiones WHERE id = $1`, [conexionId]),
  ])
  return {
    item_id: it.id, conexion_id: conexionId, cuenta: x?.nickname ?? '', titulo: it.title, estado: it.status,
    sub_status: it.sub_status ?? [], disponible: it.available_quantity ?? 0, imagen: it.thumbnail?.replace(/^http:/, 'https:') ?? null,
    variantes: (it.variations ?? []).map(v => ({ id: String(v.id), nombre: nombreVariante(v), disponible: v.available_quantity ?? 0 })),
  }
}

export interface Gemela { item_id: string; variante_id: string | null }
export interface ProductoStock { id: number; code: string; name: string; stock: number | null }

/** El producto del inventario vinculado a esta publicación (o variante) y sus OTRAS publicaciones (gemelas).
 *  Solo empresas con inventario tienen productos: los demás reciben null y ninguna gemela. */
export async function gemelasDe(db: Pool, item: string, variante: string | null): Promise<{ producto: ProductoStock | null; gemelas: Gemela[] }> {
  const pub = item.replace(/^[A-Z]{3}/, '')
  const pais = item.slice(0, 3)
  const { rows: [p] } = await db.query(
    `SELECT p.id, p.code, p.name, i.quantity::int AS stock
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id AND p.is_active
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE m.is_active AND m.ml_code = ANY($1::text[])
     ORDER BY (m.ml_code = $2) DESC LIMIT 1`, [[variante ? `${pub}:${variante}` : pub, pub], variante ? `${pub}:${variante}` : pub])
  if (!p) return { producto: null, gemelas: [] }
  const { rows } = await db.query(
    `SELECT DISTINCT m.ml_code FROM product_ml_codes m
     WHERE m.product_id = $1 AND m.is_active AND split_part(m.ml_code, ':', 1) <> $2 AND split_part(m.ml_code, ':', 1) ~ '^\\d+$'`, [p.id, pub])
  return {
    producto: { id: p.id, code: p.code, name: p.name, stock: p.stock ?? null },
    gemelas: rows.map(r => {
      const [g, v] = String(r.ml_code).split(':')
      return { item_id: `${pais}${g}`, variante_id: v ?? null }
    }),
  }
}

/** ML en español, para mostrar en la fila. */
function motivoML(e: unknown) {
  if (e instanceof ErrorML) {
    const t = `${e.message} ${JSON.stringify(e.datos ?? '')}`.toLowerCase()
    if (e.status === 401 || e.status === 403) return 'Esta cuenta no dio permiso para cambiar publicaciones: reconéctala en Cuentas de MercadoLibre'
    if (/under_review|moderat|infring|forbidden|not.*allowed.*status|cannot.*activ/.test(t)) return 'MercadoLibre no deja reactivarla (está en revisión o tiene un problema): revísala en MercadoLibre'
    if (/quantity|stock/.test(t)) return `MercadoLibre no aceptó la cantidad (${e.message})`
    return `MercadoLibre: ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

export interface Cambio { item_id: string; variante_id: string | null; cantidad: number | null }
export interface Resultado { item_id: string; variante_id: string | null; ok: boolean; estado?: string; disponible?: number; total?: number; error?: string; reactivada?: boolean }

/** Aplica UN cambio en ML (cantidad y/o reactivar), lo comprueba releyendo y deja todo al día. */
export async function aplicarCambio(db: Pool, c: Cambio, opc: { reactivar: boolean; origen: string; usuarioId: number | null }): Promise<Resultado> {
  const base = { item_id: c.item_id, variante_id: c.variante_id }
  const conexionId = await conexionDeItem(db, c.item_id)
  if (!conexionId) return { ...base, ok: false, error: 'No se encontró en tus cuentas de MercadoLibre' }
  const demo = await esDemo(db)
  let antes: PubStock | null = null
  try { antes = demo ? null : await leerPublicacion(db, conexionId, c.item_id) } catch { /* se intenta igual */ }
  const disponibleAntes = !antes ? null : c.variante_id ? antes.variantes.find(v => v.id === c.variante_id)?.disponible ?? null : antes.disponible
  let error: string | undefined
  let reactivada = false
  let despues: PubStock | null = null

  if (!demo) {
    try {
      if (c.cantidad != null) {
        const ruta = c.variante_id ? `/items/${c.item_id}/variations/${c.variante_id}` : `/items/${c.item_id}`
        await mlFetch(db, conexionId, ruta, { method: 'PUT', body: { available_quantity: c.cantidad } })
      }
      // Reactivar: si sigue pausada después del stock (pausada a mano, o ML no la reactivó sola).
      if (opc.reactivar) {
        const ahora = await leerPublicacion(db, conexionId, c.item_id)
        if (ahora.estado === 'paused') {
          await mlFetch(db, conexionId, `/items/${c.item_id}`, { method: 'PUT', body: { status: 'active' } })
          reactivada = true
        }
      }
    } catch (e) {
      error = motivoML(e)
    }
    try { despues = await leerPublicacion(db, conexionId, c.item_id) } catch { /* sin releer */ }
  }

  const estado = demo ? (opc.reactivar ? 'active' : antes?.estado ?? 'active') : despues?.estado
  const disponible = demo ? c.cantidad ?? undefined
    : !despues ? undefined : c.variante_id ? despues.variantes.find(v => v.id === c.variante_id)?.disponible : despues.disponible
  if (!error && c.cantidad != null && disponible != null && disponible !== c.cantidad) {
    error = `MercadoLibre la muestra con ${disponible} u. (pediste ${c.cantidad}): puede tardar un momento, revísala`
  }
  if (!error && opc.reactivar && estado && estado !== 'active') {
    error = 'Se guardó, pero MercadoLibre la sigue mostrando pausada: revísala en MercadoLibre'
  }

  // Al día: catálogo (chip de Preguntas/Mensajes), Stock y el estado en Preguntas.
  if (despues || demo) {
    const est = estado ?? 'active'
    await db.query(`UPDATE ml_catalogo SET estado = $2, disponible = COALESCE($3, disponible) WHERE item_id = $1`,
      [c.item_id, est, despues ? despues.disponible : null])
    if (despues?.variantes.length) {
      await db.query(
        `UPDATE ml_catalogo SET variantes = (
           SELECT jsonb_agg(CASE WHEN x.d IS NOT NULL THEN jsonb_set(v, '{disponible}', to_jsonb(x.d)) ELSE v END)
           FROM jsonb_array_elements(variantes) v
           LEFT JOIN LATERAL (SELECT (e->>'disponible')::int AS d FROM jsonb_array_elements($2::jsonb) e WHERE e->>'id' = v->>'id') x ON TRUE)
         WHERE item_id = $1 AND jsonb_typeof(variantes) = 'array'`,
        [c.item_id, JSON.stringify(despues.variantes)])
    }
    if (disponible != null) {
      await db.query(
        // El estado solo se toca si quedó activa: 'pausada' (a mano) es la marca de la pestaña Pausadas.
        `UPDATE ml_stock_alertas SET disponible = $3, estado = CASE WHEN $4 = 'active' THEN 'active' ELSE estado END,
                agotada_desde = CASE WHEN $3 > 0 THEN NULL ELSE agotada_desde END,
                pausada_desde = CASE WHEN $4 = 'active' THEN NULL ELSE pausada_desde END,
                bajo_desde = CASE WHEN $3 > 0 THEN bajo_desde END
         WHERE item_id = $1 AND variante_id = $2::bigint`, [c.item_id, c.variante_id ?? '0', disponible, est])
    }
    if (est === 'active') {
      // Una pausada que quedó activa sale de la pestaña Pausadas (su fila es la de toda la publicación).
      await db.query(`UPDATE ml_stock_alertas SET estado = 'active', pausada_desde = NULL WHERE item_id = $1 AND estado = 'pausada'`, [c.item_id])
    }
    await db.query(`UPDATE ml_preguntas SET item_estado = $2 WHERE item_id = $1`, [c.item_id, est])
  }
  await db.query(
    `INSERT INTO ml_stock_cambios (conexion_id, item_id, variante_id, antes, despues, estado_antes, estado_despues, reactivada, origen, error, usuario_id)
     VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [conexionId, c.item_id, c.variante_id ?? '0', disponibleAntes, disponible ?? null, antes?.estado ?? null, estado ?? null,
     reactivada, opc.origen, error ?? null, opc.usuarioId])
  return { ...base, ok: !error, estado, disponible, total: despues?.disponible ?? (demo ? c.cantidad ?? undefined : undefined), error, reactivada }
}
