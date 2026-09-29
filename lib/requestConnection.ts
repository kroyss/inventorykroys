import { after } from 'next/server'
import type { Pool, PoolClient } from 'pg'

/**
 * Conexión DEDICADA para todo el request, para endpoints que usan transacciones.
 *
 * `getDb()` devuelve un Pool, y cada `pool.query()` toma cualquier conexión libre.
 * Por eso el patrón `db.query('BEGIN') … db.query('COMMIT')` sobre el pool no era
 * atómico: BEGIN, las escrituras y COMMIT podían ir por conexiones distintas, y una
 * conexión podía volver al pool con una transacción abierta que heredaba el
 * siguiente request (un ROLLBACK ajeno podía deshacer escrituras de otro). Andaba
 * de casualidad porque, con pocos usuarios, el pool suele devolver la misma
 * conexión; con dos operaciones simultáneas fallaba.
 *
 * Uso — reemplaza al pool dentro del endpoint, el resto del código no cambia
 * (PoolClient tiene la misma `query` que Pool):
 *
 *   const { session, db: pool } = await getSessionDb()
 *   if (!session || !pool) return unauthorized()
 *   const db = await requestConnection(pool)
 *
 * La conexión se devuelve al pool con `after()`, que Next ejecuta al terminar la
 * respuesta AUNQUE el endpoint haya lanzado un error — no hace falta envolver el
 * handler en try/finally. Red de seguridad: si algún camino sale con una
 * transacción abierta (un `return` entre BEGIN y COMMIT sin ROLLBACK), se hace
 * ROLLBACK antes de devolverla, para que el próximo request no la herede.
 */
export async function requestConnection(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect()
  const original = client.query
  let enTransaccion = false

  // Seguimiento de BEGIN/COMMIT/ROLLBACK para la red de seguridad. La firma de
  // query tiene muchas sobrecargas; se reenvía tal cual.
  client.query = function (this: PoolClient, ...args: unknown[]) {
    const sql = typeof args[0] === 'string' ? args[0].trim().toUpperCase() : ''
    if (sql === 'BEGIN') enTransaccion = true
    else if (sql === 'COMMIT' || sql === 'ROLLBACK') enTransaccion = false
    return (original as (...a: unknown[]) => unknown).apply(client, args)
  } as PoolClient['query']

  after(async () => {
    let rota: Error | undefined
    try {
      if (enTransaccion) await (original as (sql: string) => Promise<unknown>).call(client, 'ROLLBACK')
    } catch (e) {
      rota = e instanceof Error ? e : new Error(String(e))
    } finally {
      client.query = original
      // Con un error, el pool DESTRUYE la conexión en vez de reutilizarla.
      client.release(rota)
    }
  })

  return client
}
