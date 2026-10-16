import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  cuenta: z.string().trim().min(1).max(80),
  completo: z.boolean(),                       // true = es la lista entera de publicaciones activas de la cuenta
  items: z.array(z.object({
    publicacion: z.string().regex(/^MLV\d{6,15}$/),
    titulo: z.string().max(300).nullish(),
    peso: z.number().min(0).max(100000).nullish(),
    estado: z.string().max(30).nullish(),
    agencias: z.array(z.string().max(40)).max(10).default([]),
  })).max(5000),
})

/**
 * POST /api/pagos-me/vigilante/productos → publicaciones del portal de MercadoEnvíos con su PESO (el que
 * manda para el envío gratis), para Promociones (migración 094). Las manda la extensión en la primera
 * traída del día o al pedir "Actualizar pesos". Con `completo`, lo que ya no vino de esa cuenta se borra.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  if (!a.modulos.includes('promociones')) return NextResponse.json({ ok: true, ignorado: true })
  try {
    const b = Body.parse(await req.json())
    const filas = b.items
    if (filas.length) {
      await a.db.query(
        `INSERT INTO me_productos (publicacion, cuenta, titulo, peso_kg, estado, agencias, actualizado_at)
         SELECT x.publicacion, $1, x.titulo, x.peso, x.estado, x.agencias, NOW()
         FROM jsonb_to_recordset($2::jsonb) AS x(publicacion text, titulo text, peso numeric, estado text, agencias text[])
         ON CONFLICT (empresa_id, publicacion) DO UPDATE SET
           cuenta = EXCLUDED.cuenta, titulo = EXCLUDED.titulo, peso_kg = EXCLUDED.peso_kg,
           estado = EXCLUDED.estado, agencias = EXCLUDED.agencias, actualizado_at = NOW()`,
        [b.cuenta, JSON.stringify(filas.map(f => ({ ...f, titulo: f.titulo ?? null, peso: f.peso ?? null, estado: f.estado ?? null })))])
    }
    if (b.completo) {
      await a.db.query(`DELETE FROM me_productos WHERE cuenta = $1 AND NOT (publicacion = ANY($2::text[]))`,
        [b.cuenta, filas.map(f => f.publicacion)])
    }
    return NextResponse.json({ ok: true, guardadas: filas.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
