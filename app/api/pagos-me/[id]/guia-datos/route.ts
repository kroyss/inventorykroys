import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { leerArchivoME, sesionPagosME } from '@/lib/pagosME'
import { leerEtiquetas } from '@/lib/despachos'

// GET /api/pagos-me/[id]/guia-datos → lo que dice la guía de MercadoEnvíos de ese pago (destinatario,
// cédula, teléfono, ciudad, dirección…), leído del PDF con el mismo lector de Despachos. Para Ventas →
// Por confirmar → "Ver guía": el texto se muestra aparte para poder copiarlo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const { rows: [r] } = await s.db.query(
      `SELECT venta, guia, carrier, envio_metodo, envio_opcion, guia_path FROM me_pagos WHERE id = $1`, [id])
    if (!r?.guia_path) return NextResponse.json({ error: 'Este pago no tiene guía todavía' }, { status: 404 })
    let leida: Awaited<ReturnType<typeof leerEtiquetas>>[number] | null = null
    try {
      const pdf = await leerArchivoME(r.guia_path)
      leida = (await leerEtiquetas([pdf], [`guia-${r.venta}.pdf`]))[0] ?? null
    } catch (e) {
      // Sin el lector (servicio de etiquetas caído): igual se ve el PDF.
      console.error('[guia-datos]', id, e instanceof Error ? e.message : e)
    }
    return NextResponse.json({
      venta: r.venta, guia: leida?.guia ?? r.guia ?? null, carrier: leida?.carrier ?? r.carrier ?? null,
      envio: [r.envio_metodo, r.envio_opcion].filter(Boolean).join(' · ') || null,
      destinatario: leida?.destinatario_limpio || leida?.destinatario || null,
      documento: leida?.fac_documento ?? null, telefono: leida?.fac_telefono ?? null,
      ciudad: leida?.fac_ciudad ?? null, direccion: leida?.fac_direccion ?? null,
      remitente: leida?.remitente_limpio || leida?.remitente || null,
      leida: !!leida && !leida.error,
    })
  } catch (err) {
    return apiError(err)
  }
}
