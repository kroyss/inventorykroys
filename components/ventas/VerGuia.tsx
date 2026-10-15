'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Ventas → Por confirmar → "Ver guía" (2026-10-15): la guía de MercadoEnvíos que trajo Pagos ME, sin
// salir de la lista. A la izquierda el PDF tal cual; a la derecha sus datos como TEXTO (se pueden
// seleccionar y copiar con un clic): guía, destinatario, cédula, teléfono, ciudad y dirección.

interface Datos {
  venta: string; guia: string | null; carrier: string | null; envio: string | null
  destinatario: string | null; documento: string | null; telefono: string | null
  ciudad: string | null; direccion: string | null; remitente: string | null; leida: boolean
}

export function BotonGuia({ pagoId, venta }: { pagoId: number; venta: string }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} title="Ver la guía de MercadoEnvíos de esta venta"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200 hover:bg-violet-50">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" />
        </svg>
        Guía
      </button>
      {abierta && <VerGuia pagoId={pagoId} venta={venta} onCerrar={() => setAbierta(false)} />}
    </>
  )
}

export default function VerGuia({ pagoId, venta, onCerrar }: { pagoId: number; venta: string; onCerrar: () => void }) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const url = `/api/pagos-me/${pagoId}/archivo?tipo=guia`

  useEffect(() => {
    let vivo = true
    fetch(`/api/pagos-me/${pagoId}/guia-datos`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!vivo) return
      if (r.ok) setD(j); else setError(j.error ?? 'No se pudo leer la guía')
    })
    return () => { vivo = false }
  }, [pagoId])

  // Esc cierra solo esta ventana (en captura en window: antes que la de atrás).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCerrar])

  const copiar = async (clave: string, texto: string) => {
    await navigator.clipboard.writeText(texto).catch(() => {})
    setCopiado(clave); setTimeout(() => setCopiado(c => c === clave ? null : c), 1500)
  }

  const filas: [string, string, string | null][] = d ? [
    ['guia', 'Guía', d.guia],
    ['carrier', 'Transportista', [d.carrier, d.envio].filter(Boolean).join(' · ') || null],
    ['destinatario', 'Destinatario', d.destinatario],
    ['documento', 'Cédula / RIF', d.documento],
    ['telefono', 'Teléfono', d.telefono],
    ['ciudad', 'Ciudad', d.ciudad],
    ['direccion', 'Dirección', d.direccion],
  ] : []
  const todo = filas.filter(([, , v]) => v).map(([, k, v]) => `${k}: ${v}`).join('\n')

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }} role="dialog" aria-modal="true" aria-label="Guía de MercadoEnvíos">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-900">Guía de MercadoEnvíos</h3>
            <p className="text-xs text-neutral-500">Venta <span className="font-mono">{venta}</span></p>
          </div>
          <div className="flex items-center gap-1">
            <a href={url} target="_blank" rel="noreferrer" className="btn-ghost !px-2.5 !py-1 text-xs">Abrir PDF ↗</a>
            <button onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[1fr_20rem]">
          {/* El PDF: en el visor del navegador también se puede seleccionar el texto. */}
          <div className="order-2 bg-neutral-100 p-3 md:order-1">
            <iframe src={url} title="Guía" className="h-[55vh] w-full rounded-lg border bg-white md:h-[75vh]" />
          </div>
          <div className="order-1 space-y-3 border-b border-neutral-100 p-4 md:order-2 md:border-b-0 md:border-l">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Datos de la guía</p>
              {todo && (
                <button type="button" onClick={() => copiar('todo', todo)} className="text-xs font-medium text-violet-700 hover:underline">
                  {copiado === 'todo' ? 'Copiado ✓' : 'Copiar todo'}
                </button>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!d && !error && <p className="text-sm text-neutral-400">Leyendo la guía…</p>}
            {d && (
              <dl className="space-y-2">
                {filas.filter(([, , v]) => v).map(([clave, k, v]) => (
                  <div key={clave} className="group rounded-lg bg-neutral-50 px-3 py-2">
                    <dt className="flex items-center justify-between text-[11px] text-neutral-500">
                      {k}
                      <button type="button" onClick={() => copiar(clave, v!)} className="font-medium text-violet-700 opacity-70 hover:opacity-100">
                        {copiado === clave ? 'copiado ✓' : 'copiar'}
                      </button>
                    </dt>
                    <dd className={`select-text break-words text-sm text-neutral-900 ${clave === 'guia' || clave === 'documento' || clave === 'telefono' ? 'font-mono' : ''}`}>{v}</dd>
                  </div>
                ))}
                {!d.leida && (
                  <p className="text-xs text-neutral-500">No se pudieron leer todos los datos de esta guía: míralos en el PDF.</p>
                )}
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
