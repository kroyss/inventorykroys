// Programa Fundadores: preguntas, puntaje y descarte (página pública /fundadores).
//
// Decidido con el dueño (2026-10-01): 10 pioneros en 2 tandas de 5, 1 mes gratis, atención personalizada 1 a 1 y
// configuración + adiestramiento gratis. Cada tanda tiene días fijos de inscripción (4-5 y 11-12 de octubre): solo
// esos días se acepta el formulario y la selección se avisa al día siguiente del cierre (6 y 13).
// Requisito: movimiento real. Menos de 30 ventas al mes = descartado en la ronda (sin
// decírselo en pantalla: el mensaje es el mismo para todos, así nadie sabe qué respuesta lo
// dejó afuera). El resto se ordena por puntaje y el dueño aprueba desde Plataforma.

export interface Opcion { valor: string; texto: string; puntos: number; descarta?: boolean }
// multiple: se marcan varias (se guardan separadas por coma y suman los puntos de cada una).
// ayuda: explicación corta bajo la pregunta (en lugar de "Elige una.").
export interface Pregunta {
  campo: 'ventas_mes' | 'cuentas' | 'despacho' | 'dolor' | 'inventario' | 'compromiso'
  texto: string; ayuda?: string; opciones: Opcion[]; multiple?: boolean
}

export const PREGUNTAS: Pregunta[] = [
  {
    campo: 'ventas_mes', texto: '¿Cuántas ventas haces al mes en MercadoLibre?',
    opciones: [
      { valor: '<30', texto: 'Menos de 30', puntos: 0, descarta: true },
      { valor: '30-100', texto: 'Entre 30 y 100', puntos: 2 },
      { valor: '100-300', texto: 'Entre 100 y 300', puntos: 3 },
      { valor: '300+', texto: 'Más de 300', puntos: 4 },
    ],
  },
  {
    campo: 'cuentas', texto: '¿Cuántas cuentas de MercadoLibre manejas?',
    opciones: [
      { valor: '1', texto: 'Una', puntos: 1 },
      { valor: '2-3', texto: 'Dos o tres', puntos: 2 },
      { valor: '4+', texto: 'Cuatro o más', puntos: 3 },
    ],
  },
  {
    campo: 'despacho', texto: '¿Cómo despachas tus ventas?', multiple: true,
    opciones: [
      { valor: 'zoom_tealca', texto: 'MercadoEnvíos (ZOOM / Tealca)', puntos: 2 },
      { valor: 'retiro', texto: 'Retiro personal', puntos: 0 },
      { valor: 'delivery', texto: 'Delivery propio', puntos: 0 },
      { valor: 'otro', texto: 'Otra forma', puntos: 0 },
    ],
  },
  {
    campo: 'dolor', texto: '¿Qué te quita más tiempo hoy?', multiple: true,
    opciones: [
      { valor: 'preguntas', texto: 'Responder preguntas', puntos: 2 },
      { valor: 'mensajes_guias', texto: 'Mensajes de las ventas y enviar las guías', puntos: 2 },
      { valor: 'stock', texto: 'Llevar el stock y las ventas', puntos: 1 },
      { valor: 'que_vender', texto: 'Saber qué vender o qué traer', puntos: 0 },
    ],
  },
  // Qué usa hoy (columna `inventario`): solo informativa, para preparar la configuración. Lo que
  // pesa es el compromiso de abajo (decidido con el dueño, 2026-10-02): el que no usa nada y el que
  // ya tiene sistema pueden sacar el máximo si se comprometen a llevar TODO aquí.
  {
    campo: 'inventario', texto: '¿Hoy usas algún sistema para llevar tu negocio?',
    opciones: [
      { valor: 'ninguno', texto: 'No, lo llevo en Excel, en un cuaderno o no lo llevo', puntos: 0 },
      { valor: 'facturacion_oficial', texto: 'Sí, un sistema de facturación oficial', puntos: 0 },
      { valor: 'otro_sistema', texto: 'Sí, otro sistema o app', puntos: 0 },
    ],
  },
  {
    campo: 'compromiso', texto: '¿Llevarías tus ventas y tu stock dentro del sistema?',
    ayuda: 'Para que te ahorre tiempo de verdad, tus ventas de MercadoLibre tienen que estar dentro del sistema.',
    opciones: [
      { valor: 'todo', texto: 'Sí, llevaría mis ventas en el sistema', puntos: 3 },
      { valor: 'ademas', texto: 'Ya tengo otro sistema, pero igual cargaría mis ventas aquí', puntos: 3 },
      { valor: 'partes', texto: 'Solo quiero usar algunas partes (preguntas, guías…)', puntos: 0 },
      { valor: 'no', texto: 'Prefiero no cargar mis ventas', puntos: 0, descarta: true },
    ],
  },
]

