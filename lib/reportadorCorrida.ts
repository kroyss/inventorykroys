// Reportador por API en segundo plano (migración 048). La pantalla solo arranca la corrida y
// mira el avance: el servidor procesa todos los lotes aunque se cierre la página o se bloquee el
// teléfono. Antes la pantalla pedía cada lote y, al cerrarse, el reporte quedaba a medias.
import { after } from 'next/server'
import type { Pool } from 'pg'
import { conEmpresa } from '@/lib/db'
import { pendientesApi, reportarLote } from '@/lib/reportadorApi'
import type { Country } from '@/lib/types'

const LOTE = 8
const VUELTAS_MAX = 300
// Sin latido por más de esto, la corrida murió (reinicio del servidor, deploy): se da por interrumpida.
const MINUTOS_SIN_LATIDO = 3

const SQL_CORRIDA = `
  SELECT id, simular, estado, total, procesados, error, started_at, latido_at, finished_at,
         (estado = 'corriendo' AND latido_at < NOW() - make_interval(mins => ${MINUTOS_SIN_LATIDO})) AS colgada
  FROM reportador_corridas`

/** La última corrida de la empresa (si es de las últimas 12 h), con las colgadas ya cerradas. */
export async function ultimaCorrida(db: Pool) {
  await db.query(
    `UPDATE reportador_corridas SET estado = 'interrumpida', finished_at = NOW(),
            error = 'Se cortó en el servidor (reinicio). Lo pendiente sigue pendiente: vuelve a reportar.'
     WHERE estado = 'corriendo' AND latido_at < NOW() - make_interval(mins => ${MINUTOS_SIN_LATIDO})`)
  const { rows: [c] } = await db.query(
    `${SQL_CORRIDA} WHERE started_at > NOW() - INTERVAL '12 hours' ORDER BY id DESC LIMIT 1`)
  return c ?? null
}

/** Arranca una corrida (o devuelve la que ya está corriendo: una sola por empresa). */
export async function iniciarCorrida(db: Pool, quien: { empresaId: number; country: Country; userId: number }, simular: boolean) {
  const actual = await ultimaCorrida(db)
  if (actual?.estado === 'corriendo') return { corrida: actual, nueva: false }
  const { total } = await pendientesApi(db)
  let id: number
  try {
    const { rows: [c] } = await db.query(
      `INSERT INTO reportador_corridas (simular, total, iniciada_por) VALUES ($1, $2, $3) RETURNING id`,
      [simular, total, quien.userId])
    id = c.id
  } catch (e) {
    // Dos clics al mismo tiempo: la otra ya arrancó (índice único de "corriendo").
    if ((e as { code?: string }).code === '23505') return { corrida: await ultimaCorrida(db), nueva: false }
    throw e
  }
  after(() => correr(id, quien, simular))
  return { corrida: await ultimaCorrida(db), nueva: true }
}

/** Pide detener: se respeta entre lotes (el lote en curso termina). */
export async function detenerCorrida(db: Pool) {
  await db.query(`UPDATE reportador_corridas SET parar = TRUE WHERE estado = 'corriendo'`)
}

async function correr(id: number, quien: { empresaId: number; country: Country }, simular: boolean) {
  try {
    await conEmpresa(quien.empresaId, quien.country, async db => {
      const vistas: string[] = []
      let estado: 'terminada' | 'detenida' = 'terminada'
      for (let vuelta = 0; vuelta < VUELTAS_MAX; vuelta++) {
        const { rows: [c] } = await db.query(
          `UPDATE reportador_corridas SET latido_at = NOW() WHERE id = $1 RETURNING parar`, [id])
        if (!c || c.parar) { estado = 'detenida'; break }
        const r = await reportarLote(db, { simular, limite: LOTE, excluir: vistas })
        if (r.procesados.length === 0) break
        r.procesados.forEach(p => vistas.push(p.venta))
        await db.query(
          `UPDATE reportador_corridas SET procesados = procesados || $2::jsonb, latido_at = NOW() WHERE id = $1`,
          [id, JSON.stringify(r.procesados)])
      }
      await db.query(
        `UPDATE reportador_corridas SET estado = $2, finished_at = NOW() WHERE id = $1`, [id, estado])
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[reportador corrida]', id, msg)
    await conEmpresa(quien.empresaId, quien.country, db => db.query(
      `UPDATE reportador_corridas SET estado = 'error', error = $2, finished_at = NOW() WHERE id = $1`,
      [id, msg.slice(0, 500)])).catch(() => {})
  }
}
