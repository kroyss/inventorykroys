'use client'
// 23-11 (pedido de una usuaria, por el dueño: «no tiene opciones para calificar el mismo día»): ventana para calificar
// UNA venta (o las ventas de un paquete) a mano, desde Mensajes o desde Calificaciones → Próximas. Tres tipos en botones
// grandes, el texto de la plantilla ya escrito y editable, y si la venta sigue en los días de espera se pregunta antes
// si el comprador ya lo recibió o retiró. Calificar es público en ML: siempre lo dispara la persona.
import { useState } from 'react'
import Link from '@/components/ui/Link'
import { Ventana } from '@/components/ui/Ventana'

export type TipoCal = 'concretada' | 'no_concretada' | 'no_concretada_ok'
export interface PlantillasCal {
  concretada: { rating: string; mensaje: string }
  noConcretada: { rating: string; motivo: string; mensaje: string }
  noConcretadaOk?: { rating: string; motivo: string; mensaje: string }
}
const RATING: Record<string, string> = { positive: 'positiva', neutral: 'neutral', negative: 'negativa' }
const diaMes = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export const TIPOS: { k: TipoCal; icono: string; titulo: string; ayuda: string; color: string }[] = [
  { k: 'concretada', icono: '✅', titulo: 'Concretada', ayuda: 'Se entregó o retiró', color: 'emerald' },
  { k: 'no_concretada', icono: '⛔', titulo: 'No concretada', ayuda: 'No pagó o no se hizo', color: 'amber' },
  { k: 'no_concretada_ok', icono: '🤝', titulo: 'No concretada · sin problema', ayuda: 'Compra duplicada, se anuló de acuerdo', color: 'sky' },
]
const ACTIVO: Record<string, string> = {
  emerald: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30',
  amber: 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/30',
  sky: 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/30',
}
export const plantillaDe = (p: PlantillasCal, t: TipoCal) =>
  t === 'concretada' ? p.concretada : t === 'no_concretada' ? p.noConcretada
    : (p.noConcretadaOk ?? { rating: 'positive', motivo: 'BUYER_REGRETS', mensaje: 'Compra duplicada por error, gracias por avisar. ¡Un placer!' })
export const etiquetaTipo = (p: PlantillasCal, t: TipoCal) =>
  `${TIPOS.find(x => x.k === t)!.titulo} · ${RATING[plantillaDe(p, t).rating] ?? plantillaDe(p, t).rating}`

export interface VentaCal { id: string; en_espera?: boolean; lista_el?: string | null; sugerencia?: string | null; duplicada_de?: string | null }

