import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { ENTORNO, telegramConfigurado } from '@/lib/telegram'

// Plataforma → Avisos por Telegram: abrirlos a todas las empresas (al principio solo la organización
// de la plataforma) y ver cuántas personas los tienen conectados.
export async function GET() {
  const g = await soloDueno()
  if ('error' in g) return g.error
  try {
    const [{ rows: [a] }, { rows: [c] }] = await Promise.all([
      dbGlobal().query(`SELECT value FROM plataforma_ajustes WHERE key = 'avisos_telegram_abierto'`),
      dbGlobal().query(
        `SELECT COUNT(*) FILTER (WHERE ue_org = $2)::int AS propios, COUNT(*) FILTER (WHERE ue_org <> $2)::int AS clientes
         FROM (SELECT t.user_id, MIN(e.organizacion_id) AS ue_org FROM telegram_usuarios t
               JOIN usuario_empresas ue ON ue.user_id = t.user_id JOIN empresas e ON e.id = ue.empresa_id
               WHERE t.chat_id IS NOT NULL AND t.entorno = $1 GROUP BY t.user_id) x`, [ENTORNO, ORGANIZACION_PLATAFORMA]),
    ])
    return NextResponse.json({ configurado: telegramConfigurado(), abierto: a?.value === 'true', conectados: c })
  } catch (err) {
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const g = await soloDueno()
  if ('error' in g) return g.error
  const r = z.object({ abierto: z.boolean() }).safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.message }, { status: 400 })
  try {
    await dbGlobal().query(
      `INSERT INTO plataforma_ajustes (key, value) VALUES ('avisos_telegram_abierto', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(r.data.abierto)])
    return NextResponse.json({ ok: true, abierto: r.data.abierto })
  } catch (err) {
    return apiError(err)
  }
}
