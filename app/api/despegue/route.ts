import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { BOT, REPETIDA, origenDe } from '@/lib/despegue'

// PATCH /api/despegue → anota un paso del embudo de la página pública (migración 112), sin sesión:
//   vista (entró) · video (tocó play en la serie) · telegram (tocó "Apartar mi cupo").
// Sin IP ni cookies de terceros: persona = id al azar guardado en su navegador (igual que Fundadores).

const Visita = z.object({
  navegador_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  evento: z.enum(['vista', 'video', 'telegram']),
  utm_source: z.string().max(60).optional(),
  utm_campaign: z.string().max(60).optional(),
  referrer: z.string().max(300).optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? ''
    const v = Visita.safeParse(await req.json().catch(() => null))
    if (!v.success || BOT.test(ua)) return new NextResponse(null, { status: 204 })
    const d = v.data
    await dbGlobal().query(
      `INSERT INTO despegue_visitas (navegador_id, evento, origen, campana, movil)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM despegue_visitas
                         WHERE navegador_id = $1 AND evento = $2 AND fecha > NOW() - $6::interval)`,
      [d.navegador_id, d.evento, origenDe(d, ua), d.utm_campaign?.trim().slice(0, 40) || null,
       /Android|iPhone|iPad|Mobile/i.test(ua), REPETIDA[d.evento]])
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
