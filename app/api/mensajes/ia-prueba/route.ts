import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { CLAVE_AUTO, listaPrueba } from '@/lib/mensajesIAPrueba'
import { puede } from '@/lib/permisos'
import { errorFaltanMiIA, faltanMiIA } from '@/lib/miIA'
import { frenosDeFabrica } from '@/lib/iaFrenos'

// Mensajes → IA en prueba (mig 145, lib/mensajesIAPrueba.ts). GET → los casos, el resumen y si está en automático
// · POST → marcar Bien / Mal · PUT { auto } → enciende / apaga el envío automático (mig 149, permiso automatizaciones_config).
async function sesion() {
  const s = await sesionPreguntas()
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'mensajes_ia')) return { error: NextResponse.json({ error: 'Tu empresa no tiene la IA de Mensajes en prueba' }, { status: 403 }) } as const
  return s
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const { rows: [a] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AUTO])
    let auto = false
    try { auto = JSON.parse(a?.value ?? '{}').modo === 'real' } catch { /* apagado */ }
    return NextResponse.json({ ...(await listaPrueba(s.db)), auto, puedeConfigurar: puede(s.session.user, 'automatizaciones_config') })
  } catch (err) { return apiError(err) }
}

const Auto = z.object({ auto: z.boolean() })

export async function PUT(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'automatizaciones_config')) return NextResponse.json({ error: 'No tienes permiso para cambiar las automatizaciones' }, { status: 403 })
  try {
    const p = Auto.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    // 09-11: solo se enciende con Mi IA completo.
    if (p.data.auto && tieneModulo(s.session.user, 'mi_ia')) {
      const faltan = await faltanMiIA(s.db)
      if (faltan.length) return NextResponse.json({ error: errorFaltanMiIA(faltan), faltanMiIA: faltan }, { status: 400 })
    }
    await s.db.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [CLAVE_AUTO, JSON.stringify({ modo: p.data.auto ? 'real' : 'apagado', por: s.session.user.id, at: new Date().toISOString() })])
    if (p.data.auto) await frenosDeFabrica(s.db)
    return NextResponse.json({ ok: true, auto: p.data.auto })
  } catch (err) { return apiError(err) }
}

const Marca = z.object({ id: z.string().regex(/^\d+$/), marca: z.enum(['bien', 'mal']).nullable() })

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const p = Marca.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    await s.db.query(
      `UPDATE ml_mensajes_ia SET marca = $2, marcada_por = CASE WHEN $2::text IS NULL THEN NULL ELSE $3::int END,
         marcada_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END WHERE id = $1`,
      [p.data.id, p.data.marca, s.session.user.id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
