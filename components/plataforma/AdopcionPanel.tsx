'use client'
import { useEffect, useState } from 'react'

// Plataforma → Uso (2026-10-15): quién se integró de verdad. De cada empresa, cuánto hace EN el sistema
// contra el total en MercadoLibre, para saber con quién hablar. API: /api/plataforma/adopcion.

interface Empresa {
  id: number; nombre: string; propia: boolean; estado: string; fundador: boolean; prueba_hasta: string | null
  inventario: boolean; cuentas: string | null; conectada_at: string | null
  ventas: number; preguntas: number; preguntas_sistema: number; guias: number; reportadas: number
  calificadas: number; calificadas_sistema: number; mensajes_sistema: number; stock: number; ia: number
  usuarios_7d: number; ultimo_uso: string | null; abierta_at: string | null; en_linea: boolean; abierta: boolean
}
type Nivel = 'integrado' | 'parcial' | 'sin_uso' | 'no_entra' | 'sin_ventas' | 'sin_conectar'

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : null)
const hace = (f: string | null) => {
  if (!f) return 'nunca'
  const min = Math.round((Date.now() - new Date(f).getTime()) / 60_000)
  if (min < 60) return min < 2 ? 'recién' : `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}
const diasSin = (f: string | null) => (f ? (Date.now() - new Date(f).getTime()) / 86_400_000 : Infinity)

function nivel(e: Empresa): Nivel {
  if (!e.cuentas) return 'sin_conectar'
  if (e.ventas === 0) return 'sin_ventas'
  // ultimo_uso se mide desde el 15/10: si falta, la última actividad (con pestaña abierta) es el tope.
  if (diasSin(e.ultimo_uso ?? e.abierta_at) > 7) return 'no_entra'
  const p = pct(e.preguntas_sistema, e.preguntas) ?? 0, g = pct(e.guias, e.ventas) ?? 0
  if (p >= 50 && g >= 50) return 'integrado'
  if (e.preguntas_sistema + e.guias + e.calificadas_sistema + e.mensajes_sistema + e.stock > 0) return 'parcial'
  return 'sin_uso'
}
const NIVEL: Record<Nivel, { t: string; c: string; orden: number }> = {
  integrado:    { t: 'Integrado', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200', orden: 3 },
  parcial:      { t: 'A medias', c: 'bg-amber-50 text-amber-800 ring-amber-200', orden: 2 },
  sin_uso:      { t: 'No lo usa', c: 'bg-red-50 text-red-700 ring-red-200', orden: 1 },
  no_entra:     { t: 'No entra', c: 'bg-red-50 text-red-700 ring-red-200', orden: 0 },
  sin_ventas:   { t: 'Sin ventas', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200', orden: 4 },
  sin_conectar: { t: 'Sin conectar ML', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200', orden: 5 },
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

function Medidor({ a, b, titulo }: { a: number; b: number; titulo: string }) {
  const p = pct(a, b)
  return (
    <div className="min-w-[6.5rem]" title={`${titulo}: ${a} de ${b}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-semibold tabular-nums ${p == null ? 'text-neutral-300' : p >= 50 ? 'text-emerald-700' : p >= 20 ? 'text-amber-700' : 'text-red-600'}`}>
          {p == null ? '—' : `${p}%`}
        </span>
        <span className="text-[11px] text-neutral-400 tabular-nums">{a}/{b}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${p == null ? '' : p >= 50 ? 'bg-emerald-500' : p >= 20 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${p ?? 0}%` }} />
      </div>
    </div>
  )
}

