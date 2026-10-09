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
    const faltan = ordenes.filter(o => {
      const r = ya.get(o.venta)
      return !r || (o.guia && !r.g) || (o.comprobante && !r.c)
    }).map(o => o.venta)
    return NextResponse.json({ faltan })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
