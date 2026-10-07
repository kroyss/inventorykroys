import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { idDeYoutube, linkAgendar, segundosDe, SQL_ORDEN_SERIE } from '@/lib/aprendizaje'

// Plataforma → Aprendizaje (solo el dueño).
//   GET  → videos (todos), link de "agendar", el avance de cada usuario de las empresas clientes y el uso
//          de cada empresa (conexión a ML y cuánto usó cada herramienta)
//   POST { titulo, descripcion?, url, serie, duracion? } → agrega un video al final de su serie
//   PUT  { agendar } → link al que lleva "Agenda tu configuración" (Telegram)
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: videos }, { rows: alumnos }, agendar, { rows: uso }] = await Promise.all([
      db.query(`SELECT v.id, v.orden, v.titulo, v.descripcion, v.youtube_id, v.activo, v.serie, v.duracion_seg
                FROM aprendizaje_videos v ORDER BY ${SQL_ORDEN_SERIE}, v.orden, v.id`),
      db.query(
        `SELECT u.id, u.full_name, u.username,
                string_agg(DISTINCT e.nombre, ', ') AS empresas,
                COUNT(p.completado_at) FILTER (WHERE v.activo AND v.serie = 'automatizaciones')::int AS completados,
                COUNT(p.completado_at) FILTER (WHERE v.activo AND v.serie = 'inventario')::int AS completados_inv,
                bool_or('inventario' = ANY(e.modulos)) AS inventario,
                MAX(p.updated_at) AS ultima,
                GREATEST(u.ultima_actividad, u.last_login) AS ingreso,
                -- Video empezado y sin terminar (el último que tocó): "viendo el 1º, 57%".
                (SELECT json_build_object('serie', w.serie, 'pct', LEAST(99, ROUND(100.0 * q.visto_seg / NULLIF(q.duracion_seg, 0))),
                          'numero', (SELECT COUNT(*) FROM aprendizaje_videos z WHERE z.activo AND z.serie = w.serie AND z.orden <= w.orden))
                 FROM aprendizaje_progreso q JOIN aprendizaje_videos w ON w.id = q.video_id
                 WHERE q.user_id = u.id AND w.activo AND q.completado_at IS NULL AND q.visto_seg > 0
                 ORDER BY q.updated_at DESC LIMIT 1) AS viendo
         FROM users u
         JOIN usuario_empresas ue ON ue.user_id = u.id
         JOIN empresas e ON e.id = ue.empresa_id AND e.organizacion_id <> $1
         LEFT JOIN aprendizaje_progreso p ON p.user_id = u.id
         LEFT JOIN aprendizaje_videos v ON v.id = p.video_id
         WHERE u.is_active
         GROUP BY u.id ORDER BY MAX(p.updated_at) DESC NULLS LAST, u.full_name`, [ORGANIZACION_PLATAFORMA]),
      linkAgendar(),
      // Uso de cada empresa cliente (migración 073): si conectó ML y cuánto usa cada herramienta.
      db.query(
        `SELECT e.id, e.nombre, o.estado, o.fundador, o.prueba_dias, to_char(o.prueba_hasta, 'YYYY-MM-DD') AS prueba_hasta,
                u.cuentas, u.conectada_at, u.preguntas, u.preguntas_7d, u.mensajes, u.mensajes_7d,
                u.etiquetas, u.etiquetas_7d, u.reportadas, u.reportadas_7d, u.calificadas, u.calificadas_7d,
                u.stock, u.stock_7d, u.ultima_actividad,
                (SELECT MAX(GREATEST(x.ultima_actividad, x.last_login)) FROM usuario_empresas ue JOIN users x ON x.id = ue.user_id
                 WHERE ue.empresa_id = e.id) AS ingreso
         FROM plataforma_uso_clientes() u
         JOIN empresas e ON e.id = u.empresa_id
         JOIN organizaciones o ON o.id = e.organizacion_id
         WHERE e.organizacion_id <> $1 AND e.is_active
         ORDER BY u.conectada_at IS NULL, u.ultima_actividad DESC NULLS LAST, e.nombre`, [ORGANIZACION_PLATAFORMA]),
    ])
    return NextResponse.json({ videos, alumnos, agendar, uso })
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
