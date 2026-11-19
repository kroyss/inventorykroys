import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  cuenta: z.string().trim().max(80).nullish(),
  // Todas las órdenes de la ventana de días que leyó (también las incompletas): con nota se guarda; sin nota, si
  // teníamos una (el vendedor la borró en el portal), se borra.
  ordenes: z.array(z.object({
    orden: z.string().trim().min(1).max(60),
    venta: z.string().regex(/^\d{6,20}$/).nullish(),
    nota: z.string().max(1000).nullish(),
  })).max(3000),
})

/**
 * POST /api/pagos-me/vigilante/notas (extensión 1.3.7, migración 188) → notas que el vendedor escribe en el portal
 * de MercadoEnvíos. Por ahora solo se guardan (la pantalla «📝 Nota · ME» va después).
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    const con = b.ordenes.map(o => ({ ...o, nota: o.nota?.trim() || null })).filter(o => o.nota)
    const sin = b.ordenes.filter(o => !o.nota?.trim()).map(o => o.orden)
    if (con.length) await a.db.query(
      `INSERT INTO me_notas (orden_me, venta, cuenta, nota, visto_at, cambiada_at)
       SELECT x.orden, x.venta, $1, x.nota, NOW(), NOW()
       FROM jsonb_to_recordset($2::jsonb) AS x(orden text, venta text, nota text)
       ON CONFLICT (empresa_id, orden_me) DO UPDATE SET
         venta = COALESCE(EXCLUDED.venta, me_notas.venta), cuenta = EXCLUDED.cuenta, visto_at = NOW(),
         cambiada_at = CASE WHEN me_notas.nota IS DISTINCT FROM EXCLUDED.nota THEN NOW() ELSE me_notas.cambiada_at END,
         nota = EXCLUDED.nota`,
      [b.cuenta ?? a.perfil, JSON.stringify(con.map(o => ({ orden: o.orden, venta: o.venta ?? null, nota: o.nota!.slice(0, 1000) })))])
    if (sin.length) await a.db.query(`DELETE FROM me_notas WHERE orden_me = ANY($1::text[])`, [sin])
    return NextResponse.json({ ok: true, guardadas: con.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
