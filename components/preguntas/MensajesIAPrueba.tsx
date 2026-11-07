'use client'
import { useEffect, useState } from 'react'

// Mensajes → IA en prueba (mig 145, lib/mensajesIAPrueba.ts): lo que la IA habría respondido a cada mensaje nuevo
// (NO se mandó nada), lo que respondió el equipo, si habría salido sola, y Bien / Mal para medir.
type Caso = {
  id: string; pack_id: string; mensaje_at: string; comprador: string | null; estado: string; respuesta: string | null
  confianza: string | null; decision: 'sola' | 'revisar' | 'nada' | null; motivos: string[] | null; error: string | null
  enviada_at?: string | null; envio_error?: string | null
  marca: 'bien' | 'mal' | null; comprador_nombre: string | null; comprador_nick: string | null; productos: string | null
  cuenta: string | null; equipo: string | null
}
type Contra = { item_id: string; titulo: string; permalink: string | null; contradicciones: string }
type Resumen = { total: number; solas: number; revisar: number; nada: number; marcadas: number; bien: number; solasMarcadas: number; solasBien: number }

const fecha = (s: string) => new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export default function MensajesIAPrueba({ onAbrir }: { onAbrir?: (pack: string) => void }) {
  const [d, setD] = useState<{ casos: Caso[]; contradicciones?: Contra[]; resumen: Resumen } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'sola' | 'revisar' | 'sin_marcar'>('todas')
  const cargar = () => fetch('/api/mensajes/ia-prueba').then(async r => {
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error ?? 'No se pudo cargar'); else setD(j)
  })
  useEffect(() => { cargar() }, [])
  const marcar = async (c: Caso, marca: 'bien' | 'mal') => {
    const nueva = c.marca === marca ? null : marca
    setD(v => v && { ...v, casos: v.casos.map(x => x.id === c.id ? { ...x, marca: nueva } : x) })
    await fetch('/api/mensajes/ia-prueba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, marca: nueva }) })
    cargar()
  }
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!d) return <p className="text-sm text-neutral-500">Cargando…</p>
  const r = d.resumen
  const casos = d.casos.filter(c => filtro === 'todas' ? true : filtro === 'sin_marcar' ? c.estado === 'listo' && !c.marca : c.decision === filtro)
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 space-y-1">
        <p className="font-medium">IA de Mensajes en prueba: no manda nada</p>
        <p className="text-xs">A cada mensaje nuevo de un comprador la IA le deja escrita la respuesta en la conversación (la encuentras al abrirla) y anota si habría salido sola. Marca Bien o Mal para saber si se puede encender.</p>
      </div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        {[
          ['Mensajes', `${r.total}`, ''],
          ['Saldrían solas', `${r.solas}`, `${pct(r.solas, r.total)}%`],
          ['A revisión', `${r.revisar}`, r.nada ? `${r.nada} sin respuesta necesaria` : ''],
          ['Solas marcadas bien', r.solasMarcadas ? `${r.solasBien} de ${r.solasMarcadas}` : '—', r.solasMarcadas ? `${pct(r.solasBien, r.solasMarcadas)}%` : 'marca las que saldrían solas'],
        ].map(([t, v, s]) => (
          <div key={t} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <p className="text-xs text-neutral-500">{t}</p>
            <p className="text-lg font-semibold text-neutral-900 num">{v}</p>
            {s && <p className="text-xs text-neutral-500">{s}</p>}
          </div>
        ))}
      </div>
      {!!d.contradicciones?.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
          <p className="font-medium">Publicaciones que se contradicen ({d.contradicciones.length})</p>
          <p className="text-xs">Al leer las fotos, la ficha y la descripción, la IA encontró datos que no coinciden. Corrígelos en MercadoLibre: mientras tanto la IA no responde sola sobre eso.</p>
          <ul className="space-y-1.5">
            {d.contradicciones.map(x => (
              <li key={x.item_id} className="text-xs">
                {x.permalink ? <a href={x.permalink} target="_blank" rel="noreferrer" className="font-medium underline">{x.titulo}</a> : <span className="font-medium">{x.titulo}</span>}
                <span className="text-amber-800"> · {x.contradicciones}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {([['todas', 'Todas'], ['sola', 'Saldrían solas'], ['revisar', 'A revisión'], ['sin_marcar', 'Sin marcar']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filtro === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-300 text-neutral-700'}`}>{t}</button>
        ))}
      </div>
      {!casos.length && <p className="text-sm text-neutral-500">Todavía no hay mensajes en esta vista. Se llenan solos a medida que escriben los compradores.</p>}
      <div className="grid gap-3 xl:grid-cols-2">
        {casos.map(c => (
          <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
              <span>{c.cuenta} · {c.comprador_nombre || c.comprador_nick || 'Comprador'} · {fecha(c.mensaje_at)}</span>
              {onAbrir && <button type="button" onClick={() => onAbrir(c.pack_id)} className="text-sky-700">Abrir conversación</button>}
            </div>
            {c.productos && <p className="text-xs text-neutral-500 truncate">{c.productos}</p>}
            <p className="whitespace-pre-wrap font-medium text-neutral-900">{c.comprador || '—'}</p>
            {c.estado === 'procesando' ? <p className="text-xs text-neutral-500">La IA está escribiendo…</p>
              : c.estado === 'error' ? <p className="text-xs text-red-700">Error de la IA: {c.error}</p> : <>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-neutral-50 p-2"><p className="text-xs text-neutral-400">Tu equipo</p><p className="whitespace-pre-wrap text-neutral-700">{c.equipo || 'Todavía sin responder'}</p></div>
                <div className="rounded-lg bg-sky-50 p-2"><p className="text-xs text-sky-700">IA</p><p className="whitespace-pre-wrap text-neutral-900">{c.respuesta || (c.decision === 'nada' ? 'No hace falta responder' : '—')}</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.decision === 'sola' ? 'bg-green-50 text-green-800' : c.decision === 'nada' ? 'bg-neutral-100 text-neutral-600' : 'bg-amber-50 text-amber-800'}`}>
                  {c.decision === 'sola' ? (c.enviada_at ? '✓ Enviada sola' : c.envio_error ? `No se pudo enviar: ${c.envio_error}` : 'Saldría sola') : c.decision === 'nada' ? 'No respondería' : `A revisión: ${(c.motivos ?? []).join(' · ')}`}</span>
                <div className="flex gap-1">
                  {(['bien', 'mal'] as const).map(m => (
                    <button key={m} type="button" onClick={() => marcar(c, m)}
                      className={`px-3 py-1 rounded-full text-xs border ${c.marca === m ? (m === 'bien' ? 'bg-green-700 text-white border-green-700' : 'bg-red-600 text-white border-red-600') : 'bg-white border-neutral-300 text-neutral-700'}`}>
                      {m === 'bien' ? 'Bien' : 'Mal'}</button>
                  ))}
                </div>
              </div>
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}
