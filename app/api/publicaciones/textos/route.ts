import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { caracteresNoPermitidos } from '@/lib/descripcionTexto'
import { resepararLeidas } from '@/lib/lotesPublicaciones'

// Textos de descripción (encabezados y pies guardados, mig 152).
// GET → los textos con cuántas publicaciones los usan, las cuentas y cuántas descripciones se leyeron por cuenta.
export async function GET() {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  try {
    const [{ rows: textos }, { rows: cuentas }] = await Promise.all([
      s.db.query(
        `SELECT p.id::int, p.tipo, p.nombre, p.texto, p.conexion_id, k.nickname AS cuenta, p.actualizado_at,
                (SELECT COUNT(*)::int FROM ml_item_descripcion d WHERE d.encabezado_id = p.id OR d.pie_id = p.id OR d.condiciones_id = p.id) AS usos
         FROM ml_desc_plantillas p LEFT JOIN ml_conexiones k ON k.id = p.conexion_id ORDER BY p.tipo DESC, p.nombre`),
      s.db.query(
        `SELECT k.id, k.nickname,
                (SELECT COUNT(*)::int FROM ml_catalogo m WHERE m.conexion_id = k.id) AS publicaciones,
                (SELECT COUNT(*)::int FROM ml_item_descripcion d WHERE d.conexion_id = k.id AND d.texto_ml IS NOT NULL) AS leidas
         FROM ml_conexiones k WHERE k.estado = 'activa' ORDER BY k.nickname`),
    ])
    return NextResponse.json({ textos, cuentas })
  } catch (err) { return apiError(err) }
}

const Texto = z.object({
  tipo: z.enum(['encabezado', 'condiciones', 'pie']),
  nombre: z.string().trim().min(1).max(60),
  texto: z.string().trim().min(1).max(10000),
  conexion_id: z.number().int().nullable(),
})

// POST → crear. Después, las descripciones ya leídas que lo tienen tal cual quedan separadas solas (sin tocar ML).
export async function POST(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const p = Texto.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
  const malos = caracteresNoPermitidos(p.data.texto)
  if (malos.length) return NextResponse.json({ error: `Tiene caracteres que MercadoLibre no acepta: ${malos.join(' ')}` }, { status: 400 })
  try {
    const { rows: [t] } = await s.db.query(
      `INSERT INTO ml_desc_plantillas (tipo, nombre, texto, conexion_id) VALUES ($1, $2, $3, $4) RETURNING id::int`,
      [p.data.tipo, p.data.nombre, p.data.texto, p.data.conexion_id])
    const separadas = await resepararLeidas(s.db, p.data.conexion_id)
    return NextResponse.json({ id: t.id, separadas })
  } catch (err) { return apiError(err) }
}
