import { NextRequest, NextResponse } from 'next/server'
import { dbEmpresa } from '@/lib/db'
import { mlFetch } from '@/lib/ml'
import { ES_STAGING } from '@/lib/entorno'
import type { Country } from '@/lib/types'

// SOLO STAGING y SOLO LECTURA: consulta la API de ML con la cuenta conectada, para
// investigar qué deja hacer (ventas, mensajes, calificaciones) antes de construirlo.
//   GET /api/ml/diagnostico?key=CRON_SECRET&empresa=1&cuenta=PIKEKE&ruta=/orders/search?...
// En producción responde 404. Rutas permitidas: solo lectura de ventas/mensajes/usuario.
const PERMITIDAS = [/^\/orders\//, /^\/orders\/search/, /^\/messages\//, /^\/users\/me/, /^\/users\/\d+$/,
  /^\/items\/[A-Z]{3}\d+/, /^\/packs\//, /^\/shipments\//, /^\/feedback\//]

export async function GET(req: NextRequest) {
  if (!ES_STAGING) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const url = new URL(req.url)
  if (!process.env.CRON_SECRET || url.searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const empresa = Number(url.searchParams.get('empresa'))
  const cuenta = url.searchParams.get('cuenta') ?? ''
  const ruta = url.searchParams.get('ruta') ?? ''
  if (!PERMITIDAS.some(r => r.test(ruta))) return NextResponse.json({ error: 'Ruta no permitida' }, { status: 400 })

  const db = dbEmpresa(empresa, (url.searchParams.get('pais') ?? 'VE') as Country)
  const { rows: [c] } = await db.query(`SELECT id FROM ml_conexiones WHERE nickname = $1 AND estado = 'activa'`, [cuenta])
  if (!c) return NextResponse.json({ error: 'Cuenta no conectada' }, { status: 404 })
  try {
    return NextResponse.json(await mlFetch(db, c.id, ruta))
  } catch (e) {
    const x = e as { status?: number; datos?: unknown; message?: string }
    return NextResponse.json({ error: x.message, status: x.status, datos: x.datos }, { status: 502 })
  }
}
