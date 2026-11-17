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
//   - Reserva de seguridad (26-10, regla del dueño; app_settings `stock_ml_reserva`, 2 por defecto): se guardan N
//     unidades sin publicar por si hay un error. Lo publicable (disponible − reserva) se reparte por turnos, de a una
//     publicación entera (1 suelta o 1 combo completo), empezando por la que más vendió en 60 días: con sueltas da
//     partes iguales y lo que sobra a las que más venden; con combos ya no deja todo en 0 (26-10, COD-0297). Con disponible ≤ reserva el producto
//     queda «en reserva»: nada automático, se asigna a mano después de chequear (y no se puede asignar más de lo que hay).
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
  /** El título dice pack/combo/kit/«x2»/«4 und» y sigue en 1 sin revisar: SOLO una lista para que alguien decida. */
  posible_combo: boolean
  /** Vinculada la publicación entera pero tiene variantes: no se sabe cuál variante es este producto. */
  entera_con_variantes: boolean
  envio: EstadoEnvio | null        // null = no aplica (CO o sin precio)
  /** Lo que debería mostrar ML (null = esta pantalla no la toca). */
  objetivo: number | null
  /** Pausada, con stock para publicar y con envío gratis (o sin dato de envío): se reactiva al igualar. */
  reactivar: boolean
  /** Pausada con stock pero quedaría sin envío gratis: no se reactiva sola. */
  bloqueada_envio: boolean
  /** Ventas de 60 días de esta publicación (desempata el reparto). */
  ventas60: number
  actualizado_at: string | null
  /** Pausada a mano desde Stock en ML (mig 181) y sigue pausada: Igualar no la reactiva. */
  pausa_mano: { at: string; por: string | null; motivo: string | null } | null
}

export interface FilaStockML {
  product_id: number
  code: string
  name: string
  stock: number
  comprometidas: number
  disponible: number
  /** Disponible − reserva (lo que se reparte entre las publicaciones). */
  publicable: number
  /** Disponible ≤ reserva: no se iguala solo; se asigna a mano. */
  en_reserva: boolean
  /** ML muestra entre todas sus publicaciones más unidades de las que hay (en unidades del producto). */
  excede: boolean
  /** 16-11 Vende de más: 'sin' = 0 disponible y ML ofrece en activas · 'mas' = las activas ofrecen más de lo que hay. */
  vende: 'sin' | 'mas' | null
  /** Unidades que ofrecen en ML sus publicaciones ACTIVAS (en unidades del producto). */
  ofrece: number
  peso: number | null
  pubs: PubStockML[]
  diferencia: boolean
  /** «Se acabó» (bodega, mig 181): vigente hasta que entra mercancía o se ajusta el inventario. Cuenta como 0 disponible. */
  sin_fisico: { at: string; por: string | null } | null
}

export const RESERVA_DEFECTO = 2
export async function leerReserva(db: Pick<Pool, 'query'>): Promise<number> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'stock_ml_reserva'`)
  const n = Number(r?.value)
  return r && Number.isInteger(n) && n >= 0 && n <= 100 ? n : RESERVA_DEFECTO
}

// Solo para la lista «Revisar combos» (nunca cambia nada): "pack", "combo", "kit", "x2", "4 und", "par".
// No cuenta medidas ("30cm X 50m", "X 2 Metros", "10w"): después de "x N" no puede venir una medida.
const PARECE_COMBO = /\b(pack|combo|kit|paquete|lote|docena|pares?)\b|\bx\s?\d{1,3}\b(?![.,]\d)(?!\s*(metros?|mts?|m\b|cm|mm|kg|gr|gb|w\b))|\b\d{1,3}\s?(und|unds|unid|unidades|pzas|piezas|pcs|uds)\b/i

/** Cantidades vendidas por código de publicación o variante ("768007052" / "768007052:180012345"). */
function porCodigo(rows: { items: string[] | null; detalle: { cantidad: number }[] | null }[]): Map<string, number> {
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

/** Ventas de 60 días por código (para desempatar el reparto). */
async function ventas60PorCodigo(db: Pool) {
  const { rows } = await db.query(
    `SELECT items, detalle FROM ml_ordenes WHERE fecha > NOW() - interval '60 days' AND COALESCE(estado, '') <> 'cancelled'`)
  return porCodigo(rows)
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
       AND COALESCE(o.estado, '') <> 'cancelled' AND o.no_concretada_at IS NULL AND o.fuera_at IS NULL AND o.sin_inv_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)`, [DIAS_MAX, DIAS_CON_PAGO])
  return porCodigo(rows)
}