/** El nick de MercadoLibre es opcional: si lo da, suma 1 (permite verificar su reputación). */
export const PUNTO_NICK = 1
const maximoDe = (p: Pregunta) =>
  p.multiple ? p.opciones.reduce((a, o) => a + o.puntos, 0) : Math.max(...p.opciones.map(o => o.puntos))
export const PUNTAJE_MAXIMO = PREGUNTAS.reduce((a, p) => a + maximoDe(p), 0) + PUNTO_NICK

export type Respuestas = Record<Pregunta['campo'], string>

export function evaluar(r: Respuestas, nick: string | null) {
  let puntaje = nick ? PUNTO_NICK : 0
  let descartada = false
  for (const p of PREGUNTAS) {
    const valores = p.multiple ? (r[p.campo] ?? '').split(',') : [r[p.campo]]
    for (const v of valores) {
      const o = p.opciones.find(x => x.valor === v)
      if (!o) throw new Error(`Respuesta inválida en "${p.texto}"`)
      puntaje += o.puntos
      if (o.descarta) descartada = true
    }
  }
  return { puntaje, estado: descartada ? 'descartado' as const : 'calificado' as const }
}

export const textoOpcion = (campo: Pregunta['campo'], valor: string) => {
  const p = PREGUNTAS.find(x => x.campo === campo)
  return valor.split(',').map(v => p?.opciones.find(o => o.valor === v)?.texto ?? v).join(', ')
}

/** "@Pedro_Ventas " → "pedro_ventas" (también acepta el link t.me/…). */
export function normalizarTelegram(t: string) {
  return t.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^@+/, '').trim().toLowerCase()
}
export const TELEGRAM_RE = /^[a-z0-9_]{5,32}$/

/** Mensaje libre opcional del formulario (corto: no es una carta, es "algo más que quieras contarnos"). */
export const MENSAJE_MAX = 280

export const RONDA_ACTUAL = 1

/** Las fechas del programa son de Venezuela: "hoy" es el día en Caracas, no el del servidor. */
export const TZ_FUNDADORES = 'America/Caracas'

export interface Tanda {
  numero: number; cupos: number; abierta: boolean; tomados: number
  inscribe_desde: string | null; inscribe_hasta: string | null    // 'YYYY-MM-DD'
}

const hastaDe = (t: Tanda) => t.inscribe_hasta ?? t.inscribe_desde

/** La tanda que recibe solicitudes HOY: hoy cae en sus días de inscripción, está abierta y le queda cupo. */
export const tandaInscribiendo = (tandas: Tanda[], hoy: string) =>
  tandas.find(t => t.abierta && t.tomados < t.cupos && t.inscribe_desde != null
    && t.inscribe_desde <= hoy && hoy <= hastaDe(t)!) ?? null

/** La próxima inscripción (después de hoy), para avisar cuándo abre. */
export const proximaInscripcion = (tandas: Tanda[], hoy: string) =>
  tandas.find(t => t.abierta && t.tomados < t.cupos && t.inscribe_desde != null && t.inscribe_desde > hoy) ?? null

/** Día en que se anuncia la selección: el siguiente al cierre de la inscripción. */
export function diaResultados(t: Tanda) {
  const h = hastaDe(t)
  if (!h) return null
  const d = new Date(`${h}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** "domingo 4 de octubre" · "domingo 4 y lunes 5 de octubre" · "del domingo 4 al martes 6 de octubre". */
export function diasInscripcion(t: Tanda) {
  const desde = t.inscribe_desde, hasta = hastaDe(t)
  if (!desde || !hasta) return null
  if (desde === hasta) return fechaTanda(desde)
  const corta = (iso: string) => new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`)).replace(',', '')
  const unDia = Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`) === 86_400_000
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7)
  if (!mismoMes) return `del ${fechaTanda(desde)} al ${fechaTanda(hasta)}`
  return unDia ? `${corta(desde)} y ${fechaTanda(hasta)}` : `del ${corta(desde)} al ${fechaTanda(hasta)}`
}

/** '2026-10-04' → "domingo 4 de octubre" (la columna DATE viaja como texto). */
export function fechaTanda(iso: string | null) {
  if (!iso) return null
  return new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`)).replace(',', '')
}
