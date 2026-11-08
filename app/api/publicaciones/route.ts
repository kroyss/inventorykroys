import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { whereFiltro } from '@/lib/publicacionesLista'
import { actualizarCatalogo } from '@/lib/catalogoML'

const POR_PAGINA = 40

// GET /api/publicaciones?q=&cuenta=&estado=&pagina= → las publicaciones de las cuentas conectadas (ml_catalogo).
export async function GET(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const p = req.nextUrl.searchParams
  const pagina = Math.max(1, Number(p.get('pagina')) || 1)
  try {
    const w = whereFiltro({ q: p.get('q') ?? '', cuenta: Number(p.get('cuenta')) || null, estado: p.get('estado') })
    const [{ rows }, { rows: [t] }, { rows: cuentas }] = await Promise.all([
      s.db.query(
        `SELECT m.item_id, m.titulo, m.precio::float AS precio, m.moneda, m.disponible, m.estado, m.thumbnail, m.permalink, m.sku,
                k.nickname AS cuenta, COALESCE(jsonb_array_length(m.variantes), 0) AS variantes,
                (SELECT MAX(c.creado_at) FROM ml_publicacion_cambios c WHERE c.item_id = m.item_id AND c.ok) AS editada_at
         ${w.sql} ORDER BY m.sin_movimiento, m.estado, m.titulo LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, w.args),
      s.db.query(`SELECT COUNT(*)::int AS n ${w.sql}`, w.args),
      s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`),
    ])
    return NextResponse.json({ filas: rows, total: t.n, porPagina: POR_PAGINA, cuentas })
  } catch (err) {
    return apiError(err)
  }
}

// POST /api/publicaciones → relee YA de MercadoLibre el catálogo de todas las cuentas (08-11, el dueño: las recién
// publicadas no salían hasta la vuelta automática de cada 6 horas).
export async function POST() {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa'`)
    let n = 0
    for (const c of rows) n += (await actualizarCatalogo(s.db, c.id, true).catch(() => null)) ?? 0
    return NextResponse.json({ ok: true, leidas: n })
  } catch (err) {
    return apiError(err)
  }
}
