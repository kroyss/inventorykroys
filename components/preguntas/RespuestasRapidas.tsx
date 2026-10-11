'use client'
import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { problemasDelTexto, type Plantilla } from '@/lib/preguntasTexto'
import type { Propuesta } from '@/lib/propuestasRespuestas'

// Preguntas → Configuración: las respuestas rápidas con su camino a automática (2026-10-11).
//   Con clic → Lista para automática (muchos usos sin cambios) → Automática (solo si el vendedor
//   la activa). Debajo: propuestas de respuestas nuevas sacadas de lo que más repite, y lo que el
//   sistema aprendió de cada producto (envío gratis sí/no), corregible.

interface EstadoPl {
  id: string; usos: number; sin_cambios: number; automaticas: number; estado: 'clic' | 'lista' | 'automatica'
  probadas: { temas: string; n: number; pct: number; activa: boolean }[]
}
interface Hecho {
  item_id: string; envio_gratis: boolean | null; fuente: string | null; precio_ref: number | null
  titulo: string | null; imagen: string | null; link: string | null
}
interface Info {
  plantillas: EstadoPl[]; hechos: Hecho[]; propuestas: Propuesta[]; pausa: boolean; automaticasHoy: number
  reglas: { lista_usos: number; lista_pct: number; umbral: number }
}

