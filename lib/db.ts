// Base de datos compartida (multiempresa). Una sola base, un solo Pool, conectado con el
// rol `inventory_app`, que NO puede saltarse Row Level Security.
//
// Dos formas de hablarle:
//
//   dbGlobal()               → sin empresa. Solo ve las tablas globales (users, empresas,
//                              usuario_empresas, tasas). Las tablas de negocio devuelven
//                              0 filas y rechazan escrituras. Para login, tasas, cron.
//
//   dbEmpresa(id, country)   → una conexión DEDICADA al request con la empresa fijada
//                              (`app.empresa_id`) y la zona horaria de su país. Todo lo
//                              que pase por ella (query, connect, transacciones) ve solo
//                              esa empresa. Se devuelve al pool al terminar el request.
//
// La empresa del usuario la resuelve getSessionDb() (lib/session.ts); el código de los
// endpoints no cambia: sigue recibiendo algo con `.query()` y `.connect()`.
import { after } from 'next/server'
import { Pool, type PoolClient } from 'pg'
import { COUNTRY_TZ } from '@/lib/tz'
import type { Country } from '@/lib/types'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export function dbGlobal() {
  return pool
}

type Query = PoolClient['query']

/**
 * Conexión de un request a una empresa. Se pide al pool en el primer uso; desde ahí
 * TODAS las consultas del request van por ella (también las de `connect()`), así que
 * una transacción abierta con BEGIN ve y bloquea sobre la misma conexión.
 *
 * Al terminar el request (`after`, corre aunque el endpoint falle):
 *   - si quedó una transacción abierta → ROLLBACK;
 *   - RESET ALL borra empresa y zona horaria de la conexión antes de devolverla;
 *   - si algo de eso falla, la conexión se DESTRUYE en vez de volver al pool, para que
 *     el próximo request nunca herede la empresa de otro.
 */
export class EmpresaDb {
  private listo: Promise<PoolClient> | null = null
  private enTransaccion = false

  constructor(readonly empresaId: number, readonly country: Country) {}

  private conexion(): Promise<PoolClient> {
    if (!this.listo) {
      this.listo = (async () => {
        const client = await pool.connect()
        try {
          await client.query(
            `SELECT set_config('app.empresa_id', $1, false), set_config('TimeZone', $2, false)`,
            [String(this.empresaId), COUNTRY_TZ[this.country]],
          )
        } catch (e) {
          client.release(e instanceof Error ? e : new Error(String(e)))
          throw e
        }
        after(() => this.liberar(client))
        return client
      })()
    }
    return this.listo
  }

  private async liberar(client: PoolClient) {
    let rota: Error | undefined
    try {
      if (this.enTransaccion) await client.query('ROLLBACK')
      await client.query('RESET ALL')
    } catch (e) {
      rota = e instanceof Error ? e : new Error(String(e))
    } finally {
      client.release(rota)
    }
  }

  private seguir(args: unknown[]) {
    const sql = typeof args[0] === 'string' ? args[0].trim().toUpperCase() : ''
    if (sql === 'BEGIN') this.enTransaccion = true
    else if (sql === 'COMMIT' || sql === 'ROLLBACK') this.enTransaccion = false
  }

  query: Query = ((...args: unknown[]) => {
    this.seguir(args)
    return this.conexion().then(c => (c.query as (...a: unknown[]) => unknown).apply(c, args))
  }) as Query

  /** Mismo contrato que Pool#connect: el `release()` del que llama no hace nada (la
   *  conexión es del request y se libera sola al final). */
  async connect(): Promise<PoolClient> {
    const client = await this.conexion()
    return new Proxy(client, {
      get: (target, prop) => {
        if (prop === 'release') return () => {}
        if (prop === 'query') return this.query
        const v = Reflect.get(target, prop)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
  }
}

/**
 * Conexión a una empresa FUERA de un request (tareas en segundo plano, p. ej. el Reportador por
 * API, que sigue aunque se cierre la pantalla). Misma idea que EmpresaDb pero se libera al
 * terminar `fn`, no con `after()`: ROLLBACK si quedó algo abierto, RESET ALL, y si eso falla la
 * conexión se destruye en vez de volver al pool.
 */
export async function conEmpresa<T>(empresaId: number, country: Country, fn: (db: Pool) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query(
      `SELECT set_config('app.empresa_id', $1, false), set_config('TimeZone', $2, false)`,
      [String(empresaId), COUNTRY_TZ[country]],
    )
  } catch (e) {
    client.release(e instanceof Error ? e : new Error(String(e)))
    throw e
  }
  const db = {
    query: client.query.bind(client),
    connect: async () => new Proxy(client, {
      get: (target, prop) => {
        if (prop === 'release') return () => {}
        const v = Reflect.get(target, prop)
        return typeof v === 'function' ? v.bind(target) : v
      },
    }),
  } as unknown as Pool
  try {
    return await fn(db)
  } finally {
    let rota: Error | undefined
    try {
      await client.query('ROLLBACK')        // sin transacción abierta es solo un aviso
      await client.query('RESET ALL')
    } catch (e) {
      rota = e instanceof Error ? e : new Error(String(e))
    } finally {
      client.release(rota)
    }
  }
}

/** Conexión del request a una empresa. Ver EmpresaDb. Tipada como Pool para que los
 *  helpers existentes (que reciben `Pool`) la acepten sin cambios: usan query y connect. */
export function dbEmpresa(empresaId: number, country: Country): Pool {
  return new EmpresaDb(empresaId, country) as unknown as Pool
}
