import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, cuentaDePerfil } from '@/lib/pagosME'
import { chatsDuenoPlataforma } from '@/lib/registro'
import { enviarTelegram, esc } from '@/lib/telegram'

/** Vigía: ventas de ML de la ventana que deberían tener su aviso «nueva orden». Margen para que ML y el portal publiquen. */
const VIGIA_MARGEN_MIN = 20
const VIGIA_MIN_VENTAS = 3

const Body = z.object({
  cuenta: z.string().trim().max(80).nullish(),
  desde: z.string().max(40).nullish(),     // desde cuándo leyó los avisos (para el vigía)
  avisos: z.array(z.object({
    orden: z.string().regex(/^\d{6,20}$/),
    // pago = «Tienes un nuevo pago»; orden = «Tienes una nueva orden»; otro = cualquier otro aviso con una orden
    tipo: z.enum(['pago', 'orden', 'otro']),
    fecha: z.string().max(40).nullish(),
  })).max(2000),
})

/**
 * POST /api/pagos-me/vigilante/avisos (extensión 1.4.1, 20-11-2026) → lo que la extensión leyó en los avisos del portal
 * (la campanita de MercadoEnvíos) desde la traída anterior. Responde qué órdenes bajar por su número (`pedir`).
 *  · «nuevo pago» (y avisos desconocidos con una orden): se piden, salvo las que ya están completas (pago y guía).
 *  · «nueva orden»: todavía sin pago → quedan en SEGUIMIENTO (mig. 191); llegan cuando aparezca su aviso de pago
 *    (el vigía de abajo cuida que los avisos sigan llegando).
 * Leer los avisos no los marca como leídos en el portal: la campanita del vendedor queda igual. Y no dependemos de
 * «leído/no leído»: se leen por fecha de publicación.
 */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const { cuenta, avisos, desde } = Body.parse(await req.json())
    const cta = await cuentaDePerfil(a.db, a.perfil, cuenta ?? null)
    if (avisos.length) await a.db.query(
      `INSERT INTO me_avisos (cuenta, orden, tipo, publicado_at)
       SELECT $1, x.orden, x.tipo, CASE WHEN x.fecha ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN x.fecha::timestamptz END
       FROM jsonb_to_recordset($2::jsonb) AS x(orden text, tipo text, fecha text)
       ON CONFLICT (empresa_id, cuenta, orden, tipo) DO NOTHING`,
      [cta, JSON.stringify(avisos.map(x => ({ orden: x.orden, tipo: x.tipo, fecha: x.fecha ?? null })))])
    await a.db.query(`DELETE FROM me_avisos WHERE cuenta = $1 AND visto_at < NOW() - INTERVAL '10 days'`, [cta])

    // VIGÍA (20-11, el dueño): si MercadoLibre tiene ventas nuevas de esta cuenta en la ventana leída y el portal no
    // publicó NINGÚN aviso de ellas, los avisos dejaron de funcionar. Se marca el perfil (24 h con la lectura de la lista
    // de siempre), esta misma traída vuelve a la lista, y se avisa una vez al dueño de la plataforma por Telegram.
    // Solo «ninguna»: una cuenta que manda por MercadoEnvíos solo parte de sus ventas no dispara falsas alarmas.
    const t = desde ? Date.parse(desde) : NaN
    if (Number.isFinite(t)) {
      const { rows: [v] } = await a.db.query(
        `SELECT COUNT(*)::int AS ventas,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM me_avisos m WHERE m.cuenta = $2
                                 AND m.orden IN (o.id::text, COALESCE(o.pack_id::text, ''))))::int AS con_aviso
         FROM ml_ordenes o
         WHERE o.conexion_id = (SELECT conexion_id FROM me_latidos WHERE perfil = $1)
           AND o.fecha > $3::timestamptz + make_interval(mins => $4) AND o.fecha < NOW() - make_interval(mins => $4)`,
        [a.perfil, cta, new Date(t).toISOString(), VIGIA_MARGEN_MIN])
      if (v && v.ventas >= VIGIA_MIN_VENTAS && v.con_aviso === 0) {
        const { rows: [m] } = await a.db.query(
          `UPDATE me_latidos SET avisos_fallan_at = NOW() WHERE perfil = $1
           RETURNING (SELECT e.nombre FROM empresas e WHERE e.id = me_latidos.empresa_id) AS empresa`, [a.perfil])
        const html = `⚠️ <b>Pagos ME: los avisos del portal no llegan</b>
${esc(m?.empresa ?? '')} · ${esc(cta)}: ` +
          `${v.ventas} ventas de MercadoLibre sin ningún aviso en MercadoEnvíos. La extensión volvió a leer la lista ` +
          `(más lenta, no se pierde nada) por 24 h.`
        for (const chat of await chatsDuenoPlataforma().catch(() => [])) await enviarTelegram(chat, html).catch(() => {})
        return NextResponse.json({ pedir: [], avisos_fallan: true })
      }
    }
    if (!avisos.length) return NextResponse.json({ pedir: [] })
    const ids = [...new Set(avisos.map(x => x.orden))]
    const { rows } = await a.db.query(
      `SELECT venta FROM me_pagos WHERE venta = ANY($1::text[]) AND guia_path IS NOT NULL AND comprobante_path IS NOT NULL`, [ids])
    const completas = new Set(rows.map(r => r.venta as string))
    const pedir = [...new Set(avisos.filter(x => x.tipo !== 'orden' && !completas.has(x.orden)).map(x => x.orden))]
    const nuevas = avisos.filter(x => x.tipo === 'orden' && !completas.has(x.orden) && !pedir.includes(x.orden))
    if (nuevas.length) {
      await a.db.query(
        `INSERT INTO me_seguimiento (cuenta, orden, venta, fecha_orden, motivo)
         SELECT $1, x.orden, x.orden, CASE WHEN x.fecha ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN x.fecha::timestamptz END, 'nueva_orden'
         FROM jsonb_to_recordset($2::jsonb) AS x(orden text, fecha text)
         ON CONFLICT (empresa_id, cuenta, orden) DO NOTHING`,
        [cta, JSON.stringify(nuevas.map(x => ({ orden: x.orden, fecha: x.fecha ?? null })))])
    }
    return NextResponse.json({ pedir })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
