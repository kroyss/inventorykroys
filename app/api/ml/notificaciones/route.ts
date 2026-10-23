import { NextRequest, NextResponse } from 'next/server'
import { dbGlobal } from '@/lib/db'

// Notificaciones de MercadoLibre (DevCenter → "Notificaciones callbacks URL"). ML exige un 200 rápido o reintenta.
// Paso 1 (23-10, mig 119): se GUARDAN tal como llegan para compararlas con la consulta de cada minuto (cobertura y
// demora por tema) antes de confiar en ellas. Todavía no disparan nada: las preguntas, mensajes y ventas siguen
// entrando por el cron. Nunca falla hacia ML (si no se pudo guardar, igual responde 200).
export async function POST(req: NextRequest) {
  try {
    const n = await req.json().catch(() => null) as {
      topic?: string; resource?: string; user_id?: number | string; application_id?: number | string; attempts?: number; sent?: string
    } | null
    if (n && typeof n === 'object') {
      const app = process.env.ML_CLIENT_ID
      await dbGlobal().query(
        `INSERT INTO ml_notificaciones (topic, resource, user_id, application_id, attempts, sent, nuestra)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [String(n.topic ?? '').slice(0, 60) || null, String(n.resource ?? '').slice(0, 200) || null,
         /^\d+$/.test(String(n.user_id ?? '')) ? String(n.user_id) : null,
         /^\d+$/.test(String(n.application_id ?? '')) ? String(n.application_id) : null,
         Number.isFinite(Number(n.attempts)) ? Number(n.attempts) : null,
         n.sent && !Number.isNaN(Date.parse(n.sent)) ? n.sent : null,
         !app || String(n.application_id ?? '') === app])
    }
  } catch (e) {
    console.error('[ml notificaciones]', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true })
}
