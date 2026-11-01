'use client'
import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Cargando } from '@/components/ui'

// Preguntas → Configuración → Respuesta automática con IA (01-11-2026, lib/iaAutomatica.ts).
// Modo prueba: la IA decide qué habría salido solo, sin publicar; el vendedor marca cada una bien o mal y ve el % de
// acierto antes de activarla de verdad.

type Modo = 'apagado' | 'sombra' | 'real'
interface Decision {
  modo: Modo; decision: 'sola' | 'revisar'; motivos: string[]; respuesta?: string; confianza?: string
  publicada?: boolean; error?: string; marca?: 'bien' | 'mal' | null; costo?: number
}
interface Fila { id: string; texto: string; item_titulo: string | null; item_permalink: string | null; fecha: string; estado: string; respuesta: string | null; ia_auto: Decision }
interface Info {
  modo: Modo; desde: string | null
  cupo: { usados: number; limite: number | null; quedan: number | null; agotado: boolean }
  resumen: { procesadas: number; solas: number; revisar: number; marcadas: number; bien: number; costo: number }
  preguntas: Fila[]
}

const MODOS: { v: Modo; t: string; d: string }[] = [
  { v: 'apagado', t: 'Apagada', d: 'La IA solo responde cuando tocas «Proponer con IA».' },
  { v: 'sombra', t: 'Modo prueba', d: 'La IA lee cada pregunta nueva y decide si habría salido sola, pero NO publica nada. Tú marcas si estaba bien.' },
  { v: 'real', t: 'Activa', d: 'Las de confianza alta que pasan todas las revisiones se publican solas. El resto te queda con la respuesta ya escrita.' },
]

