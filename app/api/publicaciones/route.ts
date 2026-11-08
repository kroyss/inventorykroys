import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'

const POR_PAGINA = 40

// GET /api/publicaciones?q=&cuenta=&estado=&pagina= → las publicaciones de las cuentas conectadas (ml_catalogo).
export async function GET(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim().slice(0, 100)
  const cuenta = Number(p.get('cuenta')) || null
  const estado = ['active', 'paused'].includes(p.get('estado') ?? '') ? p.get('estado') : null
  const pagina = Math.max(1, Number(p.get('pagina')) || 1)
  try {
    const where = [`k.estado = 'activa'`]
    const args: unknown[] = []
    if (q) {
      const numero = q.replace(/[^0-9]/g, '')
      args.push(numero.length >= 6 ? numero : '-', `%${q}%`)
      const a = args.length
      where.push(`(regexp_replace(m.item_id, '[^0-9]', '', 'g') = $${a - 1} OR m.titulo ILIKE $${a} OR m.sku ILIKE $${a})`)
    }
    if (cuenta) { args.push(cuenta); where.push(`m.conexion_id = $${args.length}`) }
    if (estado) { args.push(estado); where.push(`m.estado = $${args.length}`) }
    const sql = `FROM ml_catalogo m JOIN ml_conexiones k ON k.id = m.conexion_id WHERE ${where.join(' AND ')}`
    const [{ rows }, { rows: [t] }, { rows: cuentas }] = await Promise.all([
      s.db.query(
        `SELECT m.item_id, m.titulo, m.precio::float AS precio, m.moneda, m.disponible, m.estado, m.thumbnail, m.permalink, m.sku,
                k.nickname AS cuenta, COALESCE(jsonb_array_length(m.variantes), 0) AS variantes,
                (SELECT MAX(c.creado_at) FROM ml_publicacion_cambios c WHERE c.item_id = m.item_id AND c.ok) AS editada_at
         ${sql} ORDER BY m.sin_movimiento, m.estado, m.titulo LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, args),
      s.db.query(`SELECT COUNT(*)::int AS n ${sql}`, args),
      s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`),
    ])
    return NextResponse.json({ filas: rows, total: t.n, porPagina: POR_PAGINA, cuentas })
  } catch (err) {
    return apiError(err)
  }
}