const nuevoId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const SEMAFORO = {
  clic:       { t: 'Con clic', c: 'bg-neutral-100 text-neutral-600' },
  lista:      { t: 'Lista para automática', c: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
  automatica: { t: 'Automática', c: 'bg-sky-600 text-white' },
} as const

export function RespuestasRapidas({ iniciales, onGuardado }: { iniciales: Plantilla[]; onGuardado: () => void }) {
  const confirm = useConfirm()
  const [lista, setLista] = useState<Plantilla[]>(iniciales)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)   // detalle "probada en"
  const num = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'))
  const cambiar = (i: number, c: Partial<Plantilla>) => { setLista(l => l.map((p, j) => j === i ? { ...p, ...c } : p)); setMsg(null) }

  const cargarInfo = useCallback(() => {
    fetch('/api/preguntas/respuestas').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setInfo(d) }).catch(() => {})
  }, [])
  useEffect(() => { cargarInfo() }, [cargarInfo])

  const guardarLista = async (nueva: Plantilla[]) => {
    const limpias = nueva.map(p => ({
      ...p, id: p.id || nuevoId(), titulo: p.titulo.trim(), texto: p.texto.trim(),
      palabras: (p.palabras ?? []).map(w => w.trim().toLowerCase()).filter(Boolean),
    })).filter(p => p.titulo && p.texto)
    const malas = limpias.filter(p => problemasDelTexto(p.texto).length)
    if (malas.length) { setMsg({ ok: false, t: `"${malas[0].titulo}": ${problemasDelTexto(malas[0].texto).join(', ')}` }); return false }
    setGuardando(true)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preguntas_plantillas: JSON.stringify(limpias) }),
    })
    setGuardando(false)
    if (!r.ok) { setMsg({ ok: false, t: 'No se pudo guardar' }); return false }
    setLista(limpias); setMsg({ ok: true, t: 'Guardadas' }); onGuardado(); cargarInfo()
    return true
  }

  const ponerAuto = async (i: number, auto: boolean) => {
    const p = lista[i]
    if (auto) {
      const ok = await confirm({
        title: 'Activar respuesta automática',
        message: `"${p.titulo}" se publicará SOLA en MercadoLibre cada vez que el sistema la elija (solo en las preguntas donde quedó probada, y nunca prometiendo envío gratis en un producto sin confirmar).\n\nSale a tu nombre y no se puede editar después. Puedes desactivarla o pausar todas cuando quieras.`,
        confirmText: 'Activar',
      })
      if (!ok) return
    }
    await guardarLista(lista.map((x, j) => j === i ? { ...x, auto } : x))
  }

  const pausar = async (pausa: boolean) => {
    await fetch('/api/preguntas/respuestas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'pausa', pausa }) })
    cargarInfo()
  }

  const crearPropuesta = async (p: Propuesta) => {
    if (await guardarLista([...lista, { id: nuevoId(), titulo: p.titulo, texto: p.texto, palabras: p.palabras }])) {
      setMsg({ ok: true, t: `Creada "${p.titulo}": revísala arriba (texto y palabras) y guarda si la cambias.` })
    }
  }
  const descartar = async (p: Propuesta) => {
    await fetch('/api/preguntas/respuestas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'descartar', texto: p.texto }) })
    cargarInfo()
  }

  const est = (p: Plantilla) => info?.plantillas.find(x => x.id === p.id)
  const hayAuto = lista.some(p => p.auto)

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-neutral-900">Respuestas rápidas</h2>
            <p className="text-xs text-neutral-500 max-w-2xl">
              Salen como botones en cada pregunta, y el sistema las <b>sugiere ya escritas</b> en las preguntas sencillas donde quedaron probadas
              con tus respuestas anteriores (≥{info?.reglas.umbral ?? 80}% de acierto). Cuando una la envías {info?.reglas.lista_usos ?? 30}+ veces
              casi siempre sin cambios ({info?.reglas.lista_pct ?? 95}%), se ofrece <b>hacerla automática</b>.
            </p>
          </div>
          <button onClick={() => setLista(l => [...l, { id: nuevoId(), titulo: '', texto: '', precio_desde: null, precio_hasta: null }])}
            className="btn-secondary text-sm whitespace-nowrap">+ Agregar</button>
        </div>

        {hayAuto && info && (
          <div className={`rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-3 ${info.pausa ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-sky-50 text-sky-900 border border-sky-200'}`}>
            <span className="flex-1">
              {info.pausa ? 'Respuestas automáticas en PAUSA: nada se publica solo.' : <>Respuestas automáticas activas · hoy se publicaron <b>{info.automaticasHoy}</b> solas.</>}
            </span>
            <button onClick={() => pausar(!info.pausa)} className="btn-secondary text-xs">{info.pausa ? 'Reanudar' : 'Pausar todas'}</button>
          </div>
        )}

        {lista.length === 0 && <p className="text-sm text-neutral-400">Todavía no hay respuestas rápidas.</p>}
        <div className="space-y-3">
          {lista.map((p, i) => {
            const e = est(p)
            const sem = SEMAFORO[p.auto ? 'automatica' : e?.estado ?? 'clic']
            const pct = e && e.usos ? Math.round((100 * e.sin_cambios) / e.usos) : null
            return (
              <div key={p.id ?? i} className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={p.titulo} onChange={ev => cambiar(i, { titulo: ev.target.value })} placeholder="Nombre corto (ej. Disponible + envío gratis)"
                    className="flex-1 min-w-[14rem] border border-neutral-300 rounded-lg px-3 py-1.5 text-sm font-medium" />
                  <label className="text-xs text-neutral-500 flex items-center gap-1">desde $
                    <input value={p.precio_desde ?? ''} onChange={ev => cambiar(i, { precio_desde: num(ev.target.value) })} inputMode="decimal"
                      className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
                  </label>
                  <label className="text-xs text-neutral-500 flex items-center gap-1">menos de $
                    <input value={p.precio_hasta ?? ''} onChange={ev => cambiar(i, { precio_hasta: num(ev.target.value) })} inputMode="decimal"
                      className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
                  </label>
                  <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} className="btn-ghost text-xs text-red-600">Quitar</button>
                </div>
                <textarea value={p.texto} onChange={ev => cambiar(i, { texto: ev.target.value })} rows={2} maxLength={2000}
                  placeholder="Texto de la respuesta" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
                <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  Palabras propias que la activan
                  <input value={(p.palabras ?? []).join(', ')} onChange={ev => cambiar(i, { palabras: ev.target.value.split(',') })}
                    placeholder="opcional, separadas por coma (ej. mrw, cobro destino)"
                    className="flex-1 min-w-[14rem] border border-neutral-300 rounded-lg px-2 py-1 text-xs" />
                </label>

                {/* Semáforo: usos, sin cambios, dónde quedó probada y el paso a automática */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 pt-1 border-t border-neutral-100">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${sem.c}`}>{sem.t}</span>
                  {e && <span>Usada {e.usos} {e.usos === 1 ? 'vez' : 'veces'} (90 días){pct !== null && ` · ${pct}% sin cambios`}{e.automaticas ? ` · ${e.automaticas} automáticas` : ''}</span>}
                  {e && e.probadas.length > 0 && (
                    <button onClick={() => setAbierta(abierta === p.id ? null : p.id ?? null)} className="text-sky-700 hover:underline">
                      {e.probadas.some(x => x.activa) ? `Se sugiere en ${e.probadas.filter(x => x.activa).length} tipo(s) de pregunta` : 'Todavía no se sugiere'} {abierta === p.id ? '▲' : '▼'}
                    </button>
                  )}
                  <span className="ml-auto flex gap-2">
                    {p.auto
                      ? <button onClick={() => ponerAuto(i, false)} disabled={guardando} className="btn-secondary text-xs">Desactivar automática</button>
                      : e?.estado === 'lista' && <button onClick={() => ponerAuto(i, true)} disabled={guardando} className="btn-primary text-xs">Activar automática</button>}
                  </span>
                </div>
                {abierta === p.id && e && (
                  <ul className="text-xs text-neutral-600 space-y-0.5 pl-1">
                    {e.probadas.map(x => (
                      <li key={x.temas} className={x.activa ? '' : 'text-neutral-400'}>
                        {x.activa ? '✓' : '✗'} Preguntas de {x.temas}: coincidió {x.pct}% en {x.n} respuestas anteriores{x.activa ? '' : ' (no alcanza, no se sugiere)'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-end gap-3">
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</span>}
          <button onClick={() => guardarLista(lista)} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar respuestas rápidas'}</button>
        </div>
      </section>

      {info && info.propuestas.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-neutral-900">Respuestas que más repites</h2>
            <p className="text-xs text-neutral-500">Sacadas de lo que respondiste en los últimos 90 días y que todavía no es respuesta rápida. Créala con un clic (después puedes cambiar el texto y las palabras) o descártala.</p>
          </div>
          <div className="space-y-2">
            {info.propuestas.map(p => (
              <div key={p.texto} className="border border-neutral-200 rounded-lg p-3 flex flex-wrap gap-3">
                <div className="flex-1 min-w-[16rem] space-y-1">
                  <div className="text-sm"><b>{p.titulo}</b> <span className="text-xs text-neutral-500">· la respondiste {p.veces} veces</span></div>
                  <p className="text-sm text-neutral-800">&ldquo;{p.texto}&rdquo;</p>
                  {p.palabras.length > 0 && <p className="text-xs text-neutral-500">Se activaría con: {p.palabras.join(', ')}</p>}
                  <p className="text-xs text-neutral-400">Ej.: {p.ejemplos.slice(0, 2).map(x => `"${x.slice(0, 60)}"`).join(' · ')}</p>
                </div>
                <div className="flex items-start gap-2">
                  <button onClick={() => descartar(p)} className="btn-ghost text-xs">Descartar</button>
                  <button onClick={() => crearPropuesta(p)} disabled={guardando} className="btn-primary text-xs">Crear</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {info && <AprendidoProductos hechos={info.hechos} onCambio={cargarInfo} />}
    </div>
  )
}

/** Lo que el sistema aprendió de cada producto (envío gratis sí / no), corregible. */
function AprendidoProductos({ hechos, onCambio }: { hechos: Hecho[]; onCambio: () => void }) {
  const [filtro, setFiltro] = useState<'si' | 'no'>('no')
  const conEnvio = hechos.filter(h => h.envio_gratis === true), sinEnvio = hechos.filter(h => h.envio_gratis === false)
  const lista = filtro === 'si' ? conEnvio : sinEnvio
  const cambiar = async (item_id: string, envio_gratis: boolean | null) => {
    await fetch('/api/preguntas/respuestas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'hecho', item_id, envio_gratis }) })
    onCambio()
  }
  const FUENTE: Record<string, string> = { clic: 'lo confirmaste al enviar', respuesta: 'lo dijiste en una respuesta', manual: 'lo marcaste aquí' }
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Lo aprendido de cada producto</h2>
          <p className="text-xs text-neutral-500 max-w-2xl">
            El sistema aprende con tus respuestas qué publicaciones tienen envío gratis y cuáles no. En las que no tienen, nunca sugiere envío gratis.
            Si cambias el precio de un producto y ya no califica (o sí), corrígelo aquí.
          </p>
        </div>
        <div className="flex gap-1.5">
          {([['no', `Sin envío gratis (${sinEnvio.length})`], ['si', `Con envío gratis (${conEnvio.length})`]] as const).map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)}
              className={`px-3 py-1 rounded-full text-xs border ${filtro === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
          ))}
        </div>
      </div>
      {lista.length === 0 ? <p className="text-sm text-neutral-400">Nada todavía.</p> : (
        <div className="divide-y divide-neutral-100">
          {lista.map(h => (
            <div key={h.item_id} className="flex items-center gap-3 py-2">
              <div className="w-9 h-9 shrink-0 rounded-md border border-neutral-200 bg-white overflow-hidden flex items-center justify-center">
                {h.imagen
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={h.imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
                  : <span className="text-neutral-300 text-xs">—</span>}
              </div>
              <div className="min-w-0 flex-1">
                {h.link
                  ? <a href={h.link} target="_blank" rel="noreferrer" className="text-sm text-neutral-800 truncate block hover:underline underline-offset-2">{h.titulo ?? h.item_id} <span className="text-neutral-400">↗</span></a>
                  : <span className="text-sm text-neutral-800 truncate block">{h.titulo ?? h.item_id}</span>}
                <span className="text-xs text-neutral-400">{FUENTE[h.fuente ?? ''] ?? ''}{h.precio_ref ? ` · precio entonces $${h.precio_ref}` : ''}</span>
              </div>
              <button onClick={() => cambiar(h.item_id, !h.envio_gratis)} className="btn-ghost text-xs">
                {h.envio_gratis ? 'No tiene envío gratis' : 'Sí tiene envío gratis'}
              </button>
              <button onClick={() => cambiar(h.item_id, null)} className="btn-ghost text-xs text-neutral-400" title="Olvidar: se vuelve a confirmar con tu próximo clic">Olvidar</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
