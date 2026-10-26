// Stock en ML, Fase 1 (26-10; pantalla Inventario → «Stock en ML», API /api/inventario/stock-ml). Cada producto
// vinculado con TODAS sus publicaciones (las cuentas y sus variantes) para igualarlas y reactivarlas en masa.
//   - Disponible = stock del inventario − lo COMPROMETIDO: ventas de ML todavía sin registrar (la misma ventana de
//     Ventas → Por confirmar: 8 días, o 30 si trajo pago). ML ya bajó su stock en esa publicación; sin restarlas el
//     sistema volvería a subir lo que ya se vendió y la gemela de la otra cuenta vendería lo que no hay.
//   - «Trae N u.» (product_ml_codes.unidades, migración 098): lo pone una persona en esta pantalla, nunca se adivina
//     por el título (rifas). La publicación muestra disponible ÷ N (hacia abajo); su peso para el envío es N × peso.
//   - Envío gratis (VE): con el precio de la publicación y el peso, ¿por Zoom y Tealca, solo Tealca o cobro a destino?
//     Una pausada que volvería SIN envío gratis no se reactiva (queda para revisarla a mano).
//   - «No sincronizar» (migración 123): rifas, encargos o lo que se maneja aparte; esta pantalla no la toca.
// Solo lee de la base; los cambios en ML los hace aplicarCambio (lib/stockML.ts), que relee ML antes y después.
import type { Pool } from 'pg'
import { envioPorTransportista, type EstadoEnvio } from '@/lib/mlShipping'
import { leerTablasEnvio } from '@/lib/mlShippingDb'
import { DIAS_CON_PAGO, DIAS_MAX } from '@/lib/porConfirmar'

export interface PubStockML {
  codigo_id: number
  item_id: string
  variante_id: string | null
  cuenta: string
  titulo: string | null
  variante: string | null
  estado: string | null            // active / paused (null = no está en el catálogo guardado)
  ml_disponible: number | null
  precio: number | null
  unidades: number
  sin_sincronizar: boolean
  /** Vinculada la publicación entera pero tiene variantes: no se sabe cuál variante es este producto. */
  entera_con_variantes: boolean
  envio: EstadoEnvio | null        // null = no aplica (CO o sin precio)
  /** Lo que debería mostrar ML (null = esta pantalla no la toca). */
  objetivo: number | null
  /** Pausada, con stock para publicar y con envío gratis (o sin dato de envío): se reactiva al igualar. */
  reactivar: boolean
  /** Pausada con stock pero quedaría sin envío gratis: no se reactiva sola. */
  bloqueada_envio: boolean
  actualizado_at: string | null
}

export interface FilaStockML {
  product_id: number
  code: string
  name: string
  stock: number
  comprometidas: number
  disponible: number
  peso: number | null
  pubs: PubStockML[]
  diferencia: boolean
}

/** Unidades de cada producto en ventas de ML sin registrar (por código de publicación o variante). */
async function comprometidasPorCodigo(db: Pool): Promise<Map<string, number>> {
  const { rows } = await db.query<{ items: string[] | null; detalle: { cantidad: number }[] | null }>(
    `SELECT o.items, o.detalle
     FROM ml_ordenes o
     WHERE o.fecha > NOW() - make_interval(days => GREATEST($1::int, $2::int))
       AND (o.fecha > NOW() - make_interval(days => $1)
            OR (o.fecha > NOW() - make_interval(days => $2) AND EXISTS (
                SELECT 1 FROM me_pagos p WHERE (p.venta = o.id::text OR p.venta = o.pack_id::text) AND p.verificacion <> 'invalido')))
       AND COALESCE(o.estado, '') <> 'cancelled' AND o.no_concretada_at IS NULL AND o.fuera_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)`, [DIAS_MAX, DIAS_CON_PAGO])
  const m = new Map<string, number>()
  for (const r of rows) {
    // `items` es plano: por cada línea de la orden [item] o [item, item:variante] (lib/calificacionesML.ts).
    const items = r.items ?? []
    const detalle = r.detalle ?? []
    let i = 0
    for (const linea of detalle) {
      const item = items[i]
      if (!item) break
      const conVariante = items[i + 1]?.startsWith(`${item}:`) ? items[i + 1] : null
      i += conVariante ? 2 : 1
      const codigo = (conVariante ?? item).replace(/^[A-Z]{3}/, '')
      m.set(codigo, (m.get(codigo) ?? 0) + (Number(linea.cantidad) || 0))
    }
  }
  return m
}

