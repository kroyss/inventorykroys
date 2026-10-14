import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { calibracionDe, plantillasDe, plantillasBase, aprendidasDe, quitadasDe, invalidarCalibracion } from '@/lib/sugerenciasServidor'
import { CLAVE_APRENDIDAS, CLAVE_QUITADAS } from '@/lib/palabrasAprendidas'
import { UMBRAL_CAL, TEMAS, type Calibracion } from '@/lib/sugerenciasPreguntas'
import { estadoPlantillas, automaticasPausadas, LISTA_USOS, LISTA_PCT } from '@/lib/automaticasPreguntas'
import { proponer } from '@/lib/propuestasRespuestas'
import { normalizar } from '@/lib/sugerenciasPreguntas'

const CLAVE_DESCARTADAS = 'preguntas_propuestas_descartadas'

// GET /api/preguntas/respuestas → Preguntas → Configuración (respuestas sugeridas):
//   estado de cada respuesta rápida (usos, sin cambios, semáforo y en qué preguntas quedó probada),
//   lo aprendido por producto (envío gratis sí/no), propuestas de respuestas nuevas y la pausa.
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    // La calibración primero: al recalcular también aprende las palabras (lib/palabrasAprendidas.ts).
    const cal = (await plantillasBase(s.db)).length ? await calibracionDe(s.db) : ({} as Calibracion)
    const plantillas = await plantillasDe(s.db)
    const [estado, pausa, aprendidas] = await Promise.all([estadoPlantillas(s.db), automaticasPausadas(s.db), aprendidasDe(s.db)])
    // Por respuesta: en qué combinaciones de temas quedó probada (y con qué %).
    const probadas: Record<string, { temas: string; n: number; pct: number; activa: boolean }[]> = {}
    for (const [k, v] of Object.entries(cal)) {
      const [id, temas] = k.split('|')
      ;(probadas[id] ??= []).push({
        temas: temas.split('+').map(t => t.startsWith('p:') ? 'sus palabras' : TEMAS[t]?.nombre ?? t).join(' + '),
        n: v.n, pct: Math.round((100 * v.ok) / v.n), activa: v.n >= UMBRAL_CAL.minimo && v.ok / v.n >= UMBRAL_CAL.pct,
      })
    }
    for (const l of Object.values(probadas)) l.sort((a, b) => b.n - a.n)

    const { rows: hechos } = await s.db.query(
      `SELECT h.item_id, h.envio_gratis, h.fuente, h.precio_ref::float, h.actualizado_at,
              q.item_titulo AS titulo, q.item_imagen AS imagen, q.item_permalink AS link
       FROM ml_item_hechos h
       LEFT JOIN LATERAL (SELECT item_titulo, item_imagen, item_permalink FROM ml_preguntas
                          WHERE item_id = h.item_id ORDER BY (item_imagen IS NOT NULL) DESC, fecha DESC LIMIT 1) q ON TRUE
       ORDER BY h.actualizado_at DESC LIMIT 500`)

    // Propuestas: con lo respondido en los últimos 90 días (las políticas cambian).
    const { rows: hist } = await s.db.query(
      `SELECT texto, respuesta FROM ml_preguntas
       WHERE respuesta IS NOT NULL AND fecha > NOW() - INTERVAL '90 days' ORDER BY fecha DESC LIMIT 2000`)
    const { rows: [d] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_DESCARTADAS])
    let descartadas: string[] = []
    try { descartadas = JSON.parse(d?.value ?? '[]') } catch { /* vacío */ }
    const propuestas = proponer(hist, plantillas).filter(p => !descartadas.includes(normalizar(p.texto).slice(0, 120)))

    const { rows: [hoy] } = await s.db.query(
      `SELECT COUNT(*)::int AS n FROM respuestas_origen WHERE modulo = 'preguntas' AND fuente = 'automatica' AND fecha::date = CURRENT_DATE`)
    return NextResponse.json({
      plantillas: estado.map(e => ({ ...e, probadas: probadas[e.id] ?? [], aprendidas: aprendidas[e.id] ?? [] })),
      // Lo aprendido en la última semana: aviso con "Deshacer".
      recientes: Object.entries(aprendidas).flatMap(([id, l]) => l
        .filter(a => Date.now() - new Date(a.at).getTime() < 7 * 86_400_000)
        .map(a => ({ plantilla: id, titulo: plantillas.find(p => p.id === id)?.titulo ?? '', palabra: a.palabra, veces: a.veces }))).slice(0, 8),
      hechos, propuestas, pausa, automaticasHoy: hoy.n,
      reglas: { lista_usos: LISTA_USOS, lista_pct: LISTA_PCT * 100, umbral: UMBRAL_CAL.pct * 100 },
    })
  } catch (err) { return apiError(err) }
}

const Accion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('pausa'), pausa: z.boolean() }),
  z.object({ accion: z.literal('hecho'), item_id: z.string().regex(/^[A-Z]{3}\d+$/), envio_gratis: z.boolean().nullable() }),
  z.object({ accion: z.literal('descartar'), texto: z.string().min(1).max(4000) }),
  z.object({ accion: z.literal('quitar_palabra'), plantilla: z.string().min(1).max(80), palabra: z.string().min(1).max(60) }),
])

// POST /api/preguntas/respuestas { accion } → pausar las automáticas, corregir lo aprendido de un
// producto (envío gratis sí / no / olvidar) o descartar una propuesta.
export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Accion.parse(await req.json())
    if (b.accion === 'pausa') {
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ('preguntas_auto_pausa', $1)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [String(b.pausa)])
    } else if (b.accion === 'hecho') {
      if (b.envio_gratis === null) await s.db.query(`DELETE FROM ml_item_hechos WHERE item_id = $1`, [b.item_id])
      else await s.db.query(
        `INSERT INTO ml_item_hechos (item_id, envio_gratis, fuente) VALUES ($1, $2, 'manual')
         ON CONFLICT (empresa_id, item_id) DO UPDATE SET envio_gratis = EXCLUDED.envio_gratis, fuente = 'manual', actualizado_at = NOW()`,
        [b.item_id, b.envio_gratis])
    } else if (b.accion === 'quitar_palabra') {
      // Una palabra aprendida que no corresponde: se quita y no se vuelve a aprender para esa respuesta.
      const [apr, quit] = await Promise.all([aprendidasDe(s.db), quitadasDe(s.db)])
      apr[b.plantilla] = (apr[b.plantilla] ?? []).filter(a => a.palabra !== b.palabra)
      quit[b.plantilla] = [...new Set([...(quit[b.plantilla] ?? []), b.palabra])].slice(-100)
      for (const [k, v] of [[CLAVE_APRENDIDAS, apr], [CLAVE_QUITADAS, quit]] as const) {
        await s.db.query(
          `INSERT INTO app_settings (key, value) VALUES ($1, $2)
           ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [k, JSON.stringify(v)])
      }
      await invalidarCalibracion(s.db)
    } else {
      const { rows: [d] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_DESCARTADAS])
      let l: string[] = []
      try { l = JSON.parse(d?.value ?? '[]') } catch { /* vacío */ }
      l = [...new Set([...l, normalizar(b.texto).slice(0, 120)])].slice(-200)
      await s.db.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [CLAVE_DESCARTADAS, JSON.stringify(l)])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
