import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { CLAVE_IA_AUTO, configIA } from '@/lib/iaAutomatica'
import { cupoIA } from '@/lib/ia'

// GET /api/preguntas/ia-auto → Preguntas → Configuración → Respuesta automática con IA: el modo, los créditos y las
// últimas preguntas que procesó (qué decidió, la respuesta, la que se publicó y la marca bien/mal del vendedor).
export async function GET() {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const cfg = await configIA(s.db)
    const { rows } = await s.db.query(
      `SELECT id::text, texto, item_titulo, item_permalink, to_char(fecha, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha, estado, respuesta, ia_auto
       FROM ml_preguntas WHERE ia_auto IS NOT NULL AND ia_auto->>'estado' IS DISTINCT FROM 'procesando'
       ORDER BY fecha DESC LIMIT 200`)
    const sola = rows.filter(r => r.ia_auto.decision === 'sola')
    const marcadas = sola.filter(r => r.ia_auto.marca)
    return NextResponse.json({
      ...cfg,
      cupo: await cupoIA(s.db, s.session.user.empresaId),
      resumen: {
        procesadas: rows.length, solas: sola.length, revisar: rows.length - sola.length,
        marcadas: marcadas.length, bien: marcadas.filter(r => r.ia_auto.marca === 'bien').length,
        costo: rows.reduce((a, r) => a + (Number(r.ia_auto.costo) || 0), 0),
      },
      preguntas: rows,
    })
  } catch (err) { return apiError(err) }
}

const Accion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('modo'), modo: z.enum(['apagado', 'sombra', 'real']) }),
  z.object({ accion: z.literal('marcar'), id: z.string().regex(/^\d+$/), marca: z.enum(['bien', 'mal']).nullable() }),
])

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s.error
  try {
    const b = Accion.parse(await req.json())
    if (b.accion === 'modo') {
      const actual = await configIA(s.db)
      // "desde" = desde cuándo se procesan preguntas: al prender, solo las que llegan de ahí en adelante.
      const desde = b.modo === 'apagado' ? null : actual.modo === 'apagado' ? new Date().toISOString() : actual.desde
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [CLAVE_IA_AUTO, JSON.stringify({ modo: b.modo, desde })])
    } else {
      await s.db.query(
        `UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('marca', $2::text, 'marcada_at', NOW())
         WHERE id = $1 AND ia_auto IS NOT NULL`, [b.id, b.marca])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
