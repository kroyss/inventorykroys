import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  pedido: z.number().int().positive(),
  ok: z.boolean(),
  cuenta: z.string().trim().max(80).nullish(),
  vistas: z.number().int().min(0).default(0),     // órdenes pagadas de los últimos 7 días en el portal
  nuevas: z.number().int().min(0).default(0),     // subidas en esta pasada
  error: z.string().trim().max(300).nullish(),     // p. ej. "sin_sesion" = hay que iniciar sesión en ese perfil
  // 1.3.7 (19-11): órdenes del portal que NO se trajeron y por qué (sin pago ni guía todavía, sin número de venta).
  // Antes se saltaban en silencio y el portal mostraba más que el sistema. Se guardan en el pedido (la pantalla, después).
  saltadas: z.array(z.object({
    orden: z.string().max(60), venta: z.string().max(20).nullish(), motivo: z.string().max(40),
    estado: z.string().max(30).nullish(), fecha: z.string().max(40).nullish(),
  })).max(500).nullish(),
  // 1.3.9 (19-11): cómo leyó. 'completa' = los 7 días enteros; 'corta' = solo lo modificado desde la fecha de corte
  // que le dio el latido; 'parcial' = el portal estaba lento y se subió solo lo más reciente. La fecha de corte de la
  // próxima sale de las 'completa'/'corta' buenas (ver latido). Las versiones anteriores no lo mandan.
  modo: z.enum(['completa', 'corta', 'parcial']).nullish(),
  segundos: z.number().int().min(0).max(36000).nullish(),
})

/** POST /api/pagos-me/vigilante/fin → el perfil anota su resultado en el pedido. */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    // 12-11: si la traída pedía pesos, ¿llegaron? (la extensión los manda antes del fin; si no pudo leer el portal, no
    // avisa). pesos = true/false solo cuando se pidieron; null si no.
    await a.db.query(
      `UPDATE me_pedidos p SET resultados = p.resultados || jsonb_build_object($2::text,
         jsonb_build_object('ok', $3::boolean, 'cuenta', $4::text, 'vistas', $5::int, 'nuevas', $6::int,
                            'error', $7::text, 'at', NOW(),
                            'intentos', COALESCE((p.resultados->$2::text->>'intentos')::int, 0) + 1,
                            'saltadas', $8::jsonb, 'modo', $9::text, 'segundos', $10::int,
                            'pesos', CASE WHEN p.pesos AND $3::boolean THEN EXISTS (SELECT 1 FROM me_productos m
                                       WHERE m.cuenta = COALESCE($4::text, $2::text) AND m.actualizado_at >= p.pedido_at) END))
       , avance = p.avance - $2::text
       WHERE p.id = $1`,
      [b.pedido, a.perfil, b.ok, b.cuenta ?? null, b.vistas, b.nuevas, b.error ?? null,
       b.saltadas ? JSON.stringify(b.saltadas.slice(0, 500)) : null, b.modo ?? null, b.segundos ?? null])
    // Nombre de la cuenta de MercadoEnvíos (093): la pantalla lo muestra en vez del nombre técnico del perfil.
    if (b.cuenta) await a.db.query(
      `INSERT INTO me_latidos (perfil, cuenta, visto_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, perfil) DO UPDATE SET cuenta = EXCLUDED.cuenta, visto_at = NOW()`, [a.perfil, b.cuenta])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
