// Estado de la traída de MercadoEnvíos (12-11-2026, el dueño): UNA sola verdad en el servidor para Pagos ME, Por confirmar,
// Nueva venta, Promociones y el aviso de tareas de abajo a la derecha. Mientras hay una traída corriendo no se crea otra
// (los botones quedan inhabilitados aunque se recargue la página) y el aviso muestra cada cuenta: órdenes y pesos.
// No toca la extensión: usa me_pedidos (lo que pidió la gente) y me_latidos (qué perfiles de Chrome hay y si están conectados).
import type { Pool } from 'pg'

/** Una traída cuenta como "en curso" a lo sumo esto (una normal tarda 1–3 min; abriendo Chrome con el despertador y
 *  conexión lenta, hasta ~9). 19-11: 5 → 10, antes decía «no respondió» y la cuenta terminaba bien minutos después. */
export const TRAIDA_EN_CURSO_MIN = 10
/** 19-11: un perfil con Chrome abierto (da señal) que lleva esto sin terminar probablemente está trabado. */
export const LENTA_MIN = 4
/** Qué decirle a la persona cuando una cuenta no termina. */
export const AYUDA_TRABADA = 'si sigue así, cierra y abre el Chrome de esa cuenta en la PC'
/** 20-11 (el dueño): las 1.3.9+ mandan avance apenas toman el pedido; si a los TOMA_MIN no hay avance, no lo tomaron. */
export const TOMA_MIN = 2
/** 20-11: Chrome vivo (da señal) que no toma el pedido = la extensión quedó trabada en una lectura anterior (la 1.3.6 no
 *  tiene tope de tiempo y espera al portal para siempre; se destraba recargando la pestaña del portal o cerrando Chrome). */
export const AYUDA_EXTENSION_TRABADA = 'la extensión de esa cuenta quedó trabada: recarga la pestaña de MercadoEnvíos (F5) o cierra y abre ese Chrome'
/** 20-11: con el despertador, Chrome se abre en ~30–90 s; sin señal pasados estos minutos, no abrió. */
export const SIN_SENAL_MIN = 3
/** 20-11: perfil sin señal pasados SIN_SENAL_MIN: Chrome no abrió o el Asistente está apagado/desconectado. */
export const AYUDA_SIN_SENAL = 'el Chrome de esa cuenta no da señal: ábrelo en la PC (si está abierto, ciérralo y vuelve a abrirlo) y revisa que el Asistente de envíos diga «Conectado»'

/** Errores técnicos de la extensión → qué hacer, en palabras de la persona (20-11). */
export function textoErrorME(error: string | null | undefined): string {
  const e = error ?? ''
  if (e === 'sin_sesion') return 'sin sesión de MercadoEnvíos en la PC: entra al portal en ese Chrome e inicia sesión'
  if (/Cannot access contents of the page|must request permission/i.test(e))
    return 'la pestaña de MercadoEnvíos no estaba en el portal (¿pidió iniciar sesión?): entra a MercadoEnvíos en ese Chrome, inicia sesión y vuelve a traer'
  if (/Frame with ID \d+ was removed|No tab with id|tab was closed/i.test(e))
    return 'se cerró o cambió la pestaña de MercadoEnvíos mientras leía: no la uses mientras trae y vuelve a traer'
  if (/Failed to fetch|NetworkError/i.test(e)) return 'se cortó internet mientras leía: vuelve a traer'
  return e || 'error'
}
/** Sin latido en estos minutos, el perfil se muestra como desconectado. */
const LATIDO_MIN = 3

export interface CuentaTraida { perfil: string; nombre: string; hecho: boolean; ok: boolean; error: string | null; nuevas: number; vistas: number; pesos: boolean | null
  /** 1.3.9+: cuánto tardó esa cuenta y cómo leyó (completa = 7 días; corta = lo nuevo y las pendientes). */
  segundos?: number | null; modo?: string | null
  /** Sin terminar, con su Chrome dando señal, y sin tomar el pedido (TOMA_MIN; LENTA_MIN con la 1.3.6, que no manda avance): trabada. */
  lenta?: boolean
  /** Sin terminar y su Chrome sin señal pasados SIN_SENAL_MIN (20-11). */
  sin_senal?: boolean
  /** 1.3.9 (mig. 190): cómo va mientras trabaja. Las versiones anteriores no lo mandan. */
  avance?: AvanceCuenta | null }
