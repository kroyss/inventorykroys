import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { cambiarConCodigo, pedirCodigo } from '@/lib/recuperarClave'

// POST /api/recuperar-clave (13-11-2026, mig. 175) — público, sin sesión (pantalla /login/recuperar).
//   { paso: 'pedir', usuario }                    → manda el código y dice por dónde (tapado) o por qué no (ResultadoPedido)
//   { paso: 'cambiar', usuario, codigo, clave }   → cambia la clave y cierra sus sesiones
const Cuerpo = z.discriminatedUnion('paso', [
  z.object({ paso: z.literal('pedir'), usuario: z.string().trim().min(1, 'Escribe tu usuario o tu correo').max(120) }),
  z.object({ paso: z.literal('cambiar'), usuario: z.string().trim().min(1).max(120), codigo: z.string().trim().max(10), clave: z.string().max(200) }),
])

const ipHashDe = (req: NextRequest) => {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  return ip ? createHash('sha256').update(`${ip}|${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex').slice(0, 32) : null
}

export async function POST(req: NextRequest) {
  const r = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  try {
    const b = r.data
    if (b.paso === 'pedir') {
      return NextResponse.json(await pedirCodigo(b.usuario, ipHashDe(req)))
    }
    const error = await cambiarConCodigo(b.usuario, b.codigo, b.clave)
    return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
