'use client'
// Ficha de la publicación (2026-10-14): al tocar el producto en Preguntas o Mensajes se abre encima,
// sin salir de la pantalla, como se ve en MercadoLibre: fotos, precio, stock, variantes,
// características y descripción. Se lee de ML al abrirla (/api/preguntas/publicacion).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { createPortal } from 'react-dom'
import { puede } from '@/lib/permisos'
import CambiarStock from './CambiarStock'
import type { Ficha } from '@/app/api/preguntas/publicacion/route'

const dinero = (n: number, moneda: string) =>
  `${moneda === 'COP' ? '$' : moneda === 'VES' ? 'Bs' : 'US$'} ${n.toLocaleString('de-DE', moneda === 'COP' ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Variante a resaltar al abrir (17-10): la agotada desde Stock ("Esta se agotó"), la comprada desde Mensajes. */
export interface MarcaVariante { id: string | number; texto: string; tono: 'rojo' | 'verde' }

/** Envuelve lo que abre la ficha (foto, título): un botón sin estilo propio. */
export function AbrirFicha({ item, children, className = '', title = 'Ver la publicación', marcar }: { item: string; children: ReactNode; className?: string; title?: string; marcar?: MarcaVariante | null }) {
  const [abierta, setAbierta] = useState(false)
  return <>
    <button type="button" onClick={() => setAbierta(true)} title={title} className={`text-left ${className}`}>{children}</button>
    {abierta && <FichaPublicacion item={item} marcar={marcar} onCerrar={() => setAbierta(false)} />}
  </>
}

export function FichaPublicacion({ item, onCerrar, marcar }: { item: string; onCerrar: () => void; marcar?: MarcaVariante | null }) {
  const [f, setF] = useState<Ficha | { error: string } | null>(null)
  const [foto, setFoto] = useState(0)
  // Con muchas fotos (hasta 60), la miniatura de la foto mostrada se trae a la vista en la tira.
  const tira = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = tira.current, b = t?.children[foto] as HTMLElement | undefined
    if (t && b) t.scrollTo({ left: b.offsetLeft - (t.clientWidth - b.clientWidth) / 2, behavior: 'smooth' })
  }, [foto])
  // Variante que se tocó para ver su foto (marco gris). Antes se marcaba la de la foto mostrada y, al abrir,
  // parecía "elegida" la de la primera foto (17-10: se confundía con la agotada).
  const [tocada, setTocada] = useState<number | null>(null)
  const [desc, setDesc] = useState(false)
  // Cambiar stock desde la ficha (21-10, ventana CambiarStock), solo con el permiso; al guardar se relee la ficha.
  const { data: ses } = useSession()
  const puedeStock = !!ses?.user && puede(ses.user, 'reponer_stock')
  const [stock, setStock] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vivo = true
    fetch(`/api/preguntas/publicacion?item=${item}`)
      .then(async r => {
        const d = await r.json().catch(() => ({ error: 'No se pudo leer' }))
        if (!vivo) return
        setF(r.ok ? d : { error: d.error ?? 'No se pudo leer' })
        // Con una variante a resaltar: arranca en su foto, si tiene.
        const v = r.ok && marcar ? (d as Ficha).variantes?.find(x => x.id === String(marcar.id)) : null
        if (v?.foto != null) setFoto(v.foto)
      })
      .catch(() => vivo && setF({ error: 'Sin conexión' }))
    return () => { vivo = false }
  }, [item, recarga])

  const n = f && !('error' in f) ? f.fotos.length : 0
  useEffect(() => {
    // En captura en window (antes que los de document) y sin propagar: Esc cierra solo la ficha, no la
    // ventana de atrás (Nueva venta, "Lo que se habló" de Por confirmar, que escuchan en document).
    const tecla = (e: KeyboardEvent) => {
      // Con la ventana de stock abierta encima, las teclas son de ella (Esc la cierra a ella, no a la ficha).
      if (stock) return
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onCerrar() }
      else if (e.key === 'ArrowRight' && n > 1) setFoto(i => (i + 1) % n)
      else if (e.key === 'ArrowLeft' && n > 1) setFoto(i => (i - 1 + n) % n)
    }
    window.addEventListener('keydown', tecla, true)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla, true); document.body.style.overflow = antes }
  }, [n, onCerrar, stock])

  // Portal al body: encima de cualquier ventana (p. ej. Nueva venta), sin heredar su posición.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={e => { e.stopPropagation(); onCerrar() }} role="dialog" aria-modal="true" aria-label="Publicación">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
          <span className="font-mono text-xs text-neutral-400">{item}</span>
          {f && !('error' in f) && f.ejemplo && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Datos de ejemplo (staging)</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {f && !('error' in f) && (
              <a href={f.link} target="_blank" rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-full border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:border-neutral-500 hover:text-neutral-900">
                Abrir en MercadoLibre ↗
              </a>
            )}
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800">
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
        </div>

        {!f ? <Cargando />
          : 'error' in f ? <p className="px-5 py-10 text-center text-sm text-red-600">{f.error}</p>
          : (
          <div className="overflow-y-auto">
            <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* Fotos */}
              <div className="min-w-0">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-white">
                  {f.fotos.length
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.fotos[foto]} alt={f.titulo} className="h-full w-full object-contain" />
                    : <span className="text-sm text-neutral-400">Sin fotos</span>}
                  {n > 1 && <>
                    <Flecha lado="izq" onClick={() => setFoto(i => (i - 1 + n) % n)} />
                    <Flecha lado="der" onClick={() => setFoto(i => (i + 1) % n)} />
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white tabular-nums">{foto + 1} / {n}</span>
                  </>}
                </div>
                {n > 1 && (
                  <div ref={tira} className="relative mt-2 flex gap-1.5 overflow-x-auto pb-1">
                    {f.fotos.map((u, i) => (
                      <button key={i} type="button" onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-white ${i === foto ? 'border-neutral-800 ring-2 ring-neutral-300' : 'border-neutral-200 hover:border-neutral-400'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" loading="lazy" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Datos */}
              <div className="min-w-0 space-y-4">
                <div>
                  <p className="text-xs text-neutral-500">
                    {[f.condicion, f.vendidos != null && `${f.vendidos.toLocaleString('de-DE')} vendidos`].filter(Boolean).join(' · ')}
                    {f.estado && f.estado !== 'active' && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">{f.estado === 'paused' ? 'Pausada' : f.estado === 'closed' ? 'Finalizada' : f.estado}</span>}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold leading-snug text-neutral-900">{f.titulo}</h2>
                </div>
                {f.precio != null && (
                  <div>
                    {f.precio_original && f.precio_original > f.precio && (
                      <p className="text-sm text-neutral-400 line-through tabular-nums">{dinero(f.precio_original, f.moneda)}</p>
                    )}
                    <p className="flex items-baseline gap-2">
                      <span className="text-3xl font-light text-neutral-900 tabular-nums">{dinero(f.precio, f.moneda)}</span>
                      {f.precio_original && f.precio_original > f.precio && (
                        <span className="text-sm font-medium text-emerald-600">{Math.round((1 - f.precio / f.precio_original) * 100)}% OFF</span>
                      )}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-medium ${f.disponible > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                    {f.disponible > 0 ? `${f.disponible} disponibles` : 'Sin stock'}
                    {puedeStock && (
                      <button type="button" onClick={() => setStock(true)} title="Cambiar stock en MercadoLibre" aria-label="Cambiar stock en MercadoLibre"
                        className="-mr-1 ml-1 rounded-full px-1 opacity-60 hover:bg-black/5 hover:opacity-100">✎</button>
                    )}
                  </span>
                  {stock && <CambiarStock item={item} variante={marcar ? String(marcar.id) : null} origen="ficha"
                    onCerrar={() => setStock(false)} onGuardado={() => setRecarga(n => n + 1)} />}
                  {/* Con peso: el envío gratis real a este precio (19-10); sin peso, lo que dice ML. */}
                  {f.envio ? (
                    f.envio.estado === 'ambas' ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Envío gratis</span>
                    : f.envio.estado === 'tealca' ? <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800" title="El precio no llega al mínimo de ZOOM para su peso">Envío gratis solo TEALCA</span>
                    : f.envio.unidades ? <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800" title="A 1 unidad el precio no llega al mínimo de su peso: cobro a destino">Envío gratis desde {f.envio.unidades} u.</span>
                    : <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700" title="El precio no llega al mínimo de su peso: cobro a destino">Sin envío gratis</span>
                  ) : f.envio_gratis && <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Envío gratis</span>}
                  {f.garantia && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700">{f.garantia}</span>}
                </div>
                {f.variantes.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Variantes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {f.variantes.map((v, i) => {
                        const marcada = !!marcar && v.id === String(marcar.id)
                        const tono = marcada ? (marcar!.tono === 'rojo' ? 'border-red-500 bg-red-50 ring-2 ring-red-200' : 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200')
                          : tocada === i ? 'border-neutral-400 bg-neutral-100' : 'border-neutral-200'   // gris suave (18-10): no compite con la roja ni la verde
                        return (
                          <button key={i} type="button" disabled={v.foto == null} onClick={() => { if (v.foto != null) { setFoto(v.foto); setTocada(i) } }}
                            title={v.foto != null ? 'Ver la foto de esta variante' : 'Esta variante no tiene foto propia'}
                            className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${tono} ${v.foto != null ? 'hover:border-neutral-400' : 'cursor-default'}`}>
                            {marcada && <span className={`mb-0.5 block text-[10px] font-semibold uppercase ${marcar!.tono === 'rojo' ? 'text-red-700' : 'text-emerald-700'}`}>{marcar!.texto}</span>}
                            <span className="block font-medium text-neutral-900">{v.nombre}</span>
                            <span className={v.stock > 0 ? 'text-neutral-500' : 'text-red-600'}>{v.stock > 0 ? `${v.stock} disp.` : 'Sin stock'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {f.atributos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Características</p>
                    <dl className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-100 text-sm">
                      {f.atributos.map((a, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-3 py-1.5 odd:bg-neutral-50/70">
                          <dt className="text-neutral-500">{a.nombre}</dt>
                          <dd className="break-words text-neutral-900">{a.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            </div>

            {/* Descripción: completa, plegada si es larga. */}
            <div className="border-t border-neutral-100 px-4 py-4 sm:px-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Descripción</p>
              {f.descripcion ? <>
                <p className={`whitespace-pre-line break-words text-sm leading-relaxed text-neutral-800 ${desc ? '' : 'line-clamp-[12]'}`}>{f.descripcion}</p>
                {f.descripcion.split('\n').length > 12 || f.descripcion.length > 900
                  ? <button type="button" onClick={() => setDesc(x => !x)} className="mt-2 text-sm font-medium text-sky-700 hover:underline underline-offset-2">
                      {desc ? 'Ver menos' : 'Ver descripción completa'}
                    </button>
                  : null}
              </> : <p className="text-sm text-neutral-400">Esta publicación no tiene descripción.</p>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Flecha({ lado, onClick }: { lado: 'izq' | 'der'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={lado === 'izq' ? 'Foto anterior' : 'Foto siguiente'}
      className={`absolute top-1/2 -translate-y-1/2 ${lado === 'izq' ? 'left-2' : 'right-2'} inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow ring-1 ring-black/5 hover:bg-white`}>
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={lado === 'izq' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
      </svg>
    </button>
  )
}

function Cargando() {
  return (
    <div className="grid gap-5 p-5 md:grid-cols-2" aria-label="Leyendo de MercadoLibre">
      <div className="aspect-square animate-pulse rounded-xl bg-neutral-100" />
      <div className="space-y-3">
        <div className="h-4 w-1/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-6 w-5/6 animate-pulse rounded bg-neutral-100" />
        <div className="h-9 w-1/2 animate-pulse rounded bg-neutral-100" />
        <p className="pt-2 text-xs text-neutral-400">Leyendo de MercadoLibre…</p>
      </div>
    </div>
  )
}

/** "Ver ME ↗": la venta en el portal de MercadoEnvíos (VE), con un clic. Solo un enlace. */
export function VerME({ orden, className = '' }: { orden: string | number; className?: string }) {
  const { data } = useSession()
  if (data?.user?.country === 'CO' || !/^\d{10,}$/.test(String(orden))) return null
  return (
    <a href={`https://www.mercadoenvios.com.ve/vendedor/orden/${orden}`} target="_blank" rel="noreferrer"
      title="Ver esta venta en MercadoEnvíos" onClick={e => e.stopPropagation()}
      className={`inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-yellow-300 bg-yellow-50 px-2 text-[11px] font-semibold text-yellow-900 hover:border-yellow-400 hover:bg-yellow-100 ${className}`}>
      Ver ME <span aria-hidden="true">↗</span>
    </a>
  )
}
