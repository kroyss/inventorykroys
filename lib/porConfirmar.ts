// Ventas → Por confirmar (2026-10-12): las ventas de MercadoLibre que todavía no están registradas en
// el sistema, para que se confirmen de a una (pago + productos + lo que se habló) sin tipear nada.
//
// No se crea ninguna venta sola: la lista sale de ml_ordenes (la sincronización de cada ~30 min, la
// misma de Calificaciones) cruzada con `sales`. La venta nace recién cuando la persona la confirma
// en el formulario. Así no hay duplicados, Pagos ME no puede mover nada que nadie revisó y
// Calificaciones sigue igual (sin venta a los N días = no concretada).
//   - Vencida: pasaron los días de "no concretada" de Calificaciones sin registrarla.
//   - A los DIAS_MAX (ML no deja concretarla después) o cancelada en ML: sale de la lista.
import type { Pool } from 'pg'
import { leerPlantillasCal } from '@/lib/calificacionesML'

export const DIAS_MAX = 8

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
  pago: { verificacion: 'pendiente' | 'valido' | 'invalido'; monto: number | null } | null
  mensaje: { texto: string; at: string } | null    // lo último que escribió el comprador (después de comprar)
  vencida: boolean
}

export async function ventasPorConfirmar(db: Pool) {
  const { rows: [pl] } = await db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
  const dias = leerPlantillasCal(pl?.value).noConcretada.dias
  const { rows } = await db.query(
    `SELECT COALESCE(o.pack_id, o.id)::text AS numero, o.fecha, x.nickname AS cuenta,
            NULLIF(o.comprador_nombre, '') AS comprador, o.comprador AS nick, o.total::float, o.moneda,
            o.items, o.detalle,
            p.verificacion, p.monto_pagado::float AS monto,
            CASE WHEN c.ultimo_de_comprador AND c.ultimo_at > o.fecha THEN c.ultimo_texto END AS msg_texto,
            CASE WHEN c.ultimo_de_comprador AND c.ultimo_at > o.fecha THEN c.ultimo_at END AS msg_at,
            o.fecha < NOW() - make_interval(days => $1) AS vencida
     FROM ml_ordenes o
     JOIN ml_conexiones x ON x.id = o.conexion_id
     LEFT JOIN me_pagos p ON p.venta IN (o.id::text, o.pack_id::text)
     LEFT JOIN ml_conversaciones c ON c.pack_id = COALESCE(o.pack_id, o.id)
     WHERE o.fecha > NOW() - make_interval(days => $2)
       AND COALESCE(o.estado, '') <> 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number IN (o.id::text, o.pack_id::text))
     ORDER BY o.fecha DESC`, [dias, DIAS_MAX])

  // Cuántos productos del sistema tiene cada publicación (sin el prefijo: MLV768007052 → 768007052).
  const codigos = [...new Set(rows.flatMap(r => (r.items as string[] | null ?? []).filter(i => !i.includes(':'))
    .map(i => i.replace(/^[A-Z]{3}/, ''))))]
  const { rows: map } = codigos.length ? await db.query(
    `SELECT m.ml_code, COUNT(DISTINCT p.id)::int AS n
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id
     WHERE m.is_active AND p.is_active AND m.ml_code = ANY($1::text[]) GROUP BY 1`, [codigos]) : { rows: [] }
  const productosDe = new Map(map.map(m => [m.ml_code as string, m.n as number]))

  const filas: PorConfirmar[] = rows.map(r => {
    const items = (r.items as string[] | null ?? []).filter(i => !i.includes(':'))
    const detalle = (r.detalle as { titulo: string; variante: string | null; cantidad: number }[] | null) ?? []
    // detalle e items van en el mismo orden (uno por artículo de la orden).
    const lineas: LineaML[] = detalle.map((d, k) => {
      const codigo = items[k] ?? null
      return { ...d, codigo, productos: codigo ? productosDe.get(codigo.replace(/^[A-Z]{3}/, '')) ?? 0 : 0 }
    })
    const productos: EstadoProductos =
      lineas.some(l => l.productos === 0) ? 'sin_vincular' : lineas.some(l => l.productos > 1) ? 'elegir' : 'listo'
    return {
      numero: r.numero, fecha: r.fecha, cuenta: r.cuenta, comprador: r.comprador, nick: r.nick,
      total: r.total, moneda: r.moneda, lineas, productos,
      pago: r.verificacion ? { verificacion: r.verificacion, monto: r.monto } : null,
      mensaje: r.msg_texto ? { texto: r.msg_texto, at: r.msg_at } : null,
      vencida: r.vencida,
    }
  })
  // Un pack con varias órdenes sale una sola vez (la primera, la más nueva).
  const vistos = new Set<string>()
  return { dias, filas: filas.filter(f => !vistos.has(f.numero) && !!vistos.add(f.numero)) }
}
