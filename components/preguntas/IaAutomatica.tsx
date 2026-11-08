'use client'
import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Cargando } from '@/components/ui'
import { FrenosIA } from './FrenosIA'

// Preguntas → Configuración → Respuesta automática con IA (01-11-2026, lib/iaAutomatica.ts).
// Modo prueba: la IA decide qué habría salido solo, sin publicar; el vendedor marca cada una bien o mal y ve el % de
// acierto antes de activarla de verdad.

type Modo = 'apagado' | 'sombra' | 'real'
interface Eco {
  via?: 'plantilla' | 'ia'; decision?: 'sola' | 'revisar'; motivos?: string[]; respuesta?: string; modelo?: string
  costo?: number; entrada?: number; salida?: number; marca?: 'bien' | 'mal' | null; error?: string; heredada?: boolean
}
interface Decision {
  modo: Modo; decision: 'sola' | 'revisar'; motivos: string[]; respuesta?: string; confianza?: string
  publicada?: boolean; escape?: boolean; error?: string; marca?: 'bien' | 'mal' | null; costo?: number
  entrada?: number; salida?: number; eco?: Eco; eco55?: Eco
}
interface ResumenEco {
  comparadas: number; errores: number; costoReal: number; costoEco: number; tokensReal: number; tokensEco: number
  conTokens: number; tokensEcoTodas: number
  solasReal: number; solasEco: number; sinIA: number; ambasSolas: number; marcadas: number; bien: number
}
interface Lado55 { costo: number; tokens: number; solas: number; marcadas: number; bien: number }
interface Resumen55 { comparadas: number; errores: number; costoReal: number; h45: Lado55; h55: Lado55; sinMarcar: number }
interface Fila { id: string; texto: string; item_titulo: string | null; item_permalink: string | null; fecha: string; estado: string; respuesta: string | null; ia_auto: Decision }
interface Info {
  modo: Modo; desde: string | null
  cupo: { usados: number; limite: number | null; quedan: number | null; agotado: boolean }
  resumen: { procesadas: number; solas: number; revisar: number; marcadas: number; bien: number; costo: number }
  economica: ResumenEco
  haiku55: Resumen55
  preguntas: Fila[]
}

const MODOS: { v: Modo; t: string; d: string }[] = [
  { v: 'apagado', t: 'Apagada', d: 'La IA solo responde cuando tocas «Proponer con IA».' },
  { v: 'sombra', t: 'Modo prueba', d: 'La IA lee cada pregunta nueva y decide si habría salido sola, pero NO publica nada. Tú marcas si estaba bien.' },
  { v: 'real', t: 'Activa', d: 'Las de confianza alta que pasan todas las revisiones se publican solas. El resto te queda con la respuesta ya escrita.' },
]

