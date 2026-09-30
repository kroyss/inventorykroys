'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { StatusBadge, STATUS_LABELS } from '@/components/ui'
import { problemasDelTexto } from '@/lib/preguntasTexto'

interface Venta {
  cuenta: string
  orden: { id: string; fecha: string; estado: string; tags: string[]; total: number; moneda: string; comprador: string | null
           productos: { titulo: string; cantidad: number }[] }
  calificacion: { fulfilled: boolean; rating: string; reason?: string | null; message?: string | null; status?: string } | null
  calificacion_comprador: { rating?: string } | null
  mensajes: { propio: boolean; texto: string; fecha: string; moderacion: string | null }[] | null
  sistema: { status: string; created_at: string } | null
}

const MOTIVOS: Record<string, string> = {
  BUYER_NOT_ENOUGH_MONEY: 'El comprador no pagó / no tenía el dinero',
  BUYER_REGRETS: 'El comprador se arrepintió',
  THEY_DIDNT_ANSWER: 'El comprador no respondió',
  OUT_OF_STOCK: 'No tenía el producto (sin stock)',
  THEY_NOT_HONORING_POLICIES: 'El comprador no respetó las condiciones',
}
const RATING: Record<string, string> = { positive: 'Positiva', neutral: 'Neutral', negative: 'Negativa' }
const CONCRETADAS = ['DESCARGADA', 'DESCARGADA_LOCAL', 'PROCESADA']

