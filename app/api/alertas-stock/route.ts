import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionStock } from '@/lib/preguntasSesion'
import { SQL_VENDIDA, sqlCaliente, umbralStock } from '@/lib/alertasStock'
import { puede } from '@/lib/permisos'

// GET /api/alertas-stock?vista=agotadas|bajas → publicaciones (y variantes) de ML vendidas en los
// últimos 30 días que están agotadas o por agotarse (menos del límite). `caliente`: de los últimos 7 días y
// sin quitar (lo único que cuentan los contadores y el aviso); el resto va a "En el olvido".
// PUT { umbral } (admin) → el límite de "por agotarse" de la empresa.
const FRESCA = `a.actualizado_at > NOW() - INTERVAL '1 day' AND a.estado <> 'pausada' AND ${SQL_VENDIDA}`
// Pausadas a mano (migración 101): todas las que el sistema ve pausadas con stock, vendidas o no. "En la lista"
// = sin quitar con "Quitar de la lista" después de pausarse; al reactivarla en ML sale sola.
// 26-10: también las que ML pausó al quedar en 0 cuando el inventario SÍ tiene (publicación sin variantes vinculada
// a un producto con stock): tienes en el depósito y la publicación está apagada sin avisar. Desde = cuando se agotó.
const SQL_INVENTARIO = `(SELECT MAX(i.quantity)::int FROM product_ml_codes m
    JOIN products p ON p.id = m.product_id AND p.is_active JOIN inventory i ON i.product_id = p.id
   WHERE m.is_active AND split_part(m.ml_code, ':', 1) = substring(a.item_id FROM 4))`
const PAUSADA = `a.actualizado_at > NOW() - INTERVAL '1 day' AND (a.estado = 'pausada'
  OR (a.estado = 'paused' AND a.disponible <= 0 AND a.variante_id = 0 AND ${SQL_INVENTARIO} > 0))`
const PAUSADA_EN_LISTA = `(a.descartada_at IS NULL OR a.descartada_at < COALESCE(a.pausada_desde, a.agotada_desde))`

export async function GET(req: NextRequest) {
  const s = await sesionStock()
  if ('error' in s) return s.error
  const vista = new URL(req.url).searchParams.get('vista') ?? 'agotadas'
  try {
    const umbral = await umbralStock(s.db)
    const filtro = vista === 'pausadas' ? PAUSADA
      : vista === 'bajas' ? `${FRESCA} AND a.disponible > 0 AND a.disponible < $1` : `${FRESCA} AND a.disponible <= 0`
    const orden = vista === 'pausadas' ? 'COALESCE(a.pausada_desde, a.agotada_desde) DESC' : vista === 'bajas' ? 'a.disponible, a.bajo_desde' : 'a.agotada_desde DESC'
    const caliente = vista === 'pausadas' ? PAUSADA_EN_LISTA : vista === 'bajas' ? sqlCaliente('a.bajo_desde') : sqlCaliente('a.agotada_desde')
    const [{ rows }, { rows: [n] }, { rows: [rev] }] = await Promise.all([
      s.db.query(
        `SELECT a.item_id, a.variante_id::text, a.titulo, a.variante, a.disponible, a.estado, a.permalink, a.imagen,
                a.agotada_desde, a.bajo_desde, a.ultima_agotada_at, a.pausada_desde, a.sub_status, c.nickname AS cuenta,
                ${caliente} AS caliente, a.descartada_at${vista === 'pausadas' ? `, ${SQL_INVENTARIO} AS inventario` : ''}
         FROM ml_stock_alertas a JOIN ml_conexiones c ON c.id = a.conexion_id
         WHERE ${filtro} AND ($1::int IS NOT NULL) ORDER BY ${caliente} DESC, ${orden}, a.titulo LIMIT 500`, [umbral]),
      s.db.query(
        `SELECT COUNT(*) FILTER (WHERE ${FRESCA} AND a.disponible <= 0 AND ${sqlCaliente('a.agotada_desde')})::int AS agotadas,
                COUNT(*) FILTER (WHERE ${FRESCA} AND a.disponible > 0 AND a.disponible < $1 AND ${sqlCaliente('a.bajo_desde')})::int AS bajas,
                COUNT(*) FILTER (WHERE ${PAUSADA} AND ${PAUSADA_EN_LISTA})::int AS pausadas
         FROM ml_stock_alertas a`, [umbral]),
      s.db.query(`SELECT MIN(stock_alertas_at) AS desde, MAX(stock_alertas_at) AS hasta, COUNT(*)::int AS cuentas
                  FROM ml_conexiones WHERE estado = 'activa'`),
    ])
    return NextResponse.json({ filas: rows, contadores: n, umbral, revision: rev, esAdmin: puede(s.session.user, 'automatizaciones_config'), puedeStock: puede(s.session.user, 'reponer_stock') })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const s = await sesionStock('automatizaciones_config')
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