export default function CalificarVenta({ ventas, plantillas, comprador, inicial, onCerrar, onListo, verEnCalificaciones = true }: {
  ventas: VentaCal[]; plantillas: PlantillasCal; comprador?: string | null; inicial?: TipoCal
  onCerrar: () => void; onListo: () => void; verEnCalificaciones?: boolean
}) {
  const sugerida: TipoCal = inicial ?? (ventas.some(v => v.duplicada_de) ? 'no_concretada_ok'
    : ventas.every(v => v.sugerencia === 'no_concretada') ? 'no_concretada' : 'concretada')
  const [tipo, setTipo] = useState<TipoCal>(sugerida)
  const [textos, setTextos] = useState<Record<TipoCal, string>>(() => ({
    concretada: plantillas.concretada.mensaje, no_concretada: plantillas.noConcretada.mensaje,
    no_concretada_ok: plantillaDe(plantillas, 'no_concretada_ok').mensaje,
  }))
  const [paso, setPaso] = useState<'elegir' | 'recibido'>('elegir')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const espera = ventas.find(v => v.en_espera)
  // Concretada antes de tiempo (en espera, o sin saberse todavía): primero se confirma que ya lo tiene.
  const preguntar = tipo === 'concretada' && ventas.some(v => v.en_espera || v.sugerencia === 'esperar' || v.sugerencia === 'revisar' || !v.sugerencia)
  const texto = textos[tipo]
  const pl = plantillaDe(plantillas, tipo) as { rating: string; motivo?: string; mensaje: string }

  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      const r = await fetch('/api/calificaciones/calificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordenes: ventas.map(v => ({ id: v.id, tipo, mensaje: texto.trim() || undefined, ya: tipo === 'concretada' })) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo calificar'); return }
      const malas = (d.resultados as { ok: boolean; detalle?: string }[]).filter(x => !x.ok)
      if (malas.length) { setError(malas.map(x => x.detalle).filter(Boolean).join(' · ') || 'MercadoLibre no la aceptó'); onListo(); return }
      setHecho(true); onListo()
    } catch { setError('Sin conexión: prueba de nuevo') } finally { setEnviando(false); setPaso('elegir') }
  }

  return (
    <Ventana titulo={hecho ? 'Calificada' : `Calificar${comprador ? ` a ${comprador}` : ''}`} onCerrar={onCerrar}>
      {hecho ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            ✓ Calificada como <b>{etiquetaTipo(plantillas, tipo)}</b>{ventas.length > 1 ? ` (${ventas.length} ventas del paquete)` : ''}.
          </p>
          <div className="flex justify-end"><button onClick={onCerrar} className="btn-primary text-sm">Listo</button></div>
        </div>
      ) : paso === 'recibido' ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-800"><b>¿El comprador ya lo recibió o retiró?</b></p>
          <p className="text-xs text-neutral-500">
            {espera?.lista_el ? <>Esta venta está en tus días de espera hasta el <b>{diaMes(espera.lista_el)}</b>. </> : <>El sistema todavía no la ve despachada. </>}
            Califícala concretada solo si ya la tiene: si después reclama, la calificación queda publicada.
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setPaso('elegir')} className="btn-ghost text-sm">Todavía no</button>
            <button onClick={enviar} disabled={enviando} className="btn-primary text-sm">{enviando ? 'Calificando…' : 'Sí, ya lo tiene · Calificar'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS.map(t => (
              <button key={t.k} type="button" onClick={() => setTipo(t.k)} aria-pressed={tipo === t.k}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${tipo === t.k ? ACTIVO[t.color] : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
                <span className="block text-sm font-medium text-neutral-900">{t.icono} {t.titulo}</span>
                <span className="block text-[11px] leading-snug text-neutral-500">{t.ayuda} · {RATING[plantillaDe(plantillas, t.k).rating]}</span>
              </button>
            ))}
          </div>
          {ventas.some(v => v.duplicada_de) && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              🤝 <b>Parece una compra duplicada</b>: el mismo comprador compró lo mismo ese día y la otra venta
              ({ventas.find(v => v.duplicada_de)!.duplicada_de}) sí se concretó. Por eso te sugerimos «sin problema».
            </p>
          )}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-neutral-500">
              <span>Mensaje para el comprador (público en ML)</span><span>{texto.length}/160</span>
            </span>
            <textarea value={texto} maxLength={160} rows={2} onChange={e => setTextos(x => ({ ...x, [tipo]: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          </label>
          {tipo !== 'concretada' && (
            <p className="text-[11px] text-neutral-500">Calificación {RATING[pl.rating]} · motivo: {MOTIVOS[pl.motivo ?? ''] ?? pl.motivo}. Lo cambias en Calificaciones → Configuración.</p>
          )}
          {ventas.length > 1 && <p className="text-xs text-neutral-500">Se califican las {ventas.length} ventas de este paquete.</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            {verEnCalificaciones ? <Link href="/calificaciones" className="text-center text-xs text-neutral-500 underline-offset-2 hover:underline">Ver en Calificaciones</Link> : <span />}
            <button onClick={() => preguntar ? setPaso('recibido') : enviar()} disabled={enviando || !texto.trim()} className="btn-primary text-sm">
              {enviando ? 'Calificando…' : 'Calificar'}
            </button>
          </div>
        </div>
      )}
    </Ventana>
  )
}

export const MOTIVOS: Record<string, string> = {
  BUYER_NOT_ENOUGH_MONEY: 'El comprador no pagó / no tenía el dinero',
  BUYER_REGRETS: 'El comprador se arrepintió',
  THEY_DIDNT_ANSWER: 'El comprador no respondió',
  OUT_OF_STOCK: 'No tenía el producto (sin stock)',
  THEY_NOT_HONORING_POLICIES: 'El comprador no respetó las condiciones',
}
