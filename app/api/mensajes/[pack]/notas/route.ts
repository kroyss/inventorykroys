import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML } from '@/lib/ml'
import { borrarNota, conexionDeVenta, copiarNotas, crearNota, editarNota, LARGO_NOTA, leerNotas, unirNotas, type NotaML } from '@/lib/notasML'

// Notas de la venta en MercadoLibre, desde la conversación de Mensajes:
//   GET    → las notas (y se actualiza la copia de la bandeja)
//   POST   { texto }                 → nota nueva
//   PUT    { id, fuente, texto }     → cambia una nota
//   DELETE { id, fuente }            → la borra
// Las notas son internas del vendedor: el comprador no las ve.
type Ctx = { params: Promise<{ pack: string }> }

async function contexto(ctx: Ctx) {
  const s = await sesionPreguntas()
  if ('error' in s) return { error: s.error }
  const { pack } = await ctx.params
  if (!/^\d+$/.test(pack)) return { error: NextResponse.json({ error: 'Venta inválida' }, { status: 400 }) }
  const { rows: [c] } = await s.db.query(`SELECT conexion_id FROM ml_conversaciones WHERE pack_id = $1`, [pack])
  // Sin conversación (Ventas → Por confirmar de alguien que nunca escribió): la cuenta de la venta.
  const conexionId = (c?.conexion_id as number | undefined) ?? await conexionDeVenta(s.db, pack)
  if (!conexionId) return { error: NextResponse.json({ error: 'Venta no encontrada en tus cuentas de MercadoLibre' }, { status: 404 }) }
  return { db: s.db, pack, conexionId }
}

// Después de escribir, ML a veces tarda unos segundos en mostrar el cambio (20-10: "no sé si quedó, toca F5").
// Se vuelve a leer hasta que aparezca; si aun así no, se devuelve con el cambio aplicado y `pendiente` (la pantalla
// lo muestra "guardando en ML…" y se relee sola).
type Esperado = { accion: 'crear'; texto: string } | { accion: 'editar'; id: string; texto: string } | { accion: 'borrar'; id: string }
const listo = (notas: NotaML[], e: Esperado) =>
  e.accion === 'crear' ? notas.some(n => n.texto.trim() === e.texto.trim())
  : e.accion === 'editar' ? notas.some(n => n.id === e.id && n.texto.trim() === e.texto.trim())
  : !notas.some(n => n.id === e.id)
const aplicar = (notas: NotaML[], e: Esperado): NotaML[] =>
  e.accion === 'crear' ? [...notas, { id: 'pendiente', texto: e.texto, fecha: new Date().toISOString(), fuente: 'orden' }]
  : e.accion === 'editar' ? notas.map(n => n.id === e.id ? { ...n, texto: e.texto } : n)
  : notas.filter(n => n.id !== e.id)

async function responder(db: import('pg').Pool, conexionId: number, pack: string, escribio = false, esperado?: Esperado) {
  let r: { notas: NotaML[]; error: string | null; pendiente?: boolean } = await leerNotas(db, conexionId, pack)
  for (let i = 0; esperado && i < 3 && !listo(r.notas, esperado); i++) {
    await new Promise(ok => setTimeout(ok, 1500))
    r = await leerNotas(db, conexionId, pack)
  }
  if (esperado && !listo(r.notas, esperado)) r = { ...r, notas: aplicar(r.notas, esperado), error: null, pendiente: true }
  await copiarNotas(db, pack, r.notas)
  // Si la venta ya está cargada en el sistema, su nota queda igual a la de ML (la ve Despachos).
  if (escribio && !r.error) await db.query(`UPDATE sales SET notes = $2, updated_at = NOW() WHERE ml_order_number = $1`, [pack, unirNotas(r.notas)])
  return NextResponse.json(r)
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const c = await contexto(ctx)
    if ('error' in c) return c.error
    return await responder(c.db, c.conexionId, c.pack)
  } catch (err) {
    return apiError(err)
  }
}

const Texto = z.string().trim().min(1, 'La nota está vacía').max(LARGO_NOTA, `Máximo ${LARGO_NOTA} caracteres`)
const Ref = { id: z.string().min(1), fuente: z.enum(['orden', 'pack']) }

async function escribir(req: NextRequest, ctx: Ctx, accion: 'crear' | 'editar' | 'borrar') {
  try {
    const c = await contexto(ctx)
    if ('error' in c) return c.error
    const raw = await req.json().catch(() => ({}))
    let esperado: Esperado
    try {
      if (accion === 'crear') {
        const { texto } = z.object({ texto: Texto }).parse(raw)
        await crearNota(c.db, c.conexionId, c.pack, texto)
        esperado = { accion, texto: texto.slice(0, LARGO_NOTA) }
      } else if (accion === 'editar') {
        const { id, fuente, texto } = z.object({ ...Ref, texto: Texto }).parse(raw)
        await editarNota(c.db, c.conexionId, c.pack, { id, fuente }, texto)
        esperado = { accion, id, texto: texto.slice(0, LARGO_NOTA) }
      } else {
        const { id, fuente } = z.object(Ref).parse(raw)
        await borrarNota(c.db, c.conexionId, c.pack, { id, fuente })
        esperado = { accion, id }
      }
    } catch (e) {
      if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? e.message }, { status: 400 })
      if (e instanceof ErrorML) return NextResponse.json({ error: e.message, detalle: e.datos }, { status: 502 })
      throw e
    }
    return await responder(c.db, c.conexionId, c.pack, true, esperado)
  } catch (err) {
    return apiError(err)
  }
}

export const POST   = (req: NextRequest, ctx: Ctx) => escribir(req, ctx, 'crear')
export const PUT    = (req: NextRequest, ctx: Ctx) => escribir(req, ctx, 'editar')
export const DELETE = (req: NextRequest, ctx: Ctx) => escribir(req, ctx, 'borrar')
