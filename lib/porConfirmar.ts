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
          id: number; guia: boolean; guiaNum: string | null } | null
  mensaje: { texto: string; at: string } | null    // lo último que escribió el comprador (después de comprar)
  vencida: boolean
}

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
       AND COALESCE(o.estado, '') <> 'cancelled'
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
    const lineas: LineaML[] = detalle.map((d, k) => {
      const codigo = items[k] ?? null
      const variante = codigo ? todos.find(i => i.startsWith(codigo + ':')) ?? null : null
      return { ...d, codigo, productos: codigo ? cuantos(codigo, variante) : 0 }
    })
    const productos: EstadoProductos =
      lineas.some(l => l.productos === 0) ? 'sin_vincular' : lineas.some(l => l.productos > 1) ? 'elegir' : 'listo'
    return {
      numero: r.numero, fecha: r.fecha, cuenta: r.cuenta, comprador: r.comprador, nick: r.nick,
      total: r.total, moneda: r.moneda, lineas, productos,
      pago: r.verificacion ? { verificacion: r.verificacion, monto: r.monto, retiro: !!r.retiro, at: r.pago_at,
                               id: Number(r.pago_id), guia: !!r.tiene_guia, guiaNum: r.guia_num ?? null } : null,
      mensaje: r.msg_texto ? { texto: r.msg_texto, at: r.msg_at } : null,
      vencida: r.vencida,
    }
  })
  // Un pack con varias órdenes sale una sola vez (la primera, la más nueva).
  const vistos = new Set<string>()
  return { dias, filas: filas.filter(f => !vistos.has(f.numero) && !!vistos.add(f.numero)) }
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
       AND o.fecha > NOW() - make_interval(days => $1) AND COALESCE(o.estado, '') <> 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.id::text)
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number = o.pack_id::text)
     ORDER BY o.fecha DESC LIMIT $2`, [DIAS_MAX, maximo])
  for (const r of rows) {
    try { await traerOrden(db, r.conexion_id, r.id) } catch { /* sin nombre: queda el apodo */ }
    await db.query(`UPDATE ml_ordenes SET comprador_nombre = '' WHERE id = $1 AND comprador_nombre IS NULL`, [r.id])
  }
  return rows.length
}
