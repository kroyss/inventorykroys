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
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external'
import { COUNTRY_TZ } from '@/lib/tz'
import type { Country } from '@/lib/types'

// connectionTimeoutMillis: si el pool se agota, el pedido falla a los 20 s (con error en el log) en vez
// de quedarse esperando para siempre y colgar la app (13-10: el cron retenía todas las conexiones).
// max 15 (13-10, antes 10 por defecto): Plataforma pide ~15 consultas a la vez. Producción: 3 contenedores
// (inventory_ecd, inventory_ecd_b, inventory_next) × 15 = 45 de las 100 que acepta la base.
// jit=off (02-11): con consultas que Postgres cree grandes (subconsultas sobre ml_mensajes) compilaba JIT en cada
// carga: Por confirmar tardaba 3 s y 2,7 eran solo de compilar. Las consultas de la app son cortas: JIT solo estorba.
// Va en el arranque de la conexión, así RESET ALL lo conserva.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 15, connectionTimeoutMillis: 20_000, options: '-c jit=off' })

export function dbGlobal() {
  return pool
}

// ── Medidor (12-11, fase 0 del plan de rapidez) ─────────────────────────────────────────────────────────────
// Anota en el log (docker logs) lo lento, con la pantalla/API de donde vino, para medir con datos reales:
//   [LENTO] 1710ms emp=1 ruta=api/inventory · WITH v AS ( SELECT p.id …      (una consulta > LENTO_MS, def. 200)
//   [ESPERA] 350ms emp=1 ruta=api/avisos                                      (esperó conexión libre > 100 ms)
//   [REQ_DB] 2300ms 11 consultas emp=1 ruta=page/dashboard                    (suma del request > 3×LENTO_MS)
// Resumen en el VPS: ./scripts/lentos.sh [horas]. Apagar: LENTO_MS=0.
const LENTO_MS = Number(process.env.LENTO_MS ?? 200)

/** De dónde viene la consulta: la página/API que Next está atendiendo (su almacén del request;
 *  la pila no sirve en el build, el código va en chunks). Ej.: "api/inventory", "page:inventario". */
function rutaActual(): string {
  if (!LENTO_MS) return ''
  try {
    const p = workAsyncStorage.getStore()?.page ?? ''
    const m = p.replace(/\([^/]*\)\//g, '').match(/^\/?(.*?)\/(route|page|layout)$/)
    if (!m) return p
    return m[2] === 'route' ? m[1] : `${m[2]}:${m[1] || 'inicio'}`
  } catch {
    return ''
  }
}

// [LAG]: si el proceso estuvo trabado (un trabajo pesado de CPU frena TODO lo demás, también el reloj de
// las consultas), se anota cada minuto: p99 y máximo de la demora del event loop.
const g = globalThis as { __lagMedidor?: boolean }
if (LENTO_MS && !g.__lagMedidor && typeof setInterval === 'function') {
  g.__lagMedidor = true
  import('node:perf_hooks').then(({ monitorEventLoopDelay }) => {
    const h = monitorEventLoopDelay({ resolution: 20 })
    h.enable()
    setInterval(() => {
      const p99 = Math.round(h.percentile(99) / 1e6), max = Math.round(h.max / 1e6)
      if (max > LENTO_MS) console.warn(`[LAG] p99 ${p99}ms máx ${max}ms (último minuto)`)
      h.reset()
    }, 60_000).unref?.()
  }).catch(() => {})
}

function anotarLenta(ms: number, empresa: number | string, ruta: string, sql: unknown) {
  const texto = typeof sql === 'string' ? sql : (sql as { text?: string } | null)?.text ?? ''
  console.warn(`[LENTO] ${ms}ms emp=${empresa} ruta=${ruta || '?'} · ${texto.replace(/\s+/g, ' ').trim().slice(0, 160)}`)
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
  private liberada = false
  private msDb = 0
  private consultas = 0
  private ruta = ''

  constructor(readonly empresaId: number, readonly country: Country) {}

  private conexion(): Promise<PoolClient> {
    if (!this.listo) {
      this.listo = (async () => {
        const t0 = Date.now()
        const client = await pool.connect()
        const espera = Date.now() - t0
        if (LENTO_MS && espera > 100) console.warn(`[ESPERA] ${espera}ms emp=${this.empresaId} ruta=${this.ruta || '?'} (pool: ${pool.totalCount} abiertas, ${pool.waitingCount} en cola)`)
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
        // Red de seguridad (13-10): si el request nunca llega a after() (quedaron 5 conexiones retenidas
        // y el pool se iba quedando corto), a los 5 min se cierra igual y se avisa en el log.
        const vigia = setTimeout(() => {
          if (this.liberada) return
          console.error('[db] conexión retenida 5 min sin liberar: se cierra', { empresa: this.empresaId })
          this.liberada = true
          client.release(new Error('retenida'))
        }, 5 * 60_000)
        vigia.unref?.()
        return client
      })()
    }
    return this.listo
  }

  private async liberar(client: PoolClient) {
    if (this.liberada) return
    this.liberada = true
    if (LENTO_MS && this.msDb > LENTO_MS * 3) console.warn(`[REQ_DB] ${this.msDb}ms ${this.consultas} consultas emp=${this.empresaId} ruta=${this.ruta || '?'}`)
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
    if (!LENTO_MS) return this.conexion().then(c => (c.query as (...a: unknown[]) => unknown).apply(c, args))
    const ruta = rutaActual()
    if (ruta && !this.ruta) this.ruta = ruta
    return this.conexion().then(async c => {
      const t0 = Date.now()
      try {
        return await (c.query as (...a: unknown[]) => Promise<unknown>).apply(c, args)
      } finally {
        const ms = Date.now() - t0
        this.msDb += ms; this.consultas++
        if (ms > LENTO_MS) anotarLenta(ms, this.empresaId, ruta || this.ruta, args[0])
      }
    })
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
    query: !LENTO_MS ? client.query.bind(client) : (async (...args: unknown[]) => {
      const ruta = rutaActual()
      const t0 = Date.now()
      try {
        return await (client.query as (...a: unknown[]) => Promise<unknown>).apply(client, args)
      } finally {
        const ms = Date.now() - t0
        if (ms > LENTO_MS) anotarLenta(ms, empresaId, ruta || 'global', args[0])
      }
    }),
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