const hora = (f: string) => new Date(`${f}Z`).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function IaAutomatica() {
  const confirm = useConfirm()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState<'sola' | 'revisar'>('sola')
  const cargar = useCallback(() => {
    fetch('/api/preguntas/ia-auto').then(async r => {
      const d = await r.json().catch(() => null)
      if (r.ok) setInfo(d); else setError(d?.error ?? 'No se pudo cargar')
    }).catch(() => setError('No se pudo cargar'))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const post = async (body: object) => {
    const r = await fetch('/api/preguntas/ia-auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) setError((await r.json().catch(() => null))?.error ?? 'No se pudo guardar')
    cargar()
  }
  const cambiarModo = async (modo: Modo) => {
    if (modo === 'real' && !(await confirm({
      title: 'Activar respuesta automática con IA',
      message: 'Las preguntas en que la IA está segura (confianza alta y revisadas) se publicarán SOLAS en MercadoLibre a tu nombre, sin que nadie las vea antes.\n\nNunca sale sola una respuesta que diga que no hay, que recomiende otra publicación o con datos que no estén en la publicación o tus políticas.\n\nCada pregunta que la IA procesa usa 1 crédito. Puedes pausarla cuando quieras.',
      confirmText: 'Activar',
    }))) return
    post({ accion: 'modo', modo })
  }
  const marcar = (id: string, marca: 'bien' | 'mal' | null) => {
    setInfo(i => i && { ...i, preguntas: i.preguntas.map(p => p.id === id ? { ...p, ia_auto: { ...p.ia_auto, marca } } : p) })
    post({ accion: 'marcar', id, marca })
  }

  if (error && !info) return <p className="text-sm text-red-600">{error}</p>
  if (!info) return <Cargando />
  const r = info.resumen
  const filas = info.preguntas.filter(p => p.ia_auto.decision === ver)
  const pct = r.marcadas ? Math.round((100 * r.bien) / r.marcadas) : null

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-neutral-900">Respuesta automática con IA</h2>
          <p className="text-xs text-neutral-500">
            Solo salen solas las respuestas en que la IA está segura y que pasan todas las revisiones. Las demás te quedan escritas para revisar y enviar.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODOS.map(m => (
            <button key={m.v} onClick={() => m.v !== info.modo && cambiarModo(m.v)}
              className={`text-left rounded-lg border px-3 py-2 ${info.modo === m.v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 hover:border-neutral-300'}`}>
              <div className="text-sm font-semibold">{m.t}</div>
              <div className={`text-xs ${info.modo === m.v ? 'text-neutral-300' : 'text-neutral-500'}`}>{m.d}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          Cada pregunta que procesa usa 1 crédito de IA.
          {info.cupo.limite !== null ? <> Te quedan <b>{info.cupo.quedan}</b> de {info.cupo.limite}{info.cupo.agotado ? ' (sin créditos: no procesa hasta recargar)' : ''}.</> : ' Sin límite de créditos.'}
          {info.desde && <> Procesa las preguntas que llegan desde el {hora(info.desde.slice(0, 19))}.</>}
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span><b>{r.procesadas}</b> procesadas</span>
          <span className="text-emerald-700"><b>{r.solas}</b> {info.modo === 'real' ? 'salieron' : 'habrían salido'} solas</span>
          <span className="text-amber-700"><b>{r.revisar}</b> para revisar</span>
          <span>Marcadas: <b>{r.marcadas}</b>{pct !== null && <> · <b className={pct >= 95 ? 'text-emerald-700' : 'text-amber-700'}>{pct}% bien</b></>}</span>
        </div>
        <div className="flex gap-1.5">
          {([['sola', `Habrían salido solas (${r.solas})`], ['revisar', `Para revisar (${r.revisar})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setVer(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${ver === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
          ))}
        </div>
        {ver === 'sola' && <p className="text-xs text-neutral-500">Marca cada una: ¿la habrías publicado tal cual? Con 95% de «bien» conviene activarla.</p>}
        {!filas.length && <p className="text-sm text-neutral-500">Todavía no hay preguntas aquí.</p>}
        <ul className="divide-y divide-neutral-100">
          {filas.map(p => (
            <li key={p.id} className="py-3 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-neutral-900"><span className="text-neutral-400 text-xs mr-1.5">{hora(p.fecha)}</span>{p.texto}</p>
                {p.item_titulo && (p.item_permalink
                  ? <a href={p.item_permalink} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline truncate max-w-xs">{p.item_titulo}</a>
                  : <span className="text-xs text-neutral-500 truncate max-w-xs">{p.item_titulo}</span>)}
              </div>
              <p className="text-sm rounded-lg bg-sky-50 px-3 py-2 text-sky-950"><span className="text-xs font-semibold text-sky-700 mr-1.5">IA</span>{p.ia_auto.respuesta || '(sin respuesta)'}</p>
              {p.ia_auto.decision === 'revisar' && p.ia_auto.motivos?.length > 0 && <p className="text-xs text-amber-700">Por qué no sale sola: {p.ia_auto.motivos.join(' · ')}</p>}
              {p.ia_auto.publicada && <p className="text-xs text-emerald-700">Publicada sola en MercadoLibre.</p>}
              {p.ia_auto.error && <p className="text-xs text-red-600">{p.ia_auto.error}</p>}
              {p.respuesta && p.respuesta.trim() !== (p.ia_auto.respuesta ?? '').trim() && (
                <p className="text-sm rounded-lg bg-neutral-50 px-3 py-2 text-neutral-700"><span className="text-xs font-semibold text-neutral-500 mr-1.5">Publicada</span>{p.respuesta}</p>)}
              {!p.respuesta && p.estado === 'UNANSWERED' && <p className="text-xs text-neutral-400">Todavía sin responder.</p>}
              {p.ia_auto.decision === 'sola' && (
                <div className="flex gap-1.5">
                  {(['bien', 'mal'] as const).map(m => (
                    <button key={m} onClick={() => marcar(p.id, p.ia_auto.marca === m ? null : m)}
                      className={`px-2.5 py-1 rounded-md text-xs border ${p.ia_auto.marca === m
                        ? m === 'bien' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                      {m === 'bien' ? '✓ Bien' : '✗ Mal'}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
