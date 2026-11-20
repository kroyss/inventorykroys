import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, cuentaDePerfil } from '@/lib/pagosME'

const Body = z.object({
  cuenta: z.string().trim().max(80).nullish(),
  avisos: z.array(z.object({
    orden: z.string().regex(/^\d{6,20}$/),
    // pago = «Tienes un nuevo pago»; orden = «Tienes una nueva orden»; otro = cualquier otro aviso con una orden
    tipo: z.enum(['pago', 'orden', 'otro']),
    fecha: z.string().max(40).nullish(),
  })).max(2000),
})

/**
 * POST /api/pagos-me/vigilante/avisos (extensión 1.4.1, 20-11-2026) → lo que la extensión leyó en los avisos del portal
 * (la campanita de MercadoEnvíos) desde la traída anterior. Responde qué órdenes bajar por su número (`pedir`).
 *  · «nuevo pago» (y avisos desconocidos con una orden): se piden, salvo las que ya están completas (pago y guía).
 *  · «nueva orden»: todavía sin pago → quedan en SEGUIMIENTO (mig. 191); llegan cuando aparezca su aviso de pago
 *    (o en el barrido diario, por si el portal no avisara).
 * Leer los avisos no los marca como leídos en el portal: la campanita del vendedor queda igual. Y no dependemos de
 * «leído/no leído»: se leen por fecha de publicación.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const { cuenta, avisos } = Body.parse(await req.json())
    if (!avisos.length) return NextResponse.json({ pedir: [] })
    const ids = [...new Set(avisos.map(x => x.orden))]
    const { rows } = await a.db.query(
      `SELECT venta FROM me_pagos WHERE venta = ANY($1::text[]) AND guia_path IS NOT NULL AND comprobante_path IS NOT NULL`, [ids])
    const completas = new Set(rows.map(r => r.venta as string))
    const pedir = [...new Set(avisos.filter(x => x.tipo !== 'orden' && !completas.has(x.orden)).map(x => x.orden))]
    const nuevas = avisos.filter(x => x.tipo === 'orden' && !completas.has(x.orden) && !pedir.includes(x.orden))
    if (nuevas.length) {
      const cta = await cuentaDePerfil(a.db, a.perfil, cuenta ?? null)
      await a.db.query(
        `INSERT INTO me_seguimiento (cuenta, orden, venta, fecha_orden, motivo)
         SELECT $1, x.orden, x.orden, CASE WHEN x.fecha ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN x.fecha::timestamptz END, 'nueva_orden'
         FROM jsonb_to_recordset($2::jsonb) AS x(orden text, fecha text)
         ON CONFLICT (empresa_id, cuenta, orden) DO NOTHING`,
        [cta, JSON.stringify(nuevas.map(x => ({ orden: x.orden, fecha: x.fecha ?? null })))])
    }
    return NextResponse.json({ pedir })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