export interface AvanceCuenta { fase: 'leyendo' | 'revisando' | 'bajando' | 'pesos'; hechas: number; total: number | null; faltan_s: number | null; modo: 'completa' | 'corta' | 'avisos' | null }
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

type Resultado = { ok?: boolean; error?: string | null; cuenta?: string | null; nuevas?: number; vistas?: number; at?: string; pesos?: boolean | null; segundos?: number | null; modo?: string | null }

/** La última traída y cómo va. null = nunca se pidió ninguna. */
export async function estadoTraida(db: Pick<Pool, 'query'>): Promise<EstadoTraida | null> {
  const [{ rows: [p] }, { rows: latidos }] = await Promise.all([
    db.query(`SELECT id::int, pedido_at, pesos, resultados, avance, pedido_por IS NULL AS automatico,
                     pedido_at > NOW() - make_interval(mins => $1) AS vigente,
                     EXTRACT(EPOCH FROM NOW() - pedido_at)::int AS edad_s
              FROM me_pedidos ORDER BY id DESC LIMIT 1`, [TRAIDA_EN_CURSO_MIN]),
    // Un perfil vigente por cuenta (al reconectar la extensión queda un perfil nuevo y el viejo sigue en me_latidos).
    db.query(`SELECT DISTINCT ON (COALESCE(conexion_id::text, cuenta, perfil)) perfil, cuenta,
                     visto_at > NOW() - make_interval(mins => $1) AS conectado,
              -- 1.3.9+ (manda avance apenas toma el pedido): alguna lectura suya informó el modo.
              EXISTS (SELECT 1 FROM me_pedidos q WHERE q.pedido_at > NOW() - INTERVAL '7 days'
                      AND q.resultados->me_latidos.perfil->>'modo' IS NOT NULL) AS manda_avance
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
  // Avance que manda la 1.3.9 (se descarta si quedó viejo: la extensión se cerró a mitad).
  const av = (p.avance ?? {}) as Record<string, AvanceCuenta & { at?: string }>
  const avanceVivo = (perfil: string) => { const x = av[perfil]; return !!x?.at && Date.now() - new Date(x.at).getTime() < 3 * 60_000 }
  const avanceDe = (perfil: string): AvanceCuenta | null => {
    if (!avanceVivo(perfil)) return null
    const x = av[perfil]
    return { fase: x.fase, hechas: x.hechas ?? 0, total: x.total ?? null, faltan_s: x.faltan_s ?? null, modo: x.modo ?? null }
  }
  // 1.3.9: una cuenta que sigue mandando avance está trabajando aunque la traída pase de TRAIDA_EN_CURSO_MIN (línea
  // lenta): el botón no se libera hasta que termine o deje de dar señal.
  const pendiente = (!!p.vigente || faltan.some(l => avanceVivo(l.perfil))) && (perfiles.length ? faltan.length > 0 : Object.keys(res).length === 0)
  const nombre = (perfil: string, r?: Resultado) => r?.cuenta ?? perfiles.find(l => l.perfil === perfil)?.cuenta ?? perfil
  const cuentas: CuentaTraida[] = [
    ...Object.entries(res).map(([perfil, r]) => ({ perfil, nombre: nombre(perfil, r), hecho: true, ok: r.ok !== false, error: r.error ?? null,
      nuevas: r.nuevas ?? 0, vistas: r.vistas ?? 0, pesos: r.pesos ?? null, segundos: r.segundos ?? null, modo: r.modo ?? null })),
    ...faltan.map(l => ({ perfil: l.perfil as string, nombre: nombre(l.perfil), hecho: false, ok: false, error: null, nuevas: 0, vistas: 0, pesos: null,
      lenta: !!l.conectado && !avanceVivo(l.perfil) && (p.edad_s ?? 0) >= (l.manda_avance ? TOMA_MIN : LENTA_MIN) * 60,
      sin_senal: !l.conectado && !avanceVivo(l.perfil) && (p.edad_s ?? 0) >= SIN_SENAL_MIN * 60,
      avance: avanceDe(l.perfil) })),
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
export const ERROR_OCUPADA = 'Ya hay una traída de MercadoEnvíos en curso: espera a que termine (suele tardar 1 a 3 minutos).'
