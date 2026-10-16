// Novedades (migración 095): lo que mejoramos en el sistema, en el megáfono de la barra (components/layout/
// NovedadesNav.tsx) y en "Más" → Novedades en el celular. Las escribe el dueño en Plataforma → Interno.
// Cada empresa ve las de los módulos que tiene (o las de todos); el puntito sale con lo publicado
// después de la última vez que esa persona abrió el panel (users.novedades_vistas_at).
import { dbGlobal } from '@/lib/db'

export interface Novedad {
  id: number; fecha: string; titulo: string; texto: string; enlace: string | null; nueva: boolean
}

export async function novedadesDe(userId: number, modulos: string[]) {
  const [{ rows }, { rows: [u] }] = await Promise.all([
    dbGlobal().query(
      `SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, titulo, texto, enlace, publicada_at
       FROM novedades WHERE publicada_at IS NOT NULL AND (modulo IS NULL OR modulo = ANY($1::text[]))
       ORDER BY fecha DESC, publicada_at DESC, id DESC LIMIT 40`, [modulos]),
    dbGlobal().query(`SELECT novedades_vistas_at FROM users WHERE id = $1`, [userId]),
  ])
  const vistas = u?.novedades_vistas_at ? new Date(u.novedades_vistas_at).getTime() : 0
  const items: Novedad[] = rows.map(r => ({
    id: r.id, fecha: r.fecha, titulo: r.titulo, texto: r.texto, enlace: r.enlace,
    nueva: new Date(r.publicada_at).getTime() > vistas,
  }))
  return { items, nuevas: items.filter(i => i.nueva).length }
}
