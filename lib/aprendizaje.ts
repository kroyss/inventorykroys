// Aprendizaje (migración 051): videos de YouTube no listados que se ven dentro del sistema, en
// orden. Un video cuenta como visto al reproducir el 80% (lo saltado no suma; se puede ver a 2x). El siguiente se
// habilita al completar el anterior. Al terminar todos: "Agenda tu configuración".
// Dos series (migración 072): Automatizaciones (todas las empresas) e Inventario (solo con el módulo
// inventario). El orden obligatorio es dentro de cada serie.
import { dbGlobal } from '@/lib/db'

export const PORCENTAJE_COMPLETO = 0.8

export const SERIES = { automatizaciones: 'Automatizaciones', inventario: 'Inventario' } as const
export type Serie = keyof typeof SERIES
/** Orden SQL de las series (Automatizaciones primero). */
export const SQL_ORDEN_SERIE = `CASE v.serie WHEN 'automatizaciones' THEN 0 ELSE 1 END`

export interface VideoAprendizaje {
  id: number; orden: number; titulo: string; descripcion: string | null; youtube_id: string; serie: Serie
  duracion_video: number | null   // la que se muestra (aprendizaje_videos.duracion_seg)
  visto_seg: number; duracion_seg: number; posicion_seg: number; completado: boolean
}

/** "https://youtu.be/abc…", "youtube.com/watch?v=…", "/shorts/…", "/embed/…" o el id solo → id (11). */
export function idDeYoutube(texto: string): string | null {
  const t = texto.trim()
  if (/^[\w-]{11}$/.test(t)) return t
  const m = /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/.exec(t)
  return m ? m[1] : null
}

/** "6:12", "1:02:30" o "372" (segundos) → segundos. Vacío → null. Inválido → NaN. */
export function segundosDe(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return NaN
  return t.split(':').reduce((acc, p) => acc * 60 + parseInt(p, 10), 0)
}

/** 372 → "6:12" · 3750 → "1:02:30". */
export function duracionTexto(seg: number) {
  const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Videos activos que le tocan (Inventario solo si la empresa lo lleva), en orden, con su avance. */
export async function videosDeUsuario(userId: number | string, inventario: boolean): Promise<VideoAprendizaje[]> {
  const { rows } = await dbGlobal().query<VideoAprendizaje>(
    `SELECT v.id, v.orden, v.titulo, v.descripcion, v.youtube_id, v.serie, v.duracion_seg AS duracion_video,
            COALESCE(p.visto_seg, 0) AS visto_seg, COALESCE(p.duracion_seg, 0) AS duracion_seg,
            COALESCE(p.posicion_seg, 0) AS posicion_seg,
            p.completado_at IS NOT NULL AS completado
     FROM aprendizaje_videos v
     LEFT JOIN aprendizaje_progreso p ON p.video_id = v.id AND p.user_id = $1
     WHERE v.activo AND (v.serie = 'automatizaciones' OR $2::boolean)
     ORDER BY ${SQL_ORDEN_SERIE}, v.orden, v.id`, [userId, inventario])
  return rows
}

export async function linkAgendar(): Promise<string | null> {
  const { rows: [r] } = await dbGlobal().query(`SELECT value FROM plataforma_ajustes WHERE key = 'aprendizaje_link_agendar'`)
  return r?.value || null
}
