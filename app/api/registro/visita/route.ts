import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { dbGlobal } from '@/lib/db'

// POST /api/registro/visita — anota que se abrió /registro (27-10, migración 128). Sin sesión: la llama la página
// al cargar en el navegador (los robots que solo leen el link no la ejecutan). Nunca falla hacia la página.
const ROBOT = /bot|crawl|spider|facebookexternalhit|preview|headless|lighthouse/i

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? ''
    if (ROBOT.test(ua)) return NextResponse.json({ ok: true })
    const b = await req.json().catch(() => ({})) as { origen?: unknown }
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const visitante = createHash('sha256').update(`${ip}|${ua}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32)
    const origen = typeof b.origen === 'string' ? b.origen.trim().toLowerCase().slice(0, 60) || null : null
    await dbGlobal().query(`INSERT INTO registro_visitas (visitante, origen) VALUES ($1, $2)`, [visitante, origen])
  } catch (err) {
    console.error('[registro/visita]', err)
  }
  return NextResponse.json({ ok: true })
}
