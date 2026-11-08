'use client'
import { useMemo, useRef, useState } from 'react'

// Catálogo PDF (08-11): arma una hoja A4 con logo, nombre, fotos y precios (o sin precios) de los productos elegidos.
// «Guardar PDF» abre la impresión del navegador (Guardar como PDF): sale liviano y se manda por WhatsApp.
export interface ProductoCatalogo { id: number; code: string; name: string; stock: number; final: number; base: number; venta: number; foto: string | null }
export interface AjustesCatalogo { logo: string | null; nombre: string; subtitulo: string; pie: string; precio: 'final' | 'base' | 'venta' | 'ninguno'; columnas: number; codigo: boolean }

const POR_DEFECTO: AjustesCatalogo = { logo: null, nombre: '', subtitulo: '', pie: '', precio: 'final', columnas: 3, codigo: false }

/** Achica el logo a 400 px como máximo (queda un data URL chico para guardar). */
function achicar(file: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/png'))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => mal(new Error('No se pudo leer la imagen'))
    img.src = URL.createObjectURL(file)
  })
}

export default function CatalogoClient({ productos, ajustes, pais, verBase }: { productos: ProductoCatalogo[]; ajustes: AjustesCatalogo | null; pais: 'VE' | 'CO'; verBase: boolean }) {
  const [a, setA] = useState<AjustesCatalogo>({ ...POR_DEFECTO, ...(pais === 'CO' ? { precio: 'venta' } : {}), ...ajustes })
  const [q, setQ] = useState('')
  const [conStock, setConStock] = useState(true)
  const [conFoto, setConFoto] = useState(false)
  const [elegidos, setElegidos] = useState<Set<number>>(() => new Set(productos.filter(p => p.stock > 0).map(p => p.id)))
  const [guardado, setGuardado] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)

  const precioDe = (p: ProductoCatalogo) => a.precio === 'final' ? p.final : a.precio === 'base' ? p.base : a.precio === 'venta' ? p.venta : 0
  const moneda = pais === 'CO' && a.precio === 'venta' ? 'COP' : 'USD'
  const fmt = (n: number) => moneda === 'COP' ? `$ ${n.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` : `$ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return productos.filter(p => (!conStock || p.stock > 0) && (!conFoto || p.foto) && (!t || p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t)))
  }, [productos, q, conStock, conFoto])
  const enHoja = productos.filter(p => elegidos.has(p.id))
  const todosVisibles = visibles.length > 0 && visibles.every(p => elegidos.has(p.id))
  const marcar = (id: number) => setElegidos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const marcarVisibles = () => setElegidos(s => { const n = new Set(s); visibles.forEach(p => todosVisibles ? n.delete(p.id) : n.add(p.id)); return n })

  const guardarAjustes = async (nuevo: AjustesCatalogo) => {
    const r = await fetch('/api/catalogo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevo) })
    setGuardado(r.ok ? 'Guardado: la próxima vez sale igual.' : 'No se pudo guardar')
  }
  const subirLogo = async (f: File | undefined) => {
    if (!f) return
    try { const logo = await achicar(f); setA(x => ({ ...x, logo })) } catch { setGuardado('No se pudo leer el logo') }
    if (logoInput.current) logoInput.current.value = ''
  }
  const cambiar = (x: Partial<AjustesCatalogo>) => { setA(v => ({ ...v, ...x })); setGuardado(null) }
  const cols = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[a.columnas] ?? 'grid-cols-3'

  return (
    <div className="space-y-4">
      <style>{`@media print {
        @page { size: A4; margin: 10mm }
        body * { visibility: hidden !important }
        #catalogo-hoja, #catalogo-hoja * { visibility: visible !important }
        #catalogo-hoja { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important }
        .cat-item { break-inside: avoid }
      }`}</style>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr] print:hidden">
        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-neutral-900">Cómo se ve</h2>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-lg border border-neutral-200 bg-neutral-50 grid place-items-center overflow-hidden">
              {a.logo ? <img src={a.logo} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-neutral-400">Logo</span>}
            </div>
            <div className="flex flex-col gap-1 text-xs">
              <button type="button" onClick={() => logoInput.current?.click()} className="px-2 py-1 rounded border border-neutral-300">{a.logo ? 'Cambiar logo' : 'Subir logo'}</button>
              {a.logo && <button type="button" onClick={() => cambiar({ logo: null })} className="text-red-600">Quitar</button>}
            </div>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => subirLogo(e.target.files?.[0])} />
          </div>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Nombre del negocio</span>
            <input value={a.nombre} maxLength={80} onChange={e => cambiar({ nombre: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Debajo del nombre (opcional)</span>
            <input value={a.subtitulo} maxLength={120} onChange={e => cambiar({ subtitulo: e.target.value })} placeholder="Ej: Catálogo noviembre 2026" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Al final (contacto, condiciones)</span>
            <textarea rows={3} value={a.pie} maxLength={500} onChange={e => cambiar({ pie: e.target.value })} placeholder="Ej: Pedidos por WhatsApp 0414… · Envíos a todo el país" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Precio</span>
              <select value={a.precio} onChange={e => cambiar({ precio: e.target.value as AjustesCatalogo['precio'] })} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm bg-white">
                <option value="ninguno">Sin precio</option>
                {pais === 'VE' && <option value="final">Precio final (USD)</option>}
                {pais === 'VE' && verBase && <option value="base">Precio base (USD)</option>}
                <option value="venta">{pais === 'CO' ? 'Precio de venta (pesos)' : 'Precio de venta (inventario)'}</option>
              </select></label>
            <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Por fila</span>
              <select value={a.columnas} onChange={e => cambiar({ columnas: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm bg-white">
                <option value={2}>2 (grandes)</option><option value={3}>3</option><option value={4}>4 (chicas)</option>
              </select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.codigo} onChange={e => cambiar({ codigo: e.target.checked })} /> Mostrar el código del producto</label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" onClick={() => window.print()} disabled={!enHoja.length} className="btn-primary text-sm">Guardar PDF ({enHoja.length})</button>
            <button type="button" onClick={() => guardarAjustes(a)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Recordar estos datos</button>
          </div>
          <p className="text-[11px] text-neutral-500">Al tocar «Guardar PDF» elige <b>Guardar como PDF</b> en «Destino». Si no salen las fotos, marca «Gráficos de fondo» en Más opciones.</p>
          {guardado && <p className="text-xs text-neutral-600">{guardado}</p>}
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto o código" className="flex-1 min-w-[180px] rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={conStock} onChange={e => setConStock(e.target.checked)} /> Solo con stock</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={conFoto} onChange={e => setConFoto(e.target.checked)} /> Solo con foto</label>
          </div>
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={todosVisibles} onChange={marcarVisibles} /> Elegir los {visibles.length} de la lista</label>
            <span>{enHoja.length} en el catálogo · <button type="button" onClick={() => setElegidos(new Set())} className="text-sky-700 hover:underline">ninguno</button></span>
          </div>
          <ul className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
            {visibles.map(p => (
              <li key={p.id}>
                <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => marcar(p.id)} />
                  <span className="w-8 h-8 shrink-0 rounded bg-neutral-50 border border-neutral-200 overflow-hidden">{p.foto && <img src={p.foto} alt="" className="w-full h-full object-contain" />}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-neutral-400 num">{p.stock} u.</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-neutral-400">La foto sale de la publicación de MercadoLibre vinculada al producto (Publicaciones → Vincular).</p>
        </section>
      </div>

      {/* La hoja (lo que sale en el PDF) */}
      <div id="catalogo-hoja" className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 mx-auto max-w-[210mm] text-neutral-900">
        <header className="flex items-center gap-4 border-b border-neutral-200 pb-3 mb-4">
          {a.logo && <img src={a.logo} alt="" className="h-16 w-auto object-contain" />}
          <div>
            <h1 className="text-2xl font-bold leading-tight">{a.nombre || 'Mi negocio'}</h1>
            {a.subtitulo && <p className="text-sm text-neutral-600">{a.subtitulo}</p>}
          </div>
        </header>
        {!enHoja.length ? <p className="text-sm text-neutral-400 text-center py-10">Elige productos de la lista.</p> : (
          <div className={`grid ${cols} gap-3`}>
            {enHoja.map(p => (
              <div key={p.id} className="cat-item rounded-lg border border-neutral-200 p-2 flex flex-col">
                <div className="aspect-square rounded bg-white grid place-items-center overflow-hidden">
                  {p.foto ? <img src={p.foto} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-neutral-300">Sin foto</span>}
                </div>
                <p className={`mt-1.5 font-medium leading-snug ${a.columnas >= 4 ? 'text-[11px]' : 'text-sm'}`}>{p.name}</p>
                {a.codigo && <p className="text-[10px] text-neutral-500">{p.code}</p>}
                {a.precio !== 'ninguno' && precioDe(p) > 0 && <p className={`mt-auto pt-1 font-bold ${a.columnas >= 4 ? 'text-sm' : 'text-base'}`}>{fmt(precioDe(p))}</p>}
              </div>
            ))}
          </div>
        )}
        {a.pie && <footer className="mt-4 border-t border-neutral-200 pt-3 text-sm text-neutral-700 whitespace-pre-wrap">{a.pie}</footer>}
      </div>
    </div>
  )
}
