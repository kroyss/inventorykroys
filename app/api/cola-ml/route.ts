import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import { apiError } from '@/lib/apiError'
import { sesionPromociones } from '@/lib/promocionesSesion'

const SQL_CUENTAS = `COUNT(*) FILTER (WHERE i.estado = 'ok')::int AS ok, COUNT(*) FILTER (WHERE i.estado = 'sin_cambio')::int AS sin_cambio,
  COUNT(*) FILTER (WHERE i.estado = 'saltada')::int AS saltadas, COUNT(*) FILTER (WHERE i.estado = 'error')::int AS errores,
  COUNT(*) FILTER (WHERE i.estado IN ('pendiente', 'procesando'))::int AS pendientes`

/**
 * Cola de tareas para MercadoLibre (lib/colaML.ts):
 *   GET            → lo que está en curso y lo terminado hace poco (aviso de abajo en todas las pantallas).
 *   GET ?lote=ID   → el detalle de un lote: cómo quedó cada publicación.
 * Las lecturas de descripciones (tipo 'leer') no se muestran en el aviso: son internas.
 */
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    const lote = Number(req.nextUrl.searchParams.get('lote'))
    if (lote > 0) {
      const { rows: [l] } = await db.query(
        `SELECT l.id::int, l.tipo, l.titulo, l.estado, l.total, ${SQL_CUENTAS}
         FROM ml_pub_lotes l LEFT JOIN ml_pub_lote_items i ON i.lote_id = l.id WHERE l.id = $1 GROUP BY l.id`, [lote])
      if (!l) return NextResponse.json({ error: 'No existe' }, { status: 404 })
      const { rows: items } = await db.query(
        `SELECT item_id, estado, mensaje, resultado, intentos FROM ml_pub_lote_items WHERE lote_id = $1`, [lote])
      return NextResponse.json({ lote: l, items })
    }
    const { rows } = await db.query(
      `SELECT l.id::int, l.tipo, l.titulo, l.estado, l.total, l.terminado_at, ${SQL_CUENTAS}
       FROM ml_pub_lotes l LEFT JOIN ml_pub_lote_items i ON i.lote_id = l.id
       WHERE l.tipo <> 'leer' AND (l.estado = 'en_curso' OR l.terminado_at > NOW() - INTERVAL '15 minutes')
       GROUP BY l.id ORDER BY l.creado_at DESC LIMIT 5`)
    return NextResponse.json({ lotes: rows })
  } catch (err) { return apiError(err) }
}

/** DELETE ?lote=ID → cancela lo que falta de un lote de promociones (lo ya hecho queda). Los de Publicaciones se
 *  cancelan desde su pantalla (/api/publicaciones/lotes/[id]). */
export async function DELETE(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const lote = Number(req.nextUrl.searchParams.get('lote'))
    if (!(lote > 0)) return NextResponse.json({ error: 'Falta el lote' }, { status: 400 })
    await s.db.query(`UPDATE ml_pub_lotes SET estado = 'cancelado', terminado_at = NOW() WHERE id = $1 AND tipo = 'promocion' AND estado = 'en_curso'`, [lote])
    await s.db.query(`UPDATE ml_pub_lote_items SET estado = 'saltada', mensaje = 'Cancelada', hecho_at = NOW() WHERE lote_id = $1 AND estado = 'pendiente'`, [lote])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