/** Una venta de ML: ver su estado, calificar al comprador y escribirle. */
export default function VentaMLPanel() {
  const confirm = useConfirm()
  const [numero, setNumero] = useState('')
  const [venta, setVenta] = useState<Venta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; detalle?: unknown } | null>(null)

  const [concretada, setConcretada] = useState(true)
  const [rating, setRating] = useState<'positive' | 'neutral' | 'negative'>('positive')
  const [motivo, setMotivo] = useState('BUYER_NOT_ENOUGH_MONEY')
  const [mensajeCal, setMensajeCal] = useState('Excelente, persona seria y responsable, un placer !')
  const [textoMsg, setTextoMsg] = useState('')
  const [enviando, setEnviando] = useState<null | 'cal' | 'msg'>(null)

  const buscar = async () => {
    const n = numero.replace(/\D/g, '')
    if (!n) return
    setCargando(true); setError(null); setVenta(null); setResultado(null)
    try {
      const r = await fetch(`/api/ventas-ml/${n}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo leer la venta'); return }
      setVenta(d)
      // Sugerencia según el sistema: concretada → positiva; si no, neutral no concretada.
      const ok = d.sistema && CONCRETADAS.includes(d.sistema.status)
      setConcretada(!!ok || !d.sistema)
      setRating(ok || !d.sistema ? 'positive' : 'neutral')
      setMensajeCal(ok || !d.sistema ? 'Excelente, persona seria y responsable, un placer !' : 'No tenemos su compra registrada')
    } finally { setCargando(false) }
  }

  const calificar = async () => {
    if (!venta) return
    const resumen = `${RATING[rating]} · ${concretada ? 'concretada' : `no concretada (${MOTIVOS[motivo]})`}\n"${mensajeCal}"`
    if (!await confirm({ title: 'Calificar al comprador', message: `Venta ${venta.orden.id} (${venta.cuenta}). Es pública en MercadoLibre:\n\n${resumen}`, confirmText: 'Calificar' })) return
    setEnviando('cal'); setResultado(null)
    try {
      const r = await fetch(`/api/ventas-ml/${venta.orden.id}/calificar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concretada, calificacion: rating, mensaje: mensajeCal, motivo: concretada ? undefined : motivo }),
      })
      const d = await r.json().catch(() => ({}))
      setResultado(r.ok && d.ok
        ? { ok: true, texto: 'Calificación publicada y confirmada en MercadoLibre.' }
        : { ok: false, texto: d.error ?? 'MercadoLibre no confirmó la calificación', detalle: d.detalle ?? d.respuestaML })
      if (r.ok) await buscar()
    } finally { setEnviando(null) }
  }

  const escribir = async () => {
    if (!venta) return
    if (!await confirm({ title: 'Enviar mensaje', message: `Al comprador de la venta ${venta.orden.id} (${venta.cuenta}):\n\n"${textoMsg.trim()}"`, confirmText: 'Enviar' })) return
    setEnviando('msg'); setResultado(null)
    try {
      const r = await fetch(`/api/ventas-ml/${venta.orden.id}/mensaje`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: textoMsg }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setResultado({ ok: false, texto: [d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · '), detalle: d.detalle }); return }
      setResultado({ ok: true, texto: `Mensaje enviado${d.ultimo?.moderacion ? ` · moderación de ML: ${d.ultimo.moderacion}` : ''}.` })
      setTextoMsg('')
      await buscar()
    } finally { setEnviando(null) }
  }

  const problemasMsg = textoMsg.trim() ? problemasDelTexto(textoMsg) : []
  const caja = 'bg-white rounded-xl border border-neutral-200 shadow-sm p-4'

  return (
    <div className="space-y-4">
      <div className={`${caja} flex flex-wrap items-end gap-3`}>
        <label className="text-sm text-neutral-600 flex-1 min-w-[16rem]">Número de la venta en MercadoLibre
          <input value={numero} onChange={e => setNumero(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="2000018710679116" inputMode="numeric"
            className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono" />
        </label>
        <button onClick={buscar} disabled={cargando || !numero.trim()} className="btn-primary text-sm">{cargando ? 'Buscando…' : 'Buscar venta'}</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">{error}</div>}
      {resultado && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border ${resultado.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {resultado.texto}
          {resultado.detalle != null && <pre className="mt-2 text-xs whitespace-pre-wrap opacity-80">{JSON.stringify(resultado.detalle, null, 2)}</pre>}
        </div>
      )}

      {venta && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${caja} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{venta.cuenta}</span>
              <span className="font-mono">{venta.orden.id}</span>
              <span>{new Date(venta.orden.fecha).toLocaleString('es-VE')}</span>
            </div>
            <ul className="text-sm text-neutral-900 space-y-0.5">
              {venta.orden.productos.map((p, i) => <li key={i}>{p.cantidad} × {p.titulo}</li>)}
            </ul>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-neutral-500">En el sistema</dt>
              <dd>{venta.sistema ? <StatusBadge status={venta.sistema.status} label={STATUS_LABELS[venta.sistema.status]} /> : <span className="text-amber-700">No está cargada</span>}</dd>
              <dt className="text-neutral-500">Tu calificación</dt>
              <dd>{venta.calificacion
                ? <span>{RATING[venta.calificacion.rating] ?? venta.calificacion.rating} · {venta.calificacion.fulfilled ? 'concretada' : 'no concretada'}</span>
                : <span className="text-neutral-400">Sin calificar</span>}</dd>
              <dt className="text-neutral-500">Te calificó</dt>
              <dd>{venta.calificacion_comprador?.rating ? RATING[venta.calificacion_comprador.rating] ?? venta.calificacion_comprador.rating : <span className="text-neutral-400">Todavía no</span>}</dd>
            </dl>
            {venta.calificacion?.message && <p className="text-sm text-neutral-600 border-l-2 border-neutral-200 pl-3">{venta.calificacion.message}</p>}

            {!venta.calificacion && (
              <div className="border-t border-neutral-100 pt-3 space-y-2">
                <h3 className="font-semibold text-neutral-900 text-sm">Calificar al comprador</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  <select value={concretada ? 'si' : 'no'} onChange={e => setConcretada(e.target.value === 'si')} className="border border-neutral-300 rounded-lg px-2 py-1.5">
                    <option value="si">Se concretó</option><option value="no">No se concretó</option>
                  </select>
                  <select value={rating} onChange={e => setRating(e.target.value as typeof rating)} className="border border-neutral-300 rounded-lg px-2 py-1.5">
                    <option value="positive">Positiva</option><option value="neutral">Neutral</option><option value="negative">Negativa</option>
                  </select>
                  {!concretada && (
                    <select value={motivo} onChange={e => setMotivo(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5">
                      {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  )}
                </div>
                <input value={mensajeCal} onChange={e => setMensajeCal(e.target.value)} maxLength={160}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{mensajeCal.length}/160</span>
                  <button onClick={calificar} disabled={!!enviando || !mensajeCal.trim()} className="btn-primary text-sm">
                    {enviando === 'cal' ? 'Calificando…' : 'Calificar'}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className={`${caja} space-y-3`}>
            <h3 className="font-semibold text-neutral-900 text-sm">Mensajes de la venta</h3>
            {venta.mensajes === null ? <p className="text-sm text-neutral-400">No se pudieron leer los mensajes.</p>
              : venta.mensajes.length === 0 ? <p className="text-sm text-neutral-400">Sin mensajes todavía.</p> : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {venta.mensajes.map((m, i) => (
                  <div key={i} className={`text-sm rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-line ${m.propio ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
                    {m.texto}
                    <div className={`text-[11px] mt-1 ${m.propio ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      {new Date(m.fecha).toLocaleString('es-VE')}{m.moderacion && m.moderacion !== 'clean' ? ` · ${m.moderacion}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <textarea value={textoMsg} onChange={e => setTextoMsg(e.target.value)} rows={3} maxLength={350}
              placeholder="Escribe el mensaje para el comprador…" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
            {problemasMsg.length > 0 && <p className="text-xs text-red-600">MercadoLibre lo rechazaría: {problemasMsg.join(' · ')}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">{textoMsg.length}/350</span>
              <button onClick={escribir} disabled={!!enviando || !textoMsg.trim() || problemasMsg.length > 0} className="btn-primary text-sm">
                {enviando === 'msg' ? 'Enviando…' : 'Enviar mensaje'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
