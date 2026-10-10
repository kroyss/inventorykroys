import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// "Datos del producto" (ml_item_notas): lo que el vendedor anota de una publicación para que la IA
// lo use en las próximas preguntas (lib/preguntas.ts los lee). Se ven, editan y borran desde la
// pregunta ("N datos guardados") y desde Preguntas → Configuración (todos, por publicación).
const Texto = z.string().trim().min(3).max(500)
const Nuevo = z.object({ item_id: z.string().regex(/^[A-Z]{3}\d+$/), texto: Texto })
const Cambio = z.object({ id: z.number().int().positive(), texto: Texto })

// GET /api/preguntas/notas?item_id=MLV… → los datos de esa publicación
// GET /api/preguntas/notas?todas=1      → todos, con título/foto/link/estado de su publicación
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const sp = new URL(req.url).searchParams
  try {
    if (sp.get('todas')) {
      const { rows } = await s.db.query(
        `SELECT n.id, n.item_id, n.texto, n.created_at, u.full_name AS por,
                COALESCE(q.item_titulo, c.titulo) AS titulo, COALESCE(q.item_permalink, c.permalink) AS link,
                q.item_imagen AS imagen, COALESCE(c.estado, q.item_estado) AS estado
         FROM ml_item_notas n
         LEFT JOIN users u ON u.id = n.creada_por
         LEFT JOIN LATERAL (
           SELECT item_titulo, item_permalink, item_imagen, item_estado FROM ml_preguntas
           WHERE item_id = n.item_id ORDER BY (item_imagen IS NOT NULL) DESC, fecha DESC LIMIT 1
         ) q ON TRUE
         LEFT JOIN ml_catalogo c ON c.item_id = n.item_id
         ORDER BY n.item_id, n.created_at DESC`)
      return NextResponse.json(rows)
    }
    const { rows } = await s.db.query(
      `SELECT n.id, n.texto, n.created_at, u.full_name AS por
       FROM ml_item_notas n LEFT JOIN users u ON u.id = n.creada_por
       WHERE n.item_id = $1 ORDER BY n.created_at DESC`, [sp.get('item_id') ?? ''])
    return NextResponse.json(rows)
  } catch (err) { return apiError(err) }
}

// POST /api/preguntas/notas { item_id, texto } → la IA los usa en las próximas preguntas
export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Nuevo.parse(await req.json())
    const { rows: [n] } = await s.db.query(
      `INSERT INTO ml_item_notas (item_id, texto, creada_por) VALUES ($1, $2, $3) RETURNING id`,
      [b.item_id, b.texto, Number(s.session.user.id)])
    return NextResponse.json({ ok: true, id: n.id })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

// PUT /api/preguntas/notas { id, texto } → corregir un dato (p. ej. cambió el modelo o el precio)
export async function PUT(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Cambio.parse(await req.json())
    const r = await s.db.query(`UPDATE ml_item_notas SET texto = $2 WHERE id = $1`, [b.id, b.texto])
    if (!r.rowCount) return NextResponse.json({ error: 'El dato ya no existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

// DELETE /api/preguntas/notas?id=N → la IA deja de usarlo
export async function DELETE(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Dato inválido' }, { status: 400 })
  try {
    await s.db.query(`DELETE FROM ml_item_notas WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
