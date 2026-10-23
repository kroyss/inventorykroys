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
type FiltroUso = 'todos' | 'sin_conectar' | 'por_vencer' | 'dormidos'
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
export interface BaseCliente { id: number; nombre: string; detalle: string; cuenta: ReactNode; activa: boolean; porVencer: boolean }

export const CEROS = {
  propia: false, cuentas: null, ventas: 0, preguntas: 0, preguntas_sistema: 0, guias: 0, reportadas: 0, calificadas: 0,
  calificadas_sistema: 0, mensajes_sistema: 0, stock: 0, ia: 0, usuarios_7d: 0, ultimo_uso: null, abierta_at: null,
  en_linea: false, abierta: false, telegram: false, pagos_me: null,
}

const FILTROS_USO: { k: FiltroUso; t: string }[] = [
  { k: 'todos', t: 'Todos' }, { k: 'sin_conectar', t: 'Sin conectar ML' },
  { k: 'por_vencer', t: 'Por vencer' }, { k: 'dormidos', t: 'Dormidos (7+ días sin entrar)' },
]

/** Plataforma → Clientes: la lista de empresas con su uso. Tocar una fila abre su ficha (onAbrir). */
export default function AdopcionPanel({ base, onAbrir, abierta }: { base: BaseCliente[]; onAbrir: (id: number) => void; abierta: number | null }) {
  const [dias, setDias] = useState(7)
  const [lista, setLista] = useState<Empresa[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtroUso, setFiltroUso] = useState<FiltroUso>('todos')
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
    todos: () => true, dormidos: esDormido, sin_conectar: x => !x.e.cuentas, por_vencer: x => x.b.porVencer,
  }
  const maxAct = Math.max(1, ...clientes.map(x => x.act))
  const ordenar = (x: typeof filas[number], y: typeof filas[number]) =>
    orden === 'nombre' ? x.b.nombre.localeCompare(y.b.nombre)
      : orden === 'ventas' ? y.e.ventas - x.e.ventas
      : orden === 'ultimo' ? diasSin(x.e.ultimo_uso ?? x.e.abierta_at) - diasSin(y.e.ultimo_uso ?? y.e.abierta_at)
      : y.act - x.act || diasSin(x.e.ultimo_uso) - diasSin(y.e.ultimo_uso)
  // Tu empresa arriba como referencia; las desactivadas al final; el resto según el orden elegido.
  const vistas = filas.filter(x => x.e.propia || pasa[filtroUso](x))
    .sort((x, y) => Number(y.e.propia) - Number(x.e.propia) || Number(y.b.activa) - Number(x.b.activa) || ordenar(x, y))

  const TARJETAS: [string, number, string][] = [
    ['Lo usaron', clientes.filter(esActivo).length, `hicieron algo en el sistema en ${dias} días`],
    ['Dormidos', clientes.filter(esDormido).length, 'más de 7 días sin entrar'],
    ['Sin conectar ML', clientes.filter(x => !x.e.cuentas).length, 'no pueden usar nada aún'],
    ['Integrados', clientes.filter(x => x.n === 'integrado').length, 'preguntas y guías por el sistema'],
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TARJETAS.map(([t, n, d]) => (
          <div key={t} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-neutral-500">{t}</p>
            <p className="text-2xl font-semibold tabular-nums text-neutral-900">{n}<span className="text-sm font-normal text-neutral-400"> / {clientes.length}</span></p>
            <p className="text-[11px] text-neutral-400">{d}</p>
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

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr className="[&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium">
              <th>Empresa</th><th>Cuenta</th><th>Último uso</th><th>Actividad ({dias} días)</th><th>Qué usa</th><th>Uso</th><th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {vistas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-neutral-400">Ninguna empresa con ese filtro.</td></tr>
            )}
            {vistas.map(({ b, e, n, act }) => {
              const paso = b.activa ? siguiente(e, n) : null
              return (
                <tr key={b.id} onClick={() => onAbrir(b.id)}
                  className={`cursor-pointer align-top hover:bg-neutral-50 ${abierta === b.id ? 'bg-lime-50/60' : e.propia ? 'bg-lime-50/30' : ''} ${b.activa ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-neutral-900">{b.nombre}{e.propia && <span className="ml-1.5 rounded bg-neutral-900 px-1.5 py-px text-[10px] font-semibold text-white">TÚ</span>}</div>
                    <div className="text-[11px] text-neutral-400">{b.detalle}</div>
                    <div className="max-w-[14rem] truncate text-[11px] text-neutral-400" title={e.cuentas ?? ''}>{e.cuentas ?? 'sin cuenta de ML'}</div>
                  </td>
                  <td className="px-3 py-2.5">{b.cuenta}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {e.en_linea ? <span className="font-medium text-emerald-700"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />usando ahora</span>
                      : <span className={diasSin(e.ultimo_uso ?? e.abierta_at) > 7 ? 'text-red-600' : 'text-neutral-600'}>{e.ultimo_uso ? hace(e.ultimo_uso) : e.abierta_at ? `entró ${hace(e.abierta_at)}` : 'nunca'}</span>}
                    {!e.en_linea && e.abierta && <div className="text-[11px] text-neutral-400"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-neutral-300" />pestaña abierta</div>}
                    <div className="text-[11px] text-neutral-400">{e.usuarios_7d} persona{e.usuarios_7d === 1 ? '' : 's'} en 7 d</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex min-w-[7rem] items-center gap-2" title={`${act} cosas hechas en el sistema en ${dias} días`}>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-lime-500" style={{ width: `${e.propia ? 100 : Math.round((act / maxAct) * 100)}%` }} />
                      </div>
                      <b className="tabular-nums text-xs text-neutral-800">{act}</b>
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-400">{e.ventas} ventas en ML</div>
                  </td>
                  <td className="px-3 py-2.5"><UsoChips e={e} /></td>
                  <td className="px-3 py-2.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${NIVEL[n].c}`}>{NIVEL[n].t}</span>
                    {paso && !e.propia && <div className="mt-1 max-w-[12rem] text-[11px] text-neutral-500">→ {paso}</div>}
                  </td>
                  <td className="px-2 py-2.5 text-neutral-300">›</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400">
        Actividad: todo lo hecho en el sistema en {dias} días (preguntas y mensajes respondidos, guías impresas y reportadas,
        calificaciones, stock e IA). Integrado: responde la mitad o más de las preguntas aquí y pasa la mitad o más de las ventas por
        Despachos. “Último uso” es cuando tocó algo de verdad, no la pestaña abierta (se mide desde el 15/10).
      </p>
    </div>
  )
}
