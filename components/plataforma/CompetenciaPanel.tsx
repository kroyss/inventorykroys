'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Plataforma → Interno → Competencia (10-11, mig 161): nuestra IA contra el bot externo (Mercasist) de Gerardo y Urdaneta.
// Cada pregunta: la respuesta que dio el bot y la que daría nuestra IA (sin publicar). El dueño marca Bien/Mal la nuestra.
interface Fila {
  id: number; empresa_id: number; empresa: string; fecha: string; item_titulo: string | null; item_permalink: string | null
  pregunta: string; respuesta_ellos: string | null; segundos: number | null
  respuesta_nuestra: string | null; decision: 'sola' | 'revisar' | null; motivos: string[] | null; error: string | null
  generada_at: string | null; marca: 'bien' | 'mal' | null; nota: string | null; costo: number | null
}
type Filtro = 'todas' | 'sin_marcar' | 'sola' | 'revisar' | 'bien' | 'mal'

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const pct = (a: number, b: number) => b ? `${Math.round((100 * a) / b)}%` : '—'

export default function CompetenciaPanel() {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [empresa, setEmpresa] = useState<number | 'todas'>('todas')
  const [filtro, setFiltro] = useState<Filtro>('sin_marcar')
  const parar = useRef(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/competencia')
    const d = await r.json().catch(() => ({}))
    if (r.ok) setFilas(d.filas); else setError(d.error ?? 'No se pudo cargar')
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const traer = async () => {
    setOcupado('Trayendo preguntas…'); setError(null)
    const r = await fetch('/api/plataforma/competencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'cargar', dias: 5 }) })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setError(d.error ?? 'No se pudo traer'); return }
    await cargar()
  }
  // De a 8 por pedido (cada una ~15 s); sigue hasta terminar o hasta «Pausar».
  const generar = async () => {
    parar.current = false; setError(null)
    for (;;) {
      setOcupado('Generando nuestras respuestas…')
      const r = await fetch('/api/plataforma/competencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'generar' }) })
      const d = await r.json().catch(() => ({}))
      await cargar()
      if (!r.ok) { setError(d.error ?? 'Falló la generación'); break }
      if (!d.quedan || parar.current) break
    }
    setOcupado(null)
  }
  const marcar = async (id: number, marca: 'bien' | 'mal' | null, nota?: string) => {
    setFilas(f => f?.map(x => x.id === id ? { ...x, marca, ...(nota !== undefined ? { nota } : {}) } : x) ?? null)
    await fetch('/api/plataforma/competencia', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, marca, nota }) })
  }

  const empresas = useMemo(() => [...new Map((filas ?? []).map(f => [f.empresa_id, f.empresa])).entries()], [filas])
  const base = (filas ?? []).filter(f => empresa === 'todas' || f.empresa_id === empresa)
  const generadas = base.filter(f => f.generada_at)
  const solas = generadas.filter(f => f.decision === 'sola')
  const bien = generadas.filter(f => f.marca === 'bien'), mal = generadas.filter(f => f.marca === 'mal')
  const solasBien = solas.filter(f => f.marca === 'bien').length, solasMal = solas.filter(f => f.marca === 'mal').length
  const costo = generadas.reduce((a, f) => a + (f.costo ?? 0), 0)
  const mediana = (() => { const s = base.map(f => f.segundos ?? 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null })()
  const visibles = base.filter(f => filtro === 'todas' ? true : filtro === 'sin_marcar' ? f.generada_at && !f.marca
    : filtro === 'sola' || filtro === 'revisar' ? f.decision === filtro : f.marca === filtro)

  if (!filas) return error ? <p className="text-sm text-red-700">{error}</p> : <p className="text-sm text-neutral-500">Cargando…</p>
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-neutral-900">Nuestra IA vs. el bot de la competencia</h3>
          <div className="ml-auto flex gap-2">
            <button onClick={traer} disabled={!!ocupado} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm disabled:opacity-50">Traer últimos 5 días</button>
            {ocupado?.startsWith('Generando')
              ? <button onClick={() => { parar.current = true }} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Pausar</button>
              : <button onClick={generar} disabled={!!ocupado || base.length === generadas.length} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">
                  Generar las nuestras ({(filas ?? []).filter(f => !f.generada_at).length})</button>}
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Preguntas que Gerardo y Urdaneta respondieron fuera del sistema (su bot) y la que daría nuestra IA hoy, con sus datos y su Mi IA.
          No se publica nada ni se cobra a ellos. Marca <b>Bien</b> o <b>Mal</b> la nuestra.
        </p>
        {ocupado && <p className="text-xs text-sky-800">{ocupado}</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <Dato t="Preguntas" v={`${base.length}`} s={`${generadas.length} generadas`} />
          <Dato t="Ellos responden en" v={mediana === null ? '—' : `${mediana} s`} s="mediana" />
          <Dato t="Nuestra: saldría sola" v={pct(solas.length, generadas.length)} s={`${solas.length} de ${generadas.length}`} />
          <Dato t="Marcadas bien" v={pct(bien.length, bien.length + mal.length)} s={`${bien.length} bien · ${mal.length} mal`} />
          <Dato t="Solas y bien" v={pct(solasBien, solasBien + solasMal)} s={`${solasMal} solas mal · costo $${costo.toFixed(2)}`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[['todas', 'Todas'] as const, ...empresas.map(([id, n]) => [id, n] as const)].map(([id, n]) => (
            <Pill key={String(id)} on={empresa === id} onClick={() => setEmpresa(id as number | 'todas')}>{n}</Pill>
          ))}
          <span className="w-px bg-neutral-200 mx-1" />
          {([['sin_marcar', 'Sin marcar'], ['todas', 'Todas'], ['sola', 'Saldría sola'], ['revisar', 'Iría a revisión'], ['bien', 'Bien'], ['mal', 'Mal']] as const).map(([k, t]) => (
            <Pill key={k} on={filtro === k} onClick={() => setFiltro(k)}>{t}</Pill>
          ))}
        </div>
      </div>

      {visibles.map(f => <Caso key={f.id} f={f} onMarcar={marcar} />)}
      {visibles.length === 0 && <p className="text-sm text-neutral-400 text-center py-6">Nada con este filtro.</p>}
    </div>
  )
}

function Dato({ t, v, s }: { t: string; v: string; s: string }) {
  return <div className="rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2"><div className="text-[11px] text-neutral-500">{t}</div><div className="text-lg font-semibold text-neutral-900">{v}</div><div className="text-[11px] text-neutral-400">{s}</div></div>
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{children}</button>
}

function Caso({ f, onMarcar }: { f: Fila; onMarcar: (id: number, m: 'bien' | 'mal' | null, nota?: string) => void }) {
  const [nota, setNota] = useState(f.nota ?? '')
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">{f.empresa}</span>
        <span>{fechaHora(f.fecha)}</span>
        {f.item_permalink ? <a href={f.item_permalink} target="_blank" rel="noreferrer" className="underline underline-offset-2 truncate max-w-md">{f.item_titulo ?? 'Publicación'}</a> : <span className="truncate max-w-md">{f.item_titulo}</span>}
      </div>
      <p className="font-medium text-neutral-900">{f.pregunta}</p>
      <div className="grid md:grid-cols-2 gap-2">
        <div className="rounded-lg bg-neutral-50 border border-neutral-100 p-3">
          <div className="text-[11px] text-neutral-500 mb-1">Su bot{f.segundos !== null ? ` · ${f.segundos} s` : ''}</div>
          <p className="text-sm text-neutral-800 whitespace-pre-line">{f.respuesta_ellos}</p>
        </div>
        <div className={`rounded-lg border p-3 ${f.decision === 'sola' ? 'bg-green-50/60 border-green-100' : 'bg-amber-50/60 border-amber-100'}`}>
          <div className="text-[11px] mb-1 text-neutral-500">
            Nuestra IA · {!f.generada_at ? 'sin generar' : f.decision === 'sola' ? <b className="text-green-800">saldría sola</b> : <b className="text-amber-800">iría a revisión</b>}
          </div>
          {f.error ? <p className="text-xs text-red-700">{f.error}</p> : <p className="text-sm text-neutral-800 whitespace-pre-line">{f.respuesta_nuestra || (f.generada_at ? '(sin respuesta)' : '—')}</p>}
          {!!f.motivos?.length && <ul className="mt-1 text-[11px] text-amber-900 list-disc pl-4">{f.motivos.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </div>
      </div>
      {f.generada_at && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onMarcar(f.id, f.marca === 'bien' ? null : 'bien')} className={`px-3 py-1 rounded-lg border text-sm ${f.marca === 'bien' ? 'bg-green-700 text-white border-green-700' : 'border-neutral-300'}`}>Bien</button>
          <button onClick={() => onMarcar(f.id, f.marca === 'mal' ? null : 'mal')} className={`px-3 py-1 rounded-lg border text-sm ${f.marca === 'mal' ? 'bg-red-700 text-white border-red-700' : 'border-neutral-300'}`}>Mal</button>
          <input value={nota} onChange={e => setNota(e.target.value)} onBlur={() => nota !== (f.nota ?? '') && onMarcar(f.id, f.marca, nota)} maxLength={500}
            placeholder="Nota (opcional): qué estuvo mal, qué debió decir…" className="flex-1 min-w-48 border border-neutral-300 rounded-lg px-2 py-1 text-sm" />
        </div>
      )}
    </div>
  )
}
