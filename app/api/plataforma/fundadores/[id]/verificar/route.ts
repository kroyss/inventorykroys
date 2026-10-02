import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { getSessionDb } from '@/lib/session'
import { mlFetch, ErrorML } from '@/lib/ml'

interface UsuarioML {
  id: number; nickname: string; registration_date?: string; points?: number
  seller_reputation?: {
    level_id?: string | null; power_seller_status?: string | null
    transactions?: { total?: number; completed?: number; canceled?: number; period?: string }
    metrics?: { sales?: { completed?: number; period?: string } }
  }
}

// POST /api/plataforma/fundadores/[id]/verificar → busca el nick en MercadoLibre (datos
// PÚBLICOS: reputación y ventas) con una cuenta conectada del dueño, y lo guarda en la solicitud.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  try {
    const { db } = await getSessionDb()
    if (!db) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
    const { rows: [s] } = await dbGlobal().query(`SELECT nick_ml FROM fundadores_solicitudes WHERE id = $1`, [id])
    if (!s?.nick_ml) return NextResponse.json({ error: 'Esta solicitud no trae nick de MercadoLibre' }, { status: 400 })
    const { rows: [c] } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1`)
    if (!c) return NextResponse.json({ error: 'Conecta una cuenta de MercadoLibre para poder verificar' }, { status: 409 })

    let resultado: Record<string, unknown>
    try {
      const busq = await mlFetch<{ seller?: { id: number } }>(db, c.id, `/sites/MLV/search?nickname=${encodeURIComponent(s.nick_ml)}&limit=1`)
      if (!busq.seller?.id) {
        resultado = { encontrado: false, motivo: 'No hay un vendedor con ese nick y publicaciones activas en MercadoLibre Venezuela' }
      } else {
        const u = await mlFetch<UsuarioML>(db, c.id, `/users/${busq.seller.id}`)
        const r = u.seller_reputation ?? {}
        resultado = {
          encontrado: true, id: u.id, nickname: u.nickname, desde: u.registration_date ?? null,
          nivel: r.level_id ?? null, lider: r.power_seller_status ?? null,
          ventas_total: r.transactions?.completed ?? null, canceladas: r.transactions?.canceled ?? null,
          ventas_periodo: r.metrics?.sales?.completed ?? null, periodo: r.metrics?.sales?.period ?? null,
        }
      }
    } catch (e) {
      resultado = { encontrado: false, motivo: e instanceof ErrorML ? e.message : 'No se pudo consultar MercadoLibre' }
    }
    resultado.verificado_at = new Date().toISOString()
    await dbGlobal().query(`UPDATE fundadores_solicitudes SET ml_verificado = $2 WHERE id = $1`, [id, JSON.stringify(resultado)])
    return NextResponse.json({ ml_verificado: resultado })
  } catch (err) {
    return apiError(err)
  }
}
