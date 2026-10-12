import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { actualizarCatalogo } from '@/lib/catalogoML'
import { crearProductos, filasImportar, vincularCodigo } from '@/lib/importarML'

// Productos → Importar desde MercadoLibre (lib/importarML.ts). Permisos: ver Productos + "Importar
// productos desde MercadoLibre"; las publicaciones salen del catálogo de Preguntas (módulo preguntas).
async function sesion() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: unauthorized() } as const
  if (!puede(session.user, 'ver_productos') || !puede(session.user, 'importar_ml')) return { error: forbidden() } as const
  if (!tieneModulo(session.user, 'preguntas')) {
    return { error: NextResponse.json({ error: 'Conecta primero tus cuentas de MercadoLibre' }, { status: 400 }) } as const
  }
  return { session, db } as const
}

/** GET → publicaciones (y variantes) con su estado: vinculada / parecida / nueva. */
export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const filas = await filasImportar(s.db)
    const { rows: [c] } = await s.db.query(
      `SELECT MIN(catalogo_at) AS at, COUNT(*)::int AS cuentas FROM ml_conexiones WHERE estado = 'activa'`)
    return NextResponse.json({ filas, actualizado_at: c?.at ?? null, cuentas: c?.cuentas ?? 0, pais: s.session.user.country })
  } catch (err) {
    return apiError(err)
  }
}

const Codigo = z.string().regex(/^\d{5,15}(:\d{1,15})?$/, 'Código ML inválido')
const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('actualizar') }),
  z.object({ accion: z.literal('vincular'), codigo: Codigo, cuenta: z.string().min(1).max(50), product_id: z.number().int().positive() }),
  z.object({
    accion: z.literal('crear'),
    productos: z.array(z.object({
      codigo: Codigo, cuenta: z.string().min(1).max(50), nombre: z.string().trim().min(2).max(200),
      costo: z.number().nonnegative().max(1_000_000).nullable(), stock: z.number().int().min(0).max(1_000_000),
      precio: z.number().nonnegative().max(1_000_000_000).nullable(),
    })).min(1).max(200),
  }),
])

/** POST → actualizar (trae ya el catálogo de ML) · vincular (a un producto existente) · crear (productos nuevos). */
export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const body = Body.parse(await req.json())
    if (body.accion === 'actualizar') {
      const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
      const errores: string[] = []
      for (const c of cuentas) {
        try { await actualizarCatalogo(s.db, c.id, true) }
        catch (e) { errores.push(`${c.nickname}: ${e instanceof Error ? e.message : String(e)}`) }
      }
      return NextResponse.json({ ok: !errores.length, errores })
    }
    if (body.accion === 'vincular') {
      const { rows: [p] } = await s.db.query(`SELECT id FROM products WHERE id = $1 AND is_active`, [body.product_id])
      if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
      await vincularCodigo(s.db, body.product_id, body.cuenta, body.codigo)
      return NextResponse.json({ ok: true })
    }
    const db = await requestConnection(s.db)
    const creados = await crearProductos(db, body.productos, Number(s.session.user.id))
    return NextResponse.json({ ok: true, creados })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
