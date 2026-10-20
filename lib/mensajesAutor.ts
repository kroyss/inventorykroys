// Quién mandó cada mensaje propio de una conversación (19-10, pedido del dueño: "para tener registro por si se
// requiere validar"). ML no lo sabe (para ML todo lo manda la cuenta): sale de respuestas_origen, donde el sistema
// anota cada envío desde el 05-10 (usuario, texto y hora). Se empareja por hora (±10 min) y, si hay varios, por texto.
// Sin registro: "automático" si es un aviso del sistema (Reportador / recordatorio de pago), "desde MercadoLibre" si
// es posterior al primer registro de la empresa (lo escribieron en la app de ML), y nada si es de antes.
import type { Pool } from 'pg'
import { AUTOMATICOS, textoPlano } from '@/lib/mensajesML'

const VENTANA_MS = 10 * 60 * 1000
const normal = (t: string) => textoPlano(t).toLowerCase().replace(/[^a-z0-9ñáéíóú]/gi, '')
// Avisos automáticos de siempre (bienvenida de ML, guía, Reportador): los mismos que no se usan como sugerencia.
const AUTOMATICO = new RegExp(AUTOMATICOS, 'i')

/** Autor de cada mensaje (mismo orden que `mensajes`); null en los del comprador o sin dato. */
export async function autoresDelHilo(db: Pool, pack: string, mensajes: { propio: boolean; texto: string; fecha: string }[],
  plantillasRecordatorio: string[] = []): Promise<(string | null)[]> {
  if (!mensajes.some(m => m.propio)) return mensajes.map(() => null)
  const [{ rows: regs }, { rows: [desde] }] = await Promise.all([
    db.query(
      `SELECT r.fecha, r.texto, r.fuente, u.full_name FROM respuestas_origen r LEFT JOIN users u ON u.id = r.usuario_id
       WHERE r.modulo = 'mensajes' AND r.ref = $1 ORDER BY r.fecha`, [pack]),
    db.query(`SELECT MIN(fecha) AS f FROM respuestas_origen WHERE modulo = 'mensajes'`),
  ])
  const usados = new Set<number>()
  // Comienzo fijo de cada plantilla de recordatorio (hasta la primera {variable}): así se reconocen los viejos.
  const inicios = plantillasRecordatorio.map(p => normal(p.split('{')[0])).filter(s => s.length >= 12)
  return mensajes.map(m => {
    if (!m.propio) return null
    const t = Date.parse(m.fecha), txt = normal(m.texto ?? '')
    const cerca = regs.map((r, i) => ({ r, i })).filter(({ r, i }) => !usados.has(i) && Math.abs(new Date(r.fecha).getTime() - t) <= VENTANA_MS)
    const elegido = cerca.find(({ r }) => normal(r.texto) === txt)
      ?? cerca.find(({ r }) => !r.texto?.trim() && !txt)        // solo archivo
      ?? (cerca.length === 1 ? cerca[0] : undefined)
    if (elegido) {
      usados.add(elegido.i)
      return elegido.r.fuente === 'automatica' ? 'automático' : elegido.r.full_name ?? null
    }
    if (AUTOMATICO.test(m.texto ?? '') || inicios.some(s => txt.startsWith(s))) return 'automático'
    return desde?.f && t >= new Date(desde.f).getTime() ? 'desde MercadoLibre' : null
  })
}
