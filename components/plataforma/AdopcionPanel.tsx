'use client'
import { useEffect, useState, type ReactNode } from 'react'

// Plataforma → Clientes (2026-10-15; 17-10 ordenado por actividad): quién usa el sistema y qué usa. De cada
// empresa, lo que hizo EN el sistema en el período (preguntas, mensajes, guías, reportes, calificaciones,
// stock, IA) y cuándo lo usó por última vez. API: /api/plataforma/adopcion.

export interface Empresa {
  id: number; nombre: string; propia: boolean; estado: string; fundador: boolean; prueba_hasta: string | null
  inventario: boolean; cuentas: string | null; conectada_at: string | null
  ventas: number; preguntas: number; preguntas_sistema: number; guias: number; reportadas: number
  calificadas: number; calificadas_sistema: number; mensajes_sistema: number; stock: number; ia: number
  usuarios_7d: number; ultimo_uso: string | null; abierta_at: string | null; en_linea: boolean; abierta: boolean
  telegram: boolean            // vinculó los avisos por Telegram
  pagos_me: number | null      // pagos de MercadoEnvíos verificados en el período (null = sin el módulo)
  pagos_me_estado?: 'vinculado' | 'intento' | 'sin_intentar' | null   // en qué quedó la conexión (23-10)
}
type Nivel = 'integrado' | 'parcial' | 'sin_uso' | 'no_entra' | 'sin_ventas' | 'sin_conectar'
export type FiltroUso = 'todos' | 'pagando' | 'prueba' | 'sin_conectar' | 'por_vencer' | 'dormidos'
type Orden = 'actividad' | 'ultimo' | 'ventas' | 'nombre'

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : null)
export const hace = (f: string | null) => {
  if (!f) return 'nunca'
  const min = Math.round((Date.now() - new Date(f).getTime()) / 60_000)
  if (min < 60) return min < 2 ? 'recién' : `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}
export const diasSin = (f: string | null) => (f ? (Date.now() - new Date(f).getTime()) / 86_400_000 : Infinity)

/** Todo lo que hizo EN el sistema en el período (lo que ordena "los más activos"). */
export const actividad = (e: Pick<Empresa, 'preguntas_sistema' | 'mensajes_sistema' | 'guias' | 'reportadas' | 'calificadas_sistema' | 'stock' | 'ia'>) =>
  e.preguntas_sistema + e.mensajes_sistema + e.guias + e.reportadas + e.calificadas_sistema + e.stock + e.ia

const PAGOS_ME_ESTADO = {
  vinculado:    { t: 'Pagos ME vinculado ✓', c: 'bg-emerald-50 text-emerald-800 ring-emerald-200', ayuda: 'El Asistente de envíos se conectó al menos una vez (o ya trajo pagos)' },
  intento:      { t: 'Pagos ME: lo intentó', c: 'bg-amber-50 text-amber-800 ring-amber-200', ayuda: 'Generó el código o instaló el programa, pero el Asistente nunca se conectó en Chrome' },
  sin_intentar: { t: 'Pagos ME: sin intentar', c: 'bg-neutral-50 text-neutral-500 ring-neutral-200', ayuda: 'Tiene el módulo activo, pero nunca generó el código ni instaló nada' },
} as const

/** Qué usa, en una línea corta (12-11: la fila compacta; antes una columna de chips). */
export const queUsa = (e: Empresa) => ([
  ['preguntas', e.preguntas_sistema], ['mensajes', e.mensajes_sistema], ['guías', e.guias], ['reportes', e.reportadas],
  ['calificaciones', e.calificadas_sistema], ['stock', e.stock], ['IA', e.ia], ['pagos ME', e.pagos_me ?? 0],
] as [string, number][]).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(' · ')

/** Lo 3 que más usó, para la fila (todo en el title). */
const usoCorto = (e: Empresa) => ([
  ['preguntas', e.preguntas_sistema], ['mensajes', e.mensajes_sistema], ['guías', e.guias], ['reportes', e.reportadas],
  ['calificaciones', e.calificadas_sistema], ['stock', e.stock], ['IA', e.ia], ['pagos ME', e.pagos_me ?? 0],
] as [string, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${n} ${t}`).join(' · ')

