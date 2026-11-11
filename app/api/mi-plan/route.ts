import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { forbidden, unauthorized } from '@/lib/session'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { ErrorCobro, MAX_MB_COMPROBANTE, TIPOS_COMPROBANTE, reportarCobro, situacionPlan, verificarAcceso } from '@/lib/cobros'

// Mi plan (02-11-2026, migración 141): lo que paga según sus ventas, los datos de pago y "Ya pagué".
//   GET  → situación (estado, ventas y escalón, opciones, datos de cobro, último pago y anteriores)
//   POST (multipart: tipo, plan, ciclo, metodo, referencia, fecha_pago, archivo) → reporta el pago
//     tipo (06-11, mig. 143): plan (elegir/renovar) · radar_pro (1 mes aparte) · upgrade (plan = el nuevo)
//          · recarga (09-11, mig. 157: paquete = índice en RECARGAS_IA) · radar_mes (09-11, mig. 159: solo Radar, 1 mes)
// Quién: el admin de una organización cliente con sesión, o con el acceso firmado de /renovar (cuenta vencida,
// header x-renovar). Nunca la organización propietaria (no paga plan).
async function quien(req: NextRequest) {
  const firmado = verificarAcceso(req.headers.get('x-renovar'))
  if (firmado) return { orgId: firmado.orgId, userId: firmado.userId, lectura: false }
  const session = await getServerSession(authOptions)
  if (!session?.user?.organizacionId) return { error: unauthorized() }
  if (session.user.role !== 'admin' || session.user.organizacionId === ORGANIZACION_PLATAFORMA) return { error: forbidden() }
  return { orgId: session.user.organizacionId, userId: Number(session.user.id), lectura: !!(session.user.verComo || session.user.soporte) }
}

export async function GET(req: NextRequest) {
  const q = await quien(req)
  if ('error' in q) return q.error
  try {
    return NextResponse.json(await situacionPlan(q.orgId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}

const Reporte = z.object({
  tipo: z.enum(['plan', 'radar_pro', 'upgrade', 'recarga', 'radar_mes']).catch('plan'),
  paquete: z.coerce.number().int().min(0).max(9).optional(),
  radar_pro: z.string().optional(),   // '1' = Radar PRO junto con el plan (12-11)
  plan: z.enum(['esencial', 'automatizaciones', 'completo']),
  ciclo: z.enum(['mensual', 'trimestral']),
  metodo: z.enum(['pago_movil', 'binance']),
  referencia: z.string().trim().min(3, 'Escribe la referencia del pago').max(80),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
})

export async function POST(req: NextRequest) {
  const q = await quien(req)
  if ('error' in q) return q.error
  if (q.lectura) return NextResponse.json({ error: 'Estás viendo como otra persona: el pago lo reporta el cliente.' }, { status: 403 })
  try {
    const f = await req.formData()
    const b = Reporte.parse(Object.fromEntries(['tipo', 'plan', 'ciclo', 'metodo', 'referencia', 'fecha_pago', 'paquete', 'radar_pro'].map(k => [k, f.get(k) == null ? undefined : String(f.get(k))])))
    const a = f.get('archivo')
    const archivo = a && typeof a !== 'string' && a.size > 0 ? a : null
    if (!archivo) return NextResponse.json({ error: 'Adjunta la captura del pago' }, { status: 400 })
    if (!TIPOS_COMPROBANTE[archivo.type]) return NextResponse.json({ error: 'La captura debe ser una imagen (PNG, JPG) o un PDF' }, { status: 400 })
    if (archivo.size > MAX_MB_COMPROBANTE * 1024 * 1024) return NextResponse.json({ error: `La captura pesa más de ${MAX_MB_COMPROBANTE} MB` }, { status: 400 })
    const id = await reportarCobro(q.orgId, q.userId, {
      tipo: b.tipo, plan: b.plan, ciclo: b.ciclo, metodo: b.metodo, paquete: b.paquete, radarPro: b.radar_pro === '1', referencia: b.referencia, fechaPago: b.fecha_pago,
      archivo: { tipo: archivo.type, datos: Buffer.from(await archivo.arrayBuffer()) },
    })
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    if (err instanceof ErrorCobro) return NextResponse.json({ error: err.message }, { status: 400 })
    // Doble clic: el índice único de "uno en revisión por organización".
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ya tienes un pago en revisión.' }, { status: 400 })
    return apiError(err)
  }
}
