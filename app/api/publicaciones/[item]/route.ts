import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { ErrorML } from '@/lib/ml'
import { guardarPublicacion, leerPublicacion } from '@/lib/publicacionesML'

const ITEM = /^M[A-Z]{2}\d{6,15}$/

// GET → la publicación tal como está AHORA en MercadoLibre (ficha completa para editar).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ item: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const { item } = await params
  if (!ITEM.test(item)) return NextResponse.json({ error: 'Publicación no válida' }, { status: 400 })
  try {
    const p = await leerPublicacion(s.db, item, s.session.user.country)
    if (!p) return NextResponse.json({ error: 'Esa publicación no es de tus cuentas conectadas (o la cuenta está desconectada)' }, { status: 404 })
    return NextResponse.json(p)
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: err.message }, { status: 502 })
    return apiError(err)
  }
}

const texto = (max: number) => z.string().max(max)
const Cambios = z.object({
  titulo: texto(60).min(1).optional(),
  precio: z.number().positive().max(1e10).optional(),
  stock: z.number().int().min(0).max(99999).optional(),
  estado: z.enum(['active', 'paused']).optional(),
  descripcion: texto(50000).optional(),
  atributos: z.array(z.object({ id: texto(80), value_id: texto(80).nullable().optional(), value_name: texto(255).nullable().optional() })).max(200).optional(),
  fotos: z.array(texto(80)).max(12).optional(),
  variantes: z.array(z.object({
    id: z.number().int(),
    stock: z.number().int().min(0).max(99999).optional(),
    combinaciones: z.array(z.object({ id: texto(80).nullable(), nombre: texto(80), valor: texto(80).min(1) })).max(5).optional(),
    fotos: z.array(texto(80)).max(12).optional(),
  })).max(250).optional(),
}).strict()

// PUT → manda a MercadoLibre solo lo que cambió (lib/publicacionesML.ts) y lo anota en el historial.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ item: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const { item } = await params
  if (!ITEM.test(item)) return NextResponse.json({ error: 'Publicación no válida' }, { status: 400 })
  const parsed = Cambios.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  try {
    const r = await guardarPublicacion(s.db, item, parsed.data, Number(s.session.user.id) || null)
    return NextResponse.json(r, { status: r.ok ? 200 : 422 })
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: err.message }, { status: 502 })
    return apiError(err)
  }
}
