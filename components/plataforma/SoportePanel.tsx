'use client'
import { useCallback, useEffect, useState } from 'react'

// Plataforma → Soporte (30-10-2026): la bandeja ÚNICA de soporte (Sistema, Radar…, cada caso con su origen), para
// responder desde aquí (o con "Responder" en Telegram), y el conteo de gasto de la ayuda con IA con lo que el
// manual no cubre (lo que hay que agregarle a docs/ayuda/sistema.md).

interface Mensaje { id: number; autor: 'cliente' | 'soporte'; texto: string; adjuntos: string[]; created_at: string }
interface Caso {
  id: number; origen: string; estado: 'abierto' | 'respondido' | 'resuelto'; pantalla: string | null; navegador: string | null
  created_at: string; updated_at: string; persona: string | null; username: string | null; empresa: string | null; mensajes: Mensaje[]
}
interface Dia { dia: string; origen: string; consultas: number; costo: number; sin_respuesta: number; utiles: number; no_utiles: number }
interface Falta { id: number; origen: string; pantalla: string | null; pregunta: string; respuesta: string | null; sabia: boolean; util: number | null; created_at: string; empresa: string | null }
interface Datos { casos: Caso[]; ayuda: { mes: { consultas: number; costo: number; personas: number }; dias: Dia[]; falta: Falta[] } }

