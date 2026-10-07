import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { OrigenRespuesta, registrarOrigen } from '@/lib/respuestasOrigen'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML } from '@/lib/ml'
import { itemsDeVenta, leerHilo, responderHilo, subirAdjunto } from '@/lib/mensajesML'
import { preguntasDeComprador } from '@/lib/preguntasComprador'
import { problemasDelTexto } from '@/lib/preguntasTexto'

async function conversacion(db: import('pg').Pool, pack: string) {
  const { rows: [c] } = await db.query(
    `SELECT c.conexion_id, x.ml_user_id, x.nickname FROM ml_conversaciones c JOIN ml_conexiones x ON x.id = c.conexion_id
     WHERE c.pack_id = $1`, [pack])
  return c as { conexion_id: number; ml_user_id: string; nickname: string } | undefined
}

// GET  /api/mensajes/[pack]            → la conversación completa (no la marca como leída)
// GET  /api/mensajes/[pack]?leida=1    → y la marca como leída en ML
// POST /api/mensajes/[pack] { texto, dejarSinLeer? } → responde (y queda leída, salvo dejarSinLeer)
export async function GET(req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    const c = await conversacion(s.db, pack)
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    const marcar = new URL(req.url).searchParams.get('leida') === '1'
    const [h, venta] = await Promise.all([
      leerHilo(s.db, c.conexion_id, pack, Number(c.ml_user_id), marcar),
      itemsDeVenta(s.db, c.conexion_id, pack).catch(() => null),   // para el link a cada publicación
    ])
    if (marcar) await s.db.query(`UPDATE ml_conversaciones SET sin_leer = 0, actualizada_at = NOW() WHERE pack_id = $1`, [pack])
    // Lo que este comprador preguntó antes (de lo ya sincronizado en Preguntas).
    const preguntas = venta?.comprador.id ? await preguntasDeComprador(s.db, venta.comprador.id).catch(() => []) : []
    // Guía impresa de esta venta (Despachos): para {guia} y {transportista} de las respuestas rápidas.
    const { rows: [envio] } = await s.db.query(
      `SELECT e.carrier, COALESCE(e.guia_final, e.guia) AS guia
       FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
       WHERE e.venta = $1 AND e.impresa AND l.status = 'GENERADO' ORDER BY e.id DESC LIMIT 1`, [pack])
    return NextResponse.json({ cuenta: c.nickname, ...h, items: venta?.items ?? null, comprador: venta?.comprador ?? null, preguntas,
      envio: envio ? { guia: envio.guia as string | null, transportista: envio.carrier as string | null } : null })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ texto: z.string().trim().min(1, 'Escribe un mensaje').max(350), dejarSinLeer: z.boolean().optional() })
  .merge(OrigenRespuesta)
const MAX_MB = 15
const EXT_OK = /\.(jpe?g|png|pdf|txt)$/i

// POST: JSON { texto } o multipart (texto + `archivo` repetido, hasta 5) para mandar fotos/PDF.
export async function POST(req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    let raw: unknown, archivos: File[] = []
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await req.formData()
      raw = { texto: form.get('texto') ?? '', fuente: form.get('fuente') ?? undefined, base: form.get('base') ?? undefined }
      archivos = form.getAll('archivo').filter((f): f is File => f instanceof File && f.size > 0)
    } else raw = await req.json()
    const { texto, dejarSinLeer, fuente, base } = Body.parse(raw)
    if (archivos.length > 5) return NextResponse.json({ error: 'Máximo 5 archivos por mensaje' }, { status: 400 })
    for (const f of archivos) {
      if (!EXT_OK.test(f.name)) return NextResponse.json({ error: `"${f.name}": solo fotos JPG/PNG, PDF o TXT` }, { status: 400 })
      if (f.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `"${f.name}" pesa más de ${MAX_MB} MB` }, { status: 400 })
    }
    const problemas = problemasDelTexto(texto, 'mensaje')
    if (problemas.length) return NextResponse.json({ error: 'MercadoLibre rechazaría este mensaje', problemas }, { status: 422 })
    const c = await conversacion(s.db, pack)
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    try {
      const ids: string[] = []
      for (const f of archivos) ids.push(await subirAdjunto(s.db, c.conexion_id, f))
      const h = await responderHilo(s.db, c.conexion_id, pack, texto, dejarSinLeer, ids)
      await registrarOrigen(s.db, { modulo: 'mensajes', ref: pack, fuente, base, texto, usuarioId: s.session.user.id })
      return NextResponse.json({ cuenta: c.nickname, ...h })
    } catch (e) {
      if (e instanceof ErrorML) return NextResponse.json({ error: e.message, detalle: e.datos }, { status: 502 })
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
