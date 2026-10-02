// Limpieza automática de Despachos (migración 055): los PDF en disco (etiquetas originales,
// lotes de 4 por hoja y manifiestos) se borran a los MESES_GUARDADO meses. En la base queda
// todo (venta, guía, comprador, fechas): el historial y el rastreo siguen; solo ya no se puede
// volver a descargar ese PDF. Decidido con el dueño (2026-10-02): 6 meses (pesa ~60 MB/mes).
//
// La corre el cron de preguntas una vez al día (lib/limpiezaDespachos → app/api/cron/preguntas).
import { unlink } from 'fs/promises'
import type { Pool } from 'pg'

export const MESES_GUARDADO = 6

const borrar = async (p: string | null) => {
  if (!p) return 0
  try { await unlink(p); return 1 } catch { return 0 }   // ya no estaba: igual se marca
}

/** Borra los PDF viejos de UNA empresa (conexión con app.empresa_id). Devuelve cuántos archivos. */
export async function limpiarDespachos(db: Pool) {
  let archivos = 0
  // Lotes de jornadas cerradas (o sueltos: descartados / nunca generados) más viejos que el plazo.
  const { rows: lotes } = await db.query<{ id: number; output_path: string | null }>(
    `SELECT l.id, l.output_path
     FROM despacho_lotes l LEFT JOIN despacho_jornadas j ON j.id = l.jornada_id
     WHERE l.archivos_borrados_at IS NULL
       AND (j.id IS NULL OR j.status = 'CERRADA')
       AND COALESCE(j.closed_at, l.generated_at, l.created_at) < NOW() - make_interval(months => $1)
     ORDER BY l.id LIMIT 500`, [MESES_GUARDADO])
  for (const l of lotes) {
    const { rows: et } = await db.query<{ file_path: string }>(
      `SELECT file_path FROM despacho_etiquetas WHERE lote_id = $1`, [l.id])
    for (const e of et) archivos += await borrar(e.file_path)
    archivos += await borrar(l.output_path)
    await db.query(`UPDATE despacho_lotes SET output_path = NULL, archivos_borrados_at = NOW() WHERE id = $1`, [l.id])
  }
  // Manifiestos de jornadas cerradas más viejas que el plazo.
  const { rows: jornadas } = await db.query<{ id: number; manifest_path: string | null; manifest_tealca_path: string | null }>(
    `SELECT id, manifest_path, manifest_tealca_path FROM despacho_jornadas
     WHERE status = 'CERRADA' AND archivos_borrados_at IS NULL
       AND closed_at < NOW() - make_interval(months => $1)
     ORDER BY id LIMIT 500`, [MESES_GUARDADO])
  for (const j of jornadas) {
    archivos += await borrar(j.manifest_path) + await borrar(j.manifest_tealca_path)
    await db.query(
      `UPDATE despacho_jornadas SET manifest_path = NULL, manifest_tealca_path = NULL, archivos_borrados_at = NOW()
       WHERE id = $1`, [j.id])
  }
  return { lotes: lotes.length, jornadas: jornadas.length, archivos }
}
