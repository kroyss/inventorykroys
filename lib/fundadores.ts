// Programa Fundadores: preguntas, puntaje y descarte (página pública /fundadores).
//
// Decidido con el dueño (2026-10-01): 10 pioneros en 3 tandas (4 + 3 + 3), 1 mes gratis.
// Requisito: movimiento real. Menos de 30 ventas al mes = descartado en la ronda (sin
// decírselo en pantalla: el mensaje es el mismo para todos, así nadie sabe qué respuesta lo
// dejó afuera). El resto se ordena por puntaje y el dueño aprueba desde Plataforma.

export interface Opcion { valor: string; texto: string; puntos: number; descarta?: boolean }
// multiple: se marcan varias (se guardan separadas por coma y suman los puntos de cada una).
export interface Pregunta { campo: 'ventas_mes' | 'cuentas' | 'despacho' | 'dolor' | 'inventario'; texto: string; opciones: Opcion[]; multiple?: boolean }

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
    campo: 'despacho', texto: '¿Cómo despachas la mayoría de tus ventas?',
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
  {
    campo: 'inventario', texto: '¿Cómo llevas tu inventario hoy?',
    opciones: [
      { valor: 'excel', texto: 'En Excel o un cuaderno', puntos: 1 },
      { valor: 'nada', texto: 'No lo llevo', puntos: 1 },
      { valor: 'sistema_basico', texto: 'En otro sistema o app no oficial', puntos: 1 },
      { valor: 'facturacion_oficial', texto: 'En un sistema de facturación oficial', puntos: 0 },
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

export const RONDA_ACTUAL = 1