export async function filasStockML(db: Pool, pais: string): Promise<FilaStockML[]> {
  const [{ rows }, compromiso, tablas, ventas, reserva] = await Promise.all([
    db.query(
      `SELECT p.id AS product_id, p.code, p.name, COALESCE(i.quantity, 0)::int AS stock, p.weight_kg::float AS peso,
              m.id AS codigo_id, m.ml_code, m.ml_account AS cuenta, COALESCE(m.unidades, 1)::int AS unidades,
              COALESCE(m.sin_sincronizar, FALSE) AS sin_sincronizar, COALESCE(m.combo_revisado, FALSE) AS combo_revisado,
              c.item_id, c.titulo, c.estado, c.disponible::int AS disponible, c.precio::float AS precio, c.variantes,
              c.actualizado_at, m.pausa_mano_at, um.full_name AS pausa_mano_por, m.pausa_mano_motivo,
              -- El CASE corta primero: la búsqueda en movimientos solo corre para los marcados «Se acabó» (antes 2,6 s).
              CASE WHEN p.sin_fisico_at IS NULL THEN NULL
                   WHEN NOT EXISTS (SELECT 1 FROM inventory_movements mv WHERE mv.product_id = p.id
                          AND mv.movement_type IN ('IN', 'ADJUST') AND mv.created_at > p.sin_fisico_at)
                   THEN p.sin_fisico_at END AS sin_fisico_at, uf.full_name AS sin_fisico_por
       FROM products p
       LEFT JOIN users uf ON uf.id = p.sin_fisico_por
       JOIN product_ml_codes m ON m.product_id = p.id AND m.is_active AND split_part(m.ml_code, ':', 1) ~ '^\\d+$'
       LEFT JOIN inventory i ON i.product_id = p.id
       LEFT JOIN ml_catalogo c ON substring(c.item_id FROM 4) = split_part(m.ml_code, ':', 1)
       LEFT JOIN users um ON um.id = m.pausa_mano_por
       WHERE p.is_active
       ORDER BY p.name, m.ml_account, m.ml_code`),
    comprometidasPorCodigo(db),
    leerTablasEnvio(db),
    ventas60PorCodigo(db),
    leerReserva(db),
  ])

  const porProducto = new Map<number, FilaStockML & { codigos: string[] }>()
  for (const r of rows) {
    let f = porProducto.get(r.product_id)
    if (!f) {
      f = { product_id: r.product_id, code: r.code, name: r.name, stock: r.stock, comprometidas: 0, disponible: r.stock,
            publicable: 0, en_reserva: false, excede: false, vende: null, ofrece: 0, peso: r.peso, pubs: [], diferencia: false, codigos: [],
            sin_fisico: r.sin_fisico_at ? { at: r.sin_fisico_at, por: r.sin_fisico_por } : null }
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
      posible_combo: !r.combo_revisado && Math.max(1, r.unidades) === 1 && !r.sin_sincronizar && PARECE_COMBO.test(r.titulo ?? ''),
      entera_con_variantes: !varId && variantes.length > 0,
      envio: null, objetivo: null, reactivar: false, bloqueada_envio: false,
      ventas60: ventas.get(String(r.ml_code)) ?? 0,
      actualizado_at: r.actualizado_at,
      pausa_mano: r.pausa_mano_at && r.estado === 'paused' ? { at: r.pausa_mano_at, por: r.pausa_mano_por, motivo: r.pausa_mano_motivo } : null,
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
    // «Se acabó»: para ML cuenta como 0 (el inventario no se toca: lo ajusta quien puede).
    const disp = f.sin_fisico ? 0 : f.disponible
    f.publicable = Math.max(0, disp - reserva)
    for (const p of f.pubs) {
      if (pais === 'VE' && p.precio != null && p.precio > 0) {
        p.envio = envioPorTransportista(f.peso != null ? f.peso * p.unidades : null, p.precio, tablas).estado
      }
    }
    const sincronizables = f.pubs.filter(p => !p.sin_sincronizar && !p.entera_con_variantes && p.estado != null && p.ml_disponible != null)
    f.excede = sincronizables.reduce((s, p) => s + (p.ml_disponible ?? 0) * p.unidades, 0) > disp
    // 16-11 (Vende de más): con 0 disponible no hay nada que repartir a mano: todas a 0 (Igualar lo arregla de un clic).
    f.en_reserva = sincronizables.length > 0 && disp > 0 && disp <= reserva
    if (!f.en_reserva && sincronizables.length) {
      // Por turnos: cada vuelta, a cada una (de la que más vende a la que menos) 1 publicación entera si todavía alcanza.
      // Antes era partes iguales en unidades y después ÷ lo que trae: 10 entre combos de 5/4/6 daba 0 en todas.
      const orden = [...sincronizables].sort((a, b) => b.ventas60 - a.ventas60 || a.cuenta.localeCompare(b.cuenta))
      for (const p of orden) p.objetivo = 0
      let quedan = f.publicable
      for (let dio = true; dio;) {
        dio = false
        for (const p of orden) {
          if (p.unidades > quedan) continue
          p.objetivo = (p.objetivo ?? 0) + 1
          quedan -= p.unidades
          dio = true
        }
      }
      for (const p of orden) {
        if (p.estado === 'paused' && (p.objetivo ?? 0) > 0 && !p.pausa_mano) {
          if (p.envio === 'destino') p.bloqueada_envio = true
          else p.reactivar = true
        }
      }
    }
    // 16-11 (el dueño: «no sé qué hacer ahí»): en reserva y ML muestra más de lo que hay → una sugerencia válida que
    // toca lo mínimo: se baja de a 1 la que más muestra (empate: la que menos vende). Así Igualar también lo arregla.
    if (f.en_reserva && f.excede) {
      const c = new Map(sincronizables.map(p => [p, p.ml_disponible ?? 0]))
      let total = sincronizables.reduce((s, p) => s + c.get(p)! * p.unidades, 0)
      while (total > disp) {
        const p = [...c.keys()].filter(x => c.get(x)! > 0)
          .sort((a, b) => c.get(b)! - c.get(a)! || a.ventas60 - b.ventas60 || a.cuenta.localeCompare(b.cuenta))[0]
        if (!p) break
        c.set(p, c.get(p)! - 1); total -= p.unidades
      }
      for (const [p, n] of c) p.objetivo = n
    }
    f.diferencia = f.pubs.some(p => p.objetivo != null && (p.objetivo !== p.ml_disponible || p.reactivar))
      || (f.en_reserva && f.excede)   // en reserva y ML muestra más de lo que hay: hay que asignar a mano
    f.ofrece = f.pubs
      .filter(p => p.estado === 'active' && !p.sin_sincronizar && !p.entera_con_variantes && (p.ml_disponible ?? 0) > 0)
      .reduce((s, p) => s + (p.ml_disponible ?? 0) * p.unidades, 0)
    f.vende = f.ofrece <= 0 ? null : disp <= 0 ? 'sin' : f.ofrece > disp ? 'mas' : null
    const { codigos: _, ...fila } = f
    filas.push(fila)
  }
  return filas
}
