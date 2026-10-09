import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, guardarArchivoME, MAX_ARCHIVO } from '@/lib/pagosME'

const txt = (n: number) => z.string().trim().max(n).nullish().transform(v => v || null)
const num = z.number().finite().nullish().transform(v => v ?? null)

const Body = z.object({
  cuenta: txt(80),
  orden: z.object({
    venta: z.string().regex(/^\d{6,20}$/),
    estado_me: txt(30), fecha_orden: txt(40),
    total_orden: num, total_orden_usd: num,
    metodo_pago: txt(40), banco_emisor: txt(80), banco_receptor: txt(80),
    referencia: txt(60), fecha_pago: txt(40), monto_pagado: num,
    envio_metodo: txt(60), envio_opcion: txt(60), carrier: txt(30), guia: txt(40),
  }),
  guia_b64: z.string().max(MAX_ARCHIVO * 1.4).nullish(),
  comprobante_b64: z.string().max(MAX_ARCHIVO * 1.4).nullish(),
  comprobante_ext: z.enum(['jpeg', 'jpg', 'png', 'webp', 'pdf']).nullish(),
})

/** POST /api/pagos-me/vigilante/orden → guarda (o completa) una orden con su guía y su comprobante. */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    const o = b.orden
    const guia = b.guia_b64 ? Buffer.from(b.guia_b64, 'base64') : null
    const comp = b.comprobante_b64 ? Buffer.from(b.comprobante_b64, 'base64') : null
    if (guia && guia.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: 'La guía no es un PDF' }, { status: 400 })
    }
    const guiaPath = guia ? await guardarArchivoME(guia, 'pdf') : null
    const compPath = comp ? await guardarArchivoME(comp, b.comprobante_ext ?? 'jpeg') : null
    // La verificación nunca se pisa: lo que trae el portal solo actualiza los datos y completa archivos.
    await a.db.query(
      `INSERT INTO me_pagos (venta, cuenta, estado_me, fecha_orden, total_orden, total_orden_usd, metodo_pago,
                             banco_emisor, banco_receptor, referencia, fecha_pago, monto_pagado, envio_metodo,
                             envio_opcion, carrier, guia, guia_path, comprobante_path)
       VALUES ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (empresa_id, venta) DO UPDATE SET
         cuenta = EXCLUDED.cuenta, estado_me = EXCLUDED.estado_me, fecha_orden = EXCLUDED.fecha_orden,
         total_orden = EXCLUDED.total_orden, total_orden_usd = EXCLUDED.total_orden_usd,
         metodo_pago = EXCLUDED.metodo_pago, banco_emisor = EXCLUDED.banco_emisor,
         banco_receptor = EXCLUDED.banco_receptor, referencia = EXCLUDED.referencia,
         fecha_pago = EXCLUDED.fecha_pago, monto_pagado = EXCLUDED.monto_pagado,
         envio_metodo = EXCLUDED.envio_metodo, envio_opcion = EXCLUDED.envio_opcion,
         carrier = EXCLUDED.carrier, guia = EXCLUDED.guia,
         guia_path = COALESCE(EXCLUDED.guia_path, me_pagos.guia_path),
         comprobante_path = COALESCE(EXCLUDED.comprobante_path, me_pagos.comprobante_path),
         actualizado_at = NOW()`,
      [o.venta, b.cuenta ?? a.perfil, o.estado_me, o.fecha_orden, o.total_orden, o.total_orden_usd, o.metodo_pago,
       o.banco_emisor, o.banco_receptor, o.referencia, o.fecha_pago, o.monto_pagado, o.envio_metodo,
       o.envio_opcion, o.carrier, o.guia, guiaPath, compPath])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
