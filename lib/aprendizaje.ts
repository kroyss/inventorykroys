// Aprendizaje (migración 051): videos de YouTube no listados que se ven dentro del sistema, en
// orden. Un video cuenta como visto al reproducir el 90% (lo saltado no suma). El siguiente se
// habilita al completar el anterior. Al terminar todos: "Agenda tu configuración".
import { dbGlobal } from '@/lib/db'

export const PORCENTAJE_COMPLETO = 0.9

export interface VideoAprendizaje {
  id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string
  visto_seg: number; duracion_seg: number; completado: boolean
}

/** "https://youtu.be/abc…", "youtube.com/watch?v=…", "/shorts/…", "/embed/…" o el id solo → id (11). */
export function idDeYoutube(texto: string): string | null {
  const t = texto.trim()
  if (/^[\w-]{11}$/.test(t)) return t
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/.exec(t)
  return m ? m[1] : null
}

/** Videos activos, en orden, con el avance del usuario. */
export async function videosDeUsuario(userId: number | string): Promise<VideoAprendizaje[]> {
  const { rows } = await dbGlobal().query<VideoAprendizaje>(
    `SELECT v.id, v.orden, v.titulo, v.descripcion, v.youtube_id,
            COALESCE(p.visto_seg, 0) AS visto_seg, COALESCE(p.duracion_seg, 0) AS duracion_seg,
            p.completado_at IS NOT NULL AS completado
     FROM aprendizaje_videos v
     LEFT JOIN aprendizaje_progreso p ON p.video_id = v.id AND p.user_id = $1
     WHERE v.activo ORDER BY v.orden, v.id`, [userId])
  return rows
}

export async function linkAgendar(): Promise<string | null> {
  const { rows: [r] } = await dbGlobal().query(`SELECT value FROM plataforma_ajustes WHERE key = 'aprendizaje_link_agendar'`)
  return r?.value || null
}
