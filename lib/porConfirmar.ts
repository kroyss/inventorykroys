// Ventas → Por confirmar (2026-10-12): las ventas de MercadoLibre que todavía no están registradas en
// el sistema, para que se confirmen de a una (pago + productos + lo que se habló) sin tipear nada.
//
// No se crea ninguna venta sola: la lista sale de ml_ordenes (la sincronización de cada ~30 min, la
// misma de Calificaciones) cruzada con `sales`. La venta nace recién cuando la persona la confirma
// en el formulario. Así no hay duplicados, Pagos ME no puede mover nada que nadie revisó y
// Calificaciones sigue igual (sin venta a los N días = no concretada).
//   - Vencida: SIN pago y pasaron los días de "no concretada" de Calificaciones sin registrarla.
//   - Con pago (Pagos ME) no vence (2026-10-12): el cliente puede comprar el 5 y pagar el 10, y la venta
//     sigue siendo válida. Queda hasta registrarla o marcar el pago inválido (tope DIAS_CON_PAGO).
//   - Sin pago, a los DIAS_MAX, o cancelada en ML: sale de la lista.
import type { Pool } from 'pg'
import { leerPlantillasCal, traerOrden } from '@/lib/calificacionesML'
import { sqlFacturaIncluye } from '@/lib/invoicesServer'
import type { MotivoNoConcretada } from '@/lib/noConcretada'

/** Lo que dijo el banco de un pago (migración 110). */
export interface BancoPago {
  nivel: 'seguro' | 'probable' | 'revisar' | 'no_aparece'; motivo: string; at: string
  mov: { banco: string; fecha: string; monto: number; ref: string; concepto: string } | null
}

export const DIAS_MAX = 8
export const DIAS_CON_PAGO = 30

export type EstadoProductos = 'listo' | 'elegir' | 'sin_vincular'

export interface LineaML { titulo: string; variante: string | null; cantidad: number; codigo: string | null; productos: number }

export interface PorConfirmar {
  numero: string
  fecha: string
  cuenta: string
  comprador: string | null
  nick: string | null
  total: number | null
  moneda: string | null
  lineas: LineaML[]
  productos: EstadoProductos
  pago: { verificacion: 'pendiente' | 'valido' | 'invalido'; monto: number | null; retiro: boolean; at: string | null
          // La guía que trajo Pagos ME (para verla desde la fila: components/ventas/VerGuia.tsx).
          id: number; guia: boolean; guiaNum: string | null
          // Para verificar sin inventario (Pagos ME de los Fundadores, 19-10): contra qué se compara y de dónde vino.
          totalOrden: number | null; banco: string | null; referencia: string | null; metodo: string | null
          carrier: string | null; comprobante: boolean; verificadoAt: string | null
          // Lo que dijo el banco (mig. 110, "Comprobar con el banco"): null si todavía no se cruzó.
          bancoRes: BancoPago | null } | null
  mensaje: { texto: string; at: string } | null    // lo último que escribió el comprador (después de comprar)
  vencida: boolean
  // Algún producto vinculado no alcanza en stock (con inventario): "No se concretó" propone el motivo "Sin stock".
  sinStock: boolean
  // Su guía ya está en Despachos (23-10): para no trabajarla dos veces.
  despacho: 'en_lote' | 'impresa' | null
}


/** Las marcadas "No se concretó" de los últimos días, para verlas y deshacer. */
export interface NoConcretada { numero: string; fecha: string; comprador: string | null; nick: string | null; productos: string | null
                                motivo: MotivoNoConcretada; nota: string | null; at: string; por: string | null }

