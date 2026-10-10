import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  ordenes: z.array(z.object({
    venta: z.string().regex(/^\d{6,20}$/),
    guia: z.boolean(),
    comprobante: z.boolean(),
  })).max(1000),
})

/**
 * POST /api/pagos-me/vigilante/faltan → de las órdenes que el perfil vio en el portal, cuáles hay que
 * subir: las que no están, o a las que les falta la guía o el comprobante que ahora sí tienen.
 * Así nunca se vuelve a bajar lo que ya se trajo.
 *
 * Tampoco se trae lo que ya está RESUELTO en el sistema (no hay pago que verificar): la orden ya está
 * en Despachos (su guía se cargó o imprimió), o su venta ya pasó el pago (PAGO_VERIFICADO en
 * adelante). Sí se trae la venta en BORRADOR / REABIERTA (pago por verificar) y la que no está
 * cargada. La venta se busca por número de orden y por su paquete (ml_ordenes).
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const { ordenes } = Body.parse(await req.json())
    if (ordenes.length === 0) return NextResponse.json({ faltan: [] })
    const { rows } = await a.db.query(
      `SELECT venta, guia_path IS NOT NULL AS g, comprobante_path IS NOT NULL AS c
       FROM me_pagos WHERE venta = ANY($1::text[])`, [ordenes.map(o => o.venta)])
    const ya = new Map(rows.map(r => [r.venta as string, r]))
    const nuevas = ordenes.filter(o => !ya.has(o.venta)).map(o => o.venta)
    const { rows: resueltas } = nuevas.length ? await a.db.query(
      `WITH v AS (
         SELECT x.venta, o.pack_id::text AS pack
         FROM unnest($1::text[]) AS x(venta)
         LEFT JOIN ml_ordenes o ON o.id::text = x.venta
       )
       SELECT v.venta FROM v
       WHERE EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta IN (v.venta, v.pack))
          OR EXISTS (SELECT 1 FROM sales s WHERE s.ml_order_number IN (v.venta, v.pack)
                     AND s.status NOT IN ('BORRADOR', 'REABIERTA'))`, [nuevas]) : { rows: [] }
    const resuelta = new Set(resueltas.map(r => r.venta as string))
    const faltan = ordenes.filter(o => {
      const r = ya.get(o.venta)
      if (!r) return !resuelta.has(o.venta)
      return (o.guia && !r.g) || (o.comprobante && !r.c)
    }).map(o => o.venta)
    return NextResponse.json({ faltan })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
