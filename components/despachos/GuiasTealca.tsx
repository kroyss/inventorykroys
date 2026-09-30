'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface Envio {
  id: number
  venta: string
  pre_guia: string | null
  guia_final: string | null
  remitente: string | null
  destinatario: string | null
  reporte_estado: string | null
  generated_at: string
  jornada_cerrada: boolean | null
}

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

/**
 * Guías finales de Tealca. La etiqueta trae la PRE-guía (de Mercado Envíos); la guía real la
 * genera Tealca después y se escribe aquí, al lado del nombre del destinatario. Un envío
 * con guía entra a la cola del Reportador; sin guía se queda esperando.
 */
export default function GuiasTealca({ isAdmin, onGuardado }: { isAdmin: boolean; onGuardado?: () => void }) {
  const [envios, setEnvios]   = useState<Envio[] | null>(null)
  const [digitos, setDigitos] = useState(8)
  const [valores, setValores] = useState<Record<number, string>>({})
  const [buscar, setBuscar]   = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [aviso, setAviso]     = useState<string | null>(null)
  const [erroresApi, setErroresApi] = useState<Record<number, string>>({})

  const cargar = useCallback(async () => {
    const res = await fetch('/api/despachos/tealca')
    if (!res.ok) return
    const d = await res.json() as { digitos: number; envios: Envio[] }
    setEnvios(d.envios)
    setDigitos(d.digitos)
    setValores({})
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const valorDe = (e: Envio) => valores[e.id] ?? e.guia_final ?? ''

  // Validación en vivo: solo dígitos, del largo exigido y sin repetir entre los envíos.
  const problemas = useMemo(() => {
    const out: Record<number, string> = {}
    const usadas = new Map<string, number>()
    for (const e of envios ?? []) {
      const v = (valores[e.id] ?? e.guia_final ?? '').trim()
      if (!v) continue
      if (!/^\d+$/.test(v)) out[e.id] = 'Solo números'
      else if (v.length !== digitos) out[e.id] = `${v.length} de ${digitos} dígitos`
      else if (usadas.has(v)) { out[e.id] = 'Repetida'; out[usadas.get(v)!] = 'Repetida' }
      else usadas.set(v, e.id)
    }
    return out
  }, [envios, valores, digitos])

  if (!envios || envios.length === 0) return null

  const cambios = envios.filter(e => (valores[e.id] ?? e.guia_final ?? '').trim() !== (e.guia_final ?? ''))
  const conGuia = envios.filter(e => (valorDe(e).trim() !== '')).length
  const hayProblemas = Object.keys(problemas).length > 0
  const q = buscar.trim().toLowerCase()
  const visibles = q
    ? envios.filter(e => `${e.destinatario ?? ''} ${e.venta} ${e.pre_guia ?? ''} ${e.remitente ?? ''}`.toLowerCase().includes(q))
    : envios

  const guardar = async () => {
    setGuardando(true); setError(null); setAviso(null); setErroresApi({})
    const res = await fetch('/api/despachos/tealca', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guias: cambios.map(e => ({ id: e.id, guia_final: (valores[e.id] ?? '').trim() })) }),
    })
    const body = await res.json().catch(() => ({})) as { error?: string; errores?: { id: number; error: string }[]; guardadas?: number }
    setGuardando(false)
    if (!res.ok) {
      setError(body.error ?? 'No se pudo guardar')
      setErroresApi(Object.fromEntries((body.errores ?? []).map(x => [x.id, x.error])))
      return
    }
    setAviso(`${body.guardadas} guía(s) guardada(s). Los envíos con guía ya están en la cola del Reportador.`)
    await cargar()
    onGuardado?.()
  }

  const cambiarDigitos = async (n: number) => {
    if (!Number.isInteger(n) || n < 4 || n > 20) return
    const res = await fetch('/api/despachos/tealca', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ digitos: n }),
    })
    if (res.ok) setDigitos(n)
  }

  // Enter pasa a la siguiente casilla: se escribe una guía tras otra sin usar el mouse.
  const siguiente = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const todas = Array.from(e.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('input[data-guia]') ?? [])
    todas[todas.indexOf(e.currentTarget) + 1]?.focus()
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm">
      <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-neutral-800">Guías Tealca</h2>
        <span className="text-xs text-green-700">{conGuia} con guía</span>
        <span className="text-xs text-amber-700">{envios.length - conGuia} sin guía</span>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar destinatario o venta…"
               className="border border-neutral-300 rounded px-2 py-1 text-xs ml-auto w-56" />
        {isAdmin && (
          <label className="text-xs text-neutral-500 flex items-center gap-1" title="Largo exigido de la guía final de Tealca">
            Dígitos
            <input type="number" min={4} max={20} defaultValue={digitos} key={digitos}
                   onBlur={e => cambiarDigitos(parseInt(e.target.value, 10))}
                   className="border border-neutral-300 rounded px-1 py-0.5 w-14 text-xs" />
          </label>
        )}
        <button onClick={guardar} disabled={guardando || cambios.length === 0 || hayProblemas} className="btn-primary text-xs">
          {guardando ? 'Guardando…' : `Guardar guías (${cambios.length})`}
        </button>
      </div>
      <p className="px-4 pt-2 text-xs text-neutral-500">
        Escribe la guía que asignó Tealca a cada destinatario (la de la foto o el correo), no la pre-guía de la etiqueta.
        Debe tener {digitos} dígitos y no puede repetirse. Los envíos con guía se reportan al comprador desde el Reportador.
      </p>
      {error && <div className="mx-4 mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded text-xs">{error}</div>}
      {aviso && <div className="mx-4 mt-2 bg-green-50 border border-green-200 text-green-800 px-3 py-1.5 rounded text-xs">{aviso}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm mt-2">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Destinatario</th>
              <th className="px-3 py-2 text-left">Remitente</th>
              <th className="px-3 py-2 text-left">Venta</th>
              <th className="px-3 py-2 text-left">Pre-guía</th>
              <th className="px-3 py-2 text-left">Guía final</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(e => {
              const err = erroresApi[e.id] ?? problemas[e.id]
              return (
                <tr key={e.id} className="border-t border-neutral-100 align-middle">
                  <td className="px-3 py-1.5 text-xs text-neutral-500 whitespace-nowrap">{fechaHora(e.generated_at)}</td>
                  <td className="px-3 py-1.5 font-medium">{e.destinatario ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{e.remitente?.slice(0, 22) ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.venta}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-neutral-400">{e.pre_guia ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <input data-guia value={valorDe(e)} inputMode="numeric" maxLength={20}
                             onChange={ev => setValores(v => ({ ...v, [e.id]: ev.target.value.replace(/\s+/g, '') }))}
                             onKeyDown={siguiente}
                             className={`border rounded px-2 py-1 text-sm font-mono w-40 ${err ? 'border-red-400 bg-red-50' : 'border-neutral-300'}`} />
                      {err
                        ? <span className="text-xs text-red-700">{err}</span>
                        : valorDe(e).trim() !== '' && <span className="text-xs text-green-700">✓</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
