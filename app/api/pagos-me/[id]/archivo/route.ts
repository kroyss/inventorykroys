import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { leerArchivoME, sesionPagosME } from '@/lib/pagosME'

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
    const data = await leerArchivoME(r.p)
    const ext = String(r.p).split('.').pop()!.toLowerCase()
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err) {
    return apiError(err)
  }
}