export async function ventasPorConfirmar(db: Pool) {
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
  const dias = leerPlantillasCal(pl?.value).noConcretada.dias
  const { rows } = await db.query(
    `SELECT COALESCE(o.pack_id, o.id)::text AS numero, o.fecha, x.nickname AS cuenta,
            COALESCE(NULLIF(o.comprador_nombre, ''), NULLIF(c.comprador_nombre, '')) AS comprador, o.comprador AS nick, o.total::float, o.moneda,
            o.items, o.detalle,
            p.verificacion, p.monto_pagado::float AS monto,
            (p.envio_metodo ILIKE 'retiro en tienda%' OR p.carrier ILIKE 'retiro en tienda%') AS retiro,
            CASE WHEN c.ultimo_de_comprador AND c.ultimo_at > o.fecha THEN c.ultimo_texto END AS msg_texto,
            CASE WHEN c.ultimo_de_comprador AND c.ultimo_at > o.fecha THEN c.ultimo_at END AS msg_at,
            p.creado_at AS pago_at, p.id AS pago_id, p.guia_path IS NOT NULL AS tiene_guia, p.guia AS guia_num,
            p.total_orden::float AS total_orden, p.banco_emisor, p.referencia, p.metodo_pago, p.carrier,
            p.comprobante_path IS NOT NULL AS tiene_comprobante, p.verificado_at,
            p.banco_nivel, p.banco_motivo, p.banco_mov, p.banco_at,
            (SELECT CASE WHEN bool_or(e.impresa) THEN 'impresa' ELSE 'en_lote' END FROM despacho_etiquetas e
             WHERE e.venta IN (o.id::text, o.pack_id::text)) AS despacho,
            (p.verificacion IS NULL OR p.verificacion = 'invalido') AND o.fecha < NOW() - make_interval(days => $1) AS vencida
     FROM ml_ordenes o
     JOIN ml_conexiones x ON x.id = o.conexion_id
     -- Cruces por igualdad (2026-10-13): con "IN (o.id, o.pack_id)" Postgres no usaba los índices y
     -- comparaba cada orden contra todas las ventas (1,2 s por carga; así ~60 ms).
     LEFT JOIN LATERAL (
       SELECT * FROM me_pagos p WHERE p.venta = o.id::text OR p.venta = o.pack_id::text
       ORDER BY p.verificacion = 'invalido' LIMIT 1) p ON true
     LEFT JOIN ml_conversaciones c ON c.pack_id = COALESCE(o.pack_id, o.id)
     WHERE o.fecha > NOW() - make_interval(days => GREATEST($2::int, $3::int))
       AND (o.fecha > NOW() - make_interval(days => $2)
            OR (p.verificacion <> 'invalido' AND o.fecha > NOW() - make_interval(days => $3)))
       AND COALESCE(o.estado, '') <> 'cancelled' AND o.no_concretada_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)
     ORDER BY o.fecha DESC`, [dias, DIAS_MAX, DIAS_CON_PAGO])

  // Cuántos productos del sistema tiene cada publicación (sin el prefijo: MLV768007052 → 768007052) y
  // cada variante ("768007052:180012345", Importar desde ML). Primero la variante exacta, si no la
  // publicación; si solo hay productos de OTRAS variantes, hay que elegir (nunca se toma uno solo).
  const sinPrefijo = (c: string) => c.replace(/^[A-Z]{3}/, '')
  const publicaciones = [...new Set(rows.flatMap(r => (r.items as string[] | null ?? []).filter(i => !i.includes(':')).map(sinPrefijo)))]
  const { rows: map } = publicaciones.length ? await db.query(
    `SELECT m.ml_code, COUNT(DISTINCT p.id)::int AS n
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id
     WHERE m.is_active AND p.is_active AND split_part(m.ml_code, ':', 1) = ANY($1::text[]) GROUP BY 1`, [publicaciones]) : { rows: [] }
  const productosDe = new Map(map.map(m => [m.ml_code as string, m.n as number]))
  // Stock de lo vinculado (solo cuenta con inventario; sin él no hay filas y nunca sale "sin stock").
  const { rows: stocks } = publicaciones.length ? await db.query(
    `SELECT m.ml_code, COALESCE(i.quantity, 0)::float AS stock
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id LEFT JOIN inventory i ON i.product_id = p.id
     WHERE m.is_active AND p.is_active AND split_part(m.ml_code, ':', 1) = ANY($1::text[])`, [publicaciones]) : { rows: [] }
  const stockDe = new Map<string, number[]>()
  for (const r of stocks) stockDe.set(r.ml_code, [...(stockDe.get(r.ml_code) ?? []), r.stock])
  // Sin stock = todos los productos posibles de la línea (la variante exacta, si no la publicación) tienen menos de lo pedido.
  const faltaStock = (l: LineaML, variante: string | null) => {
    if (!l.codigo) return false
    const posibles = (variante && stockDe.get(sinPrefijo(variante))) || stockDe.get(sinPrefijo(l.codigo))
    return !!posibles?.length && posibles.every(st => st < l.cantidad)
  }
  const cuantos = (codigo: string, variante: string | null) => {
    const pub = sinPrefijo(codigo)
    const exacta = variante ? productosDe.get(sinPrefijo(variante)) ?? 0 : 0
    if (exacta) return exacta
    const dePub = productosDe.get(pub) ?? 0
    if (dePub) return dePub
    const otras = [...productosDe].filter(([c]) => c.startsWith(pub + ':')).reduce((a, [, n]) => a + n, 0)
    return otras ? Math.max(2, otras) : 0
  }

  const filas: PorConfirmar[] = rows.map(r => {
    const todos = (r.items as string[] | null) ?? []
    const items = todos.filter(i => !i.includes(':'))
    const detalle = (r.detalle as { titulo: string; variante: string | null; cantidad: number }[] | null) ?? []
    // detalle e items van en el mismo orden (uno por artículo de la orden).
    let sinStock = false
    const lineas: LineaML[] = detalle.map((d, k) => {
      const codigo = items[k] ?? null
      const variante = codigo ? todos.find(i => i.startsWith(codigo + ':')) ?? null : null
      const l = { ...d, codigo, productos: codigo ? cuantos(codigo, variante) : 0 }
      if (faltaStock(l, variante)) sinStock = true
      return l
    })
    const productos: EstadoProductos =
      lineas.some(l => l.productos === 0) ? 'sin_vincular' : lineas.some(l => l.productos > 1) ? 'elegir' : 'listo'
    return {
      numero: r.numero, fecha: r.fecha, cuenta: r.cuenta, comprador: r.comprador, nick: r.nick,
      total: r.total, moneda: r.moneda, lineas, productos,
      pago: r.verificacion ? { verificacion: r.verificacion, monto: r.monto, retiro: !!r.retiro, at: r.pago_at,
                               id: Number(r.pago_id), guia: !!r.tiene_guia, guiaNum: r.guia_num ?? null,
                               totalOrden: r.total_orden ?? null, banco: r.banco_emisor ?? null, referencia: r.referencia ?? null,
                               metodo: r.metodo_pago ?? null, carrier: r.carrier ?? null, comprobante: !!r.tiene_comprobante,
                               verificadoAt: r.verificado_at ?? null,
                               bancoRes: r.banco_nivel ? { nivel: r.banco_nivel, motivo: r.banco_motivo ?? '', mov: r.banco_mov ?? null, at: r.banco_at } : null } : null,
      mensaje: r.msg_texto ? { texto: r.msg_texto, at: r.msg_at } : null,
      vencida: r.vencida, sinStock, despacho: r.despacho ?? null,
    }
  })
  // Un pack con varias órdenes sale una sola vez (la primera, la más nueva).
  const vistos = new Set<string>()
  return { dias, filas: filas.filter(f => !vistos.has(f.numero) && !!vistos.add(f.numero)) }
}

