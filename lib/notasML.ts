// Notas de la venta en MercadoLibre (las de "Notas" en el detalle de la venta en ML).
//
// ML tiene dos APIs: /orders/{id}/notes y /packs/{id}/notes (ventas con varios productos).
// Verificado en MLV (01/10): se leen. Se leen las dos (sin repetir por id) y cada nota
// recuerda de cuál vino, para editarla/borrarla por el mismo camino. Una nota nueva va a
// la orden; si el número es de un pack (la orden no existe), va al pack. Máx. 300 caracteres.
//
// Quién escribe: Mensajes (la conversación) y Ventas (al cargar o editar la nota de la venta).
// La fuente de verdad es ML; ml_conversaciones.notas es solo una copia para la bandeja.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'

export const LARGO_NOTA = 300
const X_PUBLIC = { 'X-Public': 'true' }

export interface NotaML { id: string; texto: string; fecha: string; fuente: 'orden' | 'pack' }
type NotaApi = { id: string; note: string; date_created: string; date_last_updated?: string }

const aNota = (n: NotaApi, fuente: NotaML['fuente']): NotaML =>
  ({ id: String(n.id), texto: n.note, fecha: n.date_last_updated ?? n.date_created, fuente })

/** Todas las notas de una venta (orden o pack), de la más vieja a la más nueva. */
export async function leerNotas(db: Pool, conexionId: number, venta: string) {
  const notas: NotaML[] = []
  const errores: string[] = []
  try {
    const r = await mlFetch<NotaApi[] | { results?: NotaApi[] }[] | { results?: NotaApi[] }>(db, conexionId, `/orders/${venta}/notes`)
    const lista = Array.isArray(r) ? r.flatMap(g => ('results' in g ? (g.results ?? []) : [g as NotaApi])) : (r.results ?? [])
    notas.push(...lista.map(n => aNota(n, 'orden')))
  } catch (e) { if (!(e instanceof ErrorML && e.status === 404)) errores.push(`orden: ${e instanceof Error ? e.message : e}`) }
  try {
    const r = await mlFetch<{ results?: NotaApi[] }[] | { results?: NotaApi[] }>(db, conexionId, `/packs/${venta}/notes`, { headers: X_PUBLIC })
    for (const g of Array.isArray(r) ? r : [r]) for (const n of g.results ?? [])
      if (!notas.some(x => x.id === String(n.id))) notas.push(aNota(n, 'pack'))
  } catch (e) { if (!(e instanceof ErrorML && e.status === 404)) errores.push(`pack: ${e instanceof Error ? e.message : e}`) }
  notas.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { notas, error: notas.length === 0 && errores.length === 2 ? errores.join(' · ') : null }
}

/** Crea una nota (en la orden; si no existe como orden, en el pack). */
export async function crearNota(db: Pool, conexionId: number, venta: string, texto: string) {
  const body = { note: texto.slice(0, LARGO_NOTA) }
  try {
    await mlFetch(db, conexionId, `/orders/${venta}/notes`, { method: 'POST', body })
  } catch (e) {
    if (!(e instanceof ErrorML && e.status === 404)) throw e
    await mlFetch(db, conexionId, `/packs/${venta}/notes`, { method: 'POST', body, headers: X_PUBLIC })
  }
}

export async function editarNota(db: Pool, conexionId: number, venta: string, nota: Pick<NotaML, 'id' | 'fuente'>, texto: string) {
  const body = { note: texto.slice(0, LARGO_NOTA) }
  if (nota.fuente === 'pack') await mlFetch(db, conexionId, `/packs/${venta}/notes/${nota.id}`, { method: 'PUT', body, headers: X_PUBLIC })
  else await mlFetch(db, conexionId, `/orders/${venta}/notes/${nota.id}`, { method: 'PUT', body })
}

export async function borrarNota(db: Pool, conexionId: number, venta: string, nota: Pick<NotaML, 'id' | 'fuente'>) {
  if (nota.fuente === 'pack') await mlFetch(db, conexionId, `/packs/${venta}/notes/${nota.id}`, { method: 'DELETE', headers: X_PUBLIC })
  else await mlFetch(db, conexionId, `/orders/${venta}/notes/${nota.id}`, { method: 'DELETE' })
}

