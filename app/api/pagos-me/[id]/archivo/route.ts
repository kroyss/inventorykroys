import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { leerArchivoME, sesionPagosME } from '@/lib/pagosME'
import { comprobanteDemo, esArchivoDemo, guiaDemo } from '@/lib/demoPagosME'

const TIPOS: Record<string, string> = {
  pdf: 'application/pdf', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
}

/** GET /api/pagos-me/[id]/archivo?tipo=comprobante|guia → la imagen del pago o la guía PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const col = req.nextUrl.searchParams.get('tipo') === 'guia' ? 'guia_path' : 'comprobante_path'
    const { rows: [r] } = await s.db.query(`SELECT ${col} AS p FROM me_pagos WHERE id = $1`, [id])
    if (!r?.p) return NextResponse.json({ error: 'No hay archivo' }, { status: 404 })
    // Demo (19-10): el comprobante y la guía se dibujan con los datos del pago (lib/demoPagosME.ts).
    if (esArchivoDemo(String(r.p))) {
      const { rows: [p] } = await s.db.query(
        `SELECT venta, banco_emisor, banco_receptor, referencia, fecha_pago, monto_pagado::float, metodo_pago, carrier, guia, envio_opcion, cuenta
         FROM me_pagos WHERE id = $1`, [id])
      const f = col === 'guia_path' ? await guiaDemo(p) : comprobanteDemo(p)
      return new NextResponse(new Uint8Array(f.datos), { headers: { 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=3600' } })
    }
    const data = await leerArchivoME(r.p)
    const ext = String(r.p).split('.').pop()!.toLowerCase()
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    return apiError(err)
  }
}