const usd = (n: number, d = 2) => `$${n.toFixed(d)}`
const miles = (n: number) => Math.round(n).toLocaleString('de-DE')
const hora = (f: string) => new Date(`${f}Z`).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function IaAutomatica() {
  const confirm = useConfirm()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ver, setVer] = useState<'sola' | 'revisar' | 'eco' | 'h55'>('sola')
  const [todo, setTodo] = useState(false)
  const cargar = useCallback(() => {
    fetch(`/api/preguntas/ia-auto${todo ? '?todo=1' : ''}`).then(async r => {
      const d = await r.json().catch(() => null)
      if (r.ok) setInfo(d); else setError(d?.error ?? 'No se pudo cargar')
    }).catch(() => setError('No se pudo cargar'))
  }, [todo])
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
  const marcarEco = (id: string, marca: 'bien' | 'mal' | null, campo: 'eco' | 'eco55' = 'eco') => {
    setInfo(i => i && { ...i, preguntas: i.preguntas.map(p => p.id === id && p.ia_auto[campo] ? { ...p, ia_auto: { ...p.ia_auto, [campo]: { ...p.ia_auto[campo], marca, heredada: false } } } : p) })
    post({ accion: 'marcar_eco', id, marca, campo })
  }

  if (error && !info) return <p className="text-sm text-red-600">{error}</p>
  if (!info) return <Cargando />
  const r = info.resumen
  const filas = ver === 'eco' || ver === 'h55' ? [] : info.preguntas.filter(p => p.ia_auto.decision === ver)
  const conEco = info.preguntas.filter(p => p.ia_auto.eco?.decision)
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

      <FrenosIA conEscape={false} />

      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-neutral-500">Medir:</span>
          {([[false, 'Desde el cambio a Haiku 5.5 (06-11)'], [true, 'Todo el historial']] as const).map(([v, t]) => (
            <button key={t} onClick={() => setTodo(v)}
              className={`px-2.5 py-1 rounded-full border ${todo === v ? 'bg-sky-700 text-white border-sky-700' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <span><b>{r.procesadas}</b> procesadas</span>
          <span className="text-emerald-700"><b>{r.solas}</b> {info.modo === 'real' ? 'salieron' : 'habrían salido'} solas</span>
          <span className="text-amber-700"><b>{r.revisar}</b> para revisar</span>
          <span>Marcadas: <b>{r.marcadas}</b>{pct !== null && <> · <b className={pct >= 95 ? 'text-emerald-700' : 'text-amber-700'}>{pct}% bien</b></>}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {([['sola', `${info.modo === 'real' ? 'Salieron' : 'Habrían salido'} solas (${r.solas})`], ['revisar', `Para revisar (${r.revisar})`],
             ['eco', `Versión económica (${info.economica.comparadas})`], ['h55', `Haiku 4.5 vs 5.5 (${info.haiku55.comparadas})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setVer(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${ver === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
          ))}
        </div>
        {ver === 'sola' && <p className="text-xs text-neutral-500">Marca cada una: ¿la habrías publicado tal cual? Con 95% de «bien» conviene activarla.</p>}
        {ver === 'eco' && <ComparacionEco e={info.economica} filas={conEco} marcar={marcarEco} />}
        {ver === 'h55' && <Comparacion55 e={info.haiku55} filas={info.preguntas.filter(p => p.ia_auto.eco?.decision && p.ia_auto.eco55?.decision)}
          marcar={(id, m) => marcarEco(id, m, 'eco55')} />}
        {ver !== 'eco' && ver !== 'h55' && !filas.length && <p className="text-sm text-neutral-500">Todavía no hay preguntas aquí.</p>}
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
              {p.ia_auto.escape && <p className="text-xs text-sky-700">Se respondió con la frase de «Responder todo».</p>}
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

// Versión económica en paralelo (04-11-2026, lib/iaEconomica.ts): lo que habría hecho la receta barata con las mismas
// preguntas, sin publicar nada. El dueño la compara con la real (costo, tokens, cuántas solas, acierto) para decidir.
function Dato({ t, real, eco, bueno }: { t: string; real: string; eco: string; bueno?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{t}</div>
      <div className="text-sm"><span className="text-neutral-500">Actual </span><b>{real}</b></div>
      <div className={`text-sm ${bueno ? 'text-emerald-700' : 'text-amber-700'}`}><span className="text-neutral-500">Económica </span><b>{eco}</b></div>
    </div>
  )
}

function ComparacionEco({ e, filas, marcar }: { e: ResumenEco; filas: Fila[]; marcar: (id: string, m: 'bien' | 'mal' | null) => void }) {
  const [solo, setSolo] = useState<'todas' | 'distintas' | 'eco_sola'>('todas')
  if (!e.comparadas) return <p className="text-sm text-neutral-500">Todavía no hay preguntas comparadas: se van sumando con cada pregunta nueva que procesa la IA.</p>
  const ahorro = e.costoReal > 0 ? Math.round(100 * (1 - e.costoEco / e.costoReal)) : 0
  const porPreg = (t: number) => t / e.comparadas
  const pct = e.marcadas ? Math.round((100 * e.bien) / e.marcadas) : null
  const ver = filas.filter(p => solo === 'todas' ? true
    : solo === 'eco_sola' ? p.ia_auto.eco?.decision === 'sola'
    : p.ia_auto.decision !== p.ia_auto.eco?.decision || (p.ia_auto.respuesta ?? '').trim() !== (p.ia_auto.eco?.respuesta ?? '').trim())
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Con cada pregunta, además de la IA actual, corre la <b>versión económica</b> (la respuesta rápida sin IA cuando alcanza; si no, el modelo
        barato con menos datos) y se guarda lo que habría respondido. <b>No publica nada.</b> Marca las que habrían salido solas para medir su acierto.
      </p>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Dato t="Costo por pregunta" real={usd(porPreg(e.costoReal), 4)} eco={usd(porPreg(e.costoEco), 4)} bueno={e.costoEco <= e.costoReal} />
        <Dato t={`Costo de las ${e.comparadas}`} real={usd(e.costoReal)} eco={`${usd(e.costoEco)} (−${ahorro}%)`} bueno={ahorro > 0} />
        {e.conTokens
          ? <Dato t="Tokens por pregunta" real={miles(e.tokensReal / e.conTokens)} eco={miles(e.tokensEco / e.conTokens)} bueno={e.tokensEco <= e.tokensReal} />
          : <Dato t="Tokens por pregunta" real="—" eco={miles(porPreg(e.tokensEcoTodas))} bueno />}
        <Dato t="Salen solas" real={`${e.solasReal} (${Math.round(100 * e.solasReal / e.comparadas)}%)`}
          eco={`${e.solasEco} (${Math.round(100 * e.solasEco / e.comparadas)}%)`} bueno={e.solasEco >= e.solasReal} />
      </div>
      <p className="text-xs text-neutral-600">
        <b>{e.sinIA}</b> respondidas con la respuesta rápida, sin IA · <b>{e.ambasSolas}</b> salen solas en las dos ·
        acierto de la económica: {pct === null ? 'sin marcar todavía' : <b className={pct >= 95 ? 'text-emerald-700' : 'text-amber-700'}>{pct}% bien ({e.bien} de {e.marcadas})</b>}
        {e.errores > 0 && <> · <span className="text-red-600">{e.errores} con error</span></>}
        {' '}· al mes (~1.600 preguntas): actual <b>{usd(porPreg(e.costoReal) * 1600, 0)}</b>, económica <b>{usd(porPreg(e.costoEco) * 1600, 0)}</b>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {([['todas', 'Todas'], ['distintas', 'Solo donde difieren'], ['eco_sola', 'Económica sola']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setSolo(k)}
            className={`px-2.5 py-1 rounded-full text-xs border ${solo === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
        ))}
      </div>
      <ul className="divide-y divide-neutral-100">
        {ver.map(p => {
          const x = p.ia_auto.eco!
          return (
            <li key={p.id} className="py-3 space-y-1.5">
              <p className="text-sm text-neutral-900"><span className="text-neutral-400 text-xs mr-1.5">{hora(p.fecha)}</span>{p.texto}</p>
              {p.item_titulo && <p className="text-xs text-neutral-500 truncate">{p.item_titulo}</p>}
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950">
                  <div className="text-[11px] font-semibold text-sky-700 mb-0.5">
                    ACTUAL · {p.ia_auto.decision === 'sola' ? 'sola' : 'revisar'} · {usd(p.ia_auto.costo ?? 0, 4)}
                    {p.ia_auto.entrada ? ` · ${miles((p.ia_auto.entrada ?? 0) + (p.ia_auto.salida ?? 0))} tokens` : ''}
                  </div>
                  {p.ia_auto.respuesta || '(sin respuesta)'}
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm ${x.decision === 'sola' ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'}`}>
                  <div className={`text-[11px] font-semibold mb-0.5 ${x.decision === 'sola' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    ECONÓMICA · {x.decision === 'sola' ? 'sola' : 'revisar'} · {usd(x.costo ?? 0, 4)} · {x.via === 'plantilla' ? 'sin IA' : `${miles((x.entrada ?? 0) + (x.salida ?? 0))} tokens`}
                  </div>
                  {x.respuesta || '(sin respuesta)'}
                  {x.decision === 'revisar' && !!x.motivos?.length && <div className="mt-1 text-xs opacity-80">{x.motivos.join(' · ')}</div>}
                </div>
              </div>
              {p.respuesta && p.respuesta.trim() !== (p.ia_auto.respuesta ?? '').trim() && (
                <p className="text-xs text-neutral-600"><span className="font-semibold">Publicada:</span> {p.respuesta}</p>)}
              {x.decision === 'sola' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">¿La económica estaba bien?</span>
                  {(['bien', 'mal'] as const).map(m => (
                    <button key={m} onClick={() => marcar(p.id, x.marca === m ? null : m)}
                      className={`px-2.5 py-1 rounded-md text-xs border ${x.marca === m
                        ? m === 'bien' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                      {m === 'bien' ? '✓ Bien' : '✗ Mal'}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Haiku 4.5 vs Haiku 5.5 (06-11-2026): la misma receta económica con los dos modelos, sobre las mismas preguntas, sin
// publicar. Haiku 5.5 cuesta 10× menos; el dueño marca las de 5.5 que habrían salido solas (las idénticas a una de 4.5
// ya marcada heredan la marca) y decide si se cambia.
function Lado({ t, l, n, pct, bueno }: { t: string; l: Lado55; n: number; pct: number | null; bueno?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${bueno ? 'border-emerald-300 bg-emerald-50/40' : 'border-neutral-200'}`}>
      <div className="font-semibold text-neutral-900 mb-1">{t}</div>
      <div>Costo por pregunta <b>{usd(l.costo / n, 4)}</b> · al mes (~1.600) <b>{usd((l.costo / n) * 1600, 2)}</b></div>
      <div>Tokens por pregunta <b>{miles(l.tokens / n)}</b></div>
      <div>Salen solas <b>{l.solas} ({Math.round((100 * l.solas) / n)}%)</b></div>
      <div>Acierto {pct === null ? 'sin marcar' : <b className={pct >= 95 ? 'text-emerald-700' : 'text-amber-700'}>{pct}% bien ({l.bien} de {l.marcadas})</b>}</div>
    </div>
  )
}

function Comparacion55({ e, filas, marcar }: { e: Resumen55; filas: Fila[]; marcar: (id: string, m: 'bien' | 'mal' | null) => void }) {
  const [solo, setSolo] = useState<'pendientes' | 'distintas' | 'todas'>('pendientes')
  if (!e.comparadas) return <p className="text-sm text-neutral-500">La prueba de Haiku 5.5 todavía no tiene preguntas: se van sumando.</p>
  const pct = (l: Lado55) => l.marcadas ? Math.round((100 * l.bien) / l.marcadas) : null
  const ver = filas.filter(p => {
    const a = p.ia_auto.eco!, b = p.ia_auto.eco55!
    return solo === 'todas' ? true
      : solo === 'pendientes' ? b.decision === 'sola' && !b.marca
      : a.decision !== b.decision || (a.respuesta ?? '').trim() !== (b.respuesta ?? '').trim()
  })
  const caja = (x: Eco, t: string) => (
    <div className={`rounded-lg px-3 py-2 text-sm ${x.decision === 'sola' ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'}`}>
      <div className={`text-[11px] font-semibold mb-0.5 ${x.decision === 'sola' ? 'text-emerald-700' : 'text-amber-700'}`}>
        {t} · {x.decision === 'sola' ? 'sola' : 'revisar'} · {usd(x.costo ?? 0, 4)}{x.via === 'plantilla' ? ' · sin IA' : ''}
        {x.marca ? ` · marcada ${x.marca === 'bien' ? '✓ bien' : '✗ mal'}${x.heredada ? ' (igual a 4.5)' : ''}` : ''}
      </div>
      {x.respuesta || '(sin respuesta)'}
      {x.decision === 'revisar' && !!x.motivos?.length && <div className="mt-1 text-xs opacity-80">{x.motivos.join(' · ')}</div>}
    </div>
  )
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        La misma versión económica con <b>Haiku 5.5</b> (10 veces más barato que Haiku 4.5), sobre las mismas {e.comparadas} preguntas. <b>No publica nada.</b>{' '}
        Marca las de Haiku 5.5 que habrían salido solas; las que respondió igual que una de 4.5 ya marcada traen esa marca.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <Lado t="Haiku 4.5 (la económica de hoy)" l={e.h45} n={e.comparadas} pct={pct(e.h45)} />
        <Lado t="Haiku 5.5" l={e.h55} n={e.comparadas} pct={pct(e.h55)} bueno />
      </div>
      <p className="text-xs text-neutral-600">
        La IA actual (Sonnet) en estas mismas: <b>{usd(e.costoReal / e.comparadas, 4)}</b> por pregunta
        {e.errores > 0 && <> · <span className="text-red-600">{e.errores} con error</span></>}
        {e.sinMarcar > 0 && <> · <b>{e.sinMarcar}</b> de Haiku 5.5 sin marcar</>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {([['pendientes', `Por marcar (${e.sinMarcar})`], ['distintas', 'Donde difieren'], ['todas', 'Todas']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setSolo(k)}
            className={`px-2.5 py-1 rounded-full text-xs border ${solo === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
        ))}
      </div>
      {!ver.length && <p className="text-sm text-neutral-500">Nada por aquí.</p>}
      <ul className="divide-y divide-neutral-100">
        {ver.map(p => {
          const b = p.ia_auto.eco55!
          return (
            <li key={p.id} className="py-3 space-y-1.5">
              <p className="text-sm text-neutral-900"><span className="text-neutral-400 text-xs mr-1.5">{hora(p.fecha)}</span>{p.texto}</p>
              {p.item_titulo && <p className="text-xs text-neutral-500 truncate">{p.item_titulo}</p>}
              <div className="grid gap-2 md:grid-cols-2">{caja(p.ia_auto.eco!, 'HAIKU 4.5')}{caja(b, 'HAIKU 5.5')}</div>
              {p.respuesta && <p className="text-xs text-neutral-600"><span className="font-semibold">Publicada:</span> {p.respuesta}</p>}
              {b.decision === 'sola' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">¿Haiku 5.5 estaba bien?</span>
                  {(['bien', 'mal'] as const).map(m => (
                    <button key={m} onClick={() => marcar(p.id, b.marca === m ? null : m)}
                      className={`px-2.5 py-1 rounded-md text-xs border ${b.marca === m
                        ? m === 'bien' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}>
                      {m === 'bien' ? '✓ Bien' : '✗ Mal'}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