/** Por qué un cliente pide atención hoy (lo más urgente primero); null = va bien. 13-11 (el dueño). */
type Motivo = { t: string; grave: boolean }
function motivo(b: BaseCliente, e: Empresa, n: Nivel): Motivo | null {
  if (b.vence != null && b.vence <= 5) return { t: b.vence < 0 ? 'Venció' : b.vence === 0 ? 'Vence hoy' : `Vence en ${b.vence} día${b.vence === 1 ? '' : 's'}`, grave: b.vence <= 1 }
  if (n === 'sin_conectar') return { t: 'No conectó MercadoLibre', grave: false }
  if (n === 'no_entra') return { t: `No entra (${hace(e.ultimo_uso ?? e.abierta_at)})`, grave: true }
  if (n === 'sin_uso') return { t: 'Entra pero no usa nada', grave: true }
  return null
}

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '').replace(/^0/, '58')}`

/** Qué usa, con cuántas veces (solo lo que usó). */
export function UsoChips({ e }: { e: Empresa }) {
  const usos: [string, number, string][] = [
    ['Preguntas', e.preguntas_sistema, `${e.preguntas_sistema} de ${e.preguntas} preguntas respondidas desde el sistema`],
    ['Mensajes', e.mensajes_sistema, 'Mensajes respondidos desde el sistema'],
    ['Despachos', e.guias, `${e.guias} de ${e.ventas} ventas con guía impresa en Despachos`],
    ['Reportador', e.reportadas, 'Guías reportadas con Reportador'],
    ['Calificaciones', e.calificadas_sistema, `${e.calificadas_sistema} de ${e.calificadas} calificaciones hechas desde el sistema`],
    ['Stock', e.stock, 'Cambios de stock desde el sistema'],
    ['IA', e.ia, 'Borradores con IA'],
    ['Pagos ME', e.pagos_me ?? 0, 'Pagos de MercadoEnvíos verificados en el sistema'],
  ]
  const usados = usos.filter(([, n]) => n > 0)
  // Sin uso en el período pero con algo encendido: se dice igual (Telegram, o Pagos ME activo sin pagos aún).
  const pagosSinUso = e.pagos_me === 0
  const conexion = e.pagos_me_estado ? PAGOS_ME_ESTADO[e.pagos_me_estado] : null
  if (!usados.length && !e.telegram && !pagosSinUso && !conexion) return <span className="text-[11px] text-neutral-400">nada en el período</span>
  return (
    <div className="flex flex-wrap gap-1">
      {usados.map(([t, n, ayuda]) => (
        <span key={t} title={ayuda} className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
          {t} <b className="tabular-nums">{n}</b>
        </span>
      ))}
      {conexion && <span title={conexion.ayuda} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${conexion.c}`}>{conexion.t}</span>}
      {e.telegram && <span title="Vinculó los avisos por Telegram" className="whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">Telegram ✓</span>}
      {pagosSinUso && <span title="Tiene Pagos ME activo pero no verificó pagos en el período" className="whitespace-nowrap rounded-full bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-400 ring-1 ring-inset ring-neutral-200">Pagos ME 0</span>}
    </div>
  )
}