const ORIGEN: Record<string, string> = { sistema: '🧩 Sistema', radar: '📡 Radar' }
const ESTADO: Record<string, string> = { abierto: 'Por responder', respondido: 'Respondido', resuelto: 'Resuelto' }
const hora = (s: string) => new Date(s).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' })
const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export default function SoportePanel({ inicial }: { inicial?: number | null }) {
  const [d, setD] = useState<Datos | null>(null)
  const [abierto, setAbierto] = useState<number | null>(inicial ?? null)
  const [respuesta, setRespuesta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verResueltos, setVerResueltos] = useState(false)

  const cargar = useCallback(() => {
    fetch('/api/plataforma/casos-soporte', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(x => x && setD(x)).catch(() => {})
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function responder(id: number) {
    if (!respuesta.trim() || enviando) return
    setEnviando(true); setError(null)
    const r = await fetch(`/api/plataforma/casos-soporte/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: respuesta }) }).catch(() => null)
    const x = await r?.json().catch(() => null)
    setEnviando(false)
    if (!r?.ok) { setError(x?.error ?? 'No se pudo enviar'); return }
    setRespuesta(''); cargar()
  }
  async function estado(id: number, e: 'resuelto' | 'abierto') {
    await fetch(`/api/plataforma/casos-soporte/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: e }) }).catch(() => {})
    cargar()
  }

  if (!d) return <p className="text-sm text-neutral-500">Cargando…</p>
  const lista = d.casos.filter(c => verResueltos || c.estado !== 'resuelto')
  const caso = d.casos.find(c => c.id === abierto) ?? null
  const porResponder = d.casos.filter(c => c.estado === 'abierto').length
  const totDias = d.ayuda.dias.reduce((a, x) => ({ c: a.c + x.consultas, s: a.s + x.costo, n: a.n + x.sin_respuesta, u: a.u + x.utiles, nu: a.nu + x.no_utiles }), { c: 0, s: 0, n: 0, u: 0, nu: 0 })

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-900">Casos de soporte {porResponder > 0 && <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{porResponder} por responder</span>}</h2>
          <label className="flex items-center gap-1.5 text-sm text-neutral-600">
            <input type="checkbox" checked={verResueltos} onChange={e => setVerResueltos(e.target.checked)} /> Ver resueltos (30 días)
          </label>
        </div>
        <p className="text-xs text-neutral-500">Todo lo que escriben desde la burbuja de Ayuda, con su origen. Te llega también a Telegram: ahí puedes tocar «Responder» sobre el aviso.</p>

        <div className="grid gap-3 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-1.5">
            {lista.length === 0 && <p className="text-sm text-neutral-500">Nada por aquí.</p>}
            {lista.map(c => (
              <button key={c.id} onClick={() => { setAbierto(c.id); setError(null) }}
                className={`block w-full text-left rounded-lg border px-3 py-2 ${abierto === c.id ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-neutral-500">#{c.id} · {ORIGEN[c.origen] ?? c.origen} · {hora(c.updated_at)}</span>
                  <span className={c.estado === 'abierto' ? 'font-semibold text-red-600' : 'text-neutral-400'}>{ESTADO[c.estado]}</span>
                </span>
                <span className="block text-sm font-medium text-neutral-900 truncate">{c.empresa ?? '—'} · {c.persona ?? c.username ?? '—'}</span>
                <span className="block text-xs text-neutral-600 truncate">{c.mensajes[c.mensajes.length - 1]?.texto || 'Captura'}</span>
              </button>
            ))}
          </div>

          {caso ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">#{caso.id} · {caso.empresa ?? '—'} · {caso.persona ?? '—'} <span className="font-normal text-neutral-500">({caso.username})</span></p>
                  <p className="text-xs text-neutral-500">{ORIGEN[caso.origen] ?? caso.origen} · 📍 {caso.pantalla ?? '—'} · desde {hora(caso.created_at)}</p>
                  {caso.navegador && <p className="text-[11px] text-neutral-400 truncate max-w-xl" title={caso.navegador}>{caso.navegador}</p>}
                </div>
                {caso.estado === 'resuelto'
                  ? <button onClick={() => estado(caso.id, 'abierto')} className="btn-secondary text-xs">Reabrir</button>
                  : <button onClick={() => estado(caso.id, 'resuelto')} className="btn-secondary text-xs">✓ Marcar resuelto</button>}
              </div>
              <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                {caso.mensajes.map(m => (
                  <div key={m.id} className={m.autor === 'soporte' ? 'ml-auto max-w-[85%]' : 'max-w-[85%]'}>
                    <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.autor === 'soporte' ? 'bg-neutral-900 text-white rounded-br-sm' : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'}`}>
                      {m.texto}
                      {m.adjuntos.map(a => a.endsWith('.pdf')
                        ? <a key={a} href={`/api/soporte/adjunto?caso=${caso.id}&archivo=${encodeURIComponent(a)}`} target="_blank" rel="noreferrer" className="block text-xs underline">📎 PDF</a>
                        : <a key={a} href={`/api/soporte/adjunto?caso=${caso.id}&archivo=${encodeURIComponent(a)}`} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/soporte/adjunto?caso=${caso.id}&archivo=${encodeURIComponent(a)}`} alt="Captura" className="mt-1.5 max-h-56 rounded-lg border border-neutral-200" />
                          </a>)}
                    </div>
                    <p className={`mt-0.5 text-[11px] text-neutral-400 ${m.autor === 'soporte' ? 'text-right' : ''}`}>{m.autor === 'soporte' ? 'Tú · ' : ''}{hora(m.created_at)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={3} placeholder="Tu respuesta (le llega en la burbuja y a su Telegram si lo conectó)"
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) responder(caso.id) }}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
                <div className="flex items-center justify-between gap-2">
                  {error ? <p className="text-xs text-red-600">{error}</p> : <span className="text-[11px] text-neutral-400">Ctrl+Enter envía</span>}
                  <button onClick={() => responder(caso.id)} disabled={enviando || !respuesta.trim()} className="btn-primary text-sm">{enviando ? 'Enviando…' : 'Responder'}</button>
                </div>
              </div>
            </div>
          ) : <p className="hidden lg:block text-sm text-neutral-500">Elige un caso.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-neutral-900">Ayuda con IA · gasto</h2>
        <p className="text-xs text-neutral-500">Lo pagamos nosotros (no usa créditos del cliente). Modelo barato con el manual en caché; tope por persona y día.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['Este mes', `${d.ayuda.mes.consultas} preguntas`], ['Costo del mes', usd(d.ayuda.mes.costo)],
            ['Personas', String(d.ayuda.mes.personas)],
            ['Por pregunta', d.ayuda.mes.consultas ? usd(d.ayuda.mes.costo / d.ayuda.mes.consultas) : '—']].map(([t, v]) => (
            <div key={t} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
              <p className="text-xs text-neutral-500">{t}</p><p className="font-semibold text-neutral-900 tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {d.ayuda.dias.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500"><tr className="border-b border-neutral-100">
                <th className="px-3 py-1.5 text-left">Día</th><th className="px-3 py-1.5 text-left">Origen</th><th className="px-3 py-1.5 text-right">Preguntas</th>
                <th className="px-3 py-1.5 text-right">Sin respuesta</th><th className="px-3 py-1.5 text-right">👍 / 👎</th><th className="px-3 py-1.5 text-right">Costo</th>
              </tr></thead>
              <tbody>
                {d.ayuda.dias.map(x => (
                  <tr key={x.dia + x.origen} className="border-b border-neutral-50 tabular-nums">
                    <td className="px-3 py-1">{x.dia.split('-').reverse().join('/')}</td><td className="px-3 py-1">{ORIGEN[x.origen] ?? x.origen}</td>
                    <td className="px-3 py-1 text-right">{x.consultas}</td><td className="px-3 py-1 text-right">{x.sin_respuesta || ''}</td>
                    <td className="px-3 py-1 text-right">{x.utiles} / {x.no_utiles}</td><td className="px-3 py-1 text-right">{usd(x.costo)}</td>
                  </tr>
                ))}
                <tr className="font-semibold tabular-nums"><td className="px-3 py-1.5" colSpan={2}>30 días</td><td className="px-3 py-1.5 text-right">{totDias.c}</td>
                  <td className="px-3 py-1.5 text-right">{totDias.n}</td><td className="px-3 py-1.5 text-right">{totDias.u} / {totDias.nu}</td><td className="px-3 py-1.5 text-right">{usd(totDias.s)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-neutral-800">Lo que el manual no cubre o no sirvió</h3>
          <p className="text-xs text-neutral-500">Preguntas que la IA no supo o que marcaron 👎: agregarlas a docs/ayuda/sistema.md.</p>
          {d.ayuda.falta.length === 0 && <p className="text-sm text-neutral-500">Nada todavía.</p>}
          {d.ayuda.falta.map(f => (
            <details key={f.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
              <summary className="cursor-pointer">
                <span className="text-xs text-neutral-500">{hora(f.created_at)} · {f.empresa ?? '—'} · {f.pantalla} · {!f.sabia ? 'no supo' : '👎'}</span>
                <span className="block text-neutral-900">{f.pregunta}</span>
              </summary>
              {f.respuesta && <p className="mt-1.5 whitespace-pre-wrap text-xs text-neutral-600">{f.respuesta}</p>}
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