export default function AdopcionPanel() {
  const [dias, setDias] = useState(14)
  const [lista, setLista] = useState<Empresa[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const clientes = lista.filter(e => !e.propia)
  const conNivel = lista.map(e => ({ e, n: nivel(e) }))
  const cuenta = (n: Nivel) => conNivel.filter(x => !x.e.propia && x.n === n).length
  // Los que piden atención primero; la propia arriba como referencia.
  const orden = [...conNivel].sort((x, y) => Number(y.e.propia) - Number(x.e.propia) || NIVEL[x.n].orden - NIVEL[y.n].orden || y.e.ventas - x.e.ventas)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500 max-w-2xl">
          Cuánto hace cada cliente <b className="text-neutral-700">en el sistema</b> contra el total en MercadoLibre. Si una parte la hace
          aquí y otra allá, se ve en los porcentajes. “Último uso” es cuando tocó algo de verdad (no la pestaña abierta).
        </p>
        <div className="flex gap-1">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDias(d)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${dias === d ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}>
              {d} días
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['integrado', 'usan casi todo aquí'], ['parcial', 'una parte aquí y otra allá'], ['sin_uso', 'venden pero no usan nada'], ['no_entra', 'más de 7 días sin entrar']] as const).map(([n, d]) => (
          <div key={n} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-neutral-500">{NIVEL[n].t}</p>
            <p className="text-2xl font-semibold tabular-nums text-neutral-900">{cuenta(n)}<span className="text-sm font-normal text-neutral-400"> / {clientes.length}</span></p>
            <p className="text-[11px] text-neutral-400">{d}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr className="[&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium">
              <th>Empresa</th><th>Último uso</th><th className="!text-right">Ventas</th>
              <th>Preguntas aquí</th><th>Guías por Despachos</th><th>Reportadas</th><th>Calificadas aquí</th><th>Otros</th><th>Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orden.map(({ e, n }) => {
              const paso = siguiente(e, n)
              return (
                <tr key={e.id} className={`align-top ${e.propia ? 'bg-lime-50/40' : ''}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-neutral-900">{e.nombre}{e.propia && <span className="ml-1.5 rounded bg-neutral-900 px-1.5 py-px text-[10px] font-semibold text-white">TÚ</span>}</div>
                    <div className="max-w-[14rem] truncate text-[11px] text-neutral-400" title={e.cuentas ?? ''}>{e.cuentas ?? 'sin cuenta de ML'}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {e.en_linea ? <span className="font-medium text-emerald-700"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />usando ahora</span>
                      : <span className={diasSin(e.ultimo_uso ?? e.abierta_at) > 7 ? 'text-red-600' : 'text-neutral-600'}>{e.ultimo_uso ? hace(e.ultimo_uso) : e.abierta_at ? `entró ${hace(e.abierta_at)}` : 'nunca'}</span>}
                    {!e.en_linea && e.abierta && <div className="text-[11px] text-neutral-400"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-neutral-300" />pestaña abierta</div>}
                    <div className="text-[11px] text-neutral-400">{e.usuarios_7d} persona{e.usuarios_7d === 1 ? '' : 's'} en 7 d</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-neutral-800">{e.ventas}</td>
                  <td className="px-3 py-2.5"><Medidor a={e.preguntas_sistema} b={e.preguntas} titulo="Preguntas respondidas desde el sistema" /></td>
                  <td className="px-3 py-2.5"><Medidor a={e.guias} b={e.ventas} titulo="Ventas con guía impresa en Despachos" /></td>
                  <td className="px-3 py-2.5"><Medidor a={e.reportadas} b={e.guias} titulo="Guías reportadas con Reportador" /></td>
                  <td className="px-3 py-2.5"><Medidor a={e.calificadas_sistema} b={e.calificadas} titulo="Calificaciones hechas desde el sistema" /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] text-neutral-500">
                    {[e.mensajes_sistema && `${e.mensajes_sistema} mensajes`, e.stock && `${e.stock} stock`, e.ia && `${e.ia} IA`].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${NIVEL[n].c}`}>{NIVEL[n].t}</span>
                    {paso && !e.propia && <div className="mt-1 max-w-[12rem] text-[11px] text-neutral-500">→ {paso}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400">
        Integrado: responde la mitad o más de las preguntas aquí y pasa la mitad o más de las ventas por Despachos.
        Los porcentajes son de los últimos {dias} días. “Último uso” se empezó a medir el 15/10: antes de eso puede decir “nunca”.
      </p>
    </div>
  )
}
