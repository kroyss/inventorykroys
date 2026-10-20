import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { desvincular, filasVincular, productosParaVincular, vincular } from '@/lib/vincularML'

// Vincular publicaciones de ML (20-10, migración 109; lib/vincularML.ts). Permiso "vincular_ml" (empleados, sin ver
// Productos). Precios solo para quien tiene "costos". Resolver dudas como "ignorada": quien ve Productos (el dueño).
//   GET  → filas (publicación/variante) + productos para elegir + avance
//   POST { accion: 'vincular', codigo, cuenta, product_id } · { accion: 'desvincular', codigo, product_id }
//        { accion: 'duda', codigo, cuenta, titulo, variante, nota } · { accion: 'ignorar', id }
async function sesion() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (!puede(session.user, 'vincular_ml') || !tieneModulo(session.user, 'inventario')) return { error: forbidden() } as const
  if (!tieneModulo(session.user, 'preguntas')) {
    return { error: NextResponse.json({ error: 'Primero hay que conectar las cuentas de MercadoLibre' }, { status: 400 }) } as const
  }
  return { session, db } as const
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const userId = Number(s.session.user.id)
    const [filas, productos, { rows: [hoy] }, { rows: [c] }] = await Promise.all([
      filasVincular(s.db, puede(s.session.user, 'costos'), userId),
      productosParaVincular(s.db),
      s.db.query(
        `SELECT COUNT(*)::int AS todos, COUNT(*) FILTER (WHERE vinculado_por = $1)::int AS mios
         FROM product_ml_codes WHERE is_active AND vinculado_at::date = CURRENT_DATE`, [userId]),
      s.db.query(`SELECT MIN(catalogo_at) AS at FROM ml_conexiones WHERE estado = 'activa'`),
    ])
    return NextResponse.json({
      filas, productos, hoy, actualizado_at: c?.at ?? null,
      esDueno: puede(s.session.user, 'ver_productos'),
    })
  } catch (err) {
    return apiError(err)
  }
}

const Codigo = z.string().regex(/^\d{5,15}(:\d{1,15})?$/, 'Código ML inválido')
const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('vincular'), codigo: Codigo, cuenta: z.string().min(1).max(50), product_id: z.number().int().positive() }),
  z.object({ accion: z.literal('desvincular'), codigo: Codigo, product_id: z.number().int().positive() }),
  z.object({ accion: z.literal('duda'), codigo: Codigo, cuenta: z.string().max(50).optional(), titulo: z.string().max(300).optional(),
             variante: z.string().max(200).nullable().optional(), nota: z.string().trim().min(2, 'Escribe la duda (corto)').max(300) }),
  z.object({ accion: z.literal('ignorar'), id: z.number().int().positive() }),
])

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const userId = Number(s.session.user.id)
    if (b.accion === 'vincular') {
      const { rows: [p] } = await s.db.query(`SELECT id FROM products WHERE id = $1 AND is_active`, [b.product_id])
      if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
      await vincular(s.db, b.product_id, b.cuenta, b.codigo, userId)
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'desvincular') {
      const n = await desvincular(s.db, b.product_id, b.codigo, userId, !puede(s.session.user, 'ver_productos'))
      if (!n) return NextResponse.json({ error: 'Solo puedes deshacer lo que vinculaste tú (o ese vínculo ya no estaba)' }, { status: 409 })
      return NextResponse.json({ ok: true })
    }
    if (b.accion === 'duda') {
      await s.db.query(
        `INSERT INTO ml_vinculo_dudas (codigo, cuenta, titulo, variante, nota, por) VALUES ($1, $2, $3, $4, $5, $6)`,
        [b.codigo, b.cuenta ?? null, b.titulo ?? null, b.variante ?? null, b.nota, userId])
      return NextResponse.json({ ok: true })
    }
    // Ignorar una duda (no se vincula): solo el dueño.
    if (!puede(s.session.user, 'ver_productos')) return forbidden()
    await s.db.query(`UPDATE ml_vinculo_dudas SET resuelta_at = NOW(), resuelta_por = $2, resolucion = 'ignorada' WHERE id = $1 AND resuelta_at IS NULL`,
      [b.id, userId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
