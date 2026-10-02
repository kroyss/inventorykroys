import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { umbralStock } from '@/lib/alertasStock'

// GET /api/alertas-stock?vista=agotadas|bajas|semana → publicaciones (y variantes) de ML agotadas,
// por agotarse (menos del límite) o que se agotaron en los últimos 7 días, con los contadores.
// PUT { umbral } (admin) → el límite de "por agotarse" de la empresa.
const FRESCA = `a.actualizado_at > NOW() - INTERVAL '1 day'`

export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const vista = new URL(req.url).searchParams.get('vista') ?? 'agotadas'
  try {
    const umbral = await umbralStock(s.db)
    const filtro = vista === 'bajas' ? `${FRESCA} AND a.disponible > 0 AND a.disponible < $1`
      : vista === 'semana' ? `a.ultima_agotada_at > NOW() - INTERVAL '7 days'`
      : `${FRESCA} AND a.disponible <= 0`
    const orden = vista === 'bajas' ? 'a.disponible, a.bajo_desde' : vista === 'semana' ? 'a.ultima_agotada_at DESC' : 'a.agotada_desde DESC'
    const [{ rows }, { rows: [n] }, { rows: [rev] }] = await Promise.all([
      s.db.query(
        `SELECT a.item_id, a.variante_id::text, a.titulo, a.variante, a.disponible, a.estado, a.permalink, a.imagen,
                a.agotada_desde, a.bajo_desde, a.ultima_agotada_at, c.nickname AS cuenta
         FROM ml_stock_alertas a JOIN ml_conexiones c ON c.id = a.conexion_id
         WHERE ${filtro} AND ($1::int IS NOT NULL) ORDER BY ${orden}, a.titulo LIMIT 500`, [umbral]),
      s.db.query(
        `SELECT COUNT(*) FILTER (WHERE ${FRESCA} AND a.disponible <= 0)::int AS agotadas,
                COUNT(*) FILTER (WHERE ${FRESCA} AND a.disponible > 0 AND a.disponible < $1)::int AS bajas,
                COUNT(*) FILTER (WHERE a.ultima_agotada_at > NOW() - INTERVAL '7 days')::int AS semana
         FROM ml_stock_alertas a`, [umbral]),
      s.db.query(`SELECT MIN(stock_alertas_at) AS desde, MAX(stock_alertas_at) AS hasta, COUNT(*)::int AS cuentas
                  FROM ml_conexiones WHERE estado = 'activa'`),
    ])
    return NextResponse.json({ filas: rows, contadores: n, umbral, revision: rev, esAdmin: s.session.user.role === 'admin' })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  try {
    const { umbral } = z.object({ umbral: z.number().int().min(1).max(100) }).parse(await req.json())
    await s.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('stock_alerta_umbral', $1, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [String(umbral)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'El límite va de 1 a 100' }, { status: 400 })
    return apiError(err)
  }
}
