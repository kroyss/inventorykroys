'use client'
import { useCallback, useEffect, useState } from 'react'
import { textoOpcion } from '@/lib/fundadores'

interface Tanda { numero: number; cupos: number; abierta: boolean; inicia: string | null; tomados: number }
interface Verif {
  encontrado: boolean; motivo?: string; nickname?: string; nivel?: string | null; lider?: string | null
  ventas_total?: number | null; ventas_periodo?: number | null; periodo?: string | null; desde?: string | null
}
interface Solicitud {
  id: number; nombre: string; telegram: string; nick_ml: string | null
  ventas_mes: string; cuentas: string; despacho: string; dolor: string; inventario: string
  puntaje: number; estado: 'descartado' | 'calificado' | 'aprobado' | 'rechazado'; tanda: number | null
  sospechosa: string | null; ml_verificado: Verif | null; notas: string | null; created_at: string
}
type Filtro = 'calificado' | 'aprobado' | 'rechazado' | 'descartado' | 'todas'

const ESTADO: Record<Solicitud['estado'], { t: string; c: string }> = {
  calificado: { t: 'Por revisar', c: 'bg-sky-50 text-sky-800 ring-sky-200' },
  aprobado:   { t: 'Aprobado', c: 'bg-lime-50 text-lime-800 ring-lime-300' },
  rechazado:  { t: 'Rechazado', c: 'bg-neutral-100 text-neutral-600 ring-neutral-200' },
  descartado: { t: 'Descartado (< 30 ventas)', c: 'bg-neutral-100 text-neutral-500 ring-neutral-200' },
}

const FILTRO: Record<Filtro, string> = {
  calificado: 'Por revisar', aprobado: 'Aprobados', rechazado: 'Rechazados', descartado: 'Descartados', todas: 'Todas',
}