function nivel(e: Empresa): Nivel {
  if (!e.cuentas) return 'sin_conectar'
  if (e.ventas === 0) return 'sin_ventas'
  // ultimo_uso se mide desde el 15/10: si falta, la última actividad (con pestaña abierta) es el tope.
  if (diasSin(e.ultimo_uso ?? e.abierta_at) > 7) return 'no_entra'
  const p = pct(e.preguntas_sistema, e.preguntas) ?? 0, g = pct(e.guias, e.ventas) ?? 0
  if (p >= 50 && g >= 50) return 'integrado'
  if (actividad(e) > 0) return 'parcial'
  return 'sin_uso'
}
const NIVEL: Record<Nivel, { t: string; c: string }> = {
  integrado:    { t: 'Integrado', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  parcial:      { t: 'A medias', c: 'bg-amber-50 text-amber-800 ring-amber-200' },
  sin_uso:      { t: 'No lo usa', c: 'bg-red-50 text-red-700 ring-red-200' },
  no_entra:     { t: 'No entra', c: 'bg-red-50 text-red-700 ring-red-200' },
  sin_ventas:   { t: 'Sin ventas', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200' },
  sin_conectar: { t: 'Sin conectar ML', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200' },
}

/** Lo siguiente que le conviene hacer (lo más flojo primero). */
function siguiente(e: Empresa, n: Nivel) {
  if (n === 'sin_conectar') return 'Conectar su cuenta de MercadoLibre'
  if (n === 'sin_ventas') return null
  if (n === 'no_entra') return `No entra ${hace(e.ultimo_uso ?? e.abierta_at)}: llamarlo`
  const g = pct(e.guias, e.ventas) ?? 0, p = pct(e.preguntas_sistema, e.preguntas) ?? 0
  if (g < 30) return 'Pasar las guías por Despachos'
  if (e.reportadas < e.guias * 0.8) return 'Reportar las guías con Reportador'
  if (p < 30) return 'Responder las preguntas desde el sistema'
  if (e.calificadas_sistema === 0) return 'Prender la calificación automática'
  return null
}

/** Una empresa de la lista de Plataforma (búsqueda y estado de la cuenta los pone PlataformaClient; 20-10 aquí
 *  solo llegan las que pueden entrar: las inactivas van plegadas aparte). porVencer = le quedan ≤ 5 días. */
export interface BaseCliente {
  id: number; nombre: string; detalle: string; cuenta: ReactNode; activa: boolean; porVencer: boolean; extra?: ReactNode
  pagando?: boolean; prueba?: boolean
  interna?: boolean            // 13-11: va con «Tuyas e internas», nunca en «Para atender»
  vence?: number | null        // días que le quedan (plan o prueba); null = no vence o no aplica
  whatsapp?: string | null     // contacto (ficha → Contacto): botón directo en la fila
  telegram?: string | null
}

export const CEROS = {
  propia: false, cuentas: null, ventas: 0, preguntas: 0, preguntas_sistema: 0, guias: 0, reportadas: 0, calificadas: 0,
  calificadas_sistema: 0, mensajes_sistema: 0, stock: 0, ia: 0, usuarios_7d: 0, ultimo_uso: null, abierta_at: null,
  en_linea: false, abierta: false, telegram: false, pagos_me: null,
}

const FILTROS_USO: { k: FiltroUso; t: string }[] = [
  { k: 'todos', t: 'Todos' }, { k: 'pagando', t: 'Pagando' }, { k: 'prueba', t: 'En prueba' }, { k: 'por_vencer', t: 'Por vencer' },
  { k: 'sin_conectar', t: 'Sin ML' }, { k: 'dormidos', t: 'Dormidos' },
]

/** Plataforma → Clientes: la lista de empresas con su uso. Tocar una fila abre su ficha (onAbrir). */
/** Lo cobrado (Plataforma → Clientes, 13-11): sale de /api/plataforma/cobros. */
export interface ResumenCobro { mes: number; pagos_mes: number; anterior: number; recurrente: number }
// Columnas de la fila en escritorio (en móvil la fila es una tarjeta apilada). Literales: Tailwind las lee del código.
const COLS = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_6.5rem_minmax(0,1.3fr)_minmax(0,1.1fr)_4.5rem]'
const COLS_MD = 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_6.5rem_minmax(0,1.3fr)_minmax(0,1.1fr)_4.5rem]'
const usd = (n: number) => `$${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`

export default function AdopcionPanel({ base, onAbrir, abierta, filtro, onFiltro, cobro = null }: {
  base: BaseCliente[]; onAbrir: (id: number) => void; abierta: number | null
  filtro: FiltroUso; onFiltro: (f: FiltroUso) => void; cobro?: ResumenCobro | null }) {
  const [dias, setDias] = useState(7)
  const [lista, setLista] = useState<Empresa[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filtroUso = filtro, setFiltroUso = onFiltro
  const [orden, setOrden] = useState<Orden>('actividad')

  useEffect(() => {
    let vivo = true
    fetch(`/api/plataforma/adopcion?dias=${dias}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (r.ok) { setLista(d.empresas); setError(null) } else setError(d.error ?? 'No se pudo cargar')
    })
    return () => { vivo = false }
  }, [dias])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!lista) return <div className="h-64 animate-pulse rounded-xl bg-neutral-100" />

  // Cada empresa de la lista con su uso (las desactivadas no tienen: van en cero).
  const uso = new Map(lista.map(e => [e.id, e]))
  const filas = base.map(b => {
    const e = { ...CEROS, ...uso.get(b.id), id: b.id, nombre: b.nombre } as Empresa
    return { b, e, n: nivel(e), act: actividad(e) }
  })
  const clientes = filas.filter(x => !x.e.propia && x.b.activa)
  const esActivo = (x: typeof filas[number]) => x.act > 0
  const esDormido = (x: typeof filas[number]) => !!x.e.cuentas && diasSin(x.e.ultimo_uso ?? x.e.abierta_at) > 7
  const pasa: Record<FiltroUso, (x: typeof filas[number]) => boolean> = {
    todos: () => true, pagando: x => !!x.b.pagando, prueba: x => !!x.b.prueba, dormidos: esDormido, sin_conectar: x => !x.e.cuentas, por_vencer: x => x.b.porVencer,
  }
  const maxAct = Math.max(1, ...clientes.map(x => x.act))
  const ordenar = (x: typeof filas[number], y: typeof filas[number]) =>
    orden === 'nombre' ? x.b.nombre.localeCompare(y.b.nombre)
      : orden === 'ventas' ? y.e.ventas - x.e.ventas
      : orden === 'ultimo' ? diasSin(x.e.ultimo_uso ?? x.e.abierta_at) - diasSin(y.e.ultimo_uso ?? y.e.abierta_at)
      : y.act - x.act || diasSin(x.e.ultimo_uso) - diasSin(y.e.ultimo_uso)
  // 13-11 (el dueño): agrupada por lo que pide de ti. Para atender (vence, sin ML, no entra, no usa nada) primero y con
  // el motivo a la vista; después los que van bien; tus empresas e internas al final, como referencia.
  const vistas = filas.filter(x => x.e.propia || pasa[filtroUso](x))
    .map(x => ({ ...x, m: x.e.propia || x.b.interna ? null : motivo(x.b, x.e, x.n) }))
  const grupos: { k: string; t: string; ayuda: string; filas: typeof vistas }[] = [
    { k: 'atender', t: 'Para atender', ayuda: 'vence pronto, sin MercadoLibre, no entra o no usa nada',
      filas: vistas.filter(x => x.m).sort((x, y) => Number(y.m!.grave) - Number(x.m!.grave) || ordenar(x, y)) },
    { k: 'bien', t: 'Van bien', ayuda: 'entran y usan el sistema', filas: vistas.filter(x => !x.m && !x.e.propia && !x.b.interna).sort(ordenar) },
    { k: 'tuyas', t: 'Tuyas e internas', ayuda: 'referencia: no pagan ni vencen', filas: vistas.filter(x => x.e.propia || x.b.interna).sort(ordenar) },
  ]

  // 12-11 (el dueño): lo que mira seguido, en 4 números.
  const enLinea = clientes.filter(x => x.e.en_linea)
  const conectados = clientes.filter(x => x.e.cuentas)
  const TARJETAS: [string, ReactNode, string, boolean?][] = [
    ['En línea ahora', enLinea.length, enLinea.length ? enLinea.map(x => x.b.nombre).join(', ') : 'ningún cliente usando ahora', enLinea.length > 0],
    [`Lo usaron (${dias} días)`, <>{clientes.filter(esActivo).length}<span className="text-sm font-normal text-neutral-400"> / {conectados.length}</span></>, 'de los que tienen ML conectado'],
    ['Pagando', clientes.filter(x => x.b.pagando).length, cobro ? `≈ ${usd(cobro.recurrente)} al mes con sus planes` : `${clientes.filter(x => x.b.pagando && esActivo(x)).length} lo usaron en ${dias} días`],
    ['Cobrado este mes', cobro ? usd(cobro.mes) : '—', cobro ? `${cobro.pagos_mes} pago${cobro.pagos_mes === 1 ? '' : 's'} · mes anterior ${usd(cobro.anterior)}` : ''],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TARJETAS.map(([t, n, d, vivo]) => (
          <div key={t} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs text-neutral-500">{vivo && <span className="h-2 w-2 rounded-full bg-emerald-500" />}{t}</p>
            <p className="text-2xl font-semibold tabular-nums text-neutral-900">{n}</p>
            <p className="truncate text-[11px] text-neutral-400" title={d}>{d}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_USO.map(f => (
            <button key={f.k} onClick={() => setFiltroUso(f.k)}
              className={`rounded-full border px-3 py-1 text-xs ${filtroUso === f.k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}>
              {f.t} <span className="opacity-60">{clientes.filter(pasa[f.k]).length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-neutral-500">Ordenar
            <select value={orden} onChange={e => setOrden(e.target.value as Orden)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-800">
              <option value="actividad">Más activos</option>
              <option value="ultimo">Último uso</option>
              <option value="ventas">Ventas</option>
              <option value="nombre">Nombre</option>
            </select>
          </label>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDias(d)}
                className={`rounded-full border px-2.5 py-1 font-medium ${dias === d ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}>
                {d} días
              </button>
            ))}
          </div>
        </div>
      </div>

      {vistas.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400">Ninguna empresa con ese filtro.</p>}

      {grupos.filter(g => g.filas.length).map(g => (
        <section key={g.k} className="space-y-1.5">
          <h3 className="flex items-baseline gap-2 px-1">
            <span className={`text-xs font-semibold uppercase tracking-wide ${g.k === 'atender' ? 'text-amber-700' : 'text-neutral-500'}`}>{g.t}</span>
            <span className="text-xs font-semibold tabular-nums text-neutral-400">{g.filas.length}</span>
            <span className="hidden text-[11px] text-neutral-400 sm:inline">· {g.ayuda}</span>
          </h3>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className={`hidden ${COLS} gap-4 border-b border-neutral-100 bg-neutral-50 px-4 py-1.5 text-[11px] font-medium text-neutral-500 md:grid`}>
              <span>Cliente</span><span>Cuenta</span><span>Último uso</span><span>Actividad ({dias} días)</span><span>{g.k === 'atender' ? 'Qué pasa' : 'Uso'}</span><span />
            </div>
            <ul className="divide-y divide-neutral-100">
              {g.filas.map(({ b, e, n, act, m }) => {
                const paso = b.activa && !e.propia ? siguiente(e, n) : null
                const color = m ? (m.grave ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800')
                  : e.propia || b.interna ? 'bg-neutral-900 text-white'
                  : n === 'integrado' ? 'bg-emerald-100 text-emerald-800' : n === 'parcial' ? 'bg-lime-100 text-lime-800' : 'bg-neutral-100 text-neutral-500'
                const dormido = !!e.cuentas && diasSin(e.ultimo_uso ?? e.abierta_at) > 7
                return (
                  <li key={b.id} role="button" tabIndex={0} onClick={() => onAbrir(b.id)}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir(b.id) } }}
                    className={`group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 outline-none transition-colors hover:bg-neutral-50 focus-visible:bg-lime-50 md:gap-4 ${COLS_MD} ${abierta === b.id ? 'bg-lime-50/70' : ''}`}>
                    {/* Cliente */}
                    <div className="flex min-w-0 items-start gap-3">
                      <span aria-hidden className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}>{b.nombre.trim().charAt(0).toUpperCase()}</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-900">{b.nombre}{e.propia && <span className="ml-1.5 rounded bg-neutral-900 px-1.5 py-px align-middle text-[10px] font-semibold text-white">TÚ</span>}</div>
                        <div className="truncate text-[11px] text-neutral-400" title={[b.detalle, e.cuentas].filter(Boolean).join(' · ')}>{b.detalle}{e.cuentas ? ` · ${e.cuentas}` : ''}</div>
                        {b.extra}
                      </div>
                    </div>
                    {/* Contacto directo (móvil: arriba a la derecha; escritorio: al final) */}
                    <div className="flex items-center justify-end gap-0.5 md:order-last">
                      {b.whatsapp && <a href={waLink(b.whatsapp)} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} title={`WhatsApp ${b.whatsapp}`} aria-label={`WhatsApp de ${b.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-50">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3a.4.4 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" /></svg>
                      </a>}
                      {b.telegram && <a href={`https://t.me/${b.telegram}`} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} title={`Telegram @${b.telegram}`} aria-label={`Telegram de ${b.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sky-600 hover:bg-sky-50">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M21.4 4.3 2.9 11.4c-1.3.5-1.3 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.4ZM8.8 14l9.6-6.1c.5-.3.9-.1.5.2l-8.2 7.4-.3 3.5L8.8 14Z" /></svg>
                      </a>}
                      <span aria-hidden className="hidden w-4 text-center text-neutral-300 group-hover:text-neutral-500 md:inline">›</span>
                    </div>
                    {/* Cuenta */}
                    <div className="col-span-2 min-w-0 pl-11 md:col-span-1 md:pl-0">{b.cuenta}</div>
                    {/* Último uso */}
                    <div className="col-span-2 flex items-baseline gap-2 pl-11 text-xs md:col-span-1 md:block md:pl-0">
                      {e.en_linea
                        ? <span className="font-medium text-emerald-700"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />ahora</span>
                        : <span className={dormido ? 'font-medium text-red-600' : 'text-neutral-700'}>{e.ultimo_uso ? hace(e.ultimo_uso) : e.abierta_at ? `entró ${hace(e.abierta_at)}` : 'nunca'}</span>}
                      {e.usuarios_7d > 1 && <div className="text-[11px] text-neutral-400">{e.usuarios_7d} personas</div>}
                    </div>
                    {/* Actividad */}
                    <div className="col-span-2 min-w-0 pl-11 md:col-span-1 md:pl-0" title={`${act} cosas hechas en el sistema en ${dias} días${queUsa(e) ? `: ${queUsa(e)}` : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                          <div className="h-full rounded-full bg-lime-500" style={{ width: `${e.propia ? 100 : Math.round((act / maxAct) * 100)}%` }} />
                        </div>
                        <b className="w-12 text-right text-xs tabular-nums text-neutral-800">{act.toLocaleString('de-DE')}</b>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-neutral-400">{e.ventas} ventas{usoCorto(e) ? ` · ${usoCorto(e)}` : ''}</div>
                    </div>
                    {/* Qué pasa / Uso */}
                    <div className="col-span-2 min-w-0 pl-11 md:col-span-1 md:pl-0">
                      {m
                        ? <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.grave ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>{m.t}</span>
                        : !e.propia && <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${NIVEL[n].c}`}>{NIVEL[n].t}</span>}
                      {paso && <div className="mt-1 text-[11px] leading-snug text-neutral-500">→ {paso}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      ))}

      <p className="text-[11px] text-neutral-400">
        Actividad: todo lo hecho en el sistema en {dias} días (preguntas y mensajes respondidos, guías impresas y reportadas,
        calificaciones, stock e IA). Integrado: responde la mitad o más de las preguntas aquí y pasa la mitad o más de las ventas por
        Despachos. “Último uso” es cuando tocó algo de verdad, no la pestaña abierta (se mide desde el 15/10).
      </p>
    </div>
  )
}
