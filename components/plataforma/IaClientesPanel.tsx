'use client'
import { useEffect, useState } from 'react'

// Plataforma → Interno → IA automática (09-11): una fila por cliente con la IA automática disponible.
interface Fila {
  id: number; nombre: string; estado: string; plan: string | null; error?: string
  preguntas?: { modo: 'apagado' | 'sombra' | 'real'; desde: string | null; total: number; solas: number }
  mensajes?: { encendido: boolean; desde: string | null; total: number; solas: number; acuses: number }
  creditos?: { usados: number; quedan: number | null }
}

const fecha = (f: string | null) => f ? new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : ''
const pct = (a: number, b: number) => b ? `${Math.round((100 * a) / b)}%` : '—'
const miles = (n: number) => n.toLocaleString('de-DE')

function Estado({ on, prueba, desde }: { on: boolean; prueba?: boolean; desde: string | null }) {
  if (prueba) return <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-800">Modo prueba</span>
  return on
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-800">Encendida{desde ? ` · ${fecha(desde)}` : ''}</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">Apagada</span>
}

export default function IaClientesPanel() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [soloEncendidas, setSoloEncendidas] = useState(false)
  useEffect(() => {
    fetch('/api/plataforma/ia-clientes').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (r.ok) setFilas(d.filas); else setError(d.error ?? 'No se pudo cargar')
    }).catch(() => setError('No se pudo cargar'))
  }, [])
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!filas) return <p className="text-sm text-neutral-500">Cargando…</p>
  const on = (f: Fila) => f.preguntas?.modo === 'real' || f.mensajes?.encendido
  const ver = soloEncendidas ? filas.filter(on) : filas
  const encendidas = filas.filter(on).length
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">IA automática por cliente</h2>
          <p className="text-sm text-neutral-500">Últimos 30 días. «Solas» = las que la IA mandó sin que nadie las viera. {encendidas} de {filas.length} la tienen encendida.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={soloEncendidas} onChange={e => setSoloEncendidas(e.target.checked)} /> Solo las encendidas
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Cliente</th>
              <th className="px-3 py-2 text-left font-medium">Preguntas</th>
              <th className="px-3 py-2 text-right font-medium">Respondió / solas</th>
              <th className="px-3 py-2 text-left font-medium">Mensajes</th>
              <th className="px-3 py-2 text-right font-medium">Respondió / solas</th>
              <th className="px-3 py-2 text-right font-medium">Créditos usados</th>
              <th className="px-3 py-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ver.map(f => (
              <tr key={f.id}>
                <td className="px-3 py-2">
                  <p className="font-medium text-neutral-900">{f.nombre}</p>
                  <p className="text-xs text-neutral-500">{f.estado === 'prueba' ? 'En prueba' : f.plan ?? f.estado}</p>
                </td>
                {f.error ? <td colSpan={6} className="px-3 py-2 text-xs text-red-600">{f.error}</td> : <>
                  <td className="px-3 py-2"><Estado on={f.preguntas!.modo === 'real'} prueba={f.preguntas!.modo === 'sombra'} desde={f.preguntas!.desde} /></td>
                  <td className="px-3 py-2 text-right num">{miles(f.preguntas!.total)} / {miles(f.preguntas!.solas)} <span className="text-xs text-neutral-500">({pct(f.preguntas!.solas, f.preguntas!.total)})</span></td>
                  <td className="px-3 py-2"><Estado on={f.mensajes!.encendido} desde={f.mensajes!.desde} /></td>
                  <td className="px-3 py-2 text-right num">{miles(f.mensajes!.total)} / {miles(f.mensajes!.solas)} <span className="text-xs text-neutral-500">({pct(f.mensajes!.solas, f.mensajes!.total)})</span>
                    {f.mensajes!.acuses > 0 && <p className="text-xs text-neutral-500">{f.mensajes!.acuses} acuses</p>}</td>
                  <td className="px-3 py-2 text-right num">{miles(f.creditos!.usados)}</td>
                  <td className={`px-3 py-2 text-right num ${f.creditos!.quedan !== null && f.creditos!.quedan <= 0 ? 'text-red-600 font-medium' : ''}`}>
                    {f.creditos!.quedan === null ? 'sin límite' : miles(f.creditos!.quedan)}</td>
                </>}
              </tr>
            ))}
            {!ver.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-neutral-500">Nadie la encendió todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
