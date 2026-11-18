'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { precioPack, listaCantidades, type TablasEnvio, TABLAS_DEFAULT } from '@/lib/mlShipping'

// 18-11 (el dueño: un cliente quería 10 bolsas): «Crear pack». Cuando comprando N sueltas se pierde el envío gratis,
// un «Pack xN» a un precio que llega al mínimo de ese peso lo resuelve: el comprador lleva N con 1 clic y con envío
// gratis. El servidor (POST /api/publicaciones/pack) copia la publicación, la deja PAUSADA y la vincula «trae N u.».

const usd = (n: number) => `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const kgTxt = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 3 })} kg`

export default function CrearPack({ item, varianteId, titulo, peso, precio, pierde, disponible, tablas = TABLAS_DEFAULT, onCerrar, onCreado }: {
  item: string; varianteId: string | null; titulo: string | null
  /** Peso de 1 unidad (kg) y precio que paga hoy el comprador por 1 (con la promo si tiene). */
  peso: number; precio: number
  /** Cantidades que hoy quedan sin envío gratis. */
  pierde: number[]
  /** Unidades del producto para publicar (para el stock inicial del pack). */
  disponible: number
  tablas?: TablasEnvio
  onCerrar: () => void; onCreado?: () => void
}) {
  const [n, setN] = useState(pierde[0] ?? 2)
  const pk = useMemo(() => precioPack(peso, precio, n, tablas), [peso, precio, n, tablas])
  const [precioTxt, setPrecioTxt] = useState<string | null>(null)
  const base = (titulo ?? '').replace(/\s+pack\s*x?\s*\d+\s*$/i, '').trim()
  const tituloDe = (k: number) => { const extra = ` Pack X${k}`; return `${base.slice(0, 60 - extra.length).trim()}${extra}` }
  const [tituloTxt, setTituloTxt] = useState<string | null>(null)
  const stockDe = (k: number) => Math.max(1, Math.floor(disponible / k))
  const [stockTxt, setStockTxt] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ item_id: string; pausada: boolean; conDescripcion: boolean } | null>(null)

  const precioPack_ = precioTxt != null ? parseFloat(precioTxt.replace(',', '.')) : Math.ceil(pk.sugerido * 100) / 100
  const bajo = pk.minimo != null && precioPack_ < pk.minimo
  const t = tituloTxt ?? tituloDe(n)
  const stock = stockTxt != null ? parseInt(stockTxt, 10) : stockDe(n)
  const valido = precioPack_ > 0 && !bajo && t.trim().length >= 5 && t.length <= 60 && stock >= 1

  const cambiarN = (k: number) => { setN(k); setPrecioTxt(null); setTituloTxt(null); setStockTxt(null) }
  const crear = async () => {
    setEnviando(true); setError(null)
    try {
      const r = await fetch('/api/publicaciones/pack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, variante_id: varianteId, unidades: n, precio: precioPack_, titulo: t.trim(), stock }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo crear el pack'); return }
      setHecho(d); onCreado?.()
    } catch { setError('Sin conexión. Intenta de nuevo.') } finally { setEnviando(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !enviando) onCerrar() }} role="dialog" aria-modal="true" aria-label="Crear pack">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
          <h3 className="font-semibold text-neutral-900">Crear pack con envío gratis</h3>
          <button onClick={onCerrar} disabled={enviando} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>
        {hecho ? (
          <div className="space-y-3 px-4 py-4 text-sm text-neutral-700">
            <p className="font-medium text-emerald-700">✓ Pack creado en MercadoLibre ({hecho.item_id}){hecho.pausada ? ', pausado para que lo revises' : ''}.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Revisa título, fotos y descripción{hecho.conDescripcion ? '' : ' (la descripción no se copió: ponla)'}.</li>
              <li>Registra el peso del pack (<b>{kgTxt(pk.kg)}</b>) en el portal de MercadoEnvíos.</li>
              <li>Actívalo. Ya está vinculado «trae {n} u.»: cada venta descuenta {n} del inventario.</li>
            </ol>
            <div className="flex justify-end gap-2">
              <button onClick={onCerrar} className="btn-ghost">Cerrar</button>
              <Link href={`/publicaciones/${hecho.item_id}`} className="btn-primary">Abrir el pack →</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Comprando <b>{listaCantidades(pierde)}</b> sueltas queda sin envío gratis (a {usd(precio)} c/u). Un pack lo resuelve:
                el comprador lleva todo con 1 clic y con envío gratis.
              </p>
              <label className="block">
                <span className="text-xs text-neutral-500">Unidades del pack</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {[...new Set([...pierde.slice(0, 8), n])].sort((a, b) => a - b).map(k => (
                    <button key={k} type="button" onClick={() => cambiarN(k)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${k === n ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-300 hover:bg-neutral-50'}`}>
                      x{k}</button>
                  ))}
                  <input inputMode="numeric" aria-label="Otra cantidad" placeholder="otra"
                    onChange={e => { const k = parseInt(e.target.value, 10); if (k >= 2 && k <= 100) cambiarN(k) }}
                    className="w-16 rounded-full border border-neutral-300 px-2 py-1 text-center text-xs" />
                </div>
              </label>
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Pesa <b>{kgTxt(pk.kg)}</b> · envío gratis desde <b>{pk.minimo != null ? usd(pk.minimo) : '—'}</b> · {n} sueltas costarían {usd(pk.sueltas)}
              </div>
              <label className="block">
                <span className="text-xs text-neutral-500">Precio del pack (USD)</span>
                <input inputMode="decimal" value={precioTxt ?? String(precioPack_).replace('.', ',')} onChange={e => setPrecioTxt(e.target.value.replace(/[^\d.,]/g, ''))}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-base tabular-nums sm:text-sm ${bajo ? 'border-red-400 bg-red-50' : 'border-neutral-300'}`} />
                {bajo && <span className="mt-1 block text-xs text-red-700">Por debajo de {usd(pk.minimo!)} el pack queda sin envío gratis.</span>}
                {!bajo && precioPack_ > pk.sueltas + 0.004 && <span className="mt-1 block text-xs text-neutral-500">Sube {usd(precioPack_ - pk.sueltas)} sobre {n} sueltas: es lo que cuesta llegar al envío gratis.</span>}
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Título ({t.length}/60)</span>
                <input value={t} maxLength={60} onChange={e => setTituloTxt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-500">Packs disponibles al crearlo</span>
                <input inputMode="numeric" value={stockTxt ?? String(stock)} onChange={e => setStockTxt(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="mt-1 w-28 rounded-lg border border-neutral-300 px-3 py-2 text-base tabular-nums sm:text-sm" />
                <span className="ml-2 text-xs text-neutral-500">después Stock vs inventario lo reparte</span>
              </label>
              <p className="text-xs text-neutral-500">Se copia la publicación (fotos, categoría, características y descripción) y queda <b>pausada</b> para que la revises.</p>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-4 py-3">
              <button onClick={onCerrar} disabled={enviando} className="btn-ghost">Cancelar</button>
              <button onClick={crear} disabled={!valido || enviando} className="btn-primary disabled:opacity-50">
                {enviando ? 'Creando en MercadoLibre…' : `Crear Pack x${n}`}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
