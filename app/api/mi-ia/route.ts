import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { leerMiIA, MI_IA_KEY, textoMiIA, datoDeContacto } from '@/lib/miIA'

// Mi IA (06-11, lib/miIA.ts): el cuestionario de reglas del negocio para la IA de Preguntas y Mensajes.
// GET → lo guardado (o null), el país y cuántas cuentas de ML tiene. PUT → guarda todo el cuestionario.
async function sesion() {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'mi_ia')) return { error: NextResponse.json({ error: 'Tu empresa no tiene Mi IA' }, { status: 403 }) } as const
  return s
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const { rows: [c] } = await s.db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
    const { rows: [n] } = await s.db.query(`SELECT COUNT(*)::int AS n FROM ml_conexiones WHERE estado = 'activa'`)
    const miIA = leerMiIA(c?.value)
    return NextResponse.json({
      miIA, pais: s.session.user.country, cuentas: n?.n ?? 0,
      texto: miIA ? { preguntas: textoMiIA(miIA, 'preguntas'), mensajes: textoMiIA(miIA, 'mensajes') } : null,
    })
  } catch (err) { return apiError(err) }
}

const txt = (max = 300) => z.string().trim().max(max).optional()
const Esquema = z.object({
  version: z.literal(1),
  tono: z.object({ saludo: txt(60), despedida: txt(60), trato: z.enum(['tu', 'usted']).optional() }).optional(),
  oferta: z.object({ texto: txt(300), cuando: z.enum(['siempre', 'primera', 'precio']).optional() }).optional(),
  pago: z.object({
    tasa: txt(80), medios: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    divisas: z.object({ pct: z.number().min(0).max(90), medios: z.array(z.string().trim().max(40)).max(12).optional() }).nullable().optional(),
  }).optional(),
  envio: z.object({
    agencias: z.array(z.object({ nombre: z.string().trim().min(1).max(40), gratis: z.boolean() })).max(12).optional(),
    minimo: z.object({ precioMenor: z.number().positive().max(1000), unidades: z.number().int().min(2).max(50) }).nullable().optional(),
  }).optional(),
  despacho: z.object({ dias: txt(80), corte: z.string().regex(/^\d{1,2}:\d{2}( ?[ap]m)?$/i).nullable().optional(), sabados: z.boolean().optional() }).optional(),
  ubicacion: z.object({ zona: txt(80), decir: z.boolean().optional(), retiro: z.enum(['no', 'acuerdo', 'horario']).optional(), retiroHorario: txt(80) }).optional(),
  factura: z.object({ tipo: z.enum(['fiscal', 'nota', 'no']).optional(), garantiaDias: z.number().int().min(0).max(3650).nullable().optional(), garantiaNoCubre: txt(150) }).optional(),
  desconocido: z.array(z.enum(['verificar', 'preguntar', 'recomendar', 'persona'])).max(4).optional(),
  persona: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  postventa: z.object({ pasos: z.array(z.string().trim().min(1).max(80)).max(6).optional(), datosPago: txt(400) }).optional(),
})

export async function PUT(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const p = Esquema.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    const c = p.data
    // MercadoLibre borra o sanciona teléfonos, correos y links: no se dejan en lo que la IA repite siempre.
    for (const [campo, v] of [['La oferta fija', c.oferta?.texto], ['El saludo', c.tono?.saludo], ['La despedida', c.tono?.despedida]] as const) {
      if (datoDeContacto(v)) return NextResponse.json({ error: `${campo} tiene un teléfono, correo o link: MercadoLibre borra o sanciona esas respuestas.` }, { status: 400 })
    }
    const valor = JSON.stringify({ ...c, actualizado: new Date().toISOString() })
    await s.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (empresa_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [MI_IA_KEY, valor])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
