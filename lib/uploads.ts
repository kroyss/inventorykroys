import { access } from 'fs/promises'
import path from 'path'

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

/**
 * Resuelve la ruta física real de un archivo subido. El `file_path` guardado en
 * DB puede venir de distintos orígenes y romperse entre entornos:
 *   - legacy absoluto del contenedor:  /app/uploads\14\foto.png  (con backslashes)
 *   - relativo nuevo:                   uploads\56\foto.png
 *   - sólo nombre / variantes
 * Reconstruimos a partir de UPLOAD_DIR + {orderId} + basename, que es como están
 * organizados los archivos en disco, y probamos varias variantes por compatibilidad.
 */
export async function resolveUploadPath(storedPath: string, orderId: string | number): Promise<string | null> {
  const basename = (storedPath || '').split(/[\\/]/).pop() || ''
  if (!basename) return null
  const candidates = [
    path.join(UPLOAD_DIR, String(orderId), basename), // reconstruido (caso normal)
    storedPath,                                        // tal cual (por si ya es válido)
    path.join(UPLOAD_DIR, basename),                   // plano sin carpeta de orden
  ]
  for (const c of candidates) {
    if (c && await exists(c)) return c
  }
  return null
}
