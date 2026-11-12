// Estado de la traída de MercadoEnvíos (12-11-2026, el dueño): UNA sola verdad en el servidor para Pagos ME, Por confirmar,
// Nueva venta, Promociones y el aviso de tareas de abajo a la derecha. Mientras hay una traída corriendo no se crea otra
// (los botones quedan inhabilitados aunque se recargue la página) y el aviso muestra cada cuenta: órdenes y pesos.
// No toca la extensión: usa me_pedidos (lo que pidió la gente) y me_latidos (qué perfiles de Chrome hay y si están conectados).
import type { Pool } from 'pg'

/** Una traída cuenta como "en curso" a lo sumo esto (una normal tarda 1–3 min); pasado esto, quien no respondió "no respondió". */
export const TRAIDA_EN_CURSO_MIN = 5
/** Sin latido en estos minutos, el perfil se muestra como desconectado. */
const LATIDO_MIN = 3

export interface CuentaTraida { perfil: string; nombre: string; hecho: boolean; ok: boolean; error: string | null; nuevas: number; vistas: number; pesos: boolean | null }
export interface EstadoTraida {
  id: number; pedido_at: string; pesos: boolean; automatico: boolean
  /** Corriendo: hay perfiles que todavía no respondieron y la PC está conectada. */
  en_curso: boolean
  /** Pedida hace poco, pero ningún perfil está conectado: espera a la PC. */
  esperando_pc: boolean
  terminada_at: string | null
  cuentas: CuentaTraida[]
  con_error: boolean
}

type Resultado = { ok?: boolean; error?: string | null; cuenta?: string | null; nuevas?: number; vistas?: number; at?: string; pesos?: boolean | null }

/** La última traída y cómo va. null = nunca se pidió ninguna. */
export async function estadoTraida(db: Pick<Pool, 'query'>): Promise<EstadoTraida | null> {
  const [{ rows: [p] }, { rows: latidos }] = await Promise.all([
    db.query(`SELECT id::int, pedido_at, pesos, resultados, pedido_por IS NULL AS automatico,
                     pedido_at > NOW() - make_interval(mins => $1) AS vigente
              FROM me_pedidos ORDER BY id DESC LIMIT 1`, [TRAIDA_EN_CURSO_MIN]),
    // Un perfil vigente por cuenta (al reconectar la extensión queda un perfil nuevo y el viejo sigue en me_latidos).
    db.query(`SELECT DISTINCT ON (COALESCE(conexion_id::text, cuenta, perfil)) perfil, cuenta,
                     visto_at > NOW() - make_interval(mins => $1) AS conectado
              FROM me_latidos WHERE visto_at > NOW() - INTERVAL '1 day'
              ORDER BY COALESCE(conexion_id::text, cuenta, perfil), visto_at DESC`, [LATIDO_MIN]),
  ])
  if (!p) return null
  const res = (p.resultados ?? {}) as Record<string, Resultado>
  const perfiles = latidos.filter(l => l.perfil !== 'DESPERTADOR')
  const despertador = latidos.find(l => l.perfil === 'DESPERTADOR')
  // Con despertador, los Chrome se abren solo al traer: la señal de vida es la del despertador.
  const conectada = despertador ? !!despertador.conectado : perfiles.some(l => l.conectado)
  const faltan = perfiles.filter(l => !res[l.perfil])
  const pendiente = !!p.vigente && (perfiles.length ? faltan.length > 0 : Object.keys(res).length === 0)
  const nombre = (perfil: string, r?: Resultado) => r?.cuenta ?? perfiles.find(l => l.perfil === perfil)?.cuenta ?? perfil
  const cuentas: CuentaTraida[] = [
    ...Object.entries(res).map(([perfil, r]) => ({ perfil, nombre: nombre(perfil, r), hecho: true, ok: r.ok !== false, error: r.error ?? null,
      nuevas: r.nuevas ?? 0, vistas: r.vistas ?? 0, pesos: r.pesos ?? null })),
    ...faltan.map(l => ({ perfil: l.perfil as string, nombre: nombre(l.perfil), hecho: false, ok: false, error: null, nuevas: 0, vistas: 0, pesos: null })),
  ]
  const fin = Object.values(res).map(r => r.at ?? '').filter(Boolean).sort().pop() ?? null
  return {
    id: p.id, pedido_at: p.pedido_at, pesos: !!p.pesos, automatico: !!p.automatico,
    en_curso: pendiente && conectada, esperando_pc: pendiente && !conectada,
    terminada_at: pendiente ? null : fin,
    cuentas,
    con_error: cuentas.some(c => c.hecho && (!c.ok || c.pesos === false)) || (!pendiente && faltan.length > 0 && Object.keys(res).length > 0),
  }
}

export const ocupada = (e: EstadoTraida | null) => !!e && (e.en_curso || e.esperando_pc)
export const ERROR_OCUPADA = 'Ya hay una traída de MercadoEnvíos en curso: espera a que termine (1 a 3 minutos).'
