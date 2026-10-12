'use client'
import { useEffect, useState } from 'react'

/**
 * Datos propios del negocio (de la EMPRESA de la sesión, app_settings):
 *   ml_cuentas          → cuentas de MercadoLibre (códigos ML de cada producto)
 *   despacho_remitente  → remitente del manifiesto de despachos (vacío = nombre de la empresa)
 * soloRemitente: la empresa sin inventario no tiene Ajustes; Despachos le muestra solo el remitente
 * (las cuentas ML de los productos no le sirven: no tiene productos).
 * Si la empresa no escribió cuentas y tiene cuentas conectadas por API, el campo no se muestra: se usan
 * las conectadas (lib/mlCuentas.ts). Queda para quien ya las escribió (p.ej. SolucionesMC) o no conectó ninguna.
 */
export default function NegocioSettings({ conDespachos, soloRemitente = false }: { conDespachos: boolean; soloRemitente?: boolean }) {
  const [cuentas, setCuentas]     = useState('')
  const [remitente, setRemitente] = useState('')
  const [guardadas, setGuardadas] = useState(false)          // la empresa ya escribió cuentas a mano
  const [conectadas, setConectadas] = useState<string[] | null>(null)
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => {
      let v: string[] = []
      try { v = JSON.parse(s.ml_cuentas ?? '[]') as string[] } catch { /* vacío */ }
      setCuentas(v.join(', ')); setGuardadas(v.length > 0)
      setRemitente(s.despacho_remitente ?? '')
    }).catch(() => {})
    if (!soloRemitente) {
      fetch('/api/ml/conexiones').then(r => r.ok ? r.json() : { cuentas: [] })
        .then(d => setConectadas((d.cuentas ?? []).filter((c: { estado: string }) => c.estado === 'activa').map((c: { nickname: string }) => c.nickname.toUpperCase())))
        .catch(() => setConectadas([]))
    }
  }, [soloRemitente])
  const automaticas = !soloRemitente && !guardadas && !!conectadas?.length
  const conCampoCuentas = !soloRemitente && !automaticas

  const lista = cuentas.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)

  const save = async () => {
    setError(null); setOkMsg(null)
    if (lista.length > 10) { setError('Máximo 10 cuentas'); return }
    if (new Set(lista).size !== lista.length) { setError('Hay cuentas repetidas'); return }
    setBusy(true)
    const body: Record<string, string> = conCampoCuentas ? { ml_cuentas: JSON.stringify(lista) } : {}
    if (conDespachos) body.despacho_remitente = remitente.trim()
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar'); return }
    setCuentas(lista.join(', '))
    setOkMsg('Guardado'); setTimeout(() => setOkMsg(null), 2500)
  }

  if (conectadas === null && !soloRemitente) return null            // sin parpadeo del campo mientras se averigua
  if (automaticas && !conDespachos) return null                       // nada que configurar
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">{soloRemitente ? 'Manifiesto' : 'Tu negocio'}</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      {okMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{okMsg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {conCampoCuentas && <label className="text-xs text-neutral-600">Cuentas de MercadoLibre (separadas por coma)
          <input className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono"
            value={cuentas} onChange={e => setCuentas(e.target.value)} placeholder="p.ej. MITIENDA, MITIENDA2" />
          <span className="text-[11px] text-neutral-400">Cada producto guarda su código de publicación en cada cuenta.</span>
        </label>}
        {automaticas && (
          <div className="text-xs text-neutral-600">Cuentas de MercadoLibre
            <p className="mt-1 py-1.5 text-sm font-mono text-neutral-800">{conectadas!.join(', ')}</p>
            <span className="text-[11px] text-neutral-400">Las que conectaste: se toman solas.</span>
          </div>
        )}
        {conDespachos && (
          <label className="text-xs text-neutral-600">Remitente en el manifiesto de despachos
            <input className="mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm"
              value={remitente} onChange={e => setRemitente(e.target.value)} placeholder="Vacío = el nombre de tu empresa" />
          </label>
        )}
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="btn-primary text-sm">{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </section>
  )
}