/** Texto único de las notas (para la copia en la bandeja y para Ventas). */
export const unirNotas = (notas: NotaML[]) => notas.map(n => n.texto.trim()).filter(Boolean).join(' · ') || null

/** Guarda la copia de las notas en la conversación (si existe). */
export async function copiarNotas(db: Pool, venta: string, notas: NotaML[]) {
  await db.query(`UPDATE ml_conversaciones SET notas = $2, notas_at = NOW() WHERE pack_id::text = $1`, [venta, unirNotas(notas)])
}

/** A qué cuenta conectada pertenece una venta: primero por su conversación, si no
 *  preguntando a ML en cada cuenta (como orden y como pack). */
export async function conexionDeVenta(db: Pool, venta: string): Promise<number | null> {
  if (!/^\d+$/.test(venta)) return null
  const { rows: [c] } = await db.query(
    `SELECT c.conexion_id FROM ml_conversaciones c JOIN ml_conexiones x ON x.id = c.conexion_id
     WHERE c.pack_id::text = $1 AND x.estado = 'activa'`, [venta])
  if (c) return c.conexion_id
  const { rows: cuentas } = await db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  for (const x of cuentas) {
    for (const ruta of [`/orders/${venta}`, `/packs/${venta}`]) {
      try { await mlFetch(db, x.id, ruta); return x.id }
      catch (e) { if (!(e instanceof ErrorML && [401, 403, 404].includes(e.status))) throw e }
    }
  }
  return null
}

/** Deja en ML el texto de la nota de la venta (lo que se escribió en Ventas, el último paso):
 *  queda UNA nota con ese texto (se cambia la más reciente y se borran las demás, cuyo texto
 *  ya venía incluido al traerlas a la venta); si no hay, se crea. Vacío = no toca nada. */
export async function sincronizarNotaDeVenta(db: Pool, venta: string, texto: string) {
  const t = texto.trim()
  if (!t) return
  const conexionId = await conexionDeVenta(db, venta)
  if (!conexionId) return
  const { notas } = await leerNotas(db, conexionId, venta)
  if (unirNotas(notas) === t) return
  const ultima = notas[notas.length - 1]
  if (ultima) {
    await editarNota(db, conexionId, venta, ultima, t)
    for (const n of notas.slice(0, -1)) await borrarNota(db, conexionId, venta, n)
  } else await crearNota(db, conexionId, venta, t)
  await copiarNotas(db, venta, (await leerNotas(db, conexionId, venta)).notas)
}

/** Las notas de ML de una venta, en un solo texto (para traerlas al cargar la venta). */
export async function notaDeVentaEnML(db: Pool, venta: string) {
  const conexionId = await conexionDeVenta(db, venta)
  if (!conexionId) return null
  const { notas } = await leerNotas(db, conexionId, venta)
  await copiarNotas(db, venta, notas)
  return unirNotas(notas)
}

/** Ventas → al guardar una venta de ML (BORRADOR o editada), su nota y la de ML quedan iguales:
 *   - si la venta trae nota nueva o cambiada → se escribe en ML (Ventas es el último paso);
 *   - si la venta no tiene nota (ni tenía) → se trae la de ML (la que se dejó en Mensajes).
 *  Borrar la nota en Ventas NO borra la de ML. Nunca hace fallar el guardado (máx. ~6 s). */
export async function notaAlGuardarVenta(db: Pool, saleId: number | string, venta: string, nota: string | null, antes: string | null) {
  if (!/^\d+$/.test(venta)) return null          // LOCAL-… y números raros: no son de ML
  const actual = nota?.trim() ?? ''
  const trabajo = (async () => {
    if (actual && actual !== (antes?.trim() ?? '')) {
      await sincronizarNotaDeVenta(db, venta, actual)
      return null
    }
    if (actual || antes?.trim()) return null
    const deML = await notaDeVentaEnML(db, venta)
    if (!deML) return null
    await db.query(`UPDATE sales SET notes = $2 WHERE id = $1 AND COALESCE(TRIM(notes), '') = ''`, [saleId, deML])
    return deML
  })()
  const tope = new Promise<null>(r => setTimeout(() => r(null), 6000))
  try { return await Promise.race([trabajo.catch(e => { console.error('[notas ML]', venta, e); return null }), tope]) }
  catch { return null }
}
