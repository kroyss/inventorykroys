import { after, NextRequest, NextResponse } from 'next/server'
import { conEmpresa, dbEmpresa, dbGlobal } from '@/lib/db'
import { revisarStockPendiente } from '@/lib/alertasStock'
import { sincronizarEmpresa } from '@/lib/preguntas'
import { mlConfigurado } from '@/lib/ml'
import type { Country } from '@/lib/types'

// Cron de preguntas (crontab del VPS, cada minuto, con CRON_SECRET):
//   curl -fsS "https://<dominio>/api/cron/preguntas?key=EL_SECRETO"
// Recorre las empresas con el módulo `preguntas` y trae lo nuevo de sus cuentas ML.
// Solo LEE de MercadoLibre (no publica nada). Cada empresa en su propia conexión (RLS).
function autorizado(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(req.url)
  return url.searchParams.get('key') === secret || req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!mlConfigurado()) return NextResponse.json({ omitido: 'ML sin configurar' })

  const { rows: empresas } = await dbGlobal().query(
    `SELECT id, country, 'alertas_stock' = ANY(modulos) AS stock FROM empresas WHERE is_active AND 'preguntas' = ANY(modulos) ORDER BY id`)
  const resultado: Record<number, unknown> = {}
  for (const e of empresas) {
    try {
      resultado[e.id] = await sincronizarEmpresa(dbEmpresa(e.id, e.country as Country))
    } catch (err) {
      resultado[e.id] = { error: err instanceof Error ? err.message : String(err) }
    }
  }
  // Alertas de stock: una cuenta por empresa y por pasada, si pasó la hora (lib/alertasStock.ts).
  // En segundo plano (después de responder) para no atrasar preguntas y mensajes.
  after(async () => {
    for (const e of empresas.filter(x => x.stock)) {
      try {
        await conEmpresa(e.id, e.country as Country, db => revisarStockPendiente(db))
      } catch (err) {
        console.error('[alertas stock]', e.id, err instanceof Error ? err.message : err)
      }
    }
  })
  return NextResponse.json({ ok: true, resultado })
}