export async function noConcretadas(db: Pool): Promise<NoConcretada[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (COALESCE(o.pack_id, o.id)) COALESCE(o.pack_id, o.id)::text AS numero, o.fecha,
            NULLIF(o.comprador_nombre, '') AS comprador, o.comprador AS nick, o.productos,
            o.no_concretada_motivo AS motivo, o.no_concretada_nota AS nota, o.no_concretada_at AS at, u.username AS por
     FROM ml_ordenes o LEFT JOIN users u ON u.id = o.no_concretada_por
     WHERE o.no_concretada_at IS NOT NULL AND o.fecha > NOW() - make_interval(days => $1)
     ORDER BY COALESCE(o.pack_id, o.id), o.fecha DESC`, [DIAS_CON_PAGO])
  return rows.sort((a, b) => +new Date(b.at) - +new Date(a.at))
}

/** Marca (o desmarca con motivo null) "No se concretó" en todas las órdenes del número (la orden o su pack). */
export async function marcarNoConcretada(db: Pool, numero: string, userId: number,
  motivo: MotivoNoConcretada | null, nota: string | null) {
  const { rowCount } = await db.query(
    `UPDATE ml_ordenes SET no_concretada_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END,
            no_concretada_motivo = $2, no_concretada_nota = $3, no_concretada_por = CASE WHEN $2::text IS NULL THEN NULL ELSE $4::int END
     WHERE (id::text = $1 OR pack_id::text = $1)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = $1)`, [numero, motivo, nota, userId])
  return rowCount ?? 0
}

/** Nombre real de las "Con pago" que no lo tienen (2026-10-12): la búsqueda de ventas de ML a veces
 *  trae solo el apodo; la venta suelta (/orders/{id}) trae nombre y apellido. Solo las que tienen pago
 *  (las que se trabajan), si la mensajería tampoco lo sabe, y cada una UNA vez: si ML no lo da, queda
 *  '' y no se vuelve a pedir. Lo llama el cron después de sincronizar (pocas por pasada). */
export async function completarNombres(db: Pool, maximo = 5) {
  const { rows } = await db.query(
    `SELECT o.id::text, o.conexion_id
     FROM ml_ordenes o
     JOIN me_pagos p ON p.venta IN (o.id::text, o.pack_id::text) AND p.verificacion <> 'invalido'
     LEFT JOIN ml_conversaciones c ON c.pack_id = COALESCE(o.pack_id, o.id)
     WHERE o.comprador_nombre IS NULL AND NULLIF(c.comprador_nombre, '') IS NULL
       AND o.fecha > NOW() - make_interval(days => $1) AND COALESCE(o.estado, '') <> 'cancelled' AND o.no_concretada_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)
     ORDER BY o.fecha DESC LIMIT $2`, [DIAS_MAX, maximo])
  for (const r of rows) {
    try { await traerOrden(db, r.conexion_id, r.id) } catch { /* sin nombre: queda el apodo */ }
    await db.query(`UPDATE ml_ordenes SET comprador_nombre = '' WHERE id = $1 AND comprador_nombre IS NULL`, [r.id])
  }
  return rows.length
}

// ── Ya cargadas con pago por verificar (22-10-2026) ─────────────────────────
// Una venta cargada a mano ANTES de que llegara el pago (p. ej. para facturar con retención) queda en borrador. Cuando
// Pagos ME trae su pago, no se duplica nada (la venta ya existe) pero el pago queda "sin verificar" y la venta no salía en
// ningún lado: no está en Por confirmar (esa lista es de ventas sin cargar). Aquí aparecen, para verificar el pago y
// procesarla en un paso. NADA se mueve solo: el pago sigue sin verificar hasta que alguien toca "Pago correcto y procesar".
export interface CargadaConPago {
  sale_id: number; numero: string; cliente: string | null; total: number; creada: string
  productos: { nombre: string; cantidad: number }[]
  factura: string | null
  pago: { id: number; verificacion: 'pendiente' | 'valido'; monto: number | null; totalOrden: number | null
          banco: string | null; referencia: string | null; metodo: string | null; comprobante: boolean; guia: boolean
          at: string; bancoRes: BancoPago | null }
}

export async function cargadasConPago(db: Pool): Promise<CargadaConPago[]> {
  const { rows } = await db.query(
    `SELECT s.id AS sale_id, s.ml_order_number AS numero, s.customer_name AS cliente, s.total_amount::float AS total, s.created_at AS creada,
            COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('nombre', pr.name, 'cantidad', si.quantity) ORDER BY si.id)
                      FROM sale_items si JOIN products pr ON pr.id = si.product_id WHERE si.sale_id = s.id), '[]'::json) AS productos,
            (SELECT i.invoice_number::text FROM invoices i WHERE ${sqlFacturaIncluye('i', 's.id')} AND i.status = 'EMITIDA' LIMIT 1) AS factura,
            p.id AS pago_id, p.verificacion, p.monto_pagado::float AS monto, p.total_orden::float AS total_orden,
            p.banco_emisor, p.referencia, p.metodo_pago, p.comprobante_path IS NOT NULL AS tiene_comprobante,
            p.guia_path IS NOT NULL AS tiene_guia, p.creado_at AS pago_at,
            p.banco_nivel, p.banco_motivo, p.banco_mov, p.banco_at
     FROM sales s
     JOIN me_pagos p ON p.venta = s.ml_order_number AND p.verificacion IN ('pendiente', 'valido')
     WHERE s.status IN ('BORRADOR', 'REABIERTA') AND s.ml_order_number NOT LIKE 'LOCAL-%'
       AND s.created_at > NOW() - make_interval(days => $1)
     ORDER BY p.creado_at DESC`, [DIAS_CON_PAGO])
  return rows.map(r => ({
    sale_id: Number(r.sale_id), numero: r.numero, cliente: r.cliente, total: r.total, creada: r.creada,
    productos: r.productos, factura: r.factura ?? null,
    pago: { id: Number(r.pago_id), verificacion: r.verificacion, monto: r.monto, totalOrden: r.total_orden ?? null,
            banco: r.banco_emisor ?? null, referencia: r.referencia ?? null, metodo: r.metodo_pago ?? null,
            comprobante: !!r.tiene_comprobante, guia: !!r.tiene_guia, at: r.pago_at,
            bancoRes: r.banco_nivel ? { nivel: r.banco_nivel, motivo: r.banco_motivo ?? '', mov: r.banco_mov ?? null, at: r.banco_at } : null },
  }))
}
