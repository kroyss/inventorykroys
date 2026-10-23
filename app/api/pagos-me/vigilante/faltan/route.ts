import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, verificarCuenta } from '@/lib/pagosME'

const Body = z.object({
  cuenta: z.string().trim().max(80).nullish(),        // nombre en el portal (extensión 1.3.4+)
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
 * Tampoco se trae lo que ya está RESUELTO: la guía de la orden ya se IMPRIMIÓ en Despachos. (23-10: antes bastaba con
 * que estuviera cargada; una guía subida a mano antes de traer el pago dejaba ese pago sin traer y, sin inventario,
 * la guía se imprimía sin pago verificado. Ahora el pago se trae y Despachos la frena hasta verificarlo.)
 * La venta registrada y verificada a mano SÍ se trae (2026-10-11): su guía tiene que llegar sola a
 * Despachos, y el pago entra ya válido (ver vigilante/orden). La venta se busca por número de orden y
 * por su paquete (ml_ordenes).
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const { ordenes, cuenta } = Body.parse(await req.json())
    if (ordenes.length === 0) return NextResponse.json({ faltan: [] })
    // ¿Es una cuenta de ML conectada? (migración 096). Si es OTRA cuenta de MercadoEnvíos, no se guarda nada.
    const verificacion = await verificarCuenta(a.db, a.perfil, cuenta ?? null, ordenes.map(o => o.venta))
    if (verificacion.estado === 'distinta') {
      return NextResponse.json({ error: 'cuenta_no_conectada', verificacion }, { status: 409 })
    }
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
       WHERE EXISTS (SELECT 1 FROM despacho_etiquetas e WHERE e.venta IN (v.venta, v.pack) AND e.impresa)`, [nuevas]) : { rows: [] }
    const resuelta = new Set(resueltas.map(r => r.venta as string))
    const faltan = ordenes.filter(o => {
      const r = ya.get(o.venta)
      if (!r) return !resuelta.has(o.venta)
      return (o.guia && !r.g) || (o.comprobante && !r.c)
    }).map(o => o.venta)
    return NextResponse.json({ faltan, verificacion })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
