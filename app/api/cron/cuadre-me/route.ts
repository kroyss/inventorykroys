import { NextRequest, NextResponse } from 'next/server'
import { cuadrePagosME } from '@/lib/cuadrePagosME'

// Cuadre de Pagos ME a mano (20-11): el diario corre solo desde el cron de preguntas a las 21 h de Venezuela.
//   curl "http://127.0.0.1:8504/api/cron/cuadre-me?key=…[&empresa=1][&avisar=0]"
// avisar=0: no manda Telegram (igual anota en seguimiento lo que encuentre, para que la próxima traída lo pida).
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  if (!process.env.CRON_SECRET || q.get('key') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresa = q.get('empresa') ? Number(q.get('empresa')) : undefined
  const cuentas = await cuadrePagosME({ avisar: q.get('avisar') !== '0', empresa })
  return NextResponse.json({ ok: true, cuentas })
}
