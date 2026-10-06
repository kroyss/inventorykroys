import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { idDeYoutube, linkAgendar, segundosDe, SQL_ORDEN_SERIE } from '@/lib/aprendizaje'

// Plataforma → Aprendizaje (solo el dueño).
//   GET  → videos (todos), link de "agendar" y el avance de cada usuario de las empresas clientes
//   POST { titulo, descripcion?, url, serie, duracion? } → agrega un video al final de su serie
//   PUT  { agendar } → link al que lleva "Agenda tu configuración" (Telegram)
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: videos }, { rows: alumnos }, agendar] = await Promise.all([
      db.query(`SELECT v.id, v.orden, v.titulo, v.descripcion, v.youtube_id, v.activo, v.serie, v.duracion_seg
                FROM aprendizaje_videos v ORDER BY ${SQL_ORDEN_SERIE}, v.orden, v.id`),
      db.query(
        `SELECT u.id, u.full_name, u.username,
                string_agg(DISTINCT e.nombre, ', ') AS empresas,
                COUNT(p.completado_at) FILTER (WHERE v.activo AND v.serie = 'automatizaciones')::int AS completados,
                COUNT(p.completado_at) FILTER (WHERE v.activo AND v.serie = 'inventario')::int AS completados_inv,
                bool_or('inventario' = ANY(e.modulos)) AS inventario,
                MAX(p.updated_at) AS ultima
         FROM users u
         JOIN usuario_empresas ue ON ue.user_id = u.id
         JOIN empresas e ON e.id = ue.empresa_id AND e.organizacion_id <> $1
         LEFT JOIN aprendizaje_progreso p ON p.user_id = u.id
         LEFT JOIN aprendizaje_videos v ON v.id = p.video_id
         WHERE u.is_active
         GROUP BY u.id ORDER BY MAX(p.updated_at) DESC NULLS LAST, u.full_name`, [ORGANIZACION_PLATAFORMA]),
      linkAgendar(),
    ])
    return NextResponse.json({ videos, alumnos, agendar })
  } catch (err) {
    return apiError(err)
  }
}

const Nuevo = z.object({
  titulo: z.string().trim().min(2, 'Falta el título').max(120),
  descripcion: z.string().trim().max(500).optional(),
  url: z.string().trim().min(5, 'Falta el link de YouTube'),
  serie: z.enum(['automatizaciones', 'inventario']).default('automatizaciones'),
  duracion: z.string().trim().max(10).optional(),   // "6:12"
})

export async function POST(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const b = Nuevo.parse(await req.json())
    const id = idDeYoutube(b.url)
    if (!id) return NextResponse.json({ error: 'No reconozco ese link de YouTube' }, { status: 400 })
    const duracion = segundosDe(b.duracion ?? '')
    if (Number.isNaN(duracion)) return NextResponse.json({ error: 'La duración va como 6:12 (minutos:segundos)' }, { status: 400 })
    // Al final de SU serie.
    await dbGlobal().query(
      `INSERT INTO aprendizaje_videos (orden, titulo, descripcion, youtube_id, serie, duracion_seg)
       VALUES ((SELECT COALESCE(MAX(orden), 0) + 1 FROM aprendizaje_videos), $1, $2, $3, $4, $5)`,
      [b.titulo, b.descripcion || null, id, b.serie, duracion])
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const b = z.object({ agendar: z.string().trim().max(300) }).parse(await req.json())
    if (b.agendar && !/^https?:\/\//.test(b.agendar)) {
      return NextResponse.json({ error: 'El link debe empezar con https:// (ej. https://t.me/tuusuario)' }, { status: 400 })
    }
    await dbGlobal().query(
      `INSERT INTO plataforma_ajustes (key, value) VALUES ('aprendizaje_link_agendar', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [b.agendar])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
