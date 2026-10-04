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

// Id del vendedor a partir del nick. La búsqueda de la API (/sites/MLV/search?nickname=) ya no está
// abierta a las apps (403 desde oct-2026, aun con la cuenta propia): se lee el perfil PÚBLICO
// (mercadolibre.com.ve/perfil/vendedor/<nick>), que trae el id, y se confirma con /users/<id> que
// el nick coincida.
async function idDeNick(db: Parameters<typeof mlFetch>[0], conexionId: number, nick: string) {
  const r = await fetch(`https://www.mercadolibre.com.ve/perfil/vendedor/${encodeURIComponent(nick.trim())}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'es' },
    cache: 'no-store',
  })
  if (!r.ok) return null
  const html = await r.text()
  const ids = [...new Set([...html.matchAll(/"(?:seller_id|sellerId|user_id|userId)"\s*:\s*"?(\d{5,12})/g)].map(m => m[1]))].slice(0, 3)
  const buscado = nick.trim().toUpperCase()
  for (const id of ids) {
    const u = await mlFetch<{ nickname?: string }>(db, conexionId, `/users/${id}`).catch(() => null)
    if (u?.nickname?.toUpperCase() === buscado) return id
  }
  return null
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
      const sellerId = await idDeNick(db, c.id, s.nick_ml)
      if (!sellerId) {
        resultado = { encontrado: false, motivo: 'No encontramos ese nick en MercadoLibre Venezuela (revisa cómo lo escribió)' }
      } else {
        const u = await mlFetch<UsuarioML>(db, c.id, `/users/${sellerId}`)
        const r = u.seller_reputation ?? {}
        resultado = {
          encontrado: true, id: u.id, nickname: u.nickname, desde: u.registration_date ?? null,
          nivel: r.level_id ?? null, lider: r.power_seller_status ?? null,
          ventas_total: r.transactions?.completed ?? r.transactions?.total ?? null, canceladas: r.transactions?.canceled ?? null,
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
