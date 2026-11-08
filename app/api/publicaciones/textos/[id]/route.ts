import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { caracteresNoPermitidos } from '@/lib/descripcionTexto'
import { crearLote } from '@/lib/lotesPublicaciones'

const Cambio = z.object({
  nombre: z.string().trim().min(1).max(60),
  texto: z.string().trim().min(1).max(10000),
  conexion_id: z.number().int().nullable(),
  actualizarEnML: z.boolean(),        // mandar el texto nuevo a todas las publicaciones que lo usan
})

// PUT → editar un texto guardado y, si se pide, actualizarlo en ML en todas las publicaciones que lo usan (en lote).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  const p = Cambio.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  const malos = caracteresNoPermitidos(p.data.texto)
  if (malos.length) return NextResponse.json({ error: `Tiene caracteres que MercadoLibre no acepta: ${malos.join(' ')}` }, { status: 400 })
  try {
    const { rows: [t] } = await s.db.query(
      `UPDATE ml_desc_plantillas SET nombre = $2, texto = $3, conexion_id = $4, actualizado_at = NOW() WHERE id = $1 RETURNING tipo`,
      [id, p.data.nombre, p.data.texto, p.data.conexion_id])
    if (!t) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    let lote: number | null = null
    if (p.data.actualizarEnML) {
      const { rows } = await s.db.query(
        `SELECT item_id FROM ml_item_descripcion WHERE ${t.tipo === 'pie' ? 'pie_id' : 'encabezado_id'} = $1`, [id])
      if (rows.length) {
        lote = await crearLote(s.db, 'descripcion', `${t.tipo === 'pie' ? 'Pie' : 'Encabezado'} «${p.data.nombre}» actualizado en ${rows.length} publicaciones`,
          { parte: t.tipo, plantillaId: id, noReconocida: 'agregar' }, rows.map(r => ({ item: r.item_id })), Number(s.session.user.id) || null)
      }
    }
    return NextResponse.json({ ok: true, lote })
  } catch (err) { return apiError(err) }
}

// DELETE → borrar el texto guardado. En ML no cambia nada: las publicaciones lo siguen teniendo, solo deja de estar
// separado (vuelve a ser parte de la descripción del producto).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  try {
    await s.db.query(
      `UPDATE ml_item_descripcion SET cuerpo = NULL WHERE encabezado_id = $1 OR pie_id = $1`, [id])
    await s.db.query(`DELETE FROM ml_desc_plantillas WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
