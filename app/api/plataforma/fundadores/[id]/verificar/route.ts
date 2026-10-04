import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { getSessionDb } from '@/lib/session'
import { mlFetch } from '@/lib/ml'

interface UsuarioML {
  id: number; nickname: string; registration_date?: string; points?: number
  seller_reputation?: {
    level_id?: string | null; power_seller_status?: string | null
    transactions?: { total?: number; completed?: number; canceled?: number; period?: string }
    metrics?: { sales?: { completed?: number; period?: string } }
  }
}

// El nick se verifica por el perfil PÚBLICO (mercadolibre.com.ve/perfil/vendedor/<nick>): la
// búsqueda por nick de la API da 403 a todas las apps desde oct-2026. Hasta el 2026-10-04 el
// perfil traía el id del vendedor (y con /users/<id> salían las ventas EXACTAS); ahora se arma en
// el navegador y no lo trae. Lo que sí trae, en el HTML del servidor:
//   * <title> "NICK | Perfil oficial del vendedor…"  -> existe, y con su nick bien escrito
//     ("Parece que esta página no existe" -> no existe)
//   * meta description: "X lleva MercadoLíder Gold y cuenta con 6 años vendiendo…" o
//     "X lleva 11 años vendiendo… y cuenta con +10mil ventas concretadas."
// Si algún día vuelve el id en la página, se usa (ventas exactas).
const NAVEGADOR = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'es' }

const decodificar = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

async function perfilPublico(nick: string) {
  const r = await fetch(`https://www.mercadolibre.com.ve/perfil/vendedor/${encodeURIComponent(nick.trim())}`, { headers: NAVEGADOR, cache: 'no-store' })
  if (!r.ok) return null
  const html = await r.text()
  const titulo = decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? '')
  const m = titulo.match(/^(.+?)\s*\|\s*Perfil oficial del vendedor/i)
  if (!m) return { existe: false as const }
  const desc = decodificar(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
  const ids = [...new Set([...html.matchAll(/"(?:seller_id|sellerId|user_id|userId)"\s*:\s*"?(\d{5,12})/g)].map(x => x[1]))].slice(0, 3)
  return {
    existe: true as const, nickname: m[1].trim(), ids,
    anios: Number(desc.match(/(\d+)\s+años?\s+vendiendo/i)?.[1]) || null,
    lider: desc.match(/MercadoL[ií]der\s+(Platinum|Gold)/i)?.[1]?.toLowerCase() ?? (/MercadoL[ií]der/i.test(desc) ? 'mercadolider' : null),
    ventas_texto: desc.match(/\+\s?[\d.,]+\s*(?:mil)?\s+ventas/i)?.[0]?.replace(/\s+/g, ' ') ?? null,
  }
}

// Si el panel corrige el nick (el postulante escribió el nombre de su tienda, no su nick).
const Body = z.object({ nick: z.string().trim().min(2).max(60).optional() }).optional()

// POST /api/plataforma/fundadores/[id]/verificar → verifica el nick en MercadoLibre (datos
// PÚBLICOS) y lo guarda en la solicitud. Con { nick } corrige antes el nick de la solicitud.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  try {
    const { db } = await getSessionDb()
    if (!db) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })
    const body = Body.safeParse(await req.json().catch(() => undefined))
    if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 })
    if (body.data?.nick) {
      // Si pegaron el enlace del perfil, queda solo el nick.
      const nick = decodeURIComponent(body.data.nick.replace(/^.*\/perfil\/vendedor\//i, '').replace(/[/?#].*$/, '')).trim()
      await dbGlobal().query(`UPDATE fundadores_solicitudes SET nick_ml = $2 WHERE id = $1`, [id, nick])
    }
    const { rows: [s] } = await dbGlobal().query(`SELECT nick_ml, ml_verificado FROM fundadores_solicitudes WHERE id = $1`, [id])
    if (!s?.nick_ml) return NextResponse.json({ error: 'Esta solicitud no trae nick de MercadoLibre' }, { status: 400 })

    let resultado: Record<string, unknown>
    const p = await perfilPublico(s.nick_ml).catch(() => null)
    if (!p) {
      resultado = { encontrado: false, motivo: 'No se pudo consultar MercadoLibre (intenta de nuevo)' }
    } else if (!p.existe) {
      resultado = { encontrado: false, motivo: 'Ese perfil no existe en MercadoLibre Venezuela: suele ser el nombre de la tienda y no el nick. Corrígelo abajo.' }
    } else {
      resultado = { encontrado: true, nickname: p.nickname, anios: p.anios, lider: p.lider, ventas_texto: p.ventas_texto }
      // Si antes se verificó con ventas EXACTAS (cuando la página traía el id), se conservan.
      const previo = s.ml_verificado as Record<string, unknown> | null
      if (previo?.encontrado && String(previo.nickname ?? '').toUpperCase() === p.nickname.toUpperCase()) {
        for (const k of ['id', 'desde', 'nivel', 'ventas_total', 'ventas_periodo', 'periodo'] as const)
          if (previo[k] != null) resultado[k] = previo[k]
      }
      // Ventas EXACTAS solo si la página trae el id (hoy no) y hay una cuenta conectada para leer /users.
      const { rows: [c] } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1`)
      for (const sid of c ? p.ids : []) {
        const u = await mlFetch<UsuarioML>(db, c.id, `/users/${sid}`).catch(() => null)
        if (u?.nickname?.toUpperCase() !== p.nickname.toUpperCase()) continue
        const rep = u.seller_reputation ?? {}
        Object.assign(resultado, {
          id: u.id, desde: u.registration_date ?? null, nivel: rep.level_id ?? null, lider: rep.power_seller_status ?? p.lider,
          ventas_total: rep.transactions?.completed ?? rep.transactions?.total ?? null,
          ventas_periodo: rep.metrics?.sales?.completed ?? null, periodo: rep.metrics?.sales?.period ?? null,
        })
        break
      }
    }
    resultado.verificado_at = new Date().toISOString()
    await dbGlobal().query(`UPDATE fundadores_solicitudes SET ml_verificado = $2 WHERE id = $1`, [id, JSON.stringify(resultado)])
    return NextResponse.json({ ml_verificado: resultado })
  } catch (err) {
    return apiError(err)
  }
}