export async function filasStockML(db: Pool, pais: string): Promise<FilaStockML[]> {
  const [{ rows }, compromiso, tablas] = await Promise.all([
    db.query(
      `SELECT p.id AS product_id, p.code, p.name, COALESCE(i.quantity, 0)::int AS stock, p.weight_kg::float AS peso,
              m.id AS codigo_id, m.ml_code, m.ml_account AS cuenta, COALESCE(m.unidades, 1)::int AS unidades,
              COALESCE(m.sin_sincronizar, FALSE) AS sin_sincronizar,
              c.item_id, c.titulo, c.estado, c.disponible::int AS disponible, c.precio::float AS precio, c.variantes,
              c.actualizado_at
       FROM products p
       JOIN product_ml_codes m ON m.product_id = p.id AND m.is_active AND split_part(m.ml_code, ':', 1) ~ '^\\d+$'
       LEFT JOIN inventory i ON i.product_id = p.id
       LEFT JOIN ml_catalogo c ON substring(c.item_id FROM 4) = split_part(m.ml_code, ':', 1)
       WHERE p.is_active
       ORDER BY p.name, m.ml_account, m.ml_code`),
    comprometidasPorCodigo(db),
    leerTablasEnvio(db),
  ])

  const porProducto = new Map<number, FilaStockML & { codigos: string[] }>()
  for (const r of rows) {
    let f = porProducto.get(r.product_id)
    if (!f) {
      f = { product_id: r.product_id, code: r.code, name: r.name, stock: r.stock, comprometidas: 0, disponible: r.stock,
            peso: r.peso, pubs: [], diferencia: false, codigos: [] }
      porProducto.set(r.product_id, f)
    }
    const [pub, varId] = String(r.ml_code).split(':')
    const variantes: { id: number; nombre: string | null; disponible: number }[] = Array.isArray(r.variantes) ? r.variantes : []
    const v = varId ? variantes.find(x => String(x.id) === varId) : null
    f.codigos.push(String(r.ml_code))
    f.pubs.push({
      codigo_id: r.codigo_id,
      item_id: r.item_id ?? `${pais === 'CO' ? 'MCO' : 'MLV'}${pub}`,
      variante_id: varId ?? null,
      cuenta: r.cuenta,
      titulo: r.titulo,
      variante: v?.nombre ?? (varId ? `Variante ${varId}` : null),
      estado: r.estado ?? null,
      ml_disponible: r.item_id == null ? null : varId ? (v ? v.disponible : null) : r.disponible,
      precio: r.precio,
      unidades: Math.max(1, r.unidades),
      sin_sincronizar: r.sin_sincronizar,
      entera_con_variantes: !varId && variantes.length > 0,
      envio: null, objetivo: null, reactivar: false, bloqueada_envio: false,
      actualizado_at: r.actualizado_at,
    })
  }

  const filas: FilaStockML[] = []
  for (const f of porProducto.values()) {
    // Lo comprometido de este producto: lo vendido por cualquiera de sus publicaciones, en unidades del producto.
    for (const p of f.pubs) {
      const codigo = `${p.item_id.replace(/^[A-Z]{3}/, '')}${p.variante_id ? `:${p.variante_id}` : ''}`
      f.comprometidas += (compromiso.get(codigo) ?? 0) * p.unidades
    }
    f.disponible = Math.max(0, f.stock - f.comprometidas)
    for (const p of f.pubs) {
      if (pais === 'VE' && p.precio != null && p.precio > 0) {
        p.envio = envioPorTransportista(f.peso != null ? f.peso * p.unidades : null, p.precio, tablas).estado
      }
      if (p.sin_sincronizar || p.entera_con_variantes || p.estado == null || p.ml_disponible == null) continue
      p.objetivo = Math.floor(f.disponible / p.unidades)
      if (p.estado === 'paused' && p.objetivo > 0) {
        if (p.envio === 'destino') p.bloqueada_envio = true
        else p.reactivar = true
      }
    }
    f.diferencia = f.pubs.some(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
    const { codigos: _, ...fila } = f
    filas.push(fila)
  }
  return filas
}
