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
    // ?buscar=texto (12-11, el dueño): publicaciones de todas las cuentas (activas y pausadas, ml_catalogo) por título o
    // código, para anotarles datos ANTES de que lleguen las preguntas. Con cuántos datos tiene ya cada una.
    const buscar = sp.get('buscar')
    if (buscar !== null) {
      const codigo = /^(?:ml[a-z])?-?(\d{5,15})$/i.exec(buscar.trim())?.[1] ?? null
      const palabras = buscar.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .split(/\s+/).map(p => p.replace(/[%_\\]/g, '')).filter(p => p.length >= 2).slice(0, 5)
      if (!codigo && !palabras.length) return NextResponse.json([])
      const titulo = `translate(lower(m.titulo), 'áéíóúüñ', 'aeiouun')`
      const { rows } = await s.db.query(
        `SELECT m.item_id, m.titulo, m.estado, m.permalink AS link, m.thumbnail AS imagen, x.nickname AS cuenta,
                (SELECT COUNT(*)::int FROM ml_item_notas n WHERE n.item_id = m.item_id) AS datos
         FROM ml_catalogo m JOIN ml_conexiones x ON x.id = m.conexion_id
         WHERE CASE WHEN $2::text <> '' THEN regexp_replace(m.item_id, '^[A-Z]{3}', '') LIKE $2 ELSE ${titulo} LIKE ALL ($1::text[]) END
         ORDER BY (m.estado = 'active') DESC, (${titulo} LIKE $3::text) DESC, m.titulo LIMIT 20`,
        [palabras.map(p => `%${p}%`), codigo ? `${codigo}%` : '', `${palabras[0] ?? ''}%`])
      return NextResponse.json(rows)
    }
    if (sp.get('todas')) {
      const { rows } = await s.db.query(
        `SELECT n.id, n.item_id, n.texto, n.created_at, CASE WHEN n.aprendida_de IS NOT NULL THEN 'aprendido de tu respuesta' ELSE u.full_name END AS por,
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
      `SELECT n.id, n.texto, n.created_at, CASE WHEN n.aprendida_de IS NOT NULL THEN 'aprendido de tu respuesta' ELSE u.full_name END AS por
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
