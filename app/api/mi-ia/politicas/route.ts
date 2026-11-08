import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { iaConfigurada } from '@/lib/ia'
import { EsquemaMiIA } from '@/lib/miIAEsquema'
import { MI_IA_KEY, datoDeContacto } from '@/lib/miIA'
import { pasarPoliticas } from '@/lib/miIAPoliticas'

// "Pasar mis Políticas a Mi IA" (08-11, lib/miIAPoliticas.ts).
// POST → propuesta (no guarda). PUT { miIA, resto } → guarda Mi IA y deja en Políticas ("Otras indicaciones") solo el resto.
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    return NextResponse.json(await pasarPoliticas(s.db, s.session.user.id))
  } catch (err) { return apiError(err) }
}

const Cuerpo = z.object({ miIA: EsquemaMiIA, resto: z.string().max(10000) })

export async function PUT(req: NextRequest) {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  const p = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  const c = p.data.miIA
  for (const [campo, v] of [['La oferta fija', c.oferta?.texto], ['El saludo', c.tono?.saludo], ['La despedida', c.tono?.despedida]] as const) {
    if (datoDeContacto(v)) return NextResponse.json({ error: `${campo} tiene un teléfono, correo o link: MercadoLibre borra o sanciona esas respuestas.` }, { status: 400 })
  }
  try {
    const guardar = `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
                     ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
    await s.db.query('BEGIN')
    await s.db.query(guardar, [MI_IA_KEY, JSON.stringify({ ...c, actualizado: new Date().toISOString() })])
    await s.db.query(guardar, ['preguntas_politicas', p.data.resto.trim()])
    await s.db.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await s.db.query('ROLLBACK').catch(() => {})
    return apiError(err)
  }
}