const fecha = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Plataforma → Fundadores: solicitudes del Programa Fundadores, por puntaje, y las tandas. */
export default function FundadoresPanel() {
  const [datos, setDatos] = useState<{ solicitudes: Solicitud[]; tandas: Tanda[]; maximo: number } | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('calificado')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/fundadores')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d)
  }, [])
  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/fundadores').then(r => r.json()).then(d => { if (vivo) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const accion = async (s: Solicitud, body: object) => {
    setError(null); setOcupado(s.id)
    try {
      const r = await fetch(`/api/plataforma/fundadores/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo')
      await cargar()
    } finally { setOcupado(null) }
  }
  const verificar = async (s: Solicitud) => {
    setError(null); setOcupado(s.id)
    try {
      const r = await fetch(`/api/plataforma/fundadores/${s.id}/verificar`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo verificar')
      await cargar()
    } finally { setOcupado(null) }
  }
  const tanda = async (t: Tanda, cambio: { abierta?: boolean; inicia?: string | null }) => {
    await fetch(`/api/plataforma/fundadores/tandas/${t.numero}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambio),
    })
    cargar()
  }

  if (!datos) return <p className="text-sm text-neutral-400">Cargando…</p>
  const cuenta = (e: Filtro) => e === 'todas' ? datos.solicitudes.length : datos.solicitudes.filter(s => s.estado === e).length
  const lista = filtro === 'todas' ? datos.solicitudes : datos.solicitudes.filter(s => s.estado === filtro)
  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/fundadores` : '/fundadores'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Página pública:</span>
        <a href="/fundadores" target="_blank" rel="noreferrer" className="font-mono text-neutral-800 underline underline-offset-2">{enlace}</a>
        <button onClick={() => navigator.clipboard?.writeText(enlace)} className="btn-ghost text-xs px-2 py-1">Copiar</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {datos.tandas.map(t => (
          <div key={t.numero} className={`rounded-xl border p-4 bg-white ${t.abierta ? 'border-lime-400' : 'border-neutral-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900">Tanda {t.numero}</span>
              <span className={`text-xs font-medium ${t.abierta ? 'text-lime-700' : 'text-neutral-400'}`}>{t.abierta ? 'Abierta' : 'Cerrada'}</span>
            </div>
            <label className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
              Inicia
              <input type="date" defaultValue={t.inicia ?? ''} onChange={e => tanda(t, { inicia: e.target.value || null })}
                className="border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700" />
            </label>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: t.cupos }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < t.tomados ? 'bg-lime-500' : 'bg-neutral-200'}`} />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>{t.tomados} de {t.cupos} cupos</span>
              <button onClick={() => tanda(t, { abierta: !t.abierta })} className="underline underline-offset-2 hover:text-neutral-800">
                {t.abierta ? 'Cerrar' : 'Abrir'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['calificado', 'aprobado', 'rechazado', 'descartado', 'todas'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1 text-xs font-medium rounded-full border ${filtro === f ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
            {FILTRO[f]} ({cuenta(f)})
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

      {lista.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">No hay solicitudes en esta vista.</p>
      ) : (
        <div className="space-y-2">
          {lista.map(s => {
            const v = s.ml_verificado
            return (
              <div key={s.id} className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-wrap gap-x-6 gap-y-3">
                <div className="w-16 shrink-0 text-center">
                  <div className="text-2xl font-semibold text-neutral-900 num">{s.puntaje}</div>
                  <div className="text-[11px] text-neutral-400">de {datos.maximo}</div>
                </div>
                <div className="flex-1 min-w-[16rem] space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-900">{s.nombre}</span>
                    <a href={`https://t.me/${s.telegram}`} target="_blank" rel="noreferrer" className="text-sm text-sky-700 hover:underline">@{s.telegram}</a>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ring-1 ring-inset ${ESTADO[s.estado].c}`}>
                      {ESTADO[s.estado].t}{s.estado === 'aprobado' && s.tanda ? ` · tanda ${s.tanda}` : ''}
                    </span>
                    <span className="text-xs text-neutral-400">{fecha(s.created_at)}</span>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {textoOpcion('ventas_mes', s.ventas_mes)} ventas/mes · {textoOpcion('cuentas', s.cuentas)} cuenta(s) ·{' '}
                    {textoOpcion('despacho', s.despacho)} · le quita tiempo: {textoOpcion('dolor', s.dolor).toLowerCase().replace(/, (?=[^,]*$)/, ' y ')} ·{' '}
                    inventario: {textoOpcion('inventario', s.inventario).toLowerCase()}
                  </p>
                  <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-2">
                    {s.nick_ml ? <>
                      <span>Nick ML: <b className="text-neutral-700">{s.nick_ml}</b></span>
                      {v ? (v.encontrado
                        ? <span className="text-emerald-700">✓ {v.nickname} · {v.ventas_total != null ? `${v.ventas_total.toLocaleString('de-DE')} ventas en total` : 'sin dato de ventas'}
                            {v.ventas_periodo != null ? ` · ${v.ventas_periodo} en ${v.periodo === '60 days' ? '60 días' : v.periodo}` : ''}
                            {v.nivel ? ` · reputación ${v.nivel.replace(/^\d_/, '')}` : ''}{v.lider ? ` · MercadoLíder ${v.lider}` : ''}</span>
                        : <span className="text-amber-700">✗ {v.motivo}</span>) : null}
                      <button onClick={() => verificar(s)} disabled={ocupado === s.id} className="underline underline-offset-2 hover:text-neutral-800">
                        {v ? 'verificar de nuevo' : 'Verificar en ML'}
                      </button>
                    </> : <span className="text-neutral-400">Sin nick de ML</span>}
                  </div>
                  {s.sospechosa && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠ Ojo: {s.sospechosa}</p>}
                  <input defaultValue={s.notas ?? ''} placeholder="Nota interna…" maxLength={1000}
                    onBlur={e => { if ((e.target.value || null) !== s.notas) accion(s, { accion: 'nota', notas: e.target.value }) }}
                    className="w-full text-xs border border-transparent hover:border-neutral-200 focus:border-neutral-300 rounded px-2 py-1 text-neutral-600" />
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  {s.estado !== 'aprobado' && (
                    <button onClick={() => accion(s, { accion: 'aprobar' })} disabled={ocupado === s.id} className="btn-primary text-xs">Aprobar</button>
                  )}
                  {(s.estado === 'calificado' || s.estado === 'aprobado') && (
                    <button onClick={() => accion(s, { accion: 'rechazar' })} disabled={ocupado === s.id} className="btn-secondary text-xs">
                      {s.estado === 'aprobado' ? 'Quitar' : 'Rechazar'}
                    </button>
                  )}
                  {(s.estado === 'rechazado' || s.estado === 'descartado') && (
                    <button onClick={() => accion(s, { accion: 'reconsiderar' })} disabled={ocupado === s.id} className="btn-ghost text-xs">Reconsiderar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        Aprobar asigna a la primera tanda abierta con cupo. Al aprobar, escríbele por Telegram y crea su empresa en “Empresas”.
      </p>
    </div>
  )
}
