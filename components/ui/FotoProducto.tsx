'use client'
// Miniatura del producto en todo el inventario (13-11-2026, el dueño, mig. 173). Las fotos se piden UNA vez por página
// (/api/products/fotos, lib/fotosProductos.ts: propia → variante de ML → publicación) y todas las miniaturas las
// comparten. Sin foto: cuadro gris con un ícono («Sin foto» al pasar el mouse). Al tocarla se ve grande.
import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Ventana } from '@/components/ui/Ventana'

let pedido: Promise<void> | null = null
let fotos: Record<number, string> | null = null
const avisar = new Set<() => void>()

function cargar() {
  if (!pedido) pedido = fetch('/api/products/fotos').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((d: Record<number, string>) => { fotos = d; avisar.forEach(f => f()) })
  return pedido
}
const suscribir = (f: () => void) => { avisar.add(f); cargar(); return () => { avisar.delete(f) } }

/** Después de cambiar una foto: se vuelven a pedir todas. */
export function recargarFotos() { pedido = null; return cargar() }

/** La url de la foto de un producto (null = sin foto; undefined = todavía cargando). */
export function useFotoProducto(id: number | null | undefined) {
  const todas = useSyncExternalStore(suscribir, () => fotos, () => null)
  if (!todas) return undefined
  return id ? todas[id] ?? null : null
}

/** La versión grande de una foto de ML (las miniaturas son la -I). */
const grande = (u: string) => u.replace(/-I\.(jpg|webp|png)$/i, '-O.$1')

const TAM = { xs: 'h-7 w-7', sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-24 w-24' } as const

export function FotoProducto({ id, nombre, tam = 'sm', className = '' }: {
  id: number | null | undefined; nombre?: string | null; tam?: keyof typeof TAM; className?: string
}) {
  const url = useFotoProducto(id)
  const [fallo, setFallo] = useState(false)
  const [abierta, setAbierta] = useState(false)
  const caja = `${TAM[tam]} shrink-0 rounded-md border border-neutral-200 bg-white ${className}`
  if (url === undefined) return <span className={`${caja} block bg-neutral-100`} aria-hidden />
  if (!url || fallo) return (
    <span className={`${caja} flex items-center justify-center !bg-neutral-100 text-neutral-300`} title="Sin foto" role="img" aria-label="Sin foto">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-1/2 w-1/2" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /><path d="M3 3l18 18" />
      </svg>
    </span>
  )
  return <>
    <button type="button" onClick={e => { e.stopPropagation(); setAbierta(true) }} className={`${caja} overflow-hidden`} title="Ver foto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nombre ?? ''} loading="lazy" decoding="async" onError={() => setFallo(true)} className="h-full w-full object-contain" />
    </button>
    {abierta && createPortal(
      <div onClick={e => e.stopPropagation()}>
        <Ventana titulo={nombre ?? 'Foto del producto'} onCerrar={() => setAbierta(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande(url)} alt={nombre ?? ''} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg" />
        </Ventana>
      </div>, document.body)}
  </>
}

/** Achica una foto en el navegador antes de subirla (~600 px, JPEG): una de celular pasa de 3–5 MB a ~60 KB. */
export async function achicarFoto(archivo: File, lado = 600): Promise<string> {
  const img = await createImageBitmap(archivo)
  const k = Math.min(1, lado / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

/** Ficha del producto: la foto grande con «Cambiar foto» (sube una propia) y «Usar la de ML» (si tiene propia). */
export function FotoEditable({ id, nombre, puedeCambiar }: { id: number; nombre?: string | null; puedeCambiar: boolean }) {
  const url = useFotoProducto(id)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const propia = !!url && url.startsWith('/api/products/')
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return
    setOcupado(true); setError(null)
    try {
      const imagen = await achicarFoto(archivo)
      const r = await fetch(`/api/products/${id}/foto`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagen }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error ?? 'No se pudo subir la foto')
      else await recargarFotos()
    } catch { setError('No se pudo leer esa imagen') }
    setOcupado(false)
  }
  const usarML = async () => {
    setOcupado(true); setError(null)
    const r = await fetch(`/api/products/${id}/foto`, { method: 'DELETE' }).catch(() => null)
    if (!r?.ok) setError('No se pudo quitar la foto'); else await recargarFotos()
    setOcupado(false)
  }
  return (
    <div className="flex items-center gap-3">
      <FotoProducto id={id} nombre={nombre} tam="lg" />
      {puedeCambiar && (
        <div className="space-y-1 text-xs">
          <label className={`btn-secondary inline-block cursor-pointer text-xs ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
            {ocupado ? 'Guardando…' : url ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" accept="image/*" className="hidden" disabled={ocupado} onChange={e => { subir(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {propia && <button type="button" onClick={usarML} disabled={ocupado} className="block text-neutral-500 underline hover:text-neutral-800">Usar la de MercadoLibre</button>}
          {!propia && url && <p className="text-neutral-400">Foto de MercadoLibre</p>}
          {error && <p className="text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
